// Explicit historical preconditions, entered through the real file-open and editor UI.
// The production factory and every product API remain untouched.
const {makeRegressionProject} = require('../../fixtures/regression-project.cjs');
const factorySource = `globalThis.makeAkariRegressionProject = (${makeRegressionProject.toString()});`;
async function installRegressionFactory(page) {
  await page.addInitScript({content: factorySource});
  await page.addScriptTag({content: factorySource});
}
async function revealRegressionControl(locator) {
  for (const panel of await locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all()) {
    const toggle = panel.locator('.blockui-side-toggle');
    if (await toggle.count()) await toggle.click();
  }
  for (const detail of await locator.locator('xpath=ancestor::details[not(@open)]').all()) await detail.locator(':scope > summary').click();
  return locator;
}
async function openRegressionEditor(page, {target = 'stage', mode = 'code'} = {}) {
  await (await revealRegressionControl(page.locator('#uiLevel'))).selectOption('advanced');
  if (target) await (await revealRegressionControl(page.locator('#objectSelect'))).selectOption(target);
  if (target) await (await revealRegressionControl(page.locator('#eventSelect'))).selectOption('start');
  if (await page.locator('#sourceOverview').isVisible()) await (await revealRegressionControl(page.locator('#sourceEditBtn'))).click();
  if (mode) await (await revealRegressionControl(page.locator('#editorMode' + mode))).click();
}
async function setupRegressionPage(page, options) {
  await page.waitForFunction(() => !!globalThis.Akari?.app);
  if (await page.locator('#recoveryModal').isVisible()) await page.locator('#recoveryDiscard').click();
  await installRegressionFactory(page);
  const text = await page.evaluate(() => Akari.serializeProject(makeAkariRegressionProject(Akari)));
  await page.locator('#fileInput').setInputFiles({name: 'はじめてのあかり.akari.md', mimeType: 'text/markdown', buffer: Buffer.from(text, 'utf8')});
  await page.waitForFunction(() => Akari.app.project.components.some(c => c.id === 'button-1') && Akari.app.project.projectData.variables.some(v => v.name === '点数'));
  await openRegressionEditor(page, options);
}
module.exports = {makeRegressionProject, installRegressionFactory, setupRegressionPage, openRegressionEditor, revealRegressionControl};

// The old audit assumed palette-created operands and bodies were already filled.
// Reproduce those same explicit preconditions through v2's hole controls.
const legacyBlockDefaults = require('../../fixtures/legacy-1.0.1/block-defaults.json');
async function completeRegressionHoles(page, rootSelector = '#blockEditor', topId = null) {
  const root = page.locator(rootSelector);
  const tree = () => page.evaluate(selector => (selector === '#callableBlocks' ? Akari.app.editorState.draft : Akari.app.editorState.main).blockView, rootSelector);
  const find = (node, id) => {
    if (node.id === id) return node;
    for (const child of [...Object.values(node.inputs || {}).flat(), ...Object.values(node.bodies || {}).flat()]) {
      const match = child && find(child, id); if (match) return match;
    }
    return null;
  };
  const nextHole = (node, expected = legacyBlockDefaults[node.schemaId], parent = null, key = null, index = null, body = false) => {
    if (node.schemaId.startsWith('Hole:')) return {node, expected, parent, key, index, body};
    for (const [k, children] of Object.entries(node.inputs || {})) {
      const list = Array.isArray(children) ? children : [children];
      for (let i = 0; i < list.length; i++) {
        const role = node.schemaId === 'QuantityLiteral' && k === 'value' && expected?.schemaId !== 'QuantityLiteral'
          ? expected : Array.isArray(expected?.inputs?.[k]) ? expected.inputs[k][i] : expected?.inputs?.[k];
        const result = nextHole(list[i], role || legacyBlockDefaults[list[i].schemaId], node, k, Array.isArray(children) ? i : null, false);
        if (result) return result;
      }
    }
    for (const [k, children] of Object.entries(node.bodies || {})) for (let i = 0; i < children.length; i++) {
      const result = nextHole(children[i], expected?.bodies?.[k]?.[i] || legacyBlockDefaults[children[i].schemaId] || legacyBlockDefaults.NoOperation, node, k, i, true);
      if (result) return result;
    }
    return null;
  };
  for (let count = 0; count < 80; count++) {
    const current = await tree(), top = topId ? find(current, topId) : current;
    if (!top) throw Error('Regression setup lost the inserted node: ' + topId);
    const hole = nextHole(top);
    if (!hole) return;
    const expected = hole.expected;
    if (!expected) throw Error('No independent d961dd3 default for hole ' + hole.node.id + ' in ' + hole.parent?.schemaId + '.' + hole.key);
    const node = root.locator('.blockui-node[data-block-id="' + hole.node.id + '"]');
    if (hole.node.schemaId === 'Hole:target') {
      const picker = node.locator('[data-blockui-hole-target]');
      const options = await picker.locator('option').evaluateAll(xs => xs.map(x => x.value).filter(Boolean));
      const value = options.includes(expected.fields.name) ? expected.fields.name : options[0];
      if (!value) throw Error('No declared target for the historical regression fixture');
      await picker.selectOption(value);
    } else {
      const direct = root.locator('[data-expression-hole="true"][data-block-id="' + hole.node.id + '"]');
      if (hole.node.schemaId === 'Hole:expression' && await direct.count() === 1) {
        // Compact numeric holes expose the same expression destination through
        // their owning command's visible Edit disclosure.
        const owner = direct.locator('xpath=ancestor::article[1]');
        await (await revealRegressionControl(owner.locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-extra [data-blockui-action="quantity-expression"]'))).click();
      } else {
        await (await revealRegressionControl(node.locator('[data-blockui-action="hole-select-' + (hole.body ? 'statement' : 'expression') + '"]'))).click();
      }
      await (await revealRegressionControl(root.locator('[data-blockui-search]'))).fill(expected.schemaId);
      await (await revealRegressionControl(root.locator('[data-blockui-schema="' + expected.schemaId + '"]'))).click();
    }
    const parent = find(await tree(), hole.parent.id);
    let inserted = hole.body ? parent.bodies[hole.key][hole.index] : hole.index === null ? parent.inputs[hole.key] : parent.inputs[hole.key][hole.index];
    if (inserted?.schemaId === 'QuantityLiteral' && expected.schemaId !== 'QuantityLiteral') inserted = inserted.inputs.value;
    for (const [key, value] of Object.entries(expected.fields || {})) {
      const control = root.locator('[data-block-id="' + inserted.id + '"][data-blockui-field="' + key + '"]');
      if (!await control.count()) continue;
      const tag = await control.evaluate(el => el.tagName);
      if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) continue;
      const wanted = value === null ? (key === 'qualifier' ? 'none' : '') : String(value);
      if (await control.inputValue() === wanted) continue;
      if (tag === 'SELECT') await (await revealRegressionControl(control)).selectOption(wanted);
      else { await (await revealRegressionControl(control)).fill(wanted); await control.press('Enter'); }
    }
  }
  throw Error('Historical regression hole setup did not finish within 80 explicit inputs');
}
module.exports.completeRegressionHoles = completeRegressionHoles;
