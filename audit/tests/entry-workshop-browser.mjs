import fs from 'node:fs';import path from 'node:path';import cp from 'node:child_process';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';import {currentProductFile} from '../lib/product-path.cjs';
import {tutorialSteps,browserIds,deniedRoutes,verifyEntryReport,entryProvenance} from '../lib/entry-workshop-contract.mjs';
const [chrome,out]=process.argv.slice(2);if(!chrome||!out)throw Error('browser and fresh report are required');
const product=currentProductFile(),output=path.resolve(out),artifacts=output+'.artifacts';
assert.ok(!fs.existsSync(output)&&!fs.existsSync(artifacts),'fresh evidence');fs.mkdirSync(artifacts,{recursive:true});
const report={schema:'akari-entry-workshop-v1',kind:'browser',status:'RUNNING',productFile:product,snapshot:snapshot(product),
 commitSha:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),command:process.argv.join(' '),startedAt:new Date().toISOString(),
 executionBasis:entryProvenance(product),browser:null,platform:process.platform,node:process.version,browserZoom:1,deviceScaleFactor:1,realIME:false,realChild:false,realChromebook:false,
 input:'native Playwright mouse/keyboard; separately identified synthetic touch, composition, drag/drop and forbidden hidden-control events',
 results:[],pageErrors:[],networkRequests:[]};
const save=()=>{report.artifacts=fs.readdirSync(artifacts).sort().map(file=>{const bytes=fs.readFileSync(path.join(artifacts,file));return{path:file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');};
const read=p=>p.evaluate(()=>{const a=Akari.app,e=a.editorState,s=e.main;return{project:JSON.stringify(a.project),
 history:e.history,redo:e.redo,dirty:e.dirty,owner:s?.ownerKey,source:s?.sourceText,mode:document.querySelector('#uiLevel').value,
 state:e.state,pending:s?.pendingEdit&&{value:s.pendingEdit.value,field:s.pendingEdit.field,composing:s.pendingEdit.composing},
 step:document.body.dataset.tutorialStep||null,selectedScript:e.selectedScriptId,menuOpen:document.querySelector('#entryProjectMenu').open,dialogs:[...document.querySelectorAll('.modal.show,.modal.open,dialog[open]')].map(n=>n.id)};});
const content=s=>({project:s.project,history:s.history,redo:s.redo,dirty:s.dirty,owner:s.owner,source:s.source,mode:s.mode,state:s.state,selectedScript:s.selectedScript,pending:s.pending,menuOpen:s.menuOpen,dialogs:s.dialogs});
const waitStep=async(p,id)=>{try{await p.waitForFunction(id=>document.body.dataset.tutorialStep===id,id,{timeout:12000});}catch(error){throw Error('Expected '+id+'; observed '+JSON.stringify(await read(p))+'\n'+error.message);}};
const picture=async(p,name)=>{const file=name+'.png';await p.screenshot({path:path.join(artifacts,file)});return file;};
async function row(browser,id,fn){const result={id,status:'RUNNING',observations:{}};report.results.push(result);
 try{result.observations=await pageFor(browser,product,async p=>{p.setDefaultTimeout(8000);await p.setViewportSize({width:1280,height:720});
 p.on('pageerror',e=>report.pageErrors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url());});
 try{return await fn(p);}catch(error){await picture(p,id+'-failure').catch(()=>{});throw error;}},{initialUiLevel:null});result.status='PASS';}
 catch(error){result.status='FAIL';result.observations.error=error.stack;}
 console.log(result.status+' '+id+(result.status==='FAIL'?' '+result.observations.error:''));save();}
async function roles(p){return p.evaluate(()=>{const b=Akari.app.editorState.main.blockView.bodies.body,s=b.find(n=>n.schemaId==='Say'),m=b.filter(n=>n.schemaId==='MotionCommand:GLIDE_DIRECTION');
 const literal=n=>n?.schemaId==='QuantityLiteral'?literal(n.inputs.value):n;
 return{text:s?.inputs.value.id,speechTime:literal(s?.inputs.seconds)?.id,outTime:literal(m[0]?.inputs.args[0])?.id,outDistance:literal(m[0]?.inputs.args[1])?.id,
 backId:m[1]?.id,backTime:literal(m[1]?.inputs.args[0])?.id,backDistance:literal(m[1]?.inputs.args[1])?.id,speechId:s?.id,root:Akari.app.editorState.main.blockView.id};});}
const field=(p,id,key='value')=>p.locator('#blockEditor [data-block-id="'+id+'"][data-blockui-field="'+key+'"]');
async function edit(p,id,value){const control=field(p,id);await control.click();await control.press('ControlOrMeta+A');await p.keyboard.insertText(String(value));await control.press('Enter');}
async function positive(p,id){const r=await roles(p);let downloaded=null;
 switch(id){
 case 'choose-click':await p.locator('#entryClickEvent').click();break;
 case 'add-speech':await p.locator('#blockEditor [data-blockui-schema="Say:timed"]').click();break;
 case 'speech-text':await edit(p,r.text,'こんにちは！');break;
 case 'speech-time':await edit(p,r.speechTime,2);break;
 case 'add-outward':case 'add-return':await p.locator('#blockEditor [data-blockui-schema="MotionCommand:GLIDE_DIRECTION"]').click();break;
 case 'outward-time':await edit(p,r.outTime,1);break;
 case 'outward-distance':await edit(p,r.outDistance,100);break;
 case 'return-direction':await field(p,r.backId,'direction').selectOption('left');break;
 case 'return-time':await edit(p,r.backTime,1);break;
 case 'return-distance':await edit(p,r.backDistance,100);break;
 case 'run-original':case 'run-longer':case 'run-reordered':await p.locator('#runBtn').click();break;
 case 'try-original':case 'try-longer':case 'try-reordered':{
  const start=await p.locator('#formSurface .component[data-id="sprite-1"]').evaluate(n=>parseFloat(n.style.left));
  await p.evaluate(()=>{window.entryMeasuredFrames=[];window.entryMeasuring=true;
    const tick=time=>{const n=document.querySelector('#formSurface .component[data-id="sprite-1"]');
      window.entryMeasuredFrames.push({time,x:parseFloat(n.style.left),speech:document.querySelector('.sprite-bubble-text')?.textContent||'',step:document.body.dataset.tutorialStep});
      if(window.entryMeasuring)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
  await p.locator('#formSurface .component[data-id="sprite-1"]').click();
  await waitStep(p,'stop-'+id.slice(4));
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const samples=await p.evaluate(()=>{window.entryMeasuring=false;return window.entryMeasuredFrames;});
  const expected=id==='try-original'?100:150,peak=Math.max(...samples.map(s=>s.x)),
    frameGap=Math.max(...samples.slice(1).map((s,i)=>s.time-samples[i].time)),renderTolerance=1+expected*Math.min(100,frameGap)/1000;
  assert.ok(peak-start>=expected-renderTolerance,id+' measured distance '+JSON.stringify({start,peak,expected,frameGap,renderTolerance}));assert.ok(Math.abs(samples.at(-1).x-start)<1,id+' actual return');
  const talking=samples.findIndex(s=>s.speech==='こんにちは！'),moving=samples.findIndex(s=>s.x>start+1);assert.ok(talking>=0&&moving>=0,'speech and movement actually rendered');
  assert.ok(id==='try-reordered'?moving<talking:talking<moving,id+' actual order');
  (p.entryRuntimeObservations||=[]).push({id,start,peak,expected,frameGap,renderTolerance,samples});break;}
 case 'stop-original':case 'stop-longer':case 'stop-reordered':await p.locator('#stopBtn').click();break;
 case 'longer-outward':await edit(p,r.outDistance,150);break;
 case 'longer-return':await edit(p,r.backDistance,150);break;
 case 'reorder-speech':await p.locator('#blockEditor .blockui-node[data-block-id="'+r.speechId+'"] .blockui-node-tools [data-blockui-action="more"]').first().click();
  await p.locator('#blockEditor [data-blockui-action="move"][data-block-id="'+r.speechId+'"]').click();
  await p.locator('#blockEditor [data-blockui-action="body-insert"][data-parent-id="'+r.root+'"][data-blockui-body="body"][data-insert-index="3"]').click();break;
 case 'undo-reorder':await p.locator('#undoBtn').click();break;
 case 'save-work':{
  const download=await Promise.all([p.waitForEvent('download'),p.locator('#saveBtn').click()]).then(x=>x[0]);
  downloaded=path.join(artifacts,'practice-'+Date.now()+'.akari.md');await download.saveAs(downloaded);assert.equal(await download.failure(),null);break;}
 case 'verify-save':throw Error('file verification requires an observed download');
 default:throw Error('No independent positive operation for '+id);
 }
 return downloaded;
}
async function reach(p,goal){await p.locator('#tutorialStart').click();let download=null;
 for(const id of tutorialSteps){await waitStep(p,id);if(id===goal)return download;const saved=await positive(p,id);if(saved)download=saved;}
 throw Error('goal not reached '+goal);}
async function exitAndResume(p,id){
 const old=await read(p),before=content(old);delete before.state;
 await p.locator('#tutorialExit').click();const after=await read(p),retained=content(after);delete retained.state;
 assert.deepEqual(retained,before,id+' exit retains confirmed work and history');assert.equal(after.step,null);assert.equal(after.state,'DESIGN');
 const remainingGuards=await p.locator('[data-tutorial-blocked],.tutorial-target').count();assert.equal(remainingGuards,0);
 await p.locator('#uiLevel').selectOption('basic');await p.locator('#uiLevel').selectOption('entry');
 await p.locator('#tutorialStart').click();let downloaded=null;
 const observations=p.entryRuntimeObservations?.slice();
 for(let i=0;i<4;i++){const current=(await read(p)).step;if(current===id)break;assert.ok(current,'resume is live');const file=await positive(p,current);if(file)downloaded=file;await waitStep(p,tutorialSteps[tutorialSteps.indexOf(current)+1]);}
 p.entryRuntimeObservations=observations;await waitStep(p,id);
 return {record:{id,before,retained,after,remainingGuards},downloaded};
}
async function deny(p,route){
 const ids={new:'newBtn',sample:'sampleBtn',open:'openBtn',export:'exportBtn',redo:'redoBtn',dialog:'openConfirmProceed'};
 if(route==='sample')await p.locator('#sampleBtn').click({force:true});
 else if(route==='mouse-menu')await p.locator('#entryProjectMenu > summary').click({force:true});
 else if(route==='keyboard-enter'||route==='keyboard-space')await p.locator('#newBtn').evaluate((el,route)=>{const event=new KeyboardEvent('keydown',{key:route==='keyboard-enter'?'Enter':' ',bubbles:true,cancelable:true});el.dispatchEvent(event);if(!event.defaultPrevented)throw Error('Forbidden keyboard activation was not canceled');el.click();},route);
 else if(ids[route])await p.locator('#'+ids[route]).evaluate(el=>el.click());
 else if(route==='mode')await p.locator('#uiLevel').evaluate(el=>{el.value='advanced';el.dispatchEvent(new Event('change',{bubbles:true}));});
 else if(route==='target')await p.locator('#objectSelect').evaluate(el=>{el.value='stage';el.dispatchEvent(new Event('change',{bubbles:true}));});
 else if(route==='event')await p.locator('#eventSelect').evaluate(el=>{el.value='start';el.dispatchEvent(new Event('change',{bubbles:true}));});
 else if(['shortcut-save','shortcut-undo','delete-key'].includes(route)){
  await p.locator('#tutorialExit').focus();await p.keyboard.press(route==='shortcut-save'?'ControlOrMeta+Shift+s':route==='shortcut-undo'?'ControlOrMeta+Shift+z':'Delete');
 }else await p.evaluate(route=>{const target=document.querySelector('#projectName');
  if(route==='menu')target.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
  if(route==='touch')target.dispatchEvent(new Event('touchstart',{bubbles:true,cancelable:true}));
  if(route==='drag')target.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()}));
  if(route==='file-drop'){const data=new DataTransfer();data.items.add(new File(['bad project'],'replacement.akari.md',{type:'text/plain'}));document.querySelector('#formSurface').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));}
 },route);
}
save();
await withBrowser(chrome,async browser=>{report.browser=browser.version();
 await row(browser,browserIds[0],async p=>{const viewports=[];
  for(const size of [{width:1280,height:720},{width:1366,height:768},{width:1920,height:1080}]){
   await p.setViewportSize(size);assert.equal(await p.locator('#uiLevel').inputValue(),'entry');assert.equal(await p.locator('#tutorialStart').isVisible(),true);
   assert.equal((await read(p)).step,null);const bounds=await p.evaluate(()=>{const r=s=>{const x=document.querySelector(s).getBoundingClientRect();return{x:x.x,y:x.y,right:x.right,bottom:x.bottom,width:x.width,height:x.height};};return{palette:r('.blockui-palette'),workspace:r('.blockui-workspace'),stage:r('#designerWindow'),objects:r('.side'),toolbar:r('.menutool')};});
   assert.ok(bounds.palette.x<bounds.workspace.x&&bounds.workspace.x<bounds.stage.x,'left blocks, middle editing, right stage');
   for(const [name,b]of Object.entries(bounds)){assert.ok(b.width>0&&b.height>0,name);assert.ok(b.right<=size.width+1&&b.bottom<=size.height+1,name+' inside viewport');}
   viewports.push({size,bounds,screenshot:await picture(p,'entry-'+size.width+'x'+size.height)});
  }await p.setViewportSize({width:390,height:844});const narrow={size:{width:390,height:844},screenshot:await picture(p,'entry-narrow')};return{viewports,narrow,autoStarted:false};});
 await row(browser,browserIds[1],async p=>{const before=await read(p),states=[];
  for(const mode of ['advanced','basic','entry']){await p.locator('#uiLevel').selectOption(mode);const after=await read(p);assert.equal(after.project,before.project);assert.equal(after.history,before.history);assert.equal(after.dirty,before.dirty);states.push(after);}
  const text=await p.evaluate(()=>{const project=Akari.makeEmptyProject();project.name='入門対象外の保持';project.scripts[0].source='※ 注釈を保持\n\nペンを下ろす。';return Akari.serializeProject(project,Akari.makeDefaultAssetStore());});
  await p.locator('#fileInput').setInputFiles({name:'outside.akari.md',mimeType:'text/plain',buffer:Buffer.from(text)});await p.waitForFunction(()=>Akari.app.project.name==='入門対象外の保持');await p.locator('#objectSelect').selectOption('sprite-1');
  assert.equal(await p.locator('#entryOutside').isVisible(),true);const outside=await read(p);
  for(const mode of ['advanced','basic','entry']){await p.locator('#uiLevel').selectOption(mode);assert.equal((await read(p)).project,outside.project);assert.equal((await read(p)).source,outside.source);assert.equal((await read(p)).history,outside.history);}
  await p.locator('#uiLevel').selectOption('basic');await p.locator('#blockEditor [data-blockui-schema="RepeatCount"]').click();
  const draft=()=>p.evaluate(()=>{const a=Akari.app,s=a.editorState.main;return{project:JSON.stringify(a.project),source:s.sourceText,history:a.editorState.history,redo:a.editorState.redo,dirty:a.editorState.dirty,pending:JSON.stringify(s.pendingEdit),tree:JSON.stringify(s.blockView)};});
  const structural=await draft();assert.ok(structural.pending.includes('block-draft'));
  for(const mode of ['advanced','entry','basic']){await p.locator('#uiLevel').selectOption(mode);assert.equal(await p.locator('#uiLevel').inputValue(),mode);assert.deepEqual(await draft(),structural);}
  const count=await p.evaluate(()=>{let n=Akari.app.editorState.main.blockView.bodies.body.at(-1).inputs.count;return n.schemaId==='QuantityLiteral'?n.inputs.value.id:n.id;});await field(p,count).fill('－');const unconfirmed=await draft();
  await p.locator('#uiLevel').selectOption('advanced');assert.equal(await p.locator('#uiLevel').inputValue(),'basic');assert.deepEqual(await draft(),unconfirmed);await field(p,count).press('Escape');
  return{before,states,outside,structural,unconfirmed,afterCancel:await draft()};});
 await row(browser,browserIds[2],async p=>{await p.locator('#uiLevel').selectOption('basic');
  const before=await read(p);await p.locator('#blockEditor [data-blockui-schema="Say:timed"]').click();const inserted=await read(p);assert.notEqual(inserted.source,before.source);assert.equal(inserted.history,before.history+1);
  await p.locator('#undoBtn').click();assert.equal((await read(p)).source,before.source);await p.locator('#redoBtn').click();assert.equal((await read(p)).source,inserted.source);
  const id=(await roles(p)).speechId;await p.locator('#blockEditor .blockui-node[data-block-id="'+id+'"]').first().click({position:{x:20,y:20}});
  await p.locator('#blockEditor [data-blockui-schema="WaitTime"]').click();const appended=await read(p);assert.equal(await p.evaluate(()=>Akari.app.editorState.main.blockView.bodies.body.at(-1).schemaId),'WaitTime');
  return{before,inserted,appended,screenshot:await picture(p,'ordinary-append')};});
 await row(browser,browserIds[3],async p=>{await p.locator('#blockEditor [data-blockui-schema="Say:timed"]').click();const before=await read(p);
  p.once('dialog',d=>d.dismiss());await p.locator('#tutorialStart').click();const cancelled=await read(p);assert.deepEqual(content(cancelled),content(before));assert.equal(cancelled.step,null);
  p.once('dialog',d=>d.accept());await p.locator('#tutorialStart').click();await waitStep(p,'choose-click');const accepted=await read(p);assert.notEqual(accepted.project,before.project);
  await p.locator('#tutorialExit').click();return{before,cancelled,accepted,afterExit:await read(p)};});
 await row(browser,browserIds[4],async p=>{await p.locator('#tutorialStart').click();const steps=[],exits=[];let downloaded=null;
  for(const [index,id]of tutorialSteps.entries()){
   await waitStep(p,id);const resumed=await exitAndResume(p,id);exits.push(resumed.record);if(resumed.downloaded)downloaded=resumed.downloaded;
   const before=await read(p),denials=[];
   await p.waitForTimeout(180);const idle=await read(p);assert.equal(idle.step,id,'no operation cannot advance '+id);assert.deepEqual(content(idle),content(before));
   for(const route of deniedRoutes){const old=await read(p);await deny(p,route);const after=await read(p);assert.deepEqual(content(after),content(old),id+'/'+route);assert.equal(after.step,id,id+'/'+route+' cannot advance');denials.push({route,unchanged:true,before:content(old),after:content(after)});}
   if(id==='verify-save'){assert.ok(downloaded);const beforeVerify=await read(p);await p.locator('#tutorialSavedFile').setInputFiles(downloaded);await p.waitForFunction(()=>!document.body.dataset.tutorialStep);const after=await read(p);assert.equal(after.project,beforeVerify.project);assert.equal(after.history,beforeVerify.history);}
   else {const file=await positive(p,id);if(file)downloaded=file;if(index+1<tutorialSteps.length)await waitStep(p,tutorialSteps[index+1]);}
   steps.push({id,before,idle,denials,after:await read(p),screenshot:await picture(p,'tutorial-'+id)});
  }
  assert.equal(await p.locator('#tutorialGuide').isVisible(),false);await p.locator('#uiLevel').selectOption('basic');assert.equal(await p.locator('#uiLevel').inputValue(),'basic');
  return{steps,exits,downloaded,runtimeRuns:p.entryRuntimeObservations,completed:await read(p)};});
 await row(browser,browserIds[5],async p=>{await reach(p,'speech-text');const r=await roles(p),control=field(p,r.text);await control.fill('変換途中');
  await control.dispatchEvent('compositionstart');const pending=await read(p);assert.equal(pending.step,'speech-text');await p.locator('#tutorialExit').click();const afterExit=await read(p);
  assert.equal(afterExit.step,null);assert.equal(await control.inputValue(),'変換途中');assert.ok(afterExit.pending);
  await control.dispatchEvent('compositionend');await control.press('Enter');assert.ok((await read(p)).source.includes('変換途中'));
  await p.locator('#uiLevel').selectOption('basic');return{pending,afterExit,ordinaryEdit:await read(p),syntheticIME:true,screenshot:await picture(p,'pending-exit')};});
 await row(browser,browserIds[6],async p=>{await reach(p,'speech-text');await p.locator('#tutorialExit').click();const old=await read(p);await p.locator('#tutorialStart').click();await waitStep(p,'speech-text');assert.equal((await read(p)).project,old.project);
  await p.locator('#tutorialExit').click();const r=await roles(p);await edit(p,r.text,'別の作品に改造');const changed=await read(p);p.once('dialog',d=>d.dismiss());await p.locator('#tutorialStart').click();assert.equal((await read(p)).project,changed.project);assert.equal((await read(p)).step,null);
  return{unchangedResume:old,changed,cancelledRestart:await read(p)};});
 await row(browser,browserIds[7],async p=>{const downloaded=await reach(p,'verify-save');const before=await read(p);
  await p.locator('#tutorialSavedFile').dispatchEvent('cancel');assert.equal((await read(p)).step,'verify-save');
  await p.locator('#tutorialSavedFile').setInputFiles({name:'broken.akari.md',mimeType:'text/plain',buffer:Buffer.from('not a project')});await p.waitForFunction(()=>document.querySelector('#statusText').textContent.includes('保存の確認'));
  assert.equal((await read(p)).step,'verify-save');assert.deepEqual(content(await read(p)),content(before));
  const different=await p.evaluate(()=>{const project=Akari.makeEmptyProject();project.name='違う作品';return Akari.serializeProject(project,Akari.makeDefaultAssetStore());});
  await p.locator('#tutorialSavedFile').setInputFiles({name:'same-name.akari.md',mimeType:'text/plain',buffer:Buffer.from(different)});await p.waitForFunction(()=>document.querySelector('#statusText').textContent.includes('内容が違います'));
  const refused=await read(p);assert.equal(refused.step,'verify-save');assert.deepEqual(content(refused),content(before));
  await p.locator('#tutorialSavedFile').setInputFiles(downloaded);await p.waitForFunction(()=>!document.body.dataset.tutorialStep);assert.equal((await read(p)).project,before.project);
  return{before,refused,retried:await read(p),cancelDidNotComplete:true,parseFailureDidNotComplete:true,mismatchDidNotComplete:true};});
 await row(browser,browserIds[8],async p=>{
  const file=await p.evaluate(()=>{const project=Akari.makeEmptyProject();project.name='座標取り込みの実操作';
   const first=project.components[0];Object.assign(first,{x:123.75,y:80.25,direction:35,scalePercent:65});
   const second=structuredClone(first);Object.assign(second,{id:'sprite-2',name:'二人目',x:-20.5,y:130.125});second.costumes=second.costumes.map(c=>({...c,id:c.id+'-second'}));second.costumeId+='-second';project.components.push(second);
   project.scripts=[{id:'position-main',targetId:'sprite-1',event:'start',source:'横25.5、縦－33.25の位置に行く。'}];return Akari.serializeProject(project,Akari.makeDefaultAssetStore());});
  await p.locator('#fileInput').setInputFiles({name:'position.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});
  await p.waitForFunction(()=>Akari.app.project.name==='座標取り込みの実操作');await p.locator('#objectSelect').selectOption('sprite-1');
  const positions=async()=>p.evaluate(()=>Akari.app.project.components.map(c=>({id:c.id,x:c.x,y:c.y}))),before=await positions(),observations=[];
  const blockValues=()=>p.evaluate(()=>{const s=Akari.app.editorState.main,scalar=n=>n.schemaId==='QuantityLiteral'?scalar(n.inputs.value):n.schemaId.startsWith('UnaryExpression')?-scalar(n.inputs.value):n.fields.value;
   return s.blockView.bodies.body.filter(n=>['MotionCommand:GOTO','MotionCommand:GLIDE'].includes(n.schemaId)).map(n=>({schema:n.schemaId,values:n.inputs.args.map(scalar)}));});
  for(const schema of ['MotionCommand:GOTO','MotionCommand:GLIDE']){await p.locator('#blockEditor [data-blockui-schema="'+schema+'"]').click();const values=await blockValues();assert.deepEqual(values[0].values,[25.5,-33.25]);assert.deepEqual(values.at(-1).values.slice(-2),[123.75,80.25]);observations.push({schema,values});}
  assert.deepEqual(await positions(),before);await p.locator('#stageZoomOut').click();
  const sprite=p.locator('#formSurface .component[data-id="sprite-1"]');await sprite.scrollIntoViewIfNeeded();let box=await sprite.boundingBox();
  await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.mouse.move(box.x+box.width/2+14,box.y+box.height/2+9,{steps:3});await p.keyboard.press('Escape');await p.mouse.up();assert.deepEqual(await positions(),before,'cancel restores confirmed decimals');
  box=await sprite.boundingBox();await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.mouse.move(box.x+box.width/2+12,box.y+box.height/2+8,{steps:3});await p.mouse.up();const moved=await positions();assert.notDeepEqual(moved,before);
  await p.locator('#undoBtn').click();assert.deepEqual(await positions(),before);await p.locator('#redoBtn').click();assert.deepEqual(await positions(),moved);
  await p.locator('#blockEditor [data-blockui-schema="MotionCommand:GOTO"]').click();const afterDrag=await blockValues();assert.deepEqual(afterDrag.at(-1).values,[moved[0].x,moved[0].y]);assert.deepEqual(afterDrag[1].values,[123.75,80.25],'earlier block never follows later drag');
  await p.locator('#objectSelect').selectOption('sprite-2');await p.locator('#blockEditor [data-blockui-schema="MotionCommand:GOTO"]').click();const second=await blockValues();assert.deepEqual(second.at(-1).values,[-20.5,130.125]);
  return{before,moved,observations,afterDrag,second,screenshot:await picture(p,'position-dom')};
 });
 await row(browser,browserIds[9],async p=>{
  await reach(p,'speech-text');const r=await roles(p),input=field(p,r.text),before=await read(p);
  await input.fill('違う言葉');await input.press('Enter');assert.equal((await read(p)).step,'speech-text');
  await input.fill('こんにちは！');await input.dispatchEvent('compositionstart');await input.press('Enter');assert.equal((await read(p)).step,'speech-text');
  await input.dispatchEvent('compositionend');await input.press('Enter');await waitStep(p,'speech-time');
  const time=field(p,(await roles(p)).speechTime),wrong=await read(p);await time.fill('999');await time.press('Enter');assert.equal((await read(p)).step,'speech-time');assert.equal((await read(p)).source,wrong.source);
  await time.press('Escape');await edit(p,(await roles(p)).speechTime,2);await waitStep(p,'add-outward');
  await p.locator('#blockEditor [data-blockui-schema="MotionCommand:GLIDE_DIRECTION"]').dblclick();await waitStep(p,'outward-time');assert.equal(await p.evaluate(()=>Akari.app.editorState.main.blockView.bodies.body.length),2);
  await p.locator('#tutorialExit').focus();await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.dataset.tutorialBlocked!=='true'&&document.activeElement.getClientRects().length>0),true);
  const pending=await read(p);await p.locator('#tutorialExit').click();assert.equal((await read(p)).step,null);
  return{before,wrong,pending,afterExit:await read(p),wrongTextDidNotAdvance:true,unconfirmedIMEDidNotAdvance:true,outOfRangeDidNotCommit:true,doubleClickInsertedOnce:true};
 });
 await row(browser,browserIds[10],async p=>{
  await reach(p,'save-work');const before=await read(p);await p.evaluate(()=>{window.originalCreateURL=URL.createObjectURL;URL.createObjectURL=()=>{throw Error('Injected download preparation failure');};});
  await p.locator('#saveBtn').click();const failed=await read(p);assert.equal(failed.step,'save-work');assert.deepEqual(content(failed),content(before));
  await p.evaluate(()=>{URL.createObjectURL=window.originalCreateURL;});const downloaded=await positive(p,'save-work');await waitStep(p,'verify-save');
  await p.evaluate(()=>{Akari.app.project.name+=' 改造';});await waitStep(p,'save-work');
  await p.locator('#tutorialSavedFile').setInputFiles(downloaded);assert.equal((await read(p)).step,'save-work','old file cannot finish changed work');
  const resaved=await positive(p,'save-work');await waitStep(p,'verify-save');await p.locator('#tutorialSavedFile').setInputFiles(resaved);await p.waitForFunction(()=>!document.body.dataset.tutorialStep);
  return{before,failed,downloaded,resaved,completed:await read(p),saveFailureDidNotAdvance:true,changedWorkRequiresResave:true};
 });
 await row(browser,browserIds[11],async p=>{
  const downloaded=await reach(p,'verify-save');await p.evaluate(()=>{window.originalFileText=File.prototype.text;File.prototype.text=function(){return new Promise(resolve=>{window.delayedFileResolve=()=>window.originalFileText.call(this).then(resolve);});};});
  await p.locator('#tutorialSavedFile').setInputFiles(downloaded);await p.waitForFunction(()=>!!window.delayedFileResolve);
  await p.locator('#tutorialExit').click();const exited=await read(p);await p.evaluate(()=>{File.prototype.text=window.originalFileText;window.delayedFileResolve();});
  await p.evaluate(()=>new Promise(r=>setTimeout(r,120)));assert.equal((await read(p)).step,null);assert.deepEqual(content(await read(p)),content(exited));assert.equal(await p.locator('[data-tutorial-blocked],.tutorial-target').count(),0);
  await p.reload();await p.locator('#recoveryModal.show').waitFor();await p.locator('#recoveryRestore').click();await p.waitForFunction(()=>Akari.app.project.name==='あいさつして もどる');assert.equal((await read(p)).step,null);assert.equal(await p.locator('#tutorialGuide').isVisible(),false);
  return{exited,restored:await read(p),staleCallbackIgnored:true,progressNotPersisted:true};
 });
},600000);
report.status=report.results.every(r=>r.status==='PASS')&&report.pageErrors.length===0?'PASS':'FAIL';save();
if(report.status==='PASS')verifyEntryReport(report,'browser',snapshot(product),{allowWorkingCopy:true,file:output});else process.exitCode=1;
