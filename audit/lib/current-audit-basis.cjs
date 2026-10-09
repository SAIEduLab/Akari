const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const basisPath='audit/manifests/current-audit-basis.json';
const releasePath='audit/manifests/release-1.1.2.json';
// Changed only by the explicit reviewed-basis recording command, never by a gate.
const REVIEWED_BASIS_SHA256='e949c401de61b260ecd5333c450e038d95a98db9dfda33505402fc12ee968366';
const basisTargets=Object.freeze([
  'Akari1_1_2.html','AUDIT.md','LANGUAGE.md','MANUAL.html','README.md',
  'Manual/block-mode.html','Manual/code-mode-advanced.html','Manual/code-mode-beginner.html','Manual/code-mode-intermediate.html',
  'audit/README.md','audit/public-files.json',
  'audit/tests/editor-assets.mjs','audit/tests/editor-browser.mjs','audit/tests/format-compatibility.mjs',
  'audit/browser/cases/run-editor-regression.cjs','audit/browser/cases/browser-storage-media.cjs','audit/browser/cases/browser-product.cjs',
  'audit/lib/audit-ledger-contract.mjs','audit/lib/audit-ledger-reader-migration.mjs','audit/lib/child-ux-contract.mjs',
  'audit/lib/license-contract.cjs','audit/lib/migration-source-contract.mjs',
  'audit/tests/audit-ledgers.mjs','audit/tests/static-contract.mjs','audit/tests/japanese-contract-static.mjs',
  'audit/tests/language-migration-static.mjs','audit/tests/license-static.mjs','audit/tests/child-ux.mjs','audit/tests/block-field-width.mjs',
  'audit/record-current-basis.mjs',
  'audit/fixtures/child-ux-scope.json','audit/fixtures/approved-run-preview-fix.json',
  'audit/fixtures/audit-ledger-reader-migration.json','audit/fixtures/audit-ledger-migration.json',
  'audit/manifests/license-migration.json','audit/manifests/features.json',
].sort());
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const exact=(value,keys,label)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value),label+' object');assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),label+' fields');};
function validateBasisDocument(record){
  exact(record,['schema','productVersion','startingCommit','updateReason','executionStatus','files'],'current basis');
  assert.equal(record.schema,'akari-current-audit-basis-v1');assert.equal(record.productVersion,'1.1.2');
  assert.equal(record.startingCommit,'2997cac6e74895e12cfd6ede51311ce09ddbdfd8');
  assert.ok(typeof record.updateReason==='string'&&record.updateReason.trim().length>=20,'reviewed update reason required');
  assert.equal(record.executionStatus,'NOT_ASSERTED_BY_BYTE_INTEGRITY','basis is not execution evidence');
  assert.ok(Array.isArray(record.files),'current target array');
  const targets=record.files.map(f=>f.path);assert.equal(new Set(targets).size,targets.length,'duplicate current target');
  assert.deepEqual(targets,basisTargets,'exact reviewed current target list/order');
  for(const file of record.files){exact(file,['path','sha256','bytes'],'current target');assert.match(file.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(file.bytes)&&file.bytes>=0,'current byte size');}
  return record;
}
function validateBasisBytes(bytes){assert.equal(sha(bytes),REVIEWED_BASIS_SHA256,'exact reviewed current basis bytes');return validateBasisDocument(JSON.parse(bytes));}
function validateReleaseDocument(release,meta){
  assert.equal(meta.schema,'akari-public-files-v1');assert.equal(meta.productVersion,'1.1.2');
  assert.equal(new Set(meta.files).size,meta.files.length,'unique public target');
  for(const file of meta.files)assert.ok(typeof file==='string'&&!path.isAbsolute(file)&&!file.split(/[\\/]/).includes('..'),'contained public target');
  exact(release,['schema','productVersion','languageContractId','runtimeContractId','projectFormat','programFormat','files','inventorySha256'],'current release');
  assert.equal(release.schema,'akari-release-freeze-v1');assert.equal(release.productVersion,'1.1.2');
  for(const key of ['languageContractId','runtimeContractId','projectFormat','programFormat'])assert.equal(release[key],2,'current external contract '+key);
  assert.deepEqual(Object.keys(release.files),meta.files.filter(file=>file!==releasePath),'exact current release target list/order');
  assert.equal(release.inventorySha256,sha(JSON.stringify(Object.keys(release.files))),'current release inventory integrity');
  for(const hash of Object.values(release.files))assert.match(hash,/^[a-f0-9]{64}$/);
  return release;
}
function verifyReleaseFiles(release,read){
  for(const [file,expected]of Object.entries(release.files))assert.equal(sha(read(file)),expected,'current release byte integrity: '+file);
}
function currentState(repositoryRoot=root){
  const read=file=>fs.readFileSync(path.join(repositoryRoot,file)),basis=validateBasisBytes(read(basisPath));
  const metaBytes=read('audit/public-files.json'),metaRow=basis.files.find(f=>f.path==='audit/public-files.json');
  assert.equal(metaBytes.length,metaRow.bytes,'reviewed public inventory size');assert.equal(sha(metaBytes),metaRow.sha256,'reviewed public inventory hash');
  const meta=JSON.parse(metaBytes),release=validateReleaseDocument(JSON.parse(read(releasePath)),meta);
  return {read,basis,release};
}
function verifyCurrentAuditFile(file,bytes,repositoryRoot=root){
  const {basis,release}=currentState(repositoryRoot);
  assert.ok(Object.hasOwn(release.files,file),'registered current file: '+file);
  assert.equal(sha(bytes),release.files[file],'current release byte integrity: '+file);
  const row=basis.files.find(f=>f.path===file);
  if(row){assert.equal(bytes.length,row.bytes,'reviewed current byte size: '+file);assert.equal(sha(bytes),row.sha256,'reviewed current byte integrity: '+file);}
  return bytes;
}
function verifyCurrentAuditBasis(repositoryRoot=root){
  const {read,basis,release}=currentState(repositoryRoot);
  for(const row of basis.files){const bytes=read(row.path);assert.equal(bytes.length,row.bytes,'reviewed current byte size: '+row.path);assert.equal(sha(bytes),row.sha256,'reviewed current byte integrity: '+row.path);}
  verifyReleaseFiles(release,read);
  return {status:'PASS',scope:'CURRENT_BYTE_INTEGRITY_ONLY',reviewedTargets:basis.files.length,currentFiles:Object.keys(release.files).length,productSha256:release.files['Akari1_1_2.html'],executionStatus:basis.executionStatus};
}
function checkCurrentBasisNegatives(repositoryRoot=root){
  const {read,basis,release}=currentState(repositoryRoot),results=[];
  const refused=(id,fn,pattern)=>{let error;try{fn();}catch(e){error=e;}assert.equal(error?.code,'ERR_ASSERTION',id+' must reach its protection');assert.match(error.message,pattern,id+' exact rejection reason');results.push({id,rejected:true});};
  const bytes=read(basisPath);
  refused('CURRENT/basis-extra-byte',()=>validateBasisBytes(Buffer.concat([bytes,Buffer.from('\n')])),/exact reviewed current basis bytes/);
  refused('CURRENT/basis-changed-hash',()=>validateBasisBytes(Buffer.from(bytes.toString().replace(basis.files[0].sha256,'0'.repeat(64)))),/exact reviewed current basis bytes/);
  for(const [id,mutate,pattern]of [
    ['missing-target',r=>r.files.pop(),/exact reviewed current target list/],
    ['duplicate-target',r=>r.files[1]=r.files[0],/duplicate current target/],
    ['changed-target-list',r=>r.files[0].path='other.html',/exact reviewed current target list/],
    ['false-execution-PASS',r=>r.executionStatus='PASS',/basis is not execution evidence/],
    ['invalid-size',r=>r.files[0].bytes=-1,/current byte size/],
  ]){const bad=structuredClone(basis);mutate(bad);refused('CURRENT/'+id,()=>validateBasisDocument(bad),pattern);}
  const meta=JSON.parse(read('audit/public-files.json'));
  const missing=structuredClone(release);delete missing.files['Akari1_1_2.html'];
  refused('CURRENT/release-target-missing',()=>validateReleaseDocument(missing,meta),/exact current release target list/);
  const altered=structuredClone(release);altered.files['Akari1_1_2.html']='0'.repeat(64);
  refused('CURRENT/release-hash-modified',()=>verifyReleaseFiles(altered,read),/current release byte integrity/);
  for(const [id,file,mutate]of [
    ['file-extra-byte','audit/tests/editor-assets.mjs',b=>Buffer.concat([b,Buffer.from('\n')])],
    ['assertion-change','audit/tests/editor-browser.mjs',b=>Buffer.from(b.toString().replace('assert.equal','assert.notEqual'))],
    ['validator-modified','audit/lib/current-audit-basis.cjs',b=>Buffer.concat([b,Buffer.from('\n')])],
    ['MIT-display-missing','Akari1_1_2.html',b=>Buffer.from(b.toString().replace('SPDX-License-Identifier: MIT','SPDX-License-Identifier: REMOVED'))],
    ['oracle-changed','audit/fixtures/1.0.2-baseline-capabilities.json',b=>Buffer.concat([b,Buffer.from(' ')])],
    ['limit-relaxed','audit/manifests/features.json',b=>{const o=JSON.parse(b);o.LIMITS.fileBytes++;return Buffer.from(JSON.stringify(o));}],
    ['ID-missing','audit/manifests/product-tests.json',b=>{const o=JSON.parse(b);o.suites[0].ids.pop();return Buffer.from(JSON.stringify(o));}],
    ['ID-duplicate','audit/manifests/product-tests.json',b=>{const o=JSON.parse(b);o.suites[0].ids[1]=o.suites[0].ids[0];return Buffer.from(JSON.stringify(o));}],
  ]){const good=read(file),bad=mutate(good);assert.notDeepEqual(bad,good,id+' mutation exercised');refused('CURRENT/'+id,()=>verifyCurrentAuditFile(file,bad,repositoryRoot),/current release byte integrity/);}
  return results;
}
module.exports={basisPath,basisTargets,sha,validateBasisDocument,validateBasisBytes,verifyCurrentAuditFile,verifyCurrentAuditBasis,checkCurrentBasisNegatives};
