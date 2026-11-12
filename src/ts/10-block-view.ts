import { COLOR_LABELS, COLOR_NAMES } from './02-language-contracts.ts';
import { BLOCK_SCHEMA_BY_ID } from './05-command-presentation.ts';
import { blockZoomStep } from './09-editor-sessions.ts';
import { createViewBase } from './10-view-base.ts';
import { createViewEditing } from './10-view-editing.ts';
import { createViewDrawing } from './10-view-drawing.ts';
import type { Component } from '../types/project.d.ts';
import type { BlockElement, BlockViewOptions, PendingPan, PhrasePart, PressedControl, ViewAvailability, ViewPoint, ViewRedraw, ViewVars } from '../types/block-view.d.ts';
import type { BlockIndexEntry } from '../types/blocks.d.ts';
import type { Diagnostic } from '../types/compiled.d.ts';

// ────────────────────────────────────────────────────────────────────────
// 10 — Block view, interaction and viewport state
// ────────────────────────────────────────────────────────────────────────
export function createBlockEditorView(options: BlockViewOptions) {
  // The state of this one view, shared with its parts (src/ts/10-view-*.ts) and assigned where it was declared, the
  // functions the parts offer each other, and the redraw request. The parts run first, in the order src/akari.html
  // includes them (base, editing, drawing), then the view.
  // (the view fills its state, and the drawing its redraw, before anything reads them: FILLED_BAGS, audit/lib/type-check.mjs)
  const viewVars = {} as ViewVars;
  const viewCalls = {};
  const viewRedraw = {} as ViewRedraw;
  createViewBase(viewVars, viewCalls, viewRedraw);
  createViewEditing(viewVars, viewCalls, viewRedraw);
  createViewDrawing(viewVars, viewCalls, viewRedraw);
  viewVars.options = options;
  ({
    root: viewVars.root,
    getSession: viewVars.getSession,
    getProject: viewVars.getProject,
    getContext: viewVars.getContext = () => ({}),
    isLocked: viewVars.isLocked = () => false,
    onOperation: viewVars.onOperation,
    onPending: viewVars.onPending = () => {},
    onCancel: viewVars.onCancel = () => {},
  } = options);
  // (the view's root is in a page shown in a window)
  viewVars.doc = viewVars.root.ownerDocument as ViewVars['doc'],
    viewVars.viewId = 'blockui-view-' + ++createBlockEditorView.sequence,
    viewVars.abort = new AbortController(),
    viewVars.signal = viewVars.abort.signal;
  viewVars.pending = null,
    viewVars.deferredFocus = null,
    viewVars.deferredRender = false,
    viewVars.committing = false,
    viewVars.rendering = false,
    viewVars.destroyed = false,
    viewVars.signature = '',
    // The body's text the view was last drawn for (owner, text and context revisions).
    viewVars.textKey = '',
    viewVars.tree = null,
    viewVars.index = new Map<string, BlockIndexEntry>(),
    viewVars.selected = '',
    viewVars.destination = null,
    viewVars.moving = null,
    viewVars.drag = null,
    viewVars.replacement = null,
    viewVars.currentLocation = null,
    viewVars.suppressClickUntil = 0,
    viewVars.pointerFocusTarget = null,
    // The element focused when the pointer went down: a field entered from elsewhere selects its whole value (E-01).
    viewVars.pointerFocusPrevious = null,
    // How the last press was made (mouse, touch or pen): a touch drop does not open the screen keyboard (E-03).
    viewVars.lastPointerType = 'mouse',
    viewVars.highlightedId = null,
    viewVars.lineNodes = new Map<number, string>(),
    viewVars.displaySession = null,
    viewVars.dragFrame = null;
  viewVars.searchText = '',
    viewVars.previousSearch = '',
    viewVars.category = document.body.dataset.uiLevel !== 'advanced' ? 'basic' : '',
    viewVars.showOutside = false,
    viewVars.paletteMode = 'all',
    viewVars.categoryExplicit = false,
    viewVars.availabilityCache = new Map<string, ViewAvailability>(),
    viewVars.cacheSignature = '',
    viewVars.diagnosticPage = 0,
    viewVars.diagnosticsOpen = false,
    viewVars.diagnosticsByLine = new Map<number, Diagnostic[]>(),
    // 作品チェックの知らせ of the shown body by line (P11 (d)); the host puts them on session.notices.
    viewVars.noticesByLine = new Map<number, Diagnostic[]>(),
    viewVars.branchLines = new Map<number, { id: string; body: string }>(),
    viewVars.branchSourceLines = new Map<string, number>();
  viewVars.phraseCache = new Map<string, PhrasePart[] | null>();
  // The なかま of the list, in their order: the chips, and the names of the list's blocks elsewhere (FCB-21).
  viewVars.PALETTE_GROUP_LABELS = new Map([
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
  viewVars.faceSymbols = null;
  viewVars.openEditors = new Set();
  viewVars.openAnnotations = new Set(),
    viewVars.collapsed = new Set(),
    viewVars.bodyPages = new Map<string, number>(),
    viewVars.bodyExtraPages = new Map<string, Set<number>>(),
    viewVars.inputPages = new Map<string, number>();
  // Bound both the opening batch and a revealed later batch with role controls.
  viewVars.BODY_PAGE = 40,
    viewVars.INPUT_PAGE = 20;
  viewVars.zoom = 1,
    viewVars.pan = null,
    viewVars.geometryFrame = null,
    viewVars.ghost = null,
    viewVars.snapPreview = null,
    viewVars.bodyObserver = null,
    // The height the workspace keeps while the places between blocks are open, and what kept its place when they
    // opened for a chosen place or a moved block (keepInView).
    viewVars.planeFloor = 0,
    viewVars.openAnchor = null;
  viewVars.shapeObserver =
    typeof ResizeObserver === 'function' ? new ResizeObserver(() => viewCalls.scheduleGeometry()) : null;
  viewVars.root.classList.add('blockui-editor');
  viewVars.root.setAttribute('aria-label', 'ブロックで作るところ');
  viewVars.controls = viewCalls.E('div', 'blockui-view-controls'),
    viewVars.destinationLabel = viewCalls.E('div', 'blockui-destination', '本文の いちばん下に入れる'),
    viewVars.cancelButton = viewCalls.button('入力を やめる', 'cancel', () => viewCalls.cancel()),
    viewVars.commitButton = viewCalls.button('決める', 'commit', () => viewCalls.flush({explicit:true})),
    viewVars.messageBox = viewCalls.E('div', 'blockui-message', '', { 'aria-live': 'polite' }),
    // An input's mistake is shown right under the field, in the floating 決める and やめる (E-12).
    viewVars.fieldError = viewCalls.E('p', 'blockui-field-error', '', { id: viewVars.viewId + '-field-error' });
  viewVars.controls.append(viewVars.fieldError, viewVars.destinationLabel, viewVars.commitButton, viewVars.cancelButton);
  viewVars.commitButton.style.pointerEvents = viewVars.cancelButton.style.pointerEvents = 'auto';
  viewVars.root.append(viewVars.controls, viewVars.messageBox);
  viewVars.layout = viewCalls.E('div', 'blockui-layout'),
    viewVars.palette = viewCalls.E('aside', 'blockui-palette', null, {
      'aria-label': 'ブロックの一覧',
    }),
    viewVars.workspace = viewCalls.E('div', 'blockui-workspace', null, {
      tabindex: '0',
      'aria-label': 'ブロックの作業台',
    }),
    viewVars.paletteControls = viewCalls.E('div', 'blockui-palette-controls');
  viewVars.workspaceShell = viewCalls.E('div', 'blockui-workspace-shell'),
    viewVars.plane = viewCalls.E('div', 'blockui-plane'),
    viewVars.world = viewCalls.E('div', 'blockui-world'),
    viewVars.navigation = viewCalls.E('div', 'blockui-navigation', null, {
      'aria-label': '作業台の見え方',
    });
  viewVars.zoomLabel = viewCalls.button('100%', 'zoom-reset', () => viewCalls.setZoom(1), {
    'aria-label': '作業台を 100%に もどす',
  });
  // − and ＋ step through 50・75・100・125・150・200% (E-10); the label puts 100% back. They are named by what they zoom,
  // apart from the stage's 「大きく見る」 and as its own 「作品画面を 大きく」 (Y2-08).
  viewVars.minus = viewCalls.button('−', 'zoom-out', () => viewCalls.setZoom(blockZoomStep(viewVars.zoom, -1)), {
      'aria-label': '作業台を 小さく',
    }),
    viewVars.plus = viewCalls.button('＋', 'zoom-in', () => viewCalls.setZoom(blockZoomStep(viewVars.zoom, 1)), {
      'aria-label': '作業台を 大きく',
    });
  // The workspace goes back to its top-left corner: 「さいしょへ」 (F-22).
  viewVars.home = viewCalls.button('さいしょへ', 'workspace-home', () => {
      viewVars.workspace.scrollTo({ left: 0, top: 0 });
      viewVars.workspace.focus({ preventScroll: true });
    }),
    viewVars.fit = viewCalls.button('見わたす', 'workspace-fit', () => viewCalls.fitBlocks());
  // 「ブロックを しまう」 puts the block list away so the body gets its width, and reads 「ブロックを 出す」 while it is
  // away (F-09). はじめて has no such button: its short list always stays.
  viewVars.libraryToggle = viewCalls.button(
    'ブロックを しまう',
    'library-toggle',
    () => {
      const editingHidden = viewVars.root.querySelector('.blockui-editing-field') &&
        viewVars.doc.defaultView.getComputedStyle(viewVars.palette).display === 'none';
      if (editingHidden) {
        // A narrow text editor temporarily hides the palette independently of
        // this toggle. Finish valid input before explicitly bringing it back.
        if (!viewCalls.flush().ok) return;
        for (const field of viewVars.root.querySelectorAll('.blockui-editing-field'))
          field.classList.remove('blockui-editing-field');
        viewVars.root.classList.remove('blockui-library-hidden');
      } else viewVars.root.classList.toggle('blockui-library-hidden');
      viewCalls.syncLibraryToggle();
      viewCalls.scheduleGeometry();
    },
    { 'aria-expanded': 'true' },
  );
  viewVars.wide = viewVars.options.onExpand
    ? viewCalls.button(
        '作業台を広く',
        'workspace-expand',
        () => {
          if (viewVars.isLocked()) return;
          // (the button is made only for a host that widens the workspace, and is the view's wide button)
          const expanded = viewVars.options.onExpand!();
          viewVars.wide!.textContent = expanded
            ? '画面も見る'
            : '作業台を広く';
          viewVars.wide!.setAttribute('aria-pressed', String(expanded));
          viewCalls.scheduleGeometry();
        },
        { 'aria-pressed': 'false' },
      )
    : null;
  viewVars.navigation.append(viewVars.libraryToggle, viewVars.home, viewVars.fit, viewVars.minus, viewVars.zoomLabel, viewVars.plus);
  if (viewVars.wide) viewVars.navigation.append(viewVars.wide);
  viewVars.plane.append(viewVars.world);
  viewVars.workspace.append(viewVars.plane);
  viewVars.workspaceShell.append(viewVars.workspace, viewVars.navigation);
  viewVars.workspaceTip = viewCalls.E(
    'div',
    'blockui-workspace-tip',
    'ブロックを つかんで つなげよう · ブロックの ない ところを おしたまま ずらすと、作業台の 見える ところが かわるよ',
  );
  viewVars.workspaceShell.append(viewVars.workspaceTip);
  viewVars.modeSelect = viewCalls.E('select', '', null, {
    'aria-label': 'ブロックの しゅるい',
    'data-blockui-palette-mode': 'true',
  });
  for (const [v, l] of [
    ['all', 'すべてのブロック'],
    ['statement', 'つなぐブロック'],
    ['expression', 'はめるブロック'],
  ])
    viewVars.modeSelect.append(viewCalls.E('option', '', l, { value: v }));
  viewVars.search = viewCalls.E('input', '', null, {
      type: 'search',
      placeholder: 'ブロックを さがす',
      'aria-label': 'ブロックを さがす',
      'data-blockui-search': 'true',
    }),
    viewVars.categorySelect = viewCalls.E('div', 'blockui-categories', null, {
      role: 'group',
      'aria-label': 'ブロックの なかま',
    }),
    viewVars.outside = viewCalls.E('input', '', null, { type: 'checkbox', 'aria-label': '使えないブロックも見せる' }),
    viewVars.outsideLabel = viewCalls.E('label', 'blockui-check');
  viewVars.outside.checked = viewVars.showOutside;
  viewVars.outsideLabel.append(viewVars.outside, viewVars.doc.createTextNode('使えないブロックも見せる'));
  // One list that scrolls, with no pages (E-17).
  viewVars.paletteList = viewCalls.E('div', 'blockui-palette-list'),
    viewVars.paletteOptions = viewCalls.E('details', 'blockui-palette-options');
  viewVars.paletteOptions.append(viewCalls.E('summary', '', 'ブロックの しゅるい'), viewVars.outsideLabel);
  viewVars.paletteOptions.append(viewVars.modeSelect);
  viewVars.searchLabel=viewCalls.E('label','blockui-search-label','ブロックを さがす');
  viewVars.searchLabel.append(viewVars.search);
  viewVars.paletteControls.append(viewVars.searchLabel, viewVars.paletteOptions);
  viewVars.searchScope=viewCalls.E('p','blockui-search-scope','',{'aria-live':'polite'});
  viewVars.paletteControls.append(viewVars.searchScope);
  viewVars.restoreSearch = viewCalls.button('', 'restore-search', () => {
    viewVars.searchText = viewVars.search.value = viewVars.previousSearch;
    viewCalls.renderPalette();
  });
  viewVars.paletteControls.append(viewVars.restoreSearch);
  // (offered only to a host that makes data)
  if(viewVars.options.onData)viewVars.paletteControls.append(viewCalls.button('＋ へんすう・リストを作る','create-data',()=>viewVars.options.onData!()));
  // ＾ is a くわしく block (F-21): its help shows there only (renderPalette).
  viewVars.powerHelp=viewCalls.E('p','','「同じ数を くり返し かける」（＾）は、同じ 数を 何回も かける 計算だよ。2＾3 は 2×2×2 で 8 に なるよ。');
  viewVars.help=viewCalls.E('details','blockui-local-help');viewVars.help.append(viewCalls.E('summary','','いまの作り方のヒント'),
    viewCalls.E('p','','「＋ ここに入れる」で ブロックを 入れるよ。あいている ところには 文字・数・へんすう・リストを えらぶよ。「たずねる」で 待った 返事は「答え」で 使えるよ。とちゅうでも ほぞん できるよ。'),
    viewCalls.E('p','','あいている ところに 入れる 中身には、文字「おはよう」、数の 10、「あてはまる・あてはまらない」などが あるよ。'),
    viewCalls.E('p','','つなぐブロックは、「話す」「待つ」など、してほしい ことだよ。本文（ほんぶん）は、ブロックを じゅんばんに ならべる ところだよ。'),
    viewCalls.E('p','','ブロックは なかまごとに 分かれて いるよ。れい：「よく使う」には「話す」「待つ」が あるよ。「ブロックを さがす」に ことばを 入れると、さがせるよ。「ブロックの しゅるい」で、つなぐブロックと はめるブロックの どちらを 見るか えらべるよ。「使えないブロックも見せる」を えらぶと、使えない わけも 読めるよ。'),
    viewCalls.E('p','','とちゅうに 入れる：本、ぼうしの 間に かさを 入れると、本、かさ、ぼうしに なるよ。入れかえる：かさを ぼうしに かえる ように、えらんだ 中身を かえるよ。'),
    viewCalls.E('p','','リストには、中身が 1つずつ ならんで いるよ。「中身を 一つずつ 見る」ブロックでは、前から じゅんに 同じ 動きを するよ。'),
    viewCalls.E('p','','計算や くらべ方の しるしだけを かえても、左右の 中身は のこるよ。'),
    viewVars.powerHelp,
    viewCalls.E('p','','メモは、あとで 思い出せるように 書く ひとことだよ。動きは かわらないよ。'),
    viewCalls.E('p','','「見た目のコピー」は、見た目と せっていが 同じ 部品を もう1つ 作るよ。本文は もたないよ。「自分のコピーを作る」の コピーは、動いている あいだだけの 部品で、もとの 部品の 本文で 動くよ。'),
    viewCalls.E('p','','「入力を やめる」「入れるのを やめる」「もって いくのを やめる」は、いま している ことを やめるよ。「もとに もどす」は、もう 決めた ことを 1つ もどすよ。'));
  viewVars.paletteControls.append(viewVars.help);
  viewVars.paletteControls.id = viewVars.viewId + '-palette-tools';
  viewVars.paletteControls.hidden = true;
  viewVars.paletteToggle = viewCalls.button('さがす・作るを ひらく', 'palette-tools-toggle', () => {
    viewVars.paletteControls.hidden = !viewVars.paletteControls.hidden;
    viewVars.paletteToggle.setAttribute('aria-expanded', String(!viewVars.paletteControls.hidden));
    viewVars.paletteToggle.textContent = viewVars.paletteControls.hidden ? 'さがす・作るを ひらく' : 'さがす・作るを たたむ';
  });
  viewVars.paletteToggle.setAttribute('aria-expanded', 'false');
  viewVars.paletteToggle.setAttribute('aria-controls', viewVars.paletteControls.id);
  viewVars.paletteTools = viewCalls.E('div', 'blockui-palette-tools');
  viewVars.paletteTools.append(viewVars.paletteToggle, viewVars.paletteControls);
  viewVars.palette.append(viewVars.paletteTools, viewVars.categorySelect, viewVars.paletteList);
  viewVars.layout.append(viewVars.palette, viewVars.workspaceShell);
  viewVars.root.append(viewVars.layout);
  viewVars.promptArea = viewCalls.E('div', 'blockui-replacement');
  viewVars.root.append(viewVars.promptArea);
  viewCalls.listen(viewVars.workspace, 'scroll', () => {
    const current = viewCalls.session();
    const owner = current?.ownerKey === viewVars.displaySession?.ownerKey ? current : viewVars.displaySession;
    if (owner)
      owner.scrollState = {
        ...owner.scrollState,
        blockTop: viewVars.workspace.scrollTop,
        blockLeft: viewVars.workspace.scrollLeft,
      };
    // (a menu has its items)
    for (const menu of viewVars.workspace.querySelectorAll<HTMLDetailsElement>('.blockui-actions[open]'))
      viewCalls.placeActions(menu, menu.querySelector<HTMLElement>('.blockui-action-items')!);
    viewCalls.placeControls();
    viewCalls.placeNodeToolsSoon();
  });
  // While the workspace scrolls, the selected block's tools are placed at most once a frame, and only while that block
  // is in view (PERF-06): placing them reads the box of every block.
  viewVars.toolsFrame = null;
  viewCalls.listen(viewVars.doc.defaultView, 'resize', () => {
    for (const menu of viewVars.workspace.querySelectorAll<HTMLDetailsElement>('.blockui-actions[open],.blockui-extra[open]')) menu.open = false;
    viewCalls.placeControls();
  });
  // The controls are fixed to the window, so they follow the page and the editor when either scrolls.
  viewCalls.listen(viewVars.doc, 'scroll', (event) => { if (event.target !== viewVars.workspace) viewCalls.placeControls(); }, { capture: true, passive: true });
  viewCalls.listen(viewVars.search, 'input', () => {
    viewVars.searchText = viewVars.search.value;
    viewVars.paletteList.scrollTop = 0;
    viewCalls.renderPalette();
  });
  // Enter puts the first block that can go in the chosen place there and returns to it; ↓ goes to the list (E-16).
  // The Enter that ends a kana-kanji conversion is not this Enter.
  viewCalls.listen(viewVars.search, 'keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    const first = [...viewVars.paletteList.querySelectorAll<HTMLButtonElement>('.blockui-palette-item > button')]
      .find(b => !b.disabled && b.getAttribute('aria-disabled') !== 'true');
    if (event.key === 'Enter' && first) { event.preventDefault(); event.stopPropagation(); first.click(); }
    else if (event.key === 'ArrowDown' && first) { event.preventDefault(); event.stopPropagation(); first.focus(); }
  });
  // ↑ and ↓ move along the list; ↑ on the first block goes back to the search field.
  viewCalls.listen(viewVars.paletteList, 'keydown', (event) => {
    // (a key is pressed on an element)
    if (!['ArrowDown', 'ArrowUp'].includes(event.key) || !(event.target as Element).matches('.blockui-palette-item > button')) return;
    const items = [...viewVars.paletteList.querySelectorAll<HTMLButtonElement>('.blockui-palette-item > button')], at = items.indexOf(event.target);
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'ArrowDown') items[Math.min(items.length - 1, at + 1)]?.focus();
    else if (at <= 0) { if (viewVars.paletteControls.hidden) viewVars.paletteToggle.click(); viewVars.search.focus(); } else items[at - 1].focus();
  });
  viewCalls.listen(viewVars.modeSelect, 'change', () => {
    viewVars.paletteMode = viewVars.modeSelect.value;
    viewVars.category = '';
    viewVars.categoryExplicit = false;
    viewCalls.renderPalette();
  });
  viewCalls.listen(viewVars.outside, 'change', () => {
    viewVars.showOutside = viewVars.outside.checked;
    viewCalls.renderPalette();
  });
  // A number that cannot be read is answered under its field with an example for the unit written after it (F-16).
  viewVars.NUMBER_EXAMPLES = [['秒', '1、0.5'], ['歩', '10、-10'], ['度', '90、45'], ['回', '3、10'], ['％', '100、50'], ['Hz', '440、880'], ['番目', '1、2']];
  viewVars.pressing = false;
  viewCalls.listen(viewVars.root, 'pointerdown', () => { viewVars.pressing = true; }, { capture: true });
  for (const type of ['pointerup', 'pointercancel'] as const) viewCalls.listen(viewVars.doc.defaultView, type, () => { viewVars.pressing = false; }, { capture: true });
  // After an enclosure goes in, its empty count (or other empty value) takes the typing at once with a mouse or the
  // keyboard; after a touch it only lights up, so the screen keyboard does not open by itself (E-03).
  viewVars.attention = null;
  // At はじめて and かんたん, the words of a block face whose kanji are taught after grade 3 carry their reading (F-20).
  // Only the face's own words are read: values, names, fields and the blocks inside keep their text.
  viewVars.FACE_READINGS = [['四捨五入', 'ししゃごにゅう'], ['条件', 'じょうけん'], ['手順', 'てじゅん'], ['順番', 'じゅんばん'],
    ['変数', 'へんすう'], ['結果', 'けっか'], ['最初', 'さいしょ'], ['最後', 'さいご'], ['最小', 'さいしょう'], ['最大', 'さいだい'],
    ['表示', 'ひょうじ'], ['段階', 'だんかい'], ['以上', 'いじょう'], ['以下', 'いか'], ['未満', 'みまん'], ['値', 'あたい'],
    ['成', 'な', 'り'], ['求', 'もと', 'め'], ['増', 'ふ', 'や'], ['減', 'へ', 'ら'], ['残', 'のこ', 'り'], ['呼', 'よ', 'ぶ'], ['捨', 'す', 'て'], ['続', 'つづ', 'け']];
  viewVars.FACE_READING_SOURCE = viewVars.FACE_READINGS.map(([word, , next]) => next ? word + '(?=' + next + ')' : word).join('|'),
    viewVars.FACE_READING_SKIP = '.blockui-node, input, select, textarea, ruby, .blockui-preview-slot, [data-blockui-field], .blockui-subject-text, .blockui-subject-chip';
  // The list is checked at the end of the body the next block goes into, not right after the selected block, so choosing
  // another block of that body asks nothing again (PERF-01). A block whose answer depends on its place is checked there,
  // and pressing a block always checks the place it goes (paletteAdd).
  viewVars.PLACE_DEPENDENT_KINDS = new Set(['WaitBroadcastGroup', 'LocalVariableDeclaration', 'LocalListDeclaration']);
  viewVars.PALETTE_KEYS = '[data-blockui-action="palette-add"],[data-blockui-action="palette-category"]';
  viewVars.fieldMeasureContext = null;
  viewVars.HOLD_MS = 300;
  // Two fingers spread or pinch the workspace around the point between them, from 50% to 200% (E-10). Whatever one
  // finger had started (carrying, moving the workspace) stops.
  viewVars.pinchPointers = new Map<number, ViewPoint>();
  viewVars.pinch = null, viewVars.pendingPan = null;
  // A field, a choice, a 「…」 or a button in a placed block keeps a press for itself (E-09).
  viewVars.CONTROL_IN_BLOCK = 'input,textarea,select,summary,a,button:not([data-blockui-drag])';
  // A number, a word or a choice typed into a block belongs to that block: carried from its field, the block that
  // holds it goes (not the value alone, which no place between sentences could take).
  viewVars.LITERAL_KINDS = new Set(['NumberLiteral', 'StringLiteral', 'BooleanLiteral']);
  viewCalls.listen(viewVars.workspace, 'pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    viewVars.pinchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (viewVars.pinchPointers.size === 2) {
      if (viewVars.drag) viewCalls.cancelDrag();
      viewCalls.endPan();
      viewCalls.dropPendingPan();
      const [a, b] = [...viewVars.pinchPointers.values()];
      viewVars.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: viewVars.zoom };
      for (const id of viewVars.pinchPointers.keys()) try { viewVars.workspace.setPointerCapture(id); } catch (_) {}
      viewVars.suppressClickUntil = Date.now() + 400;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, { capture: true });
  // A finger or a pen that starts on 「＋ ここに入れる」 or a button and goes up or down moves the workspace (E-09). One
  // that starts on a field, a choice, a 「…」 or a button of a placed block also moves the workspace when it goes up or
  // down; going sideways or held still it carries the block, as from the block's words. A press that moves no more
  // than 12 px stays the control's.
  viewCalls.listen(viewVars.workspace, 'pointerdown', (event) => {
    if (!viewCalls.touchLike(event.pointerType)) return;
    if (viewVars.drag || viewVars.pan) return;
    // (a press is on an element)
    const handle = (event.target as Element).closest<BlockElement>('[data-blockui-drag="node"]'), control = (event.target as Element).closest(viewVars.CONTROL_IN_BLOCK);
    // A pen points finely: a field being typed in keeps a pen's press for its caret and its selection, as a mouse's does.
    if (event.pointerType === 'pen' && control && (control === viewVars.doc.activeElement || control.closest('.blockui-editing-field'))) return;
    if (handle && control) {
      if (!viewCalls.pressHandle(event)) return;
      const carrier = viewCalls.carrierOf(handle),
        start: PendingPan = viewVars.pendingPan = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewVars.workspace.scrollLeft, top: viewVars.workspace.scrollTop, handle: carrier };
      start.holdTimer = setTimeout(() => {
        if (viewVars.pendingPan !== start) return;
        viewVars.pendingPan = null;
        viewCalls.pressBlock(carrier, start.id, 'touch', start.x, start.y, { held: true });
      }, viewVars.HOLD_MS);
    } else if ((event.target as Element).closest('.blockui-insertion,button,summary') && !(event.target as Element).closest('[data-blockui-drag]'))
      viewVars.pendingPan = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewVars.workspace.scrollLeft, top: viewVars.workspace.scrollTop };
  }, { capture: true });
  viewCalls.listen(viewVars.workspace, 'pointermove', (event) => {
    if (viewVars.pinch && viewVars.pinchPointers.has(event.pointerId)) {
      viewVars.pinchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (viewVars.pinchPointers.size < 2) return;
      const [a, b] = [...viewVars.pinchPointers.values()], r = viewVars.workspace.getBoundingClientRect();
      viewCalls.setZoom(viewVars.pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / viewVars.pinch.distance, { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top });
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (viewVars.pendingPan?.id === event.pointerId && !viewVars.pan && Math.hypot(event.clientX - viewVars.pendingPan.x, event.clientY - viewVars.pendingPan.y) > viewCalls.slopOf('touch')) {
      const start = viewVars.pendingPan;
      viewCalls.dropPendingPan();
      viewVars.suppressClickUntil = Date.now() + 400;
      // Sideways from a control of a placed block: the block's own handler carries it from where the finger started.
      if (start.handle && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y))
        viewCalls.pressBlock(start.handle, start.id, 'touch', start.x, start.y);
      else viewCalls.startPan(start.id, start.x, start.y, start.left, start.top);
    }
  }, { capture: true });
  // A finger is forgotten wherever it is lifted, also outside the workspace, so the next touch is never taken for a
  // second finger.
  for (const type of ['pointerup', 'pointercancel'] as const)
    viewCalls.listen(viewVars.doc.defaultView, type, (event) => {
      viewVars.pinchPointers.delete(event.pointerId);
      if (viewVars.pinchPointers.size < 2 && viewVars.pinch) { viewVars.pinch = null; viewCalls.rememberViewState(); }
      if (viewVars.pendingPan?.id === event.pointerId) viewCalls.dropPendingPan();
    }, { capture: true });
  // Pressing anywhere that is not a block, a place, a field or a button and moving moves the workspace (E-11),
  // also right of a short block and around the blocks of an enclosure.
  viewCalls.listen(viewVars.workspace, 'pointerdown', (event) => {
    if (
      viewVars.pinch ||
      event.button !== 0 ||
      event.isPrimary === false ||
      viewVars.drag ||
      (event.target as Element).closest('[data-blockui-drag],.blockui-insertion,.blockui-input-slot,.blockui-field,.blockui-node-head,button,input,select,textarea,summary,a,label,details[open]')
    )
      return;
    viewCalls.startPan(event.pointerId, event.clientX, event.clientY);
    // (startPan has just begun the move)
    viewVars.pan!.blank = true;
    event.preventDefault();
  });
  viewCalls.listen(viewVars.workspace, 'pointermove', (event) => {
    if (!viewVars.pan || viewVars.pan.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - viewVars.pan.x, event.clientY - viewVars.pan.y) > viewCalls.slopOf(event.pointerType)) viewVars.pan.moved = true;
    viewVars.workspace.scrollLeft = viewVars.pan.left + viewVars.pan.x - event.clientX;
    viewVars.workspace.scrollTop = viewVars.pan.top + viewVars.pan.y - event.clientY;
    event.preventDefault();
  });
  // A press on the empty workspace that does not move lets go of the selected block, so the next block from the list
  // goes to the end of the body (E-08).
  viewCalls.listen(viewVars.workspace, 'pointerup', (event) => {
    if (viewVars.pan?.id !== event.pointerId) return;
    const press = viewVars.pan.blank && !viewVars.pan.moved;
    viewCalls.endPan();
    if (press) viewCalls.letGoOfSelection();
  });
  viewCalls.listen(viewVars.workspace, 'pointercancel', viewCalls.endPan);
  // A block that hands its finger over to the workspace loses the capture too; only the workspace's own loss ends the move.
  viewCalls.listen(viewVars.workspace, 'lostpointercapture', (event) => {
    if (viewVars.pan && event.target === viewVars.workspace && event.pointerId === viewVars.pan.id) viewCalls.endPan();
  });
  viewCalls.listen(
    viewVars.workspace,
    'wheel',
    (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const r = viewVars.workspace.getBoundingClientRect();
      viewCalls.setZoom(viewVars.zoom * (event.deltaY > 0 ? 0.9 : 1.1), {
        x: event.clientX - r.left,
        y: event.clientY - r.top,
      });
    },
    { passive: false },
  );
  viewCalls.listen(viewVars.workspace, 'keydown', (event) => {
    if (event.target !== viewVars.workspace) return;
    // (another key is not in the table: it reads undefined)
    const offsets: { readonly [key: string]: [number, number] | undefined } = {
      ArrowDown: [0, 60],
      ArrowUp: [0, -60],
      ArrowLeft: [-60, 0],
      ArrowRight: [60, 0],
      PageDown: [0, viewVars.workspace.clientHeight * 0.8],
      PageUp: [0, -viewVars.workspace.clientHeight * 0.8],
    };
    if (offsets[event.key]) {
      event.preventDefault();
      viewVars.workspace.scrollBy(...offsets[event.key]!);
    } else if (event.key === 'Home') {
      event.preventDefault();
      viewVars.workspace.scrollTo({ left: 0, top: 0 });
    }
  });
  viewCalls.listen(viewVars.doc.defaultView, 'blur', () => {
    viewCalls.endPan();
    if (viewVars.drag) viewCalls.cancelDrag();
  });
  viewVars.shapeObserver?.observe(viewVars.world);
  viewVars.shapeObserver?.observe(viewVars.workspace);
  viewVars.shapeObserver?.observe(viewVars.palette);
  viewVars.dragReason = null, viewVars.dropNote = null, viewVars.dropNoteTimer = null;
  viewCalls.listen(
    viewVars.root,
    'click',
    (event) => {
      if (viewVars.pointerFocusTarget) {
        viewVars.pointerFocusTarget = null;
        // (an element of the view that has the focus is an element of the page; a text field matched can be selected)
        if (viewVars.root.contains(viewVars.doc.activeElement)) viewCalls.focusBlockField(viewVars.doc.activeElement as HTMLElement);
        // A number or text field entered with a press holds its whole value selected, so typing replaces it; a second
        // press in the field puts the caret there (E-01). The full-text dialog and the code view keep their caret.
        const active = viewVars.doc.activeElement;
        if (active !== viewVars.pointerFocusPrevious && active?.matches?.('.blockui-world .blockui-field input[type="text"]') && !active.closest('dialog'))
          (active as HTMLInputElement).select();
      }
      if (viewVars.deferredFocus) {
        viewVars.deferredFocus = null;
        if (viewVars.deferredRender) viewVars.doc.defaultView.requestAnimationFrame(() => viewCalls.render({ force: true }));
      }
      if (Date.now() < viewVars.suppressClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true },
  );
  // A long press on a block gives no menu of the browser (it lifts the block instead).
  viewCalls.listen(viewVars.root, 'contextmenu', (event) => {
    if (viewCalls.touchLike(viewVars.lastPointerType) && (event.target as Element).closest('[data-blockui-drag]')) event.preventDefault();
  });
  // A finger held on a block in the list moves the block, not the list.
  viewCalls.listen(viewVars.palette, 'touchmove', (event) => {
    if ((viewVars.drag?.held || viewVars.drag?.started) && event.cancelable) event.preventDefault();
  }, { passive: false });
  // A mouse pressed on a field, a choice, a 「…」 or a button of a placed block carries the block once it moves past the
  // slop, as from the block's words (E-09); a press that does not move keeps the control's own click, and a field
  // being typed in keeps the press for its caret and its selection.
  viewVars.controlPress = null;
  viewCalls.listen(viewVars.root, 'pointerdown', (event) => {
    // (a press is on an element)
    viewCalls.closeBlockPopovers(event.target as Node | null);
    viewVars.pointerFocusTarget = event.target;
    viewVars.pointerFocusPrevious = viewVars.doc.activeElement;
    viewVars.lastPointerType = event.pointerType || 'mouse';
    viewVars.controlPress = null;
    const handle = viewCalls.pressHandle(event), control = (event.target as Element).closest<PressedControl>(viewVars.CONTROL_IN_BLOCK);
    if (!handle) return;
    if (handle.dataset.blockuiDrag === 'node' && control) {
      if (!viewCalls.touchLike(event.pointerType) && control !== viewVars.doc.activeElement && !control.closest('.blockui-editing-field'))
        viewVars.controlPress = { id: event.pointerId, x: event.clientX, y: event.clientY, handle: viewCalls.carrierOf(handle), control };
      return;
    }
    viewCalls.pressBlock(handle, event.pointerId, event.pointerType, event.clientX, event.clientY);
  });
  // A choice opens its list when the press ends without moving, so the press can carry the block first.
  viewCalls.listen(viewVars.root, 'mousedown', (event) => {
    if (viewVars.controlPress?.control.tagName === 'SELECT' && (event.target as Element).closest('select') === viewVars.controlPress.control &&
        typeof viewVars.controlPress.control.showPicker === 'function') { event.preventDefault(); viewVars.controlPress.picker = true; }
  });
  viewCalls.listen(viewVars.root, 'pointerup', (event) => {
    const press = viewVars.controlPress;
    if (press?.id !== event.pointerId) return;
    viewVars.controlPress = null;
    if (!press.picker || !press.control.isConnected || press.control.disabled) return;
    press.control.focus({ preventScroll: true });
    // (a press marked to open a list is on a choice that has one)
    try { press.control.showPicker!(); } catch (_) {}
  });
  viewCalls.listen(viewVars.root, 'pointermove', (event) => {
    if (viewVars.controlPress?.id === event.pointerId && !viewVars.drag) {
      const press = viewVars.controlPress;
      if (!(event.buttons & 1)) viewVars.controlPress = null;
      else if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= viewCalls.slopOf('mouse')) {
        viewVars.controlPress = null;
        // The control gives the press up to the block: no text stays selected in it.
        if (viewVars.doc.activeElement === press.control && press.control.matches('input,textarea')) press.control.blur();
        viewVars.doc.getSelection?.()?.removeAllRanges();
        viewCalls.pressBlock(press.handle, press.id, 'mouse', press.x, press.y);
      }
    }
    if (!viewVars.drag || viewVars.drag.pointerId !== event.pointerId) return;
    if (
      viewVars.isLocked() ||
      viewCalls.session()?.ownerKey !== viewVars.drag.owner ||
      viewCalls.session()?.sourceRevision !== viewVars.drag.revision ||
      viewCalls.session()?.contextRevision !== viewVars.drag.contextRevision
    ) {
      viewCalls.cancelDrag();
      return;
    }
    const dx = event.clientX - viewVars.drag.startX, dy = event.clientY - viewVars.drag.startY;
    // A finger that moved no more than 12 px is still a press; a mouse starts carrying after 5 px.
    if (!viewVars.drag.started && (viewCalls.touchLike(viewVars.drag.pointerType) ? Math.hypot(dx, dy) <= viewCalls.slopOf(viewVars.drag.pointerType) : Math.hypot(dx, dy) < viewCalls.slopOf(viewVars.drag.pointerType)))
      return;
    // A finger that goes up or down without holding first moves the list or the workspace, not the block (E-09).
    if (!viewVars.drag.started && viewCalls.touchLike(viewVars.drag.pointerType) && !viewVars.drag.held && Math.abs(dy) > Math.abs(dx)) {
      const state = viewVars.drag;
      viewCalls.cancelDrag();
      if (state.id) {
        // (startPan has just begun the move)
        viewCalls.startPan(state.pointerId, state.startX, state.startY);
        viewVars.workspace.scrollLeft = viewVars.pan!.left + viewVars.pan!.x - event.clientX;
        viewVars.workspace.scrollTop = viewVars.pan!.top + viewVars.pan!.y - event.clientY;
        viewVars.suppressClickUntil = Date.now() + 400;
      }
      event.preventDefault();
      return;
    }
    if (!viewVars.drag.started) {
      viewVars.drag.started = true;
      clearTimeout(viewVars.drag.holdTimer);
      viewCalls.beginGhost(viewVars.drag);
      if (BLOCK_SCHEMA_BY_ID.get(viewVars.drag.schemaId)?.category === 'statement' || viewCalls.schemaOf(viewVars.index.get(viewVars.drag.id)?.node)?.category === 'statement')
        viewCalls.keepInView(viewVars.drag.id ? viewVars.drag.parts?.[0] : null, () => viewVars.root.classList.add('blockui-drag-statement'));
    }
    viewVars.drag.clientX = event.clientX;
    viewVars.drag.clientY = event.clientY;
    event.preventDefault();
    viewVars.root.classList.add('blockui-drag-active');
    viewCalls.moveGhost(event);
    viewCalls.notifyPending();
    viewCalls.previewDrag(event);
    if (viewVars.dragFrame === null) viewVars.dragFrame = viewVars.doc.defaultView.requestAnimationFrame(viewCalls.scrollDrag);
  });
  viewCalls.listen(viewVars.root, 'pointerup', (event) => {
    if (!viewVars.drag || viewVars.drag.pointerId !== event.pointerId) return;
    if (
      viewVars.isLocked() ||
      viewCalls.session()?.ownerKey !== viewVars.drag.owner ||
      viewCalls.session()?.sourceRevision !== viewVars.drag.revision ||
      viewCalls.session()?.contextRevision !== viewVars.drag.contextRevision
    ) {
      viewCalls.cancelDrag();
      return;
    }
    if (viewVars.drag.started) viewCalls.previewDrag(event);
    const state = viewVars.drag,
      started = state.started;
    if (!started) {
      viewCalls.cancelDrag();
      // A long press let go without moving selects the block and shows its tools (E-09).
      if (state.held && state.id) { viewCalls.selection(state.id); viewCalls.locationElement({ id: state.id })?.focus({ preventScroll: true }); }
      return;
    }
    const wb = viewVars.workspace.getBoundingClientRect(), pb = viewVars.palette.getBoundingClientRect(),
      inside: (r: DOMRect) => boolean = (r) => !!r.width && event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom,
      outside = !inside(wb) && !inside(pb);
    viewCalls.cancelDrag({ animate: !state.deleteZone && (!state.valid || !state.location) });
    event.preventDefault();
    viewVars.suppressClickUntil = Date.now() + 350;
    if (state.deleteZone) {
      const ids = viewCalls.carriedIds(state);
      const result = ids.length > 1 ? viewCalls.operate({ type: 'batch', operations: ids.map(id => ({ type: 'remove', id })) })
        // (a block carried from the workspace has its id)
        : viewCalls.removeBlock(viewVars.index.get(state.id)?.node || { id: state.id! });
      if (result.ok) { viewCalls.keepKeys(); viewCalls.showDropNote('けしたよ。「もとに もどす」で もどせるよ', event.clientX, event.clientY); }
      return;
    }
    if (!state.valid || !state.location) {
      // はじめて asks for a 「＋」 place, at the pointer and in the row above the workspace (F-12).
      viewCalls.showDropNote(outside ? '入れるのを やめたよ' : document.body.dataset.uiLevel === 'entry' ? '＋の ところで はなしてね'
        : !state.location ? '入れるのを やめたよ' : state.reason || 'ここには おけないよ', event.clientX, event.clientY);
      return;
    }
    if (state.schemaId) {
      viewVars.destination = state.location;
      // (a block carried from the list has its schema; one from the workspace its id)
      viewCalls.paletteAdd(state.candidate || BLOCK_SCHEMA_BY_ID.get(state.schemaId)!);
    } else viewCalls.completeMove(state.location, { id: state.id!, type: state.run ? 'run' : 'move' });
  });
  viewCalls.listen(viewVars.root, 'pointercancel', () => {
    viewVars.pointerFocusTarget = null;
    const started = viewVars.drag?.started;
    viewCalls.cancelDrag({ animate: started });
    if (started) viewCalls.announce('入れるのを やめたよ');
  });
  // Only the carried block's own loss of the finger ends carrying: a control that a touch started on loses it to the
  // block when the touch goes on to carry the block (E-09).
  viewCalls.listen(viewVars.root, 'lostpointercapture', (event) => {
    if (viewVars.drag && event.target === viewVars.drag.element && event.pointerId === viewVars.drag.pointerId) viewCalls.cancelDrag();
  });
  viewCalls.listen(viewVars.root, 'focusout', (event) => {
    if (viewVars.deferredFocus !== event.target) return;
    // (the focus goes to an element or nowhere)
    viewVars.deferredFocus = event.relatedTarget && viewVars.root.contains(event.relatedTarget as Node) ? event.relatedTarget as Element : null;
    if (!viewVars.deferredFocus && viewVars.deferredRender) viewCalls.render({ force: true });
  }, { capture: true });
  // A text field's editing surface closes when the focus leaves the field, its value and the value's tools, and nothing
  // is left to decide in it (E-12).
  viewCalls.listen(viewVars.root, 'focusout', (event) => {
    // (the focus leaves an element for an element or nowhere)
    const field = (event.target as Element).closest?.('.blockui-editing-field'), to = event.relatedTarget as Node | null;
    if (!field || [field, field.closest('.blockui-node'), field.closest('.blockui-input-slot')].some(n => n?.contains(to)) ||
        (viewVars.pending?.input && field.contains(viewVars.pending.input))) return;
    field.classList.remove('blockui-editing-field');
    viewCalls.placeNodeTools();
  });
  viewCalls.listen(viewVars.root, 'focusin', (event) => {
    // (the focus comes to an element of the page; the press was on a node)
    viewCalls.closeBlockPopovers(event.target as Node, true);
    if (viewVars.pointerFocusTarget && (event.target as Node).contains(viewVars.pointerFocusTarget as Node)) return;
    viewCalls.focusBlockField(event.target as HTMLElement);
  });
  viewCalls.listen(viewVars.root, 'keydown', (event) => {
    viewVars.pointerFocusTarget = null;
    // A block put in with the keyboard gives its empty value the typing, as with a mouse (E-03).
    viewVars.lastPointerType = 'keyboard';
    if (event.isComposing) return;
    if (event.key === 'Tab') {
      if (viewVars.deferredFocus === event.target) {
        viewVars.deferredFocus = null;
        if (viewVars.deferredRender) viewCalls.render({ force: true });
      }
      // A number that cannot be read is left to the blur: another field given up for, else its mistake shown.
      if (viewVars.pending?.input === event.target && viewCalls.readable(viewVars.pending)) viewCalls.flush({ focus:false });
      for (const field of viewVars.root.querySelectorAll('.blockui-editing-field'))
        field.classList.remove('blockui-editing-field');
    }
    // A value alone is not deleted (FCB-20): Delete says what to do instead of doing nothing.
    // (a key is pressed on an element; a block's element has its id)
    if (['Delete', 'Backspace'].includes(event.key) && (event.target as Element).matches?.('.blockui-world .blockui-node.blockui-expression') &&
        !viewVars.options.readOnly && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      viewCalls.announce('この ブロックは けせないよ。ほかの ブロックと 入れかえてね', true);
      return;
    }
    // Space on a focused block selects it, as a press does, and does not scroll the workspace away from it (AX-10).
    if (event.key === ' ' && (event.target as Element).matches?.('.blockui-world .blockui-node') && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      viewCalls.selection((event.target as HTMLElement).dataset.blockId!);
      return;
    }
    // Delete or Backspace on a selected sentence deletes it (E-05); in a field they delete characters.
    if (['Delete', 'Backspace'].includes(event.key) && (event.target as Element).matches?.('.blockui-world .blockui-node.blockui-statement') &&
        !viewVars.options.readOnly && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      const node = viewVars.index.get((event.target as HTMLElement).dataset.blockId)?.node;
      if (!node || viewCalls.schemaOf(node)?.draftOnly || viewVars.isLocked()) return;
      if (viewCalls.removeBlock(node).ok) viewCalls.focus({ id: viewCalls.session()?.blockSelection });
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      const notice = viewVars.workspace.querySelector('.blockui-node-notices.blockui-open');
      if (notice) {
        notice.classList.remove('blockui-open');
        const mark = notice.closest('.blockui-node')?.querySelector<HTMLElement>('[data-blockui-action="notices"]');
        mark?.setAttribute('aria-expanded', 'false'); mark?.focus({ preventScroll: true });
        return;
      }
      const menu = (event.target as Element).closest<HTMLDetailsElement>('.blockui-extra[open],.blockui-who[open],.blockui-actions[open],.blockui-local-help[open]') || viewVars.root.querySelector<HTMLDetailsElement>('.blockui-extra[open],.blockui-local-help[open],.blockui-actions[open],.blockui-who[open]');
      if (menu) {
        menu.open = false;
        viewVars.openEditors.delete(menu.dataset.blockuiDisclosure);
        menu.querySelector('summary')?.focus();
        return;
      }
      if (viewVars.pending) viewCalls.cancelField();
      else if (!viewVars.destination && !viewVars.replacement && !viewVars.moving && !viewVars.drag && !viewCalls.session()?.blockDraft && viewCalls.letGoOfSelection())
        viewCalls.announce('えらぶのを やめたよ。つぎに 入れる ブロックは、本文の さいごに 入るよ');
      else {
        viewVars.destination = null; viewVars.replacement = null; viewVars.moving = null; viewCalls.cancelDrag();
        viewCalls.notifyPending(); viewCalls.renderReplacement(); viewCalls.renderPalette(); viewCalls.updateControls(); viewCalls.showImpliedDestination();
        for (const selected of viewVars.workspace.querySelectorAll('.blockui-chosen-destination')) selected.classList.remove('blockui-chosen-destination');
        for (const slot of viewVars.workspace.querySelectorAll('.blockui-slot-active')) slot.classList.remove('blockui-slot-active');
        viewCalls.announce('えらぶのを やめたよ。' + (viewCalls.session()?.blockDraft ? '入れかけの ブロックは「入れるのを やめる」で やめられるよ。' : '') + '決めた ことは「もとに もどす」で もどせるよ');
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
      if (!viewCalls.flush().ok) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    // Keep the design canvas Delete and execution shortcuts out of nested inputs.
    if (viewVars.root.contains(event.target as Node | null) && event.key !== 'Tab') event.stopPropagation();
  });
  viewCalls.listen(viewVars.doc.defaultView, 'resize', () => { viewCalls.updateFieldWidths(); viewCalls.scheduleGeometry(); });
  viewVars.fontStyleObserver = viewVars.doc.head && typeof viewVars.doc.defaultView.MutationObserver === 'function'
    ? new viewVars.doc.defaultView.MutationObserver(() => { viewCalls.updateFieldWidths(); viewCalls.scheduleGeometry(); }) : null;
  viewVars.fontStyleObserver?.observe(viewVars.doc.head, {childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['media','disabled','href','rel']});
  if (viewVars.doc.fonts) viewCalls.listen(viewVars.doc.fonts, 'loadingdone', viewCalls.scheduleGeometry);
  viewCalls.render({ force: true });
  return { render: viewCalls.render, flush: viewCalls.flush, cancel: viewCalls.cancel, destroy: viewCalls.destroy, highlight: viewCalls.highlight, focus: viewCalls.focus, restorePending: viewCalls.restorePending, releaseInteraction: viewCalls.releaseInteraction,
    interactionActive: () => !!(viewVars.moving || viewVars.replacement || viewVars.drag) && !viewVars.destroyed && viewVars.root.isConnected && viewVars.root.getClientRects().length > 0 };
}
createBlockEditorView.sequence = 0;


// Design-only geometry; image costumes use the existing independent w/h fields.
// Handle directions are on the screen ([-1, -1] is the top-left handle). Places are in the child frame:
// the part's centre from the bottom-left (y up), turned counterclockwise by its direction.
export const DESIGN_RESIZE_DIRECTIONS = Object.freeze({
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
});
export function designResizeMode(c: Component | null | undefined) {
  if (!c || !['label', 'button', 'input', 'box', 'sprite'].includes(c.type)) return null;
  return c.type === 'sprite' && c.costumes?.find((co) => co.id === c.costumeId)?.kind !== 'image'
    ? 'scale'
    : 'box';
}
// The handle's place in the child frame (the screen's downward hy is the frame's −y).
export function designResizePoint(c: Pick<Component, 'x' | 'y' | 'w' | 'h' | 'scalePercent' | 'direction'>, direction: keyof typeof DESIGN_RESIZE_DIRECTIONS = 'se') {
  const [hx, hy] = DESIGN_RESIZE_DIRECTIONS[direction],
    s = c.scalePercent / 100,
    rad = ((c.direction % 360) * Math.PI) / 180,
    cs = Math.cos(rad),
    sn = Math.sin(rad),
    vx = (hx * c.w * s) / 2,
    vy = (hy * c.h * s) / 2;
  return { x: c.x + vx * cs + vy * sn, y: c.y + vx * sn - vy * cs };
}
export function designResizeGeometry(c: Component, direction: string, dx: number, dy: number, keepRatio = false) {
  const result = { x: c.x, y: c.y, w: c.w, h: c.h, scalePercent: c.scalePercent };
  // (a direction not in the table has no handle: undefined)
  if (
    !(DESIGN_RESIZE_DIRECTIONS[direction as keyof typeof DESIGN_RESIZE_DIRECTIONS] as readonly number[] | undefined) ||
    !designResizeMode(c) ||
    !Number.isFinite(dx) ||
    !Number.isFinite(dy) ||
    (!dx && !dy)
  )
    return result;
  const [hx, hy] = DESIGN_RESIZE_DIRECTIONS[direction as keyof typeof DESIGN_RESIZE_DIRECTIONS],
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
export const COLOR_PRESETS = Object.freeze(
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
    // (each of the twelve names a colour)
  ].map((name) => Object.freeze({ name, label: COLOR_LABELS[name] || name, value: COLOR_NAMES[name] as string })),
);
export function pickerHex(value: unknown) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}
export function pickerRgb(h: number, s: number, v: number) {
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
export function pickerHsvToHex(h: number, s: number, v: number) {
  return (
    '#' +
    pickerRgb(h, s, v)
      .map((a) => a.toString(16).padStart(2, '0'))
      .join('')
  );
}
export function pickerHexToHsv(value: unknown) {
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
export function pickerWheelHS(x: number, y: number, previousHue = 0) {
  if (![x, y, previousHue].every(Number.isFinite))
    throw new TypeError('Wheel coordinates must be finite');
  const radius = Math.hypot(x, y);
  return {
    h: radius < 1e-9 ? previousHue : ((Math.atan2(-y, x) * 180) / Math.PI + 360) % 360,
    s: Math.min(1, radius),
  };
}

