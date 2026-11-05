  // ────────────────────────────────────────────────────────────────────────
  // 10 — Block view drawing: the blocks, their slots and tools, the whole view (render), pressing and dragging on the drawn
  // blocks, and the view's own entry points.
  // ────────────────────────────────────────────────────────────────────────
  // The parts of the block view come in this order in src/akari.html: a part uses only the parts before it and asks
  // the parts after it only to draw the view again (AUDIT.md「ソースの境界」). Called at the start of every
  // createBlockEditorView: viewVars is the state of that one view, viewCalls the functions it offers the parts after it
  // and those it calls from the parts before it, and viewRedraw the redraw request of the parts before it, which it
  // fills with render.
  function createViewDrawing(viewVars, viewCalls, viewRedraw) {
    // Between two blocks the place is a thin line; the last place of a body keeps 「＋ ここに入れる」 (E-07).
    function insertion(parentId, body, pos, end = false) {
      const b = viewCalls.button(
        '＋ ここに入れる',
        'body-insert',
        (event) => viewCalls.chooseDestination({ parentId, body, index: pos }, { keyboard: event.detail === 0 }),
        { 'aria-label': (pos + 1) + '番目の ばしょに ブロックを入れる' },
      );
      b.classList.add('blockui-insertion');
      if (end) b.classList.add('blockui-insertion-end');
      b.disabled = viewVars.isLocked();
      viewCalls.markDrop(b, { parentId, body, index: pos });
      return b;
    }
    function moveStart(node, type = 'move') {
      if (!viewCalls.flush().ok || viewVars.isLocked()) return;
      for (const menu of viewVars.root.querySelectorAll('.blockui-actions[open]')) menu.open = false;
      viewCalls.selection(node.id);
      viewVars.moving = { id: node.id, type };
      viewVars.destination = null;
      viewCalls.announce(type === 'copy' ? 'もう1つ 作る ところを えらんでね'
        : type === 'run' ? 'この ブロックから 下の ' + viewCalls.runIds(node.id).length + 'この ブロックを もっていく ところを えらぶか、そのまま 運んでね'
          : 'どこへ もって いくか えらんでね');
      viewCalls.updateControls();
      viewCalls.showImpliedDestination();

      // The menu is now hidden; Escape must remain inside this editor.
      viewCalls.focus({ id: node.id });
    }
    function nodeTools(node, info) {
      const schema = viewCalls.schemaOf(node),
        tools = viewCalls.E('div', 'blockui-node-tools');
      if (schema.category === 'target' || schema.category === 'script') return tools;
      const dragHandle = viewCalls.button('⠿', 'drag-handle', () => viewCalls.selection(node.id), {
        'aria-label': schema.label + 'を おしたまま 運ぶ',
        'data-blockui-drag': 'node',
        'data-block-id': node.id,
      });
      dragHandle.classList.add('blockui-drag-handle');
      dragHandle.disabled = viewVars.isLocked();
      tools.append(dragHandle);
      const menu = viewCalls.E('details', 'blockui-actions'),
        summary = viewCalls.E('summary', 'blockui-selection-actions', 'ほかの そうさ', {
          'aria-label': schema.label + 'のほかの そうさ',
          'data-blockui-action': 'more',
        }),
        commands = viewCalls.E('div', 'blockui-action-items');
      menu.append(summary, commands);
      tools.append(menu);
      viewCalls.listen(summary, 'click', (event) => {
        event.stopPropagation();
        viewCalls.selection(node.id);
      });
      // The toggle comes a moment after the press: a menu drawn anew in between (and kept open) is not closed by the old one.
      viewCalls.listen(menu, 'toggle', () => {
        if (!menu.open || !menu.isConnected) return;
        for (const other of viewVars.root.querySelectorAll('.blockui-actions[open]'))
          if (other !== menu) other.open = false;
        viewCalls.placeActions(menu, commands, { reveal: true });
      });
      // Moving a block is 「もっていく」: 「動かす」 is only for the characters and ▶ 動かす (E-05, §4).
      const move = viewCalls.button('ほかへ もっていく', 'move', () => moveStart(node), { 'data-block-id': node.id }),
        duplicate = viewCalls.button(
          '同じものを もう1つ 作る',
          'duplicate',
          () => {
            if (info.body)
              viewCalls.operate({
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
        const siblings = viewVars.index.get(info.parentId)?.node.bodies[info.body] || [];
        // Several blocks go together only when asked (E-06): this block and the ones below it in the same body.
        if (info.index < siblings.length - 1)
          commands.append(viewCalls.button('ここから下を まとめて もっていく', 'move-run', () => moveStart(node, 'run'), { 'data-block-id': node.id }));
      }
      commands.append(duplicate);
      if (info.body) {
        const siblings = viewVars.index.get(info.parentId)?.node.bodies[info.body] || [];
        const up = viewCalls.button(
            '↑ まえへ',
            'move-up',
            () =>
              viewCalls.operate({
                type: 'move',
                id: node.id,
                parentId: info.parentId,
                body: info.body,
                index: info.index - 1,
              }),
            { 'aria-label': schema.label + 'を まえへ', 'data-block-id': node.id },
          ),
          down = viewCalls.button(
            '↓ あとへ',
            'move-down',
            () =>
              viewCalls.operate({
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
          tools.insertBefore(viewCalls.button('けす', 'remove-quick', () => viewCalls.removeBlock(node, info), {
            'aria-label': schema.label + (schema.bodies.length ? 'と 中の ブロックを けす' : 'を けす'), 'data-block-id': node.id }), menu);
      }
      const who = viewCalls.actorTool(node);
      if (who) tools.insertBefore(who, menu);
      if (info.body) {
        commands.append(
          viewCalls.button(
            schema.bodies.length ? 'この まとまりと 中の ブロックを けす' : 'この ブロックを けす',
            'remove',
            () => viewCalls.removeBlock(node, info),
            { 'data-block-id': node.id },
          ),
        );
        if (!['NoOperation', 'CommentLine'].includes(schema.id))
          commands.append(
            viewCalls.button(
              'いったん 使わない',
              'replace-noop',
              () =>
                viewCalls.operate({
                  type: 'replace',
                  id: node.id,
                  node: createBlock('NoOperation', { idPrefix: viewVars.viewId }),
                }),
              { 'data-block-id': node.id, 'aria-label': schema.label + 'を 何もしないに 入れかえる' },
            ),
          );
      } else if (info.input && document.body.dataset.uiLevel !== 'entry') {
        // はじめて has no 計算を入れる in its values (E-12).
        commands.append(
          viewCalls.button('計算を入れる', 'replace-expression', () => viewCalls.chooseDestination(viewCalls.listLocation(info)), {
            'data-block-id': node.id,
          }),
        );
      }
      if (schema.bodies.length || schema.inputs.length)
        commands.append(
          viewCalls.button(
            viewVars.collapsed.has(node.id) ? '開く' : 'たたむ',
            'collapse',
            () => {
              if (!viewCalls.flush().ok) return;
              viewVars.collapsed.has(node.id) ? viewVars.collapsed.delete(node.id) : viewVars.collapsed.add(node.id);
              menu.open = false;
              render({ force: true });
            },
            { 'aria-expanded': !viewVars.collapsed.has(node.id), 'data-block-id': node.id },
          ),
        );
      for (const field of schema.fields.filter((f) => f.key === 'hasElse'))
        commands.append(viewCalls.fieldControl(node, field));
      if (schema.annotations.some((a) => a.editable !== false))
        commands.append(
          viewCalls.button(
            'メモ',
            'annotations',
            () => {
              viewVars.openAnnotations.add(node.id);
              menu.open = false;
              render({ force: true });
              const details = [...viewVars.workspace.querySelectorAll('.blockui-annotations')].find(
                (n) => n.parentElement?.parentElement?.dataset.blockId === node.id,
              );
              details?.querySelector('input')?.focus();
            },
            { 'data-block-id': node.id },
          ),
        );
      for (const b of tools.querySelectorAll('button'))
        if (b.dataset.blockuiAction !== 'collapse' && viewVars.isLocked()) b.disabled = true;
      return tools;
    }
    function statementBody(parent, slot) {
      const enabled = !slot.when || parent.fields[slot.when];
      if (!enabled) return null;
      const children = parent.bodies[slot.key],
        box = viewCalls.E('section', 'blockui-body', null, {
          'aria-label': slot.label,
          'data-blockui-body-wrapper': slot.key,
          'data-block-owner': parent.id,
          tabindex: '-1',
        }),
        key = parent.id + ':' + slot.key,
        pages = Math.max(1, Math.ceil(children.length / viewVars.BODY_PAGE));
      let p = Math.min(viewVars.bodyPages.get(key) || 0, pages - 1);
      viewVars.bodyPages.set(key, p);
      box.append(
        viewCalls.E('div', 'blockui-body-label', slot.key === 'elseBody' ? 'そうでなければ' : slot.label),
      );
      const ranges = blockBodyRanges(children.length, p, viewVars.bodyExtraPages.get(key), viewVars.BODY_PAGE);
      const branchLine = viewVars.branchSourceLines.get(key);
      if (branchLine) {
        box.dataset.sourceLine = branchLine;
        const diagnostics = viewVars.diagnosticsByLine.get(branchLine) || [];
        if (diagnostics.length) {
          box.classList.add('blockui-diagnostic');
          const ul = viewCalls.E('ul', 'blockui-node-diagnostics');
          for (const d of diagnostics) { const item = viewCalls.E('li', 'diagnostic-help', childDiagnosticText(d, viewCalls.session()?.sourceText, viewCalls.project())); appendDiagnosticDetails(item, d); ul.append(item); }
          box.append(ul);
        }
      }
      const showPage = (page) => {
        if (!viewVars.bodyExtraPages.has(key)) viewVars.bodyExtraPages.set(key, new Set());
        viewVars.bodyExtraPages.get(key).add(page);
        render({ force: true });
      };
      let end = 0;
      // An empty enclosure shows only its hole (〔くり返すことを えらぶ〕) as the place to put a block in (E-03).
      if (children.length === 1 && children[0].schemaId === 'Hole:statement') {
        const hole = renderNode(children[0]);
        viewCalls.markDrop(hole, { parentId: parent.id, body: slot.key, index: 0 });
        hole.classList.add('blockui-hole-target');
        // The whole hole is the place: pressing it chooses the place, as 「＋ ここに入れる」 does.
        if (!viewVars.options.readOnly)
          viewCalls.listen(hole, 'click', (event) => {
            if (event.target.closest('button,input,select,textarea,summary') || Date.now() < viewVars.suppressClickUntil) return;
            viewCalls.chooseDestination({ parentId: parent.id, body: slot.key, index: 0 }, { keyboard: event.detail === 0 });
          });
        box.append(hole);
        return box;
      }
      for (const [begin, limit] of ranges) {
        if (begin > end) {
          const gap = viewCalls.E('div', 'blockui-body-gap'),
            first = Math.floor(end / viewVars.BODY_PAGE),
            last = Math.floor((begin - 1) / viewVars.BODY_PAGE);
          gap.append(
            viewCalls.button('つづきのブロックを見せる', 'body-gap-next', () => showPage(first)),
            viewCalls.E('span', '', `${end + 1}〜${begin}番目の ブロックは かくれて いるよ`),
          );
          if (last !== first)
            gap.append(viewCalls.button('すぐ前のブロックを見せる', 'body-gap-previous', () => showPage(last)));
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
        const nextPage = Math.floor(end / viewVars.BODY_PAGE),
          more = viewCalls.button('つづきを見せる', 'body-more', () => showPage(nextPage), {
            'data-body-more-key': key,
            'data-body-more-page': nextPage,
          });
        more.classList.add('blockui-body-more');
        box.append(more);
      }
      // A body of continuing rules only is a body of blocks (LANGUAGE.md レベル): it is not empty.
      if (!children.length && !(parent.schemaId === 'Script' && parent.inputs.rules?.length)) box.append(viewCalls.E('p', 'blockui-empty', parent.schemaId === 'Script'
        ? 'ブロックが まだ ないよ。「＋ ここに入れる」を おして、ブロックを 入れてね。' + (viewVars.doc.body.dataset.uiLevel === 'entry' ? '' : '動く お手本は「お手本を開く」で 見られるよ。')
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
        box = viewCalls.E('div', 'blockui-input-slot', null, { 'aria-label': label });
      if (slot.type === 'expression') viewCalls.markDrop(box, location);
      const head = viewCalls.E('div', 'blockui-slot-head');
      head.append(viewCalls.E('span', 'blockui-slot-label', label));
      if (slot.type === 'expression' && viewCalls.valueToolsShown()) head.append(...valueTools(location, label, child));
      if (slot.multiple && slot.variadic) {
        const n = parent.inputs[slot.key].length;
        const up = viewCalls.button(
            '↑',
            'variadic-up',
            () =>
              viewCalls.operate({
                type: 'variadic-move',
                parentId: parent.id,
                input: slot.key,
                index: i,
                toIndex: i - 1,
              }),
            { 'aria-label': label + 'を前へ' },
          ),
          down = viewCalls.button(
            '↓',
            'variadic-down',
            () =>
              viewCalls.operate({
                type: 'variadic-move',
                parentId: parent.id,
                input: slot.key,
                index: i,
                toIndex: i + 2,
              }),
            { 'aria-label': label + 'を後ろへ' },
          ),
          remove = viewCalls.button(
            '外す',
            'variadic-remove',
            () =>
              viewCalls.operate({ type: 'variadic-remove', parentId: parent.id, input: slot.key, index: i }),
            { 'aria-label': label + 'を外す' },
          );
        up.disabled = viewVars.isLocked() || i === 0;
        down.disabled = viewVars.isLocked() || i === n - 1;
        remove.disabled = viewVars.isLocked() || n <= slot.minItems;
        head.append(up, down, remove);
      }
      // A field's tools show when it has some; a name alone is its accessible name (E-12: no noise for beginners).
      const shown = renderNode(child);
      // A number in its place is read by the place's name (AX-09).
      if (child?.schemaId === 'NumberLiteral') shown.querySelector(':scope > .blockui-node-content [data-blockui-field="value"]')?.setAttribute('aria-label', label);
      box.append(shown);
      if (head.childElementCount > 1) box.append(head);
      if (!viewVars.options.readOnly && parent.schemaId === 'ListRead' && slot.key === 'list' && child.schemaId === 'StringLiteral') {
        const recovery = viewCalls.E('div', 'blockui-list-repair'), select = viewCalls.E('select', '', null, { 'aria-label':'文字の代わりに使うリストを えらぶ' });
        select.append(viewCalls.E('option', '', 'リストを えらぶ', { value:'' }));
        const localContext = viewCalls.subjectContext(parent),
          candidates = hintCandidates(viewCalls.project(), localContext.targetId, { source:viewCalls.session()?.sourceText || '', ...localContext })
          .filter(h => h.id.startsWith('read:') && h.binding?.kind === 'list' && h.enabled);
        for (const [i,h] of candidates.entries()) select.append(viewCalls.E('option', '', h.text, { value:String(i) }));
        select.disabled = viewVars.isLocked() || !candidates.length;
        viewCalls.listen(select, 'change', () => { if (select.value !== '') viewCalls.operate({ type:'expression', ...location, node:nodeForSearchHint(candidates[Number(select.value)], viewCalls.project(), localContext) }); });
        recovery.append(viewCalls.E('span', '', '「 」で かこんだ 名前は 文字です。' + (candidates.length ? '使う リストを えらびなおせます。' : '使える リストが ありません。')), select);
        box.append(recovery);
      }
      return box;
    }
    function renderInput(node, slot, i) {
      if (!slot.multiple) return expressionSlot(node, slot, node.inputs[slot.key]);
      if (i !== undefined) return expressionSlot(node, slot, node.inputs[slot.key][i], i);
      const children = node.inputs[slot.key],
        wrap = viewCalls.E('div', 'blockui-multiple-inputs', null, { 'aria-label': slot.label }),
        key = node.id + ':' + slot.key,
        pages = Math.max(1, Math.ceil(children.length / viewVars.INPUT_PAGE)),
        p = Math.min(viewVars.inputPages.get(key) || 0, pages - 1);
      viewVars.inputPages.set(key, p);
      for (let i = p * viewVars.INPUT_PAGE; i < Math.min(children.length, (p + 1) * viewVars.INPUT_PAGE); i++) {
        if (i > p * viewVars.INPUT_PAGE) wrap.append(viewCalls.E('span', 'blockui-separator', slot.separator || '、'));
        wrap.append(expressionSlot(node, slot, children[i], i));
      }
      if (slot.variadic) {
        const add = viewCalls.button(
          '＋',
          'variadic-add',
          () => {
            const result = viewCalls.operate({
              type: 'variadic-insert',
              parentId: node.id,
              input: slot.key,
              index: children.length,
              node: createBlock('NumberLiteral', { idPrefix: viewVars.viewId }),
            });
            if (result.ok) {
              viewVars.inputPages.set(key, Math.floor(children.length / viewVars.INPUT_PAGE));
              render({ force: true });
            }
          },
          {
            'data-parent-id': node.id,
            'data-blockui-input': slot.key,
            'aria-label': slot.label + 'を入れる',
          },
        );
        add.disabled = viewVars.isLocked() || children.length >= slot.maxItems;
        wrap.append(add);
      }
      if (pages > 1) {
        const paging = viewCalls.E('div', 'blockui-paging'),
          back = viewCalls.button('前の入力', 'input-prev', () => {
            viewVars.inputPages.set(key, p - 1);
            render({ force: true });
          }),
          next = viewCalls.button('次の入力', 'input-next', () => {
            viewVars.inputPages.set(key, p + 1);
            render({ force: true });
          });
        back.disabled = p === 0;
        next.disabled = p === pages - 1;
        paging.append(
          back,
          viewCalls.E('span', '', p + 1 + ' / ' + pages + ' (' + children.length + 'こ)'),
          next,
        );
        wrap.append(paging);
      }
      return wrap;
    }
    function flatNumber(literal, location) {
      const label = viewCalls.slotLabel(location), wrap = viewCalls.E('span', 'blockui-input-slot blockui-flat-value', null, { 'data-block-id': literal.id, 'aria-label': label });
      if (!viewVars.options.readOnly) viewCalls.markDrop(wrap, location);
      wrap.append(viewCalls.fieldControl(literal, BLOCK_SCHEMA_BY_ID.get('NumberLiteral').fields.find(f => f.key === 'value')));
      // The number is read by its place (秒数, よこの歩数 …), not as 「数」 (AX-09).
      if (label) wrap.querySelector('[data-blockui-field="value"]')?.setAttribute('aria-label', label);
      if (viewCalls.valueToolsShown()) {
        const head = viewCalls.E('div', 'blockui-slot-head');
        head.append(viewCalls.E('span', 'blockui-slot-label', label), ...valueTools(location, label, literal));
        wrap.append(head);
      }
      return wrap;
    }
    function valueTools(location, label, child) {
      const types = viewCalls.E('select', 'blockui-value-type', null, { 'aria-label': label + 'の中身の しゅるい', 'data-blockui-value-type': 'true' });
      // A calculation goes in with 「計算を入れる」 next to it, the one control for it (F2-17).
      for (const [value, text] of [['','ちがう ものに かえる'],['NumberLiteral','数'],['StringLiteral','文字'],['SensorRead:答え','答え'],['VariableRead','名前']])
        types.append(viewCalls.E('option', '', text, { value }));
      types.disabled = viewVars.isLocked();
      viewCalls.listen(types, 'change', () => {
        const kind = types.value; if (!kind) return;
        const local = viewVars.pending && (viewVars.pending.id === child.id || viewVars.index.get(viewVars.pending.id)?.ancestors.includes(child.id));
        if (viewVars.pending?.composing) { viewCalls.announce('日本語の へんかんを おわらせてから えらんでね', true); types.value=''; return; }
        const text = local ? viewVars.pending.input.value : child.schemaId === 'StringLiteral' ? child.fields.value : '';
        if (local) viewCalls.cancelField();
        if (kind === 'expression') { viewCalls.chooseDestination(location); return; }
        const next = createBlock(kind);
        if (kind === 'StringLiteral') next.fields.value = text;
        const result = viewCalls.operate({ type:'expression', ...location, node:next });
        if (result.ok) {
          const current = viewVars.index.get(location.parentId)?.node.inputs[location.input], value = location.index === undefined ? current : current?.[location.index];
          if (value) viewCalls.focus({ id:value.id });
        }
      });
      const b = viewCalls.button('計算を入れる', 'slot-select', () => { viewVars.category = 'operator'; viewVars.categoryExplicit = true; viewVars.searchText = ''; viewVars.search.value = ''; viewCalls.chooseDestination(location); }, {
        'aria-label': label + 'に計算を入れる',
      });
      b.disabled = viewVars.isLocked();
      return [types, b];
    }
    // かんたん: a sentence's 「…」 holds 「ちがう ものに かえる」 and 「計算を入れる」 for each value in it (E-12).
    function addValueToolsToExtra(node, box, main) {
      if (viewVars.options.readOnly || document.body.dataset.uiLevel !== 'basic' || viewCalls.schemaOf(node)?.category !== 'statement') return;
      // The sentence's own parts (its bodies are not in main): its values and those of the calculations in it.
      const places = [...main.querySelectorAll('.blockui-input-slot[data-blockui-drop]')].filter(n => !n.closest('.blockui-extra'));
      if (!places.length) return;
      let extra = main.querySelector(':scope > .blockui-extra');
      if (!extra) { extra = viewCalls.extraDisclosure(node, viewCalls.schemaOf(node).label + 'の 中身を かえる').extra; main.append(extra); }
      const controls = extra.querySelector(':scope > .blockui-extra-controls');
      for (const place of places) {
        const location = viewCalls.locationFromElement(place), parent = viewVars.index.get(location.parentId)?.node,
          current = parent?.inputs[location.input], child = location.index === undefined ? current : current?.[location.index];
        if (!child) continue;
        const row = viewCalls.E('div', 'blockui-value-row'), label = place.getAttribute('aria-label') || viewCalls.slotLabel(location);
        row.append(viewCalls.E('span', 'blockui-slot-label', label), ...valueTools(location, label, child));
        controls.append(row);
      }
    }
    function unitValue(node, key, index, unit) {
      const slot = viewCalls.schemaOf(node).inputs.find(s => s.key === key),
        child = index === undefined ? node.inputs[key] : node.inputs[key]?.[index],
        quantity = child?.schemaId === 'QuantityLiteral' ? child : null,
        nested = quantity?.fields.unit === unit && quantity.inputs.value?.schemaId === 'QuantityLiteral' ? quantity.inputs.value : null,
        shown = nested || quantity,
        inner = shown ? shown.inputs.value
          : child?.schemaId === 'UnitlessRead' && child.inputs.value?.schemaId === 'NumberLiteral' ? child.inputs.value : child,
        written = shown?.fields.unit || unit,
        text = s => viewCalls.E('span', 'blockui-phrase-text blockui-unit-text', s, { 'data-unit': s }), parts = [];
      // The place of the value is the sentence's own (a calculation put there takes the place of the number and its unit).
      const at = { parentId: node.id, input: key, ...(index === undefined ? {} : { index }) };
      if (inner?.schemaId === 'NumberLiteral' || inner?.schemaId === 'Hole:expression') parts.push(flatNumber(inner, at), text(written));
      else if (inner?.schemaId === 'BuiltinCall:乱数' && inner.inputs.args?.length === 2) {
        const args = BLOCK_SCHEMA_BY_ID.get('BuiltinCall:乱数').inputs.find(s => s.key === 'args');
        parts.push(renderInput(inner, args, 0), text(written + 'から'), renderInput(inner, args, 1), text(written + 'のどれか'));
      } else if (shown) parts.push(renderInput(shown, BLOCK_SCHEMA_BY_ID.get('QuantityLiteral').inputs.find(s => s.key === 'value')), text(written));
      else parts.push(renderInput(node, slot, index), text(written));
      if (shown && written !== unit) parts.push(viewCalls.unitRepair(quantity, unit, nested));
      return parts;
    }
    function renderMotionBlock(node, schema, main) {
      const value = schema.discriminator.value, { extra, extraControls } = viewCalls.extraDisclosure(node, schema.label + 'を なおす');
      const text = s => viewCalls.E('span', 'blockui-phrase-text', s), fieldOf = key => schema.fields.find(f => f.key === key);
      const quantity = (key, unit, index) => main.append(...unitValue(node, key, index, unit));
      const actor = fieldOf('actorRef');
      if (actor) main.append(viewCalls.fieldControl(node, actor));
      // The time comes first. Of the move blocks, はじめて adds it only to いまのばしょから動く (not to 決めたばしょへ行く,
      // 前へ進む or a 〜のところへ行く of a work made at another level); a time already written can always be taken off.
      // 後ろへ reads 動く, so its time is 時間をかけて動く (R2-B-11).
      const timeLabel = { GOTO: '時間をかけて行く', GOTO_PART: '時間をかけて行く', MOVE_BY: '時間をかけて動く', MOVE: node.fields.direction === 'backward' ? '時間をかけて動く' : '時間をかけて進む', TURN_RIGHT: '時間をかけて回る', TURN_LEFT: '時間をかけて回る' }[value];
      if (node.inputs.seconds) {
        quantity('seconds', '秒'); main.append(text('かけて、'));
        extraControls.append(viewCalls.button('時間を外す', 'motion-untimed', () => viewCalls.operate({ type: 'optional-input-remove', parentId: node.id, input: 'seconds' })));
      } else if (timeLabel && (viewVars.doc.body?.dataset.uiLevel !== 'entry' || !['GOTO', 'MOVE', 'GOTO_PART'].includes(value)))
        extraControls.append(viewCalls.button(timeLabel, 'motion-timed', () => { const seconds = createBlock('NumberLiteral', { idPrefix: viewVars.viewId }); seconds.fields.value = 1; return viewCalls.operate({ type: 'expression', parentId: node.id, input: 'seconds', node: seconds }); }));
      const steps = n => { const literal = createBlock('NumberLiteral', { idPrefix: viewVars.viewId }); literal.fields.value = n; return literal; };
      if (value === 'GOTO' || value === 'MOVE_BY') {
        main.append(text(value === 'GOTO' ? '画面の左下のはしから、' : 'いまのばしょから、'));
        const both = !!(node.inputs.x && node.inputs.y);
        if (value === 'MOVE_BY' && !both) {
          // One direction: 右・左・上・下 in one choice; a choice on the other axis moves the steps there (one undo step),
          // and the axis left behind goes back to its plain direction (右・上), as the code read back has it.
          const key = node.inputs.x ? 'x' : 'y', current = node.fields[key === 'x' ? 'xDir' : 'yDir'];
          const select = viewCalls.E('select', 'blockui-motion-direction', null, { 'aria-label': schema.label + 'の 向き', 'data-block-id': node.id, 'data-blockui-action': 'motion-direction' });
          for (const [v, word] of [['right', '右'], ['left', '左'], ['up', '上'], ['down', '下']]) select.append(viewCalls.E('option', '', word, { value: v }));
          select.value = current; select.disabled = viewVars.isLocked() || !!viewVars.options.readOnly;
          viewCalls.listen(select, 'change', () => {
            const to = select.value, toKey = ['right', 'left'].includes(to) ? 'x' : 'y', replacement = structuredClone(node);
            if (toKey !== key) { replacement.inputs[toKey] = replacement.inputs[key]; delete replacement.inputs[key]; replacement.fields[key === 'x' ? 'xDir' : 'yDir'] = key === 'x' ? 'right' : 'up'; }
            replacement.fields[toKey === 'x' ? 'xDir' : 'yDir'] = to;
            if (!viewCalls.operate({ type: 'replace', id: node.id, node: replacement }).ok) select.value = current;
          });
          main.append(select, text('へ')); quantity(key, '歩');
        } else {
          // 決めたばしょへ行く writes 右へ・上へ as words; a choice is shown only where the code wrote 左へ or 下へ.
          for (const [key, dirKey, plain] of [['x', 'xDir', 'right'], ['y', 'yDir', 'up']]) {
            if (!node.inputs[key]) continue;
            if (key === 'y' && node.inputs.x) main.append(text('、'));
            if (value === 'GOTO' && node.fields[dirKey] === plain) main.append(text(plain === 'right' ? '右へ' : '上へ'));
            else main.append(viewCalls.fieldControl(node, fieldOf(dirKey)), text('へ'));
            quantity(key, '歩');
          }
        }
        main.append(text(value === 'GOTO' ? 'のばしょへ行く' : '動く'));
        if (value === 'MOVE_BY') {
          if (!node.inputs.y) extraControls.append(viewCalls.button('＋ たてにも動く', 'motion-leg-add-y', () => viewCalls.operate({ type: 'expression', parentId: node.id, input: 'y', node: steps(10) })));
          if (!node.inputs.x) extraControls.append(viewCalls.button('＋ よこにも動く', 'motion-leg-add-x', () => viewCalls.operate({ type: 'expression', parentId: node.id, input: 'x', node: steps(10) })));
          // Taking a leg off also sets its direction back to 右・上 (the code no longer writes it).
          const removeLeg = key => { const replacement = structuredClone(node); delete replacement.inputs[key]; replacement.fields[key === 'x' ? 'xDir' : 'yDir'] = key === 'x' ? 'right' : 'up'; return viewCalls.operate({ type: 'replace', id: node.id, node: replacement }); };
          if (both) extraControls.append(viewCalls.button('たてを外す', 'motion-leg-remove-y', () => removeLeg('y')),
            viewCalls.button('よこを外す', 'motion-leg-remove-x', () => removeLeg('x')));
        }
      } else if (value === 'MOVE') {
        main.append(viewCalls.fieldControl(node, fieldOf('direction')), text('へ')); quantity('args', '歩', 0);
        main.append(text(node.fields.direction === 'backward' ? '動く' : '進む'));
      } else if (value === 'GOTO_PART') {
        // The other is a part of the work (not the body's owner) or the mouse.
        const target = node.inputs.args[0];
        if (target?.schemaId === 'StringLiteral') {
          const owner = viewCalls.subjectName(node), names = [...(viewCalls.project()?.components || []).map(c => c.name).filter(name => name !== owner), 'マウス'];
          if (!names.includes(target.fields.value)) names.unshift(target.fields.value);
          const select = viewCalls.E('select', 'blockui-motion-target', null, { 'aria-label': schema.label + 'の 相手', 'data-block-id': node.id, 'data-blockui-action': 'motion-target' });
          for (const name of names) select.append(viewCalls.E('option', '', name === 'マウス' ? 'マウス' : '「' + name + '」', { value: name }));
          select.value = target.fields.value; select.disabled = viewVars.isLocked() || !!viewVars.options.readOnly;
          // The whole sentence is written again, so the mouse reads マウス (not 「マウス」) as the code writes it.
          viewCalls.listen(select, 'change', () => {
            const replacement = structuredClone(node);
            replacement.inputs.args[0].fields.value = select.value;
            viewCalls.operate({ type: 'replace', id: node.id, node: replacement });
          });
          main.append(select);
        } else main.append(renderInput(node, schema.inputs.find(s => s.key === 'args'), 0));
        main.append(text('のところへ行く'));
      } else if (value === 'SET_DIRECTION') {
        // The four screen directions read as the code writes them (画面の右を向く is 0度, 上 90, 左 180, 下 270), with the
        // side to choose; any other direction is 向きを〇度にする. なおす has 数で 決める (45度, a new block's direction).
        const arg = node.inputs.args?.[0], literal = arg?.schemaId === 'QuantityLiteral' && arg.inputs.value?.schemaId === 'NumberLiteral' ? arg.inputs.value : null;
        const sides = [['右', 0], ['上', 90], ['左', 180], ['下', 270]], side = literal && sides.find(([, degrees]) => degrees === literal.fields.value);
        const facing = degrees => { const replacement = structuredClone(node); replacement.inputs.args[0].inputs.value.fields.value = degrees; return viewCalls.operate({ type: 'replace', id: node.id, node: replacement }); };
        if (side) {
          const select = viewCalls.E('select', 'blockui-motion-side', null, { 'aria-label': schema.label + 'の 向き', 'data-block-id': node.id, 'data-blockui-action': 'motion-side' });
          for (const [word, degrees] of sides) select.append(viewCalls.E('option', '', word, { value: String(degrees) }));
          select.value = String(side[1]); select.disabled = viewVars.isLocked() || !!viewVars.options.readOnly;
          viewCalls.listen(select, 'change', () => { if (!facing(Number(select.value)).ok) select.value = String(side[1]); });
          main.append(text('画面の'), select, text('を向く'));
          extraControls.append(viewCalls.button('数で 決める', 'motion-side-degrees', () => facing(45)));
        } else { main.append(text('向きを')); quantity('args', '度', 0); main.append(text('にする')); }
      } else {
        main.append(text(value === 'TURN_RIGHT' ? '右に' : '左に')); quantity('args', '度', 0); main.append(text('回る'));
      }
      if (extraControls.childElementCount) main.append(extra);
    }
    function renderPhrase(node, schema, main) {
      if (
        ['NumberLiteral', 'StringLiteral', 'BooleanLiteral', 'CommentLine'].includes(schema.kind)
      ) {
        if (schema.kind === 'StringLiteral') main.append(viewCalls.E('span', 'blockui-punctuation', '「'));
        if (schema.kind === 'CommentLine') main.append(viewCalls.E('span', 'blockui-punctuation', '※'));
        for (const field of schema.fields) main.append(viewCalls.fieldControl(node, field));
        if (schema.kind === 'StringLiteral') main.append(viewCalls.E('span', 'blockui-punctuation', '」'));
        return;
      }
      if (['VariableRead', 'TargetReference'].includes(schema.kind)) {
        for (const key of ['qualifier', 'name'])
          main.append(
            viewCalls.fieldControl(
              node,
              schema.fields.find((f) => f.key === key),
            ),
          );
        return;
      }
      const parts = viewCalls.shownPhrase(schema, node);
      if (parts) {
        const displayParts = [...parts];
        // A value whose unit the sentence fixes shows that unit itself (unitValue, E-02), so the phrase does not repeat
        // it: 50 ％ にする, 50 ％から 150 ％の どれか.
        const unitOf = part => part && typeof part === 'object' && part.slot ? viewCalls.roleUnit(node, part.slot.key, part.index) : null;
        for (let i = 0; i < displayParts.length; i++) {
          const unit = unitOf(displayParts[i]), following = displayParts[i + 1];
          if (unit && typeof following === 'string' && following.startsWith(unit)) displayParts[i + 1] = following.slice(unit.length);
        }
        for (const part of displayParts)
          main.append(...(
            typeof part === 'string'
              ? (part ? [viewCalls.E('span', 'blockui-phrase-text', part)] : [])
              : part.lineBreak
                ? [viewCalls.E('span', 'blockui-phrase-break')]
              : part.field
                ? [viewCalls.fieldControl(node, part.field)]
                : unitOf(part) ? unitValue(node, part.slot.key, part.index, unitOf(part))
                  : [renderInput(node, part.slot, part.index)]
          ));
        return;
      }
      main.append(viewCalls.E('span', 'blockui-phrase-text', schema.label));
      for (const field of schema.fields.filter((f) => f.key !== 'hasElse'))
        main.append(viewCalls.fieldControl(node, field));
      for (const slot of schema.inputs) if(node.inputs[slot.key]!==undefined)main.append(renderInput(node, slot));
    }
    function renderNode(node) {
      const schema = viewCalls.schemaOf(node);
      if (!schema) throw Error('あかりが 知らないブロックです: ' + node.schemaId);
      const info = viewVars.index.get(node.id) || {},
        box = viewCalls.E(
          'article',
          'blockui-node blockui-' + schema.category + (schema.bodies.length ? ' blockui-container' : ''),
          null,
          {
            'data-block-id': node.id,
            'data-schema-id': schema.id,
            'data-palette': schema.palette,
            'data-palette-tone': blockPaletteGroup(schema),
            'data-collapsed': viewVars.collapsed.has(node.id),
            tabindex: '0',
            'aria-label': schema.label,
          },
        );
      if (['statement', 'expression'].includes(schema.category))
        viewCalls.attachShape(box, blockShapeKind(schema));
      const head = viewCalls.E('div', 'blockui-node-head');
      head.append(viewCalls.E('strong', 'blockui-node-title', schema.label), nodeTools(node, info));
      if(schema.category==='script'){
        const heading=node.fields.heading,actor=heading?.actorRef?.kind==='named'?heading.actorRef.name:viewCalls.project()?.components.find(c=>c.id===viewCalls.context().targetId)?.name||viewCalls.project()?.stage?.name;
        head.querySelector('strong').textContent=`${actor}・${viewCalls.headingTitle(heading?.event||viewCalls.context().event||'start',heading?heading.filter:viewCalls.context().filter)}`;
      }
      box.append(head);
      box.classList.toggle('blockui-selected', viewVars.selected === node.id);
      viewCalls.listen(box, 'click', (event) => {
        if (event.target.closest('.blockui-node') === box) {
          const active=viewVars.doc.activeElement,focused=active?.closest('.blockui-node');
          // Expanding an inline field on focus can put its ancestor under the
          // released pointer. Keep the field the user actually entered selected.
          if(focused&&focused!==box&&box.contains(focused)&&active.matches('input,textarea'))
            viewCalls.selection(focused.dataset.blockId);
          else {
            viewCalls.selection(node.id);
            // A press on a block's words gives the block the focus, so Delete and Backspace act on it (E-05).
            if (!event.target.closest('input,textarea,select,button,summary,label,a,[contenteditable]')) box.focus({ preventScroll: true });
          }
        }
      });
      const line = viewCalls.session()?.nodeMap?.get?.(node.id)?.sourceSpan?.startLine;
      const diagnostics = schema.category === 'statement' ? viewVars.diagnosticsByLine.get(line) || [] : [];
      if (diagnostics.length) {
        box.classList.add('blockui-diagnostic');
        const ul = viewCalls.E('ul', 'blockui-node-diagnostics');
        for (const d of diagnostics) { const item = viewCalls.E('li', 'diagnostic-help', childDiagnosticText(d, viewCalls.session()?.sourceText, viewCalls.project())); appendDiagnosticDetails(item, d); ul.append(item); }
        box.append(ul);
        const warning = viewCalls.button(
          '⚠ たしかめる',
          'diagnostics',
          () => {
            viewCalls.selection(node.id);
            ul.classList.toggle('blockui-open');
          },
          {
            'aria-label': diagnostics.length + 'か所の 直す手がかりを見せる',
            title: diagnostics.map((d) => childDiagnosticText(d, viewCalls.session()?.sourceText, viewCalls.project())).join('\n'),
          },
        );
        head.prepend(warning);
      } else if (schema.category === 'statement' && (viewVars.noticesByLine.get(line) || []).length && viewVars.lineNodes.get(line) === node.id) {
        // A notice says how a correct sentence runs (P11 (d)): blue and ⓘ, never the orange of a mistake. Its text opens
        // under the block, with the rewrite it names when it has one. Its look (the blue outline, the mark, the list that
        // .blockui-open shows) is in editor.css, as for the diagnostics list.
        const notices = viewVars.noticesByLine.get(line);
        box.classList.add('blockui-notice');
        const ul = viewCalls.E('ul', 'blockui-node-notices', null, { 'data-block-id': node.id });
        for (const d of notices) {
          const item = viewCalls.E('li', 'notice-help', d.message);
          for (const proposal of viewVars.options.onNoteProposal ? d.proposals || [] : []) {
            if (typeof proposal?.source !== 'string') continue;
            item.append(' ', viewCalls.button(proposal.label || proposal.source, 'notice-fix', () => viewVars.options.onNoteProposal(d, proposal),
              { title: proposal.source, 'data-note-fix': '' }));
          }
          ul.append(item);
        }
        box.append(ul);
        const mark = viewCalls.button('ⓘ 知らせ', 'notices', () => { viewCalls.selection(node.id); mark.setAttribute('aria-expanded', String(ul.classList.toggle('blockui-open'))); viewCalls.scheduleGeometry(); },
          { 'aria-label': notices.length + 'この 知らせを 見せる', 'aria-expanded': 'false', title: notices.map(d => d.message).join(' ／ ') });
        head.prepend(mark);
      }
      const content = viewCalls.E('div', 'blockui-node-content'),
        main = viewCalls.E('div', 'blockui-node-main');
      content.hidden = viewVars.collapsed.has(node.id);
      if (schema.category === 'script') {
        // The body of a block made by the child has no trigger, and no continuing rule is written there (S305): neither
        // いつ動く？ nor the offer of a rule, and only rules written there anyway are shown.
        const definition = !!viewCalls.context().definitionKind;
        for (const field of definition ? [] : schema.fields) {
          const edit = viewCalls.E('details', 'blockui-heading-editor');
          edit.append(viewCalls.E('summary', '', 'いつ動く？'), viewCalls.fieldControl(node, field));
          main.append(edit);
        }
        const ruleSlot = schema.inputs.find(slot => slot.key === 'rules');
        if (ruleSlot && !(definition && !node.inputs.rules?.length)) {
          const rules = node.inputs.rules || [], list = viewCalls.E('details', 'blockui-rules');
          list.open = rules.length > 0;
          list.append(viewCalls.E('summary', '', rules.length ? 'つづけて動くルール（' + rules.length + 'こ）' : '＋ キーを おす間など、つづけて動かす'));
          for (const [i, rule] of rules.entries()) {
            const row = viewCalls.E('div', 'blockui-rule-row'); row.append(renderNode(rule));
            // The same words as a block's own tools (F-19, F-23): この ルールを けす, ↑ まえへ, ↓ あとへ.
            row.append(viewCalls.button('この ルールを けす', 'rule-remove', () => viewCalls.operate({ type: 'variadic-remove', parentId: node.id, input: 'rules', index: i })));
            if (i) row.append(viewCalls.button('↑ まえへ', 'rule-up', () => viewCalls.operate({ type: 'variadic-move', parentId: node.id, input: 'rules', index: i, toIndex: i - 1 })));
            if (i + 1 < rules.length) row.append(viewCalls.button('↓ あとへ', 'rule-down', () => viewCalls.operate({ type: 'variadic-move', parentId: node.id, input: 'rules', index: i, toIndex: i + 2 })));
            list.append(row);
          }
          const add = viewCalls.button('＋ つづけて動くルール', 'rule-add', () => viewCalls.operate({ type: 'variadic-insert', parentId: node.id, input: 'rules', index: rules.length,
            node: viewCalls.newRule() }));
          add.disabled = viewVars.isLocked() || !!viewVars.options.readOnly || rules.length >= ruleSlot.maxItems;
          list.append(add); main.append(list);
        }
        content.append(main);
      } else {
        // Actor, unit and argument names are roles outside the old phrase cache.
        // Render every role explicitly so cached legacy phrases cannot hide one.
        const field = key => viewCalls.fieldControl(node, schema.fields.find(f => f.key === key));
        const slot = key => renderInput(node, schema.inputs.find(s => s.key === key));
        if(['BinaryExpression','CompareExpression','LogicalExpression'].includes(schema.kind)){
          const operator=viewCalls.E('select','blockui-operator',null,{'aria-label':'計算や くらべ方の しるしだけを かえる'});
          // ＾ is offered at くわしく only (F-21), unless the block already uses it.
          for(const candidate of BLOCK_SCHEMAS.filter(s=>s.kind===schema.kind&&(s.id===schema.id||document.body.dataset.uiLevel==='advanced'||!ADVANCED_ONLY_SCHEMA_IDS.has(s.id))))operator.append(viewCalls.E('option','',candidate.label,{value:candidate.id}));
          operator.value=schema.id;operator.disabled=viewVars.isLocked()||viewVars.options.readOnly;
          viewCalls.listen(operator,'change',()=>viewCalls.operate({type:'operator',id:node.id,schemaId:operator.value}));
          if(schema.kind==='CompareExpression')main.append(slot('left'),viewCalls.E('span','blockui-phrase-text','が'),slot('right'),operator);
          else main.append(slot('left'),operator,slot('right'));
        } else if(schema.kind==='RepeatCount'||schema.kind==='Say'||schema.kind==='WaitTime'){
          const {extra,extraControls}=viewCalls.extraDisclosure(node,schema.label+'の数・計算・時間を なおす');
          const actor=schema.fields.find(f=>f.key==='actorRef');if(actor)main.append(viewCalls.fieldControl(node,actor));
          // 2 秒, 3 回: the unit is text (E-02); 計算を入れる (with the value's tools) puts a calculation in the number's place.
          // The speech choice names 計算の答えを話す only for a calculation already there (F2-17): 計算を入れる is the one way in.
          const numberSlot=(key,unit)=>{
            main.append(...unitValue(node,key,undefined,unit));
          };
          if(schema.kind==='Say'){
            main.append(slot('value'));
            const localContext=viewCalls.subjectContext(node),choices=hintCandidates(viewCalls.project(),localContext.targetId,{source:viewCalls.session()?.sourceText||'',...localContext}).filter(h=>h.id.startsWith('read:')&&h.binding?.kind!=='list'&&h.enabled);
            const data=viewCalls.E('select','blockui-speech-data',null,{'aria-label':'話す 文字か、へんすうの 中身を えらぶ'});
            const current=node.inputs.value,
              shown=current.schemaId==='StringLiteral'?'literal':String(choices.findIndex(h=>h.binding.name===current.fields.name&&h.binding.qualifier===current.fields.qualifier));
            data.append(viewCalls.E('option','','文字を話す',{value:'literal'}));
            // A calculation is put in with 「計算を入れる」 (F2-17): this choice only names one that is there.
            if(shown==='-1')data.append(viewCalls.E('option','','計算の答えを話す',{value:'expression'}));
            for(const [i,hint]of choices.entries())data.append(viewCalls.E('option','',hint.text+'の いまの中身',{value:String(i)}));
            data.value=shown;
            if(!data.value)data.value='expression';data.disabled=viewVars.isLocked()||viewVars.options.readOnly;
            viewCalls.listen(data,'change',()=>{
              if(data.value==='expression'){viewCalls.chooseDestination({parentId:node.id,input:'value'});return;}
              const replacement=data.value==='literal'?createBlock('StringLiteral'):nodeForSearchHint(choices[Number(data.value)],viewCalls.project(),localContext);
              if(data.value==='literal')replacement.fields.value=current.fields.name||current.fields.value||'';
              viewCalls.operate({type:'expression',parentId:node.id,input:'value',node:replacement});
            });if(data.options.length>1)extraControls.append(data);
            // The words of its code (E-14): 「こんにちは」と 2秒 話す for words, 点数を 2秒 話す for a value.
            if(node.inputs.seconds){main.append(viewCalls.E('span','blockui-phrase-text',node.inputs.value?.schemaId==='StringLiteral'?'と':'を'));numberSlot('seconds','秒');main.append(viewCalls.E('span','blockui-phrase-text','話す'));extraControls.append(viewCalls.button('時間を外す','speech-untimed',()=>viewCalls.operate({type:'optional-input-remove',parentId:node.id,input:'seconds'})));}
            else {main.append(viewCalls.E('span','blockui-phrase-text',viewCalls.sayParticle(node.inputs.value)+'言う'));extraControls.append(viewCalls.button('秒数を決めて話す','speech-timed',()=>{const seconds=createBlock('NumberLiteral');seconds.fields.value=2;return viewCalls.operate({type:'expression',parentId:node.id,input:'seconds',node:seconds});}));}
          }else {numberSlot(schema.kind==='RepeatCount'?'count':'seconds',schema.kind==='RepeatCount'?'回':'秒');main.append(viewCalls.E('span','blockui-phrase-text',schema.kind==='RepeatCount'?'くり返す':'待つ'));}
          if(extraControls.childElementCount)main.append(extra);
        } else if (node.schemaId === 'UnaryExpression:NEG' && node.inputs.value?.schemaId === 'NumberLiteral') {
          const child = node.inputs.value, numberField = BLOCK_SCHEMA_BY_ID.get('NumberLiteral').fields.find(f => f.key === 'value'),
            control = viewCalls.fieldControl(child, numberField), input = control.querySelector('input');
          if (input) { input.value = '－' + decimalSource(child.fields.value); input.dataset.signedParentId = node.id; input.dataset.signedEdit = 'true'; }
          main.append(control);
        } else if (schema.kind === 'QuantityLiteral') {
          // A quantity in a slot with no fixed unit (へんすうに 入れる数, くらべる数 …): the unit is chosen only at くわしく,
          // where 単位なし takes it off (E-02); the other levels show it as text.
          const inner = node.inputs.value;
          main.append(inner?.schemaId === 'NumberLiteral' || inner?.schemaId === 'Hole:expression'
            ? flatNumber(inner, { parentId: node.id, input: 'value' }) : slot('value'));
          if (document.body.dataset.uiLevel === 'advanced' && !viewVars.options.readOnly) {
            const unit = viewCalls.E('select', 'blockui-unit-choice', null, { 'aria-label': 'たんい', 'data-block-id': node.id, 'data-blockui-field': 'unit' });
            for (const [v, label] of [...['歩', '度', '秒', '回', '番目', '点', '個', '％', 'Hz'].map(u => [u, u]), ['', '単位なし']])
              unit.append(viewCalls.E('option', '', label, { value: v }));
            unit.value = node.fields.unit; unit.disabled = viewVars.isLocked();
            viewCalls.listen(unit, 'change', () => {
              const result = unit.value ? viewCalls.operate({ type: 'field', id: node.id, key: 'unit', value: unit.value })
                : viewCalls.operate({ type: 'replace', id: node.id, node: viewCalls.copy(node.inputs.value) });
              if (!result.ok) unit.value = node.fields.unit;
            });
            const wrap = viewCalls.E('label', 'blockui-field', null, { 'data-field-type': 'unit' });
            wrap.append(viewCalls.E('span', 'blockui-field-label', 'たんい'), unit);
            main.append(wrap);
          } else main.append(viewCalls.E('span', 'blockui-phrase-text blockui-unit-text', node.fields.unit, { 'data-unit': node.fields.unit }));
        }
        else if (schema.kind === 'UnitlessRead') main.append(slot('value'), viewCalls.E('span', '', 'の数だけ'));
        else if (schema.kind === 'ActorQualifiedRead') main.append(field('actorRef'), viewCalls.E('span', '', 'の'), slot('value'));
        else if (schema.kind === 'CloneCommand' && ['CREATE_SELF','CREATE_TARGET'].includes(schema.discriminator?.value)) {
          const actor=schema.fields.find(f=>f.key==='actorRef');if(actor)main.append(viewCalls.fieldControl(node,actor));
          if(schema.discriminator.value==='CREATE_TARGET')main.append(slot('args'));else main.append(viewCalls.E('span','','自分'));
          main.append(viewCalls.E('span','','のコピーを'));
          if(node.inputs.count)main.append(slot('count'),viewCalls.E('span','','体'));
          main.append(viewCalls.E('span','','作る'));
        }
        else if (schema.kind === 'ContinuousRule') {
          main.style.flexWrap = 'wrap'; main.style.whiteSpace = 'normal';
          // The same words as its code (E-14): 「右」キーがおされているあいだ、右へ1秒に200歩の速さで動き続ける.
          if (node.fields.actorRef?.kind === 'named') main.append(field('actorRef'), viewCalls.E('span', 'blockui-phrase-text', '、'));
          main.append(slot('condition'), viewCalls.E('span', 'blockui-phrase-text', 'あいだ、'), field('direction'), viewCalls.E('span', 'blockui-phrase-text', 'へ'),
            ...unitValue(node, 'seconds', undefined, '秒'), viewCalls.E('span', 'blockui-phrase-text', 'に'),
            ...unitValue(node, 'distance', undefined, '歩'), viewCalls.E('span', 'blockui-phrase-text', 'の速さで動き続ける'));
          for (const input of main.querySelectorAll(':scope > .blockui-input-slot:not(.blockui-flat-value)')) {
            input.style.flexShrink = '0'; input.style.flexDirection = 'column';
            const head = input.querySelector(':scope > .blockui-slot-head');
            if (head) { head.style.position = 'static'; head.style.minWidth = '0'; }
          }
        }
        // The same words as its code; it always waits with the whole flow, so it has no subject to choose.
        else if (schema.kind === 'WaitBroadcastGroup') main.append(field('broadcastRef'), viewCalls.E('span', '', 'で始まったことが 全部終わるまで待つ'));
        else if (schema.kind === 'BuiltinCall' && schema.discriminator?.value === '乱数' && node.inputs.args?.length === 2) {
          // Read as the code writes it: 1から6のどれか.
          const args = schema.inputs.find(s => s.key === 'args');
          main.append(renderInput(node, args, 0), viewCalls.E('span', '', 'から'), renderInput(node, args, 1), viewCalls.E('span', '', 'のどれか'));
        }
        // The move blocks and the turns read like their code (LANGUAGE.md 動きの文). 歩・秒・度 are text, with no unit to
        // choose. なおす adds or removes the time (〇秒かけて、) and, on いまのばしょから動く, the second direction.
        else if (schema.kind === 'MotionCommand' && ['GOTO', 'MOVE_BY', 'MOVE', 'GOTO_PART', 'TURN_RIGHT', 'TURN_LEFT', 'SET_DIRECTION'].includes(schema.discriminator?.value))
          renderMotionBlock(node, schema, main);
        else if (schema.draftOnly) {
          box.classList.add('blockui-draft-hole');
          const info = viewVars.index.get(node.id), label = node.fields.label || schema.label,
            holeLabel = () => viewCalls.E('span', 'blockui-hole-label', '〔' + label + 'を えらぶ〕');
          // The hole is one control with one wording: 〔くり返すことを えらぶ〕 (F2-18).
          const holeButton = (action, aria) => { const b = viewCalls.button('', action, () => viewCalls.chooseDestination(viewCalls.listLocation(info)), { 'aria-label': aria }); b.append(holeLabel()); return b; };
          if (schema.category === 'statement' && info?.body)
            main.append(holeButton('hole-select-statement', label + 'に ブロックを入れる'));
          else if (schema.category === 'expression' && info?.input)
            main.append(holeButton('hole-select-expression', label + 'の中身を えらぶ'));
          else if (schema.category === 'target' && info?.input) {
            main.append(holeLabel());
            const picker = viewCalls.E('select', '', null, { 'aria-label': label + 'を えらぶ', 'data-blockui-hole-target': node.id });
            picker.append(viewCalls.E('option', '', 'かえる ものを えらぶ', { value: '' }));
            for (const name of viewCalls.namesFor(node, { type: 'name' })) picker.append(viewCalls.E('option', '', name, { value: name }));
            picker.disabled = viewVars.isLocked();
            viewCalls.listen(picker, 'change', () => {
              if (!picker.value) return;
              const target = createBlock('TargetReference', { idPrefix: viewVars.viewId }); target.fields.name = picker.value;
              viewCalls.operate({ type: 'expression', ...viewCalls.listLocation(info), node: target });
            });
            main.append(picker);
            if(viewVars.options.onData)main.append(viewCalls.button('＋ へんすう・リストを作る','create-data',()=>viewVars.options.onData()));
          } else main.append(holeLabel());
        } else {
          // Existing phrase/alias presentation is retained. Optional new roles
          // are explicit controls without being hidden by cached legacy text.
          const parts = viewCalls.phrase(schema);
          if (parts && !['NumberLiteral', 'StringLiteral', 'BooleanLiteral', 'CommentLine', 'VariableRead', 'TargetReference'].includes(schema.kind)) {
            const actor = schema.fields.find(f => f.key === 'actorRef');
            if (actor) main.append(viewCalls.fieldControl(node, actor));
            renderPhrase(node, schema, main);
            // A 「〜の合図を送る」 gets its link to the wait after it (broadcastRef) from the code that follows it; it is not
            // a word of its sentence, so the block shows no field for it (E-14).
            for (const f of schema.fields.filter(f => f.type === 'reference' && !(schema.kind === 'Broadcast' && f.key === 'broadcastRef')))
              main.append(viewCalls.fieldControl(node, f));
            // How the values are handed over (書いた じゅんに / 名前を つけて) is not a word of the sentence: it is in the
            // 「…」 after it, so the placed block reads like its palette face and its code (E-14).
            const handOver = schema.fields.find(f => f.type === 'argument-names');
            if (handOver) {
              let extra = main.querySelector(':scope > .blockui-extra');
              if (!extra) { extra = viewCalls.extraDisclosure(node, schema.label + 'の わたし方を かえる').extra; main.append(extra); }
              extra.querySelector(':scope > .blockui-extra-controls').append(viewCalls.fieldControl(node, handOver));
            }
          } else renderPhrase(node, schema, main);
        }
        addValueToolsToExtra(node, box, main);
        if (['statement', 'expression'].includes(schema.category)) {
          main.dataset.blockuiDrag = 'node';
          main.dataset.blockId = node.id;
        }
        if(schema.kind==='IfStatement'&&!node.fields.hasElse&&!viewVars.options.readOnly)main.append(viewCalls.button('＋「そうでなければ」を 入れる','else-add',()=>{
          const result=viewCalls.operate({type:'else',id:node.id,enabled:true});
          if(result.ok){const parent=viewVars.index.get(node.id)?.node,hole=parent?.bodies.elseBody.find(n=>n.schemaId==='Hole:statement');if(hole)viewCalls.focus({id:hole.id});}
        }));
        content.append(viewCalls.faceRuby(main));
      }
      for (const slot of schema.bodies) {
        const body = statementBody(node, slot);
        if (body) content.append(body);
      }
      if(schema.category==='script'&&node.inputs.units?.length){
        const units=viewCalls.E('section','blockui-document-units');units.setAttribute('aria-label','同じ 本文の ほかの きっかけ');
        for(const unit of node.inputs.units)units.append(renderNode(unit));
        content.append(units);
      }
      const annotations = schema.annotations.filter(
        (a) => a.editable !== false && (!a.when || node.fields[a.when]),
      );
      if (annotations.length) {
        const details = viewCalls.E('details', 'blockui-annotations'),
          has = annotations.some((a) => node.annotations[a.key]);
        details.classList.toggle('blockui-has-comment', has);
        details.open = viewVars.openAnnotations.has(node.id);
        details.append(
          viewCalls.E(
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
        for (const annotation of annotations) details.append(viewCalls.fieldControl(node, annotation, true));
        viewCalls.listen(details, 'toggle', () => {
          if (!details.isConnected) return;
          details.open ? viewVars.openAnnotations.add(node.id) : viewVars.openAnnotations.delete(node.id);
          viewCalls.rememberViewState();
        });
        content.append(details);
      }
      box.append(content);
      return box;
    }
    function render({ force = false } = {}) {
      if (viewVars.destroyed || viewVars.committing || viewVars.rendering) return;
      if (viewVars.deferredFocus?.isConnected && viewVars.root.contains(viewVars.deferredFocus)) {
        viewVars.deferredRender = true;
        viewCalls.syncDeferredTree();
        return;
      }
      viewVars.deferredFocus = null;
      viewVars.deferredRender = false;
      viewVars.rendering = true;
      try {
        return renderView(force);
      } finally {
        viewVars.rendering = false;
      }
    }
    function renderView(force) {
      viewVars.faceSymbols = null;
      const s = viewCalls.session(),
        nextSignature = [
          s?.ownerKey,
          s?.sourceRevision,
          s?.contextRevision,
          s?.mode,
          !!viewVars.isLocked(),
          (s?.notices || []).map(d => d.line + ':' + d.code + ':' + d.message).join(','),
        ].join('|');
      viewVars.root.dataset.locked = String(!!viewVars.isLocked());
      // 作業台を広く cannot be used while the work runs (はじめて shows the blocks then): its place stays, as the run bar's
      // buttons do (final call 21).
      if (viewVars.wide) viewVars.wide.style.visibility = viewVars.isLocked() ? 'hidden' : '';
      if (viewVars.drag && nextSignature !== viewVars.signature) viewCalls.cancelDrag();
      if (viewVars.pending) {
        viewCalls.updateControls();
        if (viewVars.pending.error) viewCalls.announce(viewVars.pending.error, true);
        return;
      }
      if (!force && nextSignature === viewVars.signature && viewCalls.getTree(s) === viewVars.tree) {
        viewCalls.updateControls();
        return;
      }
      if (viewVars.replacement && nextSignature !== viewVars.signature) {
        viewVars.replacement = null;
        viewVars.moving = null;
        viewCalls.notifyPending();
      }
      if (nextSignature !== viewVars.signature) viewVars.moving = null;
      // The selected block's 「ほかの そうさ」 stays open when the view is drawn again for the same text: the work check's
      // notices arrive a moment after a change (P11 (d)), and a drawing put off while a field had the keys comes when the
      // press on 「ほかの そうさ」 takes them; neither may close it under the child's press. Its own たたむ and メモ close it.
      const nextTextKey = [s?.ownerKey, s?.sourceRevision, s?.contextRevision].join('|'),
        keptMenu = viewVars.textKey === nextTextKey
          ? viewVars.workspace.querySelector('.blockui-node.blockui-selected > .blockui-node-head .blockui-actions[open]')?.closest('.blockui-node')?.dataset.blockId : null,
        // The control of that menu that has the keys (「ほかの そうさ」 itself or one of its items) gets them back.
        menuKey = keptMenu && viewVars.doc.activeElement?.closest?.('.blockui-actions[open]') ? viewVars.doc.activeElement.dataset?.blockuiAction : null;
      viewVars.textKey = nextTextKey;
      const ownerChanged = s?.ownerKey !== viewVars.displaySession?.ownerKey,
        scroll = ownerChanged
          ? { top: s?.scrollState?.blockTop || 0, left: s?.scrollState?.blockLeft || 0 }
          : { top: viewVars.workspace.scrollTop, left: viewVars.workspace.scrollLeft },
        active = viewVars.doc.activeElement,
        focusKey = !ownerChanged && viewVars.root.contains(active) ? active?.dataset?.focusKey : null,
        focusNode =
          !ownerChanged && viewVars.root.contains(active)
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
        viewCalls.rememberViewState();
        viewVars.zoom = blockZoomCore(s?.scrollState?.blockZoom || 1);
        viewVars.destination = null;
        viewVars.moving = null;
        viewVars.bodyPages.clear();
        viewVars.bodyExtraPages.clear();
        viewVars.inputPages.clear();
        viewVars.collapsed.clear();
        viewVars.openAnnotations.clear();
        for (const entry of s?.scrollState?.blockBodyPages || []) viewVars.bodyPages.set(...entry);
        for (const [key, pages] of s?.scrollState?.blockExtraPages || [])
          viewVars.bodyExtraPages.set(key, new Set(pages));
        for (const entry of s?.scrollState?.blockInputPages || []) viewVars.inputPages.set(...entry);
        for (const id of s?.scrollState?.blockCollapsed || []) viewVars.collapsed.add(id);
        for (const id of s?.scrollState?.blockOpenAnnotations || []) viewVars.openAnnotations.add(id);
        viewVars.diagnosticPage = 0;
        viewVars.diagnosticsOpen = false;
      }
      if (s !== viewVars.displaySession || nextSignature !== viewVars.signature) viewVars.selected = s?.blockSelection || '';
      if (ownerChanged) viewVars.openEditors.clear();
      viewVars.displaySession = s;
      viewVars.signature = nextSignature;
      if (viewVars.cacheSignature !== nextSignature) {
        viewVars.cacheSignature = nextSignature;
        viewVars.availabilityCache.clear();
      }
      const previousTree = viewVars.tree;
      viewVars.tree = viewCalls.getTree(s);
      if (viewVars.tree !== previousTree) viewVars.availabilityCache.clear();
      viewVars.index = viewVars.tree
        ? typeof buildBlockIndex === 'function'
          ? buildBlockIndex(viewVars.tree)
          : viewCalls.localIndex(viewVars.tree)
        : new Map();
      viewVars.lineNodes = new Map();
      viewVars.highlightedId = null;
      viewVars.diagnosticsByLine = new Map();
      viewVars.noticesByLine = new Map();
      // The notice marks are edit-screen controls: the run screen shows none (P11 (d), reconciled).
      if (!viewVars.isLocked()) for (const d of s?.notices || []) if (d?.line && (!d.where || d.where === s?.ownerKey)) {
        if (!viewVars.noticesByLine.has(d.line)) viewVars.noticesByLine.set(d.line, []);
        viewVars.noticesByLine.get(d.line).push(d);
      }
      for (const [id, entry] of viewVars.index) {
        const line = s?.nodeMap?.get?.(id)?.sourceSpan?.startLine;
        if (line && viewCalls.schemaOf(entry.node)?.category === 'statement' && !viewVars.lineNodes.has(line))
          viewVars.lineNodes.set(line, id);
      }
      for (const d of s?.diagnostics || [])
        if (!d.where || d.where === s?.ownerKey) {
          if (!viewVars.diagnosticsByLine.has(d.line)) viewVars.diagnosticsByLine.set(d.line, []);
          viewVars.diagnosticsByLine.get(d.line).push(d);
        }
      viewCalls.mapElseBranches();
      if (s?.blockSelectionLocation) {
        const loc = s.blockSelectionLocation,
          line = viewVars.branchSourceLines.get(loc.id + ':' + loc.body);
        s.blockSelectionLocation =
          loc.id === viewVars.selected &&
          (!loc.key || loc.key === s.ownerKey) &&
          loc.body === 'elseBody' &&
          line
            ? { ...loc, key: s.ownerKey, line }
            : null;
      }
      if (viewVars.destination && !viewVars.index.has(viewVars.destination.parentId)) viewVars.destination = null;
      if (viewVars.selected && !viewVars.index.has(viewVars.selected)) viewVars.selected = '';
      viewVars.bodyObserver?.disconnect();
      viewVars.fontStyleObserver?.disconnect();
      viewVars.world.replaceChildren();
      if (!viewVars.tree) {
        viewVars.world.append(
          viewCalls.E(
            'p',
            'blockui-empty',
            'この 本文の 書き方を たしかめて ください。コードは そのまま のこって います。',
          ),
        );
      } else {
        const diagnostics = viewCalls.diagnosticSummary();
        if (diagnostics) viewVars.world.append(diagnostics);
        viewVars.world.append(viewCalls.eventHat());
        try {
          viewVars.world.append(renderNode(viewVars.tree));
        } catch (error) {
          viewVars.world.append(viewCalls.E('p', 'blockui-error', viewCalls.errorText(error)));
        }
      }
      viewCalls.renderPalette();
      viewCalls.renderReplacement();
      viewCalls.updateControls();
      viewCalls.updateGeometry();
      viewCalls.observeMore();
      viewCalls.selection(viewVars.selected, s?.blockSelectionLocation || null);
      const keptOpen = keptMenu && keptMenu === viewVars.selected
        ? [...viewVars.workspace.querySelectorAll('.blockui-node.blockui-selected > .blockui-node-head .blockui-actions')].find(m => m.closest('.blockui-node')?.dataset.blockId === keptMenu) : null;
      if (keptOpen) keptOpen.open = true;
      viewCalls.lightEmptyValue();
      viewVars.workspace.scrollTop = scroll.top;
      viewVars.workspace.scrollLeft = scroll.left;
      viewCalls.rememberViewState();
      viewCalls.applyHighlight();
      viewVars.options.onPresentation?.();
      if (focusKey) {
        const field = [...viewVars.workspace.querySelectorAll('[data-focus-key]')].find(
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
        const n = [...viewVars.workspace.querySelectorAll('.blockui-node')].find(
          (n) => n.dataset.blockId === focusNode,
        );
        n?.focus({ preventScroll: true });
      }
      if (keptOpen && menuKey) keptOpen.querySelector('[data-blockui-action="' + menuKey + '"]')?.focus({ preventScroll: true });
      // A control not drawn again (its block made anew by もとに もどす) leaves the keys in the block view (Y2-06).
      if ((focusKey || focusNode) && (!viewVars.doc.activeElement || viewVars.doc.activeElement === viewVars.doc.body)) viewCalls.keepKeys();
    }
    function previewDrag(point) {
      if (!viewVars.drag) return;
      for (const n of viewVars.root.querySelectorAll('.blockui-drop-preview,.blockui-drop-invalid'))
        n.classList.remove('blockui-drop-preview', 'blockui-drop-invalid');
      const schema = viewVars.drag.schemaId
          ? BLOCK_SCHEMA_BY_ID.get(viewVars.drag.schemaId)
          : viewCalls.schemaOf(viewVars.index.get(viewVars.drag.id)?.node),
        pr = viewVars.palette.getBoundingClientRect(),
        overPalette = !!pr.width && point.clientX >= pr.left && point.clientX <= pr.right && point.clientY >= pr.top && point.clientY <= pr.bottom;
      // Carried back to the block list, a sentence of the workspace is deleted when let go (E-05).
      viewVars.drag.deleteZone = !!viewVars.drag.id && overPalette && schema?.category === 'statement';
      viewVars.palette.classList.toggle('blockui-delete-zone', viewVars.drag.deleteZone);
      const element = viewVars.drag.deleteZone ? null : viewCalls.dragCandidate(point),
        location = viewCalls.locationFromElement(element);
      let valid = !!location && schema?.category === (location.body ? 'statement' : 'expression'),
        reason = location
          ? 'ここには おけないよ'
          : '';
      if (valid && viewVars.drag.id) {
        const parent = viewVars.index.get(location.parentId);
        valid = !viewCalls.carriedIds(viewVars.drag).some(id => location.parentId === id || parent?.ancestors.includes(id));
        if (!valid) reason = '自分の 中には 入れられないよ';
      }
      if (valid && viewVars.drag.schemaId) {
        const candidate = viewCalls.availability(viewVars.drag.schemaId, location, viewVars.drag.candidate?.candidateNode);
        valid = candidate.enabled;
        if (!valid) reason = candidate.reason;
      }
      const node = viewVars.drag.id ? viewVars.index.get(viewVars.drag.id)?.node : null,
        wraps = valid && location?.body && !viewVars.drag.run ? viewCalls.wrapCount(schema, node, location, viewVars.drag.id) : 0;
      if (valid && viewVars.drag.id && schema.category === 'statement')
        try {
          prepareBlockEdit(
            { ...viewCalls.session(), pendingEdit: null },
            { type: viewVars.drag.run ? 'move-run' : wraps ? 'wrap' : 'move', id: viewVars.drag.id, ...location },
          );
        } catch (e) {
          valid = false;
          reason = viewCalls.errorText(e);
        }

      if (valid) reason = !location.body ? 'ここの 中身を 入れかえる' : wraps ? '下の ' + wraps + 'この ブロックを 中に 入れる' : 'ここに つなぐ';
      viewVars.drag.location = location;
      viewVars.drag.target = element;
      viewVars.drag.valid = valid;
      viewVars.drag.wraps = wraps;
      if (element) element.classList.add(valid ? 'blockui-drop-preview' : 'blockui-drop-invalid');
      viewVars.ghost?.classList.toggle('blockui-ghost-invalid', !!location && !valid);
      viewCalls.showDragReason(location && !valid ? reason : '');
      viewCalls.moveGhost(point);
      viewVars.snapPreview?.remove();
      viewVars.snapPreview = null;
      if (valid && element) {
        const r = element.getBoundingClientRect();
        viewVars.snapPreview = viewCalls.E('div', 'blockui-snap-preview', reason);
        viewVars.snapPreview.setAttribute('aria-hidden', 'true');
        let left = r.left + 8, top = location.body ? r.top - 14 : r.bottom + 2;
        viewVars.snapPreview.style.left = left + 'px';
        viewVars.snapPreview.style.top = top + 'px';
        viewVars.doc.body.append(viewVars.snapPreview);
        // The words stay readable beside the carried block: right of it, or above it where the window ends (E-03).
        const g = viewVars.ghost?.getBoundingClientRect(), s = viewVars.snapPreview.getBoundingClientRect();
        if (g?.width && s.left < g.right && s.right > g.left && s.top < g.bottom && s.bottom > g.top) {
          if (g.right + 8 + s.width <= viewVars.doc.documentElement.clientWidth - 4) left = g.right + 8;
          else top = Math.max(4, g.top - s.height - 4);
          viewVars.snapPreview.style.left = left + 'px';
          viewVars.snapPreview.style.top = top + 'px';
        }
      }
      const spoken = viewVars.drag.deleteZone ? 'ここで はなすと けす' : reason || 'ここで はなすと 入れるのを やめるよ';
      if (viewVars.drag.reason !== spoken) {
        viewVars.drag.reason = spoken;
        viewCalls.announce(spoken, !!location && !valid);
      }
    }
    function scrollDrag(timestamp = viewVars.doc.defaultView.performance.now()) {
      viewVars.dragFrame = null;
      if (!viewVars.drag?.started) return;
      // Keep the same 720px/s speed when rendering drops below sixty frames/s.
      const elapsed = viewVars.drag.scrollTime == null ? 1000 / 60 : Math.max(0, Math.min(100, timestamp - viewVars.drag.scrollTime)),
        distance = elapsed * .72;
      viewVars.drag.scrollTime = timestamp;
      const rect = viewVars.workspace.getBoundingClientRect(),
        beforeTop = viewVars.workspace.scrollTop,
        beforeLeft = viewVars.workspace.scrollLeft;
      // A block taken up close to an edge does not carry the workspace along at once: the edges scroll only after the
      // pointer has gone 24 px from where it was pressed, so a press that moves a little never scrolls (E-04).
      viewVars.drag.edgeArmed ||= Math.hypot(viewVars.drag.clientX - viewVars.drag.startX, viewVars.drag.clientY - viewVars.drag.startY) > 24;
      if (!viewVars.drag.edgeArmed) { viewVars.dragFrame = viewVars.doc.defaultView.requestAnimationFrame(scrollDrag); return; }
      if (viewVars.drag.clientX >= rect.left - 30 && viewVars.drag.clientX <= rect.right + 30) {
        if (viewVars.drag.clientY >= rect.top - 30 && viewVars.drag.clientY < rect.top + 32)
          viewVars.workspace.scrollTop -= distance;
        else if (viewVars.drag.clientY <= rect.bottom + 30 && viewVars.drag.clientY > rect.bottom - 32) {
          const bounds = viewVars.world.getBoundingClientRect(), padding = parseFloat(viewVars.doc.defaultView.getComputedStyle(viewVars.world).paddingBottom) || 0,
            contentEnd = beforeTop + bounds.bottom - padding * viewVars.zoom,
            lastReachableTop = Math.max(0, contentEnd - rect.bottom + 48);
          // Free panning keeps its blank margin; edge dragging stops at actual content.
          viewVars.workspace.scrollTop = Math.min(lastReachableTop, beforeTop + distance);
        }
      }
      if (viewVars.drag.clientY >= rect.top - 30 && viewVars.drag.clientY <= rect.bottom + 30) {
        if (viewVars.drag.clientX >= rect.left - 30 && viewVars.drag.clientX < rect.left + 24)
          viewVars.workspace.scrollLeft -= distance;
        else if (viewVars.drag.clientX <= rect.right + 30 && viewVars.drag.clientX > rect.right - 24)
          viewVars.workspace.scrollLeft += distance;
      }
      if (beforeTop !== viewVars.workspace.scrollTop || beforeLeft !== viewVars.workspace.scrollLeft)
        previewDrag(viewVars.drag);
      viewVars.dragFrame = viewVars.doc.defaultView.requestAnimationFrame(scrollDrag);
    }
    // The block (or the block of the list) a press may carry, or null when it cannot carry one now.
    function pressHandle(event) {
      const handle = event.target.closest('[data-blockui-drag]');
      return !handle || handle.disabled || handle.getAttribute('aria-disabled') === 'true' || viewVars.isLocked() || viewVars.pinch ||
        event.button !== 0 || event.isPrimary === false ? null : handle;
    }
    // A press that carries the block once it moves; a touch held still for a moment lifts the block first (E-09).
    function pressBlock(handle, pointerId, pointerType, x, y, { held = false } = {}) {
      if (viewVars.pending) viewVars.deferredFocus = handle;
      if (!viewCalls.flush().ok) { viewVars.deferredFocus = null; return false; }
      const id = handle.dataset.blockId,
        schemaId = handle.dataset.blockuiDragSchema;
      const state = viewVars.drag = {
        pointerId,
        pointerType,
        element: handle,
        id,
        schemaId,
        // After 「ここから下を まとめて もっていく」, carrying that block carries the blocks after it too.
        run: !!id && viewVars.moving?.type === 'run' && viewVars.moving.id === id,
        candidate: handle._akariSearchCandidate,
        startX: x,
        startY: y,
        started: false,
        held: false,
        owner: viewCalls.session()?.ownerKey,
        revision: viewCalls.session()?.sourceRevision,
        contextRevision: viewCalls.session()?.contextRevision,
        location: null,
        valid: false,
      };
      // A finger held still for a moment lifts the block: it can then be carried in any direction (E-09).
      const lift = () => {
        if (viewVars.drag !== state || state.started) return;
        state.held = true;
        (state.id ? handle.closest('.blockui-node') : handle.querySelector('.blockui-preview') || handle)?.classList.add('blockui-lift');
      };
      if (held) lift();
      else if (viewCalls.touchLike(pointerType)) state.holdTimer = setTimeout(lift, viewVars.HOLD_MS);
      try {
        handle.setPointerCapture(pointerId);
      } catch (_) {}
      return true;
    }
    // Finish pointer activation before folding the old selection or growing the new one.
    // Keyboard focus selects immediately so Tab can discover the selected block's tools.
    function focusBlockField(target) {
      if (target.closest('button,summary,.blockui-slot-head')) {
        // A field's tools close when the focus goes on to a control outside that field (AX-10).
        for (const n of viewVars.root.querySelectorAll('.blockui-slot-active')) if (!n.contains(target)) n.classList.remove('blockui-slot-active');
        return;
      }
      const slot = target.closest('.blockui-input-slot'),
        node = target.closest('.blockui-node'),
        field = target.closest('.blockui-field');
      for (const n of viewVars.root.querySelectorAll('.blockui-editing-field')) n.classList.remove('blockui-editing-field');
      // Only a field's own text box has an editing surface; the boxes of a group (だれが, いつ動く？) stay in their group.
      if (field && field.dataset.fieldType !== 'number' && target.matches('input,textarea') && target.parentElement === field) {
        // The field keeps the box it has now; the editing surface lies over the blocks (E-12).
        const idle = field.getBoundingClientRect();
        field.style.setProperty('--blockui-idle-width', idle.width / viewVars.zoom + 'px');
        field.style.setProperty('--blockui-idle-height', idle.height / viewVars.zoom + 'px');
        field.classList.add('blockui-editing-field');
        viewCalls.sizeEditingField(field);
      }
      for (const n of viewVars.root.querySelectorAll('.blockui-focused')) n.classList.remove('blockui-focused');
      for (const n of viewVars.root.querySelectorAll('.blockui-slot-active'))
        n.classList.remove('blockui-slot-active');
      node?.classList.add('blockui-focused');
      // The 本文 itself, passed on the way from a block to the list with the keyboard, keeps the selected block, so the
      // next block from the list still goes right after it (E-08, AX-10).
      if (node && !(target === node && viewCalls.schemaOf(viewVars.index.get(node.dataset.blockId)?.node)?.category === 'script')) {
        const id = node.dataset.blockId,
          wrapper = target.closest('[data-blockui-body-wrapper]'),
          body = wrapper?.dataset.blockOwner === id
            ? wrapper.dataset.blockuiBodyWrapper
            : target.matches('[data-blockui-annotation="elseComment"]') ? 'elseBody' : null;
        // Focusing a branch wrapper must retain its source position, not select only its owner.
        viewCalls.selection(id, body ? { body, line: viewVars.branchSourceLines.get(id + ':' + body) } : null);
      }
      slot?.classList.add('blockui-slot-active');
      if(slot)viewVars.doc.defaultView.requestAnimationFrame(()=>viewCalls.placeSlotHead(slot));
    }
    function destroy() {
      if (viewVars.destroyed) return;
      viewCalls.cancelDrag();
      viewCalls.endPan();
      viewVars.shapeObserver?.disconnect();
      viewVars.bodyObserver?.disconnect();
      if (viewVars.geometryFrame !== null) viewVars.doc.defaultView.cancelAnimationFrame(viewVars.geometryFrame);
      if (viewVars.toolsFrame !== null) viewVars.doc.defaultView.cancelAnimationFrame(viewVars.toolsFrame);
      viewVars.abort.abort();
      viewVars.destroyed = true;
      viewVars.root.replaceChildren();
      viewVars.root.classList.remove('blockui-editor');
    }
    function restorePending(saved) {
      if(!saved?.field||!Array.isArray(saved.nodePath))return false;
      const entry=[...viewVars.index.values()].find(item=>JSON.stringify(item.path)===JSON.stringify(saved.nodePath));
      if(!entry)return false;
      viewCalls.revealNode(entry.node.id);render({force:true});
      let input=[...viewVars.root.querySelectorAll('input,textarea,select')].find(el=>el.dataset.blockId===entry.node.id&&(el.dataset.blockuiField===saved.field||el.dataset.blockuiAnnotation===saved.field));
      if(!input)return false;
      if(input.tagName==='INPUT'&&/[\r\n]/.test(saved.value)){
        input.closest('.blockui-field')?.querySelector('[data-blockui-action="edit-text"]')?.click();
        input=viewVars.root.querySelector('.blockui-text-dialog textarea');if(!input)return false;
      }
      input.value=saved.value;input.dispatchEvent(new viewVars.doc.defaultView.Event('input',{bubbles:true}));
      return true;
    }
    function releaseInteraction() {
      viewCalls.cancelDrag(); viewCalls.endPan(); viewVars.moving=null; viewVars.destination=null; viewVars.replacement=null;
      viewCalls.updateControls(); if (!viewVars.pending) render({force:true});
    }
    Object.assign(viewCalls, {
      destroy,
      focusBlockField,
      pressBlock,
      pressHandle,
      previewDrag,
      releaseInteraction,
      render,
      restorePending,
      scrollDrag,
    });
    Object.assign(viewRedraw, {
      render,
    });
  }
