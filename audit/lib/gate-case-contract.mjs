// Complete case sets for gate steps whose evidence is a list of named checks.
// The case IDs are declared here, independently of the tests that produce them.
// A step passes only with exactly these cases, each PASS, bound to the current inputs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {snapshot} from './input-snapshot.cjs';
import {currentProductFile,currentReleaseFile} from './product-path.cjs';

export const caseReportSchema='akari-gate-cases-v1';

// Product suites that are deterministic without a browser; their IDs come from audit/manifests/product-tests.json.
export const nodeProductSuites=Object.freeze(['runEditorCoreTests','runSemanticContractTests','runAkariSelfTests','runCoreTests','runSyntaxTests','runBlockCodecTests','runDesignResizeTests','runColorPickerTests']);
export const editorSyntaxReuseIds=Object.freeze(['cold','warm','equivalent-project-copy','shared-source-error','shared-source-repair','shared-argument-change','shared-argument-restore','shared-name-change','shared-name-restore','registered-call-phrase','call-phrase-removed','stage-and-actor-rename','actor-name-ambiguous-source','data-declaration-added','data-declaration-removed','local-data-added','local-data-removed','syntax-error','syntax-error-cached','returned-diagnostics-isolated','multi-unit-document','document-unit-id-change','undo-restores-old-project','redo-restores-new-project','different-project-same-keys','return-to-first-project','unchanged-source-parser-count','bounded-retained-documents']);

const releaseNameKinds=['v-number','version-number','release-number','numbered-suite'];
const surfaceRejections=['missing-result','duplicate-result','unknown-id','skipped-status','false-pass','total-changed','failed-status','snapshot-field-added','changed-product-hash','wrong-environment','missing-browser'];
// One mutated workflow text (or contract declaration) per workflow rule.
export const workflowRejectionIds=Object.freeze([
  'workflow-set/unknown-file','workflow-set/missing-file',
  'yaml/anchor','yaml/alias','yaml/tab-indentation','yaml/flow-mapping','yaml/folded-scalar','yaml/duplicate-key',
  'workflow-keys/top-level-defaults','workflow-env/changed',
  'triggers/missing-push','triggers/extra-branch','triggers/missing-dispatch','triggers/extra-schedule','triggers/path-filter','triggers/guard-without-label-events',
  'permissions/write-contents','permissions/job-write',
  'concurrency/cancels-main','concurrency/shared-main-group','concurrency/missing',
  'jobs/missing-job','jobs/extra-job','jobs/condition-changed','job-keys/reusable-workflow',
  'runner/wrong-platform','runner/missing-bash',
  'needs/dropped-job','needs/without-always',
  'continue-on-error/job','continue-on-error/step',
  'timeout/missing','timeout/not-integer',
  'artifact/retention-days','artifact/missing-retention','artifact/missing-files-allowed',
  'commands/ad-hoc-audit-check','commands/ad-hoc-shell-check','commands/missing-entry','commands/reordered-entries','commands/duplicate-entry',
  'step-condition/disabled-entry','step-env/entry-env-changed','step-env/undeclared','step-keys/shell-override','actions/unknown-action',
  'bundles/matrix-group-dropped','acceptance/kind-dropped','checkout/guard-shallow-history']);
// Synthetic base/head trees for every change-guard rule, plus accepted controls.
export const changeGuardCaseIds=Object.freeze([
  'real-tree/identity-extracted','control/documentation-only','control/additions-only','control/pin-moved','control/base-advanced-after-branch',
  'removed/gate-step','removed/gate-case','removed/integrity-control','removed/acceptance-suite','removed/browser-group','removed/browser-task','removed/browser-case',
  'removed/product-suite','removed/product-test','removed/language-test','removed/workflow-job','removed/workflow-entry',
  'pin/changed','pin/removed',
  'label/approves-removal','label/other-label-only','label/missing-event','label/payload-without-labels','label/unreadable-payload',
  'version/source-changed-without-bump','version/product-changed-without-bump','version/patch-bump-accepted','version/patch-skipped','version/patch-skipped-with-label','version/minor-bump','version/minor-bump-with-label','version/major-bump-with-label','version/lower-with-label','version/bump-without-product-change','version/label-does-not-excuse',
  'release/two-manifests','release/wrong-name','release/missing',
  'identity/head-evaluation-failure','identity/no-merge-base']);

// Past work-process names that audit callables must not use (release-policy-negative).
export const pastProcessNames=Object.freeze(['verifyRepair02Matrix','runPhase3Checks','loadDevSessionEvidence','verifyFollowupBundle','readNewContracts','checkFormat1Storage','runRuntime2Boundary']);
import {boundaryRejectionIds} from './language-boundaries-contract.mjs';
export const gateCaseIds=Object.freeze({
  'release-distribution':['current-distribution-recorded'],
  'workflow-contract':['current-workflows-accepted',...workflowRejectionIds],
  'change-guard-negative':[...changeGuardCaseIds],
  'release-policy-negative':[
    'accepted/base-fixture','accepted/unrelated-audit-names','accepted/ipv6-and-base64-names','accepted/release-key-and-codec-object',
    ...releaseNameKinds.flatMap(kind=>['release-name/product/'+kind,'release-name/audit/'+kind]),
    'release-name/audit/property-key',
    ...pastProcessNames.flatMap(name=>['past-process/function/'+name,'past-process/property/'+name]),
    'accepted/responsibility-audit-names','accepted/product-animation-phase-name',
    'release-name/audit/arrow-binding',
    'release-read/format-check-uses-release','release-read/producer-compared-to-release','release-read/release-alias','release-read/producer-literal-compare','release-read/computed-producer-key',
    'release-literal/copied','release-read/producer-destructured','executable-contract/invalid-format-id',
    'candidate/accepted','candidate/release-name-function','candidate/release-compare','candidate/producer-alias','candidate/release-name-object-method','candidate/release-name-class-method',
    'producer-metadata/reused-in-fingerprint','release-read/object-alias','release-read/destructured-alias'],
  'ci-regression':[
    'stage-reach/accepted',...['missing-corner','duplicate-corner','wrong-edge','clipped','nonfinite','changed-dimensions','scroll-outside-range','forged-hit'].map(id=>'stage-reach/reject-'+id),
    'click-guard/cancel-sets-suppression','click-guard/next-click-suppressed',
    'fresh-context/isolated-pages','fresh-context/failure-propagated-once','fresh-context/page-error-recorded','fresh-context/network-aborted','fresh-context/startup-failure-closed',
    'browser-environment/accepted',...['status','snapshot','playwright','revision','browser','launch-timeout','executable-hash','executable-path','missing-launch','launch-id','launch-browser','slow-launch','negative-launch-time','launch-script-result','launch-mp3'].map(name=>'browser-environment/reject-'+name),
    'native-focus/old-session-retains-emulation','native-focus/owner-session-disabled','native-focus/reject-playwright-version','native-focus/reject-missing-connection','native-focus/reject-missing-session','native-focus/reject-cdp-error',
    'ui-buttons/failures-retained-without-retry','ui-buttons/decreasing-budget','ui-buttons/validator-negatives',
    'partial-rerun/earlier-attempt-selected','partial-rerun/latest-attempt-selected',...['attempt-mismatch','snapshot-mismatch','newer-failure','unsealed-latest','different-run','missing-kind','future-attempt','noncanonical-attempt'].map(name=>'partial-rerun/reject-'+name),
    'asset-diagnostics/errors-persisted-before-stalled-screenshots','asset-diagnostics/later-cases-run-once','asset-diagnostics/decreasing-budget',
    'fixture-readiness/offline-viewport-context','fixture-readiness/unfinished-import-rejected',
    'perf-report/accepted',...['error','input-missing','switch-missing','nonfinite','negative','total-deadline','false-pass','wrong-source','invalid-dom'].map(name=>'perf-report/reject-'+name),
    'event-report/accepted',...['negative-missing','negative-false','negative-owner','gui-false','seed-wrong','files-missing','files-duplicate','path-escape','artifact-missing','artifact-snapshot','artifact-fault','source-changed','cleanup-incomplete','body-edit-missing','input-unordered','random-missing','wait-missing','explicit-stop-missing','midpoint-wrong','terminal-missing','failure-code','record-task','record-source','post-error-command','frozen-child-false','frozen-child-missing','control-enabled','deadline-not-advanced','deadline-progress','mutation-not-applied','record-mutated','record-after-stop','mode-diverged'].map(name=>'event-report/reject-'+name),
    'language-boundaries/accepted',...boundaryRejectionIds.map(name=>'language-boundaries/reject-'+name),
    'diagnostic-guidance/list-and-scoped-scalar','diagnostic-guidance/typed-comparison'],
  'dom-regression':['normal-observation','latest-tree-defense-without-render-guards','reentrant-mutant-rejected'],
  'harness-negative':['valid-report-accepted','missing-id','duplicate-id','extra-id','missing-suite','duplicate-suite','empty-suite','missing-environment','wrong-environment','exception-status','timeout-status','false-pass','contradictory-status','forged-summary','forged-aggregate','missing-snapshot','changed-product-hash','incomplete','shrunk-manifest','missing-browser-executable','empty-registration','missing-suite-file','registration-exception','registration-syntax-error','nonsettling-evaluation-timeout'],
  'language-negative':['valid-report-accepted','missing-result','duplicate-result','unknown-id','failed-status','skipped-status','total-changed','failed-count','report-status-failed','completion-flag-flipped','missing-environment','snapshot-field-added','changed-product-hash'],
  'surface-negative':['editor','gui'].flatMap(kind=>[kind+'/valid-report-accepted',...surfaceRejections.map(name=>kind+'/'+name)]),
  'license-verify':['valid-report-accepted','missing-result','wrong-copyright','changed-player-hash','native-download-disabled','network-request','changed-snapshot'],
});

export function nodeProductCaseIds(productManifest){
  const suites=nodeProductSuites.map(name=>productManifest.suites.find(suite=>suite.name===name));
  suites.forEach((suite,i)=>assert.ok(suite,'node product suite missing from manifest: '+nodeProductSuites[i]));
  return [...suites.flatMap(suite=>suite.ids.map(id=>suite.name+'/'+id)),...editorSyntaxReuseIds.map(id=>'editor-syntax-reuse/'+id)];
}
// Every declared case as step/case, for the pull-request change guard.
export function declaredGateCases(productManifest){
  return [...Object.entries(gateCaseIds).flatMap(([step,ids])=>ids.map(id=>step+'/'+id)),...nodeProductCaseIds(productManifest).map(id=>'node-product/'+id)];
}

// Records each named check after its assertions completed, and refuses reuse of a name.
export function caseRecorder(){
  const results=[];
  const pass=id=>{assert.ok(!results.some(row=>row.id===id),'case recorded twice: '+id);results.push({id,status:'PASS'});};
  return {results,pass};
}
export function caseReport(step,results,extra={},inputs=snapshot(currentProductFile())){
  return {schema:caseReportSchema,step,status:results.length&&results.every(row=>row.status==='PASS')?'PASS':'FAIL',snapshot:inputs,...extra,results};
}
export function writeCaseReport(output,step,results,extra={}){
  assert.ok(output,step+': result path required');
  const report=caseReport(step,results,extra);
  fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  return report;
}

export function verifyCaseReport(report,step,expectedIds,inputs){
  assert.equal(report.schema,caseReportSchema,step+': schema');
  assert.equal(report.step,step,step+': step');
  assert.equal(report.status,'PASS',step+': status');
  assert.deepEqual(report.snapshot,inputs,step+': snapshot');
  assert.ok(Array.isArray(report.results),step+': results');
  const ids=report.results.map(row=>row.id);
  assert.equal(new Set(ids).size,ids.length,step+': duplicate case');
  assert.equal(new Set(expectedIds).size,expectedIds.length,step+': duplicate declared case');
  assert.deepEqual([...ids].sort(),[...expectedIds].sort(),step+': case set');
  for(const row of report.results)assert.equal(row.status,'PASS',step+'/'+row.id);
  return true;
}
// The verified record must equal the committed record of the current release.
export function verifyReleaseDistribution(report,inputs,releaseRecord){
  verifyCaseReport(report,'release-distribution',gateCaseIds['release-distribution'],inputs);
  assert.deepEqual(report.record,releaseRecord,'release-distribution: verified record differs from the committed release record');
  return true;
}
export function currentReleaseRecord(){return JSON.parse(fs.readFileSync(currentReleaseFile()));}
// read(step) returns the parsed result file of that gate step.
export function verifyGateCaseReports(read,inputs,productManifest,releaseRecord=currentReleaseRecord()){
  for(const [step,ids]of Object.entries(gateCaseIds))if(step!=='release-distribution')verifyCaseReport(read(step),step,ids,inputs);
  verifyReleaseDistribution(read('release-distribution'),inputs,releaseRecord);
  verifyCaseReport(read('node-product'),'node-product',nodeProductCaseIds(productManifest),inputs);
  return true;
}
