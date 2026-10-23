import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
export const root = path.resolve(import.meta.dirname, '../..');
export const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export {snapshot} from './input-snapshot.cjs';
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
export async function pageFor(browser, product, fn, contextOptions={}) {
  // Existing editor obligations use their original normal/basic presentation.
  // Entry first-start checks explicitly opt out; saved preferences still win.
  const {initialUiLevel='basic',...browserOptions}=contextOptions;
  const context = await browser.newContext({...browserOptions,offline:true});
  const errors = [], network=[];
  try {
    await context.route(/^https?:/, route=>{network.push(route.request().url());return route.abort();});
    const page = await context.newPage();
    if(initialUiLevel!==null&&typeof page.addInitScript==='function')await page.addInitScript(level=>{
      if(localStorage.getItem('akari.uiLevel.v1')===null)localStorage.setItem('akari.uiLevel.v1',level);
    },initialUiLevel);
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
  // The suites compare the product's contract numbers with the release record in features.json, not with copies.
  const contract=JSON.parse(fs.readFileSync(path.join(root,'audit/manifests/features.json'),'utf8')).EXECUTABLE_CONTRACT;
  if(!contract||!['languageContractId','runtimeContractId','programFormatVersion','projectFormatVersion'].every(k=>Number.isInteger(contract[k])))throw Error('features.json EXECUTABLE_CONTRACT missing');
  return `(async () => {\nconst AUDIT_EXECUTABLE_CONTRACT = Object.freeze(${JSON.stringify(contract)});\n${fixture}\n${bindings}\n${body}\nreturn await ${name}();\n})()`;
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
