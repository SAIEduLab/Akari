import {runWorkAuthorizationChecks} from './work-authorization.mjs';
import {runLanguageReleaseChecks} from './language-release.mjs';
import { currentProductFile, currentProductVersion, currentReleaseFile, currentLanguageFile } from "./../lib/product-path.cjs";
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import {audioIds,codecBrowser} from '../lib/feature-contract.mjs';
import {gateSteps,auditBundleKinds,auditJobIds,integrityControlIds,acceptanceIds,acceptanceCommands,verifyAcceptanceExecution} from '../lib/gate-contract.mjs';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {sealBundle,verifyBundle,selectBundleDirectory} from '../lib/evidence-bundle.mjs';
import {gateCaseIds,nodeProductCaseIds,caseReport,verifyGateCaseReports,currentReleaseRecord} from '../lib/gate-case-contract.mjs';
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
const aggregateProvenance={repository:'SAIEduLab/Akari',testedCommit:'a'.repeat(40),candidateCommit:'b'.repeat(40),run:'123',attempt:'2',platform:'win32'};
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
    auditBundleKinds,auditJobIds,executionProvenance:()=>aggregateProvenance,writeSummary(){},selectBundleDirectory(kind,directory,provenance){selections.push(kind);assert.equal(directory,downloads);assert.deepEqual(clone(provenance),{...aggregateProvenance,platform:'win32'});return selectBundleDirectory(kind,directory,provenance);},
    verifyBundle(kind,directory,inputs,provenance){
      calls.push(kind);assert.equal(directory,path.join(downloads,'akari-'+kind+'-123-'+selectedAttempts[kind]));
      assert.deepEqual(clone(inputs),{fixture:true});assert.deepEqual(clone(provenance),{...aggregateProvenance,attempt:selectedAttempts[kind],platform:'win32'});
      if(kind===scenario)throw Error('invalid evidence');return {result:{status:'PASS'}};
    }});
  assert.deepEqual(selections,kinds,'every kind selected after a failure');
  assert.deepEqual(calls,kinds,'every bundle inspected after a failure');
  const report=JSON.parse(written.get('/aggregate/result.json'));
  assert.deepEqual(report.results.map(r=>r.kind),kinds);
  for(const result of report.results){
    if(result.kind===scenario){assert.equal(result.status,'FAIL');assert.equal(result.reason,'invalid evidence');}
    else {assert.equal(result.status,'PASS');assert.deepEqual(result.provenance,{...aggregateProvenance,attempt:selectedAttempts[result.kind],platform:'win32'});}
  }
  assert.equal(report.status,scenario==='pass'?'MACHINE_PASS':'FAIL');assert.equal(report.candidateApproved,false);
  if(scenario!=='pass')assert.equal(process.exitCode,1);
});
const provenance={run:'fixture',attempt:'1',platform:'linux'};
function fixture(name){const dir=path.join(base,name);fs.mkdirSync(dir);const report={schema:'akari-audio-v1',status:'PASS',snapshot:inputs,browser:codecBrowser,playwright:'1.55.0',platform:'linux',executableSha256:'a'.repeat(64),pageErrors:[],networkRequests:[],fixtureManifestSha256:sha(fs.readFileSync('audit/fixtures/audio/manifest.json')),results:audioIds.map(id=>({id,pass:true,detail:'PASS'}))};fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report));sealBundle('audio-codecs-linux',dir,provenance);return dir;}
for(const mode of ['valid','missing-file','extra-file','changed-bytes','changed-snapshot','changed-provenance','wrong-platform','changed-kind','changed-result','rehashed-failure'])check('bundle:'+mode,()=>{
  const dir=fixture(mode),file=path.join(dir,'bundle.json'),b=JSON.parse(fs.readFileSync(file));
  if(mode==='missing-file')fs.renameSync(path.join(dir,'report.json'),path.join(dir,'moved.json'));
  if(mode==='extra-file')fs.writeFileSync(path.join(dir,'extra.txt'),'unlisted');
  if(mode==='changed-bytes')fs.appendFileSync(path.join(dir,'report.json'),' ');
  if(mode==='changed-snapshot')b.snapshot.productSha256='wrong';
  if(mode==='changed-provenance')b.provenance.attempt='2';
  if(mode==='wrong-platform')b.provenance.platform='win32';
  if(mode==='changed-kind')b.kind='selftest';
  if(mode==='changed-result')b.result.cases=1;
  if(mode==='rehashed-failure'){const p=path.join(dir,'report.json'),r=JSON.parse(fs.readFileSync(p));r.status='FAIL';fs.writeFileSync(p,JSON.stringify(r));b.files['report.json']=sha(fs.readFileSync(p));}
  fs.writeFileSync(file,JSON.stringify(b));
  if(mode==='valid')verifyBundle('audio-codecs-linux',dir,inputs,provenance);else assert.throws(()=>verifyBundle('audio-codecs-linux',dir,inputs,provenance));
});
const freeze=fs.readFileSync('audit/freeze-release.mjs','utf8').replace(/^import .*;\r?\n/gm,'');
// Fixture contract numbers differ from the product's, so the record proves where they come from.
const fixtureContract={languageContractId:5,runtimeContractId:6,programFormatVersion:7,projectFormatVersion:8};
const currentRelease=path.posix.basename(currentReleaseFile());
let frozen;
function freezeRun(record,{changed=false,contract=fixtureContract,releases=[currentRelease]}={}){
 vm.runInNewContext(freeze,{fs:{writeFileSync(p,s){frozen=s;},readdirSync(p){assert.equal(p,'audit/manifests');return ['features.json',...releases,'samples.json'];},readFileSync(p){if(p==='audit/public-files.json')return JSON.stringify({files:[currentProductFile(),currentLanguageFile()]});if(p==='audit/manifests/features.json')return JSON.stringify({EXECUTABLE_CONTRACT:contract});if(p===currentReleaseFile())return frozen;return Buffer.from(p+(changed?'changed':''));}},assert:relaxed,sha,currentProductFile,currentProductVersion,currentReleaseFile,currentLanguageFile,assertLanguageInventory(){},prepareLanguageRelease(){},verifyLanguageRelease(){},process:{argv:record?['--record']:[],cwd:()=>'.'},console:{log(){}}});}
check('freeze-record-and-verify',()=>{freezeRun(true);freezeRun(false);runLanguageReleaseChecks();runWorkAuthorizationChecks();});
check('freeze-changed-file-refused',()=>assert.throws(()=>freezeRun(false,{changed:true}),/Current distribution differs/));
check('freeze-contract-from-features',()=>{frozen=undefined;freezeRun(true);const r=JSON.parse(frozen);assert.deepEqual([r.languageContractId,r.runtimeContractId,r.programFormat,r.projectFormat],[5,6,7,8]);freezeRun(false);});
check('freeze-changed-contract-refused',()=>{freezeRun(true);for(const key of Object.keys(fixtureContract))assert.throws(()=>freezeRun(false,{contract:{...fixtureContract,[key]:9}}),/Current distribution differs/,key);});
check('freeze-unknown-contract-refused',()=>{for(const contract of [{...fixtureContract,extraContractId:1},(({projectFormatVersion,...rest})=>rest)(fixtureContract),{...fixtureContract,projectFormatVersion:'8'},{...fixtureContract,runtimeContractId:0}]){frozen=undefined;assert.throws(()=>freezeRun(true,{contract}),/executable contract/);assert.equal(frozen,undefined);}});
check('freeze-second-release-refused',()=>{freezeRun(true);const recorded=frozen;for(const releases of [['release-0.0.1.json',currentRelease],[currentRelease,'release-'+currentProductVersion()+'-copy.json'],['release-0.0.1.json']])for(const record of [true,false]){assert.throws(()=>freezeRun(record,{releases}),/only the current release manifest may exist/);assert.equal(frozen,recorded);}});
for(const kind of ['composition','editing']){const good={schema:'akari-acceptance-execution-v1',status:'PASS',snapshot:inputs,steps:acceptanceIds(kind).map((id,i)=>({id,status:'PASS',exit:0,signal:null,log:'step-'+i+'.log',ms:1}))};verifyAcceptanceExecution(good,kind,inputs);
 for(const [name,mutate]of [['missing',r=>r.steps.pop()],['duplicate',r=>r.steps[1]=r.steps[0]],['failed',r=>r.steps[0].status='FAIL'],['timeout',r=>r.steps[0].signal='SIGTERM'],['snapshot',r=>r.snapshot.inputSha256='wrong'],['fake-pass',r=>r.steps[0].exit=1]])check('execution:'+kind+'/'+name,()=>{const bad=clone(good);mutate(bad);assert.throws(()=>verifyAcceptanceExecution(bad,kind,inputs));});}
const acceptanceRunner=fs.readFileSync('audit/run-acceptance.mjs','utf8').replace(/^import .*;\r?\n/gm,'');
for(const kind of ['composition','editing'])check('execution:'+kind+'/persisted-seal-failure',()=>{
 const written=new Map(),process={argv:['node','runner',kind],execPath:'/node',env:{AKARI_CODEC_BROWSER:'/browser'}};
 const memoryFs={mkdirSync(){},writeFileSync(p,s){written.set(p,s);}};
 const cp={spawnSync(_node,args){return args[0]==='audit/tests/child-ux.mjs'&&args[1]==='seal'?{status:1,signal:null,stderr:'synthetic validation rejection'}:{status:0,signal:null,stdout:''};}};
 vm.runInNewContext(acceptanceRunner,{fs:memoryFs,path:path.posix,cp,assert:relaxed,process,acceptanceCommands,snapshot:()=>inputs,currentProductFile,writeSummary(){},console:{log(){},error(){}}});
 assert.equal(process.exitCode,1);const report=JSON.parse(written.get((kind==='composition'?'audit-evidence/acceptance':'audit-evidence/editing')+'/execution.json'));
 assert.equal(report.status,'FAIL');assert.equal(report.validationFailure,'synthetic validation rejection');assert.equal(report.steps.length,acceptanceCommands[kind].length);assert.ok(report.steps.every(r=>r.status==='PASS'));
});
// Case-listing gate steps: exactly the declared cases, each PASS, bound to the current inputs.
const productManifest=JSON.parse(fs.readFileSync('audit/manifests/product-tests.json')),releaseRecord=currentReleaseRecord();
function caseReports(){
  const reports=Object.fromEntries(Object.entries(gateCaseIds).map(([step,ids])=>[step,caseReport(step,ids.map(id=>({id,status:'PASS'})),{},inputs)]));
  reports['release-distribution'].record=clone(releaseRecord);
  reports['node-product']=caseReport('node-product',nodeProductCaseIds(productManifest).map(id=>({id,status:'PASS'})),{},inputs);
  return reports;
}
const verifyCases=(reports,manifest=productManifest)=>verifyGateCaseReports(step=>{assert.ok(reports[step],'missing report '+step);return reports[step];},inputs,manifest,releaseRecord);
check('gate-cases:valid',()=>verifyCases(caseReports()));
for(const [name,mutate,message] of [
  ['wrong-schema',r=>r['ci-regression'].schema='akari-gate-v1',/ci-regression: schema/],
  ['wrong-step',r=>r['dom-regression'].step='ci-regression',/dom-regression: step/],
  ['failed-status',r=>r['harness-negative'].status='FAIL',/harness-negative: status/],
  ['stale-snapshot',r=>r['surface-negative'].snapshot={...inputs,inputSha256:'0'.repeat(64)},/surface-negative: snapshot/],
  ['missing-results',r=>delete r['license-verify'].results,/license-verify: results/],
  ['missing-case',r=>r['workflow-contract'].results.pop(),/workflow-contract: case set/],
  ['extra-case',r=>r['change-guard-negative'].results.push({id:'invented',status:'PASS'}),/change-guard-negative: case set/],
  ['duplicate-case',r=>{const rows=r['release-policy-negative'].results;rows[1]=rows[0];},/release-policy-negative: duplicate case/],
  ['failed-case',r=>r['node-product'].results[0].status='FAIL',/node-product\//],
  ['release-record-changed',r=>r['release-distribution'].record.files[currentProductFile()]='0'.repeat(64),/committed release record/],
  ['release-record-missing',r=>delete r['release-distribution'].record,/committed release record/],
])check('gate-cases:'+name,()=>{const reports=caseReports();mutate(reports);assert.throws(()=>verifyCases(reports),message);});
check('gate-cases:node-product-suite-missing',()=>{const manifest=clone(productManifest);manifest.suites=manifest.suites.filter(s=>s.name!=='runCoreTests');assert.throws(()=>verifyCases(caseReports(),manifest),/node product suite missing from manifest: runCoreTests/);});
assert.deepEqual(results.map(r=>r.id),integrityControlIds);
assert.deepEqual(snapshot(currentProductFile()),inputs);
fs.writeFileSync(output,JSON.stringify({status:'PASS',snapshot:inputs,results},null,2)+'\n');
console.log('Audit integrity: '+results.length+' PASS');
