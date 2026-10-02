import assert from 'node:assert/strict';
import {browserEnvironment} from './browser-environment.mjs';

// Independent review findings are additions to the existing audit, never replacements.
export const reviewGroups = Object.freeze({
  actor: ['REVIEW-SELF-ACTOR-NESTED-ROUNDTRIP','REVIEW-SELF-ACTOR-ELSE-EDIT'],
  language: ['REVIEW-ESCAPED-TEXT-ROUNDTRIP','REVIEW-ESCAPED-MESSAGE-FILTER','REVIEW-KANA-SHOW','REVIEW-NATURAL-CONDITION-COMMA'],
  units: ['REVIEW-STATIC-UNIT-MISMATCH','REVIEW-INVALID-CODE-NO-SUCCESS-STATUS','REVIEW-STATIC-SCALE-RANGE'],
  'first-use': ['REVIEW-DEFAULTS-FIRST-RUN','REVIEW-QUANTITY-UNIT-SINGLE','REVIEW-CONDITION-SEARCH-SWITCH'],
  readable: ['REVIEW-STAGE-SPEECH-READABLE','REVIEW-LONG-TEXT-EDIT-VISIBLE'],
});

export function verifyReviewReport(report, group, inputs) {
  assert.ok(Object.hasOwn(reviewGroups,group),'unknown independent review group');
  assert.match(inputs.productSha256,/^[a-f0-9]{64}$/);
  assert.equal(report.schema,'akari-independent-review-v1');
  assert.equal(report.group,group);
  assert.equal(report.status,'PASS');
  assert.deepEqual(report.snapshot,inputs);
  assert.equal(report.browser,browserEnvironment.version);
  assert.deepEqual(report.pageErrors,[]);
  assert.deepEqual(report.networkRequests,[]);
  assert.deepEqual(report.results.map(row=>row.id),reviewGroups[group]);
  for(const row of report.results) {
    assert.equal(row.pass,true,row.id);
    assert.equal(row.error,undefined,row.id+' has a recorded error');
    assert.ok(row.evidence && typeof row.evidence==='object' && Object.keys(row.evidence).length>0,row.id+' missing evidence');
  }
  return {status:'PASS',group,total:report.results.length};
}

export const reviewMutations = Object.freeze({
  'missing-case': r=>r.results.pop(),
  'duplicate-case': r=>r.results[1]=r.results[0],
  'extra-case': r=>r.results.push({...r.results[0],id:'unexpected'}),
  'reordered-cases': r=>r.results.reverse(),
  'failed-case': r=>r.results[0].pass=false,
  'missing-pass': r=>delete r.results[0].pass,
  'recorded-error': r=>r.results[0].error='failure',
  'missing-evidence': r=>delete r.results[0].evidence,
  'empty-evidence': r=>r.results[0].evidence={},
  'empty-array-evidence': r=>r.results[0].evidence=[],
  'failed-status': r=>r.status='FAIL',
  'unverified-status': r=>r.status='UNVERIFIED',
  'wrong-schema': r=>r.schema='other',
  'wrong-group': r=>r.group='other',
  'missing-snapshot': r=>delete r.snapshot,
  'changed-product': r=>r.snapshot.productSha256='0'.repeat(64),
  'changed-audit-input': r=>r.snapshot.files['audit/lib/review-regression-contract.mjs']='0'.repeat(64),
  'missing-browser': r=>delete r.browser,
  'wrong-browser': r=>r.browser='0',
  'page-error': r=>r.pageErrors.push('uncaught'),
  'missing-page-errors': r=>delete r.pageErrors,
  'network-request': r=>r.networkRequests.push('https://example.invalid'),
  'missing-network-requests': r=>delete r.networkRequests,
});
export const reviewNegativeIds = Object.keys(reviewGroups).flatMap(group=>Object.keys(reviewMutations).map(id=>group+'/'+id));
reviewNegativeIds.push('gate/existing-ordered-prefix','gate/new-review-steps');
reviewNegativeIds.push('evidence/producer-path-unavailable','evidence/changed-candidate-bytes','evidence/missing-candidate-file','evidence/changed-recorded-url');

export function verifyReviewNegativeReport(report,inputs) {
  assert.equal(report.schema,'akari-independent-review-negative-v1');
  assert.equal(report.status,'PASS');
  assert.deepEqual(report.snapshot,inputs);
  assert.deepEqual(report.results.map(row=>row.id),reviewNegativeIds);
  for(const row of report.results)assert.equal(row.rejected,true,row.id);
  return {status:'PASS',rejections:report.results.length};
}
