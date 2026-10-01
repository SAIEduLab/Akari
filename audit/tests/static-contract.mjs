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
// One approved, byte-pinned independent oracle is public. Other historical
// fixture paths and private/checkpoint records retain the existing prohibition.
const approvedBaselinePath='audit/fixtures/1.0.2-baseline-capabilities.json';
const publicationPathAllowed=file=>!/(AGENTS|PROJECT_INSTRUCTIONS|PUBLIC_SYNC|historical|checkpoint|records\/)/.test(file)&&
  (!/fixtures\/(?:0\.|1\.)/.test(file)||file===approvedBaselinePath);
for(const bad of ['audit/fixtures/1.0.1.json','audit/fixtures/0.9.9.json','audit/fixtures/1.0.2-other.json','audit/checkpoint/report.json','PROJECT_INSTRUCTIONS.md'])assert.equal(publicationPathAllowed(bad),false,bad);
for(const file of files){assert.ok(!path.isAbsolute(file)&&!file.split('/').includes('..'));assert.ok(fs.existsSync(file),file);assert.ok(publicationPathAllowed(file),file);if(file===approvedBaselinePath)assert.equal(sha(fs.readFileSync(file)),'35c7dabee4066a17fdd43fefe3c8f34ac30e4059087b0a46579574f2cda536f5','approved independent oracle bytes');if(file.startsWith('audit/suites/run'))functionalId(path.basename(file,'.js'),'suite file');}
const archivedSourceRoot='audit/fixtures/legacy-1.0.1/';
const archivedSourcePins=new Map(Object.entries({
  "audit/fixtures/legacy-1.0.1/audit/browser/cases/ui-routes.cjs": "1d0d53217d304de9e96fc1e3f58d6981c84ae1f982ef64a3d767534809ce79e3",
  "audit/fixtures/legacy-1.0.1/audit/browser/cases/persistence-probe.cjs": "842e09b8f3784a100235c6074986079f6ac9cf562fd6ddf0c59e1f3ae2190cab",
  "audit/fixtures/legacy-1.0.1/audit/browser/cases/media-fixtures.cjs": "6147cb729d3496b5e08dc54f9cb722578e8da48ad3e6903dcdc930460e7b6752",
  "audit/fixtures/legacy-1.0.1/audit/browser/cases/audit-lib.cjs": "38c7146a36a93ad8b85353505b8bfb8d54a2e2d66fd2498253db00955d56b9ba",
  "audit/fixtures/legacy-1.0.1/audit/browser/cases/native-focus.cjs": "40b82437c0edf5471c26dfd3c5d36bbf9797d1706525f860b3bac122e4f62f10"
}));
const legacyMigration=JSON.parse(fs.readFileSync('audit/fixtures/language-v2-test-migration.json'));
assert.equal(sha(JSON.stringify(legacyMigration.sourcePins)),JSON.parse(fs.readFileSync(approvedBaselinePath)).migrationAuthority.sourcePinsSha256,'immutable legacy source pin set');
const addArchivedPin=(file,hash)=>{assert.match(hash,/^[a-f0-9]{64}$/);if(archivedSourcePins.has(file))assert.equal(archivedSourcePins.get(file),hash,'conflicting archive pin: '+file);archivedSourcePins.set(file,hash);};
for(const pin of legacyMigration.sourcePins)addArchivedPin(archivedSourceRoot+pin.path,pin.sha256);
const registerArchivePins=value=>{
  if(Array.isArray(value)){for(const child of value)registerArchivePins(child);return;}
  if(!value||typeof value!=='object')return;
  if(value.preservedSourcePath?.startsWith(archivedSourceRoot)&&value.originalSha256)
    addArchivedPin(value.preservedSourcePath,value.originalSha256);
  if(value.path?.startsWith(archivedSourceRoot)&&value.sha256)
    addArchivedPin(value.path,value.sha256);
  for(const child of Object.values(value))registerArchivePins(child);
};
for(const ledger of ['editor-v2-input-migration.json','runtime-v2-input-migration.json','format-v2-input-migration.json','other-suites-v2-input-migration.json','browser-v2-input-migration.json','gate-ui-v2-input-migration.json','language-surface-v2-migration.json','product-manifest-v2-input-migration.json'])
  registerArchivePins(JSON.parse(fs.readFileSync('audit/fixtures/'+ledger)));
const isArchivedSourceData=file=>file.startsWith(archivedSourceRoot);
const executableAuditFiles=files.filter(p=>/\.(mjs|cjs|js)$/.test(p)&&!isArchivedSourceData(p));
for(const file of files.filter(p=>/\.(mjs|cjs|js)$/.test(p)&&isArchivedSourceData(p))){
  assert.ok(archivedSourcePins.has(file),'unregistered archived source: '+file);
  assert.equal(sha(fs.readFileSync(file)),archivedSourcePins.get(file),'immutable archived source: '+file);
}
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
