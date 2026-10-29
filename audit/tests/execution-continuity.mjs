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
import {selftestShards,acceptanceShards,browserShards,parseUnit,partItems,verifyPartCoverage,verifyShardPlan} from '../lib/shard-plan.cjs';
import {partLog,verifyGateShard,verifyAcceptanceShardReceipt,copyUnion,mergedRow,mergeGateShards,mergeAcceptanceShards,mergedKinds} from '../lib/shard-evidence.mjs';
import {sealChildShard,verifyChildShard} from '../lib/child-ux-evidence.mjs';
import {childUxProvenance} from '../lib/child-ux-observations.mjs';
import {browserIds as entryBrowserIds} from '../lib/entry-workshop-contract.mjs';
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
for(const scenario of ['pass',...kinds,'missing-jobs','empty-jobs','cancelled-job','missing-job','unexpected-job',...mergedKinds.map(k=>'merged-'+k)])check('aggregate:'+scenario,()=>{
  const calls=[],selections=[],written=new Map(),n=clone(needs),merges=[];
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
    },
    verifyMergedEvidence(verified,inputs,root){
      merges.push(Object.keys(verified));assert.deepEqual(clone(inputs),{fixture:true});assert.equal(root,'/aggregate/merged');
      for(const kind of kinds)assert.equal(verified[kind],kind===scenario?undefined:path.join(downloads,'akari-'+kind+'-123-'+selectedAttempts[kind]),'only verified bundles are merged');
      return mergedKinds.map(kind=>scenario==='merged-'+kind?{kind,status:'FAIL',reason:'invalid merge'}:{kind,status:'PASS'});
    }});
  assert.equal(merges.length,1,'the merged validators run after every bundle check');
  assert.deepEqual(selections,kinds,'every kind selected after a failure');
  assert.deepEqual(calls,kinds,'every bundle inspected after a failure');
  const report=JSON.parse(written.get('/aggregate/result.json'));
  assert.deepEqual(report.results.map(r=>r.kind),[...kinds,...mergedKinds]);
  for(const result of report.results){
    if(mergedKinds.includes(result.kind)){assert.equal(result.status,scenario==='merged-'+result.kind?'FAIL':'PASS');continue;}
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
// Shard plan, shard receipts and shard merges: each must reject its own defect.
const gateRunner=fs.readFileSync('audit/run-local-gate.mjs','utf8').replace(/^import .*;\r?\n/gm,'');
for(const failureAt of [-1,1])check('gate-shard-continuity:'+(failureAt<0?'pass':'fail'),()=>{
  const shard='s02',plan=selftestShards[shard].map(parseUnit),spawned=[],written=new Map();let verified=0;
  const process={argv:['node','runner','--shard',shard,'/browser','/evidence'],execPath:'/node',env:{PATH:'fixture'}};
  const cp={spawnSync(_node,args,options){const i=spawned.length;spawned.push({args,part:options.env?.AKARI_PART??null});return {status:i===failureAt?1:0,signal:null,stdout:'',stderr:''};}};
  vm.runInNewContext(gateRunner,{fs:{existsSync:()=>false,mkdirSync(){},writeFileSync(p,t){written.set(p,t);}},path:path.posix,cp,assert:relaxed,process,gateSteps,selftestShards,parseUnit,partLog,snapshot:()=>({fixture:true}),currentProductFile,
    writeSummary(){},verifyGateResults(){throw Error('a shard never runs the full validator');},verifyGateShard(){verified++;},console:{log(){},error(){}}});
  assert.deepEqual(spawned.map(s=>s.part),plan.map(u=>u.part),'only parts get AKARI_PART');
  assert.deepEqual(spawned.map(s=>s.args[0]),plan.map(u=>gateSteps('/browser','/evidence').find(x=>x[0]===u.name)[1]));
  const receipt=JSON.parse(written.get('/evidence/gate-shard.json'));
  assert.deepEqual(receipt.steps.map(s=>[s.id,s.part]),plan.map(u=>[u.name,u.part]));assert.equal(receipt.shard,shard);
  assert.equal(receipt.status,failureAt<0?'PASS':'FAIL');assert.equal(verified,failureAt<0?1:0);if(failureAt>=0)assert.equal(process.exitCode,1);
});
check('acceptance-shard:planned-steps',()=>{
  const shard='c02',spawned=[],written=new Map(),process={argv:['node','runner','composition','--shard',shard],execPath:'/node',env:{AKARI_CODEC_BROWSER:'/browser'}};
  const cp={spawnSync(_node,args){spawned.push(args);return {status:0,signal:null,stdout:''};}};
  vm.runInNewContext(acceptanceRunner,{fs:{mkdirSync(){},writeFileSync(p,t){written.set(p,t);}},path:path.posix,cp,assert:relaxed,process,acceptanceCommands,acceptanceShards,snapshot:()=>inputs,currentProductFile,writeSummary(){},console:{log(){},error(){}}});
  const ids=acceptanceIds('composition'),planned=ids.filter(id=>acceptanceShards.composition[shard].includes(id));
  assert.deepEqual(spawned.slice(0,-1).map(a=>a[0]+(a[0].includes('child-ux')?'/'+a[1]:'')),planned);
  assert.deepEqual(clone(spawned.at(-1)),['audit/tests/child-ux.mjs','seal-shard','composition/'+shard,'audit-evidence/acceptance']);
  const receipt=JSON.parse(written.get('audit-evidence/acceptance/execution-shard.json'));verifyAcceptanceShardReceipt(receipt,'composition',shard,inputs,ids);
  assert.equal(written.has('audit-evidence/acceptance/execution.json'),false,'a shard writes no kind receipt');
});
const browserTasks=Object.values(JSON.parse(fs.readFileSync('audit/browser/browser-audit-manifest.json')).groups).flat();
const planInputs={steps:gateSteps('',''),tasks:browserTasks,acceptance:Object.fromEntries(Object.keys(acceptanceCommands).map(k=>[k,{ids:acceptanceIds(k),commands:acceptanceCommands[k]}]))};
const planWith=(key,change)=>{const value=clone({selftestShards,acceptanceShards,browserShards}[key]);change(value);return {[key]:value};};
const unitOf=(shards,name)=>Object.entries(shards).find(([,units])=>units.includes(name));
check('shard-plan:valid',()=>assert.deepEqual(verifyShardPlan(planInputs),[]));
for(const [name,plan,message] of [
  ['missing-step',planWith('selftestShards',s=>{const [shard]=unitOf(s,'designer');s[shard]=s[shard].filter(u=>u!=='designer');}),/designer is not planned/],
  ['duplicate-step',planWith('selftestShards',s=>{s.s01.push('designer');}),/designer is planned 2 times/],
  ['undeclared-part',planWith('selftestShards',s=>{s.s01[0]='entry-browser@3/2';}),/undeclared part entry-browser@3\/2/],
  ['reader-in-other-shard',planWith('selftestShards',s=>{const [shard]=unitOf(s,'license-verify');s[shard]=s[shard].filter(u=>u!=='license-verify');s.s01.push('license-verify');}),/license-verify must run in the shard of license-browser/],
  ['reader-before-producer',planWith('selftestShards',s=>{const [shard,units]=unitOf(s,'toolbar-stage-verify');s[shard]=['toolbar-stage-verify',...units.filter(u=>u!=='toolbar-stage-verify')];}),/toolbar-stage-verify runs before toolbar-stage/],
  ['after-merge-sharded',planWith('selftestShards',s=>{s.s02.push('entry-verify');}),/entry-verify is both sharded and after-merge/],
  ['missing-browser-task',planWith('browserShards',s=>{const [shard]=unitOf(s,'ui-shell');s[shard]=s[shard].filter(u=>u!=='ui-shell');}),/ui-shell is not planned/],
  ['missing-acceptance-step',planWith('acceptanceShards',s=>{const [shard]=unitOf(s.composition,'audit/tests/ux-surface-browser.mjs');s.composition[shard]=s.composition[shard].filter(u=>u!=='audit/tests/ux-surface-browser.mjs');}),/ux-surface-browser\.mjs is not planned/],
  ['acceptance-reader-in-other-shard',planWith('acceptanceShards',s=>{const [shard]=unitOf(s.composition,'audit/tests/child-ux.mjs/matrix');s.composition[shard]=s.composition[shard].filter(u=>u!=='audit/tests/child-ux.mjs/matrix');s.composition.c03.push('audit/tests/child-ux.mjs/matrix');}),/matrix must run in the shard of audit\/run-ux-normal-gui\.mjs/],
])check('shard-plan:'+name,()=>assert.ok(verifyShardPlan(planInputs,plan).some(p=>message.test(p)),name+': '+JSON.stringify(verifyShardPlan(planInputs,plan))));
const contexts=[1366,768,390].flatMap(w=>['code','blocks'].map(m=>w+'/'+m)),partsOf=()=>Object.fromEntries(['1/2','2/2'].map(part=>[part,partItems('modern-browser',contexts,part)]));
check('shard-parts:valid',()=>assert.equal(verifyPartCoverage('modern-browser',contexts,partsOf()),contexts.length));
for(const [name,mutate,message] of [
  ['missing-part',p=>delete p['2/2'],/parts/],['undeclared-part',p=>{p['3/2']=[];},/parts/],
  ['duplicate-item',p=>p['2/2'].push(p['1/2'][0]),/items differ/],['wrong-assignment',p=>{[p['1/2'][0],p['2/2'][0]]=[p['2/2'][0],p['1/2'][0]];},/items differ/],
])check('shard-parts:'+name,()=>{const p=partsOf();mutate(p);assert.throws(()=>verifyPartCoverage('modern-browser',contexts,p),message);});
const shardBase=fs.mkdtempSync(path.join(path.dirname(output),'shards-'));
function gateShardFixture(name,shard='s06'){
  const dir=path.join(shardBase,name);fs.mkdirSync(dir);
  const steps=selftestShards[shard].map(parseUnit).map(u=>{const log=u.part?partLog(u.name,u.part):u.name+'.log';fs.writeFileSync(path.join(dir,log),'fixture');return {id:u.name,part:u.part,status:'PASS',exit:0,signal:null,ms:1,log};});
  fs.writeFileSync(path.join(dir,'gate-shard.json'),JSON.stringify({schema:'akari-gate-shard-v1',shard,status:'PASS',snapshot:inputs,steps}));return dir;
}
check('shard-receipt:valid',()=>verifyGateShard(gateShardFixture('valid'),'s06',inputs));
for(const [name,mutate,message] of [
  ['other-steps',r=>r.steps.pop(),/ran other steps/],['failed-step',r=>{r.steps[0].status='FAIL';},/static/],['timeout',r=>{r.steps[0].signal='SIGTERM';},/SIGTERM/],
  ['stale-snapshot',r=>{r.snapshot={...inputs,inputSha256:'0'.repeat(64)};},/inputSha256/],['wrong-shard',r=>{r.shard='s05';},/s05/],['missing-log',(r,dir)=>fs.rmSync(path.join(dir,r.steps[0].log)),/ENOENT/],
])check('shard-receipt:'+name,()=>{const dir=gateShardFixture(name),file=path.join(dir,'gate-shard.json'),r=JSON.parse(fs.readFileSync(file));mutate(r,dir);fs.writeFileSync(file,JSON.stringify(r));assert.throws(()=>verifyGateShard(dir,'s06',inputs),message);});
const acceptanceReceipt=shard=>{const ids=acceptanceIds('composition'),planned=new Set(acceptanceShards.composition[shard]);return {schema:'akari-acceptance-shard-v1',kind:'composition',shard,status:'PASS',snapshot:inputs,steps:ids.map((id,i)=>({id,status:'PASS',exit:0,signal:null,ms:1,log:'step-'+String(i+1).padStart(2,'0')+'.log'})).filter(s=>planned.has(s.id))};};
check('shard-receipt:acceptance-valid',()=>verifyAcceptanceShardReceipt(acceptanceReceipt('c03'),'composition','c03',inputs,acceptanceIds('composition')));
for(const [name,mutate] of [['acceptance-other-steps',r=>r.steps.shift()],['acceptance-failed',r=>{r.steps[0].exit=1;}],['acceptance-wrong-log',r=>{r.steps[0].log='step-99.log';}]])
  check('shard-receipt:'+name,()=>{const r=acceptanceReceipt('c03');mutate(r);assert.throws(()=>verifyAcceptanceShardReceipt(r,'composition','c03',inputs,acceptanceIds('composition')));});
function unionFixture(name,files){const dirs={};for(const [shard,list] of Object.entries(files)){const dir=path.join(shardBase,name+'-'+shard);fs.mkdirSync(dir,{recursive:true});for(const [f,t] of Object.entries(list)){fs.mkdirSync(path.dirname(path.join(dir,f)),{recursive:true});fs.writeFileSync(path.join(dir,f),t);}dirs[shard]=dir;}return dirs;}
check('shard-merge:valid',()=>{const out=path.join(shardBase,'union-valid');copyUnion(unionFixture('valid',{a:{'one.json':'1','candidate/input':'x'},b:{'two.json':'2','candidate/input':'x'}}),out,{shared:f=>f==='candidate/input'});assert.deepEqual(fs.readdirSync(out).sort(),['candidate','one.json','two.json']);});
check('shard-merge:collision',()=>assert.throws(()=>copyUnion(unionFixture('collision',{a:{'same.json':'1'},b:{'same.json':'1'}}),path.join(shardBase,'union-collision')),/produced by shards a, b/));
check('shard-merge:shared-input-differs',()=>assert.throws(()=>copyUnion(unionFixture('differs',{a:{'candidate/input':'x'},b:{'candidate/input':'y'}}),path.join(shardBase,'union-differs'),{shared:()=>true}),/differs between shards/));
check('shard-merge:missing-shard',()=>{const dirs=Object.fromEntries(Object.keys(selftestShards).slice(1).map(s=>[s,shardBase]));assert.throws(()=>mergeGateShards(dirs,path.join(shardBase,'merge-missing'),inputs),/missing, extra or duplicate/);});
check('shard-merge:extra-shard',()=>{const dirs=Object.fromEntries([...Object.keys(selftestShards),'s99'].map(s=>[s,shardBase]));assert.throws(()=>mergeGateShards(dirs,path.join(shardBase,'merge-extra'),inputs),/missing, extra or duplicate/);});
const rowDirs={r0:path.join(shardBase,'rows-0'),r1:path.join(shardBase,'rows-1')};
const partRows=()=>['1/2','2/2'].map((part,i)=>{const dir=rowDirs['r'+i];fs.mkdirSync(dir,{recursive:true});const log=partLog('entry-browser',part);fs.writeFileSync(path.join(dir,log),part);return {id:'entry-browser',part,status:'PASS',exit:0,signal:null,ms:5,log,shard:'r'+i};});
const rowOut=()=>fs.mkdtempSync(path.join(shardBase,'row-'));
check('shard-merge:parts-row',()=>{const row=mergedRow('entry-browser',partRows(),rowDirs,rowOut());assert.equal(row.status,'PASS');assert.equal(row.ms,10);assert.deepEqual(row.parts.map(p=>p.part),['1/2','2/2']);});
check('shard-merge:failed-part',()=>{const rows=partRows();Object.assign(rows[1],{status:'FAIL',exit:1});const row=mergedRow('entry-browser',rows,rowDirs,rowOut());assert.equal(row.status,'FAIL');assert.equal(row.exit,1);});
check('shard-merge:missing-part-row',()=>assert.throws(()=>mergedRow('entry-browser',partRows().slice(0,1),rowDirs,rowOut()),/parts/));
check('shard-merge:whole-and-part-row',()=>{const rows=partRows();rows[0].part=null;assert.throws(()=>mergedRow('entry-browser',rows,rowDirs,rowOut()),/whole and in parts/);});
check('shard-merge:parts-row-shard-order',()=>{const rows=partRows().reverse(),row=mergedRow('entry-browser',rows,rowDirs,rowOut());assert.equal(row.status,'PASS');assert.deepEqual(row.parts.map(p=>[p.part,p.shard]),[['1/2','r0'],['2/2','r1']]);});
// The whole selftest merge over every planned shard, with the split step's parts in shard order.
function gateTree(name,{mutate=()=>{}}={}){
  const dirs={};
  for(const [shard,units] of Object.entries(selftestShards)){
    const dir=path.join(shardBase,name,shard);fs.mkdirSync(dir,{recursive:true});
    const steps=units.map(parseUnit).map(u=>{const log=u.part?partLog(u.name,u.part):u.name+'.log';fs.writeFileSync(path.join(dir,log),'fixture '+u.name);
      if(u.part){const items=partItems('entry-browser',entryBrowserIds,u.part);fs.mkdirSync(path.join(dir,'entry-browser.json.artifacts'),{recursive:true});fs.writeFileSync(path.join(dir,'entry-browser.json.artifacts',u.part.replace('/','-')+'.png'),u.part);
        fs.writeFileSync(path.join(dir,'entry-browser.json'),JSON.stringify({schema:'akari-entry-workshop-v1',kind:'browser',status:'PASS',snapshot:inputs,command:'fixture '+u.part,startedAt:'2026-01-01T00:00:0'+u.part[0]+'Z',browser:'fixture',
          results:items.map(id=>({id,status:'PASS',observations:{fixture:true}})),pageErrors:[],networkRequests:[],artifacts:[{path:u.part.replace('/','-')+'.png',bytes:3,sha256:sha(Buffer.from(u.part))}],part:{name:'entry-browser',part:u.part,items}}));}
      else fs.writeFileSync(path.join(dir,u.name+'.json'),JSON.stringify({fixture:u.name}));
      return {id:u.name,part:u.part,status:'PASS',exit:0,signal:null,ms:1,log};});
    fs.writeFileSync(path.join(dir,'gate-shard.json'),JSON.stringify({schema:'akari-gate-shard-v1',shard,status:'PASS',snapshot:inputs,steps}));dirs[shard]=dir;
  }
  mutate(dirs);return dirs;
}
check('shard-merge:gate-tree',()=>{
  const out=path.join(shardBase,'gate-tree-out'),gate=mergeGateShards(gateTree('gate-tree'),out,inputs);
  assert.deepEqual(gate.steps.map(s=>s.id),gateSteps('','').map(s=>s[0]),'canonical step order');
  const entry=gate.steps.find(s=>s.id==='entry-browser');assert.deepEqual(entry.parts.map(p=>[p.part,p.shard]),[['1/2','s02'],['2/2','s01']]);assert.equal(entry.status,'PASS');
  const verify=gate.steps.find(s=>s.id==='entry-verify');assert.equal(verify.afterMerge,true);assert.equal(verify.status,'FAIL','the after-merge validator rejects the synthetic reports');assert.ok(verify.reason);assert.equal(gate.status,'FAIL');
  const merged=JSON.parse(fs.readFileSync(path.join(out,'entry-browser.json')));assert.deepEqual(merged.results.map(r=>r.id),[...entryBrowserIds]);assert.deepEqual(merged.artifacts.map(a=>a.path),['1-2.png','2-2.png']);
  assert.deepEqual(fs.readdirSync(path.join(out,'entry-browser.json.artifacts')).sort(),['1-2.png','2-2.png']);
  for(const f of ['gate-shard.json','bundle.json'])assert.equal(fs.existsSync(path.join(out,f)),false,'shard receipts are not merged evidence');
});
check('shard-merge:gate-collision',()=>assert.throws(()=>mergeGateShards(gateTree('gate-collision',{mutate:d=>fs.writeFileSync(path.join(d.s01,'designer.json'),'{}')}),path.join(shardBase,'gate-collision-out'),inputs),/designer\.json produced by shards/));
check('shard-merge:gate-part-rows',()=>assert.throws(()=>mergeGateShards(gateTree('gate-part-rows',{mutate:d=>{const f=path.join(d.s01,'entry-browser.json'),r=JSON.parse(fs.readFileSync(f));r.results.pop();fs.writeFileSync(f,JSON.stringify(r));}}),path.join(shardBase,'gate-part-rows-out'),inputs),/entry-browser part rows/));
// The composition merge over every planned shard; a shard file produced twice is rejected.
function acceptanceTree(name,{mutate=()=>{}}={}){
  const ids=acceptanceIds('composition'),dirs={};
  for(const shard of Object.keys(acceptanceShards.composition)){
    const dir=path.join(shardBase,name,shard);fs.mkdirSync(dir,{recursive:true});const r=acceptanceReceipt(shard);
    for(const s of r.steps){fs.writeFileSync(path.join(dir,s.log),'fixture');fs.writeFileSync(path.join(dir,'out-'+s.log.replace('.log','.json')),'{}');}
    fs.writeFileSync(path.join(dir,'execution-shard.json'),JSON.stringify(r));dirs[shard]=dir;
  }
  mutate(dirs);return {dirs,ids};
}
const afterMergeCommands=out=>acceptanceCommands.composition.map(c=>c.startsWith('node audit/tests/actions-transfer-verify.mjs ')?'node audit/tests/actions-transfer-verify.mjs '+out:c);
check('shard-merge:acceptance-tree',()=>{
  const {dirs,ids}=acceptanceTree('acceptance-tree'),out=path.join(shardBase,'acceptance-tree-out'),report=mergeAcceptanceShards('composition',dirs,out,inputs,afterMergeCommands(out),ids);
  assert.deepEqual(report.steps.map(s=>s.id),ids);const after=report.steps.filter(s=>s.afterMerge);assert.deepEqual(after.map(s=>s.id),['audit/tests/actions-transfer-verify.mjs']);
  assert.equal(after[0].status,'FAIL','the after-merge validator rejects the synthetic evidence');assert.equal(report.status,'FAIL');
  assert.deepEqual(Object.keys(report.shards),Object.keys(acceptanceShards.composition));for(const shard of Object.keys(dirs))assert.ok(fs.existsSync(path.join(out,'shards',shard,'execution-shard.json')));
});
check('shard-merge:acceptance-collision',()=>{const {dirs,ids}=acceptanceTree('acceptance-collision',{mutate:d=>fs.writeFileSync(path.join(d.c01,'out-step-38.json'),'{}')}),out=path.join(shardBase,'acceptance-collision-out');
  fs.writeFileSync(path.join(dirs.c03,'out-step-38.json'),'{}');assert.throws(()=>mergeAcceptanceShards('composition',dirs,out,inputs,afterMergeCommands(out),ids),/produced by shards/);});
// A sealed composition shard: its files, its steps and its run identity are bound.
const childProvenance=childUxProvenance();
function childShard(name){const {dirs}=acceptanceTree(name),dir=dirs.c03;sealChildShard('composition','c03',dir,inputs,childProvenance);return dir;}
check('child-shard:valid',()=>verifyChildShard('composition','c03',childShard('child-valid'),inputs,childProvenance));
for(const [name,mutate,message] of [
  ['changed-file',dir=>fs.appendFileSync(path.join(dir,'step-01.log'),' changed'),/step-01\.log/],
  ['extra-file',dir=>fs.writeFileSync(path.join(dir,'unlisted.json'),'{}'),/shard file set/],
  ['provenance-attempt',dir=>{const f=path.join(dir,'child-ux-shard.json'),b=JSON.parse(fs.readFileSync(f));b.provenance.attempt='99';fs.writeFileSync(f,JSON.stringify(b));},/attempt/],
  ['other-steps',dir=>{const f=path.join(dir,'execution-shard.json'),r=JSON.parse(fs.readFileSync(f));r.steps.pop();fs.writeFileSync(f,JSON.stringify(r));},/execution-shard\.json|ran other steps/],
])check('child-shard:'+name,()=>{const dir=childShard('child-'+name);mutate(dir);assert.throws(()=>verifyChildShard('composition','c03',dir,inputs,childProvenance),message);});
assert.deepEqual(results.map(r=>r.id),integrityControlIds);
assert.deepEqual(snapshot(currentProductFile()),inputs);
fs.writeFileSync(output,JSON.stringify({status:'PASS',snapshot:inputs,results},null,2)+'\n');
console.log('Audit integrity: '+results.length+' PASS');
