import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {childUxProvenance} from '../lib/child-ux-observations.mjs';
import {plan,scope,approvedInputAdapter,verifyProtectedInput,currentInputs,verifyFrozenInputs,verifyProvenance,verifyNeeds,verifyRetryHistory,verifyManualSession,verifyManualSessions,verifyChildMatrix,verifyChildLanguage,vocabularyCandidates} from '../lib/child-ux-contract.mjs';
import {matrixControlIds,languageControlIds,staticControlIds,verifyReportPlatform,sealChildBundle,verifyChildAggregate} from '../lib/child-ux-evidence.mjs';
const [mode,input,output]=process.argv.slice(2),provenance=childUxProvenance(),snapshot=currentInputs();
const read=f=>JSON.parse(fs.readFileSync(f));
const write=(file,r)=>{assert.ok(file&&!fs.existsSync(file),'fresh result required: '+file);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');};
const controls=(ids,mutations,actual,verify)=>mutations.map((mutate,i)=>{const bad=structuredClone(actual);mutate(bad);assert.throws(()=>verify(bad),ids[i]);return{id:ids[i],rejected:true};});
const proof=(schema,result,controlRows)=>({schema,status:'PASS',snapshot,provenance,result,controls:controlRows,controlClassification:'SYNTHETIC_VALIDATION_ONLY'});
function fixedAnswer(document,schema,value){
  const nodes=document.nodes,index=nodes.findIndex(n=>n.schema.startsWith('BinaryExpression:'));assert.ok(index>=0);
  const removed=new Set();nodes.forEach((n,i)=>{if(n.parent===index||removed.has(n.parent))removed.add(i);});
  const positions=new Map(nodes.filter((_,i)=>!removed.has(i)).map(n=>[nodes.indexOf(n),0]));let next=0;for(const key of positions.keys())positions.set(key,next++);
  document.nodes=nodes.filter((_,i)=>!removed.has(i)).map((n,i)=>({...n,parent:n.parent===null?null:positions.get(n.parent)}));
  Object.assign(document.nodes[positions.get(index)],{schema,title:schema==='StringLiteral'?'文字':'数',operator:null,fields:{value}});
}
function staticControls(){
  const needs={'composition-acceptance':{result:'success'},'ux-repair05':{result:'success'}},p=structuredClone(provenance);
  const manual={schema:'akari-child-ux-manual-session-v1',actor:'AI_PROXY',task:'B01',mode:'code',observationStatus:'PASS',technicalOnly:false,priorProductExperience:false,screenOnly:true,firstEncounter:true,solutionProvided:false,assistance:[],claimsChildComprehension:false,claimsProductFinalAcceptance:false,
    auditKind:'TASK',interactionCounts:Object.fromEntries(plan.comparison.measures.map(k=>[k,0])),environment:{os:'unit-control only',browser:'unit-control only',fonts:'unit-control only',inputMethod:'synthetic control'},
    dimensions:Object.fromEntries(['reading','meaningAndConcepts','textInput','deviceOperation'].map(k=>[k,{status:'UNVERIFIED'}])),events:[
    {sequence:1,kind:'prediction',at:'2026-01-01T00:00:00Z',value:'unit-control only; not an observation',evidence:'control',evidenceSha256:sha(Buffer.from('control'))},
    {sequence:2,kind:'execution',at:'2026-01-01T00:00:01Z',evidence:'control',evidenceSha256:sha(Buffer.from('control'))},
    {sequence:3,kind:'return-to-editing',at:'2026-01-01T00:00:02Z',evidence:'control',evidenceSha256:sha(Buffer.from('control'))}]};
  const history={schema:'akari-child-ux-retry-history-v1',repository:p.repository,run:p.run,attempt:'2',testedCommit:p.testedCommit,workflowHeadCommit:p.candidateCommit,priorAttempts:[{id:p.run,run_attempt:1,head_sha:p.candidateCommit,status:'completed',conclusion:'failure',html_url:'https://github.com/SAIEduLab/Akari/actions/runs/control',jobs:[{name:'control',conclusion:'failure',html_url:'control',steps:[]}]}]};
  verifyNeeds(needs);verifyProvenance(p,provenance);verifyManualSession(manual);verifyRetryHistory(history,{...p,attempt:'2'});
  const rows=[];
  for(const [i,result]of ['missing','failure','skipped','cancelled','timed_out'].entries()){const bad=structuredClone(needs);if(!i)delete bad['ux-repair05'];else bad['ux-repair05'].result=result;assert.throws(()=>verifyNeeds(bad));rows.push({id:staticControlIds[i],rejected:true});}
  for(const [i,key]of ['testedCommit','run','attempt'].entries()){const bad=structuredClone(p);bad[key]='wrong';assert.throws(()=>verifyProvenance(bad,provenance));rows.push({id:staticControlIds[i+5],rejected:true});}
  const manualMutations=[s=>{s.events[0].kind='other';},s=>{s.events[0].at=s.events[1].at;},s=>s.assistance.push({kind:'source'}),s=>{s.task='B02';s.solutionProvided=true;s.events[0].kind='intent-only-brief';},s=>s.events.pop(),s=>{s.claimsChildComprehension=true;}];
  rows.push(...controls(staticControlIds.slice(8,14),manualMutations,manual,verifyManualSession));
  rows.push(...controls(staticControlIds.slice(14,16),[h=>h.priorAttempts.pop(),h=>h.priorAttempts[0].head_sha='0'.repeat(40)],history,h=>verifyRetryHistory(h,{...p,attempt:'2'})));
  const platformReports=[['insertion-context.json',{execution:{platform:p.platform}}],['speech-name-layout.json',{environment:{os:p.platform}}],['speech-preview.json',{environment:{os:p.platform}}],['component-controls.json',{platform:p.platform}],['child-diagnostics.json',{environment:{platform:p.platform}}]];
  for(const [i,[file,report]]of platformReports.entries()){verifyReportPlatform(file,report,p.platform);const bad=JSON.parse(JSON.stringify(report).replaceAll(p.platform,p.platform==='win32'?'linux':'win32'));assert.throws(()=>verifyReportPlatform(file,bad,p.platform));rows.push({id:staticControlIds[16+i],rejected:true});}
  rows.push(...controls(staticControlIds.slice(21),[s=>delete s.events[0].evidenceSha256,s=>delete s.interactionCounts,s=>s.auditKind='VOCABULARY',s=>s.auditKind='REAL_IME'],manual,verifyManualSession));
  const manualDir=path.join(path.dirname(input),'synthetic-manual-controls');fs.mkdirSync(manualDir,{recursive:true});fs.writeFileSync(path.join(manualDir,'control'),'control');
  const task=structuredClone(manual);task.task='B02';task.events[0].kind='intent-only-brief';
  const ime=structuredClone(task);ime.auditKind='REAL_IME';ime.realIME={osVersion:'unit only',imeName:'unit only',imeVersion:'unit only',fontProfile:'unit only',viewport:[1188,848],zoom:1,synthetic:false};
  ime.events=['intent-only-brief','focus','paste','composition-unconfirmed','composition-confirmed','composition-cancelled','execution','return-to-editing'].map((kind,i)=>({sequence:i+1,kind,at:new Date(Date.UTC(2026,0,1,0,0,i)).toISOString(),value:'synthetic protocol control only',evidence:'control',evidenceSha256:sha(Buffer.from('control'))}));
  assert.equal(verifyManualSessions([task,ime],manualDir).length,2,'TASK and REAL_IME coexist for the same actor/mode/task');
  fs.writeFileSync(path.join(manualDir,'coexist.jsonl'),[task,ime].map(s=>JSON.stringify(s)).join('\n')+'\n');
  assert.throws(()=>verifyManualSessions([task,task],manualDir));rows.push({id:staticControlIds[25],rejected:true});
  const adapter=fs.readFileSync(approvedInputAdapter.file),expected=scope.protectedFiles[approvedInputAdapter.file];verifyProtectedInput(approvedInputAdapter.file,adapter,expected);
  const changedExpected=adapter.toString().replace("const expected=[[0,'dango','7']]","const expected=[[0,'dango','8']]");assert.notEqual(changedExpected,adapter.toString());
  for(const [i,bad]of [Buffer.from(changedExpected),Buffer.concat([adapter,Buffer.from('\n')])].entries()){assert.throws(()=>verifyProtectedInput(approvedInputAdapter.file,bad,expected));rows.push({id:staticControlIds[26+i],rejected:true});}
  assert.deepEqual(rows.map(r=>r.id),staticControlIds);return rows;
}
async function retryHistory(){
  const h={schema:'akari-child-ux-retry-history-v1',repository:provenance.repository,run:provenance.run,attempt:provenance.attempt,testedCommit:provenance.testedCommit,workflowHeadCommit:provenance.candidateCommit,priorAttempts:[]};
  if(provenance.run!=='local'){
    assert.match(provenance.run,/^\d+$/);assert.ok(process.env.GITHUB_TOKEN,'Actions read token required for attempt history');
    const get=async suffix=>{const r=await fetch('https://api.github.com/repos/'+provenance.repository+'/actions/runs/'+provenance.run+suffix,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+process.env.GITHUB_TOKEN,'X-GitHub-Api-Version':'2026-03-10'},signal:AbortSignal.timeout(30000),redirect:'error'});assert.equal(r.status,200,'retry-history API response');return r.json();};
    const current=await get('');assert.equal(String(current.id),provenance.run);assert.equal(current.repository.full_name,provenance.repository);assert.equal(current.run_attempt,Number(provenance.attempt));
    assert.ok([provenance.candidateCommit,provenance.testedCommit].includes(current.head_sha));h.workflowHeadCommit=current.head_sha;
    for(let attempt=1;attempt<Number(provenance.attempt);attempt++){
      const r=await get('/attempts/'+attempt),jobs=[];
      for(let page=1;;page++){const j=await get('/attempts/'+attempt+'/jobs?per_page=100&page='+page);jobs.push(...j.jobs.map(x=>({name:x.name,conclusion:x.conclusion,html_url:x.html_url,steps:x.steps.map(s=>({name:s.name,number:s.number,status:s.status,conclusion:s.conclusion}))})));if(j.jobs.length<100)break;}
      h.priorAttempts.push({id:r.id,run_attempt:r.run_attempt,head_sha:r.head_sha,status:r.status,conclusion:r.conclusion,html_url:r.html_url,jobs});
    }
  }
  verifyRetryHistory(h,provenance);return h;
}
try{
  verifyFrozenInputs();
  if(mode==='static')write(input,proof('akari-child-ux-static-v1',verifyFrozenInputs(),staticControls()));
  else if(mode==='matrix'){
    const r=read(input),result=verifyChildMatrix(r,snapshot,provenance,input),trip=(r,id='B01')=>r.results.find(x=>x.id===id+'/code').observed.roundtrip.observations[1];
    const display=(r,id='B01')=>trip(r,id).blockDocuments[0];
    const mutations=[r=>r.results.pop(),r=>r.results[1]=r.results[0],r=>r.status='FAIL',r=>r.status='SKIPPED',r=>r.status='CANCELLED',r=>{r.hostFailure='timeout';},r=>r.snapshot.productSha256='0'.repeat(64),r=>r.childUxProvenance.run='wrong',r=>r.childUxProvenance.platform='wrong',
      r=>delete r.results[0].observed.roundtrip,r=>r.results[0].observed.roundtrip.route[1]='code',r=>trip(r).state.source='wrong',r=>trip(r).state.projectSha256='0'.repeat(64),r=>trip(r).state.history++,
      r=>trip(r,'B16').meaning.executions[0].trace[0].text='23',r=>{trip(r,'B10').meaning.executions[0].trace[0].actor='dango';},r=>trip(r).meaning.executions[0].trace.reverse(),
      r=>trip(r,'B13').meaning.executions[0].trace.find(t=>t.kind==='say').text='ちがうよ',r=>trip(r,'B04').meaning.executions[0].trace.pop(),
      r=>display(r).nodes.find(n=>n.schema==='StringLiteral').fields.value='ちがう',
      r=>display(r,'B16').nodes.find(n=>n.schema==='BinaryExpression:ADD').operator='BinaryExpression:SUB',
      r=>display(r,'B07').nodes[0].fields['heading.event']='start',r=>display(r).nodes.pop(),r=>display(r).nodes[1].rendered=false,
      r=>fixedAnswer(display(r,'B16'),'StringLiteral','5'),r=>fixedAnswer(display(r,'B17'),'NumberLiteral','3'),r=>fixedAnswer(display(r,'B18'),'StringLiteral','5'),
      r=>{const nodes=display(r,'B16').nodes;nodes.find(n=>n.schema==='NumberLiteral'&&n.slot==='left').fields.value='0';nodes.find(n=>n.schema==='NumberLiteral'&&n.slot==='right').fields.value='5';},
      r=>{const nodes=display(r,'B17').nodes;nodes.find(n=>n.schema==='NumberLiteral'&&n.slot==='left').fields.value='5';nodes.find(n=>n.schema==='NumberLiteral'&&n.slot==='right').fields.value='2';},
      r=>{const nodes=display(r,'B18').nodes;nodes.find(n=>n.schema==='NumberLiteral'&&n.slot==='left').fields.value='3';nodes.find(n=>n.schema==='NumberLiteral'&&n.slot==='right').fields.value='2';},
      r=>display(r).nodes.find(n=>n.schema==='Say').title='待つ',r=>display(r,'B16').nodes.find(n=>n.schema==='BinaryExpression:ADD').title='引く'];
    const rows=controls(matrixControlIds.slice(0,-1),mutations,r,b=>verifyChildMatrix(b,snapshot,provenance,input));
    assert.throws(()=>verifyChildMatrix(r,snapshot,provenance,input+'.missing-root'));rows.push({id:matrixControlIds.at(-1),rejected:true});
    write(output,{...proof('akari-child-ux-matrix-proof-v1',result,rows),inputSha256:sha(fs.readFileSync(input))});
  }else if(mode==='language'){
    const r=read(input),inventory=vocabularyCandidates(fs.readFileSync(currentProductFile(),'utf8'),r.uiInventoryFrames),result=verifyChildLanguage(r,snapshot,provenance,input,inventory);
    const mutations=[r=>r.results.pop(),r=>r.results[1]=r.results[0],r=>r.status='FAIL',r=>r.snapshot.productSha256='0'.repeat(64),r=>r.environment='wrong',r=>r.childUxProvenance.run='wrong',
      r=>r.results.find(x=>x.id==='CHILD-UI-BLOCK-WORDS').evidence.insertionConceptHints.commandAndBody='',r=>r.uiInventoryFrames[0].rows[0].hit=false,r=>r.uiInventoryFrames.pop(),r=>r.uiInventoryFrames[0].artifact.path='missing.png',r=>r.uiInventoryFrames[0].artifact.sha256='0'.repeat(64)];
    const rows=controls(languageControlIds.slice(0,11),mutations,r,b=>verifyChildLanguage(b,snapshot,provenance,input,inventory));
    const omitted=structuredClone(inventory);omitted.pop();assert.throws(()=>verifyChildLanguage(r,snapshot,provenance,input,omitted));rows.push({id:languageControlIds[11],rejected:true});
    const approved=structuredClone(inventory);approved[0].humanStatus='PASS';assert.throws(()=>verifyChildLanguage(r,snapshot,provenance,input,approved));rows.push({id:languageControlIds[12],rejected:true});
    const truncated=structuredClone(r);for(const frame of truncated.uiInventoryFrames)frame.rows=frame.rows.slice(0,1);
    const truncatedInventory=vocabularyCandidates(fs.readFileSync(currentProductFile(),'utf8'),truncated.uiInventoryFrames);assert.throws(()=>verifyChildLanguage(truncated,snapshot,provenance,input,truncatedInventory));rows.push({id:languageControlIds[13],rejected:true});
    write(output,{...proof('akari-child-ux-language-proof-v1',result,rows),inputSha256:sha(fs.readFileSync(input)),inventory});
  }else if(mode==='manual-template'){
    const ordered=plan.order.map(id=>plan.tasks.find(t=>t.id===id));
    write(input,{schema:'akari-child-ux-manual-plan-v1',status:'UNVERIFIED',persona:plan.persona,comparison:plan.comparison,order:plan.order,
      cards:ordered.map(t=>({id:t.id,concept:t.concept,purpose:t.purpose,intent:t.intent,preconditions:t.preconditions,readText:t.readText,intentionalError:t.intentionalError,screenClues:t.screenClues})),
      records:ordered.flatMap(t=>['code','blocks','scratch-ja'].map(mode=>({task:t.id,mode,status:'UNVERIFIED',prediction:null,execution:null,reading:null,meaningAndConcepts:null,textInput:null,deviceOperation:null,assistance:[],observedInteractionCounts:null})))});
  }else if(mode==='manual-verify'){
    const sessions=fs.readFileSync(input,'utf8').split(/\r?\n/).filter(x=>x.trim()).map(x=>JSON.parse(x));
    const records=verifyManualSessions(sessions,path.dirname(input));
    write(output,{schema:'akari-child-ux-manual-validation-v1',status:'VALID_PROTOCOL_RECORDS',snapshot,provenance,records,machinePassCount:0,childComprehension:'UNVERIFIED',productFinalAcceptance:'UNVERIFIED'});
  }else if(mode==='history')write(input,await retryHistory());
  else if(mode==='seal'){const b=sealChildBundle(input,output,snapshot,provenance);console.log(JSON.stringify({kind:b.kind,status:b.status,files:Object.keys(b.files).length}));}
  else if(mode==='aggregate'){
    const dirs={},root=path.resolve(input);
    for(const e of fs.readdirSync(root,{withFileTypes:true})){if(!e.isDirectory())continue;const d=path.join(root,e.name),f=path.join(d,'child-ux-bundle.json');if(fs.existsSync(f)){const kind=read(f).kind;assert.ok(!dirs[kind],'duplicate evidence kind');dirs[kind]=d;}}
    const result=verifyChildAggregate(dirs,JSON.parse(process.env.AKARI_CHILD_UX_NEEDS||'null'),read(path.join(path.dirname(output),'retry-history.json')),snapshot,provenance);write(output,result);
  }else throw Error('Unknown child UX mode: '+mode);
  const status={'manual-template':'UNVERIFIED_TEMPLATE','manual-verify':'VALID_PROTOCOL_RECORDS',history:'HISTORY_RECORDED'}[mode]||'PASS';
  console.log('Child UX '+mode+': '+status+' (machine evidence only; independent UX / real child / real IME are UNVERIFIED)');
}catch(error){
  const target=['matrix','language','aggregate','manual-verify'].includes(mode)?output:mode==='seal'?null:input;
  if(target&&!fs.existsSync(target)){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify({schema:'akari-child-ux-failure-v1',status:'FAIL',snapshot,provenance,error:error.stack},null,2)+'\n');}
  console.error(error.stack);process.exitCode=1;
}
