import fs from 'node:fs';
import assert from 'node:assert/strict';
import {verifyInsertionContextReport} from '../lib/insertion-context-contract.mjs';
const [reportPath]=process.argv.slice(2);
if(!reportPath)throw Error('Usage: ux-insertion-context-verify.mjs <report>');
const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
const count=verifyInsertionContextReport(report);
const mutations=[
  r=>{r.results.pop();},r=>{r.results.push(r.results[0]);},r=>{r.results[0].status='FAIL';},
  r=>{r.snapshot.productSha256='0'.repeat(64);},r=>{r.results[0].observed.after.source='「違う本文」と言う。';},
  r=>{r.results[3].observed.chosen.chosen[0].parentId='outside';},
  r=>{r.results[5].observed.after.shape[1].value='消えた値';},
  r=>{r.results[12].observed.composing.pending.composing=false;},
  r=>{r.results[14].observed.runs[1].words=['最後'];},
  r=>{r.execution.realIME=true;},
];
for(const mutate of mutations){const candidate=structuredClone(report);mutate(candidate);assert.throws(()=>verifyInsertionContextReport(candidate));}
console.log(JSON.stringify({status:'PASS',cases:count,rejections:mutations.length}));
