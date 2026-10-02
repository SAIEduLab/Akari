import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {withBrowser,snapshot} from '../lib/product-test-host.mjs';

const [browserPath,product,output]=process.argv.slice(2);
if(!browserPath||!product||!output)throw Error('Usage: review-language.mjs BROWSER PRODUCT OUTPUT');
if(fs.existsSync(output))throw Error('Evidence already exists');
const before=snapshot(product),pageErrors=[],networkRequests=[];
const report=await withBrowser(browserPath,async browser=>{
  const context=await browser.newContext({offline:true});
  await context.route(/^https?:/,route=>{networkRequests.push(route.request().url());return route.abort();});
  const page=await context.newPage();page.on('pageerror',error=>pageErrors.push(error.message));
  try{
    await page.goto(pathToFileURL(path.resolve(product)).href);
    await page.waitForFunction(()=>!!globalThis.Akari?.app);
    const results=await page.evaluate(async()=>{
      const A=Akari,results=[];
      const equal=(actual,expected)=>{if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error(JSON.stringify({actual,expected}));};
      const check=(value,message)=>{if(!value)throw Error(message);};
      const test=async(id,fn)=>{try{results.push({id,pass:true,evidence:await fn()});}catch(error){results.push({id,pass:false,evidence:{error:error.message}});}};
      // Values are independent literal expectations, never inferred from formatter output.
      const variants=[
        {name:'closing-quote',encoded:String.raw`合\」図`,value:'合」図'},
        {name:'opening-quote',encoded:String.raw`合\「図`,value:'合「図'},
        {name:'backslash',encoded:String.raw`合\\図`,value:'合\\図'},
      ];
      function project(){const p=A.makeDefaultProject();p.components[0].name='いぬ';p.projectData.variables=[{id:'received',name:'受信数',initialValue:0}];p.scripts=[];p.actions=[];p.functions=[];return p;}
      function run(p,packed=false){
        let api=A,c=A.compileProject(p);equal(c.errors,[]);
        if(packed){api=A.createAkariRuntime();const restored=api.restoreExecutable(A.packExecutable(p));p=restored.project;c=restored.compiled;}
        const say=[],runtime=new api.RuntimeModel(p,{}),scheduler=new api.EventScheduler(p,c,runtime,{say:(id,text)=>say.push({id,text})});
        scheduler.schedule=()=>{};
        try{scheduler.start();for(let i=0;i<100&&scheduler.ready.length;i++)scheduler.runTurn();equal(scheduler.errorRecords,[]);check(scheduler.ready.length===0,'script did not finish');return{runtime,say};}
        finally{scheduler.stop();}
      }
      await test('REVIEW-ESCAPED-TEXT-ROUNDTRIP',async()=>{
        const evidence=[];
        for(const v of variants){
          const source=`「${v.encoded}」と言う。`,ast=A.parseSyntax(source).ast;
          check(ast,'escaped text did not parse');equal(ast.body[0].value.value,v.value);
          const decoded=A.blockDecode(A.blockEncode(ast).tree),formatted=A.formatScript(decoded);
          equal(decoded.body[0].value.value,v.value);equal(formatted,source);equal(A.parseSyntax(formatted).ast.body[0].value.value,v.value);
          const literal=A.createBlock('StringLiteral');literal.fields.value=v.value;
          equal(A.parseExpression(A.formatExpression(A.blockDecode(literal))).value,v.value);
          const p=project();p.scripts=[{id:'say',targetId:'stage',event:'start',source}];
          for(const packed of[false,true])equal(run(p,packed).say,[{id:'stage',text:v.value}]);
          const loaded=await A.parseProjectFile(A.serializeProject(p));
          equal(loaded.project.scripts[0].source,source);equal(run(loaded.project).say,[{id:'stage',text:v.value}]);
          evidence.push({variant:v.name,value:v.value,source,formatted,blockRoundtrip:true,reverseRoundtrip:true,runtime:true,executableRestore:true,saveReload:true});
        }
        equal(A.parseSyntax(String.raw`「合\q図」と言う。`).ast,null);
        return {variants:evidence,unknownEscapeRejected:true};
      });
      await test('REVIEW-ESCAPED-MESSAGE-FILTER',async()=>{
        const evidence=[];
        for(const v of variants){
          const source=`「${v.encoded}」という知らせを受け取ったとき、いぬは、\n  受信数を1増やす。`,ast=A.parseSyntax(source).ast;
          check(ast,'message heading did not parse');equal(ast.heading.filter.message,v.value);
          const decoded=A.blockDecode(A.blockEncode(ast).tree),formatted=A.formatScript(decoded);
          equal(A.parseSyntax(formatted).ast.heading.filter.message,v.value);check(formatted.startsWith(`「${v.encoded}」という知らせ`),'filter was not re-escaped');
          decoded.heading.filter.message=v.value;equal(A.parseSyntax(A.formatScript(decoded)).ast.heading.filter.message,v.value);
          const keySource=`「${v.encoded}」キーを押すたびに、いぬは、\n  何もしない。`,keyAst=A.parseSyntax(keySource).ast;
          equal(keyAst.heading.filter.key,v.value);equal(A.parseSyntax(A.formatScript(A.blockDecode(A.blockEncode(keyAst).tree))).ast.heading.filter.key,v.value);
          const p=project();p.scripts=[{id:'send',targetId:'stage',event:'start',source:`みんなに「${v.encoded}」と知らせる。`},{id:'receive',targetId:'sprite-1',event:'message',filter:{message:v.value},source}];
          for(const packed of[false,true])equal(run(p,packed).runtime.projectVars.get('受信数'),1);
          const loaded=await A.parseProjectFile(A.serializeProject(p));equal(loaded.project.scripts[1].filter.message,v.value);equal(run(loaded.project).runtime.projectVars.get('受信数'),1);
          evidence.push({variant:v.name,value:v.value,filter:decoded.heading.filter,formatted,receivedCount:1,keyRoundtrip:true,executableRestore:true,saveReload:true});
        }
        equal(A.parseSyntax('「合」＋「図」という知らせを受け取ったとき、いぬは、\n  何もしない。').ast,null);
        return {variants:evidence,nonLiteralFilterRejected:true};
      });
      await test('REVIEW-KANA-SHOW',async()=>{
        const evidence=[];
        for(const source of ['いぬは姿をみせる。','いぬは姿をみせて、10歩進む。','いぬは姿を見せる。']){
          const ast=A.parseSyntax(source).ast;check(ast,'show statement did not parse');equal(ast.body[0].kind,'LooksCommand');equal(ast.body[0].op,'SHOW');
          const formatted=A.formatScript(A.blockDecode(A.blockEncode(ast).tree));equal(A.parseSyntax(formatted).ast.body[0].op,'SHOW');
          const p=project();p.components[0].visible=false;p.scripts=[{id:'show',targetId:'sprite-1',event:'start',source}];
          for(const packed of[false,true])equal(run(p,packed).runtime.actor('sprite-1').visible,true);
          const loaded=await A.parseProjectFile(A.serializeProject(p));equal(run(loaded.project).runtime.actor('sprite-1').visible,true);
          evidence.push({source,formatted,visibleBefore:false,visibleAfter:true,executableRestore:true,saveReload:true});
        }
        return {variants:evidence};
      });
      await test('REVIEW-NATURAL-CONDITION-COMMA',async()=>{
        const evidence=[];
        for(const [prefix,unit,ending,left,right] of [
          ['もし、','歩','大きいなら',10,5],
          ['もし','歩','大きいなら',10,5],
          ['もし、','','大きいなら',10,5],
          ['もし、','歩','大きければ',10,5],
          ['もし、','歩','大きいなら',5,10],
        ]){
          const source=`${prefix}${left}${unit}が${right}${unit}より${ending}、\n  あかりは右へ20歩動く。`,
            ast=A.parseSyntax(source).ast;
          check(ast,'natural condition did not parse');
          equal(ast.body[0].condition.op,'GT');
          const condition=ast.body[0].condition;
          equal(unit?condition.left.unit:null,unit||null);
          equal(unit?condition.left.value.value:condition.left.value,left);
          equal(unit?condition.right.value.value:condition.right.value,right);
          equal(condition.sourceSpan.startColumn,prefix.length+1);
          equal(ast.body[0].thenBody[0].direction,'right');
          const formatted=A.formatScript(A.blockDecode(A.blockEncode(ast).tree)),again=A.parseSyntax(formatted).ast;
          check(again,'formatted condition did not parse');equal(again.body[0].condition.op,'GT');equal(again.body[0].thenBody[0].direction,'right');
          const p=project();p.components[0].name='あかり';p.scripts=[{id:'condition',targetId:'stage',event:'start',source}];
          const expectedX=p.components[0].x+(left>right?20:0),expectedY=p.components[0].y;
          for(const packed of[false,true]){const actor=run(p,packed).runtime.actor('sprite-1');equal(actor.x,expectedX);equal(actor.y,expectedY);}
          const loaded=await A.parseProjectFile(A.serializeProject(p));equal(loaded.project.scripts[0].source,source);equal(run(loaded.project).runtime.actor('sprite-1').x,expectedX);
          const session=A.createEditorSession('script:condition',source,{targetId:'stage',event:'start'},p,0),
            literal=[...A.diagnostics.buildBlockIndex(session.blockView).values()].find(({node})=>node.schemaId==='NumberLiteral'&&node.fields.value===left).node,
            edited=A.prepareBlockEdit(session,{type:'field',id:literal.id,key:'value',value:left+2});
          equal(edited.sourceText,source.replace(`${prefix}${left}`,`${prefix}${left+2}`));
          evidence.push({source,formatted,expectedX,expectedY,conditionColumn:condition.sourceSpan.startColumn,localEditPreservesComma:true,executableRestore:true,saveReload:true});
        }
        equal(A.parseSyntax('もし、、10歩が5歩より大きいなら、何もしない。').ast,null);
        equal(A.parseSyntax('「もし、」と言う。').ast.body[0].value.value,'もし、');
        return {variants:evidence,repeatedCommaRejected:true,quotedCommaPreserved:true};
      });
      return results;
    });
    return {browser:browser.version(),results};
  }finally{await context.close();}
});
assert.deepEqual(snapshot(product),before);
const status=report.results.every(row=>row.pass)&&pageErrors.length===0&&networkRequests.length===0?'PASS':'FAIL';
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
fs.writeFileSync(output,JSON.stringify({schema:'akari-independent-review-v1',group:'language',status,snapshot:before,...report,pageErrors,networkRequests},null,2)+'\n');
console.log(JSON.stringify({group:'language',status,passed:report.results.filter(r=>r.pass).length,total:report.results.length}));
if(status!=='PASS')process.exitCode=1;
