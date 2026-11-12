function runEditorCoreTests() {
    const results = [],
      test = (id, fn) => {
        try {
          fn();
          results.push({ id: 'TEST-EDITOR ' + id, pass: true, detail: 'PASS' });
        } catch (error) {
          results.push({
            id: 'TEST-EDITOR ' + id,
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
      ok(blockZoomCore(20) === 2 && blockZoomCore(0.01) === 0.5);
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
        'もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする',
        session.context,
        session.project,
        5,
      );
      ok(
        broken.syntaxAst === null &&
          broken.blockView === null &&
          broken.sourceRevision === 1 &&
          broken.sourceText === 'もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする',
      );
    });
    test('context refresh preserves edited IDs selection and rebuilt node maps', () => {
      const project = makeDefaultProject(),
        definition = {ownerId:'stage',  id: 'draft', name: '動作名', args: [], source: '1を言う。\n2を言う。' },
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
      ok(edited.source === '1を言う。\n1を言う。\n9を言う。');
      ok(snapshot(session) === before);
    });
    test('semantics and incomplete definition header keep AST', () => {
      const project = makeDefaultProject(),
        definition = {ownerId:'stage',  id: 'draft-one', name: '', args: ['', '量', '量'], source: '' },
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
          '点数を1にする ※ 一緒 \n2回くり返す\n  何もしない\n点数を3にする',
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
      const session = setup('2回くり返す\n  何もしない'),
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
      let session = setup('※one\nもし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする\n  何もしない');
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
    // LANGUAGE.md 「コードとブロックで同じ本文を編集する」: the block of a body offers the memo of its heading line only when
    // the body has that line, as the view draws the memos whose condition holds.
    test('the memo of a heading line is offered only on a body with that line', () => {
      const offered = (session) =>
        BLOCK_SCHEMA_BY_ID.get(session.blockView.schemaId).annotations
          .filter((a) => a.editable !== false && (!a.when || session.blockView.fields[a.when]))
          .map((a) => a.key);
      const plain = setup('3回くり返す。\n  1秒待つ。'),
        headed = setup('作品を動かしたとき、\n  1秒待つ。');
      ok(JSON.stringify(offered(plain)) === '[]', 'without the line: ' + JSON.stringify(offered(plain)));
      ok(JSON.stringify(offered(headed)) === '["headingComment"]', 'with the line: ' + JSON.stringify(offered(headed)));
      const written = prepare(headed, { type: 'annotation', id: headed.blockView.id, key: 'headingComment', value: '※ ここから はじまる' });
      ok(written.sourceText === '作品を動かしたとき、  ※ ここから はじまる\n  1秒待つ。', written.sourceText);
    });
    test('comment closing boundary reassociation keeps IDs and content', () => {
      const session = setup('2回くり返す\n  何もしない\n点数を1にする\n※ tail  '),
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
      // (written to the left of the loop's body, the comment stays where the move put it: after the loop)
      ok(JSON.stringify(result.syntaxAst.body.map((n) => n.kind).slice(0, 2)) === JSON.stringify(['RepeatCount', 'CommentLine']));
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
      let session = setup('最小（1、2、3）を言う'),
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
        session.project.actions.push({ownerId:'stage',
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
        definition = {ownerId:'stage',  id: 'draft', name: '新動作', args: [], source: '何もしない' },
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
      const session = setup('1を言う。\n2を言う。'),
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
          .map((name) => `名前一覧の中身を先頭から一つずつ見て、次のことを行う\n  この中では、今見ているものを【${name}】と呼ぶ\n  何もしない`)
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
        definition = {ownerId:'stage',  id: 'boundary-action', name: '境界動作', args: argNames, source: '' },
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
          .map((name) => `この中だけで使う変数【${name}】を作り、最初は0にする`)
          .join('\n'),
        declarationDefinition = {ownerId:'stage',
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
    test('availability depends on the edited script, not on another script of the work', () => {
      // The answers are kept by content without the other scripts (projectAvailabilityText); this pins why. Each block is
      // checked on a candidate, which bypasses the kept answers, in works that differ only in another script's source.
      // Another script that does nothing, sends a signal, reads a name, says something, stores the answer in a name (read
      // by the check of a comparison with that name), and a 名人 text that defines a procedure (read as the work's 名人
      // procedures).
      const click = source => ({targetId: 'stage', event: 'click', source});
      const others = [click('何もしない。'), click('「あ」の合図を送る。'), click('点数を1にする。'), click('「あ」と言う。'), click('点数を答えにする。'),
        {id: 'core-other-meijin', mode: 'meijin', targetId: 'meijin', event: 'start', source: '【とぶ】という手順を、次のように作る。\n  いまのばしょから、上へ20歩動く。'}];
      const answer = (other, schemaId) => {
        const project = makeDefaultProject();
        project.scripts = [{targetId: 'stage', event: 'start', source: '何もしない'}, other];
        const session = createEditorSession('script:stage:start', '何もしない', {targetId: 'stage', event: 'start'}, project, 4);
        const location = {parentId: session.blockView.id, body: 'body', index: 1};
        const r = blockInsertionAvailability(session, schemaId, location, {candidateNode: createBlock(schemaId)});
        return JSON.stringify([r.enabled, r.reason ?? null]);
      };
      // Holes are draft placeholders with no candidate of their own; every other block is compared.
      const schemas = BLOCK_SCHEMAS.filter((schema) => schema.kind !== 'Hole');
      const enabled = new Set();
      for (const schema of schemas) {
        const first = answer(others[0], schema.id);
        for (const other of others.slice(1)) {
          const second = answer(other, schema.id);
          ok(second === first, schema.id + ' with ' + other.source + ': ' + second + ' != ' + first);
        }
        enabled.add(JSON.parse(first)[0]);
      }
      // Both answers occur, so the comparison is not of one refusal everywhere.
      ok(enabled.has(true) && enabled.has(false), 'answers seen: ' + [...enabled].join(','));
    });
    test('availability shares definite context restrictions and preserves dynamic types', () => {
      const session = setup('何もしない'),
        location = { parentId: session.blockView.id, body: 'body', index: 1 };
      ok(!blockInsertionAvailability(session, 'MotionCommand:MOVE', location).enabled);
      ok(!blockInsertionAvailability(session, 'Break', location).enabled);
      ok(blockInsertionAvailability(session, 'Assignment', location).enabled);
      const loopSession = setup('名前一覧の中身を先頭から一つずつ見て、次のことを行う\n  この中では、今見ているものを【項目】と呼ぶ\n  何もしない'),
        loop = find(loopSession, 'ForEach'),
        nested = blockInsertionAvailability(loopSession, 'ForEach', {
          parentId: loop.id,
          body: 'body',
          index: 1,
        });
      ok(nested.enabled && nested.node.fields.binder !== '項目');
      const definition = {ownerId:'stage',  id: 'fn', name: '計算', args: [], source: '0を返す' },
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
    // LANGUAGE.md 数・単位・発言: a new block starts with the movement 10歩. The palette
    // inserts the node that blockInsertionAvailability prepares for the chosen place.
    // LANGUAGE.md 動きの文: 前へ進む starts with 10歩 and いまのばしょから動く with 右へ10歩 (one direction);
    // 決めたばしょへ行く starts at the part's centre, and 〜のところへ行く at マウス when no other part exists.
    test('a name with an opening double bracket in it is written in name brackets from blocks and by a rename', () => {
      const context = { targetId: 'stage', event: 'start' };
      const names = (source, project) => {
        const read = parseSyntax(source, { ...context, symbols: buildSymbols(project) });
        ok(!read.syntaxDiagnostics.length, source + ' is read: ' + read.syntaxDiagnostics.map((d) => d.message).join(' / '));
        ok(!stableJson(read.ast).includes('"StringLiteral"'), source + ' holds no text');
        return [...stableJson(read.ast).matchAll(/"name":("[^"]*")/g)].map((m) => JSON.parse(m[1]));
      };
      for (const name of ['『あ』', 'あ『い', '『']) {
        const project = makeDefaultProject();
        project.projectData.variables.push({ id: 'core-quote', name, initialValue: 0 }, { id: 'core-score', name: '点数', initialValue: 0 });
        // Picked in a block, where the value is read and where it is set.
        for (const [source, written] of [
          ['点数を言う。\n1秒待つ。', '【' + name + '】を言う。\n1秒待つ。'],
          ['点数を1ふやす。\n1秒待つ。', '【' + name + '】を1ふやす。\n1秒待つ。'],
        ]) {
          project.scripts = [{ targetId: 'stage', event: 'start', source }];
          const session = createEditorSession('script:stage:start', source, context, project, 4),
            block = [...buildBlockIndex(session.blockView).values()].find((entry) => entry.node.fields.name === '点数').node,
            result = prepare(session, { type: 'field', id: block.id, key: 'name', value: name });
          ok(result.source === written, name + ' picked in ' + source + ': ' + result.source);
          ok(stableJson(names(result.source, project)) === stableJson([name]), name + ' read back from ' + result.source);
        }
        // Another variable renamed to it.
        project.projectData.variables.shift();
        project.scripts = [{ targetId: 'stage', event: 'start', source: '点数を言う。\n点数を1ふやす。\n【点数】＋1を言う。' }];
        const renamed = Akari.prepareResourceRename(project, 'data:core-score', name, {});
        ok(renamed.scripts[0].source === '【' + name + '】を言う。\n【' + name + '】を1ふやす。\n【' + name + '】＋1を言う。', name + ' renamed: ' + renamed.scripts[0].source);
        ok(stableJson(names(renamed.scripts[0].source, renamed)) === stableJson([name, name, name]), name + ' read back after the rename');
        ok(!compileProject(renamed).errors.length, name + ' renamed work is checked');
      }
      // A name with only the closing bracket in it reads without name brackets and is written so.
      const project = makeDefaultProject();
      project.projectData.variables.push({ id: 'core-score', name: '点数', initialValue: 0 });
      project.scripts = [{ targetId: 'stage', event: 'start', source: '点数を言う。' }];
      ok(Akari.prepareResourceRename(project, 'data:core-score', 'あ』い', {}).scripts[0].source === 'あ』いを言う。', 'a closing bracket alone');
      // Written without name brackets where it reads as the name, it is still read, and is written back in name brackets.
      project.projectData.variables.push({ id: 'core-quote', name: '『あ』', initialValue: 0 });
      const symbols = buildSymbols(project), bare = parseSyntax('『あ』を1にする。', { ...context, symbols });
      ok(!bare.syntaxDiagnostics.length && formatScript(bare.ast, { symbols }).trim() === '【『あ』】を1にする。', 'the name without name brackets');
      // In a value place the double brackets are a text.
      const text = parseSyntax('『あ』を言う。', { ...context, symbols });
      ok(!text.syntaxDiagnostics.length && formatScript(text.ast, { symbols }).trim() === '「あ」と言う。', 'the text in double brackets');
    });
    test('a part renamed to a name no text can hold is told as a name, and other names are written in', () => {
      const project = makeDefaultProject(),
        rename = (source, name) => {
          project.scripts = [{ targetId: 'stage', event: 'start', source }];
          try {
            return Akari.prepareResourceRename(project, 'component:sprite-1', name, {}).scripts[0].source;
          } catch (error) {
            ok(error instanceof AkariError, 'a controlled refusal: ' + error);
            return error.code + ' ' + error.message;
          }
        };
      project.components[0].name = 'ねこ';
      const told = (name) => 'S301 名前「' + name + '」には、本文に 書けない 文字が あります。この 部品は 本文で 使って いるので、空白や 「」【】（）［］、※ を けして ください';
      for (const [source, name, want] of [
        ['ねこは1歩進む。', 'ねこ（1）', told('ねこ（1）')],
        ['ねこは1歩進む。', 'くろ ねこ', told('くろ ねこ')],
        ['「ねこ」の大きさを言う。', 'ねこ（1）', told('ねこ（1）')],
        ['「ねこ」の大きさを言う。', 'くろ ねこ', told('くろ ねこ')],
        ['ねこは1歩進む。', 'あの数', '【あの数】は1歩進む。'],
        ['ねこは1歩進む。', 'みけ', 'みけは1歩進む。'],
        ['もし「ねこ」にふれているなら、\n  「やあ」と言う。', 'ねこ（1）', 'もし「ねこ（1）」にふれているなら、\n  「やあ」と言う。'],
      ]) {
        const got = rename(source, name);
        ok(got === want, source + ' to ' + name + ': ' + got);
      }
      // (a name in 【 】 or 「 」の follows the rule of names in a text: brackets and blanks are not read in it)
      project.components[0].name = 'ねこ（1）';
      for (const source of ['【ねこ（1）】は1歩進む。', '「ねこ（1）」の大きさを言う。']) {
        const read = parseSyntax(source, { targetId: 'stage', event: 'start', symbols: buildSymbols(project) });
        ok(!read.ast && read.syntaxDiagnostics[0]?.message === '名前「ねこ（1）」には 使えない 文字が あります。空白や 「」【】（）［］、※ を けして ください', source + ': ' + JSON.stringify(read.syntaxDiagnostics[0]));
      }
    });
    test('a variable renamed to a word that does not read bare in a sentence is written in name brackets there', () => {
      const project = makeDefaultProject();
      project.projectData.variables.push({ id: 'core-score', name: '点数', initialValue: 0 });
      for (const [source, want] of [
        ['点数が3より大きくなるまで待つ。', '【もし】が3より大きくなるまで待つ。'],
        ['点数が10より小さいあいだ、くり返す。\n  点数を1ふやす。', '【もし】が10より小さいあいだ、くり返す。\n  【もし】を1ふやす。'],
        ['点数を1ふやす。', 'もしを1ふやす。'],
      ]) {
        project.scripts = [{ targetId: 'stage', event: 'start', source }];
        const got = Akari.prepareResourceRename(project, 'data:core-score', 'もし', {}).scripts[0].source;
        ok(got === want, source + ': ' + got);
      }
    });
    test('a line break put into a text value changes only that value in the written text', () => {
      const context = { targetId: 'sprite-1', event: 'start' },
        project = makeDefaultProject();
      project.projectData.variables.push({ id: 'core-name', name: '名前', initialValue: '' }, { id: 'core-score', name: '点数', initialValue: 0 });
      // The other sentences are written in words another writing would change; they, the empty line and the memos stay.
      const rest = '\n\n※ つぎのメモ\n名前を答えにする。\n（「こんにちは、」と名前をつなげた文字）を言う。 ※ おわり';
      for (const newline of ['\n', '\r\n'])
        for (const [sentence, from, to, written] of [
          ['「あ」と言う。', 'あ', 'a\nb', '「a\nb」と言う。'],
          ['「あ」と言う。  ※ メモ', 'あ', 'a\nb', '「a\nb」と言う。  ※ メモ'],
          ['名前を「あ」にする。', 'あ', 'a\nb', '名前を「a\nb」にする。'],
          ['名前を「あ」にする', 'あ', '\nb\n', '名前を「\nb\n」にする'],
          ['「あ\nい」と言う。', 'あ\nい', 'あ\nう', '「あ\nう」と言う。'],
          ['名前を「あ\nい」にする。', 'あ\nい', 'あ\nい\nう', '名前を「あ\nい\nう」にする。'],
          ['「あ\nい」と言う。', 'あ\nい', 'え\nい', '「え\nい」と言う。'],
          ['「あ」とたずねて、答えを待つ。', 'あ', 'a\n※b', '「a\n※b」とたずねて、答えを待つ。'],
          ['3回くり返す。\n  「あ」と言う。 ※ め\n  点数を答えにする。', 'あ', 'a\n」b', '3回くり返す。\n  「a\n\\」b」と言う。 ※ め\n  点数を答えにする。'],
          ['「あ」と言います。', 'あ', 'a\nb', '「a\nb」と言います。'],
          ['「あ」と言う。', 'あ', 'ab', '「ab」と言う。'],
        ]) {
          // (the line breaks between the sentences are the text's; the ones inside a value are the value's)
          const lines = (text, value) => text.split(value).map((part) => part.replaceAll('\n', newline)).join(value);
          const source = lines('※ はじめのメモ\n' + sentence + rest, '「' + from + '」');
          project.scripts = [{ targetId: 'sprite-1', event: 'start', source }];
          const session = createEditorSession('script:sprite-1:start', source, context, project, 4),
            block = [...buildBlockIndex(session.blockView).values()].find((entry) => entry.node.schemaId === 'StringLiteral' && entry.node.fields.value === from).node,
            result = prepare(session, { type: 'field', id: block.id, key: 'value', value: to }),
            wanted = lines('※ はじめのメモ\n' + written + rest, '「' + to.replace('」', '\\」') + '」');
          ok(result.source === wanted, JSON.stringify(sentence) + ' with ' + JSON.stringify(to) + ': ' + JSON.stringify(result.source));
          const read = parseSyntax(result.source, { ...context, symbols: buildSymbols(project) });
          ok(!read.syntaxDiagnostics.length && stableJson(read.ast).includes(JSON.stringify(to)), JSON.stringify(to) + ' is read back');
        }
    });
    test('a sentence put after the last sentence of every kind starts its own line and leaves the lines before it as written', () => {
      const context = { targetId: 'sprite-1', event: 'start' },
        project = makeDefaultProject();
      project.projectData.variables.push({ id: 'core-score', name: '点数', initialValue: 0 });
      const open = (source) => {
          project.scripts = [{ targetId: 'sprite-1', event: 'start', source }];
          return createEditorSession('script:sprite-1:start', source, context, project, 4);
        },
        end = (session) => ({ parentId: session.blockView.id, body: 'body', index: session.blockView.bodies.body.length }),
        put = (session, schemaId) => prepare(session, { type: 'insert', ...end(session), node: createBlock(schemaId) }).source,
        last = (session) => session.blockView.bodies.body.at(-1),
        place = (session, block) => session.nodeMap.get(block.id).surface;
      // Each kind's sentence as the writer writes it. A gap is no sentence: it cannot be made. The wait for "that signal"
      // follows the sentence that sends one.
      const written = [];
      for (const schema of BLOCK_SCHEMAS.filter((entry) => entry.category === 'statement')) {
        if (schema.id === 'Hole:statement') {
          let refused = null;
          try {
            createBlock(schema.id);
          } catch (error) {
            refused = error;
          }
          ok(refused instanceof AkariError, 'a gap is made as a sentence');
          continue;
        }
        written.push([schema.id, put(open(schema.id === 'WaitBroadcastGroup' ? put(open(''), 'Broadcast') : ''), schema.id)]);
      }
      ok(written.length === 77 && written.some(([id, text]) => id === 'LooksCommand:SET_COLOR' && text === '色を「赤」にする。'), 'every kind of sentence is written: ' + written.length);
      // Sentences in the child's own words, and lines that hold two sentences.
      written.push(['LooksCommand:SET_COLOR', '色を「赤」にする'], ['WaitTime', '1秒待ちます'], ['Say', '10歩進んで、「やあ」と言う。'], ['MotionCommand:MOVE', '10歩進む。5歩進む。'], ['Say', '3回くり返す。\n  「やあ」と言う。\n「やあ」と言います'], ['CommentLine', '1秒待つ。\n※ メモ']);
      for (const [schemaId, text] of written)
        for (const memo of ['', ' ※ メモ'])
          for (const close of ['', '\n', '\n\n', '\r\n']) {
            const newline = close === '\r\n' ? close : '\n',
              before = (text + memo).replaceAll('\n', newline),
              session = open(before + close),
              sentence = last(session),
              found = place(session, sentence),
              name = schemaId + ' ' + JSON.stringify(before + close);
            ok(sentence.schemaId === schemaId, name + ' is read as ' + sentence.schemaId);
            // (a memo line has no sentence characters: its place is its lines)
            ok(found.extent && found.extent.end > found.extent.start && (schemaId === 'CommentLine' || (found.range && found.range.end > found.range.start)), name + ' has no place: ' + JSON.stringify(found));
            const result = put(session, 'NoOperation');
            ok(result === before + newline + '何もしない。' + close, name + ' then a sentence: ' + JSON.stringify(result));
          }
      // A part named before its verb: the sentence's place begins at its first character.
      const named = open('点数が10になるまで、' + project.components[0].name + 'は待つ。'),
        range = place(named, last(named)).range;
      ok(last(named).schemaId === 'WaitUntil' && range && range.start === 0 && range.end > 0, 'a part named late: ' + JSON.stringify(range));
      // The last sentence of a block's body, with the block's next sentence after it.
      for (const [inner, after] of [
        ['色を「赤」にする。', ''],
        ['色を「赤」にする ※ メモ', '\n'],
        ['10歩進んで、1秒待ちます ※ メモ', '\n10歩進む。'],
        ['2回くり返す。\n    1秒待ちます', '\n\n10歩進む。\n'],
      ]) {
        const session = open('3回くり返す。\n  ' + inner + after),
          body = session.blockView.bodies.body[0],
          result = prepare(session, { type: 'insert', parentId: body.id, body: 'body', index: body.bodies.body.length, node: createBlock('NoOperation') }).source;
        ok(result === '3回くり返す。\n  ' + inner + '\n  何もしない。' + after, JSON.stringify(inner + after) + ' in a block: ' + JSON.stringify(result));
      }
      // On the stage the sentence may be followed like any other.
      const stage = setup('色を「赤」にする。'),
        available = blockInsertionAvailability(stage, 'Say', end(stage));
      ok(available.enabled, 'a sentence after the colour sentence on the stage: ' + available.reason);
      ok(prepare(stage, { type: 'insert', ...end(stage), node: available.node }).source.startsWith('色を「赤」にする。\n'), 'the stage sentence stays on its line');
    });
    test('a sentence put beside sentences that share a line, or after a rule alone, takes its own line and leaves the other lines as written', () => {
      const context = { targetId: 'sprite-1', event: 'start' },
        project = makeDefaultProject();
      project.projectData.variables.push({ id: 'core-score', name: '点数', initialValue: 0 });
      const same = (got, want) => ok(stableJson(got) === stableJson(want), 'expected ' + stableJson(want) + '; got ' + stableJson(got));
      const put = (source, index, schemaId = 'NoOperation') => {
        project.scripts = [{ targetId: 'sprite-1', event: 'start', source }];
        const session = createEditorSession('script:sprite-1:start', source, context, project, 4);
        return prepare(session, { type: 'insert', parentId: session.blockView.id, body: 'body', index: index ?? session.blockView.bodies.body.length, node: createBlock(schemaId) }).source;
      };
      const shared = '1秒待ちます。\n10歩進んで、「やあ」と言う。 ※ メモ\n10歩進む。';
      // (only the shared line is written again when the new sentence goes into it)
      same([0, 1, 2, 3, 4].map((index) => put(shared, index)), [
        '何もしない。\n' + shared,
        '1秒待ちます。\n何もしない。\n10歩進んで、「やあ」と言う。 ※ メモ\n10歩進む。',
        '1秒待ちます。\n前へ10歩進む。\n何もしない。\n「やあ」と言う。  ※ メモ\n10歩進む。',
        '1秒待ちます。\n10歩進んで、「やあ」と言う。 ※ メモ\n何もしない。\n10歩進む。',
        shared + '\n何もしない。',
      ]);
      same(put('10歩進んで、「やあ」と言う。', 0), '何もしない。\n10歩進んで、「やあ」と言う。');
      const rule = '点数が0以上のあいだ、自分は右へ1秒に60歩の速さで動き続ける。';
      same([put(rule), put(rule + '\n')], [rule + '\n何もしない。', rule + '\n何もしない。\n']);
      // (a heading with no sentence under it: the new one goes one step in, and the heading stays as written)
      same([put('「a」の合図を受けたとき、'), put('「a」の合図を受けたとき、\n')], ['「a」の合図を受けたとき、\n  何もしない。', '「a」の合図を受けたとき、\n  何もしない。\n']);
      // (a subject carried from the sentence before is not the new sentence's: it names itself; with none, none is added)
      const late = '点数が10になるまで、' + project.components[0].name + 'は待つ。';
      same([put(late), put(late, undefined, 'MotionCommand:MOVE'), put('1秒待ちます。')], [late + '\n自分は何もしない。', late + '\n自分は前へ10歩進む。', '1秒待ちます。\n何もしない。']);
    });
    test('palette motion blocks start at ten steps', () => {
      const context = { targetId: 'sprite-1', event: 'start' },
        project = makeDefaultProject(),
        steps = (n) => ({ kind: 'QuantityLiteral', value: { kind: 'NumberLiteral', value: n }, unit: '歩' }),
        plain = (value) => JSON.parse(JSON.stringify(value ?? null, (key, v) => (key === 'sourceSpan' ? undefined : v))),
        sprite = project.components.find((c) => c.id === 'sprite-1');
      project.scripts = [{ targetId: 'sprite-1', event: 'start', source: '' }];
      ok(project.components.length === 1, 'the default work has one part');
      for (const [schemaId, op, check, text] of [
        ['MotionCommand:MOVE', 'MOVE', (n) => stableJson(plain(n.args)) === stableJson([steps(10)]) && n.direction === 'forward', '前へ10歩進む。'],
        ['MotionCommand:MOVE_BY', 'MOVE_BY', (n) => stableJson(plain(n.x)) === stableJson(steps(10)) && n.xDir === 'right' && n.y === undefined, 'いまのばしょから、右へ10歩動く。'],
        ['MotionCommand:GOTO', 'GOTO', (n) => stableJson(plain(n.x)) === stableJson(steps(sprite.x)) && stableJson(plain(n.y)) === stableJson(steps(sprite.y)) && n.xDir === 'right' && n.yDir === 'up', '画面の左下のはしから、右へ' + sprite.x + '歩、上へ' + sprite.y + '歩のばしょへ行く。'],
        ['MotionCommand:GOTO_PART', 'GOTO_PART', (n) => stableJson(plain(n.args)) === stableJson([{ kind: 'StringLiteral', value: 'マウス' }]), 'マウスのところへ行く。'],
      ]) {
        const session = createEditorSession('script:sprite-1:start', '', context, project, 1),
          location = { parentId: session.blockView.id, body: 'body', index: 0 },
          available = blockInsertionAvailability(session, schemaId, location, { project, context });
        ok(available.enabled && available.node?.schemaId === schemaId, schemaId + ' palette insertion: ' + available.reason);
        const result = prepare(session, { type: 'insert', ...location, node: available.node }),
          body = parseScript(result.source, buildSymbols(project), context).body;
        ok(body.length === 1 && body[0].kind === 'MotionCommand' && body[0].op === op, schemaId + ' inserted statement');
        ok(check(body[0]), schemaId + ' default: ' + result.source);
        ok(result.source.trim() === text, schemaId + ' source: ' + result.source);
      }
    });
    // LANGUAGE.md 「コードとブロックで同じ本文を編集する」 (入れられない場所): a value goes only where the list would put it. The view asks this check before a
    // carried value goes into a hole (candidateNode, and sourceId for one carried from the same script), and the list
    // asks it for its own block of the kind. Each row: name, script, the value carried (schema id, nth), the place
    // (schema id, nth, input name | index of its inputs | [name, index]), the answer wanted for the carried value and
    // for the list's block (true: goes; a reason: refused with exactly it), and options (owner of the body, the
    // block selected, carried: false for a value not of this script).
    const WHY = {
      partner: 'ふれる 相手は、部品か 画面のはしか マウスです。数には ふれられません。れい：もし「星」にふれていれば、',
      key: '「おされたキー」は「キーを おしたとき」の きっかけの 本文で 使います',
      colourNiji: '色「にじ色」は 使える 色では ありません。使える 色は 黒・白・ねずみ色・赤・だいだい・黄・緑・水色・青・むらさき・もも色・茶 です',
      colourNone: '色の 名前が 空です。「 」の 中に 色の 名前を 書いて ください。使える 色は 黒・白・ねずみ色・赤・だいだい・黄・緑・水色・青・むらさき・もも色・茶 です',
      colourSora: '色「そら色」は 使える 色では ありません。使える 色は 黒・白・ねずみ色・赤・だいだい・黄・緑・水色・青・むらさき・もも色・茶 です',
      list: 'リストは そのまま 言えません。中身を 言う ときは「持ち物の1番目を言う」のように 書きます',
      writeOn: '文字をかえる部品「ロケット」は ここでは 使えません。使える 部品を えらんで ください',
      goTo: '「〜のところへ行く」の 行き先には、部品の 名前（れい：「星」）か マウスを 書きます',
      stageTouch: '「「ロケット」にふれている」は 画面では 使えません。キャラクターの 本文で 使って ください',
      stageTouchNone: '「〜にふれている」は 画面では 使えません。キャラクターの 本文で 使って ください',
      // (an empty text names no part: the list's new text is not put where a name is read)
      emptyName: 'からっぽの 文字は 名前に ならない ので、そこには 入れられないよ。名前を 書いた 文字を 入れてね。',
      field: '入力らん「ロケット」は ここでは 使えません。使える 部品を えらんで ください',
    };
    const carryAnswers = (source, from, to, { owner = 'part-0', selected = null, carried = true } = {}) => {
      const project = makeDefaultProject(),
        base = project.components.find((c) => c.type === 'sprite'),
        context = { targetId: owner, event: 'start' },
        nodes = [];
      project.components = ['ねこ', '星', 'ロケット', 'はし'].map((name, i) => ({
        ...JSON.parse(JSON.stringify(base)),
        id: 'part-' + i,
        name,
        costumes: [{ id: 'face-' + i, name: '顔', kind: 'text', value: '●' }],
        costumeId: 'face-' + i,
        localData: { variables: [], lists: [] },
      }));
      project.projectData = {
        variables: [{ id: 'v-score', name: '点数', initialValue: 0 }, { id: 'v-name', name: '名前', initialValue: '' }],
        lists: [{ id: 'l-items', name: '持ち物', initialValue: ['本'] }],
      };
      project.actions = [];
      project.functions = [];
      project.sounds = [];
      project.scripts = [{ id: 'body', targetId: owner, event: 'start', source }];
      const made = createEditorSession('script:' + owner + ':start', source, context, project, 4);
      (function walk(node) {
        nodes.push(node);
        for (const value of Object.values(node.inputs || {})) (Array.isArray(value) ? value : [value]).forEach((child) => child && walk(child));
        for (const body of Object.values(node.bodies || {})) body.forEach(walk);
      })(made.blockView);
      const pick = ([id, nth]) => nodes.filter((node) => node.schemaId === id)[nth],
        session = selected ? { ...made, blockSelection: pick(selected).id } : made,
        value = pick(from),
        holder = pick(to),
        input = to[2];
      ok(value && holder, 'blocks of the script: ' + nodes.map((node) => node.schemaId).join(' '));
      const place = Array.isArray(input)
          ? { parentId: holder.id, input: input[0], index: input[1] }
          : { parentId: holder.id, input: typeof input === 'number' ? Object.keys(holder.inputs)[input] : input },
        answer = (r) => (r.enabled ? true : r.reason);
      return [
        answer(blockInsertionAvailability(session, value.schemaId, place, { project, context, candidateNode: value, ...(carried ? { sourceId: value.id } : {}) })),
        answer(blockInsertionAvailability(session, value.schemaId, place, { project, context })),
      ];
    };
    const carryTable = (rows) => {
      const wrong = [];
      for (const [name, source, from, to, wantCarried, wantList, options] of rows) {
        const [carried, list] = carryAnswers(source, from, to, options);
        if (carried !== wantCarried) wrong.push(name + ': carried ' + JSON.stringify(carried));
        if (list !== wantList) wrong.push(name + ': the list block ' + JSON.stringify(list));
      }
      ok(!wrong.length, wrong.join('; '));
    };
    const TOUCH_STAR = 'もし「星」にふれているなら、\n  「やあ」と言う。';
    test('a value carried into a hole is refused for its place and not for a mistake it had before', () => {
      ok(carryAnswers(TOUCH_STAR + '\n3を言う。', ['NumberLiteral', 0], ['SensorRead:TOUCHING', 0, 0])[0] === WHY.partner, 'a refusal is told with its reason');
      carryTable([
        ['1 a number to a touch partner', 'もし「星」にふれているなら、\n  「やあ」と言う。\n3を言う。', ['NumberLiteral', 0], ['SensorRead:TOUCHING', 0, 0], WHY.partner, WHY.partner],
        ['2 a wrong colour to the left of a sum', '「にじ色」の色にふれているを言う。\n1＋2を言う。', ['SensorRead:TOUCHING_COLOR', 0], ['BinaryExpression:ADD', 0, 'left'], true, true],
        ['3 a number in a wrong partner hole to a right partner hole', 'もし3にふれているなら、\n  「やあ」と言う。\nもし「星」にふれているなら、\n  「やあ」と言う。', ['NumberLiteral', 0], ['SensorRead:TOUCHING', 1, 0], WHY.partner, WHY.partner],
        ['4 a number beside a wrong partner to a right partner hole', 'もし3にふれているかつ点数が4以上なら、\n  「やあ」と言う。\nもし「星」にふれているなら、\n  「やあ」と言う。', ['NumberLiteral', 1], ['SensorRead:TOUCHING', 1, 0], WHY.partner, WHY.partner],
        ['5 a trigger-only value to the left of a sum', 'おされたキーを言う。\n1＋2を言う。', ['SensorRead:押されたキー', 0], ['BinaryExpression:ADD', 0, 'left'], WHY.key, WHY.key],
        ['6 a text that names no part to a touch partner', '「やあ」と言う。\nもし「星」にふれているなら、\n  「やあ」と言う。', ['StringLiteral', 0], ['SensorRead:TOUCHING', 0, 0], true, WHY.emptyName],
        ['7 a text that names a part to a touch partner', '「ロケット」と言う。\nもし「星」にふれているなら、\n  「やあ」と言う。', ['StringLiteral', 0], ['SensorRead:TOUCHING', 0, 0], true, WHY.emptyName],
        ['8 a number to the left of a sum', '3を言う。\n1＋2を言う。', ['NumberLiteral', 0], ['BinaryExpression:ADD', 0, 'left'], true, true],
        ['9 a wrong colour to the condition of もし', '「にじ色」の色にふれているを言う。\nもし点数が1と同じなら、\n  「やあ」と言う。', ['SensorRead:TOUCHING_COLOR', 0], ['IfStatement', 0, 'condition'], true, true],
        ['10 a wrong colour within its own line', 'もし「にじ色」の色にふれているかつ点数が1以上なら、\n  「やあ」と言う。', ['SensorRead:TOUCHING_COLOR', 0], ['LogicalExpression:AND', 0, 'right'], true, true],
        ['11 a wrong colour onto its own place', '「にじ色」の色にふれているを言う。', ['SensorRead:TOUCHING_COLOR', 0], ['Say', 0, 0], true, true],
        ['12 a wrong colour to a touch partner', '「にじ色」の色にふれているを言う。\nもし「星」にふれているなら、\n  「やあ」と言う。', ['SensorRead:TOUCHING_COLOR', 0], ['SensorRead:TOUCHING', 0, 0], true, true],
        ['13 a right colour to the left of a sum', '「赤」の色にふれているを言う。\n1＋2を言う。', ['SensorRead:TOUCHING_COLOR', 0], ['BinaryExpression:ADD', 0, 'left'], true, true],
        ['14 a wrong colour to a part of a join', '「にじ色」の色にふれているを言う。\nつなぐ（「あ」、「い」）を言う。', ['SensorRead:TOUCHING_COLOR', 0], ['BuiltinCall:つなぐ', 0, ['args', 0]], true, true],
        ['15 a number to the number compared beside a wrong partner', '5を言う。\nもし3にふれているかつ点数が4以上なら、\n  「やあ」と言う。', ['NumberLiteral', 0], ['CompareExpression:GTE', 0, 'right'], true, true],
        ['16 a number to a part of a join beside a wrong colour', '5を言う。\n（「にじ色」の色にふれている）と3をつなげて言う。', ['NumberLiteral', 0], ['BuiltinCall:つなぐ', 0, ['args', 1]], true, true],
        ['17 a number to the second partner beside a wrong partner', '5を言う。\nもし3にふれているかつ「星」にふれているなら、\n  「やあ」と言う。', ['NumberLiteral', 0], ['SensorRead:TOUCHING', 1, 0], WHY.partner, WHY.partner],
        ['18 a wrong colour to a sum beside a wrong partner', '「にじ色」の色にふれているを言う。\nもし3にふれているかつ1＋2が4以上なら、\n  「やあ」と言う。', ['SensorRead:TOUCHING_COLOR', 0], ['BinaryExpression:ADD', 0, 'left'], true, true],
        ['19 a number onto a number that is a wrong partner', '5を言う。\nもし3にふれているなら、\n  「やあ」と言う。', ['NumberLiteral', 0], ['SensorRead:TOUCHING', 0, 0], WHY.partner, WHY.partner],
        ['20 a wrong colour to the colour hole', '「にじ色」の色にふれているを言う。\n「赤」の色にふれているを言う。', ['SensorRead:TOUCHING_COLOR', 0], ['SensorRead:TOUCHING_COLOR', 1, 0], true, true],
        ['21 a wrong colour from a body to the left of a sum', 'もし「星」にふれているなら、\n  「にじ色」の色にふれているを言う。\n1＋2を言う。', ['SensorRead:TOUCHING_COLOR', 0], ['BinaryExpression:ADD', 0, 'left'], true, true],
        ['22 a second wrong colour to the left of a sum', '「にじ色」の色にふれているを言う。\n「そら色」の色にふれているを言う。\n1＋2を言う。', ['SensorRead:TOUCHING_COLOR', 1], ['BinaryExpression:ADD', 0, 'left'], true, true],
        ['23 a text that names no colour to the colour hole', '「にじ色」と言う。\n「赤」の色にふれているを言う。', ['StringLiteral', 0], ['SensorRead:TOUCHING_COLOR', 0, 0], WHY.colourNiji, WHY.colourNone],
        ['24 a text that names a colour to the colour hole', '「青」と言う。\n「赤」の色にふれているを言う。', ['StringLiteral', 0], ['SensorRead:TOUCHING_COLOR', 0, 0], true, WHY.colourNone],
        ['25 a list said as it is to the left of a sum', '持ち物を言う。\n1＋2を言う。', ['VariableRead', 0], ['BinaryExpression:ADD', 0, 'left'], true, true],
      ]);
    });
    test('a value carried into a hole brings the mistake of how it stood in its place', () => {
      carryTable([
        ['31 a list said as it is to another say', '持ち物を言う。\n3を言う。', ['VariableRead', 0], ['Say', 1, 0], WHY.list, true],
        ['32 a list from a count to a say', '持ち物の数を言う。\n3を言う。', ['VariableRead', 0], ['Say', 1, 0], WHY.list, true],
        ['33 a size touched to a clean partner', 'もし「星」の大きさにふれているなら、\n  「やあ」と言う。\nもし「ロケット」にふれているなら、\n  「やあ」と言う。', ['ActorQualifiedRead', 0], ['SensorRead:TOUCHING', 1, 0], WHY.partner, true],
        ['34 a size said to a clean partner', '「星」の大きさを言う。\nもし「ロケット」にふれているなら、\n  「やあ」と言う。', ['ActorQualifiedRead', 0], ['SensorRead:TOUCHING', 0, 0], WHY.partner, true],
        ['35 a sum onto a number that is a wrong partner', '1＋2を言う。\nもし3にふれているなら、\n  「やあ」と言う。', ['BinaryExpression:ADD', 0], ['SensorRead:TOUCHING', 0, 0], WHY.partner, WHY.partner],
        ['36 a text beside a trigger-only value', 'おされたキーと「い」をつなげて言う。', ['StringLiteral', 0], ['BuiltinCall:つなぐ', 0, ['args', 1]], true, true],
        ['37 a sum holding a wrong colour to a clean partner', '（「にじ色」の色にふれている）＋2を言う。\nもし「星」にふれているなら、\n  「やあ」と言う。', ['BinaryExpression:ADD', 0], ['SensorRead:TOUCHING', 0, 0], WHY.partner, WHY.partner],
      ]);
    });
    test('a hole of a line with a mistake takes a value that the mistake is not about', () => {
      carryTable([
        ['R1 a text beside a list said as it is', '持ち物と「い」をつなげて言う。\n「う」と言う。', ['StringLiteral', 1], ['BuiltinCall:つなぐ', 0, ['args', 1]], true, true],
        ['R2 a list beside a list said as it is', '持ち物と「い」をつなげて言う。\n持ち物の数を言う。', ['VariableRead', 1], ['BuiltinCall:つなぐ', 0, ['args', 1]], WHY.list, true],
        ['R3 a number to the seconds of a say of a list', '持ち物を2秒言う。\n5を言う。', ['NumberLiteral', 1], ['QuantityLiteral', 0, 'value'], true, true],
        ['R4 a text beside a wrong part to write on', '「星」の文字を「あ」にかえる。\n「う」と言う。', ['StringLiteral', 2], ['LooksCommand:SET_TARGET_TEXT', 0, ['args', 1]], true, true],
        ['R5 a text onto a wrong part to write on', '「星」の文字を「あ」にかえる。\n「ロケット」と言う。', ['StringLiteral', 2], ['LooksCommand:SET_TARGET_TEXT', 0, ['args', 0]], WHY.writeOn, WHY.emptyName],
        ['R6 a number to the seconds of a go to a number', '2秒かけて3のところへ行く。\n5を言う。', ['NumberLiteral', 2], ['QuantityLiteral', 0, 'value'], true, true],
        ['R7 a number onto a number gone to', '2秒かけて3のところへ行く。\n5を言う。', ['NumberLiteral', 2], ['MotionCommand:GOTO_PART', 0, ['args', 0]], WHY.goTo, WHY.goTo],
        ['R8 a trigger-only value beside one', 'おされたキーと「い」をつなげて言う。\nおされたキーを言う。', ['SensorRead:押されたキー', 1], ['BuiltinCall:つなぐ', 0, ['args', 1]], WHY.key, WHY.key],
        ['R9 a text to a partner in a stage body', 'もし「星」にふれているなら、\n  「やあ」と言う。\n「ロケット」と言う。', ['StringLiteral', 2], ['SensorRead:TOUCHING', 0, 0], WHY.stageTouch, WHY.stageTouchNone, { owner: 'stage' }],
        ['R10 a number to the steps of a move in a stage body', '10歩進む。\n5を言う。', ['NumberLiteral', 1], ['QuantityLiteral', 0, 'value'], true, true, { owner: 'stage' }],
        ['R11 a right colour onto a wrong colour of a pen', 'ペンの色を「にじ色」にする。\n「青」と言う。', ['StringLiteral', 1], ['PenCommand:SET_COLOR', 0, ['args', 0]], true, WHY.colourNone],
        ['R12 a wrong colour onto a wrong colour of a pen', 'ペンの色を「にじ色」にする。\n「そら色」と言う。', ['StringLiteral', 1], ['PenCommand:SET_COLOR', 0, ['args', 0]], WHY.colourSora, WHY.colourNone],
        ['R13 a part onto a number gone to', '2秒かけて3のところへ行く。\n「星」と言う。', ['StringLiteral', 0], ['MotionCommand:GOTO_PART', 0, ['args', 0]], true, WHY.emptyName],
        ['R14 a text to a say of a list', '持ち物を2秒言う。\n「う」と言う。', ['StringLiteral', 0], ['Say', 0, 'value'], true, true],
        ['R15 a second list beside a value in a say', '点数と「い」をつなげて言う。\n持ち物の数を言う。', ['VariableRead', 1], ['BuiltinCall:つなぐ', 0, ['args', 1]], WHY.list, true],
        ['R16 a field value of a wrong part to the left of a sum', '「星」の中身を言う。\n1＋2を言う。', ['SensorRead:INPUT_VALUE', 0], ['BinaryExpression:ADD', 0, 'left'], true, '入力らんを 先に 作ります'],
        ['R17 a text onto the wrong part of a field value', '「星」の中身を言う。\n「ロケット」と言う。', ['StringLiteral', 1], ['SensorRead:INPUT_VALUE', 0, 0], WHY.field, WHY.emptyName],
        ['R18 a text beside a field value of a wrong part', '「星」の中身と「い」をつなげて言う。\n「う」と言う。', ['StringLiteral', 2], ['BuiltinCall:つなぐ', 0, ['args', 1]], true, true],
        ['R19 a field value of a wrong part to a clean partner', '「星」の中身を言う。\nもし「星」にふれているなら、\n  「やあ」と言う。', ['SensorRead:INPUT_VALUE', 0], ['SensorRead:TOUCHING', 0, 0], true, '入力らんを 先に 作ります'],
        ['R20 a join holding a list from a say to another say', '持ち物と「い」をつなげて言う。\n3を言う。', ['BuiltinCall:つなぐ', 0], ['Say', 1, 0], WHY.list, true],
        ['R21 a join holding a list to the left of a sum', '持ち物と「い」をつなげて言う。\n1＋2を言う。', ['BuiltinCall:つなぐ', 0], ['BinaryExpression:ADD', 0, 'left'], true, true],
        ['R22 a list said as it is onto its own place', '持ち物を言う。', ['VariableRead', 0], ['Say', 0, 0], true, true],
        ['R23 a field value of a wrong part onto its own place', '「星」の中身を言う。', ['SensorRead:INPUT_VALUE', 0], ['Say', 0, 0], true, '入力らんを 先に 作ります'],
        ['R24 a number to the number added beside a field value of a wrong part', '「星」の中身＋2を言う。\n5を言う。', ['NumberLiteral', 1], ['BinaryExpression:ADD', 0, 'right'], true, true],
      ]);
    });
    test('a value put where an equal value stands is judged at that place whatever is selected', () => {
      carryTable([
        ['P1 equal number, nothing selected', 'もし3にふれているなら、\n  「やあ」と言う。\n5を言う。\n5を言う。', ['NumberLiteral', 1], ['Say', 2, 0], true, true, { carried: false }],
        ['P2 equal number, the wrong partner selected', 'もし3にふれているなら、\n  「やあ」と言う。\n5を言う。\n5を言う。', ['NumberLiteral', 1], ['Say', 2, 0], true, true, { carried: false, selected: ['NumberLiteral', 0] }],
        ['P3 equal number, the wrong partner selected, carried', 'もし3にふれているなら、\n  「やあ」と言う。\n5を言う。\n5を言う。', ['NumberLiteral', 1], ['Say', 2, 0], true, true, { selected: ['NumberLiteral', 0] }],
        ['P4 other number, the wrong partner selected', 'もし3にふれているなら、\n  「やあ」と言う。\n5を言う。\n6を言う。', ['NumberLiteral', 1], ['Say', 2, 0], true, true, { carried: false, selected: ['NumberLiteral', 0] }],
        ['P5 equal wrong partner onto itself, nothing selected', 'もし3にふれているなら、\n  「やあ」と言う。\n3を言う。', ['NumberLiteral', 1], ['SensorRead:TOUCHING', 0, 0], true, WHY.partner, { carried: false }],
        ['P6 equal wrong partner onto itself, it is selected', 'もし3にふれているなら、\n  「やあ」と言う。\n3を言う。', ['NumberLiteral', 1], ['SensorRead:TOUCHING', 0, 0], true, WHY.partner, { carried: false, selected: ['NumberLiteral', 0] }],
        ['P7 other wrong partner, nothing selected', 'もし3にふれているなら、\n  「やあ」と言う。\n4を言う。', ['NumberLiteral', 1], ['SensorRead:TOUCHING', 0, 0], WHY.partner, WHY.partner, { carried: false }],
        ['P8 a list said onto an equal list said, nothing selected', '持ち物を言う。\n持ち物を言う。', ['VariableRead', 0], ['Say', 1, 0], true, true],
        ['P9 a list said onto an equal list said, first say selected', '持ち物を言う。\n持ち物を言う。', ['VariableRead', 0], ['Say', 1, 0], true, true, { selected: ['Say', 0] }],
        ['P10 a list said onto its own place, nothing selected', '持ち物を言う。', ['VariableRead', 0], ['Say', 0, 0], true, true],
        ['P11 a list said onto its own place, it is selected', '持ち物を言う。', ['VariableRead', 0], ['Say', 0, 0], true, true, { selected: ['VariableRead', 0] }],
      ]);
    });
    // LANGUAGE.md できごとの回数で待つ・くり返す and ブロックで組む: a count condition is put only where it counts, a new
    // block names what the work has, and a block that is not put in tells its own reason.
    const COUNT_PLACE = '回数の 条件（〜回おされる、〜回【手順】する）は「〜まで待つ」と「〜まで、くり返す」の 中で 使います',
      COUNT_LAST = '回数の 条件（〜回おされる、〜回【手順】する）は、ここには 入れられません。「〜まで待つ」「〜まで、くり返す」の 条件の いちばん 後ろに 入れます',
      PLACE_UNFIT = 'その ブロックは そこには 入れられないよ。合う ばしょを えらんでね。',
      jump = (project) => { project.actions = [{ id: 'a-jump', ownerId: 'stage', name: 'とぶ', args: [], source: '1秒待つ。' }]; },
      inputField = (name) => (project) => {
        const part = { ...JSON.parse(JSON.stringify(project.components[0])), id: 'input-1', type: 'input', name, text: '' };
        delete part.costumes; delete part.costumeId;
        project.components.push(part);
      };
    const placeWork = (source, change = () => {}, targetId = 'sprite-1') => {
      const project = makeDefaultProject(), context = { targetId, event: 'start' };
      project.projectData = { variables: [{ id: 'v-score', name: '点数', initialValue: 0 }], lists: [{ id: 'l-items', name: '持ち物', initialValue: ['本'] }] };
      change(project);
      project.scripts = [{ targetId, event: 'start', source }];
      const session = createEditorSession('script:' + targetId + ':start', source, context, project, 4),
        index = buildBlockIndex(session.blockView),
        nodes = [...index.values()].map((entry) => entry.node),
        // the place a value of the body stands in, and the asking of a value of the body carried to a place
        place = (node) => {
          const entry = index.get(node.id);
          return { parentId: entry.parentId, input: entry.input, ...(entry.index === null ? {} : { index: entry.index }) };
        },
        carry = (node, location) => ask(node.schemaId, location, { candidateNode: node, sourceId: node.id }),
        at = (schemaId, input, nth = 0) => ({ parentId: nodes.filter((n) => n.schemaId === schemaId)[nth].id, input }),
        ask = (schemaId, location, extra = {}) => blockInsertionAvailability(session, schemaId, location, { project, context, ...extra }),
        // the text and the mistakes of the work after the offered block is put in
        put = (available, location) => {
          const text = prepare(session, { type: 'expression', ...location, node: available.node }, { project, context }).source.trim(),
            next = JSON.parse(JSON.stringify(project));
          next.scripts[0].source = text;
          return { text, codes: compileProject(next).errors.map((e) => e.code) };
        };
      return { project, context, session, nodes, at, ask, put, place, carry };
    };
    const refused = (available, reason, name) =>
      ok(!available.enabled && available.reason === reason, name + ': ' + (available.enabled ? 'offered' : available.reason));
    test('a count condition is offered only in the condition of an until, new or carried', () => {
      for (const id of ['EventCount:click', 'EventCount:action']) {
        const outside = placeWork('「やあ」と言う。\nもし点数が3より大きいなら、\n  1秒待つ。', jump);
        refused(outside.ask(id, outside.at('Say', 'value')), COUNT_PLACE, id + ' to a say');
        refused(outside.ask(id, outside.at('IfStatement', 'condition')), COUNT_PLACE, id + ' to the condition of もし');
        for (const [source, kind, input] of [
          ['点数が3になるまで待つ。', 'WaitUntil', 'condition'],
          ['点数が3になるまで、くり返す。\n  1秒待つ。', 'RepeatUntil', 'condition'],
          ['点数が3以上か、点数が1になるまで待つ。', 'LogicalExpression:OR', 'left'],
          ['点数が3以上か、点数が1になるまで待つ。', 'LogicalExpression:OR', 'right'],
          ['点数が3以上で、点数が1になるまで待つ。', 'LogicalExpression:AND', 'right'],
        ]) {
          const inside = placeWork(source, jump), location = inside.at(kind, input), available = inside.ask(id, location);
          ok(available.enabled, id + ' to ' + kind + '.' + input + ' of ' + source + ': ' + available.reason);
          const landed = inside.put(available, location);
          ok(landed.codes.length === 0 && /自分が3回(おされる|【とぶ】する)/.test(landed.text), id + ' in ' + source + ': ' + stableJson(landed));
        }
      }
      const moved = placeWork('自分が3回おされるまで待つ。\n「やあ」と言う。\n点数が3になるまで待つ。'),
        count = moved.nodes.find((n) => n.schemaId === 'EventCount:click'), carried = { candidateNode: count, sourceId: count.id };
      refused(moved.ask(count.schemaId, moved.at('Say', 'value'), carried), COUNT_PLACE, 'a carried count to a say');
      ok(moved.ask(count.schemaId, moved.at('WaitUntil', 'condition', 1), carried).enabled, 'a carried count to another until');
    });
    test('the editor tells a count condition written outside an until and the line still takes values', () => {
      const w = placeWork('もし条件（自分が3回おされる）が成り立つなら、\n  3を言う。');
      ok(stableJson(w.session.diagnostics.map((d) => [d.code, d.line, d.message])) === stableJson([['S314', 1, COUNT_PLACE]]), stableJson(w.session.diagnostics));
      for (const location of [w.at('Say', 'value'), w.at('EventCount:click', 'count')]) {
        const available = w.ask('NumberLiteral', location);
        ok(available.enabled, 'a number beside a count that stands: ' + available.reason);
      }
      ok(placeWork('自分が3回おされるまで待つ。').session.diagnostics.length === 0, 'a count in an until has no mistake');
    });
    test('a block whose text would not read back in a place is refused with its own reason', () => {
      const until = placeWork('点数が3以上で、点数が1になるまで待つ。');
      refused(until.ask('EventCount:click', until.at('LogicalExpression:AND', 'left')), COUNT_LAST, 'a count to the left of で、');
      refused(until.ask('EventCount:click', until.at('CompareExpression:GTE', 'left')), COUNT_LAST, 'a count to a compared value in an until');
      const branch = placeWork('もし点数が3より大きいなら、\n  1秒待つ。'), left = branch.at('CompareExpression:GT', 'left'),
        answer = branch.ask('EventCount:click', left);
      refused(answer, COUNT_PLACE, 'a count to a compared value in もし');
      ok(answer.diagnostics.length === 1 && answer.diagnostics[0].code === 'E901' && answer.diagnostics[0].message === COUNT_PLACE, stableJson(answer.diagnostics));
      // the edit itself keeps the words of the reader
      let told = '';
      try { prepare(branch.session, { type: 'expression', ...left, node: createBlock('EventCount:click') }, { project: branch.project, context: branch.context }); } catch (error) { told = error.message; }
      ok(told.startsWith('「より」は 1回だけ'), 'the edit: ' + told);
      const field = placeWork('「入力らん1」に「こんにちは」を入れる。', inputField('入力らん1')),
        box = { ...field.at('LooksCommand:SET_INPUT', 'args'), index: 0 };
      ok(field.session.diagnostics.length === 0, 'the work with an input field: ' + stableJson(field.session.diagnostics));
      refused(field.ask('NumberLiteral', box), PLACE_UNFIT, 'a number as the input field to fill');
      refused(field.ask('StringLiteral', box), 'からっぽの 文字は 名前に ならない ので、そこには 入れられないよ。名前を 書いた 文字を 入れてね。', 'an empty text as the input field to fill');
      const fieldName = createBlock('StringLiteral'); fieldName.fields.value = '入力らん1';
      ok(field.ask('StringLiteral', box, { candidateNode: fieldName }).enabled, 'a text with the name of the input field to fill');
    });
    test('a value carried onto an equal value is not refused, whatever mistake its line has', () => {
      const name = makeDefaultProject().components.find((part) => part.id === 'sprite-1').name,
        work = placeWork('「' + name + '」と言う。\n「' + name + '」の方を向く。', undefined, 'stage'),
        [from, to] = work.nodes.filter((n) => n.schemaId === 'StringLiteral'),
        told = work.session.diagnostics.filter((d) => d.code === 'S304');
      ok(told.length === 1 && told[0].line === 2, 'the line stands with the mistake of its sentence: ' + JSON.stringify(work.session.diagnostics.map((d) => d.code + '@' + d.line)));
      const edit = prepare(work.session, { type: 'expression', ...work.place(to), node: JSON.parse(JSON.stringify(from)) }, { project: work.project, context: work.context });
      ok(edit.changed === false, 'the edit leaves the text as it was');
      const carried = work.carry(from, work.place(to));
      ok(carried.enabled, 'the equal value goes: ' + carried.reason);
      // the same holds for a number, and in a part's body beside a value that is wrong
      const pen = placeWork('3を言う。\nペンの太さを3にする。', undefined, 'stage'), [three, size] = pen.nodes.filter((n) => n.schemaId === 'NumberLiteral');
      ok(pen.carry(three, pen.place(size)).enabled, 'an equal number goes to the size of a pen on the stage');
      const partner = placeWork('3を言う。\nもし3にふれているなら、\n  1秒待つ。'), [said, touched] = partner.nodes.filter((n) => n.schemaId === 'NumberLiteral');
      ok(partner.session.diagnostics.some((d) => d.line === 2), 'a number is no partner to touch');
      ok(partner.carry(said, partner.place(touched)).enabled, 'an equal number goes where the same number stands');
      // a value that changes the wrong line is still judged
      const other = placeWork('4を言う。\nもし3にふれているなら、\n  1秒待つ。'), [four, three2] = other.nodes.filter((n) => n.schemaId === 'NumberLiteral');
      ok(!other.carry(four, other.place(three2)).enabled, 'another number is refused as a partner');
    });
    test('a value goes into a sentence whose own mistake stands, and a mistake it adds still refuses it', () => {
      const STAGE_MOVE = '動く ことや ペンで かく ことは、画面では できません。部品の 本文で 使って ください',
        mistakes = (list) => list.filter((d) => d.code === 'S304').map((d) => d.line + ' ' + d.message),
        work = placeWork('5を言う。\nペンの太さを3にする。', undefined, 'stage'),
        [five, size] = work.nodes.filter((n) => n.schemaId === 'NumberLiteral'), to = work.place(size);
      ok(JSON.stringify(mistakes(work.session.diagnostics)) === JSON.stringify(['2 ' + STAGE_MOVE]), 'the sentence stands with its one mistake: ' + JSON.stringify(mistakes(work.session.diagnostics)));
      const carried = work.carry(five, to);
      ok(carried.enabled, 'a number of the body goes into the sentence: ' + carried.reason);
      for (const id of ['NumberLiteral', 'BinaryExpression:ADD', 'VariableRead']) {
        const listed = work.ask(id, to);
        ok(listed.enabled, 'the list\'s ' + id + ' goes into the sentence: ' + listed.reason);
      }
      const edit = prepare(work.session, { type: 'expression', ...to, node: JSON.parse(JSON.stringify(five)) }, { project: work.project, context: work.context });
      ok(edit.source.trim() === '5を言う。\nペンの太さを5にする。', 'the value is put in: ' + edit.source);
      ok(JSON.stringify(mistakes(edit.diagnostics)) === JSON.stringify(['2 ' + STAGE_MOVE]), 'the one mistake stays one: ' + JSON.stringify(mistakes(edit.diagnostics)));
      // a second sentence of the same mistake is one more mistake
      const root = work.session.blockView.id;
      ok(!work.ask('PenCommand:SET_SIZE', { parentId: root, body: 'body', index: 2 }).enabled, 'a new sentence the stage cannot do is refused');
      // a mistake that names the value put in is another mistake
      const name = makeDefaultProject().components.find((part) => part.id === 'sprite-1').name,
        touch = placeWork('「' + name + '」と言う。\nもし「' + name + '」にふれているなら、\n  1秒待つ。', undefined, 'stage'),
        partner = touch.nodes.filter((n) => n.schemaId === 'StringLiteral')[1],
        named = touch.ask('StringLiteral', touch.place(partner));
      ok(touch.session.diagnostics.some((d) => d.code === 'S304' && d.line === 2), 'the stage touches nothing');
      ok(!named.enabled && named.reason.includes('画面では 使えません'), 'another partner is refused on the stage: ' + named.reason);
      // a mistake of the value put in, or of a value that holds it, refuses it beside a mistake that stood
      const both = placeWork('5を言う。\nもし3にふれているかつ「' + name + '」にふれているなら、\n  1秒待つ。'),
        second = both.nodes.find((n) => n.schemaId === 'StringLiteral'), saidFive = both.nodes.find((n) => n.schemaId === 'NumberLiteral');
      ok(both.session.diagnostics.some((d) => d.line === 2), 'a number is no partner to touch');
      ok(!both.ask('NumberLiteral', both.place(second)).enabled, 'a second number is refused as a partner beside the first');
      ok(!both.carry(saidFive, both.place(second)).enabled, 'a carried number is refused as a partner beside the first');
      const sum = placeWork('もし3にふれているなら、\n  1秒待つ。'), wrong = sum.nodes.find((n) => n.schemaId === 'NumberLiteral');
      ok(!sum.ask('BinaryExpression:ADD', sum.place(wrong)).enabled, 'a sum is refused where a number is a wrong partner');
    });
    test('a hole kind is answered as not usable instead of thrown', () => {
      const w = placeWork('「やあ」と言う。'), holes = BLOCK_SCHEMAS.filter((schema) => schema.draftOnly),
        body = { parentId: w.session.blockView.id, body: 'body', index: 0 };
      ok(holes.length > 0, 'hole kinds exist');
      for (const schema of holes) for (const location of [body, w.at('Say', 'value')]) {
        let available = null, thrown = '';
        try { available = w.ask(schema.id, location); } catch (error) { thrown = error.message; }
        ok(!thrown, schema.id + ' threw: ' + thrown);
        ok(!!available && !available.enabled && available.reason === 'この ブロックは 使えないよ' && available.diagnostics.length === 0, schema.id + ': ' + stableJson(available));
      }
      const draft = w.ask('WaitUntil', body);
      ok(draft.enabled && draft.node.inputs.condition.schemaId === 'Hole:expression', 'a draft still comes with its hole: ' + stableJson(draft));
    });
    test('the value of an input field is offered only in a work that has one', () => {
      const none = placeWork('「やあ」と言う。');
      refused(none.ask('SensorRead:INPUT_VALUE', none.at('Say', 'value')), '入力らんを 先に 作ります', 'no input field');
      const one = placeWork('「やあ」と言う。', inputField('なまえらん')),
        location = one.at('Say', 'value'), available = one.ask('SensorRead:INPUT_VALUE', location);
      ok(available.enabled, 'with an input field: ' + available.reason);
      const landed = one.put(available, location);
      ok(landed.text === '「なまえらん」の中身を言う。' && landed.codes.length === 0, stableJson(landed));
      // one that is in the text already, of a part that is no input field, still moves
      const name = none.project.components[0].name, moved = placeWork('「' + name + '」の中身を言う。\n1＋2を言う。'),
        from = moved.nodes.find((n) => n.schemaId === 'SensorRead:INPUT_VALUE');
      ok(moved.ask(from.schemaId, moved.at('BinaryExpression:ADD', 'left'), { candidateNode: from, sourceId: from.id }).enabled, 'a carried one moves');
    });
    test('a new name read and a new count of a procedure name what the work has', () => {
      const say = (w) => w.at('Say', 'value'), empty = (project) => { project.projectData = { variables: [], lists: [] }; },
        hp = (project) => { project.components[0].localData = { variables: [{ id: 'v-hp', name: 'HP', initialValue: 3 }], lists: [] }; };
      const made = placeWork('「やあ」と言う。'), read = made.ask('VariableRead', say(made));
      ok(read.enabled && read.node.fields.name === '点数' && read.node.fields.qualifier === null, stableJson(read));
      ok(stableJson(made.put(read, say(made))) === stableJson({ text: '点数を言う。', codes: [] }), 'a variable of the work is read');
      const none = placeWork('「やあ」と言う。', empty);
      refused(none.ask('VariableRead', say(none)), 'へんすうか リストを 先に 作ります', 'no names');
      const own = placeWork('「やあ」と言う。', (project) => { empty(project); hp(project); }), ownRead = own.ask('VariableRead', say(own));
      ok(ownRead.enabled && ownRead.node.fields.name === 'HP', stableJson(ownRead));
      ok(own.put(ownRead, say(own)).codes.length === 0, 'the own variable of the part is read');
      const name = made.project.components[0].name, other = placeWork('「' + name + '」の大きさを言う。');
      refused(other.ask('VariableRead', other.at('ActorQualifiedRead', 'value')), '「' + name + '」の へんすうか リストを 先に 作ります', 'after a part with nothing of its own');
      const owned = placeWork('「' + name + '」の大きさを言う。', hp), place = owned.at('ActorQualifiedRead', 'value'), ownedRead = owned.ask('VariableRead', place);
      ok(ownedRead.enabled && ownedRead.node.fields.name === 'HP', stableJson(ownedRead));
      ok(stableJson(owned.put(ownedRead, place)) === stableJson({ text: '「' + name + '」のHPを言う。', codes: [] }), 'the own variable of a part after its name');
      const counted = placeWork('点数が3になるまで待つ。', jump), until = counted.at('WaitUntil', 'condition'), count = counted.ask('EventCount:action', until);
      ok(count.enabled && count.node.fields.name === 'とぶ', stableJson(count));
      ok(stableJson(counted.put(count, until)) === stableJson({ text: '自分が3回【とぶ】するまで待つ。', codes: [] }), 'the first procedure is counted');
      const bare = placeWork('点数が3になるまで待つ。');
      refused(bare.ask('EventCount:action', bare.at('WaitUntil', 'condition')), 'てじゅんを 先に 作ります', 'no procedure');
      ok(bare.ask('EventCount:click', bare.at('WaitUntil', 'condition')).enabled, 'a count of presses needs no procedure');
    });
    const editRefused = (run) => { try { run(); return ''; } catch (error) { return error.code + ' ' + error.message; } };
    test('a value put in a place is written so that it reads back as itself, or is refused for its place, in the check and in the edit', () => {
      const name = makeDefaultProject().components.find((part) => part.id === 'sprite-1').name,
        w = placeWork('「' + name + '」の大きさを言う。'), place = w.at('ActorQualifiedRead', 'value'), asked = w.ask('SensorRead:答え', place);
      // 答え after a part's name is written in brackets, so it reads back as itself and goes in
      ok(asked.enabled, 'the answer after a part: ' + asked.reason);
      const edit = prepare(w.session, { type: 'expression', ...place, node: asked.node }, { project: w.project, context: w.context }),
        read = parseSyntax(edit.source, { ...w.context, symbols: buildSymbols(w.project) });
      ok(edit.source.trim() === '「' + name + '」の（答え）を言う。', 'written: ' + edit.source);
      ok(read.ast && astEquivalent(read.ast, edit.syntaxAst), 'the written text reads as the blocks');
      // every value of the list put there is offered, or refused with a reason of the block and the place, never with the
      // words of a text that would read back otherwise; the check and the edit give the same answer
      for (const schema of BLOCK_SCHEMAS.filter((x) => x.category === 'expression' && !x.draftOnly)) {
        const answer = w.ask(schema.id, place);
        ok(answer.enabled || !/このまま なおすと/.test(answer.reason), schema.id + ': ' + answer.reason);
        if (!answer.node || answer.draftOnly) continue;
        const thrown = editRefused(() => prepare(w.session, { type: 'expression', ...place, node: answer.node }, { project: w.project, context: w.context }));
        ok(!/このまま なおすと/.test(thrown) && (thrown !== 'E901 ' + PLACE_UNFIT || answer.reason === PLACE_UNFIT), schema.id + ' edit: ' + thrown);
      }
      // every value of the list, and every value of the work carried, put in every value's place of these works: what the
      // edit takes reads back as the blocks; what it does not take is refused, never written so that it reads otherwise
      let taken = 0, drafts = 0, unasked = 0;
      const refused = {};
      for (const source of ['もし点数が1と同じなら、\n  何もしない。', '持ち物の1番目を言う。', '1＋2を言う。', 'もし「星」にふれているなら、\n  何もしない。', '「' + name + '」の（答え）を言う。']) {
        const work = placeWork(source), values = work.nodes.filter((n) => BLOCK_SCHEMA_BY_ID.get(n.schemaId).category === 'expression');
        for (const hole of values) {
          const location = work.place(hole);
          const offers = [...BLOCK_SCHEMAS.filter((x) => x.category === 'expression' && !x.draftOnly).map((x) => work.ask(x.id, location)),
            ...values.filter((n) => n !== hole).map((n) => work.carry(n, location))];
          for (const answer of offers) {
            if (!answer.node) { unasked++; continue; }
            let edit = null;
            const thrown = editRefused(() => { edit = prepare(work.session, { type: 'expression', ...location, node: answer.node }, { project: work.project, context: work.context }); });
            ok(!/このまま なおすと/.test(thrown), source + ' ' + hole.schemaId + ' ' + answer.node.schemaId + ': ' + thrown);
            if (thrown) refused[thrown] = (refused[thrown] || 0) + 1;
            ok(!thrown || answer.enabled === false, source + ' ' + hole.schemaId + ' ' + answer.node.schemaId + ' is offered by the check and refused by the edit: ' + thrown);
            if (!edit) continue;
            if (edit.draftOnly) { drafts++; continue; }
            taken++;
            const again = parseSyntax(edit.source, { ...work.context, symbols: buildSymbols(work.project) });
            ok(again.ast && astEquivalent(again.ast, edit.syntaxAst), source + ' ' + hole.schemaId + ' ' + answer.node.schemaId + ' reads back otherwise: ' + edit.source);
          }
        }
      }
      ok(taken === 1057, 'values put in: ' + taken);
      // what is not taken: no node offered, kept as a draft, or refused by the edit with exactly these reasons (each of
      // them is a value the check does not offer)
      ok(JSON.stringify([unasked, drafts, refused]) === JSON.stringify([0, 0, { 'E901 あかりで 使う ことばと 同じ 名前は、【名前】のように【 】で かこんで 書いて ください': 16, 'E901 からっぽの 文字は 名前に ならない ので、そこには 入れられないよ。名前を 書いた 文字を 入れてね。': 1, 'P210 ブロックの 組み方に まちがいが あります。名前は 1〜32文字で つけます': 1 }]), 'not taken: ' + JSON.stringify([unasked, drafts, refused]));
    });
    test('a draft with a hole takes no count condition outside an until, and one a kept draft holds opens and can be taken out', () => {
      const w = placeWork('1＋2を言う。\n点数を3にする。'), three = w.nodes.find((n) => n.schemaId === 'NumberLiteral' && n.fields.value === 3),
        sum = w.at('BinaryExpression:ADD', 'left');
      const draft = prepare(w.session, { type: 'expression', ...w.place(three), node: createBlock('Hole:expression', { allowHoles: true }) }, { project: w.project, context: w.context });
      ok(draft.draftOnly, 'a draft with a hole');
      const drafted = { ...w.session, ...draft, sourceText: w.session.sourceText };
      refused(blockInsertionAvailability(drafted, 'EventCount:click', sum, { project: w.project, context: w.context }), COUNT_PLACE, 'the check in a draft');
      const thrown = editRefused(() => prepare(drafted, { type: 'expression', ...sum, node: createBlock('EventCount:click') }, { project: w.project, context: w.context }));
      ok(thrown === 'E901 ' + COUNT_PLACE, 'the edit in a draft: ' + thrown);
      // a kept draft that holds one (an earlier release put it in) still opens, shows it, and lets it be taken out
      const kept = JSON.parse(JSON.stringify(draft.blockView)), left = kept.bodies.body[0].inputs.value.inputs;
      left.left = createBlock('EventCount:click'); left.left.id = 'kept-count'; left.left.inputs.count.id = 'kept-count-number';
      const ast = blockDecode(kept, { allowHoles: true }), encoded = blockEncode(ast, { allowHoles: true }),
        opened = { ...drafted, syntaxAst: ast, blockView: encoded.tree, nodeMap: encoded.nodeMap, nodeIds: encoded.nodeIds, nextBlockId: encoded.nodeMap.size + 1, blockDraft: { ...draft.blockDraft, ast, tree: encoded.tree } },
        count = [...buildBlockIndex(opened.blockView).values()].find((entry) => entry.node.schemaId === 'EventCount:click');
      ok(count, 'the count condition is shown');
      const out = prepare(opened, { type: 'replace', id: count.node.id, node: createBlock('NumberLiteral') }, { project: w.project, context: w.context });
      ok(out.changed && ![...buildBlockIndex(out.blockView).values()].some((entry) => entry.node.schemaId === 'EventCount:click'), 'it is taken out: ' + stableJson(out.source));
    });
    test('a value carried in a draft with a hole is refused where the body without the hole refuses it, with the same reason', () => {
      const name = makeDefaultProject().components.find((part) => part.id === 'sprite-1').name,
        w = placeWork('もし「' + name + '」にふれているなら、\n  1秒待つ。\n持ち物を言う。\n点数を3にする。\n「やあ」と言う。'),
        three = w.nodes.find((n) => n.schemaId === 'NumberLiteral' && n.fields.value === 3),
        draft = prepare(w.session, { type: 'expression', ...w.place(three), node: createBlock('Hole:expression', { allowHoles: true }) }, { project: w.project, context: w.context });
      ok(draft.draftOnly, 'a draft with a hole');
      const drafted = { ...w.session, ...draft, sourceText: w.session.sourceText },
        seconds = w.nodes.find((n) => n.schemaId === 'QuantityLiteral'), list = w.nodes.find((n) => n.schemaId === 'VariableRead' && n.fields.name === '持ち物');
      for (const [value, place, what] of [[seconds, w.at('SensorRead:TOUCHING', 'arg'), 'a number as a partner'], [list, w.at('Say', 'value', 1), 'a list said as it is']]) {
        const plain = w.carry(value, place), inDraft = blockInsertionAvailability(drafted, value.schemaId, place, { project: w.project, context: w.context, candidateNode: value, sourceId: value.id });
        ok(!plain.enabled && plain.reason, what + ' is refused without a draft: ' + stableJson(plain));
        ok(!inDraft.enabled && inDraft.reason === plain.reason, what + ' in the draft: ' + (inDraft.enabled ? 'offered' : inDraft.reason));
      }
      // a value that goes in without a draft still goes into the draft
      const said = w.nodes.find((n) => n.schemaId === 'StringLiteral' && n.fields.value === 'やあ'),
        good = blockInsertionAvailability(drafted, 'StringLiteral', w.at('Say', 'value', 0), { project: w.project, context: w.context, candidateNode: said, sourceId: said.id });
      ok(good.enabled, 'a text into a say in the draft: ' + good.reason);
    });
    test('a value carried into a sentence added in a draft with a hole is refused as in that sentence without the draft', () => {
      const w = placeWork('持ち物を言う。\n点数を3にする。'), three = w.nodes.find((n) => n.schemaId === 'NumberLiteral' && n.fields.value === 3),
        list = w.nodes.find((n) => n.schemaId === 'VariableRead' && n.fields.name === '持ち物'), root = w.session.blockView.id,
        end = { parentId: root, body: 'body', index: 2 }, say = w.ask('Say', end);
      const plain = prepare(w.session, { type: 'insert', ...end, node: say.node }, { project: w.project, context: w.context }),
        plainSay = plain.blockView.bodies.body[2], outside = blockInsertionAvailability({ ...w.session, ...plain }, 'VariableRead', { parentId: plainSay.id, input: 'value' }, { project: w.project, context: w.context, candidateNode: list, sourceId: list.id });
      ok(!outside.enabled && outside.reason, 'without a draft: ' + stableJson(outside));
      const draft = prepare(w.session, { type: 'expression', ...w.place(three), node: createBlock('Hole:expression', { allowHoles: true }) }, { project: w.project, context: w.context }),
        drafted = { ...w.session, ...draft, sourceText: w.session.sourceText },
        added = prepare(drafted, { type: 'insert', ...end, node: say.node }, { project: w.project, context: w.context });
      ok(added.draftOnly, 'the sentence is added in the draft');
      const inDraft = { ...drafted, ...added, sourceText: w.session.sourceText }, draftSay = added.blockView.bodies.body[2],
        answer = blockInsertionAvailability(inDraft, 'VariableRead', { parentId: draftSay.id, input: 'value' }, { project: w.project, context: w.context, candidateNode: list, sourceId: list.id });
      ok(!answer.enabled && answer.reason === outside.reason, 'in the draft: ' + (answer.enabled ? 'offered' : answer.reason));
      const text = w.nodes.find((n) => n.schemaId === 'NumberLiteral' && n.fields.value === 3);
      ok(blockInsertionAvailability(inDraft, 'NumberLiteral', { parentId: draftSay.id, input: 'value' }, { project: w.project, context: w.context, candidateNode: text, sourceId: text.id }).enabled, 'a number still goes into the added sentence');
    });
    test('in a draft, a sentence inside an added one with a hole, and a value the draft added, are asked as without the draft', () => {
      const w = placeWork('「やあ」と言う。\n点数を3にする。'), three = w.nodes.find((n) => n.schemaId === 'NumberLiteral' && n.fields.value === 3),
        opts = { project: w.project, context: w.context }, root = w.session.blockView.id, end = { parentId: root, body: 'body', index: 2 },
        step = (session, op) => ({ ...session, ...prepare(session, op, opts), sourceText: w.session.sourceText }),
        all = (tree) => [...buildBlockIndex(tree).values()].map((entry) => entry.node),
        saying = (words, id) => { const say = w.ask('Say', end).node, value = createBlock(words ? 'StringLiteral' : 'VariableRead'); value.id = id;
          if (words) value.fields.value = words; else { value.fields.name = '持ち物'; value.fields.qualifier = null; } say.inputs.value = value; return say; },
        LIST = (session, id) => all(session.blockView).find((n) => n.id === id || (n.schemaId === 'VariableRead' && n.fields.name === '持ち物'));
      let x = step(w.session, { type: 'expression', ...w.place(three), node: createBlock('Hole:expression', { allowHoles: true }) });
      x = step(x, { type: 'insert', ...end, node: w.ask('IfStatement', end).node });
      const branch = x.blockView.bodies.body[2], key = Object.keys(branch.bodies)[0];
      x = step(x, { type: 'insert', parentId: branch.id, body: key, index: 0, node: saying('', 'draft-list') });
      x = step(x, { type: 'insert', parentId: branch.id, body: key, index: 1, node: saying('いい', 'draft-words') });
      const list = LIST(x), inner = all(x.blockView).find((n) => n.schemaId === 'Say' && n.inputs.value.fields.value === 'いい'), first = x.blockView.bodies.body[0];
      const plain = step(w.session, { type: 'insert', ...end, node: saying('', 'plain-list') }), plainList = LIST(plain);
      const outside = blockInsertionAvailability(plain, 'VariableRead', { parentId: plain.blockView.bodies.body[0].id, input: 'value' }, { ...opts, candidateNode: plainList, sourceId: plainList.id });
      ok(!outside.enabled && outside.reason, 'a list said as it is, without a draft: ' + stableJson(outside));
      for (const [parentId, what] of [[first.id, 'a value the draft added, to a sentence of the body'], [inner.id, 'a sentence inside an added もし with a hole']]) {
        const answer = blockInsertionAvailability(x, 'VariableRead', { parentId, input: 'value' }, { ...opts, candidateNode: list, sourceId: list.id });
        ok(!answer.enabled && answer.reason === outside.reason, what + ': ' + (answer.enabled ? 'offered' : answer.reason));
      }
      const words = all(x.blockView).find((n) => n.schemaId === 'StringLiteral' && n.fields.value === 'やあ');
      ok(blockInsertionAvailability(x, 'StringLiteral', { parentId: inner.id, input: 'value' }, { ...opts, candidateNode: words, sourceId: words.id }).enabled, 'words still go in');
    });
    test('an empty text is not put where a name is read, new or carried, in the check and in the edit', () => {
      const name = makeDefaultProject().components.find((part) => part.id === 'sprite-1').name,
        EMPTY = 'からっぽの 文字は 名前に ならない ので、そこには 入れられないよ。名前を 書いた 文字を 入れてね。',
        w = placeWork('「」と言う。\nもし「' + name + '」にふれているなら、\n  1秒待つ。'), partner = w.at('SensorRead:TOUCHING', 'arg'),
        empty = w.nodes.find((n) => n.schemaId === 'StringLiteral' && n.fields.value === '');
      refused(w.ask('StringLiteral', partner), EMPTY, 'a new text as a partner');
      refused(w.carry(empty, partner), EMPTY, 'a carried empty text as a partner');
      const thrown = editRefused(() => prepare(w.session, { type: 'expression', ...partner, node: createBlock('StringLiteral') }, { project: w.project, context: w.context }));
      ok(thrown === 'E901 ' + EMPTY, 'the edit: ' + thrown);
      // an empty text is still words to say, and a text with a name still goes in
      ok(w.ask('StringLiteral', w.at('Say', 'value')).enabled, 'an empty text is said');
      const named = createBlock('StringLiteral'); named.fields.value = name;
      ok(w.ask('StringLiteral', partner, { candidateNode: named }).enabled, 'a named partner goes in');
    });
    test('a memo of a line a body does not have is refused saying the line is not there', () => {
      const w = placeWork('1秒待つ。'), thrown = editRefused(() => prepare(w.session, { type: 'annotation', id: w.session.blockView.id, key: 'headingComment', value: '※ メモ' }, { project: w.project, context: w.context }));
      ok(thrown === 'E901 見出しの 行が ないので、見出しの メモは 書けないよ。', thrown);
      const branch = placeWork('もし点数が3より大きいなら、\n  1秒待つ。'), id = branch.nodes.find((n) => n.schemaId === 'IfStatement').id,
        other = editRefused(() => prepare(branch.session, { type: 'annotation', id, key: 'elseComment', value: '※ メモ' }, { project: branch.project, context: branch.context }));
      ok(other === 'E901 「そうでなければ」の 行が ないので、「そうでなければ」の メモは 書けないよ。', other);
    });
    test('a call is put in only with the name of a procedure of the work', () => {
      const none = placeWork('「やあ」と言う。'), body = { parentId: none.session.blockView.id, body: 'body', index: 1 };
      refused(none.ask('UserActionCall', body), 'てじゅんを 先に 作ります', 'no procedure');
      refused(none.ask('UserFunctionCall', none.at('Say', 'value')), '答えを もとめる ブロックを 先に 作ります', 'no answer block');
      const made = placeWork('「やあ」と言う。', jump), at = { parentId: made.session.blockView.id, body: 'body', index: 1 };
      refused(made.ask('UserActionCall', at), 'その 名前の てじゅんは ないよ。一覧の ブロックを えらんでね', 'a name the work does not have');
      const call = createBlock('UserActionCall'); call.fields.name = 'とぶ';
      const named = made.ask('UserActionCall', at, { candidateNode: call });
      ok(named.enabled && made.put && prepare(made.session, { type: 'insert', ...at, node: named.node }, { project: made.project, context: made.context }).source.includes('【とぶ】'), stableJson(named));
    });
    test('a new name read that cannot be put in shows no name', () => {
      const none = placeWork('「やあ」と言う。', (project) => { project.projectData = { variables: [], lists: [] }; });
      ok(none.ask('VariableRead', none.at('Say', 'value')).node.fields.name === '', 'the refused one has no name');
    });
    {
      // Block edits of sentences written on a heading line, and of もし…のとき and まず heads, keep the meaning and the words written.
      const same = (a, b) => ok(stableJson(a) === stableJson(b), 'expected ' + stableJson(b) + '; got ' + stableJson(a));
      const session = (source, variables = []) => { const project = makeDefaultProject(); project.projectData = { variables, lists: [] }; project.scripts = [{ targetId: 'stage', event: 'start', source }]; return createEditorSession('script:stage:start', source, { targetId: 'stage', event: 'start' }, project, 4); };
      const edit = (s, op) => { try { return prepareBlockEdit(s, op, { ownerKey: s.ownerKey, sourceRevision: s.sourceRevision, contextRevision: s.contextRevision }).source; } catch (e) { return 'refused: ' + e.message; } };
      const reads = (source, as) => { const symbols = buildSymbols(makeDefaultProject()), ctx = { targetId: 'stage', event: 'start' }; ok(astEquivalent(parseScript(source, symbols, ctx), parseScript(as, symbols, ctx)), source + ' reads as ' + as); };
      test('a sentence after a 。 at the start of its line removed or moved as a block leaves no 。 behind', () => {
        for (const [source, schema, removed, moved] of [
          ['10歩動かす。\n。右に15度回る。', 'MotionCommand:TURN_RIGHT', '前へ10歩進む。', '右に15度回る。\n前へ10歩進む。'],
          ['。10歩動かす。\n右に15度回る。', 'MotionCommand:MOVE', '右に15度回る。', '。10歩動かす。\n右に15度回る。'],
          ['。10歩動かす。\n右に15度回る。', 'MotionCommand:TURN_RIGHT', '。10歩動かす。\n', '右に15度回る。\n前へ10歩進む。'],
        ]) {
          const s = session(source), node = [...buildBlockIndex(s.blockView).values()].map(e => e.node).find(n => n.schemaId === schema);
          same([source, schema, edit(s, { type: 'remove', id: node.id }), edit(s, { type: 'move', id: node.id, parentId: s.blockView.id, body: 'body', index: 0 })], [source, schema, removed, moved]);
        }
      });
      test('the condition of a もし…のとき head replaced as a block is written in place of the condition and its ending', () => {
        const score = [{ id: 'v-score', name: '点数', initialValue: 0 }];
        for (const [source, expected] of [
          ['もし点数が1のとき、\n  10歩動かす。', 'もし条件（5）が成り立つなら、\n  10歩動かす。'],
          ['もし点数が1のときは、10歩動かす。', 'もし条件（5）が成り立つなら、10歩動かす。'],
          ['まず、もし点数が1のとき、\n  10歩動かす。', 'まず、もし条件（5）が成り立つなら、\n  10歩動かす。'],
          ['もし 点数が 1の とき、\n  10歩動かす。', 'もし 条件（5）が成り立つなら、\n  10歩動かす。'],
          ['もし点数が1のとき、10歩動かして、20歩動かす。', 'もし条件（5）が成り立つなら、10歩動かして、20歩動かす。'],
          ['10歩動かす。もし点数が1のとき、20歩動かす。', '10歩動かす。もし条件（5）が成り立つなら、20歩動かす。'],
          ['もし点数が1のときは\n  10歩動かす。', 'もし条件（5）が成り立つなら\n  10歩動かす。'],
          ['もし点数が1のとき\n  10歩動かす。', 'もし条件（5）が成り立つなら\n  10歩動かす。'],
          ['もし 点数が 1の とき は\n  10歩動かす。', 'もし 条件（5）が成り立つなら\n  10歩動かす。'],
        ]) {
          const s = session(source, score), compare = [...buildBlockIndex(s.blockView).values()].map(e => e.node).filter(n => n.schemaId === 'CompareExpression:EQ'), five = createBlock('NumberLiteral');
          five.fields.value = 5;
          same([source, compare.length], [source, 1]);
          same([source, edit(s, { type: 'replace', id: compare[0].id, node: five })], [source, expected]);
        }
      });
      test('a sentence on a heading line duplicated or removed keeps the meaning of the body', () => {
        for (const [source, duplicated, removed] of [
          ['作品を動かしたとき、ねこは10歩動かす。', '作品を動かしたとき、\n  ねこは前へ10歩進む。\n  ねこは前へ10歩進む。', '作品を動かしたとき、'],
          ['作品を動かしたとき、10歩動かす。', '作品を動かしたとき、\n  前へ10歩進む。\n  前へ10歩進む。', '作品を動かしたとき、'],
        ]) {
          const s = session(source), root = s.blockView, first = root.bodies.body[0];
          const copy = edit(s, { type: 'duplicate', id: first.id, parentId: root.id, body: 'body', index: 1 });
          same([source, copy], [source, duplicated]);
          reads(copy, source + source.slice(source.indexOf('、') + 1));
          same([source, edit(s, { type: 'remove', id: first.id })], [source, removed]);
        }
      });
      test('a number in a sentence with a part name as its subject changed as a block keeps the subject as written', () => {
        for (const [source, expected] of [
          ['ねこは10歩動かす。', 'ねこは7歩動かす。'], ['ねこは、10歩動かす。', 'ねこは、7歩動かす。'], ['ねこが10歩動かす。', 'ねこが7歩動かす。'],
          ['ねこも、10歩動かす。', 'ねこも、7歩動かす。'], ['【ねこ】は10歩動かす。', '【ねこ】は7歩動かす。'], ['【ねこ】が、10歩動かす。', '【ねこ】が、7歩動かす。'],
          ['ねこを10歩動かす。', 'ねこを7歩動かす。'], ['ねこは、まず、10歩動かす。', 'ねこは、まず、7歩動かす。'], ['ねこは点数に1を入れる。', 'ねこは点数に7を入れる。'],
          ['ねこが、点数を1ふやす。', 'ねこが、点数を7ふやす。'], ['ねこだけ10歩動かす。', 'ねこだけ7歩動かす。'], ['【ねこ】だけ10歩動かす。', '【ねこ】だけ7歩動かす。'],
          ['点数が1になるまで、ねこは待つ。', '点数が7になるまで、ねこは待つ。'], ['点数が1になるまで、【ねこ】は待つ。', '点数が7になるまで、【ねこ】は待つ。'],
        ]) {
          const project = makeDefaultProject(); project.components[0].name = 'ねこ'; project.projectData = { variables: [{ id: 'v-score', name: '点数', initialValue: 0 }], lists: [] }; project.scripts = [{ targetId: 'stage', event: 'start', source }];
          const s = createEditorSession('script:stage:start', source, { targetId: 'stage', event: 'start' }, project, 4), literals = [...buildBlockIndex(s.blockView).values()].map(e => e.node).filter(n => n.schemaId === 'NumberLiteral');
          same([source, literals.length], [source, 1]);
          same([source, edit(s, { type: 'field', id: literals[0].id, key: 'value', value: 7 })], [source, expected]);
        }
      });
      test('a sentence with a part name as its subject is removed, noted or moved as a whole', () => {
        const rows = [
          ["10歩動かす。\nもし点数が1なら、\n  ねこは10歩動かす。\n  10歩動かす。", "もし点数が1なら、\n  ねこは10歩動かす。\n  10歩動かす。", "前へ10歩進む。  ※ x\nもし点数が1なら、\n  ねこは10歩動かす。\n  10歩動かす。", "10歩動かす。\nもし点数が1なら、\n  ねこは10歩動かす。\n  10歩動かす。"],
          ["10歩動かす。\nもし点数が1なら、\n  ねこは10歩動かす。\n  10歩動かす。", "10歩動かす。\nもし点数が1なら、\n  ねこは前へ10歩進む。", "10歩動かす。\nもし点数が1なら、\n  ねこは前へ10歩進む。  ※ x\n  10歩動かす。", "ねこは10歩動かす。\n自分は前へ10歩進む。\nもし点数が1なら、\n  ねこは前へ10歩進む。"],
          ["10歩動かす。\nもし点数が1なら、\n  ねこは10歩動かす。\n  10歩動かす。", "10歩動かす。\nもし点数が1なら、\n  ねこは10歩動かす。\n", "10歩動かす。\nもし点数が1なら、\n  ねこは10歩動かす。\n  前へ10歩進む。  ※ x", "ねこは前へ10歩進む。\n自分は前へ10歩進む。\nもし点数が1なら、\n  ねこは10歩動かす。\n"],
          ["10歩動かす。ねこは10歩動かす。", "ねこは前へ10歩進む。", "前へ10歩進む。  ※ x\nねこは前へ10歩進む。", "10歩動かす。ねこは10歩動かす。"],
          ["10歩動かす。ねこは10歩動かす。", "前へ10歩進む。", "10歩動かす。ねこは前へ10歩進む。  ※ x", "ねこは前へ10歩進む。\n自分は前へ10歩進む。"],
          ["ねこは10歩動かす。\n10歩動かす。", "ねこは前へ10歩進む。", "ねこは前へ10歩進む。  ※ x\n10歩動かす。", "ねこは10歩動かす。\n10歩動かす。"],
          ["ねこは10歩動かす。\n10歩動かす。", "ねこは10歩動かす。\n", "ねこは10歩動かす。\n前へ10歩進む。  ※ x", "ねこは10歩動かす。\n10歩動かす。"],
          ["もし点数が1なら、\n  ねこは、10歩動かす。 ※メモ\n10歩動かす。", 'refused', "もし点数が1なら、\n  ねこは前へ10歩進む。  ※ x\n10歩動かす。", null],
          ["もし点数が1なら、\n  ねこは、10歩動かす。 ※メモ\n10歩動かす。", "もし点数が1なら、\n  ねこは、10歩動かす。 ※メモ\n", "もし点数が1なら、\n  ねこは、10歩動かす。 ※メモ\n前へ10歩進む。  ※ x", "10歩動かす。\nもし点数が1なら、\n  ねこは、10歩動かす。 ※メモ"],
          ["10歩動かす。\nねこが「あ」と言う。", "ねこが「あ」と言う。", "前へ10歩進む。  ※ x\nねこが「あ」と言う。", "10歩動かす。\nねこが「あ」と言う。"],
          ["10歩動かす。\nねこが「あ」と言う。", "10歩動かす。\n", "10歩動かす。\nねこが「あ」と言う。  ※ x", "ねこが「あ」と言う。\n自分は前へ10歩進む。"],
        ];
        const sources = [...new Set(rows.map(r => r[0]))], results = [];
        for (const source of sources) {
          const project = makeDefaultProject(); project.components[0].name = 'ねこ'; project.projectData = { variables: [{ id: 'v-score', name: '点数', initialValue: 0 }], lists: [] }; project.scripts = [{ targetId: 'stage', event: 'start', source }];
          const s = createEditorSession('script:stage:start', source, { targetId: 'stage', event: 'start' }, project, 4);
          const said = text => text.startsWith('refused') ? 'refused' : text;
          for (const entry of buildBlockIndex(s.blockView).values()) if (/Command|Say/.test(entry.node.schemaId)) {
            const id = entry.node.id, row = rows[results.length];
            results.push([source, said(edit(s, { type: 'remove', id })), said(edit(s, { type: 'annotation', id, key: 'inlineComment', value: '※ x' })), row && row[3] === null ? null : said(edit(s, { type: 'move', id, parentId: s.blockView.id, body: 'body', index: 0 }))]);
          }
        }
        same(results, rows);
      });
      test('a number in a もし…のとき or まず head changed as a block keeps the words written', () => {
        const score = [{ id: 'v-score', name: '点数', initialValue: 0 }];
        for (const [source, value, expected] of [
          ['もし点数が1のとき、\n  10歩動かす。', 1, 'もし点数が7のとき、\n  10歩動かす。'],
          ['もし点数が1のとき、\n  10歩動かす。', 10, 'もし点数が1のとき、\n  7歩動かす。'],
          ['もし点数が1のときは、10歩動かす。', 1, 'もし点数が7のときは、10歩動かす。'],
          ['もし点数が1のときは、10歩動かす。', 10, 'もし点数が1のときは、7歩動かす。'],
          ['まず、もし点数が1なら、\n  10歩動かす。', 1, 'まず、もし点数が7なら、\n  10歩動かす。'],
          ['まず、もし点数が1のとき、10歩動かす。', 1, 'まず、もし点数が7のとき、10歩動かす。'],
          ['まず、もし点数が1のとき、10歩動かす。', 10, 'まず、もし点数が1のとき、7歩動かす。'],
          ['10歩動かす。もし点数が1のとき、10歩動かす。', 1, '10歩動かす。もし点数が7のとき、10歩動かす。'],
          ['もし点数が1のとき、10歩動かして、20歩動かす。', 20, 'もし点数が1のとき、10歩動かして、7歩動かす。'],
        ]) {
          const s = session(source, score), literals = [...buildBlockIndex(s.blockView).values()].map(e => e.node).filter(n => n.schemaId === 'NumberLiteral' && n.fields.value === value);
          same([source, value, literals.length], [source, value, 1]);
          same([source, value, edit(s, { type: 'field', id: literals.at(-1).id, key: 'value', value: 7 })], [source, value, expected]);
        }
      });
    }
    {
      // Renaming data: the places of its uses, the new name checked first, and names that are written in 【 】.
      const renameWork = (scripts, stone = false) => {
        const project = makeDefaultProject();
        project.components[0].name = 'ねこ';
        const other = JSON.parse(JSON.stringify(project.components[0]));
        Object.assign(other, { id: 'sprite-2', name: '石' });
        if (stone) project.components.push(other);
        project.projectData.variables.push({ id: 'rename-score', name: '点数', initialValue: 0 });
        project.scripts = scripts;
        return project;
      };
      const renamed = (project, name) => {
        try {
          return Akari.prepareResourceRename(project, 'data:rename-score', name, {}).scripts.map((s) => s.source);
        } catch (error) {
          ok(error instanceof AkariError, 'a controlled refusal: ' + error);
          return error.code + ' ' + error.message;
        }
      };
      test('rename reference places are the name token for data and the partner token for a touch heading', () => {
        const project = renameWork([
          { targetId: 'stage', event: 'start', source: '点数を言う。' },
          { targetId: 'sprite-1', event: 'touchStart', filter: { target: '石' }, source: '「石」にふれたとき\n  点数を1ふやす。' },
        ], true);
        const graph = Akari.buildProjectReferenceGraph(project);
        ok(stableJson(graph.references.map((r) => [r.sourceKey, r.resourceKey, r.binding, r.range])) === stableJson([
          ['script:stage:start', 'data:rename-score', 'name', { start: 0, end: 2 }],
          ['script:sprite-1:touchStart', 'component:sprite-2', 'touch', { start: 0, end: 3 }],
          ['script:sprite-1:touchStart', 'data:rename-score', 'name', { start: 12, end: 14 }],
        ]) && !graph.uncertain.length, stableJson(graph));
      });
      test('a data rename to a name that cannot be a name is refused as a name even beside an unfinished script', () => {
        const project = renameWork([{ targetId: 'stage', event: 'start', source: '点数を' }]);
        for (const [name, want] of [
          ['', 'F503 名前は 1〜32文字で つけます'],
          ['あ い', 'F503 名前「あ い」には 使えない 文字が あります。空白や 「」【】（）［］、※ を けして ください'],
          ['とくてん', 'S301 書きかけの 本文か、動かして はじめて 決まる 名前が あります。本文を 書きおえてから、名前を かえて ください'],
        ]) {
          const got = renamed(project, name);
          ok(got === want, JSON.stringify(name) + ': ' + got);
        }
      });
      test('data renamed to a name starting with a number is written in name brackets, with or without its owner', () => {
        for (const [targetId, source, want] of [
          ['stage', '点数を1ふやす。', '【3つめ】を1ふやす。'],
          ['sprite-1', '作品の点数を言う。', '作品の【3つめ】を言う。'],
          ['stage', '点数を言う。', 'ごうけいを言う。'],
        ]) {
          const name = want.startsWith('ご') ? 'ごうけい' : '3つめ', got = renamed(renameWork([{ targetId, event: 'start', source }]), name);
          ok(stableJson(got) === stableJson([want]), source + ': ' + stableJson(got));
        }
      });
      test('a wrong pen colour carried into a pen colour hole is its own mistake beside the same mistake on its line', () => {
        const line = 'ペンの色を「にじ色」にする。ペンの色を「赤」にする。\n';
        carryTable([
          ['PL1 a wrong colour carried', line + '「にじ色」と言う。', ['StringLiteral', 2], ['PenCommand:SET_COLOR', 1, ['args', 0]], WHY.colourNiji, WHY.colourNone],
          ['PL2 a wrong colour from another script', line + '「にじ色」と言う。', ['StringLiteral', 2], ['PenCommand:SET_COLOR', 1, ['args', 0]], WHY.colourNiji, WHY.colourNone, { carried: false }],
          ['PL3 a right colour carried', line + '「青」と言う。', ['StringLiteral', 2], ['PenCommand:SET_COLOR', 1, ['args', 0]], true, WHY.colourNone],
        ]);
      });
      test('the editor tells a count condition outside an until only for its own body, not for another body of the work', () => {
        const project = makeDefaultProject();
        project.projectData.variables.push({ id: 'count-own-score', name: '点数', initialValue: 0 });
        project.scripts = [
          { targetId: 'sprite-1', event: 'start', source: '「やあ」と言う。\n点数を（自分が3回おされる）にする。' },
          { targetId: 'sprite-1', event: 'click', source: '点数を（自分が3回おされる）にする。' },
        ];
        const session = createEditorSession('script:sprite-1:start', project.scripts[0].source, { targetId: 'sprite-1', event: 'start' }, project, 4),
          message = '回数の 条件（〜回おされる、〜回【手順】する）は「〜まで待つ」と「〜まで、くり返す」の 中で 使います';
        ok(stableJson(session.diagnostics.map((d) => [d.code, d.message, d.line, d.column, d.where])) === stableJson([['S314', message, 2, 4, 'script:sprite-1:start']]), stableJson(session.diagnostics));
        ok(stableJson(compileProject(project).errors.map((d) => [d.code, d.line, d.where])) === stableJson([['S314', 2, 'script:sprite-1:start'], ['S314', 1, 'script:sprite-1:click']]), 'the work tells both');
      });
      test('a count condition outside an until is told where the count is written, and with no place for blocks', () => {
        const project = makeDefaultProject(), context = { targetId: 'sprite-1', event: 'start' }, rows = (list) => list.map((d) => [d.code, d.line, d.column, d.where]);
        project.projectData.variables.push({ id: 'count-place-score', name: '点数', initialValue: 0 });
        // (the sentence starts on the line before: the count is on the second line of its text)
        const across = '「あ\nい」と（自分が3回おされる）をつなげて言う。';
        project.scripts = [{ targetId: 'sprite-1', event: 'start', source: across }];
        ok(stableJson(rows(compileProject(project).errors)) === stableJson([['S314', 2, 4, 'script:sprite-1:start']]), stableJson(compileProject(project).errors));
        // Blocks have no place in a text: the count is told at line 0, column 1, as the other mistakes of the blocks are.
        const source = '点数を（自分が3回おされる）にする。\nペンの色を「にじ色」にする。';
        project.scripts = [{ targetId: 'sprite-1', event: 'start', source }];
        const session = createEditorSession('script:sprite-1:start', source, context, project, 4),
          fromBlocks = analyzeAst(blockDecode(session.blockView), project, context),
          fromText = analyzeAst(parseScript(source, buildSymbols(project), context), project, context);
        ok(stableJson(rows(fromBlocks)) === stableJson([['S304', 0, 1, 'script:sprite-1:start'], ['S314', 0, 1, 'script:sprite-1:start']]), stableJson(rows(fromBlocks)));
        ok(stableJson(rows(fromText)) === stableJson([['S304', 2, 1, 'script:sprite-1:start'], ['S314', 1, 4, 'script:sprite-1:start']]), stableJson(rows(fromText)));
      });
      test('a count condition carried is refused beside the same mistake on its line, and one held in a value it had before goes with it', () => {
        carryTable([
          ['CP1 a count to a say on a line with a misplaced count', '点数を（自分が3回おされる）にする。3を言う。', ['EventCount:click', 0], ['Say', 0, 0], COUNT_PLACE, COUNT_PLACE],
          ['CP2 a join holding a misplaced count to the condition of もし', '（自分が3回おされる）と「あ」をつなげて言う。\nもし点数が1なら、\n  4を言う。', ['BuiltinCall:つなぐ', 0], ['IfStatement', 0, 'condition'], true, true],
        ]);
      });
      test('a text typed empty in its own field where a name is read is written, unlike an empty text put there', () => {
        const name = makeDefaultProject().components.find((part) => part.id === 'sprite-1').name,
          w = placeWork('もし「' + name + '」にふれているなら、\n  1秒待つ。'),
          text = w.nodes.find((n) => n.schemaId === 'StringLiteral' && n.fields.value === name),
          typed = prepare(w.session, { type: 'field', id: text.id, key: 'value', value: '' }, { project: w.project, context: w.context });
        ok(typed.source === 'もし「」にふれているなら、\n  1秒待つ。', typed.source);
        const thrown = editRefused(() => prepare(w.session, { type: 'expression', ...w.at('SensorRead:TOUCHING', 'arg'), node: createBlock('StringLiteral') }, { project: w.project, context: w.context }));
        ok(thrown === 'E901 からっぽの 文字は 名前に ならない ので、そこには 入れられないよ。名前を 書いた 文字を 入れてね。', thrown);
        // An empty text moved there, or put in place of the partner's text, is refused as well; a named one goes in.
        const moving = placeWork('「」と言う。\nもし「' + name + '」にふれているなら、\n  1秒待つ。'),
          empty = moving.nodes.find((n) => n.schemaId === 'StringLiteral' && n.fields.value === ''),
          partnerText = moving.nodes.find((n) => n.schemaId === 'StringLiteral' && n.fields.value === name),
          words = (value) => { const block = createBlock('StringLiteral'); block.fields.value = value; return block; },
          edit = (op) => editRefused(() => prepare(moving.session, op, { project: moving.project, context: moving.context }));
        ok(edit({ type: 'expression-move', id: empty.id, ...moving.at('SensorRead:TOUCHING', 'arg'), replacement: words('あ') }) === thrown, 'an empty text moved to the partner');
        ok(edit({ type: 'replace', id: partnerText.id, node: createBlock('StringLiteral') }) === thrown, 'an empty text put in place of the partner');
        const named = prepare(moving.session, { type: 'replace', id: partnerText.id, node: words('星') }, { project: moving.project, context: moving.context });
        ok(named.source === '「」と言う。\nもし「星」にふれているなら、\n  1秒待つ。', named.source);
      });
      test('a list count put into a sentence written as blocks write it takes its own form, and the child own words keep the brackets', () => {
        const count = placeWork('持ち物の数を言う。').nodes.find((n) => n.schemaId === 'BuiltinCall:LENGTH');
        for (const [source, schemaId, input, want] of [
          ['もし点数が0なら、\n  「あ」と言う。', 'CompareExpression:EQ', 'left', 'もし持ち物の数が0なら、\n  「あ」と言う。'],
          ['もし点数が0なら、  ※ メモ\n  「あ」と言う。', 'CompareExpression:EQ', 'left', 'もし持ち物の数が0なら、  ※ メモ\n  「あ」と言う。'],
          ['点数が0になるまで待つ。', 'CompareExpression:EQ', 'left', '持ち物の数が0になるまで待つ。'],
          ['点数を言う。', 'Say', 'value', '持ち物の数を言う。'],
          ['点数を点数にする。', 'Assignment', 'value', '点数を持ち物の数にする。'],
          ['点数を点数＋1にする。', 'BinaryExpression:ADD', 'left', '点数を持ち物の数＋1にする。'],
          ['点数を 点数 にする。', 'Assignment', 'value', '点数を （持ち物の数） にする。'],
          ['もし点数が0と同じなら、\n  「あ」と言う。', 'CompareExpression:EQ', 'left', 'もし（持ち物の数）が0と同じなら、\n  「あ」と言う。'],
        ]) {
          const w = placeWork(source), holder = w.nodes.find((n) => n.schemaId === schemaId),
            got = prepare(w.session, { type: 'expression', parentId: holder.id, input, node: JSON.parse(JSON.stringify(count)) }, { project: w.project, context: w.context }).source;
          ok(got === want, JSON.stringify(source) + ': ' + JSON.stringify(got));
        }
      });
      test('a sentence written before the words of its repeat keeps its words when a block is put in the repeat', () => {
        const rest = '\n「😀é」  と言う。   ※ そのまま  \n';
        for (const [line, head, inner] of [
          ['10歩進むことを3回くり返す。 ※ m  ', '3回くり返す。', '10歩進む。  ※ m  '],
          ['10歩進むことをずっとくり返す。 ※ m  ', 'ずっとくり返す。', '10歩進む。  ※ m  '],
          ['点数が3より小さいあいだ、10歩進むことをくり返す。 ※ m  ', '点数が3より小さいあいだ、くり返す。', '10歩進む。  ※ m  '],
          ['「や あ」と言うことを3回くり返す。', '3回くり返す。', '「や あ」と言う。'],
          ['もし点数が3なら、10歩進む。 ※ m  ', 'もし点数が3なら、', '10歩進む。  ※ m  '],
          ['3回くり返す。\n  10歩進む。', '3回くり返す。', '10歩進む。'],
        ]) {
          const w = placeWork(line + rest), loop = w.session.blockView.bodies.body[0],
            got = prepare(w.session, { type: 'insert', parentId: loop.id, body: loop.schemaId === 'IfStatement' ? 'thenBody' : 'body', index: 1, node: createBlock('NoOperation') }, { project: w.project, context: w.context }).source;
          ok(got === head + '\n  ' + inner + '\n  何もしない。' + rest, JSON.stringify(line) + ': ' + JSON.stringify(got));
        }
      });
      {
        // The words a child wrote stay when a block is changed: only what changed is written again.
        const eq = (a,b) => ok(JSON.stringify(a)===JSON.stringify(b),`expected ${JSON.stringify(b)}; got ${JSON.stringify(a)}`);
      const setup = source => {
        const p=Akari.makeDefaultProject();p.scripts=[{targetId:'stage',event:'start',source}];
        return Akari.createEditorSession('script:stage:start',source,{targetId:'stage',event:'start'},p,4);
      };
      const change = (s,id,value,key='value') => Akari.prepareBlockEdit(s,{type:'field',id,key,value});
      const input = (s,path) => path.reduce((n,k)=>n[k],s.blockView.bodies.body[0]);
      const edits = [
        ['value-first',' 点数に3を足す。  ※  残す　 ',['inputs','value'],8,' 点数に8を足す。  ※  残す　 '],
        ['assign','点数を3にする。', ['inputs','value'],8,'点数を8にする。'],
        ['target-first','点数を3にする。', ['inputs','value'],8,'点数を8にする。'],
        ['increase','点数を3増やす。',['inputs','value'],8,'点数を8増やす。'],
        ['decrease','点数を3減らす。',['inputs','value'],8,'点数を8減らす。'],
        ['subtract','点数から3を引く。',['inputs','value'],8,'点数から8を引く。'],
        ['append','名前一覧の最後に3を入れる。',['inputs','value'],8,'名前一覧の最後に8を入れる。'],
        ['insert-index','名前一覧の3番目に3を入れる。',['inputs','index','inputs','value'],2,'名前一覧の2番目に3を入れる。'],
        ['insert-value','名前一覧の3番目に3を入れる。',['inputs','value'],8,'名前一覧の3番目に8を入れる。'],
        ['delete-index','名前一覧の3番目を消す。',['inputs','index','inputs','value'],2,'名前一覧の2番目を消す。'],
        ['input','「入力欄」に3を入れる。',['inputs','args',1],8,'「入力欄」に8を入れる。'],
        ['turn','左に３度回る。',['inputs','args',0,'inputs','value'],8,'左に8度回る。'],
        ['goto-x','画面の左下のはしから、右へ3歩、上へ3歩のばしょへ行く。',['inputs','x','inputs','value'],8,'画面の左下のはしから、右へ8歩、上へ3歩のばしょへ行く。'],
        ['goto-y','画面の左下のはしから、右へ3歩、上へ3歩のばしょへ行く。',['inputs','y','inputs','value'],8,'画面の左下のはしから、右へ3歩、上へ8歩のばしょへ行く。'],
        ['glide-x','3秒かけて、画面の左下のはしから、右へ3歩、上へ3歩のばしょへ行く。',['inputs','x','inputs','value'],8,'3秒かけて、画面の左下のはしから、右へ8歩、上へ3歩のばしょへ行く。'],
        ['glide-y','3秒かけて、画面の左下のはしから、右へ3歩、上へ3歩のばしょへ行く。',['inputs','y','inputs','value'],8,'3秒かけて、画面の左下のはしから、右へ3歩、上へ8歩のばしょへ行く。'],
        ['glide-time','3秒かけて、画面の左下のはしから、右へ3歩、上へ3歩のばしょへ行く。',['inputs','seconds','inputs','value'],8,'8秒かけて、画面の左下のはしから、右へ3歩、上へ3歩のばしょへ行く。'],
        ['move-by-x','いまのばしょから、左へ3歩、下へ3歩動く。',['inputs','x','inputs','value'],8,'いまのばしょから、左へ8歩、下へ3歩動く。'],
        ['move-by-y','いまのばしょから、左へ3歩、下へ3歩動く。',['inputs','y','inputs','value'],8,'いまのばしょから、左へ3歩、下へ8歩動く。'],
        ['move-by-time','3秒かけて、いまのばしょから、右へ3歩動く。',['inputs','seconds','inputs','value'],8,'8秒かけて、いまのばしょから、右へ3歩動く。'],
        ['turn-time','3秒かけて、右に3度回る。',['inputs','seconds','inputs','value'],8,'8秒かけて、右に3度回る。'],
        ['tone-frequency','3Hzの音を3秒鳴らす。',['inputs','args',0,'inputs','value'],8,'8Hzの音を3秒鳴らす。'],
        ['tone-time','3Hzの音を3秒鳴らす。',['inputs','args',1,'inputs','value'],8,'3Hzの音を8秒鳴らす。'],
        ['wait','3秒待つ。',['inputs','seconds','inputs','value'],8,'8秒待つ。'],
        ['compare-left','（3が3より小さい）の値を言う。',['inputs','value','inputs','left'],8,'（8が3より小さい）の値を言う。'],
        ['compare-right','（3が3未満）の値を言う。',['inputs','value','inputs','right'],8,'（3が8未満）の値を言う。'],
        ['nested-expression','点数に（3＋3）を足す。',['inputs','value','inputs','right'],8,'点数に（3＋8）を足す。'],
        ['inline-body','もし点数が3より大きいなら、点数に3を足す。 ※ 後ろ  ',['bodies','thenBody',0,'inputs','value'],8,'もし点数が3より大きいなら、点数に8を足す。 ※ 後ろ  '],
        ['inline-condition','もし点数が3より小さいなら、点数に3を足す。',['inputs','condition','inputs','right'],8,'もし点数が8より小さいなら、点数に3を足す。'],
        ['inline-body-when','もし点数が3より大きいとき、点数に3を足す。 ※ 後ろ  ',['bodies','thenBody',0,'inputs','value'],8,'もし点数が3より大きいとき、点数に8を足す。 ※ 後ろ  '],
        ['inline-condition-when','もし点数が3より小さいときは、点数に3を足す。',['inputs','condition','inputs','right'],8,'もし点数が8より小さいときは、点数に3を足す。'],
      ];
      for(const [key,line,path,value,expected] of edits) test('surface keeps the words: '+key,()=>{
        // Keep a deliberately noncanonical unrelated line and blank lines byte-for-byte.
        const source=line.trimStart()+'\n\n「😀é」  と言う。   ※ そのまま  \n';
        const s=setup(source), before=JSON.stringify(s.blockView), n=input(s,path);
        ok(s.syntaxAst,JSON.stringify(s.syntaxDiagnostics));
        const result=change(s,n.id,value);
        eq(result.source,expected.trimStart()+source.slice(line.trimStart().length));
        eq(s.sourceText,source);eq(JSON.stringify(s.blockView),before);
        ok(Akari.astEquivalent(result.syntaxAst,Akari.blockDecode(result.blockView)));
      });
      test('surface keeps the words: target-role',()=>{
        const s=setup('点数を3にする。 ※ 後ろ '), t=s.blockView.bodies.body[0].inputs.target;
        eq(change(s,t.id,'合計','name').source,'合計を3にする。 ※ 後ろ ');
      });
      test('surface keeps the words: crlf-unicode',()=>{
        const source='名前一覧の最後に「😀é」を入れる。  ※ 末尾  \r\n点数に3を足す。\r\n';
        const s=setup(source), n=s.blockView.bodies.body[1].inputs.value;
        eq(change(s,n.id,8).source,source.replace('点数に3を','点数に8を'));
        const first=s.blockView.bodies.body[0].inputs.value;
        eq(change(s,first.id,'😀新é').source,source.replace('😀é','😀新é'));
      });
      test('surface keeps the words: inline-expand',()=>{
        const source='※ 前  \nもし条件（条件の答え（あてはまる））が成り立つなら、点数に3を足す。 ※ 本文  \n\n「😀」  と言う。 ※ 後  \n';
        const s=setup(source), branch=s.blockView.bodies.body[1];
        const result=Akari.prepareBlockEdit(s,{type:'insert',parentId:branch.id,body:'thenBody',index:1,node:Akari.createBlock('NoOperation')});
        eq(result.source,'※ 前  \nもし条件（条件の答え（あてはまる））が成り立つなら、\n  点数に3を足す。  ※ 本文  \n  何もしない。\n\n「😀」  と言う。 ※ 後  \n');
        eq(result.syntaxAst.body[1].inlineComment,'');eq(result.syntaxAst.body[1].thenBody[0].inlineComment,'※ 本文  ');
      });
      test('surface keeps the words: insert-remove-move',()=>{
        const s=setup('点数に1を足す。\n\n点数に2を足す。 ※ 後  \n3秒待つ。');
        const b=s.blockView.bodies.body;
        eq(Akari.prepareBlockEdit(s,{type:'move',id:b[1].id,parentId:s.blockView.id,body:'body',index:0}).source,
          '点数に2を足す。 ※ 後  \n点数に1を足す。\n3秒待つ。');
        eq(Akari.prepareBlockEdit(s,{type:'remove',id:b[1].id}).source,'点数に1を足す。\n\n3秒待つ。');
      });
      test('surface keeps the words: atomic-stale-ime-limit',()=>{
        const s=setup('点数に3を足す。'), n=s.blockView.bodies.body[0].inputs.value;
        const op={type:'field',id:n.id,key:'value',value:8};
        const reject=(options,message)=>{const before=JSON.stringify(s);let failed=false;try{Akari.prepareBlockEdit(s,op,options);}catch(e){failed=e&&e.code==='E901'&&e.message===message;}ok(failed);eq(JSON.stringify(s),before);};
        const changed='とちゅうで 作品が かわったよ。もう一度 やってね。';
        reject({sourceRevision:99},changed);reject({contextRevision:3},changed);reject({validateCandidate:()=>false},'作品の きまりに 合わないので、できなかったよ。');
        s.pendingEdit={id:'composing',composing:true};reject({},'入れている とちゅうの ものを、Enter キーで 決めるか、Esc キーで やめてね。');s.pendingEdit=null;
        const limit=setup('点数に3を足す。\n※'+'a'.repeat(Akari.LIMITS.sourceEach-11));
        const before=JSON.stringify(limit);let failed=false;
        try{change(limit,limit.blockView.bodies.body[0].inputs.value.id,123456789);}catch(e){failed=e&&e.code==='P208'&&e.message==='この 動きの まとまりが 長すぎます。ブロックや 文字を へらして ください';}
        ok(failed);eq(JSON.stringify(limit),before);
      });
      test('surface keeps the words: inline-comments-and-position',()=>{
        const source='もし条件（条件の答え（あてはまる））が成り立つなら、\n  「😀」を言う。  ※ 本文  \n※ 枝の間  \nそうでなければ、\n  「é」を言う。 ※ 別枝  ';
        const s=setup(source), n=s.syntaxAst.body[0];
        eq(n.inlineComment,'');eq(n.thenBody[0].inlineComment,'※ 本文  ');eq(n.thenBody[1].text,' 枝の間  ');
        eq(n.elseComment,'');eq(n.elseBody[0].inlineComment,'※ 別枝  ');
        eq(n.thenBody[0].sourceSpan.startColumn,3);eq(n.elseBody[0].sourceSpan.startColumn,3);
      });
      test('surface keeps the words: batch-role-offsets',()=>{
        const s=setup('3秒かけて、画面の左下のはしから、上へ3歩、右へ3歩のばしょへ行く。 ※ 末尾 '), inputs=s.blockView.bodies.body[0].inputs;
        const result=Akari.prepareBlockEdit(s,{type:'batch',operations:[
          {type:'field',id:inputs.seconds.inputs.value.id,key:'value',value:10},
          {type:'field',id:inputs.x.inputs.value.id,key:'value',value:200},
          {type:'field',id:inputs.y.inputs.value.id,key:'value',value:50},
        ]});
        eq(result.source,'10秒かけて、画面の左下のはしから、上へ50歩、右へ200歩のばしょへ行く。 ※ 末尾 ');
      });
      test('surface keeps the words: predicate-in-expression-slot',()=>{
        const source='（0＋0）の値を言う。 ※ 末尾  \n「😀」  と言う。\n',s=setup(source);
        const binary=s.blockView.bodies.body[0].inputs.value;
        for(const [schema,expression] of [
          ['BuiltinCall:CONTAINS','0に0が含まれている'],
          ['BuiltinCall:INDEX_OF','0の中で0がはじめて出てくる番号'],
          ['BuiltinCall:LENGTH','0の長さ'],
        ]) {
          const result=Akari.prepareBlockEdit(s,{type:'replace',id:binary.inputs.left.id,node:Akari.createBlock(schema)});
          eq(result.source,'（（'+(schema==='BuiltinCall:CONTAINS'?'0に0が入っている':expression)+'）＋0）の値を言う。 ※ 末尾  \n「😀」  と言う。\n');
          eq(result.blockView.bodies.body[0].inputs.value.inputs.left.schemaId,schema);
          eq(s.sourceText,source);
        }
      });
      test('surface keeps the words: condition-connective-operands',()=>{
        for(const head of ['3が8より小さいあいだ','条件（3が8未満）が成り立つあいだ','3が8より小さいあいだ',
          '3が8と同じであるあいだ','3が8と違うあいだ','3が8以上のあいだ',
          '条件（3が8未満）が成り立つまで','3が8と同じになるまで','3が8より小さくなるまで']) {
          const source=head+'、くり返す。 ※ 頭  \r\n  点数に3を足す。 ※ 本文  \r\n「😀」 と言う。\r\n';
          const s=setup(source), n=s.blockView.bodies.body[0].inputs.condition.inputs.left;
          eq(change(s,n.id,4).source,source.replace('3が','4が'));
          eq(s.sourceText,source);
        }
      });
      test('surface keeps the words: condition-wait-and-inline-ranges',()=>{
        for(const prefix of ['', 'もし条件（条件の答え（あてはまる））が成り立つなら、']) for(const text of [
          '条件（3が8未満）が成り立つまで待つ。', '3が8と同じになるまで待つ。',
          '条件（（3が8未満）かつ（条件の答え（あてはまる）））が成り立つまで待つ。']) {
          const source=prefix+text+' ※ 後ろ  \n「😀」 と言う。\n',s=setup(source);
          const stmt=prefix?s.blockView.bodies.body[0].bodies.thenBody[0]:s.blockView.bodies.body[0];
          let n=stmt.inputs.condition;
          while(n.inputs.left)n=n.inputs.left;
          eq(change(s,n.id,4).source,source.replace('3が','4が'));
          const location=s.nodeMap.get(n.id);
          eq(location.sourceSpan.startColumn,[...source.slice(0,source.indexOf('3'))].length+1);
        }
      });
      test('surface keeps the words: condition-replacement-keeps-body',()=>{
        const source='3が8より小さいあいだ、くり返す。 ※ 頭  \r\n  点数に3を足す。 ※ 本文  \r\n「😀」 と言う。\r\n';
        const s=setup(source),n=s.blockView.bodies.body[0].inputs.condition;
        const result=Akari.prepareBlockEdit(s,{type:'replace',id:n.id,node:Akari.createBlock('CompareExpression:GT')});
        eq(result.source,'0が0より大きいあいだ、くり返す。'+source.slice(source.indexOf(' ※ 頭')));
      });
      test('surface keeps the words: when-header-as-written',()=>{
        // もし…のとき、 is read as もし…なら、: the sentence after it keeps its place and its memo, and a change writes only
        // what changes, as in the なら form.
        const rest='\n\n「😀é」  と言う。   ※ そのまま  \n', source='もし点数が3より大きいとき、点数に3を足す。 ※ 後ろ  '+rest;
        const s=setup(source), branch=s.blockView.bodies.body[0], read=s.syntaxAst.body[0].thenBody[0];
        eq(read.inlineComment,'※ 後ろ  ');eq(read.sourceSpan.startColumn,15);
        eq(Akari.prepareBlockEdit(s,{type:'operator',id:branch.inputs.condition.id,schemaId:'CompareExpression:LT'}).source,'もし点数が3より小さければ、点数に3を足す。 ※ 後ろ  '+rest);
        eq(Akari.prepareBlockEdit(s,{type:'insert',parentId:branch.id,body:'thenBody',index:1,node:Akari.createBlock('NoOperation')}).source,
          'もし点数が3より大きければ、\n  点数に3を足す。  ※ 後ろ  \n  何もしない。'+rest);
        const lines='もし点数が3より小さいとき、 ※ 頭  \n  点数に3を足す。'+rest, t=setup(lines), head=t.blockView.bodies.body[0];
        eq(change(t,head.inputs.condition.inputs.right.id,8).source,lines.replace('3より','8より'));
        eq(Akari.prepareBlockEdit(t,{type:'operator',id:head.inputs.condition.id,schemaId:'CompareExpression:GT'}).source,lines.replace('3より小さいとき','3より大きければ'));
        // のとき and のときは, with CRLF lines: the value changes where it is written, and the memo stays with the sentence.
        for (const when of ['もし点数が3のとき、','もし点数が3のときは、']) {
          const text=when+'点数に3を足す。 ※ 後ろ  \r\n「😀é」 と言う。\r\n', u=setup(text), sentence=u.blockView.bodies.body[0].bodies.thenBody[0];
          eq(u.syntaxAst.body[0].thenBody[0].inlineComment,'※ 後ろ  ');
          eq(change(u,sentence.inputs.value.id,8).source,text.replace('点数に3を','点数に8を'));
          eq(change(u,u.blockView.bodies.body[0].inputs.condition.inputs.right.id,8).source,text.replace('点数が3の','点数が8の'));
        }
      });
      test('surface keeps the words: lead-word-keeps-memo',()=>{
        // まず、 before もし only says the order: the sentence after the もし keeps its memo when the block is written again.
        const rest='\n\n「😀é」  と言う。   ※ そのまま  \n';
        for(const head of ['まず、もし点数が3より大きいなら、','まず、もし点数が3より大きいとき、']) {
          const s=setup(head+'点数に3を足す。 ※ 後ろ  '+rest), branch=s.blockView.bodies.body[0];
          eq(s.syntaxAst.body[0].thenBody[0].inlineComment,'※ 後ろ  ');
          eq(Akari.prepareBlockEdit(s,{type:'insert',parentId:branch.id,body:'thenBody',index:1,node:Akari.createBlock('NoOperation')}).source,
            'もし点数が3より大きければ、\n  点数に3を足す。  ※ 後ろ  \n  何もしない。'+rest);
        }
      });
      test('surface keeps the words: inline-repeat-keeps-words',()=>{
        // A sentence written before the words of its repeat (10歩進むことを3回くり返す) keeps its words, and the line's 。 and
        // memo go with it, when a block is put in the repeat (as in the one-line もし); the rest stays as written.
        const rest='\n「😀é」  と言う。   ※ そのまま  \n';
        for(const [line,head,inner] of [
          ['10歩進むことを3回くり返す。 ※ m  ','3回くり返す。','10歩進む。  ※ m  '],
          ['10歩進むことをずっとくり返す。 ※ m  ','ずっとくり返す。','10歩進む。  ※ m  '],
          ['点数が3より小さいあいだ、10歩進むことをくり返す。 ※ m  ','点数が3より小さいあいだ、くり返す。','10歩進む。  ※ m  '],
          ['点数が3より大きくなるまで、10歩進むことをくり返す。 ※ m  ','点数が3より大きくなるまで、くり返す。','10歩進む。  ※ m  '],
          ['「や あ」と言うことを3回くり返す。','3回くり返す。','「や あ」と言う。'],
        ]) {
          const s=setup(line+rest), loop=s.blockView.bodies.body[0];
          eq(Akari.prepareBlockEdit(s,{type:'insert',parentId:loop.id,body:'body',index:1,node:Akari.createBlock('NoOperation')}).source,
            head+'\n  '+inner+'\n  何もしない。'+rest);
        }
      });
      test('surface keeps the words: natural-condition-keeps-words',()=>{
        // A condition read in other words (ちょうど3, 3ではない, 3いじょう) keeps the places of the words written: a value
        // changed in it is written in its place, and the line keeps its form, its memo and the rest of the text.
        const rest='\n「😀é」  と言う。   ※ そのまま  \n', body='\n  10歩進む。'+rest;
        for(const [source,expected] of [
          ['もし点数がちょうど3なら、'+body,'もし点数がちょうど8なら、'+body],
          ['もし点数が3ではないなら、点数に5を足す。 ※ 後ろ  '+rest,'もし点数が8ではないなら、点数に5を足す。 ※ 後ろ  '+rest],
          ['もし点数が3ではなく、よこのばしょが4より大きいなら、'+body,'もし点数が8ではなく、よこのばしょが4より大きいなら、'+body],
          ['もし点数が3いじょうなら、'+body,'もし点数が8いじょうなら、'+body],
          ['もし点数が3未満なら、'+body,'もし点数が8未満なら、'+body],
          ['点数が3ではないあいだ、くり返す。'+body,'点数が8ではないあいだ、くり返す。'+body],
        ]) {
          const s=setup(source), three=n=>n.schemaId==='NumberLiteral'&&n.fields.value===3?n:Object.values(n.inputs||{}).flat().map(three).find(Boolean);
          eq(change(s,three(s.blockView.bodies.body[0].inputs.condition).id,8).source,expected);
        }
      });
      test('surface keeps the words: rewritten-header-ends-line',()=>{
        // A もし whose condition has no place of its own is written again as a header (ending with 、): nothing of the old
        // end of the line is left after it, and the rest stays as written.
        const rest='\n  点数に3を足す。 ※ 本文  \n「😀é」  と言う。   ※ そのまま  \n';
        for(const [head,expected] of [
          ['もし点数が3か4なら、次のことをする。 ※ 頭  ','もし点数が8と同じか、点数が4と同じなら、 ※ 頭  '],
          ['もし点数が3か4なら。','もし点数が8と同じか、点数が4と同じなら、'],
          ['もし 点数が 3か4 なら、 次のことを する 。','もし点数が8と同じか、点数が4と同じなら、'],
          ['もし点数が3か4なら、次のことをする。。 ※ 頭  ','もし点数が8と同じか、点数が4と同じなら、 ※ 頭  '],
          ['もし点数が3か4なら、次のことをする\t。\u3000。','もし点数が8と同じか、点数が4と同じなら、'],
        ]) {
          const s=setup(head+rest), three=n=>n.schemaId==='NumberLiteral'&&n.fields.value===3?n:Object.values(n.inputs||{}).flat().map(three).find(Boolean);
          eq(change(s,three(s.blockView.bodies.body[0].inputs.condition).id,8).source,expected+rest);
        }
      });
      test('surface keeps the words: a sentence put before a memo line or after a leading empty line goes on its own line', () => {
        const put = (source, index, parent = (s) => s.blockView.id) => { const s = setup(source); return Akari.prepareBlockEdit(s, { type: 'insert', parentId: parent(s), body: 'body', index, node: Akari.createBlock('NoOperation') }).source; };
        eq(put('※\n点数を1にする。', 0), '何もしない。\n※\n点数を1にする。');
        eq(put('点数を1にする。\n※\n点数を2にする。', 1), '点数を1にする。\n何もしない。\n※\n点数を2にする。');
        eq(put('点数を1にする。\r\n※\r\n点数を2にする。', 1), '点数を1にする。\r\n何もしない。\r\n※\r\n点数を2にする。');
        eq(put('3回くり返す。\n  ※\n  点数を1にする。', 0, (s) => s.blockView.bodies.body[0].id), '3回くり返す。\n  何もしない。\n  ※\n  点数を1にする。');
        eq(put('\n点数を 1 にする。', 0), '\n何もしない。\n点数を 1 にする。');
        eq(put('\r\n点数を 1 にする。', 0), '\r\n何もしない。\r\n点数を 1 にする。');
        // (lines ended by \r alone)
        eq(put('点数を 1 にする。\r点数を 2 にする。', 1), '点数を 1 にする。\r何もしない。\r点数を 2 にする。');
        eq(put('点数を 1 にする。\r※\r点数を 2 にする。', 1), '点数を 1 にする。\r何もしない。\r※\r点数を 2 にする。');
        eq(put('\r点数を 1 にする。', 0), '\r何もしない。\r点数を 1 にする。');
        // Sentences put between two that share a line: that line is written again, one on each line; the other lines stay.
        const rest = '\n「😀é」  と言う。   ※ そのまま  ';
        eq(put('点数を 1 にする。点数を 2 にする。' + rest, 1), '点数を1にする。\n何もしない。\n点数を2にする。' + rest);
        eq(put('点数を 1 にする。  点数を 2 にする。 ※ m' + rest, 1), '点数を1にする。\n何もしない。\n点数を2にする。  ※ m' + rest);
        eq(put('「😀é」  と言う。\n点数を 1 にする。点数を 2 にする。', 2), '「😀é」  と言う。\n点数を1にする。\n何もしない。\n点数を2にする。');
      });
      test('surface keeps the words: a sentence given a subject stays on its line unless its words go over lines or come before its block words', () => {
        const rest = '\n「😀é」  と言う。   ※ そのまま  ', name = Akari.makeDefaultProject().components.find((c) => c.id === 'sprite-1').name;
        for (const [line, expected] of [
          ['もし点数が3なら、「a\nb」と言う。 ※ m', 'もし点数が3なら、\n  ' + name + 'は「a\nb」と言う。  ※ m'],
          ['もし点数が3なら、「ab」と言う。 ※ m', 'もし点数が3なら、' + name + 'は「ab」と言う。  ※ m'],
          ['「a\nb」と言うことを3回くり返す。', '3回くり返す。\n  ' + name + 'は「a\nb」と言う。'],
          ['「ab」と言うことを3回くり返す。', '3回くり返す。\n  ' + name + 'は「ab」と言う。'],
        ]) {
          const s = setup(line + rest), say = [...Akari.diagnostics.buildBlockIndex(s.blockView).values()].map((e) => e.node).find((n) => n.schemaId === 'Say');
          eq(Akari.prepareBlockEdit(s, { type: 'field', id: say.id, key: 'actorRef', value: { kind: 'named', name } }).source, expected + rest);
        }
      });
      test('surface keeps the words: a sentence of a body removed, replaced or moved leaves the other lines as written', () => {
        const rest = '\n「😀é」  と言う。   ※ そのまま  ', body = '3回くり返す。\n  点数を 1 にする。\n  点数を 2 にする。' + rest,
          inner = (s, i) => s.blockView.bodies.body[0].bodies.body[i].id;
        let s = setup(body);
        eq(Akari.prepareBlockEdit(s, { type: 'remove', id: inner(s, 0) }).source, '3回くり返す。\n  点数を 2 にする。' + rest);
        eq(Akari.prepareBlockEdit(s, { type: 'replace', id: inner(s, 1), node: Akari.createBlock('NoOperation') }).source, '3回くり返す。\n  点数を 1 にする。\n  何もしない。' + rest);
        eq(Akari.prepareBlockEdit(s, { type: 'move', id: inner(s, 1), parentId: s.blockView.bodies.body[0].id, body: 'body', index: 0 }).source, '3回くり返す。\n  点数を 2 にする。\n  点数を 1 にする。' + rest);
      });
      // A body indented with full-width spaces: a line written again starts where its row starts, so the line before keeps
      // its end; the lines written again have half-width spaces as wide as the indent.
      test('surface keeps the words: a sentence of a body indented with full-width spaces removed, replaced or moved leaves the other lines as written', () => {
        const F = '　', rest = '\n「x」と言う。', inner = (s, i) => s.blockView.bodies.body[0].bodies.body[i].id;
        let cases = 0;
        for (const indent of [F, F + F, F + ' ', ' ' + F]) {
          const body = '3回くり返す。\n' + indent + '点数を 1 にする。\n' + indent + '点数を 2 にする。' + rest, wide = ' '.repeat(indent.length + indent.split(F).length - 1);
          for (const [op, expected] of [
            [s => ({ type: 'remove', id: inner(s, 0) }), '3回くり返す。\n' + indent + '点数を 2 にする。' + rest],
            [s => ({ type: 'remove', id: inner(s, 1) }), '3回くり返す。\n' + indent + '点数を 1 にする。' + rest],
            [s => ({ type: 'replace', id: inner(s, 1), node: Akari.createBlock('NoOperation') }), '3回くり返す。\n' + indent + '点数を 1 にする。\n' + wide + '何もしない。' + rest],
            [s => ({ type: 'move', id: inner(s, 1), parentId: s.blockView.bodies.body[0].id, body: 'body', index: 0 }), '3回くり返す。\n' + wide + '点数を 2 にする。\n' + wide + '点数を 1 にする。' + rest],
          ]) {
            const s = setup(body);
            eq([body, Akari.prepareBlockEdit(s, op(s)).source], [body, expected]);
            cases++;
          }
        }
        eq(cases, 16);
      });
      // A block edit of a body indented with full-width spaces writes the text as the same edit of the body indented with
      // as many half-width spaces does (a full-width space counts as two): the same lines, each with the same words after
      // an indent as wide; the lines it does not write again keep their full-width spaces.
      test('surface keeps the words: block edits of a body indented with full-width spaces write the lines the half-width body would, as far in', () => {
        const F = '　', width = (lead) => lead.length + lead.split(F).length - 1, noop = () => Akari.createBlock('NoOperation');
        const loop = (s) => s.blockView.bodies.body[0], at = (s, i) => loop(s).bodies.body[i];
        const rows = (text) => text.split(/\r\n?|\n/).map((row) => { const lead = row.match(/^[ 　]*/)[0]; return [width(lead), row.slice(lead.length)]; });
        const nested = {
          insert0: (s) => ({ type: 'insert', parentId: loop(s).id, body: 'body', index: 0, node: noop() }),
          insert1: (s) => ({ type: 'insert', parentId: loop(s).id, body: 'body', index: 1, node: noop() }),
          insertEnd: (s) => ({ type: 'insert', parentId: loop(s).id, body: 'body', index: 3, node: noop() }),
          insertInner: (s) => ({ type: 'insert', parentId: at(s, 1).id, body: 'thenBody', index: 1, node: noop() }),
          removeIf: (s) => ({ type: 'remove', id: at(s, 1).id }),
          removeInner: (s) => ({ type: 'remove', id: at(s, 1).bodies.thenBody[0].id }),
          replaceIf: (s) => ({ type: 'replace', id: at(s, 1).id, node: noop() }),
          moveIfUp: (s) => ({ type: 'move', id: at(s, 1).id, parentId: loop(s).id, body: 'body', index: 0 }),
          moveIfDown: (s) => ({ type: 'move', id: at(s, 1).id, parentId: loop(s).id, body: 'body', index: 3 }),
          outdent: (s) => ({ type: 'move', id: at(s, 1).bodies.thenBody[0].id, parentId: loop(s).id, body: 'body', index: 0 }),
          indentIn: (s) => ({ type: 'move', id: at(s, 0).id, parentId: at(s, 1).id, body: 'thenBody', index: 0 }),
          swapInner: (s) => ({ type: 'move', id: at(s, 1).bodies.thenBody[1].id, parentId: at(s, 1).id, body: 'thenBody', index: 0 }),
          duplicateIf: (s) => ({ type: 'duplicate', id: at(s, 1).id, parentId: loop(s).id, body: 'body', index: 3 }),
          duplicate0: (s) => ({ type: 'duplicate', id: at(s, 0).id, parentId: loop(s).id, body: 'body', index: 1 }),
        };
        const kinds = [
          [(i) => '3回くり返す。\n' + i + '点数を 1 にする。\n' + i + 'もし点数が1なら、\n' + i + i + '点数を 2 にする。\n' + i + i + '点数を 3 にする。\n' + i + '点数を 4 にする。\n「x」と言う。', nested],
          [(i) => '3回くり返す。\n' + i + '点数を 1 にする。点数を 2 にする。\n' + i + '点数を 3 にする。\n「x」と言う。', {
            insert1: nested.insert1, remove1: (s) => ({ type: 'remove', id: at(s, 1).id }),
            move2to0: (s) => ({ type: 'move', id: at(s, 2).id, parentId: loop(s).id, body: 'body', index: 0 }),
            move0to2: (s) => ({ type: 'move', id: at(s, 0).id, parentId: loop(s).id, body: 'body', index: 2 }) }],
          [(i) => '3回くり返す。\n' + i + '「a\nb」と言う。\n' + i + 'もし点数が1なら、\n' + i + i + '「c\n  d」と言う。\n' + i + '点数を 4 にする。\n「x」と言う。',
            Object.fromEntries(Object.entries(nested).filter(([name]) => !/Inner|swap|outdent/.test(name)))],
        ];
        const edit = (source, op) => { const s = setup(source); return Akari.prepareBlockEdit(s, op(s)).source; };
        let cases = 0;
        for (const [make, ops] of kinds)
          for (const [name, op] of Object.entries(ops))
            for (const indent of [F, F + F, F + ' ', ' ' + F]) {
              const half = edit(make(indent.split(F).join('  ')), op), full = edit(make(indent), op);
              eq([name, make(indent), rows(full)], [name, make(indent), rows(half)]);
              // (the words of a line written again are those the half-width edit writes)
              ok(/点数を\d/.test(half) || !/点数を\d/.test(full), name + ': ' + full);
              cases++;
            }
        // (a block moved keeps how far in its later lines are from it; an empty line in it gets the indent it is put at)
        for (const [source, expected] of [
          ['3回くり返す。\n' + F + '点数を 1 にする。\n' + F + 'もし点数が1なら、\n' + F + F + '点数を 2 にする。\n\n' + F + F + '点数を 3 にする。\n「x」と言う。',
            '3回くり返す。\n  もし点数が1なら、\n    点数を 2 にする。\n  \n    点数を 3 にする。\n  点数を 1 にする。\n「x」と言う。'],
          ['3回くり返す。\n' + F + F + '点数を 1 にする。\n' + F + F + 'もし点数が1なら、\n' + F + F + F + F + '点数を 2 にする。\n「x」と言う。',
            '3回くり返す。\n    もし点数が1なら、\n        点数を 2 にする。\n    点数を 1 にする。\n「x」と言う。'],
          ['3回くり返す。\n  点数を 1 にする。\n  もし点数が1なら、\n    点数を 2 にする。\n\n    点数を 3 にする。\n「x」と言う。',
            '3回くり返す。\n  もし点数が1なら、\n    点数を 2 にする。\n  \n    点数を 3 にする。\n  点数を 1 にする。\n「x」と言う。'],
        ]) {
          eq([source, edit(source, nested.moveIfUp)], [source, expected]);
          cases++;
        }
        eq(cases, 115);
      });
      test('surface keeps the words: a new sentence goes on its own line where it is put, and the line breaks closing the text stay', () => {
        const at = (source, ctx = { targetId: 'stage', event: 'start' }) => { const p = Akari.makeDefaultProject(); p.scripts = [{ targetId: ctx.targetId, event: ctx.event, source }]; return Akari.createEditorSession('script:' + ctx.targetId + ':' + ctx.event, source, ctx, p, 4); },
          got = {}, sp = { targetId: 'sprite-1', event: 'start' },
          run = (label, source, op, ctx) => { const s = at(source, ctx); got[label] = Akari.prepareBlockEdit(s, op(s)).source; },
          ins = (parent, index, body = 'body') => (s) => ({ type: 'insert', parentId: parent(s), body, index, node: Akari.createBlock('NoOperation') }),
          root = (s) => s.blockView.id, first = (s) => s.blockView.bodies.body[0].id,
          keep = '「😀é」  と言う。   ※ そのまま  ', rest = '\n' + keep, rule = '「右」キーがおされているあいだ、右へ1秒に200歩の速さで動き続ける。',
          valueOf = (s, path) => path.reduce((n, k) => n[k], s.blockView).inputs.value.id,
          withValue = (parent, index, path, body) => (s) => ({ type: 'batch', operations: [ins(parent, index, body)(s), { type: 'field', id: valueOf(s, path), key: 'value', value: 5 }] });
        run('a', keep, ins(root, 1)); run('b', keep + '\n', ins(root, 1)); run('c', keep + '\n\n', ins(root, 1)); run('d', keep + '\r\n', ins(root, 1));
        run('e', '3回くり返す。\n  点数を 1 にする。' + rest, ins(first, 1)); run('f', '3回くり返す。\n  点数を 1 にする。\n\n' + keep, ins(first, 1));
        run('g', '3回くり返す。\n  点数を 1 にする。', ins(first, 1)); run('h', '3回くり返す。\n  点数を 1 にする。\n', ins(first, 1));
        run('j', '※ メモだけ\n', ins(root, 1)); run('k', '', ins(root, 0)); run('l', '\n\n', ins(root, 0));
        run('m', '点数を 1 にする。点数を 2 にする。', ins(root, 2)); run('n', '点数を 1 にする。点数を 2 にする。\n', ins(root, 2));
        run('o', keep + '\n点数を 1 にする。点数を 2 にする。', ins(root, 1));
        run('p', '点数を 1 にする。点数を 2 にする。' + rest, withValue(root, 1, ['bodies', 'body', 0]));
        run('q', '点数を 1 にする。点数を 2 にする。' + rest, withValue(root, 1, ['bodies', 'body', 1]));
        run('r', '点数を 1 にする。点数を 2 にする。点数を 3 にする。' + rest, withValue(root, 1, ['bodies', 'body', 2]));
        run('t', 'もし点数が1なら、\n  点数を 1 にする。点数を 2 にする。' + rest, ins(first, 1, 'thenBody'));
        run('u', 'もし点数が1なら、\n  点数を 1 にする。点数を 2 にする。\n' + keep, withValue(first, 1, ['bodies', 'body', 0, 'bodies', 'thenBody', 1], 'thenBody'));
        run('v', '点数を 1 にする。\n点数を 2 にする。' + rest, ins(root, 1)); run('w', '点数を 1 にする。\n\n点数を 2 にする。' + rest, ins(root, 1));
        run('x', '3回くり返す。\n    点数を 1 にする。' + rest, ins(first, 1)); run('y', '3回くり返す。\n    点数を 1 にする。' + rest, ins(first, 0));
        run('A', rule, ins(root, 0), sp); run('B', rule + '\n', ins(root, 0), sp); run('C', rule + '  ※ m\n\n', ins(root, 0), sp); run('D', rule + '\r\n', ins(root, 0), sp);
        run('E', '作品を動かしたとき、', ins(root, 0)); run('F', '作品を動かしたとき、\n', ins(root, 0)); run('G', '作品を動かしたとき、 ※ m\n\n', ins(root, 0));
        run('H', '作品を動かしたとき、\n  点数を 1 にする。', ins(root, 1)); run('I', '作品を動かしたとき、\n  点数を 1 にする。\n\n', ins(root, 1));
        run('J', '作品を動かしたとき、\n  点数を 1 にする。', ins(root, 0)); run('K', rule + '\n「😀é」  と言う。', ins(root, 1), sp);
        const want = {
          a: "「😀é」  と言う。   ※ そのまま  \n何もしない。",
          b: "「😀é」  と言う。   ※ そのまま  \n何もしない。\n",
          c: "「😀é」  と言う。   ※ そのまま  \n何もしない。\n\n",
          d: "「😀é」  と言う。   ※ そのまま  \r\n何もしない。\r\n",
          e: "3回くり返す。\n  点数を 1 にする。\n  何もしない。\n「😀é」  と言う。   ※ そのまま  ",
          f: "3回くり返す。\n  点数を 1 にする。\n  何もしない。\n\n「😀é」  と言う。   ※ そのまま  ",
          g: "3回くり返す。\n  点数を 1 にする。\n  何もしない。",
          h: "3回くり返す。\n  点数を 1 にする。\n  何もしない。\n",
          j: "※ メモだけ\n何もしない。\n",
          k: "何もしない。",
          l: "何もしない。\n\n\n",
          m: "点数を 1 にする。点数を 2 にする。\n何もしない。",
          n: "点数を 1 にする。点数を 2 にする。\n何もしない。\n",
          o: "「😀é」  と言う。   ※ そのまま  \n何もしない。\n点数を 1 にする。点数を 2 にする。",
          p: "点数を5にする。\n何もしない。\n点数を2にする。\n「😀é」  と言う。   ※ そのまま  ",
          q: "点数を1にする。\n何もしない。\n点数を5にする。\n「😀é」  と言う。   ※ そのまま  ",
          r: "点数を1にする。\n何もしない。\n点数を2にする。\n点数を5にする。\n「😀é」  と言う。   ※ そのまま  ",
          t: "もし点数が1なら、\n  点数を1にする。\n  何もしない。\n  点数を2にする。\n「😀é」  と言う。   ※ そのまま  ",
          u: "もし点数が1なら、\n  点数を1にする。\n  何もしない。\n  点数を5にする。\n「😀é」  と言う。   ※ そのまま  ",
          v: "点数を 1 にする。\n何もしない。\n点数を 2 にする。\n「😀é」  と言う。   ※ そのまま  ",
          w: "点数を 1 にする。\n\n何もしない。\n点数を 2 にする。\n「😀é」  と言う。   ※ そのまま  ",
          x: "3回くり返す。\n    点数を 1 にする。\n    何もしない。\n「😀é」  と言う。   ※ そのまま  ",
          y: "3回くり返す。\n    何もしない。\n    点数を 1 にする。\n「😀é」  と言う。   ※ そのまま  ",
          A: "「右」キーがおされているあいだ、右へ1秒に200歩の速さで動き続ける。\n何もしない。",
          B: "「右」キーがおされているあいだ、右へ1秒に200歩の速さで動き続ける。\n何もしない。\n",
          C: "「右」キーがおされているあいだ、右へ1秒に200歩の速さで動き続ける。  ※ m\n何もしない。\n\n",
          D: "「右」キーがおされているあいだ、右へ1秒に200歩の速さで動き続ける。\r\n何もしない。\r\n",
          E: "作品を動かしたとき、\n  何もしない。",
          F: "作品を動かしたとき、\n  何もしない。\n",
          G: "作品を動かしたとき、 ※ m\n  何もしない。\n\n",
          H: "作品を動かしたとき、\n  点数を 1 にする。\n  何もしない。",
          I: "作品を動かしたとき、\n  点数を 1 にする。\n  何もしない。\n\n",
          J: "作品を動かしたとき、\n  何もしない。\n  点数を 1 にする。",
          K: "「右」キーがおされているあいだ、右へ1秒に200歩の速さで動き続ける。\n「😀é」  と言う。\n何もしない。",        };
        for (const label of Object.keys(want)) eq([label, got[label]], [label, want[label]]);
      });
      test('surface keeps the words: a shared line written again keeps the changes made on the other lines', () => {
        const rest = '\n「😀é」  と言う。   ※ そのまま  ', put = (s, index) => ({ type: 'insert', parentId: s.blockView.id, body: 'body', index, node: Akari.createBlock('NoOperation') }),
          five = (s, i) => ({ type: 'field', id: s.blockView.bodies.body[i].inputs.value.id, key: 'value', value: 5 }),
          run = (source, op) => { const s = setup(source + rest); return Akari.prepareBlockEdit(s, op(s)).source; };
        for (const [source, op, expected] of [
          ['点数を 1 にする。「a\nb」と言う。', (s) => put(s, 1), '点数を1にする。\n何もしない。\n「a\nb」と言う。'],
          ['点数を 1 にする。\n点数を 2 にする。点数を 3 にする。', (s) => ({ type: 'batch', operations: [five(s, 0), put(s, 2)] }), '点数を 5 にする。\n点数を2にする。\n何もしない。\n点数を3にする。'],
          ['点数を 2 にする。点数を 3 にする。\n点数を 4 にする。', (s) => ({ type: 'batch', operations: [five(s, 2), put(s, 1)] }), '点数を2にする。\n何もしない。\n点数を3にする。\n点数を 5 にする。'],
          ['点数を 2 にする。点数を 3 にする。\n点数を 4 にする。', (s) => ({ type: 'batch', operations: [five(s, 0), five(s, 2), put(s, 1)] }), '点数を5にする。\n何もしない。\n点数を3にする。\n点数を 5 にする。'],
          ['点数を 2 にする。点数を 3 にする。\n点数を 4 にする。', (s) => ({ type: 'batch', operations: [five(s, 1), five(s, 2), put(s, 1)] }), '点数を2にする。\n何もしない。\n点数を5にする。\n点数を 5 にする。'],
          ['1を言う。2を言う。\n3を言う。', (s) => ({ type: 'batch', operations: [five(s, 2), put(s, 1)] }), '1を言う。\n何もしない。\n2を言う。\n5を言う。'],
          ['点数を 0 にする。\n点数を 2 にする。点数を 3 にする。', (s) => ({ type: 'batch', operations: [five(s, 0), five(s, 1), put(s, 2)] }), '点数を 5 にする。\n点数を5にする。\n何もしない。\n点数を3にする。'],
        ]) eq([source, run(source, op)], [source, expected + rest]);
      });
      test('surface keeps the words: a sentence put after a block that ends the text goes before the line breaks that close it', () => {
        const put = (source, parent, expected) => { const s = setup(source); eq([source, Akari.prepareBlockEdit(s, { type: 'insert', parentId: parent(s), body: 'body', index: 1, node: Akari.createBlock('NoOperation') }).source], [source, expected]); },
          root = (s) => s.blockView.id;
        put('3回くり返す。\n  点数を 1 にする。\n', root, '3回くり返す。\n  点数を 1 にする。\n何もしない。\n');
        put('3回くり返す。\n  点数を 1 にする。\n\n', root, '3回くり返す。\n  点数を 1 にする。\n何もしない。\n\n');
        put('3回くり返す。\n  点数を 1 にする。\r\n', root, '3回くり返す。\n  点数を 1 にする。\r\n何もしない。\r\n');
        put('もし点数が1なら、\n  点数を 1 にする。\nそうでなければ、\n  点数を 2 にする。\n\n', root, 'もし点数が1なら、\n  点数を 1 にする。\nそうでなければ、\n  点数を 2 にする。\n何もしない。\n\n');
        put('3回くり返す。\n  3回くり返す。\n    点数を 1 にする。\n', (s) => s.blockView.bodies.body[0].id, '3回くり返す。\n  3回くり返す。\n    点数を 1 にする。\n  何もしない。\n');
      });
      test('surface keeps the words: a sentence put after the last sentence of a body that shares its line starts its own line', () => {
        const rest = '\n「😀é」  と言う。   ※ そのまま  ';
        for (const [source, body, index, expected] of [
          ['3回くり返す。\n  点数を 1 にする。点数を 2 にする。', 'body', 2, '3回くり返す。\n  点数を 1 にする。点数を 2 にする。\n  何もしない。'],
          ['もし点数が1なら、\n  点数を 1 にする。点数を 2 にする。\nそうでなければ、\n  点数を 3 にする。', 'thenBody', 2, 'もし点数が1なら、\n  点数を 1 にする。点数を 2 にする。\n  何もしない。\nそうでなければ、\n  点数を 3 にする。'],
        ]) {
          const s = setup(source + rest);
          eq([source, Akari.prepareBlockEdit(s, { type: 'insert', parentId: s.blockView.bodies.body[0].id, body, index, node: Akari.createBlock('NoOperation') }).source], [source, expected + rest]);
        }
      });
      test('a block edit is refused for a place, a field or a memo line the block does not have, and done where it has them', () => {
        const told = (source, op) => { const s = setup(source); try { return Akari.prepareBlockEdit(s, op(s)).source; } catch (e) { return e.code + ' ' + e.message; } },
          say = (s) => s.blockView.bodies.body[0], head = (s) => s.blockView.id, branch = (s) => s.blockView.bodies.body[0];
        for (const [source, op, expected] of [
          ['「あ」と言う。', (s) => ({ type: 'expression', parentId: say(s).id, input: 'value', node: Akari.createBlock('WaitTime') }), 'E901 その ブロックは そこには 入れられないよ。合う ばしょを えらんでね。'],
          ['「あ」と言う。', (s) => ({ type: 'expression', parentId: say(s).id, input: 'value', node: Akari.createBlock('NumberLiteral') }), '0を言う。'],
          ['「あ」と言う。', (s) => ({ type: 'field', id: say(s).id, key: 'nokey', value: 1 }), 'E901 うまく いかなかったよ。もう一度 やって みてね。'],
          ['「あ」と言う。', (s) => ({ type: 'annotation', id: say(s).id, key: 'nokey', value: '※ m' }), 'E901 うまく いかなかったよ。もう一度 やって みてね。'],
          ['「あ」と言う。', (s) => ({ type: 'annotation', id: say(s).id, key: 'inlineComment', value: '※ m' }), '「あ」と言う。  ※ m'],
          ['1秒待つ。', (s) => ({ type: 'annotation', id: head(s), key: 'headingComment', value: '※ メモ' }), 'E901 見出しの 行が ないので、見出しの メモは 書けないよ。'],
          ['作品を動かしたとき、\n  1秒待つ。', (s) => ({ type: 'annotation', id: head(s), key: 'headingComment', value: '※ メモ' }), '作品を動かしたとき、  ※ メモ\n  1秒待つ。'],
          ['もし点数が3より大きければ、\n  1秒待つ。', (s) => ({ type: 'annotation', id: branch(s).id, key: 'elseComment', value: '※ メモ' }), 'E901 「そうでなければ」の 行が ないので、「そうでなければ」の メモは 書けないよ。'],
          ['もし点数が3より大きければ、\n  1秒待つ。\nそうでなければ、\n  2秒待つ。', (s) => ({ type: 'annotation', id: branch(s).id, key: 'elseComment', value: '※ メモ' }), 'もし点数が3より大きければ、\n  1秒待つ。\nそうでなければ、  ※ メモ\n  2秒待つ。'],
        ]) eq([source, told(source, op)], [source, expected]);
      });
      test('surface keeps the words: a sentence put into a text of one sign and no sentence starts its own line after it', () => {
        for (const [source, expected] of [[' ', ' \n何もしない。'], [' \n', ' \n何もしない。\n'], ['　', '　\n何もしない。'], ['。', '。\n何もしない。']]) {
          const s = setup(source);
          eq([source, Akari.prepareBlockEdit(s, { type: 'insert', parentId: s.blockView.id, body: 'body', index: 0, node: Akari.createBlock('NoOperation') }).source], [source, expected]);
        }
      });
      test('surface keeps the words: a sentence taken from a line of several is the only change, and the other lines stay as written', () => {
        const rest = '\n「😀é」  と言う。   ※ そのまま  ', three = '点数を 1 にする。点数を 2 にする。点数を 3 にする。',
          run = (source, op) => { const s = setup(source); return Akari.prepareBlockEdit(s, op(s)).source; },
          nth = (s, i) => s.blockView.bodies.body[i].id;
        for (const [i, kept] of [[0, '点数を2にする。\n点数を3にする。'], [1, '点数を1にする。\n点数を3にする。'], [2, '点数を1にする。\n点数を2にする。']])
          eq(['remove', i, run(three + rest, (s) => ({ type: 'remove', id: nth(s, i) }))], ['remove', i, kept + rest]);
        for (const [i, kept] of [[0, '何もしない。\n点数を2にする。\n点数を3にする。'], [1, '点数を1にする。\n何もしない。\n点数を3にする。'], [2, '点数を1にする。\n点数を2にする。\n何もしない。']])
          eq(['replace', i, run(three + rest, (s) => ({ type: 'replace', id: nth(s, i), node: Akari.createBlock('NoOperation') }))], ['replace', i, kept + rest]);
        eq(run(three + rest, (s) => ({ type: 'move', id: nth(s, 1), parentId: s.blockView.id, body: 'body', index: 0 })), '点数を2にする。\n点数を1にする。\n点数を3にする。' + rest);
        eq(run(rest.slice(1) + '\n' + three, (s) => ({ type: 'remove', id: nth(s, 3) })), rest.slice(1) + '\n点数を1にする。\n点数を2にする。');
        eq(run('3回くり返す。\n  ' + three + rest, (s) => ({ type: 'remove', id: s.blockView.bodies.body[0].bodies.body[1].id })), '3回くり返す。\n  点数を1にする。\n  点数を3にする。' + rest);
      });
      test('surface keeps the words: a header written again before its line break keeps the break', () => {
        const rest = '\n  点数に3を足す。 ※ 本文  \n「😀é」  と言う。   ※ そのまま  \n',
          three = (n) => n.schemaId === 'NumberLiteral' && n.fields.value === 3 ? n : Object.values(n.inputs || {}).flat().map(three).find(Boolean);
        for (const [head, expected] of [['もし点数が3か4なら、', 'もし点数が8と同じか、点数が4と同じなら、'], ['もし点数が3か4なら、 ※ 頭  ', 'もし点数が8と同じか、点数が4と同じなら、 ※ 頭  ']]) {
          const s = setup(head + rest);
          eq(change(s, three(s.blockView.bodies.body[0].inputs.condition).id, 8).source, expected + rest);
        }
      });
      test('surface keeps the words: the sentence of a one-line もし or repeat keeps its words, and a value changed in it is written anew', () => {
        const rest = '\n「😀é」  と言う。   ※ そのまま  ';
        const into = (s) => { const c = s.blockView.bodies.body[0]; return { type: 'insert', parentId: c.id, body: c.schemaId === 'IfStatement' ? 'thenBody' : 'body', index: 1, node: Akari.createBlock('NoOperation') }; },
          ten = (s) => [...Akari.diagnostics.buildBlockIndex(s.blockView).values()].map((e) => e.node).find((n) => n.schemaId === 'NumberLiteral' && n.fields.value === 10);
        for (const [line, kept, changed] of [
          ['もし点数が3なら、10歩進む ※ m', 'もし点数が3なら、\n  10歩進む  ※ m', 'もし点数が3なら、\n  前へ20歩進む。  ※ m'],
          ['もし点数が3なら、 10歩進む 。 ※ m', 'もし点数が3なら、\n  10歩進む 。  ※ m', 'もし点数が3なら、\n  前へ20歩進む。  ※ m'],
          ['もし点数が3なら、10歩進む。。', 'もし点数が3なら、\n  10歩進む。。', 'もし点数が3なら、\n  前へ20歩進む。'],
          ['もし点数が3なら、10歩 進む。', 'もし点数が3なら、\n  10歩 進む。', 'もし点数が3なら、\n  前へ20歩進む。'],
          ['10歩進むことを3回くり返す ※ m', '3回くり返す。\n  10歩進む。  ※ m', '3回くり返す。\n  前へ20歩進む。  ※ m'],
        ]) {
          const s = setup(line + rest);
          eq(Akari.prepareBlockEdit(s, into(s)).source, kept + '\n  何もしない。' + rest);
          eq(Akari.prepareBlockEdit(s, { type: 'batch', operations: [into(s), { type: 'field', id: ten(s).id, key: 'value', value: 20 }] }).source, changed + '\n  何もしない。' + rest);
        }
      });
      }
    }
    {
      {
        // an empty text where a name is read: what is refused, and what goes
        const EMPTY_NAME = 'からっぽの 文字は 名前に ならない ので、そこには 入れられないよ。名前を 書いた 文字を 入れてね。',
          S301_EMPTY = 'S301|キャラクターや 部品の 名前が 空です。「 」の 中に キャラクターや 部品の 名前を 書いて ください',
          actorName = makeDefaultProject().components.find((part) => part.id === 'sprite-1').name,
          codesOn = (list) => list.map((d) => d.code + '|' + d.message + '@' + d.line);
        test('empty-name check: a field typed empty where a name is read is an edit, with its S301', () => {
          const w = placeWork('もし「' + actorName + '」にふれているなら、\n  1秒待つ。'),
            text = w.nodes.find((n) => n.schemaId === 'StringLiteral'),
            edited = prepare(w.session, { type: 'field', id: text.id, key: 'value', value: '' }, { project: w.project, context: w.context });
          ok(edited.source === 'もし「」にふれているなら、\n  1秒待つ。', edited.source);
          ok(stableJson(codesOn(edited.diagnostics)) === stableJson([S301_EMPTY + '@1']), stableJson(codesOn(edited.diagnostics)));
        });
        test('empty-name check: the same S301 on another line does not let an empty partner in', () => {
          const w = placeWork('もし「' + actorName + '」にふれているなら、\n  1秒待つ。\nもし「」にふれているなら、\n  1秒待つ。'),
            partner = w.at('SensorRead:TOUCHING', 'arg');
          ok(stableJson(codesOn(w.session.diagnostics)) === stableJson([S301_EMPTY + '@3']), stableJson(codesOn(w.session.diagnostics)));
          refused(w.ask('StringLiteral', partner), EMPTY_NAME, 'a new empty text as the first partner');
          let thrown = '';
          try { prepare(w.session, { type: 'expression', ...partner, node: createBlock('StringLiteral') }, { project: w.project, context: w.context }); }
          catch (error) { thrown = error.code + ' ' + error.message; }
          ok(thrown === 'E901 ' + EMPTY_NAME, 'the edit: ' + thrown);
        });
        test('empty-name check: an empty partner beside an empty partner its line had is no new S301', () => {
          const w = placeWork('もし「」にふれているかつ「' + actorName + '」にふれているなら、\n  1秒待つ。'),
            partner = w.at('SensorRead:TOUCHING', 'arg', 1);
          ok(stableJson(codesOn(w.session.diagnostics)) === stableJson([S301_EMPTY + '@1']), stableJson(codesOn(w.session.diagnostics)));
          const asked = w.ask('StringLiteral', partner);
          ok(asked.enabled && asked.reason === '', stableJson(asked));
          const edited = prepare(w.session, { type: 'expression', ...partner, node: createBlock('StringLiteral') }, { project: w.project, context: w.context });
          ok(!edited.source.includes(actorName) && edited.source.split('「」').length === 3, edited.source);
          ok(stableJson(codesOn(edited.diagnostics)) === stableJson([S301_EMPTY + '@1']), stableJson(codesOn(edited.diagnostics)));
        });
      }
      {
        // the kept answers of an insertion check are told apart by what the work has
        const askIn = (change, targetId, source, schemaId, where) => {
          const project = makeDefaultProject(), context = { targetId, event: 'start' };
          project.projectData = { variables: [], lists: [] };
          project.scripts = [{ targetId, event: 'start', source }];
          const session = createEditorSession('script:' + targetId + ':start', source, context, project, 4),
            given = JSON.parse(JSON.stringify(project));
          change(given);
          return blockInsertionAvailability(session, schemaId, where(session), { project: given, context });
        };
        const atEnd = (session) => ({ parentId: session.blockView.id, body: 'body', index: 1 }),
          atSay = (session) => ({ parentId: [...buildBlockIndex(session.blockView).values()].find((e) => e.node.schemaId === 'Say').node.id, input: 'value' }),
          COUNT_OVER = '本文と 自分で作ったブロックの 数が、いちばん 大きい 数を こえたよ。いらない ものを けしてね。',
          LENGTH_OVER = '作品ぜんぶの 本文の 長さが、いちばん 大きい 数を こえたよ。いらない ところを けしてね。';
        test('availability answers kept by content: the stage backdrop names the new backdrop block', () => {
          const first = askIn(() => {}, 'stage', '1秒待つ。', 'LooksCommand:SET_BACKDROP', atEnd),
            renamed = askIn((p) => { p.stage.backdrops[0].name = 'うみ'; }, 'stage', '1秒待つ。', 'LooksCommand:SET_BACKDROP', atEnd);
          ok(first.enabled && first.node.inputs.args[0].fields.value === makeDefaultProject().stage.backdrops[0].name, stableJson(first));
          ok(renamed.enabled && renamed.node.inputs.args[0].fields.value === 'うみ', stableJson(renamed));
        });
        test('availability answers kept by content: an input field added to the parts', () => {
          const field = (p) => {
            const part = { ...JSON.parse(JSON.stringify(p.components[0])), id: 'input-1', type: 'input', name: '名前らん', text: '' };
            delete part.costumes; delete part.costumeId;
            p.components.push(part);
          };
          refused(askIn(() => {}, 'sprite-1', '「やあ」と言う。', 'SensorRead:INPUT_VALUE', atSay), '入力らんを 先に 作ります', 'no input field');
          const made = askIn(field, 'sprite-1', '「やあ」と言う。', 'SensorRead:INPUT_VALUE', atSay);
          ok(made.enabled && made.node.inputs.arg.fields.value === '名前らん', stableJson(made));
        });
        test('availability answers kept by content: the number of the other bodies', () => {
          const others = (n) => (p) => { p.scripts = Array.from({ length: n }, (_, i) => ({ id: 'kept-count-' + i, targetId: 'stage', event: 'start', source: '' })); };
          ok(askIn(others(LIMITS.scripts - 1), 'sprite-1', '1秒待つ。', 'PenCommand:CLEAR', atEnd).enabled, 'one body less than the most');
          refused(askIn(others(LIMITS.scripts), 'sprite-1', '1秒待つ。', 'PenCommand:CLEAR', atEnd), COUNT_OVER, 'as many bodies as the most');
        });
        test('availability answers kept by content: the length of the other bodies', () => {
          const others = (n) => (p) => {
            p.scripts = Array.from({ length: LIMITS.sourceTotal / LIMITS.sourceEach }, (_, i) => ({ id: 'kept-length-' + i, targetId: 'stage', event: 'start', source: '※' + 'あ'.repeat(n) }));
          };
          ok(askIn(others(1), 'sprite-1', '1秒待つ。', 'PenCommand:CLEAR', atEnd).enabled, 'short bodies');
          refused(askIn(others(LIMITS.sourceEach - 1), 'sprite-1', '1秒待つ。', 'PenCommand:CLEAR', atEnd), LENGTH_OVER, 'bodies as long as the most in all');
        });
      }
      {
        // the names read after a part's name come from the work the check is given
        const partName = makeDefaultProject().components.find((part) => part.id === 'sprite-1').name;
        test('read after a part name: the own names of the part in the work given to the check', () => {
          const w = placeWork('「' + partName + '」の大きさを言う。'), place = w.at('ActorQualifiedRead', 'value'),
            given = JSON.parse(JSON.stringify(w.project));
          given.components.find((part) => part.id === 'sprite-1').localData = { variables: [{ id: 'v-stamina', name: 'たいりょく', initialValue: 3 }], lists: [] };
          const read = w.ask('VariableRead', place, { project: given });
          ok(read.enabled && read.reason === '' && read.node.fields.name === 'たいりょく' && read.node.fields.qualifier === null, stableJson(read));
        });
        test('read in a value of a sentence: the names readable at that sentence, the loop name in its loop', () => {
          for (const source of ['持ち物の中身を先頭から一つずつ見て、次のことを行う\n  この中では、今見ているものを【項目】と呼ぶ\n  「やあ」と言う。',
            'もし1が1と同じなら、\n  持ち物の中身を先頭から一つずつ見て、次のことを行う\n    この中では、今見ているものを【項目】と呼ぶ\n    「やあ」と言う。']) {
            const w = placeWork(source, (p) => { p.projectData = { variables: [], lists: [{ id: 'l-items', name: '持ち物', initialValue: ['本'] }] }; });
            ok(w.session.diagnostics.length === 0, stableJson(w.session.diagnostics));
            const read = w.ask('VariableRead', w.at('Say', 'value'));
            ok(read.enabled && read.reason === '' && read.node.fields.name === '項目' && read.node.fields.qualifier === null, source + ': ' + stableJson(read));
          }
        });
        test('read with only a list in the work: the list is the name put in', () => {
          const w = placeWork('ふくろの長さを言う。', (p) => { p.projectData = { variables: [], lists: [{ id: 'l-only', name: 'ふくろ', initialValue: [] }] }; });
          ok(w.session.diagnostics.length === 0, stableJson(w.session.diagnostics));
          const counted = w.ask('VariableRead', { ...w.at('BuiltinCall:LENGTH', 'args'), index: 0 });
          ok(counted.enabled && counted.reason === '' && counted.node.fields.name === 'ふくろ' && counted.node.fields.qualifier === null, stableJson(counted));
          const said = w.ask('VariableRead', w.at('Say', 'value'));
          refused(said, 'リストは そのまま 言えません。中身を 言う ときは「ふくろの1番目を言う」のように 書きます', 'a list said as it is');
          ok(said.node.fields.name === 'ふくろ', stableJson(said.node.fields));
        });
        test('read in a place of no sentence: the names of the top of the body', () => {
          const project = makeDefaultProject(), src = 'この中だけで使う変数【かず】を作り、最初は0にする。\n1秒待つ。',
            definition = { ownerId: 'stage', id: 'a-local', name: 'とぶ', args: [], source: src };
          project.projectData = { variables: [], lists: [] };
          project.actions = [definition];
          const context = { definition, definitionKind: 'action', args: [] }, session = createEditorSession('action:a-local', src, context, project, 4);
          ok(session.diagnostics.length === 0, stableJson(session.diagnostics));
          const top = blockInsertionAvailability(session, 'VariableRead', { parentId: session.blockView.id, input: 'rules', index: 0 }, { project, context });
          refused(top, 'へんすうか リストを 先に 作ります', 'no name before the first sentence');
          ok(top.node.fields.name === '', stableJson(top.node.fields));
          const wait = [...buildBlockIndex(session.blockView).values()].find((e) => e.node.schemaId === 'WaitTime').node,
            after = blockInsertionAvailability(session, 'VariableRead', { parentId: wait.id, input: 'seconds' }, { project, context });
          ok(after.enabled && after.node.fields.name === 'かず', stableJson(after));
        });
      }
      {
        // a value carried into a draft is judged as in the body without the draft
        const LIST_SAID = 'リストは そのまま 言えません。中身を 言う ときは「持ち物の1番目を言う」のように 書きます',
          draftWork = (source = '3を言う。\n持ち物の1番目を言う。\n点数を5にする。') => {
            const w = placeWork(source), opts = { project: w.project, context: w.context }, root = w.session.blockView.id,
              number = (value) => w.nodes.find((n) => n.schemaId === 'NumberLiteral' && n.fields.value === value),
              list = w.nodes.find((n) => n.schemaId === 'VariableRead' && n.fields.name === '持ち物'),
              step = (session, op) => {
                const next = prepare(session, op, opts);
                return next.draftOnly ? { ...session, ...next, sourceText: w.session.sourceText } : { ...session, ...next };
              },
              hole = (value) => step(w.session, { type: 'expression', ...w.place(number(value)), node: createBlock('Hole:expression', { allowHoles: true }) }),
              carry = (session, location, node = list) => blockInsertionAvailability(session, node.schemaId, location, { ...opts, candidateNode: node, sourceId: node.id });
            ok(w.session.diagnostics.length === 0, stableJson(w.session.diagnostics));
            return { w, root, number, list, step, hole, carry };
          };
        test('draft place: a list carried into a hole of a sentence the body had', () => {
          const d = draftWork(), drafted = d.hole(3);
          ok(drafted.draftOnly, 'a hole makes a draft');
          refused(d.carry(d.w.session, d.w.place(d.number(3))), LIST_SAID, 'without a draft');
          refused(d.carry(drafted, d.w.place(d.number(3))), LIST_SAID, 'in the draft');
          const five = d.number(5), moved = d.carry(drafted, d.w.place(d.number(3)), five);
          ok(moved.enabled && moved.reason === '', stableJson(moved));
        });
        test('draft place: a list carried into a value of a sentence added in the draft', () => {
          const d = draftWork(), drafted = d.hole(5), say = d.w.ask('Say', { parentId: d.root, body: 'body', index: 3 }).node,
            joined = (session) => {
              const at = session.blockView.bodies.body[3], join = d.w.ask('BuiltinCall:つなぐ', { parentId: at.id, input: 'value' }).node,
                next = d.step(session, { type: 'expression', parentId: at.id, input: 'value', node: join });
              return { session: next, join: next.blockView.bodies.body[3].inputs.value };
            },
            plain = joined(d.step(d.w.session, { type: 'insert', parentId: d.root, body: 'body', index: 3, node: say })),
            draft = joined(d.step(drafted, { type: 'insert', parentId: d.root, body: 'body', index: 3, node: say }));
          ok(draft.session.draftOnly && draft.join.schemaId === 'BuiltinCall:つなぐ', 'the join is in the draft');
          refused(d.carry(plain.session, { parentId: plain.join.id, input: 'args', index: 0 }), LIST_SAID, 'without a draft');
          refused(d.carry(draft.session, { parentId: draft.join.id, input: 'args', index: 0 }), LIST_SAID, 'in the draft');
        });
        test('draft place: a list carried into a sentence added inside a new sentence with a hole', () => {
          const d = draftWork(), drafted = d.hole(5), end = { parentId: d.root, body: 'body', index: 3 },
            withIf = d.step(drafted, { type: 'insert', ...end, node: d.w.ask('IfStatement', end).node }),
            branch = withIf.blockView.bodies.body[3];
          ok(branch.schemaId === 'IfStatement' && withIf.draftOnly, 'the new もし is in the draft');
          const withSay = d.step(withIf, { type: 'insert', parentId: branch.id, body: 'thenBody', index: 0, node: d.w.ask('Say', end).node }),
            inner = withSay.blockView.bodies.body[3].bodies.thenBody.find((n) => n.schemaId === 'Say');
          refused(d.carry(withSay, { parentId: inner.id, input: 'value' }), LIST_SAID, 'the list into the inner say');
          const number = d.carry(withSay, { parentId: inner.id, input: 'value' }, d.number(3));
          ok(number.enabled && number.draftOnly === true, stableJson(number));
        });
        test('draft place: a list in a new value of a sentence the body had, and a say of a list put in the draft body', () => {
          const d = draftWork(), drafted = d.hole(5), three = d.number(3), end = { parentId: d.root, body: 'body', index: 3 },
            inJoin = (session) => {
              const next = d.step(session, { type: 'expression', ...d.w.place(three), node: d.w.ask('BuiltinCall:つなぐ', d.w.place(three)).node });
              return d.carry(next, { parentId: next.blockView.bodies.body[0].inputs.value.id, input: 'args', index: 0 });
            },
            said = JSON.parse(JSON.stringify(d.w.ask('Say', end).node));
          said.inputs.value = JSON.parse(JSON.stringify(d.list));
          for (const [name, session] of [['without a draft', d.w.session], ['in the draft', drafted]]) {
            refused(inJoin(session), LIST_SAID, name + ': the list into a join put in 3を言う');
            refused(blockInsertionAvailability(session, 'Say', end, { project: d.w.project, context: d.w.context, candidateNode: said }), LIST_SAID, name + ': a say of the list at the end');
          }
        });
        test('draft place: a value in a hole of a new sentence with a hole, and a sentence added in a branch the body had', () => {
          const d = draftWork('3を言う。\n持ち物の1番目を言う。\n点数を5にする。\nもし点数が1と同じなら、\n  1秒待つ。'), drafted = d.hole(5),
            end = { parentId: d.root, body: 'body', index: 4 }, same = d.w.nodes.find((n) => n.schemaId === 'CompareExpression:EQ'),
            withIf = d.step(drafted, { type: 'insert', ...end, node: d.w.ask('IfStatement', end).node }), fresh = withIf.blockView.bodies.body[4];
          ok(same && fresh.schemaId === 'IfStatement' && withIf.draftOnly, 'a new もし in the draft');
          const condition = d.carry(withIf, { parentId: fresh.id, input: 'condition' }, same);
          ok(condition.enabled && condition.draftOnly === true && condition.reason === '', stableJson(condition));
          const branch = d.w.nodes.find((n) => n.schemaId === 'IfStatement'), say = d.w.ask('Say', end).node,
            inThen = (session) => {
              const next = d.step(session, { type: 'insert', parentId: branch.id, body: 'thenBody', index: 1, node: say });
              return { session: next, say: buildBlockIndex(next.blockView).get(branch.id).node.bodies.thenBody[1] };
            },
            plain = inThen(d.w.session), draft = inThen(drafted);
          ok(draft.session.draftOnly && draft.say.schemaId === 'Say', 'the say is in the branch in the draft');
          refused(d.carry(plain.session, { parentId: plain.say.id, input: 'value' }), LIST_SAID, 'without a draft');
          refused(d.carry(draft.session, { parentId: draft.say.id, input: 'value' }), LIST_SAID, 'in the draft');
        });
        test('draft place: the end of a body after a sentence the draft added there', () => {
          const d = draftWork(), drafted = d.hole(5), end = { parentId: d.root, body: 'body', index: 3 },
            withIf = d.step(drafted, { type: 'insert', ...end, node: d.w.ask('IfStatement', end).node }),
            last = { parentId: d.root, body: 'body', index: withIf.blockView.bodies.body.length },
            said = JSON.parse(JSON.stringify(d.w.ask('Say', end).node)), opts = { project: d.w.project, context: d.w.context };
          ok(withIf.draftOnly && last.index === 4, 'a new もし at the end of the draft');
          const plainSay = blockInsertionAvailability(withIf, 'Say', last, opts);
          ok(plainSay.enabled && plainSay.reason === '', stableJson(plainSay));
          said.inputs.value = JSON.parse(JSON.stringify(d.list));
          refused(blockInsertionAvailability(withIf, 'Say', last, { ...opts, candidateNode: said }), LIST_SAID, 'a say of the list at the end');
        });
      }
      {
        // a count condition put in a draft: inside the condition of 〜まで, and not elsewhere
        const COUNT_OUTSIDE = '回数の 条件（〜回おされる、〜回【手順】する）は「〜まで待つ」と「〜まで、くり返す」の 中で 使います';
        test('draft count condition: put in the condition of まで, refused in the condition of もし', () => {
          for (const [source, kind, start] of [
            ['点数が3と同じになるまで、くり返す。\n  1秒待つ。\n点数を5にする。\nもし点数が1と同じなら、\n  1秒待つ。', 'RepeatUntil', '自分が3回おされるまで、くり返す。\n  1秒待つ。\n点数を〔中身を入れる〕にする。\n'],
            ['点数が3と同じになるまで待つ。\n点数を5にする。\nもし点数が1と同じなら、\n  1秒待つ。', 'WaitUntil', '自分が3回おされるまで待つ。\n点数を〔中身を入れる〕にする。\n'],
          ]) {
            const w = placeWork(source), opts = { project: w.project, context: w.context },
              five = w.nodes.find((n) => n.schemaId === 'NumberLiteral' && n.fields.value === 5),
              hole = prepare(w.session, { type: 'expression', ...w.place(five), node: createBlock('Hole:expression', { allowHoles: true }) }, opts),
              drafted = { ...w.session, ...hole, sourceText: w.session.sourceText },
              until = w.nodes.find((n) => n.schemaId === kind), branch = w.nodes.find((n) => n.schemaId === 'IfStatement');
            ok(w.session.diagnostics.length === 0 && hole.draftOnly, kind + ': a draft');
            const counted = prepare(drafted, { type: 'expression', parentId: until.id, input: 'condition', node: createBlock('EventCount:click') }, opts);
            ok(counted.draftOnly && counted.source.startsWith(start), kind + ': ' + counted.source);
            let thrown = '';
            try { prepare(drafted, { type: 'expression', parentId: branch.id, input: 'condition', node: createBlock('EventCount:click') }, opts); }
            catch (error) { thrown = error.code + ' ' + error.message; }
            ok(thrown === 'E901 ' + COUNT_OUTSIDE, kind + ' もし: ' + thrown);
            const kept = prepare({ ...drafted, ...counted, sourceText: w.session.sourceText }, { type: 'expression', parentId: branch.id, input: 'condition', node: createBlock('Hole:expression', { allowHoles: true }) }, opts);
            ok(kept.draftOnly && kept.source.startsWith(start), kind + ' kept: ' + kept.source);
          }
        });
        test('a condition holding a count, carried to a number inside まで, is told that the place does not fit it', () => {
          const w = placeWork('点数が3以上か、自分が3回おされるまで待つ。\n点数が1と同じになるまで待つ。'),
            either = w.nodes.find((n) => n.schemaId === 'LogicalExpression:OR'), count = w.nodes.find((n) => n.schemaId === 'EventCount:click'),
            number = w.at('CompareExpression:EQ', 'left');
          ok(w.session.diagnostics.length === 0, stableJson(w.session.diagnostics));
          refused(w.carry(either, number), 'その ブロックは そこには 入れられないよ。合う ばしょを えらんでね。', 'the whole condition');
          refused(w.carry(count, number), '回数の 条件（〜回おされる、〜回【手順】する）は、ここには 入れられません。「〜まで待つ」「〜まで、くり返す」の 条件の いちばん 後ろに 入れます', 'the count');
        });
        test('a condition holding a count, carried to a number outside まで, is told where a count is used', () => {
          const w = placeWork('点数が3以上か、自分が3回おされるまで待つ。\n1秒待つ。'),
            either = w.nodes.find((n) => n.schemaId === 'LogicalExpression:OR');
          ok(w.session.diagnostics.length === 0, stableJson(w.session.diagnostics));
          refused(w.carry(either, w.at('QuantityLiteral', 'value')), '回数の 条件（〜回おされる、〜回【手順】する）は「〜まで待つ」と「〜まで、くり返す」の 中で 使います', 'the whole condition');
        });
      }
      {
        // a new sentence is refused for its own mistake, also where a sentence below it has the same one
        test('a new local declaration below a sentence of a procedure is refused, beside one that stood there', () => {
          const project = makeDefaultProject(), src = '1秒待つ。\nこの中だけで使う変数【かず】を作り、最初は0にする。',
            definition = { ownerId: 'stage', id: 'a-late-local', name: 'とぶ', args: [], source: src };
          project.actions = [definition];
          const context = { definition, definitionKind: 'action', args: [] }, session = createEditorSession('action:a-late-local', src, context, project, 4),
            LATE = 'この中だけの へんすう・リストは、自分で作ったブロックの いちばん上でだけ 作れます',
            at = (index) => blockInsertionAvailability(session, 'LocalVariableDeclaration', { parentId: session.blockView.id, body: 'body', index }, { project, context });
          ok(stableJson(session.diagnostics.map((d) => d.code + '@' + d.line)) === stableJson(['S313@2']), stableJson(session.diagnostics));
          ok(at(0).enabled, 'at the top');
          refused(at(1), LATE, 'below the wait, where the stood one was');
        });
        test('a sentence moved in its body keeps the mistake its line had, a copy of it is refused for it', () => {
          const w = placeWork('持ち物を言う。\n1秒待つ。'), end = { parentId: w.session.blockView.id, body: 'body', index: 2 },
            say = w.nodes.find((n) => n.schemaId === 'Say'),
            LIST = 'リストは そのまま 言えません。中身を 言う ときは「持ち物の1番目を言う」のように 書きます';
          ok(stableJson(w.session.diagnostics.map((d) => d.code + '@' + d.line + ' ' + d.message)) === stableJson(['S304@1 ' + LIST]), stableJson(w.session.diagnostics));
          const moved = w.ask('Say', end, { candidateNode: say, sourceId: say.id });
          ok(moved.enabled && moved.reason === '', stableJson(moved));
          refused(w.ask('Say', end, { candidateNode: say }), LIST, 'the same sentence not carried');
        });
        test('a block of several lines moved in its body keeps the mistake of its inner line', () => {
          const w = placeWork('もし点数が1と同じなら、\n  持ち物を言う。\n1秒待つ。'), end = { parentId: w.session.blockView.id, body: 'body', index: 2 },
            branch = w.nodes.find((n) => n.schemaId === 'IfStatement'),
            LIST = 'リストは そのまま 言えません。中身を 言う ときは「持ち物の1番目を言う」のように 書きます';
          ok(stableJson(w.session.diagnostics.map((d) => d.code + '@' + d.line)) === stableJson(['S304@2']), stableJson(w.session.diagnostics));
          const moved = w.ask('IfStatement', end, { candidateNode: branch, sourceId: branch.id });
          ok(moved.enabled && moved.reason === '', stableJson(moved));
          refused(w.ask('IfStatement', end, { candidateNode: branch }), LIST, 'the same block not carried');
        });
        test('a return moved into a もし of an answer block is refused, beside a return there that stood', () => {
          const project = makeDefaultProject(), src = 'もし1が1と同じなら、\n  0を返す。\n1を返す。',
            definition = { ownerId: 'stage', id: 'f-moved-return', name: 'けいさん', args: [], source: src };
          project.projectData = { variables: [], lists: [] };
          project.functions = [definition];
          const context = { definition, definitionKind: 'function', args: [] }, session = createEditorSession('function:f-moved-return', src, context, project, 4),
            INSIDE = '「答えを もとめる」の「返す」は、「もし」や「くり返す」の 中には 書けません。いちばん 下の 行に 書きます',
            branch = session.blockView.bodies.body[0], last = session.blockView.bodies.body[1];
          ok(stableJson(session.diagnostics.map((d) => d.code + '@' + d.line + ' ' + d.message)) === stableJson(['S306@2 ' + INSIDE]), stableJson(session.diagnostics));
          ok(branch.schemaId === 'IfStatement' && last.schemaId === 'ReturnStatement', 'the blocks');
          refused(blockInsertionAvailability(session, 'ReturnStatement', { parentId: branch.id, body: 'thenBody', index: 1 }, { project, context, candidateNode: last, sourceId: last.id }), INSIDE, 'the last return into the もし');
        });
        test('a check that cannot be made answers with its own error as E901, not with a reason of the place', () => {
          const w = placeWork('「やあ」と言う。'), say = w.at('Say', 'value'), broken = { ...w.project, functions: undefined };
          for (const id of ['NumberLiteral', 'EventCount:click']) {
            const answer = blockInsertionAvailability(w.session, id, say, { project: broken, context: w.context });
            ok(!answer.enabled && answer.diagnostics.length === 1 && answer.diagnostics[0].code === 'E901' && answer.diagnostics[0].message === answer.reason, id + ': ' + stableJson(answer.diagnostics));
            ok(!answer.reason.startsWith('回数の 条件') && answer.reason !== 'その ブロックは そこには 入れられないよ。合う ばしょを えらんでね。', id + ': ' + answer.reason);
          }
        });
        test('a sentence carried into the last hole of a draft is judged by the text it makes', () => {
          const w = placeWork('持ち物を言う。\nもし点数が1と同じなら、\n  1秒待つ。'), opts = { project: w.project, context: w.context },
            end = { parentId: w.session.blockView.id, body: 'body', index: 2 },
            same = w.nodes.find((n) => n.schemaId === 'CompareExpression:EQ'), say = w.nodes.find((n) => n.schemaId === 'Say'),
            branch = JSON.parse(JSON.stringify(w.ask('IfStatement', end).node));
          branch.inputs.condition = JSON.parse(JSON.stringify(same));
          const added = prepare(w.session, { type: 'insert', ...end, node: branch }, opts),
            drafted = { ...w.session, ...added, sourceText: w.session.sourceText }, made = drafted.blockView.bodies.body[2];
          ok(added.draftOnly && stableJson(made.bodies.thenBody.map((n) => n.schemaId)) === stableJson(['Hole:statement']), 'one hole left');
          refused(blockInsertionAvailability(drafted, 'Say', { parentId: made.id, body: 'thenBody', index: 0 }, { ...opts, candidateNode: say, sourceId: say.id }),
            'リストは そのまま 言えません。中身を 言う ときは「持ち物の1番目を言う」のように 書きます', 'the carried say of a list');
        });
      }
      {
        // an answer does not depend on what was asked before: with no draft, and in a draft of the same text
        test('availability with and without a draft of the same text, asked in either order', () => {
          const work = () => {
            const project = makeDefaultProject(), context = { targetId: 'sprite-1', event: 'start' }, src = '3を言う。\n点数を6にする。';
            project.projectData = { variables: [{ id: 'v-score', name: '点数', initialValue: 0 }], lists: [] };
            project.scripts = [{ targetId: 'sprite-1', event: 'start', source: src }];
            const session = createEditorSession('script:sprite-1:start', src, context, project, 4),
              six = [...buildBlockIndex(session.blockView).values()].find((e) => e.node.schemaId === 'NumberLiteral' && e.node.fields.value === 6),
              hole = prepare(session, { type: 'expression', parentId: six.parentId, input: six.input, node: createBlock('Hole:expression', { allowHoles: true }) }, { project, context });
            return { project, context, session, drafted: { ...session, ...hole, sourceText: session.sourceText } };
          };
          const ask = (w, session) => {
            const answer = blockInsertionAvailability(session, 'Say', { parentId: session.blockView.id, body: 'body', index: 2 }, { project: w.project, context: w.context });
            return [answer.enabled, answer.draftOnly === true];
          };
          const first = work(), second = work(),
            plainFirst = [ask(first, first.session), ask(first, first.drafted)], draftFirst = [ask(second, second.drafted), ask(second, second.session)];
          ok(stableJson(plainFirst) === stableJson([[true, false], [true, true]]), 'no draft first: ' + stableJson(plainFirst));
          ok(stableJson(draftFirst) === stableJson([[true, true], [true, false]]), 'draft first: ' + stableJson(draftFirst));
        });
      }
    }
    {
      // An edit that takes sentences from a line of several and goes on over other lines writes again only the lines of
      // several it touches; every other line, also one moved, keeps its words as written.
      const eq = (a, b) => ok(JSON.stringify(a) === JSON.stringify(b), `expected ${JSON.stringify(b)}; got ${JSON.stringify(a)}`),
        rest = '\n「😀é」  と言う。   ※ そのまま  ', three = '点数を 1 にする。点数を 2 にする。点数を 3 にする。',
        two = '点数を 1 にする。点数を 2 にする。\n点数を  3 にする。　',
        run = (source, op) => { const s = setup(source); return prepare(s, op(s)).source; },
        nth = (s, i) => s.blockView.bodies.body[i].id,
        move = (i, index) => (s) => ({ type: 'move', id: nth(s, i), parentId: s.blockView.id, body: 'body', index }),
        removeBoth = (i, j) => (s) => ({ type: 'batch', operations: [{ type: 'remove', id: nth(s, i) }, { type: 'remove', id: nth(s, j) }] });
      test('surface keeps the words: the 2nd sentence of a line of several moved to the end of the body leaves the other lines as written', () => {
        eq(run(three + rest, move(1, 4)), '点数を1にする。\n点数を3にする。' + rest + '\n点数を2にする。');
        eq(run(two + rest, move(0, 3)), '点数を2にする。\n点数を  3 にする。　\n点数を1にする。' + rest);
      });
      test('surface keeps the words: the 3rd sentence moved before the 2nd of a line of several keeps its own line as written', () => {
        eq(run(two + rest, move(2, 1)), '点数を1にする。\n点数を  3 にする。　\n点数を2にする。' + rest);
      });
      test('surface keeps the words: a batch removing the 2nd and the 3rd sentence over two lines leaves the other lines as written', () => {
        eq(run(two + rest, removeBoth(1, 2)), '点数を1にする。' + rest);
      });
      // A block that is put only at the top of a procedure (a local declaration) is asked in a draft with a hole as in the work
      // without the draft: below a sentence the work had it is refused, and the sentences the draft added are not counted.
      test('in a draft with a hole, a local declaration is refused below a sentence the work had and not counted by the sentences the draft added', () => {
        const project = makeDefaultProject(), src = '1秒待つ。\n3回くり返す。\n  「あ」と言う。',
          definition = { ownerId: 'stage', id: 'a-late-local', name: 'とぶ', args: [], source: src };
        project.actions = [definition];
        const context = { definition, definitionKind: 'action', args: [] }, session = createEditorSession('action:a-late-local', src, context, project, 4),
          opts = { project, context }, root = session.blockView.id, LATE = 'この中だけの へんすう・リストは、自分で作ったブロックの いちばん上でだけ 作れます',
          nodes = [...buildBlockIndex(session.blockView).values()], three = nodes.find((e) => e.node.schemaId === 'NumberLiteral' && e.node.fields.value === 3),
          step = (s, op) => ({ ...s, ...prepare(s, op, opts), sourceText: session.sourceText }),
          drafted = step(session, { type: 'expression', parentId: three.parentId, input: three.input, node: createBlock('Hole:expression', { allowHoles: true }) }),
          added = step(drafted, { type: 'insert', parentId: root, body: 'body', index: 2, node: blockInsertionAvailability(session, 'Say', { parentId: root, body: 'body', index: 2 }, opts).node }),
          at = (s, index) => { const r = blockInsertionAvailability({ ...s }, 'LocalVariableDeclaration', { parentId: root, body: 'body', index }, opts); return r.enabled ? 'goes' : r.reason; };
        ok(drafted.draftOnly && added.draftOnly, 'a draft with a hole');
        for (const [s, what] of [[session, 'without a draft'], [drafted, 'in the draft'], [added, 'in the draft that added a sentence']]) {
          ok(at(s, 0) === 'goes', what + ' at the top: ' + at(s, 0));
          ok(at(s, 1) === LATE, what + ' below the wait: ' + at(s, 1));
          ok(at(s, 2) === LATE, what + ' below the repeat: ' + at(s, 2));
        }
        // (the sentence the draft added after the two the work had does not move the place up to the top)
        ok(at(added, 3) === LATE, 'below the added sentence: ' + at(added, 3));
      });
      // A near sentence that puts in the name written (the variable, the sound) comes before one that does not.
      test('near sentences put in the name that was written come first', () => {
        const project = makeDefaultProject(), context = { targetId: 'sprite-1', event: 'start' };
        project.projectData = { variables: [{ id: 'v1', name: '点数', initialValue: 0 }], lists: [] };
        project.sounds = [{ id: 's1', name: 'ぽん' }, { id: 's2', name: 'ぴこ' }];
        const first = (text) => Akari.assistCandidates(project, text + '。\n', context, null).map((c) => c.text);
        eq(first('点数に見せる'), ['点数を言う。', 'すがたを見せる。']);
        eq(first('ぴこに鳴らす')[0], '「ぴこ」を鳴らす。');
      });
      // A heading written as an event with a sentence on its line is offered as the heading that waits for the click.
      test('a click written as クリックされたとき with a sentence after it is offered the heading and the sentence on the next line', () => {
        const project = makeDefaultProject();
        project.projectData = { variables: [{ id: 'v1', name: '点数', initialValue: 0 }], lists: [] };
        const found = Akari.assistCandidates(project, 'クリックされたとき止まる。\n', { targetId: 'sprite-1', event: 'start' }, null).map((c) => c.text);
        eq(found, ['おされたとき、\n  この動きを止める。', 'おされたとき、\n  ほかの動きを全部止める。', 'おされたとき、\n  自分のほかの動きを止める。']);
      });
      test('surface keeps the words: lines around such an edit stay byte for byte, while the line of several it touches is written anew', () => {
        const crlf = (text) => text.replace(/\n/g, '\r\n');
        eq(run(crlf('点数を  0 にする。　\n' + two + rest), removeBoth(2, 3)), crlf('点数を  0 にする。　\n点数を1にする。' + rest));
        eq(run('3回くり返す。\n  ' + two.replace('\n', '\n  ') + rest, (s) => ({ type: 'move', id: s.blockView.bodies.body[0].bodies.body[2].id, parentId: s.blockView.bodies.body[0].id, body: 'body', index: 1 })),
          '3回くり返す。\n  点数を1にする。\n  点数を  3 にする。　\n  点数を2にする。' + rest);
      });
    }
    {
      // A work with the parts ねこ, 犬 and 星, the variables given, the list 持ち物, and 体力 a variable of ねこ only.
      const world = (variables) => {
        const project = makeDefaultProject(), template = JSON.stringify(project.components[0]);
        project.components = ['ねこ', '犬', '星'].map((name, i) => ({ ...JSON.parse(template), id: 'sprite-' + (i + 1), name, localData: { variables: [], lists: [] } }));
        project.projectData = { variables: variables.map((name, i) => ({ id: 'v' + i, name, initialValue: 0 })), lists: [{ id: 'l0', name: '持ち物', initialValue: [] }] };
        project.components[0].localData.variables.push({ id: 'lv0', name: '体力', initialValue: 0 });
        return project;
      };
      // The contexts a near sentence is checked in: the editor's (with the arguments of the body) and one given without them.
      const contexts = (project, targetId) => [{ symbols: buildSymbols(project), targetId, targetType: 'sprite', event: 'start', args: [], level: 'advanced' }, { symbols: buildSymbols(project), targetId, event: 'start' }];
      const tree = (text, ctx) => parseSyntax(text, ctx).ast || parseSyntax(text + '\n  何もしない。', ctx).ast;
      // A near sentence with a heading keeps the condition written where the heading waits for what was written (the part
      // touched) or where what was written reads as no condition of the work's own: the event itself (スタートしたとき), or
      // a condition on names the work does not have as variables (ねこがタップされた, 合図が来た, 体力 in 犬's body).
      // A sentence without a heading keeps it where its tree holds a condition, or where it is written with a condition word.
      test('a near sentence keeps a condition written in its tree, its words or a heading that waits for it, and not with a heading that does not', () => {
        const project = world(['点数']), headings = ['作品を動かしたとき、', 'おされたとき、', '合図を受けたとき、', '「星」にふれたとき、'];
        // (what was written; whether it reads as a condition and the names it reads as variables; the bodies it is checked
        // in; and the near sentences: the part or key its heading waits for (none: no heading), whether its tree holds a
        // condition, whether it is written with a condition word)
        const rows = [['点数が10のとき、', true, ['点数'], ['sprite-1'], headings.map((h) => [h, h === '「星」にふれたとき、' ? '星' : '', false, true])],
          ['持ち物の長さが3のとき、', true, ['持ち物'], ['sprite-1'], headings.map((h) => [h, h === '「星」にふれたとき、' ? '星' : '', false, true])],
          ['体力が10のとき、', true, ['体力'], ['sprite-1', 'sprite-2'], headings.map((h) => [h, h === '「星」にふれたとき、' ? '星' : '', false, true])],
          ['ねこがタップされたとき、', true, ['ねこ'], ['sprite-1'], [['おされたとき、', '', false, true]]],
          ['合図が来たとき、', true, ['合図'], ['sprite-1'], [['合図を受けたとき、', '', false, true]]],
          ['スタートしたとき、', false, [], ['sprite-1'], [['作品を動かしたとき、', '', false, true]]],
          ['「星」にふれたら、止まる', true, [], ['sprite-1'], [['「星」にふれたとき、\n  この動きを止める。', '星', false, true]]],
          ['「スペース」がおされたら、', true, [], ['sprite-1'], [['「スペース」キーをおすたびに、', 'スペース', false, false]]],
          ['もし「スペース」キーがおされたとき、', true, [], ['sprite-1'], [['「スペース」キーをおすたびに、', 'スペース', false, false]]],
          ['もし点数が10以上かつ、点数が20以下なら、', true, ['点数'], ['sprite-1'], [['点数が20以下のあいだ、くり返す。\n  点数を1ふやす。', null, true, false]]],
          ['スタートしたら点数が1ふやす', true, ['点数'], ['sprite-1'], [['スタートしたら点数を1ふやす。', null, false, true]]],
          ['点数が10になったら消える', true, ['点数'], ['sprite-1'], [['すがたをかくす。', null, false, false]]]];
        for (const [written, reads, names, targets, near] of rows) for (const targetId of targets) for (const ctx of contexts(project, targetId)) {
          const condition = reads && names.every((name) => name === '点数' || name === '持ち物' || (name === '体力' && targetId === 'sprite-1'));
          for (const [text, waitsFor, held, worded] of near) {
            const ast = tree(text, ctx), expected = held || (waitsFor === null ? worded : written.includes(waitsFor || '\0') || !condition);
            ok(ast, 'the near sentence reads: ' + text);
            ok(assistKeepsCondition(ast, written, worded, project, ctx) === expected, JSON.stringify([targetId, 'args' in ctx, text, written, expected]));
          }
        }
      });
      // A near sentence keeps every variable written acted on (点数を): 点数を is 点数's and not 点's, whatever the order the
      // work lists them; and a sentence written with a condition word keeps the condition by writing it too.
      test('a near sentence keeps the variable written acted on, read as the longest name, and the condition word written', () => {
        for (const variables of [['点数', '点'], ['点', '点数']]) {
          const project = world(variables);
          for (const ctx of contexts(project, 'sprite-1')) for (const [written, text, expected] of [['点数を表示する', 'すがたを見せる。', false], ['点数を表示する', '点数を言う。', true], ['スタートしたら点数が1ふやす', 'スタートしたら点数を1ふやす。', true]])
            ok(assistKeepsWritten(project, written, text, tree(text, ctx), ctx) === expected, JSON.stringify([variables, 'args' in ctx, written, text, expected]));
        }
      });
    }
    return {
      total: results.length,
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      results,
    };
  }
