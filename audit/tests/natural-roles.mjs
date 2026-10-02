import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
const A=loadApi(fs.readFileSync(currentProductFile(),'utf8')),results=[];
const plain=value=>JSON.parse(JSON.stringify(value));
function check(id,body){try{const observed=body();results.push({id,status:'PASS',observed});}catch(error){results.push({id,status:'FAIL',error:error.stack});}}
function project(name='こはる',source=''){
 const p=A.makeDefaultProject(),actor=p.components.find(c=>c.id==='sprite-1');
 Object.assign(actor,{name,x:100,y:100,direction:0});p.components=[actor];p.actions=[];p.functions=[];
 p.scripts=[{id:'roles-main',targetId:actor.id,event:'start',source}];p.projectData={variables:[],lists:[]};return p;
}
function parsed(source,p){const r=A.parseSyntax(source,{targetId:'sprite-1',event:'start',symbols:A.buildSymbols(p)});assert.ok(r.ast,JSON.stringify(r.syntaxDiagnostics));return r.ast;}
function roundtrip(source,p){
 const ast=parsed(source,p),block=A.blockDecode(A.blockEncode(ast).tree),formatted=A.formatScript(block),again=parsed(formatted,p);
 assert.ok(A.astEquivalent(ast,block),'block changes meaning');assert.ok(A.astEquivalent(ast,again),'formatted source changes meaning');
 const session=A.createEditorSession('script:roles-main',source,{targetId:'sprite-1',event:'start'},p,0);assert.ok(session.syntaxAst,JSON.stringify(session.syntaxDiagnostics));assert.ok(session.blockView);assert.ok(A.astEquivalent(ast,session.syntaxAst));
 const refreshed=A.refreshEditorSession(session,source,{targetId:'sprite-1',event:'start'},p,1);assert.ok(refreshed.blockView);assert.ok(A.astEquivalent(ast,refreshed.syntaxAst));return {ast,formatted};
}
function run(p){
 const compiled=A.compileProject(p);assert.equal(compiled.errors.length,0,JSON.stringify(compiled.errors));
 const runtime=new A.RuntimeModel(p,{}),speech=[],errors=[];runtime.now=()=>0;
 const scheduler=new A.EventScheduler(p,compiled,runtime,{say:(id,text)=>speech.push(text),runtimeError:(task,error)=>errors.push({code:error.code,message:error.message})});scheduler.schedule=()=>{};
 try{scheduler.start();let turns=0;while(scheduler.ready.length&&turns++<1000)scheduler.runTurn(true);assert.ok(turns<1000);return {speech,errors,actors:plain([...runtime.actors.values()].map(a=>({x:a.x,y:a.y,isClone:!!a.isClone}))),variables:plain([...runtime.projectVars])};}finally{scheduler.stop();}
}
for(const name of ['こはる','星','ねこ2'])for(const amount of [0,1,7,2.5,-3]){
 const number=String(amount).replace('-','－'),variants=[`${name}は画面の右へ${number}歩動く。`,`${name}は${number}歩、画面の右へ動く。`,`画面の右へ、${name}を${number}歩動かす。`];
 for(const [i,source]of variants.entries())check(`motion/${name}/${amount}/${i}`,()=>{const p=project(name,source),{formatted}=roundtrip(source,p),r=run(p);assert.deepEqual(r.errors,[]);assert.equal(r.actors[0].x,100+amount);assert.equal(r.actors[0].y,100);p.scripts[0].source=formatted;assert.deepEqual(run(p),r);return {source,x:r.actors[0].x};});
}
for(const a of ['「青空」','「に、とを」','「ねこ🐈」'])for(const b of ['「さん」','「はる」','「、そのあと」']){
 const expected=a.slice(1,-1)+b.slice(1,-1),variants=[`${a}に${b}をつなげて言う。`,`${a}と${b}をつなげて言う。`,`${a}の後ろに${b}をつなげて言う。`,`${b}を${a}につなげて言う。`];
 for(const [i,source]of variants.entries())check(`concat/${a}/${b}/${i}`,()=>{const p=project(undefined,source),{formatted}=roundtrip(source,p),r=run(p);assert.deepEqual(r.errors,[]);assert.deepEqual(r.speech,[expected]);p.scripts[0].source=formatted;assert.deepEqual(run(p),r);return {source,expected};});
}
for(const [source,expected]of [['3と80をかけた数',240],['240に10を足した数',250],['10から3を引いた数',7],['9を2で割った数',4.5],['（2に3を足した数）と4をかけた数',20]])check(`arithmetic/${source}`,()=>{
 const p=project(),ctx={runtime:new A.RuntimeModel(p,{}),runtimeId:'sprite-1',compiled:A.compileProject(p)},ast=A.parseExpression(source,A.buildSymbols(p)),decoded=A.blockDecode(A.blockEncode(ast).tree),formatted=A.formatExpression(decoded);
 assert.ok(A.astEquivalent(ast,decoded));for(const node of [ast,decoded,A.parseExpression(formatted,A.buildSymbols(p))])assert.equal(A.evalExpression(node,ctx),expected);return {source,expected};
});
for(const name of ['あいさつ','ジャンプ','手順3'])for(const count of [0,1,3])check(`action/${name}/${count}`,()=>{
 const source=`「${name}」という手順を${count}回行う。`,p=project(undefined,source);p.actions=[{id:'roles-action',ownerId:'stage',name,args:[],source:'「呼ばれた」と言う。'}];
 const {formatted}=roundtrip(source,p),r=run(p);assert.deepEqual(r.errors,[]);assert.deepEqual(r.speech,Array(count).fill('呼ばれた'));p.scripts[0].source=formatted;assert.deepEqual(run(p),r);return {source,count};
});
for(const count of [0,1,3])check(`clone/${count}`,()=>{const source=`自分の分身を${count}体作る。`,p=project(undefined,source),{formatted}=roundtrip(source,p),r=run(p);assert.deepEqual(r.errors,[]);assert.equal(r.actors.filter(a=>a.isClone).length,count);p.scripts[0].source=formatted;assert.deepEqual(run(p),r);return {count};});
for(const value of ['－1','1.5','「三」','501'])check(`clone/reject/${value}`,()=>{const p=project(undefined,`自分の分身を${value}体作る。`),r=run(p);assert.equal(r.errors.length,1);assert.equal(r.actors.length,1,'rejection must not create a partial group');return r;});
for(const direction of ['右','左'])for(const speed of [1,20,30])for(const ending of ['動く','動き続ける'])check(`continuous/${direction}/${speed}/${ending}`,()=>{
 const source=`「a」キーを押しているあいだ、画面の${direction}へ1秒に${speed}歩の速さで${ending}。`,p=project(undefined,source),{ast}=roundtrip(source,p);
 assert.equal(ast.rules.length,1);assert.equal(ast.rules[0].direction,direction==='右'?'right':'left');assert.equal(ast.rules[0].distance.value.value,speed);assert.equal(A.compileProject(p).errors.length,0);return {source};
});
for(const source of ['「a」キーを押しているあいだ、画面の右へ20歩動く。','画面の右へ画面の左へ20歩動く。','「あいさつ」という手順を2回3回行う。'])check(`reject/${source}`,()=>{const p=project(undefined,source),r=A.parseSyntax(source,{symbols:A.buildSymbols(p)});assert.equal(r.ast,null);assert.ok(r.syntaxDiagnostics.length);return {source,diagnostics:plain(r.syntaxDiagnostics)};});
for(const name of ['こはる','はなを','ねこは星'])for(const quoted of [false,true])for(const order of [0,1])for(const speed of [0,1,20])check(`continuous-actor/${name}/${quoted}/${order}/${speed}`,()=>{
 const actor=quoted?`【${name}】`:name,roles=order?`1秒に${speed}歩の速さで画面の右へ`:`画面の右へ1秒に${speed}歩の速さで`,source=`「a」キーを押しているあいだ、${actor}は${roles}動く。`,p=project(name,source),{formatted}=roundtrip(source,p);
 const execute=text=>{p.scripts[0].source=text;const compiled=A.compileProject(p);assert.deepEqual(plain(compiled.errors),[]);const runtime=new A.RuntimeModel(p,{}),errors=[];let time=0;runtime.now=()=>time;
  const scheduler=new A.EventScheduler(p,compiled,runtime,{runtimeError:(task,error)=>errors.push(error.code)});scheduler.schedule=()=>{};
  try{scheduler.start();time=1000;scheduler.advanceContinuous(time);assert.equal(runtime.actor('sprite-1').x,100);scheduler.setKeyState('a',true);time=2000;scheduler.advanceContinuous(time);const moved=runtime.actor('sprite-1').x;assert.ok(Math.abs(moved-(100+speed))<1e-8);scheduler.setKeyState('a',false);time=3000;scheduler.advanceContinuous(time);assert.equal(runtime.actor('sprite-1').x,moved);assert.deepEqual(errors,[]);return moved;}finally{scheduler.stop();}};
 const x=execute(source);assert.equal(execute(formatted),x);return {source,formatted,x};
});
for(const name of ['こはる','はなを','ねこは星'])for(const quoted of [false,true])check(`heading-actor/${name}/${quoted}`,()=>{
 const actor=quoted?`【${name}】`:name,source=`作品を動かしたとき、${actor}は、\n  「START」と言う。\n${actor}がクリックされたとき、\n  「CLICK」と言う。`,p=project(name,source),{ast,formatted}=roundtrip(source,p);
 assert.equal(ast.heading.actorRef.name,name);assert.equal(ast.units[0].heading.actorRef.name,name);const original=run(p);assert.deepEqual(original.speech,['START']);p.scripts[0].source=formatted;assert.deepEqual(run(p),original);return {source,formatted};
});
const report={schema:'akari-natural-roles-v1',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:snapshot(currentProductFile()),environment:'node / actual parser, block codec, formatter and runtime',uxAcceptance:false,results};
const output=path.resolve(process.argv[2]||'audit-evidence/natural-roles.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
for(const r of results.filter(r=>r.status==='FAIL'))console.error(r.id+': '+r.error.split('\n').slice(0,4).join(' '));
console.log(`Natural roles: ${results.filter(r=>r.status==='PASS').length}/${results.length} PASS`);if(report.status!=='PASS')process.exitCode=1;
