import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {install} from '../lib/ux-repair02-ui.mjs';
import {speechNameLayoutCases,speechNameLongTexts,speechNameSource,speechNamePositions} from '../fixtures/speech-name-layout.mjs';
import {verifySpeechNameLayoutObserved,verifySpeechNameLayoutReport} from '../lib/speech-name-layout-contract.mjs';
const require=createRequire(import.meta.url),[chrome,out='audit-evidence/speech-name-layout.json']=process.argv.slice(2),product=currentProductFile(),output=path.resolve(out),dir=output+'.artifacts';
fs.mkdirSync(dir,{recursive:true});
const inputs=snapshot(product),report={schema:'akari-speech-name-layout-v1',status:'RUNNING',snapshot:inputs,environment:{browser:null,playwright:require('playwright/package.json').version,os:process.platform},classification:'automated UI evidence; no child comprehension or independent UX acceptance claim',pageErrors:[],networkRequests:[],results:[]};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const settle=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const metrics=p=>p.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,outerWidth,outerHeight,visualScale:visualViewport.scale}));
let serial=0;
async function prepare(p,c){
 await install(p,'',{mode:'code'});const name='話者名05-'+(++serial),positions=c.positions||speechNamePositions;
 const file=await p.evaluate(({name,positions,source,longTexts,kind})=>{const q=structuredClone(Akari.app.project);q.name=name;q.components.forEach((n,i)=>Object.assign(n,positions[i]));q.scripts=kind==='short'?[{id:'main',targetId:'sprite-1',event:'start',source}]:q.components.map((n,i)=>({id:'long-'+i,targetId:n.id,event:'start',source:Akari.formatExpression({kind:'StringLiteral',value:longTexts[i]})+'と10秒話す。'}));return Akari.serializeProject(q,Akari.app.assetStore);},{name,positions,source:speechNameSource,longTexts:speechNameLongTexts,kind:c.kind});
 await p.locator('#fileInput').setInputFiles({name:'speech-name05.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});await p.waitForFunction(n=>Akari.app.project.name===n,name);
 if(await p.locator('#sourceOverview').isVisible())await p.locator('#sourceEditBtn').click();
}
async function setView(p,c){
 if(c.nativeZoom){await p.locator('#stageZoomFit').click();await settle(p);return;}
 await p.setViewportSize({width:c.width,height:c.height});
 if(c.scale%10===0){await p.locator('#stageZoomReset').click();const selector=c.scale<100?'#stageZoomOut':'#stageZoomIn';for(let n=0;n<Math.abs(c.scale-100)/10;n++)await p.locator(selector).click();}
 else{const target=c.scale+20;let lo=650,hi=1250,found=false;for(let i=0;i<15&&lo<=hi;i++){const height=Math.round((lo+hi)/2);await p.setViewportSize({width:1180,height});await p.locator('#stageZoomFit').click();await settle(p);const n=parseInt(await p.locator('#stageZoomReset').textContent());if(n===target){found=true;break;}if(n<target)lo=height+1;else hi=height-1;}assert.equal(found,true,'requested fit percentage reachable');await p.locator('#stageZoomOut').click();await p.locator('#stageZoomOut').click();await p.setViewportSize({width:c.width,height:c.height});}
 assert.equal(parseInt(await p.locator('#stageZoomReset').textContent()),c.scale);
}
async function bubbles(p){return p.locator('.sprite-bubble').evaluateAll(bs=>bs.map(b=>{
 const f=document.querySelector('#formSurface'),fr=f.getBoundingClientRect(),sx=fr.width/f.clientWidth,sy=fr.height/f.clientHeight,css=getComputedStyle(b),heading=getComputedStyle(b,'::before'),t=b.querySelector('.sprite-bubble-text'),range=new Range();range.selectNodeContents(t);
 const measure=document.createElement('span');Object.assign(measure.style,{position:'fixed',visibility:'hidden',whiteSpace:'pre',font:heading.font,letterSpacing:heading.letterSpacing});measure.textContent=b.dataset.speaker;document.body.append(measure);const unwrappedWidth=measure.getBoundingClientRect().width*sx;measure.remove();
 const rect=b.getBoundingClientRect(),left=rect.left+((parseFloat(css.paddingLeft)||0)+(parseFloat(css.borderLeftWidth)||0))*sx,top=rect.top+((parseFloat(css.paddingTop)||0)+(parseFloat(css.borderTopWidth)||0))*sy,width=parseFloat(heading.width)*sx,height=parseFloat(heading.height)*sy;
 return{id:b.dataset.runtimeId,speaker:b.dataset.speaker,text:t.textContent,rect:rect.toJSON(),stage:fr.toJSON(),textBox:t.getBoundingClientRect().toJSON(),ink:range.getBoundingClientRect().toJSON(),clipped:t.scrollHeight>t.clientHeight+1||t.scrollWidth>t.clientWidth+1,font:parseFloat(css.fontSize)*sx,full:!b.querySelector('[data-speech-full]').hidden,heading:{font:parseFloat(heading.fontSize)*sx,lineHeight:parseFloat(heading.lineHeight)*sy,minHeight:(parseFloat(heading.minHeight)||0)*sy,width,height,unwrappedWidth,rect:{left,top,right:left+width,bottom:top+height}}};
}));}
async function tabTo(p,selector){for(let i=0;i<100;i++){if(await p.locator(selector).evaluate(n=>n===document.activeElement))return;await p.keyboard.press('Tab');}throw Error('Keyboard cannot reach '+selector);}
async function reachShortBubbles(p){
 const rows=[];
 for(const id of ['sprite-1','dango']){
  let current=(await bubbles(p)).find(b=>b.id===id);
  const clip=await p.locator('.designer-wrap').evaluate(n=>{const r=n.getBoundingClientRect();return{left:Math.max(0,r.left),top:Math.max(0,r.top),right:Math.min(innerWidth,r.right),bottom:Math.min(innerHeight,r.bottom)};});
  const inside=r=>r.left>=clip.left-1&&r.top>=clip.top-1&&r.right<=clip.right+1&&r.bottom<=clip.bottom+1;
  let input='already-visible';
  if(!inside(current.heading.rect)||!inside(current.ink)){
   const x=(clip.left+clip.right)/2,y=(clip.top+clip.bottom)/2;
   await p.mouse.move(x,y);await p.mouse.wheel((current.rect.left+current.rect.right)/2-x,(current.rect.top+current.rect.bottom)/2-y);await settle(p);
   current=(await bubbles(p)).find(b=>b.id===id);input='pointer-wheel';
  }
  rows.push({id,input,heading:current.heading.rect,ink:current.ink,clip});
 }
 return rows;
}
async function dialog(p){return p.evaluate(()=>{
 const element=s=>{const n=document.querySelector(s),r=new Range();r.selectNodeContents(n);return{rect:n.getBoundingClientRect().toJSON(),ink:r.getBoundingClientRect().toJSON(),font:parseFloat(getComputedStyle(n).fontSize),clientWidth:n.clientWidth,clientHeight:n.clientHeight,scrollWidth:n.scrollWidth,scrollHeight:n.scrollHeight};},m=document.querySelector('#valueModal'),e=document.querySelector('#valueOutput'),r=new Range();r.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(r);
 return{title:document.querySelector('#valueTitle').textContent,text:e.textContent,selected:getSelection().toString(),labelledby:m.getAttribute('aria-labelledby'),titleBox:element('#valueTitle'),bodyBox:element('#valueOutput'),closeBox:element('#valueClose'),dialog:m.querySelector('.dialog').getBoundingClientRect().toJSON(),viewport:{left:0,top:0,right:innerWidth,bottom:innerHeight}};
});}
function hooks(p){p.setDefaultTimeout(8000);p.on('dialog',d=>d.accept());p.on('pageerror',e=>report.pageErrors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url());});}
async function observe(p,c,row,nativeZoom=null){
 hooks(p);if(!c.nativeZoom)await p.setViewportSize({width:c.width,height:c.height});await prepare(p,c);await setView(p,c);
 await p.evaluate(()=>{window.speechNameEvents=[];new MutationObserver(rs=>{for(const r of rs)for(const[kind,nodes]of[['add',r.addedNodes],['remove',r.removedNodes]])for(const n of nodes)if(n.nodeType===1&&n.matches('.sprite-bubble'))speechNameEvents.push({kind,id:n.dataset.runtimeId,text:n.querySelector('.sprite-bubble-text').textContent,at:performance.now()});}).observe(document.querySelector('#formSurface'),{childList:true});});
 await p.locator('#runBtn').click();await p.waitForFunction(()=>document.querySelectorAll('.sprite-bubble').length===2);
 const o={fixtureSetup:'internal serialization; UI file import',interaction:'real pointer and keyboard',viewport:await p.evaluate(()=>({width:innerWidth,height:innerHeight})),scale:parseInt(await p.locator('#stageZoomReset').textContent()),positions:await p.evaluate(()=>Akari.app.project.components.map(c=>({x:c.x,y:c.y}))),mascots:await p.evaluate(()=>Akari.app.project.components.map(c=>({id:c.id,width:c.w,height:c.h,scale:c.scalePercent}))),source:await p.evaluate(()=>Akari.app.project.scripts[0].source),bubbles:await bubbles(p)};
 row.observed=o;row.screenshot=path.join(dir,c.id.replaceAll('/','-')+'.png');await p.screenshot({path:row.screenshot});
 if(c.kind==='short'){o.reachability=await reachShortBubbles(p);await p.waitForFunction(()=>document.querySelectorAll('.sprite-bubble').length===0,null,{timeout:4000});o.events=await p.evaluate(()=>speechNameEvents);}
 else{o.lengths=speechNameLongTexts.map(t=>Array.from(t).length);o.readingFixtureSeconds=10;o.openings=[];for(const[i,id]of['sprite-1','dango'].entries()){const selector=`.sprite-bubble[data-runtime-id="${id}"] [data-speech-full]`,input=i===0?'pointer':'keyboard';if(input==='pointer')await p.locator(selector).click();else{await tabTo(p,selector);await p.keyboard.press('Enter');}await p.locator('#valueModal.show').waitFor();const d={input,...await dialog(p)};await p.screenshot({path:path.join(dir,c.id.replaceAll('/','-')+'-'+id+'.png')});await p.keyboard.press('Escape');d.closed=!(await p.locator('#valueModal').isVisible());o.openings.push(d);}}
 if(nativeZoom)o.nativeZoom={...nativeZoom,after:await metrics(p)};
 verifySpeechNameLayoutObserved(c.id,o);await p.locator('#stopBtn').click();return o;
}
async function run(c,operation){const row={id:c.id,status:'RUNNING'};report.results.push(row);try{row.observed=await operation(row);row.status='PASS';}catch(e){row.status='FAIL';row.error=e.stack;}save();console.log(row.status+' '+c.id);}
try{
 await withBrowser(chrome,async browser=>{report.environment.browser=browser.version();for(const c of speechNameLayoutCases.filter(c=>!c.nativeZoom))await run(c,row=>pageFor(browser,product,p=>observe(p,c,row)));},360000);
 // Use Chrome's own appearance control. CSS zoom, CDP page scale, and device emulation are not used.
 const {chromium}=require('playwright'),profile=path.join(dir,'native-zoom-profile');
 const context=await chromium.launchPersistentContext(profile,{executablePath:chrome,headless:true,viewport:null,timeout:15000,args:['--allow-file-access-from-files','--disable-background-networking','--window-size=1180,757']});
 try{const settings=await context.newPage();await settings.goto('chrome://settings/appearance');const before=await metrics(settings);await settings.locator('select#zoomLevel').selectOption('1.25');const setting=await settings.locator('select#zoomLevel').inputValue();await settings.close();
  for(const c of speechNameLayoutCases.filter(c=>c.nativeZoom))await run(c,async row=>{const p=await context.newPage();try{await p.route(/^https?:/,route=>{report.networkRequests.push(route.request().url());return route.abort();});await p.goto(pathToFileURL(path.resolve(product)).href);await p.waitForFunction(()=>!!globalThis.Akari?.app);return await observe(p,c,row,{method:'Chrome appearance page select#zoomLevel',setting,ratio:1.25,before});}finally{await p.close();}});
 }finally{await context.close();}
}catch(e){report.hostFailure=e.stack;}
report.endSnapshot=snapshot(product);report.status=!report.hostFailure&&report.results.length===speechNameLayoutCases.length&&report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';
if(report.status==='PASS'){try{verifySpeechNameLayoutReport(report,inputs);}catch(e){report.status='FAIL';report.hostFailure=e.stack;}}
save();if(report.status!=='PASS')process.exitCode=1;
