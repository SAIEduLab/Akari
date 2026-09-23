import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {snapshot} from '../lib/product-test-host.mjs';
import {sealBundle,verifyBundle} from '../lib/evidence-bundle.mjs';
import {verifyBrowserReport} from '../lib/verify-browser-results.mjs';
import {verifyCompletedProvenance} from '../lib/completed-baseline.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'akari-evidence-negative-')),inputs=snapshot('Akari.html');
let rejected=0;
const write=(p,x)=>fs.writeFileSync(path.join(dir,p),JSON.stringify(x));
try{
  write('static.json',{head:inputs.head,d09Count:28,inventoryRows:257,phases:Array.from({length:16},(_,i)=>i+1),selftestRequired:true,fullBrowserRequired:true});
  write('externalization-static.json',{status:'PASS',ids:884,completedBaseline:verifyCompletedProvenance()});
  write('workflow-preflight.json',{status:'PASS',workflowSha256:inputs.files['.github/workflows/akari-audit.yml']});
  const good=sealBundle('static',dir,{runId:'test',runAttempt:'1'});
  verifyBundle('static',dir,inputs,{runId:'test',runAttempt:'1'});
  for(const mutate of [b=>b.status='FAIL',b=>b.kind='selftest',b=>b.snapshot.head='stale',
    b=>b.snapshot.productSha256='different',b=>delete b.snapshot.files['AUDIT.md'],
    b=>b.provenance.runAttempt='2',b=>delete b.files['static.json'],b=>b.files['static.json']='bad',
    b=>b.result.fullBrowserRequired=false]){
    const bad=structuredClone(good);mutate(bad);write('bundle.json',bad);
    assert.throws(()=>verifyBundle('static',dir,inputs,{runId:'test',runAttempt:'1'}));rejected++;
  }
  write('bundle.json',good);fs.appendFileSync(path.join(dir,'static.json'),' ');
  assert.throws(()=>verifyBundle('static',dir,inputs,{runId:'test',runAttempt:'1'}));rejected++;
  const spec={task:'test',key:'id',keys:['required-A','required-B']};
  const report={browser:'test',sha256:inputs.productSha256,pageErrors:[],networkRequests:[],results:spec.keys.map(id=>({id,pass:true}))};
  verifyBrowserReport(report,spec,inputs);
  for(const mutate of [r=>r.results.pop(),r=>r.results.push(r.results[0]),r=>r.results[0].id='fake',r=>r.results[0].pass=false,
    r=>r.results[0].status='SKIP',r=>r.pageErrors.push('failure'),r=>r.networkRequests.push('https://invalid'),
    r=>r.sha256='different',r=>delete r.browser,r=>r.sourceUnchanged=false]){
    const bad=structuredClone(report);mutate(bad);assert.throws(()=>verifyBrowserReport(bad,spec,inputs));rejected++;
  }
  const focusSpec={task:'ui-stage-gesture',key:'id',keys:['stage-gesture:window-blur-cleans-up']};
  const event={type:'blur',target:'window',trusted:true};
  const focusReport={browser:'140.0.7339.16',sha256:inputs.productSha256,results:[{id:focusSpec.keys[0],pass:true,evidence:{
    environment:{phase:'gesture',headless:false,adapters:[1,2].map(()=>({playwright:'1.55.0',session:'playwright-main-frame',enabled:false})),lostFocus:{focused:false,events:[event]},regainedFocus:true},
    focusBeforeDrag:{focused:true},blurredFocus:false,blurred:{events:[event]}
  }}]};
  verifyBrowserReport(focusReport,focusSpec,inputs);
  for(const mutate of [e=>delete e.environment,e=>e.environment.phase='focus-preflight',e=>e.environment.headless=true,
    e=>e.environment.adapters.pop(),e=>e.environment.adapters[0].playwright='other',e=>e.environment.adapters[0].session='new-CDP-session',
    e=>e.environment.adapters[0].enabled=true,e=>e.environment.lostFocus.focused=true,e=>e.environment.lostFocus.events=[],
    e=>e.environment.regainedFocus=false,e=>e.focusBeforeDrag.focused=false,e=>e.blurredFocus=true,
    e=>e.blurred.events=[],e=>e.blurred.events[0].trusted=false]){
    const bad=structuredClone(focusReport);mutate(bad.results[0].evidence);
    assert.throws(()=>verifyBrowserReport(bad,focusSpec,inputs));rejected++;
  }
}finally{
  assert.ok(path.resolve(dir).startsWith(path.join(path.resolve(os.tmpdir()),'akari-evidence-negative-')));
  fs.rmSync(dir,{recursive:true,force:true});
}
console.log('Evidence validator: '+rejected+' invalid artifacts/reports rejected');
