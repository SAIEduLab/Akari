import {auditRoute,auditOperation,routeLeaves} from '../lib/entry-lesson-routes.mjs';
import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {currentProductFile} from '../lib/product-path.cjs';import {snapshot} from '../lib/product-test-host.mjs';
import {entrySchemas,tutorialSteps,unitIds,verifyEntryReport,entryProvenance} from '../lib/entry-workshop-contract.mjs';
const product=currentProductFile(),html=fs.readFileSync(product,'utf8'),source=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
const injected=source.replace('const Akari = {','globalThis.entryProbe={makeTutorialProject,tutorialExpectedTrees,tutorialCourseSteps,tutorialExtensionSteps,tutorialField,tutorialDefine,normalizeEntryUiLevel,ENTRY_BLOCK_SCHEMA_IDS,BASIC_BLOCK_SCHEMA_IDS,TUTORIAL_STEPS,tutorialAdvance,tutorialAllows};\n  const Akari = {');
assert.notEqual(injected,source,'test-only probe injection');
const context=vm.createContext({console,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,Blob,URL,structuredClone,crypto:crypto.webcrypto,setTimeout,clearTimeout});
vm.runInContext(injected,context,{timeout:30000});const a=context.Akari,d=context.entryProbe;
const report={schema:'akari-entry-workshop-v1',kind:'unit',status:'RUNNING',productFile:product,snapshot:snapshot(product),
 commitSha:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),command:process.argv.join(' '),
 executionBasis:entryProvenance(product),startedAt:new Date().toISOString(),platform:process.platform,node:process.version,results:[]};
const test=(id,fn)=>{try{report.results.push({id,status:'PASS',observations:fn()});console.log('PASS '+id);}catch(e){report.results.push({id,status:'FAIL',observations:{error:e.stack}});console.error('FAIL '+id+' '+e.message);}};
function lessonRoute(course='score',leaf='goal'){
 const steps=[...d.TUTORIAL_STEPS,...d.tutorialCourseSteps(course,3,course)];
 const offset=course==='score'?5:4;
 steps.push(...d.tutorialExtensionSteps(course,leaf,offset,course+'-'+leaf),
 d.tutorialDefine({id:'save-work',action:'save',message:'save'}),d.tutorialDefine({id:'verify-save',action:'verify-save',message:'verify'}));return steps;
}
test(unitIds[0],()=>{const cases=[[null,'entry'],['entry','entry'],['basic','basic'],['advanced','advanced'],['all','advanced'],['unknown','basic'],['','basic']];
 for(const [input,expected]of cases)assert.equal(d.normalizeEntryUiLevel(input),expected);return{cases};});
test(unitIds[1],()=>{assert.deepEqual([...d.ENTRY_BLOCK_SCHEMA_IDS],entrySchemas);
 for(const id of [...d.ENTRY_BLOCK_SCHEMA_IDS,...d.BASIC_BLOCK_SCHEMA_IDS]){assert.ok(a.BLOCK_SCHEMA_BY_ID.has(id),id);assert.notEqual(a.BLOCK_SCHEMA_BY_ID.get(id).draftOnly,true,id);}
 for(const id of [...entrySchemas,'IfStatement','Forever','MotionCommand:MOVE','LooksCommand:SHOW','LooksCommand:HIDE','UserActionCall'])assert.ok(d.BASIC_BLOCK_SCHEMA_IDS.has(id),id);
 assert.equal(d.ENTRY_BLOCK_SCHEMA_IDS.has('IfStatement'),false);assert.equal(d.ENTRY_BLOCK_SCHEMA_IDS.has('Forever'),false);
 return{entry:[...d.ENTRY_BLOCK_SCHEMA_IDS],basic:[...d.BASIC_BLOCK_SCHEMA_IDS],internalExposed:false};});
test(unitIds[2],()=>{
 const routes=[];
 for(const [course,leaves]of Object.entries(routeLeaves))for(const leaf of leaves){
  const practice=d.makeTutorialProject(),steps=lessonRoute(course,leaf);
  assert.deepEqual(steps.map(s=>s.id),auditRoute(course,leaf));
  for(const s of steps){for(const k of ['id','goal','message','target','start','allowed','input','ime','success','recovery','next','exit'])assert.ok(k in s,s.id+'/'+k);assert.ok(s.allowed.includes('exit')&&s.allowed.includes('stop'));}
  const states=d.tutorialExpectedTrees(practice,steps);assert.equal(states.length,steps.length+1);
  assert.equal(practice.scripts[0].source,'ほかの実行をすべて止める。','only the visible click guard is provided');
  const finalSource=a.formatScript(a.blockDecode(states.at(-1)));practice.scripts[0].source=finalSource;
  const compiled=a.compileProject(practice);assert.equal(compiled.errors.length,0,JSON.stringify(compiled.errors));
  const runtime=new a.RuntimeModel(practice,{});let clock=0,serial=0,pending=[];const says=[],tones=[],turns=[];
  runtime.now=()=>clock;runtime.pauseClock=()=>{};runtime.resumeClock=()=>{};
  runtime.startTone=(frequency,seconds,ctx,ended)=>{const id=++serial;tones.push({frequency,seconds});pending.push({at:clock+seconds*1000,finish:()=>ended?.(id)});return id;};
  const scheduler=new a.EventScheduler(practice,compiled,runtime,{say:(id,text)=>says.push(text),beforeStatement:(task,node)=>{if(node.kind==='MotionCommand'&&node.op==='TURN_RIGHT')turns.push(node);}});scheduler.schedule=()=>{};
  const drain=()=>{for(let i=0;i<20000&&(scheduler.ready.length||scheduler.blocked.size||pending.length);i++){clock+=10;const due=pending.filter(x=>x.at<=clock);pending=pending.filter(x=>x.at>clock);for(const item of due)item.finish();scheduler.runTurn();}assert.equal(scheduler.ready.length+scheduler.blocked.size,0,'bounded completion');};
  scheduler.start();const catches=[];
  for(let i=1;i<=6;i++){scheduler.spawnForRuntime('sprite-1','click');drain();const actor=runtime.actor('sprite-1'),score=runtime.projectVars.get('点数');
   assert.ok(actor.x>=0&&actor.x<=540&&actor.y>=80&&actor.y<=300,'fish stays reachable');
   assert.equal(score,course==='score'?(leaf==='bonus'&&i>=3?i+2:i):0,'independent scoring expectation');
   catches.push({click:i,score,x:actor.x,y:actor.y,scale:actor.scalePercent,costume:actor.costumeId});
  }
  assert.equal(says.filter(x=>x==='つかまった！').length,6);
  if(leaf==='small'||leaf==='costume')assert.equal(catches.at(-1).scale,70);
  if(leaf==='costume'){assert.equal(catches[0].costume,'costume-orange');assert.equal(catches[1].costume,'costume-blue');}
  if(leaf==='dance')assert.equal(turns.length,18);
  if(leaf==='melody')assert.deepEqual(tones.slice(0,4).map(t=>t.frequency),[880,523,659,784]);
  if(leaf==='goal')assert.equal(says.filter(x=>x==='クリア！').length,2);
  if(leaf==='bonus')assert.equal(says.filter(x=>x==='クリア！').length,1);
  if(leaf==='remaining')assert.equal(runtime.actor('practice-board').text,'あと：4');
  if(leaf==='zigzag')assert.ok(Math.abs(catches.at(-1).x-430)<1e-8,'floating-point glide returns to its start');
  scheduler.stop();runtime.reset(1);scheduler.start();for(let i=0;i<20;i++)scheduler.spawnForRuntime('sprite-1','click');drain();
  assert.equal(runtime.projectVars.get('点数'),course==='score'?1:0,'burst cannot duplicate the score');scheduler.stop();
  const change=steps.find(s=>s.free),chosen=auditOperation(change.id,course,leaf).value;
  const altered=d.tutorialExpectedTrees(d.makeTutorialProject(),steps,{[change.id]:chosen}),changeIndex=steps.indexOf(change),role=d.tutorialField(altered[changeIndex+1],change);
  assert.equal(role.node.fields[role.key],chosen);assert.equal(d.tutorialField(altered.at(-1),change).node.fields[role.key],change.value,'one Undo restores the changed numeric field');
  routes.push({key:course+'/'+leaf,steps:steps.map(s=>s.id),finalSource,catches,chosen,undoRestored:true,rapidBurst:20,audioTiming:'simulated callbacks; not acoustic verification'});
 }
 return {routes,steps:lessonRoute().map(s=>s.id),exitPerStep:tutorialSteps.length};
});
test(unitIds[3],()=>{const cases=[];
 for(const [index,step]of lessonRoute().entries()){
  const state={epoch:10,index,phase:'waiting',steps:lessonRoute()},facts={confirmedStep:step.id,sameWork:true,pending:false,failed:false,[step.success]:true};
  for(const [reason,f,epoch]of [['unmet',{...facts,[step.success]:false},10],['wrong-work',{...facts,sameWork:false},10],['unconfirmed',{...facts,pending:true},10],['runtime-failed',{...facts,failed:true},10],['stale-callback',facts,9],['no-operation',{...facts,confirmedStep:null},10]]){
   assert.equal(d.tutorialAdvance(state,f,epoch),state,step.id+'/'+reason);cases.push(step.id+'/'+reason);}
  assert.equal(d.tutorialAllows(state,'new-work'),false);assert.equal(d.tutorialAllows(state,'exit'),true);assert.equal(d.tutorialAllows(state,'stop'),true);
  const next=d.tutorialAdvance(state,facts,10);assert.equal(next.index,step.action==='choice'?index:index+1);assert.equal(state.index,index);
  assert.equal(d.tutorialAdvance(next,facts,10),next,'duplicate completed predicate cannot advance another step');
  assert.equal(d.tutorialAdvance({...state,phase:'exited'},facts,10).index,index);
  cases.push(step.id+'/valid',step.id+'/duplicate',step.id+'/exited');
 }
 return{cases,count:cases.length};});
const value=n=>n.kind==='UnaryExpression'?-value(n.value):n.value;
test(unitIds[4],()=>{const cases=[];for(const [x,y]of [[34,56],[-25.5,76.125],[1234.125,-1234.75],[0,0]]){
 const p=a.makeEmptyProject();Object.assign(p.components[0],{x,y});const c={targetId:'sprite-1',event:'start'},s=a.createEditorSession('script:sprite-1:start','',c,p);
 for(const [schema,positions]of [['MotionCommand:GOTO',[[0,x],[1,y]]],['MotionCommand:GLIDE',[[1,x],[2,y]]],['MotionCommand:SET_X',[[0,x]]],['MotionCommand:SET_Y',[[0,y]]]]){
  const before=JSON.stringify(p),r=a.blockInsertionAvailability(s,schema,{parentId:s.blockView.id,body:'body',index:0},{project:p,context:c});
  assert.equal(r.enabled,true,r.reason);const decoded=a.blockDecode(r.node,{expected:'statement'});for(const [index,expected]of positions)assert.equal(value(decoded.args[index]),expected);
  assert.equal(JSON.stringify(p),before);cases.push({schema,x,y,source:a.formatScript({kind:'Script',body:[decoded]})});
 }}return{cases,decimalPreserved:true,designNotMutated:true};});
test(unitIds[5],()=>{const p=a.makeEmptyProject();Object.assign(p.components[0],{x:35.5,y:-48.25});
 for(const schema of ['MotionCommand:GOTO','MotionCommand:GLIDE'])assert.ok(a.blockDecode(a.createBlock(schema,{project:p,targetId:'sprite-1'}),{expected:'statement'}).args.every(n=>value(n)===0));
 for(const targetId of ['stage','absent']){const c={targetId,event:'start'},s=a.createEditorSession('script:'+targetId+':start','',c,p);const r=a.blockInsertionAvailability(s,'MotionCommand:GOTO',{parentId:s.blockView.id,body:'body',index:0},{project:p,context:c});if(r.node)assert.ok(a.blockDecode(r.node,{expected:'statement'}).args.every(n=>value(n)===0));}
 return{apiDefault:[0,0],missingTargetDefault:[0,0],stageDefault:[0,0]};});
test(unitIds[6],()=>{const bytes=cp.execFileSync('git',['show','HEAD:'+product],{maxBuffer:64*1024*1024});assert.ok(bytes.length>1024*1024,'actual single HTML exceeds the old child-process buffer');const expected=crypto.createHash('sha256').update(bytes).digest('hex');assert.equal(entryProvenance(product).committedProductSha256,expected);return{bytes:bytes.length,committedProductSha256:expected,fullGitBlobRead:true};});
report.status=report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';fs.mkdirSync('audit-evidence',{recursive:true});fs.writeFileSync(process.argv[2]||'audit-evidence/entry-workshop-core.json',JSON.stringify(report,null,2)+'\n');
if(report.status==='PASS')verifyEntryReport(report,'unit',snapshot(product),{allowWorkingCopy:true});else process.exitCode=1;
