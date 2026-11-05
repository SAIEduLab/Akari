const fs = require('node:fs');
const path = require('node:path');

async function startInputEvidence(context) {
  await context.tracing.start({screenshots: true, snapshots: true});
  await context.addInitScript(() => {
    window.auditInputEvents = [];
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'keydown']) {
      window.addEventListener(type, event => {
        const row = {type, target: event.target?.id || event.target?.tagName,
          trusted: event.isTrusted, at: performance.now(), button: event.button,
          buttons: event.buttons, key: event.key, x: event.clientX, y: event.clientY};
        window.auditInputEvents.push(row);
        if (window.auditInputEvents.length > 64) window.auditInputEvents.shift();
      }, true);
    }
  });
}

async function captureInputFailure(page, error, directory, id) {
  fs.mkdirSync(directory, {recursive: true});
  const base = path.join(directory, id.replace(/[^a-zA-Z0-9_-]/g, '-'));
  let timer;
  const state = await Promise.race([
    page.evaluate(() => ({visibility: document.visibilityState, focus: document.hasFocus(),
      active: document.activeElement?.id, state: globalThis.Akari?.app?.editorState?.state,
      status: document.querySelector('#statusText')?.textContent,
      playerState: document.querySelector('#playerRoot')?.dataset.state,
      dialogs: [...document.querySelectorAll('.modal.show,dialog[open]')].map(n => n.id),
      events: window.auditInputEvents})).catch(e => ({captureError: e.message})),
    new Promise(resolve => { timer = setTimeout(() => resolve({captureError: 'page did not answer within 2 seconds'}), 2000); }),
  ]);
  clearTimeout(timer);
  await page.screenshot({path: base + '.png', fullPage: true, timeout: 2000}).catch(e => { state.screenshotError = e.message; });
  await page.context().tracing.stop({path: base + '.zip'}).catch(e => { state.traceError = e.message; });
  fs.writeFileSync(base + '.json', JSON.stringify({error: error.stack, ...state}, null, 2) + '\n');
  return state;
}

module.exports = {startInputEvidence, captureInputFailure};
