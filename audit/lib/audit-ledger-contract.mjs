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

export const actionsRepairSourceCommit = "8ca421c23b3325fddff9edb87c640b861fa3ffa0";
export const actionsRepairSources = Object.freeze([
  {
    "path": "audit/tests/editor-assets.mjs",
    "beforeSha256": "c7cfe2f5496426aa5a5160eee7cc6ef7746456a609ce6b9653e5350f0937f9d3",
    "beforeBytes": 26670,
    "afterSha256": "46bc68ea452980940c2c551b80111427a3cf419d2c7be9bec179bf8b401a8856",
    "afterBytes": 29353,
    "hunks": [
      {
        "id": "H001",
        "beforeOffset": 4360,
        "afterOffset": 4360,
        "before": "",
        "after": "// Read runtime readiness and image presentation atomically within the existing page bound.\nasync function observeStandaloneDango(p,id) {\n  const handle=await p.waitForFunction(id=>{\n    if(document.querySelector('#playerRoot')?.dataset.state!=='RUNNING')return false;\n    const c=Array.from(document.querySelectorAll('#formSurface .component')).find(c=>c.dataset.id===id),i=c?.querySelector('.costume-img');\n    if(!i?.complete||i.naturalWidth!==180||i.naturalHeight!==180)return false;\n    const canvas=document.createElement('canvas');canvas.width=180;canvas.height=180;canvas.getContext('2d').drawImage(i,0,0);\n    return {width:c.style.width,height:c.style.height,fit:getComputedStyle(i).objectFit,alpha:canvas.getContext('2d').getImageData(0,0,1,1).data[3]};\n  },id);\n  try {return await handle.jsonValue();} finally {await handle.dispose();}\n}\nasync function standaloneObservationControls(p) {\n  const controls=[],frame=await p.context().newPage();\n  try {\n    const image=await frame.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=180;return c.toDataURL();});\n    await frame.setContent('<div id=\"playerRoot\" data-state=\"PREPARING\"><div id=\"formSurface\"><div class=\"component\" data-id=\"dango-control\" style=\"width:180px;height:180px\"><img class=\"costume-img\" style=\"object-fit:fill\" src=\"'+image+'\"></div></div></div>');\n    await frame.locator('img').evaluate(i=>i.decode());\n    assert.equal(await frame.evaluate(()=>Array.from(document.querySelectorAll('#formSurface .costume-img')).some(i=>i.complete&&i.naturalWidth===180&&i.naturalHeight===180)),true,'old image-only condition accepts PREPARING');\n    frame.setDefaultTimeout(100); // Synthetic refusal bound only; product page retains 30000ms.\n    async function refused(id) {let error;try{await observeStandaloneDango(frame,id);}catch(e){error=e;}assert.equal(error?.name,'TimeoutError',id+' must not be accepted');}\n    await refused('dango-control');controls.push({id:'permanent-preparing',rejected:true,timeoutMs:100});\n    frame.setDefaultTimeout(30000); // The positive control uses the unchanged product observation bound.\n    await frame.evaluate(()=>requestAnimationFrame(()=>{document.querySelector('#playerRoot').dataset.state='RUNNING';}));\n    assert.deepEqual(await observeStandaloneDango(frame,'dango-control'),{width:'180px',height:'180px',fit:'fill',alpha:0});controls.push({id:'delayed-running',accepted:true});\n    frame.setDefaultTimeout(100);\n    await refused('missing');controls.push({id:'missing-target',rejected:true,timeoutMs:100});\n    await frame.locator('img').evaluate(i=>{const c=document.createElement('canvas');c.width=c.height=179;i.src=c.toDataURL();return i.decode();});\n    await refused('dango-control');controls.push({id:'wrong-image-size',rejected:true,timeoutMs:100});\n    await frame.close();let closed;try{await observeStandaloneDango(frame,'dango-control');}catch(e){closed=e;}assert.match(closed?.message||'',/Target page, context or browser has been closed/);controls.push({id:'closed-page',rejected:true});\n  } finally {await frame.close();}\n  return controls;\n}\nconst standaloneControls=[];\n",
        "applications": 1,
        "beforeOccurrences": 0,
        "afterOccurrences": 1
      },
      {
        "id": "H002",
        "beforeOffset": 24282,
        "afterOffset": 27411,
        "before": "    await p.waitForFunction(()=>Array.from(document.querySelectorAll('#formSurface .costume-img')).some(i=>i.complete&&i.naturalWidth===180&&i.naturalHeight===180));\n    const shown=await p.evaluate(()=>{\n      const i=Array.from(document.querySelectorAll('#formSurface .costume-img')).find(i=>i.naturalWidth===180),c=i.closest('.component'),canvas=document.createElement('canvas');\n      canvas.width=180;canvas.height=180;canvas.getContext('2d').drawImage(i,0,0);\n      return {width:c.style.width,height:c.style.height,fit:getComputedStyle(i).objectFit,alpha:canvas.getContext('2d').getImageData(0,0,1,1).data[3]};\n    });\n",
        "after": "    const shown=await observeStandaloneDango(p,second.id);\n",
        "applications": 1,
        "beforeOccurrences": 1,
        "afterOccurrences": 1
      },
      {
        "id": "H003",
        "beforeOffset": 25068,
        "afterOffset": 27630,
        "before": "",
        "after": "    standaloneControls.push(...await standaloneObservationControls(p));\n",
        "applications": 1,
        "beforeOccurrences": 0,
        "afterOccurrences": 1
      },
      {
        "id": "H004",
        "beforeOffset": 26296,
        "afterOffset": 28930,
        "before": "const report={status:results.every(r=>r.pass)&&!pageErrors.length&&!networkRequests.length?'PASS':'FAIL',snapshot:inputs,environment:'chromium',browser:version,results,pageErrors,networkRequests};\n",
        "after": "const report={status:results.every(r=>r.pass)&&!pageErrors.length&&!networkRequests.length?'PASS':'FAIL',snapshot:inputs,environment:'chromium',browser:version,results,pageErrors,networkRequests,standaloneObservationControls:standaloneControls};\n",
        "applications": 1,
        "beforeOccurrences": 1,
        "afterOccurrences": 1
      }
    ]
  },
  {
    "path": "audit/lib/feature-contract.mjs",
    "beforeSha256": "b74189d5b17d2cfb0dc7251019a6e314effa69c866c089d9a42e1ba2b6e8f3a6",
    "beforeBytes": 3741,
    "afterSha256": "7d6ac0a75789037efd83703f90feb93163c650a634c5c5eae96e0f4f33d3aa75",
    "afterBytes": 4070,
    "hunks": [
      {
        "id": "H001",
        "beforeOffset": 986,
        "afterOffset": 986,
        "before": "",
        "after": "  assert.deepEqual(report.standaloneObservationControls,[{id:'permanent-preparing',rejected:true,timeoutMs:100},{id:'delayed-running',accepted:true},{id:'missing-target',rejected:true,timeoutMs:100},{id:'wrong-image-size',rejected:true,timeoutMs:100},{id:'closed-page',rejected:true}],'bounded standalone observation controls');\n",
        "applications": 1,
        "beforeOccurrences": 0,
        "afterOccurrences": 1
      }
    ]
  },
  {
    "path": "audit/lib/audit-ledger-reader-migration.mjs",
    "beforeSha256": "2deb176a0774c69ccb9d00e51206b381d305c31da98c724b1b24e22f482fe7df",
    "beforeBytes": 5282,
    "afterSha256": "3ef6e046924f73f2aade7ec4f43c88d7899873bc245fdfb20048248863f4dc93",
    "afterBytes": 5521,
    "hunks": [
      {
        "id": "H001",
        "beforeOffset": 131,
        "afterOffset": 131,
        "before": "import {ledgerRoot,ledgerSources,ledgerSourceCommit,expandAuditLedger,readerMigrationPins} from './audit-ledger-contract.mjs';\n",
        "after": "import {ledgerRoot,ledgerSources,ledgerSourceCommit,expandAuditLedger,readerMigrationPins,actionsRepairSources} from './audit-ledger-contract.mjs';\n",
        "applications": 1,
        "beforeOccurrences": 1,
        "afterOccurrences": 1
      },
      {
        "id": "H002",
        "beforeOffset": 4777,
        "afterOffset": 4798,
        "before": "",
        "after": "  for(const row of actionsRepairSources)restoreReaderSource(row.path,read(row.path),row);\n",
        "applications": 1,
        "beforeOccurrences": 0,
        "afterOccurrences": 1
      },
      {
        "id": "H003",
        "beforeOffset": 4959,
        "afterOffset": 5070,
        "before": "",
        "after": "  const repaired=actionsRepairSources.find(row=>row.path===file);\n  if(repaired)bytes=restoreReaderSource(file,bytes,repaired);\n",
        "applications": 1,
        "beforeOccurrences": 0,
        "afterOccurrences": 1
      }
    ]
  }
]);

export const readerMigrationPins = Object.freeze({
  "recordPath": "audit/fixtures/audit-ledger-reader-migration.json",
  "recordSha256": "464a9088828ea532cd587a7170f9e67b49c7bb24aa33a7401ba751398fb10418",
  "adapterPath": "audit/lib/audit-ledger-reader-migration.mjs",
  "adapterSha256": "3ef6e046924f73f2aade7ec4f43c88d7899873bc245fdfb20048248863f4dc93",
  "validatorPath": "audit/lib/child-ux-contract.mjs",
  "validatorSha256": "22f302ed8093464e30878aa7169c7af06c9d0a1c2f621edad75978ceee4a6d89"
});
