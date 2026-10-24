const {projectAction}=require('../lib/project-actions.cjs');
const {pressStop,DOUBLE_PRESS_MS}=require('../lib/stop-press.cjs');
const {chooseView}=require('../browser/cases/view-toggle.cjs');
const {cancelInput}=require('../browser/cases/cancel-input.cjs');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),{pathToFileURL}=require('url'),{chromium}=require('playwright');
const {loadApi}=require('../browser/cases/audit-lib.cjs');
const {makeRegressionProject}=require('../fixtures/regression-project.cjs');
const {currentProductFile}=require('../lib/product-path.cjs');
const {verifyExportOpen,checkEvidenceNegatives}=require('../lib/export-open-contract.cjs');
const {observeArtworkTouch}=require('../lib/artwork-touch-observations.cjs');
const product=path.resolve(currentProductFile()),out=path.resolve(process.argv[3]);
assert.ok(!fs.existsSync(out),'fresh output');fs.mkdirSync(out,{recursive:true});
const api=loadApi(fs.readFileSync(product,'utf8'));
// The contract numbers, the autosave database name and the data marks come from the release record (features.json).
const contract=JSON.parse(fs.readFileSync('audit/manifests/features.json','utf8')).EXECUTABLE_CONTRACT,autosaveDatabase='akari-workspace-f'+contract.projectFormatVersion;
const report={schema:'akari-export-open-v1',status:'RUNNING',productSha256:crypto.createHash('sha256').update(fs.readFileSync(product)).digest('hex'),results:[],pageErrors:[],networkRequests:[],humanChildTesting:'NOT_RUN'};
function make(source,extra={}){const p=makeRegressionProject(api);p.name='検証用の作品';p.scripts=[{targetId:'stage',event:'start',source}];p.actions=[];p.functions=[];Object.assign(p,extra);return p;}
function generate(name,source,extra={},presentation='artwork'){const p=make(source,extra),file=path.join(out,name+'.html');fs.writeFileSync(file,presentation==='default'?api.generateStandaloneHtml(p,api.makeDefaultAssetStore()):api.generateStandaloneHtml(p,api.makeDefaultAssetStore(),{presentation}));return file;}
const marker='「冒頭」と言う。\n10秒待つ。',tone='440Hzの音を0.2秒鳴らし始める。\n'+marker;
async function page(b,file=product,width=1180){const c=await b.newContext({offline:true,viewport:{width,height:848}});
 // These editor checks use the normal basic toolbar, as product-test-host does.
 // Entry first-start behavior is covered independently by entry-workshop.
 if(file===product)await c.addInitScript(()=>localStorage.setItem('akari.uiLevel.v1','basic'));
 await c.route(/^https?:/,r=>{report.networkRequests.push(r.request().url());return r.abort();});const p=await c.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>report.pageErrors.push(e.message));await p.goto(pathToFileURL(file).href);return p;}
// The player's buttons a viewer sees, with the label each shows. ⏸ いったん止める and ▶ つづける share one place: one button
// holds both labels, and the label that does not apply, like the whole place while neither applies, keeps its room but
// is not seen (visibility hidden). So a button counts only where it is seen, with its seen label (LANGUAGE.md
// 書き出した作品のはじめ方).
function shownControls(){const seen=n=>n.getClientRects().length>0&&getComputedStyle(n).visibility==='visible';
  return ['playerStart','playerStop','playerPause'].map(id=>document.getElementById(id)).filter(seen).map(n=>[n,n.children.length?[...n.children].filter(seen).map(c=>c.textContent).join(''):n.textContent])
    .filter(([,label])=>label).map(([n,label])=>n.id+':'+label).join(' ');}
async function install(p,source=marker){const text=api.serializeProject(make(source),api.makeDefaultAssetStore());await p.locator('#fileInput').setInputFiles({name:'検証.akari.md',mimeType:'text/plain',buffer:Buffer.from(text)});await p.waitForFunction(()=>Akari.app.project.name==='検証用の作品'&&Akari.app.editorState.state==='DESIGN');await p.locator('#uiLevel').selectOption('advanced');await p.locator('#objectSelect').selectOption('stage');await p.locator('#eventSelect').selectOption('start');if(await p.locator('#sourceOverview').isVisible())await p.locator('#sourceEditBtn').click();await chooseView(p,'code');}
const state=p=>p.evaluate(()=>{const s=Akari.app.editorState;return{project:JSON.stringify(Akari.app.project),source:s.main.sourceText,history:s.history,redo:s.redo,dirty:s.dirty,hasDraft:s.hasDraft};});
async function edit(p,text='「編集した作品」と言う。'){await p.locator('#codeEditor').fill(text);await p.waitForFunction(t=>Akari.app.editorState.main.sourceText===t,text);await p.waitForTimeout(350);}
async function save(p){const wait=p.waitForEvent('download');await p.locator('#saveBtn').click();const d=await wait;await d.saveAs(path.join(out,'saved-'+report.results.length+'.akari.md'));await p.waitForFunction(()=>!Akari.app.editorState.dirty);}
async function chooser(p){const wait=p.waitForEvent('filechooser');await projectAction(p, 'openBtn');return wait;}
async function acceptedChooser(p){await projectAction(p, 'openBtn');await p.locator('#loseConfirmModal.show').waitFor();const wait=p.waitForEvent('filechooser');await p.locator('#loseConfirmProceed').click();return wait;}
async function run(id,fn){try{const evidence=await fn();report.results.push({id,status:'PASS',evidence});console.log(id+': PASS');}catch(e){report.results.push({id,status:'FAIL',error:e.stack,evidence:e.evidence||null});console.error(id+': FAIL '+e.message);}fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
async function withPage(b,fn,file=product,width=1180){const p=await page(b,file,width);try{return await fn(p);}finally{await p.context().close();}}
// The product asks about unsaved work in its own dialog. Answer it by pressing the visible
// 「やめる」 button and report the question that was shown.
// It names the work it is about (I5a).
const loseQuestion='「検証用の作品」には まだ ほぞんして いない ところが あるよ。このまま つづけると、いまの 作品は なくなるよ。';
async function askedAndCancelled(p,trigger){await trigger();await p.locator('#loseConfirmModal.show').waitFor();const asked=[await p.locator('#loseConfirmMessage').innerText()];assert.equal(await p.locator('#loseConfirmCancel').innerText(),'やめる');assert.equal(await p.locator('#loseConfirmProceed').innerText(),'すてて つづける');await p.locator('#loseConfirmCancel').click();await p.locator('#loseConfirmModal').waitFor({state:'hidden'});return asked;}
async function audioProbe(c){await c.addInitScript(()=>{window.__tones=[];const AC=window.AudioContext;window.AudioContext=class extends AC{createOscillator(){const o=super.createOscillator(),start=o.start;o.start=(...a)=>{__tones.push({at:performance.now(),frequency:o.frequency.value});return start.apply(o,a);};return o;}};});}
(async()=>{
 const {snapshot}=await import('../lib/product-test-host.mjs');report.snapshot=snapshot(product);
 const browserPath=process.argv[2];assert.ok(browserPath&&fs.existsSync(browserPath),'browser required');
 const b=await chromium.launch({executablePath:browserPath,headless:true,args:['--allow-file-access-from-files','--disable-background-networking','--autoplay-policy=no-user-gesture-required']});report.browser=b.version();
 try{
  await run('EXPORT-CHOICE-CANCEL-FOCUS',()=>withPage(b,async p=>{
    await p.waitForFunction(()=>!!Akari.app);let count=0;p.on('download',()=>count++);
    await projectAction(p, 'exportBtn');await p.locator('#exportChoiceModal.show').waitFor();
    assert.equal(await p.locator('#exportControls').evaluate(n=>document.activeElement===n),true);
    await p.screenshot({path:path.join(out,'export-choice.png')});await p.keyboard.press('Shift+Tab');
    assert.equal(await p.locator('#exportChoiceCancel').evaluate(n=>document.activeElement===n),true);
    await p.keyboard.press('Escape');await p.locator('#exportChoiceModal').waitFor({state:'hidden'});
    assert.equal(await p.locator('#projectMenu > summary').evaluate(n=>document.activeElement===n),true);
    for(const cancel of ['button','Escape']){
      await projectAction(p, 'exportBtn');
      // One event-loop turn makes the vulnerable interval deterministic: both the next paint and hidden-page timer
      // are still pending. These are the real chooser/cancel handlers; no export or timer function is replaced.
      const pending=await p.evaluate(cancel=>{
        document.querySelector('#exportArtwork').click();
        const busy=document.querySelector('#exportControls').disabled;
        if(cancel==='button')document.querySelector('#exportChoiceCancel').click();
        else document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
        return{busy,closed:!document.querySelector('#exportChoiceModal.show'),ready:!document.querySelector('#exportBtn').disabled};
      },cancel);
      assert.deepEqual(pending,{busy:true,closed:true,ready:true});await p.waitForTimeout(300);assert.equal(count,0);
    }
    // A new chooser cannot revive a canceled job's stale frame/timer; the next export still creates exactly one file.
    await projectAction(p, 'exportBtn');const pending=p.waitForEvent('download');
    await p.evaluate(()=>{
      document.querySelector('#exportArtwork').click();document.querySelector('#exportChoiceCancel').click();
      document.querySelector('#exportBtn').click();document.querySelector('#exportControls').click();
    });
    await (await pending).saveAs(path.join(out,'after-cancel.html'));await p.waitForTimeout(250);assert.equal(count,1);
    return{downloads:count,staticExamples:await p.locator('.export-example button').count(),canceledPending:3,reopenedOnce:true};
  }));
  await run('EXPORT-CHOICE-NARROW-ONE-DOWNLOAD',()=>withPage(b,async p=>{await p.waitForFunction(()=>!!Akari.app);await projectAction(p, 'exportBtn');await p.screenshot({path:path.join(out,'export-choice-narrow.png')});await p.locator('#exportArtwork').scrollIntoViewIfNeeded();const box=await p.locator('#exportArtwork').boundingBox();assert.ok(box.width<=320&&box.x>=0);let count=0;p.on('download',()=>count++);const wait=p.waitForEvent('download');await p.locator('#exportArtwork').dblclick();const d=await wait;await d.saveAs(path.join(out,'native-artwork.html'));await p.waitForTimeout(200);assert.equal(count,1);return{count,box};},product,320));
  // The player follows the editor: stopped, ▶ 動かす only; running, ■ 止める in ▶'s place and ⏸ いったん止める; paused, ■ and
  // ▶ つづける. A double press of ▶ does not stop at once (its second press lands on ■), and neither does a single press of ■
  // within 0.5 s of ▶ (a click the browser does not count as a double click).
  await run('EXPORT-CONTROLS-DEFAULT-OPERATIONS',()=>withPage(b,async p=>{const shown=()=>p.evaluate(shownControls);
    await p.waitForFunction(()=>document.querySelector('#playerRoot')?.dataset.state==='READY');assert.equal(await p.locator('.sprite-bubble').count(),0);assert.equal(await shown(),'playerStart:▶ 動かす');
    const startBox=await p.locator('#playerStart').boundingBox(),pressedAt=Date.now();await p.locator('#playerStart').click();
    await p.locator('#playerStop').waitFor({state:'visible'});await p.locator('#playerStop').click();const singleAfterMs=Date.now()-pressedAt;await p.waitForTimeout(150);
    assert.ok(singleAfterMs<DOUBLE_PRESS_MS,'the single press of ■ came '+singleAfterMs+' ms after ▶, too late to show the 0.5 s rule');const afterSingle=await p.locator('#playerRoot').getAttribute('data-state');assert.equal(afterSingle,'RUNNING','a single press of ■ within 0.5 s of ▶ does nothing');
    assert.equal(await p.evaluate(()=>document.activeElement?.id),'formSurface');await p.waitForTimeout(DOUBLE_PRESS_MS);await p.keyboard.press('Space');assert.equal(await p.locator('#playerRoot').getAttribute('data-state'),'RUNNING');
    await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('冒頭'));
    assert.equal(await shown(),'playerStop:■ 止める playerPause:⏸ いったん止める');assert.equal(Math.round((await p.locator('#playerStop').boundingBox()).x),Math.round(startBox.x),'■ takes the place of ▶');
    // ⏸ いったん止める; a second press of that place within 0.5 s does nothing, and the focus is on the place, now ▶ つづける.
    await p.locator('#playerPause').click();const pausedAt=Date.now();assert.equal(await p.locator('#playerRoot').getAttribute('data-state'),'PAUSED');assert.equal(await shown(),'playerStop:■ 止める playerPause:▶ つづける');
    assert.equal(await p.evaluate(()=>document.activeElement?.id),'playerPause','after ⏸ the focus is on ▶ つづける');
    await p.locator('#playerPause').click();const secondAfterMs=Date.now()-pausedAt;assert.ok(secondAfterMs<DOUBLE_PRESS_MS,'the second press came '+secondAfterMs+' ms after ⏸, too late to show the 0.5 s rule');
    assert.equal(await p.locator('#playerRoot').getAttribute('data-state'),'PAUSED','a press of ▶ つづける within 0.5 s of ⏸ does nothing');
    // After 0.5 s, ▶ つづける goes on and the keys reach the work.
    await pressStop(p.locator('#playerPause'));assert.equal(await p.locator('#playerRoot').getAttribute('data-state'),'RUNNING');assert.equal(await shown(),'playerStop:■ 止める playerPause:⏸ いったん止める');
    assert.equal(await p.evaluate(()=>document.activeElement?.id),'formSurface','after ▶ つづける the keys reach the work');
    await pressStop(p.locator('#playerStop'));assert.equal(await p.locator('#playerRoot').getAttribute('data-state'),'STOPPED');assert.equal(await shown(),'playerStart:▶ 動かす');
    await p.locator('#playerStart').dblclick();await p.waitForTimeout(300);const afterDouble=await p.locator('#playerRoot').getAttribute('data-state');assert.notEqual(afterDouble,'STOPPED','a double press of ▶ does not stop at once');
    await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('冒頭'));return{title:await p.locator('#playerTitle').innerText(),restart:true,pauseResumeStop:true,oneSlot:true,doublePressRuns:afterDouble!=='STOPPED',singlePressWithinHalfSecondRuns:afterSingle==='RUNNING',pauseSlotGuard:true,ignoredStopKeepsStageFocus:true};},generate('controls',marker,{},'default')));
  // The controls player when the work ends: every body has ended, or 作品を全部止める ran. It shows ■ 止める only, and ■
  // goes back to ▶ 動かす (LANGUAGE.md 書き出した作品のはじめ方).
  await run('EXPORT-CONTROLS-FINISHED',async()=>{const ended=async file=>withPage(b,async p=>{const shown=()=>p.evaluate(shownControls);
    await p.waitForFunction(()=>document.querySelector('#playerRoot')?.dataset.state==='READY');await p.locator('#playerStart').click();
    await p.waitForFunction(()=>document.querySelector('#playerRoot').dataset.state==='FINISHED');await p.waitForTimeout(300);const finished={state:await p.locator('#playerRoot').getAttribute('data-state'),shown:await shown(),afterStopAllSaid:(await p.locator('#formSurface').textContent()).includes('とどかない')};
    await pressStop(p.locator('#playerStop'));return{...finished,afterStop:await shown()};},file);
   const bodies=await ended(generate('controls-ended','「おわり」と言う。',{},'default')),stopAll=await ended(generate('controls-stop-all','「とまる」と言う。\n作品を全部止める。\n「とどかない」と言う。',{},'default'));
   const failedReasonVisible=await withPage(b,async p=>{await p.setViewportSize({width:1366,height:650});await p.waitForFunction(()=>document.querySelector('#playerRoot')?.dataset.state==='READY');await p.locator('#playerStart').click();await p.waitForFunction(()=>document.querySelector('#playerRoot').dataset.state==='FAILED');const rect=await p.evaluate(()=>{const r=document.querySelector('#playerOutput').getBoundingClientRect(),s=document.querySelector('#playerStop').getBoundingClientRect();return{top:r.top,bottom:r.bottom,stopTop:s.top,stopBottom:s.bottom,height:innerHeight,text:document.querySelector('#playerOutput').innerText};});assert.ok(rect.top>=0&&rect.bottom<=rect.height&&rect.stopTop>=0&&rect.stopBottom<=rect.height);assert.ok(rect.text.includes('0では'));return true;},generate('controls-failed-visible','点数を（1÷0）にする。',{stage:{...make('').stage,width:1000,height:700}},'default'));
   return{failedReasonVisible,bodiesEnded:bodies.shown,bodiesState:bodies.state,stopAll:stopAll.shown,stopAllState:stopAll.state,sentenceAfterStopAllSaid:stopAll.afterStopAllSaid,afterStop:[bodies.afterStop,stopAll.afterStop]};});
  await run('EXPORT-CONTROLS-SCALE',async()=>{const sized=(name,width,height)=>{const p=make(marker);p.stage.width=width;p.stage.height=height;const file=path.join(out,name+'.html');fs.writeFileSync(file,api.generateStandaloneHtml(p,api.makeDefaultAssetStore()));return file;};
   const shown=async(file,window,running=false)=>{const c=await b.newContext({offline:true,viewport:window});await c.route(/^https?:/,r=>{report.networkRequests.push(r.request().url());return r.abort();});try{const p=await c.newPage();p.on('pageerror',e=>report.pageErrors.push(e.message));await p.goto(pathToFileURL(file).href);
     await p.waitForFunction(()=>document.querySelector('#playerRoot')?.dataset.state==='READY');const measure=()=>p.evaluate(()=>{const r=document.querySelector('#formSurface').getBoundingClientRect(),stop=document.querySelector('#playerStop').getBoundingClientRect();
       return{width:Math.round(r.width),height:Math.round(r.height),right:Math.round(r.right),bottom:Math.round(r.bottom),innerWidth,innerHeight,pageHeight:document.documentElement.scrollHeight,stopTop:Math.round(stop.top)};});
     const ready=await measure();if(!running)return ready;
     // Running: ■ 止める and the status line come in; the whole stage still fits the window, with ■ on the screen (the
     // lines under the stage, such as the reason after a mistake, may need the page scrolled).
     await p.locator('#playerStart').click();await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('冒頭'));return{...ready,running:await measure()};}finally{await c.close();}};
   // LANGUAGE.md: the ▶ export uses the same scale as the run screen, whose first scale is the one where both the width
   // and the height fit (幅と高さの両方が収まる倍率); a work that fits stays at 100%.
   const inside=m=>m.right<=m.innerWidth&&m.bottom<=m.innerHeight&&m.stopTop>=0,fits=m=>inside(m)&&m.pageHeight<=m.innerHeight&&inside(m.running);
   const small=sized('scale-640',640,400),large=sized('scale-1200',1200,800),tall=sized('scale-1000',1000,700);
   const s1366=await shown(small,{width:1366,height:900}),s1920=await shown(small,{width:1920,height:1200}),l1920=await shown(large,{width:1920,height:1200}),l1366=await shown(large,{width:1366,height:900});
   const t1366=await shown(tall,{width:1366,height:650},true),s650=await shown(small,{width:1366,height:650},true);
   const near=(a,b)=>Math.abs(a-b)<=2;
   return{small1366:near(s1366.width,640),small1920:near(s1920.width,640),large1920:near(l1920.width,1200),large1366Fits:l1366.right<=l1366.innerWidth&&l1366.width>640,
     tall650Fits:fits(t1366)&&t1366.width<1000&&near(t1366.width/t1366.height,1000/700),small650Fits:near(s650.width,640)&&near(s650.height,400)&&fits(s650),
     observed:{s1366,s1920,l1920,l1366,t1366,s650}};});
  // Making a file checks every asset as the player would (PERF-R2-02): the bytes hashed while packing are not decoded and
  // hashed again, but a record whose bytes do not match its hash is refused (F508), and the file's own check still
  // refuses a changed asset text, sha256 or byteLength, or a changed program (X602).
  await run('EXPORT-PACKED-ASSETS-CHECKED',async()=>{const code=f=>{try{f();return 'accepted';}catch(e){return e.code||e.message;}};
   const p=make('「やあ」と言う。'),sprite=p.components.find(c=>c.type==='sprite'),def=api.makeDefaultAssetStore().get(sprite.costumes[0].assetId);
   sprite.costumes[0].assetId='asset-own-star';
   const store=bytes=>{const s=new api.AssetStore();s.addImmutable({id:'asset-own-star',kind:def.kind,mime:def.mime,sha256:def.sha256,bytes,meta:{}});return s;};
   const good=store(new Uint8Array(def.bytes)),changed=new Uint8Array(def.bytes);changed[200]^=1;
   const made=code(()=>api.generateStandaloneHtml(p,good)),mismatched=code(()=>api.generateStandaloneHtml(p,store(changed)));
   const pk=api.packExecutable(p,good),packed=()=>new Map(pk.assets.map(a=>[a.id,{text:a.dataBase64,record:good.get(a.id)}])),i=pk.assets.findIndex(a=>a.id==='asset-own-star');
   assert.ok(i>=0);const restored=code(()=>api.restoreExecutable(JSON.parse(JSON.stringify(pk)),{packed:packed()}));
   const variants={text:d=>{const t=d.assets[i].dataBase64;d.assets[i].dataBase64=t.slice(0,40)+(t[40]==='A'?'B':'A')+t.slice(41);},sha256:d=>{d.assets[i].sha256='0'.repeat(64);},
     byteLength:d=>{d.assets[i].byteLength+=1;},program:d=>{d.program[0].ownerId='nobody';}};
   const refused=Object.fromEntries(Object.entries(variants).map(([k,m])=>{const d=JSON.parse(JSON.stringify(pk));m(d);return [k,code(()=>api.restoreExecutable(d,{packed:packed()}))];}));
   for(const [name,field,value]of [['claimedText','dataBase64','not-valid-base64'],['claimedHash','sha256','0'.repeat(64)],['claimedLength','byteLength',pk.assets[i].byteLength+1]]){const d=JSON.parse(JSON.stringify(pk));d.assets[i][field]=value;const spoof=new Map(d.assets.map(a=>[a.id,{text:a.dataBase64,record:{...good.get(a.id),sha256:a.sha256,byteLength:a.byteLength}}]));refused[name]=code(()=>api.restoreExecutable(d,{packed:spoof}));}
   const {observeExportRoundtrips,observeEditorExportTrace}=await import('../lib/export-semantics-observations.mjs');const semantics={roundtrips:observeExportRoundtrips(api),trace:observeEditorExportTrace(api)};return{made,mismatched,restored,refused,semantics};});
  // On a touch screen (coarse pointer) every button of the ▶ player and its question window is at least 40 px tall (E-19).
  await run('EXPORT-CONTROLS-TOUCH-SIZE',async()=>{const c=await b.newContext({offline:true,viewport:{width:1024,height:768},hasTouch:true,isMobile:true});await c.route(/^https?:/,r=>{report.networkRequests.push(r.request().url());return r.abort();});
   try{const p=await c.newPage();p.on('pageerror',e=>report.pageErrors.push(e.message));await p.goto(pathToFileURL(generate('controls-touch','「答えは？」とたずねる。\n答えを言う。\n10秒待つ。',{},'default')).href);
    assert.equal(await p.evaluate(()=>matchMedia('(pointer: coarse)').matches),true,'the page sees a coarse pointer');
    await p.waitForFunction(()=>document.querySelector('#playerRoot')?.dataset.state==='READY');const height=sel=>p.locator(sel).evaluate(n=>Math.round(n.getBoundingClientRect().height));
    const sizes={start:await height('#playerStart')};await p.locator('#playerStart').tap();await p.locator('#questionModal.show').waitFor();
    sizes.stop=await height('#playerStop');sizes.pause=await height('#playerPause');sizes.questionStop=await height('#questionStop');sizes.questionSubmit=await height('#questionSubmit');
    for(const [k,v] of Object.entries(sizes))assert.ok(v>=40,k+' is '+v+' px tall');
    return{allAtLeast40:true,sizes};}finally{await c.close();}});
  await run('EXPORT-ARTWORK-SIZE-RELOAD-INPUT',()=>withPage(b,async p=>{await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('冒頭'));const box=await p.locator('#formSurface').boundingBox();assert.deepEqual({x:box.x,y:box.y,width:box.width,height:box.height},{x:0,y:0,width:640,height:400});assert.equal(await p.locator('#playerStart,#playerPause,#playerStop,#playerTitle,#playerStatus').count(),0);await p.locator('.component[data-runtime-id="button-1"]').click();await p.waitForFunction(()=>document.querySelector('#formSurface').textContent.includes('作品のボタン'));await p.locator('#formSurface').focus();await p.keyboard.press('a');await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('作品のキー'));await p.reload();await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('冒頭'));assert.doesNotMatch(await p.locator('#playerOutput').innerText(),/作品のキー/);return{box,noControls:true,nativeButtonAndKey:true,touch:await observeArtworkTouch(b,api,out,{error:e=>report.pageErrors.push(e),network:u=>report.networkRequests.push(u)})};},generate('artwork-input',marker,{scripts:[{targetId:'stage',event:'start',source:marker},{targetId:'button-1',event:'click',source:'「作品のボタン」と言う。'},{targetId:'stage',event:'keyDown',source:'「作品のキー」と言う。'}]}),320));
  await run('EXPORT-ARTWORK-QUESTION-ANSWER-STOP',()=>withPage(b,async p=>{await p.setViewportSize({width:1366,height:650});await p.locator('#questionModal.show').waitFor();await p.locator('#questionAnswer').fill('返答');await p.locator('#questionSubmit').click();await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('返答'));await p.reload();await p.locator('#questionModal.show').waitFor();await p.locator('#questionStop').click();assert.equal(await p.locator('#playerRoot').getAttribute('data-state'),'STOPPED');assert.equal(await p.locator('#formSurface').evaluate(n=>document.activeElement===n),true);const stopMessageVisible=await p.locator('#playerOutput').evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&n.textContent.includes('止めたよ');});assert.equal(stopMessageVisible,true);return{answer:true,stop:true,stopMessageVisible};},generate('artwork-question','「答えは？」とたずねる。\n答えの値を言う。\n10秒待つ。',{stage:{...make('').stage,width:1000,height:700}})));
  await run('EXPORT-ARTWORK-AUDIO-PERMITTED',async()=>{const c=await b.newContext({offline:true});await audioProbe(c);const p=await c.newPage();try{p.on('pageerror',e=>report.pageErrors.push(e.message));await p.goto(pathToFileURL(generate('audio-permitted',tone)).href);await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('冒頭'));assert.equal(await p.locator('#playerActivation').isVisible(),false);assert.equal(await p.evaluate(()=>__tones.length),1);return{starts:await p.evaluate(()=>__tones),automatic:true};}finally{await c.close();}});

  await run('EXPORT-ARTWORK-IMAGE-PEN-STOP',()=>withPage(b,async p=>{
    await p.waitForFunction(()=>document.querySelector('#formSurface').textContent.includes('絵と線'));
    const images=await p.locator('#formSurface img').evaluateAll(ns=>ns.map(n=>({complete:n.complete,width:n.naturalWidth})));
    assert.ok(images.length&&images.every(n=>n.complete&&n.width>0));
    const painted=await p.locator('#penCanvas').evaluate(n=>Array.from(n.getContext('2d').getImageData(0,0,n.width,n.height).data).some((v,i)=>i%4===3&&v>0));
    assert.ok(painted);await p.screenshot({path:path.join(out,'artwork-image-pen.png')});
    // 作品を全部止める ends the run and keeps its last picture (the work has no ■ to go back).
    await p.locator('.component[data-runtime-id="button-1"]').click();
    await p.waitForFunction(()=>document.querySelector('#playerRoot').dataset.state==='FINISHED');
    await p.evaluate(()=>window.dispatchEvent(new Event('focus')));assert.equal(await p.locator('#playerRoot').getAttribute('data-state'),'FINISHED');
    const kept=await p.locator('#penCanvas').evaluate(n=>Array.from(n.getContext('2d').getImageData(0,0,n.width,n.height).data).some((v,i)=>i%4===3&&v>0));
    assert.ok(kept&&await p.locator('#formSurface').textContent().then(t=>t.includes('絵と線')),'the last picture stays');
    return{images,painted,programStop:true,pictureKept:kept};
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
    const file=generate('invalid-contract',marker),html=fs.readFileSync(file,'utf8');const recorded='"runtimeContractId":'+contract.runtimeContractId;assert.equal(html.split(recorded).length,2);
    fs.writeFileSync(file,html.replace(recorded,'"runtimeContractId":0'));
    return withPage(b,async p=>{await p.waitForFunction(()=>document.querySelector('#playerRoot').dataset.state==='ERROR');
      assert.equal(await p.locator('#playerActivation').isVisible(),false);await p.locator('#playerOutput details summary').click();
      assert.match(await p.locator('#playerOutput').innerText(),/X602/);return{rejected:true,detailsVisible:true,errorCode:(await p.locator('#playerOutput details pre').innerText()).match(/^[A-Z]\d+/)?.[0]};},file);
  });
  let mediaFile;
  await run('EXPORT-ARTWORK-RECORDED-AUDIO',()=>withPage(b,async p=>{
    await p.waitForFunction(()=>!!Akari.app);p.on('dialog',d=>d.accept(d.type()==='prompt'?'検証音':undefined));
    await p.locator('#soundInput').setInputFiles(path.resolve('audit/fixtures/audio/tone.m4a'));
    await p.waitForFunction(()=>Akari.app.project.sounds.length===1&&Akari.app.editorState.state==='DESIGN');
    const html=await p.evaluate(()=>{const p=structuredClone(Akari.app.project);p.scripts=[{targetId:'stage',event:'start',source:'「検証音」を鳴らす。\n「音の後」と言う。'}];return Akari.generateStandaloneHtml(p,Akari.app.assetStore,{presentation:'artwork'});});
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
      await p.goto(pathToFileURL(product).href);await install(p);await edit(p);await p.waitForFunction(()=>document.querySelector('#autosaveState').textContent.includes('のこせなかったよ'));
      await projectAction(p, 'openBtn');await p.locator('#loseConfirmModal.show').waitFor();return{faultInjection:'IndexedDB and localStorage unavailable',unsavedStillProtected:true};
    }finally{await c.close();}
  });
  await run('OPEN-RECOVERY-DIRTY-PROTECTED',()=>withPage(b,async p=>{
    await install(p);await edit(p,'「復旧の未保存」と言う。');await p.waitForFunction(()=>document.querySelector('#autosaveState').textContent==='このパソコンに のこしたよ');
    await p.reload();await p.locator('#recoveryRestore').click();await projectAction(p, 'openBtn');await p.locator('#loseConfirmModal.show').waitFor();
    await p.locator('#loseConfirmCancel').click();assert.ok(await p.evaluate(()=>Akari.app.project.scripts.some(s=>s.source.includes('復旧の未保存'))));return{restoredUnsavedProtected:true};
  }));
  await run('OPEN-RECOVERY-SAVED-DRAFT-CLEAN',async()=>{
    const variants=[];
    const newDraftProtection=(text,kind)=>withPage(b,async p=>{
      const restore=async()=>{
        await p.locator('#fileInput').setInputFiles({name:'saved-draft.akari.md',mimeType:'text/plain',buffer:Buffer.from(text)});
        await p.waitForFunction(()=>Akari.app.editorState.state==='DESIGN'&&(Akari.app.editorState.hasDraft||Akari.app.editorState.main.pendingEdit));
        if(kind==='callable')await p.locator('#procClose').click();
      };
      const content=async()=>({...await state(p),...await p.evaluate(()=>({input:document.querySelector('#codeEditor').value,
        pending:Akari.app.editorState.main.pendingEdit?.value??null,callable:Akari.app.editorState.callableDraft}))});
      await restore();const nativeDialogs=[];p.on('dialog',d=>{nativeDialogs.push(d.message());return d.dismiss();});
      await projectAction(p, 'newBtn');const cleanDialogs=await p.locator('#loseConfirmModal.show').count();
      assert.equal(cleanDialogs,0);assert.equal(await p.evaluate(()=>Akari.app.project.name),'新しい作品');
      assert.deepEqual(await p.evaluate(()=>Akari.app.project.scripts.map(s=>s.source)),['']);
      await restore();
      if(kind==='code')await p.locator('#codeEditor').fill('「保存した後の書きかけ');
      else if(kind==='blocks'){
        await p.locator('#blockEditor .blockui-node[data-schema-id="NumberLiteral"] [data-blockui-field="value"]').first().fill('changed');await p.keyboard.press('Tab');
      }else{await p.locator('#procBtn').click();await p.locator('#callableName').fill('保存後の手順');await p.locator('#procClose').click();}
      const before=await content();const asked=await askedAndCancelled(p,()=>projectAction(p, 'newBtn'));const afterNewCancel=await content();
      assert.deepEqual(asked,[loseQuestion]);assert.equal(nativeDialogs.length,0);assert.deepEqual(afterNewCancel,before);
      await projectAction(p, 'openBtn');await p.locator('#loseConfirmModal.show').waitFor();await p.locator('#loseConfirmCancel').click();
      const afterOpenCancel=await content();assert.deepEqual(afterOpenCancel,before);
      return {cleanDialogs,openedNew:true,editedDialogs:asked.length,before,afterNewCancel,afterOpenCancel};
    });
    for(const kind of ['code','blocks'])await withPage(b,async p=>{
      await install(p,kind==='blocks'?'点数を3にする。':marker);
      if(kind==='code')await p.locator('#codeEditor').fill('「保存した書きかけ');
      else{await chooseView(p,'blocks');await p.locator('#blockEditor .blockui-node[data-schema-id="NumberLiteral"] [data-blockui-field="value"]').first().fill('bad');await p.keyboard.press('Tab');}
      await save(p);await p.waitForFunction(()=>document.querySelector('#autosaveState').textContent==='このパソコンに のこしたよ');
      const savedText=fs.readFileSync(path.join(out,'saved-'+report.results.length+'.akari.md'),'utf8');
      await p.reload();await p.locator('#recoveryRestore').click();let pickers=0;p.on('filechooser',()=>pickers++);await projectAction(p, 'openBtn');
      const observed={kind,savedUnchangedConfirmation:await p.locator('#loseConfirmModal.show').isVisible(),pickers};
      if(observed.savedUnchangedConfirmation)await p.locator('#loseConfirmCancel').click();else await p.locator('#fileInput').dispatchEvent('cancel');
      if(kind==='blocks'){
        await cancelInput(p);await projectAction(p, 'openBtn');observed.cancelledSavedPendingConfirmation=await p.locator('#loseConfirmModal.show').isVisible();
      }
      observed.newProject=await newDraftProtection(savedText,kind);
      variants.push(observed);
    });
    try{for(const observed of variants){assert.equal(observed.savedUnchangedConfirmation,false,'saved unchanged '+observed.kind+' must not require confirmation');assert.equal(observed.pickers,1);if(observed.kind==='blocks')assert.equal(observed.cancelledSavedPendingConfirmation,true,'discarding saved pending input changes the saved content');}}
    catch(error){error.evidence={variants};throw error;}
    const callableState={version:1,revision:0,selectedId:'stage',currentEvent:'start',selectedScriptId:null,uiLevel:'advanced',sourceOverviewOpen:false,
      editorModes:{script:'code',draft:'code'},callableDraft:{ownerId:'stage',type:'action',name:'保存した手順',argsText:'',source:'「途中」と言う。',editId:'',loadedKey:''},pendingEditors:[],views:[]};
    const savedCallable=await newDraftProtection(api.serializeProject(make(marker),api.makeDefaultAssetStore(),callableState),'callable');
    return{variants,savedCallable};
  });

  await run('OPEN-CLEAN-AUTOSAVE-DIRECT',()=>withPage(b,async p=>{await install(p);await save(p);await p.waitForFunction(()=>document.querySelector('#autosaveState')?.textContent==='このパソコンに のこしたよ',null,{timeout:10000}).catch(()=>{});assert.equal(await p.locator('#autosaveState').innerText(),'このパソコンに のこしたよ');await chooser(p);assert.equal(await p.locator('#loseConfirmModal.show').isVisible(),false);await p.locator('#fileInput').dispatchEvent('cancel');return{direct:true,autosavePresent:true};}));
  await run('OPEN-DIRTY-CANCEL-STATE-KEYBOARD',()=>withPage(b,async p=>{await install(p);await edit(p);const before=await state(p);let pickers=0;p.on('filechooser',()=>pickers++);await projectAction(p, 'openBtn');await p.locator('#loseConfirmModal.show').waitFor();assert.equal(pickers,0);assert.doesNotMatch(await p.locator('#loseConfirmModal.show').innerText(),/ファイル|はい/);await p.screenshot({path:path.join(out,'open-unsaved.png')});await p.keyboard.press('Escape');await p.locator('#loseConfirmModal.show').waitFor({state:'hidden'});assert.deepEqual(await state(p),before);assert.equal(await p.locator('#projectMenu > summary').evaluate(n=>document.activeElement===n),true);return{before,after:await state(p),pickers};}));
  await run('OPEN-APPROVAL-PICKER-CANCEL-REUSE',()=>withPage(b,async p=>{await install(p);await edit(p);const before=await state(p);let dialogs=0;p.on('dialog',d=>{dialogs++;return d.dismiss();});await acceptedChooser(p);await p.locator('#fileInput').dispatchEvent('cancel');assert.deepEqual(await state(p),before);await projectAction(p, 'openBtn');await p.locator('#loseConfirmModal.show').waitFor();await p.locator('#loseConfirmCancel').click();assert.equal(dialogs,0);return{currentRetained:true,confirmationAgain:true,before,after:await state(p)};}));
  await run('OPEN-SAVE-EDIT-UNDO-REDO',()=>withPage(b,async p=>{await install(p);await edit(p,'「保存した作品」と言う。');await save(p);await chooser(p);await p.locator('#fileInput').dispatchEvent('cancel');await edit(p,'「保存後の編集」と言う。');await p.locator('#undoBtn').click();await chooser(p);assert.equal(await p.locator('#loseConfirmModal.show').isVisible(),false);await p.locator('#fileInput').dispatchEvent('cancel');await p.locator('#redoBtn').click();await projectAction(p, 'openBtn');await p.locator('#loseConfirmModal.show').waitFor();await p.locator('#loseConfirmCancel').click();return{saveClean:true,undoClean:true,redoDirty:true};}));
  await run('OPEN-APPROVED-CORRUPT-RETAINED',async()=>{
    const incoming=make('「一つ目」と言う。');incoming.name='入れ替える作品';incoming.scripts[0].id='incoming-first';
    incoming.scripts.push({id:'incoming-second',targetId:'stage',event:'start',source:'「二つ目」と言う。'});
    const editor={version:1,revision:0,selectedId:'stage',currentEvent:'start',selectedScriptId:'incoming-second',uiLevel:'advanced',sourceOverviewOpen:false,
      editorModes:{script:'code',draft:'code'},callableDraft:null,
      pendingEditors:[{kind:'script',ownerKey:'script:incoming-second',source:'「読込み途中',mode:'code',pending:{kind:'code',value:'「読込み途中'},draftTree:null}],
      views:[{kind:'script',ownerKey:'script:incoming-second',codeSelection:{start:1,end:3,direction:'forward'},scrollState:{codeTop:0,codeLeft:0}}]};
    const valid=api.serializeProject(incoming,api.makeDefaultAssetStore(),editor),variants=[];
    const stored=async p=>p.evaluate(async autosaveDatabase=>{
      const req=indexedDB.open(autosaveDatabase,1),db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
      try{const get=db.transaction('workspace','readonly').objectStore('workspace').get('latest'),rec=await new Promise((resolve,reject)=>{get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);});
        if(!rec)return null;const decoded=await Akari.decodeWorkspaceHistory(rec.workspace);
        return {cursor:decoded.cursor,frames:decoded.frames.map(f=>({project:JSON.stringify(f.project),pending:f.editorState.pendingEditors,callableDraft:f.editorState.callableDraft}))};
      }finally{db.close();}
    },autosaveDatabase);
    for(const kind of ['invalid-file','wrong-target','wrong-event','restore-failure'])await withPage(b,async p=>{
      await install(p);await edit(p,'「残したい作品」と言う。');await edit(p,'「やり直せる作品」と言う。');await p.locator('#undoBtn').click();
      await p.waitForFunction(()=>document.querySelector('#autosaveState').textContent==='このパソコンに のこしたよ');
      const before=await state(p),autosaveBefore=await stored(p);assert.ok(before.history>=2&&before.redo>=1&&before.dirty&&autosaveBefore);
      let dialogs=0;p.on('dialog',d=>{dialogs++;return d.dismiss();});const f=await acceptedChooser(p);
      if(kind==='restore-failure')await p.evaluate(()=>{
        const original=HTMLTextAreaElement.prototype.setSelectionRange;window.openRestoreFault=false;
        HTMLTextAreaElement.prototype.setSelectionRange=function(...args){
          if(!window.openRestoreFault&&Akari.app.project.name==='入れ替える作品'){
            window.openRestoreFault=true;throw new Error('injected editor restoration failure');
          }
          return original.apply(this,args);
        };
      });
      const text=kind==='invalid-file'?'破損した作品':kind==='wrong-target'?valid.replaceAll('"selectedId": "stage"','"selectedId": "sprite-1"'):
        kind==='wrong-event'?valid.replaceAll('"currentEvent": "start"','"currentEvent": "keyDown"'):valid;
      await f.setFiles({name:kind+'.akari.md',mimeType:'text/plain',buffer:Buffer.from(text)});
      await p.waitForFunction(()=>Akari.app.editorState.state==='DESIGN'&&document.querySelector('#console').textContent.includes('読みこめませんでした'));
      const after=await state(p),autosaveAfter=await stored(p),faultTriggered=await p.evaluate(()=>!!window.openRestoreFault);
      assert.deepEqual(after,before);assert.deepEqual(autosaveAfter,autosaveBefore);assert.equal(dialogs,0);assert.equal(faultTriggered,kind==='restore-failure');
      // A refused 開く stays on the screen until とじる (1.5.0); closing it leaves the work and its autosave as they were.
      await p.locator('#openRefusalModal.show').waitFor();assert.equal(await p.locator('#openRefusalTitle').textContent(),'この ファイルは 開けなかったよ');await p.locator('#openRefusalClose').click();await p.locator('#openRefusalModal').waitFor({state:'hidden'});
      assert.deepEqual(await state(p),before);
      await projectAction(p, 'openBtn');await p.locator('#loseConfirmModal.show').waitFor();
      variants.push({kind,before,after,autosaveBefore,autosaveAfter,faultTriggered,confirmationAgain:true,dialogs});
    });
    // A valid selected second body must still load, including its unfinished text.
    const validSecond=await withPage(b,async p=>{
      await install(p);await p.locator('#fileInput').setInputFiles({name:'second-body.akari.md',mimeType:'text/plain',buffer:Buffer.from(valid)});
      await p.waitForFunction(()=>Akari.app.project.name==='入れ替える作品'&&Akari.app.editorState.state==='DESIGN');
      assert.equal(await p.evaluate(()=>Akari.app.editorState.selectedScriptId),'incoming-second');
      assert.equal(await p.locator('#codeEditor').inputValue(),'「読込み途中');
      return {selectedScriptId:await p.evaluate(()=>Akari.app.editorState.selectedScriptId),input:await p.locator('#codeEditor').inputValue()};
    });
    return{retained:true,dialogs:0,before:variants[0].before,after:variants[0].after,variants,validSecond};
  });
  await run('OPEN-APPROVED-SUCCESS-SAME-SELECTION',()=>withPage(b,async p=>{await install(p);await edit(p);let dialogs=0;p.on('dialog',d=>{dialogs++;return d.dismiss();});const text=api.serializeProject(make('「読込み後」と言う。'),api.makeDefaultAssetStore()),file={name:'same.akari.md',mimeType:'text/plain',buffer:Buffer.from(text)};let f=await acceptedChooser(p);await f.setFiles(file);await p.waitForFunction(()=>Akari.app.project.scripts[0].source==='「読込み後」と言う。');assert.equal(dialogs,0);f=await chooser(p);await f.setFiles(file);await p.waitForFunction(()=>Akari.app.editorState.state==='DESIGN');return{oneConfirmation:true,sameSelection:true,dialogs};}));
  await run('OPEN-ALTERNATE-ROUTE-PROTECTED',()=>withPage(b,async p=>{await install(p);await edit(p);const before=await state(p),native=[];p.on('dialog',d=>{native.push(d.message());return d.dismiss();});const dialogs=await askedAndCancelled(p,()=>p.locator('#fileInput').setInputFiles({name:'other.akari.md',mimeType:'text/plain',buffer:Buffer.from(api.serializeProject(make(marker),api.makeDefaultAssetStore()))}));assert.deepEqual(await state(p),before);assert.equal(dialogs.length,1);assert.equal(native.length,0);return{dialogs,retained:true,before,after:await state(p)};}));
  await run('OPEN-CHANGED-AFTER-APPROVAL',()=>withPage(b,async p=>{await install(p);await edit(p);const f=await acceptedChooser(p);await p.locator('#codeEditor').evaluate(n=>{n.value='「承諾後の変更」と言う。';n.dispatchEvent(new Event('input',{bubbles:true}));});await p.waitForTimeout(350);const before=await state(p),native=[];p.on('dialog',d=>{native.push(d.message());return d.dismiss();});const dialogs=await askedAndCancelled(p,()=>f.setFiles({name:'other.akari.md',mimeType:'text/plain',buffer:Buffer.from(api.serializeProject(make(marker),api.makeDefaultAssetStore()))}));assert.deepEqual(await state(p),before);assert.equal(dialogs.length,1);assert.equal(native.length,0);return{changedStateProtected:true,before,after:await state(p),dialogs};}));
  await run('OPEN-UNFINISHED-CODE-AND-SAVED-DRAFT',()=>withPage(b,async p=>{await install(p);await p.locator('#codeEditor').fill('「書きかけ');await projectAction(p, 'openBtn');await p.locator('#loseConfirmModal.show').waitFor();await p.locator('#loseConfirmCancel').click();assert.equal(await p.locator('#codeEditor').inputValue(),'「書きかけ');await save(p);await chooser(p);assert.equal(await p.locator('#loseConfirmModal.show').isVisible(),false);await p.locator('#fileInput').dispatchEvent('cancel');return{unfinishedProtected:true,savedUnchangedDirect:true};}));
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
      assert.match(await p.locator('#playerOutput').innerText(),/音を 出せなかったよ/);await p.locator('#playerOutput details summary').click();
      assert.match(await p.locator('#playerOutput').innerText(),/R415/);return{faultInjection:'resume rejected after native user operation',safeStop:true,childMessage:true,details:true,errorCode:(await p.locator('#playerOutput details pre').innerText()).match(/^[A-Z]\d+/)?.[0]};
    }finally{await c.close();}
  });
  await run('EXPORT-NO-AUDIO-DOES-NOT-WAIT' ,()=>withPage(blocked,async p=>{await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('冒頭'));assert.equal(await p.locator('#playerActivation').isVisible(),false);return{automatic:true};},generate('silent-block-policy',marker)));
 }finally{await blocked.close();}
 report.status=report.results.every(r=>r.status==='PASS')&&!report.pageErrors.length&&!report.networkRequests.length?'PASS':'FAIL';fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status,report.results.length);checkEvidenceNegatives(report,snapshot(product));report.validatorNegatives='PASS';fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');verifyExportOpen(report,snapshot(product));
})().catch(e=>{console.error(e);process.exitCode=1;});
