import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {browserEnvironment} from './browser-environment.mjs';
export const toolbarViews=Object.freeze([['blocks','entry'],['blocks','basic'],['blocks','advanced'],['code','basic'],['code','advanced'],['code','meijin']]);
export const toolbarWidths=Object.freeze([1920,1366,1280,1024,768,760,390,320]);
export const toolbarStageIds=Object.freeze([
 ...toolbarWidths.flatMap(w=>toolbarViews.map(([mode,level])=>`toolbar/${w}/${mode}/${level}`)),
 'menu-and-history-actions','entry-tutorial',...toolbarViews.map(([mode,level])=>`new-save-open/${mode}/${level}`),'export-and-playback','entry-guidance-transitions','pending-menu/code-import','pending-menu/blocks-field',
 ...['blocks','code'].flatMap(mode=>['modal-history/'+mode,...[100,150,200].map(z=>`scroll/${mode}/${z}`),'touch-scroll/'+mode,'run-scroll/'+mode]),
]);
export const toolbarRejectionIds=Object.freeze(['missing-case','duplicate-case','failed-case','stale-snapshot','wrong-order','missing-menu-item','wrong-history-home','changed-saved-project','stopped-horizontal-scroll','untrusted-touch','runtime-input-unlocked','artifact-hash','page-error','visual-order','missing-overflow','hidden-action-guidance','retargeted-touch','pending-click-not-delivered','invalid-field-focus-lost']);
const bounds=(r,v)=>{assert.ok(r&&r.width>0&&r.height>0);assert.ok(r.left>=-1&&r.right<=v.width+1&&r.top>=-1&&r.bottom<=v.height+1,'visible control within viewport');};
export function verifyToolbarStage(r,inputs,artifactDir){
 assert.equal(r.schema,'akari-gate-cases-v1');assert.equal(r.step,'toolbar-stage');assert.equal(r.status,'PASS');assert.deepEqual(r.snapshot,inputs);
 assert.deepEqual(r.results.map(x=>x.id),toolbarStageIds);assert.ok(r.results.every(x=>x.status==='PASS'));assert.deepEqual(r.errors,[]);assert.equal(r.browser,browserEnvironment.version);assert.equal(r.playwright,browserEnvironment.playwright);assert.equal(r.canonicalUnchanged,true);
 const row=id=>{const value=r.results.find(x=>x.id===id);assert.ok(value,id);return value;};
 for(const width of toolbarWidths)for(const [mode,level]of toolbarViews){const o=row(`toolbar/${width}/${mode}/${level}`),expected=['projectMenu','saveBtn','runBtn',...(level==='entry'?['tutorialStart']:level==='meijin'?[]:['sampleBtn'])];
  assert.equal(o.viewport.width,width);assert.deepEqual(o.observed.items.slice(0,expected.length).map(x=>x.id),expected);assert.equal(o.observed.mode,mode);assert.equal(o.observed.level,level);assert.equal(o.observed.hintCount,0);assert.equal(o.observed.menuShown,true);assert.deepEqual(o.menu,['新しく作る','開く','うごく作品を ファイルにする']);
  for(const item of o.observed.items)bounds(item.rect,{width,height:o.observed.toolbar.bottom});for(let i=1;i<o.observed.items.length;i++){const a=o.observed.items[i-1].rect,b=o.observed.items[i].rect;const sameRow=a.top<b.bottom&&b.top<a.bottom;assert.ok(sameRow?a.right<=b.left+1:a.bottom<=b.top+1,'visual order follows DOM order');}
  if(mode==='blocks')assert.deepEqual(o.observed.history,{undo:'menutool',redo:'menutool'});
 }
 const actions=row('menu-and-history-actions');for(const key of ['undo','redo','openChooser','exportDialog'])assert.equal(actions[key],true);assert.match(actions.saveFile,/\.akari\.md$/);assert.ok(Math.abs(actions.runAt.x-actions.stopAt.x)<2&&Math.abs(actions.runAt.y-actions.stopAt.y)<2);
 assert.equal(row('entry-tutorial').started,true);assert.equal(row('entry-tutorial').exited,true);
 for(const [mode,level]of toolbarViews){const o=row(`new-save-open/${mode}/${level}`);assert.equal(o.roundtrip,true);assert.equal(o.before.name,o.name);assert.deepEqual(o.after,o.before);}
 const guidance=row('entry-guidance-transitions');assert.deepEqual(guidance.seen.map(o=>o.level),['entry','basic','entry']);for(const o of guidance.seen.filter(o=>o.level==='entry')){assert.equal(o.sample,false);assert.ok(!o.status.includes('お手本を開く'));}
 const player=row('export-and-playback');assert.equal(player.before.overscrollX,'auto');assert.deepEqual(player.running,{overscrollX:'none',touchAction:'none'});assert.equal(player.stopped.overscrollX,'auto');
 const pending=row('pending-menu/code-import');assert.deepEqual(pending.routes.map(x=>x.route),['pointer','keyboard']);for(const o of pending.routes){assert.deepEqual(o.observed.clicks,[true]);assert.match(o.observed.status,/^まだ ファイルに できないよ。本文を 入れる ところを/);assert.equal(o.observed.focusSummary,true);assert.equal(o.observed.menuOpen,false);assert.equal(o.observed.modal,false);assert.equal(o.before.pending.kind,'source-import');assert.deepEqual(o.after,o.before);}
 const field=row('pending-menu/blocks-field');assert.deepEqual(field.after,field.before);assert.equal(field.before.pending.value,'-');assert.deepEqual(field.observed.clicks,[true]);assert.match(field.observed.status,/^まだ ファイルに できないよ。数だけを/);assert.equal(field.observed.sameFieldFocus,true);assert.equal(field.observed.inputValue,'-');assert.equal(field.observed.menuOpen,false);assert.equal(field.observed.modal,false);
 for(const mode of ['blocks','code']){const modal=row('modal-history/'+mode);assert.equal(modal.open.parent,'win-title');assert.equal(modal.closed.parent,mode==='blocks'?'menutool':'debugbar');for(const state of [modal.open,modal.closed])assert.deepEqual(state.ids,['undoBtn','redoBtn']);assert.equal(modal.exportFocus,true);assert.equal(modal.fileFocus,true);
  for(const zoom of [100,150,200]){const o=row(`scroll/${mode}/${zoom}`);assert.deepEqual(o.inputs.map(x=>x.kind),['horizontal','vertical','shift','bar']);for(const input of o.inputs){assert.equal(input.projectPreserved,true);assert.ok(input.before.scrollWidth>input.before.width+1&&input.before.scrollHeight>input.before.height+1,'both axes must actually overflow');if(input.kind==='vertical')assert.ok(input.after.top>input.before.top);else assert.ok(input.after.left>input.before.left,'horizontal input produces actual movement');}}
  const touch=row('touch-scroll/'+mode);assert.equal(touch.point.hit,'formSurface');assert.equal(touch.ownerBefore,'stage');assert.equal(touch.ownerAfter,'stage');assert.ok(touch.after.left>touch.before.left);const touchStart=touch.events.find(e=>e.type==='touchstart');assert.equal(touchStart?.target,'formSurface');assert.equal(touchStart?.component,null);assert.equal(touch.projectPreserved,true);for(const type of ['touchstart','touchmove','touchend'])assert.ok(touch.events.some(e=>e.type===type&&e.trusted===true));assert.ok(touch.events.every(e=>e.trusted));
  const run=row('run-scroll/'+mode);assert.deepEqual(run.running,{overscrollX:'none',touch:'none'});assert.equal(run.stopped.overscrollX,'auto');assert.equal(run.projectPreserved,true);
 }
 const expected=[...toolbarWidths.flatMap(w=>toolbarViews.map(([m,l])=>`toolbar-${w}-${m}-${l}.png`)),...['blocks','code'].flatMap(m=>[100,150,200].map(z=>`scroll-${m}-${z}.png`))].sort();assert.deepEqual(r.artifacts.map(x=>x.file),expected);
 for(const a of r.artifacts){assert.equal(path.basename(a.file),a.file);assert.match(a.sha256,/^[a-f0-9]{64}$/);if(artifactDir)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(artifactDir,a.file))).digest('hex'),a.sha256);}
 return{status:'PASS',cases:toolbarStageIds.length};
}
export function rejectToolbarEvidence(r,inputs,artifactDir){
 const changes=[
  x=>x.results.pop(),x=>x.results[1]=structuredClone(x.results[0]),x=>x.results[0].status='FAIL',x=>x.snapshot.productSha256='0'.repeat(64),
  x=>x.results[0].observed.items.reverse(),x=>x.results[0].menu.pop(),x=>x.results[0].observed.history.undo='debugbar',
  x=>x.results.find(o=>o.id==='new-save-open/blocks/entry').after.name='changed',
  x=>{const o=x.results.find(o=>o.id==='scroll/blocks/150').inputs[0];o.after.left=o.before.left;},
  x=>x.results.find(o=>o.id==='touch-scroll/blocks').events.forEach(e=>e.trusted=false),
  x=>x.results.find(o=>o.id==='run-scroll/code').running.touch='auto',x=>x.artifacts[0].sha256='0'.repeat(64),x=>x.errors.push('injected error'),
  x=>{const a=x.results[0].observed.items;[a[0].rect,a[2].rect]=[a[2].rect,a[0].rect];},
  x=>{const o=x.results.find(o=>o.id==='scroll/blocks/150').inputs[0];o.before.scrollWidth=o.before.width;o.after.left=o.before.left;},
  x=>x.results.find(o=>o.id==='entry-guidance-transitions').seen[0].status='お手本を開く',
  x=>x.results.find(o=>o.id==='touch-scroll/blocks').events.find(e=>e.type==='touchstart').component='title',
  x=>x.results.find(o=>o.id==='pending-menu/code-import').routes[0].observed.clicks=[],
  x=>x.results.find(o=>o.id==='pending-menu/blocks-field').observed.sameFieldFocus=false,
 ];assert.equal(changes.length,toolbarRejectionIds.length);
 return changes.map((change,i)=>{const bad=structuredClone(r);change(bad);assert.throws(()=>verifyToolbarStage(bad,inputs,artifactDir),toolbarRejectionIds[i]);return{id:toolbarRejectionIds[i],status:'PASS'};});
}
