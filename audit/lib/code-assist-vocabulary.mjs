import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {currentProductFile} from './product-path.cjs';
const fixture=()=>JSON.parse(fs.readFileSync('audit/fixtures/assist/search-words.json','utf8'));
export function assistVocabulary(html=fs.readFileSync(currentProductFile(),'utf8')){
  const marker='const BLOCK_SEARCH_SYNONYMS = Object.freeze(',at=html.indexOf(marker),start=html.indexOf('{',at),end=html.indexOf('\n  });',start)+4;
  assert.ok(at>=0&&end>start,'search vocabulary is present');
  return JSON.parse(JSON.stringify(vm.runInNewContext('('+html.slice(start,end)+')',Object.create(null),{timeout:1000})));
}
export function verifyAssistVocabulary(actual){
  const expected=fixture();assert.equal(expected.schema,'akari-code-assist-search-words-v1');
  const owners=new Map();
  for(const [id,words]of Object.entries(actual)){
    assert.ok(Array.isArray(words));assert.equal(new Set(words).size,words.length,'duplicate word within '+id);
    for(const word of words){assert.equal(typeof word,'string');if(!owners.has(word))owners.set(word,[]);owners.get(word).push(id);}
  }
  for(const [word,ids]of owners)if(ids.length>1)assert.deepEqual(ids.sort(),expected.duplicateAllowlist[word],'unapproved shared synonym '+word);
  assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected.synonyms).sort());
  for(const id of Object.keys(actual))assert.deepEqual([...actual[id]].sort(),[...expected.synonyms[id]].sort(),'approved search words '+id);
  return true;
}
