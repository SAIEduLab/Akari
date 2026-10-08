import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {withBrowser,pageFor,snapshot,sha} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {install} from '../lib/ux-repair02-ui.mjs';
import {observeRunPreview,verifyRunPreview,observePaletteFold,observeInspector} from '../lib/run-preview-contract.mjs';
import {displayTexts,actionNames,bubbleCases,actionCases,verifyDisplay} from '../lib/speech-display-contract.mjs';

const require=createRequire(import.meta.url),[chrome,output]=process.argv.slice(2),product=currentProductFile();
assert.ok(chrome&&output);const dir=path.resolve(output+'.artifacts');assert.ok(!fs.existsSync(output)&&!fs.existsSync(dir),'fresh output required');fs.mkdirSync(dir,{recursive:true});
const report={schema:'akari-speech-display-v1',status:'RUNNING',snapshot:snapshot(product),browser:null,playwright:require('playwright/package.json').version,platform:process.platform,pageErrors:[],networkRequests:[],results:[],artifacts:[]};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const register=name=>{const bytes=fs.readFileSync(path.join(dir,name));report.artifacts.push({name,sha256:sha(bytes)});};
const frame=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function shot(p,name){const c=await p.context().newCDPSession(p);try{fs.writeFileSync(path.join(dir,name),Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'));register(name);}finally{await c.detach();}}
const hookedPages=new WeakSet();
const pageAtWidth=(browser,width,fn)=>pageFor({newContext:options=>browser.newContext({...options,viewport:{width,height:848}})},product,fn);
async function waitForZoomApi(worker){const deadline=Date.now()+8000;while(!await worker.evaluate(()=>!!globalThis.chrome?.tabs?.query)){if(Date.now()>deadline)throw Error('native zoom API unavailable');await delay(50);}}
function hooks(p){if(hookedPages.has(p))return;hookedPages.add(p);p.setDefaultTimeout(8000);p.on('dialog',d=>d.accept());p.on('pageerror',e=>report.pageErrors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url());});}
async function showProperty(p,label){const field=p.locator('#properties input[aria-label="'+label+'"]');if(!await field.isVisible())await p.locator('.properties-window .blockui-side-toggle').click();await field.scrollIntoViewIfNeeded();return field;}
async function setNames(p,show){await p.locator('#objectSelect').selectOption('stage');await (await showProperty(p,'名前を表示')).setChecked(show);await p.locator('#objectSelect').selectOption('sprite-1');}
async function fixture(p,{show=true,kind='short',mode='code',level='advanced',untimed=false}={}){
  hooks(p);const texts=displayTexts[kind],seconds=kind==='short'?2:10;
  await install(p,untimed?'「一」と言う。\n1秒待つ。\n「二」と言う。\n3秒待つ。':'「'+texts[0]+'」と'+seconds+'秒話す。',
    {mode,level,extraScripts:untimed?[]:[{id:'second-speech',targetId:'dango',event:'start',source:'「'+texts[1]+'」と'+seconds+'秒話す。'}]});
  await setNames(p,show);await frame(p);
}
async function scale(p,value){await p.locator('#stageZoomReset').click();for(let n=0;n<Math.abs(value-100)/10;n++)await p.locator(value<100?'#stageZoomOut':'#stageZoomIn').click();assert.equal(parseInt(await p.locator('#stageZoomReset').textContent()),value);await frame(p);}
async function readBubbles(p){return p.evaluate(()=>{
  const f=document.querySelector('#formSurface'),stage=f.getBoundingClientRect(),sx=stage.width/f.clientWidth;
  return{stage:stage.toJSON(),bubbles:[...f.querySelectorAll('.sprite-bubble')].map(b=>{
    const t=b.querySelector('.sprite-bubble-text'),full=b.querySelector('[data-speech-full]'),heading=getComputedStyle(b,'::before'),range=new Range();range.selectNodeContents(t);
    return{id:b.dataset.runtimeId,speaker:b.dataset.speaker,text:t.textContent,rect:b.getBoundingClientRect().toJSON(),ink:range.getBoundingClientRect().toJSON(),font:parseFloat(getComputedStyle(b).fontSize)*sx,headingVisible:heading.display!=='none',headingContent:heading.content,textVisible:getComputedStyle(t).display!=='none',clipped:t.scrollHeight>t.clientHeight+1||t.scrollWidth>t.clientWidth+1,full:!full.hidden,fullBox:full.getBoundingClientRect().toJSON()};
  })};
});}
async function speech(p,kind='short'){
  await p.locator('#runBtn').click();await p.waitForFunction(()=>document.querySelectorAll('.sprite-bubble').length===2);await frame(p);const o=await readBubbles(p);
  if(kind==='long')for(const b of o.bubbles)if(b.full){await p.locator(`.sprite-bubble[data-runtime-id="${b.id}"] [data-speech-full]`).click();b.openedText=await p.locator('#valueOutput').textContent();await p.locator('#valueClose').click();}
  return o;
}
async function rename(p,name){await p.locator('#objectSelect').selectOption('sprite-1');const input=await showProperty(p,'名前');await input.fill(name);await input.press('Tab');await p.waitForFunction(name=>Akari.app.project.components.find(c=>c.id==='sprite-1').name===name,name);}
async function actions(p){
  const source=await p.evaluate(()=>JSON.stringify(Akari.app.project.scripts)),a=p.locator('.prop-actions');await a.scrollIntoViewIfNeeded();await frame(p);
  const o=await a.evaluate(e=>{const title=e.querySelector('strong'),range=new Range();range.selectNodeContents(title);const css=getComputedStyle(title);return{actions:e.getBoundingClientRect().toJSON(),title:title.getBoundingClientRect().toJSON(),name:title.textContent,ink:[...range.getClientRects()].map(r=>r.toJSON()),ellipsis:css.textOverflow==='ellipsis',nowrap:css.whiteSpace==='nowrap',buttons:[...e.querySelectorAll('button')].map(b=>({text:b.textContent,rect:b.getBoundingClientRect().toJSON()}))};});
  await a.locator('.prop-duplicate').click();await p.waitForFunction(()=>Akari.app.project.components.length===3);o.copyCount=await p.evaluate(()=>Akari.app.project.components.length);
  await p.locator('.prop-actions .prop-delete').click();await p.waitForFunction(()=>Akari.app.project.components.length===2);o.deleteCount=await p.evaluate(()=>Akari.app.project.components.length);o.originalName=await p.evaluate(()=>Akari.app.project.components.find(c=>c.id==='sprite-1').name);o.sourcePreserved=source===await p.evaluate(()=>JSON.stringify(Akari.app.project.scripts));return o;
}
async function download(p,button,name){const pending=p.waitForEvent('download');await p.locator(button).click();await (await pending).saveAs(path.join(dir,name));register(name);return path.join(dir,name);}
async function run(id,fn){const r={id,status:'RUNNING'};report.results.push(r);try{r.observed=await fn();r.status='PASS';}catch(e){r.status='FAIL';r.error=e.stack;save();throw e;}save();console.log('PASS '+id);}
fs.copyFileSync(product,path.join(dir,'candidate.html'));register('candidate.html');save();
try{
 await withBrowser(chrome,async browser=>{
  report.browser=browser.version();
  await run('DISPLAY-SETTINGS',async()=>{
   const initial=await pageFor(browser,product,async p=>{hooks(p);const model=await p.evaluate(()=>Akari.makeEmptyProject().stage.showSpeechNames);await p.locator('#objectSelect').selectOption('stage');return{model,checkbox:await (await showProperty(p,'名前を表示')).isChecked()};});
   const rows=[];for(const mode of ['code','blocks'])for(const level of ['basic','advanced'])rows.push(await pageAtWidth(browser,1180,async p=>{
    await fixture(p,{mode,level});await scale(p,100);const source=await p.evaluate(()=>JSON.stringify(Akari.app.project.scripts)),history=[];
    await setNames(p,false);history.push(await p.evaluate(()=>Akari.app.project.stage.showSpeechNames));await p.locator('#undoBtn').click();history.push(await p.evaluate(()=>Akari.app.project.stage.showSpeechNames));await p.locator('#redoBtn').click();history.push(await p.evaluate(()=>Akari.app.project.stage.showSpeechNames));
    const off=await speech(p),preview=await observeRunPreview(p);await shot(p,'preview-'+mode+'-'+level+'.png');preview.inspector=await observeInspector(p,mode);await shot(p,'inspector-'+mode+'-'+level+'.png');
    await p.locator('#pauseBtn').click();preview.paused=await p.evaluate(()=>Akari.app.editorState.state);
    await p.locator('#stepBtn').click();preview.afterStep=await p.evaluate(()=>Akari.app.editorState.state);
    await p.locator('#continueBtn').click();preview.resumed=await p.evaluate(()=>Akari.app.editorState.state);
    await p.locator('#runtimeInspectorClose').click();preview.inspector.closed=!await p.locator('#runtimeInspector').evaluate(n=>n.open);preview.inspector.modeControlsReturned=await p.locator('.menutool #editorModecode').isVisible();
    await p.locator('#stopBtn').click();preview.stopped=await observeRunPreview(p);verifyRunPreview(preview,mode,level);const paletteFold=mode==='blocks'?await observePaletteFold(p,()=>shot(p,'folded-'+level+'.png')):null;await setNames(p,true);history.push(await p.evaluate(()=>Akari.app.project.stage.showSpeechNames));const on=await speech(p);await p.locator('#stopBtn').click();return{mode,level,history,off,on,preview,paletteFold,sourcePreserved:source===await p.evaluate(()=>JSON.stringify(Akari.app.project.scripts))};
   }));return{initial,rows};
  });
  await run('DISPLAY-PERSISTENCE',async()=>{
   const rows=[];for(const show of [false,true])rows.push(await pageFor(browser,product,async p=>{
    await fixture(p,{show});const source=await p.evaluate(()=>JSON.stringify(Akari.app.project.scripts)),suffix=show?'on':'off',saved=await download(p,'#saveBtn','saved-'+suffix+'.md');
    await p.locator('#newBtn').click();await p.locator('#fileInput').setInputFiles(saved);await p.waitForFunction(()=>Akari.app.project.name==='操作契約02');const loaded=await p.evaluate(()=>Akari.app.project.stage.showSpeechNames);
    const html=await download(p,'#exportBtn','player-'+suffix+'.html'),context=await browser.newContext({offline:true});let player;
    try{await context.route(/^https?:/,r=>{report.networkRequests.push(r.request().url());return r.abort();});const p=await context.newPage();hooks(p);await p.goto(pathToFileURL(html).href);await p.locator('#playerStart:not([disabled])').click();await p.waitForFunction(()=>document.querySelectorAll('.sprite-bubble').length===2);player=await readBubbles(p);await shot(p,'player-'+suffix+'.png');await p.locator('#playerStop').click();}finally{await context.close();}
    await setNames(p,!show);await setNames(p,show);await p.waitForFunction(()=>document.querySelector('#autosaveState').textContent==='自動保存：済み',null,{timeout:12000});await p.reload();await p.locator('#recoveryRestore').click();await p.waitForFunction(()=>!document.querySelector('#recoveryModal').classList.contains('show'));const restored=await p.evaluate(()=>Akari.app.project.stage.showSpeechNames),recovered=await speech(p);await p.locator('#stopBtn').click();return{show,loaded,restored,player,recovered,sourcePreserved:source===await p.evaluate(()=>JSON.stringify(Akari.app.project.scripts))};
   }));return rows;
  });
  await run('DISPLAY-BUBBLES',async()=>{const rows=[];for(const [i,c]of bubbleCases.entries())rows.push(await pageAtWidth(browser,c.width,async p=>{await fixture(p,c);await scale(p,c.scale);const geometry=await speech(p,c.kind);await shot(p,'bubbles-'+i+'.png');await p.locator('#stopBtn').click();return{id:c.id,geometry};}));return rows;});
  await run('DISPLAY-DURATION',async()=>{const rows=[];for(const show of [false,true])rows.push(await pageFor(browser,product,async p=>{
   await fixture(p,{show});await p.evaluate(()=>{globalThis.displayEvents=[];globalThis.displayObserver=new MutationObserver(rs=>{for(const r of rs)for(const[kind,nodes]of[['add',r.addedNodes],['remove',r.removedNodes]])for(const n of nodes)if(n.matches?.('.sprite-bubble'))displayEvents.push({kind,id:n.dataset.runtimeId,at:performance.now()});});displayObserver.observe(document.querySelector('#formSurface'),{childList:true});});await p.locator('#runBtn').click();await p.waitForFunction(()=>displayEvents.filter(e=>e.kind==='remove').length===2);const events=await p.evaluate(()=>{displayObserver.disconnect();return displayEvents;});await p.locator('#stopBtn').click();
   await fixture(p,{show,untimed:true});await p.locator('#runBtn').click();await p.waitForFunction(()=>document.querySelector('.sprite-bubble-text')?.textContent==='一');const untimedFirst=await p.locator('.sprite-bubble-text').textContent();await p.waitForFunction(()=>document.querySelector('.sprite-bubble-text')?.textContent==='二');const untimedSecond=await p.locator('.sprite-bubble-text').textContent();await p.waitForTimeout(250);const untimedLater=await p.locator('.sprite-bubble-text').textContent();await p.locator('#stopBtn').click();return{show,events,untimedFirst,untimedSecond,untimedLater,afterStop:await p.locator('.sprite-bubble').count()};
  }));return rows;});
  await run('DISPLAY-OBJECT-NAMES',async()=>{const rows=[];for(const [i,c]of actionCases.entries())rows.push(await pageAtWidth(browser,c.width,async p=>{await fixture(p,c);await rename(p,c.name);const geometry=await actions(p);await shot(p,'objects-'+i+'.png');return{id:c.id,geometry};}));return rows;});
 },600000);
 await run('DISPLAY-NATIVE-ZOOM',async()=>{
  const rows=[];for(const mode of ['code','blocks'])for(const requested of [1.25,2]){
   const extension=fs.mkdtempSync(path.join(dir,'zoom-extension-')),profile=fs.mkdtempSync(path.join(dir,'zoom-profile-'));fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Local display audit zoom',version:'1.0',permissions:['tabs'],background:{service_worker:'worker.js'}}));fs.writeFileSync(path.join(extension,'worker.js'),'chrome.runtime.onInstalled.addListener(()=>{});');
   const {chromium}=require('playwright'),context=await chromium.launchPersistentContext(profile,{executablePath:chrome,headless:true,viewport:null,offline:true,timeout:15000,ignoreDefaultArgs:['--disable-extensions'],args:['--allow-file-access-from-files','--disable-background-networking','--window-size=1366,848','--disable-extensions-except='+extension,'--load-extension='+extension]});
   try{await context.route(/^https?:/,r=>{report.networkRequests.push(r.request().url());return r.abort();});const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:10000}),p=context.pages()[0];await p.goto(pathToFileURL(path.resolve(product)).href);await p.waitForFunction(()=>!!globalThis.Akari?.app);await fixture(p,{mode});await rename(p,actionNames[1]);const metrics=()=>p.evaluate(()=>({outerWidth,innerWidth,dpr:devicePixelRatio})),before=await metrics();
    await waitForZoomApi(worker);
    const actual=await worker.evaluate(async requested=>{const tab=(await chrome.tabs.query({})).find(t=>t.url?.startsWith('file:'));if(!tab)throw Error('local product tab missing');await chrome.tabs.setZoom(tab.id,requested);return chrome.tabs.getZoom(tab.id);},requested);await p.waitForFunction(({dpr,requested})=>Math.abs(devicePixelRatio/dpr-requested)<.02,{dpr:before.dpr,requested});await frame(p);const after=await metrics(),geometry=await actions(p);await shot(p,'zoom-'+rows.length+'.png');rows.push({mode,requested,actual,before,after,geometry});
   }finally{await context.close();}
  }return rows;
 });
 await run('DISPLAY-INVALID',()=>withBrowser(chrome,browser=>pageFor(browser,product,p=>p.evaluate(()=>{const rows=[];for(const value of [null,0,1,'false',[],{}]){const q=Akari.makeEmptyProject(),data=Akari.packExecutable(q,Akari.makeDefaultAssetStore());q.stage.showSpeechNames=value;data.project.stage.showSpeechNames=value;let design='',runtime='';try{Akari.validateProject(q);}catch(e){design=e.code;}try{Akari.restoreExecutable(data);}catch(e){runtime=e.code;}rows.push(design+'/'+runtime);}const malformedStages=[];for(const stage of [null,undefined]){const q=Akari.makeEmptyProject(),data=Akari.packExecutable(q,Akari.makeDefaultAssetStore());q.stage=stage;data.project.stage=stage;let design='',runtime='';try{Akari.validateProject(q);}catch(e){design=e.code;}try{Akari.restoreExecutable(data);}catch(e){runtime=e.code;}malformedStages.push(design+'/'+runtime);}return{settings:rows,malformedStages};}))));
 report.status='PASS';verifyDisplay(report,snapshot(product),dir);
}catch(e){report.status='FAIL';report.hostFailure=e.stack;process.exitCode=1;}
save();console.log(report.status);if(report.hostFailure)console.error(report.hostFailure);
