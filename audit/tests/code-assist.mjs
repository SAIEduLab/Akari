import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {loadAssistApi,assistWorld,assistObservation} from '../lib/code-assist-host.mjs';
import {codeAssistIds,verifyCodeAssistObservation,observeAssistChecks,verifyAssistChecks} from '../lib/code-assist-contract.mjs';
import {assistVocabulary,verifyAssistVocabulary} from '../lib/code-assist-vocabulary.mjs';
const fixture=JSON.parse(fs.readFileSync('audit/fixtures/assist/code-assist-cases.json','utf8'));
assert.equal(fixture.schema,'akari-code-assist-expectations-v1');assert.deepEqual(fixture.cases.map(c=>c.id),codeAssistIds);
const api=loadAssistApi(),worlds=new Map(),results=[];
const wanted=process.env.AKARI_ASSIST_CASES?.split(',');
for(const test of fixture.cases){
  if(wanted&&!wanted.includes(test.id))continue;
  let observed;
  try{
    const key=JSON.stringify(test.world);if(!worlds.has(key))worlds.set(key,assistWorld(api,test.world));
    const project=worlds.get(key);observed=assistObservation(api,project,test);
    verifyCodeAssistObservation(test,observed,api,project);results.push({id:test.id,status:'PASS',observed});
  }catch(error){results.push({id:test.id,status:'FAIL',observed,error:error.stack||String(error)});}
}
const synonyms=assistVocabulary();verifyAssistVocabulary(synonyms);
const additionalChecks=observeAssistChecks(api);verifyAssistChecks(additionalChecks);
const report={schema:'akari-code-assist-v1',kind:'node',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',uxAcceptance:false,snapshot:snapshot(currentProductFile()),static:{synonyms},additionalChecks,pageErrors:[],networkRequests:[],results};
const output=process.argv[2]||'audit-evidence/code-assist-node.json';fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(`Code assist: ${results.filter(r=>r.status==='PASS').length}/${results.length} ${report.status}`);
for(const row of results.filter(r=>r.status==='FAIL').slice(0,8))console.error(row.id+': '+row.error.split('\n')[0]);
if(report.status!=='PASS')process.exitCode=1;
