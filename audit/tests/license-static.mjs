import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {currentProductFile} from '../lib/product-path.cjs';
import {LICENSE_TEXT,COPYRIGHT,verifyLicenseText,verifyLicensedArtifact,licensingSnapshot,sha} from '../lib/license-contract.cjs';
const results=[];
function check(id,fn){fn();results.push({id,status:'PASS'});}
check('CANONICAL-MIT-SAIEL',()=>verifyLicenseText(fs.readFileSync('LICENSE','utf8')));
const product=fs.readFileSync(currentProductFile(),'utf8');
check('PRODUCT-MIT-FULL-TEXT',()=>verifyLicensedArtifact(product));
check('EXTENSION-MIT-SPDX',()=>{
  if(!product.includes('function configureAkariFoundation'))return;
  for(const name of ['foundation.js','profiles.js','types.d.ts','build.mjs','examples/offline.js','examples/profile.js','examples/connector.html']){
    const text=fs.readFileSync(path.join('extensions',name),'utf8');
    assert.ok(text.includes('SPDX-License-Identifier: MIT'));assert.ok(!text.includes('SPDX-License-Identifier: Apache-2.0'));
  }
});
check('CURRENT-DOCUMENTS-MIT',()=>{
  const language=fs.readFileSync('LANGUAGE.md','utf8'),readme=fs.readFileSync('README.md','utf8');
  assert.ok(language.includes('MIT License'));assert.ok(!language.includes('Apache License 2.0'));
  assert.ok(readme.includes('(LICENSE)'),'README routes to the canonical license');assert.ok(!readme.includes('Apache License 2.0'));
  const publicSurface=JSON.parse(fs.readFileSync('audit/public-files.json')).files.includes('index.html');if(publicSurface)assert.ok(readme.includes('MIT License'));
  assert.ok(fs.readFileSync('LANGUAGE.md','utf8').includes(COPYRIGHT));
});
check('COMPATIBILITY-TEST-ALIAS',()=>{const source=fs.readFileSync('audit/suites/runAkariSelfTests.js','utf8');assert.ok(source.includes('EXPORT Apache-2.0ライセンス保持'));assert.ok(source.includes('MIT'));});
for(const [kind,bad] of [['copyright',product.replace(COPYRIGHT,'Copyright (c) 2026 WRONG')],['permission',product.replace('The above copyright notice and this permission notice','Wrong permission notice')],['disclaimer',product.replace('THE SOFTWARE IS PROVIDED "AS IS"','Wrong disclaimer')],['spdx',product.replaceAll('SPDX-License-Identifier: MIT','SPDX-License-Identifier: Apache-2.0')]])
  check('REJECT-ARTIFACT-'+kind,()=>assert.throws(()=>verifyLicensedArtifact(bad)));
const report={schema:'akari-license-static-v1',status:'PASS',copyright:COPYRIGHT,snapshot:licensingSnapshot(),results};
const output=process.argv[2]||'audit-evidence/license-static.json';fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log('MIT licensing static and negative cases: '+results.length+' PASS');
