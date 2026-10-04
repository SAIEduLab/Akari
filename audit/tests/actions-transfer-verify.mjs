import {repairInputs,repairWrongMeaning,repairMatrixWrongMeaning,repairViewportWrongMeaning,repairLanguageWrongMeaning} from '../lib/ux-repair02-contract.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
import {browserEnvironment} from '../lib/browser-environment.mjs';
import {verifyCommandMeaning} from '../lib/command-meaning-contract.mjs';
import {audioOutputCases,verifyAudioOutput,wave,measureWave} from '../lib/audio-output-contract.mjs';
import {transferFixtures,fixturePins,compositionIds,verifyTransferReport,verifyValuesReport,verifyCompositionReport} from '../lib/actions-transfer-contract.mjs';
import {uxRepairInputs,verifyUxRepairInputs} from '../lib/ux-repair-contract.mjs';
import {naturalRoleIds,documentUnitIds,draftPersistenceIds,verifySemanticExtension,workspaceBrowserIds,verifyWorkspaceBrowser,dataFormIds,dataFormBrowserIds,verifyDataFormBrowser,numericDisplayIds,numericBrowserIds,verifyNumericBrowser,resourceReferenceIds,resourceBrowserIds,verifyResourceBrowser,searchBindingIds,searchBrowserIds,verifySearchBrowser,uxSurfaceIds,uxManualFiles,verifyUxSurface,basicIntentIds,verifyBasicBrowser,semanticNegativeIds,finiteVariantFixture,verifyFiniteVariants,structuredOrders,structuredEditingIds,verifyStructuredEditing} from '../lib/semantic-extension-contract.mjs';
const dir=path.resolve(process.argv[2]),results=[],negative=[];
for(const [file,verify]of uxRepairInputs){
 try{const report=JSON.parse(fs.readFileSync(path.join(dir,file)));results.push({file,status:'PASS',cases:verify(report)});
  for(const [kind,mutate]of [['missing-row',r=>r.results.pop()],['wrong-snapshot',r=>r.snapshot.productSha256='0'.repeat(64)],['failed',r=>r.status='FAIL'],['duplicate-row',r=>r.results[1]=r.results[0]]]){const bad=structuredClone(report);mutate(bad);assert.throws(()=>verify(bad));negative.push({id:file+'/'+kind,rejected:true});}
 }catch(error){results.push({file,status:'FAIL',error:error.message});}
}
try{const reports=Object.fromEntries(uxRepairInputs.map(([file])=>[file,JSON.parse(fs.readFileSync(path.join(dir,file)))]));verifyUxRepairInputs(file=>reports[file]);for(const [missing]of uxRepairInputs){assert.throws(()=>verifyUxRepairInputs(file=>file===missing?undefined:reports[file]));negative.push({id:missing+'/missing-report',rejected:true});}}
catch(error){results.push({file:'ux-repair-inputs-negative',status:'FAIL',error:error.message});}
try{const r=JSON.parse(fs.readFileSync(path.join(dir,'audio-output-browser.json')));results.push({file:'audio-output-browser.json',status:'PASS',cases:verifyAudioOutput(r,dir)});}catch(error){results.push({file:'audio-output-browser.json',status:'FAIL',error:error.message});}
for(const [file,verify]of [['command-meaning.json',verifyCommandMeaning],['structured-editing-browser.json',verifyStructuredEditing],['transfer.json',verifyTransferReport],['values.json',verifyValuesReport],['composition.json',verifyCompositionReport],['workspace-history-browser.json',verifyWorkspaceBrowser],['data-form-browser.json',verifyDataFormBrowser],['numeric-display-browser.json',verifyNumericBrowser],['resource-references-browser.json',verifyResourceBrowser],['search-bindings-browser.json',verifySearchBrowser],['ux-surface-browser.json',verifyUxSurface],['basic-intents-browser.json',verifyBasicBrowser],['finite-semantic-variants.json',verifyFiniteVariants]]){
 try{const r=JSON.parse(fs.readFileSync(path.join(dir,file)));results.push({file,status:'PASS',cases:verify(r)});}
 catch(error){results.push({file,status:'FAIL',error:error.message});}
}
for(const [file,schema,ids]of [['natural-roles.json','akari-natural-roles-v1',naturalRoleIds],['document-units.json','akari-document-units-v1',documentUnitIds],['draft-persistence.json','akari-draft-persistence-v1',draftPersistenceIds],['data-form-values.json','akari-data-form-values-v1',dataFormIds],['numeric-display.json','akari-numeric-display-v1',numericDisplayIds],['resource-references.json','akari-resource-references-v1',resourceReferenceIds],['search-bindings.json','akari-search-bindings-v1',searchBindingIds],['basic-intents.json','akari-basic-intents-core-v1',basicIntentIds],['semantic-negative-pairs.json','akari-semantic-negative-pairs-v1',semanticNegativeIds]]){
 try{
  const report=JSON.parse(fs.readFileSync(path.join(dir,file)));results.push({file,status:'PASS',cases:verifySemanticExtension(report,schema,ids)});
  for(const [kind,mutate]of [['missing',r=>r.results.pop()],['wrong-snapshot',r=>r.snapshot.productSha256='0'.repeat(64)],['failed',r=>r.results[0].status='FAIL']]){
   const bad=structuredClone(report);mutate(bad);assert.throws(()=>verifySemanticExtension(bad,schema,ids));negative.push({id:file+'/'+kind,rejected:true});
  }
 }catch(error){results.push({file,status:'FAIL',error:error.message});}
}
// Corrupt copies test result validation; the original rows are actual execution.
try {
 const actual=JSON.parse(fs.readFileSync(path.join(dir,'command-meaning.json')));verifyCommandMeaning(actual);
 for(const [id,mutate]of [
  ['command-missing',r=>r.results.pop()],['command-duplicate',r=>r.results[0]=r.results[1]],
  ['command-wrong-head',r=>r.snapshot.productSha256='0'.repeat(64)],['command-failed',r=>r.results[0].status='FAIL'],
  ['command-no-trace',r=>r.results[0].observed[0].routes[0].states=[]],
  ['command-wrong-motion',r=>{for(const x of r.results.find(r=>r.id==='C-MotionCommand:MOVE').observed[0].routes)x.final.actors[0].x=100;}],
  ['command-wrong-list',r=>{for(const x of r.results.find(r=>r.id==='C-ListInsert').observed[0].routes)x.final.lists.名前一覧=['ほたる','ぼうし'];}],
  ['command-block-drift',r=>r.results[0].observed[0].routes[1].final.variables.点数=7]
 ]){const bad=structuredClone(actual);mutate(bad);assert.throws(()=>verifyCommandMeaning(bad));negative.push({id,rejected:true});}
}catch(error){results.push({file:'command-validator-negative',status:'FAIL',error:error.message});}
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
 const baseline={project:'synthetic-original-project',owner:'synthetic-original-owner',event:'start'};
 const staged={...baseline,raw:source};
 r.results.push({id:'EDITOR/idless-heading-selection',status:'PASS',expectedOutcome:'SUCCESS_REQUIRED',evidence:{source,baseline,staged,inputKeepsContext:true,explicitCommit:true,first:observation,second:structuredClone(observation)}});
 for(const width of [1366,1024,390]){const literal='1行目\n  2行目\n\t「青空」🐈';r.results.push({id:'EDITOR/multiline-native-'+width,status:'PASS',expectedOutcome:'SUCCESS_REQUIRED',evidence:{viewport:{width},literal,afterAppend:literal+'!',afterCancel:literal+'!',codeAfterRoundtrip:literal+'!',expectedCode:literal+'!',nativeControl:'TEXTAREA'}});}
 for(const [id,evidence]of [['SAVE/unfinished-source',{source:'「未完',restored:'「未完',runBlocked:true,exportBlocked:true}],['SAVE/unfinished-return-hole',{name:'途中の答え',holeRestored:true,closedWithoutDiscard:true}],['SAVE/unfinished-number',{input:'－',restored:'－',runBlocked:true}],['SAVE/semantic-error',{source:'1歩＋1秒を言う。',restored:'1歩＋1秒を言う。',runBlocked:true,diagnostics:[{code:'S303'}]}]])r.results.push({id,status:'PASS',expectedOutcome:'SUCCESS_REQUIRED',evidence});return r;
}
try{
 const control={schema:'akari-workspace-history-browser-v1',status:'PASS',snapshot:snapshot(currentProductFile()),uxAcceptance:false,pageErrors:[],environment:{browser:browserEnvironment.version,playwright:browserEnvironment.playwright},results:workspaceBrowserIds.map((id,i)=>({id,status:'PASS',observed:[{frames:30,restoredHistory:27,restoredRedo:3,cursor:26,firstRetained:'「履歴6」と言う。',sharedAssets:1},{input:'－',restored:'－',undo:'10',redo:'－'},{name:'書きかけの答え',closed:true,reopened:true,hole:1},{previousRecordUnchanged:true,pendingSource:'「容量不足でも編集中の文は残る',failureShown:true}][i]}))};
 verifyWorkspaceBrowser(control);
 for(const [id,mutate]of Object.entries({'history-missing':r=>r.results.pop(),'history-lost-redo':r=>r.results[0].observed.restoredRedo=0,'history-coerced-number':r=>r.results[1].observed.redo='0','history-overwrote-record':r=>r.results[3].observed.previousRecordUnchanged=false})){
  const bad=structuredClone(control);mutate(bad);assert.throws(()=>verifyWorkspaceBrowser(bad));negative.push({id,rejected:true});
 }
}catch(error){results.push({file:'workspace-validator-negative',status:'FAIL',error:error.stack});}
try{
 const control={schema:'akari-data-form-browser-v1',status:'PASS',snapshot:snapshot(currentProductFile()),uxAcceptance:false,pageErrors:[],environment:{browser:browserEnvironment.version,playwright:browserEnvironment.playwright},results:dataFormBrowserIds.map((id,i)=>({id,status:'PASS',observed:[{initial:{magnitude:0,unit:'点'},runtime:'3点',designUnchanged:true},{defaultLines:true,localError:true,inputPreserved:true,failedDesignUnchanged:true,items:['本','かさ','ぼうし']},{wrongUnitRejected:true,input:'0秒',designUnchanged:true}][i]}))};
 verifyDataFormBrowser(control);
 for(const [id,mutate]of Object.entries({'data-default-literal':r=>r.results[1].observed.defaultLines=false,'data-lost-unit':r=>r.results[0].observed.initial=0,'data-wrong-order':r=>r.results[1].observed.items.reverse(),'data-silent-failure':r=>r.results[2].observed.wrongUnitRejected=false})){
  const bad=structuredClone(control);mutate(bad);assert.throws(()=>verifyDataFormBrowser(bad));negative.push({id,rejected:true});
 }
}catch(error){results.push({file:'data-validator-negative',status:'FAIL',error:error.stack});}
try{
 const trig=[['正弦（30）','0.5','0.49999999999999994'],['余弦（60）','0.5','0.5000000000000001'],['正接（45）','1','0.9999999999999999'],['逆正弦（0.5）','30度','30.000000000000004度'],['逆余弦（0.5）','60度','60.00000000000001度']];
 const observed=[...trig.map(([source,shown,raw])=>({source,shown,raw,detailExact:true})),...[1366,1024,390].map(width=>({monitor:'0.3',text:'0.30000000000000004',raw:'0.30000000000000004',savedExact:true,width,monitorHeight:144})),{shown:'0.5',raw:'0.49999999999999994',detailExact:true},{shown:'0.5',raw:'0.49999999999999994',offline:true}];
 const control={schema:'akari-numeric-display-browser-v1',status:'PASS',snapshot:snapshot(currentProductFile()),uxAcceptance:false,pageErrors:[],networkRequests:[],environment:{browser:browserEnvironment.version,playwright:browserEnvironment.playwright},results:numericBrowserIds.map((id,i)=>({id,status:'PASS',observed:observed[i]}))};
 verifyNumericBrowser(control);
 for(const[id,mutate]of Object.entries({'display-missing-detail':r=>r.results[0].observed.detailExact=false,'display-rounded-raw':r=>r.results[0].observed.raw='0.5','display-changed-text':r=>r.results[5].observed.text='0.3','display-online-player':r=>r.results[9].observed.offline=false,'display-collapsed-monitor':r=>r.results[6].observed.monitorHeight=16})){
  const bad=structuredClone(control);mutate(bad);assert.throws(()=>verifyNumericBrowser(bad));negative.push({id,rejected:true});
 }
}catch(error){results.push({file:'numeric-validator-negative',status:'FAIL',error:error.stack});}
try{
 const observed=[{deleteRefused:true,cancelUnchanged:true,referenceOnlyRename:true,undoRedo:true,saveExact:true,assetsPreserved:true},{uncertaintyShown:true,projectHistoryAssetsUnchanged:true},{unusedDeletionAllowed:true,undoRestoresProjectAndAssets:true},{referenceShown:true,projectHistoryAssetsUnchanged:true},{"referenceOnly":true,"undoRedo":true,"runtimeX":260,"proseUnchanged":true},{"cancelUnchanged":true,"referenceOnly":true,"undoRedo":true,"saveExact":true,"runtimeValue":"3"},{"kind":"action","referenceOnly":true,"undoRedo":true,"runtimeValue":"250","designUnchanged":true},{"kind":"function","referenceOnly":true,"undoRedo":true,"runtimeValue":"250","designUnchanged":true}];
 const control={schema:'akari-resource-references-browser-v1',status:'PASS',snapshot:snapshot(currentProductFile()),uxAcceptance:false,pageErrors:[],networkRequests:[],environment:{browser:browserEnvironment.version,playwright:browserEnvironment.playwright},results:resourceBrowserIds.map((id,i)=>({id,status:'PASS',observed:observed[i]}))};
 verifyResourceBrowser(control);
 for(const[id,mutate]of Object.entries({'resource-deleted-reference':r=>r.results[0].observed.deleteRefused=false,'resource-uncertainty-hidden':r=>r.results[1].observed.uncertaintyShown=false,'resource-blocked-unused':r=>r.results[2].observed.unusedDeletionAllowed=false,'resource-changed-history':r=>r.results[3].observed.projectHistoryAssetsUnchanged=false,'rename-actor-drift':r=>r.results[4].observed.runtimeX=230,'rename-data-not-saved':r=>r.results[5].observed.saveExact=false,'rename-lost-calls':r=>r.results[6].observed.runtimeValue='240','rename-runtime-mutated-design':r=>r.results[7].observed.designUnchanged=false})){
  const bad=structuredClone(control);mutate(bad);assert.throws(()=>verifyResourceBrowser(bad));negative.push({id,rejected:true});
 }
}catch(error){results.push({file:'resource-validator-negative',status:'FAIL',error:error.stack});}
try{
 const observed=[...[1366,1024,390].map(width=>({width,queries:8,sourceUnchanged:true,clickTabCompositionEscape:true})),{qualifier:'self',typed:true,oneHistoryStep:true,undoRedo:true},{name:'代金',args:2,argumentNames:['個数','ねだん']},{direction:'left',scale:50,index:2},{reasonShown:true,projectUnchanged:true}];
 const control={schema:'akari-search-bindings-browser-v1',status:'PASS',snapshot:snapshot(currentProductFile()),uxAcceptance:false,pageErrors:[],networkRequests:[],environment:{browser:browserEnvironment.version,playwright:browserEnvironment.playwright},results:searchBrowserIds.map((id,i)=>({id,status:'PASS',observed:observed[i]}))};
 verifySearchBrowser(control);
 for(const[id,mutate]of Object.entries({'search-changed-source':r=>r.results[0].observed.sourceUnchanged=false,'search-wrong-owner':r=>r.results[3].observed.qualifier='project','search-lost-arguments':r=>r.results[4].observed.args=0,'search-replacement-instead-insertion':r=>r.results[5].observed.index=1,'search-hidden-reason':r=>r.results[6].observed.reasonShown=false})){
  const bad=structuredClone(control);mutate(bad);assert.throws(()=>verifySearchBrowser(bad));negative.push({id,rejected:true});
 }
}catch(error){results.push({file:'search-validator-negative',status:'FAIL',error:error.stack});}
try{
 const observed=[{emptyStartup:true,emptyRunIdle:true,clickDistances:[30,60],explicitSample:true,removeUndo:true,emptyNew:true},
  ...[[1366,'fit'],[1366,'100'],[390,'fit']].map(([width,mode])=>({width,height:width===390?844:768,mode,scale:mode==='100'?1:.41,font:14,overlap:0,inside:true,fullTextExact:true})),
  ...[1366,1024,390].flatMap(width=>['light','dark'].map(theme=>({width,height:width===390?844:768,theme,hoverAndSelection:true,views:uxManualFiles.map(file=>({file,body:10,heading:10,selection:10,selected:true,overflow:false}))})))];
 const control={schema:'akari-ux-surface-browser-v1',status:'PASS',snapshot:snapshot(currentProductFile()),uxAcceptance:false,pageErrors:[],networkRequests:[],environment:{browser:browserEnvironment.version,playwright:browserEnvironment.playwright},results:uxSurfaceIds.map((id,i)=>({id,status:'PASS',observed:observed[i]}))};
 verifyUxSurface(control);
 for(const[id,mutate]of Object.entries({'ux-not-empty':r=>r.results[0].observed.emptyStartup=false,'ux-click-extra':r=>r.results[0].observed.clickDistances=[60,90],'ux-overlap':r=>r.results[1].observed.overlap=20,'ux-small-font':r=>r.results[1].observed.font=6,'ux-lost-fulltext':r=>r.results[2].observed.fullTextExact=false,'ux-low-contrast':r=>r.results[4].observed.views[0].body=1.1,'ux-no-selection':r=>r.results[5].observed.views[0].selected=false,'ux-missing-manual':r=>r.results[9].observed.views.pop()})){
  const bad=structuredClone(control);mutate(bad);assert.throws(()=>verifyUxSurface(bad));negative.push({id,rejected:true});
 }
}catch(error){results.push({file:'ux-validator-negative',status:'FAIL',error:error.stack});}
try{
 const fixture=JSON.parse(fs.readFileSync('audit/fixtures/basic-intents.json'));
 const details=[{beforeClick:100,afterClicks:[130,160],holdIdle:true,speech:'今日はどこへ行こう'},{jumpY:76,returnY:100,repeatedDownIdle:true,secondPress:true},{rate:30,elapsed:1.05,distance:31.5,stopped:true},{actorX:120,starX:185,speeches:['先に行くね','ついていくよ']},{hiddenFirst:true,visibleAfterWait:true,speech:'ただいま'},{closedSquare:true,ink:160},{rate:20,elapsed:1.05,distance:21,stopped:true}];
 const control={schema:'akari-basic-intents-browser-v1',status:'PASS',snapshot:snapshot(currentProductFile()),uxAcceptance:false,pageErrors:[],networkRequests:[],environment:{browser:browserEnvironment.version,playwright:browserEnvironment.playwright},results:fixture.cases.map((d,i)=>({id:d.id,status:'PASS',observed:{source:d.source,inputHash:d.sourceSha256,roundtrips:3,designUnchanged:true,savedAndReadBack:true,detail:details[i]}}))};
  for(const i of [2,6]){const d=details[i];control.results[i].releaseObservation={pressedAt:0,releasedAt:1050,elapsed:d.elapsed,distance:d.distance,domOnRelease:100+d.distance-.3,domAfterPaint:100+d.distance,domAfter300:100+d.distance};}
  verifyBasicBrowser(control);
 for(const[id,mutate]of Object.entries({'basic-rewritten-original':r=>r.results[0].observed.source='何もしない。','basic-key-repeat':r=>r.results[1].observed.detail.repeatedDownIdle=false,'basic-rate-confusion':r=>r.results[6].observed.detail.rate=30,'basic-no-file':r=>r.results[3].observed.savedAndReadBack=false,'basic-no-drawing':r=>r.results[5].observed.detail.ink=0,'basic-no-release-observation':r=>delete r.results[2].releaseObservation,'basic-moved-after-release':r=>r.results[6].releaseObservation.domAfter300+=1})){
  const bad=structuredClone(control);mutate(bad);assert.throws(()=>verifyBasicBrowser(bad));negative.push({id,rejected:true});
 }
}catch(error){results.push({file:'basic-browser-validator-negative',status:'FAIL',error:error.stack});}
try{
 const {fixture,hash}=finiteVariantFixture(),control={schema:'akari-finite-semantic-variants-report-v1',status:'PASS',uxAcceptance:false,snapshot:snapshot(currentProductFile()),fixtureHash:hash,results:fixture.cases.map(d=>({id:d.id,group:d.group,status:'PASS',inputHash:d.inputHash,expected:d.expected,actual:structuredClone(d.expected),blocks:structuredClone(d.expected),roundtrips:3}))};verifyFiniteVariants(control);
 for(const[id,mutate]of Object.entries({'variant-missing':r=>r.results.pop(),'variant-duplicate':r=>r.results[1]=r.results[0],'variant-wrong-fixture':r=>r.fixtureHash='0'.repeat(64),'variant-wrong-snapshot':r=>r.snapshot.productSha256='0'.repeat(64),'variant-changed-source':r=>r.results[0].inputHash='0'.repeat(64),'variant-wrong-position':r=>r.results[0].actual[0].x=999,'variant-roundtrip-drift':r=>r.results[0].blocks[0].x=999,'variant-failure':r=>r.results[0].status='FAIL'})){const bad=structuredClone(control);mutate(bad);assert.throws(()=>verifyFiniteVariants(bad));negative.push({id,rejected:true});}
}catch(error){results.push({file:'finite-variants-validator-negative',status:'FAIL',error:error.stack});}
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
try{
 const control={schema:'akari-audio-output-browser-v1',status:'PASS',snapshot:snapshot(currentProductFile()),uxAcceptance:false,observation:'WebAudio final output PCM; original destination connection retained',environment:{browser:browserEnvironment.version,playwright:browserEnvironment.playwright},pageErrors:[],networkRequests:[],results:audioOutputCases.map(c=>({id:c.id,status:'PASS',observed:{source:c.source,other:c.other||'',designUnchanged:true,marker:{text:'通過',time:c.wait===false?.02:c.id==='SET_VOLUME'?.5:c.id==='SAMPLE_WAIT'?.45:.35},otherMarker:c.id==='STOP_ALL'?{text:'解放',time:.35}:c.id==='SAMPLE_WAIT'?{text:'別音終了',time:1.1}:null,voices:c.frequencies.map((frequency,i)=>({file:'audio-output-browser.artifacts/'+c.id+'-'+i+'.wav',sha256:'a'.repeat(64),connectedAt:c.id==='SET_VOLUME'&&i===1?.2:0,endTime:c.id==='SET_VOLUME'?.2*(i+1):c.durations[i],measurement:{rate:48000,frames:96000,first:0,last:c.durations[i],duration:c.durations[i],frequency,meanFrequency:frequency,periodIqr:0,rms:c.id==='SET_VOLUME'&&i===1?.025:.05,silentTail:.6}}))}}))};
 // Independent signal controls: sample rate, frequency and phase changes are
 // chosen here, never fitted from a product recording. A discontinuity must not
 // masquerade as a pitch change; silence must not produce a measured tone.
 for(const rate of [44100,48000])for(const frequency of [440,466.1637615,415.3046976,660])for(const discontinuity of [false,true]){
  const samples=Array.from({length:Math.round(rate*.6)},(_,i)=>i<rate*.05||i>rate*.45?0:.07*Math.sin(2*Math.PI*frequency*i/rate+(discontinuity&&i>rate*.15?1.7:0)+(discontinuity&&i>rate*.30?2.1:0)));
  const measured=measureWave(wave(samples,rate));assert.ok(Math.abs(measured.frequency-frequency)<2);assert.ok(measured.periodIqr<2);assert.ok(Math.abs(measured.duration-.4)<.001);
 }
 assert.throws(()=>measureWave(wave(Array(48000).fill(0))));
 verifyAudioOutput(control);
 for(const[id,mutate]of Object.entries({'audio-missing':r=>r.results.pop(),'audio-duplicate':r=>r.results[1]=r.results[0],'audio-wrong-head':r=>r.snapshot.productSha256='0'.repeat(64),'audio-no-output':r=>r.results[0].observed.voices=[],'audio-wrong-frequency':r=>r.results[3].observed.voices[0].measurement.frequency=440,'audio-no-volume-change':r=>r.results[2].observed.voices[1].measurement.rms=.05,'audio-wait-early':r=>r.results[1].observed.marker.time=0,'audio-waits-other-sound':r=>r.results[7].observed.marker.time=1.1,'audio-restarts-after-stop':r=>r.results[5].observed.voices[0].measurement.silentTail=0,'audio-short-recording':r=>r.results[0].observed.voices[0].measurement.duration=.01,'audio-unstable-periods':r=>r.results[0].observed.voices[0].measurement.periodIqr=10})){
  const bad=structuredClone(control);mutate(bad);assert.throws(()=>verifyAudioOutput(bad));negative.push({id,rejected:true});
 }
}catch(error){results.push({file:'audio-output-validator-negative',status:'FAIL',error:error.stack});}
try{
 const control={schema:'akari-structured-editing-browser-v1',status:'PASS',snapshot:snapshot(currentProductFile()),uxAcceptance:false,pageErrors:[],networkRequests:[],environment:{browser:browserEnvironment.version,playwright:browserEnvironment.playwright},results:structuredEditingIds.map((id,i)=>{const[,kind,event]=id.split('/');return{id,status:'PASS',observed:i<6?{kind,event,filter:event==='keyDown'?'右':'出発',stableId:true,oneHistoryStep:true,undoRedo:true,cancelAtomic:true,bodyPreserved:true,run:true}:{order:structuredOrders[i-6],key:'左',direction:'right',seconds:2,distance:40,rate:20,elapsed:1.1,moved:22,cancelAtomic:true,undoRedo:true,designUnchanged:true,stopped:true}};})};
 verifyStructuredEditing(control);
 for(const[id,mutate]of Object.entries({'structured-missing':r=>r.results.pop(),'structured-identity-drift':r=>r.results[0].observed.stableId=false,'structured-lost-body':r=>r.results[4].observed.bodyPreserved=false,'structured-wrong-direction':r=>r.results[6].observed.direction='left','structured-rate-confusion':r=>r.results[7].observed.moved=33})){const bad=structuredClone(control);mutate(bad);assert.throws(()=>verifyStructuredEditing(bad));negative.push({id,rejected:true});}
}catch(error){results.push({file:'structured-validator-negative',status:'FAIL',error:error.stack});}
try { for(const [file,mutate] of repairWrongMeaning){const report=JSON.parse(fs.readFileSync(path.join(dir,file))),verify=repairInputs.find(([f])=>f===file)[1];verify(report);const bad=structuredClone(report);mutate(bad);assert.throws(()=>verify(bad));negative.push({id:file+'/wrong-meaning',rejected:true});} }
catch(error){results.push({file:'ux-repair02-meaning-negative',status:'FAIL',error:error.message});}
try {const file='ux-repair02-matrix.json',report=JSON.parse(fs.readFileSync(path.join(dir,file))),verify=repairInputs.find(([f])=>f===file)[1];verify(report);for(const [id,mutate] of repairMatrixWrongMeaning){const bad=structuredClone(report);mutate(bad);assert.throws(()=>verify(bad));negative.push({id:file+'/'+id,rejected:true});}}
catch(error){results.push({file:'ux-repair02-matrix-meaning-negative',status:'FAIL',error:error.message});}
try {for(const [file,id,mutate] of repairViewportWrongMeaning){const report=JSON.parse(fs.readFileSync(path.join(dir,file))),verify=repairInputs.find(([f])=>f===file)[1];verify(report);const bad=structuredClone(report);mutate(bad);assert.throws(()=>verify(bad));negative.push({id:file+'/'+id,rejected:true});}}
catch(error){results.push({file:'ux-repair02-viewport-negative',status:'FAIL',error:error.message});}
try {const file='ux-repair02-language.json',report=JSON.parse(fs.readFileSync(path.join(dir,file))),verify=repairInputs.find(([f])=>f===file)[1];verify(report);for(const [id,mutate] of repairLanguageWrongMeaning){const bad=structuredClone(report);mutate(bad);assert.throws(()=>verify(bad));negative.push({id:file+'/'+id,rejected:true});}}
catch(error){results.push({file:'ux-repair02-language-meaning-negative',status:'FAIL',error:error.message});}
const report={schema:'akari-fixed-acceptance-aggregate-v1',status:results.every(x=>x.status==='PASS')&&negative.length===183?'MACHINE_PASS':'FAIL',uxAcceptance:false,results,
 validatorControl:'SYNTHETIC / validation only, never product execution evidence',negative};
fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'aggregate.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));if(report.status!=='MACHINE_PASS')process.exitCode=1;
