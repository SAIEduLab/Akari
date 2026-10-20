// The browser's own zoom (chrome.tabs.setZoom) for an audit run, from a fresh local extension.
// The zoom is set from a page of the extension, not from its service worker: Chrome may stop the worker right
// after it starts, and a stopped worker answers nothing (the run then fails with "Target closed" or waits until
// its timeout). The worker is kept only to learn the extension's address.
import fs from 'node:fs';
import path from 'node:path';

export function writeZoomExtension(directory, name) {
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ manifest_version: 3, name, version: '1.0', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
  fs.writeFileSync(path.join(directory, 'worker.js'), 'chrome.runtime.onInstalled.addListener(()=>{});');
  fs.writeFileSync(path.join(directory, 'zoom.html'), '<!doctype html><meta charset="utf-8"><title>zoom</title>');
}

export const zoomExtensionArgs = directory => ['--disable-extensions-except=' + directory, '--load-extension=' + directory];

// The extension's worker, as soon as it is known (its address stays readable after it stops).
export async function zoomExtensionWorker(context) {
  return context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
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
