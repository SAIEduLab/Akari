import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {currentProductFile} from '../lib/product-path.cjs';
import {sha,withBrowser,pageFor} from '../lib/product-test-host.mjs';
import {browserEnvironment} from '../lib/browser-environment.mjs';
import {scenarios,ambiguities,numericOracles,corpusSha256,actors} from '../lib/japanese-intent-oracles.mjs';
import {browserScenario} from '../lib/japanese-intent-browser-harness.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(import.meta.url);
const [chrome,output,filter='']=process.argv.slice(2);
if(!chrome||!output||fs.existsSync(output))throw Error('Usage: node audit/tests/japanese-intent-browser.mjs CHROME NEW_REPORT.json [ID_SUBSTRING]. A filtered run is always INCOMPLETE.');
const corpusBytes=fs.readFileSync(path.join(root,'docs/1.0.2/child-intent-corpus.json'));
assert.equal(sha(corpusBytes),corpusSha256,'fixed independent intent oracle changed');
const corpus=JSON.parse(corpusBytes);assert.equal(corpus.cases.length,20);assert.equal(scenarios.length,20);
assert.deepEqual(scenarios.map(c=>c.id),corpus.cases.map(c=>c.id));
const evidenceDir=output.replace(/\.json$/,'')+'.artifacts';assert.ok(!fs.existsSync(evidenceDir),'fresh artifacts required');fs.mkdirSync(evidenceDir,{recursive:true});
// Freeze the exact tested product, because another integration process may still
// be editing the working copy. Only this copy is navigated, always over file://.
const product=path.resolve(root,currentProductFile()),candidate=path.join(evidenceDir,'candidate.html');fs.copyFileSync(product,candidate);
const report={schemaVersion:1,status:'RUNNING',scope:'GA-EXEC / real Chrome / independent 1.0.2 intent contract',candidate:{source:product,testedFile:candidate,sha256:sha(fs.readFileSync(candidate)),url:pathToFileURL(candidate).href},
 oracle:{corpusSha256,provenance:corpus.provenance,cases:corpus.cases,structuredSources:scenarios},auditInputs:Object.fromEntries(['audit/tests/japanese-intent-browser.mjs','audit/lib/japanese-intent-oracles.mjs','audit/lib/japanese-intent-browser-harness.mjs'].map(f=>[f,sha(fs.readFileSync(path.join(root,f)))])),environment:{protocol:'file:',chromePath:chrome},results:[],filter:filter||null};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');save();
const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b} by more than ${tolerance}`);
const actor=(state,id=actors.cat)=>{const a=state.actors.find(x=>x.id===id);assert.ok(a,'missing actor '+id);return a;};
const says=o=>o.trace.filter(x=>x.kind==='say'),moves=(o,id=actors.cat)=>o.trace.filter(x=>x.kind==='motion'&&x.id===id);
function verifyIntent(id,o){
 assert.deepEqual(o.errors,[]);assert.ok(o.roundtrips.length>0);const end=actor(o.final),speech=says(o),motion=moves(o);
 switch(id){
  case 'CI-01':close(end.x,10);close(end.direction,180);close(actor(o.final,actors.dog).x,100);assert.deepEqual(speech.map(x=>[x.id,x.value]),[[actors.dog,'着いたよ']]);assert.equal(motion.length,1);break;
  case 'CI-02':close(end.x,10);close(actor(o.final,actors.dog).direction,180);assert.deepEqual(speech.map(x=>[x.id,x.value]),[[actors.cat,'できたよ']]);break;
  case 'CI-03':assert.equal(motion.length,4);assert.deepEqual(motion.map(m=>m.after.y-m.before.y),[-20,20,-20,20]);assert.equal(o.checkpoints[0].says,0);break;
  case 'CI-04':close(actor(o.checkpoints[2]).x,10);close(actor(o.checkpoints[3]).x,20);close(end.x,20);assert.ok(o.trace.some(t=>t.kind==='continuous'));break;
  case 'CI-05':close(actor(o.checkpoints[1]).x,0);close(end.x,10);assert.equal(motion.length,1);break;
  case 'CI-06':close(actor(o.checkpoints[1]).x,20);assert.equal(o.checkpoints[1].says,0);assert.equal(o.checkpoints[2].says,0);close(end.x,40);assert.deepEqual(speech.map(s=>[s.id,s.value,s.time]),[[actors.dog,'ぼくも行くよ',2000]]);break;
  case 'CI-07':assert.equal(motion.length,8);for(let i=0;i<8;i++)assert.equal(motion[i].before.direction===motion[i].after.direction,i%2===0);close(end.x,0);close(end.y,0);break;
  case 'CI-08':assert.deepEqual(o.trace.filter(t=>t.kind==='stamp').map(t=>[t.actor.x,t.actor.y]),[[0,0],[20,0],[40,0],[0,20],[20,20],[40,20]]);break;
  case 'CI-09':assert.deepEqual(speech.map(s=>s.value),['できたね','10']);break;
  case 'CI-10':assert.deepEqual(speech,[]);break;
  case 'CI-11':assert.deepEqual(speech.map(s=>s.value),['いまは3点だよ']);break;
  case 'CI-12':assert.equal(o.checkpoints[1].says,0);assert.deepEqual(speech.map(s=>s.value),['青い ねこ「※」さん、こんにちは']);assert.equal(new Map(o.final.vars).get('保存名'),'青い ねこ「※」');break;
  case 'CI-13':assert.deepEqual(new Map(o.final.lists).get('持ち物'),['本','かさ','ぼうし']);break;
  case 'CI-14':assert.deepEqual(speech.map(s=>[s.value,s.time]),[['アキ',0],['ハル',2000],['アキ',4000]]);assert.deepEqual(new Map(o.final.lists).get('参加者'),['アキ','ハル','アキ']);break;
  case 'CI-15':assert.deepEqual(motion.map(m=>m.after.y-m.before.y),[-20,20,-20,20]);break;
  case 'CI-16':assert.equal(new Map(o.final.vars).get('長さ'),99);assert.deepEqual(motion.filter(m=>m.before.direction===m.after.direction).map(m=>Math.round(Math.hypot(m.after.x-m.before.x,m.after.y-m.before.y))),[20,20,20,20,50,50,50,50]);break;
  case 'CI-17':assert.equal(new Map(o.final.vars).get('合計'),250);assert.deepEqual(speech,[]);break;
  case 'CI-18':close(actor(o.checkpoints[1]).x,0);close(actor(o.checkpoints[2]).x,0);close(end.x,10);assert.equal(motion[0].time,2000);assert.deepEqual(speech.map(s=>[s.value,s.time]),[['犬完了',1000],['鳥完了',2000]]);break;
  case 'CI-19':assert.equal(o.checkpoints[0].actors.filter(a=>a.isClone).length,5);assert.equal(o.final.actors.filter(a=>a.isClone).length,0);close(end.x,0);assert.equal(new Set(o.trace.filter(t=>t.kind==='motion'&&t.id!==actors.cat).map(t=>t.id)).size,5);break;
  default:throw Error('missing independent verifier '+id);
 }
}
async function reveal(l){
 if(!await l.isVisible())for(const panel of await l.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())await panel.locator('.blockui-side-toggle').click();
 for(const detail of await l.locator('xpath=ancestor::details[not(@open)]').all())await detail.locator(':scope > summary').click();return l;
}
const click=async(p,id)=>(await reveal(p.locator('#'+id))).click();
async function fill(p,source){if(!await p.locator('#codeEditor').isVisible()&&await p.locator('#editorModecode').isVisible())await click(p,'editorModecode');if(await p.locator('#sourceOverview').isVisible())await click(p,'sourceEditBtn');await (await reveal(p.locator('#codeEditor'))).fill(source);await p.waitForTimeout(400);}
const uiState=p=>p.evaluate(()=>{const s=Akari.app.editorState;return{source:s.main.sourceText,project:JSON.stringify(Akari.app.project),history:s.history,redo:s.redo,dirty:s.dirty,state:s.state,pending:!!s.main.pendingEdit};});
async function installProject(p,scenario){const project=await p.evaluate(browserScenario,{scenario,projectOnly:true});const text=await p.evaluate(project=>Akari.serializeProject(project,Akari.makeDefaultAssetStore()),project);
 await p.locator('#fileInput').setInputFiles({name:'intent.akari.md',mimeType:'text/plain',buffer:Buffer.from(text)});await p.waitForFunction(name=>Akari.app.project.name===name,project.name);if(await p.locator('#uiLevel').count())await p.locator('#uiLevel').selectOption('advanced');await(await reveal(p.locator('#objectSelect'))).selectOption(project.scripts[0].targetId);await(await reveal(p.locator('#eventSelect'))).selectOption(project.scripts[0].event);return project;
}
async function observeUi(p){await p.evaluate(()=>{globalThis.__intentObserved={say:[],start:0,motion:[]};const Q=Akari.EventScheduler.prototype,start=Q.start,execute=Q.executeNode;
 Q.start=function(...args){__intentObserved.start++;globalThis.__intentScheduler=this;const say=this.ui.say;this.ui.say=(id,value)=>{__intentObserved.say.push({id,value,time:performance.now()});return say?.(id,value);};return start.apply(this,args);};
 Q.executeNode=function(t,n){const before=[...this.runtime.actors].map(([id,a])=>({id,x:a.x,y:a.y})),result=execute.call(this,t,n);for(const[id,a]of this.runtime.actors){const b=before.find(x=>x.id===id);if(b&&(a.x!==b.x||a.y!==b.y))__intentObserved.motion.push({id,x:a.x,y:a.y,time:performance.now()});}return result;};});}

let selected=0;
try{await withBrowser(chrome,async browser=>{
 report.environment={...report.environment,browser:browser.version(),playwright:require('playwright/package.json').version,executableSha256:sha(fs.readFileSync(chrome))};
 assert.equal(browser.version(),browserEnvironment.version,'fixed Chrome version');assert.equal(report.environment.playwright,browserEnvironment.playwright);
 const bootContext=await browser.newContext({offline:true}),bootErrors=[];
 try{const bootPage=await bootContext.newPage();bootPage.on('pageerror',e=>bootErrors.push(e.message));await bootPage.goto(pathToFileURL(candidate).href);await bootPage.waitForFunction(()=>!!Akari?.app,null,{timeout:5000});assert.deepEqual(bootErrors,[]);report.boot={status:'PASS'};}
 catch(e){report.boot={status:'FAIL',pageErrors:bootErrors,detail:e.message};const error=new Error('Candidate cannot initialize: '+JSON.stringify(report.boot));error.code='PRODUCT_BOOT';throw error;}
 finally{await bootContext.close();save();}
 const run=async(id,fn)=>{if(filter&&!id.includes(filter))return;selected++;let page;
  try{const evidence=await pageFor(browser,candidate,async p=>{page=p;p.setDefaultTimeout(8000);p.on('dialog',d=>d.accept(d.type()==='prompt'?d.defaultValue():undefined));try{return await fn(p);}catch(error){
   const state=await p.evaluate(()=>({console:document.querySelector('#console')?.textContent,failure:document.querySelector('#failureBody')?.textContent,source:document.querySelector('#codeEditor')?.value,selected:document.querySelector('#objectSelect')?.value,appState:globalThis.Akari?.app?.editorState?.state})).catch(()=>null);
   error.message+='\nBrowser evidence: '+JSON.stringify(state);error.stack+='\nBrowser evidence: '+JSON.stringify(state);
   if(/UI|choices|media|question|keyboard/.test(id)){const shot=path.join(evidenceDir,id.replace(/[^A-Za-z0-9_-]/g,'_')+'.png');await p.screenshot({path:shot}).catch(()=>{});error.message+='\nScreenshot: '+shot;error.stack+='\nScreenshot: '+shot;}
   throw error;
  }});report.results.push({id,status:'PASS',evidence});}
  catch(e){report.results.push({id,status:e.code==='PENDING'?'PENDING':'FAIL',detail:e.stack});}
  save();console.log(id+': '+report.results.at(-1).status);
 };
 const sourceRuns=new Map();
 for(const scenario of scenarios){
  if(scenario.id==='CI-20')continue;
  await run(scenario.id+'/parser-core',async p=>{const original=await p.evaluate(browserScenario,{scenario});verifyIntent(scenario.id,original);sourceRuns.set(scenario.id,original);return{structuredSource:scenario.source,original};});
  await run(scenario.id+'/blocks-core',async p=>{const blocks=await p.evaluate(browserScenario,{scenario,mode:'blocks'});verifyIntent(scenario.id,blocks);const original=sourceRuns.get(scenario.id);if(original){assert.deepEqual(blocks.final,original.final);assert.deepEqual(blocks.trace,original.trace);}return{structuredSource:scenario.source,blocks,sourceTraceCompared:!!original};});
 }
 // Every unchanged original intent is exercised in the real editor. This checks
 // preservation and non-execution only, not that narrative prose is executable.
 for(const item of corpus.cases)await run(item.id+'/original-prose-ui',async p=>{
  const originals=item.sections.filter(s=>s.label.startsWith('作文候補'));const checks=[];
  for(const entry of originals){await fill(p,entry.text);assert.equal(await p.locator('#codeEditor').inputValue(),entry.text);assert.equal((await uiState(p)).state,'DESIGN');const initial=await uiState(p);
   await click(p,'editorModeblocks');await click(p,'editorModecode');assert.equal(await p.locator('#codeEditor').inputValue(),entry.text);assert.deepEqual(await uiState(p),initial,'mode switch changed original draft/model/history');checks.push({original:entry.text,unchanged:true,automaticExecution:false});}
  return{checks,meaningAcceptance:'not asserted by this preservation route'};
 });
 for(const ambiguity of ambiguities)await run(ambiguity.id+'/choices-nonexecution-cancel',async p=>{
  await installProject(p,{id:ambiguity.id,source:'10歩進む。'});await observeUi(p);const valid=await uiState(p);await fill(p,ambiguity.source);
  const before=await uiState(p);assert.equal(before.project,valid.project,'ambiguous draft overwrote the last valid project');await click(p,'runBtn');const afterRun=await uiState(p);assert.equal(afterRun.state,'DESIGN');assert.equal(await p.evaluate(()=>__intentObserved.start),0,'ambiguous source started a scheduler');
  assert.equal(await p.locator('#codeEditor').inputValue(),ambiguity.source,'original must remain verbatim');
  const choices=await p.locator('[data-intent-choice]').allTextContents();assert.ok(choices.length>=2,'two distinct meaning candidates are required');assert.ok(new Set(choices).size>=2);
  const shown=choices.join('\n');for(const word of ambiguity.choices)assert.ok(shown.includes(word),'candidate meaning absent: '+word);
  assert.equal(await p.locator('[data-intent-cancel]').count(),1,'explicit cancel control');await p.locator('[data-intent-cancel]').click();
  const after=await uiState(p);for(const k of ['source','project','history','redo','dirty'])assert.deepEqual(after[k],before[k],k+' changed after cancellation');assert.equal(await p.locator('#codeEditor').inputValue(),ambiguity.source,'cancel discarded the original draft');assert.equal(after.state,'DESIGN');assert.equal(await p.evaluate(()=>__intentObserved.start),0);return{original:ambiguity.source,choices,valid,before,after};
 });
 await run('VALUE/math-precedence-and-builtins',async p=>{const values=await p.evaluate(expressions=>{const A=Akari,p=A.makeDefaultProject(),compiled=A.compileProject(p),runtime=new A.RuntimeModel(p,{});const ctx={runtime,compiled,runtimeId:'stage',task:{execStack:[],callFrames:[]}};return expressions.map(source=>({source,value:A.evalExpression(A.parseExpression(source,A.buildSymbols(p)),ctx)}));},numericOracles.map(x=>x[0]));
  values.forEach((v,i)=>close(v.value,numericOracles[i][1]));return values;
 });
 await run('VALUE/finite-number-roundtrip-and-exact-precision',async p=>{return p.evaluate(()=>{const A=Akari,p=A.makeDefaultProject(),compiled=A.compileProject(p),runtime=new A.RuntimeModel(p,{}),symbols=A.buildSymbols(p),ctx={runtime,compiled,runtimeId:'stage',task:{execStack:[],callFrames:[]}},numbers=[0,0.1,0.30000000000000004,Number.MIN_VALUE,Number.MAX_VALUE,9007199254740991],evidence=[];for(const expected of numbers){const source=A.formatExpression({kind:'NumberLiteral',value:expected}),value=A.evalExpression(A.parseExpression(source,symbols),ctx);if(value!==expected)throw Error('finite numeric precision changed: '+source);evidence.push({source,expected,value});}for(const[source,expected]of [['0.1＋0.2',0.30000000000000004],['10000000000000000－10000000000000000＋1',1],['10000000000000000＋（－10000000000000000＋1）',0]]){const value=A.evalExpression(A.parseExpression(source,symbols),ctx);if(value!==expected)throw Error('operation grouping/precision changed: '+source);evidence.push({source,expected,value});}return evidence;});});
 await run('CONDITION/inflections-shortcircuit-and-roundtrip',async p=>{return p.evaluate(()=>{const A=Akari,p=A.makeDefaultProject(),compiled=A.compileProject(p),runtime=new A.RuntimeModel(p,{}),symbols=A.buildSymbols(p),ctx={runtime,compiled,runtimeId:'stage',task:{execStack:[],callFrames:[]}};runtime.projectVars.set('点数',9);const cases=[['点数が10点以上でなければ','if',true],['点数が10より小さければ','if',true],['点数が10より大きくなければ','if',true],['点数が10以下のあいだ','while',true],['点数が10以上になるまで','until',false],['「空白」キーが押されなくなるまで','until',true],['点数が10以上か、「空白」キーが押されていれば','if',false],['点数が10より小さくて、点数が8より大きければ','if',true]],evidence=[];
  for(const[text,form,expected]of cases){const ast=A.parseCondition(text,symbols,{},form),value=A.evalExpression(ast,ctx),formatted=A.formatCondition(ast,form);if(value!==expected)throw Error(text+' expected '+expected+' got '+value);if(!A.astEquivalent(ast,A.parseCondition(formatted,symbols,{},form)))throw Error('condition roundtrip');evidence.push({text,form,expected,value,formatted});}
  for(const[text,expected]of [['条件の答え（あてはまらない）かつ（1÷0が0と同じ）',false],['条件の答え（あてはまる）または（1÷0が0と同じ）',true]])if(A.evalExpression(A.parseExpression(text,symbols),ctx)!==expected)throw Error('short-circuit contract');return evidence;});});
 await run('VALUE/unit-propagation-mismatch-and-structural-builtins',async p=>{return p.evaluate(()=>{const A=Akari,p=A.makeDefaultProject(),compiled=A.compileProject(p),runtime=new A.RuntimeModel(p,{}),symbols=A.buildSymbols(p),ctx={runtime,compiled,runtimeId:'stage',task:{execStack:[],callFrames:[]}};const evaluate=text=>A.evalExpression(A.parseExpression(text,symbols),ctx),cases=[['（3点×2）の数だけ',6],['6点÷3点',2],['［1、1点、1秒］で1点が最初にある番号',2],['［1、2］の長さ',2],['「😀a」の文字数',2],['「😀a」の1文字目','😀'],['［1、2］に2が入っている',true],['文字（条件の答え（あてはまる））','あてはまる']],evidence=[];for(const[text,expected]of cases){const value=evaluate(text);if(value!==expected)throw Error(text+' expected '+expected+' got '+JSON.stringify(value));evidence.push({text,value});}for(const text of ['1点＋1秒','2点×3秒','1点が1秒と同じ','平方根（4点）']){let error;try{evaluate(text);}catch(e){error=e;}if(!error||!/^R[0-9]{3}$/.test(error.code||''))throw Error('unit mismatch must report a runtime diagnostic: '+text+' / '+error?.message);evidence.push({text,rejected:error.code});}return evidence;});});
 await run('VALUE/units-booleans-strings-list-and-copy',async p=>{const scenario={id:'VALUE',source:'点数を3点にする。持ち物の最後に点数を入れる。点数を1点増やす。持ち物の1番目の値を言う。点数の値を言う。点数の数だけを言う。条件の答え（あてはまらない）を言う。「１０歩うごく。※右へ\\「\\」\\\\」と言う。',lists:{持ち物:[]}};
  const o=await p.evaluate(browserScenario,{scenario});assert.deepEqual(says(o).map(s=>s.value),['3点','4点','4','あてはまらない','１０歩うごく。※右へ「」\\']);return o;
 });
 await run('CALLABLE/named-order-nonasymmetric-return',async p=>{const scenario={id:'CALLABLE',source:'合計を（後を3、先を80として、【差】で求めた答え）にする。',functions:[{name:'差',args:['先','後'],source:'先－後を答えとして返す。'}]};const o=await p.evaluate(browserScenario,{scenario});assert.equal(new Map(o.final.vars).get('合計'),77);assert.deepEqual(says(o),[]);return o;});
 await run('CALLABLE/named-argument-evaluation-order-once',async p=>{const scenario={id:'CALLABLE-ORDER',source:'合計を（後を乱数（1、100）、先を乱数（1、100）として、【差】で求めた答え）にする。',functions:[{name:'差',args:['先','後'],source:'先－後を答えとして返す。'}]};const o=await p.evaluate(browserScenario,{scenario});const draws=o.trace.filter(t=>t.kind==='random').map(t=>Math.floor(t.value/4294967296*100)+1);assert.equal(draws.length,2,'each source argument evaluated exactly once');assert.equal(new Map(o.final.vars).get('合計'),draws[1]-draws[0],'evaluate source order before binding by name');return{draws,...o};});
 await run('ACTOR/branch-scope-and-owner-read',async p=>{const scenario={id:'ACTOR-SCOPE',source:'犬は右へ2歩動く。もし条件（条件の答え（あてはまる））が成り立つなら、\n  ねこは右へ3歩動く。\n右へ5歩動く。犬の横位置の数だけを言う。'};const o=await p.evaluate(browserScenario,{scenario});close(actor(o.final).x,3);close(actor(o.final,actors.dog).x,107);assert.deepEqual(says(o).map(s=>[s.id,s.value]),[[actors.dog,'107']]);return o;});
 await run('EVENT/multiple-handlers-and-filter',async p=>{const scenario={id:'EVENT-FILTER',source:'「一番」と言う。',event:'keyDown',filter:{key:'空白'},extraScripts:[{targetId:actors.cat,event:'keyDown',filter:{key:'空白'},source:'「二番」と言う。'},{targetId:actors.cat,event:'keyDown',filter:{key:'左'},source:'「誤り」と言う。'}],steps:[{key:'空白',down:true}]};const o=await p.evaluate(browserScenario,{scenario});assert.deepEqual(says(o).map(s=>s.value),['一番','二番']);return o;});
 await run('PARSER/protected-sourcepositions-and-negatives',async p=>{return p.evaluate(()=>{const A=Akari,p=A.makeDefaultProject(),sy=A.buildSymbols(p),must=(x,m)=>{if(!x)throw Error(m);};const source='「😀é\\」※１０」と言う。  １０歩進む。';const ast=A.parseScript(source,sy,{targetId:'sprite-1'});must(ast.body.length===2,'two statements outside protected text');must(ast.body[0].value.value==='😀é」※１０','escape text changed');const span=ast.body[1].sourceSpan;must(span?.startLine===1,'second clause line');const at=source.indexOf('１０歩');must(span.startColumn===[...source.slice(0,at)].length+1,'column must use original Unicode codepoints');
  const rejects=['「未完','「不明\\n」','10メートル','もし点数が10点になったら、\n  10歩進む。','もし点数が10以上で、残りが1以上か、当たりが1以上なら、\n  10歩進む。'];const evidence=[];for(const text of rejects){let error;try{A.parseScript(text,sy,{targetId:'sprite-1'});}catch(e){error=e;}must(!!error&&/^[NPSRF][0-9]{3}$/.test(error.code||''),'unsafe text must report a language diagnostic: '+text+' / '+error?.message);evidence.push({text,code:error.code});}return{source,span,rejections:evidence};});
 });
 for(const [id,modify,expected]of [
  ['CI-09/boundary9',{...scenarios[8],vars:{点数:9}},['もう一回','9']],['CI-09/boundary11',{...scenarios[8],vars:{点数:11}},['できたね','11']],
  ['CI-10/key-required',{...scenarios[9],vars:{かぎ:true,赤接触:false,青接触:true}},['開いた']],
  ['CI-14/empty',{...scenarios[13],lists:{参加者:[]}},[]],
 ])await run(id,async p=>{const o=await p.evaluate(browserScenario,{scenario:modify});assert.deepEqual(says(o).map(x=>x.value),expected);return o;});
 await run('CI-13/replace-is-not-insert',async p=>{const scenario={...scenarios[12],source:'持ち物の2番目を「かさ」に変える。'};const o=await p.evaluate(browserScenario,{scenario});assert.deepEqual(new Map(o.final.lists).get('持ち物'),['本','かさ']);return o;});
 await run('CI-15/definition-alone-does-not-run',async p=>{const o=await p.evaluate(browserScenario,{scenario:{...scenarios[14],source:'何もしない。'}});assert.deepEqual(moves(o),[]);return o;});
 await run('CI-18/nonwaiting-and-zero-receivers',async p=>{const source='みんなに「出発」と知らせる。ねこは10歩進む。';const nonwaiting=await p.evaluate(browserScenario,{scenario:{...scenarios[17],source}});assert.equal(moves(nonwaiting)[0].time,0);const zero=await p.evaluate(browserScenario,{scenario:{...scenarios[17],extraScripts:[],steps:[]}});close(actor(zero.final).x,10);assert.equal(moves(zero)[0].time,0);return{nonwaiting,zero};});
 await run('CI-12/saved-answer-survives-next-question',async p=>{const scenario={id:'CI-12-SAVED',source:'「名前は？」とたずねる。保存名を答えにする。「好きな色は？」とたずねる。保存名の値を言う。',steps:[{answer:'青い ねこ'},{at:1000},{answer:'赤'}]};const o=await p.evaluate(browserScenario,{scenario});assert.equal(o.checkpoints[2].says,0);assert.deepEqual(says(o).map(x=>x.value),['青い ねこ']);assert.equal(new Map(o.final.vars).get('保存名'),'青い ねこ');return o;});
 await run('CI-18/indirect-receiver-is-outside-wait-group',async p=>{const scenario={...scenarios[17],extraScripts:[{targetId:actors.dog,event:'message',filter:{message:'出発'},source:'1秒待つ。みんなに「別」と知らせる。'},{targetId:actors.bird,event:'message',filter:{message:'別'},source:'3秒待つ。「間接完了」と言う。'}],steps:[{at:1000},{at:2000},{at:4000}]};const o=await p.evaluate(browserScenario,{scenario});assert.equal(moves(o)[0].time,1000,'only direct receiver completion is awaited');assert.deepEqual(says(o).map(x=>[x.value,x.time]),[['間接完了',4000]]);return o;});
 await run('CI-04/frame-rate-independence',async p=>{const runs=[];for(const hz of [30,60,120]){const steps=[{key:'右',down:true},...Array.from({length:hz},(_,i)=>({at:1000*(i+1)/hz})),{key:'右',down:false},{at:2000}];const o=await p.evaluate(browserScenario,{scenario:{...scenarios[3],steps}});close(actor(o.final).x,20);runs.push({hz,x:actor(o.final).x,steps:o.trace.filter(t=>t.kind==='continuous').length});}return runs;});
 // Actual pointer/keyboard route: OS repeats must not be counted as new presses.
 await run('CI-03/real-keyboard-repeat-events',async p=>{await installProject(p,{...scenarios[2],actions:[{name:'ジャンプ',args:[],source:'「ジャンプ」と言う。'}]});await observeUi(p);await click(p,'runBtn');await p.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');await p.locator('#formSurface').focus();await p.keyboard.down('Space');await p.waitForTimeout(100);await p.keyboard.down('Space');await p.waitForTimeout(100);await p.keyboard.up('Space');await p.keyboard.down('Space');await p.keyboard.up('Space');await p.waitForTimeout(100);const observed=await p.evaluate(()=>__intentObserved);assert.deepEqual(observed.say.map(x=>x.value),['ジャンプ','ジャンプ']);await click(p,'stopBtn');return observed;});
 await run('CI-12/real-question-response-and-stop',async p=>{await installProject(p,scenarios[11]);await observeUi(p);await click(p,'runBtn');await p.locator('#questionModal.show').waitFor();assert.deepEqual(await p.evaluate(()=>__intentObserved.say),[]);await p.locator('#questionAnswer').fill('青い ねこ「※」');await click(p,'questionSubmit');await p.waitForFunction(()=>__intentObserved.say.length===1);assert.equal(await p.evaluate(()=>__intentObserved.say[0].value),'青い ねこ「※」さん、こんにちは');await click(p,'stopBtn');await click(p,'runBtn');await p.locator('#questionModal.show').waitFor();const before=await p.evaluate(()=>__intentObserved.say.length);await p.keyboard.press('Escape');assert.equal((await uiState(p)).state,'DESIGN');await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>__intentObserved.say.length),before);return{literalAnswer:true,waited:true,escapeStopsWithoutAnswer:true};});
 await run('UI/quantity-edit-roundtrip-undo',async p=>{await installProject(p,{id:'UI',source:'点数を１０点にする。点数の値を言う。'});await click(p,'editorModeblocks');const before=await uiState(p),number=p.locator('#blockEditor [data-schema-id="NumberLiteral"] [data-blockui-field="value"]').first();await (await reveal(number)).fill('１２');await number.press('Enter');await click(p,'editorModecode');assert.match((await uiState(p)).source,/(?:１２|12)点/);await click(p,'undoBtn');assert.equal((await uiState(p)).source,before.source);await click(p,'redoBtn');await observeUi(p);await click(p,'runBtn');await p.waitForFunction(()=>__intentObserved.say.length===1);assert.equal(await p.evaluate(()=>__intentObserved.say[0].value),'12点');await click(p,'stopBtn');return{visibleUnits:true,fullWidthEdit:true,sharedUndo:true};});
 await run('CI-20/media-save-reload-player-offline',async p=>{return mediaRoundtrip(p,browser);});
 },900000);
}catch(error){report.results.push({id:error.code==='PRODUCT_BOOT'?'PRODUCT/boot':'ENVIRONMENT/required-browser',status:error.code==='PRODUCT_BOOT'?'FAIL':'PENDING',detail:error.stack});}
assert.equal(sha(fs.readFileSync(candidate)),report.candidate.sha256,'tested snapshot changed');
report.sourceWorkingCopyChanged=sha(fs.readFileSync(product))!==report.candidate.sha256;
report.coverage=corpus.cases.map(c=>({id:c.id,originalProse:report.results.find(r=>r.id===c.id+'/original-prose-ui')?.status||'NOT_RUN',semantic:report.results.find(r=>r.id===c.id+(c.id==='CI-20'?'/media-save-reload-player-offline':'/parser-core'))?.status||'NOT_RUN',blocks:report.results.find(r=>r.id===c.id+(c.id==='CI-20'?'/media-save-reload-player-offline':'/blocks-core'))?.status||'NOT_RUN'}));
if(!filter&&report.boot?.status==='PASS'&&report.results.length!==89)report.results.push({id:'AUDIT/coverage-count',status:'FAIL',detail:`Expected 89 independent checks; observed ${report.results.length}`});
report.total=report.results.length;report.counts=Object.fromEntries(['PASS','FAIL','PENDING'].map(s=>[s,report.results.filter(r=>r.status===s).length]));
report.status=filter?'INCOMPLETE':report.counts.FAIL?'FAIL':report.counts.PENDING?'PENDING':selected?'PASS':'PENDING';save();console.log(JSON.stringify({status:report.status,counts:report.counts,output}));if(report.status!=='PASS')process.exitCode=1;

async function mediaRoundtrip(p,browser){
 const scenario=scenarios[19];await installProject(p,{...scenario,source:'何もしない。'});
 // A generated 0.5 s PCM tone is independently known to last 500 ms.
 const sampleRate=8000,count=4000,wav=Buffer.alloc(44+count*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(sampleRate,24);wav.writeUInt32LE(sampleRate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*2,40);for(let i=0;i<count;i++)wav.writeInt16LE(Math.round(1000*Math.sin(2*Math.PI*440*i/sampleRate)),44+i*2);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPgihL5DwACYgF4Xsu9FAAAAABJRU5ErkJggg==','base64');
 await click(p,'assetBtn');await p.locator('#imageBackdropInput').setInputFiles({name:'森の絵.png',mimeType:'image/png',buffer:png});await p.waitForFunction(()=>Akari.app.project.stage.backdrops.some(b=>b.name==='森の絵'));
 await p.locator('#soundInput').setInputFiles({name:'こんにちは.wav',mimeType:'audio/wav',buffer:wav});await p.waitForFunction(()=>Akari.app.project.sounds.some(s=>s.name==='こんにちは'));await click(p,'assetClose');
 await fill(p,scenario.source);const before=await uiState(p);await click(p,'editorModeblocks');await click(p,'editorModecode');assert.equal((await uiState(p)).source,before.source);
 await observeUi(p);await click(p,'runBtn');await p.waitForFunction(()=>globalThis.__intentScheduler?.running);const started=await p.evaluate(()=>performance.now());await p.waitForFunction(()=>__intentObserved.motion.length>0);const motion=await p.evaluate(()=>__intentObserved.motion);assert.ok(motion[0].time-started>=400,'movement did not wait for the known 0.5 s audio');assert.equal(motion[0].x,10);await click(p,'stopBtn');
 const download=async(id,name)=>{const promise=p.waitForEvent('download');await click(p,id);const file=path.join(evidenceDir,name);await(await promise).saveAs(file);return file;};
 const saved=await download('saveBtn','intent-media.akari.md'),generated=await download('exportBtn','intent-player.html'),project=await p.evaluate(()=>JSON.stringify(Akari.app.project));
 await click(p,'newBtn');await p.locator('#fileInput').setInputFiles(saved);await p.waitForFunction(()=>Akari.app.project.name==='独立意図 CI-20');assert.equal(await p.evaluate(()=>JSON.stringify(Akari.app.project)),project);
 const context=await browser.newContext({offline:true}),network=[],errors=[];try{await context.route(/^https?:/,r=>{network.push(r.request().url());return r.abort();});const player=await context.newPage();player.on('pageerror',e=>errors.push(e.message));await player.goto(pathToFileURL(generated).href);const playerStart=Date.now();await player.locator('#playerStart:not([disabled])').click();await player.waitForFunction(()=>parseFloat(document.querySelector('.component[data-runtime-id="sprite-1"]')?.style.left)===10);assert.ok(Date.now()-playerStart>=400,'offline player skipped the recorded sound wait');assert.equal(await player.locator('.component[data-runtime-id="sprite-1"]').count(),1);await player.locator('#playerStop').click();assert.deepEqual(network,[]);assert.deepEqual(errors,[]);}finally{await context.close();}
 return{assetIdsPreserved:true,waitedBeforeMotion:motion,offline:true,savedSha256:sha(fs.readFileSync(saved)),playerSha256:sha(fs.readFileSync(generated))};
}
