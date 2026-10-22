  // ────────────────────────────────────────────────────────────────────────
  // 10 — Block view, interaction and viewport state
  // ────────────────────────────────────────────────────────────────────────
  // Whether the line of a diagnostic is inside a もし／くり返す of the source it was found in (null when not known).
  function diagnosticLineEnclosed(diagnostic, source) {
    const lines = typeof source === 'string' && diagnostic?.line ? source.split('\n') : null, text = lines?.[diagnostic.line - 1];
    if (text === undefined) return null;
    const at = lines.slice(0, diagnostic.line - 1).reduce((n, l) => n + l.length + 1, 0) + text.match(/^[ \u3000\t]*/)[0].length;
    try { return insertionContext(source, at, at).depth > 0; } catch (_) { return null; }
  }
  // Presentation only: parser/runtime diagnostics and their original messages stay unchanged. With the body's source,
  // an indentation message names もし／くり返す only for a line inside one (F-24); the parser's Tab message is shown as it is.
  function childDiagnosticText(diagnostic, source = null) {
    const message = String(diagnostic?.message || diagnostic || '書き方を たしかめてください');
    if (diagnostic?.code === 'R403')
      return '計算の 答えが 大きすぎるなどの 理由で、あかりで 使える 数に なりませんでした。使う 数や 計算の しかたを たしかめてください。';
    if (/「ではない」が 2つ つづいています/.test(message))
      return '「ではない」を 2つ つづけるときは、「条件（…）が成り立たない」で 書きます。れい：条件（1が2と同じではない）が成り立たない';
    if (/を 2回 書いています|入れるものに 同じ 名前が/.test(message))
      return '入れて使う 数や 文字に、同じ 名前が 2つ いじょう あります。「入れるもの」の 名前は ちがう 名前に してください。れい：点数を10として、';
    if (/入れるものの 名前を たしかめてください/.test(message))
      return '入れて使う 数や 文字の 名前を 1つ 書きます。てじゅんや「答えを もとめる」の「入れるもの」と 同じ 名前に します。れい：点数を10として、';
    if (/名前と 入れるものを「を」で つないで 書きます/.test(message))
      return '名前と 入れるものを「を」で つなぎます。れい：点数を10として、';
    if (/入れるものを（ ）で かこんでください/.test(message))
      return '入れて使う 数や 文字を（ ）で ひとまとめに します。れい：（10、「あかり」）';
    if (/開く しるしと とじる しるしが 合っているか/.test(message))
      return '（ ）・［ ］・【 】の 開く しるしと とじる しるしを そろえます。れい：［1、2］';
    if (/とじる しるしを 書いてください/.test(message))
      return '「 」・【 】・（ ）などの とじる しるしを 足します。れい：「こんにちは」';
    if (/で つなぐ きまりを、1つずつ（ ）で かこんで|きまりを 1つずつ（ ）で かこんで 分けて/.test(message))
      return '「で、」「か、」で つなぐ 文の 中に「かつ」「または」は 書けません。ぜんぶを「条件（…）が成り立つ」で ひとまとめに します。れい：もし条件（1が1と同じかつ2が2と同じかつ3が3と同じ）が成り立つなら、';
    if (/くらべる 2つの ものを（ ）か【 】で かこんで/.test(message))
      return 'くらべる 2つの ものの 名前を【 】で かこむと 分かれます。れい：【点数】が10より大きい';
    if (/言う ことは「「文字」と言う」/.test(message))
      return '話す 文字は「 」で かこみます。れい：「おはよう」と言う。へんすうの 中身を 話すときは「点数を言う」のように 書きます。';
    if (/そのまま 言う 文字か、入れた 音か/.test(message))
      return 'そのまま 話す 文字・鳴らす 音・へんすう・リストの 中身から えらびます。れい：「おはよう」と言う／「ベル」を鳴らす／点数を言う。';
    if (/重ねるときは、次の 行に 書いて/.test(message))
      return '「もし」「くり返す」の 中の 文は、次の 行に 書いて 行の はじめを 右へ ずらします。\nれい：2回くり返す。\n  2回くり返す。\n    「おはよう」と言う。';
    if (/いちばん 外の 文は、行の はじめを 右へ ずらさずに/.test(message))
      return 'いちばん 外の 文は 行の 左から 書きます。行の はじめの 空白を けしてください。';
    if (/などの 次の 行は、行の はじめを 右へ ずらして/.test(message))
      return '「作品を動かしたとき、」などの 次の 行は、はじめを 右へ ずらします。\nれい：作品を動かしたとき、\n  「おはよう」と言う。';
    if (/同じ まとまりの 文は、行の はじめの 空白の 数を/.test(message))
      return diagnosticLineEnclosed(diagnostic, source) === false
        ? '前の 行と 同じ だけ 右へ ずらします。この 行の はじめの 空白を へらしてください。'
        : '同じ「もし」や「くり返す」の 中の 行は、はじめの 空白の 数を そろえます。れい：どちらも 空白を 2つ。';
    if (/同じ 行と 次の 行の 両方に 書かないで/.test(message))
      return '中の 文を 同じ 行と 次の 行の 両方に 書いています。次の 行に まとめ、行の はじめを 右へ ずらしてください。\nれい：2回くり返す。\n  「おはよう」と言う。';
    if (/「ここまで」は 書きません/.test(message))
      return '「ここまで」を けして、次の 文の はじめを 左へ もどします。\nれい：2回くり返す。\n  「中」と言う。\n「外」と言う。';
    if (/と 組になる「もし」が ありません/.test(message))
      return '「そうでなければ、」は、組に なる「もし」と 行の はじめを そろえます。上に「もし」が あるか たしかめてください。';
    if (/の 中では、動く・音を 出す・待つ|の 中では、この ブロックは 使えません/.test(message))
      return '「答えを もとめる」では、部品を 動かす・音を 出す・待つ などの やることは 使えません。これらは「てじゅん」へ 入れます。れい：1＋2を答えとして返す。';
    if (/の 中からは、作品や 部品の へんすう・リストを かえられません/.test(message))
      return '「答えを もとめる」では、作品や 部品の へんすう・リストの 中身を かえられません。かえる やることは「てじゅん」へ 入れます。';
    if (/「待つ」と「動く」の 2つの 文に 分けます/.test(message))
      return '待ってから 動くときは、2つの 文に 分けます。\nれい：1秒待つ。\n前へ10歩進む。';
    if (/「N番目」はリスト/.test(message)) {
      // The name the child wrote before 〜番目, when the line is known; no list of another work is named.
      const line = typeof source === 'string' && diagnostic?.line ? source.split(/\r\n?|\n/)[diagnostic.line - 1] || '' : '',
        name = /([^\s（）「」【】、。]+?)の(?:[0-9０-９]+|（[^）]*）)番目/.exec(line)?.[1];
      return (name ? '「' + name + '」は リストでは ないので、何番目かを えらべません。' : '') + '何番目かを えらべるのは、ならんだ ものを おぼえる リストです。';
    }
    if (/使われていない絵や音か、足りない絵や音/.test(message))
      return '作品で使う絵や音と、ほぞんする絵や音の組み合わせが合っていません。理由は 下の くわしい せつめいに のこしています。「絵や音」の画面で、使う絵や音を たしかめてください。';
    if (/絵や音の中身を表す文字|同じしるし|絵や音の番号|使うはずの絵や音|同じ中身の絵や音|ではないものを使っています|絵や音「[^」]*」がありません|の種類が、正しくありません|記録と合いません|記録とちがいます|絵や音の記録の形|使える大きさの外|あかりで使えない(?:形|種類)の|中身をたしかめるしるし|同じ絵や音が2つ以上|おまけの情報|ほぞんした音|ほぞんしたときと合いません/.test(message))
      return '絵や音の 中身を たしかめられませんでした。理由は 下の くわしい せつめいに のこしています。「絵や音」の 画面で、使う 絵や音を たしかめてください。';
    return message;
  }
  function diagnosticDetailText(diagnostic, original = null) {
    return original ?? [diagnostic?.code, diagnostic?.where || diagnostic?.key,
      diagnostic?.line ? diagnostic.line + '行目 / ' + (diagnostic.column || 1) + '文字目' : '',
      diagnostic?.message || String(diagnostic), diagnostic?.detail].filter(Boolean).join('\n');
  }
  function appendDiagnosticDetails(root, diagnostic, original = null) {
    const details = document.createElement('details'), summary = document.createElement('summary'), text = document.createElement('pre');
    details.className = 'diagnostic-details';
    summary.textContent = '先生むけの くわしい せつめい';
    text.textContent = diagnosticDetailText(diagnostic, original);
    details.append(summary, text); root.append(details); return details;
  }

  function createBlockEditorView(options) {
    const {
      root,
      getSession,
      getProject,
      getContext = () => ({}),
      isLocked = () => false,
      onOperation,
      onPending = () => {},
      onCancel = () => {},
    } = options;
    const doc = root.ownerDocument,
      viewId = 'blockui-view-' + ++createBlockEditorView.sequence,
      abort = new AbortController(),
      signal = abort.signal;
    let pending = null,
      deferredFocus = null,
      deferredRender = false,
      committing = false,
      rendering = false,
      destroyed = false,
      signature = '',
      tree = null,
      index = new Map(),
      selected = '',
      destination = null,
      moving = null,
      drag = null,
      replacement = null,
      currentLocation = null,
      suppressClickUntil = 0,
      pointerFocusTarget = null,
      // The element focused when the pointer went down: a field entered from elsewhere selects its whole value (E-01).
      pointerFocusPrevious = null,
      // How the last press was made (mouse, touch or pen): a touch drop does not open the screen keyboard (E-03).
      lastPointerType = 'mouse',
      highlightedId = null,
      lineNodes = new Map(),
      displaySession = null,
      dragFrame = null;
    let searchText = '',
      previousSearch = '',
      category = document.body.dataset.uiLevel !== 'advanced' ? 'basic' : '',
      showOutside = false,
      paletteMode = 'all',
      categoryExplicit = false,
      availabilityCache = new Map(),
      cacheSignature = '',
      diagnosticPage = 0,
      diagnosticsOpen = false,
      diagnosticsByLine = new Map(),
      branchLines = new Map(),
      branchSourceLines = new Map();
    const phraseCache = new Map();
    // The なかま of the list, in their order: the chips, and the names of the list's blocks elsewhere (FCB-21).
    const PALETTE_GROUP_LABELS = new Map([
      ['basic', 'よく使う'],
      ['', 'すべて'],
      ['motion', '動き'],
      ['look', '見た目'],
      ['control', 'もし・くり返し'],
      ['event', '合図'],
      ['data', 'へんすう・リスト'],
      ['operator', '計算'],
      ['sense', 'しらべる'],
      ['sound', '音'],
      ['pen', 'ペン'],
      ['action', '自分で作ったブロック'],
      ['clone', 'コピー'],
      ['comment', 'メモ'],
    ]);
    let faceSymbols = null;
    const openEditors = new Set();
    const openAnnotations = new Set(),
      collapsed = new Set(),
      bodyPages = new Map(),
      bodyExtraPages = new Map(),
      inputPages = new Map();
    // Bound both the opening batch and a revealed later batch with role controls.
    const BODY_PAGE = 40,
      INPUT_PAGE = 20;
    let zoom = 1,
      pan = null,
      geometryFrame = null,
      ghost = null,
      snapPreview = null,
      bodyObserver = null,
      // The height the workspace keeps while the places between blocks are open, and what kept its place when they
      // opened for a chosen place or a moved block (keepInView).
      planeFloor = 0,
      openAnchor = null;
    const shapeObserver =
      typeof ResizeObserver === 'function' ? new ResizeObserver(() => scheduleGeometry()) : null;
    const E = (tag, className = '', text = null, attrs = {}) => {
      const n = doc.createElement(tag);
      if (className) n.className = className;
      if (text !== null) n.textContent = text;
      for (const [k, v] of Object.entries(attrs))
        if (v !== null && v !== undefined) n.setAttribute(k, String(v));
      return n;
    };
    const listen = (n, event, fn, opts = {}) => n.addEventListener(event, fn, { ...opts, signal });
    const button = (label, action, fn, attrs = {}) => {
      const b = E('button', 'blockui-button', label, {
        type: 'button',
        'data-blockui-action': action,
        ...attrs,
      });
      listen(b, 'click', (e) => {
        e.stopPropagation();
        fn(e);
      });
      return b;
    };
    const editDisclosure = (node, key, label, className) => {
      const details = E('details', className), id = node.id + ':' + key;
      details.dataset.blockuiDisclosure = id; details.open = openEditors.has(id);
      details.append(E('summary', '', label));
      listen(details, 'toggle', () => {
        if (details.isConnected) details.open ? openEditors.add(id) : openEditors.delete(id);
        scheduleGeometry();
      });
      return details;
    };
    const schemaOf = (n) => BLOCK_SCHEMA_BY_ID.get(n?.schemaId);
    const session = () => getSession?.() || null;
    const project = () => getProject?.() || session()?.project;
    const context = () => ({ ...session()?.context, ...getContext() });
    const subjectName = node => {
      const lineage = [node, ...(index.get(node.id)?.ancestors || []).slice().reverse().map(id => index.get(id)?.node)];
      // A qualified expression inherits its enclosing value context. Each
      // statement starts again from the event's self, not an outer statement.
      for (const part of lineage) {
        const category = schemaOf(part)?.category;
        if (category === 'script') break;
        if (part?.fields.actorRef?.kind === 'named') return part.fields.actorRef.name;
        if (category === 'statement') break;
      }
      const heading = lineage.find(n => schemaOf(n)?.category === 'script')?.fields.heading;
      return heading?.actorRef?.kind === 'named' ? heading.actorRef.name
        : project()?.components.find(c => c.id === context().targetId)?.name || project()?.stage?.name || '自分';
    };
    const subjectContext = node => {
      const subject = subjectName(node),
        targetId = (project() ? namesStage(project(), subject) : subject === '画面') ? 'stage'
          : project()?.components.find(c => c.name === subject)?.id;
      return { ...context(), targetId };
    };
    const getTree = (s) => s?.blockView?.tree || s?.blockView || null;
    const errorText = (e) => e?.message || e?.reason || String(e || 'うまく できなかったよ。もう一度 やってみてね');
    const copy = (v) =>
      typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
    const announce = (message, error = false) => {
      messageBox.textContent = message || '';
      messageBox.classList.toggle('blockui-error', error);
      messageBox.setAttribute('role', error ? 'alert' : 'status');
      // The mistake of the field being edited is read here and seen under the field.
      messageBox.classList.toggle('blockui-message-near-field', !!message && !!pending && message === pending.error);
    };
    const notifyPending = () =>
      onPending(
        pending
          ? {
              ownerKey: pending.ownerKey,
              sourceRevision: pending.sourceRevision,
              contextRevision: pending.contextRevision,
              id: pending.id,
              nodePath: index.get(pending.id)?.path || [],
              field: pending.key,
              value: pending.input?.value ?? '',
              composing: !!pending.composing,
              invalid: !!pending.invalid,
              reason: pending.error || '入れたら「決める」を おしてね',
            }
          : replacement
            ? { ownerKey: session()?.ownerKey, reason: 'もとの ばしょに 入れる ブロックを えらんでね' }
            : drag?.started
              ? { ownerKey: session()?.ownerKey, reason: 'ブロックを 運んでいる とちゅうだよ' }
              : null,
      );
    const localIndex = (rootNode) => {
      const map = new Map();
      const walk = (
        node,
        info = { parentId: null, body: null, input: null, index: null, ancestors: [], path: [] },
      ) => {
        map.set(node.id, { node, ...info });
        for (const [k, children] of Object.entries(node.bodies || {}))
          children.forEach((n, i) =>
            walk(n, {
              parentId: node.id,
              body: k,
              input: null,
              index: i,
              ancestors: [...info.ancestors, node.id],
              path: [...info.path, k, i],
            }),
          );
        for (const [k, children] of Object.entries(node.inputs || {})) {
          const many = Array.isArray(children);
          (many ? children : [children]).forEach((n, i) =>
            walk(n, {
              parentId: node.id,
              body: null,
              input: k,
              index: many ? i : null,
              ancestors: [...info.ancestors, node.id],
              path: [...info.path, k, ...(many ? [i] : [])],
            }),
          );
        }
      };
      if (rootNode) walk(rootNode);
      return map;
    };
    root.classList.add('blockui-editor');
    root.setAttribute('aria-label', 'ブロックで作るところ');
    const controls = E('div', 'blockui-view-controls'),
      destinationLabel = E('div', 'blockui-destination', '本文の いちばん下に入れる'),
      cancelButton = button('入力を やめる', 'cancel', () => cancel()),
      commitButton = button('決める', 'commit', () => flush({explicit:true})),
      messageBox = E('div', 'blockui-message', '', { 'aria-live': 'polite' }),
      // An input's mistake is shown right under the field, in the floating 決める and やめる (E-12).
      fieldError = E('p', 'blockui-field-error', '', { id: viewId + '-field-error' });
    controls.append(fieldError, destinationLabel, commitButton, cancelButton);
    commitButton.style.pointerEvents = cancelButton.style.pointerEvents = 'auto';
    root.append(controls, messageBox);
    const layout = E('div', 'blockui-layout'),
      palette = E('aside', 'blockui-palette', null, {
        'aria-label': 'ブロックの一覧',
      }),
      workspace = E('div', 'blockui-workspace', null, {
        tabindex: '0',
        'aria-label': 'ブロックの作業台',
      }),
      paletteControls = E('div', 'blockui-palette-controls');
    const workspaceShell = E('div', 'blockui-workspace-shell'),
      plane = E('div', 'blockui-plane'),
      world = E('div', 'blockui-world'),
      navigation = E('div', 'blockui-navigation', null, {
        'aria-label': '作業台の見え方',
      });
    const zoomLabel = button('100%', 'zoom-reset', () => setZoom(1), {
      'aria-label': '大きさを100%に もどす',
    });
    // − and ＋ step through 50・75・100・125・150・200% (E-10); the label puts 100% back.
    const minus = button('−', 'zoom-out', () => setZoom(blockZoomStep(zoom, -1)), {
        'aria-label': '小さく見る',
      }),
      plus = button('＋', 'zoom-in', () => setZoom(blockZoomStep(zoom, 1)), {
        'aria-label': '大きく見る',
      });
    // The workspace goes back to its top-left corner: 「さいしょへ」 (F-22).
    const home = button('さいしょへ', 'workspace-home', () => {
        workspace.scrollTo({ left: 0, top: 0 });
        workspace.focus({ preventScroll: true });
      }),
      fit = button('見わたす', 'workspace-fit', () => fitBlocks());
    // 「ブロックを しまう」 puts the block list away so the body gets its width, and reads 「ブロックを 出す」 while it is
    // away (F-09). はじめて has no such button: its short list always stays.
    const libraryToggle = button(
      'ブロックを しまう',
      'library-toggle',
      () => {
        const editingHidden = root.querySelector('.blockui-editing-field') &&
          doc.defaultView.getComputedStyle(palette).display === 'none';
        if (editingHidden) {
          // A narrow text editor temporarily hides the palette independently of
          // this toggle. Finish valid input before explicitly bringing it back.
          if (!flush().ok) return;
          for (const field of root.querySelectorAll('.blockui-editing-field'))
            field.classList.remove('blockui-editing-field');
          root.classList.remove('blockui-library-hidden');
        } else root.classList.toggle('blockui-library-hidden');
        syncLibraryToggle();
        scheduleGeometry();
      },
      { 'aria-expanded': 'true' },
    );
    function syncLibraryToggle() {
      const entry = document.body.dataset.uiLevel === 'entry';
      if (entry) root.classList.remove('blockui-library-hidden');
      const shown = !root.classList.contains('blockui-library-hidden');
      libraryToggle.hidden = entry;
      libraryToggle.textContent = shown ? 'ブロックを しまう' : 'ブロックを 出す';
      libraryToggle.setAttribute('aria-expanded', String(shown));
    }
    const wide = options.onExpand
      ? button(
          '作業台を広く',
          'workspace-expand',
          () => {
            const expanded = options.onExpand();
            wide.textContent = expanded
              ? '画面も見る'
              : '作業台を広く';
            wide.setAttribute('aria-pressed', String(expanded));
            scheduleGeometry();
          },
          { 'aria-pressed': 'false' },
        )
      : null;
    navigation.append(libraryToggle, home, fit, minus, zoomLabel, plus);
    if (wide) navigation.append(wide);
    plane.append(world);
    workspace.append(plane);
    workspaceShell.append(workspace, navigation);
    const workspaceTip = E(
      'div',
      'blockui-workspace-tip',
      'ブロックを つかんで つなげよう · ブロックの ない ところを おしたまま ずらすと、作業台の 見える ところが かわるよ',
    );
    workspaceShell.append(workspaceTip);
    const modeSelect = E('select', '', null, {
      'aria-label': 'ブロックの しゅるい',
      'data-blockui-palette-mode': 'true',
    });
    for (const [v, l] of [
      ['all', 'すべてのブロック'],
      ['statement', 'つなぐブロック'],
      ['expression', 'はめるブロック'],
    ])
      modeSelect.append(E('option', '', l, { value: v }));
    const search = E('input', '', null, {
        type: 'search',
        placeholder: 'ブロックを さがす',
        'aria-label': 'ブロックを さがす',
        'data-blockui-search': 'true',
      }),
      categorySelect = E('div', 'blockui-categories', null, {
        role: 'group',
        'aria-label': 'ブロックの なかま',
      }),
      outside = E('input', '', null, { type: 'checkbox', 'aria-label': '使えないブロックも見せる' }),
      outsideLabel = E('label', 'blockui-check');
    outside.checked = showOutside;
    outsideLabel.append(outside, doc.createTextNode('使えないブロックも見せる'));
    // One list that scrolls, with no pages (E-17).
    const paletteList = E('div', 'blockui-palette-list'),
      paletteOptions = E('details', 'blockui-palette-options');
    paletteOptions.append(E('summary', '', 'ブロックの しゅるい'), outsideLabel);
    paletteOptions.append(modeSelect);
    const searchLabel=E('label','blockui-search-label','ブロックを さがす');
    searchLabel.append(search);
    paletteControls.append(searchLabel, paletteOptions);
    const searchScope=E('p','blockui-search-scope','',{'aria-live':'polite'});
    paletteControls.append(searchScope);
    const restoreSearch = button('', 'restore-search', () => {
      searchText = search.value = previousSearch;
      renderPalette();
    });
    paletteControls.append(restoreSearch);
    if(options.onData)paletteControls.append(button('＋ へんすう・リストを作る','create-data',()=>options.onData()));
    // ＾ is a くわしく block (F-21): its help shows there only (renderPalette).
    const powerHelp=E('p','','「同じ数を くり返し かける」（＾）は、同じ 数を 何回も かける 計算だよ。2＾3 は 2×2×2 で 8 に なるよ。');
    const help=E('details','blockui-local-help');help.append(E('summary','','いまの作り方のヒント'),
      E('p','','「＋ ここに入れる」で ブロックを 入れるよ。あいている ところには 文字・数・へんすう・リストを えらぶよ。「たずねる」で 待った 返事は「答え」で 使えるよ。とちゅうでも ほぞんできるよ。'),
      E('p','','あいている ところに 入れる 中身には、文字「おはよう」、数の 10、「あてはまる・あてはまらない」などが あるよ。'),
      E('p','','つなぐブロックは、「話す」「待つ」など、してほしい ことだよ。本文（ほんぶん）は、ブロックを じゅんばんに ならべる ところだよ。'),
      E('p','','ブロックは なかまごとに 分かれているよ。れい：「よく使う」には「話す」「待つ」が あるよ。「ブロックを さがす」に ことばを 入れると、さがせるよ。「ブロックの しゅるい」で、つなぐブロックと はめるブロックの どちらを 見るか えらべるよ。「使えないブロックも見せる」を えらぶと、使えない わけも 読めるよ。'),
      E('p','','とちゅうに 入れる：本、ぼうしの 間に かさを 入れると、本、かさ、ぼうしに なるよ。入れかえる：かさを ぼうしに かえるように、えらんだ 中身を かえるよ。'),
      E('p','','リストには、中身が 1つずつ ならんでいるよ。「中身を 一つずつ 見る」ブロックでは、前から じゅんに 同じ 動きを するよ。'),
      E('p','','計算や くらべ方の しるしだけを かえても、左右の 中身は のこるよ。'),
      powerHelp,
      E('p','','メモは、あとで 思い出せるように 書く ひとことだよ。動きは かわらないよ。'),
      E('p','','「見た目のコピー」は、見た目と せっていが 同じ 部品を もう1つ 作るよ。本文は もたないよ。「自分のコピーを作る」の コピーは、動いている あいだだけの 部品で、もとの 部品の 本文で 動くよ。'),
      E('p','','「入力を やめる」「入れるのを やめる」「もっていくのを やめる」は、いま している ことを やめるよ。「もとにもどす」は、もう 決めた ことを 1つ もどすよ。'));
    paletteControls.append(help);
    paletteControls.id = viewId + '-palette-tools';
    paletteControls.hidden = true;
    const paletteToggle = button('さがす・作るを ひらく', 'palette-tools-toggle', () => {
      paletteControls.hidden = !paletteControls.hidden;
      paletteToggle.setAttribute('aria-expanded', String(!paletteControls.hidden));
      paletteToggle.textContent = paletteControls.hidden ? 'さがす・作るを ひらく' : 'さがす・作るを たたむ';
    });
    paletteToggle.setAttribute('aria-expanded', 'false');
    paletteToggle.setAttribute('aria-controls', paletteControls.id);
    const paletteTools = E('div', 'blockui-palette-tools');
    paletteTools.append(paletteToggle, paletteControls);
    palette.append(paletteTools, categorySelect, paletteList);
    layout.append(palette, workspaceShell);
    root.append(layout);
    const promptArea = E('div', 'blockui-replacement');
    root.append(promptArea);
    listen(workspace, 'scroll', () => {
      const current = session();
      const owner = current?.ownerKey === displaySession?.ownerKey ? current : displaySession;
      if (owner)
        owner.scrollState = {
          ...owner.scrollState,
          blockTop: workspace.scrollTop,
          blockLeft: workspace.scrollLeft,
        };
      for (const menu of workspace.querySelectorAll('.blockui-actions[open]'))
        placeActions(menu, menu.querySelector('.blockui-action-items'));
      placeControls();
      placeNodeToolsSoon();
    });
    // While the workspace scrolls, the selected block's tools are placed at most once a frame, and only while that block
    // is in view (PERF-06): placing them reads the box of every block.
    let toolsFrame = null;
    function placeNodeToolsSoon() {
      if (toolsFrame !== null) return;
      toolsFrame = doc.defaultView.requestAnimationFrame(() => {
        toolsFrame = null;
        const box = workspace.querySelector('.blockui-node.blockui-selected')?.getBoundingClientRect(), room = workspace.getBoundingClientRect();
        if (box && box.bottom > room.top && box.top < room.bottom) placeNodeTools();
      });
    }
    listen(doc.defaultView, 'resize', () => {
      for (const menu of workspace.querySelectorAll('.blockui-actions[open]')) menu.open = false;
      placeControls();
    });
    // The controls are fixed to the window, so they follow the page and the editor when either scrolls.
    listen(doc, 'scroll', (event) => { if (event.target !== workspace) placeControls(); }, { capture: true, passive: true });
    function rememberViewState(owner = displaySession) {
      if (owner)
        owner.scrollState = {
          ...owner.scrollState,
          blockTop: workspace.scrollTop,
          blockLeft: workspace.scrollLeft,
          blockZoom: zoom,
          blockBodyPages: [...bodyPages],
          blockExtraPages: [...bodyExtraPages].map(([key, pages]) => [key, [...pages]]),
          blockInputPages: [...inputPages],
          blockCollapsed: [...collapsed],
          blockOpenAnnotations: [...openAnnotations],
        };
    }
    listen(search, 'input', () => {
      searchText = search.value;
      paletteList.scrollTop = 0;
      renderPalette();
    });
    // Enter puts the first block that can go in the chosen place there and returns to it; ↓ goes to the list (E-16).
    // The Enter that ends a kana-kanji conversion is not this Enter.
    listen(search, 'keydown', (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      const first = [...paletteList.querySelectorAll('.blockui-palette-item > button')]
        .find(b => !b.disabled && b.getAttribute('aria-disabled') !== 'true');
      if (event.key === 'Enter' && first) { event.preventDefault(); event.stopPropagation(); first.click(); }
      else if (event.key === 'ArrowDown' && first) { event.preventDefault(); event.stopPropagation(); first.focus(); }
    });
    // ↑ and ↓ move along the list; ↑ on the first block goes back to the search field.
    listen(paletteList, 'keydown', (event) => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key) || !event.target.matches('.blockui-palette-item > button')) return;
      const items = [...paletteList.querySelectorAll('.blockui-palette-item > button')], at = items.indexOf(event.target);
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'ArrowDown') items[Math.min(items.length - 1, at + 1)]?.focus();
      else if (at <= 0) { if (paletteControls.hidden) paletteToggle.click(); search.focus(); } else items[at - 1].focus();
    });
    listen(modeSelect, 'change', () => {
      paletteMode = modeSelect.value;
      category = '';
      categoryExplicit = false;
      renderPalette();
    });
    listen(outside, 'change', () => {
      showOutside = outside.checked;
      renderPalette();
    });
    function normalizedResult(result) {
      if (result === false) return { ok: false, error: 'うまく できなかったよ。もう一度 やってみてね' };
      return result && typeof result === 'object'
        ? result
        : { ok: true, changed: result !== false };
    }
    function operate(op, { fromPending = false } = {}) {
      if (isLocked()) {
        announce('動いている ときや じゅんびの とちゅうは、ブロックを かえられないよ。「■ 止める」を おしてから なおしてね', true);
        return { ok: false, reason: 'いまは ブロックを なおせないよ' };
      }
      if (!fromPending) {
        const ready = flush();
        if (!ready.ok) return ready;
      }
      const owner = session()?.ownerKey;
      let result;
      committing = true;
      try {
        result = normalizedResult(onOperation(op));
        if (result && typeof result.then === 'function')
          throw Error('ブロック編集の確定は同期処理が必要です');
      } catch (error) {
        result = { ok: false, error };
      } finally {
        committing = false;
      }
      if (!result.ok) {
        announce(errorText(result.error || result.reason), true);
        return result;
      }
      if (session()?.ownerKey !== owner) {
        const transition=result.ownerTransition;
        if(transition?.from!==owner||transition.to!==session()?.ownerKey){
          announce('なおしていた ところが かわったよ。もう一度 やってね', true);
          return { ok: false, reason: 'なおしていた ところが かわったよ。もう一度 やってね' };
        }
        // Persisting a new event gives the same document its permanent key.
        if(displaySession?.ownerKey===owner)displaySession={...displaySession,ownerKey:transition.to};
      }
      announce(result.changed === false ? '中身は かわっていないよ'
        : ['insert', 'wrap', 'expression', 'variadic-insert'].includes(op.type) ? 'ブロックを 入れたよ'
        : ['remove', 'variadic-remove'].includes(op.type) ? 'ブロックを けしたよ'
        : ['move', 'move-run'].includes(op.type) ? 'ブロックを もっていったよ' : op.type === 'duplicate' ? 'ブロックを もう1つ 作ったよ' : 'ブロックを かえたよ');
      if (!fromPending) render({ force: true });
      return result;
    }
    // A touch test names the stage edge as 端 and its sides as 端:上 …. The block shows and accepts the words the code
    // writes (画面のはし, 画面の下のはし …); other text slots keep what is written.
    function edgeSlot(node, field) {
      if (node?.schemaId !== 'StringLiteral' || field?.key !== 'value') return false;
      return index.get(index.get(node.id)?.parentId)?.node?.schemaId === 'SensorRead:TOUCHING';
    }
    // A key (「スペース」キーがおされている, おされたキーが「エンター」) is shown by its keyboard name, as the code writes it
    // (F-34), and what is typed is read as the code reads it: スペース is the key 空白, Ａ is a.
    function keySlot(node, field) {
      return field?.key === 'value' && !!node && keyLiteralAt(index, node.id);
    }
    function edgeShown(node, field, value) {
      return edgeSlot(node, field) && isEdgeTarget(value) ? EDGE_TARGETS[value] : keySlot(node, field) ? keySurface(value) : value;
    }
    function edgeStored(node, field, value) {
      if (keySlot(node, field) && typeof value === 'string') return keyName(value);
      const written = String(value).trim().replace(/端$/, 'はし'), edge = edgeSlot(node, field) && Object.keys(EDGE_TARGETS).find(key => EDGE_TARGETS[key] === written);
      return edge || value;
    }
    // A number that cannot be read is answered under its field with an example for the unit written after it (F-16).
    const NUMBER_EXAMPLES = [['秒', '1、0.5'], ['歩', '10、-10'], ['度', '90、45'], ['回', '3、10'], ['％', '100、50'], ['Hz', '440、880'], ['番目', '1、2']];
    function numberExample(input) {
      const after = input.closest('.blockui-input-slot')?.nextElementSibling,
        unit = after?.classList.contains('blockui-unit-text') ? after.textContent.trim() : '';
      return NUMBER_EXAMPLES.find(([u]) => unit.startsWith(u))?.[1] || '10、0.5';
    }
    function readInputValue(input, field) {
      if (field.type === 'boolean') return input.value === 'true';
      if (field.type === 'qualifier') return input.value === 'none' ? null : input.value;
      if (field.type === 'number') {
        const text = normalizeCharsOutsideString(input.value).replace(/[－−]/g, '-').replace(/＋/g, '+');
        if (
          !/^[+-]?[0-9]+(?:\.[0-9]+)?$/.test(text) ||
          !Number.isFinite(Number(text))
        )
          throw Error('数だけを 入れてね。れい：' + numberExample(input));
        return Number(text);
      }
      return input.value;
    }
    let pressing = false;
    listen(root, 'pointerdown', () => { pressing = true; }, { capture: true });
    for (const type of ['pointerup', 'pointercancel']) listen(doc.defaultView, type, () => { pressing = false; }, { capture: true });
    function flushToTarget(next) {
      // A number that cannot be read is given up when another field is entered: its field shows the value it had, and
      // the new input starts without the old mistake (E-12).
      if (pending && next !== pending.input && next?.matches?.('input,textarea,select') && root.contains(next) &&
          !next.closest('dialog') && !readable(pending)) {
        dropPending();
        announce('');
        return { ok: true };
      }
      // Keep the incoming control alive until it receives its native click or
      // input. A blur commit must not replace that control during focus transfer.
      deferredFocus = next && root.contains(next) ? next : null;
      const ready = flush({ focus: false });
      if (!ready.ok) deferredFocus = null;
      return ready;
    }
    function syncDeferredTree() {
      const latest = getTree(session());
      if (latest === tree) return;
      tree = latest;
      index = tree ? buildBlockIndex(tree) : new Map();
      availabilityCache.clear();
    }
    function editInput(input, node, field, annotation = false) {
      const original = () => {
        const current = index.get(node.id)?.node || node;
        return annotation ? current.annotations[field.key]
          : input.dataset.signedParentId ? -current.fields[field.key] : current.fields[field.key];
      };
      const read = () => edgeStored(node, field, readInputValue(input, field));
      const refresh = () => {
        if (rendering || committing || !input.isConnected) return;
        if (deferredFocus === input) deferredFocus = null;
        if (deferredRender) syncDeferredTree();
        if (!pending || pending.input !== input) {
          const f = flush();
          if (!f.ok && pending?.input !== input) {
            input.value = String(edgeShown(node, field, original()) ?? '');
            pending?.input?.focus();
            return;
          }
        }
        const previous = pending?.input === input ? pending : null;
        if (!previous) announce('');
        pending = {
          input,
          id: node.id,
          key: field.key,
          field,
          annotation,
          ownerKey: previous?.ownerKey ?? session()?.ownerKey,
          sourceRevision: previous?.sourceRevision ?? session()?.sourceRevision,
          contextRevision: previous?.contextRevision ?? session()?.contextRevision,
          original:original(),
          composing: input.dataset.composing === 'true',
          read,
          error: '',
          invalid: false,
          // A mistake shown under the field stays while the field keeps the value it was shown for.
          shown: previous?.shown && previous.shownValue === input.value,
          shownValue: previous?.shownValue,
        };
        try {
          read();
        } catch (error) {
          pending.error = error.message;
          pending.invalid = true;
        }
        input.setAttribute('aria-invalid', pending.error ? 'true' : 'false');
        notifyPending();
        updateControls();
      };
      listen(input, 'input', refresh);
      listen(input, 'compositionstart', () => {
        input.dataset.composing = 'true';
        refresh();
      });
      listen(input, 'compositionend', () => {
        input.dataset.composing = 'false';
        refresh();
      });
      listen(input, 'change', () => {
        refresh();
        if (input.tagName === 'SELECT') flush();
      });
      listen(input, 'blur', (event) => {
        if (rendering || committing || !input.isConnected) return;
        if (pending?.input === input && !event.relatedTarget?.closest('#uiLevel,#tutorialExit,#tutorialStart,[data-blockui-action="cancel"],[data-blockui-action="edit-text"],[data-blockui-text-action],[data-blockui-value-type]'))
          flushToTarget(event.relatedTarget);
      });
      listen(input, 'keydown', (event) => {
        if (event.isComposing || input.dataset.composing === 'true') return;
        if (event.key === 'Enter' && input.tagName !== 'TEXTAREA') {
          event.preventDefault();
          event.stopPropagation();
          flush({explicit:true});
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancelField();
        }
      });
    }
    function flush({ focus = true, explicit = false } = {}) {
      if (destroyed) return { ok: true };
      if (drag?.started || replacement)
        return {
          ok: false,
          pending: true,
          reason: replacement
            ? 'もとの ばしょに 入れる ブロックを えらぶか、「' + cancelLabel() + '」を おしてね'
            : 'ブロックを おく ところで はなしてね。やめるときは Esc キーを おしてね',
        };
      if (!pending) return { ok: true };
      const p = pending;
      if(p.field.type==='heading'&&!explicit){
        const reason='いつ動くかを えらんだら「この 本文の きっかけを かえる」を おしてね';
        announce(reason,true);return {ok:false,pending:true,reason};
      }
      // A mistake found when the input is to be decided is shown right under the field (E-12).
      const refused = (message) => {
        p.error = message;
        p.shown = true;
        p.shownValue = p.input.value;
        notifyPending();
        announce(p.error, true);
        updateControls();
        return { ok: false, pending: true, reason: p.error };
      };
      if (p.composing || p.input.dataset.composing === 'true')
        return refused('日本語の へんかんを おわらせてから、もう一度 やってね');
      if (session()?.ownerKey !== p.ownerKey)
        return refused('入れている とちゅうで、なおしていた ところが かわったよ。「決める」を おすか、「' + cancelLabel() + '」を おしてね');
      if (
        session()?.sourceRevision !== p.sourceRevision ||
        session()?.contextRevision !== p.contextRevision
      ) {
        return refused('入れている とちゅうで、本文や まわりが かわったよ。「' + cancelLabel() + '」を おして、もう一度 あいている ところを えらんでね');
      }
      let value;
      try {
        value = p.read();
      } catch (error) {
        p.invalid = true;
        p.input.setAttribute('aria-invalid', 'true');
        if (focus) p.input.focus();
        return refused(error.message);
      }
      if (Object.is(value, p.original)) {
        pending = null;
        notifyPending();
        updateControls();
        return { ok: true, changed: false };
      }
      let op = { type: p.annotation ? 'annotation' : 'field', id: p.id, key: p.key, value };
      if(p.field.type==='heading'&&p.input.dataset.triggerMetadataOnly==='true')op.preserveBody=true;
      if (!p.annotation && p.field.type === 'number' &&
        (p.input.dataset.expressionHole || p.input.dataset.signedParentId || value < 0 || Object.is(value, -0))) {
        const literal = createBlock('NumberLiteral');
        literal.fields.value = Math.abs(value);
        let replacement = literal;
        if (value < 0 || Object.is(value, -0)) {
          replacement = createBlock('UnaryExpression:NEG');
          replacement.inputs.value.fields.value = Math.abs(value);
        }
        op = p.input.dataset.signedParentId && (value < 0 || Object.is(value,-0))
          ? {type:'field',id:p.id,key:p.key,value:Math.abs(value)}
          : { type: 'replace', id: p.input.dataset.signedParentId || p.id, node: replacement };
      }
      if (p.field.type === 'comment' && /[\r\n]/.test(value))
        op = { type: 'comment-lines', id: p.id, lines: value.replace(/\r\n?/g, '\n').split('\n') };
      const result = operate(op, { fromPending: true });
      if (!result.ok) {
        p.input.setAttribute('aria-invalid', 'true');
        if (focus) p.input.focus();
        return { ...result, ...refused(errorText(result.error || result.reason)) };
      }
      pending = null;
      notifyPending();
      render({ force: true });
      if(focus&&p.field.type==='number'&&op.type==='replace'){
        const node=index.get(session()?.blockSelection)?.node,
          literal=node?.schemaId==='UnaryExpression:NEG'?node.inputs.value:node,
          control=[...workspace.querySelectorAll('[data-focus-key]')].find(n=>n.dataset.focusKey===literal?.id+':field:value');
        control?.focus({preventScroll:true});
        if(control?.setSelectionRange)control.setSelectionRange(p.input.selectionStart,p.input.selectionEnd,p.input.selectionDirection);
      }
      return { ok: true, changed: result.changed !== false };
    }
    function readable(p) {
      try { p.read(); return true; } catch (_) { return false; }
    }
    // Gives up the value being typed: the field shows the value it had again.
    function dropPending() {
      const field = pending;
      pending = null;
      if (field?.input?.isConnected) {
        field.input.value = field.field.type === 'qualifier' ? field.original ?? 'none'
          : field.field.type === 'number' ? field.original === undefined ? '' : decimalSource(field.original) : edgeShown(index.get(field.id)?.node, field.field, field.original) ?? '';
        field.input.setAttribute('aria-invalid', 'false');
        if (field.input.tagName === 'INPUT') field.input.title = field.input.value;
        // A surface left open for a field that no longer has the focus closes with it.
        if (field.input !== doc.activeElement) field.input.closest('.blockui-editing-field')?.classList.remove('blockui-editing-field');
      }
      notifyPending();
      updateControls();
      scheduleGeometry();
    }
    function cancelField() {
      dropPending();
      announce('入れるのを やめたよ。組み立てていた ブロックは のこっているよ');
      return { ok: true };
    }
    // One やめる per state, named by what it stops (F-23): a block put in that still has holes, the input being typed, a
    // block being moved, or the place chosen for the next block.
    function cancelLabel() {
      return session()?.blockDraft ? '入れるのを やめる' : pending ? '入力を やめる' : replacement || moving ? 'もっていくのを やめる' : '入れるのを やめる';
    }
    function cancel() {
      const stopped = cancelLabel().replace(/やめる$/, 'やめたよ');
      const field = pending;
      pending = null;
      destination = null;
      replacement = null;
      moving = null;
      cancelDrag();
      const draft = session()?.blockDraft;
      if (draft) {
        Object.assign(session(), draft.baseline, { blockDraft: null, pendingEdit: null });
        availabilityCache.clear();
      }
      onPending(null);
      onCancel();
      if (field?.input?.isConnected) {
        const value = field.original;
        field.input.value =
          field.field.type === 'qualifier'
            ? value === null
              ? 'none'
              : value
            : field.field.type === 'number'
              ? decimalSource(value)
              : String(value ?? '');
        field.input.setAttribute('aria-invalid', 'false');
      }
      announce(stopped);
      render({ force: true });
      // The pressed やめる is no longer shown: the keys stay in the block view, not on the page (E2-01).
      if (!doc.activeElement || doc.activeElement === doc.body) keepKeys();
      return { ok: true };
    }
    function destinationDescription() {
      const parent = index.get(destination?.parentId)?.node, schema = schemaOf(parent);
      if (destination?.input) {
        const input = schema?.inputs.find(s => s.key === destination.input);
        return (input?.label || 'あいている ところ') + 'に 入れる ブロックを えらんでいるよ。つなぐブロックを ふやすときは「＋ ここに入れる」を おしてね';
      }
      if (destination?.body) {
        const body = schema?.bodies.find(s => s.key === destination.body);
        const place = parent?.schemaId === 'Script' ? '本文' : (schema?.label || 'まとまり') + 'の「' + (body?.label || '中') + '」';
        return place + 'の' + (destination.index + 1) + '番目に ブロックを 入れるよ';
      }
      return '入れる ばしょを えらんでね';
    }
    function updateControls() {
      if (deferredFocus?.isConnected && root.contains(deferredFocus)) return;
      commitButton.hidden = !pending;
      commitButton.disabled = isLocked() || !pending;
      const draft = session()?.blockDraft;
      cancelButton.disabled = !pending && !moving && !drag && !replacement && !destination && !draft;
      cancelButton.textContent = cancelLabel();
      // While a block is only being carried, what it does is shown by the pointer (E-04): no controls cover the blocks.
      controls.hidden = !pending && !moving && !replacement && !destination && !draft;
      root.classList.toggle('blockui-interacting', !controls.hidden);
      root.classList.toggle('blockui-moving', !!moving || !!drag?.started);
      // While a place for a sentence is chosen or a sentence is moved, the places between blocks open up (E-07); the
      // chosen place, or the block being moved, stays where it is on the screen.
      const choosing = !!destination?.body, movingBlock = !!moving && schemaOf(index.get(moving.id)?.node)?.category === 'statement',
        opens = choosing || movingBlock, changes = opens !== root.matches('.blockui-choosing,.blockui-moving-block'),
        anchor = !changes ? null : !opens ? openAnchor : movingBlock ? locationElement({ id: moving.id })
          : [...world.querySelectorAll('[data-blockui-body]')].find(n => sameLocation(destination, locationFromElement(n)));
      keepInView(anchor, () => {
        root.classList.toggle('blockui-choosing', choosing);
        root.classList.toggle('blockui-moving-block', movingBlock);
      });
      if (changes) openAnchor = opens ? anchor : null;
      if (!opens && !drag?.started) planeFloor = 0;
      fieldError.textContent = pending?.shown && pending.error || '';
      if (pending?.input) {
        const described = (pending.input.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== fieldError.id);
        if (pending.shown && pending.error) described.push(fieldError.id);
        if (described.length) pending.input.setAttribute('aria-describedby', described.join(' '));
        else pending.input.removeAttribute('aria-describedby');
      }
      destinationLabel.textContent = replacement
        ? 'もとの ばしょに 入れる ブロックを えらんでね'
        : moving
          ? moving.type === 'run'
            ? 'この ブロックから 下の ' + runIds(moving.id).length + 'この ブロックを もっていく ところを えらんでね'
            : 'どこへ もっていくか えらんでね'
          : destination?.input
            ? destinationDescription()
            : destination?.body
              ? destinationDescription()
              : draft ? 'あいている ところを えらんで、ブロックを 入れてね' : '入れたら「決める」を おしてね';
      placeControls();
    }
    // The floating controls never take a row of their own, so nothing moves (E-12). They go right under the field being
    // edited (above it when the window ends below), unless they would cover something to press there and another place
    // near the field is free (until a mistake is shown). While a place is chosen, a block is moved or an enclosure waits for
    // what goes in it, they go in the free middle of the row above the workspace (options.controlsSpace), else in a
    // corner of the workspace where they cover no block, else over its top left.
    function placeControls() {
      if (controls.hidden || !root.getBoundingClientRect().width) return;
      // While a press is held they stay where they are, so a press that ends a field's input never lands on them.
      if (pressing && controls.style.getPropertyValue('--blockui-controls-top')) return;
      const view = doc.documentElement, room = workspace.getBoundingClientRect(),
        w = controls.offsetWidth || 300, h = controls.offsetHeight || 40,
        field = pending?.input?.isConnected && !pending.input.closest('dialog') ? pending.input.getBoundingClientRect() : null;
      // Lying over the blocks under a field, only 決める and やめる take a press: a press on the words (a mistake shown)
      // reaches the field under them, so another field starts its input and the old number goes back (LANGUAGE.md 242).
      controls.style.pointerEvents = field?.width ? 'none' : '';
      let spot;
      if (field?.width) {
        const under = field.bottom + 4 + h <= view.clientHeight - 4 ? field.bottom + 4 : Math.max(4, field.top - h - 4);
        spot = { x: field.left, y: under };
        // Before a mistake is shown they may go where they cover nothing to press (a 「＋ ここに入れる」, a field, a choice
        // or a button of the blocks; the thin lines between blocks may be covered): right above the field, or at the
        // right end of the workspace under or above it. A mistake is always shown right under the field.
        if (!(pending.shown && pending.error)) {
          const own = pending.input.closest('.blockui-field') || pending.input,
            marks = [...world.querySelectorAll('.blockui-insertion, input, select, textarea, summary, button')]
              .filter(n => !own.contains(n) && n.checkVisibility?.({ visibilityProperty: true }) !== false)
              .map(n => n.getBoundingClientRect()).filter(b => b.width && b.height >= 12),
            at = (x) => Math.max(4, Math.min(x, view.clientWidth - w - 4)),
            free = ([x, y]) => y >= Math.max(4, room.top) && y + h <= Math.min(room.bottom, view.clientHeight - 4) &&
              !marks.some(b => b.right > x && b.left < x + w && b.bottom > y && b.top < y + h),
            far = room.left + workspace.clientWidth - 8 - w, above = field.top - h - 4,
            best = [[at(field.left), under], [at(field.left), above], [at(far), under], [at(far), above]].find(free);
          if (best) spot = { x: best[0], y: best[1] };
        }
      } else {
        const free = options.controlsSpace?.();
        spot = free && free.right - free.left >= w
          ? { x: free.left, y: free.top + Math.max(0, (free.bottom - free.top - h) / 2) }
          : freeCorner(room, w, h) || { x: room.left + 8, y: room.top + 6 };
      }
      // The controls are fixed to the window: they may lie over the row above the workspace, outside the editor's box.
      const x = Math.round(Math.max(4, Math.min(spot.x, view.clientWidth - w - 4))), y = Math.round(spot.y);
      controls.style.setProperty('--blockui-controls-left', x + 'px');
      controls.style.setProperty('--blockui-controls-top', y + 'px');
      // A transformed ancestor (a dialog) moves what is fixed: correct by what is measured.
      const r = controls.getBoundingClientRect();
      if (Math.abs(r.left - x) > 0.5 || Math.abs(r.top - y) > 0.5) {
        controls.style.setProperty('--blockui-controls-left', Math.round(2 * x - r.left) + 'px');
        controls.style.setProperty('--blockui-controls-top', Math.round(2 * y - r.top) + 'px');
      }
      clearOfControls();
    }
    // The selected field's tools never lie under 決める and やめる: they go down below them.
    function clearOfControls() {
      if (controls.hidden) return;
      const c = controls.getBoundingClientRect();
      for (const head of workspace.querySelectorAll('.blockui-input-slot.blockui-slot-active > .blockui-slot-head')) {
        const r = head.getBoundingClientRect();
        if (!r.width || r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom) continue;
        head.style.top = (parseFloat(doc.defaultView.getComputedStyle(head).top) || 0) + (c.bottom + 4 - r.top) / zoom + 'px';
      }
    }
    // A corner of the workspace (top right, bottom right, bottom left) where a w × h box covers no block, no hole and no
    // 「＋ ここに入れる」 at the end of a body.
    function freeCorner(room, w, h) {
      const blockers = [...world.querySelectorAll('.blockui-statement, .blockui-event-hat, .blockui-insertion-end, .blockui-hole-target, .blockui-chosen-destination')]
        .map(n => n.getBoundingClientRect()).filter(b => b.width && b.bottom > room.top && b.top < room.bottom);
      const right = room.left + workspace.clientWidth - 8 - w, bottom = room.top + workspace.clientHeight - 6 - h;
      for (const c of [{ x: right, y: room.top + 6 }, { x: right, y: bottom }, { x: room.left + 8, y: bottom }])
        if (c.x >= room.left && c.y >= room.top && blockers.every(b => b.right <= c.x || b.left >= c.x + w || b.bottom <= c.y || b.top >= c.y + h))
          return c;
      return null;
    }
    function listLocation(info) {
      return info?.body
        ? { parentId: info.parentId, body: info.body, index: info.index }
        : info?.input
          ? {
              parentId: info.parentId,
              input: info.input,
              ...(info.index === null ? {} : { index: info.index }),
            }
          : null;
    }
    function selection(id, location = null) {
      selected = id;
      if (session()) {
        session().blockSelection = id;
        session().blockSelectionLocation = location
          ? { id, key: session().ownerKey, ...location }
          : null;
      }
      for (const n of workspace.querySelectorAll('.blockui-node'))
        n.classList.toggle('blockui-selected', n.dataset.blockId === id);
      showImpliedDestination();
      placeNodeTools();
      if (!id) for (const n of workspace.querySelectorAll('.blockui-focused')) n.classList.remove('blockui-focused');
      for (const menu of workspace.querySelectorAll('.blockui-actions[open]'))
        if (menu.closest('.blockui-node')?.dataset.blockId !== id) menu.open = false;
      for(const slot of workspace.querySelectorAll('.blockui-slot-active'))slot.classList.remove('blockui-slot-active');
      // A number that is its own field in the sentence (1 秒, E-02) has its tools on its own place: the field being
      // edited keeps them while its sentence is the selected block.
      const selectedNode=[...workspace.querySelectorAll('.blockui-node')].find(n=>n.dataset.blockId===id),active=doc.activeElement,
        flat=selectedNode&&active?.matches?.('input,textarea')&&selectedNode.contains(active)?active.closest('.blockui-flat-value'):null,
        slot=selectedNode?.parentElement.closest('.blockui-input-slot')||(flat?.closest('.blockui-node')===selectedNode?flat:null);
      if(slot){slot.classList.add('blockui-slot-active');doc.defaultView.requestAnimationFrame(()=>placeSlotHead(slot));}
    }
    // With nothing selected the next block from the list goes to the end of the body (E-08); the focus goes to the
    // workspace, so Delete has no block to take.
    function letGoOfSelection() {
      if (!selected) return false;
      selection('');
      if (doc.activeElement?.closest?.('.blockui-world')) workspace.focus({ preventScroll: true });
      return true;
    }
    // The floating tools (E-12) go beside the sentence they belong to, right of its whole block (an enclosure with what
    // is in it), where they cover no other block: first the selected block's tools, under them the selected field's
    // tools, under those the tools of a selected value. With no room on the right a block's tools go right above it.
    // A text field's editing surface lies over the blocks: its field's tools go on its line when they fit there. Else a
    // field's tools go beside the sentence, under the field, under the whole sentence or right above the field, where
    // they cover no value of this sentence or of another block (else where they cover the fewest).
    function placeNodeTools() {
      const room = workspace.getBoundingClientRect(),
        box = workspace.querySelector('.blockui-node.blockui-selected'), head = box?.querySelector(':scope > .blockui-node-head'),
        slot = workspace.querySelector('.blockui-input-slot.blockui-slot-active'), slotHead = slot?.querySelector(':scope > .blockui-slot-head'),
        editing = workspace.querySelector('.blockui-field.blockui-editing-field');
      const ownerOf = (el) => el?.closest('.blockui-statement') || el?.closest('.blockui-node');
      const lineOf = (owner) => owner?.querySelector(':scope > .blockui-node-content > .blockui-node-main') || owner;
      // Moves an absolutely placed element so that its top left is at (x, y) on the screen; the world may be zoomed.
      const moveTo = (el, x, y) => {
        const cs = doc.defaultView.getComputedStyle(el), r = el.getBoundingClientRect();
        el.style.left = (parseFloat(cs.left) || 0) + (x - r.left) / zoom + 'px';
        el.style.top = (parseFloat(cs.top) || 0) + (y - r.top) / zoom + 'px';
      };
      for (const el of [head, slotHead]) if (el) { el.style.left = el.style.top = el.style.transform = el.style.maxWidth = ''; }
      box?.classList.remove('blockui-tools-above');
      const showsSlotHead = !!slotHead?.getClientRects().length,
        inline = !!editing && showsSlotHead && slot.contains(editing) && sizeEditingField(editing, slotHead.getBoundingClientRect().width);
      if (editing && !inline) sizeEditingField(editing);
      // What an element covers on the screen, with the editing surface of a text field in it.
      const surface = editing ? [...editing.querySelectorAll(':scope > input, :scope > textarea, :scope > .blockui-edit-text')] : [];
      const extent = (el) => {
        const r = el.getBoundingClientRect(), e = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        if (editing && el.contains(editing))
          for (const s of surface.map(n => n.getBoundingClientRect()).filter(s => s.width)) {
            e.left = Math.min(e.left, s.left); e.top = Math.min(e.top, s.top);
            e.right = Math.max(e.right, s.right); e.bottom = Math.max(e.bottom, s.bottom);
          }
        return e;
      };
      const fits = (owner, el) => extent(owner).right + 8 + el.getBoundingClientRect().width <= room.right - 8;
      // The other blocks (not the selected one, what is in it or what holds it) and the places to put a block in (「＋ ここに
      // 入れる」 and the lines between blocks) must stay free to press.
      const blockers = box ? [...world.querySelectorAll('.blockui-statement, .blockui-event-hat, .blockui-insertion')].filter(n => !box.contains(n) && !n.contains(box)) : [];
      const clear = (r, places = true) => r.right <= room.right - 4 && blockers.every(n => {
        if (!places && n.classList.contains('blockui-insertion')) return true;
        const b = n.getBoundingClientRect();
        return !b.width || b.right <= r.left || b.left >= r.right || b.bottom <= r.top + 1 || b.top >= r.bottom - 1;
      });
      // The fields, choices, 「…」 and buttons of the blocks (and the value places that hold none) and the other floating
      // tools, which a field's or a value's tools must not cover; what belongs to the tools' own field or value is not
      // counted. Lying over the other tools counts as covering three of them.
      const floating = [head, slotHead].filter(Boolean), meets = (b, r) => b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom;
      let marks = null;
      const covers = (r, own) => (marks ??= [...world.querySelectorAll('input, select, textarea, summary, button:not(.blockui-insertion), .blockui-input-slot:not(:has(input, select, textarea, summary, button))')]
        .filter(n => !floating.some(f => f.contains(n)) && n.checkVisibility?.({ visibilityProperty: true }) !== false)
        .map(n => [n, n.getBoundingClientRect()]).filter(([, b]) => b.width && b.height))
        .filter(([n, b]) => !own.some(o => o.contains(n) || n.contains(o)) && meets(b, r)).length
        + 3 * [...floating, ...surface].filter(f => !own.includes(f) && f.getClientRects().length && meets(f.getBoundingClientRect(), r)).length;
      // Right above a block whose editing surface rises above it, the tools go above the surface.
      const aboveSurface = () => {
        const rise = box.getBoundingClientRect().top - extent(box).top;
        if (rise > 0) head.style.transform = 'translateY(' + -rise / zoom + 'px)';
      };
      // The first of the places that covers nothing, else the one that covers the least.
      const bestOf = (spots, w, h, own) => {
        let best = spots[0], fewest = Infinity;
        for (const spot of spots) {
          const n = covers({ left: spot[0], top: spot[1], right: spot[0] + w, bottom: spot[1] + h }, own);
          if (n < fewest) { best = spot; fewest = n; }
          if (!n) break;
        }
        return best;
      };
      let below = null;
      if (head?.getClientRects().length) {
        const owner = box.classList.contains('blockui-statement') ? box : ownerOf(box.parentElement);
        if (box.classList.contains('blockui-statement') && owner === box) {
          // One row when it fits; else the row wraps into the room left on the right; else right above the block.
          const right = extent(box).right;
          if (right > box.getBoundingClientRect().right + 1) moveTo(head, right + 8, head.getBoundingClientRect().top);
          let r = head.getBoundingClientRect();
          const room2 = room.right - 8 - (right + 8);
          if (r.right > room.right - 4 && room2 >= 120) { head.style.maxWidth = room2 / zoom + 'px'; r = head.getBoundingClientRect(); }
          if (clear(r)) below = { owner: box, top: r.bottom + 4 };
          else {
            const beside = r, besideStyle = [head.style.maxWidth, head.style.left, head.style.top];
            head.style.maxWidth = head.style.left = head.style.top = ''; box.classList.add('blockui-tools-above'); aboveSurface();
            // Right above the block, unless that is out of the workspace (a block at its top edge): then beside it, over
            // a place to put a block in rather than over another block.
            if (head.getBoundingClientRect().top < room.top + 2 && clear(beside, false)) {
              box.classList.remove('blockui-tools-above'); [head.style.maxWidth, head.style.left, head.style.top] = besideStyle; head.style.transform = '';
              below = { owner: box, top: beside.bottom + 4 };
            } else {
              // Right above the block at its left end, else at the right end of the workspace when that covers fewer
              // values of the block above.
              const above = head.getBoundingClientRect(), left = parseFloat(doc.defaultView.getComputedStyle(head).left) || 0,
                far = room.right - 8 - above.width, shifted = { left: far, top: above.top, right: far + above.width, bottom: above.bottom };
              if (far > above.left && covers(above, [box, head]) && covers(shifted, [box, head]) < covers(above, [box, head]))
                head.style.left = left + (far - above.left) / zoom + 'px';
            }
          }
        }
      }
      if (showsSlotHead) {
        const owner = ownerOf(slot), sr = extent(slot), hr = slotHead.getBoundingClientRect(), w = hr.width, h = hr.height;
        if (inline) {
          const line = editing.querySelector(':scope > input, :scope > textarea').getBoundingClientRect();
          moveTo(slotHead, sr.right + 8, line.top + Math.max(0, (Math.min(line.height, 60 * zoom) - h) / 2));
          // A selected value's tools go after them on that line, or right above the value.
          surface.push(slotHead);
        } else {
          // Beside the sentence (under the block's tools when they are there, else above them or after them), under the
          // field, under the whole sentence (a long value wraps the rest of the sentence onto the next line), right
          // above the field.
          const x = Math.max(room.left + 8, Math.min(sr.left, room.right - 8 - w)),
            tools = below?.owner === owner ? head.getBoundingClientRect() : null,
            beside = owner && fits(owner, slotHead) ? [extent(owner).right + 8, tools ? below.top : lineOf(owner).getBoundingClientRect().top + 4] : null,
            besides = [beside, beside && tools && [beside[0], tools.top - h - 4], tools && tools.right + 8 + w <= room.right - 8 && [tools.right + 8, tools.top]].filter(Boolean),
            far = Math.max(x, room.right - 8 - w), tops = [sr.bottom + 4, lineOf(owner).getBoundingClientRect().bottom + 4, sr.top - h - 4],
            // At the field's left first; at the right end of the workspace when that covers a value there.
            spot = bestOf([...besides, ...tops.map(top => [x, top]), ...(far > x ? tops.map(top => [far, top]) : [])], w, h, [slot, slotHead]);
          moveTo(slotHead, ...spot);
          if (besides.includes(spot)) below = { owner, top: Math.max(tools?.bottom ?? 0, slotHead.getBoundingClientRect().bottom) + 4 };
        }
      }
      if (head?.getClientRects().length && box.classList.contains('blockui-expression')) {
        const owner = ownerOf(box.parentElement), r = head.getBoundingClientRect(),
          spot = owner && fits(owner, head) ? [extent(owner).right + 8, below?.owner === owner ? below.top : lineOf(owner).getBoundingClientRect().top + 4] : null;
        if (spot && !covers({ left: spot[0], top: spot[1], right: spot[0] + r.width, bottom: spot[1] + r.height }, [box, head])) moveTo(head, ...spot);
        else { box.classList.add('blockui-tools-above'); aboveSurface(); }
      }
      clearOfControls();
    }
    // The editing surface of a text field reaches toward the right end of the workspace, at most 672 px wide, with room
    // for 「全部見て なおす」 (E-12). Given the width of the field's tools, it also leaves room for them on its line when
    // the surface keeps at least 200 px; it says whether it did. A tall surface (a メモ) opens upward when it would
    // reach below the workspace, so typing never scrolls the blocks.
    function sizeEditingField(field, tools = 0) {
      const box = field.getBoundingClientRect(), bounds = workspace.getBoundingClientRect(),
        editText = field.querySelector(':scope > .blockui-edit-text'),
        button = editText?.getClientRects().length ? editText.getBoundingClientRect().width + 6 : 0,
        room = Math.min(bounds.left + workspace.clientWidth, doc.defaultView.innerWidth) - box.left - button - 18,
        inline = tools > 0 && room - tools - 8 >= 200, area = field.querySelector(':scope > textarea');
      field.style.setProperty('--blockui-edit-width', Math.max(100, Math.min(672, inline ? room - tools - 8 : room)) / zoom + 'px');
      if (area) {
        const height = area.getBoundingClientRect().height, top = bounds.top + 24, bottom = bounds.top + workspace.clientHeight - 24;
        field.classList.toggle('blockui-editing-up', box.top + height > bottom && box.bottom - height >= top);
      }
      return inline;
    }
    // The place a block from the list would go (right after the selected sentence) is shown on its line (E-08).
    function showImpliedDestination() {
      const implied = !destination && !moving && selectedStatement() && defaultDestination();
      for (const n of workspace.querySelectorAll('.blockui-insertion,.blockui-hole-target'))
        n.classList.toggle('blockui-implied-destination', !!implied && sameLocation(implied, locationFromElement(n)));
    }
    // A place chosen with the keyboard (Enter on 「＋ ここに入れる」) opens 「ブロックを さがす」 to type in (E-16).
    function chooseDestination(location, { keyboard = false } = {}) {
      if (isLocked()) return;
      const ready = flush();
      if (!ready.ok) return;
      if (moving) {
        completeMove(location);
        return;
      }
      destination = { ...location };
      const modeChanged = paletteMode !== 'all' && paletteMode !== (location.body ? 'statement' : 'expression');
      if (modeChanged) paletteMode = 'all';
      renderPalette();
      updateControls();
      for (const n of workspace.querySelectorAll('[data-blockui-drop]'))
        n.classList.toggle(
          'blockui-chosen-destination',
          sameLocation(location, locationFromElement(n)),
        );
      announce(destinationDescription() + (modeChanged ? ' 「ブロックの しゅるい」を「すべてのブロック」に かえたよ。なかまと さがす ことばは そのままだよ。' : ''));
      if(options.tutorialActive?.())options.onDestinationSelected?.({...location});
      else {
        if (keyboard && paletteControls.hidden) paletteToggle.click();
        // The last word is kept, selected, so a new word typed replaces it (E-01, E-16).
        search.focus({ preventScroll: true });
        search.select();
      }
    }
    // A block put in from the list with no place chosen goes right after the selected sentence, or at the end of the
    // body when nothing is selected (E-08). A selected enclosure that holds only its hole (a loop just put in) takes the
    // block into that hole.
    function defaultDestination() {
      const info = selectedStatement(), first = info && schemaOf(info.node)?.bodies?.[0]?.key, inner = first && info.node.bodies?.[first];
      if (inner?.length === 1 && inner[0].schemaId === 'Hole:statement') return { parentId: info.node.id, body: first, index: 0 };
      if (info) return { parentId: info.parentId, body: info.body, index: info.index + 1 };
      return tree ? { parentId: tree.id, body: 'body', index: tree.bodies.body.length } : null;
    }
    function selectedStatement() {
      const info = selected && index.get(selected);
      return info?.body && info.parentId && schemaOf(info.node)?.category === 'statement' && !schemaOf(info.node)?.draftOnly ? info : null;
    }
    // An enclosure put where blocks follow takes them into its first body (E-03): a new one, or a moved one whose first
    // body holds no block yet. The count is of the blocks that would go in.
    function wrapCount(schema, node, location, movingId = null) {
      if (!location?.body || !schema?.bodies?.length || schema.category !== 'statement') return 0;
      const inner = node?.bodies?.[schema.bodies[0].key];
      if (inner && inner.some(n => n.schemaId !== 'Hole:statement')) return 0;
      const siblings = index.get(location.parentId)?.node.bodies[location.body] || [];
      if (siblings.length === 1 && siblings[0].schemaId === 'Hole:statement') return 0;
      return siblings.slice(location.index).filter(n => n.id !== movingId).length;
    }
    // After an enclosure goes in, its empty count (or other empty value) takes the typing at once with a mouse or the
    // keyboard; after a touch it only lights up, so the screen keyboard does not open by itself (E-03).
    let attention = null;
    function emptyValueOf(id) {
      const box = locationElement({ id }), main = box?.querySelector(':scope > .blockui-node-content > .blockui-node-main');
      return main && [...main.querySelectorAll('input[data-expression-hole="true"], [data-blockui-action="hole-select-expression"]')]
        .find(n => n.closest('.blockui-node') === box || n.closest('.blockui-node')?.parentElement?.closest('.blockui-node') === box);
    }
    // The light stays through the renders that follow the drop, for two seconds.
    function lightEmptyValue() {
      if (!attention || Date.now() > attention.until) { attention = null; return; }
      const empty = emptyValueOf(attention.id), field = empty && (empty.closest('.blockui-field, .blockui-input-slot') || empty);
      if (field && !field.classList.contains('blockui-attention')) field.classList.add('blockui-attention');
    }
    function attendEmptyValue(id) {
      doc.defaultView.requestAnimationFrame(() => {
        const empty = emptyValueOf(id);
        if (!empty) return;
        if (lastPointerType === 'touch' || lastPointerType === 'pen') {
          attention = { id, until: Date.now() + 2000 };
          lightEmptyValue();
          empty.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } else { empty.focus({ preventScroll: true }); empty.select?.(); }
      });
    }
    function sameLocation(a, b) {
      return (
        !!a &&
        !!b &&
        a.parentId === b.parentId &&
        a.body === b.body &&
        a.input === b.input &&
        a.index === b.index
      );
    }
    function locationFromElement(n) {
      if (!n) return null;
      return n.dataset.blockuiBody
        ? {
            parentId: n.dataset.parentId,
            body: n.dataset.blockuiBody,
            index: Number(n.dataset.insertIndex),
          }
        : n.dataset.blockuiInput
          ? {
              parentId: n.dataset.parentId,
              input: n.dataset.blockuiInput,
              ...(n.hasAttribute('data-slot-index') ? { index: Number(n.dataset.slotIndex) } : {}),
            }
          : null;
    }
    function availability(schemaId, location, candidateNode = null) {
      if (!tree || !location) return { enabled: false, reason: '入れる ばしょを えらんでね' };
      const schema = BLOCK_SCHEMA_BY_ID.get(schemaId);
      if (schema.category !== (location.body ? 'statement' : 'expression'))
        return {
          enabled: false,
          reason: location.body ? '本文には つなぐブロックを 入れるよ。はめるブロックは あいている ところを えらんで 入れてね' : 'いまは はめるブロックを えらんでいるよ。つなぐブロックを ふやすときは「＋ ここに入れる」を おしてね',
        };
      const key = schemaId + '|' + JSON.stringify(location) + '|' + (candidateNode ? JSON.stringify(candidateNode) : '');
      if (availabilityCache.has(key)) return availabilityCache.get(key);
      let result;
      try {
        result = blockInsertionAvailability(session(), schemaId, location, {
          project: project(),
          context: context(),
          candidateNode,
        });
      } catch (error) {
        result = { enabled: false, reason: errorText(error) };
      }
      availabilityCache.set(key, result);
      return result;
    }
    // A new continuous rule moves 1秒に200歩, as the example 「右」キーがおされているあいだ、右へ1秒に200歩の速さで動き続ける
    // does; what it waits for is chosen, never filled in (LANGUAGE.md: a condition stays to be chosen).
    function newRule() {
      const rule = createBlock('ContinuousRule', { idPrefix: viewId, draft: true, allowHoles: true });
      for (const [key, value] of [['seconds', 1], ['distance', 200]])
        if (rule.inputs[key]?.schemaId === 'Hole:expression') Object.assign(rule.inputs[key], { schemaId: 'NumberLiteral', fields: { value } });
      return rule;
    }
    // A continuous rule found by search goes into the rules of the body's heading, as with 「＋ つづけて動くルール」.
    function ruleAvailability() {
      const slot = tree && BLOCK_SCHEMA_BY_ID.get(tree.schemaId)?.inputs.find(s => s.key === 'rules');
      if (!slot) return { enabled: false, reason: 'きっかけの ある 本文で 使えるよ' };
      if ((tree.inputs.rules || []).length >= slot.maxItems) return { enabled: false, reason: 'つづけて動くルールは これ以上 ふやせないよ' };
      return { enabled: true };
    }
    function paletteAdd(schema) {
      const location = destination || defaultDestination();
      if (schema.category === 'rule') {
        const a = ruleAvailability();
        if (!a.enabled) { announce(a.reason, true); return; }
        const result = operate({ type: 'variadic-insert', parentId: tree.id, input: 'rules', index: (tree.inputs.rules || []).length,
          node: newRule() });
        if (result.ok) announce('つづけて動くルールを 入れたよ。きまりと 速さを 決めてね');
        return;
      }
      if (schema.category === 'expression' && !location?.input) {
        announce(
          'あいている ところへ おしたまま 運んでね。あいている ところの「計算を入れる」からも 入れられるよ',
        );
        return;
      }
      const a = availability(schema.id, location, schema.candidateNode);
      if (!a.enabled) {
        announce(a.reason, true);
        return;
      }
      const node = a.node || applyCreationDefaults(createBlock(schema.id, { ...context(), idPrefix: viewId }), project(), context().targetId);
      const wraps = wrapCount(schema, node, location);
      const op = location.body
        ? { type: wraps ? 'wrap' : 'insert', ...location, node }
        : { type: 'expression', ...location, node };
      const result = operate(op);
      if (result.ok) {
        const containsHole = (part) => part && (
          BLOCK_SCHEMA_BY_ID.get(part.schemaId)?.kind === 'Hole' ||
          [...Object.values(part.inputs || {}), ...Object.values(part.bodies || {})]
            .flat().some(containsHole)
        );
        if (searchText && containsHole(node)) {
          previousSearch = searchText;
          searchText = search.value = '';
        }
        destination = null;
        for (const chosen of workspace.querySelectorAll('.blockui-chosen-destination')) chosen.classList.remove('blockui-chosen-destination');
        renderPalette();
        updateControls();
        const placedId = location.body ? placedAt(location, node.schemaId, true) : session()?.blockSelection;
        focus({ id: placedId });
        if (schema.bodies?.length) attendEmptyValue(placedId);
      }
    }
    // The block just put in (at its place, or in the hole it replaced) or moved (the one selected; a block moved down in
    // its own body is one place higher).
    function placedAt(location, schemaId, inserted = false) {
      const siblings = location?.body ? index.get(location.parentId)?.node.bodies[location.body] : null,
        selectedId = session()?.blockSelection;
      if (!siblings) return selectedId;
      if (inserted && siblings[Math.min(location.index, siblings.length - 1)]?.schemaId === schemaId) return siblings[Math.min(location.index, siblings.length - 1)].id;
      if (siblings.some(n => n.id === selectedId && n.schemaId === schemaId)) return selectedId;
      for (const at of [location.index, location.index - 1, siblings.length - 1])
        if (siblings[at]?.schemaId === schemaId) return siblings[at].id;
      return selectedId;
    }
    function phrase(schema) {
      if (phraseCache.has(schema.id)) return phraseCache.get(schema.id);
      let value = null;
      try {
        const ast = schema.create(),
          tokens = [];
        let serial = 0;
        const marker = (part, target = false) => {
          const name = '仮入力' + serial++,
            node = target
              ? { name, qualifier: null }
              : { kind: 'VariableRead', name, qualifier: 'exact' },
            token = target ? formatTarget(node) : formatExpression(node);
          tokens.push({ token, ...part });
          return node;
        };
        for (const field of schema.fields)
          if (field.type === 'name') {
            const name = '仮名前' + serial++;
            tokens.push({ token: name, field });
            ast[field.key] = name;
          }
        for (const slot of schema.inputs) {
          if(slot.required===false)continue;
          if (slot.multiple) {
            const count = slot.variadic ? 1 : (slot.initialItems ?? slot.minItems);
            ast[slot.key] = Array.from({ length: count }, (_, i) =>
              marker({ slot, ...(slot.variadic ? {} : { index: i }) }),
            );
          } else ast[slot.key] = marker({ slot }, slot.type === 'target');
        }
        const text = (
            schema.category === 'statement'
              ? formatScript({ kind: 'Script', body: [ast] })
              : formatExpression(ast)
          // The for-each block names what it is looking at on its second line, as the code does.
          ).split('\n').slice(0, schema.kind === 'ForEach' ? 2 : 1).map((line, i) => (i ? line.trim() : line)).join('\n'),
          parts = [];
        let at = 0;
        while (at < text.length) {
          let next = null,
            where = text.length;
          for (const token of tokens) {
            const i = text.indexOf(token.token, at);
            if (i >= 0 && i < where) {
              where = i;
              next = token;
            }
          }
          if (where > at) parts.push(text.slice(at, where));
          if (!next) break;
          parts.push(next);
          at = where + next.token.length;
        }
        if (
          tokens.every(
            (t) => parts.filter((p) => typeof p === 'object' && p.token === t.token).length === 1,
          )
        )
          value = parts;
      } catch (_) {}
      if (value) {
        if (schema.kind === 'RepeatCount') {
          const token = value.find((p) => p?.slot?.key === 'count');
          if (token) value = [token, ' 回くり返す'];
        } else if (schema.kind === 'IfStatement') {
          const token = value.find((p) => p?.slot?.key === 'condition');
          if (token) value = ['もし ', token, ' なら'];
        } else if (schema.kind === 'Forever') value = ['ずっと'];
        else if (schema.kind === 'CompareExpression') {
          // The same order as the code: 1が2とちがう.
          const left = value.find((p) => p?.slot?.key === 'left'), right = value.find((p) => p?.slot?.key === 'right');
          if (left && right) value = [left, ' が ', right, ' ' + schema.label];
        }
        else if (schema.id === 'BuiltinCall:つなぐ') {
          const slot = schema.inputs.find((s) => s.key === 'args');
          value = ['（', { token: '', slot }, ' を つなげた文字）'];
        }
        else if (schema.id === 'BuiltinCall:乱数') {
          const slot = schema.inputs.find((s) => s.key === 'args');
          value = [{ token: '', slot, index: 0 }, ' から ', { token: '', slot, index: 1 }, ' のどれか'];
        }
        else if (schema.kind === 'ForEach')
          value = value.flatMap((p) => (typeof p !== 'string' ? [p]
            : p.split('\n').flatMap((s, i) => [...(i ? [{ lineBreak: true }] : []), s.replace(/。$/, '')]).filter((s) => s !== '')));
        else value = value.map((p) => (typeof p === 'string' ? p.replace(/。$/, '') : p));
      }
      phraseCache.set(schema.id, value);
      return value;
    }
    // A call that hands nothing over is written without 「をわたして、」 (【てじゅん】という手順を行う), so its block and its
    // face in the list read the same as its code (E-14).
    // The work's names, read once per drawing of the blocks or the list (render and renderPalette start it again).
    const workSymbols = () => {
      const work = project();
      if (!work) return null;
      if (faceSymbols?.work !== work) faceSymbols = { work, symbols: buildSymbols(work) };
      return faceSymbols.symbols;
    };
    // A list's length reads 持ち物の数, as 整える and block-to-code write it (F-34), where that reads back: the name is a
    // list of the work and no data is called 持ち物の数. Otherwise it keeps 〜の長さ.
    function listCountFace(node) {
      const list = node?.inputs?.args?.[0], s = list?.schemaId === 'VariableRead' ? workSymbols() : null;
      if (!s) return false;
      const lists = [s.projectLists, ...[...(s.individualByTargetId?.values?.() || [])].map(d => d.lists)];
      return lists.some(m => m?.has?.(list.fields.name)) && !s.allDataNames?.has?.(list.fields.name + 'の数');
    }
    function shownPhrase(schema, node) {
      const parts = phrase(schema);
      // The character's colour reads 色を〔赤〕にする, as block-to-code writes it, unless the work has data named 色 (F-25).
      if (parts && schema.id === 'LooksCommand:SET_COLOR') {
        if (!project() || workSymbols()?.allDataNames?.has?.('色')) return parts;
        return parts.map((part) => (typeof part === 'string' ? part.replace(/^表示色を/, '色を') : part));
      }
      if (parts && schema.id === 'BuiltinCall:LENGTH' && listCountFace(node))
        return parts.map((part) => (typeof part === 'string' ? part.replace(/^の長さ$/, 'の数') : part));
      if (!parts || schema.kind !== 'UserActionCall' || node?.inputs?.args?.length) return parts;
      return parts.map((part) => (typeof part === 'string' ? part.replace(/^をわたして、/, '') : part));
    }
    function paletteLabel(schema) {
      if (['NumberLiteral', 'StringLiteral', 'BooleanLiteral', 'CommentLine'].includes(schema.kind))
        return schema.kind === 'CommentLine' ? '※ メモ' : schema.label;
      const parts = phrase(schema);
      return parts
        ? parts
            .map((p) =>
              typeof p === 'string'
                ? p
                : p.lineBreak
                ? ' '
                : '［' +
                  (p.field?.label ||
                    (p.slot?.type === 'target'
                      ? '名前'
                      : p.slot?.labels?.[p.index] || p.slot?.label)) +
                  '］',
            )
            .join('')
        : schema.label;
    }
    // At はじめて and かんたん, the words of a block face whose kanji are taught after grade 3 carry their reading (F-20).
    // Only the face's own words are read: values, names, fields and the blocks inside keep their text.
    const FACE_READINGS = [['四捨五入', 'ししゃごにゅう'], ['条件', 'じょうけん'], ['手順', 'てじゅん'], ['順番', 'じゅんばん'],
      ['変数', 'へんすう'], ['結果', 'けっか'], ['最初', 'さいしょ'], ['最後', 'さいご'], ['最小', 'さいしょう'], ['最大', 'さいだい'],
      ['表示', 'ひょうじ'], ['段階', 'だんかい'], ['以上', 'いじょう'], ['以下', 'いか'], ['未満', 'みまん'], ['値', 'あたい'],
      ['成', 'な', 'り'], ['求', 'もと', 'め'], ['増', 'ふ', 'や'], ['減', 'へ', 'ら'], ['残', 'のこ', 'り'], ['呼', 'よ', 'ぶ'], ['捨', 'す', 'て'], ['続', 'つづ', 'け']];
    const FACE_READING_SOURCE = FACE_READINGS.map(([word, , next]) => next ? word + '(?=' + next + ')' : word).join('|'),
      FACE_READING_SKIP = '.blockui-node, input, select, textarea, ruby, .blockui-preview-slot, [data-blockui-field]';
    function faceRuby(root) {
      if (!['entry', 'basic'].includes(document.body.dataset.uiLevel)) return root;
      const found = new RegExp(FACE_READING_SOURCE), texts = [],
        walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => {
          const stop = n.parentElement?.closest(FACE_READING_SKIP);
          return stop && stop !== root && root.contains(stop) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        } });
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if (found.test(n.data)) texts.push(n);
      for (const n of texts) {
        const out = doc.createDocumentFragment();
        let at = 0;
        for (const m of n.data.matchAll(new RegExp(FACE_READING_SOURCE, 'g'))) {
          const ruby = doc.createElement('ruby'), rt = doc.createElement('rt');
          rt.textContent = FACE_READINGS.find(([word, , next]) => word === m[0] && (!next || n.data.startsWith(next, m.index + word.length)))[1];
          ruby.append(m[0], rt);
          out.append(n.data.slice(at, m.index), ruby);
          at = m.index + m[0].length;
        }
        out.append(n.data.slice(at));
        n.replaceWith(out);
      }
      return root;
    }
    // A speech without a time reads like its code (F-27, F-34): 「こんにちは」と言う for words, 点数を言う for a value, and
    // （…）の値を言う for a condition.
    function sayParticle(value) {
      return value?.schemaId === 'StringLiteral' ? 'と'
        : /^(?:CompareExpression|LogicalExpression):|^UnaryExpression:NOT$/.test(value?.schemaId || '') ? 'の値を' : 'を';
    }
    function previewNode(schema, candidate) {
      const node =
          candidate || applyCreationDefaults(createBlock(schema.id, { ...context(), ...blockCreationDefaults(project(), context().targetId), idPrefix: viewId + '-preview' }), project(), context().targetId),
        box = E('span', 'blockui-preview', null, { 'data-shape-kind': blockShapeKind(schema) }),
        main = E('span', 'blockui-preview-main');
      attachShape(box, blockShapeKind(schema));
      // A quantity such as 1秒 previews its number, not the slot name.
      const scalar = (n) =>
        n?.schemaId === 'QuantityLiteral'
          ? scalar(n.inputs.value)
          : n?.schemaId === 'NumberLiteral'
          ? decimalSource(n.fields.value)
          : n?.schemaId === 'StringLiteral'
            ? n.fields.value
            : n?.schemaId === 'BooleanLiteral'
              ? n.fields.value
                ? 'あてはまる'
                : 'あてはまらない'
              : n?.schemaId === 'VariableRead'
                ? n.fields.name
                : null;
      const pill = (text, condition = false) =>
        E('span', 'blockui-preview-slot' + (condition ? ' blockui-preview-condition' : ''), text || ' ');
      if (['NumberLiteral', 'StringLiteral', 'BooleanLiteral'].includes(schema.kind))
        main.append(pill(scalar(node) || schema.fields[0]?.label));
      else if (schema.kind === 'CommentLine')
        main.append(doc.createTextNode('※ メモ'));
      else if (schema.kind === 'Say') {
        main.append(pill(scalar(node.inputs.value) ?? 'ことば'));
        if (node.inputs.seconds) main.append(doc.createTextNode(node.inputs.value?.schemaId === 'StringLiteral' ? 'と ' : 'を '), pill(scalar(node.inputs.seconds) ?? '秒数'), doc.createTextNode(' 秒話す'));
        else main.append(doc.createTextNode(' ' + sayParticle(node.inputs.value) + '言う'));
      }
      else if (schema.kind === 'VariableRead')
        main.append(pill(node.fields.name || 'へんすう'));
      // The direction a placed block lets the child choose shows as a value here too, so the list and the workspace
      // read the same (E-14): いまのばしょから、［右］へ［10］歩動く, ［前］へ［10］歩進む.
      else if ((schema.id === 'MotionCommand:MOVE_BY' && !(node.inputs.x && node.inputs.y)) || schema.id === 'MotionCommand:MOVE') {
        if (node.inputs.seconds) main.append(pill(scalar(node.inputs.seconds) ?? '1'), doc.createTextNode('秒かけて、'));
        if (schema.id === 'MotionCommand:MOVE') {
          const back = node.fields.direction === 'backward';
          main.append(pill(back ? '後ろ' : '前'), doc.createTextNode('へ'), pill(scalar(node.inputs.args?.[0]) ?? '10'), doc.createTextNode(back ? '歩動く' : '歩進む'));
        } else {
          const key = node.inputs.x ? 'x' : 'y', word = { right: '右', left: '左', up: '上', down: '下' }[node.fields[key + 'Dir']];
          main.append(doc.createTextNode('いまのばしょから、'), pill(word), doc.createTextNode('へ'), pill(scalar(node.inputs[key]) ?? '10'), doc.createTextNode('歩動く'));
        }
      }
      else {
        const parts = shownPhrase(schema, node);
        if (parts)
          for (const part of parts) {
            if (typeof part === 'string') main.append(doc.createTextNode(part));
            else if (part.lineBreak) main.append(E('span', 'blockui-phrase-break'));
            else if (part.field) main.append(pill(node.fields[part.field.key] || part.field.label));
            else {
              const slot = part.slot,
                value = node.inputs[slot.key],
                children = Array.isArray(value)
                  ? part.index === undefined
                    ? value
                    : [value[part.index]]
                  : [value];
              for (const [i, child] of children.entries()) {
                if (i) main.append(doc.createTextNode(slot.separator || '、'));
                // A key shows by the keyboard's name, as in the workspace (F-34).
                const text =
                  (schema.id === 'SensorRead:KEY_DOWN' && child?.schemaId === 'StringLiteral' ? keySurface(child.fields.value) : scalar(child)) ??
                  (slot.type === 'target'
                    ? child?.fields?.name || 'へんすう'
                    : slot.labels?.[part.index ?? i] || slot.label);
                main.append(pill(text, blockShapeKind(schemaOf(child) || {}) === 'boolean'));
              }
            }
          }
        else main.append(doc.createTextNode(schema.label));
      }
      box.append(main);
      if (schema.bodies.length) box.append(E('span', 'blockui-preview-cavity'));
      return box;
    }
    // The list is checked at the end of the body the next block goes into, not right after the selected block, so choosing
    // another block of that body asks nothing again (PERF-01). A block whose answer depends on its place is checked there,
    // and pressing a block always checks the place it goes (paletteAdd).
    const PLACE_DEPENDENT_KINDS = new Set(['WaitBroadcastGroup', 'LocalVariableDeclaration', 'LocalListDeclaration']);
    function listedPlace(location) {
      const siblings = !destination && location?.body ? index.get(location.parentId)?.node?.bodies?.[location.body] : null;
      return siblings && !siblings.some(n => n.schemaId === 'Hole:statement') ? { ...location, index: siblings.length } : location;
    }
    function paletteAvailability(schema, location) {
      if (schema.candidateReason) return {enabled:false, reason:schema.candidateReason, node:schema.candidateNode};
      if (location?.body && !PLACE_DEPENDENT_KINDS.has(schema.kind)) location = listedPlace(location);
      if (schema.category === 'rule') return ruleAvailability();
      // A value may be picked up before its destination is chosen. The actual
      // socket is checked by the existing common validator on preview and drop.
      if (schema.category === 'expression' && !location?.input)
        return {
          enabled: true,
          needsSlot: true,
          node: schema.candidateNode,
          reason: 'あいている ところへ はめる ブロック',
        };
      return availability(schema.id, location, schema.candidateNode);
    }
    function renderPalette() {
      if (options.readOnly) return;
      if (destroyed) return;
      faceSymbols = null;
      powerHelp.hidden = document.body.dataset.uiLevel !== 'advanced';
      modeSelect.value = paletteMode;
      syncLibraryToggle();
      const entry = document.body.dataset.uiLevel === 'entry';
      const query = entry ? '' : searchText.trim().toLocaleLowerCase();
      // A quantity whose unit is chosen (たんいを つけた 数) is a くわしく block: only there are units chosen (E-02).
      const unitChoice = document.body.dataset.uiLevel === 'advanced';
      // はじめて shows only blocks that change something in this work (F-03): 「はいけいを かえる」 when it has two
      // backdrops or more, 「〔音〕を鳴らす」 when it has a sound.
      const entryWorks = (s) => s.id === 'LooksCommand:SET_BACKDROP' ? (project()?.stage?.backdrops?.length || 0) > 1
        : s.id === 'SoundCommand:SAMPLE_WAIT' ? (project()?.sounds?.length || 0) > 0 : true;
      const registry = BLOCK_SCHEMAS.filter((s) => !s.draftOnly && ['statement', 'expression'].includes(s.category)
        && (!entry || ENTRY_BLOCK_SCHEMA_IDS.has(s.id) && entryWorks(s)) && (unitChoice || s.id !== 'QuantityLiteral')
        && (unitChoice || !ADVANCED_ONLY_SCHEMA_IDS.has(s.id)));
      const all = registry.filter((s) => entry || paletteMode === 'all' || s.category === paletteMode);
      const groups = [...PALETTE_GROUP_LABELS];
      const categoryScroll = categorySelect.scrollTop;
      categorySelect.replaceChildren();
      for (const [g, label] of groups) {
        if (g === 'basic' && !all.some((s) => BASIC_BLOCK_SCHEMA_IDS.has(s.id))) continue;
        if (g && g !== 'basic' && !all.some((s) => blockPaletteGroup(s) === g)) continue;
        const chip = button(
          label,
          'palette-category',
          () => {
            category = g;
            categoryExplicit = true;
            paletteList.scrollTop = 0;
            renderPalette();
          },
          {
            'data-blockui-category': g,
            'aria-pressed': category === g,
            'data-palette-tone': g || 'data',
          },
        );
        categorySelect.append(chip);
      }
      categorySelect.scrollTop = categoryScroll;
      // A search looks through every category, whichever is chosen (E-13); the results keep their category colours.
      searchScope.textContent=query?'すべての なかまから さがしているよ':'すべての なかまから さがせるよ';
      restoreSearch.hidden = !previousSearch || !!query;
      restoreSearch.textContent = `前の「${previousSearch}」を もう一度 さがす`;
      const location = destination || defaultDestination(),
        projectState = project();
      const hints = !query ? [] : location?.body ? editorInsertionHints(session(), location, {project:projectState,context:context()})
        : hintCandidates(projectState, context().targetId, {source:session()?.sourceText || '', ...context()});
      const searched = query ? blockSearchCandidates(projectState, context(), query, hints) : all;
      const speech=searched.find(s=>s.id==='Say');
      if(speech){const timed=createBlock('Say',{idPrefix:viewId+'-timed'});timed.inputs.seconds=createBlock('NumberLiteral',{idPrefix:viewId+'-seconds'});timed.inputs.seconds.fields.value=options.tutorialActive?.()?1:2;searched.splice(searched.indexOf(speech),0,{...speech,candidateNode:timed,candidateKey:'timed-speech',searchLabel:entry?'話す':'ことばと 時間を 決めて 話す'});}
      // はじめて: the loop comes with its number of times (F-03); what it repeats goes into its hole, from the next block
      // put in or the blocks below it (E-03).
      const loopAt = entry ? searched.findIndex(s => s.id === 'RepeatCount' && !s.candidateNode) : -1;
      if (loopAt >= 0) {
        const loop = createBlock('RepeatCount', { idPrefix: viewId + '-loop', draft: true, allowHoles: true }), count = createBlock('NumberLiteral', { idPrefix: viewId + '-count' });
        count.fields.value = 3; loop.inputs.count = count;
        searched.splice(loopAt, 1, { ...searched[loopAt], candidateNode: loop, candidateKey: 'entry-repeat' });
      }
      let candidates = searched.filter(
        (s) =>
          (entry || query || !category || (category === 'basic'
            ? BASIC_BLOCK_SCHEMA_IDS.has(s.id)
            : blockPaletteGroup(s) === category)) &&
          (entry || paletteMode === 'all' || s.category === paletteMode) &&
          (!entry || s.id !== 'Say' || s.candidateKey === 'timed-speech') &&
          (unitChoice || s.id !== 'QuantityLiteral') && (unitChoice || !ADVANCED_ONLY_SCHEMA_IDS.has(s.id)),
      );
      if (!showOutside && !entry)
        candidates = candidates.filter((s) => paletteAvailability(s, location).enabled);
      if ((entry || category === 'basic') && !query) {
        const order = entry ? ENTRY_PALETTE_ORDER : [...BASIC_BLOCK_SCHEMA_IDS];
        candidates.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      }
      const lesson=options.lessonCandidate?.();
      if(lesson){
        const candidate={...BLOCK_SCHEMA_BY_ID.get(lesson.node.schemaId),candidateNode:lesson.node,candidateKey:'lesson-'+lesson.key,lessonKey:lesson.key,searchLabel:lesson.label};
        const at=candidates.findIndex(item=>item.id===candidate.id);
        if(at<0)candidates.push(candidate);else candidates.splice(at,1,candidate);
      }
      // Keep the normal palette visible: a lesson guides a choice, never makes it.
      const scroll = paletteList.scrollTop;
      paletteList.replaceChildren();
      for (const schema of candidates) {
        const a = paletteAvailability(schema, location),
          item = E('div', 'blockui-palette-item', null, {
            'data-palette-tone': blockPaletteGroup(schema),
          }),
          reason = E(
            'small',
            'blockui-unavailable',
            a.reason || 'この ばしょでは 使えないよ',
          );
        const b = button(
          '',
          'palette-add',
          () => {
            if (!a.enabled) {
              reason.hidden = false;
              announce(a.reason, true);
              return;
            }
            paletteAdd(schema);
          },
          {
            'data-blockui-schema': schema.candidateKey==='timed-speech'?'Say:timed':schema.id,
            'data-schema-id': schema.id,
            'data-lesson-block': schema.lessonKey || '',
            // The tip says what the block is (F-21); why it cannot go in here is said when it is pressed.
            title: schema.searchLabel || schema.description || schema.label,
            // The block's name in 「 」, so a name such as 〜のところへ行く reads apart from を入れる (B-15).
            'aria-label': '「' + (schema.searchLabel || schema.label) + '」を入れる',
            'data-search-binding': schema.candidateKey || '',
            'aria-disabled': !a.enabled,
          },
        );
        b.disabled = isLocked();
        b._akariSearchCandidate = schema;
        // A rule is put in with the button only: it has no place among the sentences of a body.
        if (schema.category !== 'rule') {
          b.dataset.blockuiDrag = 'palette';
          b.dataset.blockuiDragSchema = schema.id;
        }
        try {
          b.append(faceRuby(previewNode(schema, a.node)));
          if (schema.binding||schema.lessonKey||schema.candidateKey==='timed-speech') b.append(E('small', 'blockui-bound-name', schema.searchLabel));
        } catch (_) {
          b.textContent = paletteLabel(schema);
        }
        item.append(b);
        reason.hidden = a.enabled;
        if (!a.enabled) item.append(reason);
        paletteList.append(item);
      }
      if (!candidates.length && !options.tutorialActive?.())
        paletteList.append(
          E(
            'p',
            'blockui-empty',
            // A search already looks through every なかま: it asks for other words.
            query ? '「' + searchText.trim() + '」に 合う ブロックが ないよ。ほかの ことばで さがしてみてね。れい：うごく・まつ・いう'
            : location?.input
              ? 'ここに 入れられる ブロックが ないよ。なかまを かえてね。「ブロックの しゅるい」の「使えないブロックも見せる」で、使えない わけも 見られるよ。つなぐブロックを ふやすときは「＋ ここに入れる」を おしてね'
              : 'この ばしょで 使える ブロックが ないよ。なかまを かえてね。「ブロックの しゅるい」の「使えないブロックも見せる」で、使えない わけも 見られるよ。',
          ),
        );
      if(!options.tutorialActive?.()&&category&&!query&&!candidates.length)paletteList.append(button('すべての なかまで さがす','search-all',()=>{category='';categoryExplicit=false;renderPalette();search.focus();}));
      paletteList.scrollTop = scroll;
      scheduleGeometry();
      options.onPresentation?.();
    }
    function namesFor(node, field) {
      const p = project(),
        c = context(),
        names = [];
      if (!p) return names;
      if (node.schemaId === 'UserActionCall') return p.actions.map((x) => x.name);
      if (node.schemaId === 'UserFunctionCall') return p.functions.map((x) => x.name);
      if (field.type === 'name') {
        const actor = p.components.find((x) => x.id === c.targetId);
        for (const records of [
          p.projectData?.variables,
          p.projectData?.lists,
          actor?.localData?.variables,
          actor?.localData?.lists,
        ])
          for (const x of records || []) names.push(x.name);
        names.push(...(c.args || []), ...(c.localNames || []), ...(c.binders || []));
        const info = index.get(node.id);
        for (const id of info?.ancestors || []) {
          const ancestor = index.get(id)?.node;
          if (ancestor?.schemaId === 'ForEach') names.push(ancestor.fields.binder);
        }
        for (const info of index.values())
          if (['LocalVariableDeclaration', 'LocalListDeclaration'].includes(info.node.schemaId))
            names.push(info.node.fields.name);
      } else if (field.type === 'string')
        names.push(
          ...p.components.map((x) => x.name),
          ...p.stage.backdrops.map((x) => x.name),
          ...p.components.flatMap((x) => (x.costumes || []).map((y) => y.name)),
          ...p.sounds.map((x) => x.name),
          ...Object.keys(COLOR_NAMES).map((name) => COLOR_LABELS[name] || name),
          'マウス',
          ...(edgeSlot(node, field) ? Object.values(EDGE_TARGETS) : []),
          // Keys by the keyboard's names, as the code writes them (F-34).
          'スペース',
          '上',
          '下',
          '左',
          '右',
          'エンター',
          'エスケープ',
        );
      return [...new Set(names)];
    }
    // A field named like its block is read once, not as "文字 文字".
    function joinAccessibleName(owner, part) {
      return owner === part ? owner : owner + ' ' + part;
    }
    // A block reads like its code (E-14): the subject shows only where the code writes one (だんごは), as plain text;
    // the body's owner and みんな of a wait are not written. Who acts is chosen with 「だれが」 among the selected block's
    // tools (actorTool), so the sentence itself has no control for it.
    function subjectFace(node, field) {
      const value = node.fields[field.key], owner = node.schemaId === 'ActorQualifiedRead';
      // A subject carried over from a sentence before (おばあさんは かくれる。「うんとこしょ」と2秒話す。) is not written in
      // this one, but another part does it: the face shows it pale and in （ ） (E2E-R1-04). The body's own part is not shown.
      if (!owner && value?.kind === 'named' && !schemaOf(node)?.bodies?.length && !subjectWritten(node, value.name) &&
          value.name !== project()?.components.find(c => c.id === context().targetId)?.name) {
        const carried = E('span', 'blockui-phrase-text blockui-subject-text blockui-subject-carried', '（' + value.name + (value.particle || 'は') + '）', { 'data-block-id': node.id });
        carried.style.opacity = '0.6';
        return carried;
      }
      if (!owner && (value?.kind !== 'named' || !subjectWritten(node, value.name))) return doc.createDocumentFragment();
      const name = value?.kind === 'named' ? value.name : subjectName(node);
      return E('span', 'blockui-phrase-text blockui-subject-text', owner ? name : name + (value?.particle || 'は'), { 'data-block-id': node.id });
    }
    // A subject carried over from the sentence before (たくどんは…。2回くり返す。) is not written in this one.
    function subjectWritten(node, name) {
      const at = session()?.nodeMap?.get?.(node.id), range = at?.surface?.range || at?.surface?.extent, source = session()?.sourceText;
      if (!range || typeof source !== 'string') return true;
      const text = source.slice(range.start, range.end).replace(/^[\s　]+/, '');
      return ['は', 'が'].some(mark => text.startsWith(name + mark) || text.includes('、' + name + mark));
    }
    function actorTool(node) {
      const field = schemaOf(node)?.fields.find(f => f.type === 'actor-ref' && f.key === 'actorRef');
      if (!field || options.readOnly) return null;
      const owner = node.schemaId === 'ActorQualifiedRead', details = editDisclosure(node, 'actorRef', owner ? 'だれの' : 'だれが', 'blockui-who');
      details.querySelector('summary').setAttribute('aria-label', (owner ? 'だれのかを えらぶ: ' : 'だれが するかを えらぶ: ') + subjectName(node));
      details.append(fieldControl(node, field, false, true));
      return details;
    }
    function fieldControl(node, field, annotation = false, tool = false) {
      if (field.type === 'actor-ref' && !tool && !options.readOnly) return subjectFace(node, field);
      const value = annotation ? node.annotations[field.key] : node.fields[field.key],
        wrap = E(['actor-ref', 'heading', 'argument-names'].includes(field.type) ? 'div' : 'label', 'blockui-field', null, { 'data-field-type': field.type }),
        title = E('span', 'blockui-field-label', field.label),
        attrs = {
          'data-block-id': node.id,
          [annotation ? 'data-blockui-annotation' : 'data-blockui-field']: field.key,
          'aria-label': joinAccessibleName(schemaOf(node).label, field.label),
        };
      let input;
      if (['actor-ref', 'heading', 'argument-names'].includes(field.type)) {
        if (options.readOnly) {
          const actorText = actor => actor?.kind === 'named' ? actor.name : actor?.kind === 'all' || (!actor && field.everyone) ? 'みんな' : '自分';
          const text = field.type === 'actor-ref' ? actorText(value)
            : field.type === 'argument-names' ? (value || []).join('、')
              : value ? (eventText(value.event, value.filter) || value.event) + '、' + actorText(value.actorRef) +
                (value.filter?.key !== undefined ? '、キー「' + keySurface(value.filter.key) + '」'
                  : value.filter?.message !== undefined ? '、合図「' + value.filter.message + '」' : '') : '本文で決める';
          wrap.append(title, E('span', 'blockui-readonly-value', text, attrs));
          return wrap;
        }
        // The group transports a structured value through the existing atomic
        // pending editor. Children are controls, never a JSON/source textbox.
        const group = E('fieldset', 'blockui-structured-field', null, { ...attrs, tabindex: '-1' });
        group.append(E('legend', 'blockui-field-label', field.label));
        let changed = false, readValue = () => value, restore = () => {};
        const control = (label, type, suffix, initial = '') => {
          const row = E('label', 'blockui-structured-role'), child = E(type, '', null, {
            'data-block-id': node.id, 'data-blockui-structured-role': field.key + '.' + suffix,
            'aria-label': joinAccessibleName(field.label, label),
            ...(type === 'input' ? { type: 'text', spellcheck: 'false', autocomplete: 'off' } : {}),
          });
          row.append(E('span', 'blockui-field-label', label), child); group.append(row);
          child.value = initial; child.disabled = isLocked() || options.readOnly;
          return child;
        };
        const choice = (label, suffix, values, initial) => {
          const child = control(label, 'select', suffix);
          for (const [v, label] of values) child.append(E('option', '', label, { value: v }));
          child.value = initial; return child;
        };
        // A wait also offers みんな: the whole flow waits, not one part.
        const actor = (initial, prefix = '', everyone = false, particle = false) => {
          const first = initial?.kind || (everyone ? 'all' : 'self');
          const kind = choice('だれの', prefix + 'kind', [...(everyone ? [['all', 'みんな']] : []), ['self', '自分'], ['named', '名前で えらぶ']], first);
          const name = control('だれかの名前', 'input', prefix + 'name', initial?.name || '');
          // A sentence's named subject is written with は or が (the same meaning).
          const mark = particle ? choice('「は」か「が」', prefix + 'particle', [['は', 'は'], ['が', 'が']], initial?.particle || 'は') : null;
          const names = E('datalist', '', null, { id: viewId + '-actor-' + node.id + '-' + field.key + prefix });
          for (const text of [project()?.stage?.name, ...(project()?.components || []).map(c => c.name)].filter(Boolean))
            names.append(E('option', '', null, { value: text }));
          name.setAttribute('list', names.id); group.append(names);
          const sync = () => { name.parentElement.hidden = kind.value !== 'named'; if (mark) mark.parentElement.hidden = kind.value !== 'named'; };
          sync(); listen(kind, 'change', sync);
          return { read: () => kind.value === 'named' ? { kind: 'named', name: name.value, ...(mark?.value === 'が' ? { particle: 'が' } : {}) } : { kind: kind.value },
            restore: () => { kind.value = first; name.value = initial?.name || ''; if (mark) mark.value = initial?.particle || 'は'; sync(); } };
        };
        if (field.type === 'actor-ref') {
          const subject = actor(value, '', !!field.everyone, node.schemaId !== 'ActorQualifiedRead' && field.key === 'actorRef');
          readValue = subject.read; restore = subject.restore;
        } else if (field.type === 'argument-names') {
          const mode = choice('入れるものの わたし方', 'mode', [['positional', '書いた じゅんに わたす'], ['named', '名前を つけて わたす']], value === undefined ? 'positional' : 'named');
          const names = (node.inputs.args || []).map((_, i) => control('入れるもの' + (i + 1) + 'の名前', 'input', String(i), value?.[i] || ''));
          const sync = () => { for (const name of names) name.parentElement.hidden = mode.value !== 'named'; };
          sync(); listen(mode, 'change', sync);
          readValue = () => mode.value === 'named' ? names.map(name => name.value) : undefined;
          restore = () => { mode.value = value === undefined ? 'positional' : 'named'; names.forEach((name, i) => { name.value = value?.[i] || ''; }); sync(); };
        } else {
          const currentEvent=value?.event||context().event||'start',currentActor=value?.actorRef||{kind:'self'},currentFilter=value?value.filter:context().filter;
          const actorName = ref => ref?.kind==='named' ? ref.name : project()?.components.find(c=>c.id===context().targetId)?.name||project()?.stage?.name||'この 本文';
          const owners=new Set([actorName(currentActor)]),scan=part=>{
            if(!part||typeof part!=='object')return;
            if(part.fields?.actorRef)owners.add(actorName(part.fields.actorRef.kind==='self'?currentActor:part.fields.actorRef));
            for(const [key,child]of Object.entries(part))if(key!=='units'&&child&&typeof child==='object')Array.isArray(child)?child.forEach(scan):scan(child);
          };scan(node.bodies);scan(node.inputs.rules);
          const location=session()?.nodeMap?.get(node.bodies.body?.[0]?.id)?.surface,range=location?.range||location?.extent,
            preview=range?session().sourceText.slice(range.start,range.end):node.bodies.body?.length?schemaOf(node.bodies.body[0]).label:'まだ ブロックが ないよ';
          group.append(E('p','blockui-trigger-scope',`かえる 本文：${[...owners].join('・')} ／ ${eventText(currentEvent,currentFilter)}\n${preview}
この 本文の きっかけだけを かえるよ。ほかの 本文は そのままだよ。`));
          // The stage touches nothing, so its bodies are not offered ふれたとき.
          const stageOwned = context().targetId === 'stage' && currentActor?.kind !== 'named';
          const event = choice('いつ動く？', 'event', Object.entries(EVENT_LABELS).filter(([key]) => !MEIJIN_EVENTS.includes(key) && !(key === 'touchStart' && stageOwned && currentEvent !== 'touchStart')), currentEvent);
          event.setAttribute('aria-label','いつ動く？');event.parentElement.classList.add('blockui-trigger-choice');
          // ふれたとき: what is touched — the other parts in the order of 作品, the stage edge, and its four sides. A new touch
          // body touches the stage edge until another is chosen.
          const ownerName = actorName(currentActor);
          const touchTargets = [...(project()?.components || []).filter(c => c.name !== ownerName).map(c => [c.name, '「' + c.name + '」']), ...Object.entries(EDGE_TARGETS)];
          if (typeof currentFilter?.target === 'string' && !touchTargets.some(([v]) => v === currentFilter.target)) touchTargets.push([currentFilter.target, isEdgeTarget(currentFilter.target) ? EDGE_TARGETS[currentFilter.target] : '「' + currentFilter.target + '」']);
          const touchTarget = choice('なにに ふれたとき？', 'touch.target', touchTargets, currentFilter?.target ?? '端');
          touchTarget.parentElement.classList.add('blockui-trigger-choice');
          const syncTouch = () => { touchTarget.parentElement.hidden = event.value !== 'touchStart'; };
          syncTouch(); listen(event, 'change', syncTouch);
          const details=E('details','blockui-trigger-details');details.append(E('summary','','もっと えらぶ（だれ・どの キー・どの 合図）'));group.append(details);
          const detailStart=group.children.length;
          const enabled = choice('きっかけ', 'enabled', [['no', '本文だけ'], ['yes', 'きっかけを 決める']], value ? 'yes' : 'no');
          const subject = actor(currentActor, 'actorRef.');
          const filter = choice('どれで動くか', 'filter.kind', [['all', 'すべて'], ['key', 'このキー'], ['message', 'この合図']], currentFilter?.key !== undefined ? 'key' : currentFilter?.message !== undefined ? 'message' : 'all');
          const filterValue = control('キー・合図の文字', 'input', 'filter.value', currentFilter?.key !== undefined ? keySurface(currentFilter.key) : currentFilter?.message ?? '');
          const sync = () => {
            for (const option of filter.options) option.disabled = (option.value === 'key' && event.value !== 'keyDown') || (option.value === 'message' && event.value !== 'message');
            if (filter.selectedOptions[0]?.disabled) filter.value = 'all';
            filterValue.parentElement.hidden = filter.value === 'all';
            for (const child of group.querySelectorAll('input,select'))
              if (child !== enabled&&child!==event&&child!==touchTarget) child.disabled = isLocked() || options.readOnly || enabled.value !== 'yes';
          };
          for(const child of [...group.children].slice(detailStart))details.append(child);
          listen(details,'input',()=>{group.dataset.triggerDetailed='true';group.dataset.triggerMetadataOnly='false';});
          listen(details,'change',()=>{group.dataset.triggerDetailed='true';group.dataset.triggerMetadataOnly='false';});
          sync(); listen(enabled, 'change', sync); listen(event, 'change',()=>{enabled.value='yes';group.dataset.triggerMetadataOnly=String(!value&&group.dataset.triggerDetailed!=='true');sync();}); listen(filter, 'change', sync);
          // What is touched is chosen like the event: a body with no heading keeps its text and takes the partner.
          listen(touchTarget, 'change',()=>{enabled.value='yes';group.dataset.triggerMetadataOnly=String(!value&&group.dataset.triggerDetailed!=='true');sync();});
          readValue = () => {
            if (enabled.value !== 'yes') return undefined;
            const heading = { event: event.value, actorRef: subject.read() };
            if (event.value === 'touchStart') heading.filter = { target: touchTarget.value };
            else if (filter.value !== 'all') heading.filter = filter.value === 'key' ? { key: keyName(filterValue.value) } : { message: filterValue.value };
            else if (currentFilter === null) heading.filter = null;
            return heading;
          };
          restore = () => {
            enabled.value = value ? 'yes' : 'no'; event.value = currentEvent; subject.restore();
            touchTarget.value = currentFilter?.target ?? '端'; syncTouch();
            filter.value = currentFilter?.key !== undefined ? 'key' : currentFilter?.message !== undefined ? 'message' : 'all';
            filterValue.value = currentFilter?.key !== undefined ? keySurface(currentFilter.key) : currentFilter?.message ?? ''; sync();
          };
        }
        Object.defineProperty(group, 'value', { get: () => changed ? readValue() : value,
          set: () => { changed = false; restore(); } });
        group.dataset.focusKey = node.id + ':field:' + field.key;
        // Change events from selects need the same staging as input events.
        listen(group, 'input', () => { changed = true; });
        listen(group, 'change', () => { changed = true; group.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true })); });
        if (!options.readOnly) {
          editInput(group, node, field, annotation);
          if(field.type==='heading')group.append(button('この 本文の きっかけを かえる','heading-commit',()=>flush({explicit:true})),button('かえるのを やめる','heading-cancel',()=>cancel()));
          listen(group, 'change', event => { if (field.type!=='heading'&&event.target.tagName === 'SELECT') flush(); });
          listen(group, 'focusout', event => {
            if (field.type!=='heading'&&!group.contains(event.relatedTarget) && !event.relatedTarget?.closest('[data-blockui-action="cancel"],[data-blockui-action="edit-text"],[data-blockui-text-action]'))
              flushToTarget(event.relatedTarget);
          });
        }
        wrap.append(group);
        return wrap;
      }
      if (field.type === 'unit' || field.type === 'direction') {
        input = E('select', '', null, attrs);
        // The direction words of the language (右へ, 上へ, 前へ …); a field may offer only some of them.
        const choices = field.type === 'unit' ? ['歩', '度', '秒', '回', '番目', '点', '個', '％', 'Hz'].map(v => [v, v])
          : [['right', '右'], ['left', '左'], ['up', '上'], ['down', '下'], ['forward', '前'], ['backward', '後ろ']].filter(([v]) => !field.choices || field.choices.includes(v));
        for (const [v, label] of choices) input.append(E('option', '', label, { value: v }));
        input.value = value;
      } else if (field.type === 'boolean' || field.type === 'qualifier') {
        input = E('select', '', null, attrs);
        const values =
          field.type === 'boolean'
            ? field.key === 'hasElse'
              ? [
                  ['true', 'あり'],
                  ['false', 'なし'],
                ]
              : [
                  ['true', 'あてはまる'],
                  ['false', 'あてはまらない'],
                ]
            : [
                ['none', 'とくに なし'],
                ['exact', '【 】'],
                ['self', '自分の'],
                ['project', '作品の'],
              ];
        for (const [v, l] of values) input.append(E('option', '', l, { value: v }));
        input.value =
          field.type === 'qualifier' ? (value === null ? 'none' : value) : String(value);
        if (field.type === 'qualifier') {
          input.classList.toggle('blockui-qualifier-empty', value === null);
          input.title =
            '使う ばしょ: ' + (values.find((v) => v[0] === input.value)?.[1] || 'とくに なし');
        }
      } else if (field.type === 'comment' || field.multiline && /[\r\n]/.test(value)) {
        input = E('textarea', field.type === 'comment' ? 'blockui-comment-input' : 'blockui-multiline-input', null, {
          ...attrs,
          rows: '1',
          spellcheck: 'false',
        });
        input.value = value;
      } else {
        input = E('input', '', null, {
          ...attrs,
          type: 'text',
          spellcheck: 'false',
          autocomplete: 'off',
          ...(field.type === 'number' ? { inputmode: 'decimal' } : {}),
        });
        input.value = field.type === 'number' && value !== undefined ? decimalSource(value) : edgeShown(node, field, value) ?? '';
        if (node.schemaId === 'Hole:expression' && field.type === 'number') input.dataset.expressionHole = 'true';
      }
      if (annotation) {
        input.placeholder = '※ メモ';
        title.textContent = field.label + '（※から）';
      }
      if (options.readOnly) {
        const text = field.type === 'qualifier' && value === null ? ''
          : input.tagName === 'SELECT' ? input.selectedOptions[0]?.textContent || input.value : input.value;
        wrap.append(title, E('span', 'blockui-readonly-value', text, {
          ...attrs, 'aria-label': field.label + '：' + text,
        }));
        return wrap;
      }
      input.disabled = isLocked();
      if (field.type === 'string' && !annotation) {
        const editText = button('全部見て なおす', 'edit-text', () => {
          if (isLocked()) return;
          const dialog = E('dialog', 'blockui-text-dialog'),
            heading = E('h2', '', '文字を なおす'),
            editor = E('textarea', '', null, { rows: '8', wrap: 'soft', spellcheck: 'false', 'aria-label': '文字の全部' }),
            controls = E('div', 'blockui-text-dialog-controls'),
            apply = E('button', '', '決める', { type: 'button', 'data-blockui-text-action': 'commit' }),
            discard = E('button', '', 'この文字を なおすのを やめる', { type: 'button', 'data-blockui-text-action': 'cancel' });
          editor.value = pending?.input === input ? input.value : String(edgeShown(node, field, index.get(node.id)?.node.fields[field.key] ?? value) ?? '');
          editor.dataset.focusKey = node.id + ':full-text:' + field.key;
          const close = committed => {
            if (committed && !flush({ focus: false }).ok) { editor.focus(); return; }
            dialog.close(); dialog.remove();
            if (!committed) { cancelField(); render({ force:true }); }
          };
          editInput(editor, node, field, false);
          listen(apply, 'click', () => close(true));
          listen(discard, 'click', () => close(false));
          listen(dialog, 'cancel', event => { event.preventDefault(); close(false); });
          listen(dialog, 'keydown', event => {
            if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); close(false); }
          }, { capture: true });
          controls.append(apply, discard); dialog.append(heading, editor, controls); root.append(dialog);
          dialog.showModal(); editor.focus();
          editor.setSelectionRange(input.selectionStart ?? editor.value.length, input.selectionEnd ?? editor.value.length);
        }, { 'aria-label': '文字を全部見て なおす' });
        editText.classList.add('blockui-edit-text'); wrap.append(editText);
      }
      input.dataset.focusKey = node.id + ':' + (annotation ? 'annotation:' : 'field:') + field.key;
      if (input.tagName === 'INPUT') {
        listen(input, 'input', () => {
          input.title = input.value;
          scheduleGeometry();
        });
        input.title = input.value;
      }
      if (field.key === 'hasElse') {
        listen(input, 'change', () => {
          const result = operate({ type: 'else', id: node.id, enabled: input.value === 'true' });
          if (!result.ok) {
            input.value = node.fields.hasElse ? 'true' : 'false';
            input.focus({ preventScroll: true });
          }
        });
      } else editInput(input, node, field, annotation);
      if (field.type === 'name' || field.type === 'string') {
        const suggestions = namesFor(node, field);
        if (suggestions.length) {
          const dl = E('datalist', '', null, {
            id: viewId + '-options-' + node.id + '-' + field.key,
          });
          for (const name of suggestions) dl.append(E('option', '', null, { value: name }));
          input.setAttribute('list', dl.id);
          wrap.append(dl);
        }
      }
      wrap.append(title, input);
      return wrap;
    }
    function markDrop(n, location) {
      n.dataset.blockuiDrop = 'true';
      n.dataset.parentId = location.parentId;
      if (location.body) {
        n.dataset.blockuiBody = location.body;
        n.dataset.insertIndex = location.index;
      } else {
        n.dataset.blockuiInput = location.input;
        if (location.index !== undefined) n.dataset.slotIndex = location.index;
      }
      n.classList.toggle('blockui-chosen-destination', sameLocation(destination, location));
    }
    // Between two blocks the place is a thin line; the last place of a body keeps 「＋ ここに入れる」 (E-07).
    function insertion(parentId, body, pos, end = false) {
      const b = button(
        '＋ ここに入れる',
        'body-insert',
        (event) => chooseDestination({ parentId, body, index: pos }, { keyboard: event.detail === 0 }),
        { 'aria-label': (pos + 1) + '番目の ばしょに ブロックを入れる' },
      );
      b.classList.add('blockui-insertion');
      if (end) b.classList.add('blockui-insertion-end');
      b.disabled = isLocked();
      markDrop(b, { parentId, body, index: pos });
      return b;
    }
    function moveStart(node, type = 'move') {
      if (!flush().ok || isLocked()) return;
      for (const menu of root.querySelectorAll('.blockui-actions[open]')) menu.open = false;
      selection(node.id);
      moving = { id: node.id, type };
      destination = null;
      announce(type === 'copy' ? 'もう1つ 作る ところを えらんでね'
        : type === 'run' ? 'この ブロックから 下の ' + runIds(node.id).length + 'この ブロックを もっていく ところを えらぶか、そのまま 運んでね'
          : 'どこへ もっていくか えらんでね');
      updateControls();
      showImpliedDestination();

      // The menu is now hidden; Escape must remain inside this editor.
      focus({ id: node.id });
    }
    function completeMove(location, source = moving) {
      if (!source) return;
      const info = index.get(source.id);
      if (!info) {
        cancel();
        return;
      }
      const kind = schemaOf(info.node).category;
      if ((kind === 'statement') !== !!location.body) {
        announce('つなぐブロックは 本文へ、はめるブロックは あいている ところへ もっていってね', true);
        return;
      }
      const parent = index.get(location.parentId), carried = source.type === 'run' ? runIds(source.id) : [source.id];
      if (
        source.type !== 'copy' &&
        carried.some(id => location.parentId === id || parent?.ancestors.includes(id))
      ) {
        announce('自分の 中には もっていけないよ', true);
        return;
      }
      if (kind === 'statement') {
        // An empty enclosure moved above blocks takes them in, as a new one does (E-03).
        const wraps = source.type === 'move' && wrapCount(schemaOf(info.node), info.node, location, source.id);
        const result = operate({
          type: source.type === 'copy' ? 'duplicate' : source.type === 'run' ? 'move-run' : wraps ? 'wrap' : 'move',
          id: source.id,
          ...location,
        });
        if (result.ok) {
          moving = null;
          destination = null;
          render({ force: true });
          // The block moved keeps the focus, as after putting one in or あとへ (AX-10).
          const placed = placedAt(location, info.node.schemaId);
          if (placed) focus({ id: placed });
          if (wraps) attendEmptyValue(placed);
        }
        return;
      }
      if (source.type === 'copy') {
        const result = operate({ type: 'expression', ...location, node: copy(info.node) });
        if (result.ok) {
          moving = null;
          render({ force: true });
        }
        return;
      }
      if (sameLocation(listLocation(info), location)) {
        moving = null;
        announce('もとと 同じ ばしょだよ');
        updateControls();
        return;
      }
      moving = null;
      replacement = { sourceId: source.id, location };
      notifyPending();
      renderReplacement();
      updateControls();
    }
    function renderReplacement() {
      promptArea.replaceChildren();
      promptArea.hidden = !replacement;
      if (!replacement) return;
      const title = E('h4', '', 'もとの ばしょに 入れる ブロックを えらぶ'),
        note = E(
          'p',
          '',
          'もとの ばしょを 空っぽには できないよ。えらんだ ブロックを はじめの 中身で おいてから、もっていく 先へ つなぐよ。',
        ),
        select = E('select', '', null, {
          'aria-label': 'もとの ばしょに 入れる ブロック',
          'data-blockui-replacement-schema': 'true',
        });
      // The same blocks as the list at this level, named by the list's なかま (FCB-21).
      const advanced = document.body.dataset.uiLevel === 'advanced';
      for (const s of BLOCK_SCHEMAS.filter((x) => x.category === 'expression' && !x.draftOnly && (advanced || (x.id !== 'QuantityLiteral' && !ADVANCED_ONLY_SCHEMA_IDS.has(x.id)))))
        select.append(E('option', '', (PALETTE_GROUP_LABELS.get(blockPaletteGroup(s)) || s.palette) + ' / ' + s.label, { value: s.id }));
      select.value = 'NumberLiteral';
      const accept = button('このブロックを おいて もっていく', 'confirm-expression-move', () => {
        const action = replacement;
        replacement = null;
        onPending(null);
        const result = operate({
          type: 'expression-move',
          id: action.sourceId,
          ...action.location,
          replacement: createBlock(select.value, { idPrefix: viewId }),
        });
        if (!result.ok) {
          replacement = action;
          notifyPending();
        }
        renderReplacement();
        updateControls();
      });
      promptArea.append(
        title,
        note,
        select,
        accept,
        button('もっていくのを やめる', 'cancel-expression-move', () => cancel()),
      );
      select.focus();
    }
    function placeActions(menu, commands, { reveal = false } = {}) {
      if (!menu.open || !menu.isConnected) return;
      const rectView = workspace.getBoundingClientRect(),
        bounds = {
          left: rectView.left,
          top: rectView.top,
          width: workspace.clientWidth,
          height: workspace.clientHeight,
          right: rectView.left + workspace.clientWidth,
          bottom: rectView.top + workspace.clientHeight,
        };
      if (!bounds.width || !bounds.height) return;
      commands.style.transform = '';
      commands.style.maxWidth = Math.max(120, bounds.width - 16) + 'px';
      commands.style.maxHeight = Math.max(80, Math.min(330, bounds.height - 16)) + 'px';
      if (doc.defaultView.getComputedStyle(commands).position === 'static') {
        if (reveal) commands.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
      }
      const rect = commands.getBoundingClientRect(),
        dx = Math.max(bounds.left + 8 - rect.left, Math.min(0, bounds.right - 8 - rect.right)),
        dy = Math.max(bounds.top + 8 - rect.top, Math.min(0, bounds.bottom - 8 - rect.bottom));
      commands.style.transform = 'translate(' + dx / zoom + 'px,' + dy / zoom + 'px)';
    }
    // A selected field's tools are placed with the block's tools (placeNodeTools).
    function placeSlotHead(slot){
      if(slot?.isConnected)placeNodeTools();
    }
    function nodeTools(node, info) {
      const schema = schemaOf(node),
        tools = E('div', 'blockui-node-tools');
      if (schema.category === 'target' || schema.category === 'script') return tools;
      const dragHandle = button('⠿', 'drag-handle', () => selection(node.id), {
        'aria-label': schema.label + 'を おしたまま 運ぶ',
        'data-blockui-drag': 'node',
        'data-block-id': node.id,
      });
      dragHandle.classList.add('blockui-drag-handle');
      dragHandle.disabled = isLocked();
      tools.append(dragHandle);
      const menu = E('details', 'blockui-actions'),
        summary = E('summary', 'blockui-selection-actions', 'ほかのそうさ', {
          'aria-label': schema.label + 'のほかのそうさ',
          'data-blockui-action': 'more',
        }),
        commands = E('div', 'blockui-action-items');
      menu.append(summary, commands);
      tools.append(menu);
      listen(summary, 'click', (event) => {
        event.stopPropagation();
        selection(node.id);
      });
      listen(menu, 'toggle', () => {
        if (!menu.open) return;
        for (const other of root.querySelectorAll('.blockui-actions[open]'))
          if (other !== menu) other.open = false;
        placeActions(menu, commands, { reveal: true });
      });
      // Moving a block is 「もっていく」: 「動かす」 is only for the characters and ▶ 動かす (E-05, §4).
      const move = button('ほかへ もっていく', 'move', () => moveStart(node), { 'data-block-id': node.id }),
        duplicate = button(
          '同じものをもう1つ作る',
          'duplicate',
          () => {
            if (info.body)
              operate({
                type: 'duplicate',
                id: node.id,
                parentId: info.parentId,
                body: info.body,
                index: info.index + 1,
              });
            else moveStart(node, 'copy');
          },
          { 'data-block-id': node.id },
        );
      commands.append(move);
      if (info.body) {
        const siblings = index.get(info.parentId)?.node.bodies[info.body] || [];
        // Several blocks go together only when asked (E-06): this block and the ones below it in the same body.
        if (info.index < siblings.length - 1)
          commands.append(button('ここから下を まとめて もっていく', 'move-run', () => moveStart(node, 'run'), { 'data-block-id': node.id }));
      }
      commands.append(duplicate);
      if (info.body) {
        const siblings = index.get(info.parentId)?.node.bodies[info.body] || [];
        const up = button(
            '↑ まえへ',
            'move-up',
            () =>
              operate({
                type: 'move',
                id: node.id,
                parentId: info.parentId,
                body: info.body,
                index: info.index - 1,
              }),
            { 'aria-label': schema.label + 'を まえへ', 'data-block-id': node.id },
          ),
          down = button(
            '↓ あとへ',
            'move-down',
            () =>
              operate({
                type: 'move',
                id: node.id,
                parentId: info.parentId,
                body: info.body,
                index: info.index + 2,
              }),
            { 'aria-label': schema.label + 'を あとへ', 'data-block-id': node.id },
          );
        up.disabled = info.index === 0;
        down.disabled = info.index === siblings.length - 1;
        tools.insertBefore(up, menu);
        tools.insertBefore(down, menu);
        // One press to delete the selected block (E-05); undo brings it back.
        if (!schema.draftOnly)
          tools.insertBefore(button('けす', 'remove-quick', () => removeBlock(node, info), {
            'aria-label': schema.label + (schema.bodies.length ? 'と 中の ブロックを けす' : 'を けす'), 'data-block-id': node.id }), menu);
      }
      const who = actorTool(node);
      if (who) tools.insertBefore(who, menu);
      if (info.body) {
        commands.append(
          button(
            schema.bodies.length ? 'このまとまりと中のブロックをけす' : 'このブロックをけす',
            'remove',
            () => removeBlock(node, info),
            { 'data-block-id': node.id },
          ),
        );
        if (!['NoOperation', 'CommentLine'].includes(schema.id))
          commands.append(
            button(
              'いったん 使わない',
              'replace-noop',
              () =>
                operate({
                  type: 'replace',
                  id: node.id,
                  node: createBlock('NoOperation', { idPrefix: viewId }),
                }),
              { 'data-block-id': node.id, 'aria-label': schema.label + 'を 何もしないに 入れかえる' },
            ),
          );
      } else if (info.input && document.body.dataset.uiLevel !== 'entry') {
        // はじめて has no 計算を入れる in its values (E-12).
        commands.append(
          button('計算を入れる', 'replace-expression', () => chooseDestination(listLocation(info)), {
            'data-block-id': node.id,
          }),
        );
      }
      if (schema.bodies.length || schema.inputs.length)
        commands.append(
          button(
            collapsed.has(node.id) ? '開く' : 'たたむ',
            'collapse',
            () => {
              if (!flush().ok) return;
              collapsed.has(node.id) ? collapsed.delete(node.id) : collapsed.add(node.id);
              render({ force: true });
            },
            { 'aria-expanded': !collapsed.has(node.id), 'data-block-id': node.id },
          ),
        );
      for (const field of schema.fields.filter((f) => f.key === 'hasElse'))
        commands.append(fieldControl(node, field));
      if (schema.annotations.some((a) => a.editable !== false))
        commands.append(
          button(
            'メモ',
            'annotations',
            () => {
              openAnnotations.add(node.id);
              render({ force: true });
              const details = [...workspace.querySelectorAll('.blockui-annotations')].find(
                (n) => n.parentElement?.parentElement?.dataset.blockId === node.id,
              );
              details?.querySelector('input')?.focus();
            },
            { 'data-block-id': node.id },
          ),
        );
      for (const b of tools.querySelectorAll('button'))
        if (b.dataset.blockuiAction !== 'collapse' && isLocked()) b.disabled = true;
      return tools;
    }
    // The blocks 「ここから下を まとめて もっていく」 carries: the block and the ones after it in its body.
    function runIds(id) {
      const info = index.get(id), siblings = info?.body ? index.get(info.parentId)?.node.bodies[info.body] || [] : [];
      return info?.body ? siblings.slice(info.index).map(n => n.id) : [id];
    }
    function removeBlock(node, info = index.get(node.id)) {
      const result = operate({ type: 'remove', id: node.id });
      if (!result.ok && index.get(info?.parentId)?.node.schemaId !== 'Script')
        announce(errorText(result.error || result.reason) + '。「いったん 使わない」で 入れかえるか、まとまりごと けしてね', true);
      if (result.ok) keepKeys();
      return result;
    }
    // After a block is deleted (けす, a drop on the list, Delete) or a やめる is pressed, the keys stay in the block view: on
    // the block now selected, else on the workspace. On the page, the next Delete would delete the whole part (E2-01).
    function keepKeys() {
      const id = session()?.blockSelection;
      ((id && locationElement({ id })) || workspace).focus({ preventScroll: true });
    }
    function statementBody(parent, slot) {
      const enabled = !slot.when || parent.fields[slot.when];
      if (!enabled) return null;
      const children = parent.bodies[slot.key],
        box = E('section', 'blockui-body', null, {
          'aria-label': slot.label,
          'data-blockui-body-wrapper': slot.key,
          'data-block-owner': parent.id,
          tabindex: '-1',
        }),
        key = parent.id + ':' + slot.key,
        pages = Math.max(1, Math.ceil(children.length / BODY_PAGE));
      let p = Math.min(bodyPages.get(key) || 0, pages - 1);
      bodyPages.set(key, p);
      box.append(
        E('div', 'blockui-body-label', slot.key === 'elseBody' ? 'そうでなければ' : slot.label),
      );
      const ranges = blockBodyRanges(children.length, p, bodyExtraPages.get(key), BODY_PAGE);
      const branchLine = branchSourceLines.get(key);
      if (branchLine) {
        box.dataset.sourceLine = branchLine;
        const diagnostics = diagnosticsByLine.get(branchLine) || [];
        if (diagnostics.length) {
          box.classList.add('blockui-diagnostic');
          const ul = E('ul', 'blockui-node-diagnostics');
          for (const d of diagnostics) { const item = E('li', 'diagnostic-help', childDiagnosticText(d, session()?.sourceText)); appendDiagnosticDetails(item, d); ul.append(item); }
          box.append(ul);
        }
      }
      const showPage = (page) => {
        if (!bodyExtraPages.has(key)) bodyExtraPages.set(key, new Set());
        bodyExtraPages.get(key).add(page);
        render({ force: true });
      };
      let end = 0;
      // An empty enclosure shows only its hole (〔くり返すことを えらぶ〕) as the place to put a block in (E-03).
      if (children.length === 1 && children[0].schemaId === 'Hole:statement') {
        const hole = renderNode(children[0]);
        markDrop(hole, { parentId: parent.id, body: slot.key, index: 0 });
        hole.classList.add('blockui-hole-target');
        // The whole hole is the place: pressing it chooses the place, as 「＋ ここに入れる」 does.
        if (!options.readOnly)
          listen(hole, 'click', (event) => {
            if (event.target.closest('button,input,select,textarea,summary') || Date.now() < suppressClickUntil) return;
            chooseDestination({ parentId: parent.id, body: slot.key, index: 0 }, { keyboard: event.detail === 0 });
          });
        box.append(hole);
        return box;
      }
      for (const [begin, limit] of ranges) {
        if (begin > end) {
          const gap = E('div', 'blockui-body-gap'),
            first = Math.floor(end / BODY_PAGE),
            last = Math.floor((begin - 1) / BODY_PAGE);
          gap.append(
            button('つづきのブロックを見せる', 'body-gap-next', () => showPage(first)),
            E('span', '', `${end + 1}〜${begin}番目の ブロックは かくれているよ`),
          );
          if (last !== first)
            gap.append(button('すぐ前のブロックを見せる', 'body-gap-previous', () => showPage(last)));
          box.append(gap);
        }
        for (let i = begin; i < limit; i++) {
          box.append(insertion(parent.id, slot.key, i));
          box.append(renderNode(children[i]));
        }
        box.append(insertion(parent.id, slot.key, limit, limit === children.length));
        end = limit;
      }
      if (end < children.length) {
        const nextPage = Math.floor(end / BODY_PAGE),
          more = button('つづきを見せる', 'body-more', () => showPage(nextPage), {
            'data-body-more-key': key,
            'data-body-more-page': nextPage,
          });
        more.classList.add('blockui-body-more');
        box.append(more);
      }
      if (!children.length) box.append(E('p', 'blockui-empty', parent.schemaId === 'Script'
        ? 'ブロックが まだ ないよ。「＋ ここに入れる」を おして、ブロックを 入れてね。動く お手本は「お手本を開く」で 見られるよ。'
        : 'ここに ブロックを 入れられるよ'));
      return box;
    }
    function expressionSlot(parent, slot, child, i) {
      const location = {
          parentId: parent.id,
          input: slot.key,
          ...(i === undefined ? {} : { index: i }),
        },
        label = slot.labels?.[i] || slot.label + (i === undefined ? '' : ' ' + (i + 1)),
        box = E('div', 'blockui-input-slot', null, { 'aria-label': label });
      if (slot.type === 'expression') markDrop(box, location);
      const head = E('div', 'blockui-slot-head');
      head.append(E('span', 'blockui-slot-label', label));
      if (slot.type === 'expression' && valueToolsShown()) head.append(...valueTools(location, label, child));
      if (slot.multiple && slot.variadic) {
        const n = parent.inputs[slot.key].length;
        const up = button(
            '↑',
            'variadic-up',
            () =>
              operate({
                type: 'variadic-move',
                parentId: parent.id,
                input: slot.key,
                index: i,
                toIndex: i - 1,
              }),
            { 'aria-label': label + 'を前へ' },
          ),
          down = button(
            '↓',
            'variadic-down',
            () =>
              operate({
                type: 'variadic-move',
                parentId: parent.id,
                input: slot.key,
                index: i,
                toIndex: i + 2,
              }),
            { 'aria-label': label + 'を後ろへ' },
          ),
          remove = button(
            '外す',
            'variadic-remove',
            () =>
              operate({ type: 'variadic-remove', parentId: parent.id, input: slot.key, index: i }),
            { 'aria-label': label + 'を外す' },
          );
        up.disabled = isLocked() || i === 0;
        down.disabled = isLocked() || i === n - 1;
        remove.disabled = isLocked() || n <= slot.minItems;
        head.append(up, down, remove);
      }
      // A field's tools show when it has some; a name alone is its accessible name (E-12: no noise for beginners).
      const shown = renderNode(child);
      // A number in its place is read by the place's name (AX-09).
      if (child?.schemaId === 'NumberLiteral') shown.querySelector(':scope > .blockui-node-content [data-blockui-field="value"]')?.setAttribute('aria-label', label);
      box.append(shown);
      if (head.childElementCount > 1) box.append(head);
      if (!options.readOnly && parent.schemaId === 'ListRead' && slot.key === 'list' && child.schemaId === 'StringLiteral') {
        const recovery = E('div', 'blockui-list-repair'), select = E('select', '', null, { 'aria-label':'文字の代わりに使うリストを えらぶ' });
        select.append(E('option', '', 'リストを えらぶ', { value:'' }));
        const localContext = subjectContext(parent),
          candidates = hintCandidates(project(), localContext.targetId, { source:session()?.sourceText || '', ...localContext })
          .filter(h => h.id.startsWith('read:') && h.binding?.kind === 'list' && h.enabled);
        for (const [i,h] of candidates.entries()) select.append(E('option', '', h.text, { value:String(i) }));
        select.disabled = isLocked() || !candidates.length;
        listen(select, 'change', () => { if (select.value !== '') operate({ type:'expression', ...location, node:nodeForSearchHint(candidates[Number(select.value)], project(), localContext) }); });
        recovery.append(E('span', '', '「 」で かこんだ 名前は 文字です。' + (candidates.length ? '使う リストを えらびなおせます。' : '使える リストが ありません。')), select);
        box.append(recovery);
      }
      return box;
    }
    function renderInput(node, slot, i) {
      if (!slot.multiple) return expressionSlot(node, slot, node.inputs[slot.key]);
      if (i !== undefined) return expressionSlot(node, slot, node.inputs[slot.key][i], i);
      const children = node.inputs[slot.key],
        wrap = E('div', 'blockui-multiple-inputs', null, { 'aria-label': slot.label }),
        key = node.id + ':' + slot.key,
        pages = Math.max(1, Math.ceil(children.length / INPUT_PAGE)),
        p = Math.min(inputPages.get(key) || 0, pages - 1);
      inputPages.set(key, p);
      for (let i = p * INPUT_PAGE; i < Math.min(children.length, (p + 1) * INPUT_PAGE); i++) {
        if (i > p * INPUT_PAGE) wrap.append(E('span', 'blockui-separator', slot.separator || '、'));
        wrap.append(expressionSlot(node, slot, children[i], i));
      }
      if (slot.variadic) {
        const add = button(
          '＋',
          'variadic-add',
          () => {
            const result = operate({
              type: 'variadic-insert',
              parentId: node.id,
              input: slot.key,
              index: children.length,
              node: createBlock('NumberLiteral', { idPrefix: viewId }),
            });
            if (result.ok) {
              inputPages.set(key, Math.floor(children.length / INPUT_PAGE));
              render({ force: true });
            }
          },
          {
            'data-parent-id': node.id,
            'data-blockui-input': slot.key,
            'aria-label': slot.label + 'を入れる',
          },
        );
        add.disabled = isLocked() || children.length >= slot.maxItems;
        wrap.append(add);
      }
      if (pages > 1) {
        const paging = E('div', 'blockui-paging'),
          back = button('前の入力', 'input-prev', () => {
            inputPages.set(key, p - 1);
            render({ force: true });
          }),
          next = button('次の入力', 'input-next', () => {
            inputPages.set(key, p + 1);
            render({ force: true });
          });
        back.disabled = p === 0;
        next.disabled = p === pages - 1;
        paging.append(
          back,
          E('span', '', p + 1 + ' / ' + pages + ' (' + children.length + 'こ)'),
          next,
        );
        wrap.append(paging);
      }
      return wrap;
    }
    // The 「…」 after a sentence opens what changes it beyond its values (E-14): time, a second direction, 計算 …
    function extraDisclosure(node, label) {
      const extra = editDisclosure(node, 'extra', '…', 'blockui-extra'), extraControls = E('div', 'blockui-extra-controls');
      extra.querySelector('summary').setAttribute('aria-label', label);
      extra.append(extraControls);
      return { extra, extraControls };
    }
    // E-02: a value whose unit the sentence fixes (回る → 度, 進む・動く → 歩, 待つ・〜秒かけて → 秒, 大きさ → ％ …) shows the
    // unit as text, with no unit to choose: a number is its own field (1 秒), a range has the unit on both ends (1 秒から
    // 3 秒の どれか, as the code writes it) and no unit after it. A quantity written with another unit shows the unit
    // written, next to a button that puts the fixed one (「度に なおす」); ⚠ たしかめる explains it.
    function roleUnit(node, key, index) {
      const schema = schemaOf(node), form = SENTENCE_FORMS.find(item => item.kind === schema?.kind && (!item.op || item.op === schema.discriminator?.value));
      const path = key + (index === undefined || index === null ? '' : '.' + index);
      return form?.roleSlots?.find(role => role.path === path)?.unit || null;
    }
    function flatNumber(literal, location) {
      const label = slotLabel(location), wrap = E('span', 'blockui-input-slot blockui-flat-value', null, { 'data-block-id': literal.id, 'aria-label': label });
      if (!options.readOnly) markDrop(wrap, location);
      wrap.append(fieldControl(literal, BLOCK_SCHEMA_BY_ID.get('NumberLiteral').fields.find(f => f.key === 'value')));
      // The number is read by its place (秒数, よこの歩数 …), not as 「数」 (AX-09).
      if (label) wrap.querySelector('[data-blockui-field="value"]')?.setAttribute('aria-label', label);
      if (valueToolsShown()) {
        const head = E('div', 'blockui-slot-head');
        head.append(E('span', 'blockui-slot-label', label), ...valueTools(location, label, literal));
        wrap.append(head);
      }
      return wrap;
    }
    function slotLabel(location) {
      const parent = index.get(location.parentId)?.node, slot = schemaOf(parent)?.inputs.find(s => s.key === location.input);
      if (parent?.schemaId === 'QuantityLiteral') return slotLabel(listLocation(index.get(parent.id)) || {}) || '数';
      return slot ? slot.labels?.[location.index] || slot.label + (location.index === undefined ? '' : ' ' + (location.index + 1)) : '';
    }
    // ちがう ものに かえる and 計算を入れる (E-12): not at はじめて; at かんたん in the 「…」 after the sentence; at くわしく
    // with the selected field.
    function valueToolsShown() {
      return !options.readOnly && document.body.dataset.uiLevel === 'advanced';
    }
    function valueTools(location, label, child) {
      const types = E('select', 'blockui-value-type', null, { 'aria-label': label + 'の中身の しゅるい', 'data-blockui-value-type': 'true' });
      for (const [value, text] of [['','ちがう ものに かえる'],['NumberLiteral','数'],['StringLiteral','文字'],['SensorRead:答え','答え'],['VariableRead','名前'],['expression','計算']])
        types.append(E('option', '', text, { value }));
      types.disabled = isLocked();
      listen(types, 'change', () => {
        const kind = types.value; if (!kind) return;
        const local = pending && (pending.id === child.id || index.get(pending.id)?.ancestors.includes(child.id));
        if (pending?.composing) { announce('日本語の へんかんを おわらせてから えらんでね', true); types.value=''; return; }
        const text = local ? pending.input.value : child.schemaId === 'StringLiteral' ? child.fields.value : '';
        if (local) cancelField();
        if (kind === 'expression') { chooseDestination(location); return; }
        const next = createBlock(kind);
        if (kind === 'StringLiteral') next.fields.value = text;
        const result = operate({ type:'expression', ...location, node:next });
        if (result.ok) {
          const current = index.get(location.parentId)?.node.inputs[location.input], value = location.index === undefined ? current : current?.[location.index];
          if (value) focus({ id:value.id });
        }
      });
      const b = button('計算を入れる', 'slot-select', () => chooseDestination(location), {
        'aria-label': label + 'に計算を入れる',
      });
      b.disabled = isLocked();
      return [types, b];
    }
    // かんたん: a sentence's 「…」 holds 「ちがう ものに かえる」 and 「計算を入れる」 for each value in it (E-12).
    function addValueToolsToExtra(node, box, main) {
      if (options.readOnly || document.body.dataset.uiLevel !== 'basic' || schemaOf(node)?.category !== 'statement') return;
      // The sentence's own parts (its bodies are not in main): its values and those of the calculations in it.
      const places = [...main.querySelectorAll('.blockui-input-slot[data-blockui-drop]')].filter(n => !n.closest('.blockui-extra'));
      if (!places.length) return;
      let extra = main.querySelector(':scope > .blockui-extra');
      if (!extra) { extra = extraDisclosure(node, schemaOf(node).label + 'の 中身を かえる').extra; main.append(extra); }
      const controls = extra.querySelector(':scope > .blockui-extra-controls');
      for (const place of places) {
        const location = locationFromElement(place), parent = index.get(location.parentId)?.node,
          current = parent?.inputs[location.input], child = location.index === undefined ? current : current?.[location.index];
        if (!child) continue;
        const row = E('div', 'blockui-value-row'), label = place.getAttribute('aria-label') || slotLabel(location);
        row.append(E('span', 'blockui-slot-label', label), ...valueTools(location, label, child));
        controls.append(row);
      }
    }
    // 「度に なおす」: a quantity with another unit takes the fixed one; 右に（15秒）度回る, a quantity in a quantity, becomes
    // 右に15度回る (the inner unit goes).
    function unitRepair(quantity, unit, nested) {
      if (options.readOnly) return doc.createDocumentFragment();
      const repair = button(unit + 'に なおす', 'unit-repair', () => nested
          ? operate({ type: 'replace', id: nested.id, node: copy(nested.inputs.value) })
          : operate({ type: 'field', id: quantity.id, key: 'unit', value: unit }),
        { 'aria-label': 'たんいを ' + unit + 'に なおす', 'data-block-id': (nested || quantity).id });
      repair.disabled = isLocked();
      return repair;
    }
    function unitValue(node, key, index, unit) {
      const slot = schemaOf(node).inputs.find(s => s.key === key),
        child = index === undefined ? node.inputs[key] : node.inputs[key]?.[index],
        quantity = child?.schemaId === 'QuantityLiteral' ? child : null,
        nested = quantity?.fields.unit === unit && quantity.inputs.value?.schemaId === 'QuantityLiteral' ? quantity.inputs.value : null,
        shown = nested || quantity,
        inner = shown ? shown.inputs.value
          : child?.schemaId === 'UnitlessRead' && child.inputs.value?.schemaId === 'NumberLiteral' ? child.inputs.value : child,
        written = shown?.fields.unit || unit,
        text = s => E('span', 'blockui-phrase-text blockui-unit-text', s), parts = [];
      // The place of the value is the sentence's own (a calculation put there takes the place of the number and its unit).
      const at = { parentId: node.id, input: key, ...(index === undefined ? {} : { index }) };
      if (inner?.schemaId === 'NumberLiteral' || inner?.schemaId === 'Hole:expression') parts.push(flatNumber(inner, at), text(written));
      else if (inner?.schemaId === 'BuiltinCall:乱数' && inner.inputs.args?.length === 2) {
        const args = BLOCK_SCHEMA_BY_ID.get('BuiltinCall:乱数').inputs.find(s => s.key === 'args');
        parts.push(renderInput(inner, args, 0), text(written + 'から'), renderInput(inner, args, 1), text(written + 'のどれか'));
      } else if (shown) parts.push(renderInput(shown, BLOCK_SCHEMA_BY_ID.get('QuantityLiteral').inputs.find(s => s.key === 'value')), text(written));
      else parts.push(renderInput(node, slot, index), text(written));
      if (shown && written !== unit) parts.push(unitRepair(quantity, unit, nested));
      return parts;
    }
    function renderMotionBlock(node, schema, main) {
      const value = schema.discriminator.value, { extra, extraControls } = extraDisclosure(node, schema.label + 'を なおす');
      const text = s => E('span', 'blockui-phrase-text', s), fieldOf = key => schema.fields.find(f => f.key === key);
      const quantity = (key, unit, index) => main.append(...unitValue(node, key, index, unit));
      const actor = fieldOf('actorRef');
      if (actor) main.append(fieldControl(node, actor));
      // The time comes first. Of the move blocks, はじめて adds it only to いまのばしょから動く (not to 決めたばしょへ行く,
      // 前へ進む or a 〜のところへ行く of a work made at another level); a time already written can always be taken off.
      const timeLabel = { GOTO: '時間をかけて行く', GOTO_PART: '時間をかけて行く', MOVE_BY: '時間をかけて動く', MOVE: '時間をかけて進む', TURN_RIGHT: '時間をかけて回る', TURN_LEFT: '時間をかけて回る' }[value];
      if (node.inputs.seconds) {
        quantity('seconds', '秒'); main.append(text('かけて、'));
        extraControls.append(button('時間を外す', 'motion-untimed', () => operate({ type: 'optional-input-remove', parentId: node.id, input: 'seconds' })));
      } else if (doc.body?.dataset.uiLevel !== 'entry' || !['GOTO', 'MOVE', 'GOTO_PART'].includes(value))
        extraControls.append(button(timeLabel, 'motion-timed', () => { const seconds = createBlock('NumberLiteral', { idPrefix: viewId }); seconds.fields.value = 1; return operate({ type: 'expression', parentId: node.id, input: 'seconds', node: seconds }); }));
      const steps = n => { const literal = createBlock('NumberLiteral', { idPrefix: viewId }); literal.fields.value = n; return literal; };
      if (value === 'GOTO' || value === 'MOVE_BY') {
        main.append(text(value === 'GOTO' ? '画面の左下のはしから、' : 'いまのばしょから、'));
        const both = !!(node.inputs.x && node.inputs.y);
        if (value === 'MOVE_BY' && !both) {
          // One direction: 右・左・上・下 in one choice; a choice on the other axis moves the steps there (one undo step),
          // and the axis left behind goes back to its plain direction (右・上), as the code read back has it.
          const key = node.inputs.x ? 'x' : 'y', current = node.fields[key === 'x' ? 'xDir' : 'yDir'];
          const select = E('select', 'blockui-motion-direction', null, { 'aria-label': schema.label + 'の 向き', 'data-block-id': node.id, 'data-blockui-action': 'motion-direction' });
          for (const [v, word] of [['right', '右'], ['left', '左'], ['up', '上'], ['down', '下']]) select.append(E('option', '', word, { value: v }));
          select.value = current; select.disabled = isLocked() || !!options.readOnly;
          listen(select, 'change', () => {
            const to = select.value, toKey = ['right', 'left'].includes(to) ? 'x' : 'y', replacement = structuredClone(node);
            if (toKey !== key) { replacement.inputs[toKey] = replacement.inputs[key]; delete replacement.inputs[key]; replacement.fields[key === 'x' ? 'xDir' : 'yDir'] = key === 'x' ? 'right' : 'up'; }
            replacement.fields[toKey === 'x' ? 'xDir' : 'yDir'] = to;
            if (!operate({ type: 'replace', id: node.id, node: replacement }).ok) select.value = current;
          });
          main.append(select, text('へ')); quantity(key, '歩');
        } else {
          // 決めたばしょへ行く writes 右へ・上へ as words; a choice is shown only where the code wrote 左へ or 下へ.
          for (const [key, dirKey, plain] of [['x', 'xDir', 'right'], ['y', 'yDir', 'up']]) {
            if (!node.inputs[key]) continue;
            if (key === 'y' && node.inputs.x) main.append(text('、'));
            if (value === 'GOTO' && node.fields[dirKey] === plain) main.append(text(plain === 'right' ? '右へ' : '上へ'));
            else main.append(fieldControl(node, fieldOf(dirKey)), text('へ'));
            quantity(key, '歩');
          }
        }
        main.append(text(value === 'GOTO' ? 'のばしょへ行く' : '動く'));
        if (value === 'MOVE_BY') {
          if (!node.inputs.y) extraControls.append(button('＋ たてにも動く', 'motion-leg-add-y', () => operate({ type: 'expression', parentId: node.id, input: 'y', node: steps(10) })));
          if (!node.inputs.x) extraControls.append(button('＋ よこにも動く', 'motion-leg-add-x', () => operate({ type: 'expression', parentId: node.id, input: 'x', node: steps(10) })));
          // Taking a leg off also sets its direction back to 右・上 (the code no longer writes it).
          const removeLeg = key => { const replacement = structuredClone(node); delete replacement.inputs[key]; replacement.fields[key === 'x' ? 'xDir' : 'yDir'] = key === 'x' ? 'right' : 'up'; return operate({ type: 'replace', id: node.id, node: replacement }); };
          if (both) extraControls.append(button('たてを外す', 'motion-leg-remove-y', () => removeLeg('y')),
            button('よこを外す', 'motion-leg-remove-x', () => removeLeg('x')));
        }
      } else if (value === 'MOVE') {
        main.append(fieldControl(node, fieldOf('direction')), text('へ')); quantity('args', '歩', 0);
        main.append(text(node.fields.direction === 'backward' ? '動く' : '進む'));
      } else if (value === 'GOTO_PART') {
        // The other is a part of the work (not the body's owner) or the mouse.
        const target = node.inputs.args[0];
        if (target?.schemaId === 'StringLiteral') {
          const owner = subjectName(node), names = [...(project()?.components || []).map(c => c.name).filter(name => name !== owner), 'マウス'];
          if (!names.includes(target.fields.value)) names.unshift(target.fields.value);
          const select = E('select', 'blockui-motion-target', null, { 'aria-label': schema.label + 'の 相手', 'data-block-id': node.id, 'data-blockui-action': 'motion-target' });
          for (const name of names) select.append(E('option', '', name === 'マウス' ? 'マウス' : '「' + name + '」', { value: name }));
          select.value = target.fields.value; select.disabled = isLocked() || !!options.readOnly;
          // The whole sentence is written again, so the mouse reads マウス (not 「マウス」) as the code writes it.
          listen(select, 'change', () => {
            const replacement = structuredClone(node);
            replacement.inputs.args[0].fields.value = select.value;
            operate({ type: 'replace', id: node.id, node: replacement });
          });
          main.append(select);
        } else main.append(renderInput(node, schema.inputs.find(s => s.key === 'args'), 0));
        main.append(text('のところへ行く'));
      } else {
        main.append(text(value === 'TURN_RIGHT' ? '右に' : '左に')); quantity('args', '度', 0); main.append(text('回る'));
      }
      if (extraControls.childElementCount) main.append(extra);
    }
    function renderPhrase(node, schema, main) {
      if (
        ['NumberLiteral', 'StringLiteral', 'BooleanLiteral', 'CommentLine'].includes(schema.kind)
      ) {
        if (schema.kind === 'StringLiteral') main.append(E('span', 'blockui-punctuation', '「'));
        if (schema.kind === 'CommentLine') main.append(E('span', 'blockui-punctuation', '※'));
        for (const field of schema.fields) main.append(fieldControl(node, field));
        if (schema.kind === 'StringLiteral') main.append(E('span', 'blockui-punctuation', '」'));
        return;
      }
      if (['VariableRead', 'TargetReference'].includes(schema.kind)) {
        for (const key of ['qualifier', 'name'])
          main.append(
            fieldControl(
              node,
              schema.fields.find((f) => f.key === key),
            ),
          );
        return;
      }
      const parts = shownPhrase(schema, node);
      if (parts) {
        const displayParts = [...parts];
        // A value whose unit the sentence fixes shows that unit itself (unitValue, E-02), so the phrase does not repeat
        // it: 50 ％ にする, 50 ％から 150 ％の どれか.
        const unitOf = part => part && typeof part === 'object' && part.slot ? roleUnit(node, part.slot.key, part.index) : null;
        for (let i = 0; i < displayParts.length; i++) {
          const unit = unitOf(displayParts[i]), following = displayParts[i + 1];
          if (unit && typeof following === 'string' && following.startsWith(unit)) displayParts[i + 1] = following.slice(unit.length);
        }
        for (const part of displayParts)
          main.append(...(
            typeof part === 'string'
              ? (part ? [E('span', 'blockui-phrase-text', part)] : [])
              : part.lineBreak
                ? [E('span', 'blockui-phrase-break')]
              : part.field
                ? [fieldControl(node, part.field)]
                : unitOf(part) ? unitValue(node, part.slot.key, part.index, unitOf(part))
                  : [renderInput(node, part.slot, part.index)]
          ));
        return;
      }
      main.append(E('span', 'blockui-phrase-text', schema.label));
      for (const field of schema.fields.filter((f) => f.key !== 'hasElse'))
        main.append(fieldControl(node, field));
      for (const slot of schema.inputs) if(node.inputs[slot.key]!==undefined)main.append(renderInput(node, slot));
    }
    function renderNode(node) {
      const schema = schemaOf(node);
      if (!schema) throw Error('あかりが 知らないブロックです: ' + node.schemaId);
      const info = index.get(node.id) || {},
        box = E(
          'article',
          'blockui-node blockui-' + schema.category + (schema.bodies.length ? ' blockui-container' : ''),
          null,
          {
            'data-block-id': node.id,
            'data-schema-id': schema.id,
            'data-palette': schema.palette,
            'data-palette-tone': blockPaletteGroup(schema),
            'data-collapsed': collapsed.has(node.id),
            tabindex: '0',
            'aria-label': schema.label,
          },
        );
      if (['statement', 'expression'].includes(schema.category))
        attachShape(box, blockShapeKind(schema));
      const head = E('div', 'blockui-node-head');
      head.append(E('strong', 'blockui-node-title', schema.label), nodeTools(node, info));
      if(schema.category==='script'){
        const heading=node.fields.heading,actor=heading?.actorRef?.kind==='named'?heading.actorRef.name:project()?.components.find(c=>c.id===context().targetId)?.name||project()?.stage?.name;
        head.querySelector('strong').textContent=`${actor}・${eventText(heading?.event||context().event||'start',heading?heading.filter:context().filter)}`;
      }
      box.append(head);
      box.classList.toggle('blockui-selected', selected === node.id);
      listen(box, 'click', (event) => {
        if (event.target.closest('.blockui-node') === box) {
          const active=doc.activeElement,focused=active?.closest('.blockui-node');
          // Expanding an inline field on focus can put its ancestor under the
          // released pointer. Keep the field the user actually entered selected.
          if(focused&&focused!==box&&box.contains(focused)&&active.matches('input,textarea'))
            selection(focused.dataset.blockId);
          else {
            selection(node.id);
            // A press on a block's words gives the block the focus, so Delete and Backspace act on it (E-05).
            if (!event.target.closest('input,textarea,select,button,summary,label,a,[contenteditable]')) box.focus({ preventScroll: true });
          }
        }
      });
      const line = session()?.nodeMap?.get?.(node.id)?.sourceSpan?.startLine;
      const diagnostics = schema.category === 'statement' ? diagnosticsByLine.get(line) || [] : [];
      if (diagnostics.length) {
        box.classList.add('blockui-diagnostic');
        const ul = E('ul', 'blockui-node-diagnostics');
        for (const d of diagnostics) { const item = E('li', 'diagnostic-help', childDiagnosticText(d, session()?.sourceText)); appendDiagnosticDetails(item, d); ul.append(item); }
        box.append(ul);
        const warning = button(
          '⚠ たしかめる',
          'diagnostics',
          () => {
            selection(node.id);
            ul.classList.toggle('blockui-open');
          },
          {
            'aria-label': diagnostics.length + 'か所の 直す手がかりを見せる',
            title: diagnostics.map((d) => childDiagnosticText(d, session()?.sourceText)).join('\n'),
          },
        );
        head.prepend(warning);
      }
      const content = E('div', 'blockui-node-content'),
        main = E('div', 'blockui-node-main');
      content.hidden = collapsed.has(node.id);
      if (schema.category === 'script') {
        for (const field of schema.fields) {
          const edit = E('details', 'blockui-heading-editor');
          edit.append(E('summary', '', 'いつ動く？'), fieldControl(node, field));
          main.append(edit);
        }
        const ruleSlot = schema.inputs.find(slot => slot.key === 'rules');
        if (ruleSlot) {
          const rules = node.inputs.rules || [], list = E('details', 'blockui-rules');
          list.open = rules.length > 0;
          list.append(E('summary', '', rules.length ? 'つづけて動くルール（' + rules.length + 'こ）' : '＋ キーを おす間など、つづけて動かす'));
          for (const [i, rule] of rules.entries()) {
            const row = E('div', 'blockui-rule-row'); row.append(renderNode(rule));
            row.append(button('このルールを けす', 'rule-remove', () => operate({ type: 'variadic-remove', parentId: node.id, input: 'rules', index: i })));
            if (i) row.append(button('前のルールへ', 'rule-up', () => operate({ type: 'variadic-move', parentId: node.id, input: 'rules', index: i, toIndex: i - 1 })));
            if (i + 1 < rules.length) row.append(button('次のルールへ', 'rule-down', () => operate({ type: 'variadic-move', parentId: node.id, input: 'rules', index: i, toIndex: i + 2 })));
            list.append(row);
          }
          const add = button('＋ つづけて動くルール', 'rule-add', () => operate({ type: 'variadic-insert', parentId: node.id, input: 'rules', index: rules.length,
            node: newRule() }));
          add.disabled = isLocked() || !!options.readOnly || rules.length >= ruleSlot.maxItems;
          list.append(add); main.append(list);
        }
        content.append(main);
      } else {
        // Actor, unit and argument names are roles outside the old phrase cache.
        // Render every role explicitly so cached legacy phrases cannot hide one.
        const field = key => fieldControl(node, schema.fields.find(f => f.key === key));
        const slot = key => renderInput(node, schema.inputs.find(s => s.key === key));
        if(['BinaryExpression','CompareExpression','LogicalExpression'].includes(schema.kind)){
          const operator=E('select','blockui-operator',null,{'aria-label':'計算や くらべ方のしるしだけを かえる'});
          // ＾ is offered at くわしく only (F-21), unless the block already uses it.
          for(const candidate of BLOCK_SCHEMAS.filter(s=>s.kind===schema.kind&&(s.id===schema.id||document.body.dataset.uiLevel==='advanced'||!ADVANCED_ONLY_SCHEMA_IDS.has(s.id))))operator.append(E('option','',candidate.label,{value:candidate.id}));
          operator.value=schema.id;operator.disabled=isLocked()||options.readOnly;
          listen(operator,'change',()=>operate({type:'operator',id:node.id,schemaId:operator.value}));
          if(schema.kind==='CompareExpression')main.append(slot('left'),E('span','blockui-phrase-text','が'),slot('right'),operator);
          else main.append(slot('left'),operator,slot('right'));
        } else if(schema.kind==='RepeatCount'||schema.kind==='Say'||schema.kind==='WaitTime'){
          const {extra,extraControls}=extraDisclosure(node,schema.label+'の数・計算・時間を なおす');
          const actor=schema.fields.find(f=>f.key==='actorRef');if(actor)main.append(fieldControl(node,actor));
          // 2 秒, 3 回: the unit is text (E-02); 計算を入れる (with the value's tools) puts a calculation in the number's place.
          // はじめて has no value blocks to put there, so it shows no 計算の答えを話す either (E-12).
          const entry=document.body.dataset.uiLevel==='entry';
          const numberSlot=(key,unit)=>{
            main.append(...unitValue(node,key,undefined,unit));
          };
          if(schema.kind==='Say'){
            main.append(slot('value'));
            const localContext=subjectContext(node),choices=hintCandidates(project(),localContext.targetId,{source:session()?.sourceText||'',...localContext}).filter(h=>h.id.startsWith('read:')&&h.binding?.kind!=='list'&&h.enabled);
            const data=E('select','blockui-speech-data',null,{'aria-label':'話す 文字か、へんすうの 中身を えらぶ'});
            const current=node.inputs.value,
              shown=current.schemaId==='StringLiteral'?'literal':String(choices.findIndex(h=>h.binding.name===current.fields.name&&h.binding.qualifier===current.fields.qualifier));
            data.append(E('option','','文字を話す',{value:'literal'}));
            if(!entry||shown==='-1')data.append(E('option','','計算の答えを話す',{value:'expression'}));
            for(const [i,hint]of choices.entries())data.append(E('option','',hint.text+'の いまの中身',{value:String(i)}));
            data.value=shown;
            if(!data.value)data.value='expression';data.disabled=isLocked()||options.readOnly;
            listen(data,'change',()=>{
              if(data.value==='expression'){chooseDestination({parentId:node.id,input:'value'});return;}
              const replacement=data.value==='literal'?createBlock('StringLiteral'):nodeForSearchHint(choices[Number(data.value)],project(),localContext);
              if(data.value==='literal')replacement.fields.value=current.fields.name||current.fields.value||'';
              operate({type:'expression',parentId:node.id,input:'value',node:replacement});
            });if(data.options.length>1)extraControls.append(data);
            // The words of its code (E-14): 「こんにちは」と 2秒 話す for words, 点数を 2秒 話す for a value.
            if(node.inputs.seconds){main.append(E('span','blockui-phrase-text',node.inputs.value?.schemaId==='StringLiteral'?'と':'を'));numberSlot('seconds','秒');main.append(E('span','blockui-phrase-text','話す'));extraControls.append(button('時間を外す','speech-untimed',()=>operate({type:'optional-input-remove',parentId:node.id,input:'seconds'})));}
            else {main.append(E('span','blockui-phrase-text',sayParticle(node.inputs.value)+'言う'));extraControls.append(button('秒数を決めて話す','speech-timed',()=>{const seconds=createBlock('NumberLiteral');seconds.fields.value=2;return operate({type:'expression',parentId:node.id,input:'seconds',node:seconds});}));}
          }else {numberSlot(schema.kind==='RepeatCount'?'count':'seconds',schema.kind==='RepeatCount'?'回':'秒');main.append(E('span','blockui-phrase-text',schema.kind==='RepeatCount'?'くり返す':'待つ'));}
          if(extraControls.childElementCount)main.append(extra);
        } else if (node.schemaId === 'UnaryExpression:NEG' && node.inputs.value?.schemaId === 'NumberLiteral') {
          const child = node.inputs.value, numberField = BLOCK_SCHEMA_BY_ID.get('NumberLiteral').fields.find(f => f.key === 'value'),
            control = fieldControl(child, numberField), input = control.querySelector('input');
          if (input) { input.value = '－' + decimalSource(child.fields.value); input.dataset.signedParentId = node.id; input.dataset.signedEdit = 'true'; }
          main.append(control);
        } else if (schema.kind === 'QuantityLiteral') {
          // A quantity in a slot with no fixed unit (へんすうに 入れる数, くらべる数 …): the unit is chosen only at くわしく,
          // where 単位なし takes it off (E-02); the other levels show it as text.
          const inner = node.inputs.value;
          main.append(inner?.schemaId === 'NumberLiteral' || inner?.schemaId === 'Hole:expression'
            ? flatNumber(inner, { parentId: node.id, input: 'value' }) : slot('value'));
          if (document.body.dataset.uiLevel === 'advanced' && !options.readOnly) {
            const unit = E('select', 'blockui-unit-choice', null, { 'aria-label': 'たんい', 'data-block-id': node.id, 'data-blockui-field': 'unit' });
            for (const [v, label] of [...['歩', '度', '秒', '回', '番目', '点', '個', '％', 'Hz'].map(u => [u, u]), ['', '単位なし']])
              unit.append(E('option', '', label, { value: v }));
            unit.value = node.fields.unit; unit.disabled = isLocked();
            listen(unit, 'change', () => {
              const result = unit.value ? operate({ type: 'field', id: node.id, key: 'unit', value: unit.value })
                : operate({ type: 'replace', id: node.id, node: copy(node.inputs.value) });
              if (!result.ok) unit.value = node.fields.unit;
            });
            const wrap = E('label', 'blockui-field', null, { 'data-field-type': 'unit' });
            wrap.append(E('span', 'blockui-field-label', 'たんい'), unit);
            main.append(wrap);
          } else main.append(E('span', 'blockui-phrase-text blockui-unit-text', node.fields.unit));
        }
        else if (schema.kind === 'UnitlessRead') main.append(slot('value'), E('span', '', 'の数だけ'));
        else if (schema.kind === 'ActorQualifiedRead') main.append(field('actorRef'), E('span', '', 'の'), slot('value'));
        else if (schema.kind === 'CloneCommand' && ['CREATE_SELF','CREATE_TARGET'].includes(schema.discriminator?.value)) {
          const actor=schema.fields.find(f=>f.key==='actorRef');if(actor)main.append(fieldControl(node,actor));
          if(schema.discriminator.value==='CREATE_TARGET')main.append(slot('args'));else main.append(E('span','','自分'));
          main.append(E('span','','のコピーを'));
          if(node.inputs.count)main.append(slot('count'),E('span','','体'));
          main.append(E('span','','作る'));
        }
        else if (schema.kind === 'ContinuousRule') {
          main.style.flexWrap = 'wrap'; main.style.whiteSpace = 'normal';
          // The same words as its code (E-14): 「右」キーがおされているあいだ、右へ1秒に200歩の速さで動き続ける.
          if (node.fields.actorRef?.kind === 'named') main.append(field('actorRef'), E('span', 'blockui-phrase-text', '、'));
          main.append(slot('condition'), E('span', 'blockui-phrase-text', 'あいだ、'), field('direction'), E('span', 'blockui-phrase-text', 'へ'),
            ...unitValue(node, 'seconds', undefined, '秒'), E('span', 'blockui-phrase-text', 'に'),
            ...unitValue(node, 'distance', undefined, '歩'), E('span', 'blockui-phrase-text', 'の速さで動き続ける'));
          for (const input of main.querySelectorAll(':scope > .blockui-input-slot:not(.blockui-flat-value)')) {
            input.style.flexShrink = '0'; input.style.flexDirection = 'column';
            const head = input.querySelector(':scope > .blockui-slot-head');
            if (head) { head.style.position = 'static'; head.style.minWidth = '0'; }
          }
        }
        // The same words as its code; it always waits with the whole flow, so it has no subject to choose.
        else if (schema.kind === 'WaitBroadcastGroup') main.append(field('broadcastRef'), E('span', '', 'で始まったことが 全部終わるまで待つ'));
        else if (schema.kind === 'BuiltinCall' && schema.discriminator?.value === '乱数' && node.inputs.args?.length === 2) {
          // Read as the code writes it: 1から6のどれか.
          const args = schema.inputs.find(s => s.key === 'args');
          main.append(renderInput(node, args, 0), E('span', '', 'から'), renderInput(node, args, 1), E('span', '', 'のどれか'));
        }
        // The move blocks and the turns read like their code (LANGUAGE.md 動きの文). 歩・秒・度 are text, with no unit to
        // choose. なおす adds or removes the time (〇秒かけて、) and, on いまのばしょから動く, the second direction.
        else if (schema.kind === 'MotionCommand' && ['GOTO', 'MOVE_BY', 'MOVE', 'GOTO_PART', 'TURN_RIGHT', 'TURN_LEFT'].includes(schema.discriminator?.value))
          renderMotionBlock(node, schema, main);
        else if (schema.draftOnly) {
          box.classList.add('blockui-draft-hole');
          const info = index.get(node.id), label = node.fields.label || schema.label;
          main.append(E('span', 'blockui-hole-label', '〔' + label + 'を えらぶ〕'));
          if (schema.category === 'statement' && info?.body)
            main.append(button('することを えらぶ', 'hole-select-statement',
              () => chooseDestination(listLocation(info)), { 'aria-label': label + 'に ブロックを入れる' }));
          else if (schema.category === 'expression' && info?.input)
            main.append(button('中身を えらぶ', 'hole-select-expression',
              () => chooseDestination(listLocation(info)), { 'aria-label': label + 'の中身を えらぶ' }));
          else if (schema.category === 'target' && info?.input) {
            const picker = E('select', '', null, { 'aria-label': label + 'を えらぶ', 'data-blockui-hole-target': node.id });
            picker.append(E('option', '', 'かえるものを えらぶ', { value: '' }));
            for (const name of namesFor(node, { type: 'name' })) picker.append(E('option', '', name, { value: name }));
            picker.disabled = isLocked();
            listen(picker, 'change', () => {
              if (!picker.value) return;
              const target = createBlock('TargetReference', { idPrefix: viewId }); target.fields.name = picker.value;
              operate({ type: 'expression', ...listLocation(info), node: target });
            });
            main.append(picker);
            if(options.onData)main.append(button('＋ へんすう・リストを作る','create-data',()=>options.onData()));
          }
        } else {
          // Existing phrase/alias presentation is retained. Optional new roles
          // are explicit controls without being hidden by cached legacy text.
          const parts = phrase(schema);
          if (parts && !['NumberLiteral', 'StringLiteral', 'BooleanLiteral', 'CommentLine', 'VariableRead', 'TargetReference'].includes(schema.kind)) {
            const actor = schema.fields.find(f => f.key === 'actorRef');
            if (actor) main.append(fieldControl(node, actor));
            renderPhrase(node, schema, main);
            // A 「〜の合図を送る」 gets its link to the wait after it (broadcastRef) from the code that follows it; it is not
            // a word of its sentence, so the block shows no field for it (E-14).
            for (const f of schema.fields.filter(f => f.type === 'reference' && !(schema.kind === 'Broadcast' && f.key === 'broadcastRef')))
              main.append(fieldControl(node, f));
            // How the values are handed over (書いた じゅんに / 名前を つけて) is not a word of the sentence: it is in the
            // 「…」 after it, so the placed block reads like its palette face and its code (E-14).
            const handOver = schema.fields.find(f => f.type === 'argument-names');
            if (handOver) {
              let extra = main.querySelector(':scope > .blockui-extra');
              if (!extra) { extra = extraDisclosure(node, schema.label + 'の わたし方を かえる').extra; main.append(extra); }
              extra.querySelector(':scope > .blockui-extra-controls').append(fieldControl(node, handOver));
            }
          } else renderPhrase(node, schema, main);
        }
        addValueToolsToExtra(node, box, main);
        if (['statement', 'expression'].includes(schema.category)) {
          main.dataset.blockuiDrag = 'node';
          main.dataset.blockId = node.id;
        }
        if(schema.kind==='IfStatement'&&!node.fields.hasElse&&!options.readOnly)main.append(button('＋ そうでなければを入れる','else-add',()=>{
          const result=operate({type:'else',id:node.id,enabled:true});
          if(result.ok){const parent=index.get(node.id)?.node,hole=parent?.bodies.elseBody.find(n=>n.schemaId==='Hole:statement');if(hole)focus({id:hole.id});}
        }));
        content.append(faceRuby(main));
      }
      for (const slot of schema.bodies) {
        const body = statementBody(node, slot);
        if (body) content.append(body);
      }
      if(schema.category==='script'&&node.inputs.units?.length){
        const units=E('section','blockui-document-units');units.setAttribute('aria-label','同じ 本文の ほかの きっかけ');
        for(const unit of node.inputs.units)units.append(renderNode(unit));
        content.append(units);
      }
      const annotations = schema.annotations.filter(
        (a) => a.editable !== false && (!a.when || node.fields[a.when]),
      );
      if (annotations.length) {
        const details = E('details', 'blockui-annotations'),
          has = annotations.some((a) => node.annotations[a.key]);
        details.classList.toggle('blockui-has-comment', has);
        details.open = openAnnotations.has(node.id);
        details.append(
          E(
            'summary',
            '',
            has
              ? annotations
                  .map((a) => node.annotations[a.key])
                  .filter(Boolean)
                  .join(' ／ ')
              : 'メモ',
          ),
        );
        for (const annotation of annotations) details.append(fieldControl(node, annotation, true));
        listen(details, 'toggle', () => {
          if (!details.isConnected) return;
          details.open ? openAnnotations.add(node.id) : openAnnotations.delete(node.id);
          rememberViewState();
        });
        content.append(details);
      }
      box.append(content);
      return box;
    }
    // The block view shows no line numbers (FCM-07): a mistake is named by the words of its sentence, with a full-width
    // colon (I5V-15).
    function diagnosticPlace(d) {
      const line = d.line && typeof session()?.sourceText === 'string' ? session().sourceText.split(/\r\n?|\n/)[d.line - 1] : null,
        words = line ? splitComment(line).code.trim().replace(/。$/, '') : '';
      return words ? '「' + (Array.from(words).length > 24 ? Array.from(words).slice(0, 23).join('') + '…' : words) + '」の ブロック：' : '';
    }
    function diagnosticSummary() {
      const diagnostics = session()?.diagnostics || [];
      if (!diagnostics.length) return null;
      const details = E('details', 'blockui-diagnostics');
      details.open = diagnosticsOpen;
      listen(details, 'toggle', () => {
        if (details.isConnected) diagnosticsOpen = details.open;
      });
      details.append(E('summary', '', diagnostics.length + 'か所を たしかめます（書いた中身は のこっています）'));
      const pages = Math.ceil(diagnostics.length / 20);
      diagnosticPage = Math.min(diagnosticPage, pages - 1);
      const ul = E('ul');
      for (const d of diagnostics.slice(diagnosticPage * 20, (diagnosticPage + 1) * 20)) {
        const item = E('li', 'diagnostic-help', diagnosticPlace(d) + childDiagnosticText(d, session()?.sourceText));
        appendDiagnosticDetails(item, d); ul.append(item);
      }
      details.append(ul);
      if (pages > 1) {
        const paging = E('div', 'blockui-paging'),
          back = button('前の手がかり', 'diagnostic-prev', () => {
            diagnosticPage--;
            diagnosticsOpen = true;
            render({ force: true });
          }),
          next = button('次の手がかり', 'diagnostic-next', () => {
            diagnosticPage++;
            diagnosticsOpen = true;
            render({ force: true });
          });
        back.disabled = diagnosticPage === 0;
        next.disabled = diagnosticPage === pages - 1;
        paging.append(back, E('span', '', diagnosticPage + 1 + ' / ' + pages), next);
        details.append(paging);
      }
      return details;
    }
    function mapElseBranches() {
      branchLines = new Map();
      branchSourceLines = new Map();
      if (!tree) return;
      // Match supported else leads only within already parsed If boundaries.
      // A same-line body keeps its own column location; the preceding header
      // selects the branch. Comment lookalikes never create a branch location.
      const s = session(),
        lines = normalizeSource(s.sourceText).lines,
        byIndent = new Map();
      for (const line of lines)
        if (/^(?:そうでなければ|でなければ)(?:、|$)/.test(compactOutsideString(line.code))) {
          const indent = line.raw.match(/^ */)[0].length;
          if (!byIndent.has(indent)) byIndent.set(indent, []);
          byIndent.get(indent).push(line);
        }
      for (const [id, { node }] of index) {
        if (node.schemaId !== 'IfStatement' || !node.fields.hasElse) continue;
        const position = s.nodeMap.get(id),
          start = position?.sourceSpan?.startLine,
          end = position?.endLine;
        if (!start || !end || !lines[start - 1]) continue;
        const lastThen = Math.max(
            start,
            ...node.bodies.thenBody.map((n) => {
              const p = s.nodeMap.get(n.id);
              return p?.endLine || p?.sourceSpan?.endLine || 0;
            }),
          ),
          firstElse = Math.min(
            ...node.bodies.elseBody.map(
              (n) => s.nodeMap.get(n.id)?.sourceSpan?.startLine || Infinity,
            ),
          ),
          indent = lines[start - 1].raw.match(/^ */)[0].length;
        const matches = (byIndent.get(indent) || []).filter(
          (line) =>
            line.lineNo > lastThen &&
            line.lineNo <= firstElse &&
            line.lineNo <= end &&
            (line.lineNo === firstElse || line.comment === (node.annotations.elseComment || '')),
        );
        if (matches.length === 1) {
          const line = matches[0].lineNo;
          branchLines.set(line, { id, body: 'elseBody' });
          branchSourceLines.set(id + ':elseBody', line);
        }
      }
    }
    function render({ force = false } = {}) {
      if (destroyed || committing || rendering) return;
      if (deferredFocus?.isConnected && root.contains(deferredFocus)) {
        deferredRender = true;
        syncDeferredTree();
        return;
      }
      deferredFocus = null;
      deferredRender = false;
      rendering = true;
      try {
        return renderView(force);
      } finally {
        rendering = false;
      }
    }
    function renderView(force) {
      faceSymbols = null;
      const s = session(),
        nextSignature = [
          s?.ownerKey,
          s?.sourceRevision,
          s?.contextRevision,
          s?.mode,
          !!isLocked(),
        ].join('|');
      root.dataset.locked = String(!!isLocked());
      if (drag && nextSignature !== signature) cancelDrag();
      if (pending) {
        updateControls();
        if (pending.error) announce(pending.error, true);
        return;
      }
      if (!force && nextSignature === signature && getTree(s) === tree) {
        updateControls();
        return;
      }
      if (replacement && nextSignature !== signature) {
        replacement = null;
        moving = null;
        notifyPending();
      }
      if (nextSignature !== signature) moving = null;
      const ownerChanged = s?.ownerKey !== displaySession?.ownerKey,
        scroll = ownerChanged
          ? { top: s?.scrollState?.blockTop || 0, left: s?.scrollState?.blockLeft || 0 }
          : { top: workspace.scrollTop, left: workspace.scrollLeft },
        active = doc.activeElement,
        focusKey = !ownerChanged && root.contains(active) ? active?.dataset?.focusKey : null,
        focusNode =
          !ownerChanged && root.contains(active)
            ? active?.closest?.('[data-block-id]')?.dataset.blockId
            : null,
        selectionRange =
          focusKey && typeof active.selectionStart === 'number'
            ? {
                start: active.selectionStart,
                end: active.selectionEnd,
                direction: active.selectionDirection,
              }
            : null;
      if (ownerChanged) {
        rememberViewState();
        zoom = blockZoomCore(s?.scrollState?.blockZoom || 1);
        destination = null;
        moving = null;
        bodyPages.clear();
        bodyExtraPages.clear();
        inputPages.clear();
        collapsed.clear();
        openAnnotations.clear();
        for (const entry of s?.scrollState?.blockBodyPages || []) bodyPages.set(...entry);
        for (const [key, pages] of s?.scrollState?.blockExtraPages || [])
          bodyExtraPages.set(key, new Set(pages));
        for (const entry of s?.scrollState?.blockInputPages || []) inputPages.set(...entry);
        for (const id of s?.scrollState?.blockCollapsed || []) collapsed.add(id);
        for (const id of s?.scrollState?.blockOpenAnnotations || []) openAnnotations.add(id);
        diagnosticPage = 0;
        diagnosticsOpen = false;
      }
      if (s !== displaySession || nextSignature !== signature) selected = s?.blockSelection || '';
      if (ownerChanged) openEditors.clear();
      displaySession = s;
      signature = nextSignature;
      if (cacheSignature !== nextSignature) {
        cacheSignature = nextSignature;
        availabilityCache.clear();
      }
      const previousTree = tree;
      tree = getTree(s);
      if (tree !== previousTree) availabilityCache.clear();
      index = tree
        ? typeof buildBlockIndex === 'function'
          ? buildBlockIndex(tree)
          : localIndex(tree)
        : new Map();
      lineNodes = new Map();
      highlightedId = null;
      diagnosticsByLine = new Map();
      for (const [id, entry] of index) {
        const line = s?.nodeMap?.get?.(id)?.sourceSpan?.startLine;
        if (line && schemaOf(entry.node)?.category === 'statement' && !lineNodes.has(line))
          lineNodes.set(line, id);
      }
      for (const d of s?.diagnostics || [])
        if (!d.where || d.where === s?.ownerKey) {
          if (!diagnosticsByLine.has(d.line)) diagnosticsByLine.set(d.line, []);
          diagnosticsByLine.get(d.line).push(d);
        }
      mapElseBranches();
      if (s?.blockSelectionLocation) {
        const loc = s.blockSelectionLocation,
          line = branchSourceLines.get(loc.id + ':' + loc.body);
        s.blockSelectionLocation =
          loc.id === selected &&
          (!loc.key || loc.key === s.ownerKey) &&
          loc.body === 'elseBody' &&
          line
            ? { ...loc, key: s.ownerKey, line }
            : null;
      }
      if (destination && !index.has(destination.parentId)) destination = null;
      if (selected && !index.has(selected)) selected = '';
      bodyObserver?.disconnect();
      fontStyleObserver?.disconnect();
      world.replaceChildren();
      if (!tree) {
        world.append(
          E(
            'p',
            'blockui-empty',
            'この 本文の 書き方を たしかめてください。コードは そのまま のこっています。',
          ),
        );
      } else {
        const diagnostics = diagnosticSummary();
        if (diagnostics) world.append(diagnostics);
        world.append(eventHat());
        try {
          world.append(renderNode(tree));
        } catch (error) {
          world.append(E('p', 'blockui-error', errorText(error)));
        }
      }
      renderPalette();
      renderReplacement();
      updateControls();
      updateGeometry();
      observeMore();
      selection(selected, s?.blockSelectionLocation || null);
      lightEmptyValue();
      workspace.scrollTop = scroll.top;
      workspace.scrollLeft = scroll.left;
      rememberViewState();
      applyHighlight();
      options.onPresentation?.();
      if (focusKey) {
        const field = [...workspace.querySelectorAll('[data-focus-key]')].find(
          (n) => n.dataset.focusKey === focusKey,
        );
        field?.focus({ preventScroll: true });
        if (field && selectionRange)
          field.setSelectionRange(
            selectionRange.start,
            selectionRange.end,
            selectionRange.direction,
          );
      } else if (focusNode) {
        const n = [...workspace.querySelectorAll('.blockui-node')].find(
          (n) => n.dataset.blockId === focusNode,
        );
        n?.focus({ preventScroll: true });
      }
    }
    function resolveLocation(value) {
      if (!value || (value.key && value.key !== session()?.ownerKey)) return {};
      if (value.column) {
        let match = null, start = -1, end = Infinity;
        for (const [id, location] of session().nodeMap) {
          const span = location.sourceSpan;
          if (span?.startLine === value.line && span.startColumn <= value.column &&
            (span.startColumn > start || (value.error && span.startColumn === start && span.endColumn < end)) &&
            (BLOCK_SCHEMA_BY_ID.get(index.get(id)?.node.schemaId)?.category === 'statement' ||
              (value.error && value.column < span.endColumn))) {
            match = id; start = span.startColumn; end = span.endColumn;
          }
        }
        if (match) return {id:match};
      }
      const branch = branchLines.get(value.line),
        id = branch?.id || value.id || value.nodeId || lineNodes.get(value.line);
      return { id, body: branch && branch.id === id ? branch.body : value.body };
    }
    function locationElement({ id, body }) {
      return body
        ? [...workspace.querySelectorAll('[data-blockui-body-wrapper]')].find(
            (n) => n.dataset.blockOwner === id && n.dataset.blockuiBodyWrapper === body,
          )
        : [...workspace.querySelectorAll('.blockui-node')].find((n) => n.dataset.blockId === id);
    }
    function applyHighlight() {
      const point = resolveLocation(currentLocation),
        key = point.id ? point.id + (point.body ? ':' + point.body : '') : null;
      if (highlightedId === key) return;
      for (const n of workspace.querySelectorAll('.blockui-current')) n.classList.remove('blockui-current');
      highlightedId = key;
      markedElement(point)?.classList.add('blockui-current');
    }
    // The element that shows a running or failing place: its block, a number that is its own field in the sentence
    // (1 秒, 99999 Hz: E-02, F-06), else the nearest block that holds it.
    function markedElement(point) {
      const own = locationElement(point);
      if (own || point.body || !point.id) return own;
      const flat = [...workspace.querySelectorAll('.blockui-flat-value')].find(n => n.dataset.blockId === point.id);
      if (flat) return flat;
      for (let entry = index.get(point.id); entry?.parentId; entry = index.get(entry.parentId)) {
        const holder = locationElement({ id: entry.parentId });
        if (holder) return holder;
      }
      return null;
    }
    function revealNode(id) {
      let entry = index.get(id),
        reveal = collapsed.delete(id);
      while (entry?.parentId) {
        if (entry.body) {
          const key = entry.parentId + ':' + entry.body,
            p = Math.floor(entry.index / BODY_PAGE);
          if ((bodyPages.get(key) || 0) < p && !bodyExtraPages.get(key)?.has(p)) {
            if (!bodyExtraPages.has(key)) bodyExtraPages.set(key, new Set());
            bodyExtraPages.get(key).add(p);
            reveal = true;
          }
        } else if (entry.input && entry.index !== null) {
          const key = entry.parentId + ':' + entry.input,
            p = Math.floor(entry.index / INPUT_PAGE);
          if ((inputPages.get(key) || 0) !== p) {
            inputPages.set(key, p);
            reveal = true;
          }
        }
        if (collapsed.delete(entry.parentId)) reveal = true;
        entry = index.get(entry.parentId);
      }
      if (reveal && !pending) render({ force: true });
      return reveal;
    }
    function focus(location) {
      const value = typeof location === 'number' ? { line: location } : location || {},
        point = resolveLocation(value),
        id = point.id || session()?.blockSelection;
      if (value.key && value.key !== session()?.ownerKey) return false;
      if (!id || !index.has(id)) {
        workspace.focus({ preventScroll: true });
        return false;
      }
      selection(
        id,
        point.body
          ? { body: point.body, line: branchSourceLines.get(id + ':' + point.body) }
          : null,
      );
      revealNode(id);
      if(index.get(id)?.node.schemaId.startsWith('Hole:')&&zoom<0.75)setZoom(1);
      const n = locationElement({ ...point, id });
      n?.focus({ preventScroll: true });
      n?.scrollIntoView({ block: 'center', inline: 'center' });
      return !!n;
    }
    function highlight(location) {
      currentLocation = typeof location === 'number' ? { line: location } : location;
      const point = resolveLocation(currentLocation),
        key = point.id ? point.id + (point.body ? ':' + point.body : '') : null;
      if (key === highlightedId) return;
      revealNode(point.id);
      applyHighlight();
      if (root.getClientRects().length)
        workspace
          .querySelector('.blockui-current')
          ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    function attachShape(box, kind) {
      box.dataset.shapeKind = kind;
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'),
        path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      svg.classList.add('blockui-shape');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      svg.append(path);
      box.prepend(svg);
    }
    function eventHat() {
      const ctx = context(),
        p = project(),
        [kind, id, event] = session()?.ownerKey?.split(':') || [],
        who = id === 'stage' ? p?.stage : p?.components.find((c) => c.id === id),
        name = tree?.fields.heading?.actorRef?.kind==='named'?tree.fields.heading.actorRef.name:who?.name||p?.components.find(c=>c.id===ctx.targetId)?.name||ctx.definition?.name||'この 本文';
      const hat = E('div', 'blockui-event-hat', null, {
        'data-palette-tone': kind === 'script' ? 'event' : 'action',
        'data-shape-kind': 'hat',
      });
      attachShape(hat, 'hat');
      hat.append(
        E('span', 'blockui-hat-owner', name),
        E(
          'strong',
          '',
          kind === 'script'
            ? eventText(tree?.fields.heading?.event||ctx.event||event, tree?.fields.heading ? tree.fields.heading.filter : ctx.filter) || event
            : kind === 'function'
              ? 'この ブロックで 答えを 出すとき'
              : 'この ブロックを 使ったとき',
        ),
      );
      return hat;
    }
    function measureShape(box) {
      const svg = box.querySelector(':scope > .blockui-shape');
      if (!svg) return;
      const w = box.offsetWidth,
        h = box.offsetHeight;
      if (w < 1 || h < 1) return;
      const rect = box.getBoundingClientRect(),
        ratio = rect.width / w || 1,
        cavities = [];
      if (box.classList.contains('blockui-container') && box.dataset.collapsed !== 'true')
        for (const body of box.querySelectorAll(':scope > .blockui-node-content > .blockui-body')) {
          const br = body.getBoundingClientRect(),
            label = body.querySelector(':scope > .blockui-body-label');
          cavities.push({
            top: (br.top - rect.top) / ratio + (label?.offsetHeight || 0) + 3,
            bottom: (br.bottom - rect.top) / ratio - 11,
          });
        }
      const previewCavity = box.querySelector(':scope > .blockui-preview-cavity');
      if (previewCavity)
        cavities.push({
          top: previewCavity.offsetTop,
          bottom: previewCavity.offsetTop + previewCavity.offsetHeight - 9,
        });
      return { svg, w, h, d: blockShapePath(w, h, box.dataset.shapeKind, cavities) };
    }
    let fieldMeasureContext = null;
    function updateFieldWidths() {
      if (!fieldMeasureContext && typeof doc.defaultView.CanvasRenderingContext2D === 'function')
        fieldMeasureContext = doc.createElement('canvas').getContext('2d');
      const writes = [];
      for (const input of root.querySelectorAll('.blockui-field input')) {
        const style = doc.defaultView.getComputedStyle(input), text = input.value || input.placeholder || ' ';
        let textWidth;
        if (fieldMeasureContext) {
          fieldMeasureContext.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          fieldMeasureContext.fontKerning = style.fontKerning;
          if ('letterSpacing' in fieldMeasureContext)
            fieldMeasureContext.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
          textWidth = fieldMeasureContext.measureText(text).width;
        } else {
          // Non-rendering DOM hosts have no canvas; real browser sizing uses font metrics.
          textWidth = [...text].reduce((n, c) => n + (c.codePointAt(0) > 255 ? 1 : 0.7), 0) * (parseFloat(style.fontSize) || 14);
        }
        const edges = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
          .reduce((sum, key) => sum + (parseFloat(style[key]) || 0), 0);
        const picker = input.hasAttribute('list') ? parseFloat(style.getPropertyValue('--blockui-picker-space')) || 20 : 0;
        const width = Math.ceil(textWidth + edges + picker + 2) + 'px';
        if (input.style.getPropertyValue('--blockui-field-width') !== width) writes.push([input, width]);
      }
      // Batch style writes before the existing shape-measurement pass.
      for (const [input, width] of writes) input.style.setProperty('--blockui-field-width', width);
    }
    function updateGeometry() {
      if (destroyed) return;
      world.style.setProperty('--blockui-content-width', Math.max(220, workspace.clientWidth / zoom) + 'px');
      updateFieldWidths();
      world.style.transform = `scale(${zoom})`;
      world.style.setProperty('--blockui-scale', zoom);
      world.style.setProperty('--blockui-inverse-scale', 1 / zoom);
      // Measure every shape before writing SVG attributes: alternating reads and
      // writes forces a whole-workspace layout for each block in a long body.
      const shapes = [
        ...root.querySelectorAll('.blockui-node[data-shape-kind],.blockui-event-hat,.blockui-preview'),
      ]
        .map(measureShape)
        .filter(Boolean);
      for (const { svg, w, h, d } of shapes) {
        const viewBox = `-1 -1 ${w + 2} ${h + 8}`,
          width = w + 2 + 'px',
          height = h + 8 + 'px',
          path = svg.querySelector('path');
        if (svg.getAttribute('viewBox') !== viewBox) svg.setAttribute('viewBox', viewBox);
        if (svg.style.width !== width) svg.style.width = width;
        if (svg.style.height !== height) svg.style.height = height;
        if (path.getAttribute('d') !== d) path.setAttribute('d', d);
      }
      plane.style.width =
        Math.max(
          workspace.clientWidth,
          1500,
          Math.ceil(world.offsetWidth * zoom + workspace.clientWidth * 0.3),
        ) + 'px';
      plane.style.height =
        Math.max(
          workspace.clientHeight,
          1100,
          planeFloor,
          Math.ceil(world.offsetHeight * zoom + workspace.clientHeight * 0.4),
        ) + 'px';
      zoomLabel.textContent = Math.round(zoom * 100) + '%';
      minus.disabled = zoom <= 0.5;
      plus.disabled = zoom >= 2;
      placeNodeTools();
    }
    function scheduleGeometry() {
      if (destroyed || geometryFrame !== null) return;
      geometryFrame = doc.defaultView.requestAnimationFrame(() => {
        geometryFrame = null;
        updateGeometry();
      });
    }
    function setZoom(value, anchor = null) {
      if (drag?.started || pan) return;
      const next = blockZoomCore(value),
        at = anchor || { x: workspace.clientWidth / 2, y: workspace.clientHeight / 2 },
        left = blockZoomScroll(workspace.scrollLeft, at.x, zoom, next),
        top = blockZoomScroll(workspace.scrollTop, at.y, zoom, next);
      zoom = next;
      updateGeometry();
      workspace.scrollLeft = left;
      workspace.scrollTop = top;
      rememberViewState();
    }
    // 見わたす: the body fits the workspace both ways, but never below 75%, where a child could no longer read it, and
    // never above 100% (E-07). What is measured is the body's own blocks from the top left of the world, not the places
    // between them that span the workspace nor the room kept below the world.
    function fitBlocks() {
      const script = world.querySelector('.blockui-script');
      if (!script) return;
      const box = world.getBoundingClientRect();
      let right = 0, bottom = 0;
      for (const n of world.querySelectorAll(':scope > .blockui-event-hat, .blockui-script > .blockui-node-content > .blockui-node-main > details > summary, .blockui-statement .blockui-node-main, .blockui-insertion-end')) {
        const r = n.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        if (!n.classList.contains('blockui-insertion-end')) right = Math.max(right, (r.right - box.left) / zoom);
        bottom = Math.max(bottom, (r.bottom - box.top) / zoom);
      }
      // A body that fits at 100% stays at 100% (LANGUAGE.md 250); the margin is kept only for one that has to shrink.
      const fits = right <= workspace.clientWidth && bottom <= workspace.clientHeight,
        across = (workspace.clientWidth - 24) / (right + 24),
        down = (workspace.clientHeight - 24) / (bottom + 24);
      setZoom(fits ? 1 : Math.min(1, Math.max(0.75, Math.min(across, down))));
      workspace.scrollTo({ top: 0, left: 0 });
      rememberViewState();
    }
    function observeMore() {
      if (!bodyObserver && typeof IntersectionObserver === 'function')
        bodyObserver = new IntersectionObserver(
          (entries) => {
            if (destroyed || pending || drag || pan || !root.getClientRects().length) return;
            const entry = entries.find(
              (e) => e.isIntersecting && e.target.isConnected && world.contains(e.target),
            );
            if (!entry) return;
            const key = entry.target.dataset.bodyMoreKey,
              p = Number(entry.target.dataset.bodyMorePage);
            if ((bodyPages.get(key) || 0) < p && !bodyExtraPages.get(key)?.has(p)) {
              if (!bodyExtraPages.has(key)) bodyExtraPages.set(key, new Set());
              bodyExtraPages.get(key).add(p);
              render({ force: true });
            }
          },
          { root: workspace, rootMargin: '0px 0px 160px 0px' },
        );
      for (const more of world.querySelectorAll('[data-body-more-key]'))
        bodyObserver?.observe(more);
    }
    function endPan() {
      const state = pan;
      pan = null;
      workspace.classList.remove('blockui-panning');
      if (state && workspace.hasPointerCapture?.(state.id))
        try {
          workspace.releasePointerCapture(state.id);
        } catch (_) {}
      rememberViewState();
    }
    function startPan(pointerId, x, y, left = workspace.scrollLeft, top = workspace.scrollTop) {
      pan = { id: pointerId, x, y, left, top };
      try { workspace.setPointerCapture(pointerId); } catch (_) {}
      workspace.classList.add('blockui-panning');
    }
    // Opening the places between blocks (E-07) moves every block under an opened place. What the child points at (the
    // carried block, the chosen place, the block being moved) keeps its place on the screen: the workspace scrolls by
    // what opened above it, so a press that moves a little and lets go on the spot changes nothing (E-04).
    function keepInView(anchor, change) {
      const before = anchor?.isConnected && anchor.getClientRects().length ? anchor.getBoundingClientRect() : null;
      if (!before) { change(); return; }
      workspace.style.overflowAnchor = 'none';
      change();
      const after = anchor.getBoundingClientRect(),
        shift = after.top + after.height / 2 - (before.top + before.height / 2);
      if (Math.abs(shift) >= 0.5) {
        const need = Math.ceil(workspace.scrollTop + shift + workspace.clientHeight);
        if (need > plane.offsetHeight) { planeFloor = need; plane.style.height = need + 'px'; }
        workspace.scrollTop += shift;
      }
      workspace.style.overflowAnchor = '';
    }
    const touchLike = (type) => type === 'touch' || type === 'pen',
      // A press that moves no more than this is a press (E-09); a mouse starts carrying sooner.
      slopOf = (type) => (touchLike(type) ? 12 : 5),
      HOLD_MS = 300;
    // Two fingers spread or pinch the workspace around the point between them, from 50% to 200% (E-10). Whatever one
    // finger had started (carrying, moving the workspace) stops.
    const pinchPointers = new Map();
    let pinch = null, pendingPan = null;
    // A field, a choice, a 「…」 or a button in a placed block keeps a press for itself (E-09).
    const CONTROL_IN_BLOCK = 'input,textarea,select,summary,a,button:not([data-blockui-drag])';
    const dropPendingPan = () => { clearTimeout(pendingPan?.holdTimer); pendingPan = null; };
    // A number, a word or a choice typed into a block belongs to that block: carried from its field, the block that
    // holds it goes (not the value alone, which no place between sentences could take).
    const LITERAL_KINDS = new Set(['NumberLiteral', 'StringLiteral', 'BooleanLiteral']);
    function carrierOf(handle) {
      let carrier = handle;
      while (carrier && LITERAL_KINDS.has(schemaOf(index.get(carrier.dataset.blockId)?.node)?.kind))
        carrier = carrier.parentElement?.closest('[data-blockui-drag="node"]');
      return carrier && !carrier.disabled && carrier.getAttribute('aria-disabled') !== 'true' ? carrier : handle;
    }
    listen(workspace, 'pointerdown', (event) => {
      if (event.pointerType !== 'touch') return;
      pinchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchPointers.size === 2) {
        if (drag) cancelDrag();
        endPan();
        dropPendingPan();
        const [a, b] = [...pinchPointers.values()];
        pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom };
        for (const id of pinchPointers.keys()) try { workspace.setPointerCapture(id); } catch (_) {}
        suppressClickUntil = Date.now() + 400;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      // A finger that starts on 「＋ ここに入れる」 or a button and goes up or down moves the workspace (E-09). One that
      // starts on a field, a choice, a 「…」 or a button of a placed block also moves the workspace when it goes up or
      // down; going sideways or held still it carries the block, as from the block's words. A press that moves no more
      // than 12 px stays the control's.
      if (drag || pan) return;
      const handle = event.target.closest('[data-blockui-drag="node"]');
      if (handle && event.target.closest(CONTROL_IN_BLOCK)) {
        if (!pressHandle(event)) return;
        const start = pendingPan = { id: event.pointerId, x: event.clientX, y: event.clientY, left: workspace.scrollLeft, top: workspace.scrollTop, handle: carrierOf(handle) };
        start.holdTimer = setTimeout(() => {
          if (pendingPan !== start) return;
          pendingPan = null;
          pressBlock(handle, start.id, 'touch', start.x, start.y, { held: true });
        }, HOLD_MS);
      } else if (event.target.closest('.blockui-insertion,button,summary') && !event.target.closest('[data-blockui-drag]'))
        pendingPan = { id: event.pointerId, x: event.clientX, y: event.clientY, left: workspace.scrollLeft, top: workspace.scrollTop };
    }, { capture: true });
    listen(workspace, 'pointermove', (event) => {
      if (pinch && pinchPointers.has(event.pointerId)) {
        pinchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pinchPointers.size < 2) return;
        const [a, b] = [...pinchPointers.values()], r = workspace.getBoundingClientRect();
        setZoom(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance, { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top });
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (pendingPan?.id === event.pointerId && !pan && Math.hypot(event.clientX - pendingPan.x, event.clientY - pendingPan.y) > slopOf('touch')) {
        const start = pendingPan;
        dropPendingPan();
        suppressClickUntil = Date.now() + 400;
        // Sideways from a control of a placed block: the block's own handler carries it from where the finger started.
        if (start.handle && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y))
          pressBlock(start.handle, start.id, 'touch', start.x, start.y);
        else startPan(start.id, start.x, start.y, start.left, start.top);
      }
    }, { capture: true });
    // A finger is forgotten wherever it is lifted, also outside the workspace, so the next touch is never taken for a
    // second finger.
    for (const type of ['pointerup', 'pointercancel'])
      listen(doc.defaultView, type, (event) => {
        pinchPointers.delete(event.pointerId);
        if (pinchPointers.size < 2 && pinch) { pinch = null; rememberViewState(); }
        if (pendingPan?.id === event.pointerId) dropPendingPan();
      }, { capture: true });
    // Pressing anywhere that is not a block, a place, a field or a button and moving moves the workspace (E-11),
    // also right of a short block and around the blocks of an enclosure.
    listen(workspace, 'pointerdown', (event) => {
      if (
        pinch ||
        event.button !== 0 ||
        event.isPrimary === false ||
        drag ||
        event.target.closest('[data-blockui-drag],.blockui-insertion,.blockui-input-slot,.blockui-field,.blockui-node-head,button,input,select,textarea,summary,a,label,details[open]')
      )
        return;
      startPan(event.pointerId, event.clientX, event.clientY);
      pan.blank = true;
      event.preventDefault();
    });
    listen(workspace, 'pointermove', (event) => {
      if (!pan || pan.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - pan.x, event.clientY - pan.y) > slopOf(event.pointerType)) pan.moved = true;
      workspace.scrollLeft = pan.left + pan.x - event.clientX;
      workspace.scrollTop = pan.top + pan.y - event.clientY;
      event.preventDefault();
    });
    // A press on the empty workspace that does not move lets go of the selected block, so the next block from the list
    // goes to the end of the body (E-08).
    listen(workspace, 'pointerup', (event) => {
      if (pan?.id !== event.pointerId) return;
      const press = pan.blank && !pan.moved;
      endPan();
      if (press) letGoOfSelection();
    });
    listen(workspace, 'pointercancel', endPan);
    // A block that hands its finger over to the workspace loses the capture too; only the workspace's own loss ends the move.
    listen(workspace, 'lostpointercapture', (event) => {
      if (pan && event.target === workspace && event.pointerId === pan.id) endPan();
    });
    listen(
      workspace,
      'wheel',
      (event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const r = workspace.getBoundingClientRect();
        setZoom(zoom * (event.deltaY > 0 ? 0.9 : 1.1), {
          x: event.clientX - r.left,
          y: event.clientY - r.top,
        });
      },
      { passive: false },
    );
    listen(workspace, 'keydown', (event) => {
      if (event.target !== workspace) return;
      const offsets = {
        ArrowDown: [0, 60],
        ArrowUp: [0, -60],
        ArrowLeft: [-60, 0],
        ArrowRight: [60, 0],
        PageDown: [0, workspace.clientHeight * 0.8],
        PageUp: [0, -workspace.clientHeight * 0.8],
      };
      if (offsets[event.key]) {
        event.preventDefault();
        workspace.scrollBy(...offsets[event.key]);
      } else if (event.key === 'Home') {
        event.preventDefault();
        workspace.scrollTo({ left: 0, top: 0 });
      }
    });
    listen(doc.defaultView, 'blur', () => {
      endPan();
      if (drag) cancelDrag();
    });
    shapeObserver?.observe(world);
    shapeObserver?.observe(workspace);
    shapeObserver?.observe(palette);
    // The carried blocks: the block itself, or with 「ここから下を まとめて もっていく」 it and the blocks after it (E-06).
    function carriedIds(state) {
      return state.id ? (state.run ? runIds(state.id) : [state.id]) : [];
    }
    function beginGhost(state) {
      hideDropNote();
      const source = state.schemaId
        ? state.element.querySelector('.blockui-preview')
        : state.element.closest('.blockui-node');
      if (!source) return;
      const rect = source.getBoundingClientRect(),
        scale = state.schemaId ? 1 : zoom,
        holder = E('div', 'blockui-world blockui-ghost-world'),
        parts = state.run ? carriedIds(state).map(id => locationElement({ id })).filter(Boolean) : [source];
      ghost = E('div', 'blockui-editor blockui-drag-ghost');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.inert = true;
      ghost.dataset.paletteTone =
        source.dataset.paletteTone ||
        state.element.closest('[data-palette-tone]')?.dataset.paletteTone ||
        'data';
      for (const part of parts) {
        const clone = part.cloneNode(true);
        clone.classList.remove('blockui-selected', 'blockui-current', 'blockui-dragging', 'blockui-lift');
        clone.style.width = part.offsetWidth + 'px';
        clone.style.maxWidth = 'none';
        for (const n of clone.querySelectorAll('[id]')) n.removeAttribute('id');
        for (const n of clone.querySelectorAll('.blockui-actions[open],details[open]')) n.open = false;
        // The ghost shows what the block says, also the values typed into it (a select keeps 度, not 歩).
        const from = part.querySelectorAll('select,input,textarea'), to = clone.querySelectorAll('select,input,textarea');
        from.forEach((n, i) => { if (to[i]) to[i].value = n.value; });
        holder.append(clone);
        part.classList.add('blockui-dragging');
      }
      ghost.append(holder);
      ghost.style.width = Math.max(...parts.map(part => part.offsetWidth)) + 'px';
      ghost.style.transform = `scale(${scale})`;
      doc.body.append(ghost);
      state.grabX = Math.min(rect.width, Math.max(0, state.startX - rect.left));
      state.grabY = Math.min(rect.height, Math.max(0, state.startY - rect.top));
      state.visual = source;
      state.parts = parts;
    }
    function moveGhost(point) {
      if (!ghost || !drag) return;
      ghost.style.left = point.clientX - drag.grabX + 'px';
      ghost.style.top = point.clientY - drag.grabY + 'px';
      if (dragReason) {
        dragReason.style.left = Math.max(4, point.clientX - 20) + 'px';
        dragReason.style.top = Math.max(4, point.clientY - drag.grabY - 32) + 'px';
      }
    }
    // Inside the workspace a sentence goes to the nearest place: before a block from its upper half, after it from its
    // lower half, after an enclosure from below its bottom line (E-04). A value goes to a value place within 40 px.
    // Right over a place of the other kind (a sentence over an empty value hole, a value over a line between sentences)
    // that place is the answer: it cannot take the block, so the carried block turns grey and says why, and letting go
    // there puts nothing in. A sentence over a value already in a block (its number or its words) is over that block,
    // so it goes before or after the block as over the block's other words.
    function emptyValueHole(element) {
      const at = locationFromElement(element), parent = at?.input ? index.get(at.parentId)?.node : null,
        value = parent && (at.index === undefined ? parent.inputs[at.input] : parent.inputs[at.input]?.[at.index]);
      return BLOCK_SCHEMA_BY_ID.get(value?.schemaId)?.kind === 'Hole';
    }
    function dragCandidate(event) {
      const bounds = workspace.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        return null;
      const schema = drag?.schemaId
          ? BLOCK_SCHEMA_BY_ID.get(drag.schemaId)
          : schemaOf(index.get(drag?.id)?.node),
        category = schema?.category,
        carried = (drag?.parts || []).filter(Boolean);
      const direct = doc.elementFromPoint(event.clientX, event.clientY)?.closest('[data-blockui-drop]');
      if (direct && world.contains(direct) && !carried.some(part => part.contains(direct)) &&
          (category !== 'statement' || direct.dataset.blockuiBody || emptyValueHole(direct))) return direct;
      let best = null,
        distance = Infinity;
      const candidates =
        category === 'statement'
          ? world.querySelectorAll('.blockui-insertion,.blockui-hole-target')
          : world.querySelectorAll('.blockui-input-slot[data-blockui-drop]');
      for (const element of candidates) {
        if (carried.some(part => part.contains(element))) continue;
        const r = element.getBoundingClientRect();
        if (!r.width || r.bottom < bounds.top || r.top > bounds.bottom) continue;
        const dx = Math.max(r.left - event.clientX, 0, event.clientX - r.right),
          dy = Math.max(r.top - event.clientY, 0, event.clientY - r.bottom),
          d = category === 'statement' ? dy + 0.35 * dx : Math.hypot(dx, dy);
        if ((category === 'statement' || d < 40) && d < distance) {
          best = element;
          distance = d;
        }
      }
      return best;
    }
    let dragReason = null, dropNote = null, dropNoteTimer = null;
    function showDragReason(text) {
      if (!text) { dragReason?.remove(); dragReason = null; return; }
      if (!dragReason) { dragReason = E('div', 'blockui-drag-reason', null, { 'aria-hidden': 'true' }); doc.body.append(dragReason); }
      dragReason.textContent = text;
    }
    // A message near where the block was let go, seen where the child is looking (E-04); the live region reads it too.
    // The next carry takes it away, so it never stays over the next drop (E2-10).
    function hideDropNote() {
      clearTimeout(dropNoteTimer);
      dropNote?.remove();
      dropNote = null;
    }
    function showDropNote(text, x, y) {
      announce(text);
      hideDropNote();
      dropNote = E('div', 'blockui-drop-note', text, { 'aria-hidden': 'true' });
      doc.body.append(dropNote);
      const w = dropNote.offsetWidth, h = dropNote.offsetHeight, view = doc.documentElement;
      dropNote.style.left = Math.max(8, Math.min(x + 12, view.clientWidth - w - 8)) + 'px';
      dropNote.style.top = Math.max(8, Math.min(y - h - 14, view.clientHeight - h - 8)) + 'px';
      const note = dropNote;
      dropNoteTimer = setTimeout(() => { note.classList.add('blockui-fading'); setTimeout(() => note.remove(), 320); if (dropNote === note) dropNote = null; }, 2200);
    }
    // A cancelled drop: the carried block goes back where it came from.
    function returnGhost(state) {
      const flying = ghost, target = (state.schemaId ? state.visual : state.parts?.[0] || state.visual)?.getBoundingClientRect();
      ghost = null;
      if (!flying) return;
      if (!target?.width) { flying.remove(); return; }
      flying.classList.add('blockui-returning');
      flying.style.left = target.left + 'px';
      flying.style.top = target.top + 'px';
      setTimeout(() => flying.remove(), 260);
    }
    function cancelDrag({ animate = false } = {}) {
      const state = drag;
      drag = null;
      clearTimeout(state?.holdTimer);
      if (animate && state) returnGhost(state);
      ghost?.remove();
      ghost = null;
      snapPreview?.remove();
      snapPreview = null;
      showDragReason('');
      palette.classList.remove('blockui-delete-zone');
      state?.visual?.classList.remove('blockui-dragging');
      if (state?.started) suppressClickUntil = Date.now() + 350;
      if (dragFrame !== null) doc.defaultView.cancelAnimationFrame(dragFrame);
      dragFrame = null;
      if (state?.element?.hasPointerCapture?.(state.pointerId))
        try {
          state.element.releasePointerCapture(state.pointerId);
        } catch (_) {}
      // The places close again around where the block goes in, or around the carried block when it stays where it was.
      const own = state?.id && index.get(state.id), to = state?.valid && state.location,
        beside = own && to && to.parentId === own.parentId && to.body === own.body && (to.index === own.index || to.index === own.index + 1),
        anchor = state?.started && root.classList.contains('blockui-drag-statement') ? (to && !beside ? state.target : state.parts?.[0]) : null;
      for (const n of root.querySelectorAll('.blockui-drop-preview,.blockui-drop-invalid,.blockui-dragging,.blockui-lift'))
        n.classList.remove('blockui-drop-preview', 'blockui-drop-invalid', 'blockui-dragging', 'blockui-lift');
      keepInView(anchor, () => root.classList.remove('blockui-drag-active', 'blockui-drag-statement'));
      if (!root.matches('.blockui-choosing,.blockui-moving-block')) planeFloor = 0;
      notifyPending();
      updateControls();
    }
    function previewDrag(point) {
      if (!drag) return;
      for (const n of root.querySelectorAll('.blockui-drop-preview,.blockui-drop-invalid'))
        n.classList.remove('blockui-drop-preview', 'blockui-drop-invalid');
      const schema = drag.schemaId
          ? BLOCK_SCHEMA_BY_ID.get(drag.schemaId)
          : schemaOf(index.get(drag.id)?.node),
        pr = palette.getBoundingClientRect(),
        overPalette = !!pr.width && point.clientX >= pr.left && point.clientX <= pr.right && point.clientY >= pr.top && point.clientY <= pr.bottom;
      // Carried back to the block list, a sentence of the workspace is deleted when let go (E-05).
      drag.deleteZone = !!drag.id && overPalette && schema?.category === 'statement';
      palette.classList.toggle('blockui-delete-zone', drag.deleteZone);
      const element = drag.deleteZone ? null : dragCandidate(point),
        location = locationFromElement(element);
      let valid = !!location && schema?.category === (location.body ? 'statement' : 'expression'),
        reason = location
          ? 'ここには おけないよ'
          : '';
      if (valid && drag.id) {
        const parent = index.get(location.parentId);
        valid = !carriedIds(drag).some(id => location.parentId === id || parent?.ancestors.includes(id));
        if (!valid) reason = '自分の 中には 入れられないよ';
      }
      if (valid && drag.schemaId) {
        const candidate = availability(drag.schemaId, location, drag.candidate?.candidateNode);
        valid = candidate.enabled;
        if (!valid) reason = candidate.reason;
      }
      const node = drag.id ? index.get(drag.id)?.node : null,
        wraps = valid && location?.body && !drag.run ? wrapCount(schema, node, location, drag.id) : 0;
      if (valid && drag.id && schema.category === 'statement')
        try {
          prepareBlockEdit(
            { ...session(), pendingEdit: null },
            { type: drag.run ? 'move-run' : wraps ? 'wrap' : 'move', id: drag.id, ...location },
          );
        } catch (e) {
          valid = false;
          reason = errorText(e);
        }

      if (valid) reason = !location.body ? 'ここの 中身を 入れかえる' : wraps ? '下の ' + wraps + 'この ブロックを 中に 入れる' : 'ここにつなぐ';
      drag.location = location;
      drag.target = element;
      drag.valid = valid;
      drag.wraps = wraps;
      if (element) element.classList.add(valid ? 'blockui-drop-preview' : 'blockui-drop-invalid');
      ghost?.classList.toggle('blockui-ghost-invalid', !!location && !valid);
      showDragReason(location && !valid ? reason : '');
      moveGhost(point);
      snapPreview?.remove();
      snapPreview = null;
      if (valid && element) {
        const r = element.getBoundingClientRect();
        snapPreview = E('div', 'blockui-snap-preview', reason);
        snapPreview.setAttribute('aria-hidden', 'true');
        let left = r.left + 8, top = location.body ? r.top - 14 : r.bottom + 2;
        snapPreview.style.left = left + 'px';
        snapPreview.style.top = top + 'px';
        doc.body.append(snapPreview);
        // The words stay readable beside the carried block: right of it, or above it where the window ends (E-03).
        const g = ghost?.getBoundingClientRect(), s = snapPreview.getBoundingClientRect();
        if (g?.width && s.left < g.right && s.right > g.left && s.top < g.bottom && s.bottom > g.top) {
          if (g.right + 8 + s.width <= doc.documentElement.clientWidth - 4) left = g.right + 8;
          else top = Math.max(4, g.top - s.height - 4);
          snapPreview.style.left = left + 'px';
          snapPreview.style.top = top + 'px';
        }
      }
      const spoken = drag.deleteZone ? 'ここで はなすと けす' : reason || 'ここで はなすと 入れるのを やめるよ';
      if (drag.reason !== spoken) {
        drag.reason = spoken;
        announce(spoken, !!location && !valid);
      }
    }
    function scrollDrag(timestamp = doc.defaultView.performance.now()) {
      dragFrame = null;
      if (!drag?.started) return;
      // Keep the same 720px/s speed when rendering drops below sixty frames/s.
      const elapsed = drag.scrollTime == null ? 1000 / 60 : Math.max(0, Math.min(100, timestamp - drag.scrollTime)),
        distance = elapsed * .72;
      drag.scrollTime = timestamp;
      const rect = workspace.getBoundingClientRect(),
        beforeTop = workspace.scrollTop,
        beforeLeft = workspace.scrollLeft;
      // A block taken up close to an edge does not carry the workspace along at once: the edges scroll only after the
      // pointer has gone 24 px from where it was pressed, so a press that moves a little never scrolls (E-04).
      drag.edgeArmed ||= Math.hypot(drag.clientX - drag.startX, drag.clientY - drag.startY) > 24;
      if (!drag.edgeArmed) { dragFrame = doc.defaultView.requestAnimationFrame(scrollDrag); return; }
      if (drag.clientX >= rect.left - 30 && drag.clientX <= rect.right + 30) {
        if (drag.clientY >= rect.top - 30 && drag.clientY < rect.top + 32)
          workspace.scrollTop -= distance;
        else if (drag.clientY <= rect.bottom + 30 && drag.clientY > rect.bottom - 32) {
          const bounds = world.getBoundingClientRect(), padding = parseFloat(doc.defaultView.getComputedStyle(world).paddingBottom) || 0,
            contentEnd = beforeTop + bounds.bottom - padding * zoom,
            lastReachableTop = Math.max(0, contentEnd - rect.bottom + 48);
          // Free panning keeps its blank margin; edge dragging stops at actual content.
          workspace.scrollTop = Math.min(lastReachableTop, beforeTop + distance);
        }
      }
      if (drag.clientY >= rect.top - 30 && drag.clientY <= rect.bottom + 30) {
        if (drag.clientX >= rect.left - 30 && drag.clientX < rect.left + 24)
          workspace.scrollLeft -= distance;
        else if (drag.clientX <= rect.right + 30 && drag.clientX > rect.right - 24)
          workspace.scrollLeft += distance;
      }
      if (beforeTop !== workspace.scrollTop || beforeLeft !== workspace.scrollLeft)
        previewDrag(drag);
      dragFrame = doc.defaultView.requestAnimationFrame(scrollDrag);
    }
    listen(
      root,
      'click',
      (event) => {
        if (pointerFocusTarget) {
          pointerFocusTarget = null;
          if (root.contains(doc.activeElement)) focusBlockField(doc.activeElement);
          // A number or text field entered with a press holds its whole value selected, so typing replaces it; a second
          // press in the field puts the caret there (E-01). The full-text dialog and the code view keep their caret.
          const active = doc.activeElement;
          if (active !== pointerFocusPrevious && active?.matches?.('.blockui-world .blockui-field input[type="text"]') && !active.closest('dialog'))
            active.select();
        }
        if (deferredFocus) {
          deferredFocus = null;
          if (deferredRender) doc.defaultView.requestAnimationFrame(() => render({ force: true }));
        }
        if (Date.now() < suppressClickUntil) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      { capture: true },
    );
    // A long press on a block gives no menu of the browser (it lifts the block instead).
    listen(root, 'contextmenu', (event) => {
      if (touchLike(lastPointerType) && event.target.closest('[data-blockui-drag]')) event.preventDefault();
    });
    // A finger held on a block in the list moves the block, not the list.
    listen(palette, 'touchmove', (event) => {
      if ((drag?.held || drag?.started) && event.cancelable) event.preventDefault();
    }, { passive: false });
    // The block (or the block of the list) a press may carry, or null when it cannot carry one now.
    function pressHandle(event) {
      const handle = event.target.closest('[data-blockui-drag]');
      return !handle || handle.disabled || handle.getAttribute('aria-disabled') === 'true' || isLocked() || pinch ||
        event.button !== 0 || event.isPrimary === false ? null : handle;
    }
    // A mouse pressed on a field, a choice, a 「…」 or a button of a placed block carries the block once it moves past the
    // slop, as from the block's words (E-09); a press that does not move keeps the control's own click, and a field
    // being typed in keeps the press for its caret and its selection.
    let controlPress = null;
    listen(root, 'pointerdown', (event) => {
      pointerFocusTarget = event.target;
      pointerFocusPrevious = doc.activeElement;
      lastPointerType = event.pointerType || 'mouse';
      controlPress = null;
      const handle = pressHandle(event), control = event.target.closest(CONTROL_IN_BLOCK);
      if (!handle) return;
      if (handle.dataset.blockuiDrag === 'node' && control) {
        if (!touchLike(event.pointerType) && control !== doc.activeElement && !control.closest('.blockui-editing-field'))
          controlPress = { id: event.pointerId, x: event.clientX, y: event.clientY, handle: carrierOf(handle), control };
        return;
      }
      pressBlock(handle, event.pointerId, event.pointerType, event.clientX, event.clientY);
    });
    // A choice opens its list when the press ends without moving, so the press can carry the block first.
    listen(root, 'mousedown', (event) => {
      if (controlPress?.control.tagName === 'SELECT' && event.target.closest('select') === controlPress.control &&
          typeof controlPress.control.showPicker === 'function') { event.preventDefault(); controlPress.picker = true; }
    });
    listen(root, 'pointerup', (event) => {
      const press = controlPress;
      if (press?.id !== event.pointerId) return;
      controlPress = null;
      if (!press.picker || !press.control.isConnected || press.control.disabled) return;
      press.control.focus({ preventScroll: true });
      try { press.control.showPicker(); } catch (_) {}
    });
    // A press that carries the block once it moves; a touch held still for a moment lifts the block first (E-09).
    function pressBlock(handle, pointerId, pointerType, x, y, { held = false } = {}) {
      if (pending) deferredFocus = handle;
      if (!flush().ok) { deferredFocus = null; return false; }
      const id = handle.dataset.blockId,
        schemaId = handle.dataset.blockuiDragSchema;
      const state = drag = {
        pointerId,
        pointerType,
        element: handle,
        id,
        schemaId,
        // After 「ここから下を まとめて もっていく」, carrying that block carries the blocks after it too.
        run: !!id && moving?.type === 'run' && moving.id === id,
        candidate: handle._akariSearchCandidate,
        startX: x,
        startY: y,
        started: false,
        held: false,
        owner: session()?.ownerKey,
        revision: session()?.sourceRevision,
        contextRevision: session()?.contextRevision,
        location: null,
        valid: false,
      };
      // A finger held still for a moment lifts the block: it can then be carried in any direction (E-09).
      const lift = () => {
        if (drag !== state || state.started) return;
        state.held = true;
        (state.id ? handle.closest('.blockui-node') : handle.querySelector('.blockui-preview') || handle)?.classList.add('blockui-lift');
      };
      if (held) lift();
      else if (touchLike(pointerType)) state.holdTimer = setTimeout(lift, HOLD_MS);
      try {
        handle.setPointerCapture(pointerId);
      } catch (_) {}
      return true;
    }
    listen(root, 'pointermove', (event) => {
      if (controlPress?.id === event.pointerId && !drag) {
        const press = controlPress;
        if (!(event.buttons & 1)) controlPress = null;
        else if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= slopOf('mouse')) {
          controlPress = null;
          // The control gives the press up to the block: no text stays selected in it.
          if (doc.activeElement === press.control && press.control.matches('input,textarea')) press.control.blur();
          doc.getSelection?.()?.removeAllRanges();
          pressBlock(press.handle, press.id, 'mouse', press.x, press.y);
        }
      }
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (
        isLocked() ||
        session()?.ownerKey !== drag.owner ||
        session()?.sourceRevision !== drag.revision ||
        session()?.contextRevision !== drag.contextRevision
      ) {
        cancelDrag();
        return;
      }
      const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
      // A finger that moved no more than 12 px is still a press; a mouse starts carrying after 5 px.
      if (!drag.started && (touchLike(drag.pointerType) ? Math.hypot(dx, dy) <= slopOf(drag.pointerType) : Math.hypot(dx, dy) < slopOf(drag.pointerType)))
        return;
      // A finger that goes up or down without holding first moves the list or the workspace, not the block (E-09).
      if (!drag.started && touchLike(drag.pointerType) && !drag.held && Math.abs(dy) > Math.abs(dx)) {
        const state = drag;
        cancelDrag();
        if (state.id) {
          startPan(state.pointerId, state.startX, state.startY);
          workspace.scrollLeft = pan.left + pan.x - event.clientX;
          workspace.scrollTop = pan.top + pan.y - event.clientY;
          suppressClickUntil = Date.now() + 400;
        }
        event.preventDefault();
        return;
      }
      if (!drag.started) {
        drag.started = true;
        clearTimeout(drag.holdTimer);
        beginGhost(drag);
        if (BLOCK_SCHEMA_BY_ID.get(drag.schemaId)?.category === 'statement' || schemaOf(index.get(drag.id)?.node)?.category === 'statement')
          keepInView(drag.id ? drag.parts?.[0] : null, () => root.classList.add('blockui-drag-statement'));
      }
      drag.clientX = event.clientX;
      drag.clientY = event.clientY;
      event.preventDefault();
      root.classList.add('blockui-drag-active');
      moveGhost(event);
      notifyPending();
      previewDrag(event);
      if (dragFrame === null) dragFrame = doc.defaultView.requestAnimationFrame(scrollDrag);
    });
    listen(root, 'pointerup', (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (
        isLocked() ||
        session()?.ownerKey !== drag.owner ||
        session()?.sourceRevision !== drag.revision ||
        session()?.contextRevision !== drag.contextRevision
      ) {
        cancelDrag();
        return;
      }
      if (drag.started) previewDrag(event);
      const state = drag,
        started = state.started;
      if (!started) {
        cancelDrag();
        // A long press let go without moving selects the block and shows its tools (E-09).
        if (state.held && state.id) { selection(state.id); locationElement({ id: state.id })?.focus({ preventScroll: true }); }
        return;
      }
      const wb = workspace.getBoundingClientRect(), pb = palette.getBoundingClientRect(),
        inside = (r) => !!r.width && event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom,
        outside = !inside(wb) && !inside(pb);
      cancelDrag({ animate: !state.deleteZone && (!state.valid || !state.location) });
      event.preventDefault();
      suppressClickUntil = Date.now() + 350;
      if (state.deleteZone) {
        const ids = carriedIds(state);
        const result = ids.length > 1 ? operate({ type: 'batch', operations: ids.map(id => ({ type: 'remove', id })) })
          : removeBlock(index.get(state.id)?.node || { id: state.id });
        if (result.ok) { keepKeys(); showDropNote('けしたよ。「もとにもどす」で もどせるよ', event.clientX, event.clientY); }
        return;
      }
      if (!state.valid || !state.location) {
        // はじめて asks for a 「＋」 place, at the pointer and in the row above the workspace (F-12).
        showDropNote(outside ? '入れるのを やめたよ' : document.body.dataset.uiLevel === 'entry' ? '＋の ところで はなしてね'
          : !state.location ? '入れるのを やめたよ' : state.reason || 'ここには おけないよ', event.clientX, event.clientY);
        return;
      }
      if (state.schemaId) {
        destination = state.location;
        paletteAdd(state.candidate || BLOCK_SCHEMA_BY_ID.get(state.schemaId));
      } else completeMove(state.location, { id: state.id, type: state.run ? 'run' : 'move' });
    });
    listen(root, 'pointercancel', () => {
      pointerFocusTarget = null;
      const started = drag?.started;
      cancelDrag({ animate: started });
      if (started) announce('入れるのを やめたよ');
    });
    // Only the carried block's own loss of the finger ends carrying: a control that a touch started on loses it to the
    // block when the touch goes on to carry the block (E-09).
    listen(root, 'lostpointercapture', (event) => {
      if (drag && event.target === drag.element && event.pointerId === drag.pointerId) cancelDrag();
    });
    listen(root, 'focusout', (event) => {
      if (deferredFocus !== event.target) return;
      deferredFocus = event.relatedTarget && root.contains(event.relatedTarget) ? event.relatedTarget : null;
      if (!deferredFocus && deferredRender) render({ force: true });
    }, { capture: true });
    // A text field's editing surface closes when the focus leaves the field, its value and the value's tools, and nothing
    // is left to decide in it (E-12).
    listen(root, 'focusout', (event) => {
      const field = event.target.closest?.('.blockui-editing-field'), to = event.relatedTarget;
      if (!field || [field, field.closest('.blockui-node'), field.closest('.blockui-input-slot')].some(n => n?.contains(to)) ||
          (pending?.input && field.contains(pending.input))) return;
      field.classList.remove('blockui-editing-field');
      placeNodeTools();
    });
    // Finish pointer activation before folding the old selection or growing the new one.
    // Keyboard focus selects immediately so Tab can discover the selected block's tools.
    function focusBlockField(target) {
      if (target.closest('button,summary,.blockui-slot-head')) {
        // A field's tools close when the focus goes on to a control outside that field (AX-10).
        for (const n of root.querySelectorAll('.blockui-slot-active')) if (!n.contains(target)) n.classList.remove('blockui-slot-active');
        return;
      }
      const slot = target.closest('.blockui-input-slot'),
        node = target.closest('.blockui-node'),
        field = target.closest('.blockui-field');
      for (const n of root.querySelectorAll('.blockui-editing-field')) n.classList.remove('blockui-editing-field');
      if (field && field.dataset.fieldType !== 'number' && target.matches('input,textarea')) {
        // The field keeps the box it has now; the editing surface lies over the blocks (E-12).
        const idle = field.getBoundingClientRect();
        field.style.setProperty('--blockui-idle-width', idle.width / zoom + 'px');
        field.style.setProperty('--blockui-idle-height', idle.height / zoom + 'px');
        field.classList.add('blockui-editing-field');
        sizeEditingField(field);
      }
      for (const n of root.querySelectorAll('.blockui-focused')) n.classList.remove('blockui-focused');
      for (const n of root.querySelectorAll('.blockui-slot-active'))
        n.classList.remove('blockui-slot-active');
      node?.classList.add('blockui-focused');
      // The 本文 itself, passed on the way from a block to the list with the keyboard, keeps the selected block, so the
      // next block from the list still goes right after it (E-08, AX-10).
      if (node && !(target === node && schemaOf(index.get(node.dataset.blockId)?.node)?.category === 'script')) {
        const id = node.dataset.blockId,
          wrapper = target.closest('[data-blockui-body-wrapper]'),
          body = wrapper?.dataset.blockOwner === id
            ? wrapper.dataset.blockuiBodyWrapper
            : target.matches('[data-blockui-annotation="elseComment"]') ? 'elseBody' : null;
        // Focusing a branch wrapper must retain its source position, not select only its owner.
        selection(id, body ? { body, line: branchSourceLines.get(id + ':' + body) } : null);
      }
      slot?.classList.add('blockui-slot-active');
      if(slot)doc.defaultView.requestAnimationFrame(()=>placeSlotHead(slot));
    }
    listen(root, 'focusin', (event) => {
      if (pointerFocusTarget && event.target.contains(pointerFocusTarget)) return;
      focusBlockField(event.target);
    });
    listen(root, 'keydown', (event) => {
      pointerFocusTarget = null;
      // A block put in with the keyboard gives its empty value the typing, as with a mouse (E-03).
      lastPointerType = 'keyboard';
      if (event.isComposing) return;
      if (event.key === 'Tab') {
        if (deferredFocus === event.target) {
          deferredFocus = null;
          if (deferredRender) render({ force: true });
        }
        // A number that cannot be read is left to the blur: another field given up for, else its mistake shown.
        if (pending?.input === event.target && readable(pending)) flush({ focus:false });
        for (const field of root.querySelectorAll('.blockui-editing-field'))
          field.classList.remove('blockui-editing-field');
      }
      // A value alone is not deleted (FCB-20): Delete says what to do instead of doing nothing.
      if (['Delete', 'Backspace'].includes(event.key) && event.target.matches?.('.blockui-world .blockui-node.blockui-expression') &&
          !options.readOnly && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        announce('この ブロックは けせないよ。ほかの ブロックと 入れかえてね', true);
        return;
      }
      // Space on a focused block selects it, as a press does, and does not scroll the workspace away from it (AX-10).
      if (event.key === ' ' && event.target.matches?.('.blockui-world .blockui-node') && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        selection(event.target.dataset.blockId);
        return;
      }
      // Delete or Backspace on a selected sentence deletes it (E-05); in a field they delete characters.
      if (['Delete', 'Backspace'].includes(event.key) && event.target.matches?.('.blockui-world .blockui-node.blockui-statement') &&
          !options.readOnly && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        const node = index.get(event.target.dataset.blockId)?.node;
        if (!node || schemaOf(node)?.draftOnly || isLocked()) return;
        if (removeBlock(node).ok) focus({ id: session()?.blockSelection });
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        const menu = event.target.closest('.blockui-extra[open],.blockui-who[open],.blockui-actions[open],.blockui-local-help[open]') || root.querySelector('.blockui-local-help[open],.blockui-actions[open],.blockui-who[open]');
        if (menu) {
          menu.open = false;
          menu.querySelector('summary')?.focus();
          return;
        }
        if (pending) cancelField();
        else if (!destination && !replacement && !moving && !drag && !session()?.blockDraft && letGoOfSelection())
          announce('えらぶのを やめたよ。つぎに 入れる ブロックは、本文の さいごに 入るよ');
        else {
          destination = null; replacement = null; moving = null; cancelDrag();
          notifyPending(); renderReplacement(); renderPalette(); updateControls(); showImpliedDestination();
          for (const selected of workspace.querySelectorAll('.blockui-chosen-destination')) selected.classList.remove('blockui-chosen-destination');
          for (const slot of workspace.querySelectorAll('.blockui-slot-active')) slot.classList.remove('blockui-slot-active');
          announce('えらぶのを やめたよ。' + (session()?.blockDraft ? '入れかけの ブロックは「入れるのを やめる」で やめられるよ。' : '') + '決めた ことは「もとにもどす」で もどせるよ');
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
        if (!flush().ok) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      // Keep the design canvas Delete and execution shortcuts out of nested inputs.
      if (root.contains(event.target) && event.key !== 'Tab') event.stopPropagation();
    });
    function destroy() {
      if (destroyed) return;
      cancelDrag();
      endPan();
      shapeObserver?.disconnect();
      bodyObserver?.disconnect();
      if (geometryFrame !== null) doc.defaultView.cancelAnimationFrame(geometryFrame);
      if (toolsFrame !== null) doc.defaultView.cancelAnimationFrame(toolsFrame);
      abort.abort();
      destroyed = true;
      root.replaceChildren();
      root.classList.remove('blockui-editor');
    }
    listen(doc.defaultView, 'resize', () => { updateFieldWidths(); scheduleGeometry(); });
    const fontStyleObserver = doc.head && typeof doc.defaultView.MutationObserver === 'function'
      ? new doc.defaultView.MutationObserver(() => { updateFieldWidths(); scheduleGeometry(); }) : null;
    fontStyleObserver?.observe(doc.head, {childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['media','disabled','href','rel']});
    if (doc.fonts) listen(doc.fonts, 'loadingdone', scheduleGeometry);
    render({ force: true });
    function restorePending(saved) {
      if(!saved?.field||!Array.isArray(saved.nodePath))return false;
      const entry=[...index.values()].find(item=>JSON.stringify(item.path)===JSON.stringify(saved.nodePath));
      if(!entry)return false;
      revealNode(entry.node.id);render({force:true});
      let input=[...root.querySelectorAll('input,textarea,select')].find(el=>el.dataset.blockId===entry.node.id&&(el.dataset.blockuiField===saved.field||el.dataset.blockuiAnnotation===saved.field));
      if(!input)return false;
      if(input.tagName==='INPUT'&&/[\r\n]/.test(saved.value)){
        input.closest('.blockui-field')?.querySelector('[data-blockui-action="edit-text"]')?.click();
        input=root.querySelector('.blockui-text-dialog textarea');if(!input)return false;
      }
      input.value=saved.value;input.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));
      return true;
    }
    function releaseInteraction() {
      cancelDrag(); endPan(); moving=null; destination=null; replacement=null;
      updateControls(); if (!pending) render({force:true});
    }
    return { render, flush, cancel, destroy, highlight, focus, restorePending, releaseInteraction };
  }
  createBlockEditorView.sequence = 0;

  let app = null;

  // Design-only geometry; image costumes use the existing independent w/h fields.
  // Handle directions are on the screen ([-1, -1] is the top-left handle). Places are in the child frame:
  // the part's centre from the bottom-left (y up), turned counterclockwise by its direction.
  const DESIGN_RESIZE_DIRECTIONS = Object.freeze({
    nw: [-1, -1],
    n: [0, -1],
    ne: [1, -1],
    e: [1, 0],
    se: [1, 1],
    s: [0, 1],
    sw: [-1, 1],
    w: [-1, 0],
  });
  function designResizeMode(c) {
    if (!c || !['label', 'button', 'input', 'box', 'sprite'].includes(c.type)) return null;
    return c.type === 'sprite' && c.costumes?.find((co) => co.id === c.costumeId)?.kind !== 'image'
      ? 'scale'
      : 'box';
  }
  // The handle's place in the child frame (the screen's downward hy is the frame's −y).
  function designResizePoint(c, direction = 'se') {
    const [hx, hy] = DESIGN_RESIZE_DIRECTIONS[direction],
      s = c.scalePercent / 100,
      rad = ((c.direction % 360) * Math.PI) / 180,
      cs = Math.cos(rad),
      sn = Math.sin(rad),
      vx = (hx * c.w * s) / 2,
      vy = (hy * c.h * s) / 2;
    return { x: c.x + vx * cs + vy * sn, y: c.y + vx * sn - vy * cs };
  }
  function designResizeGeometry(c, direction, dx, dy, keepRatio = false) {
    const result = { x: c.x, y: c.y, w: c.w, h: c.h, scalePercent: c.scalePercent };
    if (
      !DESIGN_RESIZE_DIRECTIONS[direction] ||
      !designResizeMode(c) ||
      !Number.isFinite(dx) ||
      !Number.isFinite(dy) ||
      (!dx && !dy)
    )
      return result;
    const [hx, hy] = DESIGN_RESIZE_DIRECTIONS[direction],
      s = c.scalePercent / 100,
      rad = ((c.direction % 360) * Math.PI) / 180,
      cs = Math.cos(rad),
      sn = Math.sin(rad),
      // The pointer travel (dx, dy in the child frame) in the part's own screen axes.
      lx = (dx * cs + dy * sn) / s,
      ly = (dx * sn - dy * cs) / s;
    if (designResizeMode(c) === 'scale') {
      result.scalePercent = Math.min(
        1000,
        Math.max(
          1,
          Math.round(
            (c.scalePercent * Math.hypot(c.w / 2 + lx, c.h / 2 + ly)) /
              Math.hypot(c.w / 2, c.h / 2),
          ),
        ),
      );
      return result;
    }
    // The centre stays where it is, so both sides move: the size grows by twice the travel.
    let w = hx ? c.w + 2 * hx * lx : c.w,
      h = hy ? c.h + 2 * hy * ly : c.h;
    if (keepRatio && hx && hy) {
      const factor = Math.min(
        1200 / c.w,
        1200 / c.h,
        Math.max(8 / c.w, 8 / c.h, (w * c.w + h * c.h) / (c.w * c.w + c.h * c.h)),
      );
      w = c.w * factor;
      h = c.h * factor;
    } else {
      w = Math.min(1200, Math.max(8, w));
      h = Math.min(1200, Math.max(8, h));
    }
    // Sizes made with the handles are whole steps; the centre (x, y) does not move.
    result.w = hx ? Math.min(1200, Math.max(8, Math.round(w))) : c.w;
    result.h = hy ? Math.min(1200, Math.max(8, Math.round(h))) : c.h;
    return Object.values(result).every(Number.isFinite)
      ? result
      : { x: c.x, y: c.y, w: c.w, h: c.h, scalePercent: c.scalePercent };
  }

  // Color picker data is presentation-only. Persist the existing fg/bg hex or null.
  const COLOR_PRESETS = Object.freeze(
    [
      '赤',
      '橙',
      '黄',
      '緑',
      '水色',
      '青',
      '紫',
      '桃',
      '茶',
      '白',
      '灰',
      '黒',
    ].map((name) => Object.freeze({ name, label: COLOR_LABELS[name] || name, value: COLOR_NAMES[name] })),
  );
  function pickerHex(value) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())
      ? value.trim().toLowerCase()
      : null;
  }
  function pickerRgb(h, s, v) {
    if (![h, s, v].every(Number.isFinite)) throw new TypeError('Color coordinates must be finite');
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    v = Math.max(0, Math.min(1, v));
    const c = v * s,
      x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
      m = v - c;
    const rgb =
      h < 60
        ? [c, x, 0]
        : h < 120
          ? [x, c, 0]
          : h < 180
            ? [0, c, x]
            : h < 240
              ? [0, x, c]
              : h < 300
                ? [x, 0, c]
                : [c, 0, x];
    return rgb.map((a) => Math.round((a + m) * 255));
  }
  function pickerHsvToHex(h, s, v) {
    return (
      '#' +
      pickerRgb(h, s, v)
        .map((a) => a.toString(16).padStart(2, '0'))
        .join('')
    );
  }
  function pickerHexToHsv(value) {
    const hex = pickerHex(value);
    if (!hex) throw new TypeError('Expected #RRGGBB');
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255),
      max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      d = max - min;
    const h =
      d === 0
        ? 0
        : max === r
          ? 60 * ((g - b) / d)
          : max === g
            ? 60 * ((b - r) / d + 2)
            : 60 * ((r - g) / d + 4);
    return { h: (h + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
  }
  function pickerWheelHS(x, y, previousHue = 0) {
    if (![x, y, previousHue].every(Number.isFinite))
      throw new TypeError('Wheel coordinates must be finite');
    const radius = Math.hypot(x, y);
    return {
      h: radius < 1e-9 ? previousHue : ((Math.atan2(-y, x) * 180) / Math.PI + 360) % 360,
      s: Math.min(1, radius),
    };
  }

