import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
const A=loadApi(fs.readFileSync(currentProductFile(),'utf8')),results=[],plain=x=>JSON.parse(JSON.stringify(x));
const check=(id,fn)=>{try{results.push({id,status:'PASS',observed:fn()});}catch(error){results.push({id,status:'FAIL',error:error.stack});}};
function fixture(source){
 const p=A.makeDefaultProject(),cat=p.components[0];cat.name='あかり';cat.localData={variables:[{id:'local-score',name:'点数',initialValue:4}],lists:[]};
 p.projectData={variables:[{id:'global-score',name:'点数',initialValue:1}],lists:[{id:'global-list',name:'持ち物',initialValue:['本']}]};
 p.sounds=[{id:'sound-one',name:'音1',assetId:'asset-sound-one'}];p.actions=[{id:'action-one',ownerId:'stage',name:'おじぎ',args:[],source:'15度右に回る。'}];p.functions=[{id:'function-one',ownerId:'stage',name:'代金',args:[],source:'1を答えとして返す。'}];
 p.scripts=[{id:'reference-main',targetId:cat.id,event:'start',source}];return p;
}
const cases=[['costume','衣装を「星」にする。','costume:costume-1'],['backdrop','背景を「空色」にする。','backdrop:backdrop-1'],['sound','「音1」を鳴らす。','sound:sound-one'],
 ['actor','あかりは画面の右へ1歩動く。','component:sprite-1'],['sensor','「あかり」までの距離を言う。','component:sprite-1'],['action','「おじぎ」という手順を行う。','action:action-one'],
 ['function','【代金】で求めた答えを言う。','function:function-one'],['local-data','点数を言う。','data:local-score'],['list','持ち物の1番目を言う。','data:global-list']];
for(const[id,source,key]of cases)check('references/'+id,()=>{
 const p=fixture(source),before=JSON.stringify(p),impact=A.resourceChangeImpact(p,key);assert.ok(impact.references.some(r=>r.sourceKey==='script:reference-main'),JSON.stringify(impact));assert.equal(impact.uncertain.length,0);assert.equal(JSON.stringify(p),before);
 const parsed=A.parseSyntax(source,{targetId:'sprite-1',event:'start',symbols:A.buildSymbols(p)});assert.ok(parsed.ast);p.scripts[0].source=A.formatScript(A.blockDecode(A.blockEncode(parsed.ast).tree));const again=A.resourceChangeImpact(p,key);assert.ok(again.references.some(r=>r.sourceKey==='script:reference-main'));
 return{resourceKey:key,source,codeAndBlock:true,projectUnchanged:true};
});
check('references/quoted-prose-is-not-a-reference',()=>{const p=fixture('「星」と言う。'),impact=A.resourceChangeImpact(p,'costume:costume-1');assert.equal(impact.references.length,0);assert.equal(impact.uncertain.length,0);return{references:0,uncertain:0};});
check('references/shadowed-project-data',()=>{const p=fixture('点数を言う。');assert.equal(A.resourceChangeImpact(p,'data:global-score').references.length,0);p.functions=[{id:'function-one',ownerId:'stage',name:'代金',args:['点数'],source:'点数を答えとして返す。'}];assert.equal(A.resourceChangeImpact(p,'data:global-score').references.length,0);return{localShadowsProject:true,argumentShadowsProject:true};});
check('references/unfinished-and-dynamic-are-uncertain',()=>{const p=fixture('衣装を文字（点数）にする。');assert.ok(A.resourceChangeImpact(p,'costume:costume-1').uncertain.some(r=>r.kind==='costume'));const drafts=[{key:'unfinished',kind:'script',ownerId:'sprite-1',source:'衣装を「星',context:{targetId:'sprite-1',event:'start'}}];const impact=A.resourceChangeImpact(p,'sound:sound-one',{drafts});assert.ok(impact.uncertain.some(r=>r.sourceKey==='unfinished'));assert.throws(()=>A.prepareResourceRename(p,'costume:costume-1','夜'));return{dynamicReported:true,unfinishedReported:true,unsafeRenameRejected:true};});
check('references/rename-exact-resource-only',()=>{
 const source='作品を動かしたとき、あかりは、\r\n  衣装を「星」にする。 ※ 衣装の参照\r\n  「星🐈」と言う。\r\n  0.12345678901234566を言う。',p=fixture(source),before=JSON.stringify(p),next=A.prepareResourceRename(p,'costume:costume-1','夜空');
 assert.equal(next.scripts[0].source,source.replace('衣装を「星」','衣装を「夜空」'));assert.equal(next.components[0].costumes[0].id,'costume-1');assert.equal(next.components[0].costumes[0].assetId,p.components[0].costumes[0].assetId);assert.equal(JSON.stringify(p),before);assert.equal(A.compileProject(next).errors.length,0);
 return{onlyReferenceTokenChanged:true,assetIdUnchanged:true,originalProjectUnchanged:true};
});
check('references/rename-duplicate-and-shared-context-rejected',()=>{
 const p=fixture('衣装を「星」にする。');assert.throws(()=>A.prepareResourceRename(p,'costume:costume-1','丸'));const other=structuredClone(p.components[0]);other.id='other-actor';other.name='こはる';other.localData={variables:[],lists:[]};other.costumes=other.costumes.map((c,i)=>({...c,id:'other-costume-'+i}));other.costumeId=other.costumes[0].id;p.components.push(other);p.actions[0].source='衣装を「星」にする。';assert.throws(()=>A.prepareResourceRename(p,'costume:costume-1','夜'));return{duplicateRejected:true,ambiguousSharedReferenceRejected:true};
});
check('references/rename-background-and-sound',()=>{for(const[key,oldName,newName,source]of [['backdrop:backdrop-1','空色','夜','背景を「空色」にする。'],['sound:sound-one','音1','鐘','「音1」を鳴らす。']]){const next=A.prepareResourceRename(fixture(source),key,newName);assert.equal(next.scripts[0].source,source.replace(oldName,newName));assert.equal(A.resourceChangeImpact(next,key).references.length,1);}return{background:true,sound:true};});
const report={schema:'akari-resource-references-v1',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:snapshot(currentProductFile()),uxAcceptance:false,results},out=path.resolve(process.argv[2]);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');for(const r of results.filter(r=>r.status==='FAIL'))console.error(r.id+' '+r.error);console.log(`Resource references: ${results.filter(r=>r.status==='PASS').length}/${results.length} PASS`);if(report.status!=='PASS')process.exitCode=1;
