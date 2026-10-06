import {installGreetingFixture} from '../lib/gate-ui-fixture.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {browserEnvironment} from '../lib/browser-environment.mjs';
const require=createRequire(import.meta.url),[chrome,outputArg]=process.argv.slice(2),output=path.resolve(outputArg),product=currentProductFile(),dir=output.replace(/\.json$/,'')+'.artifacts';
const report={schema:'akari-ux-surface-browser-v1',status:'RUNNING',snapshot:snapshot(product),uxAcceptance:false,environment:{browser:null,playwright:require('playwright/package.json').version},pageErrors:[],networkRequests:[],results:[]};
fs.mkdirSync(dir,{recursive:true});const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
try{await withBrowser(chrome,async browser=>{
 report.environment.browser=browser.version();assert.equal(browser.version(),browserEnvironment.version);assert.equal(report.environment.playwright,browserEnvironment.playwright);
 const run=async(id,fn)=>{const row={id,status:'RUNNING'};report.results.push(row);try{row.observed=await pageFor(browser,product,async page=>{page.setDefaultTimeout(8000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url());});try{return await fn(page);}catch(error){await page.screenshot({path:path.join(dir,id.replaceAll('/','-')+'.png')}).catch(()=>{});throw error;}});row.status='PASS';}catch(error){row.status='FAIL';row.error=error.stack;}save();console.log(row.status+' '+id);};
 const edit=async page=>{await page.locator('#uiLevel').selectOption('advanced');if(await page.locator('#sourceOverview').isVisible())await page.locator('#sourceEditBtn').click();};
 await run('ux/browser-empty-sample-click',async page=>{
  await page.setViewportSize({width:1366,height:768});await edit(page);assert.equal(await page.evaluate(()=>Akari.app.project.scripts.every(s=>!s.source.trim())),true);assert.match(await page.locator('#blockEditor .blockui-empty').first().textContent(),/対象とできごと/);
  const actor=page.locator('#formSurface .component[data-id="sprite-1"]'),left=()=>actor.evaluate(e=>parseFloat(e.style.left)),initial=await left();await page.locator('#runBtn').click();assert.equal(await left(),initial);assert.equal(await page.locator('.sprite-bubble').count(),0);if(await page.locator('#stopBtn').isEnabled())await page.locator('#stopBtn').click();
  await page.locator('#eventSelect').selectOption('click');await page.locator('#editorModecode').click();await page.locator('#codeEditor').fill('マスコットは画面の右へ30歩動く。');await page.locator('#runBtn').click();assert.equal(await left(),initial);await actor.click();await page.waitForFunction(x=>parseFloat(document.querySelector('#formSurface .component[data-id="sprite-1"]').style.left)===x,initial+30);await actor.click();await page.waitForFunction(x=>parseFloat(document.querySelector('#formSurface .component[data-id="sprite-1"]').style.left)===x,initial+60);await page.locator('#stopBtn').click();
  await page.locator('#sampleBtn').click();await page.locator('#sampleConfirmYes').click();assert.equal(await page.evaluate(()=>Akari.app.project.name),'マスコットとだんごのダンス');
  // Preserve the original empty/click/remove/undo guarantees with their explicit greeting fixture.
  await installGreetingFixture(page);const sample=await page.evaluate(()=>Akari.app.project.scripts[0].source);await page.getByRole('button',{name:'すべてのコード',exact:true}).click();assert.match(await page.locator('#sourceOverview').textContent(),/こんにちは/);await page.locator('#sourceEditBtn').click();await page.locator('#editorModeblocks').click();
  for(const schema of ['Say','MotionCommand:MOVE_DIRECTION']){const node=page.locator('#blockEditor .blockui-node[data-schema-id="'+schema+'"]').first();await node.locator(':scope > .blockui-node-head .blockui-actions > summary').click();await node.locator('[data-blockui-action="remove"]').first().click();}
  assert.equal(await page.locator('#blockEditor .blockui-node[data-schema-id="Say"],#blockEditor .blockui-node[data-schema-id="MotionCommand:MOVE_DIRECTION"]').count(),0);await page.locator('#undoBtn').click();await page.locator('#undoBtn').click();assert.equal(await page.evaluate(()=>Akari.app.project.scripts[0].source),sample);
  await page.locator('#newBtn').click();assert.equal(await page.evaluate(()=>Akari.app.project.scripts.every(s=>!s.source.trim())),true);return{emptyStartup:true,emptyRunIdle:true,clickDistances:[30,60],explicitSample:true,removeUndo:true,emptyNew:true};
 });
 for(const [width,mode]of [[1366,'fit'],[1366,'100'],[390,'fit']])await run('ux/browser-bubble-'+width+'-'+mode,async page=>{
  const height=width===390?844:768;await page.setViewportSize({width,height});const long='あいうえおの言葉'.repeat(55)+'\n  「全文」🐈';
  const file=await page.evaluate(long=>{const p=Akari.makeEmptyProject();p.name='吹出しの配置';p.scripts=[{id:'bubble-click',targetId:'sprite-1',event:'click',source:Akari.formatExpression({kind:'StringLiteral',value:long})+'と言う。'}];return Akari.serializeProject(p,Akari.makeDefaultAssetStore());},long);
  await page.locator('#fileInput').setInputFiles({name:'bubble.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});await page.waitForFunction(()=>Akari.app.project.name==='吹出しの配置');await edit(page);if(mode==='100')await page.locator('#stageZoomReset').click();else await page.locator('#stageZoomFit').click();
  await page.locator('#runBtn').click();await page.locator('#formSurface .component[data-id="sprite-1"]').click();const bubble=page.locator('.sprite-bubble');await bubble.waitFor();
  const metrics=await bubble.evaluate(b=>{const f=document.querySelector('#formSurface'),a=f.querySelector('.component[data-id="sprite-1"]'),r=b.getBoundingClientRect(),s=f.getBoundingClientRect(),v=a.getBoundingClientRect(),scale=s.width/f.clientWidth;return{scale,font:parseFloat(getComputedStyle(b).fontSize)*scale,inside:r.left>=s.left-1&&r.right<=s.right+1&&r.top>=s.top-1&&r.bottom<=s.bottom+1,overlap:Math.max(0,Math.min(r.right,v.right)-Math.max(r.left,v.left))*Math.max(0,Math.min(r.bottom,v.bottom)-Math.max(r.top,v.top))};});
  assert.ok(metrics.inside);assert.ok(metrics.overlap<1);assert.ok(metrics.font>=13.5);if(mode==='100')assert.ok(Math.abs(metrics.scale-1)<0.02);else if(width===1366)assert.ok(metrics.scale>=0.39&&metrics.scale<=0.43);
  await bubble.getByRole('button',{name:'吹出しの全文を見る',exact:true}).click();assert.equal(await page.locator('#valueOutput').textContent(),long);await page.locator('#valueClose').click();return{width,height,mode,...metrics,fullTextExact:true};
 });
 const manuals=['MANUAL.html','Manual/block-mode.html','Manual/code-mode-beginner.html','Manual/code-mode-intermediate.html','Manual/code-mode-advanced.html'];
 for(const width of [1366,1024,390])for(const theme of ['light','dark'])await run('ux/browser-manual-'+width+'-'+theme,async page=>{
  const height=width===390?844:768;await page.setViewportSize({width,height});await page.emulateMedia({colorScheme:theme});const views=[];
  for(const file of manuals){await page.goto(pathToFileURL(path.resolve(file)).href);const p=page.locator('#code-ownership p').first();await p.hover();await p.click({clickCount:3});
   const metrics=await page.evaluate(()=>{const panel=document.querySelector('#code-ownership'),rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number),lum=s=>rgb(s).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0),ratio=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);},bg=getComputedStyle(panel).backgroundColor;
    const p=panel.querySelector('p'),sel=getComputedStyle(p,'::selection');return{body:Math.min(...[...panel.querySelectorAll('p')].map(e=>ratio(getComputedStyle(e).color,bg))),heading:ratio(getComputedStyle(panel.querySelector('h2')).color,bg),selection:ratio(sel.color,sel.backgroundColor),selected:!!getSelection().toString(),overflow:document.documentElement.scrollWidth>innerWidth+1};});
   assert.ok(metrics.body>=4.5);assert.ok(metrics.heading>=3);assert.ok(metrics.selection>=4.5);assert.equal(metrics.selected,true);assert.equal(metrics.overflow,false);views.push({file,...metrics});if(file==='MANUAL.html')await page.screenshot({path:path.join(dir,'manual-'+width+'-'+theme+'.png')});
  }return{width,height,theme,views,hoverAndSelection:true};
 });
},240000);}catch(error){report.hostFailure=error.stack;}
report.status=!report.hostFailure&&!report.pageErrors.length&&!report.networkRequests.length&&report.results.length===10&&report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';save();if(report.status!=='PASS')process.exitCode=1;
