// One-time format migration, never an oracle/expectation generator.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {ledgerSources,ledgerSourceCommit,ledgerRoot,commonDefinitionId,expandAuditLedger,originalLedgerBytes} from '../lib/audit-ledger-contract.mjs';

const selections = {
  'registered-v2-test-migrations.json': {changes:['oldText','newText','preservedMeaning','sourceLedger']},
  'language-v2-test-migration.json': {entries:['sourceEvidencePaths','executionEvidencePaths','oldExpectedMeaningRoute']},
  'design-doc-migration-map.json': {requirements:['inspectionBasis','testReferences','sourceHistory','preservedMeaning'],bodyInventory:['preservedMeaning','destinations','testReferences']},
};
for(const pin of ledgerSources){
  const file=path.join(ledgerRoot,pin.path),raw=fs.readFileSync(file),document=JSON.parse(raw);
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),pin.sha256,'only the approved starting bytes may be converted');
  const values=new Map(),fields=selections[path.basename(file)];
  for(const [list,names]of Object.entries(fields))for(const row of document[list])for(const key of names){
    if(!Object.hasOwn(row,key))continue;
    const text=JSON.stringify(row[key]),entry=values.get(text)||{value:row[key],count:0};entry.count++;values.set(text,entry);
  }
  const definitions=new Map();
  for(const [text,entry]of values){
    const id=commonDefinitionId(entry.value),reference=JSON.stringify({$auditRef:id});
    // Share only an exact repeated value when reference+definition bytes save space.
    if(entry.count>1&&(entry.count-1)*Buffer.byteLength(text)>entry.count*Buffer.byteLength(reference)+Buffer.byteLength(id)+32)
      definitions.set(text,{id,value:entry.value});
  }
  for(const [list,names]of Object.entries(fields))for(const row of document[list])for(const key of names){
    if(!Object.hasOwn(row,key))continue;const entry=definitions.get(JSON.stringify(row[key]));if(entry)row[key]={$auditRef:entry.id};
  }
  const storage={schema:'akari-audit-shared-ledger-v1',source:{commit:ledgerSourceCommit,path:pin.path,sha256:pin.sha256,bytes:pin.bytes},serialization:pin.serialization,commonDefinitions:[...definitions.values()],document};
  const expanded=expandAuditLedger(storage,pin.path);assert.ok(expanded.bytes.equals(raw),'original bytes before any write');
  // One record per line keeps identities and references readable in diffs.
  const lines=Object.entries(storage).map(([key,value])=>{
    const encoded=key==='document'?originalLedgerBytes(value,'line-array-json').toString().trimEnd():
      key==='commonDefinitions'?'[\n'+value.map(row=>'  '+JSON.stringify(row)).join(',\n')+'\n]':JSON.stringify(value,null,2);
    return '  '+JSON.stringify(key)+': '+encoded.replace(/\n/g,'\n  ');
  });
  const bytes=Buffer.from('{\n'+lines.join(',\n')+'\n}\n');
  if(process.argv.includes('--write'))fs.writeFileSync(file,bytes);
  console.log(JSON.stringify({path:pin.path,originalBytes:raw.length,storedBytes:bytes.length,definitions:definitions.size,written:process.argv.includes('--write')}));
}
