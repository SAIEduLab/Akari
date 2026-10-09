import {makeRegressionProject,installRegressionProject,showAdvancedCode} from '../lib/gate-ui-fixture.mjs';
import { currentProductFile, currentProductVersion } from "./../lib/product-path.cjs";
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {editorAssetIds,verifyEditorAssets} from '../lib/feature-contract.mjs';

const [browserPath, output] = process.argv.slice(2);
assert.ok(output && !fs.existsSync(output), 'fresh feature evidence required');
const artifacts = path.join(path.dirname(output), 'editor-assets');
fs.mkdirSync(artifacts, {recursive:true});
const inputs = snapshot(currentProductFile()), results = [], pageErrors = [], networkRequests = [];
const fixtureApi = loadApi(fs.readFileSync(currentProductFile(),'utf8'));
const savedProject = makeRegressionProject(fixtureApi);
savedProject.name = '作品の保存確認';
const savedFile = fixtureApi.serializeProject(savedProject, fixtureApi.makeDefaultAssetStore());
async function reveal(locator) {
  if (!await locator.isVisible()) for (const panel of await locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())
    await panel.locator('.blockui-side-toggle').click();
  for (const detail of await locator.locator('xpath=ancestor::details[not(@open)]').all()) await detail.locator(':scope > summary').click();
  return locator;
}
const click = async (p, selector) => (await reveal(p.locator(selector))).click();
const state = p => p.evaluate(() => ({project:JSON.stringify(Akari.app.project),assets:Akari.app.assetStore.ids(),history:Akari.app.editorState.history,redo:Akari.app.editorState.redo}));
const current = p => p.evaluate(() => structuredClone(Akari.app.project.components.find(c => c.id === document.querySelector('#objectSelect').value)));
async function select(p,id) { await (await reveal(p.locator('#objectSelect'))).selectOption(id); }
async function open(p) { await click(p,'#paintAdd'); await p.locator('#paintModal.show').waitFor(); }
async function width(p,value) { await p.locator('#paintWidth').evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}));},value); }
async function color(p,value) { await p.locator('#paintColor').fill(value); }
async function draw(p,tool,from,to=from,filled=false) {
  await p.locator('[data-paint-tool="'+tool+'"]').click();
  if (['rectangle','ellipse'].includes(tool)) await p.locator('#paintShape').selectOption(filled?'filled':'outline');
  await p.locator('#paintCanvas').scrollIntoViewIfNeeded();
  const r = await p.locator('#paintCanvas').boundingBox(), at=([x,y])=>[r.x+x*r.width/500,r.y+y*r.height/500];
  await p.mouse.move(...at(from)); await p.mouse.down();
  if (from[0]!==to[0]||from[1]!==to[1]) await p.mouse.move(...at(to),{steps:8});
  await p.mouse.up();
}
const pixel = (p,x,y) => p.locator('#paintCanvas').evaluate((e,[x,y])=>Array.from(e.getContext('2d').getImageData(x,y,1,1).data),[x,y]);
const ink = p => p.locator('#paintCanvas').evaluate(e=>e.getContext('2d').getImageData(0,0,500,500).data.some((v,i)=>i%4===3&&v>0));
async function commit(p) { await p.locator('#paintCommit').click(); await p.locator('#paintModal').waitFor({state:'hidden'}); }
const imageInfo = p => p.evaluate(async()=>{
  const c=Akari.app.project.components.find(c=>c.id===document.querySelector('#objectSelect').value),
    asset=Akari.app.assetStore.get(c.costumes.find(co=>co.id===c.costumeId).assetId),
    bitmap=await createImageBitmap(new Blob([asset.bytes],{type:asset.mime})), cv=document.createElement('canvas');
  cv.width=bitmap.width;cv.height=bitmap.height;const ctx=cv.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
  const data=ctx.getImageData(0,0,cv.width,cv.height).data;
  let count=0,left=cv.width,top=cv.height,right=-1,bottom=-1;
  for(let y=0;y<cv.height;y++)for(let x=0;x<cv.width;x++)if(data[(y*cv.width+x)*4+3]){count++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  return {width:cv.width,height:cv.height,count,left,top,right,bottom,first:Array.from(data.slice(0,4)),mime:asset.mime};
});
// Read runtime readiness and image presentation atomically within the existing page bound.
async function observeStandaloneDango(p,id) {
  const handle=await p.waitForFunction(id=>{
    if(document.querySelector('#playerRoot')?.dataset.state!=='RUNNING')return false;
    const c=Array.from(document.querySelectorAll('#formSurface .component')).find(c=>c.dataset.id===id),i=c?.querySelector('.costume-img');
    if(!i?.complete||i.naturalWidth!==180||i.naturalHeight!==180)return false;
    const canvas=document.createElement('canvas');canvas.width=180;canvas.height=180;canvas.getContext('2d').drawImage(i,0,0);
    return {width:c.style.width,height:c.style.height,fit:getComputedStyle(i).objectFit,alpha:canvas.getContext('2d').getImageData(0,0,1,1).data[3]};
  },id);
  try {return await handle.jsonValue();} finally {await handle.dispose();}
}
async function standaloneObservationControls(p) {
  const controls=[],frame=await p.context().newPage();
  try {
    const image=await frame.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=180;return c.toDataURL();});
    await frame.setContent('<div id="playerRoot" data-state="PREPARING"><div id="formSurface"><div class="component" data-id="dango-control" style="width:180px;height:180px"><img class="costume-img" style="object-fit:fill" src="'+image+'"></div></div></div>');
    await frame.locator('img').evaluate(i=>i.decode());
    assert.equal(await frame.evaluate(()=>Array.from(document.querySelectorAll('#formSurface .costume-img')).some(i=>i.complete&&i.naturalWidth===180&&i.naturalHeight===180)),true,'old image-only condition accepts PREPARING');
    frame.setDefaultTimeout(100); // Synthetic refusal bound only; product page retains 30000ms.
    async function refused(id) {let error;try{await observeStandaloneDango(frame,id);}catch(e){error=e;}assert.equal(error?.name,'TimeoutError',id+' must not be accepted');}
    await refused('dango-control');controls.push({id:'permanent-preparing',rejected:true,timeoutMs:100});
    frame.setDefaultTimeout(30000); // The positive control uses the unchanged product observation bound.
    await frame.evaluate(()=>requestAnimationFrame(()=>{document.querySelector('#playerRoot').dataset.state='RUNNING';}));
    assert.deepEqual(await observeStandaloneDango(frame,'dango-control'),{width:'180px',height:'180px',fit:'fill',alpha:0});controls.push({id:'delayed-running',accepted:true});
    frame.setDefaultTimeout(100);
    await refused('missing');controls.push({id:'missing-target',rejected:true,timeoutMs:100});
    await frame.locator('img').evaluate(i=>{const c=document.createElement('canvas');c.width=c.height=179;i.src=c.toDataURL();return i.decode();});
    await refused('dango-control');controls.push({id:'wrong-image-size',rejected:true,timeoutMs:100});
    await frame.close();let closed;try{await observeStandaloneDango(frame,'dango-control');}catch(e){closed=e;}assert.match(closed?.message||'',/Target page, context or browser has been closed/);controls.push({id:'closed-page',rejected:true});
  } finally {await frame.close();}
  return controls;
}
const standaloneControls=[];
const cases = {
  async 'duplicate-types-settings-identities'(p) {
    for (const type of ['label','button','input','box','sprite']) {
      await click(p,'.tool[data-type="'+type+'"]'+(type==='sprite'? '[data-sprite-preset="star"]':''));
      const original=await current(p);
      await p.evaluate(id=>{const c=Akari.app.project.components.find(c=>c.id===id);c.name='長'.repeat(80);c.fg='#123456';c.direction=31;c.scalePercent=75;},original.id);
      await select(p,original.id);
      const source=await current(p),before=await state(p);
      await click(p,'.prop-duplicate');const copy=await current(p);
      assert.notEqual(copy.id,source.id);assert.notEqual(copy.name,source.name);assert.ok([...copy.name].length<=80);
      for(const field of ['type','w','h','fg','bg','fontSize','visible','direction','scalePercent','text']) assert.deepEqual(copy[field],source[field]);
      assert.equal(await p.evaluate(id=>Akari.app.project.scripts.some(s=>s.targetId===id),copy.id),false);
      await click(p,'#undoBtn');assert.equal((await state(p)).project,before.project);
      await click(p,'#redoBtn');assert.ok(await p.evaluate(id=>Akari.app.project.components.some(c=>c.id===id),copy.id));
      // Restore this test's deliberately maximal name before the next type.
      await p.evaluate(id=>{Akari.app.project.components.find(c=>c.id===id).name='source-'+id;},source.id);
    }
    assert.equal(await p.evaluate(()=>{Akari.validateDesignProject(Akari.app.project);return true;}),true);
  },
  async 'duplicate-images-data-history'(p) {
    await select(p,'sprite-1');
    const fixture = await p.evaluate(()=>{
      const c=Akari.app.project.components.find(c=>c.id==='sprite-1');c.localData.lists=[{id:'list-private',name:'持ち物',initialValue:['赤',2]}];
      Akari.app.project.name='複製用の画像と個体データ';
      return Akari.serializeProject(Akari.app.project,Akari.app.assetStore);
    });
    await click(p,'#newBtn');
    await p.locator('#fileInput').setInputFiles({name:'duplicate-fixture.akari.md',mimeType:'text/plain',buffer:Buffer.from(fixture)});
    await p.waitForFunction(()=>Akari.app.project.name==='複製用の画像と個体データ'&&Akari.app.editorState.state==='DESIGN');
    await select(p,'sprite-1');
    const source=await current(p), before=await state(p);
    await click(p,'.prop-duplicate');const copy=await current(p),after=await state(p);
    assert.deepEqual(after.assets,before.assets);assert.equal(after.history,before.history+1);
    assert.notEqual(copy.costumeId,source.costumeId);assert.deepEqual(copy.costumes.map(c=>c.assetId),source.costumes.map(c=>c.assetId));
    assert.equal(copy.costumes.length,source.costumes.length);assert.equal(new Set(copy.costumes.map(c=>c.id)).size,copy.costumes.length);
    assert.notEqual(copy.localData.variables[0].id,source.localData.variables[0].id);
    assert.notEqual(copy.localData.lists[0].id,source.localData.lists[0].id);
    await p.evaluate(id=>{Akari.app.project.components.find(c=>c.id===id).localData.lists[0].initialValue[0]='青';},copy.id);
    assert.equal(await p.evaluate(()=>Akari.app.project.components.find(c=>c.id==='sprite-1').localData.lists[0].initialValue[0]),'赤');
    await select(p,source.id);await click(p,'.prop-delete');await select(p,copy.id);
    assert.equal((await imageInfo(p)).mime,'image/png');
    assert.equal(await p.evaluate(()=>Akari.compileProject(Akari.app.project).errors.length),0);
  },
  async 'duplicate-limit'(p) {
    await p.evaluate(()=>{while(Akari.app.project.components.length<500){const n=Akari.app.project.components.length,c=structuredClone(Akari.app.project.components[0]);c.id='limit-'+n;c.name=c.id;Akari.app.project.components.push(c);}});
    await select(p,'button-1');const before=await state(p);
    assert.equal(await (await reveal(p.locator('.prop-duplicate'))).isDisabled(),true);
    assert.deepEqual(await state(p),before);
  },
  async 'paint-entry-empty-focus'(p) {
    for(const mode of ['code','blocks']) {
      await click(p,'#editorMode'+mode);
      assert.equal(await p.locator('#paintAdd').evaluate(e=>e.previousElementSibling.id),'imageObjectAdd');
      await open(p);assert.equal(await p.locator('#paintCommit').isDisabled(),true);
      assert.equal(await p.locator('#paintModal .dialog-body').evaluate(e=>e.scrollHeight<=e.clientHeight+1),true,'desktop drawing tools and canvas fit together');
      assert.equal(await p.locator('[data-paint-color="#e53935"]').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(229, 57, 53)');
      assert.equal(await p.locator('#paintCanvas').evaluate(e=>e.width===500&&e.height===500),true);
      assert.equal(await p.locator('#app').evaluate(e=>e.inert),true);
      await p.keyboard.press('Escape');assert.equal(await p.locator('#paintModal').isVisible(),false);
      assert.equal(await p.locator('#paintAdd').evaluate(e=>document.activeElement===e),true);
    }
    assert.deepEqual(p.dialogLog,[]);
  },
  async 'paint-tools-colors-fill'(p) {
    await open(p);await width(p,4);await color(p,'#ff0000');
    await draw(p,'pen',[40,40],[90,55]);assert.ok((await pixel(p,60,46))[3]>0);
    await draw(p,'line',[30,90],[100,90]);assert.equal((await pixel(p,60,90))[0],255);
    await draw(p,'rectangle',[120,120],[220,220]);assert.equal((await pixel(p,170,170))[3],0);
    await color(p,'#0000ff');await draw(p,'fill',[170,170]);assert.deepEqual(await pixel(p,170,170),[0,0,255,255]);assert.equal((await pixel(p,230,230))[3],0);
    await draw(p,'ellipse',[260,100],[340,180],true);assert.deepEqual(await pixel(p,300,140),[0,0,255,255]);
    await draw(p,'ellipse',[260,230],[340,310]);assert.equal((await pixel(p,300,270))[3],0);
    await draw(p,'rectangle',[360,100],[410,150],true);assert.deepEqual(await pixel(p,380,120),[0,0,255,255]);
    await width(p,20);await draw(p,'eraser',[170,150],[170,190]);assert.equal((await pixel(p,170,170))[3],0);
    assert.ok(await p.locator('#paintCanvas').evaluate(e=>e.getContext('2d').getImageData(0,0,500,500).data.some((v,i)=>i%4===3&&v>0&&v<255)),'smooth boundaries');
    await p.screenshot({path:path.join(artifacts,'paint-tools.png'),fullPage:true});
  },
  async 'paint-history-cancelled-gesture'(p) {
    await open(p);const before=await state(p);await draw(p,'pen',[40,40],[90,60]);
    await p.locator('#paintUndo').click();assert.equal(await ink(p),false);
    await p.keyboard.press('Control+Shift+Z');assert.equal(await ink(p),true);
    await p.keyboard.press('Control+Z');assert.equal(await ink(p),false);
    const r=await p.locator('#paintCanvas').boundingBox();await p.mouse.move(r.x+50,r.y+50);await p.mouse.down();await p.mouse.move(r.x+90,r.y+90);
    await p.keyboard.press('Escape');await p.mouse.up();assert.equal(await ink(p),false);assert.equal(await p.locator('#paintModal').isVisible(),true);
    assert.deepEqual(await state(p),before);
    await p.locator('[data-paint-tool="pen"]').focus();await p.keyboard.press('Shift+Tab');assert.equal(await p.locator('#paintCancel').evaluate(e=>document.activeElement===e),true);
    await width(p,1);
    for(let i=0;i<32;i++)await draw(p,'pen',[20+i*10,30]);
    for(let i=0;i<30;i++)await p.keyboard.press('Control+Z');
    assert.equal(await p.locator('#paintUndo').isDisabled(),true);assert.equal(await ink(p),true,'oldest two strokes retained at history cap');
    for(let i=0;i<30;i++)await p.keyboard.press('Control+Y');
    assert.equal(await p.locator('#paintRedo').isDisabled(),true);
  },
  async 'paint-crop-native-transparent-padding'(p) {
    await open(p);await draw(p,'rectangle',[100,100],[120,115],true);await commit(p);
    let c=await current(p), image=await imageInfo(p);assert.equal(c.w,image.width);assert.equal(c.h,image.height);assert.equal(c.scalePercent,100);
    assert.ok(image.width>=20&&image.width<=21);assert.ok(image.height>=15&&image.height<=16);
    assert.ok(image.count>250);assert.ok(c.x>200&&c.y>100);
    await open(p);await draw(p,'rectangle',[100,100],[101,101],true);await commit(p);
    c=await current(p);image=await imageInfo(p);assert.equal(c.w,8);assert.equal(c.h,8);assert.equal(image.width,8);assert.equal(image.height,8);
    assert.equal(c.scalePercent,100);assert.ok(image.count<=4);assert.deepEqual(image.first,[0,0,0,0]);assert.ok(image.left>=2&&image.top>=2);
  },
  async 'paint-large-stage-fit'(p) {
    await open(p);await draw(p,'fill',[10,10]);await commit(p);
    const c=await current(p);assert.equal(c.w,500);assert.equal(c.h,500);assert.equal(c.scalePercent,80);
    assert.equal(c.x+c.w/2,320);assert.equal(c.y+c.h/2,200);
    assert.equal((await imageInfo(p)).count,250000);
    await click(p,'.prop-duplicate');const copy=await current(p);
    assert.equal(copy.scalePercent,80);assert.equal(copy.y+c.h/2,200,'scaled duplicate stays within stage');
    assert.equal(copy.x,c.x+16);assert.equal(copy.costumes[0].assetId,c.costumes[0].assetId);
  },
  async 'paint-discard'(p) {
    await open(p);const before=await state(p);await draw(p,'pen',[50,50],[100,70]);
    p.acceptDialogs=false;await p.locator('#paintCancel').click();assert.equal(await ink(p),true);assert.equal(await p.locator('#paintModal').isVisible(),true);
    p.acceptDialogs=true;await p.locator('#paintCancel').click();await open(p);assert.equal(await ink(p),false);assert.deepEqual(await state(p),before);
    assert.equal(p.dialogLog.length,2);
  },
  async 'paint-failed-commit-preserves-drawing'(p) {
    await open(p);await draw(p,'pen',[50,50],[100,70]);
    await p.evaluate(()=>{while(Akari.app.project.components.length<500){const c=structuredClone(Akari.app.project.components[0]),n=Akari.app.project.components.length;c.id=c.name='limit-'+n;Akari.app.project.components.push(c);}});
    const before=await state(p);await p.locator('#paintCommit').click();await p.getByText('配置できませんでした:',{exact:false}).waitFor();
    assert.equal(await ink(p),true);assert.equal(await p.locator('#paintCommit').isEnabled(),true);assert.equal((await state(p)).project,before.project);
  },
  async 'paint-save-reload-export'(p) {
    await open(p);await draw(p,'ellipse',[100,100],[160,150],true);await commit(p);
    const c=await current(p), image=await imageInfo(p), count=await p.evaluate(()=>Akari.app.project.components.length);
    await click(p,'#undoBtn');assert.equal(await p.evaluate(()=>Akari.app.project.components.length),count-1);
    await click(p,'#redoBtn');await select(p,c.id);assert.deepEqual(await imageInfo(p),image);
    await click(p,'.prop-duplicate');const copy=await current(p);assert.equal(copy.costumes[0].assetId,c.costumes[0].assetId);
    const saved=path.join(artifacts,'drawing.akari.md');let pending=p.waitForEvent('download');await click(p,'#saveBtn');await (await pending).saveAs(saved);
    await click(p,'#newBtn');await p.locator('#fileInput').setInputFiles(saved);await p.waitForFunction(id=>Akari.app.project.components.some(c=>c.id===id),copy.id);await select(p,copy.id);assert.deepEqual(await imageInfo(p),image);
    const generated=path.join(artifacts,'drawing.html');pending=p.waitForEvent('download');await click(p,'#exportBtn');await p.locator('#exportControls').click();await (await pending).saveAs(generated);
    await p.goto(pathToFileURL(path.resolve(generated)).href);await p.locator('#playerStart').click();
    await p.waitForFunction(()=>document.querySelector('#playerRoot').dataset.state==='RUNNING');
    await p.locator('.component[data-id="'+copy.id+'"] img').waitFor();
    await p.locator('.component[data-id="'+copy.id+'"] img').evaluate(e=>e.decode());
    assert.equal(await p.locator('.component[data-id="'+copy.id+'"] img').evaluate(e=>e.complete&&e.naturalWidth>0),true);
    await p.screenshot({path:path.join(artifacts,'drawing-player.png'),fullPage:true});
  },
  async 'paint-runtime-lock'(p) {
    await select(p,'sprite-1');const duplicate=await reveal(p.locator('.prop-duplicate'));assert.equal(await duplicate.isEnabled(),true);
    await click(p,'#runBtn');await p.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');
    assert.equal(await p.locator('#paintAdd').isDisabled(),true);assert.equal(await duplicate.isDisabled(),true);assert.equal(await duplicate.isVisible(),false);
    await click(p,'#stopBtn');assert.equal(await p.locator('#paintAdd').isEnabled(),true);assert.equal(await duplicate.isEnabled(),true);assert.equal(await duplicate.isVisible(),true);
  },
  async 'paint-small-viewport-touch'(p) {
    await p.setViewportSize({width:390,height:844});await open(p);
    assert.equal(await p.locator('#paintModal').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
    await p.screenshot({path:path.join(artifacts,'paint-mobile.png'),fullPage:true});
    await p.locator('#paintCanvas').scrollIntoViewIfNeeded();
    const r=await p.locator('#paintCanvas').boundingBox(),cdp=await p.context().newCDPSession(p);
    for(const [type,x,y] of [['touchStart',80,80],['touchMove',120,100],['touchEnd',120,100]])
      await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:r.x+x*r.width/500,y:r.y+y*r.height/500}]});
    await cdp.detach();
    assert.ok(await ink(p));await commit(p);assert.ok((await current(p)).w>=40);
    await p.screenshot({path:path.join(artifacts,'drawing-mobile.png'),fullPage:true});
  },
  async 'format-contract-and-import'(p) {
    assert.deepEqual(await p.evaluate(()=>Akari.EXECUTABLE_CONTRACT),{languageContractId:2,runtimeContractId:2,programFormatVersion:2,projectFormatVersion:2});
    await p.locator('#fileInput').setInputFiles({name:'saved-project.akari.md',mimeType:'text/plain',buffer:Buffer.from(savedFile)});
    await p.waitForFunction(()=>Akari.app.project.name==='作品の保存確認'&&Akari.app.editorState.state==='DESIGN');
    assert.equal(await p.evaluate(()=>Akari.app.project.appVersion),(""+currentProductVersion()+""));
    const text=await p.evaluate(()=>Akari.serializeProject(Akari.app.project,Akari.app.assetStore));assert.ok(text.startsWith(("# あかり "+currentProductVersion()+" の作品")));
    assert.equal(await p.evaluate(async text=>(await Akari.parseProjectFile(text)).project.appVersion,text),(""+currentProductVersion()+""));
  },
  async 'format-malformed-state-protection'(p) {
    const before=await state(p);
    for(const text of [savedFile.replace(("# あかり "+currentProductVersion()+" の作品"),'# tampered'),savedFile.replace('"languageContractId": 2','"languageContractId": 1'),savedFile.replace('"formatVersion": 2','"formatVersion": "2"')]) {
      const result=await p.evaluate(async text=>{try{await Akari.parseProjectFile(text);return 'accepted';}catch(e){return e.code;}},text);
      assert.notEqual(result,'accepted');assert.deepEqual(await state(p),before);
    }
  },
  async 'mascot-dango-original-save-standalone'(p) {
    // Keep this stable case ID and every save/reload/export check. The embedded PNG
    // is intentionally resized to 180x180; see AUDIT.md for the contract migration.
    const expected='35eea719e70c3f4ec196c800e107232cee7a16408b44cb04f6094d9c622d7158';
    const mascot=p.locator('[data-sprite-preset="akariMascot"]'),dango=p.locator('[data-sprite-preset="dango"]');
    assert.equal(await mascot.count(),1,'the original mascot choice is retained');
    assert.equal(await dango.count(),1);
    assert.equal((await dango.locator('xpath=ancestor::details[1]').locator('summary').innerText()).replace(/\s+/g,''),'マスコット2種');
    await p.waitForFunction(()=>{
      const i=document.querySelector('[data-sprite-preset="dango"] img');
      return i?.complete&&i.naturalWidth===180&&i.naturalHeight===180;
    });
    const thumbnailPixels=await dango.locator('img').evaluate(async i=>{
      const cv=document.createElement('canvas');cv.width=i.naturalWidth;cv.height=i.naturalHeight;
      const ctx=cv.getContext('2d');ctx.drawImage(i,0,0);
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',ctx.getImageData(0,0,cv.width,cv.height).data)),b=>b.toString(16).padStart(2,'0')).join('');
    });
    await (await reveal(dango)).click();
    const first=await current(p);
    assert.equal(first.name,'だんご');assert.equal(first.w,180);assert.equal(first.h,180);
    const image=await imageInfo(p);
    assert.equal(image.width,180);assert.equal(image.height,180);assert.equal(image.first[3],0,'the original alpha channel remains transparent');
    const asset=await p.evaluate(id=>{
      const c=Akari.app.project.components.find(c=>c.id===id),a=Akari.app.assetStore.get(c.costumes[0].assetId);
      return {id:a.id,sha256:a.sha256,byteLength:a.byteLength,meta:a.meta};
    },first.id);
    assert.equal(asset.sha256,expected);assert.equal(asset.byteLength,35664);assert.deepEqual(asset.meta,{width:180,height:180});
    const originalPixels=await p.evaluate(async id=>{
      const c=Akari.app.project.components.find(c=>c.id===id),a=Akari.app.assetStore.get(c.costumes[0].assetId),
        bitmap=await createImageBitmap(new Blob([a.bytes],{type:a.mime})),cv=document.createElement('canvas');
      cv.width=bitmap.width;cv.height=bitmap.height;const ctx=cv.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',ctx.getImageData(0,0,cv.width,cv.height).data)),b=>b.toString(16).padStart(2,'0')).join('');
    },first.id);
    assert.equal(thumbnailPixels,originalPixels,'the palette decodes the same original pixels');
    await p.screenshot({path:path.join(artifacts,'dango-preset.png'),fullPage:true});
    await (await reveal(dango)).click();const second=await current(p);
    assert.notEqual(second.name,first.name);assert.equal(second.costumes[0].assetId,asset.id,'repeated placement shares one original PNG');
    const charged=await p.evaluate(expected=>Array.from(Akari.app.assetStore.snapshotRefs().values()).filter(a=>a.sha256===expected).map(a=>a.byteLength),expected);
    assert.deepEqual(charged,[35664]);
    await click(p,'#undoBtn');assert.equal(await p.evaluate(id=>Akari.app.project.components.some(c=>c.id===id),second.id),false);
    await click(p,'#redoBtn');assert.equal(await p.evaluate(id=>Akari.app.project.components.some(c=>c.id===id),second.id),true);
    const saved=path.join(artifacts,'dango.akari.md');let pending=p.waitForEvent('download');await click(p,'#saveBtn');await (await pending).saveAs(saved);
    const text=fs.readFileSync(saved,'utf8');assert.ok(Buffer.byteLength(text)<fixtureApi.LIMITS.fileBytes);
    const restored=await p.evaluate(async text=>{
      const r=await Akari.parseProjectFile(text),a=Array.from(r.assetStore.snapshotRefs().values()).find(a=>a.sha256==='35eea719e70c3f4ec196c800e107232cee7a16408b44cb04f6094d9c622d7158');
      return {sha256:a.sha256,byteLength:a.byteLength,components:r.project.components.filter(c=>c.costumes?.some(co=>co.assetId===a.id)).map(c=>({name:c.name,w:c.w,h:c.h}))};
    },text);
    assert.equal(restored.sha256,expected);assert.equal(restored.byteLength,35664);assert.deepEqual(restored.components,[{name:first.name,w:180,h:180},{name:second.name,w:180,h:180}]);
    await click(p,'#newBtn');await p.locator('#fileInput').setInputFiles(saved);
    await p.waitForFunction(id=>Akari.app.project.components.some(c=>c.id===id),second.id);await select(p,second.id);
    assert.deepEqual(await imageInfo(p),image,'save and reload preserve decoded pixels');
    const generated=path.join(artifacts,'dango.html');pending=p.waitForEvent('download');await click(p,'#exportBtn');await p.locator('#exportControls').click();await (await pending).saveAs(generated);
    const html=fs.readFileSync(generated,'utf8');assert.ok(html.includes(expected));
    const raw=Array.from(html.matchAll(/"dataBase64"\s*:\s*"([A-Za-z0-9+/=]+)"/g),match=>Buffer.from(match[1],'base64'));
    assert.ok(raw.some(bytes=>bytes.length===35664&&createHash('sha256').update(bytes).digest('hex')===expected),'standalone HTML carries the exact original PNG');
    await p.goto(pathToFileURL(path.resolve(generated)).href);await p.locator('#playerStart').click();
    const shown=await observeStandaloneDango(p,second.id);
    assert.deepEqual(shown,{width:'180px',height:'180px',fit:'fill',alpha:0},'standalone displays the square original at the requested size without cropping');
    standaloneControls.push(...await standaloneObservationControls(p));
  },
};
assert.deepEqual(Object.keys(cases).sort(),[...editorAssetIds].sort());
let version;const suiteStarted=Date.now();
for(const [id,run] of Object.entries(cases)) {
    try {
      await withBrowser(browserPath,async browser=>{
        const actual=browser.version();if(version)assert.equal(actual,version);version=actual;
        return pageFor(browser,currentProductFile(),async p=>{
        await p.setViewportSize({width:1440,height:1100});p.acceptDialogs=true;p.dialogLog=[];
        p.on('dialog',d=>{p.dialogLog.push(d.message());return p.acceptDialogs?d.accept():d.dismiss();});
        p.on('pageerror',e=>pageErrors.push(id+': '+e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))networkRequests.push(r.url());});
        try { await installRegressionProject(p); await run(p); } catch(e) { await p.screenshot({path:path.join(artifacts,id+'-failure.png'),fullPage:true}).catch(()=>{}); throw e; }
      });},Math.max(1,300000-(Date.now()-suiteStarted)));
      results.push({id,pass:true,detail:'PASS'});console.log('PASS '+id);
    } catch(error) { results.push({id,pass:false,detail:error.stack});console.error('FAIL '+id+': '+error.message); }
}
assert.deepEqual(snapshot(currentProductFile()),inputs);
const report={status:results.every(r=>r.pass)&&!pageErrors.length&&!networkRequests.length?'PASS':'FAIL',snapshot:inputs,environment:'chromium',browser:version,results,pageErrors,networkRequests,standaloneObservationControls:standaloneControls};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
verifyEditorAssets(report,inputs);
console.log('Editor assets: '+results.length+'/'+editorAssetIds.length+' PASS');
