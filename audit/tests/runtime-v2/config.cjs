const path = require('node:path');
const assert = require('node:assert/strict');
const { AKARI_RUNTIME_V2_PRODUCT: productFile, AKARI_RUNTIME_V2_OUTPUT: outputDir, AKARI_BROWSER: browserPath } = process.env;
assert.ok(productFile && outputDir && browserPath, 'Run audit/tests/runtime-v2.mjs <product-html> <browser> [output-directory]');
const {makeRegressionProject} = require('../../fixtures/regression-project.cjs');
module.exports = { productFile: path.resolve(productFile), outputDir: path.resolve(outputDir), browserPath, makeRegressionProject };
