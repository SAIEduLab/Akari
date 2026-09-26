// Reviewed finite surface cases. These are audit inputs, never product grammar.
export const cases = [];
const add = (id, key, source, canonical, extra = {}) => cases.push({
  id: `JPF-${String(id).padStart(3, '0')}`, key, source, canonical,
  phase: 2, ...extra,
});
const body = '\n  何もしない';
const stdIf = 'もし 点数が10以上なら、次のことをする';
add(1, 'punctuation', '何もしない。', '何もしない');
add(1, 'no-punctuation', '何もしない', '何もしない');
for (const word of ['くり返す', '繰り返す']) {
  add(2, word, `次のことを2回${word}${body}`, `次のことを2回くり返す${body}`);
  for (const [id, head] of [[9, '2回'], [9, '2回だけ'], [10, '2回、次のことを'], [11, 'ずっと']])
    add(id, head + word, `${head}${word}${body}`, `${id === 11 ? '次のことをずっと' : '次のことを2回'}くり返す${body}`);
  add(28, word, `名前一覧の各要素を項目として${word}${body}`, `名前一覧の各要素を項目として、次のことをくり返す${body}`);
}
for (const lead of ['もし ', '']) for (const end of ['なら', 'ならば']) for (const tail of ['、次のことをする', '', '、']) {
  const id = !lead ? 4 : tail === '、次のことをする' ? 3 : 5;
  add(id, [lead || 'omitted', end, tail || 'short'].join('/'), `${lead}点数が10以上${end}${tail}${body}`, stdIf + body,
    !lead && tail !== '、次のことをする' ? {transition: 'indent-reject-12'} : {});
}
add(6, 'inline-if', 'もし 点数が10以上なら、「合格」と言う', stdIf + '\n  「合格」と言う', {phase: 3});
for (const lead of ['そうでなければ', 'でなければ']) {
  for (const tail of ['', '、', '、次のことをする'])
    add(lead === 'でなければ' ? 29 : 7, lead + tail, stdIf + body + '\n' + lead + tail + body,
      stdIf + body + '\nそうでなければ、次のことをする' + body);
  add(lead === 'でなければ' ? 29 : 8, lead + '/inline', stdIf + body + '\n' + lead + '、「残念」と言う',
    stdIf + body + '\nそうでなければ、次のことをする\n  「残念」と言う', {phase: 3});
}
for (const word of ['あいだ', '間']) for (const repeat of ['くり返す', '繰り返す'])
  add(12, word + repeat, `点数が10より小さい${word}、次のことを${repeat}${body}`, `点数が10より小さいあいだ、次のことをくり返す${body}`);
for (const [id, ends, canonical] of [
  [13, ['未満'], 'より小さい'], [14, ['を超える', 'を超えている'], 'より大きい'],
  [15, ['と等しい'], 'と同じ'], [16, ['と異なる', 'と等しくない'], 'と違う'],
]) for (const end of ends) add(id, end, `点数が10${end}と言う`, `点数が10${canonical}と言う`);
for (const [id, forms, canonical] of [
  [17, ['点数に3を加える'], '点数に3を足す'],
  [18, ['点数を3増やす', '点数を3だけ増やす'], '点数に3を足す'],
  [19, ['点数を3減らす', '点数を3だけ減らす'], '点数から3を引く'],
  [22, ['名前一覧の末尾に3を追加する'], '名前一覧に3を追加する'],
  [23, ['名前一覧から1番目を削除する'], '名前一覧の1番目を削除する'],
  [24, ['名前一覧のすべての要素を削除する'], '名前一覧を空にする'],
  [25, ['0秒間待つ'], '0秒待つ'], [26, ['「名前は？」と尋ねる'], '「名前は？」とたずねる'],
  [27, ['「こんにちは」という'], '「こんにちは」と言う'],
  [30, ['名前一覧のすべてを削除する'], '名前一覧を空にする'],
  [31, ['「名前は？」と聞いて待つ'], '「名前は？」とたずねる'],
  [32, ['点数に3を代入する', '3を点数に代入する'], '点数を3にする'],
  [34, ['点数から3を引く', '3を点数から引く'], '点数から3を引く'],
  [36, ['名前一覧の1番目に3を挿入する', '3を名前一覧の1番目に挿入する'], '名前一覧の1番目に3を挿入する'],
  [37, ['「入力欄」に「値」を入れる', '「値」を「入力欄」に入れる'], '「入力欄」に「値」を入れる'],
]) for (const source of forms) add(id, source, source, canonical);
for (const verb of ['足す', '加える']) for (const order of ['target-first', 'value-first'])
  add(33, order + verb, (order === 'target-first' ? '点数に3を' : '3を点数に') + verb, '点数に3を足す');
for (const end of ['に', 'の末尾に']) for (const order of ['target-first', 'value-first'])
  add(35, order + end, (order === 'target-first' ? `名前一覧${end}3を` : `3を名前一覧${end}`) + '追加する', '名前一覧に3を追加する');
for (const direction of ['右', '左']) for (const order of ['direction-first', 'angle-first'])
  add(38, order + direction, (order === 'direction-first' ? `${direction}に15度` : `15度${direction}に`) + '回る', `${direction}に15度回る`);
for (const pair of ['横100、縦50', '縦50、横100']) {
  for (const particle of ['へ', 'に'])
    add(pair.startsWith('横') ? 20 : 39, pair + particle, `${pair}の位置${particle}行く`, '横100、縦50の位置へ行く');
  for (const verb of ['滑る', 'すべる']) {
    add(21, pair + verb, `0秒で${pair}の位置へ${verb}`, '0秒で横100、縦50の位置へ滑る');
    for (const comma of ['', '、']) add(40, pair + verb + (comma || 'no-comma'), `${pair}の位置へ${comma}0秒で${verb}`, '0秒で横100、縦50の位置へ滑る');
  }
}
for (const wait of [false, true]) for (const order of ['frequency-first', 'time-first']) {
  const tail = wait ? '鳴らし、終わるまで待つ' : '鳴らす';
  add(41, order + '/' + wait, (order === 'frequency-first' ? '440Hzの音を0.2秒' : '0.2秒、440Hzの音を') + tail, '440Hzの音を0.2秒' + tail);
}
for (const op of ['大きい', '小さい']) add(42, op, `10より点数が${op}と言う`, `点数が10より${op}と言う`);
export const connections = [];
for (const [id, forms, canonical] of [
  [13, ['点数が10未満の', '点数が10未満である'], '点数が10より小さい'],
  [14, ['点数が10を超えている'], '点数が10より大きい'],
  [15, ['点数が10と等しい'], '点数が10と同じである'],
  [16, ['点数が10と異なる'], '点数が10と違う'],
]) for (const form of forms) for (const period of ['あいだ', '間']) for (const repeat of ['くり返す', '繰り返す']) {
  add(id, form + period + repeat, `${form}${period}、次のことを${repeat}${body}`, `${canonical}あいだ、次のことをくり返す${body}`);
}
for (const [id, form, canonical] of [[13, '点数が10未満になる', '点数が10より小さくなる'], [14, '点数が10を超える', '点数が10より大きくなる'], [15, '点数が10と等しくなる', '点数が10と同じになる']]) {
  add(id, form + '/wait', form + 'まで待つ', canonical + 'まで待つ');
  for (const repeat of ['くり返す', '繰り返す']) add(id, form + repeat, form + `まで、次のことを${repeat}${body}`, canonical + `まで、次のことをくり返す${body}`);
}
// Every finite case also exercises sentence punctuation, without altering quoted text.
export const finiteCases = cases.flatMap(c => c.id === 'JPF-001' ? [c] : [c, {...c, key: c.key + '/period', source: c.source.split('\n').map(s => s + '。').join('\n')}]);
