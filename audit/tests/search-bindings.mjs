import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
const A=loadApi(fs.readFileSync(currentProductFile(),'utf8')),results=[],plain=x=>JSON.parse(JSON.stringify(x));
const check=(id,fn)=>{try{results.push({id,status:'PASS',observed:fn()});}catch(e){results.push({id,status:'FAIL',error:e.stack});}};
const p=A.makeDefaultProject();p.scripts=[{id:'search-body',targetId:'sprite-1',event:'start',source:''}];
p.projectData={variables:[{id:'score',name:'点数',initialValue:0}],lists:[{id:'items',name:'持ち物',initialValue:['本','ぼうし']}]};
p.components[0].localData.variables=[{id:'local-score',name:'点数',initialValue:100}];
p.actions=[{id:'bow',ownerId:'stage',name:'おじぎ',args:[],source:'右へ15度回る。'}];
p.functions=[{id:'price',ownerId:'stage',name:'代金',args:['個数','ねだん'],source:'個数とねだんをかけた数を答えとして返す。'}];
const ctx={targetId:'sprite-1',event:'start'},hints=A.hintCandidates(p,'sprite-1',{source:'',...ctx});
const find=q=>A.blockSearchCandidates(p,ctx,q,hints), code=q=>A.searchHintCandidates(hints,q,p,ctx);
const cases=[['右に行きたい','MotionCommand:MOVE_DIRECTION'],['小さくしたい','LooksCommand:SET_SCALE'],['おおきさ','LooksCommand:SET_SCALE'],['2番目に入れたい','ListInsert'],['点数','VariableRead'],['てんすう','VariableRead'],['おじぎ','UserActionCall'],['代金','UserFunctionCall']];
for(const [query,schema]of cases)check('search/required/'+query,()=>{
 const blocks=find(query),texts=code(query);assert.ok(blocks.some(b=>b.id===schema));assert.ok(texts.length);
 for(const b of blocks)if(b.candidateNode)A.blockDecode(b.candidateNode);
 return{schema,code:texts.length,block:blocks.length};
});
for(const [query,direction]of [['ひだりにすすみたい','left'],['上へ動かしたい','up'],['シタへイキタイ','down'],['画面の右へ移動したい','right']])check('search/direction/'+query,()=>{
 const b=find(query)[0];assert.equal(b.id,'MotionCommand:MOVE_DIRECTION');assert.equal(b.candidateNode.fields.direction,direction);
 const parsed=A.parseSyntax(code(query)[0].text,{symbols:A.buildSymbols(p)});assert.equal(parsed.syntaxDiagnostics.length,0);
 assert.equal(parsed.ast.body[0].direction,direction);return{direction};
});
for(const [query,index]of [['５番目に入れたい',5],['3ばんめにいれたい',3],['10番目へ挿入',10]])check('search/ordinal/'+query,()=>{
 const b=find(query)[0];assert.equal(b.id,'ListInsert');assert.equal(b.candidateNode.inputs.index.fields.value,index);
 assert.equal(b.candidateNode.inputs.target.fields.name,'持ち物');assert.match(code(query)[0].text,new RegExp(index+'番目'));return{index,boundList:'持ち物'};
});
check('search/scopes-remain-distinct',()=>{const reads=find('てんすう').filter(b=>b.id==='VariableRead');assert.deepEqual(plain(reads.map(b=>b.candidateNode.fields.qualifier)),['project','self']);
 assert.ok(!find('点数').some(b=>['UserActionCall','UserFunctionCall','ListInsert','ListReplace'].includes(b.id)));return{qualifiers:['project','self'],typed:true};});
check('search/callable-arguments-and-kind',()=>{const f=find('だいきん')[0];assert.equal(f.id,'UserFunctionCall');assert.equal(f.candidateNode.fields.name,'代金');assert.deepEqual(plain(f.candidateNode.fields.argumentNames),['個数','ねだん']);assert.equal(f.candidateNode.inputs.args.length,2);return{name:'代金',args:2};});
check('search/no-query-mutation',()=>{const before=JSON.stringify(p);for(const [q]of cases){find(q);code(q);}assert.equal(JSON.stringify(p),before);return{projectUnchanged:true};});
check('search/rotation-and-replacement-distinct',()=>{assert.ok(!find('右に回る').some(b=>b.id==='MotionCommand:MOVE_DIRECTION'));assert.equal(A.searchIntent('2番目を置き換えたい'),null);return{moveNotRotation:true,insertNotReplace:true};});
check('search/unavailable-reason',()=>{const stage=A.hintCandidates(p,'stage',{source:''}),match=A.searchHintCandidates(stage,'右に行きたい',p)[0];assert.equal(match.enabled,false);assert.match(match.reason,/部品/);return{enabled:false,reason:match.reason};});
check('search/bound-insertion-semantic',()=>{
 const session=A.createEditorSession('script:search-body','',ctx,p);
 const candidate=find('てんすう').find(b=>b.id==='NumericUpdate:ADD'&&b.binding.qualifier==='self');
 const node=candidate.candidateNode,op={type:'insert',parentId:session.blockView.id,body:'body',index:0,node};
 const result=A.prepareBlockEdit(session,op,{project:p,context:ctx});assert.match(result.source,/自分の点数/);assert.doesNotMatch(result.source,/作品の点数/);return{source:result.source,qualifier:'self'};
});
const report={schema:'akari-search-bindings-v1',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',uxAcceptance:false,snapshot:snapshot(currentProductFile()),results};
const output=process.argv[2];if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
console.log('Search bindings: '+results.filter(r=>r.status==='PASS').length+'/'+results.length+' '+report.status);for(const r of results)if(r.status==='FAIL')console.error(r.id+'\n'+r.error);if(report.status!=='PASS')process.exitCode=1;
