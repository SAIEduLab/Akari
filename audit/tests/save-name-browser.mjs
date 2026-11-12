// The work's name is seen before every save (askSaveName): at every screen, browser zoom, pointer, level and view, from
// every place a save starts, the question shows over the page while the name keeps its outline on top. What is seen is
// read from the screen's pixels: the page is inert under the question, so hit testing cannot say what is painted.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {snapshot} from '../lib/input-snapshot.cjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {pngPixels,contrastRatio} from '../lib/png-pixels.mjs';
import {writeZoomExtension,zoomExtensionArgs,zoomExtensionWorker,setNativeZoom} from '../lib/native-zoom.mjs';
import {saveNameScreens,saveNameZooms,saveNamePointers,saveNameViews,saveNameRoutes,saveNameLine,saveNameOracles,saveNameShiftLimit,saveNameMatchScreens,saveNameMatchZooms} from '../lib/save-name-contract.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const {chooseView}=require('../browser/cases/view-toggle.cjs');
const {projectAction}=require('../lib/project-actions.cjs');
const [browserPath,output]=process.argv.slice(2);assert.ok(browserPath&&output&&!fs.existsSync(output),'fresh report required');
const product=path.resolve(currentProductFile());
const report={schema:'akari-gate-cases-v1',step:'save-name',snapshot:snapshot(currentProductFile()),browser:null,playwright:require('playwright/package.json').version,results:[],errors:[]};
const frames=p=>p.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
// A pixel is the line's colour within 6 per channel: scaling the screenshot to css pixels rounds, while the question's
// backdrop (rgba(25,37,55,.32)) over the line moves its blue channel by 64 and its green by 17.
const near=(a,b,tolerance=6)=>a.every((v,k)=>Math.abs(v-b[k])<=tolerance);
async function record(id,fn){
  try{report.results.push({id,status:'PASS',...await fn()});console.log('PASS '+id);}
  catch(error){report.results.push({id,status:'FAIL',detail:String(error.stack||error)});console.error('FAIL '+id+' '+error.message);}
}
// The screen's pixels over a box of css pixels [x, y, width, height]: {width, height, at(ix, iy)} from the box's corner,
// k screen pixels to a css pixel. Under the emulation (k 1) a screenshot of the box in css pixels. Under Chrome's own
// zoom (k the zoom, the window's own ratio being 1) Playwright's screenshot keeps the page's css size and cuts off what
// the zoom draws beyond it, so the window is taken whole through the DevTools protocol and read at the box.
async function grab(p,k,[x,y,width,height]){
  if(k===1){const image=pngPixels(await p.screenshot({clip:{x,y,width,height},scale:'css'}));return image;}
  const session=await p.context().newCDPSession(p);
  try{
    const image=pngPixels(Buffer.from((await session.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    const ox=Math.floor(x*k),oy=Math.floor(y*k),w=Math.min(image.width-ox,Math.floor(width*k)),h=Math.min(image.height-oy,Math.floor(height*k));
    if(w<=0||h<=0)throw new Error('box outside the window');
    return{width:w,height:h,at:(ix,iy)=>image.at(ox+ix,oy+iy)};
  }finally{await session.detach();}
}
async function observe(p,k=1){
  await frames(p);
  const seen=await p.evaluate(()=>{
    const name=document.getElementById('projectName'),b=name.getBoundingClientRect(),style=getComputedStyle(name);
    const dialog=document.querySelector('#saveConfirmModal .project-choice-dialog').getBoundingClientRect();
    const pressable=['saveConfirmYes','saveConfirmNo'].every(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();
      return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===e;});
    const text=document.getElementById('saveConfirmMessage').cloneNode(true);text.querySelectorAll('rt').forEach(rt=>rt.remove());
    return{level:document.getElementById('uiLevel').value,view:document.body.dataset.editorMode,message:text.textContent,focus:document.activeElement?.id??null,
      order:[...document.querySelectorAll('#saveConfirmModal .project-choice-footer button')].map(e=>e.id),
      style:{colour:style.outlineColor,width:style.outlineWidth,offset:style.outlineOffset,style:style.outlineStyle},
      radius:parseFloat(style.borderTopLeftRadius)||0,box:[b.left,b.top,b.right,b.bottom],dialog:[dialog.left,dialog.top,dialog.right,dialog.bottom],
      lineWidth:parseFloat(style.outlineWidth),pressable};
  });
  // The line as drawn (Chrome's own zoom draws it in whole device pixels, narrower than 5px).
  const [left,top,right,bottom]=seen.box,[dl,dt,dr,db]=seen.dialog,out=seen.lineWidth+saveNameLine.offset;
  const size=await p.evaluate(()=>[innerWidth,innerHeight]);
  seen.lineInside=left-out>=0&&top-out>=0&&right+out<=size[0]&&bottom+out<=size[1];
  seen.clear=db<=top-out||dt>=bottom+out||dr<=left-out||dl>=right+out;
  // The line's middle and the white ring between it and the field, along the straight part of each side. A sample off the
  // screen counts as unseen.
  const x0=Math.max(0,Math.floor(left)-out-3),y0=Math.max(0,Math.floor(top)-out-3);
  const x1=Math.min(size[0],Math.ceil(right)+out+3),y1=Math.min(size[1],Math.ceil(bottom)+out+3);
  const image=x1>x0&&y1>y0?await grab(p,k,[x0,y0,x1-x0,y1-y0]):null;
  const at=(x,y)=>{const ix=Math.floor(x*k)-Math.floor(x0*k),iy=Math.floor(y*k)-Math.floor(y0*k);return image&&ix>=0&&iy>=0&&ix<image.width&&iy<image.height?image.at(ix,iy):null;};
  // The ring is 1px out from the field; under Chrome's zoom it is the screen pixel just outside the field's edge as Chrome
  // rounds it to the pixel grid (2px of ring is 1.5 to 2.5 screen pixels there, so that pixel is the ring's).
  const ring=k===1?{top:top-1,bottom:bottom+1,left:left-1,right:right+1}
    :{top:(Math.round(top*k)-0.5)/k,bottom:(Math.round(bottom*k)+0.5)/k,left:(Math.round(left*k)-0.5)/k,right:(Math.round(right*k)+0.5)/k};
  const middle=saveNameLine.offset+seen.lineWidth/2,skip=seen.radius+4,samples={top:[],bottom:[],left:[],right:[]};
  for(let x=left+skip;x<=right-skip;x+=4){samples.top.push([at(x,top-middle),at(x,ring.top)]);samples.bottom.push([at(x,bottom+middle),at(x,ring.bottom)]);}
  for(let y=top+skip;y<=bottom-skip;y+=4){samples.left.push([at(left-middle,y),at(ring.left,y)]);samples.right.push([at(right+middle,y),at(ring.right,y)]);}
  const all=Object.values(samples).flat(),whole=all.length>0&&all.every(s=>s.every(Boolean));
  seen.sides=Object.fromEntries(Object.entries(samples).map(([side,list])=>[side,list.length]));
  seen.painted=whole&&all.every(([line])=>near(line,saveNameLine.colour));
  seen.contrast=whole?Math.min(...all.map(([line,ring])=>contrastRatio(line,ring))):0;
  // The name inside its field looks as it does with every dialog's backdrop taken away, in the same moment and layout:
  // nothing but a backdrop lies over the page, and the dialogs' boxes are kept clear of the name above (clear).
  const now=await fieldShot(p,k),bare=await p.addStyleTag({content:'.modal{background:transparent !important;backdrop-filter:none !important}'});
  let reference;try{await frames(p);reference=await fieldShot(p,k);}finally{await bare.evaluate(e=>e.remove());await frames(p);}
  const moved=!now||!reference||now.box.some((v,k)=>Math.abs(v-reference.box[k])>0.5);
  seen.nameShift=moved?null:meanShift(reference.image,now.image,Math.ceil(seen.radius*k));
  seen.nameAsBefore=!moved&&seen.nameShift<=saveNameShiftLimit;
  for(const key of ['box','dialog','radius','lineWidth'])delete seen[key];
  return seen;
}
// The inside of the name field (2px in from its edge, clear of its border), in css pixels; null where none of it is on
// the screen.
async function fieldShot(p,k){
  const [box,size]=await p.locator('#projectName').evaluate(e=>{const b=e.getBoundingClientRect();return [[b.left,b.top,b.right,b.bottom],[innerWidth,innerHeight]];});
  const [left,top,right,bottom]=box,x=Math.max(0,Math.ceil(left)+2),y=Math.max(0,Math.ceil(top)+2),width=Math.min(size[0],Math.floor(right)-2)-x,height=Math.min(size[1],Math.floor(bottom)-2)-y;
  return width>0&&height>0?{box,image:await grab(p,k,[x,y,width,height])}:null;
}
// The mean, over the field's straight part (its rounded ends left out), of each pixel's largest channel change.
function meanShift(a,b,ends){
  if(a.width!==b.width||a.height!==b.height)return 255;
  let sum=0,count=0;
  for(let y=0;y<a.height;y++)for(let x=ends;x<a.width-ends;x++){const p=a.at(x,y),q=b.at(x,y);sum+=Math.max(...p.map((v,k)=>Math.abs(v-q[k])));count++;}
  return count?sum/count:255;
}
// Which checks refuse what was seen (true: that check says the name is not seen).
const refusals=s=>({painted:!s.painted,contrast:!(s.contrast>=3),nameAsBefore:!s.nameAsBefore,lineInside:!s.lineInside,clear:!s.clear,pressable:!s.pressable});
const asked=p=>p.locator('#saveConfirmModal').evaluate(e=>e.classList.contains('show'));
const under=(p,route)=>route==='toolbar'?null:p.locator(route==='lose'?'#loseConfirmModal':'#procModal').evaluate(e=>e.classList.contains('show'));
const focused=p=>p.evaluate(()=>document.activeElement?.id||null);
const shownModals=p=>p.evaluate(()=>[...document.querySelectorAll('.modal.show,dialog[open]')].map(e=>e.id).sort());
async function setUp(p,level,view,name){
  // 名人 is chosen from the code view of かんたん or くわしく and stays while the work is a 名人 work.
  if(level==='meijin'){
    if(await p.locator('#uiLevel').inputValue()!=='meijin'){await p.locator('#uiLevel').selectOption('basic');await chooseView(p,'code');await p.locator('#uiLevel').selectOption('meijin');}
  }else{await p.locator('#uiLevel').selectOption(level);await chooseView(p,view);}
  // A new name makes the work unsaved, so 新しく作る asks before it replaces the work.
  await p.locator('#projectName').fill(name);await p.locator('#projectName').press('Tab');
}
// Starts a save from the route; the question is open when it returns.
async function begin(p,route){
  if(route==='toolbar')await p.locator('#saveBtn').click();
  else if(route==='lose'){await projectAction(p,'newBtn');await p.locator('#loseConfirmModal.show').waitFor();await p.locator('#loseConfirmSave').click();}
  else{await p.locator('#procBtn').click();await p.locator('#procModal.show').waitFor();await p.locator('#callableSaveProject').click();}
  await p.locator('#saveConfirmModal.show').waitFor();
}
async function again(p,route){
  await p.locator(route==='toolbar'?'#saveBtn':route==='lose'?'#loseConfirmSave':'#callableSaveProject').click();
  await p.locator('#saveConfirmModal.show').waitFor();
}
// The toolbar is drawn over the backdrop but cannot be pressed: 保存 and 新しく作る are pressed where they are seen, by
// the pointer of the case.
async function pressToolbar(p,pointer,downloads){
  const before=await shownModals(p);
  for(const id of ['saveBtn','newBtn']){
    const r=await p.locator('#'+id).evaluate(e=>{const b=e.getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2];});
    if(pointer==='touch')await p.touchscreen.tap(r[0],r[1]);else await p.mouse.click(r[0],r[1]);
    await frames(p);
  }
  const after=await shownModals(p);
  return{asked:await asked(p),downloads:downloads.length,others:after.filter(id=>!before.includes(id))};
}
async function leftAlone(p,route,downloads){
  await frames(p);
  return{downloads:downloads.length,asked:await asked(p),nameCheck:await p.evaluate(()=>document.body.classList.contains('name-check')),under:await under(p,route),focus:await focused(p)};
}
async function saveCase(p,pointer,route,name){
  const downloads=[],count=d=>downloads.push(d.suggestedFilename());p.on('download',count);
  try{
    await begin(p,route);const seen=await observe(p),toolbar=await pressToolbar(p,pointer,downloads);
    await p.locator('#saveConfirmNo').click();const no=await leftAlone(p,route,downloads);
    await again(p,route);await p.keyboard.press('Escape');const escape=await leftAlone(p,route,downloads);
    await again(p,route);const pending=p.waitForEvent('download');await p.locator('#saveConfirmYes').click();const file=(await pending).suggestedFilename();await frames(p);
    const yes={downloads:downloads.length,file,name,under:await under(p,route),focus:await focused(p)};
    if(route==='callable'){await p.locator('#procClose').click();await p.locator('#procModal').waitFor({state:'hidden'});}
    return{seen,toolbar,no,escape,yes};
  }finally{p.off('download',count);}
}
let browser;
// Where the toolbar, the name and the question are, in css pixels, and what is seen, with the question open from the
// toolbar's 保存.
async function layout(p,name,k=1){
  await setUp(p,'basic','blocks',name);await begin(p,'toolbar');await frames(p);
  const placed=await p.evaluate(()=>{const rect=s=>{const b=document.querySelector(s).getBoundingClientRect();return [b.left,b.top,b.width,b.height].map(v=>Math.round(v*100)/100);};
    const style=getComputedStyle(document.getElementById('projectName'));
    return{inner:[innerWidth,innerHeight],ratio:devicePixelRatio,toolbar:rect('#app > .menutool'),name:rect('#projectName'),question:rect('#saveConfirmModal .project-choice-dialog'),
      line:[style.outlineStyle,style.outlineWidth,style.outlineOffset,style.outlineColor]};});
  placed.seen=await observe(p,k);
  await p.locator('#saveConfirmNo').click();await frames(p);
  return placed;
}
// Chrome's own zoom (chrome.tabs.setZoom from a fresh local extension, as the other zoom audits set it) in a window of
// the screen's size; the headless window keeps its own frame, so its inner size is read and then given to the emulation.
async function nativeLayout(width,height,zoom,name){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'akari-save-name-')),extension=path.join(directory,'extension');
  fs.mkdirSync(extension);writeZoomExtension(extension,'Local save-name audit zoom');
  const context=await chromium.launchPersistentContext(path.join(directory,'profile'),{executablePath:browserPath,headless:true,viewport:null,offline:true,timeout:15000,
    ignoreDefaultArgs:['--disable-extensions'],args:['--allow-file-access-from-files','--disable-background-networking','--window-size='+width+','+height,...zoomExtensionArgs(extension)]});
  try{
    await context.route(/^https?:/,route=>{report.errors.push('network: '+route.request().url());return route.abort();});
    const worker=await zoomExtensionWorker(context),p=context.pages()[0];
    p.setDefaultTimeout(15000);p.on('pageerror',e=>report.errors.push(e.message));p.on('dialog',d=>d.accept());
    await p.goto(pathToFileURL(product).href);await p.waitForFunction(()=>!!globalThis.Akari?.app);
    const ratio=await p.evaluate(()=>devicePixelRatio),actual=await setNativeZoom(context,worker,p,zoom/100);
    await p.waitForFunction(({ratio,zoom})=>Math.abs(devicePixelRatio/ratio-zoom/100)<0.02,{ratio,zoom});await frames(p);
    return{actual:Math.round(actual*100),...await layout(p,name,zoom/100)};
  }finally{await context.close();fs.rmSync(directory,{recursive:true,force:true});}
}
// A browser zoom on a screen gives the page a css viewport of the screen's size divided by the zoom, drawn at the zoom
// as its device pixel ratio; each screen, zoom and pointer gets that viewport in a context of its own. A touch screen
// makes the page's pointer coarse.
async function openPage(width,height,zoom,pointer){
  const viewport={width:Math.round(width*100/zoom),height:Math.round(height*100/zoom)};
  const context=await browser.newContext({offline:true,viewport,deviceScaleFactor:zoom/100,hasTouch:pointer==='touch'}),p=await context.newPage();
  await context.route(/^https?:/,route=>{report.errors.push('network: '+route.request().url());return route.abort();});
  p.setDefaultTimeout(15000);p.on('pageerror',e=>report.errors.push(e.message));p.on('dialog',d=>d.accept());
  await p.goto(pathToFileURL(product).href);await p.waitForFunction(()=>!!globalThis.Akari?.app);
  return{context,p,viewport:{...viewport,zoom,ratio:await p.evaluate(()=>devicePixelRatio),coarse:await p.evaluate(()=>matchMedia('(pointer: coarse)').matches)}};
}
// The oracle's ways of hiding the name, each for the check that must refuse it (saveNameOracles).
const oracleStyles={
  'oracle/toolbar-under-backdrop':'body.name-check #app > .menutool{z-index:500 !important}',
  'oracle/line-removed':'body.name-check #app > .menutool > #projectName{outline-color:transparent !important}',
  'oracle/ring-like-line':'body.name-check #app > .menutool > #projectName{box-shadow:0 0 0 2px #1a66ff !important}',
  'oracle/question-over-name':'#saveConfirmModal .project-choice-dialog{position:fixed !important;inset:0 !important;width:auto !important;max-width:none !important;margin:0 !important}',
  'oracle/name-off-screen':'body.name-check #app > .menutool > #projectName{position:relative !important;top:-40px !important}',
  'oracle/yes-hidden':'#saveConfirmYes{visibility:hidden !important}',
};
(async()=>{try{
  browser=await chromium.launch({executablePath:browserPath,headless:true,args:['--disable-background-networking']});report.browser=browser.version();
  let n=0;
  for(const [width,height] of saveNameScreens)for(const zoom of saveNameZooms)for(const pointer of saveNamePointers){
    const {context,p,viewport}=await openPage(width,height,zoom,pointer);
    try{
      for(const [level,view] of saveNameViews)for(const route of saveNameRoutes(level))
        await record(`save-name/${width}x${height}/${zoom}/${pointer}/${level}/${view}/${route}`,async()=>{
          const name='さくひん'+(++n);await setUp(p,level,view,name);
          return{viewport,...await saveCase(p,pointer,route,name)};
        });
    }finally{await context.close();}
  }
  // The oracle on one screen: each way of hiding the name is refused by its check.
  const {context,p}=await openPage(1366,768,100,'mouse');
  try{
    for(const id of Object.keys(saveNameOracles))
      await record(id,async()=>{
        await setUp(p,'basic','blocks','さくひん'+(++n));const tag=await p.addStyleTag({content:oracleStyles[id]});
        try{await begin(p,'toolbar');const seen=await observe(p);await p.locator('#saveConfirmNo').click({force:true});await frames(p);
          return{refused:refusals(seen),seen};}
        finally{await tag.evaluate(e=>e.remove());if(await asked(p))await p.keyboard.press('Escape');}
      });
  }finally{await context.close();}
  // The emulation against Chrome's own zoom: the same css size and pixel ratio place the toolbar, the name and the
  // question alike.
  for(const [width,height] of saveNameMatchScreens)for(const zoom of saveNameMatchZooms)await record(`zoom-match/${width}x${height}/${zoom}`,async()=>{
    const native=await nativeLayout(width,height,zoom,'さくひん'+(++n));
    const context=await browser.newContext({offline:true,viewport:{width:native.inner[0],height:native.inner[1]},deviceScaleFactor:native.ratio});
    try{
      const p=await context.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>report.errors.push(e.message));
      await p.goto(pathToFileURL(product).href);await p.waitForFunction(()=>!!globalThis.Akari?.app);
      return{native,emulated:await layout(p,'さくひん'+(++n))};
    }finally{await context.close();}
  });
  report.status=report.results.length&&report.results.every(r=>r.status==='PASS')&&!report.errors.length?'PASS':'FAIL';
}catch(e){report.failure=String(e.stack||e);report.status='FAIL';console.error(report.failure);}
finally{if(browser)await browser.close();fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,total:report.results.length,failed:report.results.filter(r=>r.status!=='PASS').length}));process.exitCode=report.status==='PASS'?0:1;}
})();
