import fs from 'node:fs';
import assert from 'node:assert/strict';
import {verifyLanguageResults} from '../lib/verify-language-results.mjs';
import {caseRecorder,writeCaseReport} from '../lib/gate-case-contract.mjs';
const [reportPath,output]=process.argv.slice(2);assert.ok(reportPath&&output,'usage: language-harness-negative.mjs <language-report.json> <result.json>');
const report=JSON.parse(fs.readFileSync(reportPath));
const manifest=JSON.parse(fs.readFileSync('audit/manifests/language-form-coverage.json'));
const {results,pass}=caseRecorder();
verifyLanguageResults(report,manifest,report.snapshot);pass('valid-report-accepted');
const mutations=[
  ['missing-result',r=>r.results.pop()],['duplicate-result',r=>r.results.push(r.results[0])],['unknown-id',r=>r.results[0].id='extra'],
  ['failed-status',r=>r.results[0].status='FAIL'],['skipped-status',r=>r.results[0].status='SKIP'],['total-changed',r=>r.total--],
  ['failed-count',r=>r.failed++],['report-status-failed',r=>r.status='FAIL'],['completion-flag-flipped',r=>r.browserLanguageComplete=!r.browserLanguageComplete],
  ['missing-environment',r=>r.environment=''],['snapshot-field-added',r=>r.snapshot.head='other'],['changed-product-hash',r=>r.snapshot.productSha256='other'],
];
for(const [id,mutate] of mutations){const r=structuredClone(report);mutate(r);assert.throws(()=>verifyLanguageResults(r,manifest,report.snapshot),id);pass(id);}
writeCaseReport(output,'language-negative',results);
console.log('Language validator: '+mutations.length+' negative reports rejected');
