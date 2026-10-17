import fs from 'node:fs';
import assert from 'node:assert/strict';
import {verifyLanguageResults} from '../lib/verify-language-results.mjs';
assert.ok(process.argv[2],'usage: node audit/tests/language-harness-negative.mjs <language-result.json>');
const report=JSON.parse(fs.readFileSync(process.argv[2]));
const manifest=JSON.parse(fs.readFileSync('audit/manifests/language-form-coverage.json'));
verifyLanguageResults(report,manifest,report.snapshot);
const mutations=[
  r=>r.results.pop(),r=>r.results.push(r.results[0]),r=>r.results[0].id='extra',
  r=>r.results[0].status='FAIL',r=>r.results[0].status='SKIP',r=>r.total--,
  r=>r.failed++,r=>r.status='FAIL',r=>r.browserLanguageComplete=!r.browserLanguageComplete,
  r=>r.environment='',r=>r.snapshot.head='other',r=>r.snapshot.productSha256='other',
];
for(const mutate of mutations){const r=structuredClone(report);mutate(r);assert.throws(()=>verifyLanguageResults(r,manifest,report.snapshot));}
console.log('Language validator: '+mutations.length+' negative reports rejected');
