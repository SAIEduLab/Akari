  // ────────────────────────────────────────────────────────────────────────
  // 04 — 名人 syntax: natural sentences read only in 名人 scripts
  // ────────────────────────────────────────────────────────────────────────
  // A 名人 script belongs to no part; its writer moves the parts. A line is read here before the common grammar:
  // into the 名人 nodes (PartRef, value subjects, Parallel, ParallelEach, part sets), or as the common sentence
  // with the same meaning. A line that is no 名人 form is read by the common grammar unchanged.
  const MEIJIN_BINDER = 'この部品';
  const MEIJIN_SET_WORDS = /^(みんな|それぞれ|順番に|じゅんばんに)、?/;
  const meijinEscape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // The 名人 forms below read a name written in 【 】 as the same name: the mask shows those spans, and the name is
  // looked up without them.
  const meijinBare = text => text.replace(/^【(.*)】$/, '$1');
  // The looks a 名人 sentence changes as 〜の…を…にする (ねこの大きさを120％にする).
  const MEIJIN_LOOK_WORDS = Object.freeze(['ペンの太さ', 'ペンの色', '音の大きさ', '音の高さ', 'よこのばしょ', 'たてのばしょ', '表示色', '大きさ', 'すがた', '向き', '色']);
  function meijinNameMask(text) {
    const mask = surfaceMask(text).split('');
    for (const m of text.matchAll(/【[^】]*】/g)) for (let i = m.index; i < m.index + m[0].length; i++) mask[i] = text[i];
    return mask.join('');
  }
  function meijinPartNames(symbols) {
    return [...new Set((symbols?.project?.components || []).map(c => c.name))].sort((a, b) => b.length - a.length);
  }
  // A name that is a part and no data name reads as the part itself (written bare or in 【 】).
  function isMeijinPart(name, symbols, ctx = {}) {
    const bare = meijinBare(name || '');
    return !!bare && (symbols?.project?.components || []).some(c => c.name === bare) && !dataNameKind(bare, symbols, ctx);
  }
  const meijinListName = (name, symbols, ctx = {}) => dataNameKind(meijinBare(name), symbols, ctx) === 'list';
  const meijinVariableName = (name, symbols, ctx = {}) =>
    dataNameKind(meijinBare(name), symbols, ctx) === 'variable' || (ctx.args || []).includes(meijinBare(name));
  // A data name in 【 】 (【いとこ】) is read without them, as a part name is.
  const meijinVariableRead = name => exprNode('VariableRead', { name: meijinBare(name), qualifier: null });
  // ねこと犬と鳥 / ねこ、犬、鳥 / ねこや犬: two or more parts written together.
  function meijinPartList(text, symbols, ctx) {
    // A name in 【 】 is one name, whatever it holds (【とり】).
    const names = [];
    let at = 0;
    for (const m of text.matchAll(/【[^】]*】|と|、/g)) if (!m[0].startsWith('【')) { names.push(text.slice(at, m.index)); at = m.index + m[0].length; }
    names.push(text.slice(at));
    return names.length > 1 && names.every(name => isMeijinPart(name, symbols, ctx)) ? names : null;
  }
  // A variable holds one value; a set of parts is kept in a list (as a list holds any row of values).
  const meijinSetIntoVariable = name => `「${name}」は へんすうなので、部品を 一つだけ 入れられます。いくつかの 部品の あつまりは、リストに 入れます`;
  const meijinPartRef = name => exprNode('PartRef', { name: meijinBare(name) });
  const meijinValueActor = value => ({ kind: 'value', value });
  const meijinBinderRead = () => exprNode('VariableRead', { name: MEIJIN_BINDER, qualifier: null });
  // A copy removes itself with 消える (the same as このコピーだけを消す).
  const meijinBody = text => text.replace(/(?:消える|きえる)$/, 'このコピーだけを消す');
  // ねこといぬは… / ねこもいぬも…: the subject words as written, for a fix that rewrites the rest of the sentence
  // (the notice of B-17 keeps them).
  const MEIJIN_GROUP_SUBJECTS = new WeakMap();
  // ねこと犬と鳥は、順番に、…: the parts of such a sentence (they start together; 作品チェック tells the child).
  const MEIJIN_LISTED_IN_ORDER = new WeakMap();
  const meijinGroup = (parallel, subject) => { MEIJIN_GROUP_SUBJECTS.set(parallel, subject); return parallel; };
  const MEIJIN_DATA_SUFFIXES = ['の数だけ', 'の値', 'の答え', 'の中身', 'の長さ', 'の文字数', 'の色', 'のどれか', 'の中で', 'の中に', 'のあまり', 'の余り'];
  const MEIJIN_DIRECTIONS = { 前: 'forward', 後ろ: 'backward', 右: 'right', 左: 'left', 上: 'up', 下: 'down' };
  // 十歩 → 10歩, 三百二十秒 → 320秒 (for the message only).
  function meijinDigits(text) {
    const unit = text.replace(/^[〇一二三四五六七八九十百千万]+/, ''), digits = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    let total = 0, part = 0, last = 0;
    for (const ch of text.slice(0, text.length - unit.length)) {
      if (ch in digits) { last = digits[ch]; continue; }
      const scale = { 十: 10, 百: 100, 千: 1000, 万: 10000 }[ch];
      if (scale === 10000) { total = (total + part + last) * scale; part = 0; } else part += (last || 1) * scale;
      last = 0;
    }
    return String(total + part + last) + unit;
  }
  // ねこがおされると、: an event, or waiting for it? Not one meaning in a 名人 script.
  const MEIJIN_WHEN_PRESSED = /^(?!もし)(?:.+?)(?:が(?:おされ|押され|クリックされ)ると|を(?:おす|押す|クリックする)と)、/;
  const MEIJIN_WHEN_PRESSED_MESSAGE = '「〜がおされると、」では、おされる たびに するのか、その 時を 待つのかが 決まりません。おされる たびに するなら「ねこがおされたとき、」、待つなら「ねこが1回おされるまで待つ。」と 書きます';
  const MEIJIN_UNREADABLE = [
    [MEIJIN_WHEN_PRESSED, MEIJIN_WHEN_PRESSED_MESSAGE],
    // ふれる is the one touch verb; もし〜ふれたら and 〜ふれると have more than one meaning (C-08, C-09, C-11).
    [/に(さわ|当た|あた|ぶつか)(?:っ|る|ら|れ|り)/, m => `「${m[1]}る」は「ふれる」と 書きます。れい：ねこが「星」にふれたとき、`],
    [/^もし、?(.+?)が(.+?)に(?:ふれ|触れ)(?:たら|ると|れば)、/d, (m, code) => { const [a, b] = [1, 2].map(i => code.slice(...m.indices[i]));
      return `「もし〜にふれたら」は 書きません。いま ふれているかを しらべるなら「もし${a}が${b}にふれていれば、」、ふれるまで 待つなら「${a}が${b}にふれたら、」、ふれる たびに するなら「${a}が${b}にふれたとき、」と 書きます`; }],
    [/^(?!もし)(.+?)が(.+?)に(?:ふれ|触れ)(?:ると|れば)、/d, (m, code) => { const [a, b] = [1, 2].map(i => code.slice(...m.indices[i]));
      return `「〜にふれると、」では、ふれる たびに するのか、ふれるまで 待つのかが 決まりません。ふれる たびに するなら「${a}が${b}にふれたとき、」、待つなら「${a}が${b}にふれたら、」と 書きます`; }],
    [/(?<!に)いちばん近い(?![^、。]*?(?:の方を向く|までの(?:きょり|距離)))/, '「いちばん近い」は「〜の方を向く」と「〜までのきょり」で 使います。れい：ねこは、いちばん近い星の方を向く'],
    [/(?:のに|けれど|けれども|けど)、/, '「〜のに」「〜けれど」では、いつ 何を するかが 決まりません。「もし〜なら、」と「そうでなければ、」で 書きます'],
    [/(?:すこし|少し|ちょっと|しばらく|何度も|なんども|何回も|なんかいも|たくさん)/, m => `「${m[0]}」では、量や 時間が 決まりません。「10歩」「2秒」「3回」のように 数で 書きます`],
    [/(?:もう一度|もういちど|もう1度|もう一回|もういっかい|もう1回)/, m => `「${m[0]}」では、どの 文を 何回 するかが 決まりません。する 文を もう一度 書くか、「2回くり返す」のように 書きます`],
    [/(?:となり|隣)(?:へ|に|まで)/, '「となり」では、どこへ 行くかが 決まりません。「〜のところへ行く」か、歩の 数を 書きます'],
    [/^(それ|あれ|これ)(?:は|が)/, m => `「${m[1]}」では、どの 部品かが 決まりません。部品の 名前を 書きます`],
    [/話しかける$/, '「話しかける」では、何を するかが 決まりません。「ねこは「やあ」と言う」のように 書きます'],
    [/言い終わ/, '「言い終わる」は、「ねこが言い終わるまで待つ」の 形で 書きます'],
    [/(?:と同じように|(?<!次)のように)/, '「〜のように」では、まねる はんいが 決まりません。する ことを 一つずつ 文に 書きます'],
    [/(?:はし|端)まで(?:進む|動く|行く)$/, '速さが 決まりません。「1秒に20歩の速さで、画面のはしにふれるまで前へ動き続ける」のように 書きます'],
    [/て(?:ください|くれ|ほしい)$/, 'お願いの 形は 読みません。「ねこは前へ10歩進む」のように、する ことを 書きます'],
    [/ので、/, '「〜ので」は 理由を 言う ことばで、いつ するかは 決まりません。しらべるときは「もし〜なら、」、そうなるまで 待つときは「〜になったら、」と 書きます'],
    [/ても、/, '「〜ても」では、いつ 何を するかが 決まりません。「もし〜なら、」と「そうでなければ、」で 書きます'],
    [/(?:たり|だり)、.+(?:たり|だり)する$/, '「〜たり、〜たりする」では、どちらを いつ するかが 決まりません。する ことを 一つずつ 文に 書きます'],
    [/の近く(?:へ|に|まで)/, '「近く」では、どこまで 行くかが 決まりません。「〜のところへ行く」か、歩の 数を 書きます'],
    [/^((?:その|あの)(?:子|人|もの|部品))(?:は|が)/, m => `「${m[1]}」では、どの 部品かが 決まりません。部品の 名前を 書きます`],
    [/て(?:あげる|あげます|くれる|もらう)$/, '「〜てあげる」「〜てもらう」は、プログラムでは する ことが かわらないので 書きません。「ねこは「やあ」と言う」のように 書きます'],
    [/([0-9０-９]+)回目に/, m => `何の 回数かが 決まりません。「回数」のような へんすうで 数えて、「もし回数が${m[1]}と同じなら、」と 書きます`],
    [/(?:動き|進み|回り|うごき)(?:始める|はじめる)$/, '速さが 決まりません。「1秒に20歩の速さで、〜まで前へ動き続ける」のように 書きます'],
  ];

  // The words of a 名人 expression (for messages: no block has these kinds); null for a common one.
  function meijinWords(v) {
    const text = e => meijinWords(e) ?? formatExpression(meijinPlainExpression(e));
    const actor = r => r?.kind === 'named' ? r.name : r?.kind === 'value' ? text(r.value) : '自分';
    switch (v?.kind) {
      case 'PartRef': case 'PartFamily': return v.name;
      case 'PartNearest': return 'いちばん近い' + text(v.of);
      case 'PartName': return actor(v.actorRef) + 'の名前';
      case 'PartState': return actor(v.actorRef) + ({ copyCount: 'のコピーの数', speechDone: 'が話し終わる', soundDone: 'の音が鳴り終わる' }[v.state] || '');
      case 'PartExcept': case 'PartRandom': case 'PartPick': case 'PartsTouching': case 'CreatedCopies': return '部品の集まり';
      default: return null;
    }
  }
  // An expression with its 名人 parts written as words, so the common formatter can print it.
  function meijinPlainExpression(v) {
    if (Array.isArray(v)) return v.map(meijinPlainExpression);
    if (!v || typeof v !== 'object') return v;
    const words = meijinWords(v);
    if (words !== null) return exprNode('StringLiteral', { value: words });
    const out = {};
    for (const [key, child] of Object.entries(v))
      out[key] = key === 'actorRef' && child?.kind === 'value' ? { kind: 'named', name: meijinWords(child.value) ?? formatExpression(meijinPlainExpression(child.value)) } : meijinPlainExpression(child);
    return out;
  }
  // In an expression: ねこの名前, 星のコピーの数, 主役の体力 (主役 holds a part). null reads it the common way.
  function meijinNamedRead(parser, token) {
    const { symbols, ctx } = parser, name = token.name, part = isMeijinPart(name, symbols, ctx);
    const held = !part && dataNameKind(name, symbols, ctx) === 'variable';
    if (!part && !held) return null;
    const actorRef = part ? { kind: 'named', name } : meijinValueActor(exprNode('VariableRead', { name, qualifier: null }));
    const at = word => parser.starts(word) && nameBoundary(parser.text, parser.i + word.length);
    if (at('のコピーの数')) { parser.i += 'のコピーの数'.length; return exprNode('PartState', { state: 'copyCount', actorRef }); }
    if (at('の名前')) { parser.i += 'の名前'.length; return exprNode('PartName', { actorRef }); }
    if (held && parser.starts('の') && !MEIJIN_DATA_SUFFIXES.some(t => parser.starts(t)) && !parser.findTopSuffix(['番目', '文字目'])) {
      parser.i++;
      return exprNode('ActorQualifiedRead', { actorRef, value: parser.basic() });
    }
    return null;
  }
  // いちばん近い星: of the part 星 and its copies (or of a list of parts), the one nearest to the one who acts.
  function meijinNearestRead(parser) {
    const start = parser.i, token = readNameToken(parser.text, start + 'いちばん近い'.length), { symbols, ctx } = parser;
    const of = !token ? null : isMeijinPart(token.name, symbols, ctx) ? exprNode('PartFamily', { name: token.name })
      : meijinListName(token.name, symbols, ctx) ? exprNode('VariableRead', { name: token.name, qualifier: null }) : null;
    if (!of) return null;
    parser.i = token.end;
    return exprNode('PartNearest', { of });
  }
  // 動いている → 動く, 話している → 話す, 見せている → 見せる: the plain forms a て-form can come from.
  function meijinPlainForms(text) {
    const m = /^(.*)(.)(て|で)いる$/.exec(text);
    if (!m) return [];
    const [, head, last, te] = m;
    if (te === 'で') return last === 'い' ? [head + 'ぐ'] : last === 'ん' ? ['む', 'ぶ', 'ぬ'].map(x => head + x) : [];
    if (last === 'い') return [head + 'く', head + 'いる'];
    if (last === 'し') return [head + 'す', head + 'する'];
    if (last === 'っ') return ['う', 'つ', 'る'].map(x => head + x);
    return [head + last + 'る'];
  }
  // ねこは、1秒に20歩の速さで、ゴールにふれるまで前へ動き続ける: moving at a speed until the condition holds.
  // timed: 10秒のあいだ、ねこは1秒に20歩の速さで前へ動き続ける (the time ends it, no まで).
  function meijinMove(code, line, symbols, scope, timed = false) {
    const mask = surfaceMask(code);
    if (!/(?:動き続ける|動きつづける|うごき続ける)$/.test(mask)) {
      if (/秒に.+?歩の速さで/.test(mask) && /まで/.test(mask) && /(?:前|後ろ|右|左|上|下)(?:へ|に)(?:動く|うごく|進む|すすむ)$/.test(mask))
        throw sentenceDiagnostic('決めた 速さで 〜まで 動くときは「動き続ける」と 書きます。れい：' + code.replace(/(?:動く|うごく|進む|すすむ)$/, '動き続ける'), line, [], { kind: 'MoveUntil' });
      return null;
    }
    let actorRef = scope.topicActor || { kind: 'self' }, rest = code, explicit = false;
    const subject = surfaceCapture(/^(.+?)(?:は|が)、?(.+)$/d, code, mask);
    if (subject && (isMeijinPart(subject[0].text, symbols, scope) || meijinVariableName(subject[0].text, symbols, scope))) {
      actorRef = isMeijinPart(subject[0].text, symbols, scope) ? { kind: 'named', name: meijinBare(subject[0].text) } : meijinValueActor(meijinVariableRead(subject[0].text));
      rest = subject[1].text; explicit = true;
    }
    const screenWay = /^(?:.+?秒に.+?歩の速さで、?)?(?:.+?まで、?)?(?:(?:いま|今)の(?:ばしょ|場所)から、?)?画面の(?:右|左|上|下)(?:へ|に)/.exec(surfaceMask(rest));
    if (screenWay) {
      // The fix takes out that 画面の, in the whole line (10秒のあいだ、 in front is kept), as the common rule does.
      const at = code.length - rest.length + screenWay[0].length - 5, whole = compactOutsideString(line.code);
      const fixed = whole.endsWith(code) ? whole.slice(0, whole.length - code.length) + code.slice(0, at) + code.slice(at + 3) : null;
      throw sentenceDiagnostic('動き続ける 文には「画面の」を 書きません。れい：ねこは、1秒に20歩の速さで、画面のはしにふれるまで右へ動き続ける', line, fixed ? [{ label: '「画面の」を とる', source: fixed }] : [], { kind: 'MoveUntil' });
    }
    const m = surfaceCapture(/^(?:(.+?)秒に(.+?)歩の速さで、?)?(?:(.+?)まで、?)?(?:(?:いま|今)の(?:ばしょ|場所)から、?)?(前|後ろ|右|左|上|下)(?:へ|に)(?:(.+?)秒に(.+?)歩の速さで)?(?:動き続ける|動きつづける|うごき続ける)$/d, rest);
    if (!m) return null;
    const seconds = m[0] || m[4], distance = m[1] || m[5], until = m[2];
    if (!until === !timed) return null;
    if (!seconds) throw sentenceDiagnostic('「〜まで動き続ける」には、「1秒に20歩の速さで」のように 速さを 書きます。れい：ねこは、1秒に20歩の速さで、ゴールにふれるまで前へ動き続ける', line, [], { kind: 'MoveUntil', missing: ['speed'] });
    const local = { ...scope, topicActor: actorRef }, e = text => parseExpression(text, symbols, local);
    return { actorRef, explicit, direction: MEIJIN_DIRECTIONS[m[3].text], seconds: sentenceQuantity(e(seconds.text), '秒'), distance: sentenceQuantity(e(distance.text), '歩'),
      ...(until ? { condition: parseCondition(until.text + 'まで', symbols, local, 'until') } : {}) };
  }

  // A removed move form as the action of 〜あいだ／〜うちに／〜ながら names the form written now (B-10), as a sentence of its own
  // does. The fix rewrites that action in its own verb form (動くあいだ, 動いているうちに, 動きながら) and is offered
  // when the rewritten action reads. null when the action is no such form.
  function meijinRemovedMove(action, line, before, after, form, reads) {
    for (const plain of [action, ...meijinPlainForms(action), ...(form === 'ながら' ? meijinDictionary(action) : [])]) {
      const found = removedMoveGuidance(plain);
      if (!found) continue;
      const stem = found.source && /動く$/.test(found.source) ? found.source.slice(0, -2) : null;
      const fixed = stem !== null && reads(stem + '動く') ? before + stem + { ながら: '動き', ている: '動いている', plain: '動く' }[form] + after : null;
      return sentenceDiagnostic(found.message, line, fixed ? [{ label: found.label || '書き方を なおす', source: fixed }] : [], { kind: 'Parallel' });
    }
    return null;
  }

  // In-text procedures: 【ジャンプ】という手順を、次のように作る。 The body is read as the procedure; the sentence
  // only registers it. Each becomes a procedure of the work (an id in the 名人 script's own namespace).
  const MEIJIN_DEFINITION = /^【(.+?)】という(?:手順|てじゅん)を、(?:(.+?)を受け取って、)?次のように作る$/d;
  function meijinDefinitionArgs(text) {
    if (!text) return [];
    const strip = name => name.replace(/^【(.*)】$/, '$1');
    const pieces = separator => { const out = []; let at = 0; for (const m of text.matchAll(new RegExp('【[^】]*】|' + separator, 'g'))) if (!m[0].startsWith('【')) { out.push(text.slice(at, m.index)); at = m.index + m[0].length; } out.push(text.slice(at)); return out; };
    const byComma = pieces('、');
    if (byComma.length > 1) return byComma.map(strip);
    const byAnd = pieces('と');
    return (byAnd.length > 1 && byAnd.every(Boolean) ? byAnd : [text]).map(strip);
  }
  function meijinDefinitions(script) {
    const lines = String(script.source || '').split('\n'), out = [];
    for (let i = 0; i < lines.length; i++) {
      const head = /^([^ \t　].*?)。?$/.exec(lines[i]), m = head && MEIJIN_DEFINITION.exec(compactOutsideString(head[1]));
      if (!m) continue;
      // A full-width space at the start of a line is two small spaces (F-24), as in the rest of the text.
      const body = []; let j = i + 1;
      while (j < lines.length && (!lines[j].trim() || /^[ \u3000]/.test(lines[j]))) body.push(lines[j++].replace(/^[ \u3000]+/, p => p.replace(/\u3000/g, '  ')));
      while (body.length && !body.at(-1).trim()) body.pop();
      const indent = Math.min(...body.filter(l => l.trim()).map(l => l.match(/^ */)[0].length), 64);
      out.push({ id: `meijin-${script.id}-${out.length + 1}`, ownerId: 'stage', name: m[1], args: meijinDefinitionArgs(m[2]),
        source: body.map(l => l.slice(indent)).join('\n'), meijin: true, scriptId: script.id, line: i + 2, headLine: i + 1 });
      i = j - 1;
    }
    return out;
  }
  const meijinProjectDefinitions = project => (project?.scripts || []).filter(isMeijinScript).flatMap(meijinDefinitions);

  // The words of 国語 and 算数 a 名人 condition may hold (点数が偶数, 持ち物が空, 点数が10の倍数, 点数が12の約数), and the
  // same check in the common grammar. The あまり has the sign of the number (－3÷2のあまり is －1), so an odd number is one
  // whose あまり is 1 or －1. 0 divides no number and 12÷0 has no あまり, so a 約数 rules 0 out first (かつ reads its
  // right side only then).
  const MEIJIN_WORD_SUBJECT = '(【[^】]*】|[^、。\u0001が【】]+?)';
  const MEIJIN_WORD = '(空|からっぽ|空っぽ|偶数|ぐう数|ぐうすう|奇数|き数|きすう|[0-9０-９]+(?:[.．][0-9０-９]+)?の(?:倍数|ばい数|ばいすう)|[0-9０-９]+(?:[.．][0-9０-９]+)?の(?:約数|やく数|やくすう))';
  const meijinWordSpelling = word => word.replace(/ぐう数|ぐうすう/, '偶数').replace(/き数|きすう/, '奇数').replace(/ばい数|ばいすう/, '倍数').replace(/やく数|やくすう/, '約数');
  const MEIJIN_WORD_ENDING = '(なら|だったら|でなければ|でないなら|ではないなら|じゃないなら|ではなかったら|じゃなかったら|のあいだ|であるあいだ|になるまで)';
  function meijinWordCheck(subject, written) {
    const word = meijinWordSpelling(written);
    const n = /^([0-9０-９]+(?:[.．][0-9０-９]+)?)の(倍数|約数)$/.exec(word);
    // 算数 (5年): 倍数・約数 are of whole numbers above 0.
    if (n && !/^[1-9１-９][0-9０-９]*$/.test(n[1])) throw new AkariError('P205', `「${written}」は 読みません。「〜の倍数」「〜の約数」の 〜には、2や 12のような 0より 大きい 整数を 書きます`);
    if (/^(?:空|からっぽ|空っぽ)$/.test(word)) return { same: `${subject}の長さが0と同じ` };
    if (word === '偶数') return { same: `${subject}÷2のあまりが0と同じ` };
    if (word === '奇数') return { same: `絶対値（${subject}÷2のあまり）が1と同じ` };
    if (n?.[2] === '倍数') return { holds: `条件（${subject}が0とちがう かつ ${subject}÷${n[1]}のあまりが0と同じ）` };
    return { holds: `条件（${subject}が0より大きい かつ 切り捨て（${subject}）が${subject}と同じ かつ ${n[1]}÷${subject}のあまりが0と同じ）` };
  }
  // The check with its ending: なら・だったら / でなければ・でないなら… / のあいだ / になるまで / (none: the bare condition).
  function meijinWordTest(subject, word, ending = '') {
    const { same, holds } = meijinWordCheck(subject, word);
    const kind = /^(?:なら|だったら)$/.test(ending) ? 'if' : /^(?:でなければ|でないなら|ではないなら|じゃないなら|ではなかったら|じゃなかったら)$/.test(ending) ? 'not'
      : /あいだ$/.test(ending) ? 'while' : ending === 'になるまで' ? 'until' : 'bare';
    if (same) return same + { if: 'なら', not: 'でなければ', while: 'であるあいだ', until: 'になるまで', bare: '' }[kind];
    return holds + { if: 'が成り立つなら', not: 'が成り立たないなら', while: 'が成り立つあいだ', until: 'が成り立つまで', bare: 'が成り立つ' }[kind];
  }

  // 名人のできごと: だんごが星にふれたとき、/ 点数が10点以上になったとき、/ 1秒ごとに、
  function readMeijinHeading(code, mask, symbols, ctx) {
    let p;
    // 作品を動かしたとき、ねこと犬は、: one part is the heading's subject.
    if ((p = /^.+?(?:とき|たら|たびに|ごとに)、(.+?)は、$/.exec(mask)) && meijinPartList(p[1], symbols, ctx))
      throw new AkariError('P205', `見出しの 主語には、部品の 名前を 一つ 書きます（「${p[1]}」のように いくつかの 部品は 書けません）。中身の 文に「${p[1]}は」と 書きます`);
    if (MEIJIN_WHEN_PRESSED.test(mask)) throw new AkariError('P205', MEIJIN_WHEN_PRESSED_MESSAGE);
    if ((p = surfaceCapture(/^(.+?)が(\u0001+)の合図を(?:受けた|うけた)とき、(.*)$/d, code, mask)) && isMeijinPart(p[0].text, symbols, ctx) && /^「[^「」]+」$/.test(p[1].text))
      return { heading: { event: 'message', actorRef: { kind: 'named', name: meijinBare(p[0].text) }, filter: { message: p[1].text.slice(1, -1) } }, body: p[2], actor: p[0] };
    // ねこが「星」にふれたとき、/ ねこが星にふれるたびに、/ ねこが画面のはしにふれたとき、(上・下・右・左のはしも): who touches is
    // written first. Under the edge's heading a sentence with no subject is the toucher's; under a part's, it names who acts.
    if ((p = surfaceCapture(/^(.+?)が(.+?)に(?:(?:ふれ|触れ)たとき|(?:ふれ|触れ)るたびに)、(.*)$/d, code, mask)) && isMeijinPart(p[0].text, symbols, ctx)) {
      let target;
      try { target = touchTarget(p[1].text, symbols); }
      catch (error) {
        // マウス or a colour is looked at with もし; a 名人 condition names who touches (もしねこが「マウス」にふれていれば、).
        if (error instanceof AkariError && error.code === 'P205' && error.message.includes('「もし「')) throw new AkariError('P205', error.message.replace('「もし「', `「もし${meijinBare(p[0].text)}が「`));
        throw error;
      }
      if (target !== null && (isEdgeTarget(target) || isMeijinPart(target, symbols, ctx)))
        return { heading: { event: 'touchStart', actorRef: { kind: 'named', name: meijinBare(p[0].text) }, filter: { target: meijinBare(target) } }, body: p[2], actor: p[0],
          bodyTopic: isEdgeTarget(target) ? { kind: 'self' } : { kind: 'self', mustName: 'touch' } };
    }
    // 「星」にふれたとき、 with no one who touches: a 名人 text belongs to no part, so the heading names the part.
    if (!/^もし/.test(mask) && (p = surfaceCapture(/^(.+?)に(?:(?:ふれ|触れ)たとき|(?:ふれ|触れ)るたびに)、(.*)$/d, code, mask)) && !/[、。が]/.test(surfaceMask(p[0].text))) {
      const target = touchTarget(p[0].text, symbols);
      if (target !== null && (isEdgeTarget(target) || isMeijinPart(target, symbols, ctx))) {
        const who = (symbols?.project?.components || []).find(c => c.name !== meijinBare(target))?.name || 'ねこ';
        throw new AkariError('P205', `名人の 本文では、だれが ふれるかを 見出しの はじめに 書きます。れい：${who}が${touchShown(target)}にふれたとき、`);
      }
    }
    // 1秒ごとに: a number. The time is read once, before the first sentence runs, so a variable would not mean what it says.
    if ((p = surfaceCapture(/^(.+?)秒ごとに、(.*)$/d, code, mask))) {
      const seconds = parseExpression(p[0].text, symbols, ctx);
      if (seconds.kind !== 'NumberLiteral')
        throw new AkariError('P205', '「〜秒ごとに」の 時間は、作品を 動かしたときに 一度だけ 決まるので、「2秒ごとに」のように 数だけを 書きます（へんすうや 計算は 書けません）。かわる 間かくで くり返すときは「ずっとくり返す。」の 中に「間隔秒待つ。」と 書きます');
      if (!(seconds.value > 0))
        throw new AkariError('P205', '「〜秒ごとに」には、0より 大きい 数を 書きます。かわる 間かくで くり返すときは「ずっとくり返す。」の 中に「間隔秒待つ。」と 書きます');
      return { heading: { event: 'interval', actorRef: { kind: 'self' }, seconds: sentenceQuantity(seconds, '秒') }, body: p[1] };
    }
    if (!/^もし/.test(mask) && (p = surfaceCapture(/^(.+?)になったとき、(.*)$/d, code, mask))) {
      // 点数が10点以上になったとき / 点数が10点になったとき (that is, the same as 10点) / 持ち物が空になったとき
      let condition;
      const word = new RegExp('^' + MEIJIN_WORD_SUBJECT + 'が' + MEIJIN_WORD + '$').exec(p[0].text);
      if (word) condition = parseCondition(meijinWordTest(word[1], word[2]), symbols, ctx, 'plain');
      else try { condition = parseCondition(p[0].text, symbols, ctx, 'plain'); }
      catch (error) { if (!(error instanceof AkariError)) throw error; condition = parseCondition(p[0].text + 'と同じ', symbols, ctx, 'plain'); }
      return { heading: { event: 'conditionTrue', actorRef: { kind: 'self' }, condition }, body: p[1] };
    }
    return null;
  }

  // The common sentence with the same meaning (the line is read again as it). null when nothing changes.
  function meijinRewrite(code, symbols, ctx) {
    const mask = surfaceMask(code), parts = meijinPartNames(symbols);
    if (!parts.length) return null;
    const variables = [...(symbols?.projectVars?.keys?.() || [])].filter(v => !parts.includes(v)).sort((a, b) => b.length - a.length);
    const isValue = name => variables.includes(name);
    // A part is read by its name in 「 」; a variable holding one is read as written (主役のよこのばしょ).
    const at = name => isValue(name) ? name : `「${meijinBare(name)}」`;
    const alt = [...parts.flatMap(name => ['【' + meijinEscape(name) + '】', meijinEscape(name)]), ...variables.map(meijinEscape)].join('|'), nameMask = meijinNameMask(code),
      capture = pattern => surfaceCapture(new RegExp(pattern, 'd'), code, nameMask);
    let p;
    const own = (part, name) => {
      const component = symbols.project.components.find(c => c.name === meijinBare(part));
      return !!(component?.localData?.variables?.some(v => v.name === name) || component?.localData?.lists?.some(v => v.name === name));
    };
    // ねこの大きさを120％にする / ねこの色を「赤」にする / ねこの体力を1減らす: a change of a part's state, written by the
    // one who moves the parts, is the part's own command.
    const looks = MEIJIN_LOOK_WORDS;
    if ((p = capture('^(' + alt + ')の(.+?)を(.+?(?:に(?:する|かえる|変える)|(?:増やす|ふやす|減らす|へらす)|段階(?:上げる|下げる)))$'))) {
      const [part, what, rest] = p.map(x => x.text);
      if (looks.includes(what)) return part + 'は' + (what === '色' ? '表示色' : what) + 'を' + rest;
      if (own(part, what)) return part + 'は自分の' + what + 'を' + rest;
      // ねこの【大きさ】を5にする: the part's own data, written in 【 】 as the message above says.
      if (/^【.+】$/.test(what) && own(part, meijinBare(what))) return part + 'は自分の' + what + 'を' + rest;
    }
    if ((p = capture('^(' + alt + ')のペンを(下ろす|おろす|上げる|あげる)$'))) return p[0].text + 'はペンを' + p[1].text;
    if ((p = capture('^(' + alt + ')のすがたを(かくす|隠す|見せる|みせる)$'))) return p[0].text + 'はすがたを' + p[1].text;
    // 【長さ】を5として、【向き】を90として、【かく】という手順を行う: the same as 【長さ】を5、【向き】を90として、….
    if ((p = surfaceCapture(/^(.+?)として、(.+?として、?.*という(?:手順|てじゅん)を行う)$/d, code, mask))) return p[0].text + '、' + p[1].text;
    // 点数を、なかまの数にする / なかまを、ねこと犬と鳥にする: a comma after を; parts written together are a list. A data name in 【 】 is the same name.
    if ((p = surfaceCapture(/^(\u0001+|[^、。\u0001]+?)を、?(.+?)に(する|かえる|変える)$/d, code, mask)) && dataNameKind(meijinBare(p[0].text), symbols, ctx)) {
      const names = meijinPartList(p[1].text, symbols, ctx);
      // なかまを、ねこや犬にする: や names some of them (and others); parts are joined with と.
      const some = !names && p[1].text.split('や');
      if (some?.length > 1 && some.every(name => isMeijinPart(name, symbols, ctx)))
        throw new AkariError('P205', `「や」は、ほかにも ある ときの 言い方です。部品を ならべるときは「${some.join('と')}」のように「と」で つなぎます`);
      if (names && !meijinListName(p[0].text, symbols, ctx)) throw new AkariError('P205', meijinSetIntoVariable(p[0].text));
      if (names) return `${p[0].text}を［${names.join('、')}］に${p[2].text}`;
      if (mask[p[0].end + 1] === '、') return `${p[0].text}を${p[1].text}に${p[2].text}`;
    }
    let out = code, changed = false;
    // build returns null to keep the text as written.
    const replaceAll = (pattern, build) => {
      const protectedText = meijinNameMask(out), re = new RegExp(pattern.source, 'gd');
      let result = '', at = 0, m;
      while ((m = re.exec(protectedText))) {
        const groups = m.indices.map(range => range ? out.slice(...range) : ''), next = build(groups);
        result += out.slice(at, m.index) + (next ?? out.slice(m.index, m.index + m[0].length)); at = m.index + m[0].length;
        if (next !== null) changed = true;
      }
      out = result + out.slice(at);
    };
    // もしねこがコピーなら / もし主役がコピーでなければ: whether that part is a copy.
    replaceAll(/(もし、?|、|^)(【[^】]*】|[^、。\u0001が【】]+?)がコピー(なら|でなければ|ではないなら)/, m =>
      isMeijinPart(meijinBare(m[2]), symbols, ctx) || meijinVariableName(meijinBare(m[2]), symbols, ctx) ? `${m[1]}条件（${m[2]}のコピーである）が成り立${m[3] === 'なら' ? 'つなら' : 'たないなら'}` : null);
    // ねこが犬より右にいれば: the parts' positions compared.
    const side = { 右: ['よこ', '大き'], 左: ['よこ', '小さ'], 上: ['たて', '大き'], 下: ['たて', '小さ'] };
    replaceAll(new RegExp('(' + alt + ')が(' + alt + ')より(右|左|上|下)に(いれば|いなければ|いるあいだ|いるまで|いる)'), m => {
      const [axis, size] = side[m[3]], ending = { いれば: 'ければ', いなければ: 'くなければ', いるあいだ: 'いあいだ', いるまで: 'くなるまで', いる: 'い' }[m[4]];
      return `${at(m[1])}の${axis}のばしょが${at(m[2])}の${axis}のばしょより${size}${ending}`;
    });
    // ねこから犬までのきょり: one part's distance to another.
    replaceAll(new RegExp('(' + alt + ')から(' + alt + ')までの(?:きょり|距離)'), m => `「${meijinBare(m[1])}」の（「${meijinBare(m[2])}」までのきょり）`);
    // ねこからいちばん近い星までのきょり: the nearest one to ねこ.
    replaceAll(new RegExp('(' + alt + ')からいちばん近い(' + alt + ')までの(?:きょり|距離)'), m => `「${meijinBare(m[1])}」の（いちばん近い${m[2]}までのきょり）`);
    // 持ち物が空なら / 点数が偶数でなければ / 点数が10の倍数だったら / 持ち物が空のあいだ: the words of 国語 and 算数.
    // もし点数が20より小さい かつ 点数が偶数なら / 点数が偶数で、持ち物が空のあいだ、: each term is read; a term with 、
    // in it (三つ以上を「〜で、」で) is left for the guidance.
    replaceAll(new RegExp('(もし、?|^)([^。]+?(?:で、|であり、|\\s*かつ\\s*)[^。]+?)(なら|のあいだ|あいだ)、'), m => {
      const terms = m[2].split(/で、|であり、|\s*かつ\s*/).map(t => t.trim()), word = new RegExp('^' + MEIJIN_WORD_SUBJECT + 'が' + MEIJIN_WORD + '(?:の)?$');
      if (terms.length < 2 || terms.some(t => !t || t.includes('、')) || !terms.some(t => word.test(t))) return null;
      let subject = null;
      const read = terms.map(t => { const w = word.exec(t); if (w) { subject = w[1]; return meijinWordTest(w[1], w[2]); } const own = /^(.+?)が/.exec(t); if (own) subject = own[1]; else if (subject) t = subject + 'が' + t; return t.replace(/の$/, ''); });
      return `${m[1]}条件（${read.join(' かつ ')}）${m[3] === 'なら' ? 'が成り立つなら' : 'が成り立つあいだ'}、`;
    });
    replaceAll(new RegExp('(もし、?)' + MEIJIN_WORD_SUBJECT + 'が' + MEIJIN_WORD + '(?:で、|であり、|\\s*かつ\\s*)([^、。]+?)(なら|でなければ)、'), m => `${m[1]}条件（${meijinWordTest(m[2], m[3])} かつ ${m[4].trim()}）${m[5] === 'なら' ? 'が成り立つなら' : 'が成り立たないなら'}、`);
    replaceAll(new RegExp('(もし、?|、|^)' + MEIJIN_WORD_SUBJECT + 'が' + MEIJIN_WORD + MEIJIN_WORD_ENDING), m => `${m[1]}${meijinWordTest(m[2], m[3], m[4])}`);
    if (changed) return out;
    // だんごが星にふれたら、… (also 「星」, 画面のはし and its sides): wait until it touches, then do it (once), as 〜になったら.
    if ((p = capture('^(' + alt + ')が(' + alt + '|\u0001+|画面の(?:(?:上|下|右|左)の)?(?:はし|端))に(?:ふれた|触れた)ら、(.+)$')) &&
      (!/^「/.test(p[1].text) || isMeijinPart(p[1].text.slice(1, -1), symbols, ctx)) && !/^（/.test(p[1].text)) return `${p[0].text}が${p[1].text}にふれるまで待って、${p[2].text}`;
    // 点数が10点になったら、ねこは…: wait until it becomes so, then do it (once).
    if (!/^もし/.test(mask) && (p = surfaceCapture(/^(.+?)になったら、(.+)$/d, code, mask))) return p[0].text + 'になるまで待って、' + p[1].text;
    // 持ち物から「本」を一つ消す: the first one; nothing happens when there is none.
    if ((p = surfaceCapture(/^(\u0001+|[^、。\u0001]+?)から(.+?)を(?:一つ|ひとつ|1つ)(?:消す|けす)$/d, code, mask)) && meijinListName(p[0].text, symbols, ctx)) {
      const [list, value] = p.map(x => x.text);
      return `もし${list}に${value}が入っていれば、${list}の（${list}の中で${value}がはじめて出てくる番号）番目を消す`;
    }
    if ((p = /^(.*?)(?:消える|きえる)$/.exec(mask)) && /^(?:.+?(?:は|が)、?)?$/.test(p[1])) return meijinBody(code);
    return null;
  }

  // A subject phrase of 名人: { lanes: [names] } several parts at once; { set } every part of a set (or none);
  // { list } a list variable of parts; { value } one part held in a variable.
  function meijinSubject(phrase, symbols, ctx, previousTopic) {
    const names = meijinPartList(phrase, symbols, ctx);
    if (names) return { lanes: names };
    let p;
    const set = text => meijinSetExpression(text, symbols, ctx, previousTopic);
    if ((p = /^(.+?)以外の(.+)$/.exec(phrase)) && isMeijinPart(p[1], symbols, ctx)) {
      const list = set(p[2]);
      if (list) return { set: exprNode('PartExcept', { list, except: meijinPartRef(p[1]) }) };
    }
    if ((p = /^ほかの(.+)$/.exec(phrase))) {
      const list = set(p[1]);
      if (list && ctx.topicSet) throw new AkariError('P205', '「ほかの」の すぐ前の 文の 主語が、部品の あつまりです。「ほかの」は 一つの 部品を のぞくので、すぐ前の 文の 主語を 一つの 部品に します');
      if (list && !previousTopic) throw new AkariError('P205', '「ほかの」は、引きついでいる 主語の 部品を のぞいた ものです。前の 文に、だれが するかを 書きます');
      if (list) return { set: exprNode('PartExcept', { list, except: previousTopic }) };
    }
    if ((p = /^(.+?)のだれか(?:一人|ひとり|1人)$/.exec(phrase))) {
      const list = set(p[1]);
      if (list) return { set: exprNode('PartRandom', { list }) };
    }
    // 〜のうち、…ほう (two parts) / 〜のうち、いちばん…もの (three or more, or a set): one part only.
    // one: the words after のうち、 with いちばん put in.
    const onePick = (of, words, one) => {
      if (!/いちばん/.test(words) && !/ほう$/.test(words)) throw new AkariError('P205', `「${words}」では、一つに 決まりません。一つを えらぶときは「${of}のうち、${one}」と 書きます`);
      if (/ほう$/.test(words) && meijinPartList(of, symbols, ctx)?.length !== 2) throw new AkariError('P205', `「ほう」は、二つの うちの 一つに 使います。三つ いじょうや リストのときは「${of}のうち、${one.replace(/ほう$/, 'もの')}」と 書きます`);
    };
    if ((p = /^(.+?)のうち、((.+?)に(?:いちばん)?近い(?:ほう|もの))$/.exec(phrase)) && isMeijinPart(p[3], symbols, ctx)) {
      onePick(p[1], p[2], p[2].replace(/^(.+?)に(?:いちばん)?近い/, '$1にいちばん近い'));
      const list = set(p[1]);
      if (list) return { set: exprNode('PartPick', { list, by: { kind: 'near', to: meijinBare(p[3]) } }) };
    }
    if ((p = /^(.+?)のうち、((?:いちばん)?(右|左|上|下)にいる(?:ほう|もの))$/.exec(phrase))) {
      onePick(p[1], p[2], 'いちばん' + p[2].replace(/^いちばん/, ''));
      const list = set(p[1]);
      if (list) return { set: exprNode('PartPick', { list, by: { kind: 'position', side: p[3] } }) };
    }
    if ((p = /^(.+?)のうち、((?:いちばん)?(.+?)が(大きい|小さい)(?:ほう|もの))$/.exec(phrase))) {
      onePick(p[1], p[2], 'いちばん' + p[2].replace(/^いちばん/, ''));
      const list = set(p[1]);
      if (list) return { set: exprNode('PartPick', { list, by: { kind: 'variable', name: p[3], order: p[4] === '大きい' ? 'max' : 'min' } }) };
    }
    if ((p = /^(.+?)に(?:ふれ|触れ)ている(.+)$/.exec(phrase)) && isMeijinPart(p[1], symbols, ctx)) {
      const of = p[2] === 'もの' ? null : isMeijinPart(p[2], symbols, ctx) ? p[2] : undefined;
      if (of !== undefined) return { set: exprNode('PartsTouching', { target: meijinPartRef(p[1]), ...(of ? { of: meijinPartRef(of) } : {}) }) };
    }
    if (/^(?:できた|作った)コピー$/.test(phrase)) return { set: exprNode('CreatedCopies', {}) };
    if (meijinListName(phrase, symbols, ctx)) return { list: meijinVariableRead(phrase) };
    if (meijinVariableName(phrase, symbols, ctx) && !isMeijinPart(phrase, symbols, ctx))
      return { value: meijinVariableRead(phrase) };
    return null;
  }
  function meijinSetExpression(text, symbols, ctx, previousTopic) {
    const names = meijinPartList(text, symbols, ctx);
    if (names) return exprNode('ListLiteral', { items: names.map(meijinPartRef) });
    if (meijinListName(text, symbols, ctx)) return meijinVariableRead(text);
    return meijinSubject(text, symbols, ctx, previousTopic)?.set || null;
  }

  // Masu-stem to dictionary form: 話し → 話す, 動き → 動く, 見せ → 見せる.
  function meijinDictionary(stem) {
    const godan = { し: 'す', き: 'く', い: 'う', り: 'る', み: 'む', ぎ: 'ぐ', び: 'ぶ', ち: 'つ', に: 'ぬ' };
    const last = stem.slice(-1);
    return [...(godan[last] ? [stem.slice(0, -1) + godan[last]] : []), stem + 'る'];
  }


  // A line that is almost a 名人 form: the guidance gives the form (null when it is none of them, or reads as written).
  function meijinNearMiss(code, mask, symbols, scope, env, line, read, attempt) {
    const part = name => isMeijinPart(name, symbols, scope);
    // The trial readings below only ask whether a line reads: inside them no guidance is looked for again (each
    // guidance would read the whole line again, and the trials would grow with every level).
    const probe = { ...env, scope: { ...scope, meijinProbe: true } };
    // The line reads neither as written nor through a 名人 rewrite (found once: each reading reads the whole line).
    let failed;
    const fails = () => failed ??= !attempt(() => read(code, scope.topicActor, { meijinProbe: true })) && !attempt(() => meijinRewrite(code, symbols, scope));
    let p;
    // ねこは2秒かけて…動くあいだ、犬は… / だんごは星にふれたとき、…: the subject before あいだ・とき is written with が.
    if ((p = surfaceCapture(/^(.+?)は、?(.+?)(あいだ|間|うちに|とき)、(.+)$/d, code, mask)) && (part(p[0].text) || meijinPartList(p[0].text, symbols, scope)) && fails()) {
      const fixed = `${p[0].text}が${p[1].text}${p[2].text}、${p[3].text}`;
      if (p[2].text === 'とき' || attempt(() => readMeijinLine(surfaceLineSlice(line, 0, code.length, fixed), probe)))
        return `「〜${p[2].text}」の 前の 主語は「が」で 書きます。れい：${fixed}`;
    }
    // ねこや犬は…: や names some of them (and others); parts are joined with と.
    if ((p = surfaceCapture(/^(.+?)や(.+?)(?:は|が|に|を)/d, code, mask)) && part(p[0].text) && part(p[1].text))
      return `「や」は、ほかにも ある ときの 言い方です。部品を ならべるときは「${p[0].text}と${p[1].text}」のように「と」で つなぎます`;
    // 主役の大きさを120％にする: a variable where the form takes a part's name (it reads with the part's name).
    {
      const parts = meijinPartNames(symbols), variables = [...(symbols?.projectVars?.keys?.() || [])].filter(v => code.includes(v) && !parts.includes(v));
      for (const v of variables) {
        const trial = code.split(v).join(parts[0]);
        if (fails() && attempt(() => readMeijinLine(surfaceLineSlice(line, 0, code.length, trial), probe)))
          return `「${v}」は へんすうです。この 書き方には 部品の 名前を 書きます（部品を 入れた へんすうは「${nameSource(v)}は前へ10歩進む」のように 主語に 使えます）`;
      }
    }
    // 点数が偶数じゃなかったら、: a word of 国語・算数 with an ending that is not read.
    // もし点数が偶数で、20より小さく、2より大きいなら: three or more are joined with かつ.
    if ((p = new RegExp('^(?:もし、?)?' + MEIJIN_WORD_SUBJECT + 'が' + MEIJIN_WORD + '(?:で、|であり、)([^。]*?)(?:なければ|ければ)、').exec(mask)) && !p[3].includes('、') && fails())
      return `「〜で、…なければ」では、どこまでを うちけすのかが 決まりません。「もし${p[1]}が${p[2]}なら、」の 中に「もし${p[3]}なければ、」を 書きます`;
    if ((p = new RegExp('^(?:もし、?)?' + MEIJIN_WORD_SUBJECT + 'が' + MEIJIN_WORD + '(?:で、|であり、)([^。]*?、[^。]*?)(?:なら|あいだ)、').exec(mask)) && fails())
      return `「${p[2]}で、」に つなげる きまりは 一つです。三つ以上を つなぐときは「かつ」で つなぎます。れい：もし${p[1]}が${p[2]} かつ ${p[1]}が20より小さい かつ ${p[1]}が2より大きいなら、`;
    if ((p = new RegExp('^(?:もし、?)?' + MEIJIN_WORD_SUBJECT + 'が' + MEIJIN_WORD + '(?!' + MEIJIN_WORD_ENDING + '|になったら|になったとき)').exec(mask)) && fails())
      return `「${p[2]}」は、「${p[1]}が${p[2]}なら」「${p[1]}が${p[2]}でなければ」の 形で 書きます`;
    // ねこは1秒に20歩の速さで前へ動き続ける: when it stops is not written.
    if (/動き続ける$/.test(mask) && !/まで|あいだ|間/.test(mask) && fails())
      return '「動き続ける」には、いつまで 動くかを 書きます。れい：ねこは、1秒に20歩の速さで、ゴールにふれるまで前へ動き続ける／10秒のあいだ、ねこは1秒に20歩の速さで前へ動き続ける';
    // 犬が「出発」の合図を受けたとき、: the heading of a signal.
    if ((p = surfaceCapture(/^(.+?)が(\u0001+)の合図を(?:受けた|うけた)とき、/d, code, mask)) && part(p[0].text))
      return `合図を 受けるときは「${p[1].text}という合図を受けたとき、${p[0].text}は、」と 書きます`;
    // ねこは、持ち物を順に2秒話す: 2秒 for each, or for all? (ずつ says each.)
    if ((p = surfaceCapture(/^(.+?)(?:は|が)、?(.+?)を順に(.+?)秒(話す|はなす|言う|いう)$/d, code, mask)) && part(p[0].text))
      return `「順に${p[2].text}秒${p[3].text}」では、${p[2].text}秒が 一つずつの 時間か、ぜんぶの 時間かが 決まりません。一つずつなら「${p[0].text}は、${p[1].text}を順に${p[2].text}秒ずつ言う」と 書きます`;
    // ねこと犬も鳥も…: parts are joined with と or with も, not both.
    if ((p = surfaceCapture(/^(.+?)と(.+?)も(.+?)も/d, code, mask)) && part(p[0].text) && part(p[1].text) && part(p[2].text))
      return `部品は「と」か「も」の どちらかで ならべます。れい：${p[0].text}と${p[1].text}と${p[2].text}は、…／${p[0].text}も${p[1].text}も${p[2].text}も、…`;
    // 点数が-3の倍数なら / 点数が【n】の倍数なら: the number is a whole number above 0, written as a number.
    if ((p = surfaceCapture(/が([-－−][0-9０-９]+|【[^】]*】|[^、。が0-9０-９「」【】]+)の(倍数|ばい数|ばいすう|約数|やく数|やくすう)/d, code, mask)) && fails())
      return `「${p[0].text}の${p[1].text}」は 読みません。「〜の倍数」「〜の約数」の 〜には、2や 12のような 0より 大きい 整数を 数で 書きます（へんすうは 書けません）`;
    // ねこは、持ち物を一つずつ順に言う: the time for each is not written.
    if ((p = surfaceCapture(/^(.+?)(?:は|が)、?(.+?)を(?:(?:一つずつ|ひとつずつ|1つずつ)順に|順に)(?:話す|はなす|言う|いう)$/d, code, mask)) && part(p[0].text))
      return `一つを 話す 時間を 書きます。れい：${p[0].text}は、${p[1].text}を一つずつ順に2秒ずつ言う`;
    // なかまの1番目は「a」と言う: an item of a list is put into a variable first.
    if ((p = surfaceCapture(/^(.+?)の([0-9０-９]+)番目(?:は|が)/d, code, mask)) && meijinListName(p[0].text, symbols, scope) && fails())
      return `「${p[0].text}の${p[1].text}番目」は 主語に 書けません。へんすうに 入れてから、その へんすうを 主語に します。れい：主役を、${p[0].text}の${p[1].text}番目にする。主役は「やあ」と言う。`;
    return null;
  }

  // One 名人 line. { nodes, index } when the line is a 名人 form, { rewrite } when it reads as another
  // sentence, null for the common grammar.
  function readMeijinLine(line, env) {
    const { symbols, scope, children } = env, code = compactOutsideString(line.code), mask = surfaceMask(code);
    const read = (text, topic = scope.topicActor, extra = {}) => {
      const part = surfaceLineSlice(line, 0, code.length, text);
      part.comment = line.comment;
      return parseSentenceSequence(part, symbols, { ...scope, ...extra, topicActor: topic });
    };
    const each = { binders: [...(scope.binders || []), MEIJIN_BINDER] };
    const attempt = fn => { try { return fn(); } catch (error) { if (!(error instanceof AkariError)) throw error; return null; } };
    const node = (kind, fields) => statementNode(kind, line, fields);
    const done = nodes => ({ nodes, index: env.index + 1 });
    const indented = (kind, message) => {
      const first = env.nextCode(env.index + 1);
      if (!children || first >= env.lines.length || env.lines[first].indent <= env.indent)
        throw Object.assign(sentenceDiagnostic(message, line, [], { kind, missing: ['body'] }), { code: 'P202' });
      return first;
    };
    const previousTopic = scope.topicActor?.kind === 'named' && isMeijinPart(scope.topicActor.name, symbols, scope) ? meijinPartRef(scope.topicActor.name)
      : scope.topicActor?.kind === 'value' ? scope.topicActor.value : null;
    let p;
    // 【ジャンプ】という手順を、次のように作る。 The body is read as the procedure itself (meijinDefinitions).
    if ((p = surfaceCapture(/^(\u0001+)という(?:手順|てじゅん)を、(?:(.+?)を受け取って、)?次のように作る$/d, code, mask)) && /^【.+】$/.test(p[0].text)) {
      if (env.indent !== 0 || !env.top) throw sentenceDiagnostic('手順は、右へ ずらさない 行で 作ります（「もし」や「くり返す」の 中では 作れません）', line, [], { kind: 'ActionDefinition' });
      indented('ActionDefinition', '「〜という手順を、次のように作る」の 次の 行に、手順の 中身を 右へ ずらして 書きます');
      let end = env.index + 1;
      while (end < env.lines.length && (!env.lines[end].code || env.lines[end].indent > env.indent)) end++;
      return { nodes: [node('ActionDefinition', { name: p[0].text.slice(1, -1), args: meijinDefinitionArgs(p[1]?.text) })], index: end };
    }
    // ねこは、だんごのところへ行く / …のところへ1秒かけて動く / ねこは、1秒かけてだんごのところへ動く / ゴールまで行く:
    // the centre of the one who goes comes to the centre of the other, where it is when the sentence runs (きょり is
    // measured between centres too). A variable holding a part stands for either part; マウス is the mouse, as in
    // common text. The time is the move's optional 〇秒かけて, as for the other move sentences.
    {
      const actorOf = name => isMeijinPart(name, symbols, scope) ? { kind: 'named', name: meijinBare(name) }
        : meijinVariableName(name, symbols, scope) ? meijinValueActor(meijinVariableRead(name)) : null;
      const targetOf = name => isMeijinPart(name, symbols, scope) ? meijinPartRef(name)
        : meijinVariableName(name, symbols, scope) ? meijinVariableRead(name) : ['マウス', '「マウス」'].includes(name) ? exprNode('StringLiteral', { value: 'マウス' }) : null;
      // With no subject written, the subject carried on goes (決まり4); with none, the check asks who goes.
      const go = (subject, other, seconds) => {
        const actorRef = subject === null ? { ...(scope.topicActor || { kind: 'self' }) } : actorOf(subject), to = targetOf(other);
        if (!actorRef || !to) return null;
        const moving = node('MotionCommand', { op: 'GOTO_PART', args: [to], ...(seconds ? { seconds: sentenceQuantity(parseExpression(seconds, symbols, scope), '秒') } : {}), actorRef });
        if (subject !== null) STATEMENT_EXPLICIT_ACTORS.add(moving);
        return done([moving]);
      };
      const place = '(?:のところ(?:へ|まで)|まで)', verb = '(?:行く|いく|動く|うごく)';
      let q, read;
      if ((q = surfaceCapture(new RegExp('^(.+?)(?:は|が)、?(.+?)' + place + verb + '$', 'd'), code, mask)) && (read = go(q[0].text, q[1].text))) return read;
      if ((q = surfaceCapture(new RegExp('^(.+?)(?:は|が)、?(.+?)' + place + '(.+?)秒かけて' + verb + '$', 'd'), code, mask)) && (read = go(q[0].text, q[1].text, q[2].text))) return read;
      if ((q = surfaceCapture(new RegExp('^(.+?)(?:は|が)、?(.+?)秒かけて、?(.+?)' + place + verb + '$', 'd'), code, mask)) && (read = go(q[0].text, q[2].text, q[1].text))) return read;
      if ((q = surfaceCapture(new RegExp('^([^、。]+?)' + place + verb + '$', 'd'), code, mask)) && (read = go(null, q[0].text))) return read;
      if ((q = surfaceCapture(new RegExp('^([^、。]+?)' + place + '(.+?)秒かけて' + verb + '$', 'd'), code, mask)) && (read = go(null, q[0].text, q[1].text))) return read;
      if ((q = surfaceCapture(new RegExp('^([^、。]+?)秒かけて、?([^、。]+?)' + place + verb + '$', 'd'), code, mask)) && (read = go(null, q[1].text, q[0].text))) return read;
    }
    // 次のことを同時に始める。 (the lines under it start together)
    if (/^次のことを(?:同時に|いっしょに|一緒に)始める$/.test(mask)) {
      const body = children(indented('Parallel', '「次のことを同時に始める」の 次の 行に、同時に 始める 文を 右へ ずらして 書きます'), { ...scope, laneTopic: { ...(scope.topicActor || { kind: 'self' }) } });
      // One sentence is one lane: 「〜して、」 in it keeps its order.
      const lanes = []; let last;
      for (const n of body.nodes) {
        if (n.kind === 'CommentLine') continue;
        const at = STATEMENT_LINE.get(n);
        if (lanes.length && at !== undefined && at === last) lanes.at(-1).push(n); else lanes.push([n]);
        last = at;
      }
      return { nodes: [node('Parallel', { lanes })], index: body.index };
    }
    // 10秒のあいだ、くり返す / 10秒のあいだ、ねこは1秒に20歩の速さで前へ動き続ける: from when the sentence begins.
    if ((p = surfaceCapture(/^(.+?)秒(?:の)?(?:あいだ|間)、(.+)$/d, code, mask))) {
      const seconds = attempt(() => sentenceQuantity(parseExpression(p[0].text, symbols, scope), '秒'));
      if (seconds) {
        if (/^(?:次のことを)?(?:くり返す|繰り返す|くりかえす)$/.test(surfaceMask(p[1].text))) {
          const body = children(indented('TimedRepeat', '「〜秒のあいだ、くり返す」の 次の 行に、くり返す 文を 右へ ずらして 書きます'), { ...scope });
          return { nodes: [node('TimedRepeat', { seconds, body: body.nodes, actorRef: { ...scope.topicActor } })], index: body.index };
        }
        const move = meijinMove(p[1].text, line, symbols, scope, true);
        if (move) {
          const { explicit, ...fields } = move, moving = node('MoveUntil', { ...fields, duration: seconds });
          if (explicit) STATEMENT_EXPLICIT_ACTORS.add(moving);
          return done([moving]);
        }
        if (!attempt(() => read(code)))
          throw sentenceDiagnostic(`「${p[0].text}秒のあいだ、」の あとには「くり返す。」か、動き続ける 文を 書きます（れい：${p[0].text}秒のあいだ、ねこは1秒に20歩の速さで前へ動き続ける）。話すときは「ねこは「やあ」と${p[0].text}秒話す」のように 書きます`, line, [], { kind: 'TimedRepeat' });
      }
    }
    {
      const move = meijinMove(code, line, symbols, scope);
      if (move) {
        const { explicit, ...fields } = move, moving = node('MoveUntil', fields);
        if (explicit) STATEMENT_EXPLICIT_ACTORS.add(moving);
        return done([moving]);
      }
    }
    // XがPするあいだ、YはQ / XがPしているうちに、YはQ: two actions started together (a state before あいだ is a repeat).
    if ((p = surfaceCapture(/^(.+?)が(.+?)(あいだ|間|うちに)、(.+)$/d, code, mask)) && (isMeijinPart(p[0].text, symbols, scope) || meijinPartList(p[0].text, symbols, scope))) {
      for (const verb of [p[1].text, ...meijinPlainForms(p[1].text)]) {
        const left = attempt(() => read(p[0].text + 'は' + verb));
        if (left) return done([node('Parallel', { lanes: [left, read(p[3].text)] })]);
      }
      const old = meijinRemovedMove(p[1].text, line, p[0].text + 'が', p[2].text + '、' + p[3].text, /(?:て|で)いる$/.test(surfaceMask(p[1].text)) ? 'ている' : 'plain', text => attempt(() => read(p[0].text + 'は' + text)));
      if (old) throw old;
      // ねこが動いているうちに: no action to start. Reading it as a state would give the same words two timings.
      if (p[2].text === 'うちに')
        throw sentenceDiagnostic(`「〜しているうちに」は、同時に 始める 動作を 書きます。れい：${p[0].text}が2秒かけて、いまのばしょから、右へ40歩動いているうちに、${p[3].text}`, line, [], { kind: 'Parallel', missing: ['action'] });
    }
    // XはPしながら、YはQ: two parts are written with 〜あいだ.
    if ((p = surfaceCapture(/^(.+?)(?:は|が)、?(.+?)ながら、(.+?)(?:は|が)、?(.+)$/d, code, mask)) && isMeijinPart(p[0].text, symbols, scope) && isMeijinPart(p[2].text, symbols, scope)) {
      const verb = meijinDictionary(p[1].text).find(v => attempt(() => read(p[0].text + 'は' + v)));
      throw sentenceDiagnostic('「〜ながら」は、同じ 部品が 二つの 動作を 同時に するときに 使います。ちがう 部品なら「〜あいだ」で 書きます' + (verb ? `。れい：${p[0].text}が${verb}あいだ、${p[2].text}は${p[3].text}` : ''), line, [], { kind: 'Parallel' });
    }
    // XはPしながら、Q: two actions of one part started together.
    if ((p = surfaceCapture(/^(.+?)(?:は|が)、?(.+?)ながら、(.+)$/d, code, mask)) && isMeijinPart(p[0].text, symbols, scope)) {
      for (const verb of meijinDictionary(p[1].text)) {
        const first = attempt(() => read(p[0].text + 'は' + verb));
        if (first) return done([node('Parallel', { lanes: [first, read(p[0].text + 'は' + p[2].text)] })]);
      }
      const old = meijinRemovedMove(p[1].text, line, code.slice(0, p[1].start), 'ながら、' + p[2].text, 'ながら', text => attempt(() => read(p[0].text + 'は' + text)));
      if (old) throw old;
    }
    // Pしながら、Q with no subject: the two actions of the subject carried on (決まり4).
    if ((p = surfaceCapture(/^([^は]+?)ながら、(.+)$/d, code, mask)) && ['named', 'value'].includes(scope.topicActor?.kind)) {
      for (const verb of meijinDictionary(p[0].text)) {
        const first = attempt(() => read(verb));
        if (first) return done([node('Parallel', { lanes: [first, read(p[1].text)] })]);
      }
      const old = meijinRemovedMove(p[0].text, line, '', 'ながら、' + p[1].text, 'ながら', text => attempt(() => read(text)));
      if (old) throw old;
    }
    // なかまを、できたコピーにする / なかまを、ゴールにふれているものにする: the parts of a set at that moment are kept in
    // a list. A variable holds one part, so a set put into it is stopped.
    // A part chosen with 〜のうち、…もの may be none (a tie), so it is kept in a list too.
    if ((p = surfaceCapture(/^(\u0001+|[^、。\u0001]+?)を、?(.+)に(?:する|かえる|変える)$/d, code, mask)) && dataNameKind(meijinBare(p[0].text), symbols, scope)) {
      const set = meijinSubject(p[1].text, symbols, scope, previousTopic)?.set;
      if (set) {
        if (!meijinListName(p[0].text, symbols, scope)) throw sentenceDiagnostic(set.kind === 'PartPick'
          ? `「${p[1].text}」は、きょりや 値が 同じで 一つに 決まらない ときは だれも えらばれないので、へんすうには 入れられません。リストに 入れてから、その 1番目を 使います。れい：えらんだ部品を、${p[1].text}にする。もしえらんだ部品が空でなければ、${p[0].text}を、えらんだ部品の1番目にする`
          : meijinSetIntoVariable(p[0].text) + (set.kind === 'CreatedCopies' ? '。「できたコピー」は、一つ だけ 作っても あつまりです。一つを 入れるときは、リストに 入れてから「' + p[0].text + 'を、なかまの1番目にする」のように 書きます' : ''), line, [], { kind: 'Assignment' });
        return done([node('Assignment', { target: { name: meijinBare(p[0].text), qualifier: null }, value: set })]);
      }
    }
    // A subject phrase: several parts, a set, or a variable holding a part. Every は／が is tried as its end.
    {
      const also = [];
      for (let at = 0, i; (i = mask.indexOf('も', at)) > at && isMeijinPart(code.slice(at, i), symbols, scope); at = i + 1 + (mask[i + 1] === '、' ? 1 : 0)) also.push({ name: code.slice(at, i), end: i + 1 + (mask[i + 1] === '、' ? 1 : 0) });
      if (also.length >= 2 && also.at(-1).end < code.length)
        return done([meijinGroup(node('Parallel', { lanes: also.map(({ name }) => read(name + 'は' + meijinBody(code.slice(also.at(-1).end)))) }), code.slice(0, also.at(-1).end))]);
      const ends = [...mask.matchAll(/[はが]/g)].map(m => m.index).filter(at => at > 0 && at < mask.length - 1);
      for (const at of ends) {
        const phrase = code.slice(0, at), particle = mask[at], restStart = at + 1 + (mask[at + 1] === '、' ? 1 : 0);
        const subject = meijinSubject(phrase, symbols, scope, previousTopic);
        if (!subject) continue;
        const rest = code.slice(restStart), order = MEIJIN_SET_WORDS.exec(surfaceMask(rest)), body = meijinBody(order ? rest.slice(order[0].length) : rest);
        // ねこと犬は…あいだ、…: the subject before あいだ is written with が (the parts together).
        if (subject.lanes && particle === 'は' && /(?:あいだ|間|うちに)、/.test(surfaceMask(rest))) throw sentenceDiagnostic(`「〜あいだ」の 前の 主語は「が」で 書きます。れい：${phrase}が${rest.replace(/^、/, '')}`, line, [], { kind: 'Parallel' });
        if (subject.lanes) {
          // ねこと犬と鳥は、順番に、…: parts written together start together; the check says 順番に does not order them.
          const lanes = meijinGroup(node('Parallel', { lanes: subject.lanes.map(name => read(name + 'は' + body)) }), code.slice(0, restStart) + (order ? rest.slice(0, order[0].length) : ''));
          if (/^(?:順番|じゅんばん)に$/.test(order?.[1] || '')) MEIJIN_LISTED_IN_ORDER.set(lanes, subject.lanes);
          return done([lanes]);
        }
        if (subject.value) {
          // 主役は前へ10歩進む / 主役が前へ10歩進む: the part in 主役 acts. (点数が10になったら… is no subject: it does not read so.)
          if (order) throw sentenceDiagnostic(`「みんな」「それぞれ」「順番に」は、部品の あつまりに 使います。「${phrase}」は 部品 一つなので、「${phrase}は${body}」と 書きます`, line, [], { kind: 'ParallelEach' });
          const nodes = attempt(() => read(body, meijinValueActor(subject.value)));
          if (!nodes) continue;
          for (const n of nodes) if (n.actorRef?.kind === 'value') STATEMENT_EXPLICIT_ACTORS.add(n);
          return done(nodes);
        }
        // 持ち物が空になるまで待つ / 持ち物が空のあいだ、くり返す: a condition on the list, not the list as a subject.
        if (subject.list && !order && /(?:まで、?(?:待つ|まつ|待って|まって|くり返す|繰り返す|くりかえす)|(?:の|である)?あいだ、|になったら、|になったとき、)/.test(surfaceMask(rest))) continue;
        // A list with a part's name is not one reading (決まり5), with みんな or without.
        if (subject.list && (symbols?.project?.components || []).some(c => c.name === meijinBare(phrase)))
          throw new AkariError('S316', `「${meijinBare(phrase)}」は、部品の 名前と リストの 名前が 同じなので、どちらの ことか 決まりません。どちらかの 名前を かえてください`);
        if (subject.list && !order)
          throw sentenceDiagnostic(`「${phrase}」は 部品の あつまりです。「${phrase}は、みんな…」「${phrase}は、順番に…」のように 書きます`, line, [], { kind: 'ParallelEach' });
        const list = subject.set || subject.list, lane = read(body, meijinValueActor(meijinBinderRead()), each);
        if (/^(?:順番|じゅんばん)に$/.test(order?.[1] || '')) return done([node('ForEach', { list, binder: MEIJIN_BINDER, body: lane, actorRef: { kind: 'self' } })]);
        return done([node('ParallelEach', { list, binder: MEIJIN_BINDER, body: lane })]);
      }
    }
    // 犬に「出発」と知らせる / 犬と鳥に… / なかまに…: the signal goes only to those parts.
    if ((p = surfaceCapture(/^(.+?)に(\u0001+)と知らせ(る|て、その合図で始まったことが(?:全部|ぜんぶ|すべて)終わるまで待つ)$/d, code, mask))) {
      const names = meijinPartList(p[0].text, symbols, scope) || (isMeijinPart(p[0].text, symbols, scope) ? [p[0].text] : null);
      const targets = names ? names.map(meijinPartRef) : meijinListName(p[0].text, symbols, scope) ? [meijinVariableRead(p[0].text)] : null;
      if (targets) {
        const message = parseExpression(p[1].text, symbols, scope), wait = p[2].text !== 'る';
        return done([node(wait ? 'BroadcastAndWait' : 'Broadcast', { message, targets, actorRef: wait ? { kind: 'all' } : { kind: 'self' } })]);
      }
    }
    // 星のコピーの動きを止める: what every copy of that part runs (the part itself goes on).
    if ((p = surfaceCapture(/^(.+?)のコピーの動きを止める$/d, code, mask)) && isMeijinPart(p[0].text, symbols, scope))
      return done([node('StopCommand', { op: 'COPIES', actorRef: { kind: 'named', name: p[0].text } })]);
    // ねこの動きを止める / ねこの音を止める / 星のコピーを全部消す / できたコピーを消す
    if ((p = surfaceCapture(/^(.+?)の(動き|音)を止める$/d, code, mask)) && isMeijinPart(p[0].text, symbols, scope))
      return done([p[1].text === '動き' ? node('StopCommand', { op: 'PART', actorRef: { kind: 'named', name: p[0].text } })
        : node('SoundCommand', { op: 'STOP_PART', args: [], actorRef: { kind: 'named', name: p[0].text } })]);
    if ((p = surfaceCapture(/^(.+?)のコピーを(?:全部|ぜんぶ|すべて)(?:消す|けす)$/d, code, mask)) && isMeijinPart(p[0].text, symbols, scope))
      return done([node('CloneCommand', { op: 'DELETE_ALL', args: [], actorRef: { kind: 'named', name: p[0].text } })]);
    if (/^(?:できた|作った)コピーを(?:消す|けす)$/.test(mask))
      return done([node('ParallelEach', { list: exprNode('CreatedCopies', {}), binder: MEIJIN_BINDER, body: read('このコピーだけを消す', meijinValueActor(meijinBinderRead()), each) })]);
    // ねこが話し終わるまで待つ / ねこの音が鳴り終わるまで待つ
    if ((p = surfaceCapture(/^(.+?)(が(?:話し|言い)終わる|の音が鳴り終わる)まで待つ$/d, code, mask)) && isMeijinPart(p[0].text, symbols, scope))
      return done([node('WaitUntil', { condition: exprNode('PartState', { state: p[1].text !== 'の音が鳴り終わる' ? 'speechDone' : 'soundDone', actorRef: { kind: 'named', name: p[0].text } }), actorRef: { kind: 'all' } })]);
    // ねこは、持ち物を一つずつ順に2秒話す: each item in order, said one after another.
    // The one who speaks is the subject written (a part, or a variable holding one), or the subject carried on; it is
    // carried to the next sentence (one subject, 決まり4). The list may be written in 【 】.
    if ((p = surfaceCapture(/^(?:(.+?)(?:は|が)、?)?(.+?)を(?:(?:一つずつ|ひとつずつ|1つずつ)順に(.+?)秒(?:ずつ)?|順に(.+?)秒ずつ|(.+?)秒ずつ(?:一つずつ|ひとつずつ|1つずつ)?順に)(?:話す|はなす|言う|いう)$/d, code, mask)) &&
        meijinListName(p[1].text, symbols, scope)) {
      const who = !p[0] ? { ...(scope.topicActor || { kind: 'self' }) } : isMeijinPart(p[0].text, symbols, scope) ? { kind: 'named', name: meijinBare(p[0].text) }
        : meijinVariableName(p[0].text, symbols, scope) ? meijinValueActor(meijinVariableRead(p[0].text)) : null;
      if (who) {
        const say = read(`【${MEIJIN_BINDER}】の値を${(p[2] || p[3] || p[4]).text}秒話す`, who, each);
        return done([node('ForEach', { list: meijinVariableRead(p[1].text), binder: MEIJIN_BINDER, body: say, actorRef: { kind: 'self' }, speaksAs: who })]);
      }
    }
    // 持ち物から「本」を全部消す: every item that is the same. 「一つ」か「全部」かがない「消す」は数が決まらない。
    if ((p = surfaceCapture(/^(\u0001+|[^、。\u0001]+?)から(.+?)を((?:全部|ぜんぶ|すべて))?(?:消す|けす)$/d, code, mask)) && meijinListName(p[0].text, symbols, scope)) {
      if (!p[2]) throw sentenceDiagnostic(`いくつ 消すかが 決まりません。「${p[0].text}から${p[1].text}を一つ消す」か「${p[0].text}から${p[1].text}を全部消す」と 書きます`, line,
        [{ label: '一つ消す', source: `${p[0].text}から${p[1].text}を一つ消す` }, { label: '全部消す', source: `${p[0].text}から${p[1].text}を全部消す` }], { kind: 'ListRemoveValue', missing: ['count'] });
      return done([node('ListRemoveValue', { target: { name: meijinBare(p[0].text), qualifier: null }, value: parseExpression(p[1].text, symbols, scope), actorRef: { ...scope.topicActor } })]);
    }
    // ねこは、犬が言い終わるまで待つ / ねこが言い終わるまで待ってから、… / 主役が言い終わるまで待つ: the one form that is read.
    if ((p = surfaceCapture(/^(.+?)(?:は|が)、?(.+?)が(?:言い|話し)終わるまで待つ$/d, code, mask)) && isMeijinPart(p[1].text, symbols, scope))
      throw sentenceDiagnostic(`だれが 待つかは 書きません（本文 ぜんたいが 待ちます）。れい：${p[1].text}が言い終わるまで待つ`, line, [], { kind: 'WaitUntil' });
    if ((p = surfaceCapture(/^(.+?)が((?:言い|話し)終わる)まで待って(?:から)?、(.+)$/d, code, mask)))
      throw sentenceDiagnostic(`待つ 文を 分けて 書きます。れい：${p[0].text}が${p[1].text}まで待つ。${p[2].text}`, line, [], { kind: 'WaitUntil' });
    if ((p = surfaceCapture(/^(.+?)が(?:言い|話し)終わるまで待つ$/d, code, mask)) && !isMeijinPart(p[0].text, symbols, scope))
      throw sentenceDiagnostic('「〜が言い終わるまで待つ」の 〜には、部品の 名前を 書きます', line, [], { kind: 'WaitUntil' });
    // 【長さ】を5として、…、ねこは【かく】という手順を行う: the subject is written first.
    if ((p = surfaceCapture(/^(.+として)、(.+?)(?:は|が)、?(\u0001+という(?:手順|てじゅん)を行う)$/d, code, mask)) && isMeijinPart(p[1].text, symbols, scope))
      throw sentenceDiagnostic(`主語は 文の はじめに 書きます。れい：${p[1].text}は、${p[0].text}、${p[2].text}`, line, [], { kind: 'UserActionCall' });
    // ねこは、犬にいちばん近い星の方を向く: what it is near is chosen from a list.
    if ((p = surfaceCapture(/^(.+?)(?:は|が)、?(.+?)にいちばん近い(.+?)の方を向く$/d, code, mask)) && isMeijinPart(p[1].text, symbols, scope))
      throw sentenceDiagnostic(`何に 近いかを 書くときは、リストから えらびます。れい：えらんだ部品を、なかまのうち、${p[1].text}にいちばん近いものにする`, line, [], { kind: 'MotionCommand' });
    // Words that give no single meaning to a program (名人モードでも読めない書き方): say how to write it.
    const inName = m => meijinPartNames(symbols).find(name => { for (let at = code.indexOf(name); at >= 0; at = code.indexOf(name, at + 1)) if (at <= m.index && m.index + m[0].length <= at + name.length) return true; return false; });
    // ねこが「星」にふれたら、 with what to do on the next lines: 〜にふれたら waits once for the action on its own line;
    // what is done each time is written under the heading 〜にふれたとき、.
    if ((p = surfaceCapture(/^(?!もし)(.+?)が(.+?)に(?:ふれ|触れ)たら、?$/d, code, mask)) && isMeijinPart(p[0].text, symbols, scope)) {
      const each = `${p[0].text}が${p[1].text}にふれたとき、`;
      throw sentenceDiagnostic(`「${p[0].text}が${p[1].text}にふれたら、」は、することを 同じ 行に つづけて 書きます（ふれるまで 待ってから 一度だけ します）。ふれる たびに するなら「${each}」と 書いて、次の 行を 右へ ずらします`, line,
        env.indent === 0 && env.top ? [{ label: 'ふれる たびに する', source: each }] : [], { kind: 'IfStatement' });
    }
    for (const [pattern, message] of MEIJIN_UNREADABLE) { const m = pattern.exec(mask); if (m) throw sentenceDiagnostic((typeof message === 'function' ? message(m, code) : message) + (inName(m) ? `。部品の 名前なら「【${inName(m)}】」のように【 】で かこみます` : ''), line, [], { kind: 'Sequence' }); }
    // ねこは、一辺が20歩の四角をかく: which input of the procedure takes 20歩 is not written.
    if (!/^もし/.test(mask) && (p = surfaceCapture(/^(?:(.+?)(?:は|が)、?)?([^、。\u0001]+?)が([^、。]+?)の(.+?を(?:かく|描く|作る))$/d, code, mask))) {
      const [actor, noun, value, rest] = p.map(x => x?.text), procedure = [...(symbols?.actions?.values() || [])].find(d => d.name === rest && d.args?.length);
      const named = procedure ? procedure.args.find(a => a.startsWith(noun)) || procedure.args[0] : noun + 'の長さ', name = procedure ? procedure.name : rest;
      const input = bareName(named) ? named : `【${named}】`;
      throw sentenceDiagnostic(`「${noun}が${value}の${rest}」では、${value}を 手順の どの 入れるものに わたすかが 決まりません。` +
        `「${actor ? actor + 'は、' : ''}${input}を${value}として、【${name}】という手順を行う」のように 書きます` + (procedure ? '' : `（先に【${name}】という手順を、${input}を受け取って作ります）`), line, [], { kind: 'UserActionCall', missing: ['argumentName'] });
    }
    // ねこは前へ十歩進む: numbers are written in digits (一つ in 一つ消す・一つずつ is a word, not a count).
    for (const m of mask.matchAll(/[〇一二三四五六七八九十百千万]+(?:歩|秒|回|度|個|番目|点|つ)/g))
      if (!/^一つ$/.test(m[0]) && !/[\p{Script=Han}]/u.test(mask[m.index - 1] || ''))
        throw sentenceDiagnostic(`「${m[0]}」は 漢数字です。名人モードでも、数は「${meijinDigits(m[0])}」のように 数字で 書きます`, line, [], { kind: 'Sequence' });
    if (!scope.meijinProbe) {
      const near = meijinNearMiss(code, mask, symbols, scope, env, line, read, attempt);
      if (near) throw sentenceDiagnostic(near, line, [], { kind: 'Sequence' });
    }
    const rewrites = line.meijinRewrites || 0, rewritten = rewrites < 6 && meijinRewrite(code, symbols, scope);
    if (rewritten && rewritten !== code) {
      const next = surfaceLineSlice(line, 0, code.length, rewritten);
      const owned = meijinPartNames(symbols).find(name => code.startsWith(name + 'の') && rewritten.startsWith(name + 'は'));
      Object.assign(next, { comment: line.comment, inline: line.inline, meijinRewrites: rewrites + 1, meijinOwned: line.meijinOwned || !!owned });
      return { rewrite: next };
    }
    return null;
  }
  // A sentence of 名人 inside another (もし…なら、主役は…): the same reading without the lines around it.
  function readMeijinSentence(line, symbols, ctx) {
    if ((ctx.meijinDepth || 0) > 8) return null;
    const scope = { ...ctx, meijinDepth: (ctx.meijinDepth || 0) + 1 };
    const read = readMeijinLine(line, { symbols, scope, lines: [line], top: false, index: 0, indent: line.indent || 0, nextCode: i => i, children: null });
    if (!read) return null;
    return read.rewrite ? parseSentenceSequence(read.rewrite, symbols, ctx) : read.nodes;
  }
