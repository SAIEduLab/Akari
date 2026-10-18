import fs from 'node:fs';
import assert from 'node:assert/strict';
import {finiteCases} from '../fixtures/language/forms.mjs';
import {expectedLanguageIds} from '../lib/verify-language-results.mjs';
import {sha} from '../lib/product-test-host.mjs';
const read=p=>JSON.parse(fs.readFileSync(p)),manifest=read('audit/manifests/language-form-coverage.json'),expected=read('audit/fixtures/language/expected.json');
const oracle=read('audit/fixtures/capability-oracle.json');
assert.equal(finiteCases.length,256);assert.equal(new Set(finiteCases.map(c=>c.id)).size,42);
assert.deepEqual(finiteCases,manifest.cases.map(({id,key,source,canonical})=>({id,key,source,canonical})));
assert.equal(sha(JSON.stringify(manifest.cases)),'0704302891b6e9ae67e68c21d4953ddf8c3d8cb0ff35b95994be4a1eb1eee257','independent source/canonical AST expectations');
assert.equal(sha(JSON.stringify({golden:expected.golden,corpus:expected.corpus,schemaIds:expected.schemaIds})),'973d6bbc87ca8545f7b14597c8e15f6a135d97d699b179452b9fd8f08a8426f8','independent runtime/corpus expectations');
const ids=expectedLanguageIds(manifest);assert.equal(ids.length,607);assert.equal(new Set(ids).size,ids.length);
assert.deepEqual(Object.keys(expected.golden).sort(),manifest.cases.map(c=>c.id+'/'+c.key).sort());
for(const c of manifest.cases){assert.ok(c.source&&c.canonical&&c.canonicalAst);assert.ok(expected.golden[c.id+'/'+c.key]);}
assert.equal(expected.corpus.length,95);assert.deepEqual(expected.schemaIds,oracle.schemaIds);
for(const c of expected.corpus)assert.ok(c.source&&c.ast);
console.log(JSON.stringify({status:'PASS',stableIds:ids.length,finiteInputs:finiteCases.length,groups:42,corpus:expected.corpus.length,schemas:oracle.schemaIds.length,expectationsSha256:sha(fs.readFileSync('audit/fixtures/language/expected.json')),manifestSha256:sha(fs.readFileSync('audit/manifests/language-form-coverage.json'))}));
