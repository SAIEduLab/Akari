  // ────────────────────────────────────────────────────────────────────────
  // 11 — Code and block editors: sessions, reading errors and input assistance
  // ────────────────────────────────────────────────────────────────────────
  // Called once at the start of initApp: appVars is the state it shares, appCalls the functions other parts call.
  function createAppEditors(appVars, appCalls) {
    const workIsMeijin=()=>(appVars.project?.scripts||[]).some(isMeijinScript);
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
    function bindingOwner(binding) {
      return binding.kind === 'draft'
        ? appCalls.draftOwner()
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
        targetType: appCalls.targetType(script?.targetId || (event ? id : appVars.selectedId)),
        args: [],
        level: document.body.dataset.uiLevel,
      };
    }
    function getEditorSession(binding, { force = false } = {}) {
      const ownerKey = bindingOwner(binding),
        source = readSource(binding, ownerKey),
        cacheKey = `${binding.kind}:${ownerKey}`;
      let session = appVars.editorSessions.get(cacheKey);
      if (!session)
        session = createEditorSession(
          ownerKey,
          source,
          bindingContext(binding),
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
          bindingContext(binding),
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
      if (workIsMeijin()) appVars.meijinShownIn = appVars.workspaceIdentity;
      else if (appVars.meijinShownIn === appVars.workspaceIdentity) {
        appVars.meijinShownIn = null;
        appVars.editorModes.set('script', 'code');
        appVars.editorModes.set('draft', 'code');
      }
      session.mode = workIsMeijin() ? 'code' : resolvedEditorMode(appVars.editorModes, binding.kind, session.syntaxAst);
      appVars.editorSessions.set(cacheKey, session);
      binding.session = session;
      return session;
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
    // A sentence of a list ends as the others do (FM2-13): with 。, unless it ends with its own mark.
    const sentence = text => /[。？！]$/.test(text) ? text : text + '。';
    function showDiagnosticMessage(root, diagnostic, location = '', original = null, source = null, { listItem = false } = {}) {
      // A full-width colon after the place (F-26: no ASCII colon in child text).
      const reason = childDiagnosticText(diagnostic, source, appVars.project),
        helpText = (location ? location + '：' : '') + (listItem ? sentence(reason) : reason),
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
      cancelAssist(binding);delete binding.assist;delete binding.failurePresentation;
      const indicator = appCalls.$(binding.kind === 'draft' ? '#callablePending' : '#editorPending');
      indicator.textContent = ''; indicator.hidden = true; delete indicator.dataset.notice;
    }
    function cancelAssist(binding) { clearTimeout(binding.assistTimer);binding.assistTimer=0; }
    function closeAssist(binding) {
      const n=appCalls.$(binding.kind==='draft'?'#callablePending':'#editorPending');
      n.querySelectorAll('.intent-choices,.assist-choices').forEach(node=>node.remove());
      binding.textarea.focus();
    }
    function assistEligible(binding,error) {
      const diagnostic=error?.diagnostics?.[0]||error;
      return binding.session?.mode==='code'&&!binding.session.blockDraft&&!bindingContext(binding).meijin&&
        typeof error?.proposalSource==='string'&&diagnostic?.line&&['P201','P205','S317'].includes(diagnostic.code);
    }
    function editorCheckScheduled(binding,source) {
      return !!appVars.editorCheckTimer&&!appVars.editorChecks.has(bindingOwner(binding)+'\n'+source);
    }
    function stashAssist(binding,error) {
      cancelAssist(binding);
      if(!assistEligible(binding,error)){delete binding.assist;return false;}
      const diagnostic=error.diagnostics?.[0]||error,proposals=error.proposals||diagnostic.proposals||diagnostic.choices||[];
      binding.assist={basis:error.proposalSource,diagnostic:{...diagnostic,proposals},proposals,ownerKey:bindingOwner(binding),contextRevision:appVars.editorContextRevision};
      return true;
    }
    function scheduleAssist(binding) {
      cancelAssist(binding);binding.assistTimer=setTimeout(()=>{binding.assistTimer=0;runAssist(binding);},250);
    }
    function runAssist(binding) {
      const a=binding.assist,n=appCalls.$(binding.kind==='draft'?'#callablePending':'#editorPending'),normalize=text=>String(text).replace(/\r\n?/g,'\n');
      const current=()=>a&&!appCalls.modelLocked()&&bindingOwner(binding)===a.ownerKey&&appVars.editorContextRevision===a.contextRevision&&
        normalize(binding.textarea.value)===normalize(a.basis)&&binding.session?.pendingEdit?.value===a.basis&&
        !appVars.composingEditors.has(binding.textarea)&&!n.hidden&&binding.session.mode==='code'&&!binding.session.blockDraft;
      if(!current()||n.querySelector('.assist-choices,.assist-none'))return;
      const basis=normalize(a.basis),ctx={...bindingContext(binding),symbols:buildSymbols(appVars.project),signalNames:appVars.signalNameCache.names},range=assistSourceRange(basis,a.diagnostic,assistVerificationContext(ctx));
      if(!range)return;
      const existing=a.proposals;
      if(existing.length&&!existing.every(p=>/【([^】]+)】という(?:手順|てじゅん)を行う/.test(p.source)&&!range.text.includes(/【([^】]+)】/.exec(p.source)?.[1])))return;
      const data=assistSeeds(range.text,ctx.symbols,ctx);
      if(!/(?:何|なに)も(?:しない|せず|ない)$/.test(data.text)&&/(?:ません|ない|ず|[うくぐすつぬぶむる]な)$/.test(data.text)||/しない ことは 書けません/.test(a.diagnostic.message||''))return;
      const key=JSON.stringify([a.ownerKey,basis,a.diagnostic.code,a.contextRevision]);
      let candidates=binding.assistCache?.key===key?binding.assistCache.candidates:null;
      if(!candidates){candidates=assistCandidates(appVars.project,basis,ctx,a.diagnostic);binding.assistCache={key,candidates};}
      if(!current())return;
      if(!candidates.length){
        if(!existing.length){const empty=document.createElement('p');empty.className='assist-none';empty.textContent='近い 書き方は ありません。「書ける ことば」で さがせます';n.append(empty);}return;
      }
      const choices=document.createElement('span');choices.className='assist-choices';choices.setAttribute('role','group');choices.setAttribute('aria-label','近い 書き方');
      choices.addEventListener('mousedown',event=>event.preventDefault());
      const lead=document.createElement('p');lead.className='assist-lead';lead.textContent=`近い 書き方は これですか？ えらぶと、${a.diagnostic.line}行目を その 文に 書きかえます`;choices.append(lead);
      for(const [index,proposal]of candidates.entries()){
        const button=document.createElement('button');button.type='button';button.dataset.assistChoice='';
        const label=proposal.label||proposal.text,code=document.createElement('code');button.textContent=label;
        if(label.replace(/[\s。]/g,'')!==proposal.text.replace(/[\s。]/g,'')){code.id=(binding.kind==='draft'?'callable':'editor')+'-assist-'+index;code.textContent=proposal.text;button.append(code);button.setAttribute('aria-describedby',code.id);}
        button.onclick=()=>{
          if(!current())return;
          const source=basis.slice(0,proposal.start)+proposal.source+basis.slice(proposal.end),written=basis.slice(proposal.start,proposal.end);
          try{
            appCalls.commitSource(binding,source,{atomic:true,flushQueued:true});binding.textarea.value=source;n.hidden=true;
            let status=`✓ 「${written}」を 書きかえたよ`;
            const signal=/「([^「」]+)」/.exec(proposal.text)?.[1];
            if(signal&&proposal.origin==='S4')status+=proposal.schemaId==='Heading:message'?`。送る ほうにも「「${signal}」の合図を送る。」と 書いてね`:proposal.schemaId==='Broadcast'&&proposal.description?`。受ける ほうには「「${signal}」という合図を受けたとき、」と 書いてね`:'';
            appCalls.setStatus(status);appCalls.renderEditorBinding(binding);refreshEditor();binding.textarea.focus();binding.textarea.setSelectionRange(proposal.start,proposal.start+proposal.source.length);
          }catch(error){binding.textarea.value=source;if(binding.session)binding.session.pendingEdit={ownerKey:bindingOwner(binding),kind:'code',value:source,originalSource:basis,reason:error.message};appCalls.scheduleAutosave();showEditorFailure(binding,error);}
        };
        choices.append(button);
        if(proposal.description){const small=document.createElement('small');small.textContent=proposal.description;choices.append(small);}
      }
      const other=data.headerEvent==='valueChanged'?null:appVars.project.components.find(c=>c.id!==ctx.targetId&&(c.name===data.subject||/止まる|止める|とまる|とめる/.test(data.text)&&data.names.some(n=>n.kind==='part'&&n.name===c.name)));
      if(other){const note=document.createElement('small');note.className='assist-note';note.textContent=`${other.name}が する ことは、${other.name}の 本文に 書きます`;choices.append(note);}
      const cancel=n.querySelector('[data-intent-cancel]')||document.createElement('button');cancel.type='button';cancel.dataset.intentCancel='';cancel.textContent='この あんないを とじる';cancel.onclick=()=>closeAssist(binding);choices.append(cancel);n.append(choices);
      if(!n.assistKeyHandler){n.addEventListener('keydown',event=>{if(event.key==='Escape'&&event.target.closest('.intent-choices,.assist-choices')){event.preventDefault();event.stopPropagation();closeAssist(binding);}});n.assistKeyHandler=true;}
    }
    function showEditorFailure(binding, error, { preservePending = false } = {}) {
      const proposalSource=error?.proposalSource;
      // A reading error that a 名人 text would read says S317 here too, once the code view has checked it (FM2-04).
      if (binding.textarea && genericReadingError(error?.diagnostics?.[0] || error)) {
        const shown = error?.diagnostics?.length ? error.diagnostics : [error], checked = checkedEditorErrors(binding, binding.textarea.value, shown);
        if (checked && checked !== shown && checked[0]?.code === 'S317')
          error = Object.assign(new AkariError(checked[0].code, checked[0].message, checked[0].line, checked[0].column), { diagnostics: checked, proposalSource });
      }
      const reason = error?.message || String(error),
        n = appCalls.$(binding.kind === 'draft' ? '#callablePending' : '#editorPending');
      delete n.dataset.notice;
      if(!n.assistKeyHandler){n.addEventListener('keydown',event=>{if(event.key==='Escape'&&event.target.closest('.intent-choices,.assist-choices')){event.preventDefault();event.stopPropagation();closeAssist(binding);}});n.assistKeyHandler=true;}
      const originalDetails = [error?.code, reason, error?.detail,
        ...(error?.diagnostics || []).map(d => [d.code, d.where,
          d.line ? d.line + '行目 / ' + (d.column || 1) + '文字目' : '', d.message, d.detail].filter(Boolean).join(' / '))].filter(Boolean).join('\n');
      const proposals = error?.proposals || error?.diagnostics?.flatMap(d => d.proposals || d.choices || []) || [];
      const presentation=JSON.stringify([error?.proposalSource,appVars.editorContextRevision,proposals.map(p=>p.source),reason]);
      const retain=binding.failurePresentation===presentation;
      if(!retain){cancelAssist(binding);for(const choices of n.querySelectorAll('.intent-choices,.assist-choices,.assist-none'))choices.remove();showDiagnosticMessage(n, error?.diagnostics?.[0] || error, error?.line ? error.line + '行目' : '', originalDetails, binding.textarea?.value);binding.failurePresentation=presentation;}
      if (proposals.length&&!retain) {
        const original = binding.textarea.value, basis=error.proposalSource,
          sameSource=typeof basis==='string'&&basis.replace(/\r\n?/g,'\n')===original.replace(/\r\n?/g,'\n');
        const boundary=at=>Number.isInteger(at)&&at>=0&&at<=basis.length&&
          !(basis[at-1]==='\r'&&basis[at]==='\n')&&
          !(basis.charCodeAt(at-1)>=0xD800&&basis.charCodeAt(at-1)<=0xDBFF&&basis.charCodeAt(at)>=0xDC00&&basis.charCodeAt(at)<=0xDFFF);
        // Diagnostic ranges count the parsed source. Native input may retain a different newline representation.
        const sourceOffset=at=>{
          let parsed=0,raw=0;
          while(parsed<at){parsed+=basis[parsed]==='\r'&&basis[parsed+1]==='\n'?2:1;raw+=original[raw]==='\r'&&original[raw+1]==='\n'?2:1;}
          return raw;
        };
        const choices = document.createElement('span');
        choices.className = 'intent-choices';
        choices.setAttribute('role', 'group');
        choices.setAttribute('aria-label', 'どの 動きに しますか');
        // A mouse press keeps the focus in the code, so the note is not drawn again (taking its button away) before the click.
        choices.addEventListener('mousedown', (event) => {if(!event.target.closest('[data-intent-input] label'))event.preventDefault();});
        for (const proposal of proposals) {
          if(typeof proposal.source!=='string'||!sameSource||!boundary(proposal.start)||!boundary(proposal.end)||proposal.start>proposal.end)continue;
          const range={start:sourceOffset(proposal.start),end:sourceOffset(proposal.end)};
          if(proposal.input&&(!['angle','index'].includes(proposal.input.kind)||typeof proposal.input.marker!=='string'||!proposal.input.marker||!Number.isInteger(proposal.input.offset)||proposal.input.offset<0||proposal.source.slice(proposal.input.offset,proposal.input.offset+proposal.input.marker.length)!==proposal.input.marker))continue;
          const button = document.createElement('button');
          button.type = 'button'; button.dataset.intentChoice = '';
          button.textContent = proposal.label || proposal.source;
          button.title = proposal.description || proposal.source;
          const ownerKey=bindingOwner(binding), contextRevision=appVars.editorContextRevision;
          button.onclick = () => {
            const current=()=>!appCalls.modelLocked()&&bindingOwner(binding)===ownerKey&&appVars.editorContextRevision===contextRevision&&binding.textarea.value===original;
            if(!current())return;
            const apply=replacement=>{
              if(!current())return;
              const source=original.slice(0,range.start)+replacement+original.slice(range.end);
              try {appCalls.commitSource(binding,source,{atomic:true});binding.textarea.value=source;n.hidden=true;appCalls.setStatus(`✓ 「${original.slice(range.start,range.end)}」を 書きかえたよ`);appCalls.renderEditorBinding(binding);refreshEditor();binding.textarea.focus();binding.textarea.setSelectionRange(range.start,range.start+replacement.length);}
              catch(nextError){binding.textarea.value=source;if(binding.session)binding.session.pendingEdit={ownerKey:bindingOwner(binding),kind:'code',value:source,originalSource:original,reason:nextError.message};appCalls.scheduleAutosave();showEditorFailure(binding,nextError);}
            };
            const input=proposal.input;
            if(!input){apply(proposal.source);return;}
            const normalized=value=>normalizeCharsOutsideString(value).replace(/[－−]/g,'-').replace(/＋/g,'+');
            const valid=value=>/^[+-]?[0-9]+(?:\.[0-9]+)?$/.test(normalized(value))&&Number.isFinite(Number(normalized(value)))&&(input.kind!=='index'||(/^[+]?[0-9]+(?:\.0+)?$/.test(normalized(value))&&Number.isSafeInteger(Number(normalized(value)))&&Number(normalized(value))>=1));
            const filled=value=>{const number=Number(normalized(value)),literal={kind:'NumberLiteral',value:Math.abs(number)},node=number<0?{kind:'UnaryExpression',op:'NEG',value:literal}:literal;return proposal.source.slice(0,input.offset)+formatExpression(node)+proposal.source.slice(input.offset+input.marker.length);};
            choices.querySelector('[data-intent-input]')?.remove();
            const guide=document.createElement('span');guide.dataset.intentInput='';guide.setAttribute('role','group');guide.setAttribute('aria-label',proposal.label+'：'+input.label);const selected=document.createElement('strong');selected.textContent=proposal.label;guide.append(selected);
            const label=document.createElement('label');label.textContent=input.label+'：';
            const field=document.createElement('input');field.type='text';field.inputMode='decimal';field.setAttribute('aria-label',input.label);field.required=true;label.append(field);guide.append(label);
            const confirm=document.createElement('button');confirm.type='button';confirm.textContent='この 数で なおす';confirm.dataset.intentApply='';confirm.disabled=true;
            field.oninput=()=>{confirm.disabled=!valid(field.value);};confirm.onclick=()=>{if(guide.isConnected&&valid(field.value))apply(filled(field.value));};guide.append(confirm);
            const cancel=document.createElement('button');cancel.type='button';cancel.dataset.intentInputCancel='';cancel.textContent='数を 入れるのを やめる';cancel.onclick=()=>{guide.remove();button.focus();};guide.append(cancel);choices.append(guide);
            // Focusing this recovery input blurs the pending code. Its native change must not redraw the guide just opened.
            const previousFocus=appVars.intentInputFocus;appVars.intentInputFocus={textarea:binding.textarea,current};
            try {field.focus();} finally {appVars.intentInputFocus=previousFocus;}
          };
          choices.append(button);
        }
        const cancel = document.createElement('button');
        cancel.type = 'button'; cancel.dataset.intentCancel = ''; cancel.textContent = 'この あんないを とじる';
        cancel.onclick = () => closeAssist(binding);
        choices.append(cancel); n.append(choices);
      }
      n.hidden = false;
      if(stashAssist(binding,error)&&!editorCheckScheduled(binding,error.proposalSource))scheduleAssist(binding);
      // The status line speaks in Akari's voice (F-18): in code it points at the line and the explanation by the code,
      // which keeps the rule's own wording; a block view's message is said as it is.
      const firstDiagnostic = error?.diagnostics?.[0] || error, issueLine = firstDiagnostic?.line || error?.line;
      appVars.editorFailureStatus = binding.session?.mode === 'blocks' ? childDiagnosticText(firstDiagnostic, binding.textarea?.value, appVars.project)
        : issueLine ? `書き方に 直す ところが あるよ。コードの ${issueLine}行目を 見てね`
        : '書き方に 直す ところが あるよ。コードの 下の せつめいを 見てね';
      appCalls.setStatus(appVars.editorFailureStatus);
      if (binding.session?.pendingEdit && !preservePending) {
        binding.session.pendingEdit.reason = reason;
        // Recovery stores the one visible diagnostic, not an unbounded list
        // or proposal sources. Compilation still retains every diagnostic.
        const first = error?.diagnostics?.[0] || (error?.code ? error :
          binding.session.pendingEdit.diagnostics?.[0]);
        binding.session.pendingEdit.diagnostics = [{
          code: first?.code || '', message: first?.message || reason,
          line: first?.line || 1, column: first?.column || 1,
          ...(typeof first?.where === 'string' ? { where: first.where } : {}),
        }];
      }
      if (binding === appVars.mainEditor && binding.session?.pendingEdit) refreshEditor();
      return false;
    }
    function sourceImportPlan(binding, source) {
      const context = bindingContext(binding);
      // A 名人 script keeps its headings: they are its own events, never sent to the parts' bodies.
      if (context.meijin) return null;
      const symbols = buildSymbols(appVars.project),
        parsed = parseSyntax(source, { ...context, symbols });
      if (!parsed.ast?.units?.length) return null;
      appCalls.sourceCandidate(binding, bindingOwner(binding), source);
      const sourceKey = bindingOwner(binding), original = scriptBySourceKey(appVars.project, sourceKey),
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
    function saveCodeBinding(binding, { fromInput = false } = {}) {
      if (binding.session?.blockDraft) return flushEditor(binding);
      if (appCalls.modelLocked() || binding.session?.mode === 'blocks') return true;
      const t = binding.textarea;
      if (appVars.composingEditors.has(t))
        return showEditorFailure(binding, '日本語の 入力を Enterキーで 決めてから つづけて ください');
      const source = t.value.replace(/\r\n?/g, '\n');
      // A textarea normalizes CRLF on display; that alone is not an edit of source.
      if (source === readSource(binding).replace(/\r\n?/g, '\n')) {
        if (binding === appVars.mainEditor) hideSourceImport();
        if (binding.session) binding.session.pendingEdit = null;
        clearEditorFailure(binding);
        return true;
      }
      try {
        if (binding === appVars.mainEditor) {
          const parsed = parseSyntax(source, { ...bindingContext(binding), symbols: buildSymbols(appVars.project) }),
            plan = sourceImportPlan(binding, source);
          if (plan || (fromInput && parsed.ast?.heading && !bindingContext(binding).meijin)) {
            binding.session.pendingEdit = { ownerKey: bindingOwner(binding), kind: plan ? 'source-import' : 'heading-source',
              value: source, reason: plan ? '取りこむ ところを たしかめて 決めて ください' : '書き方は だいじょうぶです。きっかけは、「▶ 動かす」を おすか、ブロックモードに すると 決まります' };
            if (plan) appCalls.showSourceImport(binding, source, plan); else hideSourceImport();
            // The text reads now: a mistake shown for an earlier keystroke goes away above the code. With the review, the
            // status line says what waits instead; a body with its own heading keeps the line until its check is done
            // (refreshEditor says 「✓ 書き方を 直せたよ」 or points to the new mistake, E2E-R2-11).
            clearEditorFailure(binding);
            if (plan) { appVars.editorFailureStatus = null; appCalls.setStatus(appCalls.sourceImportChoice()); }
            appCalls.scheduleAutosave(); appCalls.updateDirty(); return false;
          }
        }
        hideSourceImport();
        appCalls.commitSource(binding, source);
        if (binding.session) binding.session.pendingEdit = null;
        clearEditorFailure(binding);
        return true;
      } catch (error) {
        if (binding.session)
          binding.session.pendingEdit = {
            ownerKey: bindingOwner(binding),
            kind: 'code',
            value: source,
            rejected: error.code === 'F504' || error.code === 'P208',
            reason: error.message,
          };
        appCalls.scheduleAutosave();
        return showEditorFailure(binding, error);
      }
    }
    function flushEditor(binding, { preserveView = false } = {}) {
      if (appCalls.modelLocked()) return true;
      if (binding.session?.mode === 'blocks') {
        const result = binding.view.flush();
        if (!result?.ok)
          return preserveView ? false : showEditorFailure(
            binding,
            result?.reason || '入力を 決めるか、やめて ください',
            { preservePending: true },
          );
        if (binding.session?.blockDraft){
          if (preserveView) return false;
          const index=buildBlockIndex(binding.session.blockView),hole=[...index.values()].find(entry=>entry.node.schemaId.startsWith('Hole:'));
          const parent=hole?.body?index.get(hole.parentId)?.node:null;
          const label=(parent&&BLOCK_SCHEMA_BY_ID.get(parent.schemaId)?.bodies.find(slot=>slot.key===hole.body)?.label)||hole?.node.fields.label||'ブロックや 数・文字';
          // The focus goes to the empty place; the message names the place and what goes in it, one wording per kind
          // of hole (FCB-03, final call 33): a loop's inside takes くり返すこと, a branch of 「もし」 takes することを and is
          // named in 「 」, a hole a value fills names that value (I5V-14).
          if(hole)binding.view.focus({id:hole.node.id});
          const branch=parent?.schemaId==='IfStatement'?{thenBody:'もし',elseBody:'そうでなければ'}[hole.body]:null;
          return showEditorFailure(binding, branch?`「${branch}」の ところが あいて いるよ。することを 入れてね`:`あいている ところが あるよ。${label}を 入れてね`, { preservePending: true });
        }
        return true;
      }
      if (binding.session?.blockDraft) {
        if (appVars.composingEditors.has(binding.textarea))
          return showEditorFailure(binding, '日本語の 入力を Enterキーで きめてから つづけて ください');
        const source = binding.textarea.value.replace(/\r\n?/g, '\n');
        try {
          const parsed = parseSyntax(source, bindingContext(binding));
          if (!parsed.ast) editorError(parsed.syntaxDiagnostics.map(x => x.message).join('\n'));
          validateSyntaxAst(parsed.ast);
          appCalls.sourceCandidate(binding, bindingOwner(binding), source);
          appCalls.commitSource(binding, source, { atomic: true });
          const session = getEditorSession(binding);
          session.blockDraft = null; session.pendingEdit = null;
          appCalls.renderEditorBinding(binding); refreshEditor();
          return true;
        } catch (error) {
          const session = binding.session;
          session.blockDraft.codeSource = source;
          session.pendingEdit = { kind: 'block-draft-code', ownerKey: session.ownerKey,
            sourceRevision: session.sourceRevision, contextRevision: session.contextRevision,
            value: source, reason: error.message };
          appCalls.scheduleAutosave();
          return showEditorFailure(binding, error);
        }
      }
      return saveCodeBinding(binding);
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
        const session = getEditorSession(binding),
          ownerKey = bindingOwner(binding),
          context = bindingContext(binding);
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
            appCalls.invalidateEditors();getEditorSession(binding,{force:true});binding.session.pendingEdit=null;
            clearEditorFailure(binding);appCalls.markDirty();appCalls.dropHistoryTimer();appCalls.pushHistoryNow();
            appCalls.renderSelectors();appCalls.renderEditorBinding(binding);refreshEditor();
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
        if (!candidate.changed) {confirmTutorialOperation();return { ok: true, changed: false };}
        if (candidate.draftOnly) {
          binding.session = { ...session, ...candidate, mode: session.mode };
          appVars.editorSessions.set(`${binding.kind}:${ownerKey}`, binding.session);
          binding.textarea.value = candidate.draftSource;
          const pending = appCalls.$(binding.kind === 'draft' ? '#callablePending' : '#editorPending');
          pending.textContent = 'あいている ところに ブロックや 数・文字を 入れて ください';
          // In blocks the floating controls say this by the block (E-12); the code view shows it here.
          pending.dataset.notice = 'block-draft';
          pending.hidden = false;
          appCalls.renderEditorBinding(binding);
          // The status line says what the floating prompt says, not what was true before the block went in (F2-18).
          appCalls.setStatus(binding.session.pendingEdit?.reason || 'あいている ところを えらんで、ブロックを 入れてね');
          appCalls.scheduleAutosave();
          confirmTutorialOperation();
          return { ok: true, changed: true, draftOnly: true };
        }
        const source = candidate.source ?? candidate.sourceText;
        appCalls.commitSource(binding, source, { atomic: true });
        binding.textarea.value = source;
        const committedOwner=bindingOwner(binding);
        binding.session = refreshEditorSession({
          ...session,
          ...candidate,
          ownerKey:committedOwner,
          mode: session.mode,
          pendingEdit: null,
        },source,bindingContext(binding),appVars.project,appVars.editorContextRevision);
        if(committedOwner!==ownerKey)appVars.editorSessions.delete(`${binding.kind}:${ownerKey}`);
        appVars.editorSessions.set(`${binding.kind}:${committedOwner}`, binding.session);
        appCalls.renderEditorBinding(binding);
        refreshEditor();
        confirmTutorialOperation();
        return { ok: true, changed: true,
          ...(committedOwner!==ownerKey?{ownerTransition:{from:ownerKey,to:committedOwner}}:{}) };
      } catch (error) {
        showEditorFailure(binding, error);
        appCalls.keepTutorialTargetInView();
        return { ok: false, error, reason: error.message };
      }
    }
    function rememberEditorMode(kind, mode) {
      appVars.editorModes.set(kind, mode);
      if (kind === 'script') {
        try { localStorage.setItem(STORAGE_KEYS.editorMode, mode); } catch (_) {}
      }
    }
    function switchEditorMode(binding, mode) {
      // A work with a 名人 text is code only, for every body; はじめて is blocks only (the toggle says so, paintModeToggle).
      if (mode === 'blocks' && workIsMeijin()) {
        appCalls.setStatus(appVars.MODE_REFUSALS.meijin);
        return false;
      }
      if(binding===appVars.mainEditor&&mode==='code'&&document.body.dataset.uiLevel==='entry'){
        appCalls.setStatus(appVars.MODE_REFUSALS.entry);
        return false;
      }
      const draftSession = binding.session;
      if (draftSession?.blockDraft) {
        if (['PREPARING', 'IMPORTING'].includes(appVars.appState)) return false;
        if (draftSession.mode === 'blocks' && !binding.view.flush()?.ok) return false;
        const session = binding.session;
        if (!session.blockDraft) return switchEditorMode(binding, mode);
        if (session.mode === 'code' && mode === 'blocks' &&
            binding.textarea.value !== session.blockDraft.source) {
          if (!flushEditor(binding)) return false;
          return switchEditorMode(binding, mode);
        }
        captureEditorView(binding);
        rememberEditorMode(binding.kind, mode); session.mode = mode;
        session.pendingEdit = session.blockDraft.pending;
        if (mode === 'code') binding.textarea.value = session.blockDraft.codeSource ?? session.blockDraft.source;
        appCalls.renderEditorBinding(binding);
        if (mode === 'code') binding.textarea.focus({ preventScroll: true });
        else binding.view.focus?.({ id: session.blockSelection });
        return true;
      }
      if (binding === appVars.mainEditor && appVars.sourceOverviewOpen) {
        if (!appCalls.flushActiveEditor()) return false;
        rememberEditorMode('script', mode);
        appCalls.syncEditorShell(mode);
        appCalls.renderSourceOverview();
        return true;
      }
      if (binding.kind === 'draft' && !appCalls.syncCallableDraft()) return false;
      if (['PREPARING', 'IMPORTING'].includes(appVars.appState) || !flushEditor(binding)) return false;
      captureEditorView(binding);
      const session = getEditorSession(binding);
      let focusLine = null;
      if (mode === 'blocks' && !session.syntaxAst)
        return showEditorFailure(binding, '書き方の まちがいを コードで 直して ください');
      if (mode === 'blocks' && session.mode === 'code') {
        let offset = session.codeSelection?.start || 0;
        if (/\r/.test(session.sourceText)) {
          const prefix = session.sourceText.replace(/\r\n?/g, '\n').slice(0, offset).split('\n'),
            lines = session.sourceText.match(/[^\r\n]*(?:\r\n?|\n|$)/g);
          offset = lines.slice(0, prefix.length - 1).join('').length + prefix.at(-1).length;
        }
        if (appVars.activeLoc?.key === session.ownerKey) {
          const lines = session.sourceText.match(/[^\r\n]*(?:\r\n?|\n|$)/g);
          offset = lines.slice(0, appVars.activeLoc.line - 1).join('').length +
            [...(lines[appVars.activeLoc.line - 1] || '')].slice(0, (appVars.activeLoc.column || 1) - 1).join('').length;
        }
        const line =
          appVars.activeLoc?.key === session.ownerKey
            ? appVars.activeLoc.line
            : session.sourceText
                .replace(/\r\n?/g, '\n')
                .slice(0, session.codeSelection?.start || 0)
                .split('\n').length;
        focusLine = line;
        const index = buildBlockIndex(session.blockView);
        let nearest = null,
          distance = Infinity, nearestStart = -1;
        for (const [id, location] of session.nodeMap) {
          if (
            BLOCK_SCHEMA_BY_ID.get(index.get(id)?.node.schemaId)?.category !== 'statement' ||
            !location.sourceSpan
          )
            continue;
          const diff = Math.abs(location.sourceSpan.startLine - line);
          const range = location.surface?.range;
          const start = range && range.start <= offset ? range.start : -1;
          if (diff < distance || (diff === distance && start > nearestStart)) {
            nearest = id;
            distance = diff;
            nearestStart = start;
          }
        }
        const statement = index.get(nearest)?.node,
          statementLocation = session.nodeMap.get(nearest);
        // On an inline else line, its body and branch header share the line.
        // An offset inside the body keeps the selected statement instead of
        // letting the header's line mapping override it.
        if (statementLocation?.surface?.inline && statementLocation.surface.range?.start <= offset)
          focusLine = null;
        if (statement && !statementLocation?.surface?.inline &&
            !BLOCK_SCHEMA_BY_ID.get(statement.schemaId)?.bodies.length) {
          let width = Infinity;
          for (const [id, location] of session.nodeMap) {
            const range = location.surface?.range, category = BLOCK_SCHEMA_BY_ID.get(index.get(id)?.node.schemaId)?.category;
            if (['expression', 'target'].includes(category) && range?.start <= offset && offset < range.end && range.end - range.start < width) {
              nearest = id; width = range.end - range.start;
            }
          }
        }
        session.blockSelection = nearest;
        session.codeOriginBlock = nearest;
        session.codeOriginRevision = session.sourceRevision;
      }
      rememberEditorMode(binding.kind, mode);
      session.mode = mode;
      appCalls.renderEditorBinding(binding);
      if (mode === 'blocks') binding.view.focus?.({ id: session.blockSelection, line: focusLine });
      else {
        let selection = session.codeSelection || { start: 0, end: 0 };
        if (
          session.blockSelectionLocation ||
          session.codeOriginRevision !== session.sourceRevision ||
          session.blockSelection !== session.codeOriginBlock
        ) {
          const index = session.blockView ? buildBlockIndex(session.blockView) : new Map();
          let id = session.blockSelection,
            location = session.nodeMap.get(id);
          while (id && !location?.sourceSpan) {
            id = index.get(id)?.parentId;
            location = session.nodeMap.get(id);
          }
          if (location?.sourceSpan) {
            const lines = session.sourceText.replace(/\r\n?/g, '\n').split('\n'),
              line =
                session.blockSelectionLocation?.id === session.blockSelection
                  ? session.blockSelectionLocation.line
                  : location.sourceSpan.startLine,
              start = lines.slice(0, line - 1).reduce((n, s) => n + s.length + 1, 0);
            const point = session.blockSelectionLocation || !location.surface?.range ? start :
              session.sourceText.slice(0, location.surface.range.start).replace(/\r\n?/g, '\n').length;
            selection = { start:point, end:point };
            binding.textarea.scrollTop = Math.max(0, (line - 3) * 22);
          }
        } else {
          binding.textarea.scrollTop = session.scrollState?.codeTop || 0;
          binding.textarea.scrollLeft = session.scrollState?.codeLeft || 0;
        }
        binding.textarea.setSelectionRange(
          selection.start,
          selection.end,
          selection.direction || 'none',
        );
        binding.textarea.focus({ preventScroll: true });
      }
      return true;
    }
    function cancelEditorPending(binding) {
      const importing = binding === appVars.mainEditor && !appCalls.$('#sourceImport').hidden;
      if (binding === appVars.mainEditor) hideSourceImport();
      const draft = binding.session?.blockDraft;
      if (draft) {
        Object.assign(binding.session, draft.baseline, { blockDraft: null, pendingEdit: null });
        appVars.editorSessions.set(`${binding.kind}:${binding.session.ownerKey}`, binding.session);
      }
      binding.view?.cancel();
      appVars.composingEditors.delete(binding.textarea);
      if (binding.session) binding.session.pendingEdit = null;
      if (binding.kind === 'draft') {
        appVars.headerPending = null;
        for (const id of ['#callableName', '#callableArgs', '#callablePhrase']) appVars.composingEditors.delete(appCalls.$(id));
        appCalls.paintCallable();
      }
      binding.textarea.value = readSource(binding);
      clearEditorFailure(binding);
      appCalls.renderEditorBinding(binding);
      if (binding === appVars.mainEditor) { refreshEditor(); appCalls.renderEntrySurface(); }
      appCalls.setStatus(importing ? '取りこみを やめたよ' : '入力を やめたよ');
    }
    function saveEditor(options = {}) {
      if (appCalls.modelLocked()) return true;
      appVars.activeDragCleanup?.();
      return saveCodeBinding(appVars.mainEditor, options);
    }
    function genericReadingError(d) {
      return ['P201', 'P205', 'S301'].includes(d?.code) && !d.proposals?.length && GENERIC_READING_ERRORS.some(re => re.test(d.message));
    }
    function checkedEditorErrors(binding, source, errs, headingAst = null) {
      if (!headingAst && !genericReadingError(errs[0])) return errs;
      const owner = bindingOwner(binding), key = owner + '\n' + (headingAst ? 'heading\n' : '') + source;
      if (appVars.editorChecks.has(key)) return appVars.editorChecks.get(key);
      clearTimeout(appVars.editorCheckTimer);
      appVars.editorCheckTimer = setTimeout(() => {
        appVars.editorCheckTimer = 0;
        if (appCalls.modelLocked() || bindingOwner(binding) !== owner) return;
        let found = errs, taken = false;
        try {
          if (headingAst) {
            // What ▶ would say: taking the body (its heading may change the event or the part) and then the check of the
            // work, for this body (S317 included).
            const next = appCalls.sourceCandidate(binding, owner, source), old = scriptBySourceKey(appVars.project, owner),
              row = old ? next.scripts[appVars.project.scripts.indexOf(old)] : next.scripts.at(-1), key = row && scriptSourceKey(row);
            found = key ? compileProject(next).errors.filter(e => e.where === key) : [];
            taken = true;
          } else found = meijinFormError(owner, source, found);
        } catch (error) { if (!(error instanceof AkariError)) throw error; found = error.diagnostics?.length ? error.diagnostics : [error]; }
        appVars.editorChecks.set(key, found);
        if (appVars.editorChecks.size > 40) appVars.editorChecks.delete(appVars.editorChecks.keys().next().value);
        // The note under the code that holds the text not yet taken says the same.
        if (!headingAst && found !== errs && binding.session?.pendingEdit?.value === source &&
            !appCalls.$(binding.kind === 'draft' ? '#callablePending' : '#editorPending').hidden)
          showEditorFailure(binding, Object.assign(new AkariError(found[0].code, found[0].message, found[0].line, found[0].column), { diagnostics: found, proposalSource:source }));
        // The status line points to the line, as for a reading error (and says so no more once it is fixed).
        if (headingAst && found.length && binding.session?.pendingEdit?.value === source) {
          // As ▶ would say it: a body that could be taken has a mistake in the work (作品に), one that could not in its text.
          appVars.editorFailureStatus = `${taken ? '作品' : '書き方'}に 直す ところが あるよ。${found[0].line ? `コードの ${found[0].line}行目を 見てね` : 'コードの 下の せつめいを 見てね'}`;
          appCalls.setStatus(appVars.editorFailureStatus);
        }
        if (binding === appVars.mainEditor) refreshEditor();
        if(!headingAst&&binding.session?.pendingEdit?.value===source&&binding.assist?.contextRevision===appVars.editorContextRevision){
          const first=found[0];
          if(first&&stashAssist(binding,Object.assign(new AkariError(first.code,first.message,first.line,first.column),{diagnostics:found,proposalSource:source})))runAssist(binding);
        }
      }, 250);
      return headingAst ? null : errs;
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
    function refreshEditor() {
      if (!appVars.mainEditor.view) return;
      const session = getEditorSession(appVars.mainEditor), pending = session.pendingEdit;
      let errs = session.diagnostics?.length ? checkedEditorErrors(appVars.mainEditor, session.sourceText, session.diagnostics) : [], notice = '';
      // The visible pending source can differ from the valid project baseline.
      // Never show a baseline success message over a rejected code edit.
      if (appVars.composingEditors.has(appVars.el.editor)) {
        errs = []; notice = '日本語を 入れて いる とちゅうです。文字を 決めてから、書き方を たしかめます';
      } else if (['code','heading-source','source-import'].includes(pending?.kind) && !session.blockDraft) {
        const parsed = parseSyntax(pending.value, { ...bindingContext(appVars.mainEditor),
          key: session.ownerKey, symbols: buildSymbols(appVars.project) });
        errs = parsed.syntaxDiagnostics.length ? parsed.syntaxDiagnostics
          : staticScaleDiagnostics(parsed.ast, session.ownerKey);
        // A text that reads but was refused when it was taken (its heading names no part, say) shows that mistake, with
        // its line, as the note under the code does.
        if (!errs.length && pending.kind === 'code' && pending.diagnostics?.length) errs = pending.diagnostics;
        // A body with its own heading is checked for its names and meanings too before the line says it is fine.
        const checked = pending.kind === 'source-import' ? errs
          : checkedEditorErrors(appVars.mainEditor, pending.value, errs, pending.kind === 'heading-source' && !errs.length ? parsed.ast : null);
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
        showDiagnosticMessage(appVars.el.issue, errs[0], (errs[0].line || 1) + '行目', null, appVars.el.editor.value);
        appVars.el.issue.className = 'issue-error';
      } else if (notices.length) {
        // The first notice from the top, with how many more there are; one that names its fix offers it (I120).
        const first = notices[0];
        appVars.el.issue.textContent = 'ⓘ ' + (first.line || 1) + '行目：' + sentence(first.message) + (notices.length > 1 ? `ほかにも 知らせが ${notices.length - 1}つ あります。` : '');
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
      appCalls.renderEditorBinding(appVars.mainEditor);
      if (session.mode === 'code') appCalls.renderHints();
    }
    function insertHint(h) {
      if (!h.enabled || appCalls.modelLocked() || !flushEditor(appVars.mainEditor)) return;
      try {
        const t = appVars.el.editor,
          r = insertSource(
            readSource(appVars.mainEditor),
            t.selectionStart,
            t.selectionEnd,
            h.text,
            h.mode,
          );
        appCalls.commitSource(appVars.mainEditor, r.source, { atomic: true });
        t.value = r.source;
        t.setSelectionRange(r.start, r.end);
        refreshEditor();
        const disclosure = appCalls.$('#hintsDisclosure');
        if (disclosure) disclosure.open = false;
        t.focus();
      } catch (err) {
        showEditorFailure(appVars.mainEditor, err);
      }
    }
    function formatCurrent() {
      if (appCalls.modelLocked() || !flushEditor(appVars.mainEditor)) return;
      if (appCalls.currentIsMeijin()) { appCalls.setStatus('名人の本文は、書いた とおりに のこすよ'); return; }
      try {
        const s = getEditorSession(appVars.mainEditor);
        if (!s.syntaxAst) throw new Error('書き方の まちがいを 直してから 整えて ください');
        const source = formatScript(s.syntaxAst);
        appCalls.commitSource(appVars.mainEditor, source, { atomic: true });
        appVars.el.editor.value = source;
        refreshEditor();
      } catch (err) {
        showEditorFailure(appVars.mainEditor, err);
      }
    }

    function captureEditorState() {
      for(const binding of [appVars.mainEditor,appVars.draftEditor])captureEditorView(binding);
      const pendingEditors=[appVars.mainEditor,appVars.draftEditor].filter(binding=>binding.session?.pendingEdit||binding.session?.blockDraft)
        .map(binding=>({kind:binding.kind,ownerKey:bindingOwner(binding),source:binding.textarea.value,mode:binding.session.mode,
          pending:cloneDesignProject(binding.session.pendingEdit||{kind:'block-draft'}),
          draftTree:binding.session.blockDraft?cloneDesignProject(binding.session.blockView):null}));
      let callableDraft=appCalls.captureCallableDraft();
      if(appVars.headerPending||pendingEditors.some(d=>d.kind==='draft'))callableDraft=appCalls.validateCallableDraft({...appVars.callableDraftCore,
        name:appCalls.$('#callableName').value,argsText:appCalls.$('#callableArgs').value,...(appVars.callableDraftCore.type==='action'?{callPhrase:appCalls.$('#callablePhrase').value}:{})});
      return validateEditorState({version:1,revision:appVars.recoveryEpoch,selectedId: appVars.selectedId,currentEvent: appVars.currentEvent,selectedScriptId: appVars.selectedScriptId,
        uiLevel:keptUiLevel(),sourceOverviewOpen: appVars.sourceOverviewOpen,editorModes:{script:appVars.mainEditor.session?.mode||'code',draft:appVars.draftEditor.session?.mode||'code'},callableDraft,pendingEditors,
        views:[appVars.mainEditor,appVars.draftEditor].filter(binding=>binding.session).map(binding=>({kind:binding.kind,ownerKey:bindingOwner(binding),
          codeSelection:{start:binding.textarea.selectionStart||0,end:binding.textarea.selectionEnd||0,direction:binding.textarea.selectionDirection||'none'},
          scrollState:{codeTop:binding.textarea.scrollTop,codeLeft:binding.textarea.scrollLeft}}))},appVars.project);
    }
    function restoreEditorState(state) {
      // Entry is a local presentation choice. The established file enum stays
      // basic/advanced; a transient history view can still retain entry.
      validateEditorState(state.uiLevel==='entry'?{...state,uiLevel:'basic'}:state,appVars.project);
      for(const binding of [appVars.mainEditor,appVars.draftEditor]){binding.view?.cancel();if(binding.session){binding.session.pendingEdit=null;binding.session.blockDraft=null;}}
      appVars.headerPending=null;
      appVars.selectedId=state.selectedId;appVars.currentEvent=state.currentEvent;appVars.selectedScriptId=state.selectedScriptId;
      // A restored basic view keeps this browser's entry preference while the script editor shows blocks.
      let uiLevel=state.uiLevel;
      if(uiLevel==='basic'&&state.editorModes.script==='blocks'){
        let stored=null;
        try{stored=localStorage.getItem(STORAGE_KEYS.uiLevel);}catch(_){}
        if(normalizeEntryUiLevel(stored)==='entry')uiLevel='entry';
      }
      appVars.baseUiLevel=uiLevel;
      // A work with a 名人 text opens in code, whatever view the file or the autosave kept; nothing is said about it. The
      // kept view stays the chosen one (getEditorSession shows code).
      for(const [kind,mode]of Object.entries(state.editorModes))appVars.editorModes.set(kind,mode);
      appVars.editorSessions.clear();appCalls.invalidateEditors();appCalls.hideSourceOverview();appCalls.applyUiLevel();appCalls.renderAll();appCalls.loadEditor();
      if(state.callableDraft)appCalls.restoreCallableDraft(state.callableDraft);
      for(const saved of state.pendingEditors){
        const binding=saved.kind==='draft'?appVars.draftEditor:appVars.mainEditor;
        if(saved.kind==='script'&&bindingOwner(binding)!==saved.ownerKey)throw new AkariError('F503','書きかけの ばしょが 合いません');
        const session=getEditorSession(binding,{force:true});// A reopened draft belongs to this session, so it takes this session's revisions.
        session.pendingEdit={...cloneDesignProject(saved.pending),ownerKey:bindingOwner(binding)};
        // Revisions only exist on pending edits that were saved with them; those now belong to this session.
        if(saved.pending.sourceRevision!==undefined)session.pendingEdit.sourceRevision=session.sourceRevision;
        if(saved.pending.contextRevision!==undefined)session.pendingEdit.contextRevision=session.contextRevision;
        if(saved.draftTree!==null){
          const ast=blockDecode(saved.draftTree,{allowHoles:true}),encoded=blockEncode(ast,{allowHoles:true}),baseline={sourceText:session.sourceText,syntaxAst:session.syntaxAst,
            blockView:session.blockView,nodeMap:session.nodeMap,nodeIds:session.nodeIds,diagnostics:session.diagnostics,syntaxDiagnostics:session.syntaxDiagnostics,
            nextBlockId:session.nextBlockId,blockSelection:session.blockSelection,sourceRevision:session.sourceRevision,contextRevision:session.contextRevision};
          const source=formatScript(ast,{allowHoles:true});Object.assign(session,{syntaxAst:ast,blockView:encoded.tree,nodeMap:encoded.nodeMap,nodeIds:encoded.nodeIds,nextBlockId:encoded.nodeMap.size+1,
            blockDraft:{baseline,ast,tree:encoded.tree,source,codeSource:saved.mode==='code'?saved.source:undefined,pending:session.pendingEdit}});
        }
        const mode=workIsMeijin()?'code':saved.mode;
        if(!workIsMeijin())appVars.editorModes.set(binding.kind,mode);
        session.mode=mode;binding.textarea.value=saved.source;appCalls.renderEditorBinding(binding);
        if(mode==='blocks'&&saved.pending.field&&!binding.view.restorePending(session.pendingEdit))throw new AkariError('F503','書きかけの 入力を もとに もどせません');
        showEditorFailure(binding,saved.pending.reason||'書きかけの 本文を もどしました',{preservePending:true});
        if(binding===appVars.mainEditor&&saved.pending.kind==='source-import'){const plan=sourceImportPlan(binding,saved.source);if(plan)appCalls.showSourceImport(binding,saved.source,plan);}
      }
      for(const view of state.views){const binding=view.kind==='draft'?appVars.draftEditor:appVars.mainEditor;if(view.kind==='script'&&bindingOwner(binding)!==view.ownerKey)continue;
        if(!binding.session)getEditorSession(binding,{force:true});
        Object.assign(binding.session,{codeSelection:{...view.codeSelection},scrollState:{...binding.session?.scrollState,...view.scrollState}});
        binding.textarea.setSelectionRange(view.codeSelection.start,view.codeSelection.end,view.codeSelection.direction);binding.textarea.scrollTop=view.scrollState.codeTop;binding.textarea.scrollLeft=view.scrollState.codeLeft;}
      if(state.sourceOverviewOpen&&!state.pendingEditors.length)appCalls.showSourceOverview();
      appCalls.updateDirty();
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
      if (appCalls.hasCallableDraft() && !drafts.some(d => d.key === 'draft-reference:draft'))
        drafts.push({ key: 'draft-reference:callable', ownerId: 'stage', kind: 'draft', title: 'なおして いる 自分で作ったブロック',
          source: appVars.callableDraftCore.source, context: bindingContext(appVars.draftEditor) });
      return drafts;
    }
    Object.assign(appCalls, {bindingContext, bindingOwner, cancelAssist, cancelEditorPending, captureEditorState, captureEditorView, clearEditorFailure, closeAssist, confirmTutorialOperation, flushEditor, formatCurrent, getEditorSession, hideSourceImport, insertHint, operateBlock, readSource, refreshEditor, resourceDraftRecords, restoreEditorState, saveCodeBinding, saveEditor, sentence, showDiagnosticMessage, showEditorFailure, sourceImportPlan, switchEditorMode, workIsMeijin});
  }
