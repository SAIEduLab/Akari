  // ────────────────────────────────────────────────────────────────────────
  // 11 — Project lifecycle: running, saving, opening, autosave and undo history
  // ────────────────────────────────────────────────────────────────────────
  // Called once at the start of initApp: appVars is the state it shares, appCalls the functions other parts call.
  function createAppProject(appVars, appCalls) {
    function selectEntryEvent(event) {
      if (!tutorialAllows(appVars.tutorial,'event:'+event)||appCalls.modelLocked()||!eventsFor(appVars.selectedId).includes(event)||!flushActiveEditor()) return;
      appCalls.captureEditorView(appVars.mainEditor);hideSourceOverview();appVars.currentEvent=event;
      appVars.selectedScriptId=appVars.project.scripts.find(s=>s.targetId===appVars.selectedId&&s.event===event)?.id||null;
      loadEditor();if(!appCalls.modelLocked())appCalls.pushHistoryNow();appCalls.confirmTutorialOperation('event:'+event);tutorialRefresh();
    }
    function tutorialBody() { return appVars.mainEditor.session?.blockView?.bodies?.body||[]; }
    function tutorialChoose(key) {
      const step=tutorialStep(appVars.tutorial);if(!step||step.action!=='choice'||appCalls.modelLocked()||!flushActiveEditor())return;
      let extra;
      if(key==='finish')extra=[tutorialDefine({id:'save-work',action:'save',message:'「保存」を おして、作った 作品を ファイルに ほぞんしよう。'}),
        tutorialDefine({id:'verify-save',action:'verify-save',message:'「ほぞんした 作品を たしかめる」を おして、いま ほぞんした ファイルを えらぼう。'})];
      else if(step.choice==='course'){
        const course=TUTORIAL_COURSES.find(c=>c.id===key);if(!course||appVars.tutorial.courses.includes(key))return;
        appVars.tutorial.courses.push(key);extra=tutorialCourseSteps(key,tutorialBody().length,key);
      }else{
        const course=TUTORIAL_COURSES.find(c=>c.id===step.course),leaf=course?.children.find(c=>c.id===key);if(!leaf)return;
        appVars.tutorial.leaves.push(key);extra=tutorialExtensionSteps(step.course,key,tutorialBody().length,step.course+'-'+key);
      }
      appVars.tutorial.steps=[...appVars.tutorial.steps.slice(0,appVars.tutorial.index+1),...extra];appVars.tutorial.index++;appVars.tutorial.confirmedStep=null;appVars.tutorialTrace=null;
      appVars.tutorialExpected=tutorialExpectedTrees(makeTutorialProject(),appVars.tutorial.steps,appVars.tutorial.values);
      appVars.mainEditor.view.render({force:true});tutorialRefresh();appCalls.focusTutorialTarget();
    }
    function tutorialFacts() {
      const step=tutorialStep(appVars.tutorial),tree=appVars.mainEditor.session?.blockView,expectedTree=appVars.tutorialExpected?.[appVars.tutorial.index+1];
      const matches=tree&&expectedTree&&JSON.stringify(tutorialNodeShape(tree.bodies.body))===JSON.stringify(tutorialNodeShape(expectedTree.bodies.body));
      let expected=!!matches;
      if(step?.action==='run')expected=expected&&appVars.appState==='RUNNING';
      if(step?.action==='runtime:click')expected=expected&&appVars.tutorialTrace?.trial===step.id.slice(4)&&!!appVars.tutorialTrace.complete;
      if(step?.action==='stop')expected=expected&&appVars.appState==='DESIGN'&&!!appVars.tutorialTrace?.complete;
      if(step?.action==='save')expected=expected&&!!appVars.tutorialSave&&appVars.tutorialSave.fingerprint===currentFingerprint();
      if(step?.action==='verify-save')expected=expected&&!!appVars.tutorialSave?.verified;
      return {confirmedStep:appVars.tutorial.confirmedStep,sameWork:appVars.workspaceIdentity===appVars.tutorial.identity&&appVars.selectedId===appVars.tutorial.target&&appVars.currentEvent==='click',
        pending:!!appVars.mainEditor.session?.pendingEdit&&appVars.mainEditor.session.pendingEdit.kind!=='block-draft'||composingAny(),
        failed:!!appVars.tutorialTrace?.failed,expected};
    }
    function tutorialRefresh() {
      if (!appVars.tutorial) return;
      try {
        appCalls.tutorialCollectRuntime();
        if (tutorialStep(appVars.tutorial)?.id==='verify-save'&&appVars.tutorialSave&&appVars.tutorialSave.fingerprint!==currentFingerprint()) {
          appVars.tutorialSave=null;appVars.tutorial={...appVars.tutorial,index:tutorialSequence(appVars.tutorial).findIndex(s=>s.id==='save-work')};
        }
        const stepBefore=tutorialStep(appVars.tutorial),facts=tutorialFacts();
        // Selecting the click event is itself the first predicate; before that,
        // same-work does not require the event to have already been selected.
        if(stepBefore?.id==='choose-click')facts.sameWork=appVars.workspaceIdentity===appVars.tutorial.identity&&appVars.selectedId===appVars.tutorial.target;
        const next=tutorialAdvance(appVars.tutorial,facts,appVars.tutorial.epoch),changed=next!==appVars.tutorial;appVars.tutorial=next;
        if (appVars.tutorial.phase==='complete') { appCalls.finishTutorial(true);setStatus('できたね！ つぎは、じゆうに かえて 遊ぼう。');return; }
        const step=tutorialStep(appVars.tutorial);document.body.dataset.tutorialStep=step.id;
        if(changed){appVars.tutorialInsertion=null;appVars.mainEditor.view.render({force:true});}
        appCalls.$('#tutorialGuide').hidden=false;appCalls.$('#tutorialVerifySave').hidden=step.id!=='verify-save';
        appCalls.renderTutorialChoices(step);
        if(appVars.tutorialNotice&&appVars.tutorialNotice.step!==step.id)appVars.tutorialNotice=null;
        appCalls.$('#tutorialText').textContent=appVars.tutorialTrace?.failed?'動かなかったね。「■ 止める」で もどって、もう一度 やって みよう。':step.choice==='course'&&appVars.tutorial.courses.length===TUTORIAL_COURSES.length?'3つの 遊びを 組み合わせたね！ ほぞんして、自分で 遊んでみよう。':appVars.tutorialNotice?.text||step.message;
        appCalls.refreshTutorialPresentation();
        if(changed)appCalls.focusTutorialTarget();
      } catch(error) { appCalls.finishTutorial(false);log('あんないを つづけられませんでした: '+error.message,'error');setStatus('あんないを つづけられなかったよ。作品は のこって いるよ'); }
    }
    async function beginTutorial() {
      const blocked=()=>appVars.tutorial||document.body.dataset.uiLevel!=='entry'||appCalls.modelLocked()||document.querySelector('.modal.show,.modal.open,dialog[open]');
      if (blocked()) return;
      if (appVars.pausedTutorial&&appVars.pausedTutorial.identity===appVars.workspaceIdentity&&appVars.pausedTutorial.fingerprint===currentFingerprint()
        &&appVars.pausedTutorial.editorFingerprint===openEditorFingerprint()&&appVars.selectedId===appVars.pausedTutorial.target&&appVars.currentEvent==='click') {
        appVars.tutorial={...appVars.pausedTutorial,confirmedStep:null,epoch:++appVars.tutorialEpoch,phase:'waiting'};appVars.pausedTutorial=null;
        appVars.tutorialTrace=appVars.tutorial.trace?{...appVars.tutorial.trace,epoch:appVars.tutorial.epoch}:null;
        appVars.tutorialSave=null;
        if(tutorialStep(appVars.tutorial)?.id==='verify-save')appVars.tutorial.index=tutorialSequence(appVars.tutorial).findIndex(s=>s.id==='save-work');
      } else {
        if(!(await askLose())||blocked())return;
        const practice=makeTutorialProject(),store=makeDefaultAssetStore();for(const asset of tutorialAssetRecords())store.addImmutable(asset);
        appVars.tutorialExpected=tutorialExpectedTrees(practice);
        replaceCurrentProject(practice,store,'sprite-1','start','「さかなキャッチ」を いっしょに 作ろう');
        appVars.tutorial={epoch:++appVars.tutorialEpoch,index:0,phase:'waiting',identity:appVars.workspaceIdentity,target:'sprite-1',steps:[...TUTORIAL_STEPS],courses:[],leaves:[],values:{}};
        appVars.pausedTutorial=null;appVars.tutorialSave=null;appVars.tutorialTrace=null;
        if(appVars.mainEditor.session?.mode!=='blocks')appCalls.switchEditorMode(appVars.mainEditor,'blocks');
      }
      if(appVars.mainEditor.session?.mode!=='blocks')appCalls.switchEditorMode(appVars.mainEditor,'blocks');
      appVars.tutorialInsertion=null;appVars.mainEditor.view.render({force:true});tutorialRefresh();appCalls.focusTutorialTarget();clearInterval(appVars.tutorialTimer);appVars.tutorialTimer=setInterval(tutorialRefresh,80);
    }
    async function verifyTutorialSave(file) {
      if (!appVars.tutorial||!tutorialAllows(appVars.tutorial,'verify-save')||!appVars.tutorialSave||!file) return;
      const epoch=appVars.tutorial.epoch,save=appVars.tutorialSave,identity=appVars.workspaceIdentity;
      try {
        if(file.size>LIMITS.fileBytes)throw Object.assign(new Error('ファイルが 大きすぎるよ'),{child:true});
        const loaded=await parseProjectFile(await file.text());
        if(!appVars.tutorial||appVars.tutorial.epoch!==epoch||appVars.workspaceIdentity!==identity||appVars.tutorialSave!==save)return;
        if(currentFingerprint()!==save.fingerprint){appVars.tutorialSave=null;appVars.tutorial.index=tutorialSequence(appVars.tutorial).findIndex(s=>s.id==='save-work');tutorialRefresh();return;}
        if(assetStateFingerprint(loaded.project,loaded.assetStore)!==save.fingerprint||loaded.editorState?.pendingEditors.length||loaded.editorState?.callableDraft)
          throw Object.assign(new Error('いま ほぞんした 作品と 中身が ちがうよ'),{child:true});
        save.verified=true;appCalls.confirmTutorialOperation('verify-save');tutorialRefresh();
      } catch(error) { if(appVars.tutorial?.epoch===epoch) { appVars.tutorialNotice={step:tutorialStep(appVars.tutorial)?.id,text:'たしかめられなかったよ。いま ほぞんした ファイルを、もう一度 えらぼう。'};tutorialRefresh();log('ほぞんした ファイルを たしかめられませんでした: '+error.message,'error');setStatus('ほぞんを たしかめられなかったよ。'+(error.child?error.message:'あかりで ほぞんした ファイルでは ないよ')); } }
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
        appVars.composingEditors.has(appCalls.$('#callableName')) ||
        (appVars.composingEditors.has(appCalls.$('#callableArgs')) || appVars.composingEditors.has(appCalls.$('#callablePhrase')))
      );
    }
    // While the import review waits, ▶ 動かす and うごく作品を ファイルにする say how to finish it, in the words of the
    // review's own buttons.
    function sourceImportChoice() {
      if (appCalls.$('#sourceImport').hidden) return '';
      const take = ['#sourceImportConfirm', '#sourceImportSeparate', '#sourceImportEditCurrent'].map((id) => appCalls.$(id)).find((b) => b && !b.disabled);
      return '本文を 入れる ところを たしかめてね。' + (take ? `「${take.textContent}」か「取りこみを やめる」を おしてね` : '「取りこみを やめる」を おしてね');
    }
    function flushActiveEditor({ preserveView = false } = {}) {
      if (appVars.colorEdit) return false;
      if (appVars.flushingEditor) return true;
      appVars.flushingEditor = true;
      try {
        appVars.activeDragCleanup?.();
        if (appCalls.$('#procModal').classList.contains('show')) {
          if (!appCalls.flushEditor(appVars.draftEditor, { preserveView })) return false;
          return appCalls.syncCallableDraft();
        }
        return appCalls.flushEditor(appVars.mainEditor, { preserveView });
      } finally {
        appVars.flushingEditor = false;
      }
    }
    function editorContentFingerprint(state) {
      return stableJson([state.callableDraft,state.pendingEditors.map(d=>({kind:d.kind,ownerKey:d.kind==='draft'?'draft':d.ownerKey,source:d.source,
        value:d.pending.value??null,field:d.pending.field??null,nodePath:d.pending.nodePath??null,
        draftSource:d.draftTree?formatScript(blockDecode(d.draftTree,{allowHoles:true}),{allowHoles:true}):null}))]);
    }
    function stateFingerprintCore(fingerprint = currentFingerprint()) {
      const pending=[appVars.mainEditor,appVars.draftEditor].filter(b=>b.session?.blockDraft||b.session?.pendingEdit&&!b.session.pendingEdit.rejected&&(!b.session.pendingEdit.field||b.session.pendingEdit.invalid)).map(b=>({kind:b.kind,ownerKey:appCalls.bindingOwner(b),source:b.textarea.value,
        pending:b.session.pendingEdit||{},draftTree:b.session.blockDraft?b.session.blockView:null}));
      const draft=appVars.headerPending?{...appVars.callableDraftCore,name:appCalls.$('#callableName').value,argsText:appCalls.$('#callableArgs').value,
        ...(appVars.callableDraftCore.type==='action'?{callPhrase:appCalls.$('#callablePhrase').value}:{})}:appCalls.hasCallableDraft()?appVars.callableDraftCore:null;
      return JSON.stringify([fingerprint,editorContentFingerprint({callableDraft:draft,pendingEditors:pending})]);
    }
    function openMeijinProcedure() {
      const d = meijinProjectDefinitions(appVars.project).find(x => x.id === appVars.meijinProcedureId);
      if (!d || !flushActiveEditor()) return;
      appCalls.$('#procModal').classList.remove('show');
      appVars.selectedId = MEIJIN_OWNER; appVars.currentEvent = 'start'; appVars.selectedScriptId = d.scriptId;
      hideSourceOverview(); renderTree(); appCalls.renderProperties(); loadEditor(); appCalls.renderComponents();
      const lines = appVars.el.editor.value.split('\n'), start = lines.slice(0, d.headLine - 1).reduce((sum, line) => sum + line.length + 1, 0);
      // The closed dialog gives focus back (and lets the page take focus) in its observer, which runs first.
      queueMicrotask(() => {
        appVars.el.editor.focus();
        appVars.el.editor.setSelectionRange(start, start + (lines[d.headLine - 1] || '').length);
      });
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
      if (!/^よこのばしょ /.test(m || '')) appCalls.$('#statusLive').textContent = m;
      if (m && document.body.dataset.uiLevel === 'entry' && typeof appVars.el.status.animate === 'function') {
        appVars.statusFlash?.cancel();
        appVars.statusFlash = appVars.el.status.animate([{ backgroundColor: '#ffe9a8' }, { backgroundColor: 'transparent' }], { duration: 1600, easing: 'ease-out' });
      }
    };
    const targetType = (id) => (id === 'stage' ? 'stage' : id === MEIJIN_OWNER ? MEIJIN_OWNER : appCalls.componentById(id)?.type);
    const meijinScripts = () => appVars.project.scripts.filter(isMeijinScript);
    function currentFingerprint() {
      return assetStateFingerprint(appVars.project, appVars.assetStore);
    }
    function setAssetProgress(text = '') {
      const n = appCalls.$('#assetProgress');
      if (!n) return;
      n.textContent = text;
      n.style.display = text ? 'block' : 'none';
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
    function disposeRuntime() {
      appCalls.closeRuntimeInspector();
      appCalls.$('#listRepairPanel')?.remove();
      appVars.generationToken++;
      appVars.stageView.clear();
      appVars.physicalKeys.clear();
      if (appVars.runtimePaintFrame !== null) cancelAnimationFrame(appVars.runtimePaintFrame);
      appVars.runtimePaintFrame = null;
      appVars.runtimePaintFlags = 0;
      appVars.debugSourceKey = null;
      if (appVars.scheduler) {
        appVars.scheduler.stop();
        appVars.scheduler = null;
      } else if (appVars.runtime) appVars.runtime.stopAllAudio?.(false);
      appVars.runtime = null;
      appVars.activeLoc = null;
      appVars.keptFail = null;
      appVars.activeTaskId = null;
      if (appVars.runtimeCache) {
        appVars.runtimeCache.dispose();
        appVars.runtimeCache = null;
      }
      for (const id of ['failureModal', 'valueModal']) appCalls.$('#' + id)?.classList.remove('show');
      appVars.activeFailureId = null;
      appVars.valueView = null;
    }
    function closeEditingModals() {
      stopPreview();
      for (const id of ['assetModal', 'procModal', 'dataModal'])
        appCalls.$('#' + id)?.classList.remove('show');
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
        editorState: appCalls.captureEditorState(),
        draft: { ...appVars.callableDraftCore },
        callableBaseline: appVars.callableBaseline,
        callableLoadedKey: appVars.callableLoadedKey,
        draftSerial: appVars.editorDraftSerial,
        draftOpen: appCalls.$('#procModal').classList.contains('show'),
      };
    }
    function resetHistory() {
      appCalls.dropHistoryTimer();
      appVars.initialSnapshot = snapshot();
      appVars.history = [appVars.initialSnapshot];
      appVars.redo = [];
      appVars.lastSavedFingerprint = currentFingerprint();
      appVars.lastSavedEditorFingerprint = openEditorFingerprint();
      appVars.lastObservedFingerprint = stateFingerprintCore();
      appVars.dirty = false;
      updateDirty();
    }
    function updateDirty() {
      appVars.dirty = currentFingerprint() !== appVars.lastSavedFingerprint;
      const draft = appCalls.hasCallableDraft() || hasPendingEditor();
      appVars.el.dirty.textContent = appVars.dirty ? 'ファイルに まだ ほぞんして いないよ' : draft ? '書きかけが あるよ' : 'かえた ところは ないよ';
      appVars.el.dirty.className = appVars.dirty || draft ? 'dirty-state dirty' : 'dirty-state';
      // The saving state reads as one sentence: what this computer keeps, then the file (このパソコンに のこしたよ。ファイルに
      // まだ ほぞんして いないよ). With nothing changed only かえた ところは ないよ is said.
      appVars.el.autosave.classList.toggle('save-quiet', !appVars.dirty && !draft);
      const locked = appCalls.modelLocked();
      appCalls.$('#undoBtn').disabled =
        locked || (appVars.history.length <= 1 && appVars.history[0]?.stateFingerprint === stateFingerprintCore());
      appCalls.$('#redoBtn').disabled = locked || !appVars.redo.length;
      document.title = `${appVars.dirty || draft ? '● ' : ''}${productLabel()} — ${appVars.project.name}`;
    }
    function restoreSnap(e,{restoreView=false}={}) {
      appVars.restoringSnapshot=true;
      // The view stays as shown; in a work with a 名人 text (shown in code) the chosen view stays.
      const shown=binding=>appCalls.workIsMeijin()?appVars.editorModes.get(binding.kind)||'code':binding.session?.mode||'code';
      const view={uiLevel:appVars.baseUiLevel,sourceOverviewOpen: appVars.sourceOverviewOpen,editorModes:{script:shown(appVars.mainEditor),draft:shown(appVars.draftEditor)}};
      // Going back to before the 名人 text was made also brings back how the body was shown then (はじめて shows blocks).
      if(appCalls.workIsMeijin()&&!(e.project.scripts||[]).some(isMeijinScript)&&e.editorState)view.editorModes.script=e.editorState.editorModes.script;
      try {
      appVars.recoveryEpoch++;
      validateAssetReferences(e.project, new AssetStore(e.assets));
      disposeRuntime();
      appCalls.revokeDesignUrls();
      appVars.project = cloneDesignProject(e.project);
      appVars.assetStore = new AssetStore(e.assets);
      appVars.selectedId = e.selectedId && appCalls.targetById(e.selectedId) ? e.selectedId : 'stage';
      appVars.currentEvent = e.currentEvent || 'start';
      appVars.selectedScriptId = e.selectedScriptId || null;
      appVars.appState = 'DESIGN';
      appVars.callableDraftCore = {
        ...(e.draft || {
          ownerId: 'stage',
          type: 'action',
          name: '',
          argsText: '',
          source: '',
          editId: '',
          loadedKey: '',
        }),
      };
      appVars.callableBaseline = e.callableBaseline || JSON.stringify(['action', '', '', '']);
      appVars.callableLoadedKey = e.callableLoadedKey || '';
      appVars.editorDraftSerial = e.draftSerial || ++appVars.editorDraftSerial;
      appVars.editorSessions.clear();
      appCalls.invalidateEditors();
      appCalls.paintCallable();
      appCalls.$('#procModal').classList.toggle('show', !!e.draftOpen || appCalls.hasCallableDraft());
      appCalls.renderCallableOptions(appVars.callableLoadedKey);
      // A procedure made in a 名人 text that was shown is shown again as the restored text makes it (or no longer).
      if (appVars.meijinProcedureId) appCalls.showMeijinProcedure(appVars.meijinProcedureId);
      appVars.lastObservedFingerprint = stateFingerprintCore();
      appCalls.renderAll();
      loadEditor();
      if (appCalls.$('#procModal').classList.contains('show')) appCalls.renderEditorBinding(appVars.draftEditor);
      if(e.editorState){appCalls.restoreEditorState({...e.editorState,...(restoreView?{}:view)});appVars.callableBaseline=e.callableBaseline||appVars.callableBaseline;appVars.callableLoadedKey=e.callableLoadedKey||'';appCalls.$('#procModal').classList.toggle('show',!!e.draftOpen);}
      appVars.lastObservedFingerprint=stateFingerprintCore();
      e.stateFingerprint=appVars.lastObservedFingerprint;
      updateDirty();
      } finally { appVars.restoringSnapshot=false; }
      scheduleAutosave();
    }
    function undo() {
      if (!tutorialAllows(appVars.tutorial,'undo')) return;
      if (appCalls.modelLocked() || composingAny() || appVars.activeDragCleanup || appVars.colorEdit) return;
      flushActiveEditor();
      appCalls.dropHistoryTimer();
      const cur = snapshot();
      if (appVars.history.at(-1)?.stateFingerprint !== cur.stateFingerprint) appVars.history.push(cur);
      if (appVars.history.length <= 1) return;
      appVars.redo.push(appVars.history.pop());
      restoreSnap(appVars.history.at(-1));
      appCalls.confirmTutorialOperation('undo');
      setStatus('1つ前に もどしたよ');
    }
    function redoDo() {
      if (appVars.tutorial) return;
      if (appCalls.modelLocked() || composingAny() || appVars.activeDragCleanup || appVars.colorEdit || !appVars.redo.length) return;
      flushActiveEditor();
      if(appVars.history.at(-1)?.stateFingerprint!==stateFingerprintCore()){appCalls.pushHistoryNow();return;}
      appCalls.dropHistoryTimer();
      const e = appVars.redo.pop();
      appVars.history.push(e);
      restoreSnap(e);
      setStatus('やり直したよ');
    }
    // Pair the existing saved project fingerprint with the unfinished content
    // already included in saved editorState. Selection/caret/view do not count.
    function openEditorFingerprint() {
      try { return editorContentFingerprint(appCalls.captureEditorState()); }
      catch (_) {
        // Invalid drafts must still be protected, including values that cannot
        // yet be serialized. No validation failure clears the active work.
        return stableJson([appVars.callableDraftCore, appVars.headerPending ? [appCalls.$('#callableName').value,
          appCalls.$('#callableArgs').value, appCalls.$('#callablePhrase').value] : null,
          [appVars.mainEditor, appVars.draftEditor].map(binding => binding.session?.pendingEdit || binding.session?.blockDraft
            ? [binding.kind, appCalls.bindingOwner(binding), binding.textarea.value, binding.session.pendingEdit,
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
    function currentOpenState() {
      // Opening may be cancelled: retain the existing inline diagnosis and editor geometry.
      flushActiveEditor({ preserveView: true });
      appVars.activeDragCleanup?.();
      const content = currentFingerprint(), editor = openEditorFingerprint();
      return { fingerprint: stableJson([content, editor]),
        unsaved: content !== appVars.lastSavedFingerprint || editor !== appVars.lastSavedEditorFingerprint ||
          composingAny() || !!appVars.colorEdit };
    }
    function finishOpenSelection() {
      appVars.openRequest = null;
      appVars.el.fileInput.value = '';
      if (!document.querySelector('.modal.show,.modal.open,dialog[open]')) appCalls.openButtonShown()?.focus({preventScroll:true});
    }
    function selectProjectForOpen() {
      if (!appVars.openRequest || appCalls.modelLocked()) return;
      appVars.openRequest.phase = 'selection';
      if (appVars.openRequest.kind === 'sample') { showSamplePicker(); return; }
      appVars.el.fileInput.value = '';
      try { appVars.el.fileInput.click(); }
      catch (error) { finishOpenSelection(); log(error.message, 'error'); }
    }
    // 開く and お手本を開く ask in the one dialog for work that would be replaced (askLose) before the choice. The
    // approval holds for the work as it was asked about; saving first does not change it.
    async function confirmOpenRequest(kind) {
      const observed = currentOpenState(), request = { kind, fingerprint: observed.fingerprint, phase: 'confirmation' };
      appVars.openRequest = request;
      const go = await askLose(observed);
      if (appVars.openRequest !== request) return;
      if (!go) {
        appVars.openRequest = null;
        // やめる: the focus goes back to the button that asked (at はじめて 開く is in the 作品 menu).
        if (!document.querySelector('.modal.show,.modal.open,dialog[open]')) (kind === 'sample' ? appCalls.$('#sampleBtn') : appCalls.openButtonShown())?.focus({ preventScroll: true });
        return;
      }
      selectProjectForOpen();
    }
    function requestOpenProject() {
      if(appVars.tutorial)return;
      if (appCalls.modelLocked() || appVars.openRequest || document.querySelector('.modal.show:not(#procModal),.modal.open,dialog[open]')) return;
      confirmOpenRequest('file');
    }
    function askLose(observed = currentOpenState()) {
      if (!observed.unsaved) return Promise.resolve(true);
      if (appVars.loseConfirm) return Promise.resolve(false);
      const origin = document.activeElement;
      appCalls.$('#loseConfirmMessage').textContent = `「${appVars.project.name}」には まだ ほぞんして いない ところが あるよ。このまま つづけると、いまの 作品は なくなるよ。`;
      appCalls.$('#loseConfirmModal').classList.add('show');
      appCalls.$('#loseConfirmCancel').focus({preventScroll:true});
      return new Promise((resolve) => {
        appVars.loseConfirm = (answer) => {
          appVars.loseConfirm = null;
          appCalls.$('#loseConfirmModal').classList.remove('show');
          // やめる gives the focus back to the button that asked, once the dialog has let go of the page (the modal
          // manager clears #app.inert on its own turn); a button inside the closed 作品 menu gives it to the menu.
          if (!answer) setTimeout(() => {
            if (document.querySelector('.modal.show,.modal.open,dialog[open]')) return;
            const shown = n => !!n?.isConnected && (n.checkVisibility ? n.checkVisibility({ visibilityProperty: true }) : n.getClientRects().length > 0);
            (shown(origin) ? origin : origin?.closest?.('details')?.querySelector(':scope > summary'))?.focus?.({preventScroll:true});
          }, 0);
          resolve(answer && currentOpenState().fingerprint === observed.fingerprint);
        };
      });
    }
    function eventsFor(id) {
      if (id === MEIJIN_OWNER) return ['start'];
      return EVENT_BY_TYPE[targetType(id)] || EVENT_BY_TYPE.stage;
    }
    function selectCurrentScript() {
      let row = appVars.selectedScriptId ? appVars.project.scripts.find((x) => x.id === appVars.selectedScriptId &&
        x.targetId === appVars.selectedId && x.event === appVars.currentEvent) : null;
      row ||= appVars.project.scripts.find((x) => x.targetId === appVars.selectedId && x.event === appVars.currentEvent);
      appVars.selectedScriptId = row?.id || null;
      return row;
    }
    function loadEditor() {
      appVars.debugSourceKey = null;
      const evs = eventsFor(appVars.selectedId);
      if (!evs.includes(appVars.currentEvent)) appVars.currentEvent = evs[0];
      selectCurrentScript();
      appCalls.renderSelectors();
      appCalls.getEditorSession(appVars.mainEditor);
      appCalls.renderEditorBinding(appVars.mainEditor);
      appCalls.refreshEditor();
    }
    function hideSourceOverview() {
      appVars.sourceOverviewOpen = false;
      appVars.sourceOverviewSignature = '';
      appCalls.$('.codewin').dataset.sourceOverview = 'false';
      appCalls.$('#sourceOverview').hidden = true;
      appVars.sourceOverviewObserver?.disconnect();
      for (const view of appVars.sourceOverviewViews) view.destroy();
      appVars.sourceOverviewViews = [];
      appCalls.$('#sourceOverview').replaceChildren();
    }
    function selectObject(id) {
      if (appVars.tutorial) return false;
      if (!appCalls.targetById(id) || !flushActiveEditor()) {
        appCalls.renderSelectors();
        return false;
      }
      appCalls.captureEditorView(appVars.mainEditor);
      if (!appCalls.modelLocked()) {
        appCalls.dropHistoryTimer();
        appCalls.pushHistoryNow();
      }
      const sameObject = appVars.selectedId === id;
      appVars.selectedId = id;
      hideSourceOverview();
      const evs = eventsFor(id);
      if (!evs.includes(appVars.currentEvent)) appVars.currentEvent = evs[0];
      // はじめて opens the start and click bodies only (F-05): a body of another event (ふれたとき, keys …) is kept, and
      // the note under the event buttons says so.
      const entry = document.body.dataset.uiLevel === 'entry', shownAtLevel = x => !entry || ['start', 'click'].includes(x.event);
      if (entry && !['start', 'click'].includes(appVars.currentEvent)) appVars.currentEvent = 'start';
      if (!sameObject) {
        appVars.selectedScriptId = null;
        const matching = appVars.project.scripts.find((x) => x.targetId === id && x.event === appVars.currentEvent && x.source.trim()),
          first = matching || appVars.project.scripts.find((x) => x.targetId === id && x.source.trim() && shownAtLevel(x));
        if (first) { appVars.currentEvent = first.event; appVars.selectedScriptId = first.id || null; }
      }
      renderTree();
      appCalls.renderProperties();
      loadEditor();
      appCalls.renderComponents();
      // Navigation changes the view of the current history frame, not its
      // content. The next atomic field edit must undo to this selected owner.
      if (!appCalls.modelLocked()) appCalls.pushHistoryNow();
      return true;
    }
    function renderTree() {
      appVars.el.tree.textContent = '';
      appVars.el.tree.setAttribute('role', 'listbox');
      appVars.el.tree.setAttribute('aria-label', '\u4f5c\u54c1\u306e\u90e8\u54c1');
      const ids = ['stage', ...appVars.project.components.map((c) => c.id), ...(meijinScripts().length ? [MEIJIN_OWNER] : [])];
      const row = (id, label) => {
        const d = document.createElement('div');
        d.className = 'tree-item' + (id === appVars.selectedId ? ' selected' : '');
        d.textContent = label;
        d.tabIndex = id === appVars.selectedId ? 0 : -1;
        d.setAttribute('role', 'option');
        d.setAttribute('aria-selected', String(id === appVars.selectedId));
        d.onclick = () => selectObject(id);
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
            selectObject(ids[next]);
            appVars.el.tree.querySelector('[tabindex="0"]')?.focus();
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectObject(id);
            appVars.el.tree.querySelector('[tabindex="0"]')?.focus({ preventScroll: true });
          }
        };
        appVars.el.tree.appendChild(d);
      };
      row('stage', `\u25a3 ${appVars.project.stage.name}`);
      for (const c of appVars.project.components)
        row(c.id, `${c.type === 'sprite' ? '\u2605' : '\u2022'} ${c.name}`);
      if (meijinScripts().length) row(MEIJIN_OWNER, '\u270e ' + appVars.MEIJIN_TARGET.name);
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
    // Where a new part's centre goes, in whole steps. The first choice (start) is used when the part fits on the
    // screen there and keeps 10 steps from every visible part. Otherwise the first such spot is taken from the top
    // row down, left to right, in 20-step steps. When there is none, it goes 16 right and 16 down from the first
    // choice while another part's centre is already there.
    function newPartPlace(components, stage, w, h, start) {
      const margin = 10,
        boxes = components.filter((c) => c.visible).map(designBox),
        free = (x, y) =>
          x - w / 2 >= 0 && x + w / 2 <= stage.width && y - h / 2 >= 0 && y + h / 2 <= stage.height &&
          !boxes.some((b) => x - w / 2 < b.right + margin && x + w / 2 > b.left - margin &&
            y - h / 2 < b.top + margin && y + h / 2 > b.bottom - margin);
      let x = Math.round(start.x),
        y = Math.round(start.y);
      if (free(x, y)) return { x, y };
      for (let top = stage.height - margin; top - h >= margin; top -= 20)
        for (let left = margin; left + w <= stage.width - margin; left += 20) {
          const cx = Math.round(left + w / 2),
            cy = Math.round(top - h / 2);
          if (free(cx, cy)) return { x: cx, y: cy };
        }
      while (components.some((c) => Math.abs(c.x - x) < 1 && Math.abs(c.y - y) < 1)) {
        x += 16;
        y -= 16;
      }
      return { x, y };
    }
    // x/y (a drop) is the new centre; without them the part is placed where it can be seen (newPartPlace).
    function addComponent(type, x = null, y = null, spritePreset = '') {
      if (appCalls.modelLocked() || !flushActiveEditor()) return;
      appCalls.dropHistoryTimer();
      appCalls.pushHistoryNow();
      if (appCalls.modelLocked() || !['label', 'button', 'input', 'box', 'sprite'].includes(type)) return;
      if (appVars.project.components.length >= LIMITS.components) {
        log('部品が いっぱいで、もう ふやせません。いらない部品を けして ください', 'error');
        setStatus('キャラクターや 部品が いっぱいで、もう ふやせないよ。いらない ものを けしてね');
        return;
      }
      const preset =
          type === 'sprite' ? appVars.STANDARD_SPRITES[spritePreset] || appVars.STANDARD_SPRITES.star : null,
        names = { label: '文字', button: 'ボタン', input: '入力らん', box: '四角' },
        nameBase = preset?.name || names[type];
      let n = 1,
        name = spritePreset === 'dango' ? nameBase : null;
      if (!name || appVars.project.components.some((c) => c.name === name)) {
        do {
          name = `${nameBase}${n++}`;
        } while (appVars.project.components.some((c) => c.name === name));
      }
      const id = appCalls.ensureUniqueId(type),
        imagePreset = preset?.kind === 'image',
        w =
          type === 'input' ? 160 : type === 'box' ? 120 : type === 'sprite' ? preset.w || 70 : 120,
        h = type === 'box' ? 80 : type === 'sprite' ? preset.h || 70 : 32,
        auto = x === null || y === null,
        place = auto
          ? newPartPlace(appVars.project.components, appVars.project.stage, w, h, { x: 80 + w / 2, y: appVars.project.stage.height - 80 - h / 2 })
          : { x: Math.round(x), y: Math.round(y) },
        base = {
          id,
          type,
          name,
          x: place.x,
          y: place.y,
          w,
          h,
          fg: type === 'sprite' ? preset.fg : '#111111',
          bg: type === 'sprite' ? null : type === 'box' ? '#f5f5f5' : '#ffffff',
          fontSize: type === 'sprite' ? 44 : 14,
          visible: true,
          direction: 0,
          scalePercent: 100,
          text:
            type === 'label'
              ? '文字'
              : type === 'button'
                ? 'ボタン'
                : type === 'sprite' && !imagePreset
                  ? preset.value
                  : '',
          localData: { variables: [], lists: [] },
        };
      if (type === 'sprite') {
        const co = appCalls.ensureUniqueId('costume');
        if (imagePreset) {
          const builtin = spritePreset === 'dango' ? dangoMascotAssetRecord() : defaultMascotAssetRecord(),
            store = new AssetStore(appVars.assetStore.snapshotRefs()),
            same = store.findByDigest(
              'image',
              builtin.sha256,
              builtin.byteLength,
              builtin.bytes,
            );
          let assetId = same?.id;
          if (!assetId) {
            assetId = store.has(builtin.id)
              ? appCalls.ensureUniqueId(spritePreset === 'dango' ? 'asset-dango-mascot' : 'asset-akari-mascot')
              : builtin.id;
            store.addImmutable(
              assetId === builtin.id
                ? builtin
                : makeImmutableAssetRecord({
                    id: assetId,
                    kind: builtin.kind,
                    mime: builtin.mime,
                    sha256: builtin.sha256,
                    bytes: builtin.bytes,
                    meta: { ...builtin.meta },
                  }),
            );
          }
          base.costumes = [{ id: co, name: preset.name, kind: 'image', assetId }];
          base.costumeId = co;
          try {
            validateAssetReferences({ ...appVars.project, components: [...appVars.project.components, base] }, store);
          } catch (error) {
            log(`${error.code || ''} キャラクターを おけません: ${error.message}`, 'error');
            setStatus('キャラクターを おけなかったよ');
            return;
          }
          appVars.assetStore = store;
        } else base.costumes = [{ id: co, name: preset.name, kind: 'text', value: preset.value }];
        base.costumeId = co;
      }
      appVars.project.components.push(base);
      appCalls.markDirty();
      selectObject(id);
      const placed = designBox(base);
      if (placed.right <= 0 || placed.left >= appVars.project.stage.width || placed.top <= 0 || placed.bottom >= appVars.project.stage.height)
        setStatus(`「${name}」は 画面の 外に あるよ。「せってい」の「よこのばしょ」・「たてのばしょ」で もどせるよ`);
      else if (auto) setStatus(`「${name}」を おいたよ。いま 動かすものは「${name}」だよ`);
    }
    function resumeFinishedRun() {
      appVars.runFinished = false;
      setStatus('動いているよ');
      updateRunState();
    }
    // A WeakSet has no size: whether a word is still being typed (IME) in either editor.
    function composingAny() { return appVars.composingEditors.has(appVars.el.editor) || appVars.composingEditors.has(appVars.draftEditor.textarea); }
    function dispatchRuntime(fn) {
      try {
        return fn();
      } catch (err) {
        if (appVars.scheduler) appVars.scheduler.pause();
        log(`${err.code || 'R411'} ${err.message}`, 'error');
        setStatus('動きが うまく いかなかったので、いったん 止めたよ');
      }
    }
    function startRun() {
      if (!tutorialAllows(appVars.tutorial,'run')) return;
      if (appCalls.modelLocked()) return;
      // A refused run always tells the child why nothing moved.
      // Every refusal is said the same way: まだ 動かせないよ。, the reason, and 。 at the end (FM2-13).
      const refuse = (reason) => setStatus('まだ 動かせないよ。' + appCalls.sentence(reason));
      if (!flushActiveEditor()) {
        refuse(sourceImportChoice() || appVars.editorFailureStatus || '書きかけの ところを 直してから「▶ 動かす」を おしてね。');
        return;
      }
      if(appVars.tutorial){
        const trial=tutorialStep(appVars.tutorial).id.slice(4),actor=appCalls.componentById(appVars.tutorial.target);
        appVars.tutorialTrace={epoch:appVars.tutorial.epoch,trial,x:actor.x,y:actor.y,requiredClicks:tutorialSequence(appVars.tutorial)[appVars.tutorial.index+1].clicks,
          statements:[],speech:[],observations:[],clicks:0,busy:false,sawTask:false,complete:false,failed:false};
      }
      appCalls.refreshEditor();
      if(hasPendingEditor()){log('書きかけの 入力を さいごまで 書いてから 動かして ください','error');refuse('書きかけの ところを 直してから「▶ 動かす」を おしてね。');return;}
      appCalls.dropHistoryTimer();
      appCalls.pushHistoryNow();
      if (appCalls.hasCallableDraft()) {
        log('自分で作ったブロックを なおして いる とちゅうです。ほぞんしてから 動かして ください', 'error');
        refuse('自分で作ったブロックの 画面を とじてから「▶ 動かす」を おしてね。');
        return;
      }
      if (!flushActiveEditor()) {
        refuse(sourceImportChoice() || appVars.editorFailureStatus || '書きかけの ところを 直してから「▶ 動かす」を おしてね。');
        return;
      }
      appVars.compiled = compileProject(appVars.project);
      if (appVars.compiled.errors.length) {
        showDiagnosis();
        log('作品に まちがいが あるので 動かしません。「作品チェック」を 見て 直して ください', 'error');
        refuse('作品に 直す ところが あるよ。' + appCalls.fixPointer(appVars.compiled.errors[0]));
        return;
      }
      // A work with no sentence in any body (notes do not count) does not run: the status says how to put one in, with
      // the controls of the view on the screen. A continuing rule (「…あいだ、…動き続ける。」) is a sentence too, even alone
      // in its body.
      const hasSentence = nodes => (nodes || []).some(node => node.kind !== 'CommentLine');
      if (!(appVars.compiled.items || []).some(item => !item.definitionKind &&
        (hasSentence(item.ast?.body) || hasSentence(item.ast?.rules) ||
          (item.ast?.units || []).some(unit => hasSentence(unit.body))))) {
        // A body that holds only a メモ has something on the screen, but nothing that moves (E2E-R2-14).
        const memo = (appVars.compiled.items || []).some(item => (item.ast?.body || []).length || (item.ast?.units || []).some(unit => unit.body?.length));
        setStatus(appCalls.shownEditorMode() === 'blocks'
          ? memo ? 'メモは 動かないよ。メモの ほかに、動く ブロックを 入れてね' : 'ブロックが まだ ないよ。「＋ ここに入れる」を おして、ブロックを 入れてね'
          : memo ? 'メモは 動かないよ。メモの ほかに、動く 文を 書いてね' : '本文が まだ ないよ。コードに 文を 書いてね');
        return;
      }
      try {
        validateAssetReferences(appVars.project, appVars.assetStore);
      } catch (err) {
        log(`${err.code || ''} 絵や音の チェック: ${err.message}`, 'error');
        refuse(document.body.dataset.uiLevel === 'entry' ? 'この 作品の 絵や音が たりないよ。' : '絵や音が たりないよ。「絵や音を まとめる」で たしかめてね。');
        return;
      }
      appVars.pen.clearRect(0, 0, appVars.el.canvas.width, appVars.el.canvas.height);
      let seed = 1;
      try {
        const a = new Uint32Array(1);
        crypto.getRandomValues(a);
        seed = a[0];
      } catch (_) {
        seed = Date.now() >>> 0;
      }
      const req = collectRuntimeAssetRequirements(appVars.compiled, appVars.project),
        token = ++appVars.generationToken;
      appCalls.$('#listRepairPanel')?.remove();
      appVars.runtimeCache = new AssetRuntimeCache(appVars.assetStore);
      try {
        if (req.needsAudio) appVars.runtimeCache.ensureAudioContext();
        appVars.appState = 'PREPARING';
        appVars.runFinished = false;
        appVars.runFailed = false;
        appVars.runHint = '';
        appVars.keptFail = null;
        setStatus('絵や音を じゅんびして いるよ');
        updateRunState();
        appVars.stageView.fitStage();
        // The run screen starts now; the focus goes to the stage, not to the page (▶ 動かす is not shown there).
        appVars.el.form.focus({ preventScroll: true });
        (async () => {
          try {
            await appVars.runtimeCache.prepare(appVars.project, req, token);
            if (token !== appVars.generationToken || appVars.appState !== 'PREPARING') return;
            appVars.runtime = new RuntimeModel(appVars.project, {}, appVars.runtimeCache);
            const br = appCalls.bridge();
            appVars.runtime.ui = br;
            appVars.runtimeCache.onAudioStateError = (err) => {
              log(`R415 ${err.message}`, 'error');
              setStatus('音を いったん 止めたり、また 鳴らしたり できなかったよ');
            };
            appVars.runtime.reset(seed);
            appVars.scheduler = new EventScheduler(appVars.project, appVars.compiled, appVars.runtime, br);
            appVars.stageView.seedHeldInput();
            appVars.appState = 'RUNNING';
            appCalls.confirmTutorialOperation('run');
            appVars.scheduler.start();
            appCalls.renderAll();
            // The seed is a くわしく fact (F-28).
            log(document.body.dataset.uiLevel === 'advanced' ? `動かしはじめました（たね=${seed}）` : '動かしはじめました', 'ok');
            setStatus('動いているよ');
            appVars.el.form.focus({ preventScroll: true });
          } catch (err) {
            if (token !== appVars.generationToken) return;
            disposeRuntime();
            appVars.appState = 'DESIGN';
            appCalls.renderAll();
            loadEditor();
            log(`${err.code || ''} 動かす じゅんびが できませんでした: ${err.message}`, 'error');
            setStatus('動かす じゅんびが できなかったよ。作品は のこって いるよ。「▶ 動かす」で もう一度 ためしてね');
          }
        })();
      } catch (err) {
        disposeRuntime();
        appVars.appState = 'DESIGN';
        updateRunState();
        log(`${err.code || ''} 動かす じゅんびが できませんでした: ${err.message}`, 'error');
        setStatus('動かす じゅんびが できなかったよ。作品は のこって いるよ。「▶ 動かす」で もう一度 ためしてね');
      }
    }
    // The words of the run: the same in the status line and on the right (動いているよ, いったん 止めたよ, おわったよ,
    // 止まって いるよ), and in 動きのようす. A run stopped at a mistake cannot go on: it says とちゅうで 止まったよ on the right
    // as the status line does (「動きが とちゅうで 止まったよ」), not いったん 止めたよ.
    function runStateText() {
      if (appVars.appState === 'PREPARING') return 'じゅんびして いるよ';
      if (appVars.appState === 'IMPORTING') return '読みこんで いるよ';
      if (appVars.runFinished) return 'おわったよ';
      if (appVars.scheduler?.running) return appVars.runFailed ? 'とちゅうで 止まったよ' : appVars.scheduler.paused ? 'いったん 止めたよ' : '動いているよ';
      return '止まって いるよ';
    }
    function updateRunState() {
      const running = !!appVars.scheduler?.running && !appVars.runFinished;
      if (running) appVars.appState = appVars.scheduler.paused ? 'PAUSED' : 'RUNNING';
      const words = runStateText(), before = appVars.el.runState.textContent;
      appVars.el.runState.textContent = words;
      if (words !== before && running) {
        if (words === 'いったん 止めたよ' && ['動いているよ', appVars.runHint].includes(appVars.el.status.textContent)) setStatus(appVars.PAUSED_STATUS);
        else if (words === '動いているよ' && appVars.el.status.textContent === appVars.PAUSED_STATUS) setStatus(appVars.runHint || '動いているよ');
      }
      appVars.el.runState.className = 'runstate ' + (running ? 'run-on' : 'run-off');
      // The run screen never shows a button that cannot be pressed (the exported player's rule too). ⏸ いったん止める and
      // ▶ つづける take turns in one place: ⏸ while the work runs, ▶ つづける while it is paused. 1つずつ 動かす and 本文を見て
      // たしかめる show while it runs or is paused. While getting ready, once the run has ended, and after a mistake
      // stopped it (nothing can go on past the failed sentence: ■ 止める only), a button that cannot be pressed is not
      // shown, but its place stays (data-inactive hides it), so the stage and the other buttons do not move.
      const focused = document.activeElement, failed = running && appVars.runFailed,
        inactive = {
          pauseBtn: !running || appVars.scheduler.paused || failed,
          continueBtn: !running || !appVars.scheduler.paused || failed,
          stepBtn: !running || failed,
          runtimeInspectBtn: !running,
        };
      for (const [id, off] of Object.entries(inactive)) {
        const button = appCalls.$('#' + id);
        button.disabled = off;
        button.dataset.inactive = String(off);
      }
      appCalls.$('#runtimeInspectBtn').hidden = !['PREPARING', 'RUNNING', 'PAUSED'].includes(appVars.appState);
      // A button that went away does not take the focus with it to the page: it goes to the stage (⏸ and ▶ つづける move
      // it on themselves).
      if (focused?.dataset?.inactive === 'true' && Object.hasOwn(inactive, focused.id)) appVars.el.form.focus({ preventScroll: true });
      appCalls.$('#runBtn').disabled = appVars.appState !== 'DESIGN';
      appCalls.$('#stopBtn').disabled = appVars.appState === 'DESIGN' || appVars.appState === 'IMPORTING';
      appCalls.updateEditingLock();
      if (running && !appVars.scheduler.paused) appCalls.requestRuntimePaint(2);
    }
    // The fix of a notice opens its body in the editor and changes it there, so undo and the editor follow it. A body
    // changed since the check is not touched.
    function applyNoteProposal(note, proposal) {
      if (appCalls.modelLocked() || !flushActiveEditor()) return;
      const item = compileProject(appVars.project).items.find(x => x.key === note.where),
        script = item && scriptBySourceKey(appVars.project, item.documentKey || item.key);
      if (!script || typeof script.source !== 'string' || script.source.slice(proposal.start, proposal.end) !== proposal.original) {
        setStatus('本文が かわったので、もう一度「作品チェック」を おしてね');
        return;
      }
      if (script.targetId !== appVars.selectedId && !selectObject(script.targetId)) return;
      appVars.currentEvent = script.event; appVars.selectedScriptId = script.id || null; loadEditor();
      const source = script.source.slice(0, proposal.start) + proposal.source + script.source.slice(proposal.end);
      try {
        appCalls.commitSource(appVars.mainEditor, source, { atomic: true });
        appCalls.renderEditorBinding(appVars.mainEditor); appCalls.refreshEditor();
        appCalls.$('#diagnosisModal').classList.remove('show');
        if (appCalls.shownEditorMode() === 'code') {
          appVars.el.editor.focus({ preventScroll: true });
          appVars.el.editor.setSelectionRange(proposal.start, proposal.start + proposal.source.length);
        } else appVars.mainEditor.view?.focus({ line: note.line });
        setStatus('直したよ');
      } catch (error) { appCalls.showEditorFailure(appVars.mainEditor, error); }
    }
    function showDiagnosis() {
      if (!flushActiveEditor()) return;
      const c = compileProject(appVars.project),
        body = appCalls.$('#diagnosisBody');
      body.textContent = '';
      const h = document.createElement('h2');
      h.textContent = c.errors.length
        ? `${c.errors.length}か所に まちがいが あります`
        : '✓ 作品は 動かせます';
      body.appendChild(h);
      if (!c.errors.length) {
        const p = document.createElement('div');
        p.className = 'diagnosis-ok';
        p.textContent = '書き方にも 中身にも まちがいは ありません。';
        body.appendChild(p);
      } else
        for (const d of c.errors) {
          const p = document.createElement('div');
          p.className = 'diagnosis-issue';
          appCalls.showDiagnosticMessage(p, d, appCalls.diagnosticLocation(d), null, appCalls.diagnosticSource(d), { listItem: true });
          body.appendChild(p);
        }
      // Notices do not stop anything; they say how a correct sentence will run.
      if (c.notes?.length) {
        const h3 = document.createElement('h3');
        h3.textContent = 'ⓘ 知らせ（動かすことは できます）';
        body.appendChild(h3);
        for (const d of c.notes) {
          const p = document.createElement('div');
          p.className = 'diagnosis-note';
          p.textContent = appCalls.diagnosticLocation(d) + '：' + appCalls.sentence(d.message);
          // A notice that names its fix offers it, as a code proposal does (the fix changes the body it is in).
          for (const proposal of d.proposals || []) {
            if (typeof proposal.source !== 'string') continue;
            const fix = document.createElement('button');
            fix.type = 'button'; fix.dataset.noteFix = ''; fix.textContent = proposal.label || proposal.source; fix.title = proposal.source;
            fix.onclick = () => applyNoteProposal(d, proposal);
            p.append(' ', fix);
          }
          body.appendChild(p);
        }
      }
      appCalls.$('#diagnosisModal').classList.add('show');
    }
    function exportProject() {
      if(appVars.tutorial)return;
      if (!flushActiveEditor()) {
        // A press that cannot make the file says why (the review waits, or the code has a mistake).
        const why = sourceImportChoice() || appVars.editorFailureStatus;
        if (why) setStatus('まだ ファイルに できないよ。' + why + (why.endsWith('。') ? '' : '。'));
        return;
      }
      appCalls.dropHistoryTimer();
      appCalls.pushHistoryNow();
      if(hasPendingEditor()){log('書きかけの 入力を さいごまで 書いてから、うごく作品を ファイルにしてね','error');return;}
      if (appCalls.modelLocked() || document.querySelector('.modal.show,.modal.open')) return;
      if (appCalls.hasCallableDraft()) {
        log('自分で作ったブロックを なおして いる とちゅうだよ。ほぞんしてから、うごく作品を ファイルにしてね', 'error');
        return;
      }
      const errors = compileProject(appVars.project).errors;
      if (errors.length) {
        showDiagnosis();
        log('作品の まちがいを 直してから、うごく作品を ファイルにしてね', 'error');
        return;
      }
      if (appVars.exportBusy) return;
      appCalls.$('#exportChoiceModal').classList.add('show');
    }
    function writePlayerFile(presentation, button) {
      let url = null;
      try {
        const html = generateStandaloneHtml(appVars.project, appVars.assetStore, { presentation }),
          blob = new Blob([html], { type: 'text/html;charset=utf-8' }),
          a = document.createElement('a');
        url = URL.createObjectURL(blob);
        a.href = url;
        a.download = safeDownloadName(appVars.project.name) + '.html';
        a.hidden = true;
        document.body.appendChild(a);
        try {
          a.click();
        } finally {
          a.remove();
        }
        log('うごく作品の ファイルを 作りはじめました', 'ok');
        setStatus(`「${appVars.project.name}」を うごく作品の ファイルに したよ`);
      } catch (e) {
        log((e.code || 'X600') + ' ' + e.message, 'error');
        setStatus('うごく作品を ファイルに できなかったよ');
      } finally {
        if (url) setTimeout(() => URL.revokeObjectURL(url), 60000);
        appCalls.$('#exportChoiceModal').classList.remove('show');
        appCalls.$('#exportControls').disabled = appCalls.$('#exportArtwork').disabled = false;
        button.disabled = appCalls.modelLocked();
        appVars.exportBusy = false;
      }
    }
    // Saves the work file; true when its download has started.
    function saveProject() {
      if (!tutorialAllows(appVars.tutorial,'save')) return false;
      if (appVars.appState === 'IMPORTING' || appVars.appState === 'PREPARING') return false;
      if(composingAny()){setStatus('日本語の 入力を 決めてから、ほぞんしてね');return false;}
      flushActiveEditor();
      try {
        const editorState=appCalls.captureEditorState(),unfinished=editorState.pendingEditors.length||editorState.callableDraft||compileProject(appVars.project).errors.length;
        const md = serializeProject(appVars.project, appVars.assetStore, editorState),
          blob = new Blob([md], { type: 'text/markdown;charset=utf-8' }),
          a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = safeDownloadName(appVars.project.name) + '.akari.md';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        if(appVars.tutorial){appVars.tutorialSave={epoch:appVars.tutorial.epoch,identity:appVars.workspaceIdentity,fingerprint:currentFingerprint(),verified:false};appCalls.confirmTutorialOperation('save');}
        appVars.lastSavedFingerprint = currentFingerprint();
        appVars.lastSavedEditorFingerprint = openEditorFingerprint();
        appVars.dirty = false;
        updateDirty();
        clearTimeout(appVars.autosaveTimer);
        writeAutosave();
        log(`${a.download} を ダウンロードしはじめました。このパソコンに のこした 作品も そのままです`, 'ok');
        setStatus(unfinished?'書きかけの ある 作品を ファイルに ほぞんしたよ。動かす 前に、まだ できて いない ところを たしかめてね':`「${appVars.project.name}」を ファイルに ほぞんしたよ`);
        return true;
      } catch (err) {
        log(`${err.code || ''} ほぞん できませんでした: ${err.message}`, 'error');
        setStatus('ファイルに ほぞん できなかったよ。作品は この 画面に のこって いるよ。もう一度「保存」を おしてね');
        return false;
      }
    }
    async function openProject(file, approval = null) {
      if (appVars.tutorial) return;
      if (appCalls.modelLocked()) return;
      const observed = currentOpenState();
      if (approval?.fingerprint !== observed.fingerprint && !(await askLose(observed))) return;
      if (appVars.tutorial || appCalls.modelLocked()) return;
      let previous = null;
      appCalls.dropHistoryTimer();
      clearTimeout(appVars.autosaveTimer);
      appVars.recoveryEpoch++;
      appVars.appState = 'IMPORTING';
      updateRunState();
      try {
        if (file.size > LIMITS.fileBytes)
          throw new AkariError('F504', 'ファイルが 大きすぎて 使えません。もっと 小さい ファイルに して ください', 0, 0, `開ける作品ファイルは${LIMITS.fileBytes / 1048576}MiBまで`);
        const text = await file.text();
        let loaded;
        try { loaded = await parseProjectFile(text); }
        catch (error) {
          // A newer release of the same extension may open the work; the person decides.
          const upgrades = error?.extensionUpgrades;
          if (!upgrades) throw error;
          if (!confirm('この 作品は、次の かくちょうの 前の バージョンで 作られて いるよ。\n' +
            upgrades.map(item => '・' + item.name + '　' + item.from + ' → ' + item.to).join('\n') +
            '\nいまの バージョンで 開く？　ほぞんすると、いまの バージョンで のこるよ。')) throw Object.assign(error, { declined: true });
          loaded = await parseProjectFile(text, { upgradeExtensions: true });
        }
        // Keep the current workspace until the loaded editor can also be restored.
        // Structural validation alone cannot guarantee that every UI restoration succeeds.
        previous = { current: snapshot(), history: appVars.history.slice(), redo: appVars.redo.slice(), initialSnapshot: appVars.initialSnapshot,
          lastSavedFingerprint: appVars.lastSavedFingerprint, lastSavedEditorFingerprint: appVars.lastSavedEditorFingerprint };
        closeEditingModals();
        appCalls.clearCallable();
        disposeRuntime();
        appCalls.revokeDesignUrls();
        appVars.project = loaded.project;
        appVars.workspaceIdentity++;
        appVars.assetStore = loaded.assetStore;
        appVars.editorSessions.clear();
        appCalls.invalidateEditors();
        appVars.selectedId = 'stage';
        appVars.currentEvent = 'start';
        appVars.selectedScriptId = null;
        appVars.appState = 'DESIGN';
        hideSourceOverview();
        appCalls.renderAll();
        loadEditor();
        resetHistory();
        if(loaded.editorState){appCalls.restoreEditorState(loaded.editorState);appVars.initialSnapshot=snapshot();appVars.history=[appVars.initialSnapshot];appVars.redo=[];appVars.lastObservedFingerprint=stateFingerprintCore();}
        appVars.lastSavedEditorFingerprint = openEditorFingerprint();
        appVars.appState = 'IMPORTING';
        updateRunState();
        await clearAutosave();
        previous = null;
        const diagnostics = loaded.diagnostics || [];
        log(
          diagnostics.length
            ? `作品を開きました。コードの ${diagnostics.length}か所に まちがいが あります。`
            : '作品を開きました',
          diagnostics.length ? 'error' : 'ok',
        );
        // Opening always gives an answer on the screen: the work's name, and how many places need fixing.
        setStatus(`「${appVars.project.name}」を 開いたよ` + (diagnostics.length ? `。直す ところが ${diagnostics.length}か所 あるよ` : ''));
      } catch (err) {
        if (previous) {
          appVars.history = previous.history;
          appVars.redo = previous.redo;
          appVars.initialSnapshot = previous.initialSnapshot;
          appVars.lastSavedFingerprint = previous.lastSavedFingerprint;
          appVars.lastSavedEditorFingerprint = previous.lastSavedEditorFingerprint;
          restoreSnap(previous.current, { restoreView: true });
        }
        log(`${err.code || ''} 読みこめませんでした: ${err.message}`, 'error');
        // The person chose not to open it with the newer extension: nothing to explain.
        if (!err?.declined) appCalls.showOpenRefusal(err);
      } finally {
        appVars.appState = 'DESIGN';
        appCalls.renderAll();
        if (appVars.dirty || appCalls.hasCallableDraft() || hasPendingEditor()) scheduleAutosave();
      }
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

    function writeAutosave() {
      if (composingAny() || appVars.activeDragCleanup || appVars.colorEdit) {
        scheduleAutosave();
        return Promise.resolve(false);
      }
      if (!hasPendingEditor()) flushActiveEditor();
      let rec, fingerprint;
      try {
        fingerprint = stateFingerprintCore();
        const current=snapshot(),past=appVars.history.slice(-Math.max(1, Math.floor(LIMITS.historyEntries / 2)));
        if(past.at(-1)?.stateFingerprint===current.stateFingerprint)past[past.length-1]=current;
        else{past.push(current);if(past.length>Math.max(1, Math.floor(LIMITS.historyEntries / 2)))past.shift();}
        const future=appVars.history.at(-1)?.stateFingerprint===current.stateFingerprint?appVars.redo.slice(-Math.max(1, Math.floor(LIMITS.historyEntries / 2))).reverse():[];
        const workspace=encodeWorkspaceHistory([...past,...future],past.length-1);
        appVars.autosaveRevisionTime=Math.max(Date.now(),appVars.autosaveRevisionTime+1);
        rec={id:'latest',version:2,updatedAt:appVars.autosaveRevisionTime,revision:appVars.recoveryEpoch,workspace,lastSavedFingerprint: appVars.lastSavedFingerprint,
          lastSavedEditorFingerprint:validateSavedEditorFingerprint(appVars.lastSavedEditorFingerprint)};
      } catch (e) {
        appVars.el.autosave.textContent = 'このパソコンに のこせなかったよ（「ほぞん」で ファイルに しよう）';
        log(e.message, 'error');
        return Promise.resolve(false);
      }
      const status = (text) => {
        if (
          appVars.recoveryEpoch === rec.revision && stateFingerprintCore() === fingerprint
        )
          appVars.el.autosave.textContent = text;
      };
      const fallback = () => {
        if (rec.workspace.assets.some(a=>!a.builtin)) {
          status(
            'このパソコンには のこせないよ（絵や音の 入った 作品は「ほぞん」で ファイルに しよう）',
          );
          return false;
        }
        try {
          const txt = JSON.stringify(rec);
          localStorage.setItem(STORAGE_KEYS.fallback, txt);
          status('このパソコンに のこしたよ');
          return true;
        } catch (_) {
          status('このパソコンに のこせなかったよ（「ほぞん」で ファイルに しよう）');
          return false;
        }
      };
      return (appVars.autosaveQueue = appVars.autosaveQueue
        .catch(() => {})
        .then(async () => {
          let db;
          try {
            db = await openAutosaveDB();
          } catch (_) {
            return fallback();
          }
          try {
            await autosaveTransaction(db, (store) => store.put(rec));
            try {
              localStorage.removeItem(STORAGE_KEYS.fallback);
            } catch (_) {}
            status('このパソコンに のこしたよ');
            return true;
          } catch (_) {
            return fallback();
          } finally {
            try {
              db.close();
            } catch (_) {}
          }
        }));
    }
    function scheduleAutosave() {
      if(appVars.restoringSnapshot)return;
      clearTimeout(appVars.autosaveTimer);
      appVars.recoveryEpoch++;
      if(!appCalls.modelLocked())updateDirty();
      appVars.el.autosave.textContent = 'このパソコンには まだ のこして いないよ';
      appVars.autosaveTimer = setTimeout(writeAutosave, 1200);
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

    function clearAutosave() {
      clearTimeout(appVars.autosaveTimer);
      const epoch = ++appVars.recoveryEpoch;
      return (appVars.autosaveQueue = appVars.autosaveQueue
        .catch(() => {})
        .then(async () => {
          let db,
            ok = true;
          try {
            db = await openAutosaveDB();
            await autosaveTransaction(db, (store) => store.delete('latest'));
          } catch (_) {
            ok = false;
          } finally {
            try {
              db?.close();
            } catch (_) {}
          }
          try {
            localStorage.removeItem(STORAGE_KEYS.fallback);
          } catch (_) {
            ok = false;
          }
          if (epoch === appVars.recoveryEpoch)
            appVars.el.autosave.textContent = ok
              ? 'このパソコンには まだ のこして いないよ'
              : 'このパソコンに のこした 作品を けせたか、たしかめられなかったよ';
          return ok;
        }));
    }
    async function checkRecovery() {
      const epoch = appVars.recoveryEpoch;
      try {
        const rec = await readAutosave();
        if (
          !rec ||
          epoch !== appVars.recoveryEpoch ||
          appVars.dirty ||
          appCalls.hasCallableDraft() ||
          hasPendingEditor() ||
          appCalls.modelLocked()
        )
          return;
        if(!exactKeys(rec,['id','version','updatedAt','revision','workspace','lastSavedFingerprint','lastSavedEditorFingerprint'])||
          rec.id!=='latest'||rec.version!==2||!Number.isFinite(rec.updatedAt)||
          !Number.isSafeInteger(rec.revision)||rec.revision<0||typeof rec.lastSavedFingerprint!=='string')
          throw new AkariError('F503','このパソコンに のこした 作品の 形が 正しく ありません');
        validateSavedEditorFingerprint(rec.lastSavedEditorFingerprint);
        const restored=await decodeWorkspaceHistory(rec.workspace);
        if(epoch!==appVars.recoveryEpoch||appVars.dirty||appCalls.hasCallableDraft()||hasPendingEditor()||appCalls.modelLocked())return;
        appVars.recoveryData={...rec,restored};
        // The work is named (F-02), and the autosave is called このパソコンに のこす (F-23).
        const keptName=restored.frames?.[restored.cursor]?.project?.name;
        appCalls.$('#recoveryText').textContent=`${new Date(rec.updatedAt).toLocaleString()}に、${keptName?'「'+keptName+'」を ':''}とちゅうまで このパソコンに のこして あるよ。つづきから 作る？ けすと、もう もどせないよ。`;
        // The safe choice comes first and has the focus: つづきから 作る keeps the work, のこした 作品を けす cannot be undone.
        setStatus('このパソコンに のこした 作品が あるよ');
        appCalls.$('#recoveryModal').classList.add('show');
        appCalls.$('#recoveryRestore').focus({preventScroll:true});
      } catch (err) {
        if (
          epoch === appVars.recoveryEpoch &&
          !appVars.dirty &&
          !appCalls.hasCallableDraft() &&
          !hasPendingEditor() &&
          !appCalls.modelLocked()
        ) {
          appVars.el.autosave.textContent =
            'このパソコンに のこした 作品を もどせるか、たしかめられなかったよ（のこした 作品は そのままだよ）';
          log(
            `このパソコンに のこした 作品を たしかめられませんでした。のこした 作品は けして いません。 ${err.code || ''} ${err.message}`,
            'error',
          );
        }
      }
    }
    async function previewSound(snd) {
      if (appCalls.modelLocked()) return;
      stopPreview();
      const a = appVars.assetStore.get(snd.assetId);
      if (!a) return;
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) {
        log('R415 このブラウザでは 音を 鳴らせません', 'error');
        return;
      }
      let ac = null;
      try {
        ac = new AC();
        appVars.previewAudio = { context: ac, source: null };
        await ac.resume?.();
        if (appVars.previewAudio?.context !== ac) return;
        const bytes = a.bytes,
          copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          buf = await ac.decodeAudioData(copy);
        if (appVars.previewAudio?.context !== ac) return;
        const source = ac.createBufferSource();
        source.buffer = buf;
        source.connect(ac.destination);
        appVars.previewAudio.source = source;
        source.onended = () => {
          if (appVars.previewAudio?.source === source) stopPreview();
        };
        source.start();
      } catch (e) {
        if (!ac || appVars.previewAudio?.context === ac) {
          stopPreview();
          log(`R415 音を ためしに 鳴らせませんでした: ${e.message || e}`, 'error');
        }
      } finally {
        if (ac && appVars.previewAudio?.context !== ac)
          try {
            await ac.close();
          } catch (_) {}
      }
    }
    async function runAssetImport(label, work, onError) {
      if (appCalls.modelLocked()) return;
      if (!flushActiveEditor()) return;
      appCalls.dropHistoryTimer();
      appCalls.pushHistoryNow();
      appVars.recoveryEpoch++;
      appVars.appState = 'IMPORTING';
      setAssetProgress(`${label}を たしかめて います…`);
      updateRunState();
      appCalls.renderAppearance();
      try {
        await work();
        return true;
      } catch (e) {
        log(`${e.code || ''} ${label}を 入れられませんでした: ${e.message}`, 'error');
        setStatus(`${label}を 入れられなかったよ`);
        onError?.(e);
        return false;
      } finally {
        if (appVars.appState === 'IMPORTING') {
          appVars.appState = 'DESIGN';
          setAssetProgress('');
          updateRunState();
          appCalls.renderAppearance();
        }
      }
    }
    function replaceCurrentProject(nextProject,nextAssets,targetId,event,status) {
      if(appVars.tutorial)return;
      // Discard view-local transactions only after the user confirms replacement.
      appVars.mainEditor.view.cancel();
      appVars.draftEditor.view.cancel();
      appVars.headerPending=null;
      for(const control of [appVars.mainEditor.textarea,appVars.draftEditor.textarea,appCalls.$('#callableName'),appCalls.$('#callableArgs'),appCalls.$('#callablePhrase')])appVars.composingEditors.delete(control);
      appCalls.dropHistoryTimer();
      clearTimeout(appVars.autosaveTimer);
      appVars.recoveryEpoch++;
      appVars.activeDragCleanup?.();
      closeEditingModals();
      appCalls.clearCallable();
      disposeRuntime();
      appCalls.revokeDesignUrls();
      appVars.project=nextProject;
      appVars.workspaceIdentity++;
      appVars.assetStore=nextAssets;
      appVars.editorSessions.clear();
      appCalls.invalidateEditors();
      appVars.selectedId=targetId;
      appVars.currentEvent=event;
      appVars.selectedScriptId=null;
      appVars.appState='DESIGN';
      hideSourceOverview();
      appCalls.renderAll();
      loadEditor();
      resetHistory();
      clearAutosave();
      setStatus(status);
    }
    function fillSamplePicture(picture, id) {
      picture.innerHTML = (SAMPLE_ART[id] || '').replaceAll('href="data:image/png;base64,', 'data-sample-image="');
      for (const image of picture.querySelectorAll('image[data-sample-image]')) {
        const encoded = image.getAttribute('data-sample-image');
        if (!appVars.samplePreviewUrls.has(encoded)) {
          const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
          appVars.samplePreviewUrls.set(encoded, URL.createObjectURL(new Blob([bytes], {type:'image/png'})));
        }
        image.removeAttribute('data-sample-image');
        image.setAttribute('href', appVars.samplePreviewUrls.get(encoded));
      }
    }
    function showSamplePicker() {
      if (!appVars.openRequest || appVars.openRequest.kind !== 'sample' || appCalls.modelLocked()) return;
      const grid = appCalls.$('#sampleGrid');
      grid.replaceChildren(...sampleCatalog().map(sample => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'sample-card'; button.dataset.sampleId = sample.id;
        const picture = document.createElement('span'); picture.className = 'sample-picture'; picture.setAttribute('aria-hidden','true');
        fillSamplePicture(picture, sample.id);
        const copy = document.createElement('span'); copy.className = 'sample-card-copy';
        const title = document.createElement('span'); title.className = 'sample-card-title'; title.textContent = sample.title;
        const description = document.createElement('span'); description.className = 'sample-card-description'; description.textContent = sample.description;
        copy.append(title,description); button.append(picture,copy);
        button.addEventListener('click', () => openSampleProject(sample.id));
        return button;
      }));
      appCalls.$('#samplePicker').showModal();
    }
    function requestSampleProject() {
      if(appVars.tutorial)return;
      if (appCalls.modelLocked() || appVars.openRequest || document.querySelector('.modal.show:not(#procModal),.modal.open,dialog[open]')) return;
      confirmOpenRequest('sample');
    }
    function openSampleProject(id) {
      if (appCalls.modelLocked() || appVars.openRequest?.kind !== 'sample' || appVars.openRequest.phase !== 'selection') return;
      const approval = appVars.openRequest;
      // A stale approval cannot discard edits made after the picker was opened.
      const observed = currentOpenState();
      if (observed.fingerprint !== approval.fingerprint && observed.unsaved) {
        appCalls.$('#samplePicker').close(); appVars.openRequest=null; requestSampleProject(); return;
      }
      try {
        const sample = sampleCatalog().find(row=>row.id===id);
        if (!sample) throw new AkariError('F512','お手本が 見つかりません');
        const nextProject = makeSampleProject(id), nextAssets = makeSampleAssetStore(id);
        appVars.openRequest=null; appCalls.$('#samplePicker').close();
        replaceCurrentProject(nextProject,nextAssets,sample.targetId,sample.event,`「${sample.title}」を 開いたよ。動かして みよう！`);
      } catch(error) { log('お手本を 開けませんでした: '+error.message,'error'); setStatus('お手本を 開けなかったよ'); }
    }
    Object.assign(appCalls, {addComponent, applyNoteProposal, askLose, beginTutorial, checkRecovery, clearAutosave, closeEditingModals, composingAny, currentFingerprint, designBox, dispatchRuntime, disposeRuntime, eventsFor, exportProject, finishOpenSelection, flushActiveEditor, hasPendingEditor, hideSourceOverview, loadEditor, log, meijinScripts, newPartPlace, openEditorFingerprint, openMeijinProcedure, openProject, previewSound, redoDo, renderTree, replaceCurrentProject, requestOpenProject, requestSampleProject, resetHistory, restoreSnap, resumeFinishedRun, runAssetImport, saveProject, scheduleAutosave, selectCurrentScript, selectEntryEvent, selectObject, setAssetProgress, setStatus, showDiagnosis, snapshot, sourceImportChoice, startRun, stateFingerprintCore, stopPreview, targetType, tutorialChoose, tutorialRefresh, undo, updateDirty, updateRunState, verifyTutorialSave, writePlayerFile});
  }
