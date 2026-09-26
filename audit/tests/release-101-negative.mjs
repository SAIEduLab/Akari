import {release102Runtime} from '../lib/release-102-contract.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {release101Assertions,verifyEditorAssets} from '../lib/release-101-contract.mjs';
import {verifyCompletedRuntime} from '../lib/completed-runtime-contract.mjs';
const baseline = "runtime() { appVersion: '1.0.1'; runtimeVersion: '1.0.0'; const audio = ['audio/mpeg', 'audio/wav']; return 42; }";
const current = release102Runtime(baseline);
verifyCompletedRuntime(current, baseline);
for (const changed of [current.replace('42','41'), current.replace("runtimeVersion: '1.0.0'", "runtimeVersion: '1.0.1'"), baseline.replace("appVersion: '1.0.1'","appVersion: '1.0.0'")])
  assert.throws(() => verifyCompletedRuntime(changed, baseline));
assert.throws(() => release101Assertions('audit/suites/runAkariSelfTests.js', 'no version expectation'));
assert.equal(release101Assertions('unchanged.js',baseline),baseline);
const report = JSON.parse(fs.readFileSync(process.argv[2]));
verifyEditorAssets(report, report.snapshot);
const inputs = structuredClone(report.snapshot);
let rejected = 0;
for (const mutate of [r=>r.results.pop(),r=>r.results.push(r.results[0]),r=>r.results[0].pass=false,
  r=>r.results[0].id='invented',r=>r.status='FAIL',r=>r.environment='node',r=>r.browser='',
  r=>r.snapshot.head='stale',r=>r.pageErrors.push('error'),r=>r.networkRequests.push('https://example.test')]) {
  const bad = structuredClone(report); mutate(bad);
  assert.throws(() => verifyEditorAssets(bad, inputs)); rejected++;
}
console.log('1.0.1 metadata/runtime constraints and '+rejected+' invalid feature reports rejected');
