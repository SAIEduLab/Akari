import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {COPYRIGHT,verifyLicenseBrowserReport,licensingSnapshot} from '../lib/license-contract.cjs';
const [file]=process.argv.slice(2);assert.ok(file);
const report=JSON.parse(fs.readFileSync(file)),directory=path.resolve(file.replace(/\.json$/,'.artifacts'));
verifyLicenseBrowserReport(report,directory,licensingSnapshot());
for(const mutate of [r=>r.results.pop(),r=>r.results[0].copyright='2026 WRONG',r=>r.results[0].player.sha256='0'.repeat(64),r=>r.results[0].nativeDownload=false,r=>r.networkRequests.push('https://wrong.invalid'),r=>r.snapshot.productSha256='0'.repeat(64)]){
  const bad=structuredClone(report);mutate(bad);assert.throws(()=>verifyLicenseBrowserReport(bad,directory));
}
console.log('MIT browser report and 6 rejection cases: PASS ('+COPYRIGHT+')');
