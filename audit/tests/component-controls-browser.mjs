import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot,sha,withBrowser,pageFor} from '../lib/product-test-host.mjs';
import {browserEnvironment} from '../lib/browser-environment.mjs';
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
  p.setDefaultTimeout(8000); p.on('dialog',d=>d.accept());
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
  await p.evaluate(()=>{
    globalThis.controlsWheelEvents=[]; globalThis.controlsTrustedTouches=0;
    const c=document.querySelector('#componentControls');
    c.addEventListener('wheel',e=>controlsWheelEvents.push({trusted:e.isTrusted,deltaY:e.deltaY}),{passive:true});
    c.addEventListener('touchstart',e=>{if(e.isTrusted)controlsTrustedTouches++;},{passive:true});
  });
}
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
async function wheel(p,region,delta) {
  const before=await p.locator(region).evaluate(e=>e.scrollTop),r=await p.locator(region).boundingBox();
  const v=await p.evaluate(()=>({width:innerWidth,height:innerHeight}));
  // The scrollbar gutter belongs to this scroll surface, avoiding nested chooser lists.
  await p.mouse.move(Math.min(v.width-3,r.x+r.width-4),Math.max(3,Math.min(v.height-3,r.y+r.height/2)));
  await p.mouse.wheel(0,delta);
  await p.waitForFunction(({region,before})=>document.querySelector(region).scrollTop!==before,{region,before},{timeout:2500});
  await frame(p);
}
async function reach(p,selector) {
  await p.locator('#componentControls').scrollIntoViewIfNeeded(); await frame(p);
  for(let i=0;i<12;i++){
    const o=await measure(p,selector); if(visible(o))return o;
    const delta=o.rect.y<o.clip.y?o.rect.y-o.clip.y-4:o.rect.y+o.rect.height-o.clip.y-o.clip.height+4;
    await wheel(p,'#componentControls',Math.sign(delta)*Math.max(12,Math.ceil(Math.abs(delta))));
  }
  const o=await measure(p,selector);
  throw Error('Native wheel could not reveal '+JSON.stringify({selector,rect:o.rect,clip:o.clip,hit:o.hit}));
}
async function home(p) {
  await p.locator('#componentControls').scrollIntoViewIfNeeded();
  await p.locator('#componentControls').focus(); await p.keyboard.press('Home'); await frame(p);
  await p.waitForFunction(()=>document.querySelector('#componentControls').scrollTop===0);
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
    treeHeight:document.querySelector('.objects-window .tree').clientHeight,help:document.querySelector('.child-copy-help').textContent,wheelEvents:controlsWheelEvents}));
  return{before,after:await state(p),targets,clicks,...geometry};
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
      const startScroll=await p.locator('#componentControls').evaluate(e=>e.scrollTop);
      await p.keyboard.press('End');await frame(p);const endScroll=await p.locator('#componentControls').evaluate(e=>e.scrollTop);
      await p.keyboard.press('Home');await frame(p);const homeScroll=await p.locator('#componentControls').evaluate(e=>e.scrollTop),forward=[],reverse=[];
      for(let i=0;i<20;i++){await p.keyboard.press('Tab');await frame(p);const id=await p.evaluate(()=>document.activeElement.id);
        if(['soundQuickAdd','assetBtn','dataBtn'].includes(id))forward.push(await measure(p,'#'+id));
        if(id==='dataBtn')break;
      }
      await p.keyboard.press('Tab');
      for(let i=0;i<20;i++){await p.keyboard.press('Shift+Tab');await frame(p);const id=await p.evaluate(()=>document.activeElement.id);
        if(['soundQuickAdd','assetBtn','dataBtn'].includes(id))reverse.push(await measure(p,'#'+id));
        if(id==='soundQuickAdd')break;
      }
      observations.push({level,before,after:await state(p),startScroll,endScroll,homeScroll,forward,reverse});
    }return observations;
  }));
  await run('COMPONENT-CONTROLS-LIST',()=>pageFor(browser,product,async p=>{
    await p.setViewportSize({width:1280,height:720});await fixture(p);await picker(p,true);const before=await state(p);
    const controlsScrollBefore=await p.locator('#componentControls').evaluate(e=>e.scrollTop);
    const tree='.objects-window .tree';await p.locator(tree).scrollIntoViewIfNeeded();
    while(await p.locator(tree).evaluate(e=>e.scrollTop+e.clientHeight<e.scrollHeight-1))await wheel(p,tree,300);
    const treeScroll=await p.locator(tree).evaluate(e=>e.scrollTop);
    const lastHit=await p.locator(tree+' .tree-item').last().evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
    const controlsScrollAfter=await p.locator('#componentControls').evaluate(e=>e.scrollTop);
    const treeScrollBeforeControls=treeScroll;await reach(p,'#dataBtn');
    return{before,after:await state(p),treeScroll,lastHit,controlsScrollBefore,controlsScrollAfter,
      controlsScrollAfterWheel:await p.locator('#componentControls').evaluate(e=>e.scrollTop),treeScrollBeforeControls,treeScrollAfterControls:await p.locator(tree).evaluate(e=>e.scrollTop)};
  }));
  await run('COMPONENT-CONTROLS-TOUCH',async()=>{
    const context=await browser.newContext({offline:true,hasTouch:true,viewport:{width:390,height:600}});
    try{await context.route(/^https?:/,r=>{report.networkRequests.push(r.request().url());return r.abort();});
      const p=await context.newPage();await p.goto(pathToFileURL(path.resolve(product)).href);await fixture(p);await picker(p,false);
      const before=await state(p),scrollBefore=await p.locator('#componentControls').evaluate(e=>e.scrollTop),cdp=await context.newCDPSession(p);let swipes=0;
      while(!visible(await measure(p,'#dataBtn'))&&swipes<12){const r=await p.locator('#componentControls').boundingBox(),x=r.x+r.width*.7,y=r.y+r.height*.78;
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
        for(let step=1;step<=8;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-r.height*.55*step/8,id:1}]});await frame(p);}
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await frame(p);swipes++;
      }
      const target=await measure(p,'#dataBtn');verifyComponentControlReach(target);
      const scrollAfter=await p.locator('#componentControls').evaluate(e=>e.scrollTop),trustedTouches=await p.evaluate(()=>controlsTrustedTouches);
      const r=target.rect;await p.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);const dialogOpened=await p.locator('#dataModal.show').isVisible();await p.locator('#dataClose').click();await shot(p,'controls-touch');
      return{before,after:await state(p),scrollBefore,scrollAfter,swipes,trustedTouches,target,dialogOpened};
    }finally{await context.close();}
  });
},480000);
await run('COMPONENT-CONTROLS-ZOOM',async()=>{
  const extension=path.resolve(directory,'zoom-extension'),profile=path.resolve(directory,'zoom-profile');fs.mkdirSync(extension);
  fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Local component audit zoom',version:'1.0',permissions:['tabs'],background:{service_worker:'worker.js'}}));
  fs.writeFileSync(path.join(extension,'worker.js'),'chrome.runtime.onInstalled.addListener(()=>{});');
  const {chromium}=require('playwright'),context=await chromium.launchPersistentContext(profile,{executablePath:chrome,headless:true,viewport:null,offline:true,timeout:15000,
    ignoreDefaultArgs:['--disable-extensions'],args:['--allow-file-access-from-files','--disable-background-networking','--window-size=1366,768','--disable-extensions-except='+extension,'--load-extension='+extension]});
  try{await context.route(/^https?:/,r=>{report.networkRequests.push(r.request().url());return r.abort();});
    const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:10000}),p=context.pages()[0];
    await p.goto(pathToFileURL(path.resolve(product)).href);await fixture(p);await picker(p,true);
    const windowState=()=>p.evaluate(()=>({outerWidth,outerHeight,innerWidth,innerHeight,dpr:devicePixelRatio,cssZoom:getComputedStyle(document.documentElement).zoom}));
    const windowBefore=await windowState(),observations=[];
    for(const requested of [1.25,1.5,2]){
      const actual=await worker.evaluate(async zoom=>{const tab=(await chrome.tabs.query({})).find(t=>t.url?.startsWith('file:'));await chrome.tabs.setZoom(tab.id,zoom);return chrome.tabs.getZoom(tab.id);},requested);
      await p.waitForFunction(({dpr,requested})=>Math.abs(devicePixelRatio/dpr-requested)<.02,{dpr:windowBefore.dpr,requested});await frame(p);
      observations.push({requested,actual,windowBefore,windowAfter:await windowState(),exercise:await exercise(p,'controls-zoom-'+requested)});
    }return observations;
  }finally{await context.close();}
});
assert.deepEqual(snapshot(product),inputs,'browser audit keeps source inputs unchanged');
report.status=report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';
if(report.status==='PASS')try{verifyComponentControls(report,inputs);}catch(error){report.status='FAIL';report.contractFailure=error.stack;console.error(error.stack);}
save();if(report.status!=='PASS')process.exitCode=1;
