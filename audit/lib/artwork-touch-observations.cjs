const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {makeRegressionProject}=require('../fixtures/regression-project.cjs');
async function observeArtworkTouch(browser,api,out,{error=()=>{},network=()=>{}}={}){
 const project=makeRegressionProject(api),base=project.components.find(c=>c.type==='button');project.stage={...project.stage,width:1200,height:800};
 project.components=[
  {...structuredClone(base),id:'touch-cover',name:'全面',type:'box',x:600,y:400,w:1200,h:800,text:''},
  {...structuredClone(base),id:'touch-marker',name:'目印',type:'box',x:30,y:30,w:10,h:10,text:''},
  {...structuredClone(base),id:'touch-target',name:'目的',x:1050,y:450,w:100,h:80,text:'目的'},
  {...structuredClone(base),id:'touch-input',name:'入力',type:'input',x:1050,y:250,w:120,h:60,text:''},
 ];project.actions=[];project.functions=[];project.projectData={variables:[{id:'touch-count',name:'回数',initialValue:0}],lists:[]};
 project.scripts=[{id:'touch-press',targetId:'stage',event:'start',source:'ずっとくり返す。\n  もしマウスがおされていれば、\n    「押下」と言う。\n    条件（マウスがおされていない）が成り立つまで待つ。\n    「解放」と言う。'},
  {id:'touch-follow',targetId:'touch-marker',event:'start',source:'ずっとくり返す。\n  もしマウスがおされていれば、\n    マウスのところへ行く。'},
  {id:'touch-click',targetId:'touch-target',event:'click',source:'【回数】を1ふやす。\n【回数】を言う。'}];
 const errors=api.compileProject(project).errors;assert.equal(errors.length,0,JSON.stringify(errors));
 const file=path.join(out,'artwork-touch-cover.html');fs.writeFileSync(file,api.generateStandaloneHtml(project,api.makeDefaultAssetStore(),{presentation:'artwork'}));
 const context=await browser.newContext({offline:true,viewport:{width:390,height:700},isMobile:true,hasTouch:true});let p;
 try{
  await context.route(/^https?:/,r=>{network(r.request().url());return r.abort();});p=await context.newPage();p.setDefaultTimeout(8000);p.on('pageerror',e=>error(e.message));await p.goto(pathToFileURL(file).href);
  await p.waitForFunction(()=>document.querySelector('#playerRoot')?.dataset.state==='RUNNING');
  await p.evaluate(()=>{window.touchEvents=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','click'])document.addEventListener(type,e=>touchEvents.push({type,trusted:e.isTrusted,target:e.target.dataset.runtimeId||e.target.id,x:e.clientX,y:e.clientY}),true);});
  const cdp=await context.newCDPSession(p),state=()=>p.evaluate(()=>({scale:visualViewport.scale,left:visualViewport.pageLeft,top:visualViewport.pageTop,width:visualViewport.width,height:visualViewport.height,stage:[document.querySelector('#formSurface').offsetWidth,document.querySelector('#formSurface').offsetHeight]})),
   logs=()=>p.locator('#playerOutput').textContent(),end=()=>cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const before=await state();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:195,y:350,id:1}]});await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('押下'));
  for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:195-i*10,y:350-i*5,id:1}]});await p.waitForTimeout(17);}
  await p.waitForFunction(()=>{const n=document.querySelector('[data-runtime-id="touch-marker"]');return Math.abs(parseFloat(n.style.left)+5-135)<1&&Math.abs(parseFloat(n.style.top)+5-320)<1;});
  const during=await state(),marker=await p.locator('[data-runtime-id="touch-marker"]').evaluate(n=>[parseFloat(n.style.left)+5,parseFloat(n.style.top)+5]);
  await end();await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.trim().endsWith('解放'));
  const single={before,after:during,marker,events:await p.evaluate(()=>touchEvents),output:await logs()};assert.deepEqual(during,before);assert.equal(single.events.filter(e=>e.type==='pointercancel').length,0);
  const gesture=async(from,to,observePress=false)=>{const prior=observePress?await logs():null;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:from.map(([x,y],i)=>({x,y,id:i+1}))});if(observePress)await p.waitForFunction(prior=>{const text=document.querySelector('#playerOutput').textContent;return text!==prior&&text.trim().endsWith('押下');},prior);for(let i=1;i<=15;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:from.map(([x,y],j)=>({x:x+(to[j][0]-x)*i/15,y:y+(to[j][1]-y)*i/15,id:j+1}))});await p.waitForTimeout(17);}await p.waitForTimeout(100);};
  const pinchBefore=await state();await gesture([[150,350],[240,350]],[[60,350],[330,350]],true);const pinchAfter=await state();assert.ok(pinchAfter.scale>pinchBefore.scale);
  await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.trim().endsWith('解放'));const cancelOutput=await logs();await end();
  const panBefore=await state();await gesture([[200,300],[300,400]],[[40,300],[140,400]]);await end();await p.waitForTimeout(200);const panAfter=await state();assert.ok(panAfter.left>panBefore.left);
  const shrinkBefore=await state();await gesture([[20,350],[370,350]],[[185,350],[205,350]]);await end();await p.waitForTimeout(200);const shrinkAfter=await state();assert.ok(shrinkAfter.scale<shrinkBefore.scale);
  const target=p.locator('[data-runtime-id="touch-target"]'),visible=await target.evaluate(n=>{const r=n.getBoundingClientRect(),v=visualViewport;return r.left>=v.offsetLeft&&r.right<=v.offsetLeft+v.width&&r.top>=v.offsetTop&&r.bottom<=v.offsetTop+v.height;});assert.equal(visible,true);
  // Touch coordinates are CSS pixels relative to the visual viewport; native pinch adds its offset to clientX/Y.
  const tapVisible=async locator=>{const at=await locator.evaluate(n=>{const r=n.getBoundingClientRect(),v=visualViewport;return{x:r.left+r.width/2-v.offsetLeft,y:r.top+r.height/2-v.offsetTop};});await p.touchscreen.tap(at.x,at.y);};
  await tapVisible(target);const bubble=p.locator('.sprite-bubble[data-runtime-id="touch-target"] .sprite-bubble-text');await bubble.waitFor();assert.equal(await bubble.textContent(),'1');
  const taps=await p.evaluate(()=>touchEvents.filter(e=>e.type==='click'&&e.target==='touch-target').length);assert.equal(taps,1);
  const input=p.locator('[data-runtime-id="touch-input"]');await tapVisible(input);assert.equal(await input.evaluate(n=>document.activeElement===n),true);await p.keyboard.insertText('入力確認');assert.equal(await input.inputValue(),'入力確認');
  const events=await p.evaluate(()=>touchEvents),final=await state();assert.deepEqual(final.stage,[1200,800]);assert.ok(events.every(e=>e.trusted));assert.ok(events.some(e=>e.type==='pointercancel'));
  return {single,pinch:{before:pinchBefore,after:pinchAfter,cancelOutput},pan:{before:panBefore,after:panAfter},shrink:{before:shrinkBefore,after:shrinkAfter},target:{visible,taps},input:{focused:true,value:await input.inputValue()},events,final};
 }catch(e){if(p){e.evidence=await p.evaluate(()=>({phase:document.querySelector('#playerRoot')?.dataset.state,logs:document.querySelector('#playerOutput')?.textContent,events:window.touchEvents,viewport:{scale:visualViewport.scale,left:visualViewport.pageLeft,offsetLeft:visualViewport.offsetLeft,top:visualViewport.pageTop,offsetTop:visualViewport.offsetTop,width:visualViewport.width,height:visualViewport.height},target:[...document.querySelectorAll('[data-runtime-id="touch-target"]')].map(n=>({html:n.outerHTML,rect:n.getBoundingClientRect().toJSON()}))}));fs.writeFileSync(path.join(out,'artwork-touch-failure.json'),JSON.stringify({error:e.stack,observed:e.evidence},null,2));await p.screenshot({path:path.join(out,'artwork-touch-failure.png')});}throw e;}finally{await context.close();}
}
module.exports={observeArtworkTouch};
