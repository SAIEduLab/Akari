import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
export const root = path.resolve(import.meta.dirname, '../..');
export const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function snapshot(product) {
  const published = path.join(root, 'audit/public-files.json');
  if (fs.existsSync(published)) {
    const inputs = JSON.parse(fs.readFileSync(published)).files;
    return {productSha256:sha(fs.readFileSync(product)),
      files:Object.fromEntries(inputs.map(p=>[p,sha(fs.readFileSync(path.join(root,p)))]))};
  }
  const walk = dir => fs.readdirSync(path.join(root, dir), {withFileTypes:true}).flatMap(e => {
    const p = (dir ? dir+'/' : '')+e.name;
    if (['.git','.audit-deps','audit-evidence','__pycache__'].includes(e.name) || p==='audit/browser/cases/media') return [];
    return e.isDirectory() ? walk(p) : [p];
  });
  const inputs = walk('').sort();
  return {productSha256:sha(fs.readFileSync(product)),
    files:Object.fromEntries(inputs.map(p=>[p,sha(fs.readFileSync(path.join(root,p)))]))};
}
export async function withBrowser(browserPath, fn, timeoutMs = 240000) {
  if (!browserPath || !fs.existsSync(browserPath)) throw Error('Required browser environment missing');
  const {chromium} = require('playwright');
  let browser;
  let deadline;
  try {
    browser = await chromium.launch({executablePath:browserPath,headless:true,timeout:15000,args:['--allow-file-access-from-files','--disable-background-networking']});
    return await Promise.race([fn(browser),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('Product test host timeout')),timeoutMs);})]);
  } finally {
    clearTimeout(deadline);
    if(browser) await browser.close();
  }
}
export async function pageFor(browser, product, fn) {
  const context = await browser.newContext({offline:true});
  const errors = [], network=[];
  try {
    await context.route(/^https?:/, route=>{network.push(route.request().url());return route.abort();});
    const page = await context.newPage();
    page.on('pageerror', e=>errors.push(e.message));
    page.setDefaultTimeout(30000);
    await page.goto(pathToFileURL(path.resolve(product)).href);
    await page.waitForFunction(()=>!!globalThis.Akari?.app);
    const result = await fn(page);
    if(errors.length || network.length) throw Error('Page errors/network: '+JSON.stringify({errors,network}));
    return result;
  } finally { await context.close(); }
}
export function suiteExpression(name) {
  if (!/^run[A-Za-z0-9]+Tests(?:\d+)?$/.test(name)) throw Error('Invalid suite name');
  const fixture=fs.readFileSync(path.join(root,'audit/fixtures/regression-project.cjs'),'utf8');
  const bindings=fs.readFileSync(path.join(root,'audit/suites/bindings.js'),'utf8');
  const body=fs.readFileSync(path.join(root,'audit/suites',name+'.js'),'utf8');
  return `(async () => {\n${fixture}\n${bindings}\n${body}\nreturn await ${name}();\n})()`;
}
export async function externalReports(browser, product, names) {
  if(!names.length || new Set(names).size!==names.length) throw Error('Empty or duplicate suite registration');
  const suites=[];
  for(const name of names) {
    const report=await pageFor(browser,product,page=>page.evaluate(suiteExpression(name)));
    if(!report?.results?.length) throw Error('Empty or failed suite registration: '+name);
    suites.push({name,environment:'chromium',status:'PASS',...report});
  }
  return suites;
}
