import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const owners={stage:'stage',button:'button-1',sprite:'sprite-1',label:'trace-label',box:'trace-box',input:'trace-input'};
const inputOrder=['run','stage click','sprite click','label click','box click','input click','input value change','keyDown a','button click with broadcast backdrop clone'];
const clean={running:false,tasks:0,ready:0,blocked:0,groups:0,keys:[]};
const finite=n=>assert.ok(Number.isFinite(n),'finite event observation');
export function recordObjectPaths(value,at='$') {
  if(value===null||typeof value!=='object')return [];
  return [at,...Object.entries(value).flatMap(([key,child])=>recordObjectPaths(child,at+'/'+key))];
}
// The manifest is the independent event-coverage oracle. Product EVENT_BY_TYPE and producer flags are not an oracle.
export function eventTraceFaults(spec) {
  assert.equal(spec.keys.length,37);
  return spec.keys.map((id,index)=>{
    const match=/^event-trace:(stage|button|sprite|label|box|input):([A-Za-z]+)$/.exec(id);
    assert.ok(match,'event manifest key');
    return {index,type:match[1],targetId:owners[match[1]],event:match[2]};
  });
}
export function verifyEventTraces(report,spec,inputs,{artifactDir,readArtifact}={}) {
  const faults=eventTraceFaults(spec),suffixes=['stop',...faults.map(f=>'error-'+f.index)],files=suffixes.flatMap(s=>['code','blocks'].map(m=>'event-trace-'+m+'-'+s+'.json'));
  assert.equal(new Set(report.traceFiles).size,76,'unique event artifacts');
  assert.deepEqual([...report.traceFiles].sort(),[...files].sort(),'complete canonical event artifact set');
  if(!readArtifact){
    assert.ok(artifactDir,'event artifacts are required');
    readArtifact=name=>{
      assert.equal(path.basename(name),name);const file=path.resolve(artifactDir,name);
      assert.equal(path.dirname(file),path.resolve(artifactDir));assert.ok(fs.lstatSync(file).isFile(),'regular event artifact');
      return JSON.parse(fs.readFileSync(file,'utf8'));
    };
  }
  for(const [i,row] of report.results.entries()){
    const f=faults[i];assert.equal(row.id,spec.keys[i]);
    assert.deepEqual(row.negative,{index:i,targetId:f.targetId,event:f.event,code:'R401',deepFrozen:true,detachedUnderTestOwnedMutation:true,terminalControlsUnavailable:true,noProgressPastDeadline:true,stopCleanup:true,modeTraceEqual:true});
    for(const key of ['initialProjectEqual','realGuiBodyEdit','realDomEventInput','fixedClock'])assert.equal(row[key],true,key);
    assert.equal(row.fixedSeed,12345);
    assert.deepEqual(row.compared,['command order','wait/block/unblock','error R401','explicit stop/delete','random calls/state/value','final runtime','stop cleanup']);
  }
  const all=new Map();
  for(const suffix of suffixes)for(const mode of ['code','blocks']){
    const data=readArtifact('event-trace-'+mode+'-'+suffix+'.json'),fault=suffix==='stop'?null:faults[Number(suffix.slice(6))];
    all.set(mode+'-'+suffix,data);
    assert.deepEqual(data.snapshot,inputs,'event artifact snapshot');assert.equal(data.mode,mode);
    assert.deepEqual(data.fault,fault?{index:fault.index,targetId:fault.targetId,event:fault.event}:null);
    assert.deepEqual(data.postStopProject,data.confirmedProject,'event source unchanged after Stop');
    assert.ok(Array.isArray(data.confirmedProject?.scripts)&&data.confirmedProject.scripts.length>=37,'confirmed event fixture');
    assert.deepEqual(data.cleanup,clean);
    assert.equal(data.finalRuntime.seed,12345);assert.equal(data.finalRuntime.errors,fault?1:0);
    assert.deepEqual(data.guiBodyEdits,mode==='code'?[]:(fault?[fault]:faults).map(f=>'event:'+f.type+':'+f.event));
    assert.ok(data.inputs.length>=1&&data.inputs.length<=inputOrder.length);assert.deepEqual(data.inputs.map(x=>x.label),inputOrder.slice(0,data.inputs.length));
    if(!fault)assert.equal(data.inputs.length,inputOrder.length);
    data.inputs.forEach(x=>finite(x.time));
    const trace=data.trace;assert.ok(Array.isArray(trace)&&trace.length>0);assert.equal(trace[0].kind,'start');assert.equal(trace[0].seed,12345);
    let previousTime=-Infinity,random=12345;
    for(const item of trace){finite(item.time);assert.ok(item.time>=previousTime,'ordered external clock');previousTime=item.time;
      if(item.kind==='random'){assert.equal(item.before,random);assert.equal(item.after,(random+0x6d2b79f5)>>>0);assert.ok(Number.isInteger(item.value)&&item.value>=0&&item.value<2**32);random=item.after;}
    }
    assert.equal(data.finalRuntime.random,random);
    for(const f of fault?[fault]:faults){
      const events=trace.filter(x=>x.task?.targetId===f.targetId&&x.task?.event===f.event);
      assert.ok(events.some(x=>x.kind==='command'),'event command');assert.equal(events.filter(x=>x.kind==='random').length,2,'two event random draws');
      for(const kind of ['block','unblock'])assert.ok(events.some(x=>x.kind===kind&&x.reason?.kind==='time'),'event time '+kind);
      if(!fault){assert.ok(events.some(x=>x.kind==='command'&&((x.node.kind==='StopCommand'&&x.node.op==='THIS')||(x.node.kind==='CloneCommand'&&x.node.op==='DELETE_SELF'))),'explicit event stop');assert.ok(events.some(x=>x.kind==='finish'&&x.state==='DONE'));}
    }
    const failures=trace.filter(x=>x.kind==='error');assert.equal(failures.length,fault?1:0);
    if(!fault){
      assert.equal(data.terminal,null);
      assert.deepEqual(trace.find(x=>x.kind==='say'&&x.value==='滑走中')?.actors.find(a=>a.id==='sprite-1'),{id:'sprite-1',x:50,y:100});
      assert.ok(trace.some(x=>x.kind==='unblock'&&x.reason?.kind==='glide'));
      continue;
    }
    const terminal=data.terminal,record=terminal.record,error=failures[0],at=trace.indexOf(error);
    assert.equal(error.code,'R401');assert.equal(error.task.targetId,fault.targetId);assert.equal(error.task.event,fault.event);
    assert.equal(record.code,'R401');assert.equal(record.key,'script:'+fault.targetId+':'+fault.event);assert.equal(record.targetId,fault.targetId);assert.equal(record.eventType,fault.event);
    assert.equal(record.taskId,error.task.taskId);assert.equal(record.runtimeId,error.task.runtimeId);
    const source=data.confirmedProject.scripts.find(s=>(s.id?'script:'+s.id:'script:'+s.targetId+':'+s.event)===record.key)?.source;
    assert.equal(record.source,source);assert.equal(record.statement,source.split('\n')[record.line-1]);assert.equal(record.line,error.line);
    assert.ok(!trace.slice(at+1).some(x=>['command','random','resume'].includes(x.kind)),'terminal failure cannot progress');
    assert.ok(trace.slice(at+1).some(x=>x.kind==='stop'),'native Stop observed');
    assert.equal(terminal.deepFrozen,true);assert.equal(terminal.paused,true);finite(terminal.pausedAt);finite(terminal.clock);
    assert.deepEqual(terminal.frozenPaths,recordObjectPaths(record).map(path=>({path,frozen:true})),'nested freeze observations');
    assert.deepEqual(terminal.controls,['pauseBtn','continueBtn','stepBtn'].map(id=>({id,visible:false,disabled:true})));
    assert.equal(terminal.externalClockAfter-terminal.externalClock,1000000);
    assert.deepEqual(terminal.afterDeadline,Object.fromEntries(['clock','traceLength','random','ready','tasks'].map(key=>[key,terminal[key]])));
    for(const key of ['traceLength','ready','tasks'])assert.ok(Number.isInteger(terminal[key])&&terminal[key]>=0);
    assert.ok(terminal.traceLength>at&&terminal.traceLength<trace.length);
    assert.equal(terminal.random,data.finalRuntime.random);
    const probe=terminal.detachment;
    assert.deepEqual(probe.before,{score:new Map(record.projectVariables).get('点数'),list:new Map(record.projectLists).get('名前一覧')});
    assert.deepEqual(probe.during,{score:999,list:[...probe.before.list,'test-owned-record-probe']});assert.notEqual(probe.before.score,999);
    assert.deepEqual(probe.after,probe.before);
    for(const retained of [probe.recordDuring,probe.recordAfterRestore,terminal.recordAfterStop])assert.deepEqual(retained,record,'retained failure snapshot');
    assert.equal(terminal.detachedUnderTestOwnedMutation,true);
  }
  for(const suffix of suffixes){
    const a=all.get('code-'+suffix),b=all.get('blocks-'+suffix);
    for(const key of ['confirmedProject','postStopProject','inputs','trace','finalRuntime','cleanup','terminal'])assert.deepEqual(a[key],b[key],'code/blocks event '+key);
  }
  return {events:37,scenarios:76};
}
