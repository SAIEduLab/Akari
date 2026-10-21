import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {currentProductFile} from '../lib/product-path.cjs';
import {answerProductConfirms} from '../lib/product-dialogs.cjs';
import {snapshot,sha,withBrowser,pageFor} from '../lib/product-test-host.mjs';
import {browserEnvironment} from '../lib/browser-environment.mjs';
import {writeZoomExtension,zoomExtensionArgs,zoomExtensionWorker,setNativeZoom} from '../lib/native-zoom.mjs';
import {componentControlSizes,componentControlTargets,verifyComponentControlReach,verifyComponentControls} from '../lib/component-controls-contract.mjs';

const require=createRequire(import.meta.url),[chrome,output]=process.argv.slice(2);
assert.ok(chrome&&output,'Usage: component-controls-browser.mjs <fixed browser> <fresh report>');
assert.equal(require('playwright/package.json').version,browserEnvironment.playwright);
const product=currentProductFile(),inputs=snapshot(product),directory=output+'.artifacts';
assert.ok(!fs.existsSync(output)&&!fs.existsSync(directory),'fresh report and artifacts required');
fs.mkdirSync(directory,{recursive:true});
const report={schema:'akari-component-controls-v1',status:'RUNNING',snapshot:inputs,platform:process.platform,
  browser:null,playwright:browserEnvironment.playwright,pageErrors:[],networkRequests:[],results:[],artifacts:[]};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const frame=p=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const state=p=>p.evaluate(()=>{const s=Akari.app.editorState;return{project:JSON.stringify(Akari.app.project),source:s.main.sourceText,history:s.history,redo:s.redo,dirty:s.dirty};});
async function shot(p,name) {
  const file=path.join(directory,name+'.png'),session=await p.context().newCDPSession(p);
  // Capture the native viewport: Playwright's CSS clip can miss a scrolled page at browser zoom.
  let bytes;
  try{bytes=Buffer.from((await session.send('Page.captureScreenshot',{format:'png'})).data,'base64');}
  finally{await session.detach();}
  fs.writeFileSync(file,bytes);
  report.artifacts.push({path:path.relative(path.dirname(output),file).split(path.sep).join('/'),sha256:sha(bytes),
    pixels:{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)},
    viewport:await p.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio}))});
}
async function fixture(p) {
  p.setDefaultTimeout(8000); p.on('dialog',d=>d.accept()); await answerProductConfirms(p,true);
  p.on('pageerror',e=>report.pageErrors.push(e.message));
  const text=await p.evaluate(()=>{
    const project=Akari.makeEmptyProject(),first=project.components.find(c=>c.id==='sprite-1');
    for(let i=1;i<25;i++){
      const component={...structuredClone(first),id:'controls-'+i,name:'長い名前の部品'+i};
      component.costumes.forEach((costume,index)=>{costume.id='controls-'+i+'-costume-'+index;});
      component.costumeId=component.costumes[0].id;
      project.components.push(component);
    }
    project.name='部品操作欄の監査';
    project.scripts=[{id:'controls-main',targetId:'sprite-1',event:'start',source:'「元の動き」と言う。'}];
    return Akari.serializeProject(project,Akari.makeDefaultAssetStore());
  });
  await p.locator('#fileInput').setInputFiles({name:'controls.akari.md',mimeType:'text/plain',buffer:Buffer.from(text)});
  await p.waitForFunction(()=>Akari.app.project.name==='部品操作欄の監査');
  await p.locator('#uiLevel').selectOption('advanced');
  await p.locator('#objectSelect').selectOption('sprite-1');
  if(await p.locator('#sourceOverview').isVisible())await p.locator('#sourceEditBtn').click();
  await p.locator('#editorModecode').click();
  await p.locator('#codeEditor').fill('「変更した動き」と言う。');
  await p.waitForFunction(()=>Akari.app.editorState.main.sourceText==='「変更した動き」と言う。');
  await p.locator('#undoBtn').click();
  await p.waitForFunction(()=>Akari.app.editorState.main.sourceText==='「元の動き」と言う。');
  await p.locator('#editorModeblocks').click(); await frame(p);
  // The column on the right is the one scroller of the part list and its tools (the page, where the column is not a
  // scroller of its own); native wheel and touch input over the column is recorded.
  await p.evaluate(()=>{
    globalThis.controlsWheelEvents=[]; globalThis.controlsTrustedTouches=0;
    const c=document.querySelector('.side');
    c.addEventListener('wheel',e=>controlsWheelEvents.push({trusted:e.isTrusted,deltaY:e.deltaY}),{passive:true});
    c.addEventListener('touchstart',e=>{if(e.isTrusted)controlsTrustedTouches++;},{passive:true});
  });
}
// The element that scrolls the column: the column itself, or the page when the column is laid out at full height.
const scrollerState=p=>p.evaluate(()=>{
  const side=document.querySelector('.side'),own=/auto|scroll/.test(getComputedStyle(side).overflowY)&&side.scrollHeight>side.clientHeight+1;
  const s=own?side:document.scrollingElement;return{own,top:s.scrollTop,max:s.scrollHeight-s.clientHeight};
});
const notScroller=(p,selector)=>p.locator(selector).evaluate(e=>e.scrollHeight<=e.clientHeight+1||!/auto|scroll/.test(getComputedStyle(e).overflowY));
async function measure(p,selector) {
  return p.locator(selector).evaluate((e,selector)=>{
    const rect=r=>({x:r.left,y:r.top,width:r.width,height:r.height}),r=e.getBoundingClientRect();
    let left=0,top=0,right=innerWidth,bottom=innerHeight;
    // Root overflow applies to the viewport; its scrolled document rect is not a second clip box.
    for(let a=e.parentElement;a&&a!==document.documentElement;a=a.parentElement){const s=getComputedStyle(a),ar=a.getBoundingClientRect();
      if(/auto|scroll|hidden|clip/.test(s.overflowX)){left=Math.max(left,ar.left+a.clientLeft);right=Math.min(right,ar.left+a.clientLeft+a.clientWidth);}
      if(/auto|scroll|hidden|clip/.test(s.overflowY)){top=Math.max(top,ar.top+a.clientTop);bottom=Math.min(bottom,ar.top+a.clientTop+a.clientHeight);}
    }
    const walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),ink=[];
    while(walker.nextNode()){if(!walker.currentNode.textContent.trim())continue;const range=new Range();range.selectNodeContents(walker.currentNode);for(const textRect of range.getClientRects())if(textRect.width&&textRect.height)ink.push(rect(textRect));}
    return{selector,rect:rect(r),clip:{x:left,y:top,width:right-left,height:bottom-top},hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),
      clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,ink,ruby:[...e.querySelectorAll('ruby')].map(r=>({text:r.textContent,whiteSpace:getComputedStyle(r).whiteSpace}))};
  },selector);
}
function visible(o) {try{verifyComponentControlReach(o);return true;}catch{return false;}}
async function wheel(p,delta) {
  const before=(await scrollerState(p)).top,v=await p.evaluate(()=>({width:innerWidth,height:innerHeight}));
  const r=await p.locator('.side').evaluate(e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};});
  // The column's own scrollbar gutter (or its visible part of the page), avoiding the nested part chooser list.
  const top=Math.max(3,r.y),bottom=Math.min(v.height-3,r.y+r.height);
  await p.mouse.move(Math.min(v.width-3,r.x+r.width-4),Math.max(3,(top+bottom)/2));
  await p.mouse.wheel(0,delta);
  await p.waitForFunction(before=>{const side=document.querySelector('.side'),own=/auto|scroll/.test(getComputedStyle(side).overflowY)&&side.scrollHeight>side.clientHeight+1;
    return (own?side:document.scrollingElement).scrollTop!==before;},before,{timeout:2500});
  await frame(p);
}
async function reach(p,selector) {
  for(let i=0;i<16;i++){
    const o=await measure(p,selector); if(visible(o))return o;
    const delta=o.rect.y<o.clip.y?o.rect.y-o.clip.y-4:o.rect.y+o.rect.height-o.clip.y-o.clip.height+4;
    await wheel(p,Math.sign(delta)*Math.max(12,Math.ceil(Math.abs(delta))));
  }
  const o=await measure(p,selector);
  throw Error('Native wheel could not reveal '+JSON.stringify({selector,rect:o.rect,clip:o.clip,hit:o.hit}));
}
// Setup only (not reach evidence): the column and the page start at their tops.
async function home(p) {
  await p.evaluate(()=>{document.querySelector('.side').scrollTop=0;document.scrollingElement.scrollTop=0;}); await frame(p);
}
async function picker(p,open) {
  if(await p.locator('#componentPickerCore').evaluate(e=>e.open)!==open){await reach(p,'#componentPickerCore > summary');await p.locator('#componentPickerCore > summary').click();}
  await home(p);
}
async function exercise(p,name) {
  const before=await state(p),targets=[];
  await home(p); await p.evaluate(()=>controlsWheelEvents=[]);
  for(const selector of componentControlTargets)targets.push(await reach(p,selector));
  await shot(p,name);
  const clicks={};
  await reach(p,'#soundQuickAdd');
  const chooser=p.waitForEvent('filechooser');await p.locator('#soundQuickAdd').click();
  clicks.soundFileChooser=!!(await chooser); // Cancel by leaving the chooser without selecting a file.
  await reach(p,'#assetBtn');await p.locator('#assetBtn').click();
  clicks.assetDialog=await p.locator('#assetModal.show').isVisible();await p.locator('#assetClose').click();
  await reach(p,'#dataBtn');await p.locator('#dataBtn').click();
  clicks.dataDialog=await p.locator('#dataModal.show').isVisible();await p.locator('#dataClose').click();
  const geometry=await p.evaluate(()=>({region:{height:document.querySelector('#componentControls').clientHeight},
    treeHeight:document.querySelector('.objects-window .tree').clientHeight,
    help:document.querySelector('#componentActions .prop-duplicate')?.getAttribute('aria-description')??null,
    separateHelpLines:document.querySelectorAll('.child-copy-help').length,wheelEvents:controlsWheelEvents}));
  return{before,after:await state(p),targets,clicks,listScroller:!(await notScroller(p,'.objects-window .tree')),controlsScroller:!(await notScroller(p,'#componentControls')),...geometry};
}
async function run(id,fn) {
  const row={id,status:'RUNNING'};report.results.push(row);
  try{row.observed=await fn();row.status='PASS';}catch(error){row.status='FAIL';row.error=error.stack;}
  save();console.log(row.status+' '+id);if(row.error)console.error(row.error);
}
save();
await withBrowser(chrome,async browser=>{
  assert.equal(browser.version(),browserEnvironment.version);report.browser=browser.version();
  await run('COMPONENT-CONTROLS-RESPONSIVE',()=>pageFor(browser,product,async p=>{
    await fixture(p);const observations=[];
    for(const [width,height]of componentControlSizes){await p.setViewportSize({width,height});
      for(const level of ['basic','advanced']){await p.locator('#uiLevel').selectOption(level);
        for(const open of [false,true]){await picker(p,open);observations.push({width,height,level,open,...await exercise(p,`controls-${width}-${level}-${open}`)});}
      }
    }return observations;
  }));
  await run('COMPONENT-CONTROLS-KEYBOARD',()=>pageFor(browser,product,async p=>{
    await p.setViewportSize({width:1280,height:720});await fixture(p);const observations=[];
    for(const level of ['basic','advanced']){
      await p.locator('#uiLevel').selectOption(level);await picker(p,false);const before=await state(p);
      // Tab from the chosen part tile through the tools: each tool scrolls into view when it takes the focus.
      await p.locator('#projectTree .tree-item.selected').focus();await frame(p);
      const startScroll=(await scrollerState(p)).top,forward=[],reverse=[];
      for(let i=0;i<20;i++){await p.keyboard.press('Tab');await frame(p);const id=await p.evaluate(()=>document.activeElement.id);
        if(['soundQuickAdd','assetBtn','dataBtn'].includes(id))forward.push(await measure(p,'#'+id));
        if(id==='dataBtn')break;
      }
      const endScroll=(await scrollerState(p)).top;
      await p.keyboard.press('Tab');
      for(let i=0;i<20;i++){await p.keyboard.press('Shift+Tab');await frame(p);const id=await p.evaluate(()=>document.activeElement.id);
        if(['soundQuickAdd','assetBtn','dataBtn'].includes(id))reverse.push(await measure(p,'#'+id));
        if(id==='soundQuickAdd')break;
      }
      observations.push({level,before,after:await state(p),startScroll,endScroll,forward,reverse});
    }return observations;
  }));
  // 25 parts: the last tile and the tools under the list are reached by wheeling the one column; neither the list nor
  // the tools scroll on their own.
  await run('COMPONENT-CONTROLS-LIST',()=>pageFor(browser,product,async p=>{
    await p.setViewportSize({width:1280,height:720});await fixture(p);await picker(p,true);const before=await state(p);
    const tree='.objects-window .tree',last=tree+' .tree-item:last-child',columnBefore=(await scrollerState(p)).top;
    const lastHit=()=>p.locator(last).evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
    for(let i=0;i<20&&!await lastHit();i++)await wheel(p,240);
    const lastTileHit=await lastHit(),columnAtLastTile=(await scrollerState(p)).top;
    await reach(p,'#dataBtn');const columnAtTools=(await scrollerState(p)).top;
    return{before,after:await state(p),lastHit:lastTileHit,columnBefore,columnAtLastTile,columnAtTools,
      listScroller:!(await notScroller(p,tree)),controlsScroller:!(await notScroller(p,'#componentControls')),wheelEvents:await p.evaluate(()=>controlsWheelEvents)};
  }));
  await run('COMPONENT-CONTROLS-TOUCH',async()=>{
    const context=await browser.newContext({offline:true,hasTouch:true,viewport:{width:390,height:600}});
    try{await context.route(/^https?:/,r=>{report.networkRequests.push(r.request().url());return r.abort();});
      const p=await context.newPage();await p.goto(pathToFileURL(path.resolve(product)).href);await fixture(p);await picker(p,false);
      const before=await state(p),scrollBefore=(await scrollerState(p)).top,cdp=await context.newCDPSession(p);let swipes=0;
      // Swipe up over the visible part of the column (it scrolls the column, or the page at this narrow size; before the
      // column comes into view, the page above it).
      while(!visible(await measure(p,'#dataBtn'))&&swipes<16){const r=await p.locator('.side').evaluate(e=>{const b=e.getBoundingClientRect(),top=Math.max(0,b.top),bottom=Math.min(innerHeight,b.bottom);
        return bottom-top>=80?{x:b.x,width:b.width,top,height:bottom-top}:{x:0,width:innerWidth,top:0,height:innerHeight};});
        const x=r.x+r.width*.7,y=r.top+r.height*.78;
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
        for(let step=1;step<=8;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-r.height*.55*step/8,id:1}]});await frame(p);}
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await frame(p);swipes++;
      }
      const target=await measure(p,'#dataBtn');verifyComponentControlReach(target);
      const scrollAfter=(await scrollerState(p)).top,trustedTouches=await p.evaluate(()=>controlsTrustedTouches);
      const r=target.rect;await p.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);const dialogOpened=await p.locator('#dataModal.show').isVisible();await p.locator('#dataClose').click();await shot(p,'controls-touch');
      return{before,after:await state(p),scrollBefore,scrollAfter,swipes,trustedTouches,target,dialogOpened};
    }finally{await context.close();}
  });
},480000);
await run('COMPONENT-CONTROLS-ZOOM',async()=>{
  const extension=path.resolve(directory,'zoom-extension'),profile=path.resolve(directory,'zoom-profile');fs.mkdirSync(extension);
  writeZoomExtension(extension,'Local component audit zoom');
  const {chromium}=require('playwright'),context=await chromium.launchPersistentContext(profile,{executablePath:chrome,headless:true,viewport:null,offline:true,timeout:15000,
    ignoreDefaultArgs:['--disable-extensions'],args:['--allow-file-access-from-files','--disable-background-networking','--window-size=1366,768',...zoomExtensionArgs(extension)]});
  try{await context.route(/^https?:/,r=>{report.networkRequests.push(r.request().url());return r.abort();});
    const worker=await zoomExtensionWorker(context),p=context.pages()[0];
    await p.goto(pathToFileURL(path.resolve(product)).href);await fixture(p);await picker(p,true);
    const windowState=()=>p.evaluate(()=>({outerWidth,outerHeight,innerWidth,innerHeight,dpr:devicePixelRatio,cssZoom:getComputedStyle(document.documentElement).zoom}));
    const windowBefore=await windowState(),observations=[];
    for(const requested of [1.25,1.5,2]){
      const actual=await setNativeZoom(context,worker,p,requested);
      await p.waitForFunction(({dpr,requested})=>Math.abs(devicePixelRatio/dpr-requested)<.02,{dpr:windowBefore.dpr,requested});await frame(p);
      observations.push({requested,actual,windowBefore,windowAfter:await windowState(),exercise:await exercise(p,'controls-zoom-'+requested)});
    }return observations;
  }finally{await context.close();}
});
assert.deepEqual(snapshot(product),inputs,'browser audit keeps source inputs unchanged');
report.status=report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';
if(report.status==='PASS')try{verifyComponentControls(report,inputs);}catch(error){report.status='FAIL';report.contractFailure=error.stack;console.error(error.stack);}
save();if(report.status!=='PASS')process.exitCode=1;
