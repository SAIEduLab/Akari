import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {browserEnvironment} from '../lib/browser-environment.mjs';
const require=createRequire(import.meta.url),[chrome,outputArg]=process.argv.slice(2),output=path.resolve(outputArg),product=currentProductFile(),dir=output.replace(/\.json$/,'')+'.artifacts';
const report={schema:'akari-search-bindings-browser-v1',status:'RUNNING',snapshot:snapshot(product),uxAcceptance:false,environment:{browser:null,playwright:require('playwright/package.json').version},pageErrors:[],networkRequests:[],results:[]};
fs.mkdirSync(dir,{recursive:true});const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
try{await withBrowser(chrome,async browser=>{
 report.environment.browser=browser.version();assert.equal(browser.version(),browserEnvironment.version);assert.equal(report.environment.playwright,browserEnvironment.playwright);
 const run=async(id,fn)=>{const row={id,status:'RUNNING'};report.results.push(row);try{row.observed=await pageFor(browser,product,async page=>{page.setDefaultTimeout(10000);page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url());});try{return await fn(page);}catch(error){await page.screenshot({path:path.join(dir,id.replaceAll('/','-')+'.png')}).catch(()=>{});throw error;}});row.status='PASS';}catch(error){row.status='FAIL';row.error=error.stack;}save();console.log(row.status+' '+id);};
 const install=async(page,source='')=>{
  const file=await page.evaluate(source=>{const p=Akari.makeDefaultProject();p.name='検索の対象';p.scripts=[{id:'search-body',targetId:'sprite-1',event:'start',source}];
   p.projectData={variables:[{id:'score',name:'点数',initialValue:0}],lists:[{id:'items',name:'持ち物',initialValue:['本','ぼうし']}]};p.components[0].localData.variables=[{id:'local-score',name:'点数',initialValue:100}];
   p.actions=[{id:'bow',ownerId:'stage',name:'おじぎ',args:[],source:'右へ15度回る。'}];p.functions=[{id:'price',ownerId:'stage',name:'代金',args:['個数','ねだん'],source:'個数とねだんをかけた数を答えとして返す。'}];return Akari.serializeProject(p,Akari.makeDefaultAssetStore());},source);
  await page.locator('#fileInput').setInputFiles({name:'search.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});await page.waitForFunction(()=>Akari.app.project.name==='検索の対象');await page.locator('#uiLevel').selectOption('advanced');await page.locator('#objectSelect').selectOption('sprite-1');await page.locator('#eventSelect').selectOption('start');if(await page.locator('#sourceOverview').isVisible())await page.locator('#sourceEditBtn').click();await page.locator('#editorModeblocks').click();
 };
 const search=page=>page.locator('#blockEditor [data-blockui-search]');
 const source=page=>page.evaluate(()=>Akari.app.project.scripts.find(s=>s.id==='search-body').source);
 const schemas=page=>page.locator('#blockEditor [data-blockui-schema]').evaluateAll(es=>es.map(e=>e.dataset.blockuiSchema));
 const expected=[['右に行きたい','MotionCommand:MOVE_DIRECTION'],['小さくしたい','LooksCommand:SET_SCALE'],['おおきさ','LooksCommand:SET_SCALE'],['2番目に入れたい','ListInsert'],['点数','VariableRead'],['てんすう','VariableRead'],['おじぎ','UserActionCall'],['代金','UserFunctionCall']];
 for(const width of [1366,1024,390])await run('search/browser-discovery-focus-'+width,async page=>{
  await page.setViewportSize({width,height:768});await install(page,'「本文を守る」と言う。');const before=await source(page);
  for(const [query,schema]of expected){await search(page).click();await search(page).fill(query);assert.ok((await schemas(page)).includes(schema),query);assert.equal(await source(page),before);assert.equal(await search(page).evaluate(e=>document.activeElement===e),true);}
  await search(page).fill('');await search(page).dispatchEvent('compositionstart');await page.keyboard.insertText('てんすう');await search(page).dispatchEvent('compositionend',{data:'てんすう'});assert.ok((await schemas(page)).includes('VariableRead'));
  await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');assert.equal(await search(page).evaluate(e=>document.activeElement===e),true);await page.keyboard.press('Escape');assert.equal(await source(page),before);await search(page).fill('');await search(page).fill('おじぎ');assert.equal(await source(page),before);
  await page.screenshot({path:path.join(dir,'search-'+width+'.png')});return{width,queries:8,sourceUnchanged:true,clickTabCompositionEscape:true};
 });
 await run('search/browser-scope-binding-undo',async page=>{
  await page.setViewportSize({width:1366,height:768});await install(page);await search(page).fill('てんすう');assert.ok(!(await schemas(page)).some(id=>['UserActionCall','UserFunctionCall','ListInsert'].includes(id)));
  const before=await page.evaluate(()=>Akari.app.editorState.history);await page.locator('#blockEditor [data-search-binding="add:自分の点数"]').click();await page.waitForFunction(()=>Akari.app.project.scripts.find(s=>s.id==='search-body').source.includes('自分の点数'));
  const after=await source(page);assert.doesNotMatch(after,/作品の点数/);assert.equal(await page.evaluate(()=>Akari.app.editorState.history),before+1);await page.locator('#undoBtn').click();assert.equal(await source(page),'');await page.locator('#redoBtn').click();assert.equal(await source(page),after);return{qualifier:'self',typed:true,oneHistoryStep:true,undoRedo:true};
 });
 await run('search/browser-function-binding',async page=>{
  await page.setViewportSize({width:1366,height:768});await install(page,'0を言う。');await page.locator('#blockEditor .blockui-node[data-schema-id="Say"] [data-blockui-action="slot-select"]').first().click();await search(page).fill('だいきん');
  await page.locator('#blockEditor [data-search-binding="function:price"]').click();const value=await page.evaluate(()=>{const p=Akari.app.project,s=p.scripts.find(s=>s.id==='search-body'),ast=Akari.parseSyntax(s.source,{symbols:Akari.buildSymbols(p)}).ast;return ast.body[0].value;});assert.equal(value.kind,'UserFunctionCall');assert.equal(value.name,'代金');assert.equal(value.args.length,2);assert.deepEqual(value.argumentNames,['個数','ねだん']);return{name:'代金',args:2,argumentNames:['個数','ねだん']};
 });
 await run('search/browser-intent-values',async page=>{
  await page.setViewportSize({width:1366,height:768});await install(page);await search(page).fill('ひだりにすすみたい');await page.locator('#blockEditor [data-blockui-schema="MotionCommand:MOVE_DIRECTION"]').click();assert.match(await source(page),/左/);
  await search(page).fill('小さくしたい');await page.locator('#blockEditor [data-blockui-schema="LooksCommand:SET_SCALE"]').click();assert.match(await source(page),/50/);
  await search(page).fill('2番目に入れたい');await page.locator('#blockEditor [data-blockui-schema="ListInsert"]').click();assert.match(await source(page),/持ち物の2番目/);return{direction:'left',scale:50,index:2};
 });
 await run('search/browser-unavailable-reason',async page=>{
  await page.setViewportSize({width:1366,height:768});await install(page);await page.locator('#objectSelect').selectOption('stage');if(await page.locator('#sourceOverview').isVisible())await page.locator('#sourceEditBtn').click();await page.locator('#editorModeblocks').click();await search(page).fill('右に行きたい');
  await page.locator('#blockEditor .blockui-palette-options summary').click();await page.locator('#blockEditor input[aria-label="使えない候補も表示"]').check();const b=page.locator('#blockEditor [data-blockui-schema="MotionCommand:MOVE_DIRECTION"]');assert.equal(await b.getAttribute('aria-disabled'),'true');const before=await page.evaluate(()=>JSON.stringify(Akari.app.project));await b.click();assert.match(await page.locator('#blockEditor .blockui-unavailable:visible').textContent(),/部品/);assert.equal(await page.evaluate(()=>JSON.stringify(Akari.app.project)),before);return{reasonShown:true,projectUnchanged:true};
 });
},180000);}catch(error){report.hostFailure=error.stack;}
report.status=!report.hostFailure&&!report.pageErrors.length&&!report.networkRequests.length&&report.results.length===7&&report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';save();if(report.status!=='PASS')process.exitCode=1;
