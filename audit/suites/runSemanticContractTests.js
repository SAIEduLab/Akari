function runSemanticContractTests() {
    const results = [],
      test = (name, fn) => {
        try {
          fn();
          results.push({ id: 'TEST-CONTRACT ' + name, pass: true, detail: 'PASS' });
        } catch (e) {
          results.push({
            id: 'TEST-CONTRACT ' + name,
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
        const p = makeRegressionProject();
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
              '）の値を言う',
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
        ['この中だけで使う変数【重複値】を作り、最初は1にする\n0を返す', ['重複値']],
        ['この中だけで使う変数【重複値】を作り、最初は1にする\nこの中だけで使うリスト【重複値】を空で作る\n0を返す', []],
      ]) {
        const x = base();
        x.functions = [{ownerId:'stage',  id: 'function-scope', name: '計算', args, source: body }];
        ok(compileProject(x).errors.some((d) => d.code === 'S302'));
      }
      for (const [prefix, args] of [
        ['', ['重複値']],
        ['この中だけで使う変数【重複値】を作り、最初は1にする\n', []],
        ['この中だけで使うリスト【重複値】を空で作る\n', []],
      ]) {
        const x = base();
        x.functions = [
          {ownerId:'stage',
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
        ['重複値の値を言う', [], null, ['40']],
        ['作品の重複値の値を言う\n自分の重複値の値を言う', [], null, ['50', '40']],
        [
          '［10］の各要素を重複値として、次のことをくり返す\n  重複値の値を言う\n重複値の値を言う',
          [],
          null,
          ['10', '40'],
        ],
        [
          '（30）を渡して、【表示】という手順を行う',
          ['重複値'],
          '重複値の値を言う\n作品の重複値の値を言う\n自分の重複値の値を言う',
          ['30', '50', '40'],
        ],
        [
          '【表示】という手順を行う',
          [],
          'この中だけで使う変数【重複値】を作り、最初は20にする\n重複値の値を言う\n作品の重複値の値を言う\n自分の重複値の値を言う',
          ['20', '50', '40'],
        ],
      ];
      for (const [source, args, body, expected] of programs) {
        const x = base(source, 'sprite-1');
        x.projectData.variables.push({ id: 'var-shadow', name, initialValue: 50 });
        x.components
          .find((c) => c.id === 'sprite-1')
          .localData.variables.push({ id: 'local-shadow', name, initialValue: 40 });
        if (body) x.actions = [{ownerId:'stage',  id: 'action-scope', name: '表示', args, source: body }];
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
        ['この中だけで使う変数【局所】を作り、最初は局所にする\n0を返す', 'S303'],
        [
          'この中だけで使う変数【先】を作り、最初は後にする\nこの中だけで使う変数【後】を作り、最初は1にする\n0を返す',
          'S303',
        ],
        ['この中だけで使う変数【先】を作り、最初は後の長さにする\nこの中だけで使うリスト【後】を空で作る\n0を返す', 'S303'],
        ['何もしない\nこの中だけで使う変数【局所】を作り、最初は1にする\n0を返す', 'S313'],
        ['もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする\n  この中だけで使うリスト【局所】を空で作る\n0を返す', 'S313'],
        ['1回くり返す\n  この中だけで使う変数【局所】を作り、最初は1にする\n0を返す', 'S313'],
        ['この中だけで使うリスト【局所】を空で作る\nこの中だけで使う変数【局所】を作り、最初は1にする\n0を返す', 'S302'],
      ];
      for (const [source, code] of cases) {
        const p = base();
        p.functions = [{ownerId:'stage',  id: 'function-local', name: '計算', args: [], source }];
        const ast = parseSyntax(source).ast;
        ok(ast);
        ok(
          compileProject(p).errors.some((d) => d.code === code),
          source,
        );
        ok(astEquivalent(ast, blockDecode(blockEncode(ast).tree)));
      }
      for (const source of ['この中だけで使う変数【局所】を作り、最初は1にする', 'この中だけで使うリスト【局所】を空で作る'])
        ok(compileProject(base(source)).errors.some((d) => d.code === 'S313'));
      const p = base('（【計算】で求めた答え）の値を言う');
      p.functions = [
        {ownerId:'stage',
          id: 'function-local',
          name: '計算',
          args: [],
          source:
            '※ 先頭コメント\nこの中だけで使う変数【先】を作り、最初は1にする\n※ 宣言間コメント\nこの中だけで使う変数【後】を作り、最初は先＋1にする\n後を返す',
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
      // The current effect statement set; equality detects both additions and removals.
      eq(schemas.map((s) => s.id).sort(), [
        "Ask",
        "Broadcast",
        "BroadcastAndWait",
        "CloneCommand:CREATE_SELF",
        "CloneCommand:CREATE_TARGET",
        "CloneCommand:DELETE_SELF",
        "LooksCommand:BACK",
        "LooksCommand:BACKWARD_LAYERS",
        "LooksCommand:FORWARD_LAYERS",
        "LooksCommand:FRONT",
        "LooksCommand:HIDE",
        "LooksCommand:NEXT_BACKDROP",
        "LooksCommand:NEXT_COSTUME",
        "LooksCommand:PREV_BACKDROP",
        "LooksCommand:PREV_COSTUME",
        "LooksCommand:SET_BACKDROP",
        "LooksCommand:SET_COLOR",
        "LooksCommand:SET_COSTUME",
        "LooksCommand:SET_INPUT",
        "LooksCommand:SET_SCALE",
        "LooksCommand:SET_SELF_TEXT",
        "LooksCommand:SET_TARGET_TEXT",
        "LooksCommand:SHOW",
        "MotionCommand:BOUNCE",
        "MotionCommand:GOTO",
        "MotionCommand:GOTO_PART",
        "MotionCommand:MOVE",
        "MotionCommand:MOVE_BY",
        "MotionCommand:POINT_TO",
        "MotionCommand:SET_DIRECTION",
        "MotionCommand:TURN_LEFT",
        "MotionCommand:TURN_RIGHT",
        "PenCommand:CLEAR",
        "PenCommand:DOWN",
        "PenCommand:SET_COLOR",
        "PenCommand:SET_SIZE",
        "PenCommand:STAMP",
        "PenCommand:UP",
        "Say",
        "SoundCommand:PITCH_DOWN",
        "SoundCommand:PITCH_UP",
        "SoundCommand:SAMPLE",
        "SoundCommand:SAMPLE_WAIT",
        "SoundCommand:SET_VOLUME",
        "SoundCommand:STOP_ALL",
        "SoundCommand:TONE",
        "SoundCommand:TONE_WAIT",
        "StopCommand:ALL",
        "StopCommand:OTHERS",
        "StopCommand:OWN_OTHERS",
        "StopCommand:THIS",
        "UserActionCall",
        "WaitTime",
        "WaitUntil"
      ]);
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
        p.functions = [{ownerId:'stage',  id: 'function-pure', name: '計算', args: [], source }];
        const ast = parseSyntax(source).ast;
        ok(ast, schema.id + ': generated source must parse: ' + source);
        const diagnostics = compileProject(p).errors;
        ok(
          diagnostics.some((d) => d.code === 'S305'),
          schema.id,
        );
        ok(astEquivalent(ast, blockDecode(blockEncode(ast).tree)), schema.id + ': block roundtrip');
      }
      // Effects that a lone block cannot form: the group wait needs its preceding
      // broadcast and the continuous rule is a script rule, so they are written as sentences.
      for (const [kind, source] of [
        ['WaitBroadcastGroup', 'みんなに「出発」と知らせる\nその知らせを受けて始めたことが全部終わるまで待つ\n0を返す'],
        ['ContinuousRule', '条件（条件の答え（あてはまる））が成り立つあいだ、自分は右へ1秒に20歩の速さで動き続ける\n0を返す'],
      ]) {
        const p = base();
        p.functions = [{ ownerId: 'stage', id: 'function-effect', name: '計算', args: [], source }];
        const ast = parseSyntax(source).ast;
        ok(ast, kind + ' must parse before purity checking');
        ok([...(ast.body || []), ...(ast.rules || [])].some((n) => n.kind === kind), kind);
        ok(compileProject(p).errors.some((d) => d.code === 'S305'), kind + ' must remain forbidden in functions');
      }
      for (const source of [
        '点数を1にする',
        '点数に1を足す',
        '点数から1を引く',
        '名前一覧に1を追加する',
        '名前一覧の1番目を1にする',
        '名前一覧の1番目に1を挿入する',
        '名前一覧の1番目を削除する',
        '名前一覧の中身を全部消す',
      ]) {
        const p = base();
        p.functions = [
          {ownerId:'stage',  id: 'function-pure', name: '計算', args: [], source: source + '\n0を返す' },
        ];
        ok(
          compileProject(p).errors.some((d) => d.code === 'S305'),
          source,
        );
      }
    });
    test('notify nested nonwaiting and waiting receiver boundary', () => {
      for (const wait of [false, true]) {
        const p = base('みんなに「外」と知らせて、知らせを受けて始めたことが全部終わるまで待つ\n「送信完了」と言う');
        p.scripts.push(
          {
            targetId: 'button-1',
            event: 'message',
            source:
              'もし 受け取った知らせが「外」と同じなら、次のことをする\n  ' +
              (wait ? 'みんなに「内」と知らせて、知らせを受けて始めたことが全部終わるまで待つ' : '「内」と知らせる') +
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
        source: '画面の左下のはしから、右へ0歩、上へ0歩のばしょへ行く\n1秒かけて、画面の左下のはしから、右へ100歩、上へ200歩のばしょへ行く\n「滑走完了」と言う',
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
    const actorUnitFixture = (source = '') => {
      const p = Akari.makeDefaultProject(), sprite = p.components.find(c => c.type === 'sprite');
      p.components = ['ねこ', 'いぬ'].map((name, i) => ({...structuredClone(sprite), id:i?'dog':'cat', name,
        x:i?100:0, y:0, costumes:[{id:'core-costume-'+i,name:'顔',kind:'text',value:'🐈'}],costumeId:'core-costume-'+i,
        localData:{variables:[{id:'core-local-'+i,name:'個体値',initialValue:i?10:20}],
          lists:[{id:'core-list-'+i,name:'個体一覧',initialValue:i?[1,2,3]:[1,2]}]}}));
      p.projectData={variables:[{id:'core-score',name:'点数',initialValue:0}],lists:[]};
      p.scripts=[{id:'core-start',targetId:'cat',event:'start',source}];p.actions=[];p.functions=[];
      return p;
    };
    const actorUnitRun = (p, packed = false, expectedError = null) => {
      let api=Akari, compiled=api.compileProject(p);eq(compiled.errors,[]);
      if(packed){api=Akari.createAkariRuntime();const loaded=api.restoreExecutable(Akari.packExecutable(p));p=loaded.project;compiled=loaded.compiled;}
      const speech=[],r=new api.RuntimeModel(p,{}),q=new api.EventScheduler(p,compiled,r,{say:(id,text)=>speech.push([id,text])});
      let clock=0;r.now=()=>clock;q.schedule=()=>{};
      try{q.start();
        // A loop turn that changes the screen without waiting waits for the next こま (loop pacing), so the logical
        // clock moves to the earliest wake until every flow has ended.
        for(let i=0;i<1000&&(q.ready.length||q.tasks.size);i++){
          if(q.ready.length){q.runTurn();continue;}
          const due=Math.min(...[...q.blocked].map(t=>t.blockReason?.kind==='time'?t.blockReason.deadline:Infinity));
          if(!Number.isFinite(due))break;clock=due;q.recheckBlocked();
        }
        eq(q.errorRecords.map(e=>e.code),expectedError?[expectedError]:[]);eq(q.tasks.size,0);
        return{cat:r.actor('cat').x,dog:r.actor('dog').x,catValue:r.actor('cat').vars.get('個体値'),projectValues:Object.fromEntries(r.projectVars),speech};}
      finally{q.stop();}
    };
    const actorUnitControls = [
      ['IfStatement','もし点数が0と同じなら、',false],
      ['RepeatCount','1回くり返す。',false],
      ['RepeatWhile','点数が0と同じであるあいだ、くり返す。',true],
      ['RepeatUntil','点数が1と同じになるまで、くり返す。',true],
      ['Forever','ずっとくり返す。',true],
      ['ForEach','［1］の中身を先頭から一つずつ見て、次のことを行う。',false],
    ];
    test('control actors survive move duplicate remove and header edits', () => {
      const examples=[
        ['もしよこのばしょが0より大きければ、','  いまのばしょから、右へ2歩動く。',103,102],
        ['個体値回くり返す。','  いまのばしょから、右へ2歩動く。',121,120],
        ['よこのばしょが110より小さいあいだ、くり返す。','  いまのばしょから、右へ2歩動く。',111,110],
        ['よこのばしょが110以上になるまで、くり返す。','  いまのばしょから、右へ2歩動く。',111,110],
        ['ずっとくり返す。','  いまのばしょから、右へ2歩動く。\n  いまのくり返しを終える。',103,102],
        ['個体一覧の中身を先頭から一つずつ見て、次のことを行う。','  いまのばしょから、右へ2歩動く。',107,106],
      ];
      for(const [header,body,movedX,removedX] of examples){
        const source='いぬは、いまのばしょから、右へ1歩動く。\n'+header+'\n'+body,p=actorUnitFixture(source),
          s=createEditorSession('script:core-start',source,{targetId:'cat',event:'start'},p,0),b=s.blockView.bodies.body;
        for(const remove of [false,true]){
          const e=prepareBlockEdit(s,remove?{type:'remove',id:b[0].id}:{type:'move',id:b[1].id,parentId:s.blockView.id,body:'body',index:0}),
            expected={...s.syntaxAst,body:remove?[s.syntaxAst.body[1]]:[s.syntaxAst.body[1],s.syntaxAst.body[0]]};
          ok(astEquivalent(e.syntaxAst,expected),header+' actor and body AST');
          let text=e.source;for(let round=0;round<3;round++){text=formatScript(blockDecode(blockEncode(parseSyntax(text).ast).tree));ok(astEquivalent(expected,parseSyntax(text).ast));}
          for(const packed of [false,true]){const out=actorUnitRun(actorUnitFixture(text),packed);eq([out.cat,out.dog],[0,remove?removedX:movedX]);}
        }
      }
      for(const [kind,header,breaks] of actorUnitControls){
        const body='  いまのばしょから、右へ2歩動く。'+(breaks?'\n  いまのくり返しを終える。':''),source=header+'\n'+body+'\nいぬは、いまのばしょから、右へ1歩動く。',p=actorUnitFixture(source),
          s=createEditorSession('script:core-start',source,{targetId:'cat',event:'start'},p,0),b=s.blockView.bodies.body;
        eq(s.syntaxAst.body[0].kind,kind);
        for(const duplicate of [false,true]){
          const e=prepareBlockEdit(s,{type:duplicate?'duplicate':'move',id:b[0].id,parentId:s.blockView.id,body:'body',index:2});
          ok(e.source.includes('自分は、'),kind+' explicit relative control subject');
          const out=actorUnitRun(actorUnitFixture(e.source));eq([out.cat,out.dog],[duplicate?4:2,101]);
        }
      }
      const source='いぬは何もしない。\nもしよこのばしょが0より大きければ、\n  いまのばしょから、右へ2歩動く。',p=actorUnitFixture(source),s=createEditorSession('script:core-start',source,{targetId:'cat',event:'start'},p,0),
        e=prepareBlockEdit(s,{type:'field',id:s.blockView.bodies.body[1].id,key:'actorRef',value:{kind:'self'}});
      eq(e.syntaxAst.body[1].actorRef,{kind:'self'});eq(e.syntaxAst.body[1].thenBody[0].actorRef,{kind:'named',name:'いぬ'});
      eq(actorUnitRun(actorUnitFixture(e.source)).dog,100);
    });
    test('explicit control subjects preserve scope source and else', () => {
      for(const [kind,header,breaks] of actorUnitControls){
        const source='いぬは、'+header+'\n  自分は、いまのばしょから、右へ2歩動く。'+(breaks?'\n  いまのくり返しを終える。':'')+'\nいまのばしょから、右へ3歩動く。',p=actorUnitFixture(source),ast=parseSyntax(source).ast;
        ok(ast,source);eq(ast.body[0].kind,kind);eq(ast.body[0].actorRef,{kind:'named',name:'いぬ'});eq(ast.body[1].actorRef,{kind:'self'});
        const text=formatScript(blockDecode(blockEncode(ast).tree));ok(astEquivalent(ast,parseSyntax(text).ast));
        const s=createEditorSession('script:core-start',source,{targetId:'cat',event:'start'},p,0);eq(prepareBlockEdit(s,{type:'noop'}).source,source);
        const out=actorUnitRun(p);eq([out.cat,out.dog],[5,100]);
      }
      for(const inline of [false,true]){
        const source=inline?'いぬは、もし点数が1と同じなら、いまのばしょから、右へ9歩動く。\nそうでなければ、いまのばしょから、右へ2歩動く。\nいまのばしょから、右へ3歩動く。'
          :'いぬは、もし点数が1と同じなら、\n  いまのばしょから、右へ9歩動く。\nそうでなければ、\n  いまのばしょから、右へ2歩動く。\nいまのばしょから、右へ3歩動く。';
        const out=actorUnitRun(actorUnitFixture(source));eq([out.cat,out.dog],[3,102]);
        const ast=parseSyntax(source).ast;ok(astEquivalent(ast,parseSyntax(formatScript(ast)).ast));
      }
      for(const source of ['いぬは、そうでなければ、\n  何もしない。','いぬは、自分は、1回くり返す。\n  何もしない。'])ok(!parseSyntax(source).ast,source);
    });
    test('self analysis uses event or action entry target through every control', () => {
      for(const [kind,header,breaks] of actorUnitControls){
        const source='いぬは何もしない。\n'+header+'\n  自分は個体値を1増やす。'+(breaks?'\n  いまのくり返しを終える。':'');
        for(const action of [false,true]){
          const p=actorUnitFixture(action?'【試験】という手順を行う。':source);p.components[1].localData.variables=[];
          if(action)p.actions=[{id:'core-action',ownerId:'stage',name:'試験',args:[],source}];
          const out=actorUnitRun(p);eq(out.catValue,21);
        }
      }
      const stage=actorUnitFixture('画面は何もしない。\nもし点数が0と同じなら、\n  自分は、いまのばしょから、右へ2歩動く。');eq(actorUnitRun(stage).cat,2);
      const p=actorUnitFixture('いぬは何もしない。\nもし点数が0と同じなら、\n  自分は個体値を1増やす。');
      p.components[0].localData.variables=[];
      ok(compileProject(p).errors.some(d=>d.code==='S301'&&d.line===3),'reject missing self data even if dog has it');
    });
    test('function self stays at call entry through every control and nested call', () => {
      for(const [kind,header,breaks] of actorUnitControls){
        const source='この中だけで使う変数【結果】を作り、最初は0にする。\nいぬは何もしない。\n'+header+'\n  自分は【結果】を個体値にする。'+(breaks?'\n  いまのくり返しを終える。':'')+'\n【結果】を答えとして返す。',
          p=actorUnitFixture('（【調査】で求めた答え）を言う。\nいぬは（【調査】で求めた答え）を言う。\n自分は（【調査】で求めた答え）を言う。');
        p.functions=[{id:'core-function',ownerId:'stage',name:'調査',args:[],source}];
        for(const packed of [false,true])eq(actorUnitRun(p,packed).speech,[['cat','20'],['dog','10'],['cat','20']]);
        const ast=parseSyntax(source).ast;p.functions[0].source=formatScript(blockDecode(blockEncode(ast).tree));eq(actorUnitRun(p).speech,[['cat','20'],['dog','10'],['cat','20']]);
      }
      const p=actorUnitFixture('（【外側】で求めた答え）を言う。');p.functions=[
        {id:'core-inner',ownerId:'stage',name:'内側',args:[],source:'個体値を答えとして返す。'},
        {id:'core-outer',ownerId:'stage',name:'外側',args:[],source:'この中だけで使う変数【結果】を作り、最初は0にする。\nいぬは何もしない。\nもし点数が0と同じなら、\n  自分は【結果】を（【内側】で求めた答え）にする。\n【結果】を答えとして返す。'}];
      eq(actorUnitRun(p,true).speech,[['cat','20']]);
      const clone=actorUnitFixture('自分のコピーを作る。');clone.functions=structuredClone(p.functions);
      clone.scripts.push({id:'core-clone',targetId:'cat',event:'cloneStart',source:'個体値を30にする。\n（【外側】で求めた答え）を言う。'});
      for(const packed of [false,true])eq(actorUnitRun(clone,packed).speech.map(row=>row[1]),['30']);
    });
    test('numeric updates reject known declaration unit mismatch before effects', () => {
      const forms=['点数を1秒増やす。','点数を1秒減らす。','点数に1秒を足す。','点数から1秒を引く。','1秒を点数に足す。','1秒を点数から引く。'];
      for(const statement of forms){
        for(const individual of [false,true]){
          const p=actorUnitFixture('いまのばしょから、右へ10歩動く。\n'+(individual?'いぬは':'')+statement),d={id:'core-unit-score',name:'点数',initialValue:{magnitude:0,unit:'点'},expectedUnit:'点'};
          if(individual)p.components[1].localData.variables.push(d);else p.projectData.variables=[d];
          const errors=compileProject(p).errors;ok(errors.some(d=>d.code==='R417'&&d.line===2),statement);reject(()=>packExecutable(p),'X601');
          const ast=parseSyntax(p.scripts[0].source).ast;p.scripts[0].source=formatScript(blockDecode(blockEncode(ast).tree));ok(compileProject(p).errors.some(d=>d.code==='R417'));
        }
      }
    });
    test('list positions reject a known unit other than 番目 in every list form', () => {
      // A list position is counted in 番目 when it is read as well as when it is changed (LANGUAGE.md 番目).
      const forms=['個体一覧の（10歩）番目を言う。','個体一覧の（1秒）番目を言う。','個体一覧の（10歩）番目に1を入れる。','個体一覧の（10歩）番目を1にする。','個体一覧の（10歩）番目を消す。'];
      for(const statement of forms){
        const p=actorUnitFixture(statement);ok(compileProject(p).errors.some(d=>d.code==='R417'&&d.line===1),statement);reject(()=>packExecutable(p),'X601');
        const ast=parseSyntax(p.scripts[0].source).ast;p.scripts[0].source=formatScript(blockDecode(blockEncode(ast).tree));ok(compileProject(p).errors.some(d=>d.code==='R417'),statement+' through blocks');
      }
      eq(compileProject(actorUnitFixture('個体一覧の2番目を言う。')).errors,[]);
      // A position written with its 番目 role is the same position in the syntax comparison, for a read and for a change.
      for(const statement of ['個体一覧の2番目を言う。','個体一覧の2番目に1を入れる。']){
        const ast=parseSyntax(statement).ast,marked=structuredClone(ast);let positions=0;
        const mark=n=>{if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(mark);return;}
          if(['ListRead','ListInsert'].includes(n.kind)&&n.index?.kind==='NumberLiteral'){n.index={kind:'QuantityLiteral',value:n.index,unit:'番目'};positions++;}
          else if(['ListRead','ListInsert'].includes(n.kind)&&n.index?.kind==='QuantityLiteral'&&n.index.unit==='番目'){n.index=n.index.value;positions++;}
          for(const [key,child]of Object.entries(n))if(key!=='index')mark(child);};
        mark(marked);eq(positions,1);ok(astEquivalent(ast,marked),statement);
      }
    });
    test('diagnostic codes S310 S314 S316 R407 E705 are reached', () => {
      const codes=source=>compileProject(actorUnitFixture(source)).errors.map(d=>d.code);
      ok(codes('点数の1番目を消す。').includes('S310'),'a variable used as a list');
      ok(codes('点数を（いぬが3回おされる）にする。').includes('S314'),'a count condition outside まで');
      const same=actorUnitFixture('いぬのところへ行く。');same.projectData.variables.push({id:'core-same-name',name:'いぬ',initialValue:1});
      ok(compileProject(same).errors.some(d=>d.code==='S316'),'a variable named like a part');
      const model=new RuntimeModel(actorUnitFixture(''),{});reject(()=>model.requireActor({runtimeId:'no-such-part'}),'R407');
      // An extension session needs AbortController, which the browser run has and the node-product context does not;
      // the browser run of this suite reaches E705, the node run the four codes above.
      if(typeof AbortController!=='function')return;
      const contract=Akari.EXECUTABLE_CONTRACT,standard={languageContractId:contract.languageContractId,runtimeContractId:contract.runtimeContractId};
      const manifest={id:'audit.wrong-value',name:'ちがう値の拡張',version:'1.0.0',apiContract:1,standard,description:'試験',dependencies:[],capabilities:[],offline:true,selfContained:true,
        state:{formatVersion:1,initial:null},commands:[],events:[],calculations:[{id:'value',name:'ちがう値',description:'試験',args:[],returns:{type:'number',unit:null},async:false}]};
      const host=Akari.createAkariRuntime({extensions:[{manifest,factory:function wrongValue(){return{commands:{},calculations:{value(){return 'もじ';}},initialize(){},dispose(){}};}}]}).extensions;
      host.beginSession();try{reject(()=>host.invokeCalculation('audit.wrong-value/value',[]),'E705');}finally{host.endSession();}
    });
    test('signals from an extension beyond the active task limit end the flow with E708', () => {
      // As for E705, the extension session needs AbortController, which only the browser run of this suite has.
      if(typeof AbortController!=='function')return;
      const contract=Akari.EXECUTABLE_CONTRACT,standard={languageContractId:contract.languageContractId,runtimeContractId:contract.runtimeContractId};
      const manifest={id:'audit.many-signals',name:'合図の多い拡張',version:'1.0.0',apiContract:1,standard,description:'試験',dependencies:[],capabilities:[],offline:true,selfContained:true,
        state:{formatVersion:1,initial:null},commands:[],calculations:[],events:[{id:'ping',name:'合図',description:'試験',payload:{type:'number',unit:null}}]};
      let api=null;const R=Akari.createAkariRuntime({extensions:[{manifest,factory:given=>{api=given;return{commands:{},calculations:{}};}}]});
      const p=actorUnitFixture('ずっとくり返す。\n  1秒待つ。'),compiled=compileProject(p);eq(compiled.errors,[]);
      const q=new R.EventScheduler(p,compiled,new R.RuntimeModel(p),{});q.schedule=()=>{};
      try{
        q.start();while(q.ready.length)q.runTurn();eq(q.tasks.size,1);
        // The signals wait for the next turn; as many as there may be tasks are kept, one more ends the flow that runs.
        for(let i=0;i<R.LIMITS.activeTasks;i++)api.emit('ping',i);eq(q.errorRecords.length,0);
        api.emit('ping',0);eq(q.errorRecords.map(e=>[e.code,e.message]),[['E708','かくちょうからの 合図が 多すぎて、うけとりきれません']]);eq(q.tasks.size,0);
      }finally{q.stop();}
    });
    test('a signal from an extension received with the tasks full ends the flow with R413', () => {
      // A body that receives the extension's signal starts outside any running body (recheckBlocked): with every task in use,
      // its R413 is told as the stop of a flow, not thrown out of the scheduler (the run would stop and tell nothing).
      if(typeof AbortController!=='function')return;
      const contract=Akari.EXECUTABLE_CONTRACT,standard={languageContractId:contract.languageContractId,runtimeContractId:contract.runtimeContractId};
      const manifest={id:'audit.full-signals',name:'受け手の多い拡張',version:'1.0.0',apiContract:1,standard,description:'試験',dependencies:[],capabilities:[],offline:true,selfContained:true,
        state:{formatVersion:1,initial:null},commands:[],calculations:[],events:[{id:'ping',name:'合図',description:'試験',payload:{type:'number',unit:null}}]};
      // (a derived profile allows 3 tasks at once, so the run fills them with a few signals)
      let api=null;const R=Akari.createAkariRuntime({extensions:[{manifest,factory:given=>{api=given;return{commands:{},calculations:{}};}}],
        profiles:[{id:'audit.few-tasks',version:'1.0.0',limits:{activeTasks:3}}],profile:{id:'audit.few-tasks',version:'1.0.0'}});
      const p=actorUnitFixture('ずっとくり返す。\n  1秒待つ。');
      p.scripts.push({id:'receive',targetId:p.scripts[0].targetId,event:'start',source:''});Akari.updateScriptSource(p.scripts.at(-1),'「拡張:audit.full-signals/ping」という合図を受けたとき、\n  ずっとくり返す。\n    1秒待つ。',p);
      const compiled=compileProject(p);eq(compiled.errors,[]);
      const q=new R.EventScheduler(p,compiled,new R.RuntimeModel(p),{});q.schedule=()=>{};
      let escaped=null;
      try{
        q.start();while(q.ready.length)q.runTurn();
        eq(R.LIMITS.activeTasks,3);for(let i=0;i<3;i++)api.emit('ping',i);
        // (a flow that stops with a mistake pauses the run: a turn that does not run ends the loop)
        try{q.recheckBlocked();while(q.ready.length&&q.runTurn());}catch(error){escaped=error.code||String(error);}
        eq({escaped,codes:[...new Set(q.errorRecords.map(e=>e.code))]},{escaped:null,codes:['R413']});
      }finally{q.stop();}
    });
    test('a part name with replacement patterns stays as written in a proposal', () => {
      // $& and $1 in a name are ordinary letters; a proposal built from the name keeps them.
      for(const name of ['ね$&こ','ね$1こ','ね$$こ']){
        const p=actorUnitFixture('このキャラクターがおされたとき、\n  「あ」と言う。');p.components[0].name=name;
        const d=parseSyntax(p.scripts[0].source,{symbols:buildSymbols(p),targetId:'cat'}).syntaxDiagnostics[0];
        eq(d?.proposals?.map(x=>x.source),[name+'がおされたとき、']);
      }
    });
    test('an exported work opens every listed picture type and refuses another type, size or content', () => {
      const packed=JSON.parse(JSON.stringify(packExecutable(makeDefaultProject())));
      const opened=change=>{const data=JSON.parse(JSON.stringify(packed));change(data);let error=null;try{AKARI_RUNTIME.restoreExecutable(data);}catch(e){error=e.code+' '+e.message;}return error;};
      eq(packed.assets.map(a=>[a.kind,a.mime]),[['image','image/png']]);
      for(const mime of ['image/png','image/jpeg','image/webp'])eq(opened(d=>{d.assets[0].mime=mime;}),null);
      for(const [change,message]of [[d=>{d.assets[0].mime='image/gif';},'絵や音の しゅるいが 正しく ありません'],[d=>{d.assets[0].mime='audio/mpeg';},'絵や音の しゅるいが 正しく ありません'],
        [d=>{d.assets[0].kind='video';},'絵や音の 中身が 正しく ありません'],[d=>{d.assets[0].byteLength=0;},'絵や音の 中身が 正しく ありません'],
        [d=>{d.assets[0].byteLength+=1;},'絵や音の 大きさが 正しく ありません'],[d=>{d.assets[0].sha256='0'.repeat(64);},'絵や音の 中身が こわれて います'],
        [d=>{d.assets[0].dataBase64='***';},'絵や音の 中身を 表す 文字が 正しく ありません'],
        [d=>{d.schema='other';},'この 作品の ファイルは、この あかりでは 動かせません'],[d=>{d.runtimeContractId+=1;},'この 作品の ファイルは、この あかりでは 動かせません'],
        [d=>{d.surprise=1;},'この 作品の ファイルは、この あかりでは 動かせません'],
        // The work's parts and each tree's lists and values the run reads (a file that was changed after it was made).
        [d=>{d.project.stage.backdrops=null;},'作品の 中身が こわれて います'],[d=>{d.project.stage.backdrops=[];},'作品の 中身が こわれて います'],
        [d=>{d.project.components[0].costumes=[null];},'作品の 中身が こわれて います'],[d=>{d.project.sounds=[{name:'音'}];},'作品の 中身が こわれて います'],
        [d=>{d.project.actions=[null];},'作品の 中身が こわれて います'],[d=>{d.program[0].ast.body=[null];},'動きの 中身が こわれて います'],
        [d=>{d.program[0].ast.body[0].x=5;},'動きの 中身が こわれて います']])
        ok(String(opened(change)).startsWith('X602 '+message),message+': '+opened(change));
    });
    test('under a profile of its own limits, a 名人 move until a condition that calls a made block stops when it holds', () => {
      // Each read of the condition is calculated a step at a time (the profile's own number of function steps), and the
      // move reads it at each step, as with the standard limits: it stops when the score is 1, not at the edge.
      const run=R=>{const p=actorUnitFixture('0.5秒待つ。\n点数を1にする。');
        p.functions=[{id:'core-now',ownerId:'stage',name:'現在',args:['値'],source:'値を答えとして返す。'}];
        p.scripts.push({id:'core-move',mode:'meijin',targetId:'meijin',event:'start',source:'ねこは、1秒に60歩の速さで、【現在】（点数）が1以上になるまで右へ動き続ける。\nねこは「ついた」と言う。'});
        const compiled=compileProject(p);eq(compiled.errors,[]);
        let now=0;const said=[],r=new R.RuntimeModel(p,{}),q=new R.EventScheduler(p,compiled,r,{say:(id,text)=>said.push(now+':'+text)});r.now=()=>now;q.schedule=()=>{};
        try{q.start();for(let step=0;step<=300;step++){for(let i=0;i<500&&q.ready.length;i++)q.runTurn();q.recheckBlocked();now+=10;}
          return {said,x:Math.round(r.actor('cat').x),flows:q.tasks.size};}finally{q.stop();}};
      const standard=run(Akari.createAkariRuntime()),own=run(Akari.createAkariRuntime({profiles:[{id:'audit.more-steps',version:'1.0.0',limits:{functionOps:200000}}],profile:{id:'audit.more-steps',version:'1.0.0'}}));
      eq(standard,{said:['530:ついた'],x:31,flows:0});eq(own,standard);
    });
    test('under a profile of its own limits, every value of a sentence and a watched 名人 condition that call a made block are calculated a step at a time', () => {
      // A sentence is run with each of its values that calls a made block calculated first a step at a time (a place to
      // go, a move, a speed), and a 〜になったとき condition is read a step at a time too: the run ends as with the
      // standard limits, and no value the sentence reads still calls the made block.
      const run=R=>{const p=actorUnitFixture('画面の左下のはしから、右へ（【二倍】（10））歩、上へ0歩のばしょへ行く。\nいまのばしょから、右へ0歩、上へ（【二倍】（10））歩動く。\n点数を2にする。');
        p.functions=[{id:'core-double',ownerId:'stage',name:'二倍',args:['値'],source:'値×2を答えとして返す。'}];
        p.scripts.push({id:'core-move',mode:'meijin',targetId:'meijin',event:'start',source:'いぬは、1秒に（【二倍】（30））歩の速さで、ねこにふれるまで左へ動き続ける。\n【二倍】（点数）が4以上になったとき、ねこは「やった」と言う。'});
        const compiled=compileProject(p);eq(compiled.errors,[]);
        let now=0;const said=[],left=[],r=new R.RuntimeModel(p,{}),q=new R.EventScheduler(p,compiled,r,{say:(id,text)=>said.push(text)});r.now=()=>now;q.schedule=()=>{};
        const calls=v=>Array.isArray(v)?v.some(calls):!!v&&typeof v==='object'&&(v.kind==='UserFunctionCall'||Object.entries(v).some(([k,x])=>!['body','thenBody','elseBody','lanes'].includes(k)&&calls(x)));
        const execute=q.executePreparedNode.bind(q);q.executePreparedNode=(t,n,o)=>{if(calls(n))left.push(n.kind);return execute(t,n,o);};
        try{q.start();for(let step=0;step<=300;step++){for(let i=0;i<500&&q.ready.length;i++)q.runTurn();q.recheckBlocked();now+=10;}
          return {said,cat:[Math.round(r.actor('cat').x),Math.round(r.actor('cat').y)],dog:Math.round(r.actor('dog').x),flows:q.tasks.size,left:[...new Set(left)],watchSteps:Object.hasOwn(q.watches[0],'evaluator')};}finally{q.stop();}};
      const standard=run(Akari.createAkariRuntime()),own=run(Akari.createAkariRuntime({profiles:[{id:'audit.more-steps',version:'1.0.0',limits:{functionOps:200000}}],profile:{id:'audit.more-steps',version:'1.0.0'}}));
      eq(standard.said,['やった']);eq(standard.left.sort(),['MotionCommand','MoveUntil']);eq(standard.watchSteps,false);
      eq({...own,left:[],watchSteps:false},{...standard,left:[],watchSteps:false});eq(own.left,[]);eq(own.watchSteps,true);
    });
    test('a kept draft of a made block whose short call is no text is broken, and one over 80 characters is too long', () => {
      // (as the draft's other texts: F503 for a kept draft that is broken, F504 for one too long)
      const p=makeDefaultProject(),draft=extra=>({ownerId:'stage',type:'action',name:'とぶ',argsText:'',source:'',editId:'',loadedKey:'',...extra});
      const kept=callableDraft=>{try{Akari.validateEditorState({version:1,revision:0,selectedId:'stage',currentEvent:'start',selectedScriptId:null,uiLevel:'basic',sourceOverviewOpen:false,
        editorModes:{script:'code',draft:'code'},callableDraft,pendingEditors:'stop here',views:{}},p);return null;}catch(e){return e.code+' '+e.message;}};
      eq(kept(draft({callPhrase:'あ'.repeat(81)})),'F504 下書きの 文字が 多すぎます');
      for(const broken of [draft({callPhrase:5}),draft({type:'function',callPhrase:'とぶ'})])eq(kept(broken),'F503 下書きの 中身が こわれて います');
      eq(kept(draft({callPhrase:'とぶ'})),'F503 作文の 下書きが 正しく ありません','a short call of 80 characters at most passes, and the check goes on');
      // The draft's other texts and a work's parts and bodies say the same: broken is F503, too many or too long F504.
      for(const key of ['name','argsText','source','editId','loadedKey'])eq(kept(draft({[key]:null})),'F503 下書きの 中身が こわれて います',key);
      eq(kept(draft({name:'あ'.repeat(501)})),'F504 下書きの 文字が 多すぎます');
      const work=change=>{const q=makeDefaultProject();change(q);try{Akari.validateDesignProject(q);return null;}catch(e){return e.code;}};
      eq([work(q=>{q.components=null;}),work(q=>{q.scripts=5;}),work(q=>{q.components=Array.from({length:Akari.LIMITS.components+1},()=>q.components[0]);})],['F503','F503','F504']);
    });
    test('under a profile of its own limits, a made block that calls itself too deep stops with the same words', () => {
      // The answer calculated a step at a time (a profile's own number of function steps) says what the standard run says.
      const said=(R,source)=>{const p=actorUnitFixture('【深い】（1）を言う。');p.functions=[{id:'core-deep',ownerId:'stage',name:'深い',args:['値'],source}];
        const compiled=compileProject(p);eq(compiled.errors,[]);const errors=[],q=new R.EventScheduler(p,compiled,new R.RuntimeModel(p,{}),{runtimeError:(_,e)=>errors.push(e.code+' '+e.message)});q.schedule=()=>{};
        try{q.start();for(let i=0;i<500&&(q.ready.length||q.blocked.size)&&!errors.length;i++){q.runTurn();q.recheckBlocked();}return errors[0];}finally{q.stop();}};
      const standard=Akari.createAkariRuntime(),own=Akari.createAkariRuntime({profiles:[{id:'audit.more-steps',version:'1.0.0',limits:{functionOps:200000}}],profile:{id:'audit.more-steps',version:'1.0.0'}});
      // (a block that gives no answer is refused before it runs, S306: only the depth stops a run)
      for(const [source,code] of [['【深い】（値）を答えとして返す。','R408'],['【深い】（値＋1）を答えとして返す。','R408']]){
        const words=said(standard,source);ok(String(words).startsWith(code+' '),String(words));eq(said(own,source),words);
      }
      // (a made block's own list: changing an item past its end says the same words under both)
      const listed=(R)=>{const p=actorUnitFixture('【かえる】（1）を言う。');p.functions=[{id:'core-deep',ownerId:'stage',name:'かえる',args:['値'],source:'この中だけで使うリスト【L】を空で作る。\n【L】の3番目を1にかえる。\n値を答えとして返す。'}];
        const compiled=compileProject(p);eq(compiled.errors,[]);const errors=[],q=new R.EventScheduler(p,compiled,new R.RuntimeModel(p,{}),{runtimeError:(_,e)=>errors.push(e.code+' '+e.message)});q.schedule=()=>{};
        try{q.start();for(let i=0;i<500&&(q.ready.length||q.blocked.size)&&!errors.length;i++){q.runTurn();q.recheckBlocked();}return errors[0];}finally{q.stop();}};
      const replaced=listed(standard);ok(String(replaced).startsWith('R404 '),String(replaced));eq(listed(own),replaced);
    });
    test('a loop ended by このくり返しを終える waits for the next こま as a loop that ends by itself, when its turn changed the screen', () => {
      // LANGUAGE.md こまの数え方: after a turn that changed the screen and did not wait, the next こま comes before the next
      // turn or the sentence after the loop; a turn that only calculates or that waited goes on at once.
      const saidAt=source=>{const p=actorUnitFixture(source),compiled=compileProject(p);eq(compiled.errors,[]);
        let now=0;const said=[],r=new Akari.RuntimeModel(p,{}),q=new Akari.EventScheduler(p,compiled,r,{say:(id,text)=>said.push(now)});r.now=()=>now;q.schedule=()=>{};
        try{q.start();for(let ms=0;ms<60&&!said.length;ms++){for(let i=0;i<100&&q.ready.length;i++)q.runTurn();q.recheckBlocked();now+=1;}return said[0];}finally{q.stop();}};
      const counted=saidAt('1回くり返す。\n  いまのばしょから、右へ10歩動く。\n「a」と言う。');
      ok(counted>16&&counted<20,String(counted));
      for(const source of ['ずっとくり返す。\n  いまのばしょから、右へ10歩動く。\n  このくり返しを終える。\n「a」と言う。','3回くり返す。\n  いまのばしょから、右へ10歩動く。\n  もし 1が1 なら、\n    このくり返しを終える。\n「a」と言う。'])
        eq(saidAt(source),counted,source);
      eq(saidAt('ずっとくり返す。\n  点数を1ふやす。\n  このくり返しを終える。\n「a」と言う。'),0);
      // (a turn that waited 0.03 s goes on at once: before the こま after it, 33.3 ms)
      const waited=saidAt('ずっとくり返す。\n  いまのばしょから、右へ10歩動く。\n  0.03秒待つ。\n  このくり返しを終える。\n「a」と言う。');
      ok(waited>=30&&waited<33,String(waited));
    });
    test('a wait in which no time passed is no wait of the turn: the turn waits for the next こま', () => {
      // LANGUAGE.md こまの数え方: 「待った」 is a stop at a wait sentence during which time passed. A signal whose bodies
      // only calculate, a time of 0 and a condition another flow makes true at the same time end with no time passed.
      const saidAt=(source,extra=[])=>{const p=actorUnitFixture(source);p.scripts.push(...extra);const compiled=compileProject(p);eq(compiled.errors,[]);
        let now=0;const said=[],r=new Akari.RuntimeModel(p,{}),q=new Akari.EventScheduler(p,compiled,r,{say:(id,text)=>said.push(now)});r.now=()=>now;q.schedule=()=>{};
        try{q.start();for(let ms=0;ms<60&&!said.length;ms++){for(let i=0;i<100&&q.ready.length;i++)q.runTurn();q.recheckBlocked();now+=1;}return said[0];}finally{q.stop();}};
      const counted=saidAt('1回くり返す。\n  いまのばしょから、右へ10歩動く。\n「a」と言う。');
      ok(counted>16&&counted<20,String(counted));
      const receiver={id:'core-signal',targetId:'dog',event:'message',filter:{message:'計算'},source:'点数を1ふやす。'};
      eq(saidAt('1回くり返す。\n  いまのばしょから、右へ10歩動く。\n  「計算」の合図を送って、その合図で始まったことが全部終わるまで待つ。\n「a」と言う。',[receiver]),counted);
      eq(saidAt('1回くり返す。\n  いまのばしょから、右へ10歩動く。\n  0秒待つ。\n「a」と言う。'),counted);
      eq(saidAt('1回くり返す。\n  いまのばしょから、右へ10歩動く。\n  点数が1になるまで待つ。\n「a」と言う。',[{id:'core-other',targetId:'dog',event:'start',source:'点数を1ふやす。'}]),counted);
    });
    test('an exported work refuses a time of 〜秒のあいだ that is no value and parts that no saved work has', () => {
      // The run reads the time of 「10秒のあいだ、…動き続ける」 as a value, and each part's kind, numbers, shown or not,
      // text and colours as a saved work keeps them (validateDesignProject): a file changed after it was made is refused.
      const p=actorUnitFixture('「あ」と言う。');p.scripts.push({id:'core-meijin',mode:'meijin',targetId:'meijin',event:'start',source:'10秒のあいだ、ねこは1秒に20歩の速さで前へ動き続ける。'});
      eq(compileProject(p).errors,[]);
      const packed=JSON.parse(JSON.stringify(packExecutable(p)));
      const opened=change=>{const data=JSON.parse(JSON.stringify(packed));change(data);try{AKARI_RUNTIME.restoreExecutable(data);return null;}catch(e){return e.code+' '+e.message;}};
      const move=d=>d.program.find(item=>item.key==='script:core-meijin').ast.body[0],cat=d=>d.project.components.find(c=>c.id==='cat');
      eq(move(packed).kind,'MoveUntil');eq(opened(()=>{}),null);
      for(const [name,change] of [['a time of 5',d=>{move(d).duration=5;}],['a time of text',d=>{move(d).duration='abc';}],['a time of no kind',d=>{move(d).duration={foo:1};}],
        ['a place of text',d=>{cat(d).x='abc';}],['a width below 8',d=>{cat(d).w=-5;}],['a scale of 0',d=>{cat(d).scalePercent=0;}],['a letter size over 200',d=>{cat(d).fontSize=500;}],
        ['shown as text',d=>{cat(d).visible='yes';}],['a kind no work has',d=>{cat(d).type='rocket';}],['a text of a number',d=>{cat(d).text=5;}],['a colour of no colour',d=>{cat(d).fg='red';}]])
        ok(String(opened(change)).startsWith('X602 '),name+': '+opened(change));
    });
    test('an exported work opens with the forms its trees are made of and refuses a tree without a part the run reads', () => {
      // Each form 名人 text makes opens as it was made (the forms the blocks make open in the tests above and below).
      const fixture=()=>{const p=actorUnitFixture('1秒待つ。\nもし 1が1 なら、\n  「あ」と言う。\n10回くり返す。\n  いまのばしょから、右へ1歩動く。');
        p.projectData.lists=[{id:'core-names',name:'名前一覧',initialValue:[1,2]},{id:'core-friends',name:'なかま',initialValue:[]}];return p;};
      const meijin=fixture();meijin.scripts.push({id:'core-meijin',mode:'meijin',targetId:'meijin',event:'start',source:['ねこといぬは2秒かけて、いまのばしょから、右へ40歩動く。',
        'ねこのコピーを2つ作る。','できたコピーは、それぞれ前へ10歩進んでから、消える。','2秒のあいだ、くり返す。\n  1秒待つ。','ねこは、1秒に20歩の速さで、いぬにふれるまで前へ動き続ける。',
        'ねこの動きを止める。','ねこの音を止める。','ねこのコピーを全部消す。','ねこが話し終わるまで待つ。','ねこといぬのうち、右にいるほうは「勝ち！」と言う。','ねこは、いちばん近いいぬの方を向く。',
        '名前一覧から1を全部消す。','ねこは、名前一覧を一つずつ順に1秒話す。','ねこは、ねこの名前を言う。','ねこは、ねこのコピーの数を言う。','いぬにふれているものは、みんな「いたい」と言う。','いぬに「出発」と知らせる。',
        'ねこといぬは、それぞれ「はい」と言う。','なかまを、ねこといぬにする。','いぬ以外のなかまは「はい」と言う。','なかまのだれか一人が「はい」と言う。'].join('\n')});
      eq(compileProject(meijin).errors,[]);
      const kinds=new Set(),walk=v=>{if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'){if(typeof v.kind==='string')kinds.add(v.kind+(v.speaksAs?' speaksAs':''));Object.values(v).forEach(walk);}};
      walk(AKARI_RUNTIME.restoreExecutable(JSON.parse(JSON.stringify(packExecutable(meijin)))).compiled.items.map(item=>item.ast));
      for(const kind of ['Parallel','ParallelEach','TimedRepeat','MoveUntil','ListRemoveValue','PartName','CreatedCopies','PartRef','PartFamily','PartExcept','PartRandom','PartPick','PartNearest','PartsTouching','PartState','ForEach speaksAs'])
        ok(kinds.has(kind),kind+' is in the work that opened');
      // A file changed after it was made: a part of a sentence or a value the run reads is gone or of another kind, a
      // form no run has, the extensions in the work, or a body saved without an ID whose owner, event or ID differ.
      const packed=JSON.parse(JSON.stringify(packExecutable(fixture()))),plain=JSON.parse(JSON.stringify(packExecutable(makeDefaultProject())));
      const opened=(from,change)=>{const data=JSON.parse(JSON.stringify(from));change(data);try{AKARI_RUNTIME.restoreExecutable(data);return null;}catch(e){return e.code+' '+e.message;}};
      const body=d=>d.program.find(item=>item.key==='script:core-start').ast.body,first=v=>d=>{body(d).unshift(v);},N=value=>({kind:'NumberLiteral',value});
      eq(opened(packed,()=>{}),null);eq(opened(plain,()=>{}),null);
      // (a name read with no place written is read with none, as the run reads it)
      eq(opened(packed,first({kind:'Say',value:{kind:'VariableRead',name:'点数'}})),null);
      for(const [name,change] of [['a wait without its time',d=>{delete body(d)[0].seconds;}],['もし without its condition',d=>{delete body(d)[1].condition;}],
        ['もし without the sentences it does',d=>{delete body(d)[1].thenBody;}],['もし without the sentences it does otherwise',d=>{delete body(d)[1].elseBody;}],
        ['もし whose そうでなければ is no true or false',d=>{body(d)[1].hasElse='yes';}],['a repeat without its body',d=>{delete body(d)[2].body;}],
        ['a speech without its words',first({kind:'Say'})],['a speech whose words are a number',first({kind:'Say',value:5})],
        ['sentences done together in a lane of nothing',first({kind:'Parallel',lanes:[null]})],['sentences done together that are no lanes',first({kind:'Parallel',lanes:5})],
        ['a signal to parts that are no list',first({kind:'Broadcast',message:{kind:'StringLiteral',value:'x'},targets:5})],
        ['a call of a made block without its inputs',first({kind:'UserActionCall',name:'x'})],['a size without the size',first({kind:'LooksCommand',op:'SET_SCALE',args:[]})],
        ['a sentence no run has',first({kind:'Foo'})],['a value no run has',first({kind:'Say',value:{kind:'Bar'}})],['a look no run has',first({kind:'LooksCommand',op:'ZZZ',args:[]})],
        ['a sum without its right side',first({kind:'Say',value:{kind:'BinaryExpression',op:'ADD',left:N(1)}})],['a change without what it changes',first({kind:'Assignment',value:N(1)})],
        ['a variable read from no place',first({kind:'Say',value:{kind:'VariableRead',name:'点数',qualifier:'nowhere'}})]])
        ok(String(opened(packed,change)).startsWith('X602 動きの 中身が こわれて います'),name+': '+opened(packed,change));
      ok(String(opened(packed,first({kind:'Say',value:{kind:'StringLiteral',value:'あ'},speaksAs:{kind:'named',name:'だれでもない'}}))).startsWith('X602 動かす キャラクターや 部品が 正しく ありません'));
      ok(String(opened(packed,d=>{d.project.extensions={required:5};})).startsWith('X602 作品の 中身が こわれて います'));
      eq(plain.program[0].key,'script:sprite-1:start');
      for(const change of [d=>{d.program[0].targetId='nobody';},d=>{d.program[0].event='click';},d=>{d.program[0].id='other';}])
        ok(String(opened(plain,change)).startsWith('X602 動きの 中身が こわれて います'),String(opened(plain,change)));
    });
    test('an exported work with a message, a key and a touching heading opens and runs as it was made', () => {
      // A heading's filter keeps text ({message:'合図'}, {key:'a'}, {target:'端'}): the check of a sentence's values does
      // not read it as one of them.
      const p=makeDefaultProject(),sprite=p.components.find(c=>c.type==='sprite');p.projectData.variables=[{id:'got',name:'受信数',initialValue:0}];p.scripts=[];
      for(const [id,targetId,source] of [['send','stage','みんなに「合図」と知らせる。'],['receive',sprite.id,'「合図」という知らせを受け取ったとき、'+sprite.name+'は、\n  受信数を1増やす。'],
        ['key',sprite.id,'「a」キーを押すたびに、'+sprite.name+'は、\n  受信数を1増やす。'],['touch',sprite.id,sprite.name+'が画面のはしにふれたとき、\n  受信数を1増やす。']]){
        const script={id,targetId,event:'start',source:''};p.scripts.push(script);Akari.updateScriptSource(script,source,p);
      }
      eq(p.scripts.map(s=>s.filter),[null,{message:'合図'},{key:'a'},{target:'端'}]);
      const loaded=AKARI_RUNTIME.restoreExecutable(JSON.parse(JSON.stringify(packExecutable(p))));
      eq(loaded.compiled.items.map(item=>JSON.stringify(item.ast.heading?.filter??null)).sort(),['null','{"key":"a"}','{"message":"合図"}','{"target":"端"}']);
      const r=new RuntimeModel(loaded.project),q=new EventScheduler(loaded.project,loaded.compiled,r,{});let clock=0;r.now=()=>clock;q.schedule=()=>{};
      try{q.start();for(let i=0;i<100&&q.ready.length;i++)q.runTurn();eq(q.errorRecords,[]);eq(r.projectVars.get('受信数'),1);}finally{q.stop();}
    });
    test('formatting refuses a syntax tree with a statement or value it does not know', () => {
      const ast=parseSyntax('「あ」と言う。').ast;eq(formatScript(ast),'「あ」と言う。');
      // A part's own condition as the blocks make it (自分の（「星」にふれている）) is written back with its subject.
      {const own=parseSyntax('もし「星」にふれているなら、次のことをする。\n  何もしない。',{symbols:buildSymbols(makeDefaultProject()),targetId:'sprite-1'}).ast;
       own.body[0].condition={kind:'ActorQualifiedRead',actorRef:{kind:'self'},value:own.body[0].condition};
       eq(formatScript(own),'もし条件（自分の（「星」にふれている））が成り立つなら、\n  何もしない。');}
      for(const broken of [{...ast,body:[{kind:'NoSuchKind'}]},{...ast,body:[{...ast.body[0],value:{kind:'NoSuchValue'}}]}]){
        let code=null;try{formatScript(broken);}catch(e){code=e.code;}eq(code,'P210');
      }
    });
    test('a fix shows the sentence as it writes it, a fix of several lines keeps the body under its heading', () => {
      const told=(source,options)=>parseSyntax(source,options).syntaxDiagnostics.map(d=>[d.message,d.proposals?.map(x=>x.source)]);
      eq(told('すがたをかえる。'),[['どの すがたに するかを 書きます。つぎの すがたに する ときは「次のすがたにかえる」と 書きます',['次のすがたにかえる']]]);
      eq(told('ねこは、すがたをかえる。'),[['どの すがたに するかを 書きます。つぎの すがたに する ときは「ねこは次のすがたにかえる」と 書きます',['ねこは次のすがたにかえる']]]);
      eq(told('もし点数が10をこえたら、「あ」と言う。')[0][1],['もし点数が10より大きければ、\n  「あ」と言う']);
      // A sound or a signal of the work is named in 「 」.
      const p=actorUnitFixture('');p.sounds=[{id:'contract-sound-do',name:'ド',assetId:'contract-sound-asset'}];
      const symbols={symbols:buildSymbols(p),targetId:'cat'};
      eq(told('ドの音を鳴らす。',symbols),[['音の 名前は「 」で かこんで 書きます',['「ド」を鳴らす']]]);
      eq(told('スタートの合図を送る。',symbols),[['合図の 名前は「 」で かこんで 書きます',['「スタート」の合図を送る']]]);
    });
    test('formatting writes a subject only where the sentence before does not carry it, and keeps comments', () => {
      const symbols={symbols:buildSymbols(actorUnitFixture('')),targetId:'cat'},formatted=source=>formatScript(parseSyntax(source,symbols).ast);
      eq(formatted('ねこは、もし点数が1なら、\n  ねこは前へ10歩進む。\n  いぬは前へ10歩進む。\n  ねこは前へ10歩進む。'),'ねこは、もし点数が1なら、\n  前へ10歩進む。\n  いぬは前へ10歩進む。\n  ねこは前へ10歩進む。');
      eq(formatted('※はじめ\nもし点数が1なら、\n  ※なか\n  前へ10歩進む。'),'※はじめ\nもし点数が1なら、\n  ※なか\n  前へ10歩進む。');
      eq(formatted('前へ10歩進む。 ※メモ'),'前へ10歩進む。  ※メモ');
      // A sentence of 自分 after one of a named part (as blocks can put them) says 自分.
      const named=parseSyntax('ねこは前へ10歩進む。',symbols).ast,own=parseSyntax('前へ10歩進む。',symbols).ast;
      eq(formatScript({...own,body:[named.body[0],own.body[0]]}),'ねこは前へ10歩進む。\n自分は前へ10歩進む。');
    });
    test('a list value written with 番目 keeps the unit when meanings are compared', () => {
      // Only the place of a list command takes 番目 as its role; a value stored in the list keeps it.
      const ast=source=>parseSyntax(source).ast;
      ok(!astEquivalent(ast('名前一覧の1番目を5番目にする。'),ast('名前一覧の1番目を5にする。')),'the value of a list replace');
      ok(!astEquivalent(ast('名前一覧の2番目に3番目を入れる。'),ast('名前一覧の2番目に3を入れる。')),'the value of a list insert');
    });
    test('名人 messages name the part that does the sentence', () => {
      const errors=source=>{const p=actorUnitFixture(source);Object.assign(p.scripts[0],{targetId:'meijin',mode:'meijin'});return compileProject(p).errors.map(e=>[e.code,e.line,e.message]);};
      eq(errors('作品を動かしたとき、自分は、\n  前へ10歩進む。'),[['S304',1,'名人の 本文には「自分」に あたる 部品が ありません。見出しの「自分は、」を 部品の 名前に します。れい：作品を動かしたとき、ねこは、']]);
      eq(errors('作品を動かしたとき、\n  「あ」と言う。'),[['S304',2,'名人の 本文では、だれが するかを 文の はじめに 書きます。れい：ねこは「あ」と言う。']]);
      // After a sentence of several parts, and under a もし, the subject is not carried on.
      for(const source of ['作品を動かしたとき、\n  ねこといぬは、前へ10歩進む。\n  「あ」と言う。','作品を動かしたとき、\n  もし点数が1なら、\n    「あ」と言う。']){
        const ended=errors(source);
        eq(ended.map(e=>e.slice(0,2)),[['S304',3]]);ok(ended[0][2].startsWith('すぐ前の 文からは 主語を 引きつげません')&&ended[0][2].endsWith('れい：ねこは「あ」と言う。'),ended[0][2]);
      }
      // マウス or a colour is looked at with もし, and the もし names who touches.
      eq(errors('いぬが「マウス」にふれたとき、\n  いぬは「あ」と言う。'),[['P205',1,'「ふれたとき」の 相手は、部品か 画面のはしです。マウスの やじるしが 重なったかは、「もしいぬが「マウス」にふれていれば、」で しらべます']]);
      eq(errors('いぬが「赤」の色にふれたとき、\n  いぬは「あ」と言う。'),[['P205',1,'「ふれたとき」の 相手は、部品か 画面のはしです。色に ふれたかは、「もしいぬが「赤」の色にふれていれば、」で しらべます']]);
      // Outside 名人 the script is the part's own, so the もし names nobody.
      const plain=source=>compileProject(actorUnitFixture(source)).errors.map(e=>[e.code,e.line,e.message]);
      eq(plain('「マウス」にふれたとき、\n  「あ」と言う。'),[['P205',1,'「ふれたとき」の 相手は、部品か 画面のはしです。マウスの やじるしが 重なったかは、「もし「マウス」にふれていれば、」で しらべます']]);
      eq(plain('「赤」の色にふれたとき、\n  「あ」と言う。'),[['P205',1,'「ふれたとき」の 相手は、部品か 画面のはしです。色に ふれたかは、「もし「赤」の色にふれていれば、」で しらべます']]);
    });
    test('unit updates keep unknown unitless and shadowed values available', () => {
      for(const increment of ['1','1だけ','1点','1点だけ','（1秒）の数だけ','（1秒の数だけ）','増分']){
        const p=actorUnitFixture('点数を'+increment+'増やす。');p.projectData.variables=[{id:'core-score',name:'点数',initialValue:{magnitude:0,unit:'点'},expectedUnit:'点'},{id:'core-delta',name:'増分',initialValue:1}];
        eq(compileProject(p).errors,[]);eq(actorUnitRun(p).projectValues.点数,{magnitude:1,unit:'点'});
        p.scripts[0].source=p.scripts[0].source.replace('増やす','減らす');eq(actorUnitRun(p).projectValues.点数,{magnitude:-1,unit:'点'});
      }
      const unknown=actorUnitFixture('点数を増分増やす。');unknown.projectData.variables=[{id:'core-score',name:'点数',initialValue:{magnitude:0,unit:'点'},expectedUnit:'点'},{id:'core-delta',name:'増分',initialValue:{magnitude:1,unit:'秒'}}];
      eq(compileProject(unknown).errors,[]);ok(packExecutable(unknown),'mutable increment remains a runtime check');actorUnitRun(unknown,true,'R417');
      const unconstrained=actorUnitFixture('点数を1秒増やす。');unconstrained.projectData.variables[0].initialValue={magnitude:0,unit:'点'};eq(compileProject(unconstrained).errors,[]);
      for(const local of [false,true]){
        const p=actorUnitFixture(local?'【試験】という手順を行う。':'（0秒）を渡して、【試験】という手順を行う。');
        p.projectData.variables[0].expectedUnit='点';p.actions=[{id:'core-shadow',ownerId:'stage',name:'試験',args:local?[]:['点数'],source:(local?'この中だけで使う変数【点数】を作り、最初は0秒にする。\n':'')+'点数を1秒増やす。'}];
        eq(compileProject(p).errors,[]);actorUnitRun(p);
      }
    });

    test('timer reset is an effect in value-returning definitions', () => {
      const p=makeDefaultProject();p.functions=[{id:'timer-pure',ownerId:'stage',name:'試す',args:[],source:'タイマーを0にする。\n1を答えとして返す。'}];
      ok(compileProject(p).errors.some(e=>e.code==='S305'));
      ok(!hintCandidates(p,'stage',{definitionKind:'function',source:''}).some(h=>h.id==='TimerReset'&&h.enabled));
      p.functions=[];p.scripts=[{id:'timer-main',targetId:p.components[0].id,event:'start',source:'タイマーを0にする。'}];eq(compileProject(p).errors,[]);
    });
    test('touch wait guidance is conditional and excludes unresolved or compound conditions', () => {
      const p=makeDefaultProject(),base=p.components.find(c=>c.type==='sprite');
      p.components=[['ねこ',100],['星',105]].map(([name,x],i)=>({...structuredClone(base),id:'wait-'+i,name,x,y:100,costumes:[{id:'wait-face-'+i,name:'丸',kind:'text',value:'●'}],costumeId:'wait-face-'+i}));
      p.projectData.variables.push({id:'wait-target',name:'相手',initialValue:'星'});
      for(const [condition,notice]of [['「星」にふれるまで待つ。',true],['相手にふれるまで待つ。',false],['条件（「星」にふれていない）が成り立つまで待つ。',false],['条件（「星」にふれているまたは1が1と同じ）が成り立つまで待つ。',false],['条件（「星」にふれているかつ1が1と同じ）が成り立つまで待つ。',false]]){
        p.scripts=[{id:'wait-main',targetId:'wait-0',event:'start',source:condition+'\nいまのばしょから、右へ10歩動く。'}];
        const c=compileProject(p);eq(c.errors,[]);const notes=c.notes.filter(n=>n.code==='I134');eq(notes.length,notice?1:0);
        if(notice){ok(notes[0].message.includes('まだ ふれて いない ときは'));ok(!notes[0].message.includes('待ちつづけます'));}
      }
    });
    test('variable wait notice: only this flow changes the variable, and only after the wait', () => {
      // I139: 点数が1になるまで待つ。犬は点数を1にする。 waits for ever when 点数 is not 1 as the wait starts; not when the
      // variable is changed before the wait, in another body, in a lane that runs with it, or by nothing, nor when the
      // condition reads something that changes by itself.
      const p=makeDefaultProject(),base=p.components.find(c=>c.type==='sprite');
      p.components=['ねこ','犬'].map((name,i)=>({...structuredClone(base),id:'vwait-'+i,name,costumes:[{id:'vwait-face-'+i,name:'丸',kind:'text',value:'●'}],costumeId:'vwait-face-'+i}));
      p.projectData.variables.push({id:'vwait-score',name:'点数',initialValue:0});
      const notes=(source,{meijin=false,other=null}={})=>{p.scripts=[{id:'vwait-main',targetId:meijin?'meijin':'vwait-0',...meijin?{mode:'meijin'}:{},event:'start',source},...other?[{id:'vwait-other',targetId:'vwait-1',event:'start',source:other}]:[]];
        const c=compileProject(p);eq(c.errors,[]);return c.notes.filter(n=>n.code==='I139');};
      for(const source of ['ねこは、点数が1になるまで待つ。犬は点数を1にする。','点数が1になるまで待つ。\n点数を1にする。','点数＋1が3になるまで待つ。\n点数を2にする。','ずっとくり返す。\n  点数が1になるまで待つ。\n  点数を0にする。','点数が1になるまで待つ。\n「数は？」とたずねて、答えを待つ。\n点数を答えにする。','作品の点数が1になるまで待つ。\n点数を1にする。']){
        const [note,...more]=notes(source);eq(more,[]);ok(note.message.startsWith('「点数」を かえる 文は、この 本文の この 文より あとに しか ありません。'));ok(note.message.includes('「同じ きっかけの 本文を ふやす」'));}
      ok(notes('ねこは、点数が1になるまで待つ。犬は点数を1にする。',{meijin:true})[0].message.includes('「次のことを同時に始める。」の 中に'));
      // Each heading of a 名人 body is a flow of its own.
      eq(notes('作品を動かしたとき、\n  ねこは10歩進む。\n「スペース」キーがおされたとき、\n  点数が1になるまで待つ。\n  点数を1にする。',{meijin:true}).length,1);
      // A condition that also reads what changes by itself (the timer) may become true while waiting.
      eq(notes('点数がタイマーより大きくなるまで待つ。\n点数を100にする。'),[]);
      for(const [source,options]of [['点数を1にする。\n点数が1になるまで待つ。\n点数を2にする。',{}],['点数が1になるまで待つ。\n点数を1にする。',{other:'1秒待つ。\n点数を1にする。'}],['点数が1になるまで待つ。\n10歩進む。',{}],
        ['次のことを同時に始める。\n  点数が1になるまで待つ。\n  点数を1にする。\nねこは10歩進む。',{meijin:true}],['タイマーが3より大きくなるまで待つ。\nタイマーを0にする。',{}]])
        eq(notes(source,options),[]);
      // Nor for a variable of a part (each part has its own), a work variable that a part's variable shares its name with,
      // or a change in a procedure (it may be called from anywhere).
      p.components[0].localData={variables:[{id:'vwait-own',name:'体力',initialValue:5}],lists:[]};
      eq(notes('体力が1になるまで待つ。\n体力を1にする。'),[]);
      // A condition that also reads a part's variable is no condition of work variables only.
      eq(notes('点数＋体力が3になるまで待つ。\n点数を2にする。'),[]);
      eq(notes('作品の点数＋体力が3になるまで待つ。\n点数を2にする。'),[]);
      // 自分の点数 is the part's own 点数, not the work's: where the part has none, the line does not compile (S301) and no
      // I139 stands beside the error.
      {p.scripts=[{id:'vwait-main',targetId:'vwait-0',event:'start',source:'自分の点数が1になるまで待つ。\n点数を1にする。'}];const c=compileProject(p);
        eq(c.errors.map(e=>e.code),['S301']);eq(c.notes.filter(n=>n.code==='I139'),[]);}
      p.components[1].localData={variables:[{id:'vwait-same',name:'点数',initialValue:0}],lists:[]};
      eq(notes('点数が1になるまで待つ。\n点数を1にする。'),[]);
      eq(notes('作品の点数が1になるまで待つ。\n点数を1にする。'),[]);
      p.components[1].localData={variables:[],lists:[]};
      p.actions=[{id:'vwait-action',ownerId:'stage',name:'上げる',args:[],source:'点数を1にする。'}];
      eq(notes('点数が1になるまで待つ。\n【上げる】という手順を行う。'),[]);
      p.actions=[];
    });
    test('scoped scalar expressions and quoted list names execute',()=>{
      const p=actorUnitFixture();p.projectData.variables=[];for(const c of p.components)c.localData={variables:[],lists:[]};
      p.projectData.lists=[{id:'advice-list',name:'買うもの',initialValue:['りんご']}];
      p.scripts[0].source='【買うもの】を言う。';const d=compileProject(p).errors.find(x=>x.code==='S304');ok(d?.message.includes('【買うもの】の1番目を言う'));
      p.scripts[0].source='【買うもの】の1番目を言う。';eq(actorUnitRun(p).speech.map(x=>x[1]),['りんご']);
      for(const name of ['いぬ','犬\\','犬\\内'])for(const prefix of ['', 'この中だけで使うリスト点数を空で作る。\n','［10］の各要素を点数として、次のことをくり返す。\n  ']){
        p.components[1].name=name;p.components[1].localData.variables=[{id:'advice-scalar',name:'点数',initialValue:3}];
        const value=formatExpression({kind:'ActorQualifiedRead',actorRef:{kind:'named',name},value:{kind:'VariableRead',name:'点数',qualifier:'self'}});
        p.actions=[{id:'advice-action',ownerId:'stage',name:'試す',args:[],source:prefix+value+'を言う。'}];p.scripts[0].source='【試す】という手順を行う。';
        for(const packed of [false,true])eq(actorUnitRun(p,packed).speech.map(x=>x[1]),['3']);
      }
    });
    test('connected rotations preserve sequence and genuine repeat choices',()=>{
      for(const n of [2,3,20]){const r=parseSyntax('前へ1歩進んで、右に1度回ってから、'.repeat(n)+'何もしない。');ok(r.ast,JSON.stringify(r.syntaxDiagnostics));eq(r.ast.body.length,n*2+1);for(let i=0;i<n;i++){eq(r.ast.body[i*2].op,'MOVE');eq(r.ast.body[i*2+1].op,'TURN_RIGHT');}}
      for(const count of ['2','【回数】']){const d=parseSyntax(count+'回前へ1歩進んで、何もしない。').syntaxDiagnostics[0];ok(d.message.includes('どこまでを'));eq(d.proposals.length,2);for(const p of d.proposals)ok(parseSyntax(p.source).ast);}
    });
    test('touch event advice preserves explicit toucher identity',()=>{
      for(const meijin of [false,true]){
        const p=actorUnitFixture('いぬが「星」にふれるまで待つ。\nいぬは、いまのばしょから、右へ10歩動く。');
        p.components.push({...structuredClone(p.components[0]),id:'advice-star',name:'星',x:300,w:10,h:10,costumes:[{id:'advice-star-face',name:'丸',kind:'text',value:'●'}],costumeId:'advice-star-face',localData:{variables:[],lists:[]}});
        if(meijin)Object.assign(p.scripts[0],{targetId:'meijin',mode:'meijin'});
        const c=compileProject(p);eq(c.errors,[]);const note=c.notes.find(n=>n.code==='I134');ok(note.message.includes('いぬが「星」にふれたとき、'));
        p.scripts[0].source='いぬが「星」にふれたとき、\n  いぬは「接触」と言う。';const compiled=compileProject(p);eq(compiled.errors,[]);eq([compiled.items[0].targetId,compiled.items[0].event,compiled.items[0].filter],['dog','touchStart',{target:'星'}]);
        const said=[],r=new RuntimeModel(p),q=new EventScheduler(p,compiled,r,{say:(id,text)=>said.push([id,text])});let clock=0;r.now=()=>clock;q.schedule=()=>{};
        try{q.start();q.pollWatches();r.actor('cat').x=300;clock+=17;q.pollWatches();while(q.ready.length)q.runTurn();eq(said,[]);r.actor('dog').x=300;clock+=17;q.pollWatches();while(q.ready.length)q.runTurn();eq(said,[['dog','接触']]);}finally{q.stop();}
      }
    });
    test('motion comma omission preserves both leg spellings and axis order',()=>{
      for(const prefix of ['いまのばしょから','画面の左下のはしから'])for(const x of ['右へ10歩','10歩右へ'])for(const y of ['上へ5歩','5歩上へ'])for(const legs of [[x,y],[y,x]]){
        const end=prefix.startsWith('画面')?'のばしょへ行く。':'動く。',canonical=parseSyntax(prefix+'右へ10歩、上へ5歩'+end).ast;
        for(const comma of ['', '、']){const source=prefix+legs.join(comma)+end,parsed=parseSyntax(source);ok(parsed.ast,source);ok(astEquivalent(parsed.ast,canonical),source);ok(astEquivalent(blockDecode(blockEncode(parsed.ast).tree),canonical),source);}
      }
      for(const legs of ['10歩右へ5歩左へ','右へ10歩5歩左へ'])ok(parseSyntax('いまのばしょから'+legs+'動く。').syntaxDiagnostics.some(d=>d.code==='P205'));
      const chain='いまのばしょから、右へ10歩動いて、いまのばしょから、左へ10歩動いて、いまのばしょから、上へ10歩動く。';
      const connected=parseSyntax(chain);ok(connected.ast);eq(connected.ast.body.length,3);
      ok(astEquivalent(connected.ast,parseSyntax(chain.replaceAll('動いて、','動く。\n')).ast));
      const late=parseSyntax(chain.replace('動く。','動いて、1秒休む。')).syntaxDiagnostics;ok(late.length);ok(!late[0].message.includes('1つずつ'));
      for(const prefix of ['','いまのばしょから、']){const d=parseSyntax(prefix+'右へ1歩、上へ2歩、左へ3歩動く。').syntaxDiagnostics;ok(d.length&&d[0].code==='P205');ok(d[0].message.includes('1つずつ'));}
    });
    test('unfinished meaning choices require explicit angle or list index',()=>{
      const project=makeDefaultProject();project.projectData.lists=[{id:'meaning-list',name:'持ち物',initialValue:['本','ぼうし']}];
      const context={symbols:buildSymbols(project),targetId:'sprite-1',event:'start'};
      for(const extra of ['', '\n1秒休む。']){
        const repeat=parseSyntax('10歩進む。右に曲がる。4回くり返す。'+extra,context);eq(repeat.ast,null);eq(repeat.syntaxDiagnostics[0].proposals.length,2);
        for(const proposal of repeat.syntaxDiagnostics[0].proposals){eq(proposal.input.kind,'angle');eq(proposal.source.slice(proposal.input.offset,proposal.input.offset+proposal.input.marker.length),'〔角度をえらぶ〕');eq(parseSyntax(proposal.source,context).ast,null);}
        const list=parseSyntax('持ち物に「〔番号を入れる〕」を入れる。'+extra,context);eq(list.ast,null);eq(list.syntaxDiagnostics[0].proposals.length,2);
        const [append,replace]=list.syntaxDiagnostics[0].proposals;eq(append.input,undefined);eq(replace.input.kind,'index');eq(replace.source.slice(replace.input.offset,replace.input.offset+replace.input.marker.length+2),'〔番号を入れる〕番目');eq(parseSyntax(replace.source,context).ast,null);
      }
    });
    test('delimiter diagnostics count Unicode characters on physical lines',()=>{
      for(const prefix of ['「字」と言う。','「😀」と言う。','「😀😀」と言う。'])for(const newline of ['', '\r\n']){
        const source=newline?prefix+newline+'（1＋2を言う。':prefix+'（1＋2を言う。',d=parseSyntax(source).syntaxDiagnostics[0];
        eq(d.code,'P207');eq(d.line,newline?2:1);eq(d.column,newline?1:[...prefix].length+1);
      }
    });
    // LANGUAGE.md 保存・実行データの契約と検証: the contract numbers; an extension host built without a Standard
    // (extensions/build.mjs) takes these, and one given a Standard keeps it.
    test('contract numbers and the extension Standard',()=>{
      eq(Akari.EXECUTABLE_CONTRACT,{languageContractId:5,runtimeContractId:5,programFormatVersion:4,projectFormatVersion:6});
      eq(Akari.createAkariExtensionHost({}).standard,{languageContractId:5,runtimeContractId:5});
      eq(Akari.createAkariExtensionHost({standard:{languageContractId:7,runtimeContractId:8}}).standard,{languageContractId:7,runtimeContractId:8});
    });
    // EXTENSIONS.md 版の運用 and upgradeRequirements: a work saved with an older release of an extension opens with a newer
    // release of the same major version. Each row of a host: id, version, the ids it depends on (registered before it).
    const extensionHost=rows=>{const host=Akari.createAkariExtensionHost({}),ids={};
      for(const [id,version,dependsOn=[]]of rows)ids[id]=host.register({id,name:id+'の道具',version,apiContract:1,standard:host.standard,description:'d',
        dependencies:dependsOn.map(other=>ids[other]),capabilities:[],offline:true,selfContained:true,state:{formatVersion:1,initial:{from:id},persist:'project'},
        commands:[{id:'a',name:id+'の命令',description:'d',args:[],returns:{type:'void',unit:null},async:false}],calculations:[],events:[]},
        function factory(){return {commands:{a(){}},calculations:{}};});
      return host;};
    // The record a work that uses t.main saves, with the state t.main keeps.
    const savedWith=host=>{const saved=host.requirements(['t.main']);
      return {...saved,state:host.snapshotState().filter(item=>saved.required.some(x=>x.id===item.id)).map(item=>item.id==='t.main'?{...item,value:{kept:1}}:item)};};
    const upgradedRecord=(older,newer)=>{const plan=newer.upgradeRequirements(savedWith(older));eq(newer.validateRequirements(plan.envelope),true);
      return {upgrades:plan.upgrades.map(x=>x.id+' '+x.from+'→'+x.to),required:plan.envelope.required.map(x=>x.id+'@'+x.version),state:plan.envelope.state.map(x=>[x.id,x.value])};};
    // A dependency the newer release adds (with what it depends on) is recorded with its initial state; the change list
    // names the upgraded extension only. A dependency recorded already is not recorded twice, and a record of the current
    // release without its dependency is refused as before.
    test('extension upgrade records a dependency the newer release adds',()=>{
      const added=extensionHost([['t.base','1.0.0'],['t.dep','1.0.0',['t.base']],['t.main','1.1.0',['t.dep']]]);
      eq(upgradedRecord(extensionHost([['t.main','1.0.0']]),added),{upgrades:['t.main 1.0.0→1.1.0'],required:['t.main@1.1.0','t.dep@1.0.0','t.base@1.0.0'],
        state:[['t.main',{kept:1}],['t.dep',{from:'t.dep'}],['t.base',{from:'t.base'}]]});
      eq(upgradedRecord(extensionHost([['t.main','1.0.0']]),extensionHost([['t.main','1.1.0']])),{upgrades:['t.main 1.0.0→1.1.0'],required:['t.main@1.1.0'],state:[['t.main',{kept:1}]]});
      eq(upgradedRecord(extensionHost([['t.dep','1.0.0'],['t.main','1.0.0',['t.dep']]]),extensionHost([['t.dep','1.0.0'],['t.main','1.1.0',['t.dep']]])),
        {upgrades:['t.main 1.0.0→1.1.0'],required:['t.dep@1.0.0','t.main@1.1.0'],state:[['t.dep',{from:'t.dep'}],['t.main',{kept:1}]]});
      const current=savedWith(added);current.required=current.required.filter(x=>x.id==='t.main');current.state=current.state.filter(x=>x.id==='t.main');
      reject(()=>added.validateRequirements(current),'E703');reject(()=>added.upgradeRequirements(current),'E703');
    });
    // Version numbers are compared exactly, also those of 2^53 or more.
    test('extension upgrade compares long version numbers exactly',()=>{
      const upgrade=(from,to)=>{try{return upgradedRecord(extensionHost([['t.main',from]]),extensionHost([['t.main',to]])).upgrades;}catch(error){return error.code;}};
      eq(upgrade('1.0.99999999999999999998','1.0.99999999999999999999'),['t.main 1.0.99999999999999999998→1.0.99999999999999999999']);
      eq(upgrade('1.0.9007199254740992','1.0.9007199254740993'),['t.main 1.0.9007199254740992→1.0.9007199254740993']);
      eq(upgrade('1.0.99999999999999999999','1.1.0'),['t.main 1.0.99999999999999999999→1.1.0']);
      eq(upgrade('1.0.99999999999999999999','1.0.99999999999999999998'),'E703');
      eq(upgrade('1.0.0','2.0.0'),'E703');
    });
    const parts=(prefix,names)=>{const p=makeDefaultProject(),base=p.components.find(c=>c.type==='sprite');
      p.components=names.map((name,i)=>({...structuredClone(base),id:prefix+i,name,x:100+i*5,y:100,costumes:[{id:prefix+'face-'+i,name:'丸',kind:'text',value:'●'}],costumeId:prefix+'face-'+i}));return p;};
    // LANGUAGE.md 読めない文の近い書き方: a near sentence keeps what was written — who does it (ねこは, ねこを…させる,
    // ねこの…), what it does (最前面へ移動する brings the part to the front; telling a part may be a signal to it), which
    // way, how much, and what each time is (2秒かけて／2秒で, 2秒後に／2秒待ってから, a time of either kind gives both).
    // A sentence that says otherwise is not shown, one that keeps all comes first, one that names the subject first. A
    // sentence with a condition, a loop, a procedure, several subjects or two actions unbroken is not compared by these
    // roles. Each row: input, the body's owner, the first, then texts that must and must not come, and the parts of the
    // work when they are not ねこ, 犬, 鳥 and 子ねこ.
    // LANGUAGE.md: no near sentences for a body over 4,000 characters, counted as characters (an emoji is one).
    test('near sentences count a body of 4000 characters as characters',()=>{
      const p=parts('long-',['ねこ']),ctx={symbols:buildSymbols(p),targetId:'long-0',targetType:'sprite',event:'start',args:[],level:'advanced'};
      // (the clock is held still while the near sentences are looked for: the time they are given (300 ms) would end the
      // search as early as the machine is slow, and the two bodies are compared by what is found, not by speed)
      const near=letter=>{const body=Array.from({length:10},()=>'「'+letter.repeat(250)+'」と言う。').join('\n')+'\nねこを2秒で右へ40歩移動させる。';
        const clock=globalThis.performance;globalThis.performance={now:()=>0};
        try{return Akari.assistCandidates(p,body,ctx,parseSyntax(body,ctx).syntaxDiagnostics[0]).length;}finally{globalThis.performance=clock;}};
      const plain=near('あ');ok(plain>0,String(plain));eq(near('🐈'),plain);
    });
    // A sentence written with a condition and no 、 (点数が3より大きいなら止まる) is not near one that drops the condition.
    test('near sentences keep the condition written',()=>{
      const p=parts('cond-',['ねこ']);p.projectData.variables.push({id:'cond-score',name:'点数',initialValue:0});
      const ctx={symbols:buildSymbols(p),targetId:'cond-0',targetType:'sprite',event:'start',args:[],level:'advanced'};
      for(const source of ['点数が3より大きいなら止まる。','点数が10になったら「やった」と言う。','点数が10になるまで待ちたい。','点数が10になるまでまちなさい。','点数が10になるまでずっと待つ。']){
        const texts=Akari.assistCandidates(p,source,ctx,parseSyntax(source,ctx).syntaxDiagnostics[0]).map(c=>c.text);
        ok(texts.every(t=>/なら|れば|たら|まで/.test(t)),source+': '+texts.join(' / '));
      }
    });
    test('near sentences keep the action written',()=>{
      const worlds=new Map(),world=names=>{if(!worlds.has(names.join())){const p=parts('near-',names);p.projectData.variables.push({id:'near-score',name:'点数',initialValue:0});
        p.actions=[{id:'near-jump',ownerId:'stage',name:'ジャンプ',args:[],source:'何もしない。'}];worlds.set(names.join(),p);}return worlds.get(names.join());};
      const near=(source,targetId,names)=>{const p=world(names),ctx={symbols:buildSymbols(p),targetId,targetType:'sprite',event:'start',args:[],level:'advanced'};
        return Akari.assistCandidates(p,source,ctx,parseSyntax(source,ctx).syntaxDiagnostics[0]).map(c=>c.text);};
      const glide='2秒かけて、いまのばしょから、右へ40歩動く。',move='いまのばしょから、右へ40歩動く。',wait='ねこは2秒待つ。\nねこは、いまのばしょから、右へ40歩動く。';
      const rows=[
        ['ねこを2秒で右へ40歩移動させる。','near-0','ねこは'+glide,[glide],[move,'「ねこ」のコピーを作る。']],
        ['ねこを2秒で右へ40歩移動させる。','near-1','ねこは'+glide,[],[glide,move]],
        ['ねこは2秒で右へ40歩移動する。','near-0','ねこは'+glide,[glide],[move]],
        ['2秒で右へ40歩移動する。','near-0',glide,[],['ねこは'+glide]],
        ['ねこを左へ20歩、2秒で移動させる。','near-0','ねこは2秒かけて、いまのばしょから、左へ20歩動く。',[],[]],
        ['「2秒で右へ40歩」と言わせる。','near-0','「2秒で右へ40歩」と言う。',[],['いまのばしょから、右へ10歩動く。',move]],
        ['ねこを2秒後に右へ40歩移動させる。','near-0',[wait]],
        ['ねこを2秒待ってから右へ40歩移動させる。','near-0','2秒待つ。\nねこは、いまのばしょから、右へ40歩動く。',['2秒待つ。\n'+move],['ねこは'+glide]],
        ['ねこを2秒右へ40歩動かす。','near-0','ねこは'+glide,[wait],[]],
        ['ねこを右へ40歩移動させて、犬を3秒で左へ10歩移動させる。','near-0','ねこは、'+move+'\n犬は3秒かけて、いまのばしょから、左へ10歩動く。',[],[]],
        ['ねこを3秒で前へ10歩進ませる。','near-1','ねこは3秒かけて、前へ10歩進む。',[],['前へ10歩進む。']],
        ['ねこを10歩進ませる。','near-0','ねこは前へ10歩進む。',['前へ10歩進む。'],[]],
        ['ねこを右に90度回らせる。','near-1','ねこは右に90度回る。',[],['右に90度回る。']],
        // A part written with を before a verb that moves or turns it (回す, 進める, 移す, 向ける) is the part that does it, as
        // with させる: in 犬's body, ねこを右へ90度回す turns ねこ, and neither 犬's turn nor a copy of ねこ is near.
        ['ねこを右へ90度回す。','near-1','ねこは右に90度回る。',[],['右に90度回る。']],
        ['ねこを右へ90度回す。','near-0','ねこは右に90度回る。',['右に90度回る。'],[]],
        ['ねこを2秒で右へ40度回す。','near-1','ねこは2秒かけて、右に40度回る。',[],['2秒かけて、右に40度回る。','右に40度回る。']],
        ['ねこを前へ10歩進める。','near-1','ねこは前へ10歩進む。',[],['前へ10歩進む。']],
        ['ねこを右へ10歩移す。','near-1','ねこは、いまのばしょから、右へ10歩動く。',[],['いまのばしょから、右へ10歩動く。','「ねこ」のコピーを作る。']],
        ['ねこを右に向ける。','near-1',null,[],['「ねこ」の方を向く。']],
        ['ねこをかくす。','near-1','ねこはすがたをかくす。',[],['すがたをかくす。']],
        // Parts written together with を (ねこと犬を) are not one part: a sentence for each of them, in the order written. The
        // part made to do a clause (ねこを…させてから) is not carried on to the next clause: the body's owner says it.
        ['ねこと犬を2秒で右へ40歩移動させる。','near-2',['ねこは'+glide+'\n犬は'+glide]],
        ['ねこを右へ40歩移動させてから「やあ」と言う。','near-1','ねこは、'+move+'\n犬は「やあ」と言う。',[],['ねこは、'+move+'\nねこは「やあ」と言う。']],
        // A sentence that does another action than the one read keeps a way or a number written, not only a name or a
        // text; no number written is turned into another unit, and no text is added that was not written.
        ['ねこを右へ40歩、犬を左へ10歩動かす。','near-1',null,[],['ねこは「犬」のコピーを作る。']],
        ['ねこを2倍の大きさにする。','near-1',null,[],['「ねこ」のところへ行く。','「ねこ」の方を向く。','「ねこ」のコピーを作る。','ねこは「ねこ」のコピーを作る。','大きさを120％にする。','ねこは大きさを120％にする。']],
        // A copy is made only when a copy is written (コピー, クローン, 複製, 分身, ふやす).
        ['ねこを大きくする。','near-1',['ねこは大きさを150％にする。']],
        ['ねこのコピーを3つ作りたい。','near-1',['「ねこ」のコピーを3つ作る。']],
        // After the nearest sentence, one of the sound, the pen, a move or a variable comes only when the writing names it.
        ['犬のペンを上げる。','near-0',['犬はペンを上げる。']],
        ['重なりを上げる。','near-0',null,[],['点数を1ふやす。','ペンを上げる。','音の高さを1段階上げる。']],
        ['犬のすがたを見せる。','near-0',['犬はすがたを見せる。']],
        ['右へ40歩回る。','near-0',null,[],['右に15度回る。']],
        ['右へ40度動く。','near-0',null,[],['いまのばしょから、右へ10歩動く。']],
        ['すがたを「丸」にかえた。','near-0',null,[],['点数を「丸」にする。']],
        // A text written without 「 」 is said as it is written; a key's name, as a part's, is no text to say or send.
        ['こんにちはと言わせる。','near-0','「こんにちは」と言う。'],
        ['ねこをふやす。','near-1',null,[],['点数を1ふやす。','点数を1へらす。']],
        ['ねこをかくして、「やあ」と言う。','near-1',null,[],['ねこはペンを下ろす。\n犬は「やあ」と言う。']],
        ['すがたを「ほし」にかえた。','near-0',null,[],['画面のはしにふれていれば、はね返る。']],
        // Where no meaning was read, nothing not written is said, asked or sent, and a sound is played only when one is written.
        ['ねこのすがたを見せる。','near-0','すがたを見せる。',[],['「やったね」と言う。']],
        ['ペンを下げる。','near-0','ペンを下ろす。',[],['音の高さを1段階下げる。','点数を1へらす。']],
        // There, the pen is put up or down only when the pen is written (also ぺん, 筆), and the timer is set to 0 only when the
        // timer or a time is written.
        ['おわり。','near-0',null,[],['ペンを上げる。']],
        ['体力を1あげる。','near-0',null,[],['ペンを上げる。']],
        ['ぺんをあげる。','near-0',['ペンを上げる。']],
        ['筆を下ろす。','near-0','ペンを下ろす。'],
        ['線をかきはじめる。','near-0','ペンを下ろす。',[],['タイマーを0にする。']],
        // まつ written in kana at the end is 待つ.
        ['2秒でまつ。','near-0','2秒待つ。',[],['「名前は？」とたずねて、答えを待つ。']],
        ['自分を右に90度回らせる。','near-1','右に90度回る。',[],[]],
        ['ねこ、前へ10歩進む。','near-0','ねこは前へ10歩進む。',['前へ10歩進む。'],[]],
        ['ねこは「やあ」と言わせる。','near-1','ねこは「やあ」と言う。',[],['「やあ」と言う。']],
        ['犬の色を「赤」にする。','near-0','犬は色を「赤」にする。',[],['色を「赤」にする。']],
        ['ねこのコピーを作らせる。','near-1','「ねこ」のコピーを作る。',[],['自分のコピーを作る。']],
        ['最前面へ移動する。','near-0','いちばん手前へ出る。',[],['前へ10歩進む。',move]],
        ['犬に「やあ」と言う。','near-0','「やあ」の合図を送る。',['「やあ」と言う。'],[]],
        ['犬に「出発」と伝える。','near-0','「出発」の合図を送る。',[],[]],
        ['「やあ」と小さな声で言う。','near-0','「やあ」と言う。',[],[]],
        ['1秒やすんで、「やあ」と言う。','near-0','1秒待つ。\n「やあ」と言う。',[],[]],
        ['1秒半待つ。','near-0','1.5秒待つ。',[],[]],
        ['しばらくまつ。','near-0','1秒待つ。',[],[]],
        ['タイマーを0秒にする。','near-0','タイマーを0にする。',[],['0秒待つ。\nタイマーを0にする。']],
        ['右へ100歩、上へ50歩のばしょへ行く。','near-0','画面の左下のはしから、右へ100歩、上へ50歩のばしょへ行く。',[],['「犬」のところへ行く。']],
        ['画面の右上へ行く。','near-0','画面の左下のはしから、右へ640歩、上へ400歩のばしょへ行く。',[],[]],
        ['「犬」に行く。','near-0','「犬」のところへ行く。',[],['画面の左下のはしから、右へ100歩、上へ50歩のばしょへ行く。']],
        ['横に10歩動く。','near-0','いまのばしょから、右へ10歩動く。',['いまのばしょから、左へ10歩動く。'],[]],
        ['犬は止まる。','near-0','この動きを止める。',['犬は自分のほかの動きを止める。'],['自分のほかの動きを止める。']],
        ['10歩進む1秒待つ','near-0','前へ10歩進む。\n1秒待つ。',[],[]],
        ['前へ動き続ける。','near-0','ずっとくり返す。\n  前へ10歩進む。',[],[]],
        ['ねこと犬と鳥は前へ10歩進む。','near-0','ねこは前へ10歩進む。\n犬は前へ10歩進む。\n鳥は前へ10歩進む。',[],['前へ10歩進む。']],
        ['ジャンプを5秒で行う。','near-0','【ジャンプ】というてじゅんを行う。',[],[]],
        // A name is a name (回るねこ moves; ねこ inside 子ねこ is no other part), and the part to go to or to face is not
        // the one that goes. A sentence that does another action and keeps nothing written is not shown.
        ['子ねこを右へ10歩移動させる。','near-0',['子ねこは、いまのばしょから、右へ10歩動く。']],
        ['子ねこを2秒で右へ40歩移動させる。','near-0',['子ねこは2秒かけて、いまのばしょから、右へ40歩動く。']],
        ['回るねこを右へ10歩移動させる。','near-0',['回るねこは、いまのばしょから、右へ10歩動く。'],[],[],['ねこ','回るねこ','犬']],
        ['「回るねこ」を右へ10歩移動させる。','near-0',['回るねこは、いまのばしょから、右へ10歩動く。'],[],[],['ねこ','回るねこ','犬']],
        ['『やあ』と言わせる。','near-0',['「やあ」と言う。']],
        // No number of a unit written is joined by another of it (no 右へ10歩、上へ50歩のばしょへ for 10歩うしろへ), and 自分
        // written later in the sentence is the body's owner.
        ['ねこを10歩うしろへ動かす。','near-0',['ねこは後ろへ10歩動く。','後ろへ10歩動く。']],
        // Up to three clauses that do not read are each put back, also when one says what another says, and a wait between
        // two moves stays between them.
        ['ねこを右へ10歩移動させて、犬を左へ10歩移動させて、鳥を上へ10歩移動させる。','near-0',['ねこは、いまのばしょから、右へ10歩動く。\n犬は、いまのばしょから、左へ10歩動く。\n鳥は、いまのばしょから、上へ10歩動く。']],
        ['ねこを右へ10歩移動させて、犬を左へ10歩移動させて、鳥を上へ10歩移動させて、子ねこを下へ10歩移動させる。','near-0',[]],
        ['前へ10歩進んで、前に10歩いく。','near-0',['前へ10歩進む。\n前へ10歩進む。']],
        ['前に10歩いって、前へ10歩進む。','near-0',['前へ10歩進む。\n前へ10歩進む。']],
        ['右へ10歩動いて、2秒後に左へ10歩動く。','near-0',['いまのばしょから、右へ10歩動く。\n2秒待つ。\nいまのばしょから、左へ10歩動く。']],
        ['犬は右へ10歩動いて、2秒後に左へ10歩動く。','near-0',['犬は、いまのばしょから、右へ10歩動く。\n犬は2秒待つ。\n犬は、いまのばしょから、左へ10歩動く。']],
        ['2秒後に、3秒右へ10歩動く。','near-0',['2秒待つ。\n3秒かけて、いまのばしょから、右へ10歩動く。']],
        // A copy is of the part written (犬にねこのコピー: ねこ; 自分のコピー in 犬's body: 犬), and with nothing that keeps
        // the number, the sentence that keeps the way comes.
        ['犬にねこのコピーを作らせる。','near-0',['犬は「ねこ」のコピーを作る。']],
        ['ねこと犬は右へ10歩移動する。','near-0',null,[],['「犬」のコピーを作る。','「ねこ」のコピーを作る。']],
        ['子ねこの方をねこが向く。','near-0',['「子ねこ」の方を向く。']],
        ['自分のコピーを作らせる。','near-1',['自分のコピーを作る。']],
        ['ねこを右向きに10歩動かす。','near-0',null,['画面の右を向く。'],[]],
        // What is quoted is not done, and a time alone is no move.
        ['「右へ40歩」をおぼえる。','near-0',null,[],['いまのばしょから、右へ10歩動く。']],
        ['「右へ40歩」と書いて。','near-0',null,[],['いまのばしょから、右へ10歩動く。']],
        ['1秒ごと、','near-0',null,[],['1秒かけて、いまのばしょから、右へ10歩動く。']],
        ['犬は右へ10歩移動して、自分は左へ10歩移動する。','near-0',['犬は、いまのばしょから、右へ10歩動く。\nねこは、いまのばしょから、左へ10歩動く。']],
        ['ねこを走る犬のところへ移動させる。','near-0',['ねこは「走る犬」のところへ行く。','「走る犬」のところへ行く。'],[],[],['ねこ','走る犬','犬']],
        ['ねこを子ねこのところへ移動させる。','near-0',['ねこは「子ねこ」のところへ行く。','「子ねこ」のところへ行く。']],
        ['犬を子ねこのところへ移動させる。','near-0',['犬は「子ねこ」のところへ行く。']],
        ['ねこを犬の方へ向かせる。','near-0',['ねこは「犬」の方を向く。','「犬」の方を向く。']],
        ['「犬」を子ねこのところへ移動させる。','near-0',['犬は「子ねこ」のところへ行く。']],
        ['犬を「ねこ」のところへ移動させる。','near-0',['犬は「ねこ」のところへ行く。']],
        ['ねこを右がわへ10歩動かす。','near-0',null,[],['ねこは「ねこ」のところへ行く。','「ねこ」のところへ行く。']],
        ['子ねこを「犬」の方へ回らせる。','near-0',null,[],['子ねこは点数を1へらす。','作品を全部止める。','子ねこは「犬」の合図を送る。']],
        // A time the wait before takes is that wait only (2秒たってから: no second wait), and each text is said in its clause.
        ['2秒たってから右へ10歩動く。','near-0',['2秒待つ。\nいまのばしょから、右へ10歩動く。']],
        ['「やあ」と言わせて、「またね」と言わせる。','near-0',['「やあ」と言う。\n「またね」と言う。']],
        ['ねこは10歩動いて止まる。','near-0','ねこは前へ10歩進む。\nねこはこの動きを止める。',[],[]],
        // 「犬」に is 犬に (a quoted name of a part is the part): told as a signal first, as 犬に「やあ」と言う is.
        ['「犬」に「やあ」と言う。','near-0',['「やあ」の合図を送る。','「やあ」と言う。']],
        ['2秒待ってから、右へ10歩動かす。','near-0',['2秒待つ。\nいまのばしょから、右へ10歩動く。']],
        ['ねこを右に90ど回らせる。','near-0',['ねこは右に90度回る。','右に90度回る。']],
        ['ねこを複製する。','near-0',['「ねこ」のコピーを作る。','自分のコピーを作る。']],
        ['ねこを止める。','near-0','自分のほかの動きを止める。\nこの動きを止める。',['この動きを止める。'],[]],
        ['ねこの大きさを50%にする。','near-0',['大きさを50％にする。']],
        ['自分は右へ10歩移動させる。','near-0',['ねこは、いまのばしょから、右へ10歩動く。','いまのばしょから、右へ10歩動く。']],
        ['ねこは右へ10歩移動して、犬は左へ10歩移動する。','near-0',['ねこは、いまのばしょから、右へ10歩動く。\n犬は、いまのばしょから、左へ10歩動く。']],
      ];
      // A first given as a list is every near sentence, in order; null leaves the first open.
      for(const [source,owner,first,has=[],not=[],names=['ねこ','犬','鳥','子ねこ']]of rows){const got=near(source,owner,names),where=source+' ('+owner+'): '+JSON.stringify(got);
        if(Array.isArray(first))eq(got,first);else if(first!==null)eq(got[0],first);
        for(const text of has)ok(got.includes(text),where+' lacks '+text);for(const text of not)ok(!got.includes(text),where+' has '+text);}
    });
    // LANGUAGE.md 合図の食い違いの知らせ: a signal whose name is empty runs as written when the work receives it; with
    // nothing on the other side it is told as an empty name, with what to write.
    test('a signal with an empty name is told as empty when nothing receives or sends it',()=>{
      const send='名前が 空の 合図を 受ける 本文が、この 作品に ありません。合図の 名前は「 」の 中に 書きます。れい：「スタート」の合図を送る。',
        receive='名前が 空の 合図を 送る 文が、この 作品に ありません。合図の 名前は「 」の 中に 書きます。れい：「スタート」という合図を受けたとき、';
      for(const [source,heard,want] of [
        ['「」の合図を送る。',null,[send]],['みんなに「」と知らせる。',null,[send]],
        ['「」の合図を送る。','「」の合図を受けたとき、\n  「来た」と言う。',[]],
        ['「あ」の合図を送る。','「あ」の合図を受けたとき、\n  「来た」と言う。',[]],
        ['「あ」の合図を送る。\n「」の合図を送る。','「」の合図を受けたとき、\n  「来た」と言う。',['「あ」の 合図を 受ける 本文が、この 作品に ありません。受ける 部品の 本文の はじめに「「あ」という合図を受けたとき、」と 書きます']],
        ['「やあ」と言う。','「」の合図を受けたとき、\n  「来た」と言う。',[receive]],
      ]){
        const p=base(source,'sprite-1');if(heard)p.scripts.push({targetId:'stage',event:'start',source:heard});
        const c=compileProject(p);eq([source,c.errors.map(e=>e.message),c.notes.map(n=>n.message)],[source,[],want]);
      }
      // 名人: a signal sent to a part with no body that receives it (I138).
      const p=base(''),who=p.components.find(x=>x.id==='sprite-1').name;p.scripts=[{id:'meijin-signal',targetId:'meijin',event:'start',mode:'meijin',source:who+'に「」と知らせる。'}];
      const c=compileProject(p);eq([c.errors.map(e=>e.message),c.notes.map(n=>n.message)],[[],[who+'には、名前が 空の 合図を 受ける 本文が ありません。合図の 名前は「 」の 中に 書きます。れい：'+who+'に「スタート」と知らせる。']]);
    });
    // LANGUAGE.md 音と待機 / 子ども向けの文: a name written as 「」 is told as an empty name with what to write in it.
    test('an empty name in quotes is told as empty, not as 「」',()=>{
      const colours='使える 色は 黒・白・ねずみ色・赤・だいだい・黄・緑・水色・青・むらさき・もも色・茶 です',
        empty=noun=>noun+'の 名前が 空です。「 」の 中に '+noun+'の 名前を 書いて ください';
      for(const [source,targetId,want] of [
        ['もし「」にふれているなら、\n  「やあ」と言う。','stage',['「〜にふれている」は 画面では 使えません。キャラクターの 本文で 使って ください',empty('キャラクターや 部品')]],
        ['「」までのきょりを言う。','sprite-1',[empty('キャラクターや 部品')]],
        ['ペンの色を「」にする。','sprite-1',[empty('色')+'。'+colours]],
        ['「」の色にふれているを言う。','sprite-1',[empty('色')+'。'+colours]],
        ['もし「」キーがおされているなら、\n  「やあ」と言う。','sprite-1',[empty('キー')+'。キーは「スペース」「右」「a」のように 書きます']],
        ['はいけいを「」にかえる。','sprite-1',[empty('はいけい')]],
        ['「」の音を鳴らす。','sprite-1',[empty('音')]],
        ['すがたを「」にかえる。','sprite-1',[empty('すがた')]],
        ['「」の大きさを言う。','sprite-1',[empty('キャラクターや 部品')]],
        ['「」の長さを言う。','sprite-1',[]],
        ['ペンの色を「にじ色」にする。','sprite-1',['色「にじ色」は 使える 色では ありません。'+colours]],
        ['「ピアノ」の音を鳴らす。','sprite-1',['「ピアノ」という 音が 見つかりません。名前を たしかめるか、その 名前の 音を 入れて ください']],
      ])eq(compileProject(base(source,targetId)).errors.map(e=>e.message),want);
    });
    // LANGUAGE.md 変数・リスト: a sentence that stops every run (a text or a list for a number, a list counted up or
    // given one value, data that is no list read by number) is told before running as a notice (I139), as the run tells
    // it; the work runs and stops there with R411, and runs to its end when the sentence is not reached. One whose run
    // depends on what the data holds is not told; a list said as it is stays refused.
    test('a value that stops every run is told before running, and one that may run is not',()=>{
      const stop='この 文まで 来ると、作品が 止まります。',number='ここには 数が いります。れい：10',
        runs=(p)=>{const c=compileProject(p),said=[],stops=[];eq(c.errors,[]);
          const r=new RuntimeModel(p,{}),q=new EventScheduler(p,c,r,{say:(id,text)=>said.push(String(text)),runtimeError:(t,e)=>stops.push(e.code+' '+e.message)});
          q.schedule=()=>{};q.start();let n=0;while(q.ready.length&&n++<10000)q.runTurn();ok(n<10000);return {said,stops};};
      const pen='ペンの 太さには 数が いります。れい：ペンの太さを5にする',
        listUp='「持ち物」は リストです。ふやす・へらすは 数の へんすうに 使う ブロックです。リストに 入れる ときは「持ち物のさいごに1を入れる」のように 書きます',
        upBy='ふやす・へらす ところには 数が いります。れい：点数を1ふやす',
        listGets='リストには リストだけを 入れられます。中身を 全部 消す ときは「持ち物の中身を全部消す」と 書きます',
        scalarGets='へんすうには 数・文字・あてはまる／あてはまらない だけを 入れられます。リストの 中身を 入れる ときは「持ち物の1番目」のように 書きます',
        byNumber=name=>'「'+name+'」は リストでは ないので、何番目かを えらべません。何番目かを えらべるのは リストです';
      for(const [source,want,ran] of [
        ['ペンの太さを「あ」にする。',[pen],number],['ペンの太さを「10」にする。',[pen],number],['ペンの太さを持ち物にする。',[pen],number],
        ['持ち物を1ふやす。',[listUp],'これは 数の へんすうに 使う ブロックです'],['持ち物を0にする。',[listGets],'リストには リストだけを 入れられます'],
        ['持ち物を「本」にする。',[listGets],'リストには リストだけを 入れられます'],['点数を持ち物にする。',[scalarGets],'へんすうには 数・文字・あてはまる／あてはまらない だけを 入れられます'],
        ['点数の1番目を言う。',[byNumber('点数')],byNumber('点数')],['名前の1番目を言う。',[byNumber('名前')],byNumber('名前')],['点数に「本」を足す。',[upBy],number],['点数を「本」ふやす。',[upBy],number],
        ['ペンの太さを5にする。',[]],['ペンの太さを点数にする。',[]],['ペンの太さを名前にする。',[]],['ペンの太さを答えにする。',[]],['ペンの太さを持ち物の1番目にする。',[]],
        ['点数を1ふやす。',[]],['名前を1ふやす。',[]],['点数を名前ふやす。',[]],['点数を持ち物の数ふやす。',[]],['持ち物を［1、2］にする。',[]],['持ち物を持ち物にする。',[]],
        ['持ち物を答えにする。',[]],['名前を「あ」にする。',[]],['持ち物の1番目を言う。',[]],['点数の長さを言う。',[]],
      ]){
        const p=base(source,'sprite-1');
        p.projectData={variables:[{id:'t-score',name:'点数',initialValue:0},{id:'t-name',name:'名前',initialValue:''}],lists:[{id:'t-items',name:'持ち物',initialValue:['本']}]};
        const c=compileProject(p);
        eq([source,c.errors,c.notes.filter(n=>n.code==='I139').map(n=>[n.message,n.line,n.column,n.notice])],[source,[],want.map(m=>[stop+m,1,1,true])]);
        // The block screen's check of the sentence answers as the work's check: the sentence goes in.
        if(want.length)eq([source,analyzeAst([...c.astByKey.values()][0],p,{targetId:'sprite-1',event:'start'})],[source,[]]);
        if(!ran)continue;
        // Reached, the sentence stops the run with R411; in a branch not taken, the work runs to its end.
        p.scripts[0].source=source+'\n「おわり」と言う。';eq([source,runs(p)],[source,{said:[],stops:['R411 '+ran]}]);
        p.scripts[0].source='もし点数が5なら、\n  '+source+'\n「おわり」と言う。';
        eq([source,compileProject(p).notes.filter(n=>n.code==='I139').map(n=>[n.line,n.column])],[source,[[2,3]]]);eq([source,runs(p)],[source,{said:['おわり'],stops:[]}]);
      }
      // A list said as it is stays refused by the check, with no notice.
      for(const source of ['持ち物を言う。','「あ」と持ち物をつなげて言う。','もし点数が5なら、\n  持ち物を言う。']){
        const p=base(source,'sprite-1');
        p.projectData={variables:[{id:'t-score',name:'点数',initialValue:0}],lists:[{id:'t-items',name:'持ち物',initialValue:['本']}]};
        const c=compileProject(p);
        eq([source,c.errors.map(e=>e.code+' '+e.message),c.notes.filter(n=>n.code==='I139')],[source,['S304 リストは そのまま 言えません。中身を 言う ときは「持ち物の1番目を言う」のように 書きます'],[]]);
        eq([source,analyzeAst([...c.astByKey.values()][0],p,{targetId:'sprite-1',event:'start'}).map(d=>d.code)],[source,['S304']]);
      }
    });
    // LANGUAGE.md 作品チェックの知らせ: a count in a loop while touching is told for the touch as written, not for its
    // negation (もし「石」にふれていなければ、 counts while they do not touch).
    test('loop touch count notice reads the touch, not its negation',()=>{
      const p=parts('loop-touch-',['ねこ','石']);p.projectData.variables.push({id:'loop-touch-score',name:'点数',initialValue:0});
      for(const [condition,notice]of [['もし「石」にふれていれば、',true],['もし「石」にふれていなければ、',false]]){
        p.scripts=[{id:'loop-touch-main',targetId:'loop-touch-0',event:'start',source:'ずっとくり返す。\n  '+condition+'\n    点数を1ふやす。'}];
        const c=compileProject(p);eq(c.errors,[]);eq(c.notes.filter(n=>n.code==='I121').length,notice?1:0);
      }
    });
    {
      // A calculation whose result is a number is no list for the pen size, even when a list has the calculation's name.
      test('a pen size from a random number or a remainder is no list when a list has that calculation name',()=>{
        for(const [list,source] of [['乱数','ペンの太さを1から3までのどれかにする。'],['余り','ペンの太さを5を3で割った余りにする。']]){
          const p=base(source,'sprite-1');p.projectData={variables:[],lists:[{id:'calc-name-list',name:list,initialValue:['本']}]};
          const c=compileProject(p);eq([source,c.errors,c.notes.filter(n=>n.code==='I139')],[source,[],[]]);
        }
      });
      // A costume value read in a stage body is told by its block words.
      test('a costume number or name read in a stage body is told as for characters only',()=>{
        for(const [source,shown] of [['衣装番号を言う。','すがたの番号'],['衣装名を言う。','すがたの名前']])
          eq(compileProject(base(source,'stage')).errors.map(e=>[e.code,e.message,e.line,e.column]),[['S304','「'+shown+'」は キャラクターで だけ 使えます',1,1]]);
      });
      // 名人: a signal sent to a part is told (I138) unless that part has a body receiving that signal.
      test('a signal sent to a part is told unless that same part receives that same signal',()=>{
        const p0=base(''),who=p0.components.find(x=>x.id==='sprite-1').name,
          told=who+'には、「出発」の 合図を 受ける 本文が ありません。'+who+'の 本文の はじめに「'+who+'が「出発」の合図を受けたとき、」と 書きます',
          unsent='「止まれ」の 合図を 送る 文が、この 作品に ありません。送る 部品の 本文に「「止まれ」の合図を送る。」と 書きます',
          receiver=(targetId,message)=>({id:'signal-to-part-r',targetId,event:'message',filter:{message},source:'「来た」と言う。'});
        for(const [label,heard,want] of [
          ['no receiver',[],[told]],['the part receives it',[receiver('sprite-1','出発')],[]],
          ['the part receives another',[receiver('sprite-1','止まれ')],[told,unsent]],['the stage receives it',[receiver('stage','出発')],[told]],
        ]){
          const p=base('');p.scripts=[{id:'signal-to-part-m',targetId:'meijin',event:'start',mode:'meijin',source:who+'に「出発」と知らせる。'},...heard];
          const c=compileProject(p);eq([label,c.errors,c.notes.map(n=>n.message)],[label,[],want]);
        }
      });
    }
    {
      // searchIntent: the block and values that search words name
      test('search-intent/pen-list-tone-ordinal-and-assignment-words', () => {
        const expected = {
          'ペンの色をピンクにする': { schemaId: 'PenCommand:SET_COLOR', color: 'ピンク' },
          'ぺんのいろをおれんじにする': { schemaId: 'PenCommand:SET_COLOR', color: 'オレンジ' },
          'ペンの色を赤にする': { schemaId: 'PenCommand:SET_COLOR', color: '赤' },
          'ペンの色を青緑にする': { schemaId: 'PenCommand:SET_COLOR' },
          'ぺんのふとさを5にする': { schemaId: 'PenCommand:SET_SIZE' },
          '線をクリアする': { schemaId: 'PenCommand:CLEAR' },
          '線をくりあする': { schemaId: 'PenCommand:CLEAR' },
          '持ち物というリストを作る': { schemaId: 'LocalListDeclaration' },
          '持ち物というりすとを作る': { schemaId: 'LocalListDeclaration' },
          '440ヘルツを出す': { schemaId: 'SoundCommand:TONE_WAIT' },
          '10を3番目にはさむ': { schemaId: 'ListInsert', index: 3 },
          '持ち物の2番目を取り出す': { schemaId: 'ListDelete', index: 2 },
          '持ち物の2番目は「かさ」にする': { schemaId: 'ListReplace', index: 2 },
          '点数を0からスタートする': { schemaId: 'Assignment' },
          '点数を0と置く': { schemaId: 'Assignment' },
          '1秒ウエイト': { schemaId: 'WaitTime' },
          'ミニにする': { schemaId: 'LooksCommand:SET_SCALE', scale: 50 },
        };
        for (const [query, intent] of Object.entries(expected)) {
          const got = Akari.searchIntent(query);
          ok(stableJson(got) === stableJson(intent), query + ': ' + JSON.stringify(got));
          ok(Object.keys(got).length === Object.keys(intent).length, query + ' keys: ' + JSON.stringify(Object.keys(got)));
        }
        ok(Akari.searchIntent('ボールを出す')?.schemaId !== 'SoundCommand:TONE_WAIT', 'ボールを出す is no tone');
      });
    }
    return {
      total: results.length,
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      results,
    };
  }
