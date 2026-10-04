import assert from 'node:assert/strict';
import {verifySemanticExtension} from './semantic-extension-contract.mjs';
import {browserEnvironment} from './browser-environment.mjs';

// Written from the repair request: source strings and answers are independent
// expectations, never copied from the product's regenerated source or execution.
export const shopping=['りんご','パン','牛乳'];
export const sourceFor=n=>`始めると、あかりは「買うもの」の${n}番目を2秒話します。`;
export const fixedFor=n=>`始めると、あかりは作品のリスト「買うもの」の${n}番目を2秒話します。`;
export const listRepairCases=[
 ...[1,2,3].map(n=>({id:'ordinal/'+n,source:sourceFor(n),fixed:fixedFor(n),speech:shopping[n-1]})),
 {id:'scope/project',source:sourceFor(2),fixed:fixedFor(2),speech:'パン',local:true,choose:0},
 {id:'scope/self',source:sourceFor(2),fixed:'始めると、あかりは自分のリスト「買うもの」の2番目を2秒話します。',speech:'ノート',local:true,choose:1},
 {id:'scope/parent-actor',source:'始めると、あかりは「準備」と言います。だんごは「買うもの」の2番目を2秒話します。',fixed:'始めると、あかりは「準備」と言います。だんごは自分のリスト「買うもの」の2番目を2秒話します。',speech:'ノート',dango:true,choose:1},
 {id:'scope/unit',source:'始めると、あかりは「準備」と言います。だんごも同じ合図で動き始め、「買うもの」の2番目を2秒話します。',fixed:'始めると、あかりは「準備」と言います。だんごも同じ合図で動き始め、自分のリスト「買うもの」の2番目を2秒話します。',speech:'ノート',dango:true,choose:1,documentAfter:{revision:1,unitIds:['unit-1','unit-2']}},
 {id:'scope/persistent-unit',source:'始めると、あかりは「準備」と言います。だんごも同じ合図で動き始め、「買うもの」の2番目を2秒話します。',fixed:'始めると、あかりは「準備」と言います。だんごも同じ合図で動き始め、自分のリスト「買うもの」の2番目を2秒話します。',speech:'ノート',dango:true,choose:1,documentBefore:{revision:7,unitIds:['first-event','second-event']},documentAfter:{revision:8,unitIds:['first-event','second-event']}},
 {id:'scope/stage',source:'始めると、あかりは「準備」と言います。画面も同じ合図で動き始め、点数を「買うもの」の2番目にします。',fixed:'始めると、あかりは「準備」と言います。画面も同じ合図で動き始め、点数を作品のリスト「買うもの」の2番目にします。',speech:null,local:true,documentAfter:{revision:1,unitIds:['unit-1','unit-2']}},
 {id:'range/multiple',source:'始めると、あかりは「買うもの」と言います。「買うもの」の2番目を2秒話します。「買うもの」の3番目を2秒話します。',fixed:'始めると、あかりは「買うもの」と言います。作品のリスト「買うもの」の2番目を2秒話します。「買うもの」の3番目を2秒話します。',speech:'パン'},
 {id:'range/wrapped',source:'※ '+'長い注釈🐈'.repeat(36)+'\n始めると、あかりは「買うもの」の2番目を2秒話します。\n※ ほかの文  空白',fixed:'※ '+'長い注釈🐈'.repeat(36)+'\n始めると、あかりは作品のリスト「買うもの」の2番目を2秒話します。\n※ ほかの文  空白',speech:'パン'},
 {id:'range/escape-html',name:'買う<もの>&',source:'始めると、あかりは「買う<もの>&」の2番目を2秒話します。',fixed:'始めると、あかりは作品のリスト「買う<もの>&」の2番目を2秒話します。',speech:'パン'},
 {id:'range/escape-backslash',name:'買う\\もの',source:'始めると、あかりは「買う\\\\もの」の2番目を2秒話します。',fixed:'始めると、あかりは作品のリスト「買う\\\\もの」の2番目を2秒話します。',speech:'パン'},
 {id:'range/alternate-quotes',source:'始めると、あかりは『買うもの』の2番目を2秒話します。',fixed:'始めると、あかりは作品のリスト「買うもの」の2番目を2秒話します。',speech:'パン'},
 {id:'range/out-of-bounds',source:sourceFor(4),fixed:fixedFor(4),error:'R404'},
];
export const listRepairIds=[...['1180x757','1188x848'].map(v=>'gui/'+v),...listRepairCases.map(c=>c.id),
 'cancel/close','cancel/panel','boundary/missing-name','boundary/empty-string','boundary/no-lists','boundary/ordinary-string','boundary/plain-evaluator',
 'stale/source-changed','stale/new-run','stale/new-project','stale/detached-handler','stale/older-record',
 'compat/explicit-list','compat/legacy-name','compat/block-picker'];
const stateSource=o=>o.project.scripts[0].source;
const sameData=(a,b)=>{assert.deepEqual(b.projectData,a.projectData);assert.deepEqual(b.components,a.components);assert.deepEqual(b.actions,a.actions);assert.deepEqual(b.functions,a.functions);};
function replacement(o,source,fixed,document){
 assert.equal(stateSource(o.before),source);assert.equal(o.after.project.scripts[0].source,fixed);
 assert.equal(o.before.source,source);assert.equal(o.after.source,fixed);
 const next=structuredClone(o.before.project);next.scripts[0].source=fixed;
 if(document)next.scripts[0].document=structuredClone(document);
 assert.deepEqual(o.after.project,next,'only the exact reference changes');
 assert.equal(o.failure.state,'PAUSED');assert.equal(o.failure.code,'R411');
 assert.deepEqual(o.failure.project,o.before.project);
 assert.equal(o.opened.state,'DESIGN');assert.deepEqual(o.opened.project,o.before.project);
 assert.equal(o.selected.source,source);assert.deepEqual(o.selected.project,o.before.project);
 assert.equal(o.selected.choice,String(o.choose));assert.match(o.opened.text,/ここは文字です/);
 assert.match(o.opened.text,/だけを変更/);assert.equal(o.opened.choice,'');assert.equal(o.opened.applyDisabled,true);
 assert.deepEqual(o.undo.project,o.before.project);assert.deepEqual(o.redo.project,o.after.project);
 assert.equal(o.undo.source,source);assert.equal(o.redo.source,fixed);
 sameData(o.before.project,o.after.project);
}
export function verifyListRepairReport(report){
 const n=verifySemanticExtension(report,'akari-ux-repair03-list-v1',listRepairIds);
 assert.ok(!report.hostFailure);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);
 assert.equal(report.environment.browser,browserEnvironment.version);assert.equal(report.environment.playwright,browserEnvironment.playwright);
 const at=id=>report.results.find(r=>r.id===id).observed;
 for(const id of ['gui/1180x757','gui/1188x848']){
  const o=at(id);replacement(o,sourceFor(2),fixedFor(2));assert.equal(o.setup,'pointer-keyboard-only');
  assert.deepEqual(o.before.project.projectData.lists.map(l=>[l.name,l.initialValue]),[['買うもの',shopping]]);
  assert.deepEqual(o.runtime.speech,['パン']);assert.equal(o.runtime.error,null);
  assert.deepEqual(o.opened.options,['使うリストを選ぶ','作品のリスト「買うもの」']);
  for(const r of o.geometry.controls){assert.ok(r.width>0&&r.height>0);assert.ok(r.left>=0&&r.right<=o.geometry.width&&r.top>=0&&r.bottom<=o.geometry.height);assert.equal(r.hit,true);}
 }
 for(const c of listRepairCases){const o=at(c.id);replacement(o,c.source,c.fixed,c.documentAfter);assert.equal(o.setup,'serialized-fixture-then-pointer-keyboard');
  assert.deepEqual(o.before.project.scripts[0].document,c.documentBefore);
  assert.equal(o.runtime.error,c.error||null);
  if(c.speech)assert.ok(o.runtime.speech.includes(c.speech));
  if(c.id==='scope/stage'){assert.deepEqual(o.opened.options,['使うリストを選ぶ','作品のリスト「買うもの」']);assert.equal(o.runtime.score,'パン');}
  if(c.local&&c.id!=='scope/stage')assert.deepEqual(o.opened.options,['使うリストを選ぶ','作品のリスト「買うもの」','あかりのリスト「買うもの」']);
  if(c.dango)assert.deepEqual(o.opened.options,['使うリストを選ぶ','作品のリスト「買うもの」','だんごのリスト「買うもの」']);
  if(c.id==='range/escape-html')assert.equal(o.injectedElements,0);
 }
 for(const id of ['cancel/close','cancel/panel']){const o=at(id);assert.deepEqual(o.after.project,o.before.project);assert.equal(o.after.history,o.before.history);assert.equal(o.panelCount,0);assert.equal(o.after.state,id==='cancel/close'?'PAUSED':'DESIGN');}
 for(const id of ['boundary/missing-name','boundary/empty-string']){const o=at(id);assert.equal(o.failure.code,'R411');assert.equal(o.opened.choice,'');assert.deepEqual(o.after.project,o.before.project);assert.deepEqual(o.opened.options,['使うリストを選ぶ','作品のリスト「買うもの」']);}
 {const o=at('boundary/no-lists');assert.equal(o.failure.code,'R411');assert.deepEqual(o.opened.options,['使うリストを選ぶ']);assert.equal(o.opened.selectDisabled,true);assert.equal(o.opened.applyDisabled,true);assert.match(o.opened.text,/使えるリストはありません/);assert.deepEqual(o.after.project,o.before.project);}
 {const o=at('boundary/ordinary-string');assert.deepEqual(o.runtime.speech,['買うもの']);assert.equal(o.runtime.error,null);assert.equal(o.repairCount,0);assert.deepEqual(o.after.project,o.before.project);}
 {const o=at('boundary/plain-evaluator');assert.deepEqual(o.errors,['R411','R411']);}
 {const o=at('stale/source-changed');const next=structuredClone(o.before.project);next.scripts[0].source=sourceFor(3);assert.deepEqual(o.after.project,next);assert.equal(o.applyDisabled,true);assert.match(o.notice,/本文.*変わっています/);}
 for(const id of ['stale/new-run','stale/new-project']){const o=at(id);assert.equal(o.panelCount,0);assert.equal(o.applyCount,0);assert.deepEqual(o.after.project,o.expectedProject);}
 {const o=at('stale/detached-handler');assert.equal(o.classification,'synthetic stale callback after pointer stop / pending keyboard input');assert.equal(o.inputBefore,'「未確定');assert.equal(o.inputAfter,o.inputBefore);assert.deepEqual(o.after,o.before);assert.equal(o.panelCount,0);}
 {const o=at('stale/older-record');assert.equal(o.recordCount,2);assert.equal(o.selectedRecord,'1');const next=structuredClone(o.before.project);next.scripts[0].source=fixedFor(1);assert.deepEqual(o.after.project,next);assert.equal(o.after.project.scripts[1].source,'「買うもの」の3番目を2秒話します。');}
 for(const [id,source] of [['compat/explicit-list','始めると、あかりはリスト「買うもの」の2番目を2秒話します。'],['compat/legacy-name','始めると、あかりは【買うもの】の2番目を2秒話します。']]){const o=at(id);assert.equal(o.after.project.scripts[0].source,source);assert.deepEqual(o.runtime.speech,['パン']);assert.equal(o.runtime.error,null);assert.equal(o.repairCount,0);}
 {const o=at('compat/block-picker');assert.equal(o.kind,'VariableRead');assert.equal(o.index,2);assert.deepEqual(o.runtime.speech,['パン']);sameData(o.before.project,o.after.project);}
 return n;
}
export const listRepairWrongMeaning=[
 ['wrong-answer',r=>r.results[0].observed.runtime.speech=['牛乳']],
 ['source-reformatted',r=>r.results[0].observed.after.project.scripts[0].source='作品のリスト「買うもの」の2番目を2秒話す。'],
 ['silent-conversion',r=>r.results[0].observed.failure.code=null],
 ['runtime-write',r=>r.results[0].observed.opened.state='PAUSED'],
 ['data-reordered',r=>r.results[0].observed.after.project.projectData.lists[0].initialValue.reverse()],
 ['selection-commits',r=>r.results[0].observed.selected.project.scripts[0].source=fixedFor(2)],
 ['undo-lost',r=>r.results[0].observed.undo.project.scripts[0].source=fixedFor(2)],
 ['scope-leak',r=>r.results.find(x=>x.id==='scope/stage').observed.opened.options.push('あかりのリスト「買うもの」')],
 ['stale-overwrite',r=>r.results.find(x=>x.id==='stale/source-changed').observed.after.project.scripts[0].source=fixedFor(2)],
 ['old-record-other-body',r=>r.results.find(x=>x.id==='stale/older-record').observed.after.project.scripts[1].source=fixedFor(3)],
 ['cancel-mutates',r=>r.results.find(x=>x.id==='cancel/panel').observed.after.project.scripts[0].source=fixedFor(2)],
 ['discard-pending',r=>r.results.find(x=>x.id==='stale/detached-handler').observed.inputAfter=sourceFor(2)],
 ['clipped-control',r=>r.results[0].observed.geometry.controls[0].right=2000],
 ['missing-result',r=>r.results.pop()],['duplicate-result',r=>r.results.push(structuredClone(r.results[0]))],
];
