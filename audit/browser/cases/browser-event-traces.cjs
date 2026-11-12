const {pressStop}=require('../../lib/stop-press.cjs');
const {chooseView}=require('./view-toggle.cjs');
const {answerProductConfirms}=require('../../lib/product-dialogs.cjs');
const {makeRegressionProject, setupRegressionPage, openRegressionEditor, installRegressionFactory} = require('./regression-setup.cjs');
const {openBodyForTest} = require('./regression-setup.cjs');
const L=require('./audit-lib.cjs'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const{chromium}=require('playwright');
(async()=>{
 const dir=L.path.resolve(process.argv[2]||'audit-evidence/browser/candidate'),manifest=L.verifyManifest(dir),url=pathToFileURL(L.path.join(dir,manifest.candidate)).href,results=[],traces={},errors=[],network=[];
 const browser=await chromium.launch({executablePath:(process.env.AKARI_BROWSER||undefined),headless:true,args:['--allow-file-access-from-files']});
 const snapshot=require('../../lib/input-snapshot.cjs').snapshot(manifest.candidate);assert.equal(snapshot.productSha256,manifest.head);
 const api=L.loadApi(L.read(L.path.join(dir,manifest.candidate))),objects=[{id:'stage',type:'stage'},{id:'button-1',type:'button'},{id:'sprite-1',type:'sprite'},{id:'trace-label',type:'label'},{id:'trace-box',type:'box'},{id:'trace-input',type:'input'}],events=JSON.parse(JSON.stringify(api.EVENT_BY_TYPE)),expected=objects.flatMap(o=>events[o.type].map(event=>({id:'event:'+o.type+':'+event,...o,event}))),fixtures={};assert.equal(expected.length,37);
 function fixture(mode,error,fault){const p=makeRegressionProject(api),defaultSpriteName=p.components.find(x=>x.id==='sprite-1').name;p.name='全イベント観測';p.scripts=[];p.projectData.lists.find(x=>x.name==='名前一覧').initialValue=[];p.projectData.variables.find(x=>x.name==='点数').initialValue=error?1:0;
  // Positions are centres from the bottom-left corner. No part touches an edge when the run starts, so each ふれたとき
  // body starts exactly once: the sprite's when its start body goes to (0, 0), the others' when their click (the input's
  // value change) moves them off the right edge. Keep every part clear of the sprite's settled (100, 200) bounds
  // (よこ 10..190, たて 110..290) and of the stage click point (590, 60) at every zoom.
  p.components.find(x=>x.id==='button-1').x=300;p.components.find(x=>x.id==='button-1').y=60;p.components.find(x=>x.id==='sprite-1').x=420;p.components.find(x=>x.id==='sprite-1').y=200;
  const button=p.components.find(x=>x.id==='button-1');for(const[id,type,x,y]of [['trace-label','label',300,140],['trace-box','box',480,60],['trace-input','input',480,140]])p.components.push({...JSON.parse(JSON.stringify(button)),id,type,name:type==='input'?'入力欄1':type==='box'?'四角1':'文字1',x,y,w:140,h:36,text:type==='input'?'初期入力':type,localData:{variables:[],lists:[]}});
  if(p.stage.backdrops.length<2)p.stage.backdrops.push({id:'trace-backdrop',name:'第二背景',kind:'color',value:'#ffffff'});
  for(const e of expected){const tag=e.type+':'+e.event;let source='名前一覧に「'+(mode==='blocks'&&(!fault||(e.id===fault.id&&e.event===fault.event))?'編集中':tag)+'」を追加する\n名前一覧に乱数（1、100000）を追加する\n0.1秒待つ\n名前一覧に乱数（1、100000）を追加する';
   if(e.type==='sprite'&&e.event==='start')source+='\n画面の左下のはしから、右へ0歩、上へ0歩のばしょへ行く\n0.1秒かけて、画面の左下のはしから、右へ100歩、上へ200歩のばしょへ行く';
   if(e.type==='stage'&&e.event==='start')source+='\n0.05秒待つ\n「滑走中」と言う\n0.05秒待つ';
   if(e.type==='button'&&e.event==='click')source+='\nみんなに「観測知らせ」と知らせて、知らせを受けて始めたことが全部終わるまで待つ\n次の背景にする\n「'+defaultSpriteName+'」のコピーを作る';
   const sensor={message:'受け取った知らせ',keyDown:'押されたキー',valueChanged:'新しい値',backdropChanged:'新しい背景名'}[e.event];if(sensor)source+='\n名前一覧に'+sensor+'を追加する';
   if((e.event==='click'&&['button','label','box'].includes(e.type))||(e.type==='input'&&e.event==='valueChanged'))source+='\nいまのばしょから、右へ1000歩動く';
   source+='\nもし 点数が'+(fault&&(e.id!==fault.id||e.event!==fault.event)?2:1)+'と同じなら、次のことをする\n  1÷0を言う\n名前一覧に「完了:'+tag+'」を追加する';
   if(e.event==='cloneStart')source+='\nこのコピーだけを消す';else source+='\nこのスクリプトを止める';
   const ast=api.parseSyntax(source).ast;assert.ok(ast);p.scripts.push({targetId:e.id,event:e.event,...(e.event==='touchStart'?{filter:{target:'端'}}:{}),source:api.formatScript(ast)});
  }assert.deepEqual(JSON.parse(JSON.stringify(api.compileProject(p).errors)),[]);return p;
 }
 // The observer calls every original method. Only the external clock and seed
 // are controlled; event input, scheduling, execution, waits and UI stay real.
 async function installObserver(page){await page.evaluate(()=>{
  window.__trace=[];window.__activeTraceTask=null;window.__q=null;
  const copy=x=>JSON.parse(JSON.stringify(x)),task=t=>t?{taskId:t.taskId,targetId:t.targetId,runtimeId:t.runtimeId,event:t.eventType,context:copy(t.eventContext)}:null;
  const record=(kind,data={})=>__trace.push({kind,time:window.__auditClock,...data});
  const Q=Akari.EventScheduler.prototype;
  const start=Q.start;Q.start=function(...args){window.__q=this;record('start',{seed:this.runtime.runSeed});const say=this.ui.say;this.ui.say=(id,value)=>{record('say',{runtimeId:id,value,actors:[...this.runtime.actors].map(([id,a])=>({id,x:a.x,y:a.y}))});return say?.(id,value);};return start.apply(this,args);};
  const create=Q.createTask;Q.createTask=function(...args){const t=create.apply(this,args);if(t)record('spawn',{task:task(t)});return t;};
  const execute=Q.executeNode;Q.executeNode=function(t,n){window.__activeTraceTask=t;record('command',{task:task(t),node:{kind:n.kind,op:n.op||null,line:n.sourceSpan?.startLine}});try{return execute.call(this,t,n);}finally{record('after',{task:task(t),state:t.state,lists:[...this.runtime.projectLists].map(([name,value])=>[name,copy(value)]),randomState:this.runtime.prng.state});window.__activeTraceTask=null;}};
  for(const name of ['block','unblock']){const fn=Q[name];Q[name]=function(t,reason){record(name,{task:task(t),reason:copy(reason||t.blockReason||null)});return fn.apply(this,arguments);};}
  const finish=Q.finishTask;Q.finishTask=function(t,state){record('finish',{task:task(t),state});return finish.apply(this,arguments);};
  const fail=Q.taskError;Q.taskError=function(t,error){record('error',{task:task(t),code:error.code,message:error.message,line:t.currentNode?.sourceSpan?.startLine});return fail.apply(this,arguments);};
  for(const name of ['pause','resume','stop']){const fn=Q[name];Q[name]=function(){record(name,{running:this.running,paused:this.paused,ready:this.ready.map(t=>t.taskId),blocked:[...this.blocked].map(t=>({taskId:t.taskId,reason:copy(t.blockReason)})),keys:[...this.runtime.pressedKeys]});return fn.apply(this,arguments);};}
  const next=Akari.PRNG.prototype.nextUint32;Akari.PRNG.prototype.nextUint32=function(){const before=this.state,value=next.call(this);record('random',{task:task(window.__activeTraceTask),before,after:this.state,value});return value;};
 });}
 class TerminalTrace extends Error {}
 async function settle(page){for(let step=0;step<150;step++){
   await page.waitForFunction(()=>window.__q&&(window.__q.paused||window.__q.ready.length===0));
   const s=await page.evaluate(()=>({paused:__q.paused,ready:__q.ready.length,blocked:[...__q.blocked].map(t=>({kind:t.blockReason.kind,deadline:t.blockReason.deadline})),tasks:__q.tasks.size}));
   if(s.paused){assert.ok(await page.locator('#failureModal.show').count(),'an unexpected ordinary pause cannot settle');throw new TerminalTrace('runtime failure is terminal');}
   if(s.ready){await page.waitForTimeout(20);continue;}
   if(s.blocked.length){const deadlines=s.blocked.filter(x=>['time','glide'].includes(x.kind)).map(x=>x.deadline);assert.ok(deadlines.length,'non-time deadlock '+JSON.stringify(s));await page.evaluate(deadline=>{window.__auditClock=deadline+__q.runtime.clockOffset;},Math.min(...deadlines));await page.waitForTimeout(30);continue;}
   assert.equal(s.tasks,0);return;
  }throw Error('event processing did not settle');}
 async function one(mode,error,fault=null){const key=mode+'-'+(error?'error-'+expected.indexOf(fault):'stop'),context=await browser.newContext({viewport:{width:1440,height:900}});await context.route(/^https?:\/\//,r=>{network.push(r.request().url());return r.abort();});await context.addInitScript(()=>{window.__auditClock=100000;Object.defineProperty(performance,'now',{value:()=>window.__auditClock});const fn=Crypto.prototype.getRandomValues;Crypto.prototype.getRandomValues=function(array){if(array instanceof Uint32Array&&array.length===1){array[0]=12345;return array;}return fn.call(this,array);};});const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push({key,message:e.message}));page.on('dialog',d=>d.accept(d.type()==='prompt'?d.defaultValue():undefined));await answerProductConfirms(page);
  try{await page.goto(url);await setupRegressionPage(page);const project=fixture(mode,error,fault),file=L.path.join(dir,'event-trace-'+key+'.akari.md');L.fs.writeFileSync(file,api.serializeProject(project,new api.AssetStore()));await page.locator('#fileInput').setInputFiles(file);await page.waitForFunction(()=>Akari.app.project.name==='全イベント観測');const edited=[];
   for(const e of (fault?[fault]:expected)){await (await reveal(page.locator('#objectSelect'))).selectOption(e.id);await (await reveal(page.locator('#eventSelect'))).selectOption(e.event);await chooseView(page,mode,{open:openBodyForTest});if(mode==='blocks'){
     const node=await page.evaluate(()=>Akari.app.editorState.main.blockView.bodies.body[0].inputs.value);assert.equal(node.schemaId,'StringLiteral');const input=page.locator('#blockEditor [data-blockui-field="value"][data-block-id="'+node.id+'"]');await (await reveal(input)).fill(e.type+':'+e.event);await input.press('Enter');assert.equal(await page.evaluate(()=>Akari.app.editorState.main.pendingEdit),null);edited.push('event:'+e.type+':'+e.event);
    }assert.equal(await page.evaluate(()=>Akari.app.editorState.main.mode),mode);
   }
   const confirmed=await page.evaluate(()=>JSON.parse(JSON.stringify(Akari.app.project)));fixtures[key]=confirmed;assert.deepEqual(confirmed,JSON.parse(JSON.stringify(fixture('code',error,fault))),'confirmed GUI source matches CUI initial project');await installObserver(page);
   const inputs=[],input=async(label,fn)=>{inputs.push({label,time:await page.evaluate(()=>__auditClock)});await fn();await settle(page);};
   let terminal=null;try{
   await input('run',async()=>{await (await reveal(page.locator('#runBtn'))).click();await page.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');});
   await input('stage click',async()=>{const point=await page.locator('#formSurface').evaluate(el=>{const r=el.getBoundingClientRect(),s=Akari.app.project.stage;return{x:r.left+590*r.width/s.width,y:r.top+340*r.height/s.height};});await page.mouse.click(point.x,point.y);});
   for(const o of objects.filter(o=>!['stage','button'].includes(o.type)))await input(o.type+' click',()=>page.locator('.component[data-runtime-id="'+o.id+'"]').click());
   await input('input value change',()=>page.locator('.component[data-runtime-id="trace-input"]').fill('入力更新'));
   await input('keyDown a',async()=>{await page.locator('#formSurface').focus();await page.keyboard.press('a');});
   await input('button click with broadcast backdrop clone',()=>page.locator('.component[data-runtime-id="button-1"]').click());
   }catch(e){if(!(error&&e instanceof TerminalTrace))throw e;}
   if(error){
     await page.locator('#failureModal.show').waitFor();
     terminal=await page.evaluate(()=>{const r=window.__terminalRecord=__q.errorRecords[0],frozenPaths=[],frozen=(o,path='$')=>{if(o===null||typeof o!=='object')return true;const value=Object.isFrozen(o);frozenPaths.push({path,frozen:value});return Object.entries(o).map(([k,v])=>frozen(v,path+'/'+k)).every(Boolean)&&value;},deepFrozen=frozen(r);return{record:JSON.parse(JSON.stringify(r)),deepFrozen,frozenPaths,externalClock:__auditClock,paused:__q.paused,pausedAt:__q.runtime.pausedAt,clock:__q.runtime.now(),traceLength:__trace.length,random:__q.runtime.prng.state,ready:__q.ready.length,tasks:__q.tasks.size};});
     assert.equal(terminal.record.code,'R401');assert.equal(terminal.record.key,'script:'+fault.id+':'+fault.event);assert.equal(terminal.deepFrozen,true);assert.equal(terminal.paused,true);assert.ok(Number.isFinite(terminal.pausedAt));
     await page.locator('#failureClose').click();terminal.controls=[];for(const id of ['pauseBtn','continueBtn','stepBtn']){const visible=await page.locator('#'+id).isVisible(),disabled=await page.locator('#'+id).isDisabled();terminal.controls.push({id,visible,disabled});assert.equal(visible,false);assert.equal(disabled,true);}
     await page.evaluate(()=>window.__auditClock+=1000000);await page.waitForTimeout(150);
     terminal.afterDeadline=await page.evaluate(()=>({clock:__q.runtime.now(),traceLength:__trace.length,random:__q.runtime.prng.state,ready:__q.ready.length,tasks:__q.tasks.size}));terminal.externalClockAfter=await page.evaluate(()=>__auditClock);assert.deepEqual(terminal.afterDeadline,{clock:terminal.clock,traceLength:terminal.traceLength,random:terminal.random,ready:terminal.ready,tasks:terminal.tasks});
     // Explicitly test-owned writes prove detachment; they are not UI continuation or scheduler progress.
     terminal.detachment=await page.evaluate(()=>{const copy=x=>JSON.parse(JSON.stringify(x)),read=()=>({score:__q.runtime.projectVars.get('点数'),list:copy(__q.runtime.projectLists.get('名前一覧'))}),before=read();__q.runtime.projectVars.set('点数',999);__q.runtime.projectLists.get('名前一覧').push('test-owned-record-probe');const during=read(),recordDuring=copy(__terminalRecord);__q.runtime.projectVars.set('点数',before.score);__q.runtime.projectLists.get('名前一覧').pop();return{before,during,recordDuring,after:read(),recordAfterRestore:copy(__terminalRecord)};});assert.deepEqual(terminal.detachment.recordDuring,terminal.record);assert.deepEqual(terminal.detachment.after,terminal.detachment.before);terminal.detachedUnderTestOwnedMutation=true;
   }
   const finalRuntime=await page.evaluate(()=>({seed:__q.runtime.runSeed,random:__q.runtime.prng.state,lists:[...__q.runtime.projectLists],actors:[...__q.runtime.actors].map(([id,a])=>({id,isClone:a.isClone,x:a.x,y:a.y})),errors:__q.errorSequence,tasks:__q.tasks.size,blocked:__q.blocked.size,groups:__q.waitGroups.size}));
   await pressStop(await reveal(page.locator('#stopBtn')));if(error){terminal.recordAfterStop=await page.evaluate(()=>JSON.parse(JSON.stringify(__terminalRecord)));assert.deepEqual(terminal.recordAfterStop,terminal.record,'Stop cannot change the retained failure record');}const trace=await page.evaluate(()=>__trace),cleanup=await page.evaluate(()=>({running:__q.running,tasks:__q.tasks.size,ready:__q.ready.length,blocked:__q.blocked.size,groups:__q.waitGroups.size,keys:[...__q.runtime.pressedKeys]}));const midpoint=trace.find(x=>x.kind==='say'&&x.value==='滑走中')?.actors.find(a=>a.id==='sprite-1');if(!error){assert.deepEqual(midpoint,{id:'sprite-1',x:50,y:100},'real scheduler midpoint concurrent observation');assert.ok(trace.some(x=>x.kind==='unblock'&&x.reason.kind==='glide'));}assert.deepEqual(cleanup,{running:false,tasks:0,ready:0,blocked:0,groups:0,keys:[]});assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(Akari.app.project))),confirmed);
   L.result(L.path.join(dir,'event-trace-'+key+'-raw.json'),{trace,inputs,finalRuntime,cleanup});
   for(const e of (fault?[fault]:expected)){const t=trace.filter(r=>r.task?.targetId===e.id&&r.task?.event===e.event);assert.ok(t.some(r=>r.kind==='command'),'no command '+e.id);assert.equal(t.filter(r=>r.kind==='random').length,2,'two random draws '+e.id);assert.ok(t.some(r=>r.kind==='block'&&r.reason.kind==='time'));assert.ok(t.some(r=>r.kind==='unblock'&&r.reason.kind==='time'));if(error){const failures=t.filter(r=>r.kind==='error'&&r.code==='R401');assert.equal(failures.length,1);assert.equal(terminal.record.taskId,failures[0].task.taskId);assert.equal(terminal.record.runtimeId,failures[0].task.runtimeId);assert.ok(!trace.slice(trace.indexOf(failures[0])+1).some(r=>r.kind==='command'||r.kind==='random'),'no task executes past the terminal error');}else{assert.ok(t.some(r=>r.kind==='command'&&((r.node.kind==='StopCommand'&&r.node.op==='THIS')||(r.node.kind==='CloneCommand'&&r.node.op==='DELETE_SELF'))),'explicit stop/delete '+e.id);assert.ok(t.some(r=>r.kind==='finish'&&r.state==='DONE'));}}
   traces[key]={snapshot,mode,fault:fault?{index:expected.indexOf(fault),targetId:fault.id,event:fault.event}:null,confirmedProject:confirmed,postStopProject:await page.evaluate(()=>JSON.parse(JSON.stringify(Akari.app.project))),trace,inputs,finalRuntime,cleanup,guiBodyEdits:edited,terminal};L.result(L.path.join(dir,'event-trace-'+key+'.json'),traces[key]);console.log('TRACE '+key+' '+trace.length+' observations');
  }catch(e){await page.screenshot({path:L.path.join(dir,'event-trace-'+key+'-failure.png'),fullPage:true}).catch(()=>{});throw e;}finally{await context.close();}}
 try{for(const mode of ['code','blocks'])await one(mode,false);for(const fault of expected)for(const mode of ['code','blocks'])await one(mode,true,fault);for(const suffix of ['stop',...expected.map((_,i)=>'error-'+i)]){assert.deepEqual(fixtures['code-'+suffix],fixtures['blocks-'+suffix]);assert.deepEqual(traces['code-'+suffix].inputs,traces['blocks-'+suffix].inputs);assert.deepEqual(traces['code-'+suffix].trace,traces['blocks-'+suffix].trace,'entire ordered '+suffix+' observation trace');assert.deepEqual(traces['code-'+suffix].finalRuntime,traces['blocks-'+suffix].finalRuntime);assert.deepEqual(traces['code-'+suffix].terminal,traces['blocks-'+suffix].terminal);}
  for(const [index,e]of expected.entries())results.push({negative:{index,targetId:e.id,event:e.event,code:traces['code-error-'+index].terminal.record.code,deepFrozen:true,detachedUnderTestOwnedMutation:true,terminalControlsUnavailable:true,noProgressPastDeadline:true,stopCleanup:true,modeTraceEqual:true},id:'event-trace:'+e.type+':'+e.event,pass:true,initialProjectEqual:true,realGuiBodyEdit:true,realDomEventInput:true,fixedSeed:12345,fixedClock:true,compared:['command order','wait/block/unblock','error R401','explicit stop/delete','random calls/state/value','final runtime','stop cleanup']});
 }catch(e){results.push({id:'event-trace-suite',pass:false,error:e.stack});console.error(e.stack);process.exitCode=1;}finally{L.result(L.path.join(dir,'browser-event-traces.json'),{manifest,browser:browser.version(),results,pageErrors:errors,networkRequests:network,traceFiles:Object.keys(traces).map(k=>'event-trace-'+k+'.json')});await browser.close();}console.log(JSON.stringify({passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,errors,network}));if(errors.length||network.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});


async function reveal(locator){
 if(await locator.count()===1){if(!await locator.isVisible())for(const panel of await locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())await panel.locator('.blockui-side-toggle').click();const ancestors=locator.locator(await locator.evaluate(e=>e.tagName==='SUMMARY')?'xpath=parent::details/ancestor::details[not(@open)]':'xpath=ancestor::details[not(@open)]');for(const detail of await ancestors.all())await detail.locator(':scope > summary').click();}
 return locator;
}

