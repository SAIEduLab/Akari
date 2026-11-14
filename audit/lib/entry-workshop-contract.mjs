import {auditRoute} from './entry-lesson-routes.mjs';
import assert from 'node:assert/strict';
import {checkBrowserVersion} from './browser-environment.mjs';
import cp from 'node:child_process';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
export const entryProvenance=productFile=>{
 const commitSha=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();let committedProductSha256=null;
 try{committedProductSha256=crypto.createHash('sha256').update(cp.execFileSync('git',['show',commitSha+':'+productFile],{stdio:['ignore','pipe','ignore'],maxBuffer:64*1024*1024})).digest('hex');}catch{}
 const inventory=JSON.parse(fs.readFileSync('audit/public-files.json')).files,
   records=cp.execFileSync('git',['status','--porcelain','-z','--untracked-files=normal'],{encoding:'utf8'}).split('\0').filter(Boolean),
   publicInputsDirty=records.some(row=>inventory.some(file=>file===row.slice(3)||row.slice(3).endsWith('/')&&file.startsWith(row.slice(3))));
 return {commitSha,workingTreeDirty:!!records.length,publicInputsDirty,committedProductSha256};
};
// Independent expectations from the approved order, not copied from the live allow list.
export const entrySchemas=Object.freeze(['MotionCommand:GOTO','MotionCommand:MOVE_BY','MotionCommand:MOVE','MotionCommand:TURN_RIGHT','MotionCommand:TURN_LEFT',
 'Say','WaitTime','RepeatCount',
 'LooksCommand:SET_COSTUME','LooksCommand:SET_BACKDROP','SoundCommand:TONE_WAIT','SoundCommand:SAMPLE_WAIT']);
export const tutorialSteps=Object.freeze(auditRoute());

export const unitIds=Object.freeze(['ENTRY-SETTINGS','ENTRY-CATALOG','TUTORIAL-DEFINITIONS','TUTORIAL-TRANSITIONS','EDITOR-DESIGN-POSITION','EDITOR-POSITION-DEFAULTS','ENTRY-COMMITTED-PRODUCT']);
export const browserIds=Object.freeze(['ENTRY-FIRST-VIEW','ENTRY-MODE-PRESERVATION','EDITOR-APPEND-POSITION','TUTORIAL-PROTECTED-START',
 'TUTORIAL-ALL-STEPS','TUTORIAL-PENDING-EXIT','TUTORIAL-RESUME-IDENTITY','TUTORIAL-SAVE-REFUSALS',
 'EDITOR-POSITION-DOM','TUTORIAL-INPUT-RECOVERY','TUTORIAL-SAVE-FAILURE','TUTORIAL-STALE-CALLBACK','TUTORIAL-TOUCH-AND-KEYBOARD','RUNTIME-CLICK-KEYBOARD','TUTORIAL-BRANCHES','ENTRY-FIRST-HINT']);
// ENTRY-FIRST-HINT, from LANGUAGE.md 「はじめに：最初の作品を動かす」: each route starts with an empty browser and records, after
// each of its steps, whether the bubble is on the screen and what akari.tutorialHint.v1 holds ('unreadable' where reading
// it throws). The steps are the test's; the states are written here from the specification, not read from the product.
// Each size names whether the screen has room for the bubble over nothing with the first work: at these sizes from 740
// pixels wide the row under the button
// is free (the toolbar's second row when it wraps); at 390 every place right under the button is over a control, and the
// bubble is shown there all the same.
export const firstHintSizes=Object.freeze([{width:1280,height:720,room:true},{width:1366,height:768,room:true},{width:1920,height:1080,room:true},
 {width:1024,height:768,room:true},{width:800,height:600,room:true},{width:768,height:1024,room:true},{width:740,height:800,room:true},{width:390,height:844,room:false}]);
export const firstHintRoutes=Object.freeze({
 // start; reload with nothing touched
 'untouched-reload':[[true,null],[true,null]],
 // start; Tab until the focus is in the block list; Enter there; reload
 'tab-then-enter':[[true,null],[true,null],[false,'gone'],[false,'gone']],
 // start; a mouse press in the block list; reload
 'mouse-list':[[true,null],[false,'gone'],[false,'gone']],
 // start; a mouse press in the body
 'mouse-body':[[true,null],[false,'gone']],
 // start; a mouse button held down in the block list (no release yet); let go
 'press-only':[[true,null],[false,'gone'],[false,'gone']],
 // start; a tap on an event button
 'tap-event':[[true,null],[false,'gone']],
 // start; Tab to an event button; modifiers, locks, Escape, a function key and moving keys alone; Enter
 'keys-without-making':[[true,null],[true,null],[true,null],[false,'gone']],
 // start; Tab to the list's first block; ↑ (the product opens the list's tools by a click of its own)
 'arrow-up-in-list':[[true,null],[true,null],[true,null]],
 // start; a click made by the page's code on a block of the list
 'scripted-click':[[true,null],[true,null]],
 // start; 保存 pressed (the name is asked); いいえ
 'save-question':[[true,null],[false,null],[true,null]],
 // start; a press of いっしょに作る
 'press-guide':[[true,null],[false,'gone']],
 // start; a character added (no block touched); reload with the autosave kept; that autosave discarded and reload
 'autosave':[[true,null],[true,null],[false,'gone'],[false,'gone']],
 // start; a character added; reload with the autosave kept; that autosave restored
 'autosave-restore':[[true,null],[true,null],[false,'gone'],[false,'gone']],
 // start; a work with a start body opened; かんたん; はじめて again; running; stopped
 'level-and-run':[[true,null],[true,null],[false,null],[true,null],[false,null],[true,null]],
 // start; かんたん; the code view; a letter put in the code with no key; the block view and はじめて again
 'code-typing':[[true,null],[false,null],[false,null],[false,'gone'],[false,'gone']],
 // start; かんたん; the code view; Backspace at the start of the code (a key with no input)
 'key-only':[[true,null],[false,null],[false,null],[false,'gone']],
 // start; くわしく; 自分で作ったブロック opened in its code view, then in its block view; a press in that body
 'made-block-code':[[true,null],[false,null],[false,null],[false,'gone']],
 'made-block-blocks':[[true,null],[false,null],[false,null],[false,'gone']],
 // start; Tab to a block of the list; Ctrl+V there (nothing put in)
 'paste-on-button':[[true,null],[true,null],[true,null]],
 // start; かんたん; the code view; Ctrl+Backspace at the start of the code (nothing deleted)
 'ctrl-delete-nothing':[[true,null],[false,null],[false,null],[false,null]],
 // start; かんたん; the code view; Ctrl+Backspace at the end of the code (a word deleted)
 'ctrl-delete-real':[[true,null],[false,null],[false,null],[false,'gone']],
 // start; かんたん; the code view; Ctrl+V with nothing on the clipboard
 'empty-paste':[[true,null],[false,null],[false,null],[false,null]],
 // start; かんたん; the code view; 5000 letters put in at once, or pasted
 'long-input':[[true,null],[false,null],[false,null],[false,'gone']],
 'long-paste':[[true,null],[false,null],[false,null],[false,'gone']],
 // with a localStorage that throws: start; a mouse press in the block list; reload
 'storage-throws':[[true,'unreadable'],[false,'unreadable'],[true,'unreadable']],
});
// The checks of ENTRY-FIRST-HINT's observations, from the rectangles the test measured.
export function verifyFirstHint(hint){
 assert.deepEqual(hint.viewports.map(v=>[v.size.width,v.size.height]),firstHintSizes.map(s=>[s.width,s.height]));
 for(const [i,v]of hint.viewports.entries()){const {room}=firstHintSizes[i],at=v.size.width+'x'+v.size.height+' ';
  assert.equal(v.text,'さかなを タッチする ゲームを 作ってみよう！');assert.deepEqual(v.viewport,{width:v.size.width,height:v.size.height});
  assert.equal(v.ariaHidden,'true',at+'read once, as the button\'s description');assert.equal(v.pointerEvents,'none');assert.equal(v.focusable,false);
  assert.equal(v.shown,true,at+'shown');assert.equal(v.describedBy,'tutorialHint');assert.equal(v.hitBubble,false,at+'a press goes through');
  // Right under the button: the arrow's tip (10 px above the bubble) at the button's bottom edge, within its width.
  assert.ok(v.hint.y-v.button.bottom>=0&&v.hint.y-v.button.bottom<=24,at+'right under the button');
  assert.ok(v.arrow>=v.button.x&&v.arrow<=v.button.right,at+'arrow at the button');
  assert.ok(v.hint.x>=0&&v.hint.right<=v.size.width&&v.hint.bottom<=v.size.height,at+'on the screen');
  if(room){assert.deepEqual(v.covered,[],at+'over no control');assert.deepEqual(v.between,[],at+'no control between the arrow and the button');}
 }
 // With the note under the view toggle shown at 1024x768 (it stands in the bubble's row there) the bubble moves away from
 // where it stood without the note and is over neither the note nor a control; with a part whose long name
 // leaves no free place at 1280x720 the bubble is still shown right under the button (over what is there).
 assert.notEqual(hint.withNote.hint.x,hint.viewports.find(v=>v.size.width===1024).hint.x,'the bubble moved away from the note');
 for(const [name,v,clear]of [['note',hint.withNote,true],['long name',hint.longName,false]]){
  assert.equal(v.shown,true,name+' shown');assert.ok(v.hint.y-v.button.bottom>=0&&v.hint.y-v.button.bottom<=24,name+' right under the button');
  assert.ok(v.arrow>=v.button.x&&v.arrow<=v.button.right,name+' arrow at the button');assert.ok(v.hint.x>=0&&v.hint.right<=v.size.width,name+' on the screen');
  if(clear)assert.ok(v.covered.length===0&&v.between.length===0,name+' over no control');
  else assert.ok(v.covered.includes('objectSelect'),name+': the long name leaves no free place, and the bubble is over the list of parts');
 }
 assert.deepEqual(Object.keys(hint.routes),Object.keys(firstHintRoutes));
 for(const [id,states]of Object.entries(firstHintRoutes))assert.deepEqual(hint.routes[id],states,'ENTRY-FIRST-HINT '+id);
 return true;
}
export const deniedRoutes=Object.freeze(['new','sample','open','export','mode','target','event','redo','shortcut-save','shortcut-undo','delete-key',
 'menu','drag','file-drop','touch','dialog','mouse-menu','keyboard-enter','keyboard-space']);
export function verifyEntryReport(report,kind,currentSnapshot,{allowWorkingCopy=false,file=null}={}){
 assert.equal(report.schema,'akari-entry-workshop-v1');assert.equal(report.kind,kind);assert.equal(report.status,'PASS');
 assert.deepEqual(report.snapshot,currentSnapshot);assert.equal(report.commitSha,cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),'current commit SHA');
 assert.match(report.startedAt,/^\d{4}-\d{2}-\d{2}T/);assert.ok(report.command&&report.productFile);
 const currentBasis=entryProvenance(report.productFile);for(const key of ['commitSha','publicInputsDirty','committedProductSha256'])assert.deepEqual(report.executionBasis?.[key],currentBasis[key]);assert.equal(typeof report.executionBasis.workingTreeDirty,'boolean');
 if(!allowWorkingCopy){assert.equal(report.executionBasis.publicInputsDirty,false,'final evidence requires committed inputs');assert.equal(report.executionBasis.committedProductSha256,report.snapshot.productSha256,'tested HTML is the committed HTML');}
 const ids=kind==='unit'?unitIds:browserIds;
 assert.deepEqual(report.results.map(r=>r.id).sort(),[...ids].sort());assert.equal(new Set(report.results.map(r=>r.id)).size,ids.length);
 for(const row of report.results){assert.equal(row.status,'PASS',row.id);assert.ok(row.observations&&Object.keys(row.observations).length,row.id);}
 if(kind==='unit'){
  const expected=tutorialSteps.flatMap(id=>['unmet','wrong-work','unconfirmed','runtime-failed','stale-callback','no-operation','valid','duplicate','exited'].map(reason=>id+'/'+reason));
  assert.deepEqual(report.results.find(r=>r.id==='TUTORIAL-TRANSITIONS').observations.cases,expected);
 }
 if(kind==='browser'){
  assert.ok(checkBrowserVersion(report.browser));assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);
  const flow=report.results.find(r=>r.id==='TUTORIAL-ALL-STEPS').observations;
  assert.deepEqual(flow.exits.map(r=>r.id),tutorialSteps);for(const exit of flow.exits){assert.equal(exit.after.step,null);assert.deepEqual(exit.retained,exit.before);assert.equal(exit.remainingGuards,0);}
  assert.deepEqual(flow.steps.map(s=>s.id),tutorialSteps);
  for(const step of flow.steps){assert.equal(step.idle.step,step.id,'operation-free observation');assert.deepEqual(step.idle,step.before,'idle state preserved');assert.deepEqual(step.browserKeys.map(k=>k.key),['F5','r','w','l','f','p','Tab','ArrowLeft']);for(const key of step.browserKeys)assert.equal(key.prevented,false);assert.deepEqual(step.denials.map(x=>x.route),deniedRoutes);for(const row of step.denials){assert.equal(row.unchanged,true,step.id+'/'+row.route);assert.deepEqual(row.after,row.before,'independent unchanged content check');if(row.route==='sample'){assert.equal(row.activation,'synthetic-hidden-control');assert.equal(row.visible,false);}}assert.ok(step.after);}
  assert.deepEqual(flow.runtimeRuns.map(r=>r.id),['try-original','try-score','try-score-goal','try-score-goal-remix']);
  const touch=report.results.find(r=>r.id==='TUTORIAL-TOUCH-AND-KEYBOARD').observations;
  assert.deepEqual(touch.steps.map(s=>s.id),tutorialSteps);assert.equal(touch.touchEmulation,true);assert.equal(touch.realTouch,false);assert.equal(touch.keyboardActorActivation,'Enter');assert.deepEqual(touch.runtimeRuns.map(r=>r.id),['try-original','try-score','try-score-goal','try-score-goal-remix']);
  for(const run of flow.runtimeRuns){assert.ok(run.samples.some(f=>f.speech==='つかまった！'));assert.ok(new Set(run.samples.map(f=>f.x+','+f.y)).size>1);}
  const branches=report.results.find(r=>r.id==='TUTORIAL-BRANCHES').observations.routes;
  assert.deepEqual(branches.map(r=>r.key).sort(),['motion/swim','motion/zigzag','motion/small','score/goal','score/bonus','score/remaining','show/melody','show/costume','show/dance'].sort());
  for(const route of branches){assert.equal(route.completed,true);assert.ok(route.chosenValueVerified);assert.ok(route.undoVerified);}

  verifyFirstHint(report.results.find(r=>r.id==='ENTRY-FIRST-HINT').observations);
  assert.deepEqual(report.results.find(r=>r.id==='ENTRY-FIRST-VIEW').observations.viewports.map(v=>v.size),
   [{width:1280,height:720},{width:1366,height:768},{width:1920,height:1080}]);
  assert.ok(file,'artifact base is required');const base=path.resolve(file+'.artifacts');
  assert.deepEqual(report.artifacts.map(a=>a.path).sort(),fs.readdirSync(base).sort(),'complete artifact inventory');
  for(const artifact of report.artifacts){assert.equal(path.basename(artifact.path),artifact.path);const stat=fs.lstatSync(path.join(base,artifact.path));assert.ok(stat.isFile()&&!stat.isSymbolicLink());const bytes=fs.readFileSync(path.join(base,artifact.path));assert.equal(bytes.length,artifact.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),artifact.sha256);}
  for(const name of [...tutorialSteps.map(id=>'tutorial-'+id+'.png'),'entry-1280x720.png','entry-1366x768.png','entry-1920x1080.png'])assert.ok(report.artifacts.some(a=>a.path===name&&a.bytes>0),name);
 }
 return true;
}
