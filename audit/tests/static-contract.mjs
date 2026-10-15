import {samplesFeature,sampleTestIds} from '../lib/samples-contract.mjs';
import { currentProductFile, currentProductVersion, assertProductInventory, validateProductMetadata } from "./../lib/product-path.cjs";
import {blockFieldIds,checkBlockFieldValidatorNegatives} from '../lib/block-field-contract.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {verifyAuthority} from '../lib/verify-test-results.mjs';
import {expectedLanguageIds} from '../lib/verify-language-results.mjs';
import {assertReleasePolicy} from '../lib/release-policy.mjs';
import {formatCompatibilityIds} from '../lib/format-compatibility-contract.mjs';
import {uiButtonIds,checkUiButtonValidatorNegatives} from '../lib/ui-buttons-contract.mjs';
import {componentControlsFeature,componentControlIds} from '../lib/component-controls-contract.mjs';
const metadata=assertProductInventory();
for(const bad of [{productFile:"../Akari_1_0_1.html"},{productVersion:"invalid"},{productFile:"Akari_1_0_0.html"},{productFile:metadata.productFile.replace('Akari_','Akari')},{files:metadata.files.filter(f=>f!==metadata.productFile)},{files:[...metadata.files,metadata.productFile]},{files:[...metadata.files,"Akari.html"]},{files:[...metadata.files,"Akari1_0_0.html"]},{files:[...metadata.files,"Akari_1_0_0.html"]},{files:[...metadata.files,metadata.productFile.replace('Akari_','Akari')]}])assert.throws(()=>validateProductMetadata({...metadata,...bad}));
const nextProductVersion=metadata.productVersion.replace(/\d+$/,patch=>String(Number(patch)+1));
const nextProductFile='Akari_'+nextProductVersion.replaceAll('.','_')+'.html';
validateProductMetadata({...metadata,productVersion:nextProductVersion,productFile:nextProductFile,files:metadata.files.map(file=>file===metadata.productFile?nextProductFile:file)});
const sampleManifest=JSON.parse(fs.readFileSync('audit/manifests/samples.json'));
assert.deepEqual(sampleManifest.feature,samplesFeature);assert.deepEqual(sampleManifest.testIds,sampleTestIds);
const html=fs.readFileSync(currentProductFile(),'utf8');new vm.Script(html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')));
const api=loadApi(html),features=JSON.parse(fs.readFileSync('audit/manifests/features.json'));
assert.deepEqual(features.uiContracts.editableSamples,samplesFeature);
assert.deepEqual(features.uiContracts.componentControls,componentControlsFeature,'fixed component action capability and audit matrix');
const componentTraceability=JSON.parse(fs.readFileSync('audit/manifests/component-controls-traceability.json'));
assert.equal(componentTraceability.schema,'akari-ui-capability-traceability-v1');
const componentTrace=componentTraceability.uiContracts.find(row=>row.id===componentControlsFeature.id);
assert.deepEqual(componentTrace.featureReference,{path:'audit/manifests/features.json',pointer:'/uiContracts/componentControls'});
assert.deepEqual(componentTrace.testReferences,componentControlIds.map(id=>({path:'audit/tests/component-controls-browser.mjs',id})));
assert.equal(componentTrace.verifier,'audit/tests/component-controls-verify.mjs');
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
functionalId(componentControlsFeature.id,'component action capability');
for(const id of componentControlIds)functionalId(id,'component action test');
checkUiButtonValidatorNegatives();
for(const id of blockFieldIds)functionalId(id,"block field test");checkBlockFieldValidatorNegatives();
const audit=fs.readFileSync('AUDIT.md','utf8'),capabilities=audit.split(/\r?\n/).filter(l=>/^\| [a-z]+:/.test(l));
assert.equal(capabilities.length,260);
for(const row of capabilities)functionalId(row.split('|')[1].trim(),'capability');
const files=JSON.parse(fs.readFileSync('audit/public-files.json')).files;
assert.equal(new Set(files).size,files.length);assert.ok(files.includes(currentProductFile())&&files.includes('LANGUAGE.md')&&files.includes('AUDIT.md'));
const publicationPathAllowed=file=>!/(AGENTS|PROJECT_INSTRUCTIONS|PUBLIC_SYNC|historical|checkpoint|records\/)/.test(file);
for(const file of files){assert.ok(!path.isAbsolute(file)&&!file.split('/').includes('..'));assert.ok(fs.existsSync(file),file);assert.ok(publicationPathAllowed(file),file);if(file.startsWith('audit/suites/run'))functionalId(path.basename(file,'.js'),'suite file');}
const executableAuditFiles=files.filter(p=>/\.(mjs|cjs|js)$/.test(p));
for(const file of executableAuditFiles){
  const source=fs.readFileSync(file,'utf8');
  for(const m of source.matchAll(/(?:from\s*|require\(\s*|import\s*)['"](\.[^'"]+)['"]/g)){
    const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1]));
    assert.ok(files.includes(target)||files.includes(target+'.js'),file+' imports unpublished '+target);
  }
}
assertReleasePolicy(html,executableAuditFiles.filter(p=>p.startsWith('audit/')).map(file=>({file,source:fs.readFileSync(file,'utf8')})));
assert.ok(!/run[A-Za-z0-9]*Tests/.test(html),'tests embedded in product');
const report={status:'PASS',snapshot:snapshot(currentProductFile()),capabilities:260,files:files.length};
fs.writeFileSync(process.argv[2]||'audit-evidence/static.json',JSON.stringify(report,null,2)+'\n');console.log('Static publication contract: PASS');
