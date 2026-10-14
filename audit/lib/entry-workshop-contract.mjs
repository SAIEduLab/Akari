import assert from 'node:assert/strict';
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
export const entrySchemas=Object.freeze(['MotionCommand:MOVE_DIRECTION','MotionCommand:TURN_RIGHT','MotionCommand:TURN_LEFT',
 'MotionCommand:GOTO','MotionCommand:GLIDE','MotionCommand:GLIDE_DIRECTION','Say','WaitTime','RepeatCount',
 'LooksCommand:SET_COSTUME','LooksCommand:SET_BACKDROP','SoundCommand:TONE_WAIT','SoundCommand:SAMPLE_WAIT']);
export const tutorialSteps=Object.freeze(['choose-click','add-speech','speech-text','speech-time','add-outward','outward-time','outward-distance',
 'add-return','return-direction','return-time','return-distance','run-original','try-original','stop-original',
 'longer-outward','longer-return','run-longer','try-longer','stop-longer','reorder-speech','run-reordered',
 'try-reordered','stop-reordered','undo-reorder','save-work','verify-save']);
export const unitIds=Object.freeze(['ENTRY-SETTINGS','ENTRY-CATALOG','TUTORIAL-DEFINITIONS','TUTORIAL-TRANSITIONS','EDITOR-DESIGN-POSITION','EDITOR-POSITION-DEFAULTS','ENTRY-COMMITTED-PRODUCT']);
export const browserIds=Object.freeze(['ENTRY-FIRST-VIEW','ENTRY-MODE-PRESERVATION','EDITOR-APPEND-POSITION','TUTORIAL-PROTECTED-START',
 'TUTORIAL-ALL-STEPS','TUTORIAL-PENDING-EXIT','TUTORIAL-RESUME-IDENTITY','TUTORIAL-SAVE-REFUSALS',
 'EDITOR-POSITION-DOM','TUTORIAL-INPUT-RECOVERY','TUTORIAL-SAVE-FAILURE','TUTORIAL-STALE-CALLBACK']);
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
  assert.ok(report.browser);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);
  const flow=report.results.find(r=>r.id==='TUTORIAL-ALL-STEPS').observations;
  assert.deepEqual(flow.exits.map(r=>r.id),tutorialSteps);for(const exit of flow.exits){assert.equal(exit.after.step,null);assert.deepEqual(exit.retained,exit.before);assert.equal(exit.remainingGuards,0);}
  assert.deepEqual(flow.steps.map(s=>s.id),tutorialSteps);
  for(const step of flow.steps){assert.equal(step.idle.step,step.id,'operation-free observation');assert.deepEqual(step.idle,step.before,'idle state preserved');assert.deepEqual(step.denials.map(x=>x.route),deniedRoutes);for(const row of step.denials){assert.equal(row.unchanged,true,step.id+'/'+row.route);assert.deepEqual(row.after,row.before,'independent unchanged content check');}assert.ok(step.after);}
  assert.deepEqual(flow.runtimeRuns.map(r=>r.id),['try-original','try-longer','try-reordered']);
  for(const run of flow.runtimeRuns){assert.equal(run.renderTolerance,1+run.expected*Math.min(100,run.frameGap)/1000);assert.ok(run.peak-run.start>=run.expected-run.renderTolerance);assert.ok(Math.abs(run.samples.at(-1).x-run.start)<1);}
  assert.deepEqual(report.results.find(r=>r.id==='ENTRY-FIRST-VIEW').observations.viewports.map(v=>v.size),
   [{width:1280,height:720},{width:1366,height:768},{width:1920,height:1080}]);
  assert.ok(file,'artifact base is required');const base=path.resolve(file+'.artifacts');
  assert.deepEqual(report.artifacts.map(a=>a.path).sort(),fs.readdirSync(base).sort(),'complete artifact inventory');
  for(const artifact of report.artifacts){assert.equal(path.basename(artifact.path),artifact.path);const stat=fs.lstatSync(path.join(base,artifact.path));assert.ok(stat.isFile()&&!stat.isSymbolicLink());const bytes=fs.readFileSync(path.join(base,artifact.path));assert.equal(bytes.length,artifact.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),artifact.sha256);}
  for(const name of [...tutorialSteps.map(id=>'tutorial-'+id+'.png'),'entry-1280x720.png','entry-1366x768.png','entry-1920x1080.png'])assert.ok(report.artifacts.some(a=>a.path===name&&a.bytes>0),name);
 }
 return true;
}
