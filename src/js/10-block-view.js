  // ────────────────────────────────────────────────────────────────────────
  // 10 — Block view, interaction and viewport state
  // ────────────────────────────────────────────────────────────────────────
  // Presentation only: parser/runtime diagnostics and their original messages stay unchanged.
  function childDiagnosticText(diagnostic) {
    const message = String(diagnostic?.message || diagnostic || '書き方を たしかめてください');
    if (diagnostic?.code === 'R403')
      return '計算の答えが大きすぎるなどの理由で、あかりで使える数になりませんでした。使う数や計算のしかたをたしかめてください。';
    if (/「ではない」が 2つ つづいています/.test(message))
      return '「ではない」を 2つ つづけるときは、「条件（…）が成り立たない」で 書きます。れい：条件（1が2と同じではない）が成り立たない';
    if (/を2回書いています|入れるものに 同じ 名前が/.test(message))
      return '入れて使う 数や 文字に、同じ 名前が 2つ いじょう あります。「入れるもの」の 名前は ちがう 名前に してください。れい：点数を10として、';
    if (/入れるものの 名前を たしかめてください/.test(message))
      return '入れて使う 数や 文字の 名前を 1つ 書きます。てじゅんや「答えを もとめる」の「入れるもの」と 同じ 名前に します。れい：点数を10として、';
    if (/名前と入れるものを「を」でつないで書きます/.test(message))
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
    if (/言うことは「「文字」と言う」/.test(message))
      return '話す 文字は「 」で かこみます。れい：「おはよう」と言う。おぼえた 点数を 話すときは：点数の値を言う。';
    if (/そのまま 言う 文字か、入れた 音か/.test(message))
      return 'そのまま 話す 文字・鳴らす 音・へんすう・リストの 中身から えらびます。れい：「おはよう」と言う／「ベル」を鳴らす／点数の値を言う。';
    if (/重ねるときは、次の 行に 書いて/.test(message))
      return '「もし」「くり返す」の 中の 文は、次の 行に 書いて 行の はじめを 右へ ずらします。\nれい：2回くり返す。\n  2回くり返す。\n    「おはよう」と言う。';
    if (/小さい 空白で 書きます。Tabキー/.test(message))
      return '行の はじめを 右へ ずらすには、小さい 空白を 使います。れい：くり返す 中の 行の はじめに 小さい 空白を 2つ。大きい 空白や Tabキーは 使いません。';
    if (/いちばん 外の 文は、行の はじめを 右へ ずらさずに/.test(message))
      return 'いちばん 外の 文は 行の 左から 書きます。行の はじめの 空白を けしてください。';
    if (/などの 次の 行は、行の はじめを 右へ ずらして/.test(message))
      return '「作品を動かしたとき、自分は、」などの 次の 行は、はじめを 右へ ずらします。\nれい：作品を動かしたとき、自分は、\n  「おはよう」と言う。';
    if (/同じ まとまりの 文は、行の はじめの 空白の 数を/.test(message))
      return '同じ「もし」や「くり返す」の 中の 行は、はじめの 空白の 数を そろえます。れい：どちらも 空白を 2つ。';
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
    if (/「N番目」はリスト/.test(message))
      return '何番目かを えらぶには、ならんだ ものを おぼえる リストを 使います。れい：【買うもの】の2番目。話す 文字の「買うもの」とは ちがいます。';
    if (/使われていない絵や音か、足りない絵や音/.test(message))
      return '作品で使う絵や音と、ほぞんする絵や音の組み合わせが合っていません。理由は 下の くわしい せつめいに のこしています。「絵や音」の画面で、使う絵や音を たしかめてください。';
    if (/絵や音の中身を表す文字|同じしるし|絵や音の番号|使うはずの絵や音|同じ中身の絵や音|ではないものを使っています|絵や音「[^」]*」がありません|の種類が、正しくありません|記録と合いません|記録とちがいます|絵や音の記録の形|使える大きさの外|あかりで使えない(?:形|種類)の|中身をたしかめるしるし|同じ絵や音が2つ以上|おまけの情報|ほぞんした音|ほぞんしたときと合いません/.test(message))
      return '絵や音の 中身を たしかめられませんでした。理由は 下の くわしい せつめいに のこしています。「絵や音」の 画面で、使う 絵や音を たしかめてください。';
    return message;
  }
  function diagnosticDetailText(diagnostic, original = null) {
    return original ?? [diagnostic?.code, diagnostic?.where || diagnostic?.key,
      diagnostic?.line ? diagnostic.line + '行 / ' + (diagnostic.column || 1) + '文字目' : '',
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
      highlightedId = null,
      lineNodes = new Map(),
      displaySession = null,
      dragFrame = null;
    let searchText = '',
      previousSearch = '',
      category = document.body.dataset.uiLevel !== 'advanced' ? 'basic' : '',
      showOutside = false,
      page = 0,
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
    const openEditors = new Set();
    const openAnnotations = new Set(),
      collapsed = new Set(),
      bodyPages = new Map(),
      bodyExtraPages = new Map(),
      inputPages = new Map();
    const PAGE = 12,
      // Bound both the opening batch and a revealed later batch with role controls.
      BODY_PAGE = 40,
      INPUT_PAGE = 20;
    let zoom = 1,
      pan = null,
      geometryFrame = null,
      ghost = null,
      snapPreview = null,
      bodyObserver = null;
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
        targetId = subject === '画面' || subject === project()?.stage?.name ? 'stage'
          : project()?.components.find(c => c.name === subject)?.id;
      return { ...context(), targetId };
    };
    const getTree = (s) => s?.blockView?.tree || s?.blockView || null;
    const errorText = (e) => e?.message || e?.reason || String(e || 'うまく できませんでした。もう一度 やってみてください');
    const copy = (v) =>
      typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
    const announce = (message, error = false) => {
      messageBox.textContent = message || '';
      messageBox.classList.toggle('blockui-error', error);
      messageBox.setAttribute('role', error ? 'alert' : 'status');
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
              reason: pending.error || '入れたら「決める」を おしてください',
            }
          : replacement
            ? { ownerKey: session()?.ownerKey, reason: 'もとの ばしょに 入れる ブロックを えらんでください' }
            : drag?.started
              ? { ownerKey: session()?.ownerKey, reason: 'ブロックを動かしている とちゅうです' }
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
      cancelButton = button('とちゅうで やめる', 'cancel', () => cancel()),
      commitButton = button('決める', 'commit', () => flush({explicit:true})),
      messageBox = E('div', 'blockui-message', '', { 'aria-live': 'polite' });
    controls.append(destinationLabel, commitButton, cancelButton);
    root.append(controls, messageBox);
    const layout = E('div', 'blockui-layout'),
      palette = E('aside', 'blockui-palette', null, {
        'aria-label': '\u30d6\u30ed\u30c3\u30af\u306e\u9053\u5177\u7bb1',
      }),
      workspace = E('div', 'blockui-workspace', null, {
        tabindex: '0',
        'aria-label': '\u30d6\u30ed\u30c3\u30af\u306e\u4f5c\u696d\u53f0',
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
    const minus = button('\u2212', 'zoom-out', () => setZoom(zoom - 0.05), {
        'aria-label': '\u5c0f\u3055\u304f\u898b\u308b',
      }),
      plus = button('\uff0b', 'zoom-in', () => setZoom(zoom + 0.05), {
        'aria-label': '\u5927\u304d\u304f\u898b\u308b',
      });
    const home = button('\u306f\u3058\u3081\u3078', 'workspace-home', () => {
        workspace.scrollTo({ left: 0, top: 0 });
        workspace.focus({ preventScroll: true });
      }),
      fit = button('\u898b\u308f\u305f\u3059', 'workspace-fit', () => fitBlocks());
    const libraryToggle = button(
      '\u9053\u5177\u7bb1',
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
        libraryToggle.setAttribute(
          'aria-expanded',
          String(!root.classList.contains('blockui-library-hidden')),
        );
        scheduleGeometry();
      },
      { 'aria-expanded': 'true' },
    );
    const wide = options.onExpand
      ? button(
          '\u4f5c\u696d\u53f0\u3092\u5e83\u304f',
          'workspace-expand',
          () => {
            const expanded = options.onExpand();
            wide.textContent = expanded
              ? '\u753b\u9762\u3082\u898b\u308b'
              : '\u4f5c\u696d\u53f0\u3092\u5e83\u304f';
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
      'ブロックを つかんで つなげよう · ブロックの ない ところを おしたまま 動かすと、作業台が 動きます',
    );
    workspaceShell.append(workspaceTip);
    const modeSelect = E('select', '', null, {
      'aria-label': 'ブロックの形',
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
    const paletteList = E('div', 'blockui-palette-list'),
      palettePages = E('div', 'blockui-paging'),
      previous = button('前', 'palette-prev', () => {
        page = Math.max(0, page - 1);
        renderPalette();
      }),
      next = button('次', 'palette-next', () => {
        page++;
        renderPalette();
      }),
      pageLabel = E('span'),
      paletteOptions = E('details', 'blockui-palette-options');
    paletteOptions.append(E('summary', '', 'ブロックの見せ方'), outsideLabel);
    palettePages.append(previous, pageLabel, next);
    paletteOptions.append(modeSelect);
    const searchLabel=E('label','blockui-search-label','ブロックを さがす');
    searchLabel.append(search);
    paletteControls.append(searchLabel, paletteOptions);
    const searchScope=E('p','blockui-search-scope','',{'aria-live':'polite'});
    paletteControls.append(searchScope);
    const restoreSearch = button('', 'restore-search', () => {
      searchText = search.value = previousSearch;
      page = 0;
      renderPalette();
    });
    paletteControls.append(restoreSearch);
    if(options.onData)paletteControls.append(button('＋ へんすう・リストを作る','create-data',()=>options.onData()));
    const help=E('details','blockui-local-help');help.append(E('summary','','いまの作り方のヒント'),
      E('p','','＋で ブロックを 入れます。あいている ところには 文字・数・へんすう・リストを えらびます。「たずねる」で 待った 返事は「答え」で 使えます。とちゅうでも ほぞんできます。'),
      E('p','','あいている ところに 入れる 中身には、文字「おはよう」、数の 10、「あてはまる・あてはまらない」などが あります。'),
      E('p','','つなぐブロックは、「話す」「待つ」など、してほしいことです。本文（ほんぶん）は、ブロックを じゅん番に ならべるところです。'),
      E('p','','ブロックは なかまごとに分かれています。れい：「よく使う」には「話す」「待つ」があります。「ブロックを さがす」に言葉を入れると、さがせます。「ブロックの見せ方」で、つなぐブロックと はめるブロックの どちらを見るか えらべます。「使えないブロックも見せる」を えらぶと、使えない理由も読めます。'),
      E('p','','とちゅうに入れる：本、ぼうしの間にかさを入れると、本、かさ、ぼうしになります。入れかえる：かさを ぼうしに かえるように、えらんだ中身を かえます。'),
      E('p','','リストには、中身が1つずつ ならんでいます。1つずつ使うブロックでは、前から じゅんに同じ動きをします。'),
      E('p','','「同じ数を くり返し かける」（＾）は、同じ数を 何回も かける 計算です。2＾3 は 2×2×2 で 8 に なります。計算や くらべ方の しるしだけを かえても、左右の 中身は のこります。'),
      E('p','','メモは、あとで思い出せるように書くひとことです。動きは かわりません。コピーは、同じ見た目のキャラクターを もう1体作ることです。'),
      E('p','','「とちゅうで やめる」は、いま えらんだ 入れる ばしょや、かえかけている文字・組み立てを やめます。「もとにもどす」は、もう決めたことを1つ もどします。'));
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
    palette.append(paletteTools, categorySelect, paletteList, palettePages);
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
    });
    listen(doc.defaultView, 'resize', () => {
      for (const menu of workspace.querySelectorAll('.blockui-actions[open]')) menu.open = false;
    });
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
      page = 0;
      renderPalette();
    });
    listen(modeSelect, 'change', () => {
      paletteMode = modeSelect.value;
      category = '';
      categoryExplicit = false;
      page = 0;
      renderPalette();
    });
    listen(outside, 'change', () => {
      showOutside = outside.checked;
      page = 0;
      renderPalette();
    });
    function normalizedResult(result) {
      if (result === false) return { ok: false, error: 'うまく できませんでした。もう一度 やってみてください' };
      return result && typeof result === 'object'
        ? result
        : { ok: true, changed: result !== false };
    }
    function operate(op, { fromPending = false } = {}) {
      if (isLocked()) {
        announce('動いている ときや じゅんびの とちゅうは、ブロックを かえられません。おわってから なおしてください', true);
        return { ok: false, reason: 'いまは ブロックを なおせません' };
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
          announce('なおしていた ところが かわりました。もう一度 やり直してください', true);
          return { ok: false, reason: 'なおしていた ところが かわりました。もう一度 やり直してください' };
        }
        // Persisting a new event gives the same document its permanent key.
        if(displaySession?.ownerKey===owner)displaySession={...displaySession,ownerKey:transition.to};
      }
      announce(result.changed === false ? '中身は かわっていません' : 'ブロックを かえました');
      if (!fromPending) render({ force: true });
      return result;
    }
    // A touch test names the stage edge as 端 (the word code also reads bare). The block shows and
    // accepts the words the code writes, 画面のはし; other text slots keep 端 as written.
    function edgeSlot(node, field) {
      if (node?.schemaId !== 'StringLiteral' || field?.key !== 'value') return false;
      return index.get(index.get(node.id)?.parentId)?.node?.schemaId === 'SensorRead:TOUCHING';
    }
    function edgeShown(node, field, value) {
      return edgeSlot(node, field) && value === '端' ? '画面のはし' : value;
    }
    function edgeStored(node, field, value) {
      return edgeSlot(node, field) && ['画面のはし', '画面の端'].includes(String(value).trim()) ? '端' : value;
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
          throw Error('数を さいごまで 入れてください。れい：-12、0.5');
        return Number(text);
      }
      return input.value;
    }
    function flushToTarget(next) {
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
            ? 'もとの ばしょに 入れる ブロックを えらぶか、とちゅうで やめてください'
            : 'ブロックを おく ばしょで はなすか、とちゅうで やめてください',
        };
      if (!pending) return { ok: true };
      const p = pending;
      if(p.field.type==='heading'&&!explicit){
        const reason='いつ動くかを えらんだら「この動きの きっかけを かえる」を おしてください';
        announce(reason,true);return {ok:false,pending:true,reason};
      }
      if (p.composing || p.input.dataset.composing === 'true') {
        p.error = '日本語の へんかんを おわらせてから、もう一度 やってください';
        notifyPending();
        announce(p.error, true);
        return { ok: false, pending: true, reason: p.error };
      }
      if (session()?.ownerKey !== p.ownerKey) {
        p.error = '入れている とちゅうで、なおしていた ところが かわりました。「決める」を おすか、とちゅうで やめてください';
        announce(p.error, true);
        return { ok: false, pending: true, reason: p.error };
      }
      if (
        session()?.sourceRevision !== p.sourceRevision ||
        session()?.contextRevision !== p.contextRevision
      ) {
        p.error =
          '入れている とちゅうで、本文や まわりが かわりました。とちゅうで やめて、もう一度 あいている ところを えらんでください';
        announce(p.error, true);
        notifyPending();
        return { ok: false, pending: true, reason: p.error };
      }
      let value;
      try {
        value = p.read();
      } catch (error) {
        p.error = error.message;
        p.invalid = true;
        p.input.setAttribute('aria-invalid', 'true');
        announce(p.error, true);
        notifyPending();
        if (focus) p.input.focus();
        return { ok: false, pending: true, reason: p.error };
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
        p.error = errorText(result.error || result.reason);
        p.input.setAttribute('aria-invalid', 'true');
        notifyPending();
        if (focus) p.input.focus();
        return { ...result, pending: true, reason: p.error };
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
    function cancelField() {
      const field = pending;
      pending = null;
      if (field?.input?.isConnected) {
        field.input.value = field.field.type === 'qualifier' ? field.original ?? 'none'
          : field.field.type === 'number' ? field.original === undefined ? '' : decimalSource(field.original) : edgeShown(index.get(field.id)?.node, field.field, field.original) ?? '';
        field.input.setAttribute('aria-invalid', 'false');
      }
      notifyPending();
      updateControls();
      announce('ここに 入れかけた ものを やめました。組み立て中の ブロックは のこっています');
      return { ok: true };
    }
    function cancel() {
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
      announce('とちゅうで やめました');
      render({ force: true });
      return { ok: true };
    }
    function destinationDescription() {
      const parent = index.get(destination?.parentId)?.node, schema = schemaOf(parent);
      if (destination?.input) {
        const input = schema?.inputs.find(s => s.key === destination.input);
        return (input?.label || 'あいている ところ') + 'に 入れる ブロックを えらんでいます。つなぐブロックを ふやすときは「＋ ここに入れる」を おしてください';
      }
      if (destination?.body) {
        const body = schema?.bodies.find(s => s.key === destination.body);
        const place = parent?.schemaId === 'Script' ? '本文' : (schema?.label || 'まとまり') + 'の「' + (body?.label || '中') + '」';
        return place + 'の' + (destination.index + 1) + '番目に ブロックを入れます';
      }
      return '入れる ばしょを えらんでください';
    }
    function updateControls() {
      if (deferredFocus?.isConnected && root.contains(deferredFocus)) return;
      commitButton.hidden = !pending;
      commitButton.disabled = isLocked() || !pending;
      const draft = session()?.blockDraft;
      cancelButton.disabled = !pending && !moving && !drag && !replacement && !destination && !draft;
      controls.hidden = !pending && !moving && !drag && !replacement && !destination && !draft;
      root.classList.toggle('blockui-interacting', !controls.hidden);
      root.classList.toggle('blockui-moving', !!moving || !!drag?.started);
      destinationLabel.textContent = replacement
        ? 'もとの ばしょに 入れる ブロックを えらんでください'
        : moving
          ? 'どこへ 動かすか えらんでください'
          : destination?.input
            ? destinationDescription()
            : destination?.body
              ? destinationDescription()
              : draft ? 'あいている ところを えらんで、ブロックを 入れてください' : '入れたら「決める」を おしてください';
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
      for (const menu of workspace.querySelectorAll('.blockui-actions[open]'))
        if (menu.closest('.blockui-node')?.dataset.blockId !== id) menu.open = false;
      for(const slot of workspace.querySelectorAll('.blockui-slot-active'))slot.classList.remove('blockui-slot-active');
      const selectedNode=[...workspace.querySelectorAll('.blockui-node')].find(n=>n.dataset.blockId===id),slot=selectedNode?.parentElement.closest('.blockui-input-slot');
      if(slot){slot.classList.add('blockui-slot-active');doc.defaultView.requestAnimationFrame(()=>placeSlotHead(slot));}
    }
    function chooseDestination(location) {
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
      announce(destinationDescription() + (modeChanged ? ' 見せるブロックを「すべてのブロック」に かえました。なかまと さがす言葉は そのままです。' : ''));
      if(options.tutorialActive?.())options.onDestinationSelected?.({...location});
      else search.focus({ preventScroll: true });
    }
    function defaultDestination() {
      return tree ? { parentId: tree.id, body: 'body', index: tree.bodies.body.length } : null;
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
      if (!tree || !location) return { enabled: false, reason: '入れる ばしょを えらんでください' };
      const schema = BLOCK_SCHEMA_BY_ID.get(schemaId);
      if (schema.category !== (location.body ? 'statement' : 'expression'))
        return {
          enabled: false,
          reason: location.body ? '本文には つなぐブロックを 入れます。はめるブロックは あいている ところを えらんで 入れてください' : 'いまは はめるブロックを えらんでいます。つなぐブロックを ふやすときは「＋ ここに入れる」を おしてください',
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
    function paletteAdd(schema) {
      const location = destination || defaultDestination();
      if (schema.category === 'expression' && !location?.input) {
        announce(
          'あいている ところへ おしたまま 動かしてね。あいている ところの「計算を入れる」からも 入れられます',
        );
        return;
      }
      const a = availability(schema.id, location, schema.candidateNode);
      if (!a.enabled) {
        announce(a.reason, true);
        return;
      }
      const node = a.node || createBlock(schema.id, { ...context(), idPrefix: viewId });
      const op = location.body
        ? { type: 'insert', ...location, node }
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
        page = 0;
        renderPalette();
        updateControls();
        focus({ id: session()?.blockSelection });
      }
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
          if (token) value = [token, ' \u56de\u304f\u308a\u8fd4\u3059'];
        } else if (schema.kind === 'IfStatement') {
          const token = value.find((p) => p?.slot?.key === 'condition');
          if (token) value = ['\u3082\u3057 ', token, ' \u306a\u3089'];
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
    function previewNode(schema, candidate) {
      const node =
          candidate || createBlock(schema.id, { ...context(), idPrefix: viewId + '-preview' }),
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
        main.append(doc.createTextNode('\u203b \u30e1\u30e2'));
      else if (schema.kind === 'Say') {
        main.append(pill(scalar(node.inputs.value) ?? 'ことば'));
        if (node.inputs.seconds) main.append(doc.createTextNode('を '), pill(scalar(node.inputs.seconds) ?? '秒数'), doc.createTextNode(' 秒話す'));
        else main.append(doc.createTextNode(' と言う'));
      }
      else if (schema.kind === 'VariableRead')
        main.append(pill(node.fields.name || 'へんすう'));
      else {
        const parts = phrase(schema);
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
                const text =
                  scalar(child) ??
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
    function paletteAvailability(schema, location) {
      if (schema.candidateReason) return {enabled:false, reason:schema.candidateReason, node:schema.candidateNode};
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
      modeSelect.value = paletteMode;
      const entry = document.body.dataset.uiLevel === 'entry';
      const query = entry ? '' : searchText.trim().toLocaleLowerCase();
      const registry = BLOCK_SCHEMAS.filter((s) => !s.draftOnly && ['statement', 'expression'].includes(s.category)
        && (!entry || ENTRY_BLOCK_SCHEMA_IDS.has(s.id)));
      const all = registry.filter((s) => entry || paletteMode === 'all' || s.category === paletteMode);
      const groups = [
        ['basic', 'よく使う'],
        ['', '\u3059\u3079\u3066'],
        ['motion', '\u52d5\u304d'],
        ['look', '\u898b\u305f\u76ee'],
        ['control', '\u3082\u3057\u30fb\u304f\u308a\u8fd4\u3057'],
        ['event', '合図'],
        ['data', 'へんすう・リスト'],
        ['operator', '\u8a08\u7b97'],
        ['sense', '\u3057\u3089\u3079\u308b'],
        ['sound', '\u97f3'],
        ['pen', '\u30da\u30f3'],
        ['action', '自分で作ったブロック'],
        ['clone', 'コピー'],
        ['comment', '\u30e1\u30e2'],
      ];
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
            page = 0;
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
      searchScope.textContent=query&&categoryExplicit&&category?`${groups.find(([g])=>g===category)?.[1]||category}の中を さがしています`:'すべての なかまから さがせます';
      restoreSearch.hidden = !previousSearch || !!query;
      restoreSearch.textContent = `前の「${previousSearch}」を もう一度 さがす`;
      const location = destination || defaultDestination(),
        projectState = project();
      const hints = !query ? [] : location?.body ? editorInsertionHints(session(), location, {project:projectState,context:context()})
        : hintCandidates(projectState, context().targetId, {source:session()?.sourceText || '', ...context()});
      const searched = query ? blockSearchCandidates(projectState, context(), query, hints) : all;
      const speech=searched.find(s=>s.id==='Say');
      if(speech){const timed=createBlock('Say',{idPrefix:viewId+'-timed'});timed.inputs.seconds=createBlock('NumberLiteral',{idPrefix:viewId+'-seconds'});timed.inputs.seconds.fields.value=options.tutorialActive?.()?1:2;searched.splice(searched.indexOf(speech),0,{...speech,candidateNode:timed,candidateKey:'timed-speech',searchLabel:entry?'お話しする':'言うことと 秒数を 決めて 話す'});}
      let candidates = searched.filter(
        (s) =>
          (entry || (query && !categoryExplicit) || !category || (category === 'basic'
            ? BASIC_BLOCK_SCHEMA_IDS.has(s.id)
            : blockPaletteGroup(s) === category)) &&
          (entry || paletteMode === 'all' || s.category === paletteMode) &&
          (!entry || s.id !== 'Say' || s.candidateKey === 'timed-speech'),
      );
      if (!showOutside && !entry)
        candidates = candidates.filter((s) => paletteAvailability(s, location).enabled);
      if ((entry || category === 'basic') && !query) {
        const order = [...(entry ? ENTRY_BLOCK_SCHEMA_IDS : BASIC_BLOCK_SCHEMA_IDS)];
        candidates.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      }
      const lesson=options.lessonCandidate?.();
      if(lesson){
        const candidate={...BLOCK_SCHEMA_BY_ID.get(lesson.node.schemaId),candidateNode:lesson.node,candidateKey:'lesson-'+lesson.key,lessonKey:lesson.key,searchLabel:lesson.label};
        const at=candidates.findIndex(item=>item.id===candidate.id);
        if(at<0)candidates.push(candidate);else candidates.splice(at,1,candidate);
      }
      // Keep the normal palette visible: a lesson guides a choice, never makes it.
      const guided=!!options.tutorialActive?.();
      const pages = Math.max(1, Math.ceil(candidates.length / PAGE));
      page = Math.min(page, pages - 1);
      const scroll = paletteList.scrollTop;
      paletteList.replaceChildren();
      for (const schema of (guided ? candidates : candidates.slice(page * PAGE, (page + 1) * PAGE))) {
        const a = paletteAvailability(schema, location),
          item = E('div', 'blockui-palette-item', null, {
            'data-palette-tone': blockPaletteGroup(schema),
          }),
          reason = E(
            'small',
            'blockui-unavailable',
            a.reason || '\u3053\u306e\u5834\u6240\u3067\u306f\u4f7f\u3048\u307e\u305b\u3093',
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
            title: a.reason || schema.label,
            'aria-label': (schema.searchLabel || schema.label) + 'を入れる',
            'data-search-binding': schema.candidateKey || '',
            'aria-disabled': !a.enabled,
          },
        );
        b.disabled = isLocked();
        b._akariSearchCandidate = schema;
        b.dataset.blockuiDrag = 'palette';
        b.dataset.blockuiDragSchema = schema.id;
        try {
          b.append(previewNode(schema, a.node));
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
            location?.input
              ? 'ここに 入れられる ブロックが ありません。なかまを かえるか、「ブロックの見せ方」で 使えない 理由を 見られます。つなぐブロックを ふやすときは「＋ ここに入れる」を おしてください'
              : 'この ばしょで 使える ブロックが ありません。なかまを かえるか、「ブロックの見せ方」で 使えない理由を見られます。',
          ),
        );
      previous.disabled = page === 0;
      if(!options.tutorialActive?.()&&category&&((query&&categoryExplicit)||!candidates.length))paletteList.append(button('すべての なかまで さがす','search-all',()=>{category='';categoryExplicit=false;page=0;renderPalette();search.focus();}));
      next.disabled = page >= pages - 1;
      pageLabel.textContent = page + 1 + ' / ' + pages;
      palettePages.hidden = guided || pages === 1;
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
          ...(edgeSlot(node, field) ? ['画面のはし'] : []),
          '空白',
          '上',
          '下',
          '左',
          '右',
          '決定',
          '取消',
        );
      return [...new Set(names)];
    }
    // A field named like its block is read once, not as "文字 文字".
    function joinAccessibleName(owner, part) {
      return owner === part ? owner : owner + ' ' + part;
    }
    function fieldControl(node, field, annotation = false) {
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
          const actorText = actor => actor?.kind === 'named' ? actor.name : '自分';
          const text = field.type === 'actor-ref' ? actorText(value)
            : field.type === 'argument-names' ? (value || []).join('、')
              : value ? (EVENT_LABELS[value.event] || value.event) + '、' + actorText(value.actorRef) +
                (value.filter?.key !== undefined ? '、キー「' + value.filter.key + '」'
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
        const actor = (initial, prefix = '') => {
          const kind = choice('だれの', prefix + 'kind', [['self', '自分'], ['named', '名前で えらぶ']], initial?.kind || 'self');
          const name = control('だれかの名前', 'input', prefix + 'name', initial?.name || '');
          const names = E('datalist', '', null, { id: viewId + '-actor-' + node.id + '-' + field.key + prefix });
          for (const text of [project()?.stage?.name, ...(project()?.components || []).map(c => c.name)].filter(Boolean))
            names.append(E('option', '', null, { value: text }));
          name.setAttribute('list', names.id); group.append(names);
          const sync = () => { name.parentElement.hidden = kind.value !== 'named'; };
          sync(); listen(kind, 'change', sync);
          return { read: () => kind.value === 'self' ? { kind: 'self' } : { kind: 'named', name: name.value },
            restore: () => { kind.value = initial?.kind || 'self'; name.value = initial?.name || ''; sync(); } };
        };
        if (field.type === 'actor-ref') {
          const subject = actor(value);
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
          const actorName = ref => ref?.kind==='named' ? ref.name : project()?.components.find(c=>c.id===context().targetId)?.name||project()?.stage?.name||'この動き';
          const owners=new Set([actorName(currentActor)]),scan=part=>{
            if(!part||typeof part!=='object')return;
            if(part.fields?.actorRef)owners.add(actorName(part.fields.actorRef.kind==='self'?currentActor:part.fields.actorRef));
            for(const [key,child]of Object.entries(part))if(key!=='units'&&child&&typeof child==='object')Array.isArray(child)?child.forEach(scan):scan(child);
          };scan(node.bodies);scan(node.inputs.rules);
          const location=session()?.nodeMap?.get(node.bodies.body?.[0]?.id)?.surface,range=location?.range||location?.extent,
            preview=range?session().sourceText.slice(range.start,range.end):node.bodies.body?.length?schemaOf(node.bodies.body[0]).label:'まだ ブロックが ありません';
          group.append(E('p','blockui-trigger-scope',`かえる動き：${[...owners].join('・')} ／ ${EVENT_LABELS[currentEvent]}\n${preview}
このまとまりの きっかけだけを かえます。ほかの 動きは かえません。`));
          const event = choice('いつ動く？', 'event', Object.entries(EVENT_LABELS), currentEvent);
          event.setAttribute('aria-label','いつ動く？');event.parentElement.classList.add('blockui-trigger-choice');
          const details=E('details','blockui-trigger-details');details.append(E('summary','','くわしく（きっかけ・だれ・どれで動くか）'));group.append(details);
          const detailStart=group.children.length;
          const enabled = choice('きっかけ', 'enabled', [['no', '本文だけ'], ['yes', 'できごとを決める']], value ? 'yes' : 'no');
          const subject = actor(currentActor, 'actorRef.');
          const filter = choice('どれで動くか', 'filter.kind', [['all', 'すべて'], ['key', 'このキー'], ['message', 'この合図']], currentFilter?.key !== undefined ? 'key' : currentFilter?.message !== undefined ? 'message' : 'all');
          const filterValue = control('キー・合図の文字', 'input', 'filter.value', currentFilter?.key ?? currentFilter?.message ?? '');
          const sync = () => {
            for (const option of filter.options) option.disabled = (option.value === 'key' && event.value !== 'keyDown') || (option.value === 'message' && event.value !== 'message');
            if (filter.selectedOptions[0]?.disabled) filter.value = 'all';
            filterValue.parentElement.hidden = filter.value === 'all';
            for (const child of group.querySelectorAll('input,select'))
              if (child !== enabled&&child!==event) child.disabled = isLocked() || options.readOnly || enabled.value !== 'yes';
          };
          for(const child of [...group.children].slice(detailStart))details.append(child);
          listen(details,'input',()=>{group.dataset.triggerDetailed='true';group.dataset.triggerMetadataOnly='false';});
          listen(details,'change',()=>{group.dataset.triggerDetailed='true';group.dataset.triggerMetadataOnly='false';});
          sync(); listen(enabled, 'change', sync); listen(event, 'change',()=>{enabled.value='yes';group.dataset.triggerMetadataOnly=String(!value&&group.dataset.triggerDetailed!=='true');sync();}); listen(filter, 'change', sync);
          readValue = () => {
            if (enabled.value !== 'yes') return undefined;
            const heading = { event: event.value, actorRef: subject.read() };
            if (filter.value !== 'all') heading.filter = { [filter.value]: filterValue.value };
            else if (currentFilter === null) heading.filter = null;
            return heading;
          };
          restore = () => {
            enabled.value = value ? 'yes' : 'no'; event.value = currentEvent; subject.restore();
            filter.value = currentFilter?.key !== undefined ? 'key' : currentFilter?.message !== undefined ? 'message' : 'all';
            filterValue.value = currentFilter?.key ?? currentFilter?.message ?? ''; sync();
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
          if(field.type==='heading')group.append(button('この動きの きっかけを かえる','heading-commit',()=>flush({explicit:true})),button('かえるのを やめる','heading-cancel',()=>cancel()));
          listen(group, 'change', event => { if (field.type!=='heading'&&event.target.tagName === 'SELECT') flush(); });
          listen(group, 'focusout', event => {
            if (field.type!=='heading'&&!group.contains(event.relatedTarget) && !event.relatedTarget?.closest('[data-blockui-action="cancel"],[data-blockui-action="edit-text"],[data-blockui-text-action]'))
              flushToTarget(event.relatedTarget);
          });
        }
        if (field.type === 'actor-ref') {
          const subject = subjectName(node);
          // A part's state (たくどん の よこのばしょ) takes の from the phrase, so its part name has no は.
          const owner = node.schemaId === 'ActorQualifiedRead';
          const details = editDisclosure(node, 'actorRef', owner ? subject : subject + 'は', 'blockui-subject');
          details.querySelector('summary').setAttribute('aria-label', (owner ? 'だれのかを かえる: ' : 'だれが動くかを かえる: ') + subject);
          details.append(group);
          wrap.append(details);
        } else wrap.append(group);
        return wrap;
      }
      if (field.type === 'unit' || field.type === 'direction') {
        input = E('select', '', null, attrs);
        const choices = field.type === 'unit' ? ['歩', '度', '秒', '回', '番目', '点', '個', '％', 'Hz'].map(v => [v, v])
          : [['right', '画面の右'], ['left', '画面の左'], ['up', '画面の上'], ['down', '画面の下'], ['forward', '前'], ['backward', '後ろ']];
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
    function insertion(parentId, body, pos) {
      const b = button(
        '＋ ここに入れる',
        'body-insert',
        () => chooseDestination({ parentId, body, index: pos }),
        { 'aria-label': (pos + 1) + '番目の ばしょに ブロックを入れる' },
      );
      b.classList.add('blockui-insertion');
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
      announce(type === 'copy' ? 'コピーする ばしょを えらんでください' : 'どこへ 動かすか えらんでください');
      updateControls();

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
        announce('つなぐブロックは 本文へ、はめるブロックは あいている ところへ 動かします', true);
        return;
      }
      const parent = index.get(location.parentId);
      if (
        source.type !== 'copy' &&
        (location.parentId === source.id || parent?.ancestors.includes(source.id))
      ) {
        announce('自分の中には 動かせません', true);
        return;
      }
      if (kind === 'statement') {
        const result = operate({
          type: source.type === 'copy' ? 'duplicate' : 'move',
          id: source.id,
          ...location,
        });
        if (result.ok) {
          moving = null;
          destination = null;
          render({ force: true });
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
        announce('もとと 同じ ばしょです');
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
          'もとの ばしょを 空っぽには できません。えらんだブロックを はじめの中身で おいてから、動かす先へ つなぎます。',
        ),
        select = E('select', '', null, {
          'aria-label': 'もとの ばしょに 入れる ブロック',
          'data-blockui-replacement-schema': 'true',
        });
      for (const s of BLOCK_SCHEMAS.filter((x) => x.category === 'expression'))
        select.append(E('option', '', s.palette + ' / ' + s.label, { value: s.id }));
      select.value = 'NumberLiteral';
      const accept = button('このブロックを おいて動かす', 'confirm-expression-move', () => {
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
        button('動かすのを やめる', 'cancel-expression-move', () => cancel()),
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
    function placeSlotHead(slot){
      const head=slot?.querySelector(':scope > .blockui-slot-head');if(!head||!slot.isConnected)return;
      head.style.transform='';const bounds=workspace.getBoundingClientRect(),r=head.getBoundingClientRect();
      const dx=Math.max(bounds.left+8-r.left,Math.min(0,bounds.right-8-r.right)),dy=Math.max(bounds.top+8-r.top,Math.min(0,bounds.bottom-8-r.bottom));
      head.style.transform=`translate(${dx/zoom}px,${dy/zoom}px)`;
    }
    function nodeTools(node, info) {
      const schema = schemaOf(node),
        tools = E('div', 'blockui-node-tools');
      if (schema.category === 'target' || schema.category === 'script') return tools;
      const dragHandle = button('⠿', 'drag-handle', () => selection(node.id), {
        'aria-label': schema.label + 'を おしたまま 動かす',
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
      const move = button(document.body.dataset.uiLevel==='entry'?'うごかす':'動かす', 'move', () => moveStart(node), { 'data-block-id': node.id }),
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
      commands.append(move, duplicate);
      if (info.body) {
        const siblings = index.get(info.parentId)?.node.bodies[info.body] || [];
        const up = button(
            'うえへ',
            'move-up',
            () =>
              operate({
                type: 'move',
                id: node.id,
                parentId: info.parentId,
                body: info.body,
                index: info.index - 1,
              }),
            { 'aria-label': schema.label + 'をうえへ', 'data-block-id': node.id },
          ),
          down = button(
            'したへ',
            'move-down',
            () =>
              operate({
                type: 'move',
                id: node.id,
                parentId: info.parentId,
                body: info.body,
                index: info.index + 2,
              }),
            { 'aria-label': schema.label + 'をしたへ', 'data-block-id': node.id },
          );
        up.disabled = info.index === 0;
        down.disabled = info.index === siblings.length - 1;
        tools.insertBefore(up, menu);
        tools.insertBefore(down, menu);
        commands.append(
          button(
            schema.bodies.length ? 'このまとまりと中のブロックをけす' : 'このブロックをけす',
            'remove',
            () => {
              const result = operate({ type: 'remove', id: node.id });
              if (!result.ok && index.get(info.parentId)?.node.schemaId !== 'Script')
                announce(
                  errorText(result.error || result.reason) +
                    '。「何もしないへ」で 入れかえるか、まとまりごと けせます',
                  true,
                );
            },
            { 'data-block-id': node.id },
          ),
        );
        if (!['NoOperation', 'CommentLine'].includes(schema.id))
          commands.append(
            button(
              '何もしないへ',
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
      } else if (info.input) {
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
          for (const d of diagnostics) { const item = E('li', 'diagnostic-help', childDiagnosticText(d)); appendDiagnosticDetails(item, d); ul.append(item); }
          box.append(ul);
        }
      }
      const showPage = (page) => {
        if (!bodyExtraPages.has(key)) bodyExtraPages.set(key, new Set());
        bodyExtraPages.get(key).add(page);
        render({ force: true });
      };
      let end = 0;
      for (const [begin, limit] of ranges) {
        if (begin > end) {
          const gap = E('div', 'blockui-body-gap'),
            first = Math.floor(end / BODY_PAGE),
            last = Math.floor((begin - 1) / BODY_PAGE);
          gap.append(
            button('つづきのブロックを見せる', 'body-gap-next', () => showPage(first)),
            E('span', '', `${end + 1}〜${begin}番目のブロックは かくれています`),
          );
          if (last !== first)
            gap.append(button('すぐ前のブロックを見せる', 'body-gap-previous', () => showPage(last)));
          box.append(gap);
        }
        for (let i = begin; i < limit; i++) {
          box.append(insertion(parent.id, slot.key, i));
          box.append(renderNode(children[i]));
        }
        box.append(insertion(parent.id, slot.key, limit));
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
        ? 'だれが いつ動くかを えらんで、＋からブロックを入れましょう。動く お手本は「お手本を開く」で ためせます。'
        : 'ここに ブロックを入れられます'));
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
      if (slot.type === 'expression' && !options.readOnly) {
        const types = E('select', 'blockui-value-type', null, { 'aria-label': label + 'の中身の しゅるい', 'data-blockui-value-type': 'true' });
        for (const [value, text] of [['','ちがう ものに かえる'],['NumberLiteral','数'],['StringLiteral','文字'],['SensorRead:答え','答え'],['VariableRead','名前'],['expression','計算']])
          types.append(E('option', '', text, { value }));
        types.disabled = isLocked();
        listen(types, 'change', () => {
          const kind = types.value; if (!kind) return;
          const local = pending && (pending.id === child.id || index.get(pending.id)?.ancestors.includes(child.id));
          if (pending?.composing) { announce('日本語の へんかんを おわらせてから えらんでください', true); types.value=''; return; }
          const text = local ? pending.input.value : child.schemaId === 'StringLiteral' ? child.fields.value : '';
          if (local) cancelField();
          if (kind === 'expression') { chooseDestination(location); return; }
          const next = createBlock(kind);
          if (kind === 'StringLiteral') next.fields.value = text;
          const result = operate({ type:'expression', ...location, node:next });
          if (result.ok) {
            const current = index.get(parent.id)?.node.inputs[slot.key], value = i === undefined ? current : current?.[i];
            if (value) focus({ id:value.id });
          }
        });
        const b = button('計算を入れる', 'slot-select', () => chooseDestination(location), {
          'aria-label': label + 'に計算を入れる',
        });
        b.disabled = isLocked();
        head.append(types, b);
      }
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
      box.append(renderNode(child), head);
      if (!options.readOnly && parent.schemaId === 'ListRead' && slot.key === 'list' && child.schemaId === 'StringLiteral') {
        const recovery = E('div', 'blockui-list-repair'), select = E('select', '', null, { 'aria-label':'文字の代わりに使うリストを えらぶ' });
        select.append(E('option', '', 'リストを えらぶ', { value:'' }));
        const localContext = subjectContext(parent),
          candidates = hintCandidates(project(), localContext.targetId, { source:session()?.sourceText || '', ...localContext })
          .filter(h => h.id.startsWith('read:') && h.binding?.kind === 'list' && h.enabled);
        for (const [i,h] of candidates.entries()) select.append(E('option', '', h.text, { value:String(i) }));
        select.disabled = isLocked() || !candidates.length;
        listen(select, 'change', () => { if (select.value !== '') operate({ type:'expression', ...location, node:nodeForSearchHint(candidates[Number(select.value)], project(), localContext) }); });
        recovery.append(E('span', '', '「 」で かこんだ名前は 文字です。' + (candidates.length ? '使うリストを えらび直せます。' : '使えるリストがありません。')), select);
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
      const parts = phrase(schema);
      if (parts) {
        const displayParts = [...parts];
        const form = SENTENCE_FORMS.find(item =>
          item.kind === schema.kind && (!item.op || item.op === schema.discriminator?.value));
        for (let i = 0; i < displayParts.length; i++) {
          const part = displayParts[i];
          if (!part || typeof part !== 'object' || !part.slot) continue;
          const path = part.slot.key + (part.index === undefined ? '' : '.' + part.index);
          const unit = form?.roleSlots.find(role => role.path === path)?.unit;
          const values = node.inputs?.[part.slot.key];
          const value = Array.isArray(values) ? values[part.index] : values;
          const following = displayParts[i + 1];
          if (unit && value?.schemaId === 'QuantityLiteral' && value.fields?.unit === unit &&
              typeof following === 'string' && following.startsWith(unit))
            displayParts[i + 1] = following.slice(unit.length);
        }
        for (const part of displayParts)
          main.append(
            typeof part === 'string'
              ? E('span', 'blockui-phrase-text', part)
              : part.lineBreak
                ? E('span', 'blockui-phrase-break')
              : part.field
                ? fieldControl(node, part.field)
                : renderInput(node, part.slot, part.index),
          );
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
        head.querySelector('strong').textContent=`${actor}・${EVENT_LABELS[heading?.event||context().event||'start']}`;
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
          else selection(node.id);
        }
      });
      const line = session()?.nodeMap?.get?.(node.id)?.sourceSpan?.startLine;
      const diagnostics = schema.category === 'statement' ? diagnosticsByLine.get(line) || [] : [];
      if (diagnostics.length) {
        box.classList.add('blockui-diagnostic');
        const ul = E('ul', 'blockui-node-diagnostics');
        for (const d of diagnostics) { const item = E('li', 'diagnostic-help', childDiagnosticText(d)); appendDiagnosticDetails(item, d); ul.append(item); }
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
            title: diagnostics.map((d) => childDiagnosticText(d)).join('\n'),
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
            node: createBlock('ContinuousRule', { idPrefix: viewId, draft: true, allowHoles: true }) }));
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
          for(const candidate of BLOCK_SCHEMAS.filter(s=>s.kind===schema.kind))operator.append(E('option','',candidate.label,{value:candidate.id}));
          operator.value=schema.id;operator.disabled=isLocked()||options.readOnly;
          listen(operator,'change',()=>operate({type:'operator',id:node.id,schemaId:operator.value}));
          if(schema.kind==='CompareExpression')main.append(slot('left'),E('span','blockui-phrase-text','が'),slot('right'),operator);
          else main.append(slot('left'),operator,slot('right'));
        } else if(schema.kind==='RepeatCount'||schema.kind==='Say'||schema.kind==='WaitTime'){
          const extra=editDisclosure(node,'extra','なおす','blockui-extra'),extraControls=E('div','blockui-extra-controls');
          extra.querySelector('summary').setAttribute('aria-label',schema.label+'の数・計算・時間を なおす');
          extra.append(extraControls);
          const actor=schema.fields.find(f=>f.key==='actorRef');if(actor)main.append(fieldControl(node,actor));
          const numberSlot=(key,unit)=>{
            const child=node.inputs[key],literal=(child?.schemaId==='QuantityLiteral'&&child.fields.unit===unit)||child?.schemaId==='UnitlessRead'?child.inputs.value:child;
            if(literal?.schemaId==='NumberLiteral'||literal?.schemaId==='Hole:expression'){
              main.append(fieldControl(literal,BLOCK_SCHEMA_BY_ID.get('NumberLiteral').fields.find(f=>f.key==='value')));
              main.append(E('span','blockui-phrase-text',unit));
              if(child?.schemaId==='QuantityLiteral')extraControls.append(fieldControl(child,BLOCK_SCHEMA_BY_ID.get('QuantityLiteral').fields.find(f=>f.key==='unit')));
            }else {main.append(slot(key));if(child?.schemaId!=='QuantityLiteral')main.append(E('span','blockui-phrase-text',unit));}
            extraControls.append(button('計算で決める','quantity-expression',()=>chooseDestination({parentId:node.id,input:key}),{'aria-label':schema.inputs.find(s=>s.key===key).label+'を計算で決める'}));
          };
          if(schema.kind==='Say'){
            main.append(slot('value'));
            const localContext=subjectContext(node),choices=hintCandidates(project(),localContext.targetId,{source:session()?.sourceText||'',...localContext}).filter(h=>h.id.startsWith('read:')&&h.binding?.kind!=='list'&&h.enabled);
            const data=E('select','blockui-speech-data',null,{'aria-label':'話す 文字か、へんすうの 中身を えらぶ'});
            data.append(E('option','','文字を話す',{value:'literal'}),E('option','','計算の答えを話す',{value:'expression'}));
            for(const [i,hint]of choices.entries())data.append(E('option','',hint.text+'の いまの中身',{value:String(i)}));
            const current=node.inputs.value;
            data.value=current.schemaId==='StringLiteral'?'literal':String(choices.findIndex(h=>h.binding.name===current.fields.name&&h.binding.qualifier===current.fields.qualifier));
            if(!data.value)data.value='expression';data.disabled=isLocked()||options.readOnly;
            listen(data,'change',()=>{
              if(data.value==='expression'){chooseDestination({parentId:node.id,input:'value'});return;}
              const replacement=data.value==='literal'?createBlock('StringLiteral'):nodeForSearchHint(choices[Number(data.value)],project(),localContext);
              if(data.value==='literal')replacement.fields.value=current.fields.name||current.fields.value||'';
              operate({type:'expression',parentId:node.id,input:'value',node:replacement});
            });extraControls.append(data);
            if(node.inputs.seconds){main.append(E('span','blockui-phrase-text','を'));numberSlot('seconds','秒');main.append(E('span','blockui-phrase-text','話す'));extraControls.append(button('時間を外す','speech-untimed',()=>operate({type:'optional-input-remove',parentId:node.id,input:'seconds'})));}
            else {main.append(E('span','blockui-phrase-text','と言う'));extraControls.append(button('秒数を決めて話す','speech-timed',()=>{const seconds=createBlock('NumberLiteral');seconds.fields.value=2;return operate({type:'expression',parentId:node.id,input:'seconds',node:seconds});}));}
          }else {numberSlot(schema.kind==='RepeatCount'?'count':'seconds',schema.kind==='RepeatCount'?'回':'秒');main.append(E('span','blockui-phrase-text',schema.kind==='RepeatCount'?'くり返す':'待つ'));}
          main.append(extra);
        } else if (node.schemaId === 'UnaryExpression:NEG' && node.inputs.value?.schemaId === 'NumberLiteral') {
          const child = node.inputs.value, numberField = BLOCK_SCHEMA_BY_ID.get('NumberLiteral').fields.find(f => f.key === 'value'),
            control = fieldControl(child, numberField), input = control.querySelector('input');
          if (input) { input.value = '－' + decimalSource(child.fields.value); input.dataset.signedParentId = node.id; input.dataset.signedEdit = 'true'; }
          main.append(control);
        } else if (schema.kind === 'QuantityLiteral') main.append(slot('value'), field('unit'));
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
          main.append(field('actorRef'), E('span', '', 'は、'), slot('condition'), E('span', '', 'にあてはまる間、'),
            field('direction'), E('span', '', 'へ、'), slot('seconds'), E('span', '', '秒に'), slot('distance'), E('span', '', '歩の速さで 動きつづける'));
          for (const input of main.querySelectorAll(':scope > .blockui-input-slot')) {
            input.style.flexShrink = '0'; input.style.flexDirection = 'column';
            const head = input.querySelector(':scope > .blockui-slot-head');
            if (head) { head.style.position = 'static'; head.style.minWidth = '0'; }
          }
        }
        else if (schema.kind === 'WaitBroadcastGroup') main.append(field('actorRef'), field('broadcastRef'), E('span', '', 'の合図を受けた動きが 全部おわるまで待つ'));
        else if (schema.kind === 'BuiltinCall' && schema.discriminator?.value === '乱数' && node.inputs.args?.length === 2) {
          // Read as the code writes it: 1から6のどれか.
          const args = schema.inputs.find(s => s.key === 'args');
          main.append(renderInput(node, args, 0), E('span', '', 'から'), renderInput(node, args, 1), E('span', '', 'のどれか'));
        }
        else if (schema.kind === 'MotionCommand' && ['MOVE_DIRECTION', 'GLIDE_DIRECTION'].includes(schema.discriminator?.value)) {
          const args = schema.inputs.find(s => s.key === 'args');
          if (schema.discriminator.value === 'GLIDE_DIRECTION') main.append(field('actorRef'), renderInput(node, args, 0), E('span', '', 'かけて'), field('direction'), E('span', '', 'へ'), renderInput(node, args, 1), E('span', '', '動く'));
          else main.append(field('actorRef'), field('direction'), E('span', '', 'へ'), renderInput(node, args, 0), E('span', '', '動く'));
        }
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
            for (const f of schema.fields.filter(f => ['argument-names', 'reference'].includes(f.type))) main.append(fieldControl(node, f));
          } else renderPhrase(node, schema, main);
        }
        if (['statement', 'expression'].includes(schema.category)) {
          main.dataset.blockuiDrag = 'node';
          main.dataset.blockId = node.id;
        }
        if(schema.kind==='IfStatement'&&!node.fields.hasElse&&!options.readOnly)main.append(button('＋ そうでなければを入れる','else-add',()=>{
          const result=operate({type:'else',id:node.id,enabled:true});
          if(result.ok){const parent=index.get(node.id)?.node,hole=parent?.bodies.elseBody.find(n=>n.schemaId==='Hole:statement');if(hole)focus({id:hole.id});}
        }));
        content.append(main);
      }
      for (const slot of schema.bodies) {
        const body = statementBody(node, slot);
        if (body) content.append(body);
      }
      if(schema.category==='script'&&node.inputs.units?.length){
        const units=E('section','blockui-document-units');units.setAttribute('aria-label','同じ文書のできごと');
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
        const item = E('li', 'diagnostic-help', (d.line ? d.line + '行目: ' : '') + childDiagnosticText(d));
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
            'この本文の書き方を たしかめてください。コードは そのまま のこっています。',
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
      locationElement(point)?.classList.add('blockui-current');
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
        name = tree?.fields.heading?.actorRef?.kind==='named'?tree.fields.heading.actorRef.name:who?.name||p?.components.find(c=>c.id===ctx.targetId)?.name||ctx.definition?.name||'この動き';
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
            ? EVENT_LABELS[tree?.fields.heading?.event||ctx.event||event] || event
            : kind === 'function'
              ? 'このブロックで 答えを出すとき'
              : 'このブロックを 使ったとき',
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
          Math.ceil(world.offsetHeight * zoom + workspace.clientHeight * 0.4),
        ) + 'px';
      zoomLabel.textContent = Math.round(zoom * 100) + '%';
      minus.disabled = zoom <= 0.2;
      plus.disabled = zoom >= 2;
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
    function fitBlocks() {
      const script = world.querySelector('.blockui-script');
      if (!script) return;
      setZoom(
        Math.min(
          1,
          Math.max(0.75,(workspace.clientWidth - 80) / (script.offsetWidth + 56)),
        ),
      );
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
    listen(workspace, 'pointerdown', (event) => {
      if (
        event.button !== 0 ||
        event.isPrimary === false ||
        drag ||
        event.target.closest('.blockui-node,.blockui-event-hat,button,input,select,textarea,summary,a')
      )
        return;
      pan = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: workspace.scrollLeft,
        top: workspace.scrollTop,
      };
      workspace.setPointerCapture(event.pointerId);
      workspace.classList.add('blockui-panning');
      event.preventDefault();
    });
    listen(workspace, 'pointermove', (event) => {
      if (!pan || pan.id !== event.pointerId) return;
      workspace.scrollLeft = pan.left + pan.x - event.clientX;
      workspace.scrollTop = pan.top + pan.y - event.clientY;
      event.preventDefault();
    });
    listen(workspace, 'pointerup', (event) => {
      if (pan?.id === event.pointerId) endPan();
    });
    listen(workspace, 'pointercancel', endPan);
    listen(workspace, 'lostpointercapture', () => {
      if (pan) endPan();
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
    function beginGhost(state) {
      const source = state.schemaId
        ? state.element.querySelector('.blockui-preview')
        : state.element.closest('.blockui-node');
      if (!source) return;
      const rect = source.getBoundingClientRect(),
        scale = state.schemaId ? 1 : zoom,
        clone = source.cloneNode(true);
      ghost = E('div', 'blockui-editor blockui-drag-ghost');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.inert = true;
      ghost.dataset.paletteTone =
        source.dataset.paletteTone ||
        state.element.closest('[data-palette-tone]')?.dataset.paletteTone ||
        'data';
      clone.classList.remove('blockui-selected', 'blockui-current', 'blockui-dragging');
      clone.style.width = source.offsetWidth + 'px';
      clone.style.maxWidth = 'none';
      for (const n of clone.querySelectorAll('[id]')) n.removeAttribute('id');
      for (const n of clone.querySelectorAll('.blockui-actions[open]')) n.open = false;
      const holder = E('div', 'blockui-world blockui-ghost-world');
      holder.append(clone);
      ghost.append(holder);
      ghost.style.width = source.offsetWidth + 'px';
      ghost.style.transform = `scale(${scale})`;
      doc.body.append(ghost);
      state.grabX = Math.min(rect.width, Math.max(0, state.startX - rect.left));
      state.grabY = Math.min(rect.height, Math.max(0, state.startY - rect.top));
      state.visual = source;
      source.classList.add('blockui-dragging');
    }
    function moveGhost(point) {
      if (!ghost || !drag) return;
      ghost.style.left = point.clientX - drag.grabX + 'px';
      ghost.style.top = point.clientY - drag.grabY + 'px';
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
        category = schema?.category;
      const direct = doc.elementFromPoint(event.clientX, event.clientY)?.closest('[data-blockui-drop]');
      if (
        direct &&
        world.contains(direct) &&
        (category === 'statement') === !!direct.dataset.blockuiBody
      )
        return direct;
      let best = null,
        distance = Infinity;
      const candidates =
        category === 'statement'
          ? world.querySelectorAll('.blockui-insertion')
          : world.querySelectorAll('.blockui-input-slot[data-blockui-drop]');
      for (const element of candidates) {
        const r = element.getBoundingClientRect();
        if (r.bottom < bounds.top || r.top > bounds.bottom) continue;
        const dx = Math.max(r.left - event.clientX, 0, event.clientX - r.right),
          dy = Math.max(r.top - event.clientY, 0, event.clientY - r.bottom),
          d = Math.hypot(dx, dy);
        if (d < 28 && d < distance) {
          best = element;
          distance = d;
        }
      }
      return best;
    }
    function cancelDrag() {
      const state = drag;
      drag = null;
      ghost?.remove();
      ghost = null;
      snapPreview?.remove();
      snapPreview = null;
      state?.visual?.classList.remove('blockui-dragging');
      if (state?.started) suppressClickUntil = Date.now() + 350;
      if (dragFrame !== null) doc.defaultView.cancelAnimationFrame(dragFrame);
      dragFrame = null;
      if (state?.element?.hasPointerCapture?.(state.pointerId))
        try {
          state.element.releasePointerCapture(state.pointerId);
        } catch (_) {}
      for (const n of root.querySelectorAll('.blockui-drop-preview,.blockui-drop-invalid,.blockui-dragging'))
        n.classList.remove('blockui-drop-preview', 'blockui-drop-invalid', 'blockui-dragging');
      root.classList.remove('blockui-drag-active');
      notifyPending();
      updateControls();
    }
    function previewDrag(point) {
      if (!drag) return;
      for (const n of root.querySelectorAll('.blockui-drop-preview,.blockui-drop-invalid'))
        n.classList.remove('blockui-drop-preview', 'blockui-drop-invalid');
      const element = dragCandidate(point),
        location = locationFromElement(element),
        schema = drag.schemaId
          ? BLOCK_SCHEMA_BY_ID.get(drag.schemaId)
          : schemaOf(index.get(drag.id)?.node);
      let valid = !!location && schema?.category === (location.body ? 'statement' : 'expression'),
        reason = location
          ? 'つなぐブロックは 本文へ、はめるブロックは あいている ところへ つなぎます'
          : 'どこへ 動かすか えらんでください。おける ばしょの 外で はなすと やめます';
      if (valid && drag.id) {
        const parent = index.get(location.parentId);
        valid = location.parentId !== drag.id && !parent?.ancestors.includes(drag.id);
        if (!valid) reason = '自分の中には 動かせません';
      }
      if (valid && drag.schemaId) {
        const candidate = availability(drag.schemaId, location, drag.candidate?.candidateNode);
        valid = candidate.enabled;
        if (!valid) reason = candidate.reason;
      }
      if (valid && drag.id && schema.category === 'statement')
        try {
          prepareBlockEdit(
            { ...session(), pendingEdit: null },
            { type: 'move', id: drag.id, ...location },
          );
        } catch (e) {
          valid = false;
          reason = errorText(e);
        }

      if (valid) reason = location.body ? 'ここにつなぐ' : 'ここの 中身を 入れかえる';
      drag.location = location;
      drag.valid = valid;
      if (element) element.classList.add(valid ? 'blockui-drop-preview' : 'blockui-drop-invalid');
      snapPreview?.remove();
      snapPreview = null;
      if (valid && element) {
        const r = element.getBoundingClientRect();
        snapPreview = E('div', 'blockui-snap-preview', reason);
        snapPreview.setAttribute('aria-hidden', 'true');
        snapPreview.style.left = r.left + 8 + 'px';
        snapPreview.style.top = (location.body ? r.top - 14 : r.bottom + 2) + 'px';
        doc.body.append(snapPreview);
      }
      if (drag.reason !== reason) {
        drag.reason = reason;
        announce(reason, !valid && !!location);
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
    listen(root, 'pointerdown', (event) => {
      pointerFocusTarget = event.target;
      const handle = event.target.closest('[data-blockui-drag]');
      if (
        !handle ||
        handle.disabled ||
        handle.getAttribute('aria-disabled') === 'true' ||
        isLocked() ||
        event.button !== 0 ||
        event.isPrimary === false
      )
        return;
      if (
        handle.dataset.blockuiDrag === 'node' &&
        event.target.closest('input,textarea,select,summary,a,button:not([data-blockui-drag])')
      )
        return;
      if (pending) deferredFocus = handle;
      if (!flush().ok) { deferredFocus = null; return; }
      const id = handle.dataset.blockId,
        schemaId = handle.dataset.blockuiDragSchema;
      drag = {
        pointerId: event.pointerId,
        element: handle,
        id,
        schemaId,
        candidate: handle._akariSearchCandidate,
        startX: event.clientX,
        startY: event.clientY,
        started: false,
        owner: session()?.ownerKey,
        revision: session()?.sourceRevision,
        contextRevision: session()?.contextRevision,
        location: null,
        valid: false,
      };
      try {
        handle.setPointerCapture(event.pointerId);
      } catch (_) {}
    });
    listen(root, 'pointermove', (event) => {
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
      if (!drag.started && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5)
        return;
      if (!drag.started) {
        drag.started = true;
        beginGhost(drag);
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
      cancelDrag();
      if (!started) return;
      event.preventDefault();
      suppressClickUntil = Date.now() + 350;
      if (!state.valid || !state.location) {
        announce('動かすのを やめました');
        return;
      }
      if (state.schemaId) {
        destination = state.location;
        paletteAdd(state.candidate || BLOCK_SCHEMA_BY_ID.get(state.schemaId));
      } else completeMove(state.location, { id: state.id, type: 'move' });
    });
    listen(root, 'pointercancel', () => {
      pointerFocusTarget = null;
      cancelDrag();
      announce('動かすのを やめました');
    });
    listen(root, 'lostpointercapture', () => {
      if (drag) cancelDrag();
    });
    listen(root, 'focusout', (event) => {
      if (deferredFocus !== event.target) return;
      deferredFocus = event.relatedTarget && root.contains(event.relatedTarget) ? event.relatedTarget : null;
      if (!deferredFocus && deferredRender) render({ force: true });
    }, { capture: true });
    // Finish pointer activation before folding the old selection or growing the new one.
    // Keyboard focus selects immediately so Tab can discover the selected block's tools.
    function focusBlockField(target) {
      if (target.closest('button,summary,.blockui-slot-head')) return;
      const slot = target.closest('.blockui-input-slot'),
        node = target.closest('.blockui-node'),
        field = target.closest('.blockui-field');
      for (const n of root.querySelectorAll('.blockui-editing-field')) n.classList.remove('blockui-editing-field');
      if (field && field.dataset.fieldType !== 'number' && target.matches('input,textarea')) {
        const bounds = workspace.getBoundingClientRect(), position = target.getBoundingClientRect(),
          editText = field.querySelector(':scope > .blockui-edit-text'),
          buttonSpace = editText ? editText.getBoundingClientRect().width +
            (parseFloat(doc.defaultView.getComputedStyle(field).columnGap) || 0) * zoom : 0,
          available = Math.max(100, Math.min(bounds.right, doc.defaultView.innerWidth) - position.left - buttonSpace - 18);
        field.style.setProperty('--blockui-edit-width', Math.min(672, available) / zoom + 'px');
        field.classList.add('blockui-editing-field');
      }
      for (const n of root.querySelectorAll('.blockui-focused')) n.classList.remove('blockui-focused');
      for (const n of root.querySelectorAll('.blockui-slot-active'))
        n.classList.remove('blockui-slot-active');
      node?.classList.add('blockui-focused');
      if (node) {
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
      if (event.isComposing) return;
      if (event.key === 'Tab') {
        if (deferredFocus === event.target) {
          deferredFocus = null;
          if (deferredRender) render({ force: true });
        }
        if (pending?.input === event.target) flush({ focus:false });
        for (const field of root.querySelectorAll('.blockui-editing-field'))
          field.classList.remove('blockui-editing-field');
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        const menu = event.target.closest('.blockui-extra[open],.blockui-subject[open],.blockui-actions[open],.blockui-local-help[open]') || root.querySelector('.blockui-local-help[open],.blockui-actions[open]');
        if (menu) {
          menu.open = false;
          menu.querySelector('summary')?.focus();
          return;
        }
        if (pending) cancelField();
        else {
          destination = null; replacement = null; moving = null; cancelDrag();
          notifyPending(); renderReplacement(); renderPalette(); updateControls();
          for (const selected of workspace.querySelectorAll('.blockui-chosen-destination')) selected.classList.remove('blockui-chosen-destination');
          for (const slot of workspace.querySelectorAll('.blockui-slot-active')) slot.classList.remove('blockui-slot-active');
          announce('えらぶのを やめました。組み立て中のものは「とちゅうで やめる」、決めたことは「もとにもどす」で もどせます');
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
  function designResizePoint(c, direction = 'se') {
    const [hx, hy] = DESIGN_RESIZE_DIRECTIONS[direction],
      s = c.scalePercent / 100,
      rad = ((c.direction % 360) * Math.PI) / 180,
      cs = Math.cos(rad),
      sn = Math.sin(rad),
      vx = (hx * c.w * s) / 2,
      vy = (hy * c.h * s) / 2;
    return { x: c.x + c.w / 2 + vx * cs - vy * sn, y: c.y + c.h / 2 + vx * sn + vy * cs };
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
      lx = (dx * cs + dy * sn) / s,
      ly = (-dx * sn + dy * cs) / s;
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
    let w = hx ? c.w + hx * lx : c.w,
      h = hy ? c.h + hy * ly : c.h;
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
    // Keep the opposite corner/edge fixed even under rotation and stage scaling.
    const vx = (hx * (w - c.w) * s) / 2,
      vy = (hy * (h - c.h) * s) / 2;
    result.x = c.x + (c.w - w) / 2 + vx * cs - vy * sn;
    result.y = c.y + (c.h - h) / 2 + vx * sn + vy * cs;
    result.w = w;
    result.h = h;
    return Object.values(result).every(Number.isFinite)
      ? result
      : { x: c.x, y: c.y, w: c.w, h: c.h, scalePercent: c.scalePercent };
  }

  // Color picker data is presentation-only. Persist the existing fg/bg hex or null.
  const COLOR_PRESETS = Object.freeze(
    [
      '\u8d64',
      '\u6a59',
      '\u9ec4',
      '\u7dd1',
      '\u6c34\u8272',
      '\u9752',
      '\u7d2b',
      '\u6843',
      '\u8336',
      '\u767d',
      '\u7070',
      '\u9ed2',
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

