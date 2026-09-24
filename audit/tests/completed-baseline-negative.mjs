import fs from 'node:fs';
import assert from 'node:assert/strict';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {gateSteps} from '../lib/gate-contract.mjs';
import {completedCommit,completedFixture,completedProduct,completedManifestSha256,completedManifest,verifyFixedCore,verifyCompletedProvenance} from '../lib/completed-baseline.mjs';
const m=completedManifest();verifyCompletedProvenance();
assert.ok(gateSteps('browser','output').some(s=>s[0]==='fixed101'&&s[1]==='audit/run-fixed-baseline.mjs'));
assert.ok(gateSteps('browser','output').some(s=>s[0]==='fixed08'&&s[1]==='audit/run-headless-selftest.mjs'));
const report=JSON.parse(fs.readFileSync(completedFixture+'/evidence/akari-selftest-evidence-36017186869-1/current-selftest.json'));
Object.assign(report,{schema:'akari-fixed-release-report-v1',snapshot:snapshot('Akari.html'),sourceCommit:completedCommit,manifestSha256:completedManifestSha256,canonicalProductSha256:m.productSha256,executedProductSha256:sha(fs.readFileSync(completedProduct))});
verifyFixedCore(report,report.snapshot);
const mutations=[r=>r.results.pop(),r=>r.results.push(r.results[0]),r=>r.results[0].pass=false,r=>r.results[0].status='SKIP',
 r=>r.suites.pop(),r=>r.suites.push(r.suites[0]),r=>r.suites[0].results.pop(),r=>r.suites[0].results[0].id='candidate-invented',
 r=>r.suites[0].results[0].pass=false,r=>r.suites[0].results[0].detail='FAIL',r=>r.suites[0].environment='node',
 r=>r.status='FAIL',r=>r.environment='node',r=>delete r.browser,r=>r.total--,r=>r.passed--,r=>r.failed++,
 r=>r.sourceCommit='main',r=>r.manifestSha256='new-candidate',r=>r.canonicalProductSha256='candidate',r=>r.executedProductSha256='different',
 r=>r.snapshot.head='old',r=>delete r.snapshot.files['AUDIT.md']];
for(const mutate of mutations){const bad=structuredClone(report);mutate(bad);assert.throws(()=>verifyFixedCore(bad,report.snapshot));}
console.log('Completed baseline: exact Git/artifact provenance PASS; '+mutations.length+' invalid fixed reports rejected');
