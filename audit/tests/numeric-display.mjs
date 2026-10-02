import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
const A=loadApi(fs.readFileSync(currentProductFile(),'utf8')),results=[];
const R=A.createAkariRuntime();
const plain=x=>JSON.parse(JSON.stringify(x));
const check=(id,fn)=>{try{results.push({id,status:'PASS',observed:fn()});}catch(e){results.push({id,status:'FAIL',error:e.stack});}};
const p=A.makeDefaultProject(),runtime=new A.RuntimeModel(p,{}),symbols=A.buildSymbols(p),ctx={runtime,runtimeId:'sprite-1',compiled:A.compileProject(p)};
for(const [source,expected]of [['正弦（30）','0.5'],['余弦（60）','0.5'],['正接（45）','1'],['逆正弦（0.5）','30度'],['逆余弦（0.5）','60度']])check('display/trigonometry/'+source,()=>{
 const ast=A.parseExpression(source,symbols),value=A.evalExpression(ast,ctx),before=JSON.stringify(value),view=plain(R.displayValue(value));
 assert.equal(view.text,expected);assert.equal(view.rawText,R.valueText(value));assert.equal(JSON.stringify(value),before);
 const converted=A.evalExpression(A.parseExpression('文字（'+source+'）',symbols),ctx);assert.equal(converted,view.rawText);assert.equal(R.displayValue(converted).text,view.rawText);
 const concatenated=A.evalExpression(A.parseExpression('つなぐ（「実値：」、'+source+'）',symbols),ctx);assert.equal(concatenated,'実値：'+view.rawText);
 const encoded=A.blockDecode(A.blockEncode(ast).tree);assert.equal(A.astEquivalent(ast,encoded),true);assert.deepEqual(plain(A.evalExpression(encoded,ctx)),plain(value));
 return{source,...view,textConversion:converted,concat:concatenated,valueUnchanged:true};
});
const boundaries=[['zero',0,'0'],['negative-zero',-0,'0'],['safe-max',Number.MAX_SAFE_INTEGER,'9007199254740991'],['safe-min',Number.MIN_SAFE_INTEGER,'-9007199254740991'],
 ['near-zero',1.234567890123456e-20,'1.23456789012e-20'],['negative-near-zero',-1.234567890123456e-20,'-1.23456789012e-20'],
 ['tiny',Number.MIN_VALUE,'5e-324'],['large',1.234567890123456e200,'1.23456789012e+200'],['maximum',Number.MAX_VALUE,'1.79769313486e+308'],
 ['lower-round',1.2345678901244,'1.23456789012'],['upper-round',1.2345678901256,'1.23456789013'],['carry',9.999999999999,'10'],['unit',{magnitude:0.30000000000000004,unit:'歩'},'0.3歩'],['string','0.30000000000000004','0.30000000000000004']];
for(const[id,value,expected]of boundaries)check('display/boundary/'+id,()=>{const before=JSON.stringify(value),actual=plain(R.displayValue(value));assert.equal(actual.text,expected);assert.equal(JSON.stringify(value),before);assert.equal(actual.rounded,actual.rawText!==expected);return{actual,valueUnchanged:true};});
check('display/finite-rejection',()=>{for(const v of [Infinity,-Infinity,NaN])assert.throws(()=>R.displayValue(v),e=>e.code==='R403');assert.throws(()=>R.displayValue({magnitude:Infinity,unit:'秒'}),e=>e.code==='R411');return{rejected:4};});
check('display/literal-file-and-runtime-unchanged',()=>{
 const source='0.12345678901234566を言う。',project=A.makeDefaultProject();project.scripts=[{id:'display-raw',targetId:'sprite-1',event:'start',source}];project.projectData.variables=[{id:'display-number',name:'実値',initialValue:0.12345678901234566}];
 const syntax=A.parseSyntax(source,{targetId:'sprite-1',event:'start',symbols:A.buildSymbols(project)});assert.ok(syntax.ast);assert.ok(A.formatScript(syntax.ast).includes('0.12345678901234566'));
 const file=A.serializeProject(project,A.makeDefaultAssetStore());assert.ok(file.includes('0.12345678901234566'));
 let speechValue;const compiled=A.compileProject(project),model=new A.RuntimeModel(project,{}),speech=[],scheduler=new A.EventScheduler(project,compiled,model,{prepareSpeech:value=>{speechValue=value;},say:(...args)=>{assert.equal(args.length,2,'existing speech notification keeps its two-argument contract');speech.push({text:args[1],value:speechValue});},runtimeError:(_,e)=>{throw e;}});scheduler.schedule=()=>{};model.now=()=>0;
 try{scheduler.start();let n=0;while(scheduler.ready.length&&n++<50)scheduler.runTurn(true);assert.ok(n<50);}finally{scheduler.stop();}
 assert.deepEqual(plain(speech),[{text:'0.12345678901234566',value:0.12345678901234566}]);assert.equal(model.projectVars.get('実値'),0.12345678901234566);return{source,fileExact:true,speech:plain(speech),valueUnchanged:true};
});
const report={schema:'akari-numeric-display-v1',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:snapshot(currentProductFile()),uxAcceptance:false,results},out=path.resolve(process.argv[2]);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');for(const r of results.filter(r=>r.status==='FAIL'))console.error(r.id+' '+r.error);console.log(`Numeric display: ${results.filter(r=>r.status==='PASS').length}/${results.length} PASS`);if(report.status!=='PASS')process.exitCode=1;
