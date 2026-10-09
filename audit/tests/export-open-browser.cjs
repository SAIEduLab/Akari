const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),{pathToFileURL}=require('url'),{chromium}=require('playwright');
const {loadApi}=require('../browser/cases/audit-lib.cjs');
const {makeRegressionProject}=require('../fixtures/regression-project.cjs');
const {currentProductFile}=require('../lib/product-path.cjs');
const {verifyExportOpen,checkEvidenceNegatives}=require('../lib/export-open-contract.cjs');
const product=path.resolve(currentProductFile()),out=path.resolve(process.argv[3]);
assert.ok(!fs.existsSync(out),'fresh output');fs.mkdirSync(out,{recursive:true});
const api=loadApi(fs.readFileSync(product,'utf8'));
const report={schema:'akari-export-open-v1',status:'RUNNING',productSha256:crypto.createHash('sha256').update(fs.readFileSync(product)).digest('hex'),results:[],pageErrors:[],networkRequests:[],humanChildTesting:'NOT_RUN'};
function make(source,extra={}){const p=makeRegressionProject(api);p.name='検証用の作品';p.scripts=[{targetId:'stage',event:'start',source}];p.actions=[];p.functions=[];Object.assign(p,extra);return p;}
function generate(name,source,extra={},presentation='artwork'){const p=make(source,extra),file=path.join(out,name+'.html');fs.writeFileSync(file,presentation==='default'?api.generateStandaloneHtml(p,api.makeDefaultAssetStore()):api.generateStandaloneHtml(p,api.makeDefaultAssetStore(),{presentation}));return file;}
const marker='「冒頭」と言う。\n10秒待つ。',tone='440Hzの音を0.2秒鳴らし始める。\n'+marker;
async function page(b,file=product,width=1180){const c=await b.newContext({offline:true,viewport:{width,height:848}});await c.route(/^https?:/,r=>{report.networkRequests.push(r.request().url());return r.abort();});const p=await c.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>report.pageErrors.push(e.message));await p.goto(pathToFileURL(file).href);return p;}
async function install(p,source=marker){const text=api.serializeProject(make(source),api.makeDefaultAssetStore());await p.locator('#fileInput').setInputFiles({name:'検証.akari.md',mimeType:'text/plain',buffer:Buffer.from(text)});await p.waitForFunction(()=>Akari.app.project.name==='検証用の作品'&&Akari.app.editorState.state==='DESIGN');await p.locator('#uiLevel').selectOption('advanced');await p.locator('#objectSelect').selectOption('stage');await p.locator('#eventSelect').selectOption('start');if(await p.locator('#sourceOverview').isVisible())await p.locator('#sourceEditBtn').click();await p.locator('#editorModecode').click();}
const state=p=>p.evaluate(()=>{const s=Akari.app.editorState;return{project:JSON.stringify(Akari.app.project),source:s.main.sourceText,history:s.history,redo:s.redo,dirty:s.dirty,hasDraft:s.hasDraft};});
async function edit(p,text='「編集した作品」と言う。'){await p.locator('#codeEditor').fill(text);await p.waitForFunction(t=>Akari.app.editorState.main.sourceText===t,text);await p.waitForTimeout(350);}
async function save(p){const wait=p.waitForEvent('download');await p.locator('#saveBtn').click();const d=await wait;await d.saveAs(path.join(out,'saved-'+report.results.length+'.akari.md'));await p.waitForFunction(()=>!Akari.app.editorState.dirty);}
async function chooser(p){const wait=p.waitForEvent('filechooser');await p.locator('#openBtn').click();return wait;}
async function acceptedChooser(p){await p.locator('#openBtn').click();await p.locator('#openConfirmModal.show').waitFor();const wait=p.waitForEvent('filechooser');await p.locator('#openConfirmProceed').click();return wait;}
async function run(id,fn){try{const evidence=await fn();report.results.push({id,status:'PASS',evidence});console.log(id+': PASS');}catch(e){report.results.push({id,status:'FAIL',error:e.stack,evidence:e.evidence||null});console.error(id+': FAIL '+e.message);}fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
async function withPage(b,fn,file=product,width=1180){const p=await page(b,file,width);try{return await fn(p);}finally{await p.context().close();}}
async function audioProbe(c){await c.addInitScript(()=>{window.__tones=[];const AC=window.AudioContext;window.AudioContext=class extends AC{createOscillator(){const o=super.createOscillator(),start=o.start;o.start=(...a)=>{__tones.push({at:performance.now(),frequency:o.frequency.value});return start.apply(o,a);};return o;}};});}
(async()=>{
 const {snapshot}=await import('../lib/product-test-host.mjs');report.snapshot=snapshot(product);
 const browserPath=process.argv[2];assert.ok(browserPath&&fs.existsSync(browserPath),'browser required');
 const b=await chromium.launch({executablePath:browserPath,headless:true,args:['--allow-file-access-from-files','--disable-background-networking','--autoplay-policy=no-user-gesture-required']});report.browser=b.version();
 try{
  await run('EXPORT-CHOICE-CANCEL-FOCUS',()=>withPage(b,async p=>{await p.waitForFunction(()=>!!Akari.app);let count=0;p.on('download',()=>count++);await p.locator('#exportBtn').click();await p.locator('#exportChoiceModal.show').waitFor();assert.equal(await p.locator('#exportControls').evaluate(n=>document.activeElement===n),true);await p.screenshot({path:path.join(out,'export-choice.png')});await p.keyboard.press('Shift+Tab');assert.equal(await p.locator('#exportChoiceCancel').evaluate(n=>document.activeElement===n),true);await p.keyboard.press('Escape');await p.locator('#exportChoiceModal').waitFor({state:'hidden'});assert.equal(await p.locator('#exportBtn').evaluate(n=>document.activeElement===n),true);assert.equal(count,0);return{downloads:count,staticExamples:await p.locator('.export-example button').count()};}));
  await run('EXPORT-CHOICE-NARROW-ONE-DOWNLOAD',()=>withPage(b,async p=>{await p.waitForFunction(()=>!!Akari.app);await p.locator('#exportBtn').click();await p.screenshot({path:path.join(out,'export-choice-narrow.png')});await p.locator('#exportArtwork').scrollIntoViewIfNeeded();const box=await p.locator('#exportArtwork').boundingBox();assert.ok(box.width<=320&&box.x>=0);let count=0;p.on('download',()=>count++);const wait=p.waitForEvent('download');await p.locator('#exportArtwork').dblclick();const d=await wait;await d.saveAs(path.join(out,'native-artwork.html'));await p.waitForTimeout(200);assert.equal(count,1);return{count,box};},product,320));
  await run('EXPORT-CONTROLS-DEFAULT-OPERATIONS',()=>withPage(b,async p=>{await p.waitForFunction(()=>document.querySelector('#playerRoot')?.dataset.state==='READY');assert.equal(await p.locator('.sprite-bubble').count(),0);await p.locator('#playerStart').click();await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('冒頭'));await p.locator('#playerPause').click();assert.equal(await p.locator('#playerRoot').getAttribute('data-state'),'PAUSED');await p.locator('#playerPause').click();assert.equal(await p.locator('#playerRoot').getAttribute('data-state'),'RUNNING');await p.locator('#playerStop').click();assert.equal(await p.locator('#playerRoot').getAttribute('data-state'),'STOPPED');await p.locator('#playerStart').click();await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('冒頭'));return{title:await p.locator('#playerTitle').innerText(),restart:true,pauseResumeStop:true};},generate('controls',marker,{},'default')));
  await run('EXPORT-ARTWORK-SIZE-RELOAD-INPUT',()=>withPage(b,async p=>{await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('冒頭'));const box=await p.locator('#formSurface').boundingBox();assert.deepEqual({x:box.x,y:box.y,width:box.width,height:box.height},{x:0,y:0,width:640,height:400});assert.equal(await p.locator('#playerStart,#playerPause,#playerStop,#playerTitle,#playerStatus').count(),0);await p.locator('.component[data-runtime-id="button-1"]').click();await p.waitForFunction(()=>document.querySelector('#formSurface').textContent.includes('作品のボタン'));await p.locator('#formSurface').focus();await p.keyboard.press('a');await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('作品のキー'));await p.reload();await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('冒頭'));assert.doesNotMatch(await p.locator('#playerOutput').innerText(),/作品のキー/);return{box,noControls:true,nativeButtonAndKey:true};},generate('artwork-input',marker,{scripts:[{targetId:'stage',event:'start',source:marker},{targetId:'button-1',event:'click',source:'「作品のボタン」と言う。'},{targetId:'stage',event:'keyDown',source:'「作品のキー」と言う。'}]}),320));
  await run('EXPORT-ARTWORK-QUESTION-ANSWER-STOP',()=>withPage(b,async p=>{await p.locator('#questionModal.show').waitFor();await p.locator('#questionAnswer').fill('返答');await p.locator('#questionSubmit').click();await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('返答'));await p.reload();await p.locator('#questionModal.show').waitFor();await p.locator('#questionStop').click();assert.equal(await p.locator('#playerRoot').getAttribute('data-state'),'STOPPED');assert.equal(await p.locator('#formSurface').evaluate(n=>document.activeElement===n),true);return{answer:true,stop:true};},generate('artwork-question','「答えは？」とたずねる。\n答えの値を言う。\n10秒待つ。')));
  await run('EXPORT-ARTWORK-AUDIO-PERMITTED',async()=>{const c=await b.newContext({offline:true});await audioProbe(c);const p=await c.newPage();try{p.on('pageerror',e=>report.pageErrors.push(e.message));await p.goto(pathToFileURL(generate('audio-permitted',tone)).href);await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('冒頭'));assert.equal(await p.locator('#playerActivation').isVisible(),false);assert.equal(await p.evaluate(()=>__tones.length),1);return{starts:await p.evaluate(()=>__tones),automatic:true};}finally{await c.close();}});

  await run('EXPORT-ARTWORK-IMAGE-PEN-STOP',()=>withPage(b,async p=>{
    await p.waitForFunction(()=>document.querySelector('#formSurface').textContent.includes('絵と線'));
    const images=await p.locator('#formSurface img').evaluateAll(ns=>ns.map(n=>({complete:n.complete,width:n.naturalWidth})));
    assert.ok(images.length&&images.every(n=>n.complete&&n.width>0));
    const painted=await p.locator('#penCanvas').evaluate(n=>Array.from(n.getContext('2d').getImageData(0,0,n.width,n.height).data).some((v,i)=>i%4===3&&v>0));
    assert.ok(painted);await p.screenshot({path:path.join(out,'artwork-image-pen.png')});
    await p.locator('.component[data-runtime-id="button-1"]').click();
    await p.waitForFunction(()=>document.querySelector('#playerRoot').dataset.state==='STOPPED');
    await p.evaluate(()=>window.dispatchEvent(new Event('focus')));assert.equal(await p.locator('#playerRoot').getAttribute('data-state'),'STOPPED');
    return{images,painted,programStop:true};
  },generate('artwork-pen','', {scripts:[{targetId:'sprite-1',event:'start',source:'ペンを下ろす。\n40歩動く。\n「絵と線」と言う。'},{targetId:'button-1',event:'click',source:'すべてを止める。'}]})));
  await run('EXPORT-ARTWORK-CACHED-RETURN',()=>withPage(b,async p=>{
    await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('冒頭'));
    const before=await p.locator('#playerOutput').innerText();
    await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
    await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
    assert.equal(await p.locator('#playerRoot').getAttribute('data-state'),'RUNNING');
    assert.equal(await p.locator('#playerOutput').innerText(),before);
    const token=await p.evaluate(()=>window.__returnToken=Math.random()),away=path.join(out,'away.html');fs.writeFileSync(away,'<!doctype html><title>移動先</title>');
    await p.goto(pathToFileURL(away).href);await p.goBack();await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('冒頭'));
    return{persistedEvents:'same execution retained',nativeHistoryBack:true,nativeCacheRestored:await p.evaluate(()=>window.__returnToken)===token};
  },generate('cached-return',marker)));
  await run('EXPORT-ARTWORK-IFRAME',async()=>{
    const file=generate('iframe-artwork',marker),host=path.join(out,'iframe-host.html');
    fs.writeFileSync(host,'<!doctype html><meta charset="utf-8"><iframe title="検証" style="width:300px;height:220px" src="'+pathToFileURL(file).href+'"></iframe>');
    return withPage(b,async p=>{const f=p.frameLocator('iframe');await f.locator('#playerOutput').filter({hasText:'冒頭'}).waitFor();
      const box=await f.locator('#formSurface').evaluate(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});
      assert.deepEqual(box,{x:0,y:0,width:640,height:400});await p.screenshot({path:path.join(out,'artwork-iframe.png')});return{box,automatic:true};},host);
  });
  await run('EXPORT-ARTWORK-INITIALIZATION-ERROR',async()=>{
    const file=generate('invalid-contract',marker),html=fs.readFileSync(file,'utf8');assert.equal(html.split('"runtimeContractId":2').length,2);
    fs.writeFileSync(file,html.replace('"runtimeContractId":2','"runtimeContractId":0'));
    return withPage(b,async p=>{await p.waitForFunction(()=>document.querySelector('#playerRoot').dataset.state==='ERROR');
      assert.equal(await p.locator('#playerActivation').isVisible(),false);await p.locator('#playerOutput details summary').click();
      assert.match(await p.locator('#playerOutput').innerText(),/X602/);return{rejected:true,detailsVisible:true,errorCode:(await p.locator('#playerOutput details pre').innerText()).match(/^[A-Z]\d+/)?.[0]};},file);
  });
  let mediaFile;
  await run('EXPORT-ARTWORK-RECORDED-AUDIO',()=>withPage(b,async p=>{
    await p.waitForFunction(()=>!!Akari.app);p.on('dialog',d=>d.accept(d.type()==='prompt'?'検証音':undefined));
    await p.locator('#soundInput').setInputFiles(path.resolve('audit/fixtures/audio/tone.m4a'));
    await p.waitForFunction(()=>Akari.app.project.sounds.length===1&&Akari.app.editorState.state==='DESIGN');
    const html=await p.evaluate(()=>{const p=structuredClone(Akari.app.project);p.scripts=[{targetId:'stage',event:'start',source:'音「検証音」を鳴らす。\n「音の後」と言う。'}];return Akari.generateStandaloneHtml(p,Akari.app.assetStore,{presentation:'artwork'});});
    mediaFile=path.join(out,'recorded-audio.html');fs.writeFileSync(mediaFile,html);
    return withPage(b,async q=>{await q.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('音の後'));assert.equal(await q.locator('#playerActivation').isVisible(),false);return{decodeAndPlayback:true};},mediaFile);
  }));
  await run('EXPORT-ARTWORK-INVALID-AUDIO',async()=>{
    assert.ok(mediaFile);const html=fs.readFileSync(mediaFile,'utf8'),file=path.join(out,'invalid-audio.html');
    assert.equal(html.split('"mime":"audio/mp4"').length,2);fs.writeFileSync(file,html.replace('"mime":"audio/mp4"','"mime":"audio/unknown"'));
    return withPage(b,async p=>{await p.waitForFunction(()=>document.querySelector('#playerRoot').dataset.state==='ERROR');assert.equal(await p.locator('#playerActivation').isVisible(),false);
      await p.locator('#playerOutput details summary').click();assert.match(await p.locator('#playerOutput').innerText(),/X602/);return{invalidMimeRejected:true,noActivationWait:true,errorCode:(await p.locator('#playerOutput details pre').innerText()).match(/^[A-Z]\d+/)?.[0]};},file);
  });
  await run('EXPORT-ARTWORK-DECODE-FAILURE',async()=>{
    assert.ok(mediaFile);const c=await b.newContext({offline:true});
    await c.addInitScript(()=>{const AC=window.AudioContext;window.AudioContext=class extends AC{decodeAudioData(){return Promise.reject(new DOMException('injected decode failure','EncodingError'));}};});
    const p=await c.newPage();p.on('pageerror',e=>report.pageErrors.push(e.message));try{
      await p.goto(pathToFileURL(mediaFile).href);await p.waitForFunction(()=>document.querySelector('#playerRoot').dataset.state==='ERROR');
      assert.equal(await p.locator('#playerActivation').isVisible(),false);await p.locator('#playerOutput details summary').click();
      assert.match(await p.locator('#playerOutput').innerText(),/F509|R415|injected/);return{faultInjection:'decodeAudioData rejection',noActivationWait:true,errorCode:(await p.locator('#playerOutput details pre').innerText()).match(/^[A-Z]\d+/)?.[0]};
    }finally{await c.close();}
  });
  await run('EXPORT-ARTWORK-AUDIO-DEVICE-ERROR',async()=>{
    const c=await b.newContext({offline:true});
    await c.addInitScript(()=>{
      window.__nativeAudioErrors=0;const AC=window.AudioContext;
      window.AudioContext=class extends AC{constructor(){super({sinkId:'read-only-invalid-output-device'});this.addEventListener('error',()=>window.__nativeAudioErrors++);}};
    });
    const p=await c.newPage();p.on('pageerror',e=>report.pageErrors.push(e.message));try{
      await p.goto(pathToFileURL(generate('audio-device-error',tone)).href);
      await p.waitForFunction(()=>document.querySelector('#playerRoot').dataset.state==='ERROR');
      assert.ok(await p.evaluate(()=>window.__nativeAudioErrors>0));
      assert.equal(await p.locator('#playerActivation').isVisible(),false);
      await p.locator('#playerOutput details summary').click();
      const errorCode=(await p.locator('#playerOutput details pre').innerText()).match(/^[A-Z]\d+/)?.[0];assert.equal(errorCode,'R415');
      await p.waitForTimeout(500);assert.equal(await p.locator('#playerRoot').getAttribute('data-state'),'ERROR');
      return{faultInjection:'invalid sinkId; native resume and error event',nativeError:true,noActivationWait:true,safeStop:true,detailsVisible:true,errorCode};
    }finally{await c.close();}
  });
  await run('OPEN-AUTOSAVE-FAILURE-STILL-PROTECTED',async()=>{
    const c=await b.newContext({offline:true});await c.addInitScript(()=>{indexedDB.open=()=>{throw new Error('injected unavailable storage');};Storage.prototype.setItem=()=>{throw new Error('injected storage failure');};});
    const p=await c.newPage();p.on('pageerror',e=>report.pageErrors.push(e.message));try{
      await p.goto(pathToFileURL(product).href);await install(p);await edit(p);await p.waitForFunction(()=>document.querySelector('#autosaveState').textContent.includes('失敗'));
      await p.locator('#openBtn').click();await p.locator('#openConfirmModal.show').waitFor();return{faultInjection:'IndexedDB and localStorage unavailable',unsavedStillProtected:true};
    }finally{await c.close();}
  });
  await run('OPEN-RECOVERY-DIRTY-PROTECTED',()=>withPage(b,async p=>{
    await install(p);await edit(p,'「復旧の未保存」と言う。');await p.waitForFunction(()=>document.querySelector('#autosaveState').textContent==='自動保存：済み');
    await p.reload();await p.locator('#recoveryRestore').click();await p.locator('#openBtn').click();await p.locator('#openConfirmModal.show').waitFor();
    await p.locator('#openConfirmCancel').click();assert.ok(await p.evaluate(()=>Akari.app.project.scripts.some(s=>s.source.includes('復旧の未保存'))));return{restoredUnsavedProtected:true};
  }));
  await run('OPEN-RECOVERY-SAVED-DRAFT-CLEAN',async()=>{
    const variants=[];
    for(const kind of ['code','blocks'])await withPage(b,async p=>{
      await install(p,kind==='blocks'?'点数を3にする。':marker);
      if(kind==='code')await p.locator('#codeEditor').fill('「保存した書きかけ');
      else{await p.locator('#editorModeblocks').click();await p.locator('#blockEditor .blockui-node[data-schema-id="NumberLiteral"] [data-blockui-field="value"]').first().fill('bad');await p.keyboard.press('Tab');}
      await save(p);await p.waitForFunction(()=>document.querySelector('#autosaveState').textContent==='自動保存：済み');
      await p.reload();await p.locator('#recoveryRestore').click();let pickers=0;p.on('filechooser',()=>pickers++);await p.locator('#openBtn').click();
      const observed={kind,savedUnchangedConfirmation:await p.locator('#openConfirmModal').isVisible(),pickers};
      if(observed.savedUnchangedConfirmation)await p.locator('#openConfirmCancel').click();else await p.locator('#fileInput').dispatchEvent('cancel');
      if(kind==='blocks'){
        await p.locator('#editorCancel').click();await p.locator('#openBtn').click();observed.cancelledSavedPendingConfirmation=await p.locator('#openConfirmModal').isVisible();
      }
      variants.push(observed);
    });
    try{for(const observed of variants){assert.equal(observed.savedUnchangedConfirmation,false,'saved unchanged '+observed.kind+' must not require confirmation');assert.equal(observed.pickers,1);if(observed.kind==='blocks')assert.equal(observed.cancelledSavedPendingConfirmation,true,'discarding saved pending input changes the saved content');}}
    catch(error){error.evidence={variants};throw error;}return{variants};
  });

  await run('OPEN-CLEAN-AUTOSAVE-DIRECT',()=>withPage(b,async p=>{await install(p);await save(p);assert.equal(await p.locator('#autosaveState').innerText(),'自動保存：済み');await chooser(p);assert.equal(await p.locator('#openConfirmModal').isVisible(),false);await p.locator('#fileInput').dispatchEvent('cancel');return{direct:true,autosavePresent:true};}));
  await run('OPEN-DIRTY-CANCEL-STATE-KEYBOARD',()=>withPage(b,async p=>{await install(p);await edit(p);const before=await state(p);let pickers=0;p.on('filechooser',()=>pickers++);await p.locator('#openBtn').click();await p.locator('#openConfirmModal.show').waitFor();assert.equal(pickers,0);assert.doesNotMatch(await p.locator('#openConfirmModal').innerText(),/ファイル|はい/);await p.screenshot({path:path.join(out,'open-unsaved.png')});await p.keyboard.press('Escape');await p.locator('#openConfirmModal').waitFor({state:'hidden'});assert.deepEqual(await state(p),before);assert.equal(await p.locator('#openBtn').evaluate(n=>document.activeElement===n),true);return{before,after:await state(p),pickers};}));
  await run('OPEN-APPROVAL-PICKER-CANCEL-REUSE',()=>withPage(b,async p=>{await install(p);await edit(p);const before=await state(p);let dialogs=0;p.on('dialog',d=>{dialogs++;return d.dismiss();});await acceptedChooser(p);await p.locator('#fileInput').dispatchEvent('cancel');assert.deepEqual(await state(p),before);await p.locator('#openBtn').click();await p.locator('#openConfirmModal.show').waitFor();await p.locator('#openConfirmCancel').click();assert.equal(dialogs,0);return{currentRetained:true,confirmationAgain:true,before,after:await state(p)};}));
  await run('OPEN-SAVE-EDIT-UNDO-REDO',()=>withPage(b,async p=>{await install(p);await edit(p,'「保存した作品」と言う。');await save(p);await chooser(p);await p.locator('#fileInput').dispatchEvent('cancel');await edit(p,'「保存後の編集」と言う。');await p.locator('#undoBtn').click();await chooser(p);assert.equal(await p.locator('#openConfirmModal').isVisible(),false);await p.locator('#fileInput').dispatchEvent('cancel');await p.locator('#redoBtn').click();await p.locator('#openBtn').click();await p.locator('#openConfirmModal.show').waitFor();await p.locator('#openConfirmCancel').click();return{saveClean:true,undoClean:true,redoDirty:true};}));
  await run('OPEN-APPROVED-CORRUPT-RETAINED',()=>withPage(b,async p=>{await install(p);await edit(p);const before=await state(p);let dialogs=0;p.on('dialog',d=>{dialogs++;return d.dismiss();});const f=await acceptedChooser(p);await f.setFiles({name:'broken.akari.md',mimeType:'text/plain',buffer:Buffer.from('破損した作品')});await p.waitForFunction(()=>document.querySelector('#console').textContent.includes('読み込み失敗'));assert.deepEqual(await state(p),before);assert.equal(dialogs,0);await p.locator('#openBtn').click();await p.locator('#openConfirmModal.show').waitFor();return{retained:true,dialogs,before,after:await state(p)};}));
  await run('OPEN-APPROVED-SUCCESS-SAME-SELECTION',()=>withPage(b,async p=>{await install(p);await edit(p);let dialogs=0;p.on('dialog',d=>{dialogs++;return d.dismiss();});const text=api.serializeProject(make('「読込み後」と言う。'),api.makeDefaultAssetStore()),file={name:'same.akari.md',mimeType:'text/plain',buffer:Buffer.from(text)};let f=await acceptedChooser(p);await f.setFiles(file);await p.waitForFunction(()=>Akari.app.project.scripts[0].source==='「読込み後」と言う。');assert.equal(dialogs,0);f=await chooser(p);await f.setFiles(file);await p.waitForFunction(()=>Akari.app.editorState.state==='DESIGN');return{oneConfirmation:true,sameSelection:true,dialogs};}));
  await run('OPEN-ALTERNATE-ROUTE-PROTECTED',()=>withPage(b,async p=>{await install(p);await edit(p);const before=await state(p),dialogs=[];p.on('dialog',d=>{dialogs.push(d.message());return d.dismiss();});await p.locator('#fileInput').setInputFiles({name:'other.akari.md',mimeType:'text/plain',buffer:Buffer.from(api.serializeProject(make(marker),api.makeDefaultAssetStore()))});assert.deepEqual(await state(p),before);assert.equal(dialogs.length,1);return{dialogs,retained:true,before,after:await state(p)};}));
  await run('OPEN-CHANGED-AFTER-APPROVAL',()=>withPage(b,async p=>{await install(p);await edit(p);const f=await acceptedChooser(p);await p.locator('#codeEditor').evaluate(n=>{n.value='「承諾後の変更」と言う。';n.dispatchEvent(new Event('input',{bubbles:true}));});await p.waitForTimeout(350);const before=await state(p),dialogs=[];p.on('dialog',d=>{dialogs.push(d.message());return d.dismiss();});await f.setFiles({name:'other.akari.md',mimeType:'text/plain',buffer:Buffer.from(api.serializeProject(make(marker),api.makeDefaultAssetStore()))});assert.deepEqual(await state(p),before);assert.equal(dialogs.length,1);return{changedStateProtected:true,before,after:await state(p),dialogs};}));
  await run('OPEN-UNFINISHED-CODE-AND-SAVED-DRAFT',()=>withPage(b,async p=>{await install(p);await p.locator('#codeEditor').fill('「書きかけ');await p.locator('#openBtn').click();await p.locator('#openConfirmModal.show').waitFor();await p.locator('#openConfirmCancel').click();assert.equal(await p.locator('#codeEditor').inputValue(),'「書きかけ');await save(p);await chooser(p);assert.equal(await p.locator('#openConfirmModal').isVisible(),false);await p.locator('#fileInput').dispatchEvent('cancel');return{unfinishedProtected:true,savedUnchangedDirect:true};}));
 }finally{await b.close();}

 const blocked=await chromium.launch({executablePath:browserPath,headless:true,args:['--allow-file-access-from-files','--disable-background-networking','--autoplay-policy=document-user-activation-required']});
 try{
  for(const input of ['mouse','keyboard','touch'])await run('EXPORT-AUDIO-WAIT-'+input.toUpperCase(),async()=>{
   const c=await blocked.newContext({offline:true,hasTouch:input==='touch'});await audioProbe(c);const p=await c.newPage();p.on('pageerror',e=>report.pageErrors.push(e.message));try{
    await p.goto(pathToFileURL(generate('audio-wait-'+input,tone,{scripts:[{targetId:'stage',event:'start',source:tone},{targetId:'stage',event:'keyDown',source:'「二重のキー」と言う。'},{targetId:'stage',event:'click',source:'「二重のクリック」と言う。'}]})).href);
    await p.locator('#playerActivate').waitFor();const waiting={startsBefore:await p.evaluate(()=>__tones.length),phaseBefore:await p.locator('#playerRoot').getAttribute('data-state'),outputBefore:await p.locator('#playerOutput').innerText()};assert.equal(await p.evaluate(()=>__tones.length),0);assert.equal(await p.locator('#playerRoot').getAttribute('data-state'),'WAITING');assert.equal(await p.locator('#playerOutput').innerText(),'');
    const box=await p.locator('#playerActivate').boundingBox(),stage=await p.locator('#formSurface').boundingBox();assert.ok(Math.abs(box.x+box.width/2-stage.width/2)<1&&Math.abs(box.y+box.height/2-stage.height/2)<1);
    const colors=await p.locator('#playerActivate').evaluate(n=>{const s=getComputedStyle(n);return{background:s.backgroundColor,color:s.color,border:s.borderTopColor,opacity:s.opacity};});assert.deepEqual(colors,{background:'rgb(255, 255, 255)',color:'rgb(0, 0, 0)',border:'rgb(0, 0, 0)',opacity:'1'});await p.screenshot({path:path.join(out,'audio-wait-'+input+'.png')});
    if(input==='mouse')await p.locator('#playerActivate').click();else if(input==='touch')await p.locator('#playerActivate').tap();else await p.locator('#playerActivate').press('Enter');
    await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('冒頭'));assert.equal(await p.locator('#playerActivation').isVisible(),false);assert.equal(await p.evaluate(()=>__tones.length),1);assert.doesNotMatch(await p.locator('#playerOutput').innerText(),/二重/);return{box,stage,colors,starts:await p.evaluate(()=>__tones),...waiting,duplicateInput:/二重/.test(await p.locator('#playerOutput').innerText())};
   }finally{await c.close();}
  });

  await run('EXPORT-AUDIO-ACTIVATION-FAILURE',async()=>{
    const c=await blocked.newContext({offline:true});await c.addInitScript(()=>{const AC=window.AudioContext;window.AudioContext=class extends AC{resume(){if(navigator.userActivation.isActive)return Promise.reject(new DOMException('injected embedding restriction','NotAllowedError'));return super.resume();}};});
    const p=await c.newPage();p.on('pageerror',e=>report.pageErrors.push(e.message));try{
      await p.goto(pathToFileURL(generate('activation-denied',tone)).href);await p.locator('#playerActivate').click();
      await p.waitForFunction(()=>document.querySelector('#playerRoot').dataset.state==='ERROR');
      assert.equal(await p.locator('#playerActivation').isVisible(),false);assert.doesNotMatch(await p.locator('#playerOutput').innerText(),/冒頭/);
      assert.match(await p.locator('#playerOutput').innerText(),/音をはじめられませんでした/);await p.locator('#playerOutput details summary').click();
      assert.match(await p.locator('#playerOutput').innerText(),/R415/);return{faultInjection:'resume rejected after native user operation',safeStop:true,childMessage:true,details:true,errorCode:(await p.locator('#playerOutput details pre').innerText()).match(/^[A-Z]\d+/)?.[0]};
    }finally{await c.close();}
  });
  await run('EXPORT-NO-AUDIO-DOES-NOT-WAIT' ,()=>withPage(blocked,async p=>{await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('冒頭'));assert.equal(await p.locator('#playerActivation').isVisible(),false);return{automatic:true};},generate('silent-block-policy',marker)));
 }finally{await blocked.close();}
 report.status=report.results.every(r=>r.status==='PASS')&&!report.pageErrors.length&&!report.networkRequests.length?'PASS':'FAIL';fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status,report.results.length);checkEvidenceNegatives(report,snapshot(product));report.validatorNegatives='PASS';fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');verifyExportOpen(report,snapshot(product));
})().catch(e=>{console.error(e);process.exitCode=1;});
