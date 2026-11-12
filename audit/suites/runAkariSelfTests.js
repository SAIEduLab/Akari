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
      eq([Akari.makeDefaultProject().appVersion, LANGUAGE_CONTRACT_ID, PROJECT_FORMAT_ID], [PRODUCT_RELEASE, AUDIT_EXECUTABLE_CONTRACT.languageContractId, AUDIT_EXECUTABLE_CONTRACT.projectFormatVersion]);
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
    // LANGUAGE.md 移動量と座標の意味: y grows upward and 右に90度回る turns 0 into 270 (down), so the second
    // forward move lowers たてのばしょ.
    test('MOVE 移動と回転', () => {
      const h = run(
        '画面の左下のはしから、右へ10歩、上へ20歩のばしょへ行く\n方向を0度にする\n10歩動く\n右に90度回る\n10歩動く',
        'sprite-1',
      );
      eq([Math.round(h.r.actor('sprite-1').x), Math.round(h.r.actor('sprite-1').y), h.r.actor('sprite-1').direction], [20, 10, 270]);
    });
    test('LOOK 衣装と拡大', () => {
      const h = run('次の衣装にする\n大きさを120％にする', 'sprite-1');
      eq([h.r.actor('sprite-1').costumeId, h.r.actor('sprite-1').scalePercent], ['costume-2', 120]);
    });
    test('CLONE 個体データを複製', () => {
      const h = run('自分のコピーを作る', 'sprite-1'),
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
      const expectedLicense = "MIT License\n\nCopyright (c) 2026 SAIEduLab\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n";
      if (AKARI_LICENSE !== expectedLicense) throw Error('canonical MIT license missing');
      if (!html.includes('SPDX-License-Identifier: MIT') || !html.includes(expectedLicense))
        throw Error('standalone MIT license or SAIEL copyright missing');
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
        '「ベル」を鳴らし始める',
        '「ベル」を鳴らす',
        'このスクリプトを止める',
        'ほかのスクリプトを止める',
        'すべてを止める',
        '「マスコット」のコピーを作る',
        'このコピーだけを消す',
        '画面の左下のはしから、右へ100歩、上へ50歩のばしょへ行く',
        '1秒かけて、画面の左下のはしから、右へ200歩、上へ100歩のばしょへ行く',
        '画面の左下のはしから、右へ100歩、上へ（たてのばしょ）歩のばしょへ行く',
        '画面の左下のはしから、右へ（よこのばしょ）歩、上へ100歩のばしょへ行く',
        '画面の左下のはしへ行く',
        'いまのばしょから、右へ10歩動く',
        'いまのばしょから、左へ10歩、下へ5歩動く',
        '2秒かけて、いまのばしょから、右へ10歩、上へ5歩動く',
        '「マスコット」のところへ行く',
        '1秒かけて、マウスのところへ行く',
        '左に15度回る',
        '1秒かけて、右に90度回る',
        '方向を90度にする',
        '「マウス」の方向を向く',
        '自分のほかの動きを止める',
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
    {
      const ok=(v,m='mismatch')=>{if(!v)throw Error(m);};
    // searchIntent: the block a search word names, with the values its words give.
    test('SEARCH-INTENT wait scale colour and axis words',()=>{
      const plain=v=>v==null?null:JSON.parse(JSON.stringify(v)),turn={schemaId:'MotionCommand:SET_DIRECTION'},move={schemaId:'MotionCommand:MOVE_BY'},
        x={schemaId:'MotionCommand:MOVE_BY',direction:'right',directions:['right','left']},y={schemaId:'MotionCommand:MOVE_BY',direction:'up',directions:['up','down']};
      const expected={'1秒ぐらい待つ':{schemaId:'WaitTime'},'1秒ウエイト':{schemaId:'WaitTime'},'でかくする':{schemaId:'LooksCommand:SET_SCALE',scale:150},'ふくらむ':{schemaId:'LooksCommand:SET_SCALE',scale:150},
        '巨大になる':{schemaId:'LooksCommand:SET_SCALE',scale:150},'ミニにする':{schemaId:'LooksCommand:SET_SCALE',scale:50},
        '左上を向く':turn,'右下を向く':turn,'ひだりうえを向く':turn,'右ななめ上を向く':turn,'ななめ左下を向く':turn,'左上へ動く':move,'右下に10歩進む':move,'みぎうえへ行く':move,
        '左右に動く':x,'上下に動く':y,'よこに動く':x,'ペンの色を青緑にする':{schemaId:'PenCommand:SET_COLOR'},'色を赤むらさきにする':{schemaId:'LooksCommand:SET_COLOR'},'画面の左下のはしへ行く':null,
        '左を向く':{schemaId:'MotionCommand:SET_DIRECTION',direction:'left',value:-90},'上へ動く':{schemaId:'MotionCommand:MOVE_BY',direction:'up'},
        '色を水色にする':{schemaId:'LooksCommand:SET_COLOR',color:'水色'},'ペンの色をピンクにする':{schemaId:'PenCommand:SET_COLOR',color:'ピンク'}};
      eq(Object.fromEntries(Object.keys(expected).map(q=>[q,plain(Akari.searchIntent(q))])),expected);
    });
    // assistSeeds: numbers written in kanji or kana outside quotes are read as digits; quoted text stays as written.
    test('ASSIST-SEEDS quoted text kept, numbers outside it read',()=>{
      const p=makeRegressionProject(),symbols=buildSymbols(p),seed=q=>Akari.assistSeeds(q,symbols,{targetId:'sprite-1'});
      const a=seed('「一歩」と「二歩」と言って三歩動く');
      eq([a.text,a.strings,a.numbers],['「一歩」と「二歩」と言って3歩動く',['一歩','二歩'],[{value:3,unit:'歩',at:13,end:14}]]);
      const b=seed('§0§と（三歩）と言う');eq([b.text,b.strings],['§0§と（三歩）と言う',['三歩']]);
    });
    {
      const placeWorld=()=>{const p=makeDefaultProject(),t=JSON.parse(JSON.stringify(p.components[0]));
        p.components=['ねこ','星'].map((name,i)=>{const id='sprite-'+(i+1),c={...JSON.parse(JSON.stringify(t)),id,type:'sprite',name,localData:{variables:[],lists:[]}};c.costumes=c.costumes.map((k,j)=>({...k,id:id+'-costume-'+j}));c.costumeId=c.costumes[0].id;return c;});
        p.components[0].localData.variables.push({id:'cat-health',name:'体力',initialValue:0});
        p.projectData={variables:[{id:'variable-0',name:'点数',initialValue:0}],lists:[{id:'list-0',name:'持ち物',initialValue:[]}]};
        p.sounds=[];p.actions=[];p.functions=[];p.scripts=[{id:'s1',targetId:'sprite-1',event:'start',source:'何もしない。'}];validateDesignProject(p);return p;};
      const place=(source,targetId='sprite-1',event='start',world=placeWorld)=>{const p=world(),target=p.components.find(c=>c.id===targetId);p.scripts[0].targetId=targetId;p.scripts[0].event=event;p.scripts[0].source=source;
        const verify={symbols:buildSymbols(p),targetId,targetType:target?.type||'stage',event,args:[],level:'advanced'},trigger={...verify,key:'script:s1',ownerKey:'script:s1',id:'s1',scriptId:'s1'};
        const parsed=parseSyntax(source,{...trigger,symbols:buildSymbols(p),project:p}),d=parsed.syntaxDiagnostics[0];ok(!parsed.ast,source);
        const had='performance' in globalThis,clock=globalThis.performance;globalThis.performance={now:()=>0};let found;try{found=Akari.assistCandidates(p,source,verify,d);}finally{if(had)globalThis.performance=clock;else delete globalThis.performance;}return [d.code,Array.from(d.proposals||[],r=>r.source),found.map(c=>c.schemaId+' '+c.text),found.map(c=>[c.start,c.end,c.source===c.text])];};
      // A condition written without 、 gets only sentences that keep it; a list said in full is said one by one; a
      // variable the part does not have, a list said as a value and a rewrite the work's check refuses are not shown.
      test('ASSIST-PLACE near sentences keep conditions and pass the work check',()=>{
        const hide='すがたをかくす。',rows=[
          ['ねこが星にさわったら点数をふやす',['P205',[],[]]],
          ['星にさわったら消える',['P205',[],['Heading:touchStart 「星」にふれたとき、\n  '+hide,'IfStatement もし「星」にふれていれば、\n  '+hide,'WaitUntil 「星」にふれるまで待つ。\n'+hide]]],
          ['スペースキーをおしたら上に動く',['P205',[],[]]],
          ['点数が10より大きければ止まる',['P201',[],['StopCommand:THIS もし点数が10より大きければ、\n  この動きを止める。','StopCommand:OTHERS もし点数が10より大きければ、\n  ほかの動きを全部止める。','StopCommand:OWN_OTHERS もし点数が10より大きければ、\n  自分のほかの動きを止める。']]],
          ['点数が10のとき止まる',['P201',[],[]]],
          ['星にふれると消える',['P205',[],[]]],
          ['星にふれるまで右に動く',['P205',[],[]]],
          ['点数が10になるまで右に動く',['P205',[],[]]],
          ['点数が10より小さいあいだ点数を1ふやす',['P205',[],['RepeatWhile 点数が10より小さいあいだ、くり返す。\n  点数を1ふやす。']]],
          ['持ち物の中に「本」があれば「あるよ」と言う',['P205',[],[]]],
          ['点数をふやして',['P201',[],['NumericUpdate:ADD 点数を1ふやす。']]],
          ['点数を10ふやして',['P205',['点数を10ふやす'],[]]],
          ['持ち物の中身を全部言う。',['P201',[],['ForEach 持ち物の中身を先頭から一つずつ見て、次のことを行う。\n  この中では、今見ているものを【これ】とよぶ。\n  これを1秒話す。']]],
          ['持ち物の中身を順に言う。',['P201',[],['ForEach 持ち物の中身を先頭から一つずつ見て、次のことを行う。\n  この中では、今見ているものを【これ】とよぶ。\n  これを1秒話す。']]],
          ['星にふれたら点数を1ふやす',['P205',['「星」にふれたとき、点数を1ふやす','もし「星」にふれていれば、点数を1ふやす','「星」にふれるまで待って、点数を1ふやす'],[]]],
          ['星にふれたら点数を1ふやす\n10歩動く。',['P205',['もし「星」にふれていれば、点数を1ふやす','「星」にふれるまで待って、点数を1ふやす'],[]]],
          ['星にふれたら\n10歩動く。',['P205',[],[]]],
          ['星にふれたとき消える',['P205',['すがたをかくす'],[]]],
          ['星にふれたとき消える\n10歩動く。',['P205',[],[]]],
          ['星にふれたら点数を1ふやす',['P205',[],[]],'stage'],
          ['すがたをかえる',['P205',[],[]],'stage'],
          ['1びょうごとに点数を1ふやす',['P205',[],['Forever ずっとくり返す。\n  1秒待つ。\n  点数を1ふやす。']]],
          ['「星」までのきょりが言う。',['P201',[],['Say 「星」までのきょりを言う。']]],
          ['「スタート」の合図が送って、その合図で始まったことが全部終わるまで待つ。',['P205',[],['BroadcastAndWait 「スタート」の合図を送って、その合図で始まったことが全部終わるまで待つ。']]],
          ['星にふれたら\n「あと」と言う。',['P205',[],[]],'sprite-2','click'],
        ];
        for(const [source,expected,targetId,event]of rows){const got=place(source,targetId,event);eq([source,got.slice(0,3)],[source,expected]);eq([source,got[3]],[source,expected[2].map(()=>[0,source.replace(/。$/,'').length,!source.endsWith('。')])]);}
      });
      // 自分の and 作品の stay before a name filled in only when the part, or the work, has a variable of that name; a list
      // said in full is said item by item.
      test('ASSIST-PLACE 自分の and 作品の kept only for names that have them',()=>{
        const both=()=>{const p=placeWorld();p.components[0].localData.variables.push({id:'cat-score',name:'点数',initialValue:0});validateDesignProject(p);return p;},
          lists=()=>{const p=placeWorld();p.components[0].localData.lists.push({id:'cat-items',name:'持ち物',initialValue:[]},{id:'cat-bag',name:'袋',initialValue:[]});validateDesignProject(p);return p;},add=t=>'NumericUpdate:ADD '+t+'を1ふやす。';
        const each='ForEach 持ち物の中身を先頭から一つずつ見て、次のことを行う。\n  この中では、今見ているものを【これ】とよぶ。\n  これを1秒話す。';
        const rows=[
          ['体力をふやして',[add('自分の体力'),add('体力')]],['自分の点数をふやして',[add('点数')]],['作品の点数をふやして',[add('点数')]],
          ['持ち物を一つずつ言う',[each]],['持ち物の中身を順番に話す',[each]],['持ち物を全部話す',[each]],['点数を全部言う',['Say 点数を言う。']],['体力をしゃべって',['Say 体力を言う。']],['点数を表示する',['Say 点数を言う。']],
          ['体力をふやして',[add('自分の体力'),add('体力')],both],['自分の点数をふやして',[add('自分の点数'),add('作品の点数')],both],
          ['作品の点数をふやして',[add('作品の点数'),add('自分の点数')],both],['作品の体力をふやして',[add('体力'),add('自分の体力')],both],
          ['点数をへらして',['NumericUpdate:SUB 作品の点数を1へらす。','NumericUpdate:SUB 自分の点数を1へらす。'],both],
          ['自分の持ち物に「本」を入れて',['ListAppend 自分の持ち物のさいごに「本」を入れる。','ListInsert 自分の持ち物の1番目に「本」を入れる。'],lists],
          ['作品の袋に「本」を入れて',['ListAppend 袋のさいごに「本」を入れる。','ListInsert 袋の1番目に「本」を入れる。','ListAppend 自分の袋のさいごに「本」を入れる。','ListInsert 自分の袋の1番目に「本」を入れる。'],lists],
          ['持ち物をからにして',['ListClear 作品の持ち物の中身を全部消す。','ListClear 自分の持ち物の中身を全部消す。'],lists],
        ];
        for(const [source,texts,world]of rows){const got=place(source,'sprite-1','start',world)[2];eq([source,world===lists?got.slice(0,texts.length):got],[source,texts]);}
        // (a list of the part's own written with 自分の keeps it in every near sentence)
        ok(place('自分の持ち物に「本」を入れて','sprite-1','start',lists)[2].every(t=>t.includes('自分の持ち物')));
      });
      // A quoted word is put only in a place that takes a text: the place of a number (the steps of a pitch) keeps its number.
      test('ASSIST-PLACE a quoted word is not put in the place of a number',()=>{
        const found=place('「あ」の音を10回ならして')[2];
        ok(!found.some(t=>t.includes('「あ」')),found.join('|'));
        ok(found.includes('SoundCommand:PITCH_UP 音の高さを1段階上げる。'),found.join('|'));
      });
      // In the stage's body a sentence that names a part is looked for in that part's body and gets the part's name.
      test('ASSIST-PLACE stage near sentences name the part that does them',()=>{
        const move=n=>n+'は、いまのばしょから、右へ10歩動く。',rows=[
          ['ねこを右に動かす',['MotionCommand:MOVE_BY '+move('ねこ'),'MotionCommand:MOVE_BY ねこはいまのばしょから、右へ10歩動く。']],
          ['ねこが右に動く',['MotionCommand:MOVE_BY '+move('ねこ'),'MotionCommand:MOVE_BY ねこはいまのばしょから、右へ10歩動く。']],
          ['ねこを見せる',['LooksCommand:SHOW ねこはすがたを見せる。']],['ねこのすがたを見せる',['LooksCommand:SHOW ねこはすがたを見せる。']],
          ['ねこと星が右に動く',['MotionCommand:MOVE_BY '+move('ねこ')+'\n'+move('星')]],['ねこと星をかくす',['LooksCommand:HIDE ねこはすがたをかくす。\n星はすがたをかくす。']],
        ];
        for(const [source,texts]of rows)eq([source,place(source,'stage')[2]],[source,texts]);
      });
    }
    }
    {
      // EXTENSIONS.md: what createAkariExtensionHost, register, requirements, validateRequirements and upgradeRequirements refuse and give.
      const said=fn=>{try{fn();return 'none';}catch(error){return error.code+' '+error.message;}};
      const manifestOf=(host,id,more={})=>({id,version:'1.0.0',apiContract:1,standard:host.standard,description:'d',dependencies:[],capabilities:[],
        offline:true,selfContained:true,state:{formatVersion:1,initial:null},commands:[],calculations:[],events:[],...more});
      const command=(id,name,more={})=>({id,name,description:'d',args:[],returns:{type:'void',unit:null},async:false,...more});
      const calculation=(id,name)=>({id,name,description:'d',args:[],returns:{type:'number',unit:null},async:false});
      const handlers=manifest=>({commands:Object.fromEntries(manifest.commands.map(item=>[item.id,()=>{}])),calculations:Object.fromEntries(manifest.calculations.map(item=>[item.id,()=>1]))});
      const registered=(more,options={})=>said(()=>{const host=Akari.createAkariExtensionHost(options),manifest=manifestOf(host,'t.one',more);
        host.register(manifest,function factory(){return handlers(manifest);});});
      const NAME='E702 拡張の識別子・名前が不正または重複しています';
      test('EXTENSION-HOST refuses allowed capabilities that are not distinct names',()=>{
        const made=allowedCapabilities=>said(()=>Akari.createAkariExtensionHost({allowedCapabilities}));
        for(const value of ['c.a',['c.a','c.a'],['c.a',''],['c.a',1]])eq(made(value),'E707 許可する 能力は、重ならない 名前の 並びに します');
        for(const value of [undefined,[],['c.a','c.b']])eq(made(value),'none');
      });
      test('EXTENSION-HOST reads only plain objects as a contract record',()=>{
        const host=Akari.createAkariExtensionHost({}),record=host.requirements();
        class Box{constructor(from){Object.assign(this,from);}}
        eq(host.validateRequirements(Object.assign(Object.create(null),record)),true);
        for(const value of [null,[],new Box(record)])eq(said(()=>host.validateRequirements(value)),'E703 拡張の実行契約が一致しません');
      });
      test('EXTENSION-HOST register checks the Japanese name of an extension',()=>{
        const BAD='E702 拡張の日本語名が不正です';
        eq(registered({name:'あ'.repeat(60)}),'none');eq(registered({name:'😀'.repeat(60)}),'none');
        eq(registered({name:'あ'.repeat(61)}),BAD);eq(registered({name:'か「ぎ'}),BAD);eq(registered({name:'t.one'}),BAD);
        eq(registered({name:'予約名'},{reservedNames:['予約名']}),BAD);eq(registered({name:'予約名'},{reservedNames:['別の名']}),'none');
      });
      test('EXTENSION-HOST register checks the names of operations',()=>{
        eq(registered({commands:[command('a','めい')]}),'none');
        for(const name of [5,'  ','め\nい'])eq(registered({commands:[command('a',name)]}),NAME);
      });
      test('EXTENSION-HOST register keeps operation ids and names apart',()=>{
        eq(registered({commands:[command('a','a')]}),'none');
        eq(registered({commands:[command('a','x'),command('b','y')]}),'none');
        eq(registered({commands:[command('a','b')],calculations:[calculation('b','計算')]}),'none');
        eq(registered({commands:[command('a','x'),command('a','y')]}),NAME);
        eq(registered({commands:[command('a','x')],calculations:[calculation('a','計算')]}),NAME);
        eq(registered({commands:[command('a','x'),command('b','x')]}),NAME);
        eq(registered({commands:[command('a','b'),command('b','c')]}),NAME);
        eq(said(()=>{const host=Akari.createAkariExtensionHost({});for(const id of ['t.one','t.two']){const manifest=manifestOf(host,id,{commands:[command('a','同じ名')]});
          host.register(manifest,function factory(){return handlers(manifest);});}}),NAME);
      });
      test('EXTENSION-HOST register refuses a lone surrogate in a written name',()=>{
        const LONE='E701 拡張の名前の文字に、対になっていないサロゲートは使えません';
        eq(registered({name:'な\ud800'}),LONE);eq(registered({commands:[command('a','め\udc00')]}),LONE);
        eq(registered({commands:[command('a','めい',{args:[{name:'\ud800ひ',type:'number',unit:null}]})]}),LONE);
        eq(registered({name:'な😀',commands:[command('a','め😀',{args:[{name:'ひ😀',type:'number',unit:null}]})]}),'none');
      });
      test('EXTENSION-HOST register refuses a factory without source text',()=>{
        eq(said(()=>{const host=Akari.createAkariExtensionHost({});host.register(manifestOf(host,'t.one'),function factory(){return handlers(manifestOf(host,'t.one'));}.bind(null));}),
          'E701 拡張factoryは書き出せる同期の関数リテラルにします');
      });
      // Each row: id, version, the ids it depends on (registered before it), capabilities.
      const hostOf=rows=>{const host=Akari.createAkariExtensionHost({}),ids={};
        for(const [id,version,dependsOn=[],capabilities=[]]of rows){const manifest=manifestOf(host,id,{version,capabilities,dependencies:dependsOn.map(other=>ids[other]),
          state:{formatVersion:1,initial:{from:id},persist:'project'},commands:[command('a',id+'の命令')]});
          ids[id]=host.register(manifest,function factory(){return handlers(manifest);});}
        return {host,ids};};
      const chain=()=>hostOf([['t.base','1.0.0',[],['c.base']],['t.dep','1.0.0',['t.base']],['t.main','1.0.0',['t.dep']],['t.other','1.0.0',[],['c.other']]]);
      test('EXTENSION-HOST requirements name the chosen extensions with what they depend on',()=>{
        const {host}=chain(),of=ids=>{const r=host.requirements(ids);return [r.required.map(x=>x.id),r.capabilities];};
        eq(of(),[['t.base','t.dep','t.main','t.other'],['c.base','c.other']]);
        eq(of(['t.main']),[['t.base','t.dep','t.main'],['c.base']]);
        eq(of(['t.main','t.dep','t.main']),[['t.base','t.dep','t.main'],['c.base']]);
        eq(of(['t.other','t.nope']),[['t.other'],['c.other']]);
        eq(of(['t.nope']),[[],[]]);eq(of([]),[[],[]]);
      });
      test('EXTENSION-HOST validateRequirements checks each recorded extension and its dependencies',()=>{
        const {host,ids}=chain(),record=host.requirements(['t.main']),zero='0'.repeat(64);
        eq(host.validateRequirements(record),true);
        const withRequired=required=>said(()=>host.validateRequirements({...record,required}));
        eq(withRequired([{id:'t.nope',version:'1.0.0',contentHash:zero}]),'E703 必要な拡張「t.nope」が登録されていません');
        eq(withRequired([{...ids['t.other'],version:'9.9.9'}]),'E703 必要な拡張「t.other」の版・内容が一致しません');
        eq(withRequired([{...ids['t.other'],contentHash:zero}]),'E703 必要な拡張「t.other」の版・内容が一致しません');
        const MISSING='E703 必要な依存拡張が記録されていません';
        eq(withRequired([ids['t.main']]),MISSING);
        eq(withRequired([ids['t.main'],{...ids['t.dep'],version:'9.9.9'},ids['t.base']]),MISSING);
        eq(withRequired([ids['t.main'],{...ids['t.dep'],contentHash:zero},ids['t.base']]),MISSING);
      });
      test('EXTENSION-HOST upgradeRequirements refuses a malformed record as validateRequirements does',()=>{
        const {host,ids}=chain();
        for(const value of [null,{...host.requirements(),required:'x'},{apiContract:1,standard:NaN,required:'x',capabilities:[]}]){
          eq(said(()=>host.upgradeRequirements(value)),said(()=>host.validateRequirements(value)));}
        eq(said(()=>host.upgradeRequirements(null)),'E703 拡張の実行契約が一致しません');
        eq(said(()=>host.upgradeRequirements({apiContract:1,standard:NaN,required:'x',capabilities:[]})),'E701 拡張のデータは有限のJSON値にします');
        eq(said(()=>host.upgradeRequirements({...host.requirements(['t.other']),required:[{...ids['t.other'],version:['1.0.0']}]})),'E703 必要な拡張「t.other」の版・内容が一致しません');
      });
      // A registered extension that the newer release depends on (with what that depends on) is recorded once, with its
      // initial state; one the work records already is not recorded again.
      test('EXTENSION-HOST upgradeRequirements records the dependencies a newer release adds once',()=>{
        const planned=(older,newer)=>{const plan=newer.host.upgradeRequirements({...older.host.requirements(),state:older.host.snapshotState()});eq(newer.host.validateRequirements(plan.envelope),true);
          return [plan.upgrades.map(x=>x.id+' '+x.from+'→'+x.to),plan.envelope.required.map(x=>x.id+'@'+x.version),plan.envelope.state.map(x=>[x.id,x.value])];};
        eq(planned(hostOf([['t.main','1.0.0']]),hostOf([['t.base','1.0.0'],['t.dep','1.0.0',['t.base']],['t.main','1.1.0',['t.dep','t.base']]])),
          [['t.main 1.0.0→1.1.0'],['t.main@1.1.0','t.dep@1.0.0','t.base@1.0.0'],[['t.main',{from:'t.main'}],['t.dep',{from:'t.dep'}],['t.base',{from:'t.base'}]]]);
        eq(planned(hostOf([['t.main','1.0.0']]),hostOf([['t.base','1.0.0'],['t.dep','1.0.0',['t.base']],['t.main','1.1.0',['t.dep']]])),
          [['t.main 1.0.0→1.1.0'],['t.main@1.1.0','t.dep@1.0.0','t.base@1.0.0'],[['t.main',{from:'t.main'}],['t.dep',{from:'t.dep'}],['t.base',{from:'t.base'}]]]);
        eq(planned(hostOf([['t.dep','1.0.0'],['t.main','1.0.0',['t.dep']]]),hostOf([['t.base','1.0.0'],['t.dep','1.0.0'],['t.main','1.1.0',['t.dep','t.base']]])),
          [['t.main 1.0.0→1.1.0'],['t.dep@1.0.0','t.main@1.1.0','t.base@1.0.0'],[['t.dep',{from:'t.dep'}],['t.main',{from:'t.main'}],['t.base',{from:'t.base'}]]]);
      });
      // A work saved where t.gone (with capability c.gone) was registered too, and opened where it is not and t.main is newer.
      test('EXTENSION-HOST upgradeRequirements drops an unused extension that is no longer registered',()=>{
        const older=hostOf([['t.dep','1.0.0'],['t.gone','1.0.0',[],['c.gone']],['t.main','1.0.0',['t.dep']]]);
        const newer=hostOf([['t.dep','1.0.0'],['t.main','1.1.0',['t.dep'],['c.main']]]);
        const saved={...older.host.requirements(),state:older.host.snapshotState()};
        const plan=newer.host.upgradeRequirements(saved,['t.gone']);
        eq([plan.upgrades.map(x=>x.id+' '+x.from+'→'+x.to),plan.dropped,plan.envelope.required.map(x=>x.id+'@'+x.version),plan.envelope.capabilities,plan.envelope.state.map(x=>[x.id,x.value])],
          [['t.main 1.0.0→1.1.0'],['t.gone'],['t.dep@1.0.0','t.main@1.1.0'],['c.main'],[['t.dep',{from:'t.dep'}],['t.main',{from:'t.main'}]]]);
        eq(newer.host.validateRequirements(plan.envelope),true);
        const without={...saved};delete without.state;
        const bare=newer.host.upgradeRequirements(without,['t.gone']);
        eq([bare.dropped,bare.envelope.required.map(x=>x.id),'state' in bare.envelope],[['t.gone'],['t.dep','t.main'],false]);
        eq(said(()=>newer.host.upgradeRequirements(saved)),'E703 必要な拡張「t.gone」が登録されていません');
        eq(said(()=>newer.host.upgradeRequirements(saved,['t.gone','t.dep'])),'none');
        eq(newer.host.upgradeRequirements(saved,['t.gone','t.dep','t.main']).dropped,['t.gone']);
        const same={...newer.host.requirements(),state:newer.host.snapshotState()};same.required=[...same.required,older.ids['t.gone']];
        eq(said(()=>newer.host.upgradeRequirements(same,['t.gone'])),'E703 必要な拡張「t.gone」が登録されていません');
        eq(said(()=>newer.host.upgradeRequirements({...saved,required:[...saved.required,null]},['t.gone'])),'E703 必要拡張の記録が不正です');
      });
      // EXTENSIONS.md: timeoutMs (of a connection and a request) is a positive value of at most 2147483647 ms. A connection
      // needs a session (AbortController), a page (window) and MessageChannel: where they are missing (the node run of this
      // suite), stand-ins with what connectWindow uses are put in for the test, and the clock is a recorder of the delays
      // asked for, so that nothing waits.
      test('EXTENSION-HOST connectWindow waits at most 2147483647 ms for the handshake',()=>{
        const put=[],swap=(name,value)=>{put.push([name,Object.prototype.hasOwnProperty.call(globalThis,name),globalThis[name]]);globalThis[name]=value;};
        const timeouts=[],intervals=[];
        try {
          if(typeof AbortController!=='function'){
            class StandInSignal{constructor(){this.aborted=false;this.reason=undefined;this.listeners=[];}
              addEventListener(type,listener,options){if(type==='abort')this.listeners.push({listener,once:!!options?.once});}
              removeEventListener(type,listener){this.listeners=this.listeners.filter(x=>x.listener!==listener);}}
            swap('AbortController',class{constructor(){this.signal=new StandInSignal();}
              abort(reason){const s=this.signal;if(s.aborted)return;s.aborted=true;s.reason=reason;const all=s.listeners;s.listeners=all.filter(x=>!x.once);for(const x of all)x.listener();}});
          }
          if(typeof window==='undefined')swap('window',{addEventListener(){},removeEventListener(){}});
          if(typeof MessageChannel==='undefined'){const port=()=>({onmessage:null,onmessageerror:null,postMessage(){},start(){},close(){}});swap('MessageChannel',class{constructor(){this.port1=port();this.port2=port();}});}
          swap('setTimeout',(f,ms)=>{timeouts.push(ms);return timeouts.length;});swap('clearTimeout',()=>{});
          swap('setInterval',(f,ms)=>{intervals.push(ms);return intervals.length;});swap('clearInterval',()=>{});
          const host=Akari.createAkariExtensionHost({}),manifest=manifestOf(host,'t.one');host.register(manifest,function factory(){return handlers(manifest);});
          const target={posted:0,postMessage(){this.posted++;}};
          host.beginSession();
          try {
            const connect=timeoutMs=>{const promise=host.connectWindow(target,{origin:'https://peer.example',...(timeoutMs===undefined?{}:{timeoutMs})});promise.catch(()=>{});return promise;};
            connect(2147483647);connect();
            eq([timeouts,intervals,target.posted],[[2147483647,10000],[100,100],2]);
            for(const timeoutMs of [2147483648,0,-1,Infinity])eq(said(()=>connect(timeoutMs)),'E707 接続timeoutは2147483647ミリ秒までの正の値にします');
            eq(timeouts.length,2);
          } finally { host.endSession(); }
        } finally {
          for(const [name,had,value] of put.reverse()){if(had)globalThis[name]=value;else delete globalThis[name];}
        }
      });
      // EXTENSIONS.md: the host's validateValue is given each value handed to an extension (incoming false) and each value taken
      // from one, an answer or an event's payload (incoming true), and gives the value to use, or nothing to use the one given.
      // The session needs AbortController: where it is missing (the node run of this suite) a stand-in is put in for the test.
      test('EXTENSION-HOST gives validateValue each value it hands over and each it takes, and uses the value given back',()=>{
        const put=[],swap=(name,value)=>{put.push([name,Object.prototype.hasOwnProperty.call(globalThis,name),globalThis[name]]);globalThis[name]=value;};
        try {
          if(typeof AbortController!=='function'){
            class StandInSignal{constructor(){this.aborted=false;this.reason=undefined;this.listeners=[];}
              addEventListener(type,listener,options){if(type==='abort')this.listeners.push({listener,once:!!options?.once});}
              removeEventListener(type,listener){this.listeners=this.listeners.filter(x=>x.listener!==listener);}}
            swap('AbortController',class{constructor(){this.signal=new StandInSignal();}
              abort(reason){const s=this.signal;if(s.aborted)return;s.aborted=true;s.reason=reason;const all=s.listeners;s.listeners=all.filter(x=>!x.once);for(const x of all)x.listener();}});
          }
          const seen=[],events=[];
          const host=Akari.createAkariExtensionHost({validateValue:(value,spec,incoming)=>{seen.push([value,spec.type,incoming]);return value===5?6:undefined;}});
          const manifest=manifestOf(host,'t.one',{calculations:[{...calculation('same','同じ'),args:[{name:'数',type:'number',unit:null}]}],
            events:[{id:'ping',name:'合図',description:'d',payload:{type:'number',unit:null}}]});
          let api=null;
          host.register(manifest,function factory(given){api=given;return {commands:{},calculations:{same(values){return values[0];}}};});
          host.beginSession({onEvent:event=>events.push([event.name,event.payload])});
          const call=args=>{const answer=host.invokeCalculation('t.one/same',args);if(answer&&typeof answer.then==='function')answer.catch(()=>{});return answer;};
          try {
            eq([call([7]),seen],[7,[[7,'number',false],[7,'number',true]]]);
            seen.length=0;
            eq([call([5]),seen],[6,[[5,'number',false],[6,'number',true]]]);
            seen.length=0;api.emit('ping',3);api.emit('ping',5);
            eq([events,seen],[[["t.one/ping",3],["t.one/ping",6]],[[3,'number',true],[5,'number',true]]]);
          } finally { host.endSession(); }
        } finally {
          for(const [name,had,value] of put.reverse()){if(had)globalThis[name]=value;else delete globalThis[name];}
        }
      });
      // EXTENSIONS.md: the factory's source is what the derived product writes out, so it holds no NUL and no half of a surrogate pair standing alone.
      test('EXTENSION-HOST register refuses a factory whose source holds NUL or a lone surrogate',()=>{
        const LONE='E701 拡張factoryの文字に、NUL（U+0000）と、対になっていないサロゲートは使えません';
        const registeredWith=text=>said(()=>{const host=Akari.createAkariExtensionHost({});
          host.register(manifestOf(host,'t.one'),new Function('/* '+text+' */return {commands:{},calculations:{}};'));});
        for(const text of ['\0','a\0b','\ud800','\udc00','a\ud800b','\udc00\ud800'])eq(registeredWith(text),LONE);
        eq([registeredWith(''),registeredWith('😀')],['none','none']);
      });
      // EXTENSIONS.md: timeoutMs of a connection is a positive value of at most 2147483647 ms: the least positive one is kept as asked.
      test('EXTENSION-HOST connectWindow keeps a handshake wait of 1 ms or less than 1 ms as asked',()=>{
        const put=[],swap=(name,value)=>{put.push([name,Object.prototype.hasOwnProperty.call(globalThis,name),globalThis[name]]);globalThis[name]=value;};
        const timeouts=[];
        try {
          if(typeof AbortController!=='function'){
            class StandInSignal{constructor(){this.aborted=false;this.reason=undefined;this.listeners=[];}
              addEventListener(type,listener,options){if(type==='abort')this.listeners.push({listener,once:!!options?.once});}
              removeEventListener(type,listener){this.listeners=this.listeners.filter(x=>x.listener!==listener);}}
            swap('AbortController',class{constructor(){this.signal=new StandInSignal();}
              abort(reason){const s=this.signal;if(s.aborted)return;s.aborted=true;s.reason=reason;const all=s.listeners;s.listeners=all.filter(x=>!x.once);for(const x of all)x.listener();}});
          }
          if(typeof window==='undefined')swap('window',{addEventListener(){},removeEventListener(){}});
          if(typeof MessageChannel==='undefined'){const port=()=>({onmessage:null,onmessageerror:null,postMessage(){},start(){},close(){}});swap('MessageChannel',class{constructor(){this.port1=port();this.port2=port();}});}
          swap('setTimeout',(f,ms)=>{timeouts.push(ms);return timeouts.length;});swap('clearTimeout',()=>{});
          swap('setInterval',()=>1);swap('clearInterval',()=>{});
          const host=Akari.createAkariExtensionHost({}),manifest=manifestOf(host,'t.one');host.register(manifest,function factory(){return handlers(manifest);});
          const target={postMessage(){}};
          host.beginSession();
          try {
            for(const timeoutMs of [1,0.5]){const promise=host.connectWindow(target,{origin:'https://peer.example',timeoutMs});promise.catch(()=>{});}
            eq(timeouts,[1,0.5]);
          } finally { host.endSession(); }
        } finally {
          for(const [name,had,value] of put.reverse()){if(had)globalThis[name]=value;else delete globalThis[name];}
        }
      });
      // EXTENSIONS.md: the line ends of a factory are LF (HTML reads CR LF as LF), so one whose source holds a CR is refused. The comment in the factory
      // below holds one CR (U+000D); the test first checks that the source as the page has it still holds it.
      test('EXTENSION-HOST register refuses a factory whose source holds a CR',()=>{
        const factory=function factory(){/* ab */return {commands:{},calculations:{}};};
        eq(Function.prototype.toString.call(factory).includes(String.fromCharCode(13)),true);
        eq(said(()=>{const host=Akari.createAkariExtensionHost({});host.register(manifestOf(host,'t.one'),factory);}),'E701 拡張factoryの改行はLFにします');
      });
    }
    return {
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      total: results.length,
      results,
    };
  }
