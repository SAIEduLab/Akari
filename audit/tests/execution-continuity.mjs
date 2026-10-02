import { currentProductFile, currentProductVersion, currentReleaseFile } from "./../lib/product-path.cjs";
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import {gateSteps} from '../lib/gate-contract.mjs';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {sealBundle,verifyBundle} from '../lib/evidence-bundle.mjs';
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
    verifyGateResults(){verified++;},console:{log(){},error(){}}});
  assert.equal(launched,expected.length);
  const receipt=JSON.parse(written.get('/evidence/gate.json'));
  assert.deepEqual(receipt.steps.map(s=>s.id),expected);
  assert.equal(receipt.status,failureAt<0?'PASS':'FAIL');
  assert.equal(verified,failureAt<0?1:0);
  if(failureAt>=0)assert.equal(process.exitCode,1);
});
const aggregate=fs.readFileSync('audit/verify-evidence.mjs','utf8').replace(/^import .*;\r?\n/gm,'');
const kinds=['static','selftest','audio-codecs-linux','audio-codecs-win32',...['session','ui','limits','schemas','extra'].map(g=>'full-browser-'+g)];
const needs=Object.fromEntries(['static','selftest','full-browser-gate','audio-codecs'].map(k=>[k,{result:'success'}]));
for(const scenario of ['pass',...kinds,'missing-jobs','empty-jobs','cancelled-job','missing-job','unexpected-job'])check('aggregate:'+scenario,()=>{
  const calls=[],written=new Map(),n=clone(needs);
  if(scenario==='cancelled-job')n.selftest.result='cancelled';
  if(scenario==='missing-job')delete n.static;
  if(scenario==='unexpected-job')n.extra={result:'success'};
  const process={argv:['node','verifier','aggregate','/downloads','/aggregate/result.json'],env:{GITHUB_RUN_ID:'fixture',GITHUB_RUN_ATTEMPT:'1',AKARI_NEEDS:JSON.stringify(n)}};
  if(scenario==='missing-jobs')delete process.env.AKARI_NEEDS;
  if(scenario==='empty-jobs')process.env.AKARI_NEEDS='{}';
  vm.runInNewContext(aggregate,{fs:{mkdirSync(){},writeFileSync(p,s){written.set(p,s);}},path:path.posix,assert:relaxed,process,snapshot:()=>({fixture:true}),currentProductFile,currentProductVersion,currentReleaseFile,
    verifyBundle(kind){calls.push(kind);if(kind===scenario)throw Error('invalid evidence');return {result:{status:'PASS'}};}});
  assert.deepEqual(calls,kinds,'every bundle inspected after a failure');
  const report=JSON.parse(written.get('/aggregate/result.json'));
  assert.equal(report.status,scenario==='pass'?'MACHINE_PASS':'FAIL');assert.equal(report.candidateApproved,false);
  if(scenario!=='pass')assert.equal(process.exitCode,1);
});
const output=process.argv[2]||'audit-evidence/integrity.json';fs.mkdirSync(path.dirname(output),{recursive:true});
const base=fs.mkdtempSync(path.join(path.dirname(output),'integrity-'));
const provenance={run:'fixture',attempt:'1'};
function fixture(name){const dir=path.join(base,name);fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'static.json'),JSON.stringify({status:'PASS',snapshot:inputs,capabilities:260}));sealBundle('static',dir,provenance);return dir;}
for(const mode of ['valid','missing-file','extra-file','changed-bytes','changed-snapshot','changed-provenance','changed-kind','changed-result','rehashed-failure'])check('bundle:'+mode,()=>{
  const dir=fixture(mode),file=path.join(dir,'bundle.json'),b=JSON.parse(fs.readFileSync(file));
  if(mode==='missing-file')fs.renameSync(path.join(dir,'static.json'),path.join(dir,'moved.json'));
  if(mode==='extra-file')fs.writeFileSync(path.join(dir,'extra.txt'),'unlisted');
  if(mode==='changed-bytes')fs.appendFileSync(path.join(dir,'static.json'),' ');
  if(mode==='changed-snapshot')b.snapshot.productSha256='wrong';
  if(mode==='changed-provenance')b.provenance.attempt='2';
  if(mode==='changed-kind')b.kind='selftest';
  if(mode==='changed-result')b.result.capabilities=1;
  if(mode==='rehashed-failure'){const p=path.join(dir,'static.json'),r=JSON.parse(fs.readFileSync(p));r.status='FAIL';fs.writeFileSync(p,JSON.stringify(r));b.files['static.json']=sha(fs.readFileSync(p));}
  fs.writeFileSync(file,JSON.stringify(b));
  if(mode==='valid')verifyBundle('static',dir,inputs,provenance);else assert.throws(()=>verifyBundle('static',dir,inputs,provenance));
});
const freeze=fs.readFileSync('audit/freeze-release.mjs','utf8').replace(/^import .*;\r?\n/gm,'');
let frozen;
function freezeRun(record,changed){const fake={productSha256:'abc',files:{[currentProductFile()]:changed?'def':'abc',[currentReleaseFile()]:'self'}};
 vm.runInNewContext(freeze,{fs:{writeFileSync(p,s){frozen=s;},readFileSync(){return frozen;}},assert:relaxed,snapshot:()=>fake,sha,currentProductFile,currentProductVersion,currentReleaseFile,process:{argv:record?['--record']:[]},console:{log(){}}});}
check('freeze-record-and-verify',()=>{freezeRun(true,false);freezeRun(false,false);});
check('freeze-changed-file-refused',()=>assert.throws(()=>freezeRun(false,true)));
assert.deepEqual(snapshot(currentProductFile()),inputs);
fs.writeFileSync(output,JSON.stringify({status:'PASS',snapshot:inputs,results},null,2)+'\n');
console.log('Audit integrity: '+results.length+' PASS');
