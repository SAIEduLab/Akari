// Finite approved grammar combinations, independent of product output.
export const inlineCases = [];
for (const lead of ['', 'もし ']) for (const ending of ['なら', 'ならば'])
for (const truth of ['真', '偽']) for (const period of ['', '。'])
for (const otherwise of ['そうでなければ', 'でなければ'])
for (const thenStyle of ['inline', 'short', 'long']) for (const elseStyle of ['inline', 'short', 'long']) {
  const condition = `条件（条件の答え（${truth === '真' ? 'あてはまる' : 'あてはまらない'}））が成り立つ`;
  const branch = (head, body, style) => head + (style === 'inline' ? '、' + body + period
    : (style === 'long' ? '、次のことをする' : '') + period + '\n  ' + body + period);
  inlineCases.push({id:`RELEASE-INLINE/${lead ? 'explicit' : 'omitted'}/${ending}/${truth}/${period ? 'period' : 'bare'}/${otherwise}/${thenStyle}/${elseStyle}`,
    source:branch(lead + condition + ending, '3を点数に加える', thenStyle) + '\n' + branch(otherwise, '2を点数から引く', elseStyle),
    canonical:`もし ${condition}なら、次のことをする\n  点数に3を足す\nそうでなければ、次のことをする\n  点数から2を引く`,
    value:truth === '真' ? 8 : 3});
}
export const inlineNegative = [
  ['missing-comma','もし 条件（条件の答え（あてはまる））が成り立つなら何もしない'],
  ['two-statements','もし 条件（条件の答え（あてはまる））が成り立つなら、何もしない何もしない。'],
  ['same-line-else','もし 条件（条件の答え（あてはまる））が成り立つなら、何もしないでなければ、何もしない'],
  ['nested-inline','もし 条件（条件の答え（あてはまる））が成り立つなら、もし 条件（条件の答え（あてはまる））が成り立つなら、何もしない'],
  ['inline-repeat','もし 条件（条件の答え（あてはまる））が成り立つなら、3回くり返す\n  何もしない'],
  ['comment-only','もし 条件（条件の答え（あてはまる））が成り立つなら、※ 本文なし'],
  ['mixed-then','もし 条件（条件の答え（あてはまる））が成り立つなら、何もしない\n  何もしない'],
  ['mixed-else','もし 条件（条件の答え（あてはまる））が成り立つなら、何もしない\nでなければ、何もしない\n  何もしない'],
  ['orphan','でなければ、何もしない'],
  ['duplicate','もし 条件（条件の答え（あてはまる））が成り立つなら、何もしない\nでなければ、何もしない\nでなければ、何もしない'],
  ['intervening','もし 条件（条件の答え（あてはまる））が成り立つなら、何もしない\n何もしない\nでなければ、何もしない'],
  ['wrong-indent','もし 条件（条件の答え（あてはまる））が成り立つなら、何もしない\n  でなければ、何もしない'],
  ['empty-condition','もし なら、何もしない'],
  ['empty-body','条件（条件の答え（あてはまる））が成り立つなら、'],
  ['inline-header','条件（条件の答え（あてはまる））が成り立つなら、でなければ'],
];
