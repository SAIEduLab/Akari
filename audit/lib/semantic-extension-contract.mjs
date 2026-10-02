import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {snapshot} from './product-test-host.mjs';
import {currentProductFile} from './product-path.cjs';
export const naturalRoleIds=[
 ...['こはる','星','ねこ2'].flatMap(name=>[0,1,7,2.5,-3].flatMap(amount=>[0,1,2].map(i=>`motion/${name}/${amount}/${i}`))),
 ...['「青空」','「に、とを」','「ねこ🐈」'].flatMap(a=>['「さん」','「はる」','「、そのあと」'].flatMap(b=>[0,1,2,3].map(i=>`concat/${a}/${b}/${i}`))),
 ...['3と80をかけた数','240に10を足した数','10から3を引いた数','9を2で割った数','（2に3を足した数）と4をかけた数'].map(source=>'arithmetic/'+source),
 ...['あいさつ','ジャンプ','手順3'].flatMap(name=>[0,1,3].map(count=>`action/${name}/${count}`)),
 ...[0,1,3].map(count=>'clone/'+count),...['－1','1.5','「三」','501'].map(value=>'clone/reject/'+value),
 ...['右','左'].flatMap(direction=>[1,20,30].flatMap(speed=>['動く','動き続ける'].map(ending=>`continuous/${direction}/${speed}/${ending}`))),
 ...['「a」キーを押しているあいだ、画面の右へ20歩動く。','画面の右へ画面の左へ20歩動く。','「あいさつ」という手順を2回3回行う。'].map(source=>'reject/'+source),
 ...['こはる','はなを','ねこは星'].flatMap(name=>[false,true].flatMap(quoted=>[0,1].flatMap(order=>[0,1,20].map(speed=>`continuous-actor/${name}/${quoted}/${order}/${speed}`)))),
 ...['こはる','はなを','ねこは星'].flatMap(name=>[false,true].map(quoted=>`heading-actor/${name}/${quoted}`)),
];
export const documentUnitIds=[...['I07','I08','I09','I10','I11','I12'].map(id=>id+'/actual-meaning'),
 ...['1行目\n  2行目\n\t3行目','名前は「空」。\n※これは台詞\n  次に、右へ','🐈\n  e\u0301\\おしまい'].map(text=>'multiline/'+text),
 'document/stable-ids-and-revision','document/reorder-and-insert','document/save-readback','document/source-lines-and-negative-scope',
 'document/edit-second-unit-only','multiline/block-edit-retains-other-event','document/counted-call-reprint-only-changed-unit',
 'document/derived-key-collision-independent-events','document/insert-and-edit-preserves-event-identity',
 'document/ambiguous-same-event-never-reassigns-by-position','document/reject-invalid-persistent-unit-identities'];
export function verifySemanticExtension(report,schema,ids){
 assert.equal(report.schema,schema);assert.equal(report.status,'PASS');assert.equal(report.uxAcceptance,false);
 assert.deepEqual(report.snapshot,snapshot(currentProductFile()));assert.deepEqual(report.results.map(row=>row.id),ids);
 for(const row of report.results){assert.equal(row.status,'PASS',row.id);assert.ok(row.observed&&typeof row.observed==='object');}
 return ids.length;
}
export const draftPersistenceIds=[...['「開いた引用','点数を','作品を動かしたとき、あかりは、\n  「始める」と言う。\nあかりがクリックされたとき、\n  「未完成'].map(source=>'draft/source/'+source),
 'draft/semantic-errors-are-readable','draft/unfinished-callable-and-return-hole','draft/contracts-and-corruption-rejected',
 'draft/pending-number-block-path','history/thirty-frames-deltas-and-cursor','history/shared-and-history-only-assets','history/corrupt-delta-asset-contract-rejected'];
export const workspaceBrowserIds=['history/browser-thirty-undo-redo','history/browser-pending-number','history/browser-closed-return-hole','history/browser-quota-atomic'];
export function verifyWorkspaceBrowser(report){
 const count=verifySemanticExtension(report,'akari-workspace-history-browser-v1',workspaceBrowserIds);assert.deepEqual(report.pageErrors,[]);
 assert.equal(report.environment.browser,'140.0.7339.207');assert.equal(report.environment.playwright,'1.55.0');assert.ok(!report.hostFailure);
 const values=Object.fromEntries(report.results.map(r=>[r.id,r.observed]));
 assert.deepEqual(values[workspaceBrowserIds[0]],{frames:30,restoredHistory:27,restoredRedo:3,cursor:26,firstRetained:'「履歴6」と言う。',sharedAssets:1});
 assert.deepEqual(values[workspaceBrowserIds[1]],{input:'－',restored:'－',undo:'10',redo:'－'});
 assert.deepEqual(values[workspaceBrowserIds[2]],{name:'書きかけの答え',closed:true,reopened:true,hole:1});
 assert.deepEqual(values[workspaceBrowserIds[3]],{previousRecordUnchanged:true,pendingSource:'「容量不足でも編集中の文は残る',failureShown:true});return count;
}
export const dataFormIds=[...['0','０','0点','3','－2'].map(s=>'data/declared-point/'+s),...['0秒','「0」','条件の答え（あてはまる）'].map(s=>'data/reject-declared-point/'+s),
 ...['本\nかさ\nぼうし','  空白  \r\n「引用」🐈\r\n\r\n最後',''].map(s=>'data/list-lines/'+s),'data/list-literals-and-invalid-input'];
export const dataFormBrowserIds=['data/browser-declared-point-runtime','data/browser-list-lines-and-local-error','data/browser-unit-error-cancel'];
export function verifyDataFormBrowser(report){
 const count=verifySemanticExtension(report,'akari-data-form-browser-v1',dataFormBrowserIds);assert.deepEqual(report.pageErrors,[]);assert.ok(!report.hostFailure);
 assert.equal(report.environment.browser,'140.0.7339.207');assert.equal(report.environment.playwright,'1.55.0');
 assert.deepEqual(report.results.map(r=>r.observed),[{initial:{magnitude:0,unit:'点'},runtime:'3点',designUnchanged:true},
  {defaultLines:true,localError:true,inputPreserved:true,failedDesignUnchanged:true,items:['本','かさ','ぼうし']},{wrongUnitRejected:true,input:'0秒',designUnchanged:true}]);return count;
}
export const numericDisplayIds=[...['正弦（30）','余弦（60）','正接（45）','逆正弦（0.5）','逆余弦（0.5）'].map(s=>'display/trigonometry/'+s),
 ...['zero','negative-zero','safe-max','safe-min','near-zero','negative-near-zero','tiny','large','maximum','lower-round','upper-round','carry','unit','string'].map(s=>'display/boundary/'+s),
 'display/finite-rejection','display/literal-file-and-runtime-unchanged'];
export const numericBrowserIds=[...['正弦（30）','余弦（60）','正接（45）','逆正弦（0.5）','逆余弦（0.5）'].map(s=>'display/browser/'+s),
 'display/browser-monitor-save-and-text','display/browser-monitor-1024','display/browser-monitor-390','display/browser-stage-output','display/browser-export-offline'];
export function verifyNumericBrowser(report){
 const count=verifySemanticExtension(report,'akari-numeric-display-browser-v1',numericBrowserIds);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);assert.ok(!report.hostFailure);
 assert.equal(report.environment.browser,'140.0.7339.207');assert.equal(report.environment.playwright,'1.55.0');
 const trig=[['正弦（30）','0.5','0.49999999999999994'],['余弦（60）','0.5','0.5000000000000001'],['正接（45）','1','0.9999999999999999'],['逆正弦（0.5）','30度','30.000000000000004度'],['逆余弦（0.5）','60度','60.00000000000001度']];
 assert.deepEqual(report.results.slice(0,5).map(r=>r.observed),trig.map(([source,shown,raw])=>({source,shown,raw,detailExact:true})));
 for(const [i,width]of [1366,1024,390].entries()){
  const {monitorHeight,...observed}=report.results[5+i].observed;assert.ok(Number.isFinite(monitorHeight)&&monitorHeight>=120);
  assert.deepEqual(observed,{monitor:'0.3',text:'0.30000000000000004',raw:'0.30000000000000004',savedExact:true,width});
 }
 assert.deepEqual(report.results.slice(8).map(r=>r.observed),[
  {shown:'0.5',raw:'0.49999999999999994',detailExact:true},{shown:'0.5',raw:'0.49999999999999994',offline:true}]);return count;
}
export const resourceReferenceIds=[...['costume','backdrop','sound','actor','sensor','action','function','local-data','list'].map(s=>'references/'+s),
 'references/quoted-prose-is-not-a-reference','references/shadowed-project-data','references/unfinished-and-dynamic-are-uncertain','references/rename-exact-resource-only','references/rename-duplicate-and-shared-context-rejected','references/rename-background-and-sound',...['灯り','星2','はなを'].map(n=>'references/rename-actor/'+n),'references/rename-actor-sensor-and-units',...['global','local'].map(s=>'references/rename-scoped-data/'+s),'references/rename-list','references/rename-action','references/rename-function-arguments','references/rename-call-phrase','references/rename-shadowing-refused','references/rename-unknown-draft-refused','references/rename-stage-alias'];
export const resourceBrowserIds=['references/browser-costume-delete-rename-undo','references/browser-uncertain-source-refuses-delete','references/browser-unused-delete-undo','references/browser-data-delete-refused',"references/browser-component-rename","references/browser-data-rename","references/browser-action-rename","references/browser-function-rename"];
export function verifyResourceBrowser(report){
 const count=verifySemanticExtension(report,'akari-resource-references-browser-v1',resourceBrowserIds);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);assert.ok(!report.hostFailure);
 assert.equal(report.environment.browser,'140.0.7339.207');assert.equal(report.environment.playwright,'1.55.0');
 assert.deepEqual(report.results.map(r=>r.observed),[{deleteRefused:true,cancelUnchanged:true,referenceOnlyRename:true,undoRedo:true,saveExact:true,assetsPreserved:true},
  {uncertaintyShown:true,projectHistoryAssetsUnchanged:true},{unusedDeletionAllowed:true,undoRestoresProjectAndAssets:true},{referenceShown:true,projectHistoryAssetsUnchanged:true},{"referenceOnly":true,"undoRedo":true,"runtimeX":260,"proseUnchanged":true},{"cancelUnchanged":true,"referenceOnly":true,"undoRedo":true,"saveExact":true,"runtimeValue":"3"},{"kind":"action","referenceOnly":true,"undoRedo":true,"runtimeValue":"250","designUnchanged":true},{"kind":"function","referenceOnly":true,"undoRedo":true,"runtimeValue":"250","designUnchanged":true}]);return count;
}
export const searchBindingIds=[...['右に行きたい','小さくしたい','おおきさ','2番目に入れたい','点数','てんすう','おじぎ','代金'].map(q=>'search/required/'+q),
 ...['ひだりにすすみたい','上へ動かしたい','シタへイキタイ','画面の右へ移動したい'].map(q=>'search/direction/'+q),
 ...['５番目に入れたい','3ばんめにいれたい','10番目へ挿入'].map(q=>'search/ordinal/'+q),
 'search/scopes-remain-distinct','search/callable-arguments-and-kind','search/no-query-mutation','search/rotation-and-replacement-distinct','search/unavailable-reason','search/bound-insertion-semantic'];
export const searchBrowserIds=[...[1366,1024,390].map(w=>'search/browser-discovery-focus-'+w),'search/browser-scope-binding-undo','search/browser-function-binding','search/browser-intent-values','search/browser-unavailable-reason'];
export function verifySearchBrowser(report){
 const count=verifySemanticExtension(report,'akari-search-bindings-browser-v1',searchBrowserIds);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);assert.ok(!report.hostFailure);
 assert.equal(report.environment.browser,'140.0.7339.207');assert.equal(report.environment.playwright,'1.55.0');
 assert.deepEqual(report.results.map(r=>r.observed),[
  ...[1366,1024,390].map(width=>({width,queries:8,sourceUnchanged:true,clickTabCompositionEscape:true})),
  {qualifier:'self',typed:true,oneHistoryStep:true,undoRedo:true},{name:'代金',args:2,argumentNames:['個数','ねだん']},
  {direction:'left',scale:50,index:2},{reasonShown:true,projectUnchanged:true}]);return count;
}
export const uxManualFiles=['MANUAL.html','Manual/block-mode.html','Manual/code-mode-beginner.html','Manual/code-mode-intermediate.html','Manual/code-mode-advanced.html'];
export const uxSurfaceIds=['ux/browser-empty-sample-click',...[[1366,'fit'],[1366,'100'],[390,'fit']].map(([w,m])=>'ux/browser-bubble-'+w+'-'+m),...[1366,1024,390].flatMap(w=>['light','dark'].map(t=>'ux/browser-manual-'+w+'-'+t))];
export function verifyUxSurface(report){
 const count=verifySemanticExtension(report,'akari-ux-surface-browser-v1',uxSurfaceIds);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);assert.ok(!report.hostFailure);
 assert.equal(report.environment.browser,'140.0.7339.207');assert.equal(report.environment.playwright,'1.55.0');
 assert.deepEqual(report.results[0].observed,{emptyStartup:true,emptyRunIdle:true,clickDistances:[30,60],explicitSample:true,removeUndo:true,emptyNew:true});
 for(const [i,[width,mode]]of [[1366,'fit'],[1366,'100'],[390,'fit']].entries()){
  const {scale,font,overlap,...o}=report.results[i+1].observed;assert.deepEqual(o,{width,height:width===390?844:768,mode,inside:true,fullTextExact:true});
  assert.ok(Number.isFinite(scale)&&scale>0);assert.ok(Number.isFinite(font)&&font>=13.5);assert.ok(Number.isFinite(overlap)&&overlap>=0&&overlap<1);
  if(mode==='100')assert.ok(Math.abs(scale-1)<.02);else if(width===1366)assert.ok(scale>=.39&&scale<=.43);
 }
 for(const [i,[width,theme]]of [1366,1024,390].flatMap(w=>['light','dark'].map(t=>[w,t])).entries()){
  const {views,...o}=report.results[i+4].observed;assert.deepEqual(o,{width,height:width===390?844:768,theme,hoverAndSelection:true});assert.deepEqual(views.map(v=>v.file),uxManualFiles);
  for(const v of views){assert.ok(Number.isFinite(v.body)&&v.body>=4.5);assert.ok(Number.isFinite(v.heading)&&v.heading>=3);assert.ok(Number.isFinite(v.selection)&&v.selection>=4.5);assert.equal(v.selected,true);assert.equal(v.overflow,false);}
 }return count;
}

export const basicIntentIds=['T01','T02','T03','T04','T05','T06','T13'];
export function verifyBasicBrowser(report){
 const count=verifySemanticExtension(report,'akari-basic-intents-browser-v1',basicIntentIds);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);assert.ok(!report.hostFailure);
 assert.equal(report.environment.browser,'140.0.7339.207');assert.equal(report.environment.playwright,'1.55.0');
 const bytes=fs.readFileSync('audit/fixtures/basic-intents.json');assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'cf9c3ea0c54801fc77d26f1b66c95bf383ddc89e468ddf9a4ae7121ca63c8d08');const fixture=JSON.parse(bytes);
 const expected={T01:{beforeClick:100,afterClicks:[130,160],holdIdle:true,speech:'今日はどこへ行こう'},T02:{jumpY:76,returnY:100,repeatedDownIdle:true,secondPress:true},T04:{actorX:120,starX:185,speeches:['先に行くね','ついていくよ']},T05:{hiddenFirst:true,visibleAfterWait:true,speech:'ただいま'}};
 for(const [i,row]of report.results.entries()){
  const {detail,...o}=row.observed,d=fixture.cases[i];assert.deepEqual(o,{source:d.source,inputHash:d.sourceSha256,roundtrips:3,designUnchanged:true,savedAndReadBack:true});
  if(expected[row.id])assert.deepEqual(detail,expected[row.id]);
  else if(row.id==='T06'){assert.deepEqual(Object.keys(detail).sort(),['closedSquare','ink']);assert.equal(detail.closedSquare,true);assert.ok(Number.isFinite(detail.ink)&&detail.ink>=60);}
  else{assert.deepEqual(Object.keys(detail).sort(),['distance','elapsed','rate','stopped']);assert.equal(detail.rate,row.id==='T03'?30:20);assert.equal(detail.stopped,true);assert.ok(Number.isFinite(detail.elapsed)&&detail.elapsed>=1);assert.ok(Number.isFinite(detail.distance)&&Math.abs(detail.distance-detail.rate*detail.elapsed)<=6);}
 }return count;
}
