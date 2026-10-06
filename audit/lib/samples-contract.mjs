import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {browserEnvironment} from './browser-environment.mjs';
import {sha} from './product-test-host.mjs';
export const samplesFeature={"id":"editable-samples","count":3,"ids":["dance","flower","game"],"names":["マスコットとだんごのダンス","くるくる花もよう","星をつかまえよう"],"openRequiresConfirmation":true,"selectionOnlyPreservesWork":true,"confirmationButtons":["はい","キャンセル"],"cancelPreservesPendingEdits":true,"displayPreferencesPreserved":true,"originalDataIsolated":true,"offline":true,"editOperations":["parameter","replace","reorder","add","delete"]};
export const sampleTestIds=["SAMPLES-CATALOG","SAMPLES-RUNTIME","SAMPLES-CHOICE-CONFIRM","SAMPLES-CANCEL-PENDING","SAMPLES-RESET-ISOLATION","SAMPLES-BLOCK-EDIT","SAMPLES-SAVE-OFFLINE","SAMPLES-LOCKS","SAMPLES-RESPONSIVE-HINTS"];
export const sampleExpected={
 'SAMPLES-CATALOG':{count:3,valid:true,isolated:true,assets:true,roundtrip:true},
 'SAMPLES-RUNTIME':{danceCycles:2,flowerLines:36,gameGoal:5,guard:true,restart:true},
 'SAMPLES-CHOICE-CONFIRM':{selectionPreserved:true,alwaysConfirm:true,initialBodies:true,preferences:true},
 'SAMPLES-CANCEL-PENDING':{code:true,block:true,draft:true,escape:true},
 'SAMPLES-RESET-ISOLATION':{transitions:6,reopen:true,historyReset:true,autosaveClean:true},
 'SAMPLES-BLOCK-EDIT':{samples:3,parameter:true,replace:true,reorder:true,add:true,delete:true,undoRedo:true,roundtrip:true},
 'SAMPLES-SAVE-OFFLINE':{samples:3,nativeDownloads:true,reimport:true,players:true,noNetwork:true},
 'SAMPLES-LOCKS':{running:true,paused:true,stopped:true},
 'SAMPLES-RESPONSIVE-HINTS':{widths:[1366,390],levels:2,modes:2,touch:true,hints:6,keyboard:true},
};
export function verifySamples(report,inputs,dir){
 assert.equal(report.schema,'akari-samples-evidence-v1');assert.equal(report.status,'PASS');assert.deepEqual(report.snapshot,inputs);
 assert.equal(report.environment.browser,browserEnvironment.version);assert.equal(report.environment.playwright,browserEnvironment.playwright);
 assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);assert.ok(!report.hostFailure);
 assert.deepEqual(report.results.map(r=>r.id),sampleTestIds);
 for(const row of report.results){assert.equal(row.status,'PASS',row.id);assert.ok(!row.error);assert.deepEqual(row.observed,sampleExpected[row.id],row.id);}
 const required=['dance.png','flower.png','game.png',...['dance','flower','game'].flatMap(id=>[id+'.akari.md',id+'-player.html'])];
 assert.deepEqual(report.artifacts.map(a=>a.path).sort(),required.sort());
 for(const a of report.artifacts){assert.equal(a.path,path.basename(a.path));assert.match(a.sha256,/^[a-f0-9]{64}$/);assert.equal(sha(fs.readFileSync(path.join(dir,a.path))),a.sha256);}
 for(const id of ['dance','flower','game'])assert.ok(fs.readFileSync(path.join(dir,id+'-player.html'),'utf8').includes('<html'));
 assert.equal(sha(fs.readFileSync(path.join(dir,'candidate.html'))),inputs.productSha256);
 return{status:'PASS',cases:sampleTestIds.length};
}
export const sampleNegativeIds=['missing','duplicate','order','failed','false-observation','exception','snapshot','browser','playwright','network','pageerror','artifact-missing','artifact-hash','artifact-path','candidate-hash'];
export function verifySamplesNegative(report,inputs){assert.equal(report.schema,'akari-samples-negative-v1');assert.equal(report.status,'PASS');assert.deepEqual(report.snapshot,inputs);assert.deepEqual(report.results.map(r=>r.id),sampleNegativeIds);for(const row of report.results)assert.equal(row.rejected,true);}
