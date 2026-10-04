import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {install} from '../lib/ux-repair02-ui.mjs';
import {speechTexts,multilineTexts,ordinaryNames,unicodeNames,speechViews,speechLayoutCases,speechIds,b10Source,verifySpeechObserved,verifySpeechReport} from '../lib/ux-repair03-speech-contract.mjs';
const require=createRequire(import.meta.url),[chrome,out]=process.argv.slice(2),product=currentProductFile(),output=path.resolve(out),dir=output+'.artifacts';
fs.mkdirSync(dir,{recursive:true});
const report={schema:'akari-ux-repair03-speech-v1',status:'RUNNING',snapshot:snapshot(product),uxAcceptance:false,classification:'automated UI evidence; fixture preparation uses internal serialization; no independent UX audit claim',environment:{browser:null,playwright:require('playwright/package.json').version},pageErrors:[],networkRequests:[],results:[]};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const common={fixtureSetup:'internal API serialization; UI file import',interaction:'real pointer and keyboard'};
let serial=0;
const say=t=>'「'+t.replaceAll('\\','\\\\').replaceAll('」','\\」')+'」と言う。';
async function prepare(p,{texts=speechTexts,names=ordinaryNames,scripts=null}={}){
 await install(p,'',{mode:'code'});
 const name='発話契約03-'+(++serial),file=await p.evaluate(({texts,names,scripts,name})=>{
  const q=structuredClone(Akari.app.project);q.name=name;
  q.components.forEach((c,i)=>{c.name=names[i];Object.assign(c,i===0?{x:80,y:180}:{x:420,y:180});});
  q.projectData.variables.push({id:'long-string',name:'文章',initialValue:'値'.repeat(170)});
  // Dedicated reading fixtures allow ten seconds; B10 below keeps its independent, exact two-second source.
  q.scripts=scripts||q.components.map((c,i)=>({id:'speech-'+i,targetId:c.id,event:'start',source:Akari.formatExpression({kind:'StringLiteral',value:texts[i]})+'と10秒話す。'}));
  return Akari.serializeProject(q,Akari.app.assetStore);
 },{texts,names,scripts,name});
 await p.locator('#fileInput').setInputFiles({name:'speech03.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});
 await p.waitForFunction(name=>Akari.app.project.name===name,name);
 if(await p.locator('#sourceOverview').isVisible())await p.locator('#sourceEditBtn').click();
}
async function setView(p,v){
 await p.setViewportSize({width:v.width,height:v.height});
 if(v.scale===100)await p.locator('#stageZoomReset').click();
 else{
  // Establish the requested percentage through actual fit/zoom controls, then restore the requested viewport.
  const target=v.scale+20;let lo=650,hi=1250,found=false;
  for(let i=0;i<15&&lo<=hi;i++){
   const height=Math.round((lo+hi)/2);await p.setViewportSize({width:v.width,height});await p.locator('#stageZoomFit').click();
   await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const n=parseInt(await p.locator('#stageZoomReset').textContent());
   if(n===target){found=true;break;}if(n<target)lo=height+1;else hi=height-1;
  }
  assert.equal(found,true,'fit percentage reachable');await p.locator('#stageZoomOut').click();await p.locator('#stageZoomOut').click();
  await p.setViewportSize({width:v.width,height:v.height});
 }
 assert.equal(parseInt(await p.locator('#stageZoomReset').textContent()),v.scale);
}
const bubbles=p=>p.locator('.sprite-bubble').evaluateAll(bs=>bs.map(b=>{
 const t=b.querySelector('.sprite-bubble-text'),r=new Range();r.selectNodeContents(t);
 const s=document.querySelector('#formSurface').getBoundingClientRect().width/document.querySelector('#formSurface').clientWidth;
 return{id:b.dataset.runtimeId,speaker:b.dataset.speaker,text:t.textContent,full:!b.querySelector('[data-speech-full]').hidden,rect:b.getBoundingClientRect().toJSON(),textBox:t.getBoundingClientRect().toJSON(),ink:r.getBoundingClientRect().toJSON(),font:parseFloat(getComputedStyle(b).fontSize)*s,clipped:t.scrollHeight>t.clientHeight+1};
}));
const dialog=p=>p.evaluate(()=>{
 const elem=s=>{const n=document.querySelector(s),r=new Range();r.selectNodeContents(n);return{text:n.textContent,rect:n.getBoundingClientRect().toJSON(),ink:r.getBoundingClientRect().toJSON(),font:parseFloat(getComputedStyle(n).fontSize),clientWidth:n.clientWidth,clientHeight:n.clientHeight,scrollWidth:n.scrollWidth,scrollHeight:n.scrollHeight};},m=document.querySelector('#valueModal'),title=elem('#valueTitle');
 return{open:m.classList.contains('show'),title,body:elem('#valueOutput'),close:elem('#valueClose'),notice:document.querySelector('#valueNotice').textContent,listControls:!document.querySelector('#valueListControls').hidden,labelledby:m.getAttribute('aria-labelledby'),accessibleName:m.hasAttribute('aria-labelledby')?document.getElementById(m.getAttribute('aria-labelledby')).textContent:m.getAttribute('aria-label'),dialog:m.querySelector('.dialog').getBoundingClientRect().toJSON(),viewport:{left:0,top:0,right:innerWidth,bottom:innerHeight}};
});
async function tabTo(p,selector){
 for(let i=0;i<100;i++){if(await p.locator(selector).evaluate(n=>n===document.activeElement))return;await p.keyboard.press('Tab');}
 throw Error('Keyboard cannot reach '+selector);
}
async function copyByPointer(p){
 const points=await p.locator('#valueOutput').evaluate(n=>{
  const t=n.firstChild;if(!t?.length)throw Error('No selectable speech text');const first=new Range(),last=new Range();first.setStart(t,0);first.setEnd(t,1);last.setStart(t,t.length-1);last.setEnd(t,t.length);const a=first.getBoundingClientRect(),b=last.getBoundingClientRect();return{start:{x:a.left+.1,y:a.top+a.height/2},end:{x:b.right+.1,y:b.top+b.height/2}};
 });
 await p.mouse.move(points.start.x,points.start.y);await p.mouse.down();await p.mouse.move(points.end.x,points.end.y,{steps:12});await p.mouse.up();
 const selectedText=await p.evaluate(()=>getSelection().toString());let clipboard;
 try{await p.context().grantPermissions(['clipboard-read','clipboard-write']);await p.keyboard.press('Control+c');clipboard={status:'copied',text:await p.evaluate(()=>navigator.clipboard.readText())};}
 catch(e){clipboard={status:'unavailable',reason:e.message};}
 return{selectedText,clipboard};
}
async function open(p,id,input='pointer'){
 const selector=`.sprite-bubble[data-runtime-id="${id}"] [data-speech-full]`;
 if(input==='pointer')await p.locator(selector).click();else{await tabTo(p,selector);await p.keyboard.press('Enter');}
 await p.locator('#valueModal.show').waitFor();return dialog(p);
}
async function pair(p,tag){
 const observed={bubbles:await bubbles(p),openings:[]};await p.screenshot({path:path.join(dir,tag+'-bubbles.png')});
 for(const [i,id]of ['sprite-1','dango'].entries()){
  const input=i===0?'pointer':'keyboard',d=await open(p,id,input),copy=await copyByPointer(p);
  await p.screenshot({path:path.join(dir,tag+'-'+id+'.png')});
  if(i===0)await p.keyboard.press('Escape');else{await tabTo(p,'#valueClose');await p.keyboard.press('Enter');}
  observed.openings.push({input,dialog:d,...copy,closed:!(await p.locator('#valueModal').isVisible())});
 }
 return observed;
}
async function start(p,count=2){await p.locator('#runBtn').click();await p.waitForFunction(n=>document.querySelectorAll('.sprite-bubble').length===n,count);}
const stopped=p=>p.evaluate(()=>({open:document.querySelector('#valueModal').classList.contains('show'),bubbles:document.querySelectorAll('.sprite-bubble').length,runState:document.querySelector('#runState').textContent}));
try{await withBrowser(chrome,async browser=>{
 report.environment.browser=browser.version();
 const run=async(id,fn)=>{
  const row={id,status:'RUNNING'};report.results.push(row);
  try{row.observed=await pageFor(browser,product,async p=>{
   p.setDefaultTimeout(8000);p.on('dialog',d=>d.accept());p.on('pageerror',e=>report.pageErrors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url());});
   await p.setViewportSize({width:1180,height:757});
   try{const o={...common,...await fn(p)};row.observed=o;verifySpeechObserved(id,o);return o;}catch(e){await p.screenshot({path:path.join(dir,id.replaceAll('/','-')+'-failure.png')}).catch(()=>{});throw e;}
  });row.status='PASS';}catch(e){row.status='FAIL';row.error=e.stack;}
  save();console.log(row.status+' '+id);
 };
 for(const c of speechLayoutCases)await run(c.id,async p=>{
  await prepare(p,{texts:c.scale===100?multilineTexts:speechTexts,names:c.names==='ordinary'?ordinaryNames:unicodeNames});await setView(p,c);await start(p);
  return{viewport:{width:c.width,height:c.height},scale:parseInt(await p.locator('#stageZoomReset').textContent()),...await pair(p,c.id.replaceAll('/','-'))};
 });
 await run('speech/plain-78/switch-and-rerun',async p=>{
  await prepare(p);await setView(p,speechViews[0]);const runs=[];for(let i=0;i<2;i++){await start(p);runs.push(await pair(p,'plain78-run'+i));await p.locator('#stopBtn').click();}return{lengths:speechTexts.map(t=>Array.from(t).length),runs};
 });
 for(const v of speechViews)await run(`speech/B10/${v.width}x${v.height}/${v.scale}`,async p=>{
  await prepare(p,{scripts:[{id:'main',targetId:'sprite-1',event:'start',source:b10Source}]});await setView(p,v);
  await p.evaluate(()=>{window.speechEvents=[];new MutationObserver(rs=>{for(const r of rs)for(const [kind,nodes]of [['add',r.addedNodes],['remove',r.removedNodes]])for(const n of nodes)if(n.nodeType===1&&n.matches('.sprite-bubble'))speechEvents.push({kind,id:n.dataset.runtimeId,text:n.querySelector('.sprite-bubble-text').textContent,at:performance.now()});}).observe(document.querySelector('#formSurface'),{childList:true});});
  await start(p);const b=await bubbles(p);await p.screenshot({path:path.join(dir,`B10-${v.width}-${v.scale}.png`)});await p.waitForFunction(()=>document.querySelectorAll('.sprite-bubble').length===0,null,{timeout:4000});
  return{source:await p.evaluate(()=>Akari.app.project.scripts[0].source),scale:parseInt(await p.locator('#stageZoomReset').textContent()),bubbles:b,events:await p.evaluate(()=>speechEvents)};
 });
 await run('speech/snapshot-update-clear',async p=>{
  await prepare(p,{scripts:[{id:'first',targetId:'sprite-1',event:'start',source:say(speechTexts[0]).replace('と言う。','と1秒話す。')+'\n'+say(speechTexts[1]).replace('と言う。','と1秒話す。')},{id:'second',targetId:'dango',event:'start',source:say(multilineTexts[1]).replace('と言う。','と5秒話す。')}]});await setView(p,speechViews[0]);await start(p);
  const initial=await open(p,'sprite-1');await p.waitForFunction(t=>document.querySelector('.sprite-bubble[data-runtime-id="sprite-1"] .sprite-bubble-text')?.textContent===t,speechTexts[1]);const updatedBubbles=await bubbles(p),afterUpdate=await dialog(p);
  await p.waitForFunction(()=>!document.querySelector('.sprite-bubble[data-runtime-id="sprite-1"]'));const clearedBubbles=await bubbles(p),afterClear=await dialog(p);await p.screenshot({path:path.join(dir,'snapshot-after-clear.png')});await p.keyboard.press('Escape');const other=await open(p,'dango');return{initial,updatedBubbles,afterUpdate,clearedBubbles,afterClear,other};
 });
 await run('speech/stop-and-rerun',async p=>{
  await prepare(p,{scripts:[{id:'first',targetId:'sprite-1',event:'start',source:say(speechTexts[0])+'\n1秒待つ。\nすべてを止める。'},{id:'second',targetId:'dango',event:'start',source:say(speechTexts[1])}]});await setView(p,speechViews[0]);await start(p);const initial=await open(p,'sprite-1');
  // STOP_ALL changes scheduler state before its queued UI disposal. Await the
  // completed visible stop within the existing timeout; retain every assertion.
  await p.waitForFunction(()=>document.querySelector('#runState').textContent==='停止中'&&!document.querySelector('#valueModal').classList.contains('show')&&document.querySelectorAll('.sprite-bubble').length===0);const afterStop=await stopped(p);
  await start(p);const rerun=await open(p,'dango');await p.keyboard.press('Escape');await p.locator('#stopBtn').click();return{initial,afterStop,rerun,afterUiStop:await stopped(p)};
 });
 await run('speech/clone-identity',async p=>{
  await prepare(p,{scripts:[{id:'first',targetId:'sprite-1',event:'start',source:'自分のクローンを作る。\n'+say(speechTexts[0]).replace('と言う。','と10秒話す。')},{id:'clone',targetId:'sprite-1',event:'cloneStart',source:say(speechTexts[1]).replace('と言う。','と10秒話す。')}]});await setView(p,speechViews[0]);await start(p);const b=(await bubbles(p)).sort((a,b)=>a.id.localeCompare(b.id)),original=await open(p,'sprite-1');await p.keyboard.press('Escape');const clone=await open(p,'sprite-1-clone-3','keyboard');await p.screenshot({path:path.join(dir,'clone-dialog.png')});return{bubbles:b,original,clone};
 });
 await run('speech/duplicate-name-refusal',async p=>{
  await prepare(p);return p.evaluate(async()=>{const namesBefore=Akari.app.project.components.map(c=>c.name),q=structuredClone(Akari.app.project);q.components[1].name=q.components[0].name;let error=null;try{await Akari.serializeProject(q,Akari.app.assetStore);}catch(e){error={code:e.code,message:e.message};}return{namesBefore,namesAfter:Akari.app.project.components.map(c=>c.name),error};});
 });
 await run('speech/general-value-and-list',async p=>{
  await prepare(p);await setView(p,speechViews[0]);await start(p);await open(p,'dango');await p.keyboard.press('Escape');
  const toggle=p.locator('.monitor-window .blockui-side-toggle');if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
  await p.getByRole('button',{name:'文章の全文',exact:true}).click();const string=await dialog(p);await p.keyboard.press('Escape');
  await p.getByRole('button',{name:'買うものの全文',exact:true}).click();const list=await dialog(p);await p.locator('#valueItemNext').click();const next=await dialog(p);return{string,list,next};
 });
 await run('speech/pagination-and-copy',async p=>{
  const raw='🐈e\u0301赤'.repeat(2001);await prepare(p,{texts:[raw,speechTexts[1]]});await setView(p,speechViews[0]);await start(p);await open(p,'sprite-1');
  // Long pages require scrolling: DOM Range selection here checks the exact copy range, separately from pointer copy above.
  const read=()=>p.evaluate(()=>{const e=document.querySelector('#valueOutput'),r=new Range();r.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(r);return{title:document.querySelector('#valueTitle').textContent,body:e.textContent,selected:getSelection().toString(),page:document.querySelector('#valuePage').textContent};});
  const first=await read();await p.locator('#valuePageNext').click();const second=await read();return{raw,first,second};
 });
},360000);}catch(e){report.hostFailure=e.stack;}
report.status=!report.hostFailure&&report.results.length===speechIds.length&&report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';
if(report.status==='PASS'){try{verifySpeechReport(report);}catch(e){report.status='FAIL';report.hostFailure=e.stack;}}
save();if(report.status!=='PASS')process.exitCode=1;
