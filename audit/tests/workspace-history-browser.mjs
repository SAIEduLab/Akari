import {openPaletteTools} from '../browser/cases/regression-setup.cjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {browserEnvironment} from '../lib/browser-environment.mjs';
const require=createRequire(import.meta.url),[chrome,outputArg]=process.argv.slice(2),output=path.resolve(outputArg),product=currentProductFile();
const report={schema:'akari-workspace-history-browser-v1',status:'RUNNING',snapshot:snapshot(product),uxAcceptance:false,environment:{browser:null,playwright:require('playwright/package.json').version},pageErrors:[],results:[]};
fs.mkdirSync(path.dirname(output),{recursive:true});
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const readRecord=page=>page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('akari-workspace-f2',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('workspace','readonly'),q=tx.objectStore('workspace').get('latest');q.onsuccess=()=>{db.close();const r=q.result;resolve(r?{updatedAt:r.updatedAt,revision:r.revision,workspace:{...r.workspace,assets:r.workspace.assets.map(a=>({...a,blob:a.blob?{size:a.blob.size,type:a.blob.type}:null}))}}:null);};q.onerror=()=>reject(q.error);};}));
const settled=page=>page.waitForFunction(()=>document.querySelector('#autosaveState').textContent.includes('済み'),null,{timeout:12000});
const restore=async page=>{await page.reload();await page.locator('#recoveryRestore').click();await page.waitForFunction(()=>!document.querySelector('#recoveryModal').classList.contains('show'));};
try{await withBrowser(chrome,async browser=>{
 report.environment.browser=browser.version();assert.equal(browser.version(),browserEnvironment.version);assert.equal(report.environment.playwright,browserEnvironment.playwright);
 const run=async(id,fn)=>{const row={id,status:'RUNNING'};report.results.push(row);try{row.observed=await pageFor(browser,product,async page=>{
  page.setDefaultTimeout(8000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>report.pageErrors.push(e.message));
  await page.locator('#uiLevel').selectOption('advanced');await page.locator('#objectSelect').selectOption('sprite-1');await page.locator('#eventSelect').selectOption('start');
  if(await page.locator('#sourceOverview').isVisible())await page.locator('#sourceEditBtn').click();await page.locator('#editorModecode').click();return fn(page);
 });row.status='PASS';}catch(error){row.status='FAIL';row.error=error.stack;}save();console.log(row.status+' '+id);};
 await run('history/browser-thirty-undo-redo',async page=>{
  for(let i=1;i<=35;i++){await page.locator('#codeEditor').fill(`「履歴${i}」と言う。`);await page.waitForTimeout(280);}
  assert.equal(await page.evaluate(()=>Akari.app.editorState.history),30);
  for(let i=0;i<3;i++)await page.locator('#undoBtn').click();assert.equal(await page.locator('#codeEditor').inputValue(),'「履歴32」と言う。');
  await settled(page);const before=await readRecord(page);assert.equal(before.workspace.deltas.length,29);assert.equal(before.workspace.cursor,26);assert.equal(before.workspace.assets.length,1);
  await restore(page);assert.equal(await page.evaluate(()=>Akari.app.editorState.history),27);assert.equal(await page.evaluate(()=>Akari.app.editorState.redo),3);assert.equal(await page.locator('#codeEditor').inputValue(),'「履歴32」と言う。');
  await page.locator('#redoBtn').click();assert.equal(await page.locator('#codeEditor').inputValue(),'「履歴33」と言う。');await page.locator('#undoBtn').click();
  for(let i=0;i<26;i++)await page.locator('#undoBtn').click();assert.equal(await page.locator('#codeEditor').inputValue(),'「履歴6」と言う。');
  return{frames:30,restoredHistory:27,restoredRedo:3,cursor:26,firstRetained:'「履歴6」と言う。',sharedAssets:1};
 });
 await run('history/browser-pending-number',async page=>{
  await page.locator('#codeEditor').fill('10歩動く。');await page.waitForTimeout(300);await page.locator('#editorModeblocks').click();
  const field=page.locator('#blockEditor .blockui-node[data-schema-id="NumberLiteral"] [data-blockui-field="value"]');await field.fill('－');await settled(page);await restore(page);
  assert.equal(await field.inputValue(),'－');assert.equal(await page.evaluate(()=>Akari.app.editorState.main.pendingEdit.value),'－');
  await page.locator('#undoBtn').click();assert.equal(await page.evaluate(()=>Akari.app.editorState.main.pendingEdit),null);assert.equal(await field.inputValue(),'10');
  await page.locator('#redoBtn').click();assert.equal(await field.inputValue(),'－');return{input:'－',restored:'－',undo:'10',redo:'－'};
 });
 await run('history/browser-closed-return-hole',async page=>{
  await page.locator('#procBtn').click();await page.locator('#callableType').selectOption('function');await page.locator('#callableName').fill('書きかけの答え');await page.locator('#callableModeblocks').click();
  await openPaletteTools(page.locator('#callableBlocks'));await page.locator('#callableBlocks [data-blockui-search]').fill('ReturnStatement');await page.locator('#callableBlocks [data-blockui-schema="ReturnStatement"]').click();await page.locator('#procClose').click();await settled(page);await restore(page);
  assert.equal(await page.locator('#procModal').isVisible(),false);await page.locator('#procBtn').click();assert.equal(await page.locator('#callableName').inputValue(),'書きかけの答え');
  assert.equal(await page.locator('#callableBlocks .blockui-node[data-schema-id="Hole:expression"]').count(),1);return{name:'書きかけの答え',closed:true,reopened:true,hole:1};
 });
 await run('history/browser-quota-atomic',async page=>{
  await page.locator('#codeEditor').fill('「保存済み」と言う。');await settled(page);const before=await readRecord(page);assert.ok(before);
  await page.evaluate(()=>{IDBObjectStore.prototype.put=function(){throw new DOMException('quota','QuotaExceededError');};Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError');};});
  const source='「容量不足でも編集中の文は残る';await page.locator('#codeEditor').fill(source);await page.waitForFunction(()=>document.querySelector('#autosaveState').textContent.includes('失敗'),null,{timeout:12000});
  assert.deepEqual(await readRecord(page),before);assert.equal(await page.locator('#codeEditor').inputValue(),source);return{previousRecordUnchanged:true,pendingSource:source,failureShown:true};
 });
},180000);}catch(error){report.hostFailure=error.stack;}
report.status=!report.hostFailure&&report.pageErrors.length===0&&report.results.length===4&&report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';save();if(report.status!=='PASS')process.exitCode=1;
