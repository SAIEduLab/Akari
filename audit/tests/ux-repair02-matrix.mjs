import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {verifyMatrixObserved} from '../lib/ux-repair02-contract.mjs';
import {createRequire} from 'node:module';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {browserEnvironment} from '../lib/browser-environment.mjs';
import {state,node,reveal,install,add,edit,action,speak} from '../lib/ux-repair02-ui.mjs';
const require=createRequire(import.meta.url),[chrome,out]=process.argv.slice(2),product=currentProductFile(),output=path.resolve(out),dir=output+'.artifacts';fs.mkdirSync(dir,{recursive:true});
const cases=JSON.parse(fs.readFileSync(new URL('../fixtures/ux-repair02-matrix.json',import.meta.url))).cases;
const report={schema:'akari-ux-repair02-matrix-v1',status:'RUNNING',snapshot:snapshot(product),uxAcceptance:false,classification:'ordinary GUI automation; not child first-use evidence or real IME',environment:{browser:null,playwright:require('playwright/package.json').version},results:[]};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const rootBody=p=>p.locator('#blockEditor .blockui-world > .blockui-script > .blockui-node-content > [data-blockui-body-wrapper="body"]');
async function putCode(p,text){await p.locator('#codeEditor').fill(text);if(await p.locator('#sourceImportConfirm').isVisible())await p.locator('#sourceImportConfirm').click();}
async function addSay(p,text,where=null){if(where)await where.click();else await rootBody(p).locator(':scope > .blockui-insertion').last().click();await add(p,'Say:timed','話す');const n=p.locator('#blockEditor .blockui-node[data-schema-id="Say"]').last();await edit(n.locator('[data-schema-id="StringLiteral"] [data-blockui-field="value"]'),text);return n;}
async function addWait(p,where=null){if(where)await where.click();else await rootBody(p).locator(':scope > .blockui-insertion').last().click();await add(p,'WaitTime','待つ');await edit(node(p,'WaitTime').locator(':scope > .blockui-node-content > .blockui-node-main [data-blockui-field="value"]').first(),'1');}
async function typeSlot(slot,schema,text=null){await slot.locator(':scope > .blockui-node').click();await slot.locator(':scope > .blockui-slot-head [data-blockui-value-type]').selectOption(schema);if(text!==null)await edit(slot.locator('[data-blockui-field="value"]').first(),text);}
async function chooseExpression(p,slot,schema){const hole=slot.locator('[data-blockui-action="hole-select-expression"]');if(await hole.count())await hole.click();else{await slot.locator(':scope > .blockui-node').click();await slot.locator(':scope > .blockui-slot-head [data-blockui-action="slot-select"]').click();}await add(p,schema,schema);}
async function selectOwner(p,id,event){await p.locator('#objectSelect').selectOption(id);if(event)await p.locator('#eventSelect').selectOption(event);if(await p.locator('#sourceOverview').isVisible())await p.locator('#sourceEditBtn').click();}
async function headingClick(p){await p.locator('#sourceHeadingBtn').click();const r=s=>p.locator('#blockEditor [data-blockui-structured-role="heading.'+s+'"]');await r('enabled').selectOption('yes');await r('event').selectOption('click');await p.locator('#blockEditor [data-blockui-action="heading-commit"]').click();}
async function replaceCode(p,from,to){const e=p.locator('#codeEditor'),text=await e.inputValue(),at=text.indexOf(from);assert.ok(at>=0);await e.focus();await e.evaluate((e,{at,length})=>e.setSelectionRange(at,at+length),{at,length:from.length});await e.press('Backspace');await e.pressSequentially(to);}
async function prepare(p,c,mode){let source=c.source,event='start',extraScripts=[];
 if(['B02','B05','B08','B11','B17','B20','B22'].includes(c.id))source='';
 if(c.id==='B03')source='「おやつにしよう」と2秒話す。\n「ただいま」と2秒話す。';
 if(c.id==='B06')source='3回くり返す。\n  「やあ」と2秒話す。\n  1秒待つ。\n  「おしまい」と2秒話す。';
 if(c.id==='B09')source='「よんだ？」と2秒話す。';
 if(c.id==='B12')source=c.source.replace('1秒待って','3秒待って');
 if(c.id==='B14')source='「合言葉は？」とたずねる。';
 if(c.id==='B15')source='「合言葉は？」とたずねる。\nもし答えが「そら」と同じなら、\n  「どうぞ」と2秒話す。\nそうでなければ、\n  何もしない。';
 if(c.id==='B18')source='2×3を2秒話す。';
 if(c.id==='B20'){event='click';extraScripts=[{id:'reset',targetId:'sprite-1',event:'start',source:'点数を0にする。'}];}
 if(c.id==='B21')source=c.source.replace('2番目','1番目');
 if(c.id==='B23'){source='「おはよう」と2秒話す。';extraScripts=[{id:'dango-click',targetId:'dango',event:'click',source:''}];}
 await install(p,source,{mode,level:'basic',event,extraScripts});
 if(c.id==='B08')await selectOwner(p,'dango','click');
 if(c.id==='B23')await selectOwner(p,'dango','click');
 if(c.id==='B15'&&mode==='blocks'){const branch=p.locator('#blockEditor [data-blockui-body-wrapper="elseBody"]');await action(branch.locator('[data-schema-id="NoOperation"]'),'remove');}
 if(c.id==='B15'&&mode==='code')await putCode(p,source.replace('  何もしない。',''));
 return {source,event,initial:await state(p)};
}
async function perform(p,c,mode){const e=p.locator('#codeEditor');
 if(mode==='code'){
  if(['B02','B05','B08','B11','B14','B17','B20','B22','B23'].includes(c.id))await putCode(p,c.source);
  if(c.id==='B03'){await e.focus();await e.press('Control+Home');await e.press('Shift+ArrowDown');await e.press('Control+x');await e.press('Control+End');await e.press('Enter');await e.press('Control+v');}
  if(c.id==='B06'){await e.focus();await e.press('Control+End');await e.press('Home');await e.press('Delete');await e.press('Delete');}
  if(c.id==='B09'){await headingClick(p);await p.locator('#editorModecode').click();}
  if(c.id==='B12'){await replaceCode(p,'3','1');if(await p.locator('#sourceImportEditCurrent').isVisible())await p.locator('#sourceImportEditCurrent').click();else if(await p.locator('#sourceImportConfirm').isVisible())await p.locator('#sourceImportConfirm').click();}
  if(c.id==='B15'){await e.press('Control+End');await e.pressSequentially('  「ちがうよ」と2秒話す。');}
  if(c.id==='B18')await replaceCode(p,'×','＋');
  if(c.id==='B21'){await replaceCode(p,'『買うもの』','リスト「買うもの」');await replaceCode(p,'1番目','2番目');}
  if(c.id==='B22'){await speak(p,'こんにちは');await p.locator('#editorModeblocks').click();await p.locator('#editorModecode').click();await replaceCode(p,'こんにちは','おはよう');await p.locator('#editorModeblocks').click();await p.locator('#undoBtn').click();await p.locator('#editorModecode').click();}
  if(c.id==='B24'){const text=await e.inputValue(),at=text.indexOf('そのあと');await e.focus();await e.evaluate((e,n)=>e.setSelectionRange(n,e.value.length),at);await e.press('Backspace');assert.notEqual(await e.inputValue(),text);await p.locator('#undoBtn').click();assert.equal((await state(p)).source,text);}
  return;
 }
 if(c.id==='B02'){await addSay(p,'おはよう');await addSay(p,'いってきます');}
 if(c.id==='B03'){await action(p.locator('#blockEditor .blockui-node[data-schema-id="Say"]').nth(1),'move');await rootBody(p).locator(':scope > .blockui-insertion').first().click();}
 if(c.id==='B05'){await add(p,'RepeatCount','RepeatCount');const r=node(p,'RepeatCount');await edit(r.locator(':scope > .blockui-node-content > .blockui-node-main [data-blockui-field="value"]').first(),'2');await addSay(p,'こっちだよ',r.locator('[data-blockui-action="hole-select-statement"]'));await addWait(p,r.locator('[data-blockui-body-wrapper="body"] > .blockui-insertion').last());await addSay(p,'おしまい');}
 if(c.id==='B06'){await action(p.locator('#blockEditor .blockui-node[data-schema-id="Say"]').last(),'move');await rootBody(p).locator(':scope > .blockui-insertion').last().click();}
 if(c.id==='B08')await addSay(p,'なあに？');
 if(c.id==='B09')await headingClick(p);
 if(c.id==='B11'){await addSay(p,'こんにちは');await selectOwner(p,'dango','start');await addWait(p);await addSay(p,'やあ');}
 if(c.id==='B12')await edit(node(p,'WaitTime').locator(':scope > .blockui-node-content > .blockui-node-main [data-blockui-field="value"]').first(),'1');
 if(c.id==='B14'){await rootBody(p).locator(':scope > .blockui-insertion').last().click();await add(p,'IfStatement','IfStatement');const branch=node(p,'IfStatement'),condition=branch.locator(':scope > .blockui-node-content > .blockui-node-main > [data-blockui-input="condition"]');await chooseExpression(p,condition,'CompareExpression:EQ');const q=node(p,'CompareExpression:EQ');await typeSlot(q.locator(':scope > .blockui-node-content > .blockui-node-main > [data-blockui-input="left"]'),'SensorRead:答え');await typeSlot(q.locator(':scope > .blockui-node-content > .blockui-node-main > [data-blockui-input="right"]'),'StringLiteral','ほし');await addSay(p,'どうぞ',branch.locator('[data-blockui-body-wrapper="thenBody"] [data-blockui-action="hole-select-statement"]'));await branch.locator('[data-blockui-action="else-add"]').click();await addSay(p,'もういちど',branch.locator('[data-blockui-body-wrapper="elseBody"] [data-blockui-action="hole-select-statement"]'));}
 if(c.id==='B15')await addSay(p,'ちがうよ',p.locator('#blockEditor [data-blockui-body-wrapper="elseBody"] [data-blockui-action="hole-select-statement"]'));
 if(c.id==='B17'){const say=await addSay(p,'計算');const slot=say.locator(':scope > .blockui-node-content > .blockui-node-main > [data-blockui-input="value"]');await chooseExpression(p,slot,'BinaryExpression:SUB');const q=node(p,'BinaryExpression:SUB');await typeSlot(q.locator(':scope > .blockui-node-content > .blockui-node-main > [data-blockui-input="left"]'),'NumberLiteral','4');await typeSlot(q.locator(':scope > .blockui-node-content > .blockui-node-main > [data-blockui-input="right"]'),'NumberLiteral','1');}
 if(c.id==='B18')await p.getByLabel('演算子だけを変える').selectOption('BinaryExpression:ADD');
 if(c.id==='B20'){await add(p,'NumericUpdate:ADD','NumericUpdate:ADD');const update=node(p,'NumericUpdate:ADD');await update.locator('[data-blockui-hole-target]').selectOption('点数');const slot=update.locator('[data-blockui-input="value"]');await chooseExpression(p,slot,'NumberLiteral');await edit(slot.locator('[data-blockui-field="value"]'),'1');await addSay(p,'点数');const picker=p.getByLabel('話す文字か、データの値を選ぶ');await reveal(picker);await picker.selectOption({label:'作品の点数の今の値'});}
 if(c.id==='B21'){await p.getByLabel('文字の代わりに使うリストを選ぶ').selectOption({index:1});await edit(node(p,'ListRead').locator('[data-blockui-input="index"] [data-blockui-field="value"]'),'2');}
 if(c.id==='B22'){const say=await addSay(p,'こんにちは'),field=say.locator('[data-schema-id="StringLiteral"] [data-blockui-field="value"]');await speak(p,'こんにちは');await edit(field,'おはよう');await p.locator('#undoBtn').click();assert.equal((await state(p)).ast.body[0].value.value,'こんにちは');}
 if(c.id==='B23')await addSay(p,'なあに？');
 if(c.id==='B24'){const before=await state(p);await action(p.locator('#blockEditor .blockui-node[data-schema-id="Say"]').nth(1),'remove');assert.equal((await state(p)).ast.body.length,1);await p.locator('#undoBtn').click();assert.equal((await state(p)).source,before.source);}
}
// Read the project produced by ordinary GUI operations. The separate clock below
// evaluates that real result; it does not edit the UI or synthesize a GUI success.
async function virtualMeaning(p,project,runs){return p.evaluate(({project,runs})=>{
 const a=Akari,plain=v=>JSON.parse(JSON.stringify(v)),inputSources=project.scripts.map(({id,targetId,event,source})=>({id,targetId,event,source}));
 const executions=runs.map(({steps})=>{
  const compiled=a.compileProject(project),errors=Array.from(compiled.errors,e=>e.code),trace=[],samples=[],questions=[];
  if(errors.length)return {errors,initialScore:null,trace,samples,questions};
  let now=0,reply=null;const runtime=new a.RuntimeModel(project,{});runtime.now=()=>now;
  const initialScore=runtime.projectVars.get('点数');
  const scheduler=new a.EventScheduler(project,compiled,runtime,{
   say:(actor,text)=>trace.push({at:now,kind:'say',actor,text}),clearSpeech:actor=>trace.push({at:now,kind:'clear',actor}),
   ask:(text,cb)=>{questions.push(text);trace.push({at:now,kind:'ask',text});reply=cb;},runtimeError:(_,e)=>errors.push(e.code)});
  scheduler.schedule=()=>{};
  const pump=()=>{scheduler.recheckBlocked(true);let turns=0;while(scheduler.ready.length&&turns++<1000)scheduler.runTurn(true);if(turns>=1000)throw Error('virtual scheduler did not settle');};
  try{scheduler.start();pump();for(const step of steps){now=step.at;if(step.click)scheduler.spawnForRuntime(step.click,'click',{});if(Object.hasOwn(step,'answer')){if(!reply)throw Error('answer without a pending question');const current=reply;reply=null;current(step.answer);}pump();const visible={};for(const e of trace){if(e.kind==='say')visible[e.actor]=e.text;if(e.kind==='clear')delete visible[e.actor];}samples.push({at:now,visible,score:runtime.projectVars.get('点数')});}return plain({errors,initialScore,trace,samples,questions,activeTasks:scheduler.tasks.size,pendingQuestion:!!reply});}
  finally{scheduler.stop();}
 });return {classification:'actual GUI result / separate exact virtual clock',inputSources,executions};
},{project,runs});}
async function observe(p,c){await p.evaluate(()=>{window.matrixSpeech=[];window.matrixObserver?.disconnect();window.matrixObserver=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1&&n.classList.contains('sprite-bubble'))matrixSpeech.push({actor:n.dataset.runtimeId,text:n.querySelector('.sprite-bubble-text').textContent,at:performance.now()});});matrixObserver.observe(document.querySelector('#formSurface'),{childList:true});});const repetitions=c.rerun?2:1,observed=[];
 for(let run=0;run<repetitions;run++){
  if(c.answers){for(const [answer,text]of c.answers){await p.locator('#runBtn').click();await p.locator('#questionModal.show').waitFor();await p.locator('#questionAnswer').fill(answer);await p.locator('#questionAnswer').press('Enter');await p.waitForFunction(t=>document.querySelector('.sprite-bubble-text')?.textContent===t,text);observed.push({answer,text});await p.locator('#stopBtn').click();}continue;}
  await p.evaluate(()=>{matrixSpeech.length=0;});await p.locator('#runBtn').click();if(c.click){assert.equal(await p.locator('.sprite-bubble').count(),0);for(let click=0;click<(c.id==='B20'?3:1);click++){await p.locator('#formSurface .component[data-id="'+c.click+'"]').click();await p.waitForFunction(n=>matrixSpeech.length===n,click+1);}}
  if(c.id==='B23'){await p.waitForFunction(()=>matrixSpeech.some(s=>s.text==='おはよう'));await p.locator('#formSurface .component[data-id="dango"]').click();}
  await p.waitForFunction(n=>matrixSpeech.length>=n,c.speech.length,{timeout:12000});const trace=await p.evaluate(()=>structuredClone(matrixSpeech));assert.deepEqual(trace.map(s=>s.text),c.speech);const speakers=c.id==='B08'?['dango']:['B10','B11','B12','B23'].includes(c.id)?['sprite-1','dango']:c.speech.map(()=> 'sprite-1');assert.deepEqual(trace.map(s=>s.actor),speakers);observed.push(trace);if(['B10','B11','B12'].includes(c.id))assert.equal(await p.locator('.sprite-bubble').count(),2,'both actors speak concurrently after the one-second wait');await p.screenshot({path:path.join(dir,c.id+'-'+report.currentMode+'-run'+run+'.png')});await p.locator('#stopBtn').click();
 }return observed;
}
try{await withBrowser(chrome,async browser=>{report.environment.browser=browser.version();assert.equal(browser.version(),browserEnvironment.version);for(const mode of ['code','blocks'])for(const c of cases){report.currentMode=mode;const row={id:c.id+'/'+mode,status:'RUNNING',original:c.fixedOriginal||c.source};report.results.push(row);try{row.observed=await pageFor(browser,product,async p=>{await p.setViewportSize({width:1188,height:848});p.setDefaultTimeout(8000);p.on('dialog',d=>d.accept());const initial=await prepare(p,c,mode);try{await perform(p,c,mode);const runtime=await observe(p,c),final=await state(p);if(c.id==='B23'){const a=JSON.parse(initial.initial.project).scripts.find(s=>s.id==='main'),b=JSON.parse(final.project).scripts.find(s=>s.id==='main');assert.deepEqual(b,a);assert.equal(JSON.parse(final.project).scripts.filter(s=>s.targetId==='sprite-1'&&s.event==='start').length,1);}await p.screenshot({path:path.join(dir,row.id.replace('/','-')+'.png')});const initialProject=JSON.parse(initial.initial.project),finalProject=JSON.parse(final.project),meaning=await virtualMeaning(p,finalProject,c.virtualRuns),initialMeaning=c.initialVirtual?await virtualMeaning(p,initialProject,[c.initialVirtual]):null;const observed={ordinaryGUI:true,preparedInitialSource:initial.source,initialProject,finalProject,source:final.source,owner:final.owner,runtime,meaning,initialMeaning,originalFirstAcceptance:c.explicitRecovery?'requires explicit list recovery':'covered by original or construction path',privateApiEdit:false};verifyMatrixObserved(c,mode,observed);return observed;}catch(e){await p.screenshot({path:path.join(dir,row.id.replace('/','-')+'-failure.png')}).catch(()=>{});throw e;}});row.status='PASS';}catch(e){row.status='FAIL';row.error=e.stack;}save();console.log(row.status+' '+row.id);}},900000);}catch(e){report.hostFailure=e.stack;}delete report.currentMode;report.status=!report.hostFailure&&report.results.length===48&&report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';save();if(report.status!=='PASS')process.exitCode=1;
