async function runProductContractTests() {
    const results = [],
      test = async (id, fn) => {
        try {
          await fn();
          results.push({ id, pass: true, detail: 'PASS' });
        } catch (error) {
          results.push({
            id,
            pass: false,
            detail: `${error.code || error.name}: ${error.message}`,
          });
        }
      },
      reject = async (fn) => {
        let rejected = false;
        try {
          await fn();
        } catch (_) {
          rejected = true;
        }
        if (!rejected) throw new Error('不正データが受理されました');
      };
    await test('FORMAT-EXECUTABLE-CONTRACT', async () => {
      const expected = {
        languageContractId: 2,
        runtimeContractId: 2,
        programFormatVersion: 2,
        projectFormatVersion: 2,
      };
      if (JSON.stringify(AKARI_RUNTIME.EXECUTABLE_CONTRACT) !== JSON.stringify(expected))
        throw new Error('実行データの契約が一致しません');
      const p = makeRegressionProject(),
        text = serializeProject(p, new AssetStore());
      if (
        !text.startsWith('# あかり ' + PRODUCT_RELEASE + ' の作品') ||
        !text.includes('<!-- AKARI-PROJECT-F2-DATA-BEGIN -->') ||
        !text.includes('<!-- AKARI-PROJECT-F2-DATA-END -->')
      )
        throw new Error('作品の版またはマーカーが一致しません');
      const loaded = await parseProjectFile(text);
      if (JSON.stringify(loaded.project) !== JSON.stringify(p))
        throw new Error('作品の往復で変化しました');
      const otherProducer = text.replaceAll(PRODUCT_RELEASE, '7.8.9');
      const imported = await parseProjectFile(otherProducer);
      if (imported.project.appVersion !== '7.8.9' || imported.diagnostics.length)
        throw new Error('作成元の版だけで同じ形式の作品を拒否しました');
      const payload = packExecutable(p, new AssetStore());
      payload.appVersion = '7.8.9';
      if (AKARI_RUNTIME.restoreExecutable(payload).project.name !== p.name)
        throw new Error('作成元の版だけで実行作品を拒否しました');
    });
    await test('RELEASE-PROJECT-MARKER-BOUNDARIES', async () => {
      const p = makeRegressionProject();
      p.scripts = [{targetId:'stage',event:'start',source:'※ <!-- AKARI-PROJECT-F2-DATA-BEGIN -->\n※ ```json\n※ <!-- AKARI-PROJECT-F2-DATA-END -->\nもし'}];
      const text = serializeProject(p, new AssetStore());
      if (JSON.stringify((await parseProjectFile(text)).project)!==JSON.stringify(p)) throw Error('本文境界が変化しました');
      await reject(() => parseProjectFile(text.slice(0,-40)));
      await reject(() => parseProjectFile(text.replace('"schema": "akari-project"','"schema": null')));
    });
    await test('RELEASE-EXECUTABLE-MALFORMED', async () => {
      for (const value of [null, true, {}, ''])
        for (const key of ['appVersion', 'languageContractId', 'runtimeContractId', 'programFormatVersion', 'projectFormatVersion']) {
          const payload = packExecutable(makeRegressionProject(), new AssetStore());
          payload[key] = value;
          await reject(() => AKARI_RUNTIME.restoreExecutable(payload));
        }
    });
    await test('RELEASE-EXECUTABLE-ROUNDTRIP', async () => {
      const p = makeRegressionProject(),
        payload = packExecutable(p, new AssetStore()),
        restored = AKARI_RUNTIME.restoreExecutable(payload);
      if (restored.project.name !== p.name || restored.compiled.errors?.length)
        throw new Error('実行作品を復元できません');
    });
    await test('TEST-STANDARD-AKARI-MASCOT', async () => {
      const p = STANDARD_AKARI_MASCOT;
      if (
        p.kind !== 'image' ||
        p.assetId !== DEFAULT_MASCOT_ASSET_ID ||
        p.w !== 180 ||
        p.h !== 180
      )
        throw new Error('標準マスコット候補が内蔵画像と一致しません');
    });
    await test('TEST-DEFAULT-MASCOT', async () => {
      const p = makeDefaultProject(),
        s = p.components.find((c) => c.id === 'sprite-1'),
        co = s?.costumes.find((c) => c.id === s.costumeId),
        store = makeDefaultAssetStore(),
        asset = store.get(DEFAULT_MASCOT_ASSET_ID);
      if (
        !s ||
        s.type !== 'sprite' ||
        s.name !== 'あかり' ||
        s.x !== 230 ||
        s.y !== 110 ||
        s.w !== 180 ||
        s.h !== 180
      )
        throw new Error('デフォルトキャラクターの名前または配置が一致しません');
      if (!co || co.kind !== 'image' || co.assetId !== DEFAULT_MASCOT_ASSET_ID)
        throw new Error('デフォルト衣装が内蔵画像ではありません');
      if (
        !asset ||
        asset.mime !== 'image/png' ||
        asset.byteLength !== 5476 ||
        asset.sha256 !== DEFAULT_MASCOT_SHA256 ||
        asset.meta.width !== 180 ||
        asset.meta.height !== 180
      )
        throw new Error('内蔵キャラクターassetが一致しません');
      validateAssetReferences(p, store);
      const text = serializeProject(p, store),
        loaded = await parseProjectFile(text);
      if (JSON.stringify(loaded.project) !== JSON.stringify(p))
        throw new Error('デフォルトキャラクター作品の往復で変化しました');
    });
    await test('TEST-PALETTE-COLOR-DEFAULT', () => {
      const p = makeRegressionProject();
      p.scripts = [{ targetId: 'sprite-1', event: 'start', source: '条件の答え（あてはまる）の値を言う。' }];
      const s = createEditorSession(
          'script:sprite-1:start',
          p.scripts[0].source,
          { targetId: 'sprite-1', targetType: 'sprite', event: 'start' },
          p,
          0,
        ),
        parent = s.blockView.bodies.body[0];
      const candidate = blockInsertionAvailability(s, 'SensorRead:TOUCHING_COLOR', {
        parentId: parent.id,
        input: 'value',
      });
      if (!candidate.enabled) throw new Error(candidate.reason);
      const ast = blockDecode(candidate.node);
      resolveColor(ast.arg.value, { allowTransparent: false });
    });
    return {
      total: results.length,
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      results,
    };
  }
