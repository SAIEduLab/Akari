// ■ 止める does nothing when it is pressed within 0.5 s of ▶ 動かす: that press is the second press of a double press
// (LANGUAGE.md 作る画面と動かす画面 and 書き出した作品のはじめ方; the editor and the exported player alike).
// The place of ⏸ いったん止める／▶ つづける has the same rule: within 0.5 s of a press of ⏸ or ▶ つづける, another press of
// that place does nothing.
// An audit step that stops, pauses or goes on on purpose therefore presses after that time. The checks that a press
// within 0.5 s is ignored press the button themselves, without these helpers.
const DOUBLE_PRESS_MS = 500;
async function pressAfterDoublePress(locator) {
  await locator.page().waitForTimeout(DOUBLE_PRESS_MS + 50);
  await locator.click();
}
const pressStop = pressAfterDoublePress;
module.exports = { DOUBLE_PRESS_MS, pressStop, pressAfterDoublePress };
