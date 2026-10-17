const path = require('node:path');
const assert = require('node:assert/strict');
const { AKARI_RUNTIME_BOUNDARY_PRODUCT: productFile, AKARI_RUNTIME_BOUNDARY_OUTPUT: outputDir, AKARI_BROWSER: browserPath } = process.env;
assert.ok(productFile && outputDir && browserPath, 'Run audit/tests/runtime-boundary.mjs <product-html> <browser> [output-directory]');
const {makeRegressionProject} = require('../../fixtures/regression-project.cjs');
module.exports = { productFile: path.resolve(productFile), outputDir: path.resolve(outputDir), browserPath, makeRegressionProject };
