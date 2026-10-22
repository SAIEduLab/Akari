// The コード／ブロック toggle (final call 22; LANGUAGE.md 作る画面と動かす画面). One button shows the view that is on the
// screen with a switch mark, 「ブロックモード ⇄」 or 「コードモード ⇄」, and a press switches to the other view. Its group
// holds the two buttons of 1.4.0, and only the one that switches away from the view shown is there: #…Modecode while
// the blocks show, #…Modeblocks while the code shows. The button's accessible name states the view shown.
// Where a press cannot switch (はじめて, a work with a 名人 text, a mistake in the code) the view stays and a note under
// the button (role=status) says why, until the next press or key.
// prefix 'editor' is the body editor, 'callable' the 自分で作ったブロック editor.
const assert = require('node:assert/strict');
const VIEW_NAMES = Object.freeze({blocks: 'ブロックモード', code: 'コードモード'});
const REFUSAL_NOTES = Object.freeze({
  entry: 'コードで 書くときは、上の「かんたん」か「くわしく」を えらんでね',
  meijin: '名人は、コードモードで だけ 使えるよ',
  error: 'コードの 赤い ところを 直すと、ブロックに もどれるよ',
});
const NOTE_IDS = Object.freeze({editor: 'modeBlockedNote', callable: 'callableModeBlockedNote'});
const pageOf = target => typeof target.page === 'function' && typeof target.locator === 'function' && typeof target.goto !== 'function' ? target.page() : target;
// The one toggle button shown, whatever view it names.
const viewToggle = (page, prefix = 'editor') => pageOf(page).locator(`#${prefix}Modecode:not([hidden]), #${prefix}Modeblocks:not([hidden])`);
// What the toggle says: the view it names, its label and its accessible name. Exactly one of the two buttons is there.
async function readViewToggle(page, prefix = 'editor') {
  const shown = await pageOf(page).evaluate(prefix => ['code', 'blocks'].map(target => {
    const b = document.getElementById(prefix + 'Mode' + target);
    return b && !b.hidden ? {target, label: b.textContent, name: b.getAttribute('aria-label'), disabled: b.disabled,
      refused: b.dataset.refused || null, describedBy: b.getAttribute('aria-describedby')} : null;
  }).filter(Boolean), prefix);
  assert.equal(shown.length, 1, 'one コード／ブロック toggle is shown');
  const [b] = shown, view = b.target === 'code' ? 'blocks' : 'code';
  return {view, ...b};
}
// The view the toggle says is on the screen; its label and accessible name agree.
async function shownView(page, prefix = 'editor') {
  const t = await readViewToggle(page, prefix);
  assert.equal(t.label, VIEW_NAMES[t.view] + ' ⇄', 'the toggle shows the view on the screen with ⇄');
  assert.equal(t.name, VIEW_NAMES[t.view], 'the toggle\'s accessible name states the view on the screen');
  return t.view;
}
// Shows the given view with the toggle. A press is made only when the other view is on the screen: in 1.4.0 a press of
// the view already chosen did nothing, and 1.5.0 has no button for it. Before the view is read, `reveal` gets the
// button (it opens folded panels around it and returns it) and `open` gets the page (it opens the body from the list of
// all bodies), as the 1.4.0 steps did before their press. A press is not checked to have switched, so a refused press
// is left for the caller to see.
async function chooseView(page, view, {prefix = 'editor', reveal, open, click = {}} = {}) {
  assert.ok(view === 'blocks' || view === 'code', 'view is blocks or code');
  let button = pageOf(page).locator(`#${prefix}Mode${view}`);
  if (reveal) button = (await reveal(button)) || button;
  if (open) await open(pageOf(page));
  if (await shownView(page, prefix) === view) return false;
  await button.click(click);
  return true;
}
// Presses the toggle once, whatever it shows (a refused press stays in its view).
async function pressViewToggle(page, prefix = 'editor', click = {}) {
  const view = await shownView(page, prefix);
  await pageOf(page).locator(`#${prefix}Mode${view === 'blocks' ? 'code' : 'blocks'}`).click(click);
  return view;
}
// The refusal note under the toggle when it shows, else ''.
async function viewRefusalNote(page, prefix = 'editor') {
  return pageOf(page).evaluate(id => {
    const n = document.getElementById(id);
    return n && !n.hidden && n.getClientRects().length ? n.textContent : '';
  }, NOTE_IDS[prefix]);
}
// Presses the toggle where it cannot switch and checks the refusal: the view stays, the button points to its note
// (aria-describedby) and the note under it, role=status, gives the reason of that refusal.
async function refusedViewPress(page, refusal, prefix = 'editor') {
  assert.ok(Object.hasOwn(REFUSAL_NOTES, refusal), 'known refusal ' + refusal);
  const before = await readViewToggle(page, prefix);
  assert.equal(before.refused, refusal, 'the toggle is refused for ' + refusal);
  assert.equal(before.describedBy, NOTE_IDS[prefix], 'the refused toggle points to its note');
  await pressViewToggle(page, prefix);
  const view = await shownView(page, prefix), note = await viewRefusalNote(page, prefix);
  assert.equal(view, before.view, 'a refused press keeps the view');
  assert.equal(note, REFUSAL_NOTES[refusal], 'the note under the toggle says why');
  assert.equal(await pageOf(page).locator('#' + NOTE_IDS[prefix]).getAttribute('role'), 'status');
  return {view, note};
}
module.exports = {VIEW_NAMES, REFUSAL_NOTES, NOTE_IDS, viewToggle, readViewToggle, shownView, chooseView, pressViewToggle, viewRefusalNote, refusedViewPress};
