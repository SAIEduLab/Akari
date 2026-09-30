import { currentProductFile } from "./product-path.cjs";
import assert from 'node:assert/strict';

// Feature names are stable across producer releases and candidate snapshots.
export const formatCompatibilityIds = Object.freeze([
  'FORMAT-PROJECT-PRODUCER-INDEPENDENT',
  'FORMAT-PROJECT-CONTRACT-REJECTION',
  'FORMAT-RUNTIME-PRODUCER-INDEPENDENT',
  'FORMAT-RUNTIME-CONTRACT-REJECTION',
  'FORMAT-FINGERPRINT-METADATA-EXCLUSION',
  'FORMAT-BROWSER-FILE-ROUNDTRIP',
  'FORMAT-BROWSER-IMPORT-ATOMICITY',
  'FORMAT-BROWSER-AUTOSAVE-RECOVERY',
  'FORMAT-BROWSER-STANDALONE-OFFLINE',
]);

export function verifyFormatCompatibility(report, currentSnapshot) {
  assert.equal(report.schema, 'akari-format-compatibility-v1');
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.snapshot, currentSnapshot, 'report must match final input snapshot');
  assert.equal(report.environment, 'chromium');
  assert.ok(typeof report.browser === 'string' && report.browser.length > 0, 'missing browser identity');
  assert.equal(report.total, formatCompatibilityIds.length);
  assert.match(report.fixture?.currentRelease ?? '', /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,79}$/);
  assert.match(report.fixture?.priorRelease ?? '', /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,79}$/);
  assert.notEqual(report.fixture.priorRelease, report.fixture.currentRelease, 'producer fixture must differ');
  for(const key of ['priorProductSha256','priorFileSha256'])assert.match(report.fixture[key] ?? '', /^[a-f0-9]{64}$/);
  assert.ok(Array.isArray(report.results));
  const ids = report.results.map(r => r?.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate format feature ID');
  assert.deepEqual([...ids].sort(), [...formatCompatibilityIds].sort(), 'format feature coverage');
  for (const row of report.results) {
    assert.equal(row.status, 'PASS', row.id);
    assert.equal(row.pass, true, row.id);
    assert.ok(row.evidence && typeof row.evidence === 'object', row.id + ': missing evidence');
  }
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.networkRequests, []);
  return true;
}

export function checkFormatValidatorNegatives() {
  const snapshot = {productSha256:'a'.repeat(64),files:{[currentProductFile()]:'a'.repeat(64)}};
  const valid = () => ({schema:'akari-format-compatibility-v1',status:'PASS',snapshot:structuredClone(snapshot),
    environment:'chromium',browser:'fixed-browser',total:formatCompatibilityIds.length,
    fixture:{currentRelease:'1.0.0',priorRelease:'9.8.7',priorProductSha256:'b'.repeat(64),priorFileSha256:'c'.repeat(64)},
    results:formatCompatibilityIds.map(id=>({id,status:'PASS',pass:true,evidence:{checked:true}})),
    pageErrors:[],networkRequests:[]});
  verifyFormatCompatibility(valid(),snapshot);
  const reject = change => {const r=valid();change(r);assert.throws(()=>verifyFormatCompatibility(r,snapshot));};
  reject(r=>r.results.pop());
  reject(r=>r.results[1].id=r.results[0].id);
  reject(r=>r.results[0].status='FAIL');
  reject(r=>r.results[0].pass=false);
  reject(r=>r.snapshot.productSha256='b'.repeat(64));
  reject(r=>r.pageErrors.push('page error'));
  reject(r=>r.networkRequests.push('https://example.invalid'));
  reject(r=>r.browser='');
  reject(r=>r.fixture.priorRelease=r.fixture.currentRelease);
  reject(r=>r.fixture.priorProductSha256='invalid');
  return true;
}
