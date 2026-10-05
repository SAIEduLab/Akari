import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Reviewed migration record; changing meaning/routing requires an explicit new record.
const reviewedMigrationSha256="2a7b27269e8f0bcc7d972416058a0ddb44d242d0e6b92b72497ce65764479e42";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
export const corpusPath='audit/fixtures/japanese-intent/child-intent-corpus.json';
export const corpusMarkdownPath='audit/fixtures/japanese-intent/child-intent-corpus.md';
export const consolidationInputPaths=[
  'audit/lib/docs-consolidation-contract.mjs','audit/fixtures/design-doc-migration-map.json',
  'audit/manifests/capability-traceability.json',corpusPath,corpusMarkdownPath,
  'README.md','LANGUAGE.md','AUDIT.md','audit/reviewed/PUBLIC_SEMANTIC_UX_SPEC.md',
];
const text=(x,label)=>assert.ok(typeof x==='string'&&x.trim(),label);
const unique=(x,label)=>assert.equal(new Set(x).size,x.length,label);
const pointer=(object,p)=>p.split('/').slice(1).reduce((o,k)=>o?.[k.replace(/~1/g,'/').replace(/~0/g,'~')],object);
const set=(a,b,label)=>assert.deepEqual([...a].sort(),[...b].sort(),label);
function sectionBody(content,title){
 const lines=content.split('\n'),start=lines.findIndex(s=>/^#{1,4} /.test(s)&&s.replace(/^#+ /,'')===title);
 assert.ok(start>=0,'missing permanent section: '+title);
 let end=start+1;while(end<lines.length&&!/^#{1,4} /.test(lines[end]))end++;
 return lines.slice(start+1,end).join('\n').trim();
}
export function validateConsolidationRecord(map,ledger,repositoryRoot=root){
 const bytesCache=new Map(),jsonCache=new Map();
 const read=p=>{if(!bytesCache.has(p))bytesCache.set(p,fs.readFileSync(path.join(repositoryRoot,p)));return bytesCache.get(p);};
 const json=p=>{if(!jsonCache.has(p))jsonCache.set(p,JSON.parse(read(p)));return jsonCache.get(p);};
 const baseline=json('audit/fixtures/1.0.2-baseline-capabilities.json');
 assert.equal(map.schema,'akari-design-retention-map-v2');
 assert.equal(map.migrationComplete,true);assert.equal(map.deletionAllowed,true);
 assert.deepEqual(map.unresolved,[]);assert.deepEqual(map.auditRelaxations,[]);
 assert.equal(map.sourceDocumentCommit,baseline.documentCommit);
 assert.equal(map.adoptedProductCommit,'9e397aa631835242e6ff2bd81c1e4c7e5d2bd554');
 assert.equal(map.productSha256,'672fc372f15bb9980bf56e37485349abfeef9cf8ed6beaab9621c62ae10a65da');
 assert.equal(ledger.schema,'akari-capability-traceability-v1');
 assert.equal(sha(JSON.stringify(ledger.history)),'636165a151736c5e816ce3c63564a7db6d6cbbd4b5b6b17dd090dae1c4f6d5cb','old traceability meaning/state changed');
 assert.equal(sha(JSON.stringify(ledger.appendices)),'78bd1ed5018a1f1e0d165bf567d6e0806664567ee61e66cb131a0f3fd6244fef','old appendix input/expected routes changed');
 assert.equal(ledger.baselineCommit,baseline.baselineCommit);assert.equal(ledger.sourceCommit,baseline.documentCommit);
 assert.equal(map.requirements.length,639);unique(map.requirements.map(r=>r.id),'639 migration identities');
 assert.equal(sha(JSON.stringify(map.requirements.map(x=>[x.source,x.line||null,x.pointer||null,x.requirement,x.original||null]))),'8ed170cc5eede0b5ec3d9cd03525a798ae0ec2b5c29893dfd452320ff1080e1e','original 639 meanings changed');
 assert.equal(map.bodyInventory.length,257);unique(map.bodyInventory.map(r=>r.id),'body inventory identities');
 assert.equal(sha(JSON.stringify(map.bodyInventory.map(x=>[x.source,x.startLine,x.endLine,x.sourceTextSha256]))),'7789aeae86744e432b334ea3057e9025ca063678fac8b0d3eb6622acbb203cfe','paragraph/table/code/list source coverage changed');
 assert.equal(map.ledgerSha256,sha(read('audit/manifests/capability-traceability.json')),'migration ledger hash');
 const inspectDestination=d=>{
  text(d.path,'destination path');assert.ok(!d.path.startsWith('docs/1.0.2/'),'live old destination');
  const content=read(d.path).toString();
  if(d.section)text(sectionBody(content,d.section),'permanent body requirement');
  else if(d.pointer)assert.notEqual(pointer(json(d.path),d.pointer),undefined,'missing destination pointer '+d.path+d.pointer);
  else if(d.caseId)assert.ok(json(d.path).cases.some(c=>c.id===d.caseId),'missing intent destination');
  else if(d.sourceLine)assert.ok(content.split('\n')[d.sourceLine-1]?.trim(),'moved corpus section');
  else assert.fail('destination requires an exact section, pointer, or case identity');
 };
 const inspectTests=tests=>{assert.ok(Array.isArray(tests)&&tests.length>0,'missing inspection tests');for(const t of tests){text(t.id,'stable test identity');assert.ok(fs.existsSync(path.join(repositoryRoot,t.path)),'missing inspection test '+t.path);if(t.path==='audit/manifests/product-tests.json')assert.ok(json(t.path).suites.some(s=>s.ids.includes(t.id)),'unknown current product test ID');}};
 for(const r of map.requirements){assert.equal(r.status,'COMPLETE');text(r.disposition,'disposition');text(r.preservedMeaning,'preserved meaning');text(r.inspectionBasis,'inspection basis');assert.ok(r.destinations.length);r.destinations.forEach(inspectDestination);inspectTests(r.testReferences);}
 for(const b of map.bodyInventory){assert.ok(b.startLine<=b.endLine);text(b.heading,'source heading');text(b.preservedMeaning,'body meaning');if(b.sourceRequirement)assert.equal(sha(b.sourceRequirement),b.sourceTextSha256,'body original meaning');b.destinations.forEach(inspectDestination);inspectTests(b.testReferences);}
 assert.equal(map.files.length,6);
 for(const original of baseline.documentHashManifest){
  const row=map.files.find(f=>f.path===original.path);assert.ok(row,'missing source provenance');
  assert.equal(row.bytes,original.bytes);assert.equal(row.sha256,original.sha256);text(row.historyUrl,'source history');
  if(row.currentPath){const bytes=read(row.currentPath);assert.equal(bytes.length,original.bytes);assert.equal(sha(bytes),original.sha256,'independent corpus bytes changed');}
  else assert.equal(row.currentPath,null);
 }
 assert.equal(ledger.history.status,'DESIGN_CANDIDATE_NOT_IMPLEMENTED');
 assert.deepEqual(ledger.history.counts,{commands:74,baseline_schemas:153,capabilities:260,limits:38});
 set(ledger.commands.map(x=>x.id),baseline.commands.map(x=>'command:'+x.id),'all command routes');
 set(ledger.schemas.map(x=>x.id),baseline.schemaIds,'all schema routes');
 set(ledger.capabilities.map(x=>x.id),baseline.capabilities.map(x=>x.id),'all capability routes');
 set(ledger.limits.map(x=>x.id),Object.keys(baseline.limits),'all limit routes');
 for(const [key,oldKey]of [['commands','baseline_commands'],['schemas','baseline_schema_mapping'],['capabilities','required_capabilities'],['newContracts','new_contracts']]){
  assert.equal(ledger[key].length,ledger.history[oldKey].length);
  for(let i=0;i<ledger[key].length;i++){
   const row=ledger[key][i];assert.deepEqual(row.original,ledger.history[oldKey][i],'historical mapping meaning');assert.equal(row.original.status,'NOT_RUN');
   assert.equal(row.executionStatus,'NOT_ASSERTED_BY_DOCUMENT_MIGRATION');row.destinations.forEach(inspectDestination);inspectTests(row.testReferences);
  }
 }
 const features=json('audit/manifests/features.json');
 for(const list of [ledger.commands,ledger.schemas,ledger.capabilities,ledger.limits])for(const r of list)for(const f of r.featureReferences){const actual=pointer(features,f.pointer);assert.ok(actual!==undefined,'unknown feature pointer');if(f.pointer.includes('COMMAND_CATALOG'))assert.equal(actual.id,f.id);else if(f.pointer.includes('schemaIds'))assert.equal(actual,f.id);else if(f.pointer.includes('LIMITS'))assert.equal(actual,baseline.limits[f.id.replace(/^limit:/,'')]);}
 for(const limit of ledger.limits)assert.equal(limit.value,baseline.limits[limit.id]);
 assert.deepEqual(ledger.currentAdditionalFeatures.commandIds,features.COMMAND_CATALOG.map(c=>c.id),'current command reduction');
 assert.deepEqual(ledger.currentAdditionalFeatures.schemaIds,features.schemaIds,'current schema reduction');
 assert.equal(ledger.newContracts.length,11);assert.equal(ledger.intentMappings.length,20);
 assert.deepEqual(ledger.intentMappings.map(x=>x.original),baseline.protectedChildIntent.mappings);
 assert.equal(ledger.history.intent_corpus.status,'NOT_RUN');
 assert.equal(ledger.jRequirements.length,14);assert.equal(ledger.ambiguityRequirements.length,15);
 const expectedRevisions=['SELF-CALL-ORIGIN','SAVE-DRAFT-EDITOR-STATE','CLOSED-ACTOR-ORDER-EXTENSION','LITERAL-MULTILINE-STRINGS'];
 assert.deepEqual(map.semanticRevisions.map(x=>x.id),expectedRevisions);assert.deepEqual(map.semanticRevisions,ledger.semanticRevisions);
 for(const r of map.semanticRevisions){text(r.oldText,'original wording');text(r.adoptedText,'adopted wording');text(r.reason,'revision rationale');assert.match(r.commit,/^[a-f0-9]{40}$/);text(r.authority,'review authority');r.destinations.forEach(inspectDestination);inspectTests(r.testReferences);}
 assert.deepEqual(map.semanticRevisions[0].expected,{cat:2,dog:101});
 assert.match(map.semanticRevisions[1].adoptedText,/IME.*ドラッグ.*確定/);
 assert.ok(ledger.clarifications.some(x=>x.source.endsWith('設計書.md')&&x.line===86&&x.meaning.includes('does not introduce')),'numeric value versus literal syntax');
 assert.equal(map.contractSections.length,33);unique(map.contractSections.map(s=>s.path+'#'+s.section),'permanent body identities');
 for(const s of map.contractSections){assert.equal(sha(sectionBody(read(s.path).toString(),s.section)),s.sectionBodySha256,'permanent semantic body changed: '+s.path+' '+s.section);}
 verifyProjectedSource(map,repositoryRoot);
 return {status:'PASS',requirements:639,bodyBlocks:257,commands:74,schemas:153,capabilities:260,limits:38,intents:20,semanticRevisions:4};
}
export function verifyProjectedSource(map,repositoryRoot=root){
 const content=fs.readFileSync(path.join(repositoryRoot,map.sourceProjection.path),'utf8');
 const additions=[...content.matchAll(/<!-- DOCS-CONSOLIDATION-BEGIN -->[\s\S]*?<!-- DOCS-CONSOLIDATION-END -->/g)].map(m=>m[0]);
 assert.equal(additions.length,2);assert.deepEqual(additions.map(sha),map.sourceProjection.additionHashes,'reviewed prose additions changed');
 const projected=content.replace(/\n\n<!-- DOCS-CONSOLIDATION-BEGIN -->[\s\S]*?<!-- DOCS-CONSOLIDATION-END -->/g,'');
 assert.equal(sha(projected),map.sourceProjection.originalSha256,'existing independent source was changed');
 return sha(projected);
}
export function verifyConsolidatedDocumentation(repositoryRoot=root){
 const read=p=>fs.readFileSync(path.join(repositoryRoot,p)),map=JSON.parse(read('audit/fixtures/design-doc-migration-map.json')),ledger=JSON.parse(read('audit/manifests/capability-traceability.json'));
 assert.equal(sha(read('audit/fixtures/design-doc-migration-map.json')),reviewedMigrationSha256,'reviewed migration record changed');
 assert.equal(fs.existsSync(path.join(repositoryRoot,'docs/1.0.2')),false,'retired live folder must be absent');
 const result=validateConsolidationRecord(map,ledger,repositoryRoot);
 return {...result,mapSha256:sha(read('audit/fixtures/design-doc-migration-map.json')),ledgerSha256:sha(read('audit/manifests/capability-traceability.json'))};
}

export const consolidationNegativeIds=[
 'DOCS/missing-requirement','DOCS/duplicate-identity','DOCS/changed-old-meaning',
 'DOCS/missing-body-block','DOCS/changed-body-source','DOCS/missing-destination',
 'DOCS/missing-test-route','DOCS/unresolved-completion','DOCS/pending-completion',
 'DOCS/historical-PASS','DOCS/changed-appendix','DOCS/current-capability-reduction',
 'DOCS/missing-semantic-revision','DOCS/IME-drag-save-expanded',
 'DOCS/changed-independent-source','DOCS/missing-permanent-body',
];
export function checkConsolidationNegatives(repositoryRoot=root){
 const map=JSON.parse(fs.readFileSync(path.join(repositoryRoot,'audit/fixtures/design-doc-migration-map.json'))),ledger=JSON.parse(fs.readFileSync(path.join(repositoryRoot,'audit/manifests/capability-traceability.json')));
 const cases=[
  m=>m.requirements.pop(),m=>m.requirements[1].id=m.requirements[0].id,
  m=>m.requirements.find(r=>r.original).original.status='PASS',m=>m.bodyInventory.pop(),
  m=>m.bodyInventory.find(r=>r.sourceRequirement).sourceRequirement+='changed',
  m=>m.requirements[0].destinations[0].path='absent.md',m=>m.requirements[0].testReferences=[],
  m=>m.unresolved.push('undecided contract'),m=>m.migrationComplete=false,
  (m,l)=>l.history.baseline_commands[0].status='PASS',
  (m,l)=>l.appendices.A[0][2]='changed meaning',
  (m,l)=>l.currentAdditionalFeatures.commandIds.pop(),
  m=>m.semanticRevisions.pop(),m=>m.semanticRevisions[1].adoptedText='Allow in-progress IME and drag saves',
  m=>m.sourceProjection.originalSha256='0'.repeat(64),m=>m.contractSections.pop(),
 ];
 return cases.map((mutate,i)=>{const m=structuredClone(map),l=structuredClone(ledger);mutate(m,l);assert.throws(()=>validateConsolidationRecord(m,l,repositoryRoot),consolidationNegativeIds[i]);return {id:consolidationNegativeIds[i],rejected:true};});
}
