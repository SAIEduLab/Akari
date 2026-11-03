import {writeCaseReport} from '../lib/gate-case-contract.mjs';
import assert from 'node:assert/strict';
import {currentProductVersion} from '../lib/product-path.cjs';
import {loadAssistApi,assistWorld,assistContexts} from '../lib/code-assist-host.mjs';

const A=loadAssistApi(),results=[],plain=v=>JSON.parse(JSON.stringify(v));
const check=async(id,fn)=>{try{results.push({id,status:'PASS',observed:await fn()});}catch(error){results.push({id,status:'FAIL',error:error.stack});}};
function world(source='何もしない。'){
  const p=assistWorld(A,{parts:['ねこ','犬','鳥'],variables:{点数:0}});
  for(const c of p.components){Object.assign(c,{x:0,y:0,direction:0});c.costumes=[{id:c.id+'-text',name:'顔',kind:'text',value:'●'}];c.costumeId=c.costumes[0].id;}
  p.scripts=[{id:'s1',targetId:'sprite-2',event:'start',source}];return p;
}
function candidates(source){const p=world(),ctx=assistContexts(A,p,{targetId:'sprite-2'}).verify,before=JSON.stringify(p),rows=A.assistCandidates(p,source,ctx);assert.equal(JSON.stringify(p),before);return Array.from(rows,row=>({...plain(row),ast:plain(A.parseSyntax(row.source,ctx).ast)}));}
function run(p,times=[0,999,1000],api=A,compiled=api.compileProject(p)){
  assert.deepEqual(plain(compiled.errors||[]),[]);let now=0;
  const r=new api.RuntimeModel(p,{}),speech=[],q=new api.EventScheduler(p,compiled,r,{say:(id,text)=>speech.push({now,id,text})});
  r.now=()=>now;q.schedule=()=>{};const positions=()=>p.components.map(c=>r.actor(c.id).x),moves=[],states=[];q.start();let before=positions();
  try{for(now of times){q.advanceContinuous(now);q.recheckBlocked(true);let steps=0;while(q.ready.length&&steps++<1000){q.runTurn(true);const after=positions();after.forEach((x,i)=>{if(x!==before[i])moves.push({now,name:p.components[i].name,x});});before=after;}assert.ok(steps<1000);states.push({now,x:positions(),speech:plain(speech)});}assert.deepEqual(plain(q.errorRecords),[]);return plain({states,moves,speech});}finally{q.stop();}
}
await check('assist/actor-duration',()=>{
  const rows=candidates('ねこを2秒で右へ40歩移動させる。');assert.ok(rows.length);
  for(const row of rows){const n=row.ast.body[0];assert.equal(row.ast.body.length,1);assert.equal(n.kind,'MotionCommand');assert.equal(n.op,'MOVE_BY');assert.equal(n.actorRef?.name,'ねこ');assert.equal(n.xDir,'right');assert.equal(n.x.value.value,40);assert.equal(n.seconds.value.value,2);}
  const result=run(world(rows[0].source),[0,1000,2000]);assert.deepEqual(result.states.map(s=>s.x),[[0,0,0],[20,0,0],[40,0,0]]);return {candidates:rows.map(r=>r.text),result};
});
await check('assist/quoted-speech',()=>{
  const rows=candidates('「2秒で右へ40歩」と言わせる。');assert.ok(rows.length);for(const row of rows){assert.equal(row.ast.body.length,1);assert.equal(row.ast.body[0].kind,'Say');assert.equal(row.ast.body[0].value.value,'2秒で右へ40歩');assert.equal(row.ast.body[0].seconds,undefined);}return rows.map(r=>r.text);
});
await check('assist/copy-target',()=>{
  const rows=candidates('「ねこ」を2匹コピーする。');assert.ok(rows.length);for(const row of rows){const n=row.ast.body[0];assert.equal(n.kind,'CloneCommand');assert.equal(n.op,'CREATE_TARGET');assert.equal(n.args[0].value,'ねこ');assert.equal(n.count.value,2);}return rows.map(r=>r.text);
});
await check('assist/time-roles',()=>{
  const inputs=['ねこを2秒で右へ40歩移動させる。','ねこは2秒後に右へ40歩移動する。','ねこは2秒待ってから、右へ40歩移動する。'];
  const observations=inputs.map((source,index)=>{
    const rows=candidates(source);assert.ok(rows.length,source);
    for(const row of rows){const b=row.ast.body;if(index===0){assert.equal(b.length,1);assert.equal(b[0].seconds.value.value,2);}else{assert.equal(b.length,2);assert.equal(b[0].kind,'WaitTime');assert.equal(b[0].seconds.value.value,2);assert.equal(b[1].seconds,undefined);assert.equal(b[1].actorRef.name,'ねこ');}}
    const result=run(world(rows[0].source),[0,1000,1999,2000]);
    assert.deepEqual(result.states.map(s=>s.x.map(x=>Math.round(x*1e9)/1e9)),index===0?[[0,0,0],[20,0,0],[39.98,0,0],[40,0,0]]:[[0,0,0],[0,0,0],[0,0,0],[40,0,0]]);return {source,candidates:rows.map(r=>r.text),result};
  });return observations;
});
await check('assist/independent-clause-roles',()=>{
  const sources=['ねこを2秒で右へ40歩移動させて、犬を3秒で左へ60歩移動させる。','ねこは2秒で右へ40歩移動して、犬は3秒で左へ60歩移動する。'];
  const rows=sources.flatMap(source=>{const found=candidates(source);assert.ok(found.length,source);return found;});
  for(const row of rows){const b=row.ast.body;assert.equal(b.length,2);assert.deepEqual(b.map(n=>[n.actorRef.name,n.xDir,n.x.value.value,n.seconds.value.value]),[['ねこ','right',40,2],['犬','left',60,3]]);}
  const result=run(world(rows[0].source),[0,1000,2000,3500,5000]);assert.deepEqual(result.states.map(s=>s.x),[[0,0,0],[20,0,0],[40,0,0],[40,-30,0],[40,-60,0]]);return result;
});
await check('assist/quoted-compound',()=>{
  const rows=candidates('「2秒で右へ40歩」と言わせて、犬は1秒待つ。');assert.ok(rows.length);
  for(const row of rows){const b=row.ast.body;assert.equal(b.length,2);assert.equal(b[0].kind,'Say');assert.equal(b[0].value.value,'2秒で右へ40歩');assert.equal(b[1].kind,'WaitTime');assert.equal(b[1].actorRef.name,'犬');assert.equal(b[1].seconds.value.value,1);}
  const result=run(world(rows[0].source));assert.deepEqual(result.states.map(s=>s.x),[[0,0,0],[0,0,0],[0,0,0]]);return result;
});
await check('assist/equal-numbers-have-distinct-roles',()=>{
  for(const input of ['2倍にする。','ねこは2倍にする。','ねこは大きさを2ばいにする。']){
    const rows=candidates(input);assert.ok(rows.length,input);for(const row of rows){assert.ok(row.text.includes('（大きさ×2）％'),row.text);if(input.startsWith('ねこ'))assert.equal(row.ast.body[0].actorRef.name,'ねこ');}
  }
  const rows=candidates('ねこを2秒で右へ2歩移動させる。');assert.ok(rows.length);
  for(const row of rows){const n=row.ast.body[0];assert.equal(n.actorRef.name,'ねこ');assert.equal(n.x.value.value,2);assert.equal(n.x.unit,'歩');assert.equal(n.seconds.value.value,2);assert.equal(n.seconds.unit,'秒');}return rows.map(r=>r.text);
});
await check('assist/uncertain-meaning-is-not-invented',()=>{
  const inputs=['うさぎを40歩進ませる。','うさぎを右へ40歩進める。','ねこは1分後に右へ40歩移動する。','右に40センチ移動する。','右へ40メートル移動する。','犬に「やあ」と言う。'];
  for(const input of inputs)assert.deepEqual(candidates(input),[],input);return inputs;
});
await check('assist/copy-request-excludes-motion',()=>{
  const rows=candidates('ねこを2匹コピーさせる。');assert.ok(rows.length);
  for(const row of rows){const n=row.ast.body[0];assert.equal(row.ast.body.length,1);assert.equal(n.kind,'CloneCommand');assert.equal(n.args[0].value,'ねこ');assert.equal(n.count.value,2);}return rows.map(r=>r.text);
});
await check('assist/unknown-subject-and-incompatible-units',()=>{
  const inputs=['うさぎを右へ40歩走る。','うさぎを40歩進む。','うさぎは「やあ」としゃべらせる。','うさぎが2秒待ちたい。','ねこは右へ40度移動する。','ねこは右へ40％移動する。','ねこは40％大きくする。','ねこは40 パーセント大きくする。','ねこは右から40歩移動する。','ねこはコピーを作るのをやめる。','ねこは右へ40歩移動するのをやめる。','ねこは右へ40歩移動するふりをする。','ねこは右へ40歩移動することを禁止する。','ねこは右へ40歩未満移動する。','ねこは40パーセント大きくする。','ねこは右へ40m移動する。','ねこは右へ40 m移動する。','ねこは右へ40 cm移動する。','ねこは右へ40 センチ移動する。','ねこは2 sで右へ40歩移動する。','点数を2回コピーする。','うさぎを2回コピーする。','ねこは2回右に40度と左に40度回す。','ねこは2回右へ40歩移動して、犬は左へ20歩移動する。'];
  for(const input of inputs)assert.deepEqual(candidates(input),[],input);return inputs;
});
await check('assist/repetition-is-not-a-single-action',()=>{
  const inputs=['ねこを2回コピーする。','「スペース」と2回言わせる。','ねこは2回「やあ」と言わせる。','ねこは2回右へ40歩移動する。'];
  for(const input of inputs){const rows=candidates(input);assert.ok(rows.length,input);for(const row of rows){const n=row.ast.body[0];assert.equal(n.kind,'RepeatCount');assert.equal(n.count.value.value??n.count.value,2);}}
  return inputs;
});
await check('assist/frequency-stays-frequency',()=>{
  const input='40Hzの音を2回再生する。',rows=candidates(input);
  for(const row of rows){const loop=row.ast.body[0];assert.equal(loop.kind,'RepeatCount');assert.equal(loop.count.value.value??loop.count.value,2);const tone=loop.body[0];assert.equal(tone.kind,'SoundCommand');assert.ok(tone.op.startsWith('TONE'));assert.equal(tone.args[0].unit,'Hz');assert.equal(tone.args[0].value.value,40);}return rows.map(r=>r.text);
});
await check('flow/named-wait',()=>{
  const result=run(world('ねこは1秒待つ。\n犬は10歩進む。\nねこは10歩進む。\n鳥は10歩進む。'));
  assert.deepEqual(result.states.map(s=>s.x),[[0,0,0],[0,0,0],[10,10,10]]);assert.deepEqual(result.moves.map(m=>[m.now,m.name]),[[1000,'犬'],[1000,'ねこ'],[1000,'鳥']]);return result;
});
await check('flow/independent-events',()=>{
  const p=world('ねこは1秒待つ。犬は10歩進む。');p.scripts.push({id:'other',targetId:'sprite-3',event:'start',source:'鳥は20歩進む。'});
  const result=run(p);assert.deepEqual(result.states.map(s=>s.x),[[0,0,20],[0,0,20],[0,10,20]]);return result;
});
await check('flow/explicit-parallel-join',()=>{
  const p=world('次のことを同時に始める。\n  ねこは1秒待つ。\n  犬は10歩進む。\n鳥は10歩進む。');p.scripts[0].mode='meijin';p.scripts[0].targetId='meijin';
  const result=run(p);assert.deepEqual(result.states.map(s=>s.x),[[0,10,0],[0,10,0],[0,10,10]]);return result;
});
await check('flow/save-and-executable',async()=>{
  const p=world('ねこは1秒待つ。犬は10歩進む。'),loaded=await A.parseProjectFile(A.serializeProject(p)),portable=A.createAkariRuntime(),restored=portable.restoreExecutable(A.packExecutable(p));
  const expected=[[0,0,0],[0,0,0],[0,10,0]];
  assert.deepEqual(run(loaded.project).states.map(s=>s.x),expected);assert.deepEqual(run(restored.project,[0,999,1000],portable,restored.compiled).states.map(s=>s.x),expected);return {saved:true,portable:true};
});
await check('compatibility/previous-contract-is-refused',async()=>{
  const p=world('ねこは1秒待つ。犬は10歩進む。'),before=JSON.stringify(p),file=A.serializeProject(p);
  const previous=file.replaceAll('AKARI-PROJECT-F6','AKARI-PROJECT-F5').replace('"formatVersion": 6','"formatVersion": 5').replace('"languageContractId": 5','"languageContractId": 4');
  assert.notEqual(previous,file);await assert.rejects(()=>A.parseProjectFile(previous),e=>e.code==='F502');
  const executable=plain(A.packExecutable(p));executable.languageContractId=4;executable.runtimeContractId=4;executable.projectFormatVersion=5;
  assert.throws(()=>A.createAkariRuntime().restoreExecutable(executable));assert.equal(JSON.stringify(p),before);return {previousFormatRefused:true,currentWorkUnchanged:true};
});
await check('compatibility/producer-label-is-independent',async()=>{
  const p=world(),file=A.serializeProject(p),other=file.replaceAll(currentProductVersion(),'9.2.0');assert.notEqual(file,other);
  const loaded=await A.parseProjectFile(other);assert.equal(loaded.project.scripts[0].source,p.scripts[0].source);
  const executable=plain(A.packExecutable(p));executable.appVersion='9.2.0';const restored=A.createAkariRuntime().restoreExecutable(executable);assert.ok(restored.project);return {file:true,executable:true};
});
const report=writeCaseReport(process.argv[2]||'audit-evidence/meaning-preservation.json','meaning-preservation',results);
for(const r of results)console.log(r.status+' '+r.id+(r.error?' '+r.error.split('\n').slice(0,3).join(' '):''));
if(report.status!=='PASS')process.exitCode=1;
