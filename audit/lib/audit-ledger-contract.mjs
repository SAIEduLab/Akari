import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const ledgerSourceCommit = '79e08a61f2d8e865db75a6d0ea90142548f741ec';
export const ledgerSources = Object.freeze([
  {path:'audit/fixtures/registered-v2-test-migrations.json',sha256:'abb8fbaace9a8ef6787eebd6dd391a9a99d207ba6a45ee573f8b498a44c0b969',bytes:4442615,serialization:'pretty-json'},
  {path:'audit/fixtures/language-v2-test-migration.json',sha256:'e43b5d3e93d36f6c21f96745584994f3d03f561b49f4cae98fd75bdc9a1769c7',bytes:2238664,serialization:'pretty-json'},
  {path:'audit/fixtures/design-doc-migration-map.json',sha256:'2a7b27269e8f0bcc7d972416058a0ddb44d242d0e6b92b72497ce65764479e42',bytes:1330122,serialization:'line-array-json'},
].map(Object.freeze));
export const ledgerInputPaths = ['audit/tests/ui-buttons.mjs','audit/lib/ui-buttons-contract.mjs','audit/lib/audit-ledger-reader-migration.mjs','audit/fixtures/audit-ledger-reader-migration.json','audit/lib/child-ux-contract.mjs','audit/lib/audit-ledger-contract.mjs','audit/fixtures/audit-ledger-migration.json',...ledgerSources.map(s=>s.path)];
export const ledgerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value,expected,label) => {assert.ok(object(value),label+' object');assert.deepEqual(Object.keys(value),expected,label+' fields/order');};
export const commonDefinitionId = value => 'shared-'+digest(JSON.stringify(value));

// These serializers reproduce the STARTING blob, including all whitespace.
// The old byte hash is authoritative; no candidate or product generates it.
export function originalLedgerBytes(document,serialization){
  if(serialization==='pretty-json')return Buffer.from(JSON.stringify(document,null,2)+'\n');
  assert.equal(serialization,'line-array-json','known original byte serialization');
  return Buffer.from('{\n'+Object.entries(document).map(([key,value])=>
    '  '+JSON.stringify(key)+': '+(Array.isArray(value)&&value.length ?
      '[\n'+value.map(row=>'    '+JSON.stringify(row)).join(',\n')+'\n  ]' :
      JSON.stringify(value,null,2).replace(/\n/g,'\n  '))).join(',\n')+'\n}\n');
}

export function expandAuditLedger(storage,relative){
  const pin=ledgerSources.find(s=>s.path===relative);assert.ok(pin,'known ledger path');
  keys(storage,['schema','source','serialization','commonDefinitions','document'],'shared ledger');
  assert.equal(storage.schema,'akari-audit-shared-ledger-v1');
  assert.deepEqual(storage.source,{commit:ledgerSourceCommit,path:pin.path,sha256:pin.sha256,bytes:pin.bytes},'immutable starting source');
  assert.equal(storage.serialization,pin.serialization);
  assert.ok(Array.isArray(storage.commonDefinitions),'definitions array');
  const definitions=new Map(),uses=new Map();
  function plain(value){
    if(Array.isArray(value)){value.forEach(plain);return;}
    if(object(value)){assert.ok(!Object.hasOwn(value,'$auditRef'),'reserved reference in literal definition');Object.values(value).forEach(plain);return;}
    assert.ok(value===null||typeof value==='string'||typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value)),'JSON value type');
  }
  for(const entry of storage.commonDefinitions){
    keys(entry,['id','value'],'definition');assert.equal(typeof entry.id,'string');plain(entry.value);
    assert.equal(entry.id,commonDefinitionId(entry.value),'definition ID/content integrity');
    assert.ok(!definitions.has(entry.id),'duplicate definition ID');definitions.set(entry.id,entry.value);uses.set(entry.id,0);
  }
  function expand(value){
    if(Array.isArray(value))return value.map(expand);
    if(object(value)){
      if(Object.hasOwn(value,'$auditRef')){
        keys(value,['$auditRef'],'reference');assert.equal(typeof value.$auditRef,'string','reference ID type');
        assert.ok(definitions.has(value.$auditRef),'unknown reference ID');uses.set(value.$auditRef,uses.get(value.$auditRef)+1);
        return structuredClone(definitions.get(value.$auditRef));
      }
      return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,expand(child)]));
    }
    plain(value);return value;
  }
  assert.ok(object(storage.document),'document object');
  const document=expand(storage.document);
  for(const count of uses.values())assert.ok(count>=2,'unused or single-use common definition');
  const bytes=originalLedgerBytes(document,pin.serialization);
  assert.equal(bytes.length,pin.bytes,'exact original byte length');
  assert.equal(digest(bytes),pin.sha256,'exact original byte SHA-256 (fields/types/values/order/IDs/duplicates)');
  return {document,bytes,definitions:definitions.size};
}

export function readAuditLedgerBytes(relative,repositoryRoot=ledgerRoot){
  const raw=fs.readFileSync(path.join(repositoryRoot,relative));
  return ledgerSources.some(s=>s.path===relative)?expandAuditLedger(JSON.parse(raw),relative).bytes:raw;
}
export function readAuditLedger(relative,repositoryRoot=ledgerRoot){
  return JSON.parse(readAuditLedgerBytes(relative,repositoryRoot));
}
export function verifyAuditLedgers(repositoryRoot=ledgerRoot){
  return ledgerSources.map(pin=>{const raw=fs.readFileSync(path.join(repositoryRoot,pin.path));const result=expandAuditLedger(JSON.parse(raw),pin.path);
    return {path:pin.path,status:'PASS',sourceCommit:ledgerSourceCommit,originalSha256:pin.sha256,originalBytes:result.bytes.length,storedSha256:digest(raw),storedBytes:raw.length,commonDefinitions:result.definitions};});
}

export const readerMigrationPins = Object.freeze({
  "recordPath": "audit/fixtures/audit-ledger-reader-migration.json",
  "recordSha256": "464a9088828ea532cd587a7170f9e67b49c7bb24aa33a7401ba751398fb10418",
  "adapterPath": "audit/lib/audit-ledger-reader-migration.mjs",
  "adapterSha256": "2deb176a0774c69ccb9d00e51206b381d305c31da98c724b1b24e22f482fe7df",
  "validatorPath": "audit/lib/child-ux-contract.mjs",
  "validatorSha256": "22f302ed8093464e30878aa7169c7af06c9d0a1c2f621edad75978ceee4a6d89"
});
