import {release102Runtime} from './release-102-contract.mjs';
import assert from 'node:assert/strict';
// The verified 1.0.1 checkpoint already includes the authorized product metadata.
// Runtime/language remain 1.0.0; only current appVersion and audio MIME additions
// are mapped in the immutable expectation. All other source stays exact.
export function verifyCompletedRuntime(candidate,baseline){
  assert.equal(candidate.replace(/\r\n/g,'\n'),release102Runtime(baseline.replace(/\r\n/g,'\n')),
    'runtime differs from the immutable verified 1.0.1 checkpoint');
}
