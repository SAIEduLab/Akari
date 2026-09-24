function runVersion08Tests() {
    const results = [],
      test = (id, fn) => {
        try {
          fn();
          results.push({ id: '08 ' + id, pass: true, detail: 'PASS' });
        } catch (e) {
          results.push({
            id: '08 ' + id,
            pass: false,
            detail: (e.code || e.name) + ': ' + e.message,
          });
        }
      };
    const eq = (a, b) => {
      if (JSON.stringify(a) !== JSON.stringify(b))
        throw Error('expected ' + JSON.stringify(b) + '; got ' + JSON.stringify(a));
    };
    const ok = (v, m = 'assertion failed') => {
      if (!v) throw Error(m);
    };
    const sy = buildSymbols(makeDefaultProject());
    const clean = (v) =>
      Array.isArray(v)
        ? v.filter((x) => x?.kind !== 'CommentLine').map(clean)
        : v && typeof v === 'object'
          ? Object.fromEntries(
              Object.entries(v)
                .filter(
                  ([k]) =>
                    ![
                      'source',
                      'sourceSpan',
                      'raw',
                      'endLine',
                      'inlineComment',
                      'endComment',
                      'elseComment',
                      'hasElse',
                    ].includes(k),
                )
                .map(([k, x]) => [k, clean(x)]),
            )
          : v;
    const run = (source, targetId = 'stage', edit = () => {}) => {
      const p = makeDefaultProject();
      p.scripts = [{ targetId, event: 'start', source }];
      edit(p);
      const compiled = compileProject(p);
      ok(!compiled.errors.length, JSON.stringify(compiled.errors));
      const r = new RuntimeModel(p, {}),
        out = [],
        errors = [],
        effects = [];
      let time = 0;
      r.now = () => time;
      const q = new EventScheduler(p, compiled, r, {
        say: (id, v) => out.push(v),
        runtimeError: (t, e) => errors.push(e),
        stamp: (id) => effects.push('stamp'),
        penClear: () => effects.push('clear'),
        penLine: () => effects.push('line'),
        ask: (s, reply) => reply('回答'),
      });
      q.running = true;
      q.paused = true;
      q.spawnForRuntime(targetId, 'start');
      let steps = 0;
      while ((q.ready.length || q.blocked.size) && steps++ < 200) {
        time += 1000;
        q.recheckBlocked(true);
        if (q.ready.length) q.runTurn(true);
      }
      ok(!errors.length, errors.map((e) => e.code + ': ' + e.message).join(';'));
      return { p, r, q, out, effects, stop: () => q.stop() };
    };
    const samples = [
      'もし 点数が10以上なら、次のことをする。\n  次のことを3回くり返す。\n    10歩動く。\n  「終了」と言う。\nそうでなければ、次のことをする。\n  「不足」と言う。',
      'もし 真なら、次のことをする\n    次のことを2回繰り返す\n         次のことを3回くり返す\n             点数に1を足す\n点数と言う',
      '※ outer\nもし 真なら、次のことをする。\n※ comment does not close block\n  点数に1を足す。\n\nそうでなければ、次のことをする。\n   何もしない。\n点数と言う。',
      '条件（真かつ偽）が成り立つあいだ、次のことをくり返す。\n  何もしない。\n条件（真または偽）が成り立つまで、次のことをくり返す。\n  何もしない。',
      '名前一覧の各要素を項目として、次のことをくり返す。\n  項目と言う。',
    ];
    for (const [i, source] of samples.entries())
      test('AST roundtrip ' + i, () => {
        const ast = parseScript(source, sy),
          formatted = formatScript(ast);
        ok(!formatted.includes('ここまで'));
        eq(clean(parseScript(formatted, sy)), clean(ast));
        eq(formatScript(parseScript(formatted, sy)), formatted);
      });
    test('indent triple nesting execution', () => {
      const h = run(samples[1]);
      eq(h.out, ['6']);
      h.stop();
    });
    test('indent comments else and line numbers', () => {
      const h = run(samples[2]);
      eq(h.out, ['1']);
      eq(
        parseScript(samples[2], sy).body[1].thenBody.find((x) => x.kind === 'NumericUpdate')
          .sourceSpan.startLine,
        4,
      );
      h.stop();
    });
    const invalid = [
      [0, '  点数を1にする', 1],
      [1, 'もし 真なら、次のことをする。\n点数を1にする', 1],
      [2, 'もし 真なら、次のことをする。\n  何もしない。\n 点数を1にする', 3],
      [3, 'もし 真なら、次のことをする。\n  何もしない。\n    点数を1にする', 3],
      [4, 'もし 真なら、次のことをする。\n\t点数を1にする', 2],
      [5, 'もし 真なら、次のことをする。\n　点数を1にする', 2],
      [6, 'そうでなければ、次のことをする。\n  何もしない', 1],
      [7,
        'もし 真なら、次のことをする。\n  何もしない\n点数を1にする\nそうでなければ、次のことをする。\n  何もしない',
        4,
      ],
      [8,
        'もし 真なら、次のことをする。\n  何もしない\n  そうでなければ、次のことをする。\n    何もしない',
        3,
      ],
      [9,
        'もし 真なら、次のことをする。\n  何もしない\n名前一覧の各要素を【】として、次のことをくり返す。\n  何もしない',
        3,
      ],
      [10, 'ここまで', 1],
      [11, 'もし 真なら、次のことをする。\n  ※ コメントだけ', 1],
      [13, '次のことを3回くり返す。\n  何もしない\nここまで', 3],
    ];
    for (const [i, source, line] of invalid)
      test('indent reject ' + i, () => {
        let e;
        try {
          parseScript(source, sy);
        } catch (x) {
          e = x;
        }
        ok(e, 'accepted invalid source');
        eq(e.line, line);
      });
    test('arbitrary boolean loops and innermost control', () => {
      const h = run(
        '点数を0にする。\n条件（点数が4より小さいかつ真）が成り立つあいだ、次のことをくり返す。\n  点数に1を足す。\n  次のことをずっとくり返す。\n    このくり返しを終える。\n  次のくり返しへ進む。\n  点数に100を足す。\n点数と言う。',
      );
      eq(h.out, ['4']);
      h.stop();
    });
    test('NoOperation callable and standalone', () => {
      const p = makeDefaultProject();
      p.scripts = [
        {
          targetId: 'stage',
          event: 'start',
          source: '次のことを2回くり返す。\n  何もしない。\n1と言う。',
        },
      ];
      const payload = packExecutable(p, new AssetStore()),
        restored = AKARI_RUNTIME.restoreExecutable(payload);
      ok(restored.compiled.items[0].ast.body[0].body[0].kind === 'NoOperation');
      const h = run(p.scripts[0].source);
      eq(h.out, ['1']);
      h.stop();
    });
    test('hint indentation scopes', () => {
      const source = '名前一覧の各要素を項目として、次のことをくり返す。\n  \n';
      const inner = source.indexOf('\n') + 3;
      ok(insertionContext(source, inner, inner).binders.includes('項目'));
      eq(insertionContext(source, source.length, source.length).binders, []);
      ok(!insertionContext(source, source.length, source.length).insideLoop);
    });
    test('hint every block parses', () => {
      for (const target of ['stage', 'sprite-1'])
        for (const hint of hintCandidates(makeDefaultProject(), target).filter(
          (x) => x.enabled && x.mode === 'statement' && x.text.includes('次のこと'),
        )) {
          ok(!hint.text.includes('ここまで'));
          parseScript(hint.text, sy, { targetId: target });
        }
    });
    test('hint whole indented line replacement', () => {
      const source = 'もし 真なら、次のことをする。\n  何もしない。\n点数と言う。',
        start = source.indexOf('\n') + 1,
        end = source.indexOf('\n', start),
        result = insertSource(source, start, end, '点数に1を足す。');
      const h = run(result.source);
      eq(h.out, ['1']);
      h.stop();
    });
    test('hint nested insertion and following sibling', () => {
      const source = 'もし 真なら、次のことをする。\n  \n点数と言う。',
        at = source.indexOf('\n') + 3;
      const result = insertSource(source, at, at, '次のことを3回くり返す。\n  点数に1を足す。');
      const h = run(result.source);
      eq(h.out, ['3']);
      h.stop();
    });
    for (const command of COMMAND_CATALOG)
      test('catalog ' + command.id, () => {
        const ctx = {
          definition: {},
          definitionKind: 'action',
          args: ['量'],
          localNames: ['合計', '結果'],
          binders: [],
        };
        const ast = parseScript(command.source, sy, ctx);
        eq(ast.body[0].kind, command.kind);
        if (command.op) eq(ast.body[0].op, command.op);
        eq(clean(parseScript(formatScript(ast), sy, ctx)), clean(ast));
      });
    test('runtime motion', () => {
      const h = run(
        '横100、縦50の位置へ行く。\n方向を90度にする。\n10歩動く。\n右に15度回る。\n左に5度回る。\n横位置を30にする。\n縦位置を40にする。\n1秒で横200、縦100の位置へ滑る。',
        'sprite-1',
      );
      const a = h.r.actor('sprite-1');
      eq([a.x, a.y, a.direction], [200, 100, 100]);
      h.stop();
    });
    test('runtime looks layers text backdrop costumes', () => {
      const h = run(
        '隠れる。\n現れる。\n大きさを120％にする。\n表示色を「赤」にする。\n前面へ出す。\n背面へ下げる。\n1層前へ出す。\n1層後ろへ下げる。\n次の背景にする。\n前の背景にする。\n背景を「空色」にする。\n次の衣装にする。\n前の衣装にする。\n衣装を「星」にする。\n「ボタン1」の文字を「始める」にする。',
        'sprite-1',
      );
      const a = h.r.actor('sprite-1');
      eq([a.visible, a.scalePercent, a.color, a.costumeId], [true, 120, '#ff3b30', 'costume-1']);
      eq(h.r.actor('button-1').text, '始める');
      eq(h.r.stage.backdropId, 'backdrop-1');
      h.stop();
    });
    test('runtime pen and volume pitch', () => {
      const h = run(
        'ペンを下ろす。\nペンの色を「青」にする。\nペンの太さを3にする。\n10歩動く。\nペンを上げる。\nスタンプを押す。\n描いた線とスタンプを消す。\n音量を50％にする。\n音程を2段階上げる。\n音程を1段階下げる。\nすべての音を止める。',
        'sprite-1',
      );
      const a = h.r.actor('sprite-1');
      eq([a.penDown, a.penColor, a.penSize, a.volume, a.pitch], [false, '#147efb', 3, 50, 1]);
      eq(h.effects, ['line', 'stamp', 'clear']);
      h.stop();
    });
    const builtins = [
      ['乱数（1、1）', 1],
      ['余り（10、3）', 1],
      ['四捨五入（－1.5）', -2],
      ['切り上げ（1.2）', 2],
      ['切り捨て（－1.2）', -2],
      ['絶対値（－3）', 3],
      ['平方根（9）', 3],
      ['正弦（30）', 0.5],
      ['余弦（60）', 0.5],
      ['正接（45）', 1],
      ['逆正弦（0.5）', 30],
      ['逆余弦（0.5）', 60],
      ['逆正接（1）', 45],
      ['自然対数（1）', 0],
      ['常用対数（100）', 2],
      ['指数（0）', 1],
      ['数（「12」）', 12],
      ['文字（真）', '真'],
      ['最小（2、1、3）', 1],
      ['最大（2、1、3）', 3],
      ['つなぐ（「A」、1、真）', 'A1真'],
    ];
    for (const [source, wanted] of builtins)
      test('builtin ' + source.split('（')[0], () => {
        const p = makeDefaultProject(),
          r = new RuntimeModel(p, {});
        const actual = evalExpression(parseExpression(source, sy), {
          runtime: r,
          runtimeId: 'sprite-1',
          compiled: compileProject(p),
          task: { callFrames: [], execStack: [] },
        });
        if (typeof wanted === 'number') ok(Math.abs(actual - wanted) < 1e-10, source);
        else eq(actual, wanted);
      });

    for (const [type, events] of Object.entries(EVENT_BY_TYPE))
      for (const event of events)
        test('event ' + type + ':' + event, () => {
          const p = makeDefaultProject(),
            c = {
              ...p.components[0],
              id: 'event-target',
              type,
              name: '対象',
              localData: { variables: [], lists: [] },
            };
          if (type === 'sprite') {
            c.costumes = p.components[1].costumes.map((x) => ({ ...x, id: 'event-' + x.id }));
            c.costumeId = c.costumes[0].id;
          }
          if (type !== 'stage') p.components.push(c);
          const id = type === 'stage' ? 'stage' : c.id;
          const value = {
            keyDown: '押されたキー',
            message: '受け取った知らせ',
            backdropChanged: '新しい背景名',
            valueChanged: '新しい値',
          }[event];
          p.scripts = [
            { targetId: id, event, source: value ? value + 'と言う。' : '点数に1を足す。' },
          ];
          const compiled = compileProject(p);
          ok(!compiled.errors.length, JSON.stringify(compiled.errors));
          const r = new RuntimeModel(p, {}),
            out = [],
            errors = [],
            q = new EventScheduler(p, compiled, r, {
              say: (id, v) => out.push(v),
              runtimeError: (t, e) => errors.push(e),
            });
          q.running = true;
          q.paused = true;
          q.spawnForRuntime(id, event, {
            key: '空白',
            message: '便り',
            newName: '背景',
            newValue: '入力',
          });
          for (let i = 0; q.ready.length && i < 20; i++) q.runTurn(true);
          eq(errors, []);
          if (value)
            eq(out, [
              { keyDown: '空白', message: '便り', backdropChanged: '背景', valueChanged: '入力' }[
                event
              ],
            ]);
          else eq(r.projectVars.get('点数'), 1);
          q.stop();
        });
    const sensors = {
      マウスが押されている: true,
      マウスの横位置: 35,
      マウスの縦位置: 45,
      以前の背景名: '前',
      新しい背景名: '後',
      受け取った知らせ: '便り',
      押されたキー: '空白',
      クローンである: false,
      背景番号: 1,
      背景名: '空色',
      衣装番号: 1,
      衣装名: '星',
      横位置: 230,
      縦位置: 110,
      方向: 0,
      大きさ: 100,
      タイマー: 2,
      答え: '回答',
      音量: 100,
      音程: 0,
      以前の値: '旧',
      新しい値: '新',
      空白キーが押されている: true,
      端に触れている: false,
      '「赤」の色に触れている': false,
      マウスまでの距離: Math.hypot(320 - 35, 200 - 45),
    };
    for (const [source, wanted] of Object.entries(sensors))
      test('sensor ' + source, () => {
        const p = makeDefaultProject(),
          r = new RuntimeModel(p, {});
        r.mouseX = 35;
        r.mouseY = 45;
        r.mouseDown = true;
        r.pressedKeys.add('空白');
        r.startTime = 0;
        r.now = () => 2000;
        const ctx = {
          runtime: r,
          runtimeId: 'sprite-1',
          compiled: compileProject(p),
          task: { lastAnswer: '回答', callFrames: [], execStack: [] },
          eventContext: {
            key: '空白',
            message: '便り',
            oldName: '前',
            newName: '後',
            oldValue: '旧',
            newValue: '新',
          },
        };
        const actual = evalExpression(parseExpression(source, sy), ctx);
        if (typeof wanted === 'number')
          ok(Math.abs(actual - wanted) < 1e-9, source + ': ' + actual);
        else eq(actual, wanted);
      });
    return {
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      total: results.length,
      results,
    };
  }
