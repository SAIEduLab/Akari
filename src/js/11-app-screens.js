  // ────────────────────────────────────────────────────────────────────────
  // 11 — Application screens: shell, entry surface, tutorial presentation, callable editor, pickers and dialogs
  // ────────────────────────────────────────────────────────────────────────
  // Called once at the start of initApp: appVars is the state it shares, appCalls the functions other parts call.
  function createAppScreens(appVars, appCalls) {
    const $ = (s) => document.querySelector(s),
      $$ = (s) => [...document.querySelectorAll(s)];
    // The view a body list shows: the chosen view, and code in a work with a 名人 text.
    const chosenEditorMode=(kind='script',fallback='code')=>appCalls.workIsMeijin()?'code':appVars.editorModes.get(kind)||fallback;
    // The view the main editor shows (the list of all bodies uses the remembered view).
    const shownEditorMode=()=>(!appVars.sourceOverviewOpen&&appVars.mainEditor.session?.mode)||chosenEditorMode('script','blocks');
    function emptyProjectStatus() {
      if (appCalls.workIsMeijin()) return 'からっぽの 作品だよ。本文を 書いてね。';
      if (document.body.dataset.uiLevel === 'entry') return 'からっぽの 作品だよ。ブロックを 入れてね。「いっしょに作る」でも はじめられるよ。';
      return `からっぽの 作品だよ。${shownEditorMode() === 'blocks' ? 'ブロックを 入れるか' : '本文を 書くか'}、「お手本を開く」で ためしてね`;
    }
    function uiLevelChoices(view=shownEditorMode()){return appCalls.workIsMeijin()?['meijin']:view==='blocks'?['entry','basic','advanced']:['basic','advanced','meijin'];}
    // shown: the view the editor has just been laid out in (syncEditorShell). Returns true when the shown level changed.
    function applyUiLevel(shown=null){
      const meijin=appCalls.workIsMeijin(),before=document.body.dataset.uiLevel;
      // はじめて is a block level: a view laid out in code (a body the blocks cannot show, or 名人 text that went away) goes
      // on at かんたん. The view is never changed by a level.
      if(!meijin&&appVars.baseUiLevel==='entry'&&shown==='code')appVars.baseUiLevel='basic';
      document.body.dataset.meijinLevel=meijin?'on':'off';
      document.body.dataset.uiLevel=meijin?'advanced':appVars.baseUiLevel;
      const select=$('#uiLevel'),choices=uiLevelChoices(shown||shownEditorMode()),value=meijin?'meijin':appVars.baseUiLevel;
      if([...select.options].map(o=>o.value).join()!==choices.join())
        select.replaceChildren(...choices.map(level=>{const option=document.createElement('option');option.value=level;option.textContent=appVars.UI_LEVEL_NAMES[level];return option;}));
      select.value=value;
      const initialHint=emptyProjectStatus();
      if(appVars.el.status.textContent.startsWith('からっぽの 作品だよ。') && appVars.el.status.textContent!==initialHint)appCalls.setStatus(initialHint);
      // The コード／ブロック toggle is shown at every level: where it cannot switch (はじめて, a 名人 work) a press says why.
      if(appVars.mainEditor.session)paintBindingModeToggle(appVars.mainEditor);
      return before!==undefined&&before!==document.body.dataset.uiLevel;
    }
    function renderEntrySurface() {
      const entry=document.body.dataset.uiLevel==='entry';
      // はじめて puts the place of ⏸ いったん止める／▶ つづける
      // (final call 21; the two take turns in it) under the stage, as on a video.
      for(const node of [$('#runPauseSlot')]){
        if(entry&&!appVars.entryLayoutPlaced){const marker=document.createComment('entry control home');node.before(marker);appVars.entryControlHomes.set(node,marker);}
        if(entry&&node.id==='runPauseSlot'){if(node.parentElement!==$('#entryRunControls'))$('#entryRunControls').append(node);}
        else if(appVars.entryLayoutPlaced){const marker=appVars.entryControlHomes.get(node);if(marker?.isConnected){marker.after(node);marker.remove();}appVars.entryControlHomes.delete(node);}
      }
      const main=$('.main'),side=$('.side'),designer=$('#designerWindow'),objects=$('.objects-window');
      if(entry){if(designer.parentElement!==main)main.insertBefore(designer,side);if(objects&&side.firstElementChild!==objects)side.prepend(objects);}
      else if(appVars.entryLayoutPlaced&&document.body.dataset.editorMode==='blocks'){side.prepend(designer);side.insertBefore(objects,$('.properties-window'));}
      appVars.entryLayoutPlaced=entry;
      // The click button names what is chosen: 「たくどん」が おされたとき, 画面が おされたとき.
      const clickLabel=(appVars.selectedId==='stage'?'画面':'「'+(appCalls.targetById(appVars.selectedId)?.name||'')+'」')+'が おされた とき';
      if($('#entryClickEvent').textContent!==clickLabel)$('#entryClickEvent').textContent=clickLabel;
      for(const [id,event] of [['entryStartEvent','start'],['entryClickEvent','click']]) {
        $('#'+id).disabled=appCalls.modelLocked()||!appCalls.eventsFor(appVars.selectedId).includes(event);
        $('#'+id).setAttribute('aria-pressed',String(appVars.currentEvent===event));
      }
      // What はじめて keeps but does not show: blocks and rules it has not in this body, and every body of another event
      // (keys, signals, ふれたとき …), which only the two buttons above could open. The holes of a block being put in
      // (〔くり返すことを入れる〕) are not such blocks.
      const tree=appVars.mainEditor.session?.blockView;
      const outside=(tree&&[...buildBlockIndex(tree).values()].some(({node})=>!String(node.schemaId).startsWith('Hole:')&&
        ['statement','rule'].includes(BLOCK_SCHEMA_BY_ID.get(node.schemaId)?.category)&&!ENTRY_BLOCK_SCHEMA_IDS.has(node.schemaId)))||
        (appVars.project?.scripts||[]).some(s=>!['start','click'].includes(s.event)&&!isMeijinScript(s)&&String(s.source||'').trim());
      $('#entryOutside').hidden=!entry||!outside||!!appVars.tutorial;
      appVars.placeHistoryButtons();
    }
    function tutorialLiteral(node) { return node?.schemaId==='QuantityLiteral'?tutorialLiteral(node.inputs.value):node; }
    function tutorialOperationAllowed(binding,operation) {
      if(!appVars.tutorial)return true;if(binding!==appVars.mainEditor||appVars.selectedId!==appVars.tutorial.target||appVars.currentEvent!=='click')return false;
      const step=tutorialStep(appVars.tutorial);if(!step)return false;
      if(step.block){const loc=tutorialDestination(appVars.mainEditor.session.blockView,step);
        if(!tutorialInsertionReady(step))return false;
        return operation.type==='insert'&&operation.parentId===loc?.parentId&&operation.body===loc.body&&operation.index===loc.index
          &&JSON.stringify(tutorialNodeShape(operation.node))===JSON.stringify(tutorialNodeShape(tutorialCandidate(step.block,appVars.project)));}
      if(step.ref&&step.action!=='undo'){const role=tutorialField(appVars.mainEditor.session.blockView,step);
        if(operation.type!=='field'||operation.id!==role?.node?.id||operation.key!==role.key)return false;
        return step.input.type==='number'?typeof operation.value==='number'&&Number.isFinite(operation.value)&&operation.value>=step.input.min&&operation.value<=step.input.max&&(!step.integer||Number.isInteger(operation.value))
          :typeof operation.value==='string'&&cpLen(operation.value)<=100;}
      return false;
    }
    function tutorialInsertionReady(step=tutorialStep(appVars.tutorial)) {
      const loc=step?.block&&tutorialDestination(appVars.mainEditor.session?.blockView,step);
      return !!loc&&appVars.tutorialInsertion?.step===step.id&&appVars.tutorialInsertion.epoch===appVars.tutorial.epoch
        &&appVars.tutorialInsertion.parentId===loc.parentId&&appVars.tutorialInsertion.body===loc.body&&appVars.tutorialInsertion.index===loc.index;
    }
    function selectTutorialInsertion(location) {
      const step=tutorialStep(appVars.tutorial),expected=step?.block&&tutorialDestination(appVars.mainEditor.session?.blockView,step);
      if(!expected||location.parentId!==expected.parentId||location.body!==expected.body||location.index!==expected.index)return;
      appVars.tutorialInsertion={...location,step:step.id,epoch:appVars.tutorial.epoch};
      refreshTutorialPresentation();focusTutorialTarget();
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
    // A message above the editor changes its height; the guided place stays in view.
    function keepTutorialTargetInView() {
      if(!appVars.tutorial)return;
      requestAnimationFrame(()=>tutorialFocusTargets()[0]?.scrollIntoView({block:'nearest',inline:'nearest'}));
    }
    function focusTutorialTarget() {
      const target=tutorialFocusTargets()[0];if(!target)return;
      target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',inline:'nearest'});
    }
    function clearTutorialPresentation() {
      delete document.body.dataset.tutorialStep;
      $$('.tutorial-target').forEach(n=>n.classList.remove('tutorial-target'));
      $$('[data-tutorial-blocked]').forEach(n=>{
        if(n.dataset.tutorialAria!==undefined){n.dataset.tutorialAria==='none'?n.removeAttribute('aria-disabled'):n.setAttribute('aria-disabled',n.dataset.tutorialAria);delete n.dataset.tutorialAria;}
        delete n.dataset.tutorialBlocked;
      });
    }
    function tutorialCollectRuntime() {
      if(!appVars.tutorial||!appVars.tutorialTrace||appVars.tutorialTrace.epoch!==appVars.tutorial.epoch||!appVars.runtime||!appVars.scheduler)return;
      const trace=appVars.tutorialTrace,actor=appVars.runtime.actor(appVars.tutorial.target);if(!actor)return;
      const active=[...appVars.scheduler.tasks.values()].some(t=>t.runtimeId===appVars.tutorial.target&&!['DONE','CANCELLED','ERROR'].includes(t.state));
      if(trace.busy&&trace.sawTask&&!active&&!trace.failed){trace.busy=false;trace.sawTask=false;
        trace.observations.push({x:actor.x,y:actor.y,score:appVars.runtime.projectVars.get('点数'),direction:actor.direction,scale:actor.scalePercent,costume:actor.costumeId});}
      if(trace.busy||trace.failed||trace.observations.length!==trace.requiredClicks)return;
      const moving=trace.statements.some(s=>s.kind==='MotionCommand'&&s.op==='GOTO');
      if(moving&&(trace.speech||[]).includes(appVars.tutorial.values?.['speech-text']??'つかまった！')){trace.complete=true;appCalls.confirmTutorialOperation('runtime:click');}
    }
    function renderTutorialChoices(step) {
      const box=$('#tutorialChoices'),visible=step.action==='choice';box.hidden=!visible;$('#tutorialFinish').hidden=!visible;
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
      if(step?.block)$('#tutorialText').textContent=tutorialInsertionReady(step)
        ?'左の 青い わくの「'+TUTORIAL_BLOCKS[step.block].label+'」を えらぼう。'
        :holeOnly?'青い わくの「することを えらぶ」を おして みよう。':'青い わくの「＋ ここに入れる」を おして みよう。';
        $$('.tutorial-target').forEach(n=>n.classList.remove('tutorial-target'));
        for(const n of $$('button,input,select,textarea,summary,[tabindex]')) {
          const allowed=tutorialElementAllowed(n);n.dataset.tutorialBlocked=String(!allowed);
          if(n.matches('button,input,select,textarea,summary')){
            if(n.dataset.tutorialAria===undefined)n.dataset.tutorialAria=n.getAttribute('aria-disabled')??'none';
            if(!allowed)n.setAttribute('aria-disabled','true');else n.dataset.tutorialAria==='none'?n.removeAttribute('aria-disabled'):n.setAttribute('aria-disabled',n.dataset.tutorialAria);
          }
          if(allowed&&!['tutorialExit','stopBtn','pauseBtn','continueBtn'].includes(n.id))n.classList.add('tutorial-target');
        }
    }
    function finishTutorial(completed=false) {
      if (!appVars.tutorial) return;
      const saved=appVars.tutorial;
      tutorialCollectRuntime();appVars.tutorial=null;appVars.tutorialInsertion=null;appVars.tutorialNotice=null;++appVars.tutorialEpoch;
      clearInterval(appVars.tutorialTimer);appVars.tutorialTimer=null;
      if(appVars.runtime||appVars.scheduler||appVars.appState==='PREPARING')stopRun();
      appVars.activeDragCleanup?.();appVars.mainEditor.view.releaseInteraction();
      if(!completed){
        let index=saved.index;
        const step=tutorialSequence(saved)[index];
        if(step?.id.startsWith('try-')||step?.id.startsWith('stop-'))index=tutorialSequence(saved).findIndex(s=>s.id==='run-'+step.id.split('-').slice(1).join('-'));
        appVars.pausedTutorial={...saved,index,trace:appVars.tutorialTrace?cloneDesignProject(appVars.tutorialTrace):null,fingerprint:appCalls.currentFingerprint(),editorFingerprint:appCalls.openEditorFingerprint()};
      }else appVars.pausedTutorial=null;
      appVars.tutorialTrace=null;appVars.tutorialSave=null;clearTutorialPresentation();$('#tutorialGuide').hidden=true;
      if(appVars.mainEditor.session?.pendingEdit){const field=appVars.mainEditor.session.pendingEdit;const control=$$('[data-blockui-field]').find(n=>n.dataset.blockId===field.id&&n.dataset.blockuiField===field.field);control?.focus({preventScroll:true});}
      else $('#tutorialStart').focus({preventScroll:true});
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
          const targets=tutorialFocusTargets(),at=targets.indexOf(document.activeElement);
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
      if(event.type==='focusin') { if(!tutorialElementAllowed(target))focusTutorialTarget();return; }
      let allowed=tutorialElementAllowed(target);
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
        if(target===appVars.el.obj||target===appVars.el.event)renderSelectors();
        else if(target===$('#uiLevel'))target.value=document.body.dataset.uiLevel;
        else if(target===appVars.el.projectName)target.value=appVars.project.name;
      }
    }
    function draftOwner() {
      return appVars.callableDraftCore.editId
        ? `${appVars.callableDraftCore.type}:${appVars.callableDraftCore.editId}`
        : `${appVars.callableDraftCore.type}:draft-${appVars.editorDraftSerial}`;
    }
    function renderEditorBinding(binding) {
      const session = appCalls.getEditorSession(binding),
        draft = binding.kind === 'draft',
        blocks = session.mode === 'blocks';
      session.notices = bodyNotices(session);
      if (!draft) syncEditorShell(appVars.sourceOverviewOpen ? chosenEditorMode() : session.mode);
      const textRoot = draft ? binding.textarea : appVars.el.editor.closest('.editor-shell');
      textRoot.hidden = blocks;
      $(draft ? '#callableBlocks' : '#blockEditor').hidden = !blocks;
      const hint = draft
        ? $('#callableHints').closest('.hint-panel')
        : $('.code-assist .hint-panel');
      hint.hidden = blocks;
      // The note that offers rewrites comes right after the code in the code view, on the screen (above the line under the
      // code) and in the Tab order; in the block view it stays above the workspace.
      const pendingNote = $(draft ? '#callablePending' : '#editorPending'), workspace = $(draft ? '#callableBlocks' : '#sourceImport');
      if (blocks ? pendingNote.nextElementSibling !== workspace : pendingNote.previousElementSibling !== textRoot)
        blocks ? workspace.before(pendingNote) : textRoot.after(pendingNote);
      const invalidCodePending = session.pendingEdit?.kind === 'code' && !session.blockDraft;
      paintBindingModeToggle(binding);
      if (!draft) {
        // いつ動く？ opens the block view as well, so a code error makes it pale in the same way; a press says why under
        // it (headingBlockedNote) instead of doing nothing.
        const heading = $('#sourceHeadingBtn');
        if (!session.syntaxAst || invalidCodePending) {
          heading.setAttribute('aria-disabled', 'true');
          heading.setAttribute('aria-describedby', headingBlockedNote().id);
        } else {
          heading.removeAttribute('aria-disabled');
          heading.removeAttribute('aria-describedby');
          headingBlockedNote().hidden = true;
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
        const line = $('#callableIssue'), first = !blocks && $('#callablePending').hidden ? session.notices[0] : null;
        line.hidden = !first;
        line.textContent = first ? 'ⓘ ' + (first.line || 1) + '行目：' + appCalls.sentence(first.message) + (session.notices.length > 1 ? `ほかにも 知らせが ${session.notices.length - 1}つ あります。` : '') : '';
      }
    }
    function modeRefusal(binding, shown, codeError = false) {
      if (appVars.appState === 'IMPORTING') return 'busy';
      if (binding === appVars.mainEditor && shown === 'blocks' && document.body.dataset.uiLevel === 'entry') return 'entry';
      if (appCalls.workIsMeijin()) return 'meijin';
      return shown === 'code' && codeError ? 'error' : null;
    }
    // The toggle of an editor as it is now: the list of all bodies shows the chosen view. A code error does not change the
    // toggle's look (so it does not flicker while the child types): a press only shows the note.
    function paintBindingModeToggle(binding) {
      const session = binding.session;
      if (!session) return;
      if (binding === appVars.mainEditor && appVars.sourceOverviewOpen) { const shown = chosenEditorMode(); paintModeToggle(binding, shown, modeRefusal(binding, shown)); return; }
      const codeError = !session.syntaxAst || (session.pendingEdit?.kind === 'code' && !session.blockDraft);
      paintModeToggle(binding, session.mode, modeRefusal(binding, session.mode, codeError));
    }
    function paintModeToggle(binding, shown, refusal) {
      const prefix = binding.kind === 'draft' ? 'callable' : 'editor', note = modeBlockedNote(binding);
      for (const mode of ['code', 'blocks']) {
        const b = $(`#${prefix}Mode${mode}`), here = mode !== shown, label = appVars.VIEW_NAMES[shown] + ' ⇄';
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
    // The same note under いつ動く？ in the row above the body.
    function headingBlockedNote() {
      let note = document.getElementById('headingBlockedNote');
      if (!note) {
        note = document.createElement('p');
        note.id = 'headingBlockedNote';
        note.className = 'mode-blocked-note';
        note.setAttribute('role', 'status');
        note.hidden = true;
        note.textContent = 'コードの 赤い ところを 直すと、ブロックに もどれるよ';
        $('#sourceHeadingBtn').after(note);
      }
      return note;
    }
    function showModeBlockedNote(binding) { showBlockedNote(modeBlockedNote(binding)); }
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
    function renderCallableOptions(prefer = '') {
      const sel = $('#callableSelect');
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
    function showMeijinProcedure(id) {
      const d = meijinProjectDefinitions(appVars.project).find(x => x.id === id);
      if (!d) { hideMeijinProcedure(); return false; }
      appVars.meijinProcedureId = id;
      $('#procModal .proc-edit').classList.add('meijin-proc');
      $('#meijinProcPanel').hidden = false;
      $('#meijinProcTitle').textContent = `てじゅん「${d.name}」／` + (d.args.length ? `入れるもの（${d.args.join('、')}）／` : '') + `名人の本文の ${d.headLine}行目`;
      $('#meijinProcBody').textContent = d.source;
      $('#meijinProcName').value = d.name;
      $('#meijinProcError').hidden = true;
      $('#callableSelect').value = 'meijin:' + id;
      for (const button of ['#callableDelete', '#callableSave', '#callableFormat']) $(button).disabled = true;
      $('#meijinProcRename').disabled = appCalls.modelLocked();
      return true;
    }
    function hideMeijinProcedure() {
      if (!appVars.meijinProcedureId) return;
      appVars.meijinProcedureId = '';
      $('#procModal .proc-edit').classList.remove('meijin-proc');
      $('#meijinProcPanel').hidden = true;
      $('#callableSave').disabled = $('#callableFormat').disabled = false;
    }
    function paintCallable() {
      appVars.syncingDraft = true;
      try {
        const d = appVars.callableDraftCore;
        $('#callableSelect').value = d.loadedKey;
        $('#callableType').value = d.type;
        $('#callableName').value = d.name;
        $('#callableArgs').value = d.argsText;
        $('#callablePhrase').value = d.callPhrase || '';
        $('#callablePhraseRow').hidden = $('#callablePhraseHelp').hidden = d.type !== 'action';
        $('#callableEditingId').value = d.editId;
        if (
          !appVars.draftEditor.session?.pendingEdit &&
          !appVars.composingEditors.has(appVars.draftEditor.textarea) &&
          appVars.draftEditor.textarea.value !== d.source.replace(/\r\n?/g, '\n')
        )
          appVars.draftEditor.textarea.value = d.source;
        $('#callableHeader').textContent =
          `${d.type === 'action' ? 'てじゅん' : '答えを もとめる'}「${d.name || '名前'}」／入れるもの（${d.argsText}）／本文${hasCallableDraft() ? ' （まだ ほぞんして いない）' : ''}`;
        $('#callableDelete').disabled = appCalls.modelLocked() || !d.editId;
      } finally {
        appVars.syncingDraft = false;
      }
    }
    function syncCallableDraft() {
      if (appVars.syncingDraft || appCalls.modelLocked()) return true;
      if (
        [$('#callableName'), $('#callableArgs'), $('#callablePhrase'), $('#callableType')].some((t) =>
          appVars.composingEditors.has(t),
        )
      ) {
        appVars.headerPending = { ownerKey: draftOwner(), composing: true };
        return appCalls.showEditorFailure(appVars.draftEditor, '日本語の 入力を Enterキーで きめてから つづけて ください');
      }
      const next = {
        ...appVars.callableDraftCore,
        type: $('#callableType').value,
        name: $('#callableName').value,
        argsText: $('#callableArgs').value,
      };
      const phrase = $('#callablePhrase').value;
      if (next.type === 'action' && phrase) next.callPhrase = phrase;
      else delete next.callPhrase;
      if (
        JSON.stringify(next) !== JSON.stringify(appVars.callableDraftCore) &&
        appVars.draftEditor.session?.mode === 'blocks' &&
        appVars.draftEditor.session.pendingEdit
      ) {
        const ready = appVars.draftEditor.view.flush();
        if (!ready.ok) {
          for (const [id, key] of [
            ['#callableType', 'type'],
            ['#callableName', 'name'],
            ['#callableArgs', 'argsText'],
            ['#callablePhrase', 'callPhrase'],
          ])
            $(id).value = appVars.callableDraftCore[key] || '';
          return appCalls.showEditorFailure(
            appVars.draftEditor,
            ready.reason || '本文の 入力を 決めるか、やめて ください',
          );
        }
        next.source = appVars.callableDraftCore.source;
      }
      try {
        validateCallableDraft(next);
        if (JSON.stringify(next) !== JSON.stringify(appVars.callableDraftCore)) {
          appVars.callableDraftCore = next;
          appCalls.invalidateEditors();
          appCalls.markDirty();
        }
        appVars.headerPending = null;
        return true;
      } catch (error) {
        appVars.headerPending = { ownerKey: draftOwner(), reason: error.message };
        return appCalls.showEditorFailure(appVars.draftEditor, error);
      }
    }
    function installEditorShell() {
      const toolbar = $('.menutool'),
        main = $('.main'),
        side = $('.side'),
        code = $('.codewin'),
        toolbox = $('.toolbox');
      const brand = $('.titlebar');
      brand.textContent = 'Akari';
      toolbar.prepend(brand);
      const modes = $('#editorModecode').parentElement,
        cancel = $('#editorCancel');
      $('.code-head').append(cancel);
      toolbar.insertBefore(modes, $('#projectName'));
      for (const [id, path, title] of [
        ['redoBtn', 'M15 4l5 5-5 5M20 9H10a6 6 0 0 0 0 12h2', 'やり直す'],
        ['undoBtn', 'M9 4 4 9l5 5M4 9h10a6 6 0 0 1 0 12h-2', 'もとに もどす'],
      ]) {
        const b = $('#' + id);
        b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' + path + '"/></svg>';
        b.title = title;
        b.setAttribute('aria-label', title);
        const label = document.createElement('span');
        label.textContent = title;
        b.append(label);
        $('.debugbar').prepend(b);
      }
      $('.debugbar').append($('#resetBtn'));
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
      $('#sampleBtn').after(historyToolbarAnchor);
      const historyHomes=[$('#undoBtn'),$('#redoBtn')].map(button=>{const marker=document.createElement('span');button.before(marker);return {button,marker};}),
        callableTitle = $('#procModal > .dialog > .win-title');
      appVars.placeHistoryButtons=()=>{
        for(const {button,marker}of historyHomes){
          if($('#procModal').classList.contains('show')){if(button.parentElement!==callableTitle)callableTitle.append(button);}
          else if(document.body.dataset.editorMode==='blocks'){
            const anchor=button.id==='undoBtn'&&$('#redoBtn').parentElement===toolbar?$('#redoBtn'):historyToolbarAnchor;
            if(button.parentElement!==toolbar||button.nextSibling!==anchor)toolbar.insertBefore(button,anchor);
          }else if(marker.nextSibling!==button)marker.after(button);
        }
      };
      new MutationObserver(appVars.placeHistoryButtons).observe($('#procModal'), { attributes: true, attributeFilter: ['class'] });
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
        tools.append($('#' + id));
      // The right end of the toolbar, left to right: コード／ブロック, the level, the work name (the level's choices depend
      // on the view).
      toolbar.insertBefore($('.ui-level-label'), $('#projectName'));
      installToolbarMenus(toolbar);
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
        const section = $(selector),
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
      hints.append(hintSummary, $('.code-assist .hint-panel'));
      $('.code-assist').append(hints);
      const output = document.createElement('details');
      output.className = 'output-disclosure';
      const outputSummary = document.createElement('summary');
      outputSummary.textContent = '出てきた 文字';
      output.append(outputSummary, $('#console'));
      $('.monitor-window').append(output);
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
      $('#formSurface').addEventListener(
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
    // The toolbar's 作品 menu opens over the page: a second press of the summary, a press anywhere
    // else or Escape closes them (Escape gives the focus back to the summary). The toolbar stays at the top of the page
    // when it scrolls; scrolling to a place keeps it clear of the toolbar, whose height can change as it wraps.
    function installToolbarMenus(toolbar) {
      document.addEventListener('pointerdown', (event) => {
        for (const menu of toolbar.querySelectorAll(':scope > details.toolbar-menu[open]'))
          if (!menu.contains(event.target)) menu.open = false;
      }, true);
      // The keyboard's way out: when the focus moves on past an open menu, the menu closes (the focus is not moved), so it
      // never covers the control the child tabs to.
      document.addEventListener('focusin', (event) => {
        for (const menu of toolbar.querySelectorAll(':scope > details.toolbar-menu[open]'))
          if (!menu.contains(event.target)) menu.open = false;
      });
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || event.isComposing) return;
        for (const menu of toolbar.querySelectorAll(':scope > details.toolbar-menu[open]')) {
          menu.open = false;
          if (menu.contains(document.activeElement) || document.activeElement === document.body) menu.querySelector('summary').focus({ preventScroll: true });
        }
      });
      // An open menu opens under the whole toolbar (its top follows --toolbar-h), so on a wrapped toolbar it covers none
      // of the rows below the menu's own row. It stays inside the window at narrow widths: it shifts left (or right) by
      // what would stick out, again whenever the toolbar changes size while it is open.
      const placeMenu = (menu) => {
        const panel = menu.querySelector(':scope > :not(summary)');
        menu.style.setProperty('--menu-shift', '0px');
        if (!menu.open || !panel) return;
        const r = panel.getBoundingClientRect(), room = document.documentElement.clientWidth - 16;
        menu.style.setProperty('--menu-shift', (r.right > room ? Math.max(16 - r.left, room - r.right) : r.left < 16 ? 16 - r.left : 0) + 'px');
      };
      for (const menu of toolbar.querySelectorAll(':scope > details.toolbar-menu'))
        menu.addEventListener('toggle', () => placeMenu(menu));
      // A choice in はじめて's 作品 menu closes it. A menu does not open while the work runs (updateEditingLock).
      toolbar.addEventListener('click', (event) => {
        if (event.target.closest('.project-actions button')) {
          // An action can return focus to an invalid input. Preserve that decision.
          const menu=$('#projectMenu'),returnToMenu=menu.contains(document.activeElement);
          menu.open=false;
          if(returnToMenu&&!document.querySelector('.modal.show,.modal.open,dialog[open]'))menu.querySelector('summary').focus({preventScroll:true});
        }
        if (event.target.closest('details.toolbar-menu > summary[aria-disabled="true"]')) event.preventDefault();
      });
      const syncHeight = () => {
        document.documentElement.style.setProperty('--toolbar-h', toolbar.offsetHeight + 'px');
        for (const menu of toolbar.querySelectorAll(':scope > details.toolbar-menu[open]')) placeMenu(menu);
      };
      if (typeof ResizeObserver === 'function') new ResizeObserver(syncHeight).observe(toolbar);
      syncHeight();
    }
    function syncEditorShell(mode) {
      if (!document.body.dataset.editorMode || appVars.shellPointer) return;
      const block = mode === 'blocks',
        changed = document.body.dataset.editorMode !== mode,
        main = $('.main'),
        side = $('.side'),
        designer = $('#designerWindow'),
        objects = $('.objects-window');
      if (changed) {
        document.body.dataset.editorMode = mode;
        if (block) {
          side.prepend(designer);
          side.insertBefore(objects, $('.properties-window'));
          $('#componentPickerCore').append($('.tool-list'));
          $('#componentControls').append($('.project-tools'));
        } else {
          main.insertBefore(designer, side);
          side.prepend(objects);
          $('.toolbox').append($('.tool-list'), $('.project-tools'));
        }
        $('#hintsDisclosure').open = false;
      }
      // In blocks the body window comes before the stage and the right column, so Tab goes from the toolbar to the block
      // list, the workspace, and then the stage and the right column (E-16). The code view keeps its order.
      const code = $('.codewin');
      if (code.parentElement === main) {
        if (block && code.compareDocumentPosition(side) & Node.DOCUMENT_POSITION_PRECEDING) main.insertBefore(code, side);
        else if (!block && code !== main.lastElementChild) main.append(code);
      }
      // One name for each window in both views (F-23): 「作品」 names the work.
      $('#designerHeading').textContent = '画面';
      $('.objects-window > .win-title').textContent = 'キャラクター・部品';
      // The part's actions go above its せってい in code and under the part list in blocks. The padding they need is read
      // when they move (their ResizeObserver follows later changes), not with every keystroke (PERF-R2-03).
      const actions = $('.prop-actions'), actionsHome = block ? $('#componentActions') : appVars.el.props;
      if (actions && actionsHome.firstElementChild !== actions) { actionsHome.prepend(actions); appCalls.syncPropertyScrollPadding(); }
      $('#formatBtn').hidden = block || currentIsMeijin();
      syncWideInert();
      // The level list follows the view (blocks or code); a view in code at はじめて goes on at かんたん.
      if (applyUiLevel(mode)) renderHints();
      renderEntrySurface();
    }
    // The edit screen supplies the minimum once per run. Include the scrollbar gutter: a minimum on the scaled child
    // alone would spill out of the designer and be clipped. Overflow belongs to the finite workspace, not the page.
    function fitRunStageMinimum() {
      if (!appVars.runStageMinimum || document.body.classList.contains('stage-enlarged')) return;
      const designer = $('#designerWindow'), wrap = $('.designer-wrap'), style = getComputedStyle(wrap),
        width = Math.ceil(designer.offsetWidth - wrap.clientWidth + appVars.runStageMinimum.width +
          parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 1),
        height = Math.ceil(designer.offsetHeight - wrap.clientHeight + appVars.runStageMinimum.height +
          parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 1);
      for (const [name, value] of [['--run-stage-min-width', width], ['--run-stage-min-height', height]])
        if (designer.style.getPropertyValue(name) !== value + 'px') designer.style.setProperty(name, value + 'px');
      appVars.stageView.fitStage();
    }
    function setStageZoom(scale) {
      appVars.stageZoom = scale === null ? null : Math.max(0.1, Math.min(2, Math.round(scale * 100) / 100));
      appVars.stageView.fitStage();
      appVars.stageView.positionBubbles();
      if (appVars.stageZoom === null) $('.designer-wrap').scrollTo({ left: 0, top: 0 });
    }
    function setStageEnlarged(on) {
      const button = $('#stageEnlarge');
      if (on === document.body.classList.contains('stage-enlarged')) return;
      document.body.classList.toggle('stage-enlarged', on);
      // The enlarged stage is modal: everything around #designerWindow (toolbar, other windows, status line) is inert
      // until it closes, so Tab stays on the stage and a hidden control cannot be pressed (AX-02). The status line's live
      // region stays out of it, so a screen reader still hears what happens (おわったよ…): its neighbours are inert instead.
      for (const node of document.querySelectorAll('[data-enlarged-inert]')) { node.inert = false; delete node.dataset.enlargedInert; }
      const live = $('#statusLive'), makeInert = (sibling) => {
        if (sibling.inert) return;
        if (sibling.contains(live)) { for (const child of sibling.children) if (child !== live) makeInert(child); return; }
        sibling.inert = true; sibling.dataset.enlargedInert = '';
      };
      if (on) for (let node = $('#designerWindow'); node && node.id !== 'app'; node = node.parentElement)
        for (const sibling of node.parentElement?.children || [])
          if (sibling !== node) makeInert(sibling);
      button.textContent = on ? 'もどる' : '大きく見る';
      button.setAttribute('aria-pressed', String(on));
      if (on) { appVars.enlargedFrom = appVars.stageZoom; setStageZoom(1); }
      else { setStageZoom(appVars.enlargedFrom ?? null); appVars.enlargedFrom = undefined; }
      button.focus({ preventScroll: true });
    }
    // In wide mode the thumbnail stands for the small stage behind it: the stage and its handles are no Tab stops then.
    // The run screen and the code view do not use wide mode.
    function syncWideInert() {
      const wrap = $('#designerWindow > .designer-wrap');
      if (wrap) wrap.inert = document.body.dataset.workbenchWide === 'true' && document.body.dataset.editorMode === 'blocks' &&
        !document.body.classList.contains('runtime') && !document.body.classList.contains('stage-enlarged');
    }
    const currentIsMeijin = () => appVars.selectedId === MEIJIN_OWNER;
    function openRuntimeInspector() {
      if (!['RUNNING', 'PAUSED'].includes(appVars.appState) || appVars.inspectorNodes.length) return;
      appVars.stageView.clearInput();
      // The dialog opens on the body of the sentence 「いま 動いている 文：」 names, not on the body chosen before the run.
      appCalls.flushRuntimePaint();
      appCalls.paintExecutionLocation({ follow: true });
      // The dialog shows the running bodies with the コード／ブロック toggle and the strip of the running sentence; the level is
      // chosen on the edit screen only.
      for (const [node, target] of [[$('.codewin'), $('#runtimeInspectorBody')], [$('.monitor-window'), $('#runtimeInspectorBody')], [$('#editorModecode').parentElement, $('#runtimeInspectorModes')], [$('#runStrip'), $('#runtimeInspectorStrip')]]) {
        const marker = document.createComment('runtime inspector return point');
        node.before(marker); appVars.inspectorNodes.push({node, marker}); target.append(node);
      }
      $('#runtimeInspector').showModal();
      renderEditorBinding(appVars.mainEditor);
      // The line numbers were laid out while the body was not shown (the run screen); lay them out in the dialog, and
      // bring the running sentence into view.
      appCalls.updateGutter();
      if (appVars.activeLoc?.key === appCalls.bindingOwner(appVars.mainEditor)) {
        if (appVars.mainEditor.session?.mode === 'blocks') $('#blockEditor .blockui-current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        else {
          appVars.el.editor.scrollTop = Math.max(0, (appCalls.wrappedCodeLines().lines[appVars.activeLoc.line - 1]?.top || 0) - Math.floor(appVars.el.editor.clientHeight / 3));
          appVars.el.gutter.scrollTop = appVars.el.editor.scrollTop;
        }
      }
      $('#runtimeInspectorClose').focus();
    }
    function placeProjectNameText() {
      const text = $('#projectNameText'), box = appVars.el.projectName;
      if (text.hidden) return;
      const style = getComputedStyle(box);
      Object.assign(text.style, {
        left: box.offsetLeft + 'px', top: box.offsetTop + 'px', width: box.offsetWidth + 'px', height: box.offsetHeight + 'px',
        paddingLeft: parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth) + 'px', font: style.font,
      });
    }
    function updateEditingLock() {
      const locked = appCalls.modelLocked();
      if (locked && appVars.colorEdit) closeColorPicker();
      for (const id of [
        'newBtn',
        'sampleBtn',
        'openBtn',
        'resetBtn',
        'imageObjectAdd',
        'paintAdd',
        'soundQuickAdd',
        'assetBtn',
        'procBtn',
        'dataBtn',
        'formatBtn',
        'scriptAdd',
        'exportBtn',
      ])
        $('#' + id).disabled = locked;
      for (const id of [
        'backdropAdd',
        'costumeAdd',
        'backdropImageAdd',
        'costumeImageAdd',
        'soundAdd',
        'backdropName',
        'backdropColor',
        'costumeName',
        'costumeText',
      ]) {
        const n = $('#' + id);
        if (n) n.disabled = locked;
      }
      // The other toolbar controls cannot be pressed while the work runs either (保存, いっしょに作る, はじめて's もとに もどす・
      // やり直す, and the 作品 menu): the run screen shows none of the locked toolbar controls, but keeps their
      // room (final call 21), so ■ 止める stays where ▶ 動かす was.
      $('#saveBtn').disabled = locked;
      $('#tutorialStart').disabled = locked;
      for (const menu of [$('#projectMenu')]) {
        const summary = menu.querySelector(':scope > summary');
        if (locked) {
          menu.open = false;
          summary.setAttribute('aria-disabled', 'true');
        } else summary.removeAttribute('aria-disabled');
      }
      $('#uiLevel').disabled = appVars.appState === 'IMPORTING';
      // Do not change history ownership while an asynchronous import is still settling.
      // Runtime inspection keeps its existing target/event navigation.
      appVars.el.obj.disabled = appVars.el.event.disabled = appVars.appState === 'IMPORTING' || appVars.appState === 'PREPARING';
      appVars.el.editor.readOnly = locked;
      appVars.el.projectName.disabled = locked;
      // The run screen shows the work's name as plain text in the name box's place: the box keeps its room but is not
      // shown, so it is not read as an edit field either.
      const nameText = $('#projectNameText'), runScreen = ['PREPARING', 'RUNNING', 'PAUSED'].includes(appVars.appState);
      nameText.hidden = !runScreen;
      if (runScreen) {
        if (nameText.textContent !== appVars.project.name) nameText.textContent = nameText.title = appVars.project.name;
        placeProjectNameText();
      }
      $$('.tool').forEach((b) => {
        b.disabled = locked;
        b.draggable = !locked;
      });
      $$('.entry-add').forEach((b) => (b.disabled = locked));
      $$('.hint-button').forEach((b) => (b.disabled = locked || b.dataset.unavailable === 'true'));
      // The run screen: from ▶ 動かす (getting ready) until ■ 止める, also paused, stopped by an error and finished. The edit
      // screen (DESIGN, IMPORTING) shows ▶ 動かす only, the run screen ■ 止める only, in the same place.
      const wasRuntime = document.body.classList.contains('runtime'), main = $('.main');
      if (runScreen && !wasRuntime) {
        const r = $('#formFrame').getBoundingClientRect();
        appVars.runStageMinimum = { width: r.width, height: r.height, left: main.scrollLeft, top: main.scrollTop };
        main.tabIndex = 0; main.setAttribute('aria-label', '画面と 本文を スクロールする');
        document.body.dataset.runStageMinimum = '';
      }
      document.body.classList.toggle('runtime', runScreen);
      if (runScreen && !wasRuntime) fitRunStageMinimum();
      else if (!runScreen && wasRuntime) {
        const previous = appVars.runStageMinimum; appVars.runStageMinimum = null;
        delete document.body.dataset.runStageMinimum;
        main.removeAttribute('tabindex'); main.removeAttribute('aria-label');
        $('#designerWindow').style.removeProperty('--run-stage-min-width');
        $('#designerWindow').style.removeProperty('--run-stage-min-height');
        main.scrollLeft = previous?.left || 0; main.scrollTop = previous?.top || 0;
      }
      document.body.classList.toggle('run-finished', appVars.runFinished);
      syncWideInert();
      // はじめて's run screen shows the blocks to read only: they are not Tab stops between the stage and ■ 止める (AX-11).
      const world = $('#blockEditor .blockui-world');
      if (world) world.inert = document.body.dataset.uiLevel === 'entry' && ['PREPARING', 'RUNNING', 'PAUSED'].includes(appVars.appState);
      if (locked && appVars.appState !== 'IMPORTING') appCalls.closeEditingModals();
      if (appVars.mainEditor.view) renderEditorBinding(appVars.mainEditor);
      // A picture or work being read in refuses the toggle's press (読みこみが おわるまで…), and the refusal ends with it.
      if (appVars.draftEditor.session) paintBindingModeToggle(appVars.draftEditor);
      appCalls.updateDirty();
    }
    function renderSelectors() {
      $('#sourceOverviewBtn').hidden = appVars.sourceOverviewOpen;
      $('#sourceEditBtn').hidden = !appVars.sourceOverviewOpen;
      $('#sourceStageBtn').hidden = appVars.selectedId === 'stage';
      $('#sourceHeadingBtn').hidden = appVars.sourceOverviewOpen;
      $('#sourceHeadingBtn').disabled = appCalls.modelLocked();
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
      $('#scriptAdd').disabled = appCalls.modelLocked() || appVars.project.scripts.length >= LIMITS.scripts;
      $('#scriptAdd').textContent = currentIsMeijin() ? '名人の本文を ふやす' : '同じ きっかけの 本文を ふやす';
      $('#meijinDelete').hidden = !currentIsMeijin();
      $('#meijinDelete').disabled = appCalls.modelLocked();
      $('#sourceHeadingBtn').hidden ||= appCalls.workIsMeijin();
      renderEntrySurface();
    }
    function showSourceOverview() {
      appVars.sourceOverviewOpen = true;
      appVars.sourceOverviewSignature = '';
      syncEditorShell(chosenEditorMode());
      $('.codewin').dataset.sourceOverview = 'true';
      $('#sourceOverview').hidden = false;
      $('#sourceOverview').scrollTop = 0;
      renderSelectors();
      renderSourceOverview();
    }
    function renderSourceOverview() {
      if (!appVars.sourceOverviewOpen) return;
      paintBindingModeToggle(appVars.mainEditor);
      const signature = JSON.stringify([appVars.selectedId, appVars.editorContextRevision, chosenEditorMode(), appCalls.modelLocked(), hasCallableDraft() ? appVars.callableDraftCore : null]);
      if (appVars.sourceOverviewSignature === signature) return;
      appVars.sourceOverviewSignature = signature;
      appVars.sourceOverviewObserver?.disconnect();
      for (const view of appVars.sourceOverviewViews) view.destroy();
      appVars.sourceOverviewViews = [];
      const root = $('#sourceOverview'), scroll = root.scrollTop;
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
            if (appCalls.modelLocked() || !confirmCallableDiscard()) return;
            loadCallable(record.key); renderCallableOptions(record.key);
            $('#procModal').classList.add('show'); renderEditorBinding(appVars.draftEditor);
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
          if (chosenEditorMode() === 'blocks' && session.syntaxAst) {
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
      if (appVars.selectedId === 'stage' && hasCallableDraft()) {
        const card = make('section', null, 'source-card source-draft');
        card.dataset.ownerId = appVars.callableDraftCore.ownerId;
        card.dataset.sourceKey = draftOwner();
        card.append(make('h3', `なおして いる ${appVars.callableDraftCore.type === 'action' ? 'てじゅん' : '答えを もとめる'}「${appVars.callableDraftCore.name || '名前を入力'}」`),
          make('pre', appVars.callableDraftCore.source || '本文は からっぽだよ。'),
          button('つづきを なおす', () => { $('#procModal').classList.add('show'); renderEditorBinding(appVars.draftEditor); }));
        root.append(card);
      }
      root.scrollTop = scroll;
    }
    function syncColorPicker(syncHex = true) {
      const edit = appVars.colorEdit;
      if (!edit) return;
      const { h, s, v } = edit.hsv;
      appCalls.colorChip($('#colorBefore'), edit.original);
      appCalls.colorChip($('#colorAfter'), edit.value);
      const rad = (h * Math.PI) / 180;
      $('#colorMarker').style.left = 50 + 47 * s * Math.cos(rad) + '%';
      $('#colorMarker').style.top = 50 - 47 * s * Math.sin(rad) + '%';
      for (const [id, value] of [
        ['Hue', Math.round(h) % 360],
        ['Saturation', Math.round(s * 100)],
        ['Value', Math.round(v * 100)],
      ]) {
        $('#color' + id + (id === 'Value' ? 'Core' : '')).value = value;
        $('#color' + id + 'Text').textContent = String(value) + (id === 'Hue' ? '\u00b0' : '%');
      }
      if (syncHex) {
        $('#colorHex').value = edit.value || '';
        edit.invalid = false;
      }
      $('#colorHex').setAttribute('aria-invalid', String(!!edit.invalid));
      $('#colorError').textContent = edit.invalid
        ? '# と、6けたの0〜9・A〜Fで入力します（れい: #147efb）'
        : '';
      $('#colorConfirm').disabled = !!edit.invalid || !!edit.composing;
      $('#colorNone').setAttribute('aria-pressed', String(edit.value === null));
      $('#colorState').textContent =
        edit.value === null
          ? 'なし（とうめい）'
          : `\u8272\u3042\u3044 ${Math.round(h)}\u5ea6\u3001\u3042\u3056\u3084\u304b\u3055 ${Math.round(s * 100)}%\u3001\u660e\u308b\u3055 ${Math.round(v * 100)}%`;
      appCalls.paintColorPreview();
    }
    function updatePickerHsv(hsv) {
      if (!appVars.colorEdit || appVars.colorEdit.composing) return;
      Object.assign(appVars.colorEdit.hsv, hsv);
      const { h, s, v } = appVars.colorEdit.hsv;
      appVars.colorEdit.value = pickerHsvToHex(h, s, v);
      syncColorPicker();
    }
    function openColorPicker(c, field, label) {
      if (appCalls.modelLocked() || appVars.colorEdit || !appCalls.flushActiveEditor() || appCalls.componentById(c.id) !== c)
        return;
      appCalls.dropHistoryTimer();
      appCalls.pushHistoryNow();
      appVars.colorEdit = {
        id: c.id,
        component: c,
        project: appVars.project,
        field,
        original: c[field],
        value: c[field],
        hsv: pickerHexToHsv(c[field] || '#ffffff'),
        invalid: false,
        composing: false,
        pointer: null,
      };
      $('#colorTitle').textContent = c.name + ' \u2014 ' + label;
      $('#colorNone').hidden = field !== 'bg';
      $('#colorAdvanced').open = false;
      syncColorPicker();
      $('#colorModal').classList.add('show');
    }
    function closeColorPicker() {
      const edit = appVars.colorEdit;
      if (!edit) return;
      const pointer = edit.pointer;
      edit.pointer = null;
      if (pointer)
        try {
          $('#colorWheel').releasePointerCapture(pointer.id);
        } catch (_) {}
      appVars.colorEdit = null;
      $('#colorModal').classList.remove('show');
      appCalls.renderProperties();
      appCalls.renderComponents();
      requestAnimationFrame(() => {
        if (!document.querySelector('.modal.show,.modal.open') && appVars.selectedId === edit.id)
          appVars.el.props
            .querySelector(`[data-color-field="${edit.field}"] .color-more`)
            ?.focus();
      });
      if (appVars.dirty || hasCallableDraft()) appCalls.scheduleAutosave();
    }
    function installColorPicker() {
      const canvas = $('#colorCanvas'),
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
      const wheel = $('#colorWheel');
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
          syncColorPicker(false);
          $('#colorHex').value = pointer.hex;
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
          hex: $('#colorHex').value,
        };
        try {
          wheel.setPointerCapture(e.pointerId);
        } catch (_) {}
        updatePickerHsv(point(e));
      });
      wheel.addEventListener('pointermove', (e) => {
        if (!appVars.colorEdit?.pointer || appVars.colorEdit.pointer.id !== e.pointerId) return;
        e.preventDefault();
        updatePickerHsv(point(e));
      });
      wheel.addEventListener('pointerup', (e) => {
        if (appVars.colorEdit?.pointer?.id !== e.pointerId) return;
        updatePickerHsv(point(e));
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
          updatePickerHsv({ h: (h + (e.key === 'ArrowRight' ? step : -step) + 360) % 360 });
        else updatePickerHsv({ s: clamp(s + (e.key === 'ArrowUp' ? step : -step) / 100, 0, 1) });
      });
      for (const [id, key, factor] of [
        ['Hue', 'h', 1],
        ['Saturation', 's', 100],
        ['Value', 'v', 100],
      ])
        $('#color' + id + (id === 'Value' ? 'Core' : '')).addEventListener('input', (e) =>
          updatePickerHsv({ [key]: Number(e.target.value) / factor }),
        );
      const hex = $('#colorHex'),
        readHex = () => {
          const edit = appVars.colorEdit;
          if (!edit || edit.composing) return;
          const value = pickerHex(hex.value);
          edit.invalid = !value;
          if (value) {
            edit.value = value;
            edit.hsv = pickerHexToHsv(value);
          }
          syncColorPicker(false);
        };
      hex.addEventListener('input', readHex);
      hex.addEventListener('compositionstart', () => {
        if (appVars.colorEdit) {
          appVars.colorEdit.composing = true;
          $('#colorConfirm').disabled = true;
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
          $('#colorConfirm').click();
        }
      });
      $('#colorNone').onclick = () => {
        if (appVars.colorEdit?.field === 'bg' && !appVars.colorEdit.composing) {
          appVars.colorEdit.value = null;
          syncColorPicker();
        }
      };
      $('#colorCancel').onclick = closeColorPicker;
      $('#colorConfirm').onclick = () => {
        const edit = appVars.colorEdit;
        if (!edit || edit.invalid || edit.composing) return;
        if (
          appCalls.modelLocked() ||
          appVars.project !== edit.project ||
          appCalls.componentById(edit.id) !== edit.component ||
          appVars.selectedId !== edit.id ||
          edit.component[edit.field] !== edit.original
        ) {
          closeColorPicker();
          return;
        }
        try {
          const changed = appCalls.commitColor(edit.component, edit.field, edit.value);
          closeColorPicker();
          if (changed) appCalls.refreshEditor();
        } catch (error) {
          $('#colorError').textContent = error.message;
          $('#colorAdvanced').open = true;
        }
      };
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
      $('#valueTitle').textContent = v.label;
      const rounded = item !== undefined && displayValue(item).rounded;
      $('#valueNotice').textContent = rounded ? 'ふだんは 数を 短くして 見せて いるよ。下は もとの 数だよ。えらんで、ほかの ところに はりつけられるよ。' : '下は 中身の 全部だよ。えらんで、ほかの ところに はりつけられるよ。';
      $('#valueListControls').hidden = !list;
      $('#valueItem').value = String(v.index + 1);
      $('#valueItem').max = String(Math.max(1, v.value.length || 1));
      $('#valueItem').disabled = !list || !v.value.length;
      $('#valueCount').textContent = list ? `/ ${v.value.length}こ` : '';
      $('#valueItemPrev').disabled = !list || v.index === 0;
      $('#valueItemNext').disabled = !list || v.index >= v.value.length - 1;
      $('#valueOutput').textContent = chars.slice(v.page * 8000, (v.page + 1) * 8000).join('');
      $('#valueOutput').scrollTop = 0;
      $('#valuePage').textContent = `${v.page + 1} / ${pages}`;
      $('#valuePagePrev').disabled = v.page === 0;
      $('#valuePageNext').disabled = v.page === pages - 1;
    }
    // The strip under the stage on the run screen: whose body runs, after which event and on which line, and the sentence
    // itself in a box. At はじめて only the part and the sentence (its blocks have no line numbers, and it has two events).
    // Each part keeps to one line there (a long one ends in …); its title holds the whole text.
    function paintRunStrip(text = '', sentence = '') {
      const location = 'いま 動いている 文：' + (text || '―');
      if ($('#execLocation').textContent !== location) $('#execLocation').textContent = $('#execLocation').title = location;
      if ($('#execSentence').textContent !== sentence) $('#execSentence').textContent = $('#execSentence').title = sentence;
      $('#execSentence').hidden = !sentence;
    }
    function noticeSourceOf(owner) {
      return scriptBySourceKey(appVars.project, owner)?.source ?? appVars.project.actions.find(a => owner === 'action:' + a.id)?.source
        ?? appVars.project.functions.find(f => owner === 'function:' + f.id)?.source ?? null;
    }
    function cachedNotices() {
      // Each change starts the wait again, so the work is checked once the child stops for a moment.
      const key = JSON.stringify(appVars.project);
      if (key !== appVars.noticeKey && key !== appVars.noticeWanted) {
        appVars.noticeWanted = key;
        clearTimeout(appVars.noticeTimer);
        appVars.noticeTimer = setTimeout(checkNotices, 150);
      }
      return appVars.noticeList.filter(d => appVars.noticeSources.get(d.owner) === noticeSourceOf(d.owner));
    }
    function checkNotices() {
      appVars.noticeTimer = 0;
      // Not while the work runs (its text does not change), and not while the child is in the middle of something in a
      // body (a field, a word being typed, a block carried): a little later.
      const busy = appCalls.modelLocked() || [appVars.mainEditor, appVars.draftEditor].some(b => b.session?.pendingEdit || b.session?.blockDraft || b.view?.interactionActive())
        || appVars.composingEditors.has(appVars.el.editor) || appVars.composingEditors.has(appVars.draftEditor.textarea) || document.querySelector('.blockui-dragging');
      if (busy) { appVars.noticeTimer = setTimeout(checkNotices, 400); return; }
      appVars.noticeWanted = null;
      const key = JSON.stringify(appVars.project);
      let namesChanged=false;
      if (key !== appVars.noticeKey) {
        let checked = { items: [], notes: [] };
        try { checked = compileProject(appVars.project); } catch (error) { if (!(error instanceof AkariError)) throw error; }
        if(!checked.errors?.length){
          const names=collectSignalNames(checked);namesChanged=JSON.stringify([names.sent,names.received])!==JSON.stringify([appVars.signalNameCache.names.sent,appVars.signalNameCache.names.received]);
          appVars.signalNameCache={key,names};
        }
        // A 名人 text's flows are items of their own: a notice belongs to the body (the document) its item comes from.
        const owner = where => checked.items?.find(item => item.key === where)?.documentKey || where;
        appVars.noticeList = (checked.notes || []).map(d => ({ ...d, owner: owner(d.where) }));
        appVars.noticeSources = new Map(appVars.noticeList.map(d => [d.owner, noticeSourceOf(d.owner)]));
        appVars.noticeKey = key;
      }
      const shown = b => (b.session?.notices || []).map(d => d.line + ':' + d.code).join();
      for (const binding of [appVars.mainEditor, appVars.draftEditor]) {
        if (!binding.view || !binding.session) continue;
        if(namesChanged&&binding.session.mode==='blocks'){renderEditorBinding(binding);continue;}
        if (shown(binding) === bodyNotices(binding.session).map(d => d.line + ':' + d.code).join()) continue;
        if (binding === appVars.mainEditor) appCalls.refreshEditor(); else renderEditorBinding(binding);
      }
    }
    function bodyNotices(session) {
      // The run screen shows no notice (its marks are edit-screen controls), so a running work is not looked at for them.
      if (appCalls.modelLocked() || !session || session.pendingEdit || session.blockDraft || session.diagnostics?.length || !session.syntaxAst) return [];
      return cachedNotices().filter(d => d.owner === session.ownerKey && appVars.noticeSources.get(d.owner) === session.sourceText)
        .sort((a, b) => (a.line || 0) - (b.line || 0) || (a.column || 0) - (b.column || 0));
    }
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
    function drawHints(root, candidates, search, offset, insert) {
      root.textContent = '';
      const symbols = buildSymbols(appVars.project), advanced = document.body.dataset.uiLevel === 'advanced';
      candidates = candidates.filter(h => advanced || !hintGroup(h, symbols)?.advanced);
      const query = search.trim().toLocaleLowerCase(),
        filtered = searchHintCandidates(candidates, query, appVars.project),
        page = Math.min(offset, Math.max(0, Math.ceil(filtered.length / 24) - 1)),
        begin = page * 24;
      if (root===appVars.el.hints && /ふれ(?:た|る)とき|さわ(?:った|る)とき|あた(?:った|る)とき|ぶつか(?:った|る)とき/.test(normalizeSearchText(query))) {
        const owner=appVars.project.components.find(c=>c.id===appVars.selectedId),toucher=owner||appVars.project.components.find(c=>c.type==='sprite'),
          part=appVars.project.components.find(c=>c.id!==toucher?.id),example=toucher?sentenceHeadingSource({event:'touchStart',actorRef:currentIsMeijin()||!owner?{kind:'named',name:toucher.name}:{kind:'self'},filter:{target:part?.name||'端'}}):null;
        if(example){
        const note = document.createElement('p');
        note.className = 'hint-heading-note';
        note.textContent = 'ふれた ときに 動かすには、本文の はじめに「' + example + '」を 書いてね';
        root.appendChild(note);
        }
      }
      if(root===appVars.el.hints&&/合図|あいず|しらせ|知らせ|受け|うけ/.test(query)){
        const names=appVars.signalNameCache.names,name=names.sent.find(name=>!names.received.includes(name))||names.sent[0]||'開始';
        const note=document.createElement('p');note.className='hint-heading-note';note.textContent=`合図を 受けて 動かすには、本文の はじめに「「${name}」という合図を受けたとき、」を 書いてね`;root.append(note);
      }
      for (const h of filtered.slice(begin, begin + 24)) {
        const b = document.createElement('button');
        b.className = 'hint-button';
        if (h.mode === 'expression') {
          b.append(document.createTextNode(hintGroup(h, symbols).label + ' · '));
          const code = document.createElement('code');
          code.style.font = 'inherit'; code.textContent = h.text; b.append(code);
          if (h.reason) b.append(document.createTextNode('\n' + h.reason));
        } else b.textContent = h.text + (h.reason ? '\n' + h.reason : '');
        b.title = h.category + (h.reason ? ' / ' + h.reason : '');
        b.dataset.unavailable = String(!h.enabled);
        b.disabled = !h.enabled || appCalls.modelLocked();
        b.onclick = () => {
          if (h.enabled) insert(h);
        };
        root.appendChild(b);
      }
      return { page, total: filtered.length, pages: Math.max(1, Math.ceil(filtered.length / 24)) };
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
        list = $('#hintUnavailable').checked ? all : all.filter((x) => x.enabled),
        r = drawHints(appVars.el.hints, list, $('#hintSearch').value, appVars.hintPage, appCalls.insertHint);
      appVars.hintPage = r.page;
      $('#hintCount').textContent = `${r.page + 1}/${r.pages} (${r.total})`;
      $('#hintPrev').disabled = r.page === 0;
      $('#hintNext').disabled = r.page === r.pages - 1;
    }
    function stopRun() {
      if (appVars.appState === 'IMPORTING') return;
      tutorialCollectRuntime();
      if(appVars.tutorial&&!appVars.tutorialTrace?.complete){
        const step=tutorialStep(appVars.tutorial);
        if(step?.id.startsWith('try-')||step?.id.startsWith('stop-')) {
          appVars.tutorial.index=tutorialSequence(appVars.tutorial).findIndex(s=>s.id==='run-'+step.id.split('-').slice(1).join('-'));appVars.tutorialTrace=null;
        }
      }
      const failed = appVars.activeLoc?.error ? appVars.activeLoc : null;
      appCalls.disposeRuntime();
      appVars.keptFail = failed;
      appVars.el.form.querySelectorAll('.sprite-bubble').forEach((n) => n.remove());
      appVars.appState = 'DESIGN';
      appVars.runFinished = false;
      appVars.runFailed = false;
      appVars.runHint = '';
      appVars.pen.clearRect(0, 0, appVars.el.canvas.width, appVars.el.canvas.height);
      appCalls.confirmTutorialOperation('stop');
      appCalls.renderAll();
      appCalls.loadEditor();
      paintRunStrip();
      appCalls.setStatus(appCalls.stopStatusWithNotices());
      if(appVars.tutorial){appCalls.tutorialRefresh();focusTutorialTarget();return;}
      if (appVars.sourceOverviewOpen) $('#sourceEditBtn').focus({ preventScroll: true });
      else if (appVars.mainEditor.session?.mode === 'blocks') {
        appVars.mainEditor.view.focus({ id: appVars.mainEditor.session.blockSelection });
        if (!$('#blockEditor').contains(document.activeElement))
          $('#blockEditor .blockui-workspace').focus({ preventScroll: true });
      }
      else appVars.el.editor.focus({ preventScroll: true });
    }
    function showBubble(rid, text, value) {
      appVars.stageView.showBubble(rid, text, value);
    }
    function limitInputValue(input) {
      return appVars.stageView.limitInputValue(input);
    }
    function positionBubbles() {
      appVars.stageView.positionBubbles();
    }
    function showQuestion(q, cb) {
      appCalls.closeRuntimeInspector();
      appVars.stageView.clearInput();
      appVars.questionCb = cb;
      $('#questionText').textContent = q;
      $('#questionAnswer').value = '';
      $('#questionModal').classList.add('show');
      setTimeout(() => $('#questionAnswer').focus(), 0);
    }
    function setupModalAccessibility() {
      const root = $('#app'),
        modals = $$('.modal'),
        previousFocus = new Map();
      let lastTop = null;
      const isOpen = (m) => m.classList.contains('show') || m.classList.contains('open');
      const top = () => modals.filter(isOpen).at(-1) || null;
      const focusable = (m) =>
        [
          ...m.querySelectorAll(
            'button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])',
          ),
        ].filter((n) => n.getClientRects().length && !n.inert);
      const sync = () => {
        const current = top();
        for (const m of modals) {
          m.inert = !!current && m !== current;
          if (isOpen(m) && !previousFocus.has(m)) previousFocus.set(m, document.activeElement);
        }
        root.inert = !!current;
        if (current !== lastTop) {
          if (current) {
            appVars.stageView.clearInput();
            current.tabIndex = -1;
            if (!current.contains(document.activeElement))
              (current.id === 'questionModal'
                ? $('#questionAnswer')
                : focusable(current)[0] || current
              ).focus();
          } else if (lastTop) {
            const old = previousFocus.get(lastTop), closedMenu=old?.closest('details:not([open])');
            const target=closedMenu?.querySelector(':scope > summary') || old;
            if (target?.isConnected && !target.closest('.modal:not(.show):not(.open)')) target.focus();
          }
          lastTop = current;
        }
        for (const m of modals) if (!isOpen(m)) previousFocus.delete(m);
      };
      const observer = new MutationObserver(sync);
      for (const m of modals) observer.observe(m, { attributes: true, attributeFilter: ['class'] });
      document.addEventListener(
        'keydown',
        (e) => {
          const m = top();
          if (!m || document.querySelector('dialog[open]') || e.isComposing || e.keyCode === 229) return;
          if (e.key === 'Tab') {
            const list = focusable(m),
              i = list.indexOf(document.activeElement);
            if (!list.length) {
              e.preventDefault();
              m.focus();
            } else if (i < 0 || (e.shiftKey && i === 0) || (!e.shiftKey && i === list.length - 1)) {
              e.preventDefault();
              list[e.shiftKey ? list.length - 1 : 0].focus();
            }
          }
          if (e.key === 'Escape') {
            if(m.id==='procModal'&&e.target?.closest?.('#callablePending .intent-choices,#callablePending .assist-choices')){
              e.preventDefault();e.stopPropagation();appCalls.closeAssist(appVars.draftEditor);return;
            }
            const blockRoot = e.target?.closest?.('#callableBlocks,#blockEditor');
            if (blockRoot) return; // The block editor closes only its local interaction.
            const close = {
              exportChoiceModal: 'exportChoiceCancel',
              openRefusalModal: 'openRefusalClose',
              loseConfirmModal: 'loseConfirmCancel',
              assetModal: 'assetClose',
              procModal: 'procClose',
              dataModal: 'dataClose',
              diagnosisModal: 'diagnosisClose',
              questionModal: 'questionStop',
              failureModal: 'failureClose',
              valueModal: 'valueClose',
              colorModal: 'colorCancel',
            }[m.id];
            if (close) {
              e.preventDefault();
              e.stopPropagation();
              $('#' + close).click();
            }
          }
        },
        true,
      );
      sync();
    }
    function cancelPlayerExport() {
      // Invalidate both deferred starts before a later chooser can begin another export.
      appVars.exportGeneration++;
      appVars.exportBusy = false;
      $('#exportChoiceModal').classList.remove('show');
      $('#exportControls').disabled = $('#exportArtwork').disabled = false;
      $('#exportBtn').disabled = appCalls.modelLocked();
      appCalls.setStatus('うごく作品を ファイルに するのを やめたよ');
    }
    function downloadProject(presentation) {
      if (appVars.exportBusy || !$('#exportChoiceModal').classList.contains('show') || appCalls.modelLocked()) return;
      if (!appCalls.flushActiveEditor() || appCalls.hasPendingEditor() || hasCallableDraft() || compileProject(appVars.project).errors.length) {
        $('#exportChoiceModal').classList.remove('show'); return;
      }
      appVars.exportBusy = true;
      const generation = ++appVars.exportGeneration;
      const button = $('#exportBtn');
      button.disabled = true;
      $('#exportControls').disabled = $('#exportArtwork').disabled = true;
      appCalls.setStatus('うごく作品を ファイルに しているよ');
      // The file is made after the next paint, so that sentence shows while it is made: a work with many pictures takes
      // seconds, and the page cannot paint meanwhile. A timer stands in where no frame comes (a hidden page).
      let started = false;
      const make = () => {
        if (!started && generation === appVars.exportGeneration && $('#exportChoiceModal').classList.contains('show')) {
          started = true;
          appCalls.writePlayerFile(presentation, button);
        }
      };
      requestAnimationFrame(() => setTimeout(make, 0));
      setTimeout(make, 200);
    }

    // Every refusal of 開く stays on the screen until とじる; the work, its history and unsaved edits stay as they
    // were. A file of another project format says which あかり opens it; any other refusal asks for an あかり file.
    // The code and the full reason stay in 出力.
    // 開く is inside the shared 作品 menu; while that menu is closed its summary takes the focus.
    function openButtonShown() {
      return [$('#openBtn'), $('#projectMenu > summary')]
        .find((n) => n && (n.checkVisibility ? n.checkVisibility({ visibilityProperty: true }) : n.getClientRects().length > 0)) || null;
    }
    function showOpenRefusal(error) {
      $('#openRefusalMessage').textContent = error?.otherFormat
        ? error.message
        : 'あかりで ほぞんした ファイル（名前が「.akari.md」で おわる ファイル）を えらんでね。いまの 作品は そのままだよ。';
      appCalls.setStatus('ファイルを 開けなかったよ');
      // The dialog focuses とじる and gives the focus back to 開く when it closes (setupModalAccessibility).
      openButtonShown()?.focus({ preventScroll: true });
      $('#openRefusalModal').classList.add('show');
    }
    function closeOpenRefusal() {
      $('#openRefusalModal').classList.remove('show');
      setTimeout(() => {
        if (!document.querySelector('.modal.show,.modal.open,dialog[open]') && !openButtonShown()?.contains(document.activeElement))
          openButtonShown()?.focus({ preventScroll: true });
      }, 0);
    }
    function addData() {
      if (appCalls.modelLocked()) return;
      const before = cloneDesignProject(appVars.project);
      let field=$('#dataName');
      clearDataFormError();
      try {
        const scope = $('#dataScope').value,
          kind = $('#dataKind').value,
          name = normalizeCharsOutsideString($('#dataName').value.trim());
        validateName(name);
        const target =
          scope === 'project' ? before.projectData : before.components.find(c=>c.id===appVars.selectedId)?.localData;
        if (!target) throw new Error('部品ごとの へんすう・リストを 作る 部品を えらんで ください');
        if ([...target.variables, ...target.lists].some((x) => x.name === name))
          throw new Error('同じ 名前の へんすう・リストが あります。ちがう 名前に して ください');
        field=kind==='list'&&$('#dataListMode').value==='lines'?$('#dataItems'):$('#dataInitial');
        const initial = parseDataFormInitial(field.value, kind,{mode:$('#dataListMode').value,expectedUnit:kind==='variable'?$('#dataUnit').value||null:null}),
          arr = kind === 'variable' ? target.variables : target.lists;
        arr.push({
          id: appCalls.ensureUniqueId(kind === 'variable' ? 'var' : 'list'),
          name,
          initialValue: initial,
          ...(kind === 'variable' && $('#dataUnit').value ? { expectedUnit: $('#dataUnit').value } : {}),
        });
        validateProject(before);
        appVars.project=before;
        appCalls.markDirty();
        appCalls.renderDataModal();
        appCalls.refreshEditor();
        $('#dataName').value = '';
      } catch (err) {
        showDataFormError(err,field);
      }
    }
    function clearDataFormError(){
      $('#dataFormError').hidden=true;$('#dataFormError').textContent='';
      for(const input of $('#dataModal').querySelectorAll('[aria-invalid]'))input.removeAttribute('aria-invalid');
    }
    function showDataFormError(error,field){
      $('#dataFormError').hidden=false;$('#dataFormError').textContent=`${field?.getAttribute('aria-label')||'へんすう・リスト'}：${error.message}`;
      appCalls.log(`${error.code||''} ${error.message}`,'error');
      field?.setAttribute('aria-invalid','true');field?.focus();
    }
    function updateDataForm(){
      const list=$('#dataKind').value==='list',lines=list&&$('#dataListMode').value==='lines';
      $('#dataListModeLabel').hidden=!list;$('#dataItemsLabel').hidden=!lines;$('#dataInitial').hidden=lines;
      $('#dataUnit').disabled=list;$('#dataInitial').placeholder=list?'れい：［「本」、「かさ」、3］':'れい：0、0点、こんにちは';
    }
    function renderCallableList(prefer = '') {
      renderCallableOptions(prefer);
      if (hasCallableDraft()) {
        paintCallable();
        return;
      }
      const first = prefer || $('#callableSelect').options[0]?.value;
      if (first) loadCallable(first);
      else clearCallable();
    }
    function renderCallableHints() {
      const root = $('#callableHints'),
        t = $('#callableCode');
      if (!root || appVars.composingEditors.has(t)) return;
      let args = $('#callableArgs')
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
          definitionKind: $('#callableType').value,
          args,
          signalNames: appVars.signalNameCache.names,
        }).filter((x) => x.enabled);
      } catch (_) {
        root.textContent = '';
        return;
      }
      const r = drawHints(root, list, $('#callableHintSearch').value, appVars.callableHintPage, (h) => {
        if (appCalls.modelLocked() || appVars.composingEditors.has(t)) return;
        try {
          const result = insertSource(t.value, t.selectionStart, t.selectionEnd, h.text, h.mode);
          t.value = result.source;
          t.setSelectionRange(result.start, result.end);
          updateCallableHeader();
          t.focus();
        } catch (err) {
          appCalls.log(`${err.code || ''} ${err.message}`, 'error');
        }
      });
      appVars.callableHintPage = r.page;
      $('#callableHintCount').textContent = `${r.page + 1}/${r.pages} (${r.total})`;
      $('#callableHintPrev').disabled = r.page === 0;
      $('#callableHintNext').disabled = r.page === r.pages - 1;
    }
    function clearCallable(type = 'action') {
      hideMeijinProcedure();
      appCalls.captureEditorView(appVars.draftEditor);
      appVars.editorDraftSerial++;
      appVars.callableDraftCore = { ownerId: 'stage', type, name: '', argsText: '', source: '', editId: '', loadedKey: '' };
      appVars.callableLoadedKey = '';
      appVars.callableBaseline = callableSignature();
      paintCallable();
      if (appVars.draftEditor.view) renderEditorBinding(appVars.draftEditor);
    }
    function loadCallable(v) {
      const [type, id] = v.split(':'),
        d = (type === 'action' ? appVars.project.actions : appVars.project.functions).find((x) => x.id === id);
      if (!d) return;
      hideMeijinProcedure();
      appCalls.captureEditorView(appVars.draftEditor);
      appVars.callableDraftCore = {
        ownerId: d.ownerId,
        type,
        name: d.name,
        argsText: d.args.join('、'),
        ...(d.callPhrase ? {callPhrase: d.callPhrase} : {}),
        source: d.source,
        editId: id,
        loadedKey: v,
      };
      appVars.callableLoadedKey = v;
      appVars.callableBaseline = callableSignature();
      paintCallable();
      if (appVars.draftEditor.view) renderEditorBinding(appVars.draftEditor);
    }

    function validateCallableDraft(d) { return validateCallableDraftState(d); }
    function captureCallableDraft() {
      return hasCallableDraft() ? validateCallableDraft(appVars.callableDraftCore) : null;
    }
    function restoreCallableDraft(d) {
      const old = [...appVars.project.actions, ...appVars.project.functions].find((x) => x.id === d.editId);
      if (old) loadCallable(`${appVars.project.actions.includes(old) ? 'action' : 'function'}:${old.id}`);
      else clearCallable(d.type);
      appVars.callableDraftCore = {
        ...validateCallableDraft(d),
        editId: old?.id || '',
        loadedKey: old ? d.loadedKey : '',
      };
      appVars.callableLoadedKey = appVars.callableDraftCore.loadedKey;
      appCalls.invalidateEditors();
      paintCallable();
      renderCallableOptions(appVars.callableLoadedKey);
      $('#procModal').classList.add('show');
      renderEditorBinding(appVars.draftEditor);
    }

    function callableSignature() {
      const d = appVars.callableDraftCore;
      return JSON.stringify([d.type, d.name, d.argsText, d.callPhrase || '', d.source]);
    }
    function hasCallableDraft() {
      return appVars.callableBaseline !== '' && callableSignature() !== appVars.callableBaseline;
    }
    function confirmCallableDiscard() {
      if (!appCalls.flushActiveEditor()) return false;
      if (!hasCallableDraft()) return true;
      if (!confirm('自分で作ったブロックに、まだ 決めていない なおしが あるよ。なおしを すてて つづける？'))
        return false;
      appCalls.dropHistoryTimer();
      appCalls.pushHistoryNow();
      if (appVars.callableLoadedKey) loadCallable(appVars.callableLoadedKey);
      else clearCallable(appVars.callableDraftCore.type);
      appCalls.markDirty();
      appCalls.pushHistoryNow();
      return true;
    }
    function updateCallableHeader() {
      if (appVars.syncingDraft) return;
      if (!syncCallableDraft()) return;
      // A code error still renders the draft's toggle, so ブロック turns pale and its press says why (as in the main editor).
      if (appVars.draftEditor.session?.mode !== 'blocks' && !appCalls.saveCodeBinding(appVars.draftEditor)) {
        if (appVars.draftEditor.view) renderEditorBinding(appVars.draftEditor);
        return;
      }
      paintCallable();
      if (appVars.draftEditor.view) {
        renderEditorBinding(appVars.draftEditor);
        if (appVars.draftEditor.session?.mode === 'code') renderCallableHints();
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
        renderEditorBinding(appVars.draftEditor);
      } catch (error) {
        appCalls.showEditorFailure(appVars.draftEditor, error);
      }
    }
    const pauseSlotPress = (event) => {
      if (event.timeStamp - appVars.pauseSlotPressedAt < 500) {
        if (appVars.scheduler?.paused) $('#continueBtn').focus({ preventScroll: true });
        else if (appVars.tutorial) focusTutorialTarget();
        else if (event.currentTarget.closest('#runtimeInspector')) $('#pauseBtn').focus({ preventScroll: true });
        else appVars.el.form.focus({ preventScroll: true });
        return false;
      }
      appVars.pauseSlotPressedAt = event.timeStamp;
      return true;
    };
    async function startProject() {
      if(appVars.tutorial||appCalls.modelLocked())return;
      if(!(await appCalls.askLose())||appVars.tutorial||appCalls.modelLocked())return;
      // A new work starts in はじめて, which shows blocks.
      appVars.baseUiLevel='entry';appVars.editorModes.set('script','blocks');
      try{localStorage.setItem(STORAGE_KEYS.uiLevel,'entry');localStorage.setItem(STORAGE_KEYS.editorMode,'blocks');}catch(_){}
      appCalls.replaceCurrentProject(makeEmptyProject(),makeDefaultAssetStore(),'sprite-1','start','からっぽの 作品だよ。動かすものと きっかけを えらんで、やることを 入れてね');
      applyUiLevel();renderHints();renderEntrySurface();renderEditorBinding(appVars.mainEditor);
    }
    const historyPress = (action, other) => (event) => {
      action();
      if (event.currentTarget.disabled) {
        if (!other.disabled) other.focus({ preventScroll: true });
        else if (shownEditorMode() === 'code') appVars.el.editor.focus({ preventScroll: true });
        else appVars.mainEditor.view?.focus({ id: appVars.mainEditor.session?.blockSelection });
      }
    };
    Object.assign(appCalls, {$, $$, addData, applyUiLevel, bodyNotices, callableSignature, cancelPlayerExport, captureCallableDraft, clearCallable, clearDataFormError, closeOpenRefusal, confirmCallableDiscard, currentIsMeijin, downloadProject, draftOwner, emptyProjectStatus, finishTutorial, fitRunStageMinimum, focusTutorialTarget, formatCallable, hasCallableDraft, headingBlockedNote, historyPress, installColorPicker, installEditorShell, keepTutorialTargetInView, limitInputValue, loadCallable, openButtonShown, openColorPicker, openRuntimeInspector, paintBindingModeToggle, paintCallable, paintRunStrip, pauseSlotPress, placeProjectNameText, refreshTutorialPresentation, renderCallableHints, renderCallableList, renderCallableOptions, renderEditorBinding, renderEntrySurface, renderFullValue, renderHints, renderSelectors, renderSourceOverview, renderTutorialChoices, restoreCallableDraft, selectTutorialInsertion, setStageEnlarged, setStageZoom, setupModalAccessibility, showBlockedNote, showDataFormError, showMeijinProcedure, showModeBlockedNote, showOpenRefusal, showQuestion, showSourceOverview, shownEditorMode, startProject, stopRun, syncCallableDraft, syncEditorShell, syncWideInert, tutorialCapture, tutorialCollectRuntime, tutorialOperationAllowed, uiLevelChoices, updateCallableHeader, updateDataForm, updateEditingLock, validateCallableDraft});
  }
