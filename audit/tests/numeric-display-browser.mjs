import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {browserEnvironment} from '../lib/browser-environment.mjs';
const require=createRequire(import.meta.url),[chrome,outputArg]=process.argv.slice(2),output=path.resolve(outputArg),product=currentProductFile(),dir=output.replace(/\.json$/,'')+'.artifacts';
const report={schema:'akari-numeric-display-browser-v1',status:'RUNNING',snapshot:snapshot(product),uxAcceptance:false,environment:{browser:null,playwright:require('playwright/package.json').version},pageErrors:[],networkRequests:[],results:[]};
fs.mkdirSync(dir,{recursive:true});const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
try{await withBrowser(chrome,async browser=>{
 report.environment.browser=browser.version();assert.equal(browser.version(),browserEnvironment.version);assert.equal(report.environment.playwright,browserEnvironment.playwright);
 const run=async(id,fn)=>{const row={id,status:'RUNNING'};report.results.push(row);try{row.observed=await pageFor(browser,product,async page=>{page.setDefaultTimeout(8000);await page.setViewportSize({width:1366,height:768});page.on('dialog',d=>d.accept());page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url());});return fn(page);});row.status='PASS';}catch(error){row.status='FAIL';row.error=error.stack;}save();console.log(row.status+' '+id);};
 const install=async(page,source,target='sprite-1')=>{
  const file=await page.evaluate(({source,target})=>{const p=Akari.makeDefaultProject();p.name='表示の実値';p.scripts=[{id:'display-body',targetId:target,event:'start',source}];p.actions=[];p.functions=[];p.projectData={variables:[{id:'display-data',name:'表示値',initialValue:0.30000000000000004}],lists:[]};return Akari.serializeProject(p,Akari.makeDefaultAssetStore());},{source,target});
  await page.locator('#fileInput').setInputFiles({name:'display.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});await page.waitForFunction(()=>Akari.app.project.name==='表示の実値');await page.locator('#uiLevel').selectOption('advanced');
 };
 for(const[source,expected]of [['正弦（30）','0.5'],['余弦（60）','0.5'],['正接（45）','1'],['逆正弦（0.5）','30度'],['逆余弦（0.5）','60度']])await run('display/browser/'+source,async page=>{
  await install(page,source+'を言う。\n10秒待つ。');const raw=await page.evaluate(source=>{const A=Akari,R=A.createAkariRuntime(),p=A.app.project;return R.valueText(A.evalExpression(A.parseExpression(source,A.buildSymbols(p)),{runtime:new A.RuntimeModel(p,{}),runtimeId:'sprite-1',compiled:A.compileProject(p)}));},source);
  await page.locator('#runBtn').click();const bubble=page.locator('.sprite-bubble');await bubble.waitFor();assert.equal(await bubble.evaluate(n=>n.firstChild.textContent),expected);
  if(raw!==expected){await bubble.getByRole('button',{name:'表示を丸めています。実値を見る',exact:true}).click();assert.equal(await page.locator('#valueOutput').textContent(),raw);assert.match(await page.locator('#valueNotice').textContent(),/表示を丸めています/);await page.locator('#valueClose').click();}
  await page.locator('#stopBtn').click();return{source,shown:expected,raw,detailExact:raw!==expected};
 });
 const revealMonitor=async page=>{
  const toggle=page.locator('.monitor-window .blockui-side-toggle');
  if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
  const output=page.locator('.monitor-window .output-disclosure');if(!await output.evaluate(n=>n.open))await output.locator('summary').click();
 };
 for(const width of [1366,1024,390])await run(width===1366?'display/browser-monitor-save-and-text':'display/browser-monitor-'+width,async page=>{
  await page.setViewportSize({width,height:width===390?844:768});
  const source='文字（表示値）を言う。\n10秒待つ。';await install(page,source);await page.locator('#runBtn').click();await page.locator('.sprite-bubble').waitFor();assert.equal(await page.locator('.sprite-bubble').textContent(),'0.30000000000000004');
  await revealMonitor(page);
  const height=await page.locator('#runtimeMonitor').evaluate(n=>n.getBoundingClientRect().height);assert.ok(height>=120,'output must leave a readable monitor region: '+height);
  const row=page.locator('#runtimeMonitor .monitor-row').filter({has:page.locator('.monitor-key',{hasText:'表示値'})});await row.waitFor();await row.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(dir,'monitor-output-'+width+'.png')});assert.equal(await row.locator('.monitor-value').evaluate(n=>n.firstChild.textContent),'0.3');await row.getByRole('button',{name:'表示値の実値（表示を丸めています）',exact:true}).click();
  assert.equal(await page.locator('#valueOutput').textContent(),'0.30000000000000004');assert.match(await page.locator('#valueNotice').textContent(),/丸める前の実値/);await page.locator('#valueClose').click();await page.locator('#stopBtn').click();
  const pending=page.waitForEvent('download');await page.locator('#saveBtn').click();const download=await pending,file=path.join(dir,'display-exact.akari.md');await download.saveAs(file);
  const saved=await page.evaluate(t=>Akari.parseProjectFile(t).then(r=>({initial:r.project.projectData.variables[0].initialValue,source:r.project.scripts[0].source})),fs.readFileSync(file,'utf8'));assert.deepEqual(saved,{initial:0.30000000000000004,source});return{monitor:'0.3',text:'0.30000000000000004',raw:'0.30000000000000004',savedExact:true,width,monitorHeight:height};
 });
 await run('display/browser-stage-output',async page=>{
  await install(page,'正弦（30）を言う。\n10秒待つ。','stage');await revealMonitor(page);await page.locator('#runBtn').click();const full=page.locator('#console').getByRole('button',{name:'表示を丸めています。出力の実値を見る',exact:true});await full.waitFor();assert.match(await page.locator('#console').textContent(),/0\.5/);await full.click();assert.equal(await page.locator('#valueOutput').textContent(),'0.49999999999999994');await page.locator('#valueClose').click();await page.locator('#stopBtn').click();return{shown:'0.5',raw:'0.49999999999999994',detailExact:true};
 });
 await run('display/browser-export-offline',async page=>{
  await install(page,'正弦（30）を言う。\n10秒待つ。');const pending=page.waitForEvent('download');await page.locator('#exportBtn').click();const download=await pending,file=path.join(dir,'display-player.html');await download.saveAs(file);
  const context=await browser.newContext({offline:true}),errors=[],network=[];try{await context.route(/^https?:/,r=>{network.push(r.request().url());return r.abort();});const player=await context.newPage();player.on('pageerror',e=>errors.push(e.message));await player.goto(pathToFileURL(file).href);await player.locator('#playerStart:not([disabled])').click();const bubble=player.locator('.sprite-bubble');await bubble.waitFor();assert.equal(await bubble.evaluate(n=>n.firstChild.textContent),'0.5');await bubble.getByRole('button',{name:'表示を丸めています。実値を見る',exact:true}).click();assert.match(await player.locator('#playerOutput').textContent(),/実値.*0\.49999999999999994/);await player.locator('#playerStop').click();}finally{await context.close();}assert.deepEqual(errors,[]);assert.deepEqual(network,[]);return{shown:'0.5',raw:'0.49999999999999994',offline:true};
 });
},120000);}catch(error){report.hostFailure=error.stack;}
report.status=!report.hostFailure&&!report.pageErrors.length&&!report.networkRequests.length&&report.results.length===10&&report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';save();if(report.status!=='PASS')process.exitCode=1;
