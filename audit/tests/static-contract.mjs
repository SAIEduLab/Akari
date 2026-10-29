import cp from 'node:child_process';
import {samplesFeature,sampleTestIds} from '../lib/samples-contract.mjs';
import { currentProductFile, currentProductVersion, currentLanguageFile, assertLanguageInventory, assertProductInventory, validateProductMetadata } from "./../lib/product-path.cjs";
import {blockFieldIds,checkBlockFieldValidatorNegatives} from '../lib/block-field-contract.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {verifyAuthority} from '../lib/verify-test-results.mjs';
import {expectedLanguageIds} from '../lib/verify-language-results.mjs';
import {assertReleasePolicy,functionalNameIssue,functionalNameIssues,fileNameSegments,auditRegistry,manifestFieldIssues} from '../lib/release-policy.mjs';
import {gateSteps,acceptanceCommands,acceptanceIds} from '../lib/gate-contract.mjs';
import {verifyShardPlan} from '../lib/shard-plan.cjs';
import {assertSingleBrowserOwner} from '../lib/verify-browser-results.mjs';
import {formatCompatibilityIds} from '../lib/format-compatibility-contract.mjs';
import {uiButtonIds,checkUiButtonValidatorNegatives} from '../lib/ui-buttons-contract.mjs';
import {componentControlsFeature,componentControlIds} from '../lib/component-controls-contract.mjs';
const metadata=assertProductInventory();assertLanguageInventory(metadata);
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
// Names of tests, steps, files and manifest fields describe a responsibility; every violation is listed together.
const nameIssues=[],functionalId=(id,kind)=>nameIssues.push(...functionalNameIssues(kind,[id]));
// Rejection controls for the name policy and its new name sets.
for(const sample of ['FEATURE42-CASE','42 sample','runFuture42Tests','RELEASE-V103','FORMAT-V001'])assert.match(functionalNameIssue(sample),/version-derived/,sample);
for(const sample of ['ux-repair-05','repair02','phase3-language','PHASE_3','dev-session2','ux-followup','follow-up-bundle','newContracts','new-contract','format1-storage','runtimeV2','runtime2-boundary','d961dd3-schemas'])assert.match(functionalNameIssue(sample)||'',/past-process/,sample);
for(const sample of ['FORMAT 2＋3×4','FORMAT-PROJECT-001','format-compatibility','runtime-boundary','list-repair-panel','release-1.2','.github','facade'])assert.equal(functionalNameIssue(sample),null,sample);
assert.deepEqual(functionalNameIssues('gate step',['static','runtime-v2','phase3-checks']),['gate step uses a version-derived name: runtime-v2','gate step uses a past-process name: phase3-checks']);
assert.deepEqual(['audit/tests/runtime-v2/node.cjs','audit/tests/phase3.akari.md','audit/tests/ok.mjs'].flatMap(file=>functionalNameIssues('audit file name',fileNameSegments(file))),['audit file name uses a version-derived name: runtime-v2','audit file name uses a past-process name: phase3.akari']);
assert.deepEqual(manifestFieldIssues('audit/manifests/example.json',{authority:'Reviewed for Akari 0.0.1.',newContracts:[{id:'A'}]},currentProductVersion()),['audit/manifests/example.json: release label in value Reviewed for Akari 0.0.1.','audit/manifests/example.json: past-process field newContracts']);
assert.deepEqual(manifestFieldIssues('audit/manifests/example.json',{productFile:currentProductFile(),label:'Akari '+currentProductVersion(),languageContracts:[]},currentProductVersion()),[]);
assert.ok(auditRegistry('audit/manifests/browser-results.json')&&auditRegistry('audit/public-files.json')&&!auditRegistry('audit/fixtures/capability-oracle.json'));
assert.throws(()=>assertSingleBrowserOwner([{task:'ui-interactions',keys:['UI-a','UI-b']},{task:'ui-routes',keys:['UI-b']}]),/UI-b is registered by ui-interactions and ui-routes/);
for(const [id] of gateSteps('',''))functionalId(id,'gate step');
for(const kind of Object.keys(acceptanceCommands))for(const id of acceptanceIds(kind))functionalId(id,'acceptance command');
for(const suite of productTests.suites){functionalId(suite.name,'suite');for(const id of suite.ids)functionalId(id,'product test');}
const browserTests=JSON.parse(fs.readFileSync('audit/manifests/browser-results.json'));
for(const entry of browserTests.entries){functionalId(entry.task,'browser task');for(const id of entry.keys)functionalId(id,'browser test');}
// A browser case runs once: two tasks never register the same case key.
assertSingleBrowserOwner(browserTests.entries);
// CI shards run every gate step, browser task and acceptance step exactly once, readers with their producers.
const browserTasks=Object.values(JSON.parse(fs.readFileSync('audit/browser/browser-audit-manifest.json')).groups).flat();
assert.deepEqual(verifyShardPlan({steps:gateSteps('',''),tasks:browserTasks,acceptance:Object.fromEntries(Object.keys(acceptanceCommands).map(k=>[k,{ids:acceptanceIds(k),commands:acceptanceCommands[k]}]))}),[],'CI shard plan');
const languageTests=JSON.parse(fs.readFileSync('audit/manifests/language-form-coverage.json'));
for(const id of expectedLanguageIds(languageTests))functionalId(id,'language test');
for(const id of formatCompatibilityIds)functionalId(id,'format compatibility test');
for(const id of uiButtonIds)functionalId(id,'UI button test');
functionalId(componentControlsFeature.id,'component action capability');
for(const id of componentControlIds)functionalId(id,'component action test');
checkUiButtonValidatorNegatives();
for(const id of blockFieldIds)functionalId(id,"block field test");checkBlockFieldValidatorNegatives();
// verifyAuthority above requires the documented rows to equal the independent capability set.
const audit=fs.readFileSync('AUDIT.md','utf8'),capabilities=audit.split(/\r?\n/).filter(l=>/^\| [a-z]+:/.test(l));
for(const row of capabilities)functionalId(row.split('|')[1].trim(),'capability');
const files=JSON.parse(fs.readFileSync('audit/public-files.json')).files;
assert.equal(new Set(files).size,files.length);assert.ok(files.includes(currentProductFile())&&files.includes(currentLanguageFile())&&files.includes('AUDIT.md'));
const repositoryIdentity=process.env.GITHUB_REPOSITORY||cp.execFileSync('git',['remote','get-url','origin'],{encoding:'utf8'}).trim().replace(/^.*github.com[:/]/,'').replace(/\.git$/,'');
const localInstructions=repositoryIdentity==='SAIEduLab/Akari-dev'?['AGENTS.md','PROJECT_INSTRUCTIONS.md','PUBLIC_SYNC.json']:['AGENTS.md'];
const publicationPathAllowed=file=>localInstructions.includes(file)||!/(AGENTS|PROJECT_INSTRUCTIONS|PUBLIC_SYNC|historical|checkpoint|records\/)/.test(file);
assert.ok(!publicationPathAllowed('audit/PROJECT_INSTRUCTIONS.md'));
if(repositoryIdentity!=='SAIEduLab/Akari-dev'){assert.ok(!publicationPathAllowed('PROJECT_INSTRUCTIONS.md'));assert.ok(!publicationPathAllowed('PUBLIC_SYNC.json'));}
for(const file of files){assert.ok(!path.isAbsolute(file)&&!file.split('/').includes('..'));assert.ok(fs.existsSync(file),file);assert.ok(publicationPathAllowed(file),file);}
for(const file of files.filter(file=>/^(?:audit|\.github)\//.test(file))){
  nameIssues.push(...functionalNameIssues('audit file name',fileNameSegments(file)));
  if(auditRegistry(file))nameIssues.push(...manifestFieldIssues(file,JSON.parse(fs.readFileSync(file,'utf8')),currentProductVersion()));
}
if(nameIssues.length)throw Error('Name policy:\n'+nameIssues.join('\n'));
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
const report={status:'PASS',snapshot:snapshot(currentProductFile()),capabilities:capabilities.length,files:files.length};
fs.writeFileSync(process.argv[2]||'audit-evidence/static.json',JSON.stringify(report,null,2)+'\n');console.log('Static publication contract: PASS');
