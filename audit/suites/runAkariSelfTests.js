function runAkariSelfTests() {
    const results = [];
    const test = (id, fn) => {
      try {
        fn();
        results.push({ id, pass: true, detail: 'PASS' });
      } catch (e) {
        results.push({ id, pass: false, detail: (e.code || e.name) + ': ' + e.message });
      }
    };
    const eq = (a, b) => {
      if (JSON.stringify(a) !== JSON.stringify(b))
        throw Error('expected ' + JSON.stringify(b) + '; got ' + JSON.stringify(a));
    };
    const reject = (fn, code) => {
      let e;
      try {
        fn();
      } catch (x) {
        e = x;
      }
      if (!e || (code && e.code !== code))
        throw Error('expected rejection ' + code + '; got ' + (e?.code || 'accepted'));
    };
    const make = (source, targetId = 'stage', event = 'start') => {
      const p = makeRegressionProject();
      p.scripts = [{ targetId, event, source }];
      return p;
    };
    const compile = (p) => {
      const c = compileProject(p);
      if (c.errors.length) throw Error(JSON.stringify(c.errors));
      return c;
    };
    const harness = (p) => {
      const c = compile(p),
        r = new RuntimeModel(p, {}),
        out = [],
        errors = [];
      const q = new EventScheduler(p, c, r, {
        say: (id, t) => out.push(t),
        runtimeError: (t, e) => errors.push(e),
      });
      q.running = true;
      q.paused = true;
      const run = (id = 'stage', ev = 'start', data = {}) => {
        q.spawnForRuntime(id, ev, data);
        let n = 0;
        while (q.ready.length && n++ < 5000) q.runTurn(true);
        if (n >= 5000) throw Error('test step limit');
        return { r, q, out, errors };
      };
      return { r, q, out, errors, run };
    };
    const run = (source, id = 'stage') => {
      const h = harness(make(source, id));
      h.run(id);
      if (h.errors.length) throw h.errors[0];
      return h;
    };
    test('FORMAT-PROJECT-METADATA-001 作成元と保存契約', () => {
      if (!/^\d+\.\d+\.\d+$/.test(PRODUCT_RELEASE)) throw Error('作成元ラベルが不正です');
      eq([Akari.makeDefaultProject().appVersion, LANGUAGE_CONTRACT_ID, PROJECT_FORMAT_ID], [PRODUCT_RELEASE, 2, 2]);
    });
    test('DEFAULT-001 初期作品', () => {
      const starter = Akari.makeDefaultProject();
      compile(starter);
      eq(starter.components.map((c) => [c.id, c.type, c.name]), [['sprite-1', 'sprite', 'あかり']]);
      eq(starter.projectData, { variables: [], lists: [] });
      eq(starter.components[0].localData, { variables: [], lists: [] });
      eq(starter.scripts.length, 1);
      eq([starter.scripts[0].targetId, starter.scripts[0].event], ['sprite-1', 'start']);
    });
    const sy = buildSymbols(makeRegressionProject()),
      r = new RuntimeModel(makeRegressionProject(), {}),
      cx = {
        runtime: r,
        compiled: compileProject(makeRegressionProject()),
        runtimeId: 'sprite-1',
        task: { lastAnswer: '', callFrames: [], execStack: [] },
      };
    const cases = [
      ['2＋3×4', 14],
      ['（2＋3）×4', 20],
      ['2＾3＾2', 512],
      ['－2＾2', -4],
      ['2＾－2', 0.25],
      ['10÷4', 2.5],
      ['余り（10、3）', 1],
      ['四捨五入（－1.5）', -2],
      ['平方根（9）', 3],
      ['絶対値（－3）', 3],
      ['最小（3、1、2）', 1],
      ['最大（3、1、2）', 3],
      ['数（「12」）', 12],
      ['文字（条件の答え（あてはまる））', 'あてはまる', '文字（真）'],
      ['つなぐ（「点：」、3）', '点：3'],
      ['「😀あ」の文字数', 2],
      ['「😀あ」の1文字目', '😀'],
      ['［1、2］の2番目', 2],
      ['［1、2］の長さ', 2],
      ['［1、2］に2が含まれている', true],
      ['「あいう」で「い」が最初にある番号', 2],
      ['［1、2］で5が最初にある番号', 0],
      ['1が2より小さい', true],
      ['2が2以上', true],
      ['2が2以下', true],
      ['2が1より大きい', true],
      ['2が2と同じ', true],
      ['2が3と違う', true],
      ['条件の答え（あてはまる）ではない', false, '真ではない'],
      ['条件の答え（あてはまらない）かつ1÷0が0と同じ', false, '偽かつ1÷0が0と同じ'],
      ['条件の答え（あてはまる）または1÷0が0と同じ', true, '真または1÷0が0と同じ'],
      ['【点数】', 0],
    ];
    for (const [source, value, legacySource = source] of cases) {
      test('EXPR ' + legacySource, () => eq(evalExpression(parseExpression(source, sy), cx), value));
      test('FORMAT ' + legacySource, () => {
        const a = parseExpression(source, sy),
          b = parseExpression(formatExpression(a), sy);
        eq(evalExpression(b, cx), value);
        eq(formatExpression(b), formatExpression(a));
      });
    }
    for (const [source, code] of [
      ['1÷0', 'R401'],
      ['平方根（－1）', 'R402'],
      ['数（「abc」）', 'R411'],
      ['［1］の2番目', 'R404'],
      ['「a」の0文字目', 'R404'],
    ])
      test('ERROR ' + source, () =>
        reject(() => evalExpression(parseExpression(source, sy), cx), code),
      );
    test('NORMALIZE 文字列を変更しない', () => eq(run('「Ａ＋※ B」と言う').out, ['Ａ＋※ B']));
    test('NORMALIZE 全角数字・半角演算子', () => eq(run('１２+３を言う').out, ['15']));
    test('IF もし・そうでなければ', () =>
      eq(
        run(
          'もし 点数が1以上なら、次のことをする。\n  「A」と言う。\nそうでなければ、次のことをする。\n  「B」と言う。',
        ).out,
        ['B'],
      ));
    test('LOOP 回数', () =>
      eq(run('3回くり返す。\n  点数に2を足す。').r.projectVars.get('点数'), 6));
    test('LOOP 零回', () =>
      eq(run('0回くり返す。\n  点数に1を足す。').r.projectVars.get('点数'), 0));
    test('LOOP あいだ', () =>
      eq(
        run(
          '条件（点数が3より小さい）が成り立つあいだ、次のことをくり返す。\n  点数に1を足す。',
        ).r.projectVars.get('点数'),
        3,
      ));
    test('LOOP まで', () =>
      eq(
        run(
          '条件（点数が3以上）が成り立つまで、次のことをくり返す。\n  点数に1を足す。',
        ).r.projectVars.get('点数'),
        3,
      ));
    test('LOOP 最初から成立', () =>
      eq(
        run('条件（条件の答え（あてはまる））が成り立つまで、次のことをくり返す。\n  点数に1を足す。').r.projectVars.get(
          '点数',
        ),
        0,
      ));
    test('LOOP break', () =>
      eq(
        run(
          '次のことをずっとくり返す。\n  点数に1を足す。\n  このくり返しを終える。',
        ).r.projectVars.get('点数'),
        1,
      ));
    test('LOOP continue', () =>
      eq(
        run('3回くり返す。\n  この回の残りをとばして、次の回へ進む。\n  点数に1を足す。').r.projectVars.get(
          '点数',
        ),
        0,
      ));
    test('LIST スナップショットと順番', () =>
      eq(
        run(
          '名前一覧の各要素を項目として、次のことをくり返す。\n  項目の値を言う。\n  名前一覧の中身を全部消す。',
        ).out,
        ['あかり', 'ひかり'],
      ));
    test('LIST 空の反復', () =>
      eq(
        run(
          '名前一覧の中身を全部消す。\n名前一覧の各要素を項目として、次のことをくり返す。\n  項目の値を言う。',
        ).out,
        [],
      ));
    test('LIST 追加・挿入・変更・削除', () =>
      eq(
        run(
          '名前一覧の中身を全部消す\n名前一覧に1を追加する\n名前一覧の2番目に2を挿入する\n名前一覧の1番目を3にする\n名前一覧の2番目を削除する',
        ).r.projectLists.get('名前一覧'),
        [3],
      ));
    test('MOVE 移動と回転', () => {
      const h = run(
        '横10、縦20の位置へ行く\n方向を0度にする\n10歩動く\n右に90度回る\n10歩動く',
        'sprite-1',
      );
      eq([Math.round(h.r.actor('sprite-1').x), Math.round(h.r.actor('sprite-1').y)], [20, 30]);
    });
    test('LOOK 衣装と拡大', () => {
      const h = run('次の衣装にする\n大きさを120％にする', 'sprite-1');
      eq([h.r.actor('sprite-1').costumeId, h.r.actor('sprite-1').scalePercent], ['costume-2', 120]);
    });
    test('CLONE 個体データを複製', () => {
      const h = run('自分のクローンを作る', 'sprite-1'),
        a = [...h.r.actors.values()].find((x) => x.isClone);
      a.vars.set('HP', 9);
      eq(h.r.actor('sprite-1').vars.get('HP'), 3);
      eq(h.r.projectVars, h.r.projectVars);
    });
    test('STATE 実行と設計の分離', () => {
      const p = make('点数を20にする'),
        h = harness(p);
      h.run();
      eq(p.projectData.variables[0].initialValue, 0);
    });
    test('FUNCTION 初期化と反復', () => {
      const p = make('（数一覧を［1、2、3］として、【合計値】で求めた答え）の値を言う');
      p.functions = [
        {ownerId:'stage',
          id: 'function-sum',
          name: '合計値',
          args: ['数一覧'],
          source:
            'この中だけで使う変数【合計】を作り、最初は0にする。\n数一覧の各要素を項目として、次のことをくり返す。\n  合計に項目を足す。\n合計を返す。',
        },
      ];
      const h = harness(p);
      h.run();
      if (h.errors.length) throw h.errors[0];
      eq(h.out, ['6']);
    });
    test('ACTION 名前を動詞として接続しない', () => {
      const p = make('（3）を渡して、【増やす】という手順を行う');
      p.actions = [{ownerId:'stage',  id: 'action-add', name: '増やす', args: ['量'], source: '点数に量を足す' }];
      const h = harness(p);
      h.run();
      if (h.errors.length) throw h.errors[0];
      eq(h.r.projectVars.get('点数'), 3);
    });
    test('FORMAT 本文の再解析', () => {
      for (const source of [
        'この中だけで使う変数【合計】を作り、最初は0にする\n合計を返す',
        '条件（条件の答え（あてはまる））が成り立つまで、次のことをくり返す。\n  何もしない。',
        '条件（条件の答え（あてはまらない））が成り立つあいだ、次のことをくり返す。\n  何もしない。',
        '名前一覧の各要素を項目として、次のことをくり返す。\n  項目の値を言う。',
        '条件（条件の答え（あてはまる））が成り立つまで待つ',
        'みんなに「開始」と知らせて、知らせを受けて始めたことが全部終わるまで待つ',
        '440Hzの音を1秒鳴らす',
      ]) {
        const ctx = { definition: {}, definitionKind: 'function', args: [] },
          a = parseScript(source, sy, ctx),
          f = formatScript(a);
        eq(formatScript(parseScript(f, sy, ctx)), f);
      }
    });
    const invalid = [
      'ここまで',
      '点数が1以上なら\n点数を1にする',
      'このくり返しを終える',
      '存在しない名前を1にする',
      '点数に1を足すです',
      '点数を［1］にする\n※ 型違いは実行時',
      '合計という変数を0で作る',
      '名前一覧のそれぞれを 項目 として扱う',
      '点数が3以上あいだ、次のことをくり返す。\n  何もしない。',
      '真あいだ、次のことをくり返す。\n  何もしない。',
    ];
    for (const source of invalid.filter((x) => !x.includes('型違い')))
      test('REJECT ' + source.split('\n')[0], () => {
        if (!compileProject(make(source)).errors.length) throw Error('invalid code accepted');
      });
    test('TYPE 変数にリストを代入しない', () => {
      const h = harness(make('点数を［1］にする'));
      h.run();
      eq(h.errors[0]?.code, 'R411');
    });
    test('TARGET 画面には動き命令なし', () => {
      if (!compileProject(make('10歩動く')).errors.some((x) => x.code === 'S304'))
        throw Error('accepted');
    });
    test('TARGET ボタンには衣装なし', () => {
      if (!compileProject(make('次の衣装にする', 'button-1')).errors.some((x) => x.code === 'S304'))
        throw Error('accepted');
    });
    test('SCOPE 別の個体の変数', () => {
      if (
        !compileProject(make('自分のHPを1にする', 'button-1')).errors.some((x) => x.code === 'S301')
      )
        throw Error('accepted');
    });
    test('SCOPE 反復項目は読み取り専用', () => {
      if (
        !compileProject(
          make('名前一覧の各要素を項目として、次のことをくり返す。\n  項目を1にする。'),
        ).errors.some((x) => x.code === 'S312')
      )
        throw Error('accepted');
    });
    test('FUNCTION 外部副作用の拒否', () => {
      const p = make('');
      p.functions = [
        {ownerId:'stage',  id: 'function-bad', name: '悪い計算', args: [], source: '点数に1を足す\n点数を返す' },
      ];
      if (!compileProject(p).errors.some((x) => x.code === 'S305')) throw Error('accepted');
    });
    test('SECURITY JSを実行しない', () => {
      for (const source of [
        'window.alert（1）',
        'document',
        'constructor',
        '__proto__',
        'Function（1）',
      ])
        if (!compileProject(make(source + 'の値を言う')).errors.length)
          throw Error(source + ' accepted');
    });
    test('SECURITY 名前と文字列の境界', () => {
      const p = make('【点数に1を足す】を7にする');
      p.projectData.variables.push({ id: 'var-long', name: '点数に1を足す', initialValue: 0 });
      const h = harness(p);
      h.run();
      eq(h.r.projectVars.get('点数に1を足す'), 7);
      eq(h.r.projectVars.get('点数'), 0);
    });
    test('SCHEDULER 公平な命令順', () => {
      const p = make('「A1」と言う\n「A2」と言う');
      p.scripts.push({
        targetId: 'button-1',
        event: 'start',
        source: '「B1」と言う\n「B2」と言う',
      });
      const h = harness(p);
      h.q.spawnForRuntime('stage', 'start');
      h.run('button-1');
      eq(h.out, ['A1', 'B1', 'A2', 'B2']);
    });
    test('NOTIFY 受け手の完了待ち', () => {
      const p = make('みんなに「go」と知らせて、知らせを受けて始めたことが全部終わるまで待つ\n「後」と言う');
      p.scripts.push({ targetId: 'button-1', event: 'message', source: '「受信」と言う' });
      const h = harness(p);
      h.run();
      eq(h.out, ['受信', '後']);
      eq(h.q.waitGroups.size, 0);
    });
    test('WAIT 時間は論理時計', () => {
      const h = harness(make('1秒待つ\n「完了」と言う'));
      let clock = 0;
      h.r.now = () => clock;
      h.run();
      eq(h.out, []);
      clock = 999;
      h.q.recheckBlocked(true);
      eq(h.q.ready.length, 0);
      clock = 1000;
      h.q.recheckBlocked(true);
      while (h.q.ready.length) h.q.runTurn(true);
      eq(h.out, ['完了']);
    });
    test('WAIT 条件の再評価', () => {
      const h = harness(make('条件（点数が1以上）が成り立つまで待つ\n「完了」と言う'));
      h.run();
      eq(h.out, []);
      h.r.projectVars.set('点数', 1);
      h.q.recheckBlocked(true);
      while (h.q.ready.length) h.q.runTurn(true);
      eq(h.out, ['完了']);
    });
    test('STOP 待機処理の破棄', () => {
      const h = harness(make('10秒待つ'));
      h.run();
      h.q.stop();
      eq([h.q.running, h.q.ready.length, h.q.blocked.size], [false, 0, 0]);
    });
    test('SCHEMA 未知項目の拒否', () => {
      const p = makeRegressionProject();
      p.extra = 1;
      reject(() => validateProject(p), 'F503');
    });
    test('SCHEMA ID重複の拒否', () => {
      const p = makeRegressionProject();
      p.components[1].id = p.components[0].id;
      reject(() => validateProject(p), 'F505');
    });
    test('RELEASE-PROJECT-METADATA', () => {
      const p = makeRegressionProject();
      delete p.appVersion;
      reject(() => validateProject(p), 'F503');
    });
    test('ASSET SHA256', () =>
      eq(
        sha256Fallback(new TextEncoder().encode('abc')),
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      ));
    test('ASSET Base64往復', () =>
      eq([...decodeBase64(encodeBase64(new Uint8Array([0, 1, 127, 255])))], [0, 1, 127, 255]));
    test('ASSET 非標準Base64拒否', () => reject(() => decodeBase64('YR=='), 'F508'));
    test('EXPORT 実行形式の復元', () => {
      const x = packExecutable(makeRegressionProject(), new AssetStore());
      const y = AKARI_RUNTIME.restoreExecutable(x);
      if (!y) throw Error('restore failed');
    });
    test('EXPORT Apache-2.0ライセンス保持', () => {
      const html = generateStandaloneHtml(makeRegressionProject(), new AssetStore());
      if (
        !AKARI_APACHE_LICENSE.includes('Apache License') ||
        !AKARI_APACHE_LICENSE.includes('Version 2.0, January 2004')
      )
        throw Error('embedded license missing');
      if (
        !html.includes('SPDX-License-Identifier: Apache-2.0') ||
        !html.includes(AKARI_APACHE_LICENSE)
      )
        throw Error('standalone license missing');
    });
    test('EXPORT HTMLの境界保護', () => {
      const p = make('「<script>悪い文字</' + 'script>」と言う');
      p.name = '<img src=x onerror=alert(1)>';
      const html = generateStandaloneHtml(p);
      eq((html.match(/<script>/g) || []).length, 1);
      eq((html.match(/<\/script>/g) || []).length, 1);
      if (html.includes('<img src=x')) throw Error('unsafe title');
    });
    test('JAPANESE 句点と接続', () =>
      eq(run('もし 点数が0と同じなら、次のことをする。\n  「はい」と言う。').out, ['はい']));
    for (let a = -4; a <= 4; a++)
      for (let b = 1; b <= 4; b++)
        for (const op of ['＋', '－', '×', '÷'])
          test(`COMPOSE ${a}${op}${b}`, () => {
            const src = `（${a}）${op}${b}`,
              ast = parseExpression(src, sy),
              v = evalExpression(ast, cx),
              wanted = op === '＋' ? a + b : op === '－' ? a - b : op === '×' ? a * b : a / b;
            eq(v, wanted);
            eq(evalExpression(parseExpression(formatExpression(ast), sy), cx), wanted);
          });
    test('ACTION 引数は値渡し', () => {
      const p = make('（名前一覧）を渡して、【変更】という手順を行う');
      p.actions = [{ownerId:'stage',  id: 'action-copy', name: '変更', args: ['一覧'], source: '一覧の中身を全部消す' }];
      const h = harness(p);
      h.run();
      if (h.errors.length) throw h.errors[0];
      eq(h.r.projectLists.get('名前一覧'), ['あかり', 'ひかり']);
    });
    test('ACTION 整形後の呼び出し', () => {
      const p = make('（2）を渡して、【追加】という手順を行う');
      p.actions = [{ownerId:'stage',  id: 'action-two', name: '追加', args: ['量'], source: '点数に量を足す' }];
      const c = compile(p);
      p.scripts[0].source = formatScript(c.items.find((x) => x.key.startsWith('script:')).ast);
      const h = harness(p);
      h.run();
      if (h.errors.length) throw h.errors[0];
      eq(h.r.projectVars.get('点数'), 2);
    });
    test('ERROR 失敗処理の資源を解放', () => {
      const h = harness(make('1÷0を言う'));
      for (let i = 0; i < 8; i++) h.run();
      eq(h.q.tasks.size, 0);
      eq(h.errors.length, 8);
    });
    test('QUESTION 答えの受け渡し', () => {
      const h = harness(make('「名前は？」とたずねる\n答えの値を言う'));
      h.run();
      eq(h.out, []);
      h.q.answerQuestion('あかり');
      while (h.q.ready.length) h.q.runTurn(true);
      eq(h.out, ['あかり']);
    });
    test('SOUND 再生終了通知まで待つ', () => {
      const h = harness(make('440Hzの音を0.1秒鳴らす\n「後」と言う'));
      let ended;
      h.r.assetCache = {
        startTone: (f, t, v, p, cb) => {
          ended = cb;
          return 'audio-test';
        },
        stopAllHandles: () => {},
      };
      h.run();
      eq(h.out, []);
      ended('audio-test');
      h.q.recheckBlocked(true);
      while (h.q.ready.length) h.q.runTurn(true);
      eq(h.out, ['後']);
    });
    test('KEY 日本語名の判定', () => {
      const h = harness(
        make('条件（「空白」キーが押されている）が成り立つまで待つ\n「押した」と言う'),
      );
      h.run();
      h.r.pressedKeys.add('空白');
      h.q.recheckBlocked(true);
      while (h.q.ready.length) h.q.runTurn(true);
      eq(h.out, ['押した']);
    });
    test('PEN 描画命令の順序', () => {
      const h = harness(
          make('ペンを下ろす\n10歩動く\nペンを上げる\n描いた線とスタンプを消す', 'sprite-1'),
        ),
        calls = [];
      h.q.ui.penLine = () => calls.push('line');
      h.q.ui.penClear = () => calls.push('clear');
      h.run('sprite-1');
      eq(calls, ['line', 'clear']);
    });
    test('FORMAT 全命令種の往復', () => {
      const sources = [
        '前面へ出す',
        '背面へ下げる',
        '隠れる',
        '現れる',
        '前の衣装にする',
        '次の背景にする',
        '前の背景にする',
        '大きさを50％にする',
        '2層前へ出す',
        '2層後ろへ下げる',
        '表示色を「赤」にする',
        '衣装を「星」にする',
        '背景を「空色」にする',
        '自分の文字を「文字」に変える',
        '「ボタン1」の文字を「文字」に変える',
        '「入力欄1」に「答え」を入れる',
        'ペンの色を「青」にする',
        'ペンの太さを3にする',
        'スタンプを押す',
        'すべての音を止める',
        '音量を25％にする',
        '音程を2段階上げる',
        '音程を2段階下げる',
        '440Hzの音を1秒鳴らし始める',
        '音「ベル」を鳴らし始める',
        '音「ベル」を鳴らす',
        'このスクリプトを止める',
        'ほかのスクリプトを止める',
        'すべてを止める',
        '「マスコット」のクローンを作る',
        'このクローンを削除する',
        '横100、縦50の位置へ行く',
        '1秒で横200、縦100の位置へ滑る',
        '左に15度回る',
        '方向を90度にする',
        '横位置を100にする',
        '縦位置を100にする',
        '「マウス」の方向を向く',
      ];
      for (const source of sources) {
        const f = formatScript(parseScript(source, sy));
        eq(formatScript(parseScript(f, sy)), f);
      }
    });
    test('EXPORT 復元後の動作一致', () => {
      const p = make('3回くり返す。\n  点数に1を足す。\n点数の値を言う。'),
        e = AKARI_RUNTIME.restoreExecutable(packExecutable(p, new AssetStore())),
        out = [],
        rr = new RuntimeModel(e.project, {}),
        ss = new EventScheduler(e.project, e.compiled, rr, { say: (id, v) => out.push(v) });
      ss.running = true;
      ss.paused = true;
      ss.spawnForRuntime('stage', 'start');
      let k = 0;
      while (ss.ready.length && k++ < 100) ss.runTurn(true);
      eq(out, ['3']);
    });
    for (const id of ['stage', 'button-1', 'sprite-1'])
      test('HINTS ' + id, () => {
        const p = makeRegressionProject();
        for (const source of availableHints(p, id)) {
          p.scripts = [{ targetId: id, event: 'start', source }];
          compile(p);
        }
      });
    return {
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      total: results.length,
      results,
    };
  }
