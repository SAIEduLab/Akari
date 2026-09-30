import { currentProductFile, currentProductVersion } from "./../lib/product-path.cjs";
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {withBrowser, pageFor, snapshot} from '../lib/product-test-host.mjs';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {designerZoomIds, verifyDesignerZoom} from '../lib/feature-contract.mjs';

const [browserPath, output] = process.argv.slice(2);
assert.ok(output && !fs.existsSync(output), 'fresh designer evidence required');
const artifacts = path.join(path.dirname(output), 'designer-zoom');
fs.mkdirSync(artifacts, {recursive: true});
const inputs = snapshot(currentProductFile()), results = [];
const settle = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 0.001, `${label}: ${a} vs ${b}`);
async function reveal(locator) {
  if (!await locator.isVisible()) for (const panel of await locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())
    await panel.locator('.blockui-side-toggle').click();
  return locator;
}
async function select(p, id) { await (await reveal(p.locator('#objectSelect'))).selectOption(id); }
async function mode(p, value) { await (async()=>{const control=p.locator('#editorMode' + value); await openBodyForTest(control.page()); return control.click();})(); await settle(p); }
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
  const pending = p.waitForEvent('download'); await p.locator(button).click();
  const dest = path.resolve(artifacts, name); await (await pending).saveAs(dest); return dest;
}
async function openFile(p, file) {
  const pending = p.waitForEvent('filechooser'); await p.locator('#openBtn').click();
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
      assert.equal(after.c.x, Math.round(before.c.x + 12 / g.scale));
      assert.equal(after.c.y, Math.round(before.c.y + 8 / g.scale));
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
      // Box resizing retains fractional geometry; dragging alone snaps position to pixels.
      assert.equal(after.c.direction, 0); assert.equal(after.c.scalePercent, 100);
      near(resized.w, after.c.w + 8 / g.scale, 'resized width in project coordinates');
      near(resized.h, after.c.h + 8 / g.scale, 'resized height in project coordinates');
      await p.locator('#undoBtn').click();
      assert.deepEqual(await p.evaluate(() => Akari.app.project.components.find(c => c.id === 'sprite-1')), after.c);
    }
  },
  async 'DESIGN-ZOOM-RUNTIME'(p) {
    await size(p); await (async()=>{const control=p.locator('#codeEditor'); await openBodyForTest(control.page()); return control.fill('「実行中」と言う。\n60秒待つ。');})();
    await p.locator('#runBtn').click(); await p.waitForFunction(() => Akari.app.editorState.state === 'RUNNING');
    const before = await state(p);
    for (const m of ['code', 'blocks']) {
      await mode(p, m); await p.locator('#stageZoomReset').click(); await p.locator('#stageZoomOut').click();
      assert.equal(await p.evaluate(() => Akari.app.editorState.state), 'RUNNING');
      await p.locator('#stageZoomFit').click(); await assertFit(p);
    }
    await p.locator('#pauseBtn').click();
    for (const button of ['#stageZoomIn', '#stageZoomFit']) await p.locator(button).click();
    assert.equal(await p.locator('#continueBtn').isEnabled(), true);
    assert.deepEqual(await state(p), before, 'zoom during run/pause preserves design');
    await p.locator('#stopBtn').click(); await assertFit(p);
  },
  async 'DESIGN-ZOOM-SAVE-EXPORT'(p) {
    await size(p); await (async()=>{const control=p.locator('#codeEditor'); await openBodyForTest(control.page()); return control.fill('「ズーム確認」と言う。');})();
    const saved = await download(p, '#saveBtn', 'zoom.akari.md'), original = fs.readFileSync(saved, 'utf8');
    const before = await state(p); await p.locator('#stageZoomReset').click(); await p.locator('#stageZoomIn').click();
    assert.deepEqual(await state(p), before);
    const second = await download(p, '#saveBtn', 'zoom-again.akari.md');
    assert.equal(fs.readFileSync(second, 'utf8'), original); assert.ok(original.startsWith(("# あかり "+currentProductVersion()+" の作品")));
    await p.waitForFunction(() => document.querySelector('#autosaveState').textContent.includes('済み'));
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
    const project = api.makeDefaultProject(); project.name = '画面サイズの保存';
    project.stage.width = 900; project.stage.height = 600;
    const text = api.serializeProject(project, api.makeDefaultAssetStore());
    await openFile(p, {name: 'size.akari.md', mimeType: 'text/plain', buffer: Buffer.from(text)});
    await p.waitForFunction(name => Akari.app.project.name === name, project.name);
    assert.equal(await p.evaluate(() => Akari.app.project.appVersion), (""+currentProductVersion()+"")); await assertFit(p);
    assert.equal(await p.evaluate(() => Akari.app.project.stage.height), 600);
    const before = await state(p);
    await openFile(p, {name: 'invalid.akari.md', mimeType: 'text/plain', buffer: Buffer.from(before.saved.replace('"formatVersion": 1', '"formatVersion": 2'))});
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
  },
};
assert.deepEqual(Object.keys(cases), designerZoomIds);
const browserVersion = await withBrowser(browserPath, async browser => {
  for (const [id, run] of Object.entries(cases)) {
    try {
      const evidence = await pageFor(browser, currentProductFile(), async p => {
        p.on('dialog', d => d.accept()); await p.setViewportSize({width: 1440, height: 900});
        return await run(p);
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
console.log(("Designer "+currentProductVersion()+": 9/9 cases PASS"));

// Enter the visible body editor before exercising editing operations.
async function openBodyForTest(page) { if (await page.locator("#sourceOverview").isVisible()) await page.locator("#sourceEditBtn").click(); }
