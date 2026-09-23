async function runExtendedTests07() {
    const A = Akari09,
      results = [],
      sessions = [],
      N = '\u70b9\u6570',
      L = '\u540d\u524d\u4e00\u89a7',
      END = '\u3053\u3053\u307e\u3067';
    const test = async (id, fn) => {
      try {
        await fn();
        results.push({ id: 'AUDIT ' + id, pass: true, detail: 'PASS' });
      } catch (e) {
        results.push({
          id: 'AUDIT ' + id,
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
    const reject = async (fn, code) => {
      let caught;
      try {
        await fn();
      } catch (e) {
        caught = e;
      }
      ok(
        caught && (!code || caught.code === code),
        'expected ' + code + '; got ' + (caught?.code || 'accepted'),
      );
    };
    const make = (source = '', targetId = 'stage', event = 'start') => {
      const p = A.makeDefaultProject();
      p.scripts = [{ targetId, event, source }];
      return p;
    };
    const harness = (p) => {
      const c = A.compileProject(p);
      ok(!c.errors.length, JSON.stringify(c.errors));
      const r = new A.RuntimeModel(p, {}),
        out = [],
        errors = [],
        q = new A.EventScheduler(p, c, r, {
          say: (id, text) => out.push([id, text]),
          runtimeError: (t, e) => errors.push(e),
        });
      q.running = true;
      q.paused = true;
      const h = {
        p,
        c,
        r,
        q,
        out,
        errors,
        pump() {
          let n = 0;
          while (q.ready.length && n++ < 20000) q.runTurn(true);
          ok(n < 20000, 'step limit');
        },
        run(id = 'stage', ev = 'start', data = {}) {
          q.spawnForRuntime(id, ev, data);
          this.pump();
          return this;
        },
      };
      sessions.push(h);
      return h;
    };
    const run = (source, id = 'stage') => {
      const h = harness(make(source, id)).run(id);
      if (h.errors.length) throw h.errors[0];
      return h;
    };
    const say = (s) => s + '\u3068\u8a00\u3046',
      set = (name, value) => name + '\u3092' + value + '\u306b\u3059\u308b',
      add = (name) => name + '\u306b1\u3092\u8db3\u3059',
      local = (name, value) =>
        name +
        '\u3068\u3044\u3046\u5909\u6570\u3092\u4f5c\u308a\u3001\u521d\u671f\u5024\u3092' +
        value +
        '\u306b\u3059\u308b';
    await test('CONDITION count-to-three independent result', () => {
      const h = run(
        set(N, 0) +
          '\n' +
          N +
          'が3より小さいあいだ、次のことをくり返す。\n  ' +
          add(N) +
          '\n' +
          say(N),
      );
      eq(h.out, [['stage', '3']]);
    });
    await test('CONDITION until-ten without optional suffix', () =>
      eq(
        run(N + 'が10以上になるまで、次のことをくり返す。\n  ' + add(N)).r.projectVars.get(N),
        10,
      ));
    const predicates = [
      [N + '\u304c0\u4ee5\u4e0a\u3067\u3042\u308b\u3042\u3044\u3060', true],
      [N + '\u304c0\u4ee5\u4e0b\u3067\u3042\u308b\u3042\u3044\u3060', true],
      [N + '\u304c0\u3068\u540c\u3058\u3067\u3042\u308b\u3042\u3044\u3060', true],
      [N + '\u304c1\u3068\u9055\u3046\u3042\u3044\u3060', true],
      [N + '\u304c1\u3088\u308a\u5c0f\u3055\u3044\u3042\u3044\u3060', true],
      [N + '\u304c1\u3088\u308a\u5927\u304d\u3044\u3042\u3044\u3060', false],
      [N + '\u304c0\u4ee5\u4e0a\u306b\u306a\u308b\u307e\u3067', true],
      [N + '\u304c0\u4ee5\u4e0b\u306b\u306a\u308b\u307e\u3067', true],
      [N + '\u304c0\u3068\u540c\u3058\u306b\u306a\u308b\u307e\u3067', true],
      [N + '\u304c1\u3068\u9055\u3046\u3088\u3046\u306b\u306a\u308b\u307e\u3067', true],
      [N + '\u304c1\u3088\u308a\u5c0f\u3055\u304f\u306a\u308b\u307e\u3067', true],
      [N + '\u304c1\u3088\u308a\u5927\u304d\u304f\u306a\u308b\u307e\u3067', false],
      [
        '\u7a7a\u767d\u30ad\u30fc\u304c\u62bc\u3055\u308c\u3066\u3044\u308b\u3042\u3044\u3060',
        true,
      ],
      [
        '\u7a7a\u767d\u30ad\u30fc\u304c\u62bc\u3055\u308c\u3066\u3044\u306a\u3044\u3042\u3044\u3060',
        false,
      ],
      ['\u7a7a\u767d\u30ad\u30fc\u304c\u62bc\u3055\u308c\u308b\u307e\u3067', true],
      [
        '\u7a7a\u767d\u30ad\u30fc\u304c\u62bc\u3055\u308c\u306a\u304f\u306a\u308b\u307e\u3067',
        false,
      ],
      ['\u7aef\u306b\u89e6\u308c\u3066\u3044\u308b\u3042\u3044\u3060', false],
      ['\u7aef\u306b\u89e6\u308c\u3066\u3044\u306a\u3044\u3042\u3044\u3060', true],
      ['\u7aef\u306b\u89e6\u308c\u308b\u307e\u3067', false],
      ['\u7aef\u306b\u89e6\u308c\u306a\u304f\u306a\u308b\u307e\u3067', true],
      [
        L +
          '\u306b\u300c\u3042\u304b\u308a\u300d\u304c\u542b\u307e\u308c\u3066\u3044\u308b\u3042\u3044\u3060',
        true,
      ],
      [L + '\u306b\u300c\u3042\u304b\u308a\u300d\u304c\u542b\u307e\u308c\u308b\u307e\u3067', true],
      [
        L +
          '\u306b\u300c\u3042\u304b\u308a\u300d\u304c\u542b\u307e\u308c\u3066\u3044\u306a\u3044\u3042\u3044\u3060',
        false,
      ],
      [
        L +
          '\u306b\u300c\u3042\u304b\u308a\u300d\u304c\u542b\u307e\u308c\u306a\u304f\u306a\u308b\u307e\u3067',
        false,
      ],
      ['\u30de\u30a6\u30b9\u304c\u62bc\u3055\u308c\u308b\u307e\u3067', false],
      ['\u30de\u30a6\u30b9\u304c\u62bc\u3055\u308c\u306a\u304f\u306a\u308b\u307e\u3067', true],
      [
        '\u6761\u4ef6\uff08\u771f\u304b\u3064\u507d\uff09\u304c\u6210\u308a\u7acb\u3064\u307e\u3067',
        false,
      ],
      [
        '\u6761\u4ef6\uff08\u507d\u307e\u305f\u306f\u771f\uff09\u304c\u6210\u308a\u7acb\u3064\u3042\u3044\u3060',
        true,
      ],
      [
        '\u6761\u4ef6\uff08\u771f\u3067\u306f\u306a\u3044\uff09\u304c\u6210\u308a\u7acb\u3064\u3042\u3044\u3060',
        false,
      ],
    ];
    await test('CONDITION predicate inflection matrix and stable formatting', () => {
      const p = make(),
        sy = A.buildSymbols(p),
        r = new A.RuntimeModel(p, {}),
        ctx = {
          runtime: r,
          runtimeId: 'sprite-1',
          compiled: A.compileProject(p),
          task: { callFrames: [], execStack: [], lastAnswer: '' },
        };
      r.pressedKeys.add('空白');
      for (const [text, wanted] of predicates) {
        const ast = A.parseScript(text + '、次のことをくり返す。\n  何もしない。', sy),
          f = A.formatScript(ast);
        eq(A.evalExpression(ast.body[0].condition, ctx), wanted);
        eq(A.evalExpression(A.parseScript(f, sy).body[0].condition, ctx), wanted);
        eq(A.formatScript(A.parseScript(f, sy)), f);
        if (text.endsWith('まで')) {
          const w = A.parseScript(text + '待つ', sy);
          eq(w.body[0].kind, 'WaitUntil');
          eq(A.evalExpression(w.body[0].condition, ctx), wanted);
        }
      }
    });
    await test('CONDITION malformed forms rejected', () => {
      for (const s of [
        N + '\u304c3\u4ee5\u4e0a\u3042\u3044\u3060',
        N + '\u304c3\u3088\u308a\u5c0f\u3055\u3044\u306b\u306a\u308b\u307e\u3067',
        '\u771f\u3042\u3044\u3060',
        '\u7aef\u306b\u89e6\u308c\u308b\u306b\u306a\u308b\u307e\u3067',
      ])
        ok(A.compileProject(make(s + '\n' + END)).errors.length > 0, s);
    });
    await test('WAIT natural key edge and release', () => {
      const h = harness(
        make(
          '\u7a7a\u767d\u30ad\u30fc\u304c\u62bc\u3055\u308c\u308b\u307e\u3067\u5f85\u3064\n' +
            set(N, 1) +
            '\n\u7a7a\u767d\u30ad\u30fc\u304c\u62bc\u3055\u308c\u306a\u304f\u306a\u308b\u307e\u3067\u5f85\u3064\n' +
            set(N, 2),
        ),
      ).run();
      eq(h.r.projectVars.get(N), 0);
      h.r.pressedKeys.add('\u7a7a\u767d');
      h.q.recheckBlocked(true);
      h.pump();
      eq(h.r.projectVars.get(N), 1);
      h.r.pressedKeys.clear();
      h.q.recheckBlocked(true);
      h.pump();
      eq(h.r.projectVars.get(N), 2);
    });
    await test('NAME registry additions removals leave existing AST meaning unchanged', () => {
      const p = make(add(N) + '\n' + say(N));
      for (const [name, i] of [
        ['\u70b9\u6570\u306b1', 1],
        ['\u624b\u304c\u304b\u308a', 2],
        ['\u7aef', 3],
        ['\u7a7a\u767d', 4],
        ['\u6570\u00d7\u5024', 5],
        ['0\u70b9', 6],
      ]) {
        p.projectData.variables.push({ id: 'extra-' + i, name, initialValue: 99 });
        const h = harness(p).run();
        eq(h.out, [['stage', '1']]);
        p.projectData.variables.pop();
        eq(harness(p).run().out, [['stage', '1']]);
      }
    });
    await test('NAME literal words require explicit data quoting in every scope', () => {
      for (const name of ['\u7aef', '\u7a7a\u767d', '\u30de\u30a6\u30b9']) {
        const p = make();
        p.projectData.variables.push({ id: 'reserved-literal', name, initialValue: 0 });
        for (const source of [
          set(name, 5),
          set('\u4f5c\u54c1\u306e' + name, 5),
          say('\u4f5c\u54c1\u306e' + name),
        ]) {
          p.scripts[0].source = source;
          ok(A.compileProject(p).errors.length > 0, source);
        }
        p.scripts[0].source =
          set('\u3010' + name + '\u3011', 5) +
          '\n' +
          say('\u4f5c\u54c1\u306e\u3010' + name + '\u3011');
        eq(harness(p).run().out, [['stage', '5']]);
      }
      const p = make();
      p.functions = [
        { id: 'literal-function', name: '\u7aef', args: [], source: '1\u3092\u8fd4\u3059' },
      ];
      p.scripts[0].source = say('\u7aef\uff08\uff09');
      ok(A.compileProject(p).errors.length);
      p.scripts[0].source = say('\u3010\u7aef\u3011\uff08\uff09');
      eq(harness(p).run().out, [['stage', '1']]);
    });
    await test('NAME qualified escaping and canonical formatting', () => {
      const p = make(
        '\u4f5c\u54c1\u306e\u3010\u624b\u304c\u304b\u308a\u3011\u30925\u306b\u3059\u308b\n' +
          say('\u4f5c\u54c1\u306e\u3010\u624b\u304c\u304b\u308a\u3011'),
      );
      p.projectData.variables.push({
        id: 'clue',
        name: '\u624b\u304c\u304b\u308a',
        initialValue: 0,
      });
      const h = harness(p).run();
      eq(h.out, [['stage', '5']]);
      const f = A.formatScript(h.c.items[0].ast);
      ok(f.includes('\u4f5c\u54c1\u306e\u3010\u624b\u304c\u304b\u308a\u3011'));
      eq(A.nameSource07(N), N);
    });
    await test('NAME particle-containing callable and arguments', () => {
      const p = make(
        '\u3010\u5024\u3092\u5897\u3084\u3059\u3011\uff083\uff09\u3092\u5b9f\u884c\u3059\u308b',
      );
      p.actions = [
        {
          id: 'action-particle',
          name: '\u5024\u3092\u5897\u3084\u3059',
          args: ['\u8db3\u3059\u5024'],
          source: N + '\u306b\u3010\u8db3\u3059\u5024\u3011\u3092\u8db3\u3059',
        },
      ];
      eq(harness(p).run().r.projectVars.get(N), 3);
    });
    await test('FORMAT empty branches nested loops and every boundary comment', () => {
      const source =
          '※ top\nもし 真なら、次のことをする。 ※ if\n  何もしない。\nそうでなければ、次のことをする。 ※ else\n  「never」と言う。\n※ if-end\n次のことを2回くり返す。 ※ outer\n  次のことを2回くり返す。 ※ inner\n    点数に1を足す。\n  ※ inner-end\n※ outer-end\n「A※Ａ＋  」と言う。',
        p = make(source),
        f = A.formatScript(A.parseScript(source, A.buildSymbols(p)));
      for (const c of ['top', 'if', 'else', 'if-end', 'outer', 'inner', 'inner-end', 'outer-end'])
        ok(f.includes('※ ' + c));
      eq(A.formatScript(A.parseScript(f, A.buildSymbols(p))), f);
      eq(run(f).r.projectVars.get(N), 4);
      eq(run(f).out, [['stage', 'A※Ａ＋  ']]);
    });
    await test('FORMAT independent string Unicode and punctuation preservation', () => {
      const values = [
        '\u3000\uff21\uff0b \u203b .',
        '\ud83d\ude00\u304b\u3099',
        '<script>\" & ` ```',
        'AKARI09-DATA-BEGIN',
      ];
      for (const v of values) {
        const p = make(say('\u300c' + v + '\u300d') + '\u3002'),
          f = A.formatScript(A.parseScript(p.scripts[0].source, A.buildSymbols(p)));
        eq(run(f).out, [['stage', v]]);
      }
    });
    await test('HINT dynamic argument list operations and lexical locals', () => {
      const source =
          local('合計', 0) + '\n数一覧の各要素を項目として、次のことをくり返す。\n  \n合計を返す',
        at = source.indexOf('  \n') + 2,
        list = A.hintCandidates07(make(), 'stage', {
          source,
          start: at,
          end: at,
          args: ['数一覧'],
          definitionKind: 'function',
        });
      ok(list.some((x) => x.text === '数一覧を空にする' && x.enabled));
      ok(list.some((x) => x.id === 'Break' && x.enabled));
      ok(list.some((x) => x.mode === 'expression' && x.text === '項目'));
      ok(!list.some((x) => x.id === 'localScalar' || x.id.startsWith('return:')));
      ok(!list.some((x) => x.mode === 'statement' && x.text.startsWith('作品の' + N + 'を')));
    });
    await test('HINT function declaration and return positions', () => {
      const p = make(),
        head = A.hintCandidates07(p, 'stage', {
          source: '',
          definitionKind: 'function',
          args: ['\u91cf'],
        });
      ok(head.some((x) => x.id === 'localScalar'));
      ok(head.some((x) => x.id === 'return:0'));
      const mid = local('\u5408\u8a08', 0) + '\n\u5408\u8a08\u306b1\u3092\u8db3\u3059\n';
      const tail = A.hintCandidates07(p, 'stage', { source: mid, definitionKind: 'function' });
      ok(!tail.some((x) => x.id === 'localScalar'));
      ok(tail.some((x) => x.id === 'return:\u5408\u8a08'));
      const finished = mid + '\u5408\u8a08\u3092\u8fd4\u3059\n';
      ok(
        !A.hintCandidates07(p, 'stage', { source: finished, definitionKind: 'function' }).some(
          (x) => x.id.startsWith('return:'),
        ),
      );
    });
    await test('HINT generated names stay valid through collision boundary', () => {
      const chain = (base) => Array.from({ length: 31 }, (_, i) => base + '値'.repeat(i));
      const eachNames = [...chain('項目'), '項目2'],
        p = make();
      p.projectData.variables.push(
        ...eachNames.map((name, i) => ({ id: `var-hint-boundary-${i}`, name, initialValue: 0 })),
      );
      const each = A.hintCandidates07(p, 'stage').find((x) => x.id === 'each:作品の名前一覧');
      ok(each?.enabled, JSON.stringify(each));
      p.scripts[0].source = each.text;
      let c = A.compileProject(p);
      ok(!c.errors.length, JSON.stringify(c.errors));
      const eachAst = A.parseScript(each.text, A.buildSymbols(p), { targetId: 'stage' }),
        binder = eachAst.body[0].binder;
      ok(Array.from(binder).length <= 32 && !eachNames.includes(binder), binder);
      const args = [...chain('結果'), '結果2'],
        q = make();
      let hints = A.hintCandidates07(q, 'stage', {
          source: '',
          start: 0,
          end: 0,
          definitionKind: 'action',
          args,
        }),
        scalar = hints.find((x) => x.id === 'localScalar');
      ok(scalar?.enabled, JSON.stringify(scalar));
      const first = scalar.text + '\n',
        at = first.length;
      hints = A.hintCandidates07(q, 'stage', {
        source: first,
        start: at,
        end: at,
        definitionKind: 'action',
        args,
      });
      const list = hints.find((x) => x.id === 'localList');
      ok(list?.enabled, JSON.stringify(list));
      q.actions = [
        { id: 'action-hint-boundary', name: '候補境界', args, source: first + list.text },
      ];
      c = A.compileProject(q);
      ok(!c.errors.length, JSON.stringify(c.errors));
      const body = A.parseScript(q.actions[0].source, A.buildSymbols(q), {
          definitionKind: 'action',
          definition: q.actions[0],
          args,
        }).body,
        generated = [body[0].name, body[1].name];
      ok(
        generated.every((name) => Array.from(name).length <= 32 && !args.includes(name)) &&
          generated[0] !== generated[1],
        JSON.stringify(generated),
      );
    });
    await test('HINT event-specific values and target restrictions', () => {
      for (const [event, sensor] of [
        ['keyDown', '\u62bc\u3055\u308c\u305f\u30ad\u30fc'],
        ['message', '\u53d7\u3051\u53d6\u3063\u305f\u77e5\u3089\u305b'],
        ['backdropChanged', '\u65b0\u3057\u3044\u80cc\u666f\u540d'],
      ]) {
        ok(
          A.hintCandidates07(make(), 'stage', { event }).some(
            (x) => x.text === sensor && x.mode === 'expression',
          ),
        );
        ok(!A.hintCandidates07(make(), 'stage', { event: 'start' }).some((x) => x.text === sensor));
        ok(
          !A.hintCandidates07(make(), 'stage', { event, definitionKind: 'action' }).some(
            (x) => x.text === sensor,
          ),
        );
      }
      ok(A.hintCandidates07(make(), 'stage').find((x) => x.id === 'MotionCommand:MOVE').reason);
    });
    await test('HINT all enabled default expressions parse and diagnose', () => {
      for (const targetId of ['stage', 'button-1', 'sprite-1']) {
        const p = make('', targetId);
        for (const h of A.hintCandidates07(p, targetId).filter(
          (x) => x.enabled && x.mode === 'expression',
        )) {
          p.scripts[0].source = h.text + '\u3068\u8a00\u3046';
          const c = A.compileProject(p);
          ok(!c.errors.length, h.text + ': ' + JSON.stringify(c.errors));
        }
      }
    });
    await test('HINT source insertion preserves exact selection surroundings', () => {
      const source = '点数に1を足す';
      const a = A.insertSource07(source, 3, 4, '7', 'expression');
      eq(a.source, '点数に7を足す');
      const b = A.insertSource07('  \nnext', 2, 2, '3回くり返す\n  x\n' + END);
      eq(b.source, '  3回くり返す\n    x\n  ' + END + '\nnext');
      eq(A.insertSource07('old\nnext', 0, 3, 'new').source, 'new\nnext');
    });
    await test('HINT mid-line statement insertion refused', () =>
      reject(() => A.insertSource07('abcdef', 2, 3, 'x'), 'P201'));
    await test('HINT unfinished programs remain inspectable', () => {
      for (const source of [
        '\u300c',
        '\u3082\u3057',
        '\u4f5c\u54c1\u306e\u3010',
        '3\u56de\u304f\u308a\u8fd4\u3059\n',
        '\u6570\u4e00\u89a7\u306e\u8981\u7d20\u30921\u3064\u305a\u3064\u53d6\u308a\u51fa\u3057\u3001 \u3010\u624b \u3068\u3057\u3066\u6b21\u3092\u304f\u308a\u8fd4\u3059\n',
      ])
        ok(Array.isArray(A.hintCandidates07(make(), 'stage', { source })));
    });
    await test('ERROR action arguments local9 correct line and detached state', () => {
      const p = make('\u5897\u3084\u3059\uff087\uff09\u3092\u5b9f\u884c\u3059\u308b');
      p.actions = [
        {
          id: 'action-fault',
          name: '\u5897\u3084\u3059',
          args: ['\u91cf'],
          source: local('\u5c40\u6240', 0) + '\n' + set('\u5c40\u6240', 9) + '\n' + say('1\u00f70'),
        },
      ];
      const h = harness(p).run(),
        f = h.q.errorRecords[0];
      eq([f.key, f.line, f.code], ['action:action-fault', 3, 'R401']);
      eq(f.frames[0].args, [['\u91cf', 7]]);
      eq(f.frames[0].locals, [['\u5c40\u6240', 9]]);
      h.r.projectVars.set(N, 99);
      eq(f.projectVariables, [[N, 0]]);
      ok(Object.isFrozen(f.frames[0].locals));
      eq(h.q.tasks.size, 0);
    });
    await test('ERROR nested functions preserve inner failure and both frames', () => {
      const p = make(say('\u5916\u5074\uff087\uff09'));
      p.functions = [
        {
          id: 'f-outer',
          name: '\u5916\u5074',
          args: ['\u91cf'],
          source:
            local('\u5916\u5024', '\u91cf') +
            '\n\u5185\u5074\uff08\u5916\u5024\uff09\u3092\u8fd4\u3059',
        },
        {
          id: 'f-inner',
          name: '\u5185\u5074',
          args: ['\u5024'],
          source: local('\u5185\u5024', '\u5024') + '\n\u5185\u5024\u00f70\u3092\u8fd4\u3059',
        },
      ];
      const h = harness(p).run(),
        f = h.q.errorRecords[0];
      eq([f.key, f.line, f.code], ['function:f-inner', 2, 'R401']);
      eq(
        f.frames.map((x) => x.name),
        ['\u5916\u5074', '\u5185\u5074'],
      );
      eq(f.frames[1].args, [['\u5024', 7]]);
      eq(f.frames[1].locals, [['\u5185\u5024', 7]]);
    });
    await test('ERROR ring retention repeated failure and continuation', () => {
      const h = harness(make(say('1\u00f70')));
      for (let i = 0; i < 45; i++) h.run();
      eq(h.q.errorRecords.length, 20);
      eq(h.q.errorRecords[0].id, 26);
      eq(h.q.tasks.size, 0);
      const first = h.q.errorRecords[0];
      h.p.scripts[0].source = say('2');
      h.run();
      eq(first.statement, say('1\u00f70'));
      h.q.stop();
      eq(
        [
          h.q.tasks.size,
          h.q.ready.length,
          h.q.blocked.size,
          h.q.waitGroups.size,
          h.q.errorRecords.length,
        ],
        [0, 0, 0, 0, 0],
      );
    });
    await test('ERROR long scalar and list snapshot remains complete', () => {
      const p = make(say('1\u00f70'));
      const long = '\ud83d\ude00'.repeat(2000);
      p.projectData.variables[0].initialValue = long;
      p.projectData.lists[0].initialValue = Array.from({ length: 150 }, (_, i) => i);
      const h = harness(p).run(),
        f = h.q.errorRecords[0];
      eq(f.projectVariables[0][1], long);
      eq(f.projectLists[0][1].length, 150);
      h.r.projectLists.get(L).push(999);
      eq(f.projectLists[0][1].at(-1), 149);
    });
    await test('QUESTION duplicate reply cannot answer another queued question', () => {
      const p = make('\u300cA\u300d\u3068\u305f\u305a\u306d\u308b\n' + say('\u7b54\u3048'));
      p.scripts.push({
        targetId: 'button-1',
        event: 'start',
        source: '\u300cB\u300d\u3068\u305f\u305a\u306d\u308b\n' + say('\u7b54\u3048'),
      });
      const h = harness(p),
        callbacks = [];
      h.q.ui.ask = (s, cb) => callbacks.push(cb);
      h.q.spawnForRuntime('stage', 'start');
      h.run('button-1');
      eq(callbacks.length, 1);
      callbacks[0]('one');
      h.pump();
      h.q.showNextQuestion();
      eq(callbacks.length, 2);
      callbacks[0]('stale');
      eq(h.q.activeQuestion.question, 'B');
      callbacks[1]('two');
      h.pump();
      eq(h.out, [
        ['stage', 'one'],
        ['button-1', 'two'],
      ]);
      h.q.stop();
      callbacks[1]('after stop');
      eq(h.q.tasks.size, 0);
    });
    await test('STOP clears questions timers all waits and physical input', () => {
      const h = harness(make('\u300cA\u300d\u3068\u305f\u305a\u306d\u308b')).run();
      h.r.pressedKeys.add('a');
      h.r.mouseDown = true;
      h.q.stop();
      eq(
        [
          h.q.activeQuestion,
          h.q.questionQueue.length,
          h.q.questionTimer,
          h.r.mouseDown,
          h.r.pressedKeys.size,
        ],
        [null, 0, null, false, 0],
      );
    });
    await test('CLONE collision transform ordering and clone data independence', () => {
      const h = run('\u81ea\u5206\u306e\u30af\u30ed\u30fc\u30f3\u3092\u4f5c\u308b', 'sprite-1'),
        a = h.r.actor('sprite-1'),
        clone = [...h.r.actors.values()].find((x) => x.isClone);
      clone.vars.set('HP', 9);
      eq(a.vars.get('HP'), 3);
      ok(h.r.touching(clone.runtimeId, STANDARD_AKARI_MASCOT09.name));
      clone.visible = false;
      ok(!h.r.touching(clone.runtimeId, STANDARD_AKARI_MASCOT09.name));
      a.direction = 90;
      a.scalePercent = 200;
      const bb = h.r.aabb(a);
      ok(Math.abs(bb.right - bb.left - a.h * 2) < 1e-8);
      h.r.reorderActor('sprite-1', 'FRONT');
      ok(a.z > h.r.actor('button-1').z);
    });
    await test('SCHEDULER pause does not complete time waits', () => {
      const h = harness(make('1\u79d2\u5f85\u3064\n' + say('1')));
      let t = 0;
      h.r.now = () => t;
      h.run();
      for (let i = 0; i < 3; i++) h.q.stepOne();
      eq(h.out, []);
      t = 1000;
      h.q.stepOne();
      eq(h.out, [['stage', '1']]);
    });
    await test('LIMIT expression nesting and function nontermination are bounded', () => {
      ok(A.compileProject(make(say('（'.repeat(140) + '1' + '）'.repeat(140)))).errors.length > 0);
      const p = make(say('計算（）'));
      p.functions = [
        {
          id: 'f-loop',
          name: '計算',
          args: [],
          source: '次のことをずっとくり返す。\n  何もしない。\n0を返す',
        },
      ];
      const h = harness(p).run();
      eq(h.errors[0]?.code, 'R409');
    });

    await test('SCHEDULER condition failure stops before another task can run', () => {
      const p = make(
        '\u6761\u4ef6\uff081\u00f7' +
          N +
          '\u304c0\u3068\u540c\u3058\uff09\u304c\u6210\u308a\u7acb\u3064\u307e\u3067\u5f85\u3064',
      );
      p.projectData.variables[0].initialValue = 1;
      p.scripts.push({ targetId: 'button-1', event: 'start', source: set(N, 42) });
      const h = harness(p).run();
      eq(h.q.blocked.size, 1);
      h.r.projectVars.set(N, 0);
      h.q.spawnForRuntime('button-1', 'start');
      h.q.paused = false;
      h.q.runTurn(false);
      eq(h.r.projectVars.get(N), 0);
      eq(h.q.errorRecords.length, 1);
      ok(h.q.paused);
      eq(h.q.ready.length, 1);
    });
    await test('MARKDOWN10 readable code initial data and material manifest', async () => {
      const p = make(say('\u300c\u4fdd\u5b58\u8a66\u9a13\u300d')),
        s = A.serializeProject(p);
      ok(s.startsWith('# '));
      for (const part of [p.scripts[0].source, N, L, 'SHA-256', 'AKARI-PROJECT-F3-DATA-BEGIN'])
        ok(s.includes(part) || (part === 'SHA-256' && !p.sounds.length));
      const r = await A.parseProjectFile(s);
      eq(r.project, p);
    });
    await test('MARKDOWN unfinished empty and boundary-like strings round trip', async () => {
      for (const source of [
        '',
        N + '\u3092',
        '\u203b \ud83d\ude00 \" \' ```\n<!-- AKARI09-DATA-BEGIN -->\n```json\n<\/script>\n<!-- AKARI09-DATA-END -->',
        '\u300c<>& ` ```\u300d\u3068\u8a00\u3046',
      ]) {
        const p = make(source);
        p.name = '<>&\ud83d\ude00';
        const text = A.serializeProject(p),
          read = await A.parseProjectFile(text);
        eq(read.project, p);
      }
    });
    await test('MARKDOWN canonical-body mismatch rejected F512', async () => {
      const p = make(set(N, 0)),
        text = A.serializeProject(p);
      await reject(() => A.parseProjectFile(text.replace(set(N, 0), set(N, 9))), 'F512');
    });
    await test('MARKDOWN malformed JSON missing markers old JSON rejected', async () => {
      const text = A.serializeProject(make());
      await reject(() => A.parseProjectFile(text.replace('\n```json\n{', '\n```json\n{BROKEN')));
      await reject(() => A.parseProjectFile(text.slice(0, -40)), 'F502');
      await reject(() => A.parseProjectFile(JSON.stringify(make())), 'F502');
    });
    await test('MARKDOWN transport CRLF and BOM do not alter project', async () => {
      const p = make('\u203b line\n' + set(N, 2)),
        text = A.serializeProject(p),
        read = await A.parseProjectFile('\ufeff' + text.replace(/\n/g, '\r\n'));
      eq(read.project, p);
    });
    await test('SCHEMA10 structure duplicate IDs invalid data and excessive input', async () => {
      const bad = make();
      bad.appVersion = null;
      await reject(() => A.serializeProject(bad), 'F501');
      const dup = make();
      dup.projectData.variables[0].id = dup.components[0].id;
      await reject(() => A.serializeProject(dup), 'F505');
      const inf = make();
      inf.projectData.variables[0].initialValue = Infinity;
      await reject(() => A.serializeProject(inf));
      await reject(() => A.parseProjectFile('x'.repeat(A.LIMITS.fileBytes + 1)), 'F504');
    });
    await test('EXPORT deterministic runtime result equals design runtime', () => {
      const p = make('次のことを3回くり返す。\n  ' + add(N) + '\n' + say('乱数（1、100）')),
        h = harness(p);
      h.r.reset(123);
      h.run();
      const e = A.restoreExecutable(A.packExecutable(p, new A.AssetStore())),
        r = new A.RuntimeModel(e.project, {}),
        out = [],
        q = new A.EventScheduler(e.project, e.compiled, r, { say: (id, t) => out.push([id, t]) });
      r.reset(123);
      q.running = true;
      q.paused = true;
      q.spawnForRuntime('stage', 'start');
      for (let i = 0; q.ready.length && i < 50; i++) q.runTurn(true);
      eq(out, h.out);
      eq(r.projectVars.get(N), 3);
      q.stop();
    });
    await test('EXPORT hostile HTML remains escaped data', () => {
      const p = make(say('\u300c<\/script><img src=x onerror=alert(1)>\u300d'));
      p.name = '<script>alert(1)<\/script>';
      const text = A.generateStandaloneHtml(p);
      eq((text.match(/<script>/g) || []).length, 1);
      eq((text.match(/<\/script>/g) || []).length, 1);
      ok(!text.includes('<img src=x'));
      ok(text.includes("connect-src 'none'"));
    });
    await test('AUDIO suspended resume rejection is visible', async () => {
      const c = new A.AssetRuntimeCache(new A.AssetStore());
      c.audioContext = {
        state: 'suspended',
        close() {
          this.state = 'closed';
          return Promise.resolve();
        },
      };
      c.audioResumePromise = Promise.resolve();
      await reject(() => c.ensureAudioReady(), 'R415');
      await c.dispose();
    });
    await test('ASSET canceled pending image cannot retain URLs or repopulate cache', async () => {
      let finish;
      const image = {
          naturalWidth: 2,
          naturalHeight: 3,
          decode: () => new Promise((r) => (finish = r)),
        },
        store = new A.AssetStore([
          {
            id: 'asset-test',
            kind: 'image',
            mime: 'image/png',
            bytes: new Uint8Array([1]),
            sha256: '0'.repeat(64),
            meta: { width: 2, height: 3 },
          },
        ]),
        cache = new A.AssetRuntimeCache(store, { createImage: () => image }),
        pending = cache
          .prepare(
            make(),
            { imageIds: new Set(['asset-test']), audioIds: new Set(), needsAudio: false },
            7,
          )
          .then(
            () => null,
            (e) => e,
          );
      eq(cache.objectUrls.size, 1);
      await cache.dispose();
      eq((await pending)?.code, 'R415');
      eq(cache.objectUrls.size, 0);
      eq(cache.pendingOperations.size, 0);
      finish();
      await Promise.resolve();
      eq(cache.imageByAssetId.size, 0);
    });
    await test('ASSET decoded dimension mismatch releases own object URL', async () => {
      const store = new A.AssetStore([
          {
            id: 'asset-test',
            kind: 'image',
            mime: 'image/png',
            bytes: new Uint8Array([1]),
            sha256: '0'.repeat(64),
            meta: { width: 2, height: 3 },
          },
        ]),
        cache = new A.AssetRuntimeCache(store, {
          createImage: () => ({
            naturalWidth: 20,
            naturalHeight: 30,
            decode: () => Promise.resolve(),
          }),
        });
      await reject(
        () =>
          cache.prepare(
            make(),
            { imageIds: new Set(['asset-test']), audioIds: new Set(), needsAudio: false },
            9,
          ),
        'R415',
      );
      eq(cache.objectUrls.size, 0);
      eq(cache.imageByAssetId.size, 0);
      await cache.dispose();
    });
    await test('AUDIO per-handle completion stop and voice cap with simulated nodes', () => {
      const cache = new A.AssetRuntimeCache(new A.AssetStore()),
        done = [],
        nodes = [];
      for (let i = 0; i < 32; i++) {
        const source = { stop() {}, disconnect() {} };
        nodes.push(source);
        cache.createHandle(source, { disconnect() {} }, (id) => done.push(id));
      }
      let err;
      try {
        cache.createHandle({ stop() {}, disconnect() {} }, { disconnect() {} });
      } catch (e) {
        err = e;
      }
      eq(err?.code, 'R416');
      nodes[3].onended();
      eq(done, ['audio-4']);
      eq(cache.activeAudioHandles.size, 31);
      cache.stopAllHandles({ notify: true });
      eq(cache.activeAudioHandles.size, 0);
      eq(done.length, 32);
      nodes[3].onended();
      eq(done.length, 32);
    });
    await test('AUDIO unrelated completion cannot release a waiter', () => {
      const h = harness(
        make(
          '440Hz\u306e\u97f3\u30921\u79d2\u9cf4\u3089\u3057\u3001\u7d42\u308f\u308b\u307e\u3067\u5f85\u3064\n' +
            say('7'),
        ),
      );
      let cb;
      h.r.assetCache = {
        startTone: (f, d, v, p, end) => {
          cb = end;
          return 'voice-own';
        },
        stopAllHandles() {},
        setPaused() {},
      };
      h.run();
      cb('voice-other');
      h.q.recheckBlocked(true);
      h.pump();
      eq(h.out, []);
      cb('voice-own');
      h.q.recheckBlocked(true);
      h.pump();
      eq(h.out, [['stage', '7']]);
    });
    for (const h of sessions) h.q.stop();
    return {
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      total: results.length,
      results,
    };
  }
