// Run with: node audit/tests/flow-context.mjs
// Uses the generated product API and a controlled logical clock.
// The sound case supplies a deterministic media host; it checks sound ownership,
// completion notification, PartState and scheduling, not physical audio playback.
import {writeCaseReport} from '../lib/gate-case-contract.mjs';
import assert from 'node:assert/strict';

import {loadAssistApi} from '../lib/code-assist-host.mjs';
const A=loadAssistApi(),plain=value=>JSON.parse(JSON.stringify(value));
const initial=[0,100,200],dogMoved=[0,110,200],joined=[0,110,210];
const tests=[
  {id:'part-state-actual-parallel',meijin:true,
    source:'次のことを同時に始める。\n  ねこは「a」と1秒言う。\n  ねこが言い終わるまで待ってから、犬は10歩進む。\n鳥は10歩進む。',
    times:[999,1000],positions:[initial,initial,joined]},
  {id:'part-state-explicit-waiter',meijin:true,
    source:'次のことを同時に始める。\n  ねこは「a」と1秒言う。\n  鳥は、ねこが言い終わるまで待ってから、犬は10歩進む。\n鳥は10歩進む。',
    times:[999,1000],positions:[initial,initial,joined]},
  {id:'condition-named-local',owner:'review-1',localScores:true,
    source:'ねこは、点数が1になるまで待つ。犬は10歩進む。',
    extraScripts:[{id:'signal',targetId:'review-0',event:'start',source:'0.5秒待つ。点数を1にする。'}],
    times:[499,500],positions:[initial,initial,dogMoved]},
  {id:'procedure-local-condition',owner:'review-1',localScores:true,
    source:'ねこは【待つ】という手順を行う。犬は10歩進む。',
    extraScripts:[{id:'signal',targetId:'review-0',event:'start',source:'0.5秒待つ。点数を1にする。'}],
    actions:[{id:'wait-score',ownerId:'stage',name:'待つ',args:[],source:'点数が1になるまで待つ。'}],
    times:[499,500],positions:[initial,initial,dogMoved]},
  {id:'variable-subject-wait',meijin:true,chosenPart:true,
    source:'えらんだ部品を、ねこにする。えらんだ部品は1秒待つ。犬は10歩進む。',
    times:[999,1000],positions:[initial,initial,dogMoved]},
  {id:'part-state-sound-completion',meijin:true,mediaHost:true,
    source:'次のことを同時に始める。\n  ねこは440Hzの音を1秒鳴らす。\n  鳥は、ねこの音が鳴り終わるまで待ってから、犬は10歩進む。\n鳥は10歩進む。',
    times:[999,1000],positions:[initial,initial,joined],sounding:[['review-0'],['review-0'],[]]},
];
function projectFor(test){
  const p=A.makeEmptyProject(),first=plain(p.components[0]);
  p.components=['ねこ','犬','鳥'].map((name,i)=>{
    const a=plain(first);Object.assign(a,{id:'review-'+i,name,x:i*100,y:100,direction:0});
    a.costumes=[{id:'review-costume-'+i,name:'文字',kind:'text',value:name}];a.costumeId='review-costume-'+i;
    a.localData={variables:[],lists:[]};return a;
  });
  p.projectData={variables:[],lists:[]};p.actions=plain(test.actions||[]);p.functions=[];
  if(test.localScores){
    p.components[0].localData.variables=[{id:'cat-score',name:'点数',initialValue:0}];
    p.components[1].localData.variables=[{id:'dog-score',name:'点数',initialValue:1}];
  }
  if(test.chosenPart)p.projectData.variables.push({id:'chosen',name:'えらんだ部品',initialValue:0});
  p.scripts=[{id:'main',targetId:test.meijin?'meijin':test.owner||'review-0',...(test.meijin?{mode:'meijin'}:{}),event:'start',source:test.source},...plain(test.extraScripts||[])];
  return p;
}
function observe(project,test){
  const compiled=A.compileProject(project);assert.deepEqual(plain(compiled.errors),[],'compilation');
  let clock=0,sequence=0;const speech=[],steps=[],errors=[],states=[],audio=[];
  const activeAudioHandles=new Map();
  const mediaHost={activeAudioHandles,setPaused(){},
    startTone(frequency,seconds,volume,pitch,onEnded){
      const id='audio-'+(++sequence);activeAudioHandles.set(id,{deadline:clock+seconds*1000,onEnded});
      audio.push({event:'start',id,time:clock,frequency,seconds,volume,pitch});return id;
    },
    stopHandle(id,{notify=false}={}){const entry=activeAudioHandles.get(id);activeAudioHandles.delete(id);if(notify)entry?.onEnded?.(id);},
    stopAllHandles({notify=false}={}){for(const id of [...activeAudioHandles.keys()])this.stopHandle(id,{notify});},
  };
  const runtime=new A.RuntimeModel(project,{},test.mediaHost?mediaHost:null);runtime.now=()=>clock;
  const scheduler=new A.EventScheduler(project,compiled,runtime,{
    say:(part,text)=>speech.push({part,text,time:clock}),
    runtimeError:(_task,error)=>errors.push({code:error.code,message:error.message}),
    beforeStatement:(task,node)=>steps.push({kind:node.kind,part:task.subject?.runtimeId,time:clock}),
  });scheduler.schedule=()=>{};
  const before=JSON.stringify(project);
  const pump=()=>{let count=0;while(scheduler.ready.length&&count++<10000)scheduler.runTurn(true);assert.ok(count<10000,'finite execution');assert.deepEqual(errors,[],'runtime errors');};
  const capture=()=>states.push({time:clock,positions:project.components.map(c=>runtime.actor(c.id)?.x),active:scheduler.tasks.size,sounding:[...runtime.soundingParts()],speech:plain(speech)});
  try{
    scheduler.start();pump();capture();
    for(clock of test.times){
      for(const [id,entry]of [...activeAudioHandles])if(clock>=entry.deadline){
        activeAudioHandles.delete(id);audio.push({event:'end',id,time:clock});entry.onEnded?.(id);
      }
      scheduler.advanceContinuous(clock);scheduler.recheckBlocked(true);pump();capture();
    }
    assert.deepEqual(states.map(s=>s.positions),test.positions,'positions at independent times');
    assert.equal(states.at(-1).active,0,'all branches and parent complete');
    assert.equal(JSON.stringify(project),before,'design project unchanged');
    if(test.sounding)assert.deepEqual(states.map(s=>s.sounding),test.sounding,'actual runtime sound ownership');
    return {states,steps,audio};
  }finally{scheduler.stop();}
}
const results=tests.map(test=>{
  const project=projectFor(test),row={id:test.id,input:{scripts:plain(project.scripts),actions:plain(project.actions),projectData:plain(project.projectData),parts:project.components.map(c=>({id:c.id,name:c.name,x:c.x,localData:plain(c.localData)}))},expected:{times:[0,...test.times],positions:test.positions,activeAtEnd:0,...(test.sounding?{sounding:test.sounding}:{}),...(test.mediaHost?{mediaHost:'tone handle completes at its requested duration; no physical playback'}:{})}};
  try{row.observed=observe(project,test);row.status='PASS';}catch(error){row.status='FAIL';row.error=error.stack;}
  return row;
});
const report=writeCaseReport(process.argv[2]||'audit-evidence/flow-context.json','flow-context',results);
console.log('Flow context: '+results.filter(r=>r.status==='PASS').length+'/'+results.length+' '+report.status);
if(report.status!=='PASS')process.exitCode=1;
