  // ────────────────────────────────────────────────────────────────────────
  // 07-semantic-analysis-core.js — the first half of 07-semantic-analysis.js in dependency order, split off by the rule
  // (AUDIT.md「ソースの境界」; node audit/split-source.mjs). It uses nothing in 07-semantic-analysis.js.
  // ────────────────────────────────────────────────────────────────────────
function collectExprNodes(n, out = []) {
    const pending = [n];
    while (pending.length) {
      const node = pending.pop();
      if (!node || typeof node !== 'object') continue;
      if (['VariableRead', 'UserFunctionCall', 'BuiltinCall', 'SensorRead', 'ExtensionCalculation'].includes(node.kind))
        out.push(node);
      const children = [];
      for (const [key, value] of Object.entries(node)) {
        if (key === 'sourceSpan') continue;
        if (Array.isArray(value)) for (const item of value) children.push(item);
        else if (value && typeof value === 'object') children.push(value);
      }
      for (let i = children.length - 1; i >= 0; i--) pending.push(children[i]);
    }
    return out;
  }
  // Keys Akari knows: 上・下・左・右・空白・決定・取消, one letter or digit, and the keyboard's own key names.
  function validKeyName(key) {
    // One letter, digit or sign is the key itself; a kana or kanji (あ, 一) is no key on the keyboard.
    return ['上','下','左','右','空白','決定','取消'].includes(key) || /^[\x21-\x7e]$/.test(key) ||
      ['Tab','Backspace','Delete','Home','End','PageUp','PageDown','Insert','Shift','Control','Alt','CapsLock'].includes(key) || /^F(?:[1-9]|1[0-2])$/.test(key);
  }
  function keyNameMessage(key) { return `「${key}」という キーは ありません。キーは「スペース」「右」「a」のように 書きます`; }
  function targetExists(target, symbols, ctx) {
    const name = target.name,
      targetId = ctx.targetId || null;
    const selfInfo = () => {
      if (!targetId) {
        return symbols.individualNames.has(name) ? { scope: 'self', kind: 'dynamic' } : null;
      }
      if (targetId === 'stage') return null;
      const bag = symbols.individualByTargetId.get(targetId);
      if (!bag) return null;
      if (bag.variables.has(name)) return { scope: 'self', kind: 'scalar' };
      if (bag.lists.has(name)) return { scope: 'self', kind: 'list' };
      return null;
    };
    const projectInfo = () =>
      symbols.projectVars.has(name)
        ? { scope: 'project', kind: 'scalar' }
        : symbols.projectLists.has(name)
          ? { scope: 'project', kind: 'list' }
          : null;
    if (target.qualifier === 'project') return projectInfo();
    if (target.qualifier === 'self') return selfInfo();
    if ((ctx.binders || []).includes(name)) return { scope: 'binder', kind: 'scalar' };
    if ((ctx.localVarNames || []).includes(name)) return { scope: 'local', kind: 'scalar' };
    if ((ctx.localListNames || []).includes(name)) return { scope: 'local', kind: 'list' };
    if ((ctx.args || []).includes(name)) return { scope: 'arg', kind: 'dynamic' };
    if (targetId) {
      const mine = selfInfo();
      if (mine) return mine;
      return projectInfo();
    }
    if (symbols.individualNames.has(name)) return { scope: 'runtime', kind: 'dynamic' };
    return projectInfo();
  }
  // Literal arithmetic can be checked without reading mutable data or running
  // user code. Unknown values and arithmetic-domain failures stay runtime checks.
  function staticNumericMagnitude(expr) {
    if (!expr || typeof expr !== 'object') return undefined;
    if (expr.kind === 'NumberLiteral') return expr.value;
    if (['QuantityLiteral', 'UnitlessRead', 'ActorQualifiedRead'].includes(expr.kind))
      return staticNumericMagnitude(expr.value);
    if (expr.kind === 'UnaryExpression' && ['NEG', 'POS'].includes(expr.op)) {
      const value = staticNumericMagnitude(expr.value);
      return value === undefined ? undefined : expr.op === 'NEG' ? -value : value;
    }
    if (expr.kind !== 'BinaryExpression') return undefined;
    const a = staticNumericMagnitude(expr.left), b = staticNumericMagnitude(expr.right);
    if (a === undefined || b === undefined) return undefined;
    let value;
    if (expr.op === 'ADD') value = a + b;
    else if (expr.op === 'SUB') value = a - b;
    else if (expr.op === 'MUL') value = a * b;
    else if (expr.op === 'DIV' && b !== 0) value = a / b;
    else if (expr.op === 'POW' && !(a === 0 && b === 0)) value = Math.pow(a, b);
    return Number.isFinite(value) ? value : undefined;
  }
  function staticScaleDiagnostics(ast, where) {
    const diagnostics = [], pending = [ast];
    while (pending.length) {
      const node = pending.pop();
      if (!node || typeof node !== 'object') continue;
      if (node.kind === 'LooksCommand' && node.op === 'SET_SCALE') {
        const value = staticNumericMagnitude(node.args?.[0]);
        if (value !== undefined && (value < 1 || value > 1000)) diagnostics.push({
          code: 'R412', message: '大きさは 1〜1000％に します。見えなく する ときは「すがたをかくす」を 使います',
          line: node.sourceSpan?.startLine || 0, column: node.sourceSpan?.startColumn || 1, where,
        });
      }
      // 99999Hzの音を1秒鳴らす: a height written outside 30–5000Hz stops before running, as running would (FCS-03); the
      // mark is on the number.
      if (node.kind === 'SoundCommand' && ['TONE', 'TONE_WAIT'].includes(node.op)) {
        const hz = staticNumericMagnitude(node.args?.[0]), mark = node.args?.[0]?.sourceSpan || node.args?.[0]?.value?.sourceSpan || node.sourceSpan;
        if (hz !== undefined && (hz < 30 || hz > 5000)) diagnostics.push({ code: 'R412', message: '音の 高さは 30Hzから 5000Hzまでの 数に します', line: mark?.startLine || 0, column: mark?.startColumn || 1, where });
      }
      // A time written below 0 (待つ, 話す, 〇秒かけて動く・回る・〜のところへ行く, 鳴らす) stops before running.
      const timed = node.kind === 'SoundCommand' && ['TONE', 'TONE_WAIT'].includes(node.op) ? node.args?.[1]
        : ['WaitTime', 'Say', 'MotionCommand'].includes(node.kind) ? node.seconds : undefined;
      const time = timed === undefined ? undefined : staticNumericMagnitude(timed);
      // The mark is put on the value itself (F-06), where the child changes it.
      const at = timed?.sourceSpan || timed?.value?.sourceSpan || node.sourceSpan;
      if (time !== undefined && time < 0) diagnostics.push({
        code: 'R412', message: node.kind === 'WaitTime' ? '待つ 時間は 0か、0より 大きい 数に します' : node.kind === 'Say' ? '話す 時間は 0か、0より 大きい 数に します'
          : node.kind === 'SoundCommand' ? '鳴らす 時間は 0.01秒から 60秒までの 数に します'
          : ['TURN_RIGHT', 'TURN_LEFT'].includes(node.op) ? '回る 時間（〜秒かけて）は 0か、0より 大きい 数に します' : '動く 時間（〜秒かけて）は 0か、0より 大きい 数に します',
        line: at?.startLine || 0, column: at?.startColumn || 1, where,
      });
      for (const [key, value] of Object.entries(node)) {
        if (key === 'sourceSpan' || key === 'actorRef') continue;
        if (Array.isArray(value)) pending.push(...value.slice().reverse());
        else if (value && typeof value === 'object') pending.push(value);
      }
    }
    return diagnostics;
  }
  // 名人 scripts belong to no part, so every action names who does it.
  const MEIJIN_SUBJECT_MESSAGE = '名人の 本文では、だれが するかを 文の はじめに 書きます。れい：ねこは前へ10歩進む';
  // 決まり4: the sentence before has its subjects inside it, so none is carried on.
  const MEIJIN_TOPIC_ENDED = 'すぐ前の 文からは 主語を 引きつげません（主語を ならべた 文や 主語が 二つ ある 文、あつまりの 文、見出しの 文、「〜あいだ」「次のことを同時に始める」の 文、中に 主語を 書いた「もし」や くり返しの あとです）。この 文に だれが するかを 書きます。れい：ねこは前へ10歩進む';
  function analyzeProject(project, compiled, { rootKeys = null } = {}) {
    const symbols = compiled.symbols,
      diags = [],
      diagKeys = new Set(),
      itemsByKey = new Map(compiled.items.map((x) => [x.key, x]));
    const targetLabel = (ctx) =>
      ctx.targetId === 'stage'
        ? project.stage.name
        : project.components.find((c) => c.id === ctx.targetId)?.name ||
          ctx.targetId ||
          '呼び出し元未確定';
    // proposals: rewrites of the body's text (start/end in that text), which the code view offers as buttons.
    const add = (code, message, node, where, proposals = null) => {
      const d = {
        code,
        message,
        line: node?.sourceSpan?.startLine || 0,
        column: node?.sourceSpan?.startColumn || 1,
        where,
        ...(proposals?.length ? { proposals } : {}),
      };
      const k = `${d.code}|${d.message}|${d.line}|${d.column}|${d.where}`;
      if (!diagKeys.has(k)) {
        diagKeys.add(k);
        diags.push(d);
      }
    };
    const literalText = (e) => (e?.kind === 'StringLiteral' ? e.value : null);
    const componentByName = (name) => project.components.find((c) => c.name === name) || null;
    // 色 is commonly written for the character's color; say how it is written.
    const wordHint = (name) => ({ 色: '。キャラクターの 色は「色を「赤」にする」で かえます' })[name] || (/^[〇一二三四五六七八九十百千]+つ?$/.test(name) ? '。数は 3や 10のように 数字で 書きます' : '');
    // A word that is not a name was read as one (まっすぐ10, 空, 偶数): say how to write it instead of asking to make it.
    // The example writes the value it was compared with (スコアが偶数 → スコア÷2のあまりが0なら).
    const misreadName = (name, other, meijin = false, node = null) => {
      const who = (fallback) => other ? messageExpression(other) : fallback;
      // 名人 reads these words; only the ending was not read (偶数じゃなかったら).
      if (meijin && ['空', '空っぽ', '偶数', '奇数', 'ぐう数', 'ぐうすう', 'き数', 'きすう'].includes(name)) return `「${name}」は、「${who('点数')}が${name}なら」「${who('点数')}が${name}でなければ」の 形で 書きます`;
      if (name === '空' || name === '空っぽ') return `「${name}」は くらべる ことばに ありません。リストが 空かを しらべる ときは「${who('持ち物')}の数が0なら」のように 書きます`;
      // An odd number's あまり is 1 or －1 (the あまり has the sign of the number), as 名人 reads 奇数. ぐうすう・き数 are the same words.
      const even = ['偶数', 'ぐう数', 'ぐうすう'].includes(name), odd = ['奇数', 'き数', 'きすう'].includes(name);
      if (even || odd) return `「${name}」は くらべる ことばに ありません。「${who('点数')}÷2のあまりが${even ? '0' : '1か－1'}なら」のように 書きます`;
      // すがたを次にする / はいけいを次にする: the next look has its own sentence.
      if (/^(?:次|つぎ)$/.test(name) && node?.kind === 'LooksCommand' && ['SET_COSTUME', 'SET_BACKDROP'].includes(node.op))
        return node.op === 'SET_COSTUME' ? 'つぎの すがたに する ときは「つぎのすがたにかえる」と 書きます' : 'つぎの はいけいに する ときは「つぎのはいけいにかえる」と 書きます';
      // 十 / 十歩 (FM2-03): a number in kanji is written in digits; no name to make is named.
      if (/^[〇一二三四五六七八九十百千万]+(?:つ|歩|秒|回|度|個|番目|点)?$/.test(name) && name !== '一つ') return `「${name}」は 漢数字です。数は「${meijinDigits(name)}」のように 数字で 書きます`;
      const digits = /^(.+?)([0-9０-９]+(?:[.．][0-9０-９]+)?)$/.exec(name);
      if (digits && !symbols.projectVars?.has?.(digits[1]) && !symbols.projectLists?.has?.(digits[1])) {
        // 点数たす1: a sum is written with ＋ (also －, ×, ÷), inside （ ）.
        const op = /^(.+?)(たす|足す|ひく|引く|かける|わる|割る)$/.exec(digits[1]);
        if (op) { const [sign, word] = { たす: ['＋', 'たし'], 足す: ['＋', 'たし'], ひく: ['－', 'ひき'], 引く: ['－', 'ひき'], かける: ['×', 'かけ'], わる: ['÷', 'わり'], 割る: ['÷', 'わり'] }[op[2]];
          return `${word}算は「（${op[1]}${sign}${digits[2]}）」のように「${sign}」で 書きます`; }
        // The move example only where the sentence is a move (まっすぐ10 → 前へ10歩進む).
        return `「${name}」を 名前として 読みました。「${digits[1]}」は あかりの ことばに ありません。「${digits[1]}」を けして 書けるか たしかめて ください${node?.kind === 'MotionCommand' ? `。れい：前へ${digits[2]}歩進む` : ''}`;
      }
      return null;
    };
    // 名人: a part's value written with no part (E2E-R2-01, C-touch-R2-04). The example is the form that reads, with a
    // character of the work: ねこが「星」にふれていれば (who touches is written with が), ねこがコピーなら, ねこのよこのばしょ.
    // 「ねこ」の「星」にふれている (read as ねこ's 「星」) names ねこ as who touches.
    const meijinSubjectSensorMessage = (n, statement) => {
      const sprites = project.components.filter(c => c.type === 'sprite'), arg = n.arg;
      const qualified = arg?.kind === 'ActorQualifiedRead' && arg.actorRef?.kind === 'named' ? arg : null;
      const partner = qualified ? qualified.value : arg, partnerName = partner?.kind === 'StringLiteral' ? partner.value : partner?.kind === 'PartRef' ? partner.name : null;
      const part = qualified?.actorRef.name || (sprites.find(c => c.name !== partnerName) || project.components.find(c => c.name !== partnerName))?.name || 'ねこ';
      if (['TOUCHING', 'TOUCHING_COLOR'].includes(n.sensor)) {
        let shown = null;
        try { shown = n.sensor === 'TOUCHING' && partnerName !== null ? touchShown(partnerName) : formatExpression(exprNode('SensorRead', { sensor: n.sensor, arg: partner })).replace(/にふれている$/, ''); } catch (error) { if (!(error instanceof AkariError)) throw error; }
        shown ||= '「星」';
        const example = statement?.kind === 'WaitUntil' ? `${part}が${shown}にふれるまで待つ` : statement?.kind === 'RepeatUntil' ? `${part}が${shown}にふれるまで、くり返す`
          : statement?.kind === 'RepeatWhile' ? `${part}が${shown}にふれているあいだ、くり返す` : `もし${part}が${shown}にふれていれば、`;
        return `名人の 本文では、だれが ふれるかを 書きます。れい：「${example}」`;
      }
      if (n.sensor === 'クローンである') return `名人の 本文では、だれが コピーかを 書きます。れい：もし${part}がコピーなら、`;
      return `名人の 本文では、だれの「${messageExpression(n)}」かを 書きます。れい：${part}の${messageExpression(n)}`;
    };
    // The same, as a rewrite of the condition the child wrote (C-touch-R2-04), when who touches is sure: 「ねこ」の「星」 names
    // ねこ, or the work has one character other than the partner. The text keeps the child's words and ending. The code
    // view and 作品チェック (11-app-services.js) do not yet draw a check error's proposals; they draw a reading error's.
    const meijinTouchProposals = (n, where, ctx) => {
      const range = SOURCE_RANGES.get(n)?.range, text = !ctx.definition ? scriptBySourceKey(project, where)?.source : null;
      if (!['TOUCHING', 'TOUCHING_COLOR'].includes(n.sensor) || !range || typeof text !== 'string') return null;
      const arg = n.arg, qualified = arg?.kind === 'ActorQualifiedRead' && arg.actorRef?.kind === 'named' ? arg : null,
        partner = qualified ? qualified.value : arg, partnerName = partner?.kind === 'StringLiteral' ? partner.value : null,
        others = project.components.filter(c => c.type === 'sprite' && c.name !== partnerName),
        part = qualified ? qualified.actorRef.name : others.length === 1 ? others[0].name : null,
        original = text.slice(range.start, range.end), written = qualified ? original.replace(/^\s*「[^」]+」\s*の\s*/, '') : original;
      if (!part || (qualified && written === original)) return null;
      const source = part + 'が' + written, next = text.slice(0, range.start) + source + text.slice(range.end);
      try { if (!parseSyntax(next, { symbols, meijin: true }).ast) return null; } catch (error) { if (!(error instanceof AkariError)) throw error; return null; }
      return [{ label: 'だれが ふれるかを 書く', source, start: range.start, end: range.end, original }];
    };
    // コスチュームを「丸」にする / いろを「赤」にする / 文字を「あ」にする (FM2-03): a part's look written as data; the
    // sentence that changes it is named, never a variable to make. null for any other name.
    const propertyWord = (name, value, ctx) => {
      let shown = '「…」';
      try { if (value) shown = messageExpression(value); } catch (error) { if (!(error instanceof AkariError)) throw error; }
      if (/^(?:コスチューム|こすちゅーむ|衣装|いしょう)$/.test(name)) return `すがたを かえる ときは「すがたを${shown}にかえる」と 書きます`;
      if (/^(?:いろ|カラー|からー)$/.test(name)) return `色を かえる ときは「色を${shown}にする」と 書きます`;
      if (/^(?:文字|もじ)$/.test(name)) return ['label', 'button', 'box'].includes(ctx?.targetType) ? null
        : `文字を かえられるのは、文字・ボタン・四角の 部品です。キャラクターが 話す ときは「${shown}と言う」と 書きます`;
      return null;
    };
    // A part and a variable (or list) with the same name: a bare name there reads the data, though a part was meant.
    const sameNameAsPart = (name) => `「${name}」は、部品の 名前と ${symbols.projectLists?.has?.(name) ? 'リスト' : 'へんすう'}の 名前が 同じなので、どちらの ことか 決まりません`;
    // A read already told of (as a target or a subject) is not told of again where it is read as a value.
    const sameNameTold = new WeakSet();
    const checkComponentTarget = (expr, allowed, ctx, where, label = '部品', special = []) => {
      if (expr?.kind === 'VariableRead' && !expr.qualifier && componentByName(expr.name)) {
        sameNameTold.add(expr); add('S316', sameNameAsPart(expr.name) + '。部品の ことなら、名前を「 」で かこんで 書きます', ctx.node, where); return;
      }
      // 【おに】にふれていれば (an ordinary body): 【 】 names data; the part touched or faced is named in 「 」.
      if (!ctx.meijin && expr?.kind === 'VariableRead' && expr.qualifier === 'exact' && componentByName(expr.name) && !targetExists({ name: expr.name, qualifier: null }, symbols, ctx)) {
        // The value was read first and found no data of that name: this message says what it is instead.
        for (let i = diags.length - 1; i >= 0; i--) if (diags[i].where === where && diags[i].code === 'S301' && diags[i].message.startsWith(`まだ 作っていない 名前「${expr.name}」`)) diags.splice(i, 1);
        sameNameTold.add(expr); add('S301', `「${expr.name}」は 部品の 名前です。ふれる 相手や 向く 相手など、部品を さす ときは「「${expr.name}」」と 書きます（【 】で かこむのは へんすうの 名前です）`, ctx.node, where); return;
      }
      const name = expr?.kind === 'PartRef' ? expr.name : literalText(expr);
      if (name === null || special.includes(name)) return;
      const c = componentByName(name);
      // One wording for a name that is not there (F-23: a part is キャラクターや 部品).
      const noun = { 部品: 'キャラクターや 部品', コピーするキャラクター: 'キャラクター', 文字をかえる部品: '文字の 部品' }[label] || label;
      if (!c) add('S301', `「${name}」という ${noun}が 見つかりません。名前を たしかめて ください`, ctx.node, where);
      else if (allowed && !allowed.includes(c.type))
        add('S304', `${label}「${name}」は ここでは 使えません。使える 部品を えらんで ください`, ctx.node, where);
    };
    let analyzeCallable = () => {};
    // The values a call gives, as written: 【長さ】を5、【向き】を90 (for an example of the same call with a subject).
    const callValues = n => { try { const names = n.argumentNames || [], values = n.args || []; return names.length && names.length === values.length ? names.map((x, i) => '【' + x + '】を' + messageExpression(values[i])).join('、') : ''; } catch (error) { if (!(error instanceof AkariError)) throw error; return ''; } };
    const actorContext = (ref, ctx, node, where) => {
      // 名人: the part held in a value acts; which part it is is known when the sentence runs.
      if (ref?.kind === 'value') {
        if (ref.value?.kind === 'VariableRead' && !ref.value.qualifier && componentByName(ref.value.name) && !sameNameTold.has(ref.value) && sameNameTold.add(ref.value))
          add('S316', sameNameAsPart(ref.value.name) + '。どちらかの 名前を かえて ください', node, where);
        analyzeExpr(ref.value, ctx, where); return { ...ctx, targetId: null, targetType: null, valueActor: true };
      }
      if (!ref || ref.kind !== 'named') return ctx;
      const c = namesStage(project, ref.name)
        ? { id: 'stage', type: 'stage' } : componentByName(ref.name);
      if (!c) { add('S301', `「${ref.name}」という キャラクターや 部品が 見つかりません。名前を たしかめて ください${['ぼく','わたし','おれ','あたし','うち'].includes(ref.name)?'。自分の ことなら「自分は」と 書きます':''}`, node, where); return ctx; }
      // 名人 (決まり5): a part's name with data of the same name is not one reading, wherever it is written.
      if (ctx.meijin && c.id !== 'stage' && targetExists({ name: ref.name, qualifier: null }, symbols, ctx) && !sameNameTold.has(ref) && sameNameTold.add(ref))
        add('S316', sameNameAsPart(ref.name) + '。どちらかの 名前を かえて ください', node?.sourceSpan ? node : ctx.node, where);
      return { ...ctx, targetId: c.id, targetType: c.type };
    };
    const checkArguments = (n, def, where) => {
      if (!n.argumentNames?.length) return;
      const names = n.argumentNames;
      if (names.length !== n.args.length || new Set(names).size !== names.length ||
        def.args.some(name => !names.includes(name)) || names.some(name => !def.args.includes(name)))
        add('S308', `「${n.name}」に 入れる ものの 名前を、1つずつ 書いて ください`+namedArgumentDetails(def.args,names), n, where);
    };
    // Infer only units guaranteed by the expression contract. Mutable names,
    // arguments and user calculations remain unknown; no value is evaluated.
    // undefined is unknown, null is a known number without a unit.
    const staticUnit = (expr, statement, where) => {
      const units = new Map();
      const mismatch = (message) => add('R417', message, statement, where);
      const expect = (unit, expected) => {
        if (unit !== undefined && unit !== null && unit !== expected)
          mismatch(expected === null
            ? 'この 計算には、たんい（歩・度・秒など）の ない 数を 使います。「の数だけ」で たんいを 外せます。れい：10歩の数だけ'
            : `ここでは ${expected}の 数を 使います。${unit}の 数は 使えません`);
      };
      const common = (values) => {
        const tagged = [...new Set(values.filter(unit => unit !== undefined && unit !== null))];
        if (tagged.length > 1) mismatch(`${tagged.join('と')}は 同じ たんいでは ありません。たんいを そろえるか、「の数だけ」で たんいを 外して ください`);
        return tagged.length === 1 ? tagged[0] : values.includes(undefined) ? undefined : null;
      };
      const infer = (n) => {
        if (!n || typeof n !== 'object') return undefined;
        if (units.has(n)) return units.get(n);
        for (const [key, value] of Object.entries(n)) {
          if (key === 'sourceSpan' || key === 'actorRef') continue;
          if (Array.isArray(value)) value.forEach(infer);
          else if (value && typeof value === 'object') infer(value);
        }
        const child = value => units.get(value), a = child(n.left), b = child(n.right);
        let unit;
        if (n.kind === 'NumberLiteral' || n.kind === 'UnitlessRead') unit = null;
        else if (n.kind === 'QuantityLiteral') { expect(child(n.value), n.unit); unit = n.unit; }
        else if (n.kind === 'ActorQualifiedRead') unit = child(n.value);
        else if (n.kind === 'UnaryExpression' && n.op !== 'NOT') unit = child(n.value);
        else if (n.kind === 'BinaryExpression') {
          if (['ADD', 'SUB'].includes(n.op)) unit = common([a, b]);
          else if (n.op === 'MUL') {
            if (a != null && b != null) mismatch('たんいの ついた 数どうしは、かけ算 できません。「の数だけ」で たんいを 外せます');
            unit = a != null ? a : b != null ? b : a === null && b === null ? null : undefined;
          } else if (n.op === 'DIV') {
            if (b != null && a !== undefined && a !== b)
              mismatch('この たんいどうしは、わり算 できません。「の数だけ」で たんいを 外せます');
            unit = b === null ? a : b !== undefined ? null : undefined;
          } else { expect(a, null); expect(b, null); unit = null; }
        } else if (n.kind === 'CompareExpression') common([a, b]);
        else if (n.kind === 'ListItemRead') expect(child(n.index), '番目');
        else if (n.kind === 'SensorRead') {
          unit = { 横位置: '歩', 縦位置: '歩', 方向: '度', 大きさ: '％',
            マウスの横位置: '歩', マウスの縦位置: '歩', タイマー: '秒', 音量: '％',
            DISTANCE_TO: '歩', 衣装番号: null, 背景番号: null, 音程: null }[n.sensor];
        }
        else if (n.kind === 'ExtensionCalculation') unit = EXTENSION_HOST.describe(n.name, 'calculations')?.returns.unit;
        else if (n.kind === 'BuiltinCall') {
          const args = (n.args || []).map(child);
          if (['乱数', '余り', '最小', '最大'].includes(n.name)) unit = common(args);
          else if (['四捨五入', '切り上げ', '切り捨て', '絶対値'].includes(n.name)) unit = args[0];
          else if (['正弦', '余弦', '正接'].includes(n.name)) { expect(args[0], '度'); unit = null; }
          else if (['逆正弦', '逆余弦', '逆正接'].includes(n.name)) { expect(args[0], null); unit = '度'; }
          else if (['平方根', '自然対数', '常用対数', '指数'].includes(n.name)) { expect(args[0], null); unit = null; }
          else if (['数', 'LENGTH', 'STRING_LENGTH', 'INDEX_OF'].includes(n.name)) unit = null;
          else if (n.name === 'STRING_CHAR') expect(args[1], '番目');
        }
        units.set(n, unit);
        return unit;
      };
      return infer(expr);
    };
    const checkExtensionOperation = (n, kind, where) => {
      const operation = EXTENSION_HOST.describe(n.name, kind);
      if (!operation) { add('E703', 'ここで 使う かくちょうが 入って いません', n, where); return; }
      if (operation.args.length !== n.args.length) add('S308', 'かくちょうに 入れる ものの 数が ちがいます', n, where);
      operation.args.forEach((shape, index) => {
        const argument = n.args[index]; if (!argument) return;
        const unit = staticUnit(argument, n, where);
        if (shape.type === 'number' && unit !== undefined && unit !== shape.unit)
          add('R417', 'かくちょうに 入れる 数の、たんいが 合いません', n, where);
        const known = {NumberLiteral:'number',QuantityLiteral:'number',StringLiteral:'string',BooleanLiteral:'boolean',ListLiteral:'list'}[argument.kind];
        if (known && shape.type !== 'value' && known !== shape.type) add('E705', 'かくちょうに 入れる ものの しゅるい（数・文字など）が 合いません', n, where);
      });
    };
    const checkStaticRoleUnits = (n, where) => {
      for (const slot of sentenceFormFor(n)?.roleSlots || []) {
        if (!slot.unit) continue;
        const expr = slot.path.split('.').reduce((value, key) => value?.[key], n);
        const unit = staticUnit(expr, n, where);
        if (unit !== undefined && unit !== null && unit !== slot.unit)
          add('R417', `ここでは ${slot.unit}の 数を 使います。${unit}の 数は 使えません`, n, where);
      }
    };
    const analyzeExpr = (expr, initialContext, where) => {
      const scoped = [];
      // A word compared with a value (点数が偶数): the guidance writes the value as written.
      const partner = new Map();
      (function walk(n) { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(walk); return; }
        if (n.kind === 'CompareExpression') { partner.set(n.right, n.left); partner.set(n.left, n.right); }
        for (const [k, v] of Object.entries(n)) if (k !== 'sourceSpan' && v && typeof v === 'object') walk(v); })(expr);
      const collect = (n, ctx) => {
        if (!n || typeof n !== 'object') return;
        if (n.kind === 'ActorQualifiedRead') {
          // 点数の半分 / 点数のあたい in an ordinary body: 点数 is data, not a part, and a word after it is no data of
          // 点数's. One message says how it is written (a 名人 value may hold a part, so it is not looked at there).
          const owner = n.actorRef?.kind === 'named' ? n.actorRef.name : null;
          if (owner && !ctx.meijin && !componentByName(owner) && !namesStage(project, owner) && targetExists({ name: owner, qualifier: null }, symbols, ctx)) {
            const word = n.value?.kind === 'VariableRead' ? n.value.name : messageExpression(n.value), kind = symbols.projectLists?.has?.(owner) ? 'リスト' : 'へんすう';
            const how = word === '半分' ? `半分は「（${owner}÷2）」のように 計算で 書きます`
              : /^(?:あたい|なかみ)$/.test(word) ? `中身は「${owner}」と 名前だけで 書きます。れい：${owner}を言う`
              : BUILTIN_NAMES.has(word) ? `${word}は「${word}（${owner}）」のように 書きます`
              : `「${owner}」は ${kind}の 名前です。中身は「${owner}」と 名前だけで 書きます`;
            add('S301', `「${owner}の${word}」は 読めません。${how}`, ctx.node || n, where);
            return;
          }
          // 「ねこ」の点数 reads ねこ's own data; the project's 点数 is written without 「ねこ」の.
          const own = n.actorRef?.kind === 'named' && n.value?.kind === 'VariableRead' && !n.value.qualifier ? { qualifiedName: n.actorRef.name, qualifiedRead: n.value } : {};
          collect(n.value, { ...actorContext(n.actorRef, ctx, n, where), ...own }); return;
        }
        // 名人: a part written as a value must exist; 「〜の名前」 is undecided when the part has data called 名前.
        // いちばん近い is from the one who acts, and is written only in 〜の方を向く and 〜までのきょり: there a tie turns no one or
        // gives the same distance. Anywhere else a tie would need a hidden rule.
        const nearestFrom = (node, example) => { if (ctx.targetType === 'stage') add('S304', '「いちばん近い」は、だれから 近いかが いります。れい：' + example, ctx.node || node, where); };
        if (n.kind === 'SensorRead' && n.sensor === 'DISTANCE_TO' && n.arg?.kind === 'PartNearest') { nearestFrom(n, '点数を、ねこからいちばん近い星までのきょりにする'); collect(n.arg.of, ctx); return; }
        if (n.kind === 'PartNearest') {
          if (ctx.node?.kind === 'MotionCommand' && ctx.node.op === 'POINT_TO' && ctx.node.args?.[0] === n) nearestFrom(n, 'ねこは、いちばん近い星の方を向く');
          else add('S304', '「いちばん近い」は「〜の方を向く」と「〜までのきょり」で 使います。れい：ねこは、いちばん近い星の方を向く', ctx.node || n, where);
          collect(n.of, ctx); return;
        }
        if (n.kind === 'PartRef' || n.kind === 'PartFamily') {
          if (!componentByName(n.name)) add('S301', `「${n.name}」という キャラクターや 部品が 見つかりません。名前を たしかめて ください`, ctx.node || n, where);
          return;
        }
        if (n.kind === 'PartName' || n.kind === 'PartState') {
          const c = actorContext(n.actorRef, ctx, ctx.node || n, where);
          if (n.kind === 'PartState' && n.state === 'copyCount' && c.targetType && c.targetType !== 'sprite')
            add('S304', 'コピーを 作れるのは キャラクターだけです', ctx.node || n, where);
          return;
        }
        if (n.kind === 'EventCount') {
          // The part must exist and, for a procedure, the procedure too; the count is read like any value.
          actorContext(n.actorRef, ctx, n, where);
          if (n.event === 'action' && !symbols.actions?.has?.(n.name)) add('S301', `「${n.name}」という てじゅんが 見つかりません。名前を たしかめて ください`, n, where);
          collect(n.count, ctx); return;
        }
        if (['VariableRead', 'UserFunctionCall', 'BuiltinCall', 'SensorRead', 'ExtensionCalculation'].includes(n.kind))
          scoped.push([n, ctx]);
        for (const [key, value] of Object.entries(n)) {
          if (key === 'sourceSpan' || key === 'actorRef') continue;
          if (Array.isArray(value)) value.forEach(child => collect(child, ctx));
          else if (value && typeof value === 'object') collect(value, ctx);
        }
      };
      collect(expr, initialContext);
      staticUnit(expr, initialContext.node || expr, where);
      for (const [n, ctx] of scoped) {
        if (n.kind === 'VariableRead') {
          const isLocal =
            (ctx.localVarNames || []).includes(n.name) ||
            (ctx.localListNames || []).includes(n.name);
          if (
            isLocal &&
            !['project', 'self'].includes(n.qualifier) &&
            ctx.availableLocalNames &&
            !ctx.availableLocalNames.has(n.name)
          )
            add('S303', `この 中だけの 名前「${n.name}」は、作る 行より 前では 使えません。作る 行を 先に 書いて ください`, ctx.node, where);
          const info = targetExists({ name: n.name, qualifier: n.qualifier }, symbols, ctx);
          if (info?.scope === 'project' && ctx.qualifiedRead === n)
            add('S301', `「${ctx.qualifiedName}」には「${n.name}」が ありません。作品の へんすうや リストなら、「の」を つけずに ${n.name} と 書きます`, ctx.node, where);
          if (!info && !sameNameTold.has(n)) {
            const prefix =
              n.qualifier === 'self' && ctx.targetId ? `${targetLabel(ctx)}の自分には` : 'まだ 作っていない';
            add(
              'S301',
              (n.qualifier !== 'self' && misreadName(n.name, partner.get(n), ctx.meijin, ctx.node)) ||
              `${prefix} 名前「${n.name}」${n.qualifier === 'self' && ctx.targetId ? 'が ありません' : 'です。名前を たしかめるか、その 名前の へんすうか リストを 作って ください'}${wordHint(n.name)}`,
              ctx.node,
              where,
            );
          }
          // 名人: a part's name is a value too, so data of the same name makes either reading possible (決まり5).
          else if (ctx.meijin && !n.qualifier && componentByName(n.name) && !sameNameTold.has(n) && sameNameTold.add(n))
            add('S316', sameNameAsPart(n.name) + '。どちらかの 名前を かえて ください', ctx.node, where);
        }
        if (n.kind === 'ExtensionCalculation') checkExtensionOperation(n, 'calculations', where);
        if (n.kind === 'UserFunctionCall') {
          const f = symbols.functions.get(n.name);
          if (!f) add('S301', `答えを もとめる「${n.name}」が ありません`, ctx.node, where);
          else if (f.args.length !== n.args.length)
            add('S308', `答えを もとめる「${n.name}」に 入れる ものは ${f.args.length}こです`+namedArgumentDetails(f.args,n.argumentNames), ctx.node, where);
          else { checkArguments(n, f, where); analyzeCallable(f, 'function', ctx); }
        }
        if (n.kind === 'BuiltinCall' && BUILTIN_META.has(n.name)) {
          const m = BUILTIN_META.get(n.name),
            count = n.args.length;
          if (count < m.minArgs || count > m.maxArgs)
            add('S308', `はじめから ある 計算「${n.name === '乱数' ? 'AからBのどれか' : BUILTIN_SURFACES[n.name] || n.name}」に 入れる ものの 数が ちがいます`, ctx.node, where);
        }
        if (n.kind === 'SensorRead') {
          const eventOnly = {
            押されたキー: 'keyDown',
            受け取った知らせ: 'message',
            拡張の値: 'message',
            以前の値: 'valueChanged',
            新しい値: 'valueChanged',
            以前の背景名: 'backdropChanged',
            新しい背景名: 'backdropChanged',
          };
          if (n.sensor === '拡張の値' && (!ctx.filter?.message?.startsWith('拡張:') || !EXTENSION_HOST.describe(ctx.filter.message.slice(3), 'events')))
            add('S311', '拡張「できごとの値」は、入れて ある かくちょうの きっかけの 本文の 中だけで 使えます', ctx.node, where);
          if (eventOnly[n.sensor]) {
            if (ctx.definition)
              add('S311', `「${messageExpression(n)}」は、自分で 作った ブロックの 中では そのまま 使えません。きっかけの 本文の 中で 使い、入れる ものとして わたして ください`, ctx.node, where);
            else if (ctx.event !== eventOnly[n.sensor] && n.sensor !== '拡張の値')
              add('S311', `「${messageExpression(n)}」は「${EVENT_LABELS[eventOnly[n.sensor]]}」の きっかけの 本文で 使います`, ctx.node, where);
          }
          // What a ふれている names (C-touch-R2-02/-04): 'part' for 「ねこ」の「星」 (ねこ touches 星), 'place' for 「ゆか」の上
          // (ゆか itself is touched), 'number' for 点数, 10 or 星のよこのばしょ. null when the partner is one that can be touched.
          const touchArg = n.sensor === 'TOUCHING' ? n.arg : null,
            touchOf = touchArg?.kind === 'ActorQualifiedRead' && touchArg.actorRef?.kind === 'named' && touchArg.value?.kind === 'StringLiteral' && componentByName(touchArg.actorRef.name) ? touchArg.actorRef.name : null,
            touchProblem = !touchArg ? null
              : touchOf ? (componentByName(touchArg.value.value) || touchArg.value.value === 'マウス' || Object.hasOwn(EDGE_TARGETS, touchArg.value.value) ? 'part' : 'place')
              : ['NumberLiteral', 'QuantityLiteral', 'BinaryExpression', 'UnaryExpression'].includes(touchArg.kind)
                || (touchArg.kind === 'ActorQualifiedRead' && touchArg.value?.kind === 'SensorRead') ? 'number' : null;
          if (
            [
              '横位置',
              '縦位置',
              '方向',
              '大きさ',
              'クローンである',
              'DISTANCE_TO',
              'TOUCHING',
              'TOUCHING_COLOR',
            ].includes(n.sensor) &&
            ctx.targetType === 'stage' &&
            // A partner that cannot be touched gets one message below, with who touches in 名人; 「ねこ」の「星」 gets this one.
            !(ctx.meijin && (touchProblem === 'place' || touchProblem === 'number'))
          )
            add('S304', ctx.meijin ? meijinSubjectSensorMessage(n, ctx.node) : `「${messageExpression(n)}」は 画面では 使えません。キャラクターの 本文で 使って ください`, ctx.node, where,
              ctx.meijin ? meijinTouchProposals(n, where, ctx) : null);
          if (
            ['衣装番号', '衣装名'].includes(n.sensor) &&
            ctx.targetType &&
            ctx.targetType !== 'sprite'
          )
            add('S304', ctx.meijin && ctx.targetType === 'stage' ? meijinSubjectSensorMessage(n, ctx.node) : `「${messageExpression(n)}」は キャラクターで だけ 使えます`, ctx.node, where);
          if (n.sensor === 'KEY_DOWN') {
            const key = literalText(n.arg);
            if (key !== null && !validKeyName(key)) add('S301', keyNameMessage(key), ctx.node, where);
          }
          if (n.sensor === 'INPUT_VALUE')
            checkComponentTarget(n.arg, ['input'], ctx, where, '入力らん');
          if (n.sensor === 'DISTANCE_TO')
            checkComponentTarget(n.arg, null, ctx, where, '部品', ['マウス']);
          if (n.sensor === 'TOUCHING') {
            const unknown=[];
            const scan=value=>{if(!value||typeof value!=='object')return;if(value.kind==='VariableRead'&&!dataNameKind(value.name,symbols,ctx)&&!componentByName(value.name)){unknown.push(value.name);sameNameTold.add(value);}for(const child of Object.values(value))if(child&&typeof child==='object')scan(child);};scan(n.arg);
            if(unknown.length){
              for(let i=diags.length-1;i>=0;i--)if(diags[i].where===where&&diags[i].code==='S301'&&unknown.some(name=>diags[i].message.startsWith('まだ 作って いない 名前「'+name+'」')))diags.splice(i,1);
              const screen=unknown.includes('画面')||n.arg?.actorRef?.name==='画面',centre=screen&&unknown.some(name=>['まん中','真ん中','まんなか','中央','中心'].includes(name));
              add('S304',centre?'画面の まん中は ばしょなので、ふれる 相手には 書けません。まん中に 部品を おいて、その 部品に ふれたかを しらべます':screen?'ふれる 相手は、部品か 画面のはしか マウスです。画面の はしの ことなら「画面のはし」と 書きます':'ふれる 相手の キャラクターや 部品が 見つかりません。作品に ある 部品の 名前を 書きます',ctx.node,where);
            }else checkComponentTarget(n.arg, null, ctx, where, '部品', ['マウス', ...Object.keys(EDGE_TARGETS)]);
            // What is touched is a part, the edge or the mouse (C-touch-R2-02): 「ゆか」の上 is ゆか itself, and a number
            // (点数, 10, 星のよこのばしょ) is no partner. A variable that starts with text may hold a part's name.
            const arg = n.arg, of = touchOf, owner = ctx.targetType !== 'stage' ? project.components.find(c => c.id === ctx.targetId)?.name : null;
            // The example is the sentence written, with a partner other than the body's own part (or the mouse), and in
            // 名人 with who touches: the subject written, else a character of the work.
            const sentence = (who, shown) => ctx.node?.kind === 'WaitUntil' ? `${who}${shown}にふれるまで待つ` : ctx.node?.kind === 'RepeatUntil' ? `${who}${shown}にふれるまで、くり返す`
              : ctx.node?.kind === 'RepeatWhile' ? `${who}${shown}にふれているあいだ、くり返す` : `もし${who}${shown}にふれていれば、`;
            if (touchProblem === 'place' || touchProblem === 'number') {
              const partner = of || project.components.find(c => c.id !== ctx.targetId && c.type === 'sprite')?.name || project.components.find(c => c.id !== ctx.targetId)?.name || 'マウス';
              const who = ctx.meijin ? (owner || project.components.find(c => c.type === 'sprite' && c.name !== partner)?.name || 'ねこ') + 'が' : '';
              add('S304', 'ふれる 相手は、部品か 画面のはしか マウスです。' + (of ? `「${of}」に ふれたかで しらべます。` : '数には ふれられません。') + 'れい：' + sentence(who, touchShown(partner)), ctx.node, where);
            }
            // 「ねこ」の「星」にふれている (C-touch-R2-04): ねこ is who touches. 名人 with no subject is told by the subject
            // message above; an ordinary body touches with its own part, and 画面's body is told that it has none.
            if (touchProblem === 'part' && (owner || !ctx.meijin) && !(ctx.targetType === 'stage' && !ctx.meijin)) {
              const shown = touchShown(arg.value.value);
              add('S304', ctx.meijin ? `だれが ふれるかは「${of}が」と 書きます。れい：${sentence(of + 'が', shown)}`
                : of === owner ? `ふれるのは この 本文の ${of}なので、「「${of}」の」は 書きません。れい：${sentence('', shown)}`
                : `「${of}」が ふれたかは、${of}の 本文で しらべます。この 本文に 書くと、${owner}が ふれたかを しらべます。れい：${sentence('', shown)}`, ctx.node, where);
            }
          }
          if (n.sensor === 'TOUCHING_COLOR') {
            const v = literalText(n.arg);
            if (v !== null)
              try {
                resolveColor(v, { allowTransparent: false });
              } catch (_) {
                add('S304', `色「${v}」は 使える 色では ありません。使える 色は 黒・白・ねずみ色・赤・だいだい・黄・緑・水色・青・むらさき・もも色・茶 です`, ctx.node, where);
              }
          }
        }
      }
    };
    const walk = (nodes, ctx, where, loopDepth = 0, top = true) => {
      // Preserve the event/call entry target independently of each statement target.
      if(!ctx.selfContext)ctx={...ctx,selfContext:{targetId:ctx.targetId,targetType:ctx.targetType}};
      let seenExecutable = false;
      const available = new Set(ctx.availableLocalNames || []),
        declared = new Set(ctx.args || []);
      for (let idx = 0; idx < nodes.length; idx++) {
        const n = nodes[idx];
        if (n.kind === 'CommentLine') continue;
        const c = actorContext(n.actorRef, { ...ctx, ...ctx.selfContext, node: n, availableLocalNames: new Set(available) }, n, where);
        if (n.kind === 'LocalVariableDeclaration' || n.kind === 'LocalListDeclaration') {
          if (!ctx.definition || !top || seenExecutable)
            add('S313', 'この中だけの へんすう・リストは、自分で作ったブロックの いちばん上でだけ 作れます', n, where);
          try {
            validateName(n.name);
          } catch (err) {
            add('S302', err.message, n, where);
          }
          if (declared.has(n.name))
            add(
              'S302',
              `この 中だけの 名前「${n.name}」が、入れる ものの 名前か、ほかに 作った 名前と 同じです。ちがう 名前に して ください`,
              n,
              where,
            );
          declared.add(n.name);
          if (n.kind === 'LocalVariableDeclaration') analyzeExpr(n.initial, c, where);
          available.add(n.name);
          continue;
        }
        seenExecutable = true;
        // 名人: 【…】という手順を、次のように作る only registers the procedure (read as its own item).
        if (n.kind === 'ActionDefinition') continue;
        const exprFields = [
          'value',
          'condition',
          'count',
          'list',
          'seconds',
          'question',
          'message',
          'distance',
          'duration',
          // The legs of 決めたばしょへ行く / いまのばしょから動く.
          'x',
          'y',
        ];
        for (const f of exprFields) if (n[f]) analyzeExpr(n[f], c, where);
        for (const x of n.args || []) analyzeExpr(x, c, where);
        for (const x of n.targets || []) analyzeExpr(x, c, where);
        if (n.kind === 'ExtensionCommand') checkExtensionOperation(n, 'commands', where);
        checkStaticRoleUnits(n, where);
        if (n.index) analyzeExpr(n.index, c, where);
        if (n.target && n.target.kind) analyzeExpr(n.target, c, where);
        if (
          [
            'Assignment',
            'NumericUpdate',
            'ListAppend',
            'ListInsert',
            'ListReplace',
            'ListDelete',
            'ListClear',
            'ListRemoveValue',
          ].includes(n.kind)
        ) {
          const info = targetExists(n.target, symbols, c);
          if (!info) {
            add(
              'S301',
              n.target.qualifier === 'self' && c.targetId
                ? `${targetLabel(c)}の自分には「${n.target.name}」が ありません`
                : (n.kind === 'Assignment' && !n.target.qualifier && propertyWord(n.target.name, n.value, c)) ||
                  `「${n.target.name}」という へんすうや リストが ありません。名前を たしかめるか、その 名前の へんすうか リストを 作って ください${wordHint(n.target.name)}`,
              n,
              where,
            );
          } else {
            if (['Assignment', 'NumericUpdate'].includes(n.kind) && info.kind === 'scalar') {
              const declaration = info.scope === 'project' ? symbols.projectVars.get(n.target.name)
                : info.scope === 'self' ? symbols.individualByTargetId.get(c.targetId)?.variables.get(n.target.name) : null;
              if (declaration?.expectedUnit != null) {
                const unit = staticUnit(n.value, n, where);
                if (unit !== undefined && unit !== null && unit !== declaration.expectedUnit)
                  add('R417', `ここでは ${declaration.expectedUnit}の 数を 使います。${unit}の 数は 使えません`, n, where);
              }
            }
            if (info.scope === 'binder')
              add('S312', `「${n.target.name}」は「それぞれ」の くり返しで 使う 名前です。読むだけで、中身は かえられません`, n, where);
            const listOp = n.kind.startsWith('List');
            if (info.kind !== 'dynamic' && listOp && info.kind !== 'list')
              add('S310', `「${n.target.name}」は リストでは ありません`, n, where);
            if (
              ctx.definitionKind === 'function' &&
              !['local', 'arg', 'binder'].includes(info.scope)
            )
              add('S305', '「答えを もとめる」の 中からは、作品や 部品の へんすう・リストを かえられません', n, where);
          }
        }
        if (
          ctx.definitionKind === 'function' &&
          [
            'Say',
            'Ask',
            'Broadcast',
            'BroadcastAndWait',
            'WaitBroadcastGroup',
            'ContinuousRule',
            'WaitTime',
            'WaitUntil',
            'TimerReset',
            'MotionCommand',
            'LooksCommand',
            'PenCommand',
            'SoundCommand',
            'CloneCommand',
            'StopCommand',
            'UserActionCall',
            'ExtensionCommand',
          ].includes(n.kind)
        )
          add('S305', '「答えを もとめる」の 中では、動く・音を 出す・待つ などの やる ことは 使えません', n, where);
        if (n.kind === 'ReturnStatement') {
          if (ctx.definitionKind === 'action') add('S307', 'てじゅんでは 答えを 返せません。答えを 返す ときは「答えを もとめる」で 作ります', n, where);
          if (ctx.definitionKind !== 'function')
            add('S307', 'きっかけの 本文では「〜を返す」は 使えません。答えを 返すのは「答えを もとめる」の 中だけです', n, where);
          if (!top) add('S306', '「答えを もとめる」の「返す」は、「もし」や「くり返す」の 中には 書けません。いちばん 下の 行に 書きます', n, where);
        }
        if ((n.kind === 'Break' || n.kind === 'Continue') && loopDepth === 0)
          add('S309', `「${n.kind === 'Break' ? 'このくり返しを終える' : 'この回の残りをとばして、次の回へ進む'}」は、くり返しの 中で だけ 使えます`, n, where);
        if (n.kind === 'UserActionCall') {
          const a = symbols.actions.get(n.name);
          if (!a) add('S301', `「${n.name}」という てじゅんが 見つかりません。名前を たしかめて ください`, n, where);
          else if (a.args.length !== n.args.length)
            add('S308', `てじゅん「${n.name}」に 入れる ものは ${a.args.length}こです`+namedArgumentDetails(a.args,n.argumentNames), n, where);
          else { checkArguments(n, a, where); analyzeCallable(a, 'action', c.meijin && c.targetType === 'stage' && n.actorRef?.kind !== 'named' ? { ...c, meijinCall: { node: n, where, name: n.name, given: callValues(n) } } : c); }
        }
        if (n.kind === 'MotionCommand' && ['POINT_TO', 'GOTO_PART'].includes(n.op))
          checkComponentTarget(n.args?.[0], null, c, where, '部品', ['マウス']);
        // 〜のところへ行く goes to a part or the mouse (final call 3): another value (点数, a calculation, a place) would only
        // fail when it runs, so it stops here. 名人 also goes to a part held in a value.
        const goal = n.kind === 'MotionCommand' && n.op === 'GOTO_PART' && !c.meijin ? n.args?.[0] : null;
        if (goal && !['StringLiteral', 'PartRef', 'Hole'].includes(goal.kind) && !(goal.kind === 'VariableRead' && !goal.qualifier && componentByName(goal.name)))
          add('S304', '「〜のところへ行く」の 行き先には、部品の 名前（れい：「'+(project.components.find(p=>p.id!==c.targetId)?.name||'マウス')+'」）か マウスを 書きます', n, where);
        if (n.kind === 'CloneCommand' && n.op === 'CREATE_TARGET')
          checkComponentTarget(n.args?.[0], ['sprite'], c, where, 'コピーするキャラクター');
        if (
          n.kind === 'CloneCommand' &&
          ['CREATE_SELF', 'DELETE_SELF'].includes(n.op) &&
          c.targetType &&
          c.targetType !== 'sprite'
        )
          add('S304', '自分の コピーを 作ったり けしたり できるのは、キャラクターだけです', n, where);
        // 名人: ねこは消える — only a copy goes; the part itself never does.
        if (c.meijin && n.kind === 'CloneCommand' && n.op === 'DELETE_SELF' && n.actorRef?.kind === 'named')
          add('S304', `「${n.actorRef.name}」は コピーでは ないので、消えません。消えるのは コピーだけです。れい：できたコピーは、それぞれ消える`, n, where);
        if (n.kind === 'LooksCommand' && n.op === 'SET_TARGET_TEXT')
          checkComponentTarget(n.args?.[0], ['label', 'button', 'box'], c, where, '文字をかえる部品');
        if (n.kind === 'LooksCommand' && n.op === 'SET_INPUT')
          checkComponentTarget(n.args?.[0], ['input'], c, where, '入力らん');
        // かばんを言う: a list is not said as it is (running would stop there, FCM-17); its items are.
        if(n.kind==='Say'){
          const values=n.value?.kind==='BuiltinCall'&&n.value.name==='つなぐ'?n.value.args:[n.value],list=values.find(v=>v?.kind==='VariableRead'&&targetExists({name:v.name,qualifier:v.qualifier},symbols,c)?.kind==='list');
          if(list)add('S304','リストは そのまま 言えません。中身を 言う ときは「'+nameSource(list.name,list.qualifier)+'の1番目を言う」のように 書きます',n,where);
        }
        if (n.kind === 'SoundCommand' && ['SAMPLE', 'SAMPLE_WAIT'].includes(n.op)) {
          const name = literalText(n.args?.[0]), arg = n.args?.[0];
          // ピアノの音を鳴らす with no sound and no data ピアノ (P10/P20 B(3)): the name is a sound's, so the child is told to
          // put the sound in and write its name in 「 」, never to make a variable.
          if (arg?.kind === 'VariableRead' && !arg.qualifier && !targetExists({ name: arg.name, qualifier: null }, symbols, c)) {
            for (let i = diags.length - 1; i >= 0; i--) if (diags[i].where === where && diags[i].code === 'S301' && diags[i].message.startsWith(`まだ 作っていない 名前「${arg.name}」`)) diags.splice(i, 1);
            // 音を鳴らす: the word 音 is no sound's name; the sound is named (FM2-03).
            add('S301', /^(?:音|音楽|おと|おんがく|BGM)$/.test(arg.name) ? (project.sounds.length ? `鳴らす 音の 名前を「 」で 書きます。れい：「${project.sounds[0].name}」の音を鳴らす` : '鳴らす 音を 作品に 入れてから、その 名前を「 」で 書きます')
              : `この 作品には「${arg.name}」という 音が ありません。音を 入れてから、名前を「 」で かこんで「「${arg.name}」を${n.op === 'SAMPLE' ? '鳴らし始める' : '鳴らす'}」と 書きます`, n, where);
          }
          // A ドレミ name with no such sound stops with the Hz guidance (final call 29), quoted or not and at every level.
          if (name !== null && !project.sounds.some((x) => x.name === name))
            add('S301', Object.hasOwn(SOLFEGE_HZ, name) ? solfegeMissingMessage(name, dataNameKind(name, symbols, c)) : `「${name}」という 音が 見つかりません。名前を たしかめるか、その 名前の 音を 入れて ください`, n, where);
        }
        if (n.kind === 'LooksCommand' && n.op === 'SET_BACKDROP') {
          const name = literalText(n.args?.[0]);
          if (name !== null && !project.stage.backdrops.some((b) => b.name === name))
            add('S301', `「${name}」という はいけいが 見つかりません。名前を たしかめるか、その 名前の はいけいを 入れて ください`, n, where);
        }
        if (
          n.kind === 'LooksCommand' &&
          ['SET_COSTUME', 'NEXT_COSTUME', 'PREV_COSTUME'].includes(n.op) &&
          c.targetType &&
          c.targetType !== 'sprite'
        )
          add('S304', 'すがたを かえられるのは、キャラクターだけです', n, where);
        if (n.kind === 'LooksCommand' && n.op === 'SET_COSTUME' && c.targetType === 'sprite') {
          const name = literalText(n.args?.[0]),
            comp = project.components.find((x) => x.id === c.targetId);
          if (name !== null && comp && !comp.costumes.some((co) => co.name === name))
            add('S301', `「${name}」という すがたが 見つかりません。名前を たしかめるか、その 名前の すがたを 入れて ください`, n, where);
        }
        if (
          n.kind === 'LooksCommand' &&
          n.op === 'SET_SELF_TEXT' &&
          c.targetType &&
          !['label', 'button', 'box'].includes(c.targetType)
        )
          add('S304', '「自分の文字を〜にかえる」は 文字・ボタン・四角の 部品で 使います', n, where);
        if (
          (n.kind === 'LooksCommand' && n.op === 'SET_COLOR') ||
          (n.kind === 'PenCommand' && n.op === 'SET_COLOR')
        ) {
          const name = literalText(n.args?.[0]);
          if (name !== null)
            try {
              resolveColor(name, { allowTransparent: false });
            } catch (_) {
              add('S304', `色「${name}」は 使える 色では ありません。使える 色は 黒・白・ねずみ色・赤・だいだい・黄・緑・水色・青・むらさき・もも色・茶 です`, n, where);
            }
        }
        // 名人: a procedure called with no subject is the stage's; who does its sentences is written at the call (決まり7).
        const needsSubject = message => c.meijinCall ? add('S304', `手順【${c.meijinCall.name}】の 中に、だれが するかを 書いて いない 文が あります。手順を 呼び出す 文の はじめに、だれが 行うかを 書きます。れい：ねこは${c.meijinCall.given ? '、' + c.meijinCall.given + 'として、' : ''}【${c.meijinCall.name}】という手順を行う`, c.meijinCall.node, c.meijinCall.where)
          : add('S304', c.meijin ? (n.actorRef?.topicEnded ? MEIJIN_TOPIC_ENDED : MEIJIN_SUBJECT_MESSAGE) : message, n, where);
        // 名人: speech and sounds need who does them, as moves do (the script itself is no part; 画面は… names the stage).
        // Stopping every sound acts on the whole work.
        // 名人 (決まり4・6): in a heading's body too, a sentence after one with other subjects in it names who does it; in
        // 〜が〜にふれたとき、 it always does (either part could be meant).
        if (c.meijin && c.targetType !== 'stage' && n.actorRef?.kind === 'self' && (n.actorRef.topicEnded || n.actorRef.mustName) &&
          (['Say', 'Ask', 'MotionCommand', 'PenCommand', 'LooksCommand'].includes(n.kind) || (n.kind === 'SoundCommand' && n.op !== 'STOP_ALL')))
          add('S304', n.actorRef.mustName ? '「〜が〜にふれたとき、」の 中身では、ふれた 二つの 部品の どちらが するかが 決まらないので、だれが するかを 書きます。れい：「だんごが星にふれたとき、星は「いたい」と言う」' : MEIJIN_TOPIC_ENDED, n, where);
        if ((c.meijin || c.meijinCall) && c.targetType === 'stage' && n.actorRef?.kind !== 'named' &&
          (['Say', 'Ask'].includes(n.kind) || (n.kind === 'SoundCommand' && n.op !== 'STOP_ALL')))
          needsSubject(MEIJIN_SUBJECT_MESSAGE);
        // Clearing every line and stamp acts on the whole work, so the stage may do it.
        if (['MotionCommand', 'PenCommand'].includes(n.kind) && c.targetType === 'stage' && !(n.kind === 'PenCommand' && n.op === 'CLEAR'))
          needsSubject('動く ことや ペンで かく ことは、画面では できません。部品の 本文で 使って ください');
        if (
          n.kind === 'LooksCommand' &&
          [
            'SET_SCALE',
            'SET_COSTUME',
            'NEXT_COSTUME',
            'PREV_COSTUME',
            'FRONT',
            'BACK',
            'FORWARD_LAYERS',
            'BACKWARD_LAYERS',
            'HIDE',
            'SHOW',
            'SET_COLOR',
          ].includes(n.op) &&
          c.targetType === 'stage'
        )
          needsSubject('この かえ方は、画面では 使えません。部品の 本文で 使って ください');
        if (
          n.kind === 'ForEach' && n.binder !== MEIJIN_BINDER &&
          [
            ...(c.binders || []),
            ...(c.localVarNames || []),
            ...(c.localListNames || []),
            ...(c.args || []),
          ].includes(n.binder)
        )
          add('S312', `「${n.binder}」は、ここで もう 使って いる 名前です。ちがう 名前に して ください`, n, where);
        if (n.kind === 'IfStatement') {
          walk(n.thenBody, c, where, loopDepth, false);
          walk(n.elseBody, c, where, loopDepth, false);
        } else if (
          ['RepeatCount', 'RepeatWhile', 'RepeatUntil', 'ForEach', 'Forever', 'TimedRepeat'].includes(n.kind)
        ) {
          const cc = n.kind === 'ForEach' ? { ...c, binders: [...(c.binders || []), n.binder] } : c;
          walk(n.body, cc, where, loopDepth + 1, false);
        } else if (n.kind === 'Parallel') {
          // A lane's control words are checked by laneControlPlacement (S315).
          for (const lane of n.lanes || []) walk(lane, c, where, loopDepth + 1, false);
        } else if (n.kind === 'ParallelEach') {
          walk(n.body, { ...c, binders: [...(c.binders || []), n.binder] }, where, loopDepth + 1, false);
        }
      }
    };
    const visitedCallContexts = new Set(),
      pendingCallContexts = [];
    analyzeCallable = (def, kind, parentCtx) => {
      const key = `${kind}:${def.id}`,
        item = itemsByKey.get(key);
      if (!item) return;
      const ck = `${key}|${parentCtx.targetId || '*'}|${parentCtx.targetType || '*'}|${parentCtx.meijinCall ? 'meijin' : ''}`;
      if (visitedCallContexts.has(ck)) return;
      visitedCallContexts.add(ck);
      const base = {
        event: parentCtx.event || null,
        targetType: parentCtx.targetType || null,
        targetId: parentCtx.targetId || null,
        definition: def,
        definitionKind: kind,
        meijinCall: parentCtx.meijinCall || null,
        args: item.args || [],
        localVarNames: item.localVarNames || [],
        localListNames: item.localListNames || [],
        binders: [],
        availableLocalNames: new Set(),
      };
      pendingCallContexts.push({ item, base, key });
    };
    const checkReturn = (item) => {
      if (item.definitionKind !== 'function') return;
      const exec = item.ast.body.filter((n) => n.kind !== 'CommentLine');
      if (!exec.length || exec[exec.length - 1].kind !== 'ReturnStatement')
        add(
          'S306',
          `答えを もとめる「${item.definition.name}」の いちばん 下の 行は「〜を答えとして返す」に します。れい：1＋2を答えとして返す`,
          exec[exec.length - 1] || { sourceSpan: { startLine: 1, startColumn: 1 } },
          item.key,
        );
      for (let j = 0; j < exec.length - 1; j++)
        if (exec[j].kind === 'ReturnStatement')
          add('S306', '「返す」は、「答えを もとめる」の いちばん 下に 1回だけ 書きます', exec[j], item.key);
    };
    for (const item of compiled.items) {
      if (rootKeys && !rootKeys.has(item.key)) continue;
      if (item.event === 'keyDown' && typeof item.filter?.key === 'string' && !validKeyName(item.filter.key))
        add('S301', keyNameMessage(item.filter.key), item.ast?.body?.[0] || { sourceSpan: { startLine: 1, startColumn: 1 } }, item.key);
      const base = {
        event: item.event, filter: item.filter || null,
        targetType: item.targetType,
        targetId: item.targetId || null,
        definition: item.definition || null,
        definitionKind: item.definitionKind || null,
        args: item.args || [],
        localVarNames: item.localVarNames || [],
        localListNames: item.localListNames || [],
        binders: [],
        availableLocalNames: new Set(),
        // 名人: under a heading that names the stage (作品を動かしたとき、画面1は、) the sentences are the stage's, as in
        // the stage's own body; elsewhere a 名人 text belongs to no part.
        meijin: !!item.meijin && !(item.ast?.heading?.actorRef?.kind === 'named' && namesStage(project, item.ast.heading.actorRef.name)),
      };
      for (const d of staticScaleDiagnostics(item.ast, item.key))
        add(d.code, d.message, { sourceSpan: { startLine: d.line, startColumn: d.column } }, d.where);
      // 名人のできごと: 〜になったとき and 〜秒ごとに are read like any value; ふれる相手は部品。
      const heading = item.ast.heading, at = item.ast.body?.[0] || { sourceSpan: { startLine: 1, startColumn: 1 } };
      if (!item.meijin) { const only = meijinOnlyNode(item.ast); if (only) add('S317', MEIJIN_ONLY_MESSAGE, only.sourceSpan ? only : at, item.key); }
      const message = typeof item.filter === 'object' ? item.filter?.message : item.filter;
      const extensionEvent = !item.meijin && item.event === 'message' && typeof message === 'string' && message.startsWith('拡張:')
        ? EXTENSION_HOST.describe(message.slice(3), 'events') : null;
      if (extensionEvent?.scope === 'meijin') add('S317', `拡張の きっかけ「${extensionEvent.displayName}」は、名人の本文で だけ 使えます`, at, item.key);
      if (heading?.condition) analyzeExpr(heading.condition, { ...base, node: at }, item.key);
      if (heading?.seconds) analyzeExpr(heading.seconds, { ...base, node: at }, item.key);
      // ふれたとき's partner is a part or the edge (端, 端:上 …); the message is at the heading, or the body's first line.
      // 画面の右にふれたとき and 右のはしにふれたとき name one side of the screen: 画面の右のはし.
      const sideOf = /^(?:画面の(上|下|右|左)|(上|下|右|左)の(?:はし|端))$/.exec(item.filter?.target ?? ''), side = sideOf?.[1] || sideOf?.[2];
      if (item.event === 'touchStart' && !isEdgeTarget(item.filter?.target) && !componentByName(item.filter?.target))
        add('S301', side ? `画面の ${side}の はしの ことなら、「画面の${side}のはし」と 書きます` : `「${item.filter?.target}」という キャラクターや 部品が 見つかりません。名前を たしかめて ください`, heading ? { sourceSpan: { startLine: item.ast.sourceSpan?.startLine || 1, startColumn: 1 } } : at, item.key);
      walk(item.ast.body, base, item.key, 0, true);
      for (const rule of item.ast.rules || []) {
        const c = actorContext(rule.actorRef, { ...base, node: rule }, rule, item.key);
        if (c.targetType === 'stage') add('S304', '画面は「動き続ける」で 動かせません。動かす 部品を えらんで ください', rule, item.key);
        if (item.definitionKind) add('S305', '「動き続ける」は、きっかけの 本文に 書いて ください。自分で 作った ブロックの 中には 書けません', rule, item.key);
        for (const key of ['condition', 'seconds', 'distance']) analyzeExpr(rule[key], c, item.key);
        checkStaticRoleUnits(rule, item.key);
      }
      checkReturn(item);
    }
    for (let i = 0; i < pendingCallContexts.length; i++) {
      const { item, base, key } = pendingCallContexts[i];
      for (const d of staticScaleDiagnostics(item.ast, key))
        add(d.code, d.message, { sourceSpan: { startLine: d.line, startColumn: d.column } }, d.where);
      walk(item.ast.body, base, key, 0, true);
      checkReturn(item);
    }
    return diags;
  }
  function syntaxItem(key, ast, context) {
    const localVarNames = [],
      localListNames = [];
    if (context.definition)
      for (const node of ast.body) {
        if (node.kind === 'CommentLine') continue;
        if (node.kind === 'LocalVariableDeclaration') localVarNames.push(node.name);
        else if (node.kind === 'LocalListDeclaration') localListNames.push(node.name);
        else break;
      }
    return { ...context, key, ast, source: ast.source || '', localVarNames, localListNames };
  }
  function scriptSourceKey(script) {
    return script.id ? `script:${script.id}` : `script:${script.targetId}:${script.event}`;
  }
  function scriptBySourceKey(project, key) {
    return project.scripts.find((script) => scriptSourceKey(script) === key) || null;
  }
  function scriptHeadingMetadata(source, script, project) {
    if (isMeijinScript(script)) return { targetId: MEIJIN_OWNER, event: 'start', filter: undefined };
    const parsed = parseSyntax(source, { targetId: script.targetId, event: script.event,
      symbols: buildSymbols(project) });
    return scriptMetadataFromHeading(parsed.ast?.heading, script, project);
  }
  // The stage has no outline to touch with: a touch body is written in the body of the part that touches.
  const STAGE_TOUCH_MESSAGE = '画面は ほかの ものに ふれません。ふれる 部品の 本文に 書きます';
  function scriptMetadataFromHeading(heading, script, project) {
    if (!heading) return { targetId: script.targetId, event: script.event, filter: script.filter };
    const targetId = heading.actorRef?.kind === 'named'
      ? (heading.actorRef.targetId || (namesStage(project, heading.actorRef.name) ? 'stage' :
        project.components.find((c) => c.name === heading.actorRef.name)?.id)) : script.targetId;
    const type = targetId === 'stage' ? 'stage' : project.components.find((c) => c.id === targetId)?.type;
    // 旗がおされたとき (the start button of other tools): the start is 作品を動かしたとき、.
    if (!type && heading.event === 'click' && /^(?:旗|はた|緑の旗|みどりの旗|みどりのはた|▶(?:動かす)?)$/.test(heading.actorRef?.name || ''))
      throw new AkariError('S301', '「▶ 動かす」を おした ときに 始める ときは、「作品を動かしたとき、」と 書きます', 1, 1);
    if (!type) throw new AkariError('S301', 'きっかけに 書いた キャラクターや 部品が 見つかりません。名前を たしかめて ください');
    // The stage's 「星」にふれたとき、 keeps the body as it was; the check says why at the heading (S304).
    if (heading.event === 'touchStart' && type === 'stage') return { targetId: script.targetId, event: script.event, filter: script.filter };
    if (!EVENT_BY_TYPE[type]?.includes(heading.event))
      throw new AkariError('F506', 'この 部品では 使えない きっかけです');
    return { targetId, event: heading.event, filter: heading.filter };
  }
  function updateScriptSource(script, source, project) {
    const metadata = scriptHeadingMetadata(source, script, project);
    // A 名人 script is read with the 名人 grammar, so its units keep their identities too.
    const reading = isMeijinScript(script) ? { targetId: 'stage', event: 'start', meijin: true } : {};
    const before=parseSyntax(script.source,{...reading,symbols:buildSymbols(project)}).ast,after=parseSyntax(source,{...reading,symbols:buildSymbols(project)}).ast;
    if(after&&(after.units||script.document)){
      const ids=new Set(),scan=value=>{if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){if(key==='id'&&typeof child==='string')ids.add(child);else if(key==='unitIds'&&Array.isArray(child))child.forEach(id=>ids.add(id));else if(child&&typeof child==='object')scan(child);}};scan(project);
      const fresh=()=>{let i=1;while(ids.has('unit-'+i))i++;const id='unit-'+i;ids.add(id);return id;};
      if(!script.id){let i=1;while(ids.has('document-'+i))i++;script.id='document-'+i;ids.add(script.id);}
      const list=ast=>ast?[ast,...(ast.units||[])]:[],oldUnits=list(before),newUnits=list(after),used=new Set(),unitIds=[];
      const text=(unit,original)=>{const range=SOURCE_RANGES.get(unit)?.range;return range?original.slice(range.start,range.end).trim():unit.source?.trim();};
      for(let i=0;i<newUnits.length;i++){
        const value=text(newUnits[i],source),match=oldUnits.findIndex((unit,j)=>!used.has(j)&&text(unit,script.source)===value);
        if(match>=0){used.add(match);unitIds[i]=script.document?.unitIds[match]||fresh();}
      }
      // Preserve edited units only when their event identity is unambiguous in
      // both documents. Positional matching could give an inserted event the ID
      // of a different event whose text was edited in the same transaction.
      const signature=unit=>JSON.stringify(unit.heading||{event:script.event,actorRef:{kind:'self'},filter:script.filter||null});
      for(let i=0;i<newUnits.length;i++)if(!unitIds[i]){
        const sig=signature(newUnits[i]),old=oldUnits.map((unit,j)=>({unit,j})).filter(({unit,j})=>!used.has(j)&&signature(unit)===sig),
          incoming=newUnits.filter((unit,j)=>!unitIds[j]&&signature(unit)===sig);
        if(old.length===1&&incoming.length===1){used.add(old[0].j);unitIds[i]=script.document?.unitIds[old[0].j]||fresh();}
      }
      for(let i=0;i<newUnits.length;i++)if(!unitIds[i])unitIds[i]=fresh();
      script.document={revision:(script.document?.revision||0)+(source===script.source?0:1),unitIds};
    }
    Object.assign(script, metadata, { source });
    if (metadata.filter === undefined) delete script.filter;
    return script;
  }
  // The complete set of editable source bodies. No syntax filtering is permitted here.
  function sourceRegistry(project) {
    const owners = new Map([['stage', 'stage'], [MEIJIN_OWNER, MEIJIN_OWNER], ...project.components.map(c => [c.id, c.type])]);
    const keys = new Set();
    const register = (key, ownerId, source) => {
      if (!owners.has(ownerId) || keys.has(key) || typeof source !== 'string')
        throw new AkariError('F503', '作品の 本文の 中身が こわれて いて、読めません');
      keys.add(key);
    };
    for (const s of project.scripts) {
      register(scriptSourceKey(s), s.targetId, s.source);
      if (isMeijinScript(s)) continue;
      if (!EVENT_BY_TYPE[owners.get(s.targetId)]?.includes(s.event))
        throw new AkariError('F506', 'この 部品では 使えない きっかけです');
    }
    for (const [kind, definitions] of [['action', project.actions], ['function', project.functions]])
      for (const d of definitions) {
        register(`${kind}:${d.id}`, d.ownerId, d.source);
        if (d.ownerId !== 'stage') throw new AkariError('F503', '自分で 作った ブロックが、画面の ものに なって いません。作品の 中身が こわれて います');
      }
    return [
      ...project.scripts.map(s => isMeijinScript(s) ? ({
        key: scriptSourceKey(s), ownerId: MEIJIN_OWNER, id: s.id, scriptId: s.id,
        kind: 'script', event: 'start', filter: undefined, source: s.source, title: '名人の本文',
        // Belongs to no part; its sentences name who acts, and it runs as the stage's.
        context: { id: s.id, scriptId: s.id, unitIds: s.document?.unitIds, filter: undefined, ownerId: 'stage', targetId: 'stage',
          targetType: 'stage', event: 'start', args: [], definition: null, definitionKind: null, meijin: true },
      }) : ({
        key: scriptSourceKey(s), ownerId: s.targetId, id: s.id, scriptId: s.id,
        kind: 'script', event: s.event, filter: s.filter, source: s.source,
        title: eventText(s.event, s.filter),
        context: { id: s.id, scriptId: s.id, unitIds:s.document?.unitIds, filter: s.filter, ownerId: s.targetId, targetId: s.targetId,
          targetType: s.targetId === 'stage' ? 'stage' : project.components.find(c => c.id === s.targetId).type,
          event: s.event, args: [], definition: null, definitionKind: null },
      })),
      ...[['action', project.actions], ['function', project.functions]].flatMap(([kind, definitions]) =>
        definitions.map(d => ({
          key: `${kind}:${d.id}`, ownerId: d.ownerId, kind, source: d.source,
          title: `${kind === 'action' ? 'てじゅん' : '答えをもとめる'}「${d.name}」`,
          context: { ownerId: d.ownerId, targetId: null, targetType: null, event: null,
            args: d.args, definition: d, definitionKind: kind },
        }))),
    ];
  }
  function sourceReferences(record, project) {
    const parsed = parseSyntax(record.source, { ...record.context, symbols: buildSymbols(project) });
    const refs = new Set();
    const walk = value => {
      if (!value || typeof value !== 'object') return;
      if (value.kind === 'UserActionCall' || value.kind === 'UserFunctionCall') {
        const kind = value.kind === 'UserActionCall' ? 'action' : 'function';
        const definition = project[kind === 'action' ? 'actions' : 'functions'].find(d => d.name === value.name);
        if (definition) refs.add(`${kind}:${definition.id}`);
      }
      for (const child of Object.values(value))
        if (Array.isArray(child)) child.forEach(walk); else walk(child);
    };
    walk(parsed.ast);
    return [...refs];
  }
  function projectResourceNodes(project) {
    const nodes = [], add = (kind, item, ownerId = 'stage') => nodes.push({ key: `${kind}:${item.id}`, kind, id: item.id, name: item.name, ownerId });
    add('component', project.stage);
    for (const c of project.components) {
      add('component', c, c.id);
      for (const costume of c.costumes || []) add('costume', costume, c.id);
      for (const d of [...c.localData.variables, ...c.localData.lists]) add('data', d, c.id);
    }
    for (const b of project.stage.backdrops) add('backdrop', b);
    for (const s of project.sounds) add('sound', s);
    for (const d of [...project.projectData.variables, ...project.projectData.lists]) add('data', d);
    for (const kind of ['action', 'function']) for (const d of project[kind === 'action' ? 'actions' : 'functions']) add(kind, d);
    return nodes;
  }
  // Code and Block share these parsed semantic references. Unknown source and
  // computed resource names are explicit uncertainty, never evidence of no use.
  function buildProjectReferenceGraph(project, { drafts = [] } = {}) {
    const resources = projectResourceNodes(project), references = [], uncertain = [], symbols = buildSymbols(project);
    const records = [...sourceRegistry(project), ...drafts];
    // Procedures made in a 名人 script's text: their uses are at their lines in that script.
    for (const d of meijinProjectDefinitions(project)) records.push({ key: `script:${d.scriptId}`, ownerId: MEIJIN_OWNER, kind: 'action', title: `名人の本文の手順「${d.name}」`,
      source: d.source, lineOffset: d.line - 1, pathPrefix: ['meijinDefinition', d.id],
      context: { ownerId: 'stage', targetId: null, targetType: null, event: null, args: d.args, definition: d, definitionKind: 'action', meijin: true } });
    const actor = ref => ref?.kind === 'named' ? ref.targetId || (namesStage(project, ref.name) ? 'stage' : project.components.find(c => c.name === ref.name)?.id) : null;
    for (const record of records) {
      const parsed = parseSyntax(record.source, { ...record.context, symbols });
      const ownerName = record.ownerId === 'stage' ? project.stage.name : project.components.find(c => c.id === record.ownerId)?.name;
      const location = node => ({ sourceKey: record.key, ownerId: record.ownerId, title: [ownerName, record.title || '本文'].filter(Boolean).join(' / '), line: (node?.sourceSpan?.startLine || 1) + (record.lineOffset || 0) });
      if (record.incomplete) uncertain.push({ ...location(), kind: null, reason: 'まだ 決まって いない 入力が あるので、名前を 使って いる ところを ぜんぶは しらべられません。入力を 決めてから、もう 一度 ためして ください' });
      if (!parsed.ast) { uncertain.push({ ...location(), kind: null, reason: '書きかけの 本文が あるので、名前を 使って いる ところを ぜんぶは しらべられません。本文を 書きおえてから、もう 一度 ためして ください' }); continue; }
      const paths = new WeakMap();
      const indexPaths = (node,path=[]) => {if(!node||typeof node!=='object')return;paths.set(node,path);for(const [key,value]of Object.entries(node)){if(['sourceSpan','source'].includes(key))continue;if(Array.isArray(value))value.forEach((child,i)=>indexPaths(child,[...path,key,i]));else if(value&&typeof value==='object')indexPaths(value,[...path,key]);}};
      indexPaths(parsed.ast, record.pathPrefix || []);
      const local = syntaxItem(record.key, parsed.ast, record.context);
      const localNames = new Set([...(record.context.args || []), ...local.localVarNames, ...local.localListNames]);
      const add = (resource, node, binding = 'name') => {
        // A procedure made in a 名人 text is read from its own lines; its places are not places in the script's text.
        const range = record.pathPrefix ? null : binding === 'touch' ? SOURCE_RANGES.get(node)?.targetRange : SOURCE_RANGES.get(node)?.range;
        references.push({ ...location(node), resourceKey: resource.key, name: resource.name, binding, nodePath: paths.get(node),
          ...(range ? { range: { start: range.start, end: range.end } } : {}) });
      };
      const named = (kind, expr, ownerId, special = []) => {
        // 名人: a part written as a value is recorded where it is read (PartRef); いちばん近い… names its set there.
        if (['PartRef', 'PartNearest'].includes(expr?.kind)) return;
        if (expr?.kind !== 'StringLiteral') {
          uncertain.push({ ...location(expr), kind, targetOwnerId: ownerId || null, reason: '動かして はじめて 決まる 名前を 使って いるので、ここでは しらべられません' }); return;
        }
        if (special.includes(expr.value)) return;
        for (const r of resources.filter(r => r.kind === kind && r.name === expr.value && (!ownerId || r.ownerId === ownerId))) add(r, expr, 'literal');
      };
      const data = (ref, node, ownerId, bound) => {
        if (!ref?.name || (!ref.qualifier || ref.qualifier === 'exact') && bound.has(ref.name)) return;
        let matches = resources.filter(r => r.kind === 'data' && r.name === ref.name);
        if (ref.qualifier === 'project') matches = matches.filter(r => r.ownerId === 'stage');
        else if (ref.qualifier === 'self') matches = matches.filter(r => ownerId ? r.ownerId === ownerId : r.ownerId !== 'stage');
        else if (ownerId) { const own = matches.filter(r => r.ownerId === ownerId); matches = own.length ? own : matches.filter(r => r.ownerId === 'stage'); }
        for (const r of matches) add(r, node);
      };
      const walk = (node, ownerId, bound) => {
        if (!node || typeof node !== 'object') return;
        const ref = node.heading?.actorRef || node.actorRef;
        const resolved = actor(ref);
        if (resolved) {
          ownerId = resolved;
          const target = resources.find(r => r.key === 'component:' + resolved);
          if (target) add(target, node, 'actor');
        }
        if (node.kind === 'Hole') uncertain.push({ ...location(node), kind: null, reason: 'まだ 中身を えらんで いない ところが あります' });
        if (node.kind === 'UserActionCall' || node.kind === 'UserFunctionCall') {
          const kind = node.kind === 'UserActionCall' ? 'action' : 'function';
          for (const r of resources.filter(r => r.kind === kind && r.name === node.name)) add(r, node);
        }
        if (node.kind === 'VariableRead') data(node, node, ownerId, bound);
        if (node.target?.name) data(node.target, node.target, ownerId, bound);
        // 名人: parts as values, the part held in a value as the subject, 〜が大きいほう, and ふれたとき's other part.
        if (node.kind === 'PartRef' || node.kind === 'PartFamily')
          for (const r of resources.filter(r => r.kind === 'component' && r.ownerId !== 'stage' && r.name === node.name)) add(r, node, 'literal');
        if (node.kind === 'PartPick' && node.by?.kind === 'variable') data({ name: node.by.name, qualifier: 'self' }, node, null, bound);
        // ふれたとき's partner, where the heading writes it (a common heading's token is renamed; 名人 text is renamed by
        // its words). A body with no heading keeps its partner in the work (filter.target, renamed with the part).
        if (node.heading?.event === 'touchStart')
          for (const r of resources.filter(r => r.kind === 'component' && r.name === node.heading.filter?.target)) add(r, node, 'touch');
        if (node === parsed.ast && !node.heading && record.kind === 'script' && record.context.event === 'touchStart')
          for (const r of resources.filter(r => r.kind === 'component' && r.name === record.context.filter?.target))
            references.push({ ...location(node), resourceKey: r.key, name: r.name, binding: 'filter', nodePath: paths.get(node) });
        // The subject's value is placed at its sentence (the value read itself has no place of its own).
        if (node.actorRef?.kind === 'value') {
          ownerId = null;
          if (node.actorRef.value.kind === 'VariableRead') data(node.actorRef.value, node, null, bound); else walk(node.actorRef.value, null, bound);
        }
        if (node.kind === 'LooksCommand' && node.op === 'SET_COSTUME') named('costume', node.args?.[0], ownerId);
        if (node.kind === 'LooksCommand' && node.op === 'SET_BACKDROP') named('backdrop', node.args?.[0]);
        if (node.kind === 'SoundCommand' && ['SAMPLE', 'SAMPLE_WAIT'].includes(node.op)) named('sound', node.args?.[0]);
        if (node.kind === 'MotionCommand' && ['POINT_TO', 'GOTO_PART'].includes(node.op)) named('component', node.args?.[0], null, ['マウス']);
        if (node.kind === 'CloneCommand' && node.op === 'CREATE_TARGET') named('component', node.args?.[0]);
        if (node.kind === 'LooksCommand' && ['SET_TARGET_TEXT', 'SET_INPUT'].includes(node.op)) named('component', node.args?.[0]);
        if (node.kind === 'SensorRead' && ['INPUT_VALUE', 'DISTANCE_TO', 'TOUCHING'].includes(node.sensor)) named('component', node.arg, null, ['マウス', ...Object.keys(EDGE_TARGETS)]);
        for (const [key, value] of Object.entries(node)) {
          if (['sourceSpan', 'actorRef', 'heading', 'source'].includes(key)) continue;
          const scoped = key === 'body' && node.kind === 'ForEach' ? new Set([...bound, node.binder]) : bound;
          if (Array.isArray(value)) value.forEach(child => walk(child, ownerId, scoped));
          else if (value && typeof value === 'object') walk(value, ownerId, scoped);
        }
      };
      walk(parsed.ast, record.kind === 'script' ? record.ownerId : null, localNames);
    }
    return { version: 1, resources, references, uncertain };
  }
  function resourceChangeImpact(project, resourceKey, options = {}) {
    const graph = buildProjectReferenceGraph(project, options), resource = graph.resources.find(r => r.key === resourceKey);
    if (!resource) throw new AkariError('F503', 'かえる ものが 見つかりません');
    return { resource, references: graph.references.filter(r => r.resourceKey === resourceKey),
      uncertain: graph.uncertain.filter(r => (!r.kind || r.kind === resource.kind) && (!r.targetOwnerId || r.targetOwnerId === resource.ownerId)) };
  }

  // Editor candidate checks revisit unchanged documents for every palette item.
  // Keep syntax only: ownership resolution and semantic analysis always run against
  // the current candidate. No cache enters the saved project or runtime contract.
  const EDITOR_PROJECT_SYNTAX_CACHE = { environment: null, records: new Map(), size: 0 };
  function editorSyntaxEnvironment(project) {
    const declaration = ({ source, ...metadata }) => metadata;
    return JSON.stringify({
      stage: project.stage, components: project.components, projectData: project.projectData,
      actions: project.actions.map(declaration), functions: project.functions.map(declaration),
      extensions: ['commands', 'calculations', 'events'].map(kind => EXTENSION_HOST.operations(kind)),
    });
  }
  function freezeEditorSyntax(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) freezeEditorSyntax(child);
    return Object.freeze(value);
  }
  function editorProjectSyntax(key, source, context, symbols) {
    const cache = EDITOR_PROJECT_SYNTAX_CACHE;
    const { definition, ...rest } = context;
    const signature = JSON.stringify({ ...rest, definition: definition
      ? Object.fromEntries(Object.entries(definition).filter(([name]) => name !== 'source')) : definition });
    let record = cache.records.get(key);
    if (!record || record.source !== source || record.signature !== signature) {
      if (record) { cache.size -= record.source.length; cache.records.delete(key); }
      record = { source, signature, parsed: freezeEditorSyntax(parseSyntax(source, { ...context, key, symbols })) };
      // Bound both document count and retained text (including invalid drafts).
      while (cache.records.size && (cache.records.size >= 256 || cache.size + source.length > 1000000)) {
        const oldest = cache.records.keys().next().value;
        cache.size -= cache.records.get(oldest).source.length; cache.records.delete(oldest);
      }
      if (source.length <= 1000000) { cache.records.set(key, record); cache.size += source.length; }
    } else {
      cache.records.delete(key); cache.records.set(key, record);
    }
    // Used only by analyzeAst's private compilation, never returned as an editor
    // session/runtime AST. Semantic analysis reads immutable syntax; diagnostics
    // get their own objects so its returned errors cannot alter retained results.
    return { ast: record.parsed.ast, syntaxDiagnostics: structuredClone(record.parsed.syntaxDiagnostics) };
  }
  function parseProjectSyntax(project, reuseEditorSyntax = false) {
    const symbols = buildSymbols(project),
      items = [],
      errors = [];
    if (reuseEditorSyntax) {
      const environment = editorSyntaxEnvironment(project), cache = EDITOR_PROJECT_SYNTAX_CACHE;
      if (cache.environment !== environment) {
        cache.environment = environment; cache.records.clear(); cache.size = 0;
      }
    }
    const parseOne = (key, source, context) => {
      const parsed = reuseEditorSyntax ? editorProjectSyntax(key, source, context, symbols)
        : parseSyntax(source, { ...context, key, symbols });
      errors.push(...parsed.syntaxDiagnostics);
      if (parsed.ast) items.push(...documentSyntaxItems(parsed.ast,key,context,project,errors));
    };
    for (const record of sourceRegistry(project))
      parseOne(record.key, record.source, record.context);
    // Procedures made in a 名人 script's text: read as procedures, reported at their lines in that script.
    for (const d of meijinProjectDefinitions(project)) {
      const key = `action:${d.id}`, before = errors.length;
      if (project.actions.some(a => a.name === d.name) || symbols.actions.get(d.name)?.id !== d.id)
        errors.push({ code: 'S302', message: `手順「${d.name}」は もう あります。ちがう 名前に して ください`, line: d.headLine, column: 1, where: `script:${d.scriptId}` });
      else parseOne(key, d.source, { ownerId: 'stage', targetId: null, targetType: null, event: null, args: d.args, definition: d, definitionKind: 'action', meijin: true });
      for (const error of errors.slice(before)) if (error.where === key || !error.where) Object.assign(error, { where: `script:${d.scriptId}`, line: (error.line || 1) + d.line - 1 });
    }
    if(items.filter(item=>!item.definitionKind).length>LIMITS.scripts)errors.push({code:'F504',message:'きっかけの 本文が 多すぎます。使わない 本文を けして ください',line:0,column:1,where:'project'});
    const rules = items.flatMap(item => (item.ast.rules || []).map((rule, index) => ({
      ...rule, id: `${item.key}:rule:${index}`, targetId: item.targetId || item.ownerId,
    })));
    return { symbols, items, errors, rules, astByKey: syntaxItemMap(items,errors) };
  }
  function syntaxItemMap(items,errors) {
    const map=new Map();
    for(const item of items){
      if(map.has(item.key))errors.push({code:'F503',message:'作品の 中身が こわれて います。同じ きっかけの 本文が 2つ あります',line:0,column:1,where:item.documentKey||item.key});
      else map.set(item.key,item.ast);
    }
    return map;
  }
  function documentSyntaxItems(ast,key,context,project,errors) {
    const first={...ast};delete first.units;
    if(context.unitIds&&context.unitIds.length!==1+(ast.units?.length||0))errors.push({code:'F503',message:'作品の 中身が こわれて います。きっかけの 本文の 数が 合いません',line:0,column:1,where:key});
    return [first,...(ast.units||[])].map((unit,index)=>{
      // Imported documents may not yet have persistent unit IDs. Their runtime
      // keys use a separate namespace, never a guess in the user ID namespace.
      const id=context.unitIds?.[index]||(index?`document:${key}:unit:${index+1}`:context.id);
      const unitKey=context.unitIds||index?'script:'+id:key,heading=unit.heading;
      let resolved={...context,...(ast.units||context.unitIds?{id,scriptId:id,documentKey:key}:{})};
      if(heading){
        const ref=heading.actorRef,actor=ref?.kind==='named'?(namesStage(project,ref.name)?{id:'stage',type:'stage'}:project.components.find(c=>c.name===ref.name)):
          context.targetId==='stage'?{id:'stage',type:'stage'}:project.components.find(c=>c.id===context.targetId);
        if(!actor)errors.push({code:'S304',message:ref?.kind==='named'?(context.meijin&&targetExists({name:ref.name,qualifier:null},buildSymbols(project),{})?`見出しの 主語には、部品の 名前を 一つ 書きます（「${ref.name}」のような へんすうや リストは 書けません）。中身の 文に 主語を 書きます`:`「${ref.name}」という キャラクターや 部品が 見つかりません。名前を たしかめて ください`):'この きっかけを 使う キャラクターや 部品が 見つかりません',line:unit.sourceSpan?.startLine||1,column:1,where:key});
        else if(heading.event==='touchStart'&&actor.type==='stage')errors.push({code:'S304',message:STAGE_TOUCH_MESSAGE,line:unit.sourceSpan?.startLine||1,column:1,where:key});
        else if(!EVENT_BY_TYPE[actor.type]?.includes(heading.event)&&!(context.meijin&&meijinEventOwner(heading.event,actor.type)))errors.push({code:'S304',message:`この キャラクターや 部品では、${EVENT_LABELS[heading.event]?'「'+EVENT_LABELS[heading.event]+'」の ':'この '}きっかけは 使えません。ほかの きっかけに して ください`,line:unit.sourceSpan?.startLine||1,column:1,where:key});
        else resolved={...resolved,ownerId:actor.id,targetId:actor.id,targetType:actor.type,event:heading.event,filter:heading.filter||null};
      }
      return syntaxItem(unitKey,unit,resolved);
    });
  }
  // A 名人 form written in an ordinary body (主役をねこにする, ねこは、いちばん近い星の方を向く, 1秒ごとに、…) reads with
  // no error as a 名人 script: the check then says so (S317) instead of a reading error that asks for a name or another
  // sentence. An error that gives its own guidance or choices (「空」は…, 「〜になったら」は…) is kept.
  // 10秒のあいだ、くり返す in an ordinary body asks for a state before あいだ; it is the 名人 timed repeat.
  const GENERIC_READING_ERRORS = [/^まだ 作って ?いない 名前/, /^この 名前は ?【名前】のように ?【 】で かこんで ?ください/, /読みとれません|読めません|読めない ところ/, /が たりません/, /という 文は あかりに ありません/, /^つづける きまりの おわりを「あいだ」に/];
  // The first error of a body, when it is a reading error that gives no guidance of its own (S317 is given instead when
  // the body reads as 名人).
  const genericReadingError = first => !!first && ['P201', 'P205', 'S301'].includes(first.code) && !first.proposals?.length && GENERIC_READING_ERRORS.some(re => re.test(first.message));

  // An ordinary body: a 国語・算数 word written as a sentence form (10の倍数, 12の約数, からっぽ) on the line where the
  // reading stopped. Say how to write it, with the names as written; a 名人 body reads these words.
  const WORD_LINES = [[/^\s*(?:もし、?)?([^、。が「」\s]+?)が([0-9０-９]+)の倍数(?:なら|でなければ)/, m => `「${m[2]}の倍数」は くらべる ことばに ありません。「${m[1]}が0とちがっていて、${m[1]}÷${m[2]}のあまりが0なら」のように 書きます`], [/^\s*(?:もし、?)?([^、。が「」\s]+?)が([0-9０-９]+)の約数(?:なら|でなければ)/, m => `「${m[2]}の約数」は くらべる ことばに ありません。${m[1]}が 整数なら「${m[1]}が0より大きくて、${m[2]}÷${m[1]}のあまりが0なら」のように 書きます`], [/^\s*(?:もし、?)?([^、。が「」\s]+?)が(からっぽ|カラッポ)(?:なら|でなければ)/, m => `「${m[2]}」は くらべる ことばに ありません。リストが 空かを しらべる ときは「${m[1]}の数が0なら」のように 書きます`]];
  function wordLines(project, errors) {
    let out = errors;
    for (const script of project.scripts) {
      const key = scriptSourceKey(script), at = out.findIndex(e => e.where === key), first = out[at];
      if (isMeijinScript(script) || !first || !['P201', 'P205', 'S301', 'S317'].includes(first.code) || first.proposals?.length) continue;
      const text = String(script.source || '').split('\n')[first.line - 1] || '';
      for (const [re, say] of WORD_LINES) { const m = re.exec(text); if (m) { out = [...out.slice(0, at), { ...first, code: 'S301', message: say(m) }, ...out.slice(at + 1)]; break; } }
    }
    return out;
  }
  // 名人: a sentence that starts with 自分 where no part is its 自分 (the text belongs to no part) is told so, not
  // that the subject is missing (the child wrote one).
  function meijinSelfWord(project, errors) {
    return errors.map(e => {
      if (e.code !== 'S304') return e;
      // A text with its own headings is checked unit by unit (script:unit-1); the unit belongs to its 名人 text.
      const script = project.scripts.find(s => isMeijinScript(s) && (scriptSourceKey(s) === e.where || (s.document?.unitIds || []).some(id => 'script:' + id === e.where)));
      const text = script && String(script.source || '').split('\n')[e.line - 1]?.trim();
      const lines = String(script?.source || '').split('\n'), before = lines.slice(0, e.line - 1).reverse().find(l => l.trim() && !l.trim().startsWith('※'))?.trim() || '';
      const several = /^(?:もし|そうでなければ|次のことを)|(?:みんな|それぞれ|順番に|じゅんばんに)|^[^、。「」]+?(?:と|も)[^、。「」]+?(?:は|が)、?|(?:とき|たら|ごとに)、./.test(before);
      // ねこが星にふれたら、「a」と言う: the subject goes after a 〜たら・〜とき clause, and is that clause's part.
      const clause = text && /^(?!もし)(([^、。「」]+?)が[^、。]*?(?:たら|たとき|るとき|あいだ|ながら|れば|なら)、)(.*)$/.exec(text);
      const clausePart = clause && project.components.some(c => c.name === clause[2]) ? clause[2] : null;
      const part = clausePart || project.components.find(c => c.type !== 'stage')?.name || 'ねこ';
      const example = text && !/^自分/.test(text) ? (clause ? `れい：${clause[1]}${part}は${clause[3]}` : `れい：${part}は${text.replace(/^、/, '')}`) : null;
      // 作品を動かしたとき、自分は、: a 名人 text has no 自分; the heading names the part.
      if (text && e.message === MEIJIN_SUBJECT_MESSAGE && /、自分(?:は|が)、$/.test(before)) return { ...e, line: e.line - 1, message: `名人の 本文には「自分」に あたる 部品が ありません。見出しの「自分は、」を 部品の 名前に します。れい：${before.replace(/自分(は|が)、$/, part + 'は、')}` };
      if (text && example && (e.message === MEIJIN_TOPIC_ENDED || (e.message === MEIJIN_SUBJECT_MESSAGE && several))) return { ...e, message: MEIJIN_TOPIC_ENDED.replace('れい：ねこは前へ10歩進む', example) };
      if (text && example && e.message === MEIJIN_SUBJECT_MESSAGE) return { ...e, message: MEIJIN_SUBJECT_MESSAGE.replace('れい：ねこは前へ10歩進む', example) };
      if (text && e.message === MEIJIN_SUBJECT_MESSAGE && several)
        return { ...e, message: MEIJIN_TOPIC_ENDED };
      return text && /^自分(?:は|が|の)/.test(text) ? { ...e, message: '名人の 本文には、「自分」に あたる 部品が ありません。部品の 名前を 書きます。れい：ねこは前へ10歩進む／ねこのコピーを作る' } : e;
    });
  }
  // A message names an expression as written; the 名人 parts of it (no block has them) are written by their words.
  function messageExpression(n) {
    try { return formatExpression(n); } catch (error) { if (!(error instanceof AkariError)) throw error; }
    return formatExpression(meijinPlainExpression(n));
  }
  // The kinds only a 名人 script makes (an ordinary body never holds them).
  const MEIJIN_ONLY_KINDS = new Set(['PartRef', 'PartFamily', 'PartExcept', 'PartRandom', 'PartPick', 'PartNearest', 'PartsTouching', 'CreatedCopies',
    'PartName', 'PartState', 'Parallel', 'ParallelEach', 'MoveUntil', 'TimedRepeat', 'ActionDefinition', 'ListRemoveValue']);
  function meijinOnlyNode(ast) {
    const pending = [ast];
    while (pending.length) {
      const node = pending.pop();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) { pending.push(...node); continue; }
      if (MEIJIN_ONLY_KINDS.has(node.kind) || node.actorRef?.kind === 'value' || node.targets || (node.kind === 'StopCommand' && ['PART', 'COPIES'].includes(node.op)) ||
        (node.kind === 'SoundCommand' && node.op === 'STOP_PART') || (node.kind === 'CloneCommand' && node.op === 'DELETE_ALL')) return node;
      for (const [key, value] of Object.entries(node)) if (key !== 'sourceSpan' && value && typeof value === 'object') pending.push(value);
    }
    return null;
  }
  // An error in a procedure made in a 名人 script's text is shown at its line in that script.
  function placeMeijinDefinitionErrors(project, errors) {
    const places = new Map(meijinProjectDefinitions(project).map(d => [`action:${d.id}`, d]));
    if (places.size) for (const error of errors) {
      const d = places.get(error.where);
      if (d) Object.assign(error, { where: `script:${d.scriptId}`, line: (error.line || 1) + d.line - 1 });
    }
    return errors;
  }
  // A lane (次のことを同時に始める, なかまは、みんな…) runs on its own: このくり返しを終える, 次の回へ進む and
  // 答えとして返す cannot reach the repeat or the procedure outside it.
  function laneControlPlacement(compiled) {
    const errors = [], words = { Break: 'このくり返しを終える', Continue: 'この回の残りをとばして、次の回へ進む', ReturnStatement: '答えとして返す' };
    const inside = (nodes, where, inLane, inLoop) => {
      for (const n of nodes || []) {
        if (!n || typeof n !== 'object') continue;
        if (inLane && words[n.kind] && (n.kind === 'ReturnStatement' || !inLoop))
          errors.push({ code: 'S315', message: '「' + words[n.kind] + '」は、同時に始めた ならびの 外の くり返しや 手順には とどきません。この 文は、ならびの 外に 書きます', line: n.sourceSpan?.startLine || 0, column: n.sourceSpan?.startColumn || 1, where });
        const loop = ['RepeatCount', 'RepeatWhile', 'RepeatUntil', 'Forever', 'ForEach', 'TimedRepeat'].includes(n.kind);
        if (n.kind === 'Parallel') for (const lane of n.lanes || []) inside(lane, where, true, false);
        if (n.kind === 'ParallelEach') inside(n.body, where, true, false);
        for (const key of ['body', 'thenBody', 'elseBody']) if (n.kind !== 'ParallelEach') inside(n[key], where, inLane, inLoop || loop);
      }
    };
    for (const item of compiled.items || []) {
      const ast = compiled.astByKey?.get(item.key);
      if (ast) { inside(ast.body, item.key, false, false); for (const unit of ast.units || []) inside(unit.body, item.key, false, false); }
    }
    return errors;
  }
  // 〜が3回おされる counts from when a まで begins, so it is read only in the condition of 〜まで待つ／〜まで、くり返す.
  function eventCountPlacement(compiled) {
    const errors = [], until = ['WaitUntil', 'RepeatUntil'];
    const find = (value, found) => { if (!value || typeof value !== 'object') return; if (value.kind === 'EventCount') found.push(value); for (const v of Object.values(value)) if (v && typeof v === 'object') find(v, found); };
    for (const item of compiled.items || []) {
      const ast = compiled.astByKey?.get(item.key);
      const visit = node => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(visit); return; }
        for (const [key, value] of Object.entries(node)) {
          if (!value || typeof value !== 'object') continue;
          if (until.includes(node.kind) && key === 'condition') continue;
          if (['body', 'thenBody', 'elseBody', 'units', 'rules', 'lanes'].includes(key)) { visit(value); continue; }
          const found = []; find(value, found);
          for (const n of found) errors.push({ code: 'S314', message: '回数の 条件（〜回おされる、〜回【手順】する）は「〜まで待つ」と「〜まで、くり返す」の 中で 使います', line: n.sourceSpan?.startLine || node.sourceSpan?.startLine || 0, column: n.sourceSpan?.startColumn || node.sourceSpan?.startColumn || 1, where: item.key });
        }
      };
      if (ast) { visit(ast.body); for (const unit of ast.units || []) visit(unit.body); }
    }
    return errors;
  }
  // Notices never stop a run, a save or an export. ねこは1秒待つ。だんごは言う。: only ねこ waits, so だんご's
  // sentence runs at once; say so where the next sentence of the same flow has another subject.
  // The notice names what the next sentence does: だんごは すぐ 話します (a sentence that speaks), …すぐ 動きます (any other).
  const NOTICE_VERBS = { Say: '話します', Ask: 'たずねます', SoundCommand: '音を 鳴らします', WaitTime: '待ちはじめます', WaitUntil: '待ちはじめます', BroadcastAndWait: '待ちはじめます' };
  // B-17: 画面の左下のはしから、右へ320歩のばしょへ行く goes to たて0 (the bottom edge). The notice says so and gives the two
  // fixes: keep the place (上へ（たてのばしょ）歩) or write the 0 (上へ0歩). 画面の左下のはしへ行く means 0 on purpose.
  // The fixes are offered wherever the sentence's own text is known: on its own line, after another sentence of the line,
  // as an inline body, and for a 名人 group subject (ねこといぬは…: one notice, whose fixes keep the subjects). Inside a
  // 「〜して、」 chain the sentence was read as rewritten text, so the notice comes without them. A fix is offered only
  // when the whole text still reads with it.
  function fixedPlaceNotes(project, item, ast) {
    const notes = [], script = project.scripts.find(s => scriptSourceKey(s) === item.key), source = typeof script?.source === 'string' ? script.source : null;
    const oneLeg = node => { const w = node?.kind === 'MotionCommand' && node.op === 'GOTO' ? MOVE_WRITTEN_LEGS.get(node) : null; return w && !w.originOnly && w.x !== w.y ? w : null; };
    let context, symbols;
    const reads = text => {
      if (context === undefined) { context = sourceRegistry(project).find(r => r.key === item.key)?.context || null; symbols = buildSymbols(project); }
      return !!context && !!parseSyntax(text, { ...context, key: item.key, symbols }).ast;
    };
    const visit = node => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(visit); return; }
      const group = node.kind === 'Parallel' ? MEIJIN_GROUP_SUBJECTS.get(node) : undefined;
      const lanes = group !== undefined && node.lanes?.length && node.lanes.every(l => l.length === 1 && oneLeg(l[0])) ? node.lanes.map(l => l[0]) : null;
      const goto = lanes ? lanes[0] : node, written = oneLeg(goto);
      if (written) {
        const missing = written.x ? 'y' : 'x', across = missing === 'x';
        // FM2-13: what happens in plain words, いま written in kana (F-20).
        const message = across
          ? 'よこの 歩数を 書いて いないので、よこは 0歩（画面の 左の はし）に なります。よこを いまの ままに する ときは「右へ（よこのばしょ）歩」と 書きます'
          : 'たての 歩数を 書いて いないので、たては 0歩（画面の 下の はし）に なります。たてを いまの ままに する ときは「上へ（たてのばしょ）歩」と 書きます';
        const location = SOURCE_RANGES.get(node), proposals = [];
        let range = location && !location.rewritten ? location.range : null, chained = false;
        // Inside a 「〜して、」 chain (…のばしょへ行って、) the sentence was read as 行く: the fix is made for the clause as
        // written and keeps the て-form, also with the time after the place (…のばしょへ1秒かけて行って、, R2-B-09).
        if (!range && location?.rewritten && location.extent && source && !lanes) {
          const clause = /^[^。\n]*?の(?:ばしょ|場所)(?:へ|に)(?:、?[^、。\n]*?秒(?:間)?(?:かけて|で))?(?:行って|いって|行き|いき)(?=、)/.exec(source.slice(location.extent.start));
          if (clause) { range = { start: location.extent.start, end: location.extent.start + clause[0].length }; chained = true; }
        }
        if (range && source) {
          const original = source.slice(range.start, range.end), write = (leg, subject) => {
            const fixed = { ...goto, inlineComment: '', [missing]: exprNode('QuantityLiteral', { unit: '歩', value: leg }) };
            try { return formatScript({ kind: 'Script', body: [fixed] }, subject ? {} : { inheritedActor: goto.actorRef }).trim().replace(/。$/, ''); }
            catch (error) { if (error instanceof AkariError) return null; throw error; }
          };
          for (const [label, leg] of [[across ? '「右へ（よこのばしょ）歩」を 書く' : '「上へ（たてのばしょ）歩」を 書く', exprNode('SensorRead', { sensor: across ? '横位置' : '縦位置' })],
            [across ? '「右へ0歩」を 書く' : '「上へ0歩」を 書く', exprNode('NumberLiteral', { value: 0 })]]) {
            let text = lanes ? null : write(leg, STATEMENT_EXPLICIT_ACTORS.has(goto));
            if (text && chained) text = text.replace(/行く$/, '行って');
            if (lanes) {
              const bare = write(leg, false), named = write(leg, true);
              if (bare && named?.endsWith(bare)) text = group.replace(/、$/, '') + (named.slice(0, -bare.length).endsWith('、') ? '、' : '') + bare;
            }
            if (text && reads(source.slice(0, range.start) + text + source.slice(range.end))) proposals.push({ label, source: text, start: range.start, end: range.end, original });
          }
        }
        notes.push({ code: 'I120', notice: true, line: node.sourceSpan?.startLine || 0, column: node.sourceSpan?.startColumn || 1, where: item.key, message,
          ...(proposals.length ? { proposals } : {}) });
        if (lanes) return;
      }
      for (const [k, v] of Object.entries(node)) if (k !== 'sourceSpan' && v && typeof v === 'object') visit(v);
    };
    visit(ast.body); for (const unit of ast.units || []) visit(unit.body);
    return notes;
  }
  // Programs that run but do something other than they say, a child's usual first try (C-17, final call 11). Each notice
  // says what happens and names the sentence to write; none of them stops the work or changes what it means.
  const NOTICE_WAITS = new Set(['WaitTime', 'WaitUntil', 'BroadcastAndWait', 'WaitBroadcastGroup', 'Ask', 'MoveUntil']);
  const NOTICE_LOOPS = new Set(['RepeatCount', 'RepeatWhile', 'RepeatUntil', 'Forever', 'ForEach', 'TimedRepeat']);
  const NOTICE_CHANGES = new Set(['Assignment', 'NumericUpdate', 'ListAppend', 'ListInsert', 'ListReplace', 'ListDelete', 'ListClear', 'ListRemoveValue']);
  function silentWrongNotes(project, item, ast) {
    const notes = [], note = (code, node, message) => notes.push({ code, notice: true, line: node?.sourceSpan?.startLine || item.ast?.sourceSpan?.startLine || 0,
      column: node?.sourceSpan?.startColumn || 1, where: item.key, message });
    const text = n => messageExpression(n);
    const numeric = n => ['NumberLiteral', 'QuantityLiteral'].includes(n?.kind) || (n?.kind === 'UnaryExpression' && ['NEG', 'POS'].includes(n.op) && n.value?.kind === 'NumberLiteral');
    // Every expression of a statement (its own, not those of the statements inside it), with whether it is negated.
    const expressions = (node, visit) => {
      const walk = (e, negated) => {
        if (!e || typeof e !== 'object') return;
        if (Array.isArray(e)) { e.forEach(x => walk(x, negated)); return; }
        if (typeof e.kind !== 'string') return;
        visit(e, negated);
        for (const [key, value] of Object.entries(e)) if (key !== 'sourceSpan' && value && typeof value === 'object') walk(value, negated !== (e.kind === 'UnaryExpression' && e.op === 'NOT' && key === 'value'));
      };
      for (const [key, value] of Object.entries(node)) if (!['body', 'thenBody', 'elseBody', 'lanes', 'sourceSpan', 'actorRef', 'laneRef'].includes(key) && value && typeof value === 'object') walk(value, false);
    };
    const statements = function* (nodes) { for (const n of nodes || []) { if (!n || typeof n !== 'object') continue; yield n; for (const key of ['body', 'thenBody', 'elseBody']) yield* statements(n[key]); for (const lane of n.lanes || []) yield* statements(lane); } };
    // The touch of a condition, with who touches when it is written (名人: ねこが「石」にふれていれば).
    const touchOf = condition => { let found = null; expressions({ condition }, (e, negated) => {
      if (found || negated) return;
      if (e.kind === 'ActorQualifiedRead' && e.actorRef?.kind === 'named' && e.value?.kind === 'SensorRead' && e.value.sensor === 'TOUCHING') found = { ...e.value, toucher: e.actorRef.name };
      else if (e.kind === 'SensorRead' && e.sensor === 'TOUCHING') found = e; }); return found; };
    // The touch may end with かくす・動く・回る・向きを変える・待つ・時間を書いた話す文・コピーを消す・止める (LANGUAGE.md): a turn
    // turns the part's box and outline too.
    const ends = nodes => [...statements(nodes)].some(m => NOTICE_WAITS.has(m.kind) || m.kind === 'MotionCommand' || m.kind === 'StopCommand' ||
      (m.kind === 'LooksCommand' && m.op === 'HIDE') || (m.kind === 'CloneCommand' && ['DELETE_SELF', 'DELETE_ALL'].includes(m.op)) || (m.kind === 'Say' && m.seconds));
    const keyOf = condition => condition?.kind === 'SensorRead' && condition.sensor === 'KEY_DOWN' && condition.arg?.kind === 'StringLiteral' ? condition.arg.value : null;
    const visitList = (nodes, inLoop) => {
      let heldKey = null, before = 0;
      for (const n of nodes || []) {
        if (!n || typeof n !== 'object' || n.kind === 'CommentLine') continue;
        // 「これを6回くり返す」 after more than one sentence: only the one before it is repeated.
        if (REPEAT_PREVIOUS.has(n) && before > 0)
          note('I122', { sourceSpan: { startLine: n.sourceSpan?.endLine, startColumn: 1 } }, `「これを${text(n.count)}くり返す」で くり返すのは、すぐ 前の 一文だけです。前の 文も くり返す ときは、「${text(n.count)}くり返す。」と 書いて、くり返す 文を その 下に 右へ ずらして 書きます`);
        before++;
        // 「空白」キーがおされるまで待つ twice: the second wait ends at once on the key still held (0 seconds).
        if (n.kind === 'WaitUntil') {
          const key = keyOf(n.condition);
          // The key is named as 整える writes it (「スペース」 for the 空白 key).
          const shown = key !== null && heldKey === key ? formatExpression({ kind: 'StringLiteral', value: keySurface(key) }) : null;
          if (shown)
            note('I125', n, `キーを おした ままだと、二つめの「おされるまで待つ」も すぐ 終わります（はかった 時間は 0秒です）。あいだに「${shown}キーがおされなくなるまで待つ。」を 書きます`);
          // A wait for the key to be let go (or for anything else) ends the held press.
          heldKey = key;
        } else if (NOTICE_WAITS.has(n.kind) || NOTICE_LOOPS.has(n.kind) || n.kind === 'IfStatement' || (n.kind === 'Say' && n.seconds)) heldKey = null;
        // A loop whose one wait is 「スペース」キーがおされるまで待つ: held down, the next round's wait ends at once too, so
        // it counts on every round (C-touch-R2-10). Said only when nothing else in the round could wait in between.
        if (NOTICE_LOOPS.has(n.kind) && Array.isArray(n.body)) {
          const steps = n.body.filter(m => m && m.kind !== 'CommentLine'), waits = steps.filter(m => m.kind === 'WaitUntil' && keyOf(m.condition) !== null);
          const others = steps.filter(m => !waits.includes(m) && (NOTICE_WAITS.has(m.kind) || NOTICE_LOOPS.has(m.kind) || m.kind === 'IfStatement' || (m.kind === 'Say' && m.seconds)));
          if (waits.length === 1 && !others.length) {
            const shown = formatExpression({ kind: 'StringLiteral', value: keySurface(keyOf(waits[0].condition)) });
            note('I125', waits[0], `キーを おした ままだと、くり返しの 次の 回の「おされるまで待つ」も すぐ 終わります（おしている あいだ、回ごとに すすみます）。1回 おす ごとに 1回 する ときは、この 文の あとに「${shown}キーがおされなくなるまで待つ。」を 書きます`);
          }
        }
        // もし「石」にふれていれば、点数を1増やす in a loop: it counts on every turn while they touch.
        if (inLoop && n.kind === 'IfStatement') {
          const touch = touchOf(n.condition), changes = [...statements(n.thenBody)].some(m => NOTICE_CHANGES.has(m.kind));
          if (touch && changes && !ends(n.thenBody)) {
            // The heading named is one the check reads (C-touch-R2-03): 名人 writes who touches; the mouse has no
            // ふれたとき heading, so the count waits for the mouse to leave; a partner known only when running is
            // described without a made-up name.
            const target = touch.arg?.kind === 'StringLiteral' ? touch.arg.value : touch.arg?.kind === 'PartRef' ? touch.arg.name : null;
            const who = item.meijin ? (touch.toucher || null) : null;
            const tail = target === 'マウス' ? 'なら、かえる 文の あとに「「マウス」にふれなくなるまで待つ。」を 書きます'
              : target === null ? 'なら、「もし」の かわりに「〜にふれたとき、」の 見出しで 書きます'
              : item.meijin && !who ? null
              : `なら「${who ? who + 'が' : ''}${touchShown(target)}にふれたとき、」を 使います`;
            if (tail) note('I121', n, `ふれて いる あいだ、くり返す たびに 点数などが かわります。ふれる たびに 1回だけ かえる${tail}`);
          }
        }
        // 答え compared with a number: 答え is the text that was typed, never a number.
        expressions(n, e => {
          if (e.kind !== 'CompareExpression') return;
          const [answer, other] = e.left?.kind === 'SensorRead' && e.left.sensor === '答え' ? [e.left, e.right] : e.right?.kind === 'SensorRead' && e.right.sensor === '答え' ? [e.right, e.left] : [];
          const part=other?.kind==='PartRef'?other.name:other?.kind==='VariableRead'&&project.components.some(c=>c.name===other.name)?other.name:null;
          if(answer&&part){note('I123',n,'答えは 文字なので、部品とは 同じに なりません。部品の 名前と くらべる ときは「'+part+'」と「 」で かこみます');return;}
          if (!answer || !numeric(other)) return;
          // Equal or not: the number is written as text (「7」). Larger or smaller: 数（答え） makes the answer a number.
          const same = ['EQ', 'NEQ'].includes(e.op), value = staticNumericMagnitude(other);
          let example = null;
          // The example keeps the form written (C-touch-R2-10): 答えが「7」になるまで待つ, not the もし of another sentence.
          const written = n.kind === 'WaitUntil' && n.condition === e ? ['until', s => s + '待つ'] : n.kind === 'RepeatUntil' && n.condition === e ? ['until', s => s + '、くり返す']
            : n.kind === 'RepeatWhile' && n.condition === e ? ['while', s => s + '、くり返す'] : ['if', s => 'もし' + s + '、'];
          try { example = written[1](formatCondition({ ...e, [e.left === answer ? 'right' : 'left']: same && value !== undefined ? exprNode('StringLiteral', { value: decimalSource(value) }) : other, [e.left === answer ? 'left' : 'right']: same ? answer : exprNode('BuiltinCall', { name: '数', args: [answer] }) }, written[0])); }
          catch (error) { if (!(error instanceof AkariError)) throw error; }
          note('I123', n, same ? `答えは 文字です。数の 答えと くらべる ときは「${example || 'もし答えが「7」なら、'}」のように「 」で かこみます`
            : `答えは 文字なので、大きさを くらべられません（動かすと 止まります）。数として くらべる ときは「${example || 'もし数（答え）が7より大きければ、'}」のように「数（答え）」と 書きます`);
        });
        // タイマーが30になるまで待つ: the timer goes up a little at a time and is hardly ever exactly 30.
        expressions(n, e => {
          if (e.kind !== 'CompareExpression' || e.op !== 'EQ') return;
          const [, other] = e.left?.kind === 'SensorRead' && e.left.sensor === 'タイマー' ? [e.left, e.right] : e.right?.kind === 'SensorRead' && e.right.sensor === 'タイマー' ? [e.right, e.left] : [];
          if (!numeric(other)) return;
          const value = text(other), example = n.kind === 'WaitUntil' ? `タイマーが${value}より大きくなるまで待つ` : n.kind === 'RepeatUntil' ? `タイマーが${value}より大きくなるまで、くり返す`
            : n.kind === 'RepeatWhile' ? `タイマーが${value}より小さいあいだ、くり返す` : null;
          // もしタイマーが5なら: 「より大きければ」 would do it on every turn after 5 seconds; once is a wait (C-touch-R2-10).
          note('I124', n, `タイマーは 少しずつ とびとびに すすむので、ちょうど ${value}に ならない ことが あります${['WaitUntil', 'RepeatUntil'].includes(n.kind) ? '（待つのが 終わらない ことが あります）' : ''}。`
            + (example ? `「${example}」と 書きます` : (inLoop ? `${value}秒 たってから くり返す ときは、「タイマーが${value}より大きくなるまで待つ。」を くり返しの 前に 書きます` : `${value}秒 たってから 1回 する ときは、「タイマーが${value}より大きくなるまで待つ。」の 次の 行に 書きます`)));
        });
        // マウスがおされているあいだ in an おされたとき body: that body starts when the button is let go.
        // The words quoted are those written (もしマウスがおされていれば), and in 名人 the part pressed is who touches the mouse
        // (C-touch-R2-09). A wait for the next press (〜おされるまで) is no mistake there.
        if (item.event === 'click' && !['WaitUntil', 'RepeatUntil'].includes(n.kind)) expressions(n, (e, negated) => {
          if (!negated && e.kind === 'SensorRead' && e.sensor === 'マウスが押されている') {
            const written = n.kind === 'IfStatement' ? 'もしマウスがおされていれば' : 'マウスがおされているあいだ';
            const pressed = item.meijin && ast.heading?.actorRef?.kind === 'named' ? ast.heading.actorRef.name : null;
            note('I126', n, `「おされたとき」は マウスを はなしてから 始まるので、「${written}」は もう あてはまりません。おして いる あいだ 動かす ときは、「作品を動かしたとき、」の 中で「ずっとくり返す。」と「もしマウスがおされていて、${pressed ? pressed + 'が' : ''}「マウス」にふれていれば、」を 使います`);
          }
        });
        // 「こんにちは」と言う。「さようなら」と言う。: an untimed 言う goes on at once, so the next speech comes before the
        // first is seen (F-35). 作品を全部止める keeps the last picture, ふきだし and all (F-30): the speech is seen there, so
        // it is not told of (P12).
        if (n.kind === 'Say' && n.seconds === undefined) {
          const next = (nodes || []).slice(nodes.indexOf(n) + 1).find(m => m && m.kind !== 'CommentLine');
          if (next && next.kind === 'Say') {
            const said = n.value?.kind === 'StringLiteral' ? text(n.value) : '「…」';
            note('I130', n, `時間を 書かない「言う」は、すぐ 次の 文へ 進みます。ことばを じゅんばんに 見せる ときは「${said}と2秒話す」と 書きます`);
          }
        }
        // 「ド」を鳴らす in a work with a sound ド and data named ド (final call 29): the sentence plays the sound; the data is
        // never used there (I132). With no sound ド the check stops instead (S301), so I131 is gone. Every name written as
        // a sound's name is told of, not only ドレミ (LANGUAGE.md 音と待機): 「ベル」を鳴らす with a variable ベル plays the
        // sound ベル. A bare data name (曲を鳴らす) is read as that data, so it is not a sound's name and gets no notice.
        if (n.kind === 'SoundCommand' && ['SAMPLE', 'SAMPLE_WAIT'].includes(n.op)) {
          const arg = n.args?.[0], name = arg?.kind === 'StringLiteral' ? arg.value : null;
          const owner = project.components.find(c => c.id === item.targetId)?.localData;
          const data = name === null ? null
            : [project.projectData, owner].filter(Boolean).some(d => d.variables.some(v => v.name === name)) ? 'variable'
            : [project.projectData, owner].filter(Boolean).some(d => d.lists.some(l => l.name === name)) ? 'list' : null;
          if (data && project.sounds.some(s => s.name === name))
            // The words are LANGUAGE.md's; a list gets no second sentence.
            note('I132', n, `「${name}」は 音の 名前です。` + (data === 'variable' ? `へんすう「${name}」の 中身は 使いません。へんすうの 数の 高さで 鳴らす ときは「【${name}】Hzの音を0.5秒鳴らす」と 書きます` : `リスト「${name}」の 中身は 使いません`));
        }
        // 名人: ねこと犬と鳥は、順番に、… starts them together; 候補から【一覧】を全部消す looks for the list itself.
        const listed = MEIJIN_LISTED_IN_ORDER.get(n);
        // The words quoted are the child's, with their spaces (FM2-14): ねこと だんごは、順番に.
        const writtenLine = listed ? String(project.scripts.find(s => scriptSourceKey(s) === item.key)?.source || '').split('\n')[(n.sourceSpan?.startLine || 1) - 1] || '' : '';
        const writtenOrder = listed && /^\s*(.+?順番に)、?/.exec(writtenLine)?.[1];
        if (listed) note('I127', n, `「${writtenOrder ? writtenOrder + '、' : listed.join('と') + 'は、順番に、'}」のように 主語を ならべた 文は、みんな いっしょに 始めます。一人ずつ じゅんばんに する ときは、「なかまを、${listed.join('と')}にする。」と リストに 入れて、「なかまは、順番に、…」と 書きます`);
        if (n.kind === 'ListRemoveValue' && n.value?.kind === 'VariableRead' && dataNameExists(project, n.value.name, 'lists'))
          note('I128', n, `「${n.target.name}から【${n.value.name}】を全部消す」は、リストの 中に リスト【${n.value.name}】を さがすので、何も 消えません。リストの 中身を 一つずつ 消す ときは、「【${n.value.name}】の中身を先頭から一つずつ見て、次のことを行う。」の 中に「${n.target.name}から今見ているものを全部消す。」と 書きます`);
        for (const key of ['body', 'thenBody', 'elseBody']) if (Array.isArray(n[key])) visitList(n[key], inLoop || NOTICE_LOOPS.has(n.kind));
        for (const lane of n.lanes || []) visitList(lane, inLoop);
      }
    };
    visitList(ast.body, false);
    // 名人: 「つぎの日の朝」になったとき、 has no condition in it (it stops at once when the work is run).
    const heading = ast.heading;
    if (heading?.event === 'conditionTrue' && ['StringLiteral', 'NumberLiteral', 'QuantityLiteral', 'ListLiteral'].includes(heading.condition?.kind))
      note('I129', { sourceSpan: { startLine: ast.sourceSpan?.startLine || 1, startColumn: 1 } }, `「${text(heading.condition)}になったとき、」には、何が そう なるかが ありません（動かすと すぐ 止まります）。何が そう なるかを 書きます。れい：「場面が${text(heading.condition)}になったとき、」`);
    return notes;
  }
  const dataNameExists = (project, name, kind) => [project.projectData, ...project.components.map(c => c.localData)].some(d => d[kind].some(x => x.name === name));
  // Flows that never show or never reach what they say (P13: E2E-R1-04, E2E-R1-07). Each is a notice only.
  // I133: a part that hid itself earlier in this flow speaks, and no other flow shows it again.
  // I134: a wait for a part to touch something, when the sentences that move the part come after the wait in the same
  //   flow and no other flow moves the part or what it touches (the mouse moves by itself).
  // I135: the sentence after a ずっとくり返す that no このくり返しを終える ends.
  const FLOW_LOOPS = new Set(['RepeatCount', 'RepeatWhile', 'RepeatUntil', 'Forever', 'ForEach', 'TimedRepeat']);
  const flowStatements = function* (nodes) { for (const n of nodes || []) { if (!n || typeof n !== 'object') continue; yield n; for (const k of ['body', 'thenBody', 'elseBody']) yield* flowStatements(n[k]); for (const l of n.lanes || []) yield* flowStatements(l); } };
  // A このくり返しを終える that ends this loop (not one inside a loop in it).
  const endsLoop = nodes => (nodes || []).some(n => n && (n.kind === 'Break' || (!FLOW_LOOPS.has(n.kind) && (['body', 'thenBody', 'elseBody'].some(k => endsLoop(n[k])) || (n.lanes || []).some(l => endsLoop(l))))));
  function flowNotes(project, compiled, item, ast) {
    const notes = [], note = (code, node, message) => notes.push({ code, notice: true, line: node?.sourceSpan?.startLine || 0, column: node?.sourceSpan?.startColumn || 1, where: item.key, message });
    const ownerOf = it => it.targetId === 'stage' ? project.stage.name : project.components.find(c => c.id === it.targetId)?.name || null;
    const owner = item.meijin ? null : ownerOf(item);
    // 自分 is the body's part; a 名人 heading that names a part (かごは、) makes it that part.
    const who = (ref, it = item) => ref?.kind === 'named' ? ref.name : (!ref || ref.kind === 'self') && it.targetId !== 'stage' ? project.components.find(c => c.id === it.targetId)?.name || null : (!ref || ref.kind === 'self') && !it.meijin ? ownerOf(it) : null;
    const script = project.scripts.find(s => scriptSourceKey(s) === item.key), lines = String(script?.source || '').split('\n');
    const written = (n, name) => (lines[(n.sourceSpan?.startLine || 1) - 1] || '').includes(name);
    const definitions=new Map((compiled.items||[]).filter(it=>it.definitionKind==='action').map(it=>[it.definition.name,it]));
    const effects=function*(nodes,it,caller=null,seen=new Set()){
      for(const n of flowStatements(nodes)){
        const actor=(!n.actorRef||n.actorRef.kind==='self')&&caller!==null?caller:who(n.actorRef,it);
        yield {node:n,actor};
        if(n.kind==='UserActionCall'&&!seen.has(n.name)){
          const def=definitions.get(n.name);if(def)yield* effects(def.ast?.body,def,actor,new Set([...seen,n.name]));
        }
      }
    };
    // Which flows move or show a part: [item key, flow, part].
    const movers = [], showers = [];
    for (const other of compiled.items || []) { if(other.definitionKind)continue;const a = compiled.astByKey?.get(other.key); if (!a) continue;
      for (const [flow, nodes] of [['body', a.body], ...(a.units || []).map((u, i) => ['unit' + i, u.body]), ['rules', a.rules]])
        for (const {node:m,actor} of effects(nodes,other)) { if (m.kind === 'MotionCommand' || m.kind === 'ContinuousRule') movers.push([other.key, flow, actor]);
          if (m.kind === 'LooksCommand' && m.op === 'SHOW') showers.push([other.key, flow, actor]); } }
    for (const [flow, nodes] of [['body', ast.body], ...(ast.units || []).map((u, i) => ['unit' + i, u.body])]) {
      const visit = (list, hidden) => {
        (list || []).forEach((n, i) => {
          if (!n || typeof n !== 'object' || n.kind === 'CommentLine') return;
          const actor = who(n.actorRef);
          if (n.kind === 'Say' && actor && hidden.has(actor) && !showers.some(([k, f, w]) => (w === null || w === actor) && !(k === item.key && f === flow))) {
            // A subject carried over from the sentence before, when the body's owner is someone else: say who speaks and
            // how the owner speaks instead.
            const headingOwner=item.meijin&&ast.heading?.actorRef?.kind==='named'?ast.heading.actorRef.name:owner;
            const inherited = actor !== headingOwner && !written(n, actor);
            let example = null;
            if (inherited && owner && item.targetId !== 'stage') { try { example = formatScript({ kind: 'Script', body: [{ ...n, actorRef: { kind: 'named', name: owner }, inlineComment: '' }] }, {}).trim(); } catch (error) { if (!(error instanceof AkariError)) throw error; } }
            note('I133', n, (inherited ? `この 文は、前の 文の「${actor}は」を ひきついで、${actor}が 話します。` : '') + `${actor}は すがたを かくして いるので、ことばは 見えません。`
              + (example ? `${owner}が 話す ときは「${example}」と 書きます` : `話す 前に「${actor}はすがたを見せる。」を 書きます`));
          }
          if (n.kind === 'LooksCommand' && n.op === 'HIDE' && actor) hidden.add(actor);
          if (n.kind === 'LooksCommand' && n.op === 'SHOW' && actor) hidden.delete(actor);
          if (n.kind === 'WaitUntil') {
            let toucher = null, target = null;
            // A nested touch read need not be the wait condition (NOT/OR may already make it true).
            const e = n.condition;
            if (e?.kind === 'ActorQualifiedRead' && e.value?.kind === 'SensorRead' && e.value.sensor === 'TOUCHING') { toucher = e.actorRef?.name || null; target = e.value.arg; }
            else if (e?.kind === 'SensorRead' && e.sensor === 'TOUCHING' && owner) { toucher = owner; target = e.arg; }
            const targetName = target?.kind === 'StringLiteral' ? target.value : target?.kind === 'PartRef' ? target.name : null;
            const movesTarget = targetName === 'マウス' || (targetName && movers.some(([, , w]) => (w===null||w === targetName)));
            const movedLater = toucher && [...effects(list.slice(i + 1),item)].some(({node:m,actor}) => (m.kind === 'MotionCommand' || m.kind === 'ContinuousRule') && (actor===null||actor===toucher));
            const elsewhere = movers.some(([k, f, w]) => (w === null || w === toucher) && !(k === item.key && f === flow));
            if (targetName && toucher && movedLater && !elsewhere && !movesTarget) {
              const shown = targetName ? touchShown(targetName) : '「…」';
              const heading=sentenceHeadingSource({event:'touchStart',actorRef:item.meijin||toucher!==owner?{kind:'named',name:toucher}:{kind:'self'},filter:{target:targetName}});
              note('I134', n, `${toucher}が ${shown}に ふれるまで、ここで 待ちます。${toucher}を 動かす 文は この あとに あります。まだ ふれて いない ときは、この あとの 動く 文には 進みません。`
                + (item.meijin ? `ふれる たびに する ときは「${heading}」と 書いて、する ことを 次の 行に 右へ ずらして 書きます` : `ふれる たびに する ときは「${heading}」の 本文に 書きます`));
            }
          }
          if (n.kind === 'Forever' && !endsLoop(n.body)) {
            const next = list.slice(i + 1).find(m => m && m.kind !== 'CommentLine');
            if (next) note('I135', next, '「ずっとくり返す。」は 終わらないので、この 文は 行いません。'
              + (item.meijin ? 'くり返しと 同時に する ときは、「次のことを同時に始める。」の 中に 書くか、「〜とき、」の 見出しで 書きます' : 'くり返しと 同時に する ときは、「同じ きっかけの 本文を ふやす」で 本文を ふやして、そこに 書きます'));
          }
          for (const k of ['body', 'thenBody', 'elseBody']) if (Array.isArray(n[k])) visit(n[k], new Set(hidden));
          for (const l of n.lanes || []) visit(l, new Set(hidden));
          // A branch, loop or call may show the part. Hidden is a certainty; remove that certainty after any possible show.
          if(n.kind==='UserActionCall'||['body','thenBody','elseBody'].some(k=>Array.isArray(n[k]))||n.lanes?.length)
            for(const {node:m,actor:shown} of effects([n],item))if(m.kind==='LooksCommand'&&m.op==='SHOW'){if(shown===null)hidden.clear();else hidden.delete(shown);}
        });
      };
      visit(nodes, new Set());
    }
    return notes;
  }
  function collectSignalNames(compiled) {
    const sent=[],received=[],senders=[],receivers=[];let unfilteredReceivers=0,dynamicSenders=0;
    const append=(list,name)=>{if(!list.includes(name))list.push(name);};
    for(const item of compiled.items||[]){
      const ast=compiled.astByKey?.get(item.key)||item.ast;if(!ast)continue;
      if(item.event==='message'){
        const name=item.filter?.message;
        receivers.push({name:name??null,item,ast});
        if(name==null)unfilteredReceivers++;
        else if(!String(name).startsWith('拡張:')||EXTENSION_HOST.describe(String(name).slice(3),'events'))append(received,name);
      }
      const visit=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(visit);return;}
        if(['Broadcast','BroadcastAndWait'].includes(node.kind)){
          if(node.message?.kind==='StringLiteral'){const name=node.message.value;senders.push({name,node,item});if(!String(name).startsWith('拡張:'))append(sent,name);}
          else dynamicSenders++;
        }
        for(const [key,value]of Object.entries(node))if(key!=='sourceSpan'&&value&&typeof value==='object')visit(value);
      };visit(ast);
    }return {sent,received,unfilteredReceivers,dynamicSenders,senders,receivers};
  }
  function signalNotes(project,compiled) {
    if(compiled.errors?.length)return [];
    const names=collectSignalNames(compiled),notes=[],symbols=compiled.symbols||buildSymbols(project),unreceived=names.sent.filter(n=>!names.received.includes(n)),unsent=names.received.filter(n=>!names.sent.includes(n));
    const note=(code,item,node,message)=>({code,notice:true,line:node?.sourceSpan?.startLine||item.ast?.sourceSpan?.startLine||1,column:node?.sourceSpan?.startColumn||1,where:item.key,message});
    const proposal=(n,item,node,text,label,name)=>{
      const location=SOURCE_RANGES.get(node),range=location&&!location.rewritten?location.range:SOURCE_RANGES.get(node.message)?.range,script=scriptBySourceKey(project,item.documentKey||item.key);if(!range||!script)return;
      const original=script.source,source=location?.rewritten?formatExpression({kind:'StringLiteral',value:name}):text.endsWith('。')&&original[range.end]==='。'?text.slice(0,-1):text;
      try{if(parseSyntax(original.slice(0,range.start)+source+original.slice(range.end),{symbols,targetId:item.targetId,event:item.event,meijin:item.meijin}).ast)n.proposals=[{label,source,start:range.start,end:range.end,original}];}catch{}
    };
    const receiverHeading=receiver=>{
      const script=scriptBySourceKey(project,receiver.item.documentKey||receiver.item.key);if(!script)return;
      const original=script.source,ctx={symbols,targetId:receiver.item.targetId,event:receiver.item.event,meijin:receiver.item.meijin},span=receiver.ast.sourceSpan,extent=SOURCE_RANGES.get(receiver.ast)?.range||{start:original.split('\n').slice(0,(span?.startLine||1)-1).reduce((n,s)=>n+s.length+1,0)+(span?.startColumn||1)-1,end:original.length};
      for(const line of normalizeSource(original).lines){
        if(line.lineNo<(receiver.ast.sourceSpan?.startLine||1)||line.lineNo>(receiver.ast.sourceSpan?.endLine||Infinity))continue;
        const begin=line.mapped.positions.findIndex(p=>p>=extent.start&&p<extent.end),end=line.mapped.positions.findIndex(p=>p>=extent.end);if(begin<0)continue;const code=line.mapped.text.slice(begin,end<0?undefined:end);
        let found;try{found=readSentenceHeading(code,symbols,null,ctx);}catch{continue;}
        if(found?.heading?.event!=='message'||found.heading.filter?.message!==receiver.name)continue;
        const actor=found.heading.actorRef;if(actor?.kind==='named'&&(namesStage(project,actor.name)?'stage':project.components.find(c=>c.name===actor.name)?.id)!==receiver.item.targetId)continue;
        const token='「'+receiver.name+'」',at=code.indexOf(token);if(at<0||at>found.body.start)continue;
        return{line:line.lineNo,range:sourceRange(line.mapped.positions,begin+at,begin+at+token.length),original,ctx};
      }
    };
    const headingProposal=(n,location,name)=>{const {range,original,ctx}=location,source=formatExpression({kind:'StringLiteral',value:name});try{if(range&&parseSyntax(original.slice(0,range.start)+source+original.slice(range.end),ctx).ast)n.proposals=[{label:'「'+name+'」の 合図に かえる',source,start:range.start,end:range.end,original}];}catch{}};
    for(const s of names.senders){if(s.name.startsWith('拡張:')||names.unfilteredReceivers)continue;
      if(s.node.targets){const targets=Array.isArray(s.node.targets)?s.node.targets:[s.node.targets];
        for(const target of targets)if(target.kind==='PartRef'&&!names.receivers.some(r=>r.item.targetId===project.components.find(c=>c.name===target.name)?.id&&(r.name===s.name||r.name==null)))notes.push(note('I138',s.item,s.node,`${target.name}には、「${s.name}」の 合図を 受ける 本文が ありません。${target.name}の 本文の はじめに「${target.name}が「${s.name}」の合図を受けたとき、」と 書きます`));
      }else if(!names.received.includes(s.name)){
        const n=note('I136',s.item,s.node,`「${s.name}」の 合図を 受ける 本文が、この 作品に ありません。受ける 部品の 本文の はじめに「「${s.name}」という合図を受けたとき、」と 書きます`);
        if(unsent.length===1)proposal(n,s.item,s.node,formatScript({kind:'Script',body:[{...s.node,message:{kind:'StringLiteral',value:unsent[0]}}]}),`「${unsent[0]}」の 合図に かえる`,unsent[0]);notes.push(n);
      }
    }
    if(!names.dynamicSenders)for(const r of names.receivers){if(r.name==null||r.name.startsWith('拡張:')||names.sent.includes(r.name))continue;
      const heading=r.ast.heading,n=note('I137',r.item,heading||r.ast,`「${r.name}」の 合図を 送る 文が、この 作品に ありません。送る 部品の 本文に「「${r.name}」の合図を送る。」と 書きます`);
      const location=heading?receiverHeading(r):null;if(location)n.line=location.line;if(location&&unreceived.length===1)headingProposal(n,location,unreceived[0]);notes.push(n);
    }return notes;
  }
  function projectNotes(project, compiled) {
    const notes = [], seen = new Set();
    const controls = ['IfStatement', 'RepeatCount', 'RepeatWhile', 'RepeatUntil', 'Forever', 'ForEach'];
    for (const item of compiled.items || []) {
      const ast = compiled.astByKey?.get(item.key);
      if (!ast) continue;
      const self = item.targetId === 'stage' ? project.stage.name : project.components.find(c => c.id === item.targetId)?.name || '自分';
      const who = ref => ref?.kind === 'named' ? ref.name : ref?.kind === 'self' ? self : null;
      const walk = nodes => {
        if (!Array.isArray(nodes)) return;
        nodes.forEach((n, i) => {
          for (const key of ['body', 'thenBody', 'elseBody']) walk(n?.[key]);
          // ねこと犬は1秒待つ。 (名人): each part written waits, as one subject does (決まり2).
          const lanes = n?.kind === 'Parallel' && n.lanes?.length > 1 && n.lanes.every(l => l.length === 1 && l[0].kind === 'WaitTime' && l[0].actorRef?.kind === 'named') ? n.lanes.map(l => l[0].actorRef.name) : null;
          if (!lanes && (!['WaitTime', 'WaitUntil', 'BroadcastAndWait'].includes(n?.kind) || !n.actorRef || n.actorRef.kind === 'all')) return;
          const waiters = lanes || [who(n.actorRef)], waiter = waiters.join('と');
          for (const m of nodes.slice(i + 1)) {
            if (m.kind === 'CommentLine') continue;
            if (controls.includes(m.kind) || !m.actorRef || m.actorRef.kind === 'all' || m.laneRef) break;
            const other = who(m.actorRef);
            if (!other || waiters.includes(other)) break;
            const note = { code: 'I101', notice: true, line: m.sourceSpan?.startLine || 0, column: m.sourceSpan?.startColumn || 1, where: item.key,
              message: `${item.meijin && !NOTICE_VERBS[m.kind] && !['MotionCommand', 'LooksCommand', 'PenCommand'].includes(m.kind) ? 'この 文は すぐ 行います' : other + 'は すぐ ' + (NOTICE_VERBS[m.kind] || '動きます')}（待つのは ${waiter}だけです）。${item.meijin ? 'この 本文 ぜんたいで' : 'みんなで'} 待つ ときは、「待つ」の 文に 主語を 書きません` };
            const key = note.where + '|' + note.line + '|' + note.column;
            if (!seen.has(key)) { seen.add(key); notes.push(note); }
            break;
          }
        });
      };
      walk(ast.body);
      for (const unit of ast.units || []) walk(unit.body);
      for (const note of [...fixedPlaceNotes(project, item, ast), ...silentWrongNotes(project, item, ast), ...flowNotes(project, compiled, item, ast)]) {
        const key = note.where + '|' + note.line + '|' + note.column + '|' + note.code;
        if (!seen.has(key)) { seen.add(key); notes.push(note); }
      }
      // A word of あかり (大きさ, 向き) that is also the name of the data it may mean: written bare it is the word.
      {
        const owner = project.components.find(c => c.id === item.targetId);
        const dataNames = new Set([...project.projectData.variables, ...project.projectData.lists, ...(owner?.localData?.variables || []), ...(owner?.localData?.lists || []),
          ...(item.meijin ? project.components.flatMap(c => [...(c.localData?.variables || []), ...(c.localData?.lists || [])]) : [])].map(d => d.name));
        const visit = node => {
          if (!node || typeof node !== 'object') return;
          if (Array.isArray(node)) { node.forEach(visit); return; }
          const word = node.kind === 'SensorRead' && node.arg === undefined ? (SENSOR_SURFACES[node.sensor] || node.sensor) : null;
          if (word && dataNames.has(word)) {
            const note = { code: 'I103', notice: true, line: node.sourceSpan?.startLine || 0, column: node.sourceSpan?.startColumn || 1, where: item.key,
              message: `「${word}」は あかりの「${word}」です。へんすう「${word}」を 読む ときは【${word}】と 書きます` };
            const key = note.where + '|' + note.line + '|' + note.column + '|I103';
            if (!seen.has(key)) { seen.add(key); notes.push(note); }
          }
          for (const [k, v] of Object.entries(node)) if (k !== 'sourceSpan' && v && typeof v === 'object') visit(v);
        };
        visit(ast.body); for (const unit of ast.units || []) visit(unit.body);
        // 名人: ねこの大きさを120％にする changes the look even when ねこ has a variable 大きさ.
        if (item.meijin) {
          const script = project.scripts.find(s => scriptSourceKey(s) === item.key);
          String(script?.source || '').split('\n').forEach((text, i) => {
            for (const c of project.components) for (const v of c.localData?.variables || []) {
              if (!MEIJIN_LOOK_WORDS.includes(v.name) || !text.includes(`${c.name}の${v.name}を`)) continue;
              const note = { code: 'I103', notice: true, line: i + 1, column: text.indexOf(`${c.name}の${v.name}を`) + 1, where: item.key,
                message: `「${c.name}の${v.name}」は ${c.name}の 見た目です。へんすう「${v.name}」を かえる ときは「${c.name}の【${v.name}】」と 書きます` };
              const key = note.where + '|' + note.line + '|' + note.column + '|I103';
              if (!seen.has(key)) { seen.add(key); notes.push(note); }
            }
          });
        }
      }
      // 名人: 〜の名前 is the part's name; a part with a variable 名前 is told how the variable is written.
      if (item.meijin) {
        const named = project.components.filter(c => c.localData?.variables?.some(v => v.name === '名前') || c.localData?.lists?.some(v => v.name === '名前'));
        const visit = node => {
          if (!node || typeof node !== 'object') return;
          if (Array.isArray(node)) { node.forEach(visit); return; }
          if (node.kind === 'PartName' && named.length && (node.actorRef?.kind !== 'named' || named.some(c => c.name === node.actorRef.name))) {
            const note = { code: 'I102', notice: true, line: node.sourceSpan?.startLine || 0, column: node.sourceSpan?.startColumn || 1, where: item.key,
              message: `「〜の名前」は 部品の 名前です。部品の へんすう「名前」を 読む ときは「${named[0].name}の【名前】」のように【 】で かこみます` };
            const key = note.where + '|' + note.line + '|' + note.column + '|I102';
            if (!seen.has(key)) { seen.add(key); notes.push(note); }
          }
          for (const [k, v] of Object.entries(node)) if (k !== 'sourceSpan' && v && typeof v === 'object') visit(v);
        };
        visit(ast.body); for (const unit of ast.units || []) visit(unit.body);
      }
    }
    for(const note of signalNotes(project,compiled)){
      const key=note.where+'|'+note.line+'|'+note.column+'|'+note.code+(note.code==='I138'?'|'+note.message:'');
      if(!seen.has(key)){seen.add(key);notes.push(note);}
    }
    return notes;
  }
