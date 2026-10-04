import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {searchLayoutSizes,searchLayoutSamples,searchLayoutSource,verifySearchLayoutReport,verifySearchLayoutObservation} from '../lib/search-layout-contract.mjs';

const require=createRequire(import.meta.url),[chrome,out]=process.argv.slice(2);
if(!chrome||!out)throw Error('Usage: search-layout-browser.mjs <browser> <report>');
const output=path.resolve(out),product=currentProductFile(),artifacts=output+'.artifacts',started=performance.now();
if(fs.existsSync(output)||fs.existsSync(artifacts))throw Error('A fresh report and artifacts path is required');
fs.mkdirSync(artifacts,{recursive:true});
const report={schema:'akari-search-layout-v1',status:'RUNNING',snapshot:snapshot(product),uxAcceptance:false,
  environment:{browser:null,playwright:require('playwright/package.json').version},
  execution:{platform:process.platform,node:process.version,headless:true,zoomViewport:'native browser window; viewport:null',zoomControl:'test-only chrome.tabs extension'},
  startedAt:new Date().toISOString(),pageErrors:[],networkRequests:[],screenshots:[],results:[]};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const capture=async(p,name)=>{await p.screenshot({path:path.join(artifacts,name)});report.screenshots.push(name);};
const frame=p=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const rootFor=callable=>callable?'#callableBlocks':'#blockEditor';
const state=(p,callable)=>p.evaluate(callable=>{const session=Akari.app.editorState[callable?'draft':'main'];return{project:structuredClone(Akari.app.project),source:session.sourceText,history:Akari.app.editorState.history,waits:(session.syntaxAst?.body||[]).filter(n=>n.kind==='WaitTime').map(n=>({seconds:n.seconds?.value?.value??n.seconds?.value}))};},callable);
function listen(p){p.setDefaultTimeout(8000);p.on('dialog',d=>d.accept());p.on('pageerror',e=>report.pageErrors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url());});}
async function fixture(p,callable=false){
  const file=await p.evaluate(source=>{const project=Akari.makeEmptyProject();project.name='検索欄の検証';project.scripts=[{id:'search-main',targetId:'sprite-1',event:'start',source}];return Akari.serializeProject(project,Akari.app.assetStore);},searchLayoutSource);
  await p.locator('#fileInput').setInputFiles({name:'search-layout.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});
  await p.waitForFunction(()=>Akari.app.project.name==='検索欄の検証');await p.locator('#uiLevel').selectOption('advanced');await p.locator('#objectSelect').selectOption('sprite-1');await p.locator('#eventSelect').selectOption('start');
  if(await p.locator('#sourceOverview').isVisible())await p.locator('#sourceEditBtn').click();await p.locator('#editorModeblocks').click();
  if(callable){await p.locator('#procBtn').click();await p.locator('#callableName').fill('検索の手順');await p.locator('#callableModecode').click();await p.locator('#callableCode').fill(searchLayoutSource);await p.locator('#callableCode').press('Tab');await p.locator('#callableModeblocks').click();}
  await frame(p);
}
async function measure(p,root){
  await p.locator(root+' [data-blockui-search]').scrollIntoViewIfNeeded();await frame(p);
  return p.evaluate(({root,samples})=>{const block=document.querySelector(root),input=block.querySelector('[data-blockui-search]'),label=input.labels?.[0],controls=block.querySelector('.blockui-palette-controls'),scope=block.querySelector('.blockui-search-scope'),summary=block.querySelector('.blockui-palette-options summary'),mode=block.querySelector('[data-blockui-palette-mode]'),options=summary.parentElement;
    const rect=e=>e?.getBoundingClientRect().toJSON()||{width:0,height:0,left:0,right:0,top:0,bottom:0},style=getComputedStyle(input),hit=e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));};
    const textRange=document.createRange(),labelText=label&&[...label.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());if(labelText)textRange.selectNode(labelText);
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d');context.font=style.font;
    const clipped=e=>e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1||getComputedStyle(e).visibility!=='visible';
    return{viewport:{width:innerWidth,height:innerHeight},input:rect(input),controls:rect(controls),summary:rect(summary),scope:rect(scope),mode:rect(mode),labelRect:labelText?textRange.getBoundingClientRect().toJSON():rect(null),label:label?.textContent.trim()||'',labelCount:input.labels?.length||0,
      accessibleName:input.getAttribute('aria-label'),fontSize:parseFloat(style.fontSize),labelFontSize:label?parseFloat(getComputedStyle(label).fontSize):0,
      contentWidth:input.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),samples:samples.map(text=>({text,width:context.measureText(text).width})),
      value:input.value,inputHit:hit(input),labelHit:label?hit(label):false,summaryText:summary.textContent.trim(),summaryFontSize:parseFloat(getComputedStyle(summary).fontSize),summaryAfter:getComputedStyle(summary,'::after').content,
      summaryClipped:clipped(summary),scopeText:scope.textContent,scopeFontSize:parseFloat(getComputedStyle(scope).fontSize),scopeClipped:clipped(scope),optionsExpanded:options.open};
  },{root,samples:searchLayoutSamples});
}
async function reach(p,ids){const out={};for(const id of ids){const locator=p.locator('#'+id);await locator.scrollIntoViewIfNeeded();await frame(p);out[id]=await locator.evaluate(e=>{const r=e.getBoundingClientRect();return{rect:r.toJSON(),viewport:{width:innerWidth,height:innerHeight},hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});}return out;}
async function exercise(p,callable=false,imagePrefix,observe){
  const root=rootFor(callable),search=p.locator(root+' [data-blockui-search]'),summary=p.locator(root+' .blockui-palette-options summary'),o={before:await state(p,callable),initial:await measure(p,root)};
  observe(o);
  await capture(p,imagePrefix+'-initial.png');
  await search.click();o.keyboard={inputFocused:await search.evaluate(e=>document.activeElement===e)};await p.keyboard.insertText('時間を待つ');o.queried=await measure(p,root);
  await capture(p,imagePrefix+'-queried.png');
  o.matches=await p.locator(root+' [data-blockui-schema]').evaluateAll(es=>es.map(e=>e.dataset.blockuiSchema));await search.press('Tab');o.keyboard.tabReachedSummary=await summary.evaluate(e=>document.activeElement===e);
  await p.keyboard.press('Enter');o.keyboard.enterOpened=await summary.evaluate(e=>e.parentElement.open);o.optionsOpen=await measure(p,root);
  await capture(p,imagePrefix+'-options-open.png');
  await summary.press('Enter');o.keyboard.enterClosed=await summary.evaluate(e=>!e.parentElement.open);await summary.press('Shift+Tab');o.keyboard.shiftTabReturned=await search.evaluate(e=>document.activeElement===e);
  await p.locator(root+' [data-blockui-category="control"]').click();o.category={scope:await p.locator(root+' .blockui-search-scope').innerText(),pressed:await p.locator(root+' [data-blockui-category="control"]').getAttribute('aria-pressed'),query:await search.inputValue()};
  await search.click();await search.press('ControlOrMeta+A');await search.press('Backspace');o.cleared=await search.inputValue();await p.keyboard.insertText('時間を待つ');o.insertionQuery=await search.inputValue();o.afterSearch=await state(p,callable);o.projectAfterSearch=o.afterSearch.project;
  const candidate=p.locator(root+' [data-blockui-schema="WaitTime"]').first();let reached=false;for(let i=0;i<45;i++){await p.keyboard.press('Tab');if(await candidate.evaluate(e=>document.activeElement===e)){reached=true;break;}}if(!reached)throw Error('Keyboard could not reach the searched candidate');
  await p.keyboard.press('Enter');o.keyboard.candidateEntered=true;await frame(p);o.inserted=await state(p,callable);
  const number=p.locator(root+' .blockui-workspace input[data-blockui-field="value"][inputmode="decimal"]').first();
  await number.click();await number.press('ControlOrMeta+A');await number.press('Backspace');await p.keyboard.insertText('0.1');await number.press('Tab');await frame(p);o.after=await state(p,callable);
  await p.keyboard.press('ControlOrMeta+z');o.undoEdit=await state(p,callable);await p.keyboard.press('ControlOrMeta+z');o.undo=await state(p,callable);
  await p.keyboard.press('ControlOrMeta+Shift+z');o.redoInsert=await state(p,callable);await p.keyboard.press('ControlOrMeta+Shift+z');o.redo=await state(p,callable);
  o.reachable=await reach(p,callable?['callableSave','callableSaveProject','procClose','callableModecode','callableModeblocks']:['runBtn','stopBtn','saveBtn','editorModecode','editorModeblocks']);
  if(callable){
    await number.fill('－');await number.press('Tab');
    await p.locator('#callableModecode').click();await frame(p);
    o.pendingCancel={value:await number.inputValue(),shown:await p.locator('#callablePending').isVisible(),blocksRetained:await p.locator('#callableModeblocks').getAttribute('aria-pressed')};
    await capture(p,imagePrefix+'-pending-cancel.png');
    Object.assign(o.reachable,await reach(p,['callableCancel']));
    await p.locator('#callableCancel').click();o.cancelled=await state(p,true);
  }
  return o;
}
async function run(id,fn){const row={id,status:'RUNNING'};report.results.push(row);try{row.observed=await fn(row);verifySearchLayoutObservation(id,row.observed);row.status='PASS';}catch(error){row.status='FAIL';row.error=error.stack;}save();console.log(row.status+' '+id);}
save();
try{
  await withBrowser(chrome,async browser=>{report.environment.browser=browser.version();
    for(const [width,height]of searchLayoutSizes)await run(`main/${width}x${height}`,row=>pageFor(browser,product,async p=>{listen(p);await p.setViewportSize({width,height});await fixture(p);return{viewport:{width,height},...await exercise(p,false,`main-${width}x${height}`,o=>row.observed=Object.assign(o,{viewport:{width,height}}))};}));
    for(const [width,height]of [[1188,848],[390,844]])await run(`callable/${width}x${height}`,row=>pageFor(browser,product,async p=>{listen(p);await p.setViewportSize({width,height});await fixture(p,true);return{viewport:{width,height},...await exercise(p,true,`callable-${width}x${height}`,o=>row.observed=Object.assign(o,{viewport:{width,height}}))};}));
  },180000);
  await run('browser-zoom/125-percent',async row=>{
    const extension=fs.mkdtempSync(path.join(artifacts,'zoom-extension-')),profile=fs.mkdtempSync(path.join(artifacts,'zoom-profile-'));
    fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Local audit zoom controller',version:'1.0',permissions:['tabs'],background:{service_worker:'worker.js'}}));
    fs.writeFileSync(path.join(extension,'worker.js'),'chrome.runtime.onInstalled.addListener(()=>{});');
    const {chromium}=require('playwright'),context=await chromium.launchPersistentContext(profile,{executablePath:chrome,headless:true,viewport:null,offline:true,timeout:15000,ignoreDefaultArgs:['--disable-extensions'],args:['--allow-file-access-from-files','--disable-background-networking','--window-size=1188,848','--disable-extensions-except='+extension,'--load-extension='+extension]});
    const deadline=setTimeout(()=>context.close().catch(()=>{}),Math.max(1,180000-(performance.now()-started)));
    try{await context.route(/^https?:/,route=>{report.networkRequests.push(route.request().url());return route.abort();});const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:10000}),p=context.pages()[0];listen(p);await p.goto(pathToFileURL(path.resolve(product)).href);await p.waitForFunction(()=>!!globalThis.Akari?.app);await fixture(p);
      const read=()=>p.evaluate(()=>({outerWidth,outerHeight,innerWidth,innerHeight,dpr:devicePixelRatio,visualScale:visualViewport.scale,cssZoom:getComputedStyle(document.documentElement).zoom,project:structuredClone(Akari.app.project)})),before=await read();
      const actual=await worker.evaluate(async()=>{const tab=(await chrome.tabs.query({})).find(t=>t.url?.startsWith('file:'));if(!tab)throw Error('Local product tab missing');await chrome.tabs.setZoom(tab.id,1.25);return chrome.tabs.getZoom(tab.id);});await p.waitForFunction(()=>devicePixelRatio>1.1);await frame(p);const after=await read();
      const observed=row.observed={method:'chrome.tabs.setZoom / fresh local extension / native browser window',requested:1.25,actual,before,after};
      observed.exercise=await exercise(p,false,'browser-zoom125',o=>observed.exercise=o);return observed;
    }finally{clearTimeout(deadline);await context.close();}
  });
}catch(error){report.hostFailure=error.stack;}
report.status=!report.hostFailure&&report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';
if(report.status==='PASS')try{verifySearchLayoutReport(report);}catch(error){report.status='FAIL';report.contractFailure=error.stack;}
report.completedAt=new Date().toISOString();report.durationMs=Math.round(performance.now()-started);
save();if(report.status!=='PASS')process.exitCode=1;
