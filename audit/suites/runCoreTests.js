function runCoreTests() {
    const results = [],
      test = (id, fn) => {
        try {
          fn();
          results.push({ id: 'CORE ' + id, pass: true, detail: 'PASS' });
        } catch (e) {
          results.push({
            id: 'CORE ' + id,
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
    const sy = buildSymbols(makeRegressionProject());
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
      const p = makeRegressionProject();
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
      'もし 点数が10以上なら、次のことをする。\n  3回くり返す。\n    10歩動く。\n  「終了」と言う。\nそうでなければ、次のことをする。\n  「不足」と言う。',
      'もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする\n    2回くり返す\n         3回くり返す\n             点数に1を足す\n点数の値を言う',
      '※ outer\nもし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n※ comment does not close block\n  点数に1を足す。\n\nそうでなければ、次のことをする。\n   何もしない。\n点数の値を言う。',
      '条件（条件の答え（あてはまる）かつ条件の答え（あてはまらない））が成り立つあいだ、次のことをくり返す。\n  何もしない。\n条件（条件の答え（あてはまる）または条件の答え（あてはまらない））が成り立つまで、次のことをくり返す。\n  何もしない。',
      '名前一覧の各要素を項目として、次のことをくり返す。\n  項目の値を言う。',
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
      [1, 'もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n点数を1にする', 1],
      [2, 'もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n  何もしない。\n 点数を1にする', 3],
      [3, 'もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n  何もしない。\n    点数を1にする', 3],
      [4, 'もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n\t点数を1にする', 2],
      // A full-width space at a line's start reads as two spaces (LANGUAGE.md); two of them are one indent too deep here.
      [5, 'もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n  何もしない。\n　　点数を1にする', 3],
      [6, 'そうでなければ、次のことをする。\n  何もしない', 1],
      [7,
        'もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n  何もしない\n点数を1にする\nそうでなければ、次のことをする。\n  何もしない',
        4,
      ],
      [8,
        'もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n  何もしない\n  そうでなければ、次のことをする。\n    何もしない',
        3,
      ],
      [9,
        'もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n  何もしない\n名前一覧の各要素を【】として、次のことをくり返す。\n  何もしない',
        3,
      ],
      [10, 'ここまで', 1],
      [11, 'もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n  ※ コメントだけ', 1],
      [13, '3回くり返す。\n  何もしない\nここまで', 3],
    ];
    // One full-width space at a line's start is the indent of two spaces, and 整える writes the two spaces (LANGUAGE.md).
    // LANGUAGE.md 読めない文の案内: when a nearer way of writing is shown (れい：…), that example is itself a readable
    // sentence, also when the child wrote two よこ or two たて directions (一つの文には、よこを一つ、たてを一つまで書けます).
    test('a move message example is itself readable', () => {
      for (const source of ['右へ10歩動く。', '右へ左へ20歩動く。', '右へ20歩左へ動く。', '上へ下へ5歩動く。', 'いまのばしょから、右へ20歩、左へ10歩動く。']) {
        const diagnostics = parseSyntax(source, { symbols: sy }).syntaxDiagnostics || [];
        ok(diagnostics.length, source + ' is refused');
        for (const d of diagnostics) {
          const example = String(d.message).split('れい：')[1];
          if (!example) continue;
          const sentence = example.replace(/。$/, '') + '。', again = parseSyntax(sentence, { symbols: sy });
          eq({ source, sentence, codes: (again.syntaxDiagnostics || []).map((x) => x.code) }, { source, sentence, codes: [] });
        }
      }
    });
    test('indent full-width space reads as two spaces', () => {
      const wide = parseScript('もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n　点数を1にする', sy),
        narrow = parseScript('もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n  点数を1にする', sy);
      eq(clean(wide), clean(narrow));
      eq(formatScript(wide), formatScript(narrow));
      ok(!formatScript(wide).includes('\u3000'), 'the formatted text keeps a full-width space');
    });
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
        '点数を0にする。\n条件（点数が4より小さいかつ条件の答え（あてはまる））が成り立つあいだ、次のことをくり返す。\n  点数に1を足す。\n  次のことをずっとくり返す。\n    このくり返しを終える。\n  この回の残りをとばして、次の回へ進む。\n  点数に100を足す。\n点数の値を言う。',
      );
      eq(h.out, ['4']);
      h.stop();
    });
    test('NoOperation callable and standalone', () => {
      const p = makeRegressionProject();
      p.scripts = [
        {
          targetId: 'stage',
          event: 'start',
          source: '2回くり返す。\n  何もしない。\n1を言う。',
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
        for (const hint of hintCandidates(makeRegressionProject(), target).filter(
          (x) => x.enabled && x.mode === 'statement' && x.text.includes('次のこと'),
        )) {
          ok(!hint.text.includes('ここまで'));
          parseScript(hint.text, sy, { targetId: target });
        }
    });
    test('hint whole indented line replacement', () => {
      const source = 'もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n  何もしない。\n点数の値を言う。',
        start = source.indexOf('\n') + 1,
        end = source.indexOf('\n', start),
        result = insertSource(source, start, end, '点数に1を足す。');
      const h = run(result.source);
      eq(h.out, ['1']);
      h.stop();
    });
    test('hint nested insertion and following sibling', () => {
      const source = 'もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n  \n点数の値を言う。',
        at = source.indexOf('\n') + 3;
      const result = insertSource(source, at, at, '3回くり返す。\n  点数に1を足す。');
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
    // LANGUAGE.md 動きの文 and 移動量と座標の意味: places are centres from the bottom-left, y grows upward,
    // 右に〇度回る lowers the angle and 左に〇度回る raises it.
    test('runtime motion', () => {
      const h = run(
        '画面の左下のはしから、右へ100歩、上へ50歩のばしょへ行く。\n方向を90度にする。\n10歩動く。\n右に15度回る。\n左に5度回る。\n画面の左下のはしから、右へ30歩、上へ（たてのばしょ）歩のばしょへ行く。\n画面の左下のはしから、右へ（よこのばしょ）歩、上へ40歩のばしょへ行く。\n1秒かけて、画面の左下のはしから、右へ200歩、上へ100歩のばしょへ行く。',
        'sprite-1',
      );
      const a = h.r.actor('sprite-1');
      eq([a.x, a.y, a.direction], [200, 100, 80]);
      h.stop();
      const m = run('いまのばしょから、右へ10歩、上へ5歩動く。\nいまのばしょから、左へ3歩動く。\n1秒かけて、いまのばしょから、下へ25歩動く。\n1秒かけて、右に90度回る。', 'sprite-1');
      const b = m.r.actor('sprite-1');
      eq([b.x, b.y, b.direction], [327, 180, 270]);
      m.stop();
      const g = run('「ボタン1」のところへ行く。', 'sprite-1');
      eq([g.r.actor('sprite-1').x, g.r.actor('sprite-1').y], [g.r.actor('button-1').x, g.r.actor('button-1').y]);
      g.stop();
    });
    test('runtime looks layers text backdrop costumes', () => {
      const h = run(
        '隠れる。\n現れる。\n大きさを120％にする。\n表示色を「赤」にする。\n前面へ出す。\n背面へ下げる。\n1層前へ出す。\n1層後ろへ下げる。\n次の背景にする。\n前の背景にする。\n背景を「空色」にする。\n次の衣装にする。\n前の衣装にする。\n衣装を「星」にする。\n「ボタン1」の文字を「始める」に変える。',
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
      ['逆正弦（0.5）', 30, '度'],
      ['逆余弦（0.5）', 60, '度'],
      ['逆正接（1）', 45, '度'],
      ['自然対数（1）', 0],
      ['常用対数（100）', 2],
      ['指数（0）', 1],
      ['数（「12」）', 12],
      ['文字（条件の答え（あてはまる））', 'あてはまる'],
      ['最小（2、1、3）', 1],
      ['最大（2、1、3）', 3],
      ['つなぐ（「A」、1、条件の答え（あてはまる））', 'A1あてはまる'],
    ];
    for (const [source, wanted, expectedUnit] of builtins)
      test('builtin ' + source.split('（')[0], () => {
        const p = makeRegressionProject(),
          r = new RuntimeModel(p, {});
        const actual = evalExpression(parseExpression(source, sy), {
          runtime: r,
          runtimeId: 'sprite-1',
          compiled: compileProject(p),
          task: { callFrames: [], execStack: [] },
        });
        if (expectedUnit) {
          eq(actual.unit, expectedUnit);
          ok(Math.abs(actual.magnitude - wanted) < 1e-10, source);
          eq(Object.keys(actual).sort(), ['magnitude', 'unit']);
        } else if (typeof wanted === 'number') ok(Math.abs(actual - wanted) < 1e-10, source);
        else eq(actual, wanted);
      });

    for (const [type, events] of Object.entries(EVENT_BY_TYPE))
      for (const event of events)
        test('event ' + type + ':' + event, () => {
          const p = makeRegressionProject(),
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
            // A touch body names what it touches (the stage edge here).
            { targetId: id, event, source: value ? value + 'の値を言う。' : '点数に1を足す。', ...(event === 'touchStart' ? { filter: { target: '端' } } : {}) },
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
    // A test is named by its sensor (the block schema SensorRead:<name>). 1.5.0 no longer reads 位置, so the four
    // position sensors are read through their LANGUAGE.md spellings (読み取れる状態の一覧).
    const spellings = {
      マウスの横位置: ['マウスのよこのばしょ', 'マウスの横のばしょ'],
      マウスの縦位置: ['マウスのたてのばしょ', 'マウスの縦のばしょ'],
      横位置: ['横のばしょ', '横の場所'],
      縦位置: ['縦のばしょ', '縦の場所'],
    };
    const sensors = {
      マウスが押されている: true,
      マウスの横位置: 35,
      マウスの縦位置: 45,
      以前の背景名: '前',
      新しい背景名: '後',
      受け取った知らせ: '便り',
      押されたキー: '空白',
      コピーである: false,
      背景番号: 1,
      背景名: '空色',
      衣装番号: 1,
      衣装名: '星',
      // The regression actor's centre, measured from the bottom-left.
      横位置: 320,
      縦位置: 200,
      よこのばしょ: 320,
      たてのばしょ: 200,
      方向: 0,
      大きさ: 100,
      タイマー: 2,
      答え: '回答',
      音量: 100,
      音程: 0,
      以前の値: '旧',
      新しい値: '新',
      空白キーが押されている: true,
      画面の端に触れている: false,
      '「赤」の色に触れている': false,
      マウスまでの距離: Math.hypot(320 - 35, 200 - 45),
    };
    for (const [source, wanted] of Object.entries(sensors))
      test('sensor ' + source, () => {
        const p = makeRegressionProject(),
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
        const expectedUnit = {
            マウスの横位置: '歩', マウスの縦位置: '歩', 横位置: '歩', 縦位置: '歩', よこのばしょ: '歩', たてのばしょ: '歩',
            方向: '度', 大きさ: '％', タイマー: '秒', 音量: '％', マウスまでの距離: '歩',
          }[source];
        for (const text of spellings[source] || [source]) {
          const actual = evalExpression(parseExpression(text, sy), ctx);
          if (expectedUnit) {
            eq(actual.unit, expectedUnit);
            ok(Math.abs(actual.magnitude - wanted) < 1e-9, text + ': ' + actual.magnitude);
            eq(Object.keys(actual).sort(), ['magnitude', 'unit']);
          } else if (typeof wanted === 'number')
            ok(Math.abs(actual - wanted) < 1e-9, text + ': ' + actual);
          else eq(actual, wanted);
        }
      });
    // LANGUAGE.md 読めない書き方: 「位置」 is not read, and the guidance names the word to write.
    test('sensor 位置 is not read', () => {
      for (const [source, word] of [['横位置', 'よこのばしょ'], ['縦位置', 'たてのばしょ'], ['マウスの横位置', 'よこのばしょ'], ['マウスの縦位置', 'たてのばしょ']]) {
        let error = null;
        try { parseExpression(source, sy); } catch (e) { error = e; }
        ok(error?.code === 'P205' && error.message.includes('「' + word + '」'), source + ': ' + (error ? error.code + ' ' + error.message : 'read'));
      }
    });
    // 名人 runtime: parts as values and lanes started together in one flow. The 名人 sentences that make these
    // nodes are read by the 名人 parser; here the nodes are built from common sentences, so the runtime is
    // tested on its own.
    const laneProject = (variables = [], actions = []) => {
      const p = makeRegressionProject(), base = p.components.find(c => c.type === 'sprite');
      p.components = [...p.components.filter(c => c.type !== 'sprite'), ...[['core-cat', 'ねこ', 0], ['core-dog', '犬', 40], ['core-bird', '鳥', 80]]
        .map(([id, name, x]) => ({ ...JSON.parse(JSON.stringify(base)), id, name, x, y: 0, direction: 0,
          costumes: [{ id: id + '-face', name: '顔', kind: 'text', value: '●' }], costumeId: id + '-face',
          localData: { variables: [{ id: id + '-hp', name: '体力', initialValue: 10 }], lists: [] } }))];
      p.projectData = { variables: [...variables.map((name, i) => ({ id: 'core-lane-v' + i, name, initialValue: 0 }))],
        lists: [{ id: 'core-lane-team', name: 'なかま', initialValue: [] }, { id: 'core-lane-items', name: '持ち物', initialValue: ['本', 'ぼうし'] }] };
      p.scripts = [{ id: 'core-lane', targetId: 'stage', event: 'start', source: 'ねこは前へ0歩進む。' }];
      p.actions = actions; p.functions = [];
      return p;
    };
    const laneParse = (p, source, extra = {}) => parseScript(source, buildSymbols(p), { targetId: 'stage', event: 'start', ...extra }).body;
    const partRef = name => ({ kind: 'PartRef', name });
    const variableRead = name => ({ kind: 'VariableRead', name, qualifier: null });
    const bySubject = (node, value) => ({ ...node, actorRef: { kind: 'value', value } });
    const laneRun = (p, body, { until = 4000, inject = {}, samples = [] } = {}) => {
      const compiled = compileProject(p);
      eq(compiled.errors, []);
      compiled.astByKey.set('script:core-lane', { kind: 'Script', body });
      for (const [key, nodes] of Object.entries(inject)) compiled.astByKey.set(key, { kind: 'Script', body: nodes });
      let now = 0;
      const speech = [], x = {}, r = new RuntimeModel(p, {}),
        q = new EventScheduler(p, compiled, r, { say: (id, text) => speech.push([now, id, text]) });
      r.now = () => now; q.schedule = () => {};
      try {
        q.start();
        for (let step = 0; step <= until / 10; step++) {
          for (let i = 0; i < 500 && q.ready.length; i++) q.runTurn();
          q.recheckBlocked();
          if (samples.includes(now)) x[now] = Object.fromEntries(['core-cat', 'core-dog', 'core-bird'].map(id => [id, Math.round(r.actor(id).x)]));
          now += 10;
        }
        return { speech, x, errors: q.errorRecords.map(e => e.code), tasks: q.tasks.size, waitGroups: q.waitGroups.size };
      } finally { q.stop(); }
    };
    test('meijin part in a variable is the subject', () => {
      const p = laneProject(['主役']), set = name => ({ ...laneParse(p, '主役を0にする。')[0], value: partRef(name) });
      const out = laneRun(p, [set('ねこ'), bySubject(laneParse(p, 'ねこは、いまのばしょから、右へ10歩動く。')[0], variableRead('主役')),
        bySubject(laneParse(p, 'ねこは「出番だ」と言う。')[0], variableRead('主役')), set('犬'),
        bySubject(laneParse(p, 'ねこは「次はぼく」と言う。')[0], variableRead('主役'))], { until: 100, samples: [100] });
      eq([out.x[100]['core-cat'], out.x[100]['core-dog']], [10, 40]);
      eq(out.speech.map(s => s[1] + ':' + s[2]), ['core-cat:出番だ', 'core-dog:次はぼく']);
      eq(out.errors, []);
    });
    test('meijin parts compare by identity', () => {
      const p = laneProject(['主役']);
      const branch = laneParse(p, 'もし点数が0と同じなら、\n  ねこは「にゃあ」と言う。\nそうでなければ、\n  犬は「ちがう」と言う。')[0];
      const check = name => laneRun(p, [{ ...laneParse(p, '主役を0にする。')[0], value: partRef(name) },
        { ...branch, condition: { ...branch.condition, left: variableRead('主役'), right: partRef('ねこ') } }], { until: 50 }).speech.map(s => s[2]);
      eq([check('ねこ'), check('犬')], [['にゃあ'], ['ちがう']]);
    });
    test('meijin lanes glide at the same time and the flow waits for both', () => {
      const p = laneProject();
      const out = laneRun(p, [{ kind: 'Parallel', lanes: [laneParse(p, 'ねこは2秒かけて、いまのばしょから、右へ40歩動く。'), laneParse(p, '犬は2秒かけて、いまのばしょから、右へ40歩動く。')] },
        laneParse(p, '犬は「ついた」と言う。')[0]], { samples: [1000] });
      eq([out.x[1000]['core-cat'], out.x[1000]['core-dog']], [20, 60]);
      ok(out.speech[0][0] >= 2000 && out.speech[0][0] <= 2020, 'next sentence at ' + out.speech[0][0]);
      eq([out.tasks, out.waitGroups], [0, 0]);
    });
    test('meijin everyone in a list moves at once', () => {
      const p = laneProject(), append = name => ({ ...laneParse(p, 'なかまの最後に0を入れる。')[0], value: partRef(name) });
      const each = laneParse(p, 'なかまの中身を先頭から一つずつ見て、次のことを行う。\n  この中では、今見ているものを【だれ】と呼ぶ。\n  何もしない。')[0];
      const out = laneRun(p, [append('ねこ'), append('犬'), append('鳥'),
        { kind: 'ParallelEach', list: each.list, binder: each.binder, body: [bySubject(laneParse(p, 'ねこは1秒かけて、いまのばしょから、右へ30歩動く。')[0], variableRead(each.binder))] },
        laneParse(p, 'ねこは「そろった」と言う。')[0]], { samples: [500] });
      eq(Object.values(out.x[500]), [15, 55, 95]);
      ok(out.speech[0][0] >= 1000 && out.speech[0][0] <= 1020, 'next sentence at ' + out.speech[0][0]);
    });
    test('meijin stopping in a lane stops the whole flow', () => {
      const p = laneProject();
      const out = laneRun(p, [{ kind: 'Parallel', lanes: [laneParse(p, 'ねこは2秒かけて、いまのばしょから、右へ40歩動く。'), laneParse(p, '1秒待つ。\nこの動きを止める。')] },
        laneParse(p, '犬は「あと」と言う。')[0]], { samples: [1500, 3000] });
      eq([out.x[1500]['core-cat'], out.x[3000]['core-cat']], [20, 20]);
      eq([out.speech, out.tasks, out.waitGroups], [[], 0, 0]);
    });
    test('meijin lanes share the procedure local variables', () => {
      const p = laneProject([], [{ id: 'core-lane-sum', ownerId: 'stage', name: '合計する', args: [], source: 'この中だけで使う変数【合計】を作り、最初は0にする。\n【合計】の値を言う。' }]);
      const parts = laneParse(p, 'この中だけで使う変数【合計】を作り、最初は0にする。\n【合計】の値を言う。', { definitionKind: 'action', definition: p.actions[0], localNames: ['合計'] });
      const add = n => laneParse(p, '【合計】を' + n + '増やす。', { localNames: ['合計'] });
      const out = laneRun(p, laneParse(p, 'ねこは【合計する】という手順を行う。'), { until: 100,
        inject: { 'action:core-lane-sum': [parts[0], { kind: 'Parallel', lanes: [add(1), add(2)] }, bySubject(parts[1], partRef('ねこ'))] } });
      eq(out.speech.map(s => s[2]), ['3']);
    });
    test('meijin lanes read the binder of the loop that started them', () => {
      const p = laneProject();
      const loop = laneParse(p, '持ち物の中身を先頭から一つずつ見て、次のことを行う。\n  この中では、今見ているものを【もの】と呼ぶ。\n  ねこは【もの】の値を言う。')[0];
      const say = loop.body.at(-1);
      const out = laneRun(p, [{ ...loop, body: [...loop.body.slice(0, -1), { kind: 'Parallel', lanes: [[say], [{ ...say, actorRef: { kind: 'named', name: '犬' } }]] }] }], { until: 100 });
      eq(out.speech.map(s => s[1] + ':' + s[2]), ['core-cat:本', 'core-dog:本', 'core-cat:ぼうし', 'core-dog:ぼうし']);
    });
    test('meijin a part that is gone is refused', () => {
      let code = null;
      try { new RuntimeModel(laneProject(), {}).partRuntimeId({ part: 'core-gone', name: 'ほし' }); } catch (e) { code = e.code; }
      eq(code, 'R405');
    });
    test('meijin an error in a lane ends the flow', () => {
      const p = laneProject(), bad = { ...laneParse(p, 'ねこは前へ10歩進む。')[0], args: [{ kind: 'QuantityLiteral', unit: '歩', value: partRef('ねこ') }] };
      const out = laneRun(p, [{ kind: 'Parallel', lanes: [[bad], laneParse(p, 'ねこは2秒かけて、いまのばしょから、右へ40歩動く。')] }, laneParse(p, '犬は「あと」と言う。')[0]], { until: 3000 });
      ok(out.errors.length > 0, 'the error is reported');
      eq(out.speech, []);
    });
    test('meijin too many lanes are refused before any starts', () => {
      const p = laneProject(), each = laneParse(p, 'なかまの中身を先頭から一つずつ見て、次のことを行う。\n  この中では、今見ているものを【だれ】と呼ぶ。\n  何もしない。')[0];
      const items = Array.from({ length: LIMITS.activeTasks + 1 }, (_, i) => ({ kind: 'NumberLiteral', value: i }));
      const out = laneRun(p, [{ kind: 'ParallelEach', list: { kind: 'ListLiteral', items }, binder: each.binder, body: laneParse(p, '1秒待つ。') }], { until: 50 });
      eq(out.errors, ['R413']);
    });
    test('meijin saved data never holds a part', () => {
      const p = laneProject(['主役']);
      p.projectData.variables[0].initialValue = { part: 'core-cat', name: 'ねこ' };
      ok(compileProject(p).errors.length > 0, 'a part as a saved initial value is refused');
    });
    // 名人 scripts belong to no part: saved without owner or event, compiled as the stage's, renamed with the parts.
    const meijinProject = source => {
      const p = laneProject();
      p.scripts = [{ id: 'core-meijin', mode: 'meijin', targetId: 'meijin', event: 'start', source }];
      return p;
    };
    test('meijin script is saved without owner or event', () => {
      const p = meijinProject('ねこは、いまのばしょから、右へ10歩動く。'), text = serializeProject(p, new AssetStore());
      const saved = JSON.parse(text.split('```json\n').pop().split('\n```')[0]).scripts;
      eq(saved, [{ id: 'core-meijin', mode: 'meijin', source: 'ねこは、いまのばしょから、右へ10歩動く。' }]);
      ok(text.includes('### 名人の本文'), 'the readable body names 名人の本文');
    });
    test('meijin script compiles as the stage and its headings name the parts', () => {
      const compiled = compileProject(meijinProject('ねこは、いまのばしょから、右へ10歩動く。\n犬がおされたとき、\n  犬は「いたい」と言う。'));
      eq(compiled.errors, []);
      eq(compiled.items.filter(i => i.key.startsWith('script:')).map(i => [i.targetId, i.event]), [['stage', 'start'], ['core-dog', 'click']]);
    });
    test('meijin script asks who does an action', () => {
      const errors = compileProject(meijinProject('前へ10歩進む。')).errors;
      eq(errors.map(e => e.code), ['S304']);
      ok(errors[0].message.startsWith('名人の 本文では、だれが するかを'), errors[0].message);
    });
    test('meijin script follows a renamed part', () => {
      const renamed = Akari.prepareResourceRename(meijinProject('ねこは、いまのばしょから、右へ10歩動く。\n犬がおされたとき、\n  ねこは「いたい」と言う。'), 'component:core-cat', 'みけ', {});
      eq(renamed.scripts[0].source, 'みけは、いまのばしょから、右へ10歩動く。\n犬がおされたとき、\n  みけは「いたい」と言う。');
    });
    test('meijin script in memory keeps the pseudo owner', () => {
      for (const bad of [{ id: 'x', mode: 'meijin', targetId: 'stage', event: 'start', source: '' }, { id: 'x', mode: 'other', targetId: 'meijin', event: 'start', source: '' }]) {
        const p = laneProject(); p.scripts = [bad];
        let refused = false; try { validateProject(p); } catch (e) { refused = e.code === 'F503'; }
        ok(refused, 'refused ' + JSON.stringify(bad));
      }
    });
    // 名人 sentences read by the 名人 parser and run on the scheduler: parts set apart (x 0, 200, 400), 40 steps wide.
    const meijinWork = (source, { variables = ['主役', '点数', '合計'], extra = [] } = {}) => {
      const p = laneProject(variables);
      p.components.filter(c => c.type === 'sprite').forEach((c, i) => Object.assign(c, { x: 200 * i, y: 100, w: 40, h: 40 }));
      p.scripts = [{ id: 'core-meijin', mode: 'meijin', targetId: 'meijin', event: 'start', source }, ...extra];
      return p;
    };
    const meijinRun = (source, { until = 3000, samples = [], ...options } = {}) => {
      const p = meijinWork(source, options), compiled = compileProject(p);
      eq(compiled.errors, []);
      let now = 0;
      const speech = [], x = {}, r = new RuntimeModel(p, {}), name = id => p.components.find(c => c.id === r.actor(id)?.baseId)?.name || id,
        q = new EventScheduler(p, compiled, r, { say: (id, text) => speech.push(`${now}:${name(id)}:${text}`) });
      r.now = () => now; q.schedule = () => {};
      try {
        q.start();
        for (let step = 0; step <= until / 10; step++) {
          for (let i = 0; i < 500 && q.ready.length; i++) q.runTurn();
          q.recheckBlocked();
          if (samples.includes(now)) x[now] = ['core-cat', 'core-dog', 'core-bird'].map(id => Math.round(r.actor(id).x));
          now += 10;
        }
        const value = v => v?.magnitude ?? v;
        return { speech, x, vars: Object.fromEntries([...r.projectVars].map(([k, v]) => [k, value(v)])), lists: Object.fromEntries(r.projectLists), direction: r.actor('core-cat').direction,
          errors: q.errorRecords.map(e => e.code + '@' + e.line), copies: [...r.actors.values()].filter(a => a.isClone).length, tasks: q.tasks.size };
      } finally { q.stop(); }
    };
    test('meijin a variable holding a part is the subject and the part has its name', () => {
      const out = meijinRun('主役をねこにする。\n主役は、自分の名前を言う。\n主役を犬にかえる。\nもし主役がねこなら、主役は「ちがう」と言う。\nもし主役が犬なら、主役は「そう」と言う。', { until: 50 });
      eq(out.speech, ['0:ねこ:ねこ', '0:犬:そう']);
    });
    test('meijin everyone of a set starts at once, in turn one after another', () => {
      const all = meijinRun('なかまを、ねこと犬と鳥にする。\nなかまは、みんな1秒かけて、いまのばしょから、右へ30歩動く。\nねこは「そろった」と言う。', { until: 1200, samples: [500] });
      eq([all.x[500], all.speech], [[15, 215, 415], ['1010:ねこ:そろった']]);
      eq(meijinRun('なかまを、ねこと犬と鳥にする。\nなかまは、順番に「やあ」と1秒話す。\n犬は「おわり」と言う。', { until: 3500 }).speech,
        ['0:ねこ:やあ', '1010:犬:やあ', '2020:鳥:やあ', '3030:犬:おわり']);
    });
    test('meijin except, the others and someone of a set', () => {
      const out = meijinRun('なかまを、ねこと犬と鳥にする。\nねこ以外のなかまは、「a」と言う。\nねこは「b」と言う。ほかのなかまは「c」と言う。\nなかまのだれか一人が「d」と言う。\n点数を、なかまの数にする。', { until: 50 });
      eq(out.speech.slice(0, 5), ['0:犬:a', '0:鳥:a', '0:ねこ:b', '0:犬:c', '0:鳥:c']);
      eq([out.speech.length, out.speech[5].endsWith(':d'), out.vars.点数], [6, true, 3]);
    });
    test('meijin one part is picked only when the comparison decides it', () => {
      const out = meijinRun('ねこと犬のうち、右にいるほうは「右」と言う。\n犬の体力を5増やす。\nねこと犬のうち、体力が大きいほうは「強い」と言う。\nねこの体力を5増やす。\nねこと犬のうち、体力が大きいほうは「同じ」と言う。\nなかまを、ねこと犬と鳥にする。\nなかまのうち、いちばん右にいるものは「一番」と言う。', { until: 50 });
      eq(out.speech, ['0:犬:右', '0:犬:強い', '0:鳥:一番']);
    });
    test('meijin copies made by the sentence before, and every copy of a part', () => {
      const made = meijinRun('鳥のコピーを3つ作る。\nできたコピーは、それぞれ前へ10歩進んでから、消える。\n点数を、鳥のコピーの数にする。', { until: 50 });
      eq([made.vars.点数, made.copies, made.errors], [0, 0, []]);
      const all = meijinRun('鳥のコピーを3つ作る。\n合計を、鳥のコピーの数にする。\n鳥のコピーを全部消す。\n点数を、鳥のコピーの数にする。\nもし鳥がコピーなら、犬は「x」と言う。', { until: 50 });
      eq([all.vars.合計, all.vars.点数, all.copies, all.speech, all.errors], [3, 0, 0, [], []]);
    });
    test('meijin parts touching, nearest, distance and going to another', () => {
      const out = meijinRun('ねこは画面の左下のはしから、右へ0歩、上へ100歩のばしょへ行く。\n犬は画面の左下のはしから、右へ10歩、上へ100歩のばしょへ行く。\nねこにふれているものは、みんな「いたい」と言う。\n点数を、ねこから鳥までのきょりにする。\nなかまを、犬と鳥にする。\nねこは、いちばん近いなかまの方を向く。\nねこは、鳥のところへ行く。\n合計を、ねこのよこのばしょにする。', { until: 50 });
      eq([out.speech, out.vars.点数, out.vars.合計, out.errors], [['0:犬:いたい'], 400, 400, []]);
      ok(Math.abs(out.direction) < 1e-9, 'ねこ faces 犬, the nearest: ' + out.direction);
    });
    test('meijin sentences of several subjects, あいだ, ながら and 次のことを同時に始める start together', () => {
      eq(meijinRun('ねこと犬は、2秒かけて、いまのばしょから、右へ40歩動く。\nねこも犬も、「やった」と言う。', { until: 2500, samples: [1000] }).x[1000], [20, 220, 400]);
      eq(meijinRun('ねこが2秒かけて、いまのばしょから、右へ40歩動くあいだ、犬は「がんばれ」と1秒話す。\nねこが2秒かけて、いまのばしょから、右へ40歩動いているうちに、犬は「まって」と言う。\nねこは「まってー」と2秒話しながら、2秒かけて、いまのばしょから、右へ40歩動く。\n鳥は「おわり」と言う。', { until: 7000 }).speech,
        ['0:犬:がんばれ', '2010:犬:まって', '4020:ねこ:まってー', '6030:鳥:おわり']);
      const together = meijinRun('次のことを同時に始める。\n  ねこは2秒かけて、いまのばしょから、右へ40歩動く。\n  犬は「ぼくも」と1秒話す。\n犬は「ついた」と言う。', { until: 3000, samples: [1000] });
      eq([together.x[1000][0], together.speech], [20, ['0:犬:ぼくも', '2010:犬:ついた']]);
    });
    test('meijin moving until a condition or for a time, and repeating for a time', () => {
      const until = meijinRun('ねこは、1秒に100歩の速さで、犬にふれるまで右へ動き続ける。\nねこは「ついた」と言う。', { until: 3000 });
      ok(/^16\d0:ねこ:ついた$/.test(until.speech[0]) && until.errors.length === 0, until.speech.join());
      eq(meijinRun('1秒のあいだ、ねこは1秒に50歩の速さで右へ動き続ける。\n点数を、ねこのよこのばしょにする。', { until: 1500 }).vars.点数, 50);
      const repeat = meijinRun('1秒のあいだ、くり返す。\n  0.25秒待つ。\n  点数を1増やす。\nねこは「おわり」と言う。', { until: 2000 });
      eq([repeat.vars.点数, repeat.speech], [4, ['1040:ねこ:おわり']]);
      let missing = null; try { parseScript('ねこは、犬にふれるまで右へ動き続ける。', buildSymbols(meijinWork('')), { targetId: 'stage', event: 'start', meijin: true }); } catch (e) { missing = e.code; }
      eq(missing, 'P205');
    });
    test('meijin events: becoming true, every interval, starting to touch, and waiting until it becomes so', () => {
      eq(meijinRun('点数が3になったら、ねこは「やった」と言う。\n1秒ごとに、点数を1増やす。', { until: 4000 }).speech, ['3010:ねこ:やった']);
      const once = meijinRun('1秒ごとに、点数を1増やす。\n点数が2以上になったとき、ねこは「に」と言う。', { until: 4500 });
      eq([once.speech, once.vars.点数], [['2010:ねこ:に'], 4]);
      const touch = meijinRun('ねこは、1秒に100歩の速さで、犬にふれるまで右へ動き続ける。\nねこが犬にふれたとき、犬は「いたい」と言う。', { until: 3000 });
      eq([touch.speech.length, touch.speech[0]?.endsWith(':犬:いたい'), touch.errors], [1, true, []]);
    });
    test('meijin a signal goes only to the parts named', () => {
      const extra = [{ id: 'core-dog-go', targetId: 'core-dog', event: 'message', filter: { message: '出発' }, source: '「いくよ」と言う。' },
        { id: 'core-bird-go', targetId: 'core-bird', event: 'message', filter: { message: '出発' }, source: '「ぼくも」と言う。' }];
      eq(meijinRun('犬に「出発」と知らせる。', { until: 50, extra }).speech, ['0:犬:いくよ']);
      eq(meijinRun('犬と鳥に「出発」と知らせて、その合図で始まったことが全部終わるまで待つ。\nねこは「みんな」と言う。', { until: 50, extra }).speech, ['0:犬:いくよ', '0:鳥:ぼくも', '0:ねこ:みんな']);
    });
    test('meijin one part is stopped, and its timed speech is waited for', () => {
      const stop = meijinRun('1秒待つ。\nねこの動きを止める。\n点数を、ねこのよこのばしょにする。', { until: 2500, extra: [{ id: 'core-cat-go', targetId: 'core-cat', event: 'start', source: '2秒かけて、いまのばしょから、右へ100歩動く。\n「ついた」と言う。' }] });
      ok(Math.abs(stop.vars.点数 - 50) <= 1 && stop.speech.length === 0, JSON.stringify(stop));
      eq(meijinRun('0.1秒待つ。\nねこが話し終わるまで待つ。\n犬は「おわった」と言う。', { until: 3000, extra: [{ id: 'core-cat-say', targetId: 'core-cat', event: 'start', source: '「やあ」と2秒話す。' }] }).speech,
        ['0:ねこ:やあ', '2010:犬:おわった']);
    });
    test('meijin words of 国語 and 算数 for lists and numbers', () => {
      const out = meijinRun('持ち物の最後に「本」を入れる。\n持ち物から「本」を一つ消す。\n合計を、持ち物の長さにする。\n持ち物から「本」を全部消す。\n点数を4にする。\nもし点数が偶数なら、ねこは「偶」と言う。\nもし点数が2の倍数なら、ねこは「倍」と言う。\nもし持ち物が空なら、ねこは「から」と言う。\nねこは、持ち物を一つずつ順に1秒話す。', { until: 1500 });
      eq([out.vars.合計, out.lists.持ち物, out.speech], [2, ['ぼうし'], ['0:ねこ:偶', '0:ねこ:倍', '0:ねこ:ぼうし']]);
    });
    test('meijin a procedure made in the text is a procedure of the work', () => {
      const out = meijinRun('【あいさつ】という手順を、相手を受け取って、次のように作る。\n  相手は「こんにちは」と言う。\n相手を犬として、【あいさつ】という手順を行う。\n【ジャンプ】という手順を、次のように作る。\n  いまのばしょから、上へ20歩動く。\nねこは【ジャンプ】という手順を行う。\n点数を、ねこのたてのばしょにする。', { until: 50 });
      eq([out.speech, out.vars.点数, out.errors], [['0:犬:こんにちは'], 120, []]);
      const errors = compileProject(meijinWork('ねこは「a」と言う。\n【とぶ】という手順を、次のように作る。\n  いまのばしょから、上へ【高さ】歩動く。')).errors;
      eq(errors.map(e => [e.code, e.line, e.where]), [['S301', 3, 'script:core-meijin']]);
    });
    test('meijin words that give no single meaning are guided', () => {
      const symbols = buildSymbols(meijinWork(''));
      for (const text of ['点数が10以上なので、ねこは「やった」と言う。', 'キーがおされても、ねこは動かない。', 'ねこは右へ動いたり、左へ動いたりする。', 'ねこは、犬の近くへ行く。',
        'その子は、いまのばしょから、右へ10歩動く。', 'ねこは犬に「やあ」と言ってあげる。', 'ねこは3回目に「やった」と言う。', 'ねこは右へ動き始める。', '持ち物から「本」を消す。',
        '点数が10なのに、ねこは「やった」と言う。', 'しばらく待つ。', 'ねこは、犬のとなりへ行く。', 'それは、いまのばしょから、右へ10歩動く。', 'ねこは犬に話しかける。', 'ねこがおされると、犬は「いたい」と言う。',
        'ねこははしまで進む。', '犬は、ねこのように動く。', 'ねこは、いまのばしょから、右へ10歩動いてください。']) {
        let code = null; try { parseScript(text, symbols, { targetId: 'stage', event: 'start', meijin: true }); } catch (e) { code = e.code; }
        eq([text, code], [text, 'P205']);
      }
    });
    // A word of あかり next to a data of its name (大きさ, 名前) is the word; the data is written in 【 】 (a notice, no stop).
    test('meijin a name with two meanings and a part that is no copy stop the check', () => {
      const codes = (source, setup = () => {}) => { const p = meijinWork(source); setup(p); return compileProject(p).errors.map(e => e.code); };
      const own = name => p => p.components.find(c => c.id === 'core-cat').localData.variables.push({ id: 'core-cat-own', name, initialValue: 0 });
      eq([codes('ほかのなかまは「a」と言う。'), codes('ねこは消える。'), codes('ねこの大きさを120％にする。', own('大きさ')), codes('ねこは、自分の名前を言う。', own('名前'))],
        [['P205'], ['S304'], [], []]);
      eq([codes('ねこの大きさを120％にする。'), codes('ねこは、自分の名前を言う。')], [[], []]);
    });
    test('meijin one sentence is one lane and keeps its order', () => {
      eq(meijinRun('次のことを同時に始める。\n  ねこは「a」と1秒話して、「b」と言う。\n  犬は「c」と言う。', { until: 1500 }).speech, ['0:ねこ:a', '0:犬:c', '1010:ねこ:b']);
    });
    test('meijin the nearest of a tie turns no one', () => {
      const out = meijinRun('ねこは画面の左下のはしから、右へ0歩、上へ100歩のばしょへ行く。\n犬は画面の左下のはしから、右へ100歩、上へ100歩のばしょへ行く。\n鳥は画面の左下のはしから、左へ100歩、上へ100歩のばしょへ行く。\nねこの向きを45度にする。\nなかまを、犬と鳥にする。\nねこは、いちばん近いなかまの方を向く。', { until: 50 });
      ok(Math.abs(out.direction - 45) < 1e-9 && out.errors.length === 0, 'direction ' + out.direction);
    });
    test('meijin a subject held in a value may be written with が, and copies of a part stop', () => {
      eq(meijinRun('主役をねこにする。\n主役が「やあ」と言う。', { until: 50 }).speech, ['0:ねこ:やあ']);
      const stop = meijinRun('鳥のコピーを2つ作る。\n0.1秒待つ。\n鳥のコピーの動きを止める。\n点数を、鳥のコピーの数にする。', { until: 2000,
        extra: [{ id: 'core-bird-copy', targetId: 'core-bird', event: 'cloneStart', source: '1秒待つ。\n「まだ」と言う。' }] });
      eq([stop.speech, stop.vars.点数, stop.errors], [[], 2, []]);
    });
    test('meijin speech and sounds need who does them; whole-work commands do not', () => {
      const codes = source => compileProject(meijinWork(source)).errors.map(e => e.code);
      eq([codes('「やあ」と言う。'), codes('「名前は」とたずねる。'), codes('すべての音を止める。'), codes('作品の線とスタンプを全部消す。'), codes('ねこは「やあ」と言う。\n「つづき」と言う。')],
        [['S304'], ['S304'], [], [], []]);
    });
    test('meijin uses of parts and data are found for renaming and deleting', () => {
      const p = meijinWork('主役をねこにする。\n主役は、いまのばしょから、右へ10歩動く。\n犬は、ねこの方を向く。\n鳥のコピーを2つ作る。\n【とぶ】という手順を、次のように作る。\n  ねこは、いまのばしょから、上へ20歩動く。');
      const lines = key => Akari.resourceChangeImpact(p, key, {}).references.map(r => r.line).sort((a, b) => a - b);
      eq([lines('component:core-cat'), lines('component:core-bird'), lines('data:core-lane-v0')], [[1, 3, 6], [4], [1, 2]]);
      const renamed = Akari.prepareResourceRename(p, 'component:core-cat', 'みけ', {});
      eq(renamed.scripts[0].source, '主役をみけにする。\n主役は、いまのばしょから、右へ10歩動く。\n犬は、みけの方を向く。\n鳥のコピーを2つ作る。\n【とぶ】という手順を、次のように作る。\n  みけは、いまのばしょから、上へ20歩動く。');
    });
    test('an answer or a state is written into a variable as 答えを名前に入れる and reads back for every kind of variable', () => {
      const p = laneProject(['名前', '点数']), symbols = buildSymbols(p);
      for (const [source, ctx, written] of [['名前を答えにする。', { targetId: 'stage', event: 'start' }, '答えを名前に入れる。'],
        ['自分の体力を答えにする。', { targetId: 'core-cat', event: 'start' }, '答えを自分の体力に入れる。'],
        ['作品の点数をよこのばしょにする。', { targetId: 'core-cat', event: 'start' }, 'よこのばしょを作品の点数に入れる。'],
        ['点数を10にする。', { targetId: 'stage', event: 'start' }, '点数を10にする。']]) {
        const ast = parseScript(source, symbols, ctx), text = formatScript(ast).trim();
        eq(text, written);
        ok(astEquivalent(parseScript(text, symbols, ctx), ast), 'reads back: ' + text);
      }
      const local = { definitionKind: 'action', definition: { id: 'x', name: 'x', args: [] } };
      const inProcedure = parseScript('この中だけで使う変数【ます】を作り、最初は0にする。\n答えを【ます】に入れる。', symbols, local);
      eq(inProcedure.body.map(n => n.kind), ['LocalVariableDeclaration', 'Assignment']);
    });
    test('meijin a state before うちに, a variable interval and いちばん近い outside its two forms are stopped with guidance', () => {
      const first = source => { const e = compileProject(meijinWork(source)).errors[0]; return e ? e.code + ':' + e.message.slice(0, 16) : 'none'; };
      eq([first('ねこが動いているうちに、犬は「まって」と言う。'), first('主役を、いちばん近い星にする。'), first('もし主役がいちばん近いなかまなら、ねこは「a」と言う。'),
        first('点数を、いちばん近いなかままでのきょりにする。'), first('間隔秒ごとに、点数を1増やす。'), first('ねこは、一辺が20歩の四角をかく。'), first('ねこは前へ十歩進む。')],
        ['P205:「〜しているうちに」は、同時に ', 'P205:「いちばん近い」は「〜の方を向く', 'P205:「いちばん近い」は「〜の方を向く', 'S304:「いちばん近い」は、だれから 近',
          'P205:「〜秒ごとに」の 時間は、作品を', 'P205:「一辺が20歩の四角をかく」では', 'P205:「十歩」は 漢数字です。名人モー']);
      const tie = meijinRun('ねこは画面の左下のはしから、右へ0歩、上へ100歩のばしょへ行く。\n犬は画面の左下のはしから、右へ100歩、上へ100歩のばしょへ行く。\n鳥は画面の左下のはしから、左へ100歩、上へ100歩のばしょへ行く。\nなかまを、犬と鳥にする。\nねこは、いちばん近いなかままでのきょりを言う。', { until: 50 });
      eq(tie.speech, ['0:ねこ:100歩']);
    });
    test('meijin stopping a part ends its motion in another flow, which goes on', () => {
      const stopper = { id: 'core-meijin-stop', mode: 'meijin', targetId: 'meijin', event: 'start', source: '1秒待つ。\nねこの動きを止める。' };
      const glide = meijinRun('ねこは2秒かけて、いまのばしょから、右へ100歩動く。\nねこは「ついた」と言う。\n犬は「つぎ」と言う。', { until: 2500, samples: [2500], extra: [stopper] });
      eq([glide.speech, glide.errors], [['1010:ねこ:ついた', '1010:犬:つぎ'], []]);
      ok(Math.abs(glide.x[2500][0] - 50) <= 1, 'ねこ stopped at ' + glide.x[2500][0]);
      const until = meijinRun('ねこは、1秒に50歩の速さで、鳥にふれるまで右へ動き続ける。\nねこは「ついた」と言う。', { until: 2500, samples: [2500], extra: [stopper] });
      eq(until.speech, ['1010:ねこ:ついた']);
      ok(Math.abs(until.x[2500][0] - 50) <= 1, 'ねこ stopped at ' + until.x[2500][0]);
      const procedure = meijinRun('【すすむ】という手順を、次のように作る。\n  2秒かけて、いまのばしょから、右へ100歩動く。\n  「まだ」と言う。\nねこは【すすむ】という手順を行う。\nねこは「おわり」と言う。', { until: 2500, extra: [stopper] });
      eq(procedure.speech, ['1010:ねこ:おわり']);
    });
    test('meijin moves stop on the clock of the continuous rules whatever the steps of the clock', () => {
      const stopAt = (source, steps) => {
        const p = meijinWork(source), compiled = compileProject(p); eq(compiled.errors, []);
        let now = 0; const r = new RuntimeModel(p, {}), q = new EventScheduler(p, compiled, r, {});
        r.now = () => now; q.schedule = () => {};
        try { q.start(); for (let k = 0; now < 4000; k++) { for (let i = 0; i < 500 && q.ready.length; i++) q.runTurn(); q.recheckBlocked(); now += steps[k % steps.length]; } return r.actor('core-cat').x; } finally { q.stop(); }
      };
      for (const steps of [[10], [37], [5, 61, 23], [100]]) {
        eq(stopAt('ねこは、1秒に60歩の速さで、犬にふれるまで右へ動き続ける。', steps), 160);
        eq(stopAt('1秒のあいだ、ねこは1秒に50歩の速さで右へ動き続ける。', steps), 50);
      }
    });
    test('meijin a procedure made in the text is renamed with its calls, and a part used in 〜までのきょり does not stop the check', () => {
      const p = meijinWork('【とぶ】という手順を、次のように作る。\n  いまのばしょから、上へ20歩動く。\nねこは【とぶ】という手順を行う。');
      p.scripts.push({ id: 'core-dog-jump', targetId: 'core-dog', event: 'start', source: '【とぶ】という手順を行う。' });
      eq(compileProject(p).errors, []);
      const id = Akari.meijinProjectDefinitions(p)[0].id, next = Akari.prepareMeijinProcedureRename(p, id, 'はねる');
      eq(next.scripts.map(s => s.source), ['【はねる】という手順を、次のように作る。\n  いまのばしょから、上へ20歩動く。\nねこは【はねる】という手順を行う。', '【はねる】という手順を行う。']);
      eq(compileProject(next).errors, []);
      p.actions = [{ id: 'core-hop', ownerId: 'stage', name: 'はねる', args: [], source: '何もしない。' }];
      let refused = null; try { Akari.prepareMeijinProcedureRename(p, id, 'はねる'); } catch (e) { refused = e.code; }
      eq(refused, 'F503');
      eq(compileProject(meijinWork('点数を、いちばん近いなかままでのきょりにする。')).errors.map(e => e.code), ['S304']);
    });
    test('meijin lanes cannot end a repeat outside them', () => {
      const errors = compileProject(meijinWork('3回くり返す。\n  次のことを同時に始める。\n    ねこは「a」と言う。\n    このくり返しを終える。')).errors;
      eq(errors.map(e => e.code), ['S315']);
    });
    test('meijin script is never made into blocks', () => {
      const p = meijinWork('なかまは、みんな、いまのばしょから、右へ10歩動く。'), session = createEditorSession('script:core-meijin', p.scripts[0].source, { targetId: 'stage', event: 'start', meijin: true }, p);
      eq([!!session.syntaxAst, session.blockView, session.diagnostics], [true, null, []]);
    });
    test('meijin exported work keeps its procedures and events', () => {
      const p = meijinWork('');
      Akari.updateScriptSource(p.scripts[0], '【ジャンプ】という手順を、次のように作る。\n  いまのばしょから、上へ20歩動く。\nねこは【ジャンプ】という手順を行う。\n1秒ごとに、点数を1増やす。\nねこが犬にふれたとき、犬は「いたい」と言う。', p);
      eq(p.scripts[0].document?.unitIds?.length, 3);
      const restored = AKARI_RUNTIME.restoreExecutable(JSON.parse(JSON.stringify(packExecutable(p))));
      eq(restored.compiled.items.map(i => i.event || i.key.split(':')[0]).sort(), ['action', 'interval', 'start', 'touchStart']);
      ok(restored.compiled.symbols.actions.has('ジャンプ'), 'the procedure made in the text travels');
    });
    // XR-01: the うごく作品 opens every 名人 work the editor runs. The 名人 reader marks some subjects for the work check
    // only (a sentence after a group subject or after two named subjects, a sentence with no subject under 〜が〜にふれたとき).
    for (const [name, source, variables] of [
      ['two conditions', '点数を3にする。\nもし点数が奇数なら、ねこは「きすう」と2秒話す。\nもし点数が偶数なら、ねこは「ぐうすう」と2秒話す。', ['点数']],
      ['touch body without a subject', '犬がねこにふれたとき、点数を1ふやす。', ['点数']],
      ['after a group subject', 'なかまは、順番に「やあ」と1秒話す。\n点数を1ふやす。', ['点数']],
    ]) test('meijin exported work opens: ' + name, () => {
      const p = meijinWork('', { variables });
      Akari.updateScriptSource(p.scripts[0], source, p);
      eq(compileProject(p).errors.map(e => e.code), []);
      const restored = AKARI_RUNTIME.restoreExecutable(JSON.parse(JSON.stringify(packExecutable(p))));
      ok(restored.compiled.items.length > 0, 'restored');
    });
    // XR-03: a body with two headings opens in the うごく作品 also when its script has no document record (a file
    // written by a tool, or a project given straight to the public API).
    test('exported work opens a body with two headings and no document record', () => {
      const p = makeRegressionProject();
      p.scripts = [{ id: 'core-two-headings', targetId: 'sprite-1', event: 'start', source: '作品を動かしたとき、\n  「はじめ」と言う。\nおされたとき、\n  「おされた」と言う。' }];
      eq(compileProject(p).errors.map(e => e.code), []);
      ok(!p.scripts[0].document, 'no document record');
      const restored = AKARI_RUNTIME.restoreExecutable(JSON.parse(JSON.stringify(packExecutable(p))));
      eq(restored.compiled.items.filter(i => String(i.key).startsWith('script')).map(i => i.event).sort(), ['click', 'start']);
    });
    test('exported work keeps a subject written with が', () => {
      const p = laneProject(); p.scripts = [{ id: 'core-ga', targetId: 'stage', event: 'start', source: '犬が、いまのばしょから、右へ10歩動く。\nタイマーを0にする。\n犬は、ねこが2回おされるまで待つ。' }];
      eq(compileProject(p).errors, []);
      const restored = AKARI_RUNTIME.restoreExecutable(JSON.parse(JSON.stringify(packExecutable(p))));
      ok(restored.compiled.items.length > 0, 'restored');
    });
    return {
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      total: results.length,
      results,
    };
  }
