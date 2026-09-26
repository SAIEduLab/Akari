async function runLimitBoundary09Tests() {
    const results = [],
      ok = (value, message = '境界値が期待と一致しません') => {
        if (!value) throw Error(message);
      };
    const test = async (key, fn, prefix = 'T09-LIMIT ') => {
      try {
        await fn();
        results.push({ id: prefix + key, pass: true, detail: 'PASS' });
      } catch (error) {
        results.push({
          id: prefix + key,
          pass: false,
          detail: (error.code || error.name) + ': ' + error.message,
        });
      }
    };
    const reject = (fn, code) => {
      let error;
      try {
        fn();
      } catch (e) {
        error = e;
      }
      ok(
        error instanceof AkariError && error.code === code,
        `期待 ${code}, 実際 ${error?.code || '受理'}`,
      );
    };
    const rejectAsync = async (fn, code) => {
      let error;
      try {
        await fn();
      } catch (e) {
        error = e;
      }
      ok(
        error instanceof AkariError && error.code === code,
        `期待 ${code}, 実際 ${error?.code || '受理'}`,
      );
    };
    const base = () => {
      const p = makeDefaultProject();
      p.scripts = [];
      return p;
    };
    const scalarRecord = (i, list = false) => ({
      id: `data-${list ? 'l' : 'v'}-${i}`,
      name: `値${i}`,
      initialValue: list ? [] : 0,
    });
    const component = (i) => {
      const original = makeDefaultProject().components.find((x) => x.type === 'button'),
        c = cloneDesignProject(original);
      c.id = `comp-${i}`;
      c.name = `部品${i}`;
      c.localData = { variables: [], lists: [] };
      return c;
    };
    const checkProject = (key, build, code = 'F504') =>
      test(key, () => {
        for (const n of [LIMITS[key] - 1, LIMITS[key]]) validateDesignProject(build(n));
        reject(() => validateDesignProject(build(LIMITS[key] + 1)), code);
      });
    const zeroBase64 = (n) =>
      'AAAA'.repeat(Math.floor(n / 3)) + (n % 3 === 1 ? 'AA==' : n % 3 === 2 ? 'AAA=' : '');
    const asset = (i, kind = 'image', bytes = 1) => ({
      id: `asset-limit-${i}`,
      kind,
      mime: kind === 'image' ? 'image/png' : 'audio/wav',
      byteLength: bytes,
      sha256: i.toString(16).padStart(64, '0'),
      dataBase64: zeroBase64(bytes),
    });
    const root = (assets) => ({ ...base(), assets });
    const runtime = () => {
      const p = base();
      p.scripts = [{ targetId: 'stage', event: 'start', source: '何もしない' }];
      const c = compileProject(p),
        r = new RuntimeModel(p, {}),
        q = new EventScheduler(p, c, r, {});
      return { p, c, r, q };
    };
    await test('fileBytes', async () => {
      for (const n of [LIMITS.fileBytes - 1, LIMITS.fileBytes])
        await rejectAsync(() => parseProjectFile('x'.repeat(n)), 'F502');
      await rejectAsync(() => parseProjectFile('x'.repeat(LIMITS.fileBytes + 1)), 'F504');
    });
    await test('importFileBytes', async () => {
      for (const fn of [canonicalizeImage, canonicalizeAudio]) {
        for (const n of [LIMITS.importFileBytes - 1, LIMITS.importFileBytes])
          await rejectAsync(() => fn(new Uint8Array(n)), 'F509');
        await rejectAsync(() => fn(new Uint8Array(LIMITS.importFileBytes + 1)), 'F504');
      }
    });
    for (const kind of ['image', 'audio'])
      await test(kind + 'Bytes', () => {
        const max = LIMITS[kind + 'Bytes'];
        for (const n of [max - 1, max])
          validateSerializedProjectStructure(root([asset(1, kind, n)]));
        reject(() => validateSerializedProjectStructure(root([asset(1, kind, max + 1)])), 'F504');
      });
    for (const key of ['assets', 'imageAssets', 'audioAssets'])
      await test(key, () => {
        const build = (n) =>
          root(
            Array.from({ length: n }, (_, i) =>
              asset(
                i + 1,
                key === 'audioAssets' || (key === 'assets' && i >= LIMITS.imageAssets)
                  ? 'audio'
                  : 'image',
              ),
            ),
          );
        for (const n of [LIMITS[key] - 1, LIMITS[key]])
          validateSerializedProjectStructure(build(n));
        reject(() => validateSerializedProjectStructure(build(LIMITS[key] + 1)), 'F504');
      });
    await test('assetRawTotal', () => {
      const build = (n) =>
        root([
          asset(1, 'audio', LIMITS.audioBytes),
          asset(2, 'audio', LIMITS.audioBytes),
          asset(3, 'audio', n - LIMITS.audioBytes * 2),
        ]);
      for (const n of [LIMITS.assetRawTotal - 1, LIMITS.assetRawTotal])
        validateSerializedProjectStructure(build(n));
      reject(() => validateSerializedProjectStructure(build(LIMITS.assetRawTotal + 1)), 'F504');
    });
    for (const key of ['imageWidth', 'imageHeight'])
      await test(key, () => {
        const check = (n) =>
          checkImageLimits(key === 'imageWidth' ? n : 1, key === 'imageHeight' ? n : 1);
        check(LIMITS[key] - 1);
        check(LIMITS[key]);
        reject(() => check(LIMITS[key] + 1), 'F504');
      });
    await test('imagePixels', () => {
      checkImageLimits(4096, 1023);
      checkImageLimits(4096, 1024);
      reject(() => checkImageLimits(4096, 1025), 'F504');
    });
    for (const key of ['imagePixelsTotal', 'audioDurationTotal'])
      await test(key, () => {
        const check = (n) => {
          const p = base();
          p.components = [];
          const records = new Map();
          if (key === 'imagePixelsTotal') {
            for (let i = 0; i < 5; i++) {
              const id = `asset-total-${i}`,
                pixels =
                  i < 4
                    ? Math.min(LIMITS.imagePixels, n - i * LIMITS.imagePixels)
                    : n - 4 * LIMITS.imagePixels;
              if (pixels <= 0) continue;
              p.stage.backdrops.push({
                id: `back-total-${i}`,
                name: `背景${i}`,
                kind: 'image',
                assetId: id,
                fit: 'contain',
                fill: '#ffffff',
              });
              records.set(id, {
                kind: 'image',
                byteLength: 1,
                sha256: String(i),
                meta: { width: pixels, height: 1 },
              });
            }
          } else {
            for (let i = 0; i < 3; i++) {
              const id = `asset-total-${i}`,
                duration = Math.min(60, n - i * 60);
              if (duration <= 0) continue;
              p.sounds.push({ id: `sound-total-${i}`, name: `音${i}`, assetId: id });
              records.set(id, {
                kind: 'audio',
                byteLength: 1,
                sha256: String(i),
                meta: { duration },
              });
            }
          }
          return validateAssetReferences(p, { get: (id) => records.get(id) });
        };
        check(LIMITS[key] - 1);
        check(LIMITS[key]);
        reject(() => check(LIMITS[key] + 1), 'F504');
      });
    await test('audioDuration', () => {
      const check = (duration) => checkAudioLimits({ duration, channels: 1, sampleRate: 8000 });
      check(59);
      check(60);
      reject(() => check(61), 'F504');
      reject(() => check(0), 'F511');
    });
    await test('audioChannels', () => {
      for (const channels of [1, 2]) checkAudioContainerLimits({ channels, sampleRate: 8000 });
      for (const channels of [0, 3])
        reject(() => checkAudioContainerLimits({ channels, sampleRate: 8000 }), 'F511');
    });
    for (const key of ['audioSampleRateMin', 'audioSampleRateMax'])
      await test(key, () => {
        const check = (sampleRate) => checkAudioContainerLimits({ channels: 1, sampleRate });
        check(LIMITS[key]);
        check(LIMITS[key] + (key.endsWith('Min') ? 1 : -1));
        reject(() => check(LIMITS[key] + (key.endsWith('Min') ? -1 : 1)), 'F511');
      });
    await checkProject('backdrops', (n) => {
      const p = base();
      p.stage.backdrops = Array.from({ length: n }, (_, i) => ({
        id: `back-${i}`,
        name: `背景${i}`,
        kind: 'color',
        value: '#ffffff',
      }));
      p.stage.backdropId = 'back-0';
      return p;
    });
    await checkProject('costumesPerSprite', (n) => {
      const p = base(),
        s = p.components.find((x) => x.type === 'sprite');
      s.costumes = Array.from({ length: n }, (_, i) => ({
        id: `costume-limit-${i}`,
        name: `衣装${i}`,
        kind: 'text',
        value: '★',
      }));
      s.costumeId = s.costumes[0].id;
      return p;
    });
    await checkProject('sounds', (n) => {
      const p = base();
      p.sounds = Array.from({ length: n }, (_, i) => ({
        id: `sound-${i}`,
        name: `音${i}`,
        assetId: 'asset-sound',
      }));
      return p;
    });
    await checkProject('components', (n) => {
      const p = base();
      p.components = Array.from({ length: n }, (_, i) => component(i));
      return p;
    });
    await checkProject('scripts', (n) => {
      const p = base();
      p.components = Array.from({ length: 201 }, (_, i) => component(i));
      const slots = p.components.flatMap((c) =>
        EVENT_BY_TYPE[c.type].map((event) => ({ targetId: c.id, event, source: '' })),
      );
      p.scripts = slots.slice(0, n);
      ok(p.scripts.length === n);
      return p;
    });
    await checkProject('sourceEach', (n) => {
      const p = base();
      p.scripts = [{ targetId: 'stage', event: 'start', source: '※' + 'a'.repeat(n - 1) }];
      return p;
    });
    await checkProject('sourceTotal', (n) => {
      const p = base();
      p.actions = Array.from({ length: Math.ceil(n / LIMITS.sourceEach) }, (_, i) => ({
        id: `action-limit-${i}`,
        name: `動作${i}`,
        args: [],
        source: '※' + 'a'.repeat(Math.min(LIMITS.sourceEach, n - i * LIMITS.sourceEach) - 1),
      }));
      return p;
    });
    for (const key of ['projectVars', 'projectLists'])
      await checkProject(key, (n) => {
        const p = base(),
          list = key === 'projectLists';
        p.projectData = { variables: [], lists: [] };
        p.projectData[list ? 'lists' : 'variables'] = Array.from({ length: n }, (_, i) =>
          scalarRecord(i, list),
        );
        return p;
      });
    await test('listItems', () => {
      for (const n of [LIMITS.listItems - 1, LIMITS.listItems]) {
        const value = Array(n).fill(0);
        assertRuntimeValueLimit(value);
        const p = base();
        p.projectData.lists = [{ id: 'list-bound', name: '一覧', initialValue: value }];
        validateDesignProject(p);
      }
      reject(() => assertRuntimeValueLimit(Array(LIMITS.listItems + 1).fill(0)), 'R413');
      const p = base();
      p.projectData.lists = [
        { id: 'list-bound', name: '一覧', initialValue: Array(LIMITS.listItems + 1).fill(0) },
      ];
      reject(() => validateDesignProject(p), 'F504');
    });
    await test('stringChars', () => {
      for (const n of [LIMITS.stringChars - 1, LIMITS.stringChars]) {
        const text = '😀'.repeat(n);
        assertRuntimeValueLimit(text);
        const p = base();
        p.projectData.variables = [{ id: 'var-bound', name: '値', initialValue: text }];
        validateDesignProject(p);
      }
      reject(() => assertRuntimeValueLimit('😀'.repeat(LIMITS.stringChars + 1)), 'R413');
      const p = base();
      p.projectData.variables = [
        { id: 'var-bound', name: '値', initialValue: '😀'.repeat(LIMITS.stringChars + 1) },
      ];
      reject(() => validateDesignProject(p), 'F504');
    });
    await checkProject('callables', (n) => {
      const p = base();
      p.actions = Array.from({ length: n }, (_, i) => ({
        id: `action-${i}`,
        name: `動作${i}`,
        args: [],
        source: '',
      }));
      return p;
    });
    await checkProject(
      'args',
      (n) => {
        const p = base();
        p.actions = [
          {
            id: 'action-bound',
            name: '試験',
            args: Array.from({ length: n }, (_, i) => `受け取る値${i}`),
            source: '',
          },
        ];
        return p;
      },
      'F503',
    );
    await test('clones', () => {
      const { r } = runtime();
      for (let i = 0; i < LIMITS.clones; i++) r.createClone('sprite-1');
      ok([...r.actors.values()].filter((x) => x.isClone).length === LIMITS.clones);
      reject(() => r.createClone('sprite-1'), 'R410');
      ok([...r.actors.values()].filter((x) => x.isClone).length === LIMITS.clones);
    });
    await test('activeTasks', () => {
      const { q } = runtime();
      for (let i = 0; i < LIMITS.activeTasks; i++) ok(q.createTask('stage', 'stage', 'start'));
      ok(q.tasks.size === LIMITS.activeTasks);
      reject(() => q.createTask('stage', 'stage', 'start'), 'R413');
      ok(q.tasks.size === LIMITS.activeTasks);
      q.stop();
    });
    await test('repeatCount', () => {
      const { q } = runtime();
      for (const count of [LIMITS.repeatCount - 1, LIMITS.repeatCount]) {
        const task = q.createTask('stage', 'stage', 'start');
        q.executeNode(task, {
          kind: 'RepeatCount',
          count: { kind: 'NumberLiteral', value: count },
          body: [{ kind: 'NoOperation' }],
        });
        ok(task.execStack.some((x) => x.type === 'repeatCount' && x.remaining === count - 1));
      }
      const task = q.createTask('stage', 'stage', 'start'),
        before = task.execStack.length;
      reject(
        () =>
          q.executeNode(task, {
            kind: 'RepeatCount',
            count: { kind: 'NumberLiteral', value: LIMITS.repeatCount + 1 },
            body: [{ kind: 'NoOperation' }],
          }),
        'R413',
      );
      ok(task.execStack.length === before);
      q.stop();
    });
    await test('functionOps', () => {
      const { q } = runtime(),
        ctx = q.context(q.createTask('stage', 'stage', 'start')),
        budget = { count: LIMITS.functionOps - 2 },
        value = { kind: 'NumberLiteral', value: 7 };
      ok(evalExpression(value, ctx, budget) === 7 && budget.count === LIMITS.functionOps - 1);
      ok(evalExpression(value, ctx, budget) === 7 && budget.count === LIMITS.functionOps);
      reject(() => evalExpression(value, ctx, budget), 'R409');
      q.stop();
    });
    await test('callDepth', () => {
      const { p, r } = runtime();
      p.actions = [{ id: 'action-depth', name: '深さ動作', args: [], source: '何もしない' }];
      p.functions = [{ id: 'function-depth', name: '深さ計算', args: [], source: '0を返す' }];
      const c = compileProject(p);
      ok(c.errors.length === 0);
      const q = new EventScheduler(p, c, r, {}),
        task = q.createTask('stage', 'stage', 'start'),
        ctx = q.context(task);
      for (let i = 0; i < LIMITS.callDepth; i++)
        q.callAction(task, { name: '深さ動作', args: [] }, ctx);
      ok(task.callFrames.length === LIMITS.callDepth);
      reject(() => q.callAction(task, { name: '深さ動作', args: [] }, ctx), 'R408');
      for (const depth of [LIMITS.callDepth - 1, LIMITS.callDepth])
        ok(runUserFunction('深さ計算', [], ctx, null, depth) === 0);
      reject(() => runUserFunction('深さ計算', [], ctx, null, LIMITS.callDepth + 1), 'R408');
      q.stop();
    });
    await test(
      'unary POS runtime',
      () => {
        const { q, c } = runtime(),
          ctx = q.context(q.createTask('stage', 'stage', 'start'));
        for (const [source, expected] of [
          ['＋3', 3],
          ['＋（－2）', -2],
          ['＋0', 0],
        ]) {
          const ast = parseExpression(source, c.symbols);
          ok(
            ast.kind === 'UnaryExpression' &&
              ast.op === 'POS' &&
              evalExpression(ast, ctx) === expected,
          );
          ok(evalExpression(parseExpression(formatExpression(ast), c.symbols), ctx) === expected);
        }
        reject(() => evalExpression(parseExpression('＋「文字」', c.symbols), ctx), 'R411');
        q.stop();
      },
      'T09-COVERAGE ',
    );
    await test(
      'INPUT_VALUE runtime and target rejection',
      () => {
        const p = base(),
          input = component(999);
        input.type = 'input';
        input.text = '最初';
        p.components.push(input);
        p.scripts = [{ targetId: 'stage', event: 'start', source: '何もしない' }];
        const c = compileProject(p),
          r = new RuntimeModel(p, {}),
          q = new EventScheduler(p, c, r, {}),
          ctx = q.context(q.createTask('stage', 'stage', 'start')),
          ast = (name) => parseExpression(`「${name}」の値`, c.symbols);
        ok(evalExpression(ast(input.name), ctx) === '最初');
        r.actor(input.id).inputValue = '変更😀';
        ok(evalExpression(ast(input.name), ctx) === '変更😀');
        reject(() => evalExpression(ast('未登録部品'), ctx), 'R405');
        reject(
          () => evalExpression(ast(p.components.find((x) => x.type === 'button').name), ctx),
          'R406',
        );
        q.stop();
      },
      'T09-COVERAGE ',
    );
    return {
      total: results.length,
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      results,
    };
  }
