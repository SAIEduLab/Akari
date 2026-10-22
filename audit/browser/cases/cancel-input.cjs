// One cancel control per state (FCB-11 under F-23; LANGUAGE.md ブロックの入力): while the block view's floating
// 「決める」「とちゅうで やめる」 is open under the field being typed in, the editor's 「入力を やめる」 is not shown next to
// it; otherwise 「入力を やめる」 cancels the pending input. A step that cancels presses the one that is shown.
// prefix 'editor' is the body editor, 'callable' the 自分で作ったブロック editor.
const assert = require('node:assert/strict');
const ROOTS = Object.freeze({editor: '#blockEditor', callable: '#callableBlocks'});
const pageOf = target => typeof target.goto === 'function' ? target : target.page();
// The cancel control shown now: exactly one of the floating とちゅうで やめる and 入力を やめる.
async function shownCancel(page, prefix = 'editor') {
  const p = pageOf(page);
  const floating = p.locator(`${ROOTS[prefix]} > .blockui-view-controls [data-blockui-action="cancel"]`), bar = p.locator(`#${prefix}Cancel`);
  const shown = [];
  if (await floating.isVisible()) shown.push(floating);
  if (await bar.isVisible()) shown.push(bar);
  assert.equal(shown.length, 1, 'one cancel control is shown for a pending input');
  return shown[0];
}
async function cancelInput(page, prefix = 'editor', click = {}) {
  await (await shownCancel(page, prefix)).click(click);
}
module.exports = {shownCancel, cancelInput};
