import assert from 'node:assert/strict';
import {verifySemanticExtension} from './semantic-extension-contract.mjs';
import {browserEnvironment} from './browser-environment.mjs';

// Authored acceptance values: never inferred from the candidate's output.
export const triggerSources={
 plain:'「やあ  🌟」と言う。\n※ 本文の空白  を残す',
 headed:'始めると、あかりはすぐに『赤』と言います。',
 headedClick:'あかりがクリックされたとき、すぐに『赤』と言います。',
 linked:'始めると、あかりは「赤」と言います。だんごも同じ合図で動き始め、「青」と言います。',
 linkedFirst:'あかりがクリックされたとき、「赤」と言います。作品を動かしたとき、だんごは、「青」と言います。',
 linkedSecond:'始めると、あかりは「赤」と言います。だんごがクリックされたとき、「青」と言います。',
 twoActors:'「赤」と言う。だんごは「青」と言う。',
};
export const triggerIds=['trigger/open-cancel','trigger/start-click-start','trigger/body-selection','trigger/empty-body-selection','trigger/other-owner','trigger/sibling-bodies','trigger/heading-body','trigger/linked-first','trigger/linked-second','trigger/multiple-actors','trigger/details-key','trigger/details-message',...[[1180,757],[1188,848]].flatMap(([w,h])=>['code','blocks'].map(mode=>`trigger/layout/${w}x${h}/${mode}`))];
const compact=p=>p.scripts.map(({id,targetId,event,filter,source})=>({id,targetId,event,...(filter===undefined?{}:{filter}),source}));
const unchanged=(a,b,label)=>assert.deepEqual(b,a,label);
export function verifyTriggerObserved(id,o){
 assert.equal(o.fixtureSetup,'API serialization followed by file import');assert.equal(o.interaction,'real pointer and keyboard');
 assert.ok(o.actions.length>=2);assert.ok(o.actions.every(a=>['click','keyboard','fill'].includes(a.kind)));
 if(id==='trigger/open-cancel'){
  for(const step of [o.opened,o.staged,o.cancelled]){unchanged(o.before.project,step.project);assert.equal(step.history,o.before.history);assert.equal(step.redo,o.before.redo);}
  assert.equal(o.cancelled.pending,null);assert.equal(o.opened.detailsOpen,false);assert.match(o.opened.scope,/あかり/);assert.match(o.opened.scope,/他の動きは変えません/);
 }else if(id==='trigger/start-click-start'){
  assert.equal(o.before.project.scripts[0].source,triggerSources.plain);
  for(const [state,event,delta]of [[o.clicked,'click',1],[o.restored,'start',2]]){const expected=structuredClone(o.before.project);expected.scripts[0].event=event;unchanged(expected,state.project);assert.equal(state.history,o.before.history+delta);assert.equal(state.selector,event);assert.match(state.hat,new RegExp(event==='click'?'クリックしたとき':'開始したとき'));assert.equal(state.detailsOpen,false);}
  unchanged(o.before.project,o.undo.project);unchanged(o.restored.project,o.redo.project);
  assert.deepEqual(o.runtime,{clickBefore:[],clickAfter:[['sprite-1','やあ  🌟']],start:[['sprite-1','やあ  🌟']]});
 }else if(id==='trigger/body-selection'){
  unchanged(o.before.project,o.after.project);assert.equal(o.after.owner,'script:second');assert.equal(o.after.history,o.before.history);assert.equal(o.after.source,'「別の本文」と言う。');
 }else if(id==='trigger/empty-body-selection'){
  unchanged(o.before.project,o.selected.project);assert.equal(o.selected.source,'');assert.equal(o.selected.selector,'click');assert.equal(o.selected.history,o.before.history);
  assert.equal(o.after.project.scripts.length,2);unchanged(o.before.project.scripts[0],o.after.project.scripts[0]);const created=o.after.project.scripts[1];assert.notEqual(created.id,'main');assert.equal(created.targetId,'sprite-1');assert.equal(created.event,'click');assert.equal(created.source,'「クリックの本文」と言う。');assert.deepEqual(o.runtime,{before:[['sprite-1','やあ  🌟']],after:[['sprite-1','クリックの本文']]});
 }else if(['trigger/other-owner','trigger/sibling-bodies'].includes(id)){
  const expected=structuredClone(o.before.project);expected.scripts.find(s=>s.id===o.changedId).event='click';unchanged(expected,o.after.project);assert.equal(o.after.history,o.before.history+1);unchanged(o.before.project,o.undo.project);unchanged(o.after.project,o.redo.project);
  assert.equal(o.after.owner,'script:'+o.changedId);assert.match(o.scope,new RegExp(id.endsWith('other-owner')?'だんご':'別の本文'));assert.deepEqual(o.runtime.before,[['sprite-1','やあ  🌟']]);assert.deepEqual(o.runtime.after,id.endsWith('other-owner')?[['dango','青'],['sprite-1','やあ  🌟']]:[['sprite-1','別の本文']]);
 }else if(['trigger/heading-body','trigger/linked-first','trigger/linked-second'].includes(id)){
  const key=id.endsWith('heading-body')?'headed':id.endsWith('linked-first')?'linkedFirst':'linkedSecond';
  assert.equal(o.before.source,key==='headed'?triggerSources.headed:triggerSources.linked);
  assert.equal(o.after.source,key==='headed'?triggerSources.headedClick:triggerSources[key]);
  assert.equal(o.after.project.scripts[0].targetId,'sprite-1');assert.equal(o.after.project.scripts[0].event,key==='linkedSecond'?'start':'click');
  assert.equal(o.after.history,o.before.history+1);unchanged(o.before.project,o.undo.project);unchanged(o.after.project,o.redo.project);
  assert.deepEqual(o.runtime.before,key==='headed'?[]:key==='linkedFirst'?[['dango','青']]:[['sprite-1','赤']]);assert.deepEqual(o.runtime.after,key==='headed'?[['sprite-1','赤']]:[['dango','青'],['sprite-1','赤']]);
  if(key!=='headed')assert.deepEqual(o.after.headings,key==='linkedFirst'?['あかり・クリックしたとき','だんご・開始したとき']:['あかり・開始したとき','だんご・クリックしたとき']);
 }else if(id==='trigger/multiple-actors'){
  assert.match(o.scope,/あかり・だんご/);assert.equal(o.after.source,triggerSources.twoActors);assert.equal(o.after.project.scripts[0].event,'click');assert.deepEqual(o.runtime.before,[]);assert.deepEqual(o.runtime.after,[['dango','青'],['sprite-1','赤']]);
 }else if(id.startsWith('trigger/details-')){
  const event=id.endsWith('key')?'keyDown':'message',filter=event==='keyDown'?{key:'右'}:{message:'出発'};
  assert.equal(o.after.project.scripts[0].event,event);assert.deepEqual(o.after.project.scripts[0].filter,filter);assert.equal(o.after.project.scripts[0].targetId,'sprite-1');assert.equal(o.after.history,o.before.history+1);
  assert.equal(o.after.astBody[0].value.value,'やあ  🌟');assert.deepEqual(o.runtime.before,[]);assert.deepEqual(o.runtime.after,[['sprite-1','やあ  🌟']]);unchanged(o.before.project,o.undo.project);unchanged(o.after.project,o.redo.project);assert.equal(o.detailsOpened,true);
 }else if(id.startsWith('trigger/layout/')){
  const [,,size,mode]=id.split('/'),[width,height]=size.split('x').map(Number);assert.deepEqual(o.viewport,{width,height});assert.equal(o.entryMode,mode);assert.equal(o.stageLabel,'28%');assert.ok(Math.abs(o.stageScale-.28)<.006);assert.equal(o.workspaceZoom,'100%');assert.equal(o.detailsOpen,false);
  for(const name of ['event','commit','cancel','scope']){const r=o.geometry[name],w=o.geometry.workspace;assert.ok(r.width>0&&r.height>0);assert.ok(r.left>=w.left-1&&r.right<=w.right+1&&r.top>=w.top-1&&r.bottom<=w.bottom+1,name+' within workspace');}
  assert.deepEqual(o.hits,{event:true,commit:true,cancel:true});assert.equal(o.after.source,triggerSources.plain);assert.equal(o.after.project.scripts[0].event,'click');assert.equal(o.after.history,o.before.history+1);
 }else assert.fail('Unknown trigger case '+id);
}
export function verifyTriggerReport(r){const count=verifySemanticExtension(r,'akari-ux-repair03-trigger-v1',triggerIds);assert.ok(!r.hostFailure);assert.deepEqual(r.pageErrors,[]);assert.deepEqual(r.networkRequests,[]);assert.deepEqual(r.environment,{browser:browserEnvironment.version,playwright:browserEnvironment.playwright});for(const row of r.results)verifyTriggerObserved(row.id,row.observed);return count;}
const at=(r,id)=>r.results.find(x=>x.id===id).observed;
export const triggerWrongMeaning=[
 ['open-mutates',r=>at(r,'trigger/open-cancel').opened.project.scripts[0].event='click'],
 ['cancel-mutates-history',r=>at(r,'trigger/open-cancel').cancelled.history++],
 ['literal-body-lost',r=>at(r,'trigger/start-click-start').clicked.project.scripts[0].source='「別」と言う。'],
 ['event-not-run',r=>at(r,'trigger/start-click-start').runtime.clickAfter=[]],
 ['selection-edits-event',r=>at(r,'trigger/body-selection').after.project.scripts[0].event='click'],
 ['empty-selection-rewrites-start',r=>at(r,'trigger/empty-body-selection').selected.project.scripts[0].event='click'],
 ['empty-body-replaces-start',r=>at(r,'trigger/empty-body-selection').after.project.scripts[0].source='「クリックの本文」と言う。'],
 ['other-owner-changed',r=>at(r,'trigger/other-owner').after.project.scripts[0].event='click'],
 ['sibling-body-changed',r=>at(r,'trigger/sibling-bodies').after.project.scripts[0].source='「混入」と言う。'],
 ['header-reformats-body',r=>at(r,'trigger/heading-body').after.source=triggerSources.headedClick.replace('すぐに','')],
 ['linked-trigger-cascades',r=>at(r,'trigger/linked-first').runtime.before=[]],
 ['linked-other-prefix-body-lost',r=>at(r,'trigger/linked-second').after.source=triggerSources.linkedFirst],
 ['multiple-target-hidden',r=>at(r,'trigger/multiple-actors').scope='あかり'],
 ['key-filter-lost',r=>at(r,'trigger/details-key').after.project.scripts[0].filter={key:'左'}],
 ['message-filter-lost',r=>at(r,'trigger/details-message').after.project.scripts[0].filter={message:'別'}],
 ['layout-clipped',r=>at(r,'trigger/layout/1180x757/blocks').geometry.commit.right=2000],
 ['layout-wrong-zoom',r=>at(r,'trigger/layout/1188x848/code').stageLabel='100%'],
 ['layout-pointer-blocked',r=>at(r,'trigger/layout/1188x848/blocks').hits.event=false],
];
