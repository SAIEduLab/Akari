import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {verifyChildDiagnosticsReport} from '../lib/child-diagnostics-contract.mjs';
const [input,out]=process.argv.slice(2),output=path.resolve(out||input+'.negative.json'),
  positive=JSON.parse(fs.readFileSync(input,'utf8')),inputs=snapshot(currentProductFile());
verifyChildDiagnosticsReport(positive,inputs);
const results=[];
for(const [id,mutate]of [
  ['missing',r=>r.results.pop()],['duplicate',r=>r.results[0]=structuredClone(r.results[1])],
  ['false-pass',r=>r.results[0].status='FAIL'],['absent-observation',r=>delete r.results[0].observed],
  ['wrong-snapshot',r=>r.snapshot.productSha256='0'.repeat(64)],
  ['raw-code-lost',r=>r.results[0].observed.detail='もとの説明'],
  ['raw-message-lost',r=>r.results[0].observed.parser.negative[0].message='書き方を変えてください'],
  ['refused-form-accepted',r=>r.results[0].observed.parser.negative=[]],
  ['fix-refused',r=>r.results[0].observed.parser.positive=[{code:'P201'}]],
  ['work-changed',r=>r.results[0].observed.after.project='{}'],
  ['runtime-id-exposed',r=>r.results.find(x=>x.id==='runtime/list-reference').observed.primary+=' script:sprite-1'],
  ['save-success-misreported',r=>r.results.find(x=>x.id==='save/orphan-fault').observed.downloads=['work.akari.md']],
  ['lost-import-preview',r=>r.results.find(x=>x.id==='import/current-and-incoming').observed.preview='今の動き'],
  ['unreachable-touch',r=>r.results.find(x=>x.id==='reach/touch-390').observed.geometry.hit=false],
  ['timeout-relaxed',r=>r.limits.perCaseMs=10000],
  ['browser-changed',r=>r.environment.browser='140.0.0.0'],
  ['unknown-case',r=>r.results[0].id='syntax/unknown'],
]){const altered=structuredClone(positive);mutate(altered);assert.throws(()=>verifyChildDiagnosticsReport(altered,inputs),id);results.push({id,status:'PASS',result:'REJECTED'});}
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify({schema:'akari-child-diagnostics-validator-negative-v1',status:'PASS',snapshot:inputs,required:17,results},null,2)+'\n');
console.log('Child diagnostics validator negative: 17 refused PASS');
