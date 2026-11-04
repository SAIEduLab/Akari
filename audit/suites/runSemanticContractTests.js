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
        [d=>{d.surprise=1;},'この 作品の ファイルは、この あかりでは 動かせません']])
        ok(String(opened(change)).startsWith('X602 '+message),message+': '+opened(change));
    });
    test('formatting refuses a syntax tree with a statement or value it does not know', () => {
      const ast=parseSyntax('「あ」と言う。').ast;eq(formatScript(ast),'「あ」と言う。');
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
      for(const source of ['ねこは、点数が1になるまで待つ。犬は点数を1にする。','点数が1になるまで待つ。\n点数を1にする。','点数＋1が3になるまで待つ。\n点数を2にする。','ずっとくり返す。\n  点数が1になるまで待つ。\n  点数を0にする。','点数が1になるまで待つ。\n「数は？」とたずねて、答えを待つ。\n点数を答えにする。']){
        const [note,...more]=notes(source);eq(more,[]);ok(note.message.startsWith('「点数」を かえる 文は、この 本文の この 文より あとに しか ありません。'));ok(note.message.includes('「同じ きっかけの 本文を ふやす」'));}
      ok(notes('ねこは、点数が1になるまで待つ。犬は点数を1にする。',{meijin:true})[0].message.includes('「次のことを同時に始める。」の 中に'));
      for(const [source,options]of [['点数を1にする。\n点数が1になるまで待つ。\n点数を2にする。',{}],['点数が1になるまで待つ。\n点数を1にする。',{other:'1秒待つ。\n点数を1にする。'}],['点数が1になるまで待つ。\n10歩進む。',{}],
        ['次のことを同時に始める。\n  点数が1になるまで待つ。\n  点数を1にする。\nねこは10歩進む。',{meijin:true}],['タイマーが3より大きくなるまで待つ。\nタイマーを0にする。',{}]])
        eq(notes(source,options),[]);
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
    const parts=(prefix,names)=>{const p=makeDefaultProject(),base=p.components.find(c=>c.type==='sprite');
      p.components=names.map((name,i)=>({...structuredClone(base),id:prefix+i,name,x:100+i*5,y:100,costumes:[{id:prefix+'face-'+i,name:'丸',kind:'text',value:'●'}],costumeId:prefix+'face-'+i}));return p;};
    // LANGUAGE.md 読めない文の近い書き方: a near sentence keeps what was written — who does it (ねこは, ねこを…させる,
    // ねこの…), what it does (最前面へ移動する brings the part to the front; telling a part may be a signal to it), which
    // way, how much, and what each time is (2秒かけて／2秒で, 2秒後に／2秒待ってから, a time of either kind gives both).
    // A sentence that says otherwise is not shown, one that keeps all comes first, one that names the subject first. A
    // sentence with a condition, a loop, a procedure, several subjects or two actions unbroken is not compared by these
    // roles. Each row: input, the body's owner, the first, then texts that must and must not come, and the parts of the
    // work when they are not ねこ, 犬, 鳥 and 子ねこ.
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
        // Parts written together with を (ねこと犬を) are not one part, and the part made to do a clause (ねこを…させてから)
        // is not carried on to the next clause: the body's owner says it.
        ['ねこと犬を2秒で右へ40歩移動させる。','near-2',[]],
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
        ['ねこと犬と鳥は前へ10歩進む。','near-0','犬は前へ10歩進む。\n鳥は前へ10歩進む。\nねこは前へ10歩進む。',[],[]],
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
    // LANGUAGE.md 読めない文の近い書き方: a near sentence does not change the other sentences. One that names another subject
    // (ねこは…) would carry it on to the next sentence without one, so that sentence is given the subject it had (自分は, or
    // the one carried on to the place of the near sentence). Each row: the body, its owner, and the body after the first
    // near sentence is chosen.
    test('near sentences keep who does the next sentence',()=>{
      const p=parts('next-',['ねこ','犬','鳥']),applied=(body,targetId)=>{const ctx={symbols:buildSymbols(p),targetId,targetType:'sprite',event:'start',args:[],level:'advanced'};
        const [c]=Akari.assistCandidates(p,body,ctx,parseSyntax(body,ctx).syntaxDiagnostics[0]);return c&&body.slice(0,c.start)+c.source+body.slice(c.end);};
      const glide='ねこは2秒かけて、いまのばしょから、右へ40歩動く。',written='ねこを2秒で右へ40歩移動させる。';
      for(const [body,owner,after]of [
        [written+'「やあ」と言う。','next-1',glide+'自分は「やあ」と言う。'],
        [written+'\n「やあ」と言う。','next-1',glide+'\n自分は「やあ」と言う。'],
        ['2回くり返す。\n  '+written+'\n  前へ10歩進む。','next-1','2回くり返す。\n  '+glide+'\n  自分は前へ10歩進む。'],
        ['鳥は前へ10歩進む。'+written+'「やあ」と言う。','next-1','鳥は前へ10歩進む。'+glide+'鳥は「やあ」と言う。'],
        [written+'\n犬は「やあ」と言う。','next-1',glide+'\n犬は「やあ」と言う。'],
        [written+'「やあ」と言う。','next-0',glide+'「やあ」と言う。'],
        [written,'next-1',glide],
        // Before a heading the subject is written with 、, as the code writes it.
        [written+'\n3回くり返す。\n  「やあ」と言う。','next-1',glide+'\n自分は、3回くり返す。\n  「やあ」と言う。'],
      ])eq(applied(body,owner),after);
      // The rewrite of a check keeps it too (assistProposalKeepsSubject).
      const ctx={symbols:buildSymbols(p),targetId:'next-1',targetType:'sprite',event:'start'},body='ねこを2秒かけて右へ40歩うごかす。「やあ」と言う。',[fix]=parseSyntax(body,ctx).syntaxDiagnostics[0].proposals,kept=Akari.assistProposalKeepsSubject(fix,body,ctx,p);
      eq(body.slice(0,kept.start)+kept.source+body.slice(kept.end),glide+'自分は「やあ」と言う。');
      eq(kept.note,'つぎの 文の はじめに「自分は」を 書きます（つぎの 文を する 部品は 同じです）');
      // The stage's body: the part named moves (the stage does not); a sentence of the part's body gets the part's name
      // (ねこのすがたを見せる → ねこはすがたを見せる), the number written is kept, and no sentence is shown twice.
      const stage={symbols:buildSymbols(p),targetId:'stage',targetType:'stage',event:'start',args:[],level:'advanced'},onStage=text=>Akari.assistCandidates(p,text,stage,parseSyntax(text,stage).syntaxDiagnostics[0]).map(c=>c.text);
      eq(onStage(written),[glide]);
      eq(onStage('ねこのすがたを見せる。'),['ねこはすがたを見せる。']);
      eq(onStage('ねこの向きを90度にする。'),['ねこは画面の上を向く。']);
      eq(onStage('ねこの向きを45度にする。'),['ねこは向きを45度にする。']);
    });
    // The same in the work of the assist examples (audit/fixtures/assist): ねこ (whose body it is), 犬 and 星, the
    // variable 点数, the list 持ち物, the sound ベル, the procedure ジャンプ, and with ui the parts 文字1, ボタン1 and
    // 入力らん1. Each row: input, whether the work has the ui parts, and either every near sentence in order or the first
    // and the sentences that must not come; a sentence is its text, or [its button's name, its text] when they differ.
    test('near sentences in the work of the assist examples',()=>{
      const example=ui=>{const p=makeDefaultProject(),base=p.components.find(c=>c.type==='sprite');
        p.components=[...['ねこ','犬','星'].map((name,i)=>({...structuredClone(base),id:'sprite-'+(i+1),name,costumes:base.costumes.map((c,j)=>({...c,id:'sprite-'+(i+1)+'-costume-'+j})),costumeId:'sprite-'+(i+1)+'-costume-0',localData:{variables:[],lists:[]}})),
          ...(ui?[['文字1','label'],['ボタン1','button'],['入力らん1','input']].map(([name,type])=>{const c={...structuredClone(base),id:type+'-1',type,name,localData:{variables:[],lists:[]}};delete c.costumes;delete c.costumeId;return c;}):[])];
        p.projectData={variables:[{id:'variable-0',name:'点数',initialValue:0}],lists:[{id:'list-0',name:'持ち物',initialValue:[]}]};
        p.sounds=[{id:'sound-0',name:'ベル',assetId:'sound-asset-0'}];p.actions=[{id:'action-0',ownerId:'stage',name:'ジャンプ',args:[],source:'何もしない。'}];
        p.scripts=[{id:'s1',targetId:'sprite-1',event:'start',source:'何もしない。'}];return p;};
      const works=[example(false),example(true)];
      const near=(source,ui)=>{const p=works[Number(!!ui)],ctx={symbols:buildSymbols(p),targetId:'sprite-1',targetType:'sprite',event:'start',args:[],level:'advanced'};
        const got=Akari.assistCandidates(p,source,ctx,parseSyntax(source,ctx).syntaxDiagnostics[0]);ok(got.every(c=>c.assist===true),source+': every near sentence is marked as one');
        return got.map(c=>c.label===c.text?c.text:[c.label,c.text]);};
      const step='前へ10歩進む。',stop='この動きを止める。\n1秒待つ。';
      const rows=[
        ['すがたを「丸」にかえた。',false,{first:['すがたを かえる','すがたを「丸」にかえる。'],not:['次のすがたにかえる。','前のすがたにかえる。','点数を「丸」にする。','色を「丸」にする。']}],
        ['もし点数が10以上なら、もし点数が20以下なら、\n    何もしない。',false,{first:['もし','もし点数が10以上なら、\n  もし点数が20以下なら、\n    何もしない。'],not:['もし点数が10以上なら、\n  点数を0にする。']}],
        ['ずっとくり返す。\n  とばして次へ。',false,[['この回の のこりを とばして 次の回へ','この回の残りをとばして、次の回へ進む。']]],
        ['すがたを切りかえる。',false,[['次のすがた','次のすがたにかえる。'],['すがたを かえる','すがたを「たくどん」にかえる。']]],
        ['前へ10歩。',false,[['前へ進む',step]]],
        ['前へ、10歩進む',false,[['前へ進む',step]]],
        ['10歩前にいって。',false,[['前へ進む',step]]],
        ['1秒、待つ。',false,[['秒待つ','1秒待つ。']]],
        ['左に90度曲がる。',false,[['左に回る','左に90度回る。']]],
        ['ペンを紙からはなす。',false,[['ペンを上げる','ペンを上げる。']]],
        ['とまって、1秒待つ',false,{first:['この動きを止める',stop],not:[]}],
        ['ぶつかったら、はねる。',false,[['はしで はね返る','画面のはしにふれていれば、はね返る。']]],
        ['「星」にふれたら、止まる。',false,{first:['ふれる たびに する','「星」にふれたとき、\n  この動きを止める。'],not:[]}],
        ['2秒待ってから、右へ10歩動かす。',false,[['いまの ばしょから動く','2秒待つ。\nいまのばしょから、右へ10歩動く。']]],
        ['ねこは10歩動いて止まる。',false,{first:['前へ進む','ねこは前へ10歩進む。\nねこはこの動きを止める。'],not:[]}],
        ['ねこを2びょうで右へ40ほ移動させる。',false,[['いまの ばしょから動く','ねこは2秒かけて、いまのばしょから、右へ40歩動く。'],['いまの ばしょから動く','2秒かけて、いまのばしょから、右へ40歩動く。']]],
        ['「スペース」キーが押されるのを待ちます。',true,{first:['きまりに あてはまるまで待つ','「スペース」キーがおされるまで待つ。'],not:['「スペース」キーがおされるまで、くり返す。\n  前へ10歩進む。','「スペース」とたずねて、答えを待つ。','「スペース」の合図を送って、その合図で始まったことが全部終わるまで待つ。']}],
        ['「入力らん1」を空にする。',true,[['入力らんに入れる','「入力らん1」に「」を入れる。']]],
        ['「入力らん1」に「こんにちは」をいれる。',true,[['入力らんに入れる','「入力らん1」に「こんにちは」を入れる。']]],
      ];
      for(const [source,ui,expected]of rows){const got=near(source,ui);
        if(Array.isArray(expected))eq(got,expected);else{eq(got[0],expected.first);for(const s of expected.not)ok(!got.some(g=>(Array.isArray(g)?g[1]:g)===s),source+' has '+s);}}
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
    return {
      total: results.length,
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      results,
    };
  }
