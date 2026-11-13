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
export const firstHintSizes=Object.freeze([{width:1280,height:720},{width:1366,height:768},{width:1920,height:1080},{width:390,height:844}]);
export const firstHintRoutes=Object.freeze({
 // start; reload with nothing touched
 'untouched-reload':[[true,null],[true,null]],
 // start; Tab until the focus is in the block list; Enter there; reload
 'tab-then-enter':[[true,null],[true,null],[false,'gone'],[false,'gone']],
 // start; a mouse press in the block list; reload
 'mouse-list':[[true,null],[false,'gone'],[false,'gone']],
 // start; a mouse press in the body
 'mouse-body':[[true,null],[false,'gone']],
 // start; a tap on an event button
 'tap-event':[[true,null],[false,'gone']],
 // start; a press of いっしょに作る
 'press-guide':[[true,null],[false,'gone']],
 // start; a character added (no block touched); reload with the autosave kept; that autosave discarded and reload
 'autosave':[[true,null],[true,null],[false,'gone'],[false,'gone']],
 // start; a work with a start body opened; かんたん; はじめて again; running; stopped
 'level-and-run':[[true,null],[true,null],[false,null],[true,null],[false,null],[true,null]],
 // with a localStorage that throws: start; a mouse press in the block list; reload
 'storage-throws':[[true,'unreadable'],[false,'unreadable'],[true,'unreadable']],
});
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

  const hint=report.results.find(r=>r.id==='ENTRY-FIRST-HINT').observations;
  assert.deepEqual(hint.viewports.map(v=>v.size),firstHintSizes);
  for(const v of hint.viewports){assert.equal(v.text,'さかなを タッチする ゲームを 作ってみよう！');assert.deepEqual(v.viewport,v.size);
   // Right under the toolbar (the button's row when it is one row; under all of it when it wraps, over none of its controls), the arrow
   // within the button's width, the whole bubble on the screen.
   assert.ok(v.toolbarBottom>=v.button.bottom&&v.hint.y>=v.toolbarBottom&&v.hint.y-v.toolbarBottom<=24,'bubble right under the toolbar');
   assert.ok(v.arrow>=v.button.x&&v.arrow<=v.button.right,'arrow at the button');assert.ok(v.hint.x>=0&&v.hint.right<=v.size.width&&v.hint.bottom<=v.size.height,'bubble on the screen');assert.equal(v.pointerEvents,'none');assert.equal(v.hitBubble,false);assert.equal(v.focusable,false);assert.equal(v.describedBy,'tutorialHint');}
  assert.deepEqual(Object.keys(hint.routes),Object.keys(firstHintRoutes));
  for(const [id,states]of Object.entries(firstHintRoutes))assert.deepEqual(hint.routes[id],states,'ENTRY-FIRST-HINT '+id);
  assert.deepEqual(report.results.find(r=>r.id==='ENTRY-FIRST-VIEW').observations.viewports.map(v=>v.size),
   [{width:1280,height:720},{width:1366,height:768},{width:1920,height:1080}]);
  assert.ok(file,'artifact base is required');const base=path.resolve(file+'.artifacts');
  assert.deepEqual(report.artifacts.map(a=>a.path).sort(),fs.readdirSync(base).sort(),'complete artifact inventory');
  for(const artifact of report.artifacts){assert.equal(path.basename(artifact.path),artifact.path);const stat=fs.lstatSync(path.join(base,artifact.path));assert.ok(stat.isFile()&&!stat.isSymbolicLink());const bytes=fs.readFileSync(path.join(base,artifact.path));assert.equal(bytes.length,artifact.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),artifact.sha256);}
  for(const name of [...tutorialSteps.map(id=>'tutorial-'+id+'.png'),'entry-1280x720.png','entry-1366x768.png','entry-1920x1080.png'])assert.ok(report.artifacts.some(a=>a.path===name&&a.bytes>0),name);
 }
 return true;
}
