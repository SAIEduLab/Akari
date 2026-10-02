// Independent review regressions: the expectations come from 1.0.2 design §5,
// including static unit rejection before any effect and honest pending status.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {snapshot,withBrowser,pageFor} from '../lib/product-test-host.mjs';
const [chrome,input,output]=process.argv.slice(2);
assert.ok(chrome&&input&&output,'usage: node audit/tests/review-units.mjs <browser> <product> <output-json>');
assert.ok(!fs.existsSync(output),'a fresh evidence path is required');
const product=path.resolve(input),inputs=snapshot(product);
const report={schema:'akari-independent-review-v1',group:'units',status:'RUNNING',snapshot:inputs,results:[],browser:null,pageErrors:[],networkRequests:[]};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});save();
function fixture(){
  const p=Akari.makeDefaultProject();p.name='単位の独立回帰';
  const cat=p.components.find(c=>c.type==='sprite');
  cat.name='ねこ';cat.x=0;cat.y=0;cat.localData={variables:[],lists:[]};
  p.components=[cat];p.projectData={variables:[{id:'review-score',name:'点数',initialValue:0}],lists:[]};
  p.actions=[];p.functions=[];
  p.scripts=[{id:'review-units',targetId:cat.id,event:'start',source:'ねこは右へ10歩動く。\n点数を1秒 + 2点にする。'}];return p;
}
async function openBody(page){
  await page.locator('#uiLevel').selectOption('advanced');
  if(await page.locator('#sourceEditBtn').isVisible())await page.locator('#sourceEditBtn').click();
  await page.locator('#editorModecode').click();
  await page.locator('#codeEditor').waitFor({state:'visible'});
}
async function state(page){return page.evaluate(()=>({project:JSON.stringify(Akari.app.project),history:Akari.app.editorState.history,redo:Akari.app.editorState.redo,dirty:Akari.app.editorState.dirty,owner:Akari.app.editorState.main.ownerKey,source:Akari.app.editorState.main.sourceText,state:Akari.app.editorState.state,pending:Akari.app.editorState.main.pendingEdit}));}
async function observe(page){await page.evaluate(()=>{
  globalThis.__unitsObserved={starts:0,motions:[],says:[]};
  const proto=Akari.EventScheduler.prototype,start=proto.start,execute=proto.executeNode;
  proto.start=function(...args){__unitsObserved.starts++;globalThis.__unitsScheduler=this;const say=this.ui.say;this.ui.say=(id,value)=>{__unitsObserved.says.push({id,value});return say?.(id,value)};return start.apply(this,args)};
  proto.executeNode=function(task,node){const before=[...this.runtime.actors].map(([id,a])=>({id,x:a.x,y:a.y}));const result=execute.call(this,task,node);for(const[id,a]of this.runtime.actors){const b=before.find(x=>x.id===id);if(b&&(b.x!==a.x||b.y!==a.y))__unitsObserved.motions.push({id,x:a.x,y:a.y})}return result};
});}
async function install(page){const p=await page.evaluate(fixture),text=await page.evaluate(p=>Akari.serializeProject(p),p);await page.locator('#fileInput').setInputFiles({name:'units.akari.md',mimeType:'text/plain',buffer:Buffer.from(text)});await page.waitForFunction(()=>Akari.app.project.name==='単位の独立回帰');if(await page.locator('#diagnosisModal.show').count())await page.locator('#diagnosisClose').click();await openBody(page);return p;}
async function run(id,browser,fn){
  try{const evidence=await pageFor(browser,product,async page=>{page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url())});page.on('dialog',d=>d.accept());return fn(page)});report.results.push({id,pass:true,evidence});}
  catch(error){report.results.push({id,pass:false,evidence:{error:error.stack}});}
  save();
}
try{await withBrowser(chrome,async browser=>{report.browser=browser.version();
  await run('REVIEW-STATIC-UNIT-MISMATCH',browser,async page=>{
    const p=await install(page);await observe(page);
    const analysis=await page.evaluate(()=>{
      const p=Akari.app.project,compiled=Akari.compileProject(p),key='script:review-units',ast=compiled.astByKey.get(key);
      const decoded=Akari.blockDecode(Akari.blockEncode(ast).tree);
      const formatted=Akari.formatScript(decoded),roundtrip=Akari.parseScript(formatted,Akari.buildSymbols(p));
      let exportError=null;try{Akari.packExecutable(p)}catch(error){exportError={code:error.code,message:error.message}}
      const controls=['点数を1秒 + 2秒にする。','点数を1秒 + 2にする。','点数を（1秒の数だけ） + 2点にする。','点数を点数 + 2点にする。'];
      const controlErrors=controls.map(source=>{const q=structuredClone(p);q.scripts[0].source=source;return{source,errors:Akari.compileProject(q).errors}});
      return{errors:compiled.errors,formatted,equivalent:Akari.astEquivalent(ast,roundtrip),exportError,controlErrors};
    });
    assert.ok(analysis.errors.some(e=>e.code==='R417'&&e.line===2&&e.where==='script:review-units'),'known seconds/points addition must fail before execution');
    assert.equal(analysis.equivalent,true,'code and structured blocks preserve the unit error');
    assert.ok(analysis.exportError,'invalid program cannot become an executable');
    for(const c of analysis.controlErrors)assert.deepEqual(c.errors,[],c.source+' must remain accepted without name-based unit inference');
    const before=await state(page);
    await page.locator('#editorModeblocks').click();await page.locator('#blockEditor').waitFor({state:'visible'});await page.locator('#editorModecode').click();
    assert.deepEqual(await state(page),before,'mode roundtrip must keep project and history');
    await page.locator('#runBtn').click();
    await page.waitForFunction(()=>document.querySelector('#console').textContent.includes('作品にエラーがあるため実行しません'));
    const after=await state(page),observed=await page.evaluate(()=>__unitsObserved),position=await page.evaluate(()=>({x:Akari.app.project.components[0].x,y:Akari.app.project.components[0].y}));
    assert.deepEqual(after,before,'compile rejection preserves valid design history and state');
    assert.deepEqual(observed,{starts:0,motions:[],says:[]});assert.deepEqual(position,{x:0,y:0});
    return{source:p.scripts[0].source,analysis,before,after,observed,position};
  });
  await run('REVIEW-INVALID-CODE-NO-SUCCESS-STATUS',browser,async page=>{
    await openBody(page);await observe(page);const before=await state(page),raw='あかりは右へ１０秒動く。';
    await page.locator('#codeEditor').fill(raw);
    await page.waitForFunction(()=>Akari.app.editorState.main.pendingEdit?.kind==='code');
    await page.waitForFunction(()=>document.querySelector('#codeIssue').classList.contains('issue-error'));
    const issue=await page.locator('#codeIssue').textContent(),pendingMessage=await page.locator('#editorPending').textContent();
    assert.match(issue,/P\d+/);assert.ok(pendingMessage.length>0);
    const success=await page.locator('body').getByText('このコードの書き方は大丈夫です',{exact:false}).filter({visible:true}).count();
    assert.equal(success,0,'visible rejected code cannot show a success diagnosis');
    const pending=await state(page);assert.equal(pending.pending.value,raw);assert.equal(await page.locator('#editorModeblocks').isDisabled(),true);
    for(const key of ['project','history','redo','dirty','owner','source','state'])assert.deepEqual(pending[key],before[key],key+' must survive invalid fullwidth input');
    await page.locator('#runBtn').click();
    assert.deepEqual(await state(page),pending,'rejected Run must retain the raw pending edit');
    assert.deepEqual(await page.evaluate(()=>__unitsObserved),{starts:0,motions:[],says:[]});
    await page.locator('#editorCancel').click();
    assert.deepEqual(await state(page),before,'cancel restores baseline and history atomically');
    assert.equal(await page.locator('#codeEditor').inputValue(),before.source);
    assert.equal(await page.locator('#codeIssue').evaluate(el=>el.classList.contains('issue-error')),false);
    return{raw,before,pending,issue,pendingMessage,visibleSuccessCount:success,cancelled:await state(page),observed:await page.evaluate(()=>__unitsObserved)};
  });
  await run('REVIEW-STATIC-SCALE-RANGE',browser,async page=>{
    await openBody(page);await observe(page);const before=await state(page);
    const sources=['大きさを0％にする。','大きさを−1％にする。','大きさを１００１％にする。','大きさを（1000 + 1）％にする。'];
    const compile=await page.evaluate(sources=>sources.map(source=>{
      const p=structuredClone(Akari.app.project);p.scripts[0].source='右へ10歩動く。\n'+source;
      return{source,errors:Akari.compileProject(p).errors};
    }),sources);
    for(const row of compile)assert.ok(row.errors.some(d=>d.code==='R412'&&d.line===2),row.source+' must be diagnosed statically at its position');
    const accepted=await page.evaluate(()=>[1,100,1000].map(value=>{
      const p=structuredClone(Akari.app.project);p.scripts[0].source=`大きさを${value}％にする。`;
      return{value,errors:Akari.compileProject(p).errors};
    }));for(const row of accepted)assert.deepEqual(row.errors,[]);
    const dynamic=await page.evaluate(()=>{
      const p=structuredClone(Akari.app.project);p.projectData.variables=[{id:'size',name:'選んだ大きさ',initialValue:0}];
      p.scripts[0].source='大きさを選んだ大きさ％にする。';return Akari.compileProject(p).errors;
    });assert.deepEqual(dynamic,[],'mutable data must remain a runtime value check');
    const edits=[];
    for(const source of sources){
      await page.locator('#codeEditor').fill(source);
      await page.waitForFunction(source=>Akari.app.editorState.main.pendingEdit?.value===source,source);
      await page.waitForFunction(()=>document.querySelector('#codeIssue').textContent.includes('R412'));
      const pending=await state(page),issue=await page.locator('#codeIssue').textContent();
      assert.match(issue,/1〜1000％/);assert.match(issue,/姿をかくす/);
      for(const key of ['project','history','redo','dirty','owner','source','state'])assert.deepEqual(pending[key],before[key]);
      assert.equal(await page.locator('#codeEditor').inputValue(),source);
      await page.locator('#runBtn').click();assert.deepEqual(await state(page),pending);
      await page.locator('#editorCancel').click();assert.deepEqual(await state(page),before);
      edits.push({source,pending,issue,cancelled:await state(page)});
    }
    await page.locator('#codeEditor').fill('大きさを100％にする。');
    await page.waitForFunction(()=>Akari.app.editorState.main.sourceText==='大きさを100％にする。');
    await page.locator('#editorModeblocks').click();
    const blockBefore=await state(page),field=page.locator('#blockEditor [data-schema-id="LooksCommand:SET_SCALE"] [data-schema-id="NumberLiteral"] input[data-blockui-field="value"]');
    assert.equal(await field.count(),1);assert.equal(await field.inputValue(),'100');
    await field.fill('0');await field.press('Enter');
    await page.waitForFunction(()=>document.querySelector('#codeIssue').textContent.includes('R412'));
    const blockPending=await state(page),blockIssue=await page.locator('#codeIssue').textContent();
    for(const key of ['project','history','redo','dirty','owner','source','state'])assert.deepEqual(blockPending[key],blockBefore[key]);
    assert.equal(await field.inputValue(),'0','explicit invalid number remains visible');
    await page.locator('#runBtn').click();
    for(const key of ['project','history','redo','dirty','owner','source','state'])assert.deepEqual((await state(page))[key],blockBefore[key]);
    await page.locator('#editorCancel').click();assert.deepEqual(await state(page),blockBefore);
    assert.equal(await field.inputValue(),'100');
    const observed=await page.evaluate(()=>__unitsObserved);assert.deepEqual(observed,{starts:0,motions:[],says:[]});
    const blockCancelled=await state(page);
    await page.locator('#editorModecode').click();
    const largeBefore=await state(page),line='大きさを0％にする。\n';
    const maxSource=await page.evaluate(()=>Akari.LIMITS.sourceEach);
    const largeSource=line.repeat(Math.floor(maxSource/line.length)).padEnd(maxSource,' ');
    assert.equal([...largeSource].length,100000,'fixed full source boundary');
    const fullCompile=await page.evaluate(source=>{
      const p=structuredClone(Akari.app.project);p.scripts[0].source=source;
      const errors=Akari.compileProject(p).errors;
      return{count:errors.length,first:errors[0],last:errors.at(-1)};
    },largeSource);
    assert.equal(fullCompile.count,Math.floor(100000/line.length),'full compile diagnostics must not be truncated');
    assert.equal(fullCompile.first.code,'R412');assert.equal(fullCompile.last.code,'R412');
    await page.locator('#codeEditor').fill(largeSource);
    await page.waitForFunction(source=>Akari.app.editorState.main.pendingEdit?.value===source,largeSource);
    const largePending=await state(page),serializedLength=JSON.stringify(largePending.pending).length;
    assert.equal(largePending.pending.diagnostics.length,1,'pending recovery stores only the visible diagnostic');
    assert.equal(largePending.pending.diagnostics[0].code,'R412');
    assert.ok(serializedLength<=400000,'pending metadata must satisfy the existing recovery limit');
    for(const key of ['project','history','redo','dirty','owner','source','state'])assert.deepEqual(largePending[key],largeBefore[key]);
    await page.waitForFunction(()=>document.querySelector('#autosaveState').textContent==='自動保存：済み');
    await page.reload();await page.waitForFunction(()=>!!globalThis.Akari?.app);
    await page.locator('#recoveryRestore').waitFor({state:'visible'});await page.locator('#recoveryRestore').click();
    await page.waitForFunction(source=>Akari.app.editorState.main.pendingEdit?.value===source,largeSource);
    const recovered=await state(page);
    assert.equal(await page.locator('#codeEditor').inputValue(),largeSource,'all 100000 original characters recover exactly');
    for(const key of ['project','dirty','owner','source','state'])assert.deepEqual(recovered[key],largeBefore[key]);
    assert.equal(recovered.history,largeBefore.history+1,'recovery retains confirmed history plus the exact unfinished frame');assert.equal(recovered.redo,largeBefore.redo);
    assert.equal(recovered.pending.diagnostics.length,1);assert.equal(recovered.pending.diagnostics[0].code,'R412');
    assert.equal(await page.locator('#editorModeblocks').isDisabled(),true);
    await page.locator('#undoBtn').click();const recoveredUndo=await state(page);
    assert.equal(recoveredUndo.pending,null);assert.equal(recoveredUndo.project,largeBefore.project);
    assert.equal(recoveredUndo.history,largeBefore.history);assert.equal(recoveredUndo.redo,1);
    assert.equal(await page.locator('#codeEditor').inputValue(),largeBefore.source);
    await page.locator('#redoBtn').click();const recoveredRedo=await state(page);
    assert.equal(await page.locator('#codeEditor').inputValue(),largeSource);
    assert.equal(recoveredRedo.pending.diagnostics[0].code,'R412');
    assert.equal(recoveredRedo.history,recovered.history);assert.equal(recoveredRedo.redo,recovered.redo);
    await observe(page);await page.locator('#runBtn').click();
    assert.deepEqual(await state(page),recoveredRedo,'recovered invalid source cannot execute or alter history');
    assert.deepEqual(await page.evaluate(()=>__unitsObserved),{starts:0,motions:[],says:[]});
    await page.locator('#editorCancel').click();const recoveredCancelled=await state(page);
    assert.equal(recoveredCancelled.pending,null);assert.equal(recoveredCancelled.project,largeBefore.project);
    assert.equal(recoveredCancelled.history,recovered.history);assert.equal(recoveredCancelled.redo,recovered.redo);
    return{before,compile,accepted,dynamic,edits,blockBefore,blockPending,blockIssue,blockCancelled,observed,
      maxSourceRecovery:{sourceLength:largeSource.length,fullCompile,serializedLength,largeBefore,largePending,recovered,recoveredUndo,recoveredRedo,recoveredCancelled}};
  });
});assert.deepEqual(snapshot(product),inputs);report.status=report.results.length===3&&report.results.every(r=>r.pass)&&!report.pageErrors.length&&!report.networkRequests.length?'PASS':'FAIL';}
catch(error){report.status='FAIL';report.error=error.stack;}
save();console.log(JSON.stringify({status:report.status,results:report.results.map(r=>({id:r.id,pass:r.pass})),output}));if(report.status!=='PASS')process.exitCode=1;
