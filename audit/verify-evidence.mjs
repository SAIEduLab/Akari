import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import {snapshot} from './lib/product-test-host.mjs';
import {sealBundle,verifyBundle} from './lib/evidence-bundle.mjs';
const [mode,kind,dir]=process.argv.slice(2);
const provenance={runId:process.env.GITHUB_RUN_ID||'local',runAttempt:process.env.GITHUB_RUN_ATTEMPT||'local'};
if(mode==='seal')console.log(JSON.stringify({kind,files:Object.keys(sealBundle(kind,dir,provenance).files).length}));
else if(mode==='aggregate'){
  try {
  const root=kind,output=dir,inputs=snapshot('Akari.html');
  const needs=JSON.parse(process.env.AKARI_NEEDS||'{}'),problems=[],bundles=[];
  const check=(label,fn)=>{try{return fn();}catch(error){problems.push({label,error:error.stack});return null;}};
  check('inventory',()=>cp.execFileSync(process.execPath,['audit/build-audit-inventory.mjs','--check'],{stdio:'inherit'}));
  check('review binding',()=>cp.execFileSync(process.execPath,['audit/verify-reviewed-inputs.mjs'],{stdio:'inherit'}));
  const locate=kind=>path.join(root,'akari-'+(kind==='static'||kind==='selftest'?kind+'-evidence':kind)+'-'+provenance.runId+'-'+provenance.runAttempt);
  check('static job',()=>assert.equal(needs.static?.result,'success','static job failed/skipped/cancelled'));
  const first=check('static bundle',()=>verifyBundle('static',locate('static'),inputs,provenance));
  if(first)bundles.push(first);
  const scope=first?.result||{selftestRequired:true,fullBrowserRequired:true};
  if(process.env.GITHUB_REF_NAME==='Akari_1_0_0')check('candidate scope',()=>assert.ok(scope.selftestRequired&&scope.fullBrowserRequired,'release candidate requires all gates'));
  const requiredKinds=['static'];
  if(scope.selftestRequired){
    requiredKinds.push('selftest');check('selftest job',()=>assert.equal(needs.selftest?.result,'success'));
    const b=check('selftest bundle',()=>verifyBundle('selftest',locate('selftest'),inputs,provenance));if(b)bundles.push(b);
  }
  if(scope.fullBrowserRequired){
    check('browser jobs',()=>assert.equal(needs['full-browser-gate']?.result,'success','browser matrix failed/skipped/cancelled'));
    for(const group of ['session','ui','limits','schemas','extra']){
      const kind='full-browser-'+group;requiredKinds.push(kind);
      const b=check(kind,()=>verifyBundle(kind,locate(kind),inputs,provenance));if(b)bundles.push(b);
    }
  }
  const required=requiredKinds.map(kind=>path.basename(locate(kind))).sort();
  check('artifact set',()=>assert.deepEqual(fs.readdirSync(root).sort(),required,'missing/unexpected job artifact'));
  if(problems.length)throw new Error(JSON.stringify({status:'FAIL',problems},null,2));
  if(fs.existsSync(output))throw Error('Aggregate output already exists');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const result={status:scope.fullBrowserRequired?'MACHINE_PASS':'SCOPE_ONLY',releaseComplete:false,snapshot:inputs,provenance,
    jobs:bundles.map(b=>({kind:b.kind,result:b.result})),semanticReview:'audit/records/phase4-semantic-review.md',
    completedBaseline:bundles.find(b=>b.kind==='selftest')?.result.completedBaseline,
    completion:'The fixed 1.0.0 baseline has a separately recorded completion decision. Machine results do not approve this candidate or replace its semantic review.'};
  if(scope.fullBrowserRequired){
    const inventory=JSON.parse(fs.readFileSync('audit/records/phase4-audit-inventory.json'));
    result.coverage={phases:inventory.phases.map(r=>({id:r.id,machine:'PASS',semantic:'separate source review and local attestation'})),
      d09:inventory.d09.map(r=>({id:r.id,machine:'PASS',phases:r.phases})),
      capabilities:inventory.capabilities.map(r=>({id:r.id,machine:'PASS',coreIds:r.core.map(c=>c.id),browserTasks:[...new Set(r.browser.map(b=>b.task))]})),
      language:inventory.language.map(r=>({id:r.id,machine:'PASS',ids:r.cases.map(c=>c.id)})),
      browserObligations:inventory.browserObligations.map(r=>({id:r.id,machine:'PASS',tasks:r.tasks}))};
  }
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(result.status);
  } catch(error) {
    const output=dir;fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify({status:'FAIL',releaseComplete:false,snapshot:snapshot('Akari.html'),provenance,needs:JSON.parse(process.env.AKARI_NEEDS||'{}'),error:error.stack},null,2)+'\n');
    throw error;
  }
}else throw Error('Expected seal <kind> <directory> or aggregate <downloads> <new-output>');
