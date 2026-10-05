import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {insertionSources,verifyInsertionContextObservation,verifyInsertionContextReport} from '../lib/insertion-context-contract.mjs';
const require=createRequire(import.meta.url),[chrome,out]=process.argv.slice(2);
if(!chrome||!out)throw Error('Usage: ux-insertion-context-browser.mjs <browser> <fresh-report>');
const output=path.resolve(out),artifacts=output+'.artifacts',product=currentProductFile(),started=performance.now();
if(fs.existsSync(output)||fs.existsSync(artifacts))throw Error('A fresh report and artifacts path is required');
fs.mkdirSync(artifacts,{recursive:true});
const report={schema:'akari-insertion-context-v1',status:'RUNNING',snapshot:snapshot(product),uxAcceptance:false,
  environment:{browser:null,playwright:require('playwright/package.json').version},
  execution:{platform:process.platform,node:process.version,headless:true,realIME:false,input:'native Playwright keyboard/click/Tab and separately labelled fill; synthetic composition event guard'},
  startedAt:new Date().toISOString(),pageErrors:[],networkRequests:[],results:[],screenshots:[]};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const frame=p=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const read=p=>p.evaluate(()=>{const a=Akari.app,s=a.editorState.main,root=document.querySelector('#blockEditor');
  const scalar=n=>n?.schemaId==='QuantityLiteral'?scalar(n.inputs.value):n?.fields?.value;
  const shape=n=>({id:n.id,kind:n.schemaId,...(n.schemaId==='Say'?{value:scalar(n.inputs.value),valueId:n.inputs.value.id,seconds:scalar(n.inputs.seconds)}:{}),
    ...(n.schemaId==='WaitTime'?{seconds:scalar(n.inputs.seconds)}:{}),...(n.schemaId==='RepeatCount'?{count:scalar(n.inputs.count),countId:n.inputs.count?.schemaId==='QuantityLiteral'?n.inputs.count.inputs.value.id:n.inputs.count.id}:{}),
    ...(n.schemaId==='IfStatement'?{condition:scalar(n.inputs.condition)}:{}),...Object.fromEntries(Object.entries(n.bodies||{}).map(([key,children])=>[key,children.map(shape)]))});
  const chosen=[...root.querySelectorAll('.blockui-chosen-destination')].map(e=>({parentId:e.dataset.parentId,...(e.dataset.blockuiBody?{body:e.dataset.blockuiBody,index:Number(e.dataset.insertIndex)}:{input:e.dataset.blockuiInput})}));
  const destination=root.querySelector('.blockui-destination');
  return{source:s.sourceText,project:JSON.stringify(a.project),history:a.editorState.history,owner:s.ownerKey,pending:s.pendingEdit,selection:s.blockSelection,diagnostics:s.diagnostics,
    rootId:s.blockView.id,shape:(s.blockView.bodies.body||[]).map(shape),chosen,chosenLabels:[...root.querySelectorAll('.blockui-chosen-destination')].map(e=>e.getAttribute('aria-label')),category:[...root.querySelectorAll('[data-blockui-category][aria-pressed="true"]')].map(e=>e.dataset.blockuiCategory),
    query:root.querySelector('[data-blockui-search]').value,scope:root.querySelector('.blockui-search-scope').textContent,mode:root.querySelector('[data-blockui-palette-mode]').value,
    destination:destination.textContent,destinationShown:!!destination.getClientRects().length,message:root.querySelector('.blockui-message').textContent,candidates:[...root.querySelectorAll('[data-blockui-schema]')].map(e=>e.dataset.blockuiSchema)};
});
async function install(p,source){
  const file=await p.evaluate(source=>{const project=Akari.makeEmptyProject();project.name='命令と値の追加先';project.scripts=[{id:'insertion-main',targetId:'sprite-1',event:'start',source}];return Akari.serializeProject(project,Akari.makeDefaultAssetStore());},source);
  await p.locator('#fileInput').setInputFiles({name:'insertion-context.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});
  await p.waitForFunction(()=>Akari.app.project.name==='命令と値の追加先');await p.locator('#objectSelect').selectOption('sprite-1');
  if(await p.locator('#sourceOverview').isVisible())await p.locator('#sourceEditBtn').click();await p.locator('#editorModeblocks').click();
  await p.evaluate(()=>{globalThis.insertionContextTrace=[];let down=null;
    for(const kind of ['pointerdown','pointerup','click','focusin','blur','change','input','compositionstart','compositionend'])document.querySelector('#blockEditor').addEventListener(kind,event=>{
      if(kind==='pointerdown')down=event.target;
      const s=Akari.app.editorState.main;globalThis.insertionContextTrace.push({kind,action:event.target.closest('[data-blockui-action]')?.dataset.blockuiAction||'',id:event.target.dataset.blockId||'',value:event.target.value,
        relatedAction:event.relatedTarget?.closest('[data-blockui-action]')?.dataset.blockuiAction||'',connected:event.target.isConnected,pointerTargetConnected:down?.isConnected??null,
        selection:s.blockSelection,revision:s.sourceRevision,owner:s.ownerKey,source:s.sourceText,pending:s.pendingEdit&&{id:s.pendingEdit.id,value:s.pendingEdit.value,composing:s.pendingEdit.composing}});
    },{capture:true});});await frame(p);
}
const field=(p,id)=>p.locator('#blockEditor [data-block-id="'+id+'"][data-blockui-field="value"]');
const plus=(p,parent,body='body',index=1)=>p.locator('#blockEditor [data-blockui-action="body-insert"][data-parent-id="'+parent+'"][data-blockui-body="'+body+'"][data-insert-index="'+index+'"]');
const candidate=(p,id)=>p.locator('#blockEditor [data-blockui-schema="'+id+'"]');
async function edit(p,input,value,method='native'){
  if(method==='fill')await input.fill(value);
  else{await input.click();await input.press('ControlOrMeta+A');await p.keyboard.insertText(value);}
}
async function travel(p,steps){const undo=[],redo=[];for(let i=0;i<steps;i++){await p.locator('#undoBtn').click();undo.push(await read(p));}for(let i=0;i<steps;i++){await p.locator('#redoBtn').click();redo.push(await read(p));}return{undo,redo};}
async function add(p,id='Say'){await candidate(p,id).click();await frame(p);}
async function run(browser,id,source,fn){const row={id,status:'RUNNING'};report.results.push(row);
  try{row.observed=await pageFor(browser,product,async p=>{p.setDefaultTimeout(8000);await p.setViewportSize({width:1366,height:900});p.on('dialog',d=>d.accept());p.on('pageerror',e=>report.pageErrors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url());});
    try{await install(p,source);const observed=await fn(p);observed.trace=await p.evaluate(()=>globalThis.insertionContextTrace);const name=id.replaceAll('/','-')+'.png';await p.screenshot({path:path.join(artifacts,name)});report.screenshots.push(name);return observed;}
    catch(error){const name=id.replaceAll('/','-')+'-failure.png';await p.screenshot({path:path.join(artifacts,name)}).catch(()=>{});throw error;}});
    verifyInsertionContextObservation(id,row.observed);row.status='PASS';}catch(error){row.status='FAIL';row.error=error.stack;}
  save();console.log(row.status+' '+id);
}
save();
try{await withBrowser(chrome,async browser=>{report.environment.browser=browser.version();
  for(const id of ['tail/native-click','tail/fill-click','tail/native-tab'])await run(browser,id,insertionSources.tail,async p=>{
    const before=await read(p),method=id==='tail/fill-click'?'fill':'native',targetParent=before.rootId;
    await edit(p,field(p,before.shape[0].valueId),'おはよう',method);if(id==='tail/native-tab')await p.keyboard.press('Tab');
    await plus(p,targetParent).click();const chosen=await read(p);await add(p);const inserted=await read(p);
    await edit(p,field(p,inserted.shape[1].valueId),'いってきます');await p.keyboard.press('Tab');const after=await read(p);
    return{before,chosen,targetParent,method,after,...await travel(p,3)};
  });
  for(const id of ['nested/native-click','nested/fill-click'])await run(browser,id,insertionSources.nested,async p=>{
    const before=await read(p),targetParent=before.shape[0].id;await edit(p,field(p,before.shape[0].countId),'3',id==='nested/fill-click'?'fill':'native');
    await plus(p,targetParent).click();const chosen=await read(p);await add(p);const after=await read(p);return{before,targetParent,chosen,after,...await travel(p,2)};
  });
  for(const id of ['fields/native-click','fields/fill'])await run(browser,id,insertionSources.fields,async p=>{
    const before=await read(p),method=id==='fields/fill'?'fill':'native';await edit(p,field(p,before.shape[0].valueId),'前',method);await edit(p,field(p,before.shape[1].valueId),'後',method);
    const second=await read(p);await p.keyboard.press('Tab');const after=await read(p);return{before,second,after,...await travel(p,2)};
  });
  for(const id of ['branches/then-native','branches/else-native'])await run(browser,id,insertionSources.branches,async p=>{
    const before=await read(p),targetParent=before.shape[0].id,body=id==='branches/then-native'?'thenBody':'elseBody';
    await edit(p,field(p,before.shape[0][body][0].valueId),body==='thenBody'?'変更した真':'変更した偽');await plus(p,targetParent,body).click();
    const chosen=await read(p);await add(p);const after=await read(p);return{before,targetParent,chosen,after,...await travel(p,2)};
  });
  await run(browser,'selection/category-search-cancel',insertionSources.tail,async p=>{
    const before=await read(p),targetParent=before.rootId;await p.locator('#blockEditor [data-blockui-category="basic"]').click();await p.locator('#blockEditor [data-blockui-search]').fill('話す');
    const queried=await read(p);await plus(p,targetParent).click();const chosen=await read(p);await p.locator('#blockEditor [data-blockui-action="cancel"]').click();const cancelled=await read(p);
    await plus(p,targetParent).click();await p.keyboard.press('Escape');const escaped=await read(p);return{before,targetParent,queried,chosen,cancelled,escaped};
  });
  await run(browser,'selection/empty-keyboard-mode','',async p=>{
    const before=await read(p),targetParent=before.rootId;await p.locator('#blockEditor .blockui-palette-options summary').click();await p.locator('#blockEditor [data-blockui-palette-mode]').selectOption('expression');
    await p.locator('#blockEditor [data-blockui-search]').fill('待つ');await plus(p,targetParent,'body',0).focus();await p.keyboard.press('Enter');const chosen=await read(p);
    await candidate(p,'WaitTime').focus();await p.keyboard.press('Enter');const after=await read(p);return{before,targetParent,chosen,after,...await travel(p,1)};
  });
  await run(browser,'selection/value-unavailable',insertionSources.tail,async p=>{
    const before=await read(p),say=before.shape[0];const slot=p.locator('#blockEditor [data-parent-id="'+say.id+'"][data-blockui-input="value"]');
    await field(p,say.valueId).click();await slot.locator('[data-blockui-action="slot-select"]').click();const selected=await read(p);
    await p.locator('#blockEditor .blockui-palette-options summary').click();await p.locator('#blockEditor input[aria-label="使えない候補も表示"]').check();
    const disabled=await candidate(p,'Say').evaluate(e=>{const reason=e.parentElement.querySelector('.blockui-unavailable');return{ariaDisabled:e.getAttribute('aria-disabled'),reason:reason?.textContent,reasonVisible:!!reason?.getClientRects().length};});
    await candidate(p,'Say').scrollIntoViewIfNeeded();const bounds=await candidate(p,'Say').boundingBox();await p.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
    const after=await read(p);await plus(p,before.rootId).click();const commandChosen=await read(p);return{before,selected,disabled,after,commandChosen};
  });
  await run(browser,'input/composition-cancel',insertionSources.tail,async p=>{
    const before=await read(p),input=field(p,before.shape[0].valueId);await input.click();await input.dispatchEvent('compositionstart',{data:''});await input.press('ControlOrMeta+A');await p.keyboard.insertText('へんかん');
    await plus(p,before.rootId).click();const composing=await read(p);await input.dispatchEvent('compositionend',{data:'へんかん'});await input.press('Escape');const cancelled=await read(p);
    await edit(p,input,'変換済み');await plus(p,before.rootId).click();const after=await read(p);return{before,composing,cancelled,after,inputMethod:'synthetic composition events; native text input',realIME:false};
  });
  await run(browser,'input/invalid-number-cancel',insertionSources.nested,async p=>{
    const before=await read(p);await edit(p,field(p,before.shape[0].countId),'－');await plus(p,before.shape[0].id).click();const invalid=await read(p);
    await p.locator('#blockEditor [data-blockui-action="cancel"]').click();return{before,invalid,after:await read(p)};
  });
  await run(browser,'execution/repeat-speech-wait-twice',insertionSources.repeat,async p=>{
    const before=await read(p);await p.evaluate(()=>{globalThis.insertionRuntime=[];globalThis.insertionRuntimeErrors=[];globalThis.insertionRuntimeCompleted=[];
      const prototype=Akari.EventScheduler.prototype,execute=prototype.executeNode,fail=prototype.taskError,finish=prototype.finishTask;
      prototype.executeNode=function(task,node){
        if(node.kind==='Say')insertionRuntime.push({kind:'Say',word:Akari.evalExpression(node.value,this.context(task)),line:node.sourceSpan?.startLine});
        if(node.kind==='WaitTime')insertionRuntime.push({kind:'WaitTime',seconds:Akari.numberValue(Akari.evalExpression(node.seconds,this.context(task))),line:node.sourceSpan?.startLine});
        return execute.call(this,task,node);
      };
      prototype.taskError=function(task,error){insertionRuntimeErrors.push({code:error.code,message:error.message});return fail.call(this,task,error);};
      prototype.finishTask=function(task,state='DONE'){insertionRuntimeCompleted.push({state,scriptId:task.scriptId});return finish.call(this,task,state);};
    });
    // Test-side observation delegates every call to the unchanged real runtime.
    // The UI starts both runs; no source substitution or product recorder is used.
    const runs=[];for(let i=0;i<2;i++){
      await p.evaluate(()=>{insertionRuntime=[];insertionRuntimeErrors=[];insertionRuntimeCompleted=[];});
      await p.locator('#runBtn').click();await p.waitForFunction(()=>insertionRuntimeCompleted.some(t=>t.scriptId==='insertion-main'&&t.state==='DONE'),null,{timeout:8000});
      const recorded=await p.evaluate(()=>({words:insertionRuntime.filter(r=>r.kind==='Say').map(r=>r.word),waits:insertionRuntime.filter(r=>r.kind==='WaitTime'),
        finished:insertionRuntimeCompleted.some(t=>t.scriptId==='insertion-main'&&t.state==='DONE'),error:insertionRuntimeErrors[0]||null}));
      runs.push(recorded);await p.locator('#stopBtn').click();
    }
    return{before,runs,after:await read(p)};
  });
},240000);}catch(error){report.hostFailure=error.stack;}
report.status=!report.hostFailure&&report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';
if(report.status==='PASS')try{verifyInsertionContextReport(report);}catch(error){report.status='FAIL';report.contractFailure=error.stack;}
report.completedAt=new Date().toISOString();report.durationMs=Math.round(performance.now()-started);save();if(report.status!=='PASS')process.exitCode=1;
