// Run with: node audit/tests/part-state-wait.mjs
// Equivalent wait spellings must preserve the observed part and sequential continuation.
import {writeCaseReport} from '../lib/gate-case-contract.mjs';
import assert from 'node:assert/strict';

import {loadAssistApi} from '../lib/code-assist-host.mjs';
const A=loadAssistApi(), plain=value=>JSON.parse(JSON.stringify(value));
const tests=[
  ['say-single','ねこが言い終わるまで待つ。'],
  ['speak-single','ねこが話し終わるまで待つ。'],
  ['sound-single','ねこの音が鳴り終わるまで待つ。'],
  ['say-newline','ねこが言い終わるまで待つ。\n犬は「b」と言う。'],
  ['say-period','ねこが言い終わるまで待つ。犬は「b」と言う。'],
  ['say-te','ねこが言い終わるまで待って、犬は「b」と言う。'],
  ['say-tekara','ねこが言い終わるまで待ってから、犬は「b」と言う。'],
  ['speak-te','ねこが話し終わるまで待って、犬は「b」と言う。'],
  ['speak-tekara','ねこが話し終わるまで待ってから、犬は「b」と言う。'],
  ['sound-tekara','ねこの音が鳴り終わるまで待ってから、犬は「b」と言う。'],
  ['named-say-single','犬は、ねこが言い終わるまで待つ。'],
  ['named-speak-single','犬はねこが話し終わるまで待つ。'],
  ['named-say-tekara','犬はねこが言い終わるまで待ってから、犬は「b」と言う。'],
  ['named-sound-single','犬はねこの音が鳴り終わるまで待つ。'],
].map(([id,source])=>({
  id,source,
  expected:{accepted:true,firstKind:'WaitUntil',conditionKind:'PartState',state:source.includes('音が')?'soundDone':'speechDone',observedPart:'ねこ',statementCount:source.includes('「b」')?2:1,...(id.startsWith('named-')?{waiter:'犬'}:{}),...(source.includes('「b」')?{nextPart:'犬'}:{})},
}));

function projectFor(source){
  const p=A.makeEmptyProject(), first=plain(p.components[0]);
  p.components=['ねこ','犬','鳥'].map((name,i)=>{
    const a=plain(first);Object.assign(a,{id:'review-'+i,name,x:i*100,y:100,direction:0});
    a.costumes=[{id:'review-costume-'+i,name:'文字',kind:'text',value:name}];a.costumeId='review-costume-'+i;
    a.localData={variables:[],lists:[]};return a;
  });
  p.projectData={variables:[],lists:[]};p.actions=[];p.functions=[];
  p.scripts=[{id:'review-main',targetId:'meijin',mode:'meijin',event:'start',source}];
  return p;
}

const results=tests.map(test=>{
  const entry={...test};
  try{
    const compiled=A.compileProject(projectFor(test.source));
    entry.observed={errors:plain(compiled.errors),body:plain(compiled.items[0]?.ast?.body||[])};
    assert.deepEqual(entry.observed.errors,[],'equivalent wait spelling must compile');
    const body=entry.observed.body, first=body[0], expected=test.expected;
    assert.equal(body.length,expected.statementCount,'sequential statement count');
    assert.equal(first.kind,expected.firstKind,'wait statement kind');
    assert.equal(first.condition.kind,expected.conditionKind,'condition kind');
    assert.equal(first.condition.state,expected.state,'condition state');
    assert.deepEqual(first.condition.actorRef,{kind:'named',name:expected.observedPart},'part whose state is observed');
    if(expected.waiter)assert.equal(first.actorRef.name,expected.waiter,'explicit waiting subject');
    if(expected.nextPart)assert.equal(body[1].actorRef.name,expected.nextPart,'following subject');
    entry.status='PASS';
  }catch(error){entry.status='FAIL';entry.error=error.message;}
  return entry;
});
const report=writeCaseReport(process.argv[2]||'audit-evidence/part-state-wait.json','part-state-wait',results,{environment:'Node VM / actual product compiler'});
console.log('Part state wait: '+results.filter(r=>r.status==='PASS').length+'/'+results.length+' '+report.status);
if(report.status!=='PASS')process.exitCode=1;
