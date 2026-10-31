  // ────────────────────────────────────────────────────────────────────────
  // 11 — Application tools, the part the other tools use: queries of the state and the parts, the status line and the log,
  // history snapshots and fingerprints, autosave storage, focus in the tutorial, the wording of diagnostics, and who owns
  // an editor. Like every tool, nothing here leads to a redraw.
  // ────────────────────────────────────────────────────────────────────────
  // The application files come in this order in src/akari.html: a file uses only the files before it and asks the files
  // after it only for a redraw (AUDIT.md「ソースの境界」). Called once at the start of initApp: appVars is the state
  // it shares, appCalls the functions it offers the files after it and those it calls from the files before it; it asks for
  // no redraw.
  function createAppToolsCore(appVars, appCalls, appRedraw) {
    const $ = (s) => document.querySelector(s),
      $$ = (s) => [...document.querySelectorAll(s)];
    const workIsMeijin=()=>(appVars.project?.scripts||[]).some(isMeijinScript);
    // The view a body list shows: the chosen view, and code in a work with a 名人 text.
    const chosenEditorMode=(kind='script',fallback='code')=>workIsMeijin()?'code':appVars.editorModes.get(kind)||fallback;
    // The view the main editor shows (the list of all bodies uses the remembered view).
    const shownEditorMode=()=>(!appVars.sourceOverviewOpen&&appVars.mainEditor.session?.mode)||chosenEditorMode('script','blocks');
    // The chosen level in the form the work's editor state keeps (はじめて is kept as かんたん).
    const keptUiLevel=()=>appVars.baseUiLevel==='entry'?'basic':appVars.baseUiLevel;
    function confirmTutorialOperation(action=null) {
      const step=tutorialStep(appVars.tutorial);if(!step||action&&step.allowed[0]!==action)return;
      if(step.free||step.ownWords){const role=tutorialField(appVars.mainEditor.session?.blockView,step),v=role.node?.fields[role.key];
        // An ownWords step (what the fish says) takes the child's own words when they are not empty (F-04); a free step
        // takes a new number in its range. The later steps and the check of the run use the accepted value.
        if(!tutorialFreeValueAccepted(step,v)){if(step.ownWords)appVars.tutorialNotice={step:step.id,text:step.emptyMessage};return;}
        appVars.tutorialNotice=null;appVars.tutorial.values[step.id]=v;appVars.tutorialExpected=tutorialExpectedTrees(makeTutorialProject(),appVars.tutorial.steps,appVars.tutorial.values);
      }
      appVars.tutorial.confirmedStep=step.id;
    }
    function tutorialInsertionReady(step=tutorialStep(appVars.tutorial)) {
      const loc=step?.block&&tutorialDestination(appVars.mainEditor.session?.blockView,step);
      return !!loc&&appVars.tutorialInsertion?.step===step.id&&appVars.tutorialInsertion.epoch===appVars.tutorial.epoch
        &&appVars.tutorialInsertion.parentId===loc.parentId&&appVars.tutorialInsertion.body===loc.body&&appVars.tutorialInsertion.index===loc.index;
    }
    function tutorialRoleControl() {
      const step=tutorialStep(appVars.tutorial),ref=step&&tutorialField(appVars.mainEditor.session?.blockView,step);
      return ref?.node&&[...$('#blockEditor').querySelectorAll('[data-blockui-field]')].find(n=>n.dataset.blockId===ref.node.id&&n.dataset.blockuiField===ref.key);
    }
    function tutorialElementAllowed(element) {
      if(!appVars.tutorial)return true;if(!(element instanceof Element))return false;
      const step=tutorialStep(appVars.tutorial),action=step?.allowed[0];
      // ⏸ いったん止める and ▶ つづける are the run screen's own controls at every level (final call 21): like ■ 止める and the
      // exit, the guide never blocks them.
      if(element.closest('#tutorialExit,#stopBtn,#pauseBtn,#continueBtn'))return true;
      if(action==='choice')return !!element.closest('#tutorialChoices button,#tutorialFinish');
      if(action==='verify-save'&&element.closest('#tutorialVerifySave,#tutorialSavedFile'))return true;
      const direct={'event:click':'entryClickEvent',run:'runBtn',undo:'undoBtn',save:'saveBtn'}[action];if(direct&&element.closest('#'+direct))return true;
      if(step?.block){if(element.closest('#blockEditor [data-lesson-block="'+step.block+'"]'))return tutorialInsertionReady(step);
        // The place is a 「＋ ここに入れる」, or the hole of an empty enclosure, which is its only place (E-03).
        const command=element.closest('#blockEditor [data-blockui-action="body-insert"],#blockEditor .blockui-hole-target'),loc=tutorialDestination(appVars.mainEditor.session?.blockView,step);
        return !tutorialInsertionReady(step)&&!!command&&!!loc&&command.dataset.parentId===loc.parentId&&command.dataset.blockuiBody===loc.body&&Number(command.dataset.insertIndex)===loc.index;}
      if(step?.ref&&step.action!=='undo'){const control=tutorialRoleControl();return element===control||control?.contains(element)
        ||!!element.closest('#blockEditor [data-blockui-action="commit"],#blockEditor [data-blockui-action="cancel"],#editorCancel');}
      if(action==='runtime:click')return !appVars.tutorialTrace?.busy&&appVars.tutorialTrace?.clicks<step.clicks&&!!element.closest('.component[data-id="'+appVars.tutorial.target+'"]');return false;
    }
    // The step's own place comes first in the guide's Tab order, then ■ 止める and the exit, then ⏸／▶ つづける.
    const tutorialFocusRank=n=>['pauseBtn','continueBtn'].includes(n.id)?2:['tutorialExit','stopBtn'].includes(n.id)?1:0;
    function tutorialFocusTargets() {
      return $$('button,input,select,textarea,summary,[tabindex="0"]').filter(n=>!n.disabled&&!n.hidden&&n.getClientRects().length&&tutorialElementAllowed(n)).sort((a,b)=>tutorialFocusRank(a)-tutorialFocusRank(b));
    }
    function focusTutorialTarget() {
      const target=tutorialFocusTargets()[0];if(!target)return;
      target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',inline:'nearest'});
    }
    function draftOwner() {
      return appVars.callableDraftCore.editId
        ? `${appVars.callableDraftCore.type}:${appVars.callableDraftCore.editId}`
        : `${appVars.callableDraftCore.type}:draft-${appVars.editorDraftSerial}`;
    }
    function bindingOwner(binding) {
      return binding.kind === 'draft'
        ? draftOwner()
        : appVars.debugSourceKey || (appVars.selectedScriptId ? `script:${appVars.selectedScriptId}` : `script:${appVars.selectedId}:${appVars.currentEvent}`);
    }
    function readSource(binding, ownerKey = bindingOwner(binding)) {
      if (binding.kind === 'draft') return appVars.callableDraftCore.source;
      // Only a running work reads its compiled text; other locked states (opening a file,
      // preparing) still show the current work, never an earlier run.
      const runningItem = appVars.runtime || appVars.scheduler ? appVars.compiled?.items?.find((x) => x.key === ownerKey) : null;
      if (runningItem) return runningItem.ast.source || '';
      const [kind, id, event] = ownerKey.split(':');
      return kind === 'script'
        ? scriptBySourceKey(appVars.project, ownerKey)?.source || ''
        : (kind === 'action' ? appVars.project.actions : appVars.project.functions).find((x) => x.id === id)
            ?.source || '';
    }
    function bindingContext(binding) {
      const ownerKey = bindingOwner(binding),
        [kind, id, event] = ownerKey.split(':');
      if (binding.kind === 'draft') {
        const d = appVars.callableDraftCore,
          args = d.argsText.trim()
            ? d.argsText.split(/[、,]/).map((x) => normalizeCharsOutsideString(x.trim()))
            : [];
        return {
          ownerKey,
          event: null,
          targetId: null,
          targetType: null,
          definitionKind: d.type,
          args,
          definition: {
            id: d.editId || ownerKey.split(':')[1],
            ownerId: d.ownerId,
            name: normalizeCharsOutsideString(d.name.trim()),
            ...(d.type === 'action' && d.callPhrase ? {callPhrase: d.callPhrase} : {}),
            args,
            source: d.source,
          },
          draft: true,
          level: document.body.dataset.uiLevel,
        };
      }
      if (kind !== 'script') {
        const d = (kind === 'action' ? appVars.project.actions : appVars.project.functions).find(
          (x) => x.id === id,
        );
        return {
          ownerKey,
          event: null,
          targetId: null,
          targetType: null,
          definitionKind: kind,
          definition: d,
          args: d?.args || [],
          level: document.body.dataset.uiLevel,
        };
      }
      const script = scriptBySourceKey(appVars.project, ownerKey);
      if (isMeijinScript(script) || (!script && appVars.selectedId === MEIJIN_OWNER))
        return { ownerKey, id: script?.id, scriptId: script?.id, filter: undefined, event: 'start', targetId: 'stage',
          targetType: 'stage', args: [], meijin: true, level: document.body.dataset.uiLevel };
      return {
        ownerKey,
        id: script?.id, scriptId: script?.id, filter: script?.filter,
        event: script?.event || event || appVars.currentEvent,
        targetId: script?.targetId || (event ? id : appVars.selectedId),
        targetType: targetType(script?.targetId || (event ? id : appVars.selectedId)),
        args: [],
        level: document.body.dataset.uiLevel,
      };
    }
    function hasPendingEditor() {
      return !!(
        appVars.activeDragCleanup ||
        appVars.colorEdit ||
        appVars.headerPending ||
        appVars.mainEditor.session?.pendingEdit || appVars.mainEditor.session?.blockDraft ||
        appVars.draftEditor.session?.pendingEdit || appVars.draftEditor.session?.blockDraft ||
        appVars.composingEditors.has(appVars.el.editor) ||
        appVars.composingEditors.has(appVars.draftEditor.textarea) ||
        appVars.composingEditors.has($('#callableName')) ||
        (appVars.composingEditors.has($('#callableArgs')) || appVars.composingEditors.has($('#callablePhrase')))
      );
    }
    function captureEditorView(binding) {
      const s = binding.session;
      if (!s) return;
      if (s.mode === 'code') {
        s.codeSelection = {
          start: binding.textarea.selectionStart,
          end: binding.textarea.selectionEnd,
          direction: binding.textarea.selectionDirection,
        };
        s.scrollState = {
          ...s.scrollState,
          codeTop: binding.textarea.scrollTop,
          codeLeft: binding.textarea.scrollLeft,
        };
      }
    }
    function sourceCandidate(binding, ownerKey, source) {
      if (cpLen(source) > LIMITS.sourceEach)
        throw new AkariError('F504', '本文の 文字が 多すぎます。文を へらして ください');
      const parsed = parseSyntax(source, { ...bindingContext(binding), key: ownerKey,
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
        validateCallableDraft({ ...appVars.callableDraftCore, source });
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
    function diagnosticOwner(diagnostic) {
      const key = diagnostic?.where || diagnostic?.key || '', item = appVars.compiled?.items?.find(x => x.key === key),
        sourceKey = item?.documentKey || key, script = scriptBySourceKey(appVars.project, sourceKey),
        definition = appVars.project.actions.find(x => key === 'action:' + x.id) || appVars.project.functions.find(x => key === 'function:' + x.id);
      return { key, item, script, definition };
    }
    // Where a message points: the body (its owner and きっかけ) and the line. The block view has no line numbers (はじめて
    // shows blocks only), so there the place is the sentence itself, as its block reads.
    function diagnosticLocation(diagnostic, { blocks = shownEditorMode() === 'blocks' } = {}) {
      const { key, item, script, definition } = diagnosticOwner(diagnostic);
      const owner = definition ? (key.startsWith('function:') ? '答えを もとめる「' : 'てじゅん「') + definition.name + '」'
        : script || item ? (meijinTextLabel(script) || targetById(item?.targetId || script?.targetId)?.name || '画面') + ' / ' + (eventText(item?.event || script?.event, item ? item.filter : script?.filter) || '動き')
        : 'この本文';
      if (!diagnostic?.line) return owner;
      if (!blocks) return owner + ' / ' + diagnostic.line + '行目';
      const sentence = diagnosticSentence(diagnostic);
      return owner + (sentence ? ' / 「' + sentence + '」' : '');
    }
    // The sentence on a message's line, without its last 。 or 、.
    function diagnosticSentence(diagnostic) {
      const source = diagnosticSource(diagnostic) ?? diagnostic?.source ?? '';
      return String(source).split(/\r\n?|\n/)[(diagnostic?.line || 0) - 1]?.trim().replace(/[。、]$/, '') || '';
    }
    // The text the diagnostic's line numbers count in: the indentation message reads its line (F-24).
    function diagnosticSource(diagnostic) {
      const { script, definition } = diagnosticOwner(diagnostic);
      return definition?.source ?? script?.source ?? null;
    }
    // A sentence of a list ends as the others do (FM2-13): with 。, unless it ends with its own mark.
    const sentence = text => /[。？！]$/.test(text) ? text : text + '。';
    function cancelAssist(binding) { clearTimeout(binding.assistTimer);binding.assistTimer=0; }
    function closeAssist(binding) {
      const n=$(binding.kind==='draft'?'#callablePending':'#editorPending');
      n.querySelectorAll('.intent-choices,.assist-choices').forEach(node=>node.remove());
      binding.textarea.focus();
    }
    function assistEligible(binding,error) {
      const diagnostic=error?.diagnostics?.[0]||error;
      return binding.session?.mode==='code'&&!binding.session.blockDraft&&!bindingContext(binding).meijin&&
        typeof error?.proposalSource==='string'&&diagnostic?.line&&['P201','P205','S317'].includes(diagnostic.code);
    }
    // The note under a コード／ブロック toggle that says why it does not switch: it shows when a press is refused (the toggle
    // keeps its look) and goes away at the next press or key anywhere. In 本文と動きのようす it shows under the toggle there.
    function modeBlockedNote(binding) {
      const id = binding.kind === 'draft' ? 'callableModeBlockedNote' : 'modeBlockedNote';
      let note = document.getElementById(id);
      if (!note) {
        note = document.createElement('p');
        note.id = id;
        note.className = 'mode-blocked-note';
        note.setAttribute('role', 'status');
        note.hidden = true;
        if (binding.kind === 'draft') $('#callableModecode').parentElement.after(note);
        else $('.menutool').append(note);
      }
      if (binding.kind !== 'draft') {
        const host = $('#editorModecode').closest('#runtimeInspectorModes') || $('.menutool');
        if (note.parentElement !== host) host.append(note);
      }
      return note;
    }
    function showBlockedNote(note) {
      note.hidden = false;
      // Under いつ動く？, kept inside the row at narrow widths.
      if (note.id === 'headingBlockedNote')
        note.style.left = Math.max(8, Math.min($('#sourceHeadingBtn').offsetLeft, note.parentElement.clientWidth - note.offsetWidth - 8)) + 'px';
      const hide = () => {
        note.hidden = true;
        document.removeEventListener('pointerdown', hide, true);
        document.removeEventListener('keydown', hide, true);
      };
      document.addEventListener('pointerdown', hide, true);
      document.addEventListener('keydown', hide, true);
    }
    function editorContentFingerprint(state) {
      return stableJson([state.callableDraft,state.pendingEditors.map(d=>({kind:d.kind,ownerKey:d.kind==='draft'?'draft':d.ownerKey,source:d.source,
        value:d.pending.value??null,field:d.pending.field??null,nodePath:d.pending.nodePath??null,
        draftSource:d.draftTree?formatScript(blockDecode(d.draftTree,{allowHoles:true}),{allowHoles:true}):null}))]);
    }
    function stateFingerprintCore(fingerprint = currentFingerprint()) {
      const pending=[appVars.mainEditor,appVars.draftEditor].filter(b=>b.session?.blockDraft||b.session?.pendingEdit&&!b.session.pendingEdit.rejected&&(!b.session.pendingEdit.field||b.session.pendingEdit.invalid)).map(b=>({kind:b.kind,ownerKey:bindingOwner(b),source:b.textarea.value,
        pending:b.session.pendingEdit||{},draftTree:b.session.blockDraft?b.session.blockView:null}));
      const draft=appVars.headerPending?{...appVars.callableDraftCore,name:$('#callableName').value,argsText:$('#callableArgs').value,
        ...(appVars.callableDraftCore.type==='action'?{callPhrase:$('#callablePhrase').value}:{})}:hasCallableDraft()?appVars.callableDraftCore:null;
      return JSON.stringify([fingerprint,editorContentFingerprint({callableDraft:draft,pendingEditors:pending})]);
    }
    function hideMeijinProcedure() {
      if (!appVars.meijinProcedureId) return;
      appVars.meijinProcedureId = '';
      $('#procModal .proc-edit').classList.remove('meijin-proc');
      $('#meijinProcPanel').hidden = true;
      $('#callableSave').disabled = $('#callableFormat').disabled = false;
    }
    function setStageZoom(scale) {
      appVars.stageZoom = scale === null ? null : Math.max(0.1, Math.min(2, Math.round(scale * 100) / 100));
      appVars.stageView.fitStage();
      appVars.stageView.positionBubbles();
      if (appVars.stageZoom === null) $('.designer-wrap').scrollTo({ left: 0, top: 0 });
    }
    function childErrorLogText(message) {
      const m = String(message), plain = m.replace(/^\s*[A-Z]\d{3}(?::|\s)\s*/, '');
      if (/保存失敗|ほぞん\s*できませんでした/.test(plain)) return '作品ファイルを ほぞん できませんでした。この画面の作品は のこって います。画面を とじずに、もう一度「保存」を おして ください。';
      if (/読み込み失敗|読みこめませんでした/.test(plain)) return '作品ファイルを 開けませんでした。えらんだ ファイルは かえて いません。あかりで ほぞんした ファイル（名前が「.akari.md」で おわる ファイル）を えらんで ください。';
      return childDiagnosticText({message:plain});
    }
    const log = (m, type = '') => {
      const original = String(m), message = type === 'error' ? childErrorLogText(original) : original,
        prefix = type === 'error' ? '❌ ' : type === 'ok' ? '✓ ' : '',
        addition = (appVars.el.console.textContent ? '\n' : '') + prefix + message,
        preserved = message === original ? addition : addition + '\n' + original;
      if (appVars.el.console.textContent.length + preserved.length > LIMITS.logChars)
        appVars.el.console.textContent = '[古い きろくは はぶきました]\n' + (appVars.el.console.textContent + preserved).slice(-Math.floor(LIMITS.logChars * 0.9));
      else {
        appVars.el.console.appendChild(document.createTextNode(addition));
        if (message !== original) appendDiagnosticDetails(appVars.el.console, {message:original});
      }
      appVars.el.console.scrollTop = appVars.el.console.scrollHeight;
    };
    const setStatus = (m) => {
      appVars.statusSerial++;
      if (appVars.el.status.textContent === m) return;
      appVars.el.status.textContent = m;
      // A screen reader hears what the line says (a refusal, おわったよ, …), but not the place shown while a part is dragged.
      if (!/^よこのばしょ /.test(m || '')) $('#statusLive').textContent = m;
      if (m && document.body.dataset.uiLevel === 'entry' && typeof appVars.el.status.animate === 'function') {
        appVars.statusFlash?.cancel();
        appVars.statusFlash = appVars.el.status.animate([{ backgroundColor: '#ffe9a8' }, { backgroundColor: 'transparent' }], { duration: 1600, easing: 'ease-out' });
      }
    };
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
    const targetById = (id) => (id === 'stage' ? appVars.project.stage : id === MEIJIN_OWNER ? appVars.MEIJIN_TARGET : componentById(id));
    const targetType = (id) => (id === 'stage' ? 'stage' : id === MEIJIN_OWNER ? MEIJIN_OWNER : componentById(id)?.type);
    const meijinScripts = () => appVars.project.scripts.filter(isMeijinScript);
    const currentIsMeijin = () => appVars.selectedId === MEIJIN_OWNER;
    const modelLocked = () => appVars.appState !== 'DESIGN' || !!appVars.runtime || !!appVars.scheduler;
    function currentFingerprint() {
      return assetStateFingerprint(appVars.project, appVars.assetStore);
    }
    function pushHistoryNow(e = snapshot()) {
      // An immediate snapshot supersedes the queued edit's older view state.
      dropHistoryTimer();
      appVars.lastObservedFingerprint = e.stateFingerprint;
      if (!appVars.history.length || appVars.history.at(-1).stateFingerprint !== e.stateFingerprint) {
        appVars.history.push(e);
        if (appVars.history.length > Math.max(1, Math.floor(LIMITS.historyEntries / 2))) appVars.history.shift();
        appVars.redo = [];
      } else appVars.history[appVars.history.length - 1] = e;
      updateDirty();
    }
    function stopPreview() {
      const current = appVars.previewAudio;
      appVars.previewAudio = null;
      if (!current) return;
      try {
        current.source?.stop();
      } catch (_) {}
      try {
        const closing = current.context?.close();
        closing?.catch?.(() => {});
      } catch (_) {}
    }
    function closeRuntimeInspector() {
      const dialog = $('#runtimeInspector');
      if (dialog.open) dialog.close();
      for (const {node, marker} of appVars.inspectorNodes.splice(0)) { marker.replaceWith(node); }
      if (appVars.appState === 'RUNNING' || appVars.appState === 'PAUSED') {
        appVars.stageView.fitStage();
        appVars.el.form.focus({ preventScroll: true });
      }
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

    function snapshot(fingerprint = currentFingerprint(), stateFingerprint = stateFingerprintCore(fingerprint)) {
      return {
        project: cloneDesignProject(appVars.project),
        assets: appVars.assetStore.snapshotRefs(collectReachableAssetIds(appVars.project)),
        selectedId: appVars.selectedId,
        currentEvent: appVars.currentEvent,
        selectedScriptId: appVars.selectedScriptId,
        fingerprint,
        stateFingerprint,
        editorState: captureEditorState(),
        draft: { ...appVars.callableDraftCore },
        callableBaseline: appVars.callableBaseline,
        callableLoadedKey: appVars.callableLoadedKey,
        draftSerial: appVars.editorDraftSerial,
        draftOpen: $('#procModal').classList.contains('show'),
      };
    }
    function dropHistoryTimer() { clearTimeout(appVars.historyTimer); appVars.historyTimer=0; appVars.queuedHistory=null; }
    function updateDirty() {
      appVars.dirty = currentFingerprint() !== appVars.lastSavedFingerprint;
      const draft = hasCallableDraft() || hasPendingEditor();
      appVars.el.dirty.textContent = appVars.dirty ? 'ファイルに まだ ほぞんして いないよ' : draft ? '書きかけが あるよ' : 'かえた ところは ないよ';
      appVars.el.dirty.className = appVars.dirty || draft ? 'dirty-state dirty' : 'dirty-state';
      // The saving state reads as one sentence: what this computer keeps, then the file (このパソコンに のこしたよ。ファイルに
      // まだ ほぞんして いないよ). With nothing changed only かえた ところは ないよ is said.
      appVars.el.autosave.classList.toggle('save-quiet', !appVars.dirty && !draft);
      const locked = modelLocked();
      $('#undoBtn').disabled =
        locked || (appVars.history.length <= 1 && appVars.history[0]?.stateFingerprint === stateFingerprintCore());
      $('#redoBtn').disabled = locked || !appVars.redo.length;
      document.title = `${appVars.dirty || draft ? '● ' : ''}${productLabel()} — ${appVars.project.name}`;
    }
    // Pair the existing saved project fingerprint with the unfinished content
    // already included in saved editorState. Selection/caret/view do not count.
    function openEditorFingerprint() {
      try { return editorContentFingerprint(captureEditorState()); }
      catch (_) {
        // Invalid drafts must still be protected, including values that cannot
        // yet be serialized. No validation failure clears the active work.
        return stableJson([appVars.callableDraftCore, appVars.headerPending ? [$('#callableName').value,
          $('#callableArgs').value, $('#callablePhrase').value] : null,
          [appVars.mainEditor, appVars.draftEditor].map(binding => binding.session?.pendingEdit || binding.session?.blockDraft
            ? [binding.kind, bindingOwner(binding), binding.textarea.value, binding.session.pendingEdit,
              binding.session.blockDraft ? binding.session.blockView : null] : null)]);
      }
    }
    function validateSavedEditorFingerprint(value) {
      const fail = () => { throw new AkariError('F503', 'このパソコンに のこした 作品の 書きかけの ようすが 正しく ありません'); };
      if (typeof value !== 'string' || value.length > LIMITS.fileBytes) return fail();
      let saved;
      try { saved = JSON.parse(value); } catch (_) { return fail(); }
      if (!Array.isArray(saved) || saved.length !== 2 ||
          !Array.isArray(saved[1]) || saved[1].length > 2) return fail();
      validateCallableDraftState(saved[0]);
      if (new Set(saved[1].map(d => d?.kind)).size !== saved[1].length) return fail();
      for (const d of saved[1]) {
        if (!exactKeys(d, ['kind', 'ownerKey', 'source', 'value', 'field', 'nodePath', 'draftSource']) ||
            !['script', 'draft'].includes(d.kind) || typeof d.ownerKey !== 'string' || d.ownerKey.length > 150 ||
            d.kind === 'draft' && (d.ownerKey !== 'draft' || !saved[0]) ||
            typeof d.source !== 'string' || cpLen(d.source) > LIMITS.sourceEach ||
            d.draftSource !== null && (typeof d.draftSource !== 'string' || cpLen(d.draftSource) > LIMITS.sourceEach) ||
            d.value !== null && typeof d.value !== 'string' || d.field !== null && typeof d.field !== 'string' ||
            d.nodePath !== null && (!Array.isArray(d.nodePath) || d.nodePath.length > LIMITS.blockDepth * 4 ||
              d.nodePath.some(k => typeof k !== 'string' && !Number.isInteger(k))) ||
            d.field !== null && (typeof d.value !== 'string' || !Array.isArray(d.nodePath)) ||
            JSON.stringify({value:d.value,field:d.field,nodePath:d.nodePath}).length > LIMITS.sourceEach * 4) return fail();
      }
      if (stableJson(saved) !== value) return fail();
      return value;
    }
    // A new touch body touches the stage edge until its partner is chosen (いつ動く？) or written in its heading.
    const newBodyFilter = event => event === 'touchStart' ? { filter: { target: '端' } } : {};
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
    // What the handles' and zoom's titles say is written under the screen at はじめて (E-22): how the
    // handles change a part's size while a part shows them, and how to see the screen at 100%. The other levels have it
    // beside each relevant control.
    function updateDesignHelp(c = appVars.el.form.querySelector('.design-resize-handle') && componentById(appVars.selectedId)) {
      const help = $('#designHelp'), mode = c ? designResizeMode(c) : null,
        zoom = $('#stageZoomReset').textContent.trim();
      help.textContent = (!mode ? '' : mode === 'scale'
        ? '青い 丸を おしたまま ひっぱると、形を かえずに 大きく・小さく できるよ。'
        : '青い 丸を おしたまま ひっぱると、大きさが かわるよ。' + (matchMedia('(pointer: coarse)').matches
          ? '「たて・よこを そろえる」を おしてから ひっぱると、形は そのままだよ。'
          : 'Shiftキーを おしながら 角の 丸を ひっぱると、形は そのままだよ。'))
        + (zoom && zoom !== '100%' ? '上の「' + zoom + '」を おすと、画面を 100%で 見られるよ。' : '');
      help.hidden = !help.textContent;
    }
    // A part's box on the screen in the child frame (bottom is the smaller たてのばしょ), turned and scaled.
    function designBox(c) {
      const rad = (c.direction * Math.PI) / 180,
        s = c.scalePercent / 100,
        hw = (c.w * s) / 2,
        hh = (c.h * s) / 2,
        ex = Math.abs(hw * Math.cos(rad)) + Math.abs(hh * Math.sin(rad)),
        ey = Math.abs(hw * Math.sin(rad)) + Math.abs(hh * Math.cos(rad));
      return { left: c.x - ex, right: c.x + ex, bottom: c.y - ey, top: c.y + ey };
    }
    function wrappedCodeLines() {
      const editor = appVars.el.editor, style = getComputedStyle(editor),
        width = Math.max(1, editor.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)),
        key = [width, style.font, style.letterSpacing, style.lineHeight, style.tabSize].join('|');
      if (appVars.codeLineLayout?.source === editor.value && appVars.codeLineLayout.key === key) return appVars.codeLineLayout;
      if (!appVars.codeLineMeasure) {
        appVars.codeLineMeasure = document.createElement('div');
        appVars.codeLineMeasure.setAttribute('aria-hidden', 'true');
        document.body.append(appVars.codeLineMeasure);
      }
      if (appVars.codeLineHeights.key !== key || appVars.codeLineHeights.heights.size > 50000) {
        appVars.codeLineHeights = { key, heights: new Map() };
        Object.assign(appVars.codeLineMeasure.style, { position:'fixed', left:'-100000px', top:'0', visibility:'hidden',
          pointerEvents:'none', width:width+'px', font:style.font, letterSpacing:style.letterSpacing,
          lineHeight:style.lineHeight, tabSize:style.tabSize, whiteSpace:'pre-wrap', overflowWrap:'anywhere' });
      }
      const known = appVars.codeLineHeights.heights, texts = editor.value.split('\n'), fragment = document.createDocumentFragment(), fresh = [];
      for (const text of texts) {
        if (known.has(text)) continue;
        const row = document.createElement('div'); row.textContent = text || '\u200b';
        known.set(text, 0); fresh.push([text, row]); fragment.append(row);
      }
      if (fresh.length) {
        appVars.codeLineMeasure.replaceChildren(fragment);
        for (const [text, row] of fresh) known.set(text, Math.max(22, row.getBoundingClientRect().height));
        appVars.codeLineMeasure.replaceChildren();
      }
      let height = 0;
      const lines = texts.map(text => { const top = height; height += known.get(text); return { top, height:height-top }; });
      return appVars.codeLineLayout = { source:editor.value, key, lines, height };
    }
    function meijinTextLabel(script) {
      return script && isMeijinScript(script) ? `名人の本文 ${meijinScripts().indexOf(script) + 1}` : null;
    }
    const signalName = item => String((item.filter && typeof item.filter === 'object' ? item.filter.message : item.filter) ?? '');
    function waitsForExtension(item) {
      if (appVars.scheduler?.waitsForExtension) return appVars.scheduler.waitsForExtension(item);
      const name = signalName(item);
      return EXTENSION_HOST.active && item.event === 'message' && name.startsWith('拡張:') && !!EXTENSION_HOST.describe(name.slice(3), 'events');
    }
    // A WeakSet has no size: whether a word is still being typed (IME) in either editor.
    function composingAny() { return appVars.composingEditors.has(appVars.el.editor) || appVars.composingEditors.has(appVars.draftEditor.textarea); }
    function hintGroup(h, symbols) {
      if (h.mode !== 'expression') return null;
      const key = h.category + '|' + h.text;
      if (appVars.hintGroups.has(key)) return appVars.hintGroups.get(key);
      let group = { label: h.category === 'はじめから ある 計算' ? '計算' : h.category || '計算', advanced: false };
      if (h.category !== 'しらべる') try {
        const node = parseExpression(h.text, symbols, {});
        group = { label: appVars.HINT_SENSE_KINDS.has(node?.kind) || node?.kind === 'SensorRead' ? 'しらべる' : appVars.HINT_DATA_KINDS.has(node?.kind) ? 'へんすう・リスト' : '計算',
          advanced: ADVANCED_ONLY_SCHEMA_IDS.has(node?.kind + ':' + (node?.kind === 'BuiltinCall' ? node.name : node?.op)) };
      } catch (error) { if (!(error instanceof AkariError)) throw error; }
      if (appVars.hintGroups.size > 2000) appVars.hintGroups.clear();
      appVars.hintGroups.set(key, group);
      return group;
    }

    function captureEditorState() {
      for(const binding of [appVars.mainEditor,appVars.draftEditor])captureEditorView(binding);
      const pendingEditors=[appVars.mainEditor,appVars.draftEditor].filter(binding=>binding.session?.pendingEdit||binding.session?.blockDraft)
        .map(binding=>({kind:binding.kind,ownerKey:bindingOwner(binding),source:binding.textarea.value,mode:binding.session.mode,
          pending:cloneDesignProject(binding.session.pendingEdit||{kind:'block-draft'}),
          draftTree:binding.session.blockDraft?cloneDesignProject(binding.session.blockView):null}));
      let callableDraft=captureCallableDraft();
      if(appVars.headerPending||pendingEditors.some(d=>d.kind==='draft'))callableDraft=validateCallableDraft({...appVars.callableDraftCore,
        name:$('#callableName').value,argsText:$('#callableArgs').value,...(appVars.callableDraftCore.type==='action'?{callPhrase:$('#callablePhrase').value}:{})});
      return validateEditorState({version:1,revision:appVars.recoveryEpoch,selectedId: appVars.selectedId,currentEvent: appVars.currentEvent,selectedScriptId: appVars.selectedScriptId,
        uiLevel:keptUiLevel(),sourceOverviewOpen: appVars.sourceOverviewOpen,editorModes:{script:appVars.mainEditor.session?.mode||'code',draft:appVars.draftEditor.session?.mode||'code'},callableDraft,pendingEditors,
        views:[appVars.mainEditor,appVars.draftEditor].filter(binding=>binding.session).map(binding=>({kind:binding.kind,ownerKey:bindingOwner(binding),
          codeSelection:{start:binding.textarea.selectionStart||0,end:binding.textarea.selectionEnd||0,direction:binding.textarea.selectionDirection||'none'},
          scrollState:{codeTop:binding.textarea.scrollTop,codeLeft:binding.textarea.scrollLeft}}))},appVars.project);
    }

    // Every refusal of 開く stays on the screen until とじる; the work, its history and unsaved edits stay as they
    // were. A file of another project format says which あかり opens it; any other refusal asks for an あかり file.
    // The code and the full reason stay in 出力.
    // 開く is inside the shared 作品 menu; while that menu is closed its summary takes the focus.
    function openButtonShown() {
      return [$('#openBtn'), $('#projectMenu > summary')]
        .find((n) => n && (n.checkVisibility ? n.checkVisibility({ visibilityProperty: true }) : n.getClientRects().length > 0)) || null;
    }
    function openAutosaveDB() {
      return new Promise((resolve, reject) => {
        let settled = false,
          request = null;
        const timer = setTimeout(
          () =>
            fail(
              new Error(
                'このパソコンの きろくから 返事が ありません',
              ),
            ),
          4000,
        );
        function fail(error) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(
            error || new Error('\u81ea\u52d5\u4fdd\u5b58DB\u3092\u958b\u3051\u307e\u305b\u3093'),
          );
        }
        try {
          request = indexedDB.open(STORAGE_KEYS.database, 1);
          request.onupgradeneeded = () => {
            try {
              const db = request.result;
              if (!db.objectStoreNames.contains('workspace'))
                db.createObjectStore('workspace', { keyPath: 'id' });
            } catch (e) {
              fail(e);
            }
          };
          request.onsuccess = () => {
            const db = request.result;
            if (settled) {
              db.close();
              return;
            }
            settled = true;
            clearTimeout(timer);
            db.onversionchange = () => db.close();
            resolve(db);
          };
          request.onerror = () => fail(request.error);
          request.onblocked = () =>
            fail(
              new Error(
                '\u4ed6\u306e\u753b\u9762\u304c\u81ea\u52d5\u4fdd\u5b58DB\u3092\u4f7f\u7528\u4e2d\u3067\u3059',
              ),
            );
        } catch (e) {
          fail(e);
        }
      });
    }

    function autosaveTransaction(db, operation) {
      return new Promise((resolve, reject) => {
        let settled = false,
          tx = null;
        const finish = (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            error ? reject(error) : resolve();
          },
          timer = setTimeout(() => {
            try {
              tx?.abort();
            } catch (_) {}
            finish(new Error('Autosave transaction timeout'));
          }, 5000);
        try {
          tx = db.transaction('workspace', 'readwrite');
          tx.oncomplete = () => finish();
          tx.onerror = () => finish(tx.error || new Error('Autosave transaction failed'));
          tx.onabort = () => finish(tx.error || new Error('Autosave transaction aborted'));
          operation(tx.objectStore('workspace'));
        } catch (error) {
          finish(error);
        }
      });
    }
    async function readAutosave() {
      let latest = null;
      try {
        const db = await openAutosaveDB();
        try {
          latest = await new Promise((resolve, reject) => {
            let settled = false,
              tx = null;
            const finish = (error, value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                error ? reject(error) : resolve(value || null);
              },
              timer = setTimeout(() => {
                try {
                  tx?.abort();
                } catch (_) {}
                finish(new Error('Autosave read timeout'));
              }, 5000);
            try {
              tx = db.transaction('workspace', 'readonly');
              const req = tx.objectStore('workspace').get('latest');
              req.onsuccess = () => finish(null, req.result);
              req.onerror = () => finish(req.error || new Error('Autosave read failed'));
              tx.onabort = () => finish(tx.error || new Error('Autosave read aborted'));
              tx.onerror = () => finish(tx.error || new Error('Autosave read failed'));
            } catch (error) {
              finish(error);
            }
          });
        } finally {
          db.close();
        }
      } catch (_) {}
      try {
        const fallback = JSON.parse(localStorage.getItem(STORAGE_KEYS.fallback) || 'null');
        if (fallback && (!latest || Number(fallback.updatedAt) >= Number(latest.updatedAt)))
          latest = fallback;
      } catch (_) {}
      if (latest && Number.isFinite(latest.updatedAt))
        appVars.autosaveRevisionTime = Math.max(appVars.autosaveRevisionTime, latest.updatedAt);
      return latest;
    }

    function validateCallableDraft(d) { return validateCallableDraftState(d); }
    function captureCallableDraft() {
      return hasCallableDraft() ? validateCallableDraft(appVars.callableDraftCore) : null;
    }

    function callableSignature() {
      const d = appVars.callableDraftCore;
      return JSON.stringify([d.type, d.name, d.argsText, d.callPhrase || '', d.source]);
    }
    function hasCallableDraft() {
      return appVars.callableBaseline !== '' && callableSignature() !== appVars.callableBaseline;
    }
    function resourceDraftRecords() {
      const drafts = [];
      for (const binding of [appVars.mainEditor, appVars.draftEditor]) {
        const session = binding.session;
        if (!session?.pendingEdit && !session?.blockDraft) continue;
        drafts.push({ key: 'draft-reference:' + binding.kind, ownerId: bindingContext(binding).targetId,
          kind: binding.kind === 'script' ? 'script' : 'draft', title: 'なおして いる 本文',
          incomplete: true, source: session.blockDraft?.source || binding.textarea.value,
          context: bindingContext(binding) });
      }
      if (hasCallableDraft() && !drafts.some(d => d.key === 'draft-reference:draft'))
        drafts.push({ key: 'draft-reference:callable', ownerId: 'stage', kind: 'draft', title: 'なおして いる 自分で作ったブロック',
          source: appVars.callableDraftCore.source, context: bindingContext(appVars.draftEditor) });
      return drafts;
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
      log(title.textContent, 'error');
    }
    Object.assign(appCalls, {
      $,
      $$,
      allIds,
      assistEligible,
      autosaveTransaction,
      bindingContext,
      bindingOwner,
      callableSignature,
      cancelAssist,
      captureEditorState,
      captureEditorView,
      chosenEditorMode,
      closeAssist,
      closeRuntimeInspector,
      componentById,
      composingAny,
      confirmTutorialOperation,
      currentFingerprint,
      currentIsMeijin,
      designBox,
      designHandleKey,
      designHandlesSmall,
      designHandlesSmallShown,
      diagnosticLocation,
      diagnosticOwner,
      diagnosticSentence,
      diagnosticSource,
      draftOwner,
      dropHistoryTimer,
      ensureUniqueId,
      focusTutorialTarget,
      hasCallableDraft,
      hasPendingEditor,
      hideMeijinProcedure,
      hintGroup,
      log,
      meijinScripts,
      meijinTextLabel,
      modeBlockedNote,
      modelLocked,
      newBodyFilter,
      openAutosaveDB,
      openButtonShown,
      openEditorFingerprint,
      pushHistoryNow,
      readAutosave,
      readSource,
      resourceDraftRecords,
      sentence,
      setStageZoom,
      setStatus,
      showBlockedNote,
      showResourceImpact,
      shownEditorMode,
      signalName,
      snapshot,
      sourceCandidate,
      stateFingerprintCore,
      stopPreview,
      targetById,
      targetType,
      tutorialElementAllowed,
      tutorialFocusTargets,
      tutorialInsertionReady,
      updateDesignHelp,
      updateDirty,
      validateCallableDraft,
      validateSavedEditorFingerprint,
      waitsForExtension,
      workIsMeijin,
      wrappedCodeLines,
    });
  }
