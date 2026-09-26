import fs from 'node:fs';
import assert from 'node:assert/strict';
import {snapshot,sha} from './lib/product-test-host.mjs';
const target='audit/records/phase4-reviewed-inputs.json';
const files=Object.fromEntries(Object.keys(snapshot('Akari.html').files).filter(p=>p!==target).map(p=>
  [p,sha(/\.(?:mp3|wav|m4a|flac|ogg|opus|aac)$/.test(p)?fs.readFileSync(p):fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'))]));
if(process.argv.includes('--record')){
  fs.writeFileSync(target,JSON.stringify({schema:'akari-source-review-binding-v1',encoding:'Audio fixtures: exact binary bytes; text: UTF-8, CRLF normalized to LF',
    review:'audit/records/phase4-semantic-review.md',inventory:'audit/records/phase4-audit-inventory.json',
    scope:'Source and contract review only; actual committed HEAD and machine results belong to execution evidence. Re-record only after impact review.',files},null,2)+'\n');
}else{
  const record=JSON.parse(fs.readFileSync(target));
  assert.equal(record.schema,'akari-source-review-binding-v1');
  assert.deepEqual(record.files,files,'reviewed inputs changed: impact review and renewed binding required');
}
console.log('Reviewed input binding: PASS ('+Object.keys(files).length+' files)');
