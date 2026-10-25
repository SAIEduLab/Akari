import {currentLanguageFile} from './product-path.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const corpusPath='audit/fixtures/japanese-intent/child-intent-corpus.json';
export const corpusMarkdownPath='audit/fixtures/japanese-intent/child-intent-corpus.md';
export const capabilityInputPaths=['audit/lib/capability-contract.mjs','audit/fixtures/capability-oracle.json','audit/manifests/capability-traceability.json',corpusPath,corpusMarkdownPath,currentLanguageFile(),'AUDIT.md','audit/manifests/features.json'];
// Fixed requirement identities of the traceability manifest; a dropped or substituted row fails.
const semanticRequirementIds=['SELF-CALL-ORIGIN','SAVE-DRAFT-EDITOR-STATE','CLOSED-ACTOR-ORDER-EXTENSION','LITERAL-MULTILINE-STRINGS'];
const languageContractIds=Array.from({length:11},(_,i)=>'LANGUAGE-CONTRACT-'+String(i+1).padStart(3,'0'));
const japaneseRequirementIds=Array.from({length:14},(_,i)=>'J'+String(i+1).padStart(2,'0'));
const ambiguityInputs=['3回、10歩進んで、1秒待つ','10秒で進む','10秒後に右へ10歩動く','右へ10歩動く','点数が10以上になったら','AかBでなければ','ねこもいぬも同時に動く','持ち物の2番目に「かさ」を入れる','持ち物を「かさ」にする','「ねこを右へ10歩動かす」と言う','【右へ10歩動く】を10にする','その知らせが終わるまで待つ','空白キーが押されたら','大きさを0％にする','ねこが右へすばやく動く'];
const unique=(rows,key)=>assert.equal(new Set(rows.map(key)).size,rows.length,'duplicate current identity');
const same=(a,b)=>assert.deepEqual([...a].sort(),[...b].sort());
export function validateCapabilityContract(oracle,trace,features,corpus,repositoryRoot=root){
 assert.equal(oracle.schema,'akari-independent-capability-oracle-v1');assert.equal(trace.schema,'akari-capability-traceability-v2');
 for(const [key,ids]of [['commands',oracle.commands.map(r=>'command:'+r.id)],['schemas',oracle.schemaIds],['capabilities',oracle.capabilities.map(r=>r.id)],['limits',Object.keys(oracle.limits)]]){
  unique(trace[key],r=>r.id);same(trace[key].map(r=>r.id),ids);
  for(const row of trace[key]){assert.ok(row.meaning?.trim()||key==='limits');assert.ok(row.testReferences.length);for(const t of row.testReferences)assert.ok(fs.existsSync(path.join(repositoryRoot,t.path)),t.path);}
 }
 for(const row of trace.limits)assert.equal(row.value,oracle.limits[row.id]);
 for(const id of oracle.schemaIds)assert.ok(features.schemaIds.includes(id),'required schema '+id);
 for(const row of oracle.commands)assert.ok(features.COMMAND_CATALOG.some(r=>r.id===row.id),'required command '+row.id);
 for(const [id,value]of Object.entries(oracle.limits))assert.equal(features.LIMITS[id],value,'independent limit '+id);
 assert.deepEqual(trace.currentFeatures.commandIds,features.COMMAND_CATALOG.map(r=>r.id));assert.deepEqual(trace.currentFeatures.schemaIds,features.schemaIds);
 assert.deepEqual(corpus.cases,oracle.protectedChildIntent.cases);assert.deepEqual(trace.intentMappings.map(({testReferences,...r})=>r),oracle.protectedChildIntent.mappings);
 assert.deepEqual(trace.semanticRequirements.map(r=>r.id),semanticRequirementIds);assert.deepEqual(trace.semanticRequirements.find(r=>r.id==='SELF-CALL-ORIGIN').expected,{cat:2,dog:101});
 assert.deepEqual(trace.languageContracts.map(r=>r.id),languageContractIds);
 assert.deepEqual(trace.jRequirements.map(row=>row.split('|')[1].trim()),japaneseRequirementIds);
 assert.deepEqual(trace.ambiguityRequirements.map(r=>r.meaning.split('|')[1].trim()),ambiguityInputs);
 for(const row of [...trace.semanticRequirements,...trace.languageContracts,...trace.ambiguityRequirements]){assert.ok(row.meaning?.trim());assert.ok(row.testReferences.length);for(const t of row.testReferences)assert.ok(fs.existsSync(path.join(repositoryRoot,t.path)),t.path);}
 return {status:'PASS',commands:oracle.commands.length,schemas:oracle.schemaIds.length,capabilities:oracle.capabilities.length,limits:Object.keys(oracle.limits).length,intents:corpus.cases.length};
}
export function verifyCapabilityContract(repositoryRoot=root){const json=p=>JSON.parse(fs.readFileSync(path.join(repositoryRoot,p)));return validateCapabilityContract(json('audit/fixtures/capability-oracle.json'),json('audit/manifests/capability-traceability.json'),json('audit/manifests/features.json'),json(corpusPath),repositoryRoot);}
export const capabilityNegativeIds=['CAPABILITY/missing','CAPABILITY/duplicate','CAPABILITY/meaning-missing','CAPABILITY/test-missing','CAPABILITY/current-schema-missing','CAPABILITY/current-command-missing','CAPABILITY/limit-changed','CAPABILITY/intent-changed','CAPABILITY/semantic-requirement-missing','CAPABILITY/language-contract-substituted','CAPABILITY/japanese-requirement-missing','CAPABILITY/ambiguity-input-changed','CAPABILITY/requirement-test-missing'];
export function checkCapabilityNegatives(repositoryRoot=root){const json=p=>JSON.parse(fs.readFileSync(path.join(repositoryRoot,p))),original=[json('audit/fixtures/capability-oracle.json'),json('audit/manifests/capability-traceability.json'),json('audit/manifests/features.json'),json(corpusPath)];
 const mutations=[(o,t)=>t.capabilities.pop(),(o,t)=>t.capabilities[1]=t.capabilities[0],(o,t)=>t.capabilities[0].meaning='',(o,t)=>t.capabilities[0].testReferences=[],(o,t,f)=>f.schemaIds.shift(),(o,t,f)=>f.COMMAND_CATALOG.shift(),(o,t,f)=>f.LIMITS.fileBytes++,(o,t,f,c)=>c.cases[0].title+='changed',(o,t)=>t.semanticRequirements.pop(),
  (o,t)=>t.languageContracts[0].id='LANGUAGE-CONTRACT-999',(o,t)=>t.jRequirements.pop(),(o,t)=>t.ambiguityRequirements[0].meaning=t.ambiguityRequirements[0].meaning.replace('3回','4回'),(o,t)=>t.languageContracts[0].testReferences[0].path='audit/tests/missing-test.mjs'];
 assert.equal(mutations.length,capabilityNegativeIds.length,'one mutation per capability rejection ID');
 return mutations.map((mutate,i)=>{const args=structuredClone(original);mutate(...args);assert.throws(()=>validateCapabilityContract(...args,repositoryRoot));return{id:capabilityNegativeIds[i],rejected:true};});
}
