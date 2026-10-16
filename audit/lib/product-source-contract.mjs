import assert from 'node:assert/strict';

// The committed product must be exactly the build of src/; negatives prove the check can fail.
export const productSourceIds = [
  'PRODUCT-SOURCE-BYTES',
  'PRODUCT-SOURCE-COMPLETE',
  'PRODUCT-SOURCE-PORTABLE-EXTENSIONS',
  'REJECT-CHANGED-SOURCE',
  'REJECT-CHANGED-EXTENSION',
  'REJECT-UNINCLUDED-SOURCE',
  'REJECT-DUPLICATE-INCLUDE',
  'REJECT-MALFORMED-DIRECTIVE',
];

export function verifyProductSource(report, inputs) {
  assert.equal(report.schema, 'akari-product-source-v1');
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.snapshot, inputs);
  assert.deepEqual(report.results.map(r => r.id), productSourceIds);
  for (const r of report.results) assert.equal(r.status, 'PASS', r.id);
  assert.equal(report.productSha256, inputs.productSha256);
  assert.equal(report.buildSha256, inputs.productSha256);
  assert.ok(report.sources.includes('src/akari.html'));
  return true;
}
