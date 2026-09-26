import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import {gateSteps} from '../lib/gate-contract.mjs';
const source=fs.readFileSync('audit/run-local-gate.mjs','utf8').replace(/^import .*;\r?\n/gm,'');
const expected=gateSteps('/browser','/evidence').map(s=>s[0]);
for(const failureAt of [-1,0,7,expected.length-1]){
  let launched=0,verified=0;const written=new Map(),logs=[];
  const process={argv:['node','runner','/browser','/evidence'],execPath:'/node',version:'test',platform:'test'};
  const cp={spawnSync(){const i=launched++;return {status:i===failureAt?1:0,signal:null,stdout:'',stderr:i===failureAt?'injected failure':''};}};
  const memoryFs={existsSync:()=>false,mkdirSync(){},writeFileSync(p,s){written.set(p,s);}};
  // The in-memory filesystem uses POSIX keys on every host, including Windows.
  vm.runInNewContext(source,{fs:memoryFs,path:path.posix,cp,assert,process,gateSteps,snapshot:()=>({head:'fixture'}),
    verifyGateResults(){verified++;return {};},console:{log:s=>logs.push(s),error:s=>logs.push(s)}});
  assert.equal(launched,expected.length,'no early exit after any failed step');
  const receipt=JSON.parse(written.get('/evidence/gate.json'));
  assert.deepEqual(receipt.steps.map(s=>s.id),expected);
  if(failureAt>=0){assert.equal(receipt.status,'FAIL');assert.equal(process.exitCode,1);assert.equal(verified,0);}
  else {assert.equal(receipt.status,'PASS');assert.equal(verified,1);}
}
console.log(`Execution continuity: ${expected.length} steps attempted for first/middle/last failure; failed verdict preserved`);
const aggregateSource=fs.readFileSync('audit/verify-evidence.mjs','utf8').replace(/^import .*;\r?\n/gm,'');
const kinds=['static','selftest','audio-codecs-linux','audio-codecs-win32',...['session','ui','limits','schemas','extra'].map(g=>'full-browser-'+g)];
for(const failureAt of [-2,-1,0,1,2,3,6,8]){
  const calls=[],written=new Map(),needs={static:{result:'success'},selftest:{result:'success'},'full-browser-gate':{result:'success'},'audio-codecs':{result:'success'}};
  const process={argv:['node','verifier','aggregate','/downloads','/aggregate/result.json'],env:{GITHUB_RUN_ID:'test',GITHUB_RUN_ATTEMPT:'1',GITHUB_REF_NAME:'Akari_1_0_0',AKARI_NEEDS:JSON.stringify(needs)}};
  const memoryFs={existsSync:()=>false,mkdirSync(){},writeFileSync(p,s){written.set(p,s);},
    readdirSync:()=>kinds.map(k=>'akari-'+(['static','selftest'].includes(k)?k+'-evidence':k)+'-test-1'),
    readFileSync:()=>JSON.stringify({phases:[],d09:[],capabilities:[],language:[],browserObligations:[]})};
  let threw=false;
  try{vm.runInNewContext(aggregateSource,{fs:memoryFs,path:path.posix,assert:{...assert,deepEqual:(a,b,message)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),message)},process,cp:{execFileSync(){if(failureAt===-2)throw Error('injected inventory/binding failure');}},snapshot:()=>({head:'fixture'}),
    verifyCompletedProvenance(){return {releaseComplete:true,sourceCommit:'completed-fixed-fixture'};},
    verifyBundle(kind){calls.push(kind);if(kind===kinds[failureAt])throw Error('injected invalid bundle');return {kind,result:kind==='static'?{selftestRequired:true,fullBrowserRequired:true}:{}};},console:{log(){}}});}
  catch{threw=true;}
  assert.deepEqual(calls,kinds,'aggregate must inspect all nine bundles even if an earlier one fails');
  const report=JSON.parse(written.get('/aggregate/result.json'));
  assert.equal(threw,failureAt!==-1);assert.equal(report.status,failureAt===-1?'MACHINE_PASS':'FAIL');assert.equal(report.candidateApproved,false);
  if(failureAt===-1)assert.equal(report.completedRelease.releaseComplete,true);
}
console.log('Aggregate continuity: all 9 bundles inspected; failure artifact written and failure exit retained');
