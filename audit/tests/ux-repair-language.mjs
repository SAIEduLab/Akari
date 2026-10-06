import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {loadApi,script} from '../browser/cases/audit-lib.cjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
const A=loadApi(fs.readFileSync(currentProductFile(),'utf8'));
const fixtures=JSON.parse(fs.readFileSync(new URL('../fixtures/ux-repair-expectations.json',import.meta.url))),results=[];
const plain=v=>JSON.parse(JSON.stringify(v));
function check(id,fn){try{results.push({id,status:'PASS',observed:fn()});}catch(error){results.push({id,status:'FAIL',error:error.stack});}}
function project(source){
 const p=A.makeDefaultProject(),akari=p.components[0];
 Object.assign(akari,{x:80,y:180});
 const dango=plain(akari);Object.assign(dango,{id:'dango',name:'だんご',x:420});for(const costume of dango.costumes)costume.id='dango-'+costume.id;dango.costumeId='dango-'+dango.costumeId;p.components.push(dango);
 p.projectData.variables=[{id:'score',name:'点数',initialValue:0}];
 p.scripts=[{id:'ux-main',targetId:'sprite-1',event:'start',source}];return p;
}
function execute(p,steps,answer=''){
 const compiled=A.compileProject(p);assert.deepEqual(plain(compiled.errors),[]);
 const runtime=new A.RuntimeModel(p,{}),trace=[],visible=new Map(),samples=[],errors=[];let time=0;runtime.now=()=>time;runtime.answer=answer;
 const scheduler=new A.EventScheduler(p,compiled,runtime,{say:(id,text,controlled)=>{trace.push([time,id,text]);visible.set(id,text);assert.equal(controlled,true);},clearSpeech:id=>visible.delete(id),runtimeError:(task,error)=>errors.push(error.code)});scheduler.schedule=()=>{};
 const pump=()=>{scheduler.recheckBlocked(true);let turns=0;while(scheduler.ready.length&&turns++<1000)scheduler.runTurn(true);assert.ok(turns<1000);};
 try{scheduler.start();for(const task of scheduler.tasks.values())task.lastAnswer=answer;pump();for(const step of steps){time=step.at;if(step.click)scheduler.spawnForRuntime(step.click,'click',{});pump();if(step.visible)assert.deepEqual(Object.fromEntries(visible),step.visible);samples.push({at:time,visible:Object.fromEntries(visible)});}assert.deepEqual(errors,[]);return {trace,samples,score:runtime.projectVars.get('点数')};}finally{scheduler.stop();}
}
// Expected times, speakers and values are fixed independently of the parser and formatter.
const expectations={
 B02:{trace:[[0,'sprite-1','おはよう'],[2000,'sprite-1','いってきます']],steps:[{at:1999,visible:{'sprite-1':'おはよう'}},{at:2000,visible:{'sprite-1':'いってきます'}},{at:3999},{at:4000,visible:{}}]},
 B05:{trace:[[0,'sprite-1','こっちだよ'],[3000,'sprite-1','こっちだよ'],[6000,'sprite-1','おしまい']],steps:[{at:1999,visible:{'sprite-1':'こっちだよ'}},{at:2000,visible:{}},{at:2999,visible:{}},{at:3000,visible:{'sprite-1':'こっちだよ'}},{at:5000,visible:{}},{at:5999,visible:{}},{at:6000,visible:{'sprite-1':'おしまい'}},{at:8000,visible:{}}]},
 B08:{trace:[[100,'dango','なあに？']],steps:[{at:0,visible:{}},{at:50,click:'sprite-1',visible:{}},{at:100,click:'dango',visible:{dango:'なあに？'}},{at:2100,visible:{}}]},
 B11:{trace:[[0,'sprite-1','こんにちは'],[1000,'dango','やあ']],steps:[{at:999,visible:{'sprite-1':'こんにちは'}},{at:1000,visible:{'sprite-1':'こんにちは',dango:'やあ'}},{at:2000,visible:{dango:'やあ'}},{at:3000,visible:{}}]},
 B14:{answer:'ほし',trace:[[0,'sprite-1','どうぞ']],steps:[{at:2000,visible:{}}]},
 B17:{trace:[[0,'sprite-1','3']],steps:[{at:2000,visible:{}}]},
 B20:{trace:[[0,'sprite-1','1'],[2000,'sprite-1','2'],[4000,'sprite-1','3']],steps:[{at:0,click:'sprite-1',visible:{'sprite-1':'1'}},{at:2000,click:'sprite-1',visible:{'sprite-1':'2'}},{at:4000,click:'sprite-1',visible:{'sprite-1':'3'}},{at:6000,visible:{}}]},
 B22:{trace:[[0,'sprite-1','こんにちは']],steps:[{at:1999,visible:{'sprite-1':'こんにちは'}},{at:2000,visible:{}}]},
 B23:{trace:[[0,'sprite-1','おはよう'],[2500,'dango','なあに？']],steps:[{at:2000,visible:{}},{at:2500,click:'dango',visible:{dango:'なあに？'}},{at:4500,visible:{}}]},
};
for(const c of fixtures.cases)check(c.id+'/original-acceptance-meaning-result',()=>{
 const p=project(c.source),parsed=A.parseSyntax(c.source,{symbols:A.buildSymbols(p),targetId:'sprite-1',event:'start'});assert.ok(parsed.ast,JSON.stringify(parsed.syntaxDiagnostics));assert.equal(parsed.ast.source,c.source);
 const decoded=A.blockDecode(A.blockEncode(parsed.ast).tree);assert.ok(A.astEquivalent(parsed.ast,decoded));
 const e=expectations[c.id],observed=execute(p,e.steps,e.answer);assert.deepEqual(observed.trace,e.trace);
 const formatted=A.formatScript(decoded),again=A.parseSyntax(formatted,{symbols:A.buildSymbols(p)});assert.ok(again.ast,JSON.stringify(again.syntaxDiagnostics));assert.ok(A.astEquivalent(parsed.ast,again.ast));
 p.scripts[0].source=formatted;assert.deepEqual(execute(p,e.steps,e.answer),observed);
 if(c.id==='B14'){p.scripts[0].source=c.source;assert.deepEqual(execute(p,e.steps,'つき').trace,[[0,'sprite-1','もういちど']]);}
 if(c.id==='B05'){assert.equal(parsed.ast.body[0].kind,'RepeatCount');assert.deepEqual(Array.from(parsed.ast.body[0].body,n=>n.kind),['Say','WaitTime']);assert.equal(parsed.ast.body.length,2);}
 if(c.id==='B23'){assert.equal(parsed.ast.units.length,1);assert.equal(parsed.ast.units[0].heading.event,'click');}
 return {originalSource:c.source,originalSourcePreserved:true,observed,blockRoundtrip:true,formatRoundtrip:true};
});
for(const [a,b]of [[9,2],[12,5],[1,7]])check(`variants/arithmetic/${a}/${b}`,()=>{
 const source=`始めると、あかりは${a}から${b}を引いた答えを3秒話します。`,p=project(source),r=execute(p,[{at:2999,visible:{'sprite-1':String(a-b)}},{at:3000,visible:{}}]);assert.deepEqual(r.trace,[[0,'sprite-1',String(a-b)]]);return r;
});
check('timed/same-actor-overlap',()=>{
 const p=project('始めると、あかりは『先』と2秒話します。あかりがクリックされると、あかりは『後』と3秒話します。');
 return execute(p,[{at:1000,click:'sprite-1',visible:{'sprite-1':'後'}},{at:2000,visible:{'sprite-1':'後'}},{at:4000,visible:{}}]);
});
check('source/edit-second-event-preserves-first',()=>{
 const source=fixtures.cases.find(c=>c.id==='B23').source,p=project(source),session=A.createEditorSession('script:ux-main',source,{targetId:'sprite-1',event:'start'},p,1),target=session.blockView.inputs.units[0].bodies.body[0].inputs.value;
 const edited=A.prepareBlockEdit(session,{type:'field',id:target.id,key:'value',value:'はーい'});
 assert.equal(edited.source.split('。')[0],source.split('。')[0]);assert.equal(edited.syntaxAst.units.length,1);assert.equal(edited.syntaxAst.units[0].body[0].value.value,'はーい');assert.equal(edited.syntaxAst.heading.event,'start');return {source:edited.source,firstEventExact:true};
});
for(const value of ['「ほし」と。※始めると、だんご','全角１２３＋と空 白','一行目\n  二行目'])check('quotes/'+value,()=>{
 const p=project(`始めると、あかりは『${value}』と1秒話します。`),r=execute(p,[{at:1000,visible:{}}]);assert.deepEqual(r.trace,[[0,'sprite-1',value]]);return r;
});
for(const source of ['「値」と－1秒話す。','「値」と1歩秒話す。'])check('timed/atomic-rejection/'+source,()=>{
 const p=project(source),compiled=A.compileProject(p),runtime=new A.RuntimeModel(p,{}),speech=[],errors=[];runtime.now=()=>0;
 if(source.includes('1歩秒')){assert.deepEqual(Array.from(compiled.errors,e=>e.code),['R417']);return {compileRejected:true,code:'R417',speech:[]};}
 const scheduler=new A.EventScheduler(p,compiled,runtime,{say:(...args)=>speech.push(args),runtimeError:(task,error)=>errors.push(error.code)});scheduler.schedule=()=>{};
 try{assert.equal(compiled.errors.length,0);scheduler.start();while(scheduler.ready.length)scheduler.runTurn(true);assert.deepEqual(speech,[]);assert.equal(errors.length,1);return {speech,errors};}finally{scheduler.stop();}
});
for(const source of ['これを2回くり返します。','だんごも同じ合図で動き始め、1秒待ちます。','くり返しが終わると、あかりは「終」と1秒話します。'])check('refusal/'+source,()=>{const result=A.parseSyntax(source);assert.equal(result.ast,null);assert.equal(result.syntaxDiagnostics[0].code,'P205');return plain(result.syntaxDiagnostics);});
function runClock(api,p,steps,clock=null){
 const compiled=api.compileProject(p);assert.deepEqual(plain(compiled.errors),[]);const runtime=new api.RuntimeModel(p,{}),trace=[],errors=[];let now=0;if(!clock)runtime.now=()=>now;
 const scheduler=new api.EventScheduler(p,compiled,runtime,{say:(id,text)=>trace.push([now,id,text]),clearSpeech:id=>trace.push([now,id,null]),runtimeError:(_,error)=>errors.push(error.code)});scheduler.schedule=()=>{};
 const pump=()=>{if(scheduler.paused)return;scheduler.recheckBlocked(false);let turns=0;while(scheduler.ready.length&&turns++<1000)scheduler.runTurn(false);assert.ok(turns<1000);};
 try{scheduler.start();pump();for(const step of steps){now=step.at;if(clock)clock.now=now;if(step.pause)scheduler.pause();if(step.resume)scheduler.resume();if(step.stop)scheduler.stop();pump();}assert.deepEqual(errors,[]);return trace;}finally{scheduler.stop();}
}
check('compatibility/actor-named-今',()=>{
 const old=loadApi(execFileSync('git',['show','187c74c573f0afad420d0746426c32bf02f453a4:Akari1_0_2.html'],{encoding:'utf8',maxBuffer:16*1024*1024}));
 const source='今の点数を言う。',p=project(source);p.components[0].name='今';p.components[0].localData.variables=[{id:'now-score',name:'点数',initialValue:7}];p.projectData.variables[0].initialValue=2;p.scripts[0].targetId='dango';
 const previous=old.parseSyntax(source,{symbols:old.buildSymbols(p),targetId:'dango',event:'start'}),current=A.parseSyntax(source,{symbols:A.buildSymbols(p),targetId:'dango',event:'start'});
 assert.equal(previous.ast.body[0].value.kind,'ActorQualifiedRead');assert.equal(current.ast.body[0].value.kind,'ActorQualifiedRead');assert.equal(current.ast.body[0].value.actorRef.name,'今');
 const expected=[[0,'dango','7']];assert.deepEqual(runClock(old,p,[]),expected);assert.deepEqual(runClock(A,p,[]),expected);return {source,expected,previous:expected,current:expected,actorNamePreserved:true};
});
for(const [name,answer]of [['こはる','ほし'],['星','つき']])check('variants/actor-condition/'+name,()=>{
 const p=project(`答えが『${answer}』なら、${name}は『正解』と1秒話します。そうでなければ、${name}は『違う』と1秒話します。`);p.components[0].name=name;
 assert.deepEqual(execute(p,[{at:1000,visible:{}}],answer).trace,[[0,'sprite-1','正解']]);assert.deepEqual(execute(p,[{at:1000,visible:{}}],'別').trace,[[0,'sprite-1','違う']]);return {name,answer,bothBranches:true};
});
check('timed/mixed-and-stop',()=>{
 const p=project('「最初」と言う。\n「途中」と2秒話す。\n「最後」と言う。');const expected=[[0,'sprite-1','最初'],[0,'sprite-1','途中'],[2000,'sprite-1',null],[2000,'sprite-1','最後']];assert.deepEqual(runClock(A,p,[{at:1999},{at:2000}]),expected);
 assert.deepEqual(runClock(A,p,[{at:1000,stop:true},{at:5000}]),[[0,'sprite-1','最初'],[0,'sprite-1','途中']]);return {mixedTrace:expected,stopPreventsLaterSpeech:true};
});
check('timed/pause-resume',()=>{
 const clock={now:0},context={console,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,Blob,URL,structuredClone,crypto:globalThis.crypto,setTimeout,clearTimeout,performance:{now:()=>clock.now}};vm.runInNewContext(script(fs.readFileSync(currentProductFile(),'utf8')),context,{timeout:30000});
 const p=project('「途中」と2秒話す。\n「最後」と言う。'),trace=runClock(context.Akari,p,[{at:1000,pause:true},{at:5000},{at:5000,resume:true},{at:5999},{at:6000}],clock);assert.deepEqual(trace,[[0,'sprite-1','途中'],[6000,'sprite-1',null],[6000,'sprite-1','最後']]);return {trace,pausedDurationPreserved:true};
});
const report={schema:'akari-ux-repair-language-v1',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:snapshot(currentProductFile()),environment:'node / product parser, codec and scheduler with independent clock',uxAcceptance:false,results};
const output=path.resolve(process.argv[2]||'audit-evidence/ux-repair-language.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
for(const r of results.filter(r=>r.status==='FAIL'))console.error(r.id+': '+r.error.split('\n').slice(0,5).join(' '));
console.log(`UX repair language: ${results.filter(r=>r.status==='PASS').length}/${results.length} PASS`);if(report.status!=='PASS')process.exitCode=1;
