import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot, withBrowser, pageFor} from '../lib/product-test-host.mjs';
import {installRegressionProject, showAdvancedCode} from '../lib/gate-ui-fixture.mjs';
import U from '../browser/cases/ui-routes.cjs';
import {childLanguageUiIds,childInsertionConceptHints} from '../lib/child-language-ui-contract.mjs';
import {browserEnvironment as expectedBrowser} from '../lib/browser-environment.mjs';
import {collectLanguageFrame,childUxProvenance} from '../lib/child-ux-observations.mjs';

const [browserPath, output = 'audit-evidence/child-language-ui.json'] = process.argv.slice(2);
const require=createRequire(import.meta.url),playwrightVersion=require('playwright/package.json').version;
assert.equal(playwrightVersion,expectedBrowser.playwright,'approved Playwright is required');
assert.ok(!fs.existsSync(output), 'fresh child-language evidence required');
const product = currentProductFile(), inputs = snapshot(product), results = [], artifacts = [];
const uiInventoryFrames=[],uiInventoryArtifacts=[],provenance=childUxProvenance();
const directory = path.join(path.dirname(output),path.basename(output,path.extname(output)));
fs.mkdirSync(directory, {recursive:true});

const state = p => p.evaluate(() => {
  const s = Akari.app.editorState;
  return {project:JSON.stringify(Akari.app.project), source:s.main.sourceText,
    history:s.history, redo:s.redo, dirty:s.dirty};
});
async function reveal(locator) {
  if (!await locator.isVisible()) {
    for (const panel of await locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())
      await panel.locator('.blockui-side-toggle').click();
  }
  for (const details of await locator.locator('xpath=ancestor::details[not(@open)]').all()) {
    const ownSummary=await details.locator(':scope > summary').evaluate((summary,target)=>summary===target,await locator.elementHandle());
    if(!ownSummary)await details.locator(':scope > summary').click();
  }
  return locator;
}
async function click(p, selector) { await (await reveal(p.locator(selector))).click(); }
async function source(p, text) {
  await showAdvancedCode(p);
  await (await reveal(p.locator('#objectSelect'))).selectOption('stage');
  await p.locator('#codeEditor').fill(text);
  await p.waitForFunction(expected => Akari.app.editorState.main.sourceText === expected, text);
}
async function reachable(locator) {
  await (await reveal(locator)).scrollIntoViewIfNeeded();
  const r = await locator.boundingBox(), v = locator.page().viewportSize();
  assert.ok(r && r.width > 0 && r.height > 0, 'visible control required');
  assert.ok(r.x >= -1 && r.y >= -1 && r.x+r.width <= v.width+1 && r.y+r.height <= v.height+1,
    'control must be reachable by ordinary scrolling');
  return {x:r.x,y:r.y,width:r.width,height:r.height};
}
async function keyboardDetails(p, selector) {
  const summary = p.locator(selector+' > summary');
  await reachable(summary); await summary.focus(); await summary.press('Enter');
  assert.notEqual(await p.locator(selector).getAttribute('open'), null, 'Enter opens native details');
  return summary;
}
async function textFits(locator) {
  const rows = await locator.evaluateAll(elements => elements.filter(e=>e.getClientRects().length).map(e=>({
    text:e.textContent, width:e.clientWidth, required:e.scrollWidth,
    whiteSpace:getComputedStyle(e).whiteSpace, rects:e.getClientRects().length,
  })));
  assert.ok(rows.length, 'visible language labels required');
  for (const r of rows) assert.ok(r.required <= r.width+1, 'clipped language text: '+JSON.stringify(r));
  return rows;
}
async function panelMetrics(panel) {
  return panel.evaluate(e=>{
    const r=e.getBoundingClientRect(),rect=q=>({x:q.x,y:q.y,width:q.width,height:q.height});
    return {scrollTop:e.scrollTop,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,
      maxScroll:e.scrollHeight-e.clientHeight,tabIndex:e.tabIndex,label:e.getAttribute('aria-label'),
      clip:{x:r.left+e.clientLeft,y:r.top+e.clientTop,width:e.clientWidth,height:e.clientHeight},
      viewport:{width:innerWidth,height:innerHeight},paragraphs:e.querySelectorAll(':scope > p').length,
      tail:[...e.querySelectorAll(':scope > p')].slice(-2).map(p=>{
        const range=document.createRange();range.selectNodeContents(p);
        return {text:p.textContent,ink:rect(range.getBoundingClientRect())};
      })};
  });
}
function tailFits(observation) {
  const clip=observation.clip,v=observation.viewport;
  assert.ok(clip.x>=-1&&clip.y>=-1&&clip.x+clip.width<=v.width+1&&clip.y+clip.height<=v.height+1,'reading panel fits viewport');
  for(const row of observation.tail) {
    const r=row.ink;
    assert.ok(r.x>=clip.x-1&&r.y>=clip.y-1&&r.x+r.width<=clip.x+clip.width+1&&r.y+r.height<=clip.y+clip.height+1,
      'last explanations must be fully readable after native scroll: '+row.text);
  }
}
async function keyboardPanelTail(p,selector) {
  const panelSelector=selector+' > .child-help-panel';
  const panel=p.locator(panelSelector),summary=p.locator(selector+' > summary');
  await reachable(panel);
  const layout=await panelMetrics(panel),stateBefore=await state(p);
  assert.equal(layout.tabIndex,0);assert.equal(layout.label,'ヒントのつづきを読む');
  assert.match(await panel.locator('.child-scroll-help').innerText(),/Tab.*↓キー/);
  await p.evaluate(s=>{
    const panel=document.querySelector(s);
    globalThis.__childHelpKeys=[];globalThis.__childHelpScrollEvents=[];
    globalThis.__childHelpKeyListener=e=>globalThis.__childHelpKeys.push({key:e.key,trusted:e.isTrusted,
      defaultPrevented:e.defaultPrevented,targetIsPanel:e.target===panel,activeIsPanel:document.activeElement===panel});
    globalThis.__childHelpScrollListener=e=>globalThis.__childHelpScrollEvents.push({type:e.type,trusted:e.isTrusted,
      scrollTop:panel.scrollTop,scrollHeight:panel.scrollHeight,clientHeight:panel.clientHeight});
    window.addEventListener('keydown',globalThis.__childHelpKeyListener,false);
    panel.addEventListener('scroll',globalThis.__childHelpScrollListener);
    panel.addEventListener('scrollend',globalThis.__childHelpScrollListener);
  },panelSelector);
  const marker=()=>p.evaluate(()=>globalThis.__childHelpScrollEvents.length);
  const completed=(from,target)=>p.waitForFunction(([from,target])=>globalThis.__childHelpScrollEvents.slice(from)
    .some(e=>e.type==='scrollend'&&e.trusted&&(target===null?e.scrollTop>0:e.scrollTop>=target-1&&e.scrollTop<=target+1)),[from,target]);
  try {
    await summary.focus();await summary.press('Tab');
    assert.equal(await panel.evaluate(e=>document.activeElement===e),true,'Tab reaches scrollable explanation');
    const beforeHome=await panelMetrics(panel),home=await marker();
    await panel.press('Home');
    await p.waitForFunction(s=>document.querySelector(s).scrollTop===0,panelSelector);
    // Reopening details preserves its scroll position. A visible zero can occur before
    // Chromium has finished Home's native scroll, so await the actual completion event.
    if(beforeHome.scrollTop>0)await completed(home,0);
    const initial=await panelMetrics(panel),arrow=await marker();
    await panel.press('ArrowDown');
    if(initial.maxScroll>0)await completed(arrow,null);
    const afterArrow=await panelMetrics(panel),stateAfterArrow=await state(p),end=await marker();
    assert.deepEqual(stateAfterArrow,stateBefore,'reading with ArrowDown must preserve the project and editing state');
    await panel.press('End');
    await p.waitForFunction(s=>{const e=document.querySelector(s);return e.scrollTop>=e.scrollHeight-e.clientHeight-1;},panelSelector);
    if(afterArrow.scrollTop<afterArrow.maxScroll-1)await completed(end,afterArrow.maxScroll);
    const bottom=await panelMetrics(panel);tailFits(bottom);
    await panel.press('Shift+Tab');assert.equal(await summary.evaluate(e=>document.activeElement===e),true,'Shift+Tab returns to summary');
    const keys=await p.evaluate(()=>globalThis.__childHelpKeys),scrollEvents=await p.evaluate(()=>globalThis.__childHelpScrollEvents);
    const stateAfter=await state(p);assert.deepEqual(stateAfter,stateBefore);
    return {method:'native-keyboard',initial,afterArrow,bottom,keys,beforeHome,markers:{home,arrow,end},scrollEvents,
      stateBefore,stateAfterArrow,stateAfter};
  } finally {
    await p.evaluate(s=>{
      const panel=document.querySelector(s);
      window.removeEventListener('keydown',globalThis.__childHelpKeyListener,false);
      panel.removeEventListener('scroll',globalThis.__childHelpScrollListener);panel.removeEventListener('scrollend',globalThis.__childHelpScrollListener);
      delete globalThis.__childHelpKeyListener;delete globalThis.__childHelpKeys;delete globalThis.__childHelpScrollListener;delete globalThis.__childHelpScrollEvents;
    },panelSelector);
  }
}
async function touchPanelTail(p,selector) {
  const panel=p.locator(selector+' > .child-help-panel');await reachable(panel);
  const initial=await panelMetrics(panel),clip=initial.clip;
  assert.match(await panel.locator('.child-scroll-help').innerText(),/指を上へ動かす/);
  const distance=Math.floor(clip.height*.6),plannedSwipes=initial.maxScroll>0?Math.ceil(initial.maxScroll/Math.max(1,distance-10))+1:0;
  assert.ok(plannedSwipes<=8,'bounded geometric gesture plan');
  const session=await p.context().newCDPSession(p);
  await p.evaluate(()=>{
    globalThis.__childHelpTouches=[];
    globalThis.__childHelpTouchListener=e=>globalThis.__childHelpTouches.push({type:e.type,trusted:e.isTrusted});
    for(const type of ['touchstart','touchmove','touchend'])document.addEventListener(type,globalThis.__childHelpTouchListener,{capture:true,passive:true});
  });
  try {
    const swipes=[];
    for(let i=0;i<plannedSwipes;i++) {
      const x=Math.round(clip.x+clip.width/2),startY=Math.round(clip.y+clip.height*.8),endY=startY-distance;
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:startY,id:1}]});
      for(let step=1;step<=8;step++) {
        await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:startY-distance*step/8,id:1}]});
        await p.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
      }
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      swipes.push({x,startY,endY,scrollTop:(await panelMetrics(panel)).scrollTop});
    }
    await p.waitForFunction(s=>{const e=document.querySelector(s);return e.scrollTop>=e.scrollHeight-e.clientHeight-1;},selector+' > .child-help-panel');
    const bottom=await panelMetrics(panel);tailFits(bottom);
    return {method:'native-touch',initial,bottom,plannedSwipes,swipes,events:await p.evaluate(()=>globalThis.__childHelpTouches)};
  } finally {
    await session.detach();
    await p.evaluate(()=>{for(const type of ['touchstart','touchmove','touchend'])document.removeEventListener(type,globalThis.__childHelpTouchListener,true);delete globalThis.__childHelpTouchListener;delete globalThis.__childHelpTouches;});
  }
}
async function shot(p, name, inventoryOnly=false) {
  const filename = path.join(directory,name+'.png');
  await p.screenshot({path:filename,fullPage:true});
  const artifact={path:path.relative(path.dirname(output),filename).split(path.sep).join('/'),
    sha256:crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex')};
  (inventoryOnly?uiInventoryArtifacts:artifacts).push(artifact);
  uiInventoryFrames.push(await collectLanguageFrame(p,name,artifact));
}

const cases = {
  async 'CHILD-UI-ACTION-HELP'(p) {
    await p.locator('#uiLevel').selectOption('basic');
    const before=await state(p), summary=await keyboardDetails(p,'#basicActionGuide');
    for (const [id,reading] of [['saveBtn','ほぞん'],['exportBtn','かきだし'],['assetBtn','がぞう'],['dataBtn','へんすう']])
      assert.ok((await p.locator('#'+id+' rt').allTextContents()).includes(reading),id+' visible reading');
    assert.match(await p.locator('#saveActionHelp').innerText(),/あとで続きを作る/);
    assert.match(await p.locator('#exportActionHelp').innerText(),/動かして見る/);
    assert.match(await p.locator('#bodyActionHelp').innerText(),/命令のまとまり/);
    assert.match(await p.locator('#bodyActionHelp').innerText(),/編集（へんしゅう）.*命令や言葉を作ったり直したり/s);
    assert.equal(await p.locator('#eventSelect').locator('xpath=..').locator('rt').innerText(),'へんしゅう');
    assert.match(await p.locator('#basicActionGuide').innerText(),/コードはコピーしません/);
    assert.match(await p.locator('#basicActionGuide').innerText(),/決めた変更を1つ戻す/);
    const help=await textFits(p.locator('#basicActionGuide p'));
    const tailReach=await keyboardPanelTail(p,'#basicActionGuide');
    await summary.press('Enter'); assert.equal(await p.locator('#basicActionGuide').getAttribute('open'),null);
    assert.deepEqual(await state(p),before,'reading help must preserve project and history');
    // The two labels describe different real downloads, not just different text.
    const saved=p.waitForEvent('download'); await click(p,'#saveBtn'); const save=await saved;
    assert.match(save.suggestedFilename(),/\.akari\.md$/);
    const exported=p.waitForEvent('download'); await click(p,'#exportBtn');await p.locator('#exportControls').click(); const exportedFile=await exported;
    assert.match(exportedFile.suggestedFilename(),/\.html$/);
    const html=fs.readFileSync(await exportedFile.path(),'utf8');
    assert.ok(html.includes('⏸ いったん止める') && html.includes('■ 止める'),'generated player uses the same words');
    return {keyboardHelp:true,help,tailReach,editReading:'へんしゅう',editMeaning:await p.locator('#bodyActionHelp').textContent(),downloadTypes:['akari.md','html'],saveFile:save.suggestedFilename(),
      exportFile:exportedFile.suggestedFilename(),generatedPlayerWords:true,
      projectSourcePreserved:(await state(p)).source===before.source};
  },
  async 'CHILD-UI-COPY-SEMANTICS'(p) {
    await (await reveal(p.locator('#objectSelect'))).selectOption('sprite-1');
    const historyBeforeSourceEdit=(await state(p)).history;
    await p.locator('#codeEditor').fill('「元の動き」を言う。');
    await p.locator('#codeEditor').press('Tab');
    await p.waitForFunction(historyBefore=>{
      const s=Akari.app.editorState;
      return s.main.sourceText==='「元の動き」を言う。'&&s.history>historyBefore;
    },historyBeforeSourceEdit);
    const before=await p.evaluate(()=>JSON.parse(JSON.stringify(Akari.app.project)));
    const original=before.components.find(c=>c.id==='sprite-1');
    assert.equal(await p.locator('#properties .prop-duplicate').innerText(),'見た目のコピー');
    assert.equal(await p.locator('#properties .prop-duplicate').getAttribute('title'),'見た目・設定を複製します（コードは含みません）');
    assert.equal(await p.locator('#properties .child-copy-help').isVisible(),true,'copy scope visible before pressing');
    assert.match(await p.locator('#properties .child-copy-help').innerText(),/コードはコピーしません/);
    const copyHelpModes={before:await state(p),steps:[]};
    const copyActionsReference=await p.locator('.prop-actions').elementHandle(),
      copyHelpReference=await p.locator('.child-copy-help').elementHandle();
    assert.ok(copyActionsReference&&copyHelpReference,'existing actions and copy explanation nodes required');
    try {
      for(const mode of ['code','blocks','code']) {
        await click(p,'#editorMode'+mode);
        const placement=await p.evaluate(({actionsReference,helpReference})=>{
          const actions=document.querySelector('.prop-actions'),help=document.querySelector('.child-copy-help');
          return {mode:document.body.dataset.editorMode,actionsHost:actions?.parentElement?.id,
            helpHost:help?.parentElement?.id,adjacent:actions?.nextElementSibling===help,
            sameActionsNode:actions===actionsReference,sameHelpNode:help===helpReference,
            helpCount:document.querySelectorAll('.child-copy-help').length,
            text:help?.textContent,ariaDescription:actions?.querySelector('.prop-duplicate')?.getAttribute('aria-description')};
        },{actionsReference:copyActionsReference,helpReference:copyHelpReference});
        const expectedHost=mode==='blocks'?'componentActions':'properties';
        assert.deepEqual(placement,{mode,actionsHost:expectedHost,helpHost:expectedHost,adjacent:true,
          sameActionsNode:true,sameHelpNode:true,helpCount:1,
          text:"見た目と設定をコピーします。コードはコピーしません。",ariaDescription:"見た目と設定をコピーします。コードはコピーしません。"});
        const observedState=await state(p);
        assert.deepEqual(observedState,copyHelpModes.before,'mode moves preserve the actual project, source, history, redo, and dirty state');
        copyHelpModes.steps.push({...placement,state:observedState});
      }
      copyHelpModes.after=await state(p);
      assert.deepEqual(copyHelpModes.after,copyHelpModes.before);
    } finally {
      await copyActionsReference.dispose(); await copyHelpReference.dispose();
    }
    await click(p,'#properties .prop-duplicate');
    const after=await p.evaluate(()=>JSON.parse(JSON.stringify(Akari.app.project)));
    const copy=after.components.find(c=>!before.components.some(old=>old.id===c.id));
    assert.ok(copy,'copy creates exactly one new component');
    assert.equal(after.components.length,before.components.length+1);
    for(const key of ['type','w','h','fg','bg','direction','scalePercent','visible'])
      assert.deepEqual(copy[key],original[key],'copy preserves '+key);
    assert.deepEqual(after.scripts,before.scripts,'component appearance copy must not copy code');
    await click(p,'#undoBtn'); assert.deepEqual(await p.evaluate(()=>Akari.app.project),before);
    const observedFields=component=>Object.fromEntries(['type','w','h','fg','bg','direction','scalePercent','visible'].map(key=>[key,component[key]]));
    return {visibleScope:true,appearanceAndSettings:true,noCodeCopied:true,undo:true,copyHelpModes,
      original:observedFields(original),copy:observedFields(copy),scriptsBefore:before.scripts,scriptsAfter:after.scripts,
      componentCountBefore:before.components.length,componentCountAfter:after.components.length};
  },
  async 'CHILD-UI-DATA-EXAMPLES'(p) {
    await click(p,'#dataBtn');
    assert.equal(await p.locator('#dataConceptHelp').isVisible(),true);
    assert.match(await p.locator('#dataConceptHelp').innerText(),/点数.*10.*名前.*あかり/s);
    assert.match(await p.locator('#dataConceptHelp').innerText(),/持ち物.*本.*かさ.*ぼうし/s);
    assert.deepEqual(await p.locator('#dataKind option').evaluateAll(es=>es.map(e=>e.value)),['variable','list']);
    const variablePlaceholder=await p.locator('#dataInitial').getAttribute('placeholder');
    assert.match(variablePlaceholder,/0、0点、こんにちは/);
    const descriptions=await textFits(p.locator('#dataConceptHelp p'));
    await p.locator('#dataName').fill('名前'); await p.locator('#dataInitial').fill('あかり'); await click(p,'#dataAdd');
    assert.equal(await p.evaluate(()=>Akari.app.project.projectData.variables.find(v=>v.name==='名前')?.initialValue),'あかり');
    await p.locator('#dataKind').selectOption('list'); await p.locator('#dataListMode').selectOption('lines');
    await p.locator('#dataName').fill('持ち物'); await p.locator('#dataItems').fill('本\nかさ\nぼうし'); await click(p,'#dataAdd');
    assert.deepEqual(await p.evaluate(()=>Akari.app.project.projectData.lists.find(v=>v.name==='持ち物')?.initialValue),['本','かさ','ぼうし']);
    await shot(p,'child-data-examples');
    return {descriptions,numberAndStringExamplesPreserved:true,variableStoresString:true,listStoresOrderedItems:true,variablePlaceholder,
      variableValue:await p.evaluate(()=>Akari.app.project.projectData.variables.find(v=>v.name==='名前')?.initialValue),
      listValue:await p.evaluate(()=>Akari.app.project.projectData.lists.find(v=>v.name==='持ち物')?.initialValue)};
  },
  async 'CHILD-UI-PROCEDURE-EXAMPLES'(p) {
    await p.locator('#uiLevel').selectOption('basic'); assert.equal(await p.locator('#procBtn').isVisible(),false,'procedure editing remains advanced');
    await p.locator('#uiLevel').selectOption('advanced'); await click(p,'#procBtn');
    const summary=await keyboardDetails(p,'#callableConceptHelp');
    assert.match(await p.locator('#callableConceptHelp').innerText(),/あいさつ.*おじぎ/s);
    assert.match(await p.locator('#callableConceptHelp').innerText(),/点数を2倍/);
    const concept=await textFits(p.locator('#callableConceptHelp p'));
    const tailReach=await keyboardPanelTail(p,'#callableConceptHelp');await summary.press('Enter');
    await click(p,'#callableNewAction');
    assert.match(await p.locator('#callableArgsHelp').innerText(),/点数として10、名前として「あかり」/);
    assert.match(await p.locator('#callableArgs').getAttribute('placeholder'),/歩数、あいさつ/);
    await p.locator('#callableName').fill('あいさつ'); await p.locator('#callableName').press('Tab');
    await p.locator('#callableArgs').fill('点数、名前'); await p.locator('#callableArgs').press('Tab');
    await p.locator('#callableCode').fill('名前を言う。');
    await p.waitForFunction(()=>Akari.app.editorState.callableDraft?.source==='名前を言う。');
    assert.equal(await p.locator('#callableSave').innerText(),'手順・計算を決める'); await click(p,'#callableSave');
    const action=await p.evaluate(()=>Akari.app.project.actions.find(a=>a.name==='あいさつ'));
    assert.ok(action); assert.deepEqual(action.args,['点数','名前']); assert.equal(action.source,'名前を言う。');
    await shot(p,'child-procedure-examples');
    return {advancedOnly:true,concept,tailReach,concreteValueExample:true,existingArgumentPlaceholder:true,
      definitionArgsPreserved:action.args,registeredSource:action.source};
  },
  async 'CHILD-UI-BLOCK-WORDS'(p) {
    await source(p,'2 + 3を言う。\n2回くり返す。\n  1を言う。'); await click(p,'#editorModeblocks');
    const before=await state(p), summary=await keyboardDetails(p,'#blockEditor .blockui-local-help');
    for(const text of ['値（あたい）','文字「おはよう」','条件の「あてはまる・あてはまらない」','累乗（るいじょう）','2×2×2で8','分身（ぶんしん）','元に戻す'])
      assert.ok((await p.locator('#blockEditor .blockui-local-help').innerText()).includes(text),text);
    const help=await textFits(p.locator('#blockEditor .blockui-local-help p'));
    const truthExample=help.find(r=>r.text.includes('条件の')).text;
    const insertionConceptHints={commandAndBody:help[2]?.text,palette:help[3]?.text};
    assert.deepEqual(insertionConceptHints,childInsertionConceptHints,'normal insertion reading and meaning follow the value hint in the actual DOM');
    await p.locator('#blockEditor .blockui-local-help p').nth(3).scrollIntoViewIfNeeded();
    await shot(p,'child-block-words-open',true);
    await summary.press('Enter'); assert.deepEqual(await state(p),before,'local words help preserves source and history');
    const arithmetic=p.locator('#blockEditor .blockui-node[data-schema-id="BinaryExpression:ADD"]');
    const oldValues=await arithmetic.locator('[data-blockui-field="value"]').evaluateAll(es=>es.map(e=>e.value));
    assert.deepEqual(oldValues,['2','3']);
    const operator=arithmetic.locator('.blockui-operator');
    assert.equal(await operator.getAttribute('aria-label'),'計算やくらべ方のしるしだけを変える');
    await operator.selectOption('BinaryExpression:SUB');
    const arithmeticAfter=p.locator('#blockEditor .blockui-node[data-schema-id="BinaryExpression:SUB"]');
    const newValues=await arithmeticAfter.locator('[data-blockui-field="value"]').evaluateAll(es=>es.map(e=>e.value));
    const historyAfter=(await state(p)).history;
    assert.deepEqual(newValues,oldValues);
    assert.equal(historyAfter,before.history+1,'only operator change is committed');
    const repeat=p.locator('#blockEditor .blockui-node[data-schema-id="RepeatCount"]'); await U.openNodeMenu(repeat);
    assert.equal(await repeat.locator(':scope > .blockui-node-head [data-blockui-action="remove"]').innerText(),'この囲いと中の命令を消す');
    assert.equal(await repeat.locator(':scope > .blockui-node-head [data-blockui-action="duplicate"]').innerText(),'同じものをもう1つ');
    await p.keyboard.press('Escape');
    await p.locator('#blockEditor [data-blockui-action="body-insert"]').first().click();
    assert.equal(await p.locator('#blockEditor [data-blockui-action="cancel"]').innerText(),'操作を取り消す');
    await p.locator('#blockEditor [data-blockui-action="cancel"]').click();
    await click(p,'#undoBtn'); assert.equal((await state(p)).source,before.source);
    return {textNumberBooleanSupport:true,powerExample:true,help,truthExample,insertionConceptHints,leftRightValuesPreserved:oldValues,
      oldValues,newValues,historyBefore:before.history,historyAfter,
      deleteScopeVisible:true,blockCopyTargetClear:true,cancelDifferentFromUndo:true};
  },
  async 'CHILD-UI-PAINT-MATERIALS'(p) {
    const before=await state(p); await click(p,'#paintAdd');
    assert.equal(await p.locator('[data-paint-tool="ellipse"]').innerText(),'だ円（長い丸）');
    assert.match(await p.locator('.paint-options').innerText(),/線の太さ/);
    assert.equal(await p.locator('#paintShape option[value="outline"]').innerText(),'ふちだけ');
    assert.match(await p.locator('#paintStatus').innerText(),/透明.*絵として保存されません/);
    await click(p,'[data-paint-tool="ellipse"]'); await p.locator('#paintShape').selectOption('outline');
    const canvas=await p.locator('#paintCanvas').boundingBox();
    await p.mouse.move(canvas.x+canvas.width*.2,canvas.y+canvas.height*.3); await p.mouse.down();
    await p.mouse.move(canvas.x+canvas.width*.8,canvas.y+canvas.height*.6,{steps:5}); await p.mouse.up();
    const alpha=await p.locator('#paintCanvas').evaluate(c=>({center:c.getContext('2d').getImageData(250,225,1,1).data[3],
      exterior:c.getContext('2d').getImageData(1,1,1,1).data[3]}));
    assert.equal(alpha.center,0,'outline leaves the middle transparent'); assert.equal(alpha.exterior,0,'checkerboard is not drawn into pixels');
    await shot(p,'child-paint-transparent');
    assert.equal(await p.locator('#paintCancel').innerText(),'お絵かきを取り消す'); await click(p,'#paintCancel');
    assert.deepEqual(await state(p),before,'cancel must not add image or change project history');
    const labels=[];
    for(const [preset,reading,note] of [['comet','すいせい','尾のある星'],['yinYang','いんよう','白黒の丸'],['medical','いりょう','へびとつえ'],['radioactive','ほうしゃせん','三つの羽の印'],['biohazard',null,'三つの輪の印']]) {
      const button=await reveal(p.locator('[data-sprite-preset="'+preset+'"]')); await reachable(button);
      assert.equal(await button.locator('.child-material-note').innerText(),note);
      if(reading)assert.equal(await button.locator('rt').innerText(),reading);
      assert.ok((await button.locator('.ico').innerText()).trim(),'material retains its corresponding picture');
      labels.push({preset,reading,note,size:await reachable(button)});
    }
    await shot(p,'child-materials');
    return {ellipseAndOutline:true,transparentPixels:alpha,cancelPreservesProject:true,optionalMaterials:labels};
  },
  async 'CHILD-UI-RESPONSIVE-WORDS'(p) {
    const observations=[];
    for(const viewport of [{width:1180,height:757},{width:1188,height:848},{width:390,height:844}]) {
      await p.setViewportSize(viewport);
      for(const mode of ['code','blocks']) {
        await click(p,'#editorMode'+mode);
        const before=await state(p);
        const controls={}; for(const id of ['saveBtn','exportBtn','runBtn','stopBtn'])controls[id]=await reachable(p.locator('#'+id));
        const summary=await keyboardDetails(p,'#basicActionGuide');
        const help=await textFits(p.locator('#basicActionGuide p'));
        const tailReach=await keyboardPanelTail(p,'#basicActionGuide');
        const reading=await p.locator('#basicActionGuide ruby').evaluateAll(es=>es.map(e=>({text:e.textContent,rects:e.getClientRects().length,whiteSpace:getComputedStyle(e).whiteSpace})));
        for(const term of reading){assert.equal(term.rects,1,'term keeps a natural whole');assert.equal(term.whiteSpace,'nowrap');}
        await summary.press('Enter'); assert.deepEqual(await state(p),before);
        observations.push({viewport,mode,controls,help,reading,tailReach});
      }
      await shot(p,'child-words-'+viewport.width);
    }
    return {observations,ordinaryScroll:true,keyboard:true,helpPreservesEditing:true};
  },
  async 'CHILD-UI-TOUCH-HELP'(p) {
    const context=await p.context().browser().newContext({offline:true,hasTouch:true,viewport:{width:390,height:844}});
    const errors=[],network=[];
    try {
      await context.route(/^https?:/,route=>{network.push(route.request().url());return route.abort();});
      const touch=await context.newPage(); touch.on('pageerror',e=>errors.push(e.message));
      await touch.goto(pathToFileURL(path.resolve(product)).href); await touch.waitForFunction(()=>!!globalThis.Akari?.app);
      await installRegressionProject(touch); await touch.locator('#uiLevel').selectOption('basic');
      const before=await state(touch), summary=touch.locator('#basicActionGuide > summary');
      async function tap(locator){const r=await reachable(locator);assert.ok(r.width>=24&&r.height>=24);await touch.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);}
      const touchTarget=await reachable(summary);
      await tap(summary); assert.notEqual(await touch.locator('#basicActionGuide').getAttribute('open'),null);
      const help=await textFits(touch.locator('#basicActionGuide p'));
      assert.match(await touch.locator('#saveActionHelp').innerText(),/あとで続きを作る/);
      await shot(touch,'child-touch-help-top');
      const tailReach=await touchPanelTail(touch,'#basicActionGuide');
      await shot(touch,'child-touch-help-tail'); await tap(summary); assert.equal(await touch.locator('#basicActionGuide').getAttribute('open'),null);
      assert.deepEqual(await state(touch),before); assert.deepEqual(errors,[]); assert.deepEqual(network,[]);
      return {hasTouch:true,viewport:{width:390,height:844},help,touchTarget,tailReach,actualTouchscreenTap:true,editingPreserved:true};
    } finally {await context.close();}
  },
};
assert.deepEqual(Object.keys(cases),childLanguageUiIds,'fixed child-language case set');

const browserVersion=await withBrowser(browserPath,async browser=>{
  assert.equal(browser.version(),expectedBrowser.version,'approved Chrome is required');
  for(const [id,run]of Object.entries(cases)) {
    try {
      const evidence=await pageFor(browser,product,async p=>{
        p.on('dialog',dialog=>dialog.accept()); await p.setViewportSize({width:1180,height:757});
        await installRegressionProject(p); const evidence=await run(p);await shot(p,'task-'+id,true);return evidence;
      });
      results.push({id,status:'PASS',pass:true,evidence});
    } catch(error){results.push({id,status:'FAIL',pass:false,detail:String(error.stack||error)});}
    console.log(results.at(-1).status+' '+id); if(!results.at(-1).pass)console.error(results.at(-1).detail);
  }
  return browser.version();
},480000);
assert.deepEqual(snapshot(product),inputs,'test must not modify its product inputs');
const report={schema:'akari-child-language-ui-v1',status:results.every(r=>r.pass)?'PASS':'FAIL',
  environment:process.platform,browser:browserVersion,snapshot:inputs,total:results.length,results,artifacts,
  uiInventoryFrames,uiInventoryArtifacts,childUxProvenance:provenance,
  browserEnvironment:{browser:browserVersion,playwright:playwrightVersion,revision:expectedBrowser.revision,
    launchTimeout:expectedBrowser.launchTimeout,executablePath:path.resolve(browserPath),
    executableSha256:crypto.createHash('sha256').update(fs.readFileSync(browserPath)).digest('hex')},
  coverage:'G3-R/M/A/S/Vの製品側の読み・意味例・操作結果・到達・語まとまり。実児童の理解率は測定していない。',
  pageErrors:[],networkRequests:[],
  limitations:['実IME・OS固有フォント全種・実児童理解・スクリーンリーダー音声はこのsuiteの確認対象外',
    ...(process.platform==='linux'?[]:['Linuxでは未実施。このreportは '+process.platform+' の実行結果'])]};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
assert.equal(report.status,'PASS',results.filter(r=>!r.pass).map(r=>r.id+': '+r.detail).join('\n'));
