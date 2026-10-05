import assert from 'node:assert/strict';
import {browserEnvironment} from './browser-environment.mjs';
import {previewCases,previewNames,previewShortTexts,previewLongTexts} from '../fixtures/speech-preview.mjs';
const inside=(r,b)=>r.width>0&&r.height>0&&r.left>=b.left-1&&r.top>=b.top-1&&r.right<=b.right+1&&r.bottom<=b.bottom+1;
const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
export function verifyPreviewObserved(id,o){
 const c=previewCases.find(c=>c.id===id);assert.ok(c);
 assert.equal(o.setup,'native new project, mascot and individual start-event inputs');
 assert.equal(o.interaction,'real pointer and keyboard');assert.equal(o.restored,!!c.restore);
 assert.deepEqual(o.viewport,{width:c.width,height:c.height});assert.equal(o.scale,c.scale);assert.equal(o.level,'basic');assert.equal(o.mode,'code');
 assert.equal(o.fontProfile,c.fullWidthFont?'full-width Japanese system font':'product default');
 assert.ok(['already-visible','pointer-wheel'].includes(o.sceneInput));
 const texts=c.kind==='short'?previewShortTexts:previewLongTexts,seconds=c.kind==='short'?2:10;
 assert.deepEqual(o.scripts.map(s=>[s.name,s.event,s.source]),texts.map((t,i)=>[previewNames[i],'start','「'+t+'」と'+seconds+'秒話す。']));
 assert.equal(o.bubbles.length,2);
 for(const [i,b] of o.bubbles.entries()){
  assert.equal(b.speaker,previewNames[i]);assert.equal(b.text,texts[i]);assert.ok(inside(b.rect,o.stage),'whole bubble inside stage');assert.ok(inside(b.rect,o.clip),'whole bubble in visible scene');
  assert.ok(b.heading.font>=11);assert.ok(b.font>=13.5);assert.ok(b.heading.height<=Math.max(b.heading.lineHeight,b.heading.minHeight)+1,'name stays on one line');
  assert.ok(b.heading.width+0.5>=b.heading.unwrappedWidth,'whole name fits');assert.ok(inside(b.heading.rect,b.rect));assert.ok(inside(b.heading.rect,o.stage));
  if(c.kind==='short'){
   assert.equal(b.full,false,'no unnecessary full-text button');assert.equal(b.reserve,0,'no unnecessary reservation');
   assert.ok(b.textBox.width>0&&b.textBox.height>0);assert.ok(b.scrollWidth<=b.clientWidth+1);
   // Font em boxes can overflow a line despite all painted pixels fitting.
   // Keep raw scroll/range evidence and additionally bound every actual glyph.
   assert.equal(b.glyphs.length,Array.from(texts[i]).length);
   for(const g of b.glyphs){assert.ok(inside(g,b.textBox),'painted glyph inside text box');assert.ok(inside(g,b.rect));assert.ok(inside(g,o.stage));}
  }else{assert.equal(Array.from(b.text).length,78);assert.equal(b.full,true);assert.ok(inside(b.fullBox,b.rect));assert.ok(inside(b.fullBox,o.clip));}
 }
 assert.ok(overlap(o.bubbles[0].rect,o.bubbles[1].rect)<=1,'whole bubbles do not overlap');
 if(c.fullWidthFont&&c.kind==='short')assert.equal(o.bubbles[0].layout,'grid','exercise the row layout that failed');
 if(c.kind==='short'){
  assert.deepEqual(o.events.map(e=>[e.kind,e.speaker,e.text]),[['add','あかり','あか'],['add','だんご','あお'],['remove','あかり','あか'],['remove','だんご','あお']]);
  const [a,b,d,e]=o.events;assert.ok(b.at-a.at>=0&&b.at-a.at<=150,'individual starts run together');
  for(const duration of[d.at-a.at,e.at-b.at])assert.ok(duration>=1850&&duration<=2400,'actual two-second speech');
 }else{
  assert.equal(o.readingFixtureSeconds,10);assert.equal(o.openings.length,2);
  for(const [i,d] of o.openings.entries()){
   assert.equal(d.input,i===0?'pointer':'keyboard');assert.equal(d.title,previewNames[i]+'の発話（全文）');assert.equal(d.text,texts[i]);assert.equal(d.selected,texts[i]);
   assert.equal(d.labelledby,'valueTitle');assert.equal(d.closed,true);assert.equal(d.closeInput,i===0?'pointer':'keyboard');
   for(const e of[d.titleBox,d.bodyBox,d.closeBox]){assert.ok(e.font>=13);assert.ok(inside(e.rect,d.dialog));assert.ok(inside(e.rect,d.viewport));assert.ok(e.scrollWidth<=e.clientWidth+1);assert.ok(e.scrollHeight<=e.clientHeight+1);}
  }
 }
}
export function verifyPreviewReport(r,inputs){
 assert.equal(r.schema,'akari-speech-preview-v1');assert.equal(r.status,'PASS');assert.equal(r.uxAcceptance,false);assert.ok(!r.hostFailure);
 assert.deepEqual(r.snapshot,inputs);assert.deepEqual(r.endSnapshot,inputs);assert.equal(r.environment.browser,browserEnvironment.version);assert.equal(r.environment.playwright,browserEnvironment.playwright);assert.ok(['win32','linux'].includes(r.environment.os));
 assert.deepEqual(r.pageErrors,[]);assert.deepEqual(r.networkRequests,[]);assert.deepEqual(r.results.map(x=>x.id).sort(),previewCases.map(c=>c.id).sort());
 for(const x of r.results){assert.equal(x.status,'PASS');assert.ok(!x.error);assert.ok(x.screenshot);verifyPreviewObserved(x.id,x.observed);}return r.results.length;
}
