async function runCoreTests() {
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
    // A test is named by its sensor (the block schema SensorRead:<name>). 位置 is not read, so the four
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
    // 「1つずつ 動かす」 runs one turn at a time of the same program: a body that a watch starts (〜になったとき,
    // 〜にふれたとき) starts while stepping as it does while running.
    test('stepping starts the bodies a condition or a touch starts', () => {
      const speech = (p, stepping) => {
        const compiled = compileProject(p); eq(compiled.errors, []);
        const said = [], r = new RuntimeModel(p, {}), q = new EventScheduler(p, compiled, r, { say: (id, text) => said.push(String(text)) });
        r.now = () => 0; q.schedule = () => {};
        try {
          q.start();
          if (stepping) { q.pause(); for (let i = 0; i < 60; i++) q.stepOne(); }
          else for (let i = 0; i < 60; i++) { q.runTurn(); q.recheckBlocked(); }
        } finally { q.stop(); }
        return said;
      };
      const meijin = meijinWork('点数を3にする。\n点数が3になったとき、ねこは「3になった」と言う。\nねこは犬のところへ行く。\nねこが犬にふれたとき、ねこは「ふれた」と言う。');
      const ordinary = makeRegressionProject();
      ordinary.scripts = [];
      for (const source of ['作品を動かしたとき、\n  「ボタン1」のところへ行く。', '「ボタン1」にふれたとき、\n  「ふれた」と言う。']) {
        const script = { id: 'step-' + ordinary.scripts.length, targetId: 'sprite-1', event: 'start', source: '' };
        ordinary.scripts.push(script); Akari.updateScriptSource(script, source, ordinary);
      }
      eq([speech(meijin, false), speech(meijin, true), speech(ordinary, false), speech(ordinary, true)],
        [['3になった', 'ふれた'], ['3になった', 'ふれた'], ['ふれた'], ['ふれた']]);
    });
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
      const made = meijinRun('点数を9にする。\n鳥のコピーを3つ作る。\nできたコピーは、それぞれ前へ10歩進んでから、消える。\n点数を、鳥のコピーの数にする。', { until: 50 });
      eq([made.vars.点数, made.copies, made.errors], [0, 0, []]);
      const all = meijinRun('点数を9にする。\n鳥のコピーを3つ作る。\n合計を、鳥のコピーの数にする。\n鳥のコピーを全部消す。\n点数を、鳥のコピーの数にする。\nもし鳥がコピーなら、犬は「x」と言う。', { until: 50 });
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
      // The sentences of the lanes are read as the others: a key compared with the pressed key is its keyboard name, and in
      // a later part of the text (under another heading) their lines are those of the whole text.
      const text = '作品を動かしたとき、\n  ねこは10歩進む。\n作品を動かしたとき、\n  次のことを同時に始める。\n    もしおされたキーが「みぎ」なら、\n      ねこは20歩進む。\n    犬は30歩進む。';
      const lanes = parseScript(text, buildSymbols(meijinWork('')), { targetId: 'stage', event: 'start', meijin: true }).units[0].body[0].lanes;
      eq([lanes[0][0].condition.right.value, lanes[0][0].sourceSpan.startLine, lanes[1][0].sourceSpan.startLine], ['右', 5, 7]);
    });
    test('meijin moving until a condition or for a time, and repeating for a time', () => {
      const until = meijinRun('ねこは、1秒に100歩の速さで、犬にふれるまで右へ動き続ける。\nねこは「ついた」と言う。', { until: 3000 });
      ok(/^16\d0:ねこ:ついた$/.test(until.speech[0]) && until.errors.length === 0, until.speech.join());
      eq(meijinRun('1秒のあいだ、ねこは1秒に50歩の速さで右へ動き続ける。\n点数を、ねこのよこのばしょにする。', { until: 1500 }).vars.点数, 50);
      const repeat = meijinRun('1秒のあいだ、くり返す。\n  0.25秒待つ。\n  点数を1増やす。\nねこは「おわり」と言う。', { until: 2000 });
      eq([repeat.vars.点数, repeat.speech], [4, ['1040:ねこ:おわり']]);
      let missing = null; try { parseScript('ねこは、犬にふれるまで右へ動き続ける。', buildSymbols(meijinWork('')), { targetId: 'stage', event: 'start', meijin: true }); } catch (e) { missing = e.code; }
      eq(missing, 'P205');
      // A line the 名人 reader writes again (ねこが犬より右に… is a comparison of their places) with the speed on the next
      // line: the mistake is told as for a part's body, with no rewrite of the two lines (the line is not the child's words).
      const rewritten = compileProject(meijinWork('ねこが犬より右にいるあいだ、前へ動き続ける。\n1秒に10歩の速さで動く。')).errors;
      eq([rewritten.map(e => e.code), rewritten[0]?.proposals], [['P205'], undefined]);
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
      // The end of a speech is a condition as any other: a wait for it may be joined with 〜てから, or written with a
      // subject, and the body waits for it as for any wait (LANGUAGE.md「待つ」).
      const say = [{ id: 'core-cat-say', targetId: 'core-cat', event: 'start', source: '「やあ」と2秒話す。' }];
      for (const source of ['0.1秒待つ。\nねこが話し終わるまで待ってから、犬は「おわった」と言う。', '0.1秒待つ。\n犬は、ねこが言い終わるまで待つ。\n犬は「おわった」と言う。'])
        eq(meijinRun(source, { until: 3000, extra: say }).speech, ['0:ねこ:やあ', '2010:犬:おわった']);
    });
    test('meijin parts written together, then a clause of another subject: that clause is done once, after them', () => {
      // ねこと犬は…して、鳥は…: the parts together do what comes before 、鳥は; 鳥's clause, and what follows it, is done
      // once after them, in the order written (LANGUAGE.md 決まり「〜して、」でつないだ文は書いた順). The next sentence
      // takes no subject from it.
      for (const source of ['ねこと犬は10歩進んで、鳥は10歩進む。', 'ねこも犬も10歩進んで、鳥は10歩進む。', 'ねこと犬は10歩進んで、鳥が10歩進む。'])
        eq(meijinRun(source, { until: 100, samples: [100] }).x[100], [10, 210, 410]);
      eq(meijinRun('ねこと犬は10歩進んで、鳥は10歩進んで、20歩進む。', { until: 100, samples: [100] }).x[100], [10, 210, 430]);
      for (const source of ['ねこと犬は1秒待って、鳥は10歩進む。', 'ねこと犬は1秒待ってから鳥は10歩進む。'])
        eq(meijinRun(source, { until: 1500, samples: [500, 1500] }).x, { 500: [0, 200, 400], 1500: [0, 200, 410] });
      eq(meijinRun('ねこと犬は2秒かけて、いまのばしょから、右へ40歩動いて、鳥は10歩進む。', { until: 2500, samples: [1000, 2500] }).x, { 1000: [20, 220, 400], 2500: [40, 240, 410] });
      eq(compileProject(meijinWork('ねこと犬は10歩進んで、鳥は10歩進む。\n「やあ」と言う。')).errors.map(e => e.code), ['S304']);
      // Nor after a sentence of two subjects joined with 〜て (決まり4). The sentence after it says the subject ended.
      eq(compileProject(meijinWork('ねこは10歩進んで、犬は10歩進む。\n「やあ」と言う。')).errors.map(e => e.code), ['S304']);
      const split = parseSyntax('ねこと犬は10歩進んで、鳥は10歩進む。\n「やあ」と言う。', { symbols: buildSymbols(meijinWork('何もしない。')), targetId: 'meijin', event: 'start', meijin: true }).ast;
      eq(split.body.at(-1).actorRef, { kind: 'self', topicEnded: true });
      // A part in a condition is no other subject: the sentence stays one sentence of the parts together.
      const kept = parseSyntax('ねこと犬は1秒待って、ねこが画面のはしにふれるまで待つ。', { symbols: buildSymbols(meijinWork('何もしない。')), targetId: 'meijin', event: 'start', meijin: true }).ast;
      eq(kept.body.map(n => [n.kind, n.lanes?.map(l => l.map(m => m.kind))]), [['Parallel', [['WaitTime', 'WaitUntil'], ['WaitTime', 'WaitUntil']]]]);
      // The fix of a place with one leg is written for the parts together (ねこと犬は／ねこも犬も…); a line split after them
      // has the notice without a rewrite of the whole line, which would drop the other subject's clause.
      const place = '画面の左下のはしから、右へ320歩のばしょへ行く', fixes = source => compileProject(meijinWork(source)).notes.filter(n => n.code === 'I120').map(n => (n.proposals || []).map(x => x.source));
      for (const group of ['ねこと犬は', 'ねこも犬も'])
        eq(fixes(group + '、' + place + '。'), [[group + '画面の左下のはしから、右へ320歩、上へ（たてのばしょ）歩のばしょへ行く', group + '画面の左下のはしから、右へ320歩、上へ0歩のばしょへ行く']]);
      eq(fixes('ねこと犬は、' + place.replace(/行く$/, '行って') + '、鳥は10歩進む。'), [[]]);
      // With みんな／それぞれ／順番に the fix keeps the word for the parts together.
      for (const order of ['みんな', 'それぞれ', '順番に'])
        eq(fixes('ねこと犬は、' + order + '、' + place + '。'), [['ねこと犬は、' + order + '画面の左下のはしから、右へ320歩、上へ（たてのばしょ）歩のばしょへ行く', 'ねこと犬は、' + order + '画面の左下のはしから、右へ320歩、上へ0歩のばしょへ行く']]);
      // ねこも犬も: two parts written with も are the parts together. 自分は after the parts together names no other part,
      // so the line is not split there (and 自分 names no part of the 名人 body: S304).
      const meijinShape = source => parseSyntax(source, { symbols: buildSymbols(meijinWork('何もしない。')), targetId: 'meijin', event: 'start', meijin: true }).ast.body.map(n => [n.kind, n.lanes?.map(l => l.map(m => m.kind + ':' + m.actorRef?.kind + ':' + (m.actorRef?.name ?? '')))]);
      eq(meijinShape('ねこも犬も10歩進む。'), [['Parallel', [['MotionCommand:named:ねこ'], ['MotionCommand:named:犬']]]]);
      eq(meijinShape('ねこと犬は10歩進んで、自分は10歩進む。'), [['Parallel', [['MotionCommand:named:ねこ', 'MotionCommand:self:'], ['MotionCommand:named:犬', 'MotionCommand:self:']]]]);
      eq(compileProject(meijinWork('ねこと犬は10歩進んで、自分は10歩進む。')).errors.map(e => e.code), ['S304']);
      // A subject held in a variable, written once with 〜て, is carried on as any one subject; with another subject after
      // it, no subject is carried on.
      eq(compileProject(meijinWork('主役をねこにする。\n主役は10歩進んで、「やあ」と言う。\n20歩進む。')).errors, []);
      eq(compileProject(meijinWork('主役をねこにする。\n主役は10歩進んで、犬は「やあ」と言う。\n20歩進む。')).errors.map(e => e.code), ['S304']);
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
    // ほかの動きを全部止める stops the other bodies (LANGUAGE): written in a lane of 次のことを同時に始める, the body it is
    // written in (its flow, with its lanes) goes on.
    test('meijin stopping the others from a lane keeps its own body', () => {
      eq(meijinRun('作品を動かしたとき、\n  1秒待つ。\n  ねこは「ほかの本文」と言う。\n作品を動かしたとき、\n  犬は「はじめ」と言う。\n  次のことを同時に始める。\n    ほかの動きを全部止める。\n    ねこは「となりの並び」と言う。\n  犬は「並びのあと」と言う。', { until: 1500 }).speech, ['0:犬:はじめ', '0:ねこ:となりの並び', '0:犬:並びのあと']);
    });
    // A watch of ふれたとき forgets the copies that went: what it keeps stays as many as the parts there are.
    test('a touch watch forgets copies that went', () => {
      const p = makeDefaultProject(), id = p.components.find(c => c.type === 'sprite').id;
      p.scripts = [{ id: 'w-make', targetId: id, event: 'start', source: 'ずっとくり返す。\n  自分のコピーを作る。\n  0.01秒待つ。' }, { id: 'w-go', targetId: id, event: 'cloneStart', source: '0.05秒待つ。\nこのコピーだけを消す。' },
        { id: 'w-touch', targetId: id, event: 'touchStart', filter: { target: '端' }, source: '何もしない。' }];
      const r = new RuntimeModel(p, {}); let now = 0; r.now = () => now; const q = new EventScheduler(p, compileProject(p), r, {}); q.schedule = () => {};
      try { q.start(); for (now = 0; now <= 3000; now += 10) { for (let i = 0; i < 500 && q.ready.length; i++) q.runTurn(); q.recheckBlocked(); }
        const alive = [...r.actors.values()].filter(a => a.baseId === id).length; ok(q.watches[0].last.size <= alive && q.watches[0].poses.size <= alive, q.watches[0].last.size + ' / ' + alive); } finally { q.stop(); }
    });
    // One step after a turn of a loop runs a sentence, also when the loop's pace is still queued before it.
    test('the first step after a loop turn runs a sentence', () => {
      const p = makeDefaultProject(), id = p.components.find(c => c.type === 'sprite').id;
      p.scripts = [{ id: 'step-loop', targetId: id, event: 'start', source: 'ずっとくり返す。\n  前へ10歩進む。' }];
      const r = new RuntimeModel(p, {}), ran = []; let now = 0; r.now = () => now; r.pauseClock = () => {};
      const q = new EventScheduler(p, compileProject(p), r, { beforeStatement: (_, n) => ran.push(n.kind) }); q.schedule = () => {};
      try { q.start(); q.runTurn(); q.runTurn(); q.pause(); ran.length = 0; q.stepOne(); eq(ran, ['MotionCommand']); } finally { q.stop(); }
    });
    // A flow stopped while it speaks for a time takes its bubble with it (no timer of its own would end it).
    test('a stopped timed speech leaves no bubble', () => {
      const p = makeDefaultProject(), id = p.components.find(c => c.type === 'sprite').id;
      p.scripts = [{ id: 'bubble-a', targetId: id, event: 'start', source: '「こんにちは」と3秒話す。\n「またね」と言う。' }, { id: 'bubble-k', targetId: id, event: 'click', source: '自分のほかの動きを止める。' }];
      const compiled = compileProject(p), r = new RuntimeModel(p, {}), log = []; let now = 0; r.now = () => now;
      const q = new EventScheduler(p, compiled, r, { say: (_, t) => log.push('say:' + t), clearSpeech: () => log.push('clear') }); q.schedule = () => {};
      const pump = () => { for (let i = 0; i < 100 && q.ready.length; i++) q.runTurn(); };
      try { q.start(); pump(); for (now = 0; now <= 2000; now += 10) { if (now === 1000) q.spawnForRuntime(id, 'click'); pump(); q.recheckBlocked(); pump(); } eq(log, ['say:こんにちは', 'clear']); } finally { q.stop(); }
    });
    // ... and a lane's 〜まで動き続ける of that body is not stopped with them: it moves on until it ends.
    test('meijin stopping the others keeps a move of its own lanes', () => {
      const out = meijinRun('次のことを同時に始める。\n  ねこは、1秒に60歩の速さで、犬にふれるまで右へ動き続ける。\n  鳥は0.5秒待って、ほかの動きを全部止める。\n犬は「ついた」と言う。', { until: 10000 });
      ok(out.speech.some(s => s.endsWith(':犬:ついた')), out.speech.join(' / '));
    });
    test('meijin one sentence is one lane and keeps its order', () => {
      eq(meijinRun('次のことを同時に始める。\n  ねこは「a」と1秒話して、「b」と言う。\n  犬は「c」と言う。', { until: 1500 }).speech, ['0:ねこ:a', '0:犬:c', '1010:ねこ:b']);
    });
    // みんな in a made block called by みんな: the inner lanes are the inner list's parts, not the caller's.
    test('meijin everyone inside a block called by everyone', () => {
      eq(meijinRun('【あいさつ】という手順を、次のように作る。\n  持ち物は、みんな、「やあ」と言う。\nなかまを、ねこと犬にする。\n持ち物を、鳥と犬にする。\nなかまは、みんな、【あいさつ】という手順を行う。', { until: 500 }).speech.sort(),
        ['0:犬:やあ', '0:犬:やあ', '0:鳥:やあ', '0:鳥:やあ']);
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
    // A made block cut by 〜の動きを止める stops the lanes it started: their waits do not run on into the rest of it.
    test('meijin a cut made block stops its lanes', () => {
      const out = meijinRun('【歩く】という手順を、次のように作る。\n  次のことを同時に始める。\n    1秒待って、いまのばしょから、右へ100歩動く。\n    「a」と言う。\n  「手順おわり」と言う。\nねこは【歩く】という手順を行う。\n犬は「つぎ」と言う。\n犬は2秒待つ。\n作品を動かしたとき、\n  0.5秒待つ。\n  ねこの動きを止める。', { until: 3000, samples: [3000] });
      eq([out.errors, out.speech.filter(s => /手順おわり/.test(s)), out.x[3000][0]], [[], [], 0]);
    });
    // A mistake in reading the subject is told on the line of that sentence, not the one before.
    test('meijin a wrong subject is told on its own line', () => {
      const out = meijinRun('ねこは「つぎ」と言う。\n主役は「やあ」と言う。', { until: 200 });
      ok(out.errors.length === 1 && out.errors[0].endsWith('@2'), JSON.stringify(out.errors));
    });
    // A made block run on a copy that goes (消える。 inside it) ends where it was called; the flow goes on without an error.
    test('meijin a copy that goes inside a made block ends that block', () => {
      const out = meijinRun('【さよなら】という手順を、次のように作る。\n  消える。\n  「さようなら」と言う。\n鳥のコピーを1つ作る。\nなかまを、できたコピーにする。\n主役を、なかまの1番目にする。\n主役は【さよなら】という手順を行う。\nねこは「おわり」と言う。', { until: 500 });
      eq([out.errors, out.speech.some(s => s.endsWith(':ねこ:おわり')), out.speech.some(s => s.includes('さようなら'))], [[], true, false]);
    });
    // 〜のコピーを全部消す ends the flow of a copy that went with it; the 名人の本文 that said it, which is no copy, goes on
    // (and a copy that went is R405 as a subject there).
    test('meijin the body goes on after it takes all copies of a part away', () => {
      const out = meijinRun('鳥のコピーを2つ作る。\nなかまを、できたコピーにする。\n鳥のコピーを全部消す。\n点数を5にする。\nねこは「おわり」と言う。\nなかまは、みんな「やあ」と言う。', { until: 500 });
      eq([out.vars.点数, out.copies, out.speech.some(s => s.endsWith(':ねこ:おわり')), out.errors], [5, 0, true, ['R405@6']]);
      const own = meijinRun('鳥のコピーを2つ作る。\n鳥のコピーが作られたとき、\n  0.1秒待つ。\n  鳥のコピーを全部消す。\n  ねこは「のこり」と言う。', { until: 500 });
      eq([own.copies, own.speech, own.errors], [0, [], []]);
    });
    // A copy that goes ends its own flows only: the body that had it speak or move goes on (and says おわり).
    test('meijin a copy that goes leaves the body that used it', () => {
      const copy = { id: 'core-bird-gone', targetId: 'core-bird', event: 'cloneStart', source: '0.5秒待つ。\nこのコピーだけを消す。' }, head = '鳥のコピーを1つ作る。\nなかまを、できたコピーにする。\n主役を、なかまの1番目にする。\n';
      const said = meijinRun(head + '主役は「やあ」と2秒話す。\nねこは「おわり」と言う。', { until: 3000, extra: [copy] }), moved = meijinRun(head + '主役は2秒かけて、いまのばしょから、右へ40歩動く。\nねこは「おわり」と言う。', { until: 3000, extra: [copy] });
      eq([said.speech.some(s => s.endsWith(':ねこ:おわり')), said.errors, moved.speech.some(s => s.endsWith(':ねこ:おわり')), moved.errors], [true, [], true, []]);
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
          'P205:「〜秒ごとに」の 時間は、作品を', 'P205:「一辺が20歩の四角をかく」では', 'P205:「十歩」は 漢数字です。名人の本']);
      // LANGUAGE.md: 漢数字には数字の書き方（「十歩」→「10歩」）を示します; the name is 「名人」, never 「名人モード」 (final call 23).
      const kanji = compileProject(meijinWork('ねこは前へ十歩進む。')).errors[0].message;
      ok(kanji.includes('「10歩」') && !kanji.includes('名人モード'), kanji);
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
    // A rename tells the length the product takes for that kind: data and own blocks 1〜32 characters (validateName),
    // parts, pictures and sounds 1〜80 (validateResourceName); the longest one of each is taken.
    test('a rename tells the name length of its kind', () => {
      const work = () => {
        const p = makeDefaultProject(), base = p.components.find((c) => c.type === 'sprite');
        p.components = [{ ...base, id: 'len-cat', name: 'ねこ', costumes: [{ id: 'len-face', name: '顔', kind: 'text', value: '●' }], costumeId: 'len-face', localData: { variables: [], lists: [] } }];
        p.projectData = { variables: [{ id: 'len-score', name: '点数', initialValue: 0 }], lists: [{ id: 'len-items', name: '持ち物', initialValue: [] }] };
        p.actions = [{ ownerId: 'stage', id: 'len-act', name: '回る', args: [], source: '何もしない。' }];
        p.functions = [{ ownerId: 'stage', id: 'len-fn', name: '倍', args: ['かず'], source: 'かず×2を答えとして返す。' }];
        p.sounds = [{ id: 'len-sound', name: 'ピコ', assetId: 'len-asset' }];
        p.scripts = [{ id: 'len-body', targetId: 'len-cat', event: 'start', source: '点数を言う。' }];
        return p;
      };
      const told = (key, name) => { try { Akari.prepareResourceRename(work(), key, name); return 'ok'; } catch (e) { return e.code + ' ' + e.message; } };
      const short = 'F503 名前は 1〜32文字で つけます', long = 'F503 名前は 1〜80文字に して ください';
      const backdrop = Akari.buildProjectReferenceGraph(work()).resources.find((r) => r.kind === 'backdrop').key;
      for (const key of ['data:len-score', 'data:len-items', 'action:len-act', 'function:len-fn'])
        eq([told(key, ''), told(key, 'あ'.repeat(32)), told(key, 'あ'.repeat(33)), told(key, 'あ'.repeat(81))], [short, 'ok', short, short]);
      for (const key of ['component:len-cat', 'costume:len-face', 'sound:len-sound', backdrop])
        eq([told(key, ''), told(key, 'あ'.repeat(80)), told(key, 'あ'.repeat(81))], [long, 'ok', long]);
    });
    test('meijin lanes cannot end a repeat outside them', () => {
      const errors = compileProject(meijinWork('3回くり返す。\n  次のことを同時に始める。\n    ねこは「a」と言う。\n    このくり返しを終える。')).errors;
      eq(errors.map(e => e.code), ['S315']);
    });
    test('the editor tells of a lane that ends a repeat outside it', () => {
      const p = meijinWork('3回くり返す。\n  次のことを同時に始める。\n    ねこは「a」と言う。\n    このくり返しを終える。'),
        session = createEditorSession('script:core-meijin', p.scripts[0].source, { targetId: 'stage', event: 'start', meijin: true }, p);
      eq(session.diagnostics.map(e => e.code), ['S315']);
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
    // Intent corrections preserve scope, offer usable choices and never silently choose another meaning.
    const intentWork = (source, meijin = false) => {
      const p = makeDefaultProject(), base = p.components.find(c => c.type === 'sprite');
      p.components = ['ねこ', '星', 'ロケット', 'はし'].map((name, i) => ({ ...structuredClone(base), id: 'intent-part-' + i, name,
        costumes: [{ id: 'intent-face-' + i, name: '顔', kind: 'text', value: '●' }], costumeId: 'intent-face-' + i,
        localData: { variables: [], lists: [] } }));
      p.projectData = { variables: [{ id: 'intent-score', name: '点数', initialValue: 0 }, { id: 'intent-name', name: '名前', initialValue: '' }, { id: 'intent-target', name: '相手', initialValue: 0 }], lists: [{ id: 'intent-list', name: '持ち物', initialValue: ['本'] }] };
      p.scripts = [{ id: 'intent-body', targetId: meijin ? 'meijin' : p.components[0].id, ...(meijin ? { mode: 'meijin' } : {}), event: 'start', source }];
      p.actions = []; p.functions = []; p.sounds = [];
      return p;
    };
    const intentCheck = (source, meijin = false, edit = () => {}) => { const p = intentWork(source, meijin); edit(p); return { p, compiled: compileProject(p) }; };
    const applyIntentFix = (source, proposal) => source.slice(0, proposal.start) + proposal.source + source.slice(proposal.end);
    test('intent corrections keep nested chains and inline if bodies in their block', () => {
      for (const source of [
        '3回くり返す\n  右に90ど回って、1秒待つ。',
        '作品を動かしたとき、\n  ずっとくり返す\n    みぎに90度回って、1秒待つ。',
        '作品を動かしたとき、\n  もし「星」にふれていれば「いたい」と言う。',
        '3回くり返す\n  もし点数が10をこえたら、「あ」と言う。',
      ]) {
        const first = intentCheck(source).compiled.errors[0]; ok(first?.proposals?.length, source);
        for (const proposal of first.proposals) { const fixed = applyIntentFix(source, proposal); eq(intentCheck(fixed).compiled.errors, []); ok(!/\n1秒待つ/.test(fixed), fixed); }
      }
    });
    test('intent corrections keep an unrelated second error fixable', () => {
      const source = '右に90ど回る。\n左に90ど回る。', first = intentCheck(source).compiled.errors[0];
      ok(first.proposals?.length); const next = intentCheck(applyIntentFix(source, first.proposals[0])).compiled.errors[0];
      eq(next.line, 2); ok(next.proposals?.length);
    });
    test('every proposal is placed inside the line it corrects', () => {
      // A proposal takes its place from the line's positions; every line whose error is shown has them (sentenceDiagnostic).
      for (const [source, meijin] of [
        ['さくひんをうごかしたとき、\n  「あ」と言う。', false], ['「スタート」を受けとったとき、\n  「あ」と言う。', false],
        ['クリックしたとき、\n  「あ」と言う。', false], ['作品を動かしたとき\n  「あ」と言う。', false],
        ['「あ」と言う。\n3回くり返す\n  右に90ど回って、1秒待つ。', false], ['「あ」と言う。\nもし点数が10をこえたら、「あ」と言う。', false],
        ['「あ」と言う。\n右に90ど回る。', false], ['ねこは「あ」と言う。\nねこは、ゆっくり右に90度回り、1秒待つ。', true],
      ]) {
        const first = intentCheck(source, meijin).compiled.errors[0], lines = source.split('\n');
        ok(first?.proposals?.length, source);
        const from = lines.slice(0, first.line - 1).reduce((n, line) => n + line.length + 1, 0), to = from + lines[first.line - 1].length;
        for (const proposal of first.proposals)
          ok(Number.isInteger(proposal.start) && Number.isInteger(proposal.end) && from <= proposal.start && proposal.start <= proposal.end && proposal.end <= to,
            source + ' ' + JSON.stringify([proposal.start, proposal.end, from, to]));
      }
    });
    test('intent corrections preserve all three waits on the logical clock', () => {
      const source = '3回くり返す\n  右に90ど回って、1秒待つ。\n「おわり」と言う。', first = intentCheck(source).compiled.errors[0], fixed = applyIntentFix(source, first.proposals[0]), { p, compiled } = intentCheck(fixed), r = new RuntimeModel(p), speech = [];
      let now = 0; r.now = () => now;
      const q = new EventScheduler(p, compiled, r, { say: (id, text) => speech.push([now, text]) }); q.schedule = () => {};
      try { q.start(); for (now = 0; now <= 3100; now++) { q.recheckBlocked(); for (let n = 0; n < 500 && q.ready.length; n++) q.runTurn(); q.recheckBlocked(); } eq(speech.map(x => x[1]), ['おわり']); ok(Math.abs(speech[0][0] - 3000) <= 20); } finally { q.stop(); }
    });
    test('slow near forms keep their time across all connective spellings', () => {
      for (const [source, meijin] of [
        ['ゆっくり右に90度回り、1秒待つ。', false], ['ゆっくり右に90度回って1秒待つ。', false],
        ['もし点数が1なら、ゆっくり右に90度回って、1秒待つ。', false],
        ['ねこは、ゆっくり右に90度回り、1秒待つ。', true], ['右に90度、1秒かけて回り、1秒待つ。', false],
      ]) { const first = intentCheck(source, meijin).compiled.errors[0]; ok(first.proposals?.length, source); const fixed = applyIntentFix(source, first.proposals[0]); ok(fixed.includes('1秒かけて、'), fixed); eq(intentCheck(fixed, meijin).compiled.errors, []); }
    });
    test('movement guidance examples read and preserve the written direction', () => {
      for (const source of ['よこのばしょを、200にする。', 'よこのばしょを、10増やす。']) {
        const message = intentCheck(source).compiled.errors[0].message, example = /「(画面の左下[^」]+|いまのばしょから[^」]+)」/.exec(message)?.[1];
        ok(example, message); eq(intentCheck(example + '。').compiled.errors, []);
      }
      for (const source of ['いまのばしょから、右へゆっくり10歩動く。', 'みぎに90度回る。', 'ねこは、ひだりに90度回る。', '右へ10歩ずつ動く。', '左に（点数）ど回る。', '「ロケット」まで1秒かけて行く。', 'はしまで行く。', 'みぎへ10歩動く。', '「星」のところまで2秒で行く。']) {
        const first = intentCheck(source).compiled.errors[0]; ok(first.proposals?.length, source); for (const proposal of first.proposals) eq(intentCheck(applyIntentFix(source, proposal)).compiled.errors, []);
      }
      ok(intentCheck('右へ10歩、右へ5歩、上へ3歩動く。').compiled.errors[0].message.includes('1つずつ'));
    });
    test('chain axis notices retain both readable choices', () => {
      const source = '画面の左下のはしから、右へ320歩のばしょへ1秒かけて行って、1秒待つ。', result = intentCheck(source).compiled;
      eq(result.errors, []); const notice = result.notes.find(n => n.code === 'I120'); eq(notice.proposals.length, 2);
      for (const proposal of notice.proposals) eq(intentCheck(applyIntentFix(source, proposal)).compiled.errors, []);
    });
    test('quiz spelling guidance does not redirect text answers into part values', () => {
      for (const word of ['星', 'はい', 'はなこ', 'にんじん', 'とまと']) {
        const source = 'もし答えが' + word + 'なら、\n  「あ」と言う。', first = intentCheck(source).compiled.errors[0];
        eq(first.code, 'P205'); ok(first.proposals?.length, word); ok(first.proposals[0].source.includes('「' + word + '」'));
      }
      ok(intentCheck('もしりんごが答えなら、\n  「あ」と言う。').compiled.errors[0].proposals?.length);
      // A value written there (自分の…, a list's item, a sum) is compared as it is: no 「 」 is offered for it.
      for (const source of ['もし答えが自分の体力なら、\n  「あ」と言う。', '答えが自分の体力になるまで待つ。', 'もし持ち物の1番目が答えなら、\n  「あ」と言う。', 'もし体力＋1が答えなら、\n  「あ」と言う。'])
        ok(!intentCheck(source).compiled.errors.some(e => e.code === 'P205'), source);
      const meijin = intentCheck('ねこは「なに？」とたずねて、答えを待つ。\nもし答えが星なら、\n  ねこは「あ」と言う。', true).compiled;
      eq(meijin.errors, []); ok(meijin.notes.some(n => n.code === 'I123'));
    });
    // A part's value before a 番目 or 文字目 of the same expression is written back in （ ）: it reads back as written.
    test('a part value before a later nth reads back the same', () => {
      const p = intentWork(''), symbols = buildSymbols(p), ctx = { targetId: 'stage', event: 'start', symbols };
      for (const source of ['（「ねこ」の大きさ）＋「あいう」の2文字目を言う。', '（「ねこ」の大きさ）÷「あいう」の2文字目のあまりを言う。', '（「ねこ」の大きさ）から［1、2］の1番目のどれかを言う。',
        '（「ねこ」の大きさ）の1文字目を言う。', '（「ねこ」の大きさ×2）＋「あいう」の2文字目を言う。']) {
        const first = parseSyntax(source, ctx), again = parseSyntax(formatScript(first.ast, { symbols }), ctx);
        eq([first.syntaxDiagnostics.length, again.syntaxDiagnostics.length], [0, 0]); ok(astEquivalent(first.ast, again.ast), formatScript(first.ast, { symbols }));
      }
    });
    // The same holds when the part's value is not at the head of the left side, and for the value before 「に〜が入っている」
    // and 「の中で〜がはじめて出てくる番号」: each tree is written to a text that reads back to the same tree.
    test('a part value inside the left side before a later nth reads back the same', () => {
      const p = intentWork('');
      p.components[0].localData = { variables: [], lists: [{ id: 'intent-treasure', name: '宝物', initialValue: ['本'] }] };
      const symbols = buildSymbols(p), ctx = { targetId: p.components[1].id, event: 'start', symbols };
      for (const source of ['（1＋「ねこ」の大きさ）＋名前の1文字目を言う。', '（1＋「ねこ」の大きさ）＋持ち物の1番目を言う。', '（－「ねこ」の大きさ）＋名前の1文字目を言う。',
        '（1＋「ねこ」の大きさ）から持ち物の1番目のどれかを言う。', '（1＋「ねこ」の大きさ）÷名前の1文字目のあまりを言う。', '（2×「ねこ」の大きさ）＋名前の1文字目を言う。',
        '（「ねこ」の宝物）の中で名前の1文字目がはじめて出てくる番号を言う。', 'もし（「ねこ」の宝物）に名前の1文字目が入っていれば、\n  点数を1にする。',
        'もし持ち物に（1＋「ねこ」の大きさ）＋名前の1文字目が入っていれば、\n  点数を1にする。', 'もし（1＋「ねこ」の大きさ）＋名前の1文字目が3なら、\n  点数を1にする。']) {
        const first = parseSyntax(source, ctx), text = formatScript(first.ast, { symbols }), again = parseSyntax(text, ctx);
        ok(!first.syntaxDiagnostics.length, source); ok(!again.syntaxDiagnostics.length && astEquivalent(first.ast, again.ast), text);
      }
      // (a value with no part's value, and a part's value with no later 番目 or 文字目, are written without added （ ）)
      for (const source of ['1＋点数＋名前の1文字目を言う。', '1＋「ねこ」の大きさ＋点数を言う。', 'もし持ち物に点数が入っていれば、\n  点数を1にする。', '持ち物の中で名前の1文字目がはじめて出てくる番号を言う。'])
        eq(formatScript(parseSyntax(source, ctx).ast, { symbols }).trim(), source);
    });
    test('a part value before a later 番目 of a number reads back the same', () => {
      const p = intentWork(''), symbols = buildSymbols(p), ctx = { targetId: p.components[1].id, event: 'start', symbols };
      for (const source of ['（「ねこ」の大きさ）＋1番目を言う。', '（1＋「ねこ」の大きさ）＋【点数】番目を言う。', '（「ねこ」の大きさ）－（点数＋1）番目を言う。']) {
        const first = parseSyntax(source, ctx), text = formatScript(first.ast, { symbols }), again = parseSyntax(text, ctx);
        ok(!first.syntaxDiagnostics.length, source); ok(!again.syntaxDiagnostics.length && astEquivalent(first.ast, again.ast), text); eq(text.trim(), source);
      }
    });
    // A single sameness of もし is written without と同じ, also when a name before 番目 or 文字目 gets 【 】 in the writing: the first
    // writing is already the text that every later writing gives.
    test('a single sameness of もし is written without と同じ at the first writing', () => {
      const p = intentWork(''), symbols = buildSymbols(p), ctx = { targetId: p.components[1].id, event: 'start', symbols };
      const write = source => { const read = parseSyntax(source + '\n  何もしない。', ctx); ok(!read.syntaxDiagnostics.length, source); return formatScript(read.ast, { symbols }).split('\n')[0]; };
      for (const [source, written] of [['もし点数が持ち物の点数番目なら、', 'もし点数が持ち物の【点数】番目なら、'], ['もし点数が持ち物の点数番目と同じなら、', 'もし点数が持ち物の【点数】番目なら、'],
        ['もし名前が名前の点数文字目なら、', 'もし名前が名前の【点数】文字目なら、'], ['もし持ち物の点数番目が0なら、', 'もし持ち物の【点数】番目が0なら、'],
        ['もし持ち物の点数番目が持ち物の名前番目なら、', 'もし持ち物の【点数】番目が持ち物の【名前】番目なら、'], ['もし点数が持ち物の【点数】番目と同じなら、', 'もし点数が持ち物の【点数】番目なら、'],
        ['もし点数が持ち物の1番目と同じなら、', 'もし点数が持ち物の1番目なら、'], ['もし点数が【点数】と同じなら、', 'もし点数が【点数】なら、'],
        // (several parts keep と同じ on each; a sameness whose short text would read as another condition keeps it too)
        ['もし点数が1で、名前が名前の点数文字目なら、', 'もし点数が1と同じで、名前が名前の【点数】文字目と同じなら、'], ['もし点数が1と同じか、点数が持ち物の点数番目と同じなら、', 'もし点数が1と同じか、点数が持ち物の【点数】番目と同じなら、'],
        ['もし点数が（名前が2と同じ）と同じなら、', 'もし点数が（名前が2と同じ）と同じなら、'], ['もし点数が持ち物の点数番目とちがうなら、', 'もし点数が持ち物の【点数】番目とちがえば、']]) {
        const first = write(source); eq(first, written); eq(write(first), first);
        ok(astEquivalent(parseSyntax(source + '\n  何もしない。', ctx).ast, parseSyntax(first + '\n  何もしない。', ctx).ast), source);
      }
    });
    // A sentence and the text written from it are told the same (codes and messages). A word read as a name before a unit
    // (ずんずん10歩) is written without 【 】 as it was read, so the check still says how the word is written; a name of the
    // work, and a name written in 【 】, are written in 【 】. A value of a variable's (点数のよこのばしょ) is told the same with
    // and without 「 」.
    test('a sentence and the text written from it are told the same', () => {
      const told = source => intentCheck(source).compiled.errors.map(e => e.code + ' ' + e.message);
      const p = intentWork(''), symbols = buildSymbols(p), ctx = { targetId: p.components[0].id, event: 'start', symbols };
      const write = source => { const read = parseSyntax(source, ctx); ok(!read.syntaxDiagnostics.length, source); return formatScript(read.ast, { symbols }); };
      for (const [source, written, says] of [['ずんずん10歩進む。', '前へずんずん10歩進む。', '「ずんずん」は あかりの ことばに ありません'], ['空秒待つ。', '空秒待つ。', '「空」は くらべる ことばに ありません'],
        ['持ち物の偶数番目を言う。', '持ち物の偶数番目を言う。', '「偶数」は くらべる ことばに ありません'], ['名前の二文字目を言う。', '名前の二文字目を言う。', '「二」は 漢数字です'],
        ['大きさを空％にする。', '大きさを空％にする。', '「空」は くらべる ことばに ありません'], ['右に空度回る。', '右に空度回る。', '「空」は くらべる ことばに ありません'],
        ['点数たす1回くり返す@  何もしない。', '点数たす1回くり返す。@  何もしない。', 'たし算は「（点数＋1）」のように'], ['なぞ歩進む。', '前へなぞ歩進む。', 'まだ 作っていない 名前「なぞ」'],
        // (a name written in 【 】 keeps them, and is told as a name not made yet; a name of the work gets them)
        ['前へ【ねこ2】歩進む。', '前へ【ねこ2】歩進む。', 'まだ 作っていない 名前「ねこ2」'], ['前へ【空】歩進む。', '前へ【空】歩進む。', 'まだ 作っていない 名前「空」'],
        ['点数歩進む。', '前へ【点数】歩進む。', ''], ['持ち物の点数番目を言う。', '持ち物の【点数】番目を言う。', ''], ['名前の点数文字目を点数秒話す。', '名前の【点数】文字目を【点数】秒話す。', ''],
        // (a value of a variable's or a list's: the same message with and without 「 」, never the one for a 名人 form)
        ['点数のよこのばしょを言う。', '「点数」のよこのばしょを言う。', '「点数」は へんすうの 名前です。中身は「点数」と 名前だけで 書きます'], ['「点数」のよこのばしょを言う。', '「点数」のよこのばしょを言う。', '「点数」は へんすうの 名前です'],
        ['10÷3のあまり－「ねこ」の点数の大きさを言う。', '10÷3のあまり－「ねこ」の（「点数」の大きさ）を言う。', '「点数の大きさ」は 読めません'], ['持ち物の向きを言う。', '「持ち物」の向きを言う。', '「持ち物」は リストの 名前です'],
        ['点数の半分を言う。', '「点数」の半分を言う。', '半分は「（点数÷2）」のように'], ['1秒ごとに、点数を1ふやす。', null, '名人の本文で だけ 使えます']].map(row => row.map(x => x && x.replace('@', '\n')))) {
        const first = told(source); ok(says ? first.length === 1 && first[0].includes(says) : !first.length, source + ' ' + first.join(' | '));
        if (written === null) continue;
        const text = write(source); eq(text, written); eq(write(text), text); eq(told(text), first);
        ok(astEquivalent(parseSyntax(source, ctx).ast, parseSyntax(text, ctx).ast), source);
      }
    });
    // The count of a count condition is written as before the other units: a name in 【 】, a calculation in （ ）.
    test('the count of a count condition is written as before the other units', () => {
      const p = intentWork(''), symbols = buildSymbols(p), ctx = { targetId: p.components[0].id, event: 'start', symbols };
      const write = source => { const read = parseSyntax(source, ctx); ok(!read.syntaxDiagnostics.length, source); return formatScript(read.ast, { symbols }); };
      for (const [source, written] of [['自分が点数回おされるまで待つ。', '自分が【点数】回おされるまで待つ。'], ['自分が（点数）回押されるまで待つ。', '自分が【点数】回おされるまで待つ。'],
        ['自分が（点数＋1）回おされるまで待つ。', '自分が（点数＋1）回おされるまで待つ。'], ['自分が点数＋1回クリックされるまで待つ。', '自分が（点数＋1）回おされるまで待つ。'],
        ['自分が点数×2回【ジャンプ】するまで待つ。', '自分が（点数×2）回【ジャンプ】するまで待つ。'], ['自分が点数回【ジャンプ】するまで、くり返す。@  何もしない。', '自分が【点数】回【ジャンプ】するまで、くり返す。@  何もしない。'],
        ['自分が3回おされるまで待つ。', '自分が3回おされるまで待つ。'], ['自分が1から3のどれか回おされるまで待つ。', '自分が1から3のどれか回おされるまで待つ。'],
        ['自分が空回おされるまで待つ。', '自分が空回おされるまで待つ。']].map(row => row.map(x => x.replace('@', '\n')))) {
        const text = write(source); eq(text.trim(), written); eq(write(text), text);
        ok(astEquivalent(parseSyntax(source, ctx).ast, parseSyntax(text, ctx).ast), source);
      }
    });
    // 新しいはいけいの名前 at the head of a sentence that puts it into a variable: its は is not a subject's, so the sentence reads as
    // the one written the other way round, and the text written from it reads back the same.
    test('the new backdrop name put into a variable reads back the same', () => {
      const p = intentWork(''); p.scripts[0].event = 'backdropChanged';
      const symbols = buildSymbols(p), ctx = { targetId: p.components[0].id, event: 'backdropChanged', symbols };
      const shape = (source) => { const r = parseSyntax(source, ctx); eq(r.syntaxDiagnostics.map(d => d.code), []); return r.ast; };
      for (const [source, same] of [['新しいはいけいの名前を名前に入れる。', '名前を新しいはいけいの名前にする。'], ['新しいはいけいの名前を点数に入れる。', '点数に新しいはいけいの名前を入れる。'],
        ['新しいはいけいの名前の1文字目を名前に入れる。', '名前を新しいはいけいの名前の1文字目にする。'], ['新しいはいけいの名前＋「あ」を名前に入れる。', '名前を新しいはいけいの名前＋「あ」にする。']]) {
        const first = shape(source), text = formatScript(first, { symbols });
        ok(astEquivalent(first, shape(same)), source); ok(astEquivalent(first, shape(text)), text);
        eq(first.body[0].actorRef, { kind: 'self' });
      }
      eq(formatScript(shape('名前を新しいはいけいの名前にする。'), { symbols }).trim(), '新しいはいけいの名前を名前に入れる。');
      p.scripts[0].source = '新しいはいけいの名前を名前に入れる。'; eq(compileProject(p).errors.map(d => d.code), []);
      // (a subject before the word, and a subject with 、 after its は, are read as subjects as before)
      eq(shape('星は新しいはいけいの名前を名前に入れる。').body[0].actorRef, { kind: 'named', name: '星' });
      eq(shape('新しいは、いけいの名前を名前に入れる。').body[0].actorRef, { kind: 'named', name: '新しい' });
      eq(shape('新しいは10歩進む。').body[0].actorRef, { kind: 'named', name: '新しい' });
      eq(shape('ねこは答えを点数に入れる。').body[0].actorRef, { kind: 'named', name: 'ねこ' });
    });
    test('a part 新しい before いけいの名前 of a part いけい that has that name stays the subject', () => {
      // 新しいはいけいの名前を名前に入れる: with the parts 新しい and いけい and いけい's variable 名前 (in 名人: the part いけい) the
      // sentence reads 新しい as its subject, as before; without them it reads the state.
      for (const meijin of [false, true]) {
        const p = intentWork('');
        p.components[0].name = '新しい'; p.components[1].name = 'いけい';
        p.components[1].localData = { variables: [{ id: 'own-name', name: '名前', initialValue: 'い' }], lists: [] };
        const symbols = buildSymbols(p), ctx = { targetId: meijin ? 'meijin' : p.components[2].id, event: 'start', symbols, ...(meijin ? { meijin: true } : {}) };
        const first = parseSyntax('新しいはいけいの名前を名前に入れる。', ctx);
        eq([meijin, first.syntaxDiagnostics.map(d => d.code), first.ast.body[0].actorRef], [meijin, [], { kind: 'named', name: '新しい' }]);
        p.scripts = [{ id: 'intent-body', targetId: meijin ? 'meijin' : p.components[2].id, ...(meijin ? { mode: 'meijin' } : {}), event: 'start', source: '新しいはいけいの名前を名前に入れる。' }];
        eq([meijin, compileProject(p).errors.map(d => d.code)], [meijin, []]);
        if (meijin) continue;
        const text = formatScript(first.ast, { symbols }), again = parseSyntax(text, ctx);
        ok(!again.syntaxDiagnostics.length && astEquivalent(first.ast, again.ast), text);
        // (the state put into 名前 in this work is written with にする, which reads the state)
        const state = parseSyntax('名前を新しいはいけいの名前にする。', ctx), written = formatScript(state.ast, { symbols });
        eq(written.trim(), '名前を新しいはいけいの名前にする。'); ok(astEquivalent(state.ast, parseSyntax(written, ctx).ast), written);
      }
      const p = intentWork(''); p.components[0].name = '新しい'; p.components[1].name = 'いけい';
      const symbols = buildSymbols(p), ctx = { targetId: p.components[2].id, event: 'backdropChanged', symbols };
      eq(parseSyntax('新しいはいけいの名前を名前に入れる。', ctx).ast.body[0].actorRef, { kind: 'self' });
    });
    // After a 「 」 that goes on over lines, a place is counted on the physical line it is on: a mistake and a clause.
    test('places after a quote over lines are on their own line', () => {
      const p = intentWork(''), symbols = buildSymbols(p), ctx = { targetId: 'stage', event: 'start', symbols };
      p.projectData.variables.push({ id: 'intent-score', name: '点数', initialValue: 0 });
      const wrong = parseSyntax('「a\nb」と言う。点数を（1＋）にする。', { ...ctx, symbols: buildSymbols(p) }).syntaxDiagnostics[0];
      const said = parseSyntax('「a\nb」と言って、10歩進む。', { ...ctx, symbols: buildSymbols(p) }).ast.body[0].sourceSpan;
      const after = parseSyntax('「b\nc」と言って、前へ（1＋）歩進む。\n「x」と言う。', { ...ctx, symbols: buildSymbols(p) }).syntaxDiagnostics[0];
      eq([wrong?.line, wrong?.column, said.startLine, said.endLine, said.endColumn, after?.line, after?.column], [2, 12, 1, 2, 7, 2, 12]);
    });
    // A heading whose name in 「 」 goes on over lines keeps the sentences after it on its line as its body.
    test('sentences after a heading with a quote over lines are its body', () => {
      const wrong = intentCheck('「\n星」にふれたとき、すがたをかくす。すがたを見せる。点数を1ふやす。').compiled.errors[0];
      const p = intentWork(''), symbols = buildSymbols(p), ctx = { targetId: p.components[0].id, event: 'start', symbols };
      const read = parseSyntax('「星」にふれたとき、すがたをかくす。すがたを見せる。', ctx);
      eq([wrong?.code, wrong?.line, /^「\n星」という /.test(wrong?.message || ''), read.syntaxDiagnostics.length, read.ast?.body.length], ['S301', 1, true, 0, 2]);
      // (a line written left of that body is told with the whole heading)
      const left = parseSyntax('「\n星」にふれたとき、すがたをかくす。\nすがたを見せる。', ctx).syntaxDiagnostics[0];
      eq([left?.code, left?.line, (left?.message || '').split('」の 中の 文は')[0]], ['P209', 3, '「「\n星」にふれたとき、']);
    });
    // A sentence not read is named whole at the line it starts on, also when a 「 」 in it goes on over lines.
    test('a sentence not read with a quote over lines is placed where it starts', () => {
      const p = intentWork(''), symbols = buildSymbols(p), ctx = { targetId: p.components[0].id, event: 'start', symbols };
      const at = source => { const d = parseSyntax(source, ctx).syntaxDiagnostics[0]; return [d?.code, d?.line, d?.column]; };
      eq([at('「あ\nい」と言って、ぬぬを言うう。'), at('1歩進む。\n「あ\nい」と言って、ぬぬを言うう。'), at('「あ\nい」と言う。ぬぬを言うう。')], [['P201', 1, 1], ['P201', 2, 1], ['P201', 2, 1]]);
    });
    // The examples of a body not moved right keep their lines; a body moved right on the next line reads.
    test('a body not moved right is told with an example on its own lines', () => {
      const p = intentWork(''), symbols = buildSymbols(p), ctx = { targetId: p.components[0].id, event: 'start', symbols };
      const said = source => parseSyntax(source, ctx).syntaxDiagnostics[0]?.message || '';
      eq([said('3回くり返す。\n1歩進む。').endsWith('\nれい：3回くり返す。\n  1歩進む。'), said('3回くり返す。  1歩進む。').endsWith('\nれい：3回くり返す。\n  1歩進む。'),
        said('3回くり返す。').endsWith('\nれい：2回くり返す。\n  「やあ」と言う。'), said('点数が持ち物の点数番目と同じあいだ、くり返す。\n  1歩進む。')], [true, true, true, '']);
    });
    // The sentence a near notice shows is written as the fix writes it, on its own lines.
    test('the sentence shown in a near notice keeps its lines', () => {
      const p = intentWork(''), symbols = buildSymbols(p), ctx = { targetId: p.components[0].id, event: 'start', symbols };
      const said = source => { const d = parseSyntax(source, ctx).syntaxDiagnostics[0]; return [d?.message, d?.proposals?.[0]?.source]; };
      eq([said('右に90ど回って、1秒待つ。'), said('もし「星」にふれていれば「いたい」と言う。'), said('右に90ど回る。')[0]],
        [['角度は「90度」のように「度」と 書きます。れい：右に90度回る。\n1秒待つ', '右に90度回る。\n1秒待つ'],
          ['「もし…れば」「もし…なら」の あとには「、」を 書きます。れい：もし「星」にふれていれば、\n  「いたい」と言う', 'もし「星」にふれていれば、\n  「いたい」と言う'],
          '角度は「90度」のように「度」と 書きます。れい：右に90度回る']);
    });
    // A part's name in 【 】 is the same subject as the name: after the condition of a wait, and as one of two subjects.
    test('a part name in brackets is the subject of a late wait and one of two subjects', () => {
      const p = intentWork(''), symbols = buildSymbols(p), ctx = { targetId: p.components[0].id, event: 'start', symbols };
      const read = source => parseSyntax(source, ctx), first = source => { const d = read(source).syntaxDiagnostics[0]; return [d?.code, d?.message, d?.proposals?.map(f => f.source)]; };
      const late = read('ロケットが【ねこ】にふれるまで、【ねこ】は待つ。'), plain = read('ロケットがねこにふれるまで、ねこは待つ。');
      eq([late.syntaxDiagnostics.length, plain.syntaxDiagnostics.length, late.ast && plain.ast && astEquivalent(late.ast, plain.ast), read('ロケットがねこにふれるまで、【ロボ】は待つ。').syntaxDiagnostics[0]?.code], [0, 0, true, 'P201']);
      eq([first('星と【ねこ】は「あ」と言う。'), first('【星】と【ねこ】は1秒待つ。')[0]], [first('星とねこは「あ」と言う。'), 'P205']);
      eq(compileProject(intentWork('星と【ねこ】は「あ」と言う。', true)).errors.length, 0);
      // (だけ the same: 【ねこ】だけ is ねこだけ; a wait with it is told the same way)
      const only = read('【ねこ】だけ「あ」と言う。'), bare = read('ねこだけ「あ」と言う。');
      eq([only.syntaxDiagnostics.length, only.ast && bare.ast && astEquivalent(only.ast, bare.ast), first('【ねこ】だけ1秒待つ。')[0], read('【ロボ】だけ「あ」と言う。').syntaxDiagnostics[0]?.code], [0, true, 'P205', 'P201']);
    });
    // Another part's list written without （ ） is told how to write it, also in a sentence that says it.
    test('a list of another part written without parentheses is told the way to write it', () => {
      const p = intentWork(''); p.components[1].localData.lists.push({ id: 'intent-bag', name: 'かばん', initialValue: ['a'] });
      const ctx = { targetId: p.components[0].id, event: 'start', symbols: buildSymbols(p) }, told = source => parseSyntax(source, ctx).syntaxDiagnostics.map(d => [d.code, d.message]);
      const way = [['P205', '「星」の リストの 中身は、（ ）で かこんで 書きます。れい：「星」の（かばんの1番目）']];
      eq([told('星のかばんの1番目を言う。'), told('「星」のかばんの1番目を言う。'), told('点数を星のかばんの1番目にする。'), told('「星」の（かばんの1番目）を言う。')], [way, way, way, []]);
    });
    // Text handed over in （ ） keeps a 、 written inside 『 』 or inside 「 」 with \「 \」 in it.
    test('handed text with a comma or escaped marks reads', () => {
      const p = intentWork(''); p.actions = [{ id: 'hand-a', ownerId: 'stage', name: 'あいさつ', args: ['ことば', 'かず'], source: '何もしない。' }];
      const symbols = buildSymbols(p), ctx = { targetId: 'stage', event: 'start', symbols };
      for (const source of ['【あいさつ】（『こんにちは、ねこ』、1）を実行する。', '【あいさつ】（「\\「やあ\\」、ねこ」、1）を実行する。']) {
        const read = parseSyntax(source, ctx), written = read.ast && formatScript(read.ast, { symbols }), again = written && parseSyntax(written, ctx);
        ok(read.syntaxDiagnostics.length === 0 && again?.syntaxDiagnostics.length === 0 && astEquivalent(read.ast, again.ast), source + ' => ' + written);
      }
    });
    // A mistake after 〜し、 / 〜り、 (read as 〜して、) is told as it is, at its place, as after 〜て、.
    test('a mistake after a clause read again is told at its place', () => {
      const p = intentWork(''), ctx = { targetId: 'stage', event: 'start', symbols: buildSymbols(p) };
      const d = parseSyntax('右へ15度回り、点数を（1＋）にする。', ctx).syntaxDiagnostics[0];
      eq([d?.code, d?.line, d?.column, /読めない ところが あります/.test(d?.message || '')], ['P205', 1, 14, true]);
    });
    // A name written in 【 】 that ends in a number is told as a name not made yet, not as a misread word.
    test('a bracketed name ending in a number is told as not made yet', () => {
      for (const source of ['【ステージ2】を言う。', '前へ【ねこ2】歩進む。']) {
        const e = intentCheck(source).compiled.errors.find(x => x.code === 'S301');
        ok(e && /まだ 作っていない/.test(e.message) && !/あかりの ことばに ありません/.test(e.message), source + ': ' + e?.message);
      }
    });
    // A list's length named with whose list it is (自分の…, 作品の…) is written back 〜の長さ, which reads.
    test('the length of a list named with whose it is reads back', () => {
      const p = intentWork(''); p.components[0].localData.lists.push({ id: 'intent-own-list', name: '宝物', initialValue: [] });
      const symbols = buildSymbols(p), ctx = { targetId: p.components[0].id, event: 'start', symbols };
      for (const source of ['自分の宝物の長さを言う。', 'もし作品の持ち物の長さが0なら、\n  「あ」と言う。']) {
        const read = parseSyntax(source, ctx), written = formatScript(read.ast, { symbols }), again = parseSyntax(written, ctx);
        ok(read.syntaxDiagnostics.length === 0 && again.syntaxDiagnostics.length === 0 && astEquivalent(read.ast, again.ast), written);
      }
    });
    // 答えを〜という変数に入れる with a name the work does not have yet is written back that way, and reads back.
    test('the answer put into a variable not made yet reads back', () => {
      const p = intentWork(''); p.projectData.lists.push({ id: 'intent-names', name: '名前一覧', initialValue: [] });
      const symbols = buildSymbols(p), ctx = { targetId: 'stage', event: 'start', symbols };
      // (and with whose it is, and into a list, which takes the answer with にする)
      for (const source of ['答えをひみつという変数に入れる。', '答えを自分の【新しい】という変数に入れる。', '持ち物を答えにする。']) {
        const read = parseSyntax(source, ctx), written = formatScript(read.ast, { symbols }), again = parseSyntax(written, ctx);
        ok(read.syntaxDiagnostics.length === 0 && again.syntaxDiagnostics.length === 0 && astEquivalent(read.ast, again.ast), source + ' => ' + written);
      }
    });
    // A name with あかりの ことば in it (ことば) is told to be written in 【 】, not taken for a list's 〜に入れる.
    test('a variable name with a word of akari is told to be bracketed', () => {
      const p = intentWork(''), ctx = { targetId: 'stage', event: 'start', symbols: buildSymbols(p) };
      const d = parseSyntax('答えをことばという変数に入れる。', ctx).syntaxDiagnostics[0];
      ok(d?.code === 'P205' && /【 】で かこんで/.test(d.message), d?.message); eq(parseSyntax('答えを【ことば】という変数に入れる。', ctx).syntaxDiagnostics.length, 0);
    });
    // The note of a 今見ているものを【今見ているもの】とよぶ line stays when the body is written again.
    test('a binder line with a note keeps its note', () => {
      const p = intentWork(''), symbols = buildSymbols(p), ctx = { targetId: 'stage', event: 'start', symbols };
      const read = parseSyntax('［1、2］の中身を先頭から一つずつ見て、次のことを行う。\n  この中では、今見ているものを【今見ているもの】とよぶ。  ※よび名\n  10歩進む。', ctx);
      const written = formatScript(read.ast, { symbols });
      ok(written.includes('※よび名') && astEquivalent(read.ast, parseSyntax(written, ctx).ast), written);
    });
    // A mistake in the name of 今見ているもの is told on its line.
    test('a wrong binder name is told on its line', () => {
      const p = intentWork(''), ctx = { targetId: 'stage', event: 'start', symbols: buildSymbols(p) };
      const d = parseSyntax('10歩進む。\n［1、2］の中身を先頭から一つずつ見て、次のことを行う。\n  この中では、今見ているものを【】とよぶ。\n  10歩進む。', ctx).syntaxDiagnostics[0];
      eq(d?.line, 3);
    });
    // Clauses joined by 〜し、 / 〜み、 (read as 〜して、) each keep their own place, and 〜て、 keeps its ending.
    test('clauses read again keep their own places', () => {
      const p = intentWork(''), ctx = { targetId: 'stage', event: 'start', symbols: buildSymbols(p) }, span = n => [n.sourceSpan.startColumn, n.sourceSpan.endColumn];
      eq(parseSyntax('10歩進み、右に90度回り、1秒待つ。', ctx).ast.body.map(span), [[1, 6], [7, 14], [15, 19]]);
      eq(parseSyntax('10歩すすんで、1秒まつ。', ctx).ast.body.map(span), [[1, 8], [9, 13]]);
    });
    // 〜ではなく、〜ではないなら reads as two checks that are both not (LANGUAGE: either way of writing the first reads).
    test('two not-checks joined by ではなく read', () => {
      const p = intentWork(''), symbols = buildSymbols(p), ctx = { targetId: 'stage', event: 'start', symbols };
      p.projectData.variables.push({ id: 'intent-score', name: '点数', initialValue: 0 });
      const read = parseSyntax('もし点数が5ではなく、点数が6ではないなら、\n  「あ」と言う。', { ...ctx, symbols: buildSymbols(p) }), c = read.ast?.body?.[0]?.condition;
      eq([read.syntaxDiagnostics.length, c?.op, c?.left?.op, c?.right?.op, c?.right?.value?.right?.value], [0, 'AND', 'NOT', 'NOT', 6]);
    });
    // おされたキー after a part's は is a value of the sentence, not a heading written with は.
    test('a pressed key after a subject reads as a value', () => {
      for (const source of ['ねこは、おされたキーを言う。', '自分はおされたキーを言う。', 'ねこは、おされたキーが「a」になるまで待つ。'])
        ok(!intentCheck(source).compiled.errors.some(e => e.code === 'P205'), source);
    });
    test('ambiguous bare compound answers are not silently quoted as one word', () => {
      const result = intentCheck('もし答えがりんごかみかんなら、\n  「あ」と言う。').compiled;
      ok(result.errors.length); ok(!result.errors[0].proposals?.some(p => p.source.includes('「りんごかみかん」')));
      for (const head of ['もし答えが「りんごかみかん」なら、', 'もし答えが「りんご」と同じか、答えが「みかん」と同じなら、']) eq(intentCheck(head + '\n  「あ」と言う。').compiled.errors, []);
    });
    // 点数以上 after a value is an ordering word, not the end of a word to quote. In kana (相手いじょう) it is 以上 after a
    // name of the work, while すいか, 以上 alone and the kana after a part's name stay words to quote.
    test('an ordering word after a compared value is not taken into a quoted word', () => {
      const body = '\n  「あ」と言う。', first = source => intentCheck(source).compiled.errors[0];
      for (const source of ['もし答えが点数以上なら、' + body, 'もし答えが点数未満でなければ、' + body, 'もし名前が点数より多いなら、' + body, '答えが点数以上になるまで待つ。',
        'もし答えが点数いじょうなら、' + body, 'もし点数が相手いじょうなら、' + body, 'もし点数が相手みまんだったら、' + body, 'もし点数が10いかだったら、' + body])
        eq(intentCheck(source).compiled.errors, [], source);
      for (const [word, head] of [['すいか', 'もし答えがすいかなら、'], ['以上', 'もし答えが以上なら、'], ['ねこいじょう', 'もし答えがねこいじょうなら、']])
        ok(first(head + body)?.proposals?.some(p => p.source.includes('「' + word + '」')), head);
      ok(first('もし答えが点数を超えるなら、' + body)?.message.startsWith('「こえる」は「より大きい」と 書きます'), 'を超える');
    });
    // A bare word before a negation is the word to quote (りんごではない is not a name to make), and じゃない is offered
    // as でない; after a name of the work, 〜じゃないなら is not a name to make either.
    test('a bare word before a negation is offered in quotes', () => {
      const body = '\n  「あ」と言う。';
      for (const [head, fixed] of [['もし答えがりんごではないなら、', 'もし答えが「りんご」'], ['もし答えがりんごでなかったら、', 'もし答えが「りんご」'],
        ['もし答えがりんごじゃないなら、', 'もし答えが「りんご」'], ['もし答えがりんごじゃなかったら、', 'もし答えが「りんご」'], ['もし答えがりんごとおなじなら、', 'もし答えが「りんご」'],
        ['もし答えがりんごとちがえば、', 'もし答えが「りんご」']]) {
        const proposal = intentCheck(head + body).compiled.errors[0]?.proposals?.[0];
        ok(proposal?.source.startsWith(fixed) && !proposal.source.includes('じゃ'), head + ' ' + proposal?.source);
        eq(intentCheck(applyIntentFix(head + body, proposal)).compiled.errors, [], head);
      }
      for (const head of ['もし答えが点数じゃないなら、', 'もし点数が相手じゃないなら、']) eq(intentCheck(head + body).compiled.errors.map(e => e.code), ['P205'], head);
    });
    // 未満 and the kana ordering words are comparing words before になったら and before a left-out なら, as 以上 is.
    test('miman and the kana ordering words are told as comparing words', () => {
      const told = source => intentCheck(source).compiled.errors[0]?.message || '';
      for (const source of ['点数が10未満になったら、「あ」と言う。', '点数が10みまんになったら、「あ」と言う。', 'もし点数が10未満になったら、\n  「あ」と言う。',
        'もし点数が相手みまんになったら、\n  「あ」と言う。']) ok(told(source).includes('より小さければ、'), source + ' ' + told(source));
      for (const head of ['もし点数が10未満、', 'もし点数が10より多い、', 'もし点数が10みまん、'])
        ok(told(head + '\n  「あ」と言う。').startsWith('「もし」の きまりの おわりには「なら、」を 書きます'), head);
    });
    test('touch choices keep the following else associated with its if', () => {
      const source = 'もし「星」にふれたら、\n  「あ」と言う。\nそうでなければ、\n  「い」と言う。', first = intentCheck(source).compiled.errors[0];
      ok(first.proposals?.length); for (const p of first.proposals) { ok(p.source.startsWith('もし')); eq(intentCheck(applyIntentFix(source, p)).compiled.errors, []); }
    });
    test('touch partner diagnostics preserve mutable values and never suggest making data', () => {
      eq(intentCheck('相手を「星」にする。\nもし相手にふれていれば、\n  「あ」と言う。').compiled.errors, []);
      for (const partner of ['画面', '画面のまん中', '見つからない相手']) { const c = intentCheck('もし' + partner + 'にふれていれば、\n  「あ」と言う。').compiled; ok(c.errors.length); ok(!c.errors.some(e => /へんすうか リストを 作/.test(e.message))); }
      ok(intentCheck('もし画面のまん中にふれていれば、\n  「あ」と言う。').compiled.errors[0].message.includes('ばしょ'));
    });
    test('flow notices account for procedure effects and possible branch shows', () => {
      const shown = intentCheck('すがたをかくす。\n【見せる】というてじゅんを行う。\n「やあ」と言う。', false, p => p.actions = [{ id: 'intent-show', ownerId: 'stage', name: '見せる', args: [], source: 'すがたを見せる。' }]).compiled;
      eq(shown.errors, []); ok(!shown.notes.some(n => n.code === 'I133'));
      const moving = intentCheck('「星」にふれるまで待つ。\n前へ10歩進む。', false, p => { p.actions = [{ id: 'intent-move', ownerId: 'stage', name: '動く', args: [], source: '前へ10歩進む。' }]; p.scripts.push({ id: 'intent-key', targetId: p.components[0].id, event: 'keyDown', filter: { key: '空白' }, source: '【動く】というてじゅんを行う。' }); }).compiled;
      eq(moving.errors, []); ok(!moving.notes.some(n => n.code === 'I134'));
      ok(!intentCheck('すがたをかくす。\nもし点数が1なら、\n  すがたを見せる。\n「やあ」と言う。').compiled.notes.some(n => n.code === 'I133'));
    });
    // A wait for the mouse to be pressed inside a press body is told with the sentence read, and in a named part's body with the part that touches the mouse.
    test('a mouse press asked inside a press body is told with the sentence and the part that touches the mouse', () => {
      const told = (source, meijin) => intentCheck(source, meijin, p => { if (!meijin) p.scripts[0].event = 'click'; }).compiled.notes.filter(n => n.code === 'I126').map(n => n.message);
      const tail = pressed => '。おして いる あいだ 動かす ときは、「作品を動かしたとき、」の 中で「ずっとくり返す。」と「もしマウスがおされていて、' + pressed + '「マウス」にふれていれば、」を 使います';
      const head = '「おされた とき」は マウスを はなしてから 始まるので、「もしマウスがおされていれば」は もう あてはまりません';
      eq(told('もしマウスがおされていれば、\n  「あ」と言う。', false), [head + tail('')]);
      eq(told('ねこがおされたとき、\n  もしマウスがおされていれば、\n    ねこは「あ」と言う。', true), [head + tail('ねこが')]);
    });
    test('notice and refusal guidance names the actual context', () => {
      const timer = intentCheck('ずっとくり返す\n  もしタイマーが5なら、\n    「あ」と言う。').compiled.notes.find(n => n.code === 'I124'); ok(timer.message.includes('くり返しの 前'));
      const first = intentCheck('もし「スペース」キーがおされてれば、\n  「あ」と言う。').compiled.errors[0]; ok(first.proposals?.length); eq(intentCheck(applyIntentFix('もし「スペース」キーがおされてれば、\n  「あ」と言う。', first.proposals[0])).compiled.errors, []);
      const heading = intentCheck('作品を動かしたとき、前へ10歩進む。\n1秒待つ。').compiled.errors[0].message; ok(heading.includes('「作品を動かしたとき、」')); ok(!heading.includes('「作品を動かしたとき、前へ'));
      const otherwise = intentCheck('作品を動かしたとき、\n  「あ」と言う。\n    そうでなければ、\n      「い」と言う。').compiled.errors[0].message; ok(otherwise.includes('ありません'));
      ok(intentCheck('10こ作る。').compiled.errors[0].message.includes('「10こ作る」'));
      ok(!intentCheck('音を鳴らす。').compiled.errors[0].message.includes('ニャー'));
      ok(intentCheck('点数のところへ行く。').compiled.errors[0].message.includes('「星」'));
      const source = 'もし点数が10をこえたら、「あ」と言う。', d = intentCheck(source).compiled.errors[0]; ok(d.message.includes(d.proposals[0].source.split('\n')[0]));
      eq(intentCheck('1秒ごとに、点数を1ふやす。').compiled.errors[0].code, 'S317');
      ok(intentCheck('このキャラクターがおされたとき、\n  「あ」と言う。').compiled.errors[0].proposals?.length);
      ok(intentCheck('「持ち物は」と持ち物をつなげて言う。').compiled.errors.some(e => e.code === 'S304'));
    });
    test('function statement hints compile without changing project data or untyped arguments', () => {
      const controls = ['IfStatement', 'RepeatCount', 'RepeatWhile'];
      for (const args of [[], ['あいさつ']]) { const p = intentWork(''), hints = hintCandidates(p, 'stage', { definitionKind: 'function', args, source: '' }).filter(h => h.enabled && h.mode === 'statement');
        for (const h of hints) { p.functions = [{ id: 'intent-function', ownerId: 'stage', name: '試す', args, source: h.text + (/を答えとして返す/.test(h.text) ? '' : '\n0を答えとして返す。') }]; eq(compileProject(p).errors, []); ok(!/あいさつが10|点数を1ふやす|点数を10にする/.test(h.text)); }
      }
      for (const [source, args, values, kept] of [
        ['', [], [], null], ['', ['あいさつ'], ['こんにちは'], 'あいさつ'], ['', ['あいさつ'], [['本']], 'あいさつ'],
        ['', ['数えた回数'], ['こんにちは'], '数えた回数'],
        ['この中だけで使う変数あいさつを作り、最初は「こんにちは」にする。\n', [], [], 'あいさつ'],
        ['この中だけで使う変数数えた回数を作り、最初は「こんにちは」にする。\n', [], [], '数えた回数'],
        ['この中だけで使うリスト数えた回数を空で作る。\n', [], [], '数えた回数'],
      ]) {
        const p = intentWork(''), hints = hintCandidates(p, 'stage', { definitionKind: 'function', args, source }).filter(h => controls.includes(h.id));
        eq(hints.length, 3); ok(hints.every(h => h.enabled));
        for (const h of hints) {
          const declaration = /^この中だけで使う変数(.+?)を作り、最初は(\d+)にする。\n/.exec(h.text); ok(declaration, h.text);
          const counter = declaration[1]; ok(!args.includes(counter)); ok(!source.includes('変数' + counter + 'を')); ok(!source.includes('リスト' + counter + 'を'));
          eq(Number(declaration[2]), h.id === 'IfStatement' ? 11 : 0);
          const run = returned => { p.functions = [{ id: 'intent-function', ownerId: 'stage', name: '試す', args, source: source + h.text + '\n' + returned + 'を答えとして返す。' }]; const compiled = compileProject(p); eq(compiled.errors, []); return runUserFunction('試す', values, { runtime: new RuntimeModel(p), runtimeId: p.components[0].id, compiled }); };
          eq(run(counter), h.id === 'RepeatCount' ? 3 : 10);
          if (kept) eq(run(kept), args.includes(kept) ? values[args.indexOf(kept)] : source.includes('リスト' + kept) ? [] : 'こんにちは');
          eq(p.projectData.variables.find(v => v.name === '点数').initialValue, 0);
        }
      }
      for (const source of [
        '何もしない。\n', 'もし1が1なら、\n  ',
        'この中だけで使う変数あいさつを作り、最初は「こんにちは」にする。\n何もしない。\n',
        'この中だけで使う変数回数を作り、最初は0にする。\n回数を1にする。\n',
      ]) {
        const hints = hintCandidates(intentWork(''), 'stage', { definitionKind: 'function', args: ['あいさつ'], source }).filter(h => controls.includes(h.id));
        eq(hints.length, 3); ok(hints.every(h => !h.enabled && h.reason.includes('はじめ')));
      }
      for (const source of ['\nこの中だけで使う変数数えた回数を作り、最初は「こんにちは」にする。\n数えた回数を答えとして返す。', '\nこの中だけで使うリスト数えた回数を空で作る。\n数えた回数を答えとして返す。']) {
        const hints = hintCandidates(intentWork(''), 'stage', { definitionKind: 'function', args: [], source, start: 0, end: 0 }).filter(h => controls.includes(h.id));
        eq(hints.length, 3); ok(hints.every(h => !h.enabled && h.reason.includes('行の あと')));
      }
    });
    test('procedure examples use explicit string comparisons while unknown arguments keep the numeric default', () => {
      const p = intentWork(''), definition = { id: 'intent-direction', ownerId: 'stage', name: '進む', args: ['進む方向', '歩数'], source: 'もし進む方向が「右」なら、\n  前へ10歩進む。' }; p.actions = [definition];
      ok(hintCandidates(p, p.components[0].id).some(h => h.binding?.id === definition.id && h.text.includes('進む方向を「右」') && h.text.includes('歩数を1')));
    });
    test('body identity includes its key and signal on every runtime label', () => {
      const p = intentWork('何もしない。');
      for (const [event, filter, expected] of [['keyDown', { key: '空白' }, '「スペース」キーを おしたとき'], ['message', { message: '出発' }, '「出発」という 合図を 受けたとき'], ['touchStart', { target: '星' }, '「星」に ふれたとき']]) {
        Object.assign(p.scripts[0], { event, filter }); const compiled = compileProject(p); eq(compiled.errors, []);
        const scheduler = new EventScheduler(p, compiled, new RuntimeModel(p)); eq(scheduler.flowName({ scriptId: p.scripts[0].id, eventType: event, targetId: p.components[0].id }), 'ねこ / ' + expected);
      }
      for (const [event, filter] of [['keyDown', 'スペース'], ['message', '出発']]) { Object.assign(p.scripts[0], { event, filter }); let rejected = false; try { validateDesignProject(p); } catch (e) { rejected = e.code === 'F503'; } ok(rejected, 'String filters are rejected by the existing project format'); ok(compileProject(p).errors.some(e => e.code === 'F503')); }
    });
    test('turned opaque picture cells do not fall between sample points', () => {
      const p = intentWork(''), r = new RuntimeModel(p), a = r.actor(p.components[0].id), b = r.actor(p.components[1].id), cells = new Uint8Array(4096), counts = new Uint32Array(4225); cells[31 * 64 + 31] = 1;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) counts[(y + 1) * 65 + x + 1] = cells[y * 64 + x] + counts[y * 65 + x + 1] + counts[(y + 1) * 65 + x] - counts[y * 65 + x];
      r.pictureMask = () => ({ w: 64, h: 64, cells, counts, seen: { left: 31, right: 32, top: 31, bottom: 32 } });
      Object.assign(a, { x: 200, y: 200, w: 640, h: 640, direction: 30, scalePercent: 100 }); Object.assign(b, { x: 180, y: 205, w: 640, h: 640, direction: 150, scalePercent: 100 });
      // The two opaque 10×10 cells overlap at a turned corner; the independently derived polygon fixture is positive.
      eq(r.partsTouch(a, b), true);
      Object.assign(a, { direction: 0 }); Object.assign(b, { x: 210, y: 200, direction: 0 }); r.touchCache.clear(); eq(r.partsTouch(a, b), false);
      b.x = 211; r.touchCache.clear(); eq(r.partsTouch(a, b), false);
      r.mouseX = 195; r.mouseY = 205; r.mouseAt.entered = false; eq(r.touching(a.runtimeId, 'マウス'), false); r.mouseAt.entered = true; eq(r.touching(a.runtimeId, 'マウス'), true); r.mouseX = 205; eq(r.touching(a.runtimeId, 'マウス'), false);
    });
    test('positive opaque overlap has no fixed spatial dead band', () => {
      const p=intentWork(''),r=new RuntimeModel(p),a=r.actor(p.components[0].id),b=r.actor(p.components[1].id);
      r.pictureMask=()=>({w:1,h:1,cells:new Uint8Array([1]),counts:new Uint32Array([0,0,0,1]),seen:{left:0,right:1,top:0,bottom:1}});
      Object.assign(a,{x:100,y:100,w:10,h:10,direction:0,scalePercent:100});
      Object.assign(b,{y:100,w:10,h:10,direction:0,scalePercent:100});
      for(const overlap of [1e-6,1e-7,1e-10,0,-1e-7]){b.x=110-overlap;r.touchCache.clear();eq(r.partsTouch(a,b),overlap>0);}
    });
    test('screen touch guidance preserves a component named screen', () => {
      const p=intentWork('');p.components[1].name='画面';
      for(const source of ['もし画面にふれていれば、\n  何もしない。','画面にふれるまで待つ。']){
        p.scripts[0].source=source;eq(compileProject(p).errors,[]);
      }
      p.components[1].name='星';p.scripts[0].source='もし画面にふれていれば、\n  何もしない。';ok(compileProject(p).errors.some(e=>e.code==='P205'));
    });
    test('packed asset validation cannot be certified by caller supplied fields', () => {
      const p = makeDefaultProject(), store = makeDefaultAssetStore(), data = packExecutable(p, store), asset = data.assets[0], record = store.get(asset.id);
      ok(AKARI_RUNTIME.restoreExecutable(data, { packed: new Map([[asset.id, { text: asset.dataBase64, record }]]) }));
      for (const [field, value] of [['dataBase64', 'not-valid-base64'], ['sha256', '0'.repeat(64)], ['byteLength', asset.byteLength + 1]]) { const bad = structuredClone(data); bad.assets[0][field] = value;
        let error; try { AKARI_RUNTIME.restoreExecutable(bad, { packed: new Map([[asset.id, { text: bad.assets[0].dataBase64, record: { ...record, sha256: bad.assets[0].sha256, byteLength: bad.assets[0].byteLength } }]]) }); } catch (caught) { error = caught; } eq(error?.code, 'X602');
      }
    });
    test('the kept end of a long record does not begin in the middle of a character', () => {
      const tail = Akari.diagnostics.tailText;
      eq([tail('あい😀うえ', 3), tail('あい😀うえ', 4), tail('あい😀うえ', 2), tail('😀😀', 1), tail('😀', 5), tail('あい', 0)], ['うえ', '😀うえ', 'うえ', '', '😀', '']);
      // (a low half with no high half before it is kept as it is: only a cut through a pair drops the half)
      eq([tail('あ\udc00い', 2), tail('\ud83dあ', 1), tail('😀'.repeat(50000) + 'あ', 90000).length], ['\udc00い', 'あ', 89999]);
    });
    test('a part name in brackets is a subject with ga and mo, and a rename to such a name keeps the sentence', () => {
      const work = (name, source) => { const p = Akari.makeDefaultProject(); p.components[0].name = name; p.scripts = [{ id: 's', targetId: 'stage', event: 'start', source }]; return p; };
      const same = (name, source, as) => { const p = work(name, source), symbols = buildSymbols(p), ctx = { targetId: 'stage', event: 'start' };
        eq(compileProject(p).errors.map(e => e.code), []); ok(astEquivalent(parseScript(source, symbols, ctx), parseScript(as, symbols, ctx)), source); };
      for (const name of ['ぼくのロボット', '犬と人', '2ばんめの星', '左', '1', 'ねこ']) {
        same(name, `【${name}】が「あ」と言う。`, `【${name}】は「あ」と言う。`);
        same(name, `【${name}】も、いまのばしょから、右へ10歩動く。`, `【${name}】は、いまのばしょから、右へ10歩動く。`);
        same(name, `【${name}】が、いまのばしょから、右へ10歩動く。`, `【${name}】は、いまのばしょから、右へ10歩動く。`);
      }
      // (a name in brackets that no part has is still not a subject)
      eq(compileProject(work('ねこ', '【いぬ】が「あ」と言う。')).errors.map(e => e.code), ['P205']);
      const renamed = Akari.prepareResourceRename(work('ねこ', 'ねこが「あ」と言う。\nねこも、いまのばしょから、右へ10歩動く。'), 'component:sprite-1', 'ぼくのロボット', {});
      eq(renamed.scripts[0].source, '【ぼくのロボット】が「あ」と言う。\n【ぼくのロボット】も、いまのばしょから、右へ10歩動く。');
    });
    {
      const savedData = text => { const begin = text.lastIndexOf('```json\n'), end = text.lastIndexOf('\n```\n'); return JSON.parse(text.slice(begin + 8, end)); };
      const failure = fn => { try { fn(); return null; } catch (e) { return [e.code, e.message]; } };
      // A half of a surrogate pair standing alone in a saved work's texts is saved as U+FFFD; a pair stays; the work given is not changed.
      test('a saved work writes a half of a surrogate pair standing alone in its texts as U+FFFD', () => {
        const high = '\ud83d', low = '\udc00', bad = '�', smile = '\u{1f642}';
        const p = makeDefaultProject(), sprite = p.components.find(c => c.type === 'sprite');
        p.name = 'さく' + high;
        p.scripts = [{ id: 'wellformed-start', targetId: 'stage', event: 'start', source: '「こ' + low + 'ど' + smile + '」と言う。' }];
        sprite.costumes[1].value = '●' + high;
        const root = savedData(serializeProject(p, new AssetStore()));
        eq([root.name, root.scripts[0].source, root.components.find(c => c.id === sprite.id).costumes[1].value], ['さく' + bad, '「こ' + bad + 'ど' + smile + '」と言う。', '●' + bad]);
        eq([p.name, p.scripts[0].source, sprite.costumes[1].value], ['さく' + high, '「こ' + low + 'ど' + smile + '」と言う。', '●' + high]);
      });
      // The kept change of a saved editor state: its texts and keys are made well formed, the keys keep their order, and a
      // value that is no plain object is written as it is.
      test('a saved editor state writes its texts and keys well formed in their order', () => {
        const saved = pending => {
          const p = makeDefaultProject();
          p.scripts = [{ id: 'wellformed-s1', targetId: 'sprite-1', event: 'start', source: '10歩動く。' }];
          const state = { version: 1, revision: 1, selectedId: 'sprite-1', currentEvent: 'start', selectedScriptId: 'wellformed-s1', uiLevel: 'advanced', sourceOverviewOpen: false,
            editorModes: { script: 'code', draft: 'code' }, callableDraft: null,
            pendingEditors: [{ kind: 'script', ownerKey: 'script:wellformed-s1', source: '10歩動く\ud800。', mode: 'code', pending, draftTree: null }], views: [] };
          const kept = savedData(serializeProject(p, new AssetStore(), state)).editorState.pendingEditors[0];
          return [kept.source, JSON.stringify(kept.pending)];
        };
        eq(saved({ '\ud800': 'a' }), ['10歩動く�。', '{"�":"a"}']);
        eq(saved({ 'a\udc00': 1, b: 2, c: 'q' }), ['10歩動く�。', '{"a�":1,"b":2,"c":"q"}']);
        eq(saved({ kind: 'x', note: new String('ab'), list: ['\udc00', { z: '\ud800' }] }), ['10歩動く�。', '{"kind":"x","note":"ab","list":["�",{"z":"�"}]}']);
      });
      // A copy that goes is forgotten by the touch watch (each side it touched too) and by the speech marks; the part that
      // stays keeps what the watch knows of it.
      test('a copy that goes leaves no side it touched and no speech mark behind', () => {
        const p = makeDefaultProject(), id = p.components.find(c => c.type === 'sprite').id;
        p.scripts = [{ id: 'gone-make', targetId: id, event: 'start', source: 'いまのばしょから、右へ300歩動く。\nずっとくり返す。\n  自分のコピーを作る。\n  0.05秒待つ。' },
          { id: 'gone-go', targetId: id, event: 'cloneStart', source: '「あ」と言う。\nいまのばしょから、左へ600歩動く。\n0.02秒待つ。\nこのコピーだけを消す。' },
          { id: 'gone-touch', targetId: id, event: 'touchStart', filter: { target: '端' }, source: '何もしない。' }];
        eq(compileProject(p).errors, []);
        const r = new RuntimeModel(p, {}); let now = 0; r.now = () => now;
        const q = new EventScheduler(p, compileProject(p), r, {}); q.schedule = () => {};
        try {
          q.start();
          for (now = 0; now <= 1000; now += 10) { for (let i = 0; i < 500 && q.ready.length; i++) q.runTurn(); q.recheckBlocked(); }
          const w = q.watches[0];
          ok(r.creationSequence >= 10, 'copies made: ' + r.creationSequence);
          eq([[...r.actors.keys()], [...w.started.keys()], [...q.speechTokens.keys()], [...w.last.keys()], [...w.poses.keys()]], [[id], [id + '|端:右'], [], [id], [id]]);
        } finally { q.stop(); }
      });
      // 新しいはいけいの名前 at the head of a sentence is the value, unless a part 新しい and a part いけい with a variable or a
      // list 名前 are in the work: then 新しい is the subject.
      test('the state 新しいはいけいの名前 needs the part 新しい, and a list of いけい counts as its data', () => {
        const work = (names, own) => { const p = makeDefaultProject(), base = p.components.find(c => c.type === 'sprite');
          p.components = names.map((name, i) => ({ ...structuredClone(base), id: 'stateword-part-' + i, name, costumes: [{ id: 'stateword-face-' + i, name: '顔', kind: 'text', value: '●' }],
            costumeId: 'stateword-face-' + i, localData: name === 'いけい' ? own : { variables: [], lists: [] } }));
          p.projectData = { variables: [{ id: 'stateword-score', name: '点数', initialValue: '' }], lists: [] };
          p.scripts = [{ id: 'stateword-body', targetId: p.components[2].id, event: 'backdropChanged', source: '新しいはいけいの名前を点数に入れる。' }];
          return p; };
        const read = p => { const symbols = buildSymbols(p), r = parseSyntax(p.scripts[0].source, { targetId: p.components[2].id, event: 'backdropChanged', symbols });
          return [r.syntaxDiagnostics.map(d => d.code), r.ast.body[0].actorRef, r.ast.body[0].value.kind, compileProject(p).errors.map(e => e.code), formatScript(r.ast, { symbols })]; };
        eq(read(work(['ねこ', 'いけい', 'ロケット'], { variables: [{ id: 'stateword-own', name: '名前', initialValue: 'い' }], lists: [] })),
          [[], { kind: 'self' }, 'SensorRead', [], '新しいはいけいの名前を点数に入れる。']);
        eq(read(work(['新しい', 'いけい', 'ロケット'], { variables: [], lists: [{ id: 'stateword-own', name: '名前', initialValue: ['い'] }] })),
          [[], { kind: 'named', name: '新しい' }, 'ActorQualifiedRead', [], '新しいは点数を「いけい」の名前にする。']);
      });
      // The counts of a work's parts, bodies, sounds and made blocks (actions and functions together) may reach their
      // limits and not pass them.
      test('a work may have as many parts, bodies, sounds and made blocks as the limits and not one more', () => {
        const button = i => { const c = cloneDesignProject(makeRegressionProject().components.find(x => x.type === 'button')); c.id = 'limit-comp-' + i; c.name = '部品' + i; c.localData = { variables: [], lists: [] }; return c; };
        const base = () => { const p = makeRegressionProject(); p.scripts = []; return p; };
        const parts = n => { const p = base(); p.components = Array.from({ length: n }, (_, i) => button(i)); return p; };
        const bodies = n => { const p = base(); p.components = Array.from({ length: 201 }, (_, i) => button(i));
          p.scripts = p.components.flatMap(c => EVENT_BY_TYPE[c.type].map(event => ({ targetId: c.id, event, source: '', ...(event === 'touchStart' ? { filter: { target: '端' } } : {}) }))).slice(0, n);
          ok(p.scripts.length === n); return p; };
        const sounds = n => { const p = base(); p.sounds = Array.from({ length: n }, (_, i) => ({ id: 'limit-sound-' + i, name: '音' + i, assetId: 'asset-sound' })); return p; };
        const made = (actions, functions) => { const p = base();
          p.actions = Array.from({ length: actions }, (_, i) => ({ ownerId: 'stage', id: 'limit-action-' + i, name: '動作' + i, args: [], source: '' }));
          p.functions = Array.from({ length: functions }, (_, i) => ({ ownerId: 'stage', id: 'limit-function-' + i, name: '計算' + i, args: [], source: '' }));
          return p; };
        eq([LIMITS.components, LIMITS.scripts, LIMITS.sounds, LIMITS.callables], [500, 1000, 256, 500]);
        eq([parts(500), bodies(1000), sounds(256), made(499, 1), made(1, 499)].map(p => failure(() => validateDesignProject(p))), [null, null, null, null, null]);
        eq([parts(501), bodies(1001), sounds(257), made(500, 1), made(1, 500)].map(p => failure(() => validateDesignProject(p))),
          [['F504', '部品の 数が 多すぎます'], ['F504', '本文の 数が 多すぎます'], ['F504', '音の 数が 多すぎます'], ['F504', '自分で 作った ブロックが 多すぎます'], ['F504', '自分で 作った ブロックが 多すぎます']]);
      });
      // A value that does not read is told at its first character, on its line and column (a sentence after another on the
      // same line counts from the line's start); a value read alone is told on the line it is given.
      test('a value that does not read is told at its own first character', () => {
        const p = makeDefaultProject(), unread = '読めない ところが あります。書き方を たしかめて ください';
        const told = source => { p.scripts = [{ id: 'unread-start', targetId: 'sprite-1', event: 'start', source }]; return compileProject(p).errors.map(e => [e.code, e.line, e.column, e.message]); };
        eq([told('×2を言う。'), told('「あ」と言う。 ×2を言う。'), told('「あ」と言う。\n×2を言う。')],
          [[['P205', 1, 1, unread]], [['P205', 1, 9, unread]], [['P205', 2, 1, unread]]]);
        const alone = failure(() => parseExpression('1+', buildSymbols(makeDefaultProject()), { lineNo: 4 }));
        eq(alone, ['P205', unread]);
        try { parseExpression('1+', buildSymbols(makeDefaultProject()), { lineNo: 4 }); } catch (e) { eq([e.line, e.column], [4, 3]); }
        // (a value read with no line given is told on no line, 0)
        let noLine = null; try { parseExpression('1+', buildSymbols(makeDefaultProject())); } catch (e) { noLine = [e.code, e.line, e.column]; }
        eq(noLine, ['P205', 0, 3]);
        // (a \ in a 「 」 of a value read alone, followed by what it cannot be, is told at its place in the value)
        let escaped = null; try { parseExpression('「あ\\a」', buildSymbols(makeDefaultProject())); } catch (e) { escaped = [e.code, e.line, e.column, e.message]; }
        eq(escaped, ['N103', 0, 3, '「 」の 中の \\ の つぎには、\\ か「 か 」しか 書けません。\\ を 文字として 使う ときは \\\\ と 書きます']);
      });
      // A 名人 procedure's parameters in an exported work are a list of texts; any other is a broken tree.
      test('an exported 名人 procedure opens with its parameter names and refuses parameters that are no list of texts', () => {
        const p = makeDefaultProject();
        p.scripts = [{ id: 'procargs-meijin', mode: 'meijin', targetId: 'meijin', event: 'start',
          source: '【あいさつ】という手順を、相手を受け取って、次のように作る。\n  相手は「こんにちは」と言う。\n相手をあかりとして、【あいさつ】という手順を行う。' }];
        eq(compileProject(p).errors, []);
        const packed = JSON.parse(JSON.stringify(packExecutable(p)));
        const definition = d => { let found = null; const walk = v => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (v.kind === 'ActionDefinition') found = v; Object.values(v).forEach(walk); } }; walk(d.program); return found; };
        const opened = change => { const d = JSON.parse(JSON.stringify(packed)); change(d); try { AKARI_RUNTIME.restoreExecutable(d); return null; } catch (e) { return e.code + ' ' + e.message; } };
        eq([definition(packed).name, definition(packed).args], ['あいさつ', ['相手']]);
        eq([opened(() => {}), opened(d => { definition(d).args = '相手'; }), opened(d => { definition(d).args = [1]; }), opened(d => { definition(d).args = ['相手', null]; })],
          [null, 'X602 動きの 中身が こわれて います', 'X602 動きの 中身が こわれて います', 'X602 動きの 中身が こわれて います']);
      });
      // The forms a run reads (RUNTIME_FORMS) read as a map and cannot be changed from outside: the table has no set,
      // delete or clear, a map's own methods do not take it, and each form and each of its parts is frozen. A work with a
      // node of a kind the table was asked to take is still refused.
      test('the forms a run reads read as a map and refuse every change', () => {
        const forms = Akari.createAkariRuntime().RUNTIME_FORMS, all = [...forms], seen = [], self = {};
        const refused = change => { try { change(); return 'taken'; } catch (e) { return e.name; } };
        eq([typeof forms.set, typeof forms.delete, typeof forms.clear, Object.isFrozen(forms)], ['undefined', 'undefined', 'undefined', true]);
        eq([refused(() => Map.prototype.set.call(forms, 'Probe', [['value', 'zz']])), refused(() => Map.prototype.delete.call(forms, 'WaitTime')),
          refused(() => Map.prototype.clear.call(forms)), refused(() => Object.defineProperty(forms, 'set', { value: () => forms })),
          refused(() => forms.get('WaitTime').push(['value', 'zz'])), refused(() => forms.get('Say').pop())], ['TypeError', 'TypeError', 'TypeError', 'TypeError', 'TypeError', 'TypeError']);
        eq([Reflect.set(forms.get('WaitTime')[0], 1, 'zz'), all.every(([, parts]) => Object.isFrozen(parts) && parts.every(part => Object.isFrozen(part)))], [false, true]);
        eq([forms.size, all.length > 180, forms.has('WaitTime'), forms.has('Probe'), forms.get('WaitTime'), forms.get('Say'), forms.get('Probe')],
          [all.length, true, true, false, [['seconds', 'e']], [['value', 'e']], undefined]);
        forms.forEach(function (parts, id, table) { seen.push([id, parts, table === forms, this === self]); }, self);
        eq([[...forms.keys()], [...forms.values()], [...forms.entries()], [...new Map(forms)], seen],
          [all.map(([id]) => id), all.map(([, parts]) => parts), all, all, all.map(([id, parts]) => [id, parts, true, true])]);
        const p = makeDefaultProject();
        p.scripts = [{ id: 'forms-probe', targetId: 'sprite-1', event: 'start', source: '1秒待つ。' }];
        const packed = JSON.parse(JSON.stringify(packExecutable(p)));
        const wait = d => { let found = null; const walk = v => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (v.kind === 'WaitTime') found = v; Object.values(v).forEach(walk); } }; walk(d.program); return found; };
        const opened = change => { const d = JSON.parse(JSON.stringify(packed)); change(d); try { AKARI_RUNTIME.restoreExecutable(d); return null; } catch (e) { return e.code + ' ' + e.message; } };
        eq([refused(() => Map.prototype.set.call(AKARI_RUNTIME.RUNTIME_FORMS, 'Probe', [['seconds', 'zz']])), opened(() => {}), opened(d => { wait(d).kind = 'Probe'; })],
          ['TypeError', null, 'X602 動きの 中身が こわれて います']);
      });
      // A look of an exported work is a picture with its asset, or a text or a color with its text; any other is a broken work.
      test('an exported work refuses a look of another kind or a text or color look without its text', () => {
        const packed = JSON.parse(JSON.stringify(packExecutable(makeDefaultProject())));
        const opened = change => { const d = JSON.parse(JSON.stringify(packed)); change(d); try { AKARI_RUNTIME.restoreExecutable(d); return null; } catch (e) { return e.code + ' ' + e.message; } };
        eq([packed.project.components[0].costumes[1].kind, packed.project.stage.backdrops[0].kind], ['text', 'color']);
        eq([opened(() => {}), opened(d => { d.project.components[0].costumes[1].kind = 'video'; }), opened(d => { d.project.components[0].costumes[1].value = 5; }),
          opened(d => { d.project.stage.backdrops[0].kind = 'video'; }), opened(d => { d.project.stage.backdrops[0].value = null; })],
          [null, 'X602 作品の 中身が こわれて います', 'X602 作品の 中身が こわれて います', 'X602 作品の 中身が こわれて います', 'X602 作品の 中身が こわれて います']);
      });
      // A part of an exported work opens with its width, height, letter size and size in percent at either end of what a
      // work allows (8–1200, 8–1200, 8–200, 1–1000) and is refused one past either end.
      test('an exported work opens with a part size at either end of its range and refuses one past it', () => {
        const told = [];
        for (const [key, low, high] of [['w', 8, 1200], ['h', 8, 1200], ['fontSize', 8, 200], ['scalePercent', 1, 1000]]) for (const [at, past] of [[low, low - 1], [high, high + 1]]) {
          const p = makeDefaultProject(); p.components[0][key] = at;
          const packed = JSON.parse(JSON.stringify(packExecutable(p)));
          const opened = change => { const d = JSON.parse(JSON.stringify(packed)); change(d); try { AKARI_RUNTIME.restoreExecutable(d); return null; } catch (e) { return e.code + ' ' + e.message; } };
          told.push([key, at, opened(() => {}), opened(d => { d.project.components[0][key] = past; })]);
        }
        eq(told, [['w', 8], ['w', 1200], ['h', 8], ['h', 1200], ['fontSize', 8], ['fontSize', 200], ['scalePercent', 1], ['scalePercent', 1000]].map(x => [...x, null, 'X602 作品の 中身が こわれて います']));
      });
      // A \ in a 「 」 that goes on over lines, followed by what it cannot be, is told on the line it is on, at its character there.
      test('a wrong escape in a quote over lines is told on the line of the backslash', () => {
        const p = makeDefaultProject(), symbols = buildSymbols(p), ctx = { targetId: 'sprite-1', event: 'start', symbols };
        const escape = '「 」の 中の \\ の つぎには、\\ か「 か 」しか 書けません。\\ を 文字として 使う ときは \\\\ と 書きます';
        const told = source => { const d = parseSyntax(source, ctx).syntaxDiagnostics[0]; p.scripts = [{ id: 'escape-start', targetId: 'sprite-1', event: 'start', source }];
          return [[d.code, d.line, d.column, d.message], compileProject(p).errors.map(e => [e.code, e.line, e.column])]; };
        eq(told('「あ\nい\\aう」と言う。'), [['N103', 2, 2, escape], [['N103', 2, 2]]]);
        eq(told('前へ10歩進む。\n「あ\nいう\n\\aう」と言う。'), [['N103', 4, 1, escape], [['N103', 4, 1]]]);
      });
      // The made blocks of a work are two lists, actions and functions; either one that is no list is a broken work.
      test('a work whose actions or functions are no list is refused', () => {
        const shaped = (actions, functions) => { const p = makeDefaultProject(); p.actions = actions; p.functions = functions; return failure(() => validateDesignProject(p)); };
        const broken = ['F503', '自分で 作った ブロックの 一覧の 形が、正しく ありません'];
        eq([shaped([], []), shaped([], 5), shaped(null, []), shaped({}, {})], [null, broken, broken, broken]);
      });
      // In an exported work each part, backdrop and made block has its own id, and a sound has a text id and names its asset
      // with a text; a work with one id twice, a sound without those texts or a character with no costume is a broken work.
      test('an exported work refuses an id twice among its parts, backdrops or made blocks and a sound without its asset text', () => {
        const p = makeDefaultProject();
        p.actions = [{ ownerId: 'stage', id: 'twice-act', name: '回る', args: [], source: '何もしない。' }];
        p.functions = [{ ownerId: 'stage', id: 'twice-fn', name: '倍', args: ['かず'], source: 'かず×2を答えとして返す。' }];
        const packed = JSON.parse(JSON.stringify(packExecutable(p)));
        const opened = change => { const d = JSON.parse(JSON.stringify(packed)); change(d); try { AKARI_RUNTIME.restoreExecutable(d); return null; } catch (e) { return e.code + ' ' + e.message; } };
        const broken = 'X602 作品の 中身が こわれて います';
        eq([opened(() => {}),
          opened(d => { const c = structuredClone(d.project.components[0]); c.name = 'いぬ'; c.costumes = c.costumes.map(k => ({ ...k, id: 'twice-' + k.id })); c.costumeId = c.costumes[0].id; d.project.components.push(c); }),
          opened(d => { d.project.stage.backdrops.push({ ...d.project.stage.backdrops[0], name: '別の 空' }); }),
          opened(d => { d.project.functions[0].id = 'twice-act'; }),
          opened(d => { d.project.sounds = [{ id: 'twice-sound', name: 'ピコ', assetId: 5 }]; }),
          opened(d => { d.project.sounds = [{ id: 5, name: 'ピコ', assetId: 'twice-asset' }]; }),
          opened(d => { d.project.sounds = [{ id: 'twice-sound', name: 5, assetId: 'twice-asset' }]; }),
          opened(d => { d.project.components[0].costumes = []; })], [null, broken, broken, broken, broken, broken, broken, broken]);
      });
      // A sentence of an exported work may hold lists of values (args, items, targets) and a variable it names (target) only as
      // nodes with a kind and a record with a name; a list of texts or numbers, or a target without its name, is a broken tree.
      test('an exported sentence refuses lists of no values and a target without its name', () => {
        const packed = JSON.parse(JSON.stringify(packExecutable(makeDefaultProject())));
        const opened = change => { const d = JSON.parse(JSON.stringify(packed)); change(d); try { AKARI_RUNTIME.restoreExecutable(d); return null; } catch (e) { return e.code + ' ' + e.message; } };
        const said = extra => d => { d.program.find(item => item.key === 'script:sprite-1:start').ast.body.unshift({ kind: 'Say', value: { kind: 'StringLiteral', value: 'あ' }, ...extra }); };
        const broken = 'X602 動きの 中身が こわれて います';
        eq([opened(said({})), opened(said({ targets: ['x'] })), opened(said({ items: ['x'] })), opened(said({ args: [5] })), opened(said({ target: {} })), opened(said({ target: { name: 5 } }))],
          [null, broken, broken, broken, broken, broken]);
        // (a list of sentences holds sentences, and a value that is an object is a node, also in a sentence that has none)
        const shown = extra => d => { d.program.find(item => item.key === 'script:sprite-1:start').ast.body.unshift({ kind: 'LooksCommand', op: 'SHOW', args: [], ...extra }); };
        eq([opened(shown({})), opened(shown({ value: { x: 1 } })), opened(said({ body: ['x'] })), opened(said({ body: 5 }))], [null, broken, broken, broken]);
      });
      // A comment line's place ends after its last character; a value that does not read in a 「 」 over lines is told on
      // the line where it is.
      test('a comment line ends after its last character and a mistake after a quote over lines is on its own line', () => {
        const symbols = buildSymbols(makeDefaultProject()), ctx = { targetId: 'sprite-1', event: 'start', symbols };
        eq(parseSyntax('※ メモ\n3回くり返す。\n  前へ10歩進む。', ctx).ast.body[0].sourceSpan, { startLine: 1, startColumn: 1, endLine: 1, endColumn: 5 });
        const p = makeDefaultProject();
        p.scripts = [{ id: 'overlines-start', targetId: 'sprite-1', event: 'start', source: '前へ10歩進む。\n「あ\nい」+×+「う\nえ」を言う。' }];
        eq(compileProject(p).errors.map(e => [e.code, e.line, e.column, e.message]), [['P205', 3, 4, '読めない ところが あります。書き方を たしかめて ください']]);
      });
      // A 名人 sentence whose subject is a value (できたコピーは) keeps that value as a node of the tree: a broken one is a
      // broken tree.
      test('an exported 名人 sentence for a part held in a value refuses a broken value', () => {
        const p = makeDefaultProject();
        p.scripts = [{ id: 'valueref-meijin', mode: 'meijin', targetId: 'meijin', event: 'start', source: 'あかりのコピーを作る。\nできたコピーは「やあ」と言う。' }];
        eq(compileProject(p).errors, []);
        const packed = JSON.parse(JSON.stringify(packExecutable(p)));
        const refs = d => { const out = []; const walk = v => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (v.actorRef?.kind === 'value') out.push(v.actorRef); Object.values(v).forEach(walk); } }; walk(d.program); return out; };
        const opened = change => { const d = JSON.parse(JSON.stringify(packed)); change(d); try { AKARI_RUNTIME.restoreExecutable(d); return null; } catch (e) { return e.code + ' ' + e.message; } };
        eq(refs(packed).map(r => r.value.kind), ['VariableRead']);
        eq([opened(() => {}), opened(d => { refs(d)[0].value = { kind: 'Foo' }; })], [null, 'X602 動きの 中身が こわれて います']);
      });
      // はいけいの名前 has nothing before its は: it is never read with a part as its subject, so a state put into a variable
      // is written with 入れる whatever parts the names given have, a part with no name too.
      test('a state with nothing before its は is written with 入れる whatever the parts are named', () => {
        const work = names => { const p = makeDefaultProject(), base = p.components.find(c => c.type === 'sprite');
          p.components = names.map((name, i) => ({ ...structuredClone(base), id: 'headless-part-' + i, name, costumes: [{ id: 'headless-face-' + i, name: '顔', kind: 'text', value: '●' }],
            costumeId: 'headless-face-' + i, localData: { variables: [], lists: [] } }));
          p.projectData = { variables: [{ id: 'headless-score', name: '点数', initialValue: '' }], lists: [] };
          return p; };
        const named = work(['ねこ', 'いけい', 'ロケット']), symbols = buildSymbols(named);
        const ast = parseSyntax('はいけいの名前を点数に入れる。', { targetId: named.components[2].id, event: 'backdropChanged', symbols }).ast;
        eq([ast.body[0].actorRef, ast.body[0].value.kind], [{ kind: 'self' }, 'SensorRead']);
        eq([formatScript(ast, { symbols }), formatScript(ast, { symbols: buildSymbols(work(['', 'いけい', 'ロケット'])) })], ['はいけいの名前を点数に入れる。', 'はいけいの名前を点数に入れる。']);
      });
      // A sentence's subject that is not there (null) is no subject: an exported tree with one opens; only a subject read
      // from a value holds a node, which is checked.
      test('an exported sentence with no subject opens', () => {
        const packed = JSON.parse(JSON.stringify(packExecutable(makeDefaultProject())));
        const opened = change => { const d = JSON.parse(JSON.stringify(packed)); change(d); try { AKARI_RUNTIME.restoreExecutable(d); return null; } catch (e) { return e.code + ' ' + e.message; } };
        const said = extra => d => { d.program.find(item => item.key === 'script:sprite-1:start').ast.body.unshift({ kind: 'Say', value: { kind: 'StringLiteral', value: 'あ' }, ...extra }); };
        eq([opened(said({ actorRef: null })), opened(said({ speaksAs: null })), opened(said({ actorRef: { kind: 'value', value: { kind: 'Foo' } } }))], [null, null, 'X602 動きの 中身が こわれて います']);
      });
      // A mistake in a value is told at its place in its line when the place and the line's start are known and the place
      // is on that line (the line's own number is used, also when the reading's number is another); otherwise at its place
      // in the value, on the reading's line number (0 when there is none).
      test('a mistake in a value is placed in its line only when the line holds the place', () => {
        const symbols = buildSymbols(makeDefaultProject()), line = { lineNo: 2, start: 9, raw: '×2を言う。', code: '×2を言う。' };
        const told = ctx => { try { parseExpression('×2', symbols, ctx); return null; } catch (e) { return [e.code, e.line, e.column]; } };
        eq([told({ lineNo: 2, sourceLine: line, sourcePositions: [9, 10] }), told({ lineNo: 7, sourceLine: line, sourcePositions: [9, 10] }),
          told({ lineNo: 7, sourceLine: { raw: '×2を言う。', code: '×2を言う。' }, sourcePositions: [9, 10] }), told({ lineNo: 7, sourceLine: line, sourcePositions: [3, 4] }),
          told({ sourceLine: { start: 0, raw: '×2', code: '×2' }, sourcePositions: [0, 1] })],
          [['P205', 2, 1], ['P205', 2, 1], ['P205', 7, 1], ['P205', 7, 1], ['P205', 0, 1]]);
      });
      // Near sentences are checked with the work's names also when no names are handed in (they are read from the work):
      // 点数を言いたい。 is near 点数を言う。 in a work with the variable 点数.
      test('near sentences read the work names when none are handed in', () => {
        const p = makeDefaultProject(); p.projectData.variables.push({ id: 'near-names-score', name: '点数', initialValue: 0 });
        const place = { targetId: 'sprite-1', targetType: 'sprite', event: 'start', args: [], level: 'advanced' }, body = '点数を言いたい。';
        const first = parseSyntax(body, { ...place, symbols: buildSymbols(p) }).syntaxDiagnostics[0], had = Object.hasOwn(globalThis, 'performance'), clock = globalThis.performance;
        globalThis.performance = { now: () => 0 };
        try {
          eq([Akari.assistCandidates(p, body, place, first).map(c => c.text), Akari.assistCandidates(p, body, { ...place, symbols: buildSymbols(p) }, first).map(c => c.text)], [['点数を言う。'], ['点数を言う。']]);
        } finally { if (had) globalThis.performance = clock; else delete globalThis.performance; }
      });
      // The way a 名人 pick chooses (〜のうち、右にいるほう) in an exported work is a record of a known kind; any other is a broken tree.
      test('an exported 名人 pick opens with its way of choosing and refuses one that is no record of a known kind', () => {
        const p = makeDefaultProject(), dog = structuredClone(p.components[0]);
        dog.id = 'pickway-dog'; dog.name = 'いぬ'; dog.costumes = dog.costumes.map(c => ({ ...c, id: 'pickway-' + c.id })); dog.costumeId = dog.costumes[0].id; p.components.push(dog);
        p.scripts = [{ id: 'pickway-meijin', mode: 'meijin', targetId: 'meijin', event: 'start', source: 'あかりといぬのうち、右にいるほうは「勝ち」と言う。' }];
        eq(compileProject(p).errors, []);
        const packed = JSON.parse(JSON.stringify(packExecutable(p)));
        const pick = d => { let found = null; const walk = v => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (v.kind === 'PartPick') found = v; Object.values(v).forEach(walk); } }; walk(d.program); return found; };
        const opened = change => { const d = JSON.parse(JSON.stringify(packed)); change(d); try { AKARI_RUNTIME.restoreExecutable(d); return null; } catch (e) { return e.code + ' ' + e.message; } };
        eq(pick(packed).by, { kind: 'position', side: '右' });
        eq([opened(() => {}), opened(d => { pick(d).by = null; }), opened(d => { pick(d).by = 'position'; }), opened(d => { pick(d).by = { kind: 'far' }; })],
          [null, 'X602 動きの 中身が こわれて います', 'X602 動きの 中身が こわれて います', 'X602 動きの 中身が こわれて います']);
      });
    }
    {
      // Renaming a variable rewrites it where a sentence holds it: 〜を〜に入れる, もし…のとき, まず before もし.
      const work = source => { const p = Akari.makeDefaultProject(); p.components[0].name = 'ねこ'; p.projectData = { variables: [{ id: 'v-score', name: '点数', initialValue: 0 }, { id: 'v-name', name: '名前', initialValue: '' }], lists: [] }; p.scripts = [{ id: 's', targetId: p.components[0].id, event: 'start', source }]; return p; };
      test('rename rewrites the names held by a put-into sentence', () => {
        for (const [source, key, expected] of [
          ['答えを点数に入れる。', 'data:v-score', '答えをみかんに入れる。'],
          ['点数に答えを入れる。', 'data:v-score', 'みかんに答えを入れる。'],
          ['ねこは、答えを点数に入れる。', 'data:v-score', 'ねこは、答えをみかんに入れる。'],
          ['ねこは、点数に答えを入れる。', 'data:v-score', 'ねこは、みかんに答えを入れる。'],
          ['ねこは点数に答えを入れる。', 'data:v-score', 'ねこはみかんに答えを入れる。'],
          ['点数+1を名前に入れる。', 'data:v-score', 'みかん+1を名前に入れる。'],
          ['名前に点数+1を入れる。', 'data:v-score', '名前にみかん+1を入れる。'],
          ['ねこは、点数+1を名前に入れる。', 'data:v-score', 'ねこは、みかん+1を名前に入れる。'],
          ['ねこは、名前に点数+1を入れる。', 'data:v-score', 'ねこは、名前にみかん+1を入れる。'],
          ['ねこは、点数+1を名前に入れる。', 'data:v-name', 'ねこは、点数+1をみかんに入れる。'],
          ['もし点数が1のとき、\n  10歩動かす。', 'data:v-score', 'もしみかんが1のとき、\n  10歩動かす。'],
          ['もし点数が1のときは、10歩動かす。', 'data:v-score', 'もしみかんが1のときは、10歩動かす。'],
          ['まず、もし点数が1なら、\n  10歩動かす。', 'data:v-score', 'まず、もしみかんが1なら、\n  10歩動かす。'],
          ['まず、もし点数が1のとき、10歩動かす。', 'data:v-score', 'まず、もしみかんが1のとき、10歩動かす。'],
          ['ねこは、まず、もし点数が1のとき、10歩動かす。', 'data:v-score', 'ねこは、まず、もしみかんが1のとき、10歩動かす。'],
          ['もし点数が1のとき、名前を点数にする。', 'data:v-score', 'もしみかんが1のとき、名前をみかんにする。'],
          ['もし 点数 が 1 の とき、 10歩動かす。', 'data:v-score', 'もし みかん が 1 の とき、 10歩動かす。'],
        ]) {
          eq(compileProject(work(source)).errors.map(e => e.code), []);
          let written; try { written = Akari.prepareResourceRename(work(source), key, 'みかん', {}).scripts[0].source; } catch (e) { written = 'refused: ' + e.message; }
          eq([source, key, written], [source, key, expected]);
        }
      });
      test('a signal sent in a もし…のとき line that no part receives is offered the received name in place of the sentence', () => {
        const work = source => { const p = Akari.makeDefaultProject(); p.projectData = { variables: [{ id: 'signal-score', name: '点数', initialValue: 0 }], lists: [] }; p.scripts = [{ id: 's1', targetId: 'stage', event: 'start', source }, { id: 's2', targetId: p.components[0].id, event: 'message', filter: { message: 'スタート' }, source: '10歩動かす。' }]; return p; };
        for (const [source, line, column, start, end] of [['もし点数が0のとき、「スタト」の合図を送る。', 1, 11, 10, 21], ['もし 点数が 0の とき、 「スタト」の 合図を 送る。', 1, 15, 14, 27], ['もし点数が0のとき、\n  「スタト」の合図を送る。', 2, 3, 13, 24], ['「スタト」の合図を送る。', 1, 1, 0, 11]]) {
          const compiled = compileProject(work(source)), note = compiled.notes.find(n => n.code === 'I136');
          eq([source, compiled.errors.length, note && [note.line, note.column, note.proposals.map(p => [p.label, p.source, p.start, p.end])]], [source, 0, [line, column, [['「スタート」の 合図に かえる', '「スタート」の合図を送る', start, end]]]]);
        }
      });
      test('the place to write after a もし…のとき or まず head is inside its body', () => {
        for (const [before, depth, insideLoop] of [['まず、もし点数が1のとき、\n', 1, false], ['もし点数が1のとき、\n', 1, false], ['もし点数が1のときは、\n', 1, false], ['まず、もし点数が1なら、\n', 1, false], ['まず、2回くり返す。\n', 1, true], ['もし点数が1のとき、10歩動かす。\n', 0, false]]) {
          const source = before + '  ', at = insertionContext(source);
          eq([before, at.depth, at.insideLoop, at.statementSlot, at.indentText], [before, depth, insideLoop, true, '  ']);
        }
      });
      test('rename rewrites a part name written as the subject of a sentence and the data in it', () => {
        const fx = source => { const p = Akari.makeDefaultProject(); p.components[0].name = 'ねこ'; p.projectData = { variables: [{ id: 'subject-score', name: '点数', initialValue: 0 }], lists: [] }; p.scripts = [{ id: 's', targetId: 'stage', event: 'start', source }]; return p; };
        for (const [source, cat, score] of [
          ['ねこは10歩動かす。', 'たまは10歩動かす。', null],
          ['ねこは、10歩動かす。', 'たまは、10歩動かす。', null],
          ['ねこが10歩動かす。', 'たまが10歩動かす。', null],
          ['ねこも、10歩動かす。', 'たまも、10歩動かす。', null],
          ['【ねこ】は10歩動かす。', '【たま】は10歩動かす。', null],
          ['【ねこ】が、10歩動かす。', '【たま】が、10歩動かす。', null],
          ['ねこを10歩動かす。', 'たまを10歩動かす。', null],
          ['ねこに「あ」と言わせる。', 'たまに「あ」と言わせる。', null],
          ['ねこは、まず、10歩動かす。', 'たまは、まず、10歩動かす。', null],
          ['ねこは、答えを点数に入れる。', 'たまは、答えを点数に入れる。', 'ねこは、答えを得点に入れる。'],
          ['ねこは点数に1を入れる。', 'たまは点数に1を入れる。', 'ねこは得点に1を入れる。'],
          ['ねこが「あ」と言う。', 'たまが「あ」と言う。', null],
          ['ねこが、点数を1ふやす。', 'たまが、点数を1ふやす。', 'ねこが、得点を1ふやす。'],
          ['ねこだけ10歩動かす。', 'たまだけ10歩動かす。', null],
          ['【ねこ】だけ10歩動かす。', '【たま】だけ10歩動かす。', null],
          ['点数が1になるまで、ねこは待つ。', '点数が1になるまで、たまは待つ。', '得点が1になるまで、ねこは待つ。'],
          ['点数が1になるまで、【ねこ】は待つ。', '点数が1になるまで、【たま】は待つ。', '得点が1になるまで、【ねこ】は待つ。'],
          ['点数が1になるまで、ねこは待ちます。', '点数が1になるまで、たまは待ちます。', '得点が1になるまで、ねこは待ちます。'],
        ]) {
          const p = fx(source);
          eq(compileProject(p).errors.map(e => e.code), []);
          const written = [cat && ['component:' + p.components[0].id, 'たま'], ['data:subject-score', '得点']].map(pair => { if (!pair) return null; try { return Akari.prepareResourceRename(fx(source), pair[0], pair[1], {}).scripts[0].source; } catch (e) { return 'refused: ' + e.message; } });
          eq([source, written], [source, [cat, score ?? source]]);
        }
      });
      test('rename rewrites the subject written after a heading, also in 名人', () => {
        const parts = (source, meijin) => { const p = Akari.makeDefaultProject(), sprite = p.components.find(c => c.type === 'sprite'); p.components = ['ねこ', 'いぬ'].map((name, i) => ({ ...structuredClone(sprite), id: i ? 'dog' : 'cat', name, costumes: [{ id: 'rename-heading-' + i, name: '顔', kind: 'text', value: 'x' }], costumeId: 'rename-heading-' + i, localData: { variables: [], lists: [] } })); p.projectData = { variables: [{ id: 'rename-heading-score', name: '点数', initialValue: 0 }], lists: [] }; p.scripts = [{ id: 's1', targetId: meijin ? 'meijin' : 'cat', event: 'start', source, ...(meijin ? { mode: 'meijin' } : {}) }]; return p; };
        for (const [source, meijin, dog, cat, score] of [
          ['ねこがおされたとき、いぬは、前へ10歩進む。\n  「あ」と言う。', true, 'ねこがおされたとき、みけは、前へ10歩進む。\n  「あ」と言う。', 'たまがおされたとき、いぬは、前へ10歩進む。\n  「あ」と言う。', null],
          ['ねこがおされたとき、【いぬ】は、前へ10歩進む。\n  「あ」と言う。', true, 'ねこがおされたとき、【みけ】は、前へ10歩進む。\n  「あ」と言う。', 'たまがおされたとき、【いぬ】は、前へ10歩進む。\n  「あ」と言う。', null],
          ['「スタート」という合図を受けたとき、いぬは、前へ10歩進む。\n  「あ」と言う。', true, '「スタート」という合図を受けたとき、みけは、前へ10歩進む。\n  「あ」と言う。', null, null],
          ['ねこがおされたとき、点数は、「あ」と言う。', true, null, 'たまがおされたとき、点数は、「あ」と言う。', 'ねこがおされたとき、得点は、「あ」と言う。'],
          ['作品を動かしたとき、ねこは、いぬは、前へ10歩進む。', true, '作品を動かしたとき、ねこは、みけは、前へ10歩進む。', '作品を動かしたとき、たまは、いぬは、前へ10歩進む。', null],
          ['ねこがおされたとき、\n  いぬは、前へ10歩進む。', true, 'ねこがおされたとき、\n  みけは、前へ10歩進む。', 'たまがおされたとき、\n  いぬは、前へ10歩進む。', null],
          ['作品を動かしたとき、ねこは、前へ10歩進む。\n  「あ」と言う。', true, null, '作品を動かしたとき、たまは、前へ10歩進む。\n  「あ」と言う。', null],
          ['いぬがおされたとき、ねこは、10歩動かす。', false, 'みけがおされたとき、ねこは、10歩動かす。', 'いぬがおされたとき、たまは、10歩動かす。', null],
          ['「いぬ」にふれたとき、10歩動かす。', false, '「みけ」にふれたとき、10歩動かす。', null, null],
          ['ねこが「いぬ」にふれたとき、10歩動かす。', false, 'ねこが「みけ」にふれたとき、10歩動かす。', 'たまが「いぬ」にふれたとき、10歩動かす。', null],
          ['「いぬ」にふれたとき、\n  10歩動かす。', false, '「みけ」にふれたとき、\n  10歩動かす。', null, null],
          ['ねこが「いぬ」にふれたとき、いぬは、10歩動かす。', true, 'ねこが「みけ」にふれたとき、みけは、10歩動かす。', 'たまが「いぬ」にふれたとき、いぬは、10歩動かす。', null],
          ['いぬが「ねこ」にふれたとき、10歩動かす。', false, 'みけが「ねこ」にふれたとき、10歩動かす。', 'いぬが「たま」にふれたとき、10歩動かす。', null],
          ['作品を動かしたとき、いぬは、10歩動かす。\n  点数を1ふやす。', false, '作品を動かしたとき、みけは、10歩動かす。\n  点数を1ふやす。', null, '作品を動かしたとき、いぬは、10歩動かす。\n  得点を1ふやす。'],
        ]) {
          eq(compileProject(parts(source, meijin)).errors.map(e => e.code), []);
          const written = [['component:dog', 'みけ'], ['component:cat', 'たま'], ['data:rename-heading-score', '得点']].map(([key, name]) => { try { return Akari.prepareResourceRename(parts(source, meijin), key, name, {}).scripts[0].source; } catch (e) { return 'refused: ' + e.message; } });
          eq([source, written], [source, [dog, cat, score].map(text => text ?? source)]);
        }
      });
    }
    {
      // A part's value before a value with no 番目 or 文字目 in it is written without added （ ）; before one with a 番目 or
      // 文字目 anywhere in it, it keeps its （ ） unless it stands only inside other （ ）. Each text is written as it is and reads back to the same tree.
      test('a part value is bracketed only before a later nth', () => {
        const p = makeRegressionProject(), symbols = buildSymbols(p), ctx = { targetId: 'stage', event: 'start', symbols };
        for (const source of ['点数を「マスコット」の大きさから10％のどれかにする。', '点数を「マスコット」の大きさから「あいう」の文字数のどれかにする。',
          '点数を（「マスコット」の大きさ）から2番目のどれかにする。', '点数を（「マスコット」の大きさ）から名前一覧の1番目のどれかにする。',
          '点数を（「マスコット」の大きさ）から「あいう」の2文字目のどれかにする。', '点数を（「マスコット」の大きさ＋1）×2から2番目のどれかにする。',
          '点数を（（1＋2）×「マスコット」の大きさ）から2番目のどれかにする。', '点数を（「マスコット」の大きさ＋1）×「あいう」の文字数から2番目のどれかにする。',
          '点数を「あいう」の文字数×（「マスコット」の大きさ＋1）から2番目のどれかにする。', '点数を（「あ（」の文字数＋「マスコット」の大きさ）から2番目のどれかにする。',
          '点数を（「あ' + String.fromCharCode(92) + '」（」の文字数＋「マスコット」の大きさ）から2番目のどれかにする。']) {
          const first = parseSyntax(source, ctx), text = formatScript(first.ast, { symbols }), again = parseSyntax(text, ctx);
          eq([source, first.syntaxDiagnostics, text.trim(), again.syntaxDiagnostics], [source, [], source, []]); ok(astEquivalent(first.ast, again.ast), text);
        }
      });
      // I139 is told once for each place and message: two sentences that stop the run are told each at its line, the same
      // sentence on two lines is told on both, and one sentence that reads the same data twice is told once; a list read by
      // number is not told.
      test('a stop notice is told once at each place it stands', () => {
        const p = makeRegressionProject();
        p.projectData = { variables: [{ id: 'stop-score', name: '点数', initialValue: 0 }], lists: [{ id: 'stop-items', name: '持ち物', initialValue: ['本'] }] };
        p.scripts = [{ id: 'stop-notes', targetId: p.components.find(c => c.type === 'sprite').id, event: 'start',
          source: 'ペンの太さを「あ」にする。\n点数の1番目を言う。\n点数の1番目を言う。\n（点数の1番目）と（点数の1番目）をつなげた文字を言う。\n持ち物の1番目を言う。' }];
        const stop = 'この 文まで 来ると、作品が 止まります。', pen = stop + 'ペンの 太さには 数が いります。れい：ペンの太さを5にする',
          byNumber = stop + '「点数」は リストでは ないので、何番目かを えらべません。何番目かを えらべるのは リストです';
        const c = compileProject(p);
        eq([c.errors, c.notes.filter(n => n.code === 'I139').map(n => [n.message, n.line, n.column, n.where, n.notice])],
          [[], [[pen, 1, 1, 'script:stop-notes', true], [byNumber, 2, 1, 'script:stop-notes', true], [byNumber, 3, 1, 'script:stop-notes', true], [byNumber, 4, 1, 'script:stop-notes', true]]]);
      });
      // すがたの番号・すがたの名前 are a character's: on the stage or a button the work's check refuses them (S304); in 名人 the
      // stage as who does it is shown whose to write, and a button is refused as in its own body.
      test('a costume value outside a character is refused, and in meijin the stage is shown whose to write', () => {
        const told = (source, targetId) => { const p = makeRegressionProject(), meijin = targetId === 'meijin';
          p.scripts = [{ id: 'costume-body', targetId, ...(meijin ? { mode: 'meijin' } : {}), event: 'start', source }];
          return compileProject(p).errors.map(e => [e.code, e.line, e.column, e.message]); };
        const only = word => [['S304', 1, 1, `「${word}」は キャラクターで だけ 使えます`]];
        eq([told('すがたの番号を言う。', 'stage'), told('すがたの名前を言う。', 'stage'), told('すがたの番号を言う。', 'button-1'), told('すがたの番号を言う。', 'sprite-1')],
          [only('すがたの番号'), only('すがたの名前'), only('すがたの番号'), []]);
        eq([told('画面は、すがたの番号を言う。', 'meijin'), told('ボタン1は、すがたの番号を言う。', 'meijin'), told('マスコットは、すがたの番号を言う。', 'meijin')],
          [[['S304', 1, 1, '名人の 本文では、だれの「すがたの番号」かを 書きます。れい：マスコットのすがたの番号']], only('すがたの番号'), []]);
      });
    }
    {
      // The editor state kept with a work: the draft of a made block and the kept editors are checked as they are saved.
      const keptWork = () => { const p = makeDefaultProject(); p.scripts = [{ id: 'kept-s1', targetId: 'sprite-1', event: 'start', source: '10歩動く。' }]; return p; },
        keptState = (over = {}) => ({ version: 1, revision: 1, selectedId: 'sprite-1', currentEvent: 'start', selectedScriptId: 'kept-s1', uiLevel: 'advanced', sourceOverviewOpen: false,
          editorModes: { script: 'blocks', draft: 'code' }, callableDraft: null, pendingEditors: [], views: [], ...over }),
        keptDraft = (over = {}) => ({ ownerId: 'stage', type: 'action', name: 'とぶ', argsText: '', source: '', editId: '', loadedKey: '', ...over }),
        keptEditor = (over = {}) => ({ kind: 'script', ownerKey: 'script:kept-s1', source: '10歩動く。', mode: 'blocks', pending: { kind: 'block-draft' }, draftTree: null, ...over }),
        keptTold = (state) => { try { serializeProject(keptWork(), new AssetStore(), state); return 'ok'; } catch (e) { ok(e instanceof AkariError, 'a controlled refusal: ' + e); return e.code + ' ' + e.message; } };
      const broken = 'F503 下書きの 中身が こわれて います', tooLong = 'F504 下書きの 文字が 多すぎます', shape = 'F503 作文の 下書きが 正しく ありません';
      test('kept made-block draft texts are texts within their lengths, and a short call only of an action', () => {
        for (const [over, want] of [
          [{}, 'ok'], [{ name: 'あ'.repeat(500) }, 'ok'], [{ name: 'あ'.repeat(501) }, tooLong], [{ name: 5 }, broken],
          [{ callPhrase: 'とぶ' }, 'ok'], [{ callPhrase: 'あ'.repeat(80) }, 'ok'], [{ callPhrase: 'あ'.repeat(81) }, tooLong], [{ callPhrase: 3 }, broken],
          [{ type: 'function', callPhrase: 'あ' }, broken], [{ type: 'function', callPhrase: 3 }, broken],
        ]) eq([over, keptTold(keptState({ callableDraft: keptDraft(over) }))], [over, want]);
      });
      test('kept editors are at most one of each kind, each an object, checked before what each holds', () => {
        const long = 'あ'.repeat(100001);
        for (const [name, pendingEditors, want, over] of [
          ['none', [], 'ok'],
          ['one', [keptEditor()], 'ok'],
          ['a script and a draft', [keptEditor(), keptEditor({ kind: 'draft', ownerKey: 'action:draft-1', source: '' })], 'ok', { callableDraft: keptDraft() }],
          ['two of a kind', [keptEditor(), keptEditor()], shape],
          ['three', [keptEditor({ source: long }), keptEditor({ kind: 'draft' }), keptEditor({ kind: 'other' })], shape],
          ['no list', {}, shape], ['an empty one', [null], shape], ['a text', ['x'], shape],
          ['a list beside a long one', [keptEditor({ source: long }), []], shape],
          ['a long one', [keptEditor({ source: long })], 'F504 作文の 下書きが 長すぎます'],
          ['a block record that does not read', [keptEditor({ draftTree: {} })], 'F503 なおして いた ときの ブロックの きろくが、正しく ありません'],
        ]) eq([name, keptTold(keptState({ pendingEditors, ...(over || {}) }))], [name, want]);
      });
      test('a saved work holds its pictures and sounds as a list of at most the limit, told with no place in a body', () => {
        const begin = '<!-- AKARI-PROJECT-F' + PROJECT_FORMAT_ID + '-DATA-BEGIN -->\n```json\n', end = '\n```\n<!-- AKARI-PROJECT-F' + PROJECT_FORMAT_ID + '-DATA-END -->\n',
          text = serializeProject(makeDefaultProject()), saved = JSON.parse(text.slice(text.lastIndexOf(begin) + begin.length, -end.length)), first = saved.assets[0];
        const told = (assets) => { const root = { ...JSON.parse(JSON.stringify(saved)), assets }; try { validateSerializedProjectStructure(root); return 'ok'; } catch (e) { return [e.code, e.message, e.line, e.column]; } };
        const copies = (n) => Array.from({ length: n }, (_, i) => (i ? { ...first, id: 'kept-copy-' + i } : first));
        eq(told(copies(1)), 'ok');
        eq(told({}), ['F503', '絵や音の 一覧の 形が、正しく ありません', 0, 0]);
        eq(told(copies(LIMITS.assets)), ['F503', '作品ファイルに、同じ絵や音が2つ以上あります', 0, 0]);
        eq(told(copies(LIMITS.assets + 1)), ['F504', '絵や音が 多すぎます。いらない 絵や音を けして ください', 0, 0]);
      });
      test('a saved sound that is only its four-letter mark is a broken sound of that kind, not a file of no sound kind', () => {
        const told = (text, mime) => {
          const p = makeDefaultProject(), bytes = new TextEncoder().encode(text);
          p.sounds = [{ id: 'kept-mark-sound', name: 'ピコ', assetId: 'kept-mark-asset' }];
          const store = new AssetStore([...makeDefaultAssetStore().snapshotRefs().values(), { id: 'kept-mark-asset', kind: 'audio', mime, bytes, sha256: sha256Fallback(bytes), meta: {} }]);
          try { serializeProject(p, store); return 'ok'; } catch (e) { ok(e instanceof AkariError, 'a controlled refusal: ' + e); return e.code + ' ' + e.message; }
        };
        const broken = 'F511 この 音の ファイルは、こわれて いる ようです。ほかの 音を えらんで ください';
        eq([told('fLaC', 'audio/flac'), told('OggS', 'audio/ogg'), told('abcd', 'audio/flac')], [broken, broken, 'F509 この ファイルは 音として 使えません。ほかの 音の ファイルを えらんで ください']);
      });
      test('an ordinary body written in 名人 forms is told it is a 名人 form, at its first line', () => {
        const only = 'この 書き方は、名人の本文で だけ 使えます。使う ときは、コードモードで「名人」を えらびます';
        for (const source of ['いちばん近い星の方を向く。', '次のことを同時に始める。\n  「a」と言う。\n  「b」と言う。', '10秒のあいだ、くり返す。\n  1歩進む。'])
          eq([source, intentCheck(source).compiled.errors.map((e) => [e.code, e.message, e.line])], [source, [['S317', only, 1]]]);
      });
      test('a signal a 名人 body sends to a part is told unless that part receives that signal', () => {
        const told = 'ねこには、「出発」の 合図を 受ける 本文が ありません。ねこの 本文の はじめに「ねこが「出発」の合図を受けたとき、」と 書きます',
          unsent = '「止まれ」の 合図を 送る 文が、この 作品に ありません。送る 部品の 本文に「「止まれ」の合図を送る。」と 書きます',
          receiver = (targetId, message) => ({ id: 'core-signal-r', targetId, event: 'message', filter: { message }, source: '「来た」と言う。' });
        for (const [label, heard, want] of [['none', [], [told]], ['the part', [receiver('intent-part-0', '出発')], []], ['another signal', [receiver('intent-part-0', '止まれ')], [told, unsent]], ['the stage', [receiver('stage', '出発')], [told]]]) {
          const p = intentWork('');
          p.scripts = [{ id: 'core-signal-m', targetId: 'meijin', event: 'start', mode: 'meijin', source: 'ねこに「出発」と知らせる。' }, ...heard];
          const c = compileProject(p);
          eq([label, c.errors, c.notes.map((n) => n.message)], [label, [], want]);
        }
      });
      test('a costume value in a stage body is for characters only, and a calculation named like a list is no list for the pen', () => {
        for (const [source, shown] of [['衣装番号を言う。', 'すがたの番号'], ['衣装名を言う。', 'すがたの名前']]) {
          const p = intentWork(source); p.scripts[0].targetId = 'stage';
          eq(compileProject(p).errors.map((e) => [e.code, e.message, e.line, e.column]), [['S304', '「' + shown + '」は キャラクターで だけ 使えます', 1, 1]]);
        }
        for (const [list, source] of [['乱数', 'ペンの太さを1から3までのどれかにする。'], ['余り', 'ペンの太さを5を3で割った余りにする。']]) {
          const p = intentWork(source); p.projectData.lists.push({ id: 'core-calc-list', name: list, initialValue: ['本'] });
          const c = compileProject(p); eq([source, c.errors, c.notes.filter((n) => n.code === 'I139')], [source, [], []]);
        }
      });
      test('a list said as it is is refused, also inside a join, and a count of a list is said', () => {
        const said = 'S304 リストは そのまま 言えません。中身を 言う ときは「持ち物の1番目を言う」のように 書きます';
        for (const [source, want] of [['持ち物を言う。', [said]], ['「あ」と持ち物をつなげて言う。', [said]], ['持ち物の数を言う。', []], ['持ち物の1番目を言う。', []], ['持ち物に「本」が入っているを言う。', []]])
          eq([source, compileProject(intentWork(source)).errors.map((e) => e.code + ' ' + e.message)], [source, want]);
      });
      test('a sound, a backdrop or a costume named but not in the work is told by its kind', () => {
        const missing = (name, kind) => '「' + name + '」という ' + kind + 'が 見つかりません。名前を たしかめるか、その 名前の ' + kind + 'を 入れて ください';
        for (const [source, targetId, message] of [
          ['「ピアノ」の音を鳴らす。', 'intent-part-0', missing('ピアノ', '音')],
          ['はいけいを「海」にする。', 'stage', missing('海', 'はいけい')],
          ['すがたを「羽」にかえる。', 'intent-part-0', missing('羽', 'すがた')],
        ]) {
          const p = intentWork(''); p.scripts = [{ targetId, event: 'start', source }];
          eq([source, compileProject(p).errors.map((e) => [e.code, e.message, e.line, e.column])], [source, [['S301', message, 1, 1]]]);
        }
      });
      test('a sentence that stops every run is told before running with the work notes', () => {
        const stop = 'この 文まで 来ると、作品が 止まります。';
        for (const [source, want] of [
          ['ペンの太さを「あ」にする。', ['ペンの 太さには 数が いります。れい：ペンの太さを5にする']],
          ['ペンの太さを持ち物にする。', ['ペンの 太さには 数が いります。れい：ペンの太さを5にする']],
          ['持ち物を1ふやす。', ['「持ち物」は リストです。ふやす・へらすは 数の へんすうに 使う ブロックです。リストに 入れる ときは「持ち物のさいごに1を入れる」のように 書きます']],
          ['点数を「本」ふやす。', ['ふやす・へらす ところには 数が いります。れい：点数を1ふやす']],
          ['持ち物を0にする。', ['リストには リストだけを 入れられます。中身を 全部 消す ときは「持ち物の中身を全部消す」と 書きます']],
          ['持ち物を名前にする。', ['リストには リストだけを 入れられます。中身を 全部 消す ときは「持ち物の中身を全部消す」と 書きます']],
          ['点数を持ち物にする。', ['へんすうには 数・文字・あてはまる／あてはまらない だけを 入れられます。リストの 中身を 入れる ときは「持ち物の1番目」のように 書きます']],
          ['ペンの太さを5にする。', []], ['ペンの太さを点数にする。', []], ['点数を1ふやす。', []], ['点数を名前ふやす。', []],
          ['持ち物を持ち物にする。', []], ['名前を「あ」にする。', []], ['点数を持ち物の数にする。', []],
        ]) {
          const c = compileProject(intentWork(source));
          eq([source, c.errors, c.notes.filter((n) => n.code === 'I139').map((n) => [n.message, n.line, n.column, n.notice])], [source, [], want.map((m) => [stop + m, 1, 1, true])]);
        }
      });
      test('a kept history holds a picture without its bytes only when kind, type, size and digest all match a built-in one', () => {
        const project = makeDefaultProject(), records = [...makeDefaultAssetStore().snapshotRefs().values()], a = records[0],
          state = { version: 1, revision: 1, selectedId: 'sprite-1', currentEvent: 'start', selectedScriptId: null, uiLevel: 'advanced', sourceOverviewOpen: false,
            editorModes: { script: 'code', draft: 'code' }, callableDraft: null, pendingEditors: [], views: [] },
          same = { kind: a.kind, mime: a.mime, byteLength: a.byteLength, sha256: a.sha256 };
        for (const [label, builtins, kept] of [
          ['all match', [same], true], ['another kind', [{ ...same, kind: 'audio' }], false], ['another type', [{ ...same, mime: 'image/jpeg' }], false],
          ['another size', [{ ...same, byteLength: a.byteLength + 1 }], false], ['another digest', [{ ...same, sha256: '0'.repeat(64) }], false], ['none', [], false],
        ]) {
          const history = Akari.encodeWorkspaceHistory([{ project, assets: records, editorState: state }], 0, builtins);
          eq([label, history.assets.map((x) => [x.kind, x.mime, x.byteLength, x.builtin, x.blob === null])], [label, [[a.kind, a.mime, a.byteLength, kept, kept]]]);
        }
      });
    }
    // Near sentences at a place of a work with the parts ねこ and 星, the variable 点数, the list 持ち物 and the cat's own
    // variable 体力.
    {
      const ok=(v,m='mismatch')=>{if(!v)throw Error(m);};
      const placeWorld=()=>{const p=makeDefaultProject(),t=JSON.parse(JSON.stringify(p.components[0]));
        p.components=['ねこ','星'].map((name,i)=>{const id='sprite-'+(i+1),c={...JSON.parse(JSON.stringify(t)),id,type:'sprite',name,localData:{variables:[],lists:[]}};c.costumes=c.costumes.map((k,j)=>({...k,id:id+'-costume-'+j}));c.costumeId=c.costumes[0].id;return c;});
        p.components[0].localData.variables.push({id:'cat-health',name:'体力',initialValue:0});
        p.projectData={variables:[{id:'variable-0',name:'点数',initialValue:0}],lists:[{id:'list-0',name:'持ち物',initialValue:[]}]};
        p.sounds=[];p.actions=[];p.functions=[];p.scripts=[{id:'s1',targetId:'sprite-1',event:'start',source:'何もしない。'}];validateDesignProject(p);return p;};
      const near=(source,o={})=>{const p=placeWorld(),targetId=o.targetId||'sprite-1',event=o.event||'start',target=p.components.find(c=>c.id===targetId);p.scripts[0].targetId=targetId;p.scripts[0].event=event;p.scripts[0].source=source;
        const verify={symbols:buildSymbols(p),targetId,targetType:target?.type||'stage',event,args:[],level:'advanced',...(o.meijin?{meijin:true}:{})},trigger={...verify,key:'script:s1',ownerKey:'script:s1',id:'s1',scriptId:'s1'};
        const parsed=parseSyntax(source,{...trigger,symbols:buildSymbols(p),project:p}),d=parsed.syntaxDiagnostics[0],asked=o.bare?{...verify,symbols:undefined}:verify;
        const had='performance' in globalThis,clock=globalThis.performance;globalThis.performance={now:()=>0};let found;try{found=Akari.assistCandidates(p,source,asked,o.nodiag?null:d);}finally{if(had)globalThis.performance=clock;else delete globalThis.performance;}
        ok(found.every(c=>c.assist===true),source+': every near sentence is marked as one');
        return [d.code,d.line,Array.from(d.proposals||[],r=>[r.source,r.start,r.end]),found.map(c=>[c.text,c.start,c.end])];};
      // The body is checked as far as the near sentence: a line after it that does not read, or that the check refuses,
      // is no reason to hide it; a near sentence after which a sentence that does nothing would let the body read further
      // is not shown, nor one the check refuses there.
      test('ASSIST-PLACE work check reads the body as far as the near sentence',()=>{
        const up=(at,end)=>[['自分の体力を1ふやす。',at,end],['体力を1ふやす。',at,end]],touch=[['「星」にふれたとき、',0,7],['もし「星」にふれていれば、',0,7]];
        const rows=[
          ['体力をふやして\n10歩動く。\n点数をふやして',['P201',1,[],up(0,7)]],['体力をふやして\n10歩動く。\n点数をふやして',['P201',1,[],up(0,7)],{bare:true}],
          ['\n体力をふやして\n10歩動く。\n点数をふやして',['P201',2,[],up(1,8)]],['体力をふやして\n持ち物を言う。',['P201',1,[],up(0,7)]],['持ち物を言う。\n体力をふやして',['P201',2,[],up(8,15)]],
          ['点数をふやして\n  10歩動く。',['P201',1,[],[]]],['点数をふやして\n  10歩動く。\nああああ',['P201',1,[],[]]],
          ['持ち物を言う。\n星にふれたら点数を1ふやす',['P205',2,[],[]],{targetId:'stage'}],['星にふれたら点数を1ふやす\nああああ',['P205',1,[],[]],{targetId:'stage'}],
          ['星にふれたら点数を1ふやす\nああああ',['P205',1,[['「星」にふれたとき、点数を1ふやす',0,13],['もし「星」にふれていれば、点数を1ふやす',0,13],['「星」にふれるまで待って、点数を1ふやす',0,13]],[]]],
          ['星にさわったら\n  10歩動く。\nああああ',['P205',1,touch,[]]],['ずっとくり返す。\n  星にさわったら\n    10歩動く。\nああああ',['P205',2,[['もし「星」にふれていれば、',11,18]],[]]],
          ['星にふれたとき消える\nああああ',['P205',1,[['すがたをかくす',7,10]],[]]],['星にふれたとき消える\n10歩動く。\nああああ',['P205',1,[],[]]],['10歩動く。\n星にふれたとき消える\n10歩動く。',['P205',2,[],[]]],
          ['体力が10より小さいあいだ体力を1ふやす',['P205',1,[],[['体力が10より小さいあいだ、くり返す。\n  体力を1ふやす。',0,20]]]],
          ['ねこを右に動かす\n10歩動く。',['P205',1,[],[['ねこは、いまのばしょから、右へ10歩動く。',0,8],['ねこはいまのばしょから、右へ10歩動く。',0,8]]],{targetId:'stage'}],
          ['ねこを見せる\n10歩動く。',['P201',1,[],[['ねこはすがたを見せる。',0,6]]],{targetId:'stage'}],['ねこを見せる\nああああ',['P201',1,[],[]],{targetId:'stage'}],
          ['ねこが右に動く',['P205',1,[],[['ねこは、いまのばしょから、右へ10歩動く。',0,7],['ねこはいまのばしょから、右へ10歩動く。',0,7]]],{targetId:'stage',bare:true}],
        ];
        for(const [source,expected,o]of rows)eq([source,near(source,o)],[source,expected]);
        // (a variable written is kept, and so is it where the look is written: 体力を見せる is not すがたを見せる)
        for(const source of ['体力を見せる','体力のすがたをかえる']){const texts=near(source)[3].map(c=>c[0]);ok(texts.length&&texts.every(t=>t.includes('体力')),source+' '+JSON.stringify(texts));}
      });
      // No near sentences in the meijin body or in a body over 4000 characters; a が written for を is the sentence with
      // を there when that reads; with no diagnostic given, the first of the body is used.
      test('ASSIST-PLACE meijin, long bodies, が for を and the first diagnostic',()=>{
        const far=[['「星」までのきょりを言う。',0,12]],up=[['自分の体力を1ふやす。',0,7],['体力を1ふやす。',0,7]];
        const rows=[
          ['「星」までのきょりが言う。',['P201',1,[],far]],['「星」までのきょりが言う。',['P201',1,[],[]],{meijin:true}],['体力をふやして',['P201',1,[],[]],{meijin:true}],['星にさわったら消える',['P205',1,[],[]],{meijin:true}],
          ['「星」までのきょりが言う。\nああああ',['P201',1,[],[]]],['持ち物を言う。\n「星」までのきょりが言う。',['P201',2,[],[['「星」までのきょりを言う。',8,20]]]],
          ['「星」までのきょりが言う。',['P201',1,[],far],{nodiag:true}],['体力をふやして',['P201',1,[],up],{nodiag:true}],
          ['星にさわったら消える',['P205',1,[],['「星」にふれたとき、\n  すがたをかくす。','もし「星」にふれていれば、\n  すがたをかくす。','「星」にふれるまで待つ。\nすがたをかくす。'].map(t=>[t,0,10])],{nodiag:true}],
        ];
        for(const [source,expected,o]of rows)eq([source,near(source,o)],[source,expected]);
        // (a body of exactly 4000 characters still gets them, one of 4001 does not)
        const long=(first,total)=>{const lines=[first];let length=first.length;while(total-length-1>263){lines.push('「'+'あ'.repeat(250)+'」と言う。');length+=257;}lines.push('「'+'あ'.repeat(total-length-7)+'」と言う。');return lines.join('\n');};
        for(const [first,texts]of [['体力をふやして',['自分の体力を1ふやす。','体力を1ふやす。']],['「星」までのきょりが言う。',['「星」までのきょりを言う。']]])
          for(const total of [4000,4001]){const body=long(first,total);eq([first,body.length,near(body)[3].map(c=>c[0])],[first,total,total>4000?[]:texts]);}
      });
      // A name of the work holds no condition word (たらこ, くまで, あるまで); a part named fills a part's place before the part
      // doing the sentence; something done until then is waited for and done once only beside the sentence doing it again
      // until then; a body that reads has no near sentences.
      test('ASSIST-PLACE names, parts named and sentences done until then',()=>{
        const named=()=>{const p=placeWorld();p.projectData.variables.push({id:'v-tara',name:'たらこ',initialValue:0},{id:'v-kuma',name:'くまで',initialValue:0});p.projectData.lists.push({id:'l-mare',name:'あるまで',initialValue:[]});validateDesignProject(p);return p;};
        const texts=(source,world=placeWorld,targetId='sprite-1')=>{const p=world(),target=p.components.find(c=>c.id===targetId);p.scripts[0].targetId=targetId;p.scripts[0].source=source;
          const verify={symbols:buildSymbols(p),targetId,targetType:target?.type||'stage',event:'start',args:[],level:'advanced'},trigger={...verify,key:'script:s1',ownerKey:'script:s1',id:'s1',scriptId:'s1'};
          const d=parseSyntax(source,{...trigger,symbols:buildSymbols(p),project:p}).syntaxDiagnostics[0];
          const had='performance' in globalThis,clock=globalThis.performance;globalThis.performance={now:()=>0};try{return Akari.assistCandidates(p,source,verify,d).map(c=>c.text);}finally{if(had)globalThis.performance=clock;else delete globalThis.performance;}};
        const stop=['この動きを止める。','ほかの動きを全部止める。','自分のほかの動きを止める。'];
        const rows=[
          ['たらこが10より大きければ止まる',stop.map(t=>'もしたらこが10より大きければ、\n  '+t),named],['たらこ、10歩動いて',['いまのばしょから、右へ10歩動く。','前へ10歩進む。'],named],
          ['くまでと言う',['【くまで】を言う。'],named],['あるまでを全部言う',['【あるまで】の中身を先頭から一つずつ見て、次のことを行う。\n  この中では、今見ているものを【これ】とよぶ。\n  これを1秒話す。'],named],
          ['星のところへ行って',['「星」のところへ行く。']],['ねこを星のところへ移動させる',['ねこは「星」のところへ行く。','「星」のところへ行く。']],
          ['ねこに星のコピーを作らせる',['ねこは「星」のコピーを作る。','「星」のコピーを作る。']],['ねこを星のところへ移動させる',['ねこは「星」のところへ行く。'],placeWorld,'stage'],
          ['ねこが消える',['ねこはすがたをかくす。'],placeWorld,'stage'],
          ['点数が10になるまで点数を1ふやす',['点数が10になるまで、くり返す。\n  点数を1ふやす。','点数が10になるまで待つ。\n点数を1ふやす。']],
          ['星にふれるまで10歩動く',['「星」にふれるまで、くり返す。\n  前へ10歩進む。','「星」にふれるまで待つ。\n前へ10歩進む。']],
          ['ねこを10歩動かす',[],placeWorld,'stage'],['10歩動く。',[]],
        ];
        for(const [source,expected,world,targetId]of rows)eq([source,texts(source,world,targetId)],[source,expected]);
      });
      // A list said in full keeps the seconds written and is found inside a block too; in the body of a calculation nothing
      // that changes a variable or moves is offered, in the body of a procedure its argument is used; a heading is not
      // offered in the stage's body after an empty line either.
      test('ASSIST-PLACE seconds, blocks, definitions and an empty first line',()=>{
        const world=()=>{const p=placeWorld();p.functions=[{id:'f1',ownerId:'stage',name:'けいさん',args:['値'],source:'0を答えとして返す。'}];p.actions=[{id:'a1',ownerId:'stage',name:'ジャンプ',args:['高さ'],source:'何もしない。'}];validateDesignProject(p);return p;};
        const at=(source,o={})=>{const p=world(),targetId=o.targetId||'sprite-1',target=p.components.find(c=>c.id===targetId);let verify;
          if(o.def){const def=(o.def==='function'?p.functions:p.actions)[0];def.source=source;verify={symbols:buildSymbols(p),event:null,targetId:null,targetType:null,definitionKind:o.def,args:def.args,definition:def,draft:true,level:'advanced'};}
          else{p.scripts[0].targetId=targetId;p.scripts[0].source=source;verify={symbols:buildSymbols(p),targetId,targetType:target?.type||'stage',event:'start',args:[],level:'advanced'};}
          const key=o.def?(o.def==='function'?'function:f1':'action:a1'):'script:s1',d=parseSyntax(source,{...verify,key,ownerKey:key,id:'s1',scriptId:'s1',symbols:buildSymbols(p),project:p}).syntaxDiagnostics[0];
          const had='performance' in globalThis,clock=globalThis.performance;globalThis.performance={now:()=>0};try{return [d.code,Array.from(d.proposals||[],r=>r.source),Akari.assistCandidates(p,source,verify,d).map(c=>c.text)];}finally{if(had)globalThis.performance=clock;else delete globalThis.performance;}};
        const each=s=>'持ち物の中身を先頭から一つずつ見て、次のことを行う。\n  この中では、今見ているものを【これ】とよぶ。\n  これを'+s+'秒話す。';
        eq(at('持ち物を全部2秒ずつ言う')[2][0],each(2));eq(at('持ち物を一つずつ3秒ずつ言う')[2][0],each(3));eq(at('ずっとくり返す。\n  持ち物を一つずつ言う')[2],[each(1)]);
        const rows=[
          ['\n星にふれたら点数を1ふやす\nああああ',['P205',[],[]],{targetId:'stage'}],
          ['点数をふやして',['P201',[],[]],{def:'function'}],['10歩動いて',['P205',[],[]],{def:'function'}],['値を答えにして返す',['P201',[],['値を答えとして返す。']],{def:'function'}],
          ['高さをふやして',['P201',[],['高さを1ふやす。']],{def:'action'}],['10歩動いて',['P205',['前へ10歩進む'],[]],{def:'action'}],
        ];
        for(const [source,expected,o]of rows)eq([source,o,at(source,o)],[source,o,expected]);
      });
      // In the stage's body after another line, and in a block, the near sentences are found where they are written; a
      // sentence after them that the near sentence's subject would carry on to gets its own.
      test('ASSIST-PLACE near sentences after another line and in a block',()=>{
        const st={targetId:'stage'},hide='ねこはすがたをかくす。\n星はすがたをかくす。',move=n=>n+'は、いまのばしょから、右へ10歩動く。',rows=[
          ['「やあ」と言う。\nねこと星をかくす',['P201',2,[],[[hide,9,17]]],st],['「やあ」と言う。\nねこを見せる',['P201',2,[],[['ねこはすがたを見せる。',9,15]]],st],
          ['「やあ」と言う。\nねこを右に動かす',['P205',2,[],[[move('ねこ'),9,17],['ねこはいまのばしょから、右へ10歩動く。',9,17]]],st],
          ['「やあ」と言う。\nねこと星が右に動く',['P205',2,[],[[move('ねこ')+'\n'+move('星'),9,18]]],st],
          ['ねこと星をかくす\n「やあ」と言う。',['P201',1,[],[[hide+'\n自分は「やあ」と言う。',0,17]]],st],['ねこを見せる\n「やあ」と言う。',['P201',1,[],[['ねこはすがたを見せる。',0,6]]],st],
          ['もし点数が5なら、\n  「星」までのきょりが言う。',['P201',2,[],[['「星」までのきょりを言う。',12,24]]]],['ずっとくり返す。\n  「星」までのきょりが言う。',['P201',2,[],[['「星」までのきょりを言う。',11,23]]]],
          ['もし点数が5なら、\n  点数をふやして\n  10歩動く。',['P201',2,[],[['点数を1ふやす。',12,19]]]],
        ];
        for(const [source,expected,o]of rows)eq([source,near(source,o)],[source,expected]);
      });
      // A sound played on and on is played in a loop, or started (the example ASSIST-353 of the assist cases).
      test('ASSIST-PLACE a sound written to go on',()=>{
        const p=placeWorld();p.sounds=[{id:'snd-0',name:'ベル',assetId:'snd-asset-0'}];validateDesignProject(p);const source='「ベル」を鳴らし続ける。';p.scripts[0].source=source;
        const verify={symbols:buildSymbols(p),targetId:'sprite-1',targetType:'sprite',event:'start',args:[],level:'advanced'},d=parseSyntax(source,{...verify,key:'script:s1',ownerKey:'script:s1',id:'s1',scriptId:'s1',project:p}).syntaxDiagnostics[0];
        const had='performance' in globalThis,clock=globalThis.performance;globalThis.performance={now:()=>0};let texts;try{texts=Akari.assistCandidates(p,source,verify,d).map(c=>c.text);}finally{if(had)globalThis.performance=clock;else delete globalThis.performance;}
        eq([d.code,texts.slice(0,2)],['P201',['ずっとくり返す。\n  「ベル」を鳴らす。','「ベル」を鳴らし始める。']]);
      });
      // A key written as a condition with とき is offered as a condition and as a heading (the example ASSIST-596).
      test('ASSIST-PLACE a key written with とき keeps the condition or the heading',()=>{
        // (a sentence read after the line before it: the wait for the signal just sent, the example ASSIST-836)
        eq(near('「出発」の合図を送る。\nその合図で始まったことが全部終わるのを待つ。')[3].map(c=>c[0]),['その合図で始まったことが全部終わるまで待つ。']);
        eq(near('もし「スペース」キーがおされたとき、\n  何もしない。'),['P201',1,[],[['もし「スペース」キーがおされていれば、',0,18],['「スペース」キーをおすたびに、',0,18]]]);
      });
      // LANGUAGE.md 近い書き方: a condition written with とき is kept only by a sentence that keeps it. 点数が10 is a condition
      // of its own, kept by もし点数が10なら、 and by no heading; with nothing that keeps it nothing is shown. スタートした is
      // the event itself, kept by its heading (the examples ASSIST-838 to 842).
      test('ASSIST-PLACE a condition written with とき is not dropped for a heading',()=>{
        eq(near('点数が10のとき'),['P201',1,[],[]]);eq(near('点数が10のとき、'),['P201',1,[],[]]);
        eq(near('点数が10のとき、\n  止まる'),['P201',1,[],[['もし点数が10なら、',0,9]]]);
        eq(near('スタートしたとき、\n  前へ10歩進む。'),['P201',1,[],[['作品を動かしたとき、',0,9]]]);
      });
    }
    {
      // The kept end of a text at the edges of the surrogate ranges, and how the scheduler cuts, stops and asks.
      test('the kept end of a record drops a cut pair at the edges of the surrogate ranges', () => {
        const tail = Akari.diagnostics.tailText;
        eq([tail('𐀀', 1), tail('􏿿', 1), tail('a𐀀', 1), tail('😀あ', 2)], ['', '', '', 'あ']);
        eq([tail('\udc00\udc00', 1), tail('퟿\udc00', 1), tail('\ud800', 1), tail('\ud800\udbff', 1)], ['\udc00', '\udc00', '', '\udbff']);
      });
      const askingRun = (p, until) => {
        const compiled = compileProject(p); eq(compiled.errors, []);
        let now = 0;
        const log = [], r = new RuntimeModel(p, {}), name = id => p.components.find(c => c.id === r.actor(id)?.baseId)?.name || id;
        const q = new EventScheduler(p, compiled, r, { say: (id, text) => log.push(`${now}:${name(id)}:${text}`), ask: question => log.push(`${now}:ask:${question}`), closeQuestion: () => log.push(`${now}:close`) });
        r.now = () => now; q.schedule = () => {};
        try {
          q.start();
          for (let step = 0; step <= until / 10; step++) { for (let i = 0; i < 500 && q.ready.length; i++) q.runTurn(); q.recheckBlocked(); now += 10; }
          return { log, errors: q.errorRecords.map(e => e.code + '@' + e.line), x: Math.round(r.actor('core-cat').x), scheduler: q };
        } finally { q.stop(); }
      };
      // A lane started inside a lane reads the names its flow reads (here the item of the loop around both).
      test('meijin a lane inside a lane reads the name of the loop around them', () => {
        const out = meijinRun('持ち物の各要素を品として、くり返す。\n  次のことを同時に始める。\n    次のことを同時に始める。\n      ねこは品を言う。\n    犬は「x」と言う。', { until: 100 });
        eq([out.errors, out.speech.map(s => s.replace(/^\d+:/, '')).sort()], [[], ['ねこ:ぼうし', 'ねこ:本', '犬:x', '犬:x']]);
      });
      // A made block cut by 〜の動きを止める while it asks: its question closes and the next question waiting is shown.
      test('meijin a cut made block closes its question and shows the next one', () => {
        const out = askingRun(meijinWork('【聞く】という手順を、次のように作る。\n  「名前は？」と聞いて待つ。\n  「手順おわり」と言う。\nねこは【聞く】という手順を行う。\n作品を動かしたとき、\n  0.5秒待つ。\n  ねこの動きを止める。',
          { extra: [{ id: 'core-dog-ask', targetId: 'core-dog', event: 'start', source: '0.1秒待つ。\n「色は？」と聞いて待つ。' }] }), 1000);
        eq([out.log, out.errors], [['0:ask:名前は？', '510:close', '510:ask:色は？', '1010:close'], []]);
      });
      // 「1つずつ 動かす」 lets the flows waiting for the next こま go in the order they were made, as running does.
      test('stepping lets the flows waiting for the next frame go in the order they were made', () => {
        const p = laneProject(['点数']);
        p.scripts = [{ id: 'core-step-a', targetId: 'core-cat', event: 'start', source: '0.01秒待つ。\nずっとくり返す。\n  いまのばしょから、右へ1歩動く。\n  「a」と言う。' },
          { id: 'core-step-b', targetId: 'core-dog', event: 'start', source: 'ずっとくり返す。\n  いまのばしょから、右へ1歩動く。\n  「b」と言う。' }];
        const compiled = compileProject(p); eq(compiled.errors, []);
        let now = 0; const said = [], r = new RuntimeModel(p, {}), q = new EventScheduler(p, compiled, r, { say: (id, text) => said.push(now + ':' + text) });
        r.now = () => now; q.schedule = () => {};
        try {
          q.start();
          for (let step = 0; step < 3; step++) { for (let i = 0; i < 500 && q.ready.length; i++) q.runTurn(); q.recheckBlocked(); now += 10; }
          q.pause(); for (let i = 0; i < 4; i++) q.stepOne();
        } finally { q.stop(); }
        eq(said, ['0:b', '20:b', '20:a', '30:a', '30:b']);
      });
      // Flows whose waits end within one step of the clock go on in the order their waits end, those ending together in
      // the order they were made.
      test('flows whose waits end within one step go on in the order the waits end', () => {
        const p = laneProject(['点数']);
        p.scripts = [{ id: 'core-due-a', targetId: 'core-cat', event: 'start', source: '0.02秒待つ。\n「a」と言う。' }, { id: 'core-due-b', targetId: 'core-dog', event: 'start', source: '0.01秒待つ。\n「b」と言う。' },
          { id: 'core-due-c', targetId: 'core-bird', event: 'start', source: '0.02秒待つ。\n「c」と言う。' }];
        const compiled = compileProject(p); eq(compiled.errors, []);
        let now = 0; const said = [], r = new RuntimeModel(p, {}), q = new EventScheduler(p, compiled, r, { say: (id, text) => said.push(now + ':' + text) });
        r.now = () => now; q.schedule = () => {};
        try { q.start(); for (let step = 0; step < 4; step++) { for (let i = 0; i < 500 && q.ready.length; i++) q.runTurn(); q.recheckBlocked(); now += 30; } } finally { q.stop(); }
        eq(said, ['60:b', '60:a', '60:c']);
      });
      // An answer given with no question shown changes nothing.
      test('an answer with no question shown is ignored', () => {
        const p = laneProject(['点数']); p.scripts = [{ id: 'core-no-question', targetId: 'core-cat', event: 'start', source: '「a」と言う。' }];
        const compiled = compileProject(p); eq(compiled.errors, []);
        const said = [], r = new RuntimeModel(p, {}), q = new EventScheduler(p, compiled, r, { say: (id, text) => said.push(text) });
        r.now = () => 0; q.schedule = () => {};
        try { q.start(); q.runTurn(); q.answerQuestion('こたえ'); eq([said, q.activeQuestion, q.errorRecords], [['a'], null, []]); } finally { q.stop(); }
      });
      // LANGUAGE.md: a continuous rule stopped by ほかの動きを全部止める does not start again until its condition has failed once.
      test('stopping the others stops a continuous rule that moves', () => {
        const rule = { id: 'core-rule', targetId: 'core-cat', event: 'start', source: '点数が1より小さいあいだ、右へ1秒に100歩の速さで動き続ける。' };
        const plain = laneProject(['点数']); plain.scripts = [rule, { id: 'core-stopper', targetId: 'core-dog', event: 'start', source: '0.5秒待つ。\nほかの動きを全部止める。' }];
        const lanes = meijinWork('次のことを同時に始める。\n  ねこは「a」と言う。\n  犬は0.5秒待って、ほかの動きを全部止める。'); lanes.scripts.push(rule);
        const alone = laneProject(['点数']); alone.scripts = [rule];
        eq([askingRun(plain, 1000).x, askingRun(lanes, 1000).x, askingRun(alone, 1000).x], [51, 51, 100]);
      });
      // LANGUAGE.md: 〜の動きを止める and 自分のほかの動きを止める stop the part's continuous rules too.
      test('stopping a part stops its continuous rule that moves', () => {
        const rule = { id: 'core-rule', targetId: 'core-cat', event: 'start', source: '点数が1より小さいあいだ、右へ1秒に100歩の速さで動き続ける。' };
        const named = meijinWork('0.5秒待つ。\nねこの動きを止める。'); named.scripts.push(rule);
        const own = laneProject(['点数']); own.scripts = [rule, { id: 'core-own', targetId: 'core-cat', event: 'start', source: '0.5秒待つ。\n自分のほかの動きを止める。' }];
        eq([askingRun(named, 1000).x, askingRun(own, 1000).x], [51, 51]);
      });
      // A move for a time ends at the clock step that reaches its time: the next sentence runs at the turn after it.
      test('meijin a move for a time ends at the step that reaches its time', () => {
        const out = meijinRun('1秒のあいだ、ねこは1秒に50歩の速さで右へ動き続ける。\nねこは「着いた」と言う。\n点数を、ねこのよこのばしょにする。', { until: 1500 });
        eq([out.speech, out.vars.点数, out.errors], [['1010:ねこ:着いた'], 50, []]);
      });
      // A move until a condition that holds already, or for 0 seconds, does not move: the next sentence runs at once.
      test('meijin a move that has nothing to do does not move', () => {
        const out = meijinRun('ねこは、1秒に100歩の速さで、点数が0になるまで右へ動き続ける。\nねこは「a」と言う。\n0秒のあいだ、犬は1秒に100歩の速さで右へ動き続ける。\n犬は「b」と言う。\n点数を、ねこのよこのばしょにする。\n合計を、犬のよこのばしょにする。', { until: 100 });
        eq([out.speech, out.vars.点数, out.vars.合計, out.errors], [['0:ねこ:a', '0:犬:b'], 0, 200, []]);
      });
      // LANGUAGE.md こまの数え方, on a clock of 1 ms steps: a turn that changed the screen and did not wait goes on at the
      // next こま (16.7 ms, here the step at 18 ms). A wait in which no time passed is no wait, nor is the wait for the
      // flow's own lanes; a loop ended by このくり返しを終える waits for the こま as one that ends by itself.
      test('a loop turn that changed the screen waits for the next frame unless it waited', () => {
        const saidAt = p => {
          const compiled = compileProject(p); eq(compiled.errors, []);
          let now = 0; const said = [], r = new RuntimeModel(p, {}), q = new EventScheduler(p, compiled, r, { say: (id, text) => said.push(now + ':' + text) });
          r.now = () => now; q.schedule = () => {};
          try { q.start(); for (let ms = 0; ms < 200; ms++) { for (let i = 0; i < 100 && q.ready.length; i++) q.runTurn(); q.recheckBlocked(); now += 1; } return said; } finally { q.stop(); }
        };
        const plainAt = (source, extra = []) => { const p = laneProject(['点数']); p.scripts = [{ id: 'core-pace', targetId: 'core-cat', event: 'start', source }, ...extra]; return saidAt(p); };
        eq(plainAt('1回くり返す。\n  いまのばしょから、右へ10歩動く。\n「a」と言う。'), ['18:a']);
        eq(plainAt('2回くり返す。\n  いまのばしょから、右へ10歩動く。\n「a」と言う。'), ['35:a']);
        eq(plainAt('ずっとくり返す。\n  いまのばしょから、右へ10歩動く。\n  このくり返しを終える。\n「a」と言う。'), ['18:a']);
        eq(plainAt('1回くり返す。\n  いまのばしょから、右へ10歩動く。\n  「計算」の合図を送って、その合図で始まったことが全部終わるまで待つ。\n「a」と言う。',
          [{ id: 'core-signal', targetId: 'core-dog', event: 'message', filter: { message: '計算' }, source: '点数を1ふやす。' }]), ['18:a']);
        eq(saidAt(meijinWork('1回くり返す。\n  次のことを同時に始める。\n    2回くり返す。\n      犬はいまのばしょから、右へ10歩動く。\n    鳥は「x」と言う。\n  ねこはいまのばしょから、右へ10歩動く。\nねこは「a」と言う。')), ['0:x', '51:a']);
      });
      // Under a profile of its own limits, a value or a condition that calls a made block is calculated a step at a time
      // before the sentence runs: the run gives what the standard limits give, and no sentence run still calls the block.
      const standardRuntime = Akari.createAkariRuntime(),
        profileRuntime = Akari.createAkariRuntime({ profiles: [{ id: 'core.more-steps', version: '1.0.0', limits: { functionOps: 200000 } }], profile: { id: 'core.more-steps', version: '1.0.0' } });
      const profileRun = (R, source, functions, until) => {
        const p = meijinWork(source); p.functions = functions;
        const compiled = compileProject(p); eq(compiled.errors, []);
        let now = 0; const said = [], left = [], r = new R.RuntimeModel(p, {}), name = id => p.components.find(c => c.id === r.actor(id)?.baseId)?.name || id;
        const q = new R.EventScheduler(p, compiled, r, { say: (id, text) => said.push(now + ':' + name(id) + ':' + text) }); r.now = () => now; q.schedule = () => {};
        const calls = v => Array.isArray(v) ? v.some(calls) : !!v && typeof v === 'object' && (v.kind === 'UserFunctionCall' || Object.entries(v).some(([k, x]) => !['body', 'thenBody', 'elseBody', 'lanes'].includes(k) && calls(x)));
        const execute = q.executePreparedNode.bind(q); q.executePreparedNode = (t, n, o) => { if (calls(n)) left.push(n.kind); return execute(t, n, o); };
        try {
          q.start();
          for (let step = 0; step <= until / 10; step++) { for (let i = 0; i < 500 && q.ready.length; i++) q.runTurn(); q.recheckBlocked(); now += 10; }
          return { said, x: ['core-cat', 'core-dog', 'core-bird'].map(id => Math.round(r.actor(id).x)), score: r.projectVars.get('点数')?.magnitude ?? r.projectVars.get('点数'), errors: q.errorRecords.map(e => e.code + '@' + e.line), left: [...new Set(left)].sort() };
        } finally { q.stop(); }
      };
      const double = [{ id: 'core-double', ownerId: 'stage', name: '二倍', args: ['値'], source: '値×2を答えとして返す。' }];
      test('under a profile of its own limits, sentences, loops and watches that call a made block run as under the standard limits', () => {
        const source = '鳥はいまのばしょから、右へ（【二倍】（10））歩、上へ0歩動く。\n犬は、1秒に（【二倍】（100））歩の速さで、ねこにふれるまで左へ動き続ける。\n【二倍】（点数）が6より小さいあいだ、くり返す。\n  点数を1ふやす。\nねこは「おわり」と言う。\n【二倍】（点数）が4以上になったとき、鳥は「やった」と言う。';
        const standard = profileRun(standardRuntime, source, double, 2000), own = profileRun(profileRuntime, source, double, 2000);
        eq(standard, { said: ['810:鳥:やった', '810:ねこ:おわり'], x: [0, 40, 420], score: 3, errors: [], left: ['MotionCommand', 'MoveUntil', 'RepeatWhile'] });
        eq(own, { ...standard, left: [] });
      });
      // (with a clock that each look at it moves on 100 ms, a calculation of 200 turns takes more than one step under the profile)
      test('under a profile of its own limits, a long calculation in a condition gives what the standard limits give', () => {
        const slow = [{ id: 'core-slow', ownerId: 'stage', name: 'ゆっくり', args: ['値'], source: 'この中だけで使う変数【数】を作り、最初は0にする。\n200回くり返す。\n  【数】を1ふやす。\n値を答えとして返す。' }];
        const stepped = f => { const clock = globalThis.performance; let t = 0; globalThis.performance = { now: () => (t += 100) }; try { return f(); } finally { if (clock === undefined) delete globalThis.performance; else globalThis.performance = clock; } };
        const what = (R, source) => { const out = stepped(() => profileRun(R, source, slow, 1000)); return [out.said.map(s => s.replace(/^\d+:/, '')), out.score, out.errors]; };
        for (const [source, expected] of [
          ['【ゆっくり】（点数）が0になるまでくり返す。\n  ねこは「中」と言う。\nねこは「おわり」と言う。', [['ねこ:おわり'], 0, []]],
          ['【ゆっくり】（点数）が1になるまでくり返す。\n  点数を1ふやす。\n  ねこは点数を言う。\nねこは「おわり」と言う。', [['ねこ:1', 'ねこ:おわり'], 1, []]],
          ['【ゆっくり】（点数）が0より大きくなるまで待つ。\nねこは「おわり」と言う。\n作品を動かしたとき、\n  0.1秒待つ。\n  点数を1にする。', [['ねこ:おわり'], 1, []]],
          ['ねこは、1秒に100歩の速さで、【ゆっくり】（点数）が1になるまで右へ動き続ける。\nねこは「ついた」と言う。\n作品を動かしたとき、\n  0.5秒待つ。\n  点数を1にする。', [['ねこ:ついた'], 1, []]],
          ['ねこは、1秒に100歩の速さで、【ゆっくり】（点数）が0になるまで右へ動き続ける。\nねこは「ついた」と言う。\n点数を、ねこのよこのばしょにする。', [['ねこ:ついた'], 0, []]],
          ['【ゆっくり】（点数）が1になったとき、ねこは「なった」と言う。\n0.2秒待つ。\n点数を1にする。', [['ねこ:なった'], 1, []]],
        ]) {
          eq([what(standardRuntime, source), what(profileRuntime, source)], [expected, expected]);
          // (under the standard limits the calculation is read at once: the run is the same whatever the clock says)
          eq(stepped(() => profileRun(standardRuntime, source, slow, 1000)), profileRun(standardRuntime, source, slow, 1000));
        }
      });
      // A program whose subject is read from a value that calls a made block (the value of 合計 put as the subject of
      // the sentence after it): under a profile of its own limits the subject is calculated before the sentence runs.
      test('under a profile of its own limits, a subject read from a value that calls a made block is calculated first', () => {
        const run = R => {
          const p = meijinWork('主役を犬にする。\n合計を（【選ぶ】（1））にする。\n主役は「やあ」と言う。');
          p.functions = [{ id: 'core-pick', ownerId: 'stage', name: '選ぶ', args: ['値'], source: '主役を答えとして返す。' }];
          const compiled = compileProject(p); eq(compiled.errors, []);
          const body = compiled.astByKey.get('script:core-meijin').body; body[2].actorRef = { kind: 'value', value: body[1].value };
          let now = 0; const said = [], left = [], r = new R.RuntimeModel(p, {}), name = id => p.components.find(c => c.id === r.actor(id)?.baseId)?.name || id;
          const q = new R.EventScheduler(p, compiled, r, { say: (id, text) => said.push(now + ':' + name(id) + ':' + text) }); r.now = () => now; q.schedule = () => {};
          const execute = q.executePreparedNode.bind(q); q.executePreparedNode = (t, n, o) => { if (n.actorRef?.kind === 'value' && n.actorRef.value.kind === 'UserFunctionCall') left.push(n.kind); return execute(t, n, o); };
          try { q.start(); for (let step = 0; step < 10; step++) { for (let i = 0; i < 500 && q.ready.length; i++) q.runTurn(); q.recheckBlocked(); now += 10; } return [said, q.errorRecords, left]; } finally { q.stop(); }
        };
        eq([run(standardRuntime), run(profileRuntime)], [[['0:犬:やあ'], [], ['Say']], [['0:犬:やあ'], [], []]]);
      });
      test('under a profile of its own limits, a procedure is given the answer of a made block written as its value', () => {
        const run = R => {
          const p = laneProject(['点数'], [{ id: 'core-say', ownerId: 'stage', name: '言わせる', args: ['数'], source: '数を言う。' }]);
          p.functions = double; p.scripts = [{ id: 'core-call', targetId: 'core-cat', event: 'start', source: '【言わせる】（【二倍】（4））を実行する。' }];
          const compiled = compileProject(p); eq(compiled.errors, []);
          let now = 0; const said = [], r = new R.RuntimeModel(p, {}), q = new R.EventScheduler(p, compiled, r, { say: (id, text) => said.push(now + ':' + text) }); r.now = () => now; q.schedule = () => {};
          try { q.start(); for (let step = 0; step < 10; step++) { for (let i = 0; i < 500 && q.ready.length; i++) q.runTurn(); q.recheckBlocked(); now += 10; } return [said, q.errorRecords]; } finally { q.stop(); }
        };
        eq([run(standardRuntime), run(profileRuntime)], [[['0:8'], []], [['0:8'], []]]);
      });
      // A list item replaced at the last place under a profile of its own limits, and one past it.
      test('under a profile of its own limits, a made block replaces the last item of its own list', () => {
        const run = (R, index) => {
          const fn = [{ id: 'core-replace', ownerId: 'stage', name: 'かえる', args: ['値'], source: 'この中だけで使うリスト【L】を空で作る。\n【L】の最後に1を入れる。\n【L】の最後に2を入れる。\n【L】の' + index + '番目を9にかえる。\n【L】の2番目を答えとして返す。' }];
          const out = profileRun(R, 'ねこは（【かえる】（1））を言う。', fn, 50); return [out.said, out.errors];
        };
        eq([run(standardRuntime, 2), run(profileRuntime, 2)], [[['0:ねこ:9'], []], [['0:ねこ:9'], []]]);
        eq([run(standardRuntime, 3)[1], run(profileRuntime, 3)[1]], [['R404@4'], ['R404@4']]);
      });
      // 〜のうち、…にいちばん近いもの: the part named after に is not one of those compared.
      test('meijin the nearest to a part is another part', () => {
        const out = meijinRun('なかまを、ねこと犬と鳥にする。\nなかまのうち、ねこにいちばん近いものは「近い」と言う。\n犬と鳥のうち、鳥にいちばん近いものは「となり」と言う。', { until: 50 });
        eq([out.speech, out.errors], [['0:犬:近い', '0:犬:となり'], []]);
      });
      // An extension session needs AbortController: where the page has none (the node run of this suite), a stand-in with
      // what the host uses (signal.aborted, signal.reason, add/removeEventListener of 'abort', abort()) is put in for the test.
      const withAbortController = f => {
        if (typeof AbortController === 'function') return f();
        class StandInSignal {
          constructor() { this.aborted = false; this.reason = undefined; this.listeners = []; }
          addEventListener(type, listener, options) { if (type === 'abort') this.listeners.push({ listener, once: !!options?.once }); }
          removeEventListener(type, listener) { this.listeners = this.listeners.filter(x => x.listener !== listener); }
        }
        class StandInController {
          constructor() { this.signal = new StandInSignal(); }
          abort(reason) { const s = this.signal; if (s.aborted) return; s.aborted = true; s.reason = reason; const all = s.listeners; s.listeners = all.filter(x => !x.once); for (const x of all) x.listener(); }
        }
        globalThis.AbortController = StandInController;
        try { return f(); } finally { delete globalThis.AbortController; }
      };
      // A run with an extension whose event the work receives (「拡張:core.signals/ping」という合図を受けたとき): the scheduler,
      // the extension's api to send the event, and the receiving bodies (sources on ねこ, 犬, 鳥…) after a body of ねこ.
      const signalRun = (main, receivers, limits) => {
        const contract = Akari.EXECUTABLE_CONTRACT, standard = { languageContractId: contract.languageContractId, runtimeContractId: contract.runtimeContractId };
        const manifest = { id: 'core.signals', name: '合図の拡張', version: '1.0.0', apiContract: 1, standard, description: '試験', dependencies: [], capabilities: [], offline: true, selfContained: true,
          state: { formatVersion: 1, initial: null }, commands: [], calculations: [], events: [{ id: 'ping', name: '合図', description: '試験', payload: { type: 'number', unit: null } }] };
        let api = null;
        const R = Akari.createAkariRuntime({ extensions: [{ manifest, factory: given => { api = given; return { commands: {}, calculations: {} }; } }],
          ...(limits ? { profiles: [{ id: 'core.signal-limits', version: '1.0.0', limits }], profile: { id: 'core.signal-limits', version: '1.0.0' } } : {}) });
        const p = laneProject(['点数']), ids = ['core-cat', 'core-dog', 'core-bird'];
        p.scripts = [{ id: 'core-signal-main', targetId: 'core-cat', event: 'start', source: main }];
        receivers.forEach((source, i) => { const script = { id: 'core-signal-receive-' + i, targetId: ids[i % 3], event: 'start', source: '' }; p.scripts.push(script);
          Akari.updateScriptSource(script, '「拡張:core.signals/ping」という合図を受けたとき、\n' + source.split('\n').map(line => '  ' + line).join('\n'), p); });
        const compiled = compileProject(p); eq(compiled.errors, []);
        const said = [], q = new R.EventScheduler(p, compiled, new R.RuntimeModel(p, {}), { say: (id, text) => said.push(id + ':' + text) }); q.schedule = () => {};
        return { q, said, emit: value => api.emit('ping', value), R };
      };
      test('meijin a signal from an extension starts the body that receives it', () => withAbortController(() => {
        const { q, said, emit } = signalRun('ずっとくり返す。\n  1秒待つ。', ['「受けた」と言う。']);
        try {
          q.start(); while (q.ready.length) q.runTurn(); eq(said, []);
          emit(1); eq(said, []); q.recheckBlocked(); while (q.ready.length) q.runTurn();
          eq([said, q.errorRecords], [['core-cat:受けた'], []]);
        } finally { q.stop(); }
      }));
      // With every task in use, the receiving body's R413 ends the first flow of the run (the main body of ねこ), not thrown
      // out of the scheduler.
      test('a signal from an extension with the tasks full ends the first flow with R413', () => withAbortController(() => {
        const full = signalRun('ずっとくり返す。\n  1秒待つ。', ['ずっとくり返す。\n  1秒待つ。'], { activeTasks: 3 });
        try {
          full.q.start(); while (full.q.ready.length) full.q.runTurn();
          for (let i = 0; i < 3; i++) full.emit(i);
          let escaped = null;
          try { full.q.recheckBlocked(); while (full.q.ready.length && full.q.runTurn()); } catch (error) { escaped = error.code || String(error); }
          eq([escaped, full.q.errorRecords.map(e => [e.code, e.key, e.line])], [null, [['R413', 'script:core-signal-main', 2]]]);
        } finally { full.q.stop(); }
      }));
      // Under a profile of its own limits a long calculation does not hold the run: it is worked on for at most 8 ms at a
      // time (a yield every 128 calculation turns), and the scheduler goes on with its steps in between. With a clock that
      // each look at it moves on 100 ms, every look ends a slice: what each flow says, and when, is fixed by those budgets.
      test('under a profile of its own limits, a long calculation is worked on a slice at a time between steps', () => {
        const slow = [{ id: 'core-slow', ownerId: 'stage', name: 'ゆっくり', args: ['値'], source: 'この中だけで使う変数【数】を作り、最初は0にする。\n200回くり返す。\n  【数】を1ふやす。\n値を答えとして返す。' }, { id: 'core-short', ownerId: 'stage', name: '少し', args: ['値'], source: 'この中だけで使う変数【数】を作り、最初は0にする。\n39回くり返す。\n  【数】を1ふやす。\n値を答えとして返す。' }];
        const stepped = f => { const clock = globalThis.performance; let t = 0; globalThis.performance = { now: () => (t += 100) }; try { return f(); } finally { if (clock === undefined) delete globalThis.performance; else globalThis.performance = clock; } };
        const timeline = source => { const out = stepped(() => profileRun(profileRuntime, source, slow, 1000)); return [out.said, out.score, out.x[0]]; };
        const sources = [
          '【少し】（点数）が0より大きくなるまで待つ。\nねこは「おわり」と言う。\n作品を動かしたとき、\n  0.1秒待つ。\n  点数を1にする。',
          '【ゆっくり】（点数）が0になるまでくり返す。\n  ねこは「中」と言う。\nねこは「おわり」と言う。',
          '【ゆっくり】（点数）が1になるまでくり返す。\n  点数を1ふやす。\n  ねこは点数を言う。\nねこは「おわり」と言う。',
          '【ゆっくり】（点数）が0より大きくなるまで待つ。\nねこは「おわり」と言う。\n作品を動かしたとき、\n  0.1秒待つ。\n  点数を1にする。',
          'ねこは、1秒に100歩の速さで、【ゆっくり】（点数）が1になるまで右へ動き続ける。\nねこは「ついた」と言う。\n作品を動かしたとき、\n  0.5秒待つ。\n  点数を1にする。',
          '【ゆっくり】（点数）が1になったとき、ねこは「なった」と言う。\n0.2秒待つ。\n点数を1にする。',
          '【ゆっくり】（点数）が0になるまで待つ。\nねこは「おわり」と言う。',
          'ねこは、1秒に100歩の速さで、【ゆっくり】（点数）が0になるまで右へ動き続ける。\nねこは「ついた」と言う。',
          '【ゆっくり】（点数）が3より小さいあいだ、くり返す。\n  点数を1ふやす。\n  ねこは点数を言う。\nねこは「おわり」と言う。\n作品を動かしたとき、\n  ずっとくり返す。\n    0.05秒待つ。\n    犬は「t」と言う。',
        ];
        eq(sources.map(timeline), [
          [['110:ねこ:おわり'], 1, 0],
          [['40:ねこ:おわり'], 0, 0],
          [['40:ねこ:1', '100:ねこ:おわり'], 1, 0],
          [['150:ねこ:おわり'], 1, 0],
          [['600:ねこ:ついた'], 1, 57],
          [['260:ねこ:なった'], 1, 0],
          [['40:ねこ:おわり'], 0, 0],
          [['40:ねこ:ついた'], 0, 0],
          [['0:ねこ:1', '60:犬:t', '60:ねこ:2', '100:ねこ:3', '120:犬:t', '120:ねこ:おわり', '180:犬:t', '240:犬:t', '300:犬:t', '360:犬:t', '420:犬:t', '480:犬:t', '540:犬:t', '600:犬:t', '660:犬:t', '720:犬:t', '780:犬:t', '840:犬:t', '900:犬:t', '960:犬:t'], 3, 0],
        ]);
      });
      // A count to wait for (〜が（…）回おされるまで) that calls a made block keeps its count bound under a profile of its own
      // limits as under the standard limits: the loop goes on until the part is pressed that many times.
      test('under a profile of its own limits, a count condition that calls a made block repeats as under the standard limits', () => {
        const source = 'ねこが（【二倍】（1））回おされるまでくり返す。\n  点数を1ふやす。\n  0.01秒待つ。';
        const standard = profileRun(standardRuntime, source, double, 300), own = profileRun(profileRuntime, source, double, 300);
        eq([standard.said, standard.score, standard.errors], [[], 16, []]);
        eq({ ...own, left: [] }, { ...standard, left: [] });
      });
      // A continuous rule whose condition fails (a division by 0 when ねこ reaches よこ 2) pauses the run at that clock step;
      // a touch that begins at that same step (犬 at よこ 182: their edges meet at 92) starts no body while it is paused.
      test('a run paused by a mistake of a continuous rule starts no touch body at that step', () => {
        const p = laneProject(['点数']);
        p.components.find(c => c.id === 'core-dog').x = 182;
        p.scripts = [{ id: 'core-rule-fail', targetId: 'core-cat', event: 'start', source: '100÷（よこのばしょ−2歩）の数だけが−1000より大きいあいだ、右へ1秒に60歩の速さで動き続ける。' },
          { id: 'core-rule-other', targetId: 'core-bird', event: 'start', source: '点数が1より小さいあいだ、上へ1秒に60歩の速さで動き続ける。' },
          { id: 'core-touch', targetId: 'core-dog', event: 'touchStart', filter: { target: 'ねこ' }, source: '「ふれた」と言う。' }];
        const compiled = compileProject(p); eq(compiled.errors, []);
        let now = 0; const said = [], r = new RuntimeModel(p, {}), q = new EventScheduler(p, compiled, r, { say: (id, text) => said.push(now + ':' + text) });
        r.now = () => now; q.schedule = () => {};
        try {
          q.start();
          for (let step = 0; step < 20; step++) { for (let i = 0; i < 500 && q.ready.length; i++) q.runTurn(); q.recheckBlocked(); now += 10; }
          eq([said, q.errorRecords.map(e => e.code + '@' + e.line), q.paused, q.tasks.size, r.actor('core-cat').x], [[], ['R401@1'], true, 0, 2]);
        } finally { q.stop(); }
      });
      // A sentence that calls no made block runs at once under a profile of its own limits, as under the standard limits:
      // with a clock that moves on 1 ms at each look, the timer each says is the same under both.
      test('under a profile of its own limits, a sentence with a subject read from a variable runs at once', () => {
        const run = R => {
          const p = meijinWork('主役を犬にする。\n主役はタイマーを言う。\n主役はタイマーを言う。');
          const compiled = compileProject(p); eq(compiled.errors, []);
          let t = 0; const said = [], r = new R.RuntimeModel(p, {}), name = id => p.components.find(c => c.id === r.actor(id)?.baseId)?.name || id;
          const q = new R.EventScheduler(p, compiled, r, { say: (id, text) => said.push(name(id) + ':' + text) }); r.now = () => (t += 1); r.startTime = 0; q.schedule = () => {};
          try { q.start(); for (let step = 0; step < 40; step++) { for (let i = 0; i < 50 && q.ready.length; i++) q.runTurn(); q.recheckBlocked(); } return [said, q.errorRecords]; } finally { q.stop(); }
        };
        eq([run(standardRuntime), run(profileRuntime)], [[['犬:0.011秒', '犬:0.018秒'], []], [['犬:0.011秒', '犬:0.018秒'], []]]);
      });
      // A program with a timed repeat whose body has no sentence (its body emptied in the read program): the time it repeats
      // for is read at once under a profile of its own limits, as under the standard limits. With a clock that moves on 1 ms
      // at each look and one turn of a flow between the steps, what the timer says after it, and how often the other flow
      // turned, are the same under both.
      test('under a profile of its own limits, a timed repeat with an empty body ends as under the standard limits', () => {
        const run = R => {
          const p = meijinWork('0.02秒のあいだ、くり返す。\n  点数を1ふやす。\nねこは（タイマー）を言う。', { extra: [{ id: 'core-tick', targetId: 'core-dog', event: 'start', source: 'ずっとくり返す。\n  合計を1ふやす。' }] });
          const compiled = compileProject(p); eq(compiled.errors, []); compiled.astByKey.get('script:core-meijin').body[0].body = [];
          let t = 0; const said = [], r = new R.RuntimeModel(p, {}), name = id => p.components.find(c => c.id === r.actor(id)?.baseId)?.name || id;
          const q = new R.EventScheduler(p, compiled, r, { say: (id, text) => said.push(name(id) + ':' + text) }); r.now = () => (t += 1); r.startTime = 0; q.schedule = () => {};
          try { q.start(); for (let step = 0; step < 60; step++) { if (q.ready.length) q.runTurn(); q.recheckBlocked(); } return [said, r.projectVars.get('合計'), q.errorRecords]; } finally { q.stop(); }
        };
        eq([run(standardRuntime), run(profileRuntime)], [[['ねこ:0.062秒'], 55, []], [['ねこ:0.062秒'], 55, []]]);
      });
      // A program (built from the read one) whose sentence has its subject read from a made block that picks a part by the
      // timer (主役 = 犬 while the timer is under 0.018 s, else 合計 = 鳥) and says a made block's answer read from the part
      // that speaks (its よこ). With a clock that moves on 1 ms at each look, the part that speaks is the one picked when
      // the sentence runs, its own よこ is what it says, and the timer after it is the same under both limits.
      test('under a profile of its own limits, a subject picked by a made block says its own value', () => {
        const run = R => {
          const p = meijinWork('主役を犬にする。\n合計を鳥にする。\n点数を（【選ぶ】（1））にする。\n犬は（【位置】（1））を言う。\nねこはタイマーを言う。');
          p.functions = [{ id: 'core-pick-time', ownerId: 'stage', name: '選ぶ', args: ['値'], source: 'この中だけで使う変数【答】を作り、最初は0にする。\n【答】を合計にする。\nもし タイマーが0.018秒より小さい なら、\n  【答】を主役にする。\n【答】を答えとして返す。' },
            { id: 'core-where', ownerId: 'stage', name: '位置', args: ['値'], source: 'よこのばしょを答えとして返す。' }];
          const compiled = compileProject(p); eq(compiled.errors, []);
          const body = compiled.astByKey.get('script:core-meijin').body; body[3].actorRef = { kind: 'value', value: body[2].value }; body.splice(2, 1);
          let t = 0; const said = [], r = new R.RuntimeModel(p, {}), name = id => p.components.find(c => c.id === r.actor(id)?.baseId)?.name || id;
          const q = new R.EventScheduler(p, compiled, r, { say: (id, text) => said.push(name(id) + ':' + text) }); r.now = () => (t += 1); r.startTime = 0; q.schedule = () => {};
          try { q.start(); for (let step = 0; step < 20; step++) { for (let i = 0; i < 50 && q.ready.length; i++) q.runTurn(); q.recheckBlocked(); } return [said, q.errorRecords]; } finally { q.stop(); }
        };
        eq([run(standardRuntime), run(profileRuntime)], [[['鳥:400歩', 'ねこ:0.025秒'], []], [['鳥:400歩', 'ねこ:0.025秒'], []]]);
      });
      // The editor state kept with a work: each kept editor has an owner and a text that are texts (the owner at most 150
      // characters), a change whose parts have the shapes the editor gives them (texts for its texts, true or false for its
      // marks, a path of names and places no deeper than the blocks go, mistakes with a code, words, line and column, and a
      // text for the kinds read as code), a text and a change within their lengths (F504), and, when the change names a field,
      // that field in the block it names (an empty place for a number has the field 「value」).
      test('a kept editor whose change is not shaped as the editor gives it is refused, and a field it names is found in its block', () => {
        const { sourceEach, blockDepth } = Akari.LIMITS, shape = 'F503 作文の 下書きが 正しく ありません', gone = 'F503 下書きの 本文が 見つかりません';
        const keptWork = () => { const p = makeDefaultProject(); p.scripts = [{ id: 'kept-s0', targetId: 'stage', event: 'start', source: '「あ」と言う。' }, { id: 'kept-s1', targetId: 'sprite-1', event: 'start', source: '10歩動く。' }]; return p; };
        const keptState = (over = {}) => ({ version: 1, revision: 1, selectedId: 'sprite-1', currentEvent: 'start', selectedScriptId: 'kept-s1', uiLevel: 'advanced', sourceOverviewOpen: false,
          editorModes: { script: 'blocks', draft: 'code' }, callableDraft: null, pendingEditors: [], views: [], ...over });
        const keptEditor = (over = {}) => ({ kind: 'script', ownerKey: 'script:kept-s1', source: '10歩動く。', mode: 'blocks', pending: { kind: 'block-draft' }, draftTree: null, ...over });
        const told = (state, project = keptWork()) => { try { Akari.validateEditorState(state, project); return 'ok'; } catch (e) { return e.code + ' ' + e.message; } };
        const changed = pending => told(keptState({ pendingEditors: [keptEditor({ pending })] }));
        const mistake = { code: 'P205', message: 'よめません', line: 1, column: 1 }, deep = n => Array.from({ length: n }, (_, i) => (i % 2 ? i : 'a'));
        for (const [pending, want] of [
          [{ kind: 'block-draft' }, 'ok'], [{}, 'ok'], [{ kind: 'code', value: 'x' }, 'ok'], [{ kind: 'heading-source', value: '' }, 'ok'], [{ kind: 'source-import', value: 'x' }, 'ok'],
          [{ kind: 'block-draft', value: 'v', originalSource: 'o', id: 'i', ownerKey: 'k', composing: true, invalid: false, rejected: true, reason: 'r' }, 'ok'],
          [{ value: 5 }, shape], [{ originalSource: 5 }, shape], [{ id: 5 }, shape], [{ ownerKey: 5 }, shape], [{ kind: 5 }, shape], [{ reason: 5 }, shape],
          [{ composing: 'x' }, shape], [{ invalid: 1 }, shape], [{ rejected: null }, shape],
          [{ kind: 'code' }, shape], [{ kind: 'heading-source' }, shape], [{ kind: 'source-import' }, shape],
          [{ nodePath: ['bodies', 'body', 0, 'inputs'] }, 'ok'], [{ nodePath: deep(blockDepth * 4) }, 'ok'], [{ nodePath: deep(blockDepth * 4 + 1) }, shape],
          [{ nodePath: 'bodies' }, shape], [{ nodePath: {} }, shape], [{ nodePath: [1.5] }, shape], [{ nodePath: [null] }, shape], [{ nodePath: [true] }, shape],
          [{ diagnostics: [] }, 'ok'], [{ diagnostics: [mistake, { ...mistake, line: 2, column: 3, where: 'さき' }] }, 'ok'],
          [{ diagnostics: 'x' }, shape], [{ diagnostics: {} }, shape], [{ diagnostics: [5] }, shape], [{ diagnostics: [null] }, shape], [{ diagnostics: [[]] }, shape],
          [{ diagnostics: [{ ...mistake, code: 1 }] }, shape], [{ diagnostics: [{ ...mistake, message: 1 }] }, shape], [{ diagnostics: [{ ...mistake, where: 5 }] }, shape],
          [{ diagnostics: [{ ...mistake, line: 0 }] }, shape], [{ diagnostics: [{ ...mistake, column: 0 }] }, shape], [{ diagnostics: [{ ...mistake, line: 1.5 }] }, shape],
          [{ diagnostics: [{ ...mistake, line: '1' }] }, shape], [{ diagnostics: [mistake, { ...mistake, column: '1' }] }, shape],
        ]) eq([pending, changed(pending)], [pending, want]);
        // (the owner, the text and the change of a kept editor)
        const kept = over => told(keptState({ pendingEditors: [keptEditor(over)] }));
        eq([kept({ ownerKey: 5 }), kept({ source: 5 }), kept({ pending: null }), kept({ pending: 'x' }), kept({ pending: [] })], [shape, shape, shape, shape, shape]);
        eq([kept({ ownerKey: 'k'.repeat(150) }), kept({ ownerKey: 'k'.repeat(151) })], [gone, shape]);
        eq([kept({ source: 'あ'.repeat(sourceEach) }), kept({ source: 'あ'.repeat(sourceEach + 1) })], ['ok', 'F504 作文の 下書きが 長すぎます']);
        const room = sourceEach * 4 - JSON.stringify({ kind: 'block-draft', value: '' }).length;
        eq([changed({ kind: 'block-draft', value: 'a'.repeat(room) }), changed({ kind: 'block-draft', value: 'a'.repeat(room + 1) })], ['ok', 'F504 作文の 下書きが 長すぎます']);
        // (a text of a body not made yet is kept under the slot it is for, when that is the body selected)
        eq([told(keptState({ selectedScriptId: null, pendingEditors: [keptEditor({ ownerKey: 'script:sprite-1:start' })] })),
          told(keptState({ selectedScriptId: null, pendingEditors: [keptEditor({ ownerKey: 'script:sprite-1:touchStart' })] })),
          told(keptState({ pendingEditors: [keptEditor({ ownerKey: 'script:sprite-1:start' })] }))],
        ['ok', gone, 'F503 下書きと、えらんで いる 本文が 合いません']);
        // (a field named in a change is a field of the block at the path: a number has 「value」, a quantity has none, an empty place for a number has it)
        const path = ['bodies', 'body', 0, 'inputs', 'args', 0, 'inputs', 'value'], fieldOf = (field, nodePath, over = {}, project = keptWork(), state = {}) => told(keptState({ ...state, pendingEditors: [keptEditor({ pending: { kind: 'block-field', field, value: '12', nodePath }, ...over })] }), project);
        const missing = 'F503 書きかけの、入力する ところが 見つかりません';
        eq([fieldOf('value', path), fieldOf('nothing', path), fieldOf('value', path.slice(0, -2)), fieldOf('value', ['bodies', 'body', 9])], ['ok', missing, missing, 'F503 書きかけの 入力先が 見つかりません']);
        const holeTree = () => { const tree = blockEncode(parseSyntax('10歩動く。', { symbols: buildSymbols(keptWork()) }).ast, { allowHoles: true }).tree;
          tree.bodies.body[0].inputs.args[0].inputs.value = { ...createBlock('Hole:expression', { allowHoles: true }), id: 'kept-hole' }; return tree; };
        eq([fieldOf('value', path, { draftTree: holeTree() }), fieldOf('other', path, { draftTree: holeTree() })], ['ok', missing]);
        // (the text of the body is read in the context of its owner: a 名人 text that does not read as one has no blocks)
        const meijin = keptWork(); meijin.scripts.push({ id: 'kept-m', mode: 'meijin', targetId: 'meijin', event: 'start', source: 'いぬにふれたとき、ねこは10歩動く。' });
        eq(fieldOf('value', path, { ownerKey: 'script:kept-m', source: 'いぬにふれたとき、ねこは10歩動く。' }, meijin, { selectedId: 'meijin', selectedScriptId: 'kept-m' }),
          'F503 なおして いた ときの ブロックの きろくが、正しく ありません');
      });
      // A name that its bare text would not read as (もしが3より…, ずっとを3に…) is written in 【 】 where the part or data is
      // used, and a use already in 【 】 keeps its 【 】 as it is.
      test('a data name renamed to a word the bare text would not read as is written in 【 】 at every use', () => {
        const work = source => { const p = makeDefaultProject(); p.projectData = { variables: [{ id: 'renamed-score', name: '点数', initialValue: 0 }], lists: [] }; p.scripts = [{ id: 'renamed-s1', targetId: 'stage', event: 'start', source }]; return p; };
        for (const [source, name, expected] of [
          ['点数が3になるまで待つ。', 'もし', '【もし】が3になるまで待つ。'],
          ['点数が3より大きいあいだ、くり返す。\n  点数を1ふやす。', 'もし', '【もし】が3より大きいあいだ、くり返す。\n  【もし】を1ふやす。'],
          ['【点数】が3になるまで待つ。\n点数を言う。', 'ずっと', '【ずっと】が3になるまで待つ。\n【ずっと】を言う。'],
          ['点数が3になるまで待つ。\n【点数】を言う。', 'もしも', '【もしも】が3になるまで待つ。\n【もしも】を言う。'],
        ]) {
          eq(compileProject(work(source)).errors.map(e => e.code), [], source);
          let written; try { written = Akari.prepareResourceRename(work(source), 'data:renamed-score', name, {}).scripts[0].source; } catch (e) { written = 'refused: ' + e.message; }
          eq([source, name, written], [source, name, expected]);
        }
      });
      // A signal an extension sends asks for the next turn of the run (the run goes on to the body that receives it).
      test('a signal from an extension asks for a turn of the run', () => withAbortController(() => {
        const { q, emit } = signalRun('ずっとくり返す。\n  1秒待つ。', ['「受けた」と言う。']);
        try {
          q.start(); while (q.ready.length) q.runTurn();
          let asked = 0; q.schedule = () => { asked++; };
          emit(1); eq(asked, 1); emit(2); eq(asked, 2);
        } finally { q.stop(); }
      }));
      // ... and a flow stopped while it speaks for a time leaves no record of its bubble behind (a later part of the same
      // name is never taken for the one that spoke).
      test('a flow stopped while it speaks for a time leaves no record of its bubble', () => {
        const p = makeDefaultProject(), id = p.components.find(c => c.type === 'sprite').id;
        p.scripts = [{ id: 'bubble-a', targetId: id, event: 'start', source: '「こんにちは」と3秒話す。\n「またね」と言う。' }, { id: 'bubble-k', targetId: id, event: 'click', source: '自分のほかの動きを止める。' }];
        const compiled = compileProject(p), r = new RuntimeModel(p, {}), log = []; let now = 0; r.now = () => now;
        const q = new EventScheduler(p, compiled, r, { say: (_, t) => log.push('say:' + t), clearSpeech: () => log.push('clear') }); q.schedule = () => {};
        const pump = () => { for (let i = 0; i < 100 && q.ready.length; i++) q.runTurn(); };
        try { q.start(); pump(); eq([...q.speechTokens.keys()], [id]); for (now = 0; now <= 2000; now += 10) { if (now === 1000) q.spawnForRuntime(id, 'click'); pump(); q.recheckBlocked(); pump(); } eq([log, [...q.speechTokens.keys()]], [['say:こんにちは', 'clear'], []]); } finally { q.stop(); }
      });
      // The answer given to a question that is shown goes to the flow that asked it (「〜とたずねる」), which goes on and says it as 答え.
      test('an answer given while a question is shown is taken by the flow that asked', () => {
        const p = laneProject(['点数']); p.scripts = [{ id: 'core-ask', targetId: 'core-cat', event: 'start', source: '「名前は？」とたずねる。\n答えを言う。' }];
        const compiled = compileProject(p); eq(compiled.errors, []);
        const said = [], asked = [], r = new RuntimeModel(p, {}), q = new EventScheduler(p, compiled, r, { say: (id, text) => said.push(text), ask: question => asked.push(question) });
        r.now = () => 0; q.schedule = () => {};
        try {
          q.start(); while (q.ready.length) q.runTurn(); eq([asked, said, q.tasks.size], [['名前は？'], [], 1]);
          q.answerQuestion('あかり'); while (q.ready.length) q.runTurn();
          eq([said, q.activeQuestion, q.tasks.size, q.errorRecords.length], [['あかり'], null, 0, 0]);
        } finally { q.stop(); }
      });
      // A count to wait for (〜が…回おされるか、…になるまで) beside a value that calls a made block in a list of arguments keeps its count
      // bound under a profile of its own limits as under the standard limits: the loop goes on while neither is true.
      test('under a profile of its own limits, a count condition beside a made block called inside a call repeats as under the standard limits', () => {
        const source = 'ねこが99回おされるか、最大（【二倍】（1）、1）が3以上になるまでくり返す。\n  点数を1ふやす。\n  0.01秒待つ。';
        const standard = profileRun(standardRuntime, source, double, 300), own = profileRun(profileRuntime, source, double, 300);
        eq([standard.said, standard.score, standard.errors], [[], 16, []]);
        eq({ ...own, left: [] }, { ...standard, left: [] });
      });
      // The place of a stop notice is the line and the column where the sentence begins: a sentence inside a block begins after its indent.
      test('a stop notice is told at the column where its sentence begins', () => {
        const p = makeRegressionProject();
        p.projectData = { variables: [{ id: 'stop-column', name: '点数', initialValue: 0 }], lists: [] };
        p.scripts = [{ id: 'stop-column-body', targetId: p.components.find(c => c.type === 'sprite').id, event: 'start',
          source: '点数の1番目を言う。\n2回くり返す。\n  点数の1番目を言う。\n  1回くり返す。\n    点数の1番目を言う。' }];
        const c = compileProject(p);
        eq([c.errors, c.notes.filter(n => n.code === 'I139').map(n => [n.line, n.column])], [[], [[1, 1], [3, 3], [5, 5]]]);
      });
      // A name written in a body that cannot be a name (more than 32 characters) is a mistake of the reading, P205, told in the words of the
      // name check, wherever the name is written in 【 】.
      test('a name written in a body that is too long is told as a mistake of the reading', () => {
        const symbols = buildSymbols(makeDefaultProject()), long = 'あ'.repeat(33);
        for (const source of ['【' + long + '】を言う。', '【' + long + '】を1にする。', '点数を【' + long + '】にする。', '【' + long + '】に1を足す。'])
          eq([source, parseSyntax(source, { symbols }).syntaxDiagnostics.map(d => [d.code, d.message])], [source, [['P205', '名前は 1〜32文字で つけます']]]);
      });
      // A program (built from the read one) whose sentence has its subject read from a value that calls no made block but
      // depends on the timer (the 1st or 2nd of なかま by the milliseconds), and that says a made block's answer read from
      // the part that speaks. With a clock that moves on 1 ms at each look, the part picked when the sentence runs speaks
      // and says its own よこ: under the profile the subject is read once more, one look of the clock later.
      test('under a profile of its own limits, a subject read from a value that depends on the timer is read where the sentence runs', () => {
        const run = (R, shift) => {
          const p = meijinWork('なかまを、犬と鳥にする。\n点数を（なかまの（（タイマーの数だけ×1000＋' + shift + '）÷2のあまり＋1）番目）にする。\n犬は（【位置】（1））を言う。\nねこはタイマーを言う。');
          p.functions = [{ id: 'core-where', ownerId: 'stage', name: '位置', args: ['値'], source: 'よこのばしょを答えとして返す。' }];
          const compiled = compileProject(p); eq(compiled.errors, []);
          const body = compiled.astByKey.get('script:core-meijin').body; body[2].actorRef = { kind: 'value', value: body[1].value }; body.splice(1, 1);
          let t = 0; const said = [], r = new R.RuntimeModel(p, {}), name = id => p.components.find(c => c.id === r.actor(id)?.baseId)?.name || id;
          const q = new R.EventScheduler(p, compiled, r, { say: (id, text) => said.push(name(id) + ':' + text) }); r.now = () => (t += 1); r.startTime = 0; q.schedule = () => {};
          try { q.start(); for (let step = 0; step < 20; step++) { for (let i = 0; i < 50 && q.ready.length; i++) q.runTurn(); q.recheckBlocked(); } return [said, q.errorRecords]; } finally { q.stop(); }
        };
        eq([run(standardRuntime, 0), run(standardRuntime, 1)], [[['犬:200歩', 'ねこ:0.019秒'], []], [['鳥:400歩', 'ねこ:0.019秒'], []]]);
        eq([run(profileRuntime, 0), run(profileRuntime, 1)], [[['犬:200歩', 'ねこ:0.02秒'], []], [['鳥:400歩', 'ねこ:0.02秒'], []]]);
      });
      // EXTENSIONS.md: an async command (async:true) gives a Promise, and the wait stops only the flow that called it. The
      // tests below wait for the Promise the extension gives; each is recorded as the tests above are, in this order.
      const testAsync = async (id, fn) => {
        try { await fn(); results.push({ id: 'CORE ' + id, pass: true, detail: 'PASS' }); }
        catch (e) { results.push({ id: 'CORE ' + id, pass: false, detail: (e.code || e.name) + ': ' + e.message }); }
      };
      // A run whose body of ねこ says 「前」, calls the async command (the read program gets the command in place of its
      // second sentence: the work's text cannot name an extension the product has not registered), then says its answer.
      // settle(resolve, reject) settles the command's Promise; the turns after it are run once the Promise chain is done.
      const asyncCommandRun = async settle => {
        const standIn = typeof AbortController !== 'function';
        if (standIn) {
          class StandInSignal {
            constructor() { this.aborted = false; this.reason = undefined; this.listeners = []; }
            addEventListener(type, listener, options) { if (type === 'abort') this.listeners.push({ listener, once: !!options?.once }); }
            removeEventListener(type, listener) { this.listeners = this.listeners.filter(x => x.listener !== listener); }
          }
          globalThis.AbortController = class { constructor() { this.signal = new StandInSignal(); }
            abort(reason) { const s = this.signal; if (s.aborted) return; s.aborted = true; s.reason = reason; const all = s.listeners; s.listeners = all.filter(x => !x.once); for (const x of all) x.listener(); } };
        }
        try {
          const contract = Akari.EXECUTABLE_CONTRACT, standard = { languageContractId: contract.languageContractId, runtimeContractId: contract.runtimeContractId };
          const manifest = { id: 'core.later', name: 'あとの拡張', version: '1.0.0', apiContract: 1, standard, description: '試験', dependencies: [], capabilities: [], offline: true, selfContained: true,
            state: { formatVersion: 1, initial: null }, calculations: [], events: [],
            commands: [{ id: 'later', name: 'あとで', description: '試験', args: [], returns: { type: 'number', unit: null }, async: true }] };
          let resolveIt = null, rejectIt = null;
          const R = Akari.createAkariRuntime({ extensions: [{ manifest, factory: () => ({ commands: { later() { return new Promise((yes, no) => { resolveIt = yes; rejectIt = no; }); } }, calculations: {} }) }] });
          const p = laneProject(['点数']); p.scripts = [{ id: 'core-async', targetId: 'core-cat', event: 'start', source: '「前」と言う。\n「x」と言う。\n答えを言う。' }];
          const compiled = compileProject(p); eq(compiled.errors, []);
          compiled.astByKey.get('script:core-async').body[1] = { kind: 'ExtensionCommand', name: 'core.later/later', args: [], actorRef: { kind: 'self' } };
          const said = [], q = new R.EventScheduler(p, compiled, new R.RuntimeModel(p, {}), { say: (id, text) => said.push(String(text)) }); q.schedule = () => {};
          try {
            q.start(); while (q.ready.length) q.runTurn();
            const before = [said.slice(), q.tasks.size, [...q.blocked].map(t => t.blockReason.kind)];
            settle(resolveIt, rejectIt);
            for (let i = 0; i < 10; i++) await null;
            q.recheckBlocked(); while (q.ready.length) q.runTurn();
            return { before, said, errors: q.errorRecords.map(e => e.code + ' ' + e.message), tasks: q.tasks.size };
          } finally { q.stop(); }
        } finally { if (standIn) delete globalThis.AbortController; }
      };
      let answered = false;
      await testAsync('an async extension command stops its flow until its Promise gives the answer', async () => {
        const out = await asyncCommandRun(resolve => resolve(7));
        eq(out, { before: [['前'], 1, ['extension']], said: ['前', '7'], errors: [], tasks: 0 });
        answered = true;
      });
      // (a failing Promise is only made once an answer is seen to arrive: a run that never takes the answer would leave
      // a refused Promise with no one to take it)
      await testAsync('an async extension command whose Promise fails or gives a wrong value ends its flow', async () => {
        ok(answered, 'the answer of an async command did not arrive');
        const wrong = await asyncCommandRun(resolve => resolve('もじ'));
        eq([wrong.said, wrong.errors], [['前'], ['E705 かくちょうの 中身の しゅるいか たんいが 合いません']]);
        const refused = await asyncCommandRun((resolve, reject) => reject(null));
        eq([refused.said, refused.errors], [['前'], ['R411 かくちょうの 命令が うまく いきませんでした']]);
        const coded = await asyncCommandRun((resolve, reject) => reject(Object.assign(new Error('拡張が止まりました'), { code: 'E704' })));
        eq([coded.said, coded.errors], [['前'], ['E704 拡張が止まりました']]);
      });
      // An async command whose Promise gives a part (a character) ends its flow with the words for an answer, not the ones
      // for a value handed to an extension.
      await testAsync('an async extension command whose Promise gives a part ends its flow with the words for an answer', async () => {
        const part = await asyncCommandRun(resolve => resolve({ part: 'core-cat', name: 'ねこ' }));
        eq([part.said, part.errors], [['前'], ['E705 かくちょうの 答えに キャラクターや 部品は 使えません']]);
      });
      // The signal a call is given is listened to while the call waits for its Promise only: once the Promise has given its
      // answer or has been refused, nothing is left listening to the signal.
      await testAsync('an async extension command stops listening to the signal of its call once its Promise has settled', async () => {
        const host = Akari.createAkariExtensionHost({}), waiting = [];
        const manifest = { id: 'core.listen', version: '1.0.0', apiContract: 1, standard: host.standard, description: '試験', dependencies: [], capabilities: [], offline: true, selfContained: true,
          state: { formatVersion: 1, initial: null }, calculations: [], events: [],
          commands: [{ id: 'go', name: '行く', description: '試験', args: [], returns: { type: 'number', unit: null }, async: true }] };
        host.register(manifest, function factory() { return { commands: { go() { const promise = new Promise((yes, no) => { waiting.push({ yes, no }); }); promise.catch(() => {}); return promise; } }, calculations: {} }; });
        const spy = () => ({ aborted: false, added: 0, removed: 0, addEventListener(type) { if (type === 'abort') this.added++; }, removeEventListener(type) { if (type === 'abort') this.removed++; } });
        const answered = spy(), refused = spy();
        const calls = withAbortController(() => { host.beginSession(); return [host.invokeCommand('core.listen/go', [], { signal: answered }), host.invokeCommand('core.listen/go', [], { signal: refused })]; });
        try {
          const settled = []; calls.forEach((call, i) => call.then(value => { settled[i] = ['gave', value]; }, error => { settled[i] = ['refused', error.code]; }));
          waiting[0].yes(4); waiting[1].no(Object.assign(new Error('止まりました'), { code: 'E704' }));
          for (let i = 0; i < 10; i++) await null;
          eq(settled, [['gave', 4], ['refused', 'E704']]);
          eq([[answered.added, answered.removed], [refused.added, refused.removed]], [[1, 1], [1, 1]]);
        } finally { host.endSession(); }
      });
    }
    return {
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      total: results.length,
      results,
    };
  }
