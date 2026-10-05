import assert from 'node:assert/strict';
import {verifySemanticExtension} from './semantic-extension-contract.mjs';
import {browserEnvironment} from './browser-environment.mjs';

export const insertionContextIds=[
  'tail/native-click','tail/fill-click','tail/native-tab',
  'nested/native-click','nested/fill-click',
  'fields/native-click','fields/fill',
  'branches/then-native','branches/else-native',
  'selection/category-search-cancel','selection/empty-keyboard-mode',
  'selection/value-unavailable','input/composition-cancel','input/invalid-number-cancel',
  'execution/repeat-speech-wait-twice',
];
export const insertionSources={
  tail:'「最初」と言う。',
  nested:'2回くり返す\n  「内側」と言う。\n「外側」と言う。',
  fields:'「最初」と言う。\n「次」と言う。',
  branches:'もし条件（条件の答え（あてはまる））が成り立つなら、\n  「はい」と言う。\nそうでなければ、\n  「いいえ」と言う。\n「外」と言う。',
  repeat:'2回くり返す\n  「内側」と言う。\n  0.1秒待つ。\n「最後」と言う。',
};
const sameDocument=(a,b)=>{assert.equal(a.source,b.source);assert.equal(a.project,b.project);assert.equal(a.history,b.history);assert.equal(a.owner,b.owner);};
const clean=s=>{assert.equal(s.pending,null);assert.deepEqual(s.diagnostics,[]);assert.equal(s.owner,'script:insertion-main');};
const chosen=(o,body='body',index=1,category=['basic'])=>{assert.deepEqual(o.chosen.chosen,[{parentId:o.targetParent,body,index}]);assert.deepEqual(o.chosen.chosenLabels,[(index+1)+'番目の位置に命令を入れる']);assert.deepEqual(o.chosen.category,category);assert.equal(o.chosen.pending,null);assert.equal(o.chosen.destinationShown,true);assert.ok(o.chosen.destination.length>0);};
const additionClick=o=>assert.ok(o.trace.some(e=>e.kind==='click'&&e.action==='body-insert'),'native insertion control receives its click');
const values=s=>s.shape.map(n=>n.value);
const travel=(o,steps)=>{assert.equal(o.undo.length,steps);assert.equal(o.redo.length,steps);sameDocument(o.undo.at(-1),o.before);sameDocument(o.redo.at(-1),o.after);};
export function verifyInsertionContextObservation(id,o){
  assert.ok(insertionContextIds.includes(id));assert.ok(Array.isArray(o.trace));clean(o.before);
  if(id.startsWith('tail/')){
    assert.equal(o.before.source,insertionSources.tail);chosen(o);additionClick(o);
    assert.equal(o.chosen.source,'「おはよう」と言う。');assert.equal(o.chosen.history,o.before.history+1);
    assert.equal(o.after.source,'「おはよう」と言う。\n「いってきます」と言う。');
    assert.deepEqual(values(o.after),['おはよう','いってきます']);assert.deepEqual(o.after.chosen,[]);clean(o.after);
    assert.equal(o.after.history,o.before.history+3);travel(o,3);
    assert.equal(o.method,id==='tail/fill-click'?'fill':'native');
  }else if(id.startsWith('nested/')){
    assert.equal(o.before.source,insertionSources.nested);chosen(o);additionClick(o);
    assert.equal(o.targetParent,o.before.shape[0].id);assert.equal(o.chosen.shape[0].count,3);
    const [repeat,outside]=o.after.shape;assert.equal(repeat.kind,'RepeatCount');assert.equal(repeat.count,3);
    assert.deepEqual(repeat.body.map(n=>n.value),['内側','こんにちは']);assert.equal(outside.value,'外側');assert.equal(o.after.shape.length,2);
    assert.equal(o.after.history,o.before.history+2);assert.deepEqual(o.after.chosen,[]);clean(o.after);travel(o,2);
  }else if(id.startsWith('fields/')){
    assert.equal(o.before.source,insertionSources.fields);assert.equal(o.second.source,'「前」と言う。\n「次」と言う。');
    assert.equal(o.second.pending.value,'後');assert.equal(o.second.pending.id,o.before.shape[1].valueId);
    assert.equal(o.after.source,'「前」と言う。\n「後」と言う。');assert.deepEqual(values(o.after),['前','後']);clean(o.after);travel(o,2);
    assert.equal(o.after.history,o.before.history+2);
    if(id==='fields/native-click')assert.equal(o.second.selection,o.before.shape[1].valueId);
  }else if(id.startsWith('branches/')){
    const branch=id==='branches/then-native'?'thenBody':'elseBody';assert.equal(o.before.source,insertionSources.branches);
    chosen(o,branch);additionClick(o);assert.equal(o.targetParent,o.before.shape[0].id);
    const node=o.after.shape[0];assert.equal(node.kind,'IfStatement');assert.equal(node.condition,true);
    assert.deepEqual(node.thenBody.map(n=>n.value),branch==='thenBody'?['変更した真','こんにちは']:['はい']);
    assert.deepEqual(node.elseBody.map(n=>n.value),branch==='elseBody'?['変更した偽','こんにちは']:['いいえ']);
    assert.equal(o.after.shape[1].value,'外');assert.equal(o.after.history,o.before.history+2);clean(o.after);travel(o,2);
  }else if(id==='selection/category-search-cancel'){
    assert.equal(o.queried.query,'話す');assert.deepEqual(o.queried.category,['basic']);chosen(o);assert.equal(o.chosen.query,'話す');
    sameDocument(o.queried,o.before);sameDocument(o.chosen,o.before);sameDocument(o.cancelled,o.before);sameDocument(o.escaped,o.before);
    assert.deepEqual(o.cancelled.chosen,[]);assert.deepEqual(o.escaped.chosen,[]);assert.equal(o.cancelled.query,'話す');assert.equal(o.escaped.query,'話す');
    assert.equal(o.chosen.scope,'基本の中を検索中');assert.ok(o.chosen.candidates.includes('Say'));
  }else if(id==='selection/empty-keyboard-mode'){
    assert.equal(o.before.source,'');chosen(o,'body',0,['']);sameDocument(o.chosen,o.before);assert.equal(o.chosen.mode,'all');assert.equal(o.chosen.query,'待つ');
    assert.match(o.chosen.message,/候補の種類/);assert.equal(o.after.shape.length,1);assert.equal(o.after.shape[0].kind,'WaitTime');assert.equal(o.after.shape[0].seconds,1);
    assert.equal(o.after.history,o.before.history+1);clean(o.after);travel(o,1);
  }else if(id==='selection/value-unavailable'){
    assert.equal(o.selected.chosen.length,1);assert.equal(o.selected.chosen[0].input,'value');assert.match(o.selected.destination,/値/);assert.match(o.selected.destination,/ここに入れる/);
    assert.equal(o.disabled.ariaDisabled,'true');assert.equal(o.disabled.reasonVisible,true);assert.match(o.disabled.reason,/ここに入れる/);
    sameDocument(o.selected,o.before);sameDocument(o.after,o.before);assert.match(o.after.message,/ここに入れる/);
    assert.deepEqual(o.commandChosen.chosen,[{parentId:o.before.rootId,body:'body',index:1}]);assert.deepEqual(o.commandChosen.category,['basic']);
  }else if(id==='input/composition-cancel'){
    assert.equal(o.inputMethod,'synthetic composition events; native text input');assert.equal(o.realIME,false);
    sameDocument(o.composing,o.before);assert.equal(o.composing.pending.composing,true);assert.equal(o.composing.pending.value,'へんかん');assert.match(o.composing.message,/変換/);
    assert.deepEqual(o.composing.chosen,[]);sameDocument(o.cancelled,o.before);clean(o.cancelled);
    assert.equal(o.after.source,'「変換済み」と言う。');clean(o.after);assert.equal(o.after.history,o.before.history+1);assert.deepEqual(o.after.category,['basic']);
    assert.ok(o.trace.some(e=>e.kind==='compositionstart'));assert.ok(o.trace.some(e=>e.kind==='compositionend'));
  }else if(id==='input/invalid-number-cancel'){
    sameDocument(o.invalid,o.before);assert.equal(o.invalid.pending.value,'－');assert.equal(o.invalid.pending.invalid,true);assert.deepEqual(o.invalid.chosen,[]);
    assert.ok(o.invalid.message.length>0);sameDocument(o.after,o.before);clean(o.after);
  }else if(id==='execution/repeat-speech-wait-twice'){
    assert.equal(o.before.source,insertionSources.repeat);sameDocument(o.after,o.before);
    assert.deepEqual(o.runs.map(r=>r.words),[['内側','内側','最後'],['内側','内側','最後']]);
    for(const run of o.runs){assert.ok(run.waits.length>=2);assert.ok(run.waits.every(w=>w.seconds===.1));assert.equal(run.finished,true);assert.equal(run.error,null);}
  }
  return true;
}
export function verifyInsertionContextReport(report){
  const count=verifySemanticExtension(report,'akari-insertion-context-v1',insertionContextIds);
  assert.deepEqual(report.environment,{browser:browserEnvironment.version,playwright:browserEnvironment.playwright});
  assert.ok(['win32','linux','darwin'].includes(report.execution.platform));assert.equal(report.execution.realIME,false);assert.equal(report.execution.headless,true);
  assert.equal(report.hostFailure,undefined);assert.equal(report.contractFailure,undefined);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);
  for(const row of report.results){assert.equal(row.error,undefined);verifyInsertionContextObservation(row.id,row.observed);}
  return count;
}
