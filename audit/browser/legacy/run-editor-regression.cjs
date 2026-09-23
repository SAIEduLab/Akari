const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');
const {pathToFileURL} = require('url');
const {chromium} = require('playwright');

async function main() {
  const root=path.resolve(__dirname,'..');
  const sourceFile=process.argv[2] ? path.resolve(process.argv[2]) : path.join(root,'Akari.html');
  const bytes=fs.readFileSync(sourceFile), hash=crypto.createHash('sha256').update(bytes).digest('hex');
  const outputDir=process.argv[3]?path.resolve(process.argv[3]):__dirname;fs.mkdirSync(outputDir,{recursive:true});
  const file=path.join(outputDir,'editor-regression.html');
  fs.writeFileSync(file,bytes);
  const browser=await chromium.launch({executablePath:(process.env.AKARI_BROWSER||undefined),headless:true,args:['--allow-file-access-from-files']});
  const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
  const pageErrors=[], networkRequests=[],results=[];
  const report={sourceFile,htmlSha256:hash,htmlBytes:bytes.length,node:process.version,browser:browser.version(),results,pageErrors,networkRequests};
  context.on('page', p=>{p.on('pageerror',e=>pageErrors.push(e.message));p.on('dialog',dialog=>dialog.type()==='beforeunload'?dialog.accept():dialog.accept());});
  await context.route(/^https?:\/\//,route=>{networkRequests.push(route.request().url());return route.abort();});
  const page=await context.newPage();
  page.setDefaultTimeout(15000);
  const test=async(id,fn)=>{try{const evidence=await fn();results.push({id,pass:true,evidence});console.log('PASS '+id);}catch(e){results.push({id,pass:false,error:e.stack});console.log('FAIL '+id+': '+e.message);throw e;}};
  const currentSource=()=>page.evaluate(()=>{const A=globalThis.Akari||globalThis.Akari08;return A.app.project.scripts.find(s=>s.targetId==='stage'&&s.event==='start')?.source||'';});
  const compileErrors=()=>page.evaluate(()=>(globalThis.Akari||globalThis.Akari08).app.compile().errors);
  const waitForConsoleAppend=async(before,needle)=>page.waitForFunction(({before,needle})=>{const text=document.querySelector('#console')?.textContent||'';const count=(value,part)=>part?value.split(part).length-1:0;return count(text,needle)>count(before||'',needle);},{before,needle});
  const waitHistory=()=>page.waitForTimeout(350);
  const score=()=>page.locator('#runtimeMonitor .monitor-row').filter({has:page.locator('.monitor-key',{hasText:/^点数$/})}).locator('.monitor-value');
  let source,formatted,projectBeforeSave;
  try {
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(()=>!!(globalThis.Akari||globalThis.Akari08)?.app);
    await test('editor-input-format-comments-undo-redo',async()=>{
      source='※ はじめの注釈\n点数を0にする ※ 初期値\n次のことを3回くり返す ※ 反復\n  点数に1を足す ※ 加算\n「回帰」と言う';
      await (await reveal09(page.locator('#codeEditor'))).fill(source);await waitHistory();
      assert.equal(await currentSource(),source);assert.deepEqual(await compileErrors(),[]);
      await (await reveal09(page.locator('#formatBtn'))).click();await waitHistory();formatted=await page.locator('#codeEditor').inputValue();
      assert.notEqual(formatted,source);assert.equal(await currentSource(),formatted);
      for(const c of ['はじめの注釈','初期値','反復','加算'])assert.ok(formatted.includes('※ '+c),'comment retained: '+c);
      assert.deepEqual(await compileErrors(),[]);
      await (await reveal09(page.locator('#undoBtn'))).click();assert.equal(await page.locator('#codeEditor').inputValue(),source);assert.equal(await currentSource(),source);
      await (await reveal09(page.locator('#redoBtn'))).click();assert.equal(await page.locator('#codeEditor').inputValue(),formatted);assert.equal(await currentSource(),formatted);
      return {input:source,formatted,undoExact:true,redoExact:true};
    });
    await test('diagnose-run-stop',async()=>{
      await (await reveal09(page.locator('#diagnoseBtn'))).click();await page.locator('#diagnosisModal.show').waitFor();const diagnosis=await page.locator('#diagnosisBody').innerText();assert.match(diagnosis,/作品は実行できます/);await (await reveal09(page.locator('#diagnosisClose'))).click();
      await (await reveal09(page.locator('#runBtn'))).click();await page.waitForFunction(()=>document.querySelector('#runState').textContent==='実行中');
      await score().filter({hasText:/^3$/}).waitFor();assert.equal(await page.locator('#codeEditor').getAttribute('readonly'),'');
      await (await reveal09(page.locator('#stopBtn'))).click();await page.waitForFunction(()=>document.querySelector('#runState').textContent==='停止中');assert.equal(await page.locator('#codeEditor').inputValue(),formatted);
      return {diagnosis,runtimeScore:3,stopState:'停止中',sourcePreserved:true};
    });
    await test('callable-draft-save-action-function-run',async()=>{
      await (await reveal09(page.locator('#procBtn'))).click();await (await reveal09(page.locator('#callableNewAction'))).click();await (await reveal09(page.locator('#callableName'))).fill('増加');await (await reveal09(page.locator('#callableArgs'))).fill('値');await (await reveal09(page.locator('#callableCode'))).fill('点数に値を足す。');
      assert.equal(await page.evaluate(()=>(globalThis.Akari||globalThis.Akari08).app.project.actions.length),0);
      await (await reveal09(page.locator('#callableSave'))).click();
      assert.equal(await page.evaluate(()=>(globalThis.Akari||globalThis.Akari08).app.project.actions[0]?.source),'点数に値を足す。');
      await (await reveal09(page.locator('#callableNewFunction'))).click();await (await reveal09(page.locator('#callableName'))).fill('二倍');await (await reveal09(page.locator('#callableArgs'))).fill('元値');await (await reveal09(page.locator('#callableCode'))).fill('元値×2を返す。');
      assert.equal(await page.evaluate(()=>(globalThis.Akari||globalThis.Akari08).app.project.functions.length),0);
      await (await reveal09(page.locator('#callableSave'))).click();await (await reveal09(page.locator('#procClose'))).click();
      source='点数を0にする。\n増加（3）を実行する。\n点数を二倍（点数）にする。\nつなぐ（「検証完了：」、点数）と言う。';
      await (await reveal09(page.locator('#codeEditor'))).fill(source);await waitHistory();assert.deepEqual(await compileErrors(),[]);
      await (await reveal09(page.locator('#runBtn'))).click();await page.waitForFunction(()=>document.querySelector('#runState').textContent==='実行中');await score().filter({hasText:/^6$/}).waitFor();
      await (await reveal09(page.locator('#stopBtn'))).click();assert.equal(await currentSource(),source);
      return {draftsUnregisteredUntilSave:true,action:'増加（値）',function:'二倍（元値）',runtimeScore:6};
    });
    await test('responsive-controls-resize-preservation',async()=>{
      const original=await page.evaluate(()=>{const t=document.querySelector('#codeEditor');t.focus();t.setSelectionRange(3,12);const A=globalThis.Akari||globalThis.Akari08;return{source:t.value,start:t.selectionStart,end:t.selectionEnd,project:JSON.stringify(A.app.project),object:document.querySelector('#objectSelect').value,event:document.querySelector('#eventSelect').value};});
      const dimensions=[];
      for(const [width,height]of [[390,844],[320,568],[1440,900]]){
        await page.setViewportSize({width,height});await page.waitForTimeout(100);
        const resized=await page.evaluate(()=>{const t=document.querySelector('#codeEditor'),A=globalThis.Akari||globalThis.Akari08;return{source:t.value,start:t.selectionStart,end:t.selectionEnd,project:JSON.stringify(A.app.project),object:document.querySelector('#objectSelect').value,event:document.querySelector('#eventSelect').value};});
        assert.deepEqual(resized,original);
        const dimension=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.ok(dimension.scrollWidth<=width+1,JSON.stringify(dimension));dimensions.push(dimension);
        await page.screenshot({path:path.join(outputDir,`editor-${width}.png`),fullPage:true});
      }
      for(const [width,height]of [[1440,900],[390,844],[320,568]]){
        await page.setViewportSize({width,height});await (await reveal09(page.locator('#diagnoseBtn'))).click();await page.locator('#diagnosisModal.show').waitFor();assert.match(await page.locator('#diagnosisBody').innerText(),/作品は実行できます/);await (await reveal09(page.locator('#diagnosisClose'))).click();
        await (await reveal09(page.locator('#procBtn'))).click();await page.locator('#procModal.show').waitFor();await (await reveal09(page.locator('#callableSelect'))).selectOption({label:'計算：二倍'});assert.equal(await page.locator('#callableCode').inputValue(),'元値×2を返す。');await (await reveal09(page.locator('#procClose'))).click();
      }
      await page.setViewportSize({width:1440,height:900});
      return {resizeSequence:[1440,390,320,1440],exactSourceSelectionProjectRetained:true,dimensions,diagnosisAndCallableControlsExercised:[1440,390,320]};
    });
    await test('save-download-new-open-exact-project',async()=>{
      projectBeforeSave=await page.evaluate(()=>JSON.parse(JSON.stringify((globalThis.Akari||globalThis.Akari08).app.project)));
      const downloadEvent=page.waitForEvent('download');await (await reveal09(page.locator('#saveBtn'))).click();const download=await downloadEvent;
      const saved=path.join(outputDir,'editor-saved.akari.md');await download.saveAs(saved);assert.ok(fs.statSync(saved).size>0);
      await (await reveal09(page.locator('#newBtn'))).click();assert.equal(await page.evaluate(()=>(globalThis.Akari||globalThis.Akari08).app.project.actions.length),0);
      const openConsole=await page.locator('#console').textContent();await page.locator('#fileInput').setInputFiles(saved);
      await waitForConsoleAppend(openConsole,'作品を開きました');
      const opened=await page.evaluate(()=>JSON.parse(JSON.stringify((globalThis.Akari||globalThis.Akari08).app.project)));assert.deepEqual(opened,projectBeforeSave);assert.equal(await currentSource(),source);assert.deepEqual(await compileErrors(),[]);
      return {downloadName:download.suggestedFilename(),savedBytes:fs.statSync(saved).size,reopenedProjectExactlyEqual:true};
    });
    await test('standalone-download-offline-player-run',async()=>{
      const downloadEvent=page.waitForEvent('download');await (await reveal09(page.locator('#exportBtn'))).click();const download=await downloadEvent;
      const exported=path.join(outputDir,'editor-standalone.html');await download.saveAs(exported);
      const text=fs.readFileSync(exported,'utf8');assert.ok(text.includes('SPDX-License-Identifier: Apache-2.0'));assert.ok(text.includes('Apache License'));
      const player=await context.newPage();await player.goto(pathToFileURL(exported).href);await player.waitForFunction(()=>!document.querySelector('#playerStart').disabled);await (await reveal09(player.locator('#playerStart'))).click();
      await player.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('検証完了：6')||document.querySelector('#formSurface').textContent.includes('検証完了：6'));
      const output=await player.locator('#playerOutput').textContent(),stage=await player.locator('#formSurface').textContent();await (await reveal09(player.locator('#playerStop'))).click();
      assert.equal(await player.locator('#playerStop').isDisabled(),true);
      await player.close();return {downloadName:download.suggestedFilename(),bytes:fs.statSync(exported).size,licenseRetained:true,output,stage,stopped:true};
    });
    assert.deepEqual(pageErrors,[]);assert.deepEqual(networkRequests,[]);
  } finally {
    report.passed=results.filter(r=>r.pass).length;report.failed=results.filter(r=>!r.pass).length;
    fs.writeFileSync(path.join(outputDir,'editor-regression-result.json'),JSON.stringify(report,null,2));
    await browser.close();console.log(JSON.stringify({htmlSha256:hash,passed:report.passed,failed:report.failed,pageErrors,networkRequests}));
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});


async function reveal09(locator){
 if(await locator.count()===1){if(!await locator.isVisible())for(const panel of await locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())await panel.locator('.blockui-side-toggle').click();const ancestors=locator.locator(await locator.evaluate(e=>e.tagName==='SUMMARY')?'xpath=parent::details/ancestor::details[not(@open)]':'xpath=ancestor::details[not(@open)]');for(const detail of await ancestors.all())await detail.locator(':scope > summary').click();}
 return locator;
}
