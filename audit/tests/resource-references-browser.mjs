import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {browserEnvironment} from '../lib/browser-environment.mjs';
const require=createRequire(import.meta.url),[chrome,outputArg]=process.argv.slice(2),output=path.resolve(outputArg),product=currentProductFile(),dir=output.replace(/\.json$/,'')+'.artifacts';
const report={schema:'akari-resource-references-browser-v1',status:'RUNNING',snapshot:snapshot(product),uxAcceptance:false,environment:{browser:null,playwright:require('playwright/package.json').version},pageErrors:[],networkRequests:[],results:[]};
fs.mkdirSync(dir,{recursive:true});const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
try{await withBrowser(chrome,async browser=>{
 report.environment.browser=browser.version();assert.equal(browser.version(),browserEnvironment.version);assert.equal(report.environment.playwright,browserEnvironment.playwright);
 const run=async(id,fn)=>{const row={id,status:'RUNNING'};report.results.push(row);try{row.observed=await pageFor(browser,product,async page=>{page.setDefaultTimeout(8000);await page.setViewportSize({width:1366,height:768});page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url());});try{return await fn(page);}catch(error){await page.screenshot({path:path.join(dir,id.replaceAll('/','-')+'.png')}).catch(()=>{});throw error;}});row.status='PASS';}catch(error){row.status='FAIL';row.error=error.stack;}save();console.log(row.status+' '+id);};
 const install=async(page,source)=>{
  const file=await page.evaluate(source=>{const p=Akari.makeDefaultProject();p.name='参照の保護';p.scripts=[{id:'reference-body',targetId:'sprite-1',event:'start',source}];p.actions=[];p.functions=[];p.projectData={variables:[{id:'reference-score',name:'点数',initialValue:0}],lists:[]};return Akari.serializeProject(p,Akari.makeDefaultAssetStore());},source);
  await page.locator('#fileInput').setInputFiles({name:'references.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});await page.waitForFunction(()=>Akari.app.project.name==='参照の保護');await page.locator('#uiLevel').selectOption('advanced');await page.locator('#objectSelect').selectOption('sprite-1');
 };
 const state=page=>page.evaluate(()=>({project:JSON.stringify(Akari.app.project),history:Akari.app.editorState.history,redo:Akari.app.editorState.redo,dirty:Akari.app.editorState.dirty,assets:Akari.app.assetStore.snapshotRefs().map(a=>({id:a.id,sha256:a.sha256}))}));
 const costume=(page,name)=>page.locator('#assetBody .extension-row').filter({has:page.locator('b',{hasText:new RegExp('^'+name+'$')})});
 await run('references/browser-costume-delete-rename-undo',async page=>{
  const source='衣装を「星」にする。 ※ 名前の参照\n「星🐈」と言う。';await install(page,source);await page.locator('#assetBtn').click();const before=await state(page);await costume(page,'星').getByRole('button',{name:'削除',exact:true}).click();assert.deepEqual(await state(page),before);assert.match(await page.locator('#assetBody .reference-issue').textContent(),/1行目/);
  page.once('dialog',d=>d.dismiss());await costume(page,'星').getByRole('button',{name:'名前',exact:true}).click();assert.deepEqual(await state(page),before);
  page.once('dialog',d=>d.accept('夜空'));await costume(page,'星').getByRole('button',{name:'名前',exact:true}).click();const renamed=await state(page),p=JSON.parse(renamed.project);assert.equal(p.scripts[0].source,source.replace('衣装を「星」','衣装を「夜空」'));assert.equal(p.components[0].costumes[0].id,'costume-1');assert.equal(renamed.history,before.history+1);assert.deepEqual(renamed.assets,before.assets);
  await page.locator('#assetClose').click();await page.locator('#undoBtn').click();assert.equal((await state(page)).project,before.project);await page.locator('#redoBtn').click();assert.equal((await state(page)).project,renamed.project);
  const pending=page.waitForEvent('download');await page.locator('#saveBtn').click();const download=await pending,file=path.join(dir,'renamed.akari.md');await download.saveAs(file);const read=await page.evaluate(t=>Akari.parseProjectFile(t).then(r=>({project:JSON.stringify(r.project),assets:r.assetStore.snapshotRefs().map(a=>({id:a.id,sha256:a.sha256}))})),fs.readFileSync(file,'utf8'));assert.equal(read.project,renamed.project);assert.deepEqual(read.assets,before.assets);
  return{deleteRefused:true,cancelUnchanged:true,referenceOnlyRename:true,undoRedo:true,saveExact:true,assetsPreserved:true};
 });
 await run('references/browser-uncertain-source-refuses-delete',async page=>{
  await install(page,'衣装を「まだ途中');await page.locator('#assetBtn').click();const before=await state(page);await costume(page,'星').getByRole('button',{name:'削除',exact:true}).click();assert.deepEqual(await state(page),before);const message=await page.locator('#assetBody .reference-issue').textContent();assert.match(message,/未完成.*調べられません/);return{uncertaintyShown:true,projectHistoryAssetsUnchanged:true};
 });
 await run('references/browser-unused-delete-undo',async page=>{
  await install(page,'「星」と言う。');await page.locator('#assetBtn').click();const before=await state(page);await costume(page,'丸').getByRole('button',{name:'削除',exact:true}).click();await page.waitForFunction(()=>Akari.app.project.components[0].costumes.length===1);await page.waitForFunction(n=>Akari.app.editorState.history===n,before.history+1);await page.locator('#assetClose').click();await page.locator('#undoBtn').click();assert.equal((await state(page)).project,before.project);assert.deepEqual((await state(page)).assets,before.assets);return{unusedDeletionAllowed:true,undoRestoresProjectAndAssets:true};
 });
 await run('references/browser-data-delete-refused',async page=>{
  await install(page,'点数を言う。');await page.locator('#dataBtn').click();const before=await state(page),row=page.locator('#dataBody .extension-row').filter({has:page.locator('b',{hasText:'変数 点数'})});await row.getByRole('button',{name:'削除',exact:true}).click();assert.deepEqual(await state(page),before);assert.match(await page.locator('#dataBody .reference-issue').textContent(),/点数.*削除できません/);return{referenceShown:true,projectHistoryAssetsUnchanged:true};
 });
},120000);}catch(error){report.hostFailure=error.stack;}
report.status=!report.hostFailure&&!report.pageErrors.length&&!report.networkRequests.length&&report.results.length===4&&report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';save();if(report.status!=='PASS')process.exitCode=1;
