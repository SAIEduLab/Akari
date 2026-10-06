// C74's non-audio rows: independent outcomes, actual scheduler, source and Block.
// Audio's eight rows retain their existing mandatory browser PCM-output gate.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
import {transferFixtures} from '../lib/actions-transfer-contract.mjs';
import {verifyCommandMeaning} from '../lib/command-meaning-contract.mjs';
const A=loadApi(fs.readFileSync(currentProductFile(),'utf8')),plain=v=>JSON.parse(JSON.stringify(v));
const catalog=JSON.parse(fs.readFileSync('audit/manifests/features.json')).COMMAND_CATALOG;
const ids=transferFixtures().plan.groups.C.map(r=>r.id).filter(id=>!id.startsWith('C-SoundCommand:'));
const cases=new Map(),eq=(a,b)=>assert.deepEqual(plain(a),plain(b));
const add=(id,source,configure,exercise)=>cases.set('C-'+id,{source,configure,exercise});
function fixture(source){
 const p=A.makeEmptyProject(),a=p.components[0];a.name='あかり';
 Object.assign(a,{x:100,y:100,w:100,h:100,direction:0,scalePercent:100,visible:true});
 a.costumes=['原本','星','丸'].map((name,i)=>({id:'command-costume-'+i,name,kind:'text',value:name}));a.costumeId=a.costumes[0].id;
 a.localData={variables:[{id:'own-score',name:'個体点数',initialValue:10}],lists:[]};
 const star=structuredClone(a);Object.assign(star,{id:'command-star',name:'マスコット',x:300,localData:{variables:[{id:'star-score',name:'個体点数',initialValue:20}],lists:[]}});star.costumes=[{id:'star-costume',name:'原本',kind:'text',value:'*'}];star.costumeId='star-costume';
 const controls=['button','input','label'].map((type,i)=>{const c={...structuredClone(a),id:'command-'+type,name:{button:'ボタン1',input:'入力欄1',label:'文字1'}[type],type,text:type==='input'?'前':'前の文字',x:400,y:100+i*60,w:100,h:40,localData:{variables:[],lists:[]}};delete c.costumes;delete c.costumeId;return c;});
 p.components=[a,star,...controls];p.stage.width=640;p.stage.height=480;p.stage.backdrops=['空色','夜','森'].map((name,i)=>({id:'command-bg-'+i,name,kind:'color',value:'#ffffff'}));p.stage.backdropId='command-bg-0';
 p.projectData={variables:[{id:'score',name:'点数',initialValue:10},{id:'sum',name:'合計',initialValue:99},{id:'born',name:'分身開始数',initialValue:0}],lists:[{id:'names',name:'名前一覧',initialValue:['本','ぼうし']},{id:'result',name:'結果',initialValue:['元']},{id:'received',name:'受取',initialValue:[]}]};
 p.scripts=[{id:'command-main',targetId:'sprite-1',event:'start',source}];p.actions=[];p.functions=[];return p;
}
function harness(p,mode){
 const original=JSON.stringify(p);let rounds=0;
 if(mode==='blocks')for(const owner of [...p.scripts,...p.actions,...p.functions]){
  const type=p.functions.includes(owner)?'function':p.actions.includes(owner)?'action':'script';
  for(let i=0;i<3;i++){const parsed=A.parseSyntax(owner.source,A.buildSymbols(p),{targetId:owner.targetId||owner.ownerId,context:type,callable:owner});assert.ok(parsed.ast,JSON.stringify(parsed.syntaxDiagnostics));const decoded=A.blockDecode(A.blockEncode(parsed.ast).tree);assert.ok(A.astEquivalent(parsed.ast,decoded));owner.source=A.formatScript(decoded);rounds++;}
 }
 const compiled=A.compileProject(p);eq(compiled.errors,[]);const runtime=new A.RuntimeModel(p,{});let time=0,reply=null;
 runtime.now=()=>time;const trace=[],ink=[],states=[];let scheduler;
 const capture=()=>plain({time,actors:[...runtime.actors.values()].map(a=>({...a,vars:Object.fromEntries(a.vars),lists:Object.fromEntries(a.lists)})),variables:Object.fromEntries(runtime.projectVars),lists:Object.fromEntries(runtime.projectLists),backdrop:runtime.stage.backdropId,trace,ink});
 scheduler=new A.EventScheduler(p,compiled,runtime,{say:(id,text)=>trace.push({kind:'say',id,text,time}),ask:(text,callback)=>{trace.push({kind:'ask',text,time});reply=callback;},runtimeError:(task,e)=>{throw e;},penLine:(...line)=>ink.push({kind:'line',line}),penClear:()=>ink.splice(0),stamp:id=>ink.push({kind:'stamp',actor:plain(runtime.actor(id))})});
 scheduler.schedule=()=>{};const saved=JSON.stringify(p),pump=(limit=1000,allowReady=false)=>{let n=0;while(scheduler.ready.length&&n++<limit)scheduler.runTurn(true);if(!allowReady)assert.ok(n<limit,'finite execution did not settle');assert.equal(JSON.stringify(p),saved,'runtime changed design');states.push(capture());};
 const h={p,runtime,scheduler,trace,ink,states,actor:(id='sprite-1')=>runtime.actor(id),score:()=>runtime.projectVars.get('点数'),say:()=>trace.filter(t=>t.kind==='say').map(t=>t.text),pump,at(t){time=t;scheduler.advanceContinuous(t);scheduler.recheckBlocked(true);pump();},answer(value){assert.ok(reply);reply(value);pump();},start(limit=1000,allowReady=false){scheduler.start();pump(limit,allowReady);},capture,stop(){scheduler.stop();},rounds,original};return h;
}
const score=(p,n)=>p.projectData.variables[0].initialValue=n;
const source=id=>catalog.find(c=>c.id===id).source;
for(const[id,wanted]of [['Assignment',0],['NumericUpdate:ADD',11],['NumericUpdate:SUB',9]])add(id,source(id),()=>{},h=>{h.start();eq(h.score(),wanted);eq(h.runtime.projectVars.get('合計'),99);});
for(const[id,wanted]of [['ListAppend',['本','ぼうし','あかり']],['ListReplace',['ひかり','ぼうし']],['ListInsert',['ほたる','本','ぼうし']],['ListDelete',['ぼうし']],['ListClear',[]]])add(id,source(id),()=>{},h=>{h.start();eq(h.runtime.projectLists.get('名前一覧'),wanted);eq(h.runtime.projectLists.get('結果'),['元']);});
add('IfStatement','もし点数が10以上なら、\n  「一致」と言う。\nそうでなければ、\n  「不一致」と言う。',(p,v)=>score(p,v?9:10),(h,v)=>{h.start();eq(h.say(),[v?'不一致':'一致']);});
add('Say',source('Say'),()=>{},h=>{h.start();eq(h.trace,[{kind:'say',id:'sprite-1',text:'10点以上です',time:0}]);});
add('RepeatCount','3回くり返す。\n  点数に1を足す。',(p,v)=>{score(p,0);if(v)p.scripts[0].source=p.scripts[0].source.replace('3回','0回');},(h,v)=>{h.start();eq(h.score(),v?0:3);});
add('RepeatWhile','点数が100より小さいあいだ、くり返す。\n  点数に1を足す。',(p,v)=>score(p,v?100:0),h=>{h.start();eq(h.score(),100);});
add('RepeatUntil','「空白」キーが押されるまで、くり返す。\n  点数に1を足す。\n  0.1秒待つ。',p=>score(p,0),(h,v)=>{if(v)h.runtime.pressedKeys.add('空白');h.start();if(v){eq(h.score(),0);return;}eq(h.score(),1);h.at(100);eq(h.score(),2);h.scheduler.setKeyState('空白',true);h.at(200);const n=h.score();h.at(1000);eq(h.score(),n);eq(n,2);});
add('WaitTime','0.1秒待つ。\n「完了」と言う。',()=>{},h=>{h.start();eq(h.say(),[]);h.at(99);eq(h.say(),[]);h.at(100);eq(h.say(),['完了']);});
add('WaitUntil','点数が100以上になるまで待つ。\n「完了」と言う。',p=>p.scripts.push({id:'command-click',targetId:'command-button',event:'click',source:'点数を100にする。'}),h=>{h.start();eq(h.say(),[]);h.at(50);eq(h.say(),[]);h.scheduler.spawnForRuntime('command-button','click');h.pump();h.at(51);eq(h.say(),['完了']);eq(h.score(),100);});
add('ForEach','名前一覧の各要素を項目として、次のことをくり返す。\n  項目の値を言う。\n  0.5秒待つ。',()=>{},h=>{h.start();eq(h.say(),['本']);h.runtime.projectLists.get('名前一覧').push('追加');h.at(499);eq(h.say(),['本']);h.at(500);eq(h.say(),['本','ぼうし']);h.at(1000);eq(h.say(),['本','ぼうし']);});
const motion=[['MOVE',{},[110,100,0]],['GOTO',{x:25,y:75},[100,50,0]],['TURN_RIGHT',{},[100,100,15]],['TURN_LEFT',{},[100,100,-15]],['SET_DIRECTION',{direction:15},[100,100,90]],['SET_X',{x:25},[100,100,0]],['SET_Y',{},[100,50,0]],['POINT_TO',{},[100,100,90]],['BOUNCE',{x:540},[540,100,180]]];
for(const[op,initial,wanted]of motion)add('MotionCommand:'+op,source('MotionCommand:'+op),(p,v)=>Object.assign(p.components[0],op==='BOUNCE'&&v?{x:100}:initial),(h,v)=>{h.runtime.mouseX=150;h.runtime.mouseY=250;h.start();const a=h.actor();eq([a.x,a.y,a.direction],op==='BOUNCE'&&v?[100,100,0]:wanted);eq(h.actor('command-star').x,300);});
add('MotionCommand:GLIDE',source('MotionCommand:GLIDE')+'\n「完了」と言う。',p=>Object.assign(p.components[0],{x:50,y:50}),h=>{h.start();eq(h.say(),[]);h.at(500);eq([h.actor().x,h.actor().y],[125,75]);eq(h.say(),[]);h.at(1000);eq([h.actor().x,h.actor().y],[200,100]);eq(h.say(),['完了']);});
for(const[op,key,initial,wanted]of [['SET_SCALE','scalePercent',100,120],['SET_COLOR','color',null,'#ff3b30'],['HIDE','visible',true,false],['SHOW','visible',false,true]])add('LooksCommand:'+op,source('LooksCommand:'+op),p=>{if(key==='visible')p.components[0].visible=initial;if(op==='SET_COLOR'){p.components[0].type='box';p.components[0].bg='#147efb';delete p.components[0].costumes;delete p.components[0].costumeId;}},h=>{h.start();eq(h.actor()[key],wanted);});
for(const[op,before,after]of [['FRONT',['sprite-1','command-star','command-button'],['command-star','command-button','sprite-1']],['BACK',['command-star','command-button','sprite-1'],['sprite-1','command-star','command-button']],['FORWARD_LAYERS',['sprite-1','command-star','command-button'],['command-star','sprite-1','command-button']],['BACKWARD_LAYERS',['command-star','command-button','sprite-1'],['command-star','sprite-1','command-button']]])add('LooksCommand:'+op,source('LooksCommand:'+op),p=>{p.components=before.map(id=>p.components.find(c=>c.id===id));},h=>{h.start();eq([...h.runtime.actors.values()].sort((a,b)=>a.z-b.z).map(a=>a.runtimeId),after);});
for(const op of ['SET_BACKDROP','NEXT_BACKDROP','PREV_BACKDROP'])add('LooksCommand:'+op,source('LooksCommand:'+op),(p,v)=>{p.stage.backdropId='command-bg-'+(op==='SET_BACKDROP'?1:op==='NEXT_BACKDROP'?(v?2:0):(v?0:1));p.scripts.push({id:'backdrop-watch',targetId:'stage',event:'backdropChanged',source:'以前の背景名を言う。新しい背景名を言う。'});},(h,v)=>{h.start();const index=op==='SET_BACKDROP'?0:op==='NEXT_BACKDROP'?(v?0:1):(v?2:0);eq(h.runtime.stage.backdropId,'command-bg-'+index);eq(h.say(),op==='SET_BACKDROP'?['夜','空色']:op==='NEXT_BACKDROP'?(v?['森','空色']:['空色','夜']):(v?['空色','森']:['夜','空色']));});
for(const op of ['SET_COSTUME','NEXT_COSTUME','PREV_COSTUME'])add('LooksCommand:'+op,source('LooksCommand:'+op),(p,v)=>p.components[0].costumeId='command-costume-'+(op==='SET_COSTUME'?0:op==='NEXT_COSTUME'?(v?2:0):(v?0:1)),(h,v)=>{h.start();eq(h.actor().costumeId,'command-costume-'+(op==='SET_COSTUME'?1:op==='NEXT_COSTUME'?(v?0:1):(v?2:0)));eq(h.actor('command-star').costumeId,'star-costume');});
add('LooksCommand:SET_TARGET_TEXT',source('LooksCommand:SET_TARGET_TEXT'),()=>{},h=>{h.start();eq(h.actor('command-button').text,'始める');eq(h.actor('command-label').text,'前の文字');});
add('LooksCommand:SET_SELF_TEXT',source('LooksCommand:SET_SELF_TEXT'),p=>p.scripts[0].targetId='command-label',h=>{h.start();eq(h.actor('command-label').text,'文字');eq(h.actor('command-button').text,'前の文字');});
add('LooksCommand:SET_INPUT',source('LooksCommand:SET_INPUT'),p=>p.scripts.push({id:'input-watch',targetId:'command-input',event:'valueChanged',source:'つなぐ（「前=」、以前の値）を言う。つなぐ（「後=」、新しい値）を言う。'}),h=>{h.start();eq(h.actor('command-input').inputValue,'答え');eq(h.say(),['前=前','後=答え']);});
for(const op of ['DOWN','SET_COLOR','SET_SIZE','UP','STAMP','CLEAR']){
 const pre='ペンの色を「青」にする。ペンの太さを3にする。';
 const body={DOWN:'ペンを下ろす。20歩動く。',SET_COLOR:'ペンを下ろす。20歩動く。ペンの色を「赤」にする。20歩動く。',SET_SIZE:'ペンを下ろす。20歩動く。ペンの太さを6にする。20歩動く。',UP:'ペンを下ろす。20歩動く。ペンを上げる。20歩動く。',STAMP:'今の姿のスタンプを押す。20歩動く。',CLEAR:'ペンを下ろす。20歩動く。今の姿のスタンプを押す。0.1秒待つ。作品の線とスタンプを全部消す。'}[op];
 add('PenCommand:'+op,pre+body,p=>{if(op==='CLEAR')p.scripts.push({id:'other-ink',targetId:'command-star',event:'start',source:'ペンを下ろす。20歩動く。今の姿のスタンプを押す。'});},h=>{h.start();if(op==='CLEAR'){eq(h.ink.length,4);h.at(100);eq(h.ink,[]);eq(h.runtime.actors.size,5);return;}if(op==='STAMP'){eq(h.ink.length,1);eq(h.ink[0].kind,'stamp');eq(h.ink[0].actor.x,100);eq(h.actor().x,120);return;}eq(h.ink[0],{kind:'line',line:[150,150,170,150,'#147efb',3]});if(op==='SET_COLOR'||op==='SET_SIZE')eq(h.ink[1],{kind:'line',line:[170,150,190,150,op==='SET_COLOR'?'#ff3b30':'#147efb',op==='SET_SIZE'?6:3]});else eq(h.ink.length,1);});
}
for(const op of ['Broadcast','BroadcastAndWait'])add(op,source(op)+'\n「送信後」と言う。',p=>{for(const[id,delay]of [['sprite-1',.3],['command-star',.6]])p.scripts.push({id:'receiver-'+id,targetId:id,event:'message',filter:{message:'開始'},source:delay+'秒待つ。\n「'+delay+'」と言う。'});},h=>{h.start();eq(h.say(),op==='Broadcast'?['送信後']:[]);h.at(300);eq(h.say(),op==='Broadcast'?['送信後','0.3']:['0.3']);h.at(599);h.at(600);eq(h.say(),op==='Broadcast'?['送信後','0.3','0.6']:['0.3','0.6','送信後']);});
add('Ask',source('Ask')+'\n答えの値を言う。',()=>{},h=>{h.start();eq(h.say(),[]);eq(h.trace[0],{kind:'ask',text:'名前は？',time:0});h.at(100);eq(h.say(),[]);h.answer('はる');eq(h.say(),['はる']);});
for(const id of ['LocalVariableDeclaration','ReturnStatement','LocalListDeclaration'])add(id,'【計算結果】で求めた答えを言う。',p=>{if(id==='LocalListDeclaration')p.scripts[0].source='受取を【計算結果】で求めた答えにする。';p.functions=[{id:'command-function',ownerId:'stage',name:'計算結果',args:[],source:{LocalVariableDeclaration:'この中だけで使う変数【合計】を作り、最初は0にする。合計に1を足す。合計を答えとして返す。',ReturnStatement:'この中だけで使う変数【合計】を作り、最初は5にする。合計を答えとして返す。',LocalListDeclaration:'この中だけで使うリスト【結果】を空で作る。結果の最後に「あかり」を入れる。結果を答えとして返す。'}[id]}];},h=>{h.start();if(id==='LocalListDeclaration'){eq(h.runtime.projectLists.get('受取'),['あかり']);eq(h.runtime.projectLists.get('結果'),['元']);}else{eq(h.say(),[id==='LocalVariableDeclaration'?'1':'5']);eq(h.runtime.projectLists.get('結果'),['元']);}eq(h.runtime.projectVars.get('合計'),99);if(id==='ReturnStatement'){const bad=structuredClone(h.p);bad.functions[0].source+='合計を99にする。';const before=JSON.stringify(bad),errors=A.compileProject(bad).errors;assert.ok(errors.some(e=>e.code==='S306'));assert.equal(JSON.stringify(bad),before);h.trace.push({kind:'unreachable-tail-refusal',codes:[...new Set(errors.map(e=>e.code))],unchanged:true});}});
for(const op of ['CREATE_SELF','CREATE_TARGET','DELETE_SELF'])add('CloneCommand:'+op,op==='DELETE_SELF'?'「マスコット」の分身を作る。自分の分身を作る。':source('CloneCommand:'+op),p=>{p.scripts.push({id:'born-self',targetId:'sprite-1',event:'cloneStart',source:'分身開始数に1を足す。'+(op==='DELETE_SELF'?'この分身だけを消す。':'')},{id:'born-star',targetId:'command-star',event:'cloneStart',source:'分身開始数に1を足す。'});},h=>{h.start();const clones=[...h.runtime.actors.values()].filter(a=>a.isClone);eq(clones.length,1);eq(clones[0].baseId,op==='CREATE_SELF'?'sprite-1':'command-star');eq(h.runtime.projectVars.get('分身開始数'),op==='DELETE_SELF'?2:1);eq(clones[0].vars.get('個体点数'),op==='CREATE_SELF'?10:20);eq(h.actor().isClone,false);});
for(const op of ['THIS','OTHERS','ALL'])add('StopCommand:'+op,'0.1秒待つ。'+source('StopCommand:'+op)+'「現在」と言う。',p=>p.scripts.push({id:'other-task',targetId:'command-star',event:'start',source:'0.2秒待つ。「他」と言う。'}),h=>{h.start();h.at(100);h.at(200);h.at(5000);eq(h.say(),op==='THIS'?['他']:op==='OTHERS'?['現在']:[]);});
for(const id of ['Break','Continue'])add(id,'3回くり返す。\n  点数に1を足す。\n  '+source(id)+'\n  点数に100を足す。',p=>score(p,0),h=>{h.start();eq(h.score(),id==='Break'?1:3);});
add('Forever','ずっとくり返す。\n  右に15度回る。',()=>{},h=>{h.start(6,true);assert.ok(h.actor().direction>=30);h.scheduler.pause();const direction=h.actor().direction;assert.equal(h.scheduler.paused,true);h.scheduler.stop();eq(h.actor().direction,direction);eq(h.scheduler.running,false);eq(h.scheduler.ready,[]);});
add('UserActionCall','（3）を渡して、【増やす】という手順を行う。',(p,v)=>{p.actions=[{id:'command-action',ownerId:'stage',name:'増やす',args:['量'],source:'自分の個体点数に量を足す。'}];if(v)p.scripts[0].source='量を3として、【増やす】という手順を行う。';},h=>{h.start();eq(h.actor().vars.get('個体点数'),13);eq(h.actor('command-star').vars.get('個体点数'),20);eq(h.score(),10);});
add('NoOperation','何もしない。\n「終わり」と言う。',()=>{},h=>{const before=h.capture();h.start();const after=h.capture();eq(after.actors,before.actors);eq(after.variables,before.variables);eq(after.lists,before.lists);eq(h.say(),['終わり']);});
eq([...cases.keys()].sort(),[...ids].sort());const variants=new Set(['IfStatement','RepeatCount','RepeatWhile','RepeatUntil','MotionCommand:BOUNCE','LooksCommand:NEXT_BACKDROP','LooksCommand:PREV_BACKDROP','LooksCommand:NEXT_COSTUME','LooksCommand:PREV_COSTUME','UserActionCall']);
const results=[];
for(const id of ids){const c=cases.get(id),observed=[];try{
 for(let variant=0;variant<(variants.has(id.slice(2))?2:1);variant++){
  const routes=[];for(const mode of ['source','blocks']){const p=fixture(c.source);c.configure(p,variant);const input=plain(p),h=harness(p,mode);try{c.exercise(h,variant);routes.push({mode,input,roundtrips:mode==='blocks'?3:0,states:h.states,final:h.capture()});}finally{h.stop();}}
  eq(routes[0].final,routes[1].final);eq(routes[0].states,routes[1].states);observed.push({variant,routes});
 }
 results.push({id,status:'PASS',observed});
}catch(error){results.push({id,status:'FAIL',observed,error:error.stack});console.error(id+': '+error.message);}}
const report={schema:'akari-command-meaning-v1',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:snapshot(currentProductFile()),uxAcceptance:false,environment:'node / actual RuntimeModel and EventScheduler / logical clock',scope:'66 non-audio C rows; eight audio rows use mandatory PCM browser report; native UI and rendered media remain full-browser obligations',results};
if(report.status==='PASS')verifyCommandMeaning(report);
const output=path.resolve(process.argv[2]||'audit-evidence/command-meaning.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log('Command meaning: '+results.filter(r=>r.status==='PASS').length+'/'+ids.length);if(report.status!=='PASS')process.exitCode=1;
