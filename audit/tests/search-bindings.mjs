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
const cases=[['右に行きたい','MotionCommand:MOVE_BY'],['小さくしたい','LooksCommand:SET_SCALE'],['おおきさ','LooksCommand:SET_SCALE'],['2番目に入れたい','ListInsert'],['点数','VariableRead'],['てんすう','VariableRead'],['おじぎ','UserActionCall'],['代金','UserFunctionCall']];
for(const [query,schema]of cases)check('search/required/'+query,()=>{
 const blocks=find(query),texts=code(query);assert.ok(blocks.some(b=>b.id===schema));assert.ok(texts.length);
 for(const b of blocks)if(b.candidateNode)A.blockDecode(b.candidateNode);
 return{schema,code:texts.length,block:blocks.length};
});
for(const [query,direction]of [['ひだりにすすみたい','left'],['上へ動かしたい','up'],['シタへイキタイ','down'],['画面の右へ移動したい','right']])check('search/direction/'+query,()=>{
 // いまのばしょから動く with one direction: よこ (右・左) or たて (上・下), the other step left out (LANGUAGE.md 動きの文).
 const b=find(query)[0],[axis,other,key]=['right','left'].includes(direction)?['x','y','xDir']:['y','x','yDir'];assert.equal(b.id,'MotionCommand:MOVE_BY');
 const node=A.blockDecode(b.candidateNode);assert.equal(node[key],direction);assert.ok(node[axis]&&node[other]===undefined);
 const parsed=A.parseSyntax(code(query)[0].text,{symbols:A.buildSymbols(p)});assert.equal(parsed.syntaxDiagnostics.length,0);
 const n=parsed.ast.body[0];assert.equal(n.op,'MOVE_BY');assert.equal(n[key],direction);assert.ok(n[axis]&&n[other]===undefined);return{direction};
});
for(const [query,index]of [['５番目に入れたい',5],['3ばんめにいれたい',3],['10番目へ挿入',10]])check('search/ordinal/'+query,()=>{
 const b=find(query)[0];assert.equal(b.id,'ListInsert');assert.equal(b.candidateNode.inputs.index.fields.value,index);
 assert.equal(b.candidateNode.inputs.target.fields.name,'持ち物');assert.match(code(query)[0].text,new RegExp(index+'番目'));return{index,boundList:'持ち物'};
});
// E1-R1-07 (E-13; LANGUAGE.md lists くらべる among the かんたん 計算 blocks): words a child uses for a block find it, and
// 「ひく」 puts a subtraction first, not an addition.
for(const [query,wanted]of [['くらべる',id=>id.startsWith('CompareExpression:')],['ランダム',id=>id==='BuiltinCall:乱数'],['まわす',id=>id.startsWith('MotionCommand:TURN_')],
 ['やめる',id=>id.startsWith('StopCommand:')],['とまる',id=>id.startsWith('StopCommand:')],['へる',id=>id==='NumericUpdate:SUB'],
 ['クリック',id=>id==='SensorRead:マウスが押されている'],['タッチ',id=>['SensorRead:マウスが押されている','SensorRead:TOUCHING'].includes(id)]])check('search/child-words/'+query,()=>{
 const ids=find(query).map(b=>b.id);assert.ok(ids.some(wanted),query+' finds its block: '+ids.slice(0,5).join(', '));return{first:ids[0]};
});
check('search/child-words/ひく-subtracts-first',()=>{const ids=find('ひく').map(b=>b.id);assert.ok(['NumericUpdate:SUB','BinaryExpression:SUB'].includes(ids[0]),'ひく puts a subtraction first: '+ids.slice(0,5).join(', '));return{first:ids[0]};});
check('search/scopes-remain-distinct',()=>{const reads=find('てんすう').filter(b=>b.id==='VariableRead');assert.deepEqual(plain(reads.map(b=>b.candidateNode.fields.qualifier)),['project','self']);
 assert.ok(!find('点数').some(b=>['UserActionCall','UserFunctionCall','ListInsert','ListReplace'].includes(b.id)));return{qualifiers:['project','self'],typed:true};});
check('search/callable-arguments-and-kind',()=>{const f=find('だいきん')[0];assert.equal(f.id,'UserFunctionCall');assert.equal(f.candidateNode.fields.name,'代金');assert.deepEqual(plain(f.candidateNode.fields.argumentNames),['個数','ねだん']);assert.equal(f.candidateNode.inputs.args.length,2);return{name:'代金',args:2};});
check('search/no-query-mutation',()=>{const before=JSON.stringify(p);for(const [q]of cases){find(q);code(q);}assert.equal(JSON.stringify(p),before);return{projectUnchanged:true};});
// A diagonal (左上を向く, みぎしたへ動く, 右ななめ上, ななめ左下) and two colours written together (青緑) name no one direction or
// colour: the block is offered with no value from those words; 左右・上下 with a move are よこ・たて; one word keeps its value.
check('search/diagonal-and-paired-words-give-no-one-value',()=>{
 const turn={schemaId:'MotionCommand:SET_DIRECTION'},move={schemaId:'MotionCommand:MOVE_BY'},x={schemaId:'MotionCommand:MOVE_BY',direction:'right',directions:['right','left']},y={schemaId:'MotionCommand:MOVE_BY',direction:'up',directions:['up','down']};
 const expected={'左上を向く':turn,'右下を向く':turn,'右上を向く':turn,'左下を向く':turn,'上左を向く':turn,'下右を向く':turn,'ひだりうえを向く':turn,'みぎしたを向く':turn,'右ななめ上を向く':turn,
  'ななめ左下を向く':turn,'右斜め下を向く':turn,'左上へ動く':move,'右下に10歩進む':move,'みぎうえへ行く':move,'左右に動く':x,'上下に動く':y,'よこに動く':x,
  'ペンの色を青緑にする':{schemaId:'PenCommand:SET_COLOR'},'色を赤むらさきにする':{schemaId:'LooksCommand:SET_COLOR'},'画面の左下のはしへ行く':null,
  '左を向く':{schemaId:'MotionCommand:SET_DIRECTION',direction:'left',value:-90},'下を向く':{schemaId:'MotionCommand:SET_DIRECTION',direction:'down',value:180},
  '上へ動く':{schemaId:'MotionCommand:MOVE_BY',direction:'up'},'色を水色にする':{schemaId:'LooksCommand:SET_COLOR',color:'水色'}};
 const intents=Object.fromEntries(Object.keys(expected).map(q=>[q,plain(A.searchIntent(q))]));assert.deepEqual(intents,expected);
 assert.equal(find('左上を向く')[0]?.id,'MotionCommand:SET_DIRECTION');assert.equal(find('左上を向く')[0]?.candidateNode??null,null);return intents;
});
check('search/rotation-and-replacement-distinct',()=>{assert.ok(!find('右に回る').some(b=>b.id==='MotionCommand:MOVE_BY'));assert.equal(A.searchIntent('2番目を置き換えたい'),null);return{moveNotRotation:true,insertNotReplace:true};});
// The search reads katakana as hiragana: a word is found written either way (線をクリアする・線をくりあする, …というリストを
// 作る, 440ヘルツを出す, 0からスタートする), and a pen color written in katakana or hiragana keeps its color.
check('search/katakana-and-hiragana-words',()=>{
 const expected={'線をクリアする':{schemaId:'PenCommand:CLEAR'},'線をくりあする':{schemaId:'PenCommand:CLEAR'},'持ち物というリストを作る':{schemaId:'LocalListDeclaration'},
  '持ち物というりすとを作る':{schemaId:'LocalListDeclaration'},'ペンの色をピンクにする':{schemaId:'PenCommand:SET_COLOR',color:'ピンク'},'ぺんのいろをおれんじにする':{schemaId:'PenCommand:SET_COLOR',color:'オレンジ'},
  '440ヘルツを出す':{schemaId:'SoundCommand:TONE_WAIT'},'点数を0からスタートする':{schemaId:'Assignment'},'1秒ウエイト':{schemaId:'WaitTime'},'ミニにする':{schemaId:'LooksCommand:SET_SCALE',scale:50}};
 const intents=Object.fromEntries(Object.keys(expected).map(q=>[q,plain(A.searchIntent(q))]));assert.deepEqual(intents,expected);return intents;
});
// The search of a text part (文字・ボタン・四角) reads 「「やあ」と書く」 as writing its own text, as the near forms of its
// body do: the part's kind goes with the words.
check('search/text-part-writes-its-text',()=>{
 const q=A.makeDefaultProject();q.components.push({id:'label-1',type:'label',name:'見出し',x:0,y:0,w:120,h:40,fg:'#000000',bg:null,fontSize:16,visible:true,direction:90,scalePercent:100,text:'あ',localData:{variables:[],lists:[]}});
 q.scripts=[{id:'label-body',targetId:'label-1',event:'start',source:''}];
 const c={targetId:'label-1',targetType:'label',event:'start'},h=A.hintCandidates(q,'label-1',{source:'',...c});
 const blocks=A.blockSearchCandidates(q,c,'「やあ」と書く',h).map(b=>b.id),words=A.searchHintCandidates(h,'「やあ」と書く',q,c).map(x=>x.text);
 assert.ok(blocks.includes('LooksCommand:SET_SELF_TEXT')&&!blocks.includes('Say'),blocks.join());assert.ok(words.length&&words.every(t=>!/言う/.test(t)),words.join(' / '));
 return{blocks,words};
});
// The colour, the number and the empty text the words ask for go into the block the search makes, as into the near form.
check('search/words-fill-the-block',()=>{
 const made=q=>{const intent=A.searchIntent(q),block=find(q).find(b=>b.id===intent.schemaId);assert.ok(block?.candidateNode,q+': '+JSON.stringify(intent));
  return A.formatScript({kind:'Script',body:[A.blockDecode(block.candidateNode,{allowHoles:true})]},{allowHoles:true,symbols:A.buildSymbols(p)});};
 const texts={white:made('白くする'),forward:made('4つ前に出る'),left:made('左を向く')};
 assert.ok(texts.white.includes('「白」'),texts.white);assert.ok(texts.forward.includes('4つ'),texts.forward);assert.ok(texts.left.includes('－90'),texts.left);
 // (左を向く is a block that can be put in: the direction goes into its value, not into a field it has not)
 const left=find('左を向く').find(b=>b.id==='MotionCommand:SET_DIRECTION');assert.ok(left?.candidateNode&&!left.candidateNode.fields.direction);return texts;
});
// The 番目 of the words is the number written before 番目, not the first number of the words.
check('search/index-is-the-number-before-banme',()=>{
 const intents=Object.fromEntries(['10を3番目にはさむ','名前1の2番目をとる','2番目は「かさ」','10を2番目に入れる'].map(q=>[q,plain(A.searchIntent(q))]));
 assert.deepEqual(Object.values(intents).map(x=>[x.schemaId,x.index]),[['ListInsert',3],['ListDelete',2],['ListReplace',2],['ListInsert',2]]);return intents;
});
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
