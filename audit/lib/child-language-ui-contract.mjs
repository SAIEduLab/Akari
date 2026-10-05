import assert from 'node:assert/strict';
import {browserEnvironment} from './browser-environment.mjs';

export const childLanguageUiIds = Object.freeze([
  'CHILD-UI-ACTION-HELP','CHILD-UI-COPY-SEMANTICS','CHILD-UI-DATA-EXAMPLES',
  'CHILD-UI-PROCEDURE-EXAMPLES','CHILD-UI-BLOCK-WORDS','CHILD-UI-PAINT-MATERIALS',
  'CHILD-UI-RESPONSIVE-WORDS','CHILD-UI-TOUCH-HELP',
]);

export const childInsertionConceptHints=Object.freeze({
  "commandAndBody": "命令（めいれい）は、「話す」「待つ」など、してほしいことです。本文（ほんぶん）は、命令を順番に並べるところです。",
  "palette": "候補（こうほ）は選べるブロックです。分類（ぶんるい）は似た候補のまとまりです。例：「基本」の「話す」「待つ」。検索（けんさく）は言葉で探すことです。「候補の表示」で命令・値の種類（しゅるい）を選べます。「使えない候補も表示」の表示（ひょうじ）は画面に見せることで、使えない理由も読めます。"
});

function readable(rows,min=1) {
  assert.ok(Array.isArray(rows)&&rows.length>=min,'visible explanation observations required');
  for(const row of rows) {
    assert.ok(typeof row.text==='string'&&row.text.trim(),'actual visible text required');
    assert.ok(Number.isFinite(row.width)&&row.width>0&&Number.isFinite(row.required),'independent measured widths required');
    assert.ok(row.required<=row.width+1,'horizontal explanation width must fit; vertical reach is checked separately');
  }
}
function bounds(rect,viewport,min=1) {
  for(const key of ['x','y','width','height'])assert.ok(Number.isFinite(rect?.[key]),'measured control '+key);
  assert.ok(rect.width>=min&&rect.height>=min,'visible target size');
  assert.ok(rect.x>=-1&&rect.y>=-1&&rect.x+rect.width<=viewport.width+1&&rect.y+rect.height<=viewport.height+1,'control must fit the viewport after ordinary scrolling');
}
function panelMeasurement(observation) {
  for(const key of ['scrollTop','scrollHeight','clientHeight','maxScroll'])assert.ok(Number.isFinite(observation?.[key]),'actual panel '+key);
  assert.ok(observation.clientHeight>0&&observation.scrollTop>=0&&observation.maxScroll>=0);
  assert.equal(observation.maxScroll,observation.scrollHeight-observation.clientHeight);
  assert.ok(observation.scrollTop<=observation.maxScroll+1);
  assert.equal(observation.tabIndex,0);assert.equal(observation.label,'ヒントのつづきを読む');
  assert.ok(observation.paragraphs>=4);assert.equal(observation.tail?.length,2);
  bounds(observation.clip,observation.viewport);
  for(const row of observation.tail) {
    assert.ok(typeof row.text==='string'&&row.text.trim());
    for(const key of ['x','y','width','height'])assert.ok(Number.isFinite(row.ink?.[key]));
    assert.ok(row.ink.width>0&&row.ink.height>0);
  }
}
function panelReach(observation,method,basic=false) {
  assert.equal(observation?.method,method,'native input method required');
  panelMeasurement(observation.initial);panelMeasurement(observation.bottom);
  assert.equal(observation.initial.scrollTop,0,'explanation starts at the top');
  assert.equal(observation.initial.maxScroll,observation.bottom.maxScroll,'scroll does not change content');
  assert.deepEqual(observation.initial.viewport,observation.bottom.viewport);
  assert.ok(observation.bottom.scrollTop>=observation.bottom.maxScroll-1,'native input reaches the last explanation');
  for(const row of observation.bottom.tail) {
    const r=row.ink,c=observation.bottom.clip;
    assert.ok(r.x>=c.x-1&&r.y>=c.y-1&&r.x+r.width<=c.x+c.width+1&&r.y+r.height<=c.y+c.height+1,
      'last explanation ink is fully inside the visible scroll panel');
  }
  if(basic) {
    const text=observation.bottom.tail.map(r=>r.text).join(' ');
    assert.ok(text.includes('コードはコピーしません')&&text.includes('決めた変更を1つ戻す')&&text.includes('入力を取り消す'));
  }
  if(method==='native-keyboard') {
    panelMeasurement(observation.afterArrow);
    if(observation.initial.maxScroll>0)assert.ok(observation.afterArrow.scrollTop>0,'ArrowDown really scrolls');
    for(const key of ['Tab','Home','ArrowDown','End'])assert.ok(observation.keys?.some(e=>e.key===key&&e.trusted===true),'trusted native '+key+' event');
    assert.ok(observation.keys.every(e=>e.trusted===true));
    for(const key of ['Home','ArrowDown','End']) {
      const event=observation.keys.find(e=>e.key===key);
      assert.equal(event.defaultPrevented,false,'help scroll key is not taken by a product handler');
      assert.equal(event.targetIsPanel,true);assert.equal(event.activeIsPanel,true);
    }
    assert.deepEqual(observation.stateAfterArrow,observation.stateBefore,'ArrowDown preserves actual project and editing state');
    assert.deepEqual(observation.stateAfter,observation.stateBefore,'native reading preserves actual project and editing state');
    panelMeasurement(observation.beforeHome);
    for(const key of ['home','arrow','end'])assert.ok(Number.isInteger(observation.markers?.[key])&&observation.markers[key]>=0);
    assert.ok(observation.markers.home<=observation.markers.arrow&&observation.markers.arrow<=observation.markers.end);
    assert.ok(Array.isArray(observation.scrollEvents));
    for(const event of observation.scrollEvents) {
      assert.ok(['scroll','scrollend'].includes(event.type));assert.equal(event.trusted,true);
      for(const key of ['scrollTop','scrollHeight','clientHeight'])assert.ok(Number.isFinite(event[key]));
    }
    const ended=(from,to,test)=>observation.scrollEvents.slice(from,to).some(e=>e.type==='scrollend'&&test(e.scrollTop));
    if(observation.beforeHome.scrollTop>0)assert.ok(ended(observation.markers.home,observation.markers.arrow,top=>top===0),'Home completed before ArrowDown');
    if(observation.initial.maxScroll>0)assert.ok(ended(observation.markers.arrow,observation.markers.end,top=>top>0),'ArrowDown completed before End');
    if(observation.afterArrow.scrollTop<observation.afterArrow.maxScroll-1)assert.ok(ended(observation.markers.end,undefined,top=>top>=observation.bottom.maxScroll-1),'End completed at the last explanation');
  } else {
    assert.ok(Number.isInteger(observation.plannedSwipes)&&observation.plannedSwipes>=0&&observation.plannedSwipes<=8);
    assert.equal(observation.swipes?.length,observation.plannedSwipes);
    if(observation.initial.maxScroll>0) {
      assert.ok(observation.plannedSwipes>0&&observation.bottom.scrollTop>0);
      for(const type of ['touchstart','touchmove','touchend'])assert.ok(observation.events?.some(e=>e.type===type&&e.trusted===true),'trusted native '+type+' event');
    }
    assert.ok(observation.events.every(e=>e.trusted===true));
    for(const swipe of observation.swipes) {
      const c=observation.initial.clip;
      assert.ok(swipe.x>=c.x&&swipe.x<=c.x+c.width&&swipe.startY>swipe.endY&&swipe.startY<=c.y+c.height&&swipe.endY>=c.y);
      assert.ok(Number.isFinite(swipe.scrollTop)&&swipe.scrollTop>=0&&swipe.scrollTop<=observation.bottom.maxScroll+1);
    }
  }
}
export function verifyChildLanguageUi(report,inputs,environment) {
  assert.equal(report?.schema,'akari-child-language-ui-v1'); assert.equal(report.status,'PASS');
  assert.equal(report.environment,environment,'report OS must match the executing environment');
  assert.deepEqual(report.snapshot,inputs,'report must describe the current frozen input');
  assert.equal(report.browser,browserEnvironment.version);
  assert.equal(report.browserEnvironment?.browser,browserEnvironment.version);
  assert.equal(report.browserEnvironment.playwright,browserEnvironment.playwright);
  assert.equal(report.browserEnvironment.revision,browserEnvironment.revision);
  assert.equal(report.browserEnvironment.launchTimeout,browserEnvironment.launchTimeout);
  assert.ok(typeof report.browserEnvironment.executablePath==='string'&&report.browserEnvironment.executablePath);
  assert.match(report.browserEnvironment.executableSha256,/^[a-f0-9]{64}$/);
  assert.equal(report.total,childLanguageUiIds.length); assert.equal(report.results?.length,childLanguageUiIds.length);
  assert.deepEqual(report.results.map(r=>r.id),childLanguageUiIds,'fixed IDs, order and no duplicates');
  assert.deepEqual(report.pageErrors,[]); assert.deepEqual(report.networkRequests,[]);
  const rows=Object.fromEntries(report.results.map(r=>{
    assert.equal(r.pass,true); assert.equal(r.status,'PASS'); assert.ok(r.evidence&&typeof r.evidence==='object'); return [r.id,r.evidence];
  }));
  const action=rows['CHILD-UI-ACTION-HELP'];
  for(const key of ['keyboardHelp','generatedPlayerWords','projectSourcePreserved'])assert.equal(action[key],true);
  readable(action.help,8);panelReach(action.tailReach,'native-keyboard',true);
  assert.equal(action.editReading,'へんしゅう');assert.match(action.editMeaning,/編集（へんしゅう）.*命令や言葉を作ったり直したり/s);
  assert.deepEqual(action.downloadTypes,['akari.md','html']);
  assert.match(action.saveFile,/\.akari\.md$/); assert.match(action.exportFile,/\.html$/);
  const copy=rows['CHILD-UI-COPY-SEMANTICS'];
  for(const key of ['visibleScope','appearanceAndSettings','noCodeCopied','undo'])assert.equal(copy[key],true);
  assert.ok(Array.isArray(copy.scriptsBefore)&&copy.scriptsBefore.length>0,'source-bearing copy precondition required');
  assert.deepEqual(copy.scriptsAfter,copy.scriptsBefore,'component copy preserves the script collection');
  assert.deepEqual(copy.copy,copy.original,'appearance and settings copied exactly');
  assert.deepEqual(copy.original,{type:'sprite',w:180,h:180,fg:'#f5a000',bg:null,direction:0,scalePercent:100,visible:true},
    'the fixed mascot supplies complete real appearance and settings, including its transparent background');
  assert.equal(copy.componentCountAfter,copy.componentCountBefore+1,'one new component');
  const copyModes=copy.copyHelpModes;
  assert.ok(copyModes&&copyModes.before&&copyModes.after&&Array.isArray(copyModes.steps),'actual copy explanation mode-move observations required');
  assert.equal(copyModes.steps.length,3);assert.deepEqual(copyModes.steps.map(s=>s.mode),['code','blocks','code']);
  assert.equal(typeof copyModes.before.project,'string');
  const modeProject=JSON.parse(copyModes.before.project);
  assert.deepEqual(modeProject.scripts,copy.scriptsBefore,'mode observations refer to the source-bearing copy fixture');
  assert.equal(copyModes.before.source,'「元の動き」を言う。');
  assert.ok(Number.isInteger(copyModes.before.history)&&copyModes.before.history>=0,'actual history count required');
  assert.ok(Number.isInteger(copyModes.before.redo)&&copyModes.before.redo>=0,'actual redo count required');
  assert.equal(typeof copyModes.before.dirty,'boolean');
  for(const step of copyModes.steps) {
    const host=step.mode==='blocks'?'componentActions':'properties';
    assert.equal(step.actionsHost,host);assert.equal(step.helpHost,host);
    for(const key of ['adjacent','sameActionsNode','sameHelpNode'])assert.equal(step[key],true);
    assert.equal(step.helpCount,1);assert.equal(step.text,"見た目と設定をコピーします。コードはコピーしません。");
    assert.equal(step.ariaDescription,"見た目と設定をコピーします。コードはコピーしません。");
    assert.deepEqual(step.state,copyModes.before,'moving one explanation node leaves the actual project/history intact');
  }
  assert.deepEqual(copyModes.after,copyModes.before);
  const data=rows['CHILD-UI-DATA-EXAMPLES']; readable(data.descriptions,3);
  for(const key of ['numberAndStringExamplesPreserved','variableStoresString','listStoresOrderedItems'])assert.equal(data[key],true);
  assert.match(data.variablePlaceholder,/0、0点、こんにちは/); assert.equal(data.variableValue,'あかり');
  assert.deepEqual(data.listValue,['本','かさ','ぼうし'],'ordered list matches the visible example');
  const procedure=rows['CHILD-UI-PROCEDURE-EXAMPLES']; readable(procedure.concept,4);panelReach(procedure.tailReach,'native-keyboard');
  for(const key of ['advancedOnly','concreteValueExample','existingArgumentPlaceholder'])assert.equal(procedure[key],true);
  assert.deepEqual(procedure.definitionArgsPreserved,['点数','名前']); assert.equal(procedure.registeredSource,'名前を言う。');
  const block=rows['CHILD-UI-BLOCK-WORDS']; readable(block.help,9);
  assert.deepEqual(block.insertionConceptHints,childInsertionConceptHints,'actual normal-help reading and meaning match the fixed UI contract');
  assert.equal(block.help[2].text,childInsertionConceptHints.commandAndBody);
  assert.equal(block.help[3].text,childInsertionConceptHints.palette);
  for(const key of ['textNumberBooleanSupport','powerExample','deleteScopeVisible','blockCopyTargetClear','cancelDifferentFromUndo'])assert.equal(block[key],true);
  assert.ok(block.truthExample.includes('条件の「あてはまる・あてはまらない」'));
  assert.ok(!block.truthExample.includes('はい・いいえ'),'condition example matches accepted truth vocabulary');
  assert.deepEqual(block.oldValues,['2','3']); assert.deepEqual(block.newValues,block.oldValues);
  assert.deepEqual(block.leftRightValuesPreserved,block.oldValues); assert.equal(block.historyAfter,block.historyBefore+1);
  const paint=rows['CHILD-UI-PAINT-MATERIALS'];
  assert.equal(paint.ellipseAndOutline,true); assert.equal(paint.cancelPreservesProject,true);
  assert.deepEqual(paint.transparentPixels,{center:0,exterior:0},'outline and checkerboard remain transparent in actual pixels');
  assert.deepEqual(paint.optionalMaterials?.map(m=>[m.preset,m.reading,m.note]),[
    ['comet','すいせい','尾のある星'],['yinYang','いんよう','白黒の丸'],['medical','いりょう','へびとつえ'],
    ['radioactive','ほうしゃせん','三つの羽の印'],['biohazard',null,'三つの輪の印'],
  ]);
  const responsive=rows['CHILD-UI-RESPONSIVE-WORDS'];
  for(const key of ['ordinaryScroll','keyboard','helpPreservesEditing'])assert.equal(responsive[key],true);
  assert.deepEqual(responsive.observations?.map(o=>[o.viewport.width,o.viewport.height,o.mode]),[
    [1180,757,'code'],[1180,757,'blocks'],[1188,848,'code'],[1188,848,'blocks'],[390,844,'code'],[390,844,'blocks'],
  ]);
  for(const observation of responsive.observations) {
    assert.deepEqual(Object.keys(observation.controls),['saveBtn','exportBtn','runBtn','stopBtn']);
    for(const rect of Object.values(observation.controls))bounds(rect,observation.viewport);
    readable(observation.help,8);panelReach(observation.tailReach,'native-keyboard',true);assert.ok(observation.reading?.length>=4);
    const text=observation.reading.map(r=>r.text).join(' ');
    for(const reading of ['ほぞん','かきだし','がぞう','へんすう','ほんぶん'])assert.ok(text.includes(reading));
    for(const term of observation.reading){assert.equal(term.rects,1);assert.equal(term.whiteSpace,'nowrap');}
  }
  const touch=rows['CHILD-UI-TOUCH-HELP'];
  for(const key of ['hasTouch','actualTouchscreenTap','editingPreserved'])assert.equal(touch[key],true);
  assert.deepEqual(touch.viewport,{width:390,height:844}); bounds(touch.touchTarget,touch.viewport,24);readable(touch.help,8);
  panelReach(touch.tailReach,'native-touch',true);
  assert.ok(Array.isArray(report.artifacts)&&report.artifacts.length>=9,'visual artifacts include paint and both ends of the touch explanation');
  assert.equal(new Set(report.artifacts.map(a=>a.path)).size,report.artifacts.length,'each visual artifact has its own file');
  for(const artifact of report.artifacts){assert.ok(typeof artifact.path==='string'&&artifact.path.endsWith('.png'));assert.match(artifact.sha256,/^[a-f0-9]{64}$/);}
  if(environment==='linux')assert.ok(!report.limitations.some(s=>s.includes('Linuxでは未実施')),'Linux result cannot claim unexecuted Linux');
  return {status:'PASS',total:childLanguageUiIds.length,environment};
}

export function verifyChildLanguageUiNegatives(report,inputs,environment) {
  const changes=[
    ['missing-case',r=>r.results.pop()],['duplicate-case',r=>r.results[1]=structuredClone(r.results[0])],
    ['false-pass',r=>r.results[0].pass=false],['stale-snapshot',r=>r.snapshot.productSha256='0'.repeat(64)],
    ['copy-code-changed',r=>r.results[1].evidence.scriptsAfter.push({targetId:'sprite-copy',event:'start',source:'1を言う。'})],
    ['missing-copy-settings',r=>{r.results[1].evidence.copy={};r.results[1].evidence.original={};}],
    ['missing-copy-mode-observation',r=>delete r.results[1].evidence.copyHelpModes],
    ['copy-help-old-mode-host',r=>r.results[1].evidence.copyHelpModes.steps[1].helpHost='properties'],
    ['copy-help-not-adjacent',r=>r.results[1].evidence.copyHelpModes.steps[1].adjacent=false],
    ['copy-mode-history-changed',r=>r.results[1].evidence.copyHelpModes.steps[1].state.history++],
    ['copy-help-node-recreated',r=>r.results[1].evidence.copyHelpModes.steps[1].sameHelpNode=false],
    ['copy-help-aria-changed',r=>r.results[1].evidence.copyHelpModes.steps[1].ariaDescription='コードもコピーします'],
    ['wrong-data-value',r=>r.results[2].evidence.variableValue=10],
    ['reordered-list',r=>r.results[2].evidence.listValue.reverse()],
    ['operator-loses-value',r=>r.results[4].evidence.newValues[0]='0'],
    ['wrong-truth-example',r=>r.results[4].evidence.truthExample='条件の「はい・いいえ」'],
    ['missing-insertion-concepts',r=>delete r.results[4].evidence.insertionConceptHints],
    ['opaque-checkerboard',r=>r.results[5].evidence.transparentPixels.exterior=255],
    ['clipped-help',r=>r.results[6].evidence.observations[0].help[0].required+=10000],
    ['unreachable-control',r=>r.results[6].evidence.observations[0].controls.saveBtn.x=-20],
    ['broken-word',r=>r.results[6].evidence.observations[0].reading[0].rects=2],
    ['clipped-tail',r=>{const o=r.results[7].evidence.tailReach.bottom;o.tail[1].ink.y=o.clip.y+o.clip.height;}],
    ['unreached-tail',r=>r.results[7].evidence.tailReach.bottom.scrollTop=0],
    ['no-keyboard-scroll-proof',r=>r.results[6].evidence.observations[0].tailReach.keys=[]],
    ['prevented-help-key',r=>r.results[6].evidence.observations[0].tailReach.keys.find(e=>e.key==='ArrowDown').defaultPrevented=true],
    ['wrong-help-focus',r=>r.results[6].evidence.observations[0].tailReach.keys.find(e=>e.key==='ArrowDown').activeIsPanel=false],
    ['keyboard-changes-project',r=>r.results[6].evidence.observations[0].tailReach.stateAfterArrow.source='changed'],
    ['missing-home-completion',r=>r.results[6].evidence.observations[5].tailReach.scrollEvents.forEach(e=>{if(e.type==='scrollend'&&e.scrollTop===0)e.type='scroll';})],
    ['untrusted-touch-scroll',r=>r.results[7].evidence.tailReach.events.forEach(e=>e.trusted=false)],
    ['no-touch-proof',r=>r.results[7].evidence.actualTouchscreenTap=false],
    ['missing-edit-reading',r=>r.results[0].evidence.editReading=''],
    ['wrong-chrome',r=>r.browserEnvironment.browser='0.0.0.0'],
    ['wrong-playwright',r=>r.browserEnvironment.playwright='0.0.0'],
    ['wrong-browser-revision',r=>r.browserEnvironment.revision='other'],
    ['invalid-executable-hash',r=>r.browserEnvironment.executableSha256=''],
    ['missing-artifact',r=>r.artifacts.pop()],
    ['page-error',r=>r.pageErrors.push('injected error')],['wrong-os',r=>r.environment='other'],
  ];
  return changes.map(([id,change])=>{
    const forged=structuredClone(report); change(forged);
    assert.throws(()=>verifyChildLanguageUi(forged,inputs,environment),'negative must be rejected: '+id);
    return {id,status:'PASS',rejected:true};
  });
}
