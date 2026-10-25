import {projectAction} from '../lib/project-actions.cjs';
import {verifySampleCatalog,verifySampleRuntime} from '../lib/samples-node-checks.mjs';
import U from '../browser/cases/ui-routes.cjs';
import {openPaletteTools} from '../browser/cases/regression-setup.cjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {currentProductFile} from '../lib/product-path.cjs';
import {pressStop} from '../lib/stop-press.cjs';
import {snapshot,sha,withBrowser,pageFor} from '../lib/product-test-host.mjs';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {samplesFeature,sampleTestIds,sampleExpected,verifySamples} from '../lib/samples-contract.mjs';
import {browserEnvironment} from '../lib/browser-environment.mjs';
import {chooseView,shownView} from '../browser/cases/view-toggle.cjs';
// The one view toggle (final call 22): a press only when the other view is on the screen, then the view asked for shows.
const showMode=async(page,mode)=>{await chooseView(page,mode);assert.equal(await shownView(page),mode,'the '+mode+' view shows');};
const require=createRequire(import.meta.url),[chrome,outputArg]=process.argv.slice(2),output=path.resolve(outputArg),dir=output.replace(/\.json$/,'')+'.artifacts',product=currentProductFile();
fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(product,path.join(dir,'candidate.html'));
const inputs=snapshot(product),A=loadApi(fs.readFileSync(product,'utf8')),plain=x=>JSON.parse(JSON.stringify(x));
const report={schema:'akari-samples-evidence-v1',status:'RUNNING',snapshot:inputs,environment:{browser:null,playwright:require('playwright/package.json').version},pageErrors:[],networkRequests:[],results:[],artifacts:[]};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
async function row(id,fn){const result={id,status:'RUNNING'};report.results.push(result);try{await fn();result.status='PASS';result.observed=sampleExpected[id];}catch(e){result.status='FAIL';result.error=e.stack;console.error(e.stack);}save();console.log(result.status+' '+id);}
await row('SAMPLES-CATALOG',()=>verifySampleCatalog(A,fs.readFileSync(product,'utf8')));
await row('SAMPLES-RUNTIME',()=>verifySampleRuntime(A));
const fingerprint=page=>page.evaluate(()=>{
 const editor=JSON.parse(JSON.stringify(Akari.app.editorState));
 // captureEditorState() refreshes the cached caret/scroll view when the open
 // request checks unsaved work. Observe those same live DOM values before and
 // after the request, without flushing, committing, or changing editor state.
 for(const [key,selector,blockRoot]of [['main','#codeEditor','#blockEditor'],['draft','#callableCode','#callableBlocks']]){
  const session=editor[key],textarea=document.querySelector(selector);
  if(session?.mode==='code'&&textarea){
   session.codeSelection={start:textarea.selectionStart,end:textarea.selectionEnd,direction:textarea.selectionDirection};
   session.scrollState={...session.scrollState,codeTop:textarea.scrollTop,codeLeft:textarea.scrollLeft};
  }
  // Block view caches these fields in its asynchronous workspace scroll event.
  // Read the same live scroll position at both boundaries; retain zoom, page,
  // collapse state and every other editor field, and still reject actual scroll.
  const workspace=document.querySelector(blockRoot+' .blockui-workspace');
  if(session?.mode==='blocks'&&workspace){
   session.scrollState={...session.scrollState,blockTop:workspace.scrollTop,blockLeft:workspace.scrollLeft};
  }
 }
 return{project:JSON.stringify(Akari.app.project),editor,source:document.querySelector('#codeEditor').value};
});
async function picker(page){await page.locator('#sampleBtn').click();if(await page.locator('#loseConfirmModal.show').isVisible())await page.locator('#loseConfirmProceed').click();assert.equal(await page.locator('#samplePicker').evaluate(e=>e.open),true);}
async function open(page,id){await picker(page);await page.locator('#samplePicker [data-sample-id="'+id+'"]').click();await page.waitForFunction(name=>Akari.app.project.name===name,samplesFeature.names[samplesFeature.ids.indexOf(id)]);assert.equal(await page.locator('#samplePicker').evaluate(e=>e.open),false);}
const metadata=id=>A.sampleCatalog().find(x=>x.id===id);
async function source(page){return page.evaluate(()=>Akari.app.editorState.main.sourceText);}
async function command(page,node,action){await U.nodeAction(node,action);}
async function checkHistory(page,before){const after=await source(page);assert.notEqual(after,before);await page.locator('#undoBtn').click();assert.equal(await source(page),before);await page.locator('#redoBtn').click();assert.equal(await source(page),after);await page.locator('#undoBtn').click();return after;}
try{await withBrowser(chrome,async browser=>{
 report.environment.browser=browser.version();assert.equal(browser.version(),browserEnvironment.version);assert.equal(report.environment.playwright,browserEnvironment.playwright);
 // The product asks one question before unsaved work is replaced (#loseConfirmModal). The steps answer it themselves:
 // picker() goes on, and the checks about the question press やめる; no handler answers it for them.
 const test=(id,fn)=>row(id,()=>pageFor(browser,product,async page=>{page.setDefaultTimeout(10000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url());});await page.setViewportSize({width:1366,height:900});try{return await fn(page);}catch(e){await page.screenshot({path:path.join(dir,'failure-'+id+'.png')}).catch(()=>{});throw e;}}));
 await test('SAMPLES-CHOICE-CONFIRM',async page=>{
  const original=await fingerprint(page);await page.locator('#sampleBtn').click();assert.equal(await page.locator('#loseConfirmModal.show').isVisible(),false);assert.equal(await page.locator('#samplePicker').evaluate(e=>e.open),true);assert.deepEqual(await fingerprint(page),original);await page.locator('#samplePickerClose').click();assert.deepEqual(await fingerprint(page),original);
  await page.locator('#sampleBtn').click();await page.keyboard.press('Escape');assert.deepEqual(await fingerprint(page),original);assert.equal(await page.locator('#samplePicker').evaluate(e=>e.open),false);
  for(const level of ['basic','advanced'])for(const mode of ['code','blocks'])for(const id of samplesFeature.ids){await page.locator('#uiLevel').selectOption(level);await showMode(page,mode);await open(page,id);assert.equal(await page.locator('#uiLevel').inputValue(),level);assert.equal(await shownView(page),mode);assert.equal(await page.locator('#objectSelect').inputValue(),metadata(id).targetId);assert.equal(await page.locator('#eventSelect').inputValue(),metadata(id).event);}
 });
 await test('SAMPLES-CANCEL-PENDING',async page=>{
  await open(page,'flower');await page.locator('#uiLevel').selectOption('advanced');await showMode(page,'code');await page.locator('#codeEditor').fill('たくどんは書きかけの');await page.waitForTimeout(400);const code=await fingerprint(page);await page.locator('#sampleBtn').click();assert.equal(await page.locator('#loseConfirmModal.show').isVisible(),true);await page.locator('#loseConfirmCancel').click();assert.deepEqual(await fingerprint(page),code);await page.locator('#sampleBtn').click();await page.keyboard.press('Escape');assert.deepEqual(await fingerprint(page),code);
  await open(page,'flower');await showMode(page,'blocks');
  const number=page.locator('#blockEditor .blockui-node[data-schema-id="NumberLiteral"] input[data-blockui-field="value"]').first();
  const twoFrames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const trace=async phase=>{
   const observation=await page.evaluate(()=>{
    const workspace=document.querySelector('#blockEditor .blockui-workspace'),outside=document.querySelector('#editorPending'),inside=document.querySelector('#blockEditor .blockui-message'),pending=Akari.app.editorState.main.pendingEdit;
    return{scroll:{top:workspace.scrollTop,left:workspace.scrollLeft},cachedScroll:Akari.app.editorState.main.scrollState,
     workspace:workspace.getBoundingClientRect().toJSON(),outsideDiagnostic:{hidden:outside.hidden,text:outside.textContent,rect:outside.getBoundingClientRect().toJSON()},
     inlineDiagnostic:{text:inside.textContent,role:inside.getAttribute('role'),rect:inside.getBoundingClientRect().toJSON()},
     pending:JSON.parse(JSON.stringify(pending)),focus:{id:document.activeElement?.id,field:document.activeElement?.dataset?.blockuiField},confirmation:document.querySelector('#loseConfirmModal').classList.contains('show'),picker:document.querySelector('#samplePicker').open};
   });
   report.diagnostics??={};report.diagnostics.cancelPendingBlock??=[];report.diagnostics.cancelPendingBlock.push({phase,...observation});save();return observation;
  };
  await number.fill('bad');await number.press('Enter');await trace('after-invalid-enter');
  await twoFrames();const settled=await trace('after-input-two-frames');
  await twoFrames();const baseline=await trace('after-input-four-frames');
  assert.deepEqual(baseline.scroll,settled.scroll,'input-induced scrolling settled before opening');assert.deepEqual(baseline.workspace,settled.workspace,'input-induced layout settled before opening');
  const block=await fingerprint(page);
  await page.locator('#sampleBtn').click();assert.equal(await page.locator('#loseConfirmModal.show').isVisible(),true);await trace('after-open');await twoFrames();await trace('after-open-two-frames');
  await page.locator('#loseConfirmCancel').click();await trace('after-confirm-cancel');await twoFrames();await trace('after-confirm-cancel-two-frames');
  assert.deepEqual(await fingerprint(page),block);assert.equal(await number.inputValue(),'bad');
  await picker(page);await twoFrames();await trace('after-picker-proceed');assert.deepEqual(await fingerprint(page),block);
  await page.locator('#samplePickerClose').click();await twoFrames();await trace('after-picker-close');assert.deepEqual(await fingerprint(page),block);
  await picker(page);await page.keyboard.press('Escape');await twoFrames();await trace('after-picker-escape');assert.deepEqual(await fingerprint(page),block);
  await open(page,'dance');await page.locator('#procBtn').click();await page.locator('#callableType').selectOption('action');await page.locator('#callableName').fill('書きかけ');await page.locator('#callableName').press('Tab');await page.waitForTimeout(400);const draft=await fingerprint(page);await page.locator('#procClose').click();const closed=await fingerprint(page);await page.locator('#sampleBtn').click();assert.equal(await page.locator('#loseConfirmModal.show').isVisible(),true);await page.locator('#loseConfirmCancel').click();assert.deepEqual(await fingerprint(page),closed);assert.deepEqual((await fingerprint(page)).editor.callableDraft,draft.editor.callableDraft);
 });
 await test('SAMPLES-RESET-ISOLATION',async page=>{
  for(const from of samplesFeature.ids)for(const to of samplesFeature.ids.filter(x=>x!==from)){await open(page,from);await showMode(page,'code');await page.locator('#codeEditor').fill((await source(page))+'\nたくどんは「改造中」と言う。');await page.waitForTimeout(100);await open(page,to);assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(Akari.app.project))),plain(A.makeSampleProject(to)));assert.equal(await page.locator('#undoBtn').isDisabled(),true);assert.equal(await page.locator('#redoBtn').isDisabled(),true);}
  await open(page,'dance');const original=await source(page);await page.locator('#codeEditor').fill(original+'\nたくどんは「変更」と言う。');await page.waitForTimeout(300);await open(page,'dance');assert.equal(await source(page),original);await page.waitForTimeout(1600);assert.equal(await page.evaluate(()=>Akari.app.editorState.history),1);assert.equal(await page.evaluate(()=>Akari.app.editorState.dirty),false);assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>/autosave|fallback/.test(k)).some(k=>localStorage.getItem(k)?.includes('変更'))),false);await page.reload();await page.waitForFunction(()=>!!Akari.app);assert.ok(await page.evaluate(()=>Akari.app.project.scripts.every(s=>!s.source)));
 });
 await test('SAMPLES-BLOCK-EDIT',async page=>{
  await page.locator('#uiLevel').selectOption('advanced');
  for(const id of samplesFeature.ids){await open(page,id);await showMode(page,'blocks');const original=await source(page);const number=page.locator('#blockEditor :is(.blockui-node[data-schema-id="NumberLiteral"], .blockui-flat-value) input[data-blockui-field="value"]').first();const value=await number.inputValue();await number.fill(String(Number(value)+1));await number.press('Enter');await checkHistory(page,original);
   const statement=()=>!['dance','flower'].includes(id)?page.locator('#blockEditor .blockui-node[data-schema-id="Assignment"]').first():page.locator('#blockEditor .blockui-script > .blockui-node-content > .blockui-body > .blockui-node').first();
   await command(page,statement(),'replace-noop');assert.ok(await page.locator('#blockEditor [data-schema-id="NoOperation"]').count());await checkHistory(page,original);
   await command(page,statement(),'move-down');await checkHistory(page,original);
   await command(page,statement(),'remove');await checkHistory(page,original);
   const insert=page.locator('#blockEditor .blockui-script > .blockui-node-content > .blockui-body > [data-blockui-action="body-insert"]').last();await insert.click();await openPaletteTools(page.locator('#blockEditor'));const search=page.locator('#blockEditor [data-blockui-search]:visible').first();await search.fill('言う');await page.locator('#blockEditor [data-blockui-action="palette-add"][data-blockui-schema="Say"]:visible').first().click();const added=await checkHistory(page,original);assert.match(added,/こんにちは/);
   assert.deepEqual(await page.evaluate(()=>Akari.app.compile().errors.map(e=>e.message)),[]);await showMode(page,'code');assert.equal(await page.locator('#codeEditor').inputValue(),original);await showMode(page,'blocks');assert.equal(await source(page),original);
  }
 });
 await test('SAMPLES-SAVE-OFFLINE',async page=>{
  for(const id of samplesFeature.ids){await open(page,id);const initial=await page.evaluate(()=>JSON.stringify(Akari.app.project));await page.locator('#runBtn').click();
   if(id==='game'){for(let score=1;score<=5;score++){await page.locator('#formSurface .component[data-id="star"]').click();await page.waitForFunction(n=>document.querySelector('#formSurface .component[data-id="score"]')?.textContent.includes(String(n)),score);}await page.waitForFunction(()=>document.querySelector('#formSurface .component[data-id="star"]').style.display==='none');}
   else if(['dance','flower'].includes(id)){const phrase=id==='dance'?'もういちど おどろう！':'できた！';await page.waitForFunction(text=>[...document.querySelectorAll('.sprite-bubble')].some(x=>x.textContent.includes(text)),phrase,{timeout:25000});if(id==='flower')assert.ok(await page.locator('#penCanvas').evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)));}
   else{await page.locator('#formSurface .component[data-id="'+metadata(id).targetId+'"]').click();if(id==='story')await page.locator('#formSurface .component[data-id="left"]').click();const result=id==='maze'?'やった！ ゴール！\n道を かえて また あそぼう':id==='music'?'さいごまで':'おしまい';await page.waitForFunction(({id,text})=>{const actual=document.querySelector('#formSurface .component[data-id="status"]')?.textContent;return id==='maze'?actual===text:actual?.includes(text);},{id,text:result},{timeout:25000});
    if(id==='maze'){
     await page.waitForFunction(()=>{const values=Object.fromEntries([...document.querySelectorAll('#runtimeMonitor .monitor-row')].map(row=>[row.querySelector('.monitor-key').textContent,row.querySelector('.monitor-value').textContent]));return values['列']==='6'&&values['行']==='4';});
     const goal=await page.evaluate(()=>{const actor=document.querySelector('#formSurface .component[data-id="sprite-1"]'),values=Object.fromEntries([...document.querySelectorAll('#runtimeMonitor .monitor-row')].map(row=>[row.querySelector('.monitor-key').textContent,row.querySelector('.monitor-value').textContent]));return{column:values['列'],row:values['行'],failed:values['失敗'],x:parseFloat(actor.style.left),y:parseFloat(actor.style.top)};});
     assert.equal(goal.column,'6');assert.equal(goal.row,'4');assert.equal(goal.failed,'0');assert.ok(Math.abs(goal.x-280)<1e-7&&Math.abs(goal.y-274)<1e-7,'runtime mascot reaches the goal before the screenshot');
    }}
   if(id==='music'){
    const labels=await page.locator('#formSurface .ak-button').evaluateAll(buttons=>buttons.map(button=>{
     const range=document.createRange();range.selectNodeContents(button);const ink=range.getBoundingClientRect(),box=button.getBoundingClientRect(),style=getComputedStyle(button),scale=box.width/button.offsetWidth;
     return{id:button.dataset.id,text:button.textContent,oneLine:ink.height<=parseFloat(style.fontSize)*1.5*scale,inside:ink.left>=box.left-1&&ink.right<=box.right+1&&ink.top>=box.top-1&&ink.bottom<=box.bottom+1};
    }));
    assert.ok(labels.length>=23);for(const label of labels)assert.ok(label.oneLine&&label.inside,'music button text must fit: '+JSON.stringify(label));
   }
   await page.screenshot({path:path.join(dir,id+'.png')});await pressStop(page.locator('#stopBtn'));assert.equal(await page.evaluate(()=>JSON.stringify(Akari.app.project)),initial);
   await showMode(page,'code');await page.locator('#codeEditor').fill((await source(page))+'\nたくどんは「お手本の改造保存」と言う。');await showMode(page,'blocks');const changed=await page.evaluate(()=>JSON.stringify(Akari.app.project));
   const download=page.waitForEvent('download');await page.locator('#saveBtn').click();const saved=await download;assert.ok(saved.suggestedFilename().endsWith('.akari.md'));await saved.saveAs(path.join(dir,id+'.akari.md'));assert.equal(await saved.failure(),null);
   await page.locator('#fileInput').setInputFiles(path.join(dir,id+'.akari.md'));await page.waitForFunction(expected=>Akari.app.editorState.state==='DESIGN'&&Akari.diagnostics.stableJson(Akari.app.project)===Akari.diagnostics.stableJson(expected)&&Akari.app.editorState.main.sourceText.includes('お手本の改造保存'),JSON.parse(changed));
   // Serialization has a defined field order; authored component object key
   // insertion order is not project content. Still require every value/array
   // position, the selected owner, and the complete edited source to survive.
   assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(Akari.app.project))),JSON.parse(changed));assert.equal(await page.locator('#objectSelect').inputValue(),metadata(id).targetId);assert.equal(await page.locator('#eventSelect').inputValue(),metadata(id).event);assert.equal(await source(page),JSON.parse(changed).scripts.find(s=>s.targetId===(metadata(id).targetId)&&s.event===(metadata(id).event)).source);
   const exported=page.waitForEvent('download');await projectAction(page, 'exportBtn');await page.locator('#exportControls').click();const player=await exported;await player.saveAs(path.join(dir,id+'-player.html'));assert.equal(await player.failure(),null);
   const context=await browser.newContext({offline:true});await context.route(/^https?:/,r=>{report.networkRequests.push(r.request().url());return r.abort();});const p=await context.newPage();p.on('pageerror',e=>report.pageErrors.push(e.message));try{await p.goto(pathToFileURL(path.join(dir,id+'-player.html')).href);await p.locator('#playerStart:not([disabled])').click();if(metadata(id).event==='click')await p.locator('#formSurface .component[data-id="'+metadata(id).targetId+'"]').click();await p.waitForFunction(()=>document.querySelector('#formSurface')?.textContent.includes('お手本の改造保存'),null,{timeout:25000});assert.ok(await p.locator('#formSurface img').evaluateAll(imgs=>imgs.length>0&&imgs.every(i=>i.complete&&i.naturalWidth>0)));await pressStop(p.locator('#playerStop'));}finally{await context.close();}
  }
 });
 await test('SAMPLES-LOCKS',async page=>{await page.locator('#uiLevel').selectOption('advanced');await open(page,'game');await page.locator('#runBtn').click();await page.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');for(const control of ['sampleBtn'])assert.equal(await page.locator('#'+control).isDisabled(),true);await page.locator('#pauseBtn').click();await page.waitForFunction(()=>Akari.app.editorState.state==='PAUSED');for(const control of ['sampleBtn'])assert.equal(await page.locator('#'+control).isDisabled(),true);await pressStop(page.locator('#stopBtn'));assert.equal(await page.locator('#sampleBtn').isEnabled(),true);});
 await test('SAMPLES-RESPONSIVE-PICKER',async page=>{
  const pictureUrls=new Set();
  const imagePolicy=await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');assert.equal(imagePolicy.split(';').map(s=>s.trim()).find(s=>s.startsWith('img-src ')),'img-src blob:','sample art must preserve the original image CSP');
  for(const [width,height] of [[1280,720],[1920,1080],[390,844]])for(const level of ['basic','advanced'])for(const mode of ['code','blocks']){
   await page.setViewportSize({width,height});await page.locator('#uiLevel').selectOption(level);await showMode(page,mode);const before=await fingerprint(page);await page.locator('#sampleBtn').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#loseConfirmModal.show').isVisible(),false);assert.equal(await page.locator('#samplePicker').evaluate(e=>e.open),true);
   const dialog=page.locator('#samplePicker'),cards=dialog.locator('[data-sample-id]');assert.equal(await dialog.evaluate(e=>e.tagName),'DIALOG');assert.equal(await cards.count(),6);assert.equal(await page.locator('#sampleGrid').count(),1);
   const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1);
   assert.equal(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'no horizontal dialog overflow');
   for(const id of samplesFeature.ids){const card=dialog.locator('[data-sample-id="'+id+'"]');assert.equal(await card.evaluate(e=>e.tagName),'BUTTON');assert.equal(await card.locator('svg').count(),1);const text=await card.innerText();assert.ok(text.includes(metadata(id).title));assert.ok(text.includes(metadata(id).description));await card.scrollIntoViewIfNeeded();assert.equal(await card.isVisible(),true);const box=await card.boundingBox();assert.ok(box.x>=bounds.x&&box.x+box.width<=bounds.x+bounds.width+1);assert.ok(box.width>=44&&box.height>=44);}
   // Count alone misses CSP-blocked SVG image children. Decode every actual
   // referenced bitmap under the document's unchanged CSP and check its size.
   for(const id of ['dance','story'])assert.equal(await dialog.locator('[data-sample-id="'+id+'"] svg image').count(),2);
   const pictures=await dialog.locator('svg image').evaluateAll(async elements=>Promise.all(elements.map(async element=>{
    const url=element.href.baseVal,bitmap=new Image();bitmap.src=url;await bitmap.decode();
    const bounds=element.getBoundingClientRect();return{url,width:bitmap.naturalWidth,height:bitmap.naturalHeight,displayWidth:bounds.width,displayHeight:bounds.height};
   })));
   assert.equal(pictures.length,4);for(const picture of pictures){assert.match(picture.url,/^blob:/);assert.ok(picture.width>0&&picture.height>0&&picture.displayWidth>0&&picture.displayHeight>0);pictureUrls.add(picture.url);}assert.equal(pictureUrls.size,2,'reopening the picker reuses exactly two bounded bitmap URLs');
   await page.locator('#samplePickerClose').focus();for(let i=0;i<8;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.querySelector('#samplePicker').contains(document.activeElement)),true,'native modal traps keyboard focus');}
   await page.keyboard.press('Escape');assert.equal(await dialog.evaluate(e=>e.open),false);assert.deepEqual(await fingerprint(page),before);assert.equal(await page.locator('#sampleBtn').evaluate(e=>e===document.activeElement),true);
  }
  await picker(page);await page.locator('#samplePicker [data-sample-id="music"]').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>Akari.app.project.name),metadata('music').title);
  const ctx=await browser.newContext({offline:true,hasTouch:true,viewport:{width:390,height:844}}),p=await ctx.newPage();p.on('pageerror',e=>report.pageErrors.push(e.message));try{await p.goto(pathToFileURL(path.resolve(product)).href);await p.waitForFunction(()=>!!Akari.app);await p.locator('#uiLevel').selectOption('basic');await p.locator('#sampleBtn').tap();await p.locator('#samplePicker [data-sample-id="dance"]').tap();assert.equal(await p.evaluate(()=>Akari.app.project.name),samplesFeature.names[0]);}finally{await ctx.close();}
 });
},420000);}catch(e){report.hostFailure=e.stack;console.error(e.stack);}
for(const id of sampleTestIds)if(!report.results.some(r=>r.id===id))report.results.push({id,status:'FAIL',error:'Required check did not execute'});
const artifactNames=samplesFeature.ids.flatMap(id=>[id+'.png',id+'.akari.md',id+'-player.html']);report.artifacts=artifactNames.filter(n=>fs.existsSync(path.join(dir,n))).map(n=>({path:n,sha256:sha(fs.readFileSync(path.join(dir,n)))}));
report.status=!report.hostFailure&&!report.pageErrors.length&&!report.networkRequests.length&&report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';
if(report.status==='PASS'){try{verifySamples(report,inputs,dir);}catch(e){report.status='FAIL';report.hostFailure=e.stack;console.error(e.stack);}}
save();if(report.status!=='PASS')process.exitCode=1;
