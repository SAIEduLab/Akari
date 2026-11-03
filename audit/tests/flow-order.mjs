// Run with: node audit/tests/flow-order.mjs
// Observes the generated product's scheduler with a controlled logical clock.
import {writeCaseReport} from '../lib/gate-case-contract.mjs';
import assert from 'node:assert/strict';

import {loadAssistApi} from '../lib/code-assist-host.mjs';
const A=loadAssistApi(), plain=value=>JSON.parse(JSON.stringify(value));
const tests=[];
function define(id,source,times,positions,options={}){
  tests.push({id,source,times,positions,...options});
}
const start=[0,100,200], dogMoved=[0,110,200], allMoved=[10,110,210];
for(const meijin of [false,true])for(const [name,join] of [['newline','。\n'],['period','。'],['te','待って、'],['tekara','待ってから、']]){
  const prefix=join.startsWith('待')?'ねこは1秒'+join:'ねこは1秒待つ'+join;
  define('subject-sequential/'+meijin+'/'+name,prefix+'犬は10歩進む。ねこは10歩進む。鳥は10歩進む。',[999,1000],[start,start,allMoved],{meijin});
}
for(const [name,source] of [
  ['omitted','1秒待つ。犬は10歩進む。'],
  ['self','自分は1秒待つ。犬は10歩進む。'],
  ['named','ねこは1秒待つ。犬は10歩進む。'],
  ['after-topic','ねこは「a」と言う。1秒待つ。犬は10歩進む。'],
])define('wait-subject-presence/'+name,source,[999,1000],[start,start,dogMoved]);
define('independent-events','ねこは1秒待つ。犬は10歩進む。',[999,1000],[[0,100,210],[0,100,210],[0,110,210]],{
  extraScripts:[{id:'independent',targetId:'review-2',event:'start',source:'鳥は10歩進む。'}],
});
define('condition-explicit-subject','ねこは、点数が1になるまで待つ。犬は10歩進む。',[499,500],[start,start,dogMoved],{
  extraScripts:[{id:'signal',targetId:'review-2',event:'start',source:'0.5秒待つ。点数を1にする。'}],
});
define('repeat-wait','2回くり返す。\n  ねこは0.5秒待つ。\n  犬は10歩進む。\n鳥は10歩進む。',[499,500,999,1000],[start,start,dogMoved,dogMoved,[0,120,210]]);
define('parallel-trailing-wait','次のことを同時に始める。\n  ねこは1秒待つ。\n  犬は10歩進む。\n鳥は10歩進む。',[999,1000],[dogMoved,dogMoved,[0,110,210]],{meijin:true});
define('parallel-nested-tail','次のことを同時に始める。\n  次のことを同時に始める。\n    ねこは1秒待つ。\n    犬は10歩進む。\n  鳥は10歩進む。\nねこは10歩進む。',[999,1000],[[0,110,210],[0,110,210],allMoved],{meijin:true});
for(const meijin of [false,true]){
  define('condition-connective/'+meijin,'ねこは、点数が1になるまで待ってから、犬は10歩進む。',[499,500],[start,start,dogMoved],{
    meijin,extraScripts:[{id:'signal',targetId:'review-2',event:'start',source:'0.5秒待つ。点数を1にする。'}],
  });
  define('broadcast-trailing-subject-wait/'+meijin,'ねこは「出発」の合図を送って、その合図で始まったことが全部終わるまで待つ。犬は10歩進む。',[999,1000],[start,start,dogMoved],{
    meijin,extraScripts:[{id:'receive',targetId:'review-2',event:'message',source:'「出発」という合図を受けたとき、\n  鳥は1秒待つ。'}],
  });
  define('serial-double-wait/'+meijin,'ねこは0.5秒待つ。犬は0.5秒待つ。鳥は10歩進む。',[499,500,999,1000],[start,start,start,start,[0,100,210]],{meijin});
}
define('parallel-condition','次のことを同時に始める。\n  ねこは、点数が1になるまで待つ。\n  犬は0.5秒待って、点数を1にする。\n鳥は10歩進む。',[499,500],[start,start,[0,100,210]],{meijin:true});
define('parallel-time-durations','次のことを同時に始める。\n  ねこは0.5秒待って、10歩進む。\n  犬は1秒待って、10歩進む。\n鳥は10歩進む。',[499,500,999,1000],[start,start,[10,100,200],[10,100,200],allMoved],{meijin:true});
define('aida','ねこが1秒待つあいだ、犬は10歩進む。\n鳥は10歩進む。',[999,1000],[dogMoved,dogMoved,[0,110,210]],{meijin:true});
define('nagara','ねこは1秒待ちながら、10歩進む。\n犬は10歩進む。',[999,1000],[[10,100,200],[10,100,200],[10,110,200]],{meijin:true});
define('same-actor-independent','ねこは1秒待つ。犬は10歩進む。',[999,1000],[[10,100,200],[10,100,200],[10,110,200]],{
  extraScripts:[{id:'same-actor',targetId:'review-0',event:'start',source:'ねこは10歩進む。'}],
});
for(const meijin of [false,true]){
  define('procedure-trailing-wait/'+meijin,'ねこは【休む】という手順を行う。犬は10歩進む。',[999,1000],[start,start,dogMoved],{
    meijin,actions:[{id:'rest-action',ownerId:'stage',name:'休む',args:[],source:'ねこは1秒待つ。'}],
  });
  define('statement-order/'+meijin,'ねこは1秒待つ。犬は10歩進む。ねこは10歩進む。鳥は10歩進む。',[999,1000],[start,start,allMoved],{
    meijin,movementOrder:[['review-1',1000],['review-0',1000],['review-2',1000]],
  });
}
define('nested-procedure','ねこは【外】という手順を行う。犬は10歩進む。',[999,1000],[start,start,dogMoved],{
  actions:[{id:'outer',ownerId:'stage',name:'外',args:[],source:'鳥は【内】という手順を行う。'},{id:'inner',ownerId:'stage',name:'内',args:[],source:'自分は1秒待つ。'}],
});
define('procedure-in-lane','次のことを同時に始める。\n  ねこは【休む】という手順を行う。\n  犬は10歩進む。\n鳥は10歩進む。',[999,1000],[dogMoved,dogMoved,[0,110,210]],{
  meijin:true,actions:[{id:'rest',ownerId:'stage',name:'休む',args:[],source:'自分は1秒待つ。'}],
});
define('named-wait-evaluates-named-locals','ねこは待ち時間秒待つ。犬は10歩進む。',[999,1000],[start,start,dogMoved],{owner:'review-1',localWaits:true});
define('zero-time','ねこは0秒待つ。犬は10歩進む。',[],[dogMoved]);
define('condition-already-true','ねこは、点数が0になるまで待つ。犬は10歩進む。',[],[dogMoved]);
define('nested-loop-with-wait','2回くり返す。\n  2回くり返す。\n    ねこは0.25秒待つ。\n    犬は10歩進む。\n鳥は10歩進む。',[249,250,499,500,749,750,999,1000],[
  start,start,[0,110,200],[0,110,200],[0,120,200],[0,120,200],[0,130,200],[0,130,200],[0,140,210],
]);

function world(test){
  const p=A.makeEmptyProject(), first=plain(p.components[0]);
  p.components=['ねこ','犬','鳥'].map((name,i)=>{
    const a=plain(first);Object.assign(a,{id:'review-'+i,name,x:i*100,y:100,direction:0});
    a.costumes=[{id:'review-costume-'+i,name:'文字',kind:'text',value:name}];a.costumeId='review-costume-'+i;
    a.localData={variables:[],lists:[]};return a;
  });
  p.projectData={variables:[{id:'review-score',name:'点数',initialValue:0}],lists:[]};
  p.scripts=[{id:'review-main',targetId:test.meijin?'meijin':test.owner||'review-0',...(test.meijin?{mode:'meijin'}:{}),event:'start',source:test.source},...plain(test.extraScripts||[])];
  p.actions=plain(test.actions||[]);p.functions=[];
  if(test.localWaits){
    p.components[0].localData.variables=[{id:'cat-delay',name:'待ち時間',initialValue:1}];
    p.components[1].localData.variables=[{id:'dog-delay',name:'待ち時間',initialValue:2}];
  }
  return p;
}
function harness(p){
  const before=JSON.stringify(p), compiled=A.compileProject(p);
  assert.deepEqual(plain(compiled.errors),[],'compilation failed');
  const runtime=new A.RuntimeModel(p,{}), speech=[], errors=[], steps=[];let clock=0;
  runtime.now=()=>clock;
  const scheduler=new A.EventScheduler(p,compiled,runtime,{
    say:(id,text)=>speech.push({part:p.components.find(c=>c.id===id)?.name||id,text,time:clock}),
    runtimeError:(task,e)=>errors.push({code:e.code,message:e.message}),
    beforeStatement:(task,n)=>steps.push({kind:n.kind,part:task.subject?.runtimeId,time:clock}),
  });
  scheduler.schedule=()=>{};
  const pump=()=>{
    let n=0;while(scheduler.ready.length&&n++<10000)scheduler.runTurn(true);
    assert.ok(n<10000,'finite test exceeded statement bound');
    assert.deepEqual(errors,[],'runtime errors');
    assert.equal(JSON.stringify(p),before,'design project was mutated');
  };
  const capture=()=>({time:clock,positions:p.components.map(c=>runtime.actor(c.id)?.x),speech:plain(speech),active:scheduler.tasks.size});
  return {
    scheduler,steps,capture,
    start(){scheduler.start();pump();},
    at(t){clock=t;scheduler.advanceContinuous(t);scheduler.recheckBlocked(true);pump();},
    stop(){scheduler.stop();},
  };
}
const results=[];
for(const test of tests){
  const project=world(test), observed=[];
  const entry={
    id:test.id,
    input:{scripts:plain(project.scripts),actions:plain(project.actions),parts:project.components.map(c=>({id:c.id,name:c.name,x:c.x,y:c.y,direction:c.direction,localData:plain(c.localData)})),projectData:plain(project.projectData)},
    expected:{times:[0,...test.times],positions:plain(test.positions),activeAtEnd:0,...(test.movementOrder?{movementOrder:test.movementOrder}:{})},
  };
  let h;
  try{
    h=harness(project);h.start();observed.push(h.capture());
    for(const t of test.times){h.at(t);observed.push(h.capture());}
    assert.deepEqual(observed.map(s=>s.positions),test.positions,'positions at each time');
    assert.equal(observed.at(-1).active,0,'all finite tasks must finish');
    if(test.movementOrder)assert.deepEqual(h.steps.filter(s=>s.kind==='MotionCommand').map(s=>[s.part,s.time]),test.movementOrder,'statement order');
    entry.status='PASS';
  }catch(error){entry.status='FAIL';entry.error=error.message;}
  finally{entry.observed=observed;entry.steps=h?.steps||[];h?.stop();}
  results.push(entry);
}
assert.equal(results.length,38);
const report=writeCaseReport(process.argv[2]||'audit-evidence/flow-order.json','flow-order',results,{environment:'Node VM / actual product / logical clock'});
for(const failure of results.filter(r=>r.status==='FAIL'))console.error(failure.id+': '+failure.error);
console.log('Flow order: '+results.filter(r=>r.status==='PASS').length+'/'+results.length+' '+report.status);
if(report.status!=='PASS')process.exitCode=1;
