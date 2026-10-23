// Hand-authored protocol fixtures for the consumer, never product-execution evidence.
// Coverage keys are supplied by the independently declared browser manifest.
export function eventReportFixture(spec,inputs) {
  const owner={stage:'stage',button:'button-1',sprite:'sprite-1',label:'trace-label',box:'trace-box',input:'trace-input'};
  const faults=spec.keys.map((key,index)=>{const [,type,event]=key.split(':');return {index,type,targetId:owner[type],event};});
  const files={},clone=x=>structuredClone(x),labels=['run','stage click','sprite click','label click','box click','input click','input value change','keyDown a','button click with broadcast backdrop clone'];
  for(const fault of [null,...faults])for(const mode of ['code','blocks']){
    const suffix=fault?'error-'+fault.index:'stop',trace=[{kind:'start',time:100000,seed:12345}],selected=fault?[fault]:faults;let random=12345;
    const sourceFor=f=>['名前一覧のさいごに1から100000のどれかを入れる。','0.1秒待つ。','名前一覧のさいごに1から100000のどれかを入れる。',fault?.index===f.index?'1÷0を言う。':f.event==='cloneStart'?'このコピーだけを消す。':'この動きを止める。'].join('\n');
    for(const f of selected){
      const task={taskId:'fixture-'+f.index,targetId:f.targetId,runtimeId:f.event==='cloneStart'?'fixture-clone':f.targetId,event:f.event};
      const add=(kind,extra={})=>trace.push({kind,time:100100,task:clone(task),...extra});
      const draw=()=>{const before=random;random=(random+0x6d2b79f5)>>>0;add('random',{before,after:random,value:123});};
      add('command',{node:{kind:'ListAppend',op:null,line:1}});draw();add('block',{reason:{kind:'time'}});add('unblock',{reason:{kind:'time'}});draw();
      if(fault){add('command',{node:{kind:'Say',op:null,line:4}});add('error',{code:'R401',line:4});add('finish',{state:'ERROR'});}
      else{add('command',{node:{kind:f.event==='cloneStart'?'CloneCommand':'StopCommand',op:f.event==='cloneStart'?'DELETE_SELF':'THIS',line:4}});add('finish',{state:'DONE'});}
    }
    if(!fault){trace.push({kind:'say',time:100100,value:'滑走中',actors:[{id:'sprite-1',x:50,y:100}]},{kind:'unblock',time:100100,reason:{kind:'glide'}});}
    let terminal=null;
    if(fault){
      const record={id:1,taskId:'fixture-'+fault.index,targetId:fault.targetId,runtimeId:fault.event==='cloneStart'?'fixture-clone':fault.targetId,eventType:fault.event,code:'R401',key:'script:'+fault.targetId+':'+fault.event,line:4,statement:'1÷0を言う。',source:sourceFor(fault),projectVariables:[['点数',1]],projectLists:[['名前一覧',['snapshot']]]};
      const core={clock:100100,traceLength:trace.length,random,ready:2,tasks:2};
      terminal={record,deepFrozen:true,paused:true,pausedAt:100100,...core,externalClock:100100,externalClockAfter:1100100,afterDeadline:clone(core),controls:['pauseBtn','continueBtn','stepBtn'].map(id=>({id,visible:false,disabled:true})),frozenPaths:['$','$/projectVariables','$/projectVariables/0','$/projectLists','$/projectLists/0','$/projectLists/0/1'].map(path=>({path,frozen:true})),detachedUnderTestOwnedMutation:true,detachment:{before:{score:1,list:['snapshot']},during:{score:999,list:['snapshot','test-owned-record-probe']},after:{score:1,list:['snapshot']},recordDuring:clone(record),recordAfterRestore:clone(record)},recordAfterStop:clone(record)};
    }
    trace.push({kind:'stop',time:fault?1100100:100100});
    const project={scripts:faults.map(f=>({targetId:f.targetId,event:f.event,source:sourceFor(f)}))};
    files['event-trace-'+mode+'-'+suffix+'.json']={snapshot:clone(inputs),mode,fault:fault?{index:fault.index,targetId:fault.targetId,event:fault.event}:null,confirmedProject:project,postStopProject:clone(project),trace,inputs:(fault?labels.slice(0,1):labels).map(label=>({label,time:100000})),finalRuntime:{seed:12345,random,errors:fault?1:0},cleanup:{running:false,tasks:0,ready:0,blocked:0,groups:0,keys:[]},guiBodyEdits:mode==='code'?[]:selected.map(f=>'event:'+f.type+':'+f.event),terminal};
  }
  return {files,report:{browser:'fixture-browser',results:faults.map(f=>({id:spec.keys[f.index],pass:true,initialProjectEqual:true,realGuiBodyEdit:true,realDomEventInput:true,fixedSeed:12345,fixedClock:true,compared:['command order','wait/block/unblock','error R401','explicit stop/delete','random calls/state/value','final runtime','stop cleanup'],negative:{index:f.index,targetId:f.targetId,event:f.event,code:'R401',deepFrozen:true,detachedUnderTestOwnedMutation:true,terminalControlsUnavailable:true,noProgressPastDeadline:true,stopCleanup:true,modeTraceEqual:true}})),traceFiles:Object.keys(files),pageErrors:[],networkRequests:[]}};
}

export const eventReportMutations=[
 ['negative-missing',x=>delete x.report.results[0].negative],
 ['negative-false',x=>x.report.results[0].negative.noProgressPastDeadline=false],
 ['negative-owner',x=>x.report.results[36].negative.targetId='stage'],
 ['gui-false',x=>x.report.results[0].realGuiBodyEdit=false],
 ['seed-wrong',x=>x.report.results[0].fixedSeed=99],
 ['files-missing',x=>x.report.traceFiles.pop()],
 ['files-duplicate',x=>x.report.traceFiles[1]=x.report.traceFiles[0]],
 ['path-escape',x=>x.report.traceFiles[0]='../event-trace-code-stop.json'],
 ['artifact-missing',x=>delete x.files['event-trace-code-stop.json']],
 ['artifact-snapshot',x=>both(x,'error-0',d=>d.snapshot.productSha256='b'.repeat(64))],
 ['artifact-fault',x=>both(x,'error-36',d=>d.fault.event='start')],
 ['source-changed',x=>both(x,'stop',d=>d.postStopProject.scripts[0].source='何もしない。')],
 ['cleanup-incomplete',x=>both(x,'error-0',d=>d.cleanup.ready=2)],
 ['body-edit-missing',x=>x.files['event-trace-blocks-error-36.json'].guiBodyEdits=[]],
 ['input-unordered',x=>both(x,'stop',d=>d.inputs.reverse())],
 ['random-missing',x=>both(x,'stop',d=>d.trace.splice(d.trace.findIndex(e=>e.kind==='random'),1))],
 ['wait-missing',x=>both(x,'stop',d=>d.trace=d.trace.filter(e=>e.kind!=='unblock'||e.reason?.kind!=='time'))],
 ['explicit-stop-missing',x=>both(x,'stop',d=>d.trace=d.trace.filter(e=>e.node?.kind!=='StopCommand'))],
 ['midpoint-wrong',x=>both(x,'stop',d=>d.trace.find(e=>e.kind==='say').actors[0].x=100)],
 ['terminal-missing',x=>both(x,'error-0',d=>d.terminal=null)],
 ['failure-code',x=>both(x,'error-0',d=>d.trace.find(e=>e.kind==='error').code='R411')],
 ['record-task',x=>both(x,'error-0',d=>d.terminal.record.taskId='other-task')],
 ['record-source',x=>both(x,'error-0',d=>d.terminal.record.source='何もしない。')],
 ['post-error-command',x=>both(x,'error-0',d=>d.trace.splice(d.trace.length-1,0,{kind:'command',time:100100,task:{},node:{kind:'Say'}}))],
 ['frozen-child-false',x=>both(x,'error-0',d=>d.terminal.frozenPaths.at(-1).frozen=false)],
 ['frozen-child-missing',x=>both(x,'error-0',d=>d.terminal.frozenPaths.pop())],
 ['control-enabled',x=>both(x,'error-0',d=>d.terminal.controls[1].disabled=false)],
 ['deadline-not-advanced',x=>both(x,'error-0',d=>d.terminal.externalClockAfter=d.terminal.externalClock)],
 ['deadline-progress',x=>both(x,'error-0',d=>d.terminal.afterDeadline.clock++)],
 ['mutation-not-applied',x=>both(x,'error-0',d=>d.terminal.detachment.during.score=1)],
 ['record-mutated',x=>both(x,'error-0',d=>d.terminal.detachment.recordDuring.projectVariables[0][1]=999)],
 ['record-after-stop',x=>both(x,'error-0',d=>d.terminal.recordAfterStop.projectLists[0][1].push('changed'))],
 ['mode-diverged',x=>x.files['event-trace-blocks-stop.json'].inputs[0].time++],
];
function both(fixture,suffix,mutate){for(const mode of ['code','blocks'])mutate(fixture.files['event-trace-'+mode+'-'+suffix+'.json']);}
