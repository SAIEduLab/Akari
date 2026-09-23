import fs from 'node:fs';
import assert from 'node:assert/strict';
import {verifySurfaceResults} from '../lib/verify-surface-results.mjs';
let count=0;
for(const [i,kind] of ['editor','gui'].entries()){
  const report=JSON.parse(fs.readFileSync(process.argv[i+2]));
  verifySurfaceResults(report,kind,report.snapshot,'chromium');
  for(const mutate of [r=>r.results.pop(),r=>r.results.push(r.results[0]),r=>r.results[0].id='invented',
    r=>r.results[0].status='SKIP',r=>r.results[0].pass=false,r=>r.total--,r=>r.status='FAIL',
    r=>r.snapshot.head='other',r=>r.snapshot.productSha256='other',r=>r.environment='node',r=>delete r.browser]){
    const bad=structuredClone(report);mutate(bad);assert.throws(()=>verifySurfaceResults(bad,kind,report.snapshot,'chromium'));count++;
  }
}
console.log('Surface validator: '+count+' invalid reports rejected');
