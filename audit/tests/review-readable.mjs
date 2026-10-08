import {installGreetingFixture} from '../lib/gate-ui-fixture.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {withBrowser,snapshot} from '../lib/product-test-host.mjs';
import {verifyReviewReport} from '../lib/review-regression-contract.mjs';

const [browserPath,productArg,outputArg]=process.argv.slice(2);
assert.ok(browserPath&&productArg&&outputArg,
  'usage: node audit/tests/review-readable.mjs <browser> <product> <output-json>');
const product=path.resolve(productArg),output=path.resolve(outputArg);
assert.ok(fs.existsSync(product),'product exists');
assert.ok(!fs.existsSync(output),'evidence output does not already exist');
fs.mkdirSync(path.dirname(output),{recursive:true});
const initialSnapshot=snapshot(product),pageErrors=[],networkRequests=[],results=[];
const evidenceDir=path.join(path.dirname(output),'review-readable-images');
fs.mkdirSync(evidenceDir,{recursive:true});
const viewports=[{width:1440,height:900},{width:768,height:1024},{width:390,height:844}];
const levels=['basic','advanced'];

async function openPage(browser,viewport,level='basic'){
  const context=await browser.newContext({offline:true,viewport});
  await context.route(/^https?:/,route=>{networkRequests.push(route.request().url());return route.abort();});
  const page=await context.newPage();
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.setDefaultTimeout(8000);
  await page.goto(pathToFileURL(product).href);
  await page.waitForFunction(()=>!!globalThis.Akari?.app);
  await installGreetingFixture(page);
  await page.locator('#uiLevel').selectOption(level);
  return {page,context};
}

async function captureRuntime(page,viewport,level,editorMode){
  if(editorMode==='code') await page.locator('#editorModecode').click();
  await page.locator('#runBtn').click();
  await page.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');
  await page.waitForFunction(()=>document.querySelector('#formSurface .sprite-bubble'));
  // Advanced mode keeps its normal monitor/editor layout. On a narrow screen the
  // stage can be farther down that existing scroll view, so reveal it as a user
  // would without replacing the surrounding controls.
  if(level==='advanced') await page.locator('#formFrame').evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest'}));
  await page.waitForFunction(()=>{
    const wrap=document.querySelector('.designer-wrap'),frame=document.querySelector('#formFrame');
    const scale=parseFloat(getComputedStyle(wrap).getPropertyValue('--stage-scale'));
    return Number.isFinite(scale)&&scale>0&&Math.abs(frame.getBoundingClientRect().width-(640*scale+6))<8;
  });
  const measure=await page.evaluate(()=>{
    const rect=e=>{const r=e?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}:null;};
    const bubble=document.querySelector('#formSurface .sprite-bubble');
    const frame=document.querySelector('#formFrame'),stage=document.querySelector('#formSurface');
    const style=bubble?getComputedStyle(bubble):null;
    const scale=parseFloat(getComputedStyle(document.querySelector('.designer-wrap')).getPropertyValue('--stage-scale'))||1;
    return {
      viewport:{width:innerWidth,height:innerHeight},uiLevel:document.querySelector('#uiLevel').value,
      editorMode:document.body.dataset.editorMode,stageScale:scale,
      stage:rect(frame),surface:rect(stage),bubble:bubble?{text:bubble.textContent,rect:rect(bubble),cssFont:style.fontSize,
        renderedFontPx:parseFloat(style.fontSize)*scale,lineHeight:style.lineHeight}:null,
      codePane:{display:getComputedStyle(document.querySelector('.codewin')).display,rect:rect(document.querySelector('.codewin'))},
      toolbox:{display:getComputedStyle(document.querySelector('.toolbox')).display},
      designer:{display:getComputedStyle(document.querySelector('#designerWindow')).display},
      zoom:document.querySelector('#stageZoomReset')?.textContent,
      scroll:{x:scrollX,y:scrollY,documentHeight:document.documentElement.scrollHeight},
      controls:{stopVisible:!!document.querySelector('#stopBtn')&&getComputedStyle(document.querySelector('#stopBtn')).display!=='none',
        pauseVisible:!!document.querySelector('#pauseBtn')&&getComputedStyle(document.querySelector('#pauseBtn')).display!=='none'},
    };
  });
  const image=`stage-${level}-${viewport.width}.png`;
  await page.screenshot({path:path.join(evidenceDir,image),fullPage:true});
  return {...measure,screenshot:image};
}

async function stageSpeechReview(browser){
  const observations=[];
  for(const viewport of viewports) for(const level of levels){
    const {page,context}=await openPage(browser,viewport,level);
    try{
      const info=await captureRuntime(page,viewport,level,'blocks');
      const stage=info.stage,bubble=info.bubble;
      assert.ok(stage&&stage.width>=(level==='basic'?Math.min(viewport.width*.5,320):140),
        level==='basic'?'basic runtime stage occupies a useful share of the screen':'advanced runtime retains a usable stage within its monitoring layout');
      assert.ok(stage.y<viewport.height&&stage.bottom>0,'stage is available in the viewport');
      assert.ok(bubble&&bubble.text.trim(),'sample produces visible speech');
      assert.ok(bubble.renderedFontPx>=13,'speech text is at least 13 rendered CSS pixels');
      assert.ok(info.controls.stopVisible,'stop remains available during the run');
      if(level==='advanced'){
        assert.notEqual(info.codePane.display,'none','advanced mode retains its code/monitor pane');
        assert.ok(info.controls.pauseVisible,'advanced mode retains pause/continue controls');
        await page.locator('#pauseBtn').click();
        await page.waitForFunction(()=>Akari.app.editorState.state==='PAUSED');
        await page.locator('#continueBtn').click();
        await page.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');
      }
      await page.locator('#stopBtn').click();
      await page.waitForFunction(()=>Akari.app.editorState.state==='DESIGN');
      assert.equal(await page.locator('#uiLevel').inputValue(),level,'stop returns to the same detail level');
      if(level==='advanced')
        assert.notEqual(await page.locator('.codewin').evaluate(e=>getComputedStyle(e).display),'none','advanced editor/monitor returns after stop');
      observations.push({...info,stopReturnsToEditor:true,pauseResume:level==='advanced'});
      await context.close();
    }catch(error){await context.close();throw Error(`${level} ${viewport.width}x${viewport.height}: ${error.message}`);}
  }
  const {page,context}=await openPage(browser,{width:1440,height:900},'basic');
  let transition;
  try{
    await page.locator('#runBtn').click();
    await page.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');
    await page.locator('#runtimeInspectBtn').click();await page.locator('#runtimeInspector[open]').waitFor();
    await page.locator('#editorModecode').click();
    await page.waitForFunction(()=>document.body.dataset.editorMode==='code'&&getComputedStyle(document.querySelector('.codewin')).display!=='none');
    assert.ok(await page.locator('#codeEditor').isVisible(),'basic runtime can switch to its existing code view');
    await page.locator('#uiLevel').selectOption('advanced');
    assert.equal(await page.locator('#uiLevel').inputValue(),'advanced','basic runtime can switch into advanced mode');
    assert.ok(await page.locator('#codeEditor').isVisible());
    await page.locator('#pauseBtn').click();
    await page.waitForFunction(()=>Akari.app.editorState.state==='PAUSED');
    await page.locator('#continueBtn').click();
    await page.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');
    await page.locator('#runtimeInspectorStop').click();
    await page.waitForFunction(()=>Akari.app.editorState.state==='DESIGN');
    assert.ok(await page.locator('#codeEditor').isVisible(),'stop returns to the existing code editor');
    transition={basicBlocksRun:true,basicCodeViewVisible:true,advancedModeSwitch:true,pauseResume:true,stopReturnsToCodeEditor:true};
    await context.close();
  }catch(error){await context.close();throw Error(`basic runtime mode transition: ${error.message}`);}
  return {observations,transition,coverage:{viewports,levels},checks:['stage-visible','speech-rendered-size','stop-editor-return','advanced-code-monitor-retained','advanced-pause-resume','basic-code-view-and-advanced-switch']};
}

async function questionInputReview(browser){
  const observations=[];
  for(const viewport of viewports) for(const level of levels){
    const {page,context}=await openPage(browser,viewport,level);
    try{
      await page.locator('#editorModecode').click();
      const source='「名前は何ですか」とたずねて、答えを待つ。';
      await page.locator('#codeEditor').fill(source);
      await page.waitForFunction(s=>Akari.app.editorState.main.sourceText===s,source);
      assert.deepEqual(await page.evaluate(()=>Akari.app.compile().errors.map(e=>e.code)),[],'question example compiles');
      await page.locator('#runBtn').click();
      await page.locator('#questionModal.show').waitFor({state:'visible'});
      const prompt=await page.locator('#questionText').innerText();
      const focused=await page.locator('#questionAnswer').evaluate(el=>document.activeElement===el);
      const modal=await page.locator('#questionModal').evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});
      assert.equal(prompt,'名前は何ですか');
      assert.ok(focused,'runtime directs keyboard focus to the answer field');
      await page.locator('#questionAnswer').fill('あかり');
      await page.locator('#questionAnswer').press('Enter');
      await page.waitForFunction(()=>!document.querySelector('#questionModal').classList.contains('show'));
      await page.locator('#stopBtn').click();
      await page.waitForFunction(()=>Akari.app.editorState.state==='DESIGN');
      observations.push({viewport,level,source,prompt,focused,modal,answerAccepted:true,stopReturnsToEditor:true});
      await context.close();
    }catch(error){await context.close();throw Error(`question ${level} ${viewport.width}x${viewport.height}: ${error.message}`);}
  }
  return {observations,coverage:{viewports,levels},checks:['canonical-question-parses','answer-field-focus','answer-accepted','stop-editor-return']};
}


async function openFocusedFullTextEditor(page, input, string, width) {
  await input.click();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const focused=await input.evaluate(el=>{
    const r=el.getBoundingClientRect(),w=el.closest('.blockui-workspace').getBoundingClientRect(),
      button=el.closest('.blockui-field').querySelector('[data-blockui-action="edit-text"]'),b=button.getBoundingClientRect();
    return {left:r.left,right:r.right,workspaceLeft:w.left,workspaceRight:w.right,viewport:innerWidth,
      button:{left:b.left,right:b.right,top:b.top,width:b.width,height:b.height},
      scale:parseFloat(getComputedStyle(el.closest('.blockui-world')).getPropertyValue('--blockui-scale'))};
  });
  const edge=Math.min(focused.workspaceRight,width),b=focused.button;
  assert.ok(focused.left>=focused.workspaceLeft-1&&focused.right<=edge+1,'focused string field fits inside its workspace');
  assert.ok(b.left>=focused.workspaceLeft-1&&b.right<=edge+1&&b.width>0&&b.height>0,'the complete full-edit button fits inside its workspace');
  const x=b.left+b.width/2,y=b.top+b.height/2;
  assert.ok(await string.locator('[data-blockui-action="edit-text"]').evaluate((el,{x,y})=>el.contains(document.elementFromPoint(x,y)),{x,y}),'full-edit button center is accessible without scrolling');
  await page.mouse.click(x,y);
  await page.locator('.blockui-text-dialog textarea').waitFor({state:'visible'});
  return focused;
}

async function fullTextEditorReview(browser) {
  const short='あかりといっしょに、じぶんだけのものがたりをつくろう。第一場面は朝の森、第二場面は学校、第三場面は宇宙。最後の言葉も見えるかな。';
  const long='長い物語の言葉'.repeat(55),observations=[];
  assert.equal([...short].length,64);assert.equal([...long].length,385);
  for(const width of [1366,1024]) for(const level of levels) {
    const {page,context}=await openPage(browser,{width,height:768},level);
    try {
      await page.locator('#editorModecode').click();
      const source='「'+short+'」と言う。';
      await page.locator('#codeEditor').fill(source);
      await page.waitForFunction(s=>Akari.app.editorState.main.sourceText===s,source);
      await page.locator('#editorModeblocks').click();
      const string=page.locator('#blockEditor .blockui-node[data-schema-id="StringLiteral"]').first();
      const input=string.locator('input[data-blockui-field="value"]');
      const editor=page.locator('.blockui-text-dialog textarea');
      const buttonAccess=[];
      for(const action of ['zoom-reset','workspace-fit']) {
        await page.locator('#blockEditor [data-blockui-action="'+action+'"]').click();
        const geometry=await openFocusedFullTextEditor(page,input,string,width);
        assert.equal(await editor.inputValue(),short);
        await page.locator('[data-blockui-text-action="cancel"]').click();
        assert.equal(await page.evaluate(()=>Akari.app.editorState.main.sourceText),source);
        buttonAccess.push({action,characters:64,geometry,coordinateClick:true});
      }
      const focused=await openFocusedFullTextEditor(page,input,string,width);
      assert.equal(await editor.inputValue(),short);
      const surface=await editor.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {left:r.left,right:r.right,font:s.fontSize,wrap:el.wrap,width:el.clientWidth,scrollWidth:el.scrollWidth};});
      assert.ok(surface.left>=0&&surface.right<=width&&surface.width>=300,'the wrapped edit surface is visible');
      assert.equal(surface.wrap,'soft');assert.equal(surface.scrollWidth,surface.width);
      await editor.fill(long);await editor.press('End');
      assert.equal(await editor.inputValue(),long);
      assert.equal(await editor.evaluate(el=>el.scrollWidth),await editor.evaluate(el=>el.clientWidth),'all long text wraps without horizontal clipping');
      await page.screenshot({path:path.join(evidenceDir,'full-text-'+level+'-'+width+'.png'),fullPage:true});
      await page.locator('[data-blockui-text-action="cancel"]').click();
      assert.equal(await page.evaluate(()=>Akari.app.editorState.main.sourceText),source,'cancel keeps the exact original source');
      assert.equal(await input.inputValue(),short);
      await string.locator('[data-blockui-action="edit-text"]').click();await editor.fill(long);
      await page.locator('[data-blockui-text-action="commit"]').click();
      await page.waitForFunction(text=>Akari.app.editorState.main.sourceText.includes(text),long);
      const committed=await page.evaluate(()=>Akari.app.editorState.main.sourceText);
      assert.equal(await input.inputValue(),long);
      await page.locator('#undoBtn').click();await page.waitForFunction(s=>Akari.app.editorState.main.sourceText===s,source);
      await page.locator('#redoBtn').click();await page.waitForFunction(s=>Akari.app.editorState.main.sourceText===s,committed);
      await input.click();
      await string.locator('[data-blockui-action="edit-text"]').click();await editor.fill(short+'\n'+long);await editor.press('Escape');
      assert.equal(await page.evaluate(()=>Akari.app.editorState.main.sourceText),committed,'Escape cancels a multiline draft exactly');
      await page.locator('#editorModecode').click();assert.equal(await page.locator('#codeEditor').inputValue(),committed);
      await page.locator('#editorModeblocks').click();assert.equal(await input.inputValue(),long);
      for(const action of ['zoom-reset','workspace-fit']) {
        await page.locator('#blockEditor [data-blockui-action="'+action+'"]').click();
        const geometry=await openFocusedFullTextEditor(page,input,string,width);
        assert.equal(await editor.inputValue(),long);
        await page.locator('[data-blockui-text-action="cancel"]').click();
        assert.equal(await page.evaluate(()=>Akari.app.editorState.main.sourceText),committed);
        buttonAccess.push({action,characters:385,geometry,coordinateClick:true});
      }
      observations.push({width,level,focused,surface,buttonAccess,shortCharacters:64,longCharacters:385,cancelExact:true,commitExact:true,undoRedoExact:true,escapeExact:true,roundtripExact:true});
    } finally { await context.close(); }
  }
  return observations;
}

async function longTextReview(browser){
  const long='長い文字列'.repeat(39),observations=[];
  for(const viewport of viewports) for(const level of levels) for(const targetZoom of [1,.55]){
    const {page,context}=await openPage(browser,viewport,level);
    try{
      await page.locator('#editorModeblocks').click();
      await page.waitForFunction(()=>document.body.dataset.editorMode==='blocks');
      const field=page.locator('#blockEditor .blockui-world .blockui-field input').filter({hasNotText:/^$/}).first();
      const inputs=page.locator('#blockEditor .blockui-world .blockui-field input');
      const targetIndex=await inputs.evaluateAll(nodes=>nodes.findIndex(node=>node.value==='こんにちは'));
      assert.ok(targetIndex>=0,'default sample greeting field is available');
      const input=inputs.nth(targetIndex);
      const zoomReset=page.locator('#blockEditor [data-blockui-action="zoom-reset"]');
      await zoomReset.click();
      const zoomOut=page.locator('#blockEditor [data-blockui-action="zoom-out"]');
      if(targetZoom<1) for(let i=0;i<9;i++) await zoomOut.click();
      await page.waitForFunction(expected=>Math.abs(parseFloat(getComputedStyle(document.querySelector('#blockEditor .blockui-world')).getPropertyValue('--blockui-scale'))-expected)<.001,targetZoom);
      const before=await page.evaluate(()=>({source:Akari.app.editorState.main.sourceText,stageZoom:document.querySelector('#stageZoomReset')?.textContent||'',world:document.querySelector('.blockui-world')?.style.transform||'',blockZoom:document.querySelector('#blockEditor [data-blockui-action="zoom-reset"]')?.textContent||'',history:Akari.app.editorState.history.length}));
      await input.evaluate(el=>el.scrollIntoView({block:'center',inline:'center'}));
      await input.click();
      const focusStyle=await input.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el),scale=parseFloat(getComputedStyle(document.querySelector('#blockEditor .blockui-world')).getPropertyValue('--blockui-scale'))||1;return{rect:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom},cssFontPx:parseFloat(s.fontSize),worldScale:scale,renderedFontPx:parseFloat(s.fontSize)*scale,renderedHeightPx:r.height,visible:r.width>0&&r.height>0&&r.x>=-1&&r.right<=innerWidth+1&&r.bottom>0&&r.y<innerHeight,layout:document.querySelector('#blockEditor .blockui-layout')?getComputedStyle(document.querySelector('#blockEditor .blockui-layout')).gridTemplateColumns:''};});
      await input.fill(long);
      await input.press('End');const endScroll=await input.evaluate(el=>el.scrollLeft);
      await input.press('Home');const homeScroll=await input.evaluate(el=>el.scrollLeft);
      assert.ok(endScroll>0,'End scrolls to the far end of the complete input value');
      assert.equal(homeScroll,0,'Home scrolls back to the beginning');
      assert.ok(focusStyle.visible,'focused long-text field is visible on screen');
      assert.ok(focusStyle.renderedFontPx>=18,'focused input text is at least 18 viewport pixels after workspace zoom');
      assert.ok(focusStyle.renderedHeightPx>=40,'focused input has at least 40 viewport pixels of height');
      assert.ok(focusStyle.rect.x>=-1&&focusStyle.rect.right<=viewport.width+1,'entire input field fits horizontally in the viewport');
      assert.equal(await input.inputValue(),long,'all 195 characters remain in the field');
      await page.screenshot({path:path.join(evidenceDir,`long-focus-${level}-${viewport.width}-${Math.round(targetZoom*100)}.png`),fullPage:true});
      await input.press('Escape');
      await page.waitForFunction(source=>{
        const state=Akari.app.editorState.main;
        const field=[...document.querySelectorAll('#blockEditor .blockui-world .blockui-field input')].find(el=>el.value==='こんにちは');
        return state.pendingEdit===null&&state.sourceText===source&&field?.value==='こんにちは';
      },before.source);
      const escaped=await page.evaluate(()=>({value:document.querySelector('#blockEditor .blockui-world .blockui-field input')?.value,source:Akari.app.editorState.main.sourceText,zoom:document.querySelector('#stageZoomReset')?.textContent||'',world:document.querySelector('.blockui-world')?.style.transform||''}));
      assert.equal(escaped.source,before.source,'Escape cancels the uncommitted draft');
      assert.equal(escaped.zoom,before.stageZoom,'Escape keeps stage zoom unchanged');
      assert.equal(escaped.world,before.world,'Escape keeps workspace pan unchanged');
      const inputsAgain=page.locator('#blockEditor .blockui-world .blockui-field input');
      const inputAgain=inputsAgain.nth(await inputsAgain.evaluateAll(nodes=>nodes.findIndex(node=>node.value==='こんにちは')));
      await inputAgain.click();await inputAgain.fill(long);await inputAgain.press('Tab');
      await page.waitForFunction(value=>Akari.app.editorState.main.sourceText.includes(value),long);
      const committed=await page.evaluate(()=>Akari.app.editorState.main.sourceText);
      assert.ok(committed.includes(long),'commit stores the complete long value');
      const stable=await page.evaluate(()=>({zoom:document.querySelector('#stageZoomReset')?.textContent||'',world:document.querySelector('.blockui-world')?.style.transform||''}));
      await page.locator('#undoBtn').click();
      await page.waitForFunction(source=>Akari.app.editorState.main.sourceText===source,before.source);
      const undone=await page.evaluate(()=>Akari.app.editorState.main.sourceText);
      await page.locator('#redoBtn').click();
      await page.waitForFunction(source=>Akari.app.editorState.main.sourceText===source,committed);
      const redone=await page.evaluate(()=>Akari.app.editorState.main.sourceText);
      await page.locator('#editorModecode').click();
      const code=await page.locator('#codeEditor').inputValue();
      assert.equal(code,committed,'code view contains the complete committed source');
      await page.locator('#editorModeblocks').click();
      const returned=await page.locator('#blockEditor .blockui-world .blockui-field input').evaluateAll(nodes=>nodes.find(node=>node.value.includes('長い文字列'))?.value||'');
      assert.equal(returned,long,'block view restores all 195 characters');
      await page.waitForFunction(zoom=>document.querySelector('#stageZoomReset')?.textContent===zoom,before.stageZoom);
      const after=await page.evaluate(()=>({source:Akari.app.editorState.main.sourceText,stageZoom:document.querySelector('#stageZoomReset')?.textContent||'',world:document.querySelector('.blockui-world')?.style.transform||'',blockZoom:document.querySelector('#blockEditor [data-blockui-action="zoom-reset"]')?.textContent||''}));
      assert.equal(undone,before.source,'Undo restores the exact original source');
      assert.equal(redone,committed,'Redo restores the exact committed source');
      assert.equal(after.source,committed,'code/block roundtrip preserves source');
      assert.equal(after.stageZoom,before.stageZoom,'focus and roundtrip leave stage zoom unchanged');
      assert.equal(after.world,stable.world,'focus and roundtrip leave workspace pan unchanged');
      assert.equal(after.blockZoom,before.blockZoom,'focus and roundtrip leave editor zoom unchanged');
      observations.push({viewport,level,targetZoom,before,focusStyle,longCharacterCount:[...long].length,inputScroll:{endScroll,homeScroll},escaped:{draftCancelled:true,zoom:escaped.zoom,world:escaped.world},committed:{sourceLength:[...committed].length,undo:true,redo:true,codeBlocksRoundtrip:true,zoom:after.blockZoom,world:after.world}});
      await context.close();
    }catch(error){await context.close();throw Error(`long text ${level} ${viewport.width}x${viewport.height}: ${error.message}`);}
  }
  const fullTextEditor=await fullTextEditorReview(browser);
  return {observations,fullTextEditor,coverage:{viewports,levels,workspaceZooms:[100,55]},checks:['focus-field-visible','18px-rendered-input','40px-rendered-height','keyboard-home-end-scroll','escape-cancels-draft','undo-redo-exact','code-block-roundtrip','stage-and-workspace-zoom-pan-preserved']};
}

const browserReport=await withBrowser(browserPath,async browser=>{
  for(const [id,fn] of [
    ['REVIEW-STAGE-SPEECH-READABLE',stageSpeechReview],
    ['REVIEW-LONG-TEXT-EDIT-VISIBLE',longTextReview],
  ]){
    try{results.push({id,pass:true,evidence:await fn(browser)});}
    catch(error){results.push({id,pass:false,evidence:{error:error.stack||error.message}});}
  }
  // The input question is folded into the stage readability result as a required
  // focus-preservation interaction; retain its detailed evidence there.
  try{
    const question=await questionInputReview(browser);
    const stage=results.find(r=>r.id==='REVIEW-STAGE-SPEECH-READABLE');
    stage.evidence.questionInput=question;
    if(!question.observations.length)stage.pass=false;
  }catch(error){
    const stage=results.find(r=>r.id==='REVIEW-STAGE-SPEECH-READABLE');
    stage.pass=false;stage.evidence.questionInput={error:error.stack||error.message};
  }
  return {version:browser.version()};
});
const finalSnapshot=snapshot(product);
assert.deepEqual(finalSnapshot,initialSnapshot,'product and review inputs remain fixed during the browser review');
const status=results.every(r=>r.pass)&&pageErrors.length===0&&networkRequests.length===0?'PASS':'FAIL';
const report={schema:'akari-independent-review-v1',group:'readable',status,snapshot:initialSnapshot,results,browser:browserReport.version,pageErrors,networkRequests};
if(status==='PASS') verifyReviewReport(report,'readable',initialSnapshot);
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status,output,results:results.map(({id,pass})=>({id,pass})),pageErrors,networkRequests}));
if(status!=='PASS')process.exitCode=1;
