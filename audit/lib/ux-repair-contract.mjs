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
export const uxBrowserIds=['UX02/staged-heading','UX04/direct-count','UX11/operator-keeps-operands','UX01-10/else-hole-and-run-focus',
 'UX06-18/timed-and-data-speech','UX05-08/search-scope-help','UX12/data-in-wide-workspace','UX07-09/insertion-and-expression-geometry',
 'UX14/code-space-and-candidates','UX15/concurrent-bubbles','UX17/basic-live-monitor','UX02/code-heading-route','UX06/B05-real-display-timing',
 'UX16/question-ほし','UX16/question-つき','UX14/B24-code-delete-undo-false','UX14/B24-code-delete-undo-true',
 ...originals.map(c=>'UX13/original-'+c.id),'UX13/B23-fixed-initial-state'];
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
 const hole=get('UX01-10/else-hole-and-run-focus');for(const key of ['hole','runBlocked','focused','noToolbarOverlap','undo','completedThroughVisibleHole'])assert.equal(hole[key],true);assert.deepEqual(hole.bothBranches,[{answer:'ほし',speech:'はい'},{answer:'つき',speech:'直せた'}]);
 const b23=get('UX13/B23-fixed-initial-state');assert.equal(b23.original,originals.find(c=>c.id==='B23').source);assert.equal(b23.existingStartUnchanged,true);assert.equal(b23.noDuplicateStart,true);
 return count;
}
export function verifyUxBubbles(report){
 assert.equal(report.schema,'akari-bubble-layout-v1');assert.equal(report.status,'PASS');assert.equal(report.uxAcceptance,false);assert.equal(report.hostError,null);assert.deepEqual(report.snapshot,snapshot(currentProductFile()));assert.equal(report.browser,browserEnvironment.version);
 assert.deepEqual(report.results.map(r=>r.id),['long-52','long-100','boundary-60','boundary-70','boundary-80','boundary-29-78']);
 for(const r of report.results){if(r.mode!=='29')assert.equal(r.noOverlap,true);assert.equal(r.fullTextExact,true);if(r.mode!=='29'){assert.equal(r.overlaps.bubbles,0);assert.ok(r.overlaps.actors.flat().every(x=>x===0));}assert.ok(Math.abs(r.geometry.scale-Number(r.mode)/100)<.006);assert.equal(r.geometry.bubbles.length,2);assert.ok(r.geometry.bubbles.every(b=>b.font>=13.5));if(r.length){assert.ok(r.geometry.bubbles.some(b=>b.clipped));assert.ok(r.geometry.bubbles.filter(b=>b.clipped).every(b=>b.fullEntryVisible));}}
 return report.results.length;
}
export const uxRepairInputs=[['ux-repair-language.json',verifyUxLanguage],['ux-repair-browser.json',verifyUxBrowser],['ux-bubble-layout.json',verifyUxBubbles]];
export function verifyUxRepairInputs(read){return uxRepairInputs.map(([file,verify])=>({file,cases:verify(read(file))}));}
