import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {autosaveSources,autosaveSuffix,autosaveCallable,verifyAutosaveStateReport} from '../lib/autosave-state-contract.mjs';

const require=createRequire(import.meta.url),[chrome,out]=process.argv.slice(2),output=path.resolve(out),product=currentProductFile(),artifacts=output+'.artifacts';
fs.mkdirSync(artifacts,{recursive:true});
const report={schema:'akari-autosave-state-v1',status:'RUNNING',snapshot:snapshot(product),uxAcceptance:false,
  environment:{browser:null,playwright:require('playwright/package.json').version},pageErrors:[],networkRequests:[],results:[]};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const state=p=>p.evaluate(()=>{const s=Akari.app.editorState;return{project:structuredClone(Akari.app.project),state:s.state,selectedScriptId:s.selectedScriptId,
  selectedTarget:document.querySelector('#objectSelect').value,selectedEvent:document.querySelector('#eventSelect').value,
  owner:s.main.ownerKey,input:document.querySelector('#codeEditor').value,pending:s.main.pendingEdit,history:s.history,redo:s.redo,
  status:document.querySelector('#autosaveState').textContent,failure:document.querySelector('#failureModal.show .failure-summary')?.textContent.match(/^R\d+/)?.[0]||null,
  score:[...document.querySelectorAll('#runtimeMonitor .monitor-row')].find(r=>r.querySelector('.monitor-key')?.textContent==='点数')?.querySelector('.monitor-value')?.textContent||null};});
const events=p=>p.evaluate(()=>window.autosaveAudit.events);
const settled=p=>p.waitForFunction(()=>document.querySelector('#autosaveState').textContent==='自動保存：済み',null,{timeout:10000});
const edit=async(p,source)=>{await p.locator('#codeEditor').fill(source);await p.locator('#codeEditor').press('Tab');};
const restore=async p=>{await p.reload();await p.locator('#recoveryRestore').click();await p.waitForFunction(()=>!document.querySelector('#recoveryModal').classList.contains('show'));};
async function record(p){return p.evaluate(async()=>{
  const rec=await new Promise((resolve,reject)=>{const req=indexedDB.open('akari-workspace-f2',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('workspace','readonly'),get=tx.objectStore('workspace').get('latest');get.onsuccess=()=>{db.close();resolve(get.result||null);};get.onerror=()=>reject(get.error);};});
  if(!rec)return null;const decoded=await Akari.decodeWorkspaceHistory(rec.workspace),frame=decoded.frames[decoded.cursor];
  return {revision:rec.revision,updatedAt:rec.updatedAt,cursor:decoded.cursor,frameCount:decoded.frames.length,project:frame.project,editorState:frame.editorState};
});}
async function fixture(p,source,document,{actions=[],extraScripts=[]}={}){
  const file=await p.evaluate(({source,document,actions,extraScripts})=>{const project=Akari.makeEmptyProject();project.name='自動保存状態の検証';
    project.projectData.variables=[{id:'score',name:'点数',initialValue:0}];project.projectData.lists=[{id:'shopping',name:'買うもの',initialValue:['りんご','パン','牛乳']}];
    project.actions=actions;project.scripts=[{id:'main',targetId:'sprite-1',event:'start',source,...(document?{document}:{})},...extraScripts];return Akari.serializeProject(project,Akari.app.assetStore);
  },{source,document,actions,extraScripts});
  await p.locator('#fileInput').setInputFiles({name:'autosave-state.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});
  await p.waitForFunction(()=>Akari.app.project.name==='自動保存状態の検証');await p.locator('#uiLevel').selectOption('advanced');
  await p.locator('#objectSelect').selectOption('sprite-1');await p.locator('#eventSelect').selectOption('start');
  if(await p.locator('#sourceOverview').isVisible())await p.locator('#sourceEditBtn').click();await p.locator('#editorModecode').click();
}
// Observe real browser storage events. Holding only the application's completion
// callback lets a newer keyboard edit race a completed old write without adding
// test hooks or replacing the product's serializer, queue or status logic.
async function instrument(p,{hold=false,quota=false}={}){await p.evaluate(({hold,quota})=>{
  const audit=window.autosaveAudit={events:[],hold,quota,held:[],serial:0};
  const note=(kind,extra={})=>audit.events.push({seq:audit.events.length+1,at:performance.now(),kind,status:document.querySelector('#autosaveState').textContent,...extra});
  audit.note=note;note('initial');
  new MutationObserver(()=>note('status')).observe(document.querySelector('#autosaveState'),{childList:true,characterData:true,subtree:true});
  const nativePut=IDBObjectStore.prototype.put,nativeSet=Storage.prototype.setItem;
  IDBObjectStore.prototype.put=function(value,...args){
    if(this.name!=='workspace')return nativePut.call(this,value,...args);
    const id=++audit.serial;note('put-request',{id,revision:value.revision});
    if(audit.quota){note('put-error',{id,error:'QuotaExceededError'});throw new DOMException('Audit storage capacity exhausted','QuotaExceededError');}
    const tx=this.transaction,complete=tx.oncomplete;tx.oncomplete=null;
    tx.addEventListener('complete',event=>{note('native-complete',{id});const deliver=()=>{note('completion-delivered',{id});complete?.call(tx,event);};if(audit.hold)audit.held.push(deliver);else deliver();},{once:true});
    const request=nativePut.call(this,value,...args);request.addEventListener('success',()=>note('request-success',{id}),{once:true});
    request.addEventListener('error',()=>note('request-error',{id,error:request.error?.name}),{once:true});return request;
  };
  Storage.prototype.setItem=function(key,value){
    if(!key.startsWith('akari.autosave.'))return nativeSet.call(this,key,value);
    note('fallback-request');if(audit.quota){note('fallback-error',{error:'QuotaExceededError'});throw new DOMException('Audit storage capacity exhausted','QuotaExceededError');}
    const result=nativeSet.call(this,key,value);note('fallback-written');return result;
  };
}, {hold,quota});}
const waitHeld=p=>p.waitForFunction(()=>window.autosaveAudit.held.length>0,null,{timeout:10000});
const release=p=>p.evaluate(()=>{const callback=window.autosaveAudit.held.shift();if(!callback)throw Error('No held completion');callback();});
async function pause(p){await p.locator('#runBtn').click();await p.locator('#failureModal.show').waitFor();return state(p);}
async function pausedScenario(p,key,{document,restored=false}={}){
  await fixture(p,autosaveSources[key]+autosaveSuffix,document);
  const rename=async()=>{await p.locator('#projectName').fill('自動保存状態の検証・編集');await p.locator('#projectName').press('Tab');};
  if(restored){await rename();await settled(p);await restore(p);}
  await instrument(p);if(!restored)await rename();
  const before=await state(p),paused=await pause(p);await settled(p);
  await p.screenshot({path:path.join(artifacts,'paused-'+key+(restored?'-restored':'')+'.png')});
  return {setup:'serialized-fixture-then-pointer-keyboard',restoredFromStorage:restored,before,paused,settled:await state(p),record:await record(p),events:await events(p)};
}
try{await withBrowser(chrome,async browser=>{
  report.environment.browser=browser.version();
  async function run(id,fn){const row={id,status:'RUNNING'};report.results.push(row);try{row.observed=await pageFor(browser,product,async p=>{
    p.setDefaultTimeout(8000);await p.setViewportSize({width:1188,height:848});p.on('dialog',d=>d.accept());
    p.on('pageerror',e=>report.pageErrors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url());});
    try{return await fn(p);}finally{await p.screenshot({path:path.join(artifacts,id.replaceAll('/','-')+'.png')}).catch(()=>{});}
  });row.status='PASS';}catch(error){row.status='FAIL';row.error=error.stack;}save();console.log(row.status+' '+id);}
  await run('paused/persistent-first',p=>pausedScenario(p,'first',{document:{revision:7,unitIds:['first-event']}}));
  await run('paused/legacy-second-cancel',async p=>{
    const o=await pausedScenario(p,'second');await p.locator('#failureEditList').click();o.opened=await state(p);
    await p.locator('#listRepairChoice').selectOption('0');await p.locator('#listRepairCancel').click();o.cancelled=await state(p);o.panelCount=await p.locator('#listRepairPanel').count();o.rerun=await pause(p);return o;
  });
  await run('restored/persistent-second-repair',async p=>{
    const o=await pausedScenario(p,'second',{document:{revision:7,unitIds:['first-event','second-event']},restored:true});
    await p.locator('#failureEditList').click();o.opened=await state(p);await p.locator('#listRepairChoice').selectOption('0');await p.locator('#listRepairApply').click();o.applied=await state(p);
    await p.locator('#undoBtn').click();o.undo=await state(p);await p.locator('#redoBtn').click();o.redo=await state(p);
    await p.locator('#runBtn').click();await p.waitForFunction(()=>[...document.querySelectorAll('#runtimeMonitor .monitor-row')].some(r=>r.querySelector('.monitor-key')?.textContent==='点数'&&r.querySelector('.monitor-value')?.textContent==='パン'));o.rerun=await state(p);await p.locator('#stopBtn').click();await settled(p);o.afterRecord=await record(p);
    await restore(p);o.finalRestore=await state(p);await p.locator('#undoBtn').click();o.restoredUndo=await state(p);await p.locator('#redoBtn').click();o.restoredRedo=await state(p);return o;
  });
  await run('paused/plain-script',p=>pausedScenario(p,'plain'));
  for(const stale of [false,true])await run(stale?'storage/stale-completion':'storage/completion-order',async p=>{
    await fixture(p,autosaveSources.saved);await edit(p,autosaveSources.saved+'\n※ 最初の保存');await settled(p);await instrument(p,{hold:true});
    await edit(p,autosaveSources.older);await waitHeld(p);const o=stale?{oldHeld:await state(p)}:{held:await state(p)};
    if(stale){await edit(p,autosaveSources.newer);o.afterNewEdit=await state(p);await release(p);o.afterOldCompletion=await state(p);await waitHeld(p);o.newHeld=await state(p);}
    await release(p);await settled(p);o.done=await state(p);o.record=await record(p);o.events=await events(p);if(stale){await restore(p);o.restored=await state(p);}return o;
  });
  await run('storage/quota-retains-current-and-draft',async p=>{
    await fixture(p,autosaveSources.older);await edit(p,autosaveSources.saved);await settled(p);const o={before:await state(p),beforeRecord:await record(p),attempts:[]};
    await instrument(p,{quota:true});
    for(const source of [autosaveSources.newer,autosaveSources.draft]){
      await p.evaluate(()=>{window.autosaveAudit.events=[];window.autosaveAudit.note('initial');});await edit(p,source);
      await p.waitForFunction(()=>document.querySelector('#autosaveState').textContent.includes('失敗'),null,{timeout:10000});
      o.attempts.push({source,current:await state(p),record:await record(p),events:await events(p)});
    }
    o.final=await state(p);return o;
  });
  await run('restored/pending-draft',async p=>{
    await fixture(p,autosaveSources.older);await edit(p,autosaveSources.saved);await settled(p);const o={before:await state(p)};
    await instrument(p);await edit(p,autosaveSources.draft);await settled(p);o.saved=await state(p);o.record=await record(p);o.events=await events(p);
    await restore(p);o.restored=await state(p);await p.locator('#undoBtn').click();o.undo=await state(p);await p.locator('#redoBtn').click();o.redo=await state(p);return o;
  });
  await run('restored/callable-clone-pause',async p=>{
    await fixture(p,autosaveCallable.source,autosaveCallable.document,autosaveCallable);
    await p.locator('#projectName').fill('自動保存状態の検証・手順');await p.locator('#projectName').press('Tab');await settled(p);await restore(p);await instrument(p);
    const o={restoredFromStorage:true,before:await state(p),paused:await pause(p)};await settled(p);o.settled=await state(p);o.record=await record(p);
    await p.locator('#failureClose').click();
    const [download]=await Promise.all([p.waitForEvent('download'),p.locator('#saveBtn').click()]),file=await download.path();
    if(!file)throw Error('Manual project download did not complete');
    o.exported=await p.evaluate(async text=>{const parsed=await Akari.parseProjectFile(text);return{project:parsed.project,editorState:parsed.editorState};},fs.readFileSync(file,'utf8'));
    o.events=await events(p);return o;
  });
},180000);}catch(error){report.hostFailure=error.stack;}
report.status=!report.hostFailure&&report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';
if(report.status==='PASS')try{verifyAutosaveStateReport(report);}catch(error){report.status='FAIL';report.contractFailure=error.stack;}
save();if(report.status!=='PASS')process.exitCode=1;
