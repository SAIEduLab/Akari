import { currentProductFile } from "./product-path.cjs";
import assert from 'node:assert/strict';

export const uiButtonIds = Object.freeze([
  'UI-BUTTON-SOURCE-NAV',
  'UI-BUTTON-BASIC-HISTORY',
  'UI-BUTTON-SIDE-ACTIONS',
  'UI-BUTTON-LEVELS',
  'UI-BUTTON-PENDING',
  'UI-BUTTON-BLOCK-DESTINATION',
  'UI-BUTTON-BLOCK-INSERTION',
  'UI-BUTTON-BLOCK-COMMANDS',
  'UI-BUTTON-RESPONSIVE',
]);

export function verifyUiButtons(report, currentSnapshot) {
  assert.equal(report.schema, 'akari-ui-buttons-v1');
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.snapshot, currentSnapshot);
  assert.equal(report.environment, 'chromium');
  assert.ok(typeof report.browser === 'string' && report.browser.length > 0);
  assert.equal(report.total, uiButtonIds.length);
  const ids = report.results.map(row => row.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate UI button test ID');
  assert.deepEqual([...ids].sort(), [...uiButtonIds].sort(), 'UI button coverage');
  for (const row of report.results) {
    assert.equal(row.status, 'PASS', row.id);
    assert.equal(row.pass, true, row.id);
    assert.ok(row.evidence && typeof row.evidence === 'object' && Object.keys(row.evidence).length, row.id);
  }
  assert.deepEqual(report.results.find(row=>row.id==='UI-BUTTON-PENDING').evidence.observationControls,[{id:'delayed-hidden',hidden:true},{id:'permanent-visible',rejected:true,timeoutMs:100},{id:'closed-page',rejected:true}],'bounded UI observation controls');
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.networkRequests, []);
  return true;
}

export function checkUiButtonValidatorNegatives() {
  const inputs = {productSha256:'a'.repeat(64), files:{[currentProductFile()]:'a'.repeat(64)}};
  const valid = () => ({schema:'akari-ui-buttons-v1', status:'PASS', snapshot:structuredClone(inputs),
    environment:'chromium', browser:'fixture-browser', total:uiButtonIds.length,
    results:uiButtonIds.map(id => ({id, status:'PASS', pass:true, evidence:id==='UI-BUTTON-PENDING'?{checked:true,observationControls:[{id:'delayed-hidden',hidden:true},{id:'permanent-visible',rejected:true,timeoutMs:100},{id:'closed-page',rejected:true}]}:{checked:true}})),
    pageErrors:[], networkRequests:[]});
  verifyUiButtons(valid(), inputs);
  for (const mutate of [
    r => r.results.pop(),
    r => r.results[1].id = r.results[0].id,
    r => r.results[0].status = 'SKIP',
    r => r.results[0].pass = false,
    r => r.results[0].evidence = {},
    r => r.snapshot.productSha256 = 'b'.repeat(64),
    r => r.environment = 'node',
    r => r.browser = '',
    r => r.pageErrors.push('page error'),
    r => r.networkRequests.push('https://example.invalid'),
    r => delete r.results.find(x=>x.id==='UI-BUTTON-PENDING').evidence.observationControls,
    r => r.results.find(x=>x.id==='UI-BUTTON-PENDING').evidence.observationControls[0].hidden=false,
    r => r.results.find(x=>x.id==='UI-BUTTON-PENDING').evidence.observationControls[1].rejected=false,
    r => r.results.find(x=>x.id==='UI-BUTTON-PENDING').evidence.observationControls[2].rejected=false,
    r => r.results.find(x=>x.id==='UI-BUTTON-PENDING').evidence.observationControls.push({id:'extra',rejected:true}),
    r => r.results.find(x=>x.id==='UI-BUTTON-PENDING').evidence.observationControls[1].timeoutMs=30000,
  ]) {
    const report = valid();
    mutate(report);
    assert.throws(() => verifyUiButtons(report, inputs));
  }
  return true;
}
