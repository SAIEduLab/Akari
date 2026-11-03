import cp from 'node:child_process';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

// The first page that draws text on a fresh CI machine waits for the system's fonts to be gathered: in four Windows
// jobs the product's first load took 7.6 to 14.5 s and every later load, in the same or a new browser, about 0.5 s;
// a canvas with Japanese text alone took up to 3.3 s first. A child's computer has its fonts gathered long before. Each
// runner therefore loads the product once in a browser of its own before its first step, outside every test, and
// prints how long it took; the tests keep their own limits. A warm-up that fails stops the runner.
export function warmBrowser(browserPath, product) {
  const started = Date.now();
  // 150 s for the load and 180 s for the whole: ten times the slowest first load measured.
  const r = cp.spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--run', browserPath || '', product], {encoding: 'utf8', timeout: 180000});
  const ms = Date.now() - started;
  if (r.status !== 0 || r.signal || r.error) throw new Error('browser warm-up failed after ' + ms + ' ms: ' + ((r.stderr || '') + (r.error?.message || '')).slice(-1000));
  console.log('browser warm-up: ' + ms + ' ms (' + r.stdout.trim() + ')');
}

if (process.argv[2] === '--run' && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {chromium} = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch({executablePath: process.argv[3] || undefined, headless: true, args: ['--allow-file-access-from-files', '--disable-background-networking']});
  try {
    const page = await (await browser.newContext({offline: true})).newPage(), started = Date.now();
    await page.goto(pathToFileURL(path.resolve(process.argv[4])).href, {timeout: 150000});
    await page.waitForFunction(() => !!globalThis.Akari?.app, undefined, {timeout: 150000});
    console.log('first product load ' + (Date.now() - started) + ' ms');
  } finally { await browser.close(); }
}
