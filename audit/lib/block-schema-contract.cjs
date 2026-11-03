// Current block schema contract.
// The product schemas must equal the hand-written fixture (roles, value types,
// arity, bodies, annotations), the fixture must list exactly the current schema
// IDs, and the full GUI schema rows must cover exactly those IDs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const fixturePath='audit/fixtures/block-schemas.json',featuresPath='audit/manifests/features.json',browserResultsPath='audit/manifests/browser-results.json';
const readJson=(relative,base=root)=>JSON.parse(fs.readFileSync(path.join(base,relative),'utf8'));
const guiSchemaTask='schema-shards';

// The structural projection the fixture describes. Labels and initial values are
// wording and defaults owned by other checks, so they are not part of this shape.
function schemaShape(schema){
 const optional=(value,key)=>value===undefined?{}:{[key]:value};
 return {id:schema.id,kind:schema.kind,discriminator:schema.discriminator?{key:schema.discriminator.key,value:schema.discriminator.value}:null,category:schema.category,
  ...(schema.draftOnly?{draftOnly:true}:{}),
  fields:Array.from(schema.fields,f=>({key:f.key,type:f.type,required:f.required})),
  inputs:Array.from(schema.inputs,i=>({key:i.key,type:i.type,required:i.required,multiple:i.multiple,
   ...(i.multiple?{minItems:i.minItems,maxItems:i.maxItems}:{}),...(i.variadic?{variadic:true}:{}),
   ...(i.semanticMin===undefined?{}:{semanticMin:i.semanticMin,semanticMax:Number.isFinite(i.semanticMax)?i.semanticMax:null}),
   ...optional(i.semanticArity,'semanticArity')})),
  bodies:Array.from(schema.bodies,b=>({key:b.key,required:b.required,requiredExecutable:b.requiredExecutable,...optional(b.when,'when')})),
  annotations:Array.from(schema.annotations,a=>({key:a.key,type:a.type,required:a.required,...optional(a.editable,'editable'),...optional(a.when,'when')}))};
}
function guiSchemaKeys(browserResults){
 const entries=browserResults.entries.filter(e=>e.task===guiSchemaTask);
 assert.equal(entries.length,1,'one full GUI schema task');return entries[0].keys;
}
// productSchemas and guiKeys are optional so static gates can check the
// fixture/manifest side without loading a candidate.
function verifySchemaContract({fixture,schemaIds,productSchemas=null,guiKeys=null}){
 assert.equal(fixture.schema,'akari-block-schema-contract-v1');
 assert.ok(Array.isArray(schemaIds)&&schemaIds.length,'current schema IDs');
 assert.equal(new Set(schemaIds).size,schemaIds.length,'duplicate current schema ID');
 const ids=fixture.schemas.map(s=>s.id);
 assert.equal(new Set(ids).size,ids.length,'duplicate fixture schema');
 assert.deepEqual(ids,schemaIds,'fixture must describe exactly the current schemas in product order');
 for(const s of fixture.schemas)assert.deepEqual(schemaShape(s),s,'fixture row is not a structural contract row '+s.id);
 if(productSchemas){
  assert.deepEqual(Array.from(productSchemas,s=>s.id),schemaIds,'product schema IDs differ from the current schema list');
  for(let i=0;i<schemaIds.length;i++)assert.deepEqual(schemaShape(productSchemas[i]),fixture.schemas[i],'product schema differs from the current contract: '+schemaIds[i]);
 }
 if(guiKeys){
  assert.equal(new Set(guiKeys).size,guiKeys.length,'duplicate GUI schema row');
  assert.deepEqual([...guiKeys].sort(),[...schemaIds].sort(),'full GUI schema rows must cover exactly the current schemas');
 }
 for(const [id,row]of Object.entries(fixture.semanticRows)){
  assert.ok(ids.includes(id),'semantic row for an unknown schema '+id);
  assert.ok(typeof row.sentence==='string'&&row.sentence.length,'semantic row sentence '+id);
  assert.ok(typeof row.route==='string'&&row.route.length,'semantic row route '+id);
  assert.ok(Array.isArray(row.language)&&row.language.length&&row.language.every(x=>/^LANGUAGE\.md /.test(x)),'semantic row LANGUAGE.md basis '+id);
  assert.ok(row.speech!==undefined||row.monitor!==undefined||row.run!==undefined,'semantic row runtime expectation '+id);
 }
 return {schemas:ids.length,semanticRows:Object.keys(fixture.semanticRows).length};
}
function currentInputs(repositoryRoot=root){
 const fixture=readJson(fixturePath,repositoryRoot),features=readJson(featuresPath,repositoryRoot),browserResults=readJson(browserResultsPath,repositoryRoot);
 return {fixture,schemaIds:features.schemaIds,guiKeys:guiSchemaKeys(browserResults)};
}
const schemaContractNegativeIds=[
 'SCHEMA-CONTRACT/fixture-row-missing','SCHEMA-CONTRACT/fixture-row-duplicate','SCHEMA-CONTRACT/fixture-order-changed',
 'SCHEMA-CONTRACT/current-schema-added','SCHEMA-CONTRACT/product-field-type-changed','SCHEMA-CONTRACT/product-input-arity-changed',
 'SCHEMA-CONTRACT/product-body-removed','SCHEMA-CONTRACT/product-annotation-editable-changed','SCHEMA-CONTRACT/product-optional-role-required',
 'SCHEMA-CONTRACT/product-schema-added','SCHEMA-CONTRACT/fixture-label-added','SCHEMA-CONTRACT/gui-row-missing','SCHEMA-CONTRACT/gui-row-unexpected',
 'SCHEMA-CONTRACT/gui-row-duplicate','SCHEMA-CONTRACT/semantic-row-unknown','SCHEMA-CONTRACT/semantic-row-without-sentence','SCHEMA-CONTRACT/semantic-row-without-runtime',
];
// Each mutation is a contract violation the verifier must reject. The product
// side is modelled by the fixture rows so the negatives need no candidate.
function checkSchemaContractNegatives(inputs){
 const base={fixture:inputs.fixture,schemaIds:inputs.schemaIds,productSchemas:inputs.fixture.schemas,guiKeys:inputs.guiKeys};
 verifySchemaContract(structuredClone(base));
 const at=(c,id)=>c.productSchemas.find(s=>s.id===id);
 const mutations=[
  c=>c.fixture.schemas.pop(),
  c=>{c.fixture.schemas[1]=c.fixture.schemas[0];},
  c=>{const [a,b]=c.fixture.schemas.splice(1,2);c.fixture.schemas.splice(1,0,b,a);},
  c=>{c.schemaIds.push('MotionCommand:NOT_A_CURRENT_SCHEMA');c.guiKeys.push('MotionCommand:NOT_A_CURRENT_SCHEMA');},
  c=>{at(c,'MotionCommand:MOVE_BY').fields[0].type='string';},
  c=>{at(c,'MotionCommand:MOVE').inputs[0].maxItems=3;},
  c=>{at(c,'IfStatement').bodies.pop();},
  c=>{at(c,'CommentLine').annotations[0].editable=true;},
  c=>{at(c,'Say').inputs[1].required=true;},
  c=>{c.productSchemas.push({...c.productSchemas[0],id:'Extra'});},
  c=>{c.fixture.schemas[0].label='本文';},
  c=>c.guiKeys.pop(),
  c=>c.guiKeys.push('Extra'),
  c=>{c.guiKeys[1]=c.guiKeys[0];},
  c=>{c.fixture.semanticRows.Extra={...c.fixture.semanticRows.QuantityLiteral};},
  c=>{c.fixture.semanticRows.QuantityLiteral.sentence='';},
  c=>{delete c.fixture.semanticRows.QuantityLiteral.speech;},
 ];
 assert.equal(mutations.length,schemaContractNegativeIds.length);
 return mutations.map((mutate,i)=>{const c=structuredClone(base);c.productSchemas=structuredClone(c.fixture.schemas);mutate(c);assert.throws(()=>verifySchemaContract(c),schemaContractNegativeIds[i]);return {id:schemaContractNegativeIds[i],rejected:true};});
}
function verifySchemaContractNegatives(results){
 assert.deepEqual(results.map(r=>r.id),schemaContractNegativeIds,'schema contract negative set');
 for(const r of results)assert.equal(r.rejected,true,r.id);
 return results.length;
}
module.exports={fixturePath,featuresPath,browserResultsPath,guiSchemaTask,schemaShape,guiSchemaKeys,verifySchemaContract,currentInputs,schemaContractNegativeIds,checkSchemaContractNegatives,verifySchemaContractNegatives};
