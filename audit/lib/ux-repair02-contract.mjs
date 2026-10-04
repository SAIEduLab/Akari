import fs from 'node:fs';
import assert from 'node:assert/strict';
import {verifySemanticExtension} from './semantic-extension-contract.mjs';
import {browserEnvironment} from './browser-environment.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL('../fixtures/'+name,import.meta.url)));
const language=read('ux-repair02-expectations.json'),matrix=read('ux-repair02-matrix.json').cases,speech=read('ux-repair02-speech.json');
export const repairBrowserIds=['diagnostics/current-source','editor/wrap-and-source','editor/enter-indent','controls/palette-and-search','controls/repeat-escape','controls/operand-types','controls/quoted-list-recovery','headings/owner-and-opening','runtime/preparation-failure','runtime/stale-preparation','runtime/question-cancel-and-rerun','editor/synthetic-composition'];
export function verifyRepairLanguage(r){
 const n=verifySemanticExtension(r,'akari-ux-repair02-language-v1',[...language.cases,...language.refusals,...language.taskCases].map(c=>c.id));
 for(const c of language.cases){const o=r.results.find(r=>r.id===c.id).observed;assert.equal(o.source,c.source);assert.deepEqual(o.errors,[]);assert.deepEqual(o.trace,[[0,'sprite-1',c.speech],[2000,'sprite-1',null]]);assert.deepEqual(o.questions,c.question?[c.question]:[]);for(const k of ['sourceExact','blockRoundtrip','rerun'])assert.equal(o[k],true);if(c.score!==undefined)assert.equal(o.score,c.score);}
 for(const c of language.refusals){const o=r.results.find(r=>r.id===c.id).observed;assert.equal(o.source,c.source);assert.deepEqual(o.errors,[c.code]);assert.deepEqual(o.trace,[]);if(c.phase){assert.equal(o.rejectionPhase,c.phase);assert.deepEqual(o.compileErrors,[c.code]);assert.deepEqual(o.syntaxErrors,c.phase==='syntax'?[c.code]:[]);}}
 for(const c of language.taskCases){const o=r.results.find(r=>r.id===c.id).observed;assert.deepEqual(o.sources,c.scripts.map(s=>s.source));assert.deepEqual(o.errors,[]);assert.deepEqual(o.questions,c.questions);assert.deepEqual(o.questionOwners,c.questionOwners);assert.deepEqual(o.trace,c.trace);assert.deepEqual(o.blockedBeforeAnswers,c.questions.map((question,i)=>({question,owner:c.questionOwners[i],trace:[]})));const visible=Object.fromEntries(c.trace.filter(([at,,text])=>at===1000&&text!==null).map(([,id,text])=>[id,text]));assert.deepEqual(o.samples,[{at:999,visible:{}},{at:1000,visible},{at:2999,visible},{at:3000,visible:{}}]);for(const key of ['sourceExact','blockRoundtrip','rerun','answerOwnership'])assert.equal(o[key],true);}
 return n;
}
export function verifyRepairBrowser(r){const n=verifySemanticExtension(r,'akari-ux-repair02-browser-v1',repairBrowserIds);assert.ok(!r.hostFailure);assert.equal(r.environment.browser,browserEnvironment.version);assert.equal(r.environment.playwright,browserEnvironment.playwright);const at=id=>r.results.find(r=>r.id===id).observed;
 const required={
 'diagnostics/current-source':['staleErrorCleared','runAccepted','sourceExact'],'editor/wrap-and-source':['sourceExact','historyUnchanged'],'editor/enter-indent':['finalOutside','undoRedo','caretAfterIndent','meaningfulSpacesPreserved'],
 'controls/palette-and-search':['untimedDistinct','searchPreserved','searchRestoredWithoutEdit'],'controls/repeat-escape':['escapePreservesDraft','incompleteRunRefused','explicitCancelAtomic','fullTextCancelPreservesDraft','threeFromEmpty','expressionCount'],
 'controls/operand-types':['otherOperandPreserved','explicitTypeSelection','undoRedo'],'controls/quoted-list-recovery':['quotePreservedInitially','explicitReferenceChoice','listUnchanged','undo','localOwnerPreserved','redo','parentActorOwner','stageOwner'],
 'headings/owner-and-opening':['openingPreservesSource','openingPreservesHistory','scopedDataPicker'],'runtime/preparation-failure':['injected','detailVisible','projectPreserved','retrySucceeded'],
 'runtime/stale-preparation':['injected','cancelledGenerationIgnored','newRunPreserved','projectPreserved'],'runtime/question-cancel-and-rerun':['cancelStops','newAnswerEmpty'],
 'editor/synthetic-composition':['synthetic','modeBlockedDuringComposition','baselinePreserved','cancelPreservesBaseline']};for(const [id,keys]of Object.entries(required))for(const k of keys)assert.equal(at(id)[k],true,id+'/'+k);
 assert.equal(at('headings/owner-and-opening').dataOwnerSpeech,'7');assert.deepEqual(at('editor/enter-indent').moves.map(m=>m.kind),['repeat','branch']);assert.ok(at('editor/enter-indent').moves.every(m=>m.rangePreserved===true&&m.undoRedo===true));assert.deepEqual(at('editor/enter-indent').pasteCases,['line-start','line-end']);assert.deepEqual(at('controls/quoted-list-recovery').ordinals,['りんご','パン','牛乳']);assert.equal(at('editor/enter-indent').indent,2);assert.equal(at('editor/enter-indent').bodyCount,2);assert.equal(at('controls/palette-and-search').timedSeconds,2);assert.equal(at('controls/palette-and-search').consecutive,2);assert.equal(at('controls/repeat-escape').directCount,2);assert.equal(at('controls/quoted-list-recovery').ordinalOnly,2);assert.equal(at('controls/quoted-list-recovery').localSpeech,'ノート');assert.deepEqual(at('controls/operand-types').results,[{answer:'ほし',text:'どうぞ'},{answer:'つき',text:'もういちど'}]);assert.deepEqual(at('headings/owner-and-opening').owners,['あかり','だんご']);assert.equal(at('runtime/preparation-failure').actualIntermittentCauseConfirmed,false);assert.equal(at('runtime/question-cancel-and-rerun').speech,'ちがうよ');assert.equal(at('editor/synthetic-composition').realIME,false);assert.equal(at('editor/synthetic-composition').committedText,'日本語');return n;
}
const scriptSources=p=>p.scripts.map(({id,targetId,event,source})=>({id,targetId,event,source}));
export function verifyMatrixObserved(c,mode,o){
 assert.equal(o.ordinaryGUI,true);assert.equal(o.privateApiEdit,false);
 assert.equal(o.preparedInitialSource,c.initial.preparedSource,c.id+'/prepared source');
 assert.deepEqual(scriptSources(o.initialProject),c.initial.scripts,c.id+'/actual initial script bodies');
 assert.equal(o.initialProject.projectData.variables.find(v=>v.name==='点数').initialValue,c.initial.score);
 assert.deepEqual(o.initialProject.projectData.lists.find(v=>v.name==='買うもの').initialValue,c.initial.shopping);
 const owned=o.finalProject.scripts.find(s=>'script:'+s.id===o.owner);assert.ok(owned,c.id+'/result owner has a real script');assert.equal(o.source,owned.source,c.id+'/recorded result source matches that body');
 assert.equal(o.meaning.classification,'actual GUI result / separate exact virtual clock');assert.deepEqual(o.meaning.inputSources,scriptSources(o.finalProject));
 assert.deepEqual(o.meaning.executions,c.virtualRuns.map(x=>x.expected),c.id+'/exact timing, visible overlap, values and clears');
 if(c.initialVirtual){assert.equal(o.initialMeaning.classification,'actual GUI result / separate exact virtual clock');assert.deepEqual(o.initialMeaning.inputSources,scriptSources(o.initialProject));assert.deepEqual(o.initialMeaning.executions,[c.initialVirtual.expected]);}
 else assert.equal(o.initialMeaning,null);
 if(c.noEdit){assert.equal(o.source,c.source,c.id+'/no-edit original source');assert.deepEqual(scriptSources(o.finalProject),scriptSources(o.initialProject));}
 if(c.id==='B12'){
  const expected=structuredClone(c.initial.scripts);expected.find(s=>s.id==='main').source=c.source;
  assert.deepEqual(scriptSources(o.finalProject),expected,'B12 changes only the documented wait 3 to 1; all other bodies and owners remain exact');
  assert.equal(o.source,c.source);assert.deepEqual(o.finalProject.components,o.initialProject.components);assert.deepEqual(o.finalProject.projectData,o.initialProject.projectData);
 }
 if(c.id==='B23'){assert.deepEqual(o.finalProject.scripts.find(s=>s.id==='main'),o.initialProject.scripts.find(s=>s.id==='main'));assert.equal(o.finalProject.scripts.filter(s=>s.targetId==='sprite-1'&&s.event==='start').length,1);}
 if(c.answers)assert.deepEqual(o.runtime,c.answers.map(([answer,text])=>({answer,text})));
 else{assert.equal(o.runtime.length,c.rerun?2:1);for(const trace of o.runtime){assert.deepEqual(trace.map(t=>t.text),c.speech);assert.deepEqual(trace.map(t=>t.actor),c.id==='B08'?['dango']:['B10','B11','B12','B23'].includes(c.id)?['sprite-1','dango']:c.speech.map(()=> 'sprite-1'));}}
}
export function verifyRepairMatrix(r){const ids=['code','blocks'].flatMap(m=>matrix.map(c=>c.id+'/'+m)),n=verifySemanticExtension(r,'akari-ux-repair02-matrix-v1',ids);assert.ok(!r.hostFailure);assert.equal(r.environment.browser,browserEnvironment.version);for(const row of r.results){const [id,mode]=row.id.split('/'),c=matrix.find(c=>c.id===id);assert.equal(row.original,c.fixedOriginal||c.source);verifyMatrixObserved(c,mode,row.observed);}return n;}
export function verifyRepairLayout(r){const ids=[[1188,848],[1188,761],[1366,768],[1024,768],[390,844]].flatMap(([w,h])=>['light','dark'].flatMap(t=>['B01','B04','B10','B13','B15'].flatMap(b=>[100,75].map(z=>`${b}/${w}x${h}/${t}/${z}`))));const n=verifySemanticExtension(r,'akari-ux-repair02-layout-v1',ids);assert.ok(!r.hostFailure);for(const row of r.results){const o=row.observed,g=o.geometry;assert.equal(o.sourceExact,true);assert.equal(o.historyUnchanged,true);assert.equal(g.source,matrix.find(c=>row.id.startsWith(c.id+'/')).source);assert.ok(g.workspace.bottom<=g.navigation.top+1);assert.ok(g.world.right<=g.workspace.right+2);assert.ok(g.world.left>=g.workspace.left-2);assert.ok(g.main.every(r=>r.left>=g.workspace.left-2));assert.ok(g.main.length>0&&g.main.every(r=>r.right<=g.workspace.right+2));}return n;}
export function verifyRepairSpeech(r){const ids=speech.positions.flatMap(p=>speech.scales.flatMap(s=>speech.texts.map((_,i)=>`${p}/${s}/${i}`))),n=verifySemanticExtension(r,'akari-ux-repair02-speech-v1',ids);assert.ok(!r.hostFailure);const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));for(const row of r.results){const [,scale,ti]=row.id.split('/'),text=speech.texts[Number(ti)],expected=typeof text==='number'?['あ'.repeat(text),'だ'.repeat(text)]:[text,text],o=row.observed,g=o.geometry;assert.deepEqual(o.texts,expected);assert.deepEqual(o.full,expected);assert.deepEqual(g.bubbles.map(b=>b.text),expected);assert.deepEqual(g.bubbles.map(b=>b.speaker),['あかり','だんご']);assert.equal(o.fullTextExact,true);assert.equal(o.twoSecondDuration,true);assert.equal(o.noOverlap,true);assert.equal(o.insideVisibleStage,true);const inside=(r,b)=>r.left>=b.left-1&&r.top>=b.top-1&&r.right<=b.right+1&&r.bottom<=b.bottom+1;assert.ok(g.bubbles.every(b=>inside(b.rect,g.stage)&&inside(b.rect,g.viewport)));assert.equal(o.durations.length,2);assert.ok(o.durations.every(ms=>ms>=1850&&ms<=2400));assert.ok(Math.abs(g.scale-Number(scale)/100)<.006);assert.equal(overlap(g.bubbles[0].rect,g.bubbles[1].rect),0);assert.ok(g.bubbles.every(b=>g.actors.every(a=>overlap(b.rect,a)===0)&&b.font>=13.5));if(Number(ti)<3)assert.ok(g.bubbles.every(b=>!b.clipped&&b.ink.height>=13.5&&b.ink.bottom<=b.textBox.bottom+1));else assert.ok(g.bubbles.every(b=>!b.clipped||b.full));}return n;}
export const repairInputs=[['ux-repair02-language.json',verifyRepairLanguage],['ux-repair02-browser.json',verifyRepairBrowser],['ux-repair02-matrix.json',verifyRepairMatrix],['ux-repair02-layout.json',verifyRepairLayout],['ux-repair02-speech.json',verifyRepairSpeech]];
export const repairWrongMeaning=[['ux-repair02-language.json',r=>r.results[0].observed.trace[0][2]='誤答'],['ux-repair02-browser.json',r=>r.results.find(r=>r.id==='controls/repeat-escape').observed.explicitCancelAtomic=false],['ux-repair02-matrix.json',r=>r.results[0].observed.runtime[0][0].text='誤答'],['ux-repair02-layout.json',r=>r.results[0].observed.geometry.workspace.bottom=r.results[0].observed.geometry.navigation.top+20],['ux-repair02-speech.json',r=>r.results[0].observed.full[0]='欠落']];

// Additional semantic controls; the original 141 + 30 controls remain intact.
export const repairMatrixWrongMeaning=[
 ['B12-wait-three-seconds',r=>{const o=r.results.find(r=>r.id==='B12/blocks').observed;o.meaning.executions[0].trace.find(e=>e.kind==='say'&&e.actor==='dango').at=3000;}],
 ['B10-serialized',r=>{const o=r.results.find(r=>r.id==='B10/code').observed;o.meaning.executions[0].trace.find(e=>e.kind==='say'&&e.actor==='dango').at=5000;}],
 ['wrong-initial-source',r=>r.results.find(r=>r.id==='B20/blocks').observed.preparedInitialSource='点数を99にする。'],
 ['wrong-result-source',r=>{const o=r.results.find(r=>r.id==='B12/code').observed;o.source=o.source.replace('1秒待って','3秒待って');}],
 ['B12-other-body-changed',r=>{const o=r.results.find(r=>r.id==='B12/blocks').observed;o.finalProject.scripts.find(s=>s.id==='main').source=o.finalProject.scripts.find(s=>s.id==='main').source.replace('あか','別の発話');}],
 ['missing-required-rerun',r=>r.results.find(r=>r.id==='B02/blocks').observed.runtime.pop()],
 ['B20-initial-zero-lost',r=>r.results.find(r=>r.id==='B20/code').observed.meaning.executions[0].samples[0].score=1],
 ['virtual-input-not-final-source',r=>r.results.find(r=>r.id==='B18/blocks').observed.meaning.inputSources[0].source='2×3を2秒話す。'],
];
export const repairViewportWrongMeaning=[
 ['ux-repair02-speech.json','outside-visible-stage',r=>{const g=r.results[0].observed.geometry;g.bubbles[0].rect.left=Math.min(g.stage.left,g.viewport.left)-20;}],
 ['ux-repair02-layout.json','left-edge-clipped',r=>{const g=r.results[0].observed.geometry;g.world.left=g.workspace.left-20;}],
];
export const repairLanguageWrongMeaning=[
 ['wrong-task-answer-owner',r=>r.results.find(r=>r.id==='ask-task-answer-ownership-cross-speakers').observed.trace[0][2]='ほし'],
 ['wrong-refusal-phase',r=>r.results.find(r=>r.id==='addition-unit-mismatch').observed.rejectionPhase='runtime'],
];
