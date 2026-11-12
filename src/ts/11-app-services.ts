import { AkariError, AssetStore, LIMITS, STORAGE_KEYS, cloneDesignProject, eventText, isMeijinScript, makeImmutableAssetRecord, normalizeCharsOutsideString } from './02-language-contracts.ts';
import { dangoMascotAssetRecord, defaultMascotAssetRecord } from './03-default-assets-core.ts';
import { buildSymbols, makeSampleAssetStore, makeSampleProject, sampleCatalog, validateDesignProject } from './03-default-assets.ts';
import { parseSyntax } from './04-syntax-expressions.ts';
import { BLOCK_SCHEMA_BY_ID, blockDecode, blockEncode, validateSyntaxAst } from './05-command-presentation.ts';
import { formatExpression, formatScript } from './06-source-formatting.ts';
import { collectSignalNames, genericReadingError, scriptBySourceKey, scriptSourceKey, updateScriptSource } from './07-semantic-analysis-core.ts';
import { collectReachableAssetIds, compileProject, encodeWorkspaceHistory, stableJson, validateAssetReferences, validateEditorState } from './07-semantic-analysis.ts';
import { TUTORIAL_COURSES, buildBlockIndex, builtinAssetRecords, editorError, normalizeEntryUiLevel, tutorialAdvance, tutorialSequence, tutorialStep } from './09-editor-sessions.ts';
import { assistCandidates, assistProposalKeepsSubject, assistSeeds, assistSourceRange, assistVerificationContext } from './09-editor-search.ts';
import { childDiagnosticText } from './10-diagnostic-text.ts';
import { pickerHex, pickerHexToHsv, pickerHsvToHex } from './10-block-view.ts';
import type { AppError, AppRedraw, AppServicesCalls, AutosaveRecord, HistoryState, PartDraft, PickerHsv, RestoredEditorState, AppToolsCalls, AppToolsCoreCalls, AppVars, EditorBinding, EditorFailure, SourceImportPlan } from '../types/app.d.ts';
import type { CompiledProject, Diagnostic } from '../types/compiled.d.ts';
import type { BlockIndexEntry } from '../types/blocks.d.ts';
import type { CallableDraft, EditorSession, EditorState, PendingEdit } from '../types/editor.d.ts';
import type { Proposal } from '../types/runtime.d.ts';
import type { Component, ComponentType, EventName, Project, ProjectScript } from '../types/project.d.ts';
import type { Expression, NumberLiteral, Script } from '../types/syntax.d.ts';

// ────────────────────────────────────────────────────────────────────────
// 11 — Application services, the operations other operations use: committing the source, the editors and their
// modes, autosave, notices, selection, the colour picker, stopping a run, opening a project, tutorial steps and custom
// blocks (a run's state, screen, painting, end and failure are in 11-app-run.ts).
// ────────────────────────────────────────────────────────────────────────
// The application files come in this order in src/akari.html: a file uses only the files before it and asks the files
// after it only for a redraw (AUDIT.md「ソースの境界」). Called once at the start of initApp: appVars is the state
// it shares, appCalls the functions it offers the files after it and those it calls from the files before it,
// appRedraw the redraw slots it calls (the drawing fills them).
export function createAppServices(appVars: AppVars, appCalls: AppToolsCoreCalls & AppToolsCalls, appRedraw: AppRedraw): asserts appCalls is AppToolsCoreCalls & AppToolsCalls & AppServicesCalls {
  // shown: the view the editor has just been laid out in (syncEditorShell). Returns true when the shown level changed.
  function applyUiLevel(shown: 'code' | 'blocks' | null=null){
    const meijin=appCalls.workIsMeijin(),before=document.body.dataset.uiLevel;
    // はじめて is a block level: a view laid out in code (a body the blocks cannot show, or 名人 text that went away) goes
    // on at かんたん. The view is never changed by a level.
    if(!meijin&&appVars.baseUiLevel==='entry'&&shown==='code')appVars.baseUiLevel='basic';
    document.body.dataset.meijinLevel=meijin?'on':'off';
    document.body.dataset.uiLevel=meijin?'advanced':appVars.baseUiLevel;
    const select=appCalls.$('#uiLevel'),choices=appCalls.uiLevelChoices(shown||appCalls.shownEditorMode()),value=meijin?'meijin':appVars.baseUiLevel;
    if([...select.options].map(o=>o.value).join()!==choices.join())
      select.replaceChildren(...choices.map(level=>{const option=document.createElement('option');option.value=level;option.textContent=appVars.UI_LEVEL_NAMES[level];return option;}));
    select.value=value;
    const initialHint=appCalls.emptyProjectStatus();
    if(appVars.statusEmptyWorkHint && appVars.statusMessage!==initialHint)appCalls.setStatus(initialHint, true);
    // The コード／ブロック toggle is shown at every level: where it cannot switch (はじめて, a 名人 work) a press says why.
    if(appVars.mainEditor.session)appRedraw.bindingModeToggle(appVars.mainEditor);
    return before!==undefined&&before!==document.body.dataset.uiLevel;
  }
  function tutorialRefresh() {
    if (!appVars.tutorial) return;
    try {
      appCalls.tutorialCollectRuntime();
      if (tutorialStep(appVars.tutorial)?.id==='verify-save'&&appVars.tutorialSave&&appVars.tutorialSave.fingerprint!==appCalls.currentFingerprint()) {
        appVars.tutorialSave=null;appVars.tutorial={...appVars.tutorial,index:tutorialSequence(appVars.tutorial).findIndex(s=>s.id==='save-work')};
      }
      const stepBefore=tutorialStep(appVars.tutorial),facts=appCalls.tutorialFacts();
      // Selecting the click event is itself the first predicate; before that,
      // same-work does not require the event to have already been selected.
      if(stepBefore?.id==='choose-click')facts.sameWork=appVars.workspaceIdentity===appVars.tutorial!.identity&&appVars.selectedId===appVars.tutorial!.target;
      const next=tutorialAdvance(appVars.tutorial!,facts,appVars.tutorial!.epoch),changed=next!==appVars.tutorial;appVars.tutorial=next;
      if (appVars.tutorial.phase==='complete') { finishTutorial(true);appCalls.setStatus('できたね！ つぎは、じゆうに かえて 遊ぼう。');return; }
      // (a guide not complete is at a step)
      const step=tutorialStep(appVars.tutorial)!;document.body.dataset.tutorialStep=step.id;
      if(changed){appVars.tutorialInsertion=null;appVars.mainEditor.view!.render({force:true});}
      appCalls.$('#tutorialGuide').hidden=false;appCalls.$('#tutorialVerifySave').hidden=step.id!=='verify-save';
      appRedraw.tutorialChoices(step);
      if(appVars.tutorialNotice&&appVars.tutorialNotice.step!==step.id)appVars.tutorialNotice=null;
      appCalls.$('#tutorialText').textContent=appVars.tutorialTrace?.failed?'動かなかったね。「■ 止める」で もどって、もう一度 やって みよう。':step.choice==='course'&&appVars.tutorial!.courses.length===TUTORIAL_COURSES.length?'3つの 遊びを 組み合わせたね！ ほぞんして、自分で 遊んでみよう。':appVars.tutorialNotice?.text||step.message;
      appRedraw.tutorialPresentation();
      if(changed)appCalls.focusTutorialTarget();
    } catch(error) { finishTutorial(false);appCalls.log('あんないを つづけられませんでした: '+(error as Error).message,'error');appCalls.setStatus('あんないを つづけられなかったよ。作品は のこって いるよ'); }
  }
  function finishTutorial(completed=false) {
    if (!appVars.tutorial) return;
    const saved=appVars.tutorial;
    appCalls.tutorialCollectRuntime();appVars.tutorial=null;appVars.tutorialInsertion=null;appVars.tutorialNotice=null;++appVars.tutorialEpoch;
    clearInterval(appVars.tutorialTimer);appVars.tutorialTimer=null;
    if(appVars.runtime||appVars.scheduler||appVars.appState==='PREPARING')stopRun();
    appVars.activeDragCleanup?.();appVars.mainEditor.view!.releaseInteraction();
    if(!completed){
      let index=saved.index;
      const step=tutorialSequence(saved)[index];
      if(step?.id.startsWith('try-')||step?.id.startsWith('stop-'))index=tutorialSequence(saved).findIndex(s=>s.id==='run-'+step.id.split('-').slice(1).join('-'));
      appVars.pausedTutorial={...saved,index,trace:appVars.tutorialTrace?cloneDesignProject(appVars.tutorialTrace):null,fingerprint:appCalls.currentFingerprint(),editorFingerprint:appCalls.openEditorFingerprint()};
    }else appVars.pausedTutorial=null;
    appVars.tutorialTrace=null;appVars.tutorialSave=null;appCalls.clearTutorialPresentation();appCalls.$('#tutorialGuide').hidden=true;
    if(appVars.mainEditor.session?.pendingEdit){const field=appVars.mainEditor.session.pendingEdit;const control=appCalls.$$('[data-blockui-field]').find(n=>n.dataset.blockId===field.id&&n.dataset.blockuiField===field.field);control?.focus({preventScroll:true});}
    else appCalls.$('#tutorialStart').focus({preventScroll:true});
  }
  function commitSource(binding: EditorBinding, source: string, { atomic = false, flushQueued = false }: { atomic?: boolean; flushQueued?: boolean } = {}) {
    if (appCalls.modelLocked()) return false;
    const ownerKey = appCalls.bindingOwner(binding),
      before = appCalls.readSource(binding, ownerKey);
    if (source === before) return false;
    const next = appCalls.sourceCandidate(binding, ownerKey, source);
    if (atomic) {
      if (flushQueued && appVars.queuedHistory) appCalls.pushHistoryNow(appVars.queuedHistory);
      appCalls.dropHistoryTimer();
      const session = binding.session, pending = session?.pendingEdit;
      // (a pending edit is a session's)
      const importing = binding === appVars.mainEditor && pending?.kind === 'source-import' &&
        session!.ownerKey === ownerKey && pending.ownerKey === ownerKey &&
        pending.value === source && !session!.blockDraft;
      if (importing) {
        // The confirmed input is not the valid body before this atomic change.
        session!.pendingEdit = null;
        try { if (!appCalls.hasPendingEditor()) appCalls.pushHistoryNow(); }
        finally { session!.pendingEdit = pending; }
      } else if (!appCalls.hasPendingEditor()) appCalls.pushHistoryNow();
    }
    if (binding.kind === 'draft') appVars.callableDraftCore = { ...appVars.callableDraftCore, source };
    else {
      // (the source of a body makes a work: sourceCandidate)
      const old = scriptBySourceKey(appVars.project, ownerKey),
        oldIndex = old ? appVars.project.scripts.indexOf(old) : -1,
        row = scriptBySourceKey(next!, ownerKey) ||
          (oldIndex >= 0 ? next!.scripts[oldIndex] : next!.scripts.at(-1));
      appVars.project = next!;
      if (row) {
        const changedOwner = appVars.selectedId !== row.targetId;
        appVars.selectedId = row.targetId; appVars.currentEvent = row.event; appVars.selectedScriptId = row.id || null;
        if (changedOwner) { appRedraw.tree(); appRedraw.properties(); }
      }
      appRedraw.selectors();
    }
    appCalls.invalidateEditors();
    // (getEditorSession gives the editor its session)
    appCalls.getEditorSession(binding, { force: true });
    binding.session!.pendingEdit = null;
    appCalls.clearEditorFailure(binding);
    markDirty();
    if (atomic) {
      appCalls.dropHistoryTimer();
      appCalls.pushHistoryNow();
    }
    if (binding.kind === 'draft') appRedraw.callable();
    return true;
  }
  function scheduleAssist(binding: EditorBinding) {
    appCalls.cancelAssist(binding);binding.assistTimer=setTimeout(()=>{binding.assistTimer=0;runAssist(binding);},250);
  }
  function runAssist(binding: EditorBinding) {
    const a=binding.assist,n=appCalls.$(binding.kind==='draft'?'#callablePending':'#editorPending'),normalize: (text: unknown) => string=text=>String(text).replace(/\r\n?/g,'\n');
    const current=()=>a&&!appCalls.modelLocked()&&appCalls.bindingOwner(binding)===a.ownerKey&&appVars.editorContextRevision===a.contextRevision&&
      normalize(binding.textarea.value)===normalize(a.basis)&&binding.session?.pendingEdit?.value===a.basis&&
      !appVars.composingEditors.has(binding.textarea)&&!n.hidden&&binding.session.mode==='code'&&!binding.session.blockDraft;
    if(!current()||n.querySelector('.assist-choices,.assist-none'))return;
    // (the help is there: current)
    const basis=normalize(a!.basis),ctx={...appCalls.bindingContext(binding),symbols:buildSymbols(appVars.project),signalNames:appVars.signalNameCache.names},range=assistSourceRange(basis,a!.diagnostic,assistVerificationContext(ctx));
    if(!range)return;
    const existing=a!.proposals;
    if(existing.length&&!existing.every(p=>/【([^】]+)】という(?:手順|てじゅん)を行う/.test(p.source)&&!range.text.includes(/【([^】]+)】/.exec(p.source)?.[1]!)))return;
    const data=assistSeeds(range.text,ctx.symbols,ctx);
    if(!/(?:何|なに)も(?:しない|せず|ない)$/.test(data.text)&&/(?:ません|ない|ず|[うくぐすつぬぶむる]な)$/.test(data.text)||/しない ことは 書けません/.test(a!.diagnostic.message||''))return;
    const key=JSON.stringify([a!.ownerKey,basis,a!.diagnostic.code,a!.contextRevision]);
    let candidates=binding.assistCache?.key===key?binding.assistCache.candidates:null;
    if(!candidates){candidates=assistCandidates(appVars.project,basis,ctx,a!.diagnostic);binding.assistCache={key,candidates};}
    if(!current())return;
    if(!candidates.length){
      if(!existing.length){const empty=document.createElement('p');empty.className='assist-none';empty.textContent='近い 書き方は ありません。「書ける ことば」で さがせます';n.append(empty);}return;
    }
    const choices=document.createElement('span');choices.className='assist-choices';choices.setAttribute('role','group');choices.setAttribute('aria-label','近い 書き方');
    choices.addEventListener('mousedown',event=>event.preventDefault());
    const lead=document.createElement('p');lead.className='assist-lead';lead.textContent=`近い 書き方は これですか？ えらぶと、${a!.diagnostic.line}行目を その 文に 書きかえます`;choices.append(lead);
    for(const [index,proposal]of candidates.entries()){
      const button=document.createElement('button');button.type='button';button.dataset.assistChoice='';
      const label=proposal.label||proposal.text,code=document.createElement('code');button.textContent=label;
      if(label.replace(/[\s。]/g,'')!==proposal.text.replace(/[\s。]/g,'')){code.id=(binding.kind==='draft'?'callable':'editor')+'-assist-'+index;code.textContent=proposal.text;button.append(code);button.setAttribute('aria-describedby',code.id);}
      button.onclick=()=>{
        if(!current())return;
        const source=basis.slice(0,proposal.start)+proposal.source+basis.slice(proposal.end),written=basis.slice(proposal.start,proposal.end).replace(/[。\s]+$/,'');
        try{
          commitSource(binding,source,{atomic:true,flushQueued:true});binding.textarea.value=source;n.hidden=true;
          let status=`✓ 「${written}」を 書きかえたよ`;
          const signal=/「([^「」]+)」/.exec(proposal.text)?.[1];
          if(signal&&proposal.origin==='S4')status+=proposal.schemaId==='Heading:message'?`。送る ほうにも「「${signal}」の合図を送る。」と 書いてね`:proposal.schemaId==='Broadcast'&&proposal.description?`。受ける ほうには「「${signal}」という合図を受けたとき、」と 書いてね`:'';
          appCalls.setStatus(status);appRedraw.editorBinding(binding);appRedraw.editor();binding.textarea.focus();binding.textarea.setSelectionRange(proposal.start,proposal.start+proposal.source.length);
        }catch(error){binding.textarea.value=source;if(binding.session)binding.session.pendingEdit={ownerKey:appCalls.bindingOwner(binding),kind:'code',value:source,originalSource:basis,reason:(error as AppError).message};scheduleAutosave();showEditorFailure(binding,error as AppError);}
      };
      choices.append(button);
      if(proposal.description){const small=document.createElement('small');small.textContent=proposal.description;choices.append(small);}
    }
    const cancel=n.querySelector<HTMLButtonElement>('[data-intent-cancel]')||document.createElement('button');cancel.type='button';cancel.dataset.intentCancel='';cancel.textContent='この あんないを とじる';cancel.onclick=()=>appCalls.closeAssist(binding);choices.append(cancel);n.append(choices);
    // (the note keeps whether it listens to Escape; a key's target there is an element)
    if(!(n as HTMLElement & { assistKeyHandler?: boolean }).assistKeyHandler){n.addEventListener('keydown',event=>{if(event.key==='Escape'&&(event.target as Element).closest('.intent-choices,.assist-choices')){event.preventDefault();event.stopPropagation();appCalls.closeAssist(binding);}});(n as HTMLElement & { assistKeyHandler?: boolean }).assistKeyHandler=true;}
  }
  function showEditorFailure(binding: EditorBinding, error: EditorFailure, { preservePending = false }: { preservePending?: boolean } = {}) {
    const proposalSource=error?.proposalSource;
    // A reading error that a 名人 text would read says S317 here too, once the code view has checked it (FM2-04).
    if (binding.textarea && genericReadingError(error?.diagnostics?.[0] || error)) {
      // (a reading error was thrown: words are none)
      const shown = error?.diagnostics?.length ? error.diagnostics : [error as AppError], checked = checkedEditorErrors(binding, binding.textarea.value, shown);
      if (checked && checked !== shown && checked[0]?.code === 'S317')
        error = Object.assign(new AkariError(checked[0].code, checked[0].message, checked[0].line, checked[0].column), { diagnostics: checked, proposalSource });
    }
    const reason = error?.message || String(error),
      n = appCalls.$(binding.kind === 'draft' ? '#callablePending' : '#editorPending');
    delete n.dataset.notice;
    // (the note keeps whether it listens to Escape; a key's target there is an element)
    if(!(n as HTMLElement & { assistKeyHandler?: boolean }).assistKeyHandler){n.addEventListener('keydown',event=>{if(event.key==='Escape'&&(event.target as Element).closest('.intent-choices,.assist-choices')){event.preventDefault();event.stopPropagation();appCalls.closeAssist(binding);}});(n as HTMLElement & { assistKeyHandler?: boolean }).assistKeyHandler=true;}
    const originalDetails = [error?.code, reason, error?.detail,
      ...(error?.diagnostics || []).map(d => [d.code, d.where,
        d.line ? d.line + '行目 / ' + (d.column || 1) + '文字目' : '', d.message, d.detail].filter(Boolean).join(' / '))].filter(Boolean).join('\n');
    // A rewrite keeps who does the next sentence (assistProposalKeepsSubject).
    const proposals = (error?.proposals || error?.diagnostics?.flatMap(d => d.proposals || (d as Diagnostic & { choices?: Proposal[] }).choices || []) || []).map(p => assistProposalKeepsSubject(p, error?.proposalSource, { ...appCalls.bindingContext(binding), symbols: buildSymbols(appVars.project) }, appVars.project));
    const presentation=JSON.stringify([error?.proposalSource,appVars.editorContextRevision,proposals.map(p=>p.source),reason]);
    const retain=binding.failurePresentation===presentation;
    if(!retain){appCalls.cancelAssist(binding);for(const choices of n.querySelectorAll('.intent-choices,.assist-choices,.assist-none'))choices.remove();appCalls.showDiagnosticMessage(n, error?.diagnostics?.[0] || error, error?.line ? error.line + '行目' : '', originalDetails, binding.textarea?.value);binding.failurePresentation=presentation;}
    if (proposals.length&&!retain) {
      const original = binding.textarea.value, basis=error.proposalSource,
        sameSource=typeof basis==='string'&&basis.replace(/\r\n?/g,'\n')===original.replace(/\r\n?/g,'\n');
      // (the two read the source the proposals were made for only when it is the one in the editor: sameSource; a place
      // is read once it is a whole number)
      const boundary: (at: number | undefined) => boolean=at=>Number.isInteger(at)&&at!>=0&&at!<=basis!.length&&
        !(basis![at!-1]==='\r'&&basis![at!]==='\n')&&
        !(basis!.charCodeAt(at!-1)>=0xD800&&basis!.charCodeAt(at!-1)<=0xDBFF&&basis!.charCodeAt(at!)>=0xDC00&&basis!.charCodeAt(at!)<=0xDFFF);
      // Diagnostic ranges count the parsed source. Native input may retain a different newline representation.
      const sourceOffset: (at: number) => number=at=>{
        let parsed=0,raw=0;
        while(parsed<at){parsed+=basis![parsed]==='\r'&&basis![parsed+1]==='\n'?2:1;raw+=original[raw]==='\r'&&original[raw+1]==='\n'?2:1;}
        return raw;
      };
      const choices = document.createElement('span');
      choices.className = 'intent-choices';
      choices.setAttribute('role', 'group');
      choices.setAttribute('aria-label', 'どの 動きに しますか');
      // A mouse press keeps the focus in the code, so the note is not drawn again (taking its button away) before the click.
      choices.addEventListener('mousedown', (event) => {if(!(event.target as Element).closest('[data-intent-input] label'))event.preventDefault();});
      for (const proposal of proposals) {
        if(typeof proposal.source!=='string'||!sameSource||!boundary(proposal.start)||!boundary(proposal.end)||proposal.start!>proposal.end!)continue;
        // (both places are whole numbers: boundary)
        const range={start:sourceOffset(proposal.start!),end:sourceOffset(proposal.end!)};
        if(proposal.input&&(!['angle','index'].includes(proposal.input.kind)||typeof proposal.input.marker!=='string'||!proposal.input.marker||!Number.isInteger(proposal.input.offset)||proposal.input.offset<0||proposal.source.slice(proposal.input.offset,proposal.input.offset+proposal.input.marker.length)!==proposal.input.marker))continue;
        const button = document.createElement('button');
        button.type = 'button'; button.dataset.intentChoice = '';
        button.textContent = proposal.label || proposal.source;
        button.title = proposal.description || proposal.source;
        const ownerKey=appCalls.bindingOwner(binding), contextRevision=appVars.editorContextRevision;
        button.onclick = () => {
          const current=()=>!appCalls.modelLocked()&&appCalls.bindingOwner(binding)===ownerKey&&appVars.editorContextRevision===contextRevision&&binding.textarea.value===original;
          if(!current())return;
          const apply: (replacement: string) => void=replacement=>{
            if(!current())return;
            const source=original.slice(0,range.start)+replacement+original.slice(range.end);
            try {commitSource(binding,source,{atomic:true});binding.textarea.value=source;n.hidden=true;appCalls.setStatus(`✓ 「${original.slice(range.start,range.end)}」を 書きかえたよ`);appRedraw.editorBinding(binding);appRedraw.editor();binding.textarea.focus();binding.textarea.setSelectionRange(range.start,range.start+replacement.length);}
            catch(nextError){binding.textarea.value=source;if(binding.session)binding.session.pendingEdit={ownerKey:appCalls.bindingOwner(binding),kind:'code',value:source,originalSource:original,reason:(nextError as AppError).message};scheduleAutosave();showEditorFailure(binding,nextError as AppError);}
          };
          const input=proposal.input;
          if(!input){apply(proposal.source);return;}
          const normalized: (value: string) => string=value=>normalizeCharsOutsideString(value).replace(/[－−]/g,'-').replace(/＋/g,'+');
          const valid: (value: string) => boolean=value=>/^[+-]?[0-9]+(?:\.[0-9]+)?$/.test(normalized(value))&&Number.isFinite(Number(normalized(value)))&&(input.kind!=='index'||(/^[+]?[0-9]+(?:\.0+)?$/.test(normalized(value))&&Number.isSafeInteger(Number(normalized(value)))&&Number(normalized(value))>=1));
          const filled: (value: string) => string=value=>{const number=Number(normalized(value)),literal: NumberLiteral={kind:'NumberLiteral',value:Math.abs(number)},node: Expression=number<0?{kind:'UnaryExpression',op:'NEG',value:literal}:literal;return proposal.source.slice(0,input.offset)+formatExpression(node)+proposal.source.slice(input.offset+input.marker.length);};
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
        // What the rewrite also writes in the next sentence (自分は) is shown under the button, as for the near sentences.
        if(proposal.note){const small=document.createElement('small');small.textContent=proposal.note;choices.append(small);}
      }
      const cancel = document.createElement('button');
      cancel.type = 'button'; cancel.dataset.intentCancel = ''; cancel.textContent = 'この あんないを とじる';
      cancel.onclick = () => appCalls.closeAssist(binding);
      choices.append(cancel); n.append(choices);
    }
    n.hidden = false;
    // (the help is kept for a mistake with the source it was read from: stashAssist)
    if(appCalls.stashAssist(binding,error)&&!appCalls.editorCheckScheduled(binding,error.proposalSource!))scheduleAssist(binding);
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
    if (binding === appVars.mainEditor && binding.session?.pendingEdit) appRedraw.editor();
    return false;
  }
  function confirmSourceImport(binding: EditorBinding, source: string, separate = false, editCurrent = false) {
    if (appCalls.modelLocked() || appVars.composingEditors.has(binding.textarea) || binding.textarea.value !== source) return false;
    try {
      const plan = appCalls.sourceImportPlan(binding, source);
      if (!plan || (editCurrent ? !plan.canEditCurrent : (!separate && !plan.safe) || (plan.hasExisting && !plan.canSplit))) return false;
      if (editCurrent || !plan.hasExisting) {
        commitSource(binding, source, { atomic: true });
        appCalls.hideSourceImport(); appRedraw.editorBinding(binding); appRedraw.editor();
        appCalls.setStatus('書いた 文を 本文に 入れたよ'); return true;
      }
      const next = cloneDesignProject(appVars.project), old = scriptBySourceKey(next, plan.ownerKey),
        incoming = plan.entries.filter(x => separate || !x.equal), ids = appCalls.allIds();
      const fresh = () => { let n = 1; while (ids.has('import-script-' + n)) n++; const id = 'import-script-' + n; ids.add(id); return id; };
      const selectedEntry = incoming.find(x => x.metadata.targetId === plan.context.targetId &&
        x.metadata.event === plan.context.event && stableJson(x.metadata.filter || null) === stableJson(plan.context.filter || null));
      let destination: ProjectScript | null = null;
      for (const entry of incoming) {
        const row: ProjectScript = entry === selectedEntry && old && !old.source.trim() ? old : { id: fresh(), ...entry.metadata, source: '' };
        updateScriptSource(row, entry.text, next);
        if (row !== old) next.scripts.push(row);
        if (entry === selectedEntry || !destination) destination = row;
      }
      // If every incoming unit is explicitly retained, keep the editing destination unchanged.
      destination ||= old;
      validateDesignProject(next);
      if (plan.projectFingerprint !== appCalls.currentFingerprint() || plan.ownerKey !== appCalls.bindingOwner(binding))
        throw new AkariError('F503', '取りこむ ところが かわりました。もう一度 中身を たしかめて ください');
      appCalls.dropHistoryTimer();
      // (an import waits in the editor's session)
      binding.session!.pendingEdit = null; binding.textarea.value = appCalls.readSource(binding);
      appCalls.hideSourceImport(); appCalls.pushHistoryNow();
      appVars.project = next;
      if (destination) { appVars.selectedId = destination.targetId; appVars.currentEvent = destination.event; appVars.selectedScriptId = destination.id || null; }
      appCalls.invalidateEditors(); appCalls.clearEditorFailure(binding); markDirty(); appRedraw.tree(); appRedraw.properties(); loadEditor();
      appCalls.dropHistoryTimer(); appCalls.pushHistoryNow();
      appCalls.setStatus('いまの 本文は のこして、えらんだ ところに 本文を 入れたよ'); return true;
    } catch (error) { return showEditorFailure(binding, error as AppError, { preservePending: true }); }
  }
  function showSourceImport(binding: EditorBinding, source: string, plan: SourceImportPlan) {
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
    cancel.onclick = () => cancelEditorPending(binding); root.append(cancel);
  }
  function saveCodeBinding(binding: EditorBinding, { fromInput = false }: { fromInput?: boolean } = {}): boolean {
    if (binding.session?.blockDraft) return flushEditor(binding);
    if (appCalls.modelLocked() || binding.session?.mode === 'blocks') return true;
    const t = binding.textarea;
    if (appVars.composingEditors.has(t))
      return showEditorFailure(binding, '日本語の 入力を Enterキーで 決めてから つづけて ください');
    const source = t.value.replace(/\r\n?/g, '\n');
    // A textarea normalizes CRLF on display; that alone is not an edit of source.
    if (source === appCalls.readSource(binding).replace(/\r\n?/g, '\n')) {
      if (binding === appVars.mainEditor) appCalls.hideSourceImport();
      if (binding.session) binding.session.pendingEdit = null;
      appCalls.clearEditorFailure(binding);
      return true;
    }
    try {
      if (binding === appVars.mainEditor) {
        const parsed = parseSyntax(source, { ...appCalls.bindingContext(binding), symbols: buildSymbols(appVars.project) }),
          plan = appCalls.sourceImportPlan(binding, source);
        if (plan || (fromInput && parsed.ast?.heading && !appCalls.bindingContext(binding).meijin)) {
          // (the main editor has its session: loadEditor)
          binding.session!.pendingEdit = { ownerKey: appCalls.bindingOwner(binding), kind: plan ? 'source-import' : 'heading-source',
            value: source, reason: plan ? '取りこむ ところを たしかめて 決めて ください' : '書き方は だいじょうぶです。きっかけは、「▶ 動かす」を おすか、ブロックモードに すると 決まります' };
          if (plan) showSourceImport(binding, source, plan); else appCalls.hideSourceImport();
          // The text reads now: a mistake shown for an earlier keystroke goes away above the code. With the review, the
          // status line says what waits instead; a body with its own heading keeps the line until its check is done
          // (refreshEditor says 「✓ 書き方を 直せたよ」 or points to the new mistake, E2E-R2-11).
          appCalls.clearEditorFailure(binding);
          if (plan) { appVars.editorFailureStatus = null; appCalls.setStatus(appCalls.sourceImportChoice()); }
          scheduleAutosave(); appCalls.updateDirty(); return false;
        }
      }
      appCalls.hideSourceImport();
      commitSource(binding, source);
      if (binding.session) binding.session.pendingEdit = null;
      appCalls.clearEditorFailure(binding);
      return true;
    } catch (error) {
      if (binding.session)
        binding.session.pendingEdit = {
          ownerKey: appCalls.bindingOwner(binding),
          kind: 'code',
          value: source,
          rejected: (error as AppError).code === 'F504' || (error as AppError).code === 'P208',
          reason: (error as AppError).message,
        };
      scheduleAutosave();
      return showEditorFailure(binding, error as AppError);
    }
  }
  function flushEditor(binding: EditorBinding, { preserveView = false }: { preserveView?: boolean } = {}): boolean {
    if (appCalls.modelLocked()) return true;
    if (binding.session?.mode === 'blocks') {
      const result = binding.view!.flush();
      if (!result?.ok)
        return preserveView ? false : showEditorFailure(
          binding,
          result?.reason || '入力を 決めるか、やめて ください',
          { preservePending: true },
        );
      if (binding.session?.blockDraft){
        if (preserveView) return false;
        // (a draft is drawn as blocks)
        const index=buildBlockIndex(binding.session.blockView!),hole=[...index.values()].find(entry=>entry.node.schemaId.startsWith('Hole:'));
        const parent=hole?.body?index.get(hole.parentId)?.node:null;
        // (a parent is found for a hole in a body)
        const label=(parent&&BLOCK_SCHEMA_BY_ID.get(parent.schemaId)?.bodies.find(slot=>slot.key===hole!.body)?.label)||hole?.node.fields.label||'ブロックや 数・文字';
        // The focus goes to the empty place; the message names the place and what goes in it, one wording per kind
        // of hole (FCB-03, final call 33): a loop's inside takes くり返すこと, a branch of 「もし」 takes することを and is
        // named in 「 」, a hole a value fills names that value (I5V-14).
        if(hole)binding.view!.focus({id:hole.node.id});
        const branch=parent?.schemaId==='IfStatement'?{thenBody:'もし',elseBody:'そうでなければ'}[hole!.body as 'thenBody' | 'elseBody'] as string | undefined:null;
        return showEditorFailure(binding, branch?`「${branch}」の ところが あいて いるよ。することを 入れてね`:`あいている ところが あるよ。${label}を 入れてね`, { preservePending: true });
      }
      return true;
    }
    if (binding.session?.blockDraft) {
      if (appVars.composingEditors.has(binding.textarea))
        return showEditorFailure(binding, '日本語の 入力を Enterキーで きめてから つづけて ください');
      const source = binding.textarea.value.replace(/\r\n?/g, '\n');
      try {
        // (read with the work's names, as the code view and sourceCandidate below read it: 「HPを言う。」 names a variable)
        const parsed = parseSyntax(source, { ...appCalls.bindingContext(binding), key: appCalls.bindingOwner(binding), symbols: buildSymbols(appVars.project) });
        if (!parsed.ast) editorError(parsed.syntaxDiagnostics.map(x => x.message).join('\n'));
        validateSyntaxAst(parsed.ast);
        appCalls.sourceCandidate(binding, appCalls.bindingOwner(binding), source);
        commitSource(binding, source, { atomic: true });
        const session = appCalls.getEditorSession(binding);
        session.blockDraft = null; session.pendingEdit = null;
        appRedraw.editorBinding(binding); appRedraw.editor();
        return true;
      } catch (error) {
        // (the draft is there until it is taken in)
        const session = binding.session;
        session.blockDraft!.codeSource = source;
        session.pendingEdit = { kind: 'block-draft-code', ownerKey: session.ownerKey,
          sourceRevision: session.sourceRevision, contextRevision: session.contextRevision,
          value: source, reason: (error as AppError).message };
        scheduleAutosave();
        return showEditorFailure(binding, error as AppError);
      }
    }
    return saveCodeBinding(binding);
  }
  function flushActiveEditor({ preserveView = false }: { preserveView?: boolean } = {}) {
    if (appVars.colorEdit) return false;
    if (appVars.flushingEditor) return true;
    appVars.flushingEditor = true;
    try {
      appVars.activeDragCleanup?.();
      if (appCalls.$('#procModal').classList.contains('show')) {
        if (!flushEditor(appVars.draftEditor, { preserveView })) return false;
        return syncCallableDraft();
      }
      return flushEditor(appVars.mainEditor, { preserveView });
    } finally {
      appVars.flushingEditor = false;
    }
  }
  function switchEditorMode(binding: EditorBinding, mode: 'code' | 'blocks'): boolean {
    // A work with a 名人 text is code only, for every body; はじめて is blocks only (the toggle says so, paintModeToggle).
    if (mode === 'blocks' && appCalls.workIsMeijin()) {
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
      if (draftSession.mode === 'blocks' && !binding.view!.flush()?.ok) return false;
      // (a flush keeps the editor's session)
      const session = binding.session!;
      if (!session.blockDraft) return switchEditorMode(binding, mode);
      if (session.mode === 'code' && mode === 'blocks' &&
          binding.textarea.value !== session.blockDraft.source) {
        if (!flushEditor(binding)) return false;
        return switchEditorMode(binding, mode);
      }
      appCalls.captureEditorView(binding);
      appCalls.rememberEditorMode(binding.kind, mode); session.mode = mode;
      session.pendingEdit = session.blockDraft.pending;
      if (mode === 'code') binding.textarea.value = session.blockDraft.codeSource ?? session.blockDraft.source;
      appRedraw.editorBinding(binding);
      if (mode === 'code') binding.textarea.focus({ preventScroll: true });
      else binding.view!.focus?.({ id: session.blockSelection });
      return true;
    }
    if (binding === appVars.mainEditor && appVars.sourceOverviewOpen) {
      if (!flushActiveEditor()) return false;
      appCalls.rememberEditorMode('script', mode);
      syncEditorShell(mode);
      appRedraw.sourceOverview();
      return true;
    }
    if (binding.kind === 'draft' && !syncCallableDraft()) return false;
    if (['PREPARING', 'IMPORTING'].includes(appVars.appState) || !flushEditor(binding)) return false;
    appCalls.captureEditorView(binding);
    const session = appCalls.getEditorSession(binding);
    let focusLine: number | null = null;
    if (mode === 'blocks' && !session.syntaxAst)
      return showEditorFailure(binding, '書き方の まちがいを コードで 直して ください');
    if (mode === 'blocks' && session.mode === 'code') {
      let offset = session.codeSelection?.start || 0;
      if (/\r/.test(session.sourceText)) {
        // (the pattern matches at least the end of the text; a text split has a last piece)
        const prefix = session.sourceText.replace(/\r\n?/g, '\n').slice(0, offset).split('\n'),
          lines = session.sourceText.match(/[^\r\n]*(?:\r\n?|\n|$)/g)!;
        offset = lines.slice(0, prefix.length - 1).join('').length + prefix.at(-1)!.length;
      }
      if (appVars.activeLoc?.key === session.ownerKey) {
        const lines = session.sourceText.match(/[^\r\n]*(?:\r\n?|\n|$)/g)!;
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
      // (a source that reads is drawn as blocks)
      const index = buildBlockIndex(session.blockView!);
      let nearest: string | null = null,
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
      // (a place without a range is not before the offset)
      if (statementLocation?.surface?.inline && statementLocation.surface.range?.start! <= offset)
        focusLine = null;
      if (statement && !statementLocation?.surface?.inline &&
          !BLOCK_SCHEMA_BY_ID.get(statement.schemaId)?.bodies.length) {
        let width = Infinity;
        for (const [id, location] of session.nodeMap) {
          const range = location.surface?.range, category = BLOCK_SCHEMA_BY_ID.get(index.get(id)?.node.schemaId)?.category;
          if (['expression', 'target'].includes(category) && range?.start! <= offset && offset < range!.end! && range!.end! - range!.start! < width) {
            nearest = id; width = range!.end! - range!.start!;
          }
        }
      }
      session.blockSelection = nearest;
      session.codeOriginBlock = nearest;
      session.codeOriginRevision = session.sourceRevision;
    }
    appCalls.rememberEditorMode(binding.kind, mode);
    session.mode = mode;
    appRedraw.editorBinding(binding);
    if (mode === 'blocks') binding.view!.focus?.({ id: session.blockSelection, line: focusLine });
    else {
      let selection = session.codeSelection || { start: 0, end: 0 };
      if (
        session.blockSelectionLocation ||
        session.codeOriginRevision !== session.sourceRevision ||
        session.blockSelection !== session.codeOriginBlock
      ) {
        const index = session.blockView ? buildBlockIndex(session.blockView) : new Map<string, BlockIndexEntry>();
        let id: string | null | undefined = session.blockSelection,
          location = session.nodeMap.get(id);
        while (id && !location?.sourceSpan) {
          id = index.get(id)?.parentId;
          location = session.nodeMap.get(id);
        }
        if (location?.sourceSpan) {
          // A body chosen in the block is at its own line (そうでなければ); one whose line is not known (the body of
          // 「もし」 is on the block's line) is at the block's line.
          const lines = session.sourceText.replace(/\r\n?/g, '\n').split('\n'),
            line =
              session.blockSelectionLocation?.id === session.blockSelection && session.blockSelectionLocation.line
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
  function cancelEditorPending(binding: EditorBinding) {
    const importing = binding === appVars.mainEditor && !appCalls.$('#sourceImport').hidden;
    if (binding === appVars.mainEditor) appCalls.hideSourceImport();
    const draft = binding.session?.blockDraft;
    if (draft) {
      // (a draft is a session's)
      Object.assign(binding.session!, draft.baseline, { blockDraft: null, pendingEdit: null });
      appVars.editorSessions.set(`${binding.kind}:${binding.session!.ownerKey}`, binding.session!);
    }
    binding.view?.cancel();
    appVars.composingEditors.delete(binding.textarea);
    if (binding.session) binding.session.pendingEdit = null;
    if (binding.kind === 'draft') {
      appVars.headerPending = null;
      for (const id of ['#callableName', '#callableArgs', '#callablePhrase']) appVars.composingEditors.delete(appCalls.$(id));
      appRedraw.callable();
    }
    binding.textarea.value = appCalls.readSource(binding);
    appCalls.clearEditorFailure(binding);
    appRedraw.editorBinding(binding);
    if (binding === appVars.mainEditor) { appRedraw.editor(); appRedraw.entrySurface(); }
    appCalls.setStatus(importing ? '取りこみを やめたよ' : '入力を やめたよ');
  }
  function syncCallableDraft() {
    if (appVars.syncingDraft || appCalls.modelLocked()) return true;
    if (
      [appCalls.$('#callableName'), appCalls.$('#callableArgs'), appCalls.$('#callablePhrase'), appCalls.$('#callableType')].some((t) =>
        appVars.composingEditors.has(t),
      )
    ) {
      appVars.headerPending = { ownerKey: appCalls.draftOwner(), composing: true };
      return showEditorFailure(appVars.draftEditor, '日本語の 入力を Enterキーで きめてから つづけて ください');
    }
    // (the kind is chosen from the two the list offers)
    const next = {
      ...appVars.callableDraftCore,
      type: appCalls.$('#callableType').value as CallableDraft['type'],
      name: appCalls.$('#callableName').value,
      argsText: appCalls.$('#callableArgs').value,
    };
    const phrase = appCalls.$('#callablePhrase').value;
    if (next.type === 'action' && phrase) next.callPhrase = phrase;
    else delete next.callPhrase;
    if (
      JSON.stringify(next) !== JSON.stringify(appVars.callableDraftCore) &&
      appVars.draftEditor.session?.mode === 'blocks' &&
      appVars.draftEditor.session.pendingEdit
    ) {
      const ready = appVars.draftEditor.view!.flush();
      if (!ready.ok) {
        for (const [id, key] of [
          ['#callableType', 'type'],
          ['#callableName', 'name'],
          ['#callableArgs', 'argsText'],
          ['#callablePhrase', 'callPhrase'],
        ] as const)
          appCalls.$(id).value = appVars.callableDraftCore[key] || '';
        return showEditorFailure(
          appVars.draftEditor,
          ready.reason || '本文の 入力を 決めるか、やめて ください',
        );
      }
      next.source = appVars.callableDraftCore.source;
    }
    try {
      appCalls.validateCallableDraft(next);
      if (JSON.stringify(next) !== JSON.stringify(appVars.callableDraftCore)) {
        appVars.callableDraftCore = next;
        appCalls.invalidateEditors();
        markDirty();
      }
      appVars.headerPending = null;
      return true;
    } catch (error) {
      appVars.headerPending = { ownerKey: appCalls.draftOwner(), reason: (error as AppError).message };
      return showEditorFailure(appVars.draftEditor, error as AppError);
    }
  }
  function releaseShellPointer() {
    const token = appVars.shellPointer;
    if (!token) return;
    appVars.shellPointer = null;
    // (a press gets its cleanup when it starts)
    token.cleanup!();
    appRedraw.editorBinding(appVars.mainEditor);
  }
  function syncEditorShell(mode: 'code' | 'blocks') {
    if (!document.body.dataset.editorMode || appVars.shellPointer) return;
    // (the shell's own parts are made with it, and installEditorShell sets editorMode after them)
    const block = mode === 'blocks',
      changed = document.body.dataset.editorMode !== mode,
      main = appCalls.$('.main'),
      side = appCalls.$('.side'),
      designer = appCalls.$('#designerWindow'),
      objects = appCalls.$('.objects-window')!;
    if (changed) {
      document.body.dataset.editorMode = mode;
      if (block) {
        side.prepend(designer);
        side.insertBefore(objects, appCalls.$('.properties-window'));
        appCalls.$('#componentPickerCore')!.append(appCalls.$('.tool-list'));
        appCalls.$('#componentControls')!.append(appCalls.$('.project-tools')!);
      } else {
        main.insertBefore(designer, side);
        side.prepend(objects);
        appCalls.$('.toolbox').append(appCalls.$('.tool-list'), appCalls.$('.project-tools')!);
      }
      (appCalls.$('#hintsDisclosure') as HTMLDetailsElement).open = false;
    }
    // In blocks the body window comes before the stage and the right column, so Tab goes from the toolbar to the block
    // list, the workspace, and then the stage and the right column (E-16). The code view keeps its order.
    const code = appCalls.$('.codewin');
    if (code.parentElement === main) {
      if (block && code.compareDocumentPosition(side) & Node.DOCUMENT_POSITION_PRECEDING) main.insertBefore(code, side);
      else if (!block && code !== main.lastElementChild) main.append(code);
    }
    // One name for each window in both views (F-23): 「作品」 names the work.
    appCalls.$('#designerHeading').textContent = '画面';
    appCalls.$('.objects-window > .win-title')!.textContent = 'キャラクター・部品';
    // The part's actions go above its せってい in code and under the part list in blocks. The padding they need is read
    // when they move (their ResizeObserver follows later changes), not with every keystroke (PERF-R2-03).
    const actions = appCalls.$('.prop-actions'), actionsHome = block ? appCalls.$('#componentActions')! : appVars.el.props;
    if (actions && actionsHome.firstElementChild !== actions) { actionsHome.prepend(actions); appCalls.syncPropertyScrollPadding(); }
    appCalls.$('#formatBtn').hidden = block || appCalls.currentIsMeijin();
    appCalls.syncWideInert();
    // The level list follows the view (blocks or code); a view in code at はじめて goes on at かんたん.
    if (applyUiLevel(mode)) appRedraw.hints();
    appRedraw.entrySurface();
  }
  function markDirty() {
    if (appCalls.modelLocked()) return;
    appCalls.invalidateEditors();
    const fingerprint = appCalls.currentFingerprint(), fp = appCalls.stateFingerprintCore(fingerprint);
    if (fp === appVars.lastObservedFingerprint) return;
    appVars.lastObservedFingerprint = fp;
    appVars.keptFail = null;
    // An edit is a new action: the result of the one before (開いたよ, ほぞんしたよ, からっぽの 作品 …) goes away unless
    // this edit says something itself. A mistake that is still there stays (editorFailureStatus).
    const serial = appVars.statusSerial;
    queueMicrotask(() => {
      if (appVars.statusSerial === serial && !appCalls.modelLocked() && appVars.statusMessage !== appVars.editorFailureStatus) appCalls.setStatus('');
    });
    appVars.recoveryEpoch++;
    if (appVars.history.at(-1)?.stateFingerprint !== fp) appVars.redo = [];
    appCalls.updateDirty();
    appCalls.queueHistory(fingerprint, fp);
    scheduleAutosave();
  }
  function restoreSnap(e: HistoryState,{restoreView=false}: { restoreView?: boolean }={}) {
    appVars.restoringSnapshot=true;
    // The view stays as shown; in a work with a 名人 text (shown in code) the chosen view stays.
    const shown: (binding: EditorBinding) => 'code' | 'blocks'=binding=>appCalls.workIsMeijin()?appVars.editorModes.get(binding.kind)||'code':binding.session?.mode||'code';
    const view={uiLevel:appVars.baseUiLevel,sourceOverviewOpen: appVars.sourceOverviewOpen,editorModes:{script:shown(appVars.mainEditor),draft:shown(appVars.draftEditor)}};
    // Going back to before the 名人 text was made also brings back how the body was shown then (はじめて shows blocks).
    if(appCalls.workIsMeijin()&&!(e.project.scripts||[]).some(isMeijinScript)&&e.editorState)view.editorModes.script=e.editorState.editorModes.script;
    try {
    appVars.recoveryEpoch++;
    validateAssetReferences(e.project, new AssetStore(e.assets));
    appCalls.disposeRuntime();
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
    appRedraw.callable();
    appCalls.$('#procModal').classList.toggle('show', !!e.draftOpen || appCalls.hasCallableDraft());
    appRedraw.callableOptions(appVars.callableLoadedKey);
    // A procedure made in a 名人 text that was shown is shown again as the restored text makes it (or no longer).
    if (appVars.meijinProcedureId) appCalls.showMeijinProcedure(appVars.meijinProcedureId);
    appVars.lastObservedFingerprint = appCalls.stateFingerprintCore();
    appRedraw.all();
    loadEditor();
    if (appCalls.$('#procModal').classList.contains('show')) appRedraw.editorBinding(appVars.draftEditor);
    if(e.editorState){restoreEditorState({...e.editorState,...(restoreView?{}:view)});appVars.callableBaseline=e.callableBaseline||appVars.callableBaseline;appVars.callableLoadedKey=e.callableLoadedKey||'';appCalls.$('#procModal').classList.toggle('show',!!e.draftOpen);}
    appVars.lastObservedFingerprint=appCalls.stateFingerprintCore();
    e.stateFingerprint=appVars.lastObservedFingerprint;
    appCalls.updateDirty();
    } finally { appVars.restoringSnapshot=false; }
    scheduleAutosave();
  }
  function currentOpenState() {
    // Opening may be cancelled: retain the existing inline diagnosis and editor geometry.
    flushActiveEditor({ preserveView: true });
    appVars.activeDragCleanup?.();
    const content = appCalls.currentFingerprint(), editor = appCalls.openEditorFingerprint();
    return { fingerprint: stableJson([content, editor]),
      unsaved: content !== appVars.lastSavedFingerprint || editor !== appVars.lastSavedEditorFingerprint ||
        appCalls.composingAny() || (!!appVars.colorEdit && appVars.colorEdit.value !== appVars.colorEdit.original) };
  }
  function selectProjectForOpen() {
    if (!appVars.openRequest || appCalls.modelLocked()) return;
    appVars.openRequest.phase = 'selection';
    if (appVars.openRequest.kind === 'sample') { showSamplePicker(); return; }
    appVars.el.fileInput.value = '';
    try { appVars.el.fileInput.click(); }
    catch (error) { appCalls.finishOpenSelection(); appCalls.log((error as Error).message, 'error'); }
  }
  // 開く and お手本を開く ask in the one dialog for work that would be replaced (askLose) before the choice. The
  // approval holds for the work as it was asked about; saving first does not change it.
  async function confirmOpenRequest(kind: 'file' | 'sample') {
    const observed = currentOpenState(), request: NonNullable<AppVars['openRequest']> = { kind, fingerprint: observed.fingerprint, phase: 'confirmation' };
    appVars.openRequest = request;
    const go = await askLose(observed);
    if (appVars.openRequest !== request) return;
    if (!go) {
      appVars.openRequest = null;
      // やめる: the focus goes back to the button that asked (at はじめて 開く is in the 作品 menu).
      if (!document.querySelector('.modal.show,dialog[open]')) (kind === 'sample' ? appCalls.$('#sampleBtn') : appCalls.openButtonShown())?.focus({ preventScroll: true });
      return;
    }
    selectProjectForOpen();
  }
  function askLose(observed: { fingerprint: string; unsaved: boolean } = currentOpenState()): Promise<boolean> {
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
          if (document.querySelector('.modal.show,dialog[open]')) return;
          const shown: (n: Element | null) => boolean = n => !!n?.isConnected && (n.checkVisibility ? n.checkVisibility({ visibilityProperty: true }) : n.getClientRects().length > 0);
          // (what had the focus, or the summary of its menu, is an element of HTML)
          (shown(origin) ? origin as HTMLElement : origin?.closest?.('details')?.querySelector<HTMLElement>(':scope > summary'))?.focus?.({preventScroll:true});
        }, 0);
        resolve(answer && currentOpenState().fingerprint === observed.fingerprint);
      };
    });
  }
  // Before a save: the work's name is outlined in its own place and kept above the question's backdrop (body.name-check
  // raises the toolbar, which stays inert), and the child answers whether to save under that name. いいえ comes first
  // and has the focus, as やめる does in the dialog above, so a quick Enter does not save unseen. Resolves true on はい.
  function askSaveName(): Promise<boolean> {
    if (appVars.saveConfirm) return Promise.resolve(false);
    const origin = document.activeElement;
    document.body.classList.add('name-check');
    appCalls.$('#saveConfirmModal').classList.add('show');
    appCalls.$('#saveConfirmNo').focus({preventScroll:true});
    return new Promise((resolve) => {
      appVars.saveConfirm = (answer) => {
        appVars.saveConfirm = null;
        appCalls.$('#saveConfirmModal').classList.remove('show');
        document.body.classList.remove('name-check');
        // The focus goes back to the button that asked, as やめる does above: after いいえ, and after はい where the save
        // left it nowhere. A dialog still open (自分で作ったブロック) gets it back on its own button, not on the one the
        // modal manager picks first in it (↶ もとに もどす, where an Enter would undo).
        setTimeout(() => {
          const shown: (n: Element | null) => boolean = n => !!n?.isConnected && (n.checkVisibility ? n.checkVisibility({ visibilityProperty: true }) : n.getClientRects().length > 0);
          // A focus still on the closed question (はい, until the browser moves it) is left nowhere too.
          const open = [...document.querySelectorAll('.modal.show,dialog[open]')], active = document.activeElement;
          const nowhere = !active || active === document.body || appCalls.$('#saveConfirmModal').contains(active);
          if (!shown(origin) || (open.length ? !open.some(modal => modal.contains(origin)) : answer && !nowhere)) return;
          // (what had the focus and is shown is an element of HTML)
          (origin as HTMLElement).focus({preventScroll:true});
        }, 0);
        resolve(answer);
      };
    });
  }
  function loadEditor() {
    appVars.debugSourceKey = null;
    const evs = appCalls.eventsFor(appVars.selectedId);
    if (!evs.includes(appVars.currentEvent)) appVars.currentEvent = evs[0];
    appCalls.selectCurrentScript();
    appRedraw.selectors();
    appCalls.getEditorSession(appVars.mainEditor);
    appRedraw.editorBinding(appVars.mainEditor);
    appRedraw.editor();
  }
  function showSourceOverview() {
    appVars.sourceOverviewOpen = true;
    appVars.sourceOverviewSignature = '';
    syncEditorShell(appCalls.chosenEditorMode());
    appCalls.$('.codewin').dataset.sourceOverview = 'true';
    appCalls.$('#sourceOverview').hidden = false;
    appCalls.$('#sourceOverview').scrollTop = 0;
    appRedraw.selectors();
    appRedraw.sourceOverview();
  }
  function selectObject(id: string) {
    if (appVars.tutorial) return false;
    if (!appCalls.targetById(id) || !flushActiveEditor()) {
      appRedraw.selectors();
      return false;
    }
    appCalls.captureEditorView(appVars.mainEditor);
    if (!appCalls.modelLocked()) {
      appCalls.dropHistoryTimer();
      appCalls.pushHistoryNow();
    }
    const sameObject = appVars.selectedId === id;
    appVars.selectedId = id;
    appCalls.hideSourceOverview();
    const evs = appCalls.eventsFor(id);
    if (!evs.includes(appVars.currentEvent)) appVars.currentEvent = evs[0];
    // はじめて opens the start and click bodies only (F-05): a body of another event (ふれたとき, keys …) is kept, and
    // the note under the event buttons says so.
    const entry = document.body.dataset.uiLevel === 'entry', shownAtLevel: (x: ProjectScript) => boolean = x => !entry || ['start', 'click'].includes(x.event);
    if (entry && !['start', 'click'].includes(appVars.currentEvent)) appVars.currentEvent = 'start';
    if (!sameObject) {
      appVars.selectedScriptId = null;
      const matching = appVars.project.scripts.find((x) => x.targetId === id && x.event === appVars.currentEvent && x.source.trim()),
        first = matching || appVars.project.scripts.find((x) => x.targetId === id && x.source.trim() && shownAtLevel(x));
      if (first) { appVars.currentEvent = first.event; appVars.selectedScriptId = first.id || null; }
    }
    appRedraw.tree();
    appRedraw.properties();
    loadEditor();
    appRedraw.components();
    // Navigation changes the view of the current history frame, not its
    // content. The next atomic field edit must undo to this selected owner.
    if (!appCalls.modelLocked()) appCalls.pushHistoryNow();
    return true;
  }
  function commitResize(c: Component, next: Partial<Pick<Component, 'x' | 'y' | 'w' | 'h' | 'scalePercent'>>) {
    if (appCalls.modelLocked() || appCalls.componentById(c.id) !== c) return false;
    // (what is resized are the numbers of the part's place and size)
    if ((Object.keys(next) as ('x' | 'y' | 'w' | 'h' | 'scalePercent')[]).every((k) => Math.abs(c[k] - next[k]!) < 1e-9)) return false;
    const candidate = cloneDesignProject(appVars.project);
    // (the copy has the part)
    Object.assign(
      candidate.components.find((x) => x.id === c.id)!,
      next,
    );
    validateDesignProject(candidate);
    Object.assign(c, next);
    markDirty();
    appCalls.dropHistoryTimer();
    appCalls.pushHistoryNow();
    return true;
  }
  function rollbackDesign(before: Project) {
    appVars.project = before;
    appCalls.invalidateEditors();
    appRedraw.all();
    if (appCalls.$('#dataModal').classList.contains('show')) appRedraw.dataModal();
    if (appCalls.$('#assetModal').classList.contains('show')) appRedraw.appearance();
  }
  function commitColor(c: Component, field: 'fg' | 'bg', value: string | null) {
    if (appCalls.modelLocked() || appCalls.componentById(c.id) !== c || !['fg', 'bg'].includes(field)) return false;
    const next = value === null && field === 'bg' ? null : pickerHex(value);
    if (next === null && !(field === 'bg' && value === null))
      throw new Error(
        '色は、# と 6けたの 0〜9・A〜F で 入れて ください（れい: #147efb）',
      );
    if (c[field] === next) return false;
    // (the copy has the part; a text colour is never cleared: next is none only for the background)
    const candidate = cloneDesignProject(appVars.project);
    (candidate.components.find((x) => x.id === c.id)! as { [key in 'fg' | 'bg']: string | null })[field] = next;
    validateDesignProject(candidate);
    appCalls.dropHistoryTimer();
    appCalls.pushHistoryNow();
    (c as { [key in 'fg' | 'bg']: string | null })[field] = next;
    markDirty();
    appCalls.dropHistoryTimer();
    appCalls.pushHistoryNow();
    return true;
  }
  function choosePreset(c: Component, field: 'fg' | 'bg', value: string | null) {
    if (appCalls.modelLocked() || appVars.colorEdit || !flushActiveEditor()) return;
    try {
      const changed = commitColor(c, field, value);
      if (changed) {
        appRedraw.properties();
        appRedraw.components();
        appRedraw.editor();
      }
      const root = appVars.el.props.querySelector(`[data-color-field="${field}"]`),
        button =
          value === null
            ? root?.querySelector<HTMLElement>('.color-none')
            : root?.querySelector<HTMLElement>(`[data-color-value="${value}"]`);
      button?.focus({ preventScroll: true });
    } catch (error) {
      appCalls.log((error as Error).message, 'error');
    }
  }
  function syncColorPicker(syncHex = true) {
    const edit = appVars.colorEdit;
    if (!edit) return;
    const { h, s, v } = edit.hsv;
    appCalls.colorChip(appCalls.$('#colorBefore'), edit.original);
    appCalls.colorChip(appCalls.$('#colorAfter'), edit.value);
    const rad = (h * Math.PI) / 180;
    appCalls.$('#colorMarker').style.left = 50 + 47 * s * Math.cos(rad) + '%';
    appCalls.$('#colorMarker').style.top = 50 - 47 * s * Math.sin(rad) + '%';
    for (const [id, value] of [
      ['Hue', Math.round(h) % 360],
      ['Saturation', Math.round(s * 100)],
      ['Value', Math.round(v * 100)],
    ] as const) {
      // (the picker's sliders, which take a number as its text, and their labels)
      (appCalls.$('#color' + id + (id === 'Value' ? 'Core' : '')) as HTMLElement & { value: string | number }).value = value;
      appCalls.$('#color' + id + 'Text')!.textContent = String(value) + (id === 'Hue' ? '\u00b0' : '%');
    }
    if (syncHex) {
      appCalls.$('#colorHex').value = edit.value || '';
      edit.invalid = false;
    }
    appCalls.$('#colorHex').setAttribute('aria-invalid', String(!!edit.invalid));
    appCalls.$('#colorError').textContent = edit.invalid
      ? '# と、6けたの0〜9・A〜Fで入力します（れい: #147efb）'
      : '';
    appCalls.$('#colorConfirm').disabled = !!edit.invalid || !!edit.composing;
    appCalls.$('#colorNone').setAttribute('aria-pressed', String(edit.value === null));
    appCalls.$('#colorState').textContent =
      edit.value === null
        ? 'なし（とうめい）'
        : `\u8272\u3042\u3044 ${Math.round(h)}\u5ea6\u3001\u3042\u3056\u3084\u304b\u3055 ${Math.round(s * 100)}%\u3001\u660e\u308b\u3055 ${Math.round(v * 100)}%`;
    appRedraw.colorPreview();
  }
  function updatePickerHsv(hsv: Partial<PickerHsv>) {
    if (!appVars.colorEdit || appVars.colorEdit.composing) return;
    Object.assign(appVars.colorEdit.hsv, hsv);
    const { h, s, v } = appVars.colorEdit.hsv;
    appVars.colorEdit.value = pickerHsvToHex(h, s, v);
    syncColorPicker();
  }
  function openColorPicker(c: Component, field: 'fg' | 'bg', label: string) {
    if (appCalls.modelLocked() || appVars.colorEdit || !flushActiveEditor() || appCalls.componentById(c.id) !== c)
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
    appCalls.$('#colorTitle').textContent = c.name + ' \u2014 ' + label;
    appCalls.$('#colorNone').hidden = field !== 'bg';
    appCalls.$('#colorAdvanced').open = false;
    syncColorPicker();
    appCalls.$('#colorModal').classList.add('show');
  }
  function closeColorPicker() {
    const edit = appVars.colorEdit;
    if (!edit) return;
    const pointer = edit.pointer;
    edit.pointer = null;
    if (pointer)
      try {
        appCalls.$('#colorWheel').releasePointerCapture(pointer.id);
      } catch (_) {}
    appVars.colorEdit = null;
    appCalls.$('#colorModal').classList.remove('show');
    appRedraw.properties();
    appRedraw.components();
    requestAnimationFrame(() => {
      if (!document.querySelector('.modal.show') && appVars.selectedId === edit.id)
        appVars.el.props
          .querySelector<HTMLElement>(`[data-color-field="${edit.field}"] .color-more`)
          ?.focus();
    });
    if (appVars.dirty || appCalls.hasCallableDraft()) scheduleAutosave();
  }
  // x/y (a drop) is the new centre; without them the part is placed where it can be seen (newPartPlace).
  function addComponent(type: ComponentType, x: number | null = null, y: number | null = null, spritePreset = '') {
    if (appCalls.modelLocked() || !flushActiveEditor()) return;
    appCalls.dropHistoryTimer();
    appCalls.pushHistoryNow();
    if (appCalls.modelLocked() || !['label', 'button', 'input', 'box', 'sprite'].includes(type)) return;
    if (appVars.project.components.length >= LIMITS.components) {
      appCalls.log('部品が いっぱいで、もう ふやせません。いらない部品を けして ください', 'error');
      appCalls.setStatus('キャラクターや 部品が いっぱいで、もう ふやせないよ。いらない ものを けしてね');
      return;
    }
    const preset =
        // (a preset is one the table has: a drop may name another, such as constructor)
        type === 'sprite' ? (Object.hasOwn(appVars.STANDARD_SPRITES, spritePreset) && appVars.STANDARD_SPRITES[spritePreset]) || appVars.STANDARD_SPRITES.star : null,
      names = { label: '文字', button: 'ボタン', input: '入力らん', box: '四角' },
      // (a キャラクター is named by its preset)
      nameBase = preset?.name || names[type as Exclude<ComponentType, 'sprite'>];
    // (a new part's name is not the screen's name either)
    const taken = (name: string) => name === appVars.project.stage.name || appVars.project.components.some((c) => c.name === name);
    let n = 1,
      name = spritePreset === 'dango' ? nameBase : null;
    if (!name || taken(name)) {
      do {
        name = `${nameBase}${n++}`;
      } while (taken(name));
    }
    // (a キャラクター has its preset)
    const id = appCalls.ensureUniqueId(type),
      imagePreset = preset?.kind === 'image',
      w =
        type === 'input' ? 160 : type === 'box' ? 120 : type === 'sprite' ? preset!.w || 70 : 120,
      h = type === 'box' ? 80 : type === 'sprite' ? preset!.h || 70 : 32,
      auto = x === null || y === null,
      place = auto
        ? appCalls.newPartPlace(appVars.project.components, appVars.project.stage, w, h, { x: 80 + w / 2, y: appVars.project.stage.height - 80 - h / 2 })
        : { x: Math.round(x!), y: Math.round(y!) },
      base: PartDraft = {
        id,
        type,
        name,
        x: place.x,
        y: place.y,
        w,
        h,
        fg: type === 'sprite' ? preset!.fg : '#111111',
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
                ? preset!.value
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
        base.costumes = [{ id: co, name: preset!.name, kind: 'image', assetId }];
        base.costumeId = co;
        try {
          // (the キャラクター has its costume now)
          validateAssetReferences({ ...appVars.project, components: [...appVars.project.components, base as Component] }, store);
        } catch (error) {
          appCalls.log(`${(error as { code?: unknown }).code || ''} キャラクターを おけません: ${(error as Error).message}`, 'error');
          appCalls.setStatus('キャラクターを おけなかったよ');
          return;
        }
        appVars.assetStore = store;
      } else base.costumes = [{ id: co, name: preset!.name, kind: 'text', value: preset!.value }];
      base.costumeId = co;
    }
    // (a キャラクター has its costume now; another part has none)
    appVars.project.components.push(base as Component);
    markDirty();
    selectObject(id);
    const placed = appCalls.designBox(base);
    if (placed.right <= 0 || placed.left >= appVars.project.stage.width || placed.top <= 0 || placed.bottom >= appVars.project.stage.height)
      appCalls.setStatus(`「${name}」は 画面の 外に あるよ。「せってい」の「よこの ばしょ」・「たての ばしょ」で もどせるよ`);
    else if (auto) appCalls.setStatus(`「${name}」を おいたよ。いま 動かすものは「${name}」だよ`);
  }
  function cachedNotices() {
    // Each change starts the wait again, so the work is checked once the child stops for a moment.
    const key = JSON.stringify(appVars.project);
    if (key !== appVars.noticeKey && key !== appVars.noticeWanted) {
      appVars.noticeWanted = key;
      clearTimeout(appVars.noticeTimer);
      appVars.noticeTimer = setTimeout(checkNotices, 150);
    }
    return appVars.noticeList.filter(d => appVars.noticeSources.get(d.owner) === appCalls.noticeSourceOf(d.owner));
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
      let checked: Pick<CompiledProject, 'items'> & Partial<CompiledProject> = { items: [], notes: [] };
      try { checked = compileProject(appVars.project); } catch (error) { if (!(error instanceof AkariError)) throw error; }
      if(!checked.errors?.length){
        const names=collectSignalNames(checked);namesChanged=JSON.stringify([names.sent,names.received])!==JSON.stringify([appVars.signalNameCache.names.sent,appVars.signalNameCache.names.received]);
        appVars.signalNameCache={key,names};
      }
      // A 名人 text's flows are items of their own: a notice belongs to the body (the document) its item comes from.
      // (the notes are the check's, each with the key of its source)
      const owner: (where: string) => string = where => checked.items?.find(item => item.key === where)?.documentKey || where;
      appVars.noticeList = (checked.notes || []).map(d => ({ ...d, owner: owner(d.where!) }));
      appVars.noticeSources = new Map(appVars.noticeList.map(d => [d.owner, appCalls.noticeSourceOf(d.owner)]));
      appVars.noticeKey = key;
    }
    const shown: (b: EditorBinding) => string = b => (b.session?.notices || []).map(d => d.line + ':' + d.code).join();
    for (const binding of [appVars.mainEditor, appVars.draftEditor]) {
      if (!binding.view || !binding.session) continue;
      if(namesChanged&&binding.session.mode==='blocks'){appRedraw.editorBinding(binding);continue;}
      if (shown(binding) === bodyNotices(binding.session).map(d => d.line + ':' + d.code).join()) continue;
      if (binding === appVars.mainEditor) appRedraw.editor(); else appRedraw.editorBinding(binding);
    }
  }
  function bodyNotices(session: EditorSession | null) {
    // The run screen shows no notice (its marks are edit-screen controls), so a running work is not looked at for them.
    if (appCalls.modelLocked() || !session || session.pendingEdit || session.blockDraft || session.diagnostics?.length || !session.syntaxAst) return [];
    return cachedNotices().filter(d => d.owner === session.ownerKey && appVars.noticeSources.get(d.owner) === session.sourceText)
      .sort((a, b) => (a.line || 0) - (b.line || 0) || (a.column || 0) - (b.column || 0));
  }
  function checkedEditorErrors(binding: EditorBinding, source: string, errs: Diagnostic[]): Diagnostic[];
  function checkedEditorErrors(binding: EditorBinding, source: string, errs: Diagnostic[], headingAst: Script | null): Diagnostic[] | null;
  function checkedEditorErrors(binding: EditorBinding, source: string, errs: Diagnostic[], headingAst: Script | null = null): Diagnostic[] | null {
    if (!headingAst && !genericReadingError(errs[0])) return errs;
    const owner = appCalls.bindingOwner(binding), key = owner + '\n' + (headingAst ? 'heading\n' : '') + source;
    if (appVars.editorChecks.has(key)) return appVars.editorChecks.get(key)!;
    clearTimeout(appVars.editorCheckTimer);
    appVars.editorCheckTimer = setTimeout(() => {
      appVars.editorCheckTimer = 0;
      if (appCalls.modelLocked() || appCalls.bindingOwner(binding) !== owner) return;
      let found = errs, taken = false;
      try {
        if (headingAst) {
          // What ▶ would say: taking the body (its heading may change the event or the part) and then the check of the
          // work, for this body (S317 included).
          // (a heading is a body's, and the source of a body makes a work)
          const next = appCalls.sourceCandidate(binding, owner, source)!, old = scriptBySourceKey(appVars.project, owner),
            row = old ? next.scripts[appVars.project.scripts.indexOf(old)] : next.scripts.at(-1), key = row && scriptSourceKey(row);
          found = key ? compileProject(next).errors.filter(e => e.where === key) : [];
          taken = true;
        } else found = appCalls.meijinFormError(owner, source, found);
      // (a mistake of the check may carry the mistakes found)
      } catch (error) { if (!(error instanceof AkariError)) throw error; found = (error as AppError).diagnostics?.length ? (error as AppError).diagnostics! : [error]; }
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
      if (binding === appVars.mainEditor) appRedraw.editor();
      if(!headingAst&&binding.session?.pendingEdit?.value===source&&binding.assist?.contextRevision===appVars.editorContextRevision){
        const first=found[0];
        if(first&&appCalls.stashAssist(binding,Object.assign(new AkariError(first.code,first.message,first.line,first.column),{diagnostics:found,proposalSource:source})))runAssist(binding);
      }
    }, 250);
    return headingAst ? null : errs;
  }
  function stopRun() {
    if (appVars.appState === 'IMPORTING') return;
    appCalls.tutorialCollectRuntime();
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
    // (the pen draws on the stage's canvas, got when the editor starts)
    appVars.pen!.clearRect(0, 0, appVars.el.canvas.width, appVars.el.canvas.height);
    appCalls.confirmTutorialOperation('stop');
    appRedraw.all();
    loadEditor();
    appRedraw.runStrip();
    appCalls.setStatus(appCalls.stopStatusWithNotices());
    if(appVars.tutorial){tutorialRefresh();appCalls.focusTutorialTarget();return;}
    if (appVars.sourceOverviewOpen) appCalls.$('#sourceEditBtn').focus({ preventScroll: true });
    else if (appVars.mainEditor.session?.mode === 'blocks') {
      appVars.mainEditor.view!.focus({ id: appVars.mainEditor.session.blockSelection });
      // (the view draws its workspace)
      if (!appCalls.$('#blockEditor').contains(document.activeElement))
        appCalls.$('#blockEditor .blockui-workspace')!.focus({ preventScroll: true });
    }
    else appVars.el.editor.focus({ preventScroll: true });
  }
  // The fix of a notice opens its body in the editor and changes it there, so undo and the editor follow it. A body
  // changed since the check is not touched.
  function applyNoteProposal(note: Diagnostic, proposal: Proposal) {
    if (appCalls.modelLocked() || !flushActiveEditor()) return;
    const item = compileProject(appVars.project).items.find(x => x.key === note.where),
      script = item && scriptBySourceKey(appVars.project, item.documentKey || item.key);
    if (!script || typeof script.source !== 'string' || script.source.slice(proposal.start, proposal.end) !== proposal.original) {
      appCalls.setStatus('本文が かわったので、もう一度「作品チェック」を おしてね');
      return;
    }
    if (script.targetId !== appVars.selectedId && !selectObject(script.targetId)) return;
    appVars.currentEvent = script.event; appVars.selectedScriptId = script.id || null; loadEditor();
    const source = script.source.slice(0, proposal.start) + proposal.source + script.source.slice(proposal.end);
    try {
      commitSource(appVars.mainEditor, source, { atomic: true });
      appRedraw.editorBinding(appVars.mainEditor); appRedraw.editor();
      appCalls.$('#diagnosisModal').classList.remove('show');
      if (appCalls.shownEditorMode() === 'code') {
        appVars.el.editor.focus({ preventScroll: true });
        // (a notice's fix replaces a range of the body)
        appVars.el.editor.setSelectionRange(proposal.start!, proposal.start! + proposal.source.length);
      } else appVars.mainEditor.view?.focus({ line: note.line });
      appCalls.setStatus('直したよ');
    } catch (error) { showEditorFailure(appVars.mainEditor, error as AppError); }
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
  function restoreEditorState(state: RestoredEditorState) {
    // Entry is a local presentation choice. The established file enum stays
    // basic/advanced; a transient history view can still retain entry.
    // (a state that is not at はじめて is a state kept)
    validateEditorState(state.uiLevel==='entry'?{...state,uiLevel:'basic'}:state as EditorState,appVars.project);
    for(const binding of [appVars.mainEditor,appVars.draftEditor]){binding.view?.cancel();if(binding.session){binding.session.pendingEdit=null;binding.session.blockDraft=null;}}
    appVars.headerPending=null;
    appVars.selectedId=state.selectedId;appVars.currentEvent=state.currentEvent;appVars.selectedScriptId=state.selectedScriptId;
    // A restored basic view keeps this browser's entry preference while the script editor shows blocks.
    let uiLevel=state.uiLevel;
    if(uiLevel==='basic'&&state.editorModes.script==='blocks'){
      let stored: string | null=null;
      try{stored=localStorage.getItem(STORAGE_KEYS.uiLevel);}catch(_){}
      if(normalizeEntryUiLevel(stored)==='entry')uiLevel='entry';
    }
    appVars.baseUiLevel=uiLevel;
    // A work with a 名人 text opens in code, whatever view the file or the autosave kept; nothing is said about it. The
    // kept view stays the chosen one (getEditorSession shows code).
    for(const [kind,mode]of Object.entries(state.editorModes))appVars.editorModes.set(kind,mode);
    appVars.editorSessions.clear();appCalls.invalidateEditors();appCalls.hideSourceOverview();applyUiLevel();appRedraw.all();loadEditor();
    if(state.callableDraft)restoreCallableDraft(state.callableDraft);
    for(const saved of state.pendingEditors){
      const binding=saved.kind==='draft'?appVars.draftEditor:appVars.mainEditor;
      if(saved.kind==='script'&&appCalls.bindingOwner(binding)!==saved.ownerKey)throw new AkariError('F503','書きかけの ばしょが 合いません');
      const session=appCalls.getEditorSession(binding,{force:true});// A reopened draft belongs to this session, so it takes this session's revisions.
      // (a change kept is the editor's change: the generations it was kept with are the session's just below) A kept
      // change of no kind and no field (a block moved, or a choice, that an earlier save kept) puts nothing back.
      if(saved.pending.kind!==undefined||saved.pending.field!==undefined)
        session.pendingEdit={...cloneDesignProject(saved.pending) as Omit<PendingEdit, 'ownerKey'>,ownerKey:appCalls.bindingOwner(binding)};
      // Revisions only exist on pending edits that were saved with them; those now belong to this session.
      if(session.pendingEdit&&saved.pending.sourceRevision!==undefined)session.pendingEdit.sourceRevision=session.sourceRevision;
      if(session.pendingEdit&&saved.pending.contextRevision!==undefined)session.pendingEdit.contextRevision=session.contextRevision;
      if(saved.draftTree!==null){
        // (a body's blocks make a body)
        const ast=blockDecode(saved.draftTree,{allowHoles:true}) as Script,encoded=blockEncode(ast,{allowHoles:true}),baseline={sourceText:session.sourceText,syntaxAst:session.syntaxAst,
          blockView:session.blockView,nodeMap:session.nodeMap,nodeIds:session.nodeIds,diagnostics:session.diagnostics,syntaxDiagnostics:session.syntaxDiagnostics,
          nextBlockId:session.nextBlockId,blockSelection:session.blockSelection,sourceRevision:session.sourceRevision,contextRevision:session.contextRevision};
        const source=formatScript(ast,{allowHoles:true});Object.assign(session,{syntaxAst:ast,blockView:encoded.tree,nodeMap:encoded.nodeMap,nodeIds:encoded.nodeIds,nextBlockId:encoded.nodeMap.size+1,
          blockDraft:{baseline,ast,tree:encoded.tree,source,codeSource:saved.mode==='code'?saved.source:undefined,pending:session.pendingEdit}});
      }
      const mode=appCalls.workIsMeijin()?'code':saved.mode;
      if(!appCalls.workIsMeijin())appVars.editorModes.set(binding.kind,mode);
      session.mode=mode;binding.textarea.value=saved.source;appRedraw.editorBinding(binding);
      if(mode==='blocks'&&saved.pending.field&&!binding.view!.restorePending(session.pendingEdit))throw new AkariError('F503','書きかけの 入力を もとに もどせません');
      showEditorFailure(binding,saved.pending.reason||'書きかけの 本文を もどしました',{preservePending:true});
      if(binding===appVars.mainEditor&&saved.pending.kind==='source-import'){const plan=appCalls.sourceImportPlan(binding,saved.source);if(plan)showSourceImport(binding,saved.source,plan);}
    }
    for(const view of state.views){const binding=view.kind==='draft'?appVars.draftEditor:appVars.mainEditor;if(view.kind==='script'&&appCalls.bindingOwner(binding)!==view.ownerKey)continue;
      if(!binding.session)appCalls.getEditorSession(binding,{force:true});
      // (getEditorSession gives the editor its session)
      Object.assign(binding.session!,{codeSelection:{...view.codeSelection},scrollState:{...binding.session?.scrollState,...view.scrollState}});
      binding.textarea.setSelectionRange(view.codeSelection.start,view.codeSelection.end,view.codeSelection.direction);binding.textarea.scrollTop=view.scrollState.codeTop;binding.textarea.scrollLeft=view.scrollState.codeLeft;}
    if(state.sourceOverviewOpen&&!state.pendingEditors.length)showSourceOverview();
    appCalls.updateDirty();
  }

  function writeAutosave() {
    if (appCalls.composingAny() || appVars.activeDragCleanup || appVars.colorEdit) {
      scheduleAutosave();
      return Promise.resolve(false);
    }
    if (!appCalls.hasPendingEditor()) flushActiveEditor();
    let rec: AutosaveRecord, fingerprint: string;
    try {
      if (appCalls.textTooLong()) throw new AkariError('F504', '本文の 文字が 多すぎます。文を へらして ください');
      fingerprint = appCalls.stateFingerprintCore();
      const current=appCalls.snapshot(),past=appVars.history.slice(-Math.max(1, Math.floor(LIMITS.historyEntries / 2)));
      if(past.at(-1)?.stateFingerprint===current.stateFingerprint)past[past.length-1]=current;
      else{past.push(current);if(past.length>Math.max(1, Math.floor(LIMITS.historyEntries / 2)))past.shift();}
      const future=appVars.history.at(-1)?.stateFingerprint===current.stateFingerprint?appVars.redo.slice(-Math.max(1, Math.floor(LIMITS.historyEntries / 2))).reverse():[];
      const workspace=encodeWorkspaceHistory([...past,...future],past.length-1,builtinAssetRecords());
      appVars.autosaveRevisionTime=Math.max(Date.now(),appVars.autosaveRevisionTime+1);
      rec={id:'latest',version:2,updatedAt:appVars.autosaveRevisionTime,revision:appVars.recoveryEpoch,workspace,lastSavedFingerprint: appVars.lastSavedFingerprint,
        lastSavedEditorFingerprint:appCalls.validateSavedEditorFingerprint(appVars.lastSavedEditorFingerprint)};
    } catch (e) {
      appVars.el.autosave.textContent = appCalls.textTooLong() ? 'このパソコンに のこせなかったよ（文を へらしてね）' : 'このパソコンに のこせなかったよ（「ほぞん」で ファイルに しよう）';
      appCalls.log((e as Error).message, 'error');
      return Promise.resolve(false);
    }
    const status: (text: string) => void = (text) => {
      if (
        appVars.recoveryEpoch === rec.revision && appCalls.stateFingerprintCore() === fingerprint
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
        let db: IDBDatabase;
        try {
          db = await appCalls.openAutosaveDB();
        } catch (_) {
          return fallback();
        }
        try {
          await appCalls.autosaveTransaction(db, (store) => store.put(rec));
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
    if(!appCalls.modelLocked())appCalls.updateDirty();
    appVars.el.autosave.textContent = 'このパソコンには まだ のこして いないよ';
    appVars.autosaveTimer = setTimeout(writeAutosave, 1200);
  }
  function clearCallable(type: CallableDraft['type'] = 'action') {
    appCalls.hideMeijinProcedure();
    appCalls.captureEditorView(appVars.draftEditor);
    appVars.editorDraftSerial++;
    appVars.callableDraftCore = { ownerId: 'stage', type, name: '', argsText: '', source: '', editId: '', loadedKey: '' };
    appVars.callableLoadedKey = '';
    appVars.callableBaseline = appCalls.callableSignature();
    appRedraw.callable();
    if (appVars.draftEditor.view) appRedraw.editorBinding(appVars.draftEditor);
  }
  function loadCallable(v: string) {
    // (a made block's key is its kind and its id)
    const [type, id] = v.split(':') as [CallableDraft['type'], string],
      d = (type === 'action' ? appVars.project.actions : appVars.project.functions).find((x) => x.id === id);
    if (!d) return;
    appCalls.hideMeijinProcedure();
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
    appVars.callableBaseline = appCalls.callableSignature();
    appRedraw.callable();
    if (appVars.draftEditor.view) appRedraw.editorBinding(appVars.draftEditor);
  }
  function restoreCallableDraft(d: CallableDraft) {
    const old = [...appVars.project.actions, ...appVars.project.functions].find((x) => x.id === d.editId);
    if (old) loadCallable(`${appVars.project.actions.includes(old) ? 'action' : 'function'}:${old.id}`);
    else clearCallable(d.type);
    // (a draft checked is given back: only none gives none)
    appVars.callableDraftCore = {
      ...appCalls.validateCallableDraft(d)!,
      editId: old?.id || '',
      loadedKey: old ? d.loadedKey : '',
    };
    appVars.callableLoadedKey = appVars.callableDraftCore.loadedKey;
    appCalls.invalidateEditors();
    appRedraw.callable();
    appRedraw.callableOptions(appVars.callableLoadedKey);
    appCalls.$('#procModal').classList.add('show');
    appRedraw.editorBinding(appVars.draftEditor);
  }
  function finishAssetCommit(nextProject: Project, nextStore: InstanceType<typeof AssetStore>, message: string) {
    appVars.project = nextProject;
    appCalls.invalidateEditors();
    appVars.assetStore = nextStore.retainOnly(collectReachableAssetIds(nextProject));
    appCalls.revokeDesignUrls();
    appVars.appState = 'DESIGN';
    appCalls.setAssetProgress('');
    appCalls.pushHistoryNow();
    appVars.dirty = appCalls.currentFingerprint() !== appVars.lastSavedFingerprint;
    appCalls.updateDirty();
    scheduleAutosave();
    appRedraw.all();
    appRedraw.appearance();
    appRedraw.editor();
    appCalls.log(message, 'ok');
    appCalls.setStatus(message);
  }
  function replaceCurrentProject(nextProject: Project,nextAssets: InstanceType<typeof AssetStore>,targetId: string,event: EventName,status: string,emptyWorkHint=false) {
    if(appVars.tutorial)return;
    // Discard view-local transactions only after the user confirms replacement.
    appVars.mainEditor.view!.cancel();
    appVars.draftEditor.view!.cancel();
    appVars.headerPending=null;
    for(const control of [appVars.mainEditor.textarea,appVars.draftEditor.textarea,appCalls.$('#callableName'),appCalls.$('#callableArgs'),appCalls.$('#callablePhrase')])appVars.composingEditors.delete(control);
    appCalls.dropHistoryTimer();
    clearTimeout(appVars.autosaveTimer);
    appVars.recoveryEpoch++;
    appVars.activeDragCleanup?.();
    appCalls.closeEditingModals();
    clearCallable();
    appCalls.disposeRuntime();
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
    appCalls.hideSourceOverview();
    appRedraw.all();
    loadEditor();
    appCalls.resetHistory();
    appCalls.clearAutosave();
    appCalls.setStatus(status, emptyWorkHint);
  }
  function showSamplePicker() {
    if (!appVars.openRequest || appVars.openRequest.kind !== 'sample' || appCalls.modelLocked()) return;
    const grid = appCalls.$('#sampleGrid');
    grid.replaceChildren(...sampleCatalog().map(sample => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'sample-card'; button.dataset.sampleId = sample.id;
      const picture = document.createElement('span'); picture.className = 'sample-picture'; picture.setAttribute('aria-hidden','true');
      appCalls.fillSamplePicture(picture, sample.id);
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
    if (appCalls.modelLocked() || appVars.openRequest || document.querySelector('.modal.show:not(#procModal),dialog[open]')) return;
    confirmOpenRequest('sample');
  }
  function openSampleProject(id: string) {
    if (appCalls.modelLocked() || appVars.openRequest?.kind !== 'sample' || appVars.openRequest.phase !== 'selection') return;
    const approval = appVars.openRequest;
    // A stale approval cannot discard edits made after the picker was opened.
    const observed = currentOpenState();
    if (observed.fingerprint !== approval.fingerprint && observed.unsaved) {
      appCalls.$('#samplePicker').close(); appVars.openRequest=null; requestSampleProject(); return;
    }
    try {
      const sample = sampleCatalog().find(row=>row.id===id);
      if (!sample) throw new AkariError('F503','お手本が 見つかりません');
      const nextProject = makeSampleProject(id), nextAssets = makeSampleAssetStore(id);
      appVars.openRequest=null; appCalls.$('#samplePicker').close();
      // (a sample opens at a body of one of the events)
      replaceCurrentProject(nextProject,nextAssets,sample.targetId,sample.event as EventName,`「${sample.title}」を 開いたよ。動かして みよう！`);
    } catch(error) { appCalls.log('お手本を 開けませんでした: '+(error as Error).message,'error'); appCalls.setStatus('お手本を 開けなかったよ'); }
  }
  Object.assign(appCalls, {
    addComponent,
    applyNoteProposal,
    applyUiLevel,
    askLose,
    askSaveName,
    bodyNotices,
    cancelEditorPending,
    checkedEditorErrors,
    choosePreset,
    clearCallable,
    closeColorPicker,
    commitColor,
    commitResize,
    commitSource,
    confirmOpenRequest,
    currentOpenState,
    finishAssetCommit,
    finishTutorial,
    flushActiveEditor,
    flushEditor,
    loadCallable,
    loadEditor,
    markDirty,
    openColorPicker,
    releaseShellPointer,
    replaceCurrentProject,
    requestSampleProject,
    restoreEditorState,
    restoreSnap,
    rollbackDesign,
    saveCodeBinding,
    scheduleAutosave,
    selectObject,
    showDiagnosis,
    showEditorFailure,
    showSourceOverview,
    stopRun,
    switchEditorMode,
    syncCallableDraft,
    syncColorPicker,
    syncEditorShell,
    tutorialRefresh,
    updatePickerHsv,
    writeAutosave,
  } satisfies AppServicesCalls);
}
