import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {install,reveal} from '../lib/ux-repair02-ui.mjs';
import {listRepairCases,isolatedListCases,shopping,sourceFor,fixedFor,verifyListRepairReport} from '../lib/ux-repair03-list-contract.mjs';
const require=createRequire(import.meta.url),[chrome,out]=process.argv.slice(2),output=path.resolve(out),dir=output+'.artifacts',product=currentProductFile();
fs.mkdirSync(dir,{recursive:true});
const report={schema:'akari-ux-repair03-list-v1',status:'RUNNING',snapshot:snapshot(product),uxAcceptance:false,pageErrors:[],networkRequests:[],environment:{browser:null,playwright:require('playwright/package.json').version},results:[]};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const state=p=>p.evaluate(()=>({project:structuredClone(Akari.app.project),source:Akari.app.editorState.main.sourceText,state:Akari.app.editorState.state,history:Akari.app.editorState.history,redo:Akari.app.editorState.redo}));
const panel=p=>p.evaluate(()=>{const root=document.querySelector('#listRepairPanel'),s=root.querySelector('select');return {project:structuredClone(Akari.app.project),state:Akari.app.editorState.state,text:root.innerText,options:[...s.options].map(o=>o.textContent),choice:s.value,selectDisabled:s.disabled,applyDisabled:root.querySelector('#listRepairApply').disabled,selection:[document.querySelector('#codeEditor').selectionStart,document.querySelector('#codeEditor').selectionEnd]};});
async function gui(p){await p.locator('#dataBtn').click();await p.locator('#dataKind').selectOption('list');await p.locator('#dataName').fill('買うもの');await p.locator('#dataItems').fill(shopping.join('\n'));await p.locator('#dataAdd').click();await p.locator('#dataClose').click();await p.locator('#editorModecode').click();await p.locator('#codeEditor').fill(sourceFor(2));await p.locator('#codeEditor').press('Tab');}
async function fixture(p,c={}){
 await install(p,c.source??sourceFor(2),{mode:c.mode||'code',
  actorLists:c.local||c.dango?[{id:'akari-list',name:c.dango?'あかり専用':'買うもの',initialValue:['鉛筆','ノート','消しゴム']}]:[],
  localLists:c.dango?[{id:'dango-list',name:'買うもの',initialValue:['鉛筆','ノート','消しゴム']}]:[],extraScripts:c.extraScripts||[]});
 if(c.name||c.noLists||c.documentBefore){const file=await p.evaluate(({name,noLists,documentBefore})=>{const q=structuredClone(Akari.app.project);if(name||noLists)q.projectData.lists=noLists?[]:[{id:'shopping',name,initialValue:['りんご','パン','牛乳']}];if(documentBefore)q.scripts[0].document=documentBefore;q.name='リスト境界';return Akari.serializeProject(q,Akari.app.assetStore);},{name:c.name,noLists:!!c.noLists,documentBefore:c.documentBefore});await p.locator('#fileInput').setInputFiles({name:'list-boundary.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});await p.waitForFunction(()=>Akari.app.project.name==='リスト境界');
  await p.locator('#objectSelect').selectOption('sprite-1');await p.locator('#eventSelect').selectOption('start');if(await p.locator('#sourceOverview').isVisible())await p.locator('#sourceEditBtn').click();await p.locator('#editorModecode').click();
 }
}
async function fail(p){await p.locator('#runBtn').click();await p.locator('#failureModal.show').waitFor();return p.evaluate(()=>({state:Akari.app.editorState.state,code:document.querySelector('.failure-summary').textContent.match(/^R\d+/)?.[0]||null,summary:document.querySelector('.failure-summary').textContent,project:structuredClone(Akari.app.project)}));}
async function runtime(p,{speech,error,stage}={}){
 await p.locator('#runBtn').click();
 if(error)await p.locator('#failureModal.show').waitFor();
 else if(stage)await p.waitForFunction(()=>[...document.querySelectorAll('#runtimeMonitor .monitor-row')].some(r=>r.querySelector('.monitor-key')?.textContent==='点数'&&r.querySelector('.monitor-value')?.textContent==='パン'));
 else await p.waitForFunction(t=>[...document.querySelectorAll('.sprite-bubble-text')].some(e=>e.textContent===t),speech);
 const result=await p.evaluate(()=>({speech:[...document.querySelectorAll('.sprite-bubble-text')].map(e=>e.textContent),error:document.querySelector('#failureModal.show .failure-summary')?.textContent.match(/^R\d+/)?.[0]||null,score:[...document.querySelectorAll('#runtimeMonitor .monitor-row')].find(r=>r.querySelector('.monitor-key')?.textContent==='点数')?.querySelector('.monitor-value')?.textContent||null}));
 if(await p.locator('#failureModal.show').count())await p.locator('#failureClose').click();await p.locator('#stopBtn').click();return result;
}
async function repair(p,c,setup){
 const before=await state(p),failure=await fail(p);await p.locator('#failureEditList').click();const opened=await panel(p),choose=c.choose||0;
 await p.locator('#listRepairChoice').selectOption(String(choose));
 const selected={...await state(p),choice:await p.locator('#listRepairChoice').inputValue()};
 const geometry=await p.evaluate(()=>({width:innerWidth,height:innerHeight,controls:['listRepairChoice','listRepairApply','listRepairCancel'].map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return {...r.toJSON(),hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})}));
 await p.screenshot({path:path.join(dir,'panel-'+c.id.replaceAll('/','-')+'.png')});
 const injectedElements=await p.locator('#listRepairPanel img,#listRepairPanel script,#listRepairPanel iframe').count();
 await p.locator('#listRepairApply').click();await p.locator('#listRepairPanel').waitFor({state:'detached'});const after=await state(p);
 await p.locator('#undoBtn').click();const undo=await state(p);await p.locator('#redoBtn').click();const redo=await state(p);
 const r=await runtime(p,{speech:c.speech,error:c.error,stage:c.id==='scope/stage'});
 return {setup,before,failure,opened,choose,selected,after,undo,redo,runtime:r,geometry,injectedElements};
}
try{await withBrowser(chrome,async browser=>{
 report.environment.browser=browser.version();
 async function run(id,fn){const row={id,status:'RUNNING'};report.results.push(row);try{row.observed=await pageFor(browser,product,async p=>{await p.setViewportSize({width:1188,height:848});p.setDefaultTimeout(8000);p.on('dialog',d=>d.accept());p.on('pageerror',e=>report.pageErrors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url());});try{return await fn(p);}finally{await p.screenshot({path:path.join(dir,id.replaceAll('/','-')+'.png')}).catch(()=>{});}});row.status='PASS';}catch(e){row.status='FAIL';row.error=e.stack;}console.log(row.status+' '+id);save();}
 for(const [width,height]of [[1180,757],[1188,848]])await run(`gui/${width}x${height}`,async p=>{await p.setViewportSize({width,height});await gui(p);return repair(p,{id:`gui-${width}x${height}`,speech:'パン'},'pointer-keyboard-only');});
 for(const c of listRepairCases)await run(c.id,async p=>{await fixture(p,c);return repair(p,c,'serialized-fixture-then-pointer-keyboard');});
 await run('cancel/close',async p=>{await fixture(p);await fail(p);const before=await state(p);await p.locator('#failureClose').click();return {before,after:await state(p),panelCount:await p.locator('#listRepairPanel').count()};});
 await run('cancel/panel',async p=>{await fixture(p);await fail(p);await p.locator('#failureEditList').click();const before=await state(p);await p.locator('#listRepairChoice').selectOption('0');await p.locator('#listRepairCancel').click();return {before,after:await state(p),panelCount:await p.locator('#listRepairPanel').count()};});
 for(const [id,c]of [['boundary/missing-name',{source:'始めると、あかりは「ない名前」の2番目を2秒話します。'}],['boundary/empty-string',{source:'始めると、あかりは「」の2番目を2秒話します。'}],['boundary/no-lists',{noLists:true}]])await run(id,async p=>{await fixture(p,c);const before=await state(p),failure=await fail(p);await p.locator('#failureEditList').click();const opened=await panel(p);await p.locator('#listRepairCancel').click();return {before,failure,opened,after:await state(p)};});
 await run('boundary/ordinary-string',async p=>{await fixture(p,{source:'始めると、あかりは「買うもの」を2秒話します。'});const before=await state(p),r=await runtime(p,{speech:'買うもの'});return {before,runtime:r,after:await state(p),repairCount:await p.locator('#listRepairPanel,#failureEditList').count()};});
 await run('boundary/plain-evaluator',async p=>p.evaluate(()=>({errors:[false,true].map(located=>{const list={kind:'StringLiteral',value:'買うもの',...(located?{sourceSpan:{startLine:1,startColumn:1,endLine:1,endColumn:7}}:{})};try{Akari.evalExpression({kind:'ListRead',list,index:{kind:'NumberLiteral',value:2}},{});return null;}catch(e){return e.code||e.name;}})})));
 await run('stale/source-changed',async p=>{await fixture(p);const before=await state(p);await fail(p);await p.locator('#failureEditList').click();await p.locator('#codeEditor').fill(sourceFor(3));await p.locator('#codeEditor').press('Tab');await p.locator('#listRepairChoice').selectOption('0');return {before,after:await state(p),applyDisabled:await p.locator('#listRepairApply').isDisabled(),notice:await p.locator('#listRepairNotice').innerText()};});
 await run('stale/new-run',async p=>{await fixture(p);await fail(p);await p.locator('#failureEditList').click();await p.locator('#listRepairChoice').selectOption('0');await p.locator('#codeEditor').fill('「現在」と言う。');await p.locator('#codeEditor').press('Tab');const expectedProject=(await state(p)).project;await p.locator('#runBtn').click();await p.waitForFunction(()=>document.querySelector('.sprite-bubble-text')?.textContent==='現在');return {expectedProject,after:await state(p),panelCount:await p.locator('#listRepairPanel').count(),applyCount:await p.locator('#listRepairApply').count()};});
 await run('stale/new-project',async p=>{await fixture(p);await fail(p);await p.locator('#failureEditList').click();await p.locator('#newBtn').click();await p.waitForFunction(()=>Akari.app.project.name==='新しい作品');const expectedProject=await p.evaluate(()=>Akari.makeEmptyProject());return {expectedProject,after:await state(p),panelCount:await p.locator('#listRepairPanel').count(),applyCount:await p.locator('#listRepairApply').count()};});
 await run('stale/detached-handler',async p=>{await fixture(p);await fail(p);await p.evaluate(()=>{window.staleListRepair=document.querySelector('#failureEditList').onclick;});await p.locator('#failureClose').click();await p.locator('#stopBtn').click();await p.locator('#codeEditor').fill('「未確定');const before=await state(p),inputBefore=await p.locator('#codeEditor').inputValue();await p.evaluate(()=>window.staleListRepair());return {classification:'synthetic stale callback after pointer stop / pending keyboard input',before,inputBefore,after:await state(p),inputAfter:await p.locator('#codeEditor').inputValue(),panelCount:await p.locator('#listRepairPanel').count()};});
 await run('stale/older-record',async p=>{const clickSource='「買うもの」の3番目を2秒話します。';await fixture(p,{source:sourceFor(1),extraScripts:[{id:'clicked',targetId:'sprite-1',event:'click',source:clickSource}]});const before=await state(p);await fail(p);await p.locator('#failureClose').click();await reveal(p.locator('#continueBtn'));await p.locator('#continueBtn').click();await p.locator('#formSurface .component[data-runtime-id="sprite-1"]').click();await p.locator('#failureModal.show').waitFor();const recordCount=await p.locator('#failureSelect option').count();await p.locator('#failureSelect').selectOption('1');const selectedRecord=await p.locator('#failureSelect').inputValue();await p.locator('#failureEditList').click();await p.locator('#listRepairChoice').selectOption('0');await p.locator('#listRepairApply').click();return {before,recordCount,selectedRecord,after:await state(p)};});
 for(const [id,source]of [['compat/explicit-list','始めると、あかりはリスト「買うもの」の2番目を2秒話します。'],['compat/legacy-name','始めると、あかりは【買うもの】の2番目を2秒話します。']])await run(id,async p=>{await fixture(p,{source});return {runtime:await runtime(p,{speech:'パン'}),after:await state(p),repairCount:await p.locator('#listRepairPanel,#failureEditList').count()};});
 await run('compat/block-picker',async p=>{await fixture(p,{mode:'blocks'});const before=await state(p);await p.getByLabel('文字の代わりに使うリストを選ぶ').selectOption({index:1});const expr=await p.evaluate(()=>Akari.app.editorState.main.syntaxAst.body[0].value);return {before,after:await state(p),kind:expr.list.kind,index:expr.index.value,runtime:await runtime(p,{speech:'パン'})};});
 await run('boundary/isolated-runtime',async p=>p.evaluate(cases=>{
  // Reconstruct the same runtime factories shipped in a standalone player, without editor closures.
  const core=Function(Akari.createAkariProfiles.toString()+'\n'+Akari.createAkariExtensionHost.toString()+'\nreturn ('+Akari.createAkariRuntime.toString()+')()')();
  return {classification:'factory reconstructed with Function / no editor lexical scope',runs:cases.map(c=>{
   const project=Akari.makeEmptyProject();project.projectData.variables=[{id:'score',name:'点数',initialValue:0}];project.projectData.lists=[{id:'shopping',name:'買うもの',initialValue:['りんご','パン','牛乳']}];project.scripts=[{targetId:'sprite-1',event:'start',source:c.source,...(c.id?{id:c.id}:{}),...(c.document?{document:c.document}:{})}];
   const before=structuredClone(project),compiled=Akari.compileProject(project),runtime=new core.RuntimeModel(project,{}),errors=[];
   const scheduler=new core.EventScheduler(project,compiled,runtime,{runtimeError:(_,e)=>errors.push({code:e.code,message:e.message})});scheduler.schedule=()=>{};
   let thrown=null,turns=0;try{scheduler.start();while(scheduler.ready.length&&turns++<20)scheduler.runTurn(true);if(turns>=20)throw Error('Isolated runtime did not terminate');}catch(e){thrown={name:e.name,message:e.message};}
   const result={variant:c.variant,before,after:structuredClone(project),compileErrors:compiled.errors,errors,thrown,paused:scheduler.paused,records:scheduler.errorRecords.map(r=>({key:r.key,source:r.source,ownerKey:r.quotedList?.ownerKey}))};scheduler.stop();return result;
  })};
 },isolatedListCases));
 for(const [id,source]of [['boundary/generated-player-r411',sourceFor(2)],['boundary/generated-player-r404',fixedFor(4)]])await run(id,async p=>{
  await fixture(p,{source});const before=(await state(p)).project,html=await p.evaluate(()=>Akari.generateStandaloneHtml(Akari.app.project,Akari.app.assetStore)),after=(await state(p)).project,file=path.join(dir,id.replaceAll('/','-')+'.html');fs.writeFileSync(file,html);
  await p.goto(pathToFileURL(file).href);const executions=[],stopped=[];
  for(let i=0;i<2;i++){await p.locator('#playerStart:not([disabled])').click();await p.waitForFunction(()=>document.querySelector('#playerRoot').dataset.state==='PAUSED');executions.push(await p.evaluate(()=>({state:document.querySelector('#playerRoot').dataset.state,output:document.querySelector('#playerOutput').textContent,bubbles:[...document.querySelectorAll('.sprite-bubble-text')].map(e=>e.textContent),stopDisabled:document.querySelector('#playerStop').disabled})));await p.screenshot({path:path.join(dir,id.replaceAll('/','-')+'-'+i+'.png')});await p.locator('#playerStop').click();stopped.push(await p.locator('#playerRoot').getAttribute('data-state'));}
  return {classification:'generated HTML API / actual offline file player / pointer controls',source,before,after,file,executions,stopped};
 });
},600000);}catch(e){report.hostFailure=e.stack;}
report.status=!report.hostFailure&&report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';
if(report.status==='PASS')try{verifyListRepairReport(report);}catch(e){report.status='FAIL';report.contractFailure=e.stack;}
save();if(report.status!=='PASS')process.exitCode=1;
