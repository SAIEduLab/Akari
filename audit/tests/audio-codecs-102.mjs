import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {withBrowser,pageFor,snapshot,sha} from '../lib/product-test-host.mjs';
import {loadApi} from '../browser/legacy/audit-lib.cjs';
import {audioFixtures102,audioIds102,codecBrowser102,verifyAudio102} from '../lib/release-102-contract.mjs';

const require=createRequire(import.meta.url);
const [browserPath,output]=process.argv.slice(2);
assert.ok(output&&!fs.existsSync(output),'fresh audio evidence required');
const dir=path.resolve(path.dirname(output));fs.mkdirSync(dir,{recursive:true});
const inputs=snapshot('Akari.html'),results=[],pageErrors=[],networkRequests=[];
const fixtureDir='audit/fixtures/audio-1.0.2/';
const manifest=JSON.parse(fs.readFileSync(fixtureDir+'manifest.json'));
for(const [file,record] of Object.entries(manifest.files)){
  const bytes=fs.readFileSync(fixtureDir+file);
  assert.equal(bytes.length,record.bytes,file);assert.equal(sha(bytes),record.sha256,file);
}
const fixture=file=>Array.from(fs.readFileSync(fixtureDir+file));
const cases={};
async function reveal(locator){
  if(!await locator.isVisible())for(const panel of await locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())await panel.locator('.blockui-side-toggle').click();
  for(const details of await locator.locator('xpath=ancestor::details[not(@open)]').all())await details.locator(':scope > summary').click();
  return locator;
}
const click=async(p,s)=>(await reveal(p.locator(s))).click();
const state=p=>p.evaluate(()=>({project:JSON.stringify(Akari.app.project),history:Akari.app.editorState.history,redo:Akari.app.editorState.redo,dirty:Akari.app.editorState.dirty}));
async function reject(p,bytes,codes=['F509','F511']){
  const code=await p.evaluate(async bytes=>{try{await Akari.canonicalizeAudio(new Uint8Array(bytes));return 'ACCEPTED';}catch(e){return e.code;}},bytes);
  assert.ok(codes.includes(code),'expected '+codes+'; received '+code);
}
async function player(browser,file,expected,invalid=false){
  const context=await browser.newContext({offline:true});
  try{
    await context.route(/^https?:/,r=>{networkRequests.push(r.request().url());return r.abort();});
    const p=await context.newPage();p.on('pageerror',e=>pageErrors.push(e.message));
    await p.goto(pathToFileURL(file).href);
    if(invalid){
      await p.waitForFunction(()=>document.querySelector('#playerStatus').textContent!=='読み込み中');
      assert.equal(await p.locator('#playerStart').isDisabled(),true);
      assert.ok((await p.locator('#playerOutput').textContent()).includes('X602'));
    }else{
      await p.locator('#playerStart:not([disabled])').click();
      await p.waitForFunction(expected=>document.querySelector('#playerOutput').textContent.includes(expected),expected);
      assert.equal(await p.evaluate(()=>typeof globalThis.Akari),'undefined');
      assert.ok(!(await p.locator('#playerOutput').textContent()).includes('R415'));
      await p.locator('#playerStop').click();assert.equal(await p.locator('#playerStop').isDisabled(),true);
    }
  }finally{await context.close();}
}
for(const [name,file,mime,channels,rate] of audioFixtures102)cases['audio-import-'+name]=async(p,browser)=>{
  p.on('dialog',d=>d.accept(d.type()==='prompt'?'検証音':undefined));
  const before=await state(p);
  // Deliberately misleading name/MIME: content, not the extension, chooses the decoder.
  await p.locator('#soundInput').setInputFiles({name:'misleading.txt',mimeType:'text/plain',buffer:fs.readFileSync(fixtureDir+file)});
  await p.waitForFunction(()=>Akari.app.project.sounds.length===1&&Akari.app.editorState.state==='DESIGN');
  const info=await p.evaluate(async()=>{
    const a=Akari.app.assetStore.get(Akari.app.project.sounds[0].assetId);
    const canonical=await Akari.canonicalizeAudio(a.bytes);
    if(canonical.bytes.length!==a.bytes.length||canonical.bytes.some((v,i)=>v!==a.bytes[i]))throw Error('canonical bytes changed');
    const ac=new AudioContext();
    try{
      const decoded=await ac.decodeAudioData(a.bytes.buffer.slice(a.bytes.byteOffset,a.bytes.byteOffset+a.bytes.byteLength));
      const rms=Array.from({length:decoded.numberOfChannels},(_,i)=>Math.sqrt(decoded.getChannelData(i).reduce((s,v)=>s+v*v,0)/decoded.length));
      return {mime:a.mime,meta:a.meta,hash:a.sha256,rms,metadata:new TextDecoder().decode(a.bytes).includes('AKARI_PRIVATE_METADATA_102')};
    }finally{await ac.close();}
  });
  assert.equal(info.mime,mime);assert.equal(info.meta.channels,channels);assert.equal(info.meta.sampleRate,rate);
  assert.ok(info.meta.duration>=0.20&&info.meta.duration<=0.32);assert.equal(info.metadata,false);
  assert.equal(info.rms.length,channels);for(const rms of info.rms)assert.ok(rms>0.02&&rms<0.3,'actual decoded waveform');
  const imported=await state(p);assert.equal(imported.history,before.history+1);
  await click(p,'#undoBtn');assert.equal((await state(p)).project,before.project);
  await click(p,'#redoBtn');assert.equal((await state(p)).project,imported.project);
  await (await reveal(p.locator('#objectSelect'))).selectOption('stage');
  await (await reveal(p.locator('#eventSelect'))).selectOption('start');
  const marker='音声検証完了-'+name,source='「検証音」を鳴らし、終わるまで待つ\n「'+marker+'」と言う';
  await (await reveal(p.locator('#codeEditor'))).fill(source);
  await p.waitForFunction(source=>Akari.app.editorState.main.sourceText===source,source);
  await click(p,'#editorModeblocks');await click(p,'#editorModecode');
  assert.equal(await p.evaluate(()=>Akari.compileProject(Akari.app.project).errors.length),0);
  await click(p,'#runBtn');await p.waitForFunction(marker=>document.querySelector('#console').textContent.includes(marker),marker);
  await click(p,'#stopBtn');
  const saved=path.join(dir,name+'.akari.md');let pending=p.waitForEvent('download');
  await click(p,'#saveBtn');await(await pending).saveAs(saved);
  assert.ok(fs.readFileSync(saved,'utf8').startsWith('# あかり 1.0.2 の作品'));
  await click(p,'#newBtn');await p.locator('#fileInput').setInputFiles(saved);
  await p.waitForFunction(()=>Akari.app.project.sounds.length===1&&Akari.app.editorState.state==='DESIGN');
  assert.equal(await p.evaluate(()=>Akari.app.assetStore.get(Akari.app.project.sounds[0].assetId).sha256),info.hash);
  const generated=path.join(dir,name+'-player.html');pending=p.waitForEvent('download');
  await click(p,'#exportBtn');await(await pending).saveAs(generated);
  await player(browser,generated,marker);
};
cases['audio-file-picker']=async p=>{
  assert.ok((await p.title()).includes('あかり 1.0.2'));
  assert.equal(await p.locator('.titlebar').textContent(),'Akari');
  assert.ok((await p.locator('#console').textContent()).includes('あかり1.0.2'));
  const accept=(await p.locator('#soundInput').getAttribute('accept')).split(',');
  assert.deepEqual(accept,['audio/mpeg','audio/wav','audio/mp4','audio/flac','audio/ogg','.mp3','.wav','.m4a','.flac','.ogg','.opus']);
};
cases['audio-unsupported-codecs']=async p=>{
  for(const file of ['unsupported-alac.m4a','unsupported-vorbis.ogg','unsupported-adts.aac'])await reject(p,fixture(file));
};
cases['audio-aac-profile']=async p=>{
  // Locate FFmpeg's DecoderSpecificInfo in the actual AAC fixture; change AOT only.
  const original=Buffer.from(fixture('tone.m4a')),esds=original.indexOf('esds');assert.ok(esds>0);
  const asc=original.indexOf(Buffer.from([0x05,0x80,0x80,0x80,0x05]),esds);assert.ok(asc>esds);
  for(const aot of [1,5,29]){const bytes=Buffer.from(original);bytes[asc+5]=(aot<<3)|(bytes[asc+5]&7);await reject(p,Array.from(bytes),['F509']);}
};
cases['audio-malformed-containers']=async p=>{
  for(const file of ['tone.m4a','tone.flac','tone.ogg']){
    const bytes=fixture(file);await reject(p,bytes.slice(0,bytes.length-7));await reject(p,bytes.slice(0,12));
  }
  const m4a=Buffer.from(fixture('tone.m4a'));m4a.writeUInt32BE(0x7fffffff,0);await reject(p,Array.from(m4a));
  const offsets=Buffer.from(fixture('tone.m4a')),stco=offsets.indexOf('stco');assert.ok(stco>0);offsets.writeUInt32BE(0xffffffff,stco+12);await reject(p,Array.from(offsets));
  const flac=fixture('tone.flac');flac[5]=255;flac[6]=255;flac[7]=255;await reject(p,flac);
};
cases['audio-ogg-crc']=async p=>{
  const bytes=fixture('tone.ogg');bytes[bytes.length-1]^=1;await reject(p,bytes,['F511']);
  const chained=[...fixture('tone.ogg'),...fixture('mono.opus')];await reject(p,chained,['F511']);
};
cases['audio-container-limits']=async p=>{
  await reject(p,fixture('overrate.flac'),['F511']);
  const bytes=fixture('tone.flac');
  // STREAMINFO sample count occupies the bottom 36 bits of bytes 18..25.
  let count=BigInt(48000*61);for(let i=25;i>=22;i--){bytes[i]=Number(count&255n);count>>=8n;}bytes[21]=(bytes[21]&240)|Number(count&15n);
  await reject(p,bytes,['F504']);
  const oversize=await p.evaluate(async()=>{try{await Akari.canonicalizeAudio(new Uint8Array(12*1024*1024+1));return 'ACCEPTED';}catch(e){return e.code;}});assert.equal(oversize,'F504');
};
cases['audio-saved-mime-and-metadata']=async p=>{
  for(const file of ['tone.m4a','tone.flac','tone.ogg']){
    const result=await p.evaluate(async bytes=>{
      bytes=new Uint8Array(bytes);const canonical=await Akari.canonicalizeAudio(bytes);
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
      const project=Akari.makeDefaultProject(),store=Akari.makeDefaultAssetStore();
      project.sounds.push({id:'sound-test',name:'検証音',assetId:'asset-test'});
      store.addImmutable({id:'asset-test',kind:'audio',mime:canonical.mime,byteLength:bytes.length,sha256:hash,bytes,meta:canonical});
      const text=Akari.serializeProject(project,store);
      try{await Akari.parseProjectFile(text);return 'ACCEPTED';}catch(e){return e.code;}
    },fixture(file));assert.equal(result,'F508','metadata must be absent in saved '+file);
  }
  const mismatch=await p.evaluate(async bytes=>{
    const canonical=await Akari.canonicalizeAudio(new Uint8Array(bytes)),project=Akari.makeDefaultProject(),store=Akari.makeDefaultAssetStore();
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',canonical.bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
    project.sounds.push({id:'sound-test',name:'検証音',assetId:'asset-test'});
    store.addImmutable({id:'asset-test',kind:'audio',mime:'audio/mpeg',byteLength:canonical.bytes.length,sha256:digest,bytes:canonical.bytes,meta:canonical});
    try{Akari.serializeProject(project,store);return 'ACCEPTED';}catch(e){return e.code;}
  },fixture('tone.m4a'));assert.equal(mismatch,'F509');
};
cases['audio-ui-failure-atomic']=async p=>{
  const before=await state(p);
  await p.locator('#soundInput').setInputFiles({name:'broken.m4a',mimeType:'audio/mp4',buffer:Buffer.from(fixture('tone.m4a').slice(0,16))});
  await p.waitForFunction(()=>document.querySelector('#console').textContent.includes('F511')&&Akari.app.editorState.state==='DESIGN');
  assert.deepEqual(await state(p),before);
};
cases['audio-old-project-compatibility']=async p=>{
  for(const version of ['1.0.0','1.0.1']){
    const old=loadApi(fs.readFileSync('audit/fixtures/'+version+'/source/Akari.html','utf8'));
    const project=old.makeDefaultProject();project.name=version+' compatibility';
    const text=old.serializeProject(project,old.makeDefaultAssetStore());
    assert.ok(text.startsWith('# あかり '+version+' の作品'));
    assert.deepEqual(await p.evaluate(async text=>{const r=await Akari.parseProjectFile(text);return [r.project.appVersion,r.project.name,r.diagnostics.length];},text),['1.0.2',project.name,0]);
    const bad=text.replace('# あかり '+version+' の作品','# あかり 9.9.9 の作品');
    assert.equal(await p.evaluate(async t=>{try{await Akari.parseProjectFile(t);return 'ACCEPTED';}catch(e){return e.code;}},bad),'F512');
  }
};
cases['audio-runtime-mime-rejection']=async(p,browser)=>{
  p.on('dialog',d=>d.accept(d.type()==='prompt'?'検証音':undefined));
  await p.locator('#soundInput').setInputFiles(fixtureDir+'tone.m4a');
  await p.waitForFunction(()=>Akari.app.project.sounds.length===1&&Akari.app.editorState.state==='DESIGN');
  await (await reveal(p.locator('#objectSelect'))).selectOption('stage');
  await (await reveal(p.locator('#eventSelect'))).selectOption('start');
  await (await reveal(p.locator('#codeEditor'))).fill('「検証音」を鳴らす');
  await p.waitForFunction(()=>Akari.app.editorState.main.sourceText==='「検証音」を鳴らす');
  await click(p,'#editorModeblocks');await click(p,'#editorModecode');
  const html=await p.evaluate(()=>Akari.generateStandaloneHtml(Akari.app.project,Akari.app.assetStore));
  assert.equal(html.split('"mime":"audio/mp4"').length,2);
  const file=path.join(dir,'invalid-mime-player.html');fs.writeFileSync(file,html.replace('"mime":"audio/mp4"','"mime":"audio/unknown"'));
  await player(browser,file,'',true);
};

const browserVersion=await withBrowser(browserPath,async browser=>{
  assert.equal(browser.version(),codecBrowser102,'fixed browser with AAC-LC support');
  for(const id of audioIds102){
    assert.equal(typeof cases[id],'function',id);
    try{
      await pageFor(browser,'Akari.html',p=>cases[id](p,browser));
      results.push({id,pass:true,detail:'PASS'});console.log(id+': PASS');
    }catch(error){results.push({id,pass:false,detail:error.stack});console.error(id+': FAIL: '+error.stack);}
  }
  return browser.version();
},600000);
assert.deepEqual(snapshot('Akari.html'),inputs);
const report={schema:'akari-audio-102-v1',status:results.every(r=>r.pass)?'PASS':'FAIL',snapshot:inputs,browser:browserVersion,playwright:require('playwright/package.json').version,
  platform:process.platform,executableSha256:sha(fs.readFileSync(browserPath)),fixtureManifestSha256:sha(fs.readFileSync(fixtureDir+'manifest.json')),results,pageErrors,networkRequests};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');verifyAudio102(report,inputs,process.platform);
console.log('Audio 1.0.2: all '+results.length+' cases PASS');
