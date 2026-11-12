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
// When the product's page does not finish loading, the error also says how far its document got, whether the browser
// answers on a new blank page of the same context within 2 s, and how many pages the context has, so that a stall shows
// where it was instead of a bare timeout (a load once stalled for 30 s at the start of a suite in CI).
const answers=page=>page.waitForFunction(()=>document.readyState,undefined,{timeout:2000}).then(h=>h.jsonValue(),error=>'no answer: '+error.name);
export async function withLoadEvidence(context,page,load){
  try { return await load(); }
  catch(error) {
    let blank;try{const other=await context.newPage();blank=await answers(other);await other.close();}catch(e){blank='no page: '+e.name;}
    error.message+='\nload evidence: '+JSON.stringify({page:await answers(page),blank,pages:context.pages().length});
    throw error;
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
    await withLoadEvidence(context,page,()=>page.goto(pathToFileURL(path.resolve(product)).href));
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
// The suite functions a suite of audit/manifests/product-tests.json runs, each from its own file and in a product of its
// own: the suite's name, or its parts, which are the suite's name and then that name numbered from 2. The results of
// the parts together are the suite's results, under the suite's name.
export function suiteParts(suite) {
  if (suite.parts === undefined) return [suite.name];
  const parts = suite.parts;
  if (!Array.isArray(parts) || parts.length < 2 || parts.some((part, i) => part !== (i ? suite.name + (i + 1) : suite.name))) throw Error('Invalid suite parts: ' + suite.name);
  return parts;
}
// The suite functions of the named suites of audit/manifests/product-tests.json, in order.
export function suiteRuns(names) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'audit/manifests/product-tests.json'), 'utf8'));
  return names.flatMap(name => {
    const suite = manifest.suites.find(s => s.name === name);
    if (!suite) throw Error('Suite missing from the manifest: ' + name);
    return suiteParts(suite);
  });
}
// parts: the parts of a suite by its name (suiteParts); a suite without an entry runs as itself.
export async function externalReports(browser, product, names, parts = {}) {
  if(!names.length || new Set(names).size!==names.length) throw Error('Empty or duplicate suite registration');
  const suites=[];
  for(const name of names) {
    const reports=[];
    for(const part of parts[name]??[name]) {
      const report=await pageFor(browser,product,page=>page.evaluate(suiteExpression(part)));
      if(!report?.results?.length) throw Error('Empty or failed suite registration: '+part);
      reports.push(report);
    }
    const sum=key=>reports.reduce((n,r)=>n+r[key],0);
    suites.push({name,environment:'chromium',status:'PASS',...(reports.length===1?reports[0]:{total:sum('total'),passed:sum('passed'),failed:sum('failed'),results:reports.flatMap(r=>r.results)})});
  }
  return suites;
}
