import assert from 'node:assert/strict';
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
  {localError:true,inputPreserved:true,failedDesignUnchanged:true,items:['本','かさ','ぼうし']},{wrongUnitRejected:true,input:'0秒',designUnchanged:true}]);return count;
}
export const numericDisplayIds=[...['正弦（30）','余弦（60）','正接（45）','逆正弦（0.5）','逆余弦（0.5）'].map(s=>'display/trigonometry/'+s),
 ...['zero','negative-zero','safe-max','safe-min','near-zero','negative-near-zero','tiny','large','maximum','lower-round','upper-round','carry','unit','string'].map(s=>'display/boundary/'+s),
 'display/finite-rejection','display/literal-file-and-runtime-unchanged'];
export const numericBrowserIds=[...['正弦（30）','余弦（60）','正接（45）','逆正弦（0.5）','逆余弦（0.5）'].map(s=>'display/browser/'+s),
 'display/browser-monitor-save-and-text','display/browser-stage-output','display/browser-export-offline'];
export function verifyNumericBrowser(report){
 const count=verifySemanticExtension(report,'akari-numeric-display-browser-v1',numericBrowserIds);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);assert.ok(!report.hostFailure);
 assert.equal(report.environment.browser,'140.0.7339.207');assert.equal(report.environment.playwright,'1.55.0');
 const trig=[['正弦（30）','0.5','0.49999999999999994'],['余弦（60）','0.5','0.5000000000000001'],['正接（45）','1','0.9999999999999999'],['逆正弦（0.5）','30度','30.000000000000004度'],['逆余弦（0.5）','60度','60.00000000000001度']];
 assert.deepEqual(report.results.map(r=>r.observed),[...trig.map(([source,shown,raw])=>({source,shown,raw,detailExact:true})),
  {monitor:'0.3',text:'0.30000000000000004',raw:'0.30000000000000004',savedExact:true},
  {shown:'0.5',raw:'0.49999999999999994',detailExact:true},{shown:'0.5',raw:'0.49999999999999994',offline:true}]);return count;
}
