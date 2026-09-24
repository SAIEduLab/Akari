import assert from 'node:assert/strict';
// The verified 1.0.1 checkpoint already includes the authorized product metadata.
// Runtime and language remain 1.0.0; no source rewrite is needed for comparison.
export function verifyCompletedRuntime(candidate,baseline){
  assert.equal(candidate.replace(/\r\n/g,'\n'),baseline.replace(/\r\n/g,'\n'),
    'runtime differs from the immutable verified 1.0.1 checkpoint');
}
