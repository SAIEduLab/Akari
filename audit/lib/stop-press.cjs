// ■ 止める does nothing when it is pressed within 0.5 s of ▶ 動かす: that press is the second press of a double press
// (LANGUAGE.md 作る画面と動かす画面 and 書き出した作品のはじめ方; the editor and the exported player alike).
// An audit step that stops a run on purpose therefore presses ■ after that time. The checks that a press within
// 0.5 s is ignored press ■ themselves, without this helper.
const DOUBLE_PRESS_MS = 500;
async function pressStop(locator) {
  await locator.page().waitForTimeout(DOUBLE_PRESS_MS + 50);
  await locator.click();
}
module.exports = { DOUBLE_PRESS_MS, pressStop };
