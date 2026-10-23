import assert from 'node:assert/strict';
import {browserEnvironment} from './browser-environment.mjs';
const meaning = text => text.replace(/\s+/gu, '');

// Fixed independently of the browser runner's list and observed result status.
const syntaxExpectations=[
  ['double-negative','P201','「ではない」が 2つ つづいています。前の ほうを（ ）で かこんでください','「条件（…）が成り立たない」で 書きます'],
  ['parentheses','P207','かっこの 開く しるしと とじる しるしが 合っているか たしかめてください','開く しるしと とじる しるしを そろえます'],
  ['closing','P207','「 」・【 】・（ ）などの とじる しるしを 書いてください','とじる しるしを 足します'],
  ['quote','P205','言う ことは「「文字」と言う」、へんすうの 中身は「点数を言う」のように 書きます','話す 文字は「 」で かこみます'],
  ['nested','P201','「もし」や「くり返す」の 中に 重ねるときは、次の 行に 書いて、行の はじめを 右へ ずらしてください','行の はじめを 右へ ずらします'],
  ['repeat','P201','くり返しの 中に くり返しを 重ねるときは、次の 行に 書いて、行の はじめを 右へ ずらしてください','行の はじめを 右へ ずらします'],
  ['tab','P209','Tabキーでは 行の はじめを ずらせません。スペースキーで 空白を 2つ 入れます。','スペースキーで 空白を 2つ 入れます'],
  ['outer-indent','P209','いちばん 外の 文は、行の はじめを 右へ ずらさずに 書きます','いちばん 外の 文は 行の 左から'],
  ['heading-indent','P202','「作品を動かしたとき、」などの 次の 行は、行の はじめを 右へ ずらして 書きます','などの 次の 行は、はじめを 右へ'],
  ['alignment','P209','同じ まとまりの 文は、行の はじめの 空白の 数を そろえてください','はじめの 空白の 数を そろえます'],
  ['delay','P205','待ってから 動くときは、「待つ」と「動く」の 2つの 文に 分けます','2つの 文に 分けます'],
  ['argument-name','P205','入れるものの 名前を たしかめてください。れい：点数を10として、','名前を 1つ 書きます'],
  ['argument-duplicate','P205','入れるものの 名前「点数」を 2回 書いています。名前は 1回ずつ 書いてください','同じ 名前が 2つ いじょう あります'],
  ['argument-bundle','P205','入れるものを（ ）で かこんでください。れい：（10、「あかり」）をわたして、','（ ）で ひとまとめに します'],
];
export const childDiagnosticIds=Object.freeze([...syntaxExpectations.map(x=>'syntax/'+x[0]),
  'semantic/function-effects','semantic/scalar-guidance','semantic/touch-heading','runtime/list-reference','file/digest-refusal',
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
    const d=rows.get('syntax/'+name);assert.equal(d.parser.negative[0].code,code);assert.equal(meaning(d.parser.negative[0].message),meaning(message));
    assert.deepEqual(d.parser.positive,[]);assert.equal(d.parser.accepted,true);
    assert.ok(meaning(d.primary).includes(meaning(help)));assert.ok(!d.primary.includes(code));
    assert.ok(d.detail.includes(code));assert.ok(d.detail.includes(d.parser.negative[0].message));
    assert.deepEqual(d.after,d.before);assert.ok(d.source.length>0);assert.match(d.entry,/native Enter disclosure/);
  }
  const effects=rows.get('semantic/function-effects');
  const scalar=rows.get('semantic/scalar-guidance');assert.doesNotMatch(scalar.listPrimary,/【買うもの】を言う/);assert.equal(scalar.suggestion,'「犬\\\\」の自分の点数を言う');assert.ok(scalar.localPrimary.includes(scalar.suggestion));assert.deepEqual(scalar.copied,{errors:[],runtimeErrors:[],said:['3']});assert.deepEqual(scalar.after,scalar.before);assert.deepEqual(scalar.localAfter,scalar.localBefore);
  const heading=rows.get('semantic/touch-heading');assert.deepEqual(heading.contexts.map(c=>c.owner),['sprite-1','stage','meijin']);assert.equal(heading.callableNotes,0);
  for(const c of heading.contexts){assert.ok(c.primary.includes(c.example));assert.deepEqual(c.copied,{errors:[],items:[{targetId:'sprite-1',event:'touchStart',filter:{target:'星'}}]});assert.deepEqual(c.after,c.before);if(c.owner!=='sprite-1')assert.ok(c.example.startsWith('ねこが'));}
  assert.ok(effects.errors.some(d=>d.code==='S305'&&meaning(d.message)===meaning('「答えを もとめる」の 中では、動く・音を 出す・待つ などの やることは 使えません')));
  assert.match(effects.primary,/音を 出す・待つ/);assert.match(effects.primary,/「てじゅん」へ 入れます/);assert.match(effects.primary,/足す/);
  assert.doesNotMatch(effects.primary,/function:diagnostic-function/);assert.match(effects.detail,/S305/);assert.ok(meaning(effects.detail).includes('やることは使えません'));
  assert.deepEqual(effects.after,effects.before);
  assert.deepEqual(effects.history,[false,true].map(nextValid=>({nextValid,
    cancelled:{source:'「A」と言う。',input:'「A」と言う。',pending:null},
    undo:{source:nextValid?'「A」と言う。':'「もとの動き」と言う。',input:nextValid?'「A」と言う。':'「もとの動き」と言う。',pending:null},
    redo:{source:nextValid?'「C」と言う。':'「A」と言う。',input:nextValid?'「C」と言う。':'「A」と言う。',pending:null}})));
  assert.deepEqual(effects.quotedNames.map(r=>r.name),['を2回書いています','とじるしるしを書いてください','入れるものの名前をたしかめてください']);
  for(const row of effects.quotedNames){assert.ok(row.primary.includes(row.name));assert.doesNotMatch(row.primary,/入れて使う 数や 文字|とじる しるしを 足します/);assert.match(row.detail,/S301/);assert.equal(row.preserved,true);}
  assert.deepEqual(effects.quotedSources.map(r=>r.source),['「x」とじるしるしを書いてください。','「x」を2回書いています。','「x」」とじるしるしを書いてください。']);
  for(const row of effects.quotedSources){assert.equal(row.original,'「'+row.source.slice(0,-1)+'」は 読めません。書き方を たしかめて ください。');assert.equal(row.primary,'1行目：'+row.original);assert.equal(row.preserved,true);}
  const runtime=rows.get('runtime/list-reference');assert.match(runtime.primary,/ならんだ ものを おぼえる リスト/);
  assert.match(runtime.primary,/あかり/);assert.match(runtime.primary,/1行目/);assert.ok(meaning(runtime.primary).includes('のこっているよ'));
  assert.doesNotMatch(runtime.primary,/script:|sprite-1|R411/);assert.match(runtime.detail,/^R411:/);assert.match(runtime.detail,/script:diagnostic-main/);
  assert.match(runtime.detail,/「買うもの」の2番目/);assert.match(runtime.recordChoice,/あかり/);assert.doesNotMatch(runtime.recordChoice,/R411|script:|sprite-1/);
  assert.equal(runtime.after.project,runtime.before.project);assert.equal(runtime.after.source,runtime.before.source);
  const digest=rows.get('file/digest-refusal');assert.match(digest.visible,/作品ファイルを 開けませんでした/);
  assert.ok(meaning(digest.visible).includes('えらんだファイルはかえていません'));assert.doesNotMatch(digest.visible,/記録と合いません|F508/);
  assert.match(digest.detail,/F508.*読みこめませんでした: 絵や音の中身が、記録と合いません/);assert.deepEqual(digest.after,digest.before);
  assert.equal(digest.source,'genuinely malformed serialized asset digest');
  for(const d of [digest,...['digest','length','orphan'].map(name=>rows.get('save/'+name+'-fault'))]){
    assert.deepEqual(d.outputReachability.map(r=>[r.mode,r.width,r.height]),['code','blocks'].flatMap(mode=>[[1180,757],[1366,768],[1188,848]].map(([width,height])=>[mode,width,height])),'output mode and height boundaries');
    for(const r of d.outputReachability){assert.equal(r.nativeWheel,true);assert.equal(r.opened,true);assert.equal(r.reopenedAfterClose,true);
      for(const observation of [{after:r.after,wheelCount:r.wheelCount},r.openRecovery,r.closeRecovery]){
        assert.ok(Number.isInteger(observation.wheelCount)&&observation.wheelCount>=1&&observation.wheelCount<=3);
        assert.equal(observation.after.hit,true);assert.equal(observation.after.inside,true);assert.equal(observation.after.inViewport,true);assert.equal(observation.after.overflow,'auto');
      }
      if(!r.before.hit||!r.before.inside||!r.before.inViewport)assert.ok(r.after.scrollTop>r.before.scrollTop||r.after.sideScrollTop>r.before.sideScrollTop,'actual native inner or enclosing wheel scroll required');
    }
  }
  for(const [name,code,message]of [['digest','F508','同じしるしの絵や音なのに、大きさがちがいます'],
    ['length','F508','絵や音の大きさが、記録と合いません'],['orphan','F503','作品ファイルに、使われていない絵や音か、足りない絵や音があります']]){
    const d=rows.get('save/'+name+'-fault');assert.equal(d.code,code);assert.equal(d.message,message);
    assert.equal(d.source,'explicit synthetic asset lookup failure for UI/atomic-save coverage');
    assert.ok(meaning(d.visible).includes('作品ファイルをほぞんできませんでした'));assert.ok(meaning(d.visible).includes('この画面の作品はのこっています'));
    assert.doesNotMatch(d.visible,/しるしの絵や音|記録と合いません|足りない絵や音/);assert.ok(d.detail.includes(code));assert.ok(d.detail.includes(message));
    assert.deepEqual(d.downloads,[]);assert.deepEqual(d.after,d.before);
  }
  // The import panel names bodies 本文 and writes いま (F-23 glossary, final call 20; FCS-10).
  const imported=rows.get('import/current-and-incoming');assert.match(imported.preview,/いまの 本文：\n「もとの動き」と言う。/);
  assert.match(imported.preview,/取りこむ 本文：\n始めると、あかりは「新しい動き」と言う。/);assert.doesNotMatch(imported.preview,/今の動き|取りこむ動き/);
  assert.deepEqual(imported.after,imported.before);
  for(const name of ['keyboard','touch']){
    const d=rows.get('reach/'+name+'-390');assert.equal(d.geometry.viewport.width,390);
    assert.equal(d.geometry.hit,true);assert.ok(d.geometry.rect.height>=28);assert.ok(parseFloat(d.geometry.font)>=13);
    assert.deepEqual(d.after,d.before);assert.equal(d.entry,name==='keyboard'?'native keyboard Enter':'native touch tap');
  }
  return {status:'PASS',required:childDiagnosticIds.length,platform:report.environment.platform,
    semantic:'Original syntax/semantic diagnostics remain exact; atomic work and technical details preserved.',
    limits:'No measured child comprehension; Linux/Windows evidence is checked separately.'};
}
