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
          code: 'R412', message: '大きさは1〜1000％です。姿を消すときは「姿をかくす」を使います',
          line: node.sourceSpan?.startLine || 0, column: node.sourceSpan?.startColumn || 1, where,
        });
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === 'sourceSpan' || key === 'actorRef') continue;
        if (Array.isArray(value)) pending.push(...value.slice().reverse());
        else if (value && typeof value === 'object') pending.push(value);
      }
    }
    return diagnostics;
  }
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
    const checkComponentTarget = (expr, allowed, ctx, where, label = '対象', special = []) => {
      const name = literalText(expr);
      if (name === null || special.includes(name)) return;
      const c = componentByName(name);
      if (!c) add('S301', `${label}「${name}」がありません`, ctx.node, where);
      else if (allowed && !allowed.includes(c.type))
        add('S304', `${label}「${name}」はこの命令で使える種類ではありません`, ctx.node, where);
    };
    let analyzeCallable = () => {};
    const actorContext = (ref, ctx, node, where) => {
      if (!ref || ref.kind === 'self') return ctx;
      const c = ref.name === project.stage.name || ref.name === '画面'
        ? { id: 'stage', type: 'stage' } : componentByName(ref.name);
      if (!c) { add('S301', `主語「${ref.name}」がありません`, node, where); return ctx; }
      return { ...ctx, targetId: c.id, targetType: c.type };
    };
    const checkArguments = (n, def, where) => {
      if (!n.argumentNames?.length) return;
      const names = n.argumentNames;
      if (names.length !== n.args.length || new Set(names).size !== names.length ||
        def.args.some(name => !names.includes(name)) || names.some(name => !def.args.includes(name)))
        add('S308', `「${n.name}」の受け取る値の名前を一つずつ指定してください`+namedArgumentDetails(def.args,names), n, where);
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
            ? 'この計算には単位のない数を使います。「の数だけ」で単位を外せます'
            : `ここでは${expected}の数を使います。${unit}の値は使えません`);
      };
      const common = (values) => {
        const tagged = [...new Set(values.filter(unit => unit !== undefined && unit !== null))];
        if (tagged.length > 1) mismatch(`${tagged.join('と')}は同じ単位ではありません`);
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
            if (a != null && b != null) mismatch('単位どうしは掛けられません。「の数だけ」で単位を外せます');
            unit = a != null ? a : b != null ? b : a === null && b === null ? null : undefined;
          } else if (n.op === 'DIV') {
            if (b != null && a !== undefined && a !== b)
              mismatch('この単位どうしは割れません。「の数だけ」で単位を外せます');
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
      if (!operation) { add('E703', '必要な拡張機能がありません', n, where); return; }
      if (operation.args.length !== n.args.length) add('S308', '拡張に渡す値の数が違います', n, where);
      operation.args.forEach((shape, index) => {
        const argument = n.args[index]; if (!argument) return;
        const unit = staticUnit(argument, n, where);
        if (shape.type === 'number' && unit !== undefined && unit !== shape.unit)
          add('R417', '拡張に渡す値の単位が一致しません', n, where);
        const known = {NumberLiteral:'number',QuantityLiteral:'number',StringLiteral:'string',BooleanLiteral:'boolean',ListLiteral:'list'}[argument.kind];
        if (known && shape.type !== 'value' && known !== shape.type) add('E705', '拡張に渡す値の型が一致しません', n, where);
      });
    };
    const checkStaticRoleUnits = (n, where) => {
      for (const slot of sentenceFormFor(n)?.roleSlots || []) {
        if (!slot.unit) continue;
        const expr = slot.path.split('.').reduce((value, key) => value?.[key], n);
        const unit = staticUnit(expr, n, where);
        if (unit !== undefined && unit !== null && unit !== slot.unit)
          add('R417', `ここでは${slot.unit}の数を使います。${unit}の値は使えません`, n, where);
      }
    };
    const analyzeExpr = (expr, initialContext, where) => {
      const scoped = [];
      const collect = (n, ctx) => {
        if (!n || typeof n !== 'object') return;
        if (n.kind === 'ActorQualifiedRead') {
          collect(n.value, actorContext(n.actorRef, ctx, n, where)); return;
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
            add('S303', `この中だけの名前「${n.name}」は宣言より前では使えません`, ctx.node, where);
          const info = targetExists({ name: n.name, qualifier: n.qualifier }, symbols, ctx);
          if (!info) {
            const prefix =
              n.qualifier === 'self' && ctx.targetId ? `${targetLabel(ctx)}の自分には` : '未定義の';
            add(
              'S301',
              `${prefix}名前「${n.name}」${n.qualifier === 'self' && ctx.targetId ? 'がありません' : 'です'}`,
              ctx.node,
              where,
            );
          }
        }
        if (n.kind === 'ExtensionCalculation') checkExtensionOperation(n, 'calculations', where);
        if (n.kind === 'UserFunctionCall') {
          const f = symbols.functions.get(n.name);
          if (!f) add('S301', `計算「${n.name}」がありません`, ctx.node, where);
          else if (f.args.length !== n.args.length)
            add('S308', `計算「${n.name}」の受け取る値は${f.args.length}個です`+namedArgumentDetails(f.args,n.argumentNames), ctx.node, where);
          else { checkArguments(n, f, where); analyzeCallable(f, 'function', ctx); }
        }
        if (n.kind === 'BuiltinCall' && BUILTIN_META.has(n.name)) {
          const m = BUILTIN_META.get(n.name),
            count = n.args.length;
          if (count < m.minArgs || count > m.maxArgs)
            add('S308', `組み込み計算「${n.name}」の受け取る値個数が違います`, ctx.node, where);
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
            add('S311', '拡張の値は登録した拡張のできごとの中で使ってください', ctx.node, where);
          if (eventOnly[n.sensor]) {
            if (ctx.definition)
              add('S311', `「${n.sensor}」は手順・答えを求める定義の本文では直接使えません`, ctx.node, where);
            else if (ctx.event !== eventOnly[n.sensor])
              add('S311', `「${n.sensor}」はこのきっかけでは使えません`, ctx.node, where);
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
            add('S304', `「${n.sensor}」は画面では使えません`, ctx.node, where);
          if (
            ['衣装番号', '衣装名'].includes(n.sensor) &&
            ctx.targetType &&
            ctx.targetType !== 'sprite'
          )
            add('S304', `「${n.sensor}」はキャラクターでだけ使えます`, ctx.node, where);
          if (n.sensor === 'INPUT_VALUE')
            checkComponentTarget(n.arg, ['input'], ctx, where, '入力欄');
          if (n.sensor === 'DISTANCE_TO')
            checkComponentTarget(n.arg, null, ctx, where, '対象', ['マウス']);
          if (n.sensor === 'TOUCHING')
            checkComponentTarget(n.arg, null, ctx, where, '対象', ['マウス', '端']);
          if (n.sensor === 'TOUCHING_COLOR') {
            const v = literalText(n.arg);
            if (v !== null)
              try {
                resolveColor(v, { allowTransparent: false });
              } catch (_) {
                add('S304', `色「${v}」は使える色ではありません`, ctx.node, where);
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
            add('S313', 'この中だけのデータは手順・答えを求める定義の本文先頭でだけ作れます', n, where);
          try {
            validateName(n.name);
          } catch (err) {
            add('S302', err.message, n, where);
          }
          if (declared.has(n.name))
            add(
              'S302',
              `この中だけの名前「${n.name}」が受け取る値または別の宣言と重複しています`,
              n,
              where,
            );
          declared.add(n.name);
          if (n.kind === 'LocalVariableDeclaration') analyzeExpr(n.initial, c, where);
          available.add(n.name);
          continue;
        }
        seenExecutable = true;
        const exprFields = [
          'value',
          'condition',
          'count',
          'list',
          'seconds',
          'question',
          'message',
        ];
        for (const f of exprFields) if (n[f]) analyzeExpr(n[f], c, where);
        for (const x of n.args || []) analyzeExpr(x, c, where);
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
          ].includes(n.kind)
        ) {
          const info = targetExists(n.target, symbols, c);
          if (!info) {
            const p =
              n.target.qualifier === 'self' && c.targetId
                ? `${targetLabel(c)}の自分には`
                : '代入先';
            add(
              'S301',
              `${p}「${n.target.name}」${n.target.qualifier === 'self' && c.targetId ? 'がありません' : 'がありません'}`,
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
                  add('R417', `ここでは${declaration.expectedUnit}の数を使います。${unit}の値は使えません`, n, where);
              }
            }
            if (info.scope === 'binder')
              add('S312', `「${n.target.name}」はそれぞれ反復の読み取り専用名です`, n, where);
            const listOp = n.kind.startsWith('List');
            if (info.kind !== 'dynamic' && listOp && info.kind !== 'list')
              add('S310', `「${n.target.name}」はリストではありません`, n, where);
            if (
              ctx.definitionKind === 'function' &&
              !['local', 'arg', 'binder'].includes(info.scope)
            )
              add('S305', '計算から外部データは変更できません', n, where);
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
          add('S305', '計算では外部副作用や待機を行えません', n, where);
        if (n.kind === 'ReturnStatement') {
          if (ctx.definitionKind === 'action') add('S307', '動作は値を返せません', n, where);
          if (ctx.definitionKind !== 'function')
            add('S307', 'きっかけから動くコードは値を返せません', n, where);
          if (!top) add('S306', '計算の「返す」は本文末尾だけに置きます', n, where);
        }
        if ((n.kind === 'Break' || n.kind === 'Continue') && loopDepth === 0)
          add('S309', 'くり返しの外では使えません', n, where);
        if (n.kind === 'UserActionCall') {
          const a = symbols.actions.get(n.name);
          if (!a) add('S301', `動作「${n.name}」がありません`, n, where);
          else if (a.args.length !== n.args.length)
            add('S308', `動作「${n.name}」の受け取る値は${a.args.length}個です`+namedArgumentDetails(a.args,n.argumentNames), n, where);
          else { checkArguments(n, a, where); analyzeCallable(a, 'action', c); }
        }
        if (n.kind === 'MotionCommand' && n.op === 'POINT_TO')
          checkComponentTarget(n.args?.[0], null, c, where, '対象', ['マウス']);
        if (n.kind === 'CloneCommand' && n.op === 'CREATE_TARGET')
          checkComponentTarget(n.args?.[0], ['sprite'], c, where, 'クローン対象');
        if (
          n.kind === 'CloneCommand' &&
          ['CREATE_SELF', 'DELETE_SELF'].includes(n.op) &&
          c.targetType &&
          c.targetType !== 'sprite'
        )
          add('S304', '自分のクローン操作はキャラクターでだけ使えます', n, where);
        if (n.kind === 'LooksCommand' && n.op === 'SET_TARGET_TEXT')
          checkComponentTarget(n.args?.[0], ['label', 'button', 'box'], c, where, '文字対象');
        if (n.kind === 'LooksCommand' && n.op === 'SET_INPUT')
          checkComponentTarget(n.args?.[0], ['input'], c, where, '入力対象');
        if (n.kind === 'SoundCommand' && ['SAMPLE', 'SAMPLE_WAIT'].includes(n.op)) {
          const name = literalText(n.args?.[0]);
          if (name !== null && !project.sounds.some((x) => x.name === name))
            add('S301', `音「${name}」がありません`, n, where);
        }
        if (n.kind === 'LooksCommand' && n.op === 'SET_BACKDROP') {
          const name = literalText(n.args?.[0]);
          if (name !== null && !project.stage.backdrops.some((b) => b.name === name))
            add('S301', `背景「${name}」がありません`, n, where);
        }
        if (
          n.kind === 'LooksCommand' &&
          ['SET_COSTUME', 'NEXT_COSTUME', 'PREV_COSTUME'].includes(n.op) &&
          c.targetType &&
          c.targetType !== 'sprite'
        )
          add('S304', '衣装の命令はキャラクターでだけ使えます', n, where);
        if (n.kind === 'LooksCommand' && n.op === 'SET_COSTUME' && c.targetType === 'sprite') {
          const name = literalText(n.args?.[0]),
            comp = project.components.find((x) => x.id === c.targetId);
          if (name !== null && comp && !comp.costumes.some((co) => co.name === name))
            add('S301', `衣装「${name}」がありません`, n, where);
        }
        if (
          n.kind === 'LooksCommand' &&
          n.op === 'SET_SELF_TEXT' &&
          c.targetType &&
          !['label', 'button', 'box'].includes(c.targetType)
        )
          add('S304', '「文字を〜にする」は文字・ボタン・四角で使います', n, where);
        if (
          (n.kind === 'LooksCommand' && n.op === 'SET_COLOR') ||
          (n.kind === 'PenCommand' && n.op === 'SET_COLOR')
        ) {
          const name = literalText(n.args?.[0]);
          if (name !== null)
            try {
              resolveColor(name, { allowTransparent: false });
            } catch (_) {
              add('S304', `色「${name}」は使える色ではありません`, n, where);
            }
        }
        if (['MotionCommand', 'PenCommand'].includes(n.kind) && c.targetType === 'stage')
          add('S304', 'この命令は画面では使えません', n, where);
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
          add('S304', 'この見た目命令は画面では使えません', n, where);
        if (
          n.kind === 'ForEach' &&
          [
            ...(c.binders || []),
            ...(c.localVarNames || []),
            ...(c.localListNames || []),
            ...(c.args || []),
          ].includes(n.binder)
        )
          add('S312', `「${n.binder}」はこの範囲ですでに使われています`, n, where);
        if (n.kind === 'IfStatement') {
          walk(n.thenBody, c, where, loopDepth, false);
          walk(n.elseBody, c, where, loopDepth, false);
        } else if (
          ['RepeatCount', 'RepeatWhile', 'RepeatUntil', 'ForEach', 'Forever'].includes(n.kind)
        ) {
          const cc = n.kind === 'ForEach' ? { ...c, binders: [...(c.binders || []), n.binder] } : c;
          walk(n.body, cc, where, loopDepth + 1, false);
        }
      }
    };
    const visitedCallContexts = new Set(),
      pendingCallContexts = [];
    analyzeCallable = (def, kind, parentCtx) => {
      const key = `${kind}:${def.id}`,
        item = itemsByKey.get(key);
      if (!item) return;
      const ck = `${key}|${parentCtx.targetId || '*'}|${parentCtx.targetType || '*'}`;
      if (visitedCallContexts.has(ck)) return;
      visitedCallContexts.add(ck);
      const base = {
        event: parentCtx.event || null,
        targetType: parentCtx.targetType || null,
        targetId: parentCtx.targetId || null,
        definition: def,
        definitionKind: kind,
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
          `計算「${item.definition.name}」の最後は「〜を返す」にします`,
          exec[exec.length - 1] || { sourceSpan: { startLine: 1, startColumn: 1 } },
          item.key,
        );
      for (let j = 0; j < exec.length - 1; j++)
        if (exec[j].kind === 'ReturnStatement')
          add('S306', '「返す」は計算の最後に1回だけ置きます', exec[j], item.key);
    };
    for (const item of compiled.items) {
      if (rootKeys && !rootKeys.has(item.key)) continue;
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
      };
      for (const d of staticScaleDiagnostics(item.ast, item.key))
        add(d.code, d.message, { sourceSpan: { startLine: d.line, startColumn: d.column } }, d.where);
      walk(item.ast.body, base, item.key, 0, true);
      for (const rule of item.ast.rules || []) {
        const c = actorContext(rule.actorRef, { ...base, node: rule }, rule, item.key);
        if (c.targetType === 'stage') add('S304', '動き続ける対象に部品を選んでください', rule, item.key);
        if (item.definitionKind) add('S305', '動き続ける約束はきっかけの本文に置いてください', rule, item.key);
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
    const parsed = parseSyntax(source, { targetId: script.targetId, event: script.event,
      symbols: buildSymbols(project) });
    return scriptMetadataFromHeading(parsed.ast?.heading, script, project);
  }
  function scriptMetadataFromHeading(heading, script, project) {
    if (!heading) return { targetId: script.targetId, event: script.event, filter: script.filter };
    const targetId = heading.actorRef?.kind === 'named'
      ? (heading.actorRef.targetId || ((heading.actorRef.name === '画面' || heading.actorRef.name === project.stage.name) ? 'stage' :
        project.components.find((c) => c.name === heading.actorRef.name)?.id)) : script.targetId;
    const type = targetId === 'stage' ? 'stage' : project.components.find((c) => c.id === targetId)?.type;
    if (!type) throw new AkariError('S301', '見出しの対象が見つかりません');
    if (!EVENT_BY_TYPE[type]?.includes(heading.event))
      throw new AkariError('F506', 'この部品では使えないできごとです');
    return { targetId, event: heading.event, filter: heading.filter };
  }
  function updateScriptSource(script, source, project) {
    const metadata = scriptHeadingMetadata(source, script, project);
    const before=parseSyntax(script.source,{symbols:buildSymbols(project)}).ast,after=parseSyntax(source,{symbols:buildSymbols(project)}).ast;
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
    const owners = new Map([['stage', 'stage'], ...project.components.map(c => [c.id, c.type])]);
    const keys = new Set();
    const register = (key, ownerId, source) => {
      if (!owners.has(ownerId) || keys.has(key) || typeof source !== 'string')
        throw new AkariError('F503', 'コードの所属先・識別子・本文が不正です');
      keys.add(key);
    };
    for (const s of project.scripts) {
      register(scriptSourceKey(s), s.targetId, s.source);
      if (!EVENT_BY_TYPE[owners.get(s.targetId)]?.includes(s.event))
        throw new AkariError('F506', 'この部品では使えないできごとです');
    }
    for (const [kind, definitions] of [['action', project.actions], ['function', project.functions]])
      for (const d of definitions) {
        register(`${kind}:${d.id}`, d.ownerId, d.source);
        if (d.ownerId !== 'stage') throw new AkariError('F503', '共通コードは画面に所属させてください');
      }
    return [
      ...project.scripts.map(s => ({
        key: scriptSourceKey(s), ownerId: s.targetId, id: s.id, scriptId: s.id,
        kind: 'script', event: s.event, filter: s.filter, source: s.source,
        title: EVENT_LABELS[s.event],
        context: { id: s.id, scriptId: s.id, unitIds:s.document?.unitIds, filter: s.filter, ownerId: s.targetId, targetId: s.targetId,
          targetType: s.targetId === 'stage' ? 'stage' : project.components.find(c => c.id === s.targetId).type,
          event: s.event, args: [], definition: null, definitionKind: null },
      })),
      ...[['action', project.actions], ['function', project.functions]].flatMap(([kind, definitions]) =>
        definitions.map(d => ({
          key: `${kind}:${d.id}`, ownerId: d.ownerId, kind, source: d.source,
          title: `${kind === 'action' ? '手順' : '答えを求める'}「${d.name}」`,
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
    const actor = ref => ref?.kind === 'named' ? ref.targetId || (ref.name === '画面' || ref.name === project.stage.name ? 'stage' : project.components.find(c => c.name === ref.name)?.id) : null;
    for (const record of records) {
      const parsed = parseSyntax(record.source, { ...record.context, symbols });
      const ownerName = record.ownerId === 'stage' ? project.stage.name : project.components.find(c => c.id === record.ownerId)?.name;
      const location = node => ({ sourceKey: record.key, ownerId: record.ownerId, title: [ownerName, record.title || '本文'].filter(Boolean).join(' / '), line: node?.sourceSpan?.startLine || 1 });
      if (record.incomplete) uncertain.push({ ...location(), kind: null, reason: '確定していない入力があり、参照先をすべて調べられません' });
      if (!parsed.ast) { uncertain.push({ ...location(), kind: null, reason: '未完成の本文があり、参照先をすべて調べられません' }); continue; }
      const paths = new WeakMap();
      const indexPaths = (node,path=[]) => {if(!node||typeof node!=='object')return;paths.set(node,path);for(const [key,value]of Object.entries(node)){if(['sourceSpan','source'].includes(key))continue;if(Array.isArray(value))value.forEach((child,i)=>indexPaths(child,[...path,key,i]));else if(value&&typeof value==='object')indexPaths(value,[...path,key]);}};
      indexPaths(parsed.ast);
      const local = syntaxItem(record.key, parsed.ast, record.context);
      const localNames = new Set([...(record.context.args || []), ...local.localVarNames, ...local.localListNames]);
      const add = (resource, node, binding = 'name') => {
        const range = SOURCE_RANGES.get(node)?.range;
        references.push({ ...location(node), resourceKey: resource.key, name: resource.name, binding, nodePath: paths.get(node),
          ...(range ? { range: { start: range.start, end: range.end } } : {}) });
      };
      const named = (kind, expr, ownerId, special = []) => {
        if (expr?.kind !== 'StringLiteral') {
          uncertain.push({ ...location(expr), kind, targetOwnerId: ownerId || null, reason: '実行中に決まる名前を使っています' }); return;
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
        if (node.kind === 'Hole') uncertain.push({ ...location(node), kind: null, reason: 'まだ選んでいない役割があります' });
        if (node.kind === 'UserActionCall' || node.kind === 'UserFunctionCall') {
          const kind = node.kind === 'UserActionCall' ? 'action' : 'function';
          for (const r of resources.filter(r => r.kind === kind && r.name === node.name)) add(r, node);
        }
        if (node.kind === 'VariableRead') data(node, node, ownerId, bound);
        if (node.target?.name) data(node.target, node.target, ownerId, bound);
        if (node.kind === 'LooksCommand' && node.op === 'SET_COSTUME') named('costume', node.args?.[0], ownerId);
        if (node.kind === 'LooksCommand' && node.op === 'SET_BACKDROP') named('backdrop', node.args?.[0]);
        if (node.kind === 'SoundCommand' && ['SAMPLE', 'SAMPLE_WAIT'].includes(node.op)) named('sound', node.args?.[0]);
        if (node.kind === 'MotionCommand' && node.op === 'POINT_TO') named('component', node.args?.[0], null, ['マウス']);
        if (node.kind === 'CloneCommand' && node.op === 'CREATE_TARGET') named('component', node.args?.[0]);
        if (node.kind === 'LooksCommand' && ['SET_TARGET_TEXT', 'SET_INPUT'].includes(node.op)) named('component', node.args?.[0]);
        if (node.kind === 'SensorRead' && ['INPUT_VALUE', 'DISTANCE_TO', 'TOUCHING'].includes(node.sensor)) named('component', node.arg, null, ['マウス', '端']);
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
    if (!resource) throw new AkariError('F503', '変更する参照先がありません');
    return { resource, references: graph.references.filter(r => r.resourceKey === resourceKey),
      uncertain: graph.uncertain.filter(r => (!r.kind || r.kind === resource.kind) && (!r.targetOwnerId || r.targetOwnerId === resource.ownerId)) };
  }
  function prepareBindingRename(project, resourceKey, newName, options = {}) {
    const graph = buildProjectReferenceGraph(project, options), resource = graph.resources.find(r => r.key === resourceKey);
    if (!resource) throw new AkariError('F503', '変更する名前がありません');
    validateResourceName(newName, '名前');
    if (newName === resource.name) return cloneDesignProject(project);
    if (graph.uncertain.some(r=>!r.kind||r.kind===resource.kind)) throw new AkariError('S301', '未完成または実行中に決まる参照があります。本文を確定してから名前を変えてください');
    const next = cloneDesignProject(project), items = resource.kind === 'component' ? [next.stage, ...next.components]
      : resource.kind === 'data' ? (resource.ownerId === 'stage' ? next.projectData : next.components.find(c => c.id === resource.ownerId).localData)
      : next[resource.kind === 'action' ? 'actions' : 'functions'];
    const siblings = Array.isArray(items) ? items : [...items.variables, ...items.lists];
    if ((resource.kind === 'action' || resource.kind === 'function' ? [...next.actions, ...next.functions] : siblings).some(d => d.id !== resource.id && d.name === newName))
      throw new AkariError('F503', '同じ所属に同じ名前があります。別の名前を選んでください');
    siblings.find(d => d.id === resource.id).name = newName;
    validateDesignProject(next);
    const at = (root, path) => path.reduce((value,key) => value?.[key],root), grouped = new Map();
    for (const ref of graph.references.filter(r => r.resourceKey === resourceKey)) {
      if (options.drafts?.some(d => d.key === ref.sourceKey)) throw new AkariError('S301', '編集中の定義を保存してから名前を変えてください');
      if (graph.references.some(r => r.sourceKey === ref.sourceKey && r.binding === ref.binding && stableJson(r.nodePath) === stableJson(ref.nodePath) && r.resourceKey !== resourceKey))
        throw new AkariError('S301', '同じ呼び方が複数の対象を指します。所属や対象を明示してから名前を変えてください');
      const rows = grouped.get(ref.sourceKey) || []; rows.push(ref); grouped.set(ref.sourceKey,rows);
    }
    for (const record of sourceRegistry(project)) {
      const refs = grouped.get(record.key); if (!refs) continue;
      const session = createEditorSession(record.key,record.source,record.context,project), tree = cloneDesignProject(session.blockView), index = buildBlockIndex(tree), edits = [];
      if (!session.syntaxAst || !tree) throw new AkariError('S301', '本文の参照を確定できません');
      for (const ref of refs) {
        const entry = [...session.nodeMap].find(([,loc]) => stableJson(loc.path) === stableJson(ref.nodePath));
        if (!entry) throw new AkariError('F503', '名前を使っている場所を確認できません');
        const [id,loc] = entry, node = index.get(id).node, original = at(session.syntaxAst,ref.nodePath);
        if (ref.binding === 'actor') {
          const actor = node.fields.heading?.actorRef || node.fields.actorRef;
          if (!actor || actor.name !== resource.name) continue; // The stable alias 画面 keeps its spelling.
          actor.name = newName;
        } else if (ref.binding === 'literal') node.fields.value = newName;
        else node.fields.name = newName;
        // Inherited subjects update the semantic field, but have no source token.
        const range = ref.binding === 'actor' ? loc.surface?.actorRange : loc.surface?.range;
        if (ref.binding === 'actor' && !range) continue;
        if (!range) throw new AkariError('F503', '名前の原文位置を確認できません');
        if (ref.binding === 'actor') {
          const token=compactOutsideString(record.source.slice(range.start,range.end));
          if(![resource.name,`【${resource.name}】`,`「${resource.name}」`].includes(token))throw new AkariError('F503','主語の名前の原文位置を確認できません');
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
        if (candidates.length>1) throw new AkariError('S301', '名前の参照位置が複数あります。対象を明示してから名前を変えてください');
        if (candidates.length) edits.push(candidates[0]);
        else if (ref.binding!=='actor'&&!(original.kind==='UserActionCall'&&project.actions.find(a=>a.id===resource.id)?.callPhrase))
          throw new AkariError('F503', '名前の表記を確認できません');
      }
      let source=record.source,boundary=source.length;
      const unique=[...new Map(edits.map(e=>[e.start+':'+e.end,e])).values()].sort((a,b)=>b.start-a.start);
      for (const edit of unique) {if(edit.end>boundary)throw new AkariError('F503','名前の編集範囲が重なっています');source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);boundary=edit.start;}
      const parsed=parseSyntax(source,{...record.context,symbols:buildSymbols(next)});
      if(!parsed.ast||!astEquivalent(parsed.ast,blockDecode(tree)))throw new AkariError('S301','この表記では参照を保った変更を確認できません。名前の引用や対象を明示してください');
      const target=record.kind==='script'?scriptBySourceKey(next,record.key):next[record.kind==='action'?'actions':'functions'].find(d=>record.key===record.kind+':'+d.id);
      target.source=source;if(target.document&&source!==record.source)target.document.revision++;
    }
    const identity = rows => rows.map(r => [r.sourceKey,r.resourceKey,r.binding,r.nodePath]).map(stableJson).sort(), after = buildProjectReferenceGraph(next);
    if (after.uncertain.length!==graph.uncertain.length || stableJson(identity(graph.references)) !== stableJson(identity(after.references)))
      throw new AkariError('S301', '変更先の名前では参照先や所属が変わります。別の名前を選ぶか所属を明示してください');
    validateDesignProject(next);return next;
  }

  function prepareResourceRename(project, resourceKey, newName, options = {}) {
    const impact = resourceChangeImpact(project, resourceKey, options), resource = impact.resource;
    if (!['costume', 'backdrop', 'sound'].includes(resource.kind)) return prepareBindingRename(project,resourceKey,newName,options);
    validateResourceName(newName, '名前');
    if (newName === resource.name) return cloneDesignProject(project);
    if (impact.uncertain.length) throw new AkariError('S301', '参照先を調べられない本文があります。先に本文を確定してから名前を変えてください');
    const next = cloneDesignProject(project), items = resource.kind === 'costume'
      ? next.components.find(c => c.id === resource.ownerId).costumes : resource.kind === 'backdrop' ? next.stage.backdrops : next.sounds;
    if (items.some(x => x.id !== resource.id && x.name === newName)) throw new AkariError('F503', '同じ名前があります');
    const graph = buildProjectReferenceGraph(project, options), grouped = new Map();
    for (const ref of impact.references) {
      if (ref.binding !== 'literal' || !ref.range || options.drafts?.some(r => r.key === ref.sourceKey)) throw new AkariError('S301', '書きかけを確定してから名前を変えてください');
      if (graph.references.some(other => other.sourceKey === ref.sourceKey && other.range?.start === ref.range.start && other.range?.end === ref.range.end && other.resourceKey !== resourceKey))
        throw new AkariError('S301', '同じ呼び方が複数の参照先を持っています。対象を明示してから名前を変えてください');
      const edits = grouped.get(ref.sourceKey) || []; if (!edits.some(e => e.start === ref.range.start && e.end === ref.range.end)) edits.push(ref.range); grouped.set(ref.sourceKey, edits);
    }
    const replacement = formatExpression({ kind: 'StringLiteral', value: newName });
    for (const [key, edits] of grouped) {
      const record = key.startsWith('script:') ? scriptBySourceKey(next, key) : [...next.actions, ...next.functions].find(d => key.endsWith(':' + d.id));
      if (!record) throw new AkariError('F503', '名前を変える本文がありません');
      for (const { start, end } of edits.sort((a, b) => b.start - a.start)) {
        const literal = parseExpression(record.source.slice(start, end), buildSymbols(project));
        if (literal.kind !== 'StringLiteral' || literal.value !== resource.name) throw new AkariError('F503', '参照箇所の位置を確認できません');
        record.source = record.source.slice(0, start) + replacement + record.source.slice(end);
      }
      // Only a literal token changed; document ownership and unit IDs stay fixed.
      if (record.document) record.document.revision++;
    }
    items.find(x => x.id === resource.id).name = newName;
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
    if(items.filter(item=>!item.definitionKind).length>LIMITS.scripts)errors.push({code:'F504',message:'できごとの数が上限を超えています',line:0,column:1,where:'project'});
    const rules = items.flatMap(item => (item.ast.rules || []).map((rule, index) => ({
      ...rule, id: `${item.key}:rule:${index}`, targetId: item.targetId || item.ownerId,
    })));
    return { symbols, items, errors, rules, astByKey: syntaxItemMap(items,errors) };
  }
  function syntaxItemMap(items,errors) {
    const map=new Map();
    for(const item of items){
      if(map.has(item.key))errors.push({code:'F503',message:'できごとの識別子が重複しています',line:0,column:1,where:item.documentKey||item.key});
      else map.set(item.key,item.ast);
    }
    return map;
  }
  function documentSyntaxItems(ast,key,context,project,errors) {
    const first={...ast};delete first.units;
    if(context.unitIds&&context.unitIds.length!==1+(ast.units?.length||0))errors.push({code:'F503',message:'文書のできごとと識別子の数が一致しません',line:0,column:1,where:key});
    return [first,...(ast.units||[])].map((unit,index)=>{
      // Imported documents may not yet have persistent unit IDs. Their runtime
      // keys use a separate namespace, never a guess in the user ID namespace.
      const id=context.unitIds?.[index]||(index?`document:${key}:unit:${index+1}`:context.id);
      const unitKey=context.unitIds||index?'script:'+id:key,heading=unit.heading;
      let resolved={...context,...(ast.units||context.unitIds?{id,scriptId:id,documentKey:key}:{})};
      if(heading){
        const ref=heading.actorRef,actor=ref?.kind==='named'?(ref.name===project.stage.name||ref.name==='画面'?{id:'stage',type:'stage'}:project.components.find(c=>c.name===ref.name)):
          context.targetId==='stage'?{id:'stage',type:'stage'}:project.components.find(c=>c.id===context.targetId);
        if(!actor||!EVENT_BY_TYPE[actor.type]?.includes(heading.event))errors.push({code:'S304',message:'この主語ではそのきっかけを使えません',line:unit.sourceSpan?.startLine||1,column:1,where:key});
        else resolved={...resolved,ownerId:actor.id,targetId:actor.id,targetType:actor.type,event:heading.event,filter:heading.filter||null};
      }
      return syntaxItem(unitKey,unit,resolved);
    });
  }
  function analyzeAst(ast, project, context = {}) {
    validateSyntaxAst(ast);
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
    return analyzeProject(candidate, compiled, { rootKeys: new Set(items.map(item=>item.key)) });
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
    compiled.errors.push(...analyzeProject(project, compiled));
    return compiled;
  }

  // Independent of the formatter and block schema: executable hierarchy plus source-order comment anchors.
  function syntaxComparison(ast) {
    const consumedUnit = (node, key, i) => {
      if (key === 'count' && node.kind === 'RepeatCount') return '回';
      if (key === 'seconds' && ['WaitTime', 'Say', 'ContinuousRule'].includes(node.kind)) return '秒';
      if (key === 'distance' && node.kind === 'ContinuousRule') return '歩';
      if (key === 'index' && ['ListItemRead', 'ListInsert', 'ListReplace', 'ListDelete'].includes(node.kind)) return '番目';
      if (key !== 'args') return null;
      if (node.kind === 'MotionCommand' && !['POINT_TO', 'BOUNCE'].includes(node.op))
        return ['SET_DIRECTION', 'TURN_RIGHT', 'TURN_LEFT'].includes(node.op) ? '度'
          : ['GLIDE', 'GLIDE_DIRECTION'].includes(node.op) && i === 0 ? '秒' : '歩';
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
        if (key === 'actorRef' && child?.kind === 'self') continue;
        if (key === 'argumentNames' && Array.isArray(child) && child.length === 0) continue;
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
    if (o + 2 > b.length) throw new AkariError('F509', 'バイナリ境界が不正です');
    return b[o] | (b[o + 1] << 8);
  }
  function u32le(b, o) {
    if (o + 4 > b.length) throw new AkariError('F509', 'バイナリ境界が不正です');
    return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] * 0x1000000)) >>> 0;
  }
  function u16be(b, o) {
    if (o + 2 > b.length) throw new AkariError('F509', 'バイナリ境界が不正です');
    return (b[o] << 8) | b[o + 1];
  }
  function u32be(b, o) {
    if (o + 4 > b.length) throw new AkariError('F509', 'バイナリ境界が不正です');
    return (b[o] * 0x1000000 + b[o + 1] * 0x10000 + b[o + 2] * 0x100 + b[o + 3]) >>> 0;
  }
  function ascii(b, o, n) {
    if (o + n > b.length) return '';
    return String.fromCharCode(...b.subarray(o, o + n));
  }
  function checkImageLimits(w, h) {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1)
      throw new AkariError('F510', '画像寸法が不正です');
    if (w > LIMITS.imageWidth || h > LIMITS.imageHeight || w * h > LIMITS.imagePixels)
      throw new AkariError('F504', '画像の寸法または画素数が上限を超えています');
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
        throw new AkariError('F510', 'PNGのIHDRが不正です');
      const w = u32be(bytes, 16),
        h = u32be(bytes, 20);
      checkImageLimits(w, h);
      let pos = 8,
        actl = false;
      while (pos + 12 <= bytes.length) {
        const len = u32be(bytes, pos),
          end = pos + 12 + len;
        if (end > bytes.length) throw new AkariError('F509', 'PNG chunk境界が不正です');
        const type = ascii(bytes, pos + 4, 4);
        if (type === 'acTL') actl = true;
        pos = end;
        if (type === 'IEND') break;
      }
      if (actl) throw new AkariError('F509', 'APNGは使えません');
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
        if (pos + 2 > bytes.length) throw new AkariError('F509', 'JPEG segment長が不正です');
        const len = u16be(bytes, pos);
        if (len < 2 || pos + len > bytes.length)
          throw new AkariError('F509', 'JPEG segment境界が不正です');
        if (sof.has(m)) {
          if (len < 7) throw new AkariError('F510', 'JPEG SOFが不正です');
          h = u16be(bytes, pos + 3);
          w = u16be(bytes, pos + 5);
          break;
        }
        if (m === 0xda) break;
        pos += len;
      }
      if (!w || !h) throw new AkariError('F510', 'JPEG寸法を取得できません');
      checkImageLimits(w, h);
      return { mime: 'image/jpeg', width: w, height: h };
    }
    if (bytes.length >= 20 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
      const riff = u32le(bytes, 4);
      if (riff + 8 > bytes.length) throw new AkariError('F509', 'WebP RIFF境界が不正です');
      let pos = 12,
        w = 0,
        h = 0,
        animated = false;
      while (pos + 8 <= bytes.length) {
        const type = ascii(bytes, pos, 4),
          len = u32le(bytes, pos + 4),
          ps = pos + 8,
          end = ps + len;
        if (end > bytes.length) throw new AkariError('F509', 'WebP chunk境界が不正です');
        if (type === 'ANIM' || type === 'ANMF') animated = true;
        if (type === 'VP8X') {
          if (len < 10) throw new AkariError('F510', 'WebP VP8Xが不正です');
          if (bytes[ps] & 0x02) animated = true;
          w = 1 + bytes[ps + 4] + (bytes[ps + 5] << 8) + (bytes[ps + 6] << 16);
          h = 1 + bytes[ps + 7] + (bytes[ps + 8] << 8) + (bytes[ps + 9] << 16);
        } else if (type === 'VP8L' && !w) {
          if (len < 5 || bytes[ps] !== 0x2f) throw new AkariError('F510', 'WebP VP8Lが不正です');
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
            throw new AkariError('F510', 'WebP VP8 frameが不正です');
          w = u16le(bytes, ps + 6) & 0x3fff;
          h = u16le(bytes, ps + 8) & 0x3fff;
        }
        pos = end + (len & 1);
      }
      if (animated) throw new AkariError('F509', 'animated WebPは使えません');
      if (!w || !h) throw new AkariError('F510', 'WebP寸法を取得できません');
      checkImageLimits(w, h);
      return { mime: 'image/webp', width: w, height: h };
    }
    throw new AkariError('F509', '使える画像はPNG/JPEG/WebPだけです');
  }
  function parseWav(bytes) {
    if (bytes.length < 44 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE')
      throw new AkariError('F509', 'WAVではありません');
    const riff = u32le(bytes, 4);
    if (riff + 8 > bytes.length) throw new AkariError('F511', 'WAV RIFF境界が不正です');
    let pos = 12,
      fmt = null,
      data = null;
    while (pos + 8 <= bytes.length) {
      const type = ascii(bytes, pos, 4),
        len = u32le(bytes, pos + 4),
        ps = pos + 8,
        end = ps + len;
      if (end > bytes.length) throw new AkariError('F511', 'WAV chunk境界が不正です');
      if (type === 'fmt ') {
        if (fmt) throw new AkariError('F511', 'WAV fmt chunkが重複しています');
        if (len < 16) throw new AkariError('F511', 'WAV fmt chunkが短すぎます');
        fmt = {
          audioFormat: u16le(bytes, ps),
          channels: u16le(bytes, ps + 2),
          sampleRate: u32le(bytes, ps + 4),
          byteRate: u32le(bytes, ps + 8),
          blockAlign: u16le(bytes, ps + 12),
          bitsPerSample: u16le(bytes, ps + 14),
        };
      } else if (type === 'data') {
        if (data) throw new AkariError('F511', 'WAV data chunkが重複しています');
        data = bytes.slice(ps, end);
      }
      pos = end + (len & 1);
    }
    if (!fmt || !data) throw new AkariError('F511', 'WAVにfmt/dataが必要です');
    if (fmt.audioFormat !== 1) throw new AkariError('F509', 'WAVはPCMだけ対応しています');
    if (![8, 16, 24, 32].includes(fmt.bitsPerSample))
      throw new AkariError('F511', 'WAV bit depthが未対応です');
    if (
      !fmt.channels ||
      !fmt.sampleRate ||
      !fmt.blockAlign ||
      !data.length ||
      data.length % fmt.blockAlign !== 0 ||
      fmt.blockAlign !== (fmt.channels * fmt.bitsPerSample) / 8 ||
      fmt.byteRate !== fmt.sampleRate * fmt.blockAlign
    )
      throw new AkariError('F511', 'WAV fmt値が不整合です');
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
      throw new AkariError('F511', '有効なMP3 frameを確認できません');
    const ver = (bytes[1] >> 3) & 3,
      layer = (bytes[1] >> 1) & 3,
      br = (bytes[2] >> 4) & 15,
      sri = (bytes[2] >> 2) & 3;
    if (ver === 1 || layer !== 1 || br === 0 || br === 15 || sri === 3)
      throw new AkariError('F511', '有効なMP3 frameを確認できません');
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
        if (bytes[i] & 0x80) throw new AkariError('F511', 'ID3v2 sizeが不正です');
      const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9],
        footer = bytes[3] === 4 && bytes[5] & 0x10 ? 10 : 0;
      start = 10 + size + footer;
      if (start > end) throw new AkariError('F511', 'ID3v2 tag境界が不正です');
    }
    if (end - start >= 128 && ascii(bytes, end - 128, 3) === 'TAG') end -= 128;
    const out = bytes.slice(start, end);
    parseMp3FrameMeta(out);
    return out;
  }
  function parseFlac(bytes) {
    const bad = () => { throw new AkariError('F511', 'FLACの構造が不正です'); };
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
    const bad = () => { throw new AkariError('F511', 'Ogg Opusの構造または検査値が不正です'); };
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
      throw new AkariError('F509', 'OggはOpusだけ対応しています');
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
    const bad = () => { throw new AkariError('F511', 'M4Aの構造が不正です'); };
    const unsupported = () => { throw new AkariError('F509', 'M4Aは単一のAAC-LC音声だけ対応しています'); };
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
    if (!id3 && !frame) throw new AkariError('F509', '使える音声はMP3 / PCM WAV / M4A（AAC-LC）/ FLAC / Ogg Opusです');
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
      throw new AkariError('F511', '音声チャンネル数が範囲外です');
    if (
      !Number.isInteger(m.sampleRate) ||
      m.sampleRate < LIMITS.audioSampleRateMin ||
      m.sampleRate > LIMITS.audioSampleRateMax
    )
      throw new AkariError('F511', '音声sampleRateが範囲外です');
  }

  function awaitMedia(promise, code, disposeLate = null) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(
          new AkariError(
            code,
            '\u7d20\u6750\u306e\u51e6\u7406\u304c10\u79d2\u4ee5\u5185\u306b\u5b8c\u4e86\u3057\u307e\u305b\u3093\u3067\u3057\u305f',
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
      throw new AkariError('F510', '画像をデコードできません', 0, 0, e?.message || '');
    }
  }
  async function canonicalizeImage(fileBytes) {
    const bytes = fileBytes instanceof Uint8Array ? fileBytes : new Uint8Array(fileBytes);
    if (bytes.length > LIMITS.importFileBytes)
      throw new AkariError('F504', `取込元ファイルが${LIMITS.importFileBytes / 1048576}MiBを超えています`);
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
        throw new AkariError('F510', '画像を標準形式へ再エンコードできません');
      const out = new Uint8Array(await blob.arrayBuffer());
      if (out.length > LIMITS.imageBytes)
        throw new AkariError('F504', '標準化後の画像が4MiBを超えています');
      const post = sniffImage(out),
        check = await decodeImageBytes(out, post.mime);
      try {
        if (check.width !== post.width || check.height !== post.height)
          throw new AkariError('F510', '標準化後の画像寸法が一致しません');
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
    if (!AC) throw new AkariError('R415', 'このブラウザではWeb Audioを利用できません');
    return new AC();
  }
  async function decodeAudioMeta(bytes) {
    const ac = await audioContextForValidation();
    try {
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        buf = await awaitMedia(ac.decodeAudioData(copy), 'F511');
      return { duration: buf.duration, channels: buf.numberOfChannels, sampleRate: buf.sampleRate };
    } catch (e) {
      throw new AkariError('F511', '音声をデコードできません', 0, 0, e?.message || '');
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
        '音声の長さが範囲外です',
      );
    checkAudioContainerLimits(m);
  }
  async function canonicalizeAudio(fileBytes) {
    const bytes = fileBytes instanceof Uint8Array ? fileBytes : new Uint8Array(fileBytes);
    if (bytes.length > LIMITS.importFileBytes)
      throw new AkariError('F504', `取込元ファイルが${LIMITS.importFileBytes / 1048576}MiBを超えています`);
    const sn = sniffAudio(bytes),
      containerMeta = audioContainerMeta(sn);
    checkAudioContainerLimits(containerMeta);
    if (sn.duration != null) checkAudioLimits({ ...containerMeta, duration: sn.duration });
    const out = sn.mime === 'audio/wav' ? rebuildCanonicalWav(sn.parsed) : sn.clean;
    if (out.length > LIMITS.audioBytes)
      throw new AkariError('F504', '標準化後の音声が6MiBを超えています');
    const decoded = await decodeAudioMeta(out);
    if (decoded.channels !== containerMeta.channels)
      throw new AkariError('F511', '音声containerとdecode後のチャンネル数が一致しません');
    if (sn.duration != null && Math.abs(decoded.duration - sn.duration) > 0.02)
      throw new AkariError('F511', '音声containerとdecode後の長さが一致しません');
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
      if (!a) throw new AkariError('F503', `参照先asset「${id}」がありません`);
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
      if (digestSeen.has(dk)) throw new AkariError('F503', '同一バイナリassetが重複しています');
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
      throw new AkariError('F504', '作品内素材の合計が上限を超えています');
    for (const b of project.stage.backdrops)
      if (b.kind === 'image' && store.get(b.assetId)?.kind !== 'image')
        throw new AkariError('F509', '画像背景が画像asset以外を参照しています');
    for (const c of project.components)
      if (c.type === 'sprite')
        for (const co of c.costumes)
          if (co.kind === 'image' && store.get(co.assetId)?.kind !== 'image')
            throw new AkariError('F509', '画像衣装が画像asset以外を参照しています');
    for (const snd of project.sounds)
      if (store.get(snd.assetId)?.kind !== 'audio')
        throw new AkariError('F509', '音素材がaudio asset以外を参照しています');
    if (serializedAssetIds) {
      if (
        serializedAssetIds.size !== reachable.size ||
        [...serializedAssetIds].some((id) => !reachable.has(id))
      )
        throw new AkariError('F503', '保存Projectにorphan assetまたは不足assetがあります');
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
      direction: c.direction,
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
      if (!a) throw new AkariError('F503', `asset「${id}」がありません`);
      if (
        !(a.bytes instanceof Uint8Array) ||
        a.bytes.length !== a.byteLength ||
        sha256Fallback(a.bytes) !== a.sha256
      )
        throw new AkariError('F508', `asset「${id}」の保存前整合性が一致しません`);
      if (a.kind === 'image') {
        const sn = sniffImage(a.bytes);
        if (sn.mime !== a.mime)
          throw new AkariError('F509', `asset「${id}」の画像MIMEが一致しません`);
      } else if (a.kind === 'audio') {
        const sn = sniffAudio(a.bytes);
        if (sn.mime !== a.mime)
          throw new AkariError('F509', `asset「${id}」の音声MIMEが一致しません`);
      } else throw new AkariError('F509', `asset「${id}」のkindが不正です`);
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
      scripts: project.scripts.map((x) => ({
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
      throw new AkariError('F503', '保存Projectのroot項目が仕様と一致しません');
    if (!Array.isArray(root.assets) || root.assets.length > LIMITS.assets)
      throw new AkariError('F504', 'asset数が上限を超えています');
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
        throw new AkariError('F503', 'asset recordに未知または不足項目があります');
      if (!safeId(a.id)) throw new AkariError('F503', 'asset IDが不正です');
      if (ids.has(a.id) || assetIds.has(a.id))
        throw new AkariError('F505', `ID「${a.id}」が重複しています`);
      ids.add(a.id);
      assetIds.add(a.id);
      if (a.kind === 'image') {
        ic++;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(a.mime))
          throw new AkariError('F509', 'image assetのMIMEが未対応です');
        if (!Number.isInteger(a.byteLength) || a.byteLength < 1 || a.byteLength > LIMITS.imageBytes)
          throw new AkariError('F504', '画像asset byteLengthが上限外です');
      } else if (a.kind === 'audio') {
        ac++;
        if (!['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/flac', 'audio/ogg'].includes(a.mime))
          throw new AkariError('F509', 'audio assetのMIMEが未対応です');
        if (!Number.isInteger(a.byteLength) || a.byteLength < 1 || a.byteLength > LIMITS.audioBytes)
          throw new AkariError('F504', '音asset byteLengthが上限外です');
      } else throw new AkariError('F509', 'asset kindが未対応です');
      if (!/^[0-9a-f]{64}$/.test(a.sha256)) throw new AkariError('F508', 'SHA-256表記が不正です');
      const n = decodedBase64Length(a.dataBase64);
      if (n !== a.byteLength)
        throw new AkariError('F508', 'Base64予想byte数とbyteLengthが一致しません');
      predicted += n;
      if (predicted > LIMITS.assetRawTotal)
        throw new AkariError('F504', `素材raw bytes合計が${LIMITS.assetRawTotal / 1048576}MiBを超えています`);
      const dk = `${a.kind}:${a.sha256}:${a.byteLength}`;
      if (digestKeys.has(dk)) throw new AkariError('F503', '保存Projectに重複assetがあります');
      digestKeys.add(dk);
    }
    if (ic > LIMITS.imageAssets || ac > LIMITS.audioAssets)
      throw new AkariError('F504', '画像または音asset数が上限を超えています');
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
      throw new AkariError('F503', '手順・答えを求める定義の下書きが正しくありません');
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
          '\u4e0b\u66f8\u304d\u306e\u6587\u5b57\u6570\u304c\u4e0a\u9650\u3092\u8d85\u3048\u3066\u3044\u307e\u3059',
        );
    if (d.callPhrase !== undefined && (d.type !== 'action' || typeof d.callPhrase !== 'string' || cpLen(d.callPhrase) > 80))
      throw new AkariError('F503', '短い呼び方は80文字以内で書いてください');
    if (d.editId && !safeId(d.editId))
      throw new AkariError('F503', '\u4e0b\u66f8\u304d\u306eID\u304c\u4e0d\u6b63\u3067\u3059');
    return { ...d };
  }
  function validateEditorState(state,project) {
    if(!exactKeys(state,['version','revision','selectedId','currentEvent','selectedScriptId','uiLevel','sourceOverviewOpen','editorModes','callableDraft','pendingEditors','views'])||state.version!==1||!Number.isSafeInteger(state.revision)||state.revision<0)
      throw new AkariError('F503','編集状態の契約または版が正しくありません');
    const actor=state.selectedId==='stage'?{type:'stage'}:project.components.find(c=>c.id===state.selectedId);
    if(!actor||!EVENT_BY_TYPE[actor.type]?.includes(state.currentEvent)||
      state.selectedScriptId!==null&&!project.scripts.some(s=>s.id===state.selectedScriptId&&s.targetId===state.selectedId&&s.event===state.currentEvent)||
      !['basic','advanced'].includes(state.uiLevel)||typeof state.sourceOverviewOpen!=='boolean'||
      !exactKeys(state.editorModes,['script','draft'])||!Object.values(state.editorModes).every(mode=>['code','blocks'].includes(mode)))
      throw new AkariError('F503','編集画面の選択が正しくありません');
    validateCallableDraftState(state.callableDraft);
    const pending=state.pendingEditors;
    if(!Array.isArray(pending)||pending.length>2||new Set(pending.map(d=>d.kind)).size!==pending.length)
      throw new AkariError('F503','作文の下書きが正しくありません');
    for(const saved of pending){
      if(!exactKeys(saved,['kind','ownerKey','source','mode','pending','draftTree'])||!['script','draft'].includes(saved.kind)||!['code','blocks'].includes(saved.mode)||
        typeof saved.ownerKey!=='string'||saved.ownerKey.length>150||typeof saved.source!=='string'||cpLen(saved.source)>LIMITS.sourceEach||
        !saved.pending||typeof saved.pending!=='object'||Array.isArray(saved.pending)||JSON.stringify(saved.pending).length>LIMITS.sourceEach*4)
        throw new AkariError('F503','作文の下書きが正しくありません');
      if(saved.kind==='script'&&!sourceRegistry(project).some(row=>row.key===saved.ownerKey)&&saved.ownerKey!==`script:${state.selectedId}:${state.currentEvent}`)
        throw new AkariError('F503','下書きの本文が見つかりません');
      if(saved.kind==='script'&&saved.ownerKey!==(state.selectedScriptId?`script:${state.selectedScriptId}`:`script:${state.selectedId}:${state.currentEvent}`))
        throw new AkariError('F503','下書きの選択先が一致しません');
      if(saved.kind==='draft'&&!state.callableDraft)throw new AkariError('F503','定義の下書きが見つかりません');
      if(saved.draftTree!==null){const ast=blockDecode(saved.draftTree,{allowHoles:true});validateSyntaxAst(ast,'script',{allowHoles:true});if(cpLen(formatScript(ast,{allowHoles:true}))>LIMITS.sourceEach)throw new AkariError('F504','ブロックの下書きが長すぎます');}
      if(saved.pending.field){
        const path=saved.pending.nodePath;
        if(typeof saved.pending.field!=='string'||typeof saved.pending.value!=='string'||!Array.isArray(path)||path.length>LIMITS.blockDepth*4||path.some(k=>typeof k!=='string'&&!Number.isInteger(k)))
          throw new AkariError('F503','書きかけの入力欄が正しくありません');
        const record=sourceRegistry(project).find(row=>row.key===saved.ownerKey),context=saved.kind==='draft'?{definitionKind:state.callableDraft.type,args:[]}:(record?.context||{}),
          ast=saved.draftTree?blockDecode(saved.draftTree,{allowHoles:true}):parseSyntax(saved.kind==='draft'?state.callableDraft.source:record?.source||'',{...context,symbols:buildSymbols(project)}).ast;
        let node=saved.draftTree||blockEncode(ast,{allowHoles:true}).tree;for(const k of path){if(!node||!Object.hasOwn(node,k))throw new AkariError('F503','書きかけの入力先が見つかりません');node=node[k];}
        const schema=BLOCK_SCHEMA_BY_ID.get(node?.schemaId),field=schema&&[...schema.fields,...schema.annotations].find(f=>f.key===saved.pending.field);
        if(!field)throw new AkariError('F503','書きかけの入力項目が見つかりません');
      }
    }
    const records=sourceRegistry(project);let total=records.reduce((n,row)=>n+cpLen(row.source),0);
    for(const saved of pending.filter(d=>d.kind==='script'))total+=cpLen(saved.source)-cpLen(records.find(row=>row.key===saved.ownerKey)?.source||'');
    if(state.callableDraft){const d=state.callableDraft;total+=cpLen(pending.find(row=>row.kind==='draft')?.source??d.source)-cpLen(records.find(row=>row.key===`${d.type}:${d.editId}`)?.source||'');}
    if(total>LIMITS.sourceTotal)throw new AkariError('F504','書きかけを含む作品全体の本文が長すぎます');
    if(!Array.isArray(state.views)||state.views.length>2)throw new AkariError('F503','編集位置が正しくありません');
    for(const view of state.views){
      if(!exactKeys(view,['kind','ownerKey','codeSelection','scrollState'])||!['script','draft'].includes(view.kind)||typeof view.ownerKey!=='string'||view.ownerKey.length>150||
        !exactKeys(view.codeSelection,['start','end','direction'])||!['none','forward','backward'].includes(view.codeSelection.direction)||
        ![view.codeSelection.start,view.codeSelection.end].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=LIMITS.sourceEach*2)||
        !exactKeys(view.scrollState,['codeTop','codeLeft'])||!Object.values(view.scrollState).every(n=>Number.isFinite(n)&&n>=0&&n<=1e9))throw new AkariError('F503','編集位置が正しくありません');
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
    const fail=()=>{throw new AkariError('F503','編集履歴の差分が正しくありません');};
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
      throw new AkariError('F503','編集履歴の位置が正しくありません');
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
    const fail=()=>{throw new AkariError('F503','自動保存の編集履歴が正しくありません');};
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
        `保存ファイルは${LIMITS.fileBytes / 1048576}MiBまでです`,
      );
    return text;
  }
  async function parseProjectFile(text) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > LIMITS.fileBytes)
      throw new AkariError(
        'F504',
        `作品ファイルは${LIMITS.fileBytes / 1048576}MiBまでです`,
      );
    text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const begin = text.lastIndexOf(MARKDOWN_BEGIN);
    let root;
    try {
      if (begin < 0 || !text.endsWith(MARKDOWN_END)) throw Error();
      root = JSON.parse(text.slice(begin + MARKDOWN_BEGIN.length, -MARKDOWN_END.length));
    } catch (_) {
      throw new AkariError(
        'F502',
        '作品データを読めません。対応する保存形式の .akari.md を選んでください',
      );
    }
    const { assetIds } = validateSerializedProjectStructure(root);
    if (text.slice(0, begin) !== markdownBody(root))
      throw new AkariError(
        'F512',
        'Markdown\u672c\u6587\u3068\u5fa9\u5143\u30c7\u30fc\u30bf\u304c\u4e00\u81f4\u3057\u307e\u305b\u3093\u3002\u7de8\u96c6\u4e2d\u306e\u4f5c\u54c1\u306f\u5909\u66f4\u3057\u3066\u3044\u307e\u305b\u3093\u3002',
      );
    const store = new AssetStore();
    for (const record of root.assets) store.addImmutable(await validateLoadedAssetRecord(record));
    const project = { ...root };
    delete project.assets;
    delete project.editorState;
    validateAssetReferences(project, store, { serializedAssetIds: assetIds });
    return { project, assetStore: store, diagnostics: compileProject(project).errors, ...(root.editorState?{editorState:root.editorState}:{}) };
  }
  async function validateLoadedAssetRecord(a) {
    const bytes = decodeBase64(a.dataBase64);
    if (bytes.length !== a.byteLength)
      throw new AkariError('F508', 'asset byteLengthが一致しません');
    const digest = await sha256(bytes);
    if (digest !== a.sha256) throw new AkariError('F508', 'asset SHA-256が一致しません');
    if (a.kind === 'image') {
      const sn = sniffImage(bytes);
      if (sn.mime !== a.mime) throw new AkariError('F509', '画像MIMEとmagicが一致しません');
      const dec = await decodeImageBytes(bytes, a.mime);
      try {
        if (dec.width !== sn.width || dec.height !== sn.height)
          throw new AkariError('F510', '画像header寸法とdecode寸法が一致しません');
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
    if (sn.mime !== a.mime) throw new AkariError('F509', '音声MIMEとcontainerが一致しません');
    if (a.mime === 'audio/mpeg' && !bytesEqual(sn.clean, bytes))
      throw new AkariError('F508', '保存MP3に除去対象metadataが残っています');
    if (a.mime === 'audio/wav') {
      const rebuilt = rebuildCanonicalWav(sn.parsed);
      if (!bytesEqual(rebuilt, bytes))
        throw new AkariError('F508', '保存WAVがcanonical形ではありません');
    }
    if (['audio/mp4', 'audio/flac', 'audio/ogg'].includes(a.mime) && !bytesEqual(sn.clean, bytes))
      throw new AkariError('F508', '保存音声がmetadata除去後のcanonical形ではありません');
    const containerMeta = audioContainerMeta(sn);
    checkAudioContainerLimits(containerMeta);
    if (sn.duration != null) checkAudioLimits({ ...containerMeta, duration: sn.duration });
    const decoded = await decodeAudioMeta(bytes);
    if (decoded.channels !== containerMeta.channels)
      throw new AkariError('F511', '音声containerとdecode後のチャンネル数が一致しません');
    if (sn.duration != null && Math.abs(decoded.duration - sn.duration) > 0.02)
      throw new AkariError('F511', '音声containerとdecode後の長さが一致しません');
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
      throw new AkariError('R411', '最初の値には数・文字・条件の答えなどの決まった値を使います');
    };
    const value = literal(ast);
    if (kind === 'variable' ? !scalar(value) : !listValue(value))
      throw new AkariError('R411', kind === 'variable' ? '変数の最初の値が正しくありません' : 'リストの最初の値は［値、値］の形で書きます');
    assertRuntimeValueLimit(value);
    return value;
  }
  function parseDataFormInitial(text,kind,{mode='literal',expectedUnit=null}={}) {
    if(!['variable','list'].includes(kind)||!['literal','lines'].includes(mode))throw new AkariError('F503','データの入れ方が正しくありません');
    let value;
    if(kind==='list'&&mode==='lines')value=String(text)===''?[]:String(text).replace(/\r\n?/g,'\n').split('\n');
    else value=parseLiteralForData(text,kind);
    if(kind==='variable'&&expectedUnit)value=quantity(numberInUnit(value,expectedUnit,'単位を決めた変数の初期値には数を入れてください'),expectedUnit);
    assertRuntimeValueLimit(value);return value;
  }

