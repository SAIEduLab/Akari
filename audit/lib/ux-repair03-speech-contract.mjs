import assert from 'node:assert/strict';
import {verifySemanticExtension} from './semantic-extension-contract.mjs';
import {browserEnvironment} from './browser-environment.mjs';

// Independent requirements: these inputs and expected strings are not read from product output.
export const speechTexts=['赤い花が咲いた。'.repeat(9)+'見えますか。','青い鳥が飛んだ。'.repeat(9)+'聞こえます。'];
export const multilineTexts=speechTexts.map(t=>t.slice(0,26)+'\n'+t.slice(27));
export const ordinaryNames=['あかり','だんご'];
export const unicodeNames=['長い赤いねこ🐈e\u0301','長い青いとり🐦é'].map(n=>Array.from(n.repeat(12)).slice(0,80).join(''));
export const speechViews=[{width:1180,height:757,scale:28},{width:1180,height:757,scale:100},{width:1188,height:848,scale:29},{width:1188,height:848,scale:100}];
export const speechLayoutCases=speechViews.flatMap(v=>['ordinary','unicode'].map(names=>({...v,names,id:`speech/full/${v.width}x${v.height}/${v.scale}/${names}`})));
export const b10Source='始めると、あかりはすぐに『あか』と2秒話します。だんごも同じ合図で動き始め、1秒待ってから『あお』と2秒話します。';
export const speechIds=[...speechLayoutCases.map(c=>c.id),'speech/plain-78/switch-and-rerun',...speechViews.map(v=>`speech/B10/${v.width}x${v.height}/${v.scale}`),'speech/snapshot-update-clear','speech/stop-and-rerun','speech/clone-identity','speech/duplicate-name-refusal','speech/general-value-and-list','speech/pagination-and-copy'];
const inside=(r,b)=>r.left>=b.left-1&&r.top>=b.top-1&&r.right<=b.right+1&&r.bottom<=b.bottom+1;
function readable(e){
 assert.ok(e&&typeof e==='object');assert.ok(e.rect.width>0&&e.rect.height>0);assert.ok(e.font>=13);
 assert.ok(e.scrollWidth<=e.clientWidth+1,'no horizontal clipping');assert.ok(e.scrollHeight<=e.clientHeight+1,'no vertical clipping');
 assert.ok(inside(e.ink,e.rect),'text ink remains inside its box');
}
function dialog(d,title,body){
 assert.equal(d.open,true);assert.equal(d.title.text,title);assert.equal(d.body.text,body);assert.equal(d.close.text,'閉じる');
 assert.equal(d.labelledby,'valueTitle');assert.equal(d.accessibleName,title);assert.equal(d.listControls,false);
 for(const e of [d.title,d.body,d.close]){readable(e);assert.ok(inside(e.rect,d.viewport));assert.ok(inside(e.rect,d.dialog));}
 assert.ok(d.title.rect.bottom<=d.body.rect.top);assert.ok(d.body.rect.bottom<=d.close.rect.top);
}
function pair(o,names,texts){
 assert.deepEqual(o.bubbles.map(b=>[b.id,b.speaker,b.text]),[['sprite-1',names[0],texts[0]],['dango',names[1],texts[1]]]);
 assert.equal(o.openings.length,2);
 for(let i=0;i<2;i++){
  const opening=o.openings[i];assert.equal(opening.input,i===0?'pointer':'keyboard');dialog(opening.dialog,`${names[i]}の発話（全文）`,texts[i]);assert.equal(opening.selectedText,texts[i]);assert.equal(opening.closed,true);
  assert.ok(['copied','unavailable'].includes(opening.clipboard.status));
  // Preserve raw evidence: native Windows clipboard text uses CRLF; the DOM and selection above must retain the original LF.
  if(opening.clipboard.status==='copied')assert.equal(opening.clipboard.text,process.platform==='win32'?texts[i].replaceAll('\n','\r\n'):texts[i]);else assert.ok(opening.clipboard.reason);
 }
}
export function verifySpeechObserved(id,o){
 assert.equal(o.fixtureSetup,'internal API serialization; UI file import');assert.equal(o.interaction,'real pointer and keyboard');
 const c=speechLayoutCases.find(c=>c.id===id);
 if(c){assert.deepEqual(o.viewport,{width:c.width,height:c.height});assert.equal(o.scale,c.scale);pair(o,c.names==='ordinary'?ordinaryNames:unicodeNames,c.scale===100?multilineTexts:speechTexts);}
 else if(id==='speech/plain-78/switch-and-rerun'){
  assert.deepEqual(o.lengths,[78,78]);assert.equal(o.runs.length,2);for(const r of o.runs)pair(r,ordinaryNames,speechTexts);
 }
 else if(id.startsWith('speech/B10/')){
  const v=speechViews.find(v=>id===`speech/B10/${v.width}x${v.height}/${v.scale}`);assert.equal(o.scale,v.scale);assert.equal(o.source,b10Source);
  assert.deepEqual(o.bubbles.map(b=>[b.id,b.speaker,b.text]),[['sprite-1','あかり','あか'],['dango','だんご','あお']]);
  for(const b of o.bubbles){assert.equal(b.full,false);assert.ok(b.font>=13.5);assert.equal(b.clipped,false);assert.ok(inside(b.ink,b.textBox));}
  assert.deepEqual(o.events.map(e=>[e.kind,e.id,e.text]),[['add','sprite-1','あか'],['add','dango','あお'],['remove','sprite-1','あか'],['remove','dango','あお']]);
  const [a,b,c,d]=o.events;assert.ok(b.at-a.at>=900&&b.at-a.at<=1200);for(const duration of [c.at-a.at,d.at-b.at])assert.ok(duration>=1850&&duration<=2400);
 }
 else if(id==='speech/snapshot-update-clear'){
  dialog(o.initial,'あかりの発話（全文）',speechTexts[0]);dialog(o.afterUpdate,'あかりの発話（全文）',speechTexts[0]);dialog(o.afterClear,'あかりの発話（全文）',speechTexts[0]);
  assert.deepEqual(o.updatedBubbles.map(b=>[b.id,b.text]),[['dango',multilineTexts[1]],['sprite-1',speechTexts[1]]]);assert.deepEqual(o.clearedBubbles.map(b=>[b.id,b.text]),[['dango',multilineTexts[1]]]);
  dialog(o.other,'だんごの発話（全文）',multilineTexts[1]);
 }
 else if(id==='speech/stop-and-rerun'){
  dialog(o.initial,'あかりの発話（全文）',speechTexts[0]);assert.equal(o.afterStop.open,false);assert.equal(o.afterStop.bubbles,0);assert.equal(o.afterStop.runState,'停止中');
  dialog(o.rerun,'だんごの発話（全文）',speechTexts[1]);assert.equal(o.afterUiStop.open,false);assert.equal(o.afterUiStop.bubbles,0);assert.equal(o.afterUiStop.runState,'停止中');
 }
 else if(id==='speech/clone-identity'){
  assert.deepEqual(o.bubbles.map(b=>[b.id,b.speaker,b.text]),[['sprite-1','あかり',speechTexts[0]],['sprite-1-clone-3','あかり',speechTexts[1]]]);
  dialog(o.original,'あかりの発話（全文）',speechTexts[0]);dialog(o.clone,'あかり（クローン: sprite-1-clone-3）の発話（全文）',speechTexts[1]);
 }
 else if(id==='speech/duplicate-name-refusal'){
  assert.equal(o.error.code,'F503');assert.match(o.error.message,/部品名.*重複/);assert.deepEqual(o.namesBefore,ordinaryNames);assert.deepEqual(o.namesAfter,ordinaryNames);
 }
 else if(id==='speech/general-value-and-list'){
  assert.equal(o.string.title.text,'文章');assert.equal(o.string.body.text,'値'.repeat(170));assert.equal(o.string.accessibleName,'文章');assert.equal(o.string.listControls,false);
  assert.equal(o.list.title.text,'買うもの');assert.equal(o.list.body.text,'りんご');assert.equal(o.list.accessibleName,'買うもの');assert.equal(o.list.listControls,true);
  assert.equal(o.next.title.text,'買うもの');assert.equal(o.next.body.text,'パン');assert.equal(o.next.listControls,true);
  for(const d of [o.string,o.list,o.next]){assert.equal(d.open,true);assert.equal(d.title.text.includes('発話'),false);assert.equal(d.labelledby,'valueTitle');}
 }
 else if(id==='speech/pagination-and-copy'){
  const text='🐈e\u0301赤'.repeat(2001),first=Array.from(text).slice(0,8000).join(''),last=Array.from(text).slice(8000).join('');
  assert.equal(o.first.title,'あかりの発話（全文）');assert.equal(o.first.body,first);assert.equal(o.first.selected,first);assert.equal(o.first.page,'1 / 2');
  assert.equal(o.second.title,'あかりの発話（全文）');assert.equal(o.second.body,last);assert.equal(o.second.selected,last);assert.equal(o.second.page,'2 / 2');assert.equal(o.raw,text);
 }
 else assert.fail('Unregistered speech observation '+id);
}
export function verifySpeechReport(r){
 const n=verifySemanticExtension(r,'akari-ux-repair03-speech-v1',speechIds);
 assert.ok(!r.hostFailure);assert.equal(r.environment.browser,browserEnvironment.version);assert.equal(r.environment.playwright,browserEnvironment.playwright);
 assert.deepEqual(r.pageErrors,[]);assert.deepEqual(r.networkRequests,[]);
 for(const row of r.results)verifySpeechObserved(row.id,row.observed);
 return n;
}
export const speechWrongMeaning=[
 ['speaker-missing',r=>{r.results[0].observed.openings[0].dialog.title.text='吹出しの全文';}],
 ['other-speaker-body',r=>{r.results[0].observed.openings[1].dialog.body.text=speechTexts[0];}],
 ['copy-adds-name',r=>{r.results[0].observed.openings[0].selectedText='あかり：'+speechTexts[0];}],
 ['speaker-clipped',r=>{r.results[1].observed.openings[0].dialog.title.scrollWidth+=1000;}],
 ['stale-pair-after-update',r=>{r.results.find(x=>x.id==='speech/snapshot-update-clear').observed.afterUpdate.body.text=speechTexts[1];}],
 ['stop-retains-dialog',r=>{r.results.find(x=>x.id==='speech/stop-and-rerun').observed.afterStop.open=true;}],
 ['clone-unidentified',r=>{r.results.find(x=>x.id==='speech/clone-identity').observed.clone.title.text='あかりの発話（全文）';}],
 ['generic-value-labelled-speech',r=>{r.results.find(x=>x.id==='speech/general-value-and-list').observed.list.title.text='だんごの発話（全文）';}],
 ['B10-time-extended',r=>{r.results.find(x=>x.id.startsWith('speech/B10/')).observed.events[2].at+=1000;}],
 ['short-speech-clipped',r=>{r.results.find(x=>x.id.startsWith('speech/B10/')).observed.bubbles[0].clipped=true;}],
 ['rerun-missing',r=>{r.results.find(x=>x.id==='speech/plain-78/switch-and-rerun').observed.runs.pop();}],
 ['page-loses-speaker',r=>{r.results.find(x=>x.id==='speech/pagination-and-copy').observed.second.title='吹出しの全文';}],
];
