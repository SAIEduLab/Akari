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
      for (const [source, line] of [
        ['点数を0にする\n点数を', 2],
        ['もし 条件（条件の答え（あてはまる））が成り立つなら、\n※ only', 1],
        ['何もしない\n  何もしない', 2],
        ['何もしない\n\t何もしない', 2],
      ]) {
        const result = parseSyntax(source, { key: 'script:stage:start' });
        eq(result.ast, null);
        eq(result.syntaxDiagnostics.length, 1);
        eq(result.syntaxDiagnostics[0].line, line);
        eq(result.syntaxDiagnostics[0].where, 'script:stage:start');
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
      const ast = parsed('2回くり返す\n  何もしない\n※ closing \n点数の値を言う'),
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
    });
    return {
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      total: results.length,
      results,
    };
  }
