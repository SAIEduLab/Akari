async function runAkariAsyncSelfTests() {
    const results = [];
    const test = async (id, fn) => {
      try {
        await fn();
        results.push({ id, pass: true, detail: 'PASS' });
      } catch (e) {
        results.push({ id, pass: false, detail: (e.code || e.name) + ': ' + e.message });
      }
    };
    await test('SAVE Markdown往復', async () => {
      const p = makeDefaultProject(),
        text = serializeProject(p),
        r = await parseProjectFile(text);
      if (serializeProject(r.project, r.assetStore) !== text) throw Error('roundtrip changed');
    });
    await test('SAVE 作りかけのコード保持', async () => {
      const p = makeDefaultProject();
      p.scripts[0].source = '点数を';
      const r = await parseProjectFile(serializeProject(p));
      if (r.project.scripts[0].source !== '点数を' || !r.diagnostics.length)
        throw Error('draft lost');
    });
    await test('SAVE 文字列の完全保持', async () => {
      const p = makeDefaultProject();
      p.name = '文字 <>& 😀';
      p.scripts[0].source = '「※ [a] Ａ」と言う';
      const r = await parseProjectFile(serializeProject(p));
      if (JSON.stringify(r.project) !== JSON.stringify(p)) throw Error('strings changed');
    });
    await test('SAVE 不正JSON拒否', async () => {
      let fail = false;
      try {
        await parseProjectFile('{');
      } catch (e) {
        fail = e.code === 'F502';
      }
      if (!fail) throw Error('invalid JSON accepted');
    });
    await test('SAVE 不足素材拒否', async () => {
      const p = makeDefaultProject();
      p.stage.backdrops.push({
        id: 'backdrop-image',
        name: '画像',
        kind: 'image',
        assetId: 'asset-missing',
        fit: 'contain',
        fill: '#ffffff',
      });
      let fail = false;
      try {
        serializeProject(p);
      } catch (_) {
        fail = true;
      }
      if (!fail) throw Error('missing asset accepted');
    });
    return {
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      total: results.length,
      results,
    };
  }
