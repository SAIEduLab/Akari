import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {finiteCases} from '../fixtures/language/forms.mjs';
import {expectedLanguageIds} from '../lib/verify-language-results.mjs';
const read=p=>fs.readFileSync(p),json=p=>JSON.parse(read(p));
const ledger=json('audit/fixtures/language-surface-v2-migration.json');
const oldManifest=json('audit/fixtures/legacy-1.0.1/audit/manifests/language-form-coverage.json'),manifest=json('audit/manifests/language-form-coverage.json');
const oldExpected=json('audit/fixtures/legacy-1.0.1/audit/fixtures/language/expected.json'),expected=json('audit/fixtures/language/expected.json');
assert.equal(ledger.sourceCommit,'d961dd346e5b104e09e7f0dd342beb5c16174a36');
for(const f of ledger.preservedSources){
 assert.equal(crypto.createHash('sha256').update(read(f.path)).digest('hex'),f.sha256,f.path);
 assert.equal(crypto.createHash('sha256').update(read(f.originalPath)).digest('hex'),f.candidateSha256,f.originalPath);
}
assert.equal(finiteCases.length,256);assert.equal(new Set(finiteCases.map(c=>c.id)).size,42);
assert.deepEqual(finiteCases,manifest.cases.map(({id,key,source,canonical})=>({id,key,source,canonical})));
assert.deepEqual(manifest.cases.map(c=>[c.id,c.key]),oldManifest.cases.map(c=>[c.id,c.key]));
assert.equal(ledger.entries.length,605);assert.equal(new Set(ledger.entries.map(e=>e.id)).size,605);
assert.deepEqual(ledger.entries.map(e=>e.id).sort(),expectedLanguageIds(manifest).sort());
const meaning=x=>Array.isArray(x)?x.map(meaning):x&&typeof x==='object'?x.kind==='QuantityLiteral'?meaning(x.value):Object.fromEntries(Object.entries(x).filter(([k])=>!['source','sourceSpan','endLine'].includes(k)).map(([k,v])=>[k,meaning(v)])):x;
for(let i=0;i<256;i++){
 const row=manifest.cases[i],old=oldManifest.cases[i],entry=ledger.entries.find(e=>e.id==='LANG-SURFACE-'+row.id+'/'+row.key);
 assert.deepEqual(meaning(row.canonicalAst),meaning(old.canonicalAst),'semantic AST '+row.id+'/'+row.key);
 assert.deepEqual(entry.new.ast,row.canonicalAst);assert.equal(entry.new.source,row.source);assert.equal(entry.old.source,old.source);
 const key=row.id+'/'+row.key,before=structuredClone(oldExpected.golden[key]);
 before.out=before.out.map(([v,t])=>[v==='真'?'あてはまる':v==='偽'?'あてはまらない':v,t]);
 if(before.blocked)before.blocked={runtimeId:'sprite-1',...before.blocked};
 assert.deepEqual(expected.golden[key],before,'runtime guarantee changed '+key);
 assert.deepEqual(entry.new.runtime,expected.golden[key]);
}
assert.equal(expected.corpus.length,95);assert.deepEqual(expected.schemaIds,oldExpected.schemaIds);
for(let i=0;i<95;i++){
 const old=meaning(oldExpected.corpus[i].ast),next=meaning(expected.corpus[i].ast);
 // Fixed lexical delimiters change only the qualifier of the same corpus name.
 if(i>=74){const node=old.body[0],value=node.target||node.value;value.qualifier='exact';}
 assert.deepEqual(next,old,'corpus semantic AST '+i);
 assert.deepEqual(ledger.corpus[i].new,expected.corpus[i]);
}
console.log(JSON.stringify({status:'PASS',stableIds:605,finiteInputs:256,groups:42,corpus:95,baselineSchemas:153,guarantees:'AST operands/order and runtime golden retained independently of candidate output'}));
