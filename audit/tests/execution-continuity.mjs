import { currentProductFile, currentProductVersion, currentReleaseFile } from "./../lib/product-path.cjs";
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import {audioIds,codecBrowser} from '../lib/feature-contract.mjs';
import {gateSteps,auditBundleKinds,auditJobIds,integrityControlIds,acceptanceIds,verifyAcceptanceExecution} from '../lib/gate-contract.mjs';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {sealBundle,verifyBundle,selectBundleDirectory} from '../lib/evidence-bundle.mjs';
const inputs=snapshot(currentProductFile()),results=[];
const check=(id,fn)=>{fn();results.push({id,pass:true});};
const clone=x=>JSON.parse(JSON.stringify(x));
const relaxed={...assert,deepEqual:(a,b,m)=>assert.deepEqual(clone(a),clone(b),m)};
const source=fs.readFileSync('audit/run-local-gate.mjs','utf8').replace(/^import .*;\r?\n/gm,'');
const expected=gateSteps('/browser','/evidence').map(s=>s[0]);
// Keep baseline IDs stable when new gate steps are registered; still inject at the current first/middle/last steps.
for(const [id,failureAt] of [['gate-continuity:-1',-1],['gate-continuity:0',0],['gate-continuity:12',Math.floor(expected.length/2)],['gate-continuity:24',expected.length-1]])check(id,()=>{
  let launched=0,verified=0;const written=new Map();
  const process={argv:['node','runner','/browser','/evidence'],execPath:'/node'};
  const cp={spawnSync(){const i=launched++;return {status:i===failureAt?1:0,signal:null,stdout:'',stderr:''};}};
  const memoryFs={existsSync:()=>false,mkdirSync(){},writeFileSync(p,s){written.set(p,s);}};
  vm.runInNewContext(source,{fs:memoryFs,path:path.posix,cp,assert:relaxed,process,gateSteps,snapshot:()=>({fixture:true}),currentProductFile,currentProductVersion,currentReleaseFile,
    writeSummary(){},verifyGateResults(){verified++;},console:{log(){},error(){}}});
  assert.equal(launched,expected.length);
  const receipt=JSON.parse(written.get('/evidence/gate.json'));
  assert.deepEqual(receipt.steps.map(s=>s.id),expected);
  assert.equal(receipt.status,failureAt<0?'PASS':'FAIL');
  assert.equal(verified,failureAt<0?1:0);
  if(failureAt>=0)assert.equal(process.exitCode,1);
});
const aggregate=fs.readFileSync('audit/verify-evidence.mjs','utf8').replace(/^import .*;\r?\n/gm,'');
const kinds=auditBundleKinds;
const needs=Object.fromEntries(auditJobIds.map(k=>[k,{result:'success'}]));
const output=process.argv[2]||'audit-evidence/integrity.json';fs.mkdirSync(path.dirname(output),{recursive:true});
const base=fs.mkdtempSync(path.join(path.dirname(output),'integrity-'));
const downloads=path.resolve(base,'downloads');fs.mkdirSync(downloads);
// Exercise the real selector with a partial rerun: some kinds retain attempt 1.
const aggregateProvenance={repository:'SAIEduLab/Akari',testedCommit:'a'.repeat(40),candidateCommit:'b'.repeat(40),run:'123',attempt:'2',platform:'linux'};
const selectedAttempts=Object.fromEntries(kinds.map((kind,i)=>[kind,String(i%2?2:1)]));
for(const kind of kinds){
  fs.mkdirSync(path.join(downloads,'akari-'+kind+'-123-1'));
  if(selectedAttempts[kind]==='2')fs.mkdirSync(path.join(downloads,'akari-'+kind+'-123-2'));
}
for(const scenario of ['pass',...kinds,'missing-jobs','empty-jobs','cancelled-job','missing-job','unexpected-job'])check('aggregate:'+scenario,()=>{
  const calls=[],selections=[],written=new Map(),n=clone(needs);
  if(scenario==='cancelled-job')n.selftest.result='cancelled';
  if(scenario==='missing-job')delete n.selftest;
  if(scenario==='unexpected-job')n.extra={result:'success'};
  const process={argv:['node','verifier','aggregate',downloads,'/aggregate/result.json'],env:{GITHUB_RUN_ID:aggregateProvenance.run,GITHUB_RUN_ATTEMPT:aggregateProvenance.attempt,AKARI_NEEDS:JSON.stringify(n)}};
  if(scenario==='missing-jobs')delete process.env.AKARI_NEEDS;
  if(scenario==='empty-jobs')process.env.AKARI_NEEDS='{}';
  vm.runInNewContext(aggregate,{fs:{mkdirSync(){},writeFileSync(p,s){written.set(p,s);}},path:path.posix,assert:relaxed,process,snapshot:()=>({fixture:true}),currentProductFile,currentProductVersion,currentReleaseFile,
    auditBundleKinds,auditJobIds,executionProvenance:()=>aggregateProvenance,writeSummary(){},selectBundleDirectory(kind,directory,provenance){selections.push(kind);assert.equal(directory,downloads);assert.deepEqual(clone(provenance),{...aggregateProvenance,platform:kind==='audio-codecs-win32'?'win32':'linux'});return selectBundleDirectory(kind,directory,provenance);},
    verifyBundle(kind,directory,inputs,provenance){
      calls.push(kind);assert.equal(directory,path.join(downloads,'akari-'+kind+'-123-'+selectedAttempts[kind]));
      assert.deepEqual(clone(inputs),{fixture:true});assert.deepEqual(clone(provenance),{...aggregateProvenance,attempt:selectedAttempts[kind],platform:kind==='audio-codecs-win32'?'win32':'linux'});
      if(kind===scenario)throw Error('invalid evidence');return {result:{status:'PASS'}};
    }});
  assert.deepEqual(selections,kinds,'every kind selected after a failure');
  assert.deepEqual(calls,kinds,'every bundle inspected after a failure');
  const report=JSON.parse(written.get('/aggregate/result.json'));
  assert.deepEqual(report.results.map(r=>r.kind),kinds);
  for(const result of report.results){
    if(result.kind===scenario){assert.equal(result.status,'FAIL');assert.equal(result.reason,'invalid evidence');}
    else {assert.equal(result.status,'PASS');assert.deepEqual(result.provenance,{...aggregateProvenance,attempt:selectedAttempts[result.kind],platform:result.kind==='audio-codecs-win32'?'win32':'linux'});}
  }
  assert.equal(report.status,scenario==='pass'?'MACHINE_PASS':'FAIL');assert.equal(report.candidateApproved,false);
  if(scenario!=='pass')assert.equal(process.exitCode,1);
});
const provenance={run:'fixture',attempt:'1'};
function fixture(name){const dir=path.join(base,name);fs.mkdirSync(dir);const report={schema:'akari-audio-v1',status:'PASS',snapshot:inputs,browser:codecBrowser,playwright:'1.55.0',platform:'linux',executableSha256:'a'.repeat(64),pageErrors:[],networkRequests:[],fixtureManifestSha256:sha(fs.readFileSync('audit/fixtures/audio/manifest.json')),results:audioIds.map(id=>({id,pass:true,detail:'PASS'}))};fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report));sealBundle('audio-codecs-linux',dir,provenance);return dir;}
for(const mode of ['valid','missing-file','extra-file','changed-bytes','changed-snapshot','changed-provenance','changed-kind','changed-result','rehashed-failure'])check('bundle:'+mode,()=>{
  const dir=fixture(mode),file=path.join(dir,'bundle.json'),b=JSON.parse(fs.readFileSync(file));
  if(mode==='missing-file')fs.renameSync(path.join(dir,'report.json'),path.join(dir,'moved.json'));
  if(mode==='extra-file')fs.writeFileSync(path.join(dir,'extra.txt'),'unlisted');
  if(mode==='changed-bytes')fs.appendFileSync(path.join(dir,'report.json'),' ');
  if(mode==='changed-snapshot')b.snapshot.productSha256='wrong';
  if(mode==='changed-provenance')b.provenance.attempt='2';
  if(mode==='changed-kind')b.kind='selftest';
  if(mode==='changed-result')b.result.cases=1;
  if(mode==='rehashed-failure'){const p=path.join(dir,'report.json'),r=JSON.parse(fs.readFileSync(p));r.status='FAIL';fs.writeFileSync(p,JSON.stringify(r));b.files['report.json']=sha(fs.readFileSync(p));}
  fs.writeFileSync(file,JSON.stringify(b));
  if(mode==='valid')verifyBundle('audio-codecs-linux',dir,inputs,provenance);else assert.throws(()=>verifyBundle('audio-codecs-linux',dir,inputs,provenance));
});
const freeze=fs.readFileSync('audit/freeze-release.mjs','utf8').replace(/^import .*;\r?\n/gm,'');
let frozen;
function freezeRun(record,changed){
 vm.runInNewContext(freeze,{fs:{writeFileSync(p,s){frozen=s;},readFileSync(p){if(p==='audit/public-files.json')return JSON.stringify({files:[currentProductFile(),'LANGUAGE.md']});if(p===currentReleaseFile())return frozen;return Buffer.from(p+(changed?'changed':''));}},assert:relaxed,sha,currentProductFile,currentProductVersion,currentReleaseFile,process:{argv:record?['--record']:[]},console:{log(){}}});}
check('freeze-record-and-verify',()=>{freezeRun(true,false);freezeRun(false,false);});
check('freeze-changed-file-refused',()=>assert.throws(()=>freezeRun(false,true)));
for(const kind of ['composition','repair05']){const good={schema:'akari-acceptance-execution-v1',status:'PASS',snapshot:inputs,steps:acceptanceIds(kind).map((id,i)=>({id,status:'PASS',exit:0,signal:null,log:'step-'+i+'.log',ms:1}))};verifyAcceptanceExecution(good,kind,inputs);
 for(const [name,mutate]of [['missing',r=>r.steps.pop()],['duplicate',r=>r.steps[1]=r.steps[0]],['failed',r=>r.steps[0].status='FAIL'],['timeout',r=>r.steps[0].signal='SIGTERM'],['snapshot',r=>r.snapshot.inputSha256='wrong'],['fake-pass',r=>r.steps[0].exit=1]])check('execution:'+kind+'/'+name,()=>{const bad=clone(good);mutate(bad);assert.throws(()=>verifyAcceptanceExecution(bad,kind,inputs));});}
assert.deepEqual(results.map(r=>r.id),integrityControlIds);
assert.deepEqual(snapshot(currentProductFile()),inputs);
fs.writeFileSync(output,JSON.stringify({status:'PASS',snapshot:inputs,results},null,2)+'\n');
console.log('Audit integrity: '+results.length+' PASS');
