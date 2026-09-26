import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {loadApi} from '../browser/legacy/audit-lib.cjs';
import {editorAssetIds,verifyEditorAssets} from '../lib/release-101-contract.mjs';

const [browserPath, output] = process.argv.slice(2);
assert.ok(output && !fs.existsSync(output), 'fresh feature evidence required');
const artifacts = path.join(path.dirname(output), 'editor-assets-101');
fs.mkdirSync(artifacts, {recursive:true});
const inputs = snapshot('Akari.html'), results = [], pageErrors = [], networkRequests = [];
const old = loadApi(fs.readFileSync('audit/fixtures/1.0.0/source/Akari.html','utf8'));
const oldProject = old.makeDefaultProject();
oldProject.name = '1.0.0 互換性確認';
const oldFile = old.serializeProject(oldProject, old.makeDefaultAssetStore());
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
    const generated=path.join(artifacts,'drawing.html');pending=p.waitForEvent('download');await click(p,'#exportBtn');await (await pending).saveAs(generated);
    await p.goto(pathToFileURL(path.resolve(generated)).href);await p.locator('#playerStart').click();
    await p.locator('.component[data-id="'+copy.id+'"] img').waitFor();
    assert.equal(await p.locator('.component[data-id="'+copy.id+'"] img').evaluate(e=>e.complete&&e.naturalWidth>0),true);
    await p.screenshot({path:path.join(artifacts,'drawing-player.png'),fullPage:true});
  },
  async 'paint-runtime-lock'(p) {
    await select(p,'sprite-1');await click(p,'#runBtn');await p.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');
    assert.equal(await p.locator('#paintAdd').isDisabled(),true);assert.equal(await (await reveal(p.locator('.prop-duplicate'))).isDisabled(),true);
    await click(p,'#stopBtn');assert.equal(await p.locator('#paintAdd').isEnabled(),true);
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
  async 'release-versions-and-100-import'(p) {
    assert.deepEqual(await p.evaluate(()=>Akari.EXECUTABLE_VERSION),{appVersion:'1.0.2',runtimeVersion:'1.0.0',languageVersion:'1.0.0',programFormatVersion:3,projectFormatVersion:3});
    await p.locator('#fileInput').setInputFiles({name:'completed-100.akari.md',mimeType:'text/plain',buffer:Buffer.from(oldFile)});
    await p.waitForFunction(()=>Akari.app.project.name==='1.0.0 互換性確認'&&Akari.app.editorState.state==='DESIGN');
    assert.equal(await p.evaluate(()=>Akari.app.project.appVersion),'1.0.2');
    const text=await p.evaluate(()=>Akari.serializeProject(Akari.app.project,Akari.app.assetStore));assert.ok(text.startsWith('# あかり 1.0.2 の作品'));
    assert.equal(await p.evaluate(async text=>(await Akari.parseProjectFile(text)).project.appVersion,text),'1.0.2');
  },
  async 'release-malformed-state-protection'(p) {
    const before=await state(p);
    for(const text of [oldFile.replace('# あかり 1.0.0 の作品','# tampered'),oldFile.replaceAll('1.0.0','9.9.9'),oldFile.replace('"formatVersion": 3','"formatVersion": "3"')]) {
      const result=await p.evaluate(async text=>{try{await Akari.parseProjectFile(text);return 'accepted';}catch(e){return e.code;}},text);
      assert.notEqual(result,'accepted');assert.deepEqual(await state(p),before);
    }
  },
};
assert.deepEqual(Object.keys(cases).sort(),[...editorAssetIds].sort());
let version;
await withBrowser(browserPath,async browser=>{
  version=browser.version();
  for(const [id,run] of Object.entries(cases)) {
    try {
      await pageFor(browser,'Akari.html',async p=>{
        await p.setViewportSize({width:1440,height:1100});p.acceptDialogs=true;p.dialogLog=[];
        p.on('dialog',d=>{p.dialogLog.push(d.message());return p.acceptDialogs?d.accept():d.dismiss();});
        p.on('pageerror',e=>pageErrors.push(id+': '+e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))networkRequests.push(r.url());});
        try { await run(p); } catch(e) { await p.screenshot({path:path.join(artifacts,id+'-failure.png'),fullPage:true}).catch(()=>{}); throw e; }
      });
      results.push({id,pass:true,detail:'PASS'});console.log('PASS '+id);
    } catch(error) { results.push({id,pass:false,detail:error.stack});console.error('FAIL '+id+': '+error.message); }
  }
},300000);
assert.deepEqual(snapshot('Akari.html'),inputs);
const report={status:results.every(r=>r.pass)&&!pageErrors.length&&!networkRequests.length?'PASS':'FAIL',snapshot:inputs,environment:'chromium',browser:version,results,pageErrors,networkRequests};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
verifyEditorAssets(report,inputs);
console.log('1.0.1 editor assets: '+results.length+'/'+editorAssetIds.length+' PASS');
