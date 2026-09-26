import assert from 'node:assert/strict';
// Completed 1.0.2 is the immutable expectation, including the five audio MIME types.
export function verifyCompletedRuntime(candidate,baseline){
  assert.equal(candidate.replace(/\r\n/g,'\n'),baseline.replace(/\r\n/g,'\n'),'runtime differs from completed 1.0.2');
}
