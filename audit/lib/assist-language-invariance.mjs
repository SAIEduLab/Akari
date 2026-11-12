import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {assistWorld,assistContexts,canonicalAssist} from './code-assist-host.mjs';
const {loadApi,script}=createRequire(import.meta.url)('../browser/cases/audit-lib.cjs');

// Read each complete literal, including every regular-expression source. This
// scanner needs no package installation in the change-guard workflow.
function literalAt(source,start){
  const opens={'[':']','{':'}','(':')'},stack=[];let quote='',regex=false,characterClass=false;
  for(let i=start;i<source.length;i++){
    const c=source[i],next=source[i+1];
    if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote='';continue;}
    if(regex){if(c==='\\'){i++;continue;}if(c==='[')characterClass=true;else if(c===']')characterClass=false;else if(c==='/'&&!characterClass){regex=false;while(/[a-z]/i.test(source[i+1]||'')&&source[i+1])i++;}continue;}
    if(c==='/'&&next==='/'){i=source.indexOf('\n',i);if(i<0)break;continue;}
    if(c==='/'&&next==='*'){i=source.indexOf('*/',i+2)+1;if(i===0)throw Error('unclosed table comment');continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='/'){regex=true;continue;}
    if(opens[c])stack.push(opens[c]);else if(']})'.includes(c)){assert.equal(c,stack.pop(),'surface literal bracket');if(!stack.length)return source.slice(start,i+1);}
  }throw Error('unclosed surface literal');
}
function after(source,marker,opener,offset=0){
  const at=source.indexOf(marker,offset);assert.ok(at>=0,'missing surface table: '+marker);
  const start=source.indexOf(opener,at+marker.length);assert.ok(start>=0,'missing surface literal: '+marker);return literalAt(source,start);
}
export function assistLanguageTables(html){
  const source=script(html),within=(name,marker,opener)=>after(source,marker,opener,source.indexOf('function '+name+'('));
  const endings=[];for(const match of source.matchAll(/for\s*\(const\s*\[ending,[^\]]*\]\s*of\s*/g))endings.push(literalAt(source,source.indexOf('[',match.index+match[0].length)));
  assert.ok(endings.length,'missing ending tables');
  return {
    sentence:after(source,'const SENTENCE_FORMS = Object.freeze(','['),
    condition:after(source,'const CONDITION_FORMS = Object.freeze(','['),
    te:after(source,'const SENTENCE_TE_FORMS = Object.freeze(','['),
    polite:within('readRoleStatement','const polite =','['),
    heading:within('readSentenceHeading','const forms','['),
    'until-negative':within('conditionFormCandidates','const negative =','{'),
    ending:endings,
    verbs:after(source,'const verbs=','{'),
  };
}
export function verifyAssistLanguageInvariance(baseHtml,headHtml,fixture){
  assert.deepEqual(assistLanguageTables(headHtml),assistLanguageTables(baseHtml),'assist-language-invariance: reader tables changed');
  assert.equal(fixture.schema,'akari-code-assist-expectations-v1');
  const base=loadApi(baseHtml),worlds=new Map();let texts=0;
  for(const test of fixture.cases){
    const key=JSON.stringify(test.world);if(!worlds.has(key))worlds.set(key,assistWorld(base,test.world));
    const {verify}=assistContexts(base,worlds.get(key),test.context),previous=test.input.source.split('\n').slice(0,test.input.line-1).join('\n');
    for(const candidate of [test.expect.first,...test.expect.contains||[]].filter(Boolean)){
      assert.ok(canonicalAssist(base,candidate.text,verify,previous),test.id+' candidate is not a base canonical sentence: '+candidate.text);texts++;
    }
  }
  return {id:'assist-language-invariance',tables:8,cases:fixture.cases.length,texts};
}
