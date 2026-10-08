import assert from 'node:assert/strict';

// Expectations describe the requested playback workspace, independently of CSS.
const inside=(r,v)=>assert.ok(r.width>0&&r.height>0&&r.left>=-1&&r.top>=-1&&r.right<=v.width+1&&r.bottom<=v.height+1,'visible playback control');
export async function observeRunPreview(page){
  return page.evaluate(()=>{
    const rect=selector=>{const n=document.querySelector(selector),r=n.getBoundingClientRect(),style=getComputedStyle(n);return{...r.toJSON(),visible:!!n.getClientRects().length&&style.visibility!=='hidden'&&style.display!=='none'};};
    const control=id=>{const n=document.getElementById(id),r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{id,rect:rect('#'+id),enabled:!n.disabled,hit:hit===n||n.contains(hit)};};
    return{mode:document.body.dataset.editorMode,level:document.body.dataset.uiLevel,state:Akari.app.editorState.state,runtime:document.body.classList.contains('runtime'),viewport:{width:innerWidth,height:innerHeight},scene:rect('#designerWindow'),editorVisible:rect('#codeEditor').visible||rect('#blockEditor').visible,controls:['stopBtn','pauseBtn','continueBtn','stepBtn'].map(control),source:JSON.stringify(Akari.app.project.scripts),focusInScene:document.activeElement===document.querySelector('#formSurface')};
  });
}
export function verifyRunPreview(o,mode,level){
  assert.equal(o.mode,mode);assert.equal(o.level,level);assert.equal(o.state,'RUNNING');assert.equal(o.runtime,true);
  assert.equal(o.editorVisible,false,'playback must leave the small editing workspace');
  inside(o.scene,o.viewport);assert.ok(o.scene.width>=o.viewport.width*0.6,'playback uses the main width');
  assert.ok(o.scene.height>=Math.min(380,o.viewport.height*0.45),'playback uses the main height');
  assert.equal(o.focusInScene,true);assert.deepEqual(o.controls.map(c=>c.id),['stopBtn','pauseBtn','continueBtn','stepBtn']);
  for(const c of o.controls){inside(c.rect,o.viewport);assert.equal(c.rect.visible,true);assert.equal(c.hit,true,'actual hit target '+c.id);}
  assert.deepEqual(o.controls.map(c=>c.enabled),[true,true,false,true]);
  assert.equal(o.paused,'PAUSED');assert.equal(o.afterStep,'PAUSED');assert.equal(o.resumed,'RUNNING');assert.equal(o.stopped.state,'DESIGN');assert.equal(o.stopped.runtime,false);assert.equal(o.stopped.editorVisible,true);
  assert.equal(o.stopped.source,o.source,'stop restores the unchanged authored project');
  const v=o.inspector;assert.equal(v.opened,true);assert.equal(v.readOnly,true);assert.equal(v.monitorVisible,true);assert.equal(v.visibleMode,mode);assert.equal(v.alternateMode,mode==='code'?'blocks':'code');assert.equal(v.restoredMode,mode);assert.equal(v.sourcePreserved,true);assert.equal(v.executionLocationVisible,true);assert.equal(v.closed,true);assert.equal(v.modeControlsReturned,true);
}
export function verifyRunPreviewReport(report){
  const rows=report.results.find(r=>r.id==='DISPLAY-SETTINGS')?.observed?.rows;
  assert.deepEqual(rows?.map(r=>r.mode+'/'+r.level),['code/basic','code/advanced','blocks/basic','blocks/advanced']);
  for(const r of rows){verifyRunPreview(r.preview,r.mode,r.level);if(r.mode==='blocks')verifyPaletteFold(r.paletteFold);else assert.equal(r.paletteFold,null);}
}
export async function observeInspector(page,mode){
  const source=await page.evaluate(()=>JSON.stringify(Akari.app.project.scripts));await page.locator('#runtimeInspectBtn').click();await page.locator('#runtimeInspector[open]').waitFor();
  const collect=()=>page.evaluate(()=>({mode:document.body.dataset.editorMode,codeVisible:!!document.querySelector('#codeEditor').getClientRects().length,blocksVisible:!!document.querySelector('#blockEditor').getClientRects().length,readOnly:document.querySelector('#codeEditor').readOnly,monitorVisible:!!document.querySelector('#runtimeInspector .runtime-monitor').getClientRects().length,executionLocationVisible:!!document.querySelector('#runtimeInspector #execLocation').getClientRects().length}));
  const first=await collect();assert.equal(first.codeVisible,mode==='code');assert.equal(first.blocksVisible,mode==='blocks');
  await page.locator('#editorMode'+(mode==='code'?'blocks':'code')).click();const alternate=await collect();assert.equal(alternate.codeVisible,mode!=='code');assert.equal(alternate.blocksVisible,mode!=='blocks');
  await page.locator('#editorMode'+mode).click();const restored=await collect();return{opened:await page.locator('#runtimeInspector').evaluate(n=>n.open),readOnly:first.readOnly,monitorVisible:first.monitorVisible,visibleMode:first.mode,alternateMode:alternate.mode,restoredMode:restored.mode,sourcePreserved:source===await page.evaluate(()=>JSON.stringify(Akari.app.project.scripts)),executionLocationVisible:first.executionLocationVisible};
}
export async function observePaletteFold(page,captureFold){
  const toggle=page.locator('#blockEditor [data-blockui-action="palette-tools-toggle"]'),search=page.locator('#blockEditor [data-blockui-search]');
  const originalSearch=await search.inputValue();await search.fill('話す');
  const state=()=>page.evaluate(()=>{const a=Akari.app,s=a.editorState;return{project:JSON.stringify(a.project),history:s.history,redo:s.redo,dirty:s.dirty,search:document.querySelector('#blockEditor [data-blockui-search]').value,category:document.querySelector('#blockEditor .blockui-categories [aria-pressed="true"]')?.textContent};});
  const geometry=()=>page.evaluate(()=>{const root=document.querySelector('#blockEditor'),toggle=root.querySelector('[data-blockui-action="palette-tools-toggle"]'),r=toggle.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{expanded:toggle.getAttribute('aria-expanded'),controlsHidden:root.querySelector('.blockui-palette-controls').hidden,listHeight:root.querySelector('.blockui-palette-list').getBoundingClientRect().height,toggleHit:hit===toggle||toggle.contains(hit)};});
  await toggle.scrollIntoViewIfNeeded();const before=await state(),opened=await geometry();await toggle.click();const folded=await geometry(),during=await state();if(captureFold)await captureFold();
  await page.keyboard.press('Enter');const reopened=await geometry(),after=await state();
  await page.locator('#blockEditor [data-blockui-action="create-data"]').first().click();await page.locator('#dataModal.show').waitFor();const dataOpened=true;await page.locator('#dataClose').click();const dataClosed=!await page.locator('#dataModal').isVisible();
  await search.fill(originalSearch);return{before,during,after,opened,folded,reopened,dataOpened,dataClosed};
}
export function verifyPaletteFold(o){
  assert.deepEqual(o.during,o.before,'fold preserves search, category, project and editing history');assert.deepEqual(o.after,o.before);
  assert.equal(o.opened.expanded,'true');assert.equal(o.opened.controlsHidden,false);assert.equal(o.folded.expanded,'false');assert.equal(o.folded.controlsHidden,true);assert.equal(o.reopened.expanded,'true');assert.equal(o.reopened.controlsHidden,false);
  assert.ok(o.folded.listHeight>=o.opened.listHeight+20,'fold gives actual space to command blocks');
  for(const g of [o.opened,o.folded,o.reopened])assert.equal(g.toggleHit,true,'fold toggle is a real hit target');
  assert.equal(o.dataOpened,true);assert.equal(o.dataClosed,true);
}
