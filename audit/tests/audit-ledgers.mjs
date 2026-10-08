import {migratedReaderPaths,restoreReaderSource,validateReaderMigrationIntegrity,verifyReaderMigrationIntegrity} from '../lib/audit-ledger-reader-migration.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {ledgerSources,ledgerSourceCommit,ledgerRoot,commonDefinitionId,expandAuditLedger,readAuditLedger,verifyAuditLedgers,readerMigrationPins,actionsRepairSources,actionsRepairSourceCommit} from '../lib/audit-ledger-contract.mjs';

export function checkLedgerNegatives(repositoryRoot=ledgerRoot){
  const results=[];
  for(const pin of ledgerSources){
    const good=JSON.parse(fs.readFileSync(path.join(repositoryRoot,pin.path)));expandAuditLedger(good,pin.path);
    const list=pin.path.includes('registered-')?'changes':pin.path.includes('language-v2-')?'entries':'requirements';
    const ref=s=>{let found;function walk(v){if(!v||typeof v!=='object'||found)return;if(Object.hasOwn(v,'$auditRef')){found=v;return;}Object.values(v).forEach(walk);}walk(s.document);assert.ok(found);return found;};
    const mutations=[
      ['missing-reference',s=>delete ref(s).$auditRef],
      ['missing-definition',s=>s.commonDefinitions.splice(s.commonDefinitions.findIndex(d=>d.id===ref(s).$auditRef),1)],
      ['duplicate-definition-ID',s=>s.commonDefinitions.push(structuredClone(s.commonDefinitions[0]))],
      ['unknown-ID',s=>ref(s).$auditRef='shared-'+'0'.repeat(64)],
      ['invalid-reference-type',s=>ref(s).$auditRef=17],
      ['invalid-definition-type',s=>s.commonDefinitions[0].value=undefined],
      ['changed-order',s=>s.document[list].reverse()],
      ['duplicate-record-ID',s=>s.document[list][1]=structuredClone(s.document[list][0])],
      ['missing-record',s=>s.document[list].pop()],
      ['changed-expectation',s=>{const row=s.document[list][0];if(list==='changes')row.newText+='改変';else if(list==='entries')row.status='PASS';else row.requirement+='改変';}],
      ['changed-common-body',s=>{s.commonDefinitions[0].value='改変';}],
      ['changed-common-body-and-ID',s=>{const d=s.commonDefinitions[0],old=d.id;d.value='改変';d.id=commonDefinitionId(d.value);function walk(v){if(!v||typeof v!=='object')return;if(v.$auditRef===old)v.$auditRef=d.id;Object.values(v).forEach(walk);}walk(s.document);}],
      ['changed-source-hash',s=>s.source.sha256='0'.repeat(64)],
      ['unknown-storage-field',s=>s.extra=true],
      ['unused-definition',s=>{const value='unused common body';s.commonDefinitions.push({id:commonDefinitionId(value),value});}],
    ];
    for(const [id,mutate]of mutations){const bad=structuredClone(good);mutate(bad);assert.throws(()=>expandAuditLedger(bad,pin.path),pin.path+'/'+id);results.push({path:pin.path,id,rejected:true});}
  }
  return results;
}

export function verifyLedgerMigrationRecord(repositoryRoot=ledgerRoot){
  const bytes=fs.readFileSync(path.join(repositoryRoot,'audit/fixtures/audit-ledger-migration.json'));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'2a21d2854014fe757fe78fffa881dcb9ed240d0f082fe3b237e1228cb71b7375','fixed starting freeze inventory');
  const record=JSON.parse(bytes);
  assert.equal(record.sourceCommit,ledgerSourceCommit);
  assert.deepEqual(record.sources,ledgerSources.map(pin=>({path:pin.path,commit:ledgerSourceCommit,sha256:pin.sha256,bytes:pin.bytes,serialization:pin.serialization})),'record and independent source pins agree');
  const initial={schema:record.schema,sourceCommit:record.sourceCommit,branch:record.branch,startingChanges:record.startingChanges,branchNameConflict:record.branchNameConflict,plannedChanges:record.initialRecord.plannedChanges,sources:record.sources,frozenFiles:structuredClone(record.frozenFiles)};
  for(const row of record.initialRecord.removedFrozenFiles)initial.frozenFiles.splice(row.index,0,row.file);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(initial,null,2)+'\n').digest('hex'),'412aea24f8a565059985efa587300141685a7374b771311af3a8b55ea0c13491','original 373-file record retained exactly');
  assert.equal(initial.frozenFiles.length,373);
  assert.deepEqual(record.authorizedAuditImplementationChanges.map(r=>r.path),['audit/lib/child-ux-contract.mjs','audit/tests/ui-buttons.mjs','audit/lib/ui-buttons-contract.mjs']);
  const repair=record.uiObservationAuditRepair;
  assert.deepEqual(repair.scope,['audit/tests/ui-buttons.mjs','audit/lib/ui-buttons-contract.mjs']);
  assert.equal(repair.sourceCommit,ledgerSourceCommit);
  assert.deepEqual(repair.observation.expectedVisible,false);assert.equal(repair.observation.pageTimeoutMs,30000);assert.equal(repair.observation.suiteBudgetMs,360000);
  for(const key of ['addedSleep','retry','productChanges'])assert.equal(repair.observation[key],false);
  const previous=structuredClone(record);delete previous.uiObservationAuditRepair;
  previous.plannedChanges=previous.plannedChanges.filter(p=>!repair.scope.includes(p));
  for(const row of repair.priorMigrationRecord.removedFrozenFiles)previous.frozenFiles.splice(row.index,0,row.file);
  previous.initialRecord.removedFrozenFiles=previous.initialRecord.removedFrozenFiles.filter(r=>!repair.scope.includes(r.file.path));
  previous.authorizedAuditImplementationChanges=previous.authorizedAuditImplementationChanges.filter(r=>!repair.scope.includes(r.path));
  const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
  assert.equal(repair.priorMigrationRecord.sha256,'e23455fa2abcdcdd668dcb72f25801faa07af6d4f8a09be795bb2e640f26a400');
  assert.equal(hash(JSON.stringify(previous,null,2)+'\n'),repair.priorMigrationRecord.sha256,'previous 372-file record retained exactly');
  const reader=JSON.parse(fs.readFileSync(path.join(repositoryRoot,readerMigrationPins.recordPath)));
  reader.files=reader.files.filter(r=>!repair.scope.includes(r.path)).map(r=>r.path==='audit/lib/child-ux-contract.mjs'?repair.priorReaderRecord.childRow:r);
  assert.equal(repair.priorReaderRecord.sha256,'9eb62d87bf742dfe959b3c8e845a01f6e991fd7387340d8c44a380399bc3597c');
  assert.equal(hash(JSON.stringify(reader,null,2)+'\n'),repair.priorReaderRecord.sha256,'previous reader record retained exactly');
  for(const [prior,p]of [[repair.priorAdapter,readerMigrationPins.adapterPath],[repair.priorValidator,readerMigrationPins.validatorPath]]){
    const bytes=fs.readFileSync(path.join(repositoryRoot,p)),row=actionsRepairSources.find(r=>r.path===p);
    const text=(row?restoreReaderSource(p,bytes,row):bytes).toString('utf8');assert.equal(text.split(prior.after).length,2,'one bounded preceding change');
    assert.equal(hash(text.replace(prior.after,prior.before)),prior.sha256,'preceding reviewed source retained exactly');
  }
  return record;
}
export function verifyLedgerFreeze(repositoryRoot=ledgerRoot){
  const record=verifyLedgerMigrationRecord(repositoryRoot);
  for(const f of record.frozenFiles){const bytes=fs.readFileSync(path.join(repositoryRoot,f.path));assert.equal(bytes.length,f.bytes,f.path);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),f.sha256,'frozen bytes: '+f.path);}
  const migration=verifyReaderMigrationIntegrity(repositoryRoot);
  for(const f of record.authorizedAuditImplementationChanges){
    const bytes=restoreReaderSource(f.path,fs.readFileSync(path.join(repositoryRoot,f.path)),migration.files.find(r=>r.path===f.path));
    assert.equal(bytes.length,f.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),f.sha256);
  }
  return {status:'PASS',files:record.frozenFiles.length,authorizedAuditChanges:record.authorizedAuditImplementationChanges.length,initialFreezeFiles:373};
}
function ordered(actual,expected,label){
  assert.equal(Array.isArray(actual),Array.isArray(expected),label+' array type');assert.equal(typeof actual,typeof expected,label+' value type');
  if(actual&&typeof actual==='object'&&expected){assert.deepEqual(Object.keys(actual),Object.keys(expected),label+' keys/order/count');for(const key of Object.keys(expected))ordered(actual[key],expected[key],label+'/'+key);}
  else assert.equal(actual,expected,label+' exact value');
}
export function compareStartingLedgers(repositoryRoot=ledgerRoot){
  return ledgerSources.map(pin=>{
    const original=execFileSync('git',['show',ledgerSourceCommit+':'+pin.path],{cwd:repositoryRoot,maxBuffer:16*1024*1024});
    assert.equal(crypto.createHash('sha256').update(original).digest('hex'),pin.sha256);
    const storage=JSON.parse(fs.readFileSync(path.join(repositoryRoot,pin.path))),expanded=expandAuditLedger(storage,pin.path);
    assert.ok(expanded.bytes.equals(original),'full starting bytes '+pin.path);ordered(expanded.document,JSON.parse(original),pin.path);
    const recordCounts=Object.fromEntries(Object.entries(expanded.document).filter(([key,value])=>Array.isArray(value)).map(([key,value])=>[key,value.length]));
    return {path:pin.path,status:'PASS',source:'starting Git blob',recordCounts,fieldsTypesValuesOrderIdsAndDuplicateOccurrences:'exact'};
  });
}

export function checkReaderMigrationNegatives(repositoryRoot=ledgerRoot){
  const record=verifyReaderMigrationIntegrity(repositoryRoot),results=[],read=p=>fs.readFileSync(path.join(repositoryRoot,p));
  assert.equal(actionsRepairSourceCommit,'8ca421c23b3325fddff9edb87c640b861fa3ffa0');
  assert.deepEqual(actionsRepairSources.map(r=>r.path),['audit/tests/editor-assets.mjs','audit/lib/feature-contract.mjs','audit/lib/audit-ledger-reader-migration.mjs']);
  for(const row of [...record.files,...actionsRepairSources]){
    const good=read(row.path);
    const cases=[
      ['extra-byte',(_,b)=>Buffer.concat([b,Buffer.from('\n')])],
      ['unrelated-change',(_,b)=>{const changed=Buffer.from(b);changed[0]^=1;return changed;}],
      ['rollback',(_,b)=>restoreReaderSource(row.path,b,row)],
      ['missing-hunk',r=>r.hunks.pop()],
      ['duplicate-hunk',r=>r.hunks.push(structuredClone(r.hunks[0]))],
      ['wrong-target-path',r=>r.path='audit/lib/other.mjs'],
      ['wrong-hunk-location',r=>r.hunks[0].afterOffset++],
      ['wrong-hunk-count',r=>r.hunks[0].applications=2],
      ['changed-original-hunk',r=>r.hunks[0].before+='\n'],
      ['changed-candidate-hunk',r=>r.hunks[0].after+='\n'],
      ['changed-occurrence-count',r=>r.hunks[0].afterOccurrences++],
    ];
    for(const [id,mutate]of cases){const r=structuredClone(row),changed=mutate(r,good);assert.throws(()=>restoreReaderSource(row.path,Buffer.isBuffer(changed)?changed:good,r),row.path+'/'+id);results.push({path:row.path,id,rejected:true});}
  }
  const bytes=[read(readerMigrationPins.recordPath),read(readerMigrationPins.adapterPath),read(readerMigrationPins.validatorPath)];
  for(const [index,p]of [readerMigrationPins.recordPath,readerMigrationPins.adapterPath,readerMigrationPins.validatorPath].entries()){
    for(const [id,value]of [['extra-byte',Buffer.concat([bytes[index],Buffer.from('\n')])],['altered-source',Buffer.from('changed')],['rollback',index===0?Buffer.from('{}'):index===1?Buffer.from('export {};'):restoreReaderSource(p,read(p),record.files.find(row=>row.path===p))]]){
      const bad=bytes.map(b=>Buffer.from(b));bad[index]=value;assert.throws(()=>validateReaderMigrationIntegrity(...bad),p+'/'+id);results.push({path:p,id,rejected:true});
    }
  }
  const changedRecord=JSON.parse(bytes[0]);changedRecord.files[0].hunks.push({id:'EXTRA',before:'',after:'arbitrary new change'});
  assert.throws(()=>validateReaderMigrationIntegrity(Buffer.from(JSON.stringify(changedRecord)),bytes[1],bytes[2]));results.push({path:readerMigrationPins.recordPath,id:'unapproved-new-normalization',rejected:true});
  return results;
}
export function compareStartingReaders(repositoryRoot=ledgerRoot){
  const record=verifyReaderMigrationIntegrity(repositoryRoot);
  return record.files.map(row=>{const original=execFileSync('git',['show',ledgerSourceCommit+':'+row.path],{cwd:repositoryRoot,maxBuffer:16*1024*1024});
    assert.ok(restoreReaderSource(row.path,fs.readFileSync(path.join(repositoryRoot,row.path)),row).equals(original),'independent starting reader bytes: '+row.path);
    return {path:row.path,status:'PASS',hunks:row.hunks.length};});
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  verifyLedgerMigrationRecord();
  const report={status:'PASS',ledgers:verifyAuditLedgers(),negativeCases:checkLedgerNegatives().length,readerMigrationNegativeCases:checkReaderMigrationNegatives().length,migrationRecord:'PASS'};
  if(process.argv.includes('--check-freeze'))report.freeze=verifyLedgerFreeze();
  if(process.argv.includes('--compare-start')){report.fullComparison=compareStartingLedgers();report.readerComparison=compareStartingReaders();report.actionsRepairComparison=actionsRepairSources.map(row=>{const original=execFileSync('git',['show',actionsRepairSourceCommit+':'+row.path],{cwd:ledgerRoot,maxBuffer:16*1024*1024});assert.ok(restoreReaderSource(row.path,fs.readFileSync(path.join(ledgerRoot,row.path)),row).equals(original),'independent merged-start bytes: '+row.path);return {path:row.path,status:'PASS',sourceCommit:actionsRepairSourceCommit,hunks:row.hunks.length};});}
  console.log(JSON.stringify(report,null,2));
}
