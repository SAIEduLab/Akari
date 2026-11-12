import { AkariError, compactOutsideString } from './02-language-contracts.ts';
import { NAME_BRACKET_MESSAGE, dataNameKind, replaceUnprotectedWord } from './04-syntax-expressions.ts';
import { surfaceMask, writtenSentence } from './04-syntax-scripts.ts';
import { readMeijinSentence } from './04-meijin-syntax.ts';
import type { Symbols } from '../types/compiled.d.ts';
import type { LineLike, ParseContext, SourcePart } from '../types/parse.d.ts';
import type { Statement } from '../types/syntax.d.ts';
import { EVERYONE_WORDS, LEAD_WORDS, MOVE_VERBS, SENTENCE_TE_FORMS, canonicalStatementSource, parseSentenceSequenceAsWritten, sentenceDiagnostic, sentenceInfinitive, surfaceCapture, surfaceColumn, surfaceLineSlice, surfaceOwnRow, surfaceRow } from './04-syntax-sentences.ts';

// Natural spellings a child writes, rewritten to the form the code writes (outside 「」 and 【】). Used only after the
// sentence as written fails, so a sentence that reads keeps its meaning.
export function naturalSentenceVariants(code: string, symbols: Symbols | null | undefined) {
  const out: string[] = [];
  const add = (text: string) => { if (text && text !== code && !out.includes(text)) out.push(text); };
  const word = replaceUnprotectedWord;
  const whole = (text: string, pattern: RegExp, build: (parts: string[]) => string) => { const parts = surfaceCapture<(SourcePart | null)[]>(pattern, text); return parts ? build(parts.map(p => p ? p.text : '')) : text; };
  const normalize = (text: string) => {
    text = text.replace(new RegExp('^(?:'+LEAD_WORDS+')、'), '');
    // かな書きの動詞 → the written verb
    for (const [from, to] of [['かくれる', '隠れる'], ['あらわれる', '現れる'], ['ペンをおろす', 'ペンを下ろす'], ['ペンをあげる', 'ペンを上げる'],
      ['ならし始める', '鳴らし始める'], ['ならして', '鳴らして'], ['をならす', 'を鳴らす'], ['をつくる', 'を作る'], ['をおくる', 'を送る'], ['をおくって', 'を送って']])
      text = word(text, from, to);
    // 連用中止（〜し、） → 〜して、
    for (const [from, to] of [['進み、', '進んで、'], ['動き、', '動いて、'], ['回り、', '回って、'], ['待ち、', '待って、'], ['言い、', '言って、'], ['話し、', '話して、'],
      ['鳴らし、', '鳴らして、'], ['かくし、', 'かくして、'], ['見せ、', '見せて、'], ['消し、', '消して、'], ['けし、', 'けして、'], ['入れ、', '入れて、'],
      ['足し、', '足して、'], ['引き、', '引いて、'], ['すべり、', 'すべって、'], ['増やし、', '増やして、'], ['減らし、', '減らして、'], ['止め、', '止めて、'],
      ['作り、', '作って、'], ['送り、', '送って、'], ['下ろし、', '下ろして、'], ['上げ、', '上げて、'], ['向き、', '向いて、'], ['行き、', '行って、'], ['にし、', 'にして、'], ['かえ、', 'かえて、'],
      ['すすみ、', '進んで、'], ['まわり、', '回って、'], ['ふやし、', '増やして、'], ['へらし、', '減らして、'], ['まち、', '待って、'], ['おろし、', '下ろして、'],
      ['ならし、', '鳴らして、'], ['つくり、', '作って、'], ['いい、', '言って、'], ['むき、', '向いて、'], ['いれ、', '入れて、'], ['おくり、', '送って、'],
      ['とめ、', '止めて、'], ['あげ、', '上げて、'], ['うごき、', '動いて、'], ['歩き、', '歩いて、'], ['あるき、', 'あるいて、'],
      ['へいき、', 'へ行って、'], ['にいき、', 'に行って、'], ['下がり、', '下がって、'], ['さがり、', '下がって、']])
      text = word(text, from, to);
    // 〜て with no 、 before the next action
    for (const te of ['鳴らし始めて', '鳴らして', '進んで', 'すすんで', '動いて', 'うごいて', '歩いて', 'あるいて', '回って', 'まわって', '向いて', '待って', '言って', '話して',
      'かくして', '見せて', '消して', 'けして', '入れて', '足して', '引いて', '変えて', 'かえて', 'すべって', '滑って',
      '増やして', '減らして', '止めて', '作って', '送って', '上げて', '下ろして', 'にして', '行って', 'たずねて', 'はね返って', '追加して', '削除して', '挿入して']) {
      if (!text.includes(te)) continue;
      const mask = surfaceMask(text);
      let result = '', at = 0, i: number;
      while ((i = mask.indexOf(te, at)) >= 0) {
        const end = i + te.length;
        result += text.slice(at, end) + (end < text.length && mask[end] !== '、' ? '、' : '');
        at = end;
      }
      text = result + text.slice(at);
    }
    // "こんにちは" (ASCII or curly quotes) is 「こんにちは」; a closing ！．. is 。
    text = text.replace(/"([^"\n]*)"/g, '「$1」').replace(/“([^”\n]*)”/g, '「$1」');
    if (/[！!？?．.]+$/.test(surfaceMask(text) || '')) text = text.replace(/[！!？?．.]+$/, '');
    // すがたをけす is すがたをかくす
    text = whole(text, /^((?:[^、。]+?は、?)?)(?:すがた|姿)を(?:けす|消す)$/d, ([s]) => s + 'すがたをかくす');
    // ねこに向かって10歩進む is ねこの方を向いて、10歩進む
    text = whole(text, /^((?:[^、。]+?は、?)?)([^、。]+?)に(?:向かって|むかって)、?(.+(?:進む|すすむ|動く|うごく|歩く|あるく))$/d, ([s, t, rest]) => s + t + 'の方を向いて、' + rest);
    // 名前一覧の最初に「a」を入れる is the 1番目
    text = whole(text, /^(.+?)の(?:最初|はじめ|先頭|いちばん前)に(.+)を(?:入れる|いれる)$/d, ([l, v]) => l + 'の1番目に' + v + 'を入れる');
    text = whole(text, /^(.+)と(?:聞く|きく|聞きます|ききます)$/d, ([q]) => q + 'とたずねる');
    text = whole(text, /^(.+)と(?:聞いて|きいて)、?(?:答え|返事)を待つ$/d, ([q]) => q + 'とたずねて、答えを待つ');
    text = word(text, 'という合図を送る', 'の合図を送る');
    text = word(text, 'という合図を送って、', 'の合図を送って、');
    // つぎの／まえの すがた・はいけい, こたえ／まつ (kana spellings, F-20)
    for (const [from, to] of [['つぎのすがた', '次のすがた'], ['つぎのはいけい', '次のはいけい'], ['まえのすがた', '前のすがた'], ['まえのはいけい', '前のはいけい'],
      ['こたえをまつ', '答えを待つ'], ['答えをまつ', '答えを待つ'], ['こたえを待つ', '答えを待つ']]) text = word(text, from, to);
    // 画面の端に触れていれば、跳ね返る / もし画面のはしにふれているなら、はね返る / はね返る (alone: it bounces only at the edge)
    // are the one bounce sentence. ふれたら・ふれると・ふれれば・ふれていたら are not read (diagnoseSentenceIntent).
    text = whole(text, /^((?:[^、。]+?[はが]、?)?)(?:もし、?)?画面の(?:はし|端)に(?:ふれ|触れ)(?:ていれば|ているなら)、?(?:はね返る|跳ね返る)$/d, ([s]) => s + '画面のはしにふれていれば、はね返る');
    text = whole(text, /^((?:[^、。]+?[はが]、?)?)(?:はね返る|跳ね返る|はねかえる)$/d, ([s]) => s + '画面のはしにふれていれば、はね返る');
    // コピーを作る with no owner is 自分のコピー.
    text = whole(text, /^((?:[^、。]+?は、?)?)コピーを((?:.+?)(?:つ|個|体))?(?:作る|つくる)$/d, ([s, n]) => s + '自分のコピーを' + (n || '') + '作る');
    text = whole(text, /^((?:[^、。]+?は、?)?)このコピーを(?:消す|けす)$/d, ([s]) => s + 'このコピーだけを消す');
    // 点数を1つ増やす / 点数を2こ増やす: つ and こ count (2個 keeps its unit 個).
    text = whole(text, /^(.+?)を([0-9０-９]+)(?:つ|こ)?(?:ずつ)?(増やす|ふやす|減らす|へらす)$/d, ([t, n, v]) => t + 'を' + n + v);

    text = whole(text, /^(.+)の中身をすべて(?:消す|けす)$/d, ([l]) => l + 'の中身を全部消す');
    // かな書きの動詞 at the end
    for (const [from, to] of [['歩すすむ', '歩進む'], ['度まわる', '度回る'], ['ふやす', '増やす'], ['へらす', '減らす']]) if (surfaceMask(text).endsWith(from)) text = text.slice(0, -from.length) + to;
    text = whole(text, /^(.+?)の音を(鳴らす|鳴らし始める)$/d, ([n, v]) => n + 'を' + v);
    return text;
  };
  // です・ます are read by the polite table in readRoleStatement. Together with another natural spelling
  // (10歩すすみます, 後ろへ10歩下がります) the plain verb is tried here.
  if (/ます$/.test(surfaceMask(code)))
    for (const [from, to] of [['します', 'す'], ['します', 'する'], ['きます', 'く'], ['ちます', 'つ'], ['みます', 'む'], ['ります', 'る'], ['います', 'う'], ['ます', 'る']]) {
      if (!surfaceMask(code).endsWith(from)) continue;
      const plain = code.slice(0, -from.length) + to, natural = normalize(plain);
      if (natural !== plain) add(natural);
    }
  {
    const plain = normalize(code);
    add(plain);
    // にする and にかえる are the same action in every 〜を…に sentence.
    if (surfaceMask(plain).endsWith('にする')) add(plain.slice(0, -'する'.length) + 'かえる');
    else if (/に(?:かえる|変える)$/.test(surfaceMask(plain))) add(plain.slice(0, -'かえる'.length) + 'する');
  }
  return out;
}
// Natural spellings that do not read as written are tried in the form the code writes (see naturalSentenceVariants).
// Scan the final letter run once; retrying every numeric/て/で suffix makes malformed long lines quadratic.
function unknownSentenceVerb(code: string): [string | null, string] | RegExpExecArray | null {
  if (!/[るうくすつむぶぐ]/u.test(code.at(-1) || '')) return null;
  const chars = Array.from(code), letter = (c: string) => /[\p{L}ー]/u.test(c), numeric = (c: string) => /[0-9０-９.．]/u.test(c);
  let start = chars.length;
  while (start > 0 && letter(chars[start - 1])) start--;
  const tail = chars.slice(start);
  if (start === 0) return tail.length >= 2 ? [null, code] : null;
  let numberStart = start;
  while (numberStart > 0 && numeric(chars[numberStart - 1])) numberStart--;
  if (numberStart < start) {
    const matched = /^[0-9０-９.．]+(?:歩|度|秒|個|点|番目)?(?:に|へ|を|だけ|間)?([\p{L}ー]+(?:する|る|う|く|す|つ|む|ぶ|ぐ))$/u.exec(chars.slice(numberStart).join(''));
    if (matched) return matched;
  }
  if (tail.length >= 2 && chars[start - 1] === '、' && ['て', 'で'].includes(chars[start - 2])) return [null, tail.join('')];
  const connector = tail.findIndex(c => c === 'て' || c === 'で');
  return connector >= 0 && tail.length - connector - 1 >= 2 ? [null, tail.slice(connector + 1).join('')] : null;
}
export function parseSentenceSequence(line: LineLike,symbols: Symbols | null | undefined,ctx: ParseContext): Statement[] {
  // 名人: もし…なら、主役は… — a sentence inside a line is read as 名人 first.
  if(ctx.meijin){const read=readMeijinSentence(line,symbols,ctx);if(read)return read;}
  try { return parseSentenceSequenceAsWritten(line,symbols,ctx); }
  catch (error) {
    if (!(error instanceof AkariError) || ctx.naturalVariant) throw error;
    const code = compactOutsideString(line.code);
    // A mistake the text written again finds after the first 、 (its first clause read: 10歩進み、点数を（1＋）…) is the one
    // to tell, at its place: the text as written did not read the first clause, so its message is not about the mistake.
    const comma = line.mapped ? surfaceMask(line.mapped.text).indexOf('、') : -1, commaAt = comma >= 0 ? line.mapped?.positions[comma] : undefined, base = line.physicalStart ?? line.start;
    // (the comma's line: a part of a line already cut from one that goes on over lines counts from its own line)
    const commaLine = typeof commaAt === 'number' && typeof base === 'number' ? line.lineNo + surfaceRow(line, commaAt - base) - surfaceOwnRow(line) : 0;
    // (a mistake told at the start of a line names no place in it: whether a 「 」 before it goes on over lines or not, it
    // is not found after the comma)
    const pastComma = (e: InstanceType<typeof AkariError>) => typeof commaAt === 'number' && typeof base === 'number' && !!e.line && (e.column || 0) > 1 &&
      (e.line > commaLine || (e.line === commaLine && (e.column || 0) > surfaceColumn(line, commaAt - base) + 1));
    let later: InstanceType<typeof AkariError> | null = null;
    for (const variant of naturalSentenceVariants(code, symbols)) {
      const part = surfaceLineSlice(line, 0, code.length, variant);
      part.comment = line.comment; part.inline = line.inline;
      try { return parseSentenceSequenceAsWritten(part, symbols, { ...ctx, naturalVariant: true }); }
      catch (attempt) { if (!(attempt instanceof AkariError)) throw attempt; if (!later && pastComma(attempt)) later = attempt; }
    }
    if (later) throw later;
    const who = surfaceCapture(/^([^、。「」『』【】（）]+?)が(.+)$/d, code);
    if (who && !['自分', ...EVERYONE_WORDS].includes(who[0].text) && !dataNameKind(who[0].text, symbols, ctx) && !symbols?.project?.components?.some(c => c.name === who[0].text)) {
      let reads = false;
      try { const part = surfaceLineSlice(line, 0, code.length, who[0].text + 'は' + who[1].text); part.comment = line.comment; parseSentenceSequenceAsWritten(part, symbols, { ...ctx, naturalVariant: true }); reads = true; }
      catch (attempt) { if (!(attempt instanceof AkariError)) throw attempt; }
      if (reads) throw new AkariError('P205', `「${who[0].text}」という キャラクターや 部品が 見つかりません。名前を たしかめて ください`, line.lineNo, 1);
    }
    // unreadName: the sentence began with a word that is no bare name (1秒休む), so the verb after it is looked at.
    const nameMessage = error.message === NAME_BRACKET_MESSAGE || !!error.unreadName;
    // 10歩進んでください / 10歩進め / 10歩進もう / 進んでね: a request or a call is written as 「進む」, also when the
    // whole sentence is not read (F-26).
    if (nameMessage || (error.code === 'P201' && !error.proposals?.length && /^「[\s\S]+」は 読めません。書き方を たしかめて ?ください。$/.test(error.message))) {
      const readsAs = (text: string) => { try { const part = surfaceLineSlice(line, 0, code.length, text); part.comment = line.comment; return !!parseSentenceSequence(part, symbols, { ...ctx, naturalVariant: true }); } catch (attempt) { if (!(attempt instanceof AkariError)) throw attempt; return false; } };
      const mask = surfaceMask(code), stem = (text: string) => sentenceInfinitive(text);
      const forms: string[] = [];
      const polite = /(?:て|で)(?:ください|くださいね|ね|よ)$/.exec(mask);
      if (polite) forms.push(stem(code.slice(0, polite.index + 1)));
      const call: { readonly [last: string]: string | undefined } = { め: 'む', れ: 'る', け: 'く', て: 'つ', え: 'う', せ: 'す', げ: 'ぐ', べ: 'ぶ', ね: 'ぬ' }, will: { readonly [last2: string]: string | undefined } = { もう: 'む', ろう: 'る', こう: 'く', とう: 'つ', おう: 'う', そう: 'す', ごう: 'ぐ', ぼう: 'ぶ' };
      const last = mask.slice(-1), last2 = mask.slice(-2);
      if (will[last2]) forms.push(code.slice(0, -2) + will[last2]);
      if (/よう$/.test(mask)) forms.push(code.slice(0, -2) + 'る', code.slice(0, -3) + 'する');
      if (/ろ$/.test(mask)) forms.push(code.slice(0, -1) + 'る');
      if (call[last]) forms.push(code.slice(0, -1) + call[last]);
      const plain = forms.find(text => text && text !== code && readsAs(text));
      if (plain) throw sentenceDiagnostic(`お願いや よびかけの 形（〜てください・〜め・〜よう）では 書きません。「${canonicalStatementSource(plain, symbols)}」のように 書きます`, line, [{ label: 'ふつうの 形に する', source: canonicalStatementSource(plain, symbols) }], { kind: 'Sequence' });
    }
    // 10歩下がる / 1秒休む / 1回転する: a word Akari does not have, after a number.
    const unknown = unknownSentenceVerb(code);
    // A verb of あかり (3回、前へ10歩進む / 3回、右に90度回る) is not said to be missing, and the words before it are no
    // name to put in 【 】: the sentence around the verb is what does not read.
    const known = unknown && (Object.values(MOVE_VERBS).some(verbs => verbs.includes(unknown[1])) || SENTENCE_TE_FORMS.some(([, verb]) => verb === unknown[1]));
    if (nameMessage && known && !dataNameKind(unknown[1], symbols, ctx))
      throw new AkariError('P201', `「${line.code}」は 読めません。書き方を たしかめて ください。`, line.lineNo, 1);
    // The word quoted is a whole word (F-26, FM2-05): a piece that begins inside a word (ずつ進む, どまわる, 倍にする,
    // の速さで…) is not quoted; the sentence as written is.
    const whole = unknown && !/^(?:こ|つ|まい|ひき|ほん|ばん|かい)/.test(unknown[1]) && /^(?:[\p{Script=Han}]|(?![ずどのにへをでがとだ])[\p{Script=Hiragana}ー])[^のにへをでが]*$/u.test(unknown[1]);
    if (nameMessage && unknown && !known && !dataNameKind(unknown[1], symbols, ctx))
      throw new AkariError('P205', `「${whole ? unknown[1] : writtenSentence(line)}」という 文は あかりに ありません。「書ける ことば」から 近い 文を えらんで ください`, line.lineNo, 1);
    throw error;
  }
}
