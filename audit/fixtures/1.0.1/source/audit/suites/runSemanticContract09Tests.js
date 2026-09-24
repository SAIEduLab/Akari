function runSemanticContract09Tests() {
    const results = [],
      test = (name, fn) => {
        try {
          fn();
          results.push({ id: 'T09-CONTRACT ' + name, pass: true, detail: 'PASS' });
        } catch (e) {
          results.push({
            id: 'T09-CONTRACT ' + name,
            pass: false,
            detail: (e.code || e.name) + ': ' + e.message,
          });
        }
      },
      ok = (v, m = 'contract mismatch') => {
        if (!v) throw Error(m);
      },
      eq = (a, b) =>
        ok(
          JSON.stringify(a) === JSON.stringify(b),
          'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a),
        );
    const reject = (fn, code) => {
        let e;
        try {
          fn();
        } catch (x) {
          e = x;
        }
        eq(e?.code, code);
      },
      base = (source = '', targetId = 'stage') => {
        const p = makeDefaultProject();
        p.scripts = source ? [{ targetId, event: 'start', source }] : [];
        return p;
      };
    const harness = (p) => {
      const c = compileProject(p);
      ok(!c.errors.length, JSON.stringify(c.errors));
      let clock = 0;
      const r = new RuntimeModel(p, {}),
        out = [],
        errors = [],
        q = new EventScheduler(p, c, r, {
          say: (id, value) =>
            out.push({
              id,
              value,
              time: clock,
              x: r.actor('sprite-1').x,
              y: r.actor('sprite-1').y,
            }),
          runtimeError: (t, e) => errors.push(e),
        });
      r.now = () => clock;
      r.reset(12345);
      q.running = true;
      q.paused = true;
      return {
        p,
        c,
        r,
        q,
        out,
        errors,
        pump() {
          let n = 0;
          while (q.ready.length && n++ < 10000) q.runTurn(true);
          ok(n < 10000);
          ok(!errors.length, JSON.stringify(errors));
        },
        run(id = 'stage', event = 'start') {
          q.spawnForRuntime(id, event);
          this.pump();
        },
        time(value) {
          clock = value;
          q.recheckBlocked(true);
          this.pump();
        },
      };
    };
    // Expected arity is written from the language contract independently of metadata.
    const arities = [
      ['乱数', 2, 2],
      ['余り', 2, 2],
      ...[
        '四捨五入',
        '切り上げ',
        '切り捨て',
        '絶対値',
        '平方根',
        '正弦',
        '余弦',
        '正接',
        '逆正弦',
        '逆余弦',
        '逆正接',
        '自然対数',
        '常用対数',
        '指数',
        '数',
        '文字',
      ].map((n) => [n, 1, 1]),
      ['最小', 1, Infinity],
      ['最大', 1, Infinity],
      ['つなぐ', 2, Infinity],
    ];
    for (const [name, min, max] of arities)
      test('arity ' + name, () => {
        const p = base(),
          c = compileProject(p),
          r = new RuntimeModel(p, {}),
          ctx = {
            runtime: r,
            compiled: c,
            runtimeId: 'stage',
            task: { execStack: [], callFrames: [] },
          };
        for (const count of new Set([
          0,
          min - 1,
          min,
          min + 1,
          ...(Number.isFinite(max) ? [max, max + 1] : [32, 33, 65]),
        ])) {
          const source =
              name +
              '（' +
              Array(count)
                .fill(name === '数' ? '「1」' : '1')
                .join('、') +
              '）と言う',
            parsed = parseSyntax(source);
          ok(parsed.ast, source);
          const encoded = blockEncode(parsed.ast),
            decoded = blockDecode(encoded.tree),
            formatted = formatScript(decoded),
            again = parseSyntax(formatted).ast;
          ok(astEquivalent(parsed.ast, again));
          eq(again.body[0].value.args.length, count);
          p.scripts = [{ targetId: 'stage', event: 'start', source }];
          const diagnostics = compileProject(p).errors,
            valid = count >= min && count <= max;
          eq(
            diagnostics.some((d) => d.code === 'S308'),
            !valid,
          );
          if (valid) {
            ok(!diagnostics.length, JSON.stringify(diagnostics));
            const a = evalExpression(parsed.ast.body[0].value, ctx),
              b = evalExpression(again.body[0].value, ctx);
            eq(a, b);
          } else {
            reject(() => evalExpression(parsed.ast.body[0].value, ctx), 'R411');
          }
        }
      });
    test('scope precedence qualifiers and collisions', () => {
      const p = base(),
        r = new RuntimeModel(p, {}),
        actor = r.actor('sprite-1'),
        name = '重複値',
        layers = ['binder', 'local', 'arg', 'self', 'project'];
      for (let mask = 1; mask < 32; mask++) {
        r.projectVars.clear();
        actor.vars.clear();
        const frame = { locals: new Map(), localLists: new Map(), args: new Map() },
          task = { callFrames: [frame], execStack: [] };
        if (mask & 1) task.execStack.push({ type: 'seq', binder: { name, value: 10 } });
        if (mask & 2) frame.locals.set(name, 20);
        if (mask & 4) frame.args.set(name, 30);
        if (mask & 8) actor.vars.set(name, 40);
        if (mask & 16) r.projectVars.set(name, 50);
        const ctx = { runtime: r, runtimeId: 'sprite-1', task };
        for (const qualifier of [null, 'exact', 'self', 'project']) {
          const expected =
            qualifier === 'self'
              ? mask & 8
                ? 'self'
                : null
              : qualifier === 'project'
                ? mask & 16
                  ? 'project'
                  : null
                : layers.find((_, i) => mask & (1 << i));
          const binding = r.resolveBinding(name, qualifier, ctx);
          eq(binding?.scope || null, expected);
          if (binding) eq(binding.get(), (layers.indexOf(expected) + 1) * 10);
        }
      }
      for (const [body, args] of [
        ['重複値という変数を作り、初期値を1にする\n0を返す', ['重複値']],
        ['重複値という変数を作り、初期値を1にする\n重複値というリストを作る\n0を返す', []],
      ]) {
        const x = base();
        x.functions = [{ id: 'function-scope', name: '計算', args, source: body }];
        ok(compileProject(x).errors.some((d) => d.code === 'S302'));
      }
      for (const [prefix, args] of [
        ['', ['重複値']],
        ['重複値という変数を作り、初期値を1にする\n', []],
        ['重複値というリストを作る\n', []],
      ]) {
        const x = base();
        x.functions = [
          {
            id: 'function-scope',
            name: '計算',
            args,
            source:
              prefix + '［1］の各要素を重複値として、次のことをくり返す\n  何もしない\n0を返す',
          },
        ];
        ok(compileProject(x).errors.some((d) => d.code === 'S312'));
      }
      const programs = [
        ['重複値と言う', [], null, ['40']],
        ['作品の重複値と言う\n自分の重複値と言う', [], null, ['50', '40']],
        [
          '［10］の各要素を重複値として、次のことをくり返す\n  重複値と言う\n重複値と言う',
          [],
          null,
          ['10', '40'],
        ],
        [
          '表示（30）を実行する',
          ['重複値'],
          '重複値と言う\n作品の重複値と言う\n自分の重複値と言う',
          ['30', '50', '40'],
        ],
        [
          '表示（）を実行する',
          [],
          '重複値という変数を作り、初期値を20にする\n重複値と言う\n作品の重複値と言う\n自分の重複値と言う',
          ['20', '50', '40'],
        ],
      ];
      for (const [source, args, body, expected] of programs) {
        const x = base(source, 'sprite-1');
        x.projectData.variables.push({ id: 'var-shadow', name, initialValue: 50 });
        x.components
          .find((c) => c.id === 'sprite-1')
          .localData.variables.push({ id: 'local-shadow', name, initialValue: 40 });
        if (body) x.actions = [{ id: 'action-scope', name: '表示', args, source: body }];
        const h = harness(x);
        h.run('sprite-1');
        eq(
          h.out.map((v) => v.value),
          expected,
        );
        h.q.stop();
      }
    });
    test('local declaration positions and use before initialization', () => {
      const cases = [
        ['局所という変数を作り、初期値を局所にする\n0を返す', 'S303'],
        [
          '先という変数を作り、初期値を後にする\n後という変数を作り、初期値を1にする\n0を返す',
          'S303',
        ],
        ['先という変数を作り、初期値を後の長さにする\n後というリストを作る\n0を返す', 'S303'],
        ['何もしない\n局所という変数を作り、初期値を1にする\n0を返す', 'S313'],
        ['もし 真なら、次のことをする\n  局所というリストを作る\n0を返す', 'S313'],
        ['次のことを1回くり返す\n  局所という変数を作り、初期値を1にする\n0を返す', 'S313'],
        ['局所というリストを作る\n局所という変数を作り、初期値を1にする\n0を返す', 'S302'],
      ];
      for (const [source, code] of cases) {
        const p = base();
        p.functions = [{ id: 'function-local', name: '計算', args: [], source }];
        const ast = parseSyntax(source).ast;
        ok(ast);
        ok(
          compileProject(p).errors.some((d) => d.code === code),
          source,
        );
        ok(astEquivalent(ast, blockDecode(blockEncode(ast).tree)));
      }
      for (const source of ['局所という変数を作り、初期値を1にする', '局所というリストを作る'])
        ok(compileProject(base(source)).errors.some((d) => d.code === 'S313'));
      const p = base('計算（）と言う');
      p.functions = [
        {
          id: 'function-local',
          name: '計算',
          args: [],
          source:
            '※ 先頭コメント\n先という変数を作り、初期値を1にする\n※ 宣言間コメント\n後という変数を作り、初期値を先＋1にする\n後を返す',
        },
      ];
      const h = harness(p);
      h.run();
      eq(
        h.out.map((x) => x.value),
        ['2'],
      );
      h.q.stop();
    });
    test('purity every effect kind and command op', () => {
      const kinds = new Set([
          'Say',
          'Ask',
          'Broadcast',
          'BroadcastAndWait',
          'WaitTime',
          'WaitUntil',
          'MotionCommand',
          'LooksCommand',
          'PenCommand',
          'SoundCommand',
          'CloneCommand',
          'StopCommand',
          'UserActionCall',
        ]),
        schemas = BLOCK_SCHEMAS.filter((s) => kinds.has(s.kind));
      ok(schemas.length === 54, 'effect inventory changed: ' + schemas.length);
      for (const schema of schemas) {
        const statement = blockDecode(createBlock(schema.id), { expected: 'statement' }),
          source = formatScript({
            kind: 'Script',
            body: [
              statement,
              {
                kind: 'ReturnStatement',
                value: { kind: 'NumberLiteral', value: 0 },
                inlineComment: '',
              },
            ],
          }),
          p = base();
        p.functions = [{ id: 'function-pure', name: '計算', args: [], source }];
        const ast = parseSyntax(source).ast;
        ok(ast);
        const diagnostics = compileProject(p).errors;
        ok(
          diagnostics.some((d) => d.code === 'S305'),
          schema.id,
        );
        ok(astEquivalent(ast, blockDecode(blockEncode(ast).tree)));
      }
      for (const source of [
        '点数を1にする',
        '点数に1を足す',
        '点数から1を引く',
        '名前一覧に1を追加する',
        '名前一覧の1番目を1にする',
        '名前一覧の1番目に1を挿入する',
        '名前一覧の1番目を削除する',
        '名前一覧を空にする',
      ]) {
        const p = base();
        p.functions = [
          { id: 'function-pure', name: '計算', args: [], source: source + '\n0を返す' },
        ];
        ok(
          compileProject(p).errors.some((d) => d.code === 'S305'),
          source,
        );
      }
    });
    test('notify nested nonwaiting and waiting receiver boundary', () => {
      for (const wait of [false, true]) {
        const p = base('「外」と知らせ、受け手の処理が終わるまで待つ\n「送信完了」と言う');
        p.scripts.push(
          {
            targetId: 'button-1',
            event: 'message',
            source:
              'もし 受け取った知らせが「外」と同じなら、次のことをする\n  ' +
              (wait ? '「内」と知らせ、受け手の処理が終わるまで待つ' : '「内」と知らせる') +
              '\n  「直接完了」と言う',
          },
          {
            targetId: 'sprite-1',
            event: 'message',
            source:
              'もし 受け取った知らせが「内」と同じなら、次のことをする\n  1秒待つ\n  「間接完了」と言う',
          },
        );
        const h = harness(p);
        h.run();
        eq(
          h.out.map((x) => x.value),
          wait ? [] : ['直接完了', '送信完了'],
        );
        ok(h.q.blocked.size > 0);
        h.time(999);
        eq(
          h.out.map((x) => x.value),
          wait ? [] : ['直接完了', '送信完了'],
        );
        h.time(1000);
        eq(
          h.out.map((x) => x.value),
          wait ? ['間接完了', '直接完了', '送信完了'] : ['直接完了', '送信完了', '間接完了'],
        );
        eq([h.q.waitGroups.size, h.q.blocked.size, h.q.tasks.size], [0, 0, 0]);
        h.q.stop();
      }
    });
    test('glide midpoint completion and concurrent task trace', () => {
      const p = base('0.5秒待つ\n「途中」と言う\n0.5秒待つ\n「完了」と言う');
      p.scripts.push({
        targetId: 'sprite-1',
        event: 'start',
        source: '横0、縦0の位置へ行く\n1秒で横100、縦200の位置へ滑る\n「滑走完了」と言う',
      });
      const traces = [];
      for (const blocks of [false, true]) {
        const x = cloneDesignProject(p);
        if (blocks)
          for (const script of x.scripts)
            script.source = formatScript(
              blockDecode(blockEncode(parseSyntax(script.source).ast).tree),
            );
        const h = harness(x);
        h.q.spawnForRuntime('stage', 'start');
        h.run('sprite-1');
        eq([h.r.actor('sprite-1').x, h.r.actor('sprite-1').y], [0, 0]);
        h.time(499);
        ok(Math.abs(h.r.actor('sprite-1').x - 49.9) < 1e-9);
        eq(h.out, []);
        h.time(500);
        eq(
          h.out.map((v) => [v.value, v.x, v.y]),
          [['途中', 50, 100]],
        );
        h.time(999);
        ok(Math.abs(h.r.actor('sprite-1').x - 99.9) < 1e-9);
        h.time(1000);
        eq([h.r.actor('sprite-1').x, h.r.actor('sprite-1').y], [100, 200]);
        eq(
          h.out.map((v) => v.value),
          ['途中', '完了', '滑走完了'],
        );
        traces.push(h.out);
        h.q.stop();
      }
      eq(traces[0], traces[1]);
    });
    return {
      total: results.length,
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      results,
    };
  }
