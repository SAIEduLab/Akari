import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {currentProductFile} from '../lib/product-path.cjs';
import {withBrowser,pageFor} from '../lib/product-test-host.mjs';
import {LICENSE_TEXT,COPYRIGHT,verifyLicensedArtifact,verifyLicenseBrowserReport,licensingSnapshot,sha} from '../lib/license-contract.cjs';
const require=createRequire(import.meta.url);
const {setupRegressionPage,revealRegressionControl}=require('../browser/cases/regression-setup.cjs');
const [browserPath,output]=process.argv.slice(2);assert.ok(browserPath&&output);
const directory=path.resolve(output.replace(/\.json$/,'.artifacts'));fs.mkdirSync(directory,{recursive:true});
const source=fs.readFileSync(currentProductFile(),'utf8'),standard=path.join(directory,'standard-editor.html');fs.writeFileSync(standard,source);
const variants=[['STANDARD-EDITOR-STANDALONE',standard,'standard-player.html']];
if(source.includes('function configureAkariFoundation')){
  const {buildDerivedProduct}=await import('../../extensions/build.mjs');
  const {offline}=require('../../extensions/examples/offline.js');
  const derived=path.join(directory,'derived-editor.html');
  await buildDerivedProduct({product:currentProductFile(),output:derived,extensions:[offline]});
  variants.push(['DERIVED-EDITOR-STANDALONE',derived,'derived-player.html']);
}
const report={schema:'akari-license-browser-v1',status:'RUNNING',copyright:COPYRIGHT,snapshot:licensingSnapshot(),browser:'',pageErrors:[],networkRequests:[],results:[]};
await withBrowser(browserPath,async browser=>{
  report.browser=browser.version();
  for(const [id,editor,playerName] of variants){
    verifyLicensedArtifact(fs.readFileSync(editor,'utf8'));
    const row=await pageFor(browser,editor,async page=>{
      await setupRegressionPage(page);
      await page.locator('#codeEditor').fill('「MIT監査」と言う。');
      await page.waitForFunction(()=>Akari.app.project.scripts.some(s=>s.source.includes('MIT監査')));
      assert.equal(await page.evaluate(()=>Akari.diagnostics.AKARI_LICENSE),LICENSE_TEXT);
      const pending=page.waitForEvent('download');await (await revealRegressionControl(page.locator('#exportBtn'))).click();await page.locator('#exportControls').click();
      const download=await pending,playerFile=path.join(directory,playerName);await download.saveAs(playerFile);
      verifyLicensedArtifact(fs.readFileSync(playerFile,'utf8'));
      const player=await page.context().newPage();player.on('pageerror',e=>report.pageErrors.push(e.message));
      player.on('request',request=>{if(/^https?:/.test(request.url()))report.networkRequests.push(request.url());});
      await player.goto(pathToFileURL(playerFile).href);await player.locator('#playerStart:not([disabled])').waitFor();
      await player.locator('#playerStart').click();await player.waitForFunction(()=>document.querySelector('#playerOutput')?.textContent.includes('MIT監査'));
      const output=await player.locator('#playerOutput').textContent();await player.locator('#playerStop').click();
      assert.equal(await player.locator('#playerStop').isDisabled(),true);await player.close();
      return{id,status:'PASS',copyright:COPYRIGHT,offline:true,nativeDownload:true,playerStopped:true,output,
        editor:{file:path.basename(editor),sha256:sha(fs.readFileSync(editor))},player:{file:playerName,sha256:sha(fs.readFileSync(playerFile))}};
    });
    report.results.push(row);console.log(id+': PASS');
  }
});
report.status='PASS';verifyLicenseBrowserReport(report,directory);fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log('Actual MIT native exports, standalone players and offline startup: '+report.results.length+' PASS');
