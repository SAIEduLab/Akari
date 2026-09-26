function runEditorCore09Tests() {
    const results = [],
      test = (id, fn) => {
        try {
          fn();
          results.push({ id: 'T09-EDITOR ' + id, pass: true, detail: 'PASS' });
        } catch (error) {
          results.push({
            id: 'T09-EDITOR ' + id,
            pass: false,
            detail: (error.code || error.name) + ': ' + error.message,
          });
        }
      },
      ok = (value, message = 'assertion failed') => {
        if (!value) throw Error(message);
      };
    const snapshot = (session) =>
      stableJson({
        source: session.sourceText,
        ast: session.syntaxAst,
        tree: session.blockView,
        revision: session.sourceRevision,
        contextRevision: session.contextRevision,
        selection: session.blockSelection,
        pending: session.pendingEdit,
        project: session.project,
      });
    const setup = (
      source = '点数を1にする\n何もしない',
      context = { targetId: 'stage', event: 'start' },
      key = 'script:stage:start',
    ) => {
      const project = makeDefaultProject();
      project.scripts = [{ targetId: 'stage', event: 'start', source }];
      return createEditorSession(key, source, context, project, 4);
    };
    const prepare = (session, op, options = {}) =>
      prepareBlockEdit(session, op, {
        ownerKey: session.ownerKey,
        sourceRevision: session.sourceRevision,
        contextRevision: session.contextRevision,
        ...options,
      });
    const fail = (session, op, options = {}) => {
      const before = snapshot(session);
      let error;
      try {
        prepare(session, op, options);
      } catch (e) {
        error = e;
      }
      ok(error instanceof AkariError, 'expected a controlled failure');
      ok(snapshot(session) === before, 'failure changed current state');
    };
    const node = (session, id) => buildBlockIndex(session.blockView).get(id).node;
    const find = (session, schema) =>
      [...buildBlockIndex(session.blockView).values()].find(
        (entry) => entry.node.schemaId === schema,
      ).node;
    const accepted = (session, result) => ({
      ...session,
      ...result,
      sourceText: result.source,
      project: session.project,
    });
    const literal = (value) => {
      const block = createBlock('NumberLiteral');
      block.fields.value = value;
      return block;
    };
    test('workbench shape paths and viewport zoom are presentation only', () => {
      for (const kind of ['stack', 'hat', 'value', 'boolean'])
        for (const [w, h] of [
          [120, 48],
          [380, 240],
        ]) {
          const path = blockShapePath(w, h, kind, [{ top: 55, bottom: 160 }]);
          ok(path.startsWith('M ') && path.endsWith('Z') && !/NaN|undefined|Infinity/.test(path));
        }
      ok(blockShapePath(120, 48).includes('L 26 6'));
      ok(blockZoomCore(20) === 2 && blockZoomCore(0.01) === 0.2);
      ok(blockZoomScroll(100, 50, 1, 2) === 250 && blockZoomScroll(250, 50, 2, 1) === 100);
      ok(blockShapeKind(BLOCK_SCHEMA_BY_ID.get('CompareExpression:EQ')) === 'boolean');
      for (const schema of BLOCK_SCHEMAS.filter((s) =>
        ['statement', 'expression'].includes(s.category),
      ))
        ok(typeof blockPaletteGroup(schema) === 'string');
      const session = setup(),
        before = snapshot(session);
      session.scrollState = { blockTop: 800, blockLeft: 250, blockZoom: 0.8 };
      ok(snapshot(session) === before);
    });
    test('display mode preference is shared across owners and survives syntax fallback', () => {
      const modes = new Map([['script', 'blocks']]);
      ok(resolvedEditorMode(modes, 'script', {}) === 'blocks');
      ok(resolvedEditorMode(modes, 'script', null) === 'code');
      ok(modes.get('script') === 'blocks');
      modes.set('script', 'code');
      modes.set('draft', 'blocks');
      ok(resolvedEditorMode(modes, 'script', {}) === 'code');
      ok(resolvedEditorMode(modes, 'draft', {}) === 'blocks');
    });
    test('creation refresh and syntax error preserve source', () => {
      const source = '※  注釈 \n点数を 1 にする',
        session = setup(source),
        before = snapshot(session);
      ok(
        session.syntaxAst &&
          session.blockView &&
          session.sourceText === source &&
          session.sourceRevision === 0,
      );
      const refreshed = refreshEditorSession(
        session,
        source,
        session.context,
        session.project,
        5,
      );
      ok(
        refreshed.sourceRevision === 0 &&
          refreshed.contextRevision === 5 &&
          refreshed.syntaxAst !== session.syntaxAst,
      );
      ok(snapshot(session) === before);
      const broken = refreshEditorSession(
        session,
        'もし 真なら、次のことをする',
        session.context,
        session.project,
        5,
      );
      ok(
        broken.syntaxAst === null &&
          broken.blockView === null &&
          broken.sourceRevision === 1 &&
          broken.sourceText === 'もし 真なら、次のことをする',
      );
    });
    test('context refresh preserves edited IDs selection and rebuilt node maps', () => {
      const project = makeDefaultProject(),
        definition = { id: 'draft', name: '動作名', args: [], source: '1と言う。\n2と言う。' },
        context = { definitionKind: 'action', definition, args: [] };
      let session = createEditorSession('action:draft', definition.source, context, project, 4);
      session = accepted(
        session,
        prepare(session, {
          type: 'duplicate',
          id: session.blockView.bodies.body[0].id,
          parentId: session.blockView.id,
          body: 'body',
          index: 1,
        }),
      );
      const lastId = session.blockView.bodies.body[2].inputs.value.id,
        ids = [...buildBlockIndex(session.blockView).keys()];
      session.blockSelection = lastId;
      session.pendingEdit = {
        id: lastId,
        sourceRevision: session.sourceRevision,
        contextRevision: 4,
      };
      const before = snapshot(session),
        refreshed = refreshEditorSession(
          session,
          session.sourceText,
          { ...context, definition: { ...definition, name: '変更名' } },
          project,
          5,
        );
      ok(
        refreshed.sourceRevision === session.sourceRevision &&
          refreshed.contextRevision === 5 &&
          refreshed.pendingEdit === null &&
          refreshed.blockSelection === lastId,
      );
      ok(stableJson([...buildBlockIndex(refreshed.blockView).keys()]) === stableJson(ids));
      ok(refreshed.syntaxAst !== session.syntaxAst && refreshed.blockView !== session.blockView);
      ok(
        refreshed.nodeIds.get(refreshed.syntaxAst.body[2].value) === lastId &&
          stableJson(refreshed.nodeMap.get(lastId).path) === stableJson(['body', 2, 'value']),
      );
      fail(
        refreshed,
        { type: 'field', id: lastId, key: 'value', value: 9 },
        { contextRevision: 4 },
      );
      const edited = prepare(refreshed, { type: 'field', id: lastId, key: 'value', value: 9 });
      ok(edited.source === '1と言う。\n1と言う。\n9と言う。');
      ok(snapshot(session) === before);
    });
    test('semantics and incomplete definition header keep AST', () => {
      const project = makeDefaultProject(),
        definition = { id: 'draft-one', name: '', args: ['', '量', '量'], source: '' },
        session = createEditorSession(
          'function:draft-one',
          '未登録を返す',
          { definitionKind: 'function', definition, args: definition.args },
          project,
          1,
        );
      ok(session.syntaxAst && session.blockView);
      ok(
        session.diagnostics.some((d) => d.code === 'S302') &&
          session.diagnostics.some((d) => d.code === 'S301'),
      );
      ok(project.functions.length === 0);
    });
    test('owner revision lock pending and atomic rejection', () => {
      const session = setup(),
        target = find(session, 'NumberLiteral'),
        operation = { type: 'field', id: target.id, key: 'value', value: 2 };
      for (const options of [
        { ownerKey: 'script:sprite-1:start' },
        { sourceRevision: 2 },
        { contextRevision: 1 },
        { locked: true },
      ])
        fail(session, operation, options);
      session.pendingEdit = { id: 'pending', composing: true };
      fail(session, operation, { pendingEditId: 'pending' });
      session.pendingEdit = { id: 'pending' };
      fail(session, operation);
      const result = prepare(session, operation, { pendingEditId: 'pending' });
      ok(result.changed && result.pendingEdit === null);
    });
    test('no op cancel same place preserve original text and do not validate', () => {
      const session = setup('点数を 1 にする\n何もしない'),
        id = session.blockView.bodies.body[0].id,
        root = session.blockView.id,
        before = snapshot(session);
      let checks = 0;
      for (const operation of [
        { type: 'noop' },
        { type: 'cancel' },
        { type: 'move', id, parentId: root, body: 'body', index: 0 },
        { type: 'move', id, parentId: root, body: 'body', index: 1 },
        { type: 'field', id: find(session, 'NumberLiteral').id, key: 'value', value: 1 },
      ]) {
        const result = prepare(session, operation, {
          validateCandidate: () => {
            checks++;
            return true;
          },
        });
        ok(
          !result.changed &&
            result.source === session.sourceText &&
            result.blockView === session.blockView,
        );
      }
      ok(checks === 0 && snapshot(session) === before);
    });
    test('field annotation and batch update all values once', () => {
      const session = setup(),
        assignment = find(session, 'Assignment'),
        target = assignment.inputs.target,
        before = snapshot(session);
      const result = prepare(session, {
        type: 'batch',
        operations: [
          { type: 'field', id: target.id, key: 'name', value: 'AのB' },
          { type: 'field', id: target.id, key: 'qualifier', value: 'exact' },
          { type: 'annotation', id: assignment.id, key: 'inlineComment', value: '※  残す  ' },
        ],
      });
      ok(
        result.changed &&
          result.sourceRevision === 1 &&
          result.source.includes('【AのB】') &&
          result.source.includes('※  残す  ') &&
          result.diagnostics.some((d) => d.code === 'S301'),
      );
      ok(snapshot(session) === before);
      ok(buildBlockIndex(result.blockView).has(assignment.id));
    });
    test('insert duplicate replace remove and fresh IDs', () => {
      const session = setup(),
        root = session.blockView.id;
      let current = session;
      for (let i = 0; i < 2; i++) {
        const result = prepare(current, {
          type: 'insert',
          parentId: root,
          body: 'body',
          index: current.blockView.bodies.body.length,
          node: createBlock('NoOperation'),
        });
        current = accepted(current, result);
      }
      const result = prepare(current, {
        type: 'duplicate',
        id: current.blockView.bodies.body[0].id,
        parentId: root,
        body: 'body',
        index: 1,
      });
      current = accepted(current, result);
      ok(current.blockView.bodies.body.length === 5);
      const replacement = createBlock('Say');
      replacement.inputs.value = createBlock('StringLiteral', { idPrefix: 'text' });
      replacement.inputs.value.fields.value = '置換';
      current = accepted(
        current,
        prepare(current, {
          type: 'replace',
          id: current.blockView.bodies.body[0].id,
          node: replacement,
        }),
      );
      current = accepted(
        current,
        prepare(current, { type: 'remove', id: current.blockView.bodies.body[1].id }),
      );
      ok(
        current.blockView.bodies.body.length === 4 && current.sourceText.includes('「置換」と言う'),
      );
      ok(buildBlockIndex(current.blockView).size > 4);
    });
    test('statement moves reorder and nest with comments', () => {
      const session = setup(
          '点数を1にする ※ 一緒 \n次のことを2回くり返す\n  何もしない\n点数を3にする',
        ),
        root = session.blockView.id,
        first = session.blockView.bodies.body[0].id,
        loop = find(session, 'RepeatCount');
      let current = accepted(
        session,
        prepare(session, { type: 'move', id: first, parentId: root, body: 'body', index: 3 }),
      );
      ok(current.syntaxAst.body[2].inlineComment === '※ 一緒 ');
      current = accepted(
        current,
        prepare(current, { type: 'move', id: first, parentId: loop.id, body: 'body', index: 1 }),
      );
      ok(find(current, 'RepeatCount').bodies.body[1].annotations.inlineComment === '※ 一緒 ');
      fail(current, { type: 'move', id: loop.id, parentId: loop.id, body: 'body', index: 0 });
    });
    test('required body removal and invalid field leave everything', () => {
      const session = setup('次のことを2回くり返す\n  何もしない'),
        loop = find(session, 'RepeatCount');
      fail(session, { type: 'remove', id: loop.bodies.body[0].id });
      fail(session, { type: 'field', id: loop.inputs.count.id, key: 'value', value: -1 });
      fail(session, {
        type: 'expression',
        parentId: loop.id,
        input: 'count',
        node: createBlock('NoOperation'),
      });
    });
    test('else and multiline comments are atomic', () => {
      let session = setup('※one\nもし 真なら、次のことをする\n  何もしない');
      const conditional = find(session, 'IfStatement'),
        comment = find(session, 'CommentLine');
      session = accepted(
        session,
        prepare(session, { type: 'else', id: conditional.id, enabled: true }),
      );
      ok(find(session, 'IfStatement').bodies.elseBody[0].schemaId === 'NoOperation');
      session = accepted(
        session,
        prepare(session, { type: 'comment-lines', id: comment.id, lines: ['  第一  ', '第二※ '] }),
      );
      ok(
        session.syntaxAst.body[0].text === '  第一  ' &&
          session.syntaxAst.body[1].text === '第二※ ',
      );
      session = accepted(
        session,
        prepare(session, { type: 'else', id: conditional.id, enabled: false }),
      );
      ok(
        !find(session, 'IfStatement').fields.hasElse &&
          find(session, 'IfStatement').bodies.elseBody.length === 0,
      );
    });
    test('comment closing boundary reassociation keeps IDs and content', () => {
      const session = setup('次のことを2回くり返す\n  何もしない\n点数を1にする\n※ tail  '),
        root = session.blockView.id,
        loop = find(session, 'RepeatCount'),
        comment = find(session, 'CommentLine');
      const result = prepare(session, {
        type: 'move',
        id: comment.id,
        parentId: root,
        body: 'body',
        index: 1,
      });
      ok(result.changed);
      ok(result.source.includes('※ tail  '));
      ok(buildBlockIndex(result.blockView).has(comment.id));
      ok(result.syntaxAst.body[0].body.some((n) => n.kind === 'CommentLine'));
    });
    test('expression replacement and move require a complete source replacement', () => {
      const session = setup('点数を1＋2にする\n点数を3にする'),
        binary = find(session, 'BinaryExpression:ADD'),
        destination = session.blockView.bodies.body[1];
      fail(session, {
        type: 'expression-move',
        id: binary.inputs.left.id,
        parentId: destination.id,
        input: 'value',
      });
      const result = prepare(session, {
        type: 'expression-move',
        id: binary.inputs.left.id,
        parentId: destination.id,
        input: 'value',
        replacement: literal(8),
      });
      ok(
        result.syntaxAst.body[0].value.left.value === 8 &&
          result.syntaxAst.body[1].value.value === 1,
      );
      const replacement = prepare(session, {
        type: 'expression',
        parentId: destination.id,
        input: 'value',
        node: literal(7),
      });
      ok(replacement.syntaxAst.body[1].value.value === 7);
      fail(session, {
        type: 'expression-move',
        id: binary.id,
        parentId: binary.id,
        input: 'left',
        replacement: literal(0),
      });
    });
    test('variadic insertion removal and move preserve arity errors', () => {
      let session = setup('最小（1、2、3）と言う'),
        call = find(session, 'BuiltinCall:最小');
      session = accepted(
        session,
        prepare(session, {
          type: 'variadic-move',
          parentId: call.id,
          input: 'args',
          index: 0,
          toIndex: 3,
        }),
      );
      ok(session.syntaxAst.body[0].value.args.map((x) => x.value).join(',') === '2,3,1');
      session = accepted(
        session,
        prepare(session, {
          type: 'variadic-insert',
          parentId: call.id,
          input: 'args',
          index: 1,
          node: literal(9),
        }),
      );
      ok(session.syntaxAst.body[0].value.args.map((x) => x.value).join(',') === '2,9,3,1');
      for (let i = 0; i < 4; i++)
        session = accepted(
          session,
          prepare(session, { type: 'variadic-remove', parentId: call.id, input: 'args', index: 0 }),
        );
      ok(
        session.syntaxAst.body[0].value.args.length === 0 &&
          session.diagnostics.some((d) => d.code === 'S308'),
      );
    });
    test('candidate validator rejection is before commit', () => {
      const session = setup();
      fail(
        session,
        { type: 'field', id: find(session, 'NumberLiteral').id, key: 'value', value: 9 },
        {
          validateCandidate: (result) => {
            ok(result.source.includes('9'));
            return false;
          },
        },
      );
    });
    test('source total bound and independent definition draft', () => {
      const session = setup('何もしない');
      for (let i = 0; i < 10; i++)
        session.project.actions.push({
          id: 'large-' + i,
          name: '長文' + i,
          args: [],
          source: '※' + 'x'.repeat(99998),
        });
      fail(session, {
        type: 'insert',
        parentId: session.blockView.id,
        body: 'body',
        index: 1,
        node: createBlock('NoOperation'),
      });
      const project = makeDefaultProject(),
        definition = { id: 'draft', name: '新動作', args: [], source: '何もしない' },
        draft = createEditorSession(
          'action:draft',
          '何もしない',
          { definition, definitionKind: 'action', args: [] },
          project,
          1,
        ),
        before = stableJson(project);
      const result = prepare(draft, {
        type: 'insert',
        parentId: draft.blockView.id,
        body: 'body',
        index: 1,
        node: createBlock('NoOperation'),
      });
      ok(result.changed && stableJson(project) === before && project.actions.length === 0);
    });
    test('long source focus ranges stay bounded and preserve intermediate access', () => {
      for (const length of [100, 1000, 4000, 8333, 16666]) {
        const last = Math.floor((length - 1) / 60),
          pages = new Set([last]),
          ranges = blockBodyRanges(length, 0, pages);
        ok(
          ranges[0][0] === 0 && ranges.at(-1)[1] === length,
          'first and selected last statements reachable',
        );
        ok(
          ranges.reduce((sum, [start, end]) => sum + end - start, 0) <= 120,
          'focus jump rendered the intervening body',
        );
        for (let page = 1; page < last; page++) pages.add(page);
        ok(
          stableJson(blockBodyRanges(length, 0, pages)) === stableJson([[0, length]]),
          'gap expansion lost or duplicated statements',
        );
      }
    });
    test('availability preview preserves pending transaction and commit gate', () => {
      const session = setup('1と言う。\n2と言う。'),
        location = { parentId: session.blockView.id, body: 'body', index: 1 };
      session.pendingEdit = {
        ownerKey: session.ownerKey,
        sourceRevision: session.sourceRevision,
        contextRevision: session.contextRevision,
        reason: 'ドラッグ操作中です',
      };
      const before = snapshot(session),
        available = blockInsertionAvailability(session, 'NoOperation', location);
      ok(available.enabled && available.node.schemaId === 'NoOperation');
      ok(snapshot(session) === before);
      fail(session, { type: 'insert', ...location, node: available.node });
      const stale = blockInsertionAvailability(
        session,
        'NoOperation',
        { ...location, index: 0 },
        { contextRevision: session.contextRevision - 1 },
      );
      ok(!stale.enabled && snapshot(session) === before);
    });
    test('availability generated names stay valid through collision boundary', () => {
      const chain = (base) => Array.from({ length: 31 }, (_, i) => base + '値'.repeat(i));
      const foreachNames = chain('項目'),
        foreachSource = foreachNames
          .map((name) => `名前一覧の各要素を${name}として、次のことをくり返す\n  何もしない`)
          .join('\n'),
        foreachSession = setup(foreachSource),
        foreachLocation = {
          parentId: foreachSession.blockView.id,
          body: 'body',
          index: foreachSession.blockView.bodies.body.length,
        },
        foreachAvailable = blockInsertionAvailability(foreachSession, 'ForEach', foreachLocation);
      ok(foreachAvailable.enabled);
      validateName(foreachAvailable.node.fields.binder);
      ok(
        cpLen(foreachAvailable.node.fields.binder) <= 32 &&
          !new Set(foreachNames).has(foreachAvailable.node.fields.binder),
      );
      const argNames = chain('結果'),
        project = makeDefaultProject(),
        definition = { id: 'boundary-action', name: '境界動作', args: argNames, source: '' },
        context = { definition, definitionKind: 'action', args: argNames },
        argSession = createEditorSession('action:boundary-action', '', context, project, 1),
        argLocation = { parentId: argSession.blockView.id, body: 'body', index: 0 },
        localVar = blockInsertionAvailability(
          argSession,
          'LocalVariableDeclaration',
          argLocation,
        );
      ok(localVar.enabled);
      validateName(localVar.node.fields.name);
      ok(
        cpLen(localVar.node.fields.name) <= 32 && !new Set(argNames).has(localVar.node.fields.name),
      );
      const declarationNames = chain('結果'),
        declarationSource = declarationNames
          .map((name) => `${name}という変数を作り、初期値を0にする`)
          .join('\n'),
        declarationDefinition = {
          id: 'boundary-declarations',
          name: '境界宣言',
          args: [],
          source: declarationSource,
        },
        declarationSession = createEditorSession(
          'action:boundary-declarations',
          declarationSource,
          { definition: declarationDefinition, definitionKind: 'action', args: [] },
          project,
          2,
        ),
        declarationLocation = {
          parentId: declarationSession.blockView.id,
          body: 'body',
          index: declarationSession.blockView.bodies.body.length,
        },
        localList = blockInsertionAvailability(
          declarationSession,
          'LocalListDeclaration',
          declarationLocation,
        );
      ok(localList.enabled);
      validateName(localList.node.fields.name);
      ok(
        cpLen(localList.node.fields.name) <= 32 &&
          !new Set(declarationNames).has(localList.node.fields.name),
      );
    });
    test('availability shares definite context restrictions and preserves dynamic types', () => {
      const session = setup('何もしない'),
        location = { parentId: session.blockView.id, body: 'body', index: 1 };
      ok(!blockInsertionAvailability(session, 'MotionCommand:MOVE', location).enabled);
      ok(!blockInsertionAvailability(session, 'Break', location).enabled);
      ok(blockInsertionAvailability(session, 'Assignment', location).enabled);
      const loopSession = setup('名前一覧の各要素を項目として、次のことをくり返す\n  何もしない'),
        loop = find(loopSession, 'ForEach'),
        nested = blockInsertionAvailability(loopSession, 'ForEach', {
          parentId: loop.id,
          body: 'body',
          index: 1,
        });
      ok(nested.enabled && nested.node.fields.binder !== '項目');
      const definition = { id: 'fn', name: '計算', args: [], source: '0を返す' },
        pure = setup(
          '0を返す',
          { definition, definitionKind: 'function', args: [] },
          'function:fn',
        );
      ok(
        !blockInsertionAvailability(pure, 'Say', {
          parentId: pure.blockView.id,
          body: 'body',
          index: 0,
        }).enabled,
      );
    });
    return {
      total: results.length,
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      results,
    };
  }
