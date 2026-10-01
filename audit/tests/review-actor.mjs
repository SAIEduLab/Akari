import {createRequire} from 'node:module';
import {snapshot} from '../lib/product-test-host.mjs';
const require=createRequire(import.meta.url);
// Independent P1 regression: subject scopes must survive codec, formatting and real UI edits.
// Usage: node audit/tests/review-actor.mjs <product-html> <browser> <output-dir>
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const {loadApi}=require('../browser/cases/audit-lib.cjs');
const {makeRegressionProject}=require('../fixtures/regression-project.cjs');
const {setupRegressionPage,openRegressionEditor,revealRegressionControl:reveal,completeRegressionHoles}=require('../browser/cases/regression-setup.cjs');
const U=require('../browser/cases/ui-routes.cjs');
const [product,browserPath,output]=process.argv.slice(2);assert.ok(product&&browserPath&&output,'product, browser and output required');fs.mkdirSync(output,{recursive:true});
const html=fs.readFileSync(product,'utf8'),A=loadApi(html),productSha256=crypto.createHash('sha256').update(html).digest('hex'),reports=[],initialSnapshot=snapshot(product),pageErrors=[],networkRequests=[];let browserVersion=null;
const source='いぬは右へ1歩動く。\nもし点数が0と同じなら、\n  自分は右へ2歩動く。';
function fixture(text=source){const p=makeRegressionProject(A),sprite=p.components.find(c=>c.type==='sprite');p.components=['ねこ','いぬ'].map((name,i)=>({...structuredClone(sprite),id:i?'dog':'cat',name,x:i?100:0,y:0,costumes:[{id:'costume-'+i,name:'顔',kind:'text',value:'🐈'}],costumeId:'costume-'+i,localData:{variables:[],lists:[]}}));p.scripts=[{id:'scope-start',targetId:'cat',event:'start',source:text}];p.actions=[];p.functions=[];return p;}
function compile(p){const c=A.compileProject(p);assert.deepEqual(JSON.parse(JSON.stringify(c.errors)),[]);return c;}
function run(p){const c=compile(p),r=new A.RuntimeModel(p,{}),q=new A.EventScheduler(p,c,r,{});r.now=()=>0;q.schedule=()=>{};q.start();for(let i=0;i<500&&q.ready.length;i++)q.runTurn();assert.equal(q.tasks.size,0);const result={cat:r.actor('cat').x,dog:r.actor('dog').x};q.stop();return result;}
async function test(id,fn){try{reports.push({id,pass:true,evidence:await fn()});console.log('PASS '+id);}catch(e){reports.push({id,pass:false,error:e.stack});console.error('FAIL '+id+': '+e.message);}}
(async()=>{
await test('REVIEW-SELF-ACTOR-NESTED-ROUNDTRIP',()=>{const examples=[
 {id:'if-self',text:source,expected:{cat:2,dog:101}},
 {id:'if-branch-scope-restored',text:source+'\n右へ3歩動く。',expected:{cat:2,dog:104}},
 {id:'else-self',text:'いぬは右へ1歩動く。\nもし点数が1と同じなら、\n  右へ40歩動く。\nそうでなければ、\n  自分は右へ2歩動く。\n右へ3歩動く。',expected:{cat:2,dog:104}},
 {id:'repeat-nested-self',text:'いぬは右へ1歩動く。\n2回くり返す。\n  もし点数が0と同じなら、\n    自分は右へ2歩動く。\n  右へ3歩動く。\n右へ4歩動く。',expected:{cat:4,dog:111}},
 {id:'broadcast-reference-keeps-inherited-topic',text:'いぬはみんなに「出発」と知らせる。\nその知らせを受けて始めたことが全部終わるまで待つ。\nもし点数が0と同じなら、\n  自分は右へ2歩動く。',expected:{cat:2,dog:100}},
 {id:'inner-topic-does-not-leak',text:'2回くり返す。\n  いぬは右へ1歩動く。\n右へ2歩動く。',expected:{cat:2,dog:102}},
 ];const results=[];for(const ex of examples){const original=compile(fixture(ex.text)).items[0].ast;let text=ex.text;assert.deepEqual(run(fixture(text)),ex.expected,ex.id+' original independent effect');for(let round=0;round<3;round++){const ast=compile(fixture(text)).items[0].ast,encoded=A.blockEncode(ast),decoded=A.blockDecode(encoded.tree);assert.equal(A.astEquivalent(original,decoded),true,ex.id+' codec semantic AST');text=A.formatScript(decoded);const parsed=compile(fixture(text)).items[0].ast;assert.equal(A.astEquivalent(original,parsed),true,ex.id+' formatted semantic AST');assert.deepEqual(run(fixture(text)),ex.expected,ex.id+' roundtrip effect');}results.push({id:ex.id,expected:ex.expected,formatted:text,rounds:3});}
 const moves=[
  {id:'implicit-self-moves-after-named',source:'右へ2歩動く。\nいぬは右へ1歩動く。',expectedSource:'いぬは右へ1歩動く。\n自分は画面の右へ2歩動く。',expected:{cat:2,dog:101}},
  {id:'same-topic-move-keeps-bytes',source:'右へ 02 歩動く。  ※ 元  \n右へ1歩動く。',expectedSource:'右へ1歩動く。\n右へ 02 歩動く。  ※ 元  ',expected:{cat:3,dog:100}},
  {id:'explicit-self-cross-topic-keeps-bytes',source:'自分は右へ 02 歩動く。  ※ 元  \nいぬは右へ1歩動く。',expectedSource:'いぬは右へ1歩動く。\n自分は右へ 02 歩動く。  ※ 元  ',expected:{cat:2,dog:101}},
  {id:'delete-topic-setter-preserves-tail-actor',source:'いぬは右へ1歩動く。\n右へ2歩動く。',expectedSource:'いぬは画面の右へ2歩動く。',expected:{cat:0,dog:102},remove:true},
 ];
 for(const ex of moves){const project=fixture(ex.source),session=A.createEditorSession('script:scope-start',ex.source,{targetId:'cat',event:'start'},project,0),body=session.blockView.bodies.body,
   edit=A.prepareBlockEdit(session,ex.remove?{type:'remove',id:body[0].id}:{type:'move',id:body[0].id,parentId:session.blockView.id,body:'body',index:2}),
   expectedAst={...session.syntaxAst,body:ex.remove?[session.syntaxAst.body[1]]:[session.syntaxAst.body[1],session.syntaxAst.body[0]]};
  assert.equal(edit.source,ex.expectedSource,ex.id+' minimal CST');assert.equal(A.astEquivalent(edit.syntaxAst,expectedAst),true,ex.id+' actor meaning');assert.deepEqual(run(fixture(edit.source)),ex.expected,ex.id+' independent effect');results.push({id:ex.id,source:ex.source,result:edit.source,expected:ex.expected});
 }
 return results;});
await test('REVIEW-SELF-ACTOR-ELSE-EDIT',async()=>{const browser=await chromium.launch({executablePath:browserPath,headless:true,args:['--allow-file-access-from-files']}),context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=pageErrors,network=networkRequests;browserVersion=browser.version();await context.route(/^https?:/,r=>{network.push(r.request().url());return r.abort();});const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());try{await page.goto(pathToFileURL(path.resolve(product)).href);await setupRegressionPage(page);await page.locator('#fileInput').setInputFiles({name:'actor-scope.akari.md',mimeType:'text/markdown',buffer:Buffer.from(A.serializeProject(fixture()))});await page.waitForFunction(()=>Akari.app.project.components.some(c=>c.id==='cat'));await openRegressionEditor(page,{target:'cat',mode:'code'});
 const read=()=>page.evaluate(()=>{const s=Akari.app.editorState.main;return{source:s.sourceText,ast:s.syntaxAst,tree:s.blockView,pending:s.pendingEdit,diagnostics:s.diagnostics,history:Akari.app.editorState.history,project:Akari.app.project};});const original=await read();assert.equal(original.source,source);
 for(let i=0;i<2;i++){await page.locator('#editorModeblocks').click();await page.locator('#editorModecode').click();assert.equal((await read()).source,source,'unedited bidirectional CST text exact');}
 await page.locator('#editorModeblocks').click();const branch=page.locator('#blockEditor .blockui-node[data-schema-id="IfStatement"]');await U.openNodeMenu(branch);await branch.locator('[data-blockui-field="hasElse"]').selectOption('true');await (await reveal(page.locator('#blockEditor [data-blockui-palette-mode]'))).selectOption('statement');const options=page.locator('#blockEditor .blockui-palette-options');if(await options.getAttribute('open')!==null)await options.locator(':scope > summary').click();await completeRegressionHoles(page);const added=await read();assert.equal(added.pending,null);assert.equal(added.diagnostics.some(x=>x.code==='E901'),false);assert.equal(added.ast.body[1].hasElse,true);assert.equal(added.ast.body[1].thenBody[0].actorRef.kind,'self');assert.deepEqual(run(added.project),{cat:2,dog:101});assert.equal(added.history,original.history+1,'completed else insertion is one history step');
 for(let i=0;i<2;i++){await page.locator('#editorModecode').click();assert.equal(await page.locator('#codeEditor').inputValue(),added.source);await page.locator('#editorModeblocks').click();const state=await read();assert.equal(A.astEquivalent(added.ast,state.ast),true);assert.deepEqual(run(state.project),{cat:2,dog:101});}
 await U.openNodeMenu(branch);await branch.locator('[data-blockui-field="hasElse"]').selectOption('false');const removed=await read();assert.equal(removed.pending,null);assert.equal(removed.diagnostics.some(x=>x.code==='E901'),false);assert.equal(A.astEquivalent(original.ast,removed.ast),true,'CST fragment removal preserves original AST');assert.deepEqual(run(removed.project),{cat:2,dog:101});await (await reveal(page.locator('#undoBtn'))).click();assert.equal((await read()).source,added.source);await (await reveal(page.locator('#redoBtn'))).click();assert.equal((await read()).source,removed.source);assert.deepEqual(errors,[]);assert.deepEqual(network,[]);return{original:original.source,added:added.source,removed:removed.source,expected:{cat:2,dog:101},pageErrors:errors,networkRequests:network};
 }catch(e){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});fs.writeFileSync(path.join(output,'failure-dom.html'),await page.content());throw e;}finally{await context.close();await browser.close();}});
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(product)).digest('hex'),productSha256);fs.writeFileSync(path.join(output,'review-actor.json'),JSON.stringify({schema:'akari-independent-review-v1',group:'actor',status:reports.every(x=>x.pass)?'PASS':'FAIL',snapshot:initialSnapshot,results:reports,browser:browserVersion,pageErrors,networkRequests},null,2)+'\n');if(reports.some(x=>!x.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
