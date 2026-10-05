import assert from 'node:assert/strict';
import {browserEnvironment} from './browser-environment.mjs';
import {speechNameLayoutCases,speechNameNames,speechNameShortTexts,speechNameLongTexts,speechNameSource,speechNamePositions} from '../fixtures/speech-name-layout.mjs';
export const speechNameLayoutIds=speechNameLayoutCases.map(c=>c.id);
const inside=(r,b)=>r.left>=b.left-1&&r.top>=b.top-1&&r.right<=b.right+1&&r.bottom<=b.bottom+1;
const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
function shortName(b){
 assert.ok(b.heading.font>=11,'retain the existing readable speaker size');
 assert.ok(b.heading.height<=Math.max(b.heading.lineHeight,b.heading.minHeight)+1,'short speaker stays on one line: '+b.speaker);
 assert.ok(b.heading.width+0.5>=b.heading.unwrappedWidth,'the whole short name fits: '+b.speaker);
 assert.ok(inside(b.heading.rect,b.rect),'speaker heading stays in its bubble');
 assert.ok(inside(b.heading.rect,b.stage),'speaker heading stays in the stage');
}
export function verifySpeechNameLayoutObserved(id,o){
 const c=speechNameLayoutCases.find(c=>c.id===id);assert.ok(c,'registered speech-name case');
 assert.equal(o.fixtureSetup,'internal serialization; UI file import');assert.equal(o.interaction,'real pointer and keyboard');
 if(!c.nativeZoom)assert.deepEqual(o.viewport,{width:c.width,height:c.height});
 if(c.scale==='fit')assert.ok(o.scale>0&&o.scale<=100);else assert.equal(o.scale,c.scale);
 assert.deepEqual(o.positions,c.positions||speechNamePositions);
 assert.deepEqual(o.mascots,[{id:'sprite-1',width:180,height:180,scale:100},{id:'dango',width:180,height:180,scale:100}]);
 const texts=c.kind==='long'?speechNameLongTexts:speechNameShortTexts;
 assert.deepEqual(o.bubbles.map(b=>[b.id,b.speaker,b.text]),[['sprite-1',speechNameNames[0],texts[0]],['dango',speechNameNames[1],texts[1]]]);
 for(const b of o.bubbles){shortName(b);assert.ok(b.font>=13.5,'speech size retained');}
 if(c.kind==='short'){
  assert.equal(o.source,speechNameSource);
  for(const b of o.bubbles){assert.equal(b.clipped,false,'short text not clipped');assert.equal(b.full,false);assert.ok(inside(b.ink,b.textBox));assert.ok(inside(b.ink,b.stage),'short text stays in the stage');}
  for(const[a,b]of[[o.bubbles[0],o.bubbles[1]]]){assert.ok(overlap(a.heading.rect,b.heading.rect)<=1,'speakers remain visually separate');assert.ok(overlap(a.ink,b.ink)<=1,'short utterances remain visually separate');}
  assert.deepEqual(o.reachability.map(r=>r.id),['sprite-1','dango']);
  for(const r of o.reachability){assert.ok(['already-visible','pointer-wheel'].includes(r.input));assert.ok(inside(r.heading,r.clip),'speaker reachable within the scene window');assert.ok(inside(r.ink,r.clip),'utterance reachable within the scene window');}
  assert.deepEqual(o.events.map(e=>[e.kind,e.id,e.text]),[['add','sprite-1','あか'],['add','dango','あお'],['remove','sprite-1','あか'],['remove','dango','あお']]);
  const [a,b,c,d]=o.events;assert.ok(b.at-a.at>=900&&b.at-a.at<=1200,'original one-second wait');
  for(const duration of [c.at-a.at,d.at-b.at])assert.ok(duration>=1850&&duration<=2400,'original two-second speech');
 }else{
  assert.deepEqual(o.lengths,[78,78]);assert.equal(o.readingFixtureSeconds,10,'separate existing reading fixture, not a substitute for B10');
  assert.equal(o.openings.length,2);
  for(const [i,d]of o.openings.entries()){
   assert.equal(d.input,i===0?'pointer':'keyboard');assert.equal(d.title,`${speechNameNames[i]}の発話（全文）`);assert.equal(d.text,texts[i]);assert.equal(d.selected,texts[i]);assert.equal(d.labelledby,'valueTitle');assert.equal(d.closed,true);
   for(const e of [d.titleBox,d.bodyBox,d.closeBox]){assert.ok(inside(e.rect,d.dialog));assert.ok(inside(e.rect,d.viewport));assert.ok(inside(e.ink,e.rect));assert.ok(e.font>=13);assert.ok(e.scrollWidth<=e.clientWidth+1);assert.ok(e.scrollHeight<=e.clientHeight+1);}
  }
 }
 if(c.nativeZoom){assert.equal(o.nativeZoom.method,'Chrome appearance page select#zoomLevel');assert.equal(o.nativeZoom.setting,'1.25');assert.equal(o.nativeZoom.ratio,1.25);assert.ok(Math.abs(o.nativeZoom.after.dpr/o.nativeZoom.before.dpr-1.25)<0.02,'native browser zoom, not CSS emulation');assert.equal(o.nativeZoom.after.visualScale,1);}
}
export function verifySpeechNameLayoutReport(r,expectedSnapshot){
 assert.equal(r.schema,'akari-speech-name-layout-v1');assert.equal(r.status,'PASS');assert.ok(!r.hostFailure);
 assert.deepEqual(r.snapshot,expectedSnapshot);assert.deepEqual(r.endSnapshot,expectedSnapshot);
 assert.equal(r.environment.browser,browserEnvironment.version);assert.equal(r.environment.playwright,browserEnvironment.playwright);assert.ok(['win32','linux'].includes(r.environment.os));
 assert.deepEqual(r.pageErrors,[]);assert.deepEqual(r.networkRequests,[]);
 assert.deepEqual(r.results.map(x=>x.id).sort(),[...speechNameLayoutIds].sort());
 for(const row of r.results){assert.equal(row.status,'PASS');assert.ok(!row.error);assert.ok(row.screenshot);verifySpeechNameLayoutObserved(row.id,row.observed);}
 return r.results.length;
}
