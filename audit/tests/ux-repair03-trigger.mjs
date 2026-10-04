import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {triggerSources,triggerIds,verifyTriggerObserved,verifyTriggerReport,triggerWrongMeaning} from '../lib/ux-repair03-trigger-contract.mjs';
const require=createRequire(import.meta.url),[chrome,out]=process.argv.slice(2),product=currentProductFile(),dir=path.resolve(out+'.artifacts');fs.mkdirSync(dir,{recursive:true});
const report={schema:'akari-ux-repair03-trigger-v1',status:'RUNNING',snapshot:snapshot(product),uxAcceptance:false,classification:'automated pointer/keyboard checks; no independent child UX audit claim',environment:{browser:null,playwright:require('playwright/package.json').version},pageErrors:[],networkRequests:[],results:[]};
const save=()=>fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
let serial=0,actions=[];
const settle=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function click(p,locator,label){await locator.click();actions.push({kind:'click',target:label});}
async function choose(p,locator,value,label){
 const index=await locator.locator('option').evaluateAll((es,v)=>es.findIndex(e=>e.value===v),value);assert.ok(index>=0,label+' has '+value);
 await click(p,locator,label);await locator.press('Home');for(let i=0;i<index;i++)await locator.press('ArrowDown');await locator.press('Enter');actions.push({kind:'keyboard',target:label,keys:['Home',...Array(index).fill('ArrowDown'),'Enter'],value});assert.equal(await locator.inputValue(),value);
}
async function fill(p,locator,value,label){await click(p,locator,label);await locator.press('Control+a');await locator.pressSequentially(value);actions.push({kind:'fill',target:label,value});}
const role=(p,s)=>p.locator('#blockEditor [data-blockui-structured-role="heading.'+s+'"]:visible');
const speech=p=>p.locator('.sprite-bubble').evaluateAll(es=>es.map(e=>[e.dataset.runtimeId,e.querySelector('.sprite-bubble-text').textContent]).sort((a,b)=>a[0].localeCompare(b[0])));
async function state(p){return p.evaluate(()=>{const s=Akari.app.editorState,r=document.querySelector('#blockEditor .blockui-heading-editor[open]');return{project:structuredClone(Akari.app.project),source:s.main.sourceText,owner:s.main.ownerKey,history:s.history,redo:s.redo,pending:s.main.pendingEdit,selector:document.querySelector('#eventSelect').value,hat:document.querySelector('#blockEditor .blockui-event-hat')?.textContent,headings:[...document.querySelectorAll('#blockEditor .blockui-script > .blockui-node-head > .blockui-node-title')].map(n=>n.textContent),scope:r?.querySelector('.blockui-trigger-scope')?.textContent||'',detailsOpen:!!r?.querySelector('.blockui-trigger-details[open]'),astBody:s.main.syntaxAst?.body};});}
async function prepare(p,{source=triggerSources.plain,extra=[],target='sprite-1',event='start',mode='blocks'}={}){
 const name='きっかけ契約03-'+(++serial),file=await p.evaluate(({name,source,extra})=>{const q=Akari.makeEmptyProject();q.name=name;Object.assign(q.components[0],{x:80,y:180});const d=structuredClone(q.components[0]);Object.assign(d,{id:'dango',name:'だんご',x:420});for(const c of d.costumes)c.id='dango-'+c.id;d.costumeId='dango-'+d.costumeId;q.components.push(d);q.scripts=[{id:'main',targetId:'sprite-1',event:'start',source},...extra];return Akari.serializeProject(q,Akari.makeDefaultAssetStore());},{name,source,extra});
 await p.locator('#fileInput').setInputFiles({name:'trigger03.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});await p.waitForFunction(name=>Akari.app.project.name===name,name);await p.locator('#uiLevel').selectOption('basic');await p.locator('#objectSelect').selectOption(target);await p.locator('#eventSelect').selectOption(event);if(await p.locator('#sourceOverview').isVisible())await p.locator('#sourceEditBtn').click();await p.locator('#editorMode'+mode).click();actions=[];
}
async function open(p,index=null){
 if(index!==null)await click(p,p.locator('#blockEditor .blockui-script > .blockui-node-head > .blockui-node-title').nth(index),'select motion group '+index);
 await click(p,p.locator('#sourceHeadingBtn'),'いつ動く？ entry');assert.equal(await role(p,'event').count(),1);assert.equal(await p.locator('#blockEditor .blockui-trigger-details[open]').count(),0);
}
async function change(p,event){await choose(p,role(p,'event'),event,'いつ動く？');await click(p,p.locator('#blockEditor [data-blockui-action="heading-commit"]:visible'),'この動きのきっかけを変える');await settle(p);assert.equal((await state(p)).pending,null);}
async function undoRedo(p){await click(p,p.locator('#undoBtn'),'Undo');const undo=await state(p);await click(p,p.locator('#redoBtn'),'Redo');return{undo,redo:await state(p)};}
async function runtime(p,target='sprite-1',expected='やあ  🌟'){
 await click(p,p.locator('#runBtn'),'Run');await p.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');await settle(p);const before=await speech(p);await click(p,p.locator('#formSurface .component[data-id="'+target+'"]'),'runtime click '+target);await p.waitForFunction(expected=>[...document.querySelectorAll('.sprite-bubble-text')].some(n=>n.textContent===expected),expected);const after=await speech(p);await click(p,p.locator('#stopBtn'),'Stop');return{before,after};
}
async function setView(p,v){
 await p.locator('#editorModecode').click();let lo=650,hi=1250,found=false;
 for(let i=0;i<15&&lo<=hi;i++){const height=Math.round((lo+hi)/2);await p.setViewportSize({width:v.width,height});await p.locator('#stageZoomFit').click();await settle(p);const n=parseInt(await p.locator('#stageZoomReset').textContent());if(n===48){found=true;break;}if(n<48)lo=height+1;else hi=height-1;}
 assert.ok(found,'48% fit reachable through viewport and native zoom controls');await p.locator('#stageZoomOut').click();await p.locator('#stageZoomOut').click();await p.setViewportSize(v);assert.equal(await p.locator('#stageZoomReset').textContent(),'28%');
}
try{await withBrowser(chrome,async browser=>{
 report.environment.browser=browser.version();
 for(const id of triggerIds){const row={id,status:'RUNNING'};report.results.push(row);
  try{row.observed=await pageFor(browser,product,async p=>{
   await p.setViewportSize({width:1180,height:757});p.setDefaultTimeout(8000);p.on('dialog',d=>d.accept());p.on('pageerror',e=>report.pageErrors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url());});let o;
   try{
    if(id==='trigger/open-cancel'){
     await prepare(p,{mode:'code'});const before=await state(p);await open(p);const opened=await state(p);await choose(p,role(p,'event'),'click','いつ動く？');const staged=await state(p);await click(p,p.locator('[data-blockui-action="heading-cancel"]:visible'),'変更をやめる');o={before,opened,staged,cancelled:await state(p)};
    }else if(id==='trigger/start-click-start'){
     await prepare(p);const before=await state(p);await open(p);await change(p,'click');const clicked=await state(p),r=await runtime(p);await open(p);await change(p,'start');const restored=await state(p);await click(p,p.locator('#runBtn'),'Run start');await p.waitForFunction(()=>document.querySelector('.sprite-bubble-text')?.textContent==='やあ  🌟');const start=await speech(p);await click(p,p.locator('#stopBtn'),'Stop');await click(p,p.locator('#undoBtn'),'Undo start');await click(p,p.locator('#undoBtn'),'Undo click');const undo=await state(p);await click(p,p.locator('#redoBtn'),'Redo click');await click(p,p.locator('#redoBtn'),'Redo start');o={before,clicked,restored,undo,redo:await state(p),runtime:{clickBefore:r.before,clickAfter:r.after,start}};
    }else if(id==='trigger/body-selection'){
     await prepare(p,{extra:[{id:'second',targetId:'sprite-1',event:'click',source:'「別の本文」と言う。'}]});const before=await state(p);await choose(p,p.locator('#eventSelect'),'click','編集する本文を選ぶ');o={before,after:await state(p)};
    }else if(id==='trigger/empty-body-selection'){
     await prepare(p,{mode:'code'});const before=await state(p);await choose(p,p.locator('#eventSelect'),'click','編集する本文を選ぶ');const selected=await state(p);await fill(p,p.locator('#codeEditor'),'「クリックの本文」と言う。','空のクリック本文');await click(p,p.locator('#editorModeblocks'),'ブロック表示');o={before,selected,after:await state(p),runtime:await runtime(p,'sprite-1','クリックの本文')};
    }else if(['trigger/other-owner','trigger/sibling-bodies'].includes(id)){
     const other=id.endsWith('other-owner'),changedId='second',target=other?'dango':'sprite-1',text=other?'青':'別の本文';await prepare(p,{extra:[{id:changedId,targetId:target,event:'start',source:'「'+text+'」と言う。'}],target});
     if(!other)await choose(p,p.locator('#eventSelect'),'script:second','編集する本文を選ぶ');const before=await state(p);await open(p);const scope=(await state(p)).scope;await change(p,'click');const after=await state(p),history=await undoRedo(p),r=await runtime(p,target,text);o={before,changedId,scope,after,...history,runtime:r};
    }else if(['trigger/heading-body','trigger/linked-first','trigger/linked-second'].includes(id)){
     const single=id.endsWith('heading-body'),second=id.endsWith('linked-second');await prepare(p,{source:single?triggerSources.headed:triggerSources.linked});const before=await state(p);await open(p,second?1:0);await change(p,'click');const after=await state(p),history=await undoRedo(p),r=await runtime(p,second?'dango':'sprite-1',second?'青':'赤');o={before,after,...history,runtime:r};
    }else if(id==='trigger/multiple-actors'){
     await prepare(p,{source:triggerSources.twoActors});await open(p);const scope=(await state(p)).scope;await change(p,'click');o={scope,after:await state(p),runtime:await runtime(p,'sprite-1','青')};
    }else if(id.startsWith('trigger/details-')){
     const key=id.endsWith('key'),event=key?'keyDown':'message',filter=key?'key':'message',text=key?'右':'出発';await prepare(p,{extra:key?[]:[{id:'sender',targetId:'dango',event:'click',source:'みんなに「出発」と知らせる。'}]});const before=await state(p);await open(p);await choose(p,role(p,'event'),event,'いつ動く？');await click(p,p.locator('.blockui-heading-editor[open] .blockui-trigger-details > summary'),'詳細');await choose(p,role(p,'filter.kind'),filter,'受け取る条件');await fill(p,role(p,'filter.value'),text,'キー・知らせの文字');await click(p,p.locator('[data-blockui-action="heading-commit"]:visible'),'この動きのきっかけを変える');const after=await state(p),history=await undoRedo(p);
     await click(p,p.locator('#runBtn'),'Run filtered');await p.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');await settle(p);if(key){await click(p,p.locator('#formSurface'),'focus stage');await p.keyboard.press('ArrowLeft');actions.push({kind:'keyboard',target:'stage',keys:['ArrowLeft']});await settle(p);}const beforeSpeech=await speech(p);
     if(key){await p.keyboard.press('ArrowRight');actions.push({kind:'keyboard',target:'stage',keys:['ArrowRight']});}else await click(p,p.locator('#formSurface .component[data-id="dango"]'),'send message from dango');await p.waitForFunction(()=>document.querySelector('.sprite-bubble-text')?.textContent==='やあ  🌟');const afterSpeech=await speech(p);await click(p,p.locator('#stopBtn'),'Stop');o={before,after,...history,detailsOpened:true,runtime:{before:beforeSpeech,after:afterSpeech}};
    }else{
     const [,,size,entryMode]=id.split('/'),[width,height]=size.split('x').map(Number),viewport={width,height};await prepare(p,{mode:'code'});await setView(p,viewport);if(entryMode==='blocks')await p.locator('#editorModeblocks').click();actions=[];const before=await state(p);await open(p);await p.locator('#blockEditor [data-blockui-action="zoom-reset"]').click();await settle(p);
     const layout=await p.evaluate(()=>{const field=document.querySelector('[data-blockui-structured-role="heading.event"]'),group=field.closest('fieldset'),els={event:field,commit:group.querySelector('[data-blockui-action="heading-commit"]'),cancel:group.querySelector('[data-blockui-action="heading-cancel"]'),scope:group.querySelector('.blockui-trigger-scope'),workspace:document.querySelector('#blockEditor .blockui-workspace')};return{geometry:Object.fromEntries(Object.entries(els).map(([k,n])=>[k,n.getBoundingClientRect().toJSON()])),hits:Object.fromEntries(['event','commit','cancel'].map(k=>{const n=els[k],r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return[k,n===hit||n.contains(hit)];})),stageScale:document.querySelector('#formSurface').getBoundingClientRect().width/Akari.app.project.stage.width,stageLabel:document.querySelector('#stageZoomReset').textContent,workspaceZoom:document.querySelector('[data-blockui-action="zoom-reset"]').textContent,detailsOpen:!!group.querySelector('.blockui-trigger-details[open]')};});
     await p.screenshot({path:path.join(dir,id.replaceAll('/','-')+'-open.png')});await change(p,'click');o={before,after:await state(p),viewport,entryMode,...layout};
    }
    const observed={fixtureSetup:'API serialization followed by file import',interaction:'real pointer and keyboard',actions:[...actions],...o};verifyTriggerObserved(id,observed);await p.screenshot({path:path.join(dir,id.replaceAll('/','-')+'.png')});return observed;
   }catch(e){await p.screenshot({path:path.join(dir,id.replaceAll('/','-')+'-failure.png')}).catch(()=>{});throw e;}
  });row.status='PASS';}catch(e){row.status='FAIL';row.error=e.stack;}save();console.log(row.status+' '+id);
 }
},600000);}catch(e){report.hostFailure=e.stack;}
report.status=!report.hostFailure&&report.results.length===triggerIds.length&&report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';save();
if(report.status==='PASS'){
 verifyTriggerReport(report);const negative=[];for(const[id,mutate]of triggerWrongMeaning){const bad=structuredClone(report);mutate(bad);assert.throws(()=>verifyTriggerReport(bad),id);negative.push(id);}
 for(const[name,mutate]of [['missing',r=>r.results.pop()],['duplicate',r=>r.results.push(r.results[0])],['extra',r=>r.results.push({id:'unexpected',status:'PASS',observed:{}})],['reordered',r=>r.results.reverse()],['failed',r=>r.results[0].status='FAIL']]){const bad=structuredClone(report);mutate(bad);assert.throws(()=>verifyTriggerReport(bad),name);negative.push(name);}
 fs.writeFileSync(out+'.negative.json',JSON.stringify({status:'PASS',rejected:negative},null,2)+'\n');
}else process.exitCode=1;
