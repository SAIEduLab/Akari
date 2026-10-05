import assert from 'node:assert/strict';
import {browserEnvironment} from './browser-environment.mjs';

// Fixed independently of the browser runner's list and observed result status.
const syntaxExpectations=[
  ['double-negative','P201','二重否定は括弧で分けてください','（ ）でくくります'],
  ['parentheses','P207','括弧の対応を確認してください','開くしるしと閉じるしるし'],
  ['closing','P207','文字列・名前・括弧を閉じてください','閉じるしるしを足します'],
  ['quote','P205','台詞は「文字」と言う、値は「値を言う」と書きます','話す文字は「 」でくくります'],
  ['nested','P201','入れ子の条件・反復は字下げして書いてください','先頭を右へずらします'],
  ['repeat','P201','深い反復は字下げして書いてください','先頭を右へずらします'],
  ['tab','P209','字下げは半角スペースで書きます。タブや全角空白の範囲を確認してください','小さい空白（半角スペース）'],
  ['outer-indent','P209','最上位の文は字下げせずに書きます','いちばん外の文は行の左から'],
  ['heading-indent','P202','見出しの本文を字下げして書いてください','「始めると、」などの次の行'],
  ['alignment','P209','同じまとまりの文の字下げをそろえてください','先頭の空白の数をそろえます'],
  ['delay','P205','待ってから動く意味なら、待機と移動を分けます','2つの文に分けます'],
  ['argument-name','P205','引数名を確認してください','名前を1つ書きます'],
  ['argument-duplicate','P205','引数名「点数」が重複しています','同じ名前を2回書いています'],
  ['argument-bundle','P205','渡す値を括弧で囲んでください','（ ）でひとまとめにします'],
];
export const childDiagnosticIds=Object.freeze([...syntaxExpectations.map(x=>'syntax/'+x[0]),
  'semantic/function-effects','runtime/list-reference','file/digest-refusal',
  'save/digest-fault','save/length-fault','save/orphan-fault','import/current-and-incoming',
  'reach/keyboard-390','reach/touch-390']);

export function verifyChildDiagnosticsReport(report,inputs) {
  assert.equal(report.schema,'akari-child-diagnostics-v1');assert.equal(report.status,'PASS');
  assert.deepEqual(report.snapshot,inputs);assert.match(inputs.productSha256,/^[a-f0-9]{64}$/);
  assert.equal(report.environment.browser,browserEnvironment.version);
  assert.equal(report.environment.playwright,browserEnvironment.playwright);
  assert.ok(['linux','win32'].includes(report.environment.platform));
  assert.deepEqual(report.limits,{perCaseMs:8000,hostMs:240000});
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);
  assert.equal(report.results.length,childDiagnosticIds.length);
  assert.deepEqual(report.results.map(x=>x.id).sort(),[...childDiagnosticIds].sort());
  assert.equal(new Set(report.results.map(x=>x.id)).size,childDiagnosticIds.length);
  const rows=new Map(report.results.map(x=>[x.id,x.observed]));
  for(const row of report.results){assert.equal(row.status,'PASS',row.id);assert.ok(row.observed,row.id);assert.ok(!row.error,row.id);}
  for(const [name,code,message,help]of syntaxExpectations){
    const d=rows.get('syntax/'+name);assert.equal(d.parser.negative[0].code,code);assert.equal(d.parser.negative[0].message,message);
    assert.deepEqual(d.parser.positive,[]);assert.equal(d.parser.accepted,true);
    assert.ok(d.primary.includes(help));assert.ok(!d.primary.includes(code));
    assert.ok(d.detail.includes(code));assert.ok(d.detail.includes(message));
    assert.deepEqual(d.after,d.before);assert.ok(d.source.length>0);assert.match(d.entry,/native Enter disclosure/);
  }
  const effects=rows.get('semantic/function-effects');
  assert.ok(effects.errors.some(d=>d.code==='S305'&&d.message==='計算では外部副作用や待機を行えません'));
  assert.match(effects.primary,/音を出す・待つ/);assert.match(effects.primary,/手順（てじゅん）/);assert.match(effects.primary,/足す/);
  assert.doesNotMatch(effects.primary,/function:diagnostic-function/);assert.match(effects.detail,/S305/);assert.match(effects.detail,/外部副作用や待機/);
  assert.deepEqual(effects.after,effects.before);
  const runtime=rows.get('runtime/list-reference');assert.match(runtime.primary,/ならんだものを覚えるリスト/);
  assert.match(runtime.primary,/あかり/);assert.match(runtime.primary,/1行目/);assert.match(runtime.primary,/残っています/);
  assert.doesNotMatch(runtime.primary,/script:|sprite-1|R411/);assert.match(runtime.detail,/^R411:/);assert.match(runtime.detail,/script:diagnostic-main/);
  assert.match(runtime.detail,/「買うもの」の2番目/);assert.match(runtime.recordChoice,/あかり/);assert.doesNotMatch(runtime.recordChoice,/R411|script:|sprite-1/);
  assert.equal(runtime.after.project,runtime.before.project);assert.equal(runtime.after.source,runtime.before.source);
  const digest=rows.get('file/digest-refusal');assert.match(digest.visible,/作品ファイルを開けませんでした/);
  assert.match(digest.visible,/選んだファイルは変えていません/);assert.doesNotMatch(digest.visible,/SHA-256|F508/);
  assert.match(digest.detail,/F508.*読み込み失敗: asset SHA-256が一致しません/);assert.deepEqual(digest.after,digest.before);
  assert.equal(digest.source,'genuinely malformed serialized asset digest');
  for(const [name,code,message]of [['digest','F508','同じSHA-256でbyteLengthが異なります'],
    ['length','F508','asset byteLengthが一致しません'],['orphan','F503','保存Projectにorphan assetまたは不足assetがあります']]){
    const d=rows.get('save/'+name+'-fault');assert.equal(d.code,code);assert.equal(d.message,message);
    assert.equal(d.source,'explicit synthetic asset lookup failure for UI/atomic-save coverage');
    assert.match(d.visible,/作品ファイルを保存（ほぞん）できませんでした/);assert.match(d.visible,/この画面の作品は残っています/);
    assert.doesNotMatch(d.visible,/SHA-256|byteLength|orphan asset/);assert.ok(d.detail.includes(code));assert.ok(d.detail.includes(message));
    assert.deepEqual(d.downloads,[]);assert.deepEqual(d.after,d.before);
  }
  const imported=rows.get('import/current-and-incoming');assert.match(imported.preview,/今の動き：\n「もとの動き」と言う。/);
  assert.match(imported.preview,/取りこむ動き：\n始めると、あかりは「新しい動き」と言う。/);assert.deepEqual(imported.after,imported.before);
  for(const name of ['keyboard','touch']){
    const d=rows.get('reach/'+name+'-390');assert.equal(d.geometry.viewport.width,390);
    assert.equal(d.geometry.hit,true);assert.ok(d.geometry.rect.height>=28);assert.ok(parseFloat(d.geometry.font)>=13);
    assert.deepEqual(d.after,d.before);assert.equal(d.entry,name==='keyboard'?'native keyboard Enter':'native touch tap');
  }
  return {status:'PASS',required:childDiagnosticIds.length,platform:report.environment.platform,
    semantic:'Original syntax/semantic diagnostics remain exact; atomic work and technical details preserved.',
    limits:'No measured child comprehension; Linux/Windows evidence is checked separately.'};
}
