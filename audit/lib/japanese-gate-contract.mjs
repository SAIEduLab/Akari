import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {sha} from './product-test-host.mjs';
import {browserEnvironment} from './browser-environment.mjs';
import {scenarios,ambiguities,corpusSha256} from './japanese-intent-oracles.mjs';
import {verifyJapaneseContract} from '../tests/japanese-contract-static.mjs';

export const contractInputPaths = [
  'audit/tests/japanese-contract-static.mjs','audit/fixtures/1.0.2-baseline-capabilities.json',
  'audit/fixtures/language-v2-test-migration.json','audit/tests/contract-gate.mjs',
  'audit/lib/japanese-gate-contract.mjs',
];
export const migrationInputPaths = [
  'audit/tests/language-migration-static.mjs','audit/fixtures/language-surface-v2-migration.json',
  'audit/fixtures/language/forms.mjs','audit/fixtures/language/inline.mjs',
  'audit/fixtures/language/expected.json','audit/manifests/language-form-coverage.json',
  'audit/suites/language-forms.js','audit/run-language-tests.mjs',
  'audit/tests/contract-gate.mjs','audit/lib/japanese-gate-contract.mjs',
];
export const intentInputPaths = [
  'audit/tests/japanese-intent-browser.mjs','audit/lib/japanese-intent-oracles.mjs',
  'audit/lib/japanese-intent-browser-harness.mjs',
];
export const runtimeInputPaths = [
  'audit/tests/runtime-v2.mjs','audit/tests/runtime-boundary-gate.mjs',
  'audit/lib/japanese-gate-contract.mjs',
  ...['config','node','browser','entry-browser','parser-tests','heading-browser','formal-player-browser']
    .map(n=>'audit/tests/runtime-v2/'+n+'.cjs'),
];
export const intentCaseIds = [
  ...scenarios.filter(s=>s.id!=='CI-20').flatMap(s=>[s.id+'/parser-core',s.id+'/blocks-core']),
  ...scenarios.map(s=>s.id+'/original-prose-ui'),
  ...ambiguities.map(s=>s.id+'/choices-nonexecution-cancel'),
  'VALUE/math-precedence-and-builtins','VALUE/finite-number-roundtrip-and-exact-precision',
  'CONDITION/inflections-shortcircuit-and-roundtrip',
  'VALUE/unit-propagation-mismatch-and-structural-builtins','VALUE/units-booleans-strings-list-and-copy',
  'CALLABLE/named-order-nonasymmetric-return','CALLABLE/named-argument-evaluation-order-once',
  'ACTOR/branch-scope-and-owner-read','EVENT/multiple-handlers-and-filter',
  'PARSER/protected-sourcepositions-and-negatives',
  'CI-09/boundary9','CI-09/boundary11','CI-10/key-required','CI-14/empty',
  'CI-13/replace-is-not-insert','CI-15/definition-alone-does-not-run',
  'CI-18/nonwaiting-and-zero-receivers','CI-12/saved-answer-survives-next-question',
  'CI-18/indirect-receiver-is-outside-wait-group','CI-04/frame-rate-independence',
  'CI-03/real-keyboard-repeat-events','CI-12/real-question-response-and-stop',
  'UI/quantity-edit-roundtrip-undo','CI-20/media-save-reload-player-offline',
];
export const runtimeRuns = [
  ['node.cjs','node-evidence.json',[
    'NAMED-FUNCTION-SOURCE-ORDER-AND-QUANTITY','QUALIFIED-FUNCTION-SUBJECT-AND-CALLER-RESTORATION',
    'RESTORE-SCRIPT-ID-EVENT-FILTER-RULES-QUANTITY','RESTORE-REJECTS-CORRUPT-QUANTITY-AND-ID',
    'RESTORE-REJECTS-CORRUPT-FILTER','RESTORE-REJECTS-CORRUPT-RULE-DIRECTION',
    'RESTORED-TASK-LIMIT-REMAINS-2000']],
  ['browser.cjs','browser-evidence.json',[
    'PLAYER-NAMED-FUNCTION-QUANTITY-QUALIFIED-READ','PLAYER-NATIVE-KEY-HELD-BEFORE-START',
    'PLAYER-NATIVE-INPUT-EXACT-LOGICAL-BOUNDARY','PLAYER-BLUR-HIDDEN-PAUSE-AND-NO-CATCHUP',
    'PLAYER-QUESTIONS-QUEUE-ANSWER-ISOLATION-STOP-RESTART','PLAYER-AUDIO-ASK-CANCEL-OWNERSHIP-AND-PAUSE']],
  ['entry-browser.cjs','entry-browser-evidence.json',['EDITOR-NATIVE-KEY-HELD-START']],
  ['parser-tests.cjs','parser-evidence.json',[
    'FORMAL-SOURCE-COMPILE-EXECUTE-AND-STANDALONE','HEADING-COMMIT-ATOMIC-ID-AND-FILTER']],
  ['heading-browser.cjs','heading-browser-evidence.json',[
    'HEADING-COMMIT-OWNER-EVENT-FILTER-STABLE-ID','INVALID-HEADING-PRESERVES-MODEL-AND-DRAFT',
    'HEADING-RECOVERY-MESSAGE-FILTER-STABLE-ID']],
  ['formal-player-browser.cjs','formal-player-browser-evidence.json',[
    'FORMAL-EXPORTED-PLAYER-OFFLINE-FILTER-QUANTITY-CONTINUOUS']],
];
assert.equal(intentCaseIds.length,89);assert.equal(runtimeRuns.flatMap(r=>r[2]).length,20);
export function inputHashes(files){return Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(f))]));}
function bind(report,inputs,files){assert.equal(report.status,'PASS');assert.deepEqual(report.snapshot,inputs);assert.deepEqual(report.auditInputs,inputHashes(files));}
function ids(results,expected){assert.ok(Array.isArray(results));assert.deepEqual(results.map(r=>r.id),expected);assert.equal(new Set(results.map(r=>r.id)).size,expected.length);}
export function verifyContractReport(report,inputs){
  bind(report,inputs,contractInputPaths);assert.equal(report.schema,'akari-japanese-static-gate-v1');
  assert.deepEqual(report.contract,verifyJapaneseContract());
  assert.equal(report.contract.productDynamic.status,'NOT_RUN');
  return {status:'PASS',staticChecks:report.contract.total};
}
export function verifyMigrationReport(report,inputs){
  bind(report,inputs,migrationInputPaths);assert.equal(report.schema,'akari-language-migration-gate-v1');
  for(const[k,v]of Object.entries({status:'PASS',stableIds:605,finiteInputs:256,groups:42,corpus:95,baselineSchemas:153}))assert.equal(report.migration[k],v,k);
  return {status:'PASS',stableIds:605};
}
export function verifyIntentReport(report,inputs){
  assert.equal(report.status,'PASS');assert.equal(report.filter,null);assert.equal(report.boot?.status,'PASS');
  assert.equal(report.candidate.sha256,inputs.productSha256);
  assert.equal(sha(fs.readFileSync(report.candidate.testedFile)),inputs.productSha256);
  assert.match(report.candidate.url,/^file:\/\//);assert.equal(report.environment.protocol,'file:');
  assert.equal(report.environment.browser,browserEnvironment.version);assert.equal(report.environment.playwright,browserEnvironment.playwright);
  assert.deepEqual(report.auditInputs,inputHashes(intentInputPaths));assert.equal(report.oracle.corpusSha256,corpusSha256);
  const corpus=JSON.parse(fs.readFileSync('docs/1.0.2/child-intent-corpus.json'));
  assert.equal(sha(fs.readFileSync('docs/1.0.2/child-intent-corpus.json')),corpusSha256);
  assert.deepEqual(report.oracle.cases,corpus.cases);assert.deepEqual(report.oracle.structuredSources,scenarios);
  ids(report.results,intentCaseIds);assert.equal(report.total,89);assert.deepEqual(report.counts,{PASS:89,FAIL:0,PENDING:0});
  for(const r of report.results){assert.equal(r.status,'PASS',r.id);assert.ok(r.evidence!==undefined,r.id+': evidence missing');}
  for(const scenario of scenarios){
    const original=report.results.find(r=>r.id===scenario.id+'/original-prose-ui').evidence;
    const prose=corpus.cases.find(c=>c.id===scenario.id).sections.filter(s=>s.label.startsWith('作文候補'));
    assert.equal(original.meaningAcceptance,'not asserted by this preservation route');
    assert.deepEqual(original.checks.map(row=>row.original),prose.map(p=>p.text));
    for(const row of original.checks){
      for(const flag of ['unchanged','blocksDisabled','executionRejected','cancelRestoredSource'])assert.equal(row[flag],true,scenario.id+'/'+flag);
      assert.equal(row.automaticExecution,false);assert.ok(typeof row.validOwnerKey==='string'&&row.validOwnerKey.length>0);
      const valid=row.valid;assert.equal(valid.pending,false);assert.equal(valid.state,'DESIGN');
      assert.ok(typeof valid.source==='string');assert.ok(typeof valid.project==='string');assert.ok(JSON.parse(valid.project));
      for(const key of ['history','redo'])assert.ok(Number.isInteger(valid[key])&&valid[key]>=0);
      assert.equal(typeof valid.dirty,'boolean');
      assert.equal(row.pending.mode,'code');assert.equal(row.pending.ownerKey,row.validOwnerKey);
      assert.equal(row.pending.pending.ownerKey,row.validOwnerKey);assert.equal(row.pending.pending.kind,'code');
      assert.equal(row.pending.pending.value,row.original);assert.equal(row.initial.pending,true);
      for(const key of ['source','project','history','redo','dirty','state'])assert.deepEqual(row.initial[key],valid[key]);
      assert.deepEqual(row.afterRun,row.initial);assert.deepEqual(row.afterRunPending,row.pending);
      assert.deepEqual(row.cancelled,valid);assert.equal(row.cancelledOwnerKey,row.validOwnerKey);assert.equal(row.cancelledPending,null);
      for(const observed of [row.observedAfterRun,row.observedAfterCancel])assert.deepEqual(observed,{say:[],start:0,motion:[]});
    }
    if(scenario.id==='CI-20')continue;
    const source=report.results.find(r=>r.id===scenario.id+'/parser-core').evidence;
    const block=report.results.find(r=>r.id===scenario.id+'/blocks-core').evidence;
    assert.equal(source.structuredSource,scenario.source);assert.equal(block.structuredSource,scenario.source);
    assert.equal(block.sourceTraceCompared,true);
    for(const execution of [source.original,block.blocks]){
      assert.equal(execution.execution,'real EventScheduler / RuntimeModel');
      assert.deepEqual(execution.errors,[]);assert.ok(execution.roundtrips.length>0);
      assert.ok(Array.isArray(execution.trace));assert.ok(Array.isArray(execution.final.actors)&&execution.final.actors.length>0);
    }
    assert.deepEqual(source.original.final,block.blocks.final);assert.deepEqual(source.original.trace,block.blocks.trace);
  }
  for(const ambiguity of ambiguities){
    const evidence=report.results.find(r=>r.id===ambiguity.id+'/choices-nonexecution-cancel').evidence;
    assert.equal(evidence.original,ambiguity.source);assert.ok(new Set(evidence.choices).size>=2);
    for(const word of ambiguity.choices)assert.ok(evidence.choices.join('\n').includes(word));
    assert.equal(evidence.after.state,'DESIGN');
    for(const key of ['source','project','history','redo','dirty'])assert.deepEqual(evidence.after[key],evidence.before[key]);
    assert.equal(evidence.before.project,evidence.valid.project);
  }
  ids(report.coverage,scenarios.map(s=>s.id));for(const r of report.coverage)for(const k of ['originalProse','semantic','blocks'])assert.equal(r[k],'PASS',r.id+'/'+k);
  return {status:'PASS',checks:89,intents:20};
}
export function verifyRuntimeReport(report,inputs,directory){
  bind(report,inputs,runtimeInputPaths);assert.equal(report.schema,'akari-runtime-boundary-gate-v1');
  const r=report.runtime;assert.equal(r.schema,'akari-runtime-v2-boundary-evidence-v1');assert.equal(r.status,'PASS');
  assert.equal(r.productSha256,inputs.productSha256);assert.equal(r.transport,'file://');
  assert.equal(sha(fs.readFileSync(path.join(directory,'candidate.html'))),inputs.productSha256);
  assert.equal(r.expectedPassCount,20);assert.equal(r.passed,20);assert.equal(r.failed,0);assert.ok(r.unverified===0||r.unverified===1);
  assert.equal(r.runs.length,6);
  for(let i=0;i<runtimeRuns.length;i++){
    const [script,file,expected]=runtimeRuns[i],run=r.runs[i];
    assert.equal(run.script,script);assert.equal(run.evidence,file);assert.equal(run.exitCode,0);assert.equal(run.signal,null);
    assert.ok(!run.error);assert.equal(run.snapshotMatches,true);
    const observations=run.reports.filter(row=>row.id==='NATIVE-TAB-VISIBILITY-OBSERVATION');
    assert.ok(observations.length<=1);if(observations.length){
      assert.equal(script,'entry-browser.cjs');assert.equal(observations[0].pass,null);
      assert.equal(observations[0].status,'UNVERIFIED');assert.ok(observations[0].observed);assert.ok(observations[0].note);
    }
    const mandatory=run.reports.filter(row=>row.id!=='NATIVE-TAB-VISIBILITY-OBSERVATION');ids(mandatory,expected);
    const evidence=JSON.parse(fs.readFileSync(path.join(directory,file)));
    assert.equal(evidence.productSha256,inputs.productSha256);assert.deepEqual(evidence.reports,run.reports);
    for(const row of mandatory)assert.equal(row.pass,true,row.id);
    if(script.includes('browser')){assert.equal(evidence.transport,'file://');assert.equal(evidence.browser,browserEnvironment.version);}
  }
  assert.equal(r.unverified,r.runs.flatMap(run=>run.reports).filter(row=>row.id==='NATIVE-TAB-VISIBILITY-OBSERVATION').length);
  const formal=JSON.parse(fs.readFileSync(path.join(directory,'formal-player-browser-evidence.json')));
  assert.equal(formal.playerSha256,sha(fs.readFileSync(path.join(directory,'formal-player.html'))));
  return {status:'PASS',checks:20,runners:6};
}

export const negativeCaseIds = [
  ...['FAIL','PENDING','INCOMPLETE','NOT_RUN'].flatMap(s=>['INTENT/status-'+s,'RUNTIME/status-'+s]),
  'INTENT/missing-case','INTENT/duplicate-case','INTENT/false-total','INTENT/missing-evidence',
  'INTENT/stale-product','INTENT/changed-oracle','INTENT/changed-audit-input','INTENT/wrong-browser',
  'INTENT/filtered-run','INTENT/unverified-coverage','INTENT/missing-runtime-primitives','INTENT/different-block-trace',
  'RUNTIME/missing-runner','RUNTIME/duplicate-case','RUNTIME/stale-product','RUNTIME/unverified',
  'RUNTIME/child-timeout','RUNTIME/child-snapshot','RUNTIME/changed-child-report','RUNTIME/observation-promoted','RUNTIME/required-case-unverified',
  'STATIC/missing-check','STATIC/changed-doc-hash','STATIC/execution-claim',
  'MIGRATION/missing-stable-id','MIGRATION/stale-snapshot',
  ...['unchanged','blocksDisabled','executionRejected','cancelRestoredSource','automaticExecution']
    .flatMap(flag=>['INTENT/prose-missing-'+flag,'INTENT/prose-invalid-'+flag]),
  ...['owner','pending-owner','pending-kind','pending-value','valid-pending','valid-state','initial-pending',
    'initial-source','initial-project','initial-history','initial-redo','initial-dirty','initial-state',
    'run-project','run-history','run-pending','run-speech','run-start','run-motion',
    'cancel-project','cancel-history','cancel-owner','cancel-pending','cancel-execution']
    .map(key=>'INTENT/prose-'+key),
];
export function verifyNegativeReport(report,inputs){
  bind(report,inputs,['audit/tests/japanese-gate-negative.mjs','audit/lib/japanese-gate-contract.mjs']);
  assert.equal(report.schema,'akari-japanese-gate-negative-v1');ids(report.results,negativeCaseIds);
  for(const row of report.results)assert.equal(row.rejected,true,row.id);
  return {status:'PASS',rejections:negativeCaseIds.length};
}
