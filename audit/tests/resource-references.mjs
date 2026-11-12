import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
import {refusedWith} from '../lib/refusal.cjs';
import {sentenceFormCases} from '../fixtures/language/sentence-forms.mjs';
const A=loadApi(fs.readFileSync(currentProductFile(),'utf8')),results=[],plain=x=>JSON.parse(JSON.stringify(x));
const check=(id,fn)=>{try{results.push({id,status:'PASS',observed:fn()});}catch(error){results.push({id,status:'FAIL',error:error.stack});}};
function fixture(source){
 const p=A.makeDefaultProject(),cat=p.components[0];cat.name='あかり';cat.localData={variables:[{id:'local-score',name:'点数',initialValue:4}],lists:[]};
 p.projectData={variables:[{id:'global-score',name:'点数',initialValue:1}],lists:[{id:'global-list',name:'持ち物',initialValue:['本']}]};
 p.sounds=[{id:'sound-one',name:'音1',assetId:'asset-sound-one'}];p.actions=[{id:'action-one',ownerId:'stage',name:'おじぎ',args:[],source:'15度右に回る。'}];p.functions=[{id:'function-one',ownerId:'stage',name:'代金',args:[],source:'1を答えとして返す。'}];
 p.scripts=[{id:'reference-main',targetId:cat.id,event:'start',source}];return p;
}
const cases=[['costume','衣装を「たくどん」にする。','costume:costume-1'],['backdrop','背景を「空色」にする。','backdrop:backdrop-1'],['sound','「音1」を鳴らす。','sound:sound-one'],
 ['actor','あかりはいまのばしょから、右へ1歩動く。','component:sprite-1'],['sensor','「あかり」までの距離を言う。','component:sprite-1'],['action','「おじぎ」という手順を行う。','action:action-one'],
 ['function','【代金】で求めた答えを言う。','function:function-one'],['local-data','点数を言う。','data:local-score'],['list','持ち物の1番目を言う。','data:global-list']];
for(const[id,source,key]of cases)check('references/'+id,()=>{
 const p=fixture(source),before=JSON.stringify(p),impact=A.resourceChangeImpact(p,key);assert.ok(impact.references.some(r=>r.sourceKey==='script:reference-main'),JSON.stringify(impact));assert.equal(impact.uncertain.length,0);assert.equal(JSON.stringify(p),before);
 const parsed=A.parseSyntax(source,{targetId:'sprite-1',event:'start',symbols:A.buildSymbols(p)});assert.ok(parsed.ast);p.scripts[0].source=A.formatScript(A.blockDecode(A.blockEncode(parsed.ast).tree));const again=A.resourceChangeImpact(p,key);assert.ok(again.references.some(r=>r.sourceKey==='script:reference-main'));
 return{resourceKey:key,source,codeAndBlock:true,projectUnchanged:true};
});
check('references/quoted-prose-is-not-a-reference',()=>{const p=fixture('「たくどん」と言う。'),impact=A.resourceChangeImpact(p,'costume:costume-1');assert.equal(impact.references.length,0);assert.equal(impact.uncertain.length,0);return{references:0,uncertain:0};});
check('references/shadowed-project-data',()=>{const p=fixture('点数を言う。');assert.equal(A.resourceChangeImpact(p,'data:global-score').references.length,0);p.functions=[{id:'function-one',ownerId:'stage',name:'代金',args:['点数'],source:'点数を答えとして返す。'}];assert.equal(A.resourceChangeImpact(p,'data:global-score').references.length,0);return{localShadowsProject:true,argumentShadowsProject:true};});
check('references/unfinished-and-dynamic-are-uncertain',()=>{const p=fixture('衣装を文字（点数）にする。');assert.ok(A.resourceChangeImpact(p,'costume:costume-1').uncertain.some(r=>r.kind==='costume'));const drafts=[{key:'unfinished',kind:'script',ownerId:'sprite-1',source:'衣装を「星',context:{targetId:'sprite-1',event:'start'}}];const impact=A.resourceChangeImpact(p,'sound:sound-one',{drafts});assert.ok(impact.uncertain.some(r=>r.sourceKey==='unfinished'));assert.throws(()=>A.prepareResourceRename(p,'costume:costume-1','夜'),{name:'AkariError',code:'S301',message:'名前を 使って いるか しらべられない 本文が あります。先に 本文を 書きおえてから、名前を かえて ください'});return{dynamicReported:true,unfinishedReported:true,unsafeRenameRejected:true};});
check('references/rename-exact-resource-only',()=>{
 const source='作品を動かしたとき、あかりは、\r\n  衣装を「たくどん」にする。 ※ 衣装の参照\r\n  「たくどん🐈」と言う。\r\n  0.12345678901234566を言う。',p=fixture(source),before=JSON.stringify(p),next=A.prepareResourceRename(p,'costume:costume-1','夜空');
 assert.equal(next.scripts[0].source,source.replace('衣装を「たくどん」','衣装を「夜空」'));assert.equal(next.components[0].costumes[0].id,'costume-1');assert.equal(next.components[0].costumes[0].assetId,p.components[0].costumes[0].assetId);assert.equal(JSON.stringify(p),before);assert.equal(A.compileProject(next).errors.length,0);
 return{onlyReferenceTokenChanged:true,assetIdUnchanged:true,originalProjectUnchanged:true};
});
check('references/rename-duplicate-and-shared-context-rejected',()=>{
 const p=fixture('衣装を「たくどん」にする。');assert.throws(()=>A.prepareResourceRename(p,'costume:costume-1','丸'),{name:'AkariError',code:'F503',message:'同じ 名前が あります'});const other=structuredClone(p.components[0]);other.id='other-actor';other.name='こはる';other.localData={variables:[],lists:[]};other.costumes=other.costumes.map((c,i)=>({...c,id:'other-costume-'+i}));other.costumeId=other.costumes[0].id;p.components.push(other);p.actions[0].source='衣装を「たくどん」にする。';assert.throws(()=>A.prepareResourceRename(p,'costume:costume-1','夜'),{name:'AkariError',code:'S301',message:'同じ 名前が、いくつかの ものを さして います。どれの ことか、はっきり 書いてから 名前を かえて ください'});return{duplicateRejected:true,ambiguousSharedReferenceRejected:true};
});
check('references/rename-background-and-sound',()=>{for(const[key,oldName,newName,source]of [['backdrop:backdrop-1','空色','夜','背景を「空色」にする。'],['sound:sound-one','音1','鐘','「音1」を鳴らす。']]){const next=A.prepareResourceRename(fixture(source),key,newName);assert.equal(next.scripts[0].source,source.replace(oldName,newName));assert.equal(A.resourceChangeImpact(next,key).references.length,1);}return{background:true,sound:true};});
function execute(p){const c=A.compileProject(p);assert.equal(c.errors.length,0,JSON.stringify(c.errors));const r=new A.RuntimeModel(p,{}),speech=[],errors=[];r.now=()=>0;const scheduler=new A.EventScheduler(p,c,r,{say:(id,text)=>speech.push(text),runtimeError:(task,error)=>errors.push(error.code)});scheduler.schedule=()=>{};try{scheduler.start();let turns=0;while(scheduler.ready.length&&turns++<1000)scheduler.runTurn(true);assert.ok(turns<1000);assert.deepEqual(errors,[]);return{speech,actors:plain([...r.actors.values()].map(a=>({id:a.id,x:a.x,y:a.y,direction:a.direction})))}}finally{scheduler.stop();}}
function verifyActorTokenBoundaries() {
 const sources=[
  '灯は画面の左下のはしから、右へ100歩、上へ50歩のばしょへ行く。\n【灯合図】という手順を行う。',
  '灯は画面の左下のはしから、右へ100歩、上へ50歩のばしょへ行く。\n灯は【灯合図】という手順を行う。',
  '【灯】は画面の左下のはしから、右へ100歩、上へ50歩のばしょへ行く。 ※ 灯合図と灯\r\n「灯と灯合図🐈」と言う。\r\n0.12345678901234566を言う。\r\n【灯合図】という手順を行う。',
  '灯は画面の左下のはしから、右へ100歩、上へ50歩のばしょへ行く。\n2回くり返す。\n  【灯合図】という手順を行う。',
  '灯は、2回くり返す。\n  【灯合図】という手順を行う。',
  '灯は画面の左下のはしから、右へ100歩、上へ50歩のばしょへ行く。それから、【灯合図】という手順を行う。',
  '灯はいまのばしょから、右へ30歩動く。\n灯は2秒かけて、いまのばしょから、上へ10歩動く。',
  '作品を動かしたとき、【灯】は、\n  【灯合図】という手順を行う。',
  '作品を動かしたとき、【灯】は、\n  【灯合図】という手順を行う。\n灯がクリックされたとき、\n  【灯合図】という手順を行う。',
  '灯をいまのばしょから、右へ30歩動かす。\n【灯合図】という手順を行う。',
  '灯の（よこのばしょ）を言う。',
  'もし灯が「端」にふれていれば、\n  【灯合図】という手順を行う。',
  '「右」キーが押されているあいだは、灯は右へ1秒に20歩の速さで動き続ける。',
 ];
 const identity=p=>A.buildProjectReferenceGraph(p).references.map(r=>JSON.stringify([r.sourceKey,r.resourceKey,r.binding,r.nodePath])).sort();
 for(const source of sources){
  const p=plain(A.makeDefaultProject());p.components[0].name='灯';p.scripts=[{id:'actor-token',targetId:'stage',event:'start',source}];p.actions=[{id:'prefix-action',ownerId:'stage',name:'灯合図',args:[],source:'何もしない。'}];p.functions=[];
  const before=JSON.stringify(p);assert.equal(A.compileProject(p).errors.length,0);assert.equal(A.buildProjectReferenceGraph(p).uncertain.length,0);
  const next=A.prepareResourceRename(p,'component:sprite-1','灯新'),expected=source.replace(/【灯】/g,'【灯新】').replace(/灯(?=は|がクリック|をいまのばしょから|の（|が「端」)/g,'灯新');
  assert.equal(next.scripts[0].source,expected);assert.equal(next.actions[0].name,'灯合図');assert.deepEqual(identity(next),identity(p));assert.equal(A.compileProject(next).errors.length,0);assert.equal(JSON.stringify(p),before);
  const roundtrip=plain(next),record=A.sourceRegistry(roundtrip)[0],session=A.createEditorSession(record.key,record.source,record.context,roundtrip);
  const decoded=A.blockDecode(session.blockView);assert.equal(A.astEquivalent(session.syntaxAst,decoded),true);
  assert.equal(A.createEditorSession(record.key,record.source,record.context,roundtrip).sourceText,record.source);
 }
}
for(const name of ['灯り','星2','はなを'])check('references/rename-actor/'+name,()=>{
 const source='作品を動かしたとき、【あかり】は、\r\n  いまのばしょから、右へ10歩動く。 ※ あかりの台詞\r\n  「あかり🐈」と言う。\r\n  0.12345678901234566を言う。',p=fixture(source),before=JSON.stringify(p),result=execute(p),next=A.prepareResourceRename(p,'component:sprite-1',name);
 assert.equal(next.scripts[0].source,source.replace('【あかり】','【'+name+'】'));assert.deepEqual(execute(next),result);assert.equal(JSON.stringify(p),before);if(name==='灯り')verifyActorTokenBoundaries();return{newName:name,referenceOnly:true,runtimeSame:true};
});
check('references/rename-actor-sensor-and-units',()=>{const source='あかりをいまのばしょから、右へ30歩動かす。\n星は「あかり」までの距離を言う。\nあかりがクリックされたとき、\n  「あかり」と言う。',p=fixture(source);const other=structuredClone(p.components[0]);other.id='other';other.name='星';other.localData={variables:[],lists:[]};other.costumes=other.costumes.map((c,i)=>({...c,id:'other-costume-'+i}));other.costumeId=other.costumes[0].id;p.components.push(other);A.updateScriptSource(p.scripts[0],source,p);const ids=plain(p.scripts[0].document.unitIds),r=execute(p),next=A.prepareResourceRename(p,'component:sprite-1','灯り');assert.equal(next.scripts[0].source,source.replace('あかりを','灯りを').replace('「あかり」まで','「灯り」まで').replace('あかりが','灯りが'));assert.deepEqual(plain(next.scripts[0].document.unitIds),ids);assert.deepEqual(execute(next),r);return{stableUnits:true,runtimeSame:true,proseUnchanged:true};});
for(const scope of ['global','local'])check('references/rename-scoped-data/'+scope,()=>{const source='作品の点数を1にする。\n自分の点数を言う。\n作品の点数を言う。',p=fixture(source),next=A.prepareResourceRename(p,'data:'+scope+'-score','記録'),expected=scope==='global'?source.replaceAll('作品の点数','作品の記録'):source.replaceAll('自分の点数','自分の記録');assert.equal(next.scripts[0].source,expected);assert.deepEqual(execute(next),execute(p));return{scope,qualifiedReferences:true,runtimeSame:true};});
check('references/rename-list',()=>{const source='持ち物の1番目を言う。\n「持ち物」と言う。',p=fixture(source),next=A.prepareResourceRename(p,'data:global-list','鞄');assert.equal(next.scripts[0].source,source.replace('持ち物の1','鞄の1'));assert.deepEqual(execute(next),execute(p));return{list:true,runtimeSame:true};});
check('references/rename-action',()=>{const source='「おじぎ」という手順を2回行う。\n「おじぎ」と言う。',p=fixture(source),next=A.prepareResourceRename(p,'action:action-one','礼');assert.equal(next.scripts[0].source,source.replace('「おじぎ」という','「礼」という'));assert.deepEqual(execute(next),execute(p));return{count:2,runtimeSame:true};});
check('references/rename-function-arguments',()=>{const source='ねだんを80、個数を3として、「代金」で求めた答えに10を足して言う。',p=fixture(source);p.functions[0].args=['個数','ねだん'];p.functions[0].source='個数とねだんをかけた数を、答えとして返す。';const next=A.prepareResourceRename(p,'function:function-one','会計');assert.equal(next.scripts[0].source,source.replace('「代金」','「会計」'));assert.deepEqual(execute(next).speech,['250']);assert.deepEqual(execute(next),execute(p));return{argumentOrderPreserved:true,value:250};});
check('references/rename-call-phrase',()=>{const p=fixture('おじぎする。');p.actions[0].callPhrase='おじぎする';const next=A.prepareResourceRename(p,'action:action-one','礼');assert.equal(next.scripts[0].source,p.scripts[0].source);assert.deepEqual(execute(next),execute(p));return{phraseUnchanged:true,runtimeSame:true};});
check('references/rename-shadowing-refused',()=>{const p=fixture('作品の点数を言う。\n記録を言う。');p.components[0].localData.variables.push({id:'local-record',name:'記録',initialValue:2});const before=JSON.stringify(p);assert.throws(()=>A.prepareResourceRename(p,'data:local-score','記録'),{name:'AkariError',code:'F503',message:'同じ ところに 同じ 名前が あります。ちがう 名前に して ください'});p.scripts[0].source='点数を言う。';p.components[0].localData.variables=[];p.projectData.variables.push({id:'global-record',name:'記録',initialValue:2});p.components[0].localData.variables.push({id:'local-record',name:'新点',initialValue:9});const stable=JSON.stringify(p);assert.throws(()=>A.prepareResourceRename(p,'data:global-score','新点'),{name:'AkariError',code:'S301',message:'その 名前に すると、さす ものや、どの 部品の ものかが かわって しまいます。ちがう 名前に するか、どの 部品の ものか、はっきり 書いて ください'});assert.equal(JSON.stringify(p),stable);return{duplicateRejected:true,shadowCaptureRejected:true};});
check('references/rename-unknown-draft-refused',()=>{const p=fixture('「未完成'),before=JSON.stringify(p);for(const key of ['component:sprite-1','data:global-score','action:action-one','function:function-one'])assert.throws(()=>A.prepareResourceRename(p,key,'新名'),{name:'AkariError',code:'S301',message:'書きかけの 本文か、動かして はじめて 決まる 名前が あります。本文を 書きおえてから、名前を かえて ください'});assert.equal(JSON.stringify(p),before);return{allKindsAtomic:true};});
check('references/rename-stage-alias',()=>{const p=fixture('作品を動かしたとき、画面は、\n  「画面1」と言う。');p.scripts[0].targetId='stage';const next=A.prepareResourceRename(p,'component:stage','舞台');assert.equal(next.scripts[0].source,p.scripts[0].source);assert.deepEqual(execute(next),execute(p));return{stableAlias:true,proseUnchanged:true};});
// A name is renamed wherever a sentence holds it. The work of the sweeps: the parts ねこ and 星, the variables 点数 and
// 名前, the list 名前一覧, the procedure おじぎ and the calculation 代金; the body is the first part's.
function sweepWork(source){
 const p=A.makeDefaultProject(),cat=p.components[0],star=structuredClone(cat);cat.name='ねこ';star.id='sweep-star';star.name='星';star.costumes=star.costumes.map((c,i)=>({...c,id:'sweep-star-costume-'+i}));star.costumeId=star.costumes[0].id;p.components.push(star);
 p.projectData={variables:[{id:'sweep-score',name:'点数',initialValue:0},{id:'sweep-name',name:'名前',initialValue:''}],lists:[{id:'sweep-list',name:'名前一覧',initialValue:['あかり']}]};
 p.actions=[{id:'sweep-action',ownerId:'stage',name:'おじぎ',args:[],source:'何もしない。'}];p.functions=[{id:'sweep-function',ownerId:'stage',name:'代金',args:[],source:'1を答えとして返す。'}];
 p.scripts=[{id:'sweep',targetId:cat.id,event:'start',source}];A.validateDesignProject(p);return p;
}
const sweepNames=[['data:sweep-score','点数'],['data:sweep-name','名前'],['data:sweep-list','名前一覧'],['component:sprite-1','ねこ'],['component:sweep-star','星'],['action:sweep-action','おじぎ'],['function:sweep-function','代金']];
const sweepTree=p=>{const parsed=A.parseSyntax(p.scripts[0].source,{targetId:p.scripts[0].targetId,targetType:'sprite',event:'start',symbols:A.buildSymbols(p)});assert.ok(parsed.ast,'the body reads: '+JSON.stringify(p.scripts[0].source));return parsed.ast;};
// The tree with the name changed: each place that holds the old name holds the new one, in 【 】 where a name that is
// not written bare stands with no word before it. Nothing else differs.
function treeWithName(node,old,name,bare){
 if(Array.isArray(node))return node.map(n=>treeWithName(n,old,name,bare));if(!node||typeof node!=='object')return node===old?name:node;
 const out={};for(const [key,value]of Object.entries(node))if(key!=='sourceSpan'&&!(key==='source'&&node.kind==='Script'))out[key]=treeWithName(value,old,name,bare);
 if(!bare&&node.name===old&&node.qualifier===null)out.qualifier='exact';return out;
}
// Renames every name the body holds, to a name written bare and (data) to one written in 【 】. The count of renames.
function renameSweep(source,only=null){
 const p=sweepWork(source),before=JSON.stringify(p),errors=A.compileProject(p).errors;assert.deepEqual(plain(errors),[],'input validity: '+JSON.stringify(source));let count=0;
 for(const [key,old]of sweepNames){
  if(only&&!only.includes(old))continue;
  if(!A.resourceChangeImpact(p,key).references.some(r=>r.sourceKey==='script:sweep')){assert.ok(!only,'the name is found in '+JSON.stringify(source)+': '+old);continue;}
  for(const [name,bare]of key.startsWith('data:')?[['みかん',true],['あの数',false]]:[['みかん',true]]){
   let next;try{next=A.prepareResourceRename(p,key,name);}catch(error){assert.fail(JSON.stringify(source)+' '+old+' -> '+name+': '+error.message);}
   assert.equal(JSON.stringify(p),before,'the work is not changed in place');assert.deepEqual(plain(A.compileProject(next).errors),[],JSON.stringify(next.scripts[0].source));
   assert.deepEqual(plain(treeWithName(sweepTree(next),null,null,true)),plain(treeWithName(sweepTree(p),old,name,bare)),JSON.stringify(source)+' '+old+' -> '+name+' keeps the meaning: '+JSON.stringify(next.scripts[0].source));
   assert.ok(!next.scripts[0].source.includes(old)||source.split(old).length-1>next.scripts[0].source.split(old).length-1,'the old name is written no more where it was a name');count++;
  }
 }return count;
}
// Bodies of the sentence-form cases that the first part's body of the sweep work does not take (a heading, a part or
// a sound the work does not have, a body of a procedure).
const sweepNotTaken=['SF-action-call','SF-set-input','SF-tone-sentences','SF-broadcast-return-locals','SF-looks-value-sentences','SF-te-clear-notify-sound','SF-polite-every-action','SF-heading-value-changed'];
// The cases the sweep renames in, as the product reads them today, and the renames they hold: exactly these.
const sweepTaken=['SF-variable-input','SF-contains-if','SF-contains-while','SF-contains-until','SF-contains-until-negative','SF-start-heading','SF-add-value-first','SF-sub-value-first','SF-repeat-until','SF-foreach-continue','SF-goto-part','SF-continuous-rule','SF-clone-sentences','SF-wait-say-sentences','SF-list-sentences','SF-update-sentences','SF-condition-01','SF-condition-02','SF-condition-03','SF-condition-04','SF-condition-05','SF-condition-06','SF-condition-07','SF-condition-08','SF-condition-09','SF-condition-10','SF-condition-11','SF-condition-12','SF-condition-13','SF-condition-14','SF-te-hide-wait-show','SF-wait-subject','SF-wait-topic','SF-subject-self-and-lead','SF-count-ko','SF-and-first-naku','SF-te-moves','SF-te-data','SF-te-make-say','SF-polite-actions','SF-polite-kana','SF-te-every-verb','SF-heading-start-short','SF-heading-click','SF-heading-any-key','SF-heading-named-key','SF-heading-any-message','SF-heading-named-message','SF-heading-any-signal','SF-heading-named-signal','SF-heading-backdrop','SF-heading-clone','SF-until-negative','SF-ending-assign-add','SF-ending-list'],sweepRenames=99;
const sweepCounts=({taken,notTaken,renames})=>{assert.deepEqual(notTaken,sweepNotTaken,'the cases the sweep does not take');assert.deepEqual(taken,sweepTaken,'the cases the sweep renames in');assert.equal(renames,sweepRenames,'the renames of the sweep');};
check('references/rename-sentence-forms',()=>{
 const taken=[],notTaken=[];let renames=0;
 for(const test of sentenceFormCases){let clean=false;try{clean=A.compileProject(sweepWork(test.source)).errors.length===0;}catch{}
  if(!clean){notTaken.push(test.id);continue;}const count=renameSweep(test.source);if(count){taken.push(test.id);renames+=count;}}
 sweepCounts({taken,notTaken,renames});
 // (a case fewer or more on either side, or one rename fewer, is refused)
 for(const other of [{counts:{taken:taken.slice(1),notTaken,renames},message:'the cases the sweep renames in'},{counts:{taken:[...taken,'SF-extra'],notTaken,renames},message:'the cases the sweep renames in'},
  {counts:{taken,notTaken:[...notTaken,'SF-extra'],renames},message:'the cases the sweep does not take'},{counts:{taken,notTaken:notTaken.slice(1),renames},message:'the cases the sweep does not take'},
  {counts:{taken,notTaken,renames:renames-1},message:'the renames of the sweep'}])
  assert.throws(()=>sweepCounts(other.counts),refusedWith({name:'AssertionError',code:'ERR_ASSERTION',message:new RegExp('^'+other.message+'(?:\n|$)')}));
 return{cases:sentenceFormCases.length,taken:taken.length,renames,notTaken};
});
check('references/rename-put-into-and-count',()=>{
 const sources=['答えを点数に入れる。','大きさを点数に入れる。','名前一覧の1番目を点数に入れる。','点数を名前に入れる。','点数に答えを入れる。','ねこは、答えを点数に入れる。','名前一覧の数を言う。','名前一覧の個数を言う。','名前一覧の数を点数に入れる。','もし名前一覧の個数が点数より大きいなら、\n  点数を名前に入れる。'];
 let renames=0;for(const source of sources)renames+=renameSweep(source);
 for(const [source,key,name,expected]of [['答えを点数に入れる。','data:sweep-score','みかん','答えをみかんに入れる。'],['点数を名前に入れる。','data:sweep-name','みかん','点数をみかんに入れる。'],['点数を名前に入れる。','data:sweep-score','みかん','みかんを名前に入れる。'],['名前一覧の数を言う。','data:sweep-list','みかん','みかんの数を言う。'],['名前一覧の個数を言う。','data:sweep-list','みかん','みかんの個数を言う。']])assert.equal(A.prepareResourceRename(sweepWork(source),key,name).scripts[0].source,expected);
 return{sources:sources.length,renames};
});
check('references/rename-joined-conditions',()=>{
 // Each sentence form that holds a condition, each way two conditions are joined, each kind of name a condition holds
 // (a variable, a list, a part), the name in the first condition and in the second.
 const forms=[c=>'もし'+c.plain+'なら、\n  何もしない。',c=>c.until+'まで待つ。',c=>c.until+'までくり返す。\n  何もしない。',c=>c.plain+'あいだ、くり返す。\n  何もしない。'];
 const joins=['かつ','または','か、','で、'],other={plain:'名前が2と同じ',until:'名前が2と同じになる',te:'名前が2と同じで、'};
 const atoms=[['点数',{plain:'点数が1と同じ',until:'点数が1と同じになる',te:'点数が1と同じで、'}],['名前一覧',{plain:'名前一覧の数が1と同じ',until:'名前一覧の数が1と同じになる',te:'名前一覧の数が1と同じで、'}],['星',{plain:'「星」にふれている',until:'「星」にふれる',te:'「星」にふれていて、'}]];
 const joined=(first,join,second)=>{const head=join==='で、'?first.te:first.plain+join;return{plain:head+second.plain,until:head+second.until};};
 let renames=0,sources=0;const notRead=[];
 for(const [name,atom]of atoms)for(const join of joins)for(const [first,second]of [[atom,other],[other,atom]])for(const form of forms){
  const source=form(joined(first,join,second));let clean=false;try{clean=A.compileProject(sweepWork(source)).errors.length===0;}catch{}
  if(!clean){notRead.push(source);continue;}sources++;renames+=renameSweep(source,[name,'名前']);
 }
 // (the language does not read 〜かつ「星」にふれるまで and 〜または「星」にふれるまで: these four are not a rename's matter)
 assert.deepEqual(notRead,['かつ','または'].flatMap(join=>['名前が2と同じ'+join+'「星」にふれるまで待つ。','名前が2と同じ'+join+'「星」にふれるまでくり返す。\n  何もしない。']),'every other joined condition reads');assert.equal(sources,92);
 for(const source of ['もし点数が10以上か5以下なら、\n  何もしない。','もし点数が10以上で20以下なら、\n  何もしない。','もし点数が10以上で、20以下なら、\n  何もしない。','もし点数が1か2なら、\n  何もしない。','もし点数が10から20のあいだなら、\n  何もしない。','点数が10以上で20以下になるまで待つ。','もし点数が1と同じかつ名前が2と同じなら、\n  何もしない。','点数が1と同じまたは名前が2と同じになるまで待つ。','もし「星」にふれているかつ点数が1と同じなら、\n  何もしない。']){sources++;renames+=renameSweep(source);}
 return{sources,renames,notRead};
});
check('references/rename-bracketed-name',()=>{
 const added='点数を1ふやす。\nもし点数が3より大きいなら、\n  点数を言う。\n名前一覧に点数を追加する。\n答えを点数に入れる。',source=added,written=[];
 for(const name of ['あの数','10点','ねこが','a+b','１ばん','あ。'])for(const source of [added,added.replace('追加する','足す')]){
  const p=sweepWork(source),next=A.prepareResourceRename(p,'data:sweep-score',name);assert.equal(next.scripts[0].source,source.replaceAll('点数','【'+name+'】'),name);assert.deepEqual(plain(A.compileProject(next).errors),[],name);
  assert.deepEqual(plain(treeWithName(sweepTree(next),null,null,true)),plain(treeWithName(sweepTree(p),'点数',name,false)),name+' keeps the meaning');
  const list=A.prepareResourceRename(p,'data:sweep-list',name);assert.equal(list.scripts[0].source,source.replace('名前一覧','【'+name+'】'),name+' for the list');assert.deepEqual(plain(A.compileProject(list).errors),[],name);if(source===added)written.push(name);
 }
 // (a list made larger by a number, 名前一覧に点数を足す, is told by the check of the work before and after the rename: no error, one notice I139)
 for(const name of ['あの数','10点']){const told=p=>{const c=A.compileProject(p);return{errors:plain(c.errors).map(e=>e.code),notes:plain(c.notes).map(n=>n.code)};},stops={errors:[],notes:['I139']};const p=sweepWork('名前一覧に点数を足す。');
  assert.deepEqual(told(p),stops);assert.deepEqual(told(A.prepareResourceRename(p,'data:sweep-score',name)),stops,name);assert.deepEqual(told(A.prepareResourceRename(p,'data:sweep-list',name)),stops,name+' for the list');
  assert.deepEqual(told(sweepWork('名前一覧に点数を追加する。')),{errors:[],notes:[]});}
 // A name written bare stays bare; a name that cannot be written is refused with words about the name.
 assert.equal(A.prepareResourceRename(sweepWork(source),'data:sweep-score','みかん').scripts[0].source,source.replaceAll('点数','みかん'));
 const marks='には 使えない 文字が あります。空白や 「」【】（）［］、※ を けして ください';
 const refused=[];for(const [name,message] of [['あ　い','名前「あ　い」'+marks],['【x】','名前「【x】」'+marks],['a】b','名前「a】b」'+marks],
  ['「か」','名前「「か」」'+marks],['','名前は 1〜32文字で つけます'],['あ'.repeat(33),'名前は 1〜32文字で つけます']]){const p=sweepWork(source),before=JSON.stringify(p);
  assert.throws(()=>A.prepareResourceRename(p,'data:sweep-score',name),refusedWith({name:'AkariError',code:'F503',message}),JSON.stringify(name));refused.push([name,'F503',message]);assert.equal(JSON.stringify(p),before);}
 // (a part's name is refused with the words for a name of a part)
 for(const [name,message] of [['「か」','名前「「か」」には 名前に 使えない 文字（「 」や 行がえ など）が 入って います。その 文字を けして ください'],['','名前は 1〜80文字に して ください'],['あ'.repeat(81),'名前は 1〜80文字に して ください']]){const p=sweepWork(source),before=JSON.stringify(p);
  assert.throws(()=>A.prepareResourceRename(p,'component:sweep-star',name),refusedWith({name:'AkariError',code:'F503',message}),JSON.stringify(name));refused.push([name,'F503',message]);assert.equal(JSON.stringify(p),before);}
 return{written,refused};
});
const report={schema:'akari-resource-references-v1',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:snapshot(currentProductFile()),uxAcceptance:false,results},out=path.resolve(process.argv[2]);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');for(const r of results.filter(r=>r.status==='FAIL'))console.error(r.id+' '+r.error);console.log(`Resource references: ${results.filter(r=>r.status==='PASS').length}/${results.length} PASS`);if(report.status!=='PASS')process.exitCode=1;
