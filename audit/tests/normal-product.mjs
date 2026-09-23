import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {withBrowser,pageFor,snapshot,sha} from '../lib/product-test-host.mjs';
const [browserPath,product,output]=process.argv.slice(2),dir=path.resolve(path.dirname(output));
fs.mkdirSync(dir,{recursive:true});
const before=snapshot(product),literal="'); globalThis.__injected = true; //",source='「'+literal+'」と言う。';
async function reveal(locator){
 if(!await locator.isVisible())for(const panel of await locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())await panel.locator('.blockui-side-toggle').click();
 for(const details of await locator.locator('xpath=ancestor::details[not(@open)]').all())await details.locator(':scope > summary').click();
 return locator;
}
const evidence=await withBrowser(browserPath,async browser=>{
 const files=await pageFor(browser,product,async p=>{
  p.on('dialog',d=>d.accept());
  assert.equal(await p.evaluate(()=>Object.keys(Akari).some(k=>/^run.*Tests/.test(k))),false);
  assert.equal(await p.locator('#selfTestReport').count(),0);
  await (await reveal(p.locator('#objectSelect'))).selectOption('stage');
  await (await reveal(p.locator('#eventSelect'))).selectOption('start');
  await (await reveal(p.locator('#codeEditor'))).fill(source);
  await p.waitForFunction(source=>Akari.app.editorState.main.sourceText===source,source);
  await (await reveal(p.locator('#editorModeblocks'))).click();
  await (await reveal(p.locator('#editorModecode'))).click();
  assert.equal(await p.locator('#codeEditor').inputValue(),source);
  const saved=path.join(dir,'normal-product.akari.md');
  let pending=p.waitForEvent('download');await (await reveal(p.locator('#saveBtn'))).click();await (await pending).saveAs(saved);
  await (await reveal(p.locator('#newBtn'))).click();
  await p.locator('#fileInput').setInputFiles(saved);
  await p.waitForFunction(source=>Akari.app.editorState.main.sourceText===source,source);
  assert.equal(await p.locator('#codeEditor').inputValue(),source);
  const generated=path.join(dir,'normal-player.html');
  pending=p.waitForEvent('download');await (await reveal(p.locator('#exportBtn'))).click();await (await pending).saveAs(generated);
  assert.equal(await p.evaluate(()=>globalThis.__injected),undefined);
  assert.equal(await p.evaluate(()=>document.documentElement.hasAttribute('data-selftest-failed')),false);
  await p.screenshot({path:path.join(dir,'normal-editor.png'),fullPage:true});
  return {saved,generated};
 });
 const text=fs.readFileSync(files.generated,'utf8');
 for(const token of ['runReleaseTests','selfTestReport','audit/suites','A09-EXT-'])assert.ok(!text.includes(token));
 const context=await browser.newContext({offline:true});
 const errors=[],network=[];
 try {
  await context.route(/^https?:/,r=>{network.push(r.request().url());return r.abort();});
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(pathToFileURL(files.generated).href);
  await p.locator('#playerStart:not([disabled])').click();
  await p.waitForFunction(literal=>document.querySelector('#playerOutput').textContent.includes(literal),literal);
  assert.equal(await p.evaluate(()=>globalThis.__injected),undefined);
  assert.equal(await p.evaluate(()=>globalThis.Akari),undefined);
  await p.screenshot({path:path.join(dir,'normal-player.png'),fullPage:true});
  await p.locator('#playerStop').click();
  assert.equal(await p.locator('#playerStop').isDisabled(),true);
 } finally {await context.close();}
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
 // Observe cleanup across fresh contexts, including storage, globals and listeners.
 await pageFor(browser,product,p=>p.evaluate(()=>{localStorage.setItem('external-isolation','dirty');globalThis.__externalIsolation=1;window.addEventListener('click',()=>{globalThis.__externalIsolation++});setInterval(()=>{globalThis.__externalIsolation++},1);}));
 await pageFor(browser,product,async p=>assert.deepEqual(await p.evaluate(()=>({stored:localStorage.getItem('external-isolation'),global:typeof globalThis.__externalIsolation})),{stored:null,global:'undefined'}));
 return {browser:browser.version(),sourcePreserved:true,saveReload:true,exportOffline:true,noAuditGlobal:true,stringNotExecuted:true,freshContextIsolation:true,
  generated:{bytes:Buffer.byteLength(text),sha256:sha(text),lines:text.split('\n').length-1},savedSha256:sha(fs.readFileSync(files.saved))};
});
assert.deepEqual(snapshot(product),before);
fs.writeFileSync(output,JSON.stringify({status:'PASS',snapshot:before,...evidence},null,2)+'\n');console.log('Normal GUI save/reload/export/offline/isolation: PASS');
