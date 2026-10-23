import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {answerProductConfirms} from '../lib/product-dialogs.cjs';
import {reveal} from '../lib/ux-normal-ui.mjs';
import {chooseView} from '../browser/cases/view-toggle.cjs';

const require=createRequire(import.meta.url),[chrome,out]=process.argv.slice(2),product=currentProductFile();
const output=path.resolve(out||'audit-evidence/child-diagnostics.json'),dir=output+'.artifacts';
fs.mkdirSync(dir,{recursive:true});
const report={schema:'akari-child-diagnostics-v1',status:'RUNNING',snapshot:snapshot(product),
  environment:{platform:process.platform,browser:null,playwright:require('playwright/package.json').version},
  results:[],pageErrors:[],networkRequests:[],limits:{perCaseMs:8000,hostMs:240000},
  limitsOfEvidence:'Reading support and native disclosure reachability; no measured child comprehension or IME claim.'};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const state=p=>p.evaluate(()=>({project:JSON.stringify(Akari.app.project),source:Akari.app.editorState.main.sourceText,
  history:Akari.app.editorState.history,redo:Akari.app.editorState.redo}));
const cases=[
  ['double-negative','もし条件（1が2と同じではないではない）が成り立つなら、\n  「おはよう」と言う。',
    'もし条件（（1が2と同じではない）ではない）が成り立つなら、\n  「おはよう」と言う。','P201','「ではない」が 2つ つづいています。前の ほうを（ ）で かこんでください','「条件（…）が成り立たない」で 書きます'],
  ['parentheses','（1＋2］を言う。','（1＋2）を言う。','P207','かっこの 開く しるしと とじる しるしが 合っているか たしかめてください','開く しるしと とじる しるしを そろえます'],
  ['closing','「こんにちはと言う。','「こんにちは」と言う。','P207','「 」・【 】・（ ）などの とじる しるしを 書いてください','とじる しるしを 足します'],
  ['quote','おはようと言う。','「おはよう」と言う。','P205','言う ことは「「文字」と言う」、へんすうの 中身は「点数を言う」のように 書きます','話す 文字は「 」で かこみます'],
  ['nested','もし1が1と同じなら、もし2が2と同じなら、「おはよう」と言う。',
    'もし1が1と同じなら、\n  もし2が2と同じなら、\n    「おはよう」と言う。','P201','「もし」や「くり返す」の 中に 重ねるときは、次の 行に 書いて、行の はじめを 右へ ずらしてください','行の はじめを 右へ ずらします'],
  ['repeat','「おはよう」と言うことを2回くり返すことを2回くり返す。',
    '2回くり返す。\n  2回くり返す。\n    「おはよう」と言う。','P201','くり返しの 中に くり返しを 重ねるときは、次の 行に 書いて、行の はじめを 右へ ずらしてください','行の はじめを 右へ ずらします'],
  ['tab','2回くり返す。\n\t「おはよう」と言う。','2回くり返す。\n  「おはよう」と言う。',
    'P209','Tabキーでは 行の はじめを ずらせません。スペースキーで 空白を 2つ 入れます。','スペースキーで 空白を 2つ 入れます'],
  ['outer-indent','  「おはよう」と言う。','「おはよう」と言う。','P209','いちばん 外の 文は、行の はじめを 右へ ずらさずに 書きます','いちばん 外の 文は 行の 左から'],
  ['heading-indent','始めると、\n「おはよう」と言う。','始めると、\n  「おはよう」と言う。',
    'P202','「作品を動かしたとき、」などの 次の 行は、行の はじめを 右へ ずらして 書きます','などの 次の 行は、はじめを 右へ'],
  ['alignment','2回くり返す。\n  「おはよう」と言う。\n   1秒待つ。','2回くり返す。\n  「おはよう」と言う。\n  1秒待つ。',
    'P209','同じ まとまりの 文は、行の はじめの 空白の 数を そろえてください','はじめの 空白の 数を そろえます'],
  ['delay','1秒後に10歩動く。','1秒待つ。\n10歩動く。','P205','待ってから 動くときは、「待つ」と「動く」の 2つの 文に 分けます','2つの 文に 分けます'],
  ['argument-name','（1＋2を10として、【足す】で求めた答え）を言う。','（点数を10として、【足す】で求めた答え）を言う。',
    'P205','入れるものの 名前を たしかめてください。れい：点数を10として、','名前を 1つ 書きます'],
  ['argument-duplicate','（点数を10、点数を20として、【足す】で求めた答え）を言う。',
    '（点数を10、名前を「あかり」として、【足す】で求めた答え）を言う。','P205','入れるものの 名前「点数」を 2回 書いています。名前は 1回ずつ 書いてください','同じ 名前が 2つ いじょう あります'],
  ['argument-bundle','（10、20を渡して、【足す】で求めた答え）を言う。','（（10、20）を渡して、【足す】で求めた答え）を言う。',
    'P205','入れるものを（ ）で かこんでください。れい：（10、「あかり」）をわたして、','（ ）で ひとまとめに します'],
];
const expected=[...cases.map(x=>'syntax/'+x[0]),'semantic/function-effects','semantic/scalar-guidance','semantic/touch-heading','runtime/list-reference','file/digest-refusal',
  'save/digest-fault','save/length-fault','save/orphan-fault','import/current-and-incoming','reach/keyboard-390','reach/touch-390'];

async function install(p,{source='「もとの動き」と言う。',args=[]}={}) {
  const file=await p.evaluate(({source,args})=>{const q=Akari.makeEmptyProject();q.components[0].name='あかり';q.name='診断のことば';
    q.scripts=[{id:'diagnostic-main',targetId:'sprite-1',event:'start',source}];
    q.functions=[{id:'diagnostic-function',ownerId:'stage',name:'足す',args,source:'1＋2を返す。'}];
    q.projectData.lists=[{id:'shopping',name:'買うもの',initialValue:['りんご','パン']}];
    return Akari.serializeProject(q,Akari.makeDefaultAssetStore());},{source,args});
  await p.locator('#fileInput').setInputFiles({name:'child-diagnostic.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});
  // Unsaved work makes the product ask first; the fixture replaces it.
  await p.waitForFunction(()=>document.querySelector('#loseConfirmModal.show')||Akari.app.project.name==='診断のことば');
  await p.evaluate(()=>document.querySelector('#loseConfirmModal.show #loseConfirmProceed')?.click());
  await p.waitForFunction(()=>Akari.app.project.name==='診断のことば');
  await p.locator('#uiLevel').selectOption('advanced');await p.locator('#objectSelect').selectOption('sprite-1');
  if(await p.locator('#sourceOverview').isVisible())await p.locator('#sourceEditBtn').click();
  await chooseView(p,'code');
}
async function openOutputWithWheel(p) {
  const observations=[],panel=p.locator('.monitor-window'),output=panel.locator('.output-disclosure'),summary=output.locator('> summary');
  const geometry=()=>summary.evaluate(e=>{const r=e.getBoundingClientRect(),panel=e.closest('.monitor-window'),box=panel.getBoundingClientRect(),side=panel.closest('.side'),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{hit:!!hit&&(e===hit||e.contains(hit)),inside:r.top>=box.top&&r.bottom<=box.bottom,inViewport:r.top>=0&&r.bottom<=innerHeight,scrollTop:panel.scrollTop,sideScrollTop:side?.scrollTop||0,overflow:getComputedStyle(panel).overflowY,center:{x:r.x+r.width/2,y:r.y+r.height/2}};});
  async function wheelToSummary(){
    let wheelCount=0,after;
    // An inner monitor and its enclosing side can each consume a wheel step.
    // Use only the visible part of the panel and preserve the existing timeout.
    do{const box=await panel.boundingBox(),viewport=p.viewportSize();assert.ok(box&&box.width>0&&box.height>0);
      const top=Math.max(60,box.y),bottom=Math.min(viewport.height-42,box.y+box.height);
      await p.mouse.move(box.x+box.width/2,bottom>top?(top+bottom)/2:viewport.height/2);
      await p.mouse.wheel(0,600);await p.waitForTimeout(100);wheelCount++;after=await geometry();
    }while(wheelCount<3&&!(after.hit&&after.inside&&after.inViewport));
    assert.equal(after.hit,true);assert.equal(after.inside,true);assert.equal(after.inViewport,true);
    return{wheelCount,after};
  }
  for(const mode of ['code','blocks']){
  await chooseView(p,mode);
  const toggle=panel.locator('.blockui-side-toggle');if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
  for(const [width,height]of [[1180,757],[1366,768],[1188,848]]){
    await p.setViewportSize({width,height});
    if(await output.getAttribute('open')!==null)await summary.click();
    const before=await geometry();
    // Native wheel must expose the drawer; keyboard focus or DOM scrolling is
    // not a substitute for its ordinary pointer route at short heights.
    const {after,wheelCount}=await wheelToSummary();
    if(!before.hit||!before.inside||!before.inViewport)assert.ok(after.scrollTop>before.scrollTop||after.sideScrollTop>before.sideScrollTop,'native wheel scrolls clipped output into view');
    await p.mouse.click(after.center.x,after.center.y);assert.notEqual(await output.getAttribute('open'),null);
    const openRecovery=await wheelToSummary();await p.mouse.click(openRecovery.after.center.x,openRecovery.after.center.y);
    assert.equal(await output.getAttribute('open'),null);const closeRecovery=await wheelToSummary();
    await p.mouse.click(closeRecovery.after.center.x,closeRecovery.after.center.y);
    assert.notEqual(await output.getAttribute('open'),null);assert.equal(await p.locator('#console').isVisible(),true);
    observations.push({mode,width,height,before,after,wheelCount,openRecovery,closeRecovery,nativeWheel:true,opened:true,reopenedAfterClose:true});
  }
  }
  return observations;
}
async function syntaxCase(p,c) {
  const [id,source,fixed,code,original,help]=c;
  const args=id==='argument-name'?['点数']:id.startsWith('argument-')?['点数','名前']:[];
  await install(p,{args});const before=await state(p);
  const parser=await p.evaluate(({source,fixed})=>{const symbols=Akari.buildSymbols(Akari.app.project);
    const options={targetId:'sprite-1',event:'start',symbols};
    const negative=Akari.parseSyntax(source,options),positive=Akari.parseSyntax(fixed,options);
    return {negative:negative.syntaxDiagnostics,positive:positive.syntaxDiagnostics,accepted:!!positive.ast};},{source,fixed});
  assert.equal(parser.negative[0].code,code);assert.equal(parser.negative[0].message.replace(/\s+/gu,''),original.replace(/\s+/gu,''),'diagnostic meaning is stable across phrase spacing');
  assert.deepEqual(parser.positive,[]);assert.equal(parser.accepted,true);
  await p.locator('#codeEditor').fill(source);await p.locator('#codeEditor').press('Tab');
  await p.waitForFunction(()=>document.querySelector('#codeIssue').classList.contains('issue-error'));
  const primary=await p.locator('#codeIssue > .diagnostic-help').innerText();assert.ok(primary.includes(help),primary);
  assert.ok(!primary.includes(code),primary);
  assert.equal(await p.locator('#codeIssue > details').evaluate(e=>e.open),false);
  const summary=p.locator('#codeIssue > details > summary');await summary.focus();await summary.press('Enter');
  await p.locator('#codeIssue > details > pre').waitFor({state:'visible'});
  const detail=await p.locator('#codeIssue > details > pre').innerText();assert.ok(detail.includes(code));assert.ok(detail.includes(parser.negative[0].message),'teacher details preserve the exact parser message');
  assert.equal(await p.locator('#codeEditor').inputValue(),source);assert.deepEqual(await state(p),before);
  await p.locator('#editorCancel').click();assert.equal(await p.locator('#codeEditor').inputValue(),before.source);
  assert.deepEqual(await state(p),before);
  return {entry:'Playwright fill followed by native Tab; native Enter disclosure',parser,primary,detail,before,after:await state(p),source};
}
async function touchPage(browser,fn) {
  const context=await browser.newContext({offline:true,hasTouch:true,isMobile:true,viewport:{width:390,height:844}});
  const errors=[],network=[];
  try {await context.route(/^https?:/,r=>{network.push(r.request().url());return r.abort();});
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.goto(pathToFileURL(path.resolve(product)).href);await p.waitForFunction(()=>!!globalThis.Akari?.app);
    const result=await fn(p);assert.deepEqual(errors,[]);assert.deepEqual(network,[]);return result;
  }finally{await context.close();}
}
try {await withBrowser(chrome,async browser=>{
  report.environment.browser=browser.version();
  async function run(id,fn,{touch=false}={}) {
    const row={id,status:'RUNNING'};report.results.push(row);
    try {row.observed=await (touch?touchPage:((b,f)=>pageFor(b,product,f)))(browser,async p=>{
      p.setDefaultTimeout(8000);p.on('dialog',d=>d.accept());await answerProductConfirms(p,true);
      p.on('pageerror',e=>report.pageErrors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url());});
      if(!touch)await p.setViewportSize({width:1180,height:757});
      try{return await fn(p);}finally{await p.screenshot({path:path.join(dir,id.replaceAll('/','-')+'.png')}).catch(()=>{});}
    });row.status='PASS';}catch(error){row.status='FAIL';row.error=error.stack;}
    console.log(row.status+' '+id);save();
  }
  for(const c of cases)await run('syntax/'+c[0],p=>syntaxCase(p,c));
  await run('semantic/scalar-guidance',async p=>{
    await install(p);const before=await state(p);await p.locator('#codeEditor').fill('おはようと言う。');await p.locator('#codeEditor').press('Tab');
    await p.waitForFunction(()=>document.querySelector('#codeIssue').classList.contains('issue-error'));const listPrimary=await p.locator('#codeIssue > .diagnostic-help').innerText();assert.doesNotMatch(listPrimary,/【買うもの】を言う/);
    await p.locator('#editorCancel').click();const listAfter=await state(p);assert.deepEqual(listAfter,before);
    const file=await p.evaluate(()=>{const q=structuredClone(Akari.app.project),base=q.components[0];q.name='変数の案内';q.projectData.variables=[];base.localData={variables:[],lists:[]};
      const dog={...structuredClone(base),id:'guide-dog',name:'犬\\',costumes:base.costumes.map((c,i)=>({...c,id:'guide-face-'+i})),localData:{variables:[{id:'guide-value',name:'点数',initialValue:3}],lists:[]}};dog.costumeId=dog.costumes[0].id;q.components.push(dog);return Akari.serializeProject(q,Akari.app.assetStore);});
    await p.locator('#fileInput').setInputFiles({name:'scalar-guidance.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});await p.waitForFunction(()=>Akari.app.project.name==='変数の案内');
    const localBefore=await state(p);await p.locator('#codeEditor').fill('おはようと言う。');await p.locator('#codeEditor').press('Tab');await p.waitForFunction(()=>document.querySelector('#codeIssue').classList.contains('issue-error'));
    const localPrimary=await p.locator('#codeIssue > .diagnostic-help').innerText(),suggestion='「犬\\\\」の自分の点数を言う';assert.ok(localPrimary.includes(suggestion),localPrimary);
    const copied=await p.evaluate(suggestion=>{const q=structuredClone(Akari.app.project);q.actions=[{id:'guide-shadow',ownerId:'stage',name:'試す',args:[],source:'この中だけで使うリスト点数を空で作る。\n'+suggestion+'。'}];q.scripts=[{id:'guide-start',targetId:'sprite-1',event:'start',source:'【試す】という手順を行う。'}];
      const c=Akari.compileProject(q),said=[],r=new Akari.RuntimeModel(q),s=new Akari.EventScheduler(q,c,r,{say:(id,text)=>said.push(text)});s.schedule=()=>{};try{s.start();for(let i=0;i<100&&s.ready.length;i++)s.runTurn();return{errors:c.errors,runtimeErrors:s.errorRecords.map(e=>e.code),said};}finally{s.stop();}},suggestion);
    assert.deepEqual(copied,{errors:[],runtimeErrors:[],said:['3']});await p.locator('#editorCancel').click();assert.deepEqual(await state(p),localBefore);
    return {listPrimary,localPrimary,suggestion,copied,before,after:listAfter,localBefore,localAfter:await state(p)};
  });
  await run('semantic/touch-heading',async p=>{
    await install(p);const file=await p.evaluate(()=>{const q=Akari.makeEmptyProject(),base=q.components[0];q.name='接触の案内';base.name='ねこ';
      q.components.push({...structuredClone(base),id:'guide-star',name:'星',costumes:[{id:'guide-star-face',name:'丸',kind:'text',value:'●'}],costumeId:'guide-star-face',localData:{variables:[],lists:[]}});
      q.scripts=[{id:'guide-normal',targetId:'sprite-1',event:'start',source:'何もしない。'},{id:'guide-stage',targetId:'stage',event:'start',source:'何もしない。'},{id:'guide-meijin',targetId:'meijin',mode:'meijin',event:'start',source:'ねこは何もしない。'}];return Akari.serializeProject(q,Akari.makeDefaultAssetStore());});
    await p.locator('#fileInput').setInputFiles({name:'touch-heading.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});await p.waitForFunction(()=>Akari.app.project.name==='接触の案内');
    const contexts=[];for(const owner of ['sprite-1','stage','meijin']){
      await p.locator('#objectSelect').selectOption(owner);if(await p.locator('#sourceOverview').isVisible())await p.locator('#sourceEditBtn').click();await chooseView(p,'code');const before=await state(p);
      await (await reveal(p.locator('#hintSearch'))).fill('ふれたとき');const note=p.locator('#codeHints .hint-heading-note');await note.waitFor();const primary=await note.innerText(),example=/本文の はじめに「([\s\S]*)」を 書いてね$/.exec(primary)?.[1];assert.ok(example);
      const copied=await p.evaluate(({owner,example})=>{const q=structuredClone(Akari.app.project);q.scripts=[{id:'guide-copy',targetId:owner,...(owner==='meijin'?{mode:'meijin'}:{}),event:'start',source:example+'\n  ねこは何もしない。'}];const c=Akari.compileProject(q);return{errors:c.errors,items:c.items.map(x=>({targetId:x.targetId,event:x.event,filter:x.filter}))};},{owner,example});
      assert.deepEqual(copied,{errors:[],items:[{targetId:'sprite-1',event:'touchStart',filter:{target:'星'}}]});assert.deepEqual(await state(p),before);contexts.push({owner,primary,example,copied,before,after:await state(p)});
    }
    await p.locator('#procBtn').click();await p.locator('#callableNewAction').click();await p.locator('#callableName').fill('案内を調べる');await p.locator('#callableCode').fill('何もしない。');await (await reveal(p.locator('#callableHintSearch'))).fill('ふれたとき');
    const callableNotes=await p.locator('#callableHints .hint-heading-note').count();assert.equal(callableNotes,0);return {contexts,callableNotes};
  });
  await run('semantic/function-effects',async p=>{
    await install(p);const file=await p.evaluate(()=>{const q=structuredClone(Akari.app.project);q.functions[0].source='1秒待つ。\n1を返す。';
      q.name='計算の動き';return Akari.serializeProject(q,Akari.app.assetStore);});
    await p.locator('#fileInput').setInputFiles({name:'effects.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});
    await p.waitForFunction(()=>Akari.app.project.name==='計算の動き');const before=await state(p);
    const errors=await p.evaluate(()=>Akari.compileProject(Akari.app.project).errors);assert.ok(errors.some(d=>d.code==='S305'&&d.message==='「答えを もとめる」の 中では、動く・音を 出す・待つ などの やる ことは 使えません'));
    await p.locator('#diagnoseBtn').click();const issue=p.locator('#diagnosisBody .diagnosis-issue').filter({hasText:'S305'}).first();
    const primary=await issue.locator('> .diagnostic-help').innerText();assert.match(primary,/音を 出す・待つ/);assert.match(primary,/「てじゅん」へ 入れます/);assert.match(primary,/足す/);assert.ok(!primary.includes('function:diagnostic-function'));
    await issue.locator('> details > summary').click();const detail=await issue.locator('> details > pre').innerText();assert.match(detail,/S305/);assert.match(detail,/やる ことは 使えません/);
    assert.deepEqual(await state(p),before);const after=await state(p);await p.locator('#diagnosisClose').click();
    // Two ownerless texts must be distinguishable in the list, including when their event and line are the same.
    const meijinFile=await p.evaluate(()=>{const q=Akari.makeEmptyProject();q.name='名人の診断の場所';q.components[0].name='ねこ';q.scripts=[1,2].map(n=>({id:'meijin-'+n,mode:'meijin',targetId:'meijin',event:'start',source:'ねこは「はじめ」と言う。\nねこは「ない部品'+n+'」のところへ行く。'}));return Akari.serializeProject(q,Akari.makeDefaultAssetStore());});
    await p.locator('#fileInput').setInputFiles({name:'meijin-locations.akari.md',mimeType:'text/plain',buffer:Buffer.from(meijinFile)});await p.waitForFunction(()=>Akari.app.project.name==='名人の診断の場所');
    await p.locator('#diagnoseBtn').click();const locations=await p.locator('#diagnosisBody .diagnosis-issue > .diagnostic-help').allInnerTexts();
    assert.equal(locations.length,2);assert.match(locations[0],/名人の本文 1/);assert.match(locations[1],/名人の本文 2/);assert.ok(locations.every(t=>!t.includes('画面1 /')&&!t.includes('ねこ /')));
    await p.locator('#diagnosisClose').click();await install(p);await p.locator('#codeEditor').fill('【同じ しるし】を言う。');await p.waitForFunction(()=>document.querySelector('#codeIssue').classList.contains('issue-error'));
    const unknownName=await p.locator('#codeIssue > .diagnostic-help').innerText();assert.ok(unknownName.includes('同じ しるし'));assert.ok(!unknownName.includes('絵や音'),'a quoted user name never chooses asset-integrity guidance');await p.locator('#editorCancel').click();
    const quotedNames=[];
    for(const name of ['を2回書いています','とじるしるしを書いてください','入れるものの名前をたしかめてください']){
      const beforeName=await state(p);await p.locator('#codeEditor').fill('【'+name+'】を言う。');
      await p.waitForFunction(name=>document.querySelector('#codeIssue > .diagnostic-help')?.textContent.includes(name),name);
      const entered=await state(p);
      const primary=await p.locator('#codeIssue > .diagnostic-help').innerText(),detail=await p.locator('#codeIssue > details > pre').textContent();
      assert.ok(primary.includes(name));assert.doesNotMatch(primary,/入れて使う 数や 文字|とじる しるしを 足します/);assert.match(detail,/S301/);
      assert.deepEqual(await state(p),entered,'reading a semantic diagnostic preserves the edited work');
      await p.locator('#codeEditor').fill(beforeName.source);await p.waitForFunction(source=>Akari.app.editorState.main.sourceText===source,beforeName.source);quotedNames.push({name,primary,detail,preserved:true});
    }
    const quotedSources=[];
    for(const source of ['「x」とじるしるしを書いてください。','「x」を2回書いています。','「x」」とじるしるしを書いてください。']){
      const beforeSource=await state(p),original=await p.evaluate(source=>Akari.parseSyntax(source,{symbols:Akari.buildSymbols(Akari.app.project)}).syntaxDiagnostics[0],source);
      await p.locator('#codeEditor').fill(source);await p.waitForFunction(source=>document.querySelector('#codeIssue > .diagnostic-help')?.textContent.includes(source.slice(0,-1)),source);
      const primary=await p.locator('#codeIssue > .diagnostic-help').innerText();assert.equal(primary,'1行目：'+original.message);
      await p.locator('#editorCancel').click();assert.deepEqual(await state(p),beforeSource);quotedSources.push({source,primary,original:original.message,preserved:true});
    }
    return {errors,primary,detail,before,after,meijinLocations:locations,unknownName,quotedNames,quotedSources};
  });
  await run('runtime/list-reference',async p=>{
    await install(p,{source:'「買うもの」の2番目を2秒話す。'});const before=await state(p);
    await p.locator('#runBtn').click();await p.locator('#failureModal.show').waitFor();
    const primary=await p.locator('#failureBody > .diagnostic-help').innerText();assert.match(primary,/ならんだ ものを おぼえる リスト/);assert.match(primary,/あかり/);assert.match(primary,/1行目/);assert.match(primary,/のこって いるよ/);
    assert.doesNotMatch(primary,/script:|sprite-1|R411/);
    const raw=p.locator('#failureBody .failure-summary');assert.equal(await raw.isVisible(),false);
    await p.locator('#failureBody > details').first().locator('> summary').focus();
    await p.locator('#failureBody > details').first().locator('> summary').press('Enter');
    const detail=await raw.innerText();assert.match(detail,/^R411:/);assert.match(detail,/script:diagnostic-main/);assert.match(detail,/「買うもの」の2番目/);
    assert.equal(await p.locator('#failureEditList').count(),1);assert.equal((await state(p)).project,before.project);
    return {primary,detail,recordChoice:await p.locator('#failureSelect').innerText(),before,after:await state(p)};
  });
  await run('file/digest-refusal',async p=>{
    await install(p);const before=await state(p);
    const file=await p.evaluate(()=>Akari.serializeProject(Akari.app.project,Akari.app.assetStore).replaceAll(Akari.diagnostics.DEFAULT_MASCOT_SHA256,'0'.repeat(64)));
    const previous=await p.locator('#console').textContent();await p.locator('#fileInput').setInputFiles({name:'broken-digest.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});
    await p.waitForFunction(previous=>document.querySelector('#console').textContent!==previous,previous);
    // A refused 開く stays on the screen until とじる (1.5.0); the child closes it before reading 出力.
    await p.locator('#openRefusalModal.show').waitFor();assert.equal(await p.locator('#openRefusalTitle').textContent(),'この ファイルは 開けなかったよ');assert.doesNotMatch(await p.locator('#openRefusalModal').innerText(),/F508|記録と合いません/);await p.locator('#openRefusalClose').click();await p.locator('#openRefusalModal').waitFor({state:'hidden'});
    const outputReachability=await openOutputWithWheel(p);const visible=await p.locator('#console').innerText();assert.match(visible,/作品ファイルを 開けませんでした/);assert.match(visible,/えらんだ ファイルは かえて いません/);assert.doesNotMatch(visible,/記録と合いません|F508/);
    const disclosure=p.locator('#console > details').last();await disclosure.locator('> summary').click();const detail=await disclosure.locator('> pre').innerText();assert.match(detail,/F508.*読みこめませんでした: 絵や音の中身が、記録と合いません/);
    assert.deepEqual(await state(p),before);return {visible,detail,before,after:await state(p),source:'genuinely malformed serialized asset digest',outputReachability};
  });
  for(const [id,code,message]of [['digest','F508','同じしるしの絵や音なのに、大きさがちがいます'],['length','F508','絵や音の大きさが、記録と合いません'],['orphan','F503','作品ファイルに、使われていない絵や音か、足りない絵や音があります']])
    await run('save/'+id+'-fault',async p=>{
      await install(p);const before=await state(p),downloads=[];p.on('download',d=>downloads.push(d.suggestedFilename()));
      await p.evaluate(({code,message})=>{const store=Akari.app.assetStore;window.restoreDiagnosticGet={store,get:store.get};
        store.get=()=>{throw new Akari.diagnostics.AkariError(code,message);};},{code,message});
      try{await p.locator('#saveBtn').click();}finally{await p.evaluate(()=>{const {store,get}=window.restoreDiagnosticGet;store.get=get;delete window.restoreDiagnosticGet;});}
      const outputReachability=await openOutputWithWheel(p);const visible=await p.locator('#console').innerText();assert.match(visible,/作品ファイルを ほぞん できませんでした/);assert.match(visible,/この画面の作品は のこって います/);assert.doesNotMatch(visible,/しるしの絵や音|記録と合いません|足りない絵や音/);
      const disclosure=p.locator('#console > details').last();await disclosure.locator('> summary').click();const detail=await disclosure.locator('> pre').innerText();assert.ok(detail.includes(code));assert.ok(detail.includes(message));
      assert.deepEqual(downloads,[]);assert.deepEqual(await state(p),before);return {source:'explicit synthetic asset lookup failure for UI/atomic-save coverage',code,message,visible,detail,before,after:await state(p),downloads,outputReachability};
    });
  await run('import/current-and-incoming',async p=>{
    await install(p);const before=await state(p),source='始めると、あかりは「新しい動き」と言う。あかりがクリックされると、「もうひとつ」と言う。';
    await p.locator('#codeEditor').fill(source);await p.locator('#codeEditor').press('Tab');await p.locator('#sourceImport').waitFor({state:'visible'});
    const root=p.locator('#sourceImport');assert.match(await root.innerText(),/いまの 本文/);assert.equal(await p.locator('#sourceImportConfirm').isDisabled(),true);
    for(const summary of await root.locator('details:not([open]) > summary').all())await summary.click();
    const preview=await root.innerText();assert.match(preview,/いまの 本文：\n「もとの動き」と言う。/);assert.match(preview,/取りこむ 本文：\n始めると、あかりは「新しい動き」と言う。/);
    assert.equal((await state(p)).project,before.project);await p.locator('#sourceImportCancel').click();assert.deepEqual(await state(p),before);
    return {preview,before,after:await state(p),source};
  });
  for(const touch of [false,true])await run('reach/'+(touch?'touch':'keyboard')+'-390',async p=>{
    await p.setViewportSize({width:390,height:844});await install(p);const before=await state(p);
    await p.locator('#codeEditor').fill('おはようと言う。');
    await p.waitForFunction(()=>document.querySelector('#codeIssue').classList.contains('issue-error'));
    await p.locator('#codeEditor').press('Tab');
    const summary=p.locator('#codeIssue > details > summary');await summary.scrollIntoViewIfNeeded();
    if(touch)await summary.tap();else{
      // A rejected code draft has its own teacher detail before codeIssue in the native tab order.
      const pending=p.locator('#editorPending > details > summary');
      assert.equal(await pending.evaluate(e=>e===document.activeElement),true);
      await p.keyboard.press('Enter');assert.equal(await pending.evaluate(e=>e.parentElement.open),true);
      assert.match(await p.locator('#editorPending > details > pre').innerText(),/P205/);
      await p.keyboard.press('Enter');assert.equal(await pending.evaluate(e=>e.parentElement.open),false);
      let tabs=0;while(!await summary.evaluate(e=>e===document.activeElement)&&tabs++<8)await p.keyboard.press('Tab');
      assert.equal(await summary.evaluate(e=>e===document.activeElement),true,'native Tab reaches the code diagnostic disclosure');
      await summary.scrollIntoViewIfNeeded();await p.keyboard.press('Enter');
    }
    assert.equal(await p.locator('#codeIssue > details').evaluate(e=>e.open),true);
    const geometry=await summary.evaluate(e=>{const r=e.getBoundingClientRect();return {rect:r.toJSON(),hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),font:getComputedStyle(e).fontSize,viewport:{width:innerWidth,height:innerHeight}};});
    assert.ok(geometry.hit);assert.ok(geometry.rect.height>=28);assert.ok(parseFloat(geometry.font)>=13);
    assert.match(await p.locator('#codeIssue > details > pre').innerText(),/言う ことは/);assert.deepEqual(await state(p),before);
    return {entry:touch?'native touch tap':'native keyboard Enter',geometry,before,after:await state(p)};
  },{touch});
});
assert.deepEqual(report.results.map(x=>x.id).sort(),expected.sort());
assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);
assert.ok(report.results.every(x=>x.status==='PASS'),report.results.filter(x=>x.status!=='PASS').map(x=>x.id).join(', '));
report.status='PASS';save();console.log('Child diagnostics '+report.results.length+' PASS');
}catch(error){report.status='FAIL';report.error=error.stack;save();console.error(error.stack);process.exitCode=1;}
