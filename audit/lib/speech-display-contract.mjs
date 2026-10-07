import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {sha} from './product-test-host.mjs';
import {browserEnvironment} from './browser-environment.mjs';

export const displayIds=['DISPLAY-SETTINGS','DISPLAY-PERSISTENCE','DISPLAY-BUBBLES','DISPLAY-DURATION','DISPLAY-OBJECT-NAMES','DISPLAY-NATIVE-ZOOM','DISPLAY-INVALID'];
export const rejectionIds=['missing','duplicate','failed','snapshot','browser','network','page-error','heading','clipping','saved-setting','object-name','fake-zoom','artifact'];
export const displayTexts={short:['あか','あお'],long:['赤い花が咲いた。'.repeat(9)+'見えますか。','青い鳥が飛んだ。'.repeat(9)+'聞こえます。']};
export const displayNames=['あかり','だんご'];
export const actionNames=['マスコット','とても長い名前のマスコット'.repeat(4)];
export const bubbleCases=[false,true].flatMap(show=>['short','long'].flatMap(kind=>[1180,390].flatMap(width=>[10,30,100,200].map(scale=>({id:`${show}/${kind}/${width}/${scale}`,show,kind,width,scale})))));
export const actionCases=['code','blocks'].flatMap(mode=>['basic','advanced'].flatMap(level=>[1366,390,320].flatMap(width=>actionNames.map((name,index)=>({id:`${mode}/${level}/${width}/${index}`,mode,level,width,name})))));
const inside=(a,b)=>{for(const k of ['left','right','top','bottom'])assert.ok(Number.isFinite(a[k])&&Number.isFinite(b[k]),k);assert.ok(b.width>0&&b.height>0);assert.ok(b.left>=a.left-1&&b.top>=a.top-1&&b.right<=a.right+1&&b.bottom<=a.bottom+1,JSON.stringify({a,b}));};
export function verifyBubbles(o,show,kind){
  assert.equal(o.bubbles.length,2);assert.deepEqual(o.bubbles.map(b=>b.speaker),displayNames);assert.deepEqual(o.bubbles.map(b=>b.text),displayTexts[kind]);
  for(const b of o.bubbles){
    inside(o.stage,b.rect);assert.ok(b.font>=13.5);assert.equal(b.headingVisible,show);if(!show)assert.equal(b.headingContent,'none');
    if(kind==='short'){assert.equal(b.textVisible,true);inside(b.rect,b.ink);assert.equal(b.full,false);}
    else if(b.full){inside(b.rect,b.fullBox);assert.equal(b.openedText,b.text);}
    else {assert.equal(b.textVisible,true);inside(b.rect,b.ink);assert.equal(b.clipped,false);}
  }
  const [a,b]=o.bubbles.map(b=>b.rect);assert.ok(Math.min(a.right,b.right)-Math.max(a.left,b.left)<=1||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=1,'bubbles overlap');
}
export function verifyActions(o,name){
  assert.equal(o.name,name);assert.equal(o.ellipsis,false);assert.equal(o.nowrap,false);assert.ok(o.ink.length);for(const ink of o.ink)inside(o.title,ink);
  assert.equal(o.buttons.length,2);for(const button of o.buttons){inside(o.actions,button.rect);assert.ok(button.rect.top>=o.title.bottom-1);}
  assert.equal(o.copyCount,3);assert.equal(o.deleteCount,2);assert.equal(o.originalName,name);assert.equal(o.sourcePreserved,true);
}
export function verifyDisplay(report,inputs,dir){
  assert.equal(report.schema,'akari-speech-display-v1');assert.equal(report.status,'PASS');assert.deepEqual(report.snapshot,inputs);assert.equal(report.browser,browserEnvironment.version);assert.equal(report.playwright,browserEnvironment.playwright);assert.ok(['win32','linux'].includes(report.platform));assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);assert.equal(report.hostFailure,undefined);
  assert.deepEqual(report.results.map(r=>r.id),displayIds);for(const r of report.results){assert.equal(r.status,'PASS');assert.equal(r.error,undefined);}
  const get=id=>report.results.find(r=>r.id===id).observed;
  const settings=get('DISPLAY-SETTINGS');assert.equal(settings.initial.model,true);assert.equal(settings.initial.checkbox,true);assert.deepEqual(settings.rows.map(r=>r.mode+'/'+r.level),['code/basic','code/advanced','blocks/basic','blocks/advanced']);
  for(const r of settings.rows){assert.deepEqual(r.history,[false,true,false,true]);assert.equal(r.sourcePreserved,true);verifyBubbles(r.off,false,'short');verifyBubbles(r.on,true,'short');assert.ok(r.off.bubbles[0].rect.height<r.on.bubbles[0].rect.height,'empty heading row');}
  const persistence=get('DISPLAY-PERSISTENCE');assert.deepEqual(persistence.map(r=>r.show),[false,true]);for(const r of persistence){assert.equal(r.loaded,r.show);assert.equal(r.restored,r.show);assert.equal(r.sourcePreserved,true);verifyBubbles(r.player,r.show,'short');verifyBubbles(r.recovered,r.show,'short');}
  const bubbles=get('DISPLAY-BUBBLES');assert.deepEqual(bubbles.map(r=>r.id),bubbleCases.map(c=>c.id));for(const [i,r]of bubbles.entries())verifyBubbles(r.geometry,bubbleCases[i].show,bubbleCases[i].kind);
  const timing=get('DISPLAY-DURATION');assert.deepEqual(timing.map(r=>r.show),[false,true]);for(const r of timing){assert.deepEqual(r.events.map(e=>e.kind),['add','add','remove','remove']);for(const id of ['sprite-1','dango']){const es=r.events.filter(e=>e.id===id);assert.equal(es.length,2);const elapsed=es[1].at-es[0].at;assert.ok(elapsed>=1850&&elapsed<=2400);}assert.equal(r.untimedFirst,'一');assert.equal(r.untimedSecond,'二');assert.equal(r.untimedLater,'二');assert.equal(r.afterStop,0);}
  const objects=get('DISPLAY-OBJECT-NAMES');assert.deepEqual(objects.map(r=>r.id),actionCases.map(c=>c.id));for(const [i,r]of objects.entries())verifyActions(r.geometry,actionCases[i].name);
  const zoom=get('DISPLAY-NATIVE-ZOOM');assert.deepEqual(zoom.map(r=>r.mode+'/'+r.requested),['code/1.25','code/2','blocks/1.25','blocks/2']);for(const r of zoom){assert.equal(r.actual,r.requested);assert.equal(r.before.outerWidth,r.after.outerWidth);assert.ok(r.after.innerWidth<r.before.innerWidth);assert.ok(r.after.dpr>r.before.dpr);verifyActions(r.geometry,actionNames[1]);}
  assert.deepEqual(get('DISPLAY-INVALID'),{settings:Array(6).fill('F503/X602'),malformedStages:Array(2).fill('F503/X602')});
  const names=['candidate.html',...bubbleCases.map((_,i)=>`bubbles-${i}.png`),...actionCases.map((_,i)=>`objects-${i}.png`),...Array.from({length:4},(_,i)=>`zoom-${i}.png`),'saved-off.md','saved-on.md','player-off.html','player-on.html','player-off.png','player-on.png'];
  assert.deepEqual(report.artifacts.map(a=>a.name).sort(),names.sort());for(const a of report.artifacts){assert.match(a.sha256,/^[a-f0-9]{64}$/);assert.equal(sha(fs.readFileSync(path.join(dir,a.name))),a.sha256);}assert.equal(report.artifacts.find(a=>a.name==='candidate.html').sha256,inputs.productSha256);
  return{status:'PASS',groups:displayIds.length,bubbleCases:bubbles.length,objectCases:objects.length,zoomCases:zoom.length};
}
