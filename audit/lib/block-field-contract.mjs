import assert from 'node:assert/strict';
import {checkBrowserVersion,fixtureEnvironment} from './browser-environment.mjs';
import {refusedAs} from './refusal.cjs';
export const blockFieldIds = Object.freeze([
  'FIELD-SHORT-JAPANESE', 'FIELD-MIXED-UNICODE', 'FIELD-EDIT-GROW-SHRINK',
  'FIELD-FONT-CHANGE', 'FIELD-ZOOM-BOUNDS', 'FIELD-LONG-EDIT', 'FIELD-CALLABLE', 'FIELD-CLIPPING-ORACLE',
]);
export function verifyBlockFields(report, inputs) {
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.snapshot, inputs);
  assert.ok(checkBrowserVersion(report.browser));
  assert.deepEqual(report.results.map(row => row.id), [...blockFieldIds]);
  for (const row of report.results) { assert.equal(row.pass, true, row.id); assert.ok(!row.error); }
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.networkRequests, []);
}
export function checkBlockFieldValidatorNegatives() {
  const inputs={productSha256:'fixture'}, valid={status:'PASS',snapshot:inputs,browser:fixtureEnvironment.browser,results:blockFieldIds.map(id=>({id,pass:true})),pageErrors:[],networkRequests:[]};
  verifyBlockFields(valid,inputs);
  for(const mutate of [
    r=>{r.status='FAIL';},r=>{r.snapshot.productSha256='wrong';},r=>{r.browser='';},r=>{r.browser='140.0.7339.207';},
    r=>{r.results.pop();},r=>{r.results.push({...r.results[0]});},r=>{r.results.reverse();},
    r=>{r.results[0].pass=false;},r=>{r.results[0].error='exception';},
    r=>{r.pageErrors.push('exception');},r=>{r.networkRequests.push('https://example.invalid');},
  ]) {const report=structuredClone(valid);mutate(report);assert.throws(()=>verifyBlockFields(report,inputs),refusedAs('block-field-contract#1'));}
}
