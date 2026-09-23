import assert from 'node:assert/strict';
import {currentNames} from './launch-identifiers.cjs';
// The completed release already defines version 1.0.0, format 3 and source diagnostics.
// Only the recorded implementation-name correspondence is applied to the frozen source.
export function verifyCompletedRuntime(candidate, baseline) {
  assert.equal(candidate.replace(/\r\n/g,'\n'), currentNames(baseline),
    'runtime differs from completed 1.0.0 beyond the recorded identifier correspondence');
}
