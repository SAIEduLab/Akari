const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const {chooseView}=require('../browser/cases/view-toggle.cjs');
const {pressStop}=require('../lib/stop-press.cjs');
const {currentProductFile}=require('../lib/product-path.cjs');
const {snapshot}=require('../lib/input-snapshot.cjs');
const [browserPath,output]=process.argv.slice(2);assert.ok(browserPath&&output&&!fs.existsSync(output),'fresh report required');
const out=path.resolve(output+'.artifacts'),product=path.resolve(currentProductFile());fs.mkdirSync(out,{recursive:true});
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report={schema:'akari-gate-cases-v1',step:'toolbar-stage',snapshot:snapshot(currentProductFile()),browser:null,platform:process.platform,productHash:hash(product),canonicalHash:hash(product),results:[],errors:[]};
const frame=async p=>{await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await p.waitForTimeout(130);};
const isShown=e=>!!e?.getClientRects().length&&getComputedStyle(e).visibility==='visible';
async function start(browser,viewport={width:1366,height:768},touch=false,file=product){const c=await browser.newContext({offline:true,hasTouch:touch,viewport}),p=await c.newPage();p.setDefaultTimeout(7000);p.on('pageerror',e=>report.errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(pathToFileURL(path.resolve(file)).href);await p.waitForFunction(()=>!!globalThis.Akari?.app);return{c,p};}
async function level(p,mode,value){if(value!=='entry')await p.locator('#uiLevel').selectOption('basic');await chooseView(p,mode);await p.locator('#uiLevel').selectOption(value);await frame(p);assert.equal(await p.locator('#uiLevel').inputValue(),value);}
async function toolbar(p){return p.evaluate(()=>{
 const shown=e=>!!e.getClientRects().length&&getComputedStyle(e).visibility==='visible',rect=e=>e.getBoundingClientRect().toJSON();
 const items=[...document.querySelector('.menutool').children].filter(e=>e.matches('button,details')&&shown(e)).map(e=>({id:e.id,text:e.textContent.trim(),rect:rect(e)}));
 const workspace=document.querySelector('#blockEditor .blockui-workspace');
 return{mode:document.body.dataset.editorMode,level:document.querySelector('#uiLevel').value,items,history:{undo:document.querySelector('#undoBtn').parentElement.className,redo:document.querySelector('#redoBtn').parentElement.className},toolbar:rect(document.querySelector('.menutool')),workspace:workspace&&rect(workspace),menuShown:shown(document.querySelector('#projectMenu')),hintCount:document.querySelectorAll('#basicActionGuide').length};
 });}
async function record(id,fn){try{const data=await fn();report.results.push({id,status:'PASS',...data});console.log('PASS '+id);}catch(e){report.results.push({id,status:'FAIL',detail:String(e.stack||e)});console.error('FAIL '+id+' '+e.message);}fs.writeFileSync(output,JSON.stringify(report,null,2));}

const projectState=p=>p.evaluate(()=>({project:structuredClone(Akari.app.project),source:Akari.app.editorState.main.sourceText,history:Akari.app.editorState.history,redo:Akari.app.editorState.redo,owner:document.querySelector('#objectSelect').value}));
const metrics=p=>p.locator('#designerWindow > .designer-wrap').evaluate(e=>({left:e.scrollLeft,top:e.scrollTop,width:e.clientWidth,height:e.clientHeight,scrollWidth:e.scrollWidth,scrollHeight:e.scrollHeight,bar:e.offsetHeight-e.clientHeight,rect:e.getBoundingClientRect().toJSON()}));
async function resetScroll(p){await p.locator('#designerWindow > .designer-wrap').evaluate(e=>e.scrollTo(0,0));await frame(p);}
async function stagePage(browser,mode,touch=false,blank=false){const{c,p}=await start(browser,{width:1024,height:768},touch);await p.locator('#uiLevel').selectOption('basic');if(blank){await p.locator('#objectSelect').selectOption('stage');await chooseView(p,'code');await p.locator('#codeEditor').fill('ずっとくり返す。\n  1秒待つ。');await p.locator('#codeEditor').press('Tab');}else{await p.locator('#sampleBtn').click();await p.locator('.sample-card').filter({hasText:'曲'}).click();}await chooseView(p,mode);await frame(p);assert.equal(await p.locator('body').getAttribute('data-editor-mode'),mode);return{c,p};}
async function stagePoint(p,blank=false){return p.evaluate(blank=>{const w=document.querySelector('#designerWindow > .designer-wrap'),r=w.getBoundingClientRect(),f=document.querySelector('#formSurface');const fr=f.getBoundingClientRect(),parts=[...f.querySelectorAll('.component')].map(e=>e.getBoundingClientRect()),gap=blank?30:8;for(let y=Math.max(r.y,fr.y)+gap;y<Math.min(r.y+w.clientHeight,fr.bottom)-gap;y+=5)for(let x=Math.min(r.x+w.clientWidth,fr.right)-gap;x>Math.max(r.x+130,fr.left+gap);x-=7){const hit=document.elementFromPoint(x,y),clear=!blank||parts.every(b=>x<b.left-30||x>b.right+30||y<b.top-30||y>b.bottom+30);if(clear&&hit&&(blank?hit===f:f.contains(hit)))return{x,y,hit:hit.id||hit.className};}throw Error('no visible stage input point');},blank);}
async function wheelInput(p,kind){await resetScroll(p);const before=await metrics(p),state=await projectState(p);assert.ok(before.scrollWidth>before.width+1&&before.scrollHeight>before.height+1,'both axes must actually overflow');if(kind==='bar'){if(before.scrollWidth>before.width+1){const r=before.rect,y=r.y+before.height+before.bar/2,x=r.x+before.width*before.width/before.scrollWidth/2;await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(Math.min(r.x+before.width-12,x+90),y,{steps:8});await p.mouse.up();}}
else{const point=await stagePoint(p);await p.mouse.move(point.x,point.y);if(kind==='shift')await p.keyboard.down('Shift');await p.mouse.wheel(kind==='horizontal'?120:0,kind==='horizontal'?0:120);if(kind==='shift')await p.keyboard.up('Shift');}await frame(p);const after=await metrics(p);if(kind==='vertical')assert.ok(after.top>before.top);else assert.ok(after.left>before.left,kind+' must scroll horizontally');assert.deepEqual(await projectState(p),state);return{kind,before,after,projectPreserved:true};}

(async()=>{let browser;try{
 browser=await chromium.launch({executablePath:browserPath,headless:true,ignoreDefaultArgs:['--hide-scrollbars'],args:['--disable-background-networking']});report.browser=browser.version();report.playwright=require('playwright/package.json').version;
 const scenarios=[['blocks','entry'],['blocks','basic'],['blocks','advanced'],['code','basic'],['code','advanced'],['code','meijin']];
 for(const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:1280,height:720},{width:1024,height:768},{width:768,height:1024},{width:760,height:600},{width:390,height:600},{width:320,height:500}])for(const [mode,value]of scenarios){
  await record('toolbar/'+viewport.width+'/'+mode+'/'+value,async()=>{const{c,p}=await start(browser,viewport);try{
   await level(p,mode,value);const observed=await toolbar(p),expected=['projectMenu','saveBtn','runBtn',...(value==='entry'?['tutorialStart']:value==='meijin'?[]:['sampleBtn'])];
   assert.deepEqual(observed.items.slice(0,expected.length).map(i=>i.id),expected);assert.equal(observed.hintCount,0);for(let i=1;i<observed.items.length;i++){const a=observed.items[i-1].rect,b=observed.items[i].rect;const sameRow=a.top<b.bottom&&b.top<a.bottom;assert.ok(sameRow?a.right<=b.left+1:a.bottom<=b.top+1,'visual order follows DOM order');}for(const item of observed.items){assert.ok(item.rect.left>=0&&item.rect.right<=viewport.width+1,'toolbar item stays in viewport');}for(let i=0;i<observed.items.length;i++)for(let j=i+1;j<observed.items.length;j++){const a=observed.items[i].rect,b=observed.items[j].rect;assert.ok(a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1,'toolbar controls do not overlap');}if(value==='entry')assert.doesNotMatch(await p.locator('body').innerText(),/お手本を開く/);
   if(mode==='blocks')assert.deepEqual(observed.history,{undo:'menutool',redo:'menutool'});
   assert.equal(await p.locator('#sampleBtn').isVisible(),value!=='entry'&&value!=='meijin');
   await p.locator('#projectMenu > summary').click();const menu=await p.locator('#projectMenu .project-actions button').allInnerTexts();assert.deepEqual(menu,['新しく作る','開く','うごく作品を ファイルにする']);
   await p.keyboard.press('Escape');assert.equal(await p.locator('#projectMenu').getAttribute('open'),null);
   await p.screenshot({path:path.join(out,'toolbar-'+viewport.width+'-'+mode+'-'+value+'.png')});return {viewport,observed,menu};
  }finally{await c.close();}});
 }
 await record('menu-and-history-actions',async()=>{const{c,p}=await start(browser);try{
  await level(p,'blocks','basic');await p.locator('#sampleBtn').click();await p.locator('.sample-card').filter({hasText:'曲'}).click();await frame(p);
  await chooseView(p,'code');const initial=await p.locator('#codeEditor').inputValue();await p.locator('#codeEditor').fill('「試作確認」と言う。');await p.locator('#codeEditor').press('Tab');await frame(p);await chooseView(p,'blocks');await frame(p);
  const edited=await p.evaluate(()=>Akari.app.editorState.main.sourceText);await p.locator('#undoBtn').click();await frame(p);const undone=await p.evaluate(()=>Akari.app.editorState.main.sourceText);await p.locator('#redoBtn').click();await frame(p);const redone=await p.evaluate(()=>Akari.app.editorState.main.sourceText);assert.equal(undone,initial);assert.equal(redone,edited);
  const downloadEvent=p.waitForEvent('download');await p.locator('#saveBtn').click();const download=await downloadEvent;assert.match(download.suggestedFilename(),/\.akari\.md$/);
  await p.locator('#projectMenu > summary').click();const chooserEvent=p.waitForEvent('filechooser');await p.locator('#openBtn').click();await chooserEvent;assert.equal(await p.locator('#projectMenu').getAttribute('open'),null);
  await p.locator('#projectMenu > summary').click();await p.locator('#exportBtn').click();assert.equal(await p.locator('#exportChoiceModal').isVisible(),true);await p.locator('#exportChoiceCancel').click();
  const runAt=await p.locator('#runBtn').boundingBox();await p.locator('#runBtn').click();await p.waitForFunction(()=>document.body.classList.contains('runtime'));const stopAt=await p.locator('#stopBtn').boundingBox();assert.ok(Math.abs(runAt.x-stopAt.x)<2&&Math.abs(runAt.y-stopAt.y)<2);assert.equal(await p.locator('#projectMenu').evaluate(e=>e.checkVisibility({visibilityProperty:true})),false);await pressStop(p.locator('#stopBtn'));await p.waitForFunction(()=>Akari.app.editorState.state==='DESIGN');await frame(p);assert.equal(await p.locator('#projectMenu').evaluate(e=>e.checkVisibility({visibilityProperty:true})),true);
  return {undo:true,redo:true,saveFile:download.suggestedFilename(),openChooser:true,exportDialog:true,runAt,stopAt};
 }finally{await c.close();}});
 await record('entry-tutorial',async()=>{const{c,p}=await start(browser);try{await p.locator('#tutorialStart').click();await frame(p);assert.ok(await p.locator('#tutorialGuide').isVisible());const step=await p.locator('body').getAttribute('data-tutorial-step');await p.locator('#tutorialExit').click();await frame(p);assert.equal(await p.locator('#tutorialGuide').isVisible(),false);return{step,started:true,exited:true};}finally{await c.close();}});

 const b=browser;
 for(const [mode,level]of [['blocks','entry'],['blocks','basic'],['blocks','advanced'],['code','basic'],['code','advanced'],['code','meijin']])await record('new-save-open/'+mode+'/'+level,async()=>{const{c,p}=await start(b);try{
  if(level!=='entry')await p.locator('#uiLevel').selectOption('basic');await chooseView(p,mode);await p.locator('#uiLevel').selectOption(level);await frame(p);
  const name='試作-'+mode+'-'+level;await p.locator('#projectName').fill(name);await p.locator('#projectName').press('Tab');await frame(p);
  const before=await p.evaluate(()=>JSON.stringify(Akari.app.project));const saved=p.waitForEvent('download');await p.locator('#saveBtn').click();const d=await saved,file=path.join(out,'roundtrip-'+mode+'-'+level+'.akari.md');await d.saveAs(file);
  await p.locator('#projectMenu > summary').click();await p.locator('#newBtn').click();await p.waitForFunction(n=>Akari.app.project.name!==n,name);
  await p.locator('#projectMenu > summary').click();const chooser=p.waitForEvent('filechooser');await p.locator('#openBtn').click();await(await chooser).setFiles(file);await p.waitForFunction(n=>Akari.app.project.name===n,name);await frame(p);
  const after=await p.evaluate(()=>JSON.stringify(Akari.app.project));assert.deepEqual(JSON.parse(after),JSON.parse(before));return{name,roundtrip:true,before:JSON.parse(before),after:JSON.parse(after),restoredLevel:await p.locator('#uiLevel').inputValue()};
 }finally{await c.close();}});
 await record('export-and-playback',async()=>{const{c,p}=await start(b);try{
  await p.locator('#uiLevel').selectOption('advanced');await chooseView(p,'code');await p.locator('#objectSelect').selectOption('stage');await p.locator('#codeEditor').fill('ずっとくり返す。\n  1秒待つ。');await p.locator('#codeEditor').press('Tab');await frame(p);
  await p.locator('#projectMenu > summary').click();await p.locator('#exportBtn').click();const download=p.waitForEvent('download');await p.locator('#exportControls').click();const d=await download,file=path.join(out,'exported-player.html');await d.saveAs(file);await frame(p);
  assert.equal(await p.evaluate(()=>document.activeElement.matches('#projectMenu > summary')),true,'export completion returns to menu');
  const player=await c.newPage();player.on('pageerror',e=>report.errors.push(e.message));await player.goto(pathToFileURL(file).href);await player.locator('#playerStart').waitFor();await player.waitForFunction(()=>!document.querySelector('#playerStart').disabled);
  const before=await player.locator('#formSurface').evaluate(e=>({overscrollX:getComputedStyle(e).overscrollBehaviorX,touchAction:getComputedStyle(e).touchAction}));assert.equal(before.overscrollX,'auto');await player.locator('#playerStart').click();await player.waitForTimeout(650);
  const running=await player.locator('#formSurface').evaluate(e=>({overscrollX:getComputedStyle(e).overscrollBehaviorX,touchAction:getComputedStyle(e).touchAction}));assert.equal(running.overscrollX,'none');assert.equal(running.touchAction,'none');await player.locator('#playerStop').click();await frame(player);
  const stopped=await player.locator('#formSurface').evaluate(e=>({overscrollX:getComputedStyle(e).overscrollBehaviorX,touchAction:getComputedStyle(e).touchAction}));return{file:'exported-player.html',before,running,stopped};
 }finally{await c.close();}});
 await record('entry-guidance-transitions',async()=>{const{c,p}=await start(browser);try{
   await p.evaluate(()=>localStorage.setItem('akari.uiLevel.v1','basic'));await p.reload();await p.waitForFunction(()=>!!globalThis.Akari?.app);
   const seen=[];for(const value of ['entry','basic','entry']){await p.locator('#uiLevel').selectOption(value);await frame(p);const o=await p.evaluate(()=>({level:document.querySelector('#uiLevel').value,status:document.querySelector('#statusText').textContent,sample:document.querySelector('#sampleBtn').checkVisibility({visibilityProperty:true})}));if(value==='entry'){assert.equal(o.sample,false);assert.ok(!o.status.includes('お手本を開く'));}else{assert.equal(o.sample,true);assert.ok(!o.status.includes('いっしょに作る'));}seen.push(o);}
   return{seen};
  }finally{await c.close();}});
 for(const mode of ['blocks','code']){
  await record('modal-history/'+mode,async()=>{const{c,p}=await start(browser);try{
   await level(p,mode,'advanced');await p.locator('#procBtn').click();await frame(p);
   const read=()=>p.evaluate(()=>({ids:[...document.querySelector('#undoBtn').parentElement.querySelectorAll('#undoBtn,#redoBtn')].map(e=>e.id),parent:document.querySelector('#undoBtn').parentElement.className}));
   const open=await read();assert.equal(open.parent,'win-title');assert.deepEqual(open.ids,['undoBtn','redoBtn']);await p.locator('#procClose').click();await frame(p);const closed=await read();assert.equal(closed.parent,mode==='blocks'?'menutool':'debugbar');
   await p.locator('#projectMenu > summary').click();await p.locator('#exportBtn').click();await p.locator('#exportChoiceCancel').click();await frame(p);const exportFocus=await p.evaluate(()=>document.activeElement.matches('#projectMenu > summary'));assert.equal(exportFocus,true);
   await p.locator('#projectMenu > summary').click();const chooser=p.waitForEvent('filechooser');await p.locator('#openBtn').click();await chooser;await p.locator('#fileInput').dispatchEvent('cancel');await frame(p);const fileFocus=await p.evaluate(()=>document.activeElement.matches('#projectMenu > summary'));assert.equal(fileFocus,true);
   return{open,closed,exportFocus,fileFocus};
  }finally{await c.close();}});
  for(const zoom of [100,150,200])await record('scroll/'+mode+'/'+zoom,async()=>{const{c,p}=await stagePage(browser,mode);try{
   await p.locator('#stageZoomReset').click();for(let z=100;z<zoom;z+=10)await p.locator('#stageZoomIn').click();await frame(p);
   const inputs=[];for(const kind of ['horizontal','vertical','shift','bar'])inputs.push(await wheelInput(p,kind));await p.screenshot({path:path.join(out,'scroll-'+mode+'-'+zoom+'.png')});return{mode,zoom,inputs};
  }finally{await c.close();}});
  await record('touch-scroll/'+mode,async()=>{const{c,p}=await stagePage(browser,mode,true,true);try{await p.locator('#stageZoomReset').click();for(let i=0;i<5;i++)await p.locator('#stageZoomIn').click();await frame(p);
   await p.locator('#objectSelect').selectOption('stage');await frame(p);await resetScroll(p);const before=await projectState(p),session=await c.newCDPSession(p),point=await stagePoint(p,true);const start=await metrics(p);
   await p.evaluate(()=>{globalThis.stageTouchEvents=[];for(const type of ['touchstart','touchmove','touchend'])document.addEventListener(type,e=>stageTouchEvents.push({type,trusted:e.isTrusted,target:e.target.id,component:e.target.closest?.('.component')?.dataset.id||null}),{capture:true,passive:true});});
   await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y,id:1}]});for(let i=1;i<=8;i++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x-100*i/8,y:point.y,id:1}]});await frame(p);}await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await frame(p);const after=await metrics(p),events=await p.evaluate(()=>stageTouchEvents);assert.ok(after.left>start.left);assert.deepEqual(await projectState(p),before);await session.detach();return{before:start,after,events,point,ownerBefore:before.owner,ownerAfter:(await projectState(p)).owner,projectPreserved:true};
  }finally{await c.close();}});
  await record('run-scroll/'+mode,async()=>{const{c,p}=await stagePage(browser,mode);try{
   const before=await projectState(p);await p.locator('#runBtn').click();await p.waitForFunction(()=>document.body.classList.contains('runtime'));const running=await p.locator('#formSurface').evaluate(e=>({overscrollX:getComputedStyle(e).overscrollBehaviorX,touch:getComputedStyle(e).touchAction}));assert.deepEqual(running,{overscrollX:'none',touch:'none'});await pressStop(p.locator('#stopBtn'));await p.waitForFunction(()=>Akari.app.editorState.state==='DESIGN');const stopped=await p.locator('#formSurface').evaluate(e=>({overscrollX:getComputedStyle(e).overscrollBehaviorX,touch:getComputedStyle(e).touchAction}));assert.equal(stopped.overscrollX,'auto');assert.deepEqual(await projectState(p),before);return{running,stopped,projectPreserved:true};
  }finally{await c.close();}});
 }

 report.artifacts=fs.readdirSync(out).filter(f=>f.endsWith('.png')).sort().map(file=>({file,sha256:hash(path.join(out,file))}));
 report.canonicalUnchanged=hash(product)===report.canonicalHash;report.status=report.results.every(r=>r.status==='PASS')&&!report.errors.length?'PASS':'FAIL';
 }catch(e){report.failure=String(e.stack||e);report.status='FAIL';console.error(report.failure);}finally{if(browser)await browser.close();fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,total:report.results.length,failed:report.results.filter(r=>r.status==='FAIL').map(r=>({id:r.id,detail:r.detail})),errors:report.errors}));if(report.status!=='PASS')process.exitCode=1;}})();
