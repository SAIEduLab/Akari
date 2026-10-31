  // ────────────────────────────────────────────────────────────────────────
  // 11 — Design view, part properties, assets and committing source
  // ────────────────────────────────────────────────────────────────────────
  // Called once at the start of initApp: appVars is the state it shares, appCalls the functions other parts call.
  function createAppDesign(appVars, appCalls) {
    function syncPropertyScrollPadding() {
      const actions = appVars.el.props.querySelector(':scope > .prop-actions');
      appVars.el.props.style.setProperty('--prop-actions-height', (actions?.offsetHeight || 0) + 'px');
    }
    function invalidateEditors() {
      appVars.editorContextRevision++;
    }
    function sourceCandidate(binding, ownerKey, source) {
      if (cpLen(source) > LIMITS.sourceEach)
        throw new AkariError('F504', '本文の 文字が 多すぎます。文を へらして ください');
      const parsed = parseSyntax(source, { ...appCalls.bindingContext(binding), key: ownerKey,
        symbols: buildSymbols(appVars.project) });
      if (!parsed.ast) {
        const first = parsed.syntaxDiagnostics[0] || { code: 'P201', message: '文を さいごまで 書いて ください' };
        const error = new AkariError(first.code, first.message, first.line, first.column);
        error.diagnostics = parsed.syntaxDiagnostics;
        error.proposals = first.proposals || first.choices || [];
        error.proposalSource = source;
        throw error;
      }
      const scaleErrors = staticScaleDiagnostics(parsed.ast, ownerKey);
      if (scaleErrors.length) {
        const first = scaleErrors[0], error = new AkariError(first.code, first.message, first.line, first.column);
        error.diagnostics = scaleErrors;
        throw error;
      }
      const next = cloneDesignProject(appVars.project),
        [kind, id, event] = ownerKey.split(':');
      if (binding.kind === 'draft') {
        const other = [...next.scripts, ...next.actions, ...next.functions].filter(
          (x) => x.id !== appVars.callableDraftCore.editId,
        );
        if (other.reduce((n, x) => n + cpLen(x.source), 0) + cpLen(source) > LIMITS.sourceTotal)
          throw new AkariError('F504', '作品全体の 本文の 文字が 多すぎます。文を へらして ください');
        appCalls.validateCallableDraft({ ...appVars.callableDraftCore, source });
        return null;
      }
      if (kind !== 'script') throw new AkariError('F503', '動いている あいだは、自分で作ったブロックの 本文を なおせません');
      const old = scriptBySourceKey(next, ownerKey);
      if (old) {
        // Keep the edited body's identity when its heading changes event or actor.
        // Imported and initial bodies may predate explicit script IDs.
        const metadata = scriptHeadingMetadata(source, old, next);
        if (!old.id && (metadata.targetId !== old.targetId || metadata.event !== old.event))
          old.id = ensureUniqueId('script');
        updateScriptSource(old, source, next);
      }
      else if (source) {
        const row = (event ? id : appVars.selectedId) === MEIJIN_OWNER ? { id: event ? ensureUniqueId('script') : id, mode: 'meijin', targetId: MEIJIN_OWNER, event: 'start', source: '' }
          : { id: event ? ensureUniqueId('script') : id, targetId: event ? id : appVars.selectedId, event: event || appVars.currentEvent, source: '', ...newBodyFilter(event || appVars.currentEvent) };
        updateScriptSource(row, source, next);
        next.scripts.push(row);
      }
      validateDesignProject(next);
      return next;
    }
    function commitSource(binding, source, { atomic = false, flushQueued = false } = {}) {
      if (modelLocked()) return false;
      const ownerKey = appCalls.bindingOwner(binding),
        before = appCalls.readSource(binding, ownerKey);
      if (source === before) return false;
      const next = sourceCandidate(binding, ownerKey, source);
      if (atomic) {
        if (flushQueued && appVars.queuedHistory) pushHistoryNow(appVars.queuedHistory);
        dropHistoryTimer();
        const session = binding.session, pending = session?.pendingEdit;
        const importing = binding === appVars.mainEditor && pending?.kind === 'source-import' &&
          session.ownerKey === ownerKey && pending.ownerKey === ownerKey &&
          pending.value === source && !session.blockDraft;
        if (importing) {
          // The confirmed input is not the valid body before this atomic change.
          session.pendingEdit = null;
          try { if (!appCalls.hasPendingEditor()) pushHistoryNow(); }
          finally { session.pendingEdit = pending; }
        } else if (!appCalls.hasPendingEditor()) pushHistoryNow();
      }
      if (binding.kind === 'draft') appVars.callableDraftCore = { ...appVars.callableDraftCore, source };
      else {
        const old = scriptBySourceKey(appVars.project, ownerKey),
          oldIndex = old ? appVars.project.scripts.indexOf(old) : -1,
          row = scriptBySourceKey(next, ownerKey) ||
            (oldIndex >= 0 ? next.scripts[oldIndex] : next.scripts.at(-1));
        appVars.project = next;
        if (row) {
          const changedOwner = appVars.selectedId !== row.targetId;
          appVars.selectedId = row.targetId; appVars.currentEvent = row.event; appVars.selectedScriptId = row.id || null;
          if (changedOwner) { appCalls.renderTree(); renderProperties(); }
        }
        appCalls.renderSelectors();
      }
      invalidateEditors();
      appCalls.getEditorSession(binding, { force: true });
      binding.session.pendingEdit = null;
      appCalls.clearEditorFailure(binding);
      markDirty();
      if (atomic) {
        dropHistoryTimer();
        pushHistoryNow();
      }
      if (binding.kind === 'draft') appCalls.paintCallable();
      return true;
    }
    function confirmSourceImport(binding, source, separate = false, editCurrent = false) {
      if (modelLocked() || appVars.composingEditors.has(binding.textarea) || binding.textarea.value !== source) return false;
      try {
        const plan = appCalls.sourceImportPlan(binding, source);
        if (!plan || (editCurrent ? !plan.canEditCurrent : (!separate && !plan.safe) || (plan.hasExisting && !plan.canSplit))) return false;
        if (editCurrent || !plan.hasExisting) {
          commitSource(binding, source, { atomic: true });
          appCalls.hideSourceImport(); appCalls.renderEditorBinding(binding); appCalls.refreshEditor();
          appCalls.setStatus('書いた 文を 本文に 入れたよ'); return true;
        }
        const next = cloneDesignProject(appVars.project), old = scriptBySourceKey(next, plan.ownerKey),
          incoming = plan.entries.filter(x => separate || !x.equal), ids = allIds();
        const fresh = () => { let n = 1; while (ids.has('import-script-' + n)) n++; const id = 'import-script-' + n; ids.add(id); return id; };
        const selectedEntry = incoming.find(x => x.metadata.targetId === plan.context.targetId &&
          x.metadata.event === plan.context.event && stableJson(x.metadata.filter || null) === stableJson(plan.context.filter || null));
        let destination = null;
        for (const entry of incoming) {
          const row = entry === selectedEntry && old && !old.source.trim() ? old : { id: fresh(), ...entry.metadata, source: '' };
          updateScriptSource(row, entry.text, next);
          if (row !== old) next.scripts.push(row);
          if (entry === selectedEntry || !destination) destination = row;
        }
        // If every incoming unit is explicitly retained, keep the editing destination unchanged.
        destination ||= old;
        validateDesignProject(next);
        if (plan.projectFingerprint !== appCalls.currentFingerprint() || plan.ownerKey !== appCalls.bindingOwner(binding))
          throw new AkariError('F503', '取りこむ ところが かわりました。もう一度 中身を たしかめて ください');
        dropHistoryTimer();
        binding.session.pendingEdit = null; binding.textarea.value = appCalls.readSource(binding);
        appCalls.hideSourceImport(); pushHistoryNow();
        appVars.project = next;
        if (destination) { appVars.selectedId = destination.targetId; appVars.currentEvent = destination.event; appVars.selectedScriptId = destination.id || null; }
        invalidateEditors(); appCalls.clearEditorFailure(binding); markDirty(); appCalls.renderTree(); renderProperties(); appCalls.loadEditor();
        dropHistoryTimer(); pushHistoryNow();
        appCalls.setStatus('いまの 本文は のこして、えらんだ ところに 本文を 入れたよ'); return true;
      } catch (error) { return appCalls.showEditorFailure(binding, error, { preservePending: true }); }
    }
    function showSourceImport(binding, source, plan) {
      const root = appCalls.$('#sourceImport'); root.replaceChildren(); root.hidden = false;
      // The panel speaks of 本文 (F-23), in the plain voice of a confirmation (F-18), spaced by phrase (F-19).
      const heading = document.createElement('strong'); heading.textContent = '本文を 入れる ところを たしかめる'; root.append(heading);
      for (const entry of plan.entries) {
        const actor = appCalls.targetById(entry.metadata.targetId)?.name || 'この 本文', event = entry.metadata.event,
          label = actor + '・' + eventText(event, entry.metadata.filter);
        const row = document.createElement('p');
        row.textContent = entry.candidates.length ? label + 'には いまの 本文が あるよ' : label + 'に 新しい 本文を 入れるよ'; root.append(row);
        {
          const details = document.createElement('details'), summary = document.createElement('summary');
          summary.textContent = entry.candidates.length ? (entry.equal ? 'いまの 本文は そのまま のこすよ' : 'いまの 本文と 取りこむ 本文を くらべる') : '新しく 入れる 本文を 見る'; details.append(summary);
          if(plan.canEditCurrent && !plan.safe)details.open = true;
          for (const text of [...entry.candidates.map(x => 'いまの 本文：\n' + x.text), '取りこむ 本文：\n' + entry.text]) {
            const pre = document.createElement('pre'); pre.textContent = text; pre.style.whiteSpace = 'pre-wrap'; pre.style.maxHeight = '140px'; pre.style.overflow = 'auto'; details.append(pre);
          }
          root.append(details);
        }
      }
      if (!plan.safe) {
        const notice = document.createElement('p'); notice.textContent = !plan.canSplit
          ? '本文を べつべつに 分けられないよ。前の「始めると、」などを 使う 文が あるよ。書きかけの 文章は のこって いるよ。「取りこみを やめる」で いまの 本文に もどれるよ。'
          : '同じ きっかけの 本文が いまの 本文と ちがうか、2つ いじょう あるよ。入れても いまの 本文は のこるよ。くらべてから ボタンを えらんでね。'; root.append(notice);
      }
      const confirm = document.createElement('button'); confirm.type = 'button'; confirm.id = 'sourceImportConfirm';
      confirm.textContent = plan.hasExisting ? 'いまの 本文を のこして 入れる' : '書いた 文を 本文に 入れる'; confirm.disabled = !plan.safe;
      confirm.onclick = () => confirmSourceImport(binding, source); root.append(confirm);
      if (plan.hasExisting && !plan.safe && plan.canSplit) {
        const separate = document.createElement('button'); separate.type = 'button'; separate.id = 'sourceImportSeparate';
        separate.textContent = 'いまの 本文を のこして、べつの 本文として 入れる'; separate.onclick = () => confirmSourceImport(binding, source, true); root.append(separate);
      }
      if(plan.canEditCurrent && !plan.safe){
        const edit = document.createElement('button'); edit.type = 'button'; edit.id = 'sourceImportEditCurrent';
        edit.textContent = 'この 本文を 取りこむ 本文に かえる'; edit.onclick = () => confirmSourceImport(binding, source, false, true);root.append(edit);
      }
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.id = 'sourceImportCancel'; cancel.textContent = '取りこみを やめる';
      cancel.onclick = () => appCalls.cancelEditorPending(binding); root.append(cancel);
    }
    function renameMeijinProcedure() {
      if (modelLocked() || !appVars.meijinProcedureId) return;
      try {
        const next = prepareMeijinProcedureRename(appVars.project, appVars.meijinProcedureId, appCalls.$('#meijinProcName').value);
        dropHistoryTimer(); pushHistoryNow();
        appVars.project = next;
        invalidateEditors(); markDirty(); pushHistoryNow();
        appCalls.renderCallableOptions('meijin:' + appVars.meijinProcedureId); appCalls.showMeijinProcedure(appVars.meijinProcedureId);
        appCalls.loadEditor(); appCalls.refreshEditor();
        appCalls.log('名人の本文で 作った てじゅんの 名前を かえました', 'ok');
      } catch (error) {
        appCalls.$('#meijinProcError').hidden = false;
        appCalls.$('#meijinProcError').textContent = error.message;
      }
    }
    function releaseShellPointer() {
      const token = appVars.shellPointer;
      if (!token) return;
      appVars.shellPointer = null;
      token.cleanup();
      appCalls.renderEditorBinding(appVars.mainEditor);
    }
    const allIds = () => {
      const z = new Set(['stage']);
      for (const b of appVars.project.stage.backdrops) z.add(b.id);
      for (const d of [...appVars.project.projectData.variables, ...appVars.project.projectData.lists]) z.add(d.id);
      for (const c of appVars.project.components) {
        z.add(c.id);
        for (const d of [...c.localData.variables, ...c.localData.lists]) z.add(d.id);
        for (const co of c.costumes || []) z.add(co.id);
      }
      for (const a of [...appVars.project.scripts, ...appVars.project.actions, ...appVars.project.functions, ...appVars.project.sounds])
        if (a.id) z.add(a.id);
      for(const script of appVars.project.scripts)for(const id of script.document?.unitIds||[])z.add(id);
      for (const id of appVars.assetStore.ids()) z.add(id);
      return z;
    };
    const componentById = (id) => appVars.project.components.find((c) => c.id === id);
    const modelLocked = () => appVars.appState !== 'DESIGN' || !!appVars.runtime || !!appVars.scheduler;
    function revokeDesignUrls() {
      for (const u of appVars.designObjectUrls.values()) URL.revokeObjectURL(u);
      appVars.designObjectUrls.clear();
    }
    function designImageUrl(id) {
      if (appVars.runtimeCache?.objectUrls?.has(id)) return appVars.runtimeCache.objectUrls.get(id);
      if (appVars.designObjectUrls.has(id)) return appVars.designObjectUrls.get(id);
      const a = appVars.assetStore.get(id);
      if (!a || a.kind !== 'image') return '';
      const u = URL.createObjectURL(new Blob([a.bytes], { type: a.mime }));
      appVars.designObjectUrls.set(id, u);
      return u;
    }
    function compactCurrentAssets() {
      appVars.assetStore = appVars.assetStore.retainOnly(collectReachableAssetIds(appVars.project));
    }
    function pushHistoryNow(e = appCalls.snapshot()) {
      // An immediate snapshot supersedes the queued edit's older view state.
      dropHistoryTimer();
      appVars.lastObservedFingerprint = e.stateFingerprint;
      if (!appVars.history.length || appVars.history.at(-1).stateFingerprint !== e.stateFingerprint) {
        appVars.history.push(e);
        if (appVars.history.length > Math.max(1, Math.floor(LIMITS.historyEntries / 2))) appVars.history.shift();
        appVars.redo = [];
      } else appVars.history[appVars.history.length - 1] = e;
      appCalls.updateDirty();
    }
    function ensureUniqueId(prefix, ids = allIds()) {
      let n = 1,
        id;
      do {
        id = `${prefix}-${n++}`;
      } while (ids.has(id));
      ids.add(id);
      return id;
    }
    function dropHistoryTimer() { clearTimeout(appVars.historyTimer); appVars.historyTimer=0; appVars.queuedHistory=null; }
    function queueHistory(fingerprint, stateFingerprint) {
      if (modelLocked()) return;
      dropHistoryTimer();
      const queued = appCalls.snapshot(fingerprint, stateFingerprint);
      appVars.queuedHistory = queued;
      appVars.historyTimer = setTimeout(() => {
        pushHistoryNow(queued);
      }, 250);
    }
    function markDirty() {
      if (modelLocked()) return;
      invalidateEditors();
      const fingerprint = appCalls.currentFingerprint(), fp = appCalls.stateFingerprintCore(fingerprint);
      if (fp === appVars.lastObservedFingerprint) return;
      appVars.lastObservedFingerprint = fp;
      appVars.keptFail = null;
      // An edit is a new action: the result of the one before (開いたよ, ほぞんしたよ, からっぽの 作品 …) goes away unless
      // this edit says something itself. A mistake that is still there stays (editorFailureStatus).
      const serial = appVars.statusSerial;
      queueMicrotask(() => {
        if (appVars.statusSerial === serial && !modelLocked() && appVars.el.status.textContent !== appVars.editorFailureStatus) appCalls.setStatus('');
      });
      appVars.recoveryEpoch++;
      if (appVars.history.at(-1)?.stateFingerprint !== fp) appVars.redo = [];
      appCalls.updateDirty();
      queueHistory(fingerprint, fp);
      appCalls.scheduleAutosave();
    }
    // A new touch body touches the stage edge until its partner is chosen (いつ動く？) or written in its heading.
    const newBodyFilter = event => event === 'touchStart' ? { filter: { target: '端' } } : {};
    // How far a press must move before it carries a part or a handle, in screen pixels: a finger wobbles more than a
    // mouse or a pen (Chrome's own tap slop is about 15 px).
    const pointerSlop = (e) => e.pointerType === 'touch' ? 8 : 3;
    // On a small on-screen part, edge handles would cover the picture: only the corners show, just outside the part.
    function designHandlesSmall(c) {
      const stageScale = appVars.el.form.getBoundingClientRect().width / appVars.project.stage.width || 1, s = c.scalePercent / 100;
      return designResizeMode(c) === 'box' && Math.min(c.w * s, c.h * s) * stageScale < 64;
    }
    // How the handles are shown is decided when they are first shown for a part at its size and screen scale, and a
    // drag keeps it from the press through the release (A-R2-05, A-08): the handle stays under the pointer after a drag
    // that made a small part larger than 64 px. A change made another way (せってい, keys, もとに もどす, the screen's
    // zoom) or another part decides it again.
    const designHandleKey = (c) => [c.id, c.w, c.h, c.scalePercent, Math.round(appVars.el.form.getBoundingClientRect().width * 100)].join(' ');
    function designHandlesSmallShown(c) {
      if (appVars.designResizeSmall !== null) return appVars.designResizeSmall;
      const key = designHandleKey(c);
      if (appVars.designHandlesShown?.key !== key) appVars.designHandlesShown = { key, small: designHandlesSmall(c) };
      return appVars.designHandlesShown.small;
    }
    function positionResizeHandles(c = appVars.designResizePreview || componentById(appVars.selectedId)) {
      if (!c) return;
      // On a touch screen a handle is a 24 px dot that a finger presses within 40 px (E-19).
      const coarse = matchMedia('(pointer: coarse)').matches, hit = coarse ? 40 : 24, dot = coarse ? 24 : 12;
      const rect = appVars.el.form.getBoundingClientRect(),
        stageScale = rect.width / appVars.project.stage.width || 1,
        s = c.scalePercent / 100;
      for (const handle of appVars.el.form.querySelectorAll('.design-resize-handle')) {
        if (handle.dataset.resizeFor !== c.id) continue;
        const p = designResizePoint(c, handle.dataset.resizeDirection),
          [hx, hy] = DESIGN_RESIZE_DIRECTIONS[handle.dataset.resizeDirection];
        handle.style.left = p.x + 'px';
        handle.style.top = appVars.project.stage.height - p.y + 'px';
        handle.style.width = handle.style.height = hit / stageScale + 'px';
        handle.style.minWidth = handle.style.minHeight = '0';
        handle.style.setProperty('--resize-dot', dot / stageScale + 'px');
        handle.style.setProperty('--resize-stroke', 1.5 / stageScale + 'px');
        handle.hidden = false;
        if (designResizeMode(c) === 'box') {
          // On a small on-screen part, edge handles would cover the picture: keep
          // only the corners and move them just outside the part.
          const small = designHandlesSmallShown(c),
            rad = ((c.direction % 360) * Math.PI) / 180,
            px = small ? hx * 12 / stageScale : appVars.designResizeSmall !== null ? 0 : hx * Math.max(0, 18 / stageScale - (c.w * s) / 2),
            py = small ? hy * 12 / stageScale : appVars.designResizeSmall !== null ? 0 : hy * Math.max(0, 18 / stageScale - (c.h * s) / 2);
          handle.hidden = small && (hx === 0 || hy === 0);
          // The offset is along the part's screen axes, which are turned by −向き on the screen.
          handle.style.left = p.x + px * Math.cos(rad) + py * Math.sin(rad) + 'px';
          handle.style.top = appVars.project.stage.height - p.y - px * Math.sin(rad) + py * Math.cos(rad) + 'px';
        }
        const angle = (Math.atan2(hy, hx) * 180) / Math.PI - c.direction;
        handle.style.cursor = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][
          ((Math.round(angle / 45) % 4) + 4) % 4
        ];
      }
      updateDesignHelp(appVars.el.form.querySelector('.design-resize-handle') ? c : null);
      const outline = appVars.el.form.querySelector('.design-resize-outline');
      if (outline)
        Object.assign(outline.style, {
          left: c.x - (c.w * s) / 2 + 'px',
          top: appVars.project.stage.height - c.y - (c.h * s) / 2 + 'px',
          width: c.w * s + 'px',
          height: c.h * s + 'px',
          transform: `rotate(${-c.direction}deg)`,
          borderWidth: 1.5 / stageScale + 'px',
        });
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
      positionResizeHandles(c);
    }
    function commitResize(c, next) {
      if (modelLocked() || componentById(c.id) !== c) return false;
      if (Object.keys(next).every((k) => Math.abs(c[k] - next[k]) < 1e-9)) return false;
      const candidate = cloneDesignProject(appVars.project);
      Object.assign(
        candidate.components.find((x) => x.id === c.id),
        next,
      );
      validateDesignProject(candidate);
      Object.assign(c, next);
      markDirty();
      dropHistoryTimer();
      pushHistoryNow();
      return true;
    }
    function focusResizeHandle(id, direction) {
      appVars.el.form
        .querySelector(
          `.design-resize-handle[data-resize-for="${CSS.escape(id)}"][data-resize-direction="${direction}"]`,
        )
        ?.focus({ preventScroll: true });
    }
    // What the handles' and zoom's titles say is written under the screen at はじめて (E-22): how the
    // handles change a part's size while a part shows them, and how to see the screen at 100%. The other levels have it
    // beside each relevant control.
    function updateDesignHelp(c = appVars.el.form.querySelector('.design-resize-handle') && componentById(appVars.selectedId)) {
      const help = appCalls.$('#designHelp'), mode = c ? designResizeMode(c) : null,
        zoom = appCalls.$('#stageZoomReset').textContent.trim();
      help.textContent = (!mode ? '' : mode === 'scale'
        ? '青い 丸を おしたまま ひっぱると、形を かえずに 大きく・小さく できるよ。'
        : '青い 丸を おしたまま ひっぱると、大きさが かわるよ。' + (matchMedia('(pointer: coarse)').matches
          ? '「たて・よこを そろえる」を おしてから ひっぱると、形は そのままだよ。'
          : 'Shiftキーを おしながら 角の 丸を ひっぱると、形は そのままだよ。'))
        + (zoom && zoom !== '100%' ? '上の「' + zoom + '」を おすと、画面を 100%で 見られるよ。' : '');
      help.hidden = !help.textContent;
    }
    function renderResizeHandle() {
      appVars.el.form
        .querySelectorAll('.design-resize-handle,.design-resize-outline')
        .forEach((n) => n.remove());
      appCalls.$('#designRatioLock').hidden = true;
      updateDesignHelp(null);
      if (modelLocked() || appVars.selectedId === 'stage') return;
      const c = componentById(appVars.selectedId),
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
          if (!modelLocked() && appCalls.flushActiveEditor()) startResize(e, c.id, direction);
          else releaseShellPointer();
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
            modelLocked()
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
          dropHistoryTimer();
          pushHistoryNow();
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
            changed = commitResize(c, next);
            if (changed) appCalls.refreshEditor();
          } catch (error) {
            appCalls.log(error.message, 'error');
          }
          renderProperties();
          renderComponents();
          focusResizeHandle(c.id, direction);
          // The size is said as the pointer path says it (「はば 120　高さ 80」, or 「星1: 110%」), and read out (#statusLive).
          appCalls.setStatus(changed ? (mode === 'scale' ? `${c.name}の 大きさ ${c.scalePercent}％` : `はば ${c.w}　高さ ${c.h}`) : '大きさは かわって いないよ');
        });
        appVars.el.form.append(handle);
      }
      positionResizeHandles(c);
    }
    function renderComponents() {
      appVars.stageView.renderComponents();
      renderResizeHandle();
      paintColorPreview();
    }
    function rollbackDesign(before) {
      appVars.project = before;
      invalidateEditors();
      renderAll();
      if (appCalls.$('#dataModal').classList.contains('show')) renderDataModal();
      if (appCalls.$('#assetModal').classList.contains('show')) renderAppearance();
    }
    // A name the work cannot take, said before the work is checked (FS2-01): why, and what to write instead.
    function checkPartName(v, { stage = false } = {}) {
      if (!v) throw new Error(stage ? '画面の 名前を 書いてね' : '名前を 書いてね');
      if (cpLen(v) > 80) throw new Error('名前は 80文字までに してね');
      if (/[\p{Cc}\p{Zl}\p{Zp}「」]/u.test(v)) throw new Error('名前に「 」や 行がえは 使えないよ。けしてね');
      if (!stage && (v === 'マウス' || isEdgeTarget(v))) throw new Error('「マウス」と「端（はし）」は 名前に 使えないよ。ちがう 名前に してね');
    }
    function propRow(name, value, onchange, type = 'text', options = {}) {
      const r = document.createElement('div');
      r.className = 'prop-row';
      const n = document.createElement('div');
      n.className = 'prop-name';
      n.textContent = name;
      const v = document.createElement('div');
      v.className = 'prop-val';
      const inp = document.createElement('input');
      inp.type = type === 'readonly' ? 'text' : type;
      inp.readOnly = type === 'readonly';
      inp.setAttribute('aria-label', name);
      if (options.step) inp.step = options.step;
      inp.value = value ?? '';
      if (type === 'checkbox') inp.checked = !!value;
      inp.disabled = modelLocked();
      inp.addEventListener('change', () => {
        if (modelLocked()) return;
        const before = cloneDesignProject(appVars.project);
        try {
          if (type === 'number' && (inp.value.trim() === '' || !finite(Number(inp.value))))
            throw new Error('数を 入れてね');
          onchange(type === 'checkbox' ? inp.checked : inp.value);
          validateDesignProject(appVars.project);
          markDirty();
          renderAll();
          appCalls.refreshEditor();
          options.after?.();
        } catch (err) {
          appCalls.log((err.code ? err.code + ' ' : '') + appCalls.sentence(err.code ? err.message : err.message.replace(/てね$/, 'て ください')), 'error');
          rollbackDesign(before);
          // The field goes back to what it was; the status line says why and what to write, in its own voice (F-11: no
          // silent no-op; F-18). Another check of the work (with a code) is said in the teacher log only.
          appCalls.setStatus(err.code ? appVars.PROPERTY_REFUSALS[err.message] || `「${name}」は その 数や 文字には できないよ。もとに もどしたよ` : err.message);
        }
      });
      v.appendChild(inp);
      r.append(n, v);
      if (options.help) {
        const help = document.createElement('p');
        help.className = 'prop-help';
        help.id = 'propHelp' + ++appVars.propHelpSerial;
        help.textContent = options.help;
        inp.setAttribute('aria-describedby', help.id);
        r.append(help);
      }
      return r;
    }
    // After the screen size changes, parts keep their steps from the bottom-left corner; name those now outside.
    // With none outside, the new size replaces an earlier note, which may no longer hold.
    function noteOutsideParts() {
      const outside = appVars.project.components.filter((c) => {
        const b = appCalls.designBox(c);
        return b.right <= 0 || b.left >= appVars.project.stage.width || b.top <= 0 || b.bottom >= appVars.project.stage.height;
      });
      if (outside.length)
        appCalls.setStatus(`${outside.map((c) => `「${c.name}」`).join('と ')}は 画面の 外に あるよ。「せってい」の「よこのばしょ」・「たてのばしょ」で もどせるよ`);
      else appCalls.setStatus(`画面の はば ${appVars.project.stage.width}　高さ ${appVars.project.stage.height}`);
    }
    // 向き is kept in 0 ≤ 向き < 360 (450 is 90, −90 is 270).
    function designDirection(value) {
      return normalizedDesignDirection(Number(value));
    }

    function propSection(title, ...rows) {
      const section = document.createElement('section');
      section.className = 'prop-section';
      const heading = document.createElement('h3');
      heading.textContent = title;
      section.append(heading, ...rows);
      return section;
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
          propSection(
            'きほん',
            propRow('\u540d\u524d', appVars.project.stage.name, (v) => {
              checkPartName(v.trim(), { stage: true });
              appVars.project = prepareResourceRename(appVars.project,'component:stage',v.trim(),{drafts:appCalls.resourceDraftRecords()});
              invalidateEditors();
            }),
          ),
          propSection(
            '\u5927\u304d\u3055',
            propRow(
              'はば',
              appVars.project.stage.width,
              (v) => {
                const n = Number(v);
                if (!Number.isInteger(n) || n < 200 || n > 1200) throw new Error('画面の はばは 200から1200までの、小数の ない 数に してね');
                appVars.project.stage.width = n;
              },
              'number',
              { after: noteOutsideParts },
            ),
            propRow(
              '\u9ad8\u3055',
              appVars.project.stage.height,
              (v) => {
                const n = Number(v);
                if (!Number.isInteger(n) || n < 150 || n > 800)
                  throw new Error('画面の 高さは 150から800までの、小数の ない 数に してね');
                appVars.project.stage.height = n;
              },
              'number',
              { after: noteOutsideParts },
            ),
          ),
          // State words, not sentences of the language (F-22: 「すがたを見せる」 is a sentence).
          propSection('ふきだし',
            propRow('名前の ひょうじ',appVars.project.stage.showSpeechNames!==false,
              v=>(appVars.project.stage.showSpeechNames=v),'checkbox')),
        );
        syncPropertyScrollPadding();
        appVars.el.props.scrollTop = scroll;
        return;
      }
      const c = componentById(appVars.selectedId);
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
      duplicate.disabled = modelLocked() || appVars.project.components.length >= LIMITS.components;
      duplicate.onclick = duplicateSelectedComponent;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'prop-delete';
      del.textContent = `🗑 この ${kind}を けす`;
      del.disabled = modelLocked();
      del.onclick = deleteSelectedComponent;
      // What the copy does is said by its title and description; no line of its own.
      duplicate.setAttribute('aria-description', `見た目と せっていが 同じ ${kind}を もう1つ 作ります。本文は もちません。`);
      actions.append(title, duplicate, del);
      (document.body.dataset.editorMode === 'blocks' ? appCalls.$('#componentActions') : appVars.el.props).append(actions);
      appVars.el.props.append(
        propSection(
          'きほん',
          propRow('\u540d\u524d', c.name, (v) => {
            v = v.trim();
            checkPartName(v);
            if (appVars.project.components.some((x) => x !== c && x.name === v))
              throw new Error('ほかの キャラクターや 部品と ちがう 名前に してね');
            appVars.project = prepareResourceRename(appVars.project,'component:'+c.id,v,{drafts:appCalls.resourceDraftRecords()});
            invalidateEditors();
          }),
          propRow('見えている', c.visible, (v) => (c.visible = v), 'checkbox'),
          propRow(
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
        propSection(
          '文字・中身',
          propRow(
            c.type === 'sprite' ? '\u4ee3\u308f\u308a\u306e\u6587\u5b57' : '\u6587\u5b57',
            c.text,
            (v) => {
              if (cpLen(v) > LIMITS.stringChars) throw new Error(`文字は ${LIMITS.stringChars}文字までに してね`);
              c.text = v;
            },
          ),
          propRow(
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
        propSection(
          '大きさ・ばしょ',
          propRow(
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
          propRow(
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
          propRow('よこのばしょ', c.x, (v) => (c.x = Number(v)), 'number', { step: 'any' }),
          propRow('たてのばしょ', c.y, (v) => (c.y = Number(v)), 'number',
            { step: 'any', help: '画面の 左下の はしから、まん中までの 歩数です' }),
        ),
        propSection(
          '\u8272',
          colorSetting(c, 'fg', '\u6587\u5b57\u8272'),
          colorSetting(c, 'bg', 'はいけいの 色'),
        ),
        propSection(
          '\u305d\u306e\u4ed6',
          propRow('向き', c.direction, (v) => (c.direction = designDirection(v)), 'number',
            { step: 'any', help: '0＝右　90＝上　180＝左　270＝下' }),
          propRow(
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
      syncPropertyScrollPadding();
      appVars.el.props.scrollTop = scroll;
    }
    function colorChip(node, value) {
      node.classList.toggle('is-none', value === null);
      node.style.setProperty('--chip-color', value || '#ffffff');
    }
    function colorSetting(c, field, label) {
      const box = document.createElement('div');
      box.className = 'prop-color';
      box.dataset.colorField = field;
      const head = document.createElement('div');
      head.className = 'prop-color-head';
      const title = document.createElement('strong');
      title.textContent = label;
      const current = document.createElement('span');
      current.className = 'color-current';
      const chip = document.createElement('span');
      chip.className = 'color-chip';
      colorChip(chip, c[field]);
      current.append(
        chip,
        document.createTextNode(
          COLOR_PRESETS.find((p) => p.value === c[field])?.label ||
            (c[field] === null ? '\u306a\u3057' : '\u3044\u307e\u306e\u8272'),
        ),
      );
      head.append(title, current);
      box.append(head);
      const grid = document.createElement('div');
      grid.className = 'color-presets';
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', label + 'の きほんの12色');
      for (const preset of COLOR_PRESETS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'color-preset';
        b.dataset.colorValue = preset.value;
        b.disabled = modelLocked();
        b.setAttribute('aria-label', label + ': ' + preset.label);
        b.setAttribute('aria-pressed', String(c[field] === preset.value));
        const swatch = document.createElement('span');
        swatch.className = 'color-chip';
        colorChip(swatch, preset.value);
        swatch.setAttribute('aria-hidden', 'true');
        b.append(swatch, document.createTextNode(preset.label));
        b.onclick = () => choosePreset(c, field, preset.value);
        grid.append(b);
      }
      const foot = document.createElement('div');
      foot.className = 'prop-color-foot';
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'color-more';
      more.textContent = '\u307b\u304b\u306e\u8272\u2026';
      more.setAttribute('aria-label', label + ': \u307b\u304b\u306e\u8272');
      more.setAttribute('aria-haspopup', 'dialog');
      more.disabled = modelLocked();
      more.onclick = () => appCalls.openColorPicker(c, field, label);
      foot.append(more);
      if (field === 'bg') {
        const none = document.createElement('button');
        none.type = 'button';
        none.className = 'color-none';
        none.textContent = 'なし（とうめい）';
        none.setAttribute('aria-pressed', String(c.bg === null));
        none.disabled = modelLocked();
        none.onclick = () => choosePreset(c, field, null);
        foot.append(none);
      }
      box.append(grid, foot);
      return box;
    }
    function commitColor(c, field, value) {
      if (modelLocked() || componentById(c.id) !== c || !['fg', 'bg'].includes(field)) return false;
      const next = value === null && field === 'bg' ? null : pickerHex(value);
      if (next === null && !(field === 'bg' && value === null))
        throw new Error(
          '色は、# と 6けたの 0〜9・A〜F で 入れて ください（れい: #147efb）',
        );
      if (c[field] === next) return false;
      const candidate = cloneDesignProject(appVars.project);
      candidate.components.find((x) => x.id === c.id)[field] = next;
      validateDesignProject(candidate);
      dropHistoryTimer();
      pushHistoryNow();
      c[field] = next;
      markDirty();
      dropHistoryTimer();
      pushHistoryNow();
      return true;
    }
    function choosePreset(c, field, value) {
      if (modelLocked() || appVars.colorEdit || !appCalls.flushActiveEditor()) return;
      try {
        const changed = commitColor(c, field, value);
        if (changed) {
          renderProperties();
          renderComponents();
          appCalls.refreshEditor();
        }
        const root = appVars.el.props.querySelector(`[data-color-field="${field}"]`),
          button =
            value === null
              ? root?.querySelector('.color-none')
              : root?.querySelector(`[data-color-value="${value}"]`);
        button?.focus({ preventScroll: true });
      } catch (error) {
        appCalls.log(error.message, 'error');
      }
    }
    function paintColorPreview() {
      const edit = appVars.colorEdit;
      if (
        !edit ||
        modelLocked() ||
        appVars.project !== edit.project ||
        componentById(edit.id) !== edit.component
      )
        return;
      const node = appVars.el.form.querySelector(`.component[data-id="${CSS.escape(edit.id)}"]`);
      if (node)
        node.style[edit.field === 'fg' ? 'color' : 'backgroundColor'] = edit.value || 'transparent';
    }
    function startDrag(ev, id) {
      if (modelLocked() || ev.button !== 0 || ev.isPrimary === false) return;
      appVars.activeDragCleanup?.();
      const c = componentById(id);
      if (!c) return;
      dropHistoryTimer();
      pushHistoryNow();
      const pointerId = ev.pointerId,
        before = { ...c },
        toStage = (e) => {
          const rect = appVars.el.form.getBoundingClientRect();
          return {
            x: ((e.clientX - rect.left) * appVars.project.stage.width) / rect.width,
            y: ((rect.bottom - e.clientY) * appVars.project.stage.height) / rect.height,
          };
        },
        start = toStage(ev), pressX = ev.clientX, pressY = ev.clientY, slop = pointerSlop(ev);
      let next = { x: c.x, y: c.y },
        finished = false,
        moved = false;
      const placeText = (at) => `よこのばしょ ${at.x}　たてのばしょ ${at.y}`;
      // Like resize, moving previews a candidate; cancellation never edits the project.
      const move = (e) => {
        if (e.pointerId !== pointerId) return;
        if (modelLocked() || componentById(id) !== c) {
          finish({ type: 'pointercancel' });
          return;
        }
        if (e.cancelable) e.preventDefault();
        const p = toStage(e);
        // A press that does not move past the slop keeps the place as it is (320.25 stays 320.25), and adds nothing to
        // the history: a finger that wobbles by a pixel or two while it taps a part only selects it (A-09).
        if (!moved && Math.hypot(e.clientX - pressX, e.clientY - pressY) < slop) return;
        moved = true;
        next = { x: Math.round(before.x + p.x - start.x), y: Math.round(before.y + p.y - start.y) };
        appVars.designResizePreview = { ...before, ...next };
        paintResizePreview(appVars.designResizePreview);
        appCalls.setStatus(placeText(next));
      };
      const finish = (event) => {
        if (finished) return;
        const cancel =
          event && ['pointercancel', 'lostpointercapture', 'blur', 'escape'].includes(event.type);
        if (!cancel && event?.type === 'pointerup' && event.pointerId === pointerId) move(event);
        if (finished) return;
        finished = true;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancelPointer);
        window.removeEventListener('keydown', key, true);
        window.removeEventListener('blur', blur);
        appVars.el.form.removeEventListener('lostpointercapture', cancelPointer);
        if (appVars.activeDragCleanup === finish) appVars.activeDragCleanup = null;
        appVars.designResizePreview = null;
        if (appVars.el.form.hasPointerCapture?.(pointerId))
          try {
            appVars.el.form.releasePointerCapture(pointerId);
          } catch (_) {}
        let changed = false;
        try {
          if (!cancel) changed = commitResize(c, next);
        } catch (error) {
          appCalls.log(error.message, 'error');
        }
        renderProperties();
        renderComponents();
        if (changed) appCalls.refreshEditor();
        releaseShellPointer();
        if (cancel) appCalls.setStatus('ばしょを かえるのを やめたよ');
        else if (changed) appCalls.setStatus(placeText(c));
      };
      const up = (e) => {
          if (e.pointerId === pointerId) finish(e);
        },
        cancelPointer = (e) => {
          if (e.pointerId === pointerId) finish(e);
        },
        blur = () => finish({ type: 'blur' }),
        key = (e) => {
          if (e.key === 'Escape' && !e.isComposing) {
            e.preventDefault();
            e.stopImmediatePropagation();
            finish({ type: 'escape' });
          }
        };
      appVars.activeDragCleanup = finish;
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancelPointer);
      window.addEventListener('keydown', key, true);
      window.addEventListener('blur', blur);
      appVars.el.form.addEventListener('lostpointercapture', cancelPointer);
      try {
        appVars.el.form.setPointerCapture(pointerId);
      } catch (_) {}
    }
    function startResize(ev, id, direction = 'se') {
      if (modelLocked() || ev.button !== 0 || ev.isPrimary === false) return;
      appVars.activeDragCleanup?.();
      const c = componentById(id);
      if (!designResizeMode(c)) return;
      dropHistoryTimer();
      pushHistoryNow();
      const pointerId = ev.pointerId,
        before = { ...c },
        toStage = (e) => {
          const rect = appVars.el.form.getBoundingClientRect();
          return {
            x: ((e.clientX - rect.left) * appVars.project.stage.width) / rect.width,
            y: ((rect.bottom - e.clientY) * appVars.project.stage.height) / rect.height,
          };
        },
        start = toStage(ev), pressX = ev.clientX, pressY = ev.clientY, slop = pointerSlop(ev);
      let next = { x: c.x, y: c.y, w: c.w, h: c.h, scalePercent: c.scalePercent },
        finished = false,
        moved = false;
      // The handles keep their offset from the part for the whole drag (A-R2-05): the part counts as small (its corner
      // handles just outside it) as the handles were shown at the press.
      const pressSmall = appVars.designResizeSmall = designHandlesSmallShown(c);
      const sizeText = (at) =>
        designResizeMode(c) === 'scale' ? `${c.name}の 大きさ ${at.scalePercent}％` : `はば ${at.w}　高さ ${at.h}`;
      const move = (e) => {
        if (e.pointerId !== pointerId) return;
        if (modelLocked() || componentById(id) !== c) {
          finish({ type: 'pointercancel' });
          return;
        }
        if (e.cancelable) e.preventDefault();
        // As for moving: a press on a handle that does not move past the slop changes nothing.
        if (!moved && Math.hypot(e.clientX - pressX, e.clientY - pressY) < slop) return;
        moved = true;
        const p = toStage(e);
        next = designResizeGeometry(before, direction, p.x - start.x, p.y - start.y, e.shiftKey || appVars.designRatioLocked);
        appVars.designResizePreview = { ...before, ...next };
        paintResizePreview(appVars.designResizePreview);
        appCalls.setStatus(sizeText(next));
      };
      const finish = (event) => {
        if (finished) return;
        const cancel =
          event && ['pointercancel', 'lostpointercapture', 'blur', 'escape'].includes(event.type);
        if (!cancel && event?.type === 'pointerup' && event.pointerId === pointerId) move(event);
        if (finished) return;
        finished = true;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancelPointer);
        window.removeEventListener('keydown', key, true);
        window.removeEventListener('blur', blur);
        appVars.el.form.removeEventListener('lostpointercapture', cancelPointer);
        if (appVars.activeDragCleanup === finish) appVars.activeDragCleanup = null;
        appVars.designResizePreview = null;
        appVars.designResizeSmall = null;
        if (appVars.el.form.hasPointerCapture?.(pointerId))
          try {
            appVars.el.form.releasePointerCapture(pointerId);
          } catch (_) {}
        let changed = false;
        try {
          if (!cancel) changed = commitResize(c, next);
        } catch (error) {
          appCalls.log(error.message, 'error');
        }
        // A part that was small at the press keeps its corner handles just outside it, so the handle stays under the
        // pointer; one that became small gets them now, so its handles do not lie on each other.
        if (changed) appVars.designHandlesShown = { key: designHandleKey(c), small: pressSmall || designHandlesSmall(c) };
        renderProperties();
        renderComponents();
        if (changed) appCalls.refreshEditor();
        releaseShellPointer();
        if (cancel)
          appCalls.setStatus(
            '大きさを かえるのを やめたよ',
          );
        else appCalls.setStatus(changed ? sizeText(c) : '大きさは かわって いないよ');
      };
      const up = (e) => {
          if (e.pointerId === pointerId) finish(e);
        },
        cancelPointer = (e) => {
          if (e.pointerId === pointerId) finish(e);
        },
        blur = () => finish({ type: 'blur' }),
        key = (e) => {
          if (e.key === 'Escape' && !e.isComposing) {
            e.preventDefault();
            e.stopImmediatePropagation();
            finish({ type: 'escape' });
          }
        };
      appVars.activeDragCleanup = finish;
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancelPointer);
      window.addEventListener('keydown', key, true);
      window.addEventListener('blur', blur);
      appVars.el.form.addEventListener('lostpointercapture', cancelPointer);
      try {
        appVars.el.form.setPointerCapture(pointerId);
      } catch (_) {}
    }
    function duplicateSelectedComponent() {
      if (modelLocked() || appVars.selectedId === 'stage' || !appCalls.flushActiveEditor()) return;
      const source = componentById(appVars.selectedId);
      if (!source) return;
      try {
        if (appVars.project.components.length >= LIMITS.components)
          throw new AkariError('F504', '部品が いっぱいで、もう ふやせません。いらない部品を けして ください');
        const next = cloneDesignProject(appVars.project), copy = cloneDesignProject(source), ids = allIds(),
          names = new Set(appVars.project.components.map(c => c.name));
        let n = 2;
        do {
          const suffix = `_${n++}`;
          copy.name = Array.from(source.name).slice(0, 80 - suffix.length).join('') + suffix;
        } while (names.has(copy.name));
        copy.id = ensureUniqueId(source.type, ids);
        for (const d of copy.localData.variables) d.id = ensureUniqueId('ivar', ids);
        for (const d of copy.localData.lists) d.id = ensureUniqueId('ilist', ids);
        for (const costume of copy.costumes || []) {
          const oldId = costume.id;
          costume.id = ensureUniqueId('costume', ids);
          if (oldId === source.costumeId) copy.costumeId = costume.id;
        }
        const angle = (copy.direction % 360) * Math.PI / 180,
          cs = Math.abs(Math.cos(angle)), sn = Math.abs(Math.sin(angle)), scale = copy.scalePercent / 100,
          visibleW = (copy.w * cs + copy.h * sn) * scale,
          visibleH = (copy.w * sn + copy.h * cs) * scale;
        // 16 right and 16 down on the screen, in whole steps, kept on the screen.
        const offset = (position, delta, visible, stageSize) => {
          const half = Math.min(visible, stageSize) / 2;
          return Math.round(clamp(position + delta, half, stageSize - half));
        };
        copy.x = offset(source.x, 16, visibleW, next.stage.width);
        copy.y = offset(source.y, -16, visibleH, next.stage.height);
        next.components.push(copy);
        // Validate before committing; image bytes remain shared immutable assets.
        serializeProject(next, appVars.assetStore);
        dropHistoryTimer();
        pushHistoryNow();
        appVars.project = next;
        appVars.selectedId = copy.id;
        appVars.currentEvent = 'start';
        appVars.selectedScriptId = null;
        markDirty();
        renderAll();
        appCalls.loadEditor();
        appCalls.refreshEditor();
        dropHistoryTimer();
        pushHistoryNow();
        appCalls.setStatus(`「${source.name}」の 見た目のコピー「${copy.name}」を 作ったよ`);
      } catch (error) {
        appCalls.log(`${error.code || ''} 見た目のコピーを 作れませんでした: ${error.message}`, 'error');
        appCalls.setStatus('見た目のコピーを 作れなかったよ');
      }
    }
    function deleteSelectedComponent() {
      if (modelLocked() || appVars.selectedId === 'stage' || !appCalls.flushActiveEditor()) return;
      const c = componentById(appVars.selectedId);
      if (!c) return;
      if (!allowResourceDelete('component:' + c.id, appCalls.$('#properties'), c.id)) return;
      if (!confirm('「' + c.name + '」を けす？')) return;
      dropHistoryTimer();
      pushHistoryNow();
      const id = c.id;
      appVars.project.components = appVars.project.components.filter((x) => x.id !== id);
      appVars.project.scripts = appVars.project.scripts.filter((x) => x.targetId !== id);
      appVars.selectedId = 'stage';
      appVars.currentEvent = 'start';
      appVars.selectedScriptId = null;
      compactCurrentAssets();
      revokeDesignUrls();
      markDirty();
      renderAll();
      appCalls.loadEditor();
      appCalls.refreshEditor();
      pushHistoryNow();
      appCalls.setStatus(`「${c.name}」を けしたよ`);
    }
    // The heading of a body made a 名人 text: the part is written as its subject (and, for ふれたとき, as the topic).
    function meijinHeadingSource(heading, name) {
      return sentenceHeadingSource({ ...heading, actorRef: { kind: 'named', name } }) + (heading.event === 'touchStart' ? nameSource(name) + 'は、' : '');
    }
    function startMeijin() {
      if (modelLocked() || appCalls.currentIsMeijin()) return;
      // A body with 名人 forms in it does not read as an ordinary body, so it stays a draft in the code editor (S317
      // tells the child to choose 名人 in code): that text is taken as the body.
      const flushed = appCalls.flushActiveEditor(), draft = !flushed && appVars.mainEditor.session?.mode === 'code' && !appCalls.$('#procModal').classList.contains('show') ? appVars.mainEditor.textarea?.value?.replace(/\r\n?/g, '\n') : null;
      if (!flushed && draft == null) return;
      const script = appCalls.selectCurrentScript(), owner = appCalls.targetById(appVars.selectedId);
      let source = draft ?? script?.source ?? '';
      if (source.trim()) {
        const parsed = parseSyntax(source, { symbols: buildSymbols(appVars.project), targetId: script?.targetId ?? appVars.selectedId, event: script?.event ?? appVars.currentEvent });
        // A body the common grammar does not read may hold 名人 forms (the check says so, S317): it is taken when it
        // reads as a 名人 text under a heading with its owner's name.
        if (!parsed.ast) {
          const headed = owner?.name ? meijinHeadingSource({ event: script?.event ?? appVars.currentEvent, actorRef: { kind: 'named', name: owner.name }, filter: script?.filter ?? null }, owner.name) + '\n' + source.split('\n').map(line => line.trim() ? '  ' + line : line).join('\n') : null;
          const without = cloneDesignProject(appVars.project);
          without.scripts = without.scripts.filter(s => s.id !== script?.id);
          const errorsOf = p => { try { return compileProject(p).errors.length; } catch (error) { if (!(error instanceof AkariError)) throw error; return Infinity; } }, before = errorsOf(without);
          // The other bodies' errors stay as they are; the 名人 text adds none.
          const reads = text => { const trial = cloneDesignProject(without); trial.scripts.push({ id: 'meijin-start-trial', mode: 'meijin', targetId: MEIJIN_OWNER, event: 'start', source: text }); return errorsOf(trial) <= before; };
          const meijin = [headed, source].find(text => text && reads(text));
          if (!meijin) { appCalls.setStatus('書き方の まちがいを 直してから、「名人」を えらんでね。'); return; }
          source = meijin;
        } else {
        const headings = [parsed.ast, ...(parsed.ast.units || [])].map(unit => unit.heading).filter(Boolean);
        // A heading whose subject is 自分 (written, or not written) is written with the owner's name. A touch heading names
        // the toucher as the topic too (犬が「星」にふれたとき、犬は、): in 名人 text the sentences under it name who acts.
        const lines = source.split('\n');
        for (const unit of [parsed.ast, ...(parsed.ast.units || [])].filter(u => u.heading?.actorRef?.kind === 'self' || u.heading?.event === 'touchStart').sort((a, b) => b.sourceSpan.startLine - a.sourceSpan.startLine)) {
          const at = unit.sourceSpan.startLine - 1, first = unit.body?.[0]?.sourceSpan, head = meijinHeadingSource(unit.heading, unit.heading.actorRef?.kind === 'named' ? unit.heading.actorRef.name : owner.name);
          lines[at] = first?.startLine === unit.sourceSpan.startLine ? head + lines[at].slice(first.startColumn - 1) : head;
        }
        source = lines.join('\n');
        // The body's owner is written out, because a 名人 script belongs to no part.
        if (!headings.length) {
          const heading = { event: script?.event ?? appVars.currentEvent, actorRef: { kind: 'named', name: owner.name }, filter: script?.filter ?? null };
          source = meijinHeadingSource(heading, owner.name) + '\n' + source.split('\n').map(line => line.trim() ? '  ' + line : line).join('\n');
        }
        }
      }
      // The owner-approved wording (final call 23).
      if (!confirm(`名人で 書くと、この本文は ${owner?.name ? owner.name + 'から はなれて、' : ''}「動かすもの」の「名人の本文」に うつります。ブロックには もどせません。\n名人で 書きますか？`)) return;
      try {
        const next = cloneDesignProject(appVars.project), id = script?.id || ensureUniqueId('script');
        const row = { id, mode: 'meijin', targetId: MEIJIN_OWNER, event: 'start', source, ...(script?.document ? { document: cloneDesignProject(script.document) } : {}) };
        const at = script ? appVars.project.scripts.indexOf(script) : -1;
        if (at >= 0) next.scripts.splice(at, 1, row); else next.scripts.push(row);
        validateDesignProject(next);
        dropHistoryTimer(); pushHistoryNow();
        // The draft is now the 名人 text: its reading error is not shown any more.
        if (draft != null) { if (appVars.mainEditor.session) { appVars.mainEditor.session.pendingEdit = null; appVars.mainEditor.session.blockDraft = null; } appCalls.clearEditorFailure(appVars.mainEditor); }
        appVars.project = next; appVars.selectedId = MEIJIN_OWNER; appVars.currentEvent = 'start'; appVars.selectedScriptId = id;
        appCalls.hideSourceOverview(); invalidateEditors(); markDirty(); appCalls.renderTree(); renderProperties(); appCalls.loadEditor(); renderComponents();
        dropHistoryTimer(); pushHistoryNow();
        appCalls.setStatus('「名人の本文」に うつしたよ。この 本文は コードモードで 書いてね');
      } catch (error) { appCalls.showEditorFailure(appVars.mainEditor, error); }
    }
    function renderAll() {
      appCalls.applyUiLevel();
      appCalls.applyStage();
      appCalls.renderTree();
      renderProperties();
      appCalls.renderSelectors();
      renderComponents();
      appCalls.renderMonitor();
      appCalls.updateRunState();
      appVars.el.projectName.value = appVars.project.name;
    }
    function renderDataModal() {
      // The choice names what is chosen, as the part tools do (F-23): えらんだ キャラクター, えらんだ 部品.
      const chosen = componentById(appVars.selectedId);
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
        const c = componentById(appVars.selectedId);
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
              if (modelLocked() || !confirm(`「${d.name}」で 使う たんいを「${selected || '決めない'}」に かえる？ たんいの ない はじめの 中身には、えらんだ たんいを つけるよ。`)) return;
              try {
                validateExpectedUnit(d.initialValue, selected);
                if(selected)d.initialValue=quantity(numberInUnit(d.initialValue,selected),selected);
                if (selected) d.expectedUnit = selected; else delete d.expectedUnit;
                markDirty(); renderDataModal(); appCalls.refreshEditor();
              } catch (error) { appCalls.showDataFormError(error,unit); }
            };
            info.append(unit);
          }
          const del = document.createElement('button');
          del.textContent = 'けす';
          del.onclick = () => {
            if (modelLocked()) return;
            if (!allowResourceDelete('data:' + d.id, body)) return;
            arr.splice(arr.indexOf(d), 1);
            markDirty();
            renderDataModal();
            appCalls.refreshEditor();
          };
          const rename=document.createElement('button');rename.textContent='名前を かえる';
          rename.onclick=()=>{
            if(modelLocked())return;
            const name=prompt('へんすう・リストの 名前',d.name);if(name===null||name.trim()===d.name)return;
            try{
              const next=prepareResourceRename(appVars.project,'data:'+d.id,name.trim(),{drafts:appCalls.resourceDraftRecords()});
              dropHistoryTimer();pushHistoryNow();appVars.project=next;invalidateEditors();markDirty();pushHistoryNow();renderDataModal();appCalls.refreshEditor();
            }catch(error){showResourceImpact({resource:d,references:[],uncertain:[{title:'名前を かえる',line:1,reason:error.message}]},body,'名前を かえる');}
          };
          row.append(info, rename, del);
          body.appendChild(row);
        }
    }
    function readCallableDraft() {
      const d = appVars.callableDraftCore,
        name = normalizeCharsOutsideString(d.name.trim()),
        text = d.argsText.trim(),
        args = text ? text.split(/[、,]/).map((x) => normalizeCharsOutsideString(x.trim())) : [];
      validateName(name, { callable: true });
      if (args.length > LIMITS.args) throw new AkariError('F504', `入れるものは ${LIMITS.args}こまでです`);
      const seen = new Set();
      for (const a of args) {
        validateName(a);
        if (seen.has(a)) throw new AkariError('F503', '入れるものに 同じ 名前が 2つ いじょう あります。ちがう 名前に して ください');
        seen.add(a);
      }
      return { ownerId: d.ownerId, type: d.type, name, args, source: d.source, editId: d.editId,
        ...(d.type === 'action' && d.callPhrase ? {callPhrase: d.callPhrase} : {}) };
    }

    function saveCallable() {
      if (modelLocked() || !appCalls.flushActiveEditor()) return;
      try {
        const d = readCallableDraft();
        let next = cloneDesignProject(appVars.project);
        const previous=[...next.actions,...next.functions].find(x=>x.id===d.editId);
        if(previous&&previous.name!==d.name){
          const kind=next.actions.includes(previous)?'action':'function';
          if(kind!==d.type)throw new AkariError('F503','名前と しゅるいは べつべつに かえて ください。使っている ところを たしかめて ください');
          previous.source=d.source;previous.args=d.args;
          if(d.callPhrase)previous.callPhrase=d.callPhrase;else delete previous.callPhrase;
          next=prepareResourceRename(next,kind+':'+previous.id,d.name,{drafts:appCalls.resourceDraftRecords().filter(r=>r.key!=='draft-reference:callable')});
          d.source=next[kind==='action'?'actions':'functions'].find(x=>x.id===previous.id).source;
        }
        if (
          [...next.actions, ...next.functions].some((x) => x.id !== d.editId && x.name === d.name)
        )
          throw new AkariError('F503', '自分で作ったブロックに 同じ名前が あります。ちがう名前に して ください');
        next.actions = next.actions.filter((x) => x.id !== d.editId);
        next.functions = next.functions.filter((x) => x.id !== d.editId);
        const id = d.editId || ensureUniqueId(d.type);
        (d.type === 'action' ? next.actions : next.functions).push({
          id,
          ownerId: d.ownerId,
          name: d.name,
          args: d.args,
          ...(d.callPhrase ? {callPhrase: d.callPhrase} : {}),
          source: d.source,
        });
        validateDesignProject(next);
        dropHistoryTimer();
        pushHistoryNow();
        appVars.project = next;
        invalidateEditors();
        appCalls.loadCallable(`${d.type}:${id}`);
        appCalls.renderCallableOptions(appVars.callableLoadedKey);
        markDirty();
        pushHistoryNow();
        appCalls.refreshEditor();
        appCalls.log(`${d.type === 'action' ? 'てじゅん' : '答えを もとめる'}「${d.name}」を 決めました`, 'ok');
      } catch (error) {
        appCalls.showEditorFailure(appVars.draftEditor, error);
      }
    }
    function deleteCallable() {
      if (modelLocked() || !appCalls.flushActiveEditor()) return;
      const id = appVars.callableDraftCore.editId,
        d = [...appVars.project.actions, ...appVars.project.functions].find((x) => x.id === id);
      if (!d) return;
      const kind = appVars.project.actions.some(x => x.id === id) ? 'action' : 'function';
      if (!allowResourceDelete(`${kind}:${id}`, appCalls.$('#procModal .dialog-body'))) return;
      if (!confirm(`「${d.name}」を けす？`)) return;
      dropHistoryTimer();
      pushHistoryNow();
      appVars.project.actions = appVars.project.actions.filter((x) => x.id !== id);
      appVars.project.functions = appVars.project.functions.filter((x) => x.id !== id);
      appCalls.clearCallable();
      invalidateEditors();
      appCalls.renderCallableList();
      markDirty();
      pushHistoryNow();
      appCalls.refreshEditor();
    }
    function showResourceImpact(impact, root, action = 'けす') {
      root.querySelector('.reference-issue')?.remove();
      const box = document.createElement('div'), title = document.createElement('p'), list = document.createElement('ul');
      box.className = 'reference-issue'; box.setAttribute('role', 'alert'); box.tabIndex = -1;
      title.textContent = `「${impact.resource.name}」は ${action} ことが できません。この名前を 使っている 本文を たしかめて ください。`;
      for (const row of [...impact.references, ...impact.uncertain]) {
        const item = document.createElement('li');
        item.textContent = `${row.title} ${row.line}行目：${row.reason || 'この名前を使っています'}`;
        list.appendChild(item);
      }
      box.append(title, list); root.prepend(box); box.focus();
      appCalls.log(title.textContent, 'error');
    }
    function allowResourceDelete(key, root, removedOwner = null) {
      const impact = resourceChangeImpact(appVars.project, key, { drafts: appCalls.resourceDraftRecords() });
      impact.references = impact.references.filter(r => r.sourceKey !== key);
      impact.uncertain = impact.uncertain.filter(r => r.sourceKey !== key);
      if (removedOwner) {
        impact.references = impact.references.filter(r => r.ownerId !== removedOwner);
        impact.uncertain = impact.uncertain.filter(r => r.ownerId !== removedOwner);
      }
      if (!impact.references.length && !impact.uncertain.length) return true;
      showResourceImpact(impact, root); return false;
    }
    function renderAppearance() {
      const body = appCalls.$('#assetBody');
      body.textContent = '';
      const advanced = document.body.dataset.uiLevel !== 'basic',
        c = componentById(appVars.selectedId),
        hint = appCalls.$('#costumeImageHint'),
        thumb = (assetId) => {
          const img = document.createElement('img');
          img.src = designImageUrl(assetId);
          img.alt = '';
          img.style.cssText =
            'width:64px;height:48px;object-fit:contain;background:#fff;border:1px solid #ccd7e4;border-radius:7px';
          return img;
        },
        // The resource kind is passed in, never derived from the on-screen label.
        rename = (obj, arr, label, kind) => {
          if (modelLocked()) return;
          const v = prompt(`${label}の名前`, obj.name);
          if (v === null) return;
          try {
            validateResourceName(v, label + 'の名前');
            if (arr.some((x) => x !== obj && x.name === v))
              throw new AkariError('F503', `同じ ${label}の 名前が あります。ちがう 名前に して ください`);
            const options = { drafts: appCalls.resourceDraftRecords() }, impact = resourceChangeImpact(appVars.project, `${kind}:${obj.id}`, options);
            if (impact.uncertain.length) { showResourceImpact(impact, body, '名前を かえる'); return; }
            const next = prepareResourceRename(appVars.project, `${kind}:${obj.id}`, v, options);
            dropHistoryTimer(); pushHistoryNow(); appVars.project = next;
            markDirty();
            pushHistoryNow();
            renderAll(); appCalls.loadEditor();
            renderAppearance();
            appCalls.refreshEditor();
          } catch (e) {
            showResourceImpact({resource:obj,references:[],uncertain:[{title:'名前を かえる',line:1,reason:e.message}]},body,'名前を かえる');
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
        use.disabled = b.id === appVars.project.stage.backdropId || modelLocked();
        use.onclick = () => {
          if (modelLocked()) return;
          appVars.project.stage.backdropId = b.id;
          markDirty();
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
            fit.disabled = modelLocked();
            fit.onchange = () => {
              if (modelLocked()) {
                fit.value = b.fit;
                return;
              }
              b.fit = fit.value;
              markDirty();
              renderAll();
            };
            const fill = document.createElement('input');
            fill.value = b.fill;
            fill.style.width = '82px';
            fill.disabled = modelLocked();
            fill.onchange = () => {
              if (modelLocked()) {
                fill.value = b.fill;
                return;
              }
              if (!validateColorHex(fill.value)) {
                fill.value = b.fill;
                return;
              }
              b.fill = fill.value.toLowerCase();
              markDirty();
              renderAll();
            };
            row.append(fit, fill);
          }
          const del = document.createElement('button');
          del.textContent = 'けす';
          del.disabled = appVars.project.stage.backdrops.length <= 1 || modelLocked();
          del.onclick = () => {
            if (modelLocked()) return;
            if (!allowResourceDelete('backdrop:' + b.id, body)) return;
            appVars.project.stage.backdrops.splice(appVars.project.stage.backdrops.indexOf(b), 1);
            if (appVars.project.stage.backdropId === b.id)
              appVars.project.stage.backdropId = appVars.project.stage.backdrops[0].id;
            compactCurrentAssets();
            revokeDesignUrls();
            markDirty();
            renderAll();
            renderAppearance();
          };
          row.appendChild(del);
        }
        body.appendChild(row);
      }
      appCalls.$('#costumeImageAdd').disabled = modelLocked() || c?.type !== 'sprite';
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
          use.disabled = co.id === c.costumeId || modelLocked();
          use.onclick = () => {
            if (modelLocked()) return;
            c.costumeId = co.id;
            markDirty();
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
            del.disabled = c.costumes.length <= 1 || modelLocked();
            del.onclick = () => {
              if (modelLocked()) return;
              if (!allowResourceDelete('costume:' + co.id, body)) return;
              c.costumes.splice(c.costumes.indexOf(co), 1);
              if (c.costumeId === co.id) c.costumeId = c.costumes[0].id;
              compactCurrentAssets();
              revokeDesignUrls();
              markDirty();
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
          del.disabled = modelLocked();
          del.onclick = () => {
            if (modelLocked()) return;
            if (!allowResourceDelete('sound:' + snd.id, body)) return;
            appCalls.stopPreview();
            appVars.project.sounds.splice(appVars.project.sounds.indexOf(snd), 1);
            compactCurrentAssets();
            markDirty();
            renderAppearance();
            appCalls.refreshEditor();
          };
          row.append(prev, stop, rn, del);
        }
        body.appendChild(row);
      }
    }
    function addBackdrop() {
      if (modelLocked()) return;
      const before = cloneDesignProject(appVars.project);
      try {
        if (appVars.project.stage.backdrops.length >= LIMITS.backdrops)
          throw new AkariError('F504', 'はいけいが いっぱいで、もう ふやせません。いらない はいけいを けして ください');
        const name = appCalls.$('#backdropName').value.trim(),
          val = appCalls.$('#backdropColor').value.trim();
        validateResourceName(name, 'はいけいの名前');
        if (appVars.project.stage.backdrops.some((b) => b.name === name))
          throw new AkariError('F503', '同じ はいけいの 名前が あります。ちがう 名前に して ください');
        if (!validateColorHex(val)) throw new AkariError('F507', 'はいけいの 色は、# と 6けたの 0〜9・A〜F で 書いて ください。れい：#ffffff');
        appVars.project.stage.backdrops.push({
          id: ensureUniqueId('backdrop'),
          name,
          kind: 'color',
          value: val.toLowerCase(),
        });
        appVars.project.stage.backdropId = appVars.project.stage.backdrops[appVars.project.stage.backdrops.length - 1].id;
        validateDesignProject(appVars.project);
        markDirty();
        renderAppearance();
        renderAll();
      } catch (e) {
        rollbackDesign(before);
        appCalls.log(`${e.code || ''} ${e.message}`, 'error');
      }
    }
    function addCostume() {
      if (modelLocked()) return;
      const before = cloneDesignProject(appVars.project);
      try {
        const c = componentById(appVars.selectedId);
        if (c?.type !== 'sprite') throw new Error('文字の すがたを 入れる キャラクターを えらんで ください');
        if (c.costumes.length >= LIMITS.costumesPerSprite)
          throw new AkariError('F504', 'すがたが いっぱいで、もう ふやせません。いらない すがたを けして ください');
        const name = appCalls.$('#costumeName').value.trim(),
          val = appCalls.$('#costumeText').value;
        validateResourceName(name, 'すがたの名前');
        if (c.costumes.some((x) => x.name === name))
          throw new AkariError('F503', '同じ すがたの 名前が あります。ちがう 名前に して ください');
        c.costumes.push({ id: ensureUniqueId('costume'), name, kind: 'text', value: val });
        c.costumeId = c.costumes[c.costumes.length - 1].id;
        validateDesignProject(appVars.project);
        markDirty();
        renderAppearance();
        renderAll();
      } catch (e) {
        rollbackDesign(before);
        appCalls.log(`${e.code || ''} ${e.message}`, 'error');
      }
    }
    function fileStemCandidate(file, names) {
      let v =
        (file.name || '名前なし')
          .replace(/\.[^.]*$/, '')
          .replace(/[「」\p{Cc}\p{Zl}\p{Zp}]/gu, '_')
          .trim() || '名前なし';
      v = Array.from(v).slice(0, 80).join('');
      let base = v,
        n = 2;
      while (names.has(v))
        v =
          Array.from(base)
            .slice(0, Math.max(1, 77 - String(n).length))
            .join('') + `_${n++}`;
      return v;
    }
    function finishAssetCommit(nextProject, nextStore, message) {
      appVars.project = nextProject;
      invalidateEditors();
      appVars.assetStore = nextStore.retainOnly(collectReachableAssetIds(nextProject));
      revokeDesignUrls();
      appVars.appState = 'DESIGN';
      appCalls.setAssetProgress('');
      pushHistoryNow();
      appVars.dirty = appCalls.currentFingerprint() !== appVars.lastSavedFingerprint;
      appCalls.updateDirty();
      appCalls.scheduleAutosave();
      renderAll();
      renderAppearance();
      appCalls.refreshEditor();
      appCalls.log(message, 'ok');
      appCalls.setStatus(message);
    }
    async function importImageObject(file, { nativeSize = false, onError } = {}) {
      if (!file) return;
      return appCalls.runAssetImport('絵', async () => {
        if (appVars.project.components.length >= LIMITS.components)
          throw new AkariError('F504', '部品が いっぱいで、もう ふやせません。いらない部品を けして ください');
        if (file.size > LIMITS.importFileBytes)
          throw new AkariError('F504', 'えらんだ ファイルが 大きすぎて 使えません。もっと 小さい ファイルに して ください', 0, 0, `入れられるファイルは${LIMITS.importFileBytes / 1048576}MiBまで`);
        const canonical = await canonicalizeImage(new Uint8Array(await file.arrayBuffer())),
          names = new Set(appVars.project.components.map((x) => x.name));
        let name = fileStemCandidate(file, names);
        if (name === 'マウス' || isEdgeTarget(name)) {
          let n = 2,
            base = name;
          do {
            name = `${base}_${n++}`;
          } while (names.has(name) || name === 'マウス' || isEdgeTarget(name));
        }
        validateResourceName(name, '部品の名前');
        const next = cloneDesignProject(appVars.project),
          store = new AssetStore(appVars.assetStore.snapshotRefs()),
          digest = await sha256(canonical.bytes);
        let asset = store.findByDigest('image', digest, canonical.bytes.length, canonical.bytes);
        if (!asset) {
          asset = await makeAssetBlob(ensureUniqueId('asset'), 'image', canonical);
          store.addImmutable(asset);
        }
        let scale = nativeSize ? 1 : Math.min(1, 180 / canonical.width, 180 / canonical.height),
          w = Math.max(8, Math.round(canonical.width * scale)),
          h = Math.max(8, Math.round(canonical.height * scale));
        if (!nativeSize && Math.max(w, h) < 48) {
          const up = 48 / Math.max(w, h);
          w = Math.max(8, Math.round(w * up));
          h = Math.max(8, Math.round(h * up));
        }
        if (!nativeSize) {
          w = Math.min(w, next.stage.width);
          h = Math.min(h, next.stage.height);
        }
        const id = ensureUniqueId('sprite'),
          costumeId = ensureUniqueId('costume'),
          shown = nativeSize ? Math.min(1, next.stage.width / w, next.stage.height / h) : 1,
          place = appCalls.newPartPlace(next.components, next.stage, w * shown, h * shown,
            { x: next.stage.width / 2, y: next.stage.height / 2 }),
          sprite = {
            id,
            type: 'sprite',
            name,
            x: place.x,
            y: place.y,
            w,
            h,
            fg: '#f5a000',
            bg: null,
            fontSize: 44,
            visible: true,
            direction: 0,
            scalePercent: nativeSize ? 100 * Math.min(1, next.stage.width / w, next.stage.height / h) : 100,
            text: '',
            localData: { variables: [], lists: [] },
            costumes: [{ id: costumeId, name, kind: 'image', assetId: asset.id }],
            costumeId,
          };
        next.components.push(sprite);
        validateAssetReferences(next, store);
        serializeProject(next, store);
        appVars.selectedId = id;
        appVars.currentEvent = 'start';
        appVars.selectedScriptId = null;
        finishAssetCommit(next, store, `絵「${name}」を キャラクターにして おいたよ`);
      }, onError);
    }
    async function importBackdropImage(file) {
      if (!file) return;
      return appCalls.runAssetImport('はいけいの 絵', async () => {
        if (file.size > LIMITS.importFileBytes)
          throw new AkariError('F504', 'えらんだ ファイルが 大きすぎて 使えません。もっと 小さい ファイルに して ください', 0, 0, `入れられるファイルは${LIMITS.importFileBytes / 1048576}MiBまで`);
        const canonical = await canonicalizeImage(new Uint8Array(await file.arrayBuffer())),
          names = new Set(appVars.project.stage.backdrops.map((x) => x.name)),
          candidate = fileStemCandidate(file, names),
          name = prompt('はいけいの名前', candidate);
        if (name === null) return;
        validateResourceName(name, 'はいけいの名前');
        if (names.has(name)) throw new AkariError('F503', '同じ はいけいの名前が あります。ちがう名前に して ください');
        const next = cloneDesignProject(appVars.project),
          store = new AssetStore(appVars.assetStore.snapshotRefs()),
          digest = await sha256(canonical.bytes);
        let asset = store.findByDigest('image', digest, canonical.bytes.length, canonical.bytes);
        if (!asset) {
          asset = await makeAssetBlob(ensureUniqueId('asset'), 'image', canonical);
          store.addImmutable(asset);
        }
        const b = {
          id: ensureUniqueId('backdrop'),
          name,
          kind: 'image',
          assetId: asset.id,
          fit: 'contain',
          fill: '#ffffff',
        };
        next.stage.backdrops.push(b);
        next.stage.backdropId = b.id;
        validateAssetReferences(next, store);
        serializeProject(next, store);
        finishAssetCommit(next, store, `はいけいの 絵「${name}」を 入れたよ`);
      });
    }
    async function importCostumeImage(file) {
      if (!file) return;
      const spriteId = appVars.selectedId;
      return appCalls.runAssetImport('すがたの 絵', async () => {
        const cur = appVars.project.components.find((c) => c.id === spriteId);
        if (cur?.type !== 'sprite')
          throw new AkariError('F503', 'すがたの 絵を 入れる キャラクターを えらんで ください');
        if (file.size > LIMITS.importFileBytes)
          throw new AkariError('F504', 'えらんだ ファイルが 大きすぎて 使えません。もっと 小さい ファイルに して ください', 0, 0, `入れられるファイルは${LIMITS.importFileBytes / 1048576}MiBまで`);
        const canonical = await canonicalizeImage(new Uint8Array(await file.arrayBuffer())),
          names = new Set(cur.costumes.map((x) => x.name)),
          candidate = fileStemCandidate(file, names),
          name = prompt('すがたの名前', candidate);
        if (name === null) return;
        validateResourceName(name, 'すがたの名前');
        if (names.has(name)) throw new AkariError('F503', '同じ すがたの名前が あります。ちがう名前に して ください');
        const next = cloneDesignProject(appVars.project),
          target = next.components.find((c) => c.id === spriteId),
          store = new AssetStore(appVars.assetStore.snapshotRefs()),
          digest = await sha256(canonical.bytes);
        let asset = store.findByDigest('image', digest, canonical.bytes.length, canonical.bytes);
        if (!asset) {
          asset = await makeAssetBlob(ensureUniqueId('asset'), 'image', canonical);
          store.addImmutable(asset);
        }
        const co = { id: ensureUniqueId('costume'), name, kind: 'image', assetId: asset.id };
        target.costumes.push(co);
        target.costumeId = co.id;
        validateAssetReferences(next, store);
        serializeProject(next, store);
        finishAssetCommit(next, store, `すがたの 絵「${name}」を 入れたよ`);
      });
    }
    async function importSoundFile(file) {
      if (!file) return;
      return appCalls.runAssetImport('音', async () => {
        if (file.size > LIMITS.importFileBytes)
          throw new AkariError('F504', 'えらんだ ファイルが 大きすぎて 使えません。もっと 小さい ファイルに して ください', 0, 0, `入れられるファイルは${LIMITS.importFileBytes / 1048576}MiBまで`);
        const canonical = await canonicalizeAudio(new Uint8Array(await file.arrayBuffer())),
          names = new Set(appVars.project.sounds.map((x) => x.name)),
          candidate = fileStemCandidate(file, names),
          name = prompt('音の名前', candidate);
        if (name === null) return;
        validateResourceName(name, '音の名前');
        if (names.has(name)) throw new AkariError('F503', '同じ 音の名前が あります。ちがう名前に して ください');
        const next = cloneDesignProject(appVars.project),
          store = new AssetStore(appVars.assetStore.snapshotRefs()),
          digest = await sha256(canonical.bytes);
        let asset = store.findByDigest('audio', digest, canonical.bytes.length, canonical.bytes);
        if (!asset) {
          asset = await makeAssetBlob(ensureUniqueId('asset'), 'audio', canonical);
          store.addImmutable(asset);
        }
        next.sounds.push({ id: ensureUniqueId('sound'), name, assetId: asset.id });
        validateAssetReferences(next, store);
        serializeProject(next, store);
        finishAssetCommit(next, store, `音「${name}」を 入れたよ`);
      });
    }
    Object.assign(appCalls, {addBackdrop, addCostume, colorChip, commitColor, commitSource, componentById, deleteCallable, deleteSelectedComponent, designImageUrl, dropHistoryTimer, ensureUniqueId, importBackdropImage, importCostumeImage, importImageObject, importSoundFile, invalidateEditors, markDirty, modelLocked, newBodyFilter, paintColorPreview, positionResizeHandles, pushHistoryNow, releaseShellPointer, renameMeijinProcedure, renderAll, renderAppearance, renderComponents, renderDataModal, renderProperties, revokeDesignUrls, saveCallable, showSourceImport, sourceCandidate, startDrag, startMeijin, syncPropertyScrollPadding, updateDesignHelp});
  }
