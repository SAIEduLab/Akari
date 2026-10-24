import { currentProductFile } from "./product-path.cjs";
import path from 'node:path';
import assert from 'node:assert/strict';
export const auditBundleKinds=['selftest','audio-codecs-win32',...['session','ui','limits','schemas','extra'].map(g=>'full-browser-'+g)];
export const auditJobIds=['audio-codecs','full-browser-gate','selftest'];
export function gateSteps(browser,dir){const file=n=>path.join(dir,n+'.json');return [
  ['static','audit/tests/static-contract.mjs',file('static')],
  ['audit-inventory','audit/tests/audit-inventory.mjs',file('audit-inventory')],
  ['product-source','audit/tests/product-source.mjs',file('product-source')],
  ['publication-inventory','audit/tests/publication.mjs','inventory',file('publication-inventory')],
  ['publication-documents','audit/tests/publication.mjs','documents',file('publication-documents')],
  ['release-distribution','audit/freeze-release.mjs',file('release-distribution')],
  ['workflow-contract','audit/tests/workflow-contract.mjs',file('workflow-contract')],
  ['change-guard-negative','audit/tests/change-guard-negative.mjs',file('change-guard-negative')],
  ['release-policy-negative','audit/tests/release-policy-negative.mjs',file('release-policy-negative')],
  ['integrity','audit/tests/execution-continuity.mjs',file('integrity')],
  ['browser-environment','audit/tests/browser-environment.mjs',browser,file('browser-environment')],
  ['ci-regression','audit/tests/ci-regression.mjs',file('ci-regression')],
  ['dom-regression','audit/tests/dom-render-regression.cjs',file('dom-regression')],
  ['node-product','audit/tests/node-product.mjs',file('node-product')],
  ['product','audit/run-product-tests.mjs',browser,currentProductFile(),file('product')],
  ['language-node','audit/run-language-tests.mjs','--node',file('language-node')],
  ['language-browser','audit/run-language-tests.mjs',browser,file('language-browser')],
  ['editor-node','audit/run-editor-surface-tests.mjs','--node',file('editor-node')],
  ['editor-browser-core','audit/run-editor-surface-tests.mjs',browser,file('editor-browser-core')],
  ['editor-gui','audit/tests/editor-browser.mjs',browser,file('editor-gui')],
  ['normal','audit/tests/normal-product.mjs',browser,currentProductFile(),file('normal')],
  ['ownership','audit/tests/source-ownership.mjs',browser,path.join(dir,'ownership','report.json')],
  ['ui-buttons','audit/tests/ui-buttons.mjs',browser,file('ui-buttons')],
  ['block-fields','audit/tests/block-field-width.mjs',browser,file('block-fields')],
  ['format-compatibility','audit/tests/format-compatibility.mjs',browser,file('format-compatibility')],
  ['editor-assets','audit/tests/editor-assets.mjs',browser,file('editor-assets')],
  ['designer','audit/tests/designer-zoom.mjs',browser,file('designer')],
  ['toolbar-stage','audit/tests/toolbar-stage-browser.cjs',browser,file('toolbar-stage')],
  ['toolbar-stage-verify','audit/tests/toolbar-stage-verify.mjs',file('toolbar-stage'),file('toolbar-stage-verify')],
  ['manual','audit/tests/manual-docs.mjs',browser,path.join(dir,'manual')],
  ['language-boundaries','audit/tests/language-boundaries.mjs',file('language-boundaries')],
  ['harness-negative','audit/tests/harness-negative.mjs',browser,file('product'),file('harness-negative')],
  ['language-negative','audit/tests/language-harness-negative.mjs',file('language-browser'),file('language-negative')],
  ['surface-negative','audit/tests/surface-negative.mjs',file('editor-browser-core'),file('editor-gui'),file('surface-negative')],
  ['japanese-contract-static','audit/tests/contract-gate.mjs','static',file('japanese-contract-static')],
  ['language-expectations-static','audit/tests/contract-gate.mjs','expectations',file('language-expectations-static')],
  ['sentence-form-coverage','audit/tests/sentence-form-coverage.mjs',file('sentence-form-coverage')],
  ['spec-examples','audit/tests/spec-examples.mjs',file('spec-examples')],
  ['spec-expectations-static','audit/tests/spec-expectations-static.mjs',file('spec-expectations-static')],
  ['spec-expectations','audit/tests/spec-expectations-run.mjs',file('spec-expectations')],
  ['spec-expectations-ui','audit/tests/spec-expectations-ui.mjs',browser,file('spec-expectations-ui')],
  ['japanese-intent-browser','audit/tests/japanese-intent-browser.mjs',browser,file('japanese-intent-browser')],
  ['runtime-boundary','audit/tests/runtime-boundary-gate.mjs',currentProductFile(),browser,path.join(dir,'runtime-boundary'),file('runtime-boundary')],
  ['japanese-gate-negative','audit/tests/japanese-gate-negative.mjs',file('japanese-gate-negative')],
  ['review-actor','audit/tests/review-actor.mjs',currentProductFile(),browser,path.join(dir,'review-actor')],
  ['review-language','audit/tests/review-language.mjs',browser,currentProductFile(),file('review-language')],
  ['review-units','audit/tests/review-units.mjs',browser,currentProductFile(),file('review-units')],
  ['review-first-use','audit/tests/review-first-use.mjs',browser,currentProductFile(),file('review-first-use')],
  ['review-readable','audit/tests/review-readable.mjs',browser,currentProductFile(),file('review-readable')],
  ['review-harness-negative','audit/tests/review-harness-negative.mjs',file('review-harness-negative')],
  ['extension-foundation','audit/tests/extension-foundation.mjs',browser,file('extension-foundation')],
  ['extension-foundation-negative','audit/tests/extension-foundation-negative.mjs',file('extension-foundation-negative')],
  ['samples','audit/tests/samples.mjs',browser,file('samples')],
  ['samples-negative','audit/tests/samples-negative.mjs',file('samples-negative')],
  ['license-static','audit/tests/license-static.mjs',file('license-static')],
  ['license-browser','audit/tests/license-browser.mjs',browser,file('license-browser')],
  ['license-verify','audit/tests/license-verify.mjs',file('license-browser'),file('license-verify')],
  ['export-open','audit/tests/export-open-browser.cjs',browser,path.join(dir,'export-open')],
  ['speech-display','audit/tests/speech-display-browser.mjs',browser,file('speech-display')],
  ['speech-display-verify','audit/tests/speech-display-verify.mjs',file('speech-display'),file('speech-display-verify')],
  ['entry-unit','audit/tests/entry-workshop-core.mjs',file('entry-unit')],
  ['entry-browser','audit/tests/entry-workshop-browser.mjs',browser,file('entry-browser')],
  ['entry-verify','audit/tests/entry-workshop-verify.mjs',file('entry-unit'),file('entry-browser'),file('entry-verify')],
];}

export function acceptanceIds(kind){return acceptanceCommands[kind].map(command=>{const args=command.slice(5).match(/"[^"]*"|\S+/g);return args[0]+(args[0].includes('child-ux')?'/'+args[1]:'');});}
export function verifyAcceptanceExecution(report,kind,inputs){
  assert.equal(report.schema,'akari-acceptance-execution-v1');assert.equal(report.status,'PASS');assert.deepEqual(report.snapshot,inputs);
  assert.deepEqual(report.steps.map(r=>r.id),acceptanceIds(kind));assert.equal(new Set(report.steps.map(r=>r.id)).size,report.steps.length);
  for(const row of report.steps){assert.equal(row.status,'PASS',row.id);assert.equal(row.exit,0);assert.equal(row.signal,null);assert.ok(row.log&&row.ms>=0);}
  return true;
}

export const acceptanceCommands={
  "composition": [
    "node audit/tests/child-ux.mjs static audit-evidence/acceptance/child-ux-static.json",
    "node audit/tests/actions-transfer-static.mjs audit-evidence/acceptance/transfer.json",
    "node audit/tests/actions-transfer-values.mjs audit-evidence/acceptance/values.json",
    "node audit/tests/command-meaning.mjs audit-evidence/acceptance/command-meaning.json",
    "node audit/tests/basic-intents.mjs audit-evidence/acceptance/basic-intents.json",
    "node audit/tests/finite-semantic-variants.mjs audit-evidence/acceptance/finite-semantic-variants.json",
    "node audit/tests/semantic-negative-pairs.mjs audit-evidence/acceptance/semantic-negative-pairs.json",
    "node audit/tests/natural-roles.mjs audit-evidence/acceptance/natural-roles.json",
    "node audit/tests/document-units.mjs audit-evidence/acceptance/document-units.json",
    "node audit/tests/draft-persistence.mjs audit-evidence/acceptance/draft-persistence.json",
    "node audit/tests/data-form-values.mjs audit-evidence/acceptance/data-form-values.json",
    "node audit/tests/numeric-display.mjs audit-evidence/acceptance/numeric-display.json",
    "node audit/tests/resource-references.mjs audit-evidence/acceptance/resource-references.json",
    "node audit/tests/search-bindings.mjs audit-evidence/acceptance/search-bindings.json",
    "node audit/tests/basic-intents-browser.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/acceptance/basic-intents-browser.json",
    "node audit/tests/audio-output-browser.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/acceptance/audio-output-browser.json",
    "node audit/tests/structured-editing-browser.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/acceptance/structured-editing-browser.json",
    "node audit/tests/composition-acceptance.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/acceptance/composition.json",
    "node audit/tests/workspace-history-browser.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/acceptance/workspace-history-browser.json",
    "node audit/tests/data-form-browser.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/acceptance/data-form-browser.json",
    "node audit/tests/numeric-display-browser.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/acceptance/numeric-display-browser.json",
    "node audit/tests/resource-references-browser.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/acceptance/resource-references-browser.json",
    "node audit/tests/search-bindings-browser.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/acceptance/search-bindings-browser.json",
    "node audit/tests/ux-surface-browser.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/acceptance/ux-surface-browser.json",
    "node audit/tests/ux-edit-language.mjs audit-evidence/acceptance/ux-edit-language.json",
    "node audit/tests/ux-edit-browser.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/acceptance/ux-edit-browser.json",
    "node audit/tests/ux-bubble-layout.cjs \"$AKARI_CODEC_BROWSER\" audit-evidence/acceptance/ux-bubble-layout.json",
    "node audit/tests/ux-normal-language.mjs audit-evidence/acceptance/ux-normal-language.json",
    "node audit/tests/ux-normal-browser.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/acceptance/ux-normal-browser.json",
    "node audit/run-ux-normal-gui.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/acceptance",
    "node audit/tests/child-ux.mjs matrix audit-evidence/acceptance/ux-normal-matrix.json audit-evidence/acceptance/child-ux-matrix.json",
    "node audit/run-ux-phrase-gui.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/acceptance",
    "node audit/tests/autosave-state-browser.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/acceptance/autosave-state-browser.json",
    "node audit/tests/search-layout-browser.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/acceptance/search-layout-browser.json",
    "node audit/tests/actions-transfer-verify.mjs audit-evidence/acceptance"
  ],
  "editing": [
    "node audit/tests/ux-insertion-context-browser.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/editing/insertion-context.json",
    "node audit/tests/ux-insertion-context-verify.mjs audit-evidence/editing/insertion-context.json",
    "node audit/tests/speech-name-layout-browser.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/editing/speech-name-layout.json",
    "node audit/tests/speech-name-layout-verify.mjs audit-evidence/editing/speech-name-layout.json",
    "node audit/tests/speech-preview-browser.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/editing/speech-preview.json",
    "node audit/tests/speech-preview-verify.mjs audit-evidence/editing/speech-preview.json audit-evidence/editing/speech-preview-verification.json",
    "node audit/tests/child-language-ui-browser.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/editing/child-language-ui.json",
    "node audit/tests/child-language-ui-verify.mjs audit-evidence/editing/child-language-ui.json",
    "node audit/tests/child-ux.mjs language audit-evidence/editing/child-language-ui.json audit-evidence/editing/child-ux-language.json",
    "node audit/tests/component-controls-browser.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/editing/component-controls.json",
    "node audit/tests/component-controls-verify.mjs audit-evidence/editing/component-controls.json audit-evidence/editing/component-controls-verification.json",
    "node audit/tests/child-diagnostics-browser.mjs \"$AKARI_CODEC_BROWSER\" audit-evidence/editing/child-diagnostics.json",
    "node audit/tests/child-diagnostics-verify.mjs audit-evidence/editing/child-diagnostics.json audit-evidence/editing/child-diagnostics-verification.json",
    "node audit/tests/child-diagnostics-negative.mjs audit-evidence/editing/child-diagnostics.json audit-evidence/editing/child-diagnostics-negative.json"
  ]
};

// Workflow jobs, their dependencies and the audit entry commands each job runs, in order.
// Every other run line in a workflow is setup (audit/lib/workflow-contract.mjs).
const sameRepository="${{ github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository }}";
const afterNeeds="${{ always() && (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository) }}";
const requestedSha={AKARI_REQUESTED_SHA:'${{ github.event.pull_request.head.sha || github.sha }}'};
export const workflowContract=Object.freeze({
  'akari-audit.yml':{triggers:'audit',env:requestedSha,jobs:{
    selftest:{if:sameRepository,needs:[],entries:[
      {run:'node audit/run-local-gate.mjs "$AKARI_BROWSER" audit-evidence/selftest'},
      {run:'node audit/verify-evidence.mjs seal selftest audit-evidence/selftest',if:'always()'}]},
    'full-browser-gate':{if:sameRepository,needs:[],entries:[
      {run:'node audit/browser/run-full-browser-audit.mjs --group "${{ matrix.group }}" --evidence "audit-evidence/full-browser-${{ matrix.group }}"'},
      {run:'node audit/verify-evidence.mjs seal "full-browser-${{ matrix.group }}" "audit-evidence/full-browser-${{ matrix.group }}"',if:'always()'}]},
    'audio-codecs':{if:sameRepository,needs:[],entries:[
      {run:'node audit/tests/audio-codecs.mjs "$AKARI_CODEC_BROWSER" audit-evidence/audio/report.json'},
      {run:'node audit/tests/block-field-width.mjs "$AKARI_CODEC_BROWSER" audit-evidence/audio/block-field-width.json'},
      {run:'node audit/verify-evidence.mjs seal audio-codecs-win32 audit-evidence/audio',if:'always()'}]},
    aggregate:{if:afterNeeds,needs:auditJobIds,entries:[
      {run:'node audit/verify-evidence.mjs aggregate downloaded-evidence audit-evidence/aggregate.json',env:{AKARI_NEEDS:'${{ toJSON(needs) }}'}}]},
  }},
  'akari-acceptance.yml':{triggers:'audit',env:requestedSha,jobs:{
    'composition-acceptance':{if:sameRepository,needs:[],entries:[{run:'node audit/run-acceptance.mjs composition'}]},
    'ux-editing':{if:sameRepository,needs:[],entries:[{run:'node audit/run-acceptance.mjs editing'}]},
    'child-ux-aggregate':{if:afterNeeds,needs:['composition-acceptance','ux-editing'],entries:[
      {run:'node audit/tests/child-ux.mjs history audit-evidence/child-ux/retry-history.json',if:'always()',env:{GITHUB_TOKEN:'${{ github.token }}'}},
      {run:'node audit/tests/child-ux.mjs aggregate audit-evidence/child-ux/downloaded audit-evidence/child-ux/child-ux-aggregate.json',if:'always()',env:{AKARI_CHILD_UX_NEEDS:'${{ toJSON(needs) }}'}}]},
  }},
  'akari-change-guard.yml':{triggers:'guard',jobs:{
    'audit-change-guard':{needs:[],fullHistory:true,entries:[
      {run:'node audit/tests/change-guard.mjs "$AKARI_BASE_SHA" "$AKARI_HEAD_SHA" audit-evidence/change-guard/report.json',env:{AKARI_BASE_SHA:'${{ github.event.pull_request.base.sha }}',AKARI_HEAD_SHA:'${{ github.event.pull_request.head.sha }}'}}]},
  }},
});
export const changeGuardLabel='owner-approved-audit-change';

export const integrityControlIds=[...[-1,0,12,24].map(n=>'gate-continuity:'+n),...['pass',...auditBundleKinds,'missing-jobs','empty-jobs','cancelled-job','missing-job','unexpected-job'].map(n=>'aggregate:'+n),...['valid','missing-file','extra-file','changed-bytes','changed-snapshot','changed-provenance','wrong-platform','changed-kind','changed-result','rehashed-failure'].map(n=>'bundle:'+n),'freeze-record-and-verify','freeze-changed-file-refused','freeze-contract-from-features','freeze-changed-contract-refused','freeze-unknown-contract-refused','freeze-second-release-refused',...['composition','editing'].flatMap(k=>['missing','duplicate','failed','timeout','snapshot','fake-pass'].map(n=>'execution:'+k+'/'+n)),...['composition','editing'].map(k=>'execution:'+k+'/persisted-seal-failure'),...['valid','wrong-schema','wrong-step','failed-status','stale-snapshot','missing-results','missing-case','extra-case','duplicate-case','failed-case','release-record-changed','release-record-missing','node-product-suite-missing'].map(n=>'gate-cases:'+n)];
