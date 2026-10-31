  // ────────────────────────────────────────────────────────────────────────
  // 11 — Application tools no other tool uses: what never leads to a redraw. Presenting the tutorial, notes, dialogs
  // and questions, the stage size, placing handles and bubbles, hints, the run state text, the data form and the
  // player file.
  // ────────────────────────────────────────────────────────────────────────
  // The application files come in this order in src/akari.html: a file uses only the files before it and asks the files
  // after it only for a redraw (AUDIT.md「ソースの境界」). Called once at the start of initApp: appVars is the state
  // it shares, appCalls the functions it offers the files after it and those it calls from the files before it; it asks for
  // no redraw.
  function createAppTools(appVars, appCalls, appRedraw) {
    function syncPropertyScrollPadding() {
      const actions = appVars.el.props.querySelector(':scope > .prop-actions');
      appVars.el.props.style.setProperty('--prop-actions-height', (actions?.offsetHeight || 0) + 'px');
    }
    function emptyProjectStatus() {
      if (appCalls.workIsMeijin()) return 'からっぽの 作品だよ。本文を 書いてね。';
      if (document.body.dataset.uiLevel === 'entry') return 'からっぽの 作品だよ。ブロックを 入れてね。「いっしょに作る」でも はじめられるよ。';
      return `からっぽの 作品だよ。${appCalls.shownEditorMode() === 'blocks' ? 'ブロックを 入れるか' : '本文を 書くか'}、「お手本を開く」で ためしてね`;
    }
    function uiLevelChoices(view=appCalls.shownEditorMode()){return appCalls.workIsMeijin()?['meijin']:view==='blocks'?['entry','basic','advanced']:['basic','advanced','meijin'];}
    function tutorialBody() { return appVars.mainEditor.session?.blockView?.bodies?.body||[]; }
    function tutorialLiteral(node) { return node?.schemaId==='QuantityLiteral'?tutorialLiteral(node.inputs.value):node; }
    function tutorialOperationAllowed(binding,operation) {
      if(!appVars.tutorial)return true;if(binding!==appVars.mainEditor||appVars.selectedId!==appVars.tutorial.target||appVars.currentEvent!=='click')return false;
      const step=tutorialStep(appVars.tutorial);if(!step)return false;
      if(step.block){const loc=tutorialDestination(appVars.mainEditor.session.blockView,step);
        if(!appCalls.tutorialInsertionReady(step))return false;
        return operation.type==='insert'&&operation.parentId===loc?.parentId&&operation.body===loc.body&&operation.index===loc.index
          &&JSON.stringify(tutorialNodeShape(operation.node))===JSON.stringify(tutorialNodeShape(tutorialCandidate(step.block,appVars.project)));}
      if(step.ref&&step.action!=='undo'){const role=tutorialField(appVars.mainEditor.session.blockView,step);
        if(operation.type!=='field'||operation.id!==role?.node?.id||operation.key!==role.key)return false;
        return step.input.type==='number'?typeof operation.value==='number'&&Number.isFinite(operation.value)&&operation.value>=step.input.min&&operation.value<=step.input.max&&(!step.integer||Number.isInteger(operation.value))
          :typeof operation.value==='string'&&cpLen(operation.value)<=100;}
      return false;
    }
    // A message above the editor changes its height; the guided place stays in view.
    function keepTutorialTargetInView() {
      if(!appVars.tutorial)return;
      requestAnimationFrame(()=>appCalls.tutorialFocusTargets()[0]?.scrollIntoView({block:'nearest',inline:'nearest'}));
    }
    function clearTutorialPresentation() {
      delete document.body.dataset.tutorialStep;
      appCalls.$$('.tutorial-target').forEach(n=>n.classList.remove('tutorial-target'));
      appCalls.$$('[data-tutorial-blocked]').forEach(n=>{
        if(n.dataset.tutorialAria!==undefined){n.dataset.tutorialAria==='none'?n.removeAttribute('aria-disabled'):n.setAttribute('aria-disabled',n.dataset.tutorialAria);delete n.dataset.tutorialAria;}
        delete n.dataset.tutorialBlocked;
      });
    }
    function tutorialRecordStatement(task,node,epoch,generation) {
      if(!appVars.tutorial||!appVars.tutorialTrace||epoch!==appVars.tutorial.epoch||generation!==appVars.generationToken||appVars.tutorialTrace.epoch!==appVars.tutorial.epoch||!appVars.runtime)return;
      const actor=appVars.runtime.actor(appVars.tutorial.target);if(!actor)return;
      appVars.tutorialTrace.sawTask=true;
      appVars.tutorialTrace.statements.push({kind:node.kind,op:node.op||null,x:actor.x,y:actor.y,click:appVars.tutorialTrace.clicks});
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
    function tutorialFacts() {
      const step=tutorialStep(appVars.tutorial),tree=appVars.mainEditor.session?.blockView,expectedTree=appVars.tutorialExpected?.[appVars.tutorial.index+1];
      const matches=tree&&expectedTree&&JSON.stringify(tutorialNodeShape(tree.bodies.body))===JSON.stringify(tutorialNodeShape(expectedTree.bodies.body));
      let expected=!!matches;
      if(step?.action==='run')expected=expected&&appVars.appState==='RUNNING';
      if(step?.action==='runtime:click')expected=expected&&appVars.tutorialTrace?.trial===step.id.slice(4)&&!!appVars.tutorialTrace.complete;
      if(step?.action==='stop')expected=expected&&appVars.appState==='DESIGN'&&!!appVars.tutorialTrace?.complete;
      if(step?.action==='save')expected=expected&&!!appVars.tutorialSave&&appVars.tutorialSave.fingerprint===appCalls.currentFingerprint();
      if(step?.action==='verify-save')expected=expected&&!!appVars.tutorialSave?.verified;
      return {confirmedStep:appVars.tutorial.confirmedStep,sameWork:appVars.workspaceIdentity===appVars.tutorial.identity&&appVars.selectedId===appVars.tutorial.target&&appVars.currentEvent==='click',
        pending:!!appVars.mainEditor.session?.pendingEdit&&appVars.mainEditor.session.pendingEdit.kind!=='block-draft'||appCalls.composingAny(),
        failed:!!appVars.tutorialTrace?.failed,expected};
    }
    function getEditorSession(binding, { force = false } = {}) {
      const ownerKey = appCalls.bindingOwner(binding),
        source = appCalls.readSource(binding, ownerKey),
        cacheKey = `${binding.kind}:${ownerKey}`;
      let session = appVars.editorSessions.get(cacheKey);
      if (!session)
        session = createEditorSession(
          ownerKey,
          source,
          appCalls.bindingContext(binding),
          appVars.project,
          appVars.editorContextRevision,
        );
      else if (
        force ||
        session.sourceText !== source ||
        session.contextRevision !== appVars.editorContextRevision
      ) {
        const pending = session.pendingEdit, draft = session.blockDraft;
        const draftDisplay = draft ? {
          syntaxAst: session.syntaxAst, blockView: session.blockView,
          nodeMap: session.nodeMap, nodeIds: session.nodeIds,
          blockSelection: session.blockSelection, nextBlockId: session.nextBlockId,
        } : null;
        const validSession = draft ? { ...session, ...draft.baseline, blockDraft: null, pendingEdit: null } : session;
        session = refreshEditorSession(
          validSession,
          source,
          appCalls.bindingContext(binding),
          appVars.project,
          appVars.editorContextRevision,
        );
        if (draft && source === draft.baseline.sourceText) {
          const baseline = { sourceText: session.sourceText, syntaxAst: session.syntaxAst,
            blockView: session.blockView, nodeMap: session.nodeMap, nodeIds: session.nodeIds,
            diagnostics: session.diagnostics, syntaxDiagnostics: session.syntaxDiagnostics,
            nextBlockId: session.nextBlockId, blockSelection: session.blockSelection,
            sourceRevision: session.sourceRevision, contextRevision: session.contextRevision };
          Object.assign(session, draftDisplay, {blockDraft: {...draft, baseline}});
          // The kept draft belongs to the refreshed baseline, so it carries both of its revisions.
          session.pendingEdit = {...pending, sourceRevision: session.sourceRevision, contextRevision: appVars.editorContextRevision};
        } else session.pendingEdit = draft ? null : pending;
      }
      // A work with a 名人 text is code only, for every body and the 自分で作ったブロック editor; the view it opens in is
      // decided by the content, whatever view a file or the autosave kept. The chosen view (editorModes) is not changed
      // by it, so the next work (新しく作る, お手本, 開く) opens as chosen. When the 名人 text goes away in the same work,
      // the view stays code (it is never switched by a level).
      if (appCalls.workIsMeijin()) appVars.meijinShownIn = appVars.workspaceIdentity;
      else if (appVars.meijinShownIn === appVars.workspaceIdentity) {
        appVars.meijinShownIn = null;
        appVars.editorModes.set('script', 'code');
        appVars.editorModes.set('draft', 'code');
      }
      session.mode = appCalls.workIsMeijin() ? 'code' : resolvedEditorMode(appVars.editorModes, binding.kind, session.syntaxAst);
      appVars.editorSessions.set(cacheKey, session);
      binding.session = session;
      return session;
    }
    function invalidateEditors() {
      appVars.editorContextRevision++;
    }
    // A touch body is named with what it touches (「星」に ふれたとき), from the compiled body of the run.
    function runtimeEventText(eventType, scriptKey = null) {
      if (eventType === 'continuous') return 'きまりに 合っている あいだ';
      const filter = scriptKey ? appVars.compiled?.items?.find(item => item.key === scriptKey)?.filter : null;
      return eventText(eventType, filter) || eventType;
    }
    // Where the child finds the first mistake when ▶ 動かす is refused (F-07, F-08): the block view marks it with ⚠ and an
    // orange frame, the code view marks its line number in red. A mistake in a body that is not shown names that body.
    function fixPointer(diagnostic) {
      const { script, definition } = appCalls.diagnosticOwner(diagnostic);
      if (definition) return `「自分で作ったブロック」の「${definition.name}」を 見てね。`;
      const mark = appCalls.shownEditorMode() === 'blocks' ? '⚠ が ついた ところを 見てね。'
        : diagnostic?.line ? `コードの ${diagnostic.line}行目を 見てね。` : 'コードの 赤い ところを 見てね。';
      if (!script || (!appVars.sourceOverviewOpen && scriptBySourceKey(appVars.project, appCalls.bindingOwner(appVars.mainEditor)) === script)) return mark;
      const name = isMeijinScript(script) ? '名人の本文' : appCalls.targetById(script.targetId)?.name || '画面',
        event = isMeijinScript(script) ? '' : eventText(script.event, script.filter);
      return `「${name}」の ${event ? event + 'の ' : ''}本文を えらんで、${mark}`;
    }
    function showDiagnosticMessage(root, diagnostic, location = '', original = null, source = null, { listItem = false } = {}) {
      // A full-width colon after the place (F-26: no ASCII colon in child text).
      const reason = childDiagnosticText(diagnostic, source, appVars.project),
        helpText = (location ? location + '：' : '') + (listItem ? appCalls.sentence(reason) : reason),
        detailText = diagnosticDetailText(diagnostic, original),
        previousHelp = root.querySelector(':scope > .diagnostic-help'),
        previousDetail = root.querySelector(':scope > .diagnostic-details > pre');
      // Refreshing the same diagnostic preserves native disclosure/focus. A changed
      // source location or message always replaces both visible and original text.
      if (previousHelp?.textContent === helpText && previousDetail?.textContent === detailText) return;
      root.replaceChildren();
      const help = document.createElement('div'); help.className = 'diagnostic-help';
      help.textContent = helpText;
      root.append(help); appendDiagnosticDetails(root, diagnostic, original);
    }
    function clearEditorFailure(binding) {
      appCalls.cancelAssist(binding);delete binding.assist;delete binding.failurePresentation;
      const indicator = appCalls.$(binding.kind === 'draft' ? '#callablePending' : '#editorPending');
      indicator.textContent = ''; indicator.hidden = true; delete indicator.dataset.notice;
    }
    function editorCheckScheduled(binding,source) {
      return !!appVars.editorCheckTimer&&!appVars.editorChecks.has(appCalls.bindingOwner(binding)+'\n'+source);
    }
    function stashAssist(binding,error) {
      appCalls.cancelAssist(binding);
      if(!appCalls.assistEligible(binding,error)){delete binding.assist;return false;}
      const diagnostic=error.diagnostics?.[0]||error,proposals=error.proposals||diagnostic.proposals||diagnostic.choices||[];
      binding.assist={basis:error.proposalSource,diagnostic:{...diagnostic,proposals},proposals,ownerKey:appCalls.bindingOwner(binding),contextRevision:appVars.editorContextRevision};
      return true;
    }
    function sourceImportPlan(binding, source) {
      const context = appCalls.bindingContext(binding);
      // A 名人 script keeps its headings: they are its own events, never sent to the parts' bodies.
      if (context.meijin) return null;
      const symbols = buildSymbols(appVars.project),
        parsed = parseSyntax(source, { ...context, symbols });
      if (!parsed.ast?.units?.length) return null;
      appCalls.sourceCandidate(binding, appCalls.bindingOwner(binding), source);
      const sourceKey = appCalls.bindingOwner(binding), original = scriptBySourceKey(appVars.project, sourceKey),
        units = [parsed.ast, ...parsed.ast.units], originalAst = original && parseSyntax(original.source, { targetId: original.targetId, event: original.event, symbols }).ast;
      const normalized = (body, targetId) => {
        const visit = value => {
          if (Array.isArray(value)) return value.map(visit);
          if (!value || typeof value !== 'object') return value;
          const out = {};
          for (const [key, child] of Object.entries(value)) {
            if (key === 'actorRef' && child?.kind === 'named') {
              const id = child.targetId || (namesStage(appVars.project, child.name)
                ? 'stage' : appVars.project.components.find(c => c.name === child.name)?.id);
              out[key] = id === targetId ? { kind: 'self' } : visit(child);
            } else out[key] = visit(child);
          }
          return out;
        };
        return { kind: 'Script', body: visit(body) };
      };
      const signature = metadata => stableJson([metadata.targetId, metadata.event, metadata.filter || null]);
      const existing = appVars.project.scripts.filter(row => row !== original || (row.source.trim() && !originalAst?.units?.length)).flatMap(row => {
        const ast = parseSyntax(row.source, { targetId: row.targetId, event: row.event, symbols }).ast;
        if (!row.source.trim()) return [];
        if (!ast) return [{ row, text: row.source, metadata: { targetId: row.targetId, event: row.event, filter: row.filter }, body: null }];
        return [ast, ...(ast.units || [])].map(unit => {
          const range = SOURCE_RANGES.get(unit)?.range,
            text = range ? row.source.slice(range.start, range.end) : row.source;
          // Inherited headings already carry their resolved event in the full document AST.
          const metadata = unit.heading ? scriptMetadataFromHeading(unit.heading, row, appVars.project)
            : { targetId: row.targetId, event: row.event, filter: row.filter };
          return { row, text, metadata, body: unit.body };
        });
      });
      const entries = units.map(unit => {
        const range = SOURCE_RANGES.get(unit).range, text = source.slice(range.start, range.end),
          metadata = unit.heading ? scriptMetadataFromHeading(unit.heading,
            { targetId: context.targetId, event: context.event }, appVars.project)
            : { targetId: context.targetId, event: context.event, filter: context.filter },
          candidates = existing.filter(x => signature(x.metadata) === signature(metadata)),
          isolated = parseSyntax(text, { ...metadata, symbols }).ast;
        const independent = !!isolated && !isolated.units?.length &&
          astEquivalent(normalized(unit.body, metadata.targetId), normalized(isolated.body, metadata.targetId));
        const equal = candidates.length === 1 && astEquivalent(normalized(unit.body, metadata.targetId),
          normalized(candidates[0].body, metadata.targetId));
        return { text, metadata, candidates, independent, equal };
      });
      for (const entry of entries) if (entries.filter(x => signature(x.metadata) === signature(entry.metadata)).length > 1)
        entry.equal = false;
      const hasExisting = entries.some(x => x.candidates.length),
        safe = entries.every(x => !x.candidates.length || x.equal) && (!hasExisting || entries.every(x => x.independent));
      const canEditCurrent = !!original?.source.trim() && signature(entries[0].metadata) === signature(original) &&
        entries.every(entry => entry.candidates.every(candidate => candidate.row === original));
      return { source, ownerKey: sourceKey, context, entries, hasExisting, safe, canEditCurrent,
        canSplit: entries.every(x => x.independent), projectFingerprint: appCalls.currentFingerprint() };
    }
    function hideSourceImport() { appCalls.$('#sourceImport').hidden = true; appCalls.$('#sourceImport').replaceChildren(); }
    // While the import review waits, ▶ 動かす and うごく作品を ファイルにする say how to finish it, in the words of the
    // review's own buttons.
    function sourceImportChoice() {
      if (appCalls.$('#sourceImport').hidden) return '';
      const take = ['#sourceImportConfirm', '#sourceImportSeparate', '#sourceImportEditCurrent'].map((id) => appCalls.$(id)).find((b) => b && !b.disabled);
      return '本文を 入れる ところを たしかめてね。' + (take ? `「${take.textContent}」か「取りこみを やめる」を おしてね` : '「取りこみを やめる」を おしてね');
    }
    function rememberEditorMode(kind, mode) {
      appVars.editorModes.set(kind, mode);
      if (kind === 'script') {
        try { localStorage.setItem(STORAGE_KEYS.editorMode, mode); } catch (_) {}
      }
    }
    function modeRefusal(binding, shown, codeError = false) {
      if (appVars.appState === 'IMPORTING') return 'busy';
      if (binding === appVars.mainEditor && shown === 'blocks' && document.body.dataset.uiLevel === 'entry') return 'entry';
      if (appCalls.workIsMeijin()) return 'meijin';
      return shown === 'code' && codeError ? 'error' : null;
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
        appCalls.$('#sourceHeadingBtn').after(note);
      }
      return note;
    }
    function showModeBlockedNote(binding) { appCalls.showBlockedNote(appCalls.modeBlockedNote(binding)); }
    function showMeijinProcedure(id) {
      const d = meijinProjectDefinitions(appVars.project).find(x => x.id === id);
      if (!d) { appCalls.hideMeijinProcedure(); return false; }
      appVars.meijinProcedureId = id;
      appCalls.$('#procModal .proc-edit').classList.add('meijin-proc');
      appCalls.$('#meijinProcPanel').hidden = false;
      appCalls.$('#meijinProcTitle').textContent = `てじゅん「${d.name}」／` + (d.args.length ? `入れるもの（${d.args.join('、')}）／` : '') + `名人の本文の ${d.headLine}行目`;
      appCalls.$('#meijinProcBody').textContent = d.source;
      appCalls.$('#meijinProcName').value = d.name;
      appCalls.$('#meijinProcError').hidden = true;
      appCalls.$('#callableSelect').value = 'meijin:' + id;
      for (const button of ['#callableDelete', '#callableSave', '#callableFormat']) appCalls.$(button).disabled = true;
      appCalls.$('#meijinProcRename').disabled = appCalls.modelLocked();
      return true;
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
          const menu=appCalls.$('#projectMenu'),returnToMenu=menu.contains(document.activeElement);
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
    // The edit screen supplies the minimum once per run. Include the scrollbar gutter: a minimum on the scaled child
    // alone would spill out of the designer and be clipped. Overflow belongs to the finite workspace, not the page.
    function fitRunStageMinimum() {
      if (!appVars.runStageMinimum || document.body.classList.contains('stage-enlarged')) return;
      const designer = appCalls.$('#designerWindow'), wrap = appCalls.$('.designer-wrap'), style = getComputedStyle(wrap),
        width = Math.ceil(designer.offsetWidth - wrap.clientWidth + appVars.runStageMinimum.width +
          parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 1),
        height = Math.ceil(designer.offsetHeight - wrap.clientHeight + appVars.runStageMinimum.height +
          parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 1);
      for (const [name, value] of [['--run-stage-min-width', width], ['--run-stage-min-height', height]])
        if (designer.style.getPropertyValue(name) !== value + 'px') designer.style.setProperty(name, value + 'px');
      appVars.stageView.fitStage();
    }
    function setStageEnlarged(on) {
      const button = appCalls.$('#stageEnlarge');
      if (on === document.body.classList.contains('stage-enlarged')) return;
      document.body.classList.toggle('stage-enlarged', on);
      // The enlarged stage is modal: everything around #designerWindow (toolbar, other windows, status line) is inert
      // until it closes, so Tab stays on the stage and a hidden control cannot be pressed (AX-02). The status line's live
      // region stays out of it, so a screen reader still hears what happens (おわったよ…): its neighbours are inert instead.
      for (const node of document.querySelectorAll('[data-enlarged-inert]')) { node.inert = false; delete node.dataset.enlargedInert; }
      const live = appCalls.$('#statusLive'), makeInert = (sibling) => {
        if (sibling.inert) return;
        if (sibling.contains(live)) { for (const child of sibling.children) if (child !== live) makeInert(child); return; }
        sibling.inert = true; sibling.dataset.enlargedInert = '';
      };
      if (on) for (let node = appCalls.$('#designerWindow'); node && node.id !== 'app'; node = node.parentElement)
        for (const sibling of node.parentElement?.children || [])
          if (sibling !== node) makeInert(sibling);
      button.textContent = on ? 'もどる' : '大きく見る';
      button.setAttribute('aria-pressed', String(on));
      if (on) { appVars.enlargedFrom = appVars.stageZoom; appCalls.setStageZoom(1); }
      else { appCalls.setStageZoom(appVars.enlargedFrom ?? null); appVars.enlargedFrom = undefined; }
      button.focus({ preventScroll: true });
    }
    // In wide mode the thumbnail stands for the small stage behind it: the stage and its handles are no Tab stops then.
    // The run screen and the code view do not use wide mode.
    function syncWideInert() {
      const wrap = appCalls.$('#designerWindow > .designer-wrap');
      if (wrap) wrap.inert = document.body.dataset.workbenchWide === 'true' && document.body.dataset.editorMode === 'blocks' &&
        !document.body.classList.contains('runtime') && !document.body.classList.contains('stage-enlarged');
    }
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
    function setAssetProgress(text = '') {
      const n = appCalls.$('#assetProgress');
      if (!n) return;
      n.textContent = text;
      n.style.display = text ? 'block' : 'none';
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
      appCalls.stopPreview();
      for (const id of ['assetModal', 'procModal', 'dataModal'])
        appCalls.$('#' + id)?.classList.remove('show');
    }
    function placeProjectNameText() {
      const text = appCalls.$('#projectNameText'), box = appVars.el.projectName;
      if (text.hidden) return;
      const style = getComputedStyle(box);
      Object.assign(text.style, {
        left: box.offsetLeft + 'px', top: box.offsetTop + 'px', width: box.offsetWidth + 'px', height: box.offsetHeight + 'px',
        paddingLeft: parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth) + 'px', font: style.font,
      });
    }
    function resetHistory() {
      appCalls.dropHistoryTimer();
      appVars.initialSnapshot = appCalls.snapshot();
      appVars.history = [appVars.initialSnapshot];
      appVars.redo = [];
      appVars.lastSavedFingerprint = appCalls.currentFingerprint();
      appVars.lastSavedEditorFingerprint = appCalls.openEditorFingerprint();
      appVars.lastObservedFingerprint = appCalls.stateFingerprintCore();
      appVars.dirty = false;
      appCalls.updateDirty();
    }
    function queueHistory(fingerprint, stateFingerprint) {
      if (appCalls.modelLocked()) return;
      appCalls.dropHistoryTimer();
      const queued = appCalls.snapshot(fingerprint, stateFingerprint);
      appVars.queuedHistory = queued;
      appVars.historyTimer = setTimeout(() => {
        appCalls.pushHistoryNow(queued);
      }, 250);
    }
    function finishOpenSelection() {
      appVars.openRequest = null;
      appVars.el.fileInput.value = '';
      if (!document.querySelector('.modal.show,.modal.open,dialog[open]')) appCalls.openButtonShown()?.focus({preventScroll:true});
    }
    function eventsFor(id) {
      if (id === MEIJIN_OWNER) return ['start'];
      return EVENT_BY_TYPE[appCalls.targetType(id)] || EVENT_BY_TYPE.stage;
    }
    function selectCurrentScript() {
      let row = appVars.selectedScriptId ? appVars.project.scripts.find((x) => x.id === appVars.selectedScriptId &&
        x.targetId === appVars.selectedId && x.event === appVars.currentEvent) : null;
      row ||= appVars.project.scripts.find((x) => x.targetId === appVars.selectedId && x.event === appVars.currentEvent);
      appVars.selectedScriptId = row?.id || null;
      return row;
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
    function applyStage() {
      appVars.stageView.renderStage();
      appVars.el.frame.style.width = appVars.project.stage.width + 6 + 'px';
      appVars.el.title.textContent = appVars.project.name;
    }
    // How far a press must move before it carries a part or a handle, in screen pixels: a finger wobbles more than a
    // mouse or a pen (Chrome's own tap slop is about 15 px).
    const pointerSlop = (e) => e.pointerType === 'touch' ? 8 : 3;
    function positionResizeHandles(c = appVars.designResizePreview || appCalls.componentById(appVars.selectedId)) {
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
          const small = appCalls.designHandlesSmallShown(c),
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
      appCalls.updateDesignHelp(appVars.el.form.querySelector('.design-resize-handle') ? c : null);
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
    function focusResizeHandle(id, direction) {
      appVars.el.form
        .querySelector(
          `.design-resize-handle[data-resize-for="${CSS.escape(id)}"][data-resize-direction="${direction}"]`,
        )
        ?.focus({ preventScroll: true });
    }
    // A name the work cannot take, said before the work is checked (FS2-01): why, and what to write instead.
    function checkPartName(v, { stage = false } = {}) {
      if (!v) throw new Error(stage ? '画面の 名前を 書いてね' : '名前を 書いてね');
      if (cpLen(v) > 80) throw new Error('名前は 80文字までに してね');
      if (/[\p{Cc}\p{Zl}\p{Zp}「」]/u.test(v)) throw new Error('名前に「 」や 行がえは 使えないよ。けしてね');
      if (!stage && (v === 'マウス' || isEdgeTarget(v))) throw new Error('「マウス」と「端（はし）」は 名前に 使えないよ。ちがう 名前に してね');
    }
    // Where a new part's centre goes, in whole steps. The first choice (start) is used when the part fits on the
    // screen there and keeps 10 steps from every visible part. Otherwise the first such spot is taken from the top
    // row down, left to right, in 20-step steps. When there is none, it goes 16 right and 16 down from the first
    // choice while another part's centre is already there.
    function newPartPlace(components, stage, w, h, start) {
      const margin = 10,
        boxes = components.filter((c) => c.visible).map(appCalls.designBox),
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
    function colorChip(node, value) {
      node.classList.toggle('is-none', value === null);
      node.style.setProperty('--chip-color', value || '#ffffff');
    }

    // A failure refers to the source that actually ran. Never search for another
    // occurrence or format the enclosing sentence when repairing that reference.
    function quotedListRepair(record) {
      if (record.code !== 'R411' || !record.quotedList?.ownerKey?.startsWith('script:')) return null;
      const span = record.quotedList.span,
        lines = record.source.match(/[^\r\n]*(?:\r\n?|\n|$)/g) || [],
        offset = (line, column) => lines.slice(0, line - 1).join('').length + column - 1,
        start = offset(span.startLine, span.startColumn), end = offset(span.endLine, span.endColumn),
        original = record.source.slice(start, end);
      if (!(start >= 0 && end > start && end <= record.source.length)) return null;
      try {
        const expression = parseExpression(original, buildSymbols(appVars.project));
        if (expression.kind !== 'StringLiteral' || expression.value !== record.quotedList.name) return null;
      } catch (_) { return null; }
      return { start, end, original };
    }
    function quotedListCandidates(record) {
      const actor = appVars.project.components.find(c => c.id === record.quotedList.targetId), candidates = [];
      for (const [owner, lists, qualifier] of [
        ['作品', appVars.project.projectData.lists, 'project'],
        [actor?.name, actor?.localData.lists || [], 'self'],
      ]) for (const list of lists) candidates.push({ id:list.id, owner,
        label:`${owner}のリスト「${list.name}」`,
        source:nameSource(list.name, qualifier) });
      return candidates;
    }
    // What one running body does now, as Akari says it (1秒 待っているよ, 話しているよ, 答えを 待っているよ). A timed wait
    // names the time still to wait on the run's clock.
    function taskStateText(task) {
      if (task.state === 'BLOCKED') {
        const reason = task.blockReason || {};
        if (reason.kind === 'time' && reason.speechToken) return '話しているよ';
        if (reason.kind === 'time' && Number.isFinite(reason.deadline) && !reason.frame && typeof appVars.runtime?.now === 'function') {
          const left = Math.max(0, Math.ceil((reason.deadline - appVars.runtime.now()) / 100) / 10);
          return `${left}秒 待っているよ`;
        }
        return { condition: 'そう なるまで 待って いるよ', question: '答えを 待っているよ', waitGroup: 'ほかの 動きが おわるのを 待っているよ',
          glide: '時間を かけて 動いているよ', moveUntil: '動いているよ' }[reason.kind] || '待っているよ';
      }
      return { PAUSED: 'いったん 止めたよ', DONE: 'おわったよ', ERROR: '直す ところが あるよ', CANCELLED: '止めたよ' }[task.state] || '動いているよ';
    }
    function monitorValue(value) {
      const short = (v) => {
        const text = displayValue(v).text;
        return cpLen(text) > 160 ? Array.from(text).slice(0, 160).join('') + '\u2026' : text;
      };
      return Array.isArray(value)
        ? '\uff3b' +
            value.slice(0, 40).map(short).join('\u3001') +
            (value.length > 40 ? `\u2026\uff08\u5168${value.length}こ）` : '') +
            '\uff3d'
        : short(value);
    }
    function updateGutter(errors = [], notices = appVars.mainEditor.session?.notices || []) {
      appVars.gutterMarks = { errors, notices };
      // A code view that is not on the screen (the block view) has no width to lay its lines out in: it is laid out when
      // it is shown (the observer below), not with every character on a line of its own.
      if (!appVars.el.editor.clientWidth) return;
      const layout = appCalls.wrappedCodeLines(), count = layout.lines.length,
        key = appCalls.bindingOwner(appVars.mainEditor),
        active = appVars.activeLoc?.key === key ? appVars.activeLoc.line : 0,
        errs = new Set(errors.map((x) => x.line)), noticeLines = new Set(notices.map((x) => x.line));
      for (const mark of [appVars.activeLoc, appVars.keptFail]) if (mark?.key === key && mark.error) errs.add(mark.line);
      let first = 1;
      while (first < count && layout.lines[first].top < appVars.el.editor.scrollTop - 220) first++;
      const last = Math.min(count, first + Math.ceil((appVars.el.editor.clientHeight || 500) / 22) + 25);
      appVars.el.gutter.textContent = '';
      const space = document.createElement('div');
      space.style.height = `${layout.height}px`;
      space.style.position = 'relative';
      for (let i = first; i <= last; i++) {
        const d = document.createElement('div');
        d.className =
          'gutter-line' + (i === active ? ' active' : '') + (errs.has(i) ? ' error' : noticeLines.has(i) ? ' notice' : '');
        d.textContent = i;
        d.style.cssText = `position:absolute;top:${layout.lines[i-1].top}px;height:${layout.lines[i-1].height}px;width:100%`;
        space.appendChild(d);
      }
      appVars.el.gutter.appendChild(space);
      appVars.el.gutter.scrollTop = appVars.el.editor.scrollTop;
    }
    function sourceLocation(task, node, error = null) {
      const frame = task.callFrames[task.callFrames.length - 1],
        def = frame ? appVars.project.actions.find((x) => x.name === frame.name) : null;
      return {
        targetId: task.targetId,
        event: task.eventType,
        scriptId: task.scriptId,
        key:
          error?.akariSource?.key ||
          (def ? `action:${def.id}` : task.scriptId ? `script:${task.scriptId}` : `script:${task.targetId}:${task.eventType}`),
        line: error?.line || node?.sourceSpan?.startLine || appVars.activeLoc?.line || 1,
        column: error?.column || node?.sourceSpan?.startColumn || 1,
        // The sentence the run strip shows: a statement ends on its line; a sentence with a body shows its first line.
        endLine: error ? null : node?.sourceSpan?.endLine ?? null,
        endColumn: error ? null : node?.sourceSpan?.endColumn ?? null,
        error: error || null,
      };
    }
    function runningSentence(source, loc) {
      const line = String(source ?? '').split(/\r\n?|\n/)[loc.line - 1];
      if (line == null) return '';
      const chars = [...line], start = Math.max(0, (loc.column || 1) - 1),
        end = loc.endLine === loc.line && loc.endColumn >= loc.column ? loc.endColumn : chars.length;
      return chars.slice(start, end).join('').trim().replace(/[。、]$/, '');
    }
    // The body a running item comes from (a 名人 text's flows run as items of its own).
    function runningScript(scriptKey) {
      return scriptBySourceKey(appVars.project, appVars.compiled?.items?.find((item) => item.key === scriptKey)?.documentKey || scriptKey);
    }
    function restartHint() {
      const items = appVars.compiled?.items || [],
        inputs = items.filter(item => ['click', 'keyDown', 'valueChanged'].includes(item.event) || appCalls.waitsForExtension(item));
      if (!inputs.length || items.some(item => ['conditionTrue', 'interval'].includes(item.event))) return '';
      const order = id => id === 'stage' ? -1 : appVars.project.components.findIndex(c => c.id === id),
        item = inputs.reduce((first, next) => order(next.targetId) < order(first.targetId) ? next : first),
        name = appCalls.targetById(item.targetId)?.name || appVars.project.stage.name;
      // The stage is 画面 here, as on はじめて's 「画面が おされたとき」 (F-23).
      if (item.event === 'click') return item.targetId === 'stage' ? '画面を おすと 動くよ' : `「${name}」を おすと 動くよ`;
      if (item.event === 'valueChanged') return `「${name}」に 入れると 動くよ`;
      if (item.event === 'message') return `「${appCalls.signalName(item)}」の 合図を 受けると 動くよ`;
      const key = item.filter?.key;
      return key ? `「${appVars.RUN_HINT_KEYS[key] || key}」キーを おすと 動くよ` : 'キーを おすと 動くよ';
    }
    function showRunHint(text) {
      if (text === appVars.runHint) return;
      appVars.runHint = text;
      appCalls.setStatus(text || '動いているよ');
    }
    function noticeSourceOf(owner) {
      return scriptBySourceKey(appVars.project, owner)?.source ?? appVars.project.actions.find(a => owner === 'action:' + a.id)?.source
        ?? appVars.project.functions.find(f => owner === 'function:' + f.id)?.source ?? null;
    }
    // ■ 止める points to the notices of the run once: the same notices after the next run say only 止まって いるよ. A
    // notice in a body that is not shown names that body.
    function stopStatusWithNotices() {
      if (appVars.keptFail?.error) {
        const key = appVars.compiled?.items?.find(item => item.key === appVars.keptFail.key)?.documentKey || appVars.keptFail.key,
          shown = !appVars.sourceOverviewOpen && key === appCalls.bindingOwner(appVars.mainEditor),
          place = shown && appCalls.shownEditorMode() === 'code' && appVars.keptFail.line ? `コードの ${appVars.keptFail.line}行目`
            : shown && document.querySelector('#blockEditor .blockui-current') ? 'オレンジの わくの ところ'
            : appCalls.diagnosticLocation({...appVars.keptFail, where: appVars.keptFail.key});
        return `止まって いるよ。${place}を なおしてね。`;
      }
      const notes = appVars.compiled?.notes || [], key = notes.map(d => d.where + '|' + d.line + '|' + d.code).join(',');
      const before = appVars.pointedNotices;
      appVars.pointedNotices = key;
      if (!notes.length || key === before) return '止まって いるよ';
      const owner = d => appVars.compiled.items?.find(item => item.key === d.where)?.documentKey || d.where;
      const shown = d => appVars.sourceOverviewOpen ? scriptBySourceKey(appVars.project, owner(d))?.targetId === appVars.selectedId : owner(d) === appCalls.bindingOwner(appVars.mainEditor);
      if (notes.some(shown)) return '止まって いるよ。ⓘ が ついた ところに 知らせが あるよ';
      const { key: where, script, definition } = appCalls.diagnosticOwner({ where: owner(notes[0]) });
      const place = definition ? (where.startsWith('function:') ? '答えを もとめる「' : 'てじゅん「') + definition.name + '」'
        : appCalls.meijinTextLabel(script) || `「${appCalls.targetById(script?.targetId)?.name || appVars.project.stage.name}」の ${eventText(script?.event, script?.filter)}の 本文`;
      return `止まって いるよ。${place}に ⓘ の 知らせが あるよ`;
    }
    // The S317 trial of meijinFormsInOrdinary for a body the code view shows (its text, taken or not).
    function meijinFormError(owner, source, errs) {
      const script = scriptBySourceKey(appVars.project, owner);
      if (!script || isMeijinScript(script) || !genericReadingError(errs[0])) return errs;
      const trial = cloneDesignProject(appVars.project), own = trial.scripts.find(x => x.id === script.id);
      if (!own) return errs;
      own.source = source;
      const out = meijinFormsInOrdinary(trial, [{ ...errs[0], where: scriptSourceKey(own) }]);
      if (out[0]?.code !== 'S317') return errs;
      const { proposals, ...first } = errs[0];
      return [{ ...first, code: 'S317', message: out[0].message }, ...errs.slice(1)];
    }
    function drawHints(root, candidates, search, offset, insert) {
      root.textContent = '';
      const symbols = buildSymbols(appVars.project), advanced = document.body.dataset.uiLevel === 'advanced';
      candidates = candidates.filter(h => advanced || !appCalls.hintGroup(h, symbols)?.advanced);
      const query = search.trim().toLocaleLowerCase(),
        filtered = searchHintCandidates(candidates, query, appVars.project),
        page = Math.min(offset, Math.max(0, Math.ceil(filtered.length / 24) - 1)),
        begin = page * 24;
      if (root===appVars.el.hints && /ふれ(?:た|る)とき|さわ(?:った|る)とき|あた(?:った|る)とき|ぶつか(?:った|る)とき/.test(normalizeSearchText(query))) {
        const owner=appVars.project.components.find(c=>c.id===appVars.selectedId),toucher=owner||appVars.project.components.find(c=>c.type==='sprite'),
          part=appVars.project.components.find(c=>c.id!==toucher?.id),example=toucher?sentenceHeadingSource({event:'touchStart',actorRef:appCalls.currentIsMeijin()||!owner?{kind:'named',name:toucher.name}:{kind:'self'},filter:{target:part?.name||'端'}}):null;
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
          b.append(document.createTextNode(appCalls.hintGroup(h, symbols).label + ' · '));
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
    // The heading of a body made a 名人 text: the part is written as its subject (and, for ふれたとき, as the topic).
    function meijinHeadingSource(heading, name) {
      return sentenceHeadingSource({ ...heading, actorRef: { kind: 'named', name } }) + (heading.event === 'touchStart' ? nameSource(name) + 'は、' : '');
    }
    function dispatchRuntime(fn) {
      try {
        return fn();
      } catch (err) {
        if (appVars.scheduler) appVars.scheduler.pause();
        appCalls.log(`${err.code || 'R411'} ${err.message}`, 'error');
        appCalls.setStatus('動きが うまく いかなかったので、いったん 止めたよ');
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
      appCalls.$('#questionText').textContent = q;
      appCalls.$('#questionAnswer').value = '';
      appCalls.$('#questionModal').classList.add('show');
      setTimeout(() => appCalls.$('#questionAnswer').focus(), 0);
    }
    function hideQuestion() {
      appCalls.$('#questionModal').classList.remove('show');
      appVars.questionCb = null;
    }
    function setupModalAccessibility() {
      const root = appCalls.$('#app'),
        modals = appCalls.$$('.modal'),
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
                ? appCalls.$('#questionAnswer')
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
              appCalls.$('#' + close).click();
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
      appCalls.$('#exportChoiceModal').classList.remove('show');
      appCalls.$('#exportControls').disabled = appCalls.$('#exportArtwork').disabled = false;
      appCalls.$('#exportBtn').disabled = appCalls.modelLocked();
      appCalls.setStatus('うごく作品を ファイルに するのを やめたよ');
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
        appCalls.log('うごく作品の ファイルを 作りはじめました', 'ok');
        appCalls.setStatus(`「${appVars.project.name}」を うごく作品の ファイルに したよ`);
      } catch (e) {
        appCalls.log((e.code || 'X600') + ' ' + e.message, 'error');
        appCalls.setStatus('うごく作品を ファイルに できなかったよ');
      } finally {
        if (url) setTimeout(() => URL.revokeObjectURL(url), 60000);
        appCalls.$('#exportChoiceModal').classList.remove('show');
        appCalls.$('#exportControls').disabled = appCalls.$('#exportArtwork').disabled = false;
        button.disabled = appCalls.modelLocked();
        appVars.exportBusy = false;
      }
    }
    function showOpenRefusal(error) {
      appCalls.$('#openRefusalMessage').textContent = error?.otherFormat
        ? error.message
        : 'あかりで ほぞんした ファイル（名前が「.akari.md」で おわる ファイル）を えらんでね。いまの 作品は そのままだよ。';
      appCalls.setStatus('ファイルを 開けなかったよ');
      // The dialog focuses とじる and gives the focus back to 開く when it closes (setupModalAccessibility).
      appCalls.openButtonShown()?.focus({ preventScroll: true });
      appCalls.$('#openRefusalModal').classList.add('show');
    }
    function closeOpenRefusal() {
      appCalls.$('#openRefusalModal').classList.remove('show');
      setTimeout(() => {
        if (!document.querySelector('.modal.show,.modal.open,dialog[open]') && !appCalls.openButtonShown()?.contains(document.activeElement))
          appCalls.openButtonShown()?.focus({ preventScroll: true });
      }, 0);
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
            db = await appCalls.openAutosaveDB();
            await appCalls.autosaveTransaction(db, (store) => store.delete('latest'));
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
        const rec = await appCalls.readAutosave();
        if (
          !rec ||
          epoch !== appVars.recoveryEpoch ||
          appVars.dirty ||
          appCalls.hasCallableDraft() ||
          appCalls.hasPendingEditor() ||
          appCalls.modelLocked()
        )
          return;
        if(!exactKeys(rec,['id','version','updatedAt','revision','workspace','lastSavedFingerprint','lastSavedEditorFingerprint'])||
          rec.id!=='latest'||rec.version!==2||!Number.isFinite(rec.updatedAt)||
          !Number.isSafeInteger(rec.revision)||rec.revision<0||typeof rec.lastSavedFingerprint!=='string')
          throw new AkariError('F503','このパソコンに のこした 作品の 形が 正しく ありません');
        appCalls.validateSavedEditorFingerprint(rec.lastSavedEditorFingerprint);
        const restored=await decodeWorkspaceHistory(rec.workspace);
        if(epoch!==appVars.recoveryEpoch||appVars.dirty||appCalls.hasCallableDraft()||appCalls.hasPendingEditor()||appCalls.modelLocked())return;
        appVars.recoveryData={...rec,restored};
        // The work is named (F-02), and the autosave is called このパソコンに のこす (F-23).
        const keptName=restored.frames?.[restored.cursor]?.project?.name;
        appCalls.$('#recoveryText').textContent=`${new Date(rec.updatedAt).toLocaleString()}に、${keptName?'「'+keptName+'」を ':''}とちゅうまで このパソコンに のこして あるよ。つづきから 作る？ けすと、もう もどせないよ。`;
        // The safe choice comes first and has the focus: つづきから 作る keeps the work, のこした 作品を けす cannot be undone.
        appCalls.setStatus('このパソコンに のこした 作品が あるよ');
        appCalls.$('#recoveryModal').classList.add('show');
        appCalls.$('#recoveryRestore').focus({preventScroll:true});
      } catch (err) {
        if (
          epoch === appVars.recoveryEpoch &&
          !appVars.dirty &&
          !appCalls.hasCallableDraft() &&
          !appCalls.hasPendingEditor() &&
          !appCalls.modelLocked()
        ) {
          appVars.el.autosave.textContent =
            'このパソコンに のこした 作品を もどせるか、たしかめられなかったよ（のこした 作品は そのままだよ）';
          appCalls.log(
            `このパソコンに のこした 作品を たしかめられませんでした。のこした 作品は けして いません。 ${err.code || ''} ${err.message}`,
            'error',
          );
        }
      }
    }
    function clearDataFormError(){
      appCalls.$('#dataFormError').hidden=true;appCalls.$('#dataFormError').textContent='';
      for(const input of appCalls.$('#dataModal').querySelectorAll('[aria-invalid]'))input.removeAttribute('aria-invalid');
    }
    function showDataFormError(error,field){
      appCalls.$('#dataFormError').hidden=false;appCalls.$('#dataFormError').textContent=`${field?.getAttribute('aria-label')||'へんすう・リスト'}：${error.message}`;
      appCalls.log(`${error.code||''} ${error.message}`,'error');
      field?.setAttribute('aria-invalid','true');field?.focus();
    }
    function updateDataForm(){
      const list=appCalls.$('#dataKind').value==='list',lines=list&&appCalls.$('#dataListMode').value==='lines';
      appCalls.$('#dataListModeLabel').hidden=!list;appCalls.$('#dataItemsLabel').hidden=!lines;appCalls.$('#dataInitial').hidden=lines;
      appCalls.$('#dataUnit').disabled=list;appCalls.$('#dataInitial').placeholder=list?'れい：［「本」、「かさ」、3］':'れい：0、0点、こんにちは';
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
    function allowResourceDelete(key, root, removedOwner = null) {
      const impact = resourceChangeImpact(appVars.project, key, { drafts: appCalls.resourceDraftRecords() });
      impact.references = impact.references.filter(r => r.sourceKey !== key);
      impact.uncertain = impact.uncertain.filter(r => r.sourceKey !== key);
      if (removedOwner) {
        impact.references = impact.references.filter(r => r.ownerId !== removedOwner);
        impact.uncertain = impact.uncertain.filter(r => r.ownerId !== removedOwner);
      }
      if (!impact.references.length && !impact.uncertain.length) return true;
      appCalls.showResourceImpact(impact, root); return false;
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
    async function previewSound(snd) {
      if (appCalls.modelLocked()) return;
      appCalls.stopPreview();
      const a = appVars.assetStore.get(snd.assetId);
      if (!a) return;
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) {
        appCalls.log('R415 このブラウザでは 音を 鳴らせません', 'error');
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
          if (appVars.previewAudio?.source === source) appCalls.stopPreview();
        };
        source.start();
      } catch (e) {
        if (!ac || appVars.previewAudio?.context === ac) {
          appCalls.stopPreview();
          appCalls.log(`R415 音を ためしに 鳴らせませんでした: ${e.message || e}`, 'error');
        }
      } finally {
        if (ac && appVars.previewAudio?.context !== ac)
          try {
            await ac.close();
          } catch (_) {}
      }
    }
    const pauseSlotPress = (event) => {
      if (event.timeStamp - appVars.pauseSlotPressedAt < 500) {
        if (appVars.scheduler?.paused) appCalls.$('#continueBtn').focus({ preventScroll: true });
        else if (appVars.tutorial) appCalls.focusTutorialTarget();
        else if (event.currentTarget.closest('#runtimeInspector')) appCalls.$('#pauseBtn').focus({ preventScroll: true });
        else appVars.el.form.focus({ preventScroll: true });
        return false;
      }
      appVars.pauseSlotPressedAt = event.timeStamp;
      return true;
    };
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
    const historyPress = (action, other) => (event) => {
      action();
      if (event.currentTarget.disabled) {
        if (!other.disabled) other.focus({ preventScroll: true });
        else if (appCalls.shownEditorMode() === 'code') appVars.el.editor.focus({ preventScroll: true });
        else appVars.mainEditor.view?.focus({ id: appVars.mainEditor.session?.blockSelection });
      }
    };
    Object.assign(appCalls, {
      allowResourceDelete,
      applyStage,
      cancelPlayerExport,
      checkPartName,
      checkRecovery,
      clearAutosave,
      clearDataFormError,
      clearEditorFailure,
      clearTutorialPresentation,
      closeEditingModals,
      closeOpenRefusal,
      colorChip,
      compactCurrentAssets,
      designDirection,
      designImageUrl,
      dispatchRuntime,
      disposeRuntime,
      drawHints,
      editorCheckScheduled,
      emptyProjectStatus,
      eventsFor,
      fileStemCandidate,
      fillSamplePicture,
      finishOpenSelection,
      fitRunStageMinimum,
      fixPointer,
      focusResizeHandle,
      getEditorSession,
      headingBlockedNote,
      hideQuestion,
      hideSourceImport,
      hideSourceOverview,
      historyPress,
      installToolbarMenus,
      invalidateEditors,
      keepTutorialTargetInView,
      limitInputValue,
      meijinFormError,
      meijinHeadingSource,
      modeRefusal,
      monitorValue,
      newPartPlace,
      noteOutsideParts,
      noticeSourceOf,
      pauseSlotPress,
      placeProjectNameText,
      pointerSlop,
      positionResizeHandles,
      previewSound,
      propSection,
      queueHistory,
      quotedListCandidates,
      quotedListRepair,
      readCallableDraft,
      rememberEditorMode,
      resetHistory,
      restartHint,
      revokeDesignUrls,
      runStateText,
      runningScript,
      runningSentence,
      runtimeEventText,
      selectCurrentScript,
      setAssetProgress,
      setStageEnlarged,
      setupModalAccessibility,
      showDataFormError,
      showDiagnosticMessage,
      showMeijinProcedure,
      showModeBlockedNote,
      showOpenRefusal,
      showQuestion,
      showRunHint,
      sourceImportChoice,
      sourceImportPlan,
      sourceLocation,
      stashAssist,
      stopStatusWithNotices,
      syncPropertyScrollPadding,
      syncWideInert,
      taskStateText,
      tutorialBody,
      tutorialCollectRuntime,
      tutorialFacts,
      tutorialOperationAllowed,
      tutorialRecordStatement,
      uiLevelChoices,
      updateDataForm,
      updateGutter,
      writePlayerFile,
    });
  }
