import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {transferFixtures,fixturePins,schemaForExpression,verifyTransferReport} from '../lib/actions-transfer-contract.mjs';
import {snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {formatCompatibilityIds} from '../lib/format-compatibility-contract.mjs';
import {uiButtonIds} from '../lib/ui-buttons-contract.mjs';
const {plan}=transferFixtures(),features=JSON.parse(fs.readFileSync('audit/manifests/features.json'));
const product=JSON.parse(fs.readFileSync('audit/manifests/product-tests.json'));
const browsers=JSON.parse(fs.readFileSync('audit/manifests/browser-results.json'));
const baseline=JSON.parse(fs.readFileSync('audit/fixtures/1.0.2-baseline-capabilities.json'));
const legacy=JSON.parse(fs.readFileSync('audit/fixtures/legacy-1.0.1/block-schemas.json'));
const core=product.suites.find(s=>s.name==='runCoreTests');
const same=(a,b)=>assert.deepEqual([...a].sort(),[...b].sort());
same(plan.groups.C.map(r=>r.id.slice(2)),features.COMMAND_CATALOG.map(x=>x.id));
same(plan.groups.Q.map(r=>schemaForExpression(r.id)),legacy.filter(s=>s.category==='expression').map(s=>s.id));
same(plan.groups.E.map(r=>r.id.slice(2)),baseline.capabilities.filter(c=>c.id.startsWith('event:')).map(c=>c.id));
same(plan.groups.L.map(r=>r.id.slice('L-limit:'.length)),Object.keys(features.LIMITS));
same(plan.groups.S.map(r=>r.id.slice(2)),features.schemaIds);
same(plan.groups.O.map(r=>r.id.slice(4)),baseline.capabilities.filter(c=>!/^(command|expression|operator|builtin|state|sensor|event|limit):/.test(c.id)).map(c=>c.id));
const productRefs=product.suites.flatMap(s=>s.ids.map(id=>({job:'selftest',suite:s.name,id})));
const auxiliaryRefs=[...formatCompatibilityIds.map(id=>({job:'selftest',suite:'format-compatibility',id})),...uiButtonIds.map(id=>({job:'selftest',suite:'ui-buttons',id}))];
const rows=Object.entries(plan.groups).flatMap(([group,items])=>items.map(row=>{
  let references;
  if(group==='C'){
    const id='CORE catalog '+row.id.slice(2);assert.ok(core.ids.includes(id),id);
    references=[{job:'selftest',suite:core.name,id,guarantee:'parse/registration'},
      {job:'composition-acceptance',suite:row.id.startsWith('C-SoundCommand:')?'audio-output-browser':'command-meaning',id:row.id.startsWith('C-SoundCommand:')?row.id.split(':')[1]:row.id,guarantee:row.id.startsWith('C-SoundCommand:')?'actual PCM output, timing, wait and stop':'actual scheduler; independent values and effects, source/Block traces; native UI remains in full browser suites'}];
  } else if(group==='Q'){
    const id=schemaForExpression(row.id),entry=browsers.entries.find(e=>e.task==='schema-shards');assert.ok(entry.keys.includes(id));
    references=[{job:'full-browser-gate (schemas)',suite:entry.task,id,guarantee:'GUI fields/inputs, structural editing, source/block AST, save/reopen'},
      {job:'composition-acceptance',suite:'actions-transfer-values',id:row.id,guarantee:'independent fixed values; native-input obligations stay in existing browser suites'}];
  } else if(group==='E'){
    const id=row.id.slice(2),entry=browsers.entries.find(e=>e.task==='browser-events');assert.ok(entry.keys.includes(id));
    references=[{job:'full-browser-gate (ui)',suite:entry.task,id,guarantee:'real event dispatch, correct target and body'}];
  } else if(group==='L'){
    references=[{job:'full-browser-gate (limits)',suite:'browser-design-limits / browser-runtime-limits / browser-asset-limits / browser-media-boundaries',id:row.id.slice(2),guarantee:'boundary families; exact N-1/N/N+1 evidence must be checked per limit'},
      {job:'selftest',suite:'runLimitBoundaryTests / language-boundaries',id:row.id.slice(2),guarantee:'actual design/parser/runtime limit checks'}];
  } else if(group==='S'){
    const id=row.id.slice(2),old=legacy.some(s=>s.id===id);
    references=[{job:old?'full-browser-gate (schemas)':'selftest',suite:old?'schema-shards':'runBlockCodecTests / japanese-intent-browser / runtime-v2',id,
      guarantee:old?'full old-schema GUI row':'additional schema codec/meaning or draft safety; full GUI operations not claimed'}];
  } else {
    const capability=baseline.capabilities.find(c=>c.id===row.id.slice(4));assert.ok(capability);
    references=[...productRefs,...auxiliaryRefs].filter(ref=>capability.selftest.includes(ref.id)||capability.browser.includes(ref.id));
    for(const entry of browsers.entries)for(const id of entry.keys){
      const name=(entry.task==='schema-shards'?'browser-schemas':entry.task)+':'+id;
      if(capability.browser.includes(name))references.push({job:'full-browser-gate ('+entry.group+')',suite:entry.task,id});
    }
    if(capability.id==='maint:identifier-policy')references.push({job:'static',suite:'static-contract / release-policy-negative',id:'identifier-policy'});
    assert.ok(references.length,'Unmapped independent capability '+capability.id);
    references=references.map(ref=>({...ref,guarantee:capability.guarantee,capability:capability.id}));
  }
  return {...row,group,references,executionClaim:'NOT_ASSERTED'};
}));
const report={schema:'akari-actions-transfer-static-v1',status:'PASS',snapshot:snapshot(currentProductFile()),fixturePins,
  claim:'REGISTRATION_ONLY',productAcceptance:false,uxAcceptance:false,rows};
verifyTransferReport(report);
const output=path.resolve(process.argv[2]);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(`Actions transfer: ${rows.length} fixed rows mapped; registration only, no UX or product acceptance claim`);
