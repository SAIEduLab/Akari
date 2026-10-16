import { currentProductFile } from "./product-path.cjs";
import path from 'node:path';
import assert from 'node:assert/strict';
export const auditBundleKinds=['selftest','audio-codecs-linux','audio-codecs-win32',...['session','ui','limits','schemas','extra'].map(g=>'full-browser-'+g)];
export const auditJobIds=['audio-codecs','full-browser-gate','selftest'];
export function gateSteps(browser,dir){const file=n=>path.join(dir,n+'.json');return [
  ['static','audit/tests/static-contract.mjs',file('static')],
  ['product-source','audit/tests/product-source.mjs',file('product-source')],
  ['release-policy-negative','audit/tests/release-policy-negative.mjs'],
  ['integrity','audit/tests/execution-continuity.mjs',file('integrity')],
  ['browser-environment','audit/tests/browser-environment.mjs',browser,file('browser-environment')],
  ['ci-regression','audit/tests/ci-regression.mjs'],
  ['dom-regression','audit/tests/dom-render-regression.cjs'],
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
  ['manual','audit/tests/manual-docs.mjs',browser,path.join(dir,'manual')],
  ['language-boundaries','audit/tests/language-boundaries.mjs',file('language-boundaries')],
  ['harness-negative','audit/tests/harness-negative.mjs',browser,file('product'),file('harness-negative')],
  ['language-negative','audit/tests/language-harness-negative.mjs',file('language-browser')],
  ['surface-negative','audit/tests/surface-negative.mjs',file('editor-browser-core'),file('editor-gui')],
  ['japanese-contract-static','audit/tests/contract-gate.mjs','static',file('japanese-contract-static')],
  ['language-expectations-static','audit/tests/contract-gate.mjs','expectations',file('language-expectations-static')],
  ['japanese-intent-browser','audit/tests/japanese-intent-browser.mjs',browser,file('japanese-intent-browser')],
  ['runtime-v2','audit/tests/runtime-boundary-gate.mjs',currentProductFile(),browser,path.join(dir,'runtime-v2'),file('runtime-v2')],
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

export const integrityControlIds=[...[-1,0,12,24].map(n=>'gate-continuity:'+n),...['pass',...auditBundleKinds,'missing-jobs','empty-jobs','cancelled-job','missing-job','unexpected-job'].map(n=>'aggregate:'+n),...['valid','missing-file','extra-file','changed-bytes','changed-snapshot','changed-provenance','changed-kind','changed-result','rehashed-failure'].map(n=>'bundle:'+n),'freeze-record-and-verify','freeze-changed-file-refused',...['composition','editing'].flatMap(k=>['missing','duplicate','failed','timeout','snapshot','fake-pass'].map(n=>'execution:'+k+'/'+n)),...['composition','editing'].map(k=>'execution:'+k+'/persisted-seal-failure')];
