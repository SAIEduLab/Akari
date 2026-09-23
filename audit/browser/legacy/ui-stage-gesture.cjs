// Targeted UI regression check, not a substitute for the complete product audit.
// Usage: node ui-stage-gesture.cjs <snapshot.html> <output-prefix>
const L=require('./audit-lib.cjs');
const assert=require('assert/strict');
const {pathToFileURL}=require('url');
const {chromium}=require('playwright');
const {disableFocusEmulation}=require('./native-focus.cjs');
const file=L.path.resolve(process.argv[2]||'Akari.html');
const prefix=L.path.resolve(process.argv[3]||L.path.join(__dirname,'ui-stage-gesture'));
const sha=L.sha(L.fs.readFileSync(file));
const results=[],pageErrors=[],networkRequests=[];
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1,message+': '+a+' vs '+b);
function sameRect(a,b){for(const k of ['left','top','width','height'])close(a[k],b[k],'stage rectangle '+k);}
async function state(page){return page.evaluate(()=>{
 const app=Akari.app,session=app.editorState.main,c=app.project.components.find(x=>x.id==='sprite-1'),r=document.querySelector('#formSurface').getBoundingClientRect();
 return {owner:session.ownerKey,mode:session.mode,shell:document.body.dataset.editorMode,source:session.sourceText,textarea:document.querySelector('#codeEditor').value,
  sources:JSON.stringify({scripts:app.project.scripts,actions:app.project.actions,functions:app.project.functions}),x:c.x,y:c.y,stageWidth:app.project.stage.width,stageHeight:app.project.stage.height,
  preview:{x:parseFloat(document.querySelector('.component[data-id="sprite-1"]').style.left),y:parseFloat(document.querySelector('.component[data-id="sprite-1"]').style.top)},rect:{left:r.left,top:r.top,width:r.width,height:r.height},history:app.editorState.history,redo:app.editorState.redo,state:app.editorState.state,events:window.__gestureEvents.slice()};
 });}
async function setup(browser,id){
 const context=await browser.newContext({viewport:{width:1440,height:900},hasTouch:true});
 await context.route(/^https?:\/\//,route=>{networkRequests.push({id,url:route.request().url()});return route.abort();});
 const page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',error=>pageErrors.push({id,error:error.stack}));
 await page.goto(pathToFileURL(file).href);
 await (await reveal09(page.locator('#objectSelect'))).selectOption('sprite-1');await (await reveal09(page.locator('#codeEditor'))).fill('「SPRITE」と言う。');
 await (await reveal09(page.locator('#objectSelect'))).selectOption('stage');await (await reveal09(page.locator('#codeEditor'))).fill('「STAGE」と言う。\n20秒待つ。');
 await (await reveal09(page.locator('#editorModeblocks'))).click();
 // fitStage uses ResizeObserver. Wait for the visible stage scale to settle.
 await page.waitForFunction(()=>{const r=document.querySelector('#formSurface').getBoundingClientRect();return r.width>0&&r.width<400;});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.evaluate(()=>{window.__gestureEvents=[];for(const type of ['pointerdown','pointerup','pointercancel','blur','focus'])window.addEventListener(type,e=>window.__gestureEvents.push({type,trusted:e.isTrusted,pointerId:e.pointerId??null,buttons:e.buttons??null,target:e.target===window?'window':e.target.id||e.target.className}),true);});
 const box=await page.locator('.component[data-id="sprite-1"]').boundingBox(),point={x:box.x+box.width/2,y:box.y+box.height/2},before=await state(page);
 return {context,page,point,before,cdp:await context.newCDPSession(page)};
}
async function downMouse(t){await t.page.mouse.move(t.point.x,t.point.y);await t.page.mouse.down();await t.page.waitForTimeout(50);const down=await state(t.page);assert.equal(down.owner,'script:sprite-1:start');assert.equal(down.mode,'blocks');assert.equal(down.shell,'blocks');assert.equal(down.source,'「SPRITE」と言う。');assert.equal(down.source,'「SPRITE」と言う。');sameRect(down.rect,t.before.rect);return down;}
async function assertSources(t){const after=await state(t.page);assert.equal(after.sources,t.before.sources,'all confirmed sources must remain unchanged');return after;}
async function runCase(browser,id,fn){let t;const evidence={};try{t=await setup(browser,id);evidence.before=t.before;await fn(t,evidence);evidence.after=await assertSources(t);evidence.sourceUnchanged=true;results.push({id,pass:true,evidence});console.log('PASS '+id);}catch(error){if(t)evidence.after=await state(t.page).catch(()=>null);evidence.sourceUnchanged=!!t&&evidence.after?.sources===t.before.sources;results.push({id,pass:false,error:error.stack,evidence});console.log('FAIL '+id+': '+error.message);}finally{await t?.context.close();}}
(async()=>{
 const browser=await chromium.launch({executablePath:(process.env.AKARI_BROWSER||undefined),headless:false}),browserVersion=browser.version();
 try{
 await runCase(browser,'stage-gesture:drag-owner-layout-and-coordinates',async(t,e)=>{
  e.down=await downMouse(t);await t.page.mouse.move(t.point.x+10,t.point.y+10);e.moved=await state(t.page);sameRect(e.moved.rect,e.down.rect);
  assert.equal(e.moved.x,t.before.x);assert.equal(e.moved.y,t.before.y);assert.equal(e.moved.history,e.down.history);assert.equal(e.moved.preview.x,Math.round(t.before.x+10*t.before.stageWidth/t.before.rect.width));assert.equal(e.moved.preview.y,Math.round(t.before.y+10*t.before.stageHeight/t.before.rect.height));
  await t.page.mouse.up();await t.page.waitForFunction(()=>document.body.dataset.editorMode==='blocks');await t.page.waitForFunction(expected=>Akari.app.editorState.history===expected,e.moved.history+1);e.released=await state(t.page);assert.equal(e.released.x,e.moved.preview.x);assert.equal(e.released.y,e.moved.preview.y);
  assert.equal(e.released.history,e.moved.history+1,'one drag creates one undo entry');
  await t.page.keyboard.press('Control+z');e.undo=await assertSources(t);assert.equal(e.undo.x,t.before.x);assert.equal(e.undo.y,t.before.y);
  await t.page.keyboard.press('Control+y');e.redo=await assertSources(t);assert.equal(e.redo.x,e.released.x);assert.equal(e.redo.y,e.released.y);
 });
 await runCase(browser,'stage-gesture:held-redo-does-not-cross-source-owners',async(t,e)=>{
  e.down=await downMouse(t);assert.equal(e.down.redo,0);await t.page.keyboard.press('Control+y');e.shortcut=await assertSources(t);
  assert.equal(e.shortcut.source,'「SPRITE」と言う。');assert.equal(e.shortcut.history,e.down.history);assert.equal(e.shortcut.redo,e.down.redo);
  await t.page.mouse.up();await t.page.waitForFunction(()=>document.body.dataset.editorMode==='blocks');
 });
 await runCase(browser,'stage-gesture:trusted-pointercancel-cleans-up',async(t,e)=>{
  await t.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:t.point.x,y:t.point.y,id:1}]});e.down=await state(t.page);
  assert.equal(e.down.owner,'script:sprite-1:start');assert.equal(e.down.shell,'blocks');assert.equal(e.down.source,'「SPRITE」と言う。');
  await t.cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await t.page.waitForFunction(()=>document.body.dataset.editorMode==='blocks');e.cancelled=await state(t.page);
  assert.ok(e.cancelled.events.some(x=>x.type==='pointercancel'&&x.trusted),'Chromium-generated trusted pointercancel');assert.equal(e.cancelled.x,t.before.x);assert.equal(e.cancelled.y,t.before.y);assert.equal(e.cancelled.history,e.down.history);
 });
 await runCase(browser,'stage-gesture:window-blur-cleans-up',async(t,e)=>{
  const other=await t.context.newPage();await other.goto('about:blank');
  e.environment={phase:'focus-preflight',headless:false,adapters:[]};
  e.environment.adapters.push(await disableFocusEmulation(t.page));
  e.environment.adapters.push(await disableFocusEmulation(other));
  // Prove the environment can produce real focus transitions before a gesture.
  // Numeric polling also works for background tabs where rAF may stop.
  await t.page.bringToFront();await t.page.waitForFunction(()=>document.hasFocus(),null,{polling:50});
  await t.page.evaluate(()=>window.__gestureEvents=[]);
  await other.bringToFront();
  await t.page.waitForFunction(()=>!document.hasFocus()&&window.__gestureEvents.some(e=>e.type==='blur'&&e.target==='window'&&e.trusted),null,{polling:50});
  e.environment.lostFocus=await t.page.evaluate(()=>({focused:document.hasFocus(),events:window.__gestureEvents.slice()}));
  await t.page.bringToFront();await t.page.waitForFunction(()=>document.hasFocus(),null,{polling:50});
  e.environment.regainedFocus=await t.page.evaluate(()=>document.hasFocus());
  e.environment.phase='gesture';
  await t.page.evaluate(()=>window.__gestureEvents=[]);
  e.focusBeforeDrag={focused:await t.page.evaluate(()=>document.hasFocus()),headless:false};
  e.down=await downMouse(t);await other.bringToFront();
  await t.page.waitForFunction(()=>window.__gestureEvents.some(e=>e.type==='blur'&&e.target==='window'&&e.trusted),null,{polling:50});e.blurred=await state(t.page);
  e.blurredFocus=await t.page.evaluate(()=>document.hasFocus());
  assert.equal(e.blurredFocus,false,'browser tab really lost focus');
  assert.equal(e.blurred.shell,'blocks','window blur releases the deferred layout');await t.page.bringToFront();
  await t.cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:t.point.x+10,y:t.point.y+10,buttons:0});e.reentered=await state(t.page);
  assert.equal(e.reentered.x,t.before.x,'no design movement after blur without pressed buttons');assert.equal(e.reentered.y,t.before.y);assert.equal(e.reentered.history,e.down.history);
  await t.page.mouse.up();await other.close();
 });
 await runCase(browser,'stage-gesture:execution-lock-cleans-up',async(t,e)=>{
  e.down=await downMouse(t);await t.page.locator('#runBtn').press('Enter');await t.page.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');e.running=await assertSources(t);
  assert.equal(e.running.shell,'blocks','execution lock releases the deferred layout');
  await t.cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:t.point.x+10,y:t.point.y+10,buttons:0});e.moveWhileRunning=await assertSources(t);assert.equal(e.moveWhileRunning.x,t.before.x);assert.equal(e.moveWhileRunning.y,t.before.y);
  await t.page.locator('#stopBtn').press('Enter');await t.page.waitForFunction(()=>Akari.app.editorState.state==='DESIGN');await t.page.mouse.up();
 });
 }finally{await browser.close();}
 const finalSha=L.sha(L.fs.readFileSync(file)),report={file,sha,sha256:sha,finalSha,sourceFileUnchanged:sha===finalSha,sourceUnchanged:sha===finalSha&&results.every(r=>r.evidence?.sourceUnchanged===true),browser:browserVersion,scope:'Targeted real-browser stage gesture and source-owner regression checks; not a full release audit.',results,pageErrors,networkRequests};
 L.fs.mkdirSync(L.path.dirname(prefix),{recursive:true});L.result(prefix+'.json',report);
 console.log(JSON.stringify({file,sha,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,pageErrors:pageErrors.length,networkRequests:networkRequests.length,sourceFileUnchanged:report.sourceFileUnchanged,sourceUnchanged:report.sourceUnchanged,report:prefix+'.json'}));
 if(results.some(r=>!r.pass)||pageErrors.length||networkRequests.length||sha!==finalSha)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});


async function reveal09(locator){
 if(await locator.count()===1){if(!await locator.isVisible())for(const panel of await locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())await panel.locator('.blockui-side-toggle').click();const ancestors=locator.locator(await locator.evaluate(e=>e.tagName==='SUMMARY')?'xpath=parent::details/ancestor::details[not(@open)]':'xpath=ancestor::details[not(@open)]');for(const detail of await ancestors.all())await detail.locator(':scope > summary').click();}
 return locator;
}
