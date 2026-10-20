  // ────────────────────────────────────────────────────────────────────────
  // 04 — 名人 syntax: natural sentences read only in 名人 scripts
  // ────────────────────────────────────────────────────────────────────────
  // A 名人 script belongs to no part; its writer moves the parts. A line is read here before the common grammar:
  // into the 名人 nodes (PartRef, value subjects, Parallel, ParallelEach, part sets), or as the common sentence
  // with the same meaning. A line that is no 名人 form is read by the common grammar unchanged.
  const MEIJIN_BINDER = 'この部品';
  const MEIJIN_SET_WORDS = /^(みんな|それぞれ|順番に)、?/;
  const meijinEscape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // The 名人 forms below read a name written in 【 】 as the same name: the mask shows those spans, and the name is
  // looked up without them.
  const meijinBare = text => text.replace(/^【(.*)】$/, '$1');
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
  const meijinListName = (name, symbols, ctx = {}) => dataNameKind(name, symbols, ctx) === 'list';
  const meijinVariableName = (name, symbols, ctx = {}) =>
    dataNameKind(name, symbols, ctx) === 'variable' || (ctx.args || []).includes(name);
  // ねこと犬と鳥 / ねこ、犬、鳥 / ねこや犬: two or more parts written together.
  function meijinPartList(text, symbols, ctx) {
    // A name in 【 】 is one name, whatever it holds (【とり】).
    const names = [];
    let at = 0;
    for (const m of text.matchAll(/【[^】]*】|と|、|や/g)) if (!m[0].startsWith('【')) { names.push(text.slice(at, m.index)); at = m.index + m[0].length; }
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
  const MEIJIN_WHEN_PRESSED_MESSAGE = '「〜がおされると、」では、できごとか、その時を 待つのかが 決まりません。できごとなら「ねこがおされたとき、」、待つなら「ねこが1回おされるまで待つ。」と 書きます';
  const MEIJIN_UNREADABLE = [
    [MEIJIN_WHEN_PRESSED, MEIJIN_WHEN_PRESSED_MESSAGE],
    [/いちばん近い(?![^、。]*?(?:の方を向く|までの(?:きょり|距離)))/, '「いちばん近い」は「〜の方を向く」と「〜までのきょり」で 使います。れい：ねこは、いちばん近い星の方を向く'],
    [/(?:のに|けれど|けれども|けど)、/, '「〜のに」「〜けれど」では、いつ 何を するかが 決まりません。「もし〜なら、」と「そうでなければ、」で 書きます'],
    [/(?:すこし|少し|ちょっと|しばらく|何度も|なんども|何回も|なんかいも|たくさん)/, m => `「${m[0]}」では、量や 時間が 決まりません。「10歩」「2秒」「3回」のように 数で 書きます`],
    [/(?:もう一度|もういちど|もう1度|もう一回|もういっかい|もう1回)/, m => `「${m[0]}」では、どの 文を 何回 するかが 決まりません。する 文を もう一度 書くか、「2回くり返す」のように 書きます`],
    [/(?:となり|隣)(?:へ|に|まで)/, '「となり」では、どこへ 行くかが 決まりません。「〜のところへ行く」か、歩の 数を 書きます'],
    [/^(それ|あれ|これ)(?:は|が)/, m => `「${m[1]}」では、どの 部品かが 決まりません。部品の 名前を 書きます`],
    [/話しかける$/, '「話しかける」では、何を するかが 決まりません。「ねこは「やあ」と言う」のように 書きます'],
    [/言い終わる/, '「言い終わる」では、何が 終わるかが 決まりません。時間を 書いて 話したときは「ねこが話し終わるまで待つ」と 書きます'],
    [/(?:と同じように|(?<!次)のように)/, '「〜のように」では、まねる はんいが 決まりません。する ことを 一つずつ 文に 書きます'],
    [/(?:はし|端)まで(?:進む|動く|行く)$/, '速さが 決まりません。「1秒に20歩の速さで、画面のはしにふれるまで前へ動き続ける」のように 書きます'],
    [/て(?:ください|くれ|ほしい)$/, 'お願いの 形は 読みません。「ねこは右へ10歩動く」のように、する ことを 書きます'],
    [/ので、/, '「〜ので」は 理由を 言う ことばで、いつ するかは 決まりません。しらべるときは「もし〜なら、」、そうなるまで 待つときは「〜になったら、」と 書きます'],
    [/ても、/, '「〜ても」では、いつ 何を するかが 決まりません。「もし〜なら、」と「そうでなければ、」で 書きます'],
    [/(?:たり|だり)、.+(?:たり|だり)する$/, '「〜たり、〜たりする」では、どちらを いつ するかが 決まりません。する ことを 一つずつ 文に 書きます'],
    [/の近く(?:へ|に|まで)/, '「近く」では、どこまで 行くかが 決まりません。「〜のところへ行く」か、歩の 数を 書きます'],
    [/^((?:その|あの)(?:子|人|もの|部品))(?:は|が)/, m => `「${m[1]}」では、どの 部品かが 決まりません。部品の 名前を 書きます`],
    [/て(?:あげる|あげます|くれる|もらう)$/, '「〜てあげる」「〜てもらう」は、プログラムでは する ことが かわらないので 書きません。「ねこは「やあ」と言う」のように 書きます'],
    [/[0-9０-９]+回目に/, '何の 回数かが 決まりません。「もし回数が3と同じなら、」のように、数える 変数で しらべます'],
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
    if (!/(?:動き続ける|動きつづける|うごき続ける)$/.test(mask)) return null;
    let actorRef = scope.topicActor || { kind: 'self' }, rest = code, explicit = false;
    const subject = surfaceCapture(/^(.+?)(?:は|が)、?(.+)$/d, code, mask);
    if (subject && (isMeijinPart(subject[0].text, symbols, scope) || meijinVariableName(subject[0].text, symbols, scope))) {
      actorRef = isMeijinPart(subject[0].text, symbols, scope) ? { kind: 'named', name: subject[0].text } : meijinValueActor(exprNode('VariableRead', { name: subject[0].text, qualifier: null }));
      rest = subject[1].text; explicit = true;
    }
    const m = surfaceCapture(/^(?:(.+?)秒に(.+?)歩の速さで、?)?(?:(.+?)まで、?)?(?:画面の)?(前|後ろ|右|左|上|下)(?:へ|に)(?:(.+?)秒に(.+?)歩の速さで)?(?:動き続ける|動きつづける|うごき続ける)$/d, rest);
    if (!m) return null;
    const seconds = m[0] || m[4], distance = m[1] || m[5], until = m[2];
    if (!until === !timed) return null;
    if (!seconds) throw sentenceDiagnostic('「〜まで動き続ける」には、「1秒に20歩の速さで」のように 速さを 書きます。れい：ねこは、1秒に20歩の速さで、ゴールにふれるまで前へ動き続ける', line, [], { kind: 'MoveUntil', missing: ['speed'] });
    const local = { ...scope, topicActor: actorRef }, e = text => parseExpression(text, symbols, local);
    return { actorRef, explicit, direction: MEIJIN_DIRECTIONS[m[3].text], seconds: sentenceQuantity(e(seconds.text), '秒'), distance: sentenceQuantity(e(distance.text), '歩'),
      ...(until ? { condition: parseCondition(until.text + 'まで', symbols, local, 'until') } : {}) };
  }

  // In-text procedures: 【ジャンプ】という手順を、次のように作る。 The body is read as the procedure; the sentence
  // only registers it. Each becomes a procedure of the work (an id in the 名人 script's own namespace).
  const MEIJIN_DEFINITION = /^【(.+?)】という手順を、(?:(.+?)を受け取って、)?次のように作る$/d;
  function meijinDefinitionArgs(text) {
    if (!text) return [];
    const strip = name => name.replace(/^【(.*)】$/, '$1');
    const byComma = text.split('、');
    if (byComma.length > 1) return byComma.map(strip);
    const byAnd = text.split('と');
    return (byAnd.length > 1 && byAnd.every(Boolean) ? byAnd : [text]).map(strip);
  }
  function meijinDefinitions(script) {
    const lines = String(script.source || '').split('\n'), out = [];
    for (let i = 0; i < lines.length; i++) {
      const head = /^([^ \t　].*?)。?$/.exec(lines[i]), m = head && MEIJIN_DEFINITION.exec(compactOutsideString(head[1]));
      if (!m) continue;
      const body = []; let j = i + 1;
      while (j < lines.length && (!lines[j].trim() || /^ /.test(lines[j]))) body.push(lines[j++]);
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
  const MEIJIN_WORD = '(空|からっぽ|空っぽ|偶数|奇数|[0-9０-９]+の倍数|[0-9０-９]+の約数)';
  const MEIJIN_WORD_ENDING = '(なら|だったら|でなければ|でないなら|ではないなら|じゃないなら|ではなかったら|のあいだ|であるあいだ|になるまで)';
  function meijinWordCheck(subject, word) {
    const n = /^([0-9０-９]+)の(倍数|約数)$/.exec(word);
    if (/^(?:空|からっぽ|空っぽ)$/.test(word)) return { same: `${subject}の長さが0と同じ` };
    if (word === '偶数') return { same: `${subject}÷2のあまりが0と同じ` };
    if (word === '奇数') return { same: `絶対値（${subject}÷2のあまり）が1と同じ` };
    if (n?.[2] === '倍数') return { same: `${subject}÷${n[1]}のあまりが0と同じ` };
    return { holds: `条件（${subject}が0とちがう かつ ${n[1]}÷${subject}のあまりが0と同じ）` };
  }
  // The check with its ending: なら・だったら / でなければ・でないなら… / のあいだ / になるまで / (none: the bare condition).
  function meijinWordTest(subject, word, ending = '') {
    const { same, holds } = meijinWordCheck(subject, word);
    const kind = /^(?:なら|だったら)$/.test(ending) ? 'if' : /^(?:でなければ|でないなら|ではないなら|じゃないなら|ではなかったら)$/.test(ending) ? 'not'
      : /あいだ$/.test(ending) ? 'while' : ending === 'になるまで' ? 'until' : 'bare';
    if (same) return same + { if: 'なら', not: 'でなければ', while: 'であるあいだ', until: 'になるまで', bare: '' }[kind];
    return holds + { if: 'が成り立つなら', not: 'が成り立たないなら', while: 'が成り立つあいだ', until: 'が成り立つまで', bare: 'が成り立つ' }[kind];
  }

  // 名人のできごと: だんごが星にふれたとき、/ 点数が10点以上になったとき、/ 1秒ごとに、
  function readMeijinHeading(code, mask, symbols, ctx) {
    let p;
    if (MEIJIN_WHEN_PRESSED.test(mask)) throw new AkariError('P205', MEIJIN_WHEN_PRESSED_MESSAGE);
    if ((p = surfaceCapture(/^(.+?)が(.+?)に(?:ふれた|触れた|さわった)(?:とき|ら)、(.*)$/d, code, mask)) && isMeijinPart(p[0].text, symbols, ctx) && isMeijinPart(p[1].text, symbols, ctx))
      return { heading: { event: 'touchStart', actorRef: { kind: 'named', name: meijinBare(p[0].text) }, filter: { target: meijinBare(p[1].text) } }, body: p[2], actor: p[0] };
    // 1秒ごとに: a number. The time is read once, before the first sentence runs, so a variable would not mean what it says.
    if ((p = surfaceCapture(/^(.+?)秒ごとに、(.*)$/d, code, mask))) {
      const seconds = parseExpression(p[0].text, symbols, ctx);
      if (seconds.kind !== 'NumberLiteral')
        throw new AkariError('P205', '「〜秒ごとに」の 時間は、作品を 動かしたときに 一度だけ 決まるので、へんすうは 書けません。数を 書きます。変わる 間かくで くり返すときは「ずっとくり返す。」の 中に「間隔秒待つ。」と 書きます');
      if (!(seconds.value > 0))
        throw new AkariError('P205', '「〜秒ごとに」には、0より 大きい 数を 書きます。変わる 間かくで くり返すときは「ずっとくり返す。」の 中に「間隔秒待つ。」と 書きます');
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
    const alt = parts.flatMap(name => ['【' + meijinEscape(name) + '】', meijinEscape(name)]).join('|'), nameMask = meijinNameMask(code),
      capture = pattern => surfaceCapture(new RegExp(pattern, 'd'), code, nameMask);
    let p;
    const own = (part, name) => {
      const component = symbols.project.components.find(c => c.name === meijinBare(part));
      return !!(component?.localData?.variables?.some(v => v.name === name) || component?.localData?.lists?.some(v => v.name === name));
    };
    // ねこの大きさを120％にする / ねこの色を「赤」にする / ねこの体力を1減らす: a change of a part's state, written by the
    // one who moves the parts, is the part's own command.
    const looks = ['ペンの太さ', 'ペンの色', '音の大きさ', '音の高さ', 'よこのばしょ', 'たてのばしょ', '表示色', '大きさ', 'すがた', '向き', '色'];
    if ((p = capture('^(' + alt + ')の(.+?)を(.+?(?:に(?:する|かえる|変える)|(?:増やす|ふやす|減らす|へらす)|段階(?:上げる|下げる)))$'))) {
      const [part, what, rest] = p.map(x => x.text);
      if (looks.includes(what) && own(part, what))
        throw new AkariError('P205', `「${part}の${what}」が、${part}の ようすか、${part}の 変数「${what}」か 決まりません。変数なら「${part}の【${what}】」のように【 】で かこみます`);
      if (looks.includes(what)) return part + 'は' + (what === '色' ? '表示色' : what) + 'を' + rest;
      if (own(part, what)) return part + 'は自分の' + what + 'を' + rest;
      // ねこの【大きさ】を5にする: the part's own data, written in 【 】 as the message above says.
      if (/^【.+】$/.test(what) && own(part, meijinBare(what))) return part + 'は自分の' + what + 'を' + rest;
    }
    if ((p = capture('^(' + alt + ')のペンを(下ろす|おろす|上げる|あげる)$'))) return p[0].text + 'はペンを' + p[1].text;
    if ((p = capture('^(' + alt + ')のすがたを(かくす|隠す|見せる|みせる)$'))) return p[0].text + 'はすがたを' + p[1].text;
    // ねこは、だんごのところへ行く / …へ1秒かけて動く / ゴールまで行く: to where the other part is when the sentence runs.
    const place = other => `よこ（「${meijinBare(other)}」のよこのばしょ）歩、たて（「${meijinBare(other)}」のたてのばしょ）歩のばしょへ`;
    if ((p = capture('^(' + alt + ')(?:は|が)、?(' + alt + ')(?:のところ(?:へ|まで)|まで)(?:行く|いく|動く|うごく)$')))
      return `${p[0].text}は、${place(p[1].text)}行く`;
    if ((p = capture('^(' + alt + ')(?:は|が)、?(' + alt + ')(?:のところ(?:へ|まで)|まで)(.+?)秒かけて(?:動く|うごく|行く|いく)$')))
      return `${p[0].text}は、${place(p[1].text)}${p[2].text}秒かけて動く`;
    // 点数を、なかまの数にする / なかまを、ねこと犬と鳥にする: a comma after を; parts written together are a list.
    if ((p = surfaceCapture(/^([^、。\u0001]+?)を、?(.+?)に(する|かえる|変える)$/d, code, mask)) && dataNameKind(p[0].text, symbols, ctx)) {
      const names = meijinPartList(p[1].text, symbols, ctx);
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
    const side = { 右: ['よこ', '大き'], 左: ['よこ', '小さ'], 上: ['たて', '小さ'], 下: ['たて', '大き'] };
    replaceAll(new RegExp('(' + alt + ')が(' + alt + ')より(右|左|上|下)に(いれば|いなければ|いるあいだ|いるまで|いる)'), m => {
      const [axis, size] = side[m[3]], ending = { いれば: 'ければ', いなければ: 'くなければ', いるあいだ: 'いあいだ', いるまで: 'くなるまで', いる: 'い' }[m[4]];
      return `「${meijinBare(m[1])}」の${axis}のばしょが「${meijinBare(m[2])}」の${axis}のばしょより${size}${ending}`;
    });
    // ねこから犬までのきょり: one part's distance to another.
    replaceAll(new RegExp('(' + alt + ')から(' + alt + ')までの(?:きょり|距離)'), m => `「${meijinBare(m[1])}」の（「${meijinBare(m[2])}」までのきょり）`);
    // 持ち物が空なら / 点数が偶数でなければ / 点数が10の倍数だったら / 持ち物が空のあいだ: the words of 国語 and 算数.
    replaceAll(new RegExp('(もし、?|、|^)' + MEIJIN_WORD_SUBJECT + 'が' + MEIJIN_WORD + MEIJIN_WORD_ENDING), m => `${m[1]}${meijinWordTest(m[2], m[3], m[4])}`);
    if (changed) return out;
    // 点数が10点になったら、ねこは…: wait until it becomes so, then do it (once).
    if (!/^もし/.test(mask) && (p = surfaceCapture(/^(.+?)になったら、(.+)$/d, code, mask))) return p[0].text + 'になるまで待って、' + p[1].text;
    // 持ち物から「本」を一つ消す: the first one; nothing happens when there is none.
    if ((p = surfaceCapture(/^([^、。\u0001]+?)から(.+?)を(?:一つ|ひとつ|1つ)(?:消す|けす)$/d, code, mask)) && meijinListName(p[0].text, symbols, ctx)) {
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
      if (list && !previousTopic) throw new AkariError('P205', '「ほかの」は、すぐ前の 文の 主語を のぞいた ものです。すぐ前の 文に、だれが するかを 書きます');
      if (list) return { set: exprNode('PartExcept', { list, except: previousTopic }) };
    }
    if ((p = /^(.+?)のだれか(?:一人|ひとり|1人)$/.exec(phrase))) {
      const list = set(p[1]);
      if (list) return { set: exprNode('PartRandom', { list }) };
    }
    if ((p = /^(.+?)のうち、(?:いちばん)?(右|左|上|下)にいる(?:ほう|もの)$/.exec(phrase))) {
      const list = set(p[1]);
      if (list) return { set: exprNode('PartPick', { list, by: { kind: 'position', side: p[2] } }) };
    }
    if ((p = /^(.+?)のうち、(?:いちばん)?(.+?)が(大きい|小さい)(?:ほう|もの)$/.exec(phrase))) {
      const list = set(p[1]);
      if (list) return { set: exprNode('PartPick', { list, by: { kind: 'variable', name: p[2], order: p[3] === '大きい' ? 'max' : 'min' } }) };
    }
    if ((p = /^(.+?)に(?:ふれ|触れ|さわっ)ている(.+)$/.exec(phrase)) && isMeijinPart(p[1], symbols, ctx)) {
      const of = p[2] === 'もの' ? null : isMeijinPart(p[2], symbols, ctx) ? p[2] : undefined;
      if (of !== undefined) return { set: exprNode('PartsTouching', { target: meijinPartRef(p[1]), ...(of ? { of: meijinPartRef(of) } : {}) }) };
    }
    if (/^(?:できた|作った)コピー$/.test(phrase)) return { set: exprNode('CreatedCopies', {}) };
    if (meijinListName(phrase, symbols, ctx)) return { list: exprNode('VariableRead', { name: phrase, qualifier: null }) };
    if (meijinVariableName(phrase, symbols, ctx) && !isMeijinPart(phrase, symbols, ctx))
      return { value: exprNode('VariableRead', { name: phrase, qualifier: null }) };
    return null;
  }
  function meijinSetExpression(text, symbols, ctx, previousTopic) {
    const names = meijinPartList(text, symbols, ctx);
    if (names) return exprNode('ListLiteral', { items: names.map(meijinPartRef) });
    if (meijinListName(text, symbols, ctx)) return exprNode('VariableRead', { name: text, qualifier: null });
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
    const fails = () => !attempt(() => read(code));
    let p;
    // ねこは2秒かけて…動くあいだ、犬は… / だんごは星にふれたとき、…: the subject before あいだ・とき is written with が.
    if ((p = surfaceCapture(/^(.+?)は、?(.+?)(あいだ|間|うちに|とき)、(.+)$/d, code, mask)) && part(p[0].text) && fails()) {
      const fixed = `${p[0].text}が${p[1].text}${p[2].text}、${p[3].text}`;
      if (p[2].text === 'とき' || attempt(() => readMeijinLine(surfaceLineSlice(line, 0, code.length, fixed), env)))
        return `「〜${p[2].text}」の 前の 主語は「が」で 書きます。れい：${fixed}`;
    }
    // 点数が偶数じゃなかったら、: a word of 国語・算数 with an ending that is not read.
    if ((p = new RegExp('^(?:もし、?)?' + MEIJIN_WORD_SUBJECT + 'が' + MEIJIN_WORD + '(?!' + MEIJIN_WORD_ENDING + '|になったら|になったとき)').exec(mask)) && fails())
      return `「${p[2]}」は、「${p[1]}が${p[2]}なら」「${p[1]}が${p[2]}でなければ」の 形で 書きます`;
    // ねこは1秒に20歩の速さで前へ動き続ける: when it stops is not written.
    if (/動き続ける$/.test(mask) && !/まで|あいだ|間/.test(mask) && fails())
      return '「動き続ける」には、いつまで 動くかを 書きます。れい：ねこは、1秒に20歩の速さで、ゴールにふれるまで前へ動き続ける／10秒のあいだ、ねこは1秒に20歩の速さで前へ動き続ける';
    // 犬が「出発」の合図を受けたとき、: the heading of a signal.
    if ((p = surfaceCapture(/^(.+?)が(\u0001+)の合図を(?:受けた|うけた)とき、/d, code, mask)) && part(p[0].text))
      return `合図を 受けるときは「${p[1].text}という合図を受けたとき、${p[0].text}は、」と 書きます`;
    // ねこは、持ち物を一つずつ順に言う: the time for each is not written.
    if ((p = surfaceCapture(/^(.+?)(?:は|が)、?(.+?)を(?:一つずつ|ひとつずつ|1つずつ)順に(?:話す|はなす|言う|いう)$/d, code, mask)) && part(p[0].text))
      return `一つを 話す 時間を 書きます。れい：${p[0].text}は、${p[1].text}を一つずつ順に2秒話す`;
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
    if ((p = surfaceCapture(/^(\u0001+)という手順を、(?:(.+?)を受け取って、)?次のように作る$/d, code, mask)) && /^【.+】$/.test(p[0].text)) {
      if (env.indent !== 0 || !env.top) throw sentenceDiagnostic('手順は、右へ ずらさない 行で 作ります（「もし」や「くり返す」の 中では 作れません）', line, [], { kind: 'ActionDefinition' });
      indented('ActionDefinition', '「〜という手順を、次のように作る」の 次の 行に、手順の 中身を 右へ ずらして 書きます');
      let end = env.index + 1;
      while (end < env.lines.length && (!env.lines[end].code || env.lines[end].indent > env.indent)) end++;
      return { nodes: [node('ActionDefinition', { name: p[0].text.slice(1, -1), args: meijinDefinitionArgs(p[1]?.text) })], index: end };
    }
    // 次のことを同時に始める。 (the lines under it start together)
    if (/^次のことを(?:同時に|いっしょに|一緒に)始める$/.test(mask)) {
      const body = children(indented('Parallel', '「次のことを同時に始める」の 次の 行に、同時に 始める 文を 右へ ずらして 書きます'), { ...scope });
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
    if ((p = surfaceCapture(/^(.+?)が(.+?)(あいだ|間|うちに)、(.+)$/d, code, mask)) && isMeijinPart(p[0].text, symbols, scope)) {
      for (const verb of [p[1].text, ...meijinPlainForms(p[1].text)]) {
        const left = attempt(() => read(p[0].text + 'は' + verb));
        if (left) return done([node('Parallel', { lanes: [left, read(p[3].text)] })]);
      }
      // ねこが動いているうちに: no action to start. Reading it as a state would give the same words two timings.
      if (p[2].text === 'うちに')
        throw sentenceDiagnostic(`「〜しているうちに」は、同時に 始める 動作を 書きます。れい：${p[0].text}が2秒かけて画面の右へ40歩動いているうちに、${p[3].text}`, line, [], { kind: 'Parallel', missing: ['action'] });
    }
    // XはPしながら、Q: two actions of one part started together.
    if ((p = surfaceCapture(/^(.+?)(?:は|が)、?(.+?)ながら、(.+)$/d, code, mask)) && isMeijinPart(p[0].text, symbols, scope)) {
      for (const verb of meijinDictionary(p[1].text)) {
        const first = attempt(() => read(p[0].text + 'は' + verb));
        if (first) return done([node('Parallel', { lanes: [first, read(p[0].text + 'は' + p[2].text)] })]);
      }
    }
    // なかまを、できたコピーにする / なかまを、ゴールにふれているものにする: the parts of a set at that moment are kept in
    // a list. A variable holds one part, so a set put into it is stopped.
    if ((p = surfaceCapture(/^([^、。\u0001]+?)を、?(.+?)に(?:する|かえる|変える)$/d, code, mask)) && dataNameKind(p[0].text, symbols, scope)) {
      const set = meijinSubject(p[1].text, symbols, scope, previousTopic)?.set;
      if (set) {
        if (!meijinListName(p[0].text, symbols, scope)) throw sentenceDiagnostic(meijinSetIntoVariable(p[0].text) + (set.kind === 'CreatedCopies' ? '。「できたコピー」は、一つ だけ 作っても あつまりです。一つを 入れるときは、リストに 入れてから「' + p[0].text + 'を、なかまの1番目にする」のように 書きます' : ''), line, [], { kind: 'Assignment' });
        return done([node('Assignment', { target: { name: p[0].text, qualifier: null }, value: set })]);
      }
    }
    // A subject phrase: several parts, a set, or a variable holding a part. Every は／が is tried as its end.
    {
      const both = surfaceCapture(/^(.+?)も(.+?)も、?(.+)$/d, code, mask);
      if (both && isMeijinPart(both[0].text, symbols, scope) && isMeijinPart(both[1].text, symbols, scope))
        return done([node('Parallel', { lanes: [both[0].text, both[1].text].map(name => read(name + 'は' + meijinBody(both[2].text))) })]);
      const ends = [...mask.matchAll(/[はが]/g)].map(m => m.index).filter(at => at > 0 && at < mask.length - 1);
      for (const at of ends) {
        const phrase = code.slice(0, at), particle = mask[at], restStart = at + 1 + (mask[at + 1] === '、' ? 1 : 0);
        const subject = meijinSubject(phrase, symbols, scope, previousTopic);
        if (!subject) continue;
        const rest = code.slice(restStart), order = MEIJIN_SET_WORDS.exec(surfaceMask(rest)), body = meijinBody(order ? rest.slice(order[0].length) : rest);
        if (subject.lanes) return done([node('Parallel', { lanes: subject.lanes.map(name => read(name + 'は' + body)) })]);
        if (subject.value) {
          // 主役は右へ10歩動く / 主役が右へ10歩動く: the part in 主役 acts. (点数が10になったら… is no subject: it does not read so.)
          if (order) throw sentenceDiagnostic(`「みんな」「それぞれ」「順番に」は、部品の あつまりに 使います。「${phrase}」は 部品 一つなので、「${phrase}は${body}」と 書きます`, line, [], { kind: 'ParallelEach' });
          const nodes = attempt(() => read(body, meijinValueActor(subject.value)));
          if (!nodes) continue;
          for (const n of nodes) if (n.actorRef?.kind === 'value') STATEMENT_EXPLICIT_ACTORS.add(n);
          return done(nodes);
        }
        // 持ち物が空になるまで待つ / 持ち物が空のあいだ、くり返す: a condition on the list, not the list as a subject.
        if (subject.list && !order && /(?:まで、?(?:待つ|まつ|待って|まって|くり返す|繰り返す|くりかえす)|(?:の|である)?あいだ、|になったら、|になったとき、)/.test(surfaceMask(rest))) continue;
        if (subject.list && !order)
          throw sentenceDiagnostic(`「${phrase}」は 部品の あつまりです。「${phrase}は、みんな…」「${phrase}は、順番に…」のように 書きます`, line, [], { kind: 'ParallelEach' });
        const list = subject.set || subject.list, lane = read(body, meijinValueActor(meijinBinderRead()), each);
        if (order?.[1] === '順番に') return done([node('ForEach', { list, binder: MEIJIN_BINDER, body: lane, actorRef: { kind: 'self' } })]);
        return done([node('ParallelEach', { list, binder: MEIJIN_BINDER, body: lane })]);
      }
    }
    // 犬に「出発」と知らせる / 犬と鳥に… / なかまに…: the signal goes only to those parts.
    if ((p = surfaceCapture(/^(.+?)に(\u0001+)と知らせ(る|て、その合図で始まったことが(?:全部|ぜんぶ|すべて)終わるまで待つ)$/d, code, mask))) {
      const names = meijinPartList(p[0].text, symbols, scope) || (isMeijinPart(p[0].text, symbols, scope) ? [p[0].text] : null);
      const targets = names ? names.map(meijinPartRef) : meijinListName(p[0].text, symbols, scope) ? [exprNode('VariableRead', { name: p[0].text, qualifier: null })] : null;
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
    if ((p = surfaceCapture(/^(.+?)(が話し終わる|の音が鳴り終わる)まで待つ$/d, code, mask)) && isMeijinPart(p[0].text, symbols, scope))
      return done([node('WaitUntil', { condition: exprNode('PartState', { state: p[1].text === 'が話し終わる' ? 'speechDone' : 'soundDone', actorRef: { kind: 'named', name: p[0].text } }), actorRef: { kind: 'all' } })]);
    // ねこは、持ち物を一つずつ順に2秒話す: each item in order, said one after another.
    if ((p = surfaceCapture(/^(.+?)(?:は|が)、?(.+?)を(?:一つずつ|ひとつずつ|1つずつ)順に(.+?)秒(?:話す|はなす|言う|いう)$/d, code, mask)) &&
        isMeijinPart(p[0].text, symbols, scope) && meijinListName(p[1].text, symbols, scope)) {
      const say = read(`${p[0].text}は【${MEIJIN_BINDER}】の値を${p[2].text}秒話す`, scope.topicActor, each);
      return done([node('ForEach', { list: exprNode('VariableRead', { name: p[1].text, qualifier: null }), binder: MEIJIN_BINDER, body: say, actorRef: { kind: 'self' } })]);
    }
    // 持ち物から「本」を全部消す: every item that is the same. 「一つ」か「全部」かがない「消す」は数が決まらない。
    if ((p = surfaceCapture(/^([^、。\u0001]+?)から(.+?)を((?:全部|ぜんぶ|すべて))?(?:消す|けす)$/d, code, mask)) && meijinListName(p[0].text, symbols, scope)) {
      if (!p[2]) throw sentenceDiagnostic(`いくつ 消すかが 決まりません。「${p[0].text}から${p[1].text}を一つ消す」か「${p[0].text}から${p[1].text}を全部消す」と 書きます`, line,
        [{ label: '一つ消す', source: `${p[0].text}から${p[1].text}を一つ消す` }, { label: '全部消す', source: `${p[0].text}から${p[1].text}を全部消す` }], { kind: 'ListRemoveValue', missing: ['count'] });
      return done([node('ListRemoveValue', { target: { name: p[0].text, qualifier: null }, value: parseExpression(p[1].text, symbols, scope), actorRef: { ...scope.topicActor } })]);
    }
    // Words that give no single meaning to a program (名人モードでも読めない書き方): say how to write it.
    for (const [pattern, message] of MEIJIN_UNREADABLE) { const m = pattern.exec(mask); if (m) throw sentenceDiagnostic(typeof message === 'function' ? message(m) : message, line, [], { kind: 'Sequence' }); }
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
    {
      const near = meijinNearMiss(code, mask, symbols, scope, env, line, read, attempt);
      if (near) throw sentenceDiagnostic(near, line, [], { kind: 'Sequence' });
    }
    const rewrites = line.meijinRewrites || 0, rewritten = rewrites < 6 && meijinRewrite(code, symbols, scope);
    if (rewritten && rewritten !== code) {
      const next = surfaceLineSlice(line, 0, code.length, rewritten);
      Object.assign(next, { comment: line.comment, inline: line.inline, meijinRewrites: rewrites + 1 });
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
