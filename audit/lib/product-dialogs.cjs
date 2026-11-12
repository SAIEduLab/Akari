// The product asks before discarding unsaved work in its own dialog (#loseConfirmModal),
// not with window.confirm. A test that answers every native dialog answers this one the
// same way; a test about the question itself presses the buttons explicitly instead.
async function answerProductConfirms(page, accept = true) {
  await page.addLocatorHandler(page.locator('#loseConfirmModal.show'), async () => {
    await page.locator(accept ? '#loseConfirmProceed' : '#loseConfirmCancel').click();
  });
}

// Saving shows the work's name and asks first (#saveConfirmModal). A test that saves presses はい after the save
// button, before it waits for the download; a test about the question itself presses the buttons explicitly instead.
async function confirmSave(page) {
  await page.locator('#saveConfirmModal.show #saveConfirmYes').click();
}

module.exports = {answerProductConfirms, confirmSave};
