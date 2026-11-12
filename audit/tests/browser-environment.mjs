import { currentProductFile } from "./../lib/product-path.cjs";
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {browserEnvironment as expected,verifyBrowserEnvironment,checkBrowserVersion,checkPlaywrightVersion} from '../lib/browser-environment.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const [executablePath,output]=process.argv.slice(2);
// The versions are the installed ones: the report records what ran, and the check refuses an older pair.
const playwright=require('playwright/package.json').version;assert.ok(checkPlaywrightVersion(playwright));
assert.ok(!fs.existsSync(output),'fresh environment evidence required');
const report={status:'RUNNING',snapshot:snapshot(currentProductFile()),playwright,revision:expected.revision,
  executablePath,executableSha256:sha(fs.readFileSync(executablePath)),launchTimeout:expected.launchTimeout,launches:[]};
fs.mkdirSync(path.dirname(output),{recursive:true});
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
try{
  // Three independent startup checks, not retries: any failed launch fails this gate.
  for(let id=1;id<=3;id++){
    const start=performance.now();let browser;
    try{
      browser=await chromium.launch({executablePath,headless:true,timeout:expected.launchTimeout,args:['--allow-file-access-from-files','--disable-background-networking']});
      const ms=performance.now()-start;report.browser=browser.version();assert.ok(checkBrowserVersion(report.browser));
      const page=await browser.newPage();
      const result=await page.evaluate(()=>({scriptResult:6*7,mp3:!!document.createElement('audio').canPlayType('audio/mpeg')}));
      report.launches.push({id,browser:browser.version(),ms,...result});assert.equal(report.launches.length,id,'every start is recorded');save();
    }finally{if(browser)await browser.close();}
  }
  assert.deepEqual(snapshot(currentProductFile()),report.snapshot);report.status='PASS';
  verifyBrowserEnvironment(report,report.snapshot);save();
  console.log('Matching browser environment: PASS (3 independent starts)');
}catch(error){report.status='FAIL';report.error=error.stack;save();throw error;}
