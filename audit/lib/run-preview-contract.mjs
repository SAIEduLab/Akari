import {openPaletteTools} from '../browser/cases/regression-setup.cjs';
import assert from 'node:assert/strict';

// Expectations describe the requested playback workspace, independently of CSS.
const inside=(r,v)=>assert.ok(r.width>0&&r.height>0&&r.left>=-1&&r.top>=-1&&r.right<=v.width+1&&r.bottom<=v.height+1,'visible playback control');
export async function observeRunPreview(page){
  return page.evaluate(()=>{
    const rect=selector=>{const n=document.querySelector(selector);if(!n)return{x:0,y:0,width:0,height:0,top:0,left:0,right:0,bottom:0,visible:false};const r=n.getBoundingClientRect(),style=getComputedStyle(n);return{...r.toJSON(),visible:!!n.getClientRects().length&&style.visibility!=='hidden'&&style.display!=='none'};};
    const control=id=>{const n=document.getElementById(id),r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{id,rect:rect('#'+id),enabled:!n.disabled,hit:hit===n||n.contains(hit)};};
    const shownButton=id=>{const n=document.getElementById(id);return !!n&&!!n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden';};
    return{mode:document.body.dataset.editorMode,level:document.body.dataset.uiLevel,chosen:document.querySelector('#uiLevel').value,state:Akari.app.editorState.state,runShown:shownButton('runBtn'),
      switchShown:shownButton('editorModecode')||shownButton('editorModeblocks'),inspectShown:shownButton('runtimeInspectBtn'),palette:rect('#blockEditor .blockui-palette'),workspace:rect('#blockEditor .blockui-workspace'),runtime:document.body.classList.contains('runtime'),viewport:{width:innerWidth,height:innerHeight},scene:rect('#designerWindow'),editorVisible:rect('#codeEditor').visible||rect('#blockEditor').visible,controls:['stopBtn','pauseBtn','continueBtn','stepBtn'].map(control),source:JSON.stringify(Akari.app.project.scripts),focusInScene:document.activeElement===document.querySelector('#formSurface')};
  });
}
export function verifyRunPreview(o,mode,level){
  assert.equal(o.mode,mode);assert.equal(o.level,level);assert.equal(o.state,'RUNNING');assert.equal(o.runtime,true);
  assert.equal(o.editorVisible,false,'playback must leave the small editing workspace');
  inside(o.scene,o.viewport);assert.ok(o.scene.width>=o.viewport.width*0.6,'playback uses the main width');
  assert.ok(o.scene.height>=Math.min(380,o.viewport.height*0.45),'playback uses the main height');
  assert.equal(o.focusInScene,true);assert.deepEqual(o.controls.map(c=>c.id),['stopBtn','pauseBtn','continueBtn','stepBtn']);assert.equal(o.runShown,false,'the run screen shows no ▶ 動かす');
  for(const c of o.controls){inside(c.rect,o.viewport);assert.equal(c.rect.visible,true);assert.equal(c.hit,true,'actual hit target '+c.id);}
  assert.deepEqual(o.controls.map(c=>c.enabled),[true,true,false,true]);
  assert.equal(o.paused,'PAUSED');assert.equal(o.afterStep,'PAUSED');assert.equal(o.resumed,'RUNNING');assert.equal(o.stopped.state,'DESIGN');assert.equal(o.stopped.runtime,false);assert.equal(o.stopped.editorVisible,true);
  assert.equal(o.stopped.source,o.source,'stop restores the unchanged authored project');
  const v=o.inspector;assert.equal(v.opened,true);assert.equal(v.readOnly,true);assert.equal(v.monitorVisible,true);assert.equal(v.visibleMode,mode);assert.equal(v.alternateMode,mode==='code'?'blocks':'code');assert.equal(v.restoredMode,mode);assert.equal(v.sourcePreserved,true);assert.equal(v.executionLocationVisible,true);assert.equal(v.closed,true);assert.equal(v.modeControlsReturned,true);assert.equal(v.modeControlsShownWhileRunning,false);
}
// The other two combinations of the run screen. ⏸ いったん止める and ▶ つづける are on the run screen at every level, はじめて
// too; 1つずつ 動かす and 本文を見て たしかめる are not at はじめて (final call 21; LANGUAGE.md 作る画面と動かす画面). A 名人
// work has the くわしく screen with those controls. The run screen shows no view toggle; 「本文と動きのようす」 has it, and in a
// 名人 work a press keeps the code and says why under it, 「名人は、コードモードで だけ 使えるよ」 (final calls 22, 23).
// At はじめて the run screen shows ■, ⏸ and ▶ つづける; 1つずつ 動かす is not there.
function verifyEntryRunControls(o){
  const [,pause,resume,step]=o.controls;
  for(const c of [pause,resume]){inside(c.rect,o.viewport);assert.equal(c.rect.visible,true,c.id+' is on the はじめて run screen');assert.equal(c.hit,true,'actual hit target '+c.id);}
  assert.deepEqual([pause.enabled,resume.enabled],[true,false],'running: ⏸ can be pressed, ▶ つづける cannot');
  assert.equal(step.rect.visible,false,'1つずつ 動かす is not on the はじめて run screen');
}
export function verifyRunScreen(o,mode,level){
  const shown=level==='meijin'?'advanced':level;
  assert.equal(o.mode,mode);assert.equal(o.level,shown);assert.equal(o.chosen,level);assert.equal(o.state,'RUNNING');assert.equal(o.runtime,true);
  // はじめて puts the block list away and the stage in the larger column, and the assembled blocks stay small beside it (D-19, F-14).
  if(level==='entry'){assert.equal(o.palette.visible,false,'the block list is put away');assert.equal(o.workspace.visible,true,'the assembled blocks stay in view');assert.ok(o.scene.width>o.workspace.width,'the stage takes the larger column');}
  else{assert.equal(o.editorVisible,false,'playback must leave the small editing workspace');assert.ok(o.scene.width>=o.viewport.width*0.6,'playback uses the main width');}
  inside(o.scene,o.viewport);
  assert.ok(o.scene.height>=Math.min(380,o.viewport.height*0.45),'playback uses the main height');
  assert.equal(o.focusInScene,true);assert.deepEqual(o.controls.map(c=>c.id),['stopBtn','pauseBtn','continueBtn','stepBtn']);
  assert.equal(o.runShown,false,'the run screen shows no ▶ 動かす');assert.equal(o.switchShown,false,'the run screen shows no コード／ブロック switch');
  const stop=o.controls[0];inside(stop.rect,o.viewport);assert.equal(stop.rect.visible,true);assert.equal(stop.hit,true,'actual hit target stopBtn');assert.equal(stop.enabled,true);
  if(level==='entry'){
    verifyEntryRunControls(o);
    assert.equal(o.inspectShown,false,'本文を見て たしかめる is not on the はじめて run screen');assert.equal(o.inspector,null);
  } else {
    for(const c of o.controls){inside(c.rect,o.viewport);assert.equal(c.rect.visible,true);assert.equal(c.hit,true,'actual hit target '+c.id);}
    assert.deepEqual(o.controls.map(c=>c.enabled),[true,true,false,true]);assert.equal(o.inspectShown,true);
    assert.equal(o.paused,'PAUSED');assert.equal(o.afterStep,'PAUSED');assert.equal(o.resumed,'RUNNING');
    const v=o.inspector;assert.equal(v.opened,true);assert.equal(v.readOnly,true);assert.equal(v.monitorVisible,true);assert.equal(v.executionLocationVisible,true);
    assert.equal(v.codeVisible,true);assert.equal(v.blocksVisible,false);
    // The one toggle there names the code, 「コードモード ⇄」, and is refused for the 名人 work; its note shows only after a press.
    assert.deepEqual(v.toggles,[{id:'editorModeblocks',label:'コードモード ⇄',name:'コードモード',refused:'meijin',inInspector:true}],'本文と動きのようす has the view toggle');
    assert.equal(v.noteBefore,null,'no note before the press');
    assert.equal(v.afterBlocksPress,'code','blocks cannot be chosen while a 名人 work runs');assert.equal(v.afterPress.codeVisible,true);assert.equal(v.afterPress.blocksVisible,false);
    assert.deepEqual(v.afterPress.toggles,v.toggles,'the toggle stays as it was');
    assert.deepEqual(v.afterPress.note,{text:'名人は、コードモードで だけ 使えるよ',role:'status',inInspector:true},'the note under the toggle says why');
    assert.equal(v.sourcePreserved,true);assert.equal(v.closed,true);
  }
  assert.equal(o.stopped.state,'DESIGN');assert.equal(o.stopped.runtime,false);assert.equal(o.stopped.editorVisible,true);
  assert.equal(o.stopped.source,o.source,'stop restores the unchanged authored project');
}
export function verifyRunPreviewReport(report){
  const observed=report.results.find(r=>r.id==='DISPLAY-SETTINGS')?.observed,rows=observed?.rows,screens=observed?.runScreens;
  assert.deepEqual(rows?.map(r=>r.mode+'/'+r.level),['code/basic','code/advanced','blocks/basic','blocks/advanced']);
  for(const r of rows){verifyRunPreview(r.preview,r.mode,r.level);if(r.mode==='blocks')verifyPaletteFold(r.paletteFold);else assert.equal(r.paletteFold,null);}
  assert.deepEqual(screens?.map(r=>r.mode+'/'+r.level),['blocks/entry','code/meijin']);
  for(const r of screens){verifyRunScreen(r.preview,r.mode,r.level);assert.equal(r.sourcePreserved,true);}
  assert.deepEqual(screens[0].picker,['entry','basic','advanced'],'blocks offer はじめて／かんたん／くわしく');assert.deepEqual(screens[1].picker,['meijin'],'a 名人 work keeps 名人');
  // D1-01: many parts at はじめて (the maze) keep the stage big while it runs (D-19, F-14).
  const many=observed.entryManyParts;assert.deepEqual(many?.map(r=>r.height),[768,650]);
  for(const r of many){const o=r.preview;assert.ok(r.parts>=40,'a work with many parts');assert.equal(o.level,'entry');assert.equal(o.state,'RUNNING');
    assert.equal(o.palette.visible,false,'the block list is put away');assert.ok(o.scene.width>o.workspace.width,'the stage takes the larger column');inside(o.scene,o.viewport);
    // D-19 and F-14: the stage gets bigger while the work runs, so the run screen's stage is at least the edit screen's.
    const size=b=>Math.round(b.width)+'x'+Math.round(b.height);assert.ok(r.editStage&&r.editStage.width>0,'the edit screen stage is measured');
    assert.ok(r.stage.width>=r.editStage.width-1&&r.stage.height>=r.editStage.height-1,'the screen gets bigger while the work runs, also with many parts: '+size(r.editStage)+' before ▶, '+size(r.stage)+' running, at 1366x'+o.viewport.height);
    assert.ok(r.stage.width>=o.scene.width*0.5,'the screen fills its column');
    const stop=o.controls[0];inside(stop.rect,o.viewport);assert.equal(stop.hit,true);verifyEntryRunControls(o);}
}
// 「本文を見て たしかめる」 of a 名人 work: the body in code, and the view toggle there. A press on 「コードモード ⇄」, as a
// child makes it, keeps the code and shows the note under the toggle (final call 22; LANGUAGE.md 作る画面と動かす画面).
export async function observeMeijinInspector(page){
  const source=await page.evaluate(()=>JSON.stringify(Akari.app.project.scripts));await page.locator('#runtimeInspectBtn').click();await page.locator('#runtimeInspector[open]').waitFor();
  const collect=()=>page.evaluate(()=>(shown=>({mode:document.body.dataset.editorMode,codeVisible:!!document.querySelector('#codeEditor').getClientRects().length,blocksVisible:!!document.querySelector('#blockEditor').getClientRects().length,readOnly:document.querySelector('#codeEditor').readOnly,
    monitorVisible:!!document.querySelector('#runtimeInspector .runtime-monitor').getClientRects().length,executionLocationVisible:!!document.querySelector('#runtimeInspector #execLocation').getClientRects().length,
    toggles:['editorModecode','editorModeblocks'].map(id=>document.getElementById(id)).filter(shown).map(b=>({id:b.id,label:b.textContent,name:b.getAttribute('aria-label'),refused:b.dataset.refused||null,inInspector:!!b.closest('#runtimeInspector')})),
    note:shown(document.getElementById('modeBlockedNote'))?(n=>({text:n.textContent,role:n.getAttribute('role'),inInspector:!!n.closest('#runtimeInspector')}))(document.getElementById('modeBlockedNote')):null}))(n=>!!n&&!n.hidden&&!!n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden'));
  const first=await collect();await page.locator('#runtimeInspector #editorModeblocks').click({timeout:3000});await page.waitForTimeout(200);const after=await collect();
  return{opened:await page.locator('#runtimeInspector').evaluate(n=>n.open),readOnly:first.readOnly,monitorVisible:first.monitorVisible,executionLocationVisible:first.executionLocationVisible,codeVisible:first.codeVisible,blocksVisible:first.blocksVisible,
    toggles:first.toggles,noteBefore:first.note,afterBlocksPress:after.mode,afterPress:{codeVisible:after.codeVisible,blocksVisible:after.blocksVisible,toggles:after.toggles,note:after.note},sourcePreserved:source===await page.evaluate(()=>JSON.stringify(Akari.app.project.scripts))};
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
  await openPaletteTools(page.locator('#blockEditor'));
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
