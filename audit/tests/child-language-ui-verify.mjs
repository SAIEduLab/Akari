import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
import {verifyChildLanguageUi,verifyChildLanguageUiNegatives} from '../lib/child-language-ui-contract.mjs';

const [input,output]=process.argv.slice(2);
assert.ok(input,'child-language browser report required');
if(output)assert.ok(!fs.existsSync(output),'fresh verifier report required');
const inputs=snapshot(currentProductFile()),report=JSON.parse(fs.readFileSync(input,'utf8'));
const checked=verifyChildLanguageUi(report,inputs,process.platform),base=path.dirname(path.resolve(input));
for(const artifact of report.artifacts) {
  assert.ok(!path.isAbsolute(artifact.path)&&!artifact.path.split(/[\\/]/).includes('..'),'artifact stays within report folder');
  const filename=path.resolve(base,artifact.path);
  assert.ok(filename.startsWith(base+path.sep),'resolved artifact path must stay in report folder');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'),artifact.sha256,'artifact hash matches observed report');
}
const negatives=verifyChildLanguageUiNegatives(report,inputs,process.platform);
const proof={schema:'akari-child-language-ui-verification-v1',...checked,snapshot:inputs,
  artifacts:report.artifacts.length,negatives,negativeTotal:negatives.length};
if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(proof,null,2)+'\n');}
console.log(JSON.stringify({status:proof.status,total:proof.total,negativeTotal:proof.negativeTotal,artifacts:proof.artifacts}));
