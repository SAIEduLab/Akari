import assert from 'node:assert/strict';
import {refusedAs} from './refusal.cjs';
import {checkBrowserVersion,checkPlaywrightVersion} from './browser-environment.mjs';

// Before a save the work's name is outlined in its own place above the question 「この名前で保存するけどいいかな？」,
// and only はい saves (askSaveName). The name stays seen at every level and view, at three screens and three browser
// zooms, with a mouse and with a touch screen (which makes the toolbar taller), from every place a save starts: the
// toolbar's 保存, ほぞんしてから つづける in the lose dialog, and 書きかけを 作品に ほぞん in the callable dialog, which
// くわしく and 名人 show.
export const saveNameScreens=Object.freeze([[1366,768],[768,1024],[390,844]]);
export const saveNameZooms=Object.freeze([75,100,125]);
export const saveNamePointers=Object.freeze(['mouse','touch']);
export const saveNameViews=Object.freeze([['entry','blocks'],['basic','code'],['basic','blocks'],['advanced','code'],['advanced','blocks'],['meijin','code']]);
export const saveNameRoutes=level=>['advanced','meijin'].includes(level)?['toolbar','lose','callable']:['toolbar','lose'];
// The oracle fails where the name is not seen, each by its own check: the toolbar left under the backdrop (painted and
// nameAsBefore), the line taken away (painted), a white ring as blue as the line (contrast), the question over the name
// (clear), the name pushed out of the screen (lineInside), and はい hidden (pressable).
export const saveNameOracles=Object.freeze({
  'oracle/toolbar-under-backdrop':['painted','nameAsBefore'],'oracle/line-removed':['painted'],'oracle/ring-like-line':['contrast'],
  'oracle/question-over-name':['clear'],'oracle/name-off-screen':['lineInside'],'oracle/yes-hidden':['pressable'],
});
// Chrome's own zoom and the emulation place the toolbar, the name and the question alike, in a window of each screen
// Chrome can open at that size (390 is below the narrowest window, 478).
export const saveNameMatchScreens=Object.freeze([[1366,768],[768,1024]]);
export const saveNameMatchZooms=Object.freeze([75,125]);
export const saveNameIds=Object.freeze([
  ...saveNameScreens.flatMap(([w,h])=>saveNameZooms.flatMap(z=>saveNamePointers.flatMap(pointer=>saveNameViews.flatMap(([level,view])=>
    saveNameRoutes(level).map(route=>`save-name/${w}x${h}/${z}/${pointer}/${level}/${view}/${route}`))))),
  ...Object.keys(saveNameOracles),
  ...saveNameMatchScreens.flatMap(([w,h])=>saveNameMatchZooms.map(z=>`zoom-match/${w}x${h}/${z}`)),
]);
// The line: CUD ver.4 blue, 5px (thicker than the 3px focus rings), 2px from the field across a white ring.
export const saveNameLine=Object.freeze({colour:[0,90,255],width:5,offset:2});
// The owner's words, spaced by 文節 as all child text is (F-19).
export const saveNameMessage='この 名前で 保存するけど いいかな？';
// The name's field may differ from its look with no backdrop by at most 15 on average (the largest channel of each
// pixel): the lightest backdrop the product puts over a page (#colorModal, #20354b22) moves a light field by about 30,
// and the question's own by about 75.
export const saveNameShiftLimit=15;
// WCAG 2.2 1.4.11: a graphical object needs 3:1 against what is next to it. The line is told from the field by the white
// ring the product always draws between them; outside it lie other parts of the toolbar, inert under the question.
const minimumContrast=3;
// The button each route's save starts from.
const startedFrom=Object.freeze({toolbar:'saveBtn',lose:'loseConfirmSave',callable:'callableSaveProject'});
// What いいえ and Escape leave: nothing saved, the question closed, the dialog the save started from still open, and the
// focus back on the button that asked.
const leftAlone=route=>({downloads:0,asked:false,nameCheck:false,under:route==='toolbar'?null:true,focus:startedFrom[route]});

function verifyCase(row,id){
  const [, screen, zoom, pointer, level, view, route]=id.split('/'),[width,height]=screen.split('x').map(Number),seen=row.seen;
  assert.deepEqual(row.viewport,{width:Math.round(width*100/Number(zoom)),height:Math.round(height*100/Number(zoom)),zoom:Number(zoom),ratio:Number(zoom)/100,coarse:pointer==='touch'},id+': screen, zoom and pointer');
  assert.deepEqual([seen.level,seen.view],[level,view],id+': level and view');
  assert.equal(seen.message,saveNameMessage,id+': the question');
  assert.equal(seen.focus,'saveConfirmNo',id+': いいえ has the focus');
  assert.deepEqual(seen.order,['saveConfirmNo','saveConfirmYes'],id+': いいえ comes first');
  assert.deepEqual(seen.style,{colour:'rgb(0, 90, 255)',width:'5px',offset:'2px',style:'solid'},id+': line style');
  assert.deepEqual(Object.keys(seen.sides),['top','bottom','left','right'],id+': sides');
  for(const [side,n] of Object.entries(seen.sides))assert.ok(n>0,id+': the line is sampled along its '+side+' side');
  assert.equal(seen.painted,true,id+': the line is painted in its colour on every side');
  assert.ok(seen.contrast>=minimumContrast,id+': contrast with the ring '+seen.contrast);
  assert.equal(seen.nameAsBefore,true,id+': the name looks as it does with no backdrop');
  assert.ok(typeof seen.nameShift==='number'&&seen.nameShift<=saveNameShiftLimit,id+': the name field changed by '+seen.nameShift);
  assert.equal(seen.lineInside,true,id+': the line lies inside the screen');
  assert.equal(seen.clear,true,id+': the dialog does not cover the name or its line');
  assert.equal(seen.pressable,true,id+': はい and いいえ can be pressed');
  assert.deepEqual(row.toolbar,{asked:true,downloads:0,others:[]},id+': the toolbar shown over the backdrop cannot be pressed');
  assert.deepEqual(row.no,leftAlone(route),id+': いいえ saves nothing and goes back');
  assert.deepEqual(row.escape,leftAlone(route),id+': Escape saves nothing and goes back');
  assert.equal(row.yes.downloads,1,id+': はい saves once');
  assert.ok(typeof row.yes.name==='string'&&row.yes.name.length>0,id+': the work has a name');
  assert.equal(row.yes.file,row.yes.name+'.akari.md',id+': the file is named after the work');
  assert.equal(row.yes.under,route==='lose'?false:route==='callable'?true:null,id+': after はい');
  // After はい the focus goes back to the button that asked, but where ほぞんしてから つづける goes on to the new work.
  if(route!=='lose')assert.equal(row.yes.focus,startedFrom[route],id+': the focus after はい');
}

// The toolbar and the name are placed alike, within a rounding of the layout (1 css pixel). Under Chrome's zoom the line
// is drawn in whole device pixels (5px at 75% is 3 device pixels, 4 css pixels; at 125% 6 and 4.8), and the question,
// whose text Chrome lays out at the zoom's own font metrics (measured up to 2.7px taller), stays clear of the name. The
// line under Chrome's zoom is read from the screen as in every case. Under the emulated zoom the gap between the line and
// the name is the css text 2px exactly; under Chrome's zoom it is in whole device pixels as the line, at least one:
// max(1, floor(2 x zoom)) / zoom css pixels, written as Chrome writes a length (6 significant digits, no trailing zeros:
// 1.33333px at 75%, 1.6px at 125%), and that text exactly.
const zoomLineGap=zoom=>Number((Math.max(1,Math.floor(saveNameLine.offset*zoom/100))*100/zoom).toPrecision(6))+'px';
function verifyZoomMatch(row){
  const {native,emulated}=row,zoom=Number(row.id.split('/')[2]),scale=zoom/100;
  for(const check of ['painted','nameAsBefore','lineInside','clear','pressable'])assert.equal(native.seen?.[check],true,row.id+': under Chrome zoom, '+check);
  assert.ok(native.seen.contrast>=minimumContrast,row.id+': under Chrome zoom, contrast');
  assert.equal(native.actual,zoom,row.id+': Chrome zoomed the page');
  assert.ok(Math.abs(native.ratio-scale)<0.02,row.id+': pixel ratio of the zoom');
  assert.deepEqual(emulated.inner,native.inner,row.id+': same css size');assert.equal(emulated.ratio,native.ratio,row.id+': same pixel ratio');
  for(const key of ['toolbar','name'])native[key].forEach((v,k)=>assert.ok(Math.abs(v-emulated[key][k])<=1,row.id+': '+key+' placed alike'));
  assert.deepEqual(emulated.line,['solid',saveNameLine.width+'px',saveNameLine.offset+'px','rgb(0, 90, 255)'],row.id+': the emulated line');
  const width=parseFloat(native.line[1]);
  assert.ok(Math.abs(width-Math.floor(saveNameLine.width*scale)/scale)<0.01,row.id+': the line in whole device pixels');
  assert.deepEqual([native.line[0],native.line[3]],['solid','rgb(0, 90, 255)'],row.id+': the line under Chrome zoom');
  assert.equal(native.line[2],zoomLineGap(zoom),row.id+': the gap of the line under Chrome zoom');
  const reach=width+saveNameLine.offset,[nl,nt,nw,nh]=native.name,[ql,qt,qw,qh]=native.question;
  assert.ok(qt+qh<=nt-reach||qt>=nt+nh+reach||ql+qw<=nl-reach||ql>=nl+nw+reach,row.id+': the question clear of the name under Chrome zoom');
}
export function verifySaveName(r,inputs){
  assert.equal(r.schema,'akari-gate-cases-v1');assert.equal(r.step,'save-name');assert.equal(r.status,'PASS');assert.deepEqual(r.snapshot,inputs);
  assert.ok(checkBrowserVersion(r.browser));assert.ok(checkPlaywrightVersion(r.playwright));assert.deepEqual(r.errors,[]);
  assert.deepEqual(r.results.map(x=>x.id),saveNameIds);assert.ok(r.results.every(x=>x.status==='PASS'));
  for(const row of r.results){
    if(Object.hasOwn(saveNameOracles,row.id)){
      for(const check of saveNameOracles[row.id])assert.equal(row.refused?.[check],true,row.id+': '+check+' refuses a name that is not seen');
      continue;
    }
    if(row.id.startsWith('zoom-match/')){verifyZoomMatch(row);continue;}
    verifyCase(row,row.id);
  }
  return{status:'PASS',cases:saveNameIds.length};
}

export const saveNameRejectionIds=Object.freeze(['missing-case','duplicate-case','failed-case','stale-snapshot','unpainted-line','low-contrast','dimmed-field',
  'line-outside','dialog-over-name','unpressable','yes-focused','other-message','thin-line','saved-on-no','question-left-open','no-save-on-yes','saved-twice',
  'other-file-name','lose-dialog-gone-on-no','oracle-accepted','zoom-placed-apart','zoom-not-applied','no-shift-measured',
  'mouse-as-touch','saved-on-escape','escape-left-open','toolbar-pressed','oracle-check-quiet','zoom-line-unseen','focus-lost-on-no','focus-lost-on-yes',
  'zoom-gap-css-wrong','zoom-gap-css-printed-otherwise','zoom-gap-device-wrong','zoom-gap-device-of-1px','zoom-gap-device-of-3px','zoom-gap-forms-mixed',
  'zoom-gap-device-more-digits','zoom-gap-device-trailing-zeros','zoom-gap-device-trailing-zeros-at-125','zoom-gap-device-two-places','zoom-gap-device-four-places','zoom-gap-empty',
  'zoom-gap-css-under-chrome-zoom','zoom-gap-device-under-emulated-zoom']);
export function rejectSaveNameEvidence(r,inputs){
  const first=x=>x.results[0],lose=x=>x.results.find(o=>o.id.endsWith('/lose')),touch=x=>x.results.find(o=>o.id.includes('/touch/')),callable=x=>x.results.find(o=>o.id.endsWith('/callable'));
  // An oracle's refusals by check (false: that check let the hidden name pass).
  const oracle=(x,id)=>x.results.find(o=>o.id===id).refused;
  const match=(x,at)=>x.results.find(o=>o.id==='zoom-match/'+at);
  // Sets the gap of every zoom-match row from its zoom (a percentage).
  const gaps=(x,gap)=>{for(const o of x.results)if(o.id.startsWith('zoom-match/'))o.native.line[2]=gap(Number(o.id.split('/')[2]));};
  const changes=[
    x=>x.results.pop(),x=>{x.results[1]=structuredClone(x.results[0]);},x=>{first(x).status='FAIL';},x=>{x.snapshot.productSha256='0'.repeat(64);},
    x=>{first(x).seen.painted=false;},x=>{first(x).seen.contrast=2.9;},x=>{first(x).seen.nameAsBefore=false;},x=>{first(x).seen.lineInside=false;},
    x=>{first(x).seen.clear=false;},x=>{first(x).seen.pressable=false;},x=>{first(x).seen.focus='saveConfirmYes';},x=>{first(x).seen.message='この名前で保存するけどいいかな？';},
    x=>{first(x).seen.style.width='3px';},x=>{first(x).no.downloads=1;},x=>{first(x).no.asked=true;},x=>{first(x).yes.downloads=0;},x=>{first(x).yes.downloads=2;},
    x=>{first(x).yes.file='Akari.akari.md';},x=>{lose(x).no.under=false;},x=>{oracle(x,'oracle/line-removed').painted=false;},
    x=>{match(x,'1366x768/125').emulated.name[1]+=3;},x=>{match(x,'768x1024/75').native.actual=100;},
    x=>{first(x).seen.nameShift=null;},x=>{touch(x).viewport.coarse=false;},x=>{first(x).escape.downloads=1;},x=>{first(x).escape.asked=true;},
    x=>{first(x).toolbar.others=['loseConfirmModal'];},x=>{oracle(x,'oracle/toolbar-under-backdrop').nameAsBefore=false;},
    x=>{match(x,'768x1024/125').native.seen.painted=false;},x=>{callable(x).no.focus='undoBtn';},x=>{first(x).yes.focus=null;},
    x=>gaps(x,()=>'3px'),x=>gaps(x,()=>'2.0px'),x=>gaps(x,z=>({75:'1.334px',125:'1.66667px'})[z]),
    x=>gaps(x,z=>({75:'0px',125:'0.8px'})[z]),x=>gaps(x,z=>({75:'2.66667px',125:'2.4px'})[z]),x=>gaps(x,z=>({75:'2px',125:'1.6px'})[z]),
    x=>gaps(x,z=>({75:'1.333333333px',125:'1.6px'})[z]),x=>gaps(x,z=>({75:'1.3333300px',125:'1.6px'})[z]),x=>gaps(x,z=>({75:'1.33333px',125:'1.600000px'})[z]),
    x=>gaps(x,z=>({75:'1.34px',125:'1.6px'})[z]),x=>gaps(x,z=>({75:'1.3333px',125:'1.6px'})[z]),x=>gaps(x,()=>''),
    // (each zoom has one form: the css text under Chrome's zoom, and the device text under the emulated zoom, are refused)
    x=>gaps(x,()=>'2px'),x=>{for(const o of x.results)if(o.id.startsWith('zoom-match/'))o.emulated.line[2]=({75:'1.33333px',125:'1.6px'})[Number(o.id.split('/')[2])];},
  ];
  assert.equal(changes.length,saveNameRejectionIds.length);
  return changes.map((change,i)=>{const bad=structuredClone(r);change(bad);assert.throws(()=>verifySaveName(bad,inputs),refusedAs('save-name-contract#1'),saveNameRejectionIds[i]);return{id:saveNameRejectionIds[i],status:'PASS'};});
}
