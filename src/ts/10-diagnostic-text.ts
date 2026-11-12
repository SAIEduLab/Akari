import { insertionContext, splitComment } from './02-language-contracts.ts';
import { exprNode, nameSource } from './03-default-assets.ts';
import { formatExpression } from './06-source-formatting.ts';
import type { DiagnosticLike } from '../types/compiled.d.ts';
import type { Project, VariableData } from '../types/project.d.ts';

// ────────────────────────────────────────────────────────────────────────
// 10 — Diagnostic wording: the child's text of a diagnostic and the teacher's details, which the block view and the
// application show.
// ────────────────────────────────────────────────────────────────────────
// Whether the line of a diagnostic is inside a もし／くり返す of the source it was found in (null when not known).
// (the lines are there only with a line, and the pattern takes any line)
function diagnosticLineEnclosed(diagnostic: DiagnosticLike | null | undefined, source: string | null | undefined) {
  const lines = typeof source === 'string' && diagnostic?.line ? source.split('\n') : null, text = lines?.[diagnostic!.line! - 1];
  if (text === undefined) return null;
  const at = lines!.slice(0, diagnostic!.line! - 1).reduce((n, l) => n + l.length + 1, 0) + text.match(/^[ \u3000\t]*/)![0].length;
  try { return insertionContext(source!, at, at).depth > 0; } catch (_) { return null; }
}
// A scalar example must name an existing variable with its scope, independent of the current body's locals.
// Lists are not scalars. Without a variable the optional scalar example is left out.
function diagnosticExampleNames(work: Project | null | undefined) {
  const named=(x: { name?: unknown } | undefined)=>typeof x?.name==='string'&&x.name, data=work?.projectData?.variables?.find(named);
  let value=data?nameSource(data.name,'project'):null;
  if(!value){
    const owner=work?.components?.find(c=>c.localData?.variables?.some(named)),local=owner?.localData.variables.find(named);
    if(local){
      value=formatExpression(exprNode('ActorQualifiedRead',{actorRef:{kind:'named',name:owner!.name},value:exprNode('VariableRead',{name:local.name,qualifier:'self'})}));
    }
  }
  // The optional numeric comparison also needs an unqualified numeric premise; text, booleans and units differ.
  const numeric=(x: VariableData)=>named(x)&&typeof x.initialValue==='number'&&Number.isFinite(x.initialValue)&&!x.expectedUnit,
    // (a local is found only in an owner)
    number=work?.projectData?.variables?.find(numeric),owner=number?null:work?.components?.find(c=>c.localData?.variables?.some(numeric)),local=owner?.localData.variables.find(numeric),
    comparisonValue=number?'作品の'+nameSource(number.name,'exact'):local?formatExpression(exprNode('StringLiteral',{value:owner!.name}))+'の自分の'+nameSource(local.name,'exact'):null;
  return { value,comparisonValue,sound:work?.sounds?.find(named)?.name||null };
}
// Presentation only: parser/runtime diagnostics and their original messages stay unchanged. With the body's source,
// an indentation message names もし／くり返す only for a line inside one (F-24); the parser's Tab message is shown as it is.
// With the work, the examples name its own data and sounds.
export function childDiagnosticText(diagnostic: DiagnosticLike | null | undefined, source: string | null | undefined = null, work: Project | null | undefined = null): string {
  const message = String(diagnostic?.message || diagnostic || '書き方を たしかめて ください'), names = diagnosticExampleNames(work);
  // Phrase spacing changes presentation, not which diagnostic guidance applies.
  // Quoted user names are data, not diagnostic-family selectors. Keep the original message for display/details.
  // These families quote arbitrary source/data; its text must never select a different explanation.
  if (diagnostic?.code === 'S301' || /^「[\s\S]*」は 読めません。書き方を たしかめて ?ください。$/.test(message) || /^「[\s\S]*」という 文は あかりに ありません。/.test(message)) return message;
  let routingMessage = '', quoteDepth = 0;
  for (let i = 0; i < message.length; i++) {
    const char = message[i];
    if (char === '\\' && quoteDepth && i + 1 < message.length) { i++; continue; }
    if (char === '「') { if (!quoteDepth) routingMessage += '「」'; quoteDepth++; }
    else if (char === '」' && quoteDepth) quoteDepth--;
    else if (!quoteDepth) routingMessage += char;
  }
  const matches = (pattern: RegExp, text = routingMessage) => new RegExp(pattern.source.replace(/\s+/gu, ''), pattern.flags).test(text.replace(/\s+/gu, ''));
  if (diagnostic?.code === 'R403')
    return '計算の 答えが 大きすぎるなどの 理由で、あかりで 使える 数に なりませんでした。使う 数や 計算の しかたを たしかめて ください。';
  if (matches(/「」が 2つ つづいています/))
    return '「ではない」を 2つ つづける ときは、「条件（…）が成り立たない」で 書きます。れい：条件（1が2と同じではない）が成り立たない';
  if (matches(/を 2回 書いています|入れるものに 同じ 名前が/))
    return '入れて使う 数や 文字に、同じ 名前が 2つ いじょう あります。「入れるもの」の 名前は ちがう 名前に して ください。れい：点数を10として、';
  if (matches(/入れるものの 名前を たしかめてください/))
    return '入れて使う 数や 文字の 名前を 1つ 書きます。てじゅんや「答えを もとめる」の「入れるもの」と 同じ 名前に します。れい：点数を10として、';
  if (matches(/名前と 入れるものを「」で つないで 書きます/))
    return '名前と 入れるものを「を」で つなぎます。れい：点数を10として、';
  if (matches(/入れるものを（ ）で かこんでください/))
    return '入れて使う 数や 文字を（ ）で ひとまとめに します。れい：（10、「あかり」）';
  if (matches(/開く しるしと とじる しるしが 合っているか/))
    return '（ ）・［ ］・【 】の 開く しるしと とじる しるしを そろえます。れい：［1、2］';
  if (matches(/とじる しるしを 書いてください/))
    return '「 」・【 】・（ ）などの とじる しるしを 足します。れい：「こんにちは」';
  if (matches(/で つなぐ きまりを、1つずつ（ ）で かこんで|きまりを 1つずつ（ ）で かこんで 分けて/))
    return '「で、」「か、」で つなぐ 文の 中に「かつ」「または」は 書けません。ぜんぶを「条件（…）が成り立つ」で ひとまとめに します。れい：もし条件（1が1と同じかつ2が2と同じかつ3が3と同じ）が成り立つなら、';
  if (matches(/くらべる 2つの ものを（ ）か【 】で かこんで/)) {
    // The name is the one the child wrote before が (もし点数が…), else the work's own data.
    const line = typeof source === 'string' && diagnostic?.line ? source.split(/\r\n?|\n/)[diagnostic.line - 1] || '' : '',
      own = /^[ 　\t]*(?:もし)?([^\s　、。「」（）【】]+?)が/.exec(line)?.[1];
    const value = own ? nameSource(own,'exact') : names.comparisonValue;
    return 'くらべる 2つの ものの 名前を【 】で かこむと 分かれます。' + (value ? 'れい：' + value + 'が10より大きい' : '');
  }
  if (matches(/言う ことは/))
    return '話す 文字は「 」で かこみます。れい：「おはよう」と言う。' + (names.value ? 'へんすうの 中身を 話すときは「' + names.value + 'を言う」のように 書きます。' : '');
  if (matches(/そのまま 言う 文字か、入れた 音か/))
    return 'そのまま 話す 文字・鳴らす 音・へんすう・リストの 中身から えらびます。れい：' + ['「おはよう」と言う', names.sound && '「' + names.sound + '」を鳴らす', names.value && names.value + 'を言う'].filter(Boolean).join('／') + '。';
  if (matches(/重ねるときは、次の 行に 書いて/))
    return '「もし」「くり返す」の 中の 文は、次の 行に 書いて 行の はじめを 右へ ずらします。\nれい：2回くり返す。\n  2回くり返す。\n    「おはよう」と言う。';
  if (matches(/いちばん 外の 文は、行の はじめを 右へ ずらさずに/))
    return 'いちばん 外の 文は 行の 左から 書きます。行の はじめの 空白を けして ください。';
  if (matches(/などの 次の 行は、行の はじめを 右へ ずらして/))
    return '「作品を動かしたとき、」などの 次の 行は、はじめを 右へ ずらします。\nれい：作品を動かしたとき、\n  「おはよう」と言う。';
  if (matches(/同じ まとまりの 文は、行の はじめの 空白の 数を/))
    return diagnosticLineEnclosed(diagnostic, source) === false
      ? '前の 行と 同じ だけ 右へ ずらします。この 行の はじめの 空白を へらして ください。'
      : '同じ「もし」や「くり返す」の 中の 行は、はじめの 空白の 数を そろえます。れい：どちらも 空白を 2つ。';
  if (matches(/同じ 行と 次の 行の 両方に 書かないで/))
    return '中の 文を 同じ 行と 次の 行の 両方に 書いて います。次の 行に まとめ、行の はじめを 右へ ずらして ください。\nれい：2回くり返す。\n  「おはよう」と言う。';
  if (matches(/^「」は 書きません/))
    return '「ここまで」を けして、次の 文の はじめを 左へ もどします。\nれい：2回くり返す。\n  「中」と言う。\n「外」と言う。';
  if (matches(/と 組になる「」が ありません/)) {
    // Only a line that starts with そうでなければ／でなければ is about its もし (F-24). Another line that comes out of the
    // body (one not moved to the right) is told to move to the right, with the body's own heading (FM2-01).
    // (the lines are there only with a line)
    const lines = typeof source === 'string' && diagnostic?.line ? source.split(/\r\n?|\n/) : null,
      text = lines?.[diagnostic!.line! - 1]?.replace(/^[ 　\t]+/, '');
    if (text && !/^(?:そうでなければ|でなければ)/.test(text)) {
      const heading = lines![0] && /、$/.test(lines![0].trim()) && !/^[ 　\t]/.test(lines![0]) ? lines![0].trim() : '作品を動かしたとき、';
      return '「' + heading + '」の 中の 文は、上の 文と 同じ だけ 右へ ずらして 書きます。\nれい：' + heading + '\n  ' + splitComment(text).code.trim();
    }
    return '「そうでなければ、」は、組に なる「もし」と 行の はじめを そろえます。上に「もし」が あるか たしかめて ください。';
  }
  if (matches(/の 中では、動く・音を 出す・待つ|の 中では、この ブロックは 使えません/))
    return '「答えを もとめる」では、部品を 動かす・音を 出す・待つ などの やることは 使えません。これらは「てじゅん」へ 入れます。れい：1＋2を答えとして返す。';
  if (matches(/の 中からは、作品や 部品の へんすう・リストを かえられません/))
    return '「答えを もとめる」では、作品や 部品の へんすう・リストの 中身を かえられません。かえる やることは「てじゅん」へ 入れます。';
  if (matches(/「」と「」の 2つの 文に 分けます/))
    return '待ってから 動くときは、2つの 文に 分けます。\nれい：1秒待つ。\n前へ10歩進む。';
  // Only a 番目 read of what is no list (its own words, not the routing text: 「それぞれ」は リストに 使います and the other
  // 「…」は リスト… messages keep theirs).
  if (matches(/^「N番目」はリストに使います$|は リストでは ないので、何番目かを えらべません/, message)) {
    // The name the child wrote before 〜番目, when the line is known; no list of another work is named.
    const line = typeof source === 'string' && diagnostic?.line ? source.split(/\r\n?|\n/)[diagnostic.line - 1] || '' : '',
      name = /([^\s（）「」【】、。]+?)の(?:[0-9０-９]+|（[^）]*）)番目/.exec(line)?.[1];
    return (name ? '「' + name + '」は リストでは ないので、何番目かを えらべません。' : '') + '何番目かを えらべるのは、ならんだ ものを おぼえる リストです。';
  }
  const assetMessage = routingMessage;
  if (matches(/使われていない絵や音か、足りない絵や音/, assetMessage))
    return '作品で 使う 絵や音と、ほぞんする 絵や音の 組み合わせが 合って いません。理由は 下の くわしい せつめいに のこして います。「絵や音」の 画面で、使う 絵や音を たしかめて ください。';
  if (matches(/絵や音の中身を表す文字|同じしるし|絵や音の番号|使うはずの絵や音|同じ中身の絵や音|ではないものを使っています|絵や音「[^」]*」がありません|の種類が、正しく ありません|記録と合いません|記録とちがいます|絵や音の記録の形|使える大きさの外|あかりで使えない(?:形|種類)の|中身をたしかめるしるし|同じ絵や音が2つ以上|おまけの情報|ほぞんした音|ほぞんしたときと合いません/, assetMessage))
    return '絵や音の 中身を たしかめられませんでした。理由は 下の くわしい せつめいに のこして います。「絵や音」の 画面で、使う 絵や音を たしかめて ください。';
  return message;
}
export function diagnosticDetailText(diagnostic: DiagnosticLike | null | undefined, original: string | null = null): string {
  return original ?? [diagnostic?.code, diagnostic?.where || diagnostic?.key,
    diagnostic?.line ? diagnostic.line + '行目 / ' + (diagnostic.column || 1) + '文字目' : '',
    diagnostic?.message || String(diagnostic), diagnostic?.detail].filter(Boolean).join('\n');
}
export function appendDiagnosticDetails(root: Element, diagnostic: DiagnosticLike | null | undefined, original: string | null = null): HTMLDetailsElement {
  const details = document.createElement('details'), summary = document.createElement('summary'), text = document.createElement('pre');
  details.className = 'diagnostic-details';
  summary.textContent = '先生むけの くわしい せつめい';
  text.textContent = diagnosticDetailText(diagnostic, original);
  details.append(summary, text); root.append(details); return details;
}
