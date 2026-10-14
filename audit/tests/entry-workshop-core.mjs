import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {currentProductFile} from '../lib/product-path.cjs';import {snapshot} from '../lib/product-test-host.mjs';
import {entrySchemas,tutorialSteps,unitIds,verifyEntryReport,entryProvenance} from '../lib/entry-workshop-contract.mjs';
const product=currentProductFile(),html=fs.readFileSync(product,'utf8'),source=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
const injected=source.replace('const Akari = {','globalThis.entryProbe={normalizeEntryUiLevel,ENTRY_BLOCK_SCHEMA_IDS,BASIC_BLOCK_SCHEMA_IDS,TUTORIAL_STEPS,tutorialAdvance,tutorialAllows};\n  const Akari = {');
assert.notEqual(injected,source,'test-only probe injection');
const context=vm.createContext({console,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,Blob,URL,structuredClone,crypto:crypto.webcrypto,setTimeout,clearTimeout});
vm.runInContext(injected,context,{timeout:30000});const a=context.Akari,d=context.entryProbe;
const report={schema:'akari-entry-workshop-v1',kind:'unit',status:'RUNNING',productFile:product,snapshot:snapshot(product),
 commitSha:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),command:process.argv.join(' '),
 executionBasis:entryProvenance(product),startedAt:new Date().toISOString(),platform:process.platform,node:process.version,results:[]};
const test=(id,fn)=>{try{report.results.push({id,status:'PASS',observations:fn()});console.log('PASS '+id);}catch(e){report.results.push({id,status:'FAIL',observations:{error:e.stack}});console.error('FAIL '+id+' '+e.message);}};
test(unitIds[0],()=>{const cases=[[null,'entry'],['entry','entry'],['basic','basic'],['advanced','advanced'],['all','advanced'],['unknown','basic'],['','basic']];
 for(const [input,expected]of cases)assert.equal(d.normalizeEntryUiLevel(input),expected);return{cases};});
test(unitIds[1],()=>{assert.deepEqual([...d.ENTRY_BLOCK_SCHEMA_IDS],entrySchemas);
 for(const id of [...d.ENTRY_BLOCK_SCHEMA_IDS,...d.BASIC_BLOCK_SCHEMA_IDS]){assert.ok(a.BLOCK_SCHEMA_BY_ID.has(id),id);assert.notEqual(a.BLOCK_SCHEMA_BY_ID.get(id).draftOnly,true,id);}
 for(const id of [...entrySchemas,'IfStatement','Forever','MotionCommand:MOVE','LooksCommand:SHOW','LooksCommand:HIDE','UserActionCall'])assert.ok(d.BASIC_BLOCK_SCHEMA_IDS.has(id),id);
 assert.equal(d.ENTRY_BLOCK_SCHEMA_IDS.has('IfStatement'),false);assert.equal(d.ENTRY_BLOCK_SCHEMA_IDS.has('Forever'),false);
 return{entry:[...d.ENTRY_BLOCK_SCHEMA_IDS],basic:[...d.BASIC_BLOCK_SCHEMA_IDS],internalExposed:false};});
test(unitIds[2],()=>{assert.deepEqual([...d.TUTORIAL_STEPS].map(s=>s.id),tutorialSteps);
 for(const s of d.TUTORIAL_STEPS){for(const k of ['id','goal','message','target','start','allowed','input','ime','success','recovery','next','exit'])assert.ok(k in s,s.id+'/'+k);
 assert.ok(s.allowed.includes('exit'));assert.ok(s.allowed.includes('stop'));assert.ok(s.success);assert.ok(s.ime.includes('confirmed'));}
 return{steps:JSON.parse(JSON.stringify(d.TUTORIAL_STEPS)),exitPerStep:26};});
test(unitIds[3],()=>{const cases=[];
 for(const [index,step]of [...d.TUTORIAL_STEPS].entries()){
  const state={epoch:10,index,phase:'waiting'},facts={confirmedStep:step.id,sameWork:true,pending:false,failed:false,[step.success]:true};
  for(const [reason,f,epoch]of [['unmet',{...facts,[step.success]:false},10],['wrong-work',{...facts,sameWork:false},10],['unconfirmed',{...facts,pending:true},10],['runtime-failed',{...facts,failed:true},10],['stale-callback',facts,9],['no-operation',{...facts,confirmedStep:null},10]]){
   assert.equal(d.tutorialAdvance(state,f,epoch),state,step.id+'/'+reason);cases.push(step.id+'/'+reason);}
  assert.equal(d.tutorialAllows(state,'new-work'),false);assert.equal(d.tutorialAllows(state,'exit'),true);assert.equal(d.tutorialAllows(state,'stop'),true);
  const next=d.tutorialAdvance(state,facts,10);assert.equal(next.index,index+1);assert.equal(state.index,index);
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
report.status=report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';fs.mkdirSync('audit-evidence',{recursive:true});fs.writeFileSync(process.argv[2]||'audit-evidence/entry-workshop-core.json',JSON.stringify(report,null,2)+'\n');
if(report.status==='PASS')verifyEntryReport(report,'unit',snapshot(product),{allowWorkingCopy:true});else process.exitCode=1;
