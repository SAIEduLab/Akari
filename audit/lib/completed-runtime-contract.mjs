import assert from 'node:assert/strict';
import {currentNames} from './launch-identifiers.cjs';
// Runtime/language remain 1.0.0 and formats remain 3. Only the product's
// appVersion metadata advances. Compare all remaining runtime source exactly.
export function verifyCompletedRuntime(candidate, baseline) {
  const expected = currentNames(baseline);
  assert.equal(expected.split("appVersion: '1.0.0'").length, 2);
  assert.equal(candidate.replace(/\r\n/g,'\n'), expected.replace("appVersion: '1.0.0'", "appVersion: '1.0.1'"),
    'runtime differs from completed 1.0.0 beyond recorded identifiers and product appVersion');
}
