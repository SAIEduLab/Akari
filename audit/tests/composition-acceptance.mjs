import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {withBrowser,pageFor,snapshot,sha} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {browserEnvironment} from '../lib/browser-environment.mjs';
import {transferFixtures,fixturePins,compositionIds,verifyCompositionReport,verifyCompositionMeaning} from '../lib/actions-transfer-contract.mjs';
import {compositionProject,compositionExecution} from '../lib/composition-runtime.mjs';
const require=createRequire(import.meta.url),[chrome,outputArg]=process.argv.slice(2),output=path.resolve(outputArg);
assert.ok(chrome&&!fs.existsSync(output),'usage: composition-acceptance.mjs CHROME NEW_REPORT.json');
const {prose}=transferFixtures(),inputs=snapshot(currentProductFile()),dir=output.replace(/\.json$/,'')+'.artifacts';
assert.ok(!fs.existsSync(dir));fs.mkdirSync(dir,{recursive:true});const candidate=path.join(dir,'candidate.html');fs.copyFileSync(currentProductFile(),candidate);
const report={schema:'akari-composition-acceptance-v1',status:'RUNNING',snapshot:inputs,fixturePins,originals:prose.drafts,
 environment:{protocol:'file:',browser:null,playwright:require('playwright/package.json').version},uxAcceptance:false,
 candidateSha256:sha(fs.readFileSync(candidate)),pageErrors:[],networkRequests:[],results:[]};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');save();
const json=x=>JSON.parse(JSON.stringify(x));

try{await withBrowser(chrome,async browser=>{
 report.environment.browser=browser.version();assert.equal(browser.version(),browserEnvironment.version);assert.equal(report.environment.playwright,browserEnvironment.playwright);
 const run=async(id,category,fn)=>{
  const row={id,category,expectedOutcome:'SUCCESS_REQUIRED',status:'RUNNING',evidence:null};report.results.push(row);const started=Date.now();
  try{row.evidence=await pageFor(browser,candidate,async page=>{
   page.setDefaultTimeout(8000);await page.setViewportSize({width:1366,height:768});page.on('dialog',d=>d.accept());
   page.on('pageerror',error=>report.pageErrors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))report.networkRequests.push(request.url());});
   try{return await fn(page,value=>{row.evidence=value;});}
   catch(error){row.evidence={...row.evidence,ui:await page.evaluate(()=>({textarea:document.querySelector('#codeEditor').value,event:document.querySelector('#eventSelect').value,
    issue:document.querySelector('#codeIssue')?.textContent,pending:Akari.app.editorState.main.pendingEdit,project:Akari.app.project})).catch(()=>null)};
    await page.screenshot({path:path.join(dir,id.replace(/[^a-zA-Z0-9_-]/g,'_')+'.png')}).catch(()=>{});throw error;}
  });row.status='PASS';}
  catch(error){row.status='FAIL';row.failureClass=error.code==='ACCEPTANCE_REQUIRED'?'PRODUCT_SOURCE_REJECTED':'ASSERTION_OR_EXECUTION';row.error=error.stack;}
  row.ms=Date.now()-started;save();console.log(row.status+' '+id);
 };
 const projectExpression='('+compositionProject.toString()+')';
 const install=async(page,d)=>{
  const payload=await page.evaluate(({draft,factory})=>{const p=eval(factory)(Akari,draft,'何もしない。');return{name:p.name,text:Akari.serializeProject(p,Akari.makeDefaultAssetStore())};},{draft:d,factory:projectExpression});
  await page.locator('#fileInput').setInputFiles({name:'composition.akari.md',mimeType:'text/plain',buffer:Buffer.from(payload.text)});
  await page.waitForFunction(name=>Akari.app.project.name===name,payload.name);await page.locator('#uiLevel').selectOption('advanced');
  await page.locator('#objectSelect').selectOption('sprite-1');await page.locator('#eventSelect').selectOption('start');
  if(await page.locator('#sourceOverview').isVisible())await page.locator('#sourceEditBtn').click();await page.locator('#editorModecode').click();
 };
 for(const d of prose.drafts){
  await run(d.id+'/source-ui','SOURCE_ACCEPTANCE',async(page,capture)=>{
   await install(page,d);await page.locator('#codeEditor').fill(d.mainFirstDraft);
   const evidence=await page.evaluate(source=>({enteredSource:document.querySelector('#codeEditor').value,pending:Akari.app.editorState.main.pendingEdit,
    modelSource:Akari.app.editorState.main.sourceText,compileErrors:Akari.app.compile().errors,sourceShaMatches:document.querySelector('#codeEditor').value===source}),d.mainFirstDraft);capture(evidence);
   if(evidence.pending||evidence.modelSource!==d.mainFirstDraft){const error=new Error('Original prose must be accepted, not merely preserved as pending. '+JSON.stringify(evidence.pending));error.code='ACCEPTANCE_REQUIRED';throw error;}
   assert.equal(evidence.enteredSource,d.mainFirstDraft);assert.deepEqual(evidence.compileErrors,[]);
   const before=await page.evaluate(()=>({project:JSON.stringify(Akari.app.project),history:Akari.app.editorState.history,redo:Akari.app.editorState.redo,dirty:Akari.app.editorState.dirty}));
   await page.locator('#editorModeblocks').click();await page.locator('#editorModecode').click();evidence.codeAfterRoundtrip=await page.locator('#codeEditor').inputValue();
   assert.equal(evidence.codeAfterRoundtrip,d.mainFirstDraft);assert.deepEqual(await page.evaluate(()=>({project:JSON.stringify(Akari.app.project),history:Akari.app.editorState.history,redo:Akari.app.editorState.redo,dirty:Akari.app.editorState.dirty})),before);
   const download=page.waitForEvent('download');await page.locator('#saveBtn').click();const saved=await download,file=path.join(dir,d.id+'.akari.md');await saved.saveAs(file);const text=fs.readFileSync(file,'utf8');
   const loaded=await page.evaluate(async text=>(await Akari.parseProjectFile(text)).project,text);assert.ok(loaded.scripts.some(s=>s.source===d.mainFirstDraft));
   evidence.savedSourceExact=true;evidence.savedFileSha256=sha(text);capture(evidence);return evidence;
  });
  await run(d.id+'/semantic-roundtrip','SEMANTIC_ROUNDTRIP',async(page,capture)=>{
   const execute=(mode,source=d.mainFirstDraft)=>page.evaluate(({draft,factory,executor,mode,source})=>eval(executor)({draft,makeProject:eval(factory),mode,source}),
    {draft:d,factory:projectExpression,executor:'('+compositionExecution.toString()+')',mode,source});
   const source=await execute('source');capture({source});verifyCompositionMeaning(d,source);const blocks=await execute('blocks');verifyCompositionMeaning(d,blocks);
   assert.deepEqual(blocks.states,source.states);assert.deepEqual(blocks.trace,source.trace);
   const evidence={source,blocks,sourceBlockTraceEqual:true};
   if(d.id==='I07'){
    const falseSource=d.mainFirstDraft.replace('3回くり返す','2回くり返す');assert.notEqual(falseSource,d.mainFirstDraft);
    const alternate=await execute('source',falseSource);assert.deepEqual(alternate.states.at(-1).variables.find(x=>x[0]==='点数')[1],{magnitude:2,unit:'点'});
    assert.deepEqual(alternate.states.at(-1).speech.map(x=>x.text),['もう一度','2点']);evidence.twoRepeatVariant=alternate;
   }
   if(d.id==='I11'){
    const alternateSource=d.mainFirstDraft.replace('みんなに「出発」と','みんなに「別の知らせ」と');assert.notEqual(alternateSource,d.mainFirstDraft);
    const alternate=await execute('source',alternateSource);assert.deepEqual(alternate.states.at(-1).speech.map(x=>[x.text,x.time]),[['全員集合',0]]);evidence.otherMessageVariant=alternate;
   }
   capture(evidence);return evidence;
  });
 }
 const i10=prose.drafts.find(x=>x.id==='I10');
 for(const kind of ['action','function'])await run('I10/'+kind+'-original','SOURCE_ACCEPTANCE',async(page,capture)=>{
  const result=await page.evaluate(({draft,kind,factory})=>{
   const p=eval(factory)(Akari,draft,'何もしない。');if(kind==='action')p.functions=[];else p.actions=[];
   return {kind,original:kind==='action'?draft.extra.actionBody:draft.extra.functionBody,compileErrors:Akari.compileProject(p).errors};
  },{draft:i10,kind,factory:projectExpression});capture(result);assert.deepEqual(result.compileErrors,[],'I10 original '+kind+' definition must be accepted');return result;
 });
 await run('EDITOR/idless-heading-selection','EDITOR_IDENTITY',async(page,capture)=>{
  await page.locator('#uiLevel').selectOption('advanced');await page.locator('#editorModecode').click();await page.locator('#objectSelect').selectOption('sprite-1');await page.locator('#eventSelect').selectOption('start');
  const input=page.locator('#codeEditor');await input.fill('');
  const source='あかりがクリックされたとき、\n  あかりは画面の右へ30歩動いて、「今日はどこへ行こう」と言う。';
  await input.fill(source);await page.waitForTimeout(150);
  const read=()=>page.evaluate(()=>({textarea:document.querySelector('#codeEditor').value,event:document.querySelector('#eventSelect').value,owner:Akari.app.editorState.main.ownerKey,scripts:Akari.app.project.scripts}));
  const first=await read();capture({source,first});assert.equal(first.scripts.length,1,'one input must not duplicate a default body');assert.equal(first.scripts[0].source,source);
  assert.equal(first.scripts[0].event,'click');assert.equal(first.textarea,source,'changed body remains visible');assert.equal(first.event,'click','event selector follows the edited body');
  await input.fill(source);await page.waitForTimeout(150);const second=await read();assert.equal(second.scripts.length,1,'re-entering the same source cannot create a second body');
  const evidence={source,first,second};capture(evidence);return evidence;
 });
},180000);}catch(error){report.hostFailure=error.stack;}
assert.deepEqual(snapshot(currentProductFile()),inputs);report.status=!report.hostFailure&&report.results.length===compositionIds.length&&report.results.every(x=>x.status==='PASS')&&report.pageErrors.length===0&&report.networkRequests.length===0?'PASS':'FAIL';
report.counts={PASS:report.results.filter(x=>x.status==='PASS').length,FAIL:report.results.filter(x=>x.status==='FAIL').length,missing:compositionIds.filter(id=>!report.results.some(x=>x.id===id))};save();
if(report.status==='PASS')verifyCompositionReport(json(report));else process.exitCode=1;
console.log(JSON.stringify({status:report.status,counts:report.counts,uxAcceptance:false}));
