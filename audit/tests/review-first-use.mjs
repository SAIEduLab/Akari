import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {snapshot, withBrowser, pageFor} from '../lib/product-test-host.mjs';

const [browserPath, productArg, outputArg] = process.argv.slice(2);
assert.ok(browserPath && productArg && outputArg,
  'usage: node audit/tests/review-first-use.mjs <browser> <product> <output-json>');
const product = path.resolve(productArg);
assert.ok(fs.existsSync(product), 'candidate product exists');
const inputs = snapshot(product);
const results = [];
const pageErrors = [];
const networkRequests = [];
const cases = [
  ['REVIEW-DEFAULTS-FIRST-RUN', reviewDefaults],
  ['REVIEW-QUANTITY-UNIT-SINGLE', reviewUnits],
  ['REVIEW-CONDITION-SEARCH-SWITCH', reviewConditionSearch],
];

async function setup(page) {
  page.setDefaultTimeout(5000);
  await page.setViewportSize({width: 1366, height: 768});
  page.on('dialog', dialog => dialog.accept());
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (/^https?:/i.test(request.url())) networkRequests.push(request.url());
  });
  await page.waitForFunction(() => !!globalThis.Akari?.app);
  await page.locator('#uiLevel').selectOption('advanced');
  await page.locator('#editorModeblocks').click();
  await page.waitForFunction(() => document.querySelector('#editorModeblocks')?.getAttribute('aria-pressed') === 'true');
}

async function addBlock(page, searchText, schemaId) {
  const search = page.locator('#blockEditor [data-blockui-search]:visible').first();
  await search.fill(searchText);
  const add = page.locator(`#blockEditor [data-blockui-action="palette-add"][data-blockui-schema="${schemaId}"]:visible`).first();
  await add.waitFor({state:'visible'});
  await add.click();
  return search;
}

async function openPaletteOptions(page) {
  const details = page.locator('#blockEditor .blockui-palette-options').first();
  if (await details.count() && await details.getAttribute('open') === null)
    await details.locator(':scope > summary').click();
}

async function closePaletteOptions(page) {
  const details = page.locator('#blockEditor .blockui-palette-options').first();
  if (await details.count() && await details.getAttribute('open') !== null)
    await details.locator(':scope > summary').click();
}

async function inputValue(page, schemaId, field = 'value') {
  const node = page.locator(`#blockEditor .blockui-node[data-schema-id="${schemaId}"]`).last();
  const fieldInput = node.locator(`[data-blockui-field="${field}"]`).first();
  return fieldInput.inputValue();
}

async function sourceFromModel(page) {
  return page.evaluate(() => Akari.app.editorState.main.sourceText);
}

async function roundTrip(page, source) {
  await page.locator('#editorModecode').click();
  const code = await page.locator('#codeEditor').inputValue();
  await page.locator('#editorModeblocks').click();
  const after = await sourceFromModel(page);
  assert.equal(code, source, 'code view exposes the same source as the block edits');
  assert.equal(after, source, 'block round trip preserves canonical source');
  return {code, after};
}

async function runUntilVisible(page, phrase) {
  await page.locator('#runBtn').click();
  await page.waitForFunction(text => {
    const bubble = [...document.querySelectorAll('#formSurface .sprite-bubble')].some(node => node.textContent.includes(text));
    const failure = document.querySelector('#failureDialog');
    return bubble || (failure && !failure.hidden && getComputedStyle(failure).display !== 'none');
  }, phrase, {timeout:8000}).catch(() => {});
  const firstObservation = await page.evaluate(() => ({
    bubbles: [...document.querySelectorAll('#formSurface .sprite-bubble')].map(node => node.textContent),
    failure: (() => {
      const dialog = document.querySelector('#failureDialog');
      return dialog && !dialog.hidden && getComputedStyle(dialog).display !== 'none' ? dialog.innerText : '';
    })(),
    spriteTransform: document.querySelector('#formSurface .component')?.style.transform || '',
  }));
  return await page.evaluate(first => ({
    ...first,
    runState: document.querySelector('#runState')?.innerText || '',
    console: document.querySelector('#console')?.innerText || '',
    failure: (() => {
      const dialog = document.querySelector('#failureDialog');
      return dialog && !dialog.hidden && getComputedStyle(dialog).display !== 'none' ? dialog.innerText : first.failure;
    })(),
    finalSpriteTransform: document.querySelector('#formSurface .component')?.style.transform || '',
  }), firstObservation);
}

async function reviewDefaults(page, capture) {
  await setup(page);
  const initial = await sourceFromModel(page);
  const sizeSearch = page.locator('#blockEditor [data-blockui-search]:visible').first();
  await sizeSearch.fill('大きさ');
  const sizePalette = page.locator('#blockEditor [data-blockui-action="palette-add"][data-blockui-schema="LooksCommand:SET_SCALE"]:visible').first();
  const sizePreview = (await sizePalette.locator('.blockui-preview').innerText()).replace(/\s+/g,'');
  await sizePalette.click();
  const scaleNode = page.locator('#blockEditor .blockui-node[data-schema-id="LooksCommand:SET_SCALE"]').last();
  const size = await scaleNode.count() ? await inputValue(page, 'LooksCommand:SET_SCALE')
    : (sizePreview.match(/大きさを([0-9０-９]+)％/)?.[1] || null);
  const sizeBlockMessage = await page.locator('#blockEditor .blockui-message').first().innerText().catch(()=> '');
  const afterSizeSearch = await sizeSearch.inputValue();
  await addBlock(page, '右に回る', 'MotionCommand:TURN_RIGHT');
  const turn = await inputValue(page, 'MotionCommand:TURN_RIGHT');
  await addBlock(page, '言う', 'Say');
  const say = await inputValue(page, 'Say');
  await addBlock(page, '秒待つ', 'WaitTime');
  const wait = await inputValue(page, 'WaitTime');
  const source = await sourceFromModel(page);
  const compilation = await page.evaluate(() => Akari.app.compile().errors.map(error => ({code:error.code, message:error.message})));
  const beforeUndo = source;
  await page.locator('#undoBtn').click();
  const undone = await sourceFromModel(page);
  await page.locator('#redoBtn').click();
  const redone = await sourceFromModel(page);
  const roundtrip = await roundTrip(page, source);
  const runtime = await runUntilVisible(page, 'こんにちは');
  const evidence = {
    initialSource:initial,
    addedDefaults:{scale:size,turnDegrees:turn,say,waitSeconds:wait},
    searchAfterInsertion:afterSizeSearch,sizePalettePreview:sizePreview,sizeBlockMessage,
    scaleNodeInserted:await scaleNode.count()===1,
    source, compilation, undo:{before:beforeUndo,after:undone},redo:redone,roundtrip,runtime,
  };
  capture(evidence);
  assert.equal(size, '100', 'a new scale command starts at the specified 100%');
  assert.equal(turn, '15', 'a new turn command starts at 15 degrees');
  assert.equal(say, 'こんにちは', 'a new Say command starts with a useful Japanese greeting');
  assert.equal(wait, '1', 'a new wait command starts at one second');
  assert.doesNotMatch(sizeBlockMessage, /大きさは1〜1000％/, 'a new scale command is not rejected as zero percent');
  assert.equal(await scaleNode.count(), 1, 'the scale command is inserted into the live script');
  assert.match(initial, /右へ10歩動く/, 'the first-run sample retains its ten-step movement');
  assert.deepEqual(compilation, [], 'new defaults form a valid program');
  assert.doesNotMatch(undone, /1秒待つ/, 'undo removes the latest inserted statement');
  assert.equal(redone, source, 'redo restores the exact source');
  assert.equal(roundtrip.after, source, 'source and blocks round trip');
  assert.equal(runtime.failure, '', 'the new default scale executes without a runtime failure');
  assert.ok(runtime.bubbles.some(text => text.includes('こんにちは')), 'the program visibly speaks its greeting');
  assert.match(runtime.finalSpriteTransform, /rotate\(15deg\)/, 'the new rotation value is reflected on the stage');
  return evidence;
}

async function reviewUnits(page, capture) {
  await setup(page);
  await page.locator('#editorModecode').click();
  const initial = await sourceFromModel(page);
  const sourceInput = page.locator('#codeEditor');
  const afterUnits = '単位のあとまで動いたよ';
  const source = initial + `\n  大きさを100％にする。\n  2秒待つ。\n  「${afterUnits}」と言う。`;
  await sourceInput.fill(source);
  await page.waitForFunction(text=>Akari.app.editorState.main.sourceText===text,source);
  await page.locator('#editorModeblocks').click();
  await page.waitForFunction(()=>document.querySelector('#blockEditor .blockui-node[data-schema-id="LooksCommand:SET_SCALE"]'));
  const readPhrase = async schemaId => page.locator(`#blockEditor .blockui-node[data-schema-id="${schemaId}"]`).last().evaluate(node => ({
    staticPhrase:[...node.querySelectorAll('.blockui-phrase-text')].map(part=>part.textContent).join(''),
    selectedUnits:[...node.querySelectorAll('select[data-blockui-field="unit"]')].map(select=>select.value),
  }));
  const scalePhrase = await readPhrase('LooksCommand:SET_SCALE');
  const waitPhrase = await readPhrase('WaitTime');
  const scaleSource = await sourceFromModel(page);
  const unitRoundtrip = await roundTrip(page, scaleSource);
  const state = await runUntilVisible(page, afterUnits);
  const evidence = {scalePhrase,waitPhrase,source:scaleSource,roundtrip:unitRoundtrip,runtime:state};
  capture(evidence);
  assert.equal([...scalePhrase.staticPhrase].filter(char => char === '％').length + scalePhrase.selectedUnits.filter(unit=>unit==='％').length, 1,
    'a scale command presents its percent unit exactly once');
  assert.equal([...waitPhrase.staticPhrase].filter(char => char === '秒').length + waitPhrase.selectedUnits.filter(unit=>unit==='秒').length, 1,
    'a wait command presents its seconds unit exactly once');
  assert.deepEqual(scalePhrase.selectedUnits,['％'],'the scale unit selector remains editable and keeps its unit');
  assert.deepEqual(waitPhrase.selectedUnits,['秒'],'the wait unit selector remains editable and keeps its unit');
  assert.match(scaleSource, /大きさを100％にする/);
  assert.match(scaleSource, /2秒待つ/);
  assert.equal(unitRoundtrip.after, scaleSource, 'unit metadata survives code/block conversion');
  assert.equal(state.failure, '', 'unit-bearing defaults execute normally');
  assert.ok(state.bubbles.some(text => text.includes(afterUnits)), 'the program reaches its statement after the unit-bearing commands');
  return evidence;
}

async function reviewConditionSearch(page, capture) {
  await setup(page);
  const search = await addBlock(page, 'もし', 'IfStatement');
  const searchAfterStatement = await search.inputValue();
  const conditionPicker = page.locator('#blockEditor [data-blockui-action="hole-select-expression"][aria-label="条件の値を選ぶ"]:visible');
  await conditionPicker.click();
  await openPaletteOptions(page);
  const mode = page.locator('#blockEditor [data-blockui-palette-mode]:visible').first();
  await mode.selectOption('expression');
  await closePaletteOptions(page);
  const list = page.locator('#blockEditor [data-blockui-action="palette-add"][data-blockui-schema="BooleanLiteral"]:visible').first();
  const noResultsWithOldQuery = await list.count() === 0;
  if (searchAfterStatement) await search.fill('');
  await list.waitFor({state:'visible'});
  const enabled = await list.getAttribute('aria-disabled');
  await list.click();
  const ifNode = page.locator('#blockEditor .blockui-node[data-schema-id="IfStatement"]').last();
  const bodyPicker = ifNode.locator('[data-blockui-action="hole-select-statement"][aria-label="条件が成り立つときに命令を入れる"]');
  await bodyPicker.click();
  await openPaletteOptions(page);
  await page.locator('#blockEditor [data-blockui-palette-mode]:visible').first().selectOption('statement');
  await closePaletteOptions(page);
  await addBlock(page, '言う', 'Say');
  const branchText = '条件が成り立ったよ';
  const branchInput = page.locator('#blockEditor .blockui-node[data-schema-id="Say"]').last().locator('[data-blockui-field="value"]');
  await branchInput.fill(branchText);
  await branchInput.press('Enter');
  const source = await sourceFromModel(page);
  const compile = await page.evaluate(() => Akari.app.compile().errors.map(error => ({code:error.code,message:error.message})));
  const roundtrip = await roundTrip(page, source);
  const runtime = await runUntilVisible(page, branchText);
  const evidence = {searchAfterIfInsertion:searchAfterStatement,noBooleanResultBeforeManualClear:noResultsWithOldQuery,
    booleanCandidateEnabled:enabled,source,compile,roundtrip,runtime};
  capture(evidence);
  assert.equal(searchAfterStatement, '', 'choosing a statement clears the now stale search query');
  assert.equal(enabled, 'false', 'a boolean expression is available in the condition hole');
  assert.deepEqual(compile, [], 'the selected condition and body form valid source');
  assert.equal(roundtrip.after, source, 'the condition and body survive code/block conversion');
  assert.equal(runtime.failure, '', 'condition source runs without failure');
  assert.ok(runtime.bubbles.some(text => text.includes(branchText)), 'the chosen branch visibly runs');
  return evidence;
}

await withBrowser(browserPath, async browser => {
  const version = browser.version();
  for (const [id, run] of cases) {
    let evidence = null;
    try {
      evidence = await pageFor(browser, product, async page => {
        return await run(page, value => { evidence = value; });
      });
      results.push({id,pass:true,status:'PASS',detail:'PASS',evidence});
    } catch (error) {
      results.push({id,pass:false,status:'FAIL',detail:error.stack || error.message,evidence});
    }
  }
  const report = {
    schema:'akari-independent-review-v1',
    group:'first-use',
    status:results.every(result=>result.pass) && pageErrors.length===0 && networkRequests.length===0 ? 'PASS' : 'FAIL',
    snapshot:inputs,
    browser:{name:'Chromium',version,platform:process.platform,architecture:os.arch()},
    results,
    pageErrors,
    networkRequests,
  };
  const output=path.resolve(outputArg);
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  for(const result of results) console.log(`${result.pass?'PASS':'FAIL'} ${result.id}`);
  console.log(`REPORT ${output}`);
  if(report.status!=='PASS') process.exitCode=1;
},120000);
