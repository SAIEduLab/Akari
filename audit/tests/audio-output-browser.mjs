import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {withBrowser,snapshot,sha} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {browserEnvironment} from '../lib/browser-environment.mjs';
import {audioOutputCases,fixtureWave,wave,measureWave,verifyAudioOutput} from '../lib/audio-output-contract.mjs';
const require=createRequire(import.meta.url),[chrome,out]=process.argv.slice(2),output=path.resolve(out),baseDir=path.dirname(output),dir=path.join(baseDir,'audio-output-browser.artifacts'),product=currentProductFile();
assert.ok(!fs.existsSync(output),'fresh output required');fs.mkdirSync(dir,{recursive:true});
const report={schema:'akari-audio-output-browser-v1',status:'RUNNING',snapshot:snapshot(product),uxAcceptance:false,observation:'WebAudio final output PCM; original destination connection retained',environment:{browser:null,playwright:require('playwright/package.json').version},pageErrors:[],networkRequests:[],results:[]};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');

// Measurement-only branch. Every original connect call is forwarded unchanged.
// The final gain feeds an additional recorder whose output is zero. The product's
// source, gain, destination, start/stop methods and ended callback are unmodified.
function installOutputProbe(){
 const connect=AudioNode.prototype.connect,upstream=new WeakMap(),voices=[],markers=[];
 globalThis.audioOutputProbe={voices,markers};
 AudioNode.prototype.connect=function(destination,...args){
  const result=connect.call(this,destination,...args);
  if(destination instanceof AudioNode)upstream.set(destination,this);
  if(destination instanceof AudioDestinationNode){
   const context=this.context,source=upstream.get(this);if(!source||!(source instanceof AudioScheduledSourceNode))throw Error('Unrecognized product audio output route');
   const recorder=context.createScriptProcessor(1024,1,1),record={rate:context.sampleRate,connectedAt:context.currentTime,endTime:null,frames:[],sourceType:source.constructor.name};voices.push(record);
   source.addEventListener('ended',()=>{record.endTime=context.currentTime;},{once:true});
   recorder.onaudioprocess=e=>{record.frames.push(Array.from(e.inputBuffer.getChannelData(0)));e.outputBuffer.getChannelData(0).fill(0);};
   connect.call(this,recorder);connect.call(recorder,destination);
   record.context=context;record.recorder=recorder;
  }
  return result;
 };
 addEventListener('DOMContentLoaded',()=>new MutationObserver(()=>{
  const context=voices[0]?.context;if(!context)return;
  for(const node of document.querySelectorAll('.sprite-bubble-text')){
   const text=node.textContent;if(['通過','解放','別音終了'].includes(text)&&!markers.some(m=>m.text===text))markers.push({text,time:context.currentTime});
  }
 }).observe(document.body,{childList:true,subtree:true,characterData:true}));
}
try{await withBrowser(chrome,async browser=>{
 report.environment.browser=browser.version();assert.equal(browser.version(),browserEnvironment.version);assert.equal(report.environment.playwright,browserEnvironment.playwright);
 for(const c of audioOutputCases){const row={id:c.id,status:'RUNNING'};report.results.push(row);const context=await browser.newContext({offline:true,viewport:{width:1366,height:768}});try{
  await context.route(/^https?:/,r=>{report.networkRequests.push(r.request().url());return r.abort();});await context.addInitScript(installOutputProbe);const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(pathToFileURL(path.resolve(product)).href);await page.waitForFunction(()=>!!globalThis.Akari?.app);
  // Build an isolated file fixture, then use the actual file picker and editor.
  const sounds=[{id:'bell',name:'ベル',bytes:Array.from(fixtureWave(.4,440))},{id:'long',name:'長い音',bytes:Array.from(fixtureWave(1,660))}];
  const file=await page.evaluate(async({sounds,other})=>{
   const p=Akari.makeEmptyProject(),store=Akari.makeDefaultAssetStore();p.name='出力波形検査';const actor=p.components[0];Object.assign(actor,{x:100,y:100});const second=structuredClone(actor);Object.assign(second,{id:'audio-second',name:'星',x:400});second.costumes=[{id:'audio-second-costume',name:'星',kind:'text',value:'⭐'}];second.costumeId='audio-second-costume';second.localData={variables:[],lists:[]};p.components.push(second);
   for(const s of sounds){const canonical=await Akari.canonicalizeAudio(new Uint8Array(s.bytes)),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',canonical.bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');p.sounds.push({id:'sound-'+s.id,name:s.name,assetId:'asset-'+s.id});store.addImmutable({id:'asset-'+s.id,kind:'audio',mime:canonical.mime,byteLength:canonical.bytes.length,sha256:hash,bytes:canonical.bytes,meta:canonical});}
   p.scripts=[{id:'audio-main',targetId:'sprite-1',event:'start',source:''}];if(other)p.scripts.push({id:'audio-other',targetId:'audio-second',event:'start',source:other});return Akari.serializeProject(p,store);
  },{sounds,other:c.other||''});
  await page.locator('#fileInput').setInputFiles({name:'output.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});await page.waitForFunction(()=>Akari.app.project.name==='出力波形検査');await page.locator('#uiLevel').selectOption('advanced');if(await page.locator('#sourceOverview').isVisible())await page.locator('#sourceEditBtn').click();await page.locator('#editorModecode').click();await page.locator('#codeEditor').fill(c.source);await page.waitForFunction(s=>Akari.app.editorState.main.sourceText===s,c.source);assert.deepEqual(await page.evaluate(()=>Akari.app.compile().errors),[]);const design=await page.evaluate(()=>JSON.stringify(Akari.app.project));
  await page.locator('#runBtn').click();await page.waitForTimeout(c.seconds*1000);await page.waitForFunction(()=>audioOutputProbe.markers.some(m=>m.text==='通過')&&audioOutputProbe.voices.length&&audioOutputProbe.voices.every(v=>v.endTime!==null));
  const raw=await page.evaluate(()=>({markers:audioOutputProbe.markers,voices:audioOutputProbe.voices.map(v=>({rate:v.rate,connectedAt:v.connectedAt,endTime:v.endTime,sourceType:v.sourceType,samples:v.frames.flat()}))}));
  row.observed={source:c.source,other:c.other||'',designUnchanged:(await page.evaluate(()=>JSON.stringify(Akari.app.project)))===design,marker:raw.markers.find(m=>m.text==='通過'),otherMarker:raw.markers.find(m=>m.text!=='通過')||null,voices:[]};
  for(const[j,v]of raw.voices.entries()){const bytes=wave(v.samples,v.rate),name=c.id+'-'+j+'.wav';fs.writeFileSync(path.join(dir,name),bytes);row.observed.voices.push({file:'audio-output-browser.artifacts/'+name,sha256:sha(bytes),connectedAt:v.connectedAt,endTime:v.endTime,sourceType:v.sourceType,measurement:measureWave(bytes)});}
  await page.screenshot({path:path.join(dir,c.id+'.png')});await page.locator('#stopBtn').click();row.status='PASS';
 }catch(error){row.status='FAIL';row.error=error.stack;}finally{await context.close();}save();console.log(row.status+' output '+c.id);}
},180000);}catch(error){report.hostFailure=error.stack;}
report.status=!report.hostFailure&&!report.pageErrors.length&&!report.networkRequests.length&&report.results.length===audioOutputCases.length&&report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';save();
try{verifyAudioOutput(report,baseDir);}catch(error){report.status='FAIL';report.validationError=error.stack;save();console.error(error.stack);process.exitCode=1;}
