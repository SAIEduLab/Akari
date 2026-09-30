import assert from 'node:assert/strict';
export const blockFieldIds = Object.freeze([
  'FIELD-SHORT-JAPANESE', 'FIELD-MIXED-UNICODE', 'FIELD-EDIT-GROW-SHRINK',
  'FIELD-FONT-CHANGE', 'FIELD-ZOOM-BOUNDS', 'FIELD-LONG-EDIT', 'FIELD-CALLABLE', 'FIELD-CLIPPING-ORACLE',
]);
export function verifyBlockFields(report, inputs) {
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.snapshot, inputs);
  assert.ok(typeof report.browser === 'string' && report.browser.length > 0);
  assert.deepEqual(report.results.map(row => row.id), [...blockFieldIds]);
  for (const row of report.results) { assert.equal(row.pass, true, row.id); assert.ok(!row.error); }
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.networkRequests, []);
}
export function checkBlockFieldValidatorNegatives() {
  const inputs={productSha256:'fixture'}, valid={status:'PASS',snapshot:inputs,browser:'fixture',results:blockFieldIds.map(id=>({id,pass:true})),pageErrors:[],networkRequests:[]};
  verifyBlockFields(valid,inputs);
  for(const mutate of [
    r=>{r.status='FAIL';},r=>{r.snapshot.productSha256='wrong';},r=>{r.browser='';},
    r=>{r.results.pop();},r=>{r.results.push({...r.results[0]});},r=>{r.results.reverse();},
    r=>{r.results[0].pass=false;},r=>{r.results[0].error='exception';},
    r=>{r.pageErrors.push('exception');},r=>{r.networkRequests.push('https://example.invalid');},
  ]) {const report=structuredClone(valid);mutate(report);assert.throws(()=>verifyBlockFields(report,inputs));}
}
