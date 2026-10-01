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
        schemas = BLOCK_SCHEMAS.filter((s) => kinds.has(s.kind) && !['MOVE_DIRECTION', 'GLIDE_DIRECTION'].includes(s.discriminator?.value)),
        newMotionSchemas = BLOCK_SCHEMAS.filter((s) => s.kind === 'MotionCommand' && ['MOVE_DIRECTION', 'GLIDE_DIRECTION'].includes(s.discriminator?.value));
      ok(schemas.length === 54, 'effect inventory changed: ' + schemas.length);
      // Pin the original identities as well as their count (d961dd3).
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
        "MotionCommand:GLIDE",
        "MotionCommand:GOTO",
        "MotionCommand:MOVE",
        "MotionCommand:POINT_TO",
        "MotionCommand:SET_DIRECTION",
        "MotionCommand:SET_X",
        "MotionCommand:SET_Y",
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
        "StopCommand:THIS",
        "UserActionCall",
        "WaitTime",
        "WaitUntil"
      ]);
      ok(newMotionSchemas.length === 2, 'v2 direction movement inventory');
      for (const schema of [...schemas, ...newMotionSchemas]) {
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
      // V2 adds two effect kinds; preserve the complete legacy inventory above.
      for (const [kind, source] of [
        ['WaitBroadcastGroup', 'みんなに「出発」と知らせる\nその知らせを受けて始めたことが全部終わるまで待つ\n0を返す'],
        ['ContinuousRule', '条件（条件の答え（あてはまる））が成り立つあいだ、自分は画面の右へ1秒に20歩の速さで動き続ける\n0を返す'],
      ]) {
        const p = base();
        p.functions = [{ ownerId: 'stage', id: 'function-v2-effect', name: '計算', args: [], source }];
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
      r.now=()=>0;q.schedule=()=>{};
      try{q.start();for(let i=0;i<1000&&q.ready.length;i++)q.runTurn();eq(q.errorRecords.map(e=>e.code),expectedError?[expectedError]:[]);eq(q.tasks.size,0);
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
        ['もし横位置が0より大きければ、','  右へ2歩動く。',103,102],
        ['個体値回くり返す。','  右へ2歩動く。',121,120],
        ['横位置が110より小さいあいだ、くり返す。','  右へ2歩動く。',111,110],
        ['横位置が110以上になるまで、くり返す。','  右へ2歩動く。',111,110],
        ['ずっとくり返す。','  右へ2歩動く。\n  いまのくり返しを終える。',103,102],
        ['個体一覧の中身を先頭から一つずつ見て、次のことを行う。','  右へ2歩動く。',107,106],
      ];
      for(const [header,body,movedX,removedX] of examples){
        const source='いぬは右へ1歩動く。\n'+header+'\n'+body,p=actorUnitFixture(source),
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
        const body='  右へ2歩動く。'+(breaks?'\n  いまのくり返しを終える。':''),source=header+'\n'+body+'\nいぬは右へ1歩動く。',p=actorUnitFixture(source),
          s=createEditorSession('script:core-start',source,{targetId:'cat',event:'start'},p,0),b=s.blockView.bodies.body;
        eq(s.syntaxAst.body[0].kind,kind);
        for(const duplicate of [false,true]){
          const e=prepareBlockEdit(s,{type:duplicate?'duplicate':'move',id:b[0].id,parentId:s.blockView.id,body:'body',index:2});
          ok(e.source.includes('自分は、'),kind+' explicit relative control subject');
          const out=actorUnitRun(actorUnitFixture(e.source));eq([out.cat,out.dog],[duplicate?4:2,101]);
        }
      }
      const source='いぬは何もしない。\nもし横位置が0より大きければ、\n  右へ2歩動く。',p=actorUnitFixture(source),s=createEditorSession('script:core-start',source,{targetId:'cat',event:'start'},p,0),
        e=prepareBlockEdit(s,{type:'field',id:s.blockView.bodies.body[1].id,key:'actorRef',value:{kind:'self'}});
      eq(e.syntaxAst.body[1].actorRef,{kind:'self'});eq(e.syntaxAst.body[1].thenBody[0].actorRef,{kind:'named',name:'いぬ'});
      eq(actorUnitRun(actorUnitFixture(e.source)).dog,100);
    });
    test('explicit control subjects preserve scope source and else', () => {
      for(const [kind,header,breaks] of actorUnitControls){
        const source='いぬは、'+header+'\n  自分は右へ2歩動く。'+(breaks?'\n  いまのくり返しを終える。':'')+'\n右へ3歩動く。',p=actorUnitFixture(source),ast=parseSyntax(source).ast;
        ok(ast,source);eq(ast.body[0].kind,kind);eq(ast.body[0].actorRef,{kind:'named',name:'いぬ'});eq(ast.body[1].actorRef,{kind:'self'});
        const text=formatScript(blockDecode(blockEncode(ast).tree));ok(astEquivalent(ast,parseSyntax(text).ast));
        const s=createEditorSession('script:core-start',source,{targetId:'cat',event:'start'},p,0);eq(prepareBlockEdit(s,{type:'noop'}).source,source);
        const out=actorUnitRun(p);eq([out.cat,out.dog],[5,100]);
      }
      for(const inline of [false,true]){
        const source=inline?'いぬは、もし点数が1と同じなら、右へ9歩動く。\nそうでなければ、右へ2歩動く。\n右へ3歩動く。'
          :'いぬは、もし点数が1と同じなら、\n  右へ9歩動く。\nそうでなければ、\n  右へ2歩動く。\n右へ3歩動く。';
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
      const stage=actorUnitFixture('画面は何もしない。\nもし点数が0と同じなら、\n  自分は右へ2歩動く。');eq(actorUnitRun(stage).cat,2);
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
      const clone=actorUnitFixture('自分の分身を作る。');clone.functions=structuredClone(p.functions);
      clone.scripts.push({id:'core-clone',targetId:'cat',event:'cloneStart',source:'個体値を30にする。\n（【外側】で求めた答え）を言う。'});
      for(const packed of [false,true])eq(actorUnitRun(clone,packed).speech.map(row=>row[1]),['30']);
    });
    test('numeric updates reject known declaration unit mismatch before effects', () => {
      const forms=['点数を1秒増やす。','点数を1秒減らす。','点数に1秒を足す。','点数から1秒を引く。','1秒を点数に足す。','1秒を点数から引く。'];
      for(const statement of forms){
        for(const individual of [false,true]){
          const p=actorUnitFixture('右へ10歩動く。\n'+(individual?'いぬは':'')+statement),d={id:'core-unit-score',name:'点数',initialValue:{magnitude:0,unit:'点'},expectedUnit:'点'};
          if(individual)p.components[1].localData.variables.push(d);else p.projectData.variables=[d];
          const errors=compileProject(p).errors;ok(errors.some(d=>d.code==='R417'&&d.line===2),statement);reject(()=>packExecutable(p),'X601');
          const ast=parseSyntax(p.scripts[0].source).ast;p.scripts[0].source=formatScript(blockDecode(blockEncode(ast).tree));ok(compileProject(p).errors.some(d=>d.code==='R417'));
        }
      }
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

    return {
      total: results.length,
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      results,
    };
  }
