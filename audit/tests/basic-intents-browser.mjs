import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {browserEnvironment} from '../lib/browser-environment.mjs';
const require=createRequire(import.meta.url),[chrome,out]=process.argv.slice(2),output=path.resolve(out),product=currentProductFile(),dir=output.replace(/\.json$/,'')+'.artifacts',fixture=JSON.parse(fs.readFileSync('audit/fixtures/basic-intents.json'));
const report={schema:'akari-basic-intents-browser-v1',status:'RUNNING',snapshot:snapshot(product),uxAcceptance:false,environment:{browser:null,playwright:require('playwright/package.json').version},pageErrors:[],networkRequests:[],results:[]};fs.mkdirSync(dir,{recursive:true});const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
try{await withBrowser(chrome,async browser=>{
 report.environment.browser=browser.version();assert.equal(browser.version(),browserEnvironment.version);assert.equal(report.environment.playwright,browserEnvironment.playwright);
 for(const draft of fixture.cases){const row={id:draft.id,status:'RUNNING'};report.results.push(row);try{row.observed=await pageFor(browser,product,async page=>{
  page.setDefaultTimeout(8000);await page.setViewportSize({width:1366,height:768});page.on('dialog',d=>d.accept());page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url());});
  try{
   const file=await page.evaluate(()=>{const p=Akari.makeEmptyProject(),actor=p.components[0];Object.assign(actor,{x:100,y:100,direction:0});const star=structuredClone(actor);Object.assign(star,{id:'basic-star',name:'星',x:200});star.localData={variables:[],lists:[]};star.costumes=[{id:'basic-star-costume',name:'星',kind:'text',value:'⭐'}];star.costumeId='basic-star-costume';p.components.push(star);p.name='基本原作文';p.scripts=[{id:'basic-body',targetId:'sprite-1',event:'start',source:''}];return Akari.serializeProject(p,Akari.makeDefaultAssetStore());});
   await page.locator('#fileInput').setInputFiles({name:'basic.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});await page.waitForFunction(()=>Akari.app.project.name==='基本原作文');await page.locator('#uiLevel').selectOption('advanced');if(await page.locator('#sourceOverview').isVisible())await page.locator('#sourceEditBtn').click();await page.locator('#editorModecode').click();await page.locator('#codeEditor').fill(draft.source);await page.waitForFunction(s=>Akari.app.editorState.main.sourceText===s,draft.source);
   for(let i=0;i<3;i++){await page.locator('#editorModeblocks').click();assert.equal(await page.locator('#editorModeblocks').getAttribute('aria-pressed'),'true');await page.locator('#editorModecode').click();assert.equal(await page.locator('#codeEditor').inputValue(),draft.source);}
   assert.deepEqual(await page.evaluate(()=>Akari.app.compile().errors),[]);const actor=page.locator('#formSurface .component[data-id="sprite-1"]'),read=()=>actor.evaluate(e=>({x:parseFloat(e.style.left),y:parseFloat(e.style.top),visible:e.style.display!=='none',time:performance.now()}));
   const waitPosition=(axis,value)=>page.waitForFunction(({axis,value})=>Math.abs(parseFloat(document.querySelector('#formSurface .component[data-id="sprite-1"]').style[axis==='x'?'left':'top'])-value)<.01,{axis,value});
   await page.locator('#runBtn').click();let detail={};
   if(draft.id==='T01'){
    assert.equal((await read()).x,100);const box=await actor.boundingBox();await page.mouse.move(box.x+box.width/4,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(200);assert.equal((await read()).x,100);await page.mouse.up();await waitPosition('x',130);assert.equal(await page.locator('.sprite-bubble-text').textContent(),'今日はどこへ行こう');const moved=await actor.boundingBox(),point={x:moved.x+moved.width/4,y:moved.y+moved.height/2};assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.closest('.component')?.dataset.id,point),'sprite-1');await page.mouse.click(point.x,point.y);await waitPosition('x',160);assert.equal((await read()).y,100);detail={beforeClick:100,afterClicks:[130,160],holdIdle:true,speech:'今日はどこへ行こう'};
   }
   if(draft.id==='T02'){
    await page.locator('#formSurface').focus();await page.keyboard.down('Space');await waitPosition('y',76);await waitPosition('y',100);await page.keyboard.down('Space');await page.waitForTimeout(150);assert.equal((await read()).y,100);await page.keyboard.up('Space');await page.keyboard.down('Space');await waitPosition('y',76);await waitPosition('y',100);await page.keyboard.up('Space');assert.equal((await read()).x,100);detail={jumpY:76,returnY:100,repeatedDownIdle:true,secondPress:true};
   }
   if(draft.id==='T03'||draft.id==='T13'){
     const rate=draft.id==='T03'?30:20;await page.locator('#formSurface').focus();assert.equal((await read()).x,100);const before=await read();await page.keyboard.down('ArrowRight');await page.waitForTimeout(1050);await page.keyboard.up('ArrowRight');
     // The release is native input; let its queued final render reach the DOM
     // before measuring the unchanged position over the subsequent 300 ms.
     await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
     const after=await read(),elapsed=(after.time-before.time)/1000,distance=after.x-before.x;assert.ok(Math.abs(distance-rate*elapsed)<=6);assert.equal(after.y,100);await page.waitForTimeout(300);assert.ok(Math.abs((await read()).x-after.x)<.01);detail={rate,elapsed,distance,stopped:true};
   }
   if(draft.id==='T04'){
    await waitPosition('x',120);assert.equal(await page.locator('#formSurface .component[data-id="basic-star"]').evaluate(e=>parseFloat(e.style.left)),185);assert.equal(await page.locator('.sprite-bubble[data-runtime-id="sprite-1"] .sprite-bubble-text').textContent(),'先に行くね');assert.equal(await page.locator('.sprite-bubble[data-runtime-id="basic-star"] .sprite-bubble-text').textContent(),'ついていくよ');detail={actorX:120,starX:185,speeches:['先に行くね','ついていくよ']};
   }
   if(draft.id==='T05'){
    await page.waitForFunction(()=>document.querySelector('#formSurface .component[data-id="sprite-1"]').style.display==='none');assert.equal(await page.locator('.sprite-bubble').count(),0);await page.waitForFunction(()=>document.querySelector('#formSurface .component[data-id="sprite-1"]').style.display!=='none');assert.equal(await page.locator('.sprite-bubble-text').textContent(),'ただいま');detail={hiddenFirst:true,visibleAfterWait:true,speech:'ただいま'};
   }
   if(draft.id==='T06'){
    const pos=await read();assert.ok(Math.abs(pos.x-100)<.01&&Math.abs(pos.y-100)<.01);const ink=await page.locator('#penCanvas').evaluate(e=>{const d=e.getContext('2d').getImageData(0,0,e.width,e.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n;});assert.ok(ink>=60);detail={closedSquare:true,ink};
   }
   await page.screenshot({path:path.join(dir,draft.id+'.png')});await page.locator('#stopBtn').click();assert.equal(await page.evaluate(()=>Akari.app.project.components[0].x),100);assert.equal(await page.evaluate(()=>Akari.app.project.components[0].direction),0);
    const pending=page.waitForEvent('download');await page.locator('#saveBtn').click();const download=await pending,saved=path.join(dir,draft.id+'.akari.md');await download.saveAs(saved);const sources=await page.evaluate(t=>Akari.parseProjectFile(t).then(r=>r.project.scripts.filter(s=>s.source.trim()).map(s=>s.source)),fs.readFileSync(saved,'utf8'));assert.deepEqual(sources,[draft.source]);await page.locator('#newBtn').click();await page.waitForFunction(()=>Akari.app.project.scripts.every(s=>!s.source.trim()));await page.locator('#fileInput').setInputFiles(saved);await page.waitForFunction(s=>document.querySelector('#fileInput').value===''&&Akari.app.project.scripts.some(t=>t.source===s),draft.source);assert.equal(await page.evaluate(()=>Akari.app.project.scripts.find(s=>s.source.trim()).source),draft.source);
   return{source:draft.source,inputHash:draft.sourceSha256,roundtrips:3,designUnchanged:true,savedAndReadBack:true,detail};
  }catch(error){await page.screenshot({path:path.join(dir,draft.id+'-failure.png')}).catch(()=>{});throw error;}
 });row.status='PASS';}catch(error){row.status='FAIL';row.error=error.stack;}save();console.log(row.status+' '+draft.id);}
},180000);}catch(error){report.hostFailure=error.stack;}
report.status=!report.hostFailure&&!report.pageErrors.length&&!report.networkRequests.length&&report.results.length===7&&report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';save();if(report.status!=='PASS')process.exitCode=1;
