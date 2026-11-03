import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {COPYRIGHT,verifyLicenseBrowserReport,licensingSnapshot} from '../lib/license-contract.cjs';
import {caseRecorder,writeCaseReport} from '../lib/gate-case-contract.mjs';
const [file,output]=process.argv.slice(2);assert.ok(file&&output,'usage: license-verify.mjs <license-browser.json> <result.json>');
const report=JSON.parse(fs.readFileSync(file)),directory=path.resolve(file.replace(/\.json$/,'.artifacts'));
const {results,pass}=caseRecorder();
verifyLicenseBrowserReport(report,directory,licensingSnapshot());pass('valid-report-accepted');
for(const [id,mutate] of [['missing-result',r=>r.results.pop()],['wrong-copyright',r=>r.results[0].copyright='2026 WRONG'],['changed-player-hash',r=>r.results[0].player.sha256='0'.repeat(64)],
  ['native-download-disabled',r=>r.results[0].nativeDownload=false],['network-request',r=>r.networkRequests.push('https://wrong.invalid')],['changed-snapshot',r=>r.snapshot.productSha256='0'.repeat(64)]]){
  const bad=structuredClone(report);mutate(bad);assert.throws(()=>verifyLicenseBrowserReport(bad,directory),id);pass(id);
}
writeCaseReport(output,'license-verify',results);
console.log('MIT browser report and '+(results.length-1)+' rejection cases: PASS ('+COPYRIGHT+')');
