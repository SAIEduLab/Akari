import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
import {browserEnvironment} from '../lib/browser-environment.mjs';
import {transferFixtures,fixturePins,compositionIds,verifyTransferReport,verifyValuesReport,verifyCompositionReport} from '../lib/actions-transfer-contract.mjs';
import {naturalRoleIds,documentUnitIds,draftPersistenceIds,verifySemanticExtension} from '../lib/semantic-extension-contract.mjs';
const dir=path.resolve(process.argv[2]),results=[],negative=[];
for(const [file,verify]of [['transfer.json',verifyTransferReport],['values.json',verifyValuesReport],['composition.json',verifyCompositionReport]]){
 try{const r=JSON.parse(fs.readFileSync(path.join(dir,file)));results.push({file,status:'PASS',cases:verify(r)});}
 catch(error){results.push({file,status:'FAIL',error:error.message});}
}
for(const [file,schema,ids]of [['natural-roles.json','akari-natural-roles-v1',naturalRoleIds],['document-units.json','akari-document-units-v1',documentUnitIds],['draft-persistence.json','akari-draft-persistence-v1',draftPersistenceIds]]){
 try{
  const report=JSON.parse(fs.readFileSync(path.join(dir,file)));results.push({file,status:'PASS',cases:verifySemanticExtension(report,schema,ids)});
  for(const [kind,mutate]of [['missing',r=>r.results.pop()],['wrong-snapshot',r=>r.snapshot.productSha256='0'.repeat(64)],['failed',r=>r.results[0].status='FAIL']]){
   const bad=structuredClone(report);mutate(bad);assert.throws(()=>verifySemanticExtension(bad,schema,ids));negative.push({id:file+'/'+kind,rejected:true});
  }
 }catch(error){results.push({file,status:'FAIL',error:error.message});}
}
// Synthetic control records test the validator. They are never execution evidence
// and are not included in the acceptance success count.
function syntheticComposition(){
 const {prose}=transferFixtures(),r={schema:'akari-composition-acceptance-v1',status:'PASS',snapshot:snapshot(currentProductFile()),fixturePins,
  environment:{browser:browserEnvironment.version,playwright:browserEnvironment.playwright},uxAcceptance:false,pageErrors:[],networkRequests:[],originals:prose.drafts,results:[]};
 for(const d of prose.drafts){
  const actor={id:'sprite-1',x:100,y:100,direction:0,isClone:false},star={...actor,id:'composition-star',x:200};
  const state=time=>({time,actors:[structuredClone(actor),structuredClone(star)],variables:[['点数',0]],lists:[],speech:[]});
  const times={I07:[0],I08:[0,1999,2000,3999,4000,5999,6000],I09:[0,999,1000],I10:[0],I11:[0,999,1000,1999,2000],I12:[0,999,1000]}[d.id],states=times.map(state);
  const say=(text,time,id='sprite-1')=>({kind:'say',id,text,time});let trace=[];
  if(d.id==='I07'){states[0].variables=[['点数',{magnitude:3,unit:'点'}]];trace=[say('できた！',0),say('3点',0)];}
  if(d.id==='I08'){trace=[say('本',0),say('かさ',2000),say('ぼうし',4000)];for(const s of states)s.lists=[['持ち物',['本','かさ','ぼうし']]];}
  if(d.id==='I09')trace=[{kind:'ask',text:'名前を教えてください',time:0},say('はる「青空」さん、こんにちは',1000)];
  if(d.id==='I10')trace=[... [15,0,15,0].map(direction=>({kind:'motion',after:{direction},time:0})),say('250',0)];
  if(d.id==='I11')trace=[say('準備できた',1000),say('準備できた',2000,'composition-star'),say('全員集合',2000)];
  if(d.id==='I12')for(const s of states)if(s.time<1000)s.actors.push(...[0,1,2].map(i=>({...actor,id:'clone-'+i,x:120,isClone:true})));
  for(const s of states)s.speech=trace.filter(x=>x.kind==='say'&&x.time<=s.time);
  const execution={execution:'actual EventScheduler / RuntimeModel',source:d.mainFirstDraft,errors:[],roundtrip:[{original:d.mainFirstDraft,formatted:d.mainFirstDraft}],states,trace,projectAfter:{components:[actor,star]}};
  const meaning={source:execution,blocks:structuredClone(execution)};
  if(d.id==='I07'){meaning.twoRepeatVariant=structuredClone(execution);meaning.twoRepeatVariant.source=d.mainFirstDraft.replace('3回くり返す','2回くり返す');meaning.twoRepeatVariant.states.at(-1).variables=[['点数',{magnitude:2,unit:'点'}]];meaning.twoRepeatVariant.states.at(-1).speech=[say('もう一度',0),say('2点',0)];}
  if(d.id==='I11'){meaning.otherMessageVariant=structuredClone(execution);meaning.otherMessageVariant.source=d.mainFirstDraft.replace('みんなに「出発」と','みんなに「別の知らせ」と');meaning.otherMessageVariant.states.at(-1).speech=[say('全員集合',0)];}
  r.results.push({id:d.id+'/source-ui',status:'PASS',expectedOutcome:'SUCCESS_REQUIRED',evidence:{enteredSource:d.mainFirstDraft,codeAfterRoundtrip:d.mainFirstDraft,pending:null,savedSourceExact:true,compileErrors:[]}},
   {id:d.id+'/semantic-roundtrip',status:'PASS',expectedOutcome:'SUCCESS_REQUIRED',evidence:meaning});
 }
 const extra=prose.drafts.find(d=>d.id==='I10').extra;
 for(const kind of ['action','function'])r.results.push({id:'I10/'+kind+'-original',status:'PASS',expectedOutcome:'SUCCESS_REQUIRED',evidence:{kind,original:kind==='action'?extra.actionBody:extra.functionBody,compileErrors:[]}});
 const source='あかりがクリックされたとき、\n  あかりは画面の右へ30歩動いて、「今日はどこへ行こう」と言う。';
 const observation={textarea:source,event:'click',scripts:[{id:'synthetic-body-id',targetId:'sprite-1',event:'click',source}]};
 r.results.push({id:'EDITOR/idless-heading-selection',status:'PASS',expectedOutcome:'SUCCESS_REQUIRED',evidence:{source,first:observation,second:structuredClone(observation)}});
 for(const width of [1366,1024,390]){const literal='1行目\n  2行目\n\t「青空」🐈';r.results.push({id:'EDITOR/multiline-native-'+width,status:'PASS',expectedOutcome:'SUCCESS_REQUIRED',evidence:{viewport:{width},literal,afterAppend:literal+'!',afterCancel:literal+'!',codeAfterRoundtrip:literal+'!',expectedCode:literal+'!',nativeControl:'TEXTAREA'}});}
 for(const [id,evidence]of [['SAVE/unfinished-source',{source:'「未完',restored:'「未完',runBlocked:true,exportBlocked:true}],['SAVE/unfinished-return-hole',{name:'途中の答え',holeRestored:true,closedWithoutDiscard:true}],['SAVE/unfinished-number',{input:'－',restored:'－',runBlocked:true}],['SAVE/semantic-error',{source:'1歩＋1秒を言う。',restored:'1歩＋1秒を言う。',runBlocked:true,diagnostics:[{code:'S303'}]}]])r.results.push({id,status:'PASS',expectedOutcome:'SUCCESS_REQUIRED',evidence});return r;
}
try{
 const control=syntheticComposition();verifyCompositionReport(control);
 const mutations={
  'failed-status':r=>r.status='FAIL','missing-case':r=>r.results.pop(),'duplicate-case':r=>r.results[1]=r.results[0],
  'skipped-case':r=>r.results[0].status='SKIPPED','pending-as-pass':r=>r.results[0].evidence.pending={kind:'code'},
  'changed-original':r=>r.originals[0].mainFirstDraft+='何もしない。','rewritten-ui-source':r=>r.results[0].evidence.enteredSource='何もしない。',
  'wrong-product':r=>r.snapshot.productSha256='0'.repeat(64),'wrong-browser':r=>r.environment.browser='154',
  'missing-extra-definition':r=>r.results.splice(r.results.findIndex(x=>x.id==='I10/function-original'),1),
  'wrong-meaning':r=>r.results.find(x=>x.id==='I10/semantic-roundtrip').evidence.source.states.at(-1).speech[0].text='240',
  'source-block-mismatch':r=>r.results[1].evidence.blocks.trace.push({kind:'say',text:'unexpected'}),
  'changed-time':r=>r.results.find(x=>x.id==='I11/semantic-roundtrip').evidence.source.states.at(-1).speech.at(-1).time=1999,
  'duplicate-body':r=>{const e=r.results.find(x=>x.id==='EDITOR/idless-heading-selection').evidence;e.second.scripts.push({...e.second.scripts[0]});},
  'changed-identity':r=>r.results.find(x=>x.id==='EDITOR/idless-heading-selection').evidence.second.scripts[0].id='another-body',
  'multiline-lost-lf':r=>{const e=r.results.find(x=>x.id==='EDITOR/multiline-native-390').evidence;e.afterAppend=e.literal.replace(/\n/g,'')+'!';},
  'multiline-cancel-committed':r=>r.results.find(x=>x.id==='EDITOR/multiline-native-390').evidence.afterCancel+='?',
  'draft-dropped-source':r=>r.results.find(x=>x.id==='SAVE/unfinished-source').evidence.restored='',
  'draft-coerced-number':r=>r.results.find(x=>x.id==='SAVE/unfinished-number').evidence.restored='0',
  'page-error':r=>r.pageErrors.push('exception'),'network':r=>r.networkRequests.push('https://example.invalid'),
 };
 for(const [id,change]of Object.entries(mutations)){const bad=structuredClone(control);change(bad);assert.throws(()=>verifyCompositionReport(bad),id);negative.push({id,rejected:true});}
 const valueFile=path.join(dir,'values.json');if(fs.existsSync(valueFile)){
  const values=JSON.parse(fs.readFileSync(valueFile));verifyValuesReport(values);
  for(const [id,change]of Object.entries({'missing-value':r=>r.results.pop(),'wrong-expected':r=>r.results[0].expected=99,'wrong-observed':r=>r.results[0].observations[0].actual=99,'missing-route':r=>r.results[0].observations.pop(),'missing-variant':r=>r.results.find(x=>x.id==='Q-sensor:KEY_DOWN').variants.pop()})){
   const bad=structuredClone(values);change(bad);assert.throws(()=>verifyValuesReport(bad),id);negative.push({id,rejected:true});
  }
 }
}catch(error){results.push({file:'validator-negative',status:'FAIL',error:error.stack});}
const report={schema:'akari-fixed-acceptance-aggregate-v1',status:results.every(x=>x.status==='PASS')&&negative.length===35?'MACHINE_PASS':'FAIL',uxAcceptance:false,results,
 validatorControl:'SYNTHETIC / validation only, never product execution evidence',negative};
fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'aggregate.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));if(report.status!=='MACHINE_PASS')process.exitCode=1;
