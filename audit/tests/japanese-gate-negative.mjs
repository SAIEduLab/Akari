// Synthetic validator fixtures below are never product execution evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {browserEnvironment} from '../lib/browser-environment.mjs';
import {scenarios,ambiguities,corpusSha256} from '../lib/japanese-intent-oracles.mjs';
import {verifyJapaneseContract} from './japanese-contract-static.mjs';
import {corpusPath,checkConsolidationNegatives} from '../lib/docs-consolidation-contract.mjs';
import {intentCaseIds,runtimeRuns,contractInputPaths,migrationInputPaths,intentInputPaths,runtimeInputPaths,negativeInputPaths,inputHashes,verifyContractReport,verifyMigrationReport,verifyIntentCandidate,verifyIntentReport,verifyRuntimeReport,negativeCaseIds,verifyNegativeReport} from '../lib/japanese-gate-contract.mjs';
const [destination]=process.argv.slice(2);assert.ok(destination);const inputs=snapshot(currentProductFile()),dir=fs.mkdtempSync(path.join(os.tmpdir(),'akari-gate-validator-'));
const clone=x=>JSON.parse(JSON.stringify(x)),results=[];
try{
 const candidate=path.join(dir,'candidate.html');fs.copyFileSync(currentProductFile(),candidate);
 const corpus=JSON.parse(fs.readFileSync(corpusPath));
 const execution={execution:'real EventScheduler / RuntimeModel',errors:[],roundtrips:[{fixture:true}],trace:[],final:{actors:[{fixture:true}]}};
 const intent={status:'PASS',filter:null,boot:{status:'PASS'},candidate:{sha256:inputs.productSha256,testedFile:candidate,url:pathToFileURL(candidate).href},environment:{protocol:'file:',browser:browserEnvironment.version,playwright:browserEnvironment.playwright},auditInputs:inputHashes(intentInputPaths),oracle:{corpusSha256,cases:corpus.cases,structuredSources:scenarios},total:89,counts:{PASS:89,FAIL:0,PENDING:0},results:intentCaseIds.map(id=>({id,status:'PASS',evidence:{fixture:true}})),coverage:scenarios.map(s=>({id:s.id,originalProse:'PASS',semantic:'PASS',blocks:'PASS'}))};
 for(const scenario of scenarios){
  intent.results.find(r=>r.id===scenario.id+'/original-prose-ui').evidence={meaningAcceptance:'not asserted by this preservation route',checks:corpus.cases.find(c=>c.id===scenario.id).sections.filter(s=>s.label.startsWith('作文候補')).map(p=>{
    const validOwnerKey='script:fixture:start',valid={source:'10歩進む。',project:'{"fixture":true}',history:1,redo:0,dirty:false,state:'DESIGN',pending:false},
      pending={ownerKey:validOwnerKey,mode:'code',pending:{ownerKey:validOwnerKey,kind:'code',value:p.text}},initial={...valid,pending:true},observed={say:[],start:0,motion:[]};
    return{original:p.text,validOwnerKey,valid,pending,initial,afterRun:clone(initial),afterRunPending:clone(pending),cancelled:clone(valid),cancelledOwnerKey:validOwnerKey,cancelledPending:null,observedAfterRun:clone(observed),observedAfterCancel:clone(observed),unchanged:true,blocksDisabled:true,executionRejected:true,cancelRestoredSource:true,automaticExecution:false};
   })};
  if(scenario.id!=='CI-20'){
   intent.results.find(r=>r.id===scenario.id+'/parser-core').evidence={structuredSource:scenario.source,original:clone(execution)};
   intent.results.find(r=>r.id===scenario.id+'/blocks-core').evidence={structuredSource:scenario.source,blocks:clone(execution),sourceTraceCompared:true};
  }
 }
 for(const ambiguity of ambiguities){
  const soundChoices=ambiguity.id==='AMB-SOUND'?[{label:'そのままの文字を話す',source:'「こんにちは」と言う'},{label:'同じ名前の音を鳴らす',source:'音「こんにちは」を鳴らす'}]:null;
  intent.results.find(r=>r.id===ambiguity.id+'/choices-nonexecution-cancel').evidence={original:ambiguity.source,choices:soundChoices?soundChoices.map(choice=>choice.label):ambiguity.choices,soundChoices,valid:{project:'fixture'},before:{source:ambiguity.source,project:'fixture',history:1,redo:0,dirty:false,state:'DESIGN'},after:{source:ambiguity.source,project:'fixture',history:1,redo:0,dirty:false,state:'DESIGN'}};
 }
 fs.writeFileSync(path.join(dir,'formal-player.html'),'<!-- validator fixture, not an executable player -->');
 const runs=runtimeRuns.map(([script,evidence,ids])=>{
  const reports=ids.map(id=>({id,pass:true,fixture:true}));
  const child={productSha256:inputs.productSha256,browser:browserEnvironment.version,transport:'file://',reports};
  if(script==='formal-player-browser.cjs')child.playerSha256=sha(fs.readFileSync(path.join(dir,'formal-player.html')));
  fs.writeFileSync(path.join(dir,evidence),JSON.stringify(child));
  return{script,evidence,reports,exitCode:0,signal:null,snapshotMatches:true};
 });
 const runtime={schema:'akari-runtime-boundary-gate-v1',status:'PASS',snapshot:inputs,auditInputs:inputHashes(runtimeInputPaths),runtime:{schema:'akari-runtime-v2-boundary-evidence-v1',status:'PASS',productSha256:inputs.productSha256,transport:'file://',expectedPassCount:20,passed:20,failed:0,unverified:0,runs}};
 const fixed={schema:'akari-japanese-static-gate-v1',status:'PASS',snapshot:inputs,auditInputs:inputHashes(contractInputPaths),contract:verifyJapaneseContract()};
 const migration={schema:'akari-language-migration-gate-v1',status:'PASS',snapshot:inputs,auditInputs:inputHashes(migrationInputPaths),migration:{status:'PASS',stableIds:605,finiteInputs:256,groups:42,corpus:95,baselineSchemas:153}};
 const check=(id,base,verify,mutate)=>{const bad=clone(base);mutate(bad);assert.throws(()=>verify(bad));results.push({id,rejected:true});};
 const vi=r=>verifyIntentReport(r,inputs),vr=r=>verifyRuntimeReport(r,inputs,dir),vs=r=>verifyContractReport(r,inputs),vm=r=>verifyMigrationReport(r,inputs);
 // Producer paths belong to the recorded OS; the sealed bytes are local.
 // These controls are validator fixtures, never product execution evidence.
 const portablePaths=[
  ['/home/runner/candidate.html','file:///home/runner/candidate.html'],
  ['/home/a b/候補#1%.html','file:///home/a%20b/%E5%80%99%E8%A3%9C%231%25.html'],
  ['C:\\audit evidence\\candidate.html','file:///C:/audit%20evidence/candidate.html'],
  ['\\\\server\\share\\candidate.html','file://server/share/candidate.html'],
 ];
 for(const[testedFile,url]of portablePaths){const good=clone(intent);good.candidate.testedFile=testedFile;good.candidate.url=url;verifyIntentCandidate(good,inputs,candidate);}
 for(const testedFile of ['candidate.html','C:candidate.html','\\candidate.html','']){
  const bad=clone(intent);bad.candidate.testedFile=testedFile;bad.candidate.url='file:///candidate.html';assert.throws(()=>verifyIntentCandidate(bad,inputs,candidate));
 }
 for(const url of ['file:///home/runner/other.html','file:///C:/home/runner/candidate.html','file://elsewhere/home/runner/candidate.html','https://example.invalid/candidate.html','file:///home/runner/candidate.html#false','file:///home/runner/candidate.html?false']){
  const bad=clone(intent);bad.candidate.testedFile=portablePaths[0][0];bad.candidate.url=url;assert.throws(()=>verifyIntentCandidate(bad,inputs,candidate));
 }
 const corruptCandidate=path.join(dir,'corrupt-candidate.html');fs.writeFileSync(corruptCandidate,'invalid sealed candidate');
 assert.throws(()=>verifyIntentCandidate(intent,inputs,corruptCandidate));
 vi(intent);vr(runtime);vs(fixed);vm(migration);
 const observationControl=clone(runtime),entryFile=path.join(dir,'entry-browser-evidence.json');
 const entryBytes=fs.readFileSync(entryFile),entry=JSON.parse(entryBytes);
 const observation={id:'NATIVE-TAB-VISIBILITY-OBSERVATION',pass:null,status:'UNVERIFIED',observed:{hidden:false},note:'Synthetic validator control, no native visibility proof'};
 observationControl.runtime.runs[2].reports.push(observation);observationControl.runtime.unverified=1;entry.reports.push(observation);
 fs.writeFileSync(entryFile,JSON.stringify(entry));vr(observationControl);fs.writeFileSync(entryFile,entryBytes); // Validator control fixtures, no execution PASS claim.
 for(const status of ['FAIL','PENDING','INCOMPLETE','NOT_RUN']){check('INTENT/status-'+status,intent,vi,r=>r.status=status);check('RUNTIME/status-'+status,runtime,vr,r=>r.status=status);}
 check('INTENT/missing-case',intent,vi,r=>r.results.pop());check('INTENT/duplicate-case',intent,vi,r=>r.results[1]=r.results[0]);
 check('INTENT/false-total',intent,vi,r=>r.total--);check('INTENT/missing-evidence',intent,vi,r=>delete r.results[0].evidence);
 check('INTENT/stale-product',intent,vi,r=>r.candidate.sha256='0'.repeat(64));check('INTENT/changed-oracle',intent,vi,r=>r.oracle.cases[0].sections[0].text='changed');
 check('INTENT/changed-audit-input',intent,vi,r=>r.auditInputs[intentInputPaths[0]]='0'.repeat(64));check('INTENT/wrong-browser',intent,vi,r=>r.environment.browser='0');
 check('INTENT/filtered-run',intent,vi,r=>r.filter='CI-01');check('INTENT/unverified-coverage',intent,vi,r=>r.coverage[0].semantic='NOT_RUN');
 check('INTENT/missing-runtime-primitives',intent,vi,r=>r.results[0].evidence.original={});check('INTENT/different-block-trace',intent,vi,r=>r.results[1].evidence.blocks.trace.push({fixture:'changed'}));
 check('RUNTIME/missing-runner',runtime,vr,r=>r.runtime.runs.pop());check('RUNTIME/duplicate-case',runtime,vr,r=>r.runtime.runs[0].reports[1]=r.runtime.runs[0].reports[0]);
 check('RUNTIME/stale-product',runtime,vr,r=>r.runtime.productSha256='0'.repeat(64));check('RUNTIME/unverified',runtime,vr,r=>r.runtime.unverified=1);
 check('RUNTIME/child-timeout',runtime,vr,r=>r.runtime.runs[0].signal='SIGTERM');check('RUNTIME/child-snapshot',runtime,vr,r=>r.runtime.runs[0].snapshotMatches=false);
 check('RUNTIME/changed-child-report',runtime,vr,r=>r.runtime.runs[0].reports[0].fixture=false);
 check('RUNTIME/observation-promoted',runtime,vr,r=>{r.runtime.runs[2].reports.push({id:'NATIVE-TAB-VISIBILITY-OBSERVATION',pass:true,status:'PASS',observed:{},note:'fixture'});});
 check('RUNTIME/required-case-unverified',runtime,vr,r=>{r.runtime.runs[0].reports[0].pass=null;r.runtime.runs[0].reports[0].status='UNVERIFIED';});
 check('STATIC/missing-check',fixed,vs,r=>r.contract.results.pop());check('STATIC/changed-doc-hash',fixed,vs,r=>r.contract.documentHashes[0].sha256='0'.repeat(64));
 check('STATIC/execution-claim',fixed,vs,r=>r.contract.productDynamic.status='PASS');
 check('MIGRATION/missing-stable-id',migration,vm,r=>r.migration.stableIds=604);check('MIGRATION/stale-snapshot',migration,vm,r=>r.snapshot.productSha256='0'.repeat(64));
 const proseRow=r=>r.results.find(x=>x.id==='CI-01/original-prose-ui').evidence.checks[0];
 for(const flag of ['unchanged','blocksDisabled','executionRejected','cancelRestoredSource','automaticExecution']){
  check('INTENT/prose-missing-'+flag,intent,vi,r=>delete proseRow(r)[flag]);
  check('INTENT/prose-invalid-'+flag,intent,vi,r=>proseRow(r)[flag]=flag==='automaticExecution');
 }
 const proseMutations={
  'owner':row=>row.pending.ownerKey='changed','pending-owner':row=>row.pending.pending.ownerKey='changed',
  'pending-kind':row=>row.pending.pending.kind='block-draft','pending-value':row=>row.pending.pending.value='changed',
  'valid-pending':row=>row.valid.pending=true,'valid-state':row=>row.valid.state='RUNNING','initial-pending':row=>row.initial.pending=false,
  'initial-source':row=>row.initial.source='changed','initial-project':row=>row.initial.project='changed',
  'initial-history':row=>row.initial.history++,'initial-redo':row=>row.initial.redo++,'initial-dirty':row=>row.initial.dirty=true,'initial-state':row=>row.initial.state='RUNNING',
  'run-project':row=>row.afterRun.project='changed','run-history':row=>row.afterRun.history++,'run-pending':row=>row.afterRunPending.pending.value='changed',
  'run-speech':row=>row.observedAfterRun.say.push('changed'),'run-start':row=>row.observedAfterRun.start=1,'run-motion':row=>row.observedAfterRun.motion.push('changed'),
  'cancel-project':row=>row.cancelled.project='changed','cancel-history':row=>row.cancelled.history++,'cancel-owner':row=>row.cancelledOwnerKey='changed',
  'cancel-pending':row=>row.cancelledPending={},'cancel-execution':row=>row.observedAfterCancel.start=1,
 };
 for(const[key,mutate]of Object.entries(proseMutations))check('INTENT/prose-'+key,intent,vi,r=>mutate(proseRow(r)));
 const soundRow=r=>r.results.find(x=>x.id==='AMB-SOUND/choices-nonexecution-cancel').evidence;
 check('INTENT/speech-ui-label',intent,vi,r=>{const row=soundRow(r);row.choices[0]='台詞として画面に言う';row.soundChoices[0].label=row.choices[0];});
 check('INTENT/speech-source-mixed-with-sound',intent,vi,r=>{soundRow(r).soundChoices[0].source='音「こんにちは」を鳴らす';});
 results.push(...checkConsolidationNegatives());
 assert.deepEqual(results.map(r=>r.id),negativeCaseIds);
 const report={schema:'akari-japanese-gate-negative-v1',status:'PASS',snapshot:inputs,auditInputs:inputHashes(negativeInputPaths),results};verifyNegativeReport(report,inputs);
 fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'PASS',rejections:results.length,destination}));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
