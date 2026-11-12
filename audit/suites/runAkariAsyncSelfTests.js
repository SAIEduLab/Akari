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
      } catch (error) {
        fail = error?.code === 'F503' && error.message === '使うはずの絵や音「asset-missing」が ありません';
      }
      if (!fail) throw Error('missing asset accepted');
    });
    // LANGUAGE データ: a name that is also a word of the language (自分, もし, 大きさ) is a name; the text writes it in 【 】
    // where it would read otherwise (もしを1ふやす。 reads as it is), and the work keeps it through saving. A name with a
    // blank or a mark of the language is refused (F503).
    await test('SAVE a name that is a word of the language is kept and written in 【 】, and a name with a blank is refused', async () => {
      const p = makeDefaultProject(), part = p.components.find((c) => c.type === 'sprite');
      // (the work's pictures are letters, so that the check reads the same with or without an image decoder)
      p.components = [{ ...part, costumes: [{ id: 'face-word', name: '顔', kind: 'text', value: '●' }], costumeId: 'face-word' }];
      p.projectData.variables.push({ id: 'v-word', name: '点数', initialValue: 0 });
      p.scripts = [{ id: 's-word', targetId: part.id, event: 'start', source: '点数を1ふやす。' }];
      const written = [];
      for (const name of ['自分', 'もし', '大きさ']) {
        const next = Akari.prepareResourceRename(p, 'data:v-word', name), r = await parseProjectFile(serializeProject(next));
        written.push([r.project.projectData.variables.find((v) => v.id === 'v-word').name, r.project.scripts[0].source, r.diagnostics.length]);
      }
      if (JSON.stringify(written) !== JSON.stringify([['自分', '【自分】を1ふやす。', 0], ['もし', 'もしを1ふやす。', 0], ['大きさ', '【大きさ】を1ふやす。', 0]]))
        throw Error('names of words: ' + JSON.stringify(written));
      const refusals = [];
      for (const name of ['くろ ねこ', '【点】', 'あ'.repeat(33)]) { try { Akari.prepareResourceRename(p, 'data:v-word', name); refusals.push('renamed'); } catch (e) { refusals.push(e.code + ' ' + e.message); } }
      if (JSON.stringify(refusals) !== JSON.stringify(['F503 名前「くろ ねこ」には 使えない 文字が あります。空白や 「」【】（）［］、※ を けして ください',
        'F503 名前「【点】」には 使えない 文字が あります。空白や 「」【】（）［］、※ を けして ください', 'F503 名前は 1〜32文字で つけます']))
        throw Error('refusals: ' + JSON.stringify(refusals));
    });
    return {
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      total: results.length,
      results,
    };
  }
