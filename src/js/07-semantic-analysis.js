  // ────────────────────────────────────────────────────────────────────────
  // 07 — Semantic analysis and compilation
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
          code: 'R412', message: '大きさは 1〜1000％に します。見えなく するときは「すがたをかくす」を 使います',
          line: node.sourceSpan?.startLine || 0, column: node.sourceSpan?.startColumn || 1, where,
        });
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
    const add = (code, message, node, where) => {
      const d = {
        code,
        message,
        line: node?.sourceSpan?.startLine || 0,
        column: node?.sourceSpan?.startColumn || 1,
        where,
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
    const misreadName = (name, other, meijin = false) => {
      const who = (fallback) => other ? messageExpression(other) : fallback;
      // 名人 reads these words; only the ending was not read (偶数じゃなかったら).
      if (meijin && ['空', '空っぽ', '偶数', '奇数', 'ぐう数', 'ぐうすう', 'き数', 'きすう'].includes(name)) return `「${name}」は、「${who('点数')}が${name}なら」「${who('点数')}が${name}でなければ」の 形で 書きます`;
      if (name === '空' || name === '空っぽ') return `「${name}」は くらべる ことばに ありません。リストが 空かを しらべるときは「${who('持ち物')}の数が0なら」のように 書きます`;
      // An odd number's あまり is 1 or －1 (the あまり has the sign of the number), as 名人 reads 奇数. ぐうすう・き数 are the same words.
      const even = ['偶数', 'ぐう数', 'ぐうすう'].includes(name), odd = ['奇数', 'き数', 'きすう'].includes(name);
      if (even || odd) return `「${name}」は くらべる ことばに ありません。「${who('点数')}÷2のあまりが${even ? '0' : '1か－1'}なら」のように 書きます`;
      const digits = /^(.+?)([0-9０-９]+(?:[.．][0-9０-９]+)?)$/.exec(name);
      if (digits && !symbols.projectVars?.has?.(digits[1]) && !symbols.projectLists?.has?.(digits[1]))
        return `「${name}」を 名前として 読みました。「${digits[1]}」は あかりの ことばに ありません。「${digits[1]}」を けして 書けるか たしかめてください。れい：前へ${digits[2]}歩進む`;
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
        sameNameTold.add(expr); add('S301', `「${expr.name}」は 部品の 名前です。ふれる 相手や 向く 相手など、部品を さすときは「「${expr.name}」」と 書きます（【 】で かこむのは へんすうの 名前です）`, ctx.node, where); return;
      }
      const name = expr?.kind === 'PartRef' ? expr.name : literalText(expr);
      if (name === null || special.includes(name)) return;
      const c = componentByName(name);
      if (!c) add('S301', `${label}「${name}」が ありません`, ctx.node, where);
      else if (allowed && !allowed.includes(c.type))
        add('S304', `${label}「${name}」は ここでは 使えません。使える 部品を えらんでください`, ctx.node, where);
    };
    let analyzeCallable = () => {};
    // The values a call gives, as written: 【長さ】を5、【向き】を90 (for an example of the same call with a subject).
    const callValues = n => { try { const names = n.argumentNames || [], values = n.args || []; return names.length && names.length === values.length ? names.map((x, i) => '【' + x + '】を' + messageExpression(values[i])).join('、') : ''; } catch (error) { if (!(error instanceof AkariError)) throw error; return ''; } };
    const actorContext = (ref, ctx, node, where) => {
      // 名人: the part held in a value acts; which part it is is known when the sentence runs.
      if (ref?.kind === 'value') {
        if (ref.value?.kind === 'VariableRead' && !ref.value.qualifier && componentByName(ref.value.name) && !sameNameTold.has(ref.value) && sameNameTold.add(ref.value))
          add('S316', sameNameAsPart(ref.value.name) + '。どちらかの 名前を かえてください', node, where);
        analyzeExpr(ref.value, ctx, where); return { ...ctx, targetId: null, targetType: null, valueActor: true };
      }
      if (!ref || ref.kind !== 'named') return ctx;
      const c = ref.name === project.stage.name || ref.name === '画面'
        ? { id: 'stage', type: 'stage' } : componentByName(ref.name);
      if (!c) { add('S301', `「${ref.name}」という キャラクターや 部品が 見つかりません。名前を たしかめてください${['ぼく','わたし','おれ','あたし','うち'].includes(ref.name)?'。自分の ことなら「自分は」と 書きます':''}`, node, where); return ctx; }
      // 名人 (決まり5): a part's name with data of the same name is not one reading, wherever it is written.
      if (ctx.meijin && c.id !== 'stage' && targetExists({ name: ref.name, qualifier: null }, symbols, ctx) && !sameNameTold.has(ref) && sameNameTold.add(ref))
        add('S316', sameNameAsPart(ref.name) + '。どちらかの 名前を かえてください', node?.sourceSpan ? node : ctx.node, where);
      return { ...ctx, targetId: c.id, targetType: c.type };
    };
    const checkArguments = (n, def, where) => {
      if (!n.argumentNames?.length) return;
      const names = n.argumentNames;
      if (names.length !== n.args.length || new Set(names).size !== names.length ||
        def.args.some(name => !names.includes(name)) || names.some(name => !def.args.includes(name)))
        add('S308', `「${n.name}」に 入れるものの 名前を、1つずつ 書いてください`+namedArgumentDetails(def.args,names), n, where);
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
        if (tagged.length > 1) mismatch(`${tagged.join('と')}は 同じ たんいでは ありません。たんいを そろえるか、「の数だけ」で たんいを 外してください`);
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
      if (!operation) { add('E703', 'ここで 使う かくちょうが 入っていません', n, where); return; }
      if (operation.args.length !== n.args.length) add('S308', 'かくちょうに 入れるものの 数が ちがいます', n, where);
      operation.args.forEach((shape, index) => {
        const argument = n.args[index]; if (!argument) return;
        const unit = staticUnit(argument, n, where);
        if (shape.type === 'number' && unit !== undefined && unit !== shape.unit)
          add('R417', 'かくちょうに 入れる 数の、たんいが 合いません', n, where);
        const known = {NumberLiteral:'number',QuantityLiteral:'number',StringLiteral:'string',BooleanLiteral:'boolean',ListLiteral:'list'}[argument.kind];
        if (known && shape.type !== 'value' && known !== shape.type) add('E705', 'かくちょうに 入れるものの しゅるい（数・文字など）が 合いません', n, where);
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
          if (!componentByName(n.name)) add('S301', `「${n.name}」という キャラクターや 部品が 見つかりません。名前を たしかめてください`, ctx.node || n, where);
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
          if (n.event === 'action' && !symbols.actions?.has?.(n.name)) add('S301', `てじゅん「${n.name}」が ありません`, n, where);
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
            add('S303', `この 中だけの 名前「${n.name}」は、作る 行より 前では 使えません。作る 行を 先に 書いてください`, ctx.node, where);
          const info = targetExists({ name: n.name, qualifier: n.qualifier }, symbols, ctx);
          if (info?.scope === 'project' && ctx.qualifiedRead === n)
            add('S301', `「${ctx.qualifiedName}」には「${n.name}」がありません。作品の へんすうや リストなら、「の」を つけずに ${n.name} と 書きます`, ctx.node, where);
          if (!info && !sameNameTold.has(n)) {
            const prefix =
              n.qualifier === 'self' && ctx.targetId ? `${targetLabel(ctx)}の自分には` : 'まだ 作っていない';
            add(
              'S301',
              (n.qualifier !== 'self' && misreadName(n.name, partner.get(n), ctx.meijin)) ||
              `${prefix} 名前「${n.name}」${n.qualifier === 'self' && ctx.targetId ? 'が ありません' : 'です。名前を たしかめるか、その 名前の へんすうか リストを 作ってください'}${wordHint(n.name)}`,
              ctx.node,
              where,
            );
          }
          // 名人: a part's name is a value too, so data of the same name makes either reading possible (決まり5).
          else if (ctx.meijin && !n.qualifier && componentByName(n.name) && !sameNameTold.has(n) && sameNameTold.add(n))
            add('S316', sameNameAsPart(n.name) + '。どちらかの 名前を かえてください', ctx.node, where);
        }
        if (n.kind === 'ExtensionCalculation') checkExtensionOperation(n, 'calculations', where);
        if (n.kind === 'UserFunctionCall') {
          const f = symbols.functions.get(n.name);
          if (!f) add('S301', `答えを もとめる「${n.name}」が ありません`, ctx.node, where);
          else if (f.args.length !== n.args.length)
            add('S308', `答えを もとめる「${n.name}」に 入れるものは ${f.args.length}こです`+namedArgumentDetails(f.args,n.argumentNames), ctx.node, where);
          else { checkArguments(n, f, where); analyzeCallable(f, 'function', ctx); }
        }
        if (n.kind === 'BuiltinCall' && BUILTIN_META.has(n.name)) {
          const m = BUILTIN_META.get(n.name),
            count = n.args.length;
          if (count < m.minArgs || count > m.maxArgs)
            add('S308', `はじめから ある 計算「${n.name === '乱数' ? 'AからBのどれか' : BUILTIN_SURFACES[n.name] || n.name}」に 入れるものの 数が ちがいます`, ctx.node, where);
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
            add('S311', '拡張「できごとの値」は、入れてある かくちょうの きっかけの 本文の 中だけで 使えます', ctx.node, where);
          if (eventOnly[n.sensor]) {
            if (ctx.definition)
              add('S311', `「${messageExpression(n)}」は、自分で 作った ブロックの 中では そのまま 使えません。きっかけの 本文の 中で 使い、入れるものとして わたしてください`, ctx.node, where);
            else if (ctx.event !== eventOnly[n.sensor] && n.sensor !== '拡張の値')
              add('S311', `「${messageExpression(n)}」は「${EVENT_LABELS[eventOnly[n.sensor]]}」の きっかけの 本文で 使います`, ctx.node, where);
          }
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
            ctx.targetType === 'stage'
          )
            add('S304', ctx.meijin ? `名人の 本文では、だれの「${messageExpression(n)}」かを 書きます。れい：「ねこ」の${messageExpression(n)}` : `「${messageExpression(n)}」は 画面では 使えません。キャラクターの 本文で 使ってください`, ctx.node, where);
          if (
            ['衣装番号', '衣装名'].includes(n.sensor) &&
            ctx.targetType &&
            ctx.targetType !== 'sprite'
          )
            add('S304', `「${messageExpression(n)}」は キャラクターで だけ 使えます`, ctx.node, where);
          if (n.sensor === 'KEY_DOWN') {
            const key = literalText(n.arg);
            if (key !== null && !validKeyName(key)) add('S301', keyNameMessage(key), ctx.node, where);
          }
          if (n.sensor === 'INPUT_VALUE')
            checkComponentTarget(n.arg, ['input'], ctx, where, '入力らん');
          if (n.sensor === 'DISTANCE_TO')
            checkComponentTarget(n.arg, null, ctx, where, '部品', ['マウス']);
          if (n.sensor === 'TOUCHING')
            checkComponentTarget(n.arg, null, ctx, where, '部品', ['マウス', ...Object.keys(EDGE_TARGETS)]);
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
              `この 中だけの 名前「${n.name}」が、入れるものの 名前か、ほかに 作った 名前と 同じです。ちがう 名前に してください`,
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
                : `「${n.target.name}」という へんすうや リストが ありません。名前を たしかめるか、その名前の へんすうか リストを 作ってください${wordHint(n.target.name)}`,
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
          add('S305', '「答えを もとめる」の 中では、動く・音を 出す・待つ などの やることは 使えません', n, where);
        if (n.kind === 'ReturnStatement') {
          if (ctx.definitionKind === 'action') add('S307', 'てじゅんでは 答えを 返せません。答えを 返すときは「答えを もとめる」で 作ります', n, where);
          if (ctx.definitionKind !== 'function')
            add('S307', 'きっかけの 本文では「〜を返す」は 使えません。答えを 返すのは「答えを もとめる」の 中だけです', n, where);
          if (!top) add('S306', '「答えを もとめる」の「返す」は、「もし」や「くり返す」の 中には 書けません。いちばん 下の 行に 書きます', n, where);
        }
        if ((n.kind === 'Break' || n.kind === 'Continue') && loopDepth === 0)
          add('S309', `「${n.kind === 'Break' ? 'このくり返しを終える' : 'この回の残りをとばして、次の回へ進む'}」は、くり返しの 中で だけ 使えます`, n, where);
        if (n.kind === 'UserActionCall') {
          const a = symbols.actions.get(n.name);
          if (!a) add('S301', `てじゅん「${n.name}」が ありません`, n, where);
          else if (a.args.length !== n.args.length)
            add('S308', `てじゅん「${n.name}」に 入れるものは ${a.args.length}こです`+namedArgumentDetails(a.args,n.argumentNames), n, where);
          else { checkArguments(n, a, where); analyzeCallable(a, 'action', c.meijin && c.targetType === 'stage' && n.actorRef?.kind !== 'named' ? { ...c, meijinCall: { node: n, where, name: n.name, given: callValues(n) } } : c); }
        }
        if (n.kind === 'MotionCommand' && ['POINT_TO', 'GOTO_PART'].includes(n.op))
          checkComponentTarget(n.args?.[0], null, c, where, '部品', ['マウス']);
        // 〜のところへ行く goes to a part or the mouse (final call 3): another value (点数, a calculation, a place) would only
        // fail when it runs, so it stops here. 名人 also goes to a part held in a value.
        const goal = n.kind === 'MotionCommand' && n.op === 'GOTO_PART' && !c.meijin ? n.args?.[0] : null;
        if (goal && !['StringLiteral', 'PartRef', 'Hole'].includes(goal.kind) && !(goal.kind === 'VariableRead' && !goal.qualifier && componentByName(goal.name)))
          add('S304', '「〜のところへ行く」の 行き先には、部品の 名前（れい：「ロケット」）か マウスを 書きます', n, where);
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
        if (n.kind === 'SoundCommand' && ['SAMPLE', 'SAMPLE_WAIT'].includes(n.op)) {
          const name = literalText(n.args?.[0]);
          if (name !== null && !project.sounds.some((x) => x.name === name))
            { if (!Object.hasOwn(SOLFEGE_HZ, name)) add('S301', `音「${name}」が ありません`, n, where); }
        }
        if (n.kind === 'LooksCommand' && n.op === 'SET_BACKDROP') {
          const name = literalText(n.args?.[0]);
          if (name !== null && !project.stage.backdrops.some((b) => b.name === name))
            add('S301', `はいけい「${name}」が ありません`, n, where);
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
            add('S301', `すがた「${name}」が ありません`, n, where);
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
        const needsSubject = message => c.meijinCall ? add('S304', `手順【${c.meijinCall.name}】の 中に、だれが するかを 書いていない 文が あります。手順を 呼び出す 文の はじめに、だれが 行うかを 書きます。れい：ねこは${c.meijinCall.given ? '、' + c.meijinCall.given + 'として、' : ''}【${c.meijinCall.name}】という手順を行う`, c.meijinCall.node, c.meijinCall.where)
          : add('S304', c.meijin ? (n.actorRef?.topicEnded ? MEIJIN_TOPIC_ENDED : MEIJIN_SUBJECT_MESSAGE) : message, n, where);
        // 名人: speech and sounds need who does them, as moves do (the script itself is no part; 画面は… names the stage).
        // Stopping every sound acts on the whole work.
        // 名人 (決まり4・6): in a heading's body too, a sentence after one with other subjects in it names who does it; in
        // 〜が〜にふれたとき、 it always does (either part could be meant).
        if (c.meijin && c.targetType !== 'stage' && n.actorRef?.kind === 'self' && (n.actorRef.topicEnded || n.actorRef.mustName) &&
          (['Say', 'Ask', 'MotionCommand', 'PenCommand', 'LooksCommand'].includes(n.kind) || (n.kind === 'SoundCommand' && n.op !== 'STOP_ALL')))
          add('S304', n.actorRef.mustName ? '「〜が〜にふれたとき、」の 中身では、ふれた 二つの 部品の どちらが するかが 決まらないので、だれが するかを 書きます。れい：だんごが星にふれたとき、星は「いたい」と言う' : MEIJIN_TOPIC_ENDED, n, where);
        if ((c.meijin || c.meijinCall) && c.targetType === 'stage' && n.actorRef?.kind !== 'named' &&
          (['Say', 'Ask'].includes(n.kind) || (n.kind === 'SoundCommand' && n.op !== 'STOP_ALL')))
          needsSubject(MEIJIN_SUBJECT_MESSAGE);
        // Clearing every line and stamp acts on the whole work, so the stage may do it.
        if (['MotionCommand', 'PenCommand'].includes(n.kind) && c.targetType === 'stage' && !(n.kind === 'PenCommand' && n.op === 'CLEAR'))
          needsSubject('動く ことや ペンで かく ことは、画面では できません。部品の 本文で 使ってください');
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
          needsSubject('この かえ方は、画面では 使えません。部品の 本文で 使ってください');
        if (
          n.kind === 'ForEach' && n.binder !== MEIJIN_BINDER &&
          [
            ...(c.binders || []),
            ...(c.localVarNames || []),
            ...(c.localListNames || []),
            ...(c.args || []),
          ].includes(n.binder)
        )
          add('S312', `「${n.binder}」は、ここで もう 使っている 名前です。ちがう 名前に してください`, n, where);
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
        meijin: !!item.meijin && !(item.ast?.heading?.actorRef?.kind === 'named' && [project.stage.name, '画面'].includes(item.ast.heading.actorRef.name)),
      };
      for (const d of staticScaleDiagnostics(item.ast, item.key))
        add(d.code, d.message, { sourceSpan: { startLine: d.line, startColumn: d.column } }, d.where);
      // 名人のできごと: 〜になったとき and 〜秒ごとに are read like any value; ふれる相手は部品。
      const heading = item.ast.heading, at = item.ast.body?.[0] || { sourceSpan: { startLine: 1, startColumn: 1 } };
      if (!item.meijin) { const only = meijinOnlyNode(item.ast); if (only) add('S317', 'この 書き方は、名人モードの 本文で だけ 使えます。名人モードに するときは、コードで「名人」を えらびます', only.sourceSpan ? only : at, item.key); }
      const message = typeof item.filter === 'object' ? item.filter?.message : item.filter;
      const extensionEvent = !item.meijin && item.event === 'message' && typeof message === 'string' && message.startsWith('拡張:')
        ? EXTENSION_HOST.describe(message.slice(3), 'events') : null;
      if (extensionEvent?.scope === 'meijin') add('S317', `拡張の きっかけ「${extensionEvent.displayName}」は、名人モードの 本文で だけ 使えます`, at, item.key);
      if (heading?.condition) analyzeExpr(heading.condition, { ...base, node: at }, item.key);
      if (heading?.seconds) analyzeExpr(heading.seconds, { ...base, node: at }, item.key);
      // ふれたとき's partner is a part or the edge (端, 端:上 …); the message is at the heading, or the body's first line.
      if (item.event === 'touchStart' && !isEdgeTarget(item.filter?.target) && !componentByName(item.filter?.target))
        add('S301', `「${item.filter?.target}」という キャラクターや 部品が 見つかりません。名前を たしかめてください`, heading ? { sourceSpan: { startLine: item.ast.sourceSpan?.startLine || 1, startColumn: 1 } } : at, item.key);
      walk(item.ast.body, base, item.key, 0, true);
      for (const rule of item.ast.rules || []) {
        const c = actorContext(rule.actorRef, { ...base, node: rule }, rule, item.key);
        if (c.targetType === 'stage') add('S304', '画面は「動き続ける」で 動かせません。動かす 部品を えらんでください', rule, item.key);
        if (item.definitionKind) add('S305', '「動き続ける」は、きっかけの 本文に 書いてください。自分で 作った ブロックの 中には 書けません', rule, item.key);
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
      ? (heading.actorRef.targetId || ((heading.actorRef.name === '画面' || heading.actorRef.name === project.stage.name) ? 'stage' :
        project.components.find((c) => c.name === heading.actorRef.name)?.id)) : script.targetId;
    const type = targetId === 'stage' ? 'stage' : project.components.find((c) => c.id === targetId)?.type;
    if (!type) throw new AkariError('S301', 'きっかけに 書いた キャラクターや 部品が 見つかりません。名前を たしかめてください');
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
        throw new AkariError('F503', '作品の 本文の 中身が こわれていて、読めません');
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
        if (d.ownerId !== 'stage') throw new AkariError('F503', '自分で 作った ブロックが、画面の ものに なっていません。作品の 中身が こわれています');
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
    const actor = ref => ref?.kind === 'named' ? ref.targetId || (ref.name === '画面' || ref.name === project.stage.name ? 'stage' : project.components.find(c => c.name === ref.name)?.id) : null;
    for (const record of records) {
      const parsed = parseSyntax(record.source, { ...record.context, symbols });
      const ownerName = record.ownerId === 'stage' ? project.stage.name : project.components.find(c => c.id === record.ownerId)?.name;
      const location = node => ({ sourceKey: record.key, ownerId: record.ownerId, title: [ownerName, record.title || '本文'].filter(Boolean).join(' / '), line: (node?.sourceSpan?.startLine || 1) + (record.lineOffset || 0) });
      if (record.incomplete) uncertain.push({ ...location(), kind: null, reason: 'まだ 決まっていない 入力が あるので、名前を 使っている ところを ぜんぶは しらべられません。入力を 決めてから、もう 一度 ためしてください' });
      if (!parsed.ast) { uncertain.push({ ...location(), kind: null, reason: '書きかけの 本文が あるので、名前を 使っている ところを ぜんぶは しらべられません。本文を 書きおえてから、もう 一度 ためしてください' }); continue; }
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
          uncertain.push({ ...location(expr), kind, targetOwnerId: ownerId || null, reason: '動かして はじめて 決まる 名前を 使っているので、ここでは しらべられません' }); return;
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
        if (node.kind === 'Hole') uncertain.push({ ...location(node), kind: null, reason: 'まだ 中身を えらんでいない ところが あります' });
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
  // 名人: the text has no blocks. The name is changed where it is written as a name (not in speech, a signal, nor a ※
  // note), and the text must then read the same, with the new name, as before. A quoted name is changed only where it
  // names the thing (「ねこ」のよこのばしょ, 「ねこ」にふれていれば), not where it is words (「ねこ」と言う, 「ねこ」の合図).
  // When the bare new name reads differently (ねこ → ねこが), it is written in 【 】, as a renamed block writes it; if
  // that does not read the same either, the rename is refused with the line whose reading changes.
  function meijinRenamedSource(record, project, next, resource, newName) {
    const source = record.source, old = resource.name;
    if (!source.includes(old)) return null;
    const quotes = [];
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (ch === '※') { const end = source.indexOf('\n', i); i = end < 0 ? source.length : end; continue; }
      if (ch === '「' || ch === '『') {
        const close = source.indexOf(ch === '「' ? '」' : '』', i + 1), end = close < 0 ? source.length : close + 1;
        if (source.slice(i + 1, end - 1) === old) quotes.push(i);
        i = end - 1;
      }
    }
    // Another name that holds this one (子ねこ for ねこ) is kept whole.
    const names = [...project.components, ...project.actions, ...project.functions, ...project.projectData.variables, ...project.projectData.lists,
      ...project.components.flatMap(c => [...(c.localData?.variables || []), ...(c.localData?.lists || [])])].map(x => x.name);
    const longer = [...new Set(names)].filter(name => name !== old && name.includes(old)).sort((a, b) => b.length - a.length);
    // written: how a bare name is written; changed: the quotes (by their place) that name the thing.
    const renamed = (written, changed) => {
      let out = '', i = 0;
      while (i < source.length) {
        const ch = source[i];
        if (ch === '※') { const end = source.indexOf('\n', i); out += source.slice(i, end < 0 ? source.length : end); i = end < 0 ? source.length : end; continue; }
        if (ch === '「' || ch === '『') {
          const close = source.indexOf(ch === '「' ? '」' : '』', i + 1), end = close < 0 ? source.length : close + 1;
          out += changed.has(i) ? ch + newName + source[end - 1] : source.slice(i, end);
          i = end; continue;
        }
        const kept = longer.find(name => source.startsWith(name, i));
        if (kept) { out += kept; i += kept.length; continue; }
        if (source.startsWith(old, i)) { out += written; i += old.length; continue; }
        out += ch; i++;
      }
      return out;
    };
    // The places where a quoted word names this thing (the reference graph's literal places).
    const literal = new Set(buildProjectReferenceGraph(project).references
      .filter(r => r.sourceKey === record.key && r.resourceKey === resource.key && r.binding === 'literal' && r.nodePath).map(r => r.nodePath.join('.')));
    // A name in 【 】 is the same name as written bare. Before the rename, a name (and a quoted word in a literal
    // place) stands for the new name.
    const shape = (ast, renaming) => {
      const walk = (v, path, key) => Array.isArray(v) ? v.map((x, i) => walk(x, [...path, i], key)) : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).filter(([k]) => !['sourceSpan', 'source', 'raw', 'inlineComment', 'comment', 'endLine', 'text', 'exact'].includes(k))
          .map(([k, x]) => [k, k === 'qualifier' && x === 'exact' ? null
            : renaming && x === old && (k === 'name' || k === 'target' || (k === 'value' && v.kind === 'StringLiteral' && literal.has(path.join('.')))) ? newName : walk(x, [...path, k], k)]))
        : v;
      return walk(ast, [], null);
    };
    const read = (text, p) => parseSyntax(text, { ...record.context, symbols: buildSymbols(p) });
    const before = read(source, project), want = before.ast && stableJson(shape(before.ast, true));
    const reads = text => { const after = read(text, next); return !!want && !!after.ast && stableJson(shape(after.ast, false)) === want; };
    // Which quotes name the thing is found by trying them (a few quotes at most; more are tried all or none).
    const choices = quotes.length <= 6 ? [...Array(1 << quotes.length).keys()].map(mask => new Set(quotes.filter((_, i) => mask & (1 << i)))) : [new Set(), new Set(quotes)];
    for (const written of [newName, '【' + newName + '】']) for (const changed of choices) { const text = renamed(written, changed); if (reads(text)) return text; }
    const lines = source.split('\n'), after = renamed(newName, new Set(quotes)).split('\n');
    const line = lines.findIndex((text, i) => text !== after[i] && !(() => { const a = read(text.trim(), project), b = read(after[i].trim(), next); return a.ast && b.ast && stableJson(shape(a.ast, true)) === stableJson(shape(b.ast, false)); })());
    throw new AkariError('S301', line < 0 ? '名人の 本文の 中で、名前を かえても 同じ ものを さすかを たしかめられません。名前を【 】で かこむなど、どれの ことか はっきり 書いてください'
      : `名前を「${newName}」に すると、${(() => { const s = buildSymbols(project), what = project.components.some(c => c.name === newName) ? '部品' : s.projectLists?.has(newName) ? 'リスト' : s.projectVars?.has(newName) ? 'へんすう' : null; return what ? `「${newName}」という ${what}が あるので、` : ''; })()}名人の 本文の ${line + 1}行目「${lines[line].trim()}」が ちがう 意味に 読めます。ちがう 名前に してください`);
  }
  // A procedure made in a 名人 text is renamed in that text and wherever it is called; every changed text must read
  // the same with the new name.
  function prepareMeijinProcedureRename(project, definitionId, newName) {
    const d = meijinProjectDefinitions(project).find(x => x.id === definitionId);
    if (!d) throw new AkariError('F503', '名前を かえる てじゅんが 見つかりません');
    const name = normalizeCharsOutsideString(String(newName ?? '').trim());
    validateName(name, { callable: true });
    if (name === d.name) return cloneDesignProject(project);
    if ([...project.actions, ...project.functions, ...meijinProjectDefinitions(project)].some(x => x.name === name))
      throw new AkariError('F503', '自分で 作った ブロックに 同じ 名前が あります。ちがう 名前に してください');
    // A part, data or received value of the same name: the new name would be read as that one where it is written bare.
    {
      const s = buildSymbols(project), local = [...(s.individualByTargetId?.values?.() || [])];
      const what = [project.stage, ...project.components].some(c => c.name === name) ? '部品'
        : s.projectLists?.has(name) || local.some(x => x.lists?.has(name)) ? 'リスト'
          : s.projectVars?.has(name) || local.some(x => x.variables?.has(name)) ? 'へんすう'
            : meijinProjectDefinitions(project).some(x => (x.args || []).includes(name)) ? '入れるもの' : null;
      if (what) throw new AkariError('F503', `「${name}」という ${what}が あるので、手順の 名前には できません。ちがう 名前に してください`);
    }
    const next = cloneDesignProject(project), resource = { name: d.name }, records = sourceRegistry(project);
    const place = (record, source) => {
      if (source === null || source === record.source) return;
      const target = record.kind === 'script' ? scriptBySourceKey(next, record.key) : next[record.kind === 'action' ? 'actions' : 'functions'].find(x => record.key === record.kind + ':' + x.id);
      target.source = source;
      if (target.document) target.document.revision++;
    };
    // The text that makes it first, so the others read the new name as a procedure.
    const own = records.find(r => r.key === `script:${d.scriptId}`);
    place(own, meijinRenamedSource(own, project, next, resource, name));
    for (const record of records) if (record !== own) place(record, meijinRenamedSource(record, project, next, resource, name));
    if (!meijinProjectDefinitions(next).some(x => x.id === d.id && x.name === name))
      throw new AkariError('S301', '名人の 本文の 見出しで、てじゅんの 名前を かえられませんでした。名前を【 】で かこんで 書いてください');
    validateDesignProject(next);
    return next;
  }
  function prepareBindingRename(project, resourceKey, newName, options = {}) {
    const graph = buildProjectReferenceGraph(project, options), resource = graph.resources.find(r => r.key === resourceKey);
    if (!resource) throw new AkariError('F503', '名前を かえる ものが 見つかりません');
    validateResourceName(newName, '名前');
    if (newName === resource.name) return cloneDesignProject(project);
    if (graph.uncertain.some(r=>!r.kind||r.kind===resource.kind)) throw new AkariError('S301', '書きかけの 本文か、動かして はじめて 決まる 名前が あります。本文を 書きおえてから、名前を かえてください');
    const next = cloneDesignProject(project), items = resource.kind === 'component' ? [next.stage, ...next.components]
      : resource.kind === 'data' ? (resource.ownerId === 'stage' ? next.projectData : next.components.find(c => c.id === resource.ownerId).localData)
      : next[resource.kind === 'action' ? 'actions' : 'functions'];
    const siblings = Array.isArray(items) ? items : [...items.variables, ...items.lists];
    if ((resource.kind === 'action' || resource.kind === 'function' ? [...next.actions, ...next.functions] : siblings).some(d => d.id !== resource.id && d.name === newName))
      throw new AkariError('F503', '同じ ところに 同じ 名前が あります。ちがう 名前に してください');
    siblings.find(d => d.id === resource.id).name = newName;
    validateDesignProject(next);
    const at = (root, path) => path.reduce((value,key) => value?.[key],root), grouped = new Map();
    for (const ref of graph.references.filter(r => r.resourceKey === resourceKey)) {
      if (options.drafts?.some(d => d.key === ref.sourceKey)) throw new AkariError('S301', 'なおしている とちゅうの 自分で 作った ブロックを、先に 決めてから 名前を かえてください');
      if (graph.references.some(r => r.sourceKey === ref.sourceKey && r.binding === ref.binding && stableJson(r.nodePath) === stableJson(ref.nodePath) && r.resourceKey !== resourceKey))
        throw new AkariError('S301', '同じ 名前が、いくつかの ものを さしています。どの 部品の ものか、はっきり 書いてから 名前を かえてください');
      const rows = grouped.get(ref.sourceKey) || []; rows.push(ref); grouped.set(ref.sourceKey,rows);
    }
    for (const record of sourceRegistry(project)) {
      if (record.context.meijin) {
        if (options.drafts?.some(d => d.key === record.key)) continue;
        const source = meijinRenamedSource(record, project, next, resource, newName);
        if (source !== null) { const target = scriptBySourceKey(next, record.key); target.source = source; if (target.document && source !== record.source) target.document.revision++; }
        continue;
      }
      const refs = grouped.get(record.key); if (!refs) continue;
      const session = createEditorSession(record.key,record.source,record.context,project), tree = cloneDesignProject(session.blockView), index = buildBlockIndex(tree), edits = [];
      if (!session.syntaxAst || !tree) throw new AkariError('S301', '本文の どこで 名前を 使っているか、決められません');
      for (const ref of refs) {
        const entry = [...session.nodeMap].find(([,loc]) => stableJson(loc.path) === stableJson(ref.nodePath));
        if (!entry) throw new AkariError('F503', '名前を 使っている ばしょを、たしかめられません');
        const [id,loc] = entry, node = index.get(id).node, original = at(session.syntaxAst,ref.nodePath);
        // A touch body with no heading keeps its partner in the work only (renamed below).
        if (ref.binding === 'filter') continue;
        // ふれたとき's partner in the heading: the token is written again in its own way (「 」 or 【 】).
        if (ref.binding === 'touch') {
          const heading = node.fields.heading, range = loc.surface?.targetRange;
          if (!heading?.filter || heading.filter.target !== resource.name || !range) throw new AkariError('F503', '書いた 文の 中で、ふれる 相手の 名前の ばしょを たしかめられません');
          heading.filter.target = newName;
          const token = compactOutsideString(record.source.slice(range.start, range.end));
          edits.push({ ...range, text: token.startsWith('【') ? `【${newName}】` : formatExpression({ kind: 'StringLiteral', value: newName }) });
          continue;
        }
        if (ref.binding === 'actor') {
          const actor = node.fields.heading?.actorRef || node.fields.actorRef;
          if (!actor || actor.name !== resource.name) continue; // The stable alias 画面 keeps its spelling.
          actor.name = newName;
        } else if (ref.binding === 'literal') node.fields.value = newName;
        else node.fields.name = newName;
        // Inherited subjects update the semantic field, but have no source token.
        const range = ref.binding === 'actor' ? loc.surface?.actorRange : loc.surface?.range;
        if (ref.binding === 'actor' && !range) continue;
        if (!range) throw new AkariError('F503', '書いた 文の 中で、名前の ばしょを たしかめられません');
        if (ref.binding === 'actor') {
          const token=compactOutsideString(record.source.slice(range.start,range.end));
          if(![resource.name,`【${resource.name}】`,`「${resource.name}」`].includes(token))throw new AkariError('F503','書いた 文の 中で、だれが 動くかの 名前の ばしょを たしかめられません');
          const text=token.startsWith('【')?`【${newName}】`:token.startsWith('「')?formatExpression({kind:'StringLiteral',value:newName}):nameSource(newName);
          edits.push({...range,text});continue;
        }
        if (ref.binding === 'literal') { edits.push({...range,text:formatExpression({kind:'StringLiteral',value:newName})}); continue; }
        const phrase=original.kind==='UserActionCall'&&project.actions.find(a=>a.id===resource.id)?.callPhrase;
        if(phrase&&compactOutsideString(record.source.slice(range.start,range.end)).replace(/[。．.]$/,'').endsWith(actionCallPhraseKey(phrase)))continue;
        let end = range.end;
        // Values, quoted speech and nested bodies are separate semantic nodes.
        // A containing command's name must never rename text inside those nodes.
        const protectedRanges = [...session.nodeMap.values()].filter(child => child.path.length > loc.path.length && loc.path.every((k,i) => child.path[i] === k)).map(child => child.surface?.range).filter(Boolean);
        const candidates = [];
        for (let pos=record.source.indexOf(resource.name,range.start);pos>=0&&pos+resource.name.length<=end;pos=record.source.indexOf(resource.name,pos+resource.name.length)) {
          if (protectedRanges.some(r => pos>=r.start&&pos<r.end)) continue;
          let start=pos,finish=pos+resource.name.length,text=nameSource(newName);
          const before=record.source[pos-1],after=record.source[finish];
          if (before==='【'&&after==='】') {start--;finish++;text=`【${newName}】`;}
          else if (before==='「'&&after==='」') {start--;finish++;text=formatExpression({kind:'StringLiteral',value:newName});}
          candidates.push({start,end:finish,text});
        }
        if (candidates.length>1) throw new AkariError('S301', '1つの 文の 中に、同じ 名前が いくつも あります。どれの ことか、はっきり 書いてから 名前を かえてください');
        if (candidates.length) edits.push(candidates[0]);
        else if (ref.binding!=='actor'&&!(original.kind==='UserActionCall'&&project.actions.find(a=>a.id===resource.id)?.callPhrase))
          throw new AkariError('F503', '名前の 書き方を、たしかめられません');
      }
      let source=record.source,boundary=source.length;
      const unique=[...new Map(edits.map(e=>[e.start+':'+e.end,e])).values()].sort((a,b)=>b.start-a.start);
      for (const edit of unique) {if(edit.end>boundary)throw new AkariError('F503','名前を かえる ところが、重なっています');source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);boundary=edit.start;}
      const parsed=parseSyntax(source,{...record.context,symbols:buildSymbols(next)});
      if(!parsed.ast||!astEquivalent(parsed.ast,blockDecode(tree)))throw new AkariError('S301','この 書き方では、名前を かえても 同じ ものを さした ままか、たしかめられません。名前を【 】で かこむなど、どれの ことか はっきり 書いてください');
      const target=record.kind==='script'?scriptBySourceKey(next,record.key):next[record.kind==='action'?'actions':'functions'].find(d=>record.key===record.kind+':'+d.id);
      target.source=source;if(target.document&&source!==record.source)target.document.revision++;
    }
    // ふれたときの相手 kept in the work (filter.target) is renamed with the part, with or without a heading.
    if (resource.kind === 'component') for (const script of next.scripts)
      if (script.event === 'touchStart' && script.filter?.target === resource.name) script.filter = { target: newName };
    const identity = rows => rows.map(r => [r.sourceKey,r.resourceKey,r.binding,r.nodePath]).map(stableJson).sort(), after = buildProjectReferenceGraph(next);
    if (after.uncertain.length!==graph.uncertain.length || stableJson(identity(graph.references)) !== stableJson(identity(after.references)))
      throw new AkariError('S301', 'その 名前に すると、さす ものや、どの 部品の ものかが かわってしまいます。ちがう 名前に するか、どの 部品の ものか、はっきり 書いてください');
    validateDesignProject(next);return next;
  }

  function prepareResourceRename(project, resourceKey, newName, options = {}) {
    const impact = resourceChangeImpact(project, resourceKey, options), resource = impact.resource;
    if (!['costume', 'backdrop', 'sound'].includes(resource.kind)) return prepareBindingRename(project,resourceKey,newName,options);
    validateResourceName(newName, '名前');
    if (newName === resource.name) return cloneDesignProject(project);
    if (impact.uncertain.length) throw new AkariError('S301', '名前を 使っているか しらべられない 本文が あります。先に 本文を 書きおえてから、名前を かえてください');
    const next = cloneDesignProject(project), items = resource.kind === 'costume'
      ? next.components.find(c => c.id === resource.ownerId).costumes : resource.kind === 'backdrop' ? next.stage.backdrops : next.sounds;
    if (items.some(x => x.id !== resource.id && x.name === newName)) throw new AkariError('F503', '同じ 名前が あります');
    const graph = buildProjectReferenceGraph(project, options), grouped = new Map();
    // 名人: the name is changed in the text and the text must read the same (as for parts and data).
    const meijinKeys = new Set(project.scripts.filter(isMeijinScript).map(scriptSourceKey));
    for (const ref of impact.references) {
      if (meijinKeys.has(ref.sourceKey)) continue;
      if (ref.binding !== 'literal' || !ref.range || options.drafts?.some(r => r.key === ref.sourceKey)) throw new AkariError('S301', '書きかけを 先に 決めてから、名前を かえてください');
      if (graph.references.some(other => other.sourceKey === ref.sourceKey && other.range?.start === ref.range.start && other.range?.end === ref.range.end && other.resourceKey !== resourceKey))
        throw new AkariError('S301', '同じ 名前が、いくつかの ものを さしています。どれの ことか、はっきり 書いてから 名前を かえてください');
      const edits = grouped.get(ref.sourceKey) || []; if (!edits.some(e => e.start === ref.range.start && e.end === ref.range.end)) edits.push(ref.range); grouped.set(ref.sourceKey, edits);
    }
    const replacement = formatExpression({ kind: 'StringLiteral', value: newName });
    for (const [key, edits] of grouped) {
      const record = key.startsWith('script:') ? scriptBySourceKey(next, key) : [...next.actions, ...next.functions].find(d => key.endsWith(':' + d.id));
      if (!record) throw new AkariError('F503', '名前を かえる 本文が 見つかりません');
      for (const { start, end } of edits.sort((a, b) => b.start - a.start)) {
        const literal = parseExpression(record.source.slice(start, end), buildSymbols(project));
        if (literal.kind !== 'StringLiteral' || literal.value !== resource.name) throw new AkariError('F503', '名前を 使っている ばしょを、たしかめられません');
        record.source = record.source.slice(0, start) + replacement + record.source.slice(end);
      }
      // Only a literal token changed; document ownership and unit IDs stay fixed.
      if (record.document) record.document.revision++;
    }
    items.find(x => x.id === resource.id).name = newName;
    for (const record of sourceRegistry(project)) {
      if (!record.context.meijin || options.drafts?.some(d => d.key === record.key)) continue;
      const source = meijinRenamedSource(record, project, next, resource, newName);
      if (source !== null && source !== record.source) { const target = scriptBySourceKey(next, record.key); target.source = source; if (target.document) target.document.revision++; }
    }
    validateDesignProject(next);
    return next;
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
        errors.push({ code: 'S302', message: `手順「${d.name}」は もう あります。ちがう 名前に してください`, line: d.headLine, column: 1, where: `script:${d.scriptId}` });
      else parseOne(key, d.source, { ownerId: 'stage', targetId: null, targetType: null, event: null, args: d.args, definition: d, definitionKind: 'action', meijin: true });
      for (const error of errors.slice(before)) if (error.where === key || !error.where) Object.assign(error, { where: `script:${d.scriptId}`, line: (error.line || 1) + d.line - 1 });
    }
    if(items.filter(item=>!item.definitionKind).length>LIMITS.scripts)errors.push({code:'F504',message:'きっかけの 本文が 多すぎます。使わない 本文を けしてください',line:0,column:1,where:'project'});
    const rules = items.flatMap(item => (item.ast.rules || []).map((rule, index) => ({
      ...rule, id: `${item.key}:rule:${index}`, targetId: item.targetId || item.ownerId,
    })));
    return { symbols, items, errors, rules, astByKey: syntaxItemMap(items,errors) };
  }
  function syntaxItemMap(items,errors) {
    const map=new Map();
    for(const item of items){
      if(map.has(item.key))errors.push({code:'F503',message:'作品の 中身が こわれています。同じ きっかけの 本文が 2つ あります',line:0,column:1,where:item.documentKey||item.key});
      else map.set(item.key,item.ast);
    }
    return map;
  }
  function documentSyntaxItems(ast,key,context,project,errors) {
    const first={...ast};delete first.units;
    if(context.unitIds&&context.unitIds.length!==1+(ast.units?.length||0))errors.push({code:'F503',message:'作品の 中身が こわれています。きっかけの 本文の 数が 合いません',line:0,column:1,where:key});
    return [first,...(ast.units||[])].map((unit,index)=>{
      // Imported documents may not yet have persistent unit IDs. Their runtime
      // keys use a separate namespace, never a guess in the user ID namespace.
      const id=context.unitIds?.[index]||(index?`document:${key}:unit:${index+1}`:context.id);
      const unitKey=context.unitIds||index?'script:'+id:key,heading=unit.heading;
      let resolved={...context,...(ast.units||context.unitIds?{id,scriptId:id,documentKey:key}:{})};
      if(heading){
        const ref=heading.actorRef,actor=ref?.kind==='named'?(ref.name===project.stage.name||ref.name==='画面'?{id:'stage',type:'stage'}:project.components.find(c=>c.name===ref.name)):
          context.targetId==='stage'?{id:'stage',type:'stage'}:project.components.find(c=>c.id===context.targetId);
        if(!actor)errors.push({code:'S304',message:ref?.kind==='named'?(context.meijin&&targetExists({name:ref.name,qualifier:null},buildSymbols(project),{})?`見出しの 主語には、部品の 名前を 一つ 書きます（「${ref.name}」のような へんすうや リストは 書けません）。中身の 文に 主語を 書きます`:`「${ref.name}」という キャラクターや 部品が 見つかりません。名前を たしかめてください`):'この きっかけを 使う キャラクターや 部品が 見つかりません',line:unit.sourceSpan?.startLine||1,column:1,where:key});
        else if(heading.event==='touchStart'&&actor.type==='stage')errors.push({code:'S304',message:STAGE_TOUCH_MESSAGE,line:unit.sourceSpan?.startLine||1,column:1,where:key});
        else if(!EVENT_BY_TYPE[actor.type]?.includes(heading.event)&&!(context.meijin&&meijinEventOwner(heading.event,actor.type)))errors.push({code:'S304',message:`この キャラクターや 部品では、${EVENT_LABELS[heading.event]?'「'+EVENT_LABELS[heading.event]+'」の ':'この '}きっかけは 使えません。ほかの きっかけに してください`,line:unit.sourceSpan?.startLine||1,column:1,where:key});
        else resolved={...resolved,ownerId:actor.id,targetId:actor.id,targetType:actor.type,event:heading.event,filter:heading.filter||null};
      }
      return syntaxItem(unitKey,unit,resolved);
    });
  }
  function analyzeAst(ast, project, context = {}) {
    // A 名人 script has its own sentence kinds; no block reads it.
    if (!context.meijin) validateSyntaxAst(ast);
    // A definition draft is inspected in a private candidate environment; it is never registered here.
    let candidate = project;
    const kind = context.definitionKind || null,
      definition = context.definition || null;
    if (kind && definition) {
      candidate = {
        ...project,
        actions: project.actions.filter((x) => x.id !== definition.id),
        functions: project.functions.filter((x) => x.id !== definition.id),
      };
      candidate[kind === 'action' ? 'actions' : 'functions'].push({
        ...definition,
        args: context.args || definition.args || [],
        source: ast.source || '',
      });
    }
    const targetId = kind ? null : context.targetId || 'stage',
      event = kind ? null : context.event || 'start';
    const key =
      context.key ||
      context.ownerKey ||
      (kind ? `${kind}:${definition?.id || 'draft'}` : context.id || context.scriptId
        ? `script:${context.id || context.scriptId}` : `script:${targetId}:${event}`);
    const compiled = parseProjectSyntax(candidate, true),
      targetType = kind
        ? null
        : targetId === 'stage'
          ? 'stage'
          : candidate.components.find((x) => x.id === targetId)?.type;
    const items = documentSyntaxItems(ast, key, {
      ...context,
      targetId,
      targetType,
      event,
      definition,
      definitionKind: kind,
      args: context.args || definition?.args || [],
    },candidate,compiled.errors);
    compiled.items = compiled.items.filter((x) => x.key !== key && x.documentKey !== key);
    compiled.items.push(...items);
    compiled.astByKey=syntaxItemMap(compiled.items,compiled.errors);
    return placeMeijinDefinitionErrors(candidate, analyzeProject(candidate, compiled, { rootKeys: new Set(items.map(item=>item.key)) }));
  }
  function compileProject(project) {
    try {
      validateProject(project);
    } catch (err) {
      return {
        symbols: null,
        items: [],
        astByKey: new Map(),
        errors: [
          { code: err.code || 'F503', message: err.message, line: 0, column: 1, where: 'project' },
        ],
      };
    }
    const compiled = parseProjectSyntax(project);
    compiled.errors.push(...placeMeijinDefinitionErrors(project, [...analyzeProject(project, compiled), ...eventCountPlacement(compiled), ...laneControlPlacement(compiled)]));
    compiled.errors = meijinSelfWord(project, wordLines(project, meijinFormsInOrdinary(project, compiled.errors)));
    compiled.notes = projectNotes(project, compiled);
    return compiled;
  }
  // A 名人 form written in an ordinary body (主役をねこにする, ねこは、いちばん近い星の方を向く, 1秒ごとに、…) reads with
  // no error as a 名人 script: the check then says so (S317) instead of a reading error that asks for a name or another
  // sentence. An error that gives its own guidance or choices (「空」は…, 「〜になったら」は…) is kept.
  // 10秒のあいだ、くり返す in an ordinary body asks for a state before あいだ; it is the 名人 timed repeat.
  const GENERIC_READING_ERRORS = [/^まだ 作っていない 名前/, /^この 名前は【名前】のように【 】で かこんでください/, /読みとれません|読めません|読めない ところ/, /が たりません/, /という 文は あかりに ありません/, /^つづける きまりの おわりを「あいだ」に/];
  function meijinFormsInOrdinary(project, errors) {
    let out = errors;
    for (const script of project.scripts) {
      if (isMeijinScript(script) || !script.source?.trim()) continue;
      const key = scriptSourceKey(script), at = out.findIndex(e => e.where === key), first = out[at];
      if (!first || !['P201', 'P205', 'S301'].includes(first.code) || first.proposals?.length || !GENERIC_READING_ERRORS.some(re => re.test(first.message))) continue;
      // As written (its own headings and procedures), or as the part's sentences: in 名人 text they are read under a
      // heading that names the part.
      const owner = project.components.find(c => c.id === script.targetId)?.name, sources = [script.source];
      if (owner && /^[^\s、。「」【】（）()]+$/.test(owner)) {
        sources.push(`作品を動かしたとき、${owner}は、\n` + script.source.split('\n').map(line => line.trim() ? '  ' + line : line).join('\n'));
        // A part's body names no subject (or names 自分): in a 名人 text the part is written as the subject.
        const named = text => project.components.some(c => text.startsWith(c.name) && /^[はがともや、]/.test(text.slice(c.name.length)));
        sources.push(script.source.split('\n').map(line => {
          const [, indent, text] = /^(\s*)(.*)$/.exec(line);
          if (!text || /^(?:もし|そうでなければ|ずっと|次のことを|※)/.test(text) || /(?:とき|たら|ごとに)、$/.test(text) || named(text)) return line;
          return indent + owner + 'は、' + text.replace(/^自分(?:は|が)、?/, '');
        }).join('\n'));
      }
      const reads = sources.some(source => {
        const trial = cloneDesignProject(project);
        trial.scripts = [{ id: 'meijin-reading', mode: 'meijin', targetId: MEIJIN_OWNER, event: 'start', source }];
        try { return compileProject(trial).errors.length === 0; } catch (error) { if (!(error instanceof AkariError)) throw error; return false; }
      });
      if (!reads) continue;
      const { proposals, draftRole, ...location } = first;
      out = [...out.slice(0, at), { ...location, code: 'S317', message: 'この 書き方は、名人モードの 本文で だけ 使えます。名人モードに するときは、コードで「名人」を えらびます' }, ...out.slice(at).filter(e => e.where !== key)];
    }
    return out;
  }

  // An ordinary body: a 国語・算数 word written as a sentence form (10の倍数, 12の約数, からっぽ) on the line where the
  // reading stopped. Say how to write it, with the names as written; a 名人 body reads these words.
  const WORD_LINES = [[/^\s*(?:もし、?)?([^、。が「」\s]+?)が([0-9０-９]+)の倍数(?:なら|でなければ)/, m => `「${m[2]}の倍数」は くらべる ことばに ありません。「${m[1]}が0とちがっていて、${m[1]}÷${m[2]}のあまりが0なら」のように 書きます`], [/^\s*(?:もし、?)?([^、。が「」\s]+?)が([0-9０-９]+)の約数(?:なら|でなければ)/, m => `「${m[2]}の約数」は くらべる ことばに ありません。${m[1]}が 整数なら「${m[1]}が0より大きくて、${m[2]}÷${m[1]}のあまりが0なら」のように 書きます`], [/^\s*(?:もし、?)?([^、。が「」\s]+?)が(からっぽ|カラッポ)(?:なら|でなければ)/, m => `「${m[2]}」は くらべる ことばに ありません。リストが 空かを しらべるときは「${m[1]}の数が0なら」のように 書きます`]];
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
      const part = project.components.find(c => c.type !== 'stage')?.name || 'ねこ', example = text && !/^自分/.test(text) ? `れい：${part}は${text.replace(/^、/, '')}` : null;
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
        const message = across
          ? 'よこの 歩数を 書いていないので、右へ0歩（画面の 左の はし）へ 行きます。よこを 今の ままに するときは「右へ（よこのばしょ）歩」を 書きます'
          : 'たての 歩数を 書いていないので、上へ0歩（画面の 下の はし）へ 行きます。たてを 今の ままに するときは「上へ（たてのばしょ）歩」を 書きます';
        const location = SOURCE_RANGES.get(node), range = location && !location.rewritten ? location.range : null, proposals = [];
        if (range && source) {
          const original = source.slice(range.start, range.end), write = (leg, subject) => {
            const fixed = { ...goto, inlineComment: '', [missing]: exprNode('QuantityLiteral', { unit: '歩', value: leg }) };
            try { return formatScript({ kind: 'Script', body: [fixed] }, subject ? {} : { inheritedActor: goto.actorRef }).trim().replace(/。$/, ''); }
            catch (error) { if (error instanceof AkariError) return null; throw error; }
          };
          for (const [label, leg] of [[across ? '「右へ（よこのばしょ）歩」を 書く' : '「上へ（たてのばしょ）歩」を 書く', exprNode('SensorRead', { sensor: across ? '横位置' : '縦位置' })],
            [across ? '「右へ0歩」を 書く' : '「上へ0歩」を 書く', exprNode('NumberLiteral', { value: 0 })]]) {
            let text = lanes ? null : write(leg, STATEMENT_EXPLICIT_ACTORS.has(goto));
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
    const touchOf = condition => { let found = null; expressions({ condition }, (e, negated) => { if (!found && !negated && e.kind === 'SensorRead' && e.sensor === 'TOUCHING') found = e; }); return found; };
    const ends = nodes => [...statements(nodes)].some(m => NOTICE_WAITS.has(m.kind) || m.kind === 'MotionCommand' || m.kind === 'StopCommand' ||
      (m.kind === 'LooksCommand' && m.op === 'HIDE') || (m.kind === 'CloneCommand' && ['DELETE_SELF', 'DELETE_ALL'].includes(m.op)) || (m.kind === 'Say' && m.seconds));
    const keyOf = condition => condition?.kind === 'SensorRead' && condition.sensor === 'KEY_DOWN' && condition.arg?.kind === 'StringLiteral' ? condition.arg.value : null;
    const visitList = (nodes, inLoop) => {
      let heldKey = null, before = 0;
      for (const n of nodes || []) {
        if (!n || typeof n !== 'object' || n.kind === 'CommentLine') continue;
        // 「これを6回くり返す」 after more than one sentence: only the one before it is repeated.
        if (REPEAT_PREVIOUS.has(n) && before > 0)
          note('I122', { sourceSpan: { startLine: n.sourceSpan?.endLine, startColumn: 1 } }, `「これを${text(n.count)}くり返す」で くり返すのは、すぐ 前の 一文だけです。前の 文も くり返すときは、「${text(n.count)}くり返す。」と 書いて、くり返す 文を その 下に 右へ ずらして 書きます`);
        before++;
        // 「空白」キーがおされるまで待つ twice: the second wait ends at once on the key still held (0 seconds).
        if (n.kind === 'WaitUntil') {
          const key = keyOf(n.condition);
          if (key !== null && heldKey === key)
            note('I125', n, `キーを おしたままだと、二つめの「おされるまで待つ」も すぐ 終わります（はかった 時間は 0秒です）。あいだに「「${keySurface(key)}」キーがおされなくなるまで待つ。」を 書きます`);
          // A wait for the key to be let go (or for anything else) ends the held press.
          heldKey = key;
        } else if (NOTICE_WAITS.has(n.kind) || NOTICE_LOOPS.has(n.kind) || n.kind === 'IfStatement' || (n.kind === 'Say' && n.seconds)) heldKey = null;
        // もし「石」にふれていれば、点数を1増やす in a loop: it counts on every turn while they touch.
        if (inLoop && n.kind === 'IfStatement') {
          const touch = touchOf(n.condition), changes = [...statements(n.thenBody)].some(m => NOTICE_CHANGES.has(m.kind));
          if (touch && changes && !ends(n.thenBody)) {
            const target = touch.arg?.kind === 'StringLiteral' ? touchShown(touch.arg.value) : '「石」';
            note('I121', n, `ふれている あいだ、くり返す たびに 値が かわります。ふれる たびに 1回だけ かえるなら「${target}にふれたとき、」を 使います`);
          }
        }
        // 答え compared with a number: 答え is the text that was typed, never a number.
        expressions(n, e => {
          if (e.kind !== 'CompareExpression') return;
          const [answer, other] = e.left?.kind === 'SensorRead' && e.left.sensor === '答え' ? [e.left, e.right] : e.right?.kind === 'SensorRead' && e.right.sensor === '答え' ? [e.right, e.left] : [];
          if (!answer || !numeric(other)) return;
          // Equal or not: the number is written as text (「7」). Larger or smaller: 数（答え） makes the answer a number.
          const same = ['EQ', 'NEQ'].includes(e.op), value = staticNumericMagnitude(other);
          let example = null;
          try { example = 'もし' + formatCondition({ ...e, [e.left === answer ? 'right' : 'left']: same && value !== undefined ? exprNode('StringLiteral', { value: decimalSource(value) }) : other, [e.left === answer ? 'left' : 'right']: same ? answer : exprNode('BuiltinCall', { name: '数', args: [answer] }) }, 'if') + '、'; }
          catch (error) { if (!(error instanceof AkariError)) throw error; }
          note('I123', n, same ? `答えは 文字です。数の 答えと くらべるときは「${example || 'もし答えが「7」なら、'}」のように「 」で かこみます`
            : `答えは 文字なので、大きさを くらべられません（動かすと 止まります）。数として くらべるときは「${example || 'もし数（答え）が7より大きければ、'}」のように「数（答え）」と 書きます`);
        });
        // タイマーが30になるまで待つ: the timer goes up a little at a time and is hardly ever exactly 30.
        expressions(n, e => {
          if (e.kind !== 'CompareExpression' || e.op !== 'EQ') return;
          const [, other] = e.left?.kind === 'SensorRead' && e.left.sensor === 'タイマー' ? [e.left, e.right] : e.right?.kind === 'SensorRead' && e.right.sensor === 'タイマー' ? [e.right, e.left] : [];
          if (!numeric(other)) return;
          const value = text(other), example = n.kind === 'WaitUntil' ? `タイマーが${value}より大きくなるまで待つ` : n.kind === 'RepeatUntil' ? `タイマーが${value}より大きくなるまで、くり返す`
            : n.kind === 'RepeatWhile' ? `タイマーが${value}より小さいあいだ、くり返す` : `もしタイマーが${value}より大きければ、`;
          note('I124', n, `タイマーは こまごとに すすむので、ちょうど ${value}に ならない ことが あります${['WaitUntil', 'RepeatUntil'].includes(n.kind) ? '（待つのが 終わらない ことが あります）' : ''}。「${example}」と 書きます`);
        });
        // マウスがおされているあいだ in an おされたとき body: that body starts when the button is let go.
        if (item.event === 'click') expressions(n, (e, negated) => {
          if (!negated && e.kind === 'SensorRead' && e.sensor === 'マウスが押されている')
            note('I126', n, '「おされたとき」は マウスを はなしてから 始まるので、「マウスがおされているあいだ」は もう 成り立ちません。おしている あいだ 動かすときは、「作品を動かしたとき、」の 中で「ずっとくり返す。」と「もしマウスがおされていて、「マウス」にふれていれば、」を 使います');
        });
        // 「こんにちは」と言う。「さようなら」と言う。: an untimed 言う goes on at once, so the next speech (or the stop of the
        // work) comes before the first is seen (F-35).
        if (n.kind === 'Say' && n.seconds === undefined) {
          const next = (nodes || []).slice(nodes.indexOf(n) + 1).find(m => m && m.kind !== 'CommentLine');
          if (next && (next.kind === 'Say' || (next.kind === 'StopCommand' && next.op === 'ALL'))) {
            const said = n.value?.kind === 'StringLiteral' ? text(n.value) : '「…」';
            note('I130', n, `時間を 書かない「言う」は、すぐ 次の 文へ 進みます。ことばを じゅんばんに 見せるときは「${said}と2秒話す」と 書きます`);
          }
        }
        // ドの音を鳴らす with no sound named ド: the pitches are written in Hz.
        if (n.kind === 'SoundCommand' && ['SAMPLE', 'SAMPLE_WAIT'].includes(n.op)) {
          const arg = n.args?.[0], name = arg?.kind === 'StringLiteral' ? arg.value : null;
          if (name !== null && Object.hasOwn(SOLFEGE_HZ, name) && !project.sounds.some(s => s.name === name))
            note('I131', n, `この 作品には「${name}」という 音が ありません。ドレミの 高さで 鳴らすときは「${SOLFEGE_HZ[name]}Hzの音を0.5秒鳴らす」のように Hzで 書きます（ド 262、レ 294、ミ 330、ファ 349、ソ 392、ラ 440、シ 494）`);
        }
        // 名人: ねこと犬と鳥は、順番に、… starts them together; 候補から【一覧】を全部消す looks for the list itself.
        const listed = MEIJIN_LISTED_IN_ORDER.get(n);
        if (listed) note('I127', n, `「${listed.join('と')}は、順番に、」のように 主語を ならべた 文は、みんな いっしょに 始めます。一人ずつ じゅんばんに するときは、「なかまを、${listed.join('と')}にする。」と リストに 入れて、「なかまは、順番に、…」と 書きます`);
        if (n.kind === 'ListRemoveValue' && n.value?.kind === 'VariableRead' && dataNameExists(project, n.value.name, 'lists'))
          note('I128', n, `「${n.target.name}から【${n.value.name}】を全部消す」は、リストの 中に リスト【${n.value.name}】を さがすので、何も 消えません。リストの 中身を 一つずつ 消すときは、「【${n.value.name}】の中身を先頭から一つずつ見て、次のことを行う。」の 中に「${n.target.name}から今見ているものを全部消す。」と 書きます`);
        for (const key of ['body', 'thenBody', 'elseBody']) if (Array.isArray(n[key])) visitList(n[key], inLoop || NOTICE_LOOPS.has(n.kind));
        for (const lane of n.lanes || []) visitList(lane, inLoop);
      }
    };
    visitList(ast.body, false);
    // 名人: 「つぎの日の朝」になったとき、 has no condition in it (it stops at once when the work is run).
    const heading = ast.heading;
    if (heading?.event === 'conditionTrue' && ['StringLiteral', 'NumberLiteral', 'QuantityLiteral', 'ListLiteral'].includes(heading.condition?.kind))
      note('I129', { sourceSpan: { startLine: ast.sourceSpan?.startLine || 1, startColumn: 1 } }, `「${text(heading.condition)}になったとき、」には、何が そう なるかが ありません（動かすと すぐ 止まります）。何が そう なるかを 書きます。れい：場面が${text(heading.condition)}になったとき、`);
    return notes;
  }
  const dataNameExists = (project, name, kind) => [project.projectData, ...project.components.map(c => c.localData)].some(d => d[kind].some(x => x.name === name));
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
              message: `${item.meijin && !NOTICE_VERBS[m.kind] && !['MotionCommand', 'LooksCommand', 'PenCommand'].includes(m.kind) ? 'この 文は すぐ 行います' : other + 'は すぐ ' + (NOTICE_VERBS[m.kind] || '動きます')}（待つのは ${waiter}だけです）。${item.meijin ? 'この 本文 ぜんたいで' : 'みんなで'} 待つときは、「待つ」の 文に 主語を 書きません` };
            const key = note.where + '|' + note.line + '|' + note.column;
            if (!seen.has(key)) { seen.add(key); notes.push(note); }
            break;
          }
        });
      };
      walk(ast.body);
      for (const unit of ast.units || []) walk(unit.body);
      for (const note of [...fixedPlaceNotes(project, item, ast), ...silentWrongNotes(project, item, ast)]) {
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
              message: `「${word}」は あかりの「${word}」です。へんすう「${word}」を 読むときは【${word}】と 書きます` };
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
                message: `「${c.name}の${v.name}」は ${c.name}の 見た目です。へんすう「${v.name}」を かえるときは「${c.name}の【${v.name}】」と 書きます` };
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
              message: `「〜の名前」は 部品の 名前です。部品の へんすう「名前」を 読むときは「${named[0].name}の【名前】」のように【 】で かこみます` };
            const key = note.where + '|' + note.line + '|' + note.column + '|I102';
            if (!seen.has(key)) { seen.add(key); notes.push(note); }
          }
          for (const [k, v] of Object.entries(node)) if (k !== 'sourceSpan' && v && typeof v === 'object') visit(v);
        };
        visit(ast.body); for (const unit of ast.units || []) visit(unit.body);
      }
    }
    return notes;
  }

  // Independent of the formatter and block schema: executable hierarchy plus source-order comment anchors.
  function syntaxComparison(ast) {
    const consumedUnit = (node, key, i) => {
      if (key === 'count' && node.kind === 'RepeatCount') return '回';
      if (key === 'seconds' && ['WaitTime', 'Say', 'ContinuousRule', 'MotionCommand'].includes(node.kind)) return '秒';
      if (['x', 'y'].includes(key) && node.kind === 'MotionCommand') return '歩';
      if (key === 'distance' && node.kind === 'ContinuousRule') return '歩';
      if (key === 'index' && ['ListItemRead', 'ListInsert', 'ListReplace', 'ListDelete'].includes(node.kind)) return '番目';
      if (key !== 'args') return null;
      if (node.kind === 'MotionCommand' && !['POINT_TO', 'BOUNCE', 'GOTO_PART'].includes(node.op))
        return ['SET_DIRECTION', 'TURN_RIGHT', 'TURN_LEFT'].includes(node.op) ? '度' : '歩';
      if (node.kind === 'LooksCommand' && node.op === 'SET_SCALE') return '％';
      if (node.kind === 'SoundCommand')
        return node.op === 'SET_VOLUME' ? '％' : ['TONE', 'TONE_WAIT'].includes(node.op) ? i === 0 ? 'Hz' : '秒' : null;
      return null;
    };
    const shape = (value, roleUnit = null) => {
      if (Array.isArray(value)) return value.filter((x) => x?.kind !== 'CommentLine').map(x => shape(x));
      if (!value || typeof value !== 'object') return value;
      // Unit role annotations consumed at an effect boundary do not change a
      // stored value. Data expressions retain their units in this comparison.
      if (roleUnit && value.kind === 'QuantityLiteral' && value.unit === roleUnit)
        return shape(value.value, roleUnit);
      const out = {};
      for (const [key, child] of Object.entries(value)) {
        if (['sourceSpan', 'endLine', 'raw', 'source'].includes(key)) continue;
        // A group wait always means the broadcast just before it (LANGUAGE.md 439); the
        // reference name is derived from that position, so it is not part of the meaning.
        if (key === 'broadcastRef') continue;
        // A statement without a subject is 自分's; a wait without one is the whole flow's (みんな).
        if (key === 'actorRef' && child?.kind === (EVERYONE_WAITS.has(value.kind) ? 'all' : 'self')) continue;
        if (key === 'argumentNames' && Array.isArray(child) && child.length === 0) continue;
        // The subject's が is how the sentence is written, not what it does.
        if (key === 'particle' && value.kind === 'named') continue;
        // A script without rules has no rule list; an emptied block rule list is the same script.
        if (key === 'rules' && Array.isArray(child) && child.length === 0) continue;
        out[key] =
          key === 'qualifier' && child === 'exact' && bareName(value.name) ? null
            : key === 'args' && Array.isArray(child) ? child.map((arg, i) => shape(arg, consumedUnit(value, key, i)))
              : shape(child, consumedUnit(value, key));
      }
      return out;
    };
    const comments = [];
    const walk = (nodes) => {
      for (const node of nodes) {
        if (node.kind === 'CommentLine') {
          comments.push(['comment', node.text]);
          continue;
        }
        comments.push(['statement']);
        if (node.kind === 'IfStatement') {
          walk(node.thenBody);
          if (node.hasElse) {
            comments.push(['else']);
            walk(node.elseBody);
          }
        } else if (Array.isArray(node.body)) walk(node.body);
      }
    };
    if (ast.kind === 'Script') {walk(ast.body);for(const unit of ast.units||[])walk(unit.body);}
    else walk([ast]);
    return { execution: shape(ast), comments };
  }
  function astEquivalent(left, right) {
    return stableJson(syntaxComparison(left)) === stableJson(syntaxComparison(right));
  }
  function stableJson(v) {
    if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
    if (v && typeof v === 'object') {
      return (
        '{' +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + stableJson(v[k]))
          .join(',') +
        '}'
      );
    }
    return JSON.stringify(v);
  }

  function u16le(b, o) {
    if (o + 2 > b.length) throw new AkariError('F509', 'ファイルの 中身が、とちゅうで 切れています。ほかの ファイルを えらんでください');
    return b[o] | (b[o + 1] << 8);
  }
  function u32le(b, o) {
    if (o + 4 > b.length) throw new AkariError('F509', 'ファイルの 中身が、とちゅうで 切れています。ほかの ファイルを えらんでください');
    return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] * 0x1000000)) >>> 0;
  }
  function u16be(b, o) {
    if (o + 2 > b.length) throw new AkariError('F509', 'ファイルの 中身が、とちゅうで 切れています。ほかの ファイルを えらんでください');
    return (b[o] << 8) | b[o + 1];
  }
  function u32be(b, o) {
    if (o + 4 > b.length) throw new AkariError('F509', 'ファイルの 中身が、とちゅうで 切れています。ほかの ファイルを えらんでください');
    return (b[o] * 0x1000000 + b[o + 1] * 0x10000 + b[o + 2] * 0x100 + b[o + 3]) >>> 0;
  }
  function ascii(b, o, n) {
    if (o + n > b.length) return '';
    return String.fromCharCode(...b.subarray(o, o + n));
  }
  function checkImageLimits(w, h) {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1)
      throw new AkariError('F510', '絵の たてと よこの 大きさが、正しく ありません。ほかの 絵を えらんでください');
    if (w > LIMITS.imageWidth || h > LIMITS.imageHeight || w * h > LIMITS.imagePixels)
      throw new AkariError('F504', '絵が 大きすぎます。もっと 小さい 絵を えらんでください');
  }
  function sniffImage(bytes) {
    if (
      bytes.length >= 24 &&
      bytes[0] === 0x89 &&
      ascii(bytes, 1, 3) === 'PNG' &&
      bytes[4] === 13 &&
      bytes[5] === 10 &&
      bytes[6] === 26 &&
      bytes[7] === 10
    ) {
      if (u32be(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== 'IHDR')
        throw new AkariError('F510', 'この 絵の ファイルは、こわれているようです。ほかの 絵を えらんでください');
      const w = u32be(bytes, 16),
        h = u32be(bytes, 20);
      checkImageLimits(w, h);
      let pos = 8,
        actl = false;
      while (pos + 12 <= bytes.length) {
        const len = u32be(bytes, pos),
          end = pos + 12 + len;
        if (end > bytes.length) throw new AkariError('F509', 'この 絵の ファイルは、こわれているようです。ほかの 絵を えらんでください');
        const type = ascii(bytes, pos + 4, 4);
        if (type === 'acTL') actl = true;
        pos = end;
        if (type === 'IEND') break;
      }
      if (actl) throw new AkariError('F509', '動く 絵（アニメーション）は 使えません。動かない 絵を えらんでください');
      return { mime: 'image/png', width: w, height: h };
    }
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      let pos = 2,
        w = 0,
        h = 0;
      const sof = new Set([
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
      ]);
      while (pos < bytes.length) {
        while (pos < bytes.length && bytes[pos] === 0xff) pos++;
        if (pos >= bytes.length) break;
        const m = bytes[pos++];
        if (m === 0xd9) break;
        if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue;
        if (pos + 2 > bytes.length) throw new AkariError('F509', 'この 絵の ファイルは、こわれているようです。ほかの 絵を えらんでください');
        const len = u16be(bytes, pos);
        if (len < 2 || pos + len > bytes.length)
          throw new AkariError('F509', 'この 絵の ファイルは、こわれているようです。ほかの 絵を えらんでください');
        if (sof.has(m)) {
          if (len < 7) throw new AkariError('F510', 'この 絵の ファイルは、こわれているようです。ほかの 絵を えらんでください');
          h = u16be(bytes, pos + 3);
          w = u16be(bytes, pos + 5);
          break;
        }
        if (m === 0xda) break;
        pos += len;
      }
      if (!w || !h) throw new AkariError('F510', 'この 絵の 大きさが 読みとれません。ほかの 絵を えらんでください');
      checkImageLimits(w, h);
      return { mime: 'image/jpeg', width: w, height: h };
    }
    if (bytes.length >= 20 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
      const riff = u32le(bytes, 4);
      if (riff + 8 > bytes.length) throw new AkariError('F509', 'この 絵の ファイルは、こわれているようです。ほかの 絵を えらんでください');
      let pos = 12,
        w = 0,
        h = 0,
        animated = false;
      while (pos + 8 <= bytes.length) {
        const type = ascii(bytes, pos, 4),
          len = u32le(bytes, pos + 4),
          ps = pos + 8,
          end = ps + len;
        if (end > bytes.length) throw new AkariError('F509', 'この 絵の ファイルは、こわれているようです。ほかの 絵を えらんでください');
        if (type === 'ANIM' || type === 'ANMF') animated = true;
        if (type === 'VP8X') {
          if (len < 10) throw new AkariError('F510', 'この 絵の ファイルは、こわれているようです。ほかの 絵を えらんでください');
          if (bytes[ps] & 0x02) animated = true;
          w = 1 + bytes[ps + 4] + (bytes[ps + 5] << 8) + (bytes[ps + 6] << 16);
          h = 1 + bytes[ps + 7] + (bytes[ps + 8] << 8) + (bytes[ps + 9] << 16);
        } else if (type === 'VP8L' && !w) {
          if (len < 5 || bytes[ps] !== 0x2f) throw new AkariError('F510', 'この 絵の ファイルは、こわれているようです。ほかの 絵を えらんでください');
          const b1 = bytes[ps + 1],
            b2 = bytes[ps + 2],
            b3 = bytes[ps + 3],
            b4 = bytes[ps + 4];
          w = 1 + (b1 | ((b2 & 0x3f) << 8));
          h = 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10));
        } else if (type === 'VP8 ' && !w) {
          if (
            len < 10 ||
            bytes[ps + 3] !== 0x9d ||
            bytes[ps + 4] !== 0x01 ||
            bytes[ps + 5] !== 0x2a
          )
            throw new AkariError('F510', 'この 絵の ファイルは、こわれているようです。ほかの 絵を えらんでください');
          w = u16le(bytes, ps + 6) & 0x3fff;
          h = u16le(bytes, ps + 8) & 0x3fff;
        }
        pos = end + (len & 1);
      }
      if (animated) throw new AkariError('F509', '動く 絵（アニメーション）は 使えません。動かない 絵を えらんでください');
      if (!w || !h) throw new AkariError('F510', 'この 絵の 大きさが 読みとれません。ほかの 絵を えらんでください');
      checkImageLimits(w, h);
      return { mime: 'image/webp', width: w, height: h };
    }
    throw new AkariError('F509', 'この ファイルは 絵として 使えません。ほかの 絵の ファイルを えらんでください', 0, 0, '使える 絵の ファイル：PNG / JPEG / WebP');
  }
  function parseWav(bytes) {
    if (bytes.length < 44 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE')
      throw new AkariError('F509', 'この 音の ファイルは、こわれているようです。ほかの 音を えらんでください');
    const riff = u32le(bytes, 4);
    if (riff + 8 > bytes.length) throw new AkariError('F511', 'この 音の ファイルは、こわれているようです。ほかの 音を えらんでください');
    let pos = 12,
      fmt = null,
      data = null;
    while (pos + 8 <= bytes.length) {
      const type = ascii(bytes, pos, 4),
        len = u32le(bytes, pos + 4),
        ps = pos + 8,
        end = ps + len;
      if (end > bytes.length) throw new AkariError('F511', 'この 音の ファイルは、こわれているようです。ほかの 音を えらんでください');
      if (type === 'fmt ') {
        if (fmt) throw new AkariError('F511', 'この 音の ファイルは、こわれているようです。ほかの 音を えらんでください');
        if (len < 16) throw new AkariError('F511', 'この 音の ファイルは、こわれているようです。ほかの 音を えらんでください');
        fmt = {
          audioFormat: u16le(bytes, ps),
          channels: u16le(bytes, ps + 2),
          sampleRate: u32le(bytes, ps + 4),
          byteRate: u32le(bytes, ps + 8),
          blockAlign: u16le(bytes, ps + 12),
          bitsPerSample: u16le(bytes, ps + 14),
        };
      } else if (type === 'data') {
        if (data) throw new AkariError('F511', 'この 音の ファイルは、こわれているようです。ほかの 音を えらんでください');
        data = bytes.slice(ps, end);
      }
      pos = end + (len & 1);
    }
    if (!fmt || !data) throw new AkariError('F511', 'この 音の ファイルは、こわれているようです。ほかの 音を えらんでください');
    if (fmt.audioFormat !== 1) throw new AkariError('F509', 'この 音の ファイルは、使えない 形です。ほかの 音を えらんでください');
    if (![8, 16, 24, 32].includes(fmt.bitsPerSample))
      throw new AkariError('F511', 'この 音の ファイルは、使えない 形です。ほかの 音を えらんでください');
    if (
      !fmt.channels ||
      !fmt.sampleRate ||
      !fmt.blockAlign ||
      !data.length ||
      data.length % fmt.blockAlign !== 0 ||
      fmt.blockAlign !== (fmt.channels * fmt.bitsPerSample) / 8 ||
      fmt.byteRate !== fmt.sampleRate * fmt.blockAlign
    )
      throw new AkariError('F511', 'この 音の ファイルは、こわれているようです。ほかの 音を えらんでください');
    return { ...fmt, data };
  }
  function rebuildCanonicalWav(parsed) {
    const size = 44 + parsed.data.length + (parsed.data.length & 1),
      out = new Uint8Array(size),
      dv = new DataView(out.buffer),
      put = (o, t) => {
        for (let i = 0; i < t.length; i++) out[o + i] = t.charCodeAt(i);
      };
    put(0, 'RIFF');
    dv.setUint32(4, size - 8, true);
    put(8, 'WAVE');
    put(12, 'fmt ');
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, parsed.channels, true);
    dv.setUint32(24, parsed.sampleRate, true);
    dv.setUint32(28, parsed.byteRate, true);
    dv.setUint16(32, parsed.blockAlign, true);
    dv.setUint16(34, parsed.bitsPerSample, true);
    put(36, 'data');
    dv.setUint32(40, parsed.data.length, true);
    out.set(parsed.data, 44);
    return out;
  }
  function parseMp3FrameMeta(bytes) {
    if (bytes.length < 4 || bytes[0] !== 0xff || (bytes[1] & 0xe0) !== 0xe0)
      throw new AkariError('F511', 'この 音の ファイルは、音として 読みとれません。ほかの 音を えらんでください');
    const ver = (bytes[1] >> 3) & 3,
      layer = (bytes[1] >> 1) & 3,
      br = (bytes[2] >> 4) & 15,
      sri = (bytes[2] >> 2) & 3;
    if (ver === 1 || layer !== 1 || br === 0 || br === 15 || sri === 3)
      throw new AkariError('F511', 'この 音の ファイルは、音として 読みとれません。ほかの 音を えらんでください');
    const base = [44100, 48000, 32000][sri],
      sampleRate = ver === 3 ? base : ver === 2 ? base / 2 : base / 4,
      channels = ((bytes[3] >> 6) & 3) === 3 ? 1 : 2;
    return { sampleRate, channels };
  }
  function stripMp3Metadata(bytes) {
    let start = 0,
      end = bytes.length;
    if (bytes.length >= 10 && ascii(bytes, 0, 3) === 'ID3') {
      for (let i = 6; i < 10; i++)
        if (bytes[i] & 0x80) throw new AkariError('F511', 'この 音の ファイルは、こわれているようです。ほかの 音を えらんでください');
      const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9],
        footer = bytes[3] === 4 && bytes[5] & 0x10 ? 10 : 0;
      start = 10 + size + footer;
      if (start > end) throw new AkariError('F511', 'この 音の ファイルは、こわれているようです。ほかの 音を えらんでください');
    }
    if (end - start >= 128 && ascii(bytes, end - 128, 3) === 'TAG') end -= 128;
    const out = bytes.slice(start, end);
    parseMp3FrameMeta(out);
    return out;
  }
  function parseFlac(bytes) {
    const bad = () => { throw new AkariError('F511', 'この 音の ファイルは、こわれているようです。ほかの 音を えらんでください'); };
    let pos = 4, stream = null, last = false;
    while (!last) {
      if (pos + 4 > bytes.length) bad();
      const type = bytes[pos] & 127, size = (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
      last = !!(bytes[pos] & 128);
      if (type === 127 || pos + 4 + size > bytes.length || (!stream && type !== 0)) bad();
      if (type === 0) {
        if (stream || size !== 34) bad();
        stream = bytes.slice(pos + 4, pos + 38);
      }
      pos += 4 + size;
    }
    if (!stream || pos + 2 > bytes.length || bytes[pos] !== 255 || (bytes[pos + 1] & 254) !== 248) bad();
    const sampleRate = (stream[10] << 12) | (stream[11] << 4) | (stream[12] >> 4),
      channels = ((stream[12] >> 1) & 7) + 1,
      bits = (((stream[12] & 1) << 4) | (stream[13] >> 4)) + 1,
      samples = (stream[13] & 15) * 4294967296 + u32be(stream, 14);
    if (u16be(stream, 0) < 16 || u16be(stream, 2) < u16be(stream, 0) || bits < 4 || bits > 32) bad();
    const clean = new Uint8Array(42 + bytes.length - pos);
    clean.set([102, 76, 97, 67, 128, 0, 0, 34]);
    clean.set(stream, 8); clean.set(bytes.subarray(pos), 42);
    return { mime: 'audio/flac', clean, frameMeta: { sampleRate, channels },
      duration: samples ? samples / sampleRate : null };
  }
  function parseOggOpus(bytes) {
    const bad = () => { throw new AkariError('F511', 'この 音の ファイルは、こわれているようです。ほかの 音を えらんでください'); };
    const table = Uint32Array.from({ length: 256 }, (_, n) => {
      let crc = n << 24;
      for (let i = 0; i < 8; i++) crc = (crc << 1) ^ (crc & 0x80000000 ? 0x04c11db7 : 0);
      return crc >>> 0;
    });
    const crc = (data, start, end) => {
      let value = 0;
      for (let p = start; p < end; p++) {
        const byte = p >= start + 22 && p < start + 26 ? 0 : data[p];
        value = ((value << 8) ^ table[((value >>> 24) ^ byte) & 255]) >>> 0;
      }
      return value;
    };
    const pages = [], packets = [], clean = bytes.slice();
    let pos = 0, serial = null, sequence = 0, parts = [], packetSize = 0, count = 0,
      ended = false, finalGranule = null, previousGranule = 0;
    while (pos < bytes.length) {
      if (ended || pos + 27 > bytes.length || ascii(bytes, pos, 4) !== 'OggS' || bytes[pos + 4] !== 0) bad();
      const flags = bytes[pos + 5], segments = bytes[pos + 26], headerEnd = pos + 27 + segments,
        stream = u32le(bytes, pos + 14), seq = u32le(bytes, pos + 18);
      if (flags & ~7 || headerEnd > bytes.length || !segments) bad();
      if (serial === null) { serial = stream; if (flags !== 2 || seq !== 0) bad(); }
      else if (stream !== serial || flags & 2) bad();
      if (seq !== sequence++ || !!(flags & 1) !== !!parts.length) bad();
      let end = headerEnd;
      for (let i = 0; i < segments; i++) end += bytes[pos + 27 + i];
      if (end > bytes.length || crc(bytes, pos, end) !== u32le(bytes, pos + 22)) bad();
      let body = headerEnd;
      for (let i = 0; i < segments; i++) {
        const size = bytes[pos + 27 + i];
        parts.push([body, size]); packetSize += size; body += size;
        if (size < 255) {
          if (!packetSize) bad();
          if (count < 2) {
            const packet = new Uint8Array(packetSize); let at = 0;
            for (const [start, length] of parts) { packet.set(bytes.subarray(start, start + length), at); at += length; }
            packets.push({ bytes: packet, parts });
          }
          count++; parts = []; packetSize = 0;
        }
      }
      const lo = u32le(bytes, pos + 6), hi = u32le(bytes, pos + 10);
      const granule = hi === 0xffffffff && lo === 0xffffffff ? null : hi * 4294967296 + lo;
      if (granule !== null) {
        if (!Number.isSafeInteger(granule) || granule < previousGranule) bad();
        previousGranule = granule;
      }
      if (pages.length === 0 && (count !== 1 || parts.length || granule !== 0)) bad();
      ended = !!(flags & 4); if (ended) finalGranule = granule;
      pages.push([pos, end]); pos = end;
    }
    if (!ended || parts.length || count < 3 || finalGranule === null) bad();
    const head = packets[0].bytes, tags = packets[1].bytes;
    if (head.length < 19 || ascii(head, 0, 8) !== 'OpusHead')
      throw new AkariError('F509', 'この 音の ファイルは、使えない 形です。ほかの 音を えらんでください');
    if (head[8] < 1 || head[8] > 15 || head[9] < 1) bad();
    const channels = head[9], mapping = head[18], preSkip = u16le(head, 10);
    if (mapping === 0) { if (channels > 2 || (head[8] === 1 && head.length !== 19)) bad(); }
    else {
      if (mapping !== 1 || head.length < 21 + channels || !head[19] || head[20] > head[19]) bad();
      for (let i = 0; i < channels; i++) if (head[21 + i] !== 255 && head[21 + i] >= head[19] + head[20]) bad();
    }
    if (tags.length < 16 || ascii(tags, 0, 8) !== 'OpusTags') bad();
    let tagPos = 12 + u32le(tags, 8);
    if (tagPos + 4 > tags.length) bad();
    const comments = u32le(tags, tagPos); tagPos += 4;
    if (comments > (tags.length - tagPos) / 4) bad();
    for (let i = 0; i < comments; i++) {
      if (tagPos + 4 > tags.length) bad();
      const size = u32le(tags, tagPos); tagPos += 4 + size;
      if (tagPos > tags.length) bad();
    }
    // Keep packet/page boundaries and granule positions; replace comments and
    // vendor data with a valid empty OpusTags packet plus zero padding.
    const empty = new Uint8Array(tags.length); empty.set([79,112,117,115,84,97,103,115]);
    let at = 0;
    for (const [start, length] of packets[1].parts) { clean.set(empty.subarray(at, at + length), start); at += length; }
    for (const [start, end] of pages) new DataView(clean.buffer).setUint32(start + 22, crc(clean, start, end), true);
    if (finalGranule <= preSkip) bad();
    return { mime: 'audio/ogg', clean, frameMeta: { channels, sampleRate: 48000 },
      duration: (finalGranule - preSkip) / 48000 };
  }
  function parseM4a(bytes) {
    const bad = () => { throw new AkariError('F511', 'この 音の ファイルは、こわれているようです。ほかの 音を えらんでください'); };
    const unsupported = () => { throw new AkariError('F509', 'この 音の ファイルは、使えない 形です。ほかの 音を えらんでください'); };
    const boxes = (start, end) => {
      const result = [];
      while (start < end) {
        if (start + 8 > end) bad();
        let size = u32be(bytes, start), header = 8;
        if (size === 1) {
          if (start + 16 > end) bad();
          size = u32be(bytes, start + 8) * 4294967296 + u32be(bytes, start + 12); header = 16;
        } else if (size === 0) size = end - start;
        if (!Number.isSafeInteger(size) || size < header || start + size > end) bad();
        result.push({ type: ascii(bytes, start + 4, 4), start, data: start + header, end: start + size });
        start += size;
      }
      return result;
    };
    const one = (list, type) => { const found = list.filter(b => b.type === type); if (found.length !== 1) bad(); return found[0]; };
    const children = box => boxes(box.data, box.end);
    const top = boxes(0, bytes.length), ftyp = one(top, 'ftyp'), moov = one(top, 'moov'),
      mdats = top.filter(b => b.type === 'mdat');
    if (top[0] !== ftyp || ftyp.end - ftyp.data < 8 || (ftyp.end - ftyp.data) % 4 || !mdats.length) bad();
    const brands = [ascii(bytes, ftyp.data, 4)];
    for (let p = ftyp.data + 8; p < ftyp.end; p += 4) brands.push(ascii(bytes, p, 4));
    if (!brands.some(b => ['M4A ', 'isom', 'iso2', 'mp41', 'mp42'].includes(b)) || top.some(b => b.type === 'moof')) unsupported();
    const movie = children(moov), tracks = movie.filter(b => b.type === 'trak');
    if (tracks.length !== 1 || movie.some(b => b.type === 'mvex')) unsupported();
    const track = children(tracks[0]), mdia = one(track, 'mdia'), media = children(mdia),
      hdlr = one(media, 'hdlr'), mdhd = one(media, 'mdhd');
    if (hdlr.end - hdlr.data < 24 || ascii(bytes, hdlr.data + 8, 4) !== 'soun') unsupported();
    const minf = one(media, 'minf'), mediaInfo = children(minf), stbl = one(mediaInfo, 'stbl'),
      table = children(stbl), stsd = one(table, 'stsd');
    if (stsd.data + 8 > stsd.end || u32be(bytes, stsd.data) !== 0 || u32be(bytes, stsd.data + 4) !== 1) unsupported();
    const entries = boxes(stsd.data + 8, stsd.end), entry = one(entries, 'mp4a'), p = entry.data;
    if (entries.length !== 1 || p + 28 > entry.end) bad();
    const entryVersion = u16be(bytes, p + 8);
    if (entryVersion > 1) unsupported();
    const entryChildren = boxes(p + 28 + (entryVersion === 1 ? 16 : 0), entry.end), esds = one(entryChildren, 'esds');
    const descriptor = (start, end) => {
      if (start >= end) bad();
      const type = bytes[start++]; let size = 0, terminated = false;
      for (let i = 0; i < 4; i++) {
        if (start >= end) bad();
        const byte = bytes[start++]; size = size * 128 + (byte & 127);
        if (!(byte & 128)) { terminated = true; break; }
      }
      if (!terminated || start + size > end) bad();
      return { type, data: start, end: start + size };
    };
    if (esds.data + 4 > esds.end || u32be(bytes, esds.data) !== 0) bad();
    const es = descriptor(esds.data + 4, esds.end);
    if (es.type !== 3 || es.data + 3 > es.end) bad();
    const flags = bytes[es.data + 2]; let at = es.data + 3;
    if (flags & 128) at += 2;
    if (flags & 64) { if (at >= es.end) bad(); at += 1 + bytes[at]; }
    if (flags & 32) at += 2;
    const config = descriptor(at, es.end);
    if (config.type !== 4 || config.data + 13 > config.end) bad();
    if (bytes[config.data] !== 0x40 || (bytes[config.data + 1] >> 2) !== 5) unsupported();
    const asc = descriptor(config.data + 13, config.end);
    if (asc.type !== 5) bad();
    let bit = asc.data * 8;
    const read = n => {
      if (bit + n > asc.end * 8) bad(); let value = 0;
      while (n--) { value = value * 2 + ((bytes[bit >> 3] >> (7 - (bit & 7))) & 1); bit++; }
      return value;
    };
    const objectType = read(5), rateIndex = read(4),
      sampleRate = rateIndex === 15 ? read(24) : [96000,88200,64000,48000,44100,32000,24000,22050,16000,12000,11025,8000,7350][rateIndex],
      channels = read(4);
    if (objectType !== 2 || !sampleRate || ![1,2].includes(channels)) unsupported();
    read(1); if (read(1) || read(1)) unsupported();
    if (asc.end * 8 - bit >= 11) {
      if (read(11) !== 0x2b7 || read(5) !== 5 || read(1)) unsupported();
    }
    while (bit < asc.end * 8) if (read(1)) unsupported();
    const stsz = one(table, 'stsz'), stsc = one(table, 'stsc'), stts = one(table, 'stts'),
      offsets = table.filter(b => b.type === 'stco' || b.type === 'co64');
    if (offsets.length !== 1 || stsz.data + 12 > stsz.end || stsc.data + 8 > stsc.end || stts.data + 8 > stts.end) bad();
    const size = u32be(bytes, stsz.data + 4), sampleCount = u32be(bytes, stsz.data + 8),
      chunkMapCount = u32be(bytes, stsc.data + 4), times = u32be(bytes, stts.data + 4), offset = offsets[0], width = offset.type === 'stco' ? 4 : 8;
    if (offset.data + 8 > offset.end) bad();
    const chunks = u32be(bytes, offset.data + 4);
    if (!sampleCount || sampleCount > bytes.length || !chunks || !chunkMapCount || !times ||
      stsz.end !== stsz.data + 12 + (size ? 0 : sampleCount * 4) ||
      stsc.end !== stsc.data + 8 + chunkMapCount * 12 || stts.end !== stts.data + 8 + times * 8 ||
      offset.end !== offset.data + 8 + chunks * width) bad();
    const chunkMap = [];
    for (let i = 0; i < chunkMapCount; i++) {
      const start = stsc.data + 8 + i * 12, first = u32be(bytes, start), perChunk = u32be(bytes, start + 4);
      if (!first || first > chunks || !perChunk || perChunk > sampleCount || u32be(bytes, start + 8) !== 1 ||
        (i === 0 ? first !== 1 : first <= chunkMap[i - 1].first)) bad();
      chunkMap.push({ first, perChunk });
    }
    let sample = 0, mapIndex = 0;
    const ranges = [];
    for (let i = 1; i <= chunks; i++) {
      if (mapIndex + 1 < chunkMap.length && i === chunkMap[mapIndex + 1].first) mapIndex++;
      const start = offset.data + 8 + (i - 1) * width;
      let address = width === 4 ? u32be(bytes, start) : u32be(bytes, start) * 4294967296 + u32be(bytes, start + 4);
      const chunkStart = address;
      for (let n = 0; n < chunkMap[mapIndex].perChunk; n++) {
        if (sample >= sampleCount) bad();
        const length = size || u32be(bytes, stsz.data + 12 + sample * 4); sample++;
        if (!length) bad(); address += length;
      }
      if (!Number.isSafeInteger(address) || !mdats.some(b => chunkStart >= b.data && address <= b.end)) bad();
      ranges.push([chunkStart, address]);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < ranges.length; i++) if (ranges[i][0] < ranges[i - 1][1]) bad();
    let totalSamples = 0;
    for (let i = 0; i < times; i++) {
      const count = u32be(bytes, stts.data + 8 + i * 8), delta = u32be(bytes, stts.data + 12 + i * 8);
      if (!count || !delta) bad(); totalSamples += count;
    }
    if (sample !== sampleCount || totalSamples !== sampleCount) bad();
    const clean = bytes.slice(), zeroBox = box => {
      clean.set([102,114,101,101], box.start + 4); clean.fill(0, box.data, box.end);
    };
    // Replacing metadata by same-sized free boxes preserves every chunk offset.
    const sanitize = (list, allowed) => { for (const box of list) if (!allowed.includes(box.type)) zeroBox(box); };
    sanitize(top, ['ftyp','moov','mdat']); sanitize(movie, ['mvhd','trak']);
    sanitize(track, ['tkhd','edts','mdia']); sanitize(media, ['mdhd','hdlr','minf']);
    sanitize(mediaInfo, ['smhd','dinf','stbl']);
    sanitize(table, ['stsd','stts','stsc','stsz','stco','co64','ctts','stss','sgpd','sbgp']);
    sanitize(entryChildren, ['esds','btrt']);
    for (const box of [...movie, ...track, mdhd]) if (['mvhd','tkhd','mdhd'].includes(box.type)) {
      const length = bytes[box.data] === 0 ? 8 : bytes[box.data] === 1 ? 16 : 0;
      if (!length || box.data + 4 + length > box.end) bad();
      clean.fill(0, box.data + 4, box.data + 4 + length);
    }
    clean.fill(0, hdlr.data + 24, hdlr.end);
    for (const box of track.filter(b => b.type === 'edts')) sanitize(children(box), ['elst']);
    for (const box of mediaInfo.filter(b => b.type === 'dinf')) {
      const list = children(box), dref = one(list, 'dref'); sanitize(list, ['dref']);
      if (dref.data + 8 > dref.end || u32be(bytes, dref.data + 4) !== 1) bad();
      const refs = boxes(dref.data + 8, dref.end);
      if (refs.length !== 1 || refs[0].type !== 'url ' || refs[0].end - refs[0].data !== 4 || u32be(bytes, refs[0].data) !== 1) unsupported();
    }
    return { mime: 'audio/mp4', clean, frameMeta: { channels, sampleRate } };
  }
  function sniffAudio(bytes) {
    if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE')
      return { mime: 'audio/wav', parsed: parseWav(bytes) };
    if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'fLaC') return parseFlac(bytes);
    if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'OggS') return parseOggOpus(bytes);
    if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') return parseM4a(bytes);
    const id3 = bytes.length >= 10 && ascii(bytes, 0, 3) === 'ID3',
      frame = bytes.length >= 4 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    if (!id3 && !frame) throw new AkariError('F509', 'この ファイルは 音として 使えません。ほかの 音の ファイルを えらんでください', 0, 0, '使える 音の ファイル：MP3 / PCM WAV / M4A（AAC-LC）/ FLAC / Ogg Opus');
    const clean = stripMp3Metadata(bytes);
    return { mime: 'audio/mpeg', clean, frameMeta: parseMp3FrameMeta(clean) };
  }
  function audioContainerMeta(sn) {
    return sn.mime === 'audio/wav'
      ? { channels: sn.parsed.channels, sampleRate: sn.parsed.sampleRate }
      : sn.frameMeta;
  }
  function checkAudioContainerLimits(m) {
    if (!m || !Number.isInteger(m.channels) || m.channels < 1 || m.channels > LIMITS.audioChannels)
      throw new AkariError('F511', 'この 音の ファイルは、使えない 形です。ほかの 音を えらんでください');
    if (
      !Number.isInteger(m.sampleRate) ||
      m.sampleRate < LIMITS.audioSampleRateMin ||
      m.sampleRate > LIMITS.audioSampleRateMax
    )
      throw new AkariError('F511', 'この 音の ファイルは、使えない 形です。ほかの 音を えらんでください');
  }

  function awaitMedia(promise, code, disposeLate = null) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(
          new AkariError(
            code,
            '絵や音を 読みこむのに 10秒より 長く かかったので、やめました。もう 一度 ためすか、小さい ファイルを えらんでください',
          ),
        );
      }, 10000);
      Promise.resolve(promise).then(
        (value) => {
          if (settled) {
            disposeLate?.(value);
            return;
          }
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  async function decodeImageBytes(bytes, mime) {
    const blob = new Blob([bytes], { type: mime });
    let bitmap = null,
      img = null,
      url = null;
    try {
      if (typeof createImageBitmap === 'function') {
        bitmap = await awaitMedia(
          createImageBitmap(blob, { imageOrientation: 'from-image' }),
          'F510',
          (value) => value.close?.(),
        );
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          close: () => bitmap.close?.(),
        };
      }
      url = URL.createObjectURL(blob);
      img = new Image();
      img.src = url;
      await awaitMedia(img.decode(), 'F510');
      return {
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        close: () => URL.revokeObjectURL(url),
      };
    } catch (e) {
      if (url) URL.revokeObjectURL(url);
      throw new AkariError('F510', 'この 絵を 読みとれません。ほかの 絵を えらんでください', 0, 0, e?.message || '');
    }
  }
  async function canonicalizeImage(fileBytes) {
    const bytes = fileBytes instanceof Uint8Array ? fileBytes : new Uint8Array(fileBytes);
    if (bytes.length > LIMITS.importFileBytes)
      throw new AkariError('F504', 'この ファイルは 大きすぎて 使えません。もっと 小さい ファイルを えらんでください', 0, 0, `入れられるファイルは${LIMITS.importFileBytes / 1048576}MiBまで`);
    const pre = sniffImage(bytes),
      dec = await decodeImageBytes(bytes, pre.mime);
    try {
      checkImageLimits(dec.width, dec.height);
      const canvas = document.createElement('canvas');
      canvas.width = dec.width;
      canvas.height = dec.height;
      const cx = canvas.getContext('2d', { alpha: true });
      cx.drawImage(dec.source, 0, 0);
      const quality = pre.mime === 'image/png' ? undefined : 0.92;
      const blob = await awaitMedia(
        new Promise((res) => canvas.toBlob(res, pre.mime, quality)),
        'F510',
      );
      if (!blob || blob.type !== pre.mime)
        throw new AkariError('F510', 'この 絵を、あかりで 使える 形に できませんでした。ほかの 絵を えらんでください');
      const out = new Uint8Array(await blob.arrayBuffer());
      if (out.length > LIMITS.imageBytes)
        throw new AkariError('F504', 'この 絵は、あかりで 使える 形に すると 大きすぎます。もっと 小さい 絵を えらんでください', 0, 0, '使える形にした絵は4MiBまで');
      const post = sniffImage(out),
        check = await decodeImageBytes(out, post.mime);
      try {
        if (check.width !== post.width || check.height !== post.height)
          throw new AkariError('F510', 'この 絵を あかりで 使える 形に したら、大きさが かわってしまいました。ほかの 絵を えらんでください');
      } finally {
        check.close();
      }
      return { mime: post.mime, bytes: out, width: post.width, height: post.height };
    } finally {
      dec.close();
    }
  }
  async function audioContextForValidation() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) throw new AkariError('R415', 'この ブラウザでは 音を 使えません。ほかの ブラウザで ためしてください');
    return new AC();
  }
  async function decodeAudioMeta(bytes) {
    const ac = await audioContextForValidation();
    try {
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        buf = await awaitMedia(ac.decodeAudioData(copy), 'F511');
      return { duration: buf.duration, channels: buf.numberOfChannels, sampleRate: buf.sampleRate };
    } catch (e) {
      throw new AkariError('F511', 'この 音を 読みとれません。ほかの 音を えらんでください', 0, 0, e?.message || '');
    } finally {
      try {
        await awaitMedia(ac.close(), 'F511');
      } catch (_) {}
    }
  }
  function checkAudioLimits(m) {
    if (!(m.duration > 0) || m.duration > LIMITS.audioDuration)
      throw new AkariError(
        m.duration > LIMITS.audioDuration ? 'F504' : 'F511',
        'この 音は 長すぎるか、長さが 読みとれません。ほかの 音を えらんでください',
      );
    checkAudioContainerLimits(m);
  }
  async function canonicalizeAudio(fileBytes) {
    const bytes = fileBytes instanceof Uint8Array ? fileBytes : new Uint8Array(fileBytes);
    if (bytes.length > LIMITS.importFileBytes)
      throw new AkariError('F504', 'この ファイルは 大きすぎて 使えません。もっと 小さい ファイルを えらんでください', 0, 0, `入れられるファイルは${LIMITS.importFileBytes / 1048576}MiBまで`);
    const sn = sniffAudio(bytes),
      containerMeta = audioContainerMeta(sn);
    checkAudioContainerLimits(containerMeta);
    if (sn.duration != null) checkAudioLimits({ ...containerMeta, duration: sn.duration });
    const out = sn.mime === 'audio/wav' ? rebuildCanonicalWav(sn.parsed) : sn.clean;
    if (out.length > LIMITS.audioBytes)
      throw new AkariError('F504', 'この 音は、あかりで 使える 形に すると 大きすぎます。もっと 短い 音を えらんでください', 0, 0, '使える形にした音は6MiBまで');
    const decoded = await decodeAudioMeta(out);
    if (decoded.channels !== containerMeta.channels)
      throw new AkariError('F511', 'この 音の ファイルは、中身が 合っていません。ほかの 音を 使ってください');
    if (sn.duration != null && Math.abs(decoded.duration - sn.duration) > 0.02)
      throw new AkariError('F511', 'この 音の ファイルは、書いてある 長さと 本当の 長さが 合いません。ほかの 音を 使ってください');
    const meta = {
      duration: decoded.duration,
      channels: containerMeta.channels,
      sampleRate: containerMeta.sampleRate,
    };
    checkAudioLimits(meta);
    return { mime: sn.mime, bytes: out, ...meta };
  }

  function collectReachableAssetIds(project) {
    const ids = new Set();
    for (const b of project.stage.backdrops) if (b.kind === 'image') ids.add(b.assetId);
    for (const c of project.components)
      if (c.type === 'sprite')
        for (const co of c.costumes) if (co.kind === 'image') ids.add(co.assetId);
    for (const snd of project.sounds) ids.add(snd.assetId);
    return ids;
  }
  function assetStateFingerprint(project, store) {
    const meta = [...collectReachableAssetIds(project)].sort().map((id) => {
      const a = store.get(id);
      return a ? `${a.id}:${a.kind}:${a.mime}:${a.byteLength}:${a.sha256}` : `${id}:MISSING`;
    });
    // Producer metadata is not an edit to the child's work.
    const { appVersion: producerLabel, ...content } = project;
    return stableJson(content) + '|' + meta.join('|');
  }
  function validateAssetReferences(project, store, { serializedAssetIds = null } = {}) {
    validateDesignProject(project);
    const reachable = collectReachableAssetIds(project);
    let raw = 0,
      imgCount = 0,
      audCount = 0,
      pixels = 0,
      duration = 0;
    const digestSeen = new Set();
    for (const id of reachable) {
      const a = store.get(id);
      if (!a) throw new AkariError('F503', `使うはずの絵や音「${id}」がありません`);
      raw += a.byteLength;
      if (a.kind === 'image') {
        imgCount++;
        const m = a.meta || {};
        if (m.width && m.height) pixels += m.width * m.height;
      } else if (a.kind === 'audio') {
        audCount++;
        if (a.meta?.duration) duration += a.meta.duration;
      }
      const dk = `${a.kind}:${a.sha256}:${a.byteLength}`;
      if (digestSeen.has(dk)) throw new AkariError('F503', '同じ中身の絵や音が、2つ以上あります');
      digestSeen.add(dk);
    }
    if (
      reachable.size > LIMITS.assets ||
      imgCount > LIMITS.imageAssets ||
      audCount > LIMITS.audioAssets ||
      raw > LIMITS.assetRawTotal ||
      pixels > LIMITS.imagePixelsTotal ||
      duration > LIMITS.audioDurationTotal
    )
      throw new AkariError('F504', '作品の 絵や音が、多すぎるか 大きすぎます。使わない 絵や音を けしてください');
    for (const b of project.stage.backdrops)
      if (b.kind === 'image' && store.get(b.assetId)?.kind !== 'image')
        throw new AkariError('F509', '絵のはいけいが、絵ではないものを使っています');
    for (const c of project.components)
      if (c.type === 'sprite')
        for (const co of c.costumes)
          if (co.kind === 'image' && store.get(co.assetId)?.kind !== 'image')
            throw new AkariError('F509', '絵のすがたが、絵ではないものを使っています');
    for (const snd of project.sounds)
      if (store.get(snd.assetId)?.kind !== 'audio')
        throw new AkariError('F509', '音が、音ではないものを使っています');
    if (serializedAssetIds) {
      if (
        serializedAssetIds.size !== reachable.size ||
        [...serializedAssetIds].some((id) => !reachable.has(id))
      )
        throw new AkariError('F503', '作品ファイルに、使われていない絵や音か、足りない絵や音があります');
    }
    return true;
  }
  async function makeAssetBlob(id, kind, canonical) {
    const digest = await sha256(canonical.bytes);
    return {
      id,
      kind,
      mime: canonical.mime,
      byteLength: canonical.bytes.length,
      sha256: digest,
      bytes: canonical.bytes,
      meta: {
        width: canonical.width,
        height: canonical.height,
        duration: canonical.duration,
        channels: canonical.channels,
        sampleRate: canonical.sampleRate,
      },
    };
  }

  function designEntityIds(project) {
    const ids = new Set(['stage']);
    for (const b of project.stage.backdrops) ids.add(b.id);
    for (const d of [...project.projectData.variables, ...project.projectData.lists]) ids.add(d.id);
    for (const c of project.components) {
      ids.add(c.id);
      for (const d of [...c.localData.variables, ...c.localData.lists]) ids.add(d.id);
      for (const co of c.costumes || []) ids.add(co.id);
    }
    for (const x of [...project.actions, ...project.functions, ...project.sounds]) ids.add(x.id);
    return ids;
  }
  function orderedDataRecord(d) {
    return { id: d.id, name: d.name, initialValue: cloneDesignProject(d.initialValue),
      ...(Object.hasOwn(d, 'expectedUnit') ? { expectedUnit: d.expectedUnit } : {}) };
  }
  function orderedBackdropRecord(b) {
    return b.kind === 'color'
      ? { id: b.id, name: b.name, kind: 'color', value: b.value }
      : { id: b.id, name: b.name, kind: 'image', assetId: b.assetId, fit: b.fit, fill: b.fill };
  }
  function orderedCostumeRecord(c) {
    return c.kind === 'text'
      ? { id: c.id, name: c.name, kind: 'text', value: c.value }
      : { id: c.id, name: c.name, kind: 'image', assetId: c.assetId };
  }
  function orderedComponentRecord(c) {
    const out = {
      id: c.id,
      type: c.type,
      name: c.name,
      x: c.x,
      y: c.y,
      w: c.w,
      h: c.h,
      fg: c.fg,
      bg: c.bg,
      fontSize: c.fontSize,
      visible: c.visible,
      direction: normalizedDesignDirection(c.direction),
      scalePercent: c.scalePercent,
      text: c.text,
      localData: {
        variables: c.localData.variables.map(orderedDataRecord),
        lists: c.localData.lists.map(orderedDataRecord),
      },
    };
    if (c.type === 'sprite') {
      out.costumes = c.costumes.map(orderedCostumeRecord);
      out.costumeId = c.costumeId;
    }
    return out;
  }
  function serializedRoot(project, assetStore) {
    validateDesignProject(project);
    validateAssetReferences(project, assetStore);
    const reachable = [...collectReachableAssetIds(project)].sort(),
      assets = [];
    for (const id of reachable) {
      const a = assetStore.get(id);
      if (!a) throw new AkariError('F503', `絵や音「${id}」がありません`);
      if (
        !(a.bytes instanceof Uint8Array) ||
        a.bytes.length !== a.byteLength ||
        sha256Fallback(a.bytes) !== a.sha256
      )
        throw new AkariError('F508', `絵や音「${id}」の中身が、ほぞんしたときと合いません`);
      if (a.kind === 'image') {
        const sn = sniffImage(a.bytes);
        if (sn.mime !== a.mime)
          throw new AkariError('F509', `絵「${id}」のファイルの形が、記録と合いません`);
      } else if (a.kind === 'audio') {
        const sn = sniffAudio(a.bytes);
        if (sn.mime !== a.mime)
          throw new AkariError('F509', `音「${id}」のファイルの形が、記録と合いません`);
      } else throw new AkariError('F509', `絵や音「${id}」の種類が、正しくありません`);
      assets.push({
        id: a.id,
        kind: a.kind,
        mime: a.mime,
        byteLength: a.byteLength,
        sha256: a.sha256,
        dataBase64: encodeBase64(a.bytes),
      });
    }
    return {
      ...(extensionEnvelope(project) ? { extensions: extensionEnvelope(project) } : {}),
      schema: project.schema,
      appVersion: PRODUCT_RELEASE,
      languageContractId: project.languageContractId,
      formatVersion: project.formatVersion,
      name: project.name,
      stage: {
        id: project.stage.id,
        name: project.stage.name,
        width: project.stage.width,
        height: project.stage.height,
        backdrops: project.stage.backdrops.map(orderedBackdropRecord),
        backdropId: project.stage.backdropId,
        ...(Object.hasOwn(project.stage, 'showSpeechNames') ? {showSpeechNames: project.stage.showSpeechNames} : {}),
      },
      projectData: {
        variables: project.projectData.variables.map(orderedDataRecord),
        lists: project.projectData.lists.map(orderedDataRecord),
      },
      components: project.components.map(orderedComponentRecord),
      scripts: project.scripts.map((x) => isMeijinScript(x) ? ({
        id: x.id, mode: 'meijin', source: x.source,
        ...(x.document?{document:{revision:x.document.revision,unitIds:[...x.document.unitIds]}}:{}),
      }) : ({
        ...(x.id ? { id: x.id } : {}),
        targetId: x.targetId,
        event: x.event,
        ...(x.filter !== undefined ? { filter: cloneDesignProject(x.filter) } : {}),
        source: x.source,
        ...(x.document?{document:{revision:x.document.revision,unitIds:[...x.document.unitIds]}}:{}),
      })),
      actions: project.actions.map((x) => ({
        id: x.id,
        ownerId: x.ownerId,
        name: x.name,
        ...(x.callPhrase !== undefined ? {callPhrase:x.callPhrase} : {}),
        args: [...x.args],
        source: x.source,
      })),
      functions: project.functions.map((x) => ({
        id: x.id,
        ownerId: x.ownerId,
        name: x.name,
        args: [...x.args],
        source: x.source,
      })),
      sounds: project.sounds.map((x) => ({ id: x.id, name: x.name, assetId: x.assetId })),
      assets,
    };
  }
  // A saved 名人 script has neither owner nor event; in memory it takes the editor's pseudo owner.
  function inMemoryScripts(scripts) {
    return scripts.map(x => {
      if (x?.mode === undefined) return x;
      if (x.mode !== 'meijin' || !exactKeys(x, ['id', 'mode', 'source', ...(Object.hasOwn(x, 'document') ? ['document'] : [])]))
        throw new AkariError('F503', '名人の本文の 形が 正しくありません');
      return { id: x.id, mode: 'meijin', targetId: MEIJIN_OWNER, event: 'start', source: x.source, ...(x.document ? { document: x.document } : {}) };
    });
  }
  function validateSerializedProjectStructure(root) {
    if (
      !exactKeys(root, [
        'schema',
        'appVersion',
        'languageContractId',
        'formatVersion',
        'name',
        'stage',
        'projectData',
        'components',
        'scripts',
        'actions',
        'functions',
        'sounds',
        'assets',
        ...(Object.hasOwn(root || {}, 'editorState') ? ['editorState'] : []),
        ...(Object.hasOwn(root || {}, 'extensions') ? ['extensions'] : []),
      ])
    )
      throw new AkariError('F503', '作品の ファイルの 形が、あかりで 読める 形と 合いません');
    if (!Array.isArray(root.assets) || root.assets.length > LIMITS.assets)
      throw new AkariError('F504', '絵や音が 多すぎます。いらない 絵や音を けしてください', 0, 0, '絵や音の 数が、上限より 多いです');
    if (Array.isArray(root.scripts)) root = { ...root, scripts: inMemoryScripts(root.scripts) };
    const design = {
      ...(Object.hasOwn(root, 'extensions') ? { extensions: AKARI_RUNTIME.validateExtensionEnvelope(root.extensions) } : {}),
      schema: root.schema,
      appVersion: root.appVersion,
      languageContractId: root.languageContractId,
      formatVersion: root.formatVersion,
      name: root.name,
      stage: root.stage,
      projectData: root.projectData,
      components: root.components,
      scripts: root.scripts,
      actions: root.actions,
      functions: root.functions,
      sounds: root.sounds,
    };
    validateDesignProject(design);
    if(root.editorState!==undefined)validateEditorState(root.editorState,design);
    const ids = designEntityIds(design),
      assetIds = new Set(),
      digestKeys = new Set();
    let predicted = 0,
      ic = 0,
      ac = 0;
    for (const a of root.assets) {
      if (!exactKeys(a, ['id', 'kind', 'mime', 'byteLength', 'sha256', 'dataBase64']))
        throw new AkariError('F503', '絵や音の記録の形が、正しくありません');
      if (!safeId(a.id)) throw new AkariError('F503', '絵や音の番号が、正しくありません');
      if (ids.has(a.id) || assetIds.has(a.id))
        throw new AkariError('F505', `ID「${a.id}」が 2つ あります`);
      ids.add(a.id);
      assetIds.add(a.id);
      if (a.kind === 'image') {
        ic++;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(a.mime))
          throw new AkariError('F509', 'あかりで使えない形の絵があります');
        if (!Number.isInteger(a.byteLength) || a.byteLength < 1 || a.byteLength > LIMITS.imageBytes)
          throw new AkariError('F504', '絵の大きさが、使える大きさの外です');
      } else if (a.kind === 'audio') {
        ac++;
        if (!['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/flac', 'audio/ogg'].includes(a.mime))
          throw new AkariError('F509', 'あかりで使えない形の音があります');
        if (!Number.isInteger(a.byteLength) || a.byteLength < 1 || a.byteLength > LIMITS.audioBytes)
          throw new AkariError('F504', '音の大きさが、使える大きさの外です');
      } else throw new AkariError('F509', 'あかりで使えない種類の絵や音があります');
      if (!/^[0-9a-f]{64}$/.test(a.sha256)) throw new AkariError('F508', '絵や音の中身をたしかめるしるしの書き方が、正しくありません');
      const n = decodedBase64Length(a.dataBase64);
      if (n !== a.byteLength)
        throw new AkariError('F508', '絵や音の大きさが、記録とちがいます');
      predicted += n;
      if (predicted > LIMITS.assetRawTotal)
        throw new AkariError('F504', '絵や音を 合わせた 大きさが 大きすぎて 使えません。いらない 絵や音を けしてください', 0, 0, `絵や音の合計は${LIMITS.assetRawTotal / 1048576}MiBまで`);
      const dk = `${a.kind}:${a.sha256}:${a.byteLength}`;
      if (digestKeys.has(dk)) throw new AkariError('F503', '作品ファイルに、同じ絵や音が2つ以上あります');
      digestKeys.add(dk);
    }
    if (ic > LIMITS.imageAssets || ac > LIMITS.audioAssets)
      throw new AkariError('F504', '絵や音が 多すぎます。いらない 絵や音を けしてください', 0, 0, '絵や音の 数が、上限より 多いです');
    return { design, assetIds };
  }

  function validateCallableDraftState(d) {
    if (d == null) return null;
    if (
      !(exactKeys(d, ['ownerId', 'type', 'name', 'argsText', 'source', 'editId', 'loadedKey']) ||
        exactKeys(d, ['ownerId', 'type', 'name', 'argsText', 'callPhrase', 'source', 'editId', 'loadedKey'])) ||
      d.ownerId !== 'stage' ||
      !['action', 'function'].includes(d.type)
    )
      throw new AkariError('F503', '自分で 作った ブロックの 下書きが、正しく ありません');
    for (const [k, limit] of [
      ['name', 500],
      ['argsText', 4096],
      ['source', LIMITS.sourceEach],
      ['editId', 64],
      ['loadedKey', 80],
    ])
      if (typeof d[k] !== 'string' || cpLen(d[k]) > limit)
        throw new AkariError(
          'F504',
          '下書きの 文字が 多すぎます',
        );
    if (d.callPhrase !== undefined && (d.type !== 'action' || typeof d.callPhrase !== 'string' || cpLen(d.callPhrase) > 80))
      throw new AkariError('F503', '短い よび方は、80文字までで 書いてください');
    if (d.editId && !safeId(d.editId))
      throw new AkariError('F503', '下書きの 中身が こわれています');
    return { ...d };
  }
  function validateEditorState(state,project) {
    if(!exactKeys(state,['version','revision','selectedId','currentEvent','selectedScriptId','uiLevel','sourceOverviewOpen','editorModes','callableDraft','pendingEditors','views'])||state.version!==1||!Number.isSafeInteger(state.revision)||state.revision<0)
      throw new AkariError('F503','なおしていた ときの きろくの 形が、正しく ありません');
    // 名人の本文 is selected under its pseudo owner, with the one slot 'start'.
    const actor=state.selectedId==='stage'?{type:'stage'}:state.selectedId===MEIJIN_OWNER&&project.scripts.some(isMeijinScript)?{type:MEIJIN_OWNER}:project.components.find(c=>c.id===state.selectedId);
    if(!actor||!(actor.type===MEIJIN_OWNER?state.currentEvent==='start':EVENT_BY_TYPE[actor.type]?.includes(state.currentEvent))||
      state.selectedScriptId!==null&&!project.scripts.some(s=>s.id===state.selectedScriptId&&s.targetId===state.selectedId&&s.event===state.currentEvent)||
      !['basic','advanced'].includes(state.uiLevel)||typeof state.sourceOverviewOpen!=='boolean'||
      !exactKeys(state.editorModes,['script','draft'])||!Object.values(state.editorModes).every(mode=>['code','blocks'].includes(mode)))
      throw new AkariError('F503','なおしていた 画面で えらんでいた ものが、正しく ありません');
    validateCallableDraftState(state.callableDraft);
    const pending=state.pendingEditors;
    if(!Array.isArray(pending)||pending.length>2||new Set(pending.map(d=>d.kind)).size!==pending.length)
      throw new AkariError('F503','作文の 下書きが 正しく ありません');
    for(const saved of pending){
      if(!exactKeys(saved,['kind','ownerKey','source','mode','pending','draftTree'])||!['script','draft'].includes(saved.kind)||!['code','blocks'].includes(saved.mode)||
        typeof saved.ownerKey!=='string'||saved.ownerKey.length>150||typeof saved.source!=='string'||cpLen(saved.source)>LIMITS.sourceEach||
        !saved.pending||typeof saved.pending!=='object'||Array.isArray(saved.pending)||JSON.stringify(saved.pending).length>LIMITS.sourceEach*4)
        throw new AkariError('F503','作文の 下書きが 正しく ありません');
      if(saved.kind==='script'&&!sourceRegistry(project).some(row=>row.key===saved.ownerKey)&&saved.ownerKey!==`script:${state.selectedId}:${state.currentEvent}`)
        throw new AkariError('F503','下書きの 本文が 見つかりません');
      if(saved.kind==='script'&&saved.ownerKey!==(state.selectedScriptId?`script:${state.selectedScriptId}`:`script:${state.selectedId}:${state.currentEvent}`))
        throw new AkariError('F503','下書きと、えらんでいる 本文が 合いません');
      if(saved.kind==='draft'&&!state.callableDraft)throw new AkariError('F503','自分で 作った ブロックの 下書きが 見つかりません');
      if(saved.draftTree!==null){const ast=blockDecode(saved.draftTree,{allowHoles:true});validateSyntaxAst(ast,'script',{allowHoles:true});if(cpLen(formatScript(ast,{allowHoles:true}))>LIMITS.sourceEach)throw new AkariError('F504','ブロックの 下書きが 長すぎます');}
      if(saved.pending.field){
        const path=saved.pending.nodePath;
        if(typeof saved.pending.field!=='string'||typeof saved.pending.value!=='string'||!Array.isArray(path)||path.length>LIMITS.blockDepth*4||path.some(k=>typeof k!=='string'&&!Number.isInteger(k)))
          throw new AkariError('F503','書きかけの 入力らんが、正しく ありません');
        const record=sourceRegistry(project).find(row=>row.key===saved.ownerKey),context=saved.kind==='draft'?{definitionKind:state.callableDraft.type,args:[]}:(record?.context||{}),
          ast=saved.draftTree?blockDecode(saved.draftTree,{allowHoles:true}):parseSyntax(saved.kind==='draft'?state.callableDraft.source:record?.source||'',{...context,symbols:buildSymbols(project)}).ast;
        let node=saved.draftTree||blockEncode(ast,{allowHoles:true}).tree;for(const k of path){if(!node||!Object.hasOwn(node,k))throw new AkariError('F503','書きかけの 入力先が 見つかりません');node=node[k];}
        const schema=BLOCK_SCHEMA_BY_ID.get(node?.schemaId),field=schema&&[...schema.fields,...schema.annotations].find(f=>f.key===saved.pending.field);
        if(!field)throw new AkariError('F503','書きかけの、入力する ところが 見つかりません');
      }
    }
    const records=sourceRegistry(project);let total=records.reduce((n,row)=>n+cpLen(row.source),0);
    for(const saved of pending.filter(d=>d.kind==='script'))total+=cpLen(saved.source)-cpLen(records.find(row=>row.key===saved.ownerKey)?.source||'');
    if(state.callableDraft){const d=state.callableDraft;total+=cpLen(pending.find(row=>row.kind==='draft')?.source??d.source)-cpLen(records.find(row=>row.key===`${d.type}:${d.editId}`)?.source||'');}
    if(total>LIMITS.sourceTotal)throw new AkariError('F504','書きかけも 合わせると、作品 ぜんたいの 本文が 長すぎます');
    if(!Array.isArray(state.views)||state.views.length>2)throw new AkariError('F503','なおしていた ばしょの きろくが、正しく ありません');
    for(const view of state.views){
      if(!exactKeys(view,['kind','ownerKey','codeSelection','scrollState'])||!['script','draft'].includes(view.kind)||typeof view.ownerKey!=='string'||view.ownerKey.length>150||
        !exactKeys(view.codeSelection,['start','end','direction'])||!['none','forward','backward'].includes(view.codeSelection.direction)||
        ![view.codeSelection.start,view.codeSelection.end].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=LIMITS.sourceEach*2)||
        !exactKeys(view.scrollState,['codeTop','codeLeft'])||!Object.values(view.scrollState).every(n=>Number.isFinite(n)&&n>=0&&n<=1e9))throw new AkariError('F503','なおしていた ばしょの きろくが、正しく ありません');
    }
    return state;
  }
  // Persistent history stores one design/editor frame and structural deltas. Asset
  // bytes are shared by digest, while each frame retains its original asset IDs.
  const WORKSPACE_HISTORY_LIMIT = LIMITS.historyEntries;
  function workspaceDelta(before, after) {
    if (stableJson(before) === stableJson(after)) return null;
    if (typeof before === 'string' && typeof after === 'string') {
      let start=0,end=0;
      while(start<before.length&&start<after.length&&before[start]===after[start])start++;
      while(end<before.length-start&&end<after.length-start&&before[before.length-end-1]===after[after.length-end-1])end++;
      return ['text',start,end,after.slice(start,after.length-end)];
    }
    if (Array.isArray(before)&&Array.isArray(after)) {
      const changed={};for(let i=0;i<after.length;i++){const d=i<before.length?workspaceDelta(before[i],after[i]):['value',after[i]];if(d)changed[i]=d;}
      return ['array',after.length,changed];
    }
    if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after)){
      const changed={};for(const key of Object.keys(after)){const d=Object.hasOwn(before,key)?workspaceDelta(before[key],after[key]):['value',after[key]];if(d)Object.defineProperty(changed,key,{value:d,enumerable:true});}
      return ['object',changed,Object.keys(before).filter(key=>!Object.hasOwn(after,key))];
    }
    return ['value',after];
  }
  function applyWorkspaceDelta(before,delta,depth=0) {
    const fail=()=>{throw new AkariError('F503','もとに もどせる きろくが、こわれています');};
    if(depth>LIMITS.blockDepth*4||!Array.isArray(delta))return fail();
    const [kind,a,b,c]=delta;
    if(kind==='value'&&delta.length===2)return cloneDesignProject(a);
    if(kind==='text'&&delta.length===4&&typeof before==='string'&&typeof c==='string'&&
      Number.isSafeInteger(a)&&Number.isSafeInteger(b)&&a>=0&&b>=0&&a+b<=before.length)return before.slice(0,a)+c+before.slice(before.length-b);
    const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
    if(kind==='array'&&delta.length===3&&Array.isArray(before)&&Number.isSafeInteger(a)&&a>=0&&a<=LIMITS.sourceTotal&&record(b)){
      const out=before.slice(0,a);out.length=a;
      for(const [key,d]of Object.entries(b)){if(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=a)return fail();out[Number(key)]=applyWorkspaceDelta(before[Number(key)],d,depth+1);}
      for(let i=0;i<a;i++)if(!Object.hasOwn(out,i))return fail();return out;
    }
    if(kind==='object'&&delta.length===3&&record(before)&&record(a)&&Array.isArray(b)&&b.every(key=>typeof key==='string'&&Object.hasOwn(before,key))){
      const out={...before};for(const key of b)delete out[key];
      for(const [key,d]of Object.entries(a))Object.defineProperty(out,key,{value:applyWorkspaceDelta(before[key],d,depth+1),enumerable:true,writable:true,configurable:true});
      return out;
    }
    return fail();
  }
  function encodeWorkspaceHistory(frames,cursor) {
    if(!Array.isArray(frames)||!frames.length||frames.length>WORKSPACE_HISTORY_LIMIT||!Number.isInteger(cursor)||cursor<0||cursor>=frames.length)
      throw new AkariError('F503','もとに もどせる きろくの ばしょが、正しく ありません');
    const assets=[],assetIndexes=new Map(),packed=[];
    for(const frame of frames){
      const store=new AssetStore(frame.assets);validateAssetReferences(frame.project,store);validateEditorState(frame.editorState,frame.project);
      const assetRefs=[];
      for(const id of collectReachableAssetIds(frame.project)){
        const a=store.get(id),key=`${a.kind}:${a.mime}:${a.byteLength}:${a.sha256}`;
        if(!assetIndexes.has(key)){
          const builtin=a.id===DEFAULT_MASCOT_ASSET_ID&&a.kind==='image'&&a.mime==='image/png'&&a.byteLength===5476&&a.sha256===DEFAULT_MASCOT_SHA256;
          assetIndexes.set(key,assets.length);assets.push({kind:a.kind,mime:a.mime,byteLength:a.byteLength,sha256:a.sha256,builtin,
            blob:builtin?null:new Blob([a.bytes],{type:a.mime})});
        }
        assetRefs.push([id,assetIndexes.get(key)]);
      }
      packed.push({project:cloneDesignProject(frame.project),editorState:cloneDesignProject(frame.editorState),assetRefs,
        callableBaseline:frame.callableBaseline||'',callableLoadedKey:frame.callableLoadedKey||'',draftSerial:frame.draftSerial||0,draftOpen:!!frame.draftOpen});
    }
    return {version:1,cursor,base:packed[0],deltas:packed.slice(1).map((frame,i)=>workspaceDelta(packed[i],frame)||['object',{},[]]),assets};
  }
  async function decodeWorkspaceHistory(saved) {
    const fail=()=>{throw new AkariError('F503','このパソコンに のこした 作品の、もとに もどせる きろくが 正しく ありません');};
    if(!exactKeys(saved,['version','cursor','base','deltas','assets'])||saved.version!==1||!Array.isArray(saved.deltas)||saved.deltas.length>=WORKSPACE_HISTORY_LIMIT||
      !Number.isInteger(saved.cursor)||saved.cursor<0||saved.cursor>saved.deltas.length||!Array.isArray(saved.assets)||saved.assets.length>LIMITS.assets*WORKSPACE_HISTORY_LIMIT)return fail();
    const loaded=[],digests=new Set();let bytesTotal=0;
    for(const a of saved.assets){
      if(!exactKeys(a,['kind','mime','byteLength','sha256','builtin','blob'])||!['image','audio'].includes(a.kind)||typeof a.builtin!=='boolean'||
        !Number.isSafeInteger(a.byteLength)||a.byteLength<1||a.byteLength>(a.kind==='image'?LIMITS.imageBytes:LIMITS.audioBytes))return fail();
      bytesTotal+=a.byteLength;if(bytesTotal>LIMITS.assetRawTotal*WORKSPACE_HISTORY_LIMIT)return fail();
      const key=`${a.kind}:${a.mime}:${a.byteLength}:${a.sha256}`;if(digests.has(key))return fail();digests.add(key);
      if(a.builtin){const record=defaultMascotAssetRecord();if(a.blob!==null||a.kind!==record.kind||a.mime!==record.mime||a.byteLength!==record.byteLength||a.sha256!==record.sha256)return fail();loaded.push(record);}
      else{
        if(!(a.blob instanceof Blob)||a.blob.size!==a.byteLength||a.blob.type!==a.mime)return fail();
        loaded.push(await validateLoadedAssetRecord({id:`history-asset-${loaded.length}`,kind:a.kind,mime:a.mime,byteLength:a.byteLength,sha256:a.sha256,dataBase64:encodeBase64(new Uint8Array(await a.blob.arrayBuffer()))}));
      }
    }
    const frames=[];let frame=saved.base;
    for(let i=0;i<=saved.deltas.length;i++){
      if(i)frame=applyWorkspaceDelta(frame,saved.deltas[i-1]);
      if(!exactKeys(frame,['project','editorState','assetRefs','callableBaseline','callableLoadedKey','draftSerial','draftOpen'])||
        typeof frame.callableBaseline!=='string'||frame.callableBaseline.length>LIMITS.sourceEach*4+30000||typeof frame.callableLoadedKey!=='string'||frame.callableLoadedKey.length>80||
        !Number.isSafeInteger(frame.draftSerial)||frame.draftSerial<0||typeof frame.draftOpen!=='boolean'||!Array.isArray(frame.assetRefs)||frame.assetRefs.length>LIMITS.assets)return fail();
      validateDesignProject(frame.project);validateEditorState(frame.editorState,frame.project);
      const st=new AssetStore();
      for(const ref of frame.assetRefs){if(!Array.isArray(ref)||ref.length!==2||!safeId(ref[0])||!Number.isInteger(ref[1])||!loaded[ref[1]])return fail();st.addImmutable({...loaded[ref[1]],id:ref[0]});}
      validateAssetReferences(frame.project,st,{serializedAssetIds:new Set(st.ids())});
      frames.push({...cloneDesignProject(frame),assets:st.snapshotRefs(),fingerprint:assetStateFingerprint(frame.project,st)});
    }
    const used=new Set(frames.flatMap(f=>f.assetRefs.map(ref=>ref[1])));if(used.size!==saved.assets.length)return fail();
    return {frames,cursor:saved.cursor};
  }

  function markdownText(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/([\\`*_{}\[\]()#+.!|~-])/g, '\\$1')
      .replace(/\r\n?|\n/g, '\\n');
  }
  function markdownFence(value, language = 'text') {
    const text = String(value).replace(/\r\n?/g, '\n'),
      runs = text.match(/`+/g) || [],
      fence = '`'.repeat(Math.max(3, ...runs.map((x) => x.length + 1)));
    return fence + language + '\n' + text + '\n' + fence + '\n';
  }
  function markdownBody(root) {
    const out = [
      '# あかり ' + root.appVersion + ' の作品',
      '',
      `\u4f5c\u54c1\u540d\uff1a${markdownText(root.name)}`,
      '',
      '> \u3053\u306e\u672c\u6587\u306f\u95b2\u89a7\u7528\u3067\u3059\u3002\u7de8\u96c6\u306f\u3042\u304b\u308a\u306e\u753b\u9762\u5185\u3067\u884c\u3044\u307e\u3059\u3002\u672b\u5c3e\u306e\u5fa9\u5143\u30c7\u30fc\u30bf\u304c\u6b63\u672c\u3067\u3059\u3002\u672c\u6587\u3068\u6b63\u672c\u304c\u4e00\u81f4\u3057\u306a\u3044\u5834\u5408\u306fF512\u3067\u8aad\u8fbc\u307f\u3092\u4e2d\u6b62\u3057\u3001\u5909\u66f4\u3092\u9ed9\u3063\u3066\u6368\u3066\u307e\u305b\u3093\u3002',
      '',
      '## \u753b\u9762',
      `\u540d\u524d\uff1a${markdownText(root.stage.name)}\uff0f\u5e45\uff1a${root.stage.width}\uff0f\u9ad8\u3055\uff1a${root.stage.height}`,
      '',
    ];
    const data = (title, d) => {
      out.push('### ' + markdownText(title));
      if (!d.variables.length && !d.lists.length) out.push('\u306a\u3057', '');
      for (const [kind, items] of [
        ['\u5909\u6570', d.variables],
        ['\u30ea\u30b9\u30c8', d.lists],
      ])
        for (const x of items) {
          out.push(
            `${kind}\uff1a${markdownText(x.name)}\uff08${x.id}\uff09`,
            markdownFence(JSON.stringify(x.initialValue, null, 2), 'json'),
          );
        }
    };
    out.push('## \u521d\u671f\u30c7\u30fc\u30bf');
    data('\u4f5c\u54c1', root.projectData);
    for (const c of root.components) data(c.name, c.localData);
    out.push('## \u90e8\u54c1');
    for (const c of root.components) {
      out.push('### ' + markdownText(c.name) + `\uff08${c.type} / ${c.id}\uff09`);
      const { localData, costumes, ...props } = c;
      out.push(markdownFence(JSON.stringify(props, null, 2), 'json'));
    }
    out.push('## \u3067\u304d\u3054\u3068\u306e\u30b3\u30fc\u30c9');
    for (const script of root.scripts) {
      if (script.mode === 'meijin') { out.push('### ' + markdownText('名人の本文'), markdownFence(script.source)); continue; }
      const target =
        script.targetId === 'stage'
          ? root.stage
          : root.components.find((x) => x.id === script.targetId);
      out.push(
        '### ' +
          markdownText(target?.name || script.targetId) +
          ' / ' +
          markdownText(EVENT_LABELS[script.event] || script.event),
        markdownFence(script.source),
      );
    }
    for (const [label, defs] of [
      ['\u52d5\u4f5c', root.actions],
      ['\u6c42\u5024', root.functions],
    ]) {
      out.push('## ' + label);
      if (!defs.length) out.push('\u306a\u3057', '');
      for (const d of defs) {
        out.push(
          '### ' + markdownText(d.name),
          '所属：' + markdownText(root.stage.name) + '（' + d.ownerId + '）',
          '\u5f15\u6570\uff1a' +
            (d.args.length ? d.args.map(markdownText).join('\u3001') : '\u306a\u3057'),
          '',
          markdownFence(d.source),
        );
      }
    }
    out.push(
      '## \u7d20\u6750',
      '### \u80cc\u666f',
      markdownFence(JSON.stringify(root.stage.backdrops, null, 2), 'json'),
    );
    for (const c of root.components)
      if (c.type === 'sprite')
        out.push(
          '### ' + markdownText(c.name) + '\u306e\u8863\u88c5',
          markdownFence(JSON.stringify(c.costumes, null, 2), 'json'),
        );
    out.push(
      '### \u97f3',
      markdownFence(JSON.stringify(root.sounds, null, 2), 'json'),
      '### \u7d20\u6750\u30c7\u30fc\u30bf\u4e00\u89a7',
    );
    for (const a of root.assets)
      out.push(`- ${a.id} / ${a.kind} / ${a.mime} / ${a.byteLength} bytes / SHA-256: ${a.sha256}`);
    if (!root.assets.length) out.push('\u306a\u3057');
    if(root.editorState)out.push('','## 書きかけと編集位置',markdownFence(JSON.stringify(root.editorState,null,2),'json'));
    out.push(
      '',
      '## \u5fa9\u5143\u30c7\u30fc\u30bf',
      '\u3053\u306e\u30c7\u30fc\u30bf\u3068\u4e0a\u306e\u672c\u6587\u306f\u540c\u3058\u4f5c\u54c1\u304b\u3089\u751f\u6210\u3055\u308c\u3066\u3044\u307e\u3059\u3002',
      '',
    );
    return out.join('\n') + '\n';
  }
  const MARKDOWN_BEGIN = '<!-- AKARI-PROJECT-F' + PROJECT_FORMAT_ID + '-DATA-BEGIN -->\n```json\n';
  const MARKDOWN_END = '\n```\n<!-- AKARI-PROJECT-F' + PROJECT_FORMAT_ID + '-DATA-END -->\n';

  function serializeProject(project, assetStore = new AssetStore(), editorState = null) {
    assetStore = withDefaultMascotAsset(project, assetStore);
    const root = serializedRoot(project, assetStore);
    if(editorState!==null)root.editorState=validateEditorState(cloneDesignProject(editorState),project);
    validateSerializedProjectStructure(root);
    const payload = JSON.stringify(root, null, 2).replace(
      /[<>&\u2028\u2029]/g,
      (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
    );
    const text = markdownBody(root) + MARKDOWN_BEGIN + payload + MARKDOWN_END;
    if (new TextEncoder().encode(text).length > LIMITS.fileBytes)
      throw new AkariError(
        'F504',
        `ほぞんする ファイルは ${LIMITS.fileBytes / 1048576}MiBまでです`,
      );
    return text;
  }
  // options.upgradeExtensions opens a work recorded with an older release of a registered extension
  // (see the extension host's upgradeRequirements); the caller asks the person first.
  async function parseProjectFile(text, options = {}) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > LIMITS.fileBytes)
      throw new AkariError(
        'F504',
        `作品の ファイルは ${LIMITS.fileBytes / 1048576}MiBまでです`,
      );
    text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const begin = text.lastIndexOf(MARKDOWN_BEGIN);
    let root;
    try {
      if (begin < 0 || !text.endsWith(MARKDOWN_END)) throw Error();
      root = JSON.parse(text.slice(begin + MARKDOWN_BEGIN.length, -MARKDOWN_END.length));
    } catch (_) {
      // A file written in another project format names its format in the data marker.
      const other = text.match(/<!-- AKARI-PROJECT-F(\d+)-DATA-BEGIN -->/);
      if (other && Number(other[1]) !== PROJECT_FORMAT_ID)
        throw Object.assign(new AkariError(
          'F502',
          (Number(other[1]) < PROJECT_FORMAT_ID ? '前の' : 'あたらしい') +
            ' あかりで ほぞんした 作品なので、この あかりでは 開けないよ。その 作品を 作った ときの あかりで 開いてね。',
        ), { otherFormat: true });
      throw new AkariError(
        'F502',
        '作品の 中身を 読めません。あかりで ほぞんした ファイル（名前が「.akari.md」で おわる ファイル）を えらんでください',
      );
    }
    const recorded = root;
    if (options.upgradeExtensions && root && typeof root === 'object' && Object.hasOwn(root, 'extensions'))
      root = { ...root, extensions: EXTENSION_HOST.upgradeRequirements(root.extensions).envelope };
    let assetIds;
    try { ({ assetIds } = validateSerializedProjectStructure(root)); }
    catch (error) {
      if (!options.upgradeExtensions && error?.code === 'E703' && root && typeof root === 'object' && Object.hasOwn(root, 'extensions')) {
        let plan = null;
        try { plan = EXTENSION_HOST.upgradeRequirements(root.extensions); } catch (_) {}
        if (plan?.upgrades.length) error.extensionUpgrades = plan.upgrades;
      }
      throw error;
    }
    if (text.slice(0, begin) !== markdownBody(recorded))
      throw new AkariError(
        'F512',
        'ファイルの 本文と、作品を もどすための 中身が 合いません。いま なおしている 作品は かえていません。',
      );
    const store = new AssetStore();
    for (const record of root.assets) store.addImmutable(await validateLoadedAssetRecord(record));
    const project = {
      ...root,
      components: root.components.map((c) => ({ ...c, direction: normalizedDesignDirection(c.direction) })),
      scripts: inMemoryScripts(root.scripts),
    };
    delete project.assets;
    delete project.editorState;
    validateAssetReferences(project, store, { serializedAssetIds: assetIds });
    return { project, assetStore: store, diagnostics: compileProject(project).errors, ...(root.editorState?{editorState:root.editorState}:{}) };
  }
  async function validateLoadedAssetRecord(a) {
    const bytes = decodeBase64(a.dataBase64);
    if (bytes.length !== a.byteLength)
      throw new AkariError('F508', '絵や音の大きさが、記録と合いません');
    const digest = await sha256(bytes);
    if (digest !== a.sha256) throw new AkariError('F508', '絵や音の中身が、記録と合いません');
    if (a.kind === 'image') {
      const sn = sniffImage(bytes);
      if (sn.mime !== a.mime) throw new AkariError('F509', '絵の ファイルの 形が、書いてある 形と 合いません。作品の ファイルが こわれているようです');
      const dec = await decodeImageBytes(bytes, a.mime);
      try {
        if (dec.width !== sn.width || dec.height !== sn.height)
          throw new AkariError('F510', '絵の 大きさが、書いてある 大きさと 合いません。作品の ファイルが こわれているようです');
      } finally {
        dec.close();
      }
      return {
        id: a.id,
        kind: 'image',
        mime: a.mime,
        byteLength: a.byteLength,
        sha256: a.sha256,
        bytes,
        meta: { width: sn.width, height: sn.height },
      };
    }
    const sn = sniffAudio(bytes);
    if (sn.mime !== a.mime) throw new AkariError('F509', '音の ファイルの 形が、書いてある 形と 合いません。作品の ファイルが こわれているようです');
    if (a.mime === 'audio/mpeg' && !bytesEqual(sn.clean, bytes))
      throw new AkariError('F508', 'ほぞんした音（MP3）に、取りのぞくはずのおまけの情報が残っています');
    if (a.mime === 'audio/wav') {
      const rebuilt = rebuildCanonicalWav(sn.parsed);
      if (!bytesEqual(rebuilt, bytes))
        throw new AkariError('F508', 'ほぞんした音（WAV）が、決まった形になっていません');
    }
    if (['audio/mp4', 'audio/flac', 'audio/ogg'].includes(a.mime) && !bytesEqual(sn.clean, bytes))
      throw new AkariError('F508', 'ほぞんした音が、おまけの情報を取りのぞいた決まった形になっていません');
    const containerMeta = audioContainerMeta(sn);
    checkAudioContainerLimits(containerMeta);
    if (sn.duration != null) checkAudioLimits({ ...containerMeta, duration: sn.duration });
    const decoded = await decodeAudioMeta(bytes);
    if (decoded.channels !== containerMeta.channels)
      throw new AkariError('F511', 'この 音の ファイルは、中身が 合っていません。ほかの 音を 使ってください');
    if (sn.duration != null && Math.abs(decoded.duration - sn.duration) > 0.02)
      throw new AkariError('F511', 'この 音の ファイルは、書いてある 長さと 本当の 長さが 合いません。ほかの 音を 使ってください');
    const meta = {
      duration: decoded.duration,
      channels: containerMeta.channels,
      sampleRate: containerMeta.sampleRate,
    };
    checkAudioLimits(meta);
    return {
      id: a.id,
      kind: 'audio',
      mime: a.mime,
      byteLength: a.byteLength,
      sha256: a.sha256,
      bytes,
      meta,
    };
  }
  function parseLiteralForData(text, kind) {
    const s = String(text ?? '').trim();
    const dummy = { projectData: { variables: [], lists: [] }, components: [], actions: [], functions: [] };
    const sy = buildSymbols(dummy);
    // Unquoted ordinary text remains a convenient initial text value. Explicit
    // literal delimiters and numeric prefixes always undergo the language lexer.
    if (kind === 'variable' && !/^(?:[「［（(]|条件の答え|[＋+－−-]?[０-９0-9])/.test(s)) return s;
    const ast = parseExpression(s || '［］', sy, {});
    const literal = n => {
      if (['NumberLiteral', 'StringLiteral', 'BooleanLiteral'].includes(n.kind)) return n.value;
      if (n.kind === 'QuantityLiteral') return quantity(numberInUnit(literal(n.value), n.unit), n.unit);
      if (n.kind === 'UnitlessRead') return numberValue(literal(n.value));
      if (n.kind === 'UnaryExpression' && ['NEG', 'POS'].includes(n.op)) {
        const value = literal(n.value), magnitude = numberValue(value);
        return quantity(n.op === 'NEG' ? -magnitude : magnitude, unitOf(value));
      }
      if (n.kind === 'ListLiteral') return n.items.map(literal);
      throw new AkariError('R411', 'はじめの 中身には、数や 文字など、決まった ものを 書きます。計算や へんすう・リストの 名前は 使えません。れい：0、こんにちは');
    };
    const value = literal(ast);
    if (kind === 'variable' ? !scalar(value) : !listValue(value))
      throw new AkariError('R411', kind === 'variable' ? 'へんすう（1つ おぼえる はこ）の はじめの 中身には、数か 文字を 1つだけ 書きます。れい：0' : 'リストの はじめの 中身は、［ ］で かこみ、「、」で 分けて 書きます。れい：［「本」、「かさ」、3］');
    assertRuntimeValueLimit(value);
    return value;
  }
  function parseDataFormInitial(text,kind,{mode='literal',expectedUnit=null}={}) {
    if(!['variable','list'].includes(kind)||!['literal','lines'].includes(mode))throw new AkariError('F503','へんすう・リストの 中身の 入れ方が 正しく ありません');
    let value;
    if(kind==='list'&&mode==='lines')value=String(text)===''?[]:String(text).replace(/\r\n?/g,'\n').split('\n');
    else value=parseLiteralForData(text,kind);
    if(kind==='variable'&&expectedUnit)value=quantity(numberInUnit(value,expectedUnit,'たんいを 決めた へんすうの、はじめの 中身には 数を 入れてください。れい：0'),expectedUnit);
    assertRuntimeValueLimit(value);return value;
  }

