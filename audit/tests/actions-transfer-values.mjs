import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {transferFixtures,fixturePins,verifyValuesReport} from '../lib/actions-transfer-contract.mjs';
const {plan}=transferFixtures(),A=loadApi(fs.readFileSync(currentProductFile(),'utf8'));
import {fixedValues as literal} from '../fixtures/fixed-values.mjs';

assert.deepEqual(literal.map(x=>'Q-'+x[0]),plan.groups.Q.map(x=>x.id),'exact original Q76 ordered set');
function fixture(){
 const p=A.makeDefaultProject(),cat=p.components.find(c=>c.id==='sprite-1');
 Object.assign(cat,{name:'あかり',x:100,y:100,w:100,h:100,direction:90,scalePercent:120});
 cat.costumes=['原本','星','丸'].map((name,i)=>({id:'q-costume-'+i,name,kind:'text',value:'⭐'}));cat.costumeId='q-costume-1';
 const star={...structuredClone(cat),id:'q-star',name:'星',x:200,direction:0,localData:{variables:[],lists:[]},costumes:[{id:'star-costume',name:'原本',kind:'text',value:'⭐'}],costumeId:'star-costume'};
 const input={...structuredClone(cat),id:'q-input',name:'入力欄1',type:'input',x:450,y:300,w:100,h:40,text:'青空',localData:{variables:[],lists:[]},costumes:[],costumeId:''};
 delete input.costumes;delete input.costumeId;
 // W0's UI color-name preset 赤 is #ff3b30, not the distinct CSS red #ff0000.
 const box={...structuredClone(input),id:'q-box',name:'赤四角',type:'box',x:100,y:100,w:100,h:100,bg:'#ff3b30'};
 p.components=[cat,star,input,box];p.stage.backdrops=['空色','夜','森'].map((name,i)=>({id:'q-bg-'+i,name,kind:'color',value:'#ffffff'}));p.stage.backdropId='q-bg-1';
 p.projectData={variables:[{id:'q-score',name:'点数',initialValue:10}],lists:[{id:'q-list',name:'名前一覧',initialValue:['本','ぼうし']}]};
 p.actions=[];p.functions=[{id:'q-double',ownerId:'stage',name:'倍',args:['n'],source:'n×2を答えとして返す。'}];p.scripts=[];
 const runtime=new A.RuntimeModel(p,{}),actor=runtime.actor('sprite-1');actor.scalePercent=120;actor.volume=50;actor.pitch=1;
 runtime.mouseX=300;runtime.mouseY=200;runtime.mouseDown=true;runtime.pressedKeys.add('a');runtime.startTime=0;runtime.now=()=>500;
 const compiled=A.compileProject(p);assert.equal(compiled.errors.length,0,JSON.stringify(compiled.errors));
 return {p,runtime,actor,ctx:{runtime,runtimeId:'sprite-1',compiled,task:{lastAnswer:'はる',callFrames:[],execStack:[]},
  eventContext:{key:'a',message:'出発',oldName:'空色',newName:'夜',oldValue:'前',newValue:'後'}}};
}
function compare(actual,expected,unit){
 if(unit){assert.equal(actual.unit,unit);assert.deepEqual(Object.keys(actual).sort(),['magnitude','unit']);actual=actual.magnitude;}
 if(typeof expected==='number'){assert.equal(typeof actual,'number');assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);}
 else assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected);
}
const results=[];
for(const [key,source,expected,unit]of literal){
 const id='Q-'+key,variants=[];
 try{
  const {p,runtime,actor,ctx}=fixture(),symbols=A.buildSymbols(p);
  if(key==='builtin:CONTAINS'||key==='builtin:INDEX_OF')runtime.projectLists.set('名前一覧',['本','かさ']);
  if(key==='sensor:TOUCHING')runtime.actor('q-star').x=100;
  const ast=A.parseExpression(source,symbols),encoded=A.blockEncode(ast),decoded=A.blockDecode(encoded.tree),formatted=A.formatExpression(decoded),again=A.parseExpression(formatted,symbols);
  assert.equal(A.astEquivalent(ast,decoded),true);assert.equal(A.astEquivalent(ast,again),true);
  const observations=[ast,decoded,again].map((node,i)=>({route:['source','block','regenerated-source'][i],actual:JSON.parse(JSON.stringify(A.evalExpression(node,ctx)))}));
  for(const observation of observations)compare(observation.actual,expected,unit);
  const variant=(text,wanted,change=()=>{})=>{change();const value=A.evalExpression(A.parseExpression(text,symbols),ctx);compare(value,wanted);variants.push({source:text,expected:wanted,actual:value});};
  if(key==='expression:BooleanLiteral')variant('条件の答え（あてはまらない）',false);
  if(key==='builtin:四捨五入')variant('四捨五入（－1.5）',-2);
  if(key==='builtin:乱数'){const value=A.evalExpression(A.parseExpression('乱数（1、10）',symbols),ctx);assert.ok(Number.isInteger(value)&&value>=1&&value<=10);variants.push({source:'乱数（1、10）',actual:value,expected:'integer within inclusive 1..10; endpoint coverage not claimed'});}
  if(key==='builtin:CONTAINS')variant('名前一覧に「帽子」が含まれている',false);
  if(key==='builtin:INDEX_OF')variant('名前一覧で「帽子」が最初にある番号',0);
  if(key==='state:マウスが押されている')for(const value of [false,true,false])variant(source,value,()=>{runtime.mouseDown=value;});
  if(key==='sensor:KEY_DOWN')for(const value of [false,true,false])variant(source,value,()=>{value?runtime.pressedKeys.add('a'):runtime.pressedKeys.delete('a');});
  if(key==='state:クローンである')variant(source,true,()=>{actor.isClone=true;});
  if(key==='sensor:TOUCHING')variant(source,false,()=>{runtime.actor('q-star').x=300;});
  if(key==='sensor:TOUCHING_COLOR')variant(source,false,()=>{runtime.actor('q-box').x=400;});
  results.push({id,status:'PASS',source,expected,unit:unit||null,formatted,variants,observations,blockAstEquivalent:true});
 }catch(error){results.push({id,status:'FAIL',source,expected,unit:unit||null,variants,error:error.stack});}
}
const output=path.resolve(process.argv[2]),report={schema:'akari-fixed-values-v1',status:results.every(x=>x.status==='PASS')?'PASS':'FAIL',
 snapshot:snapshot(currentProductFile()),fixturePins,environment:'node / actual product evalExpression and RuntimeModel',
 nativeInputClaim:false,uxAcceptance:false,scope:'Q76 fixed values and semantic block/source roundtrip; pointer/key/focus browser obligations remain in the existing full browser gates',results};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
if(report.status==='PASS')verifyValuesReport(report);
for(const result of results)if(result.status!=='PASS')console.error(result.id+': '+result.error.split('\n').slice(0,2).join(' '));
console.log(`Fixed Q76 values: ${results.filter(x=>x.status==='PASS').length}/76 PASS`);if(report.status!=='PASS')process.exitCode=1;
