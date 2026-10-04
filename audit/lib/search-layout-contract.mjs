import assert from 'node:assert/strict';
import {verifySemanticExtension} from './semantic-extension-contract.mjs';
import {browserEnvironment} from './browser-environment.mjs';

export const searchLayoutSizes=[[1180,757],[1188,848],[1366,768],[1024,768],[390,844]];
export const searchLayoutIds=[...searchLayoutSizes.map(([w,h])=>`main/${w}x${h}`),'callable/1188x848','callable/390x844','browser-zoom/125-percent'];
export const searchLayoutSamples=['ブロックを探す','右に行きたい','てんすう'];
export const searchLayoutSource='「本文を守る」と言う。';
const contains=(outer,inner,label)=>{assert.ok(inner.width>0&&inner.height>0,label+' has a box');assert.ok(inner.left>=outer.left-1&&inner.right<=outer.right+1&&inner.top>=outer.top-1&&inner.bottom<=outer.bottom+1,label+' stays inside');};
function geometry(g){
  assert.equal(g.label,'ブロックを探す');assert.equal(g.accessibleName,'ブロックを探す');assert.equal(g.labelCount,1);
  assert.ok(g.fontSize>=13&&g.fontSize<=14,'ordinary input text size is preserved');assert.ok(g.labelFontSize>=12);assert.ok(g.input.height>=32);
  assert.deepEqual(g.samples.map(s=>s.text),searchLayoutSamples);for(const s of g.samples)assert.ok(Number.isFinite(s.width)&&s.width>0);
  assert.ok(g.contentWidth>=Math.max(...g.samples.map(s=>s.width))+18,'sample word plus native search clear affordance fits');
  contains(g.controls,g.input,'search');contains(g.controls,g.labelRect,'visible label');contains(g.controls,g.summary,'candidate summary');contains(g.controls,g.scope,'search scope');
  assert.ok(g.labelRect.bottom<=g.input.top+1);assert.ok(g.input.bottom<=g.summary.top+1,'adjacent controls wrap after search');
  assert.ok(g.input.bottom<=g.scope.top+1);assert.ok(g.summary.bottom<=g.scope.top+1||g.scope.right<=g.summary.left||g.summary.right<=g.scope.left,'scope and summary do not overlap');
  assert.equal(g.summaryText,'候補の表示');assert.ok(g.summaryFontSize>=11);assert.doesNotMatch(g.summaryAfter,/\.\.\./);
  assert.ok(g.scopeFontSize>=11);assert.equal(g.scopeClipped,false);assert.equal(g.summaryClipped,false);
  assert.equal(g.inputHit,true);assert.equal(g.labelHit,true);assert.ok(g.input.left>=0&&g.input.right<=g.viewport.width+1);
}
function exercise(o,callable=false){
  geometry(o.initial);geometry(o.queried);geometry(o.optionsOpen);
  assert.equal(o.initial.scopeText,'すべての分類から探せます');assert.equal(o.initial.value,'');assert.equal(o.queried.value,'時間を待つ');
  assert.equal(o.optionsOpen.value,'時間を待つ');assert.equal(o.optionsOpen.optionsExpanded,true);assert.ok(o.optionsOpen.mode.width>0);contains(o.optionsOpen.controls,o.optionsOpen.mode,'expanded candidate mode');
  assert.deepEqual(o.keyboard,{inputFocused:true,tabReachedSummary:true,enterOpened:true,enterClosed:true,shiftTabReturned:true,candidateEntered:true});
  assert.equal(o.category.scope,'もし・くり返しの中を検索中');assert.equal(o.category.pressed,'true');assert.equal(o.category.query,'時間を待つ');assert.equal(o.cleared,'');
  assert.ok(o.matches.includes('WaitTime'));assert.equal(o.insertionQuery,'時間を待つ');assert.deepEqual(o.afterSearch,o.before);assert.deepEqual(o.projectAfterSearch,o.before.project);
  assert.equal(o.inserted.waits.length,1);assert.equal(o.inserted.waits[0].seconds,1);assert.equal(o.inserted.history,o.before.history+1);
  assert.equal(o.after.source.includes('本文を守る'),true);assert.notEqual(o.after.source,o.before.source);
  assert.equal(o.after.waits.length,1);assert.equal(o.after.waits[0].seconds,0.1);
  assert.equal(o.after.history,o.before.history+2);assert.deepEqual(o.undoEdit,o.inserted);assert.deepEqual(o.undo,o.before);assert.deepEqual(o.redoInsert,o.inserted);assert.deepEqual(o.redo,o.after);
  if(callable){assert.deepEqual(o.after.project,o.before.project);assert.deepEqual(o.pendingCancel,{value:'－',shown:true,blocksRetained:'true'});assert.deepEqual(o.cancelled,o.redo);}
  else{const expected=structuredClone(o.before.project);expected.scripts[0].source=o.after.source;assert.deepEqual(o.after.project,expected);}
  assert.equal(o.undo.source,o.before.source);assert.equal(o.redo.source,o.after.source);assert.equal(o.before.source,searchLayoutSource);
  for(const [name,c]of Object.entries(o.reachable)){assert.equal(c.hit,true,name+' reachable');assert.ok(c.rect.left>=0&&c.rect.right<=c.viewport.width+1&&c.rect.top>=0&&c.rect.bottom<=c.viewport.height+1,name+' in viewport');}
  assert.deepEqual(Object.keys(o.reachable),callable?['callableSave','callableSaveProject','procClose','callableModecode','callableModeblocks','callableCancel']:['runBtn','stopBtn','saveBtn','editorModecode','editorModeblocks']);
}
export function verifySearchLayoutReport(report){
  const count=verifySemanticExtension(report,'akari-search-layout-v1',searchLayoutIds);
  assert.equal(report.hostFailure,undefined);assert.equal(report.contractFailure,undefined);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);
  assert.deepEqual(report.environment,{browser:browserEnvironment.version,playwright:browserEnvironment.playwright});
  assert.equal(report.execution.headless,true);assert.ok(['win32','linux','darwin'].includes(report.execution.platform));assert.match(report.execution.node,/^v\d+\.\d+\.\d+$/);
  assert.equal(report.execution.zoomViewport,'native browser window; viewport:null');assert.equal(report.execution.zoomControl,'test-only chrome.tabs extension');
  for(const row of report.results){assert.equal(row.error,undefined);verifySearchLayoutObservation(row.id,row.observed);}
  return count;
}
export function verifySearchLayoutObservation(id,o){
  assert.ok(searchLayoutIds.includes(id),'registered search layout case');
    if(id==='browser-zoom/125-percent'){
      assert.equal(o.method,'chrome.tabs.setZoom / fresh local extension / native browser window');assert.equal(o.requested,1.25);assert.equal(o.actual,1.25);
      assert.equal(o.before.visualScale,1);assert.equal(o.after.visualScale,1);assert.equal(o.before.cssZoom,'1');assert.equal(o.after.cssZoom,'1');
      assert.equal(o.before.outerWidth,o.after.outerWidth);assert.equal(o.before.outerHeight,o.after.outerHeight);
      assert.ok(Math.abs(o.after.dpr/o.before.dpr-1.25)<0.01);assert.ok(Math.abs(o.before.innerWidth/o.after.innerWidth-1.25)<0.02);
      assert.ok(o.after.innerWidth<o.before.innerWidth);assert.deepEqual(o.after.project,o.before.project);
      for(const g of [o.exercise.initial,o.exercise.queried,o.exercise.optionsOpen])assert.deepEqual(g.viewport,{width:o.after.innerWidth,height:o.after.innerHeight});
      exercise(o.exercise);
    }else{const [kind,size]=id.split('/'),[width,height]=size.split('x').map(Number);assert.deepEqual(o.viewport,{width,height});
      for(const g of [o.initial,o.queried,o.optionsOpen])assert.deepEqual(g.viewport,{width,height});
      exercise(o,kind==='callable');}
}
const at=(r,id)=>r.results.find(row=>row.id===id).observed;
export const searchLayoutWrongMeaning=[
  ['missing-visible-label',r=>at(r,'main/1180x757').initial.label=''],
  ['tiny-input-font',r=>at(r,'main/390x844').initial.fontSize=8],
  ['word-clipped',r=>at(r,'main/390x844').queried.contentWidth=20],
  ['candidate-hidden',r=>at(r,'main/390x844').initial.summaryFontSize=0],
  ['hint-clipped',r=>at(r,'main/1188x848').initial.scopeClipped=true],
  ['controls-overlap',r=>at(r,'main/1180x757').initial.summary.top=at(r,'main/1180x757').initial.input.top],
  ['options-overflow',r=>at(r,'callable/390x844').optionsOpen.mode.right=900],
  ['keyboard-lost',r=>at(r,'main/1188x848').keyboard.shiftTabReturned=false],
  ['query-mutates-source',r=>at(r,'main/1024x768').projectAfterSearch.scripts[0].source='変更'],
  ['wrong-candidate',r=>at(r,'main/1366x768').after.waits[0].seconds=10],
  ['undo-lost',r=>at(r,'callable/1188x848').undo.source='変更'],
  ['main-control-unreachable',r=>at(r,'main/390x844').reachable.saveBtn.hit=false],
  ['fake-browser-zoom',r=>at(r,'browser-zoom/125-percent').after.visualScale=1.25],
  ['zoom-without-reflow',r=>at(r,'browser-zoom/125-percent').after.innerWidth=at(r,'browser-zoom/125-percent').before.innerWidth],
  ['missing-result',r=>r.results.pop()],['duplicate-result',r=>r.results.push(structuredClone(r.results[0]))],
  ['wrong-snapshot',r=>r.snapshot.productSha256='0'.repeat(64)],['wrong-environment',r=>r.environment.browser='unknown'],
];
