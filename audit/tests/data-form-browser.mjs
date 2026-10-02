import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {browserEnvironment} from '../lib/browser-environment.mjs';
const require=createRequire(import.meta.url),[chrome,outputArg]=process.argv.slice(2),output=path.resolve(outputArg),product=currentProductFile();
const report={schema:'akari-data-form-browser-v1',status:'RUNNING',snapshot:snapshot(product),uxAcceptance:false,environment:{browser:null,playwright:require('playwright/package.json').version},pageErrors:[],results:[]};
fs.mkdirSync(path.dirname(output),{recursive:true});const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
try{await withBrowser(chrome,async browser=>{
 report.environment.browser=browser.version();assert.equal(browser.version(),browserEnvironment.version);assert.equal(report.environment.playwright,browserEnvironment.playwright);
 const run=async(id,fn)=>{const row={id,status:'RUNNING'};report.results.push(row);try{row.observed=await pageFor(browser,product,async page=>{page.setDefaultTimeout(8000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>report.pageErrors.push(e.message));await page.locator('#uiLevel').selectOption('advanced');return fn(page);});row.status='PASS';}catch(error){row.status='FAIL';row.error=error.stack;}save();console.log(row.status+' '+id);};
 await run('data/browser-declared-point-runtime',async page=>{
  await page.locator('#dataBtn').click();await page.locator('#dataName').fill('得点');await page.locator('#dataInitial').fill('0');await page.locator('#dataUnit').selectOption('点');await page.locator('#dataAdd').click();
  const declared=await page.evaluate(()=>Akari.app.project.projectData.variables.find(d=>d.name==='得点'));assert.equal(declared.expectedUnit,'点');assert.deepEqual(declared.initialValue,{magnitude:0,unit:'点'});
  await page.locator('#dataClose').click();await page.locator('#objectSelect').selectOption('sprite-1');await page.locator('#eventSelect').selectOption('start');if(await page.locator('#sourceOverview').isVisible())await page.locator('#sourceEditBtn').click();await page.locator('#editorModecode').click();
  await page.locator('#codeEditor').fill('3回くり返す。\n  得点に1点を足す。\n得点を言う。');await page.locator('#runBtn').click();await page.waitForFunction(()=>document.querySelector('#formSurface').textContent.includes('3点'));await page.locator('#stopBtn').click();
  assert.deepEqual(await page.evaluate(()=>Akari.app.project.projectData.variables.find(d=>d.name==='得点').initialValue),{magnitude:0,unit:'点'});return{initial:{magnitude:0,unit:'点'},runtime:'3点',designUnchanged:true};
 });
 await run('data/browser-list-lines-and-local-error',async page=>{
  await page.locator('#dataBtn').click();await page.locator('#dataKind').selectOption('list');await page.locator('#dataName').fill('持ち物');await page.locator('#dataInitial').fill('本、かさ');const before=await page.evaluate(()=>JSON.stringify(Akari.app.project));await page.locator('#dataAdd').click();
  assert.equal(await page.locator('#dataFormError').isVisible(),true);assert.equal(await page.locator('#dataInitial').getAttribute('aria-invalid'),'true');assert.equal(await page.locator('#dataInitial').inputValue(),'本、かさ');assert.equal(await page.evaluate(()=>JSON.stringify(Akari.app.project)),before);
  await page.locator('#dataListMode').selectOption('lines');await page.locator('#dataItems').fill('本\nかさ\nぼうし');await page.locator('#dataAdd').click();assert.deepEqual(await page.evaluate(()=>Akari.app.project.projectData.lists.find(d=>d.name==='持ち物').initialValue),['本','かさ','ぼうし']);assert.equal(await page.locator('#dataFormError').isVisible(),false);
  return{localError:true,inputPreserved:true,failedDesignUnchanged:true,items:['本','かさ','ぼうし']};
 });
 await run('data/browser-unit-error-cancel',async page=>{
  await page.locator('#dataBtn').click();await page.locator('#dataName').fill('時間違い');await page.locator('#dataInitial').fill('0秒');await page.locator('#dataUnit').selectOption('点');const before=await page.evaluate(()=>JSON.stringify(Akari.app.project));await page.locator('#dataAdd').click();
  const message=await page.locator('#dataFormError').textContent();assert.ok(message.includes('秒')&&message.includes('点'));assert.equal(await page.locator('#dataInitial').inputValue(),'0秒');await page.locator('#dataClose').click();assert.equal(await page.evaluate(()=>JSON.stringify(Akari.app.project)),before);return{wrongUnitRejected:true,input:'0秒',designUnchanged:true};
 });
},90000);}catch(error){report.hostFailure=error.stack;}
report.status=!report.hostFailure&&!report.pageErrors.length&&report.results.length===3&&report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';save();if(report.status!=='PASS')process.exitCode=1;
