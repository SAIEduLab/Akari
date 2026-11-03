  // ────────────────────────────────────────────────────────────────────────
  // 10 — Block view base: making elements, reading the session and the project, wording, phrases and faces, places and
  // the selection, placing the controls and the block tools, the highlight, and measuring shapes.
  // ────────────────────────────────────────────────────────────────────────
  // The parts of the block view come in this order in src/akari.html: a part uses only the parts before it and asks
  // the parts after it only to draw the view again (AUDIT.md「ソースの境界」). Called at the start of every
  // createBlockEditorView: viewVars is the state of that one view, viewCalls the functions it offers the parts after it
  // and those it calls from the parts before it, and viewRedraw the redraw request it calls (a later part fills it).
  function createViewBase(viewVars, viewCalls, viewRedraw) {
    const E = (tag, className = '', text = null, attrs = {}) => {
      const n = viewVars.doc.createElement(tag);
      if (className) n.className = className;
      if (text !== null) n.textContent = text;
      for (const [k, v] of Object.entries(attrs))
        if (v !== null && v !== undefined) n.setAttribute(k, String(v));
      return n;
    };
    const listen = (n, event, fn, opts = {}) => n.addEventListener(event, fn, { ...opts, signal: viewVars.signal });
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
    const schemaOf = (n) => BLOCK_SCHEMA_BY_ID.get(n?.schemaId);
    const session = () => viewVars.getSession?.() || null;
    const project = () => viewVars.getProject?.() || session()?.project;
    const context = () => ({ ...session()?.context, ...viewVars.getContext() });
    const subjectName = node => {
      const lineage = [node, ...(viewVars.index.get(node.id)?.ancestors || []).slice().reverse().map(id => viewVars.index.get(id)?.node)];
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
    const errorText = (e) => e?.message || e?.reason || String(e || 'うまく できなかったよ。もう一度 やって みてね');
    const copy = (v) =>
      typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
    const announce = (message, error = false) => {
      viewVars.messageBox.textContent = message || '';
      viewVars.messageBox.classList.toggle('blockui-error', error);
      viewVars.messageBox.setAttribute('role', error ? 'alert' : 'status');
      // The mistake of the field being edited is read here and seen under the field.
      viewVars.messageBox.classList.toggle('blockui-message-near-field', !!message && !!viewVars.pending && message === viewVars.pending.error);
    };
    const notifyPending = () =>
      viewVars.onPending(
        viewVars.pending
          ? {
              ownerKey: viewVars.pending.ownerKey,
              sourceRevision: viewVars.pending.sourceRevision,
              contextRevision: viewVars.pending.contextRevision,
              id: viewVars.pending.id,
              nodePath: viewVars.index.get(viewVars.pending.id)?.path || [],
              field: viewVars.pending.key,
              value: viewVars.pending.input?.value ?? '',
              composing: !!viewVars.pending.composing,
              invalid: !!viewVars.pending.invalid,
              reason: viewVars.pending.error || '入れたら「決める」を おしてね',
            }
          : viewVars.replacement
            ? { ownerKey: session()?.ownerKey, reason: 'もとの ばしょに 入れる ブロックを えらんでね' }
            : viewVars.drag?.started
              ? { ownerKey: session()?.ownerKey, reason: 'ブロックを 運んで いる とちゅうだよ' }
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
    function syncLibraryToggle() {
      const entry = document.body.dataset.uiLevel === 'entry';
      if (entry) viewVars.root.classList.remove('blockui-library-hidden');
      const shown = !viewVars.root.classList.contains('blockui-library-hidden');
      viewVars.libraryToggle.hidden = entry;
      viewVars.libraryToggle.textContent = shown ? 'ブロックを しまう' : 'ブロックを 出す';
      viewVars.libraryToggle.setAttribute('aria-expanded', String(shown));
    }
    function rememberViewState(owner = viewVars.displaySession) {
      if (owner)
        owner.scrollState = {
          ...owner.scrollState,
          blockTop: viewVars.workspace.scrollTop,
          blockLeft: viewVars.workspace.scrollLeft,
          blockZoom: viewVars.zoom,
          blockBodyPages: [...viewVars.bodyPages],
          blockExtraPages: [...viewVars.bodyExtraPages].map(([key, pages]) => [key, [...pages]]),
          blockInputPages: [...viewVars.inputPages],
          blockCollapsed: [...viewVars.collapsed],
          blockOpenAnnotations: [...viewVars.openAnnotations],
        };
    }
    function normalizedResult(result) {
      if (result === false) return { ok: false, error: 'うまく できなかったよ。もう一度 やって みてね' };
      return result && typeof result === 'object'
        ? result
        : { ok: true, changed: result !== false };
    }
    // A touch test names the stage edge as 端 and its sides as 端:上 …. The block shows and accepts the words the code
    // writes (画面のはし, 画面の下のはし …); other text slots keep what is written.
    function edgeSlot(node, field) {
      if (node?.schemaId !== 'StringLiteral' || field?.key !== 'value') return false;
      return viewVars.index.get(viewVars.index.get(node.id)?.parentId)?.node?.schemaId === 'SensorRead:TOUCHING';
    }
    // A key (「スペース」キーがおされている, おされたキーが「エンター」) is shown by its keyboard name, as the code writes it
    // (F-34), and what is typed is read as the code reads it: スペース is the key 空白, Ａ is a.
    function keySlot(node, field) {
      return field?.key === 'value' && !!node && keyLiteralAt(viewVars.index, node.id);
    }
    function edgeShown(node, field, value) {
      return edgeSlot(node, field) && isEdgeTarget(value) ? EDGE_TARGETS[value] : keySlot(node, field) ? keySurface(value) : value;
    }
    function edgeStored(node, field, value) {
      if (keySlot(node, field) && typeof value === 'string') return keyName(value);
      const written = String(value).trim().replace(/端$/, 'はし'), edge = edgeSlot(node, field) && Object.keys(EDGE_TARGETS).find(key => EDGE_TARGETS[key] === written);
      return edge || value;
    }
    function numberExample(input) {
      const after = input.closest('.blockui-input-slot')?.nextElementSibling,
        unit = after?.classList.contains('blockui-unit-text') ? after.dataset.unit ?? '' : '';
      return viewVars.NUMBER_EXAMPLES.find(([u]) => unit.startsWith(u))?.[1] || '10、0.5';
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
    function syncDeferredTree() {
      const latest = getTree(session());
      if (latest === viewVars.tree) return;
      viewVars.tree = latest;
      viewVars.index = viewVars.tree ? buildBlockIndex(viewVars.tree) : new Map();
      viewVars.availabilityCache.clear();
    }
    function readable(p) {
      try { p.read(); return true; } catch (_) { return false; }
    }
    // One やめる per state, named by what it stops (F-23): a block put in that still has holes, the input being typed, a
    // block being moved, or the place chosen for the next block.
    function cancelLabel() {
      return session()?.blockDraft ? '入れるのを やめる' : viewVars.pending ? '入力を やめる' : viewVars.replacement || viewVars.moving ? 'もって いくのを やめる' : '入れるのを やめる';
    }
    function destinationDescription() {
      const parent = viewVars.index.get(viewVars.destination?.parentId)?.node, schema = schemaOf(parent);
      if (viewVars.destination?.input) {
        const input = schema?.inputs.find(s => s.key === viewVars.destination.input);
        return (input?.label || 'あいている ところ') + 'に 入れる ブロックを えらんで いるよ。つなぐブロックを ふやす ときは「＋ ここに入れる」を おしてね';
      }
      if (viewVars.destination?.body) {
        const body = schema?.bodies.find(s => s.key === viewVars.destination.body);
        const place = parent?.schemaId === 'Script' ? '本文' : (schema?.label || 'まとまり') + 'の「' + (body?.label || '中') + '」';
        return place + 'の' + (viewVars.destination.index + 1) + '番目に ブロックを 入れるよ';
      }
      return '入れる ばしょを えらんでね';
    }
    // The floating controls never take a row of their own, so nothing moves (E-12). They go right under the field being
    // edited (above it when the window ends below), unless they would cover something to press there and another place
    // near the field is free (until a mistake is shown). While a place is chosen, a block is moved or an enclosure waits for
    // what goes in it, they go in the free middle of the row above the workspace (viewVars.options.controlsSpace), else in a
    // corner of the workspace where they cover no block, else over its top left.
    function placeControls() {
      if (viewVars.controls.hidden || !viewVars.root.getBoundingClientRect().width) return;
      // While a press is held they stay where they are, so a press that ends a field's input never lands on them.
      if (viewVars.pressing && viewVars.controls.style.getPropertyValue('--blockui-controls-top')) return;
      const view = viewVars.doc.documentElement, room = viewVars.workspace.getBoundingClientRect(),
        w = viewVars.controls.offsetWidth || 300, h = viewVars.controls.offsetHeight || 40,
        field = viewVars.pending?.input?.isConnected && !viewVars.pending.input.closest('dialog') ? viewVars.pending.input.getBoundingClientRect() : null;
      // Lying over the blocks under a field, only 決める and やめる take a press: a press on the words (a mistake shown)
      // reaches the field under them, so another field starts its input and the old number goes back (LANGUAGE.md 242).
      viewVars.controls.style.pointerEvents = field?.width ? 'none' : '';
      let spot;
      if (field?.width) {
        const under = field.bottom + 4 + h <= view.clientHeight - 4 ? field.bottom + 4 : Math.max(4, field.top - h - 4);
        spot = { x: field.left, y: under };
        // Before a mistake is shown they may go where they cover nothing to press (a 「＋ ここに入れる」, a field, a choice
        // or a button of the blocks; the thin lines between blocks may be covered): right above the field, or at the
        // right end of the workspace under or above it. A mistake is always shown right under the field.
        if (!(viewVars.pending.shown && viewVars.pending.error)) {
          const own = viewVars.pending.input.closest('.blockui-field') || viewVars.pending.input,
            // On a touch screen the place after the selected block can be pressed over 40 px (16 above its line, 24 below:
            // editor.css), so they keep off all of it (AX-03).
            coarse = viewVars.doc.defaultView.matchMedia?.('(pointer: coarse)').matches,
            marks = [...viewVars.world.querySelectorAll('.blockui-insertion, input, select, textarea, summary, button')]
              .filter(n => !own.contains(n) && n.checkVisibility?.({ visibilityProperty: true }) !== false)
              .map(n => { const r = n.getBoundingClientRect();
                return coarse && n.classList.contains('blockui-implied-destination') ? { left: r.left, right: r.right, top: r.top - 16, bottom: r.top + 24, width: r.width, height: 40 } : r; })
              .filter(b => b.width && b.height >= 12),
            at = (x) => Math.max(4, Math.min(x, view.clientWidth - w - 4)),
            free = ([x, y]) => y >= Math.max(4, room.top) && y + h <= Math.min(room.bottom, view.clientHeight - 4) &&
              !marks.some(b => b.right > x && b.left < x + w && b.bottom > y && b.top < y + h),
            far = room.left + viewVars.workspace.clientWidth - 8 - w, above = field.top - h - 4,
            best = [[at(field.left), under], [at(field.left), above], [at(far), under], [at(far), above]].find(free);
          if (best) spot = { x: best[0], y: best[1] };
        }
      } else {
        const free = viewVars.options.controlsSpace?.();
        spot = free && free.right - free.left >= w
          ? { x: free.left, y: free.top + Math.max(0, (free.bottom - free.top - h) / 2) }
          : freeCorner(room, w, h) || { x: room.left + 8, y: room.top + 6 };
      }
      // The controls are fixed to the window: they may lie over the row above the workspace, outside the editor's box.
      const x = Math.round(Math.max(4, Math.min(spot.x, view.clientWidth - w - 4))), y = Math.round(spot.y);
      viewVars.controls.style.setProperty('--blockui-controls-left', x + 'px');
      viewVars.controls.style.setProperty('--blockui-controls-top', y + 'px');
      // A transformed ancestor (a dialog) moves what is fixed: correct by what is measured.
      const r = viewVars.controls.getBoundingClientRect();
      if (Math.abs(r.left - x) > 0.5 || Math.abs(r.top - y) > 0.5) {
        viewVars.controls.style.setProperty('--blockui-controls-left', Math.round(2 * x - r.left) + 'px');
        viewVars.controls.style.setProperty('--blockui-controls-top', Math.round(2 * y - r.top) + 'px');
      }
      clearOfControls();
    }
    // The selected field's tools never lie under 決める and やめる: they go down below them.
    function clearOfControls() {
      if (viewVars.controls.hidden) return;
      const c = viewVars.controls.getBoundingClientRect();
      for (const head of viewVars.workspace.querySelectorAll('.blockui-input-slot.blockui-slot-active > .blockui-slot-head')) {
        const r = head.getBoundingClientRect();
        if (!r.width || r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom) continue;
        head.style.top = (parseFloat(viewVars.doc.defaultView.getComputedStyle(head).top) || 0) + (c.bottom + 4 - r.top) / viewVars.zoom + 'px';
      }
    }
    // A corner of the workspace (top right, bottom right, bottom left) where a w × h box covers no block, no hole and no
    // 「＋ ここに入れる」 at the end of a body.
    function freeCorner(room, w, h) {
      const blockers = [...viewVars.world.querySelectorAll('.blockui-statement, .blockui-event-hat, .blockui-insertion-end, .blockui-hole-target, .blockui-chosen-destination')]
        .map(n => n.getBoundingClientRect()).filter(b => b.width && b.bottom > room.top && b.top < room.bottom);
      const right = room.left + viewVars.workspace.clientWidth - 8 - w, bottom = room.top + viewVars.workspace.clientHeight - 6 - h;
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
      viewVars.selected = id;
      if (session()) {
        session().blockSelection = id;
        session().blockSelectionLocation = location
          ? { id, key: session().ownerKey, ...location }
          : null;
      }
      for (const n of viewVars.workspace.querySelectorAll('.blockui-node'))
        n.classList.toggle('blockui-selected', n.dataset.blockId === id);
      showImpliedDestination();
      placeNodeTools();
      if (!id) for (const n of viewVars.workspace.querySelectorAll('.blockui-focused')) n.classList.remove('blockui-focused');
      for (const menu of viewVars.workspace.querySelectorAll('.blockui-actions[open],.blockui-extra[open]'))
        if (menu.closest('.blockui-node')?.dataset.blockId !== id) { menu.open = false; viewVars.openEditors.delete(menu.dataset.blockuiDisclosure); }
      for(const slot of viewVars.workspace.querySelectorAll('.blockui-slot-active'))slot.classList.remove('blockui-slot-active');
      // A number that is its own field in the sentence (1 秒, E-02) has its tools on its own place: the field being
      // edited keeps them while its sentence is the selected block.
      const selectedNode=[...viewVars.workspace.querySelectorAll('.blockui-node')].find(n=>n.dataset.blockId===id),active=viewVars.doc.activeElement,
        flat=selectedNode&&active?.matches?.('input,textarea')&&selectedNode.contains(active)?active.closest('.blockui-flat-value'):null,
        slot=selectedNode?.parentElement.closest('.blockui-input-slot')||(flat?.closest('.blockui-node')===selectedNode?flat:null);
      if(slot){slot.classList.add('blockui-slot-active');viewVars.doc.defaultView.requestAnimationFrame(()=>placeSlotHead(slot));}
    }
    // With nothing selected the next block from the list goes to the end of the body (E-08); the focus goes to the
    // workspace, so Delete has no block to take.
    function letGoOfSelection() {
      if (!viewVars.selected) return false;
      selection('');
      if (viewVars.doc.activeElement?.closest?.('.blockui-world')) viewVars.workspace.focus({ preventScroll: true });
      return true;
    }
    // The floating tools (E-12) go beside the sentence they belong to, right of its whole block (an enclosure with what
    // is in it), where they cover no other block: first the selected block's tools, under them the selected field's
    // tools, under those the tools of a selected value. With no room on the right a block's tools go right above it.
    // A text field's editing surface lies over the blocks: its field's tools go on its line when they fit there. Else a
    // field's tools go beside the sentence, under the field, under the whole sentence or right above the field, where
    // they cover no value of this sentence or of another block (else where they cover the fewest).
    function placeNodeTools() {
      const room = viewVars.workspace.getBoundingClientRect(),
        box = viewVars.workspace.querySelector('.blockui-node.blockui-selected'), head = box?.querySelector(':scope > .blockui-node-head'),
        slot = viewVars.workspace.querySelector('.blockui-input-slot.blockui-slot-active'), slotHead = slot?.querySelector(':scope > .blockui-slot-head'),
        editing = viewVars.workspace.querySelector('.blockui-field.blockui-editing-field');
      const ownerOf = (el) => el?.closest('.blockui-statement') || el?.closest('.blockui-node');
      const lineOf = (owner) => owner?.querySelector(':scope > .blockui-node-content > .blockui-node-main') || owner;
      // Moves an absolutely placed element so that its top left is at (x, y) on the screen; the world may be zoomed.
      const moveTo = (el, x, y) => {
        const cs = viewVars.doc.defaultView.getComputedStyle(el), r = el.getBoundingClientRect();
        el.style.left = (parseFloat(cs.left) || 0) + (x - r.left) / viewVars.zoom + 'px';
        el.style.top = (parseFloat(cs.top) || 0) + (y - r.top) / viewVars.zoom + 'px';
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
      const blockers = box ? [...viewVars.world.querySelectorAll('.blockui-statement, .blockui-event-hat, .blockui-insertion')].filter(n => !box.contains(n) && !n.contains(box)) : [];
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
      const covers = (r, own) => (marks ??= [...viewVars.world.querySelectorAll('input, select, textarea, summary, button:not(.blockui-insertion), .blockui-input-slot:not(:has(input, select, textarea, summary, button))')]
        .filter(n => !floating.some(f => f.contains(n)) && n.checkVisibility?.({ visibilityProperty: true }) !== false)
        .map(n => [n, n.getBoundingClientRect()]).filter(([, b]) => b.width && b.height))
        .filter(([n, b]) => !own.some(o => o.contains(n) || n.contains(o)) && meets(b, r)).length
        + 3 * [...floating, ...surface].filter(f => !own.includes(f) && f.getClientRects().length && meets(f.getBoundingClientRect(), r)).length;
      // Right above a block whose editing surface rises above it, the tools go above the surface.
      const aboveSurface = () => {
        const rise = box.getBoundingClientRect().top - extent(box).top;
        if (rise > 0) head.style.transform = 'translateY(' + -rise / viewVars.zoom + 'px)';
      };
      // Tools right above a block near the top of the workspace would reach under the bars over it, where they cannot
      // be pressed: they go right under the block instead when more of them shows there.
      const inView = () => {
        const above = head.getBoundingClientRect(), top = room.top + 2;
        if (above.top >= top) return;
        const under = extent(box).bottom + 4, bottom = room.top + viewVars.workspace.clientHeight - 2,
          shownAbove = Math.max(0, above.bottom - Math.max(above.top, top)), shownUnder = Math.max(0, Math.min(bottom, under + above.height) - under);
        if (shownUnder <= shownAbove) return;
        box.classList.remove('blockui-tools-above'); head.style.transform = '';
        const left = Math.max(room.left + 8, Math.min(above.left, room.left + viewVars.workspace.clientWidth - 8 - above.width));
        head.style.maxWidth = Math.max(120, room.left + viewVars.workspace.clientWidth - 8 - left) / viewVars.zoom + 'px';
        moveTo(head, left, under);
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
          if (r.right > room.right - 4 && room2 >= 120) { head.style.maxWidth = room2 / viewVars.zoom + 'px'; r = head.getBoundingClientRect(); }
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
              const above = head.getBoundingClientRect(), left = parseFloat(viewVars.doc.defaultView.getComputedStyle(head).left) || 0,
                far = room.right - 8 - above.width, shifted = { left: far, top: above.top, right: far + above.width, bottom: above.bottom };
              if (far > above.left && covers(above, [box, head]) && covers(shifted, [box, head]) < covers(above, [box, head]))
                head.style.left = left + (far - above.left) / viewVars.zoom + 'px';
              inView();
            }
          }
        }
      }
      if (showsSlotHead) {
        const owner = ownerOf(slot), sr = extent(slot), hr = slotHead.getBoundingClientRect(), w = hr.width, h = hr.height;
        if (inline) {
          const line = (editing.querySelector(':scope > input, :scope > textarea') || editing).getBoundingClientRect();
          moveTo(slotHead, sr.right + 8, line.top + Math.max(0, (Math.min(line.height, 60 * viewVars.zoom) - h) / 2));
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
        else { box.classList.add('blockui-tools-above'); aboveSurface(); inView(); }
      }
      clearOfControls();
    }
    // The editing surface of a text field reaches toward the right end of the workspace, at most 672 px wide, with room
    // for 「全部見て なおす」 (E-12). Given the width of the field's tools, it also leaves room for them on its line when
    // the surface keeps at least 200 px; it says whether it did. A tall surface (a メモ) opens upward when it would
    // reach below the workspace, so typing never scrolls the blocks.
    function sizeEditingField(field, tools = 0) {
      const box = field.getBoundingClientRect(), bounds = viewVars.workspace.getBoundingClientRect(),
        editText = field.querySelector(':scope > .blockui-edit-text'),
        button = editText?.getClientRects().length ? editText.getBoundingClientRect().width + 6 : 0,
        room = Math.min(bounds.left + viewVars.workspace.clientWidth, viewVars.doc.defaultView.innerWidth) - box.left - button - 18,
        inline = tools > 0 && room - tools - 8 >= 200, area = field.querySelector(':scope > textarea');
      field.style.setProperty('--blockui-edit-width', Math.max(100, Math.min(672, inline ? room - tools - 8 : room)) / viewVars.zoom + 'px');
      if (area) {
        const height = area.getBoundingClientRect().height, top = bounds.top + 24, bottom = bounds.top + viewVars.workspace.clientHeight - 24;
        field.classList.toggle('blockui-editing-up', box.top + height > bottom && box.bottom - height >= top);
      }
      return inline;
    }
    // The place a block from the list would go (right after the selected sentence) is shown on its line (E-08).
    function showImpliedDestination() {
      const implied = !viewVars.destination && !viewVars.moving && selectedStatement() && defaultDestination();
      for (const n of viewVars.workspace.querySelectorAll('.blockui-insertion,.blockui-hole-target'))
        n.classList.toggle('blockui-implied-destination', !!implied && sameLocation(implied, locationFromElement(n)));
    }
    // A block put in from the list with no place chosen goes right after the selected sentence, or at the end of the
    // body when nothing is selected (E-08). A selected enclosure that holds only its hole (a loop just put in) takes the
    // block into that hole.
    function defaultDestination() {
      const info = selectedStatement(), first = info && schemaOf(info.node)?.bodies?.[0]?.key, inner = first && info.node.bodies?.[first];
      if (inner?.length === 1 && inner[0].schemaId === 'Hole:statement') return { parentId: info.node.id, body: first, index: 0 };
      if (info) return { parentId: info.parentId, body: info.body, index: info.index + 1 };
      return viewVars.tree ? { parentId: viewVars.tree.id, body: 'body', index: viewVars.tree.bodies.body.length } : null;
    }
    function selectedStatement() {
      const info = viewVars.selected && viewVars.index.get(viewVars.selected);
      return info?.body && info.parentId && schemaOf(info.node)?.category === 'statement' && !schemaOf(info.node)?.draftOnly ? info : null;
    }
    // An enclosure put where blocks follow takes them into its first body (E-03): a new one, or a moved one whose first
    // body holds no block yet. The count is of the blocks that would go in.
    function wrapCount(schema, node, location, movingId = null) {
      if (!location?.body || !schema?.bodies?.length || schema.category !== 'statement') return 0;
      const inner = node?.bodies?.[schema.bodies[0].key];
      if (inner && inner.some(n => n.schemaId !== 'Hole:statement')) return 0;
      const siblings = viewVars.index.get(location.parentId)?.node.bodies[location.body] || [];
      if (siblings.length === 1 && siblings[0].schemaId === 'Hole:statement') return 0;
      return siblings.slice(location.index).filter(n => n.id !== movingId).length;
    }
    function emptyValueOf(id) {
      const box = locationElement({ id }), main = box?.querySelector(':scope > .blockui-node-content > .blockui-node-main');
      return main && [...main.querySelectorAll('input[data-expression-hole="true"], [data-blockui-action="hole-select-expression"]')]
        .find(n => n.closest('.blockui-node') === box || n.closest('.blockui-node')?.parentElement?.closest('.blockui-node') === box);
    }
    // The light stays through the renders that follow the drop, for two seconds.
    function lightEmptyValue() {
      if (!viewVars.attention || Date.now() > viewVars.attention.until) { viewVars.attention = null; return; }
      const empty = emptyValueOf(viewVars.attention.id), field = empty && (empty.closest('.blockui-field, .blockui-input-slot') || empty);
      if (field && !field.classList.contains('blockui-attention')) field.classList.add('blockui-attention');
    }
    function attendEmptyValue(id) {
      viewVars.doc.defaultView.requestAnimationFrame(() => {
        const empty = emptyValueOf(id);
        if (!empty) return;
        if (viewVars.lastPointerType === 'touch' || viewVars.lastPointerType === 'pen') {
          viewVars.attention = { id, until: Date.now() + 2000 };
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
      if (!viewVars.tree || !location) return { enabled: false, reason: '入れる ばしょを えらんでね' };
      const schema = BLOCK_SCHEMA_BY_ID.get(schemaId);
      if (schema.category !== (location.body ? 'statement' : 'expression'))
        return {
          enabled: false,
          reason: location.body ? '本文には つなぐブロックを 入れるよ。はめるブロックは あいている ところを えらんで 入れてね' : 'いまは はめるブロックを えらんで いるよ。つなぐブロックを ふやす ときは「＋ ここに入れる」を おしてね',
        };
      const key = schemaId + '|' + JSON.stringify(location) + '|' + (candidateNode ? JSON.stringify(candidateNode) : '');
      if (viewVars.availabilityCache.has(key)) return viewVars.availabilityCache.get(key);
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
      viewVars.availabilityCache.set(key, result);
      return result;
    }
    // A new continuous rule moves 1秒に200歩, as the example 「右」キーがおされているあいだ、右へ1秒に200歩の速さで動き続ける
    // does; what it waits for is chosen, never filled in (LANGUAGE.md: a condition stays to be chosen).
    function newRule() {
      const rule = createBlock('ContinuousRule', { idPrefix: viewVars.viewId, draft: true, allowHoles: true });
      for (const [key, value] of [['seconds', 1], ['distance', 200]])
        if (rule.inputs[key]?.schemaId === 'Hole:expression') Object.assign(rule.inputs[key], { schemaId: 'NumberLiteral', fields: { value } });
      return rule;
    }
    // A continuous rule found by search goes into the rules of the body's heading, as with 「＋ つづけて動くルール」.
    function ruleAvailability() {
      const slot = viewVars.tree && BLOCK_SCHEMA_BY_ID.get(viewVars.tree.schemaId)?.inputs.find(s => s.key === 'rules');
      if (!slot) return { enabled: false, reason: 'きっかけの ある 本文で 使えるよ' };
      if ((viewVars.tree.inputs.rules || []).length >= slot.maxItems) return { enabled: false, reason: 'つづけて動くルールは これ以上 ふやせないよ' };
      return { enabled: true };
    }
    // The block just put in (at its place, or in the hole it replaced) or moved (the one selected; a block moved down in
    // its own body is one place higher).
    function placedAt(location, schemaId, inserted = false) {
      const siblings = location?.body ? viewVars.index.get(location.parentId)?.node.bodies[location.body] : null,
        selectedId = session()?.blockSelection;
      if (!siblings) return selectedId;
      if (inserted && siblings[Math.min(location.index, siblings.length - 1)]?.schemaId === schemaId) return siblings[Math.min(location.index, siblings.length - 1)].id;
      if (siblings.some(n => n.id === selectedId && n.schemaId === schemaId)) return selectedId;
      for (const at of [location.index, location.index - 1, siblings.length - 1])
        if (siblings[at]?.schemaId === schemaId) return siblings[at].id;
      return selectedId;
    }
    function phrase(schema) {
      if (viewVars.phraseCache.has(schema.id)) return viewVars.phraseCache.get(schema.id);
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
      viewVars.phraseCache.set(schema.id, value);
      return value;
    }
    // A call that hands nothing over is written without 「をわたして、」 (【てじゅん】という手順を行う), so its block and its
    // face in the list read the same as its code (E-14).
    // The work's names, read once per drawing of the blocks or the list (render and renderPalette start it again).
    const workSymbols = () => {
      const work = project();
      if (!work) return null;
      if (viewVars.faceSymbols?.work !== work) viewVars.faceSymbols = { work, symbols: buildSymbols(work) };
      return viewVars.faceSymbols.symbols;
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
      // Named inputs keep their names and 「として」 on the face, as written in this call's code.
      if (['UserActionCall', 'UserFunctionCall'].includes(schema.kind) && node?.fields.argumentNames?.length === node?.inputs.args?.length && node.inputs.args.length) {
        const slot = schema.inputs.find(s => s.key === 'args'), field = schema.fields.find(f => f.key === 'name'), named = [];
        if (schema.kind === 'UserFunctionCall') named.push('（');
        node.fields.argumentNames.forEach((name, i) => {
          if (i) named.push('、');
          named.push(nameSource(name) + 'を ', { token: '', slot, index: i });
        });
        named.push(' として、【', { token: '', field }, schema.kind === 'UserActionCall' ? '】というてじゅんを行う' : '】で求めた答え）');
        return named;
      }
      // The character's colour reads 色を〔赤〕にする, as block-to-code writes it, unless the work has data named 色 (F-25).
      if (parts && schema.id === 'LooksCommand:SET_COLOR') {
        if (!project() || workSymbols()?.allDataNames?.has?.('色')) return parts;
        return parts.map((part) => (typeof part === 'string' ? part.replace(/^表示色を/, '色を') : part));
      }
      if (parts && schema.id === 'BuiltinCall:LENGTH' && listCountFace(node))
        return parts.map((part) => (typeof part === 'string' ? part.replace(/^の長さ$/, 'の数') : part));
      // 答えを もとめる too: （【ごうけい】で求めた答え） (F2-02).
      if (!parts || !['UserActionCall', 'UserFunctionCall'].includes(schema.kind) || node?.inputs?.args?.length) return parts;
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
    function faceRuby(root) {
      if (!['entry', 'basic'].includes(document.body.dataset.uiLevel)) return root;
      const found = new RegExp(viewVars.FACE_READING_SOURCE), texts = [],
        walker = viewVars.doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => {
          const stop = n.parentElement?.closest(viewVars.FACE_READING_SKIP);
          return stop && stop !== root && root.contains(stop) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        } });
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if (found.test(n.data)) texts.push(n);
      for (const n of texts) {
        const out = viewVars.doc.createDocumentFragment();
        let at = 0;
        for (const m of n.data.matchAll(new RegExp(viewVars.FACE_READING_SOURCE, 'g'))) {
          const ruby = viewVars.doc.createElement('ruby'), rt = viewVars.doc.createElement('rt');
          rt.textContent = viewVars.FACE_READINGS.find(([word, , next]) => word === m[0] && (!next || n.data.startsWith(next, m.index + word.length)))[1];
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
          candidate || applyCreationDefaults(createBlock(schema.id, { ...context(), ...blockCreationDefaults(project(), context().targetId), idPrefix: viewVars.viewId + '-preview' }), project(), context().targetId),
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
                // 〜キーがおされるまで待つ from a search shows its key (F2-11).
                : n?.schemaId === 'SensorRead:KEY_DOWN' && n.inputs?.arg?.schemaId === 'StringLiteral'
                  ? '「' + keySurface(n.inputs.arg.fields.value) + '」キーが おされている'
                  : null;
      const pill = (text, condition = false) =>
        E('span', 'blockui-preview-slot' + (condition ? ' blockui-preview-condition' : ''), text || ' ');
      if (['NumberLiteral', 'StringLiteral', 'BooleanLiteral'].includes(schema.kind))
        main.append(pill(scalar(node) || schema.fields[0]?.label));
      else if (schema.kind === 'CommentLine')
        main.append(viewVars.doc.createTextNode('※ メモ'));
      else if (schema.kind === 'Say') {
        main.append(pill(scalar(node.inputs.value) ?? 'ことば'));
        if (node.inputs.seconds) main.append(viewVars.doc.createTextNode(node.inputs.value?.schemaId === 'StringLiteral' ? 'と ' : 'を '), pill(scalar(node.inputs.seconds) ?? '秒数'), viewVars.doc.createTextNode(' 秒話す'));
        else main.append(viewVars.doc.createTextNode(' ' + sayParticle(node.inputs.value) + '言う'));
      }
      else if (schema.kind === 'VariableRead')
        main.append(pill(node.fields.name || 'へんすう'));
      // The direction a placed block lets the child choose shows as a value here too, so the list and the workspace
      // read the same (E-14): いまのばしょから、［右］へ［10］歩動く, ［前］へ［10］歩進む.
      else if ((schema.id === 'MotionCommand:MOVE_BY' && !(node.inputs.x && node.inputs.y)) || schema.id === 'MotionCommand:MOVE') {
        if (node.inputs.seconds) main.append(pill(scalar(node.inputs.seconds) ?? '1'), viewVars.doc.createTextNode('秒かけて、'));
        if (schema.id === 'MotionCommand:MOVE') {
          const back = node.fields.direction === 'backward';
          main.append(pill(back ? '後ろ' : '前'), viewVars.doc.createTextNode('へ'), pill(scalar(node.inputs.args?.[0]) ?? '10'), viewVars.doc.createTextNode(back ? '歩動く' : '歩進む'));
        } else {
          const key = node.inputs.x ? 'x' : 'y', word = { right: '右', left: '左', up: '上', down: '下' }[node.fields[key + 'Dir']];
          main.append(viewVars.doc.createTextNode('いまのばしょから、'), pill(word), viewVars.doc.createTextNode('へ'), pill(scalar(node.inputs[key]) ?? '10'), viewVars.doc.createTextNode('歩動く'));
        }
      }
      else {
        const parts = shownPhrase(schema, node);
        if (parts)
          for (const part of parts) {
            if (typeof part === 'string') main.append(viewVars.doc.createTextNode(part));
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
                if (i) main.append(viewVars.doc.createTextNode(slot.separator || '、'));
                // A key shows by the keyboard's name, as in the workspace (F-34); the part to go to is in 「 」, as the
                // placed block's choice and the code write it, and the mouse is マウス (R2-B-11).
                const text =
                  (schema.id === 'SensorRead:KEY_DOWN' && child?.schemaId === 'StringLiteral' ? keySurface(child.fields.value)
                    : schema.id === 'MotionCommand:GOTO_PART' && child?.schemaId === 'StringLiteral' && child.fields.value !== 'マウス' ? '「' + child.fields.value + '」'
                    : scalar(child)) ??
                  (slot.type === 'target'
                    ? child?.fields?.name || 'へんすう'
                    : slot.labels?.[part.index ?? i] || slot.label);
                main.append(pill(text, blockShapeKind(schemaOf(child) || {}) === 'boolean'));
              }
            }
          }
        else main.append(viewVars.doc.createTextNode(schema.label));
      }
      box.append(main);
      if (schema.bodies.length) box.append(E('span', 'blockui-preview-cavity'));
      return box;
    }
    // A body of 答えを もとめる ends with its 「〜を答えとして返す」, so its end is the place just before it (PERF-R2-01).
    function listedPlace(location) {
      const siblings = !viewVars.destination && location?.body ? viewVars.index.get(location.parentId)?.node?.bodies?.[location.body] : null;
      return siblings && !siblings.some(n => n.schemaId === 'Hole:statement')
        ? { ...location, index: siblings.length - (siblings.at(-1)?.schemaId === 'ReturnStatement' ? 1 : 0) } : location;
    }
    function paletteAvailability(schema, location, exact = false) {
      if (schema.candidateReason) return {enabled:false, reason:schema.candidateReason, node:schema.candidateNode};
      if (!exact && location?.body && !viewVars.PLACE_DEPENDENT_KINDS.has(schema.kind)) location = listedPlace(location);
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
    // One call for each てじゅん and 答えを もとめる of the work, written as 書ける ことば writes it (ジャンプ with 高さを1として、).
    function definitionCalls(work) {
      if (!work) return [];
      const handed = d => {
        const values = definitionHintArguments(d, work);
        return (d.args || []).length ? d.args.map((arg, i) => nameSource(arg) + 'を' + values[i]).join('、') + 'として、' : '';
      }, out = [];
      for (const [kind, list] of [['UserActionCall', work.actions], ['UserFunctionCall', work.functions]])
        for (const d of list || []) {
          const action = kind === 'UserActionCall', text = action ? `${handed(d)}【${d.name}】というてじゅんを行う` : `（${handed(d)}【${d.name}】で求めた答え）`;
          try {
            out.push({ ...BLOCK_SCHEMA_BY_ID.get(kind), candidateNode: nodeForSearchHint({ mode: action ? 'statement' : 'expression', text }, work, context()),
              candidateKey: (action ? 'action:' : 'function:') + d.id, searchLabel: text });
          } catch (_) { /* A definition whose call cannot be written yet is left out of the list. */ }
        }
      return out;
    }
    // A block of the list or a なかま that has the keys keeps them when the list is made again (Escape, もとに もどす): the
    // same one, else the first block or the search field, never the page (Y2-06).
    const paletteKey = n => ['data-blockui-action', 'data-blockui-category', 'data-blockui-schema', 'data-search-binding'].map(a => n.getAttribute(a)).join('|');
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
        const info = viewVars.index.get(node.id);
        for (const id of info?.ancestors || []) {
          const ancestor = viewVars.index.get(id)?.node;
          if (ancestor?.schemaId === 'ForEach') names.push(ancestor.fields.binder);
        }
        for (const info of viewVars.index.values())
          if (['LocalVariableDeclaration', 'LocalListDeclaration'].includes(info.node.schemaId))
            names.push(info.node.fields.name);
      } else if (field.type === 'string') {
        const info=viewVars.index.get(node.id),parent=viewVars.index.get(info?.parentId)?.node;
        if(info?.input==='message'&&['Broadcast','BroadcastAndWait'].includes(parent?.schemaId)){
          const signals=c.signalNames?.()||{received:[],sent:[]};names.push(...signals.received.filter(name=>!name.startsWith('拡張:')),...signals.sent);
        }
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
      }
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
      // this one, but another part does it (E2E-R1-04, final call 30): the だれが place of the face shows that part as a pale
      // chip, apart from the sentence's words, which stay those of the code. The body's own part is not shown.
      if (!owner && value?.kind === 'named' && !schemaOf(node)?.bodies?.length && !subjectWritten(node, value.name) &&
          value.name !== project()?.components.find(c => c.id === context().targetId)?.name) {
        const why = '前の 文の「' + value.name + (value.particle || 'は') + '」を ひきついで、' + value.name + 'が します',
          carried = E('span', 'blockui-subject-chip blockui-subject-carried', '（' + value.name + (value.particle || 'は') + '）', { 'data-block-id': node.id, 'data-carried-subject': value.name, role: 'note', 'aria-label': why });
        Object.assign(carried.style, { display: 'inline-flex', alignItems: 'center', alignSelf: 'center', padding: '0 7px', minHeight: '20px',
          border: '1px dashed currentColor', borderRadius: '10px', opacity: '1', marginRight: '4px', fontSize: '0.92em', whiteSpace: 'nowrap' });
        return carried;
      }
      if (!owner && (value?.kind !== 'named' || !subjectWritten(node, value.name))) return viewVars.doc.createDocumentFragment();
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
      n.classList.toggle('blockui-chosen-destination', sameLocation(viewVars.destination, location));
    }
    function placeActions(menu, commands, { reveal = false } = {}) {
      if (!menu.open || !menu.isConnected) return;
      const rectView = viewVars.workspace.getBoundingClientRect(),
        bounds = {
          left: rectView.left,
          top: rectView.top,
          width: viewVars.workspace.clientWidth,
          height: viewVars.workspace.clientHeight,
          right: rectView.left + viewVars.workspace.clientWidth,
          bottom: rectView.top + viewVars.workspace.clientHeight,
        };
      if (!bounds.width || !bounds.height) return;
      commands.style.transform = '';
      commands.style.maxWidth = Math.max(120, bounds.width - 16) + 'px';
      commands.style.maxHeight = Math.max(80, Math.min(330, bounds.height - 16)) + 'px';
      if (viewVars.doc.defaultView.getComputedStyle(commands).position === 'static') {
        if (reveal) commands.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
      }
      const rect = commands.getBoundingClientRect(),
        dx = Math.max(bounds.left + 8 - rect.left, Math.min(0, bounds.right - 8 - rect.right)),
        dy = Math.max(bounds.top + 8 - rect.top, Math.min(0, bounds.bottom - 8 - rect.bottom));
      commands.style.transform = 'translate(' + dx / viewVars.zoom + 'px,' + dy / viewVars.zoom + 'px)';
    }
    // A selected field's tools are placed with the block's tools (placeNodeTools).
    function placeSlotHead(slot){
      if(slot?.isConnected)placeNodeTools();
    }
    // The blocks 「ここから下を まとめて もっていく」 carries: the block and the ones after it in its body.
    function runIds(id) {
      const info = viewVars.index.get(id), siblings = info?.body ? viewVars.index.get(info.parentId)?.node.bodies[info.body] || [] : [];
      return info?.body ? siblings.slice(info.index).map(n => n.id) : [id];
    }
    // After a block is deleted (けす, a drop on the list, Delete) or a やめる is pressed, the keys stay in the block view: on
    // the block now selected, else on the workspace. On the page, the next Delete would delete the whole part (E2-01).
    function keepKeys() {
      // While the work runs, the keys belong to the work.
      if (viewVars.isLocked()) return;
      const id = session()?.blockSelection;
      ((id && locationElement({ id })) || viewVars.workspace).focus({ preventScroll: true });
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
    function slotLabel(location) {
      const parent = viewVars.index.get(location.parentId)?.node, slot = schemaOf(parent)?.inputs.find(s => s.key === location.input);
      if (parent?.schemaId === 'QuantityLiteral') return slotLabel(listLocation(viewVars.index.get(parent.id)) || {}) || '数';
      return slot ? slot.labels?.[location.index] || slot.label + (location.index === undefined ? '' : ' ' + (location.index + 1)) : '';
    }
    // ちがう ものに かえる and 計算を入れる (E-12): not at はじめて; at かんたん in the 「…」 after the sentence; at くわしく
    // with the selected field.
    function valueToolsShown() {
      return !viewVars.options.readOnly && document.body.dataset.uiLevel === 'advanced';
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
      details.open = viewVars.diagnosticsOpen;
      listen(details, 'toggle', () => {
        if (details.isConnected) viewVars.diagnosticsOpen = details.open;
      });
      details.append(E('summary', '', diagnostics.length + 'か所を たしかめます（書いた中身は のこって います）'));
      const pages = Math.ceil(diagnostics.length / 20);
      viewVars.diagnosticPage = Math.min(viewVars.diagnosticPage, pages - 1);
      const ul = E('ul');
      for (const d of diagnostics.slice(viewVars.diagnosticPage * 20, (viewVars.diagnosticPage + 1) * 20)) {
        const item = E('li', 'diagnostic-help', diagnosticPlace(d) + childDiagnosticText(d, session()?.sourceText, project()));
        appendDiagnosticDetails(item, d); ul.append(item);
      }
      details.append(ul);
      if (pages > 1) {
        const paging = E('div', 'blockui-paging'),
          back = button('前の手がかり', 'diagnostic-prev', () => {
            viewVars.diagnosticPage--;
            viewVars.diagnosticsOpen = true;
            viewRedraw.render({ force: true });
          }),
          next = button('次の手がかり', 'diagnostic-next', () => {
            viewVars.diagnosticPage++;
            viewVars.diagnosticsOpen = true;
            viewRedraw.render({ force: true });
          });
        back.disabled = viewVars.diagnosticPage === 0;
        next.disabled = viewVars.diagnosticPage === pages - 1;
        paging.append(back, E('span', '', viewVars.diagnosticPage + 1 + ' / ' + pages), next);
        details.append(paging);
      }
      return details;
    }
    function mapElseBranches() {
      viewVars.branchLines = new Map();
      viewVars.branchSourceLines = new Map();
      if (!viewVars.tree) return;
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
      for (const [id, { node }] of viewVars.index) {
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
          viewVars.branchLines.set(line, { id, body: 'elseBody' });
          viewVars.branchSourceLines.set(id + ':elseBody', line);
        }
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
            (BLOCK_SCHEMA_BY_ID.get(viewVars.index.get(id)?.node.schemaId)?.category === 'statement' ||
              (value.error && value.column < span.endColumn))) {
            match = id; start = span.startColumn; end = span.endColumn;
          }
        }
        if (match) return {id:match};
      }
      const branch = viewVars.branchLines.get(value.line),
        id = branch?.id || value.id || viewVars.lineNodes.get(value.line);
      return { id, body: branch && branch.id === id ? branch.body : value.body };
    }
    function locationElement({ id, body }) {
      return body
        ? [...viewVars.workspace.querySelectorAll('[data-blockui-body-wrapper]')].find(
            (n) => n.dataset.blockOwner === id && n.dataset.blockuiBodyWrapper === body,
          )
        : [...viewVars.workspace.querySelectorAll('.blockui-node')].find((n) => n.dataset.blockId === id);
    }
    function applyHighlight() {
      const point = resolveLocation(viewVars.currentLocation),
        key = point.id ? point.id + (point.body ? ':' + point.body : '') : null;
      if (viewVars.highlightedId === key) return;
      for (const n of viewVars.workspace.querySelectorAll('.blockui-current')) n.classList.remove('blockui-current');
      viewVars.highlightedId = key;
      markedElement(point)?.classList.add('blockui-current');
    }
    // The element that shows a running or failing place: its block, a number that is its own field in the sentence
    // (1 秒, 99999 Hz: E-02, F-06), else the nearest block that holds it.
    function markedElement(point) {
      const own = locationElement(point);
      if (own || point.body || !point.id) return own;
      const flat = [...viewVars.workspace.querySelectorAll('.blockui-flat-value')].find(n => n.dataset.blockId === point.id);
      if (flat) return flat;
      for (let entry = viewVars.index.get(point.id); entry?.parentId; entry = viewVars.index.get(entry.parentId)) {
        const holder = locationElement({ id: entry.parentId });
        if (holder) return holder;
      }
      return null;
    }
    function revealNode(id) {
      let entry = viewVars.index.get(id),
        reveal = viewVars.collapsed.delete(id);
      while (entry?.parentId) {
        if (entry.body) {
          const key = entry.parentId + ':' + entry.body,
            p = Math.floor(entry.index / viewVars.BODY_PAGE);
          if ((viewVars.bodyPages.get(key) || 0) < p && !viewVars.bodyExtraPages.get(key)?.has(p)) {
            if (!viewVars.bodyExtraPages.has(key)) viewVars.bodyExtraPages.set(key, new Set());
            viewVars.bodyExtraPages.get(key).add(p);
            reveal = true;
          }
        } else if (entry.input && entry.index !== null) {
          const key = entry.parentId + ':' + entry.input,
            p = Math.floor(entry.index / viewVars.INPUT_PAGE);
          if ((viewVars.inputPages.get(key) || 0) !== p) {
            viewVars.inputPages.set(key, p);
            reveal = true;
          }
        }
        if (viewVars.collapsed.delete(entry.parentId)) reveal = true;
        entry = viewVars.index.get(entry.parentId);
      }
      if (reveal && !viewVars.pending) viewRedraw.render({ force: true });
      return reveal;
    }
    function highlight(location) {
      viewVars.currentLocation = typeof location === 'number' ? { line: location } : location;
      const point = resolveLocation(viewVars.currentLocation),
        key = point.id ? point.id + (point.body ? ':' + point.body : '') : null;
      if (key === viewVars.highlightedId) return;
      revealNode(point.id);
      applyHighlight();
      if (viewVars.root.getClientRects().length) {
        const n = viewVars.workspace.querySelector('.blockui-current');
        if (n) {
          const r = n.getBoundingClientRect(), room = viewVars.workspace.getBoundingClientRect();
          if (r.top < room.top) viewVars.workspace.scrollTop += r.top - room.top;
          else if (r.bottom > room.bottom) viewVars.workspace.scrollTop += r.bottom - room.bottom;
          if (r.left < room.left) viewVars.workspace.scrollLeft += r.left - room.left;
          else if (r.right > room.right) viewVars.workspace.scrollLeft += r.right - room.right;
        }
      }
    }
    function attachShape(box, kind) {
      box.dataset.shapeKind = kind;
      const svg = viewVars.doc.createElementNS('http://www.w3.org/2000/svg', 'svg'),
        path = viewVars.doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      svg.classList.add('blockui-shape');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      svg.append(path);
      box.prepend(svg);
    }
    // A key or a signal body names its key or signal, as a touch body names what it touches (F2-04): 「右」キーを おしたとき,
    // 「開始」という 合図を 受けたとき (the code writes 「開始」という合図を受けたとき、).
    function headingTitle(event, filter) {
      if (event === 'keyDown' && typeof filter?.key === 'string') return '「' + keySurface(filter.key) + '」キーを おしたとき';
      if (event === 'message' && typeof filter?.message === 'string') return '「' + filter.message + '」という 合図を 受けたとき';
      return eventText(event, filter);
    }
    function eventHat() {
      const ctx = context(),
        p = project(),
        [kind, id, event] = session()?.ownerKey?.split(':') || [],
        who = id === 'stage' ? p?.stage : p?.components.find((c) => c.id === id),
        name = viewVars.tree?.fields.heading?.actorRef?.kind==='named'?viewVars.tree.fields.heading.actorRef.name:who?.name||p?.components.find(c=>c.id===ctx.targetId)?.name||ctx.definition?.name||'この 本文';
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
            ? headingTitle(viewVars.tree?.fields.heading?.event||ctx.event||event, viewVars.tree?.fields.heading ? viewVars.tree.fields.heading.filter : ctx.filter) || event
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
    function updateFieldWidths() {
      if (!viewVars.fieldMeasureContext && typeof viewVars.doc.defaultView.CanvasRenderingContext2D === 'function')
        viewVars.fieldMeasureContext = viewVars.doc.createElement('canvas').getContext('2d');
      const writes = [];
      for (const input of viewVars.root.querySelectorAll('.blockui-field input')) {
        const style = viewVars.doc.defaultView.getComputedStyle(input), text = input.value || input.placeholder || ' ';
        let textWidth;
        if (viewVars.fieldMeasureContext) {
          viewVars.fieldMeasureContext.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          viewVars.fieldMeasureContext.fontKerning = style.fontKerning;
          if ('letterSpacing' in viewVars.fieldMeasureContext)
            viewVars.fieldMeasureContext.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
          textWidth = viewVars.fieldMeasureContext.measureText(text).width;
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
    Object.assign(viewCalls, {
      E,
      announce,
      applyHighlight,
      attachShape,
      attendEmptyValue,
      availability,
      button,
      cancelLabel,
      context,
      copy,
      defaultDestination,
      definitionCalls,
      destinationDescription,
      diagnosticSummary,
      edgeShown,
      edgeStored,
      errorText,
      eventHat,
      faceRuby,
      getTree,
      headingTitle,
      highlight,
      joinAccessibleName,
      keepKeys,
      letGoOfSelection,
      lightEmptyValue,
      listLocation,
      listen,
      localIndex,
      locationElement,
      locationFromElement,
      mapElseBranches,
      markDrop,
      measureShape,
      namesFor,
      newRule,
      normalizedResult,
      notifyPending,
      paletteAvailability,
      paletteKey,
      paletteLabel,
      phrase,
      placeActions,
      placeControls,
      placeNodeTools,
      placeSlotHead,
      placedAt,
      previewNode,
      project,
      readInputValue,
      readable,
      rememberViewState,
      resolveLocation,
      revealNode,
      roleUnit,
      ruleAvailability,
      runIds,
      sameLocation,
      sayParticle,
      schemaOf,
      selection,
      session,
      showImpliedDestination,
      shownPhrase,
      sizeEditingField,
      slotLabel,
      subjectContext,
      subjectFace,
      subjectName,
      syncDeferredTree,
      syncLibraryToggle,
      updateFieldWidths,
      valueToolsShown,
      wrapCount,
    });
  }
