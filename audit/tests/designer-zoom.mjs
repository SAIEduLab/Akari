import {projectAction} from '../lib/project-actions.cjs';
import {makeRegressionProject,installRegressionProject,showAdvancedCode} from '../lib/gate-ui-fixture.mjs';
import { currentProductFile, currentProductVersion } from "./../lib/product-path.cjs";
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {withBrowser, pageFor, snapshot} from '../lib/product-test-host.mjs';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {answerProductConfirms} from '../lib/product-dialogs.cjs';
import {designerZoomIds, verifyDesignerZoom} from '../lib/feature-contract.mjs';
import {pressStop} from '../lib/stop-press.cjs';
import {chooseView} from '../browser/cases/view-toggle.cjs';
import {observeRunStageMinimum} from '../lib/run-stage-minimum-observations.cjs';

const [browserPath, output] = process.argv.slice(2);
assert.ok(output && !fs.existsSync(output), 'fresh designer evidence required');
const artifacts = path.join(path.dirname(output), 'designer-zoom');
fs.mkdirSync(artifacts, {recursive: true});
const inputs = snapshot(currentProductFile()), results = [];
const settle = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 0.001, `${label}: ${a} vs ${b}`);
async function touchEditing(browser) {
  const rows = [];
  for (const width of [1366, 1024, 760]) {
    const context = await browser.newContext({viewport:{width,height:768},hasTouch:true});
    const p = await context.newPage(), errors = [], requests = [];
    p.on('pageerror', e => errors.push(String(e)));
    p.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
    try {
      await p.goto(pathToFileURL(path.resolve(currentProductFile())).href);
      await p.waitForFunction(() => !!window.Akari?.app);
      await p.locator('#uiLevel').selectOption('advanced'); await chooseView(p,'code');
      await p.locator('.tool[data-type="input"]').click(); await chooseView(p,'blocks');
      await p.locator('.component.ak-input').scrollIntoViewIfNeeded();
      const cdp = await context.newCDPSession(p);
      const read = () => p.evaluate(() => {
        const c = Akari.app.project.components.find(c => c.type === 'input'), f = document.querySelector('#formSurface').getBoundingClientRect(),
          scale = f.width / Akari.app.project.stage.width, x = f.left + c.x * scale, y = f.bottom - c.y * scale,
          lock = document.querySelector('#designRatioLock'), r = lock.getBoundingClientRect();
        return {x:c.x,y:c.y,w:c.w,h:c.h,history:Akari.app.editorState.history,px:x,py:y,
          centerHit:document.elementFromPoint(x,y)?.dataset.runtimeId === c.id,
          covered:x >= r.left && x <= r.right && y >= r.top && y <= r.bottom,ratio:lock.getAttribute('aria-pressed')};
      });
      const drag = async (from, dx, dy) => {
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from.px,y:from.py}]});
        await p.waitForTimeout(40);
        for(let n=1;n<=12;n++) {
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.px+dx*n/12,y:from.py+dy*n/12}]});
          await p.waitForTimeout(20);
        }
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await settle(p);
      };
      const before = await read(); assert.equal(before.covered,false); assert.equal(before.centerHit,true);
      await drag(before,0,7); const wobbled = await read();
      assert.deepEqual([wobbled.x,wobbled.y,wobbled.w,wobbled.h,wobbled.history],[before.x,before.y,before.w,before.h,before.history],'a sub-slop finger wobble changes neither the part nor history');
      await drag(wobbled,0,40); const moved = await read();
      assert.ok(moved.y < before.y - 10,'a vertical finger drag moves the input part');assert.equal(moved.ratio,before.ratio);assert.equal(moved.history,before.history+1);
      await size(p,1200,400);
      await p.locator('#stageZoomReset').scrollIntoViewIfNeeded();await p.locator('#stageZoomReset').click();
      await p.locator('.designer-wrap').scrollIntoViewIfNeeded();
      const pan = await p.evaluate(() => {
        const n=document.querySelector('.designer-wrap'); n.scrollLeft=0; n.scrollTop=0;
        const r=n.getBoundingClientRect(), f=document.querySelector('#formSurface').getBoundingClientRect();
        const x=Math.max(r.left,f.left)+50,y=Math.max(r.top,f.top)+40;
        document.addEventListener('touchstart',e=>{window.__panTarget=e.target.id;},{capture:true,once:true});
        return {left:n.scrollLeft,x,y,overflow:n.scrollWidth-n.clientWidth,url:location.href};
      });
      assert.ok(pan.overflow>100,'100% has a horizontal overflow to reach');
      await drag({px:pan.x,py:pan.y},-130,0);await p.waitForTimeout(250);
      const after = await p.evaluate(() => ({left:document.querySelector('.designer-wrap').scrollLeft,url:location.href,target:window.__panTarget}));
      assert.equal(after.target,'formSurface','the finger starts on the background, clear of touch-adjusted input targets');
      assert.ok(after.left>pan.left+50,'a finger on the background reaches the horizontal overflow');assert.equal(after.url,pan.url);
      assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);rows.push({width,centerHit:before.centerHit,covered:before.covered,wobblePreserved:true,dragged:true,ratioPreserved:moved.ratio===before.ratio,panPixels:after.left-pan.left,urlPreserved:true});
    } finally { await context.close(); }
  }
  return rows;
}
async function reveal(locator) {
  if (!await locator.isVisible()) for (const panel of await locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())
    await panel.locator('.blockui-side-toggle').click();
  return locator;
}
async function select(p, id) { await (await reveal(p.locator('#objectSelect'))).selectOption(id); }
// The one view toggle is pressed only when the other view is on the screen (final call 22); the view asked for must show.
async function mode(p, value) { await chooseView(p, value, {open: openBodyForTest}); await p.waitForFunction(v => document.body.dataset.editorMode === v, value); await settle(p); }
async function size(p, width = 900, height = 600) {
  await select(p, 'stage');
  for (const [index, value] of [[1, width], [2, height]]) {
    const field = await reveal(p.locator('#properties .prop-row input').nth(index));
    await field.fill(String(value)); await field.press('Tab');
  }
  // Property edits settle into the existing 250 ms history debounce before view-only checks.
  await p.waitForTimeout(300);
  await settle(p);
}
const state = p => p.evaluate(() => ({
  saved: Akari.serializeProject(Akari.app.project, Akari.app.assetStore),
  history: Akari.app.editorState.history, redo: Akari.app.editorState.redo,
  dirty: Akari.app.editorState.dirty,
}));
const geometry = p => p.evaluate(() => {
  const w = document.querySelector('.designer-wrap'), f = document.querySelector('#formFrame');
  const v = document.querySelector('.stage-viewport'), s = getComputedStyle(w), r = f.getBoundingClientRect();
  return {scale: document.querySelector('#formSurface').getBoundingClientRect().width / Akari.app.project.stage.width,
    frame: {x: r.x, y: r.y, width: r.width, height: r.height},
    available: {width: w.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight),
      height: w.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom)},
    viewport: {width: v.clientWidth, height: v.clientHeight},
    scroll: {x: w.scrollLeft, y: w.scrollTop, width: w.scrollWidth, height: w.scrollHeight},
    client: {width: w.clientWidth, height: w.clientHeight},
    fit: document.querySelector('#stageZoomFit').getAttribute('aria-pressed'),
    label: document.querySelector('#stageZoomReset').textContent};
});
async function assertFit(p) {
  await settle(p); const g = await geometry(p);
  assert.equal(g.fit, 'true'); assert.ok(g.scale > 0 && g.scale <= 1);
  assert.ok(g.frame.width <= g.available.width + 0.1, 'complete frame fits horizontally');
  assert.ok(g.frame.height <= g.available.height + 0.1, 'complete frame fits vertically');
  assert.ok(g.scroll.width <= g.client.width + 1 && g.scroll.height <= g.client.height + 1, 'fit needs no scrolling');
  assert.equal(g.label, Math.round(g.scale * 100) + '%');
  return g;
}
async function stable(p, count = 60) {
  await settle(p);
  const frames = await p.evaluate(async count => {
    const values = [];
    for (let i = 0; i < count; i++) {
      await new Promise(requestAnimationFrame);
      const r = document.querySelector('#formFrame').getBoundingClientRect();
      values.push([r.x, r.y, r.width, r.height]);
    }
    return values;
  }, count);
  for (let j = 0; j < 4; j++) assert.ok(Math.max(...frames.map(r => r[j])) - Math.min(...frames.map(r => r[j])) < 0.1, 'idle preview must not oscillate');
}
async function download(p, button, name) {
  const pending = p.waitForEvent('download'); if(button==='#exportBtn')await projectAction(p,'exportBtn');else await p.locator(button).click();if(button==='#exportBtn')await p.locator('#exportControls').click();
  const dest = path.resolve(artifacts, name); await (await pending).saveAs(dest); return dest;
}
async function openFile(p, file) {
  const pending = p.waitForEvent('filechooser'); await projectAction(p, 'openBtn');
  await (await pending).setFiles(file);
  await p.waitForFunction(() => Akari.app.editorState.state === 'DESIGN');
  await settle(p);
}
const cases = {
  async 'DESIGN-ZOOM-FIT-CODE'(p) {
    const evidence = [];
    for (const viewport of [{width: 1824, height: 1100}, {width: 1366, height: 768}, {width: 1024, height: 768}]) {
      await p.setViewportSize(viewport);
      for (const [w, h] of [[900, 600], [1200, 800], [200, 150]]) {
        await size(p, w, h); evidence.push({viewport, stage: [w, h], ...await assertFit(p)});
      }
    }
    await size(p); await p.locator('#designerWindow').screenshot({path: path.join(artifacts, 'code-fit.png')});
    return evidence;
  },
  async 'DESIGN-ZOOM-FIT-BLOCKS'(p) {
    const evidence = [];
    for (const viewport of [{width: 1440, height: 900}, {width: 1024, height: 768}, {width: 900, height: 700}]) {
      await p.setViewportSize(viewport);
      for (const [w, h] of [[900, 600], [1200, 800], [640, 400]]) {
        await mode(p, 'code'); await size(p, w, h); await mode(p, 'blocks');
        evidence.push({viewport, stage: [w, h], ...await assertFit(p)});
      }
    }
    await p.locator('#designerWindow').screenshot({path: path.join(artifacts, 'blocks-fit.png')});
    return evidence;
  },
  async 'DESIGN-ZOOM-ZOOM-SCROLL'(p) {
    await size(p); const before = await state(p);
    for (const m of ['code', 'blocks']) {
      await mode(p, m); await p.locator('#stageZoomReset').click();
      near((await geometry(p)).scale, 1, '100%');
      await p.locator('#stageZoomIn').press('Enter'); assert.equal((await geometry(p)).label, '110%');
      await p.locator('#stageZoomOut').press('Space'); assert.equal((await geometry(p)).label, '100%');
      for (let i = 0; i < 10; i++) await p.locator('#stageZoomIn').click();
      assert.equal(await p.locator('#stageZoomIn').isDisabled(), true); assert.equal((await geometry(p)).label, '200%');
      await p.locator('.designer-wrap').hover(); await p.mouse.wheel(300, 300);
      await p.waitForFunction(() => {const e = document.querySelector('.designer-wrap'); return e.scrollTop > 0 && e.scrollLeft > 0;});
      for (let i = 0; i < 19; i++) await p.locator('#stageZoomOut').click();
      assert.equal(await p.locator('#stageZoomOut').isDisabled(), true); assert.equal((await geometry(p)).label, '10%');
      await p.locator('#stageZoomFit').click(); await assertFit(p);
      assert.deepEqual((await geometry(p)).scroll.x, 0); assert.deepEqual((await geometry(p)).scroll.y, 0);
    }
    assert.deepEqual(await state(p), before, 'view operations must preserve project, dirty and history');
  },
  async 'DESIGN-ZOOM-STABLE-RESIZE'(p) {
    await size(p); const before = await state(p);
    for (const m of ['blocks', 'code', 'blocks']) {
      await mode(p, m);
      for (const viewport of [{width: 1366, height: 768}, {width: 900, height: 700}]) {
        await p.setViewportSize(viewport); await assertFit(p); await stable(p);
        await p.locator('#stageZoomReset').click(); await stable(p);
        assert.equal((await geometry(p)).label, '100%');
        await p.locator('#stageZoomFit').click(); await assertFit(p); await stable(p);
      }
    }
    await p.locator('#stageZoomReset').click(); await mode(p, 'code');
    assert.equal((await geometry(p)).label, '100%', 'manual scale survives mode switch');
    await mode(p, 'blocks'); assert.equal((await geometry(p)).label, '100%');
    assert.deepEqual(await state(p), before);
  },
  async 'DESIGN-ZOOM-POINTER-HISTORY'(p) {
    await size(p);
    for (const m of ['code', 'blocks']) {
      await mode(p, m); await p.locator('#stageZoomFit').click(); await p.locator('#stageZoomIn').click();
      await select(p, 'sprite-1');
      const sprite = p.locator('.component[data-id="sprite-1"]'); await sprite.scrollIntoViewIfNeeded();
      const before = await p.evaluate(() => ({c: structuredClone(Akari.app.project.components.find(c => c.id === 'sprite-1')), history: Akari.app.editorState.history}));
      const g = await geometry(p), r = await sprite.boundingBox();
      await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await p.mouse.down();
      await p.mouse.move(r.x + r.width / 2 + 12, r.y + r.height / 2 + 8, {steps: 4}); await p.mouse.up();
      const after = await p.evaluate(() => ({c: structuredClone(Akari.app.project.components.find(c => c.id === 'sprite-1')), history: Akari.app.editorState.history}));
      // The place is measured from the bottom-left corner with たて growing upward (LANGUAGE.md 移動量と座標の意味), so a
      // drag down the screen lowers たてのばしょ; the centre is rounded to whole steps.
      assert.equal(after.c.x, Math.round(before.c.x + 12 / g.scale));
      assert.equal(after.c.y, Math.round(before.c.y - 8 / g.scale));
      assert.equal(after.history, before.history + 1);
      await p.locator('#undoBtn').click();
      assert.deepEqual(await p.evaluate(() => Akari.app.project.components.find(c => c.id === 'sprite-1')), before.c);
      await p.locator('#redoBtn').click();
      assert.deepEqual(await p.evaluate(() => Akari.app.project.components.find(c => c.id === 'sprite-1')), after.c);
      const handle = p.locator('.design-resize-handle[data-resize-direction="se"]');
      await handle.scrollIntoViewIfNeeded(); const hr = await handle.boundingBox();
      await p.mouse.move(hr.x + hr.width / 2, hr.y + hr.height / 2); await p.mouse.down();
      await p.mouse.move(hr.x + hr.width / 2 + 8, hr.y + hr.height / 2 + 8, {steps: 4}); await p.mouse.up();
      const resized = await p.evaluate(() => Akari.app.project.components.find(c => c.id === 'sprite-1'));
      // A handle keeps the centre, so the far side moves too: the corner handle 8 px out adds twice that to はば and 高さ,
      // which are rounded to whole steps (LANGUAGE.md 「せってい」の らん and 編集画面のつまみ).
      assert.equal(after.c.direction, 0); assert.equal(after.c.scalePercent, 100);
      assert.equal(resized.x, after.c.x, 'resizing keeps the centre よこ'); assert.equal(resized.y, after.c.y, 'resizing keeps the centre たて');
      for (const key of ['w', 'h']) {
        assert.ok(Number.isInteger(resized[key]), key + ' is a whole number of steps');
        assert.ok(Math.abs(resized[key] - (after.c[key] + 2 * 8 / g.scale)) <= 1, key + ' grows by twice the handle move: ' + JSON.stringify({resized, after: after.c, scale: g.scale}));
      }
      await p.locator('#undoBtn').click();
      assert.deepEqual(await p.evaluate(() => Akari.app.project.components.find(c => c.id === 'sprite-1')), after.c);
    }
  },
  async 'DESIGN-ZOOM-RUNTIME'(p) {
    await size(p); await (async()=>{const control=p.locator('#codeEditor'); await openBodyForTest(control.page()); return control.fill('「実行中」と言う。\n60秒待つ。');})();
    // The view is chosen on the edit screen (the run screen shows neither the level nor the toggle), so each view runs once.
    for (const m of ['code', 'blocks']) {
      await mode(p, m);
      await p.locator('#runBtn').click(); await p.waitForFunction(() => Akari.app.editorState.state === 'RUNNING');
      const before = await state(p);
      await p.locator('#stageZoomReset').click(); await p.locator('#stageZoomOut').click();
      assert.equal(await p.evaluate(() => Akari.app.editorState.state), 'RUNNING');
      await p.locator('#stageZoomFit').click(); await assertFit(p);
      await p.locator('#pauseBtn').click();
      for (const button of ['#stageZoomIn', '#stageZoomFit']) await p.locator(button).click();
      assert.equal(await p.locator('#continueBtn').isEnabled(), true);
      assert.deepEqual(await state(p), before, 'zoom during run/pause preserves design');
      await pressStop(p.locator('#stopBtn')); await assertFit(p);
    }
    return {runMinimum: await observeRunStageMinimum(p.context().browser(), currentProductFile())};
  },
  async 'DESIGN-ZOOM-SAVE-EXPORT'(p) {
    await size(p); await (async()=>{const control=p.locator('#codeEditor'); await openBodyForTest(control.page()); return control.fill('「ズーム確認」と言う。');})();
    const saved = await download(p, '#saveBtn', 'zoom.akari.md'), original = fs.readFileSync(saved, 'utf8');
    const before = await state(p); await p.locator('#stageZoomReset').click(); await p.locator('#stageZoomIn').click();
    assert.deepEqual(await state(p), before);
    const second = await download(p, '#saveBtn', 'zoom-again.akari.md');
    assert.equal(fs.readFileSync(second, 'utf8'), original); assert.ok(original.startsWith(("# あかり "+currentProductVersion()+" の作品")));
    await p.waitForFunction(() => document.querySelector('#autosaveState').textContent.includes('このパソコンに のこしたよ'));
    await p.reload(); await p.locator('#recoveryModal.show').waitFor();
    await p.locator('#recoveryDiscard').click();
    await openFile(p, saved); await p.waitForFunction(() => Akari.app.project.stage.width === 900); await assertFit(p);
    const generated = await download(p, '#exportBtn', 'zoom-player.html');
    assert.doesNotMatch(fs.readFileSync(generated, 'utf8'), /stageZoomOut|designerHeading/);
    await p.goto(pathToFileURL(generated).href); await p.locator('#playerStart').click();
    await p.waitForFunction(() => document.querySelector('#playerOutput').textContent.includes('ズーム確認'));
    assert.equal(await p.locator('.stage-zoom-controls').count(), 0);
  },
  async 'DESIGN-ZOOM-FORMAT'(p) {
    const api = loadApi(fs.readFileSync(currentProductFile(), 'utf8'));
    const project = makeRegressionProject(api); project.name = '画面サイズの保存';
    project.stage.width = 900; project.stage.height = 600;
    const text = api.serializeProject(project, api.makeDefaultAssetStore());
    await openFile(p, {name: 'size.akari.md', mimeType: 'text/plain', buffer: Buffer.from(text)});
    await p.waitForFunction(name => Akari.app.project.name === name, project.name);
    assert.equal(await p.evaluate(() => Akari.app.project.appVersion), (""+currentProductVersion()+"")); await assertFit(p);
    assert.equal(await p.evaluate(() => Akari.app.project.stage.height), 600);
    const before = await state(p);
    // The saved-file format number is the release record's (features.json), not a copy in this test.
    const format = JSON.parse(fs.readFileSync('audit/manifests/features.json', 'utf8')).EXECUTABLE_CONTRACT.projectFormatVersion;
    const current = '"formatVersion": ' + format, older = before.saved.replace(current, '"formatVersion": 2');
    assert.ok(before.saved.includes(current) && older !== before.saved, 'the saved file names the current format');
    await openFile(p, {name: 'invalid.akari.md', mimeType: 'text/plain', buffer: Buffer.from(older)});
    await p.waitForFunction(() => /F\d{3}/.test(document.querySelector('#console').textContent));
    assert.deepEqual(await state(p), before, 'unsupported-format rejection retains current work');
  },
  async 'DESIGN-ZOOM-NARROW-TOUCH'(p) {
    await p.setViewportSize({width: 390, height: 844}); await size(p, 1200, 800);
    const cdp = await p.context().newCDPSession(p);
    for (const m of ['code', 'blocks']) {
      await mode(p, m); await assertFit(p);
      for (const selector of ['#stageZoomReset', '#stageZoomFit']) {
        const button = p.locator(selector); await button.scrollIntoViewIfNeeded(); const r = await button.boundingBox();
        assert.ok(r.x >= 0 && r.x + r.width <= 390, 'zoom control is reachable on narrow screen');
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: r.x + r.width / 2, y: r.y + r.height / 2}]});
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
        if (selector === '#stageZoomReset') assert.equal((await geometry(p)).label, '100%');
        else await assertFit(p);
      }
      await stable(p); await p.locator('#designerWindow').screenshot({path: path.join(artifacts, m + '-narrow.png')});
    }
    await cdp.detach();
    return {touchEditing:await touchEditing(p.context().browser())};
  },
  // LANGUAGE.md 画面デザイナ: with a handle chosen, an arrow key moves it 1 step that way (10 with Shift), ↑ upward; the
  // centre stays, so the size changes by twice the move, and the keys never move the part. A character whose look is
  // text keeps its shape: ↑・→ add 10% to its size and ↓・← take 10% off (1% with Shift).
  async 'DESIGN-ZOOM-HANDLE-KEYS'(p) {
    const read = () => p.evaluate(() => ({c: structuredClone(Akari.app.project.components.find(c => c.id === 'sprite-1')), history: Akari.app.editorState.history}));
    const press = async (direction, key) => {
      const handle = p.locator(`.design-resize-handle[data-resize-direction="${direction}"]`);
      await handle.scrollIntoViewIfNeeded(); await handle.focus(); const before = await read();
      await p.keyboard.press(key); await settle(p); const after = await read(), label = direction + ' ' + key;
      assert.deepEqual([after.c.x, after.c.y], [before.c.x, before.c.y], label + ' keeps the place');
      assert.equal(after.history, before.history + 1, label + ' is one undo step');
      return {before: before.c, after: after.c, label};
    };
    // The corner handles: the side handles are left out while a part is small on the screen.
    await size(p); await select(p, 'sprite-1');
    const box = [];
    for (const [direction, key, dw, dh] of [['ne', 'ArrowUp', 0, 2], ['ne', 'Shift+ArrowUp', 0, 20], ['ne', 'ArrowDown', 0, -2],
      ['sw', 'ArrowDown', 0, 2], ['ne', 'ArrowRight', 2, 0], ['sw', 'ArrowRight', -2, 0]]) {
      const {before, after, label} = await press(direction, key);
      assert.equal(after.w, before.w + dw, label + ' はば'); assert.equal(after.h, before.h + dh, label + ' 高さ');
      assert.equal(after.scalePercent, before.scalePercent, label + ' keeps the size percent');
      box.push({direction, key, w: after.w, h: after.h});
    }
    // The same character with its text look (丸) is opened from a file and resized by its size percent.
    const api = loadApi(fs.readFileSync(currentProductFile(), 'utf8')), project = makeRegressionProject(api);
    project.name = 'つまみと矢印キー'; project.components.find(c => c.id === 'sprite-1').costumeId = 'costume-2';
    await p.locator('#fileInput').setInputFiles({name: 'text-look.akari.md', mimeType: 'text/plain', buffer: Buffer.from(api.serializeProject(project, api.makeDefaultAssetStore()))});
    // The changed work is not saved, so opening asks first (#loseConfirmModal); the next action answers it (answerProductConfirms).
    await p.waitForFunction(() => document.querySelector('#loseConfirmModal.show')); await p.locator('#designerWindow').hover();
    await p.waitForFunction(name => Akari.app.project.name === name && Akari.app.editorState.state === 'DESIGN', project.name);
    await settle(p);
    await select(p, 'sprite-1');
    const scale = [];
    for (const [key, d] of [['ArrowUp', 10], ['ArrowRight', 10], ['ArrowDown', -10], ['Shift+ArrowLeft', -1]]) {
      const {before, after, label} = await press('se', key);
      assert.equal(after.scalePercent, before.scalePercent + d, label + ' size percent');
      assert.deepEqual([after.w, after.h], [before.w, before.h], label + ' keeps the shape');
      scale.push({key, scalePercent: after.scalePercent});
    }
    return {box, scale};
  },
};
assert.deepEqual(Object.keys(cases), designerZoomIds);
const browserVersion = await withBrowser(browserPath, async browser => {
  for (const [id, run] of Object.entries(cases)) {
    try {
      const evidence = await pageFor(browser, currentProductFile(), async p => {
        p.on('dialog', d => d.accept()); await answerProductConfirms(p, true); await p.setViewportSize({width: 1440, height: 900});
        await installRegressionProject(p);return await run(p);
      });
      results.push({id, pass: true, detail: 'PASS', evidence}); console.log('PASS ' + id);
    } catch (error) { results.push({id, pass: false, detail: error.stack}); console.error('FAIL ' + id + ': ' + error.message); }
  }
  return browser.version();
}, 240000);
assert.deepEqual(snapshot(currentProductFile()), inputs, 'test must not change source inputs');
const report = {schema: 'akari-designer-v1', status: results.every(r => r.pass) ? 'PASS' : 'FAIL',
  environment: 'chromium', browser: browserVersion, snapshot: inputs, results, pageErrors: [], networkRequests: []};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
verifyDesignerZoom(report, inputs);
console.log("Designer "+currentProductVersion()+": "+designerZoomIds.length+"/"+designerZoomIds.length+" cases PASS");

// Enter the visible body editor before exercising editing operations.
async function openBodyForTest(page) { if (await page.locator("#sourceOverview").isVisible()) await page.locator("#sourceEditBtn").click(); }
