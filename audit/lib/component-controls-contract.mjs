import assert from 'node:assert/strict';
import {browserEnvironment} from './browser-environment.mjs';

export const componentControlSizes = Object.freeze([
  [1920,1080], [1366,768], [1280,720], [1024,768], [760,600], [390,600], [320,500],
]);
export const componentControlTargets = Object.freeze([
  '.prop-duplicate', '.prop-delete', '.child-copy-help',
  '#componentPickerCore > summary', '#soundQuickAdd', '#assetBtn', '#dataBtn',
]);
export const componentControlIds = Object.freeze([
  'COMPONENT-CONTROLS-RESPONSIVE', 'COMPONENT-CONTROLS-KEYBOARD',
  'COMPONENT-CONTROLS-LIST', 'COMPONENT-CONTROLS-TOUCH', 'COMPONENT-CONTROLS-ZOOM',
]);
export const componentControlsFeature = Object.freeze({
  id:'ui:component-controls-scroll', editorMode:'blocks', regionLabel:'部品と作品の道具',
  separateComponentListScroll:true, targets:componentControlTargets,
  preservedState:['project','source','history','redo','dirty'],
  levels:['basic','advanced'], pickerStates:['closed','open'], viewports:componentControlSizes,
  browserZoom:[1.25,1.5,2], testIds:componentControlIds,
});

function contains(outer,inner,message) {
  for (const rect of [outer,inner]) {
    for (const key of ['x','y','width','height']) assert.ok(Number.isFinite(rect?.[key]),message+' '+key);
    assert.ok(rect.width>0&&rect.height>0,message+' has visible area');
  }
  assert.ok(inner.x>=outer.x-1&&inner.y>=outer.y-1&&
    inner.x+inner.width<=outer.x+outer.width+1&&inner.y+inner.height<=outer.y+outer.height+1,message);
}
export function verifyComponentControlReach(observation) {
  contains(observation.clip,observation.rect,'entire control fits all clipping ancestors and viewport');
  assert.equal(observation.hit,true,'ordinary pointer reaches the observed control');
  assert.ok(observation.scrollWidth<=observation.clientWidth+1,'label has no horizontal clipping');
  assert.ok(observation.ink.length>0,'actual text and ruby glyph rectangles required');
  for (const rect of observation.ink) contains(observation.rect,rect,'text and ruby stay inside their control');
  for (const ruby of observation.ruby) assert.equal(ruby.whiteSpace,'nowrap','ruby word remains together');
}
function preserved(observation) {
  assert.ok(observation.before?.source.includes('元の動き'),'source-bearing fixture required');
  assert.ok(observation.before.redo>0,'real redo history must survive scrolling');
  assert.deepEqual(observation.after,observation.before,'layout and scroll preserve project, source, history, redo and dirty state');
}
function exercise(observation) {
  preserved(observation);
  assert.deepEqual(observation.targets.map(r=>r.selector),componentControlTargets);
  observation.targets.forEach(verifyComponentControlReach);
  assert.ok(observation.region.height>=100,'usable action area remains');
  assert.ok(observation.treeHeight>=58,'component list retains a usable row');
  assert.equal(observation.help,'見た目と設定をコピーします。コードはコピーしません。');
  assert.ok(observation.clicks.soundFileChooser&&observation.clicks.assetDialog&&observation.clicks.dataDialog,
    'sound file chooser and both visible dialogs must actually open');
  assert.ok(observation.wheelEvents.every(e=>e.trusted&&e.deltaY!==0),'native wheel evidence required');
}
export function verifyComponentControls(report,inputs) {
  assert.equal(report.schema,'akari-component-controls-v1');
  assert.equal(report.status,'PASS');
  assert.deepEqual(report.snapshot,inputs,'current product and audit inputs');
  assert.equal(report.browser,browserEnvironment.version);
  assert.equal(report.playwright,browserEnvironment.playwright);
  assert.ok(['win32','linux'].includes(report.platform));
  assert.deepEqual(report.pageErrors,[]); assert.deepEqual(report.networkRequests,[]);
  assert.deepEqual(report.results.map(r=>r.id),componentControlIds,'complete, ordered and unique stable IDs');
  for (const row of report.results) assert.equal(row.status,'PASS',row.id);
  const rows=Object.fromEntries(report.results.map(r=>[r.id,r.observed]));
  const responsive=rows['COMPONENT-CONTROLS-RESPONSIVE'];
  assert.deepEqual(responsive.map(r=>[r.width,r.height,r.level,r.open]),
    componentControlSizes.flatMap(([w,h])=>['basic','advanced'].flatMap(level=>[false,true].map(open=>[w,h,level,open]))));
  responsive.forEach(exercise);
  assert.ok(responsive.some(r=>r.wheelEvents.length>0),'small-window native wheel scrolling required');
  const keyboard=rows['COMPONENT-CONTROLS-KEYBOARD'];
  assert.deepEqual(keyboard.map(r=>r.level),['basic','advanced']);
  for (const row of keyboard) {
    preserved(row); assert.ok(row.endScroll>row.startScroll,'End scrolls the focused action region');
    assert.equal(row.homeScroll,0,'Home returns to its top');
    for (const selector of ['#soundQuickAdd','#assetBtn','#dataBtn']) {
      const reached=row.forward.find(r=>r.selector===selector),reverse=row.reverse.find(r=>r.selector===selector);
      assert.ok(reached&&reverse,'Tab and Shift+Tab reach '+selector);
      verifyComponentControlReach(reached); verifyComponentControlReach(reverse);
    }
  }
  const list=rows['COMPONENT-CONTROLS-LIST'];
  preserved(list); assert.ok(list.treeScroll>0&&list.lastHit,'last of 25 components reached with native wheel');
  assert.equal(list.controlsScrollBefore,list.controlsScrollAfter,'list wheel does not scroll the action area');
  assert.equal(list.treeScrollBeforeControls,list.treeScrollAfterControls,'action wheel does not scroll the list');
  assert.ok(list.controlsScrollAfterWheel>list.controlsScrollAfter,'separate action scroll actually moves');
  const touch=rows['COMPONENT-CONTROLS-TOUCH'];
  preserved(touch); assert.ok(touch.swipes>0&&touch.scrollAfter>touch.scrollBefore,'native touch swipe scrolls action area');
  assert.ok(touch.trustedTouches>0,'Chromium-generated touch events required');
  verifyComponentControlReach(touch.target); assert.equal(touch.dialogOpened,true);
  const zoom=rows['COMPONENT-CONTROLS-ZOOM'];
  assert.deepEqual(zoom.map(r=>r.requested),[1.25,1.5,2]);
  for (const row of zoom) {
    assert.equal(row.actual,row.requested,'Chrome tabs API actual zoom');
    assert.equal(row.windowAfter.outerWidth,row.windowBefore.outerWidth);
    assert.equal(row.windowAfter.outerHeight,row.windowBefore.outerHeight);
    assert.ok(Math.abs(row.windowAfter.dpr/row.windowBefore.dpr-row.requested)<.02,'native DPR changes with zoom');
    assert.ok(row.windowAfter.innerWidth<row.windowBefore.innerWidth,'native CSS viewport becomes smaller');
    assert.equal(row.windowAfter.cssZoom,'1','no CSS zoom substitute');
    exercise(row.exercise);
  }
  assert.ok(report.artifacts.length>=10,'screenshots of narrow layouts and actual zoom required');
  for(const artifact of report.artifacts){
    assert.ok(artifact.viewport.width>0&&artifact.viewport.height>0&&artifact.viewport.dpr>0);
    for(const dimension of ['width','height'])assert.ok(
      Math.abs(artifact.pixels[dimension]-artifact.viewport[dimension]*artifact.viewport.dpr)<=2,
      'screenshot contains the native viewport at its actual pixel scale');
  }
  return {status:'PASS',total:componentControlIds.length,responsive:responsive.length,zoom:zoom.length,platform:report.platform};
}
