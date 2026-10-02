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
];
export const documentUnitIds=[...['I07','I08','I09','I10','I11','I12'].map(id=>id+'/actual-meaning'),
 ...['1行目\n  2行目\n\t3行目','名前は「空」。\n※これは台詞\n  次に、右へ','🐈\n  e\u0301\\おしまい'].map(text=>'multiline/'+text),
 'document/stable-ids-and-revision','document/reorder-and-insert','document/save-readback','document/source-lines-and-negative-scope',
 'document/edit-second-unit-only','multiline/block-edit-retains-other-event','document/counted-call-reprint-only-changed-unit'];
export function verifySemanticExtension(report,schema,ids){
 assert.equal(report.schema,schema);assert.equal(report.status,'PASS');assert.equal(report.uxAcceptance,false);
 assert.deepEqual(report.snapshot,snapshot(currentProductFile()));assert.deepEqual(report.results.map(row=>row.id),ids);
 for(const row of report.results){assert.equal(row.status,'PASS',row.id);assert.ok(row.observed&&typeof row.observed==='object');}
 return ids.length;
}
