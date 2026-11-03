import fs from 'node:fs';
import assert from 'node:assert/strict';
import {verifySurfaceResults} from '../lib/verify-surface-results.mjs';
import {caseRecorder,writeCaseReport} from '../lib/gate-case-contract.mjs';
const [editorPath,guiPath,output]=process.argv.slice(2);assert.ok(editorPath&&guiPath&&output,'usage: surface-negative.mjs <editor.json> <gui.json> <result.json>');
const {results,pass}=caseRecorder();
for(const [kind,file] of [['editor',editorPath],['gui',guiPath]]){
  const report=JSON.parse(fs.readFileSync(file));
  verifySurfaceResults(report,kind,report.snapshot,'chromium');pass(kind+'/valid-report-accepted');
  for(const [id,mutate] of [['missing-result',r=>r.results.pop()],['duplicate-result',r=>r.results.push(r.results[0])],['unknown-id',r=>r.results[0].id='invented'],
    ['skipped-status',r=>r.results[0].status='SKIP'],['false-pass',r=>r.results[0].pass=false],['total-changed',r=>r.total--],['failed-status',r=>r.status='FAIL'],
    ['snapshot-field-added',r=>r.snapshot.head='other'],['changed-product-hash',r=>r.snapshot.productSha256='other'],['wrong-environment',r=>r.environment='node'],['missing-browser',r=>delete r.browser]]){
    const bad=structuredClone(report);mutate(bad);assert.throws(()=>verifySurfaceResults(bad,kind,report.snapshot,'chromium'),kind+'/'+id);pass(kind+'/'+id);
  }
}
writeCaseReport(output,'surface-negative',results);
console.log('Surface validator: '+results.length+' cases PASS');
