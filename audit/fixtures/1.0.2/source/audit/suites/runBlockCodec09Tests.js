function runBlockCodec09Tests() {
    const results = [],
      test = (id, fn) => {
        try {
          fn();
          results.push({ id, pass: true, detail: 'PASS' });
        } catch (e) {
          results.push({ id, pass: false, detail: (e.code || e.name) + ': ' + e.message });
        }
      };
    const ok = (value, message = 'assertion failed') => {
      if (!value) throw Error(message);
    };
    const same = (left, right) =>
      ok(astEquivalent(left, right), 'AST meaning or comments changed');
    const reject = (fn) => {
      let failure;
      try {
        fn();
      } catch (error) {
        failure = error;
      }
      ok(failure instanceof AkariError && failure.code === 'P210', 'expected structural rejection');
    };
    const parse = (source) => {
      const result = parseSyntax(source);
      ok(result.ast, JSON.stringify(result.syntaxDiagnostics));
      return result.ast;
    };
    const number = (value) => ({ kind: 'NumberLiteral', value });
    const noop = () => ({ kind: 'NoOperation', inlineComment: '' });
    const script = (body) => ({ kind: 'Script', body });
    const reparsed = (node, category) => {
      if (category === 'target') return;
      if (category === 'expression') {
        same(node, parseExpression(formatExpression(node), buildSymbols(makeDefaultProject())));
        return;
      }
      const ast = category === 'script' ? node : script([node]);
      same(ast, parse(formatScript(ast)));
    };
    test('T09-SCHEMA-COVERAGE', () => {
      const ids = BLOCK_SCHEMAS.map((schema) => schema.id);
      ok(new Set(ids).size === ids.length, 'duplicate schema ID');
      for (const command of COMMAND_CATALOG)
        ok(BLOCK_SCHEMA_BY_ID.has(command.id), 'missing ' + command.id);
      for (const meta of GRAMMAR_REGISTRY.builtins)
        ok(BLOCK_SCHEMA_BY_ID.has('BuiltinCall:' + meta.name), 'missing builtin ' + meta.name);
      for (const sensor of GRAMMAR_REGISTRY.sensors)
        ok(BLOCK_SCHEMA_BY_ID.has('SensorRead:' + sensor), 'missing sensor ' + sensor);
      for (const id of [
        'Script',
        'TargetReference',
        'CommentLine',
        'NumberLiteral',
        'StringLiteral',
        'BooleanLiteral',
        'ListLiteral',
        'VariableRead',
        'ListRead',
        'UserFunctionCall',
        ...['POS', 'NEG', 'NOT'].map((x) => 'UnaryExpression:' + x),
        ...['ADD', 'SUB', 'MUL', 'DIV', 'POW'].map((x) => 'BinaryExpression:' + x),
        ...['GTE', 'LTE', 'GT', 'LT', 'EQ', 'NEQ'].map((x) => 'CompareExpression:' + x),
        ...['AND', 'OR'].map((x) => 'LogicalExpression:' + x),
        ...['CONTAINS', 'INDEX_OF', 'LENGTH', 'STRING_LENGTH', 'STRING_CHAR'].map(
          (x) => 'BuiltinCall:' + x,
        ),
        ...['INPUT_VALUE', 'DISTANCE_TO', 'KEY_DOWN', 'TOUCHING_COLOR', 'TOUCHING'].map(
          (x) => 'SensorRead:' + x,
        ),
      ])
        ok(BLOCK_SCHEMA_BY_ID.has(id), 'missing ' + id);
      ok(
        !BLOCK_SCHEMA_BY_ID.has('UnknownName') && !BLOCK_SCHEMA_BY_ID.has('Else'),
        'transient or obsolete node exposed',
      );
      for (const schema of BLOCK_SCHEMAS) {
        ok(schema.label && schema.palette && schema.category);
        for (const entry of [
          ...schema.fields,
          ...schema.inputs,
          ...schema.bodies,
          ...schema.annotations,
        ])
          ok(entry.key && entry.label);
        for (const key of ['create', 'encode', 'decode', 'availability'])
          ok(typeof schema[key] === 'function');
      }
    });
    for (const schema of BLOCK_SCHEMAS)
      test('T09-BLOCK-SCHEMA ' + schema.id, () => {
        const fresh = schema.create(),
          encoded = schema.encode(fresh),
          decoded = schema.decode(encoded.tree);
        same(fresh, decoded);
        reparsed(decoded, schema.category);
        const tree = createBlock(schema.id),
          expected = schema.create();
        let serial = 0;
        const child = (node, type = 'expression') =>
          blockEncode(node, { expected: type, idPrefix: 'edit' + ++serial }).tree;
        for (const field of schema.fields) {
          const value =
            field.type === 'boolean'
              ? !expected[field.key]
              : field.type === 'number'
                ? 17
                : field.type === 'qualifier'
                  ? 'self'
                  : field.type === 'name'
                    ? '変更値'
                    : field.type === 'comment'
                      ? '  注釈 ※ 。  '
                      : '  文字 ※ 。  ';
          tree.fields[field.key] = value;
          expected[field.key] = value;
        }
        for (const slot of schema.inputs) {
          const make = (i) =>
            slot.type === 'target'
              ? { name: '変更先', qualifier: 'project' }
              : { kind: 'BinaryExpression', op: 'ADD', left: number(i + 2), right: number(i + 9) };
          if (slot.multiple) {
            const count = slot.variadic ? Math.max(slot.minItems, 3) : slot.minItems;
            expected[slot.key] = Array.from({ length: count }, (_, i) => make(i));
            tree.inputs[slot.key] = expected[slot.key].map((node) => child(node, slot.type));
          } else {
            expected[slot.key] = make(0);
            tree.inputs[slot.key] = child(expected[slot.key], slot.type);
          }
        }
        for (const slot of schema.bodies) {
          const enabled = !slot.when || expected[slot.when];
          expected[slot.key] = enabled
            ? [
                { kind: 'CommentLine', text: '  本文の注釈  ', inlineComment: '' },
                {
                  kind: 'Say',
                  value: { kind: 'StringLiteral', value: '編集済み' },
                  inlineComment: '※ 本文末尾  ',
                },
              ]
            : [];
          tree.bodies[slot.key] = expected[slot.key].map((node) => child(node, 'statement'));
        }
        if (schema.category === 'statement') {
          tree.annotations.inlineComment = '※ 命令末尾  ';
          expected.inlineComment = '※ 命令末尾  ';
          if (schema.kind === 'CommentLine') {
            tree.annotations.inlineComment = '';
            expected.inlineComment = '';
          }
        }
        if (schema.kind === 'IfStatement') {
          tree.annotations.elseComment = expected.hasElse ? '※ else  ' : '';
          expected.elseComment = tree.annotations.elseComment;
        }
        const edited = blockDecode(tree, { expected: schema.category });
        same(expected, edited);
        reparsed(edited, schema.category);
      });
    test('T09-BLOCK-ROUNDTRIP', () => {
      const fixtures = [
        ...COMMAND_CATALOG.map((command) => command.source),
        '※  最初  \nもし 真なら、次のことをする。 ※ 開始  \n  次のことを2回くり返す。 ※ 反復  \n    何もしない。 ※ 実行  \n※ 内側の反復の後ろ  \nそうでなければ、次のことをする。 ※ else  \n  ※ 先頭  \n  何もしない。\n※ 最後  ',
        '名前一覧の各要素を項目として、次のことをくり返す。\n  名前一覧の各要素を項目として、次のことをくり返す。\n    【未定義】と言う。',
        '未登録（1、2、3）を実行する。\n最小（）と言う。\n余り（1、2、3）と言う。',
        '－2＾3＾2と言う。\n作品の点数を【HP】＋自分のHPにする。',
      ];
      for (const source of fixtures) {
        const ast = parse(source),
          before = stableJson(ast),
          encoded = blockEncode(ast);
        same(ast, blockDecode(encoded.tree));
        ok(stableJson(ast) === before, 'encoder mutated AST');
        same(ast, parse(formatScript(blockDecode(encoded.tree))));
      }
    });
    test('T09-BLOCK-CURRENT-SLOTS', () => {
      const original = parse('点数を1にする。 ※ 古い  '),
        encoded = blockEncode(original),
        statement = encoded.tree.bodies.body[0];
      statement.inputs.target.fields.name = '変更先';
      statement.inputs.target.fields.qualifier = 'self';
      statement.inputs.value.fields.value = 29;
      statement.annotations.inlineComment = '※ 新しい  ';
      original.body[0].value.value = 999;
      original.body[0].target.name = '元ASTだけの変更';
      const decoded = blockDecode(encoded.tree);
      ok(
        decoded.body[0].value.value === 29 &&
          decoded.body[0].target.name === '変更先' &&
          decoded.body[0].target.qualifier === 'self' &&
          decoded.body[0].inlineComment === '※ 新しい  ',
        'decoder depends on original AST',
      );
      ok(
        encoded.nodeMap.get(statement.id).sourceSpan.startLine === 1,
        'location side table missing',
      );
      ok(encoded.nodeIds.get(original.body[0]) === statement.id, 'AST mapping missing');
      const check = (node) => {
        for (const key of ['source', 'sourceSpan', 'raw', 'endLine', 'ast'])
          ok(!Object.hasOwn(node, key), 'source metadata leaked into block');
        for (const value of Object.values(node.inputs)) {
          if (Array.isArray(value)) value.forEach(check);
          else check(value);
        }
        Object.values(node.bodies).forEach((body) => body.forEach(check));
      };
      check(encoded.tree);
    });
    test('T09-BLOCK-SEMANTIC-ARITY', () => {
      for (const name of ['余り', '最小', '最大', 'つなぐ'])
        for (const length of [0, 1, 2, 33, 80]) {
          const ast = {
            kind: 'BuiltinCall',
            name,
            args: Array.from({ length }, (_, i) => number(i)),
          };
          same(ast, blockDecode(blockEncode(ast).tree));
          reparsed(ast, 'expression');
        }
      for (const kind of ['UserActionCall', 'UserFunctionCall']) {
        const ast = {
          kind,
          name: '未登録',
          args: Array.from({ length: 40 }, (_, i) => number(i)),
          ...(kind === 'UserActionCall' ? { inlineComment: '' } : {}),
        };
        same(ast, blockDecode(blockEncode(ast).tree));
        reparsed(ast, kind === 'UserActionCall' ? 'statement' : 'expression');
      }
    });
    test('T09-BLOCK-REJECT', () => {
      reject(() => validateSyntaxAst(script([{ kind: 'Missing' }])));
      reject(() =>
        validateSyntaxAst(
          { kind: 'BinaryExpression', op: 'MOD', left: number(1), right: number(2) },
          'expression',
        ),
      );
      reject(() => validateSyntaxAst({ kind: 'NumberLiteral', value: -1 }, 'expression'));
      reject(() => validateSyntaxAst({ kind: 'NumberLiteral', value: -0 }, 'expression'));
      reject(() => validateSyntaxAst({ kind: 'NumberLiteral', value: Infinity }, 'expression'));
      const empty = createBlock('RepeatCount');
      empty.bodies.body = [];
      reject(() => blockDecode(empty));
      empty.bodies.body = [createBlock('CommentLine', { idPrefix: 'comment' })];
      reject(() => blockDecode(empty));
      const absent = createBlock('NumberLiteral');
      delete absent.fields.value;
      reject(() => blockDecode(absent));
      reject(() => validateSyntaxAst(script([{ kind: 'NoOperation' }])));
      const absentElse = BLOCK_SCHEMA_BY_ID.get('IfStatement').create();
      delete absentElse.elseComment;
      reject(() => validateSyntaxAst(script([absentElse])));
      reject(() =>
        validateSyntaxAst({ kind: 'VariableRead', name: 'AのB', qualifier: null }, 'expression'),
      );
      reject(() =>
        validateSyntaxAst(
          { kind: 'VariableRead', name: '空 白', qualifier: 'exact' },
          'expression',
        ),
      );
      const wrong = createBlock('Assignment');
      wrong.inputs.target = createBlock('NumberLiteral', { idPrefix: 'wrong' });
      reject(() => blockDecode(wrong));
      const wrongExpression = createBlock('Say');
      wrongExpression.inputs.value = createBlock('NoOperation', { idPrefix: 'wrong' });
      reject(() => blockDecode(wrongExpression));
      const cycle = createBlock('UnaryExpression:NEG');
      cycle.inputs.value = cycle;
      reject(() => blockDecode(cycle));
      const astCycle = { kind: 'UnaryExpression', op: 'NEG' };
      astCycle.value = astCycle;
      reject(() => validateSyntaxAst(astCycle, 'expression'));
      const shared = createBlock('BinaryExpression:ADD');
      shared.inputs.right = shared.inputs.left;
      reject(() => blockDecode(shared));
      const duplicate = createBlock('BinaryExpression:ADD');
      duplicate.inputs.right.id = duplicate.inputs.left.id;
      reject(() => blockDecode(duplicate));
      const hidden = createBlock('Say');
      hidden.source = '何もしない';
      reject(() => blockDecode(hidden));
      const extra = createBlock('NumberLiteral');
      extra.fields.unknown = 1;
      reject(() => blockDecode(extra));
      const invalidElse = createBlock('IfStatement');
      invalidElse.bodies.elseBody = [createBlock('NoOperation', { idPrefix: 'else' })];
      reject(() => blockDecode(invalidElse));
      const emptyElse = createBlock('IfStatement');
      emptyElse.fields.hasElse = true;
      reject(() => blockDecode(emptyElse));
      const missingArg = createBlock('SensorRead:INPUT_VALUE');
      delete missingArg.inputs.arg;
      reject(() => blockDecode(missingArg));
      const postfix = createBlock('BuiltinCall:LENGTH');
      postfix.inputs.args = [];
      reject(() => blockDecode(postfix));
      const command = createBlock('MotionCommand:GOTO');
      command.inputs.args.pop();
      reject(() => blockDecode(command));
      const annotation = createBlock('NoOperation');
      annotation.annotations.inlineComment = '注釈マーカーなし';
      reject(() => blockDecode(annotation));
      const comment = createBlock('CommentLine');
      comment.annotations.inlineComment = '※ 表現できない別注釈';
      reject(() => blockDecode(comment));
    });
    test('T09-BLOCK-LIMITS', () => {
      let expression = number(1);
      for (let i = 1; i < LIMITS.expressionDepth; i++)
        expression = { kind: 'UnaryExpression', op: 'NEG', value: expression };
      same(expression, blockDecode(blockEncode(expression).tree));
      reject(() =>
        validateSyntaxAst(
          { kind: 'UnaryExpression', op: 'NEG', value: expression },
          'expression',
        ),
      );
      const tooDeep = blockEncode(expression).tree;
      let leaf = tooDeep;
      while (leaf.inputs.value) leaf = leaf.inputs.value;
      leaf.schemaId = 'UnaryExpression:NEG';
      leaf.fields = {};
      leaf.inputs.value = createBlock('NumberLiteral', { idPrefix: 'depth-limit' });
      reject(() => blockDecode(tooDeep));
      let statement = noop();
      for (let i = 0; i < LIMITS.blockDepth; i++)
        statement = { kind: 'Forever', body: [statement], inlineComment: '' };
      same(script([statement]), blockDecode(blockEncode(script([statement])).tree));
      reject(() =>
        validateSyntaxAst(script([{ kind: 'Forever', body: [statement], inlineComment: '' }])),
      );
      const list = createBlock('ListLiteral');
      list.inputs.items = Array(LIMITS.sourceEach + 1).fill(null);
      reject(() => blockDecode(list));
    });
    return {
      total: results.length,
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      results,
    };
  }
