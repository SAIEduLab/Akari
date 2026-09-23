import path from 'node:path';
export function gateSteps(browser,dir) {
  const out=name=>path.join(dir,name);
  return [
    ['externalization','audit/tests/externalization-static.mjs',out('externalization-static.json')],
    ['node-product','audit/tests/node-product.mjs',out('node-product.json')],
    ['core-browser','audit/run-product-tests.mjs',browser,'Akari.html',out('current-selftest.json')],
    ['core-negative','audit/tests/harness-negative.mjs',browser,out('current-selftest.json'),out('harness-negative.json')],
    ['normal-product','audit/tests/normal-product.mjs',browser,'Akari.html',out('normal-product.json')],
    ['fixed08','audit/run-headless-selftest.mjs',browser,'audit/fixtures/0.8/Akari.html',out('baseline-selftest.json')],
    ['fixed100','audit/run-fixed-baseline.mjs',browser,out('completed-baseline-selftest.json')],
    ['language-node','audit/run-language-tests.mjs','--node',out('language-node.json')],
    ['language-browser','audit/run-language-tests.mjs',browser,out('language-browser.json')],
    ['language-negative','audit/tests/language-harness-negative.mjs',out('language-browser.json')],
    ['quality-negative','audit/tests/quality-policy-negative.mjs'],
    ['language-boundaries','audit/tests/language-boundaries.mjs',out('language-boundaries.json')],
    ['editor-node','audit/run-editor-surface-tests.mjs','--node',out('editor-node.json')],
    ['editor-browser','audit/run-editor-surface-tests.mjs',browser,out('editor-browser.json')],
    ['gui','audit/tests/phase3-browser.mjs',browser,out('gui.json')],
    ['surface-negative','audit/tests/surface-negative.mjs',out('editor-browser.json'),out('gui.json')],
  ];
}
