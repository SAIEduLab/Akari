const L=require('./audit-lib.cjs'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const{chromium}=require('playwright');
(async()=>{
 const dir=L.path.resolve(process.argv[2]||'audit-evidence/browser/candidate'),manifest=L.verifyManifest(dir),url=pathToFileURL(L.path.join(dir,manifest.candidate)).href,results=[],traces={},errors=[],network=[];
 const browser=await chromium.launch({executablePath:(process.env.AKARI_BROWSER||undefined),headless:true,args:['--allow-file-access-from-files']});
 const api=L.loadApi(L.read(L.path.join(dir,manifest.candidate))),objects=[{id:'stage',type:'stage'},{id:'button-1',type:'button'},{id:'sprite-1',type:'sprite'},{id:'trace-label',type:'label'},{id:'trace-box',type:'box'},{id:'trace-input',type:'input'}],events=JSON.parse(JSON.stringify(api.EVENT_BY_TYPE)),expected=objects.flatMap(o=>events[o.type].map(event=>({id:'event:'+o.type+':'+event,...o,event}))),fixtures={};assert.equal(expected.length,32);
 function fixture(mode,error){const p=api.makeDefaultProject(),defaultSpriteName=p.components.find(x=>x.id==='sprite-1').name;p.name='全イベント観測';p.scripts=[];p.projectData.lists.find(x=>x.name==='名前一覧').initialValue=[];p.projectData.variables.find(x=>x.name==='点数').initialValue=error?1:0;
  p.components.find(x=>x.id==='button-1').x=30;p.components.find(x=>x.id==='button-1').y=30;p.components.find(x=>x.id==='sprite-1').x=420;p.components.find(x=>x.id==='sprite-1').y=200;
  const button=p.components.find(x=>x.id==='button-1');for(const[id,type,x,y]of [['trace-label','label',30,110],['trace-box','box',250,30],['trace-input','input',50,260]])p.components.push({...JSON.parse(JSON.stringify(button)),id,type,name:type==='input'?'入力欄1':type==='box'?'四角1':'文字1',x,y,w:140,h:36,text:type==='input'?'初期入力':type,localData:{variables:[],lists:[]}});
  if(p.stage.backdrops.length<2)p.stage.backdrops.push({id:'trace-backdrop',name:'第二背景',kind:'color',value:'#ffffff'});
  for(const e of expected){const tag=e.type+':'+e.event;let source='名前一覧に「'+(mode==='blocks'?'編集中':tag)+'」を追加する\n名前一覧に乱数（1、100000）を追加する\n0.1秒待つ\n名前一覧に乱数（1、100000）を追加する';
   if(e.type==='sprite'&&e.event==='start')source+='\n横0、縦0の位置へ行く\n0.1秒で横100、縦200の位置へ滑る';
   if(e.type==='stage'&&e.event==='start')source+='\n0.05秒待つ\n「滑走中」と言う\n0.05秒待つ';
   if(e.type==='button'&&e.event==='click')source+='\n「観測知らせ」と知らせ、受け手の処理が終わるまで待つ\n次の背景にする\n「'+defaultSpriteName+'」のクローンを作る';
   const sensor={message:'受け取った知らせ',keyDown:'押されたキー',valueChanged:'新しい値',backdropChanged:'新しい背景名'}[e.event];if(sensor)source+='\n名前一覧に'+sensor+'を追加する';
   source+='\nもし 点数が1と同じなら、次のことをする\n  1÷0と言う\n名前一覧に「完了:'+tag+'」を追加する';
   if(e.event==='cloneStart')source+='\nこのクローンを削除する';else source+='\nこのスクリプトを止める';
   const ast=api.parseSyntax(source).ast;assert.ok(ast);p.scripts.push({targetId:e.id,event:e.event,source:api.formatScript(ast)});
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
 async function settle(page){for(let step=0;step<150;step++){
   await page.waitForFunction(()=>window.__q&&(window.__q.paused||window.__q.ready.length===0));
   const s=await page.evaluate(()=>({paused:__q.paused,ready:__q.ready.length,blocked:[...__q.blocked].map(t=>({kind:t.blockReason.kind,deadline:t.blockReason.deadline})),tasks:__q.tasks.size}));
   if(s.paused){if(await page.locator('#failureModal.show').count())await (await reveal09(page.locator('#failureClose'))).click();await (await reveal09(page.locator('#continueBtn'))).click();continue;}
   if(s.ready){await page.waitForTimeout(20);continue;}
   if(s.blocked.length){const deadlines=s.blocked.filter(x=>['time','glide'].includes(x.kind)).map(x=>x.deadline);assert.ok(deadlines.length,'non-time deadlock '+JSON.stringify(s));await page.evaluate(deadline=>{window.__auditClock=deadline+__q.runtime.clockOffset;},Math.min(...deadlines));await page.waitForTimeout(30);continue;}
   assert.equal(s.tasks,0);return;
  }throw Error('event processing did not settle');}
 async function one(mode,error){const key=mode+'-'+(error?'error':'stop'),context=await browser.newContext({viewport:{width:1440,height:900}});await context.route(/^https?:\/\//,r=>{network.push(r.request().url());return r.abort();});await context.addInitScript(()=>{window.__auditClock=100000;Object.defineProperty(performance,'now',{value:()=>window.__auditClock});const fn=Crypto.prototype.getRandomValues;Crypto.prototype.getRandomValues=function(array){if(array instanceof Uint32Array&&array.length===1){array[0]=12345;return array;}return fn.call(this,array);};});const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push({key,message:e.message}));page.on('dialog',d=>d.accept(d.type()==='prompt'?d.defaultValue():undefined));
  try{await page.goto(url);const project=fixture(mode,error),file=L.path.join(dir,'event-trace-'+key+'.akari.md');L.fs.writeFileSync(file,api.serializeProject(project,new api.AssetStore()));await page.locator('#fileInput').setInputFiles(file);await page.waitForFunction(()=>Akari.app.project.name==='全イベント観測');const edited=[];
   for(const e of expected){await (await reveal09(page.locator('#objectSelect'))).selectOption(e.id);await (await reveal09(page.locator('#eventSelect'))).selectOption(e.event);await page.locator('#editorMode'+mode).click();if(mode==='blocks'){
     const node=await page.evaluate(()=>Akari.app.editorState.main.blockView.bodies.body[0].inputs.value);assert.equal(node.schemaId,'StringLiteral');const input=page.locator('#blockEditor [data-blockui-field="value"][data-block-id="'+node.id+'"]');await (await reveal09(input)).fill(e.type+':'+e.event);await input.press('Enter');assert.equal(await page.evaluate(()=>Akari.app.editorState.main.pendingEdit),null);edited.push('event:'+e.type+':'+e.event);
    }assert.equal(await page.evaluate(()=>Akari.app.editorState.main.mode),mode);
   }
   const confirmed=await page.evaluate(()=>JSON.parse(JSON.stringify(Akari.app.project)));fixtures[key]=confirmed;assert.deepEqual(confirmed,JSON.parse(JSON.stringify(fixture('code',error))),'confirmed GUI source matches CUI initial project');await installObserver(page);
   const inputs=[],input=async(label,fn)=>{inputs.push({label,time:await page.evaluate(()=>__auditClock)});await fn();await settle(page);};
   await input('run',async()=>{await (await reveal09(page.locator('#runBtn'))).click();await page.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');});
   await input('stage click',async()=>{const point=await page.locator('#formSurface').evaluate(el=>{const r=el.getBoundingClientRect(),s=Akari.app.project.stage;return{x:r.left+590*r.width/s.width,y:r.top+340*r.height/s.height};});await page.mouse.click(point.x,point.y);});
   for(const o of objects.filter(o=>!['stage','button'].includes(o.type)))await input(o.type+' click',()=>page.locator('.component[data-runtime-id="'+o.id+'"]').click());
   await input('input value change',()=>page.locator('.component[data-runtime-id="trace-input"]').fill('入力更新'));
   await input('keyDown a',async()=>{await page.locator('#formSurface').focus();await page.keyboard.press('a');});
   await input('button click with broadcast backdrop clone',()=>page.locator('.component[data-runtime-id="button-1"]').click());
   const finalRuntime=await page.evaluate(()=>({seed:__q.runtime.runSeed,random:__q.runtime.prng.state,lists:[...__q.runtime.projectLists],actors:[...__q.runtime.actors].map(([id,a])=>({id,isClone:a.isClone,x:a.x,y:a.y})),errors:__q.errorSequence,tasks:__q.tasks.size,blocked:__q.blocked.size,groups:__q.waitGroups.size}));
   await (await reveal09(page.locator('#stopBtn'))).click();const trace=await page.evaluate(()=>__trace),cleanup=await page.evaluate(()=>({running:__q.running,tasks:__q.tasks.size,ready:__q.ready.length,blocked:__q.blocked.size,groups:__q.waitGroups.size,keys:[...__q.runtime.pressedKeys]}));const midpoint=trace.find(x=>x.kind==='say'&&x.value==='滑走中')?.actors.find(a=>a.id==='sprite-1');assert.deepEqual(midpoint,{id:'sprite-1',x:50,y:100},'real scheduler midpoint concurrent observation');assert.ok(trace.some(x=>x.kind==='unblock'&&x.reason.kind==='glide'));assert.deepEqual(cleanup,{running:false,tasks:0,ready:0,blocked:0,groups:0,keys:[]});assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(Akari.app.project))),confirmed);
   L.result(L.path.join(dir,'event-trace-'+key+'-raw.json'),{trace,inputs,finalRuntime,cleanup});
   for(const e of expected){const t=trace.filter(r=>r.task?.targetId===e.id&&r.task?.event===e.event);assert.ok(t.some(r=>r.kind==='command'),'no command '+e.id);assert.equal(t.filter(r=>r.kind==='random').length,2,'two random draws '+e.id);assert.ok(t.some(r=>r.kind==='block'&&r.reason.kind==='time'));assert.ok(t.some(r=>r.kind==='unblock'&&r.reason.kind==='time'));if(error)assert.ok(t.some(r=>r.kind==='error'&&r.code==='R401'));else{assert.ok(t.some(r=>r.kind==='command'&&((r.node.kind==='StopCommand'&&r.node.op==='THIS')||(r.node.kind==='CloneCommand'&&r.node.op==='DELETE_SELF'))),'explicit stop/delete '+e.id);assert.ok(t.some(r=>r.kind==='finish'&&r.state==='DONE'));}}
   traces[key]={trace,inputs,finalRuntime,cleanup,guiBodyEdits:edited};L.result(L.path.join(dir,'event-trace-'+key+'.json'),traces[key]);console.log('TRACE '+key+' '+trace.length+' observations');
  }catch(e){await page.screenshot({path:L.path.join(dir,'event-trace-'+key+'-failure.png'),fullPage:true}).catch(()=>{});throw e;}finally{await context.close();}}
 try{for(const error of [false,true])for(const mode of ['code','blocks'])await one(mode,error);for(const suffix of ['stop','error']){assert.deepEqual(fixtures['code-'+suffix],fixtures['blocks-'+suffix]);assert.deepEqual(traces['code-'+suffix].inputs,traces['blocks-'+suffix].inputs);assert.deepEqual(traces['code-'+suffix].trace,traces['blocks-'+suffix].trace,'entire ordered '+suffix+' observation trace');assert.deepEqual(traces['code-'+suffix].finalRuntime,traces['blocks-'+suffix].finalRuntime);}
  for(const e of expected)results.push({id:'event-trace:'+e.type+':'+e.event,pass:true,initialProjectEqual:true,realGuiBodyEdit:true,realDomEventInput:true,fixedSeed:12345,fixedClock:true,compared:['command order','wait/block/unblock','error R401','explicit stop/delete','random calls/state/value','final runtime','stop cleanup']});
 }catch(e){results.push({id:'event-trace-suite',pass:false,error:e.stack});console.error(e.stack);process.exitCode=1;}finally{L.result(L.path.join(dir,'browser-event-traces.json'),{manifest,browser:browser.version(),results,pageErrors:errors,networkRequests:network,traceFiles:Object.keys(traces).map(k=>'event-trace-'+k+'.json')});await browser.close();}console.log(JSON.stringify({passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,errors,network}));if(errors.length||network.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});


async function reveal09(locator){
 if(await locator.count()===1){if(!await locator.isVisible())for(const panel of await locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())await panel.locator('.blockui-side-toggle').click();const ancestors=locator.locator(await locator.evaluate(e=>e.tagName==='SUMMARY')?'xpath=parent::details/ancestor::details[not(@open)]':'xpath=ancestor::details[not(@open)]');for(const detail of await ancestors.all())await detail.locator(':scope > summary').click();}
 return locator;
}
