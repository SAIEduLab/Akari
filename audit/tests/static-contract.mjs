import { currentProductFile, currentProductVersion, assertProductInventory, validateProductMetadata } from "./../lib/product-path.cjs";
import {blockFieldIds,checkBlockFieldValidatorNegatives} from '../lib/block-field-contract.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import {snapshot} from '../lib/product-test-host.mjs';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {verifyAuthority} from '../lib/verify-test-results.mjs';
import {expectedLanguageIds} from '../lib/verify-language-results.mjs';
import {assertReleasePolicy} from '../lib/release-policy.mjs';
import {formatCompatibilityIds} from '../lib/format-compatibility-contract.mjs';
import {uiButtonIds,checkUiButtonValidatorNegatives} from '../lib/ui-buttons-contract.mjs';
const metadata=assertProductInventory();
for(const bad of [{productFile:"../Akari1_0_1.html"},{productVersion:"invalid"},{productFile:"Akari1_0_0.html"},{files:metadata.files.filter(f=>f!==metadata.productFile)},{files:[...metadata.files,metadata.productFile]},{files:[...metadata.files,"Akari.html"]},{files:[...metadata.files,"Akari1_0_0.html"]}])assert.throws(()=>validateProductMetadata({...metadata,...bad}));
const html=fs.readFileSync(currentProductFile(),'utf8');new vm.Script(html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')));
const api=loadApi(html),features=JSON.parse(fs.readFileSync('audit/manifests/features.json'));
for(const key of ['COMMAND_CATALOG','LIMITS','EXECUTABLE_CONTRACT'])assert.deepEqual(JSON.parse(JSON.stringify(api[key])),features[key],key);
assert.equal(api.PRODUCT_RELEASE,features.productVersion);assert.equal(api.PRODUCT_RELEASE,currentProductVersion());
for(const file of ["audit/manifests/language-form-coverage.json","audit/browser/browser-audit-manifest.json"])assert.equal(JSON.parse(fs.readFileSync(file)).productVersion,currentProductVersion(),file);
assert.deepEqual([...api.BLOCK_SCHEMAS.map(s=>s.id)],features.schemaIds);
const productTests=JSON.parse(fs.readFileSync('audit/manifests/product-tests.json'));
verifyAuthority(productTests);
const numberedStage=/^(?:[A-Z]{1,12}\d{2,3}-|\d{2,3} [A-Za-z]|run[A-Za-z]+\d{2,3}Tests$)|(?:^|[-_:])(?:v|version|release)[-_]?\d{1,4}(?:$|[-_:])/i;
const functionalId=(id,kind)=>{assert.ok(typeof id==='string'&&id.length>0,kind+' missing');assert.doesNotMatch(id,numberedStage,kind+' uses a version-derived name: '+id);};
for(const sample of ['FEATURE42-CASE','42 sample','runFuture42Tests','RELEASE-V103','FORMAT-V001'])assert.throws(()=>functionalId(sample,'negative example'));
for(const suite of productTests.suites){functionalId(suite.name,'suite');for(const id of suite.ids)functionalId(id,'product test');}
const browserTests=JSON.parse(fs.readFileSync('audit/manifests/browser-results.json'));
for(const entry of browserTests.entries){functionalId(entry.task,'browser task');for(const id of entry.keys)functionalId(id,'browser test');}
const languageTests=JSON.parse(fs.readFileSync('audit/manifests/language-form-coverage.json'));
for(const id of expectedLanguageIds(languageTests))functionalId(id,'language test');
for(const id of formatCompatibilityIds)functionalId(id,'format compatibility test');
for(const id of uiButtonIds)functionalId(id,'UI button test');
checkUiButtonValidatorNegatives();
for(const id of blockFieldIds)functionalId(id,"block field test");checkBlockFieldValidatorNegatives();
const audit=fs.readFileSync('AUDIT.md','utf8'),capabilities=audit.split(/\r?\n/).filter(l=>/^\| [a-z]+:/.test(l));
assert.equal(capabilities.length,260);
for(const row of capabilities)functionalId(row.split('|')[1].trim(),'capability');
const files=JSON.parse(fs.readFileSync('audit/public-files.json')).files;
assert.equal(new Set(files).size,files.length);assert.ok(files.includes(currentProductFile())&&files.includes('LANGUAGE.md')&&files.includes('AUDIT.md'));
for(const file of files){assert.ok(!path.isAbsolute(file)&&!file.split('/').includes('..'));assert.ok(fs.existsSync(file),file);assert.ok(!/(AGENTS|PROJECT_INSTRUCTIONS|PUBLIC_SYNC|fixtures\/(?:0\.|1\.)|historical|checkpoint|records\/)/.test(file),file);if(file.startsWith('audit/suites/run'))functionalId(path.basename(file,'.js'),'suite file');}
for(const file of files.filter(p=>/\.(mjs|cjs|js)$/.test(p))){
  const source=fs.readFileSync(file,'utf8');
  for(const m of source.matchAll(/(?:from\s*|require\(\s*|import\s*)['"](\.[^'"]+)['"]/g)){
    const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1]));
    assert.ok(files.includes(target)||files.includes(target+'.js'),file+' imports unpublished '+target);
  }
}
assertReleasePolicy(html,files.filter(p=>/^audit\/.*\.(mjs|cjs|js)$/.test(p)).map(file=>({file,source:fs.readFileSync(file,'utf8')})));
assert.ok(!/run[A-Za-z0-9]*Tests/.test(html),'tests embedded in product');
const report={status:'PASS',snapshot:snapshot(currentProductFile()),capabilities:260,files:files.length};
fs.writeFileSync(process.argv[2]||'audit-evidence/static.json',JSON.stringify(report,null,2)+'\n');console.log('Static publication contract: PASS');
