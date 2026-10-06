// These synthetic fixtures test evidence rejection; they are not product execution evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {verifyIntentCandidate} from '../lib/japanese-gate-contract.mjs';
import {browserEnvironment} from '../lib/browser-environment.mjs';
import {gateSteps} from '../lib/gate-contract.mjs';
import {reviewGroups,reviewMutations,verifyReviewReport,verifyReviewNegativeReport} from '../lib/review-regression-contract.mjs';

const [output]=process.argv.slice(2);assert.ok(output,'output JSON required');
const inputs=snapshot(currentProductFile()),results=[];
for(const [group,ids] of Object.entries(reviewGroups)) {
  const control={schema:'akari-independent-review-v1',group,status:'PASS',snapshot:inputs,browser:browserEnvironment.version,pageErrors:[],networkRequests:[],results:ids.map(id=>({id,pass:true,evidence:{syntheticValidatorControl:true}}))};
  verifyReviewReport(control,group,inputs);
  for(const [id,mutate] of Object.entries(reviewMutations)) {
    const invalid=structuredClone(control);mutate(invalid);
    assert.throws(()=>verifyReviewReport(invalid,group,inputs),group+'/'+id);
    results.push({id:group+'/'+id,rejected:true});
  }
}
const legacyIds=['static','release-policy-negative','integrity','browser-environment','ci-regression','dom-regression','node-product','product','language-node','language-browser','editor-node','editor-browser-core','editor-gui','normal','ownership','ui-buttons','block-fields','format-compatibility','editor-assets','designer','manual','language-boundaries','harness-negative','language-negative','surface-negative','japanese-contract-static','language-migration-static','japanese-intent-browser','runtime-v2','japanese-gate-negative'];
const gateIds=gateSteps('',path.dirname(output)).map(step=>step[0]);
assert.deepEqual(gateIds.slice(0,legacyIds.length),legacyIds);
assert.throws(()=>assert.deepEqual(gateIds.slice(1,legacyIds.length+1),legacyIds));
results.push({id:'gate/existing-ordered-prefix',rejected:true});
const newIds=[...Object.keys(reviewGroups).map(group=>'review-'+group),'review-harness-negative'];
assert.deepEqual(gateIds.slice(legacyIds.length,legacyIds.length+newIds.length),newIds);
assert.throws(()=>assert.deepEqual(gateIds.slice(legacyIds.length+1,legacyIds.length+newIds.length+1),newIds));
results.push({id:'gate/new-review-steps',rejected:true});
const addedSteps=['extension-foundation','extension-foundation-negative','license-static','license-browser'];
assert.deepEqual(gateIds.slice(legacyIds.length+newIds.length),addedSteps);
assert.throws(()=>assert.deepEqual(gateIds.slice(legacyIds.length+newIds.length,-1),addedSteps));
results.push({id:'gate/extension-foundation-steps',rejected:true});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'akari-relocated-evidence-'));
try {
  const producer=path.join(temporary,'producer','candidate.html'),downloaded=path.join(temporary,'downloaded','candidate.html');
  fs.mkdirSync(path.dirname(producer));fs.mkdirSync(path.dirname(downloaded));
  const bytes=fs.readFileSync(currentProductFile());fs.writeFileSync(producer,bytes);fs.writeFileSync(downloaded,bytes);
  const report={candidate:{testedFile:producer,url:pathToFileURL(producer).href,sha256:sha(bytes)},environment:{protocol:'file:'}};
  verifyIntentCandidate(report,inputs);fs.rmSync(path.dirname(producer),{recursive:true});
  assert.throws(()=>verifyIntentCandidate(report,inputs),/ENOENT/);
  verifyIntentCandidate(report,inputs,downloaded);
  results.push({id:'evidence/producer-path-unavailable',rejected:true});
  fs.appendFileSync(downloaded,'\n<!-- changed after sealing -->');
  assert.throws(()=>verifyIntentCandidate(report,inputs,downloaded));
  results.push({id:'evidence/changed-candidate-bytes',rejected:true});
  fs.rmSync(downloaded);assert.throws(()=>verifyIntentCandidate(report,inputs,downloaded),/ENOENT/);
  results.push({id:'evidence/missing-candidate-file',rejected:true});
  fs.writeFileSync(downloaded,bytes);report.candidate.url=pathToFileURL(downloaded).href;
  assert.throws(()=>verifyIntentCandidate(report,inputs,downloaded));
  results.push({id:'evidence/changed-recorded-url',rejected:true});
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
const report={schema:'akari-independent-review-negative-v1',status:'PASS',snapshot:inputs,results};
verifyReviewNegativeReport(report,inputs);
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'PASS',rejections:results.length,output}));
