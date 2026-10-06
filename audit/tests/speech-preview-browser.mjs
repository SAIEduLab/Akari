import fs from 'node:fs';
import {nameLegacyFixtureActor} from '../lib/gate-ui-fixture.mjs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {reveal} from '../lib/ux-repair02-ui.mjs';
import {previewCases,previewNames,previewShortTexts,previewLongTexts} from '../fixtures/speech-preview.mjs';
import {verifyPreviewObserved,verifyPreviewReport} from '../lib/speech-preview-contract.mjs';
const require=createRequire(import.meta.url),[chrome,out='audit-evidence/speech-preview.json']=process.argv.slice(2),product=currentProductFile(),output=path.resolve(out),dir=output+'.artifacts';
fs.mkdirSync(dir,{recursive:true});
const inputs=snapshot(product),report={schema:'akari-speech-preview-v1',status:'RUNNING',snapshot:inputs,uxAcceptance:false,classification:'automated native UI evidence; final acceptance requires Dango independent operation audit',environment:{browser:null,playwright:require('playwright/package.json').version,os:process.platform},pageErrors:[],networkRequests:[],results:[]};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const settle=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function prepare(p,c){
 await p.locator('#newBtn').click();await p.locator('#editorModecode').click();await p.locator('#uiLevel').selectOption('basic');
 await nameLegacyFixtureActor(p);
 const dango=p.locator('[data-sprite-preset="dango"]');await reveal(dango);await dango.click();
 const texts=c.kind==='short'?previewShortTexts:previewLongTexts,seconds=c.kind==='short'?2:10;
 for(const [i,name] of previewNames.entries()){
  const id=await p.evaluate(name=>Akari.app.project.components.find(c=>c.name===name).id,name);
  await p.locator('#objectSelect').selectOption(id);await p.locator('#eventSelect').selectOption('start');
  if(await p.locator('#sourceOverview').isVisible())await p.locator('#sourceEditBtn').click();
  await p.locator('#codeEditor').fill('「'+texts[i]+'」と'+seconds+'秒話す。');await p.locator('#codeEditor').press('Tab');
 }
 if(c.restore){
  await p.waitForFunction(()=>document.querySelector('#autosaveState').textContent==='自動保存：済み',null,{timeout:10000});
  await p.reload();await p.locator('#recoveryRestore').click();await p.waitForFunction(()=>!document.querySelector('#recoveryModal').classList.contains('show'));
 }
 if(c.fullWidthFont){
  const font=process.platform==='win32'?'Meiryo':'Noto Sans CJK JP';
  await p.addStyleTag({content:'#formSurface{font-family:"'+font+'",sans-serif}'});
  await p.evaluate(()=>document.fonts.ready);
 }
}
async function setView(p,c){
 if(c.scale%10===0){await p.locator('#stageZoomReset').click();for(let i=0;i<(100-c.scale)/10;i++)await p.locator('#stageZoomOut').click();}
 else{
  let lo=650,hi=1250,found=false;const target=c.scale+20;
  for(let i=0;i<15&&lo<=hi;i++){const h=Math.round((lo+hi)/2);await p.setViewportSize({width:1180,height:h});await p.locator('#stageZoomFit').click();await settle(p);const n=parseInt(await p.locator('#stageZoomReset').textContent());if(n===target){found=true;break;}if(n<target)lo=h+1;else hi=h-1;}
  if(!found)throw Error('Requested fit percentage unavailable');await p.locator('#stageZoomOut').click();await p.locator('#stageZoomOut').click();
 }
 await p.setViewportSize({width:c.width,height:c.height});await settle(p);
}
async function geometry(p){return p.evaluate(()=>{
 const f=document.querySelector('#formSurface'),stage=f.getBoundingClientRect(),sx=stage.width/f.clientWidth,sy=stage.height/f.clientHeight,wrap=document.querySelector('.designer-wrap').getBoundingClientRect();
 const clip={left:Math.max(0,wrap.left),top:Math.max(0,wrap.top),right:Math.min(innerWidth,wrap.right),bottom:Math.min(innerHeight,wrap.bottom)};
 const bubbles=[...f.querySelectorAll('.sprite-bubble')].map(b=>{
  const css=getComputedStyle(b),heading=getComputedStyle(b,'::before'),t=b.querySelector('.sprite-bubble-text'),full=b.querySelector('[data-speech-full]'),tc=getComputedStyle(t),r=b.getBoundingClientRect(),tr=t.getBoundingClientRect(),range=new Range();range.selectNodeContents(t);
  const m=document.createElement('span');Object.assign(m.style,{position:'fixed',visibility:'hidden',whiteSpace:'pre',font:heading.font,letterSpacing:heading.letterSpacing});m.textContent=b.dataset.speaker;document.body.append(m);const unwrappedWidth=m.getBoundingClientRect().width*sx;m.remove();
  const left=r.left+((parseFloat(css.paddingLeft)||0)+(parseFloat(css.borderLeftWidth)||0))*sx,top=r.top+((parseFloat(css.paddingTop)||0)+(parseFloat(css.borderTopWidth)||0))*sy,width=parseFloat(heading.width)*sx,height=parseFloat(heading.height)*sy;
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=tc.font;const glyphs=[];let offset=0;
  if(tc.display!=='none')for(const char of t.textContent){const charRange=new Range();charRange.setStart(t.firstChild,offset);offset+=char.length;charRange.setEnd(t.firstChild,offset);const cr=charRange.getBoundingClientRect(),metrics=ctx.measureText(char),baseline=cr.top+metrics.fontBoundingBoxAscent*sy,l=cr.left-metrics.actualBoundingBoxLeft*sx,rr=cr.left+metrics.actualBoundingBoxRight*sx,tt=baseline-metrics.actualBoundingBoxAscent*sy,bb=baseline+metrics.actualBoundingBoxDescent*sy;glyphs.push({left:l,right:rr,top:tt,bottom:bb,width:rr-l,height:bb-tt});}
  return{speaker:b.dataset.speaker,text:t.textContent,id:b.dataset.runtimeId,rect:r.toJSON(),font:parseFloat(css.fontSize)*sx,fontFamily:css.fontFamily,layout:css.display,reserve:parseFloat(css.getPropertyValue('--speech-full-space'))||0,full:!full.hidden,fullBox:full.getBoundingClientRect().toJSON(),textBox:tr.toJSON(),range:range.getBoundingClientRect().toJSON(),scrollWidth:t.scrollWidth,clientWidth:t.clientWidth,scrollHeight:t.scrollHeight,clientHeight:t.clientHeight,glyphs,heading:{font:parseFloat(heading.fontSize)*sx,lineHeight:parseFloat(heading.lineHeight)*sy,minHeight:(parseFloat(heading.minHeight)||0)*sy,width,height,unwrappedWidth,rect:{left,top,right:left+width,bottom:top+height,width,height}}};
 });
 return{stage:stage.toJSON(),clip,bubbles,scale:parseInt(document.querySelector('#stageZoomReset').textContent),viewport:{width:innerWidth,height:innerHeight},level:document.querySelector('#uiLevel').value,mode:document.body.dataset.editorMode,scripts:Akari.app.project.scripts.map(s=>({name:Akari.app.project.components.find(c=>c.id===s.targetId)?.name,event:s.event,source:s.source}))};
});}
async function tabTo(p,selector){for(let i=0;i<100;i++){if(await p.locator(selector).evaluate(n=>n===document.activeElement))return;await p.keyboard.press('Tab');}throw Error('Keyboard cannot reach '+selector);}
async function dialog(p){return p.evaluate(()=>{
 const elem=selector=>{const n=document.querySelector(selector);return{rect:n.getBoundingClientRect().toJSON(),font:parseFloat(getComputedStyle(n).fontSize),scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight};},m=document.querySelector('#valueModal'),t=document.querySelector('#valueOutput'),r=new Range();r.selectNodeContents(t);getSelection().removeAllRanges();getSelection().addRange(r);
 return{title:document.querySelector('#valueTitle').textContent,text:t.textContent,selected:getSelection().toString(),labelledby:m.getAttribute('aria-labelledby'),titleBox:elem('#valueTitle'),bodyBox:elem('#valueOutput'),closeBox:elem('#valueClose'),dialog:m.querySelector('.dialog').getBoundingClientRect().toJSON(),viewport:{left:0,top:0,right:innerWidth,bottom:innerHeight}};
});}
try{await withBrowser(chrome,async browser=>{
 report.environment.browser=browser.version();
 for(const c of previewCases){
  const row={id:c.id,status:'RUNNING'};report.results.push(row);
  try{await pageFor(browser,product,async p=>{
   p.setDefaultTimeout(8000);p.on('dialog',d=>d.accept());p.on('pageerror',e=>report.pageErrors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url());});
   await p.setViewportSize({width:c.width,height:c.height});await prepare(p,c);await setView(p,c);
   await p.evaluate(()=>{window.previewEvents=[];new MutationObserver(rs=>{for(const r of rs)for(const[kind,nodes]of[['add',r.addedNodes],['remove',r.removedNodes]])for(const n of nodes)if(n.nodeType===1&&n.matches('.sprite-bubble'))previewEvents.push({kind,speaker:n.dataset.speaker,text:n.querySelector('.sprite-bubble-text').textContent,at:performance.now()});}).observe(document.querySelector('#formSurface'),{childList:true});});
   await p.locator('#runBtn').click();await p.waitForFunction(()=>document.querySelectorAll('.sprite-bubble').length===2);
   let g=await geometry(p),sceneInput='already-visible';
   // The 100% canvas can be larger than its existing scroll window. Reach the
   // bottom band with the normal wheel without changing the scale or speech time.
   if(c.scale===100){
    const visible=b=>b.rect.top>=g.clip.top-1&&b.rect.bottom<=g.clip.bottom+1;
    for(let i=0;i<3&&!g.bubbles.every(visible);i++){
     const x=(g.clip.left+g.clip.right)/2,y=(g.clip.top+g.clip.bottom)/2,target=g.bubbles.reduce((n,b)=>n+(b.rect.top+b.rect.bottom)/2,0)/g.bubbles.length;
     await p.mouse.move(x,y);await p.mouse.wheel(0,target-y);await settle(p);g=await geometry(p);sceneInput='pointer-wheel';
    }
   }
   const o={setup:'native new project, mascot and individual start-event inputs',interaction:'real pointer and keyboard',restored:!!c.restore,fontProfile:c.fullWidthFont?'full-width Japanese system font':'product default',sceneInput,...g};row.observed=o;row.screenshot=path.join(dir,c.id.replaceAll('/','-')+'.png');await p.screenshot({path:row.screenshot});
   if(c.kind==='short'){await p.waitForFunction(()=>document.querySelectorAll('.sprite-bubble').length===0,null,{timeout:4000});o.events=await p.evaluate(()=>previewEvents);}
   else{
    o.readingFixtureSeconds=10;o.openings=[];
    for(const [i,b]of o.bubbles.entries()){
     const selector='.sprite-bubble[data-runtime-id="'+b.id+'"] [data-speech-full]',input=i===0?'pointer':'keyboard';
     if(input==='pointer')await p.locator(selector).click();else{await tabTo(p,selector);await p.keyboard.press('Enter');}
     await p.locator('#valueModal.show').waitFor();const d={input,...await dialog(p)};await p.screenshot({path:path.join(dir,c.id.replaceAll('/','-')+'-'+i+'.png')});
     if(i===0)await p.locator('#valueClose').click();else{await tabTo(p,'#valueClose');await p.keyboard.press('Enter');}
     d.closeInput=input;d.closed=!(await p.locator('#valueModal').isVisible());o.openings.push(d);
    }
   }
   verifyPreviewObserved(c.id,o);await p.locator('#stopBtn').click();
  });row.status='PASS';}catch(e){row.status='FAIL';row.error=e.stack;}
  save();console.log(row.status+' '+c.id);
 }
},180000);}catch(e){report.hostFailure=e.stack;}
report.endSnapshot=snapshot(product);report.status=!report.hostFailure&&report.results.length===previewCases.length&&report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';
if(report.status==='PASS')try{verifyPreviewReport(report,inputs);}catch(e){report.status='FAIL';report.hostFailure=e.stack;}
save();if(report.status!=='PASS')process.exitCode=1;
