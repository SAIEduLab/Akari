import {repairInputs} from './ux-repair02-contract.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifySemanticExtension} from './semantic-extension-contract.mjs';
import {snapshot} from './product-test-host.mjs';
import {currentProductFile} from './product-path.cjs';
import {browserEnvironment} from './browser-environment.mjs';
const originals=JSON.parse(fs.readFileSync(new URL('../fixtures/ux-repair-expectations.json',import.meta.url))).cases;
export const uxLanguageIds=[...originals.map(c=>c.id+'/original-acceptance-meaning-result'),
 ...[[9,2],[12,5],[1,7]].map(([a,b])=>`variants/arithmetic/${a}/${b}`),'timed/same-actor-overlap','source/edit-second-event-preserves-first',
 ...['「ほし」と。※始めると、だんご','全角１２３＋と空 白','一行目\n  二行目'].map(v=>'quotes/'+v),
 ...['「値」と－1秒話す。','「値」と1歩秒話す。'].map(v=>'timed/atomic-rejection/'+v),
 ...['これを2回くり返します。','だんごも同じ合図で動き始め、1秒待ちます。','くり返しが終わると、あかりは「終」と1秒話します。'].map(v=>'refusal/'+v),
 'compatibility/actor-named-今','variants/actor-condition/こはる','variants/actor-condition/星','timed/mixed-and-stop','timed/pause-resume'];
export const uxBrowserIds=['UX02/staged-heading','UX04/direct-count','UX11/operator-keeps-operands','UX11/condition-values-and-branches','UX01-10/else-hole-and-run-focus',
 'UX06-18/timed-and-data-speech','UX05-08/search-scope-help','UX12/data-in-wide-workspace','UX07-09/insertion-and-expression-geometry',
 'UX14/code-space-and-candidates','UX15/concurrent-bubbles','UX17/basic-live-monitor','UX02/code-heading-route','UX06/B05-real-display-timing',
 'UX16/question-ほし','UX16/question-つき','UX14/B24-code-delete-undo-false','UX14/B24-code-delete-undo-true',
 ...originals.map(c=>'UX13/original-'+c.id),'UX13/B23-fixed-initial-state','UX13/B23-import-cancel','UX13/B23-conflict-explicit-separate','UX13/intentional-duplicate-bodies-run','UX13/selected-body-conflict-preserved','UX13/explicit-current-document-edit','UX13/dependent-import-refuses-split'];
export function verifyUxLanguage(report){
 const count=verifySemanticExtension(report,'akari-ux-repair-language-v1',uxLanguageIds);
 for(const c of originals){const observed=report.results.find(r=>r.id===c.id+'/original-acceptance-meaning-result').observed;assert.equal(observed.originalSource,c.source);assert.equal(observed.originalSourcePreserved,true);assert.equal(observed.blockRoundtrip,true);assert.equal(observed.formatRoundtrip,true);}
 const compatibility=report.results.find(r=>r.id==='compatibility/actor-named-今').observed;assert.equal(compatibility.actorNamePreserved,true);assert.deepEqual(compatibility.current,[[0,'dango','7']]);assert.deepEqual(compatibility.previous,compatibility.current);
 return count;
}
export function verifyUxBrowser(report){
 const count=verifySemanticExtension(report,'akari-ux-repair-browser-v1',uxBrowserIds);assert.ok(!report.hostFailure);assert.equal(report.environment.browser,browserEnvironment.version);assert.equal(report.environment.playwright,browserEnvironment.playwright);
 for(const c of originals){const observed=report.results.find(r=>r.id==='UX13/original-'+c.id).observed;assert.equal(observed.original,c.source);assert.equal(observed.accepted,true);assert.equal(observed.sourceExact,true);assert.equal(observed.codeBlockRoundtrip,true);}
 const get=id=>report.results.find(r=>r.id===id).observed;
 assert.deepEqual(get('UX07-09/insertion-and-expression-geometry').operandEdits,[[8,3],[8,9]]);assert.equal(get('UX07-09/insertion-and-expression-geometry').otherOperandPreserved,true);
 const condition=get('UX11/condition-values-and-branches');assert.equal(condition.otherOperandPreserved,true);assert.equal(condition.undoRedo,true);assert.deepEqual(condition.results,[{operands:[3,3],speech:'はい'},{operands:[4,3],speech:'いいえ'},{operands:[4,4],speech:'はい'}]);
 const hole=get('UX01-10/else-hole-and-run-focus');for(const key of ['hole','runBlocked','focused','noToolbarOverlap','undo','completedThroughVisibleHole'])assert.equal(hole[key],true);assert.deepEqual(hole.bothBranches,[{answer:'ほし',speech:'はい'},{answer:'つき',speech:'直せた'}]);
 const edited=get('UX13/explicit-current-document-edit');for(const key of ['currentBodyChangedExplicitly','stableId','otherBodyUnchanged','differencesVisible','undoRedo'])assert.equal(edited[key],true);assert.deepEqual(edited.actual,[{actor:'sprite-1',text:'おはよう'},{actor:'dango',text:'新しい返事'},{actor:'sprite-1',text:'あかりも'}]);
 const importSource='だんごがクリックされると、だんごは『新しい返事』と2秒話します。あかりがクリックされると、あかりは『あかりも』と2秒話します。';assert.equal(edited.source,importSource);
 assert.deepEqual(edited.historyBoundary?.map(x=>x.delayMs),[0,320]);
 for(const boundary of edited.historyBoundary){
  assert.equal(boundary.old,'「前の返事」と2秒話す。');assert.equal(boundary.source,importSource);
  assert.ok(Number.isFinite(boundary.elapsedBeforeConfirmMs));assert.ok(boundary.delayMs===0?boundary.elapsedBeforeConfirmMs>=0&&boundary.elapsedBeforeConfirmMs<250:boundary.elapsedBeforeConfirmMs>=250);
  for(const value of [boundary.baseline,boundary.pending,boundary.cancelled,boundary.committed,boundary.undone,boundary.redone,boundary.restored,boundary.restoredUndo,boundary.restoredRedo])assert.equal(value.ownerKey,'script:dango-click');
  assert.equal(boundary.pending.pending.kind,'source-import');assert.equal(boundary.pending.pending.ownerKey,'script:dango-click');assert.equal(boundary.pending.pending.value,boundary.source);assert.equal(boundary.pending.project,boundary.baseline.project);
  for(const value of [boundary.baseline,boundary.cancelled,boundary.undone,boundary.restoredUndo]){assert.equal(value.project,boundary.baseline.project);assert.equal(value.source,boundary.old);assert.equal(value.text,boundary.old);assert.equal(value.pending,null);assert.equal(value.selectedScriptId,'dango-click');}
  assert.equal(boundary.cancelled.history,boundary.baseline.history);
  for(const value of [boundary.committed,boundary.redone,boundary.restored,boundary.restoredRedo]){assert.equal(value.project,boundary.committed.project);assert.equal(value.source,boundary.source);assert.equal(value.text,boundary.source);assert.equal(value.pending,null);assert.equal(value.selectedScriptId,'dango-click');}
  const previous=JSON.parse(boundary.baseline.project),next=JSON.parse(boundary.committed.project),before=previous.scripts.find(x=>x.id==='dango-click'),after=next.scripts.find(x=>x.id==='dango-click');assert.equal(before.source,boundary.old);assert.equal(after.source,importSource);assert.equal(next.scripts.length,previous.scripts.length);
  const stableRow=({source,document,...row})=>row;assert.deepEqual(stableRow(after),stableRow(before));assert.equal(before.document,undefined);assert.deepEqual(after.document,{revision:1,unitIds:['unit-1','unit-2']});
  assert.deepEqual({...next,scripts:next.scripts.filter(x=>x.id!=='dango-click')},{...previous,scripts:previous.scripts.filter(x=>x.id!=='dango-click')});
 }
 const selected=get('UX13/selected-body-conflict-preserved');for(const key of ['noSilentReplace','cancelAtomic','existingBodiesUnchanged','undoRedo','existingDocumentEdit'])assert.equal(selected[key],true);assert.equal(selected.clickBodies,2);assert.deepEqual(selected.actual,[{actor:'dango',text:'だんごの既存'},{actor:'dango',text:'なあに？'}]);
 const b23=get('UX13/B23-fixed-initial-state');assert.equal(b23.original,originals.find(c=>c.id==='B23').source);assert.equal(b23.existingStartUnchanged,true);assert.equal(b23.noDuplicateStart,true);for(const key of ['draftContextUnchanged','explicitImport','sourceOwnershipMatches','undoRedo','autosaveRestored'])assert.equal(b23[key],true);assert.deepEqual(b23.actual,[{actor:'sprite-1',text:'おはよう'},{actor:'dango',text:'なあに？'}]);const cancel=get('UX13/B23-import-cancel');for(const key of ['cancelAtomic','contextPreserved','historyPreserved'])assert.equal(cancel[key],true);const conflict=get('UX13/B23-conflict-explicit-separate');for(const key of ['noSilentReplace','differenceShown','cancel','explicitSeparate','existingStartUnchanged'])assert.equal(conflict[key],true);const duplicate=get('UX13/intentional-duplicate-bodies-run');assert.equal(duplicate.scriptCount,2);assert.equal(duplicate.bothExecuted,true);const dependent=get('UX13/dependent-import-refuses-split');for(const key of ['unsafeSplitRefused','noSourceRewrite','cancelAtomic'])assert.equal(dependent[key],true);
 return count;
}
export function verifyUxBubbles(report){
 assert.equal(report.schema,'akari-bubble-layout-v1');assert.equal(report.status,'PASS');assert.equal(report.uxAcceptance,false);assert.equal(report.hostError,null);assert.deepEqual(report.snapshot,snapshot(currentProductFile()));assert.equal(report.browser,browserEnvironment.version);
 assert.deepEqual(report.results.map(r=>r.id),['long-52','long-100','boundary-60','boundary-70','boundary-80','boundary-29-78']);
 for(const r of report.results){assert.equal(r.noOverlap,true);assert.equal(r.fullTextExact,true);assert.equal(r.overlaps.bubbles,0);assert.ok(r.overlaps.actors.flat().every(x=>x===0));assert.ok(Math.abs(r.geometry.scale-Number(r.mode)/100)<.006);assert.equal(r.geometry.bubbles.length,2);assert.ok(r.geometry.bubbles.every(b=>b.speechTextOnly&&b.fullEntryPaint.includes('全文')));assert.ok(r.geometry.bubbles.every(b=>b.font>=13.5));if(r.length){assert.ok(r.geometry.bubbles.some(b=>b.clipped));assert.ok(r.geometry.bubbles.filter(b=>b.clipped).every(b=>b.fullEntryVisible));}}
 return report.results.length;
}
export const uxRepairInputs=[['ux-repair-language.json',verifyUxLanguage],['ux-repair-browser.json',verifyUxBrowser],['ux-bubble-layout.json',verifyUxBubbles],...repairInputs];
export function verifyUxRepairInputs(read){return uxRepairInputs.map(([file,verify])=>({file,cases:verify(read(file))}));}
