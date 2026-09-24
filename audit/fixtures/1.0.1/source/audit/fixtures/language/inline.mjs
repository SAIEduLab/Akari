// Finite approved grammar combinations, independent of product output.
export const inlineCases = [];
for (const lead of ['', 'もし ']) for (const ending of ['なら', 'ならば'])
for (const truth of ['真', '偽']) for (const period of ['', '。'])
for (const otherwise of ['そうでなければ', 'でなければ'])
for (const thenStyle of ['inline', 'short', 'long']) for (const elseStyle of ['inline', 'short', 'long']) {
  const branch = (head, body, style) => head + (style === 'inline' ? '、' + body + period
    : (style === 'long' ? '、次のことをする' : '') + period + '\n  ' + body + period);
  inlineCases.push({id:`A10-INLINE/${lead ? 'explicit' : 'omitted'}/${ending}/${truth}/${period ? 'period' : 'bare'}/${otherwise}/${thenStyle}/${elseStyle}`,
    source:branch(lead + truth + ending, '3を点数に加える', thenStyle) + '\n' + branch(otherwise, '2を点数から引く', elseStyle),
    canonical:`もし ${truth}なら、次のことをする\n  点数に3を足す\nそうでなければ、次のことをする\n  点数から2を引く`,
    value:truth === '真' ? 8 : 3});
}
export const inlineNegative = [
  ['missing-comma','もし 真なら何もしない'],
  ['two-statements','もし 真なら、何もしない。何もしない。'],
  ['same-line-else','もし 真なら、何もしない。でなければ、何もしない'],
  ['nested-inline','もし 真なら、もし 真なら、何もしない'],
  ['inline-repeat','もし 真なら、3回くり返す\n  何もしない'],
  ['comment-only','もし 真なら、※ 本文なし'],
  ['mixed-then','もし 真なら、何もしない\n  何もしない'],
  ['mixed-else','もし 真なら、何もしない\nでなければ、何もしない\n  何もしない'],
  ['orphan','でなければ、何もしない'],
  ['duplicate','もし 真なら、何もしない\nでなければ、何もしない\nでなければ、何もしない'],
  ['intervening','もし 真なら、何もしない\n何もしない\nでなければ、何もしない'],
  ['wrong-indent','もし 真なら、何もしない\n  でなければ、何もしない'],
  ['empty-condition','もし なら、何もしない'],
  ['empty-body','真なら、'],
  ['inline-header','真なら、でなければ'],
];
