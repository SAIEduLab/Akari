import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {ledgerRoot,ledgerSources,ledgerSourceCommit,expandAuditLedger,readerMigrationPins} from './audit-ledger-contract.mjs';

const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
export const migratedReaderPaths=Object.freeze([
  'audit/README.md','audit/lib/docs-consolidation-contract.mjs','audit/lib/japanese-gate-contract.mjs',
  'audit/tests/basic-intents.mjs','audit/tests/finite-semantic-variants.mjs',
  'audit/tests/japanese-contract-static.mjs','audit/tests/static-contract.mjs',
  'audit/lib/child-ux-contract.mjs',
  'audit/tests/ui-buttons.mjs','audit/lib/ui-buttons-contract.mjs',
]);
const occurrences=(bytes,needle)=>{
  if(!needle.length)return 0;let at=0,count=0;
  while((at=bytes.indexOf(needle,at))>=0){count++;at+=needle.length;}
  return count;
};
export function validateReaderMigrationIntegrity(recordBytes,adapterBytes,validatorBytes){
  assert.equal(digest(recordBytes),readerMigrationPins.recordSha256,'exact reviewed reader migration record');
  assert.equal(digest(adapterBytes),readerMigrationPins.adapterSha256,'exact reader adapter source');
  assert.equal(digest(validatorBytes),readerMigrationPins.validatorSha256,'exact updated child-ux validator source');
  const record=JSON.parse(recordBytes);
  assert.equal(record.schema,'akari-audit-ledger-reader-migration-v1');
  assert.equal(record.sourceCommit,ledgerSourceCommit);
  assert.deepEqual(record.files.map(f=>f.path),migratedReaderPaths,'exact file-specific migration targets and order');
  assert.equal(new Set(record.files.map(f=>f.path)).size,record.files.length,'unique migrated path');
  return record;
}
export function restoreReaderSource(file,bytes,row){
  assert.equal(row.path,file,'exact target path');
  assert.equal(bytes.length,row.afterBytes,'complete candidate byte length: '+file);
  assert.equal(digest(bytes),row.afterSha256,'complete candidate byte integrity: '+file);
  assert.ok(Array.isArray(row.hunks)&&row.hunks.length>0,'nonempty fixed hunks');
  let beforeEnd=-1,afterEnd=-1;
  for(const [index,h]of row.hunks.entries()){
    assert.deepEqual(Object.keys(h),['id','beforeOffset','afterOffset','before','after','applications','beforeOccurrences','afterOccurrences'],'exact hunk fields/order');
    assert.equal(h.id,'H'+String(index+1).padStart(3,'0'),'hunk identity/order');
    for(const key of ['beforeOffset','afterOffset','beforeOccurrences','afterOccurrences'])assert.ok(Number.isSafeInteger(h[key])&&h[key]>=0,key);
    assert.equal(typeof h.before,'string');assert.equal(typeof h.after,'string');assert.equal(h.applications,1,'one exact positional application');
    const before=Buffer.from(h.before),after=Buffer.from(h.after);
    assert.ok(before.length||after.length,'nonempty change');
    assert.ok(h.beforeOffset>=beforeEnd&&h.afterOffset>=afterEnd,'nonoverlapping ordered hunk positions');
    assert.ok(index===0||h.beforeOffset>row.hunks[index-1].beforeOffset||h.afterOffset>row.hunks[index-1].afterOffset,'no duplicate hunk position');
    beforeEnd=h.beforeOffset+before.length;afterEnd=h.afterOffset+after.length;
    assert.ok(beforeEnd<=row.beforeBytes&&afterEnd<=row.afterBytes,'hunk positions within complete files');
    assert.ok(bytes.subarray(h.afterOffset,afterEnd).equals(after),'exact candidate hunk bytes/location: '+file+'/'+h.id);
    assert.equal(occurrences(bytes,after),h.afterOccurrences,'exact candidate occurrence count: '+file+'/'+h.id);
  }
  let restored=bytes,applications=0;
  for(const h of [...row.hunks].reverse()){
    const after=Buffer.from(h.after);assert.ok(restored.subarray(h.afterOffset,h.afterOffset+after.length).equals(after));
    restored=Buffer.concat([restored.subarray(0,h.afterOffset),Buffer.from(h.before),restored.subarray(h.afterOffset+after.length)]);applications++;
  }
  assert.equal(applications,row.hunks.length,'all and only the fixed hunks applied once');
  assert.equal(restored.length,row.beforeBytes,'exact starting byte length: '+file);
  assert.equal(digest(restored),row.beforeSha256,'exact starting source bytes: '+file);
  for(const h of row.hunks){const before=Buffer.from(h.before);assert.ok(restored.subarray(h.beforeOffset,h.beforeOffset+before.length).equals(before),'exact starting hunk location');assert.equal(occurrences(restored,before),h.beforeOccurrences,'exact starting occurrence count');}
  return restored;
}
export function verifyReaderMigrationIntegrity(repositoryRoot=ledgerRoot){
  const read=p=>fs.readFileSync(path.join(repositoryRoot,p));
  const record=validateReaderMigrationIntegrity(read(readerMigrationPins.recordPath),read(readerMigrationPins.adapterPath),read(readerMigrationPins.validatorPath));
  for(const row of record.files)restoreReaderSource(row.path,read(row.path),row);
  return record;
}
export function preservedAuditReaderBytes(file,bytes,repositoryRoot=ledgerRoot){
  const ledger=ledgerSources.find(s=>s.path===file);
  if(ledger)return expandAuditLedger(JSON.parse(bytes),file).bytes;
  if(!migratedReaderPaths.includes(file))return bytes;
  const record=verifyReaderMigrationIntegrity(repositoryRoot);
  return restoreReaderSource(file,bytes,record.files.find(row=>row.path===file));
}
