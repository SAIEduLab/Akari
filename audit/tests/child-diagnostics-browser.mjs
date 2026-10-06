import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {reveal} from '../lib/ux-repair02-ui.mjs';

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
    'もし条件（（1が2と同じではない）ではない）が成り立つなら、\n  「おはよう」と言う。','P201','二重否定は括弧で分けてください','（ ）でくくります'],
  ['parentheses','（1＋2］を言う。','（1＋2）を言う。','P207','括弧の対応を確認してください','開くしるしと閉じるしるし'],
  ['closing','「こんにちはと言う。','「こんにちは」と言う。','P207','文字列・名前・括弧を閉じてください','閉じるしるしを足します'],
  ['quote','おはようと言う。','「おはよう」と言う。','P205','台詞は「文字」と言う、値は「値を言う」と書きます','話す文字は「 」でくくります'],
  ['nested','もし1が1と同じなら、もし2が2と同じなら、「おはよう」と言う。',
    'もし1が1と同じなら、\n  もし2が2と同じなら、\n    「おはよう」と言う。','P201','入れ子の条件・反復は字下げして書いてください','先頭を右へずらします'],
  ['repeat','「おはよう」と言うことを2回くり返すことを2回くり返す。',
    '2回くり返す。\n  2回くり返す。\n    「おはよう」と言う。','P201','深い反復は字下げして書いてください','先頭を右へずらします'],
  ['tab','2回くり返す。\n\t「おはよう」と言う。','2回くり返す。\n  「おはよう」と言う。',
    'P209','字下げは半角スペースで書きます。タブや全角空白の範囲を確認してください','小さい空白（半角スペース）'],
  ['outer-indent','  「おはよう」と言う。','「おはよう」と言う。','P209','最上位の文は字下げせずに書きます','いちばん外の文は行の左から'],
  ['heading-indent','始めると、\n「おはよう」と言う。','始めると、\n  「おはよう」と言う。',
    'P202','見出しの本文を字下げして書いてください','「始めると、」などの次の行'],
  ['alignment','2回くり返す。\n  「おはよう」と言う。\n   1秒待つ。','2回くり返す。\n  「おはよう」と言う。\n  1秒待つ。',
    'P209','同じまとまりの文の字下げをそろえてください','先頭の空白の数をそろえます'],
  ['delay','1秒後に10歩動く。','1秒待つ。\n10歩動く。','P205','待ってから動く意味なら、待機と移動を分けます','2つの文に分けます'],
  ['argument-name','（1＋2を10として、【足す】で求めた答え）を言う。','（点数を10として、【足す】で求めた答え）を言う。',
    'P205','引数名を確認してください','名前を1つ書きます'],
  ['argument-duplicate','（点数を10、点数を20として、【足す】で求めた答え）を言う。',
    '（点数を10、名前を「あかり」として、【足す】で求めた答え）を言う。','P205','引数名「点数」が重複しています','同じ名前を2回書いています'],
  ['argument-bundle','（10、20を渡して、【足す】で求めた答え）を言う。','（（10、20）を渡して、【足す】で求めた答え）を言う。',
    'P205','渡す値を括弧で囲んでください','（ ）でひとまとめにします'],
];
const expected=[...cases.map(x=>'syntax/'+x[0]),'semantic/function-effects','runtime/list-reference','file/digest-refusal',
  'save/digest-fault','save/length-fault','save/orphan-fault','import/current-and-incoming','reach/keyboard-390','reach/touch-390'];

async function install(p,{source='「もとの動き」と言う。',args=[]}={}) {
  const file=await p.evaluate(({source,args})=>{const q=Akari.makeEmptyProject();q.components[0].name='あかり';q.name='診断のことば';
    q.scripts=[{id:'diagnostic-main',targetId:'sprite-1',event:'start',source}];
    q.functions=[{id:'diagnostic-function',ownerId:'stage',name:'足す',args,source:'1＋2を返す。'}];
    q.projectData.lists=[{id:'shopping',name:'買うもの',initialValue:['りんご','パン']}];
    return Akari.serializeProject(q,Akari.makeDefaultAssetStore());},{source,args});
  await p.locator('#fileInput').setInputFiles({name:'child-diagnostic.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});
  await p.waitForFunction(()=>Akari.app.project.name==='診断のことば');
  await p.locator('#uiLevel').selectOption('advanced');await p.locator('#objectSelect').selectOption('sprite-1');
  if(await p.locator('#sourceOverview').isVisible())await p.locator('#sourceEditBtn').click();
  await p.locator('#editorModecode').click();
}
async function syntaxCase(p,c) {
  const [id,source,fixed,code,original,help]=c;
  const args=id==='argument-name'?['点数']:id.startsWith('argument-')?['点数','名前']:[];
  await install(p,{args});const before=await state(p);
  const parser=await p.evaluate(({source,fixed})=>{const symbols=Akari.buildSymbols(Akari.app.project);
    const options={targetId:'sprite-1',event:'start',symbols};
    const negative=Akari.parseSyntax(source,options),positive=Akari.parseSyntax(fixed,options);
    return {negative:negative.syntaxDiagnostics,positive:positive.syntaxDiagnostics,accepted:!!positive.ast};},{source,fixed});
  assert.equal(parser.negative[0].code,code);assert.equal(parser.negative[0].message,original);
  assert.deepEqual(parser.positive,[]);assert.equal(parser.accepted,true);
  await p.locator('#codeEditor').fill(source);await p.locator('#codeEditor').press('Tab');
  await p.waitForFunction(()=>document.querySelector('#codeIssue').classList.contains('issue-error'));
  const primary=await p.locator('#codeIssue > .diagnostic-help').innerText();assert.ok(primary.includes(help),primary);
  assert.ok(!primary.includes(code),primary);
  assert.equal(await p.locator('#codeIssue > details').evaluate(e=>e.open),false);
  const summary=p.locator('#codeIssue > details > summary');await summary.focus();await summary.press('Enter');
  await p.locator('#codeIssue > details > pre').waitFor({state:'visible'});
  const detail=await p.locator('#codeIssue > details > pre').innerText();assert.ok(detail.includes(code));assert.ok(detail.includes(original));
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
      p.setDefaultTimeout(8000);p.on('dialog',d=>d.accept());
      p.on('pageerror',e=>report.pageErrors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url());});
      if(!touch)await p.setViewportSize({width:1180,height:757});
      try{return await fn(p);}finally{await p.screenshot({path:path.join(dir,id.replaceAll('/','-')+'.png')}).catch(()=>{});}
    });row.status='PASS';}catch(error){row.status='FAIL';row.error=error.stack;}
    console.log(row.status+' '+id);save();
  }
  for(const c of cases)await run('syntax/'+c[0],p=>syntaxCase(p,c));
  await run('semantic/function-effects',async p=>{
    await install(p);const file=await p.evaluate(()=>{const q=structuredClone(Akari.app.project);q.functions[0].source='1秒待つ。\n1を返す。';
      q.name='計算の動き';return Akari.serializeProject(q,Akari.app.assetStore);});
    await p.locator('#fileInput').setInputFiles({name:'effects.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});
    await p.waitForFunction(()=>Akari.app.project.name==='計算の動き');const before=await state(p);
    const errors=await p.evaluate(()=>Akari.compileProject(Akari.app.project).errors);assert.ok(errors.some(d=>d.code==='S305'&&d.message==='計算では外部副作用や待機を行えません'));
    await p.locator('#diagnoseBtn').click();const issue=p.locator('#diagnosisBody .diagnosis-issue').filter({hasText:'S305'}).first();
    const primary=await issue.locator('> .diagnostic-help').innerText();assert.match(primary,/音を出す・待つ/);assert.match(primary,/手順（てじゅん）/);assert.match(primary,/足す/);assert.ok(!primary.includes('function:diagnostic-function'));
    await issue.locator('> details > summary').click();const detail=await issue.locator('> details > pre').innerText();assert.match(detail,/S305/);assert.match(detail,/外部副作用や待機/);
    assert.deepEqual(await state(p),before);return {errors,primary,detail,before,after:await state(p)};
  });
  await run('runtime/list-reference',async p=>{
    await install(p,{source:'「買うもの」の2番目を2秒話す。'});const before=await state(p);
    await p.locator('#runBtn').click();await p.locator('#failureModal.show').waitFor();
    const primary=await p.locator('#failureBody > .diagnostic-help').innerText();assert.match(primary,/ならんだものを覚えるリスト/);assert.match(primary,/あかり/);assert.match(primary,/1行目/);assert.match(primary,/残っています/);
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
    await reveal(p.locator('#console'));const visible=await p.locator('#console').innerText();assert.match(visible,/作品ファイルを開けませんでした/);assert.match(visible,/選んだファイルは変えていません/);assert.doesNotMatch(visible,/SHA-256|F508/);
    const disclosure=p.locator('#console > details').last();await disclosure.locator('> summary').click();const detail=await disclosure.locator('> pre').innerText();assert.match(detail,/F508.*読み込み失敗: asset SHA-256が一致しません/);
    assert.deepEqual(await state(p),before);return {visible,detail,before,after:await state(p),source:'genuinely malformed serialized asset digest'};
  });
  for(const [id,code,message]of [['digest','F508','同じSHA-256でbyteLengthが異なります'],['length','F508','asset byteLengthが一致しません'],['orphan','F503','保存Projectにorphan assetまたは不足assetがあります']])
    await run('save/'+id+'-fault',async p=>{
      await install(p);const before=await state(p),downloads=[];p.on('download',d=>downloads.push(d.suggestedFilename()));
      await p.evaluate(({code,message})=>{const store=Akari.app.assetStore;window.restoreDiagnosticGet={store,get:store.get};
        store.get=()=>{throw new Akari.diagnostics.AkariError(code,message);};},{code,message});
      try{await p.locator('#saveBtn').click();}finally{await p.evaluate(()=>{const {store,get}=window.restoreDiagnosticGet;store.get=get;delete window.restoreDiagnosticGet;});}
      await reveal(p.locator('#console'));const visible=await p.locator('#console').innerText();assert.match(visible,/作品ファイルを保存（ほぞん）できませんでした/);assert.match(visible,/この画面の作品は残っています/);assert.doesNotMatch(visible,/SHA-256|byteLength|orphan asset/);
      const disclosure=p.locator('#console > details').last();await disclosure.locator('> summary').click();const detail=await disclosure.locator('> pre').innerText();assert.ok(detail.includes(code));assert.ok(detail.includes(message));
      assert.deepEqual(downloads,[]);assert.deepEqual(await state(p),before);return {source:'explicit synthetic asset lookup failure for UI/atomic-save coverage',code,message,visible,detail,before,after:await state(p),downloads};
    });
  await run('import/current-and-incoming',async p=>{
    await install(p);const before=await state(p),source='始めると、あかりは「新しい動き」と言う。あかりがクリックされると、「もうひとつ」と言う。';
    await p.locator('#codeEditor').fill(source);await p.locator('#codeEditor').press('Tab');await p.locator('#sourceImport').waitFor({state:'visible'});
    const root=p.locator('#sourceImport');assert.match(await root.innerText(),/今の動き/);assert.equal(await p.locator('#sourceImportConfirm').isDisabled(),true);
    for(const summary of await root.locator('details:not([open]) > summary').all())await summary.click();
    const preview=await root.innerText();assert.match(preview,/今の動き：\n「もとの動き」と言う。/);assert.match(preview,/取りこむ動き：\n始めると、あかりは「新しい動き」と言う。/);
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
      assert.equal(await summary.evaluate(e=>e===document.activeElement),true);
      await p.keyboard.press('Enter');
    }
    assert.equal(await p.locator('#codeIssue > details').evaluate(e=>e.open),true);
    const geometry=await summary.evaluate(e=>{const r=e.getBoundingClientRect();return {rect:r.toJSON(),hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),font:getComputedStyle(e).fontSize,viewport:{width:innerWidth,height:innerHeight}};});
    assert.ok(geometry.hit);assert.ok(geometry.rect.height>=28);assert.ok(parseFloat(geometry.font)>=13);
    assert.match(await p.locator('#codeIssue > details > pre').innerText(),/台詞/);assert.deepEqual(await state(p),before);
    return {entry:touch?'native touch tap':'native keyboard Enter',geometry,before,after:await state(p)};
  },{touch});
});
assert.deepEqual(report.results.map(x=>x.id).sort(),expected.sort());
assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);
assert.ok(report.results.every(x=>x.status==='PASS'),report.results.filter(x=>x.status!=='PASS').map(x=>x.id).join(', '));
report.status='PASS';save();console.log('Child diagnostics '+report.results.length+' PASS');
}catch(error){report.status='FAIL';report.error=error.stack;save();console.error(error.stack);process.exitCode=1;}
