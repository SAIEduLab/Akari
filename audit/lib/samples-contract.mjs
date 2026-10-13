import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {browserEnvironment} from './browser-environment.mjs';
import {sha} from './product-test-host.mjs';
export const samplesFeature={"id":"editable-samples","count":6,"ids":["dance","flower","game","maze","music","story"],"names":["マスコットとだんごのダンス","くるくる花もよう","星をつかまえよう","道をつくって 迷路たんけん","おひさまの 曲づくり","ふたりの ふしぎな おさんぽ"],"openRequiresConfirmation":"unsaved-only","picker":"native-dialog","cardLoadsDirectly":true,"selectionOnlyPreservesWork":true,"confirmationButtons":["ほぞんせずに開く","キャンセル"],"cancelPreservesPendingEdits":true,"displayPreferencesPreserved":true,"originalDataIsolated":true,"offline":true,"editOperations":["parameter","replace","reorder","add","delete"]};
export const sampleTestIds=["SAMPLES-CATALOG","SAMPLES-RUNTIME","SAMPLES-CHOICE-CONFIRM","SAMPLES-CANCEL-PENDING","SAMPLES-RESET-ISOLATION","SAMPLES-BLOCK-EDIT","SAMPLES-SAVE-OFFLINE","SAMPLES-LOCKS","SAMPLES-RESPONSIVE-PICKER"];
export const sampleExpected={
 'SAMPLES-CATALOG':{count:6,valid:true,isolated:true,assets:true,roundtrip:true},
 'SAMPLES-RUNTIME':{danceCycles:2,flowerLines:36,gameGoal:5,guard:true,restart:true,mazeGoal:true,mazeWall:true,musicEdit:true,musicSequence:16,musicStop:true,storyEndings:4},
 'SAMPLES-CHOICE-CONFIRM':{selectionPreserved:true,cleanDirect:true,unsavedConfirmation:true,initialBodies:true,preferences:true},
 'SAMPLES-CANCEL-PENDING':{code:true,block:true,draft:true,escape:true},
 'SAMPLES-RESET-ISOLATION':{transitions:30,reopen:true,historyReset:true,autosaveClean:true},
 'SAMPLES-BLOCK-EDIT':{samples:6,parameter:true,replace:true,reorder:true,add:true,delete:true,undoRedo:true,roundtrip:true},
 'SAMPLES-SAVE-OFFLINE':{samples:6,nativeDownloads:true,reimport:true,players:true,noNetwork:true},
 'SAMPLES-LOCKS':{running:true,paused:true,stopped:true},
 'SAMPLES-RESPONSIVE-PICKER':{viewports:[[1280,720],[1920,1080],[390,844]],levels:2,modes:2,touch:true,cards:6,keyboard:true},
};
export function verifySamples(report,inputs,dir){
 assert.equal(report.schema,'akari-samples-evidence-v1');assert.equal(report.status,'PASS');assert.deepEqual(report.snapshot,inputs);
 assert.equal(report.environment.browser,browserEnvironment.version);assert.equal(report.environment.playwright,browserEnvironment.playwright);
 assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);assert.ok(!report.hostFailure);
 assert.deepEqual(report.results.map(r=>r.id),sampleTestIds);
 for(const row of report.results){assert.equal(row.status,'PASS',row.id);assert.ok(!row.error);assert.deepEqual(row.observed,sampleExpected[row.id],row.id);}
 const required=samplesFeature.ids.flatMap(id=>[id+'.png',id+'.akari.md',id+'-player.html']);
 assert.deepEqual(report.artifacts.map(a=>a.path).sort(),required.sort());
 for(const a of report.artifacts){assert.equal(a.path,path.basename(a.path));assert.match(a.sha256,/^[a-f0-9]{64}$/);assert.equal(sha(fs.readFileSync(path.join(dir,a.path))),a.sha256);}
 for(const id of samplesFeature.ids)assert.ok(fs.readFileSync(path.join(dir,id+'-player.html'),'utf8').includes('<html'));
 assert.equal(sha(fs.readFileSync(path.join(dir,'candidate.html'))),inputs.productSha256);
 return{status:'PASS',cases:sampleTestIds.length};
}
export const sampleNegativeIds=['missing','duplicate','order','failed','false-observation','exception','snapshot','browser','playwright','network','pageerror','artifact-missing','artifact-hash','artifact-path','candidate-hash'];
export function verifySamplesNegative(report,inputs){assert.equal(report.schema,'akari-samples-negative-v1');assert.equal(report.status,'PASS');assert.deepEqual(report.snapshot,inputs);assert.deepEqual(report.results.map(r=>r.id),sampleNegativeIds);for(const row of report.results)assert.equal(row.rejected,true);}
