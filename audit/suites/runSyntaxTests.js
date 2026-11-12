function runSyntaxTests() {
    const results = [];
    const test = (id, fn) => {
      try {
        fn();
        results.push({ id: 'LANG ' + id, pass: true, detail: 'PASS' });
      } catch (e) {
        results.push({
          id: 'LANG ' + id,
          pass: false,
          detail: (e.code || e.name) + ': ' + e.message,
        });
      }
    };
    const ok = (value, message = 'assertion failed') => {
      if (!value) throw Error(message);
    };
    const eq = (a, b) =>
      ok(stableJson(a) === stableJson(b), 'expected ' + stableJson(b) + '; got ' + stableJson(a));
    const copy = cloneDesignProject;
    const parsed = (source, context = {}) => {
      const result = parseSyntax(source, context);
      ok(result.ast, JSON.stringify(result.syntaxDiagnostics));
      eq(result.syntaxDiagnostics, []);
      return result.ast;
    };
    const make = (source) => {
      const p = makeRegressionProject();
      p.scripts = [{ targetId: 'stage', event: 'start', source }];
      return p;
    };
    test('syntax errors discard entire AST', () => {
      // そうでなければ and もし inside a 〜して、 chain of a line's body are not read (no block is made of them).
      const C = 'もし 条件（条件の答え（あてはまる））が成り立つなら、';
      for (const [source, line, code, ending] of [
        ['点数を0にする\n点数を', 2],
        ['もし 条件（条件の答え（あてはまる））が成り立つなら、\n※ only', 1],
        ['何もしない\n  何もしない', 2],
        ['何もしない\n\t何もしない', 2],
        [C + 'そうでなければ、10歩進んで、20歩進む。', 1, 'P201'],
        // (a そうでなければ with no もし to pair with)
        ['「a」と言う。\nそうでなければ、\n  「b」と言う。', 2, 'P204'],
        [C + '10歩進んで、そうでなければ、20歩進んで、30歩進む。', 1, 'P201'],
        [C + '10歩進む。\nそうでなければ、10歩進んで、' + C + '20歩進んで、30歩進む。', 2, 'P201'],
        // もし…になったとき (and ときは, になったなら, になるなら) is told the two readings, as もし…になったら is, with the
        // words written.
        ['もし点数が7になったら、10歩進む。', 1, 'P205', 'になったら'],
        ['もし点数が7になったとき、10歩進む。', 1, 'P205', 'になったとき'],
        ['もし点数が7になったときは、\n  10歩進む。', 1, 'P205', 'になったときは'],
        ['もし点数が7になったなら、10歩進む。', 1, 'P205', 'になったなら'],
        ['もし点数が7になるなら、\n  10歩進む。', 1, 'P205', 'になるなら'],
        ['もし点数が7になっているなら、10歩進む。', 1, 'P205', 'になっているなら'],
      ]) {
        const result = parseSyntax(source, { key: 'script:stage:start' });
        eq(result.ast, null);
        eq(result.syntaxDiagnostics.length, 1);
        eq(result.syntaxDiagnostics[0].line, line);
        eq(result.syntaxDiagnostics[0].where, 'script:stage:start');
        if (code) eq(result.syntaxDiagnostics[0].code, code);
        if (ending) ok(result.syntaxDiagnostics[0].message.startsWith('「' + ending + '」は ここでは 使えません。いまの ようすを しらべるなら「もし点数が7なら、」'), result.syntaxDiagnostics[0].message);
      }
      // A name of data written whole (ゲームオーバーになった) is read as that name, not as 〜になった.
      const named = make('');
      named.projectData.variables.push({ id: 'v-over', name: 'ゲームオーバーになった', initialValue: 0 });
      for (const source of ['もしゲームオーバーになったなら、10歩進む。', 'もしゲームオーバーになったとき、\n  10歩進む。']) {
        const result = parseSyntax(source, { key: 'script:stage:start', symbols: buildSymbols(named) });
        ok(result.syntaxDiagnostics[0]?.message.startsWith('「ゲームオーバーになった」の 中身を しらべる ときは'), JSON.stringify(result.syntaxDiagnostics));
      }
    });
    test('format size limit rejects expansion and preserves source', () => {
      const atLimit = '※' + 'a'.repeat(LIMITS.sourceEach - 1),
        comment = parsed(atLimit);
      eq(formatScript(comment), atLimit);
      eq(parseSyntax(atLimit + 'a').ast, null);
      const source = Array(16666).fill('何もしない').join('\n'),
        ast = parsed(source),
        before = stableJson(ast);
      let error;
      try {
        formatScript(ast);
      } catch (e) {
        error = e;
      }
      eq(error?.code, 'P208');
      eq(ast.source, source);
      eq(stableJson(ast), before);
    });
    // LANGUAGE.md 名前・変数・リスト: a name in a body that cannot be a name is a mistake of the reading (P205) at its
    // line, told in the name check's words; data with such a name is a broken work (F503).
    test('a name read from a body that cannot be a name is P205, and data with it is F503', () => {
      const bad = (name) => '名前「' + name + '」には 使えない 文字が あります。空白や 「」【】（）［］、※ を けして ください';
      for (const [source, name] of [['【あ（い】を1ふやす。', 'あ（い'], ['【あ（い】を3にする。', 'あ（い'], ['【あ い】を言う。', 'あ い'],
        ['答えを【よこのばしょ÷（点数＋1）】という変数に入れる。', 'よこのばしょ÷（点数＋1）'], ['2秒待つ。\n【あ（い】の1番目を言う。', 'あ（い']]) {
        const p = make(source), symbols = buildSymbols(p), line = source.split('\n').length;
        eq([source, parseSyntax(source, { symbols }).syntaxDiagnostics.map((d) => [d.code, d.message, d.line])], [source, [['P205', bad(name), line]]]);
        eq([source, compileProject(p).errors.map((e) => [e.code, e.message])], [source, [['P205', bad(name)]]]);
      }
      const p = make('');
      p.projectData.variables.push({ id: 'bad-name', name: 'あ（い', initialValue: 0 });
      let refused = null;
      try { validateProject(p); } catch (error) { refused = [error.code, error.message]; }
      eq(refused, ['F503', bad('あ（い')]);
    });
    // A value before に that holds no items (横, 犬) is not read as 〜に…が入っている: the sentence is told as not read,
    // with no guidance for a word it does not have; a list before に with no が入っている is still told to write it.
    test('only a list or a text before に is told to write が入っている', () => {
      const p = make('');
      p.projectData.lists.push({ id: 'contain-names', name: '名前一覧', initialValue: ['あ'] });
      const symbols = buildSymbols(p), told = (source) => parseSyntax(source, { symbols }).syntaxDiagnostics.map((d) => [d.code, d.message]);
      eq(told('横に10歩動く。'), [['P201', '「横に10歩動く」は 読めません。書き方を たしかめて ください。']]);
      eq(told('犬に「やあ」と言う。'), [['P201', '「犬に「やあ」と言う」は 読めません。書き方を たしかめて ください。']]);
      for (const source of ['（名前一覧に「あ」）を言う。', '（「あいう」に「あ」）を言う。', '（［1、2］に1）を言う。'])
        eq([source, told(source)], [source, [['P205', '「が入っている」が たりません。書き足して ください。れい：名前一覧に「あ」が入っている']]]);
      eq(told('もし名前一覧に「あ」が入っていれば、\n  「あ」と言う。'), []);
    });
    test('name syntax is independent of declaration and quoting', () => {
      for (const name of ['値'.repeat(33), '値\u0001'])
        for (const source of [
          name + 'の値を言う',
          '【' + name + '】の値を言う',
          '自分の' + name + 'の値を言う',
          '作品の' + name + 'の値を言う',
          name + 'を1にする',
          name + 'に1を足す',
          name + 'を空にする',
        ]) {
          const result = parseSyntax(source), project = make(source);
          let rejected = !result.ast;
          if (result.ast) {
            try {
              const diagnostics = analyzeAst(result.ast, project);
              rejected = diagnostics.some((d) => d.code === 'S301' || d.code === 'P210');
            } catch (error) {
              rejected = error.code === 'P210';
            }
          }
          ok(rejected, 'invalid name compiled: ' + source);
        }
      const reserved = parsed('【何もしない】の値を言う');
      ok(analyzeAst(reserved, make('')).some((d) => d.code === 'S301'));
      for (const name of ['値'.repeat(32), '未登録']) {
        const source = name + 'の値を言う',
          ast = parsed(source);
        ok(analyzeAst(ast, make(source)).some((d) => d.code === 'S301'));
        ok(astEquivalent(ast, parsed(formatScript(ast))));
      }
    });
    test('syntax preserves original text and normalized comment fields', () => {
      const source =
        '※\t先頭　 \r\n\r\nもし 条件（条件の答え（あてはまる））が成り立つなら、 ※開始  \r\n    何もしない ※本文　\t\r\nそうでなければ、 ※else \r\n   何もしない\r\n※末尾  ';
      const ast = parsed(source);
      eq(ast.source, source);
      eq(ast.body[0].text, '\t先頭　 ');
      eq(ast.body[0].inlineComment, '');
      eq(ast.body[1].inlineComment, '※開始  ');
      eq(ast.body[1].elseComment, '※else ');
      const formatted = formatScript(ast),
        again = parsed(formatted);
      ok(astEquivalent(ast, again));
      eq(formatScript(again), formatted);
      ok(formatted.includes('※末尾  '));
      // A line that ends with more than one 。 keeps its memo with its last sentence.
      for (const [line, comments] of [['10歩進む。。 ※ x', ['※ x', '']], ['10歩進む。20歩進む。。 ※ x', ['', '※ x', '']]])
        eq(parsed(line + '\n何もしない。').body.map(n => n.inlineComment), comments);
    });
    test('semantic errors retain complete source AST', () => {
      const cases = [
        ['【未知名】の値を言う', 'S301'],
        ['作品の【未登録】を1にする', 'S301'],
        ['自分の【HP】を1にする', 'S301'],
        ['10歩動く', 'S304'],
        ['押されたキーの値を言う', 'S311'],
        ['（乱数（1））の値を言う', 'S308'],
        ['（1、2、3）を渡して、【存在しない】という手順を行う', 'S301'],
        ['このくり返しを終える', 'S309'],
        ['1を答えとして返す', 'S307'],
        ['この中だけで使う変数【局所】を作り、最初は1にする', 'S313'],
      ];
      for (const [source, code] of cases) {
        const p = make(source),
          ast = parsed(source),
          before = stableJson(ast),
          diagnostics = analyzeAst(ast, p, { targetId: 'stage', event: 'start' }),
          compiled = compileProject(p);
        ok(
          diagnostics.some((d) => d.code === code),
          source,
        );
        eq(diagnostics, compiled.errors);
        ok(compiled.astByKey.has('script:stage:start'));
        eq(stableJson(ast), before);
        ok(astEquivalent(ast, parsed(formatScript(ast))));
      }
    });
    test('foreach collisions are shared semantic diagnostics', () => {
      const each = '名前一覧の中身を先頭から一つずつ見て、次のことを行う。\n  この中では、今見ているものを【項目】と呼ぶ。\n  項目の値を言う。';
      for (const [prefix, args] of [
        ['', ['項目']],
        ['この中だけで使う変数【項目】を作り、最初は0にする。\n', []],
        ['この中だけで使うリスト【項目】を空で作る。\n', []],
      ]) {
        const source = prefix + each,
          p = make(''),
          definition = {ownerId:'stage',  id: 'action-collision', name: '調べる', args, source };
        p.actions = [definition];
        const context = { definition, definitionKind: 'action', args },
          ast = parsed(source, context),
          diags = analyzeAst(ast, p, context),
          compiled = compileProject(p);
        ok(diags.some((d) => d.code === 'S312'));
        eq(diags, compiled.errors);
        ok(compiled.astByKey.has('action:action-collision'));
        ok(astEquivalent(ast, parsed(formatScript(ast), context)));
      }
      const source =
          '名前一覧の中身を先頭から一つずつ見て、次のことを行う。\n  この中では、今見ているものを【項目】と呼ぶ。\n  ' + each.replaceAll('\n', '\n  '),
        p = make(source),
        ast = parsed(source);
      ok(analyzeAst(ast, p).some((d) => d.code === 'S312' && d.line === 3));
      ok(compileProject(p).astByKey.has('script:stage:start'));
      const sibling = each + '\n' + each;
      eq(analyzeAst(parsed(sibling), make(sibling)), []);
    });
    test('AST analysis uses edited declarations instead of hidden source', () => {
      const definition = {ownerId:'stage',  id: 'function-local', name: '計算', args: [], source: '0を答えとして返す' },
        p = make('（【計算】で求めた答え）を言う');
      p.functions = [definition];
      const ast = parsed('この中だけで使う変数【合計】を作り、最初は1にする\n合計を答えとして返す', {
        definition,
        definitionKind: 'function',
      });
      ast.source = '古い本文を意味に使わない';
      const before = stableJson(p);
      eq(analyzeAst(ast, p, { definition, definitionKind: 'function' }), []);
      eq(stableJson(p), before);
      ast.body[0].name = '別名';
      ok(
        analyzeAst(ast, p, { definition, definitionKind: 'function' }).some(
          (d) => d.code === 'S301',
        ),
      );
    });
    test('AST analysis checks caller context and purity without execution', () => {
      const p = make('【動く】という手順を行う');
      p.actions = [{ownerId:'stage',  id: 'action-move', name: '動く', args: [], source: '10歩動く' }];
      const ast = parsed(p.scripts[0].source),
        before = stableJson(p);
      ok(
        analyzeAst(ast, p, { targetId: 'stage' }).some(
          (d) => d.code === 'S304' && d.where === 'action:action-move',
        ),
      );
      eq(analyzeAst(ast, p, { targetId: 'sprite-1' }), []);
      eq(stableJson(p), before);
      const definition = {ownerId:'stage',  id: 'function-draft', name: '計算', args: ['量'], source: '' },
        bad = parsed('点数に量を足す\n乱数（1、2）を答えとして返す');
      ok(
        analyzeAst(bad, p, { definition, definitionKind: 'function' }).some(
          (d) => d.code === 'S305',
        ),
      );
      eq(p.functions, []);
      for (const source of ['何もしない', '1を答えとして返す\n2を答えとして返す']) {
        const called = make('（【計算】で求めた答え）を言う');
        called.functions = [{ownerId:'stage',  id: 'function-incomplete', name: '計算', args: [], source }];
        const diagnostics = analyzeAst(parsed(called.scripts[0].source), called);
        ok(diagnostics.some((d) => d.code === 'S306'));
        eq(diagnostics, compileProject(called).errors);
      }
      const called = make('');
      called.functions = [
        {ownerId:'stage',  id: 'function-invalid', name: '計算', args: [], source: '未定義の値を言う' },
      ];
      const action = {ownerId:'stage',  id: 'action-draft', name: '動作', args: [], source: '（【計算】で求めた答え）を言う' };
      eq(
        analyzeAst(parsed(action.source), called, { definition: action, definitionKind: 'action' }),
        compileProject({ ...called, actions: [action] }).errors,
      );
    });
    test('equivalence checks every annotation and else field', () => {
      const ast = parsed(
        '※ before \nもし 条件（条件の答え（あてはまる））が成り立つなら、 ※ head \n  何もしない ※ inside \nそうでなければ、 ※ branch \n  何もしない\n※ after ',
      );
      for (const mutate of [
        (a) => (a.body[0].text += ' '),
        (a) => (a.body[1].inlineComment += ' '),
        (a) => (a.body[1].thenBody[0].inlineComment += ' '),
        (a) => (a.body[1].elseComment += ' '),
        (a) => (a.body[1].hasElse = false),
        (a) => (a.body[1].condition.value = false),
      ]) {
        const changed = copy(ast);
        mutate(changed);
        ok(!astEquivalent(ast, changed));
      }
      const moved = copy(ast);
      moved.body.push(moved.body.shift());
      ok(!astEquivalent(ast, moved));
      const metadata = copy(ast);
      metadata.source = 'different presentation';
      metadata.sourceSpan.startLine = 99;
      metadata.body[0].raw = 'different indentation';
      metadata.body[1].endLine = 99;
      ok(astEquivalent(ast, metadata));
    });
    test('equivalence permits only comment closing-boundary reassociation', () => {
      // (a comment written in the block at its closing boundary; one written to its left stays outside, below)
      const ast = parsed('2回くり返す\n  何もしない\n  ※ closing \n点数の値を言う'),
        other = copy(ast),
        comment = other.body[0].body.pop();
      eq(comment.kind, 'CommentLine');
      other.body.splice(1, 0, comment);
      ok(astEquivalent(ast, other));
      other.body.splice(1, 1);
      other.body.push(comment);
      ok(!astEquivalent(ast, other));
      const left = parsed('※ one\n※ two\n何もしない'),
        right = copy(left);
      [right.body[0], right.body[1]] = [right.body[1], right.body[0]];
      ok(!astEquivalent(left, right));
      for (const source of [
        '2回くり返す\n  ※ one\n  何もしない',
        'もし 条件（条件の答え（あてはまる））が成り立つなら、\n  ※ one\n  何もしない',
      ]) {
        const node = parsed(source).body[0],
          changed = copy(node);
        (changed.body || changed.thenBody)[0].text = ' two';
        ok(!astEquivalent(node, changed), 'standalone container comment ignored');
      }
    });
    test('equivalence preserves names scopes and parser negative-number shape', () => {
      ok(astEquivalent(parsed('【点数】の値を言う'), parsed('点数の値を言う')));
      ok(!astEquivalent(parsed('自分の【HP】の値を言う'), parsed('作品の【HP】の値を言う')));
      const unsafe = parsed('【端】の値を言う'),
        invalid = copy(unsafe);
      invalid.body[0].value.qualifier = null;
      ok(!astEquivalent(unsafe, invalid));
      const negative = parsed('（－2＾2）の値を言う'),
        literal = copy(negative);
      literal.body[0].value = { kind: 'NumberLiteral', value: -4 };
      ok(!astEquivalent(negative, literal));
    });
    for (const entry of COMMAND_CATALOG)
      test('statement roundtrip ' + entry.id, () => {
        const source =
            '※前　 \n' +
            entry.source
              .split('\n')
              .map((line) => line + ' ※注釈　 ')
              .join('\n') +
            '\n※後\t ',
          ast = parsed(source),
          formatted = formatScript(ast);
        ok(astEquivalent(ast, parsed(formatted)), entry.id);
        eq(formatScript(parsed(formatted)), formatted);
      });
    test('generated expression and comment roundtrips', () => {
      const rng = new PRNG(901),
        pick = (items) => items[rng.nextUint32() % items.length];
      const leaf = () =>
        pick([
          { kind: 'NumberLiteral', value: pick([0, 1, 2, 0.25, 1e-7, 1e21]) },
          { kind: 'StringLiteral', value: ' ※ Ａ 😀　 ' },
          { kind: 'BooleanLiteral', value: !!(rng.nextUint32() % 2) },
          {
            kind: 'VariableRead',
            name: '未登録',
            qualifier: pick([null, 'exact', 'self', 'project']),
          },
        ]);
      const expr = (depth) => {
        if (!depth) return leaf();
        const child = () => expr(depth - 1);
        switch (rng.nextUint32() % 9) {
          case 0:
            return { kind: 'UnaryExpression', op: pick(['POS', 'NEG', 'NOT']), value: child() };
          case 1:
            return {
              kind: 'BinaryExpression',
              op: pick(['ADD', 'SUB', 'MUL', 'DIV', 'POW']),
              left: child(),
              right: child(),
            };
          case 2:
            return {
              kind: 'CompareExpression',
              op: pick(['GTE', 'LTE', 'GT', 'LT', 'EQ', 'NEQ']),
              left: child(),
              right: child(),
            };
          case 3:
            return {
              kind: 'LogicalExpression',
              op: pick(['AND', 'OR']),
              left: child(),
              right: child(),
            };
          case 4:
            return { kind: 'ListRead', list: child(), index: child() };
          case 5:
            return {
              kind: 'SensorRead',
              sensor: pick([
                'INPUT_VALUE',
                'DISTANCE_TO',
                'KEY_DOWN',
                'TOUCHING',
                'TOUCHING_COLOR',
              ]),
              arg: child(),
            };
          case 6: {
            const name = pick([
              'CONTAINS',
              'INDEX_OF',
              'LENGTH',
              'STRING_LENGTH',
              'STRING_CHAR',
              '乱数',
              'つなぐ',
            ]);
            return {
              kind: 'BuiltinCall',
              name,
              args: Array.from(
                { length: ['LENGTH', 'STRING_LENGTH'].includes(name) ? 1 : 2 },
                child,
              ),
            };
          }
          case 7:
            return { kind: 'UserFunctionCall', name: '計算', args: [child(), child()] };
          default:
            return { kind: 'ListLiteral', items: [child(), child()] };
        }
      };
      for (let i = 0; i < 180; i++) {
        const expression = expr(3),
          ast = parsed(
            '※先頭  \nもし 条件（条件の答え（あてはまる））が成り立つなら、 ※開始\t\n  2回くり返す\n    0の値を言う ※出力　 \n  ※閉じる \nそうでなければ、 ※else \n  何もしない\n※最後　 ',
          );
        ast.body[1].thenBody[0].body[0].value = expression;
        const text = formatScript(ast),
          again = parsed(text);
        ok(astEquivalent(ast, again), 'generated case ' + i + ': ' + text);
        eq(formatScript(again), text);
      }
    });
    // LANGUAGE.md「待つ」: だけ on another sentence is は; a wait written with だけ is stopped and its fix covers the
    // sentence; two subjects on a timed wait are offered one wait without a subject (two waits would wait twice as long);
    // two subjects on any other sentence are split; the same part written twice is not two subjects.
    test('wait subjects are read as the wait of the body', () => {
      const p = makeDefaultProject(), base = p.components.find((c) => c.type === 'sprite');
      p.components = ['ねこ', '犬'].map((name, i) => ({ ...structuredClone(base), id: 'wait-subject-' + i, name,
        costumes: [{ id: 'wait-subject-face-' + i, name: '丸', kind: 'text', value: '●' }], costumeId: 'wait-subject-face-' + i }));
      const ctx = { symbols: buildSymbols(p), targetId: 'wait-subject-0', event: 'start' },
        first = (source) => parseSyntax(source, ctx).syntaxDiagnostics[0];
      for (const written of ['ねこだけ前へ10歩進む。', 'ねこだけは前へ10歩進む。']) eq(formatScript(parsed(written, ctx)).trim(), 'ねこは前へ10歩進む。');
      const only = first('ねこだけ1秒待つ。');
      eq([only.code, only.message.split('。')[0], only.proposals.map((x) => [x.source, x.start, x.end])],
        ['P205', '「ねこだけ」と 書いた「待つ」は 読めません', [['ねこは1秒待つ', 0, 8]]]);
      const two = first('ねこも犬も1秒待つ。');
      eq([two.message, two.proposals.map((x) => [x.label, x.source])],
        ['1つの 文に 書ける 主語は 1つです。待つ 文は、主語を 書かなくても、この 本文が 待ちます', [['この 本文で 待つ', '1秒待つ']]]);
      eq(first('ねこと犬は前へ10歩進む。').proposals.map((x) => x.source), ['ねこは前へ10歩進む。\n犬は前へ10歩進む']);
      ok(first('ねこも犬も、画面のはしにふれるまで待つ。').message.includes('書いた じゅんに'));
      ok(!String(first('ねこもねこも1秒待つ。')?.message).includes('待つ 文は、主語を 書かなくても'));
      // The same part written twice is no two subjects to split.
      ok(!String(first('ねこもねこも前へ10歩進む。')?.message).includes('主語ごとに'));
      // In a body that is not 名人, waiting for a speech is not read, whatever name is written before it.
      ok(first('だんごが言い終わるまで待つ。').message.startsWith('どう なるまで なのかが 読めません'));
      // The two subjects do the sentence up to a clause that names its own subject; that clause is written once.
      for (const joint of ['待って', '待ってから'])
        eq(first('ねこと犬は1秒' + joint + '、ねこは10歩進む。').proposals.map((x) => x.source), ['1秒待つ。\nねこは前へ10歩進む']);
      eq(first('ねこと犬は前へ10歩進んで、ねこは「やあ」と言う。').proposals.map((x) => x.source), ['ねこは前へ10歩進む。\n犬は前へ10歩進む。\nねこは「やあ」と言う']);
      ok(first('ねこと犬は、画面のはしにふれるまで待ってから、ねこは「やあ」と言う。').message.includes('書いた じゅんに'));
      // A timed wait first is written once, and what the two subjects do after it is split.
      eq(first('ねこと犬は1秒待ってから、10歩進む。').proposals.map((x) => x.source), ['1秒待つ。\nねこは前へ10歩進む。\n犬は前へ10歩進む']);
      // What comes after the wait takes no time here, so the subjects do not move one after the other.
      ok(!first('ねこと犬は1秒待ってから、10歩進む。').message.includes('書いた じゅんに'));
      ok(first('ねこと犬は10歩進んで、1秒待つ。').message.includes('書いた じゅんに'));
      // 名人: parts written together that wait and then go on to a clause with its own subject wait together and do that
      // clause once after them (runCoreTests); also with も, and with more clauses before it. A part in a condition is no subject.
      const meijin = (source) => { const q = structuredClone(p); q.scripts = [{ id: 'wait-subject-meijin', targetId: 'meijin', mode: 'meijin', event: 'start', source }]; return compileProject(q).errors; };
      for (const source of ['ねこと犬は1秒待って、ねこは10歩進む。', 'ねこと犬は1秒待ってから、ねこは10歩進む。', 'ねこと犬は1秒待ってからねこは10歩進む。', 'ねこと犬は1秒待つ。ねこは10歩進む。',
        'ねこも犬も1秒待って、ねこは10歩進む。', 'ねこと犬は1秒待って、10歩進んで、ねこは10歩進む。', 'ねこと犬は1秒待って、ねこが画面のはしにふれるまで待つ。'])
        eq(meijin(source), []);
      // A timed wait then timed actions: what comes after the wait is split, runs one subject after the other, and says so.
      ok(first('ねこと犬は1秒待ってから、2秒かけて、いまのばしょから、右へ40歩動く。').message.includes('書いた じゅんに'));
      eq(first('ねこと犬は1秒半待つ。').proposals.map((x) => x.source), ['1.5秒待つ']);
      eq(meijin('ねこと犬は1秒待ってから、10歩進む。'), []);
      // What the subjects split into sentences do one after the other is said with its own word, in the guidance and on the
      // button (LANGUAGE.md 読めない書き方): moving over a time (2秒かけて, 2秒で…), talking, a sound to its end, a wait;
      // the first one written.
      const split = '1つの 文に 書ける 主語は 1つです。主語ごとに 文を 分けて 書きます', once = '1つの 文に 書ける 主語は 1つです。待つ 文は、主語を 書かなくても、この 本文が 待ちます',
        inTurn = (polite, together) => '。分けると、書いた じゅんに 一人ずつ ' + polite + '。いっしょに ' + together + ' ときは、名人の本文か、同じ きっかけの 別の 本文で 書きます';
      for (const [source, message, labels] of [
        ['ねこと犬は2秒かけて、いまのばしょから、右へ40歩動く。', split + inTurn('動きます', '動かす'), ['文を 分ける（じゅんに 動く）']],
        ['ねこと犬は2秒で右へ40歩移動する。', split + inTurn('動きます', '動かす'), []],
        ['ねこと犬は2秒半ほどで右へ40歩移動する。', split + inTurn('動きます', '動かす'), []],
        ['ねこと犬は2秒間くらいで右へ40歩移動する。', split + inTurn('動きます', '動かす'), []],
        ['ねこと犬は2秒ぐらいで右へ40歩移動する。', split + inTurn('動きます', '動かす'), []],
        ['ねこと犬は「やあ」と2秒話す。', split + inTurn('話します', '話す'), ['文を 分ける（じゅんに 話す）']],
        ['ねこと犬は「やあ」と2秒言う。', split + inTurn('話します', '話す'), ['文を 分ける（じゅんに 話す）']],
        ['ねこと犬は「やあ」と2秒しゃべる。', split + inTurn('話します', '話す'), null],
        ['ねこと犬は「ベル」を最後まで鳴らす。', split + inTurn('鳴らします', '鳴らす'), []],
        ['ねこと犬は「ベル」を2秒鳴らして、10歩進む。', split + inTurn('鳴らします', '鳴らす'), []],
        ['ねこも犬も、画面のはしにふれるまで待つ。', split + inTurn('待ちます', '待つ'), null],
        ['ねこと犬は10歩進んで、1秒待つ。', split + inTurn('待ちます', '待つ'), null],
        ['ねこと犬は「やあ」と2秒話して、2秒かけて、いまのばしょから、右へ40歩動く。', split + inTurn('話します', '話す'), null],
        ['ねこと犬は2秒かけて、いまのばしょから、右へ40歩動いて、「やあ」と2秒言って、10歩進む。', split + inTurn('動きます', '動かす'), null],
        ['ねこと犬は前へ10歩進む。', split, ['文を 分ける']],
        ['ねこと犬は1秒待ってから、2秒かけて、いまのばしょから、右へ40歩動く。', once + inTurn('動きます', '動かす'), ['この 本文で 待つ（じゅんに 動く）']],
        ['ねこと犬は1秒待ってから、「やあ」と2秒話す。', once + inTurn('話します', '話す'), ['この 本文で 待つ（じゅんに 話す）']],
        ['ねこと犬は1秒待ってから、10歩進む。', once, ['この 本文で 待つ']],
        ['ねこも犬も1秒待つ。', once, ['この 本文で 待つ']],
        // The end of a word said to someone (ね, よ, ぞ) is no other way of waiting.
        ['ねこと犬は2秒まつね。', once, []],
      ]) { const d = first(source); eq([source, d.message], [source, message]); if (labels) eq([source, (d.proposals || []).map((x) => x.label)], [source, labels]); }
      eq(first('ねこと犬は1秒まってね、10歩進む。').proposals.map((x) => x.source), ['1秒待つ。\nねこは前へ10歩進む。\n犬は前へ10歩進む']);
    });
    // 「AのB＋CのN番目」: after an operator, a value of its own with の takes the 番目 (名前一覧's, not マスコット's or 3's) when
    // the value before the first の is surely no list: a part, a text, a number, a calculation, or (名人) a variable that
    // holds a part. When it may be a list (a list of the work or of the text, an argument, ［…］, リスト「…」, a quoted list
    // name, any name when there is no work to look in), its number takes everything up to the 番目 as before, as the number
    // of a 文字目 always does. Each is written back (コードを整える) in a form that reads the same.
    test('a list sentence writes a place of a part\'s or the work\'s name, or of AからBのどれか, in （ ） and reads it back', () => {
      // リストの…番目 reads a number or a name; リストの自分の【HP】番目 and リストの1番目から3番目のどれか are no place.
      const symbols = buildSymbols(makeRegressionProject()), ctx = { symbols, targetId: 'sprite-1', targetType: 'sprite' }, value = text => parsed('点数を' + text + 'にする。', ctx).body[0].value;
      const written = {};
      for (const place of ['1', '点数', '【点数】', '作品の点数', '自分のHP', '1から3のどれか', '点数＋1', '名前一覧の数', '答え'])
        for (const base of ['名前一覧の1番目を消す。', '名前一覧の1番目を5にかえる。', '名前一覧の1番目に5を入れる。']) {
          const ast = parsed(base, ctx);ast.body[0].index = value(place);
          const text = formatScript(ast, { symbols }).trim();ok(astEquivalent(ast, parsed(text, ctx)), text);written[place + base] = text;
        }
      eq([written['1から3のどれか名前一覧の1番目を消す。'], written['自分のHP名前一覧の1番目を5にかえる。'], written['作品の点数名前一覧の1番目に5を入れる。'], written['点数名前一覧の1番目を消す。']],
        ['名前一覧の（1から3のどれか）番目を消す。', '名前一覧の（自分のHP）番目を5にかえる。', '名前一覧の（作品の点数）番目に5を入れる。', '名前一覧の【点数】番目を消す。']);
    });
    test('a signal named by a value other than a text in 「 」 or a variable of the work is written in （ ） and reads back', () => {
      // …の合図 reads a text in 「 」 or a name the work has; 答えの合図 and 1から3のどれかの合図 are read another way.
      const symbols = buildSymbols(makeRegressionProject()), ctx = { symbols, targetId: 'sprite-1', targetType: 'sprite' }, value = text => parsed('点数を' + text + 'にする。', ctx).body[0].value;
      const written = {};
      for (const name of ['「開始」', '点数', '【点数】', '1', '作品の点数', '自分のHP', '1から3のどれか', '名前一覧の数', '名前一覧の1番目', '答え', 'タイマー', '点数＋1', 'マスコットのHP', '（点数が1より大きい）', '5歩'])
        for (const base of ['「a」の合図を送る。', '「a」の合図を送って、その合図で始まったことが全部終わるまで待つ。']) {
          const ast = parsed(base, ctx);ast.body[0].message = value(name);
          const text = formatScript(ast, { symbols }).trim();ok(astEquivalent(ast, parsed(text, ctx)), text);written[name + base] = text;
        }
      eq(['「開始」', '点数', '答え', '1から3のどれか', 'マスコットのHP', '点数＋1', '名前一覧の数'].map(name => written[name + '「a」の合図を送る。']),
        ['「開始」の合図を送る。', '点数の合図を送る。', '（答え）の合図を送る。', '（1から3のどれか）の合図を送る。', '（「マスコット」のHP）の合図を送る。', '（点数＋1）の合図を送る。', '（名前一覧の数）の合図を送る。']);
    });
    test('a part\'s touch and copy checks are written as the common text and 名人 both read them back', () => {
      // もし「マスコット」の自分がコピーなら (not 名人's マスコットがコピーなら), and a part's value that is not keeps its
      // 「マスコット」の (not マスコットが「星」にふれていない): each is read back the same in the common text and in 名人.
      const symbols = buildSymbols(makeRegressionProject()), common = { symbols, targetId: 'sprite-1', targetType: 'sprite' }, meijin = { symbols, meijin: true, targetId: 'stage', targetType: 'stage' };
      const S = value => ({ kind: 'StringLiteral', value }), part = value => ({ kind: 'ActorQualifiedRead', actorRef: { kind: 'named', name: 'マスコット' }, value }), not = value => ({ kind: 'UnaryExpression', op: 'NOT', value });
      const touch = { kind: 'SensorRead', sensor: 'TOUCHING', arg: S('画面のはし') }, color = { kind: 'SensorRead', sensor: 'TOUCHING_COLOR', arg: S('#ff0000') }, copy = { kind: 'SensorRead', sensor: 'クローンである' };
      const written = {};
      for (const [label, condition] of Object.entries({ touch: part(touch), notTouch: not(part(touch)), color: part(color), notColor: not(part(color)), copy: part(copy), notCopy: not(part(copy)), copyNot: part(not(copy)) }))
        for (const base of ['もし 1が1 なら、\n  「a」と言う。', '点数を1にする。', '点数が1になるまで待つ。', '点数が1と同じあいだ、くり返す。\n  「a」と言う。']) {
          const ast = parsed(base, common), first = ast.body[0];
          if (first.kind === 'Assignment') first.value = condition; else first.condition = condition;
          const text = formatScript(ast, { symbols });written[label + base] = text.split('\n')[0];
          for (const ctx of [common, meijin]) ok(astEquivalent(ast, parsed(text, ctx)), text + (ctx.meijin ? ' (名人)' : ''));
        }
      eq(['copyもし 1が1 なら、\n  「a」と言う。', 'notCopyもし 1が1 なら、\n  「a」と言う。', 'notTouch点数を1にする。', 'notCopy点数を1にする。'].map(key => written[key]),
        ['もし「マスコット」の自分がコピーなら、', 'もし「マスコット」の自分がコピーでなければ、', '点数を（条件（「マスコット」の（「画面のはし」にふれている））が成り立たない）にする。', '点数を（条件（「マスコット」の自分がコピーである）が成り立たない）にする。']);
    });
    test('the bounce sentence with a subject written with が is the same bounce as with は', () => {
      // 主語の「は」と「が」は同じ意味 (LANGUAGE.md): マスコットが画面のはしにふれていれば、はね返る is マスコット's bounce, kept with
      // が, not a もし whose body bounces the owner; a sentence near it names the same subject in its proposal.
      const symbols = buildSymbols(makeRegressionProject()), ctx = { symbols, targetId: 'stage', targetType: 'stage' }, meijin = { ...ctx, meijin: true };
      for (const [source, context] of [['マスコットが画面のはしにふれていれば、はね返る。', ctx], ['マスコットがはね返る。', ctx], ['マスコットが画面のはしにふれていれば、はね返る。', meijin]]) {
        const ast = parsed(source, context), first = ast.body[0];
        eq([first.kind, first.op, first.actorRef], ['MotionCommand', 'BOUNCE', { kind: 'named', name: 'マスコット', particle: 'が' }]);
        eq(formatScript(ast, { symbols }).trim(), 'マスコットが画面のはしにふれていれば、はね返る。');
      }
      for (const source of ['マスコットが画面のはしではね返る。', 'マスコットがはしにふれていれば、はね返る。', 'マスコットが画面のはしにふれたら、はね返る。']) {
        const d = parseSyntax(source, ctx).syntaxDiagnostics[0];
        eq(d?.proposals?.map(x => x.source), ['マスコットが画面のはしにふれていれば、はね返る']);
      }
    });
    test('a sentence that puts a value into another part\'s variable is not read as one into an input', () => {
      // 答えを「マスコット」のHPに入れる puts into マスコット's variable, which another part does not change (as
      // 「マスコット」のHPを5にする is not read); it was read as 〜に…を入れる into an input, and stopped with R411 when run.
      const symbols = buildSymbols(makeRegressionProject()), ctx = { symbols, targetId: 'stage', targetType: 'stage' }, own = { symbols, targetId: 'sprite-1', targetType: 'sprite' };
      const refusal = source => { const r = parseSyntax(source, ctx); return r.ast ? null : r.syntaxDiagnostics[0].code + ' ' + r.syntaxDiagnostics[0].message; };
      const assignment = refusal('「マスコット」のHPを5にする。');
      ok(assignment && assignment.startsWith('P205 '), String(assignment));
      for (const source of ['答えを「マスコット」のHPに入れる。', '「マスコット」のHPに答えを入れる。']) eq(refusal(source), assignment);
      ok(refusal('答えをマスコットのHPに入れる。'), 'the name written without 「 」 is not read either');
      eq(parsed('答えを自分のHPに入れる。', own).body[0].kind, 'Assignment');eq(parsed('答えを作品の点数に入れる。', own).body[0].kind, 'Assignment');
      eq([parsed('「入力1」に「a」を入れる。', ctx).body[0].op, parsed('「a」を「入力1」に入れる。', ctx).body[0].op], ['SET_INPUT', 'SET_INPUT']);
    });
    test('a made block\'s body read with an argument named 色 is written with 表示色, which reads back the same', () => {
      // 色を「赤」にする in a block that receives 色 puts 「赤」 into the argument: the body read with its arguments keeps 表示色
      // (コードを整える wrote 色を… and then kept the body unformatted, as it would read otherwise).
      const symbols = buildSymbols(makeRegressionProject()), definition = { id: 'paint', ownerId: 'stage', name: 'ぬる', args: ['色'], source: '' };
      const ctx = { symbols, definitionKind: 'action', definition, args: ['色'] }, plain = { symbols, targetId: 'sprite-1', targetType: 'sprite' };
      for (const source of ['表示色を「赤」にする。', '表示色を色にする。', '色を「赤」にする。']) {
        const ast = parsed(source, ctx), text = formatScript(ast).trim();
        eq(text, source);ok(astEquivalent(ast, parsed(text, ctx)), text);
      }
      eq(formatScript(parsed('表示色を「赤」にする。', plain)).trim(), '色を「赤」にする。');
    });
    test('a condition that is not, waited or repeated until, is written 成り立たなくなるまで and 成り立たないまで reads the same', () => {
      const symbols = buildSymbols(makeRegressionProject()), ctx = { symbols, targetId: 'sprite-1', targetType: 'sprite' };
      for (const [base, written] of [['点数が1になるまで待つ。', '条件（点数が1より大きいかつ点数が5より小さい）が成り立たなくなるまで待つ。'],
        ['点数が1になるまで、くり返す。\n  何もしない。', '条件（点数が1より大きいかつ点数が5より小さい）が成り立たなくなるまで、くり返す。']]) {
        const ast = parsed(base, ctx), score = { kind: 'VariableRead', name: '点数', qualifier: null }, n = value => ({ kind: 'NumberLiteral', value });
        ast.body[0].condition = { kind: 'UnaryExpression', op: 'NOT', value: { kind: 'LogicalExpression', op: 'AND', left: { kind: 'CompareExpression', op: 'GT', left: score, right: n(1) }, right: { kind: 'CompareExpression', op: 'LT', left: score, right: n(5) } } };
        const text = formatScript(ast, { symbols });eq(text.split('\n')[0], written);ok(astEquivalent(ast, parsed(text, ctx)), text);
        ok(astEquivalent(ast, parsed(text.replace('成り立たなくなるまで', '成り立たないまで'), ctx)), 'the old form reads the same');
      }
      // (one condition that is not, as a block's 〜ではない makes it, is written the same way)
      const one = parsed('点数が1になるまで待つ。', ctx);one.body[0].condition = { kind: 'UnaryExpression', op: 'NOT', value: { kind: 'CompareExpression', op: 'GTE', left: { kind: 'VariableRead', name: '点数', qualifier: null }, right: { kind: 'NumberLiteral', value: 2 } } };
      const oneText = formatScript(one, { symbols });eq(oneText, '条件（点数が2以上）が成り立たなくなるまで待つ。');ok(astEquivalent(one, parsed(oneText, ctx)), oneText);
    });
    test('a 番目 on the other side of が, かつ or a comparison is not read by the value before it', () => {
      // 「だんご」の大きさ, 点数÷2のあまり: the 番目 after が belongs to 名前一覧, not to the value before が.
      const p = makeRegressionProject();p.projectData.lists.push({ id: 'far-names', name: '名前一覧', initialValue: ['a'] });
      const ctx = { symbols: buildSymbols(p), targetId: 'sprite-1', targetType: 'sprite' };
      for (const source of ['もし「マスコット」の大きさが名前一覧の1番目より大きいなら、\n  何もしない。', 'もし点数÷2のあまりが名前一覧の1番目と同じなら、\n  何もしない。',
        'もし条件（「マスコット」の大きさが10より大きいかつ名前一覧の1番目が「a」と同じ）が成り立つなら、\n  何もしない。']) {
        const first = parseSyntax(source, ctx);eq(first.syntaxDiagnostics.map(d => d.code), [], source);
        const condition = JSON.stringify(first.ast.body[0].condition);ok(condition.includes('"ListRead"') && condition.includes('"name":"名前一覧"'), condition.slice(0, 200));
        const written = formatScript(first.ast, { symbols: ctx.symbols });eq(parseSyntax(written, ctx).syntaxDiagnostics.map(d => d.code), [], written);
      }
    });
    test('the memo of a heading line and of a よぶ line is kept by formatting and by the blocks', () => {
      // (「コードを整える」 and a trip to the blocks and back keep them, as a sentence's own memo is kept)
      const p = makeRegressionProject();p.projectData.lists.push({ id: 'memo-names', name: '名前一覧', initialValue: ['a'] });
      const ctx = { symbols: buildSymbols(p), targetId: 'sprite-1', targetType: 'sprite' };
      for (const source of ['作品を動かしたとき、  ※見出しのメモ\n  前へ10歩進む。', '名前一覧の中身を先頭から一つずつ見て、次のことを行う。\n  この中では、今見ているものを【名前】とよぶ。  ※よぶのメモ\n  【名前】を言う。']) {
        const ast = parseSyntax(source, ctx).ast;eq(formatScript(ast, { symbols: ctx.symbols }), source);
        eq(formatScript(blockDecode(blockEncode(ast).tree), { symbols: ctx.symbols }), source);
      }
    });
    test('a comment line after an inner block, written to its left, stays in the outer block', () => {
      // (注釈の所属は保存されます: 「コードを整える」 does not move it into the くり返し)
      const ctx = { symbols: buildSymbols(makeRegressionProject()), targetId: 'sprite-1', targetType: 'sprite' };
      for (const [source, kinds] of [['3回くり返す。\n  前へ10歩進む。\n※ メモ\n右に15度回る。', ['RepeatCount', 'CommentLine', 'MotionCommand']],
        ['3回くり返す。\n  2回くり返す。\n    前へ10歩進む。\n  ※ 中のメモ\n  右に15度回る。', ['RepeatCount']]]) {
        const ast = parseSyntax(source, ctx).ast;eq(ast.body.map(n => n.kind), kinds);eq(formatScript(ast, { symbols: ctx.symbols }), source);
      }
    });
    test('each sentence joined by 〜て、 has the place of its own clause', () => {
      // 「いま 動いている 文」 shows the clause that runs: 前へ10歩進んで is columns 1–8, 右に15度回って 10–17, 1秒待つ 19–22.
      const ast = parseSyntax('前へ10歩進んで、右に15度回って、1秒待つ。', { symbols: buildSymbols(makeRegressionProject()), targetId: 'sprite-1', targetType: 'sprite' }).ast;
      eq(ast.body.map(n => [n.sourceSpan.startColumn, n.sourceSpan.endColumn]), [[1, 9], [10, 18], [19, 23]]);
    });
    test('a range of a unit whose second end is a name of the part or of the work is written so that it reads', () => {
      // 1秒から自分の【体力】秒のどれか does not read: the second end is written in （ ）, as it is read.
      const p = makeDefaultProject();p.components[0].localData.variables = [{ id: 'range-hp', name: '体力', initialValue: 3 }];p.projectData.variables = [{ id: 'range-score', name: '点数', initialValue: 1 }];
      const ctx = { symbols: buildSymbols(p), targetId: p.components[0].id, targetType: 'sprite' };
      for (const source of ['1秒から（自分の【体力】）秒のどれか待つ。', '1秒から（作品の【点数】）秒のどれか待つ。']) {
        const first = parseSyntax(source, ctx);eq(first.syntaxDiagnostics, []);
        const written = formatScript(first.ast, { symbols: ctx.symbols }), again = parseSyntax(written, ctx);
        eq(again.syntaxDiagnostics.map(d => d.code), [], written);eq(formatScript(again.ast, { symbols: ctx.symbols }), written);
      }
    });
    test('a touch test compared after が, a value read from the stage that is touched, and a part\'s 答え keep their （ ） and read back', () => {
      // 点数が「星」にふれていると同じ reads 点数 as who touches; すがたの番号にふれている and 「ねこ」の答え read other names.
      const symbols = buildSymbols(makeRegressionProject()), ctx = { symbols, targetId: 'sprite-1', targetType: 'sprite' };
      const cases = [
        ['もし点数が（「星」にふれている）と同じなら、\n  「a」と言う。', 'もし点数が（「星」にふれている）と同じなら、'],
        ['もし1が（「赤」の色にふれている）とちがうなら、\n  「a」と言う。', 'もし1が（「赤」の色にふれている）とちがえば、'],
        ['もし（すがたの番号）にふれているなら、\n  「a」と言う。', 'もし（すがたの番号）にふれていれば、'],
        ['もし（マウスがおされている）の色にふれているなら、\n  「a」と言う。', 'もし（マウスがおされている）の色にふれていれば、'],
        ['点数を「マスコット」の（答え）にする。', '「マスコット」の（答え）を点数に入れる。'],
        // (the neighbours keep their words)
        ['もし（「星」にふれている）が1と同じなら、\n  「a」と言う。', 'もし「星」にふれているが1と同じなら、'],
        ['もし「星」にふれているなら、\n  「a」と言う。', 'もし「星」にふれていれば、'],
        ['点数を「マスコット」の（大きさ）にする。', '「マスコット」の大きさを点数に入れる。'],
        // (a value read from the stage that reads back without （ ） is touched without them)
        ['もし答えにふれていれば、\n  ねこは「あ」と言う。', 'もし答えにふれていれば、'],
        ['だんごは、－マウスのよこのばしょにふれるまで待つ。', 'だんごは、条件（－マウスのよこのばしょにふれている）が成り立つまで待つ。'],
        ['「たくどん」の大きさ＋（よこのばしょ）にふれるまで、くり返す。\n  前へ20歩進む。', '条件（「たくどん」の大きさ＋よこのばしょにふれている）が成り立つまで、くり返す。'],
        ['点数を「ロケット」の（答え）にする。', '「ロケット」の（答え）を点数に入れる。'],
        // (a name ending in キー compared with a value that has おされ)
        ['もしスペースキーがおされているではないなら、\n  「a」と言う。', 'もし【スペースキー】が（条件（おされている）が成り立たない）と同じなら、'],
      ];
      const written = cases.map(([source]) => {
        const ast = parsed(source, ctx), text = formatScript(ast, { symbols });
        ok(astEquivalent(ast, parsed(text, ctx)), text);
        return text.split('\n')[0];
      });
      eq(written, cases.map(([, line]) => line));
    });
    test('a calculation inside a calculation is refused with P208 at the column of the level past the limit, for each way of writing one inside', () => {
      // A part written inside （ ） as 〜をかけた数, 〜をつなげた文字, 〜で割ったあまり or 〜で求めた答え counts its own levels with the ones around it:
      // [form, how many insides read, the column of the refusal one inside more].
      const symbols = buildSymbols(makeRegressionProject()), DEEP = '計算の 中に 計算が 入りすぎて います。短い 計算に 分けて ください';
      const nest = (form, insides) => { let text = '1'; for (let k = 0; k < insides; k++) text = form(text); return text; };
      const told = text => { try { parseExpression(text, symbols); return 'read'; } catch (e) { return [e.code, e.column, e.message]; } };
      for (const [form, most, column] of [
        [x => '1＋（' + x + 'と2をかけた数）', 42, 130], [x => '1＋（2と' + x + 'をかけた数）', 42, 214], [x => '1＋（' + x + 'と「a」をつなげた文字）', 42, 130],
        [x => '1＋（' + x + 'を3で割ったあまり）', 42, 130], [x => '（点数を' + x + 'として、【計算】で求めた答え）', 42, 173],
        [x => '（点数を' + x + 'として、【計算】で求めた答え）＋1', 63, 257], [x => '1＋（点数を' + x + 'として、【計算】で求めた答え）', 63, 385]])
        eq([nest(form, 1).slice(0, 12), told(nest(form, most)), told(nest(form, most + 1))], [nest(form, 1).slice(0, 12), 'read', ['P208', column, DEEP]]);
    });
    test('a count of times with a long calculation as its number is refused with P208, in the line it is given, once the count stands past the limit', () => {
      // 自分がNN回おされる: the number is read first, then the whole count is checked with its own level over the number's levels.
      const symbols = buildSymbols(makeRegressionProject()), DEEP = '計算の 中に 計算が 入りすぎて います。短い 計算に 分けて ください';
      const told = (steps, ctx) => { try { parseExpression('自分が1' + '＋1'.repeat(steps) + '回おされる', symbols, ctx); return 'read'; } catch (e) { return [e.code, e.line, e.column, e.message]; } };
      for (const [steps, column] of [[LIMITS.expressionDepth - 3, 0], [LIMITS.expressionDepth - 2, 0], [LIMITS.expressionDepth - 1, 1], [LIMITS.expressionDepth, 259]])
        for (const lineNo of [undefined, 5])
          eq([steps, lineNo, told(steps, lineNo ? { lineNo } : undefined)], [steps, lineNo, column ? ['P208', lineNo || 0, column, DEEP] : 'read']);
    });
    test('a mistake in a part of 〜で求めた答え or 〜をかけた数 written inside a calculation is told at its place in the line, and the places of the words of its parts are theirs', () => {
      const symbols = buildSymbols(makeRegressionProject());
      const first = source => { try { parseExpression(source, symbols); return 'read'; } catch (e) { return [e.code, e.column]; } };
      const inLine = source => { const d = parseSyntax(source, { symbols, targetId: 'sprite-1', targetType: 'sprite' }).syntaxDiagnostics[0]; return d ? [d.code, d.column] : 'read'; };
      // (a 1 left open by が is told at the character after が when the value stands alone, and at が when it stands in a line, wherever the part is)
      for (const before of ['', '1＋', '2×1＋']) for (const call of [x => '（' + x + 'をわたして、【計算】で求めた答え）', x => '（点数を' + x + 'として、【計算】で求めた答え）',
        x => '（' + x + 'と1をかけた数）', x => '（1と' + x + 'をかけた数）', x => '（' + x + 'を3で割ったあまり）', x => '（10を' + x + 'で割ったあまり）',
        x => '（' + x + 'と「あ」をつなげた文字）', x => '（「あ」と' + x + 'をつなげた文字）']) {
        const text = before + call('（1が）');
        eq([text, first(text), inLine('点数を' + text + 'にする。')], [text, ['P205', text.indexOf('が') + 2], ['P205', '点数を'.length + text.indexOf('が') + 1]]);
      }
      // (a name in a part is at its place in the line: [kind, first column, column after the last])
      const spansOf = source => { const found = []; (function walk(n) { if (Array.isArray(n)) return n.forEach(walk); if (n && typeof n === 'object') {
        if (n.sourceSpan && ['VariableRead', 'BinaryExpression'].includes(n.kind)) found.push([n.kind, n.sourceSpan.startColumn, n.sourceSpan.endColumn]); Object.values(n).forEach(walk); } })(parseSyntax(source, { symbols, targetId: 'sprite-1', targetType: 'sprite' }).ast); return found; };
      for (const [source, want] of [
        ['点数を1＋（（名前＋1）をわたして、【計算】で求めた答え）にする。', [['BinaryExpression', 4, 30], ['BinaryExpression', 8, 12], ['VariableRead', 8, 10]]],
        ['点数を1＋（点数を（名前＋1）として、【計算】で求めた答え）にする。', [['BinaryExpression', 4, 31], ['BinaryExpression', 10, 16], ['VariableRead', 11, 13]]],
        ['点数を（（名前＋1）と2をかけた数）にする。', [['BinaryExpression', 4, 19], ['BinaryExpression', 5, 11], ['VariableRead', 6, 8]]],
        ['点数を1＋（（名前＋1）と2をかけた数）にする。', [['BinaryExpression', 4, 21], ['BinaryExpression', 6, 21], ['BinaryExpression', 7, 13], ['VariableRead', 8, 10]]],
        ['点数を1＋（2と（名前＋1）をかけた数）にする。', [['BinaryExpression', 4, 21], ['BinaryExpression', 6, 21], ['BinaryExpression', 9, 15], ['VariableRead', 10, 12]]],
        ['点数を1＋（点数を名前として、【計算】で求めた答え）にする。', [['BinaryExpression', 4, 27], ['VariableRead', 10, 12]]],
        ['点数を1＋（名前と点数をかけた数）にする。', [['BinaryExpression', 4, 18], ['BinaryExpression', 6, 18], ['VariableRead', 7, 9], ['VariableRead', 10, 12]]]])
        eq([source, spansOf(source)], [source, want]);
    });
    test('a condition of two parts joined by 、 keeps the places of the names in a part that is written in other words', () => {
      // (the first part is read as another text than the one written: ではない, ではなく, でなく and ではなくて are read as と同じでない…; the second part stands after the 、)
      const symbols = buildSymbols(makeRegressionProject());
      const placesOfNames = source => {
        const found = []; (function walk(n) { if (Array.isArray(n)) return n.forEach(walk); if (n && typeof n === 'object') {
          if (n.kind === 'VariableRead' && n.sourceSpan) found.push([n.name, n.sourceSpan.startColumn, n.sourceSpan.endColumn]); Object.values(n).forEach(walk); } })(parseSyntax(source, { symbols, targetId: 'sprite-1', targetType: 'sprite' }).ast);
        return found;
      };
      for (const source of ['もし点数が10ではないか、名前が3なら、10歩進む。', 'もし点数が10ではなく、名前が3なら、10歩進む。', 'もし点数が10ではなくて、名前が3なら、10歩進む。',
        'もし点数が10でなく、名前が3でなければ、10歩進む。', 'もし点数が3ではないか、名前が10ではないなら、10歩進む。'])
        eq([source, placesOfNames(source)], [source, ['点数', '名前'].map(name => [name, source.indexOf(name) + 1, source.indexOf(name) + 1 + name.length])]);
    });
    test('a part after 、 that starts with a doubled letter and is written in other words keeps the places of its name', () => {
      // (the name stands right after the 、, so the text read for it starts with the doubled letter; ちょうど and ではない are read as if they were not there)
      for (const name of ['ああ', 'ふふふ', 'ああい', 'ああああ']) for (const form of [x => 'もし点数が1ではなく、' + x + 'が10ではないなら、10歩進む。', x => 'もし点数が1ではなく、' + x + 'がちょうど10なら、10歩進む。',
        x => 'もし点数が1でなく、' + x + 'が10でなければ、10歩進む。', x => 'もし点数が1ではないか、' + x + 'が10ではないなら、10歩進む。', x => 'もし点数が1ではないか、' + x + 'がちょうど10なら、10歩進む。']) {
        const source = form(name), work = makeRegressionProject();
        work.projectData.variables.push({ id: 'variable-doubled', name, initialValue: 0 });
        const symbols = buildSymbols(work), found = [];
        (function walk(n) { if (Array.isArray(n)) return n.forEach(walk); if (n && typeof n === 'object') {
          if (n.kind === 'VariableRead' && n.sourceSpan) found.push([n.name, n.sourceSpan.startColumn, n.sourceSpan.endColumn]); Object.values(n).forEach(walk); } })(parseSyntax(source, { symbols, targetId: 'sprite-1', targetType: 'sprite' }).ast);
        eq([source, found], [source, [['点数', 3, 5], [name, source.indexOf(name) + 1, source.indexOf(name) + 1 + name.length]]]);
      }
    });
    test('a count of presses that is a condition is not read as a count, and a count that is a number still is', () => {
      // 自分がコピーである回おされる would be a comparison with a count of presses that cannot be written back.
      const ctx = { symbols: buildSymbols(makeRegressionProject()), targetId: 'sprite-1', targetType: 'sprite' };
      const first = parseSyntax('もし「マスコット」が自分がコピーである回おされるなら、\n  「a」と言う。', ctx);
      eq([first.ast, first.syntaxDiagnostics.map(d => d.code)], [null, ['P201']]);
      for (const [source, written] of [['自分が3回おされるまで待つ。', '自分が3回おされるまで待つ。'], ['自分が点数＋1回おされるまで待つ。', '自分が（点数＋1）回おされるまで待つ。'], ['自分が（点数＋1）回おされるまで待つ。', '自分が（点数＋1）回おされるまで待つ。']]) {
        const ast = parsed(source, ctx), text = formatScript(ast, { symbols: ctx.symbols });
        eq(text, written);ok(astEquivalent(ast, parsed(text, ctx)), text);
      }
    });
    test('an error that is no refusal of the text, raised while a sentence and its proposals are read, is not taken for one', () => {
      // (the k-th look at the work's names throws; every k must let that error out of parseSyntax)
      const real = buildSymbols(makeRegressionProject()), swallowed = [];
      for (const source of ['前に10歩すすみました', '10歩進んでください', '点数を1にしよう']) {
        for (let k = 1; ; k++) {
          let n = 0, hit = false;
          const boom = new TypeError('names broken'), symbols = new Proxy(real, { get(target, key) { if (++n === k) { hit = true; throw boom; } const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; } });
          let thrown = null;
          try { parseSyntax(source, { symbols, targetId: 'sprite-1', targetType: 'sprite' }); } catch (error) { thrown = error; }
          if (!hit) break;
          if (thrown !== boom) swallowed.push(source + ' ' + k);
        }
      }
      eq(swallowed, []);
      // (after such an error, a choice that leaves its own line unreadable is still not offered)
      eq(parseSyntax('「点数は」と点数を言う。う', { symbols: real, targetId: 'sprite-1', targetType: 'sprite' }).syntaxDiagnostics.map(d => [d.code, (d.proposals || []).length]), [['P205', 0]]);
    });
    test('a value that does not read is told at its column in the line, not in the value', () => {
      // 点数を（1＋）にする: ＋ is the 6th character of the line (the value starts at the 4th).
      const ctx = { symbols: buildSymbols(makeRegressionProject()), targetId: 'sprite-1', targetType: 'sprite' };
      const place = source => { const d = parseSyntax(source, ctx).syntaxDiagnostics[0]; return [d.code, d.line, d.column]; };
      eq(place('点数を（1＋）にする。'), ['P205', 1, 6]);eq(place('点数を1＋にする。'), ['P205', 1, 5]);
      eq(place('「あ」と言う。\n点数を（2×）にする。'), ['P205', 2, 6]);eq(place('もし 1が1 なら、\n  点数を（3＋）にする。'), ['P205', 2, 8]);
      // (a \ in 「 」 followed by what it cannot be is told at its line and place, in the words of the value's check)
      const escaped = source => { const d = parseSyntax(source, ctx).syntaxDiagnostics[0]; return [d.code, d.line, d.column, d.message]; };
      const N103 = '「 」の 中の \\ の つぎには、\\ か「 か 」しか 書けません。\\ を 文字として 使う ときは \\\\ と 書きます';
      eq(escaped('前へ10歩進む。\n「\\n」と言う。'), ['N103', 2, 2, N103]);eq(escaped('「😀\\a」と言う。'), ['N103', 1, 3, N103]);
      // (the second sentence of a line is told at its place in the line, and a character outside the BMP (😀) is one)
      eq(place('「やあ」と言う。点数を（1＋）にする。'), ['P205', 1, 14]);eq(place('「😀😀」と言って、点数を（1＋）にする。'), ['P205', 1, 15]);
    });
    test('a list read after an operator takes its own 番目', () => {
      const project = makeRegressionProject(), symbols = buildSymbols(project), hero = makeRegressionProject();
      hero.projectData.variables.push({ id: 'variable-hero', name: '主役', initialValue: 0 });
      const program = (value, ctx = {}, before = '') => parsed(before + '点数を' + value + 'にする。', { symbols, ...ctx }),
        read = (...given) => program(...given).body.at(-1).value;
      for (const [value, ctx] of [['マスコットのよこのばしょ＋名前一覧の2番目'], ['「マスコット」のよこのばしょ＋名前一覧の2番目'], ['10÷3のあまり＋名前一覧の1番目'],
        ['マスコットのよこのばしょ＋名前一覧の2番目', { meijin: true }], ['主役のよこのばしょ＋名前一覧の2番目', { symbols: buildSymbols(hero), meijin: true }]]) {
        const v = read(value, ctx);
        eq([value, v.kind, v.op, v.right?.kind, v.right?.list?.name], [value, 'BinaryExpression', 'ADD', 'ListRead', '名前一覧']);
      }
      const local = 'この中だけで使うリスト【結果】を空で作る。\n';
      for (const [value, list, ctx, before] of [['名前一覧の1＋1番目', ['VariableRead', '名前一覧']], ['名前一覧の点数＋1番目', ['VariableRead', '名前一覧']],
        ['名前一覧の点数＋マスコットのよこのばしょ番目', ['VariableRead', '名前一覧']], ['【結果】の1＋10÷3のあまり番目', ['VariableRead', '結果'], { definition: true }, local],
        ['数一覧の1＋名前一覧の数番目', ['VariableRead', '数一覧'], { args: ['数一覧'], definition: true }], ['［10、20、30］の1＋マスコットのよこのばしょ番目', ['ListLiteral', null]],
        ['リスト「名前一覧」の1＋名前一覧の数番目', ['VariableRead', '名前一覧']], ['「名前一覧」の1＋名前一覧の数番目', ['StringLiteral', '名前一覧']],
        ['名前一覧の点数＋マスコットのよこのばしょ番目', ['VariableRead', '名前一覧'], { symbols: null }]]) {
        const v = read(value, ctx, before);
        eq([value, v.kind, v.list?.kind, v.list?.name ?? v.list?.value ?? null, v.index?.kind], [value, 'ListRead', ...list, 'BinaryExpression']);
      }
      for (const value of ['「こんにちは」の1＋名前一覧の数文字目', '「こんにちは」の点数＋「マスコット」のよこのばしょ文字目']) {
        const v = read(value);
        eq([value, v.kind, v.name, v.args?.[1]?.kind], [value, 'BuiltinCall', 'STRING_CHAR', 'BinaryExpression']);
      }
      for (const [value, ctx, before] of [['（10÷3のあまり）＋（名前一覧の1番目）'], ['「マスコット」のよこのばしょ＋名前一覧の2番目'], ['名前一覧の点数＋マスコットのよこのばしょ番目'],
        ['【結果】の1＋10÷3のあまり番目', { definition: true }, local], ['数一覧の1＋名前一覧の数番目', { args: ['数一覧'], definition: true }]]) {
        const ast = program(value, ctx, before), again = formatScript(ast);
        ok(astEquivalent(ast, parsed(again, { symbols, ...ctx })), value + ' is written as ' + again);
      }
    });
    test('a list read after an operator takes its own 番目 when its number goes on with an operator', () => {
      const symbols = buildSymbols(makeRegressionProject()), program = value => parsed('点数を' + value + 'にする。', { symbols });
      for (const [value, op, indexOp] of [['「マスコット」のよこのばしょ＋名前一覧の点数＋1番目', 'ADD', 'ADD'], ['「マスコット」の大きさ×名前一覧の点数＋1番目', 'MUL', 'ADD'],
        ['「マスコット」のよこのばしょ－名前一覧の点数－1番目', 'SUB', 'SUB'], ['「マスコット」の大きさ÷名前一覧の点数÷2番目', 'DIV', 'DIV'],
        ['マスコットのよこのばしょ＋1＋名前一覧の点数×2番目', 'ADD', 'MUL'], ['「マスコット」の大きさ+名前一覧の点数+1番目', 'ADD', 'ADD']]) {
        const ast = program(value), v = ast.body.at(-1).value, again = formatScript(ast);
        eq([value, v.kind, v.op, v.right?.kind, v.right?.list?.name, v.right?.index?.op], [value, 'BinaryExpression', op, 'ListRead', '名前一覧', indexOp]);
        ok(astEquivalent(ast, parsed(again, { symbols })), value + ' is written as ' + again);
      }
      // (the number of a list's own 番目 and of a 文字目 is still everything up to the 番目 or 文字目)
      eq([program('名前一覧の点数＋1番目').body.at(-1).value.index?.op, program('「こんにちは」の1＋名前一覧の点数＋1文字目').body.at(-1).value.name], ['ADD', 'STRING_CHAR']);
    });
    test('a joined saying after a subject with 、 is read in a bounded number of steps, and a name not made after it is told in time', () => {
      const project = makeRegressionProject(), symbols = buildSymbols(project), ctx = { symbols, targetId: 'sprite-1', targetType: 'sprite' };
      // The looks at the names of the work are counted: a rewriting that leads back to itself passes any limit. The
      // readings below take under 100 looks each; the limit is ten times that.
      const counted = () => { let looks = 0; return new Proxy(symbols, { get(target, key) { if (++looks > 1000) throw new Error('over 1000 looks at the names of the work'); return target[key]; } }); };
      const read = source => parseSyntax(source, { ...ctx, symbols: counted() });
      for (const [source, written] of [['マスコットは、「あ」と「い」をつなげて言う。', 'マスコットは「あ」と「い」をつなげて言う。'], ['マスコットは「あ」と「い」をつなげて言う。', 'マスコットは「あ」と「い」をつなげて言う。'],
        ['「あ」と「い」をつなげて言う。', '「あ」と「い」をつなげて言う。']]) {
        const result = read(source);eq(result.syntaxDiagnostics.map(d => [d.code, d.message]), []);eq(formatScript(result.ast, { symbols }), written);
      }
      // A sentence that is not yet the written form gets the rewrite, with or without the subject's 、.
      const join = 'いくつかを ならべて 言う ときは、「つなげて言う」と 書きます';
      for (const [source, message, rewrite] of [['マスコットは、「点数は」と点数を言う。', join, 'マスコットは「点数は」と点数をつなげて言う'], ['「点数は」と点数を言う。', join, '「点数は」と点数をつなげて言う'],
        ['マスコットは、「あ」と「い」をつなげて、言う。', join, 'マスコットは「あ」と「い」をつなげて言う'], ['マスコットは、「あ」と「い」を、つなげて言う。', join, 'マスコットは「あ」と「い」をつなげて言う'],
        ['マスコットは、「あ」と「い」を2秒つなげて言う。', '時間を つけて 話す ときは「マスコットは（「あ」と「い」をつなげた文字）を2秒話す」と 書きます', 'マスコットは（「あ」と「い」をつなげた文字）を2秒話す']])
        eq(read(source).syntaxDiagnostics.map(d => [d.code, d.line, d.column, d.message, d.proposals.map(p => p.source)]), [['P205', 1, 1, message, [rewrite]]]);
      // The check of the work tells the name not made, on its line, and returns: the three checks took under 1 second
      // when this was written, and never returned before; 20 seconds leaves room for a slow machine.
      const started = Date.now(), missing = 'まだ 作っていない 名前「ぬ」です。名前を たしかめるか、その 名前の へんすうか リストを 作って ください';
      for (const [source, line] of [['「あ」と「い」をつなげて言う。\n【ぬ】を言う。', 2], ['【ぬ】を言う。\n「あ」と「い」をつなげて言う。', 1], ['「あ」と「い」をつなげて言う。\n点数を【ぬ】にする。', 2]]) {
        eq(analyzeAst(parsed(source, ctx), project, ctx).map(d => [d.code, d.line, d.column, d.message]), [['S301', line, 1, missing]]);
        const work = makeRegressionProject();work.scripts.find(s => s.targetId === 'sprite-1').source = source;
        eq(compileProject(work).errors.map(d => [d.code, d.line, d.message]), [['S301', line, missing]]);
      }
      ok(Date.now() - started < 20000, 'the checks took ' + (Date.now() - started) + ' ms');
    });
    test('a が inside a word of あかり does not end the value of a 番目', () => {
      // 持ち物のすがたの番号番目: the index is すがたの番号 (the が of すがた is no が of a condition); a が of the sentence still ends it.
      const p = makeRegressionProject();
      p.projectData.lists.push({ id: 'own-bag', name: '持ち物', initialValue: ['本'] }, { id: 'own-names', name: '名前一覧', initialValue: ['a'] });
      const ctx = { symbols: buildSymbols(p), targetId: 'sprite-1', targetType: 'sprite' };
      const lists = (node, found = []) => {
        if (Array.isArray(node)) for (const item of node) lists(item, found);
        else if (node && typeof node === 'object') { if (node.kind === 'ListRead') found.push(node.list?.name ?? node.name); for (const key of Object.keys(node)) lists(node[key], found); }
        return found;
      };
      for (const [source, written, read] of [
        ['持ち物のすがたの番号番目を言う。', '持ち物の（すがたの番号）番目を言う。', ['持ち物']],
        ['名前一覧のすがたの番号＋1番目を言う。', '名前一覧の（すがたの番号＋1）番目を言う。', ['名前一覧']],
        ['持ち物のすがたの名前番目を言う。', '持ち物の（すがたの名前）番目を言う。', ['持ち物']],
        ['持ち物の「マスコット」のすがたの番号番目を言う。', '持ち物の（「マスコット」のすがたの番号）番目を言う。', ['持ち物']],
        ['持ち物の名前一覧の中で「本」がはじめて出てくる番号番目を言う。', '持ち物の（名前一覧の中で「本」がはじめて出てくる番号）番目を言う。', ['持ち物']],
        ['持ち物の名前一覧で「本」が最初にある番号番目を言う。', '持ち物の（名前一覧の中で「本」がはじめて出てくる番号）番目を言う。', ['持ち物']],
        ['もし持ち物のすがたの番号番目が「本」なら、\n  何もしない。', 'もし持ち物の（すがたの番号）番目が「本」なら、\n  何もしない。', ['持ち物']],
        ['もし点数が持ち物のすがたの番号番目なら、\n  何もしない。', 'もし点数が持ち物の（すがたの番号）番目なら、\n  何もしない。', ['持ち物']],
        ['点数を持ち物のすがたの番号文字目にする。', '点数を持ち物の（すがたの番号）文字目にする。', []],
        // (a が of the sentence: the 番目 after it belongs to the list written after it)
        ['もしすがたの番号が持ち物の1番目なら、\n  何もしない。', 'もしすがたの番号が持ち物の1番目なら、\n  何もしない。', ['持ち物']],
        ['もし「マスコット」のすがたの番号が名前一覧の1番目より大きいなら、\n  何もしない。', 'もし「マスコット」のすがたの番号が名前一覧の1番目より大きければ、\n  何もしない。', ['名前一覧']],
        ['もし持ち物のすがたの番号番目が名前一覧のすがたの番号番目なら、\n  何もしない。', 'もし持ち物の（すがたの番号）番目が名前一覧の（すがたの番号）番目なら、\n  何もしない。', ['持ち物', '名前一覧']],
      ]) {
        const first = parseSyntax(source, ctx);eq(first.syntaxDiagnostics.map(d => [d.code, d.message]), []);
        eq(lists(first.ast.body), read);
        eq(formatScript(first.ast, { symbols: ctx.symbols }), written);
        ok(astEquivalent(first.ast, parsed(written, ctx)), written);
        eq(analyzeAst(first.ast, p, { targetId: 'sprite-1', event: 'start' }).map(d => [d.code, d.message]), []);
      }
    });
    test('a 答え, or a name that starts with 値, after の is the number of a 番目 or 文字目', () => {
      // 持ち物の答え番目: the number is 答え (the の答え of a noun phrase reads no number away); 値段 is a name of the work.
      const p = makeRegressionProject();
      p.projectData.lists.push({ id: 'own-bag', name: '持ち物', initialValue: ['本'] });
      p.projectData.variables.push({ id: 'own-title', name: '題名', initialValue: 'あかり' }, { id: 'own-price', name: '値段', initialValue: 1 });
      const ctx = { symbols: buildSymbols(p), targetId: 'sprite-1', targetType: 'sprite' };
      const count = (node, test) => !node || typeof node !== 'object' ? 0
        : (test(node) ? 1 : 0) + Object.values(node).reduce((sum, child) => sum + count(child, test), 0);
      for (const [source, written, answers, items] of [
        ['持ち物の答え番目を言う。', '持ち物の（答え）番目を言う。', 1, 1],
        ['持ち物の答え＋1番目を言う。', '持ち物の（答え＋1）番目を言う。', 1, 1],
        ['点数を持ち物の答え－1番目にする。', '点数を持ち物の（答え－1）番目にする。', 1, 1],
        ['【持ち物】の答え番目を言う。', '【持ち物】の（答え）番目を言う。', 1, 1],
        ['もし持ち物の答え番目が「本」なら、\n  何もしない。', 'もし持ち物の（答え）番目が「本」なら、\n  何もしない。', 1, 1],
        ['持ち物の答えの長さ番目を言う。', '持ち物の（答えの長さ）番目を言う。', 1, 1],
        ['題名の答え文字目を言う。', '題名の（答え）文字目を言う。', 1, 0],
        ['題名の答え＋1文字目を言う。', '題名の（答え＋1）文字目を言う。', 1, 0],
        ['持ち物の値段番目を言う。', '持ち物の【値段】番目を言う。', 0, 1],
        ['点数を持ち物の値段＋1番目にする。', '点数を持ち物の（値段＋1）番目にする。', 0, 1],
        ['題名の値段文字目を言う。', '題名の【値段】文字目を言う。', 0, 0],
        // (the noun phrases 点数の値 and 点数の答え read 点数, also before a 番目 of its own and before a later list)
        ['点数の値を言う。', '点数を言う。', 0, 0],
        ['点数の答えを言う。', '点数を言う。', 0, 0],
        ['点数の値番目を言う。', '【点数】番目を言う。', 0, 0],
        ['点数の答え番目を言う。', '【点数】番目を言う。', 0, 0],
        ['持ち物の点数の値＋1番目を言う。', '持ち物の（点数＋1）番目を言う。', 0, 1],
        ['点数の値＋持ち物の1番目を言う。', '点数＋持ち物の1番目を言う。', 0, 1],
        ['点数の答え＋持ち物の答え番目を言う。', '点数＋持ち物の（答え）番目を言う。', 1, 1],
        ['持ち物の（答え）番目を言う。', '持ち物の（答え）番目を言う。', 1, 1],
      ]) {
        const first = parseSyntax(source, ctx);eq(first.syntaxDiagnostics.map(d => [d.code, d.message]), []);
        eq([source, count(first.ast.body, node => node.kind === 'SensorRead' && node.sensor === '答え'), count(first.ast.body, node => node.kind === 'ListRead')], [source, answers, items]);
        eq(formatScript(first.ast, { symbols: ctx.symbols }), written);
        ok(astEquivalent(first.ast, parsed(written, ctx)), written);
        eq(analyzeAst(first.ast, p, { targetId: 'sprite-1', event: 'start' }).map(d => [d.code, d.message]), []);
      }
    });
    test('a name not made, or a length word, before the 番目 of a list is its number, and the work check names it', () => {
      // 持ち物の値番目 and 持ち物の数番目: the number runs from the の to the 番目, so 値 and 数 are names that are not made.
      const p = makeRegressionProject();
      p.projectData.lists.push({ id: 'own-bag', name: '持ち物', initialValue: ['本'] });
      const ctx = { symbols: buildSymbols(p), targetId: 'sprite-1', targetType: 'sprite' };
      const missing = name => ['S301', `まだ 作っていない 名前「${name}」です。名前を たしかめるか、その 名前の へんすうか リストを 作って ください`];
      for (const [source, written, name] of [
        ['持ち物の値番目を言う。', '持ち物の値番目を言う。', '値'],
        ['持ち物の値＋1番目を言う。', '持ち物の（値＋1）番目を言う。', '値'],
        ['持ち物の数番目を言う。', '持ち物の数番目を言う。', '数'],
        ['持ち物の個数番目を言う。', '持ち物の個数番目を言う。', '個数'],
        ['持ち物の長さ番目を言う。', '持ち物の長さ番目を言う。', '長さ'],
        ['点数を持ち物の数番目にする。', '点数を持ち物の数番目にする。', '数'],
      ]) {
        const first = parseSyntax(source, ctx);eq(first.syntaxDiagnostics.map(d => [d.code, d.message]), []);
        eq([source, first.ast.body[0].value.kind], [source, 'ListRead']);
        eq(formatScript(first.ast, { symbols: ctx.symbols }), written);
        ok(astEquivalent(first.ast, parsed(written, ctx)), written);
        eq([source, analyzeAst(first.ast, p, { targetId: 'sprite-1', event: 'start' }).map(d => [d.code, d.message])], [source, [missing(name)]]);
      }
      // (the length of a list, a length as the number, and 点数の値 before a 番目 of its own read as before)
      for (const [source, written] of [['持ち物の数を言う。', '持ち物の数を言う。'], ['持ち物の個数を言う。', '持ち物の数を言う。'],
        ['持ち物の持ち物の数番目を言う。', '持ち物の（持ち物の数）番目を言う。'], ['点数の値番目を言う。', '【点数】番目を言う。']]) {
        const first = parseSyntax(source, ctx);eq(first.syntaxDiagnostics.map(d => [d.code, d.message]), []);
        eq(formatScript(first.ast, { symbols: ctx.symbols }), written);
        eq([source, analyzeAst(first.ast, p, { targetId: 'sprite-1', event: 'start' }).map(d => [d.code, d.message])], [source, []]);
      }
    });
    test('a list of another part, written after the part and の without （ ）, is told with the way to write it', () => {
      const p = makeRegressionProject();
      p.components.find(c => c.id === 'sprite-1').localData = { variables: [{ id: 'own-hp', name: '体力', initialValue: 3 }], lists: [{ id: 'own-bag', name: 'かばん', initialValue: ['a'] }] };
      const ctx = { symbols: buildSymbols(p), targetId: 'sprite-1', targetType: 'sprite' };
      const told = ['P205', '「マスコット」の リストの 中身は、（ ）で かこんで 書きます。れい：「マスコット」の（かばんの1番目）'];
      for (const source of ['「マスコット」のかばんの1番目を言う。', '「マスコット」のかばんの答え番目を言う。', '「マスコット」のかばん番目を言う。',
        'マスコットのかばんの1番目を点数に入れる。', '点数を「マスコット」のかばんの1番目にする。'])
        eq([source, parseSyntax(source, ctx).syntaxDiagnostics.map(d => [d.code, d.message])], [source, [told]]);
      // (the written way, a variable of the part and a letter of the quoted text read as before)
      for (const source of ['「マスコット」の（かばんの1番目）を言う。', '「マスコット」の体力を言う。', '「マスコット」の1文字目を言う。']) {
        const first = parseSyntax(source, ctx);eq(first.syntaxDiagnostics.map(d => [d.code, d.message]), []);
        eq(formatScript(first.ast, { symbols: ctx.symbols }), source);
      }
    });
    test('a part that is not there, named in a value joined by かつ, is told at the line of its sentence', () => {
      const p = makeRegressionProject(), ctx = { symbols: buildSymbols(p), targetId: 'sprite-1', targetType: 'sprite' };
      const missing = name => `「${name}」という キャラクターや 部品が 見つかりません。名前を たしかめて ください`;
      for (const [source, told] of [
        ['もし点数10の倍数 かつ 点数が20より大きいなら、「a」と言う。', [['S301', 1, 1, missing('点数10')]]],
        ['「a」と言う。\nもし点数10の倍数 かつ 点数が20より大きいなら、「a」と言う。', [['S301', 2, 1, missing('点数10')]]],
        ['もし点数10の倍数 または 点数が20より大きいなら、「a」と言う。', [['S301', 1, 1, missing('点数10')]]],
        // (a value with a place of its own keeps it)
        ['もし条件（点数が2と同じかつ「いない」の体力が1と同じ）が成り立つなら、\n  「a」と言う。', [['S301', 1, 15, missing('いない')]]],
        ['もし「いない」の体力が1なら、\n  「a」と言う。', [['S301', 1, 3, missing('いない')]]],
      ]) {
        const first = parseSyntax(source, ctx);eq(first.syntaxDiagnostics.map(d => [d.code, d.message]), []);
        const all = analyzeAst(first.ast, p, { targetId: 'sprite-1', event: 'start' }), lines = source.split('\n');
        eq([source, all.filter(d => d.message.includes('キャラクターや 部品が 見つかりません')).map(d => [d.code, d.line, d.column, d.message])], [source, told]);
        for (const d of all) ok(Number.isInteger(d.line) && d.line >= 1 && d.line <= lines.length && Number.isInteger(d.column) && d.column >= 1 && d.column <= lines[d.line - 1].length + 1, source + ' ' + d.code + ' ' + d.line + ':' + d.column);
      }
    });
    test('a place after a line end inside a 「 」 is told on its own line, whichever line end is written', () => {
      const p = makeRegressionProject(), ctx = { symbols: buildSymbols(p), targetId: 'sprite-1', targetType: 'sprite' };
      const place = source => parseSyntax(source, ctx).syntaxDiagnostics.map(d => [d.code, d.line, d.column]);
      for (const [written, told] of [
        [end => '「つぎの日の' + end + '朝」になったとき、ねこは「おはよう」と言う。', [['P205', 2, 7]]],
        [end => 'もし点数が「あ' + end + 'い」より大きなら、「a」と言う。', [['P201', 2, 3]]],
        [end => '「あ' + end + 'い」と言って、10歩進むむ。', [['P205', 2, 1]]],
        [end => '「a」と言う。' + end + 'もし点数が「あ' + end + 'い」より大きなら、「a」と言う。', [['P201', 3, 3]]],
        // (a line end outside a 「 」)
        [end => '「a」と言う。' + end + 'ぬぬを言うう。', [['P201', 2, 1]]],
      ]) for (const end of ['\n', '\r', '\r\n']) eq([written(end), place(written(end))], [written(end), told]);
      // (no line end: the place is on the first line)
      eq(place('「つぎの日の朝」になったとき、ねこは「おはよう」と言う。'), [['P205', 1, 13]]);
      eq(place('もし点数が「あい」より大きなら、「a」と言う。'), [['P201', 1, 10]]);
    });
    // LANGUAGE.md 動きの文: 〜のところへ行く takes a part or the mouse. A place of the screen is told with the sentence of the
    // block that goes to a decided place, under the name that block has in the list, the written time first.
    test('a place of the screen written as 〜のところへ行く is told with the sentence and the name of the block that goes to a decided place', () => {
      const p = makeRegressionProject(), ctx = { symbols: buildSymbols(p), targetId: 'sprite-1', targetType: 'sprite' };
      const name = BLOCK_SCHEMA_BY_ID.get('MotionCommand:GOTO').label, centre = '画面の左下のはしから、右へ' + p.stage.width / 2 + '歩、上へ' + p.stage.height / 2 + '歩のばしょへ行く';
      const told = source => parseSyntax(source, ctx).syntaxDiagnostics.map(d => [d.code, (d.proposals || []).map(c => [c.label, c.source])]);
      eq(name, '決めた ばしょへ行く');
      eq(told('画面のまん中のところへ行く。'), [['P205', [[name, centre]]]]);
      eq(told('画面のまん中のところへ1秒かけて行く。'), [['P205', [[name, '1秒かけて、' + centre]]]]);
    });
    // A turn written without a direction, a sound stop, a stop written alone and a slow move are told with the sentence and the name and the sentence of each fix.
    test('a turn without a direction, a sound stop, a stop alone and a slow move are told with the sentence and the names of the fixes', () => {
      const p = makeRegressionProject(), ctx = { symbols: buildSymbols(p), targetId: 'sprite-1', targetType: 'sprite' };
      const told = source => parseSyntax(source, ctx).syntaxDiagnostics.map(d => [d.code, d.message, (d.proposals || []).map(c => [c.label, c.source])]);
      eq(told('90度回る。'), [['P205', '回る 向きを「右に」か「左に」で 書きます', [['右に回る', '右に90度回る'], ['左に回る', '左に90度回る']]]]);
      eq(told('音を止める。'), [['P205', '鳴って いる 音を 止める ときは「すべての音を止める」と 書きます', [['すべての音を止める', 'すべての音を止める']]]]);
      eq(told('ねこは、音を止める。'), [['P205', '鳴って いる 音を 止める ときは「ねこはすべての音を止める」と 書きます', [['すべての音を止める', 'ねこはすべての音を止める']]]]);
      const stop = '何を 止めるかを 書きます。この 本文の 動きを 止める ときは「この動きを止める」、作品の 動きを ぜんぶ 止める ときは「作品を全部止める」と 書きます';
      eq(told('止める。'), [['P205', stop, [['この動きを止める', 'この動きを止める'], ['作品を全部止める', '作品を全部止める']]]]);
      eq(told('ねこは、止める。'), [['P205', stop, [['この動きを止める', 'ねこはこの動きを止める'], ['作品を全部止める', '作品を全部止める']]]]);
      eq(told('いまのばしょから、ゆっくり右へ10歩動く。'), [['P205', 'ゆっくり 動くときは、「1秒かけて、いまのばしょから、右へ10歩動く」のように かける 時間を 書きます', [['時間をかけて動く', '1秒かけて、いまのばしょから、右へ10歩動く']]]]);
    });
    test('a text whose lines end with CR or CR LF gets the same guidance as with LF', () => {
      const p = makeRegressionProject(), ctx = { symbols: buildSymbols(p), targetId: 'sprite-1', targetType: 'sprite' };
      const plain = text => String(text).split('\r\n').join('\n').split('\r').join('\n');
      const told = source => parseSyntax(source, ctx).syntaxDiagnostics.map(d => [d.code, d.line, d.column, plain(d.message), (d.proposals || []).map(c => [c.label, plain(c.source)])]);
      for (const [source, first] of [
        // (a choice that leaves its own line unreadable is not offered)
        ['【ぬ】を言う。\n「点数は」と点数を言う。う', ['P205', 2, 1, 0]],
        ['「あ\nい」と言う。\nもし「星」にふれたら、', ['P205', 3, 1, 1]],
        ['「あ\nい」と言う。\n点数が10になったら、止まる。', ['P205', 3, 1, 0]],
        // (the guidance of a word is found on the line of the diagnostic)
        ['「あ\nい」と言う。\nもしスコアが12の約数なら、「やくすう」と言う。', ['S301', 3, 9, 0]],
        // (a line end inside a 「 」 is shown as a space in the message)
        ['もし「\n星」にふれたら、', ['P205', 1, 1, 1]],
        // (the sentences after the heading on its line are its body: the text reads; a line written left of the body is told)
        ['「\n星」にふれたとき、すがたをかくす。すがたを見せる。点数を1ふやす。', null],
        ['「\n星」にふれたとき、すがたをかくす。\nすがたを見せる。', ['P209', 3, 1, 0]],
        ['拡張「\n拡張名」「機能名」（引数1、引数2）', ['P201', 1, 1, 0]],
      ]) {
        const answer = told(source);
        eq([source, answer.map(d => [d[0], d[1], d[2], d[4].length])], [source, first ? [first] : []]);
        for (const end of ['\r', '\r\n']) { const other = source.split('\n').join(end); eq([other, told(other)], [other, answer]); }
      }
    });
    {
      // Lines as the reader of a text makes them: the lines of normalizeSource, each cut at its 。 into the parts of its
      // sentences (surfaceLineSlice) and indented as the line is. The texts: rows of a few letters and 「 」 that go on over
      // rows with either line end, after a row or not, indented with blanks of either width or not.
      const partSources = [];
      for (const before of ['', 'x\n']) for (const indent of ['', '  ', '　'])
        for (const body of ['ab', 'ab。ba', 'a「b\nc」a', 'b「\na」。ab', '「s\r\nt」b。a「\nb」', 'ab「c\r\nd」'])
          partSources.push(before + indent + body);
      const partsOf = source => Akari.normalizeSource(source).lines.filter(line => !line.continuation).flatMap(line => {
        const prefix = /^[ 　]*/u.exec(line.raw)[0], parts = [];
        line.indent = prefix.length + (prefix.match(/　/gu) || []).length;
        let start = 0;
        for (let i = 0; i <= line.code.length; i++) if (i === line.code.length || line.code[i] === '。') {
          if (i > start) { const part = surfaceLineSlice(line, start, i); part.indent = line.indent; parts.push(part); }
          start = i + 1;
        }
        return [line, ...parts];
      });
      // The row and the column of a place of the text: the line ends before it (CR LF as one), and the characters from the
      // last of them to it, one more. (A place between the CR and the LF of a CR LF is not used.)
      const rowAt = (text, at) => (text.slice(0, at).match(/\r\n|\r|\n/g) || []).length;
      const columnAt = (text, at) => { const before = text.slice(0, at), end = Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r')); return [...before.slice(end + 1)].length + 1; };
      const insideLineEnd = (text, at) => text[at - 1] === '\r' && text[at] === '\n';
      test('a part of a line has the places of its characters and starts and ends on the rows and columns where they are written', () => {
        for (const source of partSources) for (const line of partsOf(source).slice(1)) {
          const positions = line.mapped.positions;
          for (let s = 0; s < line.code.length; s++) for (let e = s + 1; e <= line.code.length; e++) {
            const first = positions[s], after = positions[e - 1] + 1;
            if (insideLineEnd(source, first) || insideLineEnd(source, after)) continue;
            const part = surfaceLineSlice(line, s, e);
            eq([source, s, e, part.code, part.mapped.positions, part.lineNo, part.startColumn, part.endLine, part.endColumn],
              [source, s, e, line.code.slice(s, e), positions.slice(s, e), rowAt(source, first) + 1, columnAt(source, first), rowAt(source, after) + 1, columnAt(source, after)]);
          }
        }
        // (a part with no places is where the line is: an empty part of a sentence at the sentence's rows and columns, and a
        // part of a line made of a text alone, without places, at the line's row and its first column)
        for (const source of partSources) for (const line of partsOf(source).filter(part => part.physicalStart !== undefined)) for (let s = 0; s <= line.code.length; s++) {
          const part = surfaceLineSlice(line, s, s);
          eq([source, s, part.code, part.mapped.positions, part.lineNo, part.startColumn, part.endLine, part.endColumn], [source, s, '', [], line.lineNo, line.startColumn, line.endLine, line.endColumn]);
        }
        for (const text of ['ab', 'a「b\nc」']) for (let e = 0; e <= text.length; e++) {
          const part = surfaceLineSlice({ raw: text, code: text, lineNo: 3 }, 0, e);
          eq([text, e, part.code, part.lineNo, part.startColumn, part.endColumn], [text, e, text.slice(0, e), 3, 1, undefined]);
        }
      });
      // Written again (with a replacement), a part keeps the places of the characters the two texts keep, the most they
      // have alike in order (any such way of keeping them); where it writes others in place of some, those take places of
      // the ones they replace, in order, the first the first and the last the last (one alone at the start of the text the
      // first, at its end the last); characters put where none were take the place of the character before. It starts
      // and ends where the part as written does.
      const keptWays = (a, b) => {
        const most = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
        for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) most[i][j] = Math.max(most[i + 1][j], most[i][j + 1], a[i] === b[j] ? most[i + 1][j + 1] + 1 : 0);
        const ways = [], walk = (i, j, kept) => {
          if (!most[i][j]) { ways.push(kept); return; }
          for (let x = i; x < a.length; x++) for (let y = j; y < b.length; y++) if (a[x] === b[y] && most[x + 1][y + 1] + 1 === most[i][j]) walk(x + 1, y + 1, [...kept, [x, y]]);
        };
        walk(0, 0, []);
        return ways;
      };
      const placedAs = (put, places, kept, written, again) => {
        if (put.length !== again.length || kept.some(([x, y]) => put[y] !== places[x])) return false;
        const ends = [[-1, -1], ...kept, [written.length, again.length]];
        return ends.slice(1).every(([x, y], t) => {
          const i = ends[t][0] + 1, j = ends[t][1] + 1, replaced = places.slice(i, x), taken = put.slice(j, y);
          if (!taken.length) return true;
          if (!replaced.length) return taken.every(place => place === places[i - 1]);
          if (taken.length === 1) return !j && y === again.length ? [replaced[0], replaced.at(-1)].includes(taken[0]) : !j ? taken[0] === replaced[0] : y === again.length ? taken[0] === replaced.at(-1) : replaced.includes(taken[0]);
          return taken[0] === replaced[0] && taken.at(-1) === replaced.at(-1) && taken.every((place, k) => replaced.includes(place) && (!k || replaced.indexOf(place) >= replaced.indexOf(taken[k - 1])));
        });
      };
      const againTexts = ['a', 'b'];
      for (let n = 1; n < 4; n++) againTexts.push(...againTexts.filter(text => text.length === n).flatMap(text => [text + 'a', text + 'b']));
      test('a part of a line written again keeps the places of the characters the two keep and puts the others among those they replace', () => {
        for (const source of partSources) for (const line of partsOf(source).slice(1)) {
          for (let s = 0; s < line.code.length; s++) for (let e = s + 1; e <= Math.min(line.code.length, s + 4); e++) {
            const written = line.code.slice(s, e), places = line.mapped.positions.slice(s, e);
            if (!/^[ab]+$/.test(written)) continue;
            const plain = surfaceLineSlice(line, s, e), where = [plain.lineNo, plain.startColumn, plain.endLine, plain.endColumn];
            for (const again of againTexts) {
              const part = surfaceLineSlice(line, s, e, again);
              if (part.code !== again || part.mapped.text !== again || !keptWays(written, again).some(kept => placedAs(part.mapped.positions, places, kept, written, again)))
                eq([source, s, e, again, part.code, part.mapped.positions], [source, s, e, again, again, 'places as the characters kept and replaced']);
              eq([source, s, e, again, part.lineNo, part.startColumn, part.endLine, part.endColumn], [source, s, e, again, ...where]);
            }
          }
        }
      });
      // The row of a place of a line (surfaceRow, the place counted from the start of the line's first row): the line ends
      // written before it on the line.
      test('the row of a place of a line counts the line ends written before it', () => {
        for (const source of partSources) for (const line of partsOf(source)) {
          const base = line.physicalStart ?? line.start;
          for (let offset = 0; offset <= line.raw.length; offset++) {
            if (insideLineEnd(source, base + offset)) continue;
            eq([source, line.code, offset, surfaceRow(line, offset)], [source, line.code, offset, rowAt(line.raw, offset)]);
          }
        }
      });
      // A mistake told at the start of a line that goes on over rows (mistakeAtClause, with the reader of the line): the line
      // is cut where the first clause (after a 、) of each later row begins, a piece before the last keeping its 、; the
      // mistake is where the first piece is whose reading gives the same code and message (line ends read as spaces), the
      // 「〜して、」 with nothing after it (P202) of a piece before the last not counted. In a later piece it is told at the
      // place that reading gave on another row, and otherwise at the start of the piece; in the first piece, or when no
      // piece gives it, it stays. A mistake with a place of its own (another row, or a column after the first) and one of a
      // line on one row stay as they are.
      // The readers: a mistake in each text with a z, told at no place, at the start of the text read, or at the z; with a
      // message that is the same for every text or one that names the text read.
      // A mistake with no place of the rest of a line after its clauses that end in 〜して、 or 〜てから、 is told on the row
      // the rest begins on, at its start.
      test('a mistake with no place after the clauses of a line is told at the start of the row the rest begins on', () => {
        const ctx = { symbols: buildSymbols(makeRegressionProject()), targetId: 'sprite-1', targetType: 'sprite' }, rest = '右へ10歩動かす';
        for (const before of ['', '作品を動かしたとき、\n  ']) for (const clauses of ['2秒待ってから、', '「a\nb」と言って、', '「a\r\nb」と言ってから、', '前へ10歩進んで、「a\nb」と言ってから、']) {
          const source = before + clauses + rest + '。';
          eq([source, parseSyntax(source, ctx).syntaxDiagnostics.map(d => [d.line, d.column])], [source, [[rowAt(source, source.indexOf(rest)) + 1, 1]]]);
        }
      });
      const clauseKinds = ['p', 'z', '「q\nr」p', '「q\nr」z', '「z\nr」', 'p「q\r\nr」', 'zp'];
      const clauseLines = [];
      for (const first of clauseKinds) for (const second of clauseKinds) {
        clauseLines.push(first + '、' + second);
        for (const third of ['p', 'z', '「q\nz」']) clauseLines.push(first + '、' + second + '、' + third);
      }
      test('a mistake at the start of a line over rows is told where the first piece that shows it begins', () => {
        for (const clauses of clauseLines) for (const source of [clauses, 'x\n  ' + clauses, '「s\nt」p。' + clauses]) {
          const line = partsOf(source).at(-1), base = line.physicalStart ?? line.start;
          // (the pieces: the clauses after a 、 that begin a row after the row the line begins on, the first of each row)
          const cuts = [0];
          for (let at = 1; at < line.code.length; at++) {
            const row = rowAt(source, line.mapped.positions[at]);
            if (line.code[at - 1] === '、' && row > rowAt(source, line.mapped.positions[0]) && cuts.every(cut => rowAt(source, line.mapped.positions[cut]) !== row)) cuts.push(at);
          }
          const pieces = cuts.map((cut, n) => {
            const end = cuts[n + 1] ?? line.code.length;
            return { code: line.code.slice(cut, end), mapped: { positions: line.mapped.positions.slice(cut, end) }, lineNo: rowAt(source, line.mapped.positions[cut]) + 1, last: n === cuts.length - 1 };
          });
          for (const code of ['P205', 'P202']) for (const place of ['none', 'start', 'z']) for (const naming of [false, true]) {
            // (a reader whose message names the text read gives a place, and one of a 〜して、 with nothing after it (P202)
            // gives no place or the start of the text read)
            if ((naming && place === 'none') || (code === 'P202' && place === 'z')) continue;
            const messageOf = text => naming ? '「' + text + '」は 読めません' : 'm\n';
            const read = part => {
              if (!part.code.includes('z')) return;
              const z = part.mapped.positions[part.code.indexOf('z')];
              throw place === 'none' ? new AkariError(code, messageOf(part.code), 0, 0) : place === 'start' ? new AkariError(code, messageOf(part.code), part.lineNo, 1) : new AkariError(code, messageOf(part.code), rowAt(source, z) + 1, columnAt(source, z));
            };
            let error = null;
            try { read(line); } catch (e) { error = e; }
            if (!error) continue;
            const before = [error.line, error.column], said = text => text.replace(/\r\n?|\n/g, ' ');
            let expected = before;
            if (!(before[0] && before[0] !== line.lineNo) && (before[1] || 1) === 1 && /[\r\n]/.test(line.raw)) {
              const readings = pieces.map(piece => { try { read(piece); } catch (e) { return e; } return null; });
              const shows = readings.findIndex((found, n) => found && found.code === error.code && said(found.message) === said(error.message) && (pieces[n].last || found.code !== 'P202'));
              if (shows > 0) {
                const found = readings[shows], elsewhere = found.line && found.line !== line.lineNo;
                expected = elsewhere ? [found.line, found.column || 1] : [pieces[shows].lineNo, 1];
              }
            }
            const told = mistakeAtClause(error, line, read);
            eq([source, code, place, naming, before, told.line, told.column], [source, code, place, naming, before, ...expected]);
          }
        }
      });
    }
    {
      // Expression readings: 〜に…が入っている, の答え／の長さ／の値, のN番目 and the names before them.
      const V = name => ({ kind: 'VariableRead', name, qualifier: null }), N = value => ({ kind: 'NumberLiteral', value }),
        S = value => ({ kind: 'StringLiteral', value }), B = (name, ...args) => ({ kind: 'BuiltinCall', name, args }),
        ListRead = (list, index) => ({ kind: 'ListRead', list, index }), Sensor = sensor => ({ kind: 'SensorRead', sensor });
      const NEED_IN = '「が入っている」が たりません。書き足して ください。れい：名前一覧に「あ」が入っている';
      const unreadable = part => '計算の「' + part + '」の ところが 読めません。書き方を たしかめて ください';
      const read = (source, symbols, ctx) => {
        try { return JSON.parse(stableJson(parseExpression(source, symbols, ctx))); } catch (e) { return [e.code, e.column, e.message]; }
      };
      const workWith = () => {
        const p = makeRegressionProject();
        p.projectData.variables.push({ id: 'variable-price', name: '値段', initialValue: 2 });
        p.projectData.lists.push({ id: 'list-things', name: '持ち物', items: [1, 2, 3] });
        p.components.find(c => c.name === 'マスコット').localData.lists.push({ id: 'list-bag', name: 'かばん', items: [1] });
        return p;
      };
      test('expression: a value that holds no items before に stands alone; a list, text or list value asks for が入っている', () => {
        const symbols = buildSymbols(makeRegressionProject());
        for (const [source, want, sy = symbols] of [
          ['点数に10', ['P201', 3, unreadable('に10')]],
          ['点数に10', ['P205', 6, NEED_IN], null],
          ['名前一覧に「あ」', ['P205', 9, NEED_IN]],
          ['「あい」に10', ['P205', 8, NEED_IN]],
          ['［1］に10', ['P205', 7, NEED_IN]],
          ['点数に10が入っている', B('CONTAINS', V('点数'), N(10))],
          ['名前一覧に「あ」が入っていない', { kind: 'UnaryExpression', op: 'NOT', value: B('CONTAINS', V('名前一覧'), S('あ')) }],
          ['［1、2］に1が入っている', B('CONTAINS', { kind: 'ListLiteral', items: [N(1), N(2)] }, N(1))],
          ['「あい」に「あ」が含まれている', B('CONTAINS', S('あい'), S('あ'))],
          ['点数に1が含まれていない', { kind: 'UnaryExpression', op: 'NOT', value: B('CONTAINS', V('点数'), N(1)) }],
        ]) eq([source, sy === null, read(source, sy)], [source, sy === null, want]);
      });
      const Q = (value, unit) => ({ kind: 'QuantityLiteral', value, unit }), Bin = (op, left, right) => ({ kind: 'BinaryExpression', op, left, right }),
        Actor = (name, value) => ({ kind: 'ActorQualifiedRead', actorRef: { kind: 'named', name }, value }),
        Neg = value => ({ kind: 'UnaryExpression', op: 'NEG', value }), Items = (...items) => ({ kind: 'ListLiteral', items });
      test('expression: の答え, の長さ and の値 after a value are the noun phrase unless they start the number of its 番目 or 文字目', () => {
        const symbols = buildSymbols(workWith());
        for (const [source, want, ctx] of [
          ['点数の答え', V('点数')], ['持ち物の答え', V('持ち物')], ['点数の値', V('点数')], ['名前一覧の値', V('名前一覧')],
          ['点数の答え＋1', Bin('ADD', V('点数'), N(1))],
          ['点数の長さ', B('LENGTH', V('点数'))], ['名前一覧の長さ', B('LENGTH', V('名前一覧'))],
          // (after a list the 長さ of 長さ番目 is a name; after a value surely no list it is the length)
          ['名前一覧の長さ番目', ListRead(V('名前一覧'), V('長さ'))], ['点数の長さ番目', Q(B('LENGTH', V('点数')), '番目')],
          ['点数の値番目', Q(V('点数'), '番目')], ['点数の答え番目', Q(V('点数'), '番目')],
          ['持ち物の答え番目', ListRead(V('持ち物'), Sensor('答え'))], ['持ち物の値番目', ListRead(V('持ち物'), V('値'))],
          ['持ち物の値段番目', ListRead(V('持ち物'), V('値段'))], ['持ち物の答え＋1番目', ListRead(V('持ち物'), Bin('ADD', Sensor('答え'), N(1)))],
          ['点数の答え＋持ち物の答え番目', Bin('ADD', V('点数'), ListRead(V('持ち物'), Sensor('答え')))],
          ['点数の値＋持ち物の値段番目', Bin('ADD', V('点数'), ListRead(V('持ち物'), V('値段')))],
          // (a 文字目 of a text: 答え starts its number, 値 only as the start of a name the text can read)
          ['「あい」の答え文字目', B('STRING_CHAR', S('あい'), Sensor('答え'))],
          ['「あい」の値段文字目', B('STRING_CHAR', S('あい'), V('値段'))],
          ['「あい」の値段＋1文字目', B('STRING_CHAR', S('あい'), Bin('ADD', V('値段'), N(1)))],
          ['「あい」の値文字目', ['P201', 7, unreadable('文字目')]],
          ...['args', 'binders', 'localNames', 'localVarNames', 'localListNames'].map(key =>
            ['「あい」の値札文字目', B('STRING_CHAR', S('あい'), V('値札')), { [key]: ['値札'] }]),
          ['「あい」の値札文字目', ['P201', 7, unreadable('札文字目')]],
          // (a の of a later value before the 文字目 ends the noun phrase there; a quoted の is no の)
          ['「あい」の答え＋点数の1文字目', Bin('ADD', S('あい'), B('STRING_CHAR', V('点数'), N(1)))],
          ['「あい」の答え＋「の」文字目', B('STRING_CHAR', S('あい'), Bin('ADD', Sensor('答え'), S('の')))],
          ['「あい」の答え＋「う」文字目', B('STRING_CHAR', S('あい'), Bin('ADD', Sensor('答え'), S('う')))],
        ]) eq([source, ctx ?? null, read(source, symbols, ctx)], [source, ctx ?? null, want]);
        eq(read('「あい」の値段文字目', null), ['P201', 7, unreadable('段文字目')]);
      });
      test('expression: the number of a のN番目 runs to the 番目 unless a later value surely no list owns it', () => {
        const symbols = buildSymbols(workWith());
        for (const [source, want] of [
          ['点数の1番目', ListRead(V('点数'), N(1))], ['点数の1文字目', B('STRING_CHAR', V('点数'), N(1))],
          ['点数の点数番目', ListRead(V('点数'), V('点数'))], ['点数の1＋2番目', ListRead(V('点数'), Bin('ADD', N(1), N(2)))],
          ['名前一覧の（1）番目', ListRead(V('名前一覧'), N(1))], ['名前一覧の［1］番目', ListRead(V('名前一覧'), Items(N(1)))],
          ['名前一覧の「番目」番目', ListRead(V('名前一覧'), S('番目'))],
          ['名前一覧の1番目の2文字目', B('STRING_CHAR', ListRead(V('名前一覧'), N(1)), N(2))],
          // (の中で, の中に and のあまり after a value start no list read)
          ['名前一覧の中で名前一覧の1番目がはじめて出てくる番号', B('INDEX_OF', V('名前一覧'), ListRead(V('名前一覧'), N(1)))],
          ['名前一覧の中に名前一覧の1番目が入っている', B('CONTAINS', V('名前一覧'), ListRead(V('名前一覧'), N(1)))],
          ['10÷点数のあまり＋1番目', Bin('ADD', B('余り', N(10), V('点数')), Q(N(1), '番目'))],
          ['10÷点数の余り＋1番目', Bin('ADD', B('余り', N(10), V('点数')), Q(N(1), '番目'))],
          // (after a value surely no list: an operator at the top level followed by a value with its own の gives that value the 番目)
          ['点数の点数＋名前一覧の1番目', Bin('ADD', Actor('点数', V('点数')), ListRead(V('名前一覧'), N(1)))],
          ['「あいう」の［1＋点数］＋名前一覧の2番目', Bin('ADD', Actor('あいう', Items(Bin('ADD', N(1), V('点数')))), ListRead(V('名前一覧'), N(2)))],
          ['「マスコット」のよこのばしょ＋名前一覧の2番目', Bin('ADD', Actor('マスコット', Sensor('横位置')), ListRead(V('名前一覧'), N(2)))],
          // (a sign at the start of the number is no operator; brackets and a quoted の hide what is in them)
          ['「あいう」の－点数番目', ListRead(S('あいう'), Neg(V('点数')))],
          ['「あいう」の－「マスコット」のよこのばしょ番目', ListRead(S('あいう'), Neg(Actor('マスコット', Sensor('横位置'))))],
          ['「あいう」の1－点数番目', ListRead(S('あいう'), Bin('SUB', N(1), V('点数')))],
          ['「あいう」の1＋（点数の2）番目', ListRead(S('あいう'), Bin('ADD', N(1), Actor('点数', N(2))))],
          ['「あいう」の1＋［点数の2］番目', ListRead(S('あいう'), Bin('ADD', N(1), Items(Actor('点数', N(2)))))],
          ['「あいう」の1＋「の」番目', ListRead(S('あいう'), Bin('ADD', N(1), S('の')))],
          ['「あいう」の「マスコット」のよこのばしょ番目', ListRead(S('あいう'), Actor('マスコット', Sensor('横位置')))],
          ['「マスコット」のよこのばしょ＋（1）＋名前一覧の2番目', Bin('ADD', Bin('ADD', Actor('マスコット', Sensor('横位置')), N(1)), ListRead(V('名前一覧'), N(2)))],
          ['「マスコット」のよこのばしょ＋［1］＋名前一覧の2番目', Bin('ADD', Bin('ADD', Actor('マスコット', Sensor('横位置')), Items(N(1))), ListRead(V('名前一覧'), N(2)))],
          // (a value that may be a list keeps everything up to the 番目; a 文字目's number is always everything up to it)
          ['名前一覧の点数＋マスコットのよこのばしょ番目', ListRead(V('名前一覧'), Bin('ADD', V('点数'), Actor('マスコット', Sensor('横位置'))))],
          ['（名前一覧）の点数＋マスコットのよこのばしょ番目', ListRead(V('名前一覧'), Bin('ADD', V('点数'), Actor('マスコット', Sensor('横位置'))))],
          ['「あい」の1＋点数の1文字目', B('STRING_CHAR', S('あい'), Bin('ADD', N(1), Actor('点数', N(1))))],
          ['（1）の点数＋名前一覧の1番目', ['P201', 4, unreadable('の点数＋名前一覧の1番目')]],
          ['（点数）の1', ['P201', 5, unreadable('の1')]], ['（名前一覧）の1', ['P201', 7, unreadable('の1')]],
        ]) eq([source, read(source, symbols)], [source, want]);
      });
      test('expression: which values before のN番目 are surely no list (a later value then owns the 番目) and which may be a list', () => {
        const symbols = buildSymbols(workWith());
        const shared = 'の点数＋名前一覧の1番目', own = Bin('ADD', V('点数'), Actor('名前一覧', N(1)));
        for (const [source, want, ctx, sy = symbols] of [
          // (a variable of the work or of a part and a part are surely no list; a list, a name not known and a name a
          // reading of the text may hold a list are not)
          ['点数' + shared, Bin('ADD', Actor('点数', V('点数')), ListRead(V('名前一覧'), N(1)))],
          ['HP' + shared, Bin('ADD', Actor('HP', V('点数')), ListRead(V('名前一覧'), N(1)))],
          ['マスコット' + shared, Bin('ADD', Actor('マスコット', V('点数')), ListRead(V('名前一覧'), N(1)))],
          ['持ち物' + shared, ListRead(V('持ち物'), own)], ['ふしぎ' + shared, ListRead(V('ふしぎ'), own)],
          ['点数' + shared, ListRead(V('点数'), own), undefined, null],
          ...['args', 'binders', 'localNames', 'localVarNames', 'localListNames'].map(key => ['点数' + shared, ListRead(V('点数'), own), { [key]: ['点数'] }]),
          ['リスト「点数」' + shared, ListRead({ ...V('点数'), qualifier: 'exact' }, own)],
          // (a value in （ ）: a number, a calculation, a reading, a text that names no list are surely no list)
          ['（点数）' + shared, ['P201', 5, unreadable(shared)]], ['（点数＋1）' + shared, ['P201', 7, unreadable(shared)]],
          ['（－点数）' + shared, ['P201', 6, unreadable(shared)]], ['（答え）' + shared, ['P201', 5, unreadable(shared)]],
          ['（名前一覧の長さ）' + shared, ['P201', 10, unreadable(shared)]], ['（10歩）' + shared, ['P201', 6, unreadable(shared)]],
          ['（「あ」）' + shared, ['P201', 6, unreadable(shared)]],
          ['（［1］）' + shared, ListRead(Items(N(1)), own)], ['（「名前一覧」）' + shared, ListRead(S('名前一覧'), own)],
          ['（ふしぎ）' + shared, ListRead(V('ふしぎ'), own)],
          // (a quoted name of a list of the work or of the text is read as written: its 番目 takes everything up to it)
          ['「名前一覧」の点数＋マスコットのよこのばしょ番目', ListRead(S('名前一覧'), Bin('ADD', V('点数'), Actor('マスコット', Sensor('横位置'))))],
          ['「結果」の点数＋マスコットのよこのばしょ番目', ListRead(S('結果'), Bin('ADD', V('点数'), Actor('マスコット', Sensor('横位置')))), { localListNames: ['結果'] }],
        ]) eq([source, ctx ?? null, sy === null, read(source, sy, ctx)], [source, ctx ?? null, sy === null, want]);
      });
      test('expression: a list of another part right after the part and の is told with the way to write it', () => {
        const work = workWith(), part = structuredClone(work.components.find(c => c.name === 'マスコット'));
        part.id = 'sprite-cat'; part.name = 'ねこの'; work.components.push(part);
        const symbols = buildSymbols(work), way = name => '「' + name + '」の リストの 中身は、（ ）で かこんで 書きます。れい：「' + name + '」の（かばんの1番目）';
        for (const [source, want, sy = symbols] of [
          ['「マスコット」のかばんの1番目', ['P205', 9, way('マスコット')]], ['マスコットのかばんの1番目', ['P205', 7, way('マスコット')]],
          ['「マスコット」のかばん番目', ['P205', 9, way('マスコット')]], ['「ねこの」のかばんの1番目', ['P205', 7, way('ねこの')]],
          // (written in （ ）, a list name that goes on with no の or 番目, a text that names no part and a name in 【 】 are no such list)
          ['「マスコット」の（かばんの1番目）', Actor('マスコット', ListRead(V('かばん'), N(1)))],
          ['「マスコット」のかばん＋1番目', ListRead(S('マスコット'), Bin('ADD', V('かばん'), N(1)))],
          ['「ねこの」のかばん＋1番目', ListRead(S('ねこの'), Bin('ADD', V('かばん'), N(1)))],
          ['「名前一覧」のかばんの1番目', ListRead(S('名前一覧'), Actor('かばん', N(1)))],
          ['「ボタン1」のかばんの1番目', ListRead(S('ボタン1'), Actor('かばん', N(1)))],
          ['【マスコット】のかばんの1番目', ListRead({ ...V('マスコット'), qualifier: 'exact' }, Actor('かばん', N(1)))],
          ['「マスコット」のかばんの1番目', ListRead(S('マスコット'), Actor('かばん', N(1))), null],
        ]) eq([source, sy === null, read(source, sy)], [source, sy === null, want]);
        // (a quoted name that is also the name of a list of the text is that list's)
        eq(read('「ねこの」のかばんの1番目', symbols, { localListNames: ['ねこの'] }), ListRead(S('ねこの'), Actor('かばん', N(1))));
      });
      test('expression: the search for 番目 stops at が, かつ and the like at the top level, not in （ ） or in a word of あかり that holds one', () => {
        const symbols = buildSymbols(workWith()), shape = Sensor('衣装番号');
        for (const [source, want] of [
          ['持ち物のすがたの番号番目', ListRead(V('持ち物'), shape)],
          ['すがたの番号＋持ち物のすがたの番号番目', Bin('ADD', shape, ListRead(V('持ち物'), shape))],
          ['持ち物の（1かつ2）番目', ListRead(V('持ち物'), { kind: 'LogicalExpression', op: 'AND', left: N(1), right: N(2) })],
          ['持ち物の1かつ2番目', { kind: 'LogicalExpression', op: 'AND', left: Actor('持ち物', N(1)), right: Q(N(2), '番目') }],
        ]) eq([source, read(source, symbols)], [source, want]);
      });
      test('expression: the escapes of a quoted text, and the names read before の, （ and as a value are checked as names', () => {
        const symbols = buildSymbols(workWith()), long = 'あ'.repeat(33);
        const ESCAPE = '「 」の 中の \\ の つぎには、\\ か「 か 」しか 書けません。\\ を 文字として 使う ときは \\\\ と 書きます';
        const LENGTH = '名前は 1〜32文字で つけます', BUILTIN = '「乱数」は あかりに はじめから ある 計算の 名前です。ちがう 名前に して ください';
        for (const [source, want] of [
          ['「a\\」b」', S('a」b')], ['「a\\\\b」', S('a\\b')], ['「a\\「b」', S('a「b')], ['『a\\』b』', S('a』b')],
          ['「a\\nb」', ['N103', 3, ESCAPE]], ['『a\\「b』', ['N103', 3, ESCAPE]], ['『a\\」b』', ['N103', 3, ESCAPE]],
          ['「」のよこのばしょ', ['P205', 3, 'キャラクターや 部品の 名前が 空です。「 」の 中に キャラクターや 部品の 名前を 書いて ください']],
          ['「a b」のよこのばしょ', ['P205', 0, '名前「a b」には 使えない 文字が あります。空白や 「」【】（）［］、※ を けして ください']],
          ['「' + long + '」のよこのばしょ', ['P205', 0, LENGTH]], [long + 'のよこのばしょ', ['P205', 0, LENGTH]],
          [long + '（1）', ['P205', 0, LENGTH]], [long, ['P205', 0, LENGTH]], ['リスト「' + long + '」', ['P205', 0, LENGTH]],
          ['作品の' + long, ['P205', 0, LENGTH]],
          ['（【乱数】で求めた答え）', ['P205', 0, BUILTIN]], ['（「乱数」で求めた答え）', ['P205', 0, BUILTIN]],
          ['（【計算】で求めた答え）', { kind: 'UserFunctionCall', name: '計算', args: [] }],
          ['乱数（1、2）', B('乱数', N(1), N(2))], ['あまり（10、3）', B('余り', N(10), N(3))],
          ['ふしぎ（1）', { kind: 'UserFunctionCall', name: 'ふしぎ', args: [N(1)] }],
          // (the 数 and 個数 of a list are its length, but before 番目 they are names)
          ['持ち物の数', B('LENGTH', V('持ち物'))], ['持ち物の個数', B('LENGTH', V('持ち物'))],
          ['持ち物の数＋1', Bin('ADD', B('LENGTH', V('持ち物')), N(1))],
          ['持ち物の数番目', ListRead(V('持ち物'), V('数'))], ['持ち物の個数番目', ListRead(V('持ち物'), V('個数'))],
          // (リスト「…」 reads its quoted name as a list's only there: a quoted part after it reads the part's value)
          ['（リスト「名前一覧」）＋「マスコット」のよこのばしょ＋名前一覧の2番目',
            Bin('ADD', Bin('ADD', { ...V('名前一覧'), qualifier: 'exact' }, Actor('マスコット', Sensor('横位置'))), ListRead(V('名前一覧'), N(2)))],
        ]) eq([source, read(source, symbols)], [source, want]);
        // (the list of 名前一覧の数 and 名前一覧の個数 has the place of its name)
        const work = makeRegressionProject();
        work.scripts = [{ id: 'count-script', targetId: 'sprite-1', event: 'start', source: '名前一覧の数を言う。\n名前一覧の個数を言う。' }];
        eq(Akari.buildProjectReferenceGraph(work).references.filter(r => r.name === '名前一覧').map(r => [r.sourceKey, r.binding, r.nodePath, r.range, r.line]), [
          ['script:count-script', 'name', ['body', 0, 'value', 'args', 0], { start: 0, end: 4 }, 1],
          ['script:count-script', 'name', ['body', 1, 'value', 'args', 0], { start: 11, end: 15 }, 2]]);
      });
      test('count of presses: a condition before 回 is no count, a number or a reading that is no condition is', () => {
        const ctx = { symbols: buildSymbols(makeRegressionProject()), targetId: 'sprite-1', targetType: 'sprite' };
        const notRead = (source, column) => [['P201', 1, column, '「' + source.slice(0, -1) + '」は 読めません。書き方を たしかめて ください。']];
        for (const [source, column] of [['自分が点数が1より大きい回おされるまで待つ。', 13], ['自分が（点数が1より大きい）回おされるまで待つ。', 16],
          ['自分が「マスコット」に触れている回おされるまで待つ。', 18], ['自分が「マスコット」に触れていない回おされるまで待つ。', 19],
          ['自分が赤色に触れている回おされるまで待つ。', 13], ['自分がスペースキーが押されている回おされるまで待つ。', 18],
          ['自分が自分がコピーである回おされるまで待つ。', 14], ['自分が自分が3回おされる回おされるまで待つ。', 9]]) {
          const result = parseSyntax(source, ctx);
          eq([source, result.ast, result.syntaxDiagnostics.map(d => [d.code, d.line, d.column, d.message])], [source, null, notRead(source, column)]);
        }
        for (const [source, written, kind] of [['自分が3回おされるまで待つ。', '自分が3回おされるまで待つ。', 'NumberLiteral'],
          ['自分が答え回おされるまで待つ。', '自分が（答え）回おされるまで待つ。', 'SensorRead'],
          ['自分がマウスのよこのばしょ回おされるまで待つ。', '自分が（マウスのよこのばしょ）回おされるまで待つ。', 'SensorRead'],
          ['自分が－点数回おされるまで待つ。', '自分が（－点数）回おされるまで待つ。', 'UnaryExpression']]) {
          const ast = parsed(source, ctx), condition = ast.body[0].condition;
          eq([source, formatScript(ast, { symbols: ctx.symbols }), condition.kind, condition.event, condition.count.kind], [source, written, 'EventCount', 'click', kind]);
        }
      });
      test('a range condition read in other words keeps the places of the letters it kept', () => {
        const symbols = buildSymbols(makeRegressionProject());
        const span = (startColumn, endColumn) => ({ sourceSpan: { startLine: 1, startColumn, endLine: 1, endColumn } });
        const ast = parsed('もし点数が10から20なら、10歩進む。', { symbols, targetId: 'sprite-1', targetType: 'sprite' });
        eq(formatScript(ast, { symbols }), 'もし点数が10以上で、点数が20以下なら、\n  前へ10歩進む。');
        eq(JSON.parse(stableJson(ast.body[0].condition)), {
          kind: 'LogicalExpression', op: 'AND', ...span(3, 14),
          left: { kind: 'CompareExpression', op: 'GTE', left: { ...V('点数'), ...span(3, 5) }, right: { ...N(10), ...span(6, 8) } },
          right: { kind: 'CompareExpression', op: 'LTE', left: V('点数'), right: { ...N(20), ...span(10, 12) } },
        });
        // (the subject written once and read twice has its one place in both reads)
        const work = makeRegressionProject();
        work.scripts = [{ id: 'range-script', targetId: 'sprite-1', event: 'start', source: 'もし点数が10から20なら、10歩進む。' }];
        eq(Akari.buildProjectReferenceGraph(work).references.filter(r => r.name === '点数').map(r => [r.sourceKey, r.binding, r.nodePath, r.range, r.line]), [
          ['script:range-script', 'name', ['body', 0, 'condition', 'left', 'left'], { start: 2, end: 4 }, 1],
          ['script:range-script', 'name', ['body', 0, 'condition', 'right', 'left'], { start: 2, end: 4 }, 1]]);
      });
      test('expression: a chain of steps on one value is refused with P208 at the step past expressionDepth', () => {
        const symbols = buildSymbols(workWith()), DEEP = '計算の 中に 計算が 入りすぎて います。短い 計算に 分けて ください';
        const kindOf = source => { try { return parseExpression(source, symbols).kind; } catch (e) { return [e.code, e.line, e.column, e.message]; } };
        const most = LIMITS.expressionDepth - 1;
        for (const [first, step, kind, column] of [['点数', 'の長さ', 'BuiltinCall', 387], ['点数', 'の答え', 'VariableRead', 387], ['持ち物', 'の値', 'VariableRead', 260],
          ['名前一覧', 'の1番目', 'ListRead', 517], ['1', '＋1', 'BinaryExpression', 256], ['1', '×1', 'BinaryExpression', 256],
          ['1', 'かつ1', 'LogicalExpression', 383], ['1', 'または1', 'LogicalExpression', 510]]) {
          eq([first, step, most, kindOf(first + step.repeat(most))], [first, step, most, kind]);
          eq([first, step, most + 1, kindOf(first + step.repeat(most + 1))], [first, step, most + 1, ['P208', 0, column, DEEP]]);
        }
        // (a long chain is refused at its step past the limit; in a sentence the place is in the line)
        eq(kindOf('点数' + 'の答え'.repeat(5000)), ['P208', 0, 387, DEEP]);
        const told = source => parseSyntax(source, { symbols, targetId: 'sprite-1', targetType: 'sprite' }).syntaxDiagnostics.map(d => [d.code, d.line, d.column, d.message]);
        eq(told('点数を点数' + 'の長さ'.repeat(most) + 'にする。'), []);
        eq(told('点数を点数' + 'の長さ'.repeat(most + 1) + 'にする。'), [['P208', 1, 389, DEEP]]);
        eq(told('点数を1' + '＋1'.repeat(most + 1) + 'にする。'), [['P208', 1, 259, DEEP]]);
      });
      test('expression: a mistake in a part of a value read by its own reader is told at its place in the whole value', () => {
        const work = workWith();
        work.projectData.variables.push({ id: 'variable-gaga', name: 'がが', initialValue: 0 });
        const symbols = buildSymbols(work), UNREAD = '読めない ところが あります。書き方を たしかめて ください';
        const NO_COMPARE = 'くらべる ことばが ありません。おわりに「以上」「以下」「より大きい」「より小さい」「と同じ」「とちがう」の どれかを 書いて ください。れい：点数が10と同じ';
        for (const [source, want] of [
          // (the number of a のN番目 and of a N文字目, a value in （ ）, the parts of 〜をかけた数, 〜をつなげた文字 and 今の…)
          ['持ち物の（1が2）番目', ['P205', 9, NO_COMPARE]], ['持ち物の1が2番目', ['P205', 10, NO_COMPARE]],
          ['持ち物の1＋（1が2）番目', ['P205', 11, NO_COMPARE]], ['「あい」の（1が）文字目', ['P205', 9, UNREAD]],
          ['（1が2）', ['P205', 5, NO_COMPARE]], ['（（1が2））', ['P205', 6, NO_COMPARE]], ['1＋（1が2）', ['P205', 7, NO_COMPARE]],
          ['1＋2＋（3が）', ['P205', 8, UNREAD]], ['今の（1が2）', ['P205', 7, NO_COMPARE]],
          ['（1が2）と（3が）をかけた数', ['P205', 5, NO_COMPARE]], ['（10を（1が）で割ったあまり）', ['P205', 8, UNREAD]],
          ['（「a」と（1が）をつなげた文字）', ['P205', 9, UNREAD]], ['自分が（1が）回おされる', ['P205', 7, UNREAD]],
          // (blanks of the value are counted where they are written)
          ['持ち物の 1 ＋ （1が2）番目', ['P205', 14, NO_COMPARE]],
          // (a name that holds が, written bare in the number of a 番目, is told at its first が)
          ['持ち物のががが番目', ['P205', 5, UNREAD]], ['持ち物の1ががが番目', ['P205', 7, UNREAD]],
          // (the arguments of 〜で求めた答え, the two sides of a comparison read on its own, a part in （ ） after another value)
          ['（（1が2）をわたして、【計算】で求めた答え）', ['P205', 6, NO_COMPARE]], ['（点数を（1が）として、【計算】で求めた答え）', ['P205', 8, UNREAD]],
          ['（1が）をわたして、【計算】で求めた答え', ['P205', 4, UNREAD]], ['点数を（1が）として、【計算】で求めた答え', ['P205', 7, UNREAD]],
          ['3が（1が）未満', ['P205', 6, UNREAD]], ['点数が（1が）と等しい', ['P205', 7, UNREAD]], ['（1が）が3を超えている', ['P205', 4, UNREAD]],
          ['1＋（10を（1が）で割ったあまり）', ['P205', 10, UNREAD]], ['1＋（（1が）と2をかけた数）', ['P205', 7, UNREAD]], ['1＋今の（1が）', ['P205', 8, UNREAD]],
          ['（1が）と2をかけた数', ['P205', 4, UNREAD]], ['10を（1が）で割ったあまり', ['P205', 7, UNREAD]], ['「a」と（1が）をつなげた文字', ['P205', 8, UNREAD]],
          ['1＋（点数をつなげた文字）', ['P205', 4, 'つなげる ものを 2つ いじょう、「と」で ならべます。れい：（「点数は」と点数をつなげた文字）']],
          ['（持ち物のどれか）', ['P205', 2, 'リストの 中から 1つ えらぶ ときは「持ち物の（1から持ち物の数のどれか）番目」と 書きます']],
          // (a chain of steps in （ ） counts the （ ） as one level)
          ['（点数' + 'の長さ'.repeat(LIMITS.expressionDepth - 2) + '）', 'read'],
          ['（点数' + 'の長さ'.repeat(LIMITS.expressionDepth - 1) + '）', ['P208', 385, '計算の 中に 計算が 入りすぎて います。短い 計算に 分けて ください']],
        ]) eq([source, want === 'read' ? (Array.isArray(read(source, symbols)) ? read(source, symbols) : 'read') : read(source, symbols)], [source, want]);
        // (blanks before the end and inside （ ）, an empty value and an empty part, and the nesting of （ ） at its limit)
        for (const [source, want] of [['点数が 1', ['P205', 6, NO_COMPARE]], ['（1 が）', ['P205', 5, UNREAD]], ['点数より（1 が）が大きい', ['P205', 9, UNREAD]],
          ['', ['P205', 1, '計算が 書かれて いません。数や 文字を 書いて ください。れい：10']],
          ['と「a」と「b」をつなげた文字', ['P205', 1, '計算が 書かれて いません。数や 文字を 書いて ください。れい：10']],
          ['（'.repeat(LIMITS.expressionDepth) + '1' + '）'.repeat(LIMITS.expressionDepth), ['P208', LIMITS.expressionDepth + 1, '計算の 中に 計算が 入りすぎて います。短い 計算に 分けて ください']]])
          eq([source, read(source, symbols)], [source, want]);
        eq(read('「a」と「b」をつなげた文字', symbols), B('つなぐ', S('a'), S('b')));
        eq(read('（'.repeat(LIMITS.expressionDepth - 1) + '1' + '）'.repeat(LIMITS.expressionDepth - 1), symbols), N(1));
        // (each kind of mistake keeps the line it is given, or 0, and its place: a value too deep for its tree is told at
        // the start of that value, a mistake of the made block's values at the start of the 〜で求めた答え)
        const lined = (source, ctx) => { try { parseExpression(source, symbols, ctx); return 'read'; } catch (e) { return [e.code, e.line, e.column, e.message]; } };
        const deep = levels => { let text = '1'; for (let k = 0; k < levels; k++) text = '－（' + text + '）ではない'; return text; };
        const DEEP = '計算の 中に 計算が 入りすぎて います。短い 計算に 分けて ください', PAIR = '名前と 入れる ものを「を」で つないで 書きます。れい：点数を10として、';
        for (const [source, code, column, message] of [['1＋', 'P205', 3, UNREAD], [deep(64), 'P208', 1, DEEP], ['（' + deep(64) + '）', 'P208', 2, DEEP],
          ['（'.repeat(LIMITS.expressionDepth) + '1' + '）'.repeat(LIMITS.expressionDepth), 'P208', LIMITS.expressionDepth + 1, DEEP],
          ['持ち物のどれか', 'P205', 1, 'リストの 中から 1つ えらぶ ときは「持ち物の（1から持ち物の数のどれか）番目」と 書きます'],
          ['点数をつなげた文字', 'P205', 1, 'つなげる ものを 2つ いじょう、「と」で ならべます。れい：（「点数は」と点数をつなげた文字）'],
          ['点数1として、【計算】で求めた答え', 'P205', 1, PAIR], ['2と点数1として、【計算】で求めた答えをかけた数', 'P205', 3, PAIR]])
          for (const lineNo of [undefined, 3]) eq([source.slice(0, 40), lineNo, lined(source, lineNo ? { lineNo } : {})], [source.slice(0, 40), lineNo, [code, lineNo || 0, column, message]]);
        eq(lined(deep(63)), 'read');
        // (in a sentence the places are in the line, as before)
        const told = source => parseSyntax(source, { symbols, targetId: 'sprite-1', targetType: 'sprite' }).syntaxDiagnostics.map(d => [d.code, d.line, d.column, d.message]);
        eq(told('点数を（点数をつなげた文字）にする。'), [['P205', 1, 1, 'つなげる ものを 2つ いじょう、「と」で ならべます。れい：（「点数は」と点数をつなげた文字）']]);
        eq(told('点数を' + deep(64) + 'にする。'), [['P208', 1, 1, DEEP]]);
        eq(told('持ち物の（1が2）番目を言う。'), [['P205', 1, 9, NO_COMPARE]]);
        eq(told('点数を持ち物の（1が2）番目にする。'), [['P205', 1, 12, NO_COMPARE]]);
        eq(told('点数を持ち物の1が2番目にする。'), [['P205', 1, 12, NO_COMPARE]]);
        eq(told('点数を1＋（1が）にする。'), [['P205', 1, 9, UNREAD]]);
        for (const [value, column] of [['1＋（10を（1が）で割ったあまり）', 12], ['1＋（（1が）と2をかけた数）', 9], ['（点数を（1が）として、【計算】で求めた答え）', 10],
          ['（1が）をわたして、【計算】で求めた答え', 6], ['3が（1が）未満', 9], ['点数が（1が）と等しい', 10], ['1＋今の（1が）', 11], ['（1が）と2をかけた数', 6],
          ['10を（1が）で割ったあまり', 9], ['「a」と（1が）をつなげた文字', 10], ['（（1が））', 7], ['今の（1が）', 8]])
          eq([value, told('点数を' + value + 'にする。')], [value, [['P205', 1, column, UNREAD]]]);
      });
    }
    // conditions read in other words: their parts, their places in the text, and the sentences written back
    {
      const sp = s => s ? '@' + s.startLine + ':' + s.startColumn + '-' + s.endColumn : '';
      const fmt = n => !n || typeof n !== 'object' ? JSON.stringify(n) : n.kind === 'NumberLiteral' ? n.value + sp(n.sourceSpan) : n.kind === 'StringLiteral' ? '「' + n.value + '」' + sp(n.sourceSpan) : n.kind === 'VariableRead' ? n.name + (n.qualifier ? ':' + n.qualifier : '') + sp(n.sourceSpan)
        : n.kind === 'CompareExpression' ? '(' + fmt(n.left) + ' ' + n.op + ' ' + fmt(n.right) + ')' + sp(n.sourceSpan)
        : n.kind === 'LogicalExpression' ? '(' + fmt(n.left) + ' ' + n.op + ' ' + fmt(n.right) + ')' + sp(n.sourceSpan)
        : '(' + n.kind + ' ' + Object.entries(n).filter(([k]) => !['kind','sourceSpan'].includes(k)).map(([k, v]) => k + '=' + (Array.isArray(v) ? '[' + v.map(fmt).join(',') + ']' : fmt(v))).join(' ') + ')' + sp(n.sourceSpan);
      const cond = (src) => { const r = Akari.parseSyntax(src, {}); ok(r.ast, src + ': ' + stableJson(r.syntaxDiagnostics)); const s = r.ast.body[0]; return fmt(s.condition); };
      const B = '\n  1歩進む。', FB = '\n  前へ1歩進む。';
      test('a condition with one subject is read as two conditions on that subject', () => {
        for (const [src, want] of [
          ['もし点数が1から5なら、' + B, '((点数@1:3-5 GTE 1@1:6-7) AND (点数 LTE 5@1:9-10))@1:3-12'],
          ['もし点数が10以上で20以下なら、' + B, '((点数 GTE 10) AND (点数 LTE 20))'],
          ['もし点数が10以上か5以下なら、' + B, '((点数 GTE 10) OR (点数 LTE 5))'],
          ['もし点数が10以上で、20以下なら、' + B, '((点数 GTE 10) AND (点数 LTE 20))'],
          ['もし点数が1か2なら、' + B, '((点数 EQ 1) OR (点数 EQ 2))'],
          ['もし点数が1と同じかつ点数が2と同じなら、' + B, '((点数 EQ 1) AND (点数 EQ 2))'],
          ['点数が1と同じまたは点数が2と同じあいだ、くり返す。' + B, '((点数 EQ 1) OR (点数 EQ 2))'],
          ['点数が1と同じまたは点数が2と同じ間、くり返す。' + B, '((点数 EQ 1) OR (点数 EQ 2))'],
          ['点数が1と同じまたは点数が2と同じになるまで待つ。', '((点数 EQ 1) OR (点数 EQ 2))'],
        ]) eq(cond(src), want);
      });
      test('a renamed variable is renamed once where a condition read in other words wrote it', () => {
        const work = (source) => { const p = Akari.makeDefaultProject(); p.projectData = { variables: [{ id: 'nc-score', name: '点数', initialValue: 0 }, { id: 'nc-name', name: '名前', initialValue: 0 }], lists: [] };
          p.scripts = [{ id: 'nc-body', targetId: 'stage', event: 'start', source }]; return p; };
        for (const [src, renamed, refs] of [
          ['もし点数が10以上で20以下なら、' + B, 'もしスコアが10以上で20以下なら、' + B, '点数2-4 点数2-4'],
          ['もし点数が1から5なら、' + B, 'もしスコアが1から5なら、' + B, '点数2-4 点数2-4'],
          ['もし名前が10以上で点数以下なら、' + B, 'もし名前が10以上でスコア以下なら、' + B, '名前2-4 名前2-4 点数10-12'],
          ['もし名前が1から点数なら、' + B, 'もし名前が1からスコアなら、' + B, '名前2-4 名前2-4 点数8-10'],
          ['もし名前が10以上か点数以下なら、' + B, 'もし名前が10以上かスコア以下なら、' + B, '名前2-4 名前2-4 点数10-12'],
          ['もし名前が10以上で、点数以下なら、' + B, 'もし名前が10以上で、スコア以下なら、' + B, '名前2-4 名前2-4 点数11-13'],
          ['もし名前が1か点数なら、' + B, 'もし名前が1かスコアなら、' + B, '名前2-4 名前2-4 点数7-9'],
          ['もし名前が1と同じかつ点数が2と同じなら、' + B, 'もし名前が1と同じかつスコアが2と同じなら、' + B, '名前2-4 点数11-13'],
          ['もし名前がちょうど10で、点数が3なら、' + B, 'もし名前がちょうど10で、スコアが3なら、' + B, '名前2-4 点数13-15'],
          ['もし名前が5ではなく、点数が3なら、' + B, 'もし名前が5ではなく、スコアが3なら、' + B, '名前2-4 点数11-13'],
          ['もし名前が5でなく、点数が3なら、' + B, 'もし名前が5でなく、スコアが3なら、' + B, '名前2-4 点数10-12'],
          ['もしコピーか、点数が1なら、' + B, 'もしコピーか、スコアが1なら、' + B, '点数7-9'],
          ['もし点数が5ではないなら、' + B, 'もしスコアが5ではないなら、' + B, '点数2-4'],
          ['名前が1と同じまたは点数が2と同じになるまで待つ。', '名前が1と同じまたはスコアが2と同じになるまで待つ。', '名前0-2 点数10-12'],
          ['名前が1と同じまたは点数が2と同じあいだ、くり返す。' + B, '名前が1と同じまたはスコアが2と同じあいだ、くり返す。' + B, '名前0-2 点数10-12'],
          ['点数が10になるまで待つ。', 'スコアが10になるまで待つ。', '点数0-2'],
        ]) {
          const p = work(src);
          eq(Akari.prepareResourceRename(p, 'data:nc-score', 'スコア').scripts.find((s) => s.id === 'nc-body').source, renamed);
          eq(Akari.buildProjectReferenceGraph(p).references.filter((r) => r.sourceKey.includes('nc-body')).map((r) => r.name + (r.range ? r.range.start + '-' + r.range.end : '?')).join(' '), refs);
        }
      });
      test('a condition read in other words keeps the places of the letters it kept', () => {
        for (const [src, want] of [
          ['もし点数が10ではないなら、' + B, '(UnaryExpression op="NOT" value=(点数@1:3-5 EQ 10@1:6-8))@1:3-14'],
          ['もし点数が10ではなかったら、' + B, '(UnaryExpression op="NOT" value=(点数@1:3-5 EQ 10@1:6-8))@1:3-15'],
          ['点数が10ではないあいだ、くり返す。' + B, '(UnaryExpression op="NOT" value=(点数@1:1-3 EQ 10@1:4-6))@1:1-13'],
          ['点数が10ではない間、くり返す。' + B, '(UnaryExpression op="NOT" value=(点数@1:1-3 EQ 10@1:4-6))@1:1-11'],
          ['点数が10ではなくなるまで待つ。', '(点数@1:1-3 NEQ 10@1:4-6)@1:1-14'],
          ['もし点数が5ではなく、名前が3なら、' + B, '((UnaryExpression op="NOT" value=(点数@1:3-5 EQ 5@1:6-7)) AND (名前@1:12-14 EQ 3@1:15-16)@1:12-18)@1:3-18'],
          ['もし点数が5でなく、名前が3ではないなら、' + B, '((UnaryExpression op="NOT" value=(点数@1:3-5 EQ 5@1:6-7)) AND (UnaryExpression op="NOT" value=(名前@1:11-13 EQ 3@1:14-15))@1:11-21)@1:3-21'],
          ['もし自分がコピーか、点数が1なら、' + B, '((SensorRead sensor="クローンである") OR (点数@1:11-13 EQ 1@1:14-15)@1:11-17)@1:3-17'],
          ['もし点数がちょうど10なら、' + B, '(点数@1:3-5 EQ 10@1:10-12)@1:3-14'],
          ['もし点数が「あ」ではないなら、' + B, '(UnaryExpression op="NOT" value=(点数@1:3-5 EQ 「あ」@1:6-9))@1:3-15'],
          ['もし点数が1から5なら、' + B, '((点数@1:3-5 GTE 1@1:6-7) AND (点数 LTE 5@1:9-10))@1:3-12'],
          ['点数が10と同じでなくなるまで待つ。', '(点数@1:1-3 NEQ 10@1:4-6)@1:1-16'],
          ['点数が10とちがう状態になるまで待つ。', '(点数@1:1-3 NEQ 10@1:4-6)@1:1-17'],
        ]) eq(cond(src), want);
      });
      test('kana ordering words and becomes words in a condition', () => {
        const project = Akari.makeDefaultProject();
        project.projectData = { variables: [{ id: 'kc-1', name: '点数', initialValue: 0 }, { id: 'kc-2', name: '名前', initialValue: 0 }, { id: 'kc-3', name: 'すいか', initialValue: 0 },
          { id: 'kc-4', name: '名前じゃない', initialValue: 0 }, { id: 'kc-5', name: 'ゲームオーバーになった', initialValue: 0 }, { id: 'kc-6', name: 'クリアになる', initialValue: 0 }], lists: [] };
        const symbols = Akari.buildSymbols(project);
        const read = (src, context = {}) => { const r = Akari.parseSyntax(src, { symbols, ...context }); return r.ast ? fmt(r.ast.body.find((n) => n.condition).condition) : stableJson(r.syntaxDiagnostics.map((d) => [d.code, d.line, d.message])); };
        const definition = { definitionKind: 'action', definition: { name: '手順', args: ['かず'] }, args: ['かず'] };
        for (const [src, want, context] of [
          ['もし点数が10いじょうなら、' + B, '(点数@1:3-5 GTE 10@1:6-8)@1:3-14'],
          ['もし点数が名前いじょうなら、' + B, '(点数@1:3-5 GTE 名前@1:6-8)@1:3-14'],
          ['もし点数が名前いかなら、' + B, '(点数@1:3-5 LTE 名前@1:6-8)@1:3-12'],
          ['もし点数が名前みまんなら、' + B, '(点数@1:3-5 LT 名前@1:6-8)@1:3-13'],
          ['もし点数がすいかなら、' + B, '(点数@1:3-5 EQ すいか@1:6-9)@1:3-11'],
          ['もし点数がたいかなら、' + B, '(点数@1:3-5 EQ たいか@1:6-9)@1:3-11'],
          ['もし点数が（名前）いじょうなら、' + B, '(点数@1:3-5 GTE 名前@1:6-10)@1:3-16'],
          ['点数が名前いじょうになるまで待つ。', '(点数@1:1-3 GTE 名前@1:4-6)@1:1-15'],
          ['点数が名前いじょうのあいだ、くり返す。' + B, '(点数@1:1-3 GTE 名前@1:4-6)@1:1-14'],
          ['もし点数が名前いじょうで、名前が3なら、' + B, '((点数@1:3-5 GTE 名前@1:6-8)@1:3-13 AND (名前@1:14-16 EQ 3@1:17-18)@1:14-20)@1:3-20'],
          ['もし点数が名前じゃないなら、' + B, '(点数@1:3-5 EQ 名前じゃない@1:6-12)@1:3-14'],
          ['もし点数が10じゃないなら、' + B, stableJson([['P201', 1, '「もし点数が10じゃないなら、」は 読めません。書き方を たしかめて ください。']])],
          ['もし点数がかずいじょうなら、' + B, '(点数@1:3-5 GTE かず@1:6-8)@1:3-14', definition],
          ['この中だけで使う変数【上限】を作り、最初は3にする。\nもし点数が上限いじょうなら、' + B, '(点数@2:3-5 GTE 上限@2:6-8)@2:3-14', definition],
          ['もし点数が7になったら、' + B, stableJson([['P205', 1, '「になったら」は ここでは 使えません。いまの ようすを しらべるなら「もし点数が7なら、」、そう なるまで 待つなら「点数が7になるまで待つ」のように 書きます']])],
          ['もし点数が7になるならば、' + B, stableJson([['P205', 1, '「になるならば」は ここでは 使えません。いまの ようすを しらべるなら「もし点数が7なら、」、そう なるまで 待つなら「点数が7になるまで待つ」のように 書きます']])],
          ['もしゲームオーバーになったら、' + B, stableJson([['P205', 1, '「になったら」は ここでは 使えません。いまの ようすを しらべるなら「もし点数が10なら、」、そう なるまで 待つなら「点数が10になるまで待つ」のように 書きます']])],
          ['もしゲームオーバーになったなら、' + B, stableJson([['P205', 1, '「ゲームオーバーになった」の 中身を しらべる ときは、「もし【ゲームオーバーになった】が1なら、」のように くらべる 数や 文字を 書きます']])],
          ['もしクリアになるなら、' + B, stableJson([['P205', 1, '「クリアになる」の 中身を しらべる ときは、「もし【クリアになる】が1なら、」のように くらべる 数や 文字を 書きます']])],
          ['もし点数が7になったらで、点数が3なら、' + B, stableJson([['P205', 1, '「になったら」は ここでは 使えません。いまの ようすを しらべるなら「もし点数が10なら、」、そう なるまで 待つなら「点数が10になるまで待つ」のように 書きます']])],
        ]) eq(read(src, context), want);
      });
      test('conditions and list places are written back as sentences that read back the same', () => {
        const project = Akari.makeDefaultProject(), sprite = project.components.find((c) => c.type === 'sprite');
        project.components = [{ ...sprite, id: 'fw-cat', name: 'ねこ', localData: { variables: [], lists: [{ id: 'fw-bag', name: '袋', initialValue: [] }] } }, { ...sprite, id: 'fw-star', name: '星', localData: { variables: [], lists: [] } }];
        project.projectData = { variables: [{ id: 'fw-score', name: '点数', initialValue: 0 }], lists: [{ id: 'fw-items', name: '持ち物', initialValue: [] }] };
        project.functions = [{ ownerId: 'stage', id: 'fw-fit', name: 'あてはまる', args: [], source: '1と1が同じかを答えとして返す。' }];
        project.actions = [{ ownerId: 'stage', id: 'fw-turn', name: '回る', args: ['かず', 'なまえ'], source: '何もしない。' }, { ownerId: 'stage', id: 'fw-jump', name: '跳ぶ', args: ['たかさ'], source: '何もしない。' }];
        const symbols = Akari.buildSymbols(project), context = { symbols, targetId: 'fw-cat' };
        const bare = (n) => Array.isArray(n) ? n.map(bare) : n && typeof n === 'object' ? Object.fromEntries(Object.entries(n).filter(([k]) => k !== 'sourceSpan').map(([k, v]) => [k, bare(v)])) : n;
        const tree = (src) => { const r = Akari.parseSyntax(src, context); ok(r.ast, src + ': ' + stableJson(r.syntaxDiagnostics)); return r.ast; };
        for (const [src, want, again = true] of [
          ['ねこが3回おされるまで待つ。', 'ねこが3回おされるまで待つ。'],
          ['自分が【点数】回おされるまで待つ。', '自分が【点数】回おされるまで待つ。'],
          ['もしねこが「星」にふれていれば、' + B, 'もしねこが「星」にふれていれば、' + FB],
          ['もしねこが「星」にふれていなければ、' + B, 'もしねこが「星」にふれていなければ、' + FB],
          ['ねこが「星」にふれるまで待つ。', 'ねこが「星」にふれるまで待つ。'],
          ['ねこが「星」にふれていないあいだ、くり返す。' + B, 'ねこが「星」にふれていないあいだ、くり返す。' + FB],
          ['ねこが「星」にふれているあいだ、くり返す。' + B, 'ねこが「星」にふれているあいだ、くり返す。' + FB],
          ['条件（「ねこ」の（「星」にふれている））が成り立たなくなるまで待つ。', 'ねこが「星」にふれなくなるまで待つ。'],
          ['もしねこの自分がコピーでなければ、' + B, 'もし「ねこ」の自分がコピーでなければ、' + FB],
          ['もし「ねこ」の自分がコピーであれば、' + B, 'もし「ねこ」の自分がコピーなら、' + FB],
          ['（（「ねこ」の（「星」にふれている））ではない）の値を言う。', '（条件（「ねこ」の（「星」にふれている））が成り立たない）の値を言う。'],
          ['（（「ねこ」の自分がコピーである）ではない）の値を言う。', '（条件（「ねこ」の自分がコピーである）が成り立たない）の値を言う。'],
          ['もし条件（「ねこ」のx座標が3と同じ）が成り立たないなら、' + B, 'もし「ねこ」のx座標が3と同じでなければ、' + FB],
          ['もし点数が1と同じか、ねこが「星」にふれていれば、' + B, 'もし点数が1と同じか、ねこが「星」にふれていれば、' + FB],
          ['もし点数が1で、点数が2なら、' + B, 'もし点数が1と同じで、点数が2と同じなら、' + FB],
          ['点数が1で、点数が2になるまで待つ。', '点数が1と同じで、点数が2と同じ状態になるまで待つ。'],
          ['もし【点数】が2なら、' + B, 'もし【点数】が2なら、' + FB],
          ['もし点数が【点数】なら、' + B, 'もし点数が【点数】なら、' + FB],
          ['もしおされたキーが「スペース」なら、' + B, 'もしおされたキーが「スペース」なら、' + FB],
          ['もし条件（条件の答え（あてはまる））が成り立つなら、' + B, 'もし条件（条件の答え（あてはまる））が成り立つなら、' + FB],
          ['もし条件（条件の答え（あてはまる））が成り立たないなら、' + B, 'もし条件（条件の答え（あてはまる））が成り立たないなら、' + FB],
          ['条件（条件の答え（あてはまる））が成り立たないあいだ、くり返す。' + B, '条件（条件の答え（あてはまる））が成り立たないあいだ、くり返す。' + FB],
          ['条件（条件の答え（あてはまる））が成り立つあいだ、くり返す。' + B, '条件（条件の答え（あてはまる））が成り立つあいだ、くり返す。' + FB],
          ['条件（条件の答え（あてはまる））が成り立たなくなるまで待つ。', '条件（条件の答え（あてはまる））が成り立たなくなるまで待つ。'],
          ['条件（条件の答え（あてはまる））が成り立つまで待つ。', '条件（条件の答え（あてはまる））が成り立つまで待つ。'],
          ['（（条件の答え（あてはまる））ではない）の値を言う。', '（条件（条件の答え（あてはまる））が成り立たない）の値を言う。'],
          ['条件（点数が1と同じかつ点数が2と同じ）が成り立たなくなるまで待つ。', '条件（点数が1と同じかつ点数が2と同じ）が成り立たなくなるまで待つ。'],
          ['条件（点数が1と同じかつ点数が2と同じ）が成り立たないあいだ、くり返す。' + B, '条件（点数が1と同じかつ点数が2と同じ）が成り立たないあいだ、くり返す。' + FB],
          ['条件（点数が1と同じかつ点数が2と同じ）が成り立たないなら、' + B, 'もし条件（点数が1と同じかつ点数が2と同じ）が成り立たないなら、' + FB],
          ['条件（（点数が1と同じ）ではない）が成り立たなくなるまで待つ。', '条件（点数が1と同じではない）が成り立たなくなるまで待つ。'],
          ['もし条件（（点数が1と同じ）ではない）が成り立たないなら、' + B, 'もし条件（点数が1と同じではない）が成り立たないなら、' + FB],
          ['条件（点数が1と同じまたは点数が2と同じ）が成り立つあいだ、くり返す。' + B, '点数が1と同じか、点数が2と同じであるあいだ、くり返す。' + FB],
          ['持ち物の（自分の点数）番目を消す。', '持ち物の（自分の点数）番目を消す。'],
          ['持ち物の（作品の点数）番目を消す。', '持ち物の（作品の点数）番目を消す。'],
          ['持ち物の（1から3のどれか）番目を消す。', '持ち物の（1から3のどれか）番目を消す。'],
          ['持ち物の2番目を消す。', '持ち物の2番目を消す。'],
          ['持ち物の【点数】番目を消す。', '持ち物の【点数】番目を消す。'],
          ['持ち物の（点数＋1）番目を消す。', '持ち物の（点数＋1）番目を消す。'],
          ['持ち物の（自分の点数）番目に「a」を入れる。', '持ち物の（自分の点数）番目に「a」を入れる。'],
          ['持ち物の（自分の点数）番目を「a」にかえる。', '持ち物の（自分の点数）番目を「a」にかえる。'],
          ['「a」の合図を送る。', '「a」の合図を送る。'],
          ['点数の合図を送る。', '点数の合図を送る。'],
          ['【点数】の合図を送る。', '【点数】の合図を送る。'],
          ['（答え）の合図を送る。', '（答え）の合図を送る。'],
          ['（1+2）の合図を送る。', '（1＋2）の合図を送る。'],
          ['（自分の点数）の合図を送る。', '（自分の点数）の合図を送る。'],
          ['（点数）の合図を送って、その合図で始まったことが全部終わるまで待つ。', '点数の合図を送って、その合図で始まったことが全部終わるまで待つ。'],
          ['答えを点数に入れる。', '答えを点数に入れる。'],
          ['点数を答えにする。', '答えを点数に入れる。'],
          ['答えを【新しい】という変数に入れる。', '答えを【新しい】という変数に入れる。'],
          ['持ち物を答えにする。', '持ち物を答えにする。'],
          ['袋を答えにする。', '袋を答えにする。'],
          ['マウスのx座標を点数に入れる。', '点数を「マウス」のx座標にする。'],
          ['x座標を点数に入れる。', '点数をx座標にする。'],
          ['【回る】というてじゅんを行う。', '【回る】というてじゅんを行う。'],
          ['かずを1、なまえを「a」として、【回る】というてじゅんを行う。', 'かずを1、なまえを「a」として、【回る】というてじゅんを行う。'],
          ['1をわたして、【跳ぶ】というてじゅんを行う。', '1をわたして、【跳ぶ】というてじゅんを行う。'],
          ['点数をわたして、【跳ぶ】というてじゅんを行う。', '点数をわたして、【跳ぶ】というてじゅんを行う。'],
          ['「a」をわたして、【跳ぶ】というてじゅんを行う。', '「a」をわたして、【跳ぶ】というてじゅんを行う。'],
          ['（1＋2）をわたして、【跳ぶ】というてじゅんを行う。', '（1＋2）をわたして、【跳ぶ】というてじゅんを行う。'],
          ['（1、2）をわたして、【回る】というてじゅんを行う。', '（1、2）をわたして、【回る】というてじゅんを行う。'],
          ['持ち物の（「a」と「b」をつなげた文字）番目を消す。', '持ち物の（「a」と「b」をつなげた文字）番目を消す。'],
          ['ねこが1から3のどれか回おされるまで待つ。', 'ねこが1から3のどれか回おされるまで待つ。'],
          ['自分が（1から3のどれか）回おされるまで待つ。', '自分が1から3のどれか回おされるまで待つ。'],
          ['もし持ち物の点数番目が1なら、' + B, 'もし持ち物の【点数】番目が1なら、' + FB, false],
        ]) {
          const ast = tree(src), text = Akari.formatScript(ast, { symbols });
          eq(text, want);
          if (again) eq(bare(tree(text).body), bare(ast.body));
        }
      });
      test('a line with a word that is not a comparing word is told by its line', () => {
        const project = Akari.makeDefaultProject();
        project.projectData = { variables: [{ id: 'wl-score', name: '点数', initialValue: 0 }], lists: [{ id: 'wl-items', name: '持ち物', initialValue: [] }] };
        const symbols = Akari.buildSymbols(project);
        const told = (src) => Akari.parseSyntax(src, { symbols }).syntaxDiagnostics.map((d) => [d.code, d.line, d.column, d.message]);
        const multiple = '「10の倍数」は くらべる ことばに ありません。「点数が0とちがっていて、点数÷10のあまりが0なら」のように 書きます';
        for (const [src, want] of [
          ['「a」と言う。\nもし点数が10の倍数なら、' + B, [['S301', 2, 8, multiple]]],
          ['「a」と言う。\r\n「b」と言う。\r\nもし点数が10の倍数なら、\r\n  1歩進む。', [['S301', 3, 8, multiple]]],
          ['もし点数が10の約数なら、' + B, [['S301', 1, 8, '「10の約数」は くらべる ことばに ありません。点数が 整数なら「点数が0より大きくて、10÷点数のあまりが0なら」のように 書きます']]],
          ['「a」と言う。\nもし持ち物がからっぽなら、' + B, [['S301', 2, 7, '「からっぽ」は くらべる ことばに ありません。リストが 空かを しらべる ときは「持ち物の数が0なら」のように 書きます']]],
        ]) eq(told(src), want);
      });
      test('a condition read in other words keeps its places, and a too long one is read without them', () => {
        const long = '「' + 'a'.repeat(460) + '」';
        for (const [src, want] of [
          ['もし点数が1から5ならば、' + B, '((点数@1:3-5 GTE 1@1:6-7) AND (点数 LTE 5@1:9-10))@1:3-12'],
          ['もし点数が1から5だったら、' + B, '((点数@1:3-5 GTE 1@1:6-7) AND (点数 LTE 5@1:9-10))@1:3-14'],
          ['もし答えが点数未満でなければ、' + B, '(UnaryExpression op="NOT" value=((SensorRead sensor="答え")@1:3-5 LT 点数@1:6-8)@1:3-11)@1:3-15'],
          ['もし名前がちょうど10とおなじで、名前が10とおなじでなければ、' + B, '((名前@1:3-5 EQ 10@1:10-12)@1:3-17 AND (UnaryExpression op="NOT" value=(名前@1:18-20 EQ 10@1:21-23)@1:18-27)@1:18-32)@1:3-32'],
          // a condition too long to look for its places is read without them
          ['もし点数が' + long + 'ではないなら、' + B, '(UnaryExpression op="NOT" value=(点数 EQ 「' + 'a'.repeat(460) + '」))'],
          ['もし点数が10以上で' + long + '以下なら、' + B, '((点数 GTE 10) AND (点数 LTE 「' + 'a'.repeat(460) + '」))'],
          ['もし点数が5でなく、名前が' + long + 'ではないなら、' + B, '((UnaryExpression op="NOT" value=(点数 EQ 5)) AND (UnaryExpression op="NOT" value=(名前 EQ 「' + 'a'.repeat(460) + '」)))'],
        ]) eq(cond(src), want);
      });
      test('a near sentence is offered only where it reads with the lines around it and passes the check of the work', () => {
        const project = Akari.makeDefaultProject(), sprite = project.components.find((c) => c.type === 'sprite');
        project.components = [{ ...sprite, id: 'np-cat', name: 'ねこ' }, { ...sprite, id: 'np-star', name: '星' }];
        project.projectData = { variables: [{ id: 'np-score', name: '点数', initialValue: 0 }], lists: [] };
        project.scripts = [{ id: 'np-body', targetId: 'stage', event: 'start', source: '' }, { id: 'np-cat-body', targetId: 'np-cat', event: 'start', source: '' }];
        const symbols = Akari.buildSymbols(project);
        const offered = (source, context) => Akari.parseSyntax(source, { symbols, event: 'start', ...context }).syntaxDiagnostics
          .map((d) => [d.code, d.line, d.column, (d.proposals || []).map((p) => [p.start, p.end, p.source])]);
        const cat = { targetId: 'np-cat' }, touched = 'もし「星」にふれていれば、', when = '「星」にふれたとき、';
        // a heading or a wait is not offered in place of an if that a following else belongs to
        eq(offered('もし「星」にふれたら、\n  1歩進む。\nそうでなければ、\n  2歩進む。', cat), [['P205', 1, 1, [[0, 11, touched]]]]);
        eq(offered('「a」と言う。\nもし「星」にふれたら、\n  1歩進む。\nそうでなければ、\n  2歩進む。', cat), [['P205', 2, 1, [[8, 19, touched]]]]);
        eq(offered('「a」と言う。\rもし「星」にふれたら、\r  1歩進む。\rそうでなければ、\r  2歩進む。', cat), [['P205', 2, 1, [[8, 19, touched]]]]);
        eq(offered('「a」と言う。\r\nもし「星」にふれたら、\r\n  1歩進む。\r\nそうでなければ、\r\n  2歩進む。', cat), [['P205', 2, 1, [[9, 20, touched]]]]);
        eq(offered('もし「星」にふれたら、1歩進む。\nそうでなければ、2歩進む。', cat), [['P205', 1, 1, [[0, 15, touched + '1歩進む']]]]);
        eq(offered('3回くり返す。\n  もし「星」にふれたら、1歩進む。\n  そうでなければ、2歩進む。', cat), [['P205', 2, 1, [[10, 25, touched + '1歩進む']]]]);
        // in a body of the work, a sentence is offered only when the work's check passes with it
        eq(offered('もし「星」にふれたら、\n  1歩進む。', { ...cat, key: 'script:np-cat-body' }), [['P205', 1, 1, [[0, 11, touched], [0, 11, when]]]]);
        eq(offered('もし「星」にふれたら、\n  1歩進む。', { targetId: 'stage', key: 'script:np-body' }), [['P205', 1, 1, []]]);
        // a correction is offered while another line of the work still has its own mistake
        eq(offered('もし点数が10をこえたら、「あ」と言う。\n右に90ど回る。', cat), [['P205', 1, 1, [[0, 19, 'もし点数が10より大きければ、\n  「あ」と言う']]]]);
        eq(offered('3回くり返す\n  右に90ど回って、1秒待つ。\n右に90ど回る。', cat), [['P205', 2, 1, [[9, 22, '右に90度回る。\n  1秒待つ']]]]);
      });
      test('kana ordering words after one digit and in the words of becomes are read as the ordering words', () => {
        for (const [src, want] of [
          ['もし点数が5いじょうなら、' + B, '(点数@1:3-5 GTE 5@1:6-7)@1:3-13'],
          ['もし点数が5いかなら、' + B, '(点数@1:3-5 LTE 5@1:6-7)@1:3-11'],
          ['点数が5みまんになるまで待つ。', '(点数@1:1-3 LT 5@1:4-5)@1:1-13'],
        ]) eq(cond(src), want);
        const project = Akari.makeDefaultProject();
        project.projectData = { variables: [{ id: 'kb-score', name: '点数', initialValue: 0 }], lists: [] };
        const symbols = Akari.buildSymbols(project);
        const told = (src) => Akari.parseSyntax(src, { symbols }).syntaxDiagnostics.map((d) => [d.code, d.line, d.column, d.message]);
        eq(told('もし点数が10以上になったら、' + B), [['P205', 1, 1, '「になったら」は ここでは 使えません。いまの ようすを しらべるなら「もし点数が10以上なら、」、そう なるまで 待つなら「点数が10以上になるまで待つ」のように 書きます']]);
        eq(told('もし点数がたいかになったら、' + B), [['P205', 1, 1, '「になったら」は ここでは 使えません。いまの ようすを しらべるなら「もし点数がたいかなら、」、そう なるまで 待つなら「点数がたいかになるまで待つ」のように 書きます']]);
        eq(told('点数がたいかになったら、1歩進む。'), [['P205', 1, 1, '「点数がたいかになったら、」は、いくつかの 意味に とれます。いま しらべるなら「もし点数がたいかなら、」、そう なるまで 待つなら「点数がたいかになるまで待つ。」、そうなる たびに するなら 名人の本文で「点数がたいかになったとき、」と 書きます']]);
        eq(told('点数が10いじょうになったら、1歩進む。'), [['P205', 1, 1, '「点数が10いじょうになったら、」は、いくつかの 意味に とれます。いま しらべるなら「もし点数が10以上なら、」、そう なるまで 待つなら「点数が10以上になるまで待つ。」、そうなる たびに するなら 名人の本文で「点数が10いじょうになったとき、」と 書きます']]);
      });
      test('a range with どれか is not read, and a state word holding は keeps its subject when written back', () => {
        // 1からどれか is not a range: no reading of it as 1以上で、どれか以下
        eq(Akari.parseSyntax('もし点数が1からどれかなら、' + B, {}).syntaxDiagnostics.map((d) => [d.code, d.line, d.message]),
          [['P201', 1, '「もし点数が1からどれかなら、」は 読めません。書き方を たしかめて ください。']]);
        // a state word holding は that also reads as a part and that part's value keeps its subject (〜を…にする)
        const project = Akari.makeDefaultProject(), sprite = project.components.find((c) => c.type === 'sprite');
        project.components = [{ ...sprite, id: 'sw-new', name: '新しい' }, { ...sprite, id: 'sw-ike', name: 'いけい' }];
        project.projectData = { variables: [{ id: 'sw-score', name: '点数', initialValue: 0 }], lists: [] };
        const symbols = Akari.buildSymbols(project), context = { symbols, targetId: 'sw-new' };
        for (const source of ['点数を新しいはいけいの名前にする。', '新しいはいけいの名前を点数に入れる。']) {
          const ast = Akari.parseSyntax(source, context).ast, text = Akari.formatScript(ast, { symbols });
          eq(text, '点数を新しいはいけいの名前にする。');
          eq(ast.body[0].value.kind + ' ' + ast.body[0].value.sensor, 'SensorRead 新しい背景名');
          eq(Akari.parseSyntax(text, context).ast.body[0].value.sensor, '新しい背景名');
        }
      });
      test('a near sentence whose own lines still do not read is not offered', () => {
        // a near sentence whose own lines still do not read is not offered
        const near = (source) => Akari.parseSyntax(source, {}).syntaxDiagnostics.map((d) => [d.code, d.line, d.column, d.message, d.proposals]);
        eq(near('くり返す'), [['P205', 1, 1, '何回 くり返すかを 書きます。れい：10回くり返す。ずっと くり返すときは「ずっとくり返す。」と 書きます', []]]);
        eq(near('3回進んで、回る。'), [['P205', 1, 1, 'どこまでを くり返すのか 分かりません。えらんで ください', []]]);
        eq(near('\nくり返す'), [['P205', 2, 1, '何回 くり返すかを 書きます。れい：10回くり返す。ずっと くり返すときは「ずっとくり返す。」と 書きます', []]]);
      });
      test('each part of a condition joined by a comma reads its value as it does when it stands alone', () => {
        for (const [src, want] of [
          ['もし名前が10以下で、ちょうど10と同じでなければ、' + B, '((名前 LTE 10) AND (UnaryExpression op="NOT" value=(名前 EQ 10)))'],
          ['もし点数が1以上で、ちょうど10なら、' + B, '((点数 GTE 1) AND (点数 EQ 10))'],
          ['もし点数が1以上か、10ではないなら、' + B, '((点数 GTE 1) OR (UnaryExpression op="NOT" value=(点数 EQ 10)))'],
          ['もし点数が1以上で、「あ」ではないなら、' + B, '((点数 GTE 1) AND (UnaryExpression op="NOT" value=(点数 EQ 「あ」)))'],
          ['もし点数が1以上で、ちょうど－5と同じなら、' + B, '((点数 GTE 1) AND (点数 EQ (UnaryExpression op="NEG" value=5)))'],
          ['もし点数が1以上で、ちょうど「あ」と同じなら、' + B, '((点数 GTE 1) AND (点数 EQ 「あ」))'],
          ['もし点数が1以上か、ちょうど（1＋2）なら、' + B, '((点数 GTE 1) OR (点数 EQ (BinaryExpression op="ADD" left=1 right=2)))'],
          ['点数が1以上で、ちょうど5ではないあいだ、くり返す。' + B, '((点数 GTE 1) AND (UnaryExpression op="NOT" value=(点数 EQ 5)))'],
          ['もし点数がちょうど「あ」なら、' + B, '(点数@1:3-5 EQ 「あ」@1:10-13)@1:3-15'],
          ['もし点数がちょうど（1＋2）なら、' + B, '(点数@1:3-5 EQ (BinaryExpression op="ADD" left=1@1:11-12 right=2@1:13-14)@1:10-15)@1:3-17'],
        ]) eq(cond(src), want);
        const work = (source) => { const p = Akari.makeDefaultProject(); p.projectData = { variables: [{ id: 'cp-score', name: '点数', initialValue: 0 }, { id: 'cp-name', name: '名前', initialValue: 0 }], lists: [] };
          p.scripts = [{ id: 'cp-body', targetId: 'stage', event: 'start', source }]; return p; };
        for (const [src, renamed, refs] of [
          ['もし点数が1以上で、ちょうど10なら、' + B, 'もしスコアが1以上で、ちょうど10なら、' + B, '点数2-4 点数2-4'],
          ['もし点数が1以上で、ちょうど【名前】と同じなら、' + B, 'もしスコアが1以上で、ちょうど【名前】と同じなら、' + B, '点数2-4 点数2-4 名前14-18'],
          ['もし点数が1以上か、【名前】ではないなら、' + B, 'もしスコアが1以上か、【名前】ではないなら、' + B, '点数2-4 点数2-4 名前10-14'],
          ['もし点数がちょうど【名前】なら、' + B, 'もしスコアがちょうど【名前】なら、' + B, '点数2-4 名前9-13'],
        ]) {
          const p = work(src);
          eq(Akari.prepareResourceRename(p, 'data:cp-score', 'スコア').scripts.find((s) => s.id === 'cp-body').source, renamed);
          eq(Akari.buildProjectReferenceGraph(p).references.filter((r) => r.sourceKey.includes('cp-body')).map((r) => r.name + (r.range ? r.range.start + '-' + r.range.end : '?')).join(' '), refs);
        }
      });
      test('a name with the kana of an ordering word before になったら is told with no condition of its own', () => {
        const project = Akari.makeDefaultProject();
        project.projectData = { variables: [{ id: 'bk-score', name: '点数', initialValue: 0 }], lists: [] };
        const symbols = Akari.buildSymbols(project);
        const told = (src) => Akari.parseSyntax(src, { symbols }).syntaxDiagnostics.map((d) => [d.code, d.line, d.column, d.message, (d.proposals || []).map((q) => q.source)]);
        eq(told('点数いじょうになったら、1歩進む。'), [['P205', 1, 1, '「点数いじょうになったら、」は、いくつかの 意味に とれます。いま しらべるなら「もし〜なら、」、そう なるまで 待つなら「〜になるまで待つ。」、そうなる たびに するなら 名人の本文で「点数いじょうになったとき、」と 書きます', []]]);
        eq(told('もし点数いかになったら、' + B), [['P205', 1, 1, '「になったら」は ここでは 使えません。いまの ようすを しらべるなら「もし点数が10なら、」、そう なるまで 待つなら「点数が10になるまで待つ」のように 書きます', []]]);
        eq(told('点数が10いじょうになったら、1歩進む。'), [['P205', 1, 1, '「点数が10いじょうになったら、」は、いくつかの 意味に とれます。いま しらべるなら「もし点数が10以上なら、」、そう なるまで 待つなら「点数が10以上になるまで待つ。」、そうなる たびに するなら 名人の本文で「点数が10いじょうになったとき、」と 書きます', ['もし点数が10以上なら、1歩進む', '点数が10以上になるまで待つ。\n1歩進む']]]);
      });
      test('a list place given as a quantity of another unit keeps its unit when written as a sentence', () => {
        const project = Akari.makeDefaultProject();
        project.projectData = { variables: [{ id: 'lp-score', name: '点数', initialValue: 0 }], lists: [{ id: 'lp-items', name: '持ち物', initialValue: [] }] };
        const symbols = Akari.buildSymbols(project);
        for (const [src, unit, want] of [['持ち物の（自分の点数）番目を消す。', '歩', '持ち物の（自分の【点数】歩）番目を消す。'], ['持ち物の（1から3のどれか）番目を消す。', '秒', '持ち物の（（1から3のどれか）秒）番目を消す。']]) {
          const ast = Akari.parseSyntax(src, { symbols }).ast;
          ast.body[0].index = { kind: 'QuantityLiteral', value: ast.body[0].index.value, unit };
          const text = Akari.formatScript(ast, { symbols });
          eq(text, want);
          eq(Akari.parseSyntax(text, { symbols }).ast.body[0].index.value.unit, unit);
        }
      });
      test('a condition read in other words keeps the place of each kept letter of a subject that repeats its first letter', () => {
        eq(cond('ああがあではないあいだ、くり返す。' + B), '(UnaryExpression op="NOT" value=(ああ@1:1-3 EQ あ@1:4-5))@1:1-12');
        eq(cond('点点が1ではなくなるまで待つ。'), '(点点@1:1-3 NEQ 1@1:4-5)@1:1-13');
      });
      test('a check of what a list holds covers its letters up to the first letter of the not in every form', () => {
        const project = Akari.makeDefaultProject();
        project.projectData = { variables: [{ id: 'ct-score', name: '点数', initialValue: 0 }], lists: [{ id: 'ct-list', name: '名前一覧', initialValue: [] }] };
        const symbols = Akari.buildSymbols(project);
        const col = (s) => s ? s.startColumn + '-' + s.endColumn : '';
        const spans = (src) => { const r = Akari.parseSyntax(src, { symbols }); ok(r.ast, src + ': ' + stableJson(r.syntaxDiagnostics)); let c = r.ast.body[0].condition, not = '';
          if (c.kind === 'LogicalExpression') c = c.right;
          if (c.kind === 'UnaryExpression') { not = col(c.sourceSpan); c = c.value; }
          return c.name + ' ' + col(c.sourceSpan) + (not ? ' not ' + not : ''); };
        for (const [src, want] of [
          ['もし名前一覧に「a」があったら、' + B, 'CONTAINS 3-16'], ['もし名前一覧に「a」があれば、' + B, 'CONTAINS 3-15'], ['もし名前一覧に「a」があるなら、' + B, 'CONTAINS 3-16'],
          ['もし名前一覧に「a」がなければ、' + B, 'CONTAINS 3-13 not 3-16'], ['もし名前一覧に「a」がなかったら、' + B, 'CONTAINS 3-13 not 3-17'], ['もし名前一覧に点数がなかったら、' + B, 'CONTAINS 3-12 not 3-16'], ['もし名前一覧に「a」がないなら、' + B, 'CONTAINS 3-13 not 3-16'],
          ['もし点数が1以上で、名前一覧に「a」がないなら、' + B, 'CONTAINS 11-21 not 11-24'],
          ['もし名前一覧に「a」が入っていれば、' + B, 'CONTAINS 3-18'], ['もし名前一覧に「a」が入っているなら、' + B, 'CONTAINS 3-19'], ['もし名前一覧に「a」が入っていたら、' + B, 'CONTAINS 3-18'],
          ['もし名前一覧に「a」が入っていなければ、' + B, 'CONTAINS 3-17 not 3-20'], ['もし名前一覧に「a」が入っていないなら、' + B, 'CONTAINS 3-17 not 3-20'], ['もし名前一覧に「a」が入っていなかったら、' + B, 'CONTAINS 3-17 not 3-21'],
          ['名前一覧に「a」があるあいだ、くり返す。' + B, 'CONTAINS 1-15'], ['名前一覧に「a」がないあいだ、くり返す。' + B, 'CONTAINS 1-11 not 1-15'],
          ['名前一覧に「a」が入っているあいだ、くり返す。' + B, 'CONTAINS 1-18'], ['名前一覧に「a」が入っていないあいだ、くり返す。' + B, 'CONTAINS 1-15 not 1-19'],
          ['名前一覧に「a」が入るまで待つ。', 'CONTAINS 1-14'],
        ]) eq(spans(src), want);
      });
      test('a kana ordering word read in other words before でなければ keeps the places of its letters', () => {
        eq(cond('もし点数が10いじょうでなければ、' + B), '(UnaryExpression op="NOT" value=(点数@1:3-5 GTE 10@1:6-8)@1:3-12)@1:3-17');
      });
    }
    {
      const symbols = buildSymbols(makeRegressionProject()), ctx = { symbols, targetId: 'sprite-1', targetType: 'sprite' };
      const written = source => { const ast = parsed(source, ctx), text = formatScript(ast, { symbols }).trim(); ok(astEquivalent(ast, parsed(text, ctx)), text); return text; };
      const told = source => parseSyntax(source, ctx).syntaxDiagnostics.map(d => [d.code, d.line, d.column]);
      // AからBのどれか as a time takes the unit on both ends; a second end that names a part's or the work's variable is in （ ）.
      test('a wait of AからBのどれか seconds is written with the unit on both ends and reads back', () => {
        for (const [source, text] of [
          ['乱数（1、3）秒待つ。', '1秒から3秒のどれか待つ。'],
          ['乱数（1、自分のHP）秒待つ。', '1秒から（自分の【HP】）秒のどれか待つ。'],
          ['乱数（1、作品の点数）秒待つ。', '1秒から（作品の【点数】）秒のどれか待つ。'],
          ['乱数（1、点数）秒待つ。', '1秒から【点数】秒のどれか待つ。'],
          ['乱数（自分のHP、3）秒待つ。', '自分の【HP】秒から3秒のどれか待つ。'],
          ['最大（1、3）秒待つ。', '（最大（1、3））秒待つ。'],
        ]) eq([source, written(source)], [source, text]);
      });
      // A note written left of the sentences of a repeat belongs to the repeat when the next sentence is one of its own, and
      // stays after it when the next sentence is written left too (blank lines between do not matter).
      test('a note written left of the lines of a repeat stays in it when its next sentence is in it', () => {
        const shape = nodes => nodes.map(node => node.body ? [node.kind, shape(node.body)] : node.kind), inside = [['Forever', ['MotionCommand', 'CommentLine', 'MotionCommand']]];
        eq(['ずっとくり返す。\n    10歩進む。\n  ※ メモ\n    20歩進む。', 'ずっとくり返す。\n  10歩進む。\n※ メモ\n  20歩進む。', 'ずっとくり返す。\n  10歩進む。\n※ メモ\n\n  20歩進む。'].map(source => shape(parsed(source).body)), [inside, inside, inside]);
        eq(['ずっとくり返す。\n  10歩進む。\n※ メモ\n20歩進む。', 'ずっとくり返す。\n  10歩進む。\n※ メモ'].map(source => shape(parsed(source).body)),
          [[['Forever', ['MotionCommand']], 'CommentLine', 'MotionCommand'], [['Forever', ['MotionCommand']], 'CommentLine']]);
      });
      // A bounce asked as もし…なら、跳ね返る is one command that covers the words from the condition to the end of the sentence.
      test('a bounce asked with a condition covers the words from the condition to the end of the sentence', () => {
        for (const [source, span] of [
          ['もし画面の端に触れているなら、跳ね返る。', [1, 3, 1, 20]],
          ['もし、画面の端に触れているなら、跳ね返る。', [1, 4, 1, 21]],
        ]) {
          const node = parsed(source, ctx).body[0];
          eq([source, node.kind, [node.sourceSpan.startLine, node.sourceSpan.startColumn, node.sourceSpan.endLine, node.sourceSpan.endColumn]], [source, 'MotionCommand', span]);
        }
      });
      // A line read again as 〜して、 tells the mistake found after its first 、 at its place, and the line as written otherwise.
      test('a mistake after the first 、 of a sentence read as 〜して、 is told at its place, on the physical line it is on', () => {
        for (const [source, place] of [
          ['10歩進み、点数を（1＋）にする。', ['P205', 1, 12]],
          ['10歩進み、＋歩進む。', ['P205', 1, 7]],
          ['「x」と言う。\n10歩進み、点数を（1＋）にする。', ['P205', 2, 12]],
          ['「x」と言う。\n「a\nb」と言い、点数を（1＋）にする。', ['P205', 3, 12]],
          ['「x」と言う。\n「a\nb」と言い、（1＋）歩進む。', ['P205', 3, 9]],
          ['「x」と言う。\n10歩進み、「a\nb」と言って、（1＋）歩進む。', ['P205', 3, 10]],
          ['「x」と言う。\n10歩進み、点数を（1＋）にして「a\nb」と言う。', ['P205', 2, 12]],
          // (a mistake just after the closing mark of a 「 」 that goes on over lines is on the second column of its row)
          ['10歩進み、「a\n」＋歩進む。', ['P205', 2, 2]],
          ['「x」と言う。\n10歩進み、「a\n」＋歩進む。', ['P205', 3, 2]],
          // (a mistake before the first 、: the line as written is told)
          ['「x」と言う。\n点数を（1＋）にし、10歩進む。', ['P201', 2, 1]],
          ['「x」と言う。\n（1＋）歩進んで「a\nb」と言い、10歩進む。', ['P201', 2, 1]],
          ['「x」と言う。\n「a\nb」と（1＋）秒言い、10歩進む。', ['P201', 2, 1]],
        ]) eq([source, told(source)], [source, [place]]);
      });
      // A column counts characters: a pair of surrogates is one, a lone surrogate is one; a line end in a 「 」 starts a row.
      test('a place after characters outside the basic plane or a line end in a 「 」 is counted in characters from its own row', () => {
        for (const [source, place] of [
          ['「\u{10000}」と言い、＋歩進む。', ['P205', 1, 8]],
          ['「\u{10FFFF}」と言い、＋歩進む。', ['P205', 1, 8]],
          ['「」と言い、＋歩進む。', ['P205', 1, 8]],
          ['「a\uDC00」と言い、＋歩進む。', ['P205', 1, 9]],
          ['「\uDBFF」と言い、＋歩進む。', ['P205', 1, 8]],
          ['「\uD800」と言い、＋歩進む。', ['P205', 1, 9]],
          ['「\uDC00\uDC00」と言い、＋歩進む。', ['P205', 1, 9]],
          ['「a\nbc」と言い、＋歩進む。', ['P205', 2, 8]],
          ['「a\rbc」と言い、＋歩進む。', ['P205', 2, 8]],
          ['「a\r\nbc」と言い、＋歩進む。', ['P205', 2, 8]],
          ['「a\n\nbc」と言い、＋歩進む。', ['P205', 3, 8]],
          ['「a\r\rbc」と言い、＋歩進む。', ['P205', 3, 8]],
          ['「a\r\n\r\nbc」と言い、＋歩進む。', ['P205', 3, 8]],
          // (a sentence after a 「 」 over two lines is told on the line it begins on)
          ['「a\nb」と言って、ぬぬを言う。', ['P205', 2, 1]],
        ]) eq([source, told(source)], [source, [place]]);
        const spans = source => parsed(source, ctx).body.map(n => [n.sourceSpan.startLine, n.sourceSpan.startColumn, n.sourceSpan.endLine, n.sourceSpan.endColumn]);
        eq(spans('「\u{10000}」と言って、10歩進む。'), [[1, 1, 1, 8], [1, 9, 1, 14]]);
        for (const end of ['\n', '\r', '\r\n']) eq(spans('「a' + end + 'bc」と言って、10歩進む。'), [[1, 1, 2, 8], [2, 9, 2, 14]]);
      });
      // A repeat written before 〜して、 (…ことを3回くり返して、) is done by the subject the sentence named before it.
      test('a repeat read in a 〜して、 chain is done by the subject named earlier in the sentence', () => {
        const actors = source => parsed(source, ctx).body.map(n => [n.kind, n.actorRef, (n.body || []).map(b => [b.kind, b.actorRef])]);
        const self = { kind: 'self' }, all = { kind: 'all' }, named = name => ({ kind: 'named', name });
        eq(actors('マスコットは「a」と言って、10歩進むことを3回くり返して、1秒待つ。'),
          [['Say', named('マスコット'), []], ['RepeatCount', named('マスコット'), [['MotionCommand', named('マスコット')]]], ['WaitTime', all, []]]);
        eq(actors('ボタン1は「a」と言って、10歩進むことを3回くり返して、1秒待つ。'),
          [['Say', named('ボタン1'), []], ['RepeatCount', named('ボタン1'), [['MotionCommand', named('ボタン1')]]], ['WaitTime', all, []]]);
        eq(actors('「a」と言って、10歩進むことを3回くり返して、1秒待つ。'),
          [['Say', self, []], ['RepeatCount', self, [['MotionCommand', self]]], ['WaitTime', all, []]]);
        eq(actors('10歩進むことをずっとくり返して、1秒待つ。'), [['Forever', self, [['MotionCommand', self]]], ['WaitTime', all, []]]);
      });
      // 〜になったら without もし has three readings; with もし, 〜になったら・〜になったとき・〜になるなら name the two meant.
      test('a sentence of 〜になったら is told with the readings it may mean, in the words written', () => {
        const both = ['もし点数が10なら、10歩進む', '点数が10になるまで待つ。\n10歩進む'];
        const ifMessage = ending => '「' + ending + '」は ここでは 使えません。いまの ようすを しらべるなら「もし点数が10なら、」、そう なるまで 待つなら「点数が10になるまで待つ」のように 書きます';
        const result = source => parseSyntax(source, ctx).syntaxDiagnostics.map(d => [d.code, d.line, d.column, d.message, (d.proposals || []).map(x => x.source)]);
        for (const [source, message] of [
          ['もし点数が10になったら、10歩進む。', ifMessage('になったら')],
          ['もし点数が10になったとき、10歩進む。', ifMessage('になったとき')],
          ['もし点数が10になるなら、10歩進む。', ifMessage('になるなら')],
          ['点数が10になったら、10歩進む。', '「点数が10になったら、」は、いくつかの 意味に とれます。いま しらべるなら「もし点数が10なら、」、そう なるまで 待つなら「点数が10になるまで待つ。」、そうなる たびに するなら 名人の本文で「点数が10になったとき、」と 書きます'],
        ]) eq([source, result(source)], [source, [['P205', 1, 1, message, both]]]);
        // (without もし, only 〜になったら has those readings)
        eq(told('点数が10になったとき、10歩進む。'), [['P201', 1, 1]]);
        // (a name of data written whole is that name)
        const p = makeRegressionProject();
        p.projectData.variables.push({ id: 'v-game-over', name: 'ゲームオーバーになった', initialValue: 0 });
        const own = { ...ctx, symbols: buildSymbols(p) };
        for (const source of ['もしゲームオーバーになったなら、10歩進む。', 'もしゲームオーバーになったとき、10歩進む。'])
          eq([source, parseSyntax(source, own).syntaxDiagnostics.map(d => [d.code, d.line, d.column, d.message])], [source, [['P205', 1, 1,
            '「ゲームオーバーになった」の 中身を しらべる ときは、「もし【ゲームオーバーになった】が1なら、」のように くらべる 数や 文字を 書きます']]]);
      });
      // A near sentence names its fix as the code writes it; a bare unknown word compared with 答え is put in 「 」.
      test('a near sentence names the fix as written back, and a bare word before が答え is quoted only when it is no value', () => {
        const result = source => parseSyntax(source, ctx).syntaxDiagnostics.map(d => [d.code, d.line, d.column, d.message, (d.proposals || []).map(x => x.source)]);
        for (const [source, message, fix] of [
          ['すがたをかえる。', 'どの すがたに するかを 書きます。つぎの すがたに する ときは「次のすがたにかえる」と 書きます', '次のすがたにかえる'],
          ['マスコットはすがたをかえる。', 'どの すがたに するかを 書きます。つぎの すがたに する ときは「マスコットは次のすがたにかえる」と 書きます', 'マスコットは次のすがたにかえる'],
          ['10歩下がる。', '後ろへ 動く ときは「後ろへ10歩動く」と 書きます', '後ろへ10歩動く'],
          ['もしりんごが答えなら、10歩進む。', '答えと くらべる ことばは「 」で かこみます。れい：もし「りんご」が答えなら、', 'もし「りんご」が答えなら、\n  前へ10歩進む'],
          ['もし＋が答えなら、10歩進む。', '答えと くらべる ことばは「 」で かこみます。れい：もし「＋」が答えなら、', 'もし「＋」が答えなら、\n  前へ10歩進む'],
        ]) eq([source, result(source)], [source, [['P205', 1, 1, message, [fix]]]]);
        // (a variable, a part or a value of a part is compared as it is)
        for (const source of ['もし点数が答えなら、10歩進む。', 'もしボタン1が答えなら、10歩進む。', 'もしマスコットが答えなら、10歩進む。', 'もし自分のHPが答えなら、10歩進む。'])
          eq([source, result(source)], [source, []]);
      });
      // Two subjects written with or without 【 】 are each named in the sentences the fix splits the line into.
      test('two subjects written in 【 】 or bare are split into a sentence each, without the brackets', () => {
        const proposals = source => parseSyntax(source, ctx).syntaxDiagnostics.map(d => [d.code, d.message, (d.proposals || []).map(x => [x.label, x.source, x.start, x.end])]);
        const message = '1つの 文に 書ける 主語は 1つです。主語ごとに 文を 分けて 書きます', fix = 'マスコットは前へ10歩進む。\nボタン1は前へ10歩進む';
        for (const [source, end] of [['マスコットとボタン1は前へ10歩進む。', 18], ['【マスコット】とボタン1は前へ10歩進む。', 20], ['マスコットと【ボタン1】は前へ10歩進む。', 20], ['【マスコット】と【ボタン1】は前へ10歩進む。', 22]])
          eq([source, proposals(source)], [source, [['P205', message, [['文を 分ける', fix, 0, end]]]]]);
      });
      // The bounce is one sentence, 画面のはしにふれていれば、はね返る: its other spellings read as it, the edge left out is told.
      test('the spellings of the bounce read as the one bounce sentence, and a bounce at a bare はし names the fix', () => {
        for (const [source, text] of [
          ['もし画面の端に触れているなら、跳ね返る。', '画面のはしにふれていれば、はね返る。'],
          ['マスコットは画面のはしにふれているなら、はね返る。', 'マスコットは画面のはしにふれていれば、はね返る。'],
          ['はね返る。', '画面のはしにふれていれば、はね返る。'],
          ['マスコットははねかえる。', 'マスコットは画面のはしにふれていれば、はね返る。'],
        ]) eq([source, written(source)], [source, text]);
        const result = source => parseSyntax(source, ctx).syntaxDiagnostics.map(d => [d.code, d.line, d.column, d.message, (d.proposals || []).map(x => x.source)]);
        const message = '画面の はしで はね返る ときは、「画面のはしにふれていれば、はね返る」と 書きます';
        for (const [source, fix] of [
          ['はしにふれたら、はね返る。', '画面のはしにふれていれば、はね返る'],
          ['マスコットは端に触れたら跳ね返る。', 'マスコットは画面のはしにふれていれば、はね返る'],
          ['もし、はしにふれているなら、はね返る。', '画面のはしにふれていれば、はね返る'],
        ]) eq([source, result(source)], [source, [['P205', 1, 1, message, [fix]]]]);
      });
      // A bare word compared with 答え or with a variable that holds text is put in 「 」; a value, a name the body knows, or
      // (名人) a part is compared as it is.
      test('a bare word compared with 答え or with a text variable is quoted, a value or a known name is not', () => {
        const p = makeRegressionProject();
        p.projectData.variables.push({ id: 'v-fruit-text', name: 'フルーツ', initialValue: 'りんご' });
        const own = { ...ctx, symbols: buildSymbols(p) }, meijin = { symbols: own.symbols, meijin: true, targetId: 'stage', targetType: 'stage' };
        const result = (source, context) => parseSyntax(source, context).syntaxDiagnostics.map(d => [d.code, d.line, d.column, d.message, (d.proposals || []).map(x => x.source)]);
        const quoted = (example, fix, word = '答え') => [['P205', 1, 1, word + 'と くらべる ことばは「 」で かこみます。れい：' + example, [fix]]];
        for (const [source, context, told] of [
          ['もし答えがりんごなら、10歩進む。', own, quoted('もし答えが「りんご」なら、', 'もし答えが「りんご」なら、\n  前へ10歩進む')],
          ['もし、答えがりんごなら、10歩進む。', own, quoted('もし答えが「りんご」なら、', 'もし答えが「りんご」なら、\n  前へ10歩進む')],
          ['もし答えがマスコットなら、10歩進む。', own, quoted('もし答えが「マスコット」なら、', 'もし答えが「マスコット」なら、\n  前へ10歩進む')],
          ['もし答えがりんごじゃないなら、10歩進む。', own, quoted('もし答えが「りんご」と同じでなければ、', 'もし答えが「りんご」と同じでなければ、\n  前へ10歩進む')],
          ['もしフルーツがぶどうなら、10歩進む。', own, quoted('もしフルーツが「ぶどう」なら、', 'もしフルーツが「ぶどう」なら、\n  前へ10歩進む', '文字')],
          ['もし答えがりんごかみかんなら、10歩進む。', own, [['P205', 1, 1, 'くらべる ことばを「 」で かこみます。どちらかと くらべる ときは「もし答えが「りんご」と同じか、答えが「みかん」と同じなら、」のように 書きます', []]]],
          ['もし答えが点数なら、10歩進む。', own, []],
          ['もし答えがタイマーなら、10歩進む。', own, []],
          ['もし答えが点数以上なら、10歩進む。', own, []],
          ['もし答えが空なら、10歩進む。', own, []],
          ['もし答えがりんごなら、10歩進む。', { ...own, localNames: ['りんご'] }, []],
          ['もし答えがりんごなら、「a」と言う。', meijin, quoted('もし答えが「りんご」なら、', 'もし答えが「りんご」なら、「a」と言う')],
          ['もし答えがマスコットなら、「a」と言う。', meijin, []],
        ]) eq([source, !!context.meijin, result(source, context)], [source, !!context.meijin, told]);
      });
      // Inside 〜とき and もし the subject takes が; おされたキー after the subject is a value, not a heading.
      test('a subject written with は inside a heading or もし is told to take が, with the fix', () => {
        const result = source => parseSyntax(source, ctx).syntaxDiagnostics.map(d => [d.code, d.line, d.column, d.message, (d.proposals || []).map(x => x.source)]);
        const when = name => '「〜とき」の 中では、だれの ことかを「' + name + 'が」と 書きます';
        for (const [source, told] of [
          ['マスコットはおされたとき、10歩進む。', [['P205', 1, 1, when('マスコット'), ['マスコットがおされたとき、10歩進む']]]],
          ['マスコットは、おされたとき、10歩進む。', [['P205', 1, 1, when('マスコット'), ['マスコットがおされたとき、10歩進む']]]],
          ['マスコットはクリックされたら、10歩進む。', [['P205', 1, 1, when('マスコット'), ['マスコットがクリックされたら、10歩進む']]]],
          ['自分はおされたとき、10歩進む。', [['P205', 1, 1, when('自分'), ['自分がおされたとき、10歩進む']]]],
          ['もしマスコットは画面のはしにふれているなら、10歩進む。', [['P205', 1, 1, '「もし」の 中では、だれの ことかを「マスコットが」と 書きます', ['もしマスコットが画面のはしにふれているなら、10歩進む']]]],
          ['マスコットはおされたキーが「a」なら、10歩進む。', [['P201', 1, 6, '「マスコットはおされたキーが「a」なら、10歩進む」は 読めません。書き方を たしかめて ください。', []]]],
        ]) eq([source, result(source)], [source, told]);
      });
      // A sentence read in another wording keeps the place where it is written, and so does each of its values.
      test('a sentence read as another wording keeps the place it is written at', () => {
        const spans = source => { const all = []; const visit = n => { if (Array.isArray(n)) n.forEach(visit); else if (n && typeof n === 'object') { if (n.sourceSpan) all.push([n.kind, n.sourceSpan.startLine, n.sourceSpan.startColumn, n.sourceSpan.endLine, n.sourceSpan.endColumn]); for (const k of Object.keys(n)) if (k !== 'sourceSpan') visit(n[k]); } }; visit(parsed(source, ctx).body); return all; };
        eq(spans('色を「赤」にする。'), [['LooksCommand', 1, 1, 1, 9], ['StringLiteral', 1, 3, 1, 6]]);
        eq(spans('10歩進んで、色を「赤」にする。'), [['MotionCommand', 1, 1, 1, 7], ['NumberLiteral', 1, 1, 1, 3], ['LooksCommand', 1, 8, 1, 16], ['StringLiteral', 1, 10, 1, 13]]);
        eq(spans('マスコットは「a」と言って、10歩進むことを3回くり返して、1秒待つ。'), [['Say', 1, 1, 1, 14], ['StringLiteral', 1, 7, 1, 10], ['RepeatCount', 1, 15, 1, 30], ['NumberLiteral', 1, 23, 1, 24],
          ['MotionCommand', 1, 15, 1, 20], ['NumberLiteral', 1, 15, 1, 17], ['WaitTime', 1, 31, 1, 35], ['NumberLiteral', 1, 31, 1, 32]]);
      });
      // Things said together are joined with つなげて言う; with a time, the joined text is said for that time.
      test('values said together are told to be joined, and with a time to be said as the joined text', () => {
        const result = source => parseSyntax(source, ctx).syntaxDiagnostics.map(d => [d.code, d.line, d.column, d.message, (d.proposals || []).map(x => x.source)]);
        const joined = 'いくつかを ならべて 言う ときは、「つなげて言う」と 書きます', timed = fix => '時間を つけて 話す ときは「' + fix + '」と 書きます';
        for (const [source, message, fix] of [
          ['「点数は」と点数を言う。', joined, '「点数は」と点数をつなげて言う'],
          ['「点数は」と点数を、言う。', joined, '「点数は」と点数をつなげて言う'],
          ['マスコットは「点数は」と点数を言う。', joined, 'マスコットは「点数は」と点数をつなげて言う'],
          ['「点数は」と点数をつなげて、言う。', joined, '「点数は」と点数をつなげて言う'],
          ['マスコットは、「a」と点数をつなげて、言う。', joined, 'マスコットは「a」と点数をつなげて言う'],
          ['「点数は」と点数を2秒言う。', timed('（「点数は」と点数をつなげた文字）を2秒話す'), '（「点数は」と点数をつなげた文字）を2秒話す'],
          ['「点数は」と点数をつなげて2秒言う。', timed('（「点数は」と点数をつなげた文字）を2秒話す'), '（「点数は」と点数をつなげた文字）を2秒話す'],
          ['「点数は」と点数を2秒つなげて言う。', timed('（「点数は」と点数をつなげた文字）を2秒話す'), '（「点数は」と点数をつなげた文字）を2秒話す'],
          ['マスコットは、「点数は」と点数を2秒言う。', timed('マスコットは（「点数は」と点数をつなげた文字）を2秒話す'), 'マスコットは（「点数は」と点数をつなげた文字）を2秒話す'],
        ]) eq([source, result(source)], [source, [['P205', 1, 1, message, [fix]]]]);
        eq(written('マスコットは、「a」と点数をつなげて言う。'), 'マスコットは「a」と点数をつなげて言う。');
      });
      // A mistake in a value is told on the physical line it is on, whichever clause of the line holds it.
      test('a mistake in a value of a clause of a line that goes on over a 「 」 is told on its own physical line', () => {
        for (const [source, place] of [
          ['「x」と言う。\n前へ（1＋）歩進んで、「a\nb」と言う。', ['P205', 2, 5]],
          ['「a\nb」と言って、前へ（1＋）歩進む。', ['P205', 2, 12]],
        ]) eq([source, told(source)], [source, [place]]);
      });
      // A sentence read in another wording after a word of order (さいしょに、 …) tells a mistake at the character written.
      test('a sentence read as another wording after a word of order tells a mistake at the place it is written', () => {
        for (const [source, place] of [
          ['さいしょに、マスコットにむかって、＋歩進む。', ['P205', 1, 18]],
          ['さいしょに、コピーを＋つつくる。', ['P205', 1, 11]],
          ['そのあと、つぎのすがたにして、＋歩進む。', ['P205', 1, 16]],
          ['つぎに、さいしょに、つぎのすがたにして、＋歩進む。', ['P205', 1, 21]],
        ]) eq([source, told(source)], [source, [place]]);
        eq(parsed('さいしょに、「a」ときく。', ctx).body.map(n => n.sourceSpan), [{ startLine: 1, startColumn: 7, endLine: 1, endColumn: 13 }]);
      });
      // The characters a sentence read again keeps are matched to the written ones however long the change is.
      test('a sentence read again keeps its places whatever the length of the words it changes', () => {
        for (const [source, place] of [
          ['さいしょに、マスコットに向かって＋歩進む。', ['P205', 1, 17]],
          ['さいしょに、マスコットにむかって、＋歩進む。', ['P205', 1, 18]],
          ['マスコットにむかって、＋歩進む。', ['P205', 1, 12]],
          ['まず、つぎのすがたにして、＋歩進む。', ['P205', 1, 14]],
          ['そのあと、つぎのすがたにして、＋歩進む。', ['P205', 1, 16]],
          ['さいしょに、つぎのすがたにして、＋歩進む。', ['P205', 1, 17]],
          ['つぎに、さいしょに、つぎのすがたにして、＋歩進む。', ['P205', 1, 21]],
          ['さいしょに、10歩進んで、つぎのすがたにして、＋歩進む。', ['P205', 1, 24]],
          ['さいしょに、「\u{10000}」と言い、つぎのすがたにして、＋歩進む。', ['P205', 1, 24]],
          ['「a\r\nb」と言い、さいしょに、つぎのすがたにして、＋歩進む。', ['P205', 2, 23]],
          ['ボタン1にむかって、10歩すすみ、＋歩進む。', ['P205', 1, 18]],
        ]) eq([source, told(source)], [source, [place]]);
        const spans = source => { const all = []; const visit = n => { if (Array.isArray(n)) n.forEach(visit); else if (n && typeof n === 'object') { if (n.sourceSpan) all.push([n.kind, n.sourceSpan.startLine, n.sourceSpan.startColumn, n.sourceSpan.endLine, n.sourceSpan.endColumn]); for (const k of Object.keys(n)) if (k !== 'sourceSpan') visit(n[k]); } }; visit(parsed(source, ctx).body); return all; };
        eq(spans('マスコットにむかって、10歩すすむ。'), [['MotionCommand', 1, 1, 1, 11], ['MotionCommand', 1, 12, 1, 18], ['NumberLiteral', 1, 12, 1, 14]]);
        eq(spans('マスコットに向かって10歩進む。'), [['MotionCommand', 1, 1, 1, 11], ['MotionCommand', 1, 11, 1, 16], ['NumberLiteral', 1, 11, 1, 13]]);
        // (the bounce read from もし…ているなら、 begins at the first word it keeps, as after a word of order)
        eq(spans('もし画面の端に触れているなら、跳ね返る。'), [['MotionCommand', 1, 3, 1, 20]]);
        eq(spans('はね返る。'), [['MotionCommand', 1, 1, 1, 5]]);
      });
      // A sentence read again begins at the first character written and ends at the last one, before a closing mark.
      test('a sentence read in another wording spans from its first written character to its last, and a later clause is told on its row', () => {
        const spans = source => parsed(source, ctx).body.map(n => [n.kind, n.sourceSpan.startLine, n.sourceSpan.startColumn, n.sourceSpan.endLine, n.sourceSpan.endColumn]);
        for (const [source, told] of [
          ['つぎのすがたにする。', [['LooksCommand', 1, 1, 1, 10]]],
          ['かくれる。', [['LooksCommand', 1, 1, 1, 5]]],
          ['ペンをおろす。', [['PenCommand', 1, 1, 1, 7]]],
          ['10歩進んで、つぎのすがたにする。', [['MotionCommand', 1, 1, 1, 7], ['LooksCommand', 1, 8, 1, 17]]],
          ['つぎのすがたにして、10歩進む。', [['LooksCommand', 1, 1, 1, 10], ['MotionCommand', 1, 11, 1, 16]]],
          ['10歩すすみます。', [['MotionCommand', 1, 1, 1, 9]]],
          ['10歩進みます。', [['MotionCommand', 1, 1, 1, 8]]],
          ['右に90度まわります。', [['MotionCommand', 1, 1, 1, 11]]],
          ['すがたをけす！', [['LooksCommand', 1, 1, 1, 7]]],
          ['10歩すすむ！', [['MotionCommand', 1, 1, 1, 7]]],
          ['「a」と言う！', [['Say', 1, 1, 1, 7]]],
          ['「a」と聞いて、10歩進む。', [['Ask', 1, 1, 1, 8], ['MotionCommand', 1, 9, 1, 14]]],
          ['「a」ときいて、10歩進む。', [['Ask', 1, 1, 1, 8], ['MotionCommand', 1, 9, 1, 14]]],
        ]) eq([source, spans(source)], [source, told]);
        for (const source of ['「a\nb」と言って、マスコットだけぬぬを言う。', '「a\nb」と言って、マスコットもぬぬを言う。']) eq([source, told(source)], [source, [['P205', 2, 1]]]);
      });
      // A sentence read with its owner's list keeps the place the clause has on the physical line it is written on.
      test('a sentence about a list of a part keeps its place after a 「 」 over lines or other characters before it', () => {
        const S = 'マスコットのかばんの1番目を点数に入れる';
        const span = source => parsed(source, ctx).body.map(n => [n.kind, n.sourceSpan.startLine, n.sourceSpan.startColumn, n.sourceSpan.endLine, n.sourceSpan.endColumn]).at(-1);
        for (const [source, place] of [
          [S + '。', ['Assignment', 1, 1, 1, 21]],
          [S + '！', ['Assignment', 1, 1, 1, 21]],
          ['「x」と言う。\n' + S + '。', ['Assignment', 2, 1, 2, 21]],
          ['「\u{10000}」と言って、' + S + '。', ['Assignment', 1, 9, 1, 29]],
          ['10歩進んで、' + S + '。', ['Assignment', 1, 8, 1, 28]],
          ['「a\nb」と言って、' + S + '。', ['Assignment', 2, 8, 2, 28]],
          ['「a\r\nb」と言って、' + S + '。', ['Assignment', 2, 8, 2, 28]],
          ['「a\nb」と言って、10歩進んで、' + S + '。', ['Assignment', 2, 15, 2, 35]],
          ['マスコットのかばんの「a\nb」番目を点数に入れる。', ['Assignment', 1, 1, 2, 12]],
        ]) eq([source, span(source)], [source, place]);
      });
      // A mistake the text written again finds at its first 、 itself is not after it: the line as written is told.
      test('a mistake found at the first 、 of a sentence read as 〜して、 tells the line as written', () => {
        for (const source of ['点数を1、にし、10歩進む。', '点数を＋、にし、10歩進む。']) eq([source, told(source)], [source, [['P201', 1, 1]]]);
      });
      // A mistake in a clause after a 「 」 that goes on over lines is told on the line that clause begins on.
      test('a mistake in a clause after a 「 」 over lines is told on the line the clause begins on, whatever reader finds it', () => {
        const N = '\n';
        for (const clause of ['マスコットは画面のはしではね返る。', 'マスコットは端に触れたら跳ね返る。', 'マスコットは画面のはしにふれたら、はね返る。', '1分待つ。', '1回転する。', '2びょう話す。',
          '2秒かけてゆっくり10歩動く。', 'マスコットのところへ1秒かけて行く。', 'マスコットは次のくり返しへ進む。', 'だんごが言い終わるまで待つ。',
          'もし点数が10になるなら、10歩進む。', 'ぶつかったら、はねる。', 'マスコットも同じ合図で動き始め、10歩進む。', '「犬に「やあ」と言う」', 'ぬぬを言う。']) {
          const code = told(clause)[0][0];
          eq([clause, told(clause)], [clause, [[code, 1, 1]]]);
          for (const [before, line] of [['「a' + N + 'b」と言って、', 2], ['「a' + N + 'b」と言う。', 2], ['10歩進んで、「a' + N + 'b」と言って、', 2], ['「a\r\nb」と言って、', 2], ['「a' + N + 'b」と言って、「c' + N + 'd」と言って、', 3]])
            eq([before + clause, told(before + clause)], [before + clause, [[code, line, 1]]]);
        }
        eq(told('「x」と言う。\n「a\nb」と言って、マスコットは画面のはしではね返る。'), [['P205', 3, 1]]);
        for (const [source, line] of [['前へ1歩進んで、右に1度回ってから、。', 1], ['「a\nb」と言って、前へ1歩進んで、右に1度回ってから、。', 2], ['「a\nb」と言う。前へ1歩進んで、右に1度回ってから、。', 2]])
          eq([source, told(source)], [source, [['P202', line, 1]]]);
        // (a sentence read again with many changes keeps its places)
        eq(told('10歩すすみ、'.repeat(200) + '＋歩進む。'), [['P205', 1, 1401]]);
        eq(told('右に90度まわり、'.repeat(200) + '＋歩進む。'), [['P205', 1, 1801]]);
        // (a mistake told with the clauses before it written into its message is of the whole line: its line is told)
        for (const clause of ['右に90どまわる。', '「やあ」としゃべる。']) {
          for (const before of ['「a\nb」と言って、', '10歩進んで、「a\nb」と言って、', '「a\nb」と言って、「c\nd」と言って、']) eq([before + clause, told(before + clause)], [before + clause, [['P205', 1, 1]]]);
          eq(told('「a\nb」と言う。' + clause), [['P205', 2, 1]]);
        }
      });
      // A mistake of a line indented with full-width spaces is told on the row its character is written on, as with the
      // same indent written with half-width spaces; on the row of the indent a full-width space is one character. A
      // sentence after one whose 「 」 goes on over lines is told the same way however far in its line is indented.
      test('a mistake of a line indented with full-width spaces is told on the row and column its character is written on', () => {
        const F = '　', symbols = buildSymbols(makeRegressionProject());
        const told = source => parseSyntax(source, { symbols, targetId: 'sprite-1', targetType: 'sprite' }).syntaxDiagnostics.map(d => [d.code, d.line, d.column]);
        // [the indented sentence, the code, the row of the mistake in it (from 0), its column after the indent on the row of
        // the indent or its column on a later row]
        const bodies = [
          ['「a\nb」と言って、ほげして、「m\nn」と言う。', 'P201', 1, 3],
          ['「a\nb\nc」と言って、ほげして、「m\nn」と言う。', 'P201', 2, 3],
          ['「a\nb」と言って、点数を（1＋）にする。', 'P205', 1, 13],
          ['「a\nb\nc」と言って、点数を（1＋）にする。', 'P205', 2, 13],
          ['ほげる、「a\nb」と言って、「m\nn」と言う。', 'P201', 0, 4],
          ['ほげして、「m\nn」と言う。', 'P201', 0, 5],
          ['「a\nb」とほげって、「m\nn」と言う。', 'P201', 1, 3],
          ['点数を（1＋）にして、「m\nn」と言う。', 'P205', 0, 6],
        ];
        let cases = 0;
        for (const [body, code, row, column] of bodies) {
          for (const head of ['作品を動かしたとき、', 'もし点数が1なら、', '3回くり返す。'])
            for (const indent of [F, F + F, F + ' ', ' ' + F]) {
              const source = head + '\n' + indent + body;
              eq([source, told(source)], [source, [[code, 2 + row, row ? column : indent.length + column]]]);
              cases++;
            }
          for (const indent of [F, F + F]) {
            const source = '作品を動かしたとき、\n' + indent + 'もし点数が1なら、\n' + indent + indent + body;
            eq([source, told(source)], [source, [[code, 3 + row, row ? column : 2 * indent.length + column]]]);
            cases++;
          }
        }
        for (const indent of ['      ', F + F + F, '  ' + F + F])
          for (const [rest, place] of [['「m\nn」と言って、ほげして、「x\ny」と言う。', ['P201', 6, 3]], ['「m\nn」と言って、点数を（1＋）にする。', ['P205', 6, 13]]]) {
            const source = '作品を動かしたとき、\n  もし点数が1なら、\n    もし点数が1なら、\n' + indent + '「a\n」と言う。' + rest;
            eq([source, told(source)], [source, [place]]);
            cases++;
          }
        // (a mistake told at the start of the clause that shows it is on the row that clause begins on)
        const clauses = ['マスコットは画面のはしではね返る。', '1分待つ。', '1回転する。', '2びょう話す。', 'マスコットは次のくり返しへ進む。', 'ぶつかったら、はねる。', '1秒待つ、1秒待つ。'];
        for (const clause of clauses) {
          for (const indent of [F, F + F, F + ' ', ' ' + F]) {
            const source = '作品を動かしたとき、\n' + indent + '「a\nb」と言って、' + clause;
            eq([source, told(source)], [source, [['P205', 3, 1]]]);
            cases++;
          }
          for (const indent of ['      ', F + F + F, '  ' + F + F]) {
            const source = '作品を動かしたとき、\n  もし点数が1なら、\n    もし点数が1なら、\n' + indent + '「a\n」と言う。「m\nn」と言って、' + clause;
            eq([source, told(source)], [source, [['P205', 6, 1]]]);
            cases++;
          }
        }
        for (const indent of ['      ', F + F + F, '  ' + F + F]) {
          const source = '作品を動かしたとき、\n  もし点数が1なら、\n    もし点数が1なら、\n' + indent + '「a\n」と言う。「m\nn」と言って、ぬぬを言う。';
          eq([source, told(source)], [source, [['P205', 6, 1]]]);
          cases++;
        }
        // (a mistake the line written again finds is told where the line as written tells it: at its start, as the clause
        // after the first 、 is not where it is)
        for (const body of ['「x\ny」と言う、「p\nq」と言い、ほげる。', '「x\ny」と言う、「p\nq」と言い、「m\nn」とほげる。'])
          for (const head of ['作品を動かしたとき、', 'もし点数が1なら、', '3回くり返す。'])
            for (const indent of [F, F + F, F + ' ', ' ' + F]) {
              const source = head + '\n' + indent + body;
              eq([source, told(source)], [source, [['P201', 2, 1]]]);
              cases++;
            }
        eq(cases, 194);
      });
      // The bounce read from もし…ているなら、 begins at 画面 (the もし is left out of what is read, as a word of order is); block
      // edits keep the whole written sentence, and a check of the sentence tells the place its reading begins.
      test('the bounce written with もし keeps its whole text through block edits and is told where its reading begins', () => {
        const S = 'もし画面の端に触れているなら、跳ね返る。';
        const session = source => { const p = makeDefaultProject(), id = p.components[0].id; p.scripts = [{ targetId: id, event: 'start', source }]; return createEditorSession('script:' + id + ':start', source, { targetId: id, event: 'start' }, p, 4); };
        const one = session(S), body = one.blockView.bodies.body;
        eq(body.map(b => b.schemaId), ['MotionCommand:BOUNCE']);
        eq([prepareBlockEdit(one, { type: 'remove', id: body[0].id }).source,
          prepareBlockEdit(one, { type: 'insert', parentId: one.blockView.id, body: 'body', index: 0, node: createBlock('NoOperation') }).source,
          prepareBlockEdit(one, { type: 'insert', parentId: one.blockView.id, body: 'body', index: 1, node: createBlock('NoOperation') }).source],
          ['', '何もしない。\n' + S, S + '\n何もしない。']);
        const two = session('10歩進む。\n' + S), both = two.blockView.bodies.body;
        eq([prepareBlockEdit(two, { type: 'move', id: both[1].id, parentId: two.blockView.id, body: 'body', index: 0 }).source,
          prepareBlockEdit(two, { type: 'remove', id: both[0].id }).source, prepareBlockEdit(two, { type: 'remove', id: both[1].id }).source],
          [S + '\n10歩進む。', S, '10歩進む。\n']);
        const stage = makeDefaultProject(); stage.scripts = [{ targetId: 'stage', event: 'start', source: S }];
        eq(compileProject(stage).errors.map(d => [d.code, d.line, d.column]), [['S304', 1, 3]]);
      });
      // A 「 」 inside a 「 」 is told on the line the inner mark is on.
      test('a 「 」 written inside a 「 」 is told on the line its inner 「 is on', () => {
        for (const [source, line] of [['「a\n「やあ」」と言う。', 2], ['「a\nb「やあ」」と言う。', 2], ['「a「やあ」」と言う。', 1], ['「a\r\n「やあ」」と言う。', 2]])
          eq([source, told(source)], [source, [['P205', line, 1]]]);
      });
      // After a 「 」 over lines, a mistake told at the start of the line is told on the line of the first clause that alone gives
      // the same code and message, and otherwise at the start of the line; a mistake with its own place is told there.
      test('after a 「 」 over lines a line-start mistake is told on the line of the first clause that alone gives it, else at the line start', () => {
        const N = '\n';
        for (const [source, told1] of [
          // (two mistakes alike: the first one written is told, as on one line)
          ['「a' + N + 'b」と言って、ぬぬを言って、「c' + N + 'd」と言って、ぬぬを言う。', [['P205', 2, 1]]],
          ['ぬぬを言って、「a' + N + 'b」と言って、ぬぬを言う。', [['P205', 1, 1]]],
          ['「a' + N + 'b」と言って、ぬぬを言って、「c' + N + 'd」と言って、マスコットは画面のはしではね返る。', [['P205', 3, 1]]],
          // (the mistake's own words in the 「 」 change nothing)
          ['「マスコットは画面のはしではね返る' + N + 'b」と言って、マスコットは画面のはしではね返る。', [['P205', 2, 1]]],
          // (a mistake found by reading the text again after a 「 」 over lines, at its place)
          ['「a' + N + 'b」と言って、マスコットにむかって、＋歩進む。', [['P205', 2, 19]]],
          ['「a b」と言って、マスコットにむかって、＋歩進む。', [['P205', 1, 22]]],
          ['「a' + N + 'b」と言って、さいしょに、マスコットにむかって、＋歩進む。', [['P205', 2, 25]]],
          ['「a' + N + 'b」と言って、「c' + N + 'd」と言って、10歩進んでください。', [['P205', 3, 1]]],
          ['「a b」と言って、「c' + N + 'd」と言って、10歩進んでください。', [['P205', 2, 1]]],
          ['「a b」と言って、「c d」と言って、10歩進んでください。', [['P205', 1, 1]]],
          // (a reading of the whole line, as several 、 of a もし, is of the line)
          ['「a' + N + 'b」と言って、もし 条件（条件の答え（あてはまる））が成り立つなら、。', [['P205', 1, 1]]],
          ['「a' + N + 'b」と言って、10歩進んで、1秒待って、もし 条件（条件の答え（あてはまる））が成り立つなら、。', [['P205', 2, 1]]],
          ['「a' + N + 'b」と言って、もしゲームオーバーになったなら、10歩進む。', [['P205', 2, 1]]],
          ['「a' + N + 'b」と言って、もしりんごが答えなら、10歩進む。', [['P205', 1, 1]]],
        ]) eq([source, told(source)], [source, told1]);
      });
      // A word of order alone, or くり返しが終わると without a repeat before it, is told on its own line.
      test('a word of order alone and くり返しが終わると without a repeat are told on their own line', () => {
        for (const [source, place] of [['まず、', ['P205', 1, 1]], ['「x」と言う。\nまず、', ['P205', 2, 1]], ['「x」と言う。\nくり返しが終わると、10歩進む。', ['P205', 2, 1]]])
          eq([source, told(source)], [source, [place]]);
      });
    }
    {
      // How the lines of a script are taken: indents, 。 between sentences, a heading's body.
      const told = (source, context = {}) => parseSyntax(source, context).syntaxDiagnostics.map(d => [d.code, d.line, d.column, d.message]);
      test('a Tab at the start of a line is told at column 1 of that line', () => {
        eq(told('何もしない\n\t何もしない'), [['P209', 2, 1, 'Tabキーでは 行の はじめを ずらせません。スペースキーで 空白を 2つ 入れます。']]);
      });
      test('a sentence not read is told on the line it starts, a place found in it stays on its line', () => {
        const unread = text => '「' + text + '」は 読めません。書き方を たしかめて ください。';
        eq(told('「あ\nい」と言って、ほげほげする。'), [['P201', 1, 1, unread('「あ\nい」と言って、ほげほげする')]]);
        eq(told('10歩動かす。\n「あ\nい」と言って、ほげほげする。'), [['P201', 2, 1, unread('「あ\nい」と言って、ほげほげする')]]);
        eq(told('ほげほげする。'), [['P201', 1, 1, unread('ほげほげする')]]);
        eq(told('点数を「あ\nい」と1 2にする。'), [['P201', 2, 3, unread('点数を「あ\nい」と1 2にする')]]);
      });
      test('a もし…のとき head and a まず before もし keep the places written for a part not read', () => {
        const symbols = buildSymbols(copy(makeRegressionProject()));
        const unreadable = '読めない ところが あります。書き方を たしかめて ください';
        eq(told('もし点数が「あ」+のとき、10歩動かす。', { symbols }), [['P205', 1, 9, unreadable]]);
        eq(told('まず、もし点数が「あ」+なら、10歩動かす。', { symbols }), [['P205', 1, 12, unreadable]]);
        eq(told('もし 点数が 「あ」+ の とき、10歩動かす。', { symbols }), [['P205', 1, 11, unreadable]]);
        // (a part not read after a もし…のとき head is told at its place in the line as written, on the row it is on)
        for (const [source, line, column] of [['もし点数が1のとき、点数を（1＋）にする。', 1, 16], ['もし点数が1のときは、点数を（1＋）にする。', 1, 17], ['もし点数が（1＋）のとき、10歩進む。', 1, 8],
          ['もし点数が1のとき、\n  点数を（1＋）にする。', 2, 8], ['もし点数が1のとき、「あ\nい」と言う。点数を（1＋）にする。', 2, 12], ['もし点数が1のとき、10歩進む。点数を（1＋）にする。', 1, 22]])
          eq([source, told(source, { symbols })], [source, [['P205', line, column, unreadable]]]);
        // (the condition of such a head ends where the words of (の)とき(は) end, as it does at なら)
        const conditionColumns = source => { const span = parseSyntax(source, { symbols }).ast.body[0].condition.sourceSpan; return [span.startColumn, span.endColumn]; };
        eq(['もし点数が1のとき、10歩進む。', 'もし点数が1のときは、10歩進む。', 'もし点数が1とき、10歩進む。'].map(conditionColumns), [[3, 10], [3, 11], [3, 9]]);
        // (a もし…のとき head with nothing to do is told so, as a もし…なら head is)
        const empty = '「もし」や「くり返す」の 中に、する ことを 書いて ください。何も しない ときは「何もしない」と 書けます。\nれい：2回くり返す。\n  「やあ」と言う。';
        for (const source of ['もし点数が1のとき', 'もし点数が1のときは', 'もし点数が1のとき、', 'もし点数が1なら、'])
          eq([source, told(source, { symbols })], [source, [['P202', 1, 1, empty]]]);
      });
      // A 「 」 written inside a 「 」 is told at the line of the inner opening mark and its first column, with the fix that
      // writes the inner marks as 『 』.
      test('a quote inside a quote is told at the line of the inner mark with the fix', () => {
        const symbols = buildSymbols(makeRegressionProject());
        const told1 = source => parseSyntax(source, { symbols }).syntaxDiagnostics.map(d => [d.code, d.line, d.column, (d.proposals || []).map(c => c.source)]);
        eq(told1('「あ「い」う」と言う。'), [['P205', 1, 1, ['「あ『い』う」と言う']]]);
        eq(told1('「あ「い\nう」え」と言う。'), [['P205', 1, 1, ['「あ『い\nう』え」と言う']]]);
        eq(told1('10歩進む。\n「あ\nい「う\nえ」お」と言う。'), [['P205', 3, 1, ['「あ\nい『う\nえ』お」と言う']]]);
      });
      // The sentences under a later heading of a text are placed on the lines of the whole text, also the ones inside a もし.
      test('the sentences inside a block under a later heading are placed on the lines of the whole text', () => {
        const symbols = buildSymbols(makeRegressionProject()), spans = [];
        const visit = node => {
          if (Array.isArray(node)) node.forEach(visit);
          else if (node && typeof node === 'object') {
            if (node.kind && node.sourceSpan) spans.push([node.kind, node.sourceSpan.startLine, node.sourceSpan.startColumn, node.sourceSpan.endLine, node.sourceSpan.endColumn].join(' '));
            for (const [key, value] of Object.entries(node)) if (key !== 'sourceSpan') visit(value);
          }
        };
        visit(parsed('作品を動かしたとき、\n  もし点数が1なら、\n    10歩進む。\nマスコットがおされたとき、\n  もし点数が1なら、\n    点数を2にする。\n    90度右に回る。', { symbols, targetId: 'sprite-1', targetType: 'sprite' }).units[0]);
        eq(spans, ['Script 4 1 7 1', 'IfStatement 5 3 5 12', 'CompareExpression 5 5 5 11', 'VariableRead 5 5 5 7', 'NumberLiteral 5 8 5 9', 'Assignment 6 5 6 12', 'NumberLiteral 6 8 6 9', 'MotionCommand 7 5 7 12', 'NumberLiteral 7 5 7 7']);
      });
      // 〜に〜を入れる for a name that is no list is told with the sentence of each fix (put at the end, or replace the one
      // at a number), with the subject written when there is one.
      test('a put into a name that is not read as a list is told with the sentence of each fix', () => {
        const symbols = buildSymbols(makeRegressionProject());
        const told1 = source => parseSyntax(source, { symbols, targetId: 'sprite-1', targetType: 'sprite' }).syntaxDiagnostics.map(d => [d.code, d.line, d.column, (d.proposals || []).map(c => [c.label, c.source, c.start, c.end]), d.draftRole]);
        const role = { kind: 'ListMutation', target: '持ち物', missing: ['operation', 'indexIfReplace'] };
        eq(told1('マスコットは、持ち物に「かさ」を入れる。'), [['P205', 1, 1, [['さいごに入れる', 'マスコットは、持ち物のさいごに「かさ」を入れる', 0, 19], ['どれかと 入れかえる（何番目かを えらぶ）', 'マスコットは、持ち物の〔番号を入れる〕番目を「かさ」にかえる', 0, 19]], role]]);
        eq(told1('持ち物に「かさ」を入れる。'), [['P205', 1, 1, [['さいごに入れる', '持ち物の最後に「かさ」を入れる', 0, 12], ['どれかと 入れかえる（何番目かを えらぶ）', '持ち物の〔番号を入れる〕番目を「かさ」にかえる', 0, 12]], role]]);
      });
      // A fix for a sentence written on the line of its heading, with a second line in it, writes that line two spaces in.
      test('a fix with a second line for a sentence on the line of its heading is written two spaces in', () => {
        const symbols = buildSymbols(makeRegressionProject());
        eq(parseSyntax('作品を動かしたとき、点数が7になったら、10歩進む。', { symbols, targetId: 'sprite-1', targetType: 'sprite' }).syntaxDiagnostics.map(d => [d.code, d.line, d.column, (d.proposals || []).map(c => [c.label, c.source, c.start, c.end])]),
          [['P205', 1, 1, [['いま そう なって いたら する', 'もし点数が7なら、10歩進む', 10, 25], ['そう なるのを 待ってから する', '点数が7になるまで待つ。\n  10歩進む', 10, 25]]]]);
      });
      test('もし…になったとき names the words written and the two readings', () => {
        const symbols = buildSymbols(copy(makeRegressionProject()));
        const told10 = ending => '「' + ending + '」は ここでは 使えません。いまの ようすを しらべるなら「もし点数が10なら、」、そう なるまで 待つなら「点数が10になるまで待つ」のように 書きます';
        for (const [source, ending] of [['もし点数が10になったとき、10歩動かす。', 'になったとき'], ['もし点数が10になったとき、\n  10歩動かす。', 'になったとき'], ['もし点数が10になったときは', 'になったときは'], ['まず、もし点数が10になったとき、10歩動かす。', 'になったとき']])
          eq([source, told(source, { symbols })], [source, [['P205', 1, 1, told10(ending)]]]);
      });
      test('名人: the subject written after a heading is the subject of the lines of its body', () => {
        const p = makeDefaultProject(), sprite = p.components.find(c => c.type === 'sprite');
        p.components = ['ねこ', 'いぬ'].map((name, i) => ({ ...structuredClone(sprite), id: i ? 'dog' : 'cat', name, costumes: [{ id: 'heading-subject-' + i, name: '顔', kind: 'text', value: 'x' }], costumeId: 'heading-subject-' + i, localData: { variables: [], lists: [] } }));
        p.projectData = { variables: [{ id: 'heading-subject-score', name: '点数', initialValue: 0 }], lists: [] };
        const context = { meijin: true, symbols: buildSymbols(p), targetId: 'meijin' };
        const named = name => ({ kind: 'named', name }), self = { kind: 'self' };
        for (const [source, heading, body] of [
          ['ねこがおされたとき、いぬは、前へ10歩進む。\n  「あ」と言う。', ['click', named('ねこ')], [['MotionCommand', named('いぬ')], ['Say', named('いぬ')]]],
          ['ねこがおされたとき、【いぬ】は、前へ10歩進む。\n  「あ」と言う。', ['click', named('ねこ')], [['MotionCommand', named('いぬ')], ['Say', named('いぬ')]]],
          ['「スタート」という合図を受けたとき、いぬは、前へ10歩進む。\n  「あ」と言う。', ['message', named('いぬ')], [['MotionCommand', self], ['Say', self]]],
          ['ねこがおされたとき、点数は、「あ」と言う。', ['click', named('ねこ')], [['Say', { kind: 'value', value: { kind: 'VariableRead', name: '点数', qualifier: null } }]]],
          ['作品を動かしたとき、ねこは、いぬは、前へ10歩進む。', ['start', named('ねこ')], [['MotionCommand', named('いぬ')]]],
          ['ねこがおされたとき、\n  いぬは、前へ10歩進む。', ['click', named('ねこ')], [['MotionCommand', named('いぬ')]]],
          ['作品を動かしたとき、ねこは、前へ10歩進む。\n  「あ」と言う。', ['start', named('ねこ')], [['MotionCommand', self], ['Say', self]]],
        ]) {
          const result = parseSyntax(source, context);
          eq([source, result.syntaxDiagnostics, result.ast && [result.ast.heading.event, result.ast.heading.actorRef], result.ast && result.ast.body.map(n => [n.kind, n.actorRef])], [source, [], heading, body]);
        }
        // (a wait after the subject is the wait of the whole flow; a もし after a variable's name takes that value as its subject)
        const score = { kind: 'value', value: { kind: 'VariableRead', name: '点数', qualifier: null } };
        for (const [source, body] of [['ねこがおされたとき、いぬは、1秒待つ。', [['WaitTime', { kind: 'all' }]]], ['ねこがおされたとき、いぬは、点数が1になるまで待つ。', [['WaitUntil', { kind: 'all' }]]], ['ねこがおされたとき、点数は、もし点数が1なら、10歩動かす。', [['IfStatement', score]]]]) {
          const result = parseSyntax(source, context);
          eq([source, result.syntaxDiagnostics, result.ast && result.ast.body.map(n => [n.kind, n.actorRef])], [source, [], body]);
        }
        eq(told('ねこがおされたとき、いぬは、次のことを同時に始める。', context), [['P202', 1, 1, '「次のことを同時に始める」の 次の 行に、同時に 始める 文を 右へ ずらして 書きます']]);
        // (自分 and a lead word before は are no part's name; それ and みんな are told)
        for (const [source, body] of [['ねこがおされたとき、自分は、10歩動かす。\n  「あ」と言う。', [['MotionCommand', self], ['Say', self]]], ['ねこがおされたとき、まずは、10歩動かす。', [['MotionCommand', self]]]]) {
          const result = parseSyntax(source, context);
          eq([source, result.syntaxDiagnostics, result.ast && result.ast.body.map(n => [n.kind, n.actorRef])], [source, [], body]);
        }
        for (const [source, message] of [['ねこがおされたとき、それは、10歩動かす。', '「それ」では、どの 部品かが 決まりません。部品の 名前を 書きます'], ['ねこがおされたとき、みんなは、10歩動かす。\n  「あ」と言う。', '「みんなは」と 書けるのは「待つ」の 文だけです。動く キャラクターや 部品の 名前を 書いて ください']])
          eq([source, told(source, context)], [source, [['P205', 1, 1, message]]]);
      });
      test('the sentences written on the heading line are the body, lined up with the lines under it', () => {
        const read = source => { const r = parseSyntax(source, {}); return [r.syntaxDiagnostics.map(d => [d.code, d.line, d.column]), r.ast && (r.ast.headingComment ?? null), r.ast && r.ast.body.map(n => [n.kind, n.sourceSpan.startLine, n.sourceSpan.startColumn, n.inlineComment])]; };
        const move = (line, column, memo = '') => ['MotionCommand', line, column, memo];
        for (const [source, expected] of [
          ['作品を動かしたとき、', [[], null, []]],
          ['作品を動かしたとき、 ※メモ\n  10歩動かす。', [[], '※メモ', [move(2, 3)]]],
          ['作品を動かしたとき、10歩動かす。右に15度回る。', [[], null, [move(1, 11), move(1, 18)]]],
          ['作品を動かしたとき、10歩動かす。右に15度回る。\n    10歩動かす。', [[], null, [move(1, 11), move(1, 18), move(2, 5)]]],
          ['作品を動かしたとき、10歩動かす。\n    右に15度回る。', [[], null, [move(1, 11), move(2, 5)]]],
          ['作品を動かしたとき、10歩動かす。\n 右に15度回る。', [[], null, [move(1, 11), move(2, 2)]]],
          ['作品を動かしたとき、10歩動かす。 ※あと\n  右に15度回る。', [[], null, [move(1, 11, '※あと'), move(2, 3)]]],
          ['作品を動かしたとき、10歩動かす。\n右に15度回る。', [[['P209', 2, 1]], null, null]],
          ['作品を動かしたとき、\n10歩動かす。', [[['P202', 2, 1]], null, null]],
        ]) eq([source, read(source)], [source, expected]);
        eq(told('作品を動かしたとき、\n10歩動かす。'), [['P202', 2, 1, '「作品を動かしたとき、」などの 次の 行は、行の はじめを 右へ ずらして 書きます']]);
      });
      test('the escapes in a quote are \\「 \\」 and \\\\; another one is told where it is', () => {
        for (const [source, value] of [['「あ\\「い」と言う。', 'あ「い'], ['「あ\\」い」と言う。', 'あ」い'], ['「あ\\\\い」と言う。', 'あ\\い'], ['『あ\\『い』と言う。', 'あ『い'], ['『あ\\』い』と言う。', 'あ』い']]) {
          const body = parsed(source).body;
          eq([source, body.length, body[0].kind, body[0].value.value], [source, 1, 'Say', value]);
        }
        for (const source of ['「あ\\い」と言う。', '「あ\\『い」と言う。', '『あ\\い』と言う。'])
          eq([source, told(source).map(d => d.slice(0, 3))], [source, [['N103', 1, 3]]]);
      });
      test('a part name before a sentence is its subject, with は が も だけ を に or in 【 】', () => {
        const p = makeDefaultProject(); p.components[0].name = 'ねこ'; p.projectData = { variables: [{ id: 'subject-score', name: '点数', initialValue: 0 }, { id: 'subject-name', name: '名前', initialValue: '' }], lists: [] };
        const context = { symbols: buildSymbols(p), targetId: 'stage', event: 'start' };
        for (const [source, as, particle] of [
          ['ねこは、10歩動かす。', 'ねこは10歩動かす。'],
          ['ねこが10歩動かす。', 'ねこは10歩動かす。', 'が'],
          ['ねこも、10歩動かす。', 'ねこは10歩動かす。'],
          ['【ねこ】は10歩動かす。', 'ねこは10歩動かす。'],
          ['【ねこ】が、10歩動かす。', 'ねこは10歩動かす。', 'が'],
          ['ねこを10歩動かす。', 'ねこは10歩動かす。'],
          ['ねこに「あ」と言わせる。', 'ねこは「あ」と言う。'],
          ['ねこは、まず、10歩動かす。', 'ねこは10歩動かす。'],
          ['ねこは、答えを点数に入れる。', 'ねこは点数を答えにする。'],
          ['ねこは点数に1を入れる。', 'ねこは点数を1にする。'],
          ['ねこが「あ」と言う。', 'ねこは「あ」と言う。', 'が'],
          ['ねこが、点数を1ふやす。', 'ねこは点数を1ふやす。', 'が'],
          ['ねこだけ10歩動かす。', 'ねこは10歩動かす。'],
          ['【ねこ】だけ10歩動かす。', 'ねこは10歩動かす。'],
          ['点数が1になるまで、ねこは待つ。', 'ねこは、点数が1になるまで待つ。'],
          ['点数が1になるまで、【ねこ】は待つ。', 'ねこは、点数が1になるまで待つ。'],
          ['答えを名前という変数に入れる。', '名前を答えにする。'],
          ['答えを【ことば】という変数に入れる。', '【ことば】を答えにする。'],
        ]) {
          const body = parsed(source, context).body, canonical = parsed(as, context).body;
          eq([source, body.length, body[0].actorRef], [source, 1, particle ? { kind: 'named', name: 'ねこ', particle } : canonical[0].actorRef]);
          ok(astEquivalent({ kind: 'Script', body }, { kind: 'Script', body: canonical }), source + ' reads as ' + as);
        }
        eq(told('ねこに「あ」と言わせた。', context), [['P201', 1, 1, '「ねこに「あ」と言わせた」は 読めません。書き方を たしかめて ください。']]);
        eq(told('ねこだけ1秒待つ。', context).map(d => d.slice(0, 3)), [['P205', 1, 1]]);
        ok(told('ねこだけ1秒待つ。', context)[0][3].startsWith('「ねこだけ」と 書いた「待つ」は 読めません。'), 'the wait of ねこだけ is told');
        eq(told('点数が1になるまで、【いぬ】は待つ。', context), [['P201', 1, 1, '「点数が1になるまで、【いぬ】は待つ」は 読めません。書き方を たしかめて ください。']]);
      });
      test('a name not written bare in 〜という変数に入れる is told to be put in 【 】; a bare one is not', () => {
        const p = makeDefaultProject(); p.projectData = { variables: [{ id: 'declared-score', name: '点数', initialValue: 0 }], lists: [] };
        const context = { symbols: buildSymbols(p), targetId: 'stage', event: 'start' }, bracket = 'この 名前は 【 】で かこんで ください。れい：【ねこの名前】';
        for (const source of ['答えをことばという変数に入れる。', '答えをねこの名前という変数に入れる。', '点数をねこの名前という変数に入れる。', '+をことばという変数に入れる。'])
          eq([source, told(source, context)], [source, [['P205', 1, 1, bracket]]]);
        for (const source of ['+をみかんという変数に入れる。', '「あ」+をみかんという変数に入れる。']) {
          const d = told(source, context);
          eq([source, d.map(x => x.slice(0, 3))], [source, [['P205', 1, 1]]]);
          ok(d[0][3] !== bracket, source + ': ' + d[0][3]);
        }
        eq(parsed('答えをみかんという変数に入れる。', context).body.map(n => [n.kind, n.target.name]), [['Assignment', 'みかん']]);
      });
      test('a data name that ends with だけ is the data, not a subject with だけ', () => {
        const p = makeDefaultProject(); p.components[0].name = 'ねこ'; p.projectData = { variables: [{ id: 'only-score', name: '点数', initialValue: 0 }, { id: 'only-cat', name: 'ねこだけ', initialValue: 0 }], lists: [] };
        const context = { symbols: buildSymbols(p), targetId: 'stage', event: 'start' };
        for (const [source, as] of [['ねこだけ+1を点数に入れる。', '点数をねこだけ+1にする。'], ['ねこだけが1なら、10歩動かす。', 'もしねこだけが1なら、10歩動かす。'], ['【ねこ】だけ10歩動かす。', 'ねこは10歩動かす。']]) {
          const body = parsed(source, context).body, canonical = parsed(as, context).body;
          ok(astEquivalent({ kind: 'Script', body }, { kind: 'Script', body: canonical }), source + ' reads as ' + as);
        }
        eq(parsed('ねこだけ+1を点数に入れる。', context).body[0].value.left, { kind: 'VariableRead', name: 'ねこだけ', qualifier: null, sourceSpan: parsed('ねこだけ+1を点数に入れる。', context).body[0].value.left.sourceSpan });
      });
      test('a state word with は in it at the start of a sentence is the state, not a subject', () => {
        const p = makeDefaultProject(); p.components[0].name = 'ねこ'; p.projectData = { variables: [{ id: 'state-score', name: '点数', initialValue: 0 }, { id: 'state-name', name: '名前', initialValue: '' }], lists: [] };
        const context = { symbols: buildSymbols(p), targetId: 'stage', event: 'start' };
        const state = { kind: 'SensorRead', sensor: '新しい背景名' };
        for (const [source, kind, actorRef] of [['新しいはいけいの名前を名前に入れる。', 'Assignment', { kind: 'self' }], ['新しいはいけいの名前を点数に入れる。', 'Assignment', { kind: 'self' }], ['ねこは、新しいはいけいの名前を点数に入れる。', 'Assignment', { kind: 'named', name: 'ねこ' }], ['新しいはいけいの名前を言う。', 'Say', { kind: 'self' }]]) {
          const node = parsed(source, context).body[0], value = { ...node.value }; delete value.sourceSpan;
          eq([source, node.kind, node.actorRef, value], [source, kind, actorRef, state]);
        }
        // (a part may be named as a state word that starts with は: written before は, it is the subject)
        const named = makeDefaultProject(); named.components[0].name = 'はいけいの番号';
        eq(parsed('はいけいの番号は10歩動かす。', { symbols: buildSymbols(named), targetId: 'stage' }).body.map(n => [n.kind, n.actorRef]), [['MotionCommand', { kind: 'named', name: 'はいけいの番号' }]]);
      });
      test('a rule that keeps moving with its speed on the next line is offered as one rule; it is not read inside もし', () => {
        const fix = (source, end) => [['2つの文を1つの「つづけて動くルール」にまとめる', source, 0, end]];
        const needsSpeed = 'ずっと 動きつづける ときは、向きと「〜秒に〜歩の速さで」を 書きます。れい：「「スペース」キーがおされているあいだ、前へ1秒に10歩の速さで動き続ける」';
        const read = source => { const r = parseSyntax(source, {}); return [r.syntaxDiagnostics.map(d => [d.code, d.line, d.column, d.message, (d.proposals || []).map(p => [p.label, p.source, p.start, p.end])]), r.ast && (r.ast.rules || []).length]; };
        for (const [source, expected] of [
          ['「右」キーがおされているあいだ、右へ動き続ける。\n1秒に200歩の速さで動かす。', [[['P205', 1, 1, needsSpeed, fix('「右」キーがおされているあいだ、右へ1秒に200歩の速さで動き続ける', 39)]], null]],
          ['「右」キーがおされているあいだ、右へ動き続ける。\n1秒に200歩の速さで動く。', [[['P205', 1, 1, needsSpeed, fix('「右」キーがおされているあいだ、右へ1秒に200歩の速さで動き続ける', 38)]], null]],
          ['「右」キーがおされているあいだ、ねこを右へ動かし続ける。\n1秒に200歩の速さで動かす。', [[['P205', 1, 1, needsSpeed, fix('「右」キーがおされているあいだ、ねこを右へ1秒に200歩の速さで動かし続ける', 43)]], null]],
          ['「右」キーがおされているあいだ、右へ動き続ける。\n  1秒に200歩の速さで動かす。', [[['P205', 1, 1, needsSpeed, []]], null]],
          ['「右」キーがおされているあいだ、右へ動き続ける。', [[['P205', 1, 1, needsSpeed, []]], null]],
          ['「右」キーがおされているあいだ、右へ1秒に200歩の速さで動き続ける。', [[], 1]],
          ['もし点数が1なら、\n  「右」キーがおされているあいだ、右へ1秒に200歩の速さで動き続ける。', [[['P205', 2, 1, 'つづけて 動く ルールは、「もし」や「くり返す」の 中には 書けません。いちばん 外に 書いて ください', []]], null]],
        ]) eq([source, read(source)], [source, expected]);
      });
      test('a memo line written left of a heading\'s body stays in the body', () => {
        for (const [source, kinds] of [['作品を動かしたとき、\n  10歩動かす。\n※メモ', ['MotionCommand', 'CommentLine']], ['作品を動かしたとき、\n  10歩動かす。\n※メモ\n  右に15度回る。', ['MotionCommand', 'CommentLine', 'MotionCommand']]]) {
          const ast = parsed(source);
          eq([source, ast.body.map(n => n.kind), ast.body[1].text], [source, kinds, 'メモ']);
        }
      });
      test('the name of what is looked at is read from the first line of the body; a body is asked for where none is written', () => {
        const p = makeDefaultProject(); p.projectData = { variables: [], lists: [{ id: 'each-list', name: '名前一覧', initialValue: ['あ'] }] };
        const context = { symbols: buildSymbols(p) }, each = '名前一覧の中身を先頭から一つずつ見て、次のことを行う。';
        const empty = '「もし」や「くり返す」の 中に、する ことを 書いて ください。何も しない ときは「何もしない」と 書けます。\nれい：2回くり返す。\n  「やあ」と言う。';
        const right = (head, line) => '「' + head + '」の 中で する 文は、次の 行の はじめを 右へ ずらして 書きます。\nれい：' + head + '\n  ' + line;
        const read = source => { const r = parseSyntax(source, context), n = r.ast && r.ast.body[0]; return [r.syntaxDiagnostics.map(d => [d.code, d.line, d.column, d.message]), n && [n.kind, n.binder, n.binderComment ?? null, (n.body || []).map(m => m.kind)]]; };
        for (const [source, expected] of [
          [each + '\n  この中では、今見ているものを【項目】と呼ぶ。 ※よびな\n  項目を言う。', [[], ['ForEach', '項目', '※よびな', ['Say']]]],
          [each + '\n  この中では、今見ているものを【項目】と呼ぶ。\n  項目を言う。\n  項目を言う。', [[], ['ForEach', '項目', null, ['Say', 'Say']]]],
          [each + '\n    この中では、今見ているものを【項目】とよぶ。\n    項目を言う。', [[], ['ForEach', '項目', null, ['Say']]]],
          [each + '\n  この中では、今見ているものを【項目】と呼ぶ。', [[['P202', 1, 1, empty]], null]],
          [each, [[['P202', 1, 1, empty]], null]],
          ['2回くり返す。', [[['P202', 1, 1, empty]], null]],
          [each + '\n項目を言う。', [[['P202', 1, 1, right(each, '項目を言う。')]], null]],
          ['2回くり返す。\n「あ」と言う。', [[['P202', 1, 1, right('2回くり返す。', '「あ」と言う。')]], null]],
          ['もし点数が1なら、\n「あ」と言う。', [[['P202', 1, 1, right('もし点数が1なら、', '「あ」と言う。')]], null]],
          [each + '\nこの中では、今見ているものを【項目】と呼ぶ。\n  項目を言う。', [[['P202', 1, 1, right(each, 'この中では、今見ているものを【項目】と呼ぶ。')]], null]],
          ['もし点数が1なら、\nそうでなければ、\n  10歩動かす。', [[['P202', 1, 1, empty]], null]],
        ]) eq([source, read(source)], [source, expected]);
        // (the name given by an outer one is read inside an inner one too)
        p.projectData.lists.push({ id: 'each-numbers', name: '数一覧', initialValue: [1] });
        const nested = each + '\n  この中では、今見ているものを【a】と呼ぶ。\n  数一覧の中身を先頭から一つずつ見て、次のことを行う。\n    この中では、今見ているものを【b】と呼ぶ。\n    aを言う。\n    bを言う。';
        const inner = parsed(nested, { symbols: buildSymbols(p) }).body[0].body[0];
        eq([inner.kind, inner.binder, inner.body.map(n => [n.kind, n.value.kind, n.value.name])], ['ForEach', 'b', [['Say', 'VariableRead', 'a'], ['Say', 'VariableRead', 'b']]]);
      });
      test('a line moved right is told by what it is', () => {
        for (const [source, line, message] of [
          ['10歩動かす。\n  10歩動かす。', 2, '前の 行と 同じ だけ 右へ ずらします。この 行の はじめの 空白を へらして ください。'],
          ['作品を動かしたとき、\n  10歩動かす。\n   10歩動かす。', 3, '前の 行と 同じ だけ 右へ ずらします。この 行の はじめの 空白を へらして ください。'],
          ['もし点数が1なら、\n  10歩動かす。\n    10歩動かす。', 3, '同じ まとまりの 文は、行の はじめの 空白の 数を そろえて ください'],
          ['もし点数が1なら、\n    10歩動かす。\n  そうでなければ、\n    10歩動かす。', 3, '「そうでなければ、」は、組に なる「もし」と 行の はじめを そろえます。この 行の はじめの 空白を へらして ください。'],
          ['もし点数が1なら、\n  もし点数が2なら、\n      10歩動かす。\n    そうでなければ、\n      10歩動かす。', 4, '「そうでなければ、」は、組に なる「もし」と 行の はじめを そろえます。この 行の はじめの 空白を へらして ください。'],
          ['10歩動かす。\n  そうでなければ、\n    10歩動かす。', 2, '「そうでなければ、」と 組になる「もし」が ありません。「もし」と 行の はじめを そろえて ください'],
          ['2回くり返す。\n  もし点数が1なら、\n    10歩動かす。\n3回くり返す。\n    10歩動かす。\n  そうでなければ、\n    10歩動かす。', 6, '「そうでなければ、」と 組になる「もし」が ありません。「もし」と 行の はじめを そろえて ください'],
          ['もし点数が1なら、\n    10歩動かす。\n  10歩動かす。', 3, 'この 行の はじめの 空白が、上の どの 行とも そろって いません。同じ まとまりに する 行と 同じ 数の 空白に して ください。'],
          ['※メモ\n  10歩動かす。', 2, 'いちばん 外の 文は、行の はじめを 右へ ずらさずに 書きます'],
        ]) eq([source, told(source)], [source, [['P209', line, 1, message]]]);
      });
      test('a script spans from the first column of its first line to its last line', () => {
        for (const [source, lines] of [['10歩動かす。', 1], ['10歩動かす。\n右に15度回る。', 2], ['作品を動かしたとき、\n  10歩動かす。\n\n', 4]])
          eq([source, parsed(source).sourceSpan], [source, { startLine: 1, startColumn: 1, endLine: lines, endColumn: 1 }]);
      });
      test('a value put into an input box keeps the box and the value where they are written', () => {
        const symbols = buildSymbols(makeRegressionProject()), context = { symbols, targetId: 'stage', targetType: 'stage' };
        const span = (startColumn, endColumn) => ({ startLine: 1, startColumn, endLine: 1, endColumn });
        for (const [source, box, value] of [
          ['「a」を「入力1」に入れる。', span(5, 10), { kind: 'StringLiteral', value: 'a', sourceSpan: span(1, 4) }],
          ['「入力1」を「入力1」に入れる。', span(7, 12), { kind: 'StringLiteral', value: '入力1', sourceSpan: span(1, 6) }],
          ['「入力1」に「a」を入れる。', span(1, 6), { kind: 'StringLiteral', value: 'a', sourceSpan: span(7, 10) }],
          ['点数+1を「入力1」に入れる。', span(6, 11), { kind: 'BinaryExpression', op: 'ADD', left: { kind: 'VariableRead', name: '点数', qualifier: null, sourceSpan: span(1, 3) }, right: { kind: 'NumberLiteral', value: 1, sourceSpan: span(4, 5) }, sourceSpan: span(1, 5) }],
        ]) {
          const node = parsed(source, context).body[0];
          eq([source, node.kind, node.op, node.args], [source, 'LooksCommand', 'SET_INPUT', [{ kind: 'StringLiteral', value: '入力1', sourceSpan: box }, value]]);
        }
        // (a box named by a calculation is read too, with or without a subject)
        for (const [source, kind] of [['「a」を「入力1」+点数に入れる。', 'BinaryExpression'], ['ねこは、「a」を「入力1」×2に入れる。', 'BinaryExpression'], ['「a」を「入力1」の長さに入れる。', 'BuiltinCall']]) {
          const named = makeRegressionProject(); named.components[0].name = 'ねこ';
          const node = parsed(source, { symbols: buildSymbols(named), targetId: 'stage', targetType: 'stage' }).body[0];
          eq([source, node.kind, node.op, node.args[0].kind, node.args[1]?.value], [source, 'LooksCommand', 'SET_INPUT', kind, 'a']);
        }
      });
      test('a 。 with no sentence before it ends no sentence', () => {
        for (const [source, as] of [['。10歩動かす。', '10歩動かす。'], ['作品を動かしたとき、\n  。10歩動かす。', '作品を動かしたとき、\n  10歩動かす。'], ['10歩動かす。。10歩動かす。', '10歩動かす。10歩動かす。']])
          ok(astEquivalent(parsed(source), parsed(as)), source);
      });
      test('heading body line left of the body is told with the heading and the lines moved right', () => {
        const lead = '「作品を動かしたとき、」の 中の 文は、上の 文と 同じ だけ 右へ ずらして 書きます。\nれい：作品を動かしたとき、\n';
        eq(told('作品を動かしたとき、\n    10歩動かす。\n  右に15度回す。'), [['P209', 3, 1, lead + '  10歩動かす。\n  右に15度回す。']]);
        eq(told('作品を動かしたとき、\n    もし点数が1なら、\n      10歩動かす。\n  右に15度回す。'), [['P209', 4, 1, lead + '  右に15度回す。']]);
      });
    }
    {
      // 名人: a variable that holds a part, before 「の…＋リストのN番目」, reads the held part's value; the same name taken as
      // an argument may hold a list, and then its number takes everything up to the 番目.
      test('meijin held part before a later list read keeps its own reading', () => {
        const hero = makeRegressionProject();
        hero.projectData.variables.push({ id: 'variable-hero', name: '主役', initialValue: 0 });
        const symbols = buildSymbols(hero), read = (ctx) => parsed('点数を主役のよこのばしょ＋名前一覧の2番目にする。', { symbols, meijin: true, ...ctx }).body.at(-1).value;
        const held = read({});
        eq([held.kind, held.op, held.left.kind, held.left.actorRef, held.left.value.kind, held.left.value.sensor, held.right.kind, held.right.list.name, held.right.index.value],
          ['BinaryExpression', 'ADD', 'ActorQualifiedRead', { kind: 'value', value: { kind: 'VariableRead', name: '主役', qualifier: null } }, 'SensorRead', '横位置', 'ListRead', '名前一覧', 2]);
        const given = read({ args: ['主役'], definition: true });
        eq([given.kind, given.list.kind, given.list.name, given.index.kind, given.index.op, given.index.left.sensor], ['ListRead', 'VariableRead', '主役', 'BinaryExpression', 'ADD', '横位置']);
      });
      // The values around 「に〜が入っている」 take （ ） only when they bind looser than ＋: a sum stays bare and
      // 「AからBのどれか」 is bracketed. Each text is written as it is and reads back to the same tree.
      test('values around contains are bracketed by how tightly they bind', () => {
        const symbols = buildSymbols(makeRegressionProject());
        for (const source of ['もし「あい」＋「う」に「う」が入っていれば、\n  点数を1にする。', 'もし名前一覧に点数＋1が入っていれば、\n  点数を1にする。',
          'もし（1から3のどれか）に2が入っていれば、\n  点数を1にする。', 'もし名前一覧に（1から3のどれか）が入っていれば、\n  点数を1にする。']) {
          const ast = parsed(source, { symbols }), text = formatScript(ast, { symbols });
          eq([source, ast.body[0].condition.name, text], [source, 'CONTAINS', source]); ok(astEquivalent(ast, parsed(text, { symbols })), text);
        }
      });
      // These texts are already in the written form: the divisor of 「のあまり」 takes （ ） only when it binds looser than －,
      // an edge of the screen is touched by its words, and a value read from the stage or a sum compared after が or before
      // より has no （ ） (「AからBのどれか」 there has them).
      test('remainders, edge touches and compared stage values are written as they are', () => {
        const symbols = buildSymbols(makeRegressionProject());
        for (const source of ['点数を10÷－点数のあまりにする。', '点数を10÷（2×3）のあまりにする。', 'もし画面のはしにふれていれば、\n  点数を1にする。',
          'もし画面の上のはしにふれていれば、\n  点数を1にする。', 'もし「マスコット」にふれていれば、\n  点数を1にする。', 'もし点数がよこのばしょより大きければ、\n  点数を1にする。',
          'もし点数が1＋2より大きければ、\n  点数を1にする。', 'もし点数＋1が2より大きければ、\n  点数を1にする。', 'もし点数が（1から3のどれか）より大きければ、\n  点数を1にする。',
          'もし（1から3のどれか）が2より大きければ、\n  点数を1にする。', '点数を10÷（2＋3）のあまりにする。']) {
          const ast = parsed(source, { symbols }), text = formatScript(ast, { symbols });
          eq([source, text], [source, source]); ok(astEquivalent(ast, parsed(text, { symbols })), text);
        }
      });
      // A made calculation given one value is written with that value before をわたして: a number as it is, a sum in （ ）.
      test('a made calculation given one value is written as it is', () => {
        const p = makeRegressionProject();
        p.functions.push({ id: 'twice-fn', ownerId: 'stage', name: 'ばい', args: ['かず'], source: 'かず×2を答えにする。' });
        const symbols = buildSymbols(p);
        for (const source of ['点数を（3をわたして、【ばい】で求めた答え）にする。', '点数を（（1＋2）をわたして、【ばい】で求めた答え）にする。']) {
          const ast = parsed(source, { symbols }), text = formatScript(ast, { symbols });
          eq([source, ast.body[0].value.kind, ast.body[0].value.args.length, text], [source, 'UserFunctionCall', 1, source]);
        }
      });
      // A count of a procedure that the work does not have is told at the count, or, when the count has no place of its own
      // (a value put in without its text), at the line of its sentence.
      test('a count of a missing procedure is told at its place or at its sentence', () => {
        const p = makeRegressionProject(), ctx = { symbols: buildSymbols(p), targetId: 'sprite-1', targetType: 'sprite' };
        const missing = '「ない」という てじゅんが 見つかりません。名前を たしかめて ください', told = ast => analyzeAst(ast, p, { targetId: 'sprite-1', event: 'start' }).map(d => [d.code, d.line, d.column, d.message]);
        eq(told(parsed('マスコットが3回【ない】するまで待つ。', ctx)), [['S301', 1, 1, missing]]);
        const ast = parsed('「a」と言う。\n点数が1以上で、マスコットが3回【ない】するまで待つ。', ctx);
        eq(told(ast), [['S301', 2, 9, missing]]);
        const count = ast.body[1].condition.right;
        eq([count.kind, count.event, count.name], ['EventCount', 'action', 'ない']);
        delete count.sourceSpan;
        eq(told(ast), [['S301', 2, 1, missing]]);
      });
      // A list's length is written 〜の数 with the work's names and 〜の長さ without them.
      test('a list length is written with the count word only when the work is known', () => {
        const symbols = buildSymbols(makeRegressionProject()), source = '名前一覧の長さを言う。';
        eq([formatScript(parsed(source)), formatScript(parsed(source, { symbols }), { symbols })], [source, '名前一覧の数を言う。']);
      });
      // The name of a made block that is run, and the name of a list changed by number or at its end, are names: one longer
      // than 32 characters, or a block named as a calculation of あかり, is refused at the sentence (P205).
      test('a run block name and a changed list name are checked as names', () => {
        const symbols = buildSymbols(makeRegressionProject()), long = 'あ'.repeat(33), length = '名前は 1〜32文字で つけます';
        const told = source => parseSyntax(source, { symbols }).syntaxDiagnostics.map(d => [d.code, d.line, d.column, d.message]);
        eq([told('【乱数】（1）を実行する。'), told(long + '（1）を実行する。'), told(long + 'の1番目を削除する。'), told(long + 'のさいごに1を追加する。')],
          [[['P205', 1, 1, '「乱数」は あかりに はじめから ある 計算の 名前です。ちがう 名前に して ください']], [['P205', 1, 1, length]], [['P205', 1, 1, length]], [['P205', 1, 1, length]]]);
      });
      // Text handed over in （ ） reads \ escapes in 『 』 as in 「 」; a quote left open in it is told at its opening mark, as
      // in a plain sentence (P207).
      test('handed text reads escapes in both kinds of quotes and an open quote is told at its mark', () => {
        const p = makeRegressionProject(), B = String.fromCharCode(92);
        p.actions = [{ id: 'hand-escape', ownerId: 'stage', name: 'あいさつ', args: ['ことば', 'かず'], source: '何もしない。' }];
        const symbols = buildSymbols(p), ctx = { targetId: 'stage', event: 'start', symbols };
        const args = source => parsed(source, ctx).body[0].args.map(a => [a.kind, a.value]);
        eq([args('【あいさつ】（『' + B + '』「』、1）を実行する。'), args('【あいさつ】（「' + B + '」『」、1）を実行する。')],
          [[['StringLiteral', '』「'], ['NumberLiteral', 1]], [['StringLiteral', '」『'], ['NumberLiteral', 1]]]);
        const told = source => parseSyntax(source, ctx).syntaxDiagnostics.map(d => [d.code, d.line, d.column, d.message]), open = '「 」・【 】・（ ）などの とじる しるしを 書いて ください';
        eq([told('点数を『やあにする。'), told('【あいさつ】（「やあ、1）を実行する。'), told('1歩動く。\n【あいさつ】（1、『や）を実行する。')],
          [[['P207', 1, 4, open]], [['P207', 1, 8, open]], [['P207', 2, 10, open]]]);
      });
      // A made block is called at the first （ outside quotes: a name that holds a quote with （ in it is a name, and one with
      // marks a name cannot have is refused as such (P205).
      test('a made block call is split at the first bracket outside quotes', () => {
        const p = makeRegressionProject();
        p.actions = [{ id: 'split-greet', ownerId: 'stage', name: 'あいさつ', args: ['ことば', 'かず'], source: '何もしない。' }];
        const ctx = { targetId: 'stage', event: 'start', symbols: buildSymbols(p) };
        const told = source => parseSyntax(source, ctx).syntaxDiagnostics.map(d => [d.code, d.line, d.column, d.message]);
        const marks = name => [['P205', 1, 1, `名前「${name}」には 使えない 文字が あります。空白や 「」【】（）［］、※ を けして ください`]];
        eq([told('『あ（「』（）を実行する。'), told('『あ（【』（1）を実行する。'), told('「x」（1）を実行する。')], [marks('『あ（「』'), marks('『あ（【』'), marks('「x」')]);
        const call = parsed('【あいさつ】（「a（」、1）を実行する。', ctx).body[0];
        eq([call.kind, call.name, call.args.map(a => [a.kind, a.value])], ['UserActionCall', 'あいさつ', [['StringLiteral', 'a（'], ['NumberLiteral', 1]]]);
      });
      // A comparison written with と等しい・と異なる・を超える reads a text in 『 』 as one in 「 」, also when the text holds
      // かつ・または・ではない, 、 or ）.
      test('a comparison word form reads a text in either quote alike', () => {
        const p = makeRegressionProject(); p.projectData.variables.push({ id: 'cmp-name', name: '名前', initialValue: '' });
        const symbols = buildSymbols(p), read = source => { const v = parsed(source, { symbols }).body[0].value; return [v.kind, v.op, v.left.kind, v.right.kind, v.right.value ?? v.left.value]; };
        for (const word of ['かつ', 'または', 'ではない', 'a、b', 'a）b']) {
          eq([word, read('（名前が「' + word + '」と等しい）の値を言う。'), read('（名前が『' + word + '』と等しい）の値を言う。')], [word, ['CompareExpression', 'EQ', 'VariableRead', 'StringLiteral', word], ['CompareExpression', 'EQ', 'VariableRead', 'StringLiteral', word]]);
          eq([word, read('（『' + word + '』が名前と異なる）の値を言う。')], [word, ['CompareExpression', 'NEQ', 'StringLiteral', 'VariableRead', word]]);
        }
      });
      // Before かつ, such a comparison ends after its text: かつ and an escaped closing mark inside 「 」 or 『 』 are text.
      test('a comparison word form before katsu keeps the quoted text whole', () => {
        const p = makeRegressionProject(); p.projectData.variables.push({ id: 'cmp-name-2', name: '名前', initialValue: '' });
        const symbols = buildSymbols(p), B = String.fromCharCode(92);
        const read = word => { const c = parsed('もし条件（名前が' + word + 'と等しいかつ点数が1未満）が成り立つなら、\n  「x」と言う。', { symbols }).body[0].condition;
          return [c.kind, c.op, c.left.op, c.left.right.kind, c.left.right.value, c.right.op, c.right.right.value]; };
        eq([read('『かつ』'), read('『a' + B + '』かつ』'), read('「a' + B + '」かつ」')],
          [['LogicalExpression', 'AND', 'EQ', 'StringLiteral', 'かつ', 'LT', 1], ['LogicalExpression', 'AND', 'EQ', 'StringLiteral', 'a』かつ', 'LT', 1], ['LogicalExpression', 'AND', 'EQ', 'StringLiteral', 'a」かつ', 'LT', 1]]);
      });
    }
    {
      test('an operator with no value after it is refused at the column just after the operator, also when blanks stand around it', () => {
        // (the value stands alone: its column counts the letters of the text, blanks and a first letter that stands alone included)
        const symbols = buildSymbols(makeRegressionProject());
        const told = text => { try { parseExpression(text, symbols); return 'read'; } catch (e) { return [e.code, e.column]; } };
        for (const [text, column] of [['＋', 2], ['－', 2], ['1＋', 3], ['1　＋　', 4], ['　1＋', 4], [' ＋', 3]])
          eq([text, told(text)], [text, ['P205', column]]);
      });
      // A sentence that can mean several things keeps a proposal for each meaning in a body of the work, also where the
      // work's check would refuse one of them (the empty work has no sound named こんにちは, no list 持ち物, no 点数).
      test('a sentence of several meanings keeps each meaning in a body of the work', () => {
        const symbols = buildSymbols(Akari.makeEmptyProject()), body = { symbols, key: 'script:stage:start', targetId: 'stage', targetType: 'stage' };
        const labels = (source, context) => (parseSyntax(source, context).syntaxDiagnostics[0]?.proposals || []).map(p => p.label);
        for (const source of ['こんにちはを言う。', '持ち物に「かさ」を入れる。', 'もし点数が10以上で、残りが1以上か、当たりが1以上なら、\n  10歩進む。'])
          eq(labels(source, body), labels(source, { symbols }));
        eq(labels('こんにちはを言う。', body).length, 3);
      });
    }
    {
      // The characters a text written again keeps (surfaceLineSlice places each of them where it was written): pairs of
      // places, in order in both texts, of the same character, as many as the longest run the two have alike in order
      // (counted here with the whole table of the longest run alike after each pair of places). Every pair of texts of a
      // and b up to 7 characters, and of a, b and c up to 4.
      const alignmentTexts = (letters, most) => { const all = ['']; let layer = ['']; for (let n = 0; n < most; n++) { layer = layer.flatMap(text => [...letters].map(c => text + c)); all.push(...layer); } return all; };
      const alignmentPairs = [alignmentTexts('ab', 7), alignmentTexts('abc', 4)].flatMap(texts => texts.flatMap(a => texts.map(b => [a, b])));
      const longestAlike = (a, b) => { let below = Array(b.length + 1).fill(0); for (let i = a.length - 1; i >= 0; i--) { const row = Array(b.length + 1).fill(0); for (let j = b.length - 1; j >= 0; j--) row[j] = a[i] === b[j] ? below[j + 1] + 1 : Math.max(below[j], row[j + 1]); below = row; } return below[0]; };
      const keptInOrder = (kept, a, b) => Array.isArray(kept) && kept.every((pair, t) => Array.isArray(pair) && pair.length === 2 && Number.isInteger(pair[0]) && Number.isInteger(pair[1]) && pair[0] >= 0 && pair[1] >= 0 && pair[0] < a.length && pair[1] < b.length && a[pair[0]] === b[pair[1]] && (!t || (pair[0] > kept[t - 1][0] && pair[1] > kept[t - 1][1])));
      test('a text written again keeps the most characters the two have alike in order', () => {
        for (const [a, b] of alignmentPairs) {
          const kept = keptCharacters(a, b);
          if (!keptInOrder(kept, a, b) || kept.length !== longestAlike(a, b)) eq([a, b, kept], [a, b, 'the most characters alike in order']);
        }
      });
      // Edit by edit (localEditKept, with the 64 edits a place that keptCharacters allows): a place of these texts needs at
      // most as many edits as the two have characters, so the characters are given, pairs of the same character in order;
      // the edits start where the texts first differ, so the characters before it are kept where they are.
      test('characters kept edit by edit are given, keep the beginning the texts share and are alike in order', () => {
        for (const [a, b] of alignmentPairs) {
          const kept = localEditKept(a, b, 64);
          let shared = 0;
          while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
          if (kept === null || !keptInOrder(kept, a, b) || stableJson(kept.slice(0, shared)) !== stableJson(Array.from({ length: shared }, (_, t) => [t, t])))
            eq([a, b, kept], [a, b, 'the beginning the two share, then characters alike in order']);
        }
      });
    }
    return {
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      total: results.length,
      results,
    };
  }
