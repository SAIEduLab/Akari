const assert=require('node:assert/strict');
const ids=[
  "EXPORT-CHOICE-CANCEL-FOCUS",
  "EXPORT-CHOICE-NARROW-ONE-DOWNLOAD",
  "EXPORT-CONTROLS-DEFAULT-OPERATIONS",
  "EXPORT-ARTWORK-SIZE-RELOAD-INPUT",
  "EXPORT-ARTWORK-QUESTION-ANSWER-STOP",
  "EXPORT-ARTWORK-AUDIO-PERMITTED",
  "EXPORT-ARTWORK-IMAGE-PEN-STOP",
  "EXPORT-ARTWORK-CACHED-RETURN",
  "EXPORT-ARTWORK-IFRAME",
  "EXPORT-ARTWORK-INITIALIZATION-ERROR",
  "EXPORT-ARTWORK-RECORDED-AUDIO",
  "EXPORT-ARTWORK-INVALID-AUDIO",
  "EXPORT-ARTWORK-DECODE-FAILURE",
  "EXPORT-ARTWORK-AUDIO-DEVICE-ERROR",
  "OPEN-AUTOSAVE-FAILURE-STILL-PROTECTED",
  "OPEN-RECOVERY-DIRTY-PROTECTED",
  "OPEN-RECOVERY-SAVED-DRAFT-CLEAN",
  "OPEN-CLEAN-AUTOSAVE-DIRECT",
  "OPEN-DIRTY-CANCEL-STATE-KEYBOARD",
  "OPEN-APPROVAL-PICKER-CANCEL-REUSE",
  "OPEN-SAVE-EDIT-UNDO-REDO",
  "OPEN-APPROVED-CORRUPT-RETAINED",
  "OPEN-APPROVED-SUCCESS-SAME-SELECTION",
  "OPEN-ALTERNATE-ROUTE-PROTECTED",
  "OPEN-CHANGED-AFTER-APPROVAL",
  "OPEN-UNFINISHED-CODE-AND-SAVED-DRAFT",
  "EXPORT-AUDIO-WAIT-MOUSE",
  "EXPORT-AUDIO-WAIT-KEYBOARD",
  "EXPORT-AUDIO-WAIT-TOUCH",
  "EXPORT-AUDIO-ACTIVATION-FAILURE",
  "EXPORT-NO-AUDIO-DOES-NOT-WAIT"
];
const fixed={
  'EXPORT-CHOICE-CANCEL-FOCUS':{downloads:0,staticExamples:0},
  'EXPORT-CONTROLS-DEFAULT-OPERATIONS':{title:'検証用の作品',restart:true,pauseResumeStop:true},
  'EXPORT-ARTWORK-SIZE-RELOAD-INPUT':{noControls:true,nativeButtonAndKey:true},
  'EXPORT-ARTWORK-QUESTION-ANSWER-STOP':{answer:true,stop:true},
  'EXPORT-ARTWORK-AUDIO-PERMITTED':{automatic:true},
  'EXPORT-ARTWORK-IMAGE-PEN-STOP':{painted:true,programStop:true},
  'EXPORT-ARTWORK-CACHED-RETURN':{persistedEvents:'same execution retained',nativeHistoryBack:true},
  'EXPORT-ARTWORK-IFRAME':{automatic:true},
  'EXPORT-ARTWORK-INITIALIZATION-ERROR':{rejected:true,detailsVisible:true,errorCode:'X602'},
  'EXPORT-ARTWORK-RECORDED-AUDIO':{decodeAndPlayback:true},
  'EXPORT-ARTWORK-INVALID-AUDIO':{invalidMimeRejected:true,noActivationWait:true,errorCode:'X602'},
  'EXPORT-ARTWORK-DECODE-FAILURE':{faultInjection:'decodeAudioData rejection',noActivationWait:true,errorCode:'R415'},
  'EXPORT-ARTWORK-AUDIO-DEVICE-ERROR':{faultInjection:'invalid sinkId; native resume and error event',nativeError:true,noActivationWait:true,safeStop:true,detailsVisible:true,errorCode:'R415'},
  'OPEN-AUTOSAVE-FAILURE-STILL-PROTECTED':{faultInjection:'IndexedDB and localStorage unavailable',unsavedStillProtected:true},
  'OPEN-RECOVERY-DIRTY-PROTECTED':{restoredUnsavedProtected:true},
  'OPEN-CLEAN-AUTOSAVE-DIRECT':{direct:true,autosavePresent:true},
  'OPEN-DIRTY-CANCEL-STATE-KEYBOARD':{pickers:0},
  'OPEN-APPROVAL-PICKER-CANCEL-REUSE':{currentRetained:true,confirmationAgain:true},
  'OPEN-SAVE-EDIT-UNDO-REDO':{saveClean:true,undoClean:true,redoDirty:true},
  'OPEN-APPROVED-CORRUPT-RETAINED':{retained:true,dialogs:0},
  'OPEN-APPROVED-SUCCESS-SAME-SELECTION':{oneConfirmation:true,sameSelection:true,dialogs:0},
  'OPEN-ALTERNATE-ROUTE-PROTECTED':{retained:true},
  'OPEN-CHANGED-AFTER-APPROVAL':{changedStateProtected:true},
  'OPEN-UNFINISHED-CODE-AND-SAVED-DRAFT':{unfinishedProtected:true,savedUnchangedDirect:true},
  'EXPORT-AUDIO-ACTIVATION-FAILURE':{faultInjection:'resume rejected after native user operation',safeStop:true,childMessage:true,details:true,errorCode:'R415'},
  'EXPORT-NO-AUDIO-DOES-NOT-WAIT':{automatic:true},
};
const extraKeys={
  'EXPORT-CHOICE-NARROW-ONE-DOWNLOAD':['count','box'],
  'EXPORT-ARTWORK-SIZE-RELOAD-INPUT':['box'],
  'EXPORT-ARTWORK-AUDIO-PERMITTED':['starts'],
  'EXPORT-ARTWORK-IMAGE-PEN-STOP':['images'],
  'EXPORT-ARTWORK-CACHED-RETURN':['nativeCacheRestored'],
  'EXPORT-ARTWORK-IFRAME':['box'],
  'OPEN-RECOVERY-SAVED-DRAFT-CLEAN':['variants'],
  'OPEN-DIRTY-CANCEL-STATE-KEYBOARD':['before','after'],
  'OPEN-APPROVAL-PICKER-CANCEL-REUSE':['before','after'],
  'OPEN-APPROVED-CORRUPT-RETAINED':['before','after'],
  'OPEN-ALTERNATE-ROUTE-PROTECTED':['before','after','dialogs'],
  'OPEN-CHANGED-AFTER-APPROVAL':['before','after','dialogs'],
};
for(const input of ['MOUSE','KEYBOARD','TOUCH'])extraKeys['EXPORT-AUDIO-WAIT-'+input]=['box','stage','colors','starts','startsBefore','phaseBefore','outputBefore','duplicateInput'];
const stage=box=>assert.deepEqual(box,{x:0,y:0,width:640,height:400});
function oneTone(starts){assert.equal(starts.length,1);assert.deepEqual(Object.keys(starts[0]).sort(),['at','frequency']);assert.equal(starts[0].frequency,440);assert.ok(Number.isFinite(starts[0].at)&&starts[0].at>=0);}
function evidenceFor(id,e){
  assert.ok(e&&typeof e==='object'&&!Array.isArray(e),id+' evidence object');
  assert.deepEqual(Object.keys(e).sort(),[...Object.keys(fixed[id]||{}),...(extraKeys[id]||[])].sort(),id+' exact observation schema');
  for(const [key,value]of Object.entries(fixed[id]||{}))assert.deepEqual(e[key],value,id+'/'+key);
  if(id==='EXPORT-CHOICE-NARROW-ONE-DOWNLOAD'){
    assert.equal(e.count,1);assert.deepEqual(Object.keys(e.box).sort(),['height','width','x','y']);
    for(const value of Object.values(e.box))assert.ok(Number.isFinite(value));
    assert.ok(e.box.width>0&&e.box.height>0&&e.box.x>=0&&e.box.x+e.box.width<=320&&e.box.y>=0);
  }
  if(['EXPORT-ARTWORK-SIZE-RELOAD-INPUT','EXPORT-ARTWORK-IFRAME'].includes(id))stage(e.box);
  if(id==='EXPORT-ARTWORK-AUDIO-PERMITTED')oneTone(e.starts);
  if(id==='EXPORT-ARTWORK-IMAGE-PEN-STOP'){assert.ok(e.images.length>0);for(const image of e.images){assert.deepEqual(Object.keys(image).sort(),['complete','width']);assert.equal(image.complete,true);assert.ok(Number.isFinite(image.width)&&image.width>0);}}
  if(id==='EXPORT-ARTWORK-CACHED-RETURN')assert.equal(typeof e.nativeCacheRestored,'boolean');
  if('before'in e){
    assert.deepEqual(e.after,e.before,id+' current work retained');
    assert.equal(typeof e.before.project,'string');assert.ok(Array.isArray(JSON.parse(e.before.project).scripts));
    assert.equal(typeof e.before.source,'string');assert.equal(typeof e.before.dirty,'boolean');
    assert.ok(Number.isInteger(e.before.history)&&e.before.history>=1);assert.ok(Number.isInteger(e.before.redo)&&e.before.redo>=0);
  }
  if(['OPEN-ALTERNATE-ROUTE-PROTECTED','OPEN-CHANGED-AFTER-APPROVAL'].includes(id)){assert.equal(e.dialogs.length,1);assert.match(e.dialogs[0],/保存していない編集/);}
  if(id==='OPEN-RECOVERY-SAVED-DRAFT-CLEAN'){
    assert.deepEqual(e.variants.map(x=>x.kind),['code','blocks']);
    for(const variant of e.variants){assert.equal(variant.savedUnchangedConfirmation,false);assert.equal(variant.pickers,1);}
    assert.equal(e.variants[1].cancelledSavedPendingConfirmation,true);
  }
  if(id.startsWith('EXPORT-AUDIO-WAIT-')){
    stage(e.stage);oneTone(e.starts);assert.equal(e.startsBefore,0);assert.equal(e.phaseBefore,'WAITING');assert.equal(e.outputBefore,'');assert.equal(e.duplicateInput,false);
    assert.deepEqual(Object.keys(e.box).sort(),['height','width','x','y']);for(const value of Object.values(e.box))assert.ok(Number.isFinite(value));
    assert.ok(e.box.width>0&&e.box.height>0&&Math.abs(e.box.x+e.box.width/2-320)<1&&Math.abs(e.box.y+e.box.height/2-200)<1);
    assert.deepEqual(e.colors,{background:'rgb(255, 255, 255)',color:'rgb(0, 0, 0)',border:'rgb(0, 0, 0)',opacity:'1'});
  }
}
function verifyExportOpen(report, inputs){
  assert.equal(report.schema,'akari-export-open-v1');
  assert.deepEqual(report.snapshot,inputs,'current candidate snapshot required');
  assert.equal(report.productSha256,inputs.productSha256);
  assert.deepEqual(report.results.map(r=>r.id),ids,'all cases once, in the declared order');
  assert.equal(report.status,'PASS');
  for(const result of report.results){assert.equal(result.status,'PASS',result.id);evidenceFor(result.id,result.evidence);}
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);
}
function checkEvidenceNegatives(report,inputs){
  // Check the observation validator separately, even when a product case failed.
  for(const result of report.results.filter(r=>r.status==='PASS'))evidenceFor(result.id,result.evidence);
  const change=(id,mutate)=>{const item=structuredClone(report.results.find(r=>r.id===id));assert.equal(item.status,'PASS');mutate(item.evidence);assert.throws(()=>evidenceFor(id,item.evidence),id+' false PASS must be rejected');};
  change('EXPORT-CHOICE-CANCEL-FOCUS',e=>e.downloads=7);
  change('EXPORT-ARTWORK-SIZE-RELOAD-INPUT',e=>e.box.width=-1);
  change('EXPORT-ARTWORK-AUDIO-PERMITTED',e=>e.starts.push({...e.starts[0]}));
  change('OPEN-DIRTY-CANCEL-STATE-KEYBOARD',e=>e.after.project='{}');
  change('EXPORT-ARTWORK-INVALID-AUDIO',e=>e.errorCode='WAITING');
  change('EXPORT-ARTWORK-AUDIO-DEVICE-ERROR',e=>e.errorCode='WAITING');
  change('EXPORT-AUDIO-WAIT-MOUSE',e=>e.startsBefore=1);
  const fabricated=structuredClone(report);fabricated.status='PASS';for(const r of fabricated.results){r.status='PASS';r.evidence={width:-1,starts:99,downloads:7};}
  assert.throws(()=>verifyExportOpen(fabricated,inputs),'fabricated PASS must be rejected');
  for(const [mutate,reason] of [[r=>r.results.pop(),'all cases once, in the declared order'],[r=>r.results.push(r.results[0]),'all cases once, in the declared order'],[r=>r.snapshot.productSha256='invalid','current candidate snapshot required']]){
    const copy=structuredClone(fabricated);mutate(copy);
    assert.throws(()=>verifyExportOpen(copy,inputs),error=>error.code==='ERR_ASSERTION'&&error.message.includes(reason),'the targeted envelope guard must reject');
  }
}
module.exports={ids,verifyExportOpen,checkEvidenceNegatives};
