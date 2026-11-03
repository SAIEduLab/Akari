// The browser's own zoom (chrome.tabs.setZoom) for an audit run, from a fresh local extension.
// The zoom is set from a page of the extension, not from its service worker: Chrome may stop the worker right
// after it starts, and a stopped worker answers nothing (the run then fails with "Target closed" or waits until
// its timeout). The worker is kept only to learn the extension's address. The manifest carries a fresh public key, so
// the address is known before Chrome starts: a worker that a loaded machine starts late, or stops before it is seen,
// no longer fails the run. If the extension did not load, setNativeZoom still fails, at the extension page.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

let lastExtensionId = null;

export function writeZoomExtension(directory, name) {
  // An unpacked extension's id is the first 128 bits of SHA-256 of its public key, written with the letters a to p.
  const key = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'der' });
  lastExtensionId = [...crypto.createHash('sha256').update(key).digest('hex').slice(0, 32)].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ manifest_version: 3, name, version: '1.0', key: key.toString('base64'), permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
  fs.writeFileSync(path.join(directory, 'worker.js'), 'chrome.runtime.onInstalled.addListener(()=>{});');
  fs.writeFileSync(path.join(directory, 'zoom.html'), '<!doctype html><meta charset="utf-8"><title>zoom</title>');
  return lastExtensionId;
}

export const zoomExtensionArgs = directory => ['--disable-extensions-except=' + directory, '--load-extension=' + directory];

// The extension's worker, as soon as it is known (its address stays readable after it stops). The list is looked at
// again every second, since a worker that starts between the first look and the listener would be missed; after 10 s
// the address made from the manifest key stands in for it.
export async function zoomExtensionWorker(context) {
  const deadline = Date.now() + 10000;
  for (;;) {
    const known = context.serviceWorkers()[0];
    if (known) return known;
    const left = deadline - Date.now();
    if (left <= 0) {
      if (!lastExtensionId) throw Error('the zoom extension worker did not start within 10 s');
      const address = 'chrome-extension://' + lastExtensionId + '/worker.js';
      return { url: () => address };
    }
    try { return await context.waitForEvent('serviceworker', { timeout: Math.min(1000, left) }); }
    catch (error) { if (!/Timeout/.test(String(error))) throw error; }
  }
}

// Sets the zoom of the local product tab and returns the zoom the browser reports; the product page is fronted again.
export async function setNativeZoom(context, worker, page, requested) {
  const control = await context.newPage();
  try {
    await control.goto('chrome-extension://' + new URL(worker.url()).host + '/zoom.html');
    await control.waitForFunction(() => !!globalThis.chrome?.tabs?.setZoom, null, { timeout: 8000 });
    return await control.evaluate(async requested => {
      const tab = (await chrome.tabs.query({})).find(t => t.url?.startsWith('file:'));
      if (!tab) throw Error('local product tab missing');
      await chrome.tabs.setZoom(tab.id, requested);
      return chrome.tabs.getZoom(tab.id);
    }, requested);
  } finally {
    await control.close();
    await page.bringToFront();
  }
}
