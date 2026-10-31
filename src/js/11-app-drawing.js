  // ────────────────────────────────────────────────────────────────────────
  // 11 — Application drawing: the render, refresh, repaint and paint functions, which redraw a view from the state. The
  // files before it ask for a redraw through the appRedraw slots they call; this file fills them with its functions.
  // ────────────────────────────────────────────────────────────────────────
  // The application files come in this order in src/akari.html: a file uses only the files before it and asks the files
  // after it only for a redraw (AUDIT.md「ソースの境界」). Called once at the start of initApp: appVars is the state
  // it shares, appCalls the functions it offers initApp and those it calls from the files before it, appRedraw the
  // redraw slots of the files before it, which it fills.
  function createAppDrawing(appVars, appCalls, appRedraw) {
    function renderEntrySurface() {
      const entry=document.body.dataset.uiLevel==='entry';
      // はじめて puts the place of ⏸ いったん止める／▶ つづける
      // (final call 21; the two take turns in it) under the stage, as on a video.
      for(const node of [appCalls.$('#runPauseSlot')]){
        if(entry&&!appVars.entryLayoutPlaced){const marker=document.createComment('entry control home');node.before(marker);appVars.entryControlHomes.set(node,marker);}
        if(entry&&node.id==='runPauseSlot'){if(node.parentElement!==appCalls.$('#entryRunControls'))appCalls.$('#entryRunControls').append(node);}
        else if(appVars.entryLayoutPlaced){const marker=appVars.entryControlHomes.get(node);if(marker?.isConnected){marker.after(node);marker.remove();}appVars.entryControlHomes.delete(node);}
      }
      const main=appCalls.$('.main'),side=appCalls.$('.side'),designer=appCalls.$('#designerWindow'),objects=appCalls.$('.objects-window');
      if(entry){if(designer.parentElement!==main)main.insertBefore(designer,side);if(objects&&side.firstElementChild!==objects)side.prepend(objects);}
      else if(appVars.entryLayoutPlaced&&document.body.dataset.editorMode==='blocks'){side.prepend(designer);side.insertBefore(objects,appCalls.$('.properties-window'));}
      appVars.entryLayoutPlaced=entry;
      // The click button names what is chosen: 「たくどん」が おされたとき, 画面が おされたとき.
      const clickLabel=(appVars.selectedId==='stage'?'画面':'「'+(appCalls.targetById(appVars.selectedId)?.name||'')+'」')+'が おされた とき';
      if(appCalls.$('#entryClickEvent').textContent!==clickLabel)appCalls.$('#entryClickEvent').textContent=clickLabel;
      for(const [id,event] of [['entryStartEvent','start'],['entryClickEvent','click']]) {
        appCalls.$('#'+id).disabled=appCalls.modelLocked()||!appCalls.eventsFor(appVars.selectedId).includes(event);
        appCalls.$('#'+id).setAttribute('aria-pressed',String(appVars.currentEvent===event));
      }
      // What はじめて keeps but does not show: blocks and rules it has not in this body, and every body of another event
      // (keys, signals, ふれたとき …), which only the two buttons above could open. The holes of a block being put in
      // (〔くり返すことを入れる〕) are not such blocks.
      const tree=appVars.mainEditor.session?.blockView;
      const outside=(tree&&[...buildBlockIndex(tree).values()].some(({node})=>!String(node.schemaId).startsWith('Hole:')&&
        ['statement','rule'].includes(BLOCK_SCHEMA_BY_ID.get(node.schemaId)?.category)&&!ENTRY_BLOCK_SCHEMA_IDS.has(node.schemaId)))||
        (appVars.project?.scripts||[]).some(s=>!['start','click'].includes(s.event)&&!isMeijinScript(s)&&String(s.source||'').trim());
      appCalls.$('#entryOutside').hidden=!entry||!outside||!!appVars.tutorial;
      appVars.placeHistoryButtons();
    }
    function renderTutorialChoices(step) {
      const box=appCalls.$('#tutorialChoices'),visible=step.action==='choice';box.hidden=!visible;appCalls.$('#tutorialFinish').hidden=!visible;
      const signature=visible?step.id+':'+appVars.tutorial.courses.join(','):'';
      if(box.dataset.choiceSignature===signature)return;box.dataset.choiceSignature=signature;box.replaceChildren();if(!visible)return;
      const choices=step.choice==='course'?TUTORIAL_COURSES.filter(c=>!appVars.tutorial.courses.includes(c.id)):
        TUTORIAL_COURSES.find(c=>c.id===step.course).children;
      for(const choice of choices){const button=document.createElement('button');button.type='button';button.dataset.tutorialChoice=choice.id;
        const title=document.createElement('strong'),description=document.createElement('span');title.textContent=choice.label;description.textContent=choice.description;
        button.append(title,description);button.onclick=()=>appCalls.tutorialChoose(choice.id);box.append(button);}
    }
    function refreshTutorialPresentation() {
      if(!appVars.tutorial)return;
      const step=tutorialStep(appVars.tutorial);
      // An empty enclosure shows its hole as its only place (E-03): the guide names what the child sees.
      const place=step?.block&&tutorialDestination(appVars.mainEditor.session?.blockView,step),
        holeOnly=!!place&&(()=>{const items=buildBlockIndex(appVars.mainEditor.session.blockView).get(place.parentId)?.node.bodies?.[place.body];return items?.length===1&&items[0].schemaId==='Hole:statement';})();
      if(step?.block)appCalls.$('#tutorialText').textContent=appCalls.tutorialInsertionReady(step)
        ?'左の 青い わくの「'+TUTORIAL_BLOCKS[step.block].label+'」を えらぼう。'
        :holeOnly?'青い わくの「することを えらぶ」を おして みよう。':'青い わくの「＋ ここに入れる」を おして みよう。';
        appCalls.$$('.tutorial-target').forEach(n=>n.classList.remove('tutorial-target'));
        for(const n of appCalls.$$('button,input,select,textarea,summary,[tabindex]')) {
          const allowed=appCalls.tutorialElementAllowed(n);n.dataset.tutorialBlocked=String(!allowed);
          if(n.matches('button,input,select,textarea,summary')){
            if(n.dataset.tutorialAria===undefined)n.dataset.tutorialAria=n.getAttribute('aria-disabled')??'none';
            if(!allowed)n.setAttribute('aria-disabled','true');else n.dataset.tutorialAria==='none'?n.removeAttribute('aria-disabled'):n.setAttribute('aria-disabled',n.dataset.tutorialAria);
          }
          if(allowed&&!['tutorialExit','stopBtn','pauseBtn','continueBtn'].includes(n.id))n.classList.add('tutorial-target');
        }
    }
    function renderEditorBinding(binding) {
      const session = appCalls.getEditorSession(binding),
        draft = binding.kind === 'draft',
        blocks = session.mode === 'blocks';
      session.notices = appCalls.bodyNotices(session);
      if (!draft) appCalls.syncEditorShell(appVars.sourceOverviewOpen ? appCalls.chosenEditorMode() : session.mode);
      const textRoot = draft ? binding.textarea : appVars.el.editor.closest('.editor-shell');
      textRoot.hidden = blocks;
      appCalls.$(draft ? '#callableBlocks' : '#blockEditor').hidden = !blocks;
      const hint = draft
        ? appCalls.$('#callableHints').closest('.hint-panel')
        : appCalls.$('.code-assist .hint-panel');
      hint.hidden = blocks;
      // The note that offers rewrites comes right after the code in the code view, on the screen (above the line under the
      // code) and in the Tab order; in the block view it stays above the workspace.
      const pendingNote = appCalls.$(draft ? '#callablePending' : '#editorPending'), workspace = appCalls.$(draft ? '#callableBlocks' : '#sourceImport');
      if (blocks ? pendingNote.nextElementSibling !== workspace : pendingNote.previousElementSibling !== textRoot)
        blocks ? workspace.before(pendingNote) : textRoot.after(pendingNote);
      const invalidCodePending = session.pendingEdit?.kind === 'code' && !session.blockDraft;
      paintBindingModeToggle(binding);
      if (!draft) {
        // いつ動く？ opens the block view as well, so a code error makes it pale in the same way; a press says why under
        // it (headingBlockedNote) instead of doing nothing.
        const heading = appCalls.$('#sourceHeadingBtn');
        if (!session.syntaxAst || invalidCodePending) {
          heading.setAttribute('aria-disabled', 'true');
          heading.setAttribute('aria-describedby', appCalls.headingBlockedNote().id);
        } else {
          heading.removeAttribute('aria-disabled');
          heading.removeAttribute('aria-describedby');
          appCalls.headingBlockedNote().hidden = true;
        }
      }
      if (blocks && (draft || !appVars.sourceOverviewOpen)) {
        binding.view.render();
        const mark = appVars.activeLoc || appVars.keptFail;
        binding.view.highlight(!draft && mark?.key === session.ownerKey ? mark : null);
      } else if (!session.pendingEdit && !appVars.composingEditors.has(binding.textarea)) {
        if (binding.textarea.value !== session.sourceText.replace(/\r\n?/g, '\n'))
          binding.textarea.value = session.sourceText;
        if (binding.renderedOwner !== session.ownerKey) {
          const s = session.codeSelection || {};
          binding.textarea.setSelectionRange(s.start || 0, s.end || 0, s.direction || 'none');
          binding.textarea.scrollTop = session.scrollState?.codeTop || 0;
          binding.textarea.scrollLeft = session.scrollState?.codeLeft || 0;
        }
      }
      binding.renderedOwner = session.ownerKey;
      if (!draft && appVars.sourceOverviewOpen) renderSourceOverview();
      // The 自分で作ったブロック editor's code view says its first notice under the code too (its block view marks the block).
      if (draft) {
        const line = appCalls.$('#callableIssue'), first = !blocks && appCalls.$('#callablePending').hidden ? session.notices[0] : null;
        line.hidden = !first;
        line.textContent = first ? 'ⓘ ' + (first.line || 1) + '行目：' + appCalls.sentence(first.message) + (session.notices.length > 1 ? `ほかにも 知らせが ${session.notices.length - 1}つ あります。` : '') : '';
      }
    }
    // The toggle of an editor as it is now: the list of all bodies shows the chosen view. A code error does not change the
    // toggle's look (so it does not flicker while the child types): a press only shows the note.
    function paintBindingModeToggle(binding) {
      const session = binding.session;
      if (!session) return;
      if (binding === appVars.mainEditor && appVars.sourceOverviewOpen) { const shown = appCalls.chosenEditorMode(); paintModeToggle(binding, shown, appCalls.modeRefusal(binding, shown)); return; }
      const codeError = !session.syntaxAst || (session.pendingEdit?.kind === 'code' && !session.blockDraft);
      paintModeToggle(binding, session.mode, appCalls.modeRefusal(binding, session.mode, codeError));
    }
    function paintModeToggle(binding, shown, refusal) {
      const prefix = binding.kind === 'draft' ? 'callable' : 'editor', note = appCalls.modeBlockedNote(binding);
      for (const mode of ['code', 'blocks']) {
        const b = appCalls.$(`#${prefix}Mode${mode}`), here = mode !== shown, label = appVars.VIEW_NAMES[shown] + ' ⇄';
        b.hidden = !here;
        if (!here) continue;
        if (b.textContent !== label) b.textContent = label;
        b.setAttribute('aria-label', appVars.VIEW_NAMES[shown]);
        b.disabled = appVars.appState === 'PREPARING';
        if (refusal) {
          if (note.textContent !== appVars.MODE_REFUSALS[refusal]) note.textContent = appVars.MODE_REFUSALS[refusal];
          b.dataset.refused = refusal;
          b.setAttribute('aria-describedby', note.id);
          b.removeAttribute('title');
        } else {
          delete b.dataset.refused;
          b.removeAttribute('aria-describedby');
          b.title = `おすと、${appVars.VIEW_NAMES[mode]}に かわるよ`;
          note.hidden = true;
        }
      }
    }
    function renderCallableOptions(prefer = '') {
      const sel = appCalls.$('#callableSelect');
      sel.textContent = '';
      for (const type of ['action', 'function'])
        for (const d of type === 'action' ? appVars.project.actions : appVars.project.functions) {
          const o = document.createElement('option');
          o.value = `${type}:${d.id}`;
          o.textContent = `${type === 'action' ? 'てじゅん' : '答えを もとめる'}：${d.name}`;
          sel.appendChild(o);
        }
      // Procedures made in a 名人 text are listed too: shown, opened and renamed here, written in that text.
      const made = meijinProjectDefinitions(appVars.project);
      if (made.length) {
        const group = document.createElement('optgroup');
        group.label = '名人の本文で 作った てじゅん';
        for (const d of made) {
          const o = document.createElement('option');
          o.value = 'meijin:' + d.id;
          o.textContent = `てじゅん：${d.name}（名人の本文）`;
          group.appendChild(o);
        }
        sel.appendChild(group);
      }
      sel.value = prefer;
    }
    function paintCallable() {
      appVars.syncingDraft = true;
      try {
        const d = appVars.callableDraftCore;
        appCalls.$('#callableSelect').value = d.loadedKey;
        appCalls.$('#callableType').value = d.type;
        appCalls.$('#callableName').value = d.name;
        appCalls.$('#callableArgs').value = d.argsText;
        appCalls.$('#callablePhrase').value = d.callPhrase || '';
        appCalls.$('#callablePhraseRow').hidden = appCalls.$('#callablePhraseHelp').hidden = d.type !== 'action';
        appCalls.$('#callableEditingId').value = d.editId;
        if (
          !appVars.draftEditor.session?.pendingEdit &&
          !appVars.composingEditors.has(appVars.draftEditor.textarea) &&
          appVars.draftEditor.textarea.value !== d.source.replace(/\r\n?/g, '\n')
        )
          appVars.draftEditor.textarea.value = d.source;
        appCalls.$('#callableHeader').textContent =
          `${d.type === 'action' ? 'てじゅん' : '答えを もとめる'}「${d.name || '名前'}」／入れるもの（${d.argsText}）／本文${appCalls.hasCallableDraft() ? ' （まだ ほぞんして いない）' : ''}`;
        appCalls.$('#callableDelete').disabled = appCalls.modelLocked() || !d.editId;
      } finally {
        appVars.syncingDraft = false;
      }
    }
    function renderSelectors() {
      appCalls.$('#sourceOverviewBtn').hidden = appVars.sourceOverviewOpen;
      appCalls.$('#sourceEditBtn').hidden = !appVars.sourceOverviewOpen;
      appCalls.$('#sourceStageBtn').hidden = appVars.selectedId === 'stage';
      appCalls.$('#sourceHeadingBtn').hidden = appVars.sourceOverviewOpen;
      appCalls.$('#sourceHeadingBtn').disabled = appCalls.modelLocked();
      appVars.el.obj.innerHTML = '';
      const add = (v, t) => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = t;
        appVars.el.obj.appendChild(o);
      };
      add('stage', appVars.project.stage.name);
      for (const c of appVars.project.components) add(c.id, c.name);
      if (appCalls.meijinScripts().length) add(MEIJIN_OWNER, appVars.MEIJIN_TARGET.name);
      appVars.el.obj.value = appVars.selectedId;
      appVars.el.event.innerHTML = '';
      if (appVars.sourceOverviewOpen) {
        const all = document.createElement('option');
        all.value = 'all'; all.textContent = 'すべての本文を 見せています';
        appVars.el.event.append(all);
      }
      for (const ev of appCalls.eventsFor(appVars.selectedId)) {
        const rows = appVars.project.scripts.filter((x) => x.targetId === appVars.selectedId && x.event === ev);
        const choices = rows.length ? rows : [null];
        choices.forEach((row, index) => {
          const option = document.createElement('option');
          option.value = index === 0 ? ev : scriptSourceKey(row);
          // A key is named as on the keyboard (「スペース」), as the heading writes it.
          const filter = row?.filter;
          // A touch body is named with what it touches (「星」に ふれたとき); bodies with the same partner are numbered among
          // themselves. A part with no touch body has the one entry ふれたとき.
          const same = ev === 'touchStart' ? rows.filter(x => x.filter?.target === filter?.target) : rows;
          option.textContent = appVars.selectedId === MEIJIN_OWNER ? `名人の本文 ${index + 1}` : eventText(ev, filter) + (same.length > 1 ? ` ／ 本文${same.indexOf(row) + 1}` : '');
          if (row) option.dataset.scriptKey = scriptSourceKey(row);
          appVars.el.event.appendChild(option);
        });
      }
      const row = appVars.selectedScriptId ? appVars.project.scripts.find((x) => x.id === appVars.selectedScriptId) : null,
        first = appVars.project.scripts.find((x) => x.targetId === appVars.selectedId && x.event === appVars.currentEvent);
      appVars.el.event.value = appVars.sourceOverviewOpen ? 'all' : row && row !== first ? scriptSourceKey(row) : appVars.currentEvent;
      appCalls.$('#scriptAdd').disabled = appCalls.modelLocked() || appVars.project.scripts.length >= LIMITS.scripts;
      appCalls.$('#scriptAdd').textContent = appCalls.currentIsMeijin() ? '名人の本文を ふやす' : '同じ きっかけの 本文を ふやす';
      appCalls.$('#meijinDelete').hidden = !appCalls.currentIsMeijin();
      appCalls.$('#meijinDelete').disabled = appCalls.modelLocked();
      appCalls.$('#sourceHeadingBtn').hidden ||= appCalls.workIsMeijin();
      renderEntrySurface();
    }
    function renderSourceOverview() {
      if (!appVars.sourceOverviewOpen) return;
      paintBindingModeToggle(appVars.mainEditor);
      const signature = JSON.stringify([appVars.selectedId, appVars.editorContextRevision, appCalls.chosenEditorMode(), appCalls.modelLocked(), appCalls.hasCallableDraft() ? appVars.callableDraftCore : null]);
      if (appVars.sourceOverviewSignature === signature) return;
      appVars.sourceOverviewSignature = signature;
      appVars.sourceOverviewObserver?.disconnect();
      for (const view of appVars.sourceOverviewViews) view.destroy();
      appVars.sourceOverviewViews = [];
      const root = appCalls.$('#sourceOverview'), scroll = root.scrollTop;
      root.replaceChildren();
      const make = (tag, text, className = '') => {
        const node = document.createElement(tag);
        if (text != null) node.textContent = text;
        node.className = className;
        return node;
      };
      const button = (text, fn) => {
        const b = make('button', text); b.type = 'button'; b.onclick = fn; return b;
      };
      const records = sourceRegistry(appVars.project), byKey = new Map(records.map(r => [r.key, r]));
      const owned = records.filter(r => r.ownerId === appVars.selectedId);
      root.setAttribute('aria-label', appCalls.targetById(appVars.selectedId).name + ' のすべての本文');
      if (!owned.length) root.append(make('p', (appVars.selectedId === 'stage' ? '画面' : 'この 部品') + 'には まだ 本文が ないよ。きっかけを えらんで 本文を 作ってね。'));
      const queue = [...owned.filter(r => r.source.trim()), ...owned.filter(r => !r.source.trim())];
      const included = new Set(queue.map(r => r.key));
      for (let i = 0; i < queue.length; i++) {
        const record = queue[i];
        record.references = sourceReferences(record, appVars.project);
        for (const key of record.references) if (!included.has(key)) {
          included.add(key); queue.push(byKey.get(key));
        }
      }
      const anchors = new Map(queue.map((r, i) => [r.key, `source-body-${i}`]));
      const waiting = new Map();
      appVars.sourceOverviewObserver = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          const render = waiting.get(entry.target);
          if (render) { waiting.delete(entry.target); render(); }
          appVars.sourceOverviewObserver.unobserve(entry.target);
        }
      }, { root, rootMargin: '0px' });
      for (const [i, record] of queue.entries()) {
        const card = make('section', null, 'source-card');
        card.id = anchors.get(record.key);
        card.dataset.sourceKey = record.key;
        card.dataset.ownerId = record.ownerId;
        const shared = record.ownerId !== appVars.selectedId;
        const heading = make('h3', `${shared ? appVars.project.stage.name + ' ／ ' : ''}${record.title}`);
        const edit = button('この 本文を なおす', () => {
          if (!appCalls.flushActiveEditor()) return;
          if (record.kind === 'script') {
            if (!appCalls.selectObject(record.ownerId)) return;
            appVars.currentEvent = record.event; appVars.selectedScriptId = record.id || null; appCalls.hideSourceOverview(); appCalls.loadEditor();
            if (!appCalls.modelLocked()) appCalls.pushHistoryNow();
          } else {
            if (appCalls.modelLocked() || !appCalls.confirmCallableDiscard()) return;
            appCalls.loadCallable(record.key); renderCallableOptions(record.key);
            appCalls.$('#procModal').classList.add('show'); renderEditorBinding(appVars.draftEditor);
            appCalls.pushHistoryNow();
          }
        });
        edit.dataset.sourceEdit = record.key;
        edit.disabled = appCalls.modelLocked();
        card.append(heading, edit);
        const body = make('div', null, 'source-body'); card.append(body);
        const render = () => {
          body.replaceChildren();
          if (!record.source.trim()) { body.append(make('p', '本文は からっぽだよ。')); return; }
          const session = createEditorSession(record.key, record.source, record.context, appVars.project, appVars.editorContextRevision);
          if (appCalls.chosenEditorMode() === 'blocks' && session.syntaxAst) {
            session.mode = 'blocks';
            const preview = make('div', null, 'source-blocks'); body.append(preview);
            appVars.sourceOverviewViews.push(createBlockEditorView({
              readOnly: true,
              root: preview, getSession: () => session, getProject: () => appVars.project,
              getContext: () => record.context, isLocked: () => true,
              onOperation: () => ({ ok: false, reason: '「この 本文を なおす」を えらんでね' }),
            }));
          } else {
            if (!session.syntaxAst) body.append(make('p', '書き方を たしかめて ください。入力した 本文を 見せて います。', 'source-error'));
            body.append(make('pre', record.source));
          }
        };
        // Contents remain in the DOM in code mode. Large block previews are materialized on scroll.
        body.append(make('pre', record.source || '本文は からっぽだよ。'));
        root.append(card);
        if (i === 0) render();
        else { waiting.set(body, render); appVars.sourceOverviewObserver.observe(body); }
        if (record.references.length) {
          const refs = make('nav', '使っている 自分で作ったブロック：', 'source-references');
          for (const key of record.references) {
            const link = make('a', byKey.get(key).title);
            link.href = '#' + anchors.get(key);
            link.onclick = e => {
              e.preventDefault();
              root.querySelector('#' + anchors.get(key))?.scrollIntoView({ block: 'start' });
            };
            refs.append(link);
          }
          card.append(refs);
        }
      }
      if (appVars.selectedId === 'stage' && appCalls.hasCallableDraft()) {
        const card = make('section', null, 'source-card source-draft');
        card.dataset.ownerId = appVars.callableDraftCore.ownerId;
        card.dataset.sourceKey = appCalls.draftOwner();
        card.append(make('h3', `なおして いる ${appVars.callableDraftCore.type === 'action' ? 'てじゅん' : '答えを もとめる'}「${appVars.callableDraftCore.name || '名前を入力'}」`),
          make('pre', appVars.callableDraftCore.source || '本文は からっぽだよ。'),
          button('つづきを なおす', () => { appCalls.$('#procModal').classList.add('show'); renderEditorBinding(appVars.draftEditor); }));
        root.append(card);
      }
      root.scrollTop = scroll;
    }
    function paintResizePreview(c) {
      const n = appVars.el.form.querySelector(`[data-runtime-id="${CSS.escape(c.id)}"].component`);
      if (n)
        Object.assign(n.style, {
          left: c.x - c.w / 2 + 'px',
          top: appVars.project.stage.height - c.y - c.h / 2 + 'px',
          width: c.w + 'px',
          height: c.h + 'px',
          transform: `rotate(${-c.direction}deg) scale(${c.scalePercent / 100})`,
        });
      appCalls.positionResizeHandles(c);
    }
    function renderResizeHandle() {
      appVars.el.form
        .querySelectorAll('.design-resize-handle,.design-resize-outline')
        .forEach((n) => n.remove());
      appCalls.$('#designRatioLock').hidden = true;
      appCalls.updateDesignHelp(null);
      if (appCalls.modelLocked() || appVars.selectedId === 'stage') return;
      const c = appCalls.componentById(appVars.selectedId),
        mode = designResizeMode(c);
      if (!mode || !c.visible) return;
      // Only a box changes its width and height apart; a picture costume keeps its shape anyway.
      appCalls.$('#designRatioLock').hidden = mode !== 'box';
      const node = appVars.el.form.querySelector(`[data-runtime-id="${CSS.escape(c.id)}"].component`);
      if (!node || node.style.display === 'none') return;
      const outline = document.createElement('div');
      outline.className = 'design-resize-outline';
      outline.setAttribute('aria-hidden', 'true');
      appVars.el.form.append(outline);
      const labels = {
        nw: '\u5de6\u4e0a',
        n: '\u4e0a',
        ne: '\u53f3\u4e0a',
        e: '\u53f3',
        se: '\u53f3\u4e0b',
        s: '\u4e0b',
        sw: '\u5de6\u4e0b',
        w: '\u5de6',
      };
      for (const direction of mode === 'scale' ? ['se'] : Object.keys(DESIGN_RESIZE_DIRECTIONS)) {
        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'design-resize-handle';
        handle.dataset.resizeFor = c.id;
        handle.dataset.resizeDirection = direction;
        handle.title =
          mode === 'scale'
            ? 'おしたまま ひっぱると、形を かえずに 大きく・小さく できます'
            : 'おしたまま ひっぱって たて・よこを かえる（Shiftを おしながら 角を ひっぱると 形は そのまま）';
        handle.setAttribute(
          'aria-label',
          `${c.name}: ${labels[direction]}の 大きさを かえる`,
        );
        handle.addEventListener('pointerdown', (e) => {
          if (e.button !== 0 || e.isPrimary === false) return;
          e.preventDefault();
          e.stopPropagation();
          if (!appCalls.modelLocked() && appCalls.flushActiveEditor()) appCalls.startResize(e, c.id, direction);
          else appCalls.releaseShellPointer();
        });
        handle.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        handle.addEventListener('keydown', (e) => {
          if (
            e.isComposing ||
            e.keyCode === 229 ||
            e.ctrlKey ||
            e.metaKey ||
            e.altKey ||
            appCalls.modelLocked()
          )
            return;
          const keys = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            },
            key = keys[e.key];
          if (!key && !(mode === 'scale' && ['+', '=', '-', '_'].includes(e.key))) return;
          e.preventDefault();
          e.stopPropagation();
          if (!appCalls.flushActiveEditor()) return;
          appCalls.dropHistoryTimer();
          appCalls.pushHistoryNow();
          let next;
          if (mode === 'scale') {
            const step = e.shiftKey ? 1 : 10,
              delta = ['ArrowUp', 'ArrowRight', '+', '='].includes(e.key) ? step : -step;
            next = { scalePercent: clamp(c.scalePercent + delta, 1, 1000) };
          } else {
            const step = e.shiftKey ? 10 : 1;
            next = designResizeGeometry(c, direction, key[0] * step, -key[1] * step);
          }
          let changed = false;
          try {
            changed = appCalls.commitResize(c, next);
            if (changed) refreshEditor();
          } catch (error) {
            appCalls.log(error.message, 'error');
          }
          renderProperties();
          renderComponents();
          appCalls.focusResizeHandle(c.id, direction);
          // The size is said as the pointer path says it (「はば 120　高さ 80」, or 「星1: 110%」), and read out (#statusLive).
          appCalls.setStatus(changed ? (mode === 'scale' ? `${c.name}の 大きさ ${c.scalePercent}％` : `はば ${c.w}　高さ ${c.h}`) : '大きさは かわって いないよ');
        });
        appVars.el.form.append(handle);
      }
      appCalls.positionResizeHandles(c);
    }
    function renderComponents() {
      appVars.stageView.renderComponents();
      renderResizeHandle();
      paintColorPreview();
    }
    function renderTree() {
      appVars.el.tree.textContent = '';
      appVars.el.tree.setAttribute('role', 'listbox');
      appVars.el.tree.setAttribute('aria-label', '\u4f5c\u54c1\u306e\u90e8\u54c1');
      const ids = ['stage', ...appVars.project.components.map((c) => c.id), ...(appCalls.meijinScripts().length ? [MEIJIN_OWNER] : [])];
      const row = (id, label) => {
        const d = document.createElement('div');
        d.className = 'tree-item' + (id === appVars.selectedId ? ' selected' : '');
        d.textContent = label;
        d.tabIndex = id === appVars.selectedId ? 0 : -1;
        d.setAttribute('role', 'option');
        d.setAttribute('aria-selected', String(id === appVars.selectedId));
        d.onclick = () => appCalls.selectObject(id);
        d.onkeydown = (e) => {
          if (e.isComposing || e.keyCode === 229) return;
          if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
            const i = ids.indexOf(id),
              next =
                e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                    ? ids.length - 1
                    : clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, ids.length - 1);
            appCalls.selectObject(ids[next]);
            appVars.el.tree.querySelector('[tabindex="0"]')?.focus();
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            appCalls.selectObject(id);
            appVars.el.tree.querySelector('[tabindex="0"]')?.focus({ preventScroll: true });
          }
        };
        appVars.el.tree.appendChild(d);
      };
      row('stage', `\u25a3 ${appVars.project.stage.name}`);
      for (const c of appVars.project.components)
        row(c.id, `${c.type === 'sprite' ? '\u2605' : '\u2022'} ${c.name}`);
      if (appCalls.meijinScripts().length) row(MEIJIN_OWNER, '\u270e ' + appVars.MEIJIN_TARGET.name);
    }
    function renderProperties() {
      appVars.propertyHeaderObserver?.disconnect();
      appVars.propertyHeaderObserver?.observe(appVars.el.props);
      const scroll = appVars.el.props.dataset.owner === appVars.selectedId ? appVars.el.props.scrollTop : 0;
      appVars.el.props.dataset.owner = appVars.selectedId;
      appVars.el.props.textContent = '';
      appCalls.$('#componentActions').replaceChildren();
      if (appVars.selectedId === 'stage') {
        appVars.el.props.append(
          appCalls.propSection(
            'きほん',
            appCalls.propRow('\u540d\u524d', appVars.project.stage.name, (v) => {
              appCalls.checkPartName(v.trim(), { stage: true });
              appVars.project = prepareResourceRename(appVars.project,'component:stage',v.trim(),{drafts:appCalls.resourceDraftRecords()});
              appCalls.invalidateEditors();
            }),
          ),
          appCalls.propSection(
            '\u5927\u304d\u3055',
            appCalls.propRow(
              'はば',
              appVars.project.stage.width,
              (v) => {
                const n = Number(v);
                if (!Number.isInteger(n) || n < 200 || n > 1200) throw new Error('画面の はばは 200から1200までの、小数の ない 数に してね');
                appVars.project.stage.width = n;
              },
              'number',
              { after: appCalls.noteOutsideParts },
            ),
            appCalls.propRow(
              '\u9ad8\u3055',
              appVars.project.stage.height,
              (v) => {
                const n = Number(v);
                if (!Number.isInteger(n) || n < 150 || n > 800)
                  throw new Error('画面の 高さは 150から800までの、小数の ない 数に してね');
                appVars.project.stage.height = n;
              },
              'number',
              { after: appCalls.noteOutsideParts },
            ),
          ),
          // State words, not sentences of the language (F-22: 「すがたを見せる」 is a sentence).
          appCalls.propSection('ふきだし',
            appCalls.propRow('名前の ひょうじ',appVars.project.stage.showSpeechNames!==false,
              v=>(appVars.project.stage.showSpeechNames=v),'checkbox')),
        );
        appCalls.syncPropertyScrollPadding();
        appVars.el.props.scrollTop = scroll;
        return;
      }
      const c = appCalls.componentById(appVars.selectedId);
      if (!c) return;
      const actions = document.createElement('div');
      actions.className = 'prop-actions';
      const title = document.createElement('strong');
      title.textContent = c.name;
      const duplicate = document.createElement('button');
      duplicate.type = 'button';
      duplicate.className = 'prop-duplicate';
      duplicate.textContent = '見た目のコピー';
      // A sprite is a キャラクター, any other part a 部品 (F-23).
      const kind = c.type === 'sprite' ? 'キャラクター' : '部品';
      duplicate.title = `見た目と せっていが 同じ ${kind}を もう1つ 作ります（本文は もちません）`;
      duplicate.disabled = appCalls.modelLocked() || appVars.project.components.length >= LIMITS.components;
      duplicate.onclick = appCalls.duplicateSelectedComponent;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'prop-delete';
      del.textContent = `🗑 この ${kind}を けす`;
      del.disabled = appCalls.modelLocked();
      del.onclick = appCalls.deleteSelectedComponent;
      // What the copy does is said by its title and description; no line of its own.
      duplicate.setAttribute('aria-description', `見た目と せっていが 同じ ${kind}を もう1つ 作ります。本文は もちません。`);
      actions.append(title, duplicate, del);
      (document.body.dataset.editorMode === 'blocks' ? appCalls.$('#componentActions') : appVars.el.props).append(actions);
      appVars.el.props.append(
        appCalls.propSection(
          'きほん',
          appCalls.propRow('\u540d\u524d', c.name, (v) => {
            v = v.trim();
            appCalls.checkPartName(v);
            if (appVars.project.components.some((x) => x !== c && x.name === v))
              throw new Error('ほかの キャラクターや 部品と ちがう 名前に してね');
            appVars.project = prepareResourceRename(appVars.project,'component:'+c.id,v,{drafts:appCalls.resourceDraftRecords()});
            appCalls.invalidateEditors();
          }),
          appCalls.propRow('見えている', c.visible, (v) => (c.visible = v), 'checkbox'),
          appCalls.propRow(
            'しゅるい',
            {
              label: '\u6587\u5b57',
              button: '\u30dc\u30bf\u30f3',
              input: '入力らん',
              box: '\u56db\u89d2',
              sprite: '\u30ad\u30e3\u30e9\u30af\u30bf\u30fc',
            }[c.type] || c.type,
            () => {},
            'readonly',
          ),
        ),
        appCalls.propSection(
          '文字・中身',
          appCalls.propRow(
            c.type === 'sprite' ? '\u4ee3\u308f\u308a\u306e\u6587\u5b57' : '\u6587\u5b57',
            c.text,
            (v) => {
              if (cpLen(v) > LIMITS.stringChars) throw new Error(`文字は ${LIMITS.stringChars}文字までに してね`);
              c.text = v;
            },
          ),
          appCalls.propRow(
            '文字の 大きさ',
            c.fontSize,
            (v) => {
              const n = Number(v);
              if (n < 8 || n > 200) throw new Error('文字の 大きさは 8から200までの 数に してね');
              c.fontSize = n;
            },
            'number',
          ),
        ),
        appCalls.propSection(
          '大きさ・ばしょ',
          appCalls.propRow(
            'はば',
            c.w,
            (v) => {
              const n = Number(v);
              if (n < 8 || n > 1200) throw new Error('はばは 8から1200までの 数に してね');
              c.w = n;
            },
            'number',
            { step: 'any' },
          ),
          appCalls.propRow(
            '\u9ad8\u3055',
            c.h,
            (v) => {
              const n = Number(v);
              if (n < 8 || n > 1200) throw new Error('高さは 8から1200までの 数に してね');
              c.h = n;
            },
            'number',
            { step: 'any' },
          ),
          appCalls.propRow('よこのばしょ', c.x, (v) => (c.x = Number(v)), 'number', { step: 'any' }),
          appCalls.propRow('たてのばしょ', c.y, (v) => (c.y = Number(v)), 'number',
            { step: 'any', help: '画面の 左下の はしから、まん中までの 歩数です' }),
        ),
        appCalls.propSection(
          '\u8272',
          appCalls.colorSetting(c, 'fg', '\u6587\u5b57\u8272'),
          appCalls.colorSetting(c, 'bg', 'はいけいの 色'),
        ),
        appCalls.propSection(
          '\u305d\u306e\u4ed6',
          appCalls.propRow('向き', c.direction, (v) => (c.direction = appCalls.designDirection(v)), 'number',
            { step: 'any', help: '0＝右　90＝上　180＝左　270＝下' }),
          appCalls.propRow(
            '\u5927\u304d\u3055%',
            c.scalePercent,
            (v) => {
              const n = Number(v);
              if (n < 1 || n > 1000) throw new Error('大きさは 1から1000までの 数に してね');
              c.scalePercent = n;
            },
            'number',
            { step: 'any' },
          ),
        ),
      );
      appVars.propertyHeaderObserver?.observe(actions);
      appCalls.syncPropertyScrollPadding();
      appVars.el.props.scrollTop = scroll;
    }
    function paintColorPreview() {
      const edit = appVars.colorEdit;
      if (
        !edit ||
        appCalls.modelLocked() ||
        appVars.project !== edit.project ||
        appCalls.componentById(edit.id) !== edit.component
      )
        return;
      const node = appVars.el.form.querySelector(`.component[data-id="${CSS.escape(edit.id)}"]`);
      if (node)
        node.style[edit.field === 'fg' ? 'color' : 'backgroundColor'] = edit.value || 'transparent';
    }
    function renderMonitorSection(root, title, rows) {
      const d = document.createElement('section');
      d.className = 'monitor-section';
      const h = document.createElement('div');
      h.className = 'monitor-title';
      h.textContent = title;
      d.appendChild(h);
      for (const [k, v] of rows) {
        const row = document.createElement('div');
        row.className = 'monitor-row';
        const a = document.createElement('div');
        a.className = 'monitor-key';
        a.textContent = k;
        const b = document.createElement('div');
        b.className = 'monitor-value';
        b.textContent = appCalls.monitorValue(v);
        if (Array.isArray(v) || (typeof v === 'string' && cpLen(v) > 160) || displayValue(v).rounded) {
          const full = document.createElement('button');
          full.textContent = isNumberValue(v) ? 'もとの数' : '全部';
          full.setAttribute('aria-label', k + (isNumberValue(v) ? 'の もとの 数（ふだんは 数を 短くして 見せているよ）' : 'の 全部'));
          const copy = Array.isArray(v) ? v.slice() : v;
          full.onclick = () => appCalls.showFullValue(k, copy);
          b.appendChild(full);
        }
        row.append(a, b);
        d.appendChild(row);
      }
      root.appendChild(d);
    }
    function renderFullValue() {
      if (!appVars.valueView) return;
      const v = appVars.valueView,
        list = Array.isArray(v.value);
      if (list) v.index = clamp(v.index, 0, Math.max(0, v.value.length - 1));
      const item = list ? v.value[v.index] : v.value,
        chars = Array.from(item === undefined ? '\uff3b\uff3d' : valueText(item)),
        pages = Math.max(1, Math.ceil(chars.length / 8000));
      v.page = clamp(v.page, 0, pages - 1);
      appCalls.$('#valueTitle').textContent = v.label;
      const rounded = item !== undefined && displayValue(item).rounded;
      appCalls.$('#valueNotice').textContent = rounded ? 'ふだんは 数を 短くして 見せて いるよ。下は もとの 数だよ。えらんで、ほかの ところに はりつけられるよ。' : '下は 中身の 全部だよ。えらんで、ほかの ところに はりつけられるよ。';
      appCalls.$('#valueListControls').hidden = !list;
      appCalls.$('#valueItem').value = String(v.index + 1);
      appCalls.$('#valueItem').max = String(Math.max(1, v.value.length || 1));
      appCalls.$('#valueItem').disabled = !list || !v.value.length;
      appCalls.$('#valueCount').textContent = list ? `/ ${v.value.length}こ` : '';
      appCalls.$('#valueItemPrev').disabled = !list || v.index === 0;
      appCalls.$('#valueItemNext').disabled = !list || v.index >= v.value.length - 1;
      appCalls.$('#valueOutput').textContent = chars.slice(v.page * 8000, (v.page + 1) * 8000).join('');
      appCalls.$('#valueOutput').scrollTop = 0;
      appCalls.$('#valuePage').textContent = `${v.page + 1} / ${pages}`;
      appCalls.$('#valuePagePrev').disabled = v.page === 0;
      appCalls.$('#valuePageNext').disabled = v.page === pages - 1;
    }
    function renderFailureDetails() {
      const r = appVars.scheduler?.errorRecords.find((x) => x.id === appVars.activeFailureId),
        root = appCalls.$('#failureBody');
      root.textContent = '';
      if (!r) return;
      const entry = document.body.dataset.uiLevel === 'entry';
      // Akari speaks to the child in one voice (〜よ／〜ね); the reason is the language's rule, set apart in a box with its
      // place, as 作品チェック shows it (F-18: one register per surface). The help names only the controls of this level:
      // はじめて has no 「本文を見て たしかめる」 and no line numbers. There the place to fix keeps its orange frame after
      // ■ 止める (keptFail), and the help promises the frame only when the body shows it; otherwise it names the sentence.
      const help = document.createElement('div'); help.className = 'diagnostic-help failure-help';
      const lead = document.createElement('p'), reason = document.createElement('div'), place = document.createElement('div'),
        why = document.createElement('div'), next = document.createElement('p');
      lead.textContent = entry ? '動きが とちゅうで 止まったよ。作った ブロックは そのままだよ。'
        : '動きが とちゅうで 止まったよ。書いた 本文と、うまく いかなかった ときの きろくは のこって いるよ。';
      reason.className = 'failure-reason'; place.className = 'failure-place'; why.className = 'failure-why';
      place.textContent = appCalls.diagnosticLocation(r); why.textContent = childDiagnosticText(r, appCalls.diagnosticSource(r), appVars.project);
      reason.append(place, why);
      const latest = r.id === appVars.scheduler.errorRecords.at(-1)?.id, sentence = appCalls.diagnosticSentence(r),
        framed = latest && !!document.querySelector('#blockEditor .blockui-current');
      next.textContent = !entry ? '「とじる」の あと、「本文を見て たしかめる」で やることを たしかめられるよ。書きなおす ときは「■ 止める」を おしてから なおしてね。'
        : framed ? '「とじる」を おしてから「■ 止める」を おして、オレンジの わくの ところを なおしてね。'
        : '「とじる」を おしてから「■ 止める」を おして、' + (sentence ? '「' + sentence + '」の ブロックを なおしてね。' : 'この ブロックを なおしてね。');
      help.append(lead, reason, next);
      root.append(help);
      const details = appendDiagnosticDetails(root, r, `${r.code}: ${r.message}\n${r.key} / ${r.line}\u884c\n${r.statement}\n${r.callStack.join(' \u2192 ')}`);
      details.querySelector('pre').className = 'failure-summary';
      const repair = appCalls.quotedListRepair(r);
      if (repair) {
        const help = document.createElement('p');
        help.textContent = `ここは 文字だよ。リスト「${r.quotedList.name}」を 使う？`;
        const edit = document.createElement('button');
        edit.id = 'failureEditList';
        edit.textContent = '止めて、ここの リストを えらぶ';
        edit.onclick = () => appCalls.openQuotedListRepair(r);
        root.append(help, edit);
      }
      const failedId = r.actor?.baseId || r.targetId, failedTarget = appCalls.targetById(failedId),
        failedKind = !failedTarget || failedId === 'stage' ? '画面' : failedTarget.type === 'sprite' ? 'キャラクター' : '部品';
      renderMonitorSection(root, 'うまく いかなかった ときの ようす', [
        [`動いていた ${failedKind}`, failedTarget?.name || '画面'],
        ['きっかけ', appCalls.runtimeEventText(r.eventType, r.key)],
        ['動かしていた本文', r.source],
      ]);
      // The scheduler's numbers are くわしく facts (F-28).
      if (document.body.dataset.uiLevel === 'advanced') {
        const identifiers = appendDiagnosticDetails(root, r, '動きの 番号: ' + r.taskId + '\n動いている部品: ' + r.runtimeId + '\n本文: ' + r.key);
        identifiers.querySelector('summary').textContent = 'くわしく見る（動きの番号）';
      }
      for (const f of r.frames)
        renderMonitorSection(
          root,
          (f.kind === 'function' ? '答えを もとめる ' : 'てじゅん ') + f.name + ` / ${f.line}\u884c`,
          [
            ...f.args.map(([k, v]) => ['入れるもの ' + k, v]),
            ...f.locals.map(([k, v]) => ['この中だけの へんすう ' + k, v]),
            ...f.localLists.map(([k, v]) => ['この中だけのリスト ' + k, v]),
          ],
        );
      if (r.binders.length)
        renderMonitorSection(root, 'くり返しで今見ているもの', r.binders);
      renderMonitorSection(root, 'うまく いかなかった ときの 作品の へんすう・リスト', [
        ...r.projectVariables,
        ...r.projectLists,
      ]);
      if (r.actor)
        renderMonitorSection(root, `うまく いかなかった ときの この ${failedKind}の ようす`, [
          ['よこのばしょ', r.actor.x],
          ['たてのばしょ', r.actor.y],
          ['向き', r.actor.direction],
          ...r.actor.variables,
          ...r.actor.lists,
        ]);
    }

    // Extension data that the extension keeps in the work (state.persist "project") stays between runs.
    // Show it while stopped, with one button that returns it to the extension's initial value.
    function renderKeptExtensionData() {
      const kept = EXTENSION_HOST.stateInfo().filter(item => item.persist === 'project');
      if (!kept.length) return;
      const saved = appVars.project.extensions?.state || EXTENSION_HOST.initialState(),
        initial = EXTENSION_HOST.initialState();
      renderMonitorSection(appVars.el.monitor, '作品に ほぞんされる かくちょうの 中身', kept.map(item => [item.name,
        JSON.stringify((saved.find(value => value.id === item.id) || initial.find(value => value.id === item.id))?.value ?? null)]));
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'monitor-extension-reset';
      reset.textContent = 'かくちょうの 中身を はじめに もどす';
      reset.onclick = () => {
        if (appVars.runtime || appCalls.modelLocked()) return;
        EXTENSION_HOST.resetState();
        appVars.project.extensions = { ...EXTENSION_HOST.requirements(), profile: AKARI_RUNTIME.profiles.requirement(), state: EXTENSION_HOST.snapshotState() };
        appCalls.pushHistoryNow();
        renderMonitor();
        appCalls.log('かくちょうの 中身を はじめに もどしました', 'ok');
      };
      appVars.el.monitor.appendChild(reset);
    }
    function renderMonitor() {
      appVars.el.monitor.textContent = '';
      if (!appVars.runtime) {
        const d = document.createElement('div');
        d.className = 'monitor-empty';
        d.textContent = '止まって いるよ';
        appVars.el.monitor.appendChild(d);
        renderKeptExtensionData();
        return;
      }
      const section = (title, rows) => renderMonitorSection(appVars.el.monitor, title, rows),
        records = appVars.scheduler?.errorRecords || [];
      if (records.length) {
        const last = records.at(-1),
          button = document.createElement('button');
        button.className = 'failure-open';
        button.textContent = `動きが 止まった きろくを 見る（${records.length}こ）`;
        button.onclick = () => appCalls.showFailureDetails();
        appVars.el.monitor.appendChild(button);
        // 動きのようす speaks in Akari's voice (F-18): the reason, in the language's polite words, is in the record.
        section('さいごに うまく いかなかった とき', [
          ['直す手がかり', 'わけは「動きが 止まった きろくを 見る」で 見られるよ'],
          ['ばしょ', appCalls.diagnosticLocation(last)],
          ['うまく いかなかった やること', last.statement],
        ]);
        const frame = last.frames.at(-1);
        if (frame)
          section((frame.kind === 'function' ? '答えを もとめる ' : 'てじゅん ') + frame.name, [
            ...frame.args.map(([k, v]) => ['入れたもの ' + k, v]),
            ...frame.locals.map(([k, v]) => ['この中だけの へんすう ' + k, v]),
            ...frame.localLists.map(([k, v]) => ['この中だけのリスト ' + k, v]),
          ]);
      }
      section('いまの 作品の へんすう・リスト', [
        ...appVars.runtime.projectVars,
        ...appVars.runtime.projectLists,
      ]);
      const tasks = appVars.scheduler ? [...appVars.scheduler.tasks.values()] : [],
        live = tasks.filter((t) => !['DONE', 'CANCELLED', 'ERROR'].includes(t.state)),
        focus = appVars.scheduler?.tasks.get(appVars.activeTaskId) || live[0] || tasks[0];
      // はじめて and かんたん show what a child can see: how many bodies run now and what the chosen one does, in
      // Akari's own words. くわしく adds the scheduler's counts.
      section('いまの 動き', [
        ['いま 動いている 本文', live.length ? `${live.length}こ` : 'ないよ'],
        ...(focus ? [
          ['ようす', appCalls.taskStateText(focus)],
          ['きっかけ', `${appCalls.meijinTextLabel(focus.scriptId ? appCalls.runningScript('script:' + focus.scriptId) : null)||appCalls.targetById(focus.targetId)?.name||'作品'} / ${appCalls.runtimeEventText(focus.eventType, focus.scriptId ? 'script:' + focus.scriptId : null)}`],
        ] : []),
      ]);
      if (document.body.dataset.uiLevel === 'advanced')
        section('動きの かず', [
          ['じゅんばんを 待って いる', tasks.filter((t) => t.state === 'READY').length],
          ['何かを 待っている', tasks.filter((t) => t.state === 'BLOCKED').length],
        ]);
      if (appVars.selectedId !== 'stage') {
        const a = appVars.runtime.actor(appVars.selectedId);
        if (a)
          section(appCalls.componentById(appVars.selectedId)?.name || appVars.selectedId, [
            ['よこのばしょ', a.x],
            ['たてのばしょ', a.y],
            ['向き', a.direction],
            ['\u5927\u304d\u3055', a.scalePercent],
            ...a.vars,
            ...a.lists,
          ]);
      }
      if (focus) {
        for (const f of focus.callFrames)
          section('てじゅん ' + f.name, [
            ...Array.from(f.args, ([k, v]) => ['入れるもの ' + k, v]),
            ...Array.from(f.locals, ([k, v]) => ['この中だけの へんすう ' + k, v]),
            ...Array.from(f.localLists, ([k, v]) => ['この中だけのリスト ' + k, v]),
          ]);
      }
      if (document.body.dataset.uiLevel !== 'advanced') return;
      const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('pre');summary.textContent='動きの くわしい きろく';text.textContent=tasks.map(t=>`${t.targetId}: ${t.state}`).join('\n');details.append(summary);renderMonitorSection(details,'同じ 動きに するための かず',[['どれかを えらぶ たね',appVars.runtime.runSeed]]);details.append(text);appVars.el.monitor.append(details);
    }
    // The strip under the stage on the run screen: whose body runs, after which event and on which line, and the sentence
    // itself in a box. At はじめて only the part and the sentence (its blocks have no line numbers, and it has two events).
    // Each part keeps to one line there (a long one ends in …); its title holds the whole text.
    function paintRunStrip(text = '', sentence = '') {
      const location = 'いま 動いている 文：' + (text || '―');
      if (appCalls.$('#execLocation').textContent !== location) appCalls.$('#execLocation').textContent = appCalls.$('#execLocation').title = location;
      if (appCalls.$('#execSentence').textContent !== sentence) appCalls.$('#execSentence').textContent = appCalls.$('#execSentence').title = sentence;
      appCalls.$('#execSentence').hidden = !sentence;
    }
    // follow: the editor shows the body of the sentence that runs (while paused, and when 本文を見て たしかめる opens).
    function paintExecutionLocation({ follow = !!appVars.scheduler?.paused } = {}) {
      if (!appVars.activeLoc) return;
      const loc = appVars.activeLoc,
        parts = loc.key.split(':'),
        scriptKey = parts[0] === 'script' ? loc.key
          : loc.scriptId ? `script:${loc.scriptId}` : `script:${loc.targetId}:${loc.event}`,
        sourceKey = appVars.compiled?.items?.find((item) => item.key === scriptKey)?.documentKey || scriptKey,
        script = scriptBySourceKey(appVars.project, sourceKey),
        def =
          parts[0] === 'action'
            ? appVars.project.actions.find((x) => x.id === parts[1])
            : parts[0] === 'function'
              ? appVars.project.functions.find((x) => x.id === parts[1])
              : null;
      // A 名人 text belongs to no part: its sentences are named by the text (名人の本文 1), not by their subject.
      const owner = def
          ? `${parts[0] === 'action' ? 'てじゅん' : '答えを もとめる'} ${def.name}`
          : appCalls.meijinTextLabel(script) || appCalls.targetById(loc.targetId)?.name || loc.targetId,
        label = document.body.dataset.uiLevel === 'entry' ? owner
          : def ? `${owner} / ${loc.line}行目` : `${owner} / ${appCalls.runtimeEventText(loc.event, scriptKey)} / ${loc.line}行目`;
      paintRunStrip(label, appCalls.runningSentence(def?.source ?? script?.source, loc));
      if (follow) {
        appCalls.hideSourceOverview();
        // Runtime document units have their own IDs; editor selection belongs
        // to the complete source body that can be saved and restored.
        appVars.selectedId = script?.targetId || loc.targetId;
        appVars.currentEvent = script?.event || loc.event;
        appVars.selectedScriptId = script?.id || null;
        const src =
          def?.source ??
          script?.source ??
          '';
        appVars.debugSourceKey = loc.key;
        if (appVars.el.editor.value !== src) appVars.el.editor.value = src;
        renderSelectors();
        renderTree();
        renderProperties();
        if (loc.error) {
          appCalls.showDiagnosticMessage(appVars.el.issue, loc.error, loc.line + '行目', null, src);
          appVars.el.issue.className = 'issue-error';
        }
      }
      appCalls.getEditorSession(appVars.mainEditor);
      renderEditorBinding(appVars.mainEditor);
      if (appVars.mainEditor.session.mode === 'blocks' && appVars.mainEditor.session.ownerKey === loc.key)
        appVars.mainEditor.view.highlight(loc);
      appCalls.updateGutter();
      if (follow) {
        const top = appCalls.wrappedCodeLines().lines[loc.line - 1]?.top || 0;
        if (top < appVars.el.editor.scrollTop || top > appVars.el.editor.scrollTop + appVars.el.editor.clientHeight - 22)
          appVars.el.editor.scrollTop = Math.max(0, top - Math.floor(appVars.el.editor.clientHeight / 3));
        appVars.el.gutter.scrollTop = appVars.el.editor.scrollTop;
      }
    }
    function refreshEditor() {
      if (!appVars.mainEditor.view) return;
      const session = appCalls.getEditorSession(appVars.mainEditor), pending = session.pendingEdit;
      let errs = session.diagnostics?.length ? appCalls.checkedEditorErrors(appVars.mainEditor, session.sourceText, session.diagnostics) : [], notice = '';
      // The visible pending source can differ from the valid project baseline.
      // Never show a baseline success message over a rejected code edit.
      if (appVars.composingEditors.has(appVars.el.editor)) {
        errs = []; notice = '日本語を 入れて いる とちゅうです。文字を 決めてから、書き方を たしかめます';
      } else if (['code','heading-source','source-import'].includes(pending?.kind) && !session.blockDraft) {
        const parsed = parseSyntax(pending.value, { ...appCalls.bindingContext(appVars.mainEditor),
          key: session.ownerKey, symbols: buildSymbols(appVars.project) });
        errs = parsed.syntaxDiagnostics.length ? parsed.syntaxDiagnostics
          : staticScaleDiagnostics(parsed.ast, session.ownerKey);
        // A text that reads but was refused when it was taken (its heading names no part, say) shows that mistake, with
        // its line, as the note under the code does.
        if (!errs.length && pending.kind === 'code' && pending.diagnostics?.length) errs = pending.diagnostics;
        // A body with its own heading is checked for its names and meanings too before the line says it is fine.
        const checked = pending.kind === 'source-import' ? errs
          : appCalls.checkedEditorErrors(appVars.mainEditor, pending.value, errs, pending.kind === 'heading-source' && !errs.length ? parsed.ast : null);
        if (checked === null) notice = '書き方を たしかめて います';
        else {
          errs = checked;
          if (!errs.length) notice = pending.reason || '入力を 決めて ください';
        }
      } else if (session.blockDraft) {
        errs = []; notice = pending?.reason || 'あいている ところに ブロックや 数・文字を 入れて ください';
      } else if (pending) {
        errs = pending.diagnostics?.length ? pending.diagnostics : [];
        if (!errs.length) notice = pending.reason || '入力を 決めて ください';
      }
      const notices = !errs.length && !notice && !pending ? appCalls.bodyNotices(session) : [];
      session.notices = notices;
      if (errs.length) {
        appCalls.showDiagnosticMessage(appVars.el.issue, errs[0], (errs[0].line || 1) + '行目', null, appVars.el.editor.value);
        appVars.el.issue.className = 'issue-error';
      } else if (notices.length) {
        // The first notice from the top, with how many more there are; one that names its fix offers it (I120).
        const first = notices[0];
        appVars.el.issue.textContent = 'ⓘ ' + (first.line || 1) + '行目：' + appCalls.sentence(first.message) + (notices.length > 1 ? `ほかにも 知らせが ${notices.length - 1}つ あります。` : '');
        for (const proposal of first.proposals || []) {
          if (typeof proposal.source !== 'string') continue;
          const fix = document.createElement('button');
          fix.type = 'button'; fix.dataset.noteFix = ''; fix.textContent = proposal.label || proposal.source; fix.title = proposal.source;
          fix.onclick = () => appCalls.applyNoteProposal(first, proposal);
          appVars.el.issue.append(' ', fix);
        }
        appVars.el.issue.className = 'issue-notice';
        if (appVars.editorFailureStatus !== null) {
          if (appVars.el.status.textContent === appVars.editorFailureStatus) appCalls.setStatus('✓ 書き方を 直せたよ');
          appVars.editorFailureStatus = null;
        }
      } else {
        appVars.el.issue.textContent = notice || '✓ このコードの 書き方は だいじょうぶです';
        appVars.el.issue.className = '';
        // The mistake the status line pointed to is gone: say so (a body with its own heading is fine once its check is
        // done), so the line never asks to fix a line that is fine (E2E-R2-11).
        if ((!notice || (pending?.kind === 'heading-source' && notice === pending.reason)) && appVars.editorFailureStatus !== null) {
          if (appVars.el.status.textContent === appVars.editorFailureStatus) appCalls.setStatus('✓ 書き方を 直せたよ');
          appVars.editorFailureStatus = null;
        }
      }
      appCalls.updateGutter(errs, notices);
      renderEditorBinding(appVars.mainEditor);
      if (session.mode === 'code') renderHints();
    }

    function renderHints() {
      if (appVars.composingEditors.has(appVars.el.editor)) return;
      const all = hintCandidates(appVars.project, appVars.selectedId, {
          source: appVars.el.editor.value,
          start: appVars.el.editor.selectionStart,
          end: appVars.el.editor.selectionEnd,
          event: appVars.currentEvent,
          level: document.body.dataset.uiLevel,
          signalNames: appVars.signalNameCache.names,
        }),
        list = appCalls.$('#hintUnavailable').checked ? all : all.filter((x) => x.enabled),
        r = appCalls.drawHints(appVars.el.hints, list, appCalls.$('#hintSearch').value, appVars.hintPage, appCalls.insertHint);
      appVars.hintPage = r.page;
      appCalls.$('#hintCount').textContent = `${r.page + 1}/${r.pages} (${r.total})`;
      appCalls.$('#hintPrev').disabled = r.page === 0;
      appCalls.$('#hintNext').disabled = r.page === r.pages - 1;
    }
    function renderAll() {
      appCalls.applyUiLevel();
      appCalls.applyStage();
      renderTree();
      renderProperties();
      renderSelectors();
      renderComponents();
      renderMonitor();
      appCalls.updateRunState();
      appVars.el.projectName.value = appVars.project.name;
    }
    function renderDataModal() {
      // The choice names what is chosen, as the part tools do (F-23): えらんだ キャラクター, えらんだ 部品.
      const chosen = appCalls.componentById(appVars.selectedId);
      appCalls.$('#dataScope option[value="self"]').textContent = chosen ? 'えらんだ ' + (chosen.type !== 'sprite' ? '部品' : 'キャラクター') : 'えらんだ キャラクターや 部品';
      appCalls.updateDataForm();
      const body = appCalls.$('#dataBody');
      body.textContent = '';
      const scope = appCalls.$('#dataScope').value;
      let vars, lists, label;
      if (scope === 'project') {
        vars = appVars.project.projectData.variables;
        lists = appVars.project.projectData.lists;
        label = '作品';
      } else {
        const c = appCalls.componentById(appVars.selectedId);
        if (!c) {
          body.textContent = 'へんすう・リストを かえる キャラクターや 部品を 先に えらんで ください。';
          return;
        }
        vars = c.localData.variables;
        lists = c.localData.lists;
        label = c.name;
      }
      const h = document.createElement('div');
      h.className = 'asset-target';
      h.textContent = `${label}の へんすう・リスト`;
      body.appendChild(h);
      for (const [kind, arr] of [
        ['へんすう', vars],
        ['リスト', lists],
      ])
        for (const d of arr) {
          const row = document.createElement('div');
          row.className = 'extension-row';
          const info = document.createElement('div');
          info.style.flex = '1';
          const b = document.createElement('b');
          b.textContent = `${kind} ${d.name}`;
          const sm = document.createElement('small');
          sm.textContent = `はじめの 中身：${appCalls.monitorValue(d.initialValue)}${d.expectedUnit ? ` ／使う たんい：${d.expectedUnit}` : ''}`;
          const usage = document.createElement('code');
          usage.textContent = nameSource(d.name, scope === 'project' ? 'project' : 'self');
          info.append(b, sm, usage);
          const inspect = document.createElement('button');
          inspect.textContent = '全部';
          inspect.onclick = () =>
            appCalls.showFullValue(
              d.name,
              Array.isArray(d.initialValue) ? d.initialValue.slice() : d.initialValue,
            );
          info.appendChild(inspect);
          if (kind === 'へんすう') {
            const unit = document.createElement('select');
            unit.setAttribute('aria-label', `${d.name}で 使う たんい`);
            for (const value of ['', ...UNIT_TAGS]) {
              const option = document.createElement('option');
              option.value = value; option.textContent = value || 'たんいを 決めない'; unit.append(option);
            }
            unit.value = d.expectedUnit || '';
            unit.onchange = () => {
              const selected = unit.value || null;
              unit.value = d.expectedUnit || '';
              if (appCalls.modelLocked() || !confirm(`「${d.name}」で 使う たんいを「${selected || '決めない'}」に かえる？ たんいの ない はじめの 中身には、えらんだ たんいを つけるよ。`)) return;
              try {
                validateExpectedUnit(d.initialValue, selected);
                if(selected)d.initialValue=quantity(numberInUnit(d.initialValue,selected),selected);
                if (selected) d.expectedUnit = selected; else delete d.expectedUnit;
                appCalls.markDirty(); renderDataModal(); refreshEditor();
              } catch (error) { appCalls.showDataFormError(error,unit); }
            };
            info.append(unit);
          }
          const del = document.createElement('button');
          del.textContent = 'けす';
          del.onclick = () => {
            if (appCalls.modelLocked()) return;
            if (!appCalls.allowResourceDelete('data:' + d.id, body)) return;
            arr.splice(arr.indexOf(d), 1);
            appCalls.markDirty();
            renderDataModal();
            refreshEditor();
          };
          const rename=document.createElement('button');rename.textContent='名前を かえる';
          rename.onclick=()=>{
            if(appCalls.modelLocked())return;
            const name=prompt('へんすう・リストの 名前',d.name);if(name===null||name.trim()===d.name)return;
            try{
              const next=prepareResourceRename(appVars.project,'data:'+d.id,name.trim(),{drafts:appCalls.resourceDraftRecords()});
              appCalls.dropHistoryTimer();appCalls.pushHistoryNow();appVars.project=next;appCalls.invalidateEditors();appCalls.markDirty();appCalls.pushHistoryNow();renderDataModal();refreshEditor();
            }catch(error){appCalls.showResourceImpact({resource:d,references:[],uncertain:[{title:'名前を かえる',line:1,reason:error.message}]},body,'名前を かえる');}
          };
          row.append(info, rename, del);
          body.appendChild(row);
        }
    }
    function renderCallableList(prefer = '') {
      renderCallableOptions(prefer);
      if (appCalls.hasCallableDraft()) {
        paintCallable();
        return;
      }
      const first = prefer || appCalls.$('#callableSelect').options[0]?.value;
      if (first) appCalls.loadCallable(first);
      else appCalls.clearCallable();
    }
    function renderCallableHints() {
      const root = appCalls.$('#callableHints'),
        t = appCalls.$('#callableCode');
      if (!root || appVars.composingEditors.has(t)) return;
      let args = appCalls.$('#callableArgs')
        .value.split(/[\u3001,]/)
        .map((x) => normalizeCharsOutsideString(x.trim()))
        .filter(Boolean);
      args = args.filter((x) => {
        try {
          validateName(x);
          return true;
        } catch (_) {
          return false;
        }
      });
      let list;
      try {
        list = hintCandidates(appVars.project, appVars.selectedId, {
          source: t.value,
          start: t.selectionStart,
          end: t.selectionEnd,
          definitionKind: appCalls.$('#callableType').value,
          args,
          signalNames: appVars.signalNameCache.names,
        }).filter((x) => x.enabled);
      } catch (_) {
        root.textContent = '';
        return;
      }
      const r = appCalls.drawHints(root, list, appCalls.$('#callableHintSearch').value, appVars.callableHintPage, (h) => {
        if (appCalls.modelLocked() || appVars.composingEditors.has(t)) return;
        try {
          const result = insertSource(t.value, t.selectionStart, t.selectionEnd, h.text, h.mode);
          t.value = result.source;
          t.setSelectionRange(result.start, result.end);
          appCalls.updateCallableHeader();
          t.focus();
        } catch (err) {
          appCalls.log(`${err.code || ''} ${err.message}`, 'error');
        }
      });
      appVars.callableHintPage = r.page;
      appCalls.$('#callableHintCount').textContent = `${r.page + 1}/${r.pages} (${r.total})`;
      appCalls.$('#callableHintPrev').disabled = r.page === 0;
      appCalls.$('#callableHintNext').disabled = r.page === r.pages - 1;
    }
    function renderAppearance() {
      const body = appCalls.$('#assetBody');
      body.textContent = '';
      const advanced = document.body.dataset.uiLevel !== 'basic',
        c = appCalls.componentById(appVars.selectedId),
        hint = appCalls.$('#costumeImageHint'),
        thumb = (assetId) => {
          const img = document.createElement('img');
          img.src = appCalls.designImageUrl(assetId);
          img.alt = '';
          img.style.cssText =
            'width:64px;height:48px;object-fit:contain;background:#fff;border:1px solid #ccd7e4;border-radius:7px';
          return img;
        },
        // The resource kind is passed in, never derived from the on-screen label.
        rename = (obj, arr, label, kind) => {
          if (appCalls.modelLocked()) return;
          const v = prompt(`${label}の名前`, obj.name);
          if (v === null) return;
          try {
            validateResourceName(v, label + 'の名前');
            if (arr.some((x) => x !== obj && x.name === v))
              throw new AkariError('F503', `同じ ${label}の 名前が あります。ちがう 名前に して ください`);
            const options = { drafts: appCalls.resourceDraftRecords() }, impact = resourceChangeImpact(appVars.project, `${kind}:${obj.id}`, options);
            if (impact.uncertain.length) { appCalls.showResourceImpact(impact, body, '名前を かえる'); return; }
            const next = prepareResourceRename(appVars.project, `${kind}:${obj.id}`, v, options);
            appCalls.dropHistoryTimer(); appCalls.pushHistoryNow(); appVars.project = next;
            appCalls.markDirty();
            appCalls.pushHistoryNow();
            renderAll(); appCalls.loadEditor();
            renderAppearance();
            refreshEditor();
          } catch (e) {
            appCalls.showResourceImpact({resource:obj,references:[],uncertain:[{title:'名前を かえる',line:1,reason:e.message}]},body,'名前を かえる');
          }
        };
      if (hint)
        hint.textContent =
          c?.type === 'sprite'
            ? `「${c.name}」の すがたとして 入れます。`
            : '先に キャラクターを えらぶと、その キャラクターの すがたとして 入れられます。';
      let h = document.createElement('h3');
      h.textContent = 'はいけい';
      body.appendChild(h);
      const fitLabels = { contain: 'ぜんぶ 見せる', cover: '画面いっぱい', stretch: 'のばして 合わせる' };
      for (const b of appVars.project.stage.backdrops) {
        const row = document.createElement('div');
        row.className = 'extension-row';
        row.style.alignItems = 'center';
        let preview;
        if (b.kind === 'color') {
          preview = document.createElement('div');
          preview.style.cssText = `width:64px;height:48px;border:1px solid #aaa;background:${b.value};border-radius:7px`;
        } else preview = thumb(b.assetId);
        const info = document.createElement('div');
        info.style.flex = '1';
        const title = document.createElement('b');
        title.textContent = b.name;
        const sm = document.createElement('small');
        sm.textContent = b.kind === 'color' ? `色の はいけい ${b.value}` : `絵の はいけい / ${fitLabels[b.fit] || b.fit}`;
        info.append(title, sm);
        const use = document.createElement('button');
        use.textContent = b.id === appVars.project.stage.backdropId ? '使用中' : '使う';
        use.disabled = b.id === appVars.project.stage.backdropId || appCalls.modelLocked();
        use.onclick = () => {
          if (appCalls.modelLocked()) return;
          appVars.project.stage.backdropId = b.id;
          appCalls.markDirty();
          renderAll();
          renderAppearance();
        };
        row.append(preview, info, use);
        if (advanced) {
          const rn = document.createElement('button');
          rn.textContent = '名前を かえる';
          rn.onclick = () => rename(b, appVars.project.stage.backdrops, 'はいけい', 'backdrop');
          row.appendChild(rn);
          if (b.kind === 'image') {
            const fit = document.createElement('select');
            for (const x of ['contain', 'cover', 'stretch']) {
              const o = document.createElement('option');
              o.value = x;
              o.textContent = fitLabels[x];
              fit.appendChild(o);
            }
            fit.value = b.fit;
            fit.disabled = appCalls.modelLocked();
            fit.onchange = () => {
              if (appCalls.modelLocked()) {
                fit.value = b.fit;
                return;
              }
              b.fit = fit.value;
              appCalls.markDirty();
              renderAll();
            };
            const fill = document.createElement('input');
            fill.value = b.fill;
            fill.style.width = '82px';
            fill.disabled = appCalls.modelLocked();
            fill.onchange = () => {
              if (appCalls.modelLocked()) {
                fill.value = b.fill;
                return;
              }
              if (!validateColorHex(fill.value)) {
                fill.value = b.fill;
                return;
              }
              b.fill = fill.value.toLowerCase();
              appCalls.markDirty();
              renderAll();
            };
            row.append(fit, fill);
          }
          const del = document.createElement('button');
          del.textContent = 'けす';
          del.disabled = appVars.project.stage.backdrops.length <= 1 || appCalls.modelLocked();
          del.onclick = () => {
            if (appCalls.modelLocked()) return;
            if (!appCalls.allowResourceDelete('backdrop:' + b.id, body)) return;
            appVars.project.stage.backdrops.splice(appVars.project.stage.backdrops.indexOf(b), 1);
            if (appVars.project.stage.backdropId === b.id)
              appVars.project.stage.backdropId = appVars.project.stage.backdrops[0].id;
            appCalls.compactCurrentAssets();
            appCalls.revokeDesignUrls();
            appCalls.markDirty();
            renderAll();
            renderAppearance();
          };
          row.appendChild(del);
        }
        body.appendChild(row);
      }
      appCalls.$('#costumeImageAdd').disabled = appCalls.modelLocked() || c?.type !== 'sprite';
      if (c?.type === 'sprite') {
        h = document.createElement('h3');
        h.textContent = `${c.name} の すがた`;
        body.appendChild(h);
        for (const co of c.costumes) {
          const row = document.createElement('div');
          row.className = 'extension-row';
          row.style.alignItems = 'center';
          let preview;
          if (co.kind === 'image') preview = thumb(co.assetId);
          else {
            preview = document.createElement('div');
            preview.className = 'asset-placeholder';
            preview.style.cssText = 'width:64px;height:48px';
            preview.textContent = co.value;
          }
          const info = document.createElement('div');
          info.style.flex = '1';
          const title = document.createElement('b');
          title.textContent = co.name;
          const sm = document.createElement('small');
          sm.textContent = co.kind === 'image' ? '絵の すがた' : '文字の すがた';
          info.append(title, sm);
          const use = document.createElement('button');
          use.textContent = co.id === c.costumeId ? '使用中' : '使う';
          use.disabled = co.id === c.costumeId || appCalls.modelLocked();
          use.onclick = () => {
            if (appCalls.modelLocked()) return;
            c.costumeId = co.id;
            appCalls.markDirty();
            renderAll();
            renderAppearance();
          };
          row.append(preview, info, use);
          if (advanced) {
            const rn = document.createElement('button');
            rn.textContent = '名前を かえる';
            rn.onclick = () => rename(co, c.costumes, 'すがた', 'costume');
            const del = document.createElement('button');
            del.textContent = 'けす';
            del.disabled = c.costumes.length <= 1 || appCalls.modelLocked();
            del.onclick = () => {
              if (appCalls.modelLocked()) return;
              if (!appCalls.allowResourceDelete('costume:' + co.id, body)) return;
              c.costumes.splice(c.costumes.indexOf(co), 1);
              if (c.costumeId === co.id) c.costumeId = c.costumes[0].id;
              appCalls.compactCurrentAssets();
              appCalls.revokeDesignUrls();
              appCalls.markDirty();
              renderAll();
              renderAppearance();
            };
            row.append(rn, del);
          }
          body.appendChild(row);
        }
      }
      h = document.createElement('h3');
      h.textContent = '音';
      body.appendChild(h);
      if (!appVars.project.sounds.length) {
        const e = document.createElement('div');
        e.className = 'monitor-empty';
        e.textContent = '音は まだ ありません。';
        body.appendChild(e);
      }
      for (const snd of appVars.project.sounds) {
        const a = appVars.assetStore.get(snd.assetId),
          row = document.createElement('div');
        row.className = 'extension-row';
        row.style.alignItems = 'center';
        const ico = document.createElement('div');
        ico.className = 'asset-placeholder';
        ico.style.cssText = 'width:64px;height:48px';
        ico.textContent = '♪';
        const info = document.createElement('div');
        info.style.flex = '1';
        const title = document.createElement('b');
        title.textContent = snd.name;
        const sm = document.createElement('small');
        sm.textContent = a?.meta?.duration ? `${a.meta.duration.toFixed(2)}秒` : '音';
        info.append(title, sm);
        row.append(ico, info);
        if (advanced) {
          const prev = document.createElement('button');
          prev.textContent = '鳴らす';
          prev.onclick = () => appCalls.previewSound(snd);
          const stop = document.createElement('button');
          stop.textContent = '止める';
          stop.onclick = appCalls.stopPreview;
          const rn = document.createElement('button');
          rn.textContent = '名前を かえる';
          rn.onclick = () => rename(snd, appVars.project.sounds, '音', 'sound');
          const del = document.createElement('button');
          del.textContent = 'けす';
          del.disabled = appCalls.modelLocked();
          del.onclick = () => {
            if (appCalls.modelLocked()) return;
            if (!appCalls.allowResourceDelete('sound:' + snd.id, body)) return;
            appCalls.stopPreview();
            appVars.project.sounds.splice(appVars.project.sounds.indexOf(snd), 1);
            appCalls.compactCurrentAssets();
            appCalls.markDirty();
            renderAppearance();
            refreshEditor();
          };
          row.append(prev, stop, rn, del);
        }
        body.appendChild(row);
      }
    }
    Object.assign(appCalls, {
      paintBindingModeToggle,
      refreshEditor,
      refreshTutorialPresentation,
      renderAll,
      renderAppearance,
      renderCallableHints,
      renderCallableList,
      renderDataModal,
      renderEditorBinding,
      renderEntrySurface,
      renderFailureDetails,
      renderFullValue,
      renderHints,
      renderMonitor,
      renderSelectors,
      renderSourceOverview,
    });
    Object.assign(appRedraw, {
      all: renderAll,
      appearance: renderAppearance,
      bindingModeToggle: paintBindingModeToggle,
      callable: paintCallable,
      callableHints: renderCallableHints,
      callableList: renderCallableList,
      callableOptions: renderCallableOptions,
      colorPreview: paintColorPreview,
      components: renderComponents,
      dataModal: renderDataModal,
      editor: refreshEditor,
      editorBinding: renderEditorBinding,
      entrySurface: renderEntrySurface,
      executionLocation: paintExecutionLocation,
      failureDetails: renderFailureDetails,
      fullValue: renderFullValue,
      hints: renderHints,
      monitor: renderMonitor,
      properties: renderProperties,
      resizePreview: paintResizePreview,
      runStrip: paintRunStrip,
      selectors: renderSelectors,
      sourceOverview: renderSourceOverview,
      tree: renderTree,
      tutorialChoices: renderTutorialChoices,
      tutorialPresentation: refreshTutorialPresentation,
    });
  }
