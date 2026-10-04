import assert from 'node:assert/strict';
import {verifySemanticExtension} from './semantic-extension-contract.mjs';
import {browserEnvironment} from './browser-environment.mjs';

export const autosaveSources={
  first:'始めると、あかりは「買うもの」の2番目を2秒話します。',
  second:'始めると、あかりは「準備」と言います。画面も同じ合図で動き始め、点数を「買うもの」の2番目にします。',
  plain:'「買うもの」の2番目を2秒話します。',
  saved:'「前に保存した本文」と言う。',
  older:'「保存中の本文」と言う。',
  newer:'「新しく編集した本文」と言う。',
  draft:'「まだ閉じていない引用',
};
export const autosaveSuffix='\n※ 編集した原文を保持';
export const autosaveCallable={
  source:'自分のクローンを作る。',
  document:{revision:7,unitIds:['first-event']},
  extraScripts:[{id:'clone-handler',targetId:'sprite-1',event:'cloneStart',source:'「読み上げ」という手順を1回行う。',document:{revision:1,unitIds:['clone-event']}}],
  actions:[{id:'say-action',ownerId:'stage',name:'読み上げ',args:[],source:'「買うもの」の2番目を2秒話します。'}],
};
export const autosaveStateIds=[
  'paused/persistent-first','paused/legacy-second-cancel','restored/persistent-second-repair',
  'paused/plain-script','storage/completion-order','storage/stale-completion',
  'storage/quota-retains-current-and-draft','restored/pending-draft','restored/callable-clone-pause',
];
const saved=s=>assert.equal(s,'自動保存：済み');
const pending=s=>{assert.doesNotMatch(s,/済み|失敗|利用できません/);assert.match(s,/待機|保存中/);};
const source=s=>s.project.scripts[0].source;
function owner(s,key='script:main'){assert.equal(s.selectedScriptId,'main');assert.equal(s.owner,key);}
function timeline(events){
  assert.ok(events.length>2);assert.deepEqual(events.map(e=>e.seq),events.map((_,i)=>i+1));
  for(const e of events){assert.ok(Number.isFinite(e.at)&&e.at>=0);assert.equal(typeof e.status,'string');}
  for(const e of events.filter(e=>e.kind==='status'&&e.status==='自動保存：済み')){
    assert.ok(events.some(p=>p.seq<e.seq&&['completion-delivered','fallback-written'].includes(p.kind)),
      'saved status must follow successful storage completion');
  }
}
function persisted(record,project){assert.ok(record);assert.deepEqual(record.project,project);assert.equal(record.editorState.selectedScriptId,'main');assert.ok(Number.isSafeInteger(record.revision));assert.ok(Number.isFinite(record.updatedAt));}
function paused(o,expected,key){
  assert.equal(o.setup,'serialized-fixture-then-pointer-keyboard');assert.equal(source(o.before),expected);
  assert.equal(o.paused.state,'PAUSED');assert.equal(o.paused.failure,'R411');owner(o.paused,key);
  assert.deepEqual(o.paused.project,o.before.project);saved(o.settled.status);owner(o.settled,key);
  assert.deepEqual(o.settled.project,o.before.project);persisted(o.record,o.before.project);
  assert.ok(o.events.some(e=>e.kind==='put-request'));assert.ok(o.events.some(e=>e.kind==='completion-delivered'));
  assert.ok(!o.events.some(e=>/失敗|利用できません/.test(e.status)));timeline(o.events);
}
export function verifyAutosaveStateReport(report){
  const count=verifySemanticExtension(report,'akari-autosave-state-v1',autosaveStateIds);
  assert.equal(report.hostFailure,undefined);assert.equal(report.contractFailure,undefined);
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);
  assert.deepEqual(report.environment,{browser:browserEnvironment.version,playwright:browserEnvironment.playwright});
  for(const row of report.results)assert.equal(row.error,undefined);
  const at=id=>report.results.find(r=>r.id===id).observed;
  for(const [id,key,runtimeKey] of [['paused/persistent-first','first','script:first-event'],['paused/legacy-second-cancel','second','script:document:script:main:unit:2'],['restored/persistent-second-repair','second','script:second-event'],['paused/plain-script','plain','script:main']])paused(at(id),autosaveSources[key]+autosaveSuffix,runtimeKey);
  assert.deepEqual(at('paused/persistent-first').before.project.scripts[0].document.unitIds,['first-event']);
  assert.equal(at('paused/legacy-second-cancel').before.project.scripts[0].document,undefined);
  {
    const o=at('paused/legacy-second-cancel');
    assert.equal(o.opened.state,'DESIGN');assert.deepEqual(o.opened.project,o.before.project);
    assert.equal(o.cancelled.state,'DESIGN');assert.deepEqual(o.cancelled.project,o.before.project);
    assert.equal(o.cancelled.history,o.opened.history);assert.equal(o.cancelled.redo,o.opened.redo);
    assert.equal(o.panelCount,0);assert.equal(o.rerun.failure,'R411');owner(o.rerun,'script:document:script:main:unit:2');
  }
  {
    const o=at('restored/persistent-second-repair');
    assert.equal(o.restoredFromStorage,true);assert.deepEqual(o.before.project.scripts[0].document.unitIds,['first-event','second-event']);
    const expected=structuredClone(o.before.project);expected.scripts[0].source=autosaveSources.second.replace('点数を「買うもの」','点数を作品のリスト「買うもの」')+autosaveSuffix;
    expected.scripts[0].document.revision++;
    assert.deepEqual(o.opened.project,o.before.project);assert.equal(o.opened.state,'DESIGN');
    assert.deepEqual(o.applied.project,expected);assert.equal(o.applied.history,o.opened.history+1);owner(o.applied);
    assert.deepEqual(o.undo.project,o.before.project);assert.deepEqual(o.redo.project,expected);
    assert.equal(o.rerun.failure,null);assert.equal(o.rerun.score,'パン');
    persisted(o.afterRecord,expected);assert.deepEqual(o.finalRestore.project,expected);
    assert.deepEqual(o.restoredUndo.project,o.before.project);assert.deepEqual(o.restoredRedo.project,expected);
  }
  {
    const o=at('storage/completion-order');timeline(o.events);pending(o.held.status);saved(o.done.status);
    assert.equal(source(o.done),autosaveSources.older);persisted(o.record,o.done.project);
    const request=o.events.find(e=>e.kind==='request-success'),native=o.events.find(e=>e.kind==='native-complete'),delivered=o.events.find(e=>e.kind==='completion-delivered');
    assert.ok(request&&native&&delivered);pending(request.status);pending(native.status);assert.ok(request.seq<native.seq&&native.seq<delivered.seq);
  }
  {
    const o=at('storage/stale-completion');timeline(o.events);pending(o.oldHeld.status);pending(o.afterNewEdit.status);pending(o.afterOldCompletion.status);pending(o.newHeld.status);saved(o.done.status);
    assert.equal(source(o.afterNewEdit),autosaveSources.newer);assert.equal(source(o.afterOldCompletion),autosaveSources.newer);
    assert.equal(source(o.done),autosaveSources.newer);persisted(o.record,o.done.project);
    const completions=o.events.filter(e=>e.kind==='completion-delivered');assert.equal(completions.length,2);
    assert.ok(!o.events.some(e=>e.seq>completions[0].seq&&e.seq<completions[1].seq&&e.status==='自動保存：済み'));
    assert.deepEqual(o.restored.project,o.done.project);
  }
  {
    const o=at('storage/quota-retains-current-and-draft');assert.equal(source(o.before),autosaveSources.saved);
    for(const [i,attempt]of o.attempts.entries()){
      assert.equal(attempt.source,i===0?autosaveSources.newer:autosaveSources.draft);
      assert.equal(attempt.current.input,attempt.source);assert.equal(source(attempt.current),autosaveSources.newer);
      assert.deepEqual(attempt.record,o.beforeRecord);assert.match(attempt.current.status,/失敗/);
      assert.match(attempt.current.status,/「保存」/);assert.match(attempt.current.status,/ファイル/);
      assert.ok(attempt.events.some(e=>e.kind==='put-error'&&e.error==='QuotaExceededError'));
      assert.ok(attempt.events.some(e=>e.kind==='fallback-error'&&e.error==='QuotaExceededError'));
      assert.ok(!attempt.events.some(e=>e.kind==='status'&&e.status==='自動保存：済み'));
      if(i===1){assert.ok(attempt.current.pending);assert.equal(attempt.current.pending.value,autosaveSources.draft);}
    }
    assert.equal(o.attempts.length,2);assert.equal(o.final.input,autosaveSources.draft);
  }
  {
    const o=at('restored/pending-draft');assert.equal(source(o.before),autosaveSources.saved);saved(o.saved.status);
    assert.equal(o.saved.input,autosaveSources.draft);assert.equal(o.restored.input,autosaveSources.draft);
    assert.equal(source(o.restored),autosaveSources.saved);assert.equal(o.restored.pending.value,autosaveSources.draft);
    assert.equal(o.record.editorState.pendingEditors[0].source,autosaveSources.draft);
    assert.equal(o.undo.input,autosaveSources.saved);assert.equal(o.redo.input,autosaveSources.draft);timeline(o.events);
  }
  {
    const o=at('restored/callable-clone-pause');assert.equal(o.restoredFromStorage,true);
    assert.equal(source(o.before),autosaveCallable.source);assert.deepEqual(o.before.project.actions,autosaveCallable.actions);
    assert.deepEqual(o.before.project.scripts.slice(1),autosaveCallable.extraScripts);
    assert.equal(o.paused.state,'PAUSED');assert.equal(o.paused.failure,'R411');
    assert.equal(o.paused.selectedScriptId,'clone-handler');assert.equal(o.paused.owner,'action:say-action');
    assert.equal(o.paused.selectedTarget,'sprite-1');assert.equal(o.paused.selectedEvent,'cloneStart');
    assert.deepEqual(o.paused.project,o.before.project);saved(o.settled.status);assert.deepEqual(o.record.project,o.before.project);
    assert.equal(o.record.editorState.selectedScriptId,'clone-handler');assert.equal(o.record.editorState.selectedId,'sprite-1');assert.equal(o.record.editorState.currentEvent,'cloneStart');
    assert.deepEqual(o.exported.project,o.before.project);assert.equal(o.exported.editorState.selectedScriptId,'clone-handler');
    assert.equal(o.exported.editorState.selectedId,'sprite-1');assert.equal(o.exported.editorState.currentEvent,'cloneStart');
    assert.ok(o.events.some(e=>e.kind==='completion-delivered'));assert.ok(!o.events.some(e=>/失敗|利用できません/.test(e.status)));timeline(o.events);
  }
  return count;
}
const observed=(r,id)=>r.results.find(x=>x.id===id).observed;
export const autosaveStateWrongMeaning=[
  ['runtime-unit-as-owner',r=>observed(r,'paused/persistent-first').paused.selectedScriptId='first-event'],
  ['pause-failure-hidden',r=>observed(r,'paused/persistent-first').events.find(e=>e.kind==='status').status='自動保存：失敗'],
  ['unsaved-record',r=>observed(r,'paused/plain-script').record.project.scripts[0].source='別の本文'],
  ['cancel-changes-source',r=>observed(r,'paused/legacy-second-cancel').cancelled.project.scripts[0].source='変更'],
  ['repair-drops-sibling',r=>observed(r,'restored/persistent-second-repair').applied.project.scripts[0].source='点数を0にする。'],
  ['repair-history-lost',r=>observed(r,'restored/persistent-second-repair').restoredUndo.project=structuredClone(observed(r,'restored/persistent-second-repair').applied.project)],
  ['saved-before-complete',r=>observed(r,'storage/completion-order').events.find(e=>e.kind==='request-success').status='自動保存：済み'],
  ['stale-success',r=>observed(r,'storage/stale-completion').afterOldCompletion.status='自動保存：済み'],
  ['stale-storage',r=>observed(r,'storage/stale-completion').record.project.scripts[0].source=autosaveSources.older],
  ['quota-erases-previous',r=>observed(r,'storage/quota-retains-current-and-draft').attempts[0].record=null],
  ['quota-no-next-action',r=>observed(r,'storage/quota-retains-current-and-draft').attempts[0].current.status='自動保存：失敗'],
  ['draft-lost',r=>observed(r,'restored/pending-draft').restored.input=autosaveSources.saved],
  ['callable-selection-invalid',r=>observed(r,'restored/callable-clone-pause').record.editorState.selectedId='stage'],
  ['callable-export-lost',r=>observed(r,'restored/callable-clone-pause').exported.project.actions=[]],
  ['missing-result',r=>r.results.pop()],['duplicate-result',r=>r.results.push(structuredClone(r.results[0]))],
  ['wrong-snapshot',r=>r.snapshot.productSha256='0'.repeat(64)],['wrong-environment',r=>r.environment.browser='unknown'],
];
