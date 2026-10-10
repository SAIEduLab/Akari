import { currentProductFile } from "./../lib/product-path.cjs";
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
import {selectBundleDirectory,verifyBundle} from '../lib/evidence-bundle.mjs';
import {sha,pageFor} from '../lib/product-test-host.mjs';
import {installRegressionProject} from '../lib/gate-ui-fixture.mjs';
import {editorAssetIds} from '../lib/feature-contract.mjs';
import {browserEnvironment as expected,verifyBrowserEnvironment} from '../lib/browser-environment.mjs';
import {uiButtonIds,checkUiButtonValidatorNegatives} from '../lib/ui-buttons-contract.mjs';
const {withFreshPage}=createRequire(import.meta.url)('../browser/cases/ui-case.cjs');
// Reproduce the actual product's 350 ms post-cancel click guard with a controlled clock.
const source=fs.readFileSync(currentProductFile(),'utf8');
const start=source.indexOf('    function cancelDrag() {'),end=source.indexOf('    function previewDrag(',start);
assert.ok(start>0&&end>start);
const sandbox={Date:{now:()=>1000},drag:{started:true},ghost:null,snapPreview:null,dragFrame:null,
  suppressClickUntil:0,root:{querySelectorAll:()=>[],classList:{remove(){}}},notifyPending(){},updateControls(){}};
vm.runInNewContext(source.slice(start,end)+';cancelDrag();',sandbox);
assert.equal(sandbox.suppressClickUntil,1350);assert.equal(sandbox.drag,null);
const clickStart=source.indexOf("        if (Date.now() < suppressClickUntil) {",end);
const clickEnd=source.indexOf('\n      },',clickStart);assert.ok(clickStart>end&&clickEnd>clickStart);
let suppressed=0;sandbox.event={preventDefault(){suppressed++;},stopImmediatePropagation(){}};
vm.runInNewContext(source.slice(clickStart,clickEnd),sandbox);assert.equal(suppressed,1);

// Exercise the same case lifecycle used by ui-interactions. A previous page cannot
// leak suppression or storage; failures are propagated once, never retried.
let contexts=0,closed=0,calls=0;const routeCallbacks=[],pages=[];
const browser={async newContext(options){
  contexts++;assert.deepEqual(options,{viewport:{width:1440,height:1800}});
  const page={suppressed:false,storage:{},listeners:{},setDefaultTimeout(ms){assert.equal(ms,10000);},
    on(name,fn){this.listeners[name]=fn;},async goto(url){assert.equal(url,'file:///fixture.html');}};
  pages.push(page);return {async route(pattern,fn){assert.ok(pattern.test('https://example.test'));routeCallbacks.push(fn);},async newPage(){return page;},async close(){closed++;}};
}};
const config={url:'file:///fixture.html',errors:[],networkRequests:[]};
await withFreshPage(browser,config,async p=>{p.suppressed=true;p.storage.draft='prior';});
await withFreshPage(browser,config,async p=>{assert.equal(p.suppressed,false);assert.deepEqual(p.storage,{});});
const failure=new Error('real test failure');
await assert.rejects(withFreshPage(browser,config,async()=>{calls++;throw failure;}),e=>e===failure);
assert.equal(calls,1);assert.equal(contexts,3);assert.equal(closed,3);
pages[0].listeners.pageerror({stack:'observed page error'});assert.deepEqual(config.errors,['observed page error']);
let aborted=0;await routeCallbacks[0]({request:()=>({url:()=> 'https://example.test'}),abort:()=>{aborted++;}});
assert.deepEqual(config.networkRequests,['https://example.test']);assert.equal(aborted,1);
let startupClosed=0;
await assert.rejects(withFreshPage({async newContext(){return {async route(){},async newPage(){throw failure;},async close(){startupClosed++;}};}},config,()=>assert.fail('must not run')),e=>e===failure);
assert.equal(startupClosed,1);

const inputs={head:'fixture',files:{}},good={status:'PASS',snapshot:inputs,playwright:expected.playwright,
  revision:expected.revision,browser:expected.version,executablePath:'/test/chromium',executableSha256:'a'.repeat(64),
  launchTimeout:15000,launches:[1,2,3].map(id=>({id,browser:expected.version,ms:100,scriptResult:42,mp3:true}))};
verifyBrowserEnvironment(good,inputs);let rejected=0;
for(const mutate of [r=>r.status='FAIL',r=>r.snapshot.head='other',r=>r.playwright='other',r=>r.revision='other',
  r=>r.browser='other',r=>r.launchTimeout=30000,r=>r.executableSha256='bad',r=>r.executablePath='',
  r=>r.launches.pop(),r=>r.launches[0].id=2,r=>r.launches[0].browser='other',
  r=>r.launches[0].ms=15001,r=>r.launches[0].ms=-1,r=>r.launches[0].scriptResult=0,r=>r.launches[0].mp3=false]){
  const bad=structuredClone(good);mutate(bad);assert.throws(()=>verifyBrowserEnvironment(bad,inputs));rejected++;
}
console.log(`CI regression: actual click guard reproduced; fresh-context isolation and cleanup PASS; ${rejected} invalid environments rejected`);

// Reproduce Chromium 140's per-agent early return with two CDP sessions.
// The old newCDPSession(false) call does nothing; the adapter must target the
// existing owner. No product state or browser event is replaced by this test.
const adapterSource=fs.readFileSync('audit/browser/cases/native-focus.cjs','utf8');
function loadAdapter(version='1.55.0'){
  const module={exports:{}};
  vm.runInNewContext(adapterSource,{module,require(name){
    if(name==='node:assert/strict')return assert;
    if(name==='playwright/package.json')return {version};
    throw Error('unexpected dependency '+name);
  }});
  return module.exports.disableFocusEmulation;
}
let focused=true,ownerFlag=true,otherFlag=false,ownerCalls=0;
const owner={async send(method,params){
  assert.equal(method,'Emulation.setFocusEmulationEnabled');assert.equal(params.enabled,false);
  ownerCalls++;if(params.enabled===ownerFlag)return;ownerFlag=params.enabled;focused=ownerFlag;
}};
const unrelated={async send(method,params){if(params.enabled===otherFlag)return;otherFlag=params.enabled;focused=otherFlag;}};
await unrelated.send('Emulation.setFocusEmulationEnabled',{enabled:false});assert.equal(focused,true,'old call must reproduce retained emulation');
const page={_connection:{toImpl(value){assert.equal(value,page);return {delegate:{_mainFrameSession:{_client:owner}}};}}};
const receipt=await loadAdapter()(page);assert.equal(ownerCalls,1);assert.equal(focused,false);assert.equal(receipt.session,'playwright-main-frame');
await assert.rejects(loadAdapter('other')(page));
await assert.rejects(loadAdapter()({}));
await assert.rejects(loadAdapter()({_connection:{toImpl(){return {};}}}));
const denied=new Error('CDP failure');
await assert.rejects(loadAdapter()({_connection:{toImpl(){return {delegate:{_mainFrameSession:{_client:{send(){throw denied;}}}}};}}}),e=>e===denied);
console.log('Native focus adapter: old-session failure reproduced; owning-session disable PASS; 4 invalid/error paths rejected');

// Execute the actual button runner with fixture/cleanup failures, without a browser retry.
const buttonSource=fs.readFileSync('audit/tests/ui-buttons.mjs','utf8');
const runnerStart=buttonSource.indexOf('// Isolate fixture/browser failures');
const runnerEnd=buttonSource.indexOf('assert.deepEqual(snapshot',runnerStart);
assert.ok(runnerStart>0&&runnerEnd>runnerStart);
const fixtureError=new Error('fixture import timeout'),cleanupError=new Error('Product test host timeout');
const actionError=new Error('real button assertion');
let launches=0,cleanup=0,clock=0;const budgets=[],attempted=[],buttonResults=[];
await vm.runInNewContext('(async()=>{'+buttonSource.slice(runnerStart,runnerEnd)+'})()',{
  assert,browserPath:'fixture-browser',currentProductFile:()=> 'fixture.html',results:buttonResults,
  console:{log(){},error(){}},Date:{now:()=>clock++*1000},
  cases:Object.fromEntries(uiButtonIds.map((id,i)=>[id,async()=>{attempted.push(id);if(i===1)throw actionError;return {checked:true};}])),
  async withBrowser(browserPath,fn,budget){
    assert.equal(browserPath,'fixture-browser');budgets.push(budget);launches++;
    try{return await fn({id:launches,version:()=>expected.version});}finally{cleanup++;}
  },
  async pageFor(browser,product,fn){
    assert.equal(product,'fixture.html');
    try{return await fn({id:browser.id,on(){},async setViewportSize(){}});}
    finally{if(browser.id===1)throw cleanupError;}
  },
  async installRegressionProject(page){if(page.id===1)throw fixtureError;},async select(){},
});
assert.equal(launches,uiButtonIds.length);assert.equal(cleanup,launches);
assert.deepEqual(attempted,uiButtonIds.slice(1));
assert.deepEqual(buttonResults.map(r=>r.id),[...uiButtonIds]);
assert.equal(buttonResults[0].phase,'fixture-import');assert.equal(buttonResults[0].detail,fixtureError.stack);
assert.equal(buttonResults[0].hostFailure,cleanupError.stack);assert.equal(buttonResults[0].pass,false);
assert.equal(buttonResults[1].phase,'button-actions');assert.equal(buttonResults[1].detail,actionError.stack);
assert.equal(buttonResults[1].pass,false);assert.ok(buttonResults.slice(2).every(r=>r.pass));
assert.ok(budgets.every((n,i)=>n>0&&n<=360000&&(i===0||n<budgets[i-1])));
checkUiButtonValidatorNegatives();
console.log('UI buttons: fixture/cleanup and assertion failures retained; all cases isolated without retry; 360s budget and 10 validator negatives PASS');

// A partial rerun may use an unchanged earlier job, but never hide a newer failure.
const evidenceRoot=path.resolve('audit-evidence');fs.mkdirSync(evidenceRoot,{recursive:true});
const selectionDir=fs.mkdtempSync(path.join(evidenceRoot,'ci-regression-'));
try {
  const provenance={run:'123',attempt:'3'},snapshotInputs={productSha256:'a'.repeat(64),files:{}};
  function staticBundle(attempt){
    const dir=path.join(selectionDir,'akari-static-123-'+attempt);fs.mkdirSync(dir);
    const report={status:'PASS',snapshot:snapshotInputs,capabilities:260};
    fs.writeFileSync(path.join(dir,'static.json'),JSON.stringify(report));
    const bundle={schema:'akari-evidence-v1',kind:'static',status:'PASS',snapshot:snapshotInputs,
      provenance:{run:'123',attempt:String(attempt)},result:{status:'PASS',capabilities:260},
      files:{'static.json':sha(fs.readFileSync(path.join(dir,'static.json')))}};
    fs.writeFileSync(path.join(dir,'bundle.json'),JSON.stringify(bundle));return {dir,bundle};
  }
  const old=staticBundle(1);let selected=selectBundleDirectory('static',selectionDir,provenance);
  assert.equal(selected.attempt,1);verifyBundle('static',selected.directory,snapshotInputs,selected.provenance);
  const latest=staticBundle(2);selected=selectBundleDirectory('static',selectionDir,provenance);
  assert.equal(selected.attempt,2);verifyBundle('static',selected.directory,snapshotInputs,selected.provenance);
  assert.throws(()=>verifyBundle('static',latest.dir,snapshotInputs,provenance),'actual attempt must match');
  assert.throws(()=>verifyBundle('static',latest.dir,{...snapshotInputs,productSha256:'b'.repeat(64)},selected.provenance),'same snapshot required');
  fs.writeFileSync(path.join(latest.dir,'bundle.json'),JSON.stringify({...latest.bundle,status:'FAIL'}));
  assert.throws(()=>verifyBundle('static',selectBundleDirectory('static',selectionDir,provenance).directory,snapshotInputs,selected.provenance),'new failure cannot use old PASS');
  fs.unlinkSync(path.join(latest.dir,'bundle.json'));
  assert.throws(()=>verifyBundle('static',selectBundleDirectory('static',selectionDir,provenance).directory,snapshotInputs,selected.provenance),'unsealed latest cannot use old PASS');
  assert.throws(()=>selectBundleDirectory('static',selectionDir,{run:'999',attempt:'3'}),'different run');
  assert.throws(()=>selectBundleDirectory('selftest',selectionDir,provenance),'missing kind');
  fs.mkdirSync(path.join(selectionDir,'akari-static-123-4'));
  assert.throws(()=>selectBundleDirectory('static',selectionDir,provenance),'future attempt');
  fs.rmdirSync(path.join(selectionDir,'akari-static-123-4'));
  fs.mkdirSync(path.join(selectionDir,'akari-static-123-02'));
  assert.throws(()=>selectBundleDirectory('static',selectionDir,provenance),'noncanonical attempt');
} finally {
  const relative=path.relative(evidenceRoot,selectionDir);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
  fs.rmSync(selectionDir,{recursive:true});
}
console.log('Partial reruns: latest evidence selected; actual provenance, snapshot, newer failures and 8 rejection paths PASS');

// Execute the actual asset runner with a screenshot that never resolves.
const assetSource=fs.readFileSync('audit/tests/editor-assets.mjs','utf8');
const assetStart=assetSource.indexOf('async function failureScreenshot('),assetEnd=assetSource.indexOf('assert.deepEqual(snapshot',assetStart);
assert.ok(assetStart>0&&assetEnd>assetStart);
const assetResults=[],assetBudgets=[],assetAttempts=[],diagnostics=[];let assetClock=0,assetLaunches=0,screenshotCalls=0;
await vm.runInNewContext('(async()=>{'+assetSource.slice(assetStart,assetEnd)+'})()',{
  assert,fs:{writeFileSync(file,data){diagnostics.push({file,report:JSON.parse(data)});}},path,artifacts:'fixture-artifacts',
  browserPath:'fixture-browser',currentProductFile:()=> 'fixture.html',results:assetResults,pageErrors:[],networkRequests:[],
  console:{log(){},error(){}},Date:{now:()=>assetClock++*1000},
  setTimeout(fn,ms){assert.equal(ms,1000);Promise.resolve().then(fn);return 1;},clearTimeout(){},
  cases:Object.fromEntries(editorAssetIds.map((id,i)=>[id,async()=>{assetAttempts.push(id);if(i===1)throw actionError;}])),
  async withBrowser(browser,fn,budget){assetBudgets.push(budget);assetLaunches++;return fn({id:assetLaunches,version:()=>expected.version});},
  async pageFor(browser,product,fn,options){
    assert.equal(product,'fixture.html');assert.deepEqual(JSON.parse(JSON.stringify(options)),{viewport:{width:1440,height:1100}});
    try {return await fn({id:browser.id,on(){},screenshot(options){assert.equal(options.timeout,1000);assert.equal(diagnostics.length,++screenshotCalls);return new Promise(()=>{});}});}
    finally {if(browser.id===1)throw cleanupError;}
  },async installRegressionProject(p){if(p.id===1)throw fixtureError;},
});
assert.deepEqual(assetResults.map(r=>r.id),[...editorAssetIds]);assert.deepEqual(assetAttempts,editorAssetIds.slice(1));
assert.equal(assetResults[0].detail,fixtureError.stack);assert.equal(assetResults[0].phase,'fixture-import');assert.equal(assetResults[0].hostFailure,cleanupError.stack);
assert.equal(assetResults[1].detail,actionError.stack);assert.equal(assetResults[1].phase,'asset-actions');
assert.ok(assetResults.slice(0,2).every(r=>!r.pass&&/Failure screenshot timeout/.test(r.screenshotFailure)));
assert.ok(assetResults.slice(2).every(r=>r.pass));assert.equal(assetLaunches,editorAssetIds.length);
assert.ok(assetBudgets.every((n,i)=>n>0&&n<=300000&&(i===0||n<assetBudgets[i-1])));
console.log('Asset diagnostics: original errors persisted before stalled screenshots; later cases run once; 300s budget PASS');

let contextClosed=0,viewportOptions;
await pageFor({async newContext(options){viewportOptions=options;return {async route(){},async newPage(){return {on(){},setDefaultTimeout(ms){assert.equal(ms,30000);},async goto(){},async waitForFunction(){}};},async close(){contextClosed++;}};}},'fixture.html',async()=>{}, {viewport:{width:1440,height:1100},offline:false});
assert.deepEqual(viewportOptions,{viewport:{width:1440,height:1100},offline:true});assert.equal(contextClosed,1);
await installRegressionProject({async evaluate(){return {name:'監査の基準作品',text:'fixture'};},locator(){return {async setInputFiles(){},async selectOption(){},async isVisible(){return false;},async click(){}};},async waitForFunction(predicate,name,options){
  assert.equal(options.polling,100);
  const ready=(state,input)=>vm.runInNewContext('('+predicate.toString()+')('+JSON.stringify(name)+')',{document:{querySelector:()=>({value:input})},Akari:{app:{project:{name},editorState:{state}}}});
  assert.equal(ready('DESIGN','pending-file'),false);assert.equal(ready('PREPARING',''),false);assert.equal(ready('DESIGN',''),true);
}});
console.log('Fixture readiness: unfinished import/state rejected; initial viewport and offline context preserved PASS');
