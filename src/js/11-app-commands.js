  // ────────────────────────────────────────────────────────────────────────
  // 11 — Application commands, the operations no other operation uses: they start from what the child does. Running,
  // saving, opening and exporting, undo and redo, dragging and resizing, part properties, block operations, importing
  // assets, choosing in the tutorial, and saving and deleting custom blocks.
  // ────────────────────────────────────────────────────────────────────────
  // The application files come in this order in src/akari.html: a file uses only the files before it and asks the files
  // after it only for a redraw (AUDIT.md「ソースの境界」). Called once at the start of initApp: appVars is the state
  // it shares, appCalls the functions it offers the files after it and those it calls from the files before it,
  // appRedraw the redraw slots it calls (the drawing fills them).
  function createAppCommands(appVars, appCalls, appRedraw) {
    function selectEntryEvent(event) {
      if (!tutorialAllows(appVars.tutorial,'event:'+event)||appCalls.modelLocked()||!appCalls.eventsFor(appVars.selectedId).includes(event)||!appCalls.flushActiveEditor()) return;
      appCalls.captureEditorView(appVars.mainEditor);appCalls.hideSourceOverview();appVars.currentEvent=event;
      appVars.selectedScriptId=appVars.project.scripts.find(s=>s.targetId===appVars.selectedId&&s.event===event)?.id||null;
      appCalls.loadEditor();if(!appCalls.modelLocked())appCalls.pushHistoryNow();appCalls.confirmTutorialOperation('event:'+event);appCalls.tutorialRefresh();
    }
    function selectTutorialInsertion(location) {
      const step=tutorialStep(appVars.tutorial),expected=step?.block&&tutorialDestination(appVars.mainEditor.session?.blockView,step);
      if(!expected||location.parentId!==expected.parentId||location.body!==expected.body||location.index!==expected.index)return;
      appVars.tutorialInsertion={...location,step:step.id,epoch:appVars.tutorial.epoch};
      appRedraw.tutorialPresentation();appCalls.focusTutorialTarget();
    }
    function tutorialChoose(key) {
      const step=tutorialStep(appVars.tutorial);if(!step||step.action!=='choice'||appCalls.modelLocked()||!appCalls.flushActiveEditor())return;
      let extra;
      if(key==='finish')extra=[tutorialDefine({id:'save-work',action:'save',message:'「保存」を おして、作った 作品を ファイルに ほぞんしよう。'}),
        tutorialDefine({id:'verify-save',action:'verify-save',message:'「ほぞんした 作品を たしかめる」を おして、いま ほぞんした ファイルを えらぼう。'})];
      else if(step.choice==='course'){
        const course=TUTORIAL_COURSES.find(c=>c.id===key);if(!course||appVars.tutorial.courses.includes(key))return;
        appVars.tutorial.courses.push(key);extra=tutorialCourseSteps(key,appCalls.tutorialBody().length,key);
      }else{
        const course=TUTORIAL_COURSES.find(c=>c.id===step.course),leaf=course?.children.find(c=>c.id===key);if(!leaf)return;
        appVars.tutorial.leaves.push(key);extra=tutorialExtensionSteps(step.course,key,appCalls.tutorialBody().length,step.course+'-'+key);
      }
      appVars.tutorial.steps=[...appVars.tutorial.steps.slice(0,appVars.tutorial.index+1),...extra];appVars.tutorial.index++;appVars.tutorial.confirmedStep=null;appVars.tutorialTrace=null;
      appVars.tutorialExpected=tutorialExpectedTrees(makeTutorialProject(),appVars.tutorial.steps,appVars.tutorial.values);
      appVars.mainEditor.view.render({force:true});appCalls.tutorialRefresh();appCalls.focusTutorialTarget();
    }
    async function beginTutorial() {
      const blocked=()=>appVars.tutorial||document.body.dataset.uiLevel!=='entry'||appCalls.modelLocked()||document.querySelector('.modal.show,.modal.open,dialog[open]');
      if (blocked()) return;
      if (appVars.pausedTutorial&&appVars.pausedTutorial.identity===appVars.workspaceIdentity&&appVars.pausedTutorial.fingerprint===appCalls.currentFingerprint()
        &&appVars.pausedTutorial.editorFingerprint===appCalls.openEditorFingerprint()&&appVars.selectedId===appVars.pausedTutorial.target&&appVars.currentEvent==='click') {
        appVars.tutorial={...appVars.pausedTutorial,confirmedStep:null,epoch:++appVars.tutorialEpoch,phase:'waiting'};appVars.pausedTutorial=null;
        appVars.tutorialTrace=appVars.tutorial.trace?{...appVars.tutorial.trace,epoch:appVars.tutorial.epoch}:null;
        appVars.tutorialSave=null;
        if(tutorialStep(appVars.tutorial)?.id==='verify-save')appVars.tutorial.index=tutorialSequence(appVars.tutorial).findIndex(s=>s.id==='save-work');
      } else {
        if(!(await appCalls.askLose())||blocked())return;
        const practice=makeTutorialProject(),store=makeDefaultAssetStore();for(const asset of tutorialAssetRecords())store.addImmutable(asset);
        appVars.tutorialExpected=tutorialExpectedTrees(practice);
        appCalls.replaceCurrentProject(practice,store,'sprite-1','start','「さかなキャッチ」を いっしょに 作ろう');
        appVars.tutorial={epoch:++appVars.tutorialEpoch,index:0,phase:'waiting',identity:appVars.workspaceIdentity,target:'sprite-1',steps:[...TUTORIAL_STEPS],courses:[],leaves:[],values:{}};
        appVars.pausedTutorial=null;appVars.tutorialSave=null;appVars.tutorialTrace=null;
        if(appVars.mainEditor.session?.mode!=='blocks')appCalls.switchEditorMode(appVars.mainEditor,'blocks');
      }
      if(appVars.mainEditor.session?.mode!=='blocks')appCalls.switchEditorMode(appVars.mainEditor,'blocks');
      appVars.tutorialInsertion=null;appVars.mainEditor.view.render({force:true});appCalls.tutorialRefresh();appCalls.focusTutorialTarget();clearInterval(appVars.tutorialTimer);appVars.tutorialTimer=setInterval(appCalls.tutorialRefresh,80);
    }
    async function verifyTutorialSave(file) {
      if (!appVars.tutorial||!tutorialAllows(appVars.tutorial,'verify-save')||!appVars.tutorialSave||!file) return;
      const epoch=appVars.tutorial.epoch,save=appVars.tutorialSave,identity=appVars.workspaceIdentity;
      try {
        if(file.size>LIMITS.fileBytes)throw Object.assign(new Error('ファイルが 大きすぎるよ'),{child:true});
        const loaded=await parseProjectFile(await file.text());
        if(!appVars.tutorial||appVars.tutorial.epoch!==epoch||appVars.workspaceIdentity!==identity||appVars.tutorialSave!==save)return;
        if(appCalls.currentFingerprint()!==save.fingerprint){appVars.tutorialSave=null;appVars.tutorial.index=tutorialSequence(appVars.tutorial).findIndex(s=>s.id==='save-work');appCalls.tutorialRefresh();return;}
        if(assetStateFingerprint(loaded.project,loaded.assetStore)!==save.fingerprint||loaded.editorState?.pendingEditors.length||loaded.editorState?.callableDraft)
          throw Object.assign(new Error('いま ほぞんした 作品と 中身が ちがうよ'),{child:true});
        save.verified=true;appCalls.confirmTutorialOperation('verify-save');appCalls.tutorialRefresh();
      } catch(error) { if(appVars.tutorial?.epoch===epoch) { appVars.tutorialNotice={step:tutorialStep(appVars.tutorial)?.id,text:'たしかめられなかったよ。いま ほぞんした ファイルを、もう一度 えらぼう。'};appCalls.tutorialRefresh();appCalls.log('ほぞんした ファイルを たしかめられませんでした: '+error.message,'error');appCalls.setStatus('ほぞんを たしかめられなかったよ。'+(error.child?error.message:'あかりで ほぞんした ファイルでは ないよ')); } }
    }
    function tutorialCapture(event) {
      if(!appVars.tutorial)return;
      if(event.type==='keyup')return;
      const target=event.target,step=tutorialStep(appVars.tutorial);
      if(event.type==='keydown'){
        // Browser and OS navigation belong to the browser, never to a lesson.
        if(['F1','F3','F5','F6','F11','F12'].includes(event.key)
          ||event.altKey&&['ArrowLeft','ArrowRight','Home'].includes(event.key)
          ||((event.ctrlKey||event.metaKey)&&['r','l','w','t','n','f','p','d','h','j','u','o','tab','+','-','0'].includes(event.key.toLowerCase())))return;
        if(event.key==='Tab'){
          const targets=appCalls.tutorialFocusTargets(),at=targets.indexOf(document.activeElement);
          event.preventDefault();event.stopImmediatePropagation();targets[(at+(event.shiftKey?-1:1)+targets.length)%targets.length]?.focus();return;
        }
        if((event.ctrlKey||event.metaKey)&&!['a','c','v','x','arrowleft','arrowright','home','end'].includes(event.key.toLowerCase())){
          const action=event.key.toLowerCase()==='s'?'save':event.key.toLowerCase()==='z'?'undo':'shortcut';
          if(!tutorialAllows(appVars.tutorial,action)||event.shiftKey){event.preventDefault();event.stopImmediatePropagation();return;}
        }
        if(event.repeat&&target instanceof Element&&target.matches('button,summary')){event.preventDefault();event.stopImmediatePropagation();return;}
        if(!(event.ctrlKey||event.metaKey)&&target instanceof Element&&!target.matches('input,textarea,select')
          &&!['Enter',' ','Escape'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();return;}
      }
      if(event.type==='focusin') { if(!appCalls.tutorialElementAllowed(target))appCalls.focusTutorialTarget();return; }
      let allowed=appCalls.tutorialElementAllowed(target);
      if(['dragstart','dragover','drop','contextmenu'].includes(event.type))allowed=false;
      if(['pointerdown','touchstart'].includes(event.type)&&target instanceof Element&&target.matches('.blockui-workspace,.blockui-palette-list'))allowed=true;
      if(allowed&&event.type==='click'&&step?.allowed[0]==='runtime:click'&&target.closest('.component')&&appVars.tutorialTrace?.busy)allowed=false;
      if(allowed&&event.type==='pointerdown'&&target.closest('#tutorialExit'))event.preventDefault();
      if(allowed&&step?.allowed[0].startsWith('field:')&&(
        event.type==='keydown'&&event.key==='Enter'&&!event.isComposing&&!appCalls.composingAny()
        ||event.type==='change'&&target instanceof HTMLSelectElement
        ||event.type==='click'&&target.closest('[data-blockui-action="commit"]'))){
        // A confirmed unchanged value is still an explicit learning operation.
        // Observe after the normal field handler; invalid/pending input cannot count.
        const epoch=appVars.tutorial.epoch,id=step.id;
        setTimeout(()=>{if(appVars.tutorial?.epoch===epoch&&tutorialStep(appVars.tutorial)?.id===id
          &&(!appVars.mainEditor.session?.pendingEdit||appVars.mainEditor.session.pendingEdit.kind==='block-draft')&&!appCalls.composingAny()){appCalls.confirmTutorialOperation(step.allowed[0]);appCalls.tutorialRefresh();}},0);
      }
      if(!allowed){
        event.preventDefault();event.stopImmediatePropagation();
        if(target===appVars.el.obj||target===appVars.el.event)appRedraw.selectors();
        else if(target===appCalls.$('#uiLevel'))target.value=document.body.dataset.uiLevel;
        else if(target===appVars.el.projectName)target.value=appVars.project.name;
      }
    }
    function operateBlock(binding, operation) {
      try {
        if (!appCalls.tutorialOperationAllowed(binding, operation)) {
          const step=tutorialStep(appVars.tutorial),role=step?.ref?tutorialField(appVars.mainEditor.session?.blockView,step):null;
          if(binding===appVars.mainEditor&&step?.free&&operation.type==='field'&&operation.id===role?.node?.id&&operation.key===role.key)
            throw new Error('光る 数は '+step.min+'から'+step.max+'の 中で えらぼう。'+(step.integer?step.min+'、'+(step.min+1)+'のように、1ずつ ふえる 数に しよう。':''));
          throw new Error('今は、あんないの ブロックだけを 使おう。');
        }
        if (appCalls.modelLocked()) throw new Error('動いている あいだと 取りこみ中は なおせません');
        if (
          binding.kind === 'draft' &&
          (appVars.headerPending ||
            appVars.composingEditors.has(appCalls.$('#callableName')) ||
            (appVars.composingEditors.has(appCalls.$('#callableArgs')) || appVars.composingEditors.has(appCalls.$('#callablePhrase'))))
        )
          throw new Error('自分で作ったブロックの 名前と 入れるものの 入力を、決めるか やめて ください');
        const session = appCalls.getEditorSession(binding),
          ownerKey = appCalls.bindingOwner(binding),
          context = appCalls.bindingContext(binding);
        const pendingNode=session.pendingEdit?.id&&buildBlockIndex(session.blockView).get(session.pendingEdit.id),
          signedReplacement=operation.type==='replace'&&pendingNode?.node.schemaId==='NumberLiteral'&&
            pendingNode.parentId===operation.id&&pendingNode.input==='value'&&
            buildBlockIndex(session.blockView).get(operation.id)?.node.schemaId==='UnaryExpression:NEG';
        const pendingEditId =
          session.pendingEdit && (operation.id === session.pendingEdit.id || signedReplacement)
            ? session.pendingEdit.id
            : undefined;
        if(binding===appVars.mainEditor&&operation.preserveBody&&operation.type==='field'&&operation.key==='heading'&&
          operation.id===session.blockView?.id&&!session.syntaxAst.heading&&!session.syntaxAst.units?.length&&
          operation.value?.actorRef?.kind==='self'&&!session.blockDraft){
          const next=cloneDesignProject(appVars.project),row=scriptBySourceKey(next,ownerKey),heading=operation.value;
          if(row){
            const metadata=scriptMetadataFromHeading(heading,row,next);
            if(JSON.stringify([row.event,row.filter||null])===JSON.stringify([metadata.event,metadata.filter||null]))return {ok:true,changed:false};
            if(!row.id)row.id=appCalls.ensureUniqueId('script');
            Object.assign(row,metadata);if(metadata.filter===undefined)delete row.filter;
            validateDesignProject(next);appCalls.dropHistoryTimer();
            if(!appCalls.hasPendingEditor())appCalls.pushHistoryNow();
            appVars.project=next;appVars.currentEvent=row.event;appVars.selectedScriptId=row.id;
            appCalls.invalidateEditors();appCalls.getEditorSession(binding,{force:true});binding.session.pendingEdit=null;
            appCalls.clearEditorFailure(binding);appCalls.markDirty();appCalls.dropHistoryTimer();appCalls.pushHistoryNow();
            appRedraw.selectors();appRedraw.editorBinding(binding);appRedraw.editor();
            return {ok:true,changed:true};
          }
        }
        const candidate = prepareBlockEdit(session, operation, {
          project: appVars.project,
          context,
          ownerKey,
          locked: appCalls.modelLocked(),
          sourceRevision: session.pendingEdit?.sourceRevision ?? session.sourceRevision,
          contextRevision: session.pendingEdit?.contextRevision ?? appVars.editorContextRevision,
          pendingEditId,
          draft: true,
          validateCandidate: (source) =>
            appCalls.sourceCandidate(
              binding,
              ownerKey,
              typeof source === 'string' ? source : source.source,
            ),
        });
        if (!candidate.changed) {appCalls.confirmTutorialOperation();return { ok: true, changed: false };}
        if (candidate.draftOnly) {
          binding.session = { ...session, ...candidate, mode: session.mode };
          appVars.editorSessions.set(`${binding.kind}:${ownerKey}`, binding.session);
          binding.textarea.value = candidate.draftSource;
          const pending = appCalls.$(binding.kind === 'draft' ? '#callablePending' : '#editorPending');
          pending.textContent = 'あいている ところに ブロックや 数・文字を 入れて ください';
          // In blocks the floating controls say this by the block (E-12); the code view shows it here.
          pending.dataset.notice = 'block-draft';
          pending.hidden = false;
          appRedraw.editorBinding(binding);
          // The status line says what the floating prompt says, not what was true before the block went in (F2-18).
          appCalls.setStatus(binding.session.pendingEdit?.reason || 'あいている ところを えらんで、ブロックを 入れてね');
          appCalls.scheduleAutosave();
          appCalls.confirmTutorialOperation();
          return { ok: true, changed: true, draftOnly: true };
        }
        const source = candidate.source ?? candidate.sourceText;
        appCalls.commitSource(binding, source, { atomic: true });
        binding.textarea.value = source;
        const committedOwner=appCalls.bindingOwner(binding);
        binding.session = refreshEditorSession({
          ...session,
          ...candidate,
          ownerKey:committedOwner,
          mode: session.mode,
          pendingEdit: null,
        },source,appCalls.bindingContext(binding),appVars.project,appVars.editorContextRevision);
        if(committedOwner!==ownerKey)appVars.editorSessions.delete(`${binding.kind}:${ownerKey}`);
        appVars.editorSessions.set(`${binding.kind}:${committedOwner}`, binding.session);
        appRedraw.editorBinding(binding);
        appRedraw.editor();
        appCalls.confirmTutorialOperation();
        return { ok: true, changed: true,
          ...(committedOwner!==ownerKey?{ownerTransition:{from:ownerKey,to:committedOwner}}:{}) };
      } catch (error) {
        appCalls.showEditorFailure(binding, error);
        appCalls.keepTutorialTargetInView();
        return { ok: false, error, reason: error.message };
      }
    }
    function renameMeijinProcedure() {
      if (appCalls.modelLocked() || !appVars.meijinProcedureId) return;
      try {
        const next = prepareMeijinProcedureRename(appVars.project, appVars.meijinProcedureId, appCalls.$('#meijinProcName').value);
        appCalls.dropHistoryTimer(); appCalls.pushHistoryNow();
        appVars.project = next;
        appCalls.invalidateEditors(); appCalls.markDirty(); appCalls.pushHistoryNow();
        appRedraw.callableOptions('meijin:' + appVars.meijinProcedureId); appCalls.showMeijinProcedure(appVars.meijinProcedureId);
        appCalls.loadEditor(); appRedraw.editor();
        appCalls.log('名人の本文で 作った てじゅんの 名前を かえました', 'ok');
      } catch (error) {
        appCalls.$('#meijinProcError').hidden = false;
        appCalls.$('#meijinProcError').textContent = error.message;
      }
    }
    function openMeijinProcedure() {
      const d = meijinProjectDefinitions(appVars.project).find(x => x.id === appVars.meijinProcedureId);
      if (!d || !appCalls.flushActiveEditor()) return;
      appCalls.$('#procModal').classList.remove('show');
      appVars.selectedId = MEIJIN_OWNER; appVars.currentEvent = 'start'; appVars.selectedScriptId = d.scriptId;
      appCalls.hideSourceOverview(); appRedraw.tree(); appRedraw.properties(); appCalls.loadEditor(); appRedraw.components();
      const lines = appVars.el.editor.value.split('\n'), start = lines.slice(0, d.headLine - 1).reduce((sum, line) => sum + line.length + 1, 0);
      // The closed dialog gives focus back (and lets the page take focus) in its observer, which runs first.
      queueMicrotask(() => {
        appVars.el.editor.focus();
        appVars.el.editor.setSelectionRange(start, start + (lines[d.headLine - 1] || '').length);
      });
    }
    function installEditorShell() {
      const toolbar = appCalls.$('.menutool'),
        main = appCalls.$('.main'),
        side = appCalls.$('.side'),
        code = appCalls.$('.codewin'),
        toolbox = appCalls.$('.toolbox');
      const brand = appCalls.$('.titlebar');
      brand.textContent = 'Akari';
      toolbar.prepend(brand);
      const modes = appCalls.$('#editorModecode').parentElement,
        cancel = appCalls.$('#editorCancel');
      appCalls.$('.code-head').append(cancel);
      toolbar.insertBefore(modes, appCalls.$('#projectName'));
      for (const [id, path, title] of [
        ['redoBtn', 'M15 4l5 5-5 5M20 9H10a6 6 0 0 0 0 12h2', 'やり直す'],
        ['undoBtn', 'M9 4 4 9l5 5M4 9h10a6 6 0 0 1 0 12h-2', 'もとに もどす'],
      ]) {
        const b = appCalls.$('#' + id);
        b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' + path + '"/></svg>';
        b.title = title;
        b.setAttribute('aria-label', title);
        const label = document.createElement('span');
        label.textContent = title;
        b.append(label);
        appCalls.$('.debugbar').prepend(b);
      }
      appCalls.$('.debugbar').append(appCalls.$('#resetBtn'));
      // In the block view すべての本文・画面の本文・いつ動く？ and もとに もどす・やり直す (くわしく: and はじめに もどす) share one
      // row. When the two groups do not fit side by side, もとに もどす… take the row under it (data-source-row-wrap), so
      // no button lies under another and every label keeps one line (はばが 足りないときは 折り返します).
      const sourceNav = code.querySelector(':scope > .source-nav'), debugbar = code.querySelector(':scope > .debugbar');
      const groupWidth = (box) => {
        const shown = [...box.children].filter((c) => c.getClientRects().length && getComputedStyle(c).position !== 'absolute');
        if (!shown.length) return 0;
        const s = getComputedStyle(box), px = (v) => parseFloat(v) || 0;
        return shown.reduce((sum, c) => sum + c.getBoundingClientRect().width, 0) + (shown.length - 1) * px(s.columnGap)
          + px(s.paddingLeft) + px(s.paddingRight) + px(s.borderLeftWidth) + px(s.borderRightWidth) + px(s.marginLeft) + px(s.marginRight);
      };
      const placeSourceRow = () => {
        const s = getComputedStyle(code), room = code.clientWidth - (parseFloat(s.paddingLeft) || 0) - (parseFloat(s.paddingRight) || 0) - (parseFloat(s.columnGap) || 0);
        const wrap = String(document.body.dataset.editorMode === 'blocks' && groupWidth(sourceNav) + groupWidth(debugbar) > room + 0.5);
        if (code.dataset.sourceRowWrap !== wrap) code.dataset.sourceRowWrap = wrap;
      };
      // A button shown or put away (a level, the list of all bodies) changes what the groups need, as a new width does.
      const sourceRowObserver = new ResizeObserver(placeSourceRow);
      for (const box of [code, sourceNav, debugbar, ...sourceNav.children, ...debugbar.children]) sourceRowObserver.observe(box);
      const historyToolbarAnchor=document.createComment('toolbar history');
      appCalls.$('#sampleBtn').after(historyToolbarAnchor);
      const historyHomes=[appCalls.$('#undoBtn'),appCalls.$('#redoBtn')].map(button=>{const marker=document.createElement('span');button.before(marker);return {button,marker};}),
        callableTitle = appCalls.$('#procModal > .dialog > .win-title');
      appVars.placeHistoryButtons=()=>{
        for(const {button,marker}of historyHomes){
          if(appCalls.$('#procModal').classList.contains('show')){if(button.parentElement!==callableTitle)callableTitle.append(button);}
          else if(document.body.dataset.editorMode==='blocks'){
            const anchor=button.id==='undoBtn'&&appCalls.$('#redoBtn').parentElement===toolbar?appCalls.$('#redoBtn'):historyToolbarAnchor;
            if(button.parentElement!==toolbar||button.nextSibling!==anchor)toolbar.insertBefore(button,anchor);
          }else if(marker.nextSibling!==button)marker.after(button);
        }
      };
      new MutationObserver(appVars.placeHistoryButtons).observe(appCalls.$('#procModal'), { attributes: true, attributeFilter: ['class'] });
      appVars.placeHistoryButtons();
      const tools = document.createElement('div');
      tools.className = 'project-tools';
      const title = document.createElement('div');
      title.className = 'win-title';
      title.textContent = '作品の道具';
      tools.append(title);
      for (const id of [
        'imageObjectAdd',
        'paintAdd',
        'soundQuickAdd',
        'assetBtn',
        'procBtn',
        'dataBtn',
        'diagnoseBtn',
      ])
        tools.append(appCalls.$('#' + id));
      // The right end of the toolbar, left to right: コード／ブロック, the level, the work name (the level's choices depend
      // on the view).
      toolbar.insertBefore(appCalls.$('.ui-level-label'), appCalls.$('#projectName'));
      appCalls.installToolbarMenus(toolbar);
      toolbox.append(tools);
      // Native reverse Tab may leave a partly visible button clipped in this ribbon.
      tools.addEventListener('focusin', (event) => {
        if (event.target.matches('button,select'))
          event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });

      side.children[0].classList.add('objects-window');
      side.children[1].classList.add('properties-window');
      const componentControls = document.createElement('div');
      componentControls.id = 'componentControls';
      componentControls.className = 'component-controls';
      // The tools under the part list; the column on the right scrolls as one (the region is no scroller of its own).
      componentControls.setAttribute('role', 'region');
      componentControls.setAttribute('aria-label', '部品と作品の道具');
      side.children[0].append(componentControls);
      // はじめて has no toolbox: three buttons add a character there, where it can be seen (addComponent).
      const entryAdd = document.createElement('div');
      entryAdd.id = 'entryAddRow';
      entryAdd.setAttribute('role', 'group');
      entryAdd.setAttribute('aria-label', 'キャラクターを ふやす');
      for (const [preset, label] of [['dango', 'だんご'], ['akariMascot', 'たくどん'], ['star', '星']]) {
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'entry-add';
        // An attribute of its own: [data-sprite-preset] names the toolbox's tools only.
        add.dataset.entryPreset = preset;
        add.textContent = '＋ ' + label;
        add.addEventListener('click', () => appCalls.addComponent('sprite', null, null, preset));
        entryAdd.append(add);
      }
      side.children[0].querySelector(':scope > .win-title').after(entryAdd);
      const componentActions = document.createElement('div');
      componentActions.id = 'componentActions';
      componentControls.append(componentActions);
      const componentPicker = document.createElement('details');
      componentPicker.className = 'blockui-component-picker';
      componentPicker.id = 'componentPickerCore';
      const componentTitle = document.createElement('summary');
      componentTitle.textContent =
        '＋ キャラクター・部品を ふやす';
      componentPicker.append(componentTitle);
      componentControls.append(componentPicker);
      for (const selector of ['.properties-window', '.monitor-window']) {
        const section = appCalls.$(selector),
          title = section.querySelector('.win-title'),
          toggle = document.createElement('button');
        section.classList.add('blockui-side-folded');
        toggle.type = 'button';
        toggle.className = 'blockui-side-toggle';
        toggle.textContent = '\u25b8 ' + title.textContent;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.addEventListener('click', () => {
          const folded = section.classList.toggle('blockui-side-folded');
          toggle.setAttribute('aria-expanded', String(!folded));
          toggle.textContent = (folded ? '\u25b8 ' : '\u25be ') + title.dataset.label;
        });
        title.dataset.label = title.textContent;
        const label = document.createElement('span');
        label.className = 'blockui-side-label';
        label.textContent = title.textContent;
        title.replaceChildren(label, toggle);
      }

      for (const [preset, png] of [
        ['akariMascot', DEFAULT_MASCOT_PNG_BASE64],
        ['dango', DANGO_MASCOT_PNG_BASE64],
      ]) {
        const icon = document.querySelector(`[data-sprite-preset="${preset}"] .ico`);
        if (!icon) continue;
        const img = document.createElement('img');
        img.alt = '';
        img.width = 34;
        img.height = 34;
        img.style.objectFit = 'contain';
        const paletteIconUrl = URL.createObjectURL(
          new Blob([decodeBase64(png)], { type: 'image/png' }),
        );
        img.src = paletteIconUrl;
        window.addEventListener('pagehide', (event) => {
          if (!event.persisted) URL.revokeObjectURL(paletteIconUrl);
        });
        icon.replaceChildren(img);
      }
      const hints = document.createElement('details');
      hints.className = 'hints-disclosure';
      hints.id = 'hintsDisclosure';
      const hintSummary = document.createElement('summary');
      hintSummary.textContent = '書ける ことば';
      hints.append(hintSummary, appCalls.$('.code-assist .hint-panel'));
      appCalls.$('.code-assist').append(hints);
      const output = document.createElement('details');
      output.className = 'output-disclosure';
      const outputSummary = document.createElement('summary');
      outputSummary.textContent = '出てきた 文字';
      output.append(outputSummary, appCalls.$('#console'));
      appCalls.$('.monitor-window').append(output);
      document.addEventListener('keydown', (event) => {
        if (
          event.key === 'Escape' &&
          !event.isComposing &&
          !event.defaultPrevented &&
          hints.open &&
          !event.target.closest('#hintsDisclosure')
        )
          hints.open = false;
      });
      document.body.dataset.editorMode = 'code';
      // Keep the stage under the pointer until the current design gesture has finished.
      appCalls.$('#formSurface').addEventListener(
        'pointerdown',
        (event) => {
          if (appCalls.modelLocked() || event.button !== 0 || event.isPrimary === false || appVars.shellPointer)
            return;
          const token = { pointerId: event.pointerId };
          appVars.shellPointer = token;
          const finish = (e) => {
            if (e.type !== 'blur' && e.pointerId !== token.pointerId) return;
            appVars.activeDragCleanup?.(e);
            appCalls.releaseShellPointer();
          };
          token.cleanup = () => {
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
            window.removeEventListener('blur', finish);
          };
          window.addEventListener('pointerup', finish);
          window.addEventListener('pointercancel', finish);
          window.addEventListener('blur', finish);
        },
        true,
      );
    }
    function openRuntimeInspector() {
      if (!['RUNNING', 'PAUSED'].includes(appVars.appState) || appVars.inspectorNodes.length) return;
      appVars.stageView.clearInput();
      // The dialog opens on the body of the sentence 「いま 動いている 文：」 names, not on the body chosen before the run.
      appCalls.flushRuntimePaint();
      appRedraw.executionLocation({ follow: true });
      // The dialog shows the running bodies with the コード／ブロック toggle and the strip of the running sentence; the level is
      // chosen on the edit screen only.
      for (const [node, target] of [[appCalls.$('.codewin'), appCalls.$('#runtimeInspectorBody')], [appCalls.$('.monitor-window'), appCalls.$('#runtimeInspectorBody')], [appCalls.$('#editorModecode').parentElement, appCalls.$('#runtimeInspectorModes')], [appCalls.$('#runStrip'), appCalls.$('#runtimeInspectorStrip')]]) {
        const marker = document.createComment('runtime inspector return point');
        node.before(marker); appVars.inspectorNodes.push({node, marker}); target.append(node);
      }
      appCalls.$('#runtimeInspector').showModal();
      appRedraw.editorBinding(appVars.mainEditor);
      // The line numbers were laid out while the body was not shown (the run screen); lay them out in the dialog, and
      // bring the running sentence into view.
      appCalls.updateGutter();
      if (appVars.activeLoc?.key === appCalls.bindingOwner(appVars.mainEditor)) {
        if (appVars.mainEditor.session?.mode === 'blocks') appCalls.$('#blockEditor .blockui-current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        else {
          appVars.el.editor.scrollTop = Math.max(0, (appCalls.wrappedCodeLines().lines[appVars.activeLoc.line - 1]?.top || 0) - Math.floor(appVars.el.editor.clientHeight / 3));
          appVars.el.gutter.scrollTop = appVars.el.editor.scrollTop;
        }
      }
      appCalls.$('#runtimeInspectorClose').focus();
    }
    function undo() {
      if (!tutorialAllows(appVars.tutorial,'undo')) return;
      if (appCalls.modelLocked() || appCalls.composingAny() || appVars.activeDragCleanup || appVars.colorEdit) return;
      appCalls.flushActiveEditor();
      appCalls.dropHistoryTimer();
      const cur = appCalls.snapshot();
      if (appVars.history.at(-1)?.stateFingerprint !== cur.stateFingerprint) appVars.history.push(cur);
      if (appVars.history.length <= 1) return;
      appVars.redo.push(appVars.history.pop());
      appCalls.restoreSnap(appVars.history.at(-1));
      appCalls.confirmTutorialOperation('undo');
      appCalls.setStatus('1つ前に もどしたよ');
    }
    function redoDo() {
      if (appVars.tutorial) return;
      if (appCalls.modelLocked() || appCalls.composingAny() || appVars.activeDragCleanup || appVars.colorEdit || !appVars.redo.length) return;
      appCalls.flushActiveEditor();
      if(appVars.history.at(-1)?.stateFingerprint!==appCalls.stateFingerprintCore()){appCalls.pushHistoryNow();return;}
      appCalls.dropHistoryTimer();
      const e = appVars.redo.pop();
      appVars.history.push(e);
      appCalls.restoreSnap(e);
      appCalls.setStatus('やり直したよ');
    }
    function requestOpenProject() {
      if(appVars.tutorial)return;
      if (appCalls.modelLocked() || appVars.openRequest || document.querySelector('.modal.show:not(#procModal),.modal.open,dialog[open]')) return;
      appCalls.confirmOpenRequest('file');
    }
    function saveEditor(options = {}) {
      if (appCalls.modelLocked()) return true;
      appVars.activeDragCleanup?.();
      return appCalls.saveCodeBinding(appVars.mainEditor, options);
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
      inp.disabled = appCalls.modelLocked();
      inp.addEventListener('change', () => {
        if (appCalls.modelLocked()) return;
        const before = cloneDesignProject(appVars.project);
        try {
          if (type === 'number' && (inp.value.trim() === '' || !finite(Number(inp.value))))
            throw new Error('数を 入れてね');
          onchange(type === 'checkbox' ? inp.checked : inp.value);
          validateDesignProject(appVars.project);
          appCalls.markDirty();
          appRedraw.all();
          appRedraw.editor();
          options.after?.();
        } catch (err) {
          appCalls.log((err.code ? err.code + ' ' : '') + appCalls.sentence(err.code ? err.message : err.message.replace(/てね$/, 'て ください')), 'error');
          appCalls.rollbackDesign(before);
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
      appCalls.colorChip(chip, c[field]);
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
        b.disabled = appCalls.modelLocked();
        b.setAttribute('aria-label', label + ': ' + preset.label);
        b.setAttribute('aria-pressed', String(c[field] === preset.value));
        const swatch = document.createElement('span');
        swatch.className = 'color-chip';
        appCalls.colorChip(swatch, preset.value);
        swatch.setAttribute('aria-hidden', 'true');
        b.append(swatch, document.createTextNode(preset.label));
        b.onclick = () => appCalls.choosePreset(c, field, preset.value);
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
      more.disabled = appCalls.modelLocked();
      more.onclick = () => appCalls.openColorPicker(c, field, label);
      foot.append(more);
      if (field === 'bg') {
        const none = document.createElement('button');
        none.type = 'button';
        none.className = 'color-none';
        none.textContent = 'なし（とうめい）';
        none.setAttribute('aria-pressed', String(c.bg === null));
        none.disabled = appCalls.modelLocked();
        none.onclick = () => appCalls.choosePreset(c, field, null);
        foot.append(none);
      }
      box.append(grid, foot);
      return box;
    }
    function installColorPicker() {
      const canvas = appCalls.$('#colorCanvas'),
        ctx = canvas.getContext('2d'),
        image = ctx.createImageData(256, 256),
        r = 256 * 0.47;
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 256; x++) {
          const dx = (x + 0.5 - 128) / r,
            dy = (y + 0.5 - 128) / r,
            d = Math.hypot(dx, dy),
            i = (y * 256 + x) * 4;
          if (d > 1) continue;
          const hs = pickerWheelHS(dx, dy),
            rgb = pickerRgb(hs.h, hs.s, 1);
          image.data[i] = rgb[0];
          image.data[i + 1] = rgb[1];
          image.data[i + 2] = rgb[2];
          image.data[i + 3] = 255;
        }
      ctx.putImageData(image, 0, 0);
      const wheel = appCalls.$('#colorWheel');
      const point = (e) => {
        const rect = wheel.getBoundingClientRect();
        return pickerWheelHS(
          (e.clientX - rect.left - rect.width / 2) / (rect.width * 0.47),
          (e.clientY - rect.top - rect.height / 2) / (rect.height * 0.47),
          appVars.colorEdit.hsv.h,
        );
      };
      const finishPointer = (cancel = false) => {
        const edit = appVars.colorEdit,
          pointer = edit?.pointer;
        if (!pointer) return;
        edit.pointer = null;
        if (cancel) {
          edit.hsv = { ...pointer.hsv };
          edit.value = pointer.value;
          edit.invalid = pointer.invalid;
          appCalls.syncColorPicker(false);
          appCalls.$('#colorHex').value = pointer.hex;
        }
        try {
          wheel.releasePointerCapture(pointer.id);
        } catch (_) {}
      };
      wheel.addEventListener('pointerdown', (e) => {
        const edit = appVars.colorEdit;
        if (!edit || edit.composing || e.button !== 0 || e.isPrimary === false || edit.pointer)
          return;
        e.preventDefault();
        e.stopPropagation();
        wheel.focus({ preventScroll: true });
        edit.pointer = {
          id: e.pointerId,
          hsv: { ...edit.hsv },
          value: edit.value,
          invalid: edit.invalid,
          hex: appCalls.$('#colorHex').value,
        };
        try {
          wheel.setPointerCapture(e.pointerId);
        } catch (_) {}
        appCalls.updatePickerHsv(point(e));
      });
      wheel.addEventListener('pointermove', (e) => {
        if (!appVars.colorEdit?.pointer || appVars.colorEdit.pointer.id !== e.pointerId) return;
        e.preventDefault();
        appCalls.updatePickerHsv(point(e));
      });
      wheel.addEventListener('pointerup', (e) => {
        if (appVars.colorEdit?.pointer?.id !== e.pointerId) return;
        appCalls.updatePickerHsv(point(e));
        finishPointer();
      });
      for (const type of ['pointercancel', 'lostpointercapture'])
        wheel.addEventListener(type, (e) => {
          if (appVars.colorEdit?.pointer?.id === e.pointerId) finishPointer(true);
        });
      window.addEventListener('blur', () => finishPointer(true));
      wheel.addEventListener('keydown', (e) => {
        if (
          !appVars.colorEdit ||
          e.isComposing ||
          e.keyCode === 229 ||
          e.ctrlKey ||
          e.metaKey ||
          e.altKey ||
          !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
        )
          return;
        e.preventDefault();
        e.stopPropagation();
        const step = e.shiftKey ? 1 : 5,
          { h, s } = appVars.colorEdit.hsv;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
          appCalls.updatePickerHsv({ h: (h + (e.key === 'ArrowRight' ? step : -step) + 360) % 360 });
        else appCalls.updatePickerHsv({ s: clamp(s + (e.key === 'ArrowUp' ? step : -step) / 100, 0, 1) });
      });
      for (const [id, key, factor] of [
        ['Hue', 'h', 1],
        ['Saturation', 's', 100],
        ['Value', 'v', 100],
      ])
        appCalls.$('#color' + id + (id === 'Value' ? 'Core' : '')).addEventListener('input', (e) =>
          appCalls.updatePickerHsv({ [key]: Number(e.target.value) / factor }),
        );
      const hex = appCalls.$('#colorHex'),
        readHex = () => {
          const edit = appVars.colorEdit;
          if (!edit || edit.composing) return;
          const value = pickerHex(hex.value);
          edit.invalid = !value;
          if (value) {
            edit.value = value;
            edit.hsv = pickerHexToHsv(value);
          }
          appCalls.syncColorPicker(false);
        };
      hex.addEventListener('input', readHex);
      hex.addEventListener('compositionstart', () => {
        if (appVars.colorEdit) {
          appVars.colorEdit.composing = true;
          appCalls.$('#colorConfirm').disabled = true;
        }
      });
      hex.addEventListener('compositionend', () => {
        if (appVars.colorEdit) {
          appVars.colorEdit.composing = false;
          readHex();
        }
      });
      hex.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
          e.preventDefault();
          appCalls.$('#colorConfirm').click();
        }
      });
      appCalls.$('#colorNone').onclick = () => {
        if (appVars.colorEdit?.field === 'bg' && !appVars.colorEdit.composing) {
          appVars.colorEdit.value = null;
          appCalls.syncColorPicker();
        }
      };
      appCalls.$('#colorCancel').onclick = appCalls.closeColorPicker;
      appCalls.$('#colorConfirm').onclick = () => {
        const edit = appVars.colorEdit;
        if (!edit || edit.invalid || edit.composing) return;
        if (
          appCalls.modelLocked() ||
          appVars.project !== edit.project ||
          appCalls.componentById(edit.id) !== edit.component ||
          appVars.selectedId !== edit.id ||
          edit.component[edit.field] !== edit.original
        ) {
          appCalls.closeColorPicker();
          return;
        }
        try {
          const changed = appCalls.commitColor(edit.component, edit.field, edit.value);
          appCalls.closeColorPicker();
          if (changed) appRedraw.editor();
        } catch (error) {
          appCalls.$('#colorError').textContent = error.message;
          appCalls.$('#colorAdvanced').open = true;
        }
      };
    }
    function startDrag(ev, id) {
      if (appCalls.modelLocked() || ev.button !== 0 || ev.isPrimary === false) return;
      appVars.activeDragCleanup?.();
      const c = appCalls.componentById(id);
      if (!c) return;
      appCalls.dropHistoryTimer();
      appCalls.pushHistoryNow();
      const pointerId = ev.pointerId,
        before = { ...c },
        toStage = (e) => {
          const rect = appVars.el.form.getBoundingClientRect();
          return {
            x: ((e.clientX - rect.left) * appVars.project.stage.width) / rect.width,
            y: ((rect.bottom - e.clientY) * appVars.project.stage.height) / rect.height,
          };
        },
        start = toStage(ev), pressX = ev.clientX, pressY = ev.clientY, slop = appCalls.pointerSlop(ev);
      let next = { x: c.x, y: c.y },
        finished = false,
        moved = false;
      const placeText = (at) => `よこのばしょ ${at.x}　たてのばしょ ${at.y}`;
      // Like resize, moving previews a candidate; cancellation never edits the project.
      const move = (e) => {
        if (e.pointerId !== pointerId) return;
        if (appCalls.modelLocked() || appCalls.componentById(id) !== c) {
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
        appRedraw.resizePreview(appVars.designResizePreview);
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
          if (!cancel) changed = appCalls.commitResize(c, next);
        } catch (error) {
          appCalls.log(error.message, 'error');
        }
        appRedraw.properties();
        appRedraw.components();
        if (changed) appRedraw.editor();
        appCalls.releaseShellPointer();
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
      if (appCalls.modelLocked() || ev.button !== 0 || ev.isPrimary === false) return;
      appVars.activeDragCleanup?.();
      const c = appCalls.componentById(id);
      if (!designResizeMode(c)) return;
      appCalls.dropHistoryTimer();
      appCalls.pushHistoryNow();
      const pointerId = ev.pointerId,
        before = { ...c },
        toStage = (e) => {
          const rect = appVars.el.form.getBoundingClientRect();
          return {
            x: ((e.clientX - rect.left) * appVars.project.stage.width) / rect.width,
            y: ((rect.bottom - e.clientY) * appVars.project.stage.height) / rect.height,
          };
        },
        start = toStage(ev), pressX = ev.clientX, pressY = ev.clientY, slop = appCalls.pointerSlop(ev);
      let next = { x: c.x, y: c.y, w: c.w, h: c.h, scalePercent: c.scalePercent },
        finished = false,
        moved = false;
      // The handles keep their offset from the part for the whole drag (A-R2-05): the part counts as small (its corner
      // handles just outside it) as the handles were shown at the press.
      const pressSmall = appVars.designResizeSmall = appCalls.designHandlesSmallShown(c);
      const sizeText = (at) =>
        designResizeMode(c) === 'scale' ? `${c.name}の 大きさ ${at.scalePercent}％` : `はば ${at.w}　高さ ${at.h}`;
      const move = (e) => {
        if (e.pointerId !== pointerId) return;
        if (appCalls.modelLocked() || appCalls.componentById(id) !== c) {
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
        appRedraw.resizePreview(appVars.designResizePreview);
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
          if (!cancel) changed = appCalls.commitResize(c, next);
        } catch (error) {
          appCalls.log(error.message, 'error');
        }
        // A part that was small at the press keeps its corner handles just outside it, so the handle stays under the
        // pointer; one that became small gets them now, so its handles do not lie on each other.
        if (changed) appVars.designHandlesShown = { key: appCalls.designHandleKey(c), small: pressSmall || appCalls.designHandlesSmall(c) };
        appRedraw.properties();
        appRedraw.components();
        if (changed) appRedraw.editor();
        appCalls.releaseShellPointer();
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
      if (appCalls.modelLocked() || appVars.selectedId === 'stage' || !appCalls.flushActiveEditor()) return;
      const source = appCalls.componentById(appVars.selectedId);
      if (!source) return;
      try {
        if (appVars.project.components.length >= LIMITS.components)
          throw new AkariError('F504', '部品が いっぱいで、もう ふやせません。いらない部品を けして ください');
        const next = cloneDesignProject(appVars.project), copy = cloneDesignProject(source), ids = appCalls.allIds(),
          names = new Set(appVars.project.components.map(c => c.name));
        let n = 2;
        do {
          const suffix = `_${n++}`;
          copy.name = Array.from(source.name).slice(0, 80 - suffix.length).join('') + suffix;
        } while (names.has(copy.name));
        copy.id = appCalls.ensureUniqueId(source.type, ids);
        for (const d of copy.localData.variables) d.id = appCalls.ensureUniqueId('ivar', ids);
        for (const d of copy.localData.lists) d.id = appCalls.ensureUniqueId('ilist', ids);
        for (const costume of copy.costumes || []) {
          const oldId = costume.id;
          costume.id = appCalls.ensureUniqueId('costume', ids);
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
        appCalls.dropHistoryTimer();
        appCalls.pushHistoryNow();
        appVars.project = next;
        appVars.selectedId = copy.id;
        appVars.currentEvent = 'start';
        appVars.selectedScriptId = null;
        appCalls.markDirty();
        appRedraw.all();
        appCalls.loadEditor();
        appRedraw.editor();
        appCalls.dropHistoryTimer();
        appCalls.pushHistoryNow();
        appCalls.setStatus(`「${source.name}」の 見た目のコピー「${copy.name}」を 作ったよ`);
      } catch (error) {
        appCalls.log(`${error.code || ''} 見た目のコピーを 作れませんでした: ${error.message}`, 'error');
        appCalls.setStatus('見た目のコピーを 作れなかったよ');
      }
    }
    function deleteSelectedComponent() {
      if (appCalls.modelLocked() || appVars.selectedId === 'stage' || !appCalls.flushActiveEditor()) return;
      const c = appCalls.componentById(appVars.selectedId);
      if (!c) return;
      if (!appCalls.allowResourceDelete('component:' + c.id, appCalls.$('#properties'), c.id)) return;
      if (!confirm('「' + c.name + '」を けす？')) return;
      appCalls.dropHistoryTimer();
      appCalls.pushHistoryNow();
      const id = c.id;
      appVars.project.components = appVars.project.components.filter((x) => x.id !== id);
      appVars.project.scripts = appVars.project.scripts.filter((x) => x.targetId !== id);
      appVars.selectedId = 'stage';
      appVars.currentEvent = 'start';
      appVars.selectedScriptId = null;
      appCalls.compactCurrentAssets();
      appCalls.revokeDesignUrls();
      appCalls.markDirty();
      appRedraw.all();
      appCalls.loadEditor();
      appRedraw.editor();
      appCalls.pushHistoryNow();
      appCalls.setStatus(`「${c.name}」を けしたよ`);
    }
    function showFullValue(label, value) {
      appCalls.closeRuntimeInspector();
      appVars.valueView = { label, value, index: 0, page: 0 };
      appRedraw.fullValue();
      appCalls.$('#valueModal').classList.add('show');
    }
    function openQuotedListRepair(record) {
      // Hidden controls from an older run must not discard a current editor draft.
      if (!appVars.scheduler?.paused || !appVars.scheduler.errorRecords.includes(record)) return;
      const range = appCalls.quotedListRepair(record);
      if (!range) return;
      appCalls.stopRun();
      const ownerKey = record.quotedList.ownerKey, script = scriptBySourceKey(appVars.project, ownerKey);
      if (!script) { appCalls.setStatus('この 本文は もう ないよ。いまの 本文を たしかめてね'); return; }
      appVars.selectedId = script.targetId; appVars.currentEvent = script.event; appVars.selectedScriptId = script.id || null;
      appCalls.hideSourceOverview(); appRedraw.selectors(); appCalls.loadEditor(); appCalls.switchEditorMode(appVars.mainEditor, 'code');
      const token = appVars.generationToken, panel = document.createElement('section');
      panel.id = 'listRepairPanel'; panel.className = 'editor-pending';
      panel.setAttribute('aria-label', 'うまく いかなかった 文字を リストに 直す');
      panel.style.cssText = 'flex:none;max-height:210px;overflow:auto;overflow-wrap:anywhere';
      const explanation = document.createElement('p'), preview = document.createElement('p'),
        select = document.createElement('select'), apply = document.createElement('button'),
        cancel = document.createElement('button'), notice = document.createElement('p');
      explanation.textContent = `ここは 文字だよ。リスト「${record.quotedList.name}」を 使う？`;
      preview.textContent = `${appCalls.targetById(script.targetId)?.name || '画面'}・${eventText(script.event, script.filter) || script.event}の本文、${record.quotedList.span.startLine}行目の ${range.original} だけを かえます。番目・秒数・ほかの文・リストの中身は そのままです。`;
      select.id = 'listRepairChoice'; select.setAttribute('aria-label', 'ここで 使う リスト');
      select.style.maxWidth = '100%';
      const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '使う リストを えらぶ'; select.append(placeholder);
      const candidates = appCalls.quotedListCandidates(record);
      for (const [index, candidate] of candidates.entries()) {
        const option = document.createElement('option'); option.value = String(index); option.textContent = candidate.label; select.append(option);
      }
      apply.id = 'listRepairApply'; apply.textContent = 'ここだけ 入れかえる'; apply.disabled = true;
      cancel.id = 'listRepairCancel'; cancel.textContent = 'やめる'; cancel.onclick = () => panel.remove();
      notice.id = 'listRepairNotice'; notice.setAttribute('role', 'status');
      if (!candidates.length) notice.textContent = 'ここで 使える リストは ありません。へんすう・リストの ボタンで 作ってから、もう一度 動かして ください。';
      select.disabled = !candidates.length;
      const sourceIsCurrent = () => !appCalls.modelLocked() && appVars.generationToken === token &&
        appCalls.bindingOwner(appVars.mainEditor) === ownerKey && appCalls.readSource(appVars.mainEditor) === record.source &&
        appVars.el.editor.value === record.source.replace(/\r\n?/g, '\n') && !appCalls.hasPendingEditor();
      const stale = () => { notice.textContent = 'うまく いかなかった あとに、本文や 動きが かわりました。いまの 本文を たしかめて、もう一度 動かしてから えらびなおして ください。'; apply.disabled = true; };
      select.onchange = () => {
        if (!sourceIsCurrent()) { stale(); return; }
        const candidate = candidates[Number(select.value)]; apply.disabled = select.value === '';
        notice.textContent = select.value === '' ? '' : `${range.original} → ${candidate.source}`;
      };
      apply.onclick = () => {
        if (!sourceIsCurrent()) { stale(); return; }
        const candidate = select.value === '' ? null : candidates[Number(select.value)],
          current = candidate && appCalls.quotedListCandidates(record).find(c => c.id === candidate.id && c.source === candidate.source && c.owner === candidate.owner);
        if (!current) { notice.textContent = 'えらんだ リストが かわりました。もう一度 動かしてから、えらびなおして ください。'; apply.disabled = true; return; }
        try {
          const source = record.source.slice(0, range.start) + current.source + record.source.slice(range.end);
          if (!appCalls.commitSource(appVars.mainEditor, source, {atomic:true})) return;
          appVars.el.editor.value = source; appRedraw.editor(); panel.remove();
          appVars.el.editor.focus();
          const start = record.source.slice(0, range.start).replace(/\r\n?/g, '\n').length;
          appVars.el.editor.setSelectionRange(start, start + current.source.length);
          appCalls.setStatus('えらんだ ところを リストに 直したよ。「▶ 動かす」で たしかめてね');
        } catch (error) { notice.textContent = error.message; }
      };
      panel.append(explanation, preview, select, apply, cancel, notice);
      appVars.el.editor.closest('.editor-shell').before(panel);
      if (sourceIsCurrent()) {
        const start = record.source.slice(0,range.start).replace(/\r\n?/g,'\n').length;
        appVars.el.editor.setSelectionRange(start, start + range.original.replace(/\r\n?/g,'\n').length);
      } else stale();
      select.focus();
    }
    function insertHint(h) {
      if (!h.enabled || appCalls.modelLocked() || !appCalls.flushEditor(appVars.mainEditor)) return;
      try {
        const t = appVars.el.editor,
          r = insertSource(
            appCalls.readSource(appVars.mainEditor),
            t.selectionStart,
            t.selectionEnd,
            h.text,
            h.mode,
          );
        appCalls.commitSource(appVars.mainEditor, r.source, { atomic: true });
        t.value = r.source;
        t.setSelectionRange(r.start, r.end);
        appRedraw.editor();
        const disclosure = appCalls.$('#hintsDisclosure');
        if (disclosure) disclosure.open = false;
        t.focus();
      } catch (err) {
        appCalls.showEditorFailure(appVars.mainEditor, err);
      }
    }
    function startMeijin() {
      if (appCalls.modelLocked() || appCalls.currentIsMeijin()) return;
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
          const headed = owner?.name ? appCalls.meijinHeadingSource({ event: script?.event ?? appVars.currentEvent, actorRef: { kind: 'named', name: owner.name }, filter: script?.filter ?? null }, owner.name) + '\n' + source.split('\n').map(line => line.trim() ? '  ' + line : line).join('\n') : null;
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
          const at = unit.sourceSpan.startLine - 1, first = unit.body?.[0]?.sourceSpan, head = appCalls.meijinHeadingSource(unit.heading, unit.heading.actorRef?.kind === 'named' ? unit.heading.actorRef.name : owner.name);
          lines[at] = first?.startLine === unit.sourceSpan.startLine ? head + lines[at].slice(first.startColumn - 1) : head;
        }
        source = lines.join('\n');
        // The body's owner is written out, because a 名人 script belongs to no part.
        if (!headings.length) {
          const heading = { event: script?.event ?? appVars.currentEvent, actorRef: { kind: 'named', name: owner.name }, filter: script?.filter ?? null };
          source = appCalls.meijinHeadingSource(heading, owner.name) + '\n' + source.split('\n').map(line => line.trim() ? '  ' + line : line).join('\n');
        }
        }
      }
      // The owner-approved wording (final call 23).
      if (!confirm(`名人で 書くと、この本文は ${owner?.name ? owner.name + 'から はなれて、' : ''}「動かすもの」の「名人の本文」に うつります。ブロックには もどせません。\n名人で 書きますか？`)) return;
      try {
        const next = cloneDesignProject(appVars.project), id = script?.id || appCalls.ensureUniqueId('script');
        const row = { id, mode: 'meijin', targetId: MEIJIN_OWNER, event: 'start', source, ...(script?.document ? { document: cloneDesignProject(script.document) } : {}) };
        const at = script ? appVars.project.scripts.indexOf(script) : -1;
        if (at >= 0) next.scripts.splice(at, 1, row); else next.scripts.push(row);
        validateDesignProject(next);
        appCalls.dropHistoryTimer(); appCalls.pushHistoryNow();
        // The draft is now the 名人 text: its reading error is not shown any more.
        if (draft != null) { if (appVars.mainEditor.session) { appVars.mainEditor.session.pendingEdit = null; appVars.mainEditor.session.blockDraft = null; } appCalls.clearEditorFailure(appVars.mainEditor); }
        appVars.project = next; appVars.selectedId = MEIJIN_OWNER; appVars.currentEvent = 'start'; appVars.selectedScriptId = id;
        appCalls.hideSourceOverview(); appCalls.invalidateEditors(); appCalls.markDirty(); appRedraw.tree(); appRedraw.properties(); appCalls.loadEditor(); appRedraw.components();
        appCalls.dropHistoryTimer(); appCalls.pushHistoryNow();
        appCalls.setStatus('「名人の本文」に うつしたよ。この 本文は コードモードで 書いてね');
      } catch (error) { appCalls.showEditorFailure(appVars.mainEditor, error); }
    }
    function formatCurrent() {
      if (appCalls.modelLocked() || !appCalls.flushEditor(appVars.mainEditor)) return;
      if (appCalls.currentIsMeijin()) { appCalls.setStatus('名人の本文は、書いた とおりに のこすよ'); return; }
      try {
        const s = appCalls.getEditorSession(appVars.mainEditor);
        if (!s.syntaxAst) throw new Error('書き方の まちがいを 直してから 整えて ください');
        const source = formatScript(s.syntaxAst);
        appCalls.commitSource(appVars.mainEditor, source, { atomic: true });
        appVars.el.editor.value = source;
        appRedraw.editor();
      } catch (err) {
        appCalls.showEditorFailure(appVars.mainEditor, err);
      }
    }
    function startRun() {
      if (!tutorialAllows(appVars.tutorial,'run')) return;
      if (appCalls.modelLocked()) return;
      // A refused run always tells the child why nothing moved.
      // Every refusal is said the same way: まだ 動かせないよ。, the reason, and 。 at the end (FM2-13).
      const refuse = (reason) => appCalls.setStatus('まだ 動かせないよ。' + appCalls.sentence(reason));
      if (!appCalls.flushActiveEditor()) {
        refuse(appCalls.sourceImportChoice() || appVars.editorFailureStatus || '書きかけの ところを 直してから「▶ 動かす」を おしてね。');
        return;
      }
      if(appVars.tutorial){
        const trial=tutorialStep(appVars.tutorial).id.slice(4),actor=appCalls.componentById(appVars.tutorial.target);
        appVars.tutorialTrace={epoch:appVars.tutorial.epoch,trial,x:actor.x,y:actor.y,requiredClicks:tutorialSequence(appVars.tutorial)[appVars.tutorial.index+1].clicks,
          statements:[],speech:[],observations:[],clicks:0,busy:false,sawTask:false,complete:false,failed:false};
      }
      appRedraw.editor();
      if(appCalls.hasPendingEditor()){appCalls.log('書きかけの 入力を さいごまで 書いてから 動かして ください','error');refuse('書きかけの ところを 直してから「▶ 動かす」を おしてね。');return;}
      appCalls.dropHistoryTimer();
      appCalls.pushHistoryNow();
      if (appCalls.hasCallableDraft()) {
        appCalls.log('自分で作ったブロックを なおして いる とちゅうです。ほぞんしてから 動かして ください', 'error');
        refuse('自分で作ったブロックの 画面を とじてから「▶ 動かす」を おしてね。');
        return;
      }
      if (!appCalls.flushActiveEditor()) {
        refuse(appCalls.sourceImportChoice() || appVars.editorFailureStatus || '書きかけの ところを 直してから「▶ 動かす」を おしてね。');
        return;
      }
      appVars.compiled = compileProject(appVars.project);
      if (appVars.compiled.errors.length) {
        appCalls.showDiagnosis();
        appCalls.log('作品に まちがいが あるので 動かしません。「作品チェック」を 見て 直して ください', 'error');
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
        appCalls.setStatus(appCalls.shownEditorMode() === 'blocks'
          ? memo ? 'メモは 動かないよ。メモの ほかに、動く ブロックを 入れてね' : 'ブロックが まだ ないよ。「＋ ここに入れる」を おして、ブロックを 入れてね'
          : memo ? 'メモは 動かないよ。メモの ほかに、動く 文を 書いてね' : '本文が まだ ないよ。コードに 文を 書いてね');
        return;
      }
      try {
        validateAssetReferences(appVars.project, appVars.assetStore);
      } catch (err) {
        appCalls.log(`${err.code || ''} 絵や音の チェック: ${err.message}`, 'error');
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
        appCalls.setStatus('絵や音を じゅんびして いるよ');
        appCalls.updateRunState();
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
              appCalls.log(`R415 ${err.message}`, 'error');
              appCalls.setStatus('音を いったん 止めたり、また 鳴らしたり できなかったよ');
            };
            appVars.runtime.reset(seed);
            appVars.scheduler = new EventScheduler(appVars.project, appVars.compiled, appVars.runtime, br);
            appVars.stageView.seedHeldInput();
            appVars.appState = 'RUNNING';
            appCalls.confirmTutorialOperation('run');
            appVars.scheduler.start();
            appRedraw.all();
            // The seed is a くわしく fact (F-28).
            appCalls.log(document.body.dataset.uiLevel === 'advanced' ? `動かしはじめました（たね=${seed}）` : '動かしはじめました', 'ok');
            appCalls.setStatus('動いているよ');
            appVars.el.form.focus({ preventScroll: true });
          } catch (err) {
            if (token !== appVars.generationToken) return;
            appCalls.disposeRuntime();
            appVars.appState = 'DESIGN';
            appRedraw.all();
            appCalls.loadEditor();
            appCalls.log(`${err.code || ''} 動かす じゅんびが できませんでした: ${err.message}`, 'error');
            appCalls.setStatus('動かす じゅんびが できなかったよ。作品は のこって いるよ。「▶ 動かす」で もう一度 ためしてね');
          }
        })();
      } catch (err) {
        appCalls.disposeRuntime();
        appVars.appState = 'DESIGN';
        appCalls.updateRunState();
        appCalls.log(`${err.code || ''} 動かす じゅんびが できませんでした: ${err.message}`, 'error');
        appCalls.setStatus('動かす じゅんびが できなかったよ。作品は のこって いるよ。「▶ 動かす」で もう一度 ためしてね');
      }
    }
    function exportProject() {
      if(appVars.tutorial)return;
      if (!appCalls.flushActiveEditor()) {
        // A press that cannot make the file says why (the review waits, or the code has a mistake).
        const why = appCalls.sourceImportChoice() || appVars.editorFailureStatus;
        if (why) appCalls.setStatus('まだ ファイルに できないよ。' + why + (why.endsWith('。') ? '' : '。'));
        return;
      }
      appCalls.dropHistoryTimer();
      appCalls.pushHistoryNow();
      if(appCalls.hasPendingEditor()){appCalls.log('書きかけの 入力を さいごまで 書いてから、うごく作品を ファイルにしてね','error');return;}
      if (appCalls.modelLocked() || document.querySelector('.modal.show,.modal.open')) return;
      if (appCalls.hasCallableDraft()) {
        appCalls.log('自分で作ったブロックを なおして いる とちゅうだよ。ほぞんしてから、うごく作品を ファイルにしてね', 'error');
        return;
      }
      const errors = compileProject(appVars.project).errors;
      if (errors.length) {
        appCalls.showDiagnosis();
        appCalls.log('作品の まちがいを 直してから、うごく作品を ファイルにしてね', 'error');
        return;
      }
      if (appVars.exportBusy) return;
      appCalls.$('#exportChoiceModal').classList.add('show');
    }
    function downloadProject(presentation) {
      if (appVars.exportBusy || !appCalls.$('#exportChoiceModal').classList.contains('show') || appCalls.modelLocked()) return;
      if (!appCalls.flushActiveEditor() || appCalls.hasPendingEditor() || appCalls.hasCallableDraft() || compileProject(appVars.project).errors.length) {
        appCalls.$('#exportChoiceModal').classList.remove('show'); return;
      }
      appVars.exportBusy = true;
      const generation = ++appVars.exportGeneration;
      const button = appCalls.$('#exportBtn');
      button.disabled = true;
      appCalls.$('#exportControls').disabled = appCalls.$('#exportArtwork').disabled = true;
      appCalls.setStatus('うごく作品を ファイルに しているよ');
      // The file is made after the next paint, so that sentence shows while it is made: a work with many pictures takes
      // seconds, and the page cannot paint meanwhile. A timer stands in where no frame comes (a hidden page).
      let started = false;
      const make = () => {
        if (!started && generation === appVars.exportGeneration && appCalls.$('#exportChoiceModal').classList.contains('show')) {
          started = true;
          appCalls.writePlayerFile(presentation, button);
        }
      };
      requestAnimationFrame(() => setTimeout(make, 0));
      setTimeout(make, 200);
    }
    // Saves the work file; true when its download has started.
    function saveProject() {
      if (!tutorialAllows(appVars.tutorial,'save')) return false;
      if (appVars.appState === 'IMPORTING' || appVars.appState === 'PREPARING') return false;
      if(appCalls.composingAny()){appCalls.setStatus('日本語の 入力を 決めてから、ほぞんしてね');return false;}
      appCalls.flushActiveEditor();
      try {
        const editorState=appCalls.captureEditorState(),unfinished=editorState.pendingEditors.length||editorState.callableDraft||compileProject(appVars.project).errors.length;
        const md = serializeProject(appVars.project, appVars.assetStore, editorState),
          blob = new Blob([md], { type: 'text/markdown;charset=utf-8' }),
          a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = safeDownloadName(appVars.project.name) + '.akari.md';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        if(appVars.tutorial){appVars.tutorialSave={epoch:appVars.tutorial.epoch,identity:appVars.workspaceIdentity,fingerprint:appCalls.currentFingerprint(),verified:false};appCalls.confirmTutorialOperation('save');}
        appVars.lastSavedFingerprint = appCalls.currentFingerprint();
        appVars.lastSavedEditorFingerprint = appCalls.openEditorFingerprint();
        appVars.dirty = false;
        appCalls.updateDirty();
        clearTimeout(appVars.autosaveTimer);
        appCalls.writeAutosave();
        appCalls.log(`${a.download} を ダウンロードしはじめました。このパソコンに のこした 作品も そのままです`, 'ok');
        appCalls.setStatus(unfinished?'書きかけの ある 作品を ファイルに ほぞんしたよ。動かす 前に、まだ できて いない ところを たしかめてね':`「${appVars.project.name}」を ファイルに ほぞんしたよ`);
        return true;
      } catch (err) {
        appCalls.log(`${err.code || ''} ほぞん できませんでした: ${err.message}`, 'error');
        appCalls.setStatus('ファイルに ほぞん できなかったよ。作品は この 画面に のこって いるよ。もう一度「保存」を おしてね');
        return false;
      }
    }
    async function openProject(file, approval = null) {
      if (appVars.tutorial) return;
      if (appCalls.modelLocked()) return;
      const observed = appCalls.currentOpenState();
      if (approval?.fingerprint !== observed.fingerprint && !(await appCalls.askLose(observed))) return;
      if (appVars.tutorial || appCalls.modelLocked()) return;
      let previous = null;
      appCalls.dropHistoryTimer();
      clearTimeout(appVars.autosaveTimer);
      appVars.recoveryEpoch++;
      appVars.appState = 'IMPORTING';
      appCalls.updateRunState();
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
        previous = { current: appCalls.snapshot(), history: appVars.history.slice(), redo: appVars.redo.slice(), initialSnapshot: appVars.initialSnapshot,
          lastSavedFingerprint: appVars.lastSavedFingerprint, lastSavedEditorFingerprint: appVars.lastSavedEditorFingerprint };
        appCalls.closeEditingModals();
        appCalls.clearCallable();
        appCalls.disposeRuntime();
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
        appCalls.hideSourceOverview();
        appRedraw.all();
        appCalls.loadEditor();
        appCalls.resetHistory();
        if(loaded.editorState){appCalls.restoreEditorState(loaded.editorState);appVars.initialSnapshot=appCalls.snapshot();appVars.history=[appVars.initialSnapshot];appVars.redo=[];appVars.lastObservedFingerprint=appCalls.stateFingerprintCore();}
        appVars.lastSavedEditorFingerprint = appCalls.openEditorFingerprint();
        appVars.appState = 'IMPORTING';
        appCalls.updateRunState();
        await appCalls.clearAutosave();
        previous = null;
        const diagnostics = loaded.diagnostics || [];
        appCalls.log(
          diagnostics.length
            ? `作品を開きました。コードの ${diagnostics.length}か所に まちがいが あります。`
            : '作品を開きました',
          diagnostics.length ? 'error' : 'ok',
        );
        // Opening always gives an answer on the screen: the work's name, and how many places need fixing.
        appCalls.setStatus(`「${appVars.project.name}」を 開いたよ` + (diagnostics.length ? `。直す ところが ${diagnostics.length}か所 あるよ` : ''));
      } catch (err) {
        if (previous) {
          appVars.history = previous.history;
          appVars.redo = previous.redo;
          appVars.initialSnapshot = previous.initialSnapshot;
          appVars.lastSavedFingerprint = previous.lastSavedFingerprint;
          appVars.lastSavedEditorFingerprint = previous.lastSavedEditorFingerprint;
          appCalls.restoreSnap(previous.current, { restoreView: true });
        }
        appCalls.log(`${err.code || ''} 読みこめませんでした: ${err.message}`, 'error');
        // The person chose not to open it with the newer extension: nothing to explain.
        if (!err?.declined) appCalls.showOpenRefusal(err);
      } finally {
        appVars.appState = 'DESIGN';
        appRedraw.all();
        if (appVars.dirty || appCalls.hasCallableDraft() || appCalls.hasPendingEditor()) appCalls.scheduleAutosave();
      }
    }
    function addData() {
      if (appCalls.modelLocked()) return;
      const before = cloneDesignProject(appVars.project);
      let field=appCalls.$('#dataName');
      appCalls.clearDataFormError();
      try {
        const scope = appCalls.$('#dataScope').value,
          kind = appCalls.$('#dataKind').value,
          name = normalizeCharsOutsideString(appCalls.$('#dataName').value.trim());
        validateName(name);
        const target =
          scope === 'project' ? before.projectData : before.components.find(c=>c.id===appVars.selectedId)?.localData;
        if (!target) throw new Error('部品ごとの へんすう・リストを 作る 部品を えらんで ください');
        if ([...target.variables, ...target.lists].some((x) => x.name === name))
          throw new Error('同じ 名前の へんすう・リストが あります。ちがう 名前に して ください');
        field=kind==='list'&&appCalls.$('#dataListMode').value==='lines'?appCalls.$('#dataItems'):appCalls.$('#dataInitial');
        const initial = parseDataFormInitial(field.value, kind,{mode:appCalls.$('#dataListMode').value,expectedUnit:kind==='variable'?appCalls.$('#dataUnit').value||null:null}),
          arr = kind === 'variable' ? target.variables : target.lists;
        arr.push({
          id: appCalls.ensureUniqueId(kind === 'variable' ? 'var' : 'list'),
          name,
          initialValue: initial,
          ...(kind === 'variable' && appCalls.$('#dataUnit').value ? { expectedUnit: appCalls.$('#dataUnit').value } : {}),
        });
        validateProject(before);
        appVars.project=before;
        appCalls.markDirty();
        appRedraw.dataModal();
        appRedraw.editor();
        appCalls.$('#dataName').value = '';
      } catch (err) {
        appCalls.showDataFormError(err,field);
      }
    }
    function confirmCallableDiscard() {
      if (!appCalls.flushActiveEditor()) return false;
      if (!appCalls.hasCallableDraft()) return true;
      if (!confirm('自分で作ったブロックに、まだ 決めていない なおしが あるよ。なおしを すてて つづける？'))
        return false;
      appCalls.dropHistoryTimer();
      appCalls.pushHistoryNow();
      if (appVars.callableLoadedKey) appCalls.loadCallable(appVars.callableLoadedKey);
      else appCalls.clearCallable(appVars.callableDraftCore.type);
      appCalls.markDirty();
      appCalls.pushHistoryNow();
      return true;
    }
    function updateCallableHeader() {
      if (appVars.syncingDraft) return;
      if (!appCalls.syncCallableDraft()) return;
      // A code error still renders the draft's toggle, so ブロック turns pale and its press says why (as in the main editor).
      if (appVars.draftEditor.session?.mode !== 'blocks' && !appCalls.saveCodeBinding(appVars.draftEditor)) {
        if (appVars.draftEditor.view) appRedraw.editorBinding(appVars.draftEditor);
        return;
      }
      appRedraw.callable();
      if (appVars.draftEditor.view) {
        appRedraw.editorBinding(appVars.draftEditor);
        if (appVars.draftEditor.session?.mode === 'code') appRedraw.callableHints();
      }
    }
    function formatCallable() {
      if (appCalls.modelLocked() || !appCalls.flushActiveEditor()) return;
      try {
        const s = appCalls.getEditorSession(appVars.draftEditor);
        if (!s.syntaxAst) throw new Error('書き方の まちがいを 直してから 整えて ください');
        const source = formatScript(s.syntaxAst);
        appCalls.commitSource(appVars.draftEditor, source, { atomic: true });
        appVars.draftEditor.textarea.value = source;
        appRedraw.editorBinding(appVars.draftEditor);
      } catch (error) {
        appCalls.showEditorFailure(appVars.draftEditor, error);
      }
    }

    function saveCallable() {
      if (appCalls.modelLocked() || !appCalls.flushActiveEditor()) return;
      try {
        const d = appCalls.readCallableDraft();
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
        const id = d.editId || appCalls.ensureUniqueId(d.type);
        (d.type === 'action' ? next.actions : next.functions).push({
          id,
          ownerId: d.ownerId,
          name: d.name,
          args: d.args,
          ...(d.callPhrase ? {callPhrase: d.callPhrase} : {}),
          source: d.source,
        });
        validateDesignProject(next);
        appCalls.dropHistoryTimer();
        appCalls.pushHistoryNow();
        appVars.project = next;
        appCalls.invalidateEditors();
        appCalls.loadCallable(`${d.type}:${id}`);
        appRedraw.callableOptions(appVars.callableLoadedKey);
        appCalls.markDirty();
        appCalls.pushHistoryNow();
        appRedraw.editor();
        appCalls.log(`${d.type === 'action' ? 'てじゅん' : '答えを もとめる'}「${d.name}」を 決めました`, 'ok');
      } catch (error) {
        appCalls.showEditorFailure(appVars.draftEditor, error);
      }
    }
    function deleteCallable() {
      if (appCalls.modelLocked() || !appCalls.flushActiveEditor()) return;
      const id = appVars.callableDraftCore.editId,
        d = [...appVars.project.actions, ...appVars.project.functions].find((x) => x.id === id);
      if (!d) return;
      const kind = appVars.project.actions.some(x => x.id === id) ? 'action' : 'function';
      if (!appCalls.allowResourceDelete(`${kind}:${id}`, appCalls.$('#procModal .dialog-body'))) return;
      if (!confirm(`「${d.name}」を けす？`)) return;
      appCalls.dropHistoryTimer();
      appCalls.pushHistoryNow();
      appVars.project.actions = appVars.project.actions.filter((x) => x.id !== id);
      appVars.project.functions = appVars.project.functions.filter((x) => x.id !== id);
      appCalls.clearCallable();
      appCalls.invalidateEditors();
      appRedraw.callableList();
      appCalls.markDirty();
      appCalls.pushHistoryNow();
      appRedraw.editor();
    }
    function addBackdrop() {
      if (appCalls.modelLocked()) return;
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
          id: appCalls.ensureUniqueId('backdrop'),
          name,
          kind: 'color',
          value: val.toLowerCase(),
        });
        appVars.project.stage.backdropId = appVars.project.stage.backdrops[appVars.project.stage.backdrops.length - 1].id;
        validateDesignProject(appVars.project);
        appCalls.markDirty();
        appRedraw.appearance();
        appRedraw.all();
      } catch (e) {
        appCalls.rollbackDesign(before);
        appCalls.log(`${e.code || ''} ${e.message}`, 'error');
      }
    }
    function addCostume() {
      if (appCalls.modelLocked()) return;
      const before = cloneDesignProject(appVars.project);
      try {
        const c = appCalls.componentById(appVars.selectedId);
        if (c?.type !== 'sprite') throw new Error('文字の すがたを 入れる キャラクターを えらんで ください');
        if (c.costumes.length >= LIMITS.costumesPerSprite)
          throw new AkariError('F504', 'すがたが いっぱいで、もう ふやせません。いらない すがたを けして ください');
        const name = appCalls.$('#costumeName').value.trim(),
          val = appCalls.$('#costumeText').value;
        validateResourceName(name, 'すがたの名前');
        if (c.costumes.some((x) => x.name === name))
          throw new AkariError('F503', '同じ すがたの 名前が あります。ちがう 名前に して ください');
        c.costumes.push({ id: appCalls.ensureUniqueId('costume'), name, kind: 'text', value: val });
        c.costumeId = c.costumes[c.costumes.length - 1].id;
        validateDesignProject(appVars.project);
        appCalls.markDirty();
        appRedraw.appearance();
        appRedraw.all();
      } catch (e) {
        appCalls.rollbackDesign(before);
        appCalls.log(`${e.code || ''} ${e.message}`, 'error');
      }
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
        let name = appCalls.fileStemCandidate(file, names);
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
          asset = await makeAssetBlob(appCalls.ensureUniqueId('asset'), 'image', canonical);
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
        const id = appCalls.ensureUniqueId('sprite'),
          costumeId = appCalls.ensureUniqueId('costume'),
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
        appCalls.finishAssetCommit(next, store, `絵「${name}」を キャラクターにして おいたよ`);
      }, onError);
    }
    async function importBackdropImage(file) {
      if (!file) return;
      return appCalls.runAssetImport('はいけいの 絵', async () => {
        if (file.size > LIMITS.importFileBytes)
          throw new AkariError('F504', 'えらんだ ファイルが 大きすぎて 使えません。もっと 小さい ファイルに して ください', 0, 0, `入れられるファイルは${LIMITS.importFileBytes / 1048576}MiBまで`);
        const canonical = await canonicalizeImage(new Uint8Array(await file.arrayBuffer())),
          names = new Set(appVars.project.stage.backdrops.map((x) => x.name)),
          candidate = appCalls.fileStemCandidate(file, names),
          name = prompt('はいけいの名前', candidate);
        if (name === null) return;
        validateResourceName(name, 'はいけいの名前');
        if (names.has(name)) throw new AkariError('F503', '同じ はいけいの名前が あります。ちがう名前に して ください');
        const next = cloneDesignProject(appVars.project),
          store = new AssetStore(appVars.assetStore.snapshotRefs()),
          digest = await sha256(canonical.bytes);
        let asset = store.findByDigest('image', digest, canonical.bytes.length, canonical.bytes);
        if (!asset) {
          asset = await makeAssetBlob(appCalls.ensureUniqueId('asset'), 'image', canonical);
          store.addImmutable(asset);
        }
        const b = {
          id: appCalls.ensureUniqueId('backdrop'),
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
        appCalls.finishAssetCommit(next, store, `はいけいの 絵「${name}」を 入れたよ`);
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
          candidate = appCalls.fileStemCandidate(file, names),
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
          asset = await makeAssetBlob(appCalls.ensureUniqueId('asset'), 'image', canonical);
          store.addImmutable(asset);
        }
        const co = { id: appCalls.ensureUniqueId('costume'), name, kind: 'image', assetId: asset.id };
        target.costumes.push(co);
        target.costumeId = co.id;
        validateAssetReferences(next, store);
        serializeProject(next, store);
        appCalls.finishAssetCommit(next, store, `すがたの 絵「${name}」を 入れたよ`);
      });
    }
    async function importSoundFile(file) {
      if (!file) return;
      return appCalls.runAssetImport('音', async () => {
        if (file.size > LIMITS.importFileBytes)
          throw new AkariError('F504', 'えらんだ ファイルが 大きすぎて 使えません。もっと 小さい ファイルに して ください', 0, 0, `入れられるファイルは${LIMITS.importFileBytes / 1048576}MiBまで`);
        const canonical = await canonicalizeAudio(new Uint8Array(await file.arrayBuffer())),
          names = new Set(appVars.project.sounds.map((x) => x.name)),
          candidate = appCalls.fileStemCandidate(file, names),
          name = prompt('音の名前', candidate);
        if (name === null) return;
        validateResourceName(name, '音の名前');
        if (names.has(name)) throw new AkariError('F503', '同じ 音の名前が あります。ちがう名前に して ください');
        const next = cloneDesignProject(appVars.project),
          store = new AssetStore(appVars.assetStore.snapshotRefs()),
          digest = await sha256(canonical.bytes);
        let asset = store.findByDigest('audio', digest, canonical.bytes.length, canonical.bytes);
        if (!asset) {
          asset = await makeAssetBlob(appCalls.ensureUniqueId('asset'), 'audio', canonical);
          store.addImmutable(asset);
        }
        next.sounds.push({ id: appCalls.ensureUniqueId('sound'), name, assetId: asset.id });
        validateAssetReferences(next, store);
        serializeProject(next, store);
        appCalls.finishAssetCommit(next, store, `音「${name}」を 入れたよ`);
      });
    }
    async function startProject() {
      if(appVars.tutorial||appCalls.modelLocked())return;
      if(!(await appCalls.askLose())||appVars.tutorial||appCalls.modelLocked())return;
      // A new work starts in はじめて, which shows blocks.
      appVars.baseUiLevel='entry';appVars.editorModes.set('script','blocks');
      try{localStorage.setItem(STORAGE_KEYS.uiLevel,'entry');localStorage.setItem(STORAGE_KEYS.editorMode,'blocks');}catch(_){}
      appCalls.replaceCurrentProject(makeEmptyProject(),makeDefaultAssetStore(),'sprite-1','start','からっぽの 作品だよ。動かすものと きっかけを えらんで、やることを 入れてね');
      appCalls.applyUiLevel();appRedraw.hints();appRedraw.entrySurface();appRedraw.editorBinding(appVars.mainEditor);
    }
    Object.assign(appCalls, {
      addBackdrop,
      addCostume,
      addData,
      beginTutorial,
      colorSetting,
      confirmCallableDiscard,
      deleteCallable,
      deleteSelectedComponent,
      downloadProject,
      duplicateSelectedComponent,
      exportProject,
      formatCallable,
      formatCurrent,
      importBackdropImage,
      importCostumeImage,
      importImageObject,
      importSoundFile,
      insertHint,
      installColorPicker,
      installEditorShell,
      openMeijinProcedure,
      openProject,
      openQuotedListRepair,
      openRuntimeInspector,
      operateBlock,
      propRow,
      redoDo,
      renameMeijinProcedure,
      requestOpenProject,
      saveCallable,
      saveEditor,
      saveProject,
      selectEntryEvent,
      selectTutorialInsertion,
      showFullValue,
      startDrag,
      startMeijin,
      startProject,
      startResize,
      startRun,
      tutorialCapture,
      tutorialChoose,
      undo,
      updateCallableHeader,
      verifyTutorialSave,
    });
  }
