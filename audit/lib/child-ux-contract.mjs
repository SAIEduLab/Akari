import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha,snapshot} from './product-test-host.mjs';
import {currentProductFile} from './product-path.cjs';
import {childUxProvenance} from './child-ux-observations.mjs';
import {verifyRepairMatrix} from './ux-repair02-contract.mjs';
import {childLanguageUiIds,childInsertionConceptHints,verifyChildLanguageUi} from './child-language-ui-contract.mjs';
import {blockMeaning} from './child-ux-blocks.mjs';
export const taskIds=Array.from({length:24},(_,i)=>'B'+String(i+1).padStart(2,'0'));
export const requirementIds=['A1','A2','A3','B1','B2','B3','B4','C1','C2','C3','D1','D2','D3','E1','E2','E3','F1','F2','G1','H1','H2'];
const read=p=>JSON.parse(fs.readFileSync(p));
export const plan=read('audit/fixtures/child-ux-plan.json'),scope=read('audit/fixtures/child-ux-scope.json');
const matrix=read('audit/fixtures/ux-repair02-matrix.json').cases;
export const currentInputs=()=>snapshot(currentProductFile());
export const approvedInputAdapter={file:'audit/tests/ux-repair-language.mjs',before:'assert.deepEqual(runClock(old,p,[]),expected);',after:'const oldProject=plain(p);delete oldProject.stage.showSpeechNames;assert.deepEqual(runClock(old,oldProject,[]),expected);',afterSha256:'4a58d5cbd62b3f22e4bef8bded44f38a15dd04437301039eb2cf5753f7b2e302'};
export function verifyProtectedInput(file,bytes,expected){
  if(file===approvedInputAdapter.file){
    assert.equal(sha(bytes),approvedInputAdapter.afterSha256,'only the approved legacy comparison input adapter');
    const text=bytes.toString('utf8');assert.equal(text.split(approvedInputAdapter.after).length,2);
    bytes=Buffer.from(text.replace(approvedInputAdapter.after,approvedInputAdapter.before));
  }
  assert.equal(sha(bytes),expected,'unchanged prior product/spec/oracle: '+file);
}
export function verifyFrozenInputs(){
  assert.equal(sha(fs.readFileSync('audit/fixtures/child-ux-plan.json')),'e18f5596669ec18d63cc2879f0d92e0cf98f88c2eb58a22e683e47677112ac10','fixed supplemental task plan');
  assert.equal(sha(fs.readFileSync('audit/fixtures/child-ux-scope.json')),'0ada863f056998e11f79fc4436c65568845c9d951a0b618af40b036206363c6b','fixed pre-addition boundary');
  assert.equal(currentProductFile(),scope.product);
  for(const [file,expected]of Object.entries(scope.protectedFiles))verifyProtectedInput(file,fs.readFileSync(file),expected);
  for(const [file,record]of Object.entries(scope.appendOnlyFiles))assert.equal(sha(fs.readFileSync(file).subarray(0,record.bytes)),record.sha256,'existing audit contract kept byte-exact: '+file);
  const before=scope.acceptanceWorkflow.split(/\r?\n/),after=fs.readFileSync('.github/workflows/akari-acceptance.yml','utf8').split(/\r?\n/);let at=0;
  for(const line of before){while(at<after.length&&after[at]!==line)at++;assert.ok(at<after.length,'existing workflow line retained: '+line);at++;}
  const benchmark=read('audit/fixtures/ux-repair-benchmark.json');
  assert.deepEqual(plan.taskIds,taskIds);assert.deepEqual(plan.order,benchmark.order);assert.deepEqual(plan.tasks.map(t=>t.id),taskIds);
  for(const [i,t]of plan.tasks.entries()){
    const b=benchmark.cases.find(x=>x.id===t.id&&x.mode==='code');assert.equal(t.expected.meaning,b.fixedExpected);assert.equal(t.recoveryCondition,b.requiredAction);
    assert.equal(t.expected.fixture,'audit/fixtures/ux-repair02-matrix.json');assert.equal(t.expected.pointer,'/cases/'+i+'/virtualRuns');assert.equal(t.expected.independent,true);
    assert.deepEqual(t.modes,['blocks','code']);assert.ok(t.operationSteps.length>=4);assert.equal(t.preconditions.preparationIsNotTaskSuccess,true);
    if(i<21)assert.equal(t.purpose,['読む','作る','直す'][i%3]);
  }
  assert.deepEqual(plan.requirements.map(r=>r.id),requirementIds);
  assert.equal(plan.persona.entryGrade,3);assert.equal(plan.persona.kanjiAssignmentIsNotComprehension,true);assert.equal(plan.comparison.requiredCI,false);
  for(const r of plan.requirements){assert.ok(['EXISTING','GAP_FILLED','HUMAN_REQUIRED'].includes(r.classification));assert.ok(r.testIds.length&&r.job&&r.evidence&&r.verifier);}
  return {protectedFiles:Object.keys(scope.protectedFiles).length,byteExactFiles:Object.keys(scope.protectedFiles).length-1,inputOnlyAdapters:1,tasks:24,requirements:requirementIds.length,productSha256:scope.protectedFiles[scope.product]};
}
export function verifyProvenance(p,expected=childUxProvenance(),platform=expected.platform){
  for(const key of ['repository','testedCommit','candidateCommit','run','attempt'])assert.equal(p?.[key],expected[key],'execution provenance '+key);
  assert.equal(p.platform,platform);assert.equal(p.workingTreeDirty,expected.workingTreeDirty);assert.match(p.node,/^v24\./);
  assert.match(p.testedCommit,/^[a-f0-9]{40}$/);assert.match(p.candidateCommit,/^[a-f0-9]{40}$/);assert.match(p.attempt,/^[1-9]\d*$/);
  assert.ok(p.fontFiles.length);for(const f of p.fontFiles){assert.equal(typeof f.present,'boolean');if(f.present)assert.match(f.sha256,/^[a-f0-9]{64}$/);else assert.equal(f.sha256,null);}
  assert.equal(p.inputKind,'browser automation; composition events are synthetic; real OS IME is UNVERIFIED');
}
function artifact(base,a){
  assert.ok(a&&typeof a.path==='string'&&!path.isAbsolute(a.path)&&!a.path.split(/[\\/]/).includes('..'),'contained artifact reference');
  const f=path.resolve(base,a.path);assert.ok(f.startsWith(path.resolve(base)+path.sep));assert.ok(!fs.lstatSync(f).isSymbolicLink());assert.equal(sha(fs.readFileSync(f)),a.sha256);
}
export function verifyChildMatrix(r,inputs,provenance,file){
  verifyRepairMatrix(r);assert.deepEqual(r.snapshot,inputs);verifyProvenance(r.childUxProvenance,provenance);assert.equal(typeof file,'string');
  for(const row of r.results){
    const [id,mode]=row.id.split('/'),c=matrix.find(c=>c.id===id),trip=row.observed.roundtrip;
    assert.deepEqual(trip?.route,[mode,mode==='code'?'blocks':'code',mode]);assert.equal(trip.observations?.length,3);
    const first=trip.observations[0].state;
    assert.equal(first.projectSha256,sha(Buffer.from(JSON.stringify(row.observed.finalProject))));assert.equal(first.source,row.observed.source);assert.equal(first.owner,row.observed.owner);
    for(const [i,o]of trip.observations.entries()){
      const s=o.state;assert.equal(s.mode,trip.route[i]);assert.equal(s.domMode,s.mode);assert.equal(s.codeVisible,s.mode==='code');assert.equal(s.blockVisible,s.mode==='blocks');
      for(const key of ['projectSha256','source','owner','history','redo','dirty'])assert.deepEqual(s[key],first[key],id+'/roundtrip keeps '+key);
      if(s.mode==='code')assert.equal(s.codeText,s.source);assert.ok(typeof s.font==='string'&&s.font.length);
      assert.deepEqual(o.meaning.inputSources,row.observed.meaning.inputSources);
      assert.deepEqual(o.meaning.executions,c.virtualRuns.map(v=>v.expected),id+'/independent expected meaning after actual mode change');
      for(const key of ['projectSha256','source','owner','history','redo','dirty'])assert.deepEqual(o.afterBlockNavigation[key],s[key],'block document navigation preserves '+key);
      if(s.mode==='blocks')assert.deepEqual(blockMeaning(o.blockDocuments,row.observed.finalProject,c.virtualRuns,id),c.virtualRuns.map(v=>v.expected),id+'/actual displayed blocks have the independent intended meaning');
      else assert.equal(o.blockDocuments,null);
    }
    const f=file+'.artifacts/'+row.id.replace('/','-')+'.png';assert.ok(fs.statSync(f).size>0,'actual task screenshot');
  }
  return {status:'PASS',tasks:24,routes:48,meaningObservations:144,independentUX:'UNVERIFIED',realChild:'UNVERIFIED',realIME:'UNVERIFIED'};
}
export function vocabularyCandidates(source,frames){
  const candidates=new Map(),lexemes=text=>[...String(text).matchAll(/[\p{Script=Han}々]+|[ァ-ヴー]{2,}/gu)].map(m=>m[0]);
  const row=term=>{if(!candidates.has(term))candidates.set(term,{term,sourceLines:[],screens:[],readings:[],supportReferences:[],humanStatus:'UNVERIFIED'});return candidates.get(term);};
  source.split(/\r?\n/).forEach((line,i)=>{for(const term of new Set(lexemes(line)))row(term).sourceLines.push(i+1);});
  for(const f of frames)for(const observation of f.rows)for(const term of new Set(lexemes(observation.text))){const r=row(term);if(!r.screens.includes(f.name))r.screens.push(f.name);for(const ruby of observation.readings)if(ruby.text.includes(term)&&ruby.reading&&!r.readings.includes(ruby.reading))r.readings.push(ruby.reading);}
  for(const r of candidates.values())if(plan.vocabulary.knownSupportTerms.includes(r.term))r.supportReferences.push({file:'child-language-ui.json',validator:'verifyChildLanguageUi',claim:'existing G3 structural support reference; individual child comprehension is UNVERIFIED'});
  return [...candidates.values()].sort((a,b)=>a.term.localeCompare(b.term,'ja'));
}
export function verifyChildLanguage(r,inputs,provenance,file,inventory){
  verifyChildLanguageUi(r,inputs,r.environment);verifyProvenance(r.childUxProvenance,provenance);assert.equal(r.environment,provenance.platform);
  assert.ok(Array.isArray(r.uiInventoryArtifacts));
  const artifacts=[...r.artifacts,...r.uiInventoryArtifacts];assert.equal(new Set(artifacts.map(a=>a.path)).size,artifacts.length);
  for(const a of artifacts)artifact(path.dirname(file),a);
  assert.ok(Array.isArray(r.uiInventoryFrames)&&r.uiInventoryFrames.length);
  for(const id of childLanguageUiIds)assert.equal(r.uiInventoryFrames.filter(f=>f.name==='task-'+id).length,1,'real frame for '+id);
  assert.equal(r.uiInventoryFrames.filter(f=>f.name==='child-block-words-open').length,1);
  // Independent task requirements, not a minimum row count copied from a report.
  const editor=['runBtn','saveBtn','objectSelect','eventSelect','undoBtn','redoBtn'];
  const regions={
    'task-CHILD-UI-ACTION-HELP':editor,'task-CHILD-UI-COPY-SEMANTICS':editor,
    'task-CHILD-UI-DATA-EXAMPLES':['dataKind','dataName','dataAdd','dataClose'],
    'task-CHILD-UI-PROCEDURE-EXAMPLES':['callableSelect','callableNewAction','callableNewFunction','callableSave','procClose'],
    'task-CHILD-UI-BLOCK-WORDS':editor,'task-CHILD-UI-PAINT-MATERIALS':editor,
    'task-CHILD-UI-RESPONSIVE-WORDS':editor,'task-CHILD-UI-TOUCH-HELP':editor,
    'child-data-examples':['dataKind','dataName','dataAdd','dataClose'],
    'child-procedure-examples':['callableSelect','callableSave','procClose'],
    'child-block-words-open':editor,'child-paint-transparent':['paintShape','paintUndo','paintRedo','paintCancel','paintCommit'],
    'child-materials':['imageObjectAdd','paintAdd','soundQuickAdd'],
    'child-words-1180':editor,'child-words-1188':editor,'child-words-390':editor,
    'child-touch-help-top':['saveActionHelp','exportActionHelp','dataActionHelp'],
    'child-touch-help-tail':['bodyActionHelp','dataActionHelp'],
  };
  for(const [name,ids]of Object.entries(regions)){
    const frames=r.uiInventoryFrames.filter(f=>f.name===name);assert.equal(frames.length,1,'fixed observed UI region '+name);
    for(const id of ids)assert.equal(frames[0].rows.filter(o=>o.id===id).length,1,'independent required visible control/support '+name+'/'+id);
  }
  const words=r.uiInventoryFrames.find(f=>f.name==='child-block-words-open').rows;
  for(const expected of Object.values(childInsertionConceptHints))assert.ok(words.some(o=>o.text===expected),'fixed visible command/body/palette explanation');
  const top=r.uiInventoryFrames.find(f=>f.name==='child-touch-help-top').rows;
  for(const [id,term,reading]of [['saveActionHelp','保存','ほぞん'],['exportActionHelp','書き出し','かきだし'],['dataActionHelp','変数','へんすう']])assert.ok(top.find(o=>o.id===id).readings.some(r=>r.text.includes(term)&&r.reading===reading),'fixed visible reading support '+term);
  for(const f of r.uiInventoryFrames){
    assert.ok(f.viewport.width>0&&f.viewport.height>0&&f.dpr>0);assert.ok(f.font.declared&&f.font.width>0);assert.ok(f.rows.length);
    for(const o of f.rows){assert.equal(o.hit,true);assert.ok(o.text.trim()&&o.rect.width>0&&o.rect.height>0);const x=o.rect.x+o.rect.width/2,y=o.rect.y+o.rect.height/2;assert.ok(x>=0&&x<f.viewport.width&&y>=0&&y<f.viewport.height);assert.ok(Array.isArray(o.readings));}
    assert.ok(artifacts.some(a=>a.path===f.artifact.path&&a.sha256===f.artifact.sha256));artifact(path.dirname(file),f.artifact);
  }
  const expected=vocabularyCandidates(fs.readFileSync(currentProductFile(),'utf8'),r.uiInventoryFrames);
  assert.deepEqual(inventory,expected,'unknown vocabulary cannot be dropped or auto-approved');
  return {status:'PASS',structuralSupportCases:childLanguageUiIds.length,frames:r.uiInventoryFrames.length,candidates:inventory.length,humanReviewed:0,humanUnverified:inventory.length,childComprehension:'UNVERIFIED',sourceScan:'candidate lexemes, not a claim that every source literal is a child-facing label'};
}
export function verifyManualSession(s){
  assert.equal(s.schema,'akari-child-ux-manual-session-v1');assert.ok(['AI_PROXY','ADULT_PROXY','CHILD_OBSERVATION'].includes(s.actor));assert.ok(taskIds.includes(s.task));assert.ok(['code','blocks','scratch-ja'].includes(s.mode));
  assert.ok(['PASS','FAIL','UNVERIFIED'].includes(s.observationStatus));assert.equal(s.technicalOnly,false);assert.ok(Array.isArray(s.assistance)&&Array.isArray(s.events));
  assert.equal(typeof s.priorProductExperience,'boolean');assert.equal(typeof s.screenOnly,'boolean');assert.equal(typeof s.firstEncounter,'boolean');
  if(s.firstEncounter)assert.equal(s.priorProductExperience,false);
  if(s.firstEncounter||s.screenOnly)assert.ok(!s.assistance.some(a=>['source','solution','manual','adult'].includes(a.kind)));
  const t=plan.tasks.find(t=>t.id===s.task),events=s.events;assert.deepEqual(events.map((e,i)=>e.sequence),events.map((e,i)=>i+1));
  let previous=-Infinity;for(const e of events){const now=Date.parse(e.at);assert.ok(Number.isFinite(now)&&now>=previous);previous=now;assert.ok(typeof e.evidence==='string'&&e.evidence.length);assert.match(e.evidenceSha256,/^[a-f0-9]{64}$/,'hashed event evidence');}
  if(s.observationStatus!=='UNVERIFIED'){
    assert.ok(s.environment?.os&&s.environment.browser&&s.environment.fonts&&s.environment.inputMethod,'record the actual environment');
    for(const dimension of ['reading','meaningAndConcepts','textInput','deviceOperation']){
      const observation=s.dimensions?.[dimension];assert.ok(observation&&['OBSERVED','UNVERIFIED'].includes(observation.status));
      if(observation.status==='OBSERVED'){assert.ok(typeof observation.evidence==='string'&&observation.evidence.length);assert.match(observation.evidenceSha256,/^[a-f0-9]{64}$/);}
    }
    for(const measure of plan.comparison.measures)assert.ok(Number.isInteger(s.interactionCounts?.[measure])&&s.interactionCounts[measure]>=0,'observed interaction count '+measure);
    const exec=events.find(e=>e.kind==='execution');assert.ok(exec);
    if(t.purpose==='読む'){const prediction=events.find(e=>e.kind==='prediction');assert.ok(prediction&&prediction.sequence<exec.sequence&&Date.parse(prediction.at)<Date.parse(exec.at)&&prediction.value);}
    if(t.purpose==='作る'){assert.equal(s.solutionProvided,false);assert.ok(events.some(e=>e.kind==='intent-only-brief'&&e.sequence<exec.sequence&&e.value));}
    if(t.purpose==='直す'){assert.ok(events.some(e=>e.kind==='cause-and-location'&&e.sequence<exec.sequence&&e.value));}
    assert.ok(events.some(e=>e.kind==='return-to-editing'&&e.sequence>exec.sequence));
  }
  assert.ok(['TASK','VOCABULARY','REAL_IME'].includes(s.auditKind));
  if(s.auditKind==='VOCABULARY'&&s.observationStatus!=='UNVERIFIED'){
    assert.ok(Array.isArray(s.vocabularyReview)&&s.vocabularyReview.length);
    for(const v of s.vocabularyReview){assert.ok(v.term&&v.reason&&['PASS','FAIL','UNVERIFIED'].includes(v.status));if(v.status==='PASS')for(const k of ['reading','plainExplanation','concreteExample','actionGuide','visibleEvidence'])assert.ok(v[k],'actual vocabulary support '+k);}
  }
  if(s.auditKind==='REAL_IME'&&s.observationStatus!=='UNVERIFIED'){
    for(const k of ['osVersion','imeName','imeVersion','fontProfile','viewport','zoom'])assert.ok(s.realIME?.[k],'actual OS IME conditions '+k);
    assert.equal(s.realIME.synthetic,false);const required=['focus','paste','composition-unconfirmed','composition-confirmed','composition-cancelled','return-to-editing'];
    for(const kind of required)assert.ok(events.some(e=>e.kind===kind),'actual IME step '+kind);
    assert.ok(events.find(e=>e.kind==='composition-unconfirmed').sequence<events.find(e=>e.kind==='composition-confirmed').sequence);
  }
  if(s.mode==='scratch-ja'&&s.observationStatus!=='UNVERIFIED'){assert.ok(s.comparison?.fixedVersion&&s.comparison.language==='ja');assert.deepEqual(s.comparison.viewport,plan.comparison.viewport);}
  assert.equal(s.claimsChildComprehension,false);assert.equal(s.claimsProductFinalAcceptance,false);
  return {status:'VALID_PROTOCOL_RECORD',observationStatus:s.observationStatus,childComprehension:'UNVERIFIED'};
}
export function verifyManualEvidence(s,base){
  for(const e of s.events)artifact(base,{path:e.evidence,sha256:e.evidenceSha256});
  for(const dimension of Object.values(s.dimensions||{}))if(dimension.status==='OBSERVED')artifact(base,{path:dimension.evidence,sha256:dimension.evidenceSha256});
}
export function verifyManualSessions(sessions,base){
  assert.ok(sessions.length,'nonempty manual log');
  const keys=sessions.map(s=>s.auditKind+'/'+s.actor+'/'+s.mode+'/'+s.task);assert.equal(new Set(keys).size,keys.length,'one session per audit kind/actor/mode/task; retain retries separately');
  return sessions.map(s=>{const result=verifyManualSession(s);verifyManualEvidence(s,base);return result;});
}
export function verifyNeeds(needs){assert.deepEqual(Object.keys(needs).sort(),['composition-acceptance','ux-repair05']);for(const n of Object.values(needs))assert.equal(n.result,'success','missing/cancelled/skipped/timed-out job is not success');}
export function verifyRetryHistory(h,p){
  assert.equal(h.schema,'akari-child-ux-retry-history-v1');assert.equal(h.run,p.run);assert.equal(h.testedCommit,p.testedCommit);assert.equal(h.attempt,p.attempt);assert.equal(h.repository,p.repository);
  assert.ok([p.candidateCommit,p.testedCommit].includes(h.workflowHeadCommit));assert.equal(h.priorAttempts.length,Number(p.attempt)-1);
  for(const [i,r]of h.priorAttempts.entries()){assert.equal(r.run_attempt,i+1);assert.equal(String(r.id),p.run);assert.equal(r.head_sha,h.workflowHeadCommit);assert.equal(r.status,'completed');assert.ok(['success','failure','cancelled','timed_out','action_required','neutral','skipped','stale','startup_failure'].includes(r.conclusion));assert.ok(r.html_url&&Array.isArray(r.jobs));for(const j of r.jobs)assert.ok(j.name&&j.conclusion&&j.html_url&&Array.isArray(j.steps));}
  return {priorAttempts:h.priorAttempts.length,instability:h.priorAttempts.some(r=>r.conclusion!=='success')?'RETRIED_AFTER_NON_SUCCESS':'NONE_RECORDED'};
}
