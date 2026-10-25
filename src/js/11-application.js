  // ────────────────────────────────────────────────────────────────────────
  // 11 — Application coordination, persistence and shared history
  // ────────────────────────────────────────────────────────────────────────
  function createPaintEditor(onCommit) {
    const modal = document.querySelector('#paintModal'),
      canvas = modal.querySelector('canvas'),
      cx = canvas.getContext('2d', { willReadFrequently: true }),
      app = document.querySelector('#app'),
      color = modal.querySelector('#paintColor'),
      width = modal.querySelector('#paintWidth'),
      shape = modal.querySelector('#paintShape'),
      status = modal.querySelector('#paintStatus'),
      undo = modal.querySelector('#paintUndo'),
      redo = modal.querySelector('#paintRedo'),
      commit = modal.querySelector('#paintCommit');
    const size = 500;
    let tool = 'pen', history = [], historyIndex = -1, gesture = null,
      busy = false, returnFocus = null;
    const pixels = () => cx.getImageData(0, 0, size, size);
    const hasInk = (data = pixels().data) => {
      for (let i = 3; i < data.length; i += 4) if (data[i]) return true;
      return false;
    };
    const refresh = () => {
      for (const control of modal.querySelectorAll('button,input,select')) control.disabled = busy;
      undo.disabled = busy || !!gesture || historyIndex <= 0;
      redo.disabled = busy || !!gesture || historyIndex >= history.length - 1;
      commit.disabled = busy || !!gesture || !hasInk();
      shape.disabled = busy || !['rectangle', 'ellipse'].includes(tool);
      for (const b of modal.querySelectorAll('[data-paint-tool]'))
        b.setAttribute('aria-pressed', String(b.dataset.paintTool === tool));
      for (const b of modal.querySelectorAll('[data-paint-color]'))
        b.setAttribute('aria-pressed', String(b.dataset.paintColor === color.value));
      modal.querySelector('#paintWidthValue').textContent = width.value;
    };
    const record = () => {
      const next = pixels(), previous = history[historyIndex];
      if (previous && next.data.every((v, i) => v === previous.data[i])) return;
      history.splice(historyIndex + 1);
      history.push(next);
      if (history.length > Math.max(1, Math.floor(LIMITS.historyEntries / 2)) + 1) history.shift();
      historyIndex = history.length - 1;
    };
    const travel = (delta) => {
      if (busy || gesture) return;
      const next = historyIndex + delta;
      if (next < 0 || next >= history.length) return;
      historyIndex = next;
      cx.putImageData(history[historyIndex], 0, 0);
      status.textContent = delta < 0 ? 'もとに もどしました。' : 'やり直しました。';
      refresh();
    };
    function point(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: clamp((event.clientX - rect.left) * size / rect.width, 0, size),
        y: clamp((event.clientY - rect.top) * size / rect.height, 0, size),
      };
    }
    function stroke(from, to, g) {
      cx.save();
      cx.globalCompositeOperation = g.tool === 'eraser' ? 'destination-out' : 'source-over';
      cx.strokeStyle = cx.fillStyle = g.color;
      cx.lineWidth = g.width;
      cx.lineCap = cx.lineJoin = 'round';
      cx.beginPath();
      if (from.x === to.x && from.y === to.y) {
        cx.arc(to.x, to.y, g.width / 2, 0, Math.PI * 2);
        cx.fill();
      } else {
        cx.moveTo(from.x, from.y);
        cx.lineTo(to.x, to.y);
        cx.stroke();
      }
      cx.restore();
    }
    function drawShape(to, g) {
      cx.putImageData(g.before, 0, 0);
      if (g.tool === 'line') return stroke(g.start, to, g);
      const x = Math.min(g.start.x, to.x), y = Math.min(g.start.y, to.y),
        w = Math.abs(to.x - g.start.x), h = Math.abs(to.y - g.start.y);
      cx.save();
      cx.strokeStyle = cx.fillStyle = g.color;
      cx.lineWidth = g.width;
      cx.lineJoin = 'round';
      cx.beginPath();
      if (g.tool === 'rectangle') cx.rect(x, y, w, h);
      else cx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      if (g.filled) cx.fill();
      else cx.stroke();
      cx.restore();
    }
    function flood(at) {
      const image = pixels(), data = image.data,
        start = Math.min(size - 1, Math.floor(at.y)) * size + Math.min(size - 1, Math.floor(at.x)),
        target = Array.from(data.slice(start * 4, start * 4 + 4)),
        ink = [1, 3, 5].map(i => parseInt(color.value.slice(i, i + 2), 16));
      if (target[3] === 255 && ink.every((v, i) => v === target[i])) return;
      const seen = new Uint8Array(size * size), queue = new Int32Array(size * size);
      let head = 0, tail = 0;
      const visit = (p) => {
        if (seen[p]) return;
        seen[p] = 1;
        const i = p * 4, a = data[i + 3];
        if (a === target[3] && (a === 0 || target.every((v, k) => data[i + k] === v))) {
          data.set([...ink, 255], i);
          queue[tail++] = p;
        } else if (target[3] === 0 && a > 0 && a < 255) {
          // Fill behind the smooth boundary without crossing it.
          for (let k = 0; k < 3; k++) data[i + k] = Math.round((data[i + k] * a + ink[k] * (255 - a)) / 255);
          data[i + 3] = 255;
        }
      };
      visit(start);
      while (head < tail) {
        const p = queue[head++], x = p % size, y = Math.floor(p / size);
        if (x > 0) visit(p - 1);
        if (x + 1 < size) visit(p + 1);
        if (y > 0) visit(p - size);
        if (y + 1 < size) visit(p + size);
      }
      cx.putImageData(image, 0, 0);
    }
    function finishGesture(cancel = false) {
      if (!gesture) return;
      const g = gesture;
      gesture = null;
      if (cancel) cx.putImageData(g.before, 0, 0);
      else record();
      if (canvas.hasPointerCapture(g.id)) canvas.releasePointerCapture(g.id);
      refresh();
    }
    function close() {
      finishGesture(true);
      modal.classList.remove('show');
      app.inert = false;
      cx.clearRect(0, 0, size, size);
      history = [];
      historyIndex = -1;
      returnFocus?.focus({ preventScroll: true });
    }
    function cancel() {
      if (busy) return;
      if (hasInk() && !confirm('かいた 絵を すてて とじる？')) return;
      close();
    }
    function cropped() {
      const data = pixels().data;
      let left = size, top = size, right = -1, bottom = -1;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (!data[(y * size + x) * 4 + 3]) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
      if (right < left) return null;
      const out = document.createElement('canvas'), w = right - left + 1, h = bottom - top + 1;
      out.width = Math.max(8, w); out.height = Math.max(8, h);
      out.getContext('2d').drawImage(canvas, left, top, w, h,
        Math.floor((out.width - w) / 2), Math.floor((out.height - h) / 2), w, h);
      return out;
    }
    canvas.addEventListener('pointerdown', (event) => {
      if (busy || gesture || event.button !== 0 || event.isPrimary === false) return;
      event.preventDefault();
      const at = point(event);
      if (tool === 'fill') {
        flood(at); record(); refresh(); return;
      }
      gesture = { id: event.pointerId, before: pixels(), start: at, last: at,
        tool, color: color.value, width: Number(width.value), filled: shape.value === 'filled' };
      canvas.setPointerCapture(event.pointerId);
      if (tool === 'pen' || tool === 'eraser') stroke(at, at, gesture);
      refresh();
    });
    canvas.addEventListener('pointermove', (event) => {
      if (gesture?.id !== event.pointerId) return;
      event.preventDefault();
      const at = point(event);
      if (gesture.tool === 'pen' || gesture.tool === 'eraser') stroke(gesture.last, at, gesture);
      else drawShape(at, gesture);
      gesture.last = at;
    });
    canvas.addEventListener('pointerup', (event) => {
      if (gesture?.id !== event.pointerId) return;
      const at = point(event);
      if (gesture.tool === 'pen' || gesture.tool === 'eraser') stroke(gesture.last, at, gesture);
      else drawShape(at, gesture);
      finishGesture();
    });
    for (const name of ['pointercancel', 'lostpointercapture'])
      canvas.addEventListener(name, (event) => { if (gesture?.id === event.pointerId) finishGesture(true); });
    window.addEventListener('blur', () => finishGesture(true));
    for (const button of modal.querySelectorAll('[data-paint-tool]'))
      button.onclick = () => { if (!gesture) { tool = button.dataset.paintTool; refresh(); } };
    for (const [name, value] of [
      ['黒', '#111111'], ['白', '#ffffff'], ['ねずみ色', '#888888'], ['赤', '#e53935'],
      ['だいだい', '#f57c00'], ['黄', '#fdd835'], ['緑', '#43a047'], ['水色', '#29b6f6'],
      ['青', '#1e5bd7'], ['むらさき', '#8e24aa'], ['もも色', '#ec407a'], ['茶', '#795548'],
    ]) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.paintColor = value;
      b.style.setProperty('--paint-color', value);
      b.setAttribute('aria-label', name); b.title = name;
      b.onclick = () => { color.value = value; refresh(); };
      modal.querySelector('#paintColors').append(b);
    }
    color.oninput = width.oninput = refresh;
    undo.onclick = () => travel(-1);
    redo.onclick = () => travel(1);
    modal.querySelector('#paintCancel').onclick = cancel;
    document.addEventListener('keydown', (event) => {
      if (!modal.classList.contains('show') || event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (gesture) finishGesture(true); else cancel();
      } else if ((event.ctrlKey || event.metaKey) && !event.altKey && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault(); event.stopPropagation();
        travel(event.key.toLowerCase() === 'y' || event.shiftKey ? 1 : -1);
      }
    }, true);
    commit.onclick = async () => {
      if (busy || gesture) return;
      const out = cropped();
      if (!out) return;
      busy = true; refresh(); status.textContent = '絵を おいて います…';
      try {
        await onCommit(out);
        close();
      } catch (error) {
        status.textContent = `絵を おけませんでした: ${error.message}`;
      } finally { busy = false; refresh(); }
    };
    return {
      open() {
        if (busy || modal.classList.contains('show')) return;
        returnFocus = document.activeElement;
        cx.clearRect(0, 0, size, size);
        history = [pixels()]; historyIndex = 0; tool = 'pen';
        color.value = '#111111'; width.value = '4'; shape.value = 'outline';
        status.textContent = 'ます目は、色が ついて いない とうめいな ところの しるしです。絵としては ほぞんされません。';
        modal.classList.add('show'); app.inert = true;
        refresh(); modal.querySelector('[data-paint-tool="pen"]').focus();
      },
      hasDrawing: () => modal.classList.contains('show') && hasInk(),
    };
  }

  function initApp() {
    const $ = (s) => document.querySelector(s),
      $$ = (s) => [...document.querySelectorAll(s)];
    let initialSnapshot = null,
      autosaveQueue = Promise.resolve(),
      recoveryEpoch = 0,
      autosaveRevisionTime = 0,
      lastObservedFingerprint = null,
      activeDragCleanup = null,
      designResizePreview = null,
      colorEdit = null;
    let callableBaseline = '',
      callableLoadedKey = '',
      debugSourceKey = null,
      runtimePaintFrame = null,
      runtimePaintFlags = 0;
    const physicalKeys = new Map();
    let project = makeEmptyProject(),
      assetStore = makeDefaultAssetStore(),
      selectedId = 'sprite-1',
      currentEvent = 'start',
      selectedScriptId = null,
      runtime = null,
      runtimeCache = null,
      scheduler = null,
      compiled = null,
      activeLoc = null,
      // Where the run stopped by a mistake: after ■ 止める the place stays marked until the next edit.
      keptFail = null,
      activeTaskId = null,
      dirty = false,
      lastSavedFingerprint = '',
      lastSavedEditorFingerprint = '',
      history = [],
      redo = [],
      historyTimer = null,
      autosaveTimer = null,
      recoveryData = null,
      appState = 'DESIGN',
      // The run screen after the run ended (every body done, or 作品を全部止める): the last picture stays, ■ 止める only.
      runFinished = false,
      // The run stopped at a mistake (the failure dialog): it cannot go on, so the run screen shows ■ 止める only.
      runFailed = false,
      // When ▶ 動かす was pressed: ■ 止める takes its place, and a press of it within 0.5 s (the second press of a double
      // press) does nothing.
      runPressedAt = -Infinity,
      generationToken = 0,
      designObjectUrls = new Map(),
      previewAudio = null;
    const el = {
      form: $('#formSurface'),
      frame: $('#formFrame'),
      title: $('#formTitle'),
      canvas: $('#penCanvas'),
      tree: $('#projectTree'),
      props: $('#properties'),
      monitor: $('#runtimeMonitor'),
      obj: $('#objectSelect'),
      event: $('#eventSelect'),
      editor: $('#codeEditor'),
      gutter: $('#lineGutter'),
      issue: $('#codeIssue'),
      hints: $('#codeHints'),
      console: $('#console'),
      status: $('#statusText'),
      autosave: $('#autosaveState'),
      runState: $('#runState'),
      dirty: $('#dirtyState'),
      projectName: $('#projectName'),
      fileInput: $('#fileInput'),
    };
    function syncPropertyScrollPadding() {
      const actions = el.props.querySelector(':scope > .prop-actions');
      el.props.style.setProperty('--prop-actions-height', (actions?.offsetHeight || 0) + 'px');
    }
    const propertyHeaderObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(syncPropertyScrollPadding) : null;
    let editorContextRevision = 1,
      editorDraftSerial = 1,
      syncingDraft = false,
      headerPending = null;
    let callableDraftCore = {
      ownerId: 'stage',
      type: 'action',
      name: '',
      argsText: '',
      source: '',
      editId: '',
      loadedKey: '',
    };
    const editorSessions = new Map(),
      editorModes = new Map();
    const mainEditor = { kind: 'script', textarea: el.editor, session: null, view: null };
    const draftEditor = {
      kind: 'draft',
      textarea: $('#callableCode'),
      session: null,
      view: null,
    };
    let sourceOverviewOpen = false, sourceOverviewViews = [], sourceOverviewObserver = null, sourceOverviewSignature = '';
    let entryLayoutPlaced=false;
    const entryControlHomes=new Map();
    let placeHistoryButtons=()=>{};
    // tutorialNotice: a short answer to the child's last try on one step (ことばを 入れてね), shown until the step changes.
    let tutorial=null, pausedTutorial=null, tutorialEpoch=0, workspaceIdentity=0, tutorialNotice=null,
      tutorialTimer=null, tutorialTrace=null, tutorialSave=null, tutorialExpected=null, tutorialInsertion=null;
    // The level (レベル): baseUiLevel is the level chosen other than 名人 (はじめて／かんたん／くわしく). A work with a 名人 text is
    // shown as くわしく with 名人 chosen, and no other level can be chosen while it has one; without one, the chosen level
    // comes back (undo, open, a new work). The work file and autosave keep only the chosen level.
    let baseUiLevel='entry';
    const workIsMeijin=()=>(project?.scripts||[]).some(isMeijinScript);
    // The workspace (workspaceIdentity) whose 名人 text an editor last showed: when that text goes away there, the view
    // stays code (getEditorSession).
    let meijinShownIn=null;
    // The view a body list shows: the chosen view, and code in a work with a 名人 text.
    const chosenEditorMode=(kind='script',fallback='code')=>workIsMeijin()?'code':editorModes.get(kind)||fallback;
    // The levels the picker offers depend on the view: blocks はじめて／かんたん／くわしく, code かんたん／くわしく／名人, and a
    // work with a 名人 text only 名人. A level that cannot be chosen is not in the list at all (not a disabled option).
    const UI_LEVEL_NAMES={entry:'はじめて',basic:'かんたん',advanced:'くわしく',meijin:'名人'};
    // The view the main editor shows (the list of all bodies uses the remembered view).
    const shownEditorMode=()=>(!sourceOverviewOpen&&mainEditor.session?.mode)||chosenEditorMode('script','blocks');
    function emptyProjectStatus() {
      if (workIsMeijin()) return 'からっぽの 作品だよ。本文を 書いてね。';
      if (document.body.dataset.uiLevel === 'entry') return 'からっぽの 作品だよ。ブロックを 入れてね。「いっしょに作る」でも はじめられるよ。';
      return `からっぽの 作品だよ。${shownEditorMode() === 'blocks' ? 'ブロックを 入れるか' : '本文を 書くか'}、「お手本を開く」で ためしてね`;
    }
    function uiLevelChoices(view=shownEditorMode()){return workIsMeijin()?['meijin']:view==='blocks'?['entry','basic','advanced']:['basic','advanced','meijin'];}
    // shown: the view the editor has just been laid out in (syncEditorShell). Returns true when the shown level changed.
    function applyUiLevel(shown=null){
      const meijin=workIsMeijin(),before=document.body.dataset.uiLevel;
      // はじめて is a block level: a view laid out in code (a body the blocks cannot show, or 名人 text that went away) goes
      // on at かんたん. The view is never changed by a level.
      if(!meijin&&baseUiLevel==='entry'&&shown==='code')baseUiLevel='basic';
      document.body.dataset.meijinLevel=meijin?'on':'off';
      document.body.dataset.uiLevel=meijin?'advanced':baseUiLevel;
      const select=$('#uiLevel'),choices=uiLevelChoices(shown||shownEditorMode()),value=meijin?'meijin':baseUiLevel;
      if([...select.options].map(o=>o.value).join()!==choices.join())
        select.replaceChildren(...choices.map(level=>{const option=document.createElement('option');option.value=level;option.textContent=UI_LEVEL_NAMES[level];return option;}));
      select.value=value;
      const initialHint=emptyProjectStatus();
      if(el.status.textContent.startsWith('からっぽの 作品だよ。') && el.status.textContent!==initialHint)setStatus(initialHint);
      // The コード／ブロック toggle is shown at every level: where it cannot switch (はじめて, a 名人 work) a press says why.
      if(mainEditor.session)paintBindingModeToggle(mainEditor);
      return before!==undefined&&before!==document.body.dataset.uiLevel;
    }
    // The chosen level in the form the work's editor state keeps (はじめて is kept as かんたん).
    const keptUiLevel=()=>baseUiLevel==='entry'?'basic':baseUiLevel;
    function renderEntrySurface() {
      const entry=document.body.dataset.uiLevel==='entry';
      // はじめて puts the place of ⏸ いったん止める／▶ つづける
      // (final call 21; the two take turns in it) under the stage, as on a video.
      for(const node of [$('#runPauseSlot')]){
        if(entry&&!entryLayoutPlaced){const marker=document.createComment('entry control home');node.before(marker);entryControlHomes.set(node,marker);}
        if(entry&&node.id==='runPauseSlot'){if(node.parentElement!==$('#entryRunControls'))$('#entryRunControls').append(node);}
        else if(entryLayoutPlaced){const marker=entryControlHomes.get(node);if(marker?.isConnected){marker.after(node);marker.remove();}entryControlHomes.delete(node);}
      }
      const main=$('.main'),side=$('.side'),designer=$('#designerWindow'),objects=$('.objects-window');
      if(entry){if(designer.parentElement!==main)main.insertBefore(designer,side);if(objects&&side.firstElementChild!==objects)side.prepend(objects);}
      else if(entryLayoutPlaced&&document.body.dataset.editorMode==='blocks'){side.prepend(designer);side.insertBefore(objects,$('.properties-window'));}
      entryLayoutPlaced=entry;
      // The click button names what is chosen: 「たくどん」が おされたとき, 画面が おされたとき.
      const clickLabel=(selectedId==='stage'?'画面':'「'+(targetById(selectedId)?.name||'')+'」')+'が おされた とき';
      if($('#entryClickEvent').textContent!==clickLabel)$('#entryClickEvent').textContent=clickLabel;
      for(const [id,event] of [['entryStartEvent','start'],['entryClickEvent','click']]) {
        $('#'+id).disabled=modelLocked()||!eventsFor(selectedId).includes(event);
        $('#'+id).setAttribute('aria-pressed',String(currentEvent===event));
      }
      // What はじめて keeps but does not show: blocks and rules it has not in this body, and every body of another event
      // (keys, signals, ふれたとき …), which only the two buttons above could open. The holes of a block being put in
      // (〔くり返すことを入れる〕) are not such blocks.
      const tree=mainEditor.session?.blockView;
      const outside=(tree&&[...buildBlockIndex(tree).values()].some(({node})=>!String(node.schemaId).startsWith('Hole:')&&
        ['statement','rule'].includes(BLOCK_SCHEMA_BY_ID.get(node.schemaId)?.category)&&!ENTRY_BLOCK_SCHEMA_IDS.has(node.schemaId)))||
        (project?.scripts||[]).some(s=>!['start','click'].includes(s.event)&&!isMeijinScript(s)&&String(s.source||'').trim());
      $('#entryOutside').hidden=!entry||!outside||!!tutorial;
      placeHistoryButtons();
    }
    function selectEntryEvent(event) {
      if (!tutorialAllows(tutorial,'event:'+event)||modelLocked()||!eventsFor(selectedId).includes(event)||!flushActiveEditor()) return;
      captureEditorView(mainEditor);hideSourceOverview();currentEvent=event;
      selectedScriptId=project.scripts.find(s=>s.targetId===selectedId&&s.event===event)?.id||null;
      loadEditor();if(!modelLocked())pushHistoryNow();confirmTutorialOperation('event:'+event);tutorialRefresh();
    }
    function confirmTutorialOperation(action=null) {
      const step=tutorialStep(tutorial);if(!step||action&&step.allowed[0]!==action)return;
      if(step.free||step.ownWords){const role=tutorialField(mainEditor.session?.blockView,step),v=role.node?.fields[role.key];
        // An ownWords step (what the fish says) takes the child's own words when they are not empty (F-04); a free step
        // takes a new number in its range. The later steps and the check of the run use the accepted value.
        if(!tutorialFreeValueAccepted(step,v)){if(step.ownWords)tutorialNotice={step:step.id,text:step.emptyMessage};return;}
        tutorialNotice=null;tutorial.values[step.id]=v;tutorialExpected=tutorialExpectedTrees(makeTutorialProject(),tutorial.steps,tutorial.values);
      }
      tutorial.confirmedStep=step.id;
    }
    function tutorialBody() { return mainEditor.session?.blockView?.bodies?.body||[]; }
    function tutorialLiteral(node) { return node?.schemaId==='QuantityLiteral'?tutorialLiteral(node.inputs.value):node; }
    function tutorialOperationAllowed(binding,operation) {
      if(!tutorial)return true;if(binding!==mainEditor||selectedId!==tutorial.target||currentEvent!=='click')return false;
      const step=tutorialStep(tutorial);if(!step)return false;
      if(step.block){const loc=tutorialDestination(mainEditor.session.blockView,step);
        if(!tutorialInsertionReady(step))return false;
        return operation.type==='insert'&&operation.parentId===loc?.parentId&&operation.body===loc.body&&operation.index===loc.index
          &&JSON.stringify(tutorialNodeShape(operation.node))===JSON.stringify(tutorialNodeShape(tutorialCandidate(step.block,project)));}
      if(step.ref&&step.action!=='undo'){const role=tutorialField(mainEditor.session.blockView,step);
        if(operation.type!=='field'||operation.id!==role?.node?.id||operation.key!==role.key)return false;
        return step.input.type==='number'?typeof operation.value==='number'&&Number.isFinite(operation.value)&&operation.value>=step.input.min&&operation.value<=step.input.max&&(!step.integer||Number.isInteger(operation.value))
          :typeof operation.value==='string'&&cpLen(operation.value)<=100;}
      return false;
    }
    function tutorialInsertionReady(step=tutorialStep(tutorial)) {
      const loc=step?.block&&tutorialDestination(mainEditor.session?.blockView,step);
      return !!loc&&tutorialInsertion?.step===step.id&&tutorialInsertion.epoch===tutorial.epoch
        &&tutorialInsertion.parentId===loc.parentId&&tutorialInsertion.body===loc.body&&tutorialInsertion.index===loc.index;
    }
    function selectTutorialInsertion(location) {
      const step=tutorialStep(tutorial),expected=step?.block&&tutorialDestination(mainEditor.session?.blockView,step);
      if(!expected||location.parentId!==expected.parentId||location.body!==expected.body||location.index!==expected.index)return;
      tutorialInsertion={...location,step:step.id,epoch:tutorial.epoch};
      refreshTutorialPresentation();focusTutorialTarget();
    }
    function tutorialRoleControl() {
      const step=tutorialStep(tutorial),ref=step&&tutorialField(mainEditor.session?.blockView,step);
      return ref?.node&&[...$('#blockEditor').querySelectorAll('[data-blockui-field]')].find(n=>n.dataset.blockId===ref.node.id&&n.dataset.blockuiField===ref.key);
    }
    function tutorialElementAllowed(element) {
      if(!tutorial)return true;if(!(element instanceof Element))return false;
      const step=tutorialStep(tutorial),action=step?.allowed[0];
      // ⏸ いったん止める and ▶ つづける are the run screen's own controls at every level (final call 21): like ■ 止める and the
      // exit, the guide never blocks them.
      if(element.closest('#tutorialExit,#stopBtn,#pauseBtn,#continueBtn'))return true;
      if(action==='choice')return !!element.closest('#tutorialChoices button,#tutorialFinish');
      if(action==='verify-save'&&element.closest('#tutorialVerifySave,#tutorialSavedFile'))return true;
      const direct={'event:click':'entryClickEvent',run:'runBtn',undo:'undoBtn',save:'saveBtn'}[action];if(direct&&element.closest('#'+direct))return true;
      if(step?.block){if(element.closest('#blockEditor [data-lesson-block="'+step.block+'"]'))return tutorialInsertionReady(step);
        // The place is a 「＋ ここに入れる」, or the hole of an empty enclosure, which is its only place (E-03).
        const command=element.closest('#blockEditor [data-blockui-action="body-insert"],#blockEditor .blockui-hole-target'),loc=tutorialDestination(mainEditor.session?.blockView,step);
        return !tutorialInsertionReady(step)&&!!command&&!!loc&&command.dataset.parentId===loc.parentId&&command.dataset.blockuiBody===loc.body&&Number(command.dataset.insertIndex)===loc.index;}
      if(step?.ref&&step.action!=='undo'){const control=tutorialRoleControl();return element===control||control?.contains(element)
        ||!!element.closest('#blockEditor [data-blockui-action="commit"],#blockEditor [data-blockui-action="cancel"],#editorCancel');}
      if(action==='runtime:click')return !tutorialTrace?.busy&&tutorialTrace?.clicks<step.clicks&&!!element.closest('.component[data-id="'+tutorial.target+'"]');return false;
    }
    // The step's own place comes first in the guide's Tab order, then ■ 止める and the exit, then ⏸／▶ つづける.
    const tutorialFocusRank=n=>['pauseBtn','continueBtn'].includes(n.id)?2:['tutorialExit','stopBtn'].includes(n.id)?1:0;
    function tutorialFocusTargets() {
      return $$('button,input,select,textarea,summary,[tabindex="0"]').filter(n=>!n.disabled&&!n.hidden&&n.getClientRects().length&&tutorialElementAllowed(n)).sort((a,b)=>tutorialFocusRank(a)-tutorialFocusRank(b));
    }
    // A message above the editor changes its height; the guided place stays in view.
    function keepTutorialTargetInView() {
      if(!tutorial)return;
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
    function tutorialRecordStatement(task,node,epoch,generation) {
      if(!tutorial||!tutorialTrace||epoch!==tutorial.epoch||generation!==generationToken||tutorialTrace.epoch!==tutorial.epoch||!runtime)return;
      const actor=runtime.actor(tutorial.target);if(!actor)return;
      tutorialTrace.sawTask=true;
      tutorialTrace.statements.push({kind:node.kind,op:node.op||null,x:actor.x,y:actor.y,click:tutorialTrace.clicks});
    }
    function tutorialCollectRuntime() {
      if(!tutorial||!tutorialTrace||tutorialTrace.epoch!==tutorial.epoch||!runtime||!scheduler)return;
      const trace=tutorialTrace,actor=runtime.actor(tutorial.target);if(!actor)return;
      const active=[...scheduler.tasks.values()].some(t=>t.runtimeId===tutorial.target&&!['DONE','CANCELLED','ERROR'].includes(t.state));
      if(trace.busy&&trace.sawTask&&!active&&!trace.failed){trace.busy=false;trace.sawTask=false;
        trace.observations.push({x:actor.x,y:actor.y,score:runtime.projectVars.get('点数'),direction:actor.direction,scale:actor.scalePercent,costume:actor.costumeId});}
      if(trace.busy||trace.failed||trace.observations.length!==trace.requiredClicks)return;
      const moving=trace.statements.some(s=>s.kind==='MotionCommand'&&s.op==='GOTO');
      if(moving&&(trace.speech||[]).includes(tutorial.values?.['speech-text']??'つかまった！')){trace.complete=true;confirmTutorialOperation('runtime:click');}
    }
    $('#tutorialFinish').onclick=()=>tutorialChoose('finish');
    function tutorialChoose(key) {
      const step=tutorialStep(tutorial);if(!step||step.action!=='choice'||modelLocked()||!flushActiveEditor())return;
      let extra;
      if(key==='finish')extra=[tutorialDefine({id:'save-work',action:'save',message:'「保存」を おして、作った 作品を ファイルに ほぞんしよう。'}),
        tutorialDefine({id:'verify-save',action:'verify-save',message:'「ほぞんした 作品を たしかめる」を おして、いま ほぞんした ファイルを えらぼう。'})];
      else if(step.choice==='course'){
        const course=TUTORIAL_COURSES.find(c=>c.id===key);if(!course||tutorial.courses.includes(key))return;
        tutorial.courses.push(key);extra=tutorialCourseSteps(key,tutorialBody().length,key);
      }else{
        const course=TUTORIAL_COURSES.find(c=>c.id===step.course),leaf=course?.children.find(c=>c.id===key);if(!leaf)return;
        tutorial.leaves.push(key);extra=tutorialExtensionSteps(step.course,key,tutorialBody().length,step.course+'-'+key);
      }
      tutorial.steps=[...tutorial.steps.slice(0,tutorial.index+1),...extra];tutorial.index++;tutorial.confirmedStep=null;tutorialTrace=null;
      tutorialExpected=tutorialExpectedTrees(makeTutorialProject(),tutorial.steps,tutorial.values);
      mainEditor.view.render({force:true});tutorialRefresh();focusTutorialTarget();
    }
    function renderTutorialChoices(step) {
      const box=$('#tutorialChoices'),visible=step.action==='choice';box.hidden=!visible;$('#tutorialFinish').hidden=!visible;
      const signature=visible?step.id+':'+tutorial.courses.join(','):'';
      if(box.dataset.choiceSignature===signature)return;box.dataset.choiceSignature=signature;box.replaceChildren();if(!visible)return;
      const choices=step.choice==='course'?TUTORIAL_COURSES.filter(c=>!tutorial.courses.includes(c.id)):
        TUTORIAL_COURSES.find(c=>c.id===step.course).children;
      for(const choice of choices){const button=document.createElement('button');button.type='button';button.dataset.tutorialChoice=choice.id;
        const title=document.createElement('strong'),description=document.createElement('span');title.textContent=choice.label;description.textContent=choice.description;
        button.append(title,description);button.onclick=()=>tutorialChoose(choice.id);box.append(button);}
    }
    function tutorialFacts() {
      const step=tutorialStep(tutorial),tree=mainEditor.session?.blockView,expectedTree=tutorialExpected?.[tutorial.index+1];
      const matches=tree&&expectedTree&&JSON.stringify(tutorialNodeShape(tree.bodies.body))===JSON.stringify(tutorialNodeShape(expectedTree.bodies.body));
      let expected=!!matches;
      if(step?.action==='run')expected=expected&&appState==='RUNNING';
      if(step?.action==='runtime:click')expected=expected&&tutorialTrace?.trial===step.id.slice(4)&&!!tutorialTrace.complete;
      if(step?.action==='stop')expected=expected&&appState==='DESIGN'&&!!tutorialTrace?.complete;
      if(step?.action==='save')expected=expected&&!!tutorialSave&&tutorialSave.fingerprint===currentFingerprint();
      if(step?.action==='verify-save')expected=expected&&!!tutorialSave?.verified;
      return {confirmedStep:tutorial.confirmedStep,sameWork:workspaceIdentity===tutorial.identity&&selectedId===tutorial.target&&currentEvent==='click',
        pending:!!mainEditor.session?.pendingEdit&&mainEditor.session.pendingEdit.kind!=='block-draft'||composingAny(),
        failed:!!tutorialTrace?.failed,expected};
    }
    function refreshTutorialPresentation() {
      if(!tutorial)return;
      const step=tutorialStep(tutorial);
      // An empty enclosure shows its hole as its only place (E-03): the guide names what the child sees.
      const place=step?.block&&tutorialDestination(mainEditor.session?.blockView,step),
        holeOnly=!!place&&(()=>{const items=buildBlockIndex(mainEditor.session.blockView).get(place.parentId)?.node.bodies?.[place.body];return items?.length===1&&items[0].schemaId==='Hole:statement';})();
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
    function tutorialRefresh() {
      if (!tutorial) return;
      try {
        tutorialCollectRuntime();
        if (tutorialStep(tutorial)?.id==='verify-save'&&tutorialSave&&tutorialSave.fingerprint!==currentFingerprint()) {
          tutorialSave=null;tutorial={...tutorial,index:tutorialSequence(tutorial).findIndex(s=>s.id==='save-work')};
        }
        const stepBefore=tutorialStep(tutorial),facts=tutorialFacts();
        // Selecting the click event is itself the first predicate; before that,
        // same-work does not require the event to have already been selected.
        if(stepBefore?.id==='choose-click')facts.sameWork=workspaceIdentity===tutorial.identity&&selectedId===tutorial.target;
        const next=tutorialAdvance(tutorial,facts,tutorial.epoch),changed=next!==tutorial;tutorial=next;
        if (tutorial.phase==='complete') { finishTutorial(true);setStatus('できたね！ つぎは、じゆうに かえて 遊ぼう。');return; }
        const step=tutorialStep(tutorial);document.body.dataset.tutorialStep=step.id;
        if(changed){tutorialInsertion=null;mainEditor.view.render({force:true});}
        $('#tutorialGuide').hidden=false;$('#tutorialVerifySave').hidden=step.id!=='verify-save';
        renderTutorialChoices(step);
        if(tutorialNotice&&tutorialNotice.step!==step.id)tutorialNotice=null;
        $('#tutorialText').textContent=tutorialTrace?.failed?'動かなかったね。「■ 止める」で もどって、もう一度 やって みよう。':step.choice==='course'&&tutorial.courses.length===TUTORIAL_COURSES.length?'3つの 遊びを 組み合わせたね！ ほぞんして、自分で 遊んでみよう。':tutorialNotice?.text||step.message;
        refreshTutorialPresentation();
        if(changed)focusTutorialTarget();
      } catch(error) { finishTutorial(false);log('あんないを つづけられませんでした: '+error.message,'error');setStatus('あんないを つづけられなかったよ。作品は のこって いるよ'); }
    }
    async function beginTutorial() {
      const blocked=()=>tutorial||document.body.dataset.uiLevel!=='entry'||modelLocked()||document.querySelector('.modal.show,.modal.open,dialog[open]');
      if (blocked()) return;
      if (pausedTutorial&&pausedTutorial.identity===workspaceIdentity&&pausedTutorial.fingerprint===currentFingerprint()
        &&pausedTutorial.editorFingerprint===openEditorFingerprint()&&selectedId===pausedTutorial.target&&currentEvent==='click') {
        tutorial={...pausedTutorial,confirmedStep:null,epoch:++tutorialEpoch,phase:'waiting'};pausedTutorial=null;
        tutorialTrace=tutorial.trace?{...tutorial.trace,epoch:tutorial.epoch}:null;
        tutorialSave=null;
        if(tutorialStep(tutorial)?.id==='verify-save')tutorial.index=tutorialSequence(tutorial).findIndex(s=>s.id==='save-work');
      } else {
        if(!(await askLose())||blocked())return;
        const practice=makeTutorialProject(),store=makeDefaultAssetStore();for(const asset of tutorialAssetRecords())store.addImmutable(asset);
        tutorialExpected=tutorialExpectedTrees(practice);
        replaceCurrentProject(practice,store,'sprite-1','start','「さかなキャッチ」を いっしょに 作ろう');
        tutorial={epoch:++tutorialEpoch,index:0,phase:'waiting',identity:workspaceIdentity,target:'sprite-1',steps:[...TUTORIAL_STEPS],courses:[],leaves:[],values:{}};
        pausedTutorial=null;tutorialSave=null;tutorialTrace=null;
        if(mainEditor.session?.mode!=='blocks')switchEditorMode(mainEditor,'blocks');
      }
      if(mainEditor.session?.mode!=='blocks')switchEditorMode(mainEditor,'blocks');
      tutorialInsertion=null;mainEditor.view.render({force:true});tutorialRefresh();focusTutorialTarget();clearInterval(tutorialTimer);tutorialTimer=setInterval(tutorialRefresh,80);
    }
    function finishTutorial(completed=false) {
      if (!tutorial) return;
      const saved=tutorial;
      tutorialCollectRuntime();tutorial=null;tutorialInsertion=null;tutorialNotice=null;++tutorialEpoch;
      clearInterval(tutorialTimer);tutorialTimer=null;
      if(runtime||scheduler||appState==='PREPARING')stopRun();
      activeDragCleanup?.();mainEditor.view.releaseInteraction();
      if(!completed){
        let index=saved.index;
        const step=tutorialSequence(saved)[index];
        if(step?.id.startsWith('try-')||step?.id.startsWith('stop-'))index=tutorialSequence(saved).findIndex(s=>s.id==='run-'+step.id.split('-').slice(1).join('-'));
        pausedTutorial={...saved,index,trace:tutorialTrace?cloneDesignProject(tutorialTrace):null,fingerprint:currentFingerprint(),editorFingerprint:openEditorFingerprint()};
      }else pausedTutorial=null;
      tutorialTrace=null;tutorialSave=null;clearTutorialPresentation();$('#tutorialGuide').hidden=true;
      if(mainEditor.session?.pendingEdit){const field=mainEditor.session.pendingEdit;const control=$$('[data-blockui-field]').find(n=>n.dataset.blockId===field.id&&n.dataset.blockuiField===field.field);control?.focus({preventScroll:true});}
      else $('#tutorialStart').focus({preventScroll:true});
    }
    async function verifyTutorialSave(file) {
      if (!tutorial||!tutorialAllows(tutorial,'verify-save')||!tutorialSave||!file) return;
      const epoch=tutorial.epoch,save=tutorialSave,identity=workspaceIdentity;
      try {
        if(file.size>LIMITS.fileBytes)throw Object.assign(new Error('ファイルが 大きすぎるよ'),{child:true});
        const loaded=await parseProjectFile(await file.text());
        if(!tutorial||tutorial.epoch!==epoch||workspaceIdentity!==identity||tutorialSave!==save)return;
        if(currentFingerprint()!==save.fingerprint){tutorialSave=null;tutorial.index=tutorialSequence(tutorial).findIndex(s=>s.id==='save-work');tutorialRefresh();return;}
        if(assetStateFingerprint(loaded.project,loaded.assetStore)!==save.fingerprint||loaded.editorState?.pendingEditors.length||loaded.editorState?.callableDraft)
          throw Object.assign(new Error('いま ほぞんした 作品と 中身が ちがうよ'),{child:true});
        save.verified=true;confirmTutorialOperation('verify-save');tutorialRefresh();
      } catch(error) { if(tutorial?.epoch===epoch) { tutorialNotice={step:tutorialStep(tutorial)?.id,text:'たしかめられなかったよ。いま ほぞんした ファイルを、もう一度 えらぼう。'};tutorialRefresh();log('ほぞんした ファイルを たしかめられませんでした: '+error.message,'error');setStatus('ほぞんを たしかめられなかったよ。'+(error.child?error.message:'あかりで ほぞんした ファイルでは ないよ')); } }
    }
    function tutorialCapture(event) {
      if(!tutorial)return;
      if(event.type==='keyup')return;
      const target=event.target,step=tutorialStep(tutorial);
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
          if(!tutorialAllows(tutorial,action)||event.shiftKey){event.preventDefault();event.stopImmediatePropagation();return;}
        }
        if(event.repeat&&target instanceof Element&&target.matches('button,summary')){event.preventDefault();event.stopImmediatePropagation();return;}
        if(!(event.ctrlKey||event.metaKey)&&target instanceof Element&&!target.matches('input,textarea,select')
          &&!['Enter',' ','Escape'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();return;}
      }
      if(event.type==='focusin') { if(!tutorialElementAllowed(target))focusTutorialTarget();return; }
      let allowed=tutorialElementAllowed(target);
      if(['dragstart','dragover','drop','contextmenu'].includes(event.type))allowed=false;
      if(['pointerdown','touchstart'].includes(event.type)&&target instanceof Element&&target.matches('.blockui-workspace,.blockui-palette-list'))allowed=true;
      if(allowed&&event.type==='click'&&step?.allowed[0]==='runtime:click'&&target.closest('.component')&&tutorialTrace?.busy)allowed=false;
      if(allowed&&event.type==='pointerdown'&&target.closest('#tutorialExit'))event.preventDefault();
      if(allowed&&step?.allowed[0].startsWith('field:')&&(
        event.type==='keydown'&&event.key==='Enter'&&!event.isComposing&&!composingAny()
        ||event.type==='change'&&target instanceof HTMLSelectElement
        ||event.type==='click'&&target.closest('[data-blockui-action="commit"]'))){
        // A confirmed unchanged value is still an explicit learning operation.
        // Observe after the normal field handler; invalid/pending input cannot count.
        const epoch=tutorial.epoch,id=step.id;
        setTimeout(()=>{if(tutorial?.epoch===epoch&&tutorialStep(tutorial)?.id===id
          &&(!mainEditor.session?.pendingEdit||mainEditor.session.pendingEdit.kind==='block-draft')&&!composingAny()){confirmTutorialOperation(step.allowed[0]);tutorialRefresh();}},0);
      }
      if(!allowed){
        event.preventDefault();event.stopImmediatePropagation();
        if(target===el.obj||target===el.event)renderSelectors();
        else if(target===$('#uiLevel'))target.value=document.body.dataset.uiLevel;
        else if(target===el.projectName)target.value=project.name;
      }
    }
    for(const event of ['pointerdown','touchstart','click','keydown','keyup','focusin','input','change','compositionstart','compositionend','dragstart','dragover','drop','contextmenu'])window.addEventListener(event,tutorialCapture,{capture:true,passive:false});
    let flushingEditor = false, intentInputFocus = null;
    let shellPointer = null;
    function draftOwner() {
      return callableDraftCore.editId
        ? `${callableDraftCore.type}:${callableDraftCore.editId}`
        : `${callableDraftCore.type}:draft-${editorDraftSerial}`;
    }
    function bindingOwner(binding) {
      return binding.kind === 'draft'
        ? draftOwner()
        : debugSourceKey || (selectedScriptId ? `script:${selectedScriptId}` : `script:${selectedId}:${currentEvent}`);
    }
    function readSource(binding, ownerKey = bindingOwner(binding)) {
      if (binding.kind === 'draft') return callableDraftCore.source;
      // Only a running work reads its compiled text; other locked states (opening a file,
      // preparing) still show the current work, never an earlier run.
      const runningItem = runtime || scheduler ? compiled?.items?.find((x) => x.key === ownerKey) : null;
      if (runningItem) return runningItem.ast.source || '';
      const [kind, id, event] = ownerKey.split(':');
      return kind === 'script'
        ? scriptBySourceKey(project, ownerKey)?.source || ''
        : (kind === 'action' ? project.actions : project.functions).find((x) => x.id === id)
            ?.source || '';
    }
    function bindingContext(binding) {
      const ownerKey = bindingOwner(binding),
        [kind, id, event] = ownerKey.split(':');
      if (binding.kind === 'draft') {
        const d = callableDraftCore,
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
        const d = (kind === 'action' ? project.actions : project.functions).find(
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
      const script = scriptBySourceKey(project, ownerKey);
      if (isMeijinScript(script) || (!script && selectedId === MEIJIN_OWNER))
        return { ownerKey, id: script?.id, scriptId: script?.id, filter: undefined, event: 'start', targetId: 'stage',
          targetType: 'stage', args: [], meijin: true, level: document.body.dataset.uiLevel };
      return {
        ownerKey,
        id: script?.id, scriptId: script?.id, filter: script?.filter,
        event: script?.event || event || currentEvent,
        targetId: script?.targetId || (event ? id : selectedId),
        targetType: targetType(script?.targetId || (event ? id : selectedId)),
        args: [],
        level: document.body.dataset.uiLevel,
      };
    }
    function getEditorSession(binding, { force = false } = {}) {
      const ownerKey = bindingOwner(binding),
        source = readSource(binding, ownerKey),
        cacheKey = `${binding.kind}:${ownerKey}`;
      let session = editorSessions.get(cacheKey);
      if (!session)
        session = createEditorSession(
          ownerKey,
          source,
          bindingContext(binding),
          project,
          editorContextRevision,
        );
      else if (
        force ||
        session.sourceText !== source ||
        session.contextRevision !== editorContextRevision
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
          project,
          editorContextRevision,
        );
        if (draft && source === draft.baseline.sourceText) {
          const baseline = { sourceText: session.sourceText, syntaxAst: session.syntaxAst,
            blockView: session.blockView, nodeMap: session.nodeMap, nodeIds: session.nodeIds,
            diagnostics: session.diagnostics, syntaxDiagnostics: session.syntaxDiagnostics,
            nextBlockId: session.nextBlockId, blockSelection: session.blockSelection,
            sourceRevision: session.sourceRevision, contextRevision: session.contextRevision };
          Object.assign(session, draftDisplay, {blockDraft: {...draft, baseline}});
          // The kept draft belongs to the refreshed baseline, so it carries both of its revisions.
          session.pendingEdit = {...pending, sourceRevision: session.sourceRevision, contextRevision: editorContextRevision};
        } else session.pendingEdit = draft ? null : pending;
      }
      // A work with a 名人 text is code only, for every body and the 自分で作ったブロック editor; the view it opens in is
      // decided by the content, whatever view a file or the autosave kept. The chosen view (editorModes) is not changed
      // by it, so the next work (新しく作る, お手本, 開く) opens as chosen. When the 名人 text goes away in the same work,
      // the view stays code (it is never switched by a level).
      if (workIsMeijin()) meijinShownIn = workspaceIdentity;
      else if (meijinShownIn === workspaceIdentity) {
        meijinShownIn = null;
        editorModes.set('script', 'code');
        editorModes.set('draft', 'code');
      }
      session.mode = workIsMeijin() ? 'code' : resolvedEditorMode(editorModes, binding.kind, session.syntaxAst);
      editorSessions.set(cacheKey, session);
      binding.session = session;
      return session;
    }
    function invalidateEditors() {
      editorContextRevision++;
    }
    function hasPendingEditor() {
      return !!(
        activeDragCleanup ||
        colorEdit ||
        headerPending ||
        mainEditor.session?.pendingEdit || mainEditor.session?.blockDraft ||
        draftEditor.session?.pendingEdit || draftEditor.session?.blockDraft ||
        composingEditors.has(el.editor) ||
        composingEditors.has(draftEditor.textarea) ||
        composingEditors.has($('#callableName')) ||
        (composingEditors.has($('#callableArgs')) || composingEditors.has($('#callablePhrase')))
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
        symbols: buildSymbols(project) });
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
      const next = cloneDesignProject(project),
        [kind, id, event] = ownerKey.split(':');
      if (binding.kind === 'draft') {
        const other = [...next.scripts, ...next.actions, ...next.functions].filter(
          (x) => x.id !== callableDraftCore.editId,
        );
        if (other.reduce((n, x) => n + cpLen(x.source), 0) + cpLen(source) > LIMITS.sourceTotal)
          throw new AkariError('F504', '作品全体の 本文の 文字が 多すぎます。文を へらして ください');
        validateCallableDraft({ ...callableDraftCore, source });
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
        const row = (event ? id : selectedId) === MEIJIN_OWNER ? { id: event ? ensureUniqueId('script') : id, mode: 'meijin', targetId: MEIJIN_OWNER, event: 'start', source: '' }
          : { id: event ? ensureUniqueId('script') : id, targetId: event ? id : selectedId, event: event || currentEvent, source: '', ...newBodyFilter(event || currentEvent) };
        updateScriptSource(row, source, next);
        next.scripts.push(row);
      }
      validateDesignProject(next);
      return next;
    }
    function commitSource(binding, source, { atomic = false } = {}) {
      if (modelLocked()) return false;
      const ownerKey = bindingOwner(binding),
        before = readSource(binding, ownerKey);
      if (source === before) return false;
      const next = sourceCandidate(binding, ownerKey, source);
      if (atomic) {
        clearTimeout(historyTimer);
        const session = binding.session, pending = session?.pendingEdit;
        const importing = binding === mainEditor && pending?.kind === 'source-import' &&
          session.ownerKey === ownerKey && pending.ownerKey === ownerKey &&
          pending.value === source && !session.blockDraft;
        if (importing) {
          // The confirmed input is not the valid body before this atomic change.
          session.pendingEdit = null;
          try { if (!hasPendingEditor()) pushHistoryNow(); }
          finally { session.pendingEdit = pending; }
        } else if (!hasPendingEditor()) pushHistoryNow();
      }
      if (binding.kind === 'draft') callableDraftCore = { ...callableDraftCore, source };
      else {
        const old = scriptBySourceKey(project, ownerKey),
          oldIndex = old ? project.scripts.indexOf(old) : -1,
          row = scriptBySourceKey(next, ownerKey) ||
            (oldIndex >= 0 ? next.scripts[oldIndex] : next.scripts.at(-1));
        project = next;
        if (row) {
          const changedOwner = selectedId !== row.targetId;
          selectedId = row.targetId; currentEvent = row.event; selectedScriptId = row.id || null;
          if (changedOwner) { renderTree(); renderProperties(); }
        }
        renderSelectors();
      }
      invalidateEditors();
      getEditorSession(binding, { force: true });
      binding.session.pendingEdit = null;
      clearEditorFailure(binding);
      markDirty();
      if (atomic) {
        clearTimeout(historyTimer);
        pushHistoryNow();
      }
      if (binding.kind === 'draft') paintCallable();
      return true;
    }
    // A touch body is named with what it touches (「星」に ふれたとき), from the compiled body of the run.
    function runtimeEventText(eventType, scriptKey = null) {
      if (eventType === 'continuous') return 'きまりに 合っている あいだ';
      const filter = scriptKey ? compiled?.items?.find(item => item.key === scriptKey)?.filter : null;
      return eventText(eventType, filter) || eventType;
    }
    function diagnosticOwner(diagnostic) {
      const key = diagnostic?.where || diagnostic?.key || '', item = compiled?.items?.find(x => x.key === key),
        sourceKey = item?.documentKey || key, script = scriptBySourceKey(project, sourceKey),
        definition = project.actions.find(x => key === 'action:' + x.id) || project.functions.find(x => key === 'function:' + x.id);
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
    // Where the child finds the first mistake when ▶ 動かす is refused (F-07, F-08): the block view marks it with ⚠ and an
    // orange frame, the code view marks its line number in red. A mistake in a body that is not shown names that body.
    function fixPointer(diagnostic) {
      const { script, definition } = diagnosticOwner(diagnostic);
      if (definition) return `「自分で作ったブロック」の「${definition.name}」を 見てね。`;
      const mark = shownEditorMode() === 'blocks' ? '⚠ が ついた ところを 見てね。'
        : diagnostic?.line ? `コードの ${diagnostic.line}行目を 見てね。` : 'コードの 赤い ところを 見てね。';
      if (!script || (!sourceOverviewOpen && scriptBySourceKey(project, bindingOwner(mainEditor)) === script)) return mark;
      const name = isMeijinScript(script) ? '名人の本文' : targetById(script.targetId)?.name || '画面',
        event = isMeijinScript(script) ? '' : eventText(script.event, script.filter);
      return `「${name}」の ${event ? event + 'の ' : ''}本文を えらんで、${mark}`;
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
    function showDiagnosticMessage(root, diagnostic, location = '', original = null, source = null, { listItem = false } = {}) {
      // A full-width colon after the place (F-26: no ASCII colon in child text).
      const reason = childDiagnosticText(diagnostic, source, project),
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
      const indicator = $(binding.kind === 'draft' ? '#callablePending' : '#editorPending');
      indicator.textContent = ''; indicator.hidden = true; delete indicator.dataset.notice;
    }
    function showEditorFailure(binding, error, { preservePending = false } = {}) {
      // A reading error that a 名人 text would read says S317 here too, once the code view has checked it (FM2-04).
      if (binding.textarea && genericReadingError(error?.diagnostics?.[0] || error)) {
        const shown = error?.diagnostics?.length ? error.diagnostics : [error], checked = checkedEditorErrors(binding, binding.textarea.value, shown);
        if (checked && checked !== shown && checked[0]?.code === 'S317')
          error = Object.assign(new AkariError(checked[0].code, checked[0].message, checked[0].line, checked[0].column), { diagnostics: checked });
      }
      const reason = error?.message || String(error),
        n = $(binding.kind === 'draft' ? '#callablePending' : '#editorPending');
      delete n.dataset.notice;
      const originalDetails = [error?.code, reason, error?.detail,
        ...(error?.diagnostics || []).map(d => [d.code, d.where,
          d.line ? d.line + '行目 / ' + (d.column || 1) + '文字目' : '', d.message, d.detail].filter(Boolean).join(' / '))].filter(Boolean).join('\n');
      showDiagnosticMessage(n, error?.diagnostics?.[0] || error, error?.line ? error.line + '行目' : '', originalDetails, binding.textarea?.value);
      n.querySelector('.intent-choices')?.remove();
      const proposals = error?.proposals || error?.diagnostics?.flatMap(d => d.proposals || d.choices || []) || [];
      if (proposals.length) {
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
          const ownerKey=bindingOwner(binding), contextRevision=editorContextRevision;
          button.onclick = () => {
            const current=()=>!modelLocked()&&bindingOwner(binding)===ownerKey&&editorContextRevision===contextRevision&&binding.textarea.value===original;
            if(!current())return;
            const apply=replacement=>{
              if(!current())return;
              const source=original.slice(0,range.start)+replacement+original.slice(range.end);
              try {commitSource(binding,source,{atomic:true});binding.textarea.value=source;n.hidden=true;renderEditorBinding(binding);refreshEditor();}
              catch(nextError){binding.textarea.value=source;if(binding.session)binding.session.pendingEdit={ownerKey:bindingOwner(binding),kind:'code',value:source,originalSource:original,reason:nextError.message};scheduleAutosave();showEditorFailure(binding,nextError);}
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
            const previousFocus=intentInputFocus;intentInputFocus={textarea:binding.textarea,current};
            try {field.focus();} finally {intentInputFocus=previousFocus;}
          };
          choices.append(button);
        }
        const cancel = document.createElement('button');
        cancel.type = 'button'; cancel.dataset.intentCancel = ''; cancel.textContent = 'この あんないを とじる';
        cancel.onclick = () => { choices.remove(); binding.textarea.focus(); };
        choices.append(cancel); n.append(choices);
      }
      n.hidden = false;
      // The status line speaks in Akari's voice (F-18): in code it points at the line and the explanation by the code,
      // which keeps the rule's own wording; a block view's message is said as it is.
      const firstDiagnostic = error?.diagnostics?.[0] || error, issueLine = firstDiagnostic?.line || error?.line;
      editorFailureStatus = binding.session?.mode === 'blocks' ? childDiagnosticText(firstDiagnostic, binding.textarea?.value, project)
        : issueLine ? `書き方に 直す ところが あるよ。コードの ${issueLine}行目を 見てね`
        : '書き方に 直す ところが あるよ。コードの 下の せつめいを 見てね';
      setStatus(editorFailureStatus);
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
      if (binding === mainEditor && binding.session?.pendingEdit) refreshEditor();
      return false;
    }
    function sourceImportPlan(binding, source) {
      const context = bindingContext(binding);
      // A 名人 script keeps its headings: they are its own events, never sent to the parts' bodies.
      if (context.meijin) return null;
      const symbols = buildSymbols(project),
        parsed = parseSyntax(source, { ...context, symbols });
      if (!parsed.ast?.units?.length) return null;
      sourceCandidate(binding, bindingOwner(binding), source);
      const sourceKey = bindingOwner(binding), original = scriptBySourceKey(project, sourceKey),
        units = [parsed.ast, ...parsed.ast.units], originalAst = original && parseSyntax(original.source, { targetId: original.targetId, event: original.event, symbols }).ast;
      const normalized = (body, targetId) => {
        const visit = value => {
          if (Array.isArray(value)) return value.map(visit);
          if (!value || typeof value !== 'object') return value;
          const out = {};
          for (const [key, child] of Object.entries(value)) {
            if (key === 'actorRef' && child?.kind === 'named') {
              const id = child.targetId || (namesStage(project, child.name)
                ? 'stage' : project.components.find(c => c.name === child.name)?.id);
              out[key] = id === targetId ? { kind: 'self' } : visit(child);
            } else out[key] = visit(child);
          }
          return out;
        };
        return { kind: 'Script', body: visit(body) };
      };
      const signature = metadata => stableJson([metadata.targetId, metadata.event, metadata.filter || null]);
      const existing = project.scripts.filter(row => row !== original || (row.source.trim() && !originalAst?.units?.length)).flatMap(row => {
        const ast = parseSyntax(row.source, { targetId: row.targetId, event: row.event, symbols }).ast;
        if (!row.source.trim()) return [];
        if (!ast) return [{ row, text: row.source, metadata: { targetId: row.targetId, event: row.event, filter: row.filter }, body: null }];
        return [ast, ...(ast.units || [])].map(unit => {
          const range = SOURCE_RANGES.get(unit)?.range,
            text = range ? row.source.slice(range.start, range.end) : row.source;
          // Inherited headings already carry their resolved event in the full document AST.
          const metadata = unit.heading ? scriptMetadataFromHeading(unit.heading, row, project)
            : { targetId: row.targetId, event: row.event, filter: row.filter };
          return { row, text, metadata, body: unit.body };
        });
      });
      const entries = units.map(unit => {
        const range = SOURCE_RANGES.get(unit).range, text = source.slice(range.start, range.end),
          metadata = unit.heading ? scriptMetadataFromHeading(unit.heading,
            { targetId: context.targetId, event: context.event }, project)
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
        canSplit: entries.every(x => x.independent), projectFingerprint: currentFingerprint() };
    }
    function hideSourceImport() { $('#sourceImport').hidden = true; $('#sourceImport').replaceChildren(); }
    // While the import review waits, ▶ 動かす and うごく作品を ファイルにする say how to finish it, in the words of the
    // review's own buttons.
    function sourceImportChoice() {
      if ($('#sourceImport').hidden) return '';
      const take = ['#sourceImportConfirm', '#sourceImportSeparate', '#sourceImportEditCurrent'].map((id) => $(id)).find((b) => b && !b.disabled);
      return '本文を 入れる ところを たしかめてね。' + (take ? `「${take.textContent}」か「取りこみを やめる」を おしてね` : '「取りこみを やめる」を おしてね');
    }
    function confirmSourceImport(binding, source, separate = false, editCurrent = false) {
      if (modelLocked() || composingEditors.has(binding.textarea) || binding.textarea.value !== source) return false;
      try {
        const plan = sourceImportPlan(binding, source);
        if (!plan || (editCurrent ? !plan.canEditCurrent : (!separate && !plan.safe) || (plan.hasExisting && !plan.canSplit))) return false;
        if (editCurrent || !plan.hasExisting) {
          commitSource(binding, source, { atomic: true });
          hideSourceImport(); renderEditorBinding(binding); refreshEditor();
          setStatus('書いた 文を 本文に 入れたよ'); return true;
        }
        const next = cloneDesignProject(project), old = scriptBySourceKey(next, plan.ownerKey),
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
        if (plan.projectFingerprint !== currentFingerprint() || plan.ownerKey !== bindingOwner(binding))
          throw new AkariError('F503', '取りこむ ところが かわりました。もう一度 中身を たしかめて ください');
        clearTimeout(historyTimer);
        binding.session.pendingEdit = null; binding.textarea.value = readSource(binding);
        hideSourceImport(); pushHistoryNow();
        project = next;
        if (destination) { selectedId = destination.targetId; currentEvent = destination.event; selectedScriptId = destination.id || null; }
        invalidateEditors(); clearEditorFailure(binding); markDirty(); renderTree(); renderProperties(); loadEditor();
        clearTimeout(historyTimer); pushHistoryNow();
        setStatus('いまの 本文は のこして、えらんだ ところに 本文を 入れたよ'); return true;
      } catch (error) { return showEditorFailure(binding, error, { preservePending: true }); }
    }
    function showSourceImport(binding, source, plan) {
      const root = $('#sourceImport'); root.replaceChildren(); root.hidden = false;
      // The panel speaks of 本文 (F-23), in the plain voice of a confirmation (F-18), spaced by phrase (F-19).
      const heading = document.createElement('strong'); heading.textContent = '本文を 入れる ところを たしかめる'; root.append(heading);
      for (const entry of plan.entries) {
        const actor = targetById(entry.metadata.targetId)?.name || 'この 本文', event = entry.metadata.event,
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
    function saveCodeBinding(binding, { fromInput = false } = {}) {
      if (binding.session?.blockDraft) return flushEditor(binding);
      if (modelLocked() || binding.session?.mode === 'blocks') return true;
      const t = binding.textarea;
      if (composingEditors.has(t))
        return showEditorFailure(binding, '日本語の 入力を Enterキーで 決めてから つづけて ください');
      const source = t.value.replace(/\r\n?/g, '\n');
      // A textarea normalizes CRLF on display; that alone is not an edit of source.
      if (source === readSource(binding).replace(/\r\n?/g, '\n')) {
        if (binding === mainEditor) hideSourceImport();
        if (binding.session) binding.session.pendingEdit = null;
        clearEditorFailure(binding);
        return true;
      }
      try {
        if (binding === mainEditor) {
          const parsed = parseSyntax(source, { ...bindingContext(binding), symbols: buildSymbols(project) }),
            plan = sourceImportPlan(binding, source);
          if (plan || (fromInput && parsed.ast?.heading && !bindingContext(binding).meijin)) {
            binding.session.pendingEdit = { ownerKey: bindingOwner(binding), kind: plan ? 'source-import' : 'heading-source',
              value: source, reason: plan ? '取りこむ ところを たしかめて 決めて ください' : '書き方は だいじょうぶです。きっかけは、「▶ 動かす」を おすか、ブロックモードに すると 決まります' };
            if (plan) showSourceImport(binding, source, plan); else hideSourceImport();
            // The text reads now: a mistake shown for an earlier keystroke goes away above the code. With the review, the
            // status line says what waits instead; a body with its own heading keeps the line until its check is done
            // (refreshEditor says 「✓ 書き方を 直せたよ」 or points to the new mistake, E2E-R2-11).
            clearEditorFailure(binding);
            if (plan) { editorFailureStatus = null; setStatus(sourceImportChoice()); }
            scheduleAutosave(); updateDirty(); return false;
          }
        }
        hideSourceImport();
        commitSource(binding, source);
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
        scheduleAutosave();
        return showEditorFailure(binding, error);
      }
    }
    function flushEditor(binding, { preserveView = false } = {}) {
      if (modelLocked()) return true;
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
        if (composingEditors.has(binding.textarea))
          return showEditorFailure(binding, '日本語の 入力を Enterキーで きめてから つづけて ください');
        const source = binding.textarea.value.replace(/\r\n?/g, '\n');
        try {
          const parsed = parseSyntax(source, bindingContext(binding));
          if (!parsed.ast) editorError(parsed.syntaxDiagnostics.map(x => x.message).join('\n'));
          validateSyntaxAst(parsed.ast);
          sourceCandidate(binding, bindingOwner(binding), source);
          commitSource(binding, source, { atomic: true });
          const session = getEditorSession(binding);
          session.blockDraft = null; session.pendingEdit = null;
          renderEditorBinding(binding); refreshEditor();
          return true;
        } catch (error) {
          const session = binding.session;
          session.blockDraft.codeSource = source;
          session.pendingEdit = { kind: 'block-draft-code', ownerKey: session.ownerKey,
            sourceRevision: session.sourceRevision, contextRevision: session.contextRevision,
            value: source, reason: error.message };
          scheduleAutosave();
          return showEditorFailure(binding, error);
        }
      }
      return saveCodeBinding(binding);
    }
    function flushActiveEditor({ preserveView = false } = {}) {
      if (colorEdit) return false;
      if (flushingEditor) return true;
      flushingEditor = true;
      try {
        activeDragCleanup?.();
        if ($('#procModal').classList.contains('show')) {
          if (!flushEditor(draftEditor, { preserveView })) return false;
          return syncCallableDraft();
        }
        return flushEditor(mainEditor, { preserveView });
      } finally {
        flushingEditor = false;
      }
    }
    function operateBlock(binding, operation) {
      try {
        if (!tutorialOperationAllowed(binding, operation)) {
          const step=tutorialStep(tutorial),role=step?.ref?tutorialField(mainEditor.session?.blockView,step):null;
          if(binding===mainEditor&&step?.free&&operation.type==='field'&&operation.id===role?.node?.id&&operation.key===role.key)
            throw new Error('光る 数は '+step.min+'から'+step.max+'の 中で えらぼう。'+(step.integer?step.min+'、'+(step.min+1)+'のように、1ずつ ふえる 数に しよう。':''));
          throw new Error('今は、あんないの ブロックだけを 使おう。');
        }
        if (modelLocked()) throw new Error('動いている あいだと 取りこみ中は なおせません');
        if (
          binding.kind === 'draft' &&
          (headerPending ||
            composingEditors.has($('#callableName')) ||
            (composingEditors.has($('#callableArgs')) || composingEditors.has($('#callablePhrase'))))
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
        if(binding===mainEditor&&operation.preserveBody&&operation.type==='field'&&operation.key==='heading'&&
          operation.id===session.blockView?.id&&!session.syntaxAst.heading&&!session.syntaxAst.units?.length&&
          operation.value?.actorRef?.kind==='self'&&!session.blockDraft){
          const next=cloneDesignProject(project),row=scriptBySourceKey(next,ownerKey),heading=operation.value;
          if(row){
            const metadata=scriptMetadataFromHeading(heading,row,next);
            if(JSON.stringify([row.event,row.filter||null])===JSON.stringify([metadata.event,metadata.filter||null]))return {ok:true,changed:false};
            if(!row.id)row.id=ensureUniqueId('script');
            Object.assign(row,metadata);if(metadata.filter===undefined)delete row.filter;
            validateDesignProject(next);clearTimeout(historyTimer);
            if(!hasPendingEditor())pushHistoryNow();
            project=next;currentEvent=row.event;selectedScriptId=row.id;
            invalidateEditors();getEditorSession(binding,{force:true});binding.session.pendingEdit=null;
            clearEditorFailure(binding);markDirty();clearTimeout(historyTimer);pushHistoryNow();
            renderSelectors();renderEditorBinding(binding);refreshEditor();
            return {ok:true,changed:true};
          }
        }
        const candidate = prepareBlockEdit(session, operation, {
          project,
          context,
          ownerKey,
          locked: modelLocked(),
          sourceRevision: session.pendingEdit?.sourceRevision ?? session.sourceRevision,
          contextRevision: session.pendingEdit?.contextRevision ?? editorContextRevision,
          pendingEditId,
          draft: true,
          validateCandidate: (source) =>
            sourceCandidate(
              binding,
              ownerKey,
              typeof source === 'string' ? source : source.source,
            ),
        });
        if (!candidate.changed) {confirmTutorialOperation();return { ok: true, changed: false };}
        if (candidate.draftOnly) {
          binding.session = { ...session, ...candidate, mode: session.mode };
          editorSessions.set(`${binding.kind}:${ownerKey}`, binding.session);
          binding.textarea.value = candidate.draftSource;
          const pending = $(binding.kind === 'draft' ? '#callablePending' : '#editorPending');
          pending.textContent = 'あいている ところに ブロックや 数・文字を 入れて ください';
          // In blocks the floating controls say this by the block (E-12); the code view shows it here.
          pending.dataset.notice = 'block-draft';
          pending.hidden = false;
          renderEditorBinding(binding);
          // The status line says what the floating prompt says, not what was true before the block went in (F2-18).
          setStatus(binding.session.pendingEdit?.reason || 'あいている ところを えらんで、ブロックを 入れてね');
          scheduleAutosave();
          confirmTutorialOperation();
          return { ok: true, changed: true, draftOnly: true };
        }
        const source = candidate.source ?? candidate.sourceText;
        commitSource(binding, source, { atomic: true });
        binding.textarea.value = source;
        const committedOwner=bindingOwner(binding);
        binding.session = refreshEditorSession({
          ...session,
          ...candidate,
          ownerKey:committedOwner,
          mode: session.mode,
          pendingEdit: null,
        },source,bindingContext(binding),project,editorContextRevision);
        if(committedOwner!==ownerKey)editorSessions.delete(`${binding.kind}:${ownerKey}`);
        editorSessions.set(`${binding.kind}:${committedOwner}`, binding.session);
        renderEditorBinding(binding);
        refreshEditor();
        confirmTutorialOperation();
        return { ok: true, changed: true,
          ...(committedOwner!==ownerKey?{ownerTransition:{from:ownerKey,to:committedOwner}}:{}) };
      } catch (error) {
        showEditorFailure(binding, error);
        keepTutorialTargetInView();
        return { ok: false, error, reason: error.message };
      }
    }
    function renderEditorBinding(binding) {
      const session = getEditorSession(binding),
        draft = binding.kind === 'draft',
        blocks = session.mode === 'blocks';
      session.notices = bodyNotices(session);
      if (!draft) syncEditorShell(sourceOverviewOpen ? chosenEditorMode() : session.mode);
      const textRoot = draft ? binding.textarea : el.editor.closest('.editor-shell');
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
      if (blocks && (draft || !sourceOverviewOpen)) {
        binding.view.render();
        const mark = activeLoc || keptFail;
        binding.view.highlight(!draft && mark?.key === session.ownerKey ? mark : null);
      } else if (!session.pendingEdit && !composingEditors.has(binding.textarea)) {
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
      if (!draft && sourceOverviewOpen) renderSourceOverview();
      // The 自分で作ったブロック editor's code view says its first notice under the code too (its block view marks the block).
      if (draft) {
        const line = $('#callableIssue'), first = !blocks && $('#callablePending').hidden ? session.notices[0] : null;
        line.hidden = !first;
        line.textContent = first ? 'ⓘ ' + (first.line || 1) + '行目：' + sentence(first.message) + (session.notices.length > 1 ? `ほかにも 知らせが ${session.notices.length - 1}つ あります。` : '') : '';
      }
    }
    function rememberEditorMode(kind, mode) {
      editorModes.set(kind, mode);
      if (kind === 'script') {
        try { localStorage.setItem(STORAGE_KEYS.editorMode, mode); } catch (_) {}
      }
    }
    // The コード／ブロック toggle (final call 22) is one button that shows the view on the screen with ⇄: 「ブロックモード ⇄」
    // or 「コードモード ⇄」. A press switches to the other view, and the label follows. Of the group's two buttons only the
    // one that switches away from the view shown is there (…Modecode in blocks, …Modeblocks in code); its name says the
    // view. The toggle is never pale or hidden on the edit screen: where a press cannot switch (はじめて, a work with a 名人
    // text, a mistake in the code, a picture, sound or work still being read in) it keeps the view and says why under it
    // (modeBlockedNote). Only while getting a run ready (the run screen, where the toolbar's toggle is not shown) can it
    // not be pressed.
    const VIEW_NAMES = { blocks: 'ブロックモード', code: 'コードモード' };
    const MODE_REFUSALS = {
      entry: 'コードで 書くときは、上の「かんたん」か「くわしく」を えらんでね',
      meijin: '名人は、コードモードで だけ 使えるよ',
      error: 'コードの 赤い ところを 直すと、ブロックに もどれるよ',
      busy: '読みこみが おわるまで、まってね',
    };
    function modeRefusal(binding, shown, codeError = false) {
      if (appState === 'IMPORTING') return 'busy';
      if (binding === mainEditor && shown === 'blocks' && document.body.dataset.uiLevel === 'entry') return 'entry';
      if (workIsMeijin()) return 'meijin';
      return shown === 'code' && codeError ? 'error' : null;
    }
    // The toggle of an editor as it is now: the list of all bodies shows the chosen view. A code error does not change the
    // toggle's look (so it does not flicker while the child types): a press only shows the note.
    function paintBindingModeToggle(binding) {
      const session = binding.session;
      if (!session) return;
      if (binding === mainEditor && sourceOverviewOpen) { const shown = chosenEditorMode(); paintModeToggle(binding, shown, modeRefusal(binding, shown)); return; }
      const codeError = !session.syntaxAst || (session.pendingEdit?.kind === 'code' && !session.blockDraft);
      paintModeToggle(binding, session.mode, modeRefusal(binding, session.mode, codeError));
    }
    function paintModeToggle(binding, shown, refusal) {
      const prefix = binding.kind === 'draft' ? 'callable' : 'editor', note = modeBlockedNote(binding);
      for (const mode of ['code', 'blocks']) {
        const b = $(`#${prefix}Mode${mode}`), here = mode !== shown, label = VIEW_NAMES[shown] + ' ⇄';
        b.hidden = !here;
        if (!here) continue;
        if (b.textContent !== label) b.textContent = label;
        b.setAttribute('aria-label', VIEW_NAMES[shown]);
        b.disabled = appState === 'PREPARING';
        if (refusal) {
          if (note.textContent !== MODE_REFUSALS[refusal]) note.textContent = MODE_REFUSALS[refusal];
          b.dataset.refused = refusal;
          b.setAttribute('aria-describedby', note.id);
          b.removeAttribute('title');
        } else {
          delete b.dataset.refused;
          b.removeAttribute('aria-describedby');
          b.title = `おすと、${VIEW_NAMES[mode]}に かわるよ`;
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
    function switchEditorMode(binding, mode) {
      // A work with a 名人 text is code only, for every body; はじめて is blocks only (the toggle says so, paintModeToggle).
      if (mode === 'blocks' && workIsMeijin()) {
        setStatus(MODE_REFUSALS.meijin);
        return false;
      }
      if(binding===mainEditor&&mode==='code'&&document.body.dataset.uiLevel==='entry'){
        setStatus(MODE_REFUSALS.entry);
        return false;
      }
      const draftSession = binding.session;
      if (draftSession?.blockDraft) {
        if (['PREPARING', 'IMPORTING'].includes(appState)) return false;
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
        renderEditorBinding(binding);
        if (mode === 'code') binding.textarea.focus({ preventScroll: true });
        else binding.view.focus?.({ id: session.blockSelection });
        return true;
      }
      if (binding === mainEditor && sourceOverviewOpen) {
        if (!flushActiveEditor()) return false;
        rememberEditorMode('script', mode);
        syncEditorShell(mode);
        renderSourceOverview();
        return true;
      }
      if (binding.kind === 'draft' && !syncCallableDraft()) return false;
      if (['PREPARING', 'IMPORTING'].includes(appState) || !flushEditor(binding)) return false;
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
        if (activeLoc?.key === session.ownerKey) {
          const lines = session.sourceText.match(/[^\r\n]*(?:\r\n?|\n|$)/g);
          offset = lines.slice(0, activeLoc.line - 1).join('').length +
            [...(lines[activeLoc.line - 1] || '')].slice(0, (activeLoc.column || 1) - 1).join('').length;
        }
        const line =
          activeLoc?.key === session.ownerKey
            ? activeLoc.line
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
      renderEditorBinding(binding);
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
      const importing = binding === mainEditor && !$('#sourceImport').hidden;
      if (binding === mainEditor) hideSourceImport();
      const draft = binding.session?.blockDraft;
      if (draft) {
        Object.assign(binding.session, draft.baseline, { blockDraft: null, pendingEdit: null });
        editorSessions.set(`${binding.kind}:${binding.session.ownerKey}`, binding.session);
      }
      binding.view?.cancel();
      composingEditors.delete(binding.textarea);
      if (binding.session) binding.session.pendingEdit = null;
      if (binding.kind === 'draft') {
        headerPending = null;
        for (const id of ['#callableName', '#callableArgs', '#callablePhrase']) composingEditors.delete($(id));
        paintCallable();
      }
      binding.textarea.value = readSource(binding);
      clearEditorFailure(binding);
      renderEditorBinding(binding);
      if (binding === mainEditor) { refreshEditor(); renderEntrySurface(); }
      setStatus(importing ? '取りこみを やめたよ' : '入力を やめたよ');
    }
    function editorContentFingerprint(state) {
      return stableJson([state.callableDraft,state.pendingEditors.map(d=>({kind:d.kind,ownerKey:d.kind==='draft'?'draft':d.ownerKey,source:d.source,
        value:d.pending.value??null,field:d.pending.field??null,nodePath:d.pending.nodePath??null,
        draftSource:d.draftTree?formatScript(blockDecode(d.draftTree,{allowHoles:true}),{allowHoles:true}):null}))]);
    }
    function stateFingerprintCore(fingerprint = currentFingerprint()) {
      const pending=[mainEditor,draftEditor].filter(b=>b.session?.blockDraft||b.session?.pendingEdit&&!b.session.pendingEdit.rejected&&(!b.session.pendingEdit.field||b.session.pendingEdit.invalid)).map(b=>({kind:b.kind,ownerKey:bindingOwner(b),source:b.textarea.value,
        pending:b.session.pendingEdit||{},draftTree:b.session.blockDraft?b.session.blockView:null}));
      const draft=headerPending?{...callableDraftCore,name:$('#callableName').value,argsText:$('#callableArgs').value,
        ...(callableDraftCore.type==='action'?{callPhrase:$('#callablePhrase').value}:{})}:hasCallableDraft()?callableDraftCore:null;
      return JSON.stringify([fingerprint,editorContentFingerprint({callableDraft:draft,pendingEditors:pending})]);
    }
    function renderCallableOptions(prefer = '') {
      const sel = $('#callableSelect');
      sel.textContent = '';
      for (const type of ['action', 'function'])
        for (const d of type === 'action' ? project.actions : project.functions) {
          const o = document.createElement('option');
          o.value = `${type}:${d.id}`;
          o.textContent = `${type === 'action' ? 'てじゅん' : '答えを もとめる'}：${d.name}`;
          sel.appendChild(o);
        }
      // Procedures made in a 名人 text are listed too: shown, opened and renamed here, written in that text.
      const made = meijinProjectDefinitions(project);
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
    let meijinProcedureId = '';
    function showMeijinProcedure(id) {
      const d = meijinProjectDefinitions(project).find(x => x.id === id);
      if (!d) { hideMeijinProcedure(); return false; }
      meijinProcedureId = id;
      $('#procModal .proc-edit').classList.add('meijin-proc');
      $('#meijinProcPanel').hidden = false;
      $('#meijinProcTitle').textContent = `てじゅん「${d.name}」／` + (d.args.length ? `入れるもの（${d.args.join('、')}）／` : '') + `名人の本文の ${d.headLine}行目`;
      $('#meijinProcBody').textContent = d.source;
      $('#meijinProcName').value = d.name;
      $('#meijinProcError').hidden = true;
      $('#callableSelect').value = 'meijin:' + id;
      for (const button of ['#callableDelete', '#callableSave', '#callableFormat']) $(button).disabled = true;
      $('#meijinProcRename').disabled = modelLocked();
      return true;
    }
    function hideMeijinProcedure() {
      if (!meijinProcedureId) return;
      meijinProcedureId = '';
      $('#procModal .proc-edit').classList.remove('meijin-proc');
      $('#meijinProcPanel').hidden = true;
      $('#callableSave').disabled = $('#callableFormat').disabled = false;
    }
    function renameMeijinProcedure() {
      if (modelLocked() || !meijinProcedureId) return;
      try {
        const next = prepareMeijinProcedureRename(project, meijinProcedureId, $('#meijinProcName').value);
        clearTimeout(historyTimer); pushHistoryNow();
        project = next;
        invalidateEditors(); markDirty(); pushHistoryNow();
        renderCallableOptions('meijin:' + meijinProcedureId); showMeijinProcedure(meijinProcedureId);
        loadEditor(); refreshEditor();
        log('名人の本文で 作った てじゅんの 名前を かえました', 'ok');
      } catch (error) {
        $('#meijinProcError').hidden = false;
        $('#meijinProcError').textContent = error.message;
      }
    }
    function openMeijinProcedure() {
      const d = meijinProjectDefinitions(project).find(x => x.id === meijinProcedureId);
      if (!d || !flushActiveEditor()) return;
      $('#procModal').classList.remove('show');
      selectedId = MEIJIN_OWNER; currentEvent = 'start'; selectedScriptId = d.scriptId;
      hideSourceOverview(); renderTree(); renderProperties(); loadEditor(); renderComponents();
      const lines = el.editor.value.split('\n'), start = lines.slice(0, d.headLine - 1).reduce((sum, line) => sum + line.length + 1, 0);
      // The closed dialog gives focus back (and lets the page take focus) in its observer, which runs first.
      queueMicrotask(() => {
        el.editor.focus();
        el.editor.setSelectionRange(start, start + (lines[d.headLine - 1] || '').length);
      });
    }
    function paintCallable() {
      syncingDraft = true;
      try {
        const d = callableDraftCore;
        $('#callableSelect').value = d.loadedKey;
        $('#callableType').value = d.type;
        $('#callableName').value = d.name;
        $('#callableArgs').value = d.argsText;
        $('#callablePhrase').value = d.callPhrase || '';
        $('#callablePhraseRow').hidden = $('#callablePhraseHelp').hidden = d.type !== 'action';
        $('#callableEditingId').value = d.editId;
        if (
          !draftEditor.session?.pendingEdit &&
          !composingEditors.has(draftEditor.textarea) &&
          draftEditor.textarea.value !== d.source.replace(/\r\n?/g, '\n')
        )
          draftEditor.textarea.value = d.source;
        $('#callableHeader').textContent =
          `${d.type === 'action' ? 'てじゅん' : '答えを もとめる'}「${d.name || '名前'}」／入れるもの（${d.argsText}）／本文${hasCallableDraft() ? ' （まだ ほぞんして いない）' : ''}`;
        $('#callableDelete').disabled = modelLocked() || !d.editId;
      } finally {
        syncingDraft = false;
      }
    }
    function syncCallableDraft() {
      if (syncingDraft || modelLocked()) return true;
      if (
        [$('#callableName'), $('#callableArgs'), $('#callablePhrase'), $('#callableType')].some((t) =>
          composingEditors.has(t),
        )
      ) {
        headerPending = { ownerKey: draftOwner(), composing: true };
        return showEditorFailure(draftEditor, '日本語の 入力を Enterキーで きめてから つづけて ください');
      }
      const next = {
        ...callableDraftCore,
        type: $('#callableType').value,
        name: $('#callableName').value,
        argsText: $('#callableArgs').value,
      };
      const phrase = $('#callablePhrase').value;
      if (next.type === 'action' && phrase) next.callPhrase = phrase;
      else delete next.callPhrase;
      if (
        JSON.stringify(next) !== JSON.stringify(callableDraftCore) &&
        draftEditor.session?.mode === 'blocks' &&
        draftEditor.session.pendingEdit
      ) {
        const ready = draftEditor.view.flush();
        if (!ready.ok) {
          for (const [id, key] of [
            ['#callableType', 'type'],
            ['#callableName', 'name'],
            ['#callableArgs', 'argsText'],
            ['#callablePhrase', 'callPhrase'],
          ])
            $(id).value = callableDraftCore[key] || '';
          return showEditorFailure(
            draftEditor,
            ready.reason || '本文の 入力を 決めるか、やめて ください',
          );
        }
        next.source = callableDraftCore.source;
      }
      try {
        validateCallableDraft(next);
        if (JSON.stringify(next) !== JSON.stringify(callableDraftCore)) {
          callableDraftCore = next;
          invalidateEditors();
          markDirty();
        }
        headerPending = null;
        return true;
      } catch (error) {
        headerPending = { ownerKey: draftOwner(), reason: error.message };
        return showEditorFailure(draftEditor, error);
      }
    }
    function releaseShellPointer() {
      const token = shellPointer;
      if (!token) return;
      shellPointer = null;
      token.cleanup();
      renderEditorBinding(mainEditor);
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
      placeHistoryButtons=()=>{
        for(const {button,marker}of historyHomes){
          if($('#procModal').classList.contains('show')){if(button.parentElement!==callableTitle)callableTitle.append(button);}
          else if(document.body.dataset.editorMode==='blocks'){
            const anchor=button.id==='undoBtn'&&$('#redoBtn').parentElement===toolbar?$('#redoBtn'):historyToolbarAnchor;
            if(button.parentElement!==toolbar||button.nextSibling!==anchor)toolbar.insertBefore(button,anchor);
          }else if(marker.nextSibling!==button)marker.after(button);
        }
      };
      new MutationObserver(placeHistoryButtons).observe($('#procModal'), { attributes: true, attributeFilter: ['class'] });
      placeHistoryButtons();
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
        add.addEventListener('click', () => addComponent('sprite', null, null, preset));
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
          if (modelLocked() || event.button !== 0 || event.isPrimary === false || shellPointer)
            return;
          const token = { pointerId: event.pointerId };
          shellPointer = token;
          const finish = (e) => {
            if (e.type !== 'blur' && e.pointerId !== token.pointerId) return;
            activeDragCleanup?.(e);
            releaseShellPointer();
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
      if (!document.body.dataset.editorMode || shellPointer) return;
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
      const actions = $('.prop-actions'), actionsHome = block ? $('#componentActions') : el.props;
      if (actions && actionsHome.firstElementChild !== actions) { actionsHome.prepend(actions); syncPropertyScrollPadding(); }
      $('#formatBtn').hidden = block || currentIsMeijin();
      syncWideInert();
      // The level list follows the view (blocks or code); a view in code at はじめて goes on at かんたん.
      if (applyUiLevel(mode)) renderHints();
      renderEntrySurface();
    }

    const pen = el.canvas.getContext('2d');
    const stageStyle = document.createElement('style');
    stageStyle.textContent = AKARI_STAGE_CSS;
    document.head.appendChild(stageStyle);
    let stageZoom = null, visibleStageScale = 1, runStageMinimum = null;
    // The edit screen supplies the minimum once per run. Include the scrollbar gutter: a minimum on the scaled child
    // alone would spill out of the designer and be clipped. Overflow belongs to the finite workspace, not the page.
    function fitRunStageMinimum() {
      if (!runStageMinimum || document.body.classList.contains('stage-enlarged')) return;
      const designer = $('#designerWindow'), wrap = $('.designer-wrap'), style = getComputedStyle(wrap),
        width = Math.ceil(designer.offsetWidth - wrap.clientWidth + runStageMinimum.width +
          parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 1),
        height = Math.ceil(designer.offsetHeight - wrap.clientHeight + runStageMinimum.height +
          parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 1);
      for (const [name, value] of [['--run-stage-min-width', width], ['--run-stage-min-height', height]])
        if (designer.style.getPropertyValue(name) !== value + 'px') designer.style.setProperty(name, value + 'px');
      stageView.fitStage();
    }
    const stageView = createAkariStageView(AKARI_RUNTIME, {
      form: el.form,
      canvas: el.canvas,
      getProject: () => project,
      getRuntime: () => runtime,
      getScheduler: () => scheduler,
      imageUrl: designImageUrl,
      getImage: (id) => runtimeCache?.getImage(id),
      selectedId: () => selectedId,
      getScale: ({ width, height, availableWidth, availableHeight }) => {
        if (stageZoom !== null) return stageZoom;
        if (runStageMinimum && !document.body.classList.contains('stage-enlarged')) {
          const main = $('.main');
          availableWidth = Math.min(availableWidth, Math.max(runStageMinimum.width + 1, main.clientWidth - 1));
          availableHeight = Math.min(availableHeight, Math.max(runStageMinimum.height + 1, main.clientHeight - 1));
        }
        return Math.max(0.01, Math.min(1, (availableWidth - 1) / width, (availableHeight - 1) / height));
      },
      onFit: (scale) => {
        visibleStageScale = scale;
        $('.designer-wrap').style.setProperty('--stage-scale', scale);
        $('#stageZoomReset').textContent = Math.round(scale * 100) + '%';
        $('#stageZoomOut').disabled = scale <= 0.1;
        $('#stageZoomIn').disabled = scale >= 2;
        $('#stageZoomFit').setAttribute('aria-pressed', String(stageZoom === null));
        positionResizeHandles();
        updateDesignHelp();
      },
      canInteract: () => !document.querySelector('.modal.show,.modal.open')&&(!tutorial
        ||(tutorialAllows(tutorial,'runtime:click')&&!tutorialTrace?.busy&&tutorialTrace?.clicks<tutorialStep(tutorial).clicks)),
      onRuntimeClick: id => {
        if(!tutorial)return true;
        if(!tutorialAllows(tutorial,'runtime:click')||id!==tutorial.target||!tutorialTrace||tutorialTrace.busy||tutorialTrace.clicks>=tutorialStep(tutorial).clicks)return false;
        tutorialTrace.clicks++;tutorialTrace.busy=true;tutorialTrace.sawTask=false;return true;
      },
      onDesignPointer: (e, id) => {
        if (!modelLocked() && selectObject(id)) {
          startDrag(e, id);
          if (!activeDragCleanup) releaseShellPointer();
        } else releaseShellPointer();
      },
      onDesignStage: () => {
        if (!modelLocked()) selectObject('stage');
      },
      onError: (e) =>
        dispatchRuntime(() => {
          throw e;
        }),
      onInputChanged: renderMonitor,
      onStageMessage: (text, details) => {
        log(text);
        if (details?.rounded) {
          const full = document.createElement('button');
          full.type = 'button'; full.textContent = 'もとの数';
          full.setAttribute('aria-label', '数を 短くして 見せているよ。もとの 数を 見る');
          full.onclick = () => showFullValue('出てきた もとの 数', details.value);
          el.console.appendChild(full);
        }
      },
      onValueDetails: (value, speaker) => showFullValue(`${speaker}の 言うこと（${typeof value === 'string' ? '全部' : 'もとの 数'}）`, value),
    });
    window.addEventListener('resize', fitRunStageMinimum);
    new ResizeObserver(fitRunStageMinimum).observe($('#designerWindow > .win-title'));
    new ResizeObserver(fitRunStageMinimum).observe($('#runStrip'));
    // A deliberately focused scroll region owns its navigation keys; keys on the stage still belong to the work.
    $('.main').addEventListener('keydown', event => {
      if (runStageMinimum && event.target === event.currentTarget &&
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key))
        event.stopPropagation();
    });
    function setStageZoom(scale) {
      stageZoom = scale === null ? null : Math.max(0.1, Math.min(2, Math.round(scale * 100) / 100));
      stageView.fitStage();
      stageView.positionBubbles();
      if (stageZoom === null) $('.designer-wrap').scrollTo({ left: 0, top: 0 });
    }
    // 大きく見る (E-21): the stage at 100% laid over the page; 「もどる」 or Escape gives back the layout, the zoom it had
    // and the focus.
    let enlargedFrom;
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
      if (on) { enlargedFrom = stageZoom; setStageZoom(1); }
      else { setStageZoom(enlargedFrom ?? null); enlargedFrom = undefined; }
      button.focus({ preventScroll: true });
    }
    $('#stageEnlarge').onclick = () => setStageEnlarged(!document.body.classList.contains('stage-enlarged'));
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.isComposing || !document.body.classList.contains('stage-enlarged') || document.querySelector('dialog[open],.modal.show')) return;
      e.preventDefault();
      e.stopPropagation();
      setStageEnlarged(false);
    }, true);
    // With the workspace made wide, the stage stays small at the bottom right; pressing it brings the columns back.
    // 画面も見る brings the columns back and gives the focus to 作業台を広く, which made them go (AX-05).
    $('#stageThumbnail').onclick = () => {
      const toggle = $('#blockEditor [data-blockui-action="workspace-expand"]');
      toggle?.click();
      if (toggle?.getClientRects().length) toggle.focus({ preventScroll: true }); else el.form.focus({ preventScroll: true });
    };
    // In wide mode the thumbnail stands for the small stage behind it: the stage and its handles are no Tab stops then.
    // The run screen and the code view do not use wide mode.
    function syncWideInert() {
      const wrap = $('#designerWindow > .designer-wrap');
      if (wrap) wrap.inert = document.body.dataset.workbenchWide === 'true' && document.body.dataset.editorMode === 'blocks' &&
        !document.body.classList.contains('runtime') && !document.body.classList.contains('stage-enlarged');
    }
    $('#stageZoomOut').onclick = () => setStageZoom(visibleStageScale - 0.1);
    $('#stageZoomIn').onclick = () => setStageZoom(visibleStageScale + 0.1);
    $('#stageZoomReset').onclick = () => setStageZoom(1);
    $('#stageZoomFit').onclick = () => setStageZoom(null);
    function childErrorLogText(message) {
      const m = String(message), plain = m.replace(/^\s*[A-Z]\d{3}(?::|\s)\s*/, '');
      if (/保存失敗|ほぞん\s*できませんでした/.test(plain)) return '作品ファイルを ほぞん できませんでした。この画面の作品は のこって います。画面を とじずに、もう一度「保存」を おして ください。';
      if (/読み込み失敗|読みこめませんでした/.test(plain)) return '作品ファイルを 開けませんでした。えらんだ ファイルは かえて いません。あかりで ほぞんした ファイル（名前が「.akari.md」で おわる ファイル）を えらんで ください。';
      return childDiagnosticText({message:plain});
    }
    const log = (m, type = '') => {
      const original = String(m), message = type === 'error' ? childErrorLogText(original) : original,
        prefix = type === 'error' ? '❌ ' : type === 'ok' ? '✓ ' : '',
        addition = (el.console.textContent ? '\n' : '') + prefix + message,
        preserved = message === original ? addition : addition + '\n' + original;
      if (el.console.textContent.length + preserved.length > LIMITS.logChars)
        el.console.textContent = '[古い きろくは はぶきました]\n' + (el.console.textContent + preserved).slice(-Math.floor(LIMITS.logChars * 0.9));
      else {
        el.console.appendChild(document.createTextNode(addition));
        if (message !== original) appendDiagnosticDetails(el.console, {message:original});
      }
      el.console.scrollTop = el.console.scrollHeight;
    };
    // The status line says what is true now: an action's result stays until the next action replaces it (an edit clears
    // it, markDirty). At はじめて a new sentence is lit for a moment, so the child sees that it changed.
    let statusSerial = 0, statusFlash = null;
    const setStatus = (m) => {
      statusSerial++;
      if (el.status.textContent === m) return;
      el.status.textContent = m;
      // A screen reader hears what the line says (a refusal, おわったよ, …), but not the place shown while a part is dragged.
      if (!/^よこのばしょ /.test(m || '')) $('#statusLive').textContent = m;
      if (m && document.body.dataset.uiLevel === 'entry' && typeof el.status.animate === 'function') {
        statusFlash?.cancel();
        statusFlash = el.status.animate([{ backgroundColor: '#ffe9a8' }, { backgroundColor: 'transparent' }], { duration: 1600, easing: 'ease-out' });
      }
    };
    // The status line repeats an editor failure until the source is fixed.
    let editorFailureStatus = null;
    const allIds = () => {
      const z = new Set(['stage']);
      for (const b of project.stage.backdrops) z.add(b.id);
      for (const d of [...project.projectData.variables, ...project.projectData.lists]) z.add(d.id);
      for (const c of project.components) {
        z.add(c.id);
        for (const d of [...c.localData.variables, ...c.localData.lists]) z.add(d.id);
        for (const co of c.costumes || []) z.add(co.id);
      }
      for (const a of [...project.scripts, ...project.actions, ...project.functions, ...project.sounds])
        if (a.id) z.add(a.id);
      for(const script of project.scripts)for(const id of script.document?.unitIds||[])z.add(id);
      for (const id of assetStore.ids()) z.add(id);
      return z;
    };
    const componentById = (id) => project.components.find((c) => c.id === id);
    // 名人 scripts belong to no part; the editor lists them under this pseudo owner.
    const MEIJIN_TARGET = Object.freeze({ id: MEIJIN_OWNER, name: '名人の本文', type: MEIJIN_OWNER });
    const targetById = (id) => (id === 'stage' ? project.stage : id === MEIJIN_OWNER ? MEIJIN_TARGET : componentById(id));
    const targetType = (id) => (id === 'stage' ? 'stage' : id === MEIJIN_OWNER ? MEIJIN_OWNER : componentById(id)?.type);
    const meijinScripts = () => project.scripts.filter(isMeijinScript);
    const currentIsMeijin = () => selectedId === MEIJIN_OWNER;
    const modelLocked = () => appState !== 'DESIGN' || !!runtime || !!scheduler;
    function revokeDesignUrls() {
      for (const u of designObjectUrls.values()) URL.revokeObjectURL(u);
      designObjectUrls.clear();
    }
    function designImageUrl(id) {
      if (runtimeCache?.objectUrls?.has(id)) return runtimeCache.objectUrls.get(id);
      if (designObjectUrls.has(id)) return designObjectUrls.get(id);
      const a = assetStore.get(id);
      if (!a || a.kind !== 'image') return '';
      const u = URL.createObjectURL(new Blob([a.bytes], { type: a.mime }));
      designObjectUrls.set(id, u);
      return u;
    }
    function currentFingerprint() {
      return assetStateFingerprint(project, assetStore);
    }
    function compactCurrentAssets() {
      assetStore = assetStore.retainOnly(collectReachableAssetIds(project));
    }
    function pushHistoryNow(e = snapshot()) {
      // An immediate snapshot supersedes the queued edit's older view state.
      clearTimeout(historyTimer);
      lastObservedFingerprint = e.stateFingerprint;
      if (!history.length || history.at(-1).stateFingerprint !== e.stateFingerprint) {
        history.push(e);
        if (history.length > Math.max(1, Math.floor(LIMITS.historyEntries / 2))) history.shift();
        redo = [];
      } else history[history.length - 1] = e;
      updateDirty();
    }
    function setAssetProgress(text = '') {
      const n = $('#assetProgress');
      if (!n) return;
      n.textContent = text;
      n.style.display = text ? 'block' : 'none';
    }
    function stopPreview() {
      const current = previewAudio;
      previewAudio = null;
      if (!current) return;
      try {
        current.source?.stop();
      } catch (_) {}
      try {
        const closing = current.context?.close();
        closing?.catch?.(() => {});
      } catch (_) {}
    }
    const inspectorNodes = [];
    function closeRuntimeInspector() {
      const dialog = $('#runtimeInspector');
      if (dialog.open) dialog.close();
      for (const {node, marker} of inspectorNodes.splice(0)) { marker.replaceWith(node); }
      if (appState === 'RUNNING' || appState === 'PAUSED') {
        stageView.fitStage();
        el.form.focus({ preventScroll: true });
      }
    }
    function openRuntimeInspector() {
      if (!['RUNNING', 'PAUSED'].includes(appState) || inspectorNodes.length) return;
      stageView.clearInput();
      // The dialog opens on the body of the sentence 「いま 動いている 文：」 names, not on the body chosen before the run.
      flushRuntimePaint();
      paintExecutionLocation({ follow: true });
      // The dialog shows the running bodies with the コード／ブロック toggle and the strip of the running sentence; the level is
      // chosen on the edit screen only.
      for (const [node, target] of [[$('.codewin'), $('#runtimeInspectorBody')], [$('.monitor-window'), $('#runtimeInspectorBody')], [$('#editorModecode').parentElement, $('#runtimeInspectorModes')], [$('#runStrip'), $('#runtimeInspectorStrip')]]) {
        const marker = document.createComment('runtime inspector return point');
        node.before(marker); inspectorNodes.push({node, marker}); target.append(node);
      }
      $('#runtimeInspector').showModal();
      renderEditorBinding(mainEditor);
      // The line numbers were laid out while the body was not shown (the run screen); lay them out in the dialog, and
      // bring the running sentence into view.
      updateGutter();
      if (activeLoc?.key === bindingOwner(mainEditor)) {
        if (mainEditor.session?.mode === 'blocks') $('#blockEditor .blockui-current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        else {
          el.editor.scrollTop = Math.max(0, (wrappedCodeLines().lines[activeLoc.line - 1]?.top || 0) - Math.floor(el.editor.clientHeight / 3));
          el.gutter.scrollTop = el.editor.scrollTop;
        }
      }
      $('#runtimeInspectorClose').focus();
    }
    $('#runtimeInspectBtn').onclick = openRuntimeInspector;
    $('#runtimeInspectorClose').onclick = closeRuntimeInspector;
    $('#runtimeInspectorStop').onclick = stopRun;
    $('#runtimeInspector').addEventListener('close', () => { if (inspectorNodes.length) closeRuntimeInspector(); });
    function disposeRuntime() {
      closeRuntimeInspector();
      $('#listRepairPanel')?.remove();
      generationToken++;
      stageView.clear();
      physicalKeys.clear();
      if (runtimePaintFrame !== null) cancelAnimationFrame(runtimePaintFrame);
      runtimePaintFrame = null;
      runtimePaintFlags = 0;
      debugSourceKey = null;
      if (scheduler) {
        scheduler.stop();
        scheduler = null;
      } else if (runtime) runtime.stopAllAudio?.(false);
      runtime = null;
      activeLoc = null;
      keptFail = null;
      activeTaskId = null;
      if (runtimeCache) {
        runtimeCache.dispose();
        runtimeCache = null;
      }
      for (const id of ['failureModal', 'valueModal']) $('#' + id)?.classList.remove('show');
      activeFailureId = null;
      valueView = null;
    }
    function closeEditingModals() {
      stopPreview();
      for (const id of ['assetModal', 'procModal', 'dataModal'])
        $('#' + id)?.classList.remove('show');
    }
    function placeProjectNameText() {
      const text = $('#projectNameText'), box = el.projectName;
      if (text.hidden) return;
      const style = getComputedStyle(box);
      Object.assign(text.style, {
        left: box.offsetLeft + 'px', top: box.offsetTop + 'px', width: box.offsetWidth + 'px', height: box.offsetHeight + 'px',
        paddingLeft: parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth) + 'px', font: style.font,
      });
    }
    new ResizeObserver(() => placeProjectNameText()).observe($('.menutool'));
    function updateEditingLock() {
      const locked = modelLocked();
      if (locked && colorEdit) closeColorPicker();
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
      $('#uiLevel').disabled = appState === 'IMPORTING';
      // Do not change history ownership while an asynchronous import is still settling.
      // Runtime inspection keeps its existing target/event navigation.
      el.obj.disabled = el.event.disabled = appState === 'IMPORTING' || appState === 'PREPARING';
      el.editor.readOnly = locked;
      el.projectName.disabled = locked;
      // The run screen shows the work's name as plain text in the name box's place: the box keeps its room but is not
      // shown, so it is not read as an edit field either.
      const nameText = $('#projectNameText'), runScreen = ['PREPARING', 'RUNNING', 'PAUSED'].includes(appState);
      nameText.hidden = !runScreen;
      if (runScreen) {
        if (nameText.textContent !== project.name) nameText.textContent = nameText.title = project.name;
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
        runStageMinimum = { width: r.width, height: r.height, left: main.scrollLeft, top: main.scrollTop };
        main.tabIndex = 0; main.setAttribute('aria-label', '画面と 本文を スクロールする');
        document.body.dataset.runStageMinimum = '';
      }
      document.body.classList.toggle('runtime', runScreen);
      if (runScreen && !wasRuntime) fitRunStageMinimum();
      else if (!runScreen && wasRuntime) {
        const previous = runStageMinimum; runStageMinimum = null;
        delete document.body.dataset.runStageMinimum;
        main.removeAttribute('tabindex'); main.removeAttribute('aria-label');
        $('#designerWindow').style.removeProperty('--run-stage-min-width');
        $('#designerWindow').style.removeProperty('--run-stage-min-height');
        main.scrollLeft = previous?.left || 0; main.scrollTop = previous?.top || 0;
      }
      document.body.classList.toggle('run-finished', runFinished);
      syncWideInert();
      // はじめて's run screen shows the blocks to read only: they are not Tab stops between the stage and ■ 止める (AX-11).
      const world = $('#blockEditor .blockui-world');
      if (world) world.inert = document.body.dataset.uiLevel === 'entry' && ['PREPARING', 'RUNNING', 'PAUSED'].includes(appState);
      if (locked && appState !== 'IMPORTING') closeEditingModals();
      if (mainEditor.view) renderEditorBinding(mainEditor);
      // A picture or work being read in refuses the toggle's press (読みこみが おわるまで…), and the refusal ends with it.
      if (draftEditor.session) paintBindingModeToggle(draftEditor);
      updateDirty();
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
        project: cloneDesignProject(project),
        assets: assetStore.snapshotRefs(collectReachableAssetIds(project)),
        selectedId,
        currentEvent,
        selectedScriptId,
        fingerprint,
        stateFingerprint,
        editorState: captureEditorState(),
        draft: { ...callableDraftCore },
        callableBaseline,
        callableLoadedKey,
        draftSerial: editorDraftSerial,
        draftOpen: $('#procModal').classList.contains('show'),
      };
    }
    function resetHistory() {
      clearTimeout(historyTimer);
      initialSnapshot = snapshot();
      history = [initialSnapshot];
      redo = [];
      lastSavedFingerprint = currentFingerprint();
      lastSavedEditorFingerprint = openEditorFingerprint();
      lastObservedFingerprint = stateFingerprintCore();
      dirty = false;
      updateDirty();
    }
    function queueHistory(fingerprint, stateFingerprint) {
      if (modelLocked()) return;
      clearTimeout(historyTimer);
      const queued = snapshot(fingerprint, stateFingerprint);
      historyTimer = setTimeout(() => {
        pushHistoryNow(queued);
      }, 250);
    }
    function markDirty() {
      if (modelLocked()) return;
      invalidateEditors();
      const fingerprint = currentFingerprint(), fp = stateFingerprintCore(fingerprint);
      if (fp === lastObservedFingerprint) return;
      lastObservedFingerprint = fp;
      keptFail = null;
      // An edit is a new action: the result of the one before (開いたよ, ほぞんしたよ, からっぽの 作品 …) goes away unless
      // this edit says something itself. A mistake that is still there stays (editorFailureStatus).
      const serial = statusSerial;
      queueMicrotask(() => {
        if (statusSerial === serial && !modelLocked() && el.status.textContent !== editorFailureStatus) setStatus('');
      });
      recoveryEpoch++;
      if (history.at(-1)?.stateFingerprint !== fp) redo = [];
      updateDirty();
      queueHistory(fingerprint, fp);
      scheduleAutosave();
    }
    function updateDirty() {
      dirty = currentFingerprint() !== lastSavedFingerprint;
      const draft = hasCallableDraft() || hasPendingEditor();
      el.dirty.textContent = dirty ? 'ファイルに まだ ほぞんして いないよ' : draft ? '書きかけが あるよ' : 'かえた ところは ないよ';
      el.dirty.className = dirty || draft ? 'dirty-state dirty' : 'dirty-state';
      // The saving state reads as one sentence: what this computer keeps, then the file (このパソコンに のこしたよ。ファイルに
      // まだ ほぞんして いないよ). With nothing changed only かえた ところは ないよ is said.
      el.autosave.classList.toggle('save-quiet', !dirty && !draft);
      const locked = modelLocked();
      $('#undoBtn').disabled =
        locked || (history.length <= 1 && history[0]?.stateFingerprint === stateFingerprintCore());
      $('#redoBtn').disabled = locked || !redo.length;
      document.title = `${dirty || draft ? '● ' : ''}${productLabel()} — ${project.name}`;
    }
    let restoringSnapshot=false;
    function restoreSnap(e,{restoreView=false}={}) {
      restoringSnapshot=true;
      // The view stays as shown; in a work with a 名人 text (shown in code) the chosen view stays.
      const shown=binding=>workIsMeijin()?editorModes.get(binding.kind)||'code':binding.session?.mode||'code';
      const view={uiLevel:baseUiLevel,sourceOverviewOpen,editorModes:{script:shown(mainEditor),draft:shown(draftEditor)}};
      // Going back to before the 名人 text was made also brings back how the body was shown then (はじめて shows blocks).
      if(workIsMeijin()&&!(e.project.scripts||[]).some(isMeijinScript)&&e.editorState)view.editorModes.script=e.editorState.editorModes.script;
      try {
      recoveryEpoch++;
      validateAssetReferences(e.project, new AssetStore(e.assets));
      disposeRuntime();
      revokeDesignUrls();
      project = cloneDesignProject(e.project);
      assetStore = new AssetStore(e.assets);
      selectedId = e.selectedId && targetById(e.selectedId) ? e.selectedId : 'stage';
      currentEvent = e.currentEvent || 'start';
      selectedScriptId = e.selectedScriptId || null;
      appState = 'DESIGN';
      callableDraftCore = {
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
      callableBaseline = e.callableBaseline || JSON.stringify(['action', '', '', '']);
      callableLoadedKey = e.callableLoadedKey || '';
      editorDraftSerial = e.draftSerial || ++editorDraftSerial;
      editorSessions.clear();
      invalidateEditors();
      paintCallable();
      $('#procModal').classList.toggle('show', !!e.draftOpen || hasCallableDraft());
      renderCallableOptions(callableLoadedKey);
      // A procedure made in a 名人 text that was shown is shown again as the restored text makes it (or no longer).
      if (meijinProcedureId) showMeijinProcedure(meijinProcedureId);
      lastObservedFingerprint = stateFingerprintCore();
      renderAll();
      loadEditor();
      if ($('#procModal').classList.contains('show')) renderEditorBinding(draftEditor);
      if(e.editorState){restoreEditorState({...e.editorState,...(restoreView?{}:view)});callableBaseline=e.callableBaseline||callableBaseline;callableLoadedKey=e.callableLoadedKey||'';$('#procModal').classList.toggle('show',!!e.draftOpen);}
      lastObservedFingerprint=stateFingerprintCore();
      e.stateFingerprint=lastObservedFingerprint;
      updateDirty();
      } finally { restoringSnapshot=false; }
      scheduleAutosave();
    }
    function undo() {
      if (!tutorialAllows(tutorial,'undo')) return;
      if (modelLocked() || composingAny() || activeDragCleanup || colorEdit) return;
      flushActiveEditor();
      clearTimeout(historyTimer);
      const cur = snapshot();
      if (history.at(-1)?.stateFingerprint !== cur.stateFingerprint) history.push(cur);
      if (history.length <= 1) return;
      redo.push(history.pop());
      restoreSnap(history.at(-1));
      confirmTutorialOperation('undo');
      setStatus('1つ前に もどしたよ');
    }
    function redoDo() {
      if (tutorial) return;
      if (modelLocked() || composingAny() || activeDragCleanup || colorEdit || !redo.length) return;
      flushActiveEditor();
      if(history.at(-1)?.stateFingerprint!==stateFingerprintCore()){pushHistoryNow();return;}
      clearTimeout(historyTimer);
      const e = redo.pop();
      history.push(e);
      restoreSnap(e);
      setStatus('やり直したよ');
    }
    // Pair the existing saved project fingerprint with the unfinished content
    // already included in saved editorState. Selection/caret/view do not count.
    function openEditorFingerprint() {
      try { return editorContentFingerprint(captureEditorState()); }
      catch (_) {
        // Invalid drafts must still be protected, including values that cannot
        // yet be serialized. No validation failure clears the active work.
        return stableJson([callableDraftCore, headerPending ? [$('#callableName').value,
          $('#callableArgs').value, $('#callablePhrase').value] : null,
          [mainEditor, draftEditor].map(binding => binding.session?.pendingEdit || binding.session?.blockDraft
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
    function currentOpenState() {
      // Opening may be cancelled: retain the existing inline diagnosis and editor geometry.
      flushActiveEditor({ preserveView: true });
      activeDragCleanup?.();
      const content = currentFingerprint(), editor = openEditorFingerprint();
      return { fingerprint: stableJson([content, editor]),
        unsaved: content !== lastSavedFingerprint || editor !== lastSavedEditorFingerprint ||
          composingAny() || !!colorEdit };
    }
    let openRequest = null;
    function finishOpenSelection() {
      openRequest = null;
      el.fileInput.value = '';
      if (!document.querySelector('.modal.show,.modal.open,dialog[open]')) openButtonShown()?.focus({preventScroll:true});
    }
    function selectProjectForOpen() {
      if (!openRequest || modelLocked()) return;
      openRequest.phase = 'selection';
      if (openRequest.kind === 'sample') { showSamplePicker(); return; }
      el.fileInput.value = '';
      try { el.fileInput.click(); }
      catch (error) { finishOpenSelection(); log(error.message, 'error'); }
    }
    // 開く and お手本を開く ask in the one dialog for work that would be replaced (askLose) before the choice. The
    // approval holds for the work as it was asked about; saving first does not change it.
    async function confirmOpenRequest(kind) {
      const observed = currentOpenState(), request = { kind, fingerprint: observed.fingerprint, phase: 'confirmation' };
      openRequest = request;
      const go = await askLose(observed);
      if (openRequest !== request) return;
      if (!go) {
        openRequest = null;
        // やめる: the focus goes back to the button that asked (at はじめて 開く is in the 作品 menu).
        if (!document.querySelector('.modal.show,.modal.open,dialog[open]')) (kind === 'sample' ? $('#sampleBtn') : openButtonShown())?.focus({ preventScroll: true });
        return;
      }
      selectProjectForOpen();
    }
    function requestOpenProject() {
      if(tutorial)return;
      if (modelLocked() || openRequest || document.querySelector('.modal.show:not(#procModal),.modal.open,dialog[open]')) return;
      confirmOpenRequest('file');
    }
    // Asks in the product's own dialog before unsaved work is replaced (開く, 新しく作る, お手本を開く, いっしょに作る):
    // the dialog names the work, and offers to save it first. The answer is void when the work changed while the
    // question was open.
    let loseConfirm = null;
    function askLose(observed = currentOpenState()) {
      if (!observed.unsaved) return Promise.resolve(true);
      if (loseConfirm) return Promise.resolve(false);
      const origin = document.activeElement;
      $('#loseConfirmMessage').textContent = `「${project.name}」には まだ ほぞんして いない ところが あるよ。このまま つづけると、いまの 作品は なくなるよ。`;
      $('#loseConfirmModal').classList.add('show');
      $('#loseConfirmCancel').focus({preventScroll:true});
      return new Promise((resolve) => {
        loseConfirm = (answer) => {
          loseConfirm = null;
          $('#loseConfirmModal').classList.remove('show');
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
    function saveEditor(options = {}) {
      if (modelLocked()) return true;
      activeDragCleanup?.();
      return saveCodeBinding(mainEditor, options);
    }
    // A new touch body touches the stage edge until its partner is chosen (いつ動く？) or written in its heading.
    const newBodyFilter = event => event === 'touchStart' ? { filter: { target: '端' } } : {};
    function eventsFor(id) {
      if (id === MEIJIN_OWNER) return ['start'];
      return EVENT_BY_TYPE[targetType(id)] || EVENT_BY_TYPE.stage;
    }
    function selectCurrentScript() {
      let row = selectedScriptId ? project.scripts.find((x) => x.id === selectedScriptId &&
        x.targetId === selectedId && x.event === currentEvent) : null;
      row ||= project.scripts.find((x) => x.targetId === selectedId && x.event === currentEvent);
      selectedScriptId = row?.id || null;
      return row;
    }
    function loadEditor() {
      debugSourceKey = null;
      const evs = eventsFor(selectedId);
      if (!evs.includes(currentEvent)) currentEvent = evs[0];
      selectCurrentScript();
      renderSelectors();
      getEditorSession(mainEditor);
      renderEditorBinding(mainEditor);
      refreshEditor();
    }
    function renderSelectors() {
      $('#sourceOverviewBtn').hidden = sourceOverviewOpen;
      $('#sourceEditBtn').hidden = !sourceOverviewOpen;
      $('#sourceStageBtn').hidden = selectedId === 'stage';
      $('#sourceHeadingBtn').hidden = sourceOverviewOpen;
      $('#sourceHeadingBtn').disabled = modelLocked();
      el.obj.innerHTML = '';
      const add = (v, t) => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = t;
        el.obj.appendChild(o);
      };
      add('stage', project.stage.name);
      for (const c of project.components) add(c.id, c.name);
      if (meijinScripts().length) add(MEIJIN_OWNER, MEIJIN_TARGET.name);
      el.obj.value = selectedId;
      el.event.innerHTML = '';
      if (sourceOverviewOpen) {
        const all = document.createElement('option');
        all.value = 'all'; all.textContent = 'すべての本文を 見せています';
        el.event.append(all);
      }
      for (const ev of eventsFor(selectedId)) {
        const rows = project.scripts.filter((x) => x.targetId === selectedId && x.event === ev);
        const choices = rows.length ? rows : [null];
        choices.forEach((row, index) => {
          const option = document.createElement('option');
          option.value = index === 0 ? ev : scriptSourceKey(row);
          // A key is named as on the keyboard (「スペース」), as the heading writes it.
          const filter = row?.filter;
          // A touch body is named with what it touches (「星」に ふれたとき); bodies with the same partner are numbered among
          // themselves. A part with no touch body has the one entry ふれたとき.
          const same = ev === 'touchStart' ? rows.filter(x => x.filter?.target === filter?.target) : rows;
          option.textContent = selectedId === MEIJIN_OWNER ? `名人の本文 ${index + 1}` : eventText(ev, filter) + (same.length > 1 ? ` ／ 本文${same.indexOf(row) + 1}` : '');
          if (row) option.dataset.scriptKey = scriptSourceKey(row);
          el.event.appendChild(option);
        });
      }
      const row = selectedScriptId ? project.scripts.find((x) => x.id === selectedScriptId) : null,
        first = project.scripts.find((x) => x.targetId === selectedId && x.event === currentEvent);
      el.event.value = sourceOverviewOpen ? 'all' : row && row !== first ? scriptSourceKey(row) : currentEvent;
      $('#scriptAdd').disabled = modelLocked() || project.scripts.length >= LIMITS.scripts;
      $('#scriptAdd').textContent = currentIsMeijin() ? '名人の本文を ふやす' : '同じ きっかけの 本文を ふやす';
      $('#meijinDelete').hidden = !currentIsMeijin();
      $('#meijinDelete').disabled = modelLocked();
      $('#sourceHeadingBtn').hidden ||= workIsMeijin();
      renderEntrySurface();
    }
    function hideSourceOverview() {
      sourceOverviewOpen = false;
      sourceOverviewSignature = '';
      $('.codewin').dataset.sourceOverview = 'false';
      $('#sourceOverview').hidden = true;
      sourceOverviewObserver?.disconnect();
      for (const view of sourceOverviewViews) view.destroy();
      sourceOverviewViews = [];
      $('#sourceOverview').replaceChildren();
    }
    function showSourceOverview() {
      sourceOverviewOpen = true;
      sourceOverviewSignature = '';
      syncEditorShell(chosenEditorMode());
      $('.codewin').dataset.sourceOverview = 'true';
      $('#sourceOverview').hidden = false;
      $('#sourceOverview').scrollTop = 0;
      renderSelectors();
      renderSourceOverview();
    }
    function renderSourceOverview() {
      if (!sourceOverviewOpen) return;
      paintBindingModeToggle(mainEditor);
      const signature = JSON.stringify([selectedId, editorContextRevision, chosenEditorMode(), modelLocked(), hasCallableDraft() ? callableDraftCore : null]);
      if (sourceOverviewSignature === signature) return;
      sourceOverviewSignature = signature;
      sourceOverviewObserver?.disconnect();
      for (const view of sourceOverviewViews) view.destroy();
      sourceOverviewViews = [];
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
      const records = sourceRegistry(project), byKey = new Map(records.map(r => [r.key, r]));
      const owned = records.filter(r => r.ownerId === selectedId);
      root.setAttribute('aria-label', targetById(selectedId).name + ' のすべての本文');
      if (!owned.length) root.append(make('p', (selectedId === 'stage' ? '画面' : 'この 部品') + 'には まだ 本文が ないよ。きっかけを えらんで 本文を 作ってね。'));
      const queue = [...owned.filter(r => r.source.trim()), ...owned.filter(r => !r.source.trim())];
      const included = new Set(queue.map(r => r.key));
      for (let i = 0; i < queue.length; i++) {
        const record = queue[i];
        record.references = sourceReferences(record, project);
        for (const key of record.references) if (!included.has(key)) {
          included.add(key); queue.push(byKey.get(key));
        }
      }
      const anchors = new Map(queue.map((r, i) => [r.key, `source-body-${i}`]));
      const waiting = new Map();
      sourceOverviewObserver = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          const render = waiting.get(entry.target);
          if (render) { waiting.delete(entry.target); render(); }
          sourceOverviewObserver.unobserve(entry.target);
        }
      }, { root, rootMargin: '0px' });
      for (const [i, record] of queue.entries()) {
        const card = make('section', null, 'source-card');
        card.id = anchors.get(record.key);
        card.dataset.sourceKey = record.key;
        card.dataset.ownerId = record.ownerId;
        const shared = record.ownerId !== selectedId;
        const heading = make('h3', `${shared ? project.stage.name + ' ／ ' : ''}${record.title}`);
        const edit = button('この 本文を なおす', () => {
          if (!flushActiveEditor()) return;
          if (record.kind === 'script') {
            if (!selectObject(record.ownerId)) return;
            currentEvent = record.event; selectedScriptId = record.id || null; hideSourceOverview(); loadEditor();
            if (!modelLocked()) pushHistoryNow();
          } else {
            if (modelLocked() || !confirmCallableDiscard()) return;
            loadCallable(record.key); renderCallableOptions(record.key);
            $('#procModal').classList.add('show'); renderEditorBinding(draftEditor);
            pushHistoryNow();
          }
        });
        edit.dataset.sourceEdit = record.key;
        edit.disabled = modelLocked();
        card.append(heading, edit);
        const body = make('div', null, 'source-body'); card.append(body);
        const render = () => {
          body.replaceChildren();
          if (!record.source.trim()) { body.append(make('p', '本文は からっぽだよ。')); return; }
          const session = createEditorSession(record.key, record.source, record.context, project, editorContextRevision);
          if (chosenEditorMode() === 'blocks' && session.syntaxAst) {
            session.mode = 'blocks';
            const preview = make('div', null, 'source-blocks'); body.append(preview);
            sourceOverviewViews.push(createBlockEditorView({
              readOnly: true,
              root: preview, getSession: () => session, getProject: () => project,
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
        else { waiting.set(body, render); sourceOverviewObserver.observe(body); }
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
      if (selectedId === 'stage' && hasCallableDraft()) {
        const card = make('section', null, 'source-card source-draft');
        card.dataset.ownerId = callableDraftCore.ownerId;
        card.dataset.sourceKey = draftOwner();
        card.append(make('h3', `なおして いる ${callableDraftCore.type === 'action' ? 'てじゅん' : '答えを もとめる'}「${callableDraftCore.name || '名前を入力'}」`),
          make('pre', callableDraftCore.source || '本文は からっぽだよ。'),
          button('つづきを なおす', () => { $('#procModal').classList.add('show'); renderEditorBinding(draftEditor); }));
        root.append(card);
      }
      root.scrollTop = scroll;
    }
    function selectObject(id) {
      if (tutorial) return false;
      if (!targetById(id) || !flushActiveEditor()) {
        renderSelectors();
        return false;
      }
      captureEditorView(mainEditor);
      if (!modelLocked()) {
        clearTimeout(historyTimer);
        pushHistoryNow();
      }
      const sameObject = selectedId === id;
      selectedId = id;
      hideSourceOverview();
      const evs = eventsFor(id);
      if (!evs.includes(currentEvent)) currentEvent = evs[0];
      // はじめて opens the start and click bodies only (F-05): a body of another event (ふれたとき, keys …) is kept, and
      // the note under the event buttons says so.
      const entry = document.body.dataset.uiLevel === 'entry', shownAtLevel = x => !entry || ['start', 'click'].includes(x.event);
      if (entry && !['start', 'click'].includes(currentEvent)) currentEvent = 'start';
      if (!sameObject) {
        selectedScriptId = null;
        const matching = project.scripts.find((x) => x.targetId === id && x.event === currentEvent && x.source.trim()),
          first = matching || project.scripts.find((x) => x.targetId === id && x.source.trim() && shownAtLevel(x));
        if (first) { currentEvent = first.event; selectedScriptId = first.id || null; }
      }
      renderTree();
      renderProperties();
      loadEditor();
      renderComponents();
      // Navigation changes the view of the current history frame, not its
      // content. The next atomic field edit must undo to this selected owner.
      if (!modelLocked()) pushHistoryNow();
      return true;
    }
    function applyStage() {
      stageView.renderStage();
      el.frame.style.width = project.stage.width + 6 + 'px';
      el.title.textContent = project.name;
    }
    // 「たて・よこを そろえる」 (E-22) keeps a part's shape while a corner handle is moved, as Shift does with a mouse; it is
    // shown in the stage heading on a touch screen while a part with a box is selected.
    let designRatioLocked = false;
    $('#designRatioLock').onclick = () => {
      designRatioLocked = !designRatioLocked;
      $('#designRatioLock').setAttribute('aria-pressed', String(designRatioLocked));
    };
    // How far a press must move before it carries a part or a handle, in screen pixels: a finger wobbles more than a
    // mouse or a pen (Chrome's own tap slop is about 15 px).
    const pointerSlop = (e) => e.pointerType === 'touch' ? 8 : 3;
    let designResizeSmall = null, designHandlesShown = null;
    // On a small on-screen part, edge handles would cover the picture: only the corners show, just outside the part.
    function designHandlesSmall(c) {
      const stageScale = el.form.getBoundingClientRect().width / project.stage.width || 1, s = c.scalePercent / 100;
      return designResizeMode(c) === 'box' && Math.min(c.w * s, c.h * s) * stageScale < 64;
    }
    // How the handles are shown is decided when they are first shown for a part at its size and screen scale, and a
    // drag keeps it from the press through the release (A-R2-05, A-08): the handle stays under the pointer after a drag
    // that made a small part larger than 64 px. A change made another way (せってい, keys, もとに もどす, the screen's
    // zoom) or another part decides it again.
    const designHandleKey = (c) => [c.id, c.w, c.h, c.scalePercent, Math.round(el.form.getBoundingClientRect().width * 100)].join(' ');
    function designHandlesSmallShown(c) {
      if (designResizeSmall !== null) return designResizeSmall;
      const key = designHandleKey(c);
      if (designHandlesShown?.key !== key) designHandlesShown = { key, small: designHandlesSmall(c) };
      return designHandlesShown.small;
    }
    function positionResizeHandles(c = designResizePreview || componentById(selectedId)) {
      if (!c) return;
      // On a touch screen a handle is a 24 px dot that a finger presses within 40 px (E-19).
      const coarse = matchMedia('(pointer: coarse)').matches, hit = coarse ? 40 : 24, dot = coarse ? 24 : 12;
      const rect = el.form.getBoundingClientRect(),
        stageScale = rect.width / project.stage.width || 1,
        s = c.scalePercent / 100;
      for (const handle of el.form.querySelectorAll('.design-resize-handle')) {
        if (handle.dataset.resizeFor !== c.id) continue;
        const p = designResizePoint(c, handle.dataset.resizeDirection),
          [hx, hy] = DESIGN_RESIZE_DIRECTIONS[handle.dataset.resizeDirection];
        handle.style.left = p.x + 'px';
        handle.style.top = project.stage.height - p.y + 'px';
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
            px = small ? hx * 12 / stageScale : designResizeSmall !== null ? 0 : hx * Math.max(0, 18 / stageScale - (c.w * s) / 2),
            py = small ? hy * 12 / stageScale : designResizeSmall !== null ? 0 : hy * Math.max(0, 18 / stageScale - (c.h * s) / 2);
          handle.hidden = small && (hx === 0 || hy === 0);
          // The offset is along the part's screen axes, which are turned by −向き on the screen.
          handle.style.left = p.x + px * Math.cos(rad) + py * Math.sin(rad) + 'px';
          handle.style.top = project.stage.height - p.y - px * Math.sin(rad) + py * Math.cos(rad) + 'px';
        }
        const angle = (Math.atan2(hy, hx) * 180) / Math.PI - c.direction;
        handle.style.cursor = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][
          ((Math.round(angle / 45) % 4) + 4) % 4
        ];
      }
      updateDesignHelp(el.form.querySelector('.design-resize-handle') ? c : null);
      const outline = el.form.querySelector('.design-resize-outline');
      if (outline)
        Object.assign(outline.style, {
          left: c.x - (c.w * s) / 2 + 'px',
          top: project.stage.height - c.y - (c.h * s) / 2 + 'px',
          width: c.w * s + 'px',
          height: c.h * s + 'px',
          transform: `rotate(${-c.direction}deg)`,
          borderWidth: 1.5 / stageScale + 'px',
        });
    }
    function paintResizePreview(c) {
      const n = el.form.querySelector(`[data-runtime-id="${CSS.escape(c.id)}"].component`);
      if (n)
        Object.assign(n.style, {
          left: c.x - c.w / 2 + 'px',
          top: project.stage.height - c.y - c.h / 2 + 'px',
          width: c.w + 'px',
          height: c.h + 'px',
          transform: `rotate(${-c.direction}deg) scale(${c.scalePercent / 100})`,
        });
      positionResizeHandles(c);
    }
    function commitResize(c, next) {
      if (modelLocked() || componentById(c.id) !== c) return false;
      if (Object.keys(next).every((k) => Math.abs(c[k] - next[k]) < 1e-9)) return false;
      const candidate = cloneDesignProject(project);
      Object.assign(
        candidate.components.find((x) => x.id === c.id),
        next,
      );
      validateDesignProject(candidate);
      Object.assign(c, next);
      markDirty();
      clearTimeout(historyTimer);
      pushHistoryNow();
      return true;
    }
    function focusResizeHandle(id, direction) {
      el.form
        .querySelector(
          `.design-resize-handle[data-resize-for="${CSS.escape(id)}"][data-resize-direction="${direction}"]`,
        )
        ?.focus({ preventScroll: true });
    }
    // What the handles' and zoom's titles say is written under the screen at はじめて (E-22): how the
    // handles change a part's size while a part shows them, and how to see the screen at 100%. The other levels have it
    // beside each relevant control.
    function updateDesignHelp(c = el.form.querySelector('.design-resize-handle') && componentById(selectedId)) {
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
    function renderResizeHandle() {
      el.form
        .querySelectorAll('.design-resize-handle,.design-resize-outline')
        .forEach((n) => n.remove());
      $('#designRatioLock').hidden = true;
      updateDesignHelp(null);
      if (modelLocked() || selectedId === 'stage') return;
      const c = componentById(selectedId),
        mode = designResizeMode(c);
      if (!mode || !c.visible) return;
      // Only a box changes its width and height apart; a picture costume keeps its shape anyway.
      $('#designRatioLock').hidden = mode !== 'box';
      const node = el.form.querySelector(`[data-runtime-id="${CSS.escape(c.id)}"].component`);
      if (!node || node.style.display === 'none') return;
      const outline = document.createElement('div');
      outline.className = 'design-resize-outline';
      outline.setAttribute('aria-hidden', 'true');
      el.form.append(outline);
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
          if (!modelLocked() && flushActiveEditor()) startResize(e, c.id, direction);
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
          if (!flushActiveEditor()) return;
          clearTimeout(historyTimer);
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
            if (changed) refreshEditor();
          } catch (error) {
            log(error.message, 'error');
          }
          renderProperties();
          renderComponents();
          focusResizeHandle(c.id, direction);
          // The size is said as the pointer path says it (「はば 120　高さ 80」, or 「星1: 110%」), and read out (#statusLive).
          setStatus(changed ? (mode === 'scale' ? `${c.name}の 大きさ ${c.scalePercent}％` : `はば ${c.w}　高さ ${c.h}`) : '大きさは かわって いないよ');
        });
        el.form.append(handle);
      }
      positionResizeHandles(c);
    }
    function renderComponents() {
      stageView.renderComponents();
      renderResizeHandle();
      paintColorPreview();
    }
    function renderTree() {
      el.tree.textContent = '';
      el.tree.setAttribute('role', 'listbox');
      el.tree.setAttribute('aria-label', '\u4f5c\u54c1\u306e\u90e8\u54c1');
      const ids = ['stage', ...project.components.map((c) => c.id), ...(meijinScripts().length ? [MEIJIN_OWNER] : [])];
      const row = (id, label) => {
        const d = document.createElement('div');
        d.className = 'tree-item' + (id === selectedId ? ' selected' : '');
        d.textContent = label;
        d.tabIndex = id === selectedId ? 0 : -1;
        d.setAttribute('role', 'option');
        d.setAttribute('aria-selected', String(id === selectedId));
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
            el.tree.querySelector('[tabindex="0"]')?.focus();
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectObject(id);
            el.tree.querySelector('[tabindex="0"]')?.focus({ preventScroll: true });
          }
        };
        el.tree.appendChild(d);
      };
      row('stage', `\u25a3 ${project.stage.name}`);
      for (const c of project.components)
        row(c.id, `${c.type === 'sprite' ? '\u2605' : '\u2022'} ${c.name}`);
      if (meijinScripts().length) row(MEIJIN_OWNER, '\u270e ' + MEIJIN_TARGET.name);
    }
    function rollbackDesign(before) {
      project = before;
      invalidateEditors();
      renderAll();
      if ($('#dataModal').classList.contains('show')) renderDataModal();
      if ($('#assetModal').classList.contains('show')) renderAppearance();
    }
    let propHelpSerial = 0;
    // A name the work cannot take, said before the work is checked (FS2-01): why, and what to write instead.
    function checkPartName(v, { stage = false } = {}) {
      if (!v) throw new Error(stage ? '画面の 名前を 書いてね' : '名前を 書いてね');
      if (cpLen(v) > 80) throw new Error('名前は 80文字までに してね');
      if (/[\p{Cc}\p{Zl}\p{Zp}「」]/u.test(v)) throw new Error('名前に「 」や 行がえは 使えないよ。けしてね');
      if (!stage && (v === 'マウス' || isEdgeTarget(v))) throw new Error('「マウス」と「端（はし）」は 名前に 使えないよ。ちがう 名前に してね');
    }
    // A rename that the work refuses (prepareResourceRename), said in the status line's voice.
    const PROPERTY_REFUSALS = Object.freeze({
      '同じ 名前が あります': 'ほかの キャラクターや 部品と ちがう 名前に してね',
      '同じ ところに 同じ 名前が あります。ちがう 名前に して ください': 'ほかの キャラクターや 部品や 画面と ちがう 名前に してね',
      '書きかけを 先に 決めてから、名前を かえて ください': '書きかけを 先に 決めてから、名前を かえてね',
      '名前を 使って いるか しらべられない 本文が あります。先に 本文を 書きおえてから、名前を かえて ください':
        '名前を 使って いるか しらべられない 本文が あるよ。先に 本文を 書きおえてから、名前を かえてね',
      '同じ 名前が、いくつかの ものを さして います。どれの ことか、はっきり 書いてから 名前を かえて ください':
        '同じ 名前が、いくつかの ものを さして いるよ。どれの ことか、はっきり 書いてから 名前を かえてね',
    });
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
        const before = cloneDesignProject(project);
        try {
          if (type === 'number' && (inp.value.trim() === '' || !finite(Number(inp.value))))
            throw new Error('数を 入れてね');
          onchange(type === 'checkbox' ? inp.checked : inp.value);
          validateDesignProject(project);
          markDirty();
          renderAll();
          refreshEditor();
          options.after?.();
        } catch (err) {
          log((err.code ? err.code + ' ' : '') + sentence(err.code ? err.message : err.message.replace(/てね$/, 'て ください')), 'error');
          rollbackDesign(before);
          // The field goes back to what it was; the status line says why and what to write, in its own voice (F-11: no
          // silent no-op; F-18). Another check of the work (with a code) is said in the teacher log only.
          setStatus(err.code ? PROPERTY_REFUSALS[err.message] || `「${name}」は その 数や 文字には できないよ。もとに もどしたよ` : err.message);
        }
      });
      v.appendChild(inp);
      r.append(n, v);
      if (options.help) {
        const help = document.createElement('p');
        help.className = 'prop-help';
        help.id = 'propHelp' + ++propHelpSerial;
        help.textContent = options.help;
        inp.setAttribute('aria-describedby', help.id);
        r.append(help);
      }
      return r;
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
    // After the screen size changes, parts keep their steps from the bottom-left corner; name those now outside.
    // With none outside, the new size replaces an earlier note, which may no longer hold.
    function noteOutsideParts() {
      const outside = project.components.filter((c) => {
        const b = designBox(c);
        return b.right <= 0 || b.left >= project.stage.width || b.top <= 0 || b.bottom >= project.stage.height;
      });
      if (outside.length)
        setStatus(`${outside.map((c) => `「${c.name}」`).join('と ')}は 画面の 外に あるよ。「せってい」の「よこのばしょ」・「たてのばしょ」で もどせるよ`);
      else setStatus(`画面の はば ${project.stage.width}　高さ ${project.stage.height}`);
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
      propertyHeaderObserver?.disconnect();
      propertyHeaderObserver?.observe(el.props);
      const scroll = el.props.dataset.owner === selectedId ? el.props.scrollTop : 0;
      el.props.dataset.owner = selectedId;
      el.props.textContent = '';
      $('#componentActions').replaceChildren();
      if (selectedId === 'stage') {
        el.props.append(
          propSection(
            'きほん',
            propRow('\u540d\u524d', project.stage.name, (v) => {
              checkPartName(v.trim(), { stage: true });
              project = prepareResourceRename(project,'component:stage',v.trim(),{drafts:resourceDraftRecords()});
              invalidateEditors();
            }),
          ),
          propSection(
            '\u5927\u304d\u3055',
            propRow(
              'はば',
              project.stage.width,
              (v) => {
                const n = Number(v);
                if (!Number.isInteger(n) || n < 200 || n > 1200) throw new Error('画面の はばは 200から1200までの、小数の ない 数に してね');
                project.stage.width = n;
              },
              'number',
              { after: noteOutsideParts },
            ),
            propRow(
              '\u9ad8\u3055',
              project.stage.height,
              (v) => {
                const n = Number(v);
                if (!Number.isInteger(n) || n < 150 || n > 800)
                  throw new Error('画面の 高さは 150から800までの、小数の ない 数に してね');
                project.stage.height = n;
              },
              'number',
              { after: noteOutsideParts },
            ),
          ),
          // State words, not sentences of the language (F-22: 「すがたを見せる」 is a sentence).
          propSection('ふきだし',
            propRow('名前の ひょうじ',project.stage.showSpeechNames!==false,
              v=>(project.stage.showSpeechNames=v),'checkbox')),
        );
        syncPropertyScrollPadding();
        el.props.scrollTop = scroll;
        return;
      }
      const c = componentById(selectedId);
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
      duplicate.disabled = modelLocked() || project.components.length >= LIMITS.components;
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
      (document.body.dataset.editorMode === 'blocks' ? $('#componentActions') : el.props).append(actions);
      el.props.append(
        propSection(
          'きほん',
          propRow('\u540d\u524d', c.name, (v) => {
            v = v.trim();
            checkPartName(v);
            if (project.components.some((x) => x !== c && x.name === v))
              throw new Error('ほかの キャラクターや 部品と ちがう 名前に してね');
            project = prepareResourceRename(project,'component:'+c.id,v,{drafts:resourceDraftRecords()});
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
      propertyHeaderObserver?.observe(actions);
      syncPropertyScrollPadding();
      el.props.scrollTop = scroll;
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
      more.onclick = () => openColorPicker(c, field, label);
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
      const candidate = cloneDesignProject(project);
      candidate.components.find((x) => x.id === c.id)[field] = next;
      validateDesignProject(candidate);
      clearTimeout(historyTimer);
      pushHistoryNow();
      c[field] = next;
      markDirty();
      clearTimeout(historyTimer);
      pushHistoryNow();
      return true;
    }
    function choosePreset(c, field, value) {
      if (modelLocked() || colorEdit || !flushActiveEditor()) return;
      try {
        const changed = commitColor(c, field, value);
        if (changed) {
          renderProperties();
          renderComponents();
          refreshEditor();
        }
        const root = el.props.querySelector(`[data-color-field="${field}"]`),
          button =
            value === null
              ? root?.querySelector('.color-none')
              : root?.querySelector(`[data-color-value="${value}"]`);
        button?.focus({ preventScroll: true });
      } catch (error) {
        log(error.message, 'error');
      }
    }
    function paintColorPreview() {
      const edit = colorEdit;
      if (
        !edit ||
        modelLocked() ||
        project !== edit.project ||
        componentById(edit.id) !== edit.component
      )
        return;
      const node = el.form.querySelector(`.component[data-id="${CSS.escape(edit.id)}"]`);
      if (node)
        node.style[edit.field === 'fg' ? 'color' : 'backgroundColor'] = edit.value || 'transparent';
    }
    function syncColorPicker(syncHex = true) {
      const edit = colorEdit;
      if (!edit) return;
      const { h, s, v } = edit.hsv;
      colorChip($('#colorBefore'), edit.original);
      colorChip($('#colorAfter'), edit.value);
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
      paintColorPreview();
    }
    function updatePickerHsv(hsv) {
      if (!colorEdit || colorEdit.composing) return;
      Object.assign(colorEdit.hsv, hsv);
      const { h, s, v } = colorEdit.hsv;
      colorEdit.value = pickerHsvToHex(h, s, v);
      syncColorPicker();
    }
    function openColorPicker(c, field, label) {
      if (modelLocked() || colorEdit || !flushActiveEditor() || componentById(c.id) !== c)
        return;
      clearTimeout(historyTimer);
      pushHistoryNow();
      colorEdit = {
        id: c.id,
        component: c,
        project,
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
      const edit = colorEdit;
      if (!edit) return;
      const pointer = edit.pointer;
      edit.pointer = null;
      if (pointer)
        try {
          $('#colorWheel').releasePointerCapture(pointer.id);
        } catch (_) {}
      colorEdit = null;
      $('#colorModal').classList.remove('show');
      renderProperties();
      renderComponents();
      requestAnimationFrame(() => {
        if (!document.querySelector('.modal.show,.modal.open') && selectedId === edit.id)
          el.props
            .querySelector(`[data-color-field="${edit.field}"] .color-more`)
            ?.focus();
      });
      if (dirty || hasCallableDraft()) scheduleAutosave();
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
          colorEdit.hsv.h,
        );
      };
      const finishPointer = (cancel = false) => {
        const edit = colorEdit,
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
        const edit = colorEdit;
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
        if (!colorEdit?.pointer || colorEdit.pointer.id !== e.pointerId) return;
        e.preventDefault();
        updatePickerHsv(point(e));
      });
      wheel.addEventListener('pointerup', (e) => {
        if (colorEdit?.pointer?.id !== e.pointerId) return;
        updatePickerHsv(point(e));
        finishPointer();
      });
      for (const type of ['pointercancel', 'lostpointercapture'])
        wheel.addEventListener(type, (e) => {
          if (colorEdit?.pointer?.id === e.pointerId) finishPointer(true);
        });
      window.addEventListener('blur', () => finishPointer(true));
      wheel.addEventListener('keydown', (e) => {
        if (
          !colorEdit ||
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
          { h, s } = colorEdit.hsv;
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
          const edit = colorEdit;
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
        if (colorEdit) {
          colorEdit.composing = true;
          $('#colorConfirm').disabled = true;
        }
      });
      hex.addEventListener('compositionend', () => {
        if (colorEdit) {
          colorEdit.composing = false;
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
        if (colorEdit?.field === 'bg' && !colorEdit.composing) {
          colorEdit.value = null;
          syncColorPicker();
        }
      };
      $('#colorCancel').onclick = closeColorPicker;
      $('#colorConfirm').onclick = () => {
        const edit = colorEdit;
        if (!edit || edit.invalid || edit.composing) return;
        if (
          modelLocked() ||
          project !== edit.project ||
          componentById(edit.id) !== edit.component ||
          selectedId !== edit.id ||
          edit.component[edit.field] !== edit.original
        ) {
          closeColorPicker();
          return;
        }
        try {
          const changed = commitColor(edit.component, edit.field, edit.value);
          closeColorPicker();
          if (changed) refreshEditor();
        } catch (error) {
          $('#colorError').textContent = error.message;
          $('#colorAdvanced').open = true;
        }
      };
    }
    function startDrag(ev, id) {
      if (modelLocked() || ev.button !== 0 || ev.isPrimary === false) return;
      activeDragCleanup?.();
      const c = componentById(id);
      if (!c) return;
      clearTimeout(historyTimer);
      pushHistoryNow();
      const pointerId = ev.pointerId,
        before = { ...c },
        toStage = (e) => {
          const rect = el.form.getBoundingClientRect();
          return {
            x: ((e.clientX - rect.left) * project.stage.width) / rect.width,
            y: ((rect.bottom - e.clientY) * project.stage.height) / rect.height,
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
        designResizePreview = { ...before, ...next };
        paintResizePreview(designResizePreview);
        setStatus(placeText(next));
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
        el.form.removeEventListener('lostpointercapture', cancelPointer);
        if (activeDragCleanup === finish) activeDragCleanup = null;
        designResizePreview = null;
        if (el.form.hasPointerCapture?.(pointerId))
          try {
            el.form.releasePointerCapture(pointerId);
          } catch (_) {}
        let changed = false;
        try {
          if (!cancel) changed = commitResize(c, next);
        } catch (error) {
          log(error.message, 'error');
        }
        renderProperties();
        renderComponents();
        if (changed) refreshEditor();
        releaseShellPointer();
        if (cancel) setStatus('ばしょを かえるのを やめたよ');
        else if (changed) setStatus(placeText(c));
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
      activeDragCleanup = finish;
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancelPointer);
      window.addEventListener('keydown', key, true);
      window.addEventListener('blur', blur);
      el.form.addEventListener('lostpointercapture', cancelPointer);
      try {
        el.form.setPointerCapture(pointerId);
      } catch (_) {}
    }
    function startResize(ev, id, direction = 'se') {
      if (modelLocked() || ev.button !== 0 || ev.isPrimary === false) return;
      activeDragCleanup?.();
      const c = componentById(id);
      if (!designResizeMode(c)) return;
      clearTimeout(historyTimer);
      pushHistoryNow();
      const pointerId = ev.pointerId,
        before = { ...c },
        toStage = (e) => {
          const rect = el.form.getBoundingClientRect();
          return {
            x: ((e.clientX - rect.left) * project.stage.width) / rect.width,
            y: ((rect.bottom - e.clientY) * project.stage.height) / rect.height,
          };
        },
        start = toStage(ev), pressX = ev.clientX, pressY = ev.clientY, slop = pointerSlop(ev);
      let next = { x: c.x, y: c.y, w: c.w, h: c.h, scalePercent: c.scalePercent },
        finished = false,
        moved = false;
      // The handles keep their offset from the part for the whole drag (A-R2-05): the part counts as small (its corner
      // handles just outside it) as the handles were shown at the press.
      const pressSmall = designResizeSmall = designHandlesSmallShown(c);
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
        next = designResizeGeometry(before, direction, p.x - start.x, p.y - start.y, e.shiftKey || designRatioLocked);
        designResizePreview = { ...before, ...next };
        paintResizePreview(designResizePreview);
        setStatus(sizeText(next));
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
        el.form.removeEventListener('lostpointercapture', cancelPointer);
        if (activeDragCleanup === finish) activeDragCleanup = null;
        designResizePreview = null;
        designResizeSmall = null;
        if (el.form.hasPointerCapture?.(pointerId))
          try {
            el.form.releasePointerCapture(pointerId);
          } catch (_) {}
        let changed = false;
        try {
          if (!cancel) changed = commitResize(c, next);
        } catch (error) {
          log(error.message, 'error');
        }
        // A part that was small at the press keeps its corner handles just outside it, so the handle stays under the
        // pointer; one that became small gets them now, so its handles do not lie on each other.
        if (changed) designHandlesShown = { key: designHandleKey(c), small: pressSmall || designHandlesSmall(c) };
        renderProperties();
        renderComponents();
        if (changed) refreshEditor();
        releaseShellPointer();
        if (cancel)
          setStatus(
            '大きさを かえるのを やめたよ',
          );
        else setStatus(changed ? sizeText(c) : '大きさは かわって いないよ');
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
      activeDragCleanup = finish;
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancelPointer);
      window.addEventListener('keydown', key, true);
      window.addEventListener('blur', blur);
      el.form.addEventListener('lostpointercapture', cancelPointer);
      try {
        el.form.setPointerCapture(pointerId);
      } catch (_) {}
    }
    function duplicateSelectedComponent() {
      if (modelLocked() || selectedId === 'stage' || !flushActiveEditor()) return;
      const source = componentById(selectedId);
      if (!source) return;
      try {
        if (project.components.length >= LIMITS.components)
          throw new AkariError('F504', '部品が いっぱいで、もう ふやせません。いらない部品を けして ください');
        const next = cloneDesignProject(project), copy = cloneDesignProject(source), ids = allIds(),
          names = new Set(project.components.map(c => c.name));
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
        serializeProject(next, assetStore);
        clearTimeout(historyTimer);
        pushHistoryNow();
        project = next;
        selectedId = copy.id;
        currentEvent = 'start';
        selectedScriptId = null;
        markDirty();
        renderAll();
        loadEditor();
        refreshEditor();
        clearTimeout(historyTimer);
        pushHistoryNow();
        setStatus(`「${source.name}」の 見た目のコピー「${copy.name}」を 作ったよ`);
      } catch (error) {
        log(`${error.code || ''} 見た目のコピーを 作れませんでした: ${error.message}`, 'error');
        setStatus('見た目のコピーを 作れなかったよ');
      }
    }
    function deleteSelectedComponent() {
      if (modelLocked() || selectedId === 'stage' || !flushActiveEditor()) return;
      const c = componentById(selectedId);
      if (!c) return;
      if (!allowResourceDelete('component:' + c.id, $('#properties'), c.id)) return;
      if (!confirm('「' + c.name + '」を けす？')) return;
      clearTimeout(historyTimer);
      pushHistoryNow();
      const id = c.id;
      project.components = project.components.filter((x) => x.id !== id);
      project.scripts = project.scripts.filter((x) => x.targetId !== id);
      selectedId = 'stage';
      currentEvent = 'start';
      selectedScriptId = null;
      compactCurrentAssets();
      revokeDesignUrls();
      markDirty();
      renderAll();
      loadEditor();
      refreshEditor();
      pushHistoryNow();
      setStatus(`「${c.name}」を けしたよ`);
    }
    const STANDARD_SPRITES = Object.freeze({
      akariMascot: STANDARD_AKARI_MASCOT,
      dango: Object.freeze({ name: 'だんご', value: '', fg: '#f5a000', kind: 'image',
        assetId: DANGO_MASCOT_ASSET_ID, w: 180, h: 180 }),
      // 図形・模様
      star: Object.freeze({ name: '星', value: '★', fg: '#f5a000' }),
      whiteStar: Object.freeze({ name: '白い星', value: '☆', fg: '#f5a000' }),
      fourStar: Object.freeze({ name: '四つ星', value: '✦', fg: '#f5a000' }),
      whiteFourStar: Object.freeze({ name: '白い四つ星', value: '✧', fg: '#f5a000' }),
      circledStar: Object.freeze({ name: '丸星', value: '✪', fg: '#f5a000' }),
      asterisk: Object.freeze({ name: '光', value: '✱', fg: '#e89a00' }),
      florette: Object.freeze({ name: '花', value: '✿', fg: '#e83e63' }),
      circle: Object.freeze({ name: '丸', value: '●', fg: '#2f6fd6' }),
      whiteCircle: Object.freeze({ name: '白丸', value: '○', fg: '#2f6fd6' }),
      fisheye: Object.freeze({ name: '目玉', value: '◉', fg: '#2563eb' }),
      bullseye: Object.freeze({ name: 'まと', value: '◎', fg: '#dc2626' }),
      triangle: Object.freeze({ name: '三角', value: '▲', fg: '#e05252' }),
      whiteTriangle: Object.freeze({ name: '白三角', value: '△', fg: '#e05252' }),
      downTriangle: Object.freeze({ name: '下三角', value: '▼', fg: '#e05252' }),
      whiteDownTriangle: Object.freeze({ name: '白下三角', value: '▽', fg: '#e05252' }),
      square: Object.freeze({ name: '四角', value: '■', fg: '#4b5563' }),
      whiteSquare: Object.freeze({ name: '白四角', value: '□', fg: '#4b5563' }),
      diamond: Object.freeze({ name: 'ひし形', value: '◆', fg: '#7c3aed' }),
      whiteDiamond: Object.freeze({ name: '白ひし形', value: '◇', fg: '#7c3aed' }),
      diamondX: Object.freeze({ name: 'きらめき', value: '❖', fg: '#7c3aed' }),
      blackPentagon: Object.freeze({ name: '五角形', value: '⬟', fg: '#0f766e' }),
      blackHexagon: Object.freeze({ name: '六角形', value: '⬢', fg: '#0f766e' }),
      whiteHexagon: Object.freeze({ name: '白六角形', value: '⬡', fg: '#0f766e' }),
      heart: Object.freeze({ name: 'ハート', value: '♥', fg: '#e83e63' }),
      whiteHeart: Object.freeze({ name: '白ハート', value: '♡', fg: '#e83e63' }),
      spade: Object.freeze({ name: 'スペード', value: '♠', fg: '#334155' }),
      whiteSpade: Object.freeze({ name: '白スペード', value: '♤', fg: '#334155' }),
      club: Object.freeze({ name: 'クラブ', value: '♣', fg: '#166534' }),
      whiteClub: Object.freeze({ name: '白クラブ', value: '♧', fg: '#166534' }),
      suitDiamond: Object.freeze({ name: 'ダイヤ', value: '♦', fg: '#dc2626' }),
      whiteSuitDiamond: Object.freeze({ name: '白ダイヤ', value: '♢', fg: '#dc2626' }),
      heavyCross: Object.freeze({ name: '十字', value: '✚', fg: '#dc2626' }),
      circledPlus: Object.freeze({ name: '丸プラス', value: '⊕', fg: '#2563eb' }),
      circledTimes: Object.freeze({ name: '丸ばつ', value: '⊗', fg: '#dc2626' }),
      // 自然・天気
      sun: Object.freeze({ name: '太陽', value: '☀', fg: '#e89a00' }),
      whiteSun: Object.freeze({ name: '白い太陽', value: '☼', fg: '#e89a00' }),
      cloud: Object.freeze({ name: '雲', value: '☁', fg: '#6b7280' }),
      umbrella: Object.freeze({ name: 'かさ', value: '☂', fg: '#2563eb' }),
      rainUmbrella: Object.freeze({ name: '雨がさ', value: '☔', fg: '#2563eb' }),
      snowman: Object.freeze({ name: '雪だるま', value: '☃', fg: '#2563eb' }),
      comet: Object.freeze({ name: 'ほうき星', value: '☄', fg: '#7c3aed' }),
      lightning: Object.freeze({ name: 'かみなり', value: '⚡', fg: '#d97706' }),
      snowflake: Object.freeze({ name: '雪', value: '❄', fg: '#0ea5e9' }),
      snowflake2: Object.freeze({ name: '雪2', value: '❅', fg: '#0ea5e9' }),
      snowflake3: Object.freeze({ name: '雪3', value: '❆', fg: '#0ea5e9' }),
      shamrock: Object.freeze({ name: 'クローバー', value: '☘', fg: '#16a34a' }),
      hotSpring: Object.freeze({ name: 'おんせん', value: '♨', fg: '#dc2626' }),
      firstMoon: Object.freeze({ name: '月', value: '☽', fg: '#475569' }),
      lastMoon: Object.freeze({ name: '反対の月', value: '☾', fg: '#475569' }),
      // 顔・サイン
      face: Object.freeze({ name: 'えがお', value: '☺', fg: '#f59e0b' }),
      sadFace: Object.freeze({ name: '悲しい顔', value: '☹', fg: '#64748b' }),
      blackFace: Object.freeze({ name: '黒い顔', value: '☻', fg: '#334155' }),
      peace: Object.freeze({ name: 'ピース', value: '☮', fg: '#0f766e' }),
      yinYang: Object.freeze({ name: 'いんよう', value: '☯', fg: '#334155' }),
      check: Object.freeze({ name: 'チェック', value: '✓', fg: '#16a34a' }),
      heavyCheck: Object.freeze({ name: '太いチェック', value: '✔', fg: '#16a34a' }),
      cross: Object.freeze({ name: 'ばつ', value: '✗', fg: '#dc2626' }),
      heavyX: Object.freeze({ name: '太いばつ', value: '✘', fg: '#dc2626' }),
      flag: Object.freeze({ name: 'はた', value: '⚑', fg: '#475569' }),
      whiteFlag: Object.freeze({ name: '白いはた', value: '⚐', fg: '#475569' }),
      warning: Object.freeze({ name: '注意', value: '⚠', fg: '#d97706' }),
      skull: Object.freeze({ name: 'どくろ', value: '☠', fg: '#334155' }),
      medical: Object.freeze({ name: 'お医者さんのしるし', value: '⚕', fg: '#0f766e' }),
      recycle: Object.freeze({ name: 'リサイクル', value: '♻', fg: '#16a34a' }),
      radioactive: Object.freeze({ name: 'ほうしゃせん', value: '☢', fg: '#d97706' }),
      biohazard: Object.freeze({ name: 'バイオハザード', value: '☣', fg: '#7c3aed' }),
      question: Object.freeze({ name: 'はてな', value: '❓', fg: '#2563eb' }),
      exclamation: Object.freeze({ name: 'びっくり', value: '❗', fg: '#dc2626' }),
      infinity: Object.freeze({ name: 'むげん', value: '∞', fg: '#7c3aed' }),
      // 音・ゲーム
      quarterNote: Object.freeze({ name: '四分音ぷ', value: '♩', fg: '#8b5cf6' }),
      note: Object.freeze({ name: '音ぷ', value: '♪', fg: '#8b5cf6' }),
      notes: Object.freeze({ name: 'つながった音ぷ', value: '♫', fg: '#8b5cf6' }),
      sixteenthNotes: Object.freeze({ name: '十六分音ぷ', value: '♬', fg: '#8b5cf6' }),
      flat: Object.freeze({ name: 'フラット', value: '♭', fg: '#475569' }),
      natural: Object.freeze({ name: 'ナチュラル', value: '♮', fg: '#475569' }),
      sharp: Object.freeze({ name: 'シャープ', value: '♯', fg: '#475569' }),
      whiteChessKing: Object.freeze({ name: '王', value: '♔', fg: '#b45309' }),
      whiteChessQueen: Object.freeze({ name: '女王', value: '♕', fg: '#b45309' }),
      whiteChessRook: Object.freeze({ name: 'おしろ', value: '♖', fg: '#b45309' }),
      whiteChessBishop: Object.freeze({ name: 'おぼうさん', value: '♗', fg: '#b45309' }),
      whiteChessKnight: Object.freeze({ name: '馬', value: '♘', fg: '#b45309' }),
      whiteChessPawn: Object.freeze({ name: 'へいたい', value: '♙', fg: '#b45309' }),
      blackChessKing: Object.freeze({ name: '黒王', value: '♚', fg: '#334155' }),
      blackChessQueen: Object.freeze({ name: '黒女王', value: '♛', fg: '#334155' }),
      blackChessRook: Object.freeze({ name: '黒いおしろ', value: '♜', fg: '#334155' }),
      blackChessBishop: Object.freeze({ name: '黒いおぼうさん', value: '♝', fg: '#334155' }),
      blackChessKnight: Object.freeze({ name: '黒馬', value: '♞', fg: '#334155' }),
      blackChessPawn: Object.freeze({ name: '黒いへいたい', value: '♟', fg: '#334155' }),
      die1: Object.freeze({ name: 'さいころ1', value: '⚀', fg: '#334155' }),
      die2: Object.freeze({ name: 'さいころ2', value: '⚁', fg: '#334155' }),
      die3: Object.freeze({ name: 'さいころ3', value: '⚂', fg: '#334155' }),
      die4: Object.freeze({ name: 'さいころ4', value: '⚃', fg: '#334155' }),
      die5: Object.freeze({ name: 'さいころ5', value: '⚄', fg: '#334155' }),
      die6: Object.freeze({ name: 'さいころ6', value: '⚅', fg: '#334155' }),
      soccer: Object.freeze({ name: 'サッカー', value: '⚽', fg: '#334155' }),
      baseball: Object.freeze({ name: '野球', value: '⚾', fg: '#dc2626' }),
      golf: Object.freeze({ name: 'ゴルフ', value: '⛳', fg: '#16a34a' }),
      // もの・乗り物
      phone: Object.freeze({ name: '電話', value: '☎', fg: '#334155' }),
      whitePhone: Object.freeze({ name: '白い電話', value: '☏', fg: '#334155' }),
      mail: Object.freeze({ name: '手紙', value: '✉', fg: '#2563eb' }),
      scissors: Object.freeze({ name: 'はさみ', value: '✂', fg: '#475569' }),
      pencil: Object.freeze({ name: 'えんぴつ', value: '✎', fg: '#b45309' }),
      blackPencil: Object.freeze({ name: '黒いえんぴつ', value: '✏', fg: '#b45309' }),
      penNib: Object.freeze({ name: 'ペン先', value: '✒', fg: '#475569' }),
      plane: Object.freeze({ name: 'ひこうき', value: '✈', fg: '#0f766e' }),
      anchor: Object.freeze({ name: 'いかり', value: '⚓', fg: '#0369a1' }),
      sailboat: Object.freeze({ name: 'ヨット', value: '⛵', fg: '#0369a1' }),
      ferry: Object.freeze({ name: '船', value: '⛴', fg: '#0369a1' }),
      tent: Object.freeze({ name: 'テント', value: '⛺', fg: '#16a34a' }),
      fuel: Object.freeze({ name: 'ガソリン', value: '⛽', fg: '#dc2626' }),
      house: Object.freeze({ name: '家', value: '⌂', fg: '#b45309' }),
      coffee: Object.freeze({ name: 'カップ', value: '☕', fg: '#92400e' }),
      watch: Object.freeze({ name: 'うで時計', value: '⌚', fg: '#475569' }),
      hourglass: Object.freeze({ name: 'すな時計', value: '⌛', fg: '#a16207' }),
      keyboard: Object.freeze({ name: 'キーボード', value: '⌨', fg: '#475569' }),
      gear: Object.freeze({ name: '歯車', value: '⚙', fg: '#475569' }),
      hammerPick: Object.freeze({ name: 'ハンマー', value: '⚒', fg: '#92400e' }),
      swords: Object.freeze({ name: 'けん', value: '⚔', fg: '#475569' }),
      scales: Object.freeze({ name: 'てんびん', value: '⚖', fg: '#b45309' }),
      alembic: Object.freeze({ name: 'フラスコ', value: '⚗', fg: '#0f766e' }),
      atom: Object.freeze({ name: '原子', value: '⚛', fg: '#2563eb' }),
      // 方向・操作
      left: Object.freeze({ name: '左やじるし', value: '←', fg: '#2563eb' }),
      up: Object.freeze({ name: '上やじるし', value: '↑', fg: '#2563eb' }),
      right: Object.freeze({ name: '右やじるし', value: '→', fg: '#2563eb' }),
      down: Object.freeze({ name: '下やじるし', value: '↓', fg: '#2563eb' }),
      leftRight: Object.freeze({ name: '左右やじるし', value: '↔', fg: '#2563eb' }),
      upDown: Object.freeze({ name: '上下やじるし', value: '↕', fg: '#2563eb' }),
      upLeft: Object.freeze({ name: '左上', value: '↖', fg: '#2563eb' }),
      upRight: Object.freeze({ name: '右上', value: '↗', fg: '#2563eb' }),
      downRight: Object.freeze({ name: '右下', value: '↘', fg: '#2563eb' }),
      downLeft: Object.freeze({ name: '左下', value: '↙', fg: '#2563eb' }),
      doubleLeft: Object.freeze({ name: '二重左', value: '⇐', fg: '#0f766e' }),
      doubleUp: Object.freeze({ name: '二重上', value: '⇑', fg: '#0f766e' }),
      doubleRight: Object.freeze({ name: '二重右', value: '⇒', fg: '#0f766e' }),
      doubleDown: Object.freeze({ name: '二重下', value: '⇓', fg: '#0f766e' }),
      doubleLeftRight: Object.freeze({ name: '二重左右', value: '⇔', fg: '#0f766e' }),
      hookLeft: Object.freeze({ name: 'もどる', value: '↩', fg: '#7c3aed' }),
      hookRight: Object.freeze({ name: '進む', value: '↪', fg: '#7c3aed' }),
      turnLeft: Object.freeze({ name: '左回り', value: '↺', fg: '#7c3aed' }),
      turnRight: Object.freeze({ name: '右回り', value: '↻', fg: '#7c3aed' }),
      heavyRight: Object.freeze({ name: '太い右', value: '➜', fg: '#2563eb' }),
      arrowHead: Object.freeze({ name: '矢じり', value: '➤', fg: '#2563eb' }),
    });
    // x/y (a drop) is the new centre; without them the part is placed where it can be seen (newPartPlace).
    function addComponent(type, x = null, y = null, spritePreset = '') {
      if (modelLocked() || !flushActiveEditor()) return;
      clearTimeout(historyTimer);
      pushHistoryNow();
      if (modelLocked() || !['label', 'button', 'input', 'box', 'sprite'].includes(type)) return;
      if (project.components.length >= LIMITS.components) {
        log('部品が いっぱいで、もう ふやせません。いらない部品を けして ください', 'error');
        setStatus('キャラクターや 部品が いっぱいで、もう ふやせないよ。いらない ものを けしてね');
        return;
      }
      const preset =
          type === 'sprite' ? STANDARD_SPRITES[spritePreset] || STANDARD_SPRITES.star : null,
        names = { label: '文字', button: 'ボタン', input: '入力らん', box: '四角' },
        nameBase = preset?.name || names[type];
      let n = 1,
        name = spritePreset === 'dango' ? nameBase : null;
      if (!name || project.components.some((c) => c.name === name)) {
        do {
          name = `${nameBase}${n++}`;
        } while (project.components.some((c) => c.name === name));
      }
      const id = ensureUniqueId(type),
        imagePreset = preset?.kind === 'image',
        w =
          type === 'input' ? 160 : type === 'box' ? 120 : type === 'sprite' ? preset.w || 70 : 120,
        h = type === 'box' ? 80 : type === 'sprite' ? preset.h || 70 : 32,
        auto = x === null || y === null,
        place = auto
          ? newPartPlace(project.components, project.stage, w, h, { x: 80 + w / 2, y: project.stage.height - 80 - h / 2 })
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
        const co = ensureUniqueId('costume');
        if (imagePreset) {
          const builtin = spritePreset === 'dango' ? dangoMascotAssetRecord() : defaultMascotAssetRecord(),
            store = new AssetStore(assetStore.snapshotRefs()),
            same = store.findByDigest(
              'image',
              builtin.sha256,
              builtin.byteLength,
              builtin.bytes,
            );
          let assetId = same?.id;
          if (!assetId) {
            assetId = store.has(builtin.id)
              ? ensureUniqueId(spritePreset === 'dango' ? 'asset-dango-mascot' : 'asset-akari-mascot')
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
            validateAssetReferences({ ...project, components: [...project.components, base] }, store);
          } catch (error) {
            log(`${error.code || ''} キャラクターを おけません: ${error.message}`, 'error');
            setStatus('キャラクターを おけなかったよ');
            return;
          }
          assetStore = store;
        } else base.costumes = [{ id: co, name: preset.name, kind: 'text', value: preset.value }];
        base.costumeId = co;
      }
      project.components.push(base);
      markDirty();
      selectObject(id);
      const placed = designBox(base);
      if (placed.right <= 0 || placed.left >= project.stage.width || placed.top <= 0 || placed.bottom >= project.stage.height)
        setStatus(`「${name}」は 画面の 外に あるよ。「せってい」の「よこのばしょ」・「たてのばしょ」で もどせるよ`);
      else if (auto) setStatus(`「${name}」を おいたよ。いま 動かすものは「${name}」だよ`);
    }

    let activeFailureId = null,
      valueView = null;
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
        b.textContent = monitorValue(v);
        if (Array.isArray(v) || (typeof v === 'string' && cpLen(v) > 160) || displayValue(v).rounded) {
          const full = document.createElement('button');
          full.textContent = isNumberValue(v) ? 'もとの数' : '全部';
          full.setAttribute('aria-label', k + (isNumberValue(v) ? 'の もとの 数（ふだんは 数を 短くして 見せているよ）' : 'の 全部'));
          const copy = Array.isArray(v) ? v.slice() : v;
          full.onclick = () => showFullValue(k, copy);
          b.appendChild(full);
        }
        row.append(a, b);
        d.appendChild(row);
      }
      root.appendChild(d);
    }
    function showFullValue(label, value) {
      closeRuntimeInspector();
      valueView = { label, value, index: 0, page: 0 };
      renderFullValue();
      $('#valueModal').classList.add('show');
    }
    function renderFullValue() {
      if (!valueView) return;
      const v = valueView,
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
    function showFailureDetails(id = null) {
      closeRuntimeInspector();
      const records = scheduler?.errorRecords || [];
      if (!records.length) return;
      scheduler.pause();
      activeFailureId = id ?? records.at(-1).id;
      const select = $('#failureSelect');
      select.textContent = '';
      const entry = document.body.dataset.uiLevel === 'entry';
      for (const r of [...records].reverse()) {
        const option = document.createElement('option');
        option.value = String(r.id);
        // はじめて shows no numbers: the place is the part, the きっかけ and the sentence.
        option.textContent = (entry ? '' : '#' + r.id + ' ') + diagnosticLocation(r);
        select.appendChild(option);
      }
      select.value = String(activeFailureId);
      // The stop's place is marked on the body before the help says so (the paint waits for the next frame otherwise).
      flushRuntimePaint();
      renderFailureDetails();
      $('#failureModal').classList.add('show');
    }
    function renderFailureDetails() {
      const r = scheduler?.errorRecords.find((x) => x.id === activeFailureId),
        root = $('#failureBody');
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
      place.textContent = diagnosticLocation(r); why.textContent = childDiagnosticText(r, diagnosticSource(r), project);
      reason.append(place, why);
      const latest = r.id === scheduler.errorRecords.at(-1)?.id, sentence = diagnosticSentence(r),
        framed = latest && !!document.querySelector('#blockEditor .blockui-current');
      next.textContent = !entry ? '「とじる」の あと、「本文を見て たしかめる」で やることを たしかめられるよ。書きなおす ときは「■ 止める」を おしてから なおしてね。'
        : framed ? '「とじる」を おしてから「■ 止める」を おして、オレンジの わくの ところを なおしてね。'
        : '「とじる」を おしてから「■ 止める」を おして、' + (sentence ? '「' + sentence + '」の ブロックを なおしてね。' : 'この ブロックを なおしてね。');
      help.append(lead, reason, next);
      root.append(help);
      const details = appendDiagnosticDetails(root, r, `${r.code}: ${r.message}\n${r.key} / ${r.line}\u884c\n${r.statement}\n${r.callStack.join(' \u2192 ')}`);
      details.querySelector('pre').className = 'failure-summary';
      const repair = quotedListRepair(r);
      if (repair) {
        const help = document.createElement('p');
        help.textContent = `ここは 文字だよ。リスト「${r.quotedList.name}」を 使う？`;
        const edit = document.createElement('button');
        edit.id = 'failureEditList';
        edit.textContent = '止めて、ここの リストを えらぶ';
        edit.onclick = () => openQuotedListRepair(r);
        root.append(help, edit);
      }
      const failedId = r.actor?.baseId || r.targetId, failedTarget = targetById(failedId),
        failedKind = !failedTarget || failedId === 'stage' ? '画面' : failedTarget.type === 'sprite' ? 'キャラクター' : '部品';
      renderMonitorSection(root, 'うまく いかなかった ときの ようす', [
        [`動いていた ${failedKind}`, failedTarget?.name || '画面'],
        ['きっかけ', runtimeEventText(r.eventType, r.key)],
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
        const expression = parseExpression(original, buildSymbols(project));
        if (expression.kind !== 'StringLiteral' || expression.value !== record.quotedList.name) return null;
      } catch (_) { return null; }
      return { start, end, original };
    }
    function quotedListCandidates(record) {
      const actor = project.components.find(c => c.id === record.quotedList.targetId), candidates = [];
      for (const [owner, lists, qualifier] of [
        ['作品', project.projectData.lists, 'project'],
        [actor?.name, actor?.localData.lists || [], 'self'],
      ]) for (const list of lists) candidates.push({ id:list.id, owner,
        label:`${owner}のリスト「${list.name}」`,
        source:nameSource(list.name, qualifier) });
      return candidates;
    }
    function openQuotedListRepair(record) {
      // Hidden controls from an older run must not discard a current editor draft.
      if (!scheduler?.paused || !scheduler.errorRecords.includes(record)) return;
      const range = quotedListRepair(record);
      if (!range) return;
      stopRun();
      const ownerKey = record.quotedList.ownerKey, script = scriptBySourceKey(project, ownerKey);
      if (!script) { setStatus('この 本文は もう ないよ。いまの 本文を たしかめてね'); return; }
      selectedId = script.targetId; currentEvent = script.event; selectedScriptId = script.id || null;
      hideSourceOverview(); renderSelectors(); loadEditor(); switchEditorMode(mainEditor, 'code');
      const token = generationToken, panel = document.createElement('section');
      panel.id = 'listRepairPanel'; panel.className = 'editor-pending';
      panel.setAttribute('aria-label', 'うまく いかなかった 文字を リストに 直す');
      panel.style.cssText = 'flex:none;max-height:210px;overflow:auto;overflow-wrap:anywhere';
      const explanation = document.createElement('p'), preview = document.createElement('p'),
        select = document.createElement('select'), apply = document.createElement('button'),
        cancel = document.createElement('button'), notice = document.createElement('p');
      explanation.textContent = `ここは 文字だよ。リスト「${record.quotedList.name}」を 使う？`;
      preview.textContent = `${targetById(script.targetId)?.name || '画面'}・${eventText(script.event, script.filter) || script.event}の本文、${record.quotedList.span.startLine}行目の ${range.original} だけを かえます。番目・秒数・ほかの文・リストの中身は そのままです。`;
      select.id = 'listRepairChoice'; select.setAttribute('aria-label', 'ここで 使う リスト');
      select.style.maxWidth = '100%';
      const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '使う リストを えらぶ'; select.append(placeholder);
      const candidates = quotedListCandidates(record);
      for (const [index, candidate] of candidates.entries()) {
        const option = document.createElement('option'); option.value = String(index); option.textContent = candidate.label; select.append(option);
      }
      apply.id = 'listRepairApply'; apply.textContent = 'ここだけ 入れかえる'; apply.disabled = true;
      cancel.id = 'listRepairCancel'; cancel.textContent = 'やめる'; cancel.onclick = () => panel.remove();
      notice.id = 'listRepairNotice'; notice.setAttribute('role', 'status');
      if (!candidates.length) notice.textContent = 'ここで 使える リストは ありません。へんすう・リストの ボタンで 作ってから、もう一度 動かして ください。';
      select.disabled = !candidates.length;
      const sourceIsCurrent = () => !modelLocked() && generationToken === token &&
        bindingOwner(mainEditor) === ownerKey && readSource(mainEditor) === record.source &&
        el.editor.value === record.source.replace(/\r\n?/g, '\n') && !hasPendingEditor();
      const stale = () => { notice.textContent = 'うまく いかなかった あとに、本文や 動きが かわりました。いまの 本文を たしかめて、もう一度 動かしてから えらびなおして ください。'; apply.disabled = true; };
      select.onchange = () => {
        if (!sourceIsCurrent()) { stale(); return; }
        const candidate = candidates[Number(select.value)]; apply.disabled = select.value === '';
        notice.textContent = select.value === '' ? '' : `${range.original} → ${candidate.source}`;
      };
      apply.onclick = () => {
        if (!sourceIsCurrent()) { stale(); return; }
        const candidate = select.value === '' ? null : candidates[Number(select.value)],
          current = candidate && quotedListCandidates(record).find(c => c.id === candidate.id && c.source === candidate.source && c.owner === candidate.owner);
        if (!current) { notice.textContent = 'えらんだ リストが かわりました。もう一度 動かしてから、えらびなおして ください。'; apply.disabled = true; return; }
        try {
          const source = record.source.slice(0, range.start) + current.source + record.source.slice(range.end);
          if (!commitSource(mainEditor, source, {atomic:true})) return;
          el.editor.value = source; refreshEditor(); panel.remove();
          el.editor.focus();
          const start = record.source.slice(0, range.start).replace(/\r\n?/g, '\n').length;
          el.editor.setSelectionRange(start, start + current.source.length);
          setStatus('えらんだ ところを リストに 直したよ。「▶ 動かす」で たしかめてね');
        } catch (error) { notice.textContent = error.message; }
      };
      panel.append(explanation, preview, select, apply, cancel, notice);
      el.editor.closest('.editor-shell').before(panel);
      if (sourceIsCurrent()) {
        const start = record.source.slice(0,range.start).replace(/\r\n?/g,'\n').length;
        el.editor.setSelectionRange(start, start + range.original.replace(/\r\n?/g,'\n').length);
      } else stale();
      select.focus();
    }

    // Extension data that the extension keeps in the work (state.persist "project") stays between runs.
    // Show it while stopped, with one button that returns it to the extension's initial value.
    function renderKeptExtensionData() {
      const kept = EXTENSION_HOST.stateInfo().filter(item => item.persist === 'project');
      if (!kept.length) return;
      const saved = project.extensions?.state || EXTENSION_HOST.initialState(),
        initial = EXTENSION_HOST.initialState();
      renderMonitorSection(el.monitor, '作品に ほぞんされる かくちょうの 中身', kept.map(item => [item.name,
        JSON.stringify((saved.find(value => value.id === item.id) || initial.find(value => value.id === item.id))?.value ?? null)]));
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'monitor-extension-reset';
      reset.textContent = 'かくちょうの 中身を はじめに もどす';
      reset.onclick = () => {
        if (runtime || modelLocked()) return;
        EXTENSION_HOST.resetState();
        project.extensions = { ...EXTENSION_HOST.requirements(), profile: AKARI_RUNTIME.profiles.requirement(), state: EXTENSION_HOST.snapshotState() };
        pushHistoryNow();
        renderMonitor();
        log('かくちょうの 中身を はじめに もどしました', 'ok');
      };
      el.monitor.appendChild(reset);
    }
    // What one running body does now, as Akari says it (1秒 待っているよ, 話しているよ, 答えを 待っているよ). A timed wait
    // names the time still to wait on the run's clock.
    function taskStateText(task) {
      if (task.state === 'BLOCKED') {
        const reason = task.blockReason || {};
        if (reason.kind === 'time' && reason.speechToken) return '話しているよ';
        if (reason.kind === 'time' && Number.isFinite(reason.deadline) && !reason.frame && typeof runtime?.now === 'function') {
          const left = Math.max(0, Math.ceil((reason.deadline - runtime.now()) / 100) / 10);
          return `${left}秒 待っているよ`;
        }
        return { condition: 'そう なるまで 待って いるよ', question: '答えを 待っているよ', waitGroup: 'ほかの 動きが おわるのを 待っているよ',
          glide: '時間を かけて 動いているよ', moveUntil: '動いているよ' }[reason.kind] || '待っているよ';
      }
      return { PAUSED: 'いったん 止めたよ', DONE: 'おわったよ', ERROR: '直す ところが あるよ', CANCELLED: '止めたよ' }[task.state] || '動いているよ';
    }
    function renderMonitor() {
      el.monitor.textContent = '';
      if (!runtime) {
        const d = document.createElement('div');
        d.className = 'monitor-empty';
        d.textContent = '止まって いるよ';
        el.monitor.appendChild(d);
        renderKeptExtensionData();
        return;
      }
      const section = (title, rows) => renderMonitorSection(el.monitor, title, rows),
        records = scheduler?.errorRecords || [];
      if (records.length) {
        const last = records.at(-1),
          button = document.createElement('button');
        button.className = 'failure-open';
        button.textContent = `動きが 止まった きろくを 見る（${records.length}こ）`;
        button.onclick = () => showFailureDetails();
        el.monitor.appendChild(button);
        // 動きのようす speaks in Akari's voice (F-18): the reason, in the language's polite words, is in the record.
        section('さいごに うまく いかなかった とき', [
          ['直す手がかり', 'わけは「動きが 止まった きろくを 見る」で 見られるよ'],
          ['ばしょ', diagnosticLocation(last)],
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
        ...runtime.projectVars,
        ...runtime.projectLists,
      ]);
      const tasks = scheduler ? [...scheduler.tasks.values()] : [],
        live = tasks.filter((t) => !['DONE', 'CANCELLED', 'ERROR'].includes(t.state)),
        focus = scheduler?.tasks.get(activeTaskId) || live[0] || tasks[0];
      // はじめて and かんたん show what a child can see: how many bodies run now and what the chosen one does, in
      // Akari's own words. くわしく adds the scheduler's counts.
      section('いまの 動き', [
        ['いま 動いている 本文', live.length ? `${live.length}こ` : 'ないよ'],
        ...(focus ? [
          ['ようす', taskStateText(focus)],
          ['きっかけ', `${meijinTextLabel(focus.scriptId ? runningScript('script:' + focus.scriptId) : null)||targetById(focus.targetId)?.name||'作品'} / ${runtimeEventText(focus.eventType, focus.scriptId ? 'script:' + focus.scriptId : null)}`],
        ] : []),
      ]);
      if (document.body.dataset.uiLevel === 'advanced')
        section('動きの かず', [
          ['じゅんばんを 待って いる', tasks.filter((t) => t.state === 'READY').length],
          ['何かを 待っている', tasks.filter((t) => t.state === 'BLOCKED').length],
        ]);
      if (selectedId !== 'stage') {
        const a = runtime.actor(selectedId);
        if (a)
          section(componentById(selectedId)?.name || selectedId, [
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
      const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('pre');summary.textContent='動きの くわしい きろく';text.textContent=tasks.map(t=>`${t.targetId}: ${t.state}`).join('\n');details.append(summary);renderMonitorSection(details,'同じ 動きに するための かず',[['どれかを えらぶ たね',runtime.runSeed]]);details.append(text);el.monitor.append(details);
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

    let codeLineLayout = null, codeLineMeasure = null;
    // A line's wrapped height depends only on its text and the editor's width and font (the key): a line measured once
    // is not laid out again, so a keystroke measures the lines it changed, not the whole body (PERF-R2-03). A font that
    // finishes loading measures again.
    let codeLineHeights = { key: '', heights: new Map() };
    document.fonts?.addEventListener?.('loadingdone', () => { codeLineHeights = { key: '', heights: new Map() }; codeLineLayout = null; });
    function wrappedCodeLines() {
      const editor = el.editor, style = getComputedStyle(editor),
        width = Math.max(1, editor.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)),
        key = [width, style.font, style.letterSpacing, style.lineHeight, style.tabSize].join('|');
      if (codeLineLayout?.source === editor.value && codeLineLayout.key === key) return codeLineLayout;
      if (!codeLineMeasure) {
        codeLineMeasure = document.createElement('div');
        codeLineMeasure.setAttribute('aria-hidden', 'true');
        document.body.append(codeLineMeasure);
      }
      if (codeLineHeights.key !== key || codeLineHeights.heights.size > 50000) {
        codeLineHeights = { key, heights: new Map() };
        Object.assign(codeLineMeasure.style, { position:'fixed', left:'-100000px', top:'0', visibility:'hidden',
          pointerEvents:'none', width:width+'px', font:style.font, letterSpacing:style.letterSpacing,
          lineHeight:style.lineHeight, tabSize:style.tabSize, whiteSpace:'pre-wrap', overflowWrap:'anywhere' });
      }
      const known = codeLineHeights.heights, texts = editor.value.split('\n'), fragment = document.createDocumentFragment(), fresh = [];
      for (const text of texts) {
        if (known.has(text)) continue;
        const row = document.createElement('div'); row.textContent = text || '\u200b';
        known.set(text, 0); fresh.push([text, row]); fragment.append(row);
      }
      if (fresh.length) {
        codeLineMeasure.replaceChildren(fragment);
        for (const [text, row] of fresh) known.set(text, Math.max(22, row.getBoundingClientRect().height));
        codeLineMeasure.replaceChildren();
      }
      let height = 0;
      const lines = texts.map(text => { const top = height; height += known.get(text); return { top, height:height-top }; });
      return codeLineLayout = { source:editor.value, key, lines, height };
    }
    let gutterMarks = { errors: [], notices: [] };
    function updateGutter(errors = [], notices = mainEditor.session?.notices || []) {
      gutterMarks = { errors, notices };
      // A code view that is not on the screen (the block view) has no width to lay its lines out in: it is laid out when
      // it is shown (the observer below), not with every character on a line of its own.
      if (!el.editor.clientWidth) return;
      const layout = wrappedCodeLines(), count = layout.lines.length,
        key = bindingOwner(mainEditor),
        active = activeLoc?.key === key ? activeLoc.line : 0,
        errs = new Set(errors.map((x) => x.line)), noticeLines = new Set(notices.map((x) => x.line));
      for (const mark of [activeLoc, keptFail]) if (mark?.key === key && mark.error) errs.add(mark.line);
      let first = 1;
      while (first < count && layout.lines[first].top < el.editor.scrollTop - 220) first++;
      const last = Math.min(count, first + Math.ceil((el.editor.clientHeight || 500) / 22) + 25);
      el.gutter.textContent = '';
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
      el.gutter.appendChild(space);
      el.gutter.scrollTop = el.editor.scrollTop;
    }
    // Shown again after the block view, or given another width: the line numbers follow the lines.
    new ResizeObserver(() => { if (el.editor.clientWidth) updateGutter(gutterMarks.errors, gutterMarks.notices); }).observe(el.editor);
    function sourceLocation(task, node, error = null) {
      const frame = task.callFrames[task.callFrames.length - 1],
        def = frame ? project.actions.find((x) => x.name === frame.name) : null;
      return {
        targetId: task.targetId,
        event: task.eventType,
        scriptId: task.scriptId,
        key:
          error?.akariSource?.key ||
          (def ? `action:${def.id}` : task.scriptId ? `script:${task.scriptId}` : `script:${task.targetId}:${task.eventType}`),
        line: error?.line || node?.sourceSpan?.startLine || activeLoc?.line || 1,
        column: error?.column || node?.sourceSpan?.startColumn || 1,
        // The sentence the run strip shows: a statement ends on its line; a sentence with a body shows its first line.
        endLine: error ? null : node?.sourceSpan?.endLine ?? null,
        endColumn: error ? null : node?.sourceSpan?.endColumn ?? null,
        error: error || null,
      };
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
    function runningSentence(source, loc) {
      const line = String(source ?? '').split(/\r\n?|\n/)[loc.line - 1];
      if (line == null) return '';
      const chars = [...line], start = Math.max(0, (loc.column || 1) - 1),
        end = loc.endLine === loc.line && loc.endColumn >= loc.column ? loc.endColumn : chars.length;
      return chars.slice(start, end).join('').trim().replace(/[。、]$/, '');
    }
    // The body a running item comes from (a 名人 text's flows run as items of its own).
    function runningScript(scriptKey) {
      return scriptBySourceKey(project, compiled?.items?.find((item) => item.key === scriptKey)?.documentKey || scriptKey);
    }
    function meijinTextLabel(script) {
      return script && isMeijinScript(script) ? `名人の本文 ${meijinScripts().indexOf(script) + 1}` : null;
    }
    // follow: the editor shows the body of the sentence that runs (while paused, and when 本文を見て たしかめる opens).
    function paintExecutionLocation({ follow = !!scheduler?.paused } = {}) {
      if (!activeLoc) return;
      const loc = activeLoc,
        parts = loc.key.split(':'),
        scriptKey = parts[0] === 'script' ? loc.key
          : loc.scriptId ? `script:${loc.scriptId}` : `script:${loc.targetId}:${loc.event}`,
        sourceKey = compiled?.items?.find((item) => item.key === scriptKey)?.documentKey || scriptKey,
        script = scriptBySourceKey(project, sourceKey),
        def =
          parts[0] === 'action'
            ? project.actions.find((x) => x.id === parts[1])
            : parts[0] === 'function'
              ? project.functions.find((x) => x.id === parts[1])
              : null;
      // A 名人 text belongs to no part: its sentences are named by the text (名人の本文 1), not by their subject.
      const owner = def
          ? `${parts[0] === 'action' ? 'てじゅん' : '答えを もとめる'} ${def.name}`
          : meijinTextLabel(script) || targetById(loc.targetId)?.name || loc.targetId,
        label = document.body.dataset.uiLevel === 'entry' ? owner
          : def ? `${owner} / ${loc.line}行目` : `${owner} / ${runtimeEventText(loc.event, scriptKey)} / ${loc.line}行目`;
      paintRunStrip(label, runningSentence(def?.source ?? script?.source, loc));
      if (follow) {
        hideSourceOverview();
        // Runtime document units have their own IDs; editor selection belongs
        // to the complete source body that can be saved and restored.
        selectedId = script?.targetId || loc.targetId;
        currentEvent = script?.event || loc.event;
        selectedScriptId = script?.id || null;
        const src =
          def?.source ??
          script?.source ??
          '';
        debugSourceKey = loc.key;
        if (el.editor.value !== src) el.editor.value = src;
        renderSelectors();
        renderTree();
        renderProperties();
        if (loc.error) {
          showDiagnosticMessage(el.issue, loc.error, loc.line + '行目', null, src);
          el.issue.className = 'issue-error';
        }
      }
      getEditorSession(mainEditor);
      renderEditorBinding(mainEditor);
      if (mainEditor.session.mode === 'blocks' && mainEditor.session.ownerKey === loc.key)
        mainEditor.view.highlight(loc);
      updateGutter();
      if (follow) {
        const top = wrappedCodeLines().lines[loc.line - 1]?.top || 0;
        if (top < el.editor.scrollTop || top > el.editor.scrollTop + el.editor.clientHeight - 22)
          el.editor.scrollTop = Math.max(0, top - Math.floor(el.editor.clientHeight / 3));
        el.gutter.scrollTop = el.editor.scrollTop;
      }
    }
    function requestRuntimePaint(flags = 7) {
      runtimePaintFlags |= flags;
      if (scheduler?.paused) {
        flushRuntimePaint();
        return;
      }
      if (runtimePaintFrame === null) runtimePaintFrame = requestAnimationFrame(flushRuntimePaint);
    }
    function flushRuntimePaint() {
      if (runtimePaintFrame !== null) cancelAnimationFrame(runtimePaintFrame);
      runtimePaintFrame = null;
      const flags = runtimePaintFlags;
      runtimePaintFlags = 0;
      if (!runtime) return;
      if (flags & 1) {
        applyStage();
        renderComponents();
      }
      if (flags & 2) renderMonitor();
      if (flags & 4) paintExecutionLocation();
      // A flow ended or the run state changed (flag 2): the run may have ended by itself. A pause (stepping, or a stop by
      // an error) is not an end; the run ends there when it goes on and nothing is left. While nothing goes on but an
      // input can start a body again, the status says which input. After the end a body that starts again (on a touch,
      // say) brings 動いているよ back; after 作品を全部止める the scheduler takes no input.
      if (flags & 2 && scheduler?.running && !scheduler.paused) {
        if (runFinished) { if (!scheduler.idle()) resumeFinishedRun(); }
        else if (scheduler.ended()) finishRun();
        else if (scheduler.idle()) {
          // No sentence runs now: the strip says so until a body starts again.
          if (activeLoc) { activeLoc = null; paintRunStrip(); }
          showRunHint(restartHint());
        } else showRunHint('');
      }
    }
    // The run has ended (every body done, or 作品を全部止める). The run screen stays as it is, with its last picture (a
    // ふきだし that would go away by itself stays too), and shows only ■ 止める; the status says what to do next.
    function finishRun({ stoppedAll = false } = {}) {
      if ((runFinished && !stoppedAll) || !runtime || !['RUNNING', 'PAUSED'].includes(appState)) return;
      runFinished = true;
      runHint = '';
      appState = 'RUNNING';
      if (inspectorNodes.length) closeRuntimeInspector();
      activeLoc = null;
      stageView.keepBubbles();
      paintRunStrip();
      setStatus(stoppedAll ? '作品が 止まったよ。作る 画面に もどる ときは「■ 止める」を おしてね'
        : 'おわったよ。もう一度 動かすときは「■ 止める」を おしてから「▶ 動かす」を おしてね');
      updateRunState();
    }
    function resumeFinishedRun() {
      runFinished = false;
      setStatus('動いているよ');
      updateRunState();
    }
    // Nothing goes on, but an input can start a body again: the status names the first such body's input (the stage's
    // bodies first, then the parts' in the order they were made). A body that starts by itself later (〜秒ごとに, そう
    // なったとき) keeps 動いているよ. A body for an event of a running extension (合図「拡張:拡張ID/機能ID」 that the
    // extension registers) is started from outside the work, as a click or a key body is (lead decision P22 E2); any
    // other 「拡張:…」 name is an ordinary signal of the work.
    const RUN_HINT_KEYS = { 空白: 'スペース', 決定: 'エンター', 取消: 'エスケープ' };
    let runHint = '';
    const signalName = item => String((item.filter && typeof item.filter === 'object' ? item.filter.message : item.filter) ?? '');
    function waitsForExtension(item) {
      if (scheduler?.waitsForExtension) return scheduler.waitsForExtension(item);
      const name = signalName(item);
      return EXTENSION_HOST.active && item.event === 'message' && name.startsWith('拡張:') && !!EXTENSION_HOST.describe(name.slice(3), 'events');
    }
    function restartHint() {
      const items = compiled?.items || [],
        inputs = items.filter(item => ['click', 'keyDown', 'valueChanged'].includes(item.event) || waitsForExtension(item));
      if (!inputs.length || items.some(item => ['conditionTrue', 'interval'].includes(item.event))) return '';
      const order = id => id === 'stage' ? -1 : project.components.findIndex(c => c.id === id),
        item = inputs.reduce((first, next) => order(next.targetId) < order(first.targetId) ? next : first),
        name = targetById(item.targetId)?.name || project.stage.name;
      // The stage is 画面 here, as on はじめて's 「画面が おされたとき」 (F-23).
      if (item.event === 'click') return item.targetId === 'stage' ? '画面を おすと 動くよ' : `「${name}」を おすと 動くよ`;
      if (item.event === 'valueChanged') return `「${name}」に 入れると 動くよ`;
      if (item.event === 'message') return `「${signalName(item)}」の 合図を 受けると 動くよ`;
      const key = item.filter?.key;
      return key ? `「${RUN_HINT_KEYS[key] || key}」キーを おすと 動くよ` : 'キーを おすと 動くよ';
    }
    function showRunHint(text) {
      if (text === runHint) return;
      runHint = text;
      setStatus(text || '動いているよ');
    }

    // 作品チェックの知らせ at every level (p2 Q5 (d)): they are worked out for the whole work after a change, in a timer and
    // never on the input path, and shown where their sentence is: 「ⓘ 知らせ」 on the block (the block view draws it from
    // session.notices), the line number in blue and 「ⓘ N行目：…」 under the code. A mistake comes first: a body with a
    // mistake or with an edit not yet decided shows no notice. Until the work is checked again, a body whose text has not
    // changed keeps its notices and a changed body shows none. 作品チェック (くわしく・名人) keeps its list.
    let noticeKey = null, noticeWanted = null, noticeList = [], noticeTimer = 0, noticeSources = new Map(), pointedNotices = '';
    function noticeSourceOf(owner) {
      return scriptBySourceKey(project, owner)?.source ?? project.actions.find(a => owner === 'action:' + a.id)?.source
        ?? project.functions.find(f => owner === 'function:' + f.id)?.source ?? null;
    }
    function cachedNotices() {
      // Each change starts the wait again, so the work is checked once the child stops for a moment.
      const key = JSON.stringify(project);
      if (key !== noticeKey && key !== noticeWanted) {
        noticeWanted = key;
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(checkNotices, 150);
      }
      return noticeList.filter(d => noticeSources.get(d.owner) === noticeSourceOf(d.owner));
    }
    function checkNotices() {
      noticeTimer = 0;
      // Not while the work runs (its text does not change), and not while the child is in the middle of something in a
      // body (a field, a word being typed, a block carried): a little later.
      const busy = modelLocked() || [mainEditor, draftEditor].some(b => b.session?.pendingEdit || b.session?.blockDraft || b.view?.interactionActive())
        || composingEditors.has(el.editor) || composingEditors.has(draftEditor.textarea) || document.querySelector('.blockui-dragging');
      if (busy) { noticeTimer = setTimeout(checkNotices, 400); return; }
      noticeWanted = null;
      const key = JSON.stringify(project);
      if (key !== noticeKey) {
        let checked = { items: [], notes: [] };
        try { checked = compileProject(project); } catch (error) { if (!(error instanceof AkariError)) throw error; }
        // A 名人 text's flows are items of their own: a notice belongs to the body (the document) its item comes from.
        const owner = where => checked.items?.find(item => item.key === where)?.documentKey || where;
        noticeList = (checked.notes || []).map(d => ({ ...d, owner: owner(d.where) }));
        noticeSources = new Map(noticeList.map(d => [d.owner, noticeSourceOf(d.owner)]));
        noticeKey = key;
      }
      const shown = b => (b.session?.notices || []).map(d => d.line + ':' + d.code).join();
      for (const binding of [mainEditor, draftEditor]) {
        if (!binding.view || !binding.session) continue;
        if (shown(binding) === bodyNotices(binding.session).map(d => d.line + ':' + d.code).join()) continue;
        if (binding === mainEditor) refreshEditor(); else renderEditorBinding(binding);
      }
    }
    function bodyNotices(session) {
      // The run screen shows no notice (its marks are edit-screen controls), so a running work is not looked at for them.
      if (modelLocked() || !session || session.pendingEdit || session.blockDraft || session.diagnostics?.length || !session.syntaxAst) return [];
      return cachedNotices().filter(d => d.owner === session.ownerKey && noticeSources.get(d.owner) === session.sourceText)
        .sort((a, b) => (a.line || 0) - (b.line || 0) || (a.column || 0) - (b.column || 0));
    }
    // ■ 止める points to the notices of the run once: the same notices after the next run say only 止まって いるよ. A
    // notice in a body that is not shown names that body.
    function stopStatusWithNotices() {
      if (keptFail?.error) {
        const key = compiled?.items?.find(item => item.key === keptFail.key)?.documentKey || keptFail.key,
          shown = !sourceOverviewOpen && key === bindingOwner(mainEditor),
          place = shown && shownEditorMode() === 'code' && keptFail.line ? `コードの ${keptFail.line}行目`
            : shown && document.querySelector('#blockEditor .blockui-current') ? 'オレンジの わくの ところ'
            : diagnosticLocation({...keptFail, where: keptFail.key});
        return `止まって いるよ。${place}を なおしてね。`;
      }
      const notes = compiled?.notes || [], key = notes.map(d => d.where + '|' + d.line + '|' + d.code).join(',');
      const before = pointedNotices;
      pointedNotices = key;
      if (!notes.length || key === before) return '止まって いるよ';
      const owner = d => compiled.items?.find(item => item.key === d.where)?.documentKey || d.where;
      const shown = d => sourceOverviewOpen ? scriptBySourceKey(project, owner(d))?.targetId === selectedId : owner(d) === bindingOwner(mainEditor);
      if (notes.some(shown)) return '止まって いるよ。ⓘ が ついた ところに 知らせが あるよ';
      const { key: where, script, definition } = diagnosticOwner({ where: owner(notes[0]) });
      const place = definition ? (where.startsWith('function:') ? '答えを もとめる「' : 'てじゅん「') + definition.name + '」'
        : meijinTextLabel(script) || `「${targetById(script?.targetId)?.name || project.stage.name}」の ${eventText(script?.event, script?.filter)}の 本文`;
      return `止まって いるよ。${place}に ⓘ の 知らせが あるよ`;
    }
    // What the code view says about a body (FM2-04, FM2-10, FCM-19, FCM-25): a reading error that a 名人 text would read
    // says S317, as 作品チェック and ▶ do, and a body with its own heading that the code view holds until ▶ (or the block
    // view) is checked for its names and meanings before the line under the code calls it fine. Both checks compile a
    // trial work, so they run after a short wait, never on the keystroke; the line under the code follows when they are
    // done. Returns the errors to show, or null while the heading body is still being checked.
    const editorChecks = new Map();
    let editorCheckTimer = 0;
    function genericReadingError(d) {
      return ['P201', 'P205', 'S301'].includes(d?.code) && !d.proposals?.length && GENERIC_READING_ERRORS.some(re => re.test(d.message));
    }
    function checkedEditorErrors(binding, source, errs, headingAst = null) {
      if (!headingAst && !genericReadingError(errs[0])) return errs;
      const owner = bindingOwner(binding), key = owner + '\n' + (headingAst ? 'heading\n' : '') + source;
      if (editorChecks.has(key)) return editorChecks.get(key);
      clearTimeout(editorCheckTimer);
      editorCheckTimer = setTimeout(() => {
        editorCheckTimer = 0;
        if (modelLocked() || bindingOwner(binding) !== owner) return;
        let found = errs, taken = false;
        try {
          if (headingAst) {
            // What ▶ would say: taking the body (its heading may change the event or the part) and then the check of the
            // work, for this body (S317 included).
            const next = sourceCandidate(binding, owner, source), old = scriptBySourceKey(project, owner),
              row = old ? next.scripts[project.scripts.indexOf(old)] : next.scripts.at(-1), key = row && scriptSourceKey(row);
            found = key ? compileProject(next).errors.filter(e => e.where === key) : [];
            taken = true;
          } else found = meijinFormError(owner, source, found);
        } catch (error) { if (!(error instanceof AkariError)) throw error; found = error.diagnostics?.length ? error.diagnostics : [error]; }
        editorChecks.set(key, found);
        if (editorChecks.size > 40) editorChecks.delete(editorChecks.keys().next().value);
        // The note under the code that holds the text not yet taken says the same.
        if (!headingAst && found !== errs && binding.session?.pendingEdit?.value === source &&
            !$(binding.kind === 'draft' ? '#callablePending' : '#editorPending').hidden)
          showEditorFailure(binding, Object.assign(new AkariError(found[0].code, found[0].message, found[0].line, found[0].column), { diagnostics: found }));
        // The status line points to the line, as for a reading error (and says so no more once it is fixed).
        if (headingAst && found.length && binding.session?.pendingEdit?.value === source) {
          // As ▶ would say it: a body that could be taken has a mistake in the work (作品に), one that could not in its text.
          editorFailureStatus = `${taken ? '作品' : '書き方'}に 直す ところが あるよ。${found[0].line ? `コードの ${found[0].line}行目を 見てね` : 'コードの 下の せつめいを 見てね'}`;
          setStatus(editorFailureStatus);
        }
        if (binding === mainEditor) refreshEditor();
      }, 250);
      return headingAst ? null : errs;
    }
    // The S317 trial of meijinFormsInOrdinary for a body the code view shows (its text, taken or not).
    function meijinFormError(owner, source, errs) {
      const script = scriptBySourceKey(project, owner);
      if (!script || isMeijinScript(script) || !genericReadingError(errs[0])) return errs;
      const trial = cloneDesignProject(project), own = trial.scripts.find(x => x.id === script.id);
      if (!own) return errs;
      own.source = source;
      const out = meijinFormsInOrdinary(trial, [{ ...errs[0], where: scriptSourceKey(own) }]);
      if (out[0]?.code !== 'S317') return errs;
      const { proposals, ...first } = errs[0];
      return [{ ...first, code: 'S317', message: out[0].message }, ...errs.slice(1)];
    }
    function refreshEditor() {
      if (!mainEditor.view) return;
      const session = getEditorSession(mainEditor), pending = session.pendingEdit;
      let errs = session.diagnostics?.length ? checkedEditorErrors(mainEditor, session.sourceText, session.diagnostics) : [], notice = '';
      // The visible pending source can differ from the valid project baseline.
      // Never show a baseline success message over a rejected code edit.
      if (composingEditors.has(el.editor)) {
        errs = []; notice = '日本語を 入れて いる とちゅうです。文字を 決めてから、書き方を たしかめます';
      } else if (['code','heading-source','source-import'].includes(pending?.kind) && !session.blockDraft) {
        const parsed = parseSyntax(pending.value, { ...bindingContext(mainEditor),
          key: session.ownerKey, symbols: buildSymbols(project) });
        errs = parsed.syntaxDiagnostics.length ? parsed.syntaxDiagnostics
          : staticScaleDiagnostics(parsed.ast, session.ownerKey);
        // A text that reads but was refused when it was taken (its heading names no part, say) shows that mistake, with
        // its line, as the note under the code does.
        if (!errs.length && pending.kind === 'code' && pending.diagnostics?.length) errs = pending.diagnostics;
        // A body with its own heading is checked for its names and meanings too before the line says it is fine.
        const checked = pending.kind === 'source-import' ? errs
          : checkedEditorErrors(mainEditor, pending.value, errs, pending.kind === 'heading-source' && !errs.length ? parsed.ast : null);
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
      const notices = !errs.length && !notice && !pending ? bodyNotices(session) : [];
      session.notices = notices;
      if (errs.length) {
        showDiagnosticMessage(el.issue, errs[0], (errs[0].line || 1) + '行目', null, el.editor.value);
        el.issue.className = 'issue-error';
      } else if (notices.length) {
        // The first notice from the top, with how many more there are; one that names its fix offers it (I120).
        const first = notices[0];
        el.issue.textContent = 'ⓘ ' + (first.line || 1) + '行目：' + sentence(first.message) + (notices.length > 1 ? `ほかにも 知らせが ${notices.length - 1}つ あります。` : '');
        for (const proposal of first.proposals || []) {
          if (typeof proposal.source !== 'string') continue;
          const fix = document.createElement('button');
          fix.type = 'button'; fix.dataset.noteFix = ''; fix.textContent = proposal.label || proposal.source; fix.title = proposal.source;
          fix.onclick = () => applyNoteProposal(first, proposal);
          el.issue.append(' ', fix);
        }
        el.issue.className = 'issue-notice';
        if (editorFailureStatus !== null) {
          if (el.status.textContent === editorFailureStatus) setStatus('✓ 書き方を 直せたよ');
          editorFailureStatus = null;
        }
      } else {
        el.issue.textContent = notice || '✓ このコードの 書き方は だいじょうぶです';
        el.issue.className = '';
        // The mistake the status line pointed to is gone: say so (a body with its own heading is fine once its check is
        // done), so the line never asks to fix a line that is fine (E2E-R2-11).
        if ((!notice || (pending?.kind === 'heading-source' && notice === pending.reason)) && editorFailureStatus !== null) {
          if (el.status.textContent === editorFailureStatus) setStatus('✓ 書き方を 直せたよ');
          editorFailureStatus = null;
        }
      }
      updateGutter(errs, notices);
      renderEditorBinding(mainEditor);
      if (session.mode === 'code') renderHints();
    }

    let hintPage = 0,
      callableHintPage = 0;
    const composingEditors = new WeakSet();
    // A WeakSet has no size: whether a word is still being typed (IME) in either editor.
    function composingAny() { return composingEditors.has(el.editor) || composingEditors.has(draftEditor.textarea); }
    // 書ける ことば names a value by its group in the block list (FCB-13): しらべる for a reading of the screen, へんすう・リスト
    // for a value written as it is (［1、2、3］, 条件の答え（あてはまる）), 計算 for a calculation and the ready-made ones. A
    // calculation for くわしく only (2＾3, 平方根, 正弦 …) is not offered below くわしく, as in the block list (F-21).
    const hintGroups = new Map(), HINT_SENSE_KINDS = new Set(['SensorRead', 'TimerReset', 'InputValueRead']),
      HINT_DATA_KINDS = new Set(['BooleanLiteral', 'ListLiteral', 'StringLiteral', 'NumberLiteral', 'QuantityLiteral', 'VariableRead', 'ListRead']);
    function hintGroup(h, symbols) {
      if (h.mode !== 'expression') return null;
      const key = h.category + '|' + h.text;
      if (hintGroups.has(key)) return hintGroups.get(key);
      let group = { label: h.category === 'はじめから ある 計算' ? '計算' : h.category || '計算', advanced: false };
      if (h.category !== 'しらべる') try {
        const node = parseExpression(h.text, symbols, {});
        group = { label: HINT_SENSE_KINDS.has(node?.kind) || node?.kind === 'SensorRead' ? 'しらべる' : HINT_DATA_KINDS.has(node?.kind) ? 'へんすう・リスト' : '計算',
          advanced: ADVANCED_ONLY_SCHEMA_IDS.has(node?.kind + ':' + (node?.kind === 'BuiltinCall' ? node.name : node?.op)) };
      } catch (error) { if (!(error instanceof AkariError)) throw error; }
      if (hintGroups.size > 2000) hintGroups.clear();
      hintGroups.set(key, group);
      return group;
    }
    function drawHints(root, candidates, search, offset, insert) {
      root.textContent = '';
      const symbols = buildSymbols(project), advanced = document.body.dataset.uiLevel === 'advanced';
      candidates = candidates.filter(h => advanced || !hintGroup(h, symbols)?.advanced);
      const query = search.trim().toLocaleLowerCase(),
        filtered = searchHintCandidates(candidates, query, project),
        page = Math.min(offset, Math.max(0, Math.ceil(filtered.length / 24) - 1)),
        begin = page * 24;
      if (root===el.hints && /ふれ(?:た|る)とき|さわ(?:った|る)とき|あた(?:った|る)とき|ぶつか(?:った|る)とき/.test(normalizeSearchText(query))) {
        const owner=project.components.find(c=>c.id===selectedId),toucher=owner||project.components.find(c=>c.type==='sprite'),
          part=project.components.find(c=>c.id!==toucher?.id),example=toucher?sentenceHeadingSource({event:'touchStart',actorRef:currentIsMeijin()||!owner?{kind:'named',name:toucher.name}:{kind:'self'},filter:{target:part?.name||'端'}}):null;
        if(example){
        const note = document.createElement('p');
        note.className = 'hint-heading-note';
        note.textContent = 'ふれた ときに 動かすには、本文の はじめに「' + example + '」を 書いてね';
        root.appendChild(note);
        }
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
        b.disabled = !h.enabled || modelLocked();
        b.onclick = () => {
          if (h.enabled) insert(h);
        };
        root.appendChild(b);
      }
      return { page, total: filtered.length, pages: Math.max(1, Math.ceil(filtered.length / 24)) };
    }

    function renderHints() {
      if (composingEditors.has(el.editor)) return;
      const all = hintCandidates(project, selectedId, {
          source: el.editor.value,
          start: el.editor.selectionStart,
          end: el.editor.selectionEnd,
          event: currentEvent,
          level: document.body.dataset.uiLevel,
        }),
        list = $('#hintUnavailable').checked ? all : all.filter((x) => x.enabled),
        r = drawHints(el.hints, list, $('#hintSearch').value, hintPage, insertHint);
      hintPage = r.page;
      $('#hintCount').textContent = `${r.page + 1}/${r.pages} (${r.total})`;
      $('#hintPrev').disabled = r.page === 0;
      $('#hintNext').disabled = r.page === r.pages - 1;
    }
    function insertHint(h) {
      if (!h.enabled || modelLocked() || !flushEditor(mainEditor)) return;
      try {
        const t = el.editor,
          r = insertSource(
            readSource(mainEditor),
            t.selectionStart,
            t.selectionEnd,
            h.text,
            h.mode,
          );
        commitSource(mainEditor, r.source, { atomic: true });
        t.value = r.source;
        t.setSelectionRange(r.start, r.end);
        refreshEditor();
        const disclosure = $('#hintsDisclosure');
        if (disclosure) disclosure.open = false;
        t.focus();
      } catch (err) {
        showEditorFailure(mainEditor, err);
      }
    }
    // The heading of a body made a 名人 text: the part is written as its subject (and, for ふれたとき, as the topic).
    function meijinHeadingSource(heading, name) {
      return sentenceHeadingSource({ ...heading, actorRef: { kind: 'named', name } }) + (heading.event === 'touchStart' ? nameSource(name) + 'は、' : '');
    }
    function startMeijin() {
      if (modelLocked() || currentIsMeijin()) return;
      // A body with 名人 forms in it does not read as an ordinary body, so it stays a draft in the code editor (S317
      // tells the child to choose 名人 in code): that text is taken as the body.
      const flushed = flushActiveEditor(), draft = !flushed && mainEditor.session?.mode === 'code' && !$('#procModal').classList.contains('show') ? mainEditor.textarea?.value?.replace(/\r\n?/g, '\n') : null;
      if (!flushed && draft == null) return;
      const script = selectCurrentScript(), owner = targetById(selectedId);
      let source = draft ?? script?.source ?? '';
      if (source.trim()) {
        const parsed = parseSyntax(source, { symbols: buildSymbols(project), targetId: script?.targetId ?? selectedId, event: script?.event ?? currentEvent });
        // A body the common grammar does not read may hold 名人 forms (the check says so, S317): it is taken when it
        // reads as a 名人 text under a heading with its owner's name.
        if (!parsed.ast) {
          const headed = owner?.name ? meijinHeadingSource({ event: script?.event ?? currentEvent, actorRef: { kind: 'named', name: owner.name }, filter: script?.filter ?? null }, owner.name) + '\n' + source.split('\n').map(line => line.trim() ? '  ' + line : line).join('\n') : null;
          const without = cloneDesignProject(project);
          without.scripts = without.scripts.filter(s => s.id !== script?.id);
          const errorsOf = p => { try { return compileProject(p).errors.length; } catch (error) { if (!(error instanceof AkariError)) throw error; return Infinity; } }, before = errorsOf(without);
          // The other bodies' errors stay as they are; the 名人 text adds none.
          const reads = text => { const trial = cloneDesignProject(without); trial.scripts.push({ id: 'meijin-start-trial', mode: 'meijin', targetId: MEIJIN_OWNER, event: 'start', source: text }); return errorsOf(trial) <= before; };
          const meijin = [headed, source].find(text => text && reads(text));
          if (!meijin) { setStatus('書き方の まちがいを 直してから、「名人」を えらんでね。'); return; }
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
          const heading = { event: script?.event ?? currentEvent, actorRef: { kind: 'named', name: owner.name }, filter: script?.filter ?? null };
          source = meijinHeadingSource(heading, owner.name) + '\n' + source.split('\n').map(line => line.trim() ? '  ' + line : line).join('\n');
        }
        }
      }
      // The owner-approved wording (final call 23).
      if (!confirm(`名人で 書くと、この本文は ${owner?.name ? owner.name + 'から はなれて、' : ''}「動かすもの」の「名人の本文」に うつります。ブロックには もどせません。\n名人で 書きますか？`)) return;
      try {
        const next = cloneDesignProject(project), id = script?.id || ensureUniqueId('script');
        const row = { id, mode: 'meijin', targetId: MEIJIN_OWNER, event: 'start', source, ...(script?.document ? { document: cloneDesignProject(script.document) } : {}) };
        const at = script ? project.scripts.indexOf(script) : -1;
        if (at >= 0) next.scripts.splice(at, 1, row); else next.scripts.push(row);
        validateDesignProject(next);
        clearTimeout(historyTimer); pushHistoryNow();
        // The draft is now the 名人 text: its reading error is not shown any more.
        if (draft != null) { if (mainEditor.session) { mainEditor.session.pendingEdit = null; mainEditor.session.blockDraft = null; } clearEditorFailure(mainEditor); }
        project = next; selectedId = MEIJIN_OWNER; currentEvent = 'start'; selectedScriptId = id;
        hideSourceOverview(); invalidateEditors(); markDirty(); renderTree(); renderProperties(); loadEditor(); renderComponents();
        clearTimeout(historyTimer); pushHistoryNow();
        setStatus('「名人の本文」に うつしたよ。この 本文は コードモードで 書いてね');
      } catch (error) { showEditorFailure(mainEditor, error); }
    }
    function formatCurrent() {
      if (modelLocked() || !flushEditor(mainEditor)) return;
      if (currentIsMeijin()) { setStatus('名人の本文は、書いた とおりに のこすよ'); return; }
      try {
        const s = getEditorSession(mainEditor);
        if (!s.syntaxAst) throw new Error('書き方の まちがいを 直してから 整えて ください');
        const source = formatScript(s.syntaxAst);
        commitSource(mainEditor, source, { atomic: true });
        el.editor.value = source;
        refreshEditor();
      } catch (err) {
        showEditorFailure(mainEditor, err);
      }
    }
    function dispatchRuntime(fn) {
      try {
        return fn();
      } catch (err) {
        if (scheduler) scheduler.pause();
        log(`${err.code || 'R411'} ${err.message}`, 'error');
        setStatus('動きが うまく いかなかったので、いったん 止めたよ');
      }
    }
    function bridge() {
      let speechValue;
      const tutorialRunEpoch=tutorial?.epoch,bridgeGeneration=generationToken;
      return {
        render: () => requestRuntimePaint(3),
        // 作品を全部止める: every body, rule and sound has stopped and no input starts a body; the run screen keeps the
        // last picture until ■ 止める.
        allStopped: () => {
          const token = generationToken;
          setTimeout(() => {
            if (token === generationToken) finishRun({ stoppedAll: true });
          }, 0);
        },
        renderMonitor: () => requestRuntimePaint(2),
        penLine: stageView.penLine,
        penClear: stageView.clearPen,
        stamp: stageView.stamp,
        prepareSpeech: value => { speechValue = value; },
        say: (rid, text, controlled) => {
          flushRuntimePaint();
          const value = speechValue; speechValue = undefined;
          stageView.showBubble(rid, text, value, controlled);
          if(tutorialTrace&&tutorialRunEpoch===tutorial?.epoch&&bridgeGeneration===generationToken&&rid===tutorial.target)tutorialTrace.speech.push(String(text));
        },
        clearSpeech: stageView.clearSpeech,
        beforeStatement: (task, node) => {
          tutorialRecordStatement(task,node,tutorialRunEpoch,bridgeGeneration);
          activeTaskId = task.taskId;
          activeLoc = sourceLocation(task, node);
          requestRuntimePaint(6);
        },
        afterStatement: () => requestRuntimePaint(6),
        runtimeError: (task, err) => {
          if(tutorialTrace&&tutorialRunEpoch===tutorial?.epoch&&bridgeGeneration===generationToken)tutorialTrace.failed=true;
          runFailed = true;
          activeTaskId = task.taskId;
          activeLoc = sourceLocation(task, null, err);
          requestRuntimePaint(7);
          // The order of the calls names the part (たくどん), not its inner id, below くわしく (F-28).
          const owner = task.targetId === 'stage' ? project.stage.name : task.targetId === MEIJIN_OWNER ? '名人の本文' : componentById(task.targetId)?.name,
            calls = (task.errorCallStack || []).map((entry, i) => i === 0 && owner && document.body.dataset.uiLevel !== 'advanced'
              ? entry.replace('きっかけ ' + task.targetId + ' /', 'きっかけ ' + owner + ' /') : entry);
          const stack = calls.length
            ? `
使った じゅんばん：${calls.join(' → ')}`
            : '';
          // 出力 is the teacher's surface: one polite voice per line (F-18).
          log(`${err.code} 動きが うまく いきませんでした：${err.message}${stack}`, 'error');
          setStatus('動きが とちゅうで 止まったよ');
          renderMonitor();
          showFailureDetails(task.failureRecordId);
        },
        ask: (q, cb) => showQuestion(q, cb),
        closeQuestion: () => hideQuestion(),
        state: updateRunState,
      };
    }
    function startRun() {
      if (!tutorialAllows(tutorial,'run')) return;
      if (modelLocked()) return;
      // A refused run always tells the child why nothing moved.
      // Every refusal is said the same way: まだ 動かせないよ。, the reason, and 。 at the end (FM2-13).
      const refuse = (reason) => setStatus('まだ 動かせないよ。' + sentence(reason));
      if (!flushActiveEditor()) {
        refuse(sourceImportChoice() || editorFailureStatus || '書きかけの ところを 直してから「▶ 動かす」を おしてね。');
        return;
      }
      if(tutorial){
        const trial=tutorialStep(tutorial).id.slice(4),actor=componentById(tutorial.target);
        tutorialTrace={epoch:tutorial.epoch,trial,x:actor.x,y:actor.y,requiredClicks:tutorialSequence(tutorial)[tutorial.index+1].clicks,
          statements:[],speech:[],observations:[],clicks:0,busy:false,sawTask:false,complete:false,failed:false};
      }
      refreshEditor();
      if(hasPendingEditor()){log('書きかけの 入力を さいごまで 書いてから 動かして ください','error');refuse('書きかけの ところを 直してから「▶ 動かす」を おしてね。');return;}
      clearTimeout(historyTimer);
      pushHistoryNow();
      if (hasCallableDraft()) {
        log('自分で作ったブロックを なおして いる とちゅうです。ほぞんしてから 動かして ください', 'error');
        refuse('自分で作ったブロックの 画面を とじてから「▶ 動かす」を おしてね。');
        return;
      }
      if (!flushActiveEditor()) {
        refuse(sourceImportChoice() || editorFailureStatus || '書きかけの ところを 直してから「▶ 動かす」を おしてね。');
        return;
      }
      compiled = compileProject(project);
      if (compiled.errors.length) {
        showDiagnosis();
        log('作品に まちがいが あるので 動かしません。「作品チェック」を 見て 直して ください', 'error');
        refuse('作品に 直す ところが あるよ。' + fixPointer(compiled.errors[0]));
        return;
      }
      // A work with no sentence in any body (notes do not count) does not run: the status says how to put one in, with
      // the controls of the view on the screen. A continuing rule (「…あいだ、…動き続ける。」) is a sentence too, even alone
      // in its body.
      const hasSentence = nodes => (nodes || []).some(node => node.kind !== 'CommentLine');
      if (!(compiled.items || []).some(item => !item.definitionKind &&
        (hasSentence(item.ast?.body) || hasSentence(item.ast?.rules) ||
          (item.ast?.units || []).some(unit => hasSentence(unit.body))))) {
        // A body that holds only a メモ has something on the screen, but nothing that moves (E2E-R2-14).
        const memo = (compiled.items || []).some(item => (item.ast?.body || []).length || (item.ast?.units || []).some(unit => unit.body?.length));
        setStatus(shownEditorMode() === 'blocks'
          ? memo ? 'メモは 動かないよ。メモの ほかに、動く ブロックを 入れてね' : 'ブロックが まだ ないよ。「＋ ここに入れる」を おして、ブロックを 入れてね'
          : memo ? 'メモは 動かないよ。メモの ほかに、動く 文を 書いてね' : '本文が まだ ないよ。コードに 文を 書いてね');
        return;
      }
      try {
        validateAssetReferences(project, assetStore);
      } catch (err) {
        log(`${err.code || ''} 絵や音の チェック: ${err.message}`, 'error');
        refuse(document.body.dataset.uiLevel === 'entry' ? 'この 作品の 絵や音が たりないよ。' : '絵や音が たりないよ。「絵や音を まとめる」で たしかめてね。');
        return;
      }
      pen.clearRect(0, 0, el.canvas.width, el.canvas.height);
      let seed = 1;
      try {
        const a = new Uint32Array(1);
        crypto.getRandomValues(a);
        seed = a[0];
      } catch (_) {
        seed = Date.now() >>> 0;
      }
      const req = collectRuntimeAssetRequirements(compiled, project),
        token = ++generationToken;
      $('#listRepairPanel')?.remove();
      runtimeCache = new AssetRuntimeCache(assetStore);
      try {
        if (req.needsAudio) runtimeCache.ensureAudioContext();
        appState = 'PREPARING';
        runFinished = false;
        runFailed = false;
        runHint = '';
        keptFail = null;
        setStatus('絵や音を じゅんびして いるよ');
        updateRunState();
        stageView.fitStage();
        // The run screen starts now; the focus goes to the stage, not to the page (▶ 動かす is not shown there).
        el.form.focus({ preventScroll: true });
        (async () => {
          try {
            await runtimeCache.prepare(project, req, token);
            if (token !== generationToken || appState !== 'PREPARING') return;
            runtime = new RuntimeModel(project, {}, runtimeCache);
            const br = bridge();
            runtime.ui = br;
            runtimeCache.onAudioStateError = (err) => {
              log(`R415 ${err.message}`, 'error');
              setStatus('音を いったん 止めたり、また 鳴らしたり できなかったよ');
            };
            runtime.reset(seed);
            scheduler = new EventScheduler(project, compiled, runtime, br);
            stageView.seedHeldInput();
            appState = 'RUNNING';
            confirmTutorialOperation('run');
            scheduler.start();
            renderAll();
            // The seed is a くわしく fact (F-28).
            log(document.body.dataset.uiLevel === 'advanced' ? `動かしはじめました（たね=${seed}）` : '動かしはじめました', 'ok');
            setStatus('動いているよ');
            el.form.focus({ preventScroll: true });
          } catch (err) {
            if (token !== generationToken) return;
            disposeRuntime();
            appState = 'DESIGN';
            renderAll();
            loadEditor();
            log(`${err.code || ''} 動かす じゅんびが できませんでした: ${err.message}`, 'error');
            setStatus('動かす じゅんびが できなかったよ。作品は のこって いるよ。「▶ 動かす」で もう一度 ためしてね');
          }
        })();
      } catch (err) {
        disposeRuntime();
        appState = 'DESIGN';
        updateRunState();
        log(`${err.code || ''} 動かす じゅんびが できませんでした: ${err.message}`, 'error');
        setStatus('動かす じゅんびが できなかったよ。作品は のこって いるよ。「▶ 動かす」で もう一度 ためしてね');
      }
    }
    function stopRun() {
      if (appState === 'IMPORTING') return;
      tutorialCollectRuntime();
      if(tutorial&&!tutorialTrace?.complete){
        const step=tutorialStep(tutorial);
        if(step?.id.startsWith('try-')||step?.id.startsWith('stop-')) {
          tutorial.index=tutorialSequence(tutorial).findIndex(s=>s.id==='run-'+step.id.split('-').slice(1).join('-'));tutorialTrace=null;
        }
      }
      const failed = activeLoc?.error ? activeLoc : null;
      disposeRuntime();
      keptFail = failed;
      el.form.querySelectorAll('.sprite-bubble').forEach((n) => n.remove());
      appState = 'DESIGN';
      runFinished = false;
      runFailed = false;
      runHint = '';
      pen.clearRect(0, 0, el.canvas.width, el.canvas.height);
      confirmTutorialOperation('stop');
      renderAll();
      loadEditor();
      paintRunStrip();
      setStatus(stopStatusWithNotices());
      if(tutorial){tutorialRefresh();focusTutorialTarget();return;}
      if (sourceOverviewOpen) $('#sourceEditBtn').focus({ preventScroll: true });
      else if (mainEditor.session?.mode === 'blocks') {
        mainEditor.view.focus({ id: mainEditor.session.blockSelection });
        if (!$('#blockEditor').contains(document.activeElement))
          $('#blockEditor .blockui-workspace').focus({ preventScroll: true });
      }
      else el.editor.focus({ preventScroll: true });
    }
    // The words of the run: the same in the status line and on the right (動いているよ, いったん 止めたよ, おわったよ,
    // 止まって いるよ), and in 動きのようす. A run stopped at a mistake cannot go on: it says とちゅうで 止まったよ on the right
    // as the status line does (「動きが とちゅうで 止まったよ」), not いったん 止めたよ.
    function runStateText() {
      if (appState === 'PREPARING') return 'じゅんびして いるよ';
      if (appState === 'IMPORTING') return '読みこんで いるよ';
      if (runFinished) return 'おわったよ';
      if (scheduler?.running) return runFailed ? 'とちゅうで 止まったよ' : scheduler.paused ? 'いったん 止めたよ' : '動いているよ';
      return '止まって いるよ';
    }
    // A pause and the continue after it change the status line too, when it only said that the work runs (an error or a
    // hint said with the pause stays).
    const PAUSED_STATUS = 'いったん 止めたよ。「▶ つづける」で つづきから 動くよ';
    function updateRunState() {
      const running = !!scheduler?.running && !runFinished;
      if (running) appState = scheduler.paused ? 'PAUSED' : 'RUNNING';
      const words = runStateText(), before = el.runState.textContent;
      el.runState.textContent = words;
      if (words !== before && running) {
        if (words === 'いったん 止めたよ' && ['動いているよ', runHint].includes(el.status.textContent)) setStatus(PAUSED_STATUS);
        else if (words === '動いているよ' && el.status.textContent === PAUSED_STATUS) setStatus(runHint || '動いているよ');
      }
      el.runState.className = 'runstate ' + (running ? 'run-on' : 'run-off');
      // The run screen never shows a button that cannot be pressed (the exported player's rule too). ⏸ いったん止める and
      // ▶ つづける take turns in one place: ⏸ while the work runs, ▶ つづける while it is paused. 1つずつ 動かす and 本文を見て
      // たしかめる show while it runs or is paused. While getting ready, once the run has ended, and after a mistake
      // stopped it (nothing can go on past the failed sentence: ■ 止める only), a button that cannot be pressed is not
      // shown, but its place stays (data-inactive hides it), so the stage and the other buttons do not move.
      const focused = document.activeElement, failed = running && runFailed,
        inactive = {
          pauseBtn: !running || scheduler.paused || failed,
          continueBtn: !running || !scheduler.paused || failed,
          stepBtn: !running || failed,
          runtimeInspectBtn: !running,
        };
      for (const [id, off] of Object.entries(inactive)) {
        const button = $('#' + id);
        button.disabled = off;
        button.dataset.inactive = String(off);
      }
      $('#runtimeInspectBtn').hidden = !['PREPARING', 'RUNNING', 'PAUSED'].includes(appState);
      // A button that went away does not take the focus with it to the page: it goes to the stage (⏸ and ▶ つづける move
      // it on themselves).
      if (focused?.dataset?.inactive === 'true' && Object.hasOwn(inactive, focused.id)) el.form.focus({ preventScroll: true });
      $('#runBtn').disabled = appState !== 'DESIGN';
      $('#stopBtn').disabled = appState === 'DESIGN' || appState === 'IMPORTING';
      updateEditingLock();
      if (running && !scheduler.paused) requestRuntimePaint(2);
    }
    function showBubble(rid, text, value) {
      stageView.showBubble(rid, text, value);
    }
    function limitInputValue(input) {
      return stageView.limitInputValue(input);
    }
    function positionBubbles() {
      stageView.positionBubbles();
    }
    let questionCb = null;
    if (Number.isSafeInteger(LIMITS.stringChars * 2) && LIMITS.stringChars * 2 <= 2147483647) $('#questionAnswer').maxLength = LIMITS.stringChars * 2; else $('#questionAnswer').removeAttribute('maxlength');
    $('#questionAnswer').addEventListener('input', (e) => {
      if (!e.isComposing) limitInputValue(e.target);
    });
    $('#questionAnswer').addEventListener('compositionend', (e) => limitInputValue(e.target));
    function showQuestion(q, cb) {
      closeRuntimeInspector();
      stageView.clearInput();
      questionCb = cb;
      $('#questionText').textContent = q;
      $('#questionAnswer').value = '';
      $('#questionModal').classList.add('show');
      setTimeout(() => $('#questionAnswer').focus(), 0);
    }
    function hideQuestion() {
      $('#questionModal').classList.remove('show');
      questionCb = null;
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
            stageView.clearInput();
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
    function renderAll() {
      applyUiLevel();
      applyStage();
      renderTree();
      renderProperties();
      renderSelectors();
      renderComponents();
      renderMonitor();
      updateRunState();
      el.projectName.value = project.name;
    }
    // The fix of a notice opens its body in the editor and changes it there, so undo and the editor follow it. A body
    // changed since the check is not touched.
    function applyNoteProposal(note, proposal) {
      if (modelLocked() || !flushActiveEditor()) return;
      const item = compileProject(project).items.find(x => x.key === note.where),
        script = item && scriptBySourceKey(project, item.documentKey || item.key);
      if (!script || typeof script.source !== 'string' || script.source.slice(proposal.start, proposal.end) !== proposal.original) {
        setStatus('本文が かわったので、もう一度「作品チェック」を おしてね');
        return;
      }
      if (script.targetId !== selectedId && !selectObject(script.targetId)) return;
      currentEvent = script.event; selectedScriptId = script.id || null; loadEditor();
      const source = script.source.slice(0, proposal.start) + proposal.source + script.source.slice(proposal.end);
      try {
        commitSource(mainEditor, source, { atomic: true });
        renderEditorBinding(mainEditor); refreshEditor();
        $('#diagnosisModal').classList.remove('show');
        if (shownEditorMode() === 'code') {
          el.editor.focus({ preventScroll: true });
          el.editor.setSelectionRange(proposal.start, proposal.start + proposal.source.length);
        } else mainEditor.view?.focus({ line: note.line });
        setStatus('直したよ');
      } catch (error) { showEditorFailure(mainEditor, error); }
    }
    function showDiagnosis() {
      if (!flushActiveEditor()) return;
      const c = compileProject(project),
        body = $('#diagnosisBody');
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
          showDiagnosticMessage(p, d, diagnosticLocation(d), null, diagnosticSource(d), { listItem: true });
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
          p.textContent = diagnosticLocation(d) + '：' + sentence(d.message);
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
      $('#diagnosisModal').classList.add('show');
    }
    let exportBusy = false, exportGeneration = 0;
    function cancelPlayerExport() {
      // Invalidate both deferred starts before a later chooser can begin another export.
      exportGeneration++;
      exportBusy = false;
      $('#exportChoiceModal').classList.remove('show');
      $('#exportControls').disabled = $('#exportArtwork').disabled = false;
      $('#exportBtn').disabled = modelLocked();
      setStatus('うごく作品を ファイルに するのを やめたよ');
    }
    function exportProject() {
      if(tutorial)return;
      if (!flushActiveEditor()) {
        // A press that cannot make the file says why (the review waits, or the code has a mistake).
        const why = sourceImportChoice() || editorFailureStatus;
        if (why) setStatus('まだ ファイルに できないよ。' + why + (why.endsWith('。') ? '' : '。'));
        return;
      }
      clearTimeout(historyTimer);
      pushHistoryNow();
      if(hasPendingEditor()){log('書きかけの 入力を さいごまで 書いてから、うごく作品を ファイルにしてね','error');return;}
      if (modelLocked() || document.querySelector('.modal.show,.modal.open')) return;
      if (hasCallableDraft()) {
        log('自分で作ったブロックを なおして いる とちゅうだよ。ほぞんしてから、うごく作品を ファイルにしてね', 'error');
        return;
      }
      const errors = compileProject(project).errors;
      if (errors.length) {
        showDiagnosis();
        log('作品の まちがいを 直してから、うごく作品を ファイルにしてね', 'error');
        return;
      }
      if (exportBusy) return;
      $('#exportChoiceModal').classList.add('show');
    }
    function downloadProject(presentation) {
      if (exportBusy || !$('#exportChoiceModal').classList.contains('show') || modelLocked()) return;
      if (!flushActiveEditor() || hasPendingEditor() || hasCallableDraft() || compileProject(project).errors.length) {
        $('#exportChoiceModal').classList.remove('show'); return;
      }
      exportBusy = true;
      const generation = ++exportGeneration;
      const button = $('#exportBtn');
      button.disabled = true;
      $('#exportControls').disabled = $('#exportArtwork').disabled = true;
      setStatus('うごく作品を ファイルに しているよ');
      // The file is made after the next paint, so that sentence shows while it is made: a work with many pictures takes
      // seconds, and the page cannot paint meanwhile. A timer stands in where no frame comes (a hidden page).
      let started = false;
      const make = () => {
        if (!started && generation === exportGeneration && $('#exportChoiceModal').classList.contains('show')) {
          started = true;
          writePlayerFile(presentation, button);
        }
      };
      requestAnimationFrame(() => setTimeout(make, 0));
      setTimeout(make, 200);
    }
    function writePlayerFile(presentation, button) {
      let url = null;
      try {
        const html = generateStandaloneHtml(project, assetStore, { presentation }),
          blob = new Blob([html], { type: 'text/html;charset=utf-8' }),
          a = document.createElement('a');
        url = URL.createObjectURL(blob);
        a.href = url;
        a.download = safeDownloadName(project.name) + '.html';
        a.hidden = true;
        document.body.appendChild(a);
        try {
          a.click();
        } finally {
          a.remove();
        }
        log('うごく作品の ファイルを 作りはじめました', 'ok');
        setStatus(`「${project.name}」を うごく作品の ファイルに したよ`);
      } catch (e) {
        log((e.code || 'X600') + ' ' + e.message, 'error');
        setStatus('うごく作品を ファイルに できなかったよ');
      } finally {
        if (url) setTimeout(() => URL.revokeObjectURL(url), 60000);
        $('#exportChoiceModal').classList.remove('show');
        $('#exportControls').disabled = $('#exportArtwork').disabled = false;
        button.disabled = modelLocked();
        exportBusy = false;
      }
    }

    function captureEditorState() {
      for(const binding of [mainEditor,draftEditor])captureEditorView(binding);
      const pendingEditors=[mainEditor,draftEditor].filter(binding=>binding.session?.pendingEdit||binding.session?.blockDraft)
        .map(binding=>({kind:binding.kind,ownerKey:bindingOwner(binding),source:binding.textarea.value,mode:binding.session.mode,
          pending:cloneDesignProject(binding.session.pendingEdit||{kind:'block-draft'}),
          draftTree:binding.session.blockDraft?cloneDesignProject(binding.session.blockView):null}));
      let callableDraft=captureCallableDraft();
      if(headerPending||pendingEditors.some(d=>d.kind==='draft'))callableDraft=validateCallableDraft({...callableDraftCore,
        name:$('#callableName').value,argsText:$('#callableArgs').value,...(callableDraftCore.type==='action'?{callPhrase:$('#callablePhrase').value}:{})});
      return validateEditorState({version:1,revision:recoveryEpoch,selectedId,currentEvent,selectedScriptId,
        uiLevel:keptUiLevel(),sourceOverviewOpen,editorModes:{script:mainEditor.session?.mode||'code',draft:draftEditor.session?.mode||'code'},callableDraft,pendingEditors,
        views:[mainEditor,draftEditor].filter(binding=>binding.session).map(binding=>({kind:binding.kind,ownerKey:bindingOwner(binding),
          codeSelection:{start:binding.textarea.selectionStart||0,end:binding.textarea.selectionEnd||0,direction:binding.textarea.selectionDirection||'none'},
          scrollState:{codeTop:binding.textarea.scrollTop,codeLeft:binding.textarea.scrollLeft}}))},project);
    }
    function restoreEditorState(state) {
      // Entry is a local presentation choice. The established file enum stays
      // basic/advanced; a transient history view can still retain entry.
      validateEditorState(state.uiLevel==='entry'?{...state,uiLevel:'basic'}:state,project);
      for(const binding of [mainEditor,draftEditor]){binding.view?.cancel();if(binding.session){binding.session.pendingEdit=null;binding.session.blockDraft=null;}}
      headerPending=null;
      selectedId=state.selectedId;currentEvent=state.currentEvent;selectedScriptId=state.selectedScriptId;
      // A restored basic view keeps this browser's entry preference while the script editor shows blocks.
      let uiLevel=state.uiLevel;
      if(uiLevel==='basic'&&state.editorModes.script==='blocks'){
        let stored=null;
        try{stored=localStorage.getItem(STORAGE_KEYS.uiLevel);}catch(_){}
        if(normalizeEntryUiLevel(stored)==='entry')uiLevel='entry';
      }
      baseUiLevel=uiLevel;
      // A work with a 名人 text opens in code, whatever view the file or the autosave kept; nothing is said about it. The
      // kept view stays the chosen one (getEditorSession shows code).
      for(const [kind,mode]of Object.entries(state.editorModes))editorModes.set(kind,mode);
      editorSessions.clear();invalidateEditors();hideSourceOverview();applyUiLevel();renderAll();loadEditor();
      if(state.callableDraft)restoreCallableDraft(state.callableDraft);
      for(const saved of state.pendingEditors){
        const binding=saved.kind==='draft'?draftEditor:mainEditor;
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
        if(!workIsMeijin())editorModes.set(binding.kind,mode);
        session.mode=mode;binding.textarea.value=saved.source;renderEditorBinding(binding);
        if(mode==='blocks'&&saved.pending.field&&!binding.view.restorePending(session.pendingEdit))throw new AkariError('F503','書きかけの 入力を もとに もどせません');
        showEditorFailure(binding,saved.pending.reason||'書きかけの 本文を もどしました',{preservePending:true});
        if(binding===mainEditor&&saved.pending.kind==='source-import'){const plan=sourceImportPlan(binding,saved.source);if(plan)showSourceImport(binding,saved.source,plan);}
      }
      for(const view of state.views){const binding=view.kind==='draft'?draftEditor:mainEditor;if(view.kind==='script'&&bindingOwner(binding)!==view.ownerKey)continue;
        if(!binding.session)getEditorSession(binding,{force:true});
        Object.assign(binding.session,{codeSelection:{...view.codeSelection},scrollState:{...binding.session?.scrollState,...view.scrollState}});
        binding.textarea.setSelectionRange(view.codeSelection.start,view.codeSelection.end,view.codeSelection.direction);binding.textarea.scrollTop=view.scrollState.codeTop;binding.textarea.scrollLeft=view.scrollState.codeLeft;}
      if(state.sourceOverviewOpen&&!state.pendingEditors.length)showSourceOverview();
      updateDirty();
    }
    // Saves the work file; true when its download has started.
    function saveProject() {
      if (!tutorialAllows(tutorial,'save')) return false;
      if (appState === 'IMPORTING' || appState === 'PREPARING') return false;
      if(composingAny()){setStatus('日本語の 入力を 決めてから、ほぞんしてね');return false;}
      flushActiveEditor();
      try {
        const editorState=captureEditorState(),unfinished=editorState.pendingEditors.length||editorState.callableDraft||compileProject(project).errors.length;
        const md = serializeProject(project, assetStore, editorState),
          blob = new Blob([md], { type: 'text/markdown;charset=utf-8' }),
          a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = safeDownloadName(project.name) + '.akari.md';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        if(tutorial){tutorialSave={epoch:tutorial.epoch,identity:workspaceIdentity,fingerprint:currentFingerprint(),verified:false};confirmTutorialOperation('save');}
        lastSavedFingerprint = currentFingerprint();
        lastSavedEditorFingerprint = openEditorFingerprint();
        dirty = false;
        updateDirty();
        clearTimeout(autosaveTimer);
        writeAutosave();
        log(`${a.download} を ダウンロードしはじめました。このパソコンに のこした 作品も そのままです`, 'ok');
        setStatus(unfinished?'書きかけの ある 作品を ファイルに ほぞんしたよ。動かす 前に、まだ できて いない ところを たしかめてね':`「${project.name}」を ファイルに ほぞんしたよ`);
        return true;
      } catch (err) {
        log(`${err.code || ''} ほぞん できませんでした: ${err.message}`, 'error');
        setStatus('ファイルに ほぞん できなかったよ。作品は この 画面に のこって いるよ。もう一度「保存」を おしてね');
        return false;
      }
    }
    async function openProject(file, approval = null) {
      if (tutorial) return;
      if (modelLocked()) return;
      const observed = currentOpenState();
      if (approval?.fingerprint !== observed.fingerprint && !(await askLose(observed))) return;
      if (tutorial || modelLocked()) return;
      let previous = null;
      clearTimeout(historyTimer);
      clearTimeout(autosaveTimer);
      recoveryEpoch++;
      appState = 'IMPORTING';
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
        previous = { current: snapshot(), history: history.slice(), redo: redo.slice(), initialSnapshot,
          lastSavedFingerprint, lastSavedEditorFingerprint };
        closeEditingModals();
        clearCallable();
        disposeRuntime();
        revokeDesignUrls();
        project = loaded.project;
        workspaceIdentity++;
        assetStore = loaded.assetStore;
        editorSessions.clear();
        invalidateEditors();
        selectedId = 'stage';
        currentEvent = 'start';
        selectedScriptId = null;
        appState = 'DESIGN';
        hideSourceOverview();
        renderAll();
        loadEditor();
        resetHistory();
        if(loaded.editorState){restoreEditorState(loaded.editorState);initialSnapshot=snapshot();history=[initialSnapshot];redo=[];lastObservedFingerprint=stateFingerprintCore();}
        lastSavedEditorFingerprint = openEditorFingerprint();
        appState = 'IMPORTING';
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
        setStatus(`「${project.name}」を 開いたよ` + (diagnostics.length ? `。直す ところが ${diagnostics.length}か所 あるよ` : ''));
      } catch (err) {
        if (previous) {
          history = previous.history;
          redo = previous.redo;
          initialSnapshot = previous.initialSnapshot;
          lastSavedFingerprint = previous.lastSavedFingerprint;
          lastSavedEditorFingerprint = previous.lastSavedEditorFingerprint;
          restoreSnap(previous.current, { restoreView: true });
        }
        log(`${err.code || ''} 読みこめませんでした: ${err.message}`, 'error');
        // The person chose not to open it with the newer extension: nothing to explain.
        if (!err?.declined) showOpenRefusal(err);
      } finally {
        appState = 'DESIGN';
        renderAll();
        if (dirty || hasCallableDraft() || hasPendingEditor()) scheduleAutosave();
      }
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
      setStatus('ファイルを 開けなかったよ');
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
      if (composingAny() || activeDragCleanup || colorEdit) {
        scheduleAutosave();
        return Promise.resolve(false);
      }
      if (!hasPendingEditor()) flushActiveEditor();
      let rec, fingerprint;
      try {
        fingerprint = stateFingerprintCore();
        const current=snapshot(),past=history.slice(-Math.max(1, Math.floor(LIMITS.historyEntries / 2)));
        if(past.at(-1)?.stateFingerprint===current.stateFingerprint)past[past.length-1]=current;
        else{past.push(current);if(past.length>Math.max(1, Math.floor(LIMITS.historyEntries / 2)))past.shift();}
        const future=history.at(-1)?.stateFingerprint===current.stateFingerprint?redo.slice(-Math.max(1, Math.floor(LIMITS.historyEntries / 2))).reverse():[];
        const workspace=encodeWorkspaceHistory([...past,...future],past.length-1);
        autosaveRevisionTime=Math.max(Date.now(),autosaveRevisionTime+1);
        rec={id:'latest',version:2,updatedAt:autosaveRevisionTime,revision:recoveryEpoch,workspace,lastSavedFingerprint,
          lastSavedEditorFingerprint:validateSavedEditorFingerprint(lastSavedEditorFingerprint)};
      } catch (e) {
        el.autosave.textContent = 'このパソコンに のこせなかったよ（「ほぞん」で ファイルに しよう）';
        log(e.message, 'error');
        return Promise.resolve(false);
      }
      const status = (text) => {
        if (
          recoveryEpoch === rec.revision && stateFingerprintCore() === fingerprint
        )
          el.autosave.textContent = text;
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
      return (autosaveQueue = autosaveQueue
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
      if(restoringSnapshot)return;
      clearTimeout(autosaveTimer);
      recoveryEpoch++;
      if(!modelLocked())updateDirty();
      el.autosave.textContent = 'このパソコンには まだ のこして いないよ';
      autosaveTimer = setTimeout(writeAutosave, 1200);
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
        autosaveRevisionTime = Math.max(autosaveRevisionTime, latest.updatedAt);
      return latest;
    }

    function clearAutosave() {
      clearTimeout(autosaveTimer);
      const epoch = ++recoveryEpoch;
      return (autosaveQueue = autosaveQueue
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
          if (epoch === recoveryEpoch)
            el.autosave.textContent = ok
              ? 'このパソコンには まだ のこして いないよ'
              : 'このパソコンに のこした 作品を けせたか、たしかめられなかったよ';
          return ok;
        }));
    }
    async function checkRecovery() {
      const epoch = recoveryEpoch;
      try {
        const rec = await readAutosave();
        if (
          !rec ||
          epoch !== recoveryEpoch ||
          dirty ||
          hasCallableDraft() ||
          hasPendingEditor() ||
          modelLocked()
        )
          return;
        if(!exactKeys(rec,['id','version','updatedAt','revision','workspace','lastSavedFingerprint','lastSavedEditorFingerprint'])||
          rec.id!=='latest'||rec.version!==2||!Number.isFinite(rec.updatedAt)||
          !Number.isSafeInteger(rec.revision)||rec.revision<0||typeof rec.lastSavedFingerprint!=='string')
          throw new AkariError('F503','このパソコンに のこした 作品の 形が 正しく ありません');
        validateSavedEditorFingerprint(rec.lastSavedEditorFingerprint);
        const restored=await decodeWorkspaceHistory(rec.workspace);
        if(epoch!==recoveryEpoch||dirty||hasCallableDraft()||hasPendingEditor()||modelLocked())return;
        recoveryData={...rec,restored};
        // The work is named (F-02), and the autosave is called このパソコンに のこす (F-23).
        const keptName=restored.frames?.[restored.cursor]?.project?.name;
        $('#recoveryText').textContent=`${new Date(rec.updatedAt).toLocaleString()}に、${keptName?'「'+keptName+'」を ':''}とちゅうまで このパソコンに のこして あるよ。つづきから 作る？ けすと、もう もどせないよ。`;
        // The safe choice comes first and has the focus: つづきから 作る keeps the work, のこした 作品を けす cannot be undone.
        setStatus('このパソコンに のこした 作品が あるよ');
        $('#recoveryModal').classList.add('show');
        $('#recoveryRestore').focus({preventScroll:true});
      } catch (err) {
        if (
          epoch === recoveryEpoch &&
          !dirty &&
          !hasCallableDraft() &&
          !hasPendingEditor() &&
          !modelLocked()
        ) {
          el.autosave.textContent =
            'このパソコンに のこした 作品を もどせるか、たしかめられなかったよ（のこした 作品は そのままだよ）';
          log(
            `このパソコンに のこした 作品を たしかめられませんでした。のこした 作品は けして いません。 ${err.code || ''} ${err.message}`,
            'error',
          );
        }
      }
    }
    function renderDataModal() {
      // The choice names what is chosen, as the part tools do (F-23): えらんだ キャラクター, えらんだ 部品.
      const chosen = componentById(selectedId);
      $('#dataScope option[value="self"]').textContent = chosen ? 'えらんだ ' + (chosen.type !== 'sprite' ? '部品' : 'キャラクター') : 'えらんだ キャラクターや 部品';
      updateDataForm();
      const body = $('#dataBody');
      body.textContent = '';
      const scope = $('#dataScope').value;
      let vars, lists, label;
      if (scope === 'project') {
        vars = project.projectData.variables;
        lists = project.projectData.lists;
        label = '作品';
      } else {
        const c = componentById(selectedId);
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
          sm.textContent = `はじめの 中身：${monitorValue(d.initialValue)}${d.expectedUnit ? ` ／使う たんい：${d.expectedUnit}` : ''}`;
          const usage = document.createElement('code');
          usage.textContent = nameSource(d.name, scope === 'project' ? 'project' : 'self');
          info.append(b, sm, usage);
          const inspect = document.createElement('button');
          inspect.textContent = '全部';
          inspect.onclick = () =>
            showFullValue(
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
                markDirty(); renderDataModal(); refreshEditor();
              } catch (error) { showDataFormError(error,unit); }
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
            refreshEditor();
          };
          const rename=document.createElement('button');rename.textContent='名前を かえる';
          rename.onclick=()=>{
            if(modelLocked())return;
            const name=prompt('へんすう・リストの 名前',d.name);if(name===null||name.trim()===d.name)return;
            try{
              const next=prepareResourceRename(project,'data:'+d.id,name.trim(),{drafts:resourceDraftRecords()});
              clearTimeout(historyTimer);pushHistoryNow();project=next;invalidateEditors();markDirty();pushHistoryNow();renderDataModal();refreshEditor();
            }catch(error){showResourceImpact({resource:d,references:[],uncertain:[{title:'名前を かえる',line:1,reason:error.message}]},body,'名前を かえる');}
          };
          row.append(info, rename, del);
          body.appendChild(row);
        }
    }
    function addData() {
      if (modelLocked()) return;
      const before = cloneDesignProject(project);
      let field=$('#dataName');
      clearDataFormError();
      try {
        const scope = $('#dataScope').value,
          kind = $('#dataKind').value,
          name = normalizeCharsOutsideString($('#dataName').value.trim());
        validateName(name);
        const target =
          scope === 'project' ? before.projectData : before.components.find(c=>c.id===selectedId)?.localData;
        if (!target) throw new Error('部品ごとの へんすう・リストを 作る 部品を えらんで ください');
        if ([...target.variables, ...target.lists].some((x) => x.name === name))
          throw new Error('同じ 名前の へんすう・リストが あります。ちがう 名前に して ください');
        field=kind==='list'&&$('#dataListMode').value==='lines'?$('#dataItems'):$('#dataInitial');
        const initial = parseDataFormInitial(field.value, kind,{mode:$('#dataListMode').value,expectedUnit:kind==='variable'?$('#dataUnit').value||null:null}),
          arr = kind === 'variable' ? target.variables : target.lists;
        arr.push({
          id: ensureUniqueId(kind === 'variable' ? 'var' : 'list'),
          name,
          initialValue: initial,
          ...(kind === 'variable' && $('#dataUnit').value ? { expectedUnit: $('#dataUnit').value } : {}),
        });
        validateProject(before);
        project=before;
        markDirty();
        renderDataModal();
        refreshEditor();
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
      log(`${error.code||''} ${error.message}`,'error');
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
      if (!root || composingEditors.has(t)) return;
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
        list = hintCandidates(project, selectedId, {
          source: t.value,
          start: t.selectionStart,
          end: t.selectionEnd,
          definitionKind: $('#callableType').value,
          args,
        }).filter((x) => x.enabled);
      } catch (_) {
        root.textContent = '';
        return;
      }
      const r = drawHints(root, list, $('#callableHintSearch').value, callableHintPage, (h) => {
        if (modelLocked() || composingEditors.has(t)) return;
        try {
          const result = insertSource(t.value, t.selectionStart, t.selectionEnd, h.text, h.mode);
          t.value = result.source;
          t.setSelectionRange(result.start, result.end);
          updateCallableHeader();
          t.focus();
        } catch (err) {
          log(`${err.code || ''} ${err.message}`, 'error');
        }
      });
      callableHintPage = r.page;
      $('#callableHintCount').textContent = `${r.page + 1}/${r.pages} (${r.total})`;
      $('#callableHintPrev').disabled = r.page === 0;
      $('#callableHintNext').disabled = r.page === r.pages - 1;
    }
    function clearCallable(type = 'action') {
      hideMeijinProcedure();
      captureEditorView(draftEditor);
      editorDraftSerial++;
      callableDraftCore = { ownerId: 'stage', type, name: '', argsText: '', source: '', editId: '', loadedKey: '' };
      callableLoadedKey = '';
      callableBaseline = callableSignature();
      paintCallable();
      if (draftEditor.view) renderEditorBinding(draftEditor);
    }
    function loadCallable(v) {
      const [type, id] = v.split(':'),
        d = (type === 'action' ? project.actions : project.functions).find((x) => x.id === id);
      if (!d) return;
      hideMeijinProcedure();
      captureEditorView(draftEditor);
      callableDraftCore = {
        ownerId: d.ownerId,
        type,
        name: d.name,
        argsText: d.args.join('、'),
        ...(d.callPhrase ? {callPhrase: d.callPhrase} : {}),
        source: d.source,
        editId: id,
        loadedKey: v,
      };
      callableLoadedKey = v;
      callableBaseline = callableSignature();
      paintCallable();
      if (draftEditor.view) renderEditorBinding(draftEditor);
    }

    function validateCallableDraft(d) { return validateCallableDraftState(d); }
    function captureCallableDraft() {
      return hasCallableDraft() ? validateCallableDraft(callableDraftCore) : null;
    }
    function restoreCallableDraft(d) {
      const old = [...project.actions, ...project.functions].find((x) => x.id === d.editId);
      if (old) loadCallable(`${project.actions.includes(old) ? 'action' : 'function'}:${old.id}`);
      else clearCallable(d.type);
      callableDraftCore = {
        ...validateCallableDraft(d),
        editId: old?.id || '',
        loadedKey: old ? d.loadedKey : '',
      };
      callableLoadedKey = callableDraftCore.loadedKey;
      invalidateEditors();
      paintCallable();
      renderCallableOptions(callableLoadedKey);
      $('#procModal').classList.add('show');
      renderEditorBinding(draftEditor);
    }

    function callableSignature() {
      const d = callableDraftCore;
      return JSON.stringify([d.type, d.name, d.argsText, d.callPhrase || '', d.source]);
    }
    function hasCallableDraft() {
      return callableBaseline !== '' && callableSignature() !== callableBaseline;
    }
    function confirmCallableDiscard() {
      if (!flushActiveEditor()) return false;
      if (!hasCallableDraft()) return true;
      if (!confirm('自分で作ったブロックに、まだ 決めていない なおしが あるよ。なおしを すてて つづける？'))
        return false;
      clearTimeout(historyTimer);
      pushHistoryNow();
      if (callableLoadedKey) loadCallable(callableLoadedKey);
      else clearCallable(callableDraftCore.type);
      markDirty();
      pushHistoryNow();
      return true;
    }
    function readCallableDraft() {
      const d = callableDraftCore,
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
    function updateCallableHeader() {
      if (syncingDraft) return;
      if (!syncCallableDraft()) return;
      // A code error still renders the draft's toggle, so ブロック turns pale and its press says why (as in the main editor).
      if (draftEditor.session?.mode !== 'blocks' && !saveCodeBinding(draftEditor)) {
        if (draftEditor.view) renderEditorBinding(draftEditor);
        return;
      }
      paintCallable();
      if (draftEditor.view) {
        renderEditorBinding(draftEditor);
        if (draftEditor.session?.mode === 'code') renderCallableHints();
      }
    }
    function formatCallable() {
      if (modelLocked() || !flushActiveEditor()) return;
      try {
        const s = getEditorSession(draftEditor);
        if (!s.syntaxAst) throw new Error('書き方の まちがいを 直してから 整えて ください');
        const source = formatScript(s.syntaxAst);
        commitSource(draftEditor, source, { atomic: true });
        draftEditor.textarea.value = source;
        renderEditorBinding(draftEditor);
      } catch (error) {
        showEditorFailure(draftEditor, error);
      }
    }

    function saveCallable() {
      if (modelLocked() || !flushActiveEditor()) return;
      try {
        const d = readCallableDraft();
        let next = cloneDesignProject(project);
        const previous=[...next.actions,...next.functions].find(x=>x.id===d.editId);
        if(previous&&previous.name!==d.name){
          const kind=next.actions.includes(previous)?'action':'function';
          if(kind!==d.type)throw new AkariError('F503','名前と しゅるいは べつべつに かえて ください。使っている ところを たしかめて ください');
          previous.source=d.source;previous.args=d.args;
          if(d.callPhrase)previous.callPhrase=d.callPhrase;else delete previous.callPhrase;
          next=prepareResourceRename(next,kind+':'+previous.id,d.name,{drafts:resourceDraftRecords().filter(r=>r.key!=='draft-reference:callable')});
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
        clearTimeout(historyTimer);
        pushHistoryNow();
        project = next;
        invalidateEditors();
        loadCallable(`${d.type}:${id}`);
        renderCallableOptions(callableLoadedKey);
        markDirty();
        pushHistoryNow();
        refreshEditor();
        log(`${d.type === 'action' ? 'てじゅん' : '答えを もとめる'}「${d.name}」を 決めました`, 'ok');
      } catch (error) {
        showEditorFailure(draftEditor, error);
      }
    }
    function deleteCallable() {
      if (modelLocked() || !flushActiveEditor()) return;
      const id = callableDraftCore.editId,
        d = [...project.actions, ...project.functions].find((x) => x.id === id);
      if (!d) return;
      const kind = project.actions.some(x => x.id === id) ? 'action' : 'function';
      if (!allowResourceDelete(`${kind}:${id}`, $('#procModal .dialog-body'))) return;
      if (!confirm(`「${d.name}」を けす？`)) return;
      clearTimeout(historyTimer);
      pushHistoryNow();
      project.actions = project.actions.filter((x) => x.id !== id);
      project.functions = project.functions.filter((x) => x.id !== id);
      clearCallable();
      invalidateEditors();
      renderCallableList();
      markDirty();
      pushHistoryNow();
      refreshEditor();
    }
    function resourceDraftRecords() {
      const drafts = [];
      for (const binding of [mainEditor, draftEditor]) {
        const session = binding.session;
        if (!session?.pendingEdit && !session?.blockDraft) continue;
        drafts.push({ key: 'draft-reference:' + binding.kind, ownerId: bindingContext(binding).targetId,
          kind: binding.kind === 'script' ? 'script' : 'draft', title: 'なおして いる 本文',
          incomplete: true, source: session.blockDraft?.source || binding.textarea.value,
          context: bindingContext(binding) });
      }
      if (hasCallableDraft() && !drafts.some(d => d.key === 'draft-reference:draft'))
        drafts.push({ key: 'draft-reference:callable', ownerId: 'stage', kind: 'draft', title: 'なおして いる 自分で作ったブロック',
          source: callableDraftCore.source, context: bindingContext(draftEditor) });
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
    function allowResourceDelete(key, root, removedOwner = null) {
      const impact = resourceChangeImpact(project, key, { drafts: resourceDraftRecords() });
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
      const body = $('#assetBody');
      body.textContent = '';
      const advanced = document.body.dataset.uiLevel !== 'basic',
        c = componentById(selectedId),
        hint = $('#costumeImageHint'),
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
            const options = { drafts: resourceDraftRecords() }, impact = resourceChangeImpact(project, `${kind}:${obj.id}`, options);
            if (impact.uncertain.length) { showResourceImpact(impact, body, '名前を かえる'); return; }
            const next = prepareResourceRename(project, `${kind}:${obj.id}`, v, options);
            clearTimeout(historyTimer); pushHistoryNow(); project = next;
            markDirty();
            pushHistoryNow();
            renderAll(); loadEditor();
            renderAppearance();
            refreshEditor();
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
      for (const b of project.stage.backdrops) {
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
        use.textContent = b.id === project.stage.backdropId ? '使用中' : '使う';
        use.disabled = b.id === project.stage.backdropId || modelLocked();
        use.onclick = () => {
          if (modelLocked()) return;
          project.stage.backdropId = b.id;
          markDirty();
          renderAll();
          renderAppearance();
        };
        row.append(preview, info, use);
        if (advanced) {
          const rn = document.createElement('button');
          rn.textContent = '名前を かえる';
          rn.onclick = () => rename(b, project.stage.backdrops, 'はいけい', 'backdrop');
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
          del.disabled = project.stage.backdrops.length <= 1 || modelLocked();
          del.onclick = () => {
            if (modelLocked()) return;
            if (!allowResourceDelete('backdrop:' + b.id, body)) return;
            project.stage.backdrops.splice(project.stage.backdrops.indexOf(b), 1);
            if (project.stage.backdropId === b.id)
              project.stage.backdropId = project.stage.backdrops[0].id;
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
      $('#costumeImageAdd').disabled = modelLocked() || c?.type !== 'sprite';
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
      if (!project.sounds.length) {
        const e = document.createElement('div');
        e.className = 'monitor-empty';
        e.textContent = '音は まだ ありません。';
        body.appendChild(e);
      }
      for (const snd of project.sounds) {
        const a = assetStore.get(snd.assetId),
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
          prev.onclick = () => previewSound(snd);
          const stop = document.createElement('button');
          stop.textContent = '止める';
          stop.onclick = stopPreview;
          const rn = document.createElement('button');
          rn.textContent = '名前を かえる';
          rn.onclick = () => rename(snd, project.sounds, '音', 'sound');
          const del = document.createElement('button');
          del.textContent = 'けす';
          del.disabled = modelLocked();
          del.onclick = () => {
            if (modelLocked()) return;
            if (!allowResourceDelete('sound:' + snd.id, body)) return;
            stopPreview();
            project.sounds.splice(project.sounds.indexOf(snd), 1);
            compactCurrentAssets();
            markDirty();
            renderAppearance();
            refreshEditor();
          };
          row.append(prev, stop, rn, del);
        }
        body.appendChild(row);
      }
    }
    function addBackdrop() {
      if (modelLocked()) return;
      const before = cloneDesignProject(project);
      try {
        if (project.stage.backdrops.length >= LIMITS.backdrops)
          throw new AkariError('F504', 'はいけいが いっぱいで、もう ふやせません。いらない はいけいを けして ください');
        const name = $('#backdropName').value.trim(),
          val = $('#backdropColor').value.trim();
        validateResourceName(name, 'はいけいの名前');
        if (project.stage.backdrops.some((b) => b.name === name))
          throw new AkariError('F503', '同じ はいけいの 名前が あります。ちがう 名前に して ください');
        if (!validateColorHex(val)) throw new AkariError('F507', 'はいけいの 色は、# と 6けたの 0〜9・A〜F で 書いて ください。れい：#ffffff');
        project.stage.backdrops.push({
          id: ensureUniqueId('backdrop'),
          name,
          kind: 'color',
          value: val.toLowerCase(),
        });
        project.stage.backdropId = project.stage.backdrops[project.stage.backdrops.length - 1].id;
        validateDesignProject(project);
        markDirty();
        renderAppearance();
        renderAll();
      } catch (e) {
        rollbackDesign(before);
        log(`${e.code || ''} ${e.message}`, 'error');
      }
    }
    function addCostume() {
      if (modelLocked()) return;
      const before = cloneDesignProject(project);
      try {
        const c = componentById(selectedId);
        if (c?.type !== 'sprite') throw new Error('文字の すがたを 入れる キャラクターを えらんで ください');
        if (c.costumes.length >= LIMITS.costumesPerSprite)
          throw new AkariError('F504', 'すがたが いっぱいで、もう ふやせません。いらない すがたを けして ください');
        const name = $('#costumeName').value.trim(),
          val = $('#costumeText').value;
        validateResourceName(name, 'すがたの名前');
        if (c.costumes.some((x) => x.name === name))
          throw new AkariError('F503', '同じ すがたの 名前が あります。ちがう 名前に して ください');
        c.costumes.push({ id: ensureUniqueId('costume'), name, kind: 'text', value: val });
        c.costumeId = c.costumes[c.costumes.length - 1].id;
        validateDesignProject(project);
        markDirty();
        renderAppearance();
        renderAll();
      } catch (e) {
        rollbackDesign(before);
        log(`${e.code || ''} ${e.message}`, 'error');
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
    async function previewSound(snd) {
      if (modelLocked()) return;
      stopPreview();
      const a = assetStore.get(snd.assetId);
      if (!a) return;
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) {
        log('R415 このブラウザでは 音を 鳴らせません', 'error');
        return;
      }
      let ac = null;
      try {
        ac = new AC();
        previewAudio = { context: ac, source: null };
        await ac.resume?.();
        if (previewAudio?.context !== ac) return;
        const bytes = a.bytes,
          copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          buf = await ac.decodeAudioData(copy);
        if (previewAudio?.context !== ac) return;
        const source = ac.createBufferSource();
        source.buffer = buf;
        source.connect(ac.destination);
        previewAudio.source = source;
        source.onended = () => {
          if (previewAudio?.source === source) stopPreview();
        };
        source.start();
      } catch (e) {
        if (!ac || previewAudio?.context === ac) {
          stopPreview();
          log(`R415 音を ためしに 鳴らせませんでした: ${e.message || e}`, 'error');
        }
      } finally {
        if (ac && previewAudio?.context !== ac)
          try {
            await ac.close();
          } catch (_) {}
      }
    }
    function finishAssetCommit(nextProject, nextStore, message) {
      project = nextProject;
      invalidateEditors();
      assetStore = nextStore.retainOnly(collectReachableAssetIds(nextProject));
      revokeDesignUrls();
      appState = 'DESIGN';
      setAssetProgress('');
      pushHistoryNow();
      dirty = currentFingerprint() !== lastSavedFingerprint;
      updateDirty();
      scheduleAutosave();
      renderAll();
      renderAppearance();
      refreshEditor();
      log(message, 'ok');
      setStatus(message);
    }
    async function runAssetImport(label, work, onError) {
      if (modelLocked()) return;
      if (!flushActiveEditor()) return;
      clearTimeout(historyTimer);
      pushHistoryNow();
      recoveryEpoch++;
      appState = 'IMPORTING';
      setAssetProgress(`${label}を たしかめて います…`);
      updateRunState();
      renderAppearance();
      try {
        await work();
        return true;
      } catch (e) {
        log(`${e.code || ''} ${label}を 入れられませんでした: ${e.message}`, 'error');
        setStatus(`${label}を 入れられなかったよ`);
        onError?.(e);
        return false;
      } finally {
        if (appState === 'IMPORTING') {
          appState = 'DESIGN';
          setAssetProgress('');
          updateRunState();
          renderAppearance();
        }
      }
    }
    async function importImageObject(file, { nativeSize = false, onError } = {}) {
      if (!file) return;
      return runAssetImport('絵', async () => {
        if (project.components.length >= LIMITS.components)
          throw new AkariError('F504', '部品が いっぱいで、もう ふやせません。いらない部品を けして ください');
        if (file.size > LIMITS.importFileBytes)
          throw new AkariError('F504', 'えらんだ ファイルが 大きすぎて 使えません。もっと 小さい ファイルに して ください', 0, 0, `入れられるファイルは${LIMITS.importFileBytes / 1048576}MiBまで`);
        const canonical = await canonicalizeImage(new Uint8Array(await file.arrayBuffer())),
          names = new Set(project.components.map((x) => x.name));
        let name = fileStemCandidate(file, names);
        if (name === 'マウス' || isEdgeTarget(name)) {
          let n = 2,
            base = name;
          do {
            name = `${base}_${n++}`;
          } while (names.has(name) || name === 'マウス' || isEdgeTarget(name));
        }
        validateResourceName(name, '部品の名前');
        const next = cloneDesignProject(project),
          store = new AssetStore(assetStore.snapshotRefs()),
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
          place = newPartPlace(next.components, next.stage, w * shown, h * shown,
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
        selectedId = id;
        currentEvent = 'start';
        selectedScriptId = null;
        finishAssetCommit(next, store, `絵「${name}」を キャラクターにして おいたよ`);
      }, onError);
    }
    async function importBackdropImage(file) {
      if (!file) return;
      return runAssetImport('はいけいの 絵', async () => {
        if (file.size > LIMITS.importFileBytes)
          throw new AkariError('F504', 'えらんだ ファイルが 大きすぎて 使えません。もっと 小さい ファイルに して ください', 0, 0, `入れられるファイルは${LIMITS.importFileBytes / 1048576}MiBまで`);
        const canonical = await canonicalizeImage(new Uint8Array(await file.arrayBuffer())),
          names = new Set(project.stage.backdrops.map((x) => x.name)),
          candidate = fileStemCandidate(file, names),
          name = prompt('はいけいの名前', candidate);
        if (name === null) return;
        validateResourceName(name, 'はいけいの名前');
        if (names.has(name)) throw new AkariError('F503', '同じ はいけいの名前が あります。ちがう名前に して ください');
        const next = cloneDesignProject(project),
          store = new AssetStore(assetStore.snapshotRefs()),
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
      const spriteId = selectedId;
      return runAssetImport('すがたの 絵', async () => {
        const cur = project.components.find((c) => c.id === spriteId);
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
        const next = cloneDesignProject(project),
          target = next.components.find((c) => c.id === spriteId),
          store = new AssetStore(assetStore.snapshotRefs()),
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
      return runAssetImport('音', async () => {
        if (file.size > LIMITS.importFileBytes)
          throw new AkariError('F504', 'えらんだ ファイルが 大きすぎて 使えません。もっと 小さい ファイルに して ください', 0, 0, `入れられるファイルは${LIMITS.importFileBytes / 1048576}MiBまで`);
        const canonical = await canonicalizeAudio(new Uint8Array(await file.arrayBuffer())),
          names = new Set(project.sounds.map((x) => x.name)),
          candidate = fileStemCandidate(file, names),
          name = prompt('音の名前', candidate);
        if (name === null) return;
        validateResourceName(name, '音の名前');
        if (names.has(name)) throw new AkariError('F503', '同じ 音の名前が あります。ちがう名前に して ください');
        const next = cloneDesignProject(project),
          store = new AssetStore(assetStore.snapshotRefs()),
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

    $('#hintSearch').oninput = () => {
      hintPage = 0;
      renderHints();
    };
    $('#hintUnavailable').onchange = () => {
      hintPage = 0;
      renderHints();
    };
    $('#hintPrev').onclick = () => {
      hintPage--;
      renderHints();
    };
    $('#hintNext').onclick = () => {
      hintPage++;
      renderHints();
    };
    $('#callableHintSearch').oninput = () => {
      callableHintPage = 0;
      renderCallableHints();
    };
    $('#callableHintPrev').onclick = () => {
      callableHintPage--;
      renderCallableHints();
    };
    $('#callableHintNext').onclick = () => {
      callableHintPage++;
      renderCallableHints();
    };
    for (const t of [el.editor, $('#callableCode')]) {
      const refresh =
        t === el.editor
          ? () => {
              hintPage = 0;
              renderHints();
            }
          : () => {
              callableHintPage = 0;
              renderCallableHints();
            };
      t.addEventListener('keydown', (e) => {
        if (
          e.key !== 'Enter' ||
          e.shiftKey ||
          e.ctrlKey ||
          e.altKey ||
          e.metaKey ||
          e.isComposing ||
          e.keyCode === 229 ||
          composingEditors.has(t) ||
          modelLocked()
        )
          return;
        const prefix = t.value.slice(0, t.selectionStart).split('\n').at(-1),
          indent = prefix.match(/^ */)[0];
        const code = normalizeSource(prefix).lines[0].code;
        const opens =
          /(?:なら、次のことをする|そうでなければ、次のことをする|(?:くり返す|繰り返す))$/.test(
            code,
          );
        e.preventDefault();
        const followingIndent = t.value.slice(t.selectionEnd).match(/^ */)[0].length;
        t.setRangeText(
          '\n' + ' '.repeat(Math.max(0, indent.length + (opens ? 2 : 0) - followingIndent)),
          t.selectionStart,
          t.selectionEnd,
          'end',
        );
        const caret = t.selectionEnd + followingIndent;
        t.setSelectionRange(caret, caret);
        t.dispatchEvent(new Event('input', { bubbles: true }));
      });
      t.addEventListener('compositionstart', () => {
        recoveryEpoch++;
        composingEditors.add(t);
        if (t === el.editor) refreshEditor();
      });
      t.addEventListener('compositionend', () => {
        composingEditors.delete(t);
        if (t === el.editor) {
          saveEditor({ fromInput: true });
          refreshEditor();
        } else updateCallableHeader();
      });
      for (const ev of ['click', 'keyup', 'select'])
        t.addEventListener(ev, (e) => {
          if (!e.isComposing && !composingEditors.has(t)) refresh();
        });
    }

    el.obj.addEventListener('change', () => selectObject(el.obj.value));
    el.event.addEventListener('change', () => {
      const next = el.event.value;
      if (next === 'all') { if (flushActiveEditor()) showSourceOverview(); return; }
      if (!flushActiveEditor()) {
        renderSelectors();
        return;
      }
      captureEditorView(mainEditor);
      if (!modelLocked()) {
        clearTimeout(historyTimer);
        pushHistoryNow();
      }
      hideSourceOverview();
      const row = next.startsWith('script:') ? scriptBySourceKey(project, next) :
        project.scripts.find((x) => x.targetId === selectedId && x.event === next);
      currentEvent = row?.event || next;
      selectedScriptId = row?.id || null;
      loadEditor();
      // Keep the selected body in the current frame without creating an edit.
      if (!modelLocked()) pushHistoryNow();
    });
    // 名人: the shown 名人 body is taken off the list (one step of undo).
    $('#meijinDelete').onclick = () => {
      if (modelLocked() || !currentIsMeijin() || !flushActiveEditor()) return;
      const row = (selectedScriptId && project.scripts.find(x => x.id === selectedScriptId)) || meijinScripts()[0];
      if (!row || !confirm('この 名人の本文を けす？')) return;
      clearTimeout(historyTimer); pushHistoryNow();
      project.scripts = project.scripts.filter(x => x !== row);
      const rest = meijinScripts();
      if (rest.length) { selectedScriptId = rest[0].id; } else { selectedId = 'stage'; currentEvent = 'start'; selectedScriptId = null; }
      hideSourceOverview(); markDirty(); renderAll(); loadEditor(); refreshEditor();
      clearTimeout(historyTimer); pushHistoryNow();
      setStatus('名人の本文を けしたよ');
    };
    $('#scriptAdd').onclick = () => {
      if (modelLocked() || !flushActiveEditor()) return;
      try {
        if (project.scripts.length >= LIMITS.scripts) throw new AkariError('F504', '本文が いっぱいで、もう ふやせません。いらない 本文を けして ください');
        const next = cloneDesignProject(project), id = ensureUniqueId('script');
        next.scripts.push(selectedId === MEIJIN_OWNER ? { id, mode: 'meijin', targetId: MEIJIN_OWNER, event: 'start', source: '' } : { id, targetId: selectedId, event: currentEvent, source: '', ...newBodyFilter(currentEvent) });
        validateDesignProject(next);
        clearTimeout(historyTimer); pushHistoryNow();
        project = next; selectedScriptId = id;
        hideSourceOverview(); markDirty(); loadEditor();
        clearTimeout(historyTimer); pushHistoryNow();
        el.editor.focus();
      } catch (error) { showEditorFailure(mainEditor, error); }
    };
    el.editor.addEventListener('input', () => {
      if (composingEditors.has(el.editor)) return;
      saveEditor({ fromInput: true });
      clearTimeout(el.editor._timer);
      el.editor._timer = setTimeout(refreshEditor, 100);
    });
    el.editor.addEventListener('scroll', () =>
      updateGutter(mainEditor.session?.diagnostics || []),
    );

    $('#failureClose').onclick = () => $('#failureModal').classList.remove('show');
    $('#failureSelect').onchange = () => {
      activeFailureId = Number($('#failureSelect').value);
      renderFailureDetails();
    };
    $('#valueClose').onclick = () => {
      $('#valueModal').classList.remove('show');
      valueView = null;
    };
    $('#valueItemPrev').onclick = () => {
      if (valueView) {
        valueView.index--;
        valueView.page = 0;
        renderFullValue();
      }
    };
    $('#valueItemNext').onclick = () => {
      if (valueView) {
        valueView.index++;
        valueView.page = 0;
        renderFullValue();
      }
    };
    $('#valueItem').onchange = () => {
      if (valueView) {
        const n = Number($('#valueItem').value);
        valueView.index = Number.isFinite(n) ? Math.trunc(n) - 1 : 0;
        valueView.page = 0;
        renderFullValue();
      }
    };
    $('#valuePagePrev').onclick = () => {
      if (valueView) {
        valueView.page--;
        renderFullValue();
      }
    };
    $('#valuePageNext').onclick = () => {
      if (valueView) {
        valueView.page++;
        renderFullValue();
      }
    };

    $('#runBtn').addEventListener('click', (event) => { runPressedAt = event.timeStamp; startRun(); });
    // ■ 止める takes ▶ 動かす's place: a press within 0.5 s of ▶ is the second press of a double press and does nothing
    // (a click, a tap, a pen press or a key alike).
    $('#stopBtn').addEventListener('click', (event) => {
      if (event.timeStamp - runPressedAt < 500) { el.form.focus({ preventScroll: true }); return; }
      stopRun();
    });
    // ⏸ いったん止める and ▶ つづける share one place: a press within 0.5 s of the last one there is the second press of a
    // double press and does nothing (it would pause and go on at once). After ⏸ the focus goes to ▶ つづける in the same
    // place; after ▶ つづける to the stage, as after ▶ 動かす, so keys reach the work (いっしょに作る keeps its own place).
    let pauseSlotPressedAt = -Infinity;
    const pauseSlotPress = (event) => {
      if (event.timeStamp - pauseSlotPressedAt < 500) {
        if (scheduler?.paused) $('#continueBtn').focus({ preventScroll: true });
        else if (tutorial) focusTutorialTarget();
        else if (event.currentTarget.closest('#runtimeInspector')) $('#pauseBtn').focus({ preventScroll: true });
        else el.form.focus({ preventScroll: true });
        return false;
      }
      pauseSlotPressedAt = event.timeStamp;
      return true;
    };
    $('#pauseBtn').onclick = (event) => {
      if (!pauseSlotPress(event) || !scheduler) return;
      scheduler.pause();
      if ($('#continueBtn').dataset.inactive !== 'true') $('#continueBtn').focus({ preventScroll: true });
    };
    $('#continueBtn').onclick = (event) => {
      if (!pauseSlotPress(event) || !scheduler) return;
      scheduler.resume();
      if (tutorial) focusTutorialTarget();
      // In 本文と動きのようす the stage is behind the dialog: the focus stays in the same place, on ⏸.
      else if (event.currentTarget.closest('#runtimeInspector')) $('#pauseBtn').focus({ preventScroll: true });
      else el.form.focus({ preventScroll: true });
    };
    $('#stepBtn').onclick = () => scheduler?.stepOne();
    $('#formatBtn').onclick = formatCurrent;
    $('#diagnoseBtn').onclick = showDiagnosis;
    $('#diagnosisClose').onclick = () => $('#diagnosisModal').classList.remove('show');
    function replaceCurrentProject(nextProject,nextAssets,targetId,event,status) {
      if(tutorial)return;
      // Discard view-local transactions only after the user confirms replacement.
      mainEditor.view.cancel();
      draftEditor.view.cancel();
      headerPending=null;
      for(const control of [mainEditor.textarea,draftEditor.textarea,$('#callableName'),$('#callableArgs'),$('#callablePhrase')])composingEditors.delete(control);
      clearTimeout(historyTimer);
      clearTimeout(autosaveTimer);
      recoveryEpoch++;
      activeDragCleanup?.();
      closeEditingModals();
      clearCallable();
      disposeRuntime();
      revokeDesignUrls();
      project=nextProject;
      workspaceIdentity++;
      assetStore=nextAssets;
      editorSessions.clear();
      invalidateEditors();
      selectedId=targetId;
      currentEvent=event;
      selectedScriptId=null;
      appState='DESIGN';
      hideSourceOverview();
      renderAll();
      loadEditor();
      resetHistory();
      clearAutosave();
      setStatus(status);
    }
    async function startProject() {
      if(tutorial||modelLocked())return;
      if(!(await askLose())||tutorial||modelLocked())return;
      // A new work starts in はじめて, which shows blocks.
      baseUiLevel='entry';editorModes.set('script','blocks');
      try{localStorage.setItem(STORAGE_KEYS.uiLevel,'entry');localStorage.setItem(STORAGE_KEYS.editorMode,'blocks');}catch(_){}
      replaceCurrentProject(makeEmptyProject(),makeDefaultAssetStore(),'sprite-1','start','からっぽの 作品だよ。動かすものと きっかけを えらんで、やることを 入れてね');
      applyUiLevel();renderHints();renderEntrySurface();renderEditorBinding(mainEditor);
    }
    $('#newBtn').onclick=startProject;
    // Two fixed built-in preview images, shared across cards and picker openings.
    // Keep the existing blob-only image CSP; never load a data URL into the DOM.
    const samplePreviewUrls = new Map();
    function fillSamplePicture(picture, id) {
      picture.innerHTML = (SAMPLE_ART[id] || '').replaceAll('href="data:image/png;base64,', 'data-sample-image="');
      for (const image of picture.querySelectorAll('image[data-sample-image]')) {
        const encoded = image.getAttribute('data-sample-image');
        if (!samplePreviewUrls.has(encoded)) {
          const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
          samplePreviewUrls.set(encoded, URL.createObjectURL(new Blob([bytes], {type:'image/png'})));
        }
        image.removeAttribute('data-sample-image');
        image.setAttribute('href', samplePreviewUrls.get(encoded));
      }
    }
    function showSamplePicker() {
      if (!openRequest || openRequest.kind !== 'sample' || modelLocked()) return;
      const grid = $('#sampleGrid');
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
      $('#samplePicker').showModal();
    }
    function requestSampleProject() {
      if(tutorial)return;
      if (modelLocked() || openRequest || document.querySelector('.modal.show:not(#procModal),.modal.open,dialog[open]')) return;
      confirmOpenRequest('sample');
    }
    function openSampleProject(id) {
      if (modelLocked() || openRequest?.kind !== 'sample' || openRequest.phase !== 'selection') return;
      const approval = openRequest;
      // A stale approval cannot discard edits made after the picker was opened.
      const observed = currentOpenState();
      if (observed.fingerprint !== approval.fingerprint && observed.unsaved) {
        $('#samplePicker').close(); openRequest=null; requestSampleProject(); return;
      }
      try {
        const sample = sampleCatalog().find(row=>row.id===id);
        if (!sample) throw new AkariError('F512','お手本が 見つかりません');
        const nextProject = makeSampleProject(id), nextAssets = makeSampleAssetStore(id);
        openRequest=null; $('#samplePicker').close();
        replaceCurrentProject(nextProject,nextAssets,sample.targetId,sample.event,`「${sample.title}」を 開いたよ。動かして みよう！`);
      } catch(error) { log('お手本を 開けませんでした: '+error.message,'error'); setStatus('お手本を 開けなかったよ'); }
    }
    $('#sampleBtn').onclick=requestSampleProject;
    $('#samplePickerClose').onclick=()=>$('#samplePicker').close();
    $('#samplePicker').addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...$('#samplePicker').querySelectorAll('button:not(:disabled)')];
      const first = controls[0], last = controls.at(-1);
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    });
    $('#samplePicker').addEventListener('close',()=>{
      // close events are queued: don't clear a newer confirmation opened meanwhile.
      if(openRequest?.kind==='sample' && openRequest.phase==='selection')openRequest=null;
      if(!document.querySelector('.modal.show:not(#procModal),dialog[open]'))$('#sampleBtn').focus({preventScroll:true});
    });
    $('#saveBtn').onclick = saveProject;
    $('#entryStartEvent').onclick=()=>selectEntryEvent('start');
    $('#entryClickEvent').onclick=()=>selectEntryEvent('click');
    $('#tutorialStart').onclick=beginTutorial;
    $('#tutorialExit').onclick=()=>{finishTutorial(false);setStatus('とちゅうの 作品は のこって いるよ。じゆうに つづけられるよ。');};
    $('#tutorialVerifySave').onclick=()=>{if(tutorialAllows(tutorial,'verify-save')){$('#tutorialSavedFile').value='';$('#tutorialSavedFile').click();}};
    $('#tutorialSavedFile').onchange=event=>{const file=event.target.files?.[0];event.target.value='';verifyTutorialSave(file);};
    $('#tutorialSavedFile').addEventListener('cancel',()=>{if(tutorial){tutorialNotice={step:tutorialStep(tutorial)?.id,text:'ファイルを えらぶのを やめたよ。もう一度 えらぶか、「いっしょに 作るのを やめる」を おしてね。'};tutorialRefresh();}});
    $('#callableSaveProject').onclick = saveProject;
    $('#exportBtn').onclick = exportProject;
    $('#exportControls').onclick = () => downloadProject('controls');
    $('#exportArtwork').onclick = () => downloadProject('artwork');
    $('#exportChoiceCancel').onclick = cancelPlayerExport;
    $('#openBtn').onclick = requestOpenProject;
    $('#openRefusalClose').onclick = closeOpenRefusal;
    $('#loseConfirmProceed').onclick = () => loseConfirm?.(true);
    $('#loseConfirmCancel').onclick = () => loseConfirm?.(false);
    // ほぞんしてから つづける: the work file is saved first; when it cannot be saved the work stays and the dialog too.
    $('#loseConfirmSave').onclick = () => { if (loseConfirm && saveProject()) loseConfirm?.(true); };
    el.fileInput.addEventListener('cancel', finishOpenSelection);
    el.fileInput.addEventListener('change', async () => {
      const file = el.fileInput.files?.[0], approval = openRequest?.phase === 'selection' ? openRequest : null;
      // Consume the approval before async loading. Failure/cancel/completion can
      // never lend it to the next operation or an alternate import route.
      openRequest = null;
      try { if (file) await openProject(file, approval); }
      finally { finishOpenSelection(); }
    });
    const historyPress = (action, other) => (event) => {
      action();
      if (event.currentTarget.disabled) {
        if (!other.disabled) other.focus({ preventScroll: true });
        else if (shownEditorMode() === 'code') el.editor.focus({ preventScroll: true });
        else mainEditor.view?.focus({ id: mainEditor.session?.blockSelection });
      }
    };
    $('#undoBtn').onclick = historyPress(undo, $('#redoBtn'));
    $('#redoBtn').onclick = historyPress(redoDo, $('#undoBtn'));
    $('#resetBtn').onclick = () => {
      if (modelLocked()) return;
      if (!flushActiveEditor()) return;
      pushHistoryNow();
      if (initialSnapshot) {
        restoreSnap(initialSnapshot);
        pushHistoryNow();
      }
      setStatus('作品を 開いたときの ようすに もどしたよ');
    };
    $('#imageObjectAdd').onclick = () => {
      if (!modelLocked()) $('#imageObjectInput').click();
    };
    const paintEditor = createPaintEditor(async (canvas) => {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('絵を 作れませんでした');
      let errorMessage = '絵を おけませんでした';
      const ok = await importImageObject(new File([blob], 'お絵かき.png', { type: 'image/png' }), {
        nativeSize: true,
        onError: error => { errorMessage = error.message; },
      });
      if (!ok) throw new Error(errorMessage);
    });
    $('#paintAdd').onclick = () => {
      if (!modelLocked() && flushActiveEditor()) paintEditor.open();
    };
    $('#soundQuickAdd').onclick = () => {
      if (!modelLocked()) $('#soundInput').click();
    };
    $('#assetBtn').onclick = () => {
      renderAppearance();
      $('#assetModal').classList.add('show');
    };
    $('#assetClose').onclick = () => {
      stopPreview();
      $('#assetModal').classList.remove('show');
    };
    $('#dataBtn').onclick = () => {
      renderDataModal();
      $('#dataModal').classList.add('show');
    };
    $('#dataClose').onclick = () => $('#dataModal').classList.remove('show');
    $('#dataScope').onchange = renderDataModal;
    $('#dataKind').onchange=()=>{clearDataFormError();updateDataForm();};
    $('#dataListMode').onchange=()=>{clearDataFormError();updateDataForm();};
    $('#dataAdd').onclick = addData;
    $('#callableSelect').onchange = () => {
      const next = $('#callableSelect').value;
      if (next.startsWith('meijin:')) {
        if (confirmCallableDiscard()) showMeijinProcedure(next.slice('meijin:'.length));
        else $('#callableSelect').value = callableLoadedKey;
        return;
      }
      if (confirmCallableDiscard()) { loadCallable(next); pushHistoryNow(); }
      else $('#callableSelect').value = callableLoadedKey;
    };
    $('#callableNewAction').onclick = () => {
      if (confirmCallableDiscard()) { clearCallable('action'); pushHistoryNow(); }
    };
    $('#callableNewFunction').onclick = () => {
      if (confirmCallableDiscard()) { clearCallable('function'); pushHistoryNow(); }
    };
    $('#callableSave').onclick = saveCallable;
    $('#meijinProcRename').onclick = renameMeijinProcedure;
    $('#meijinProcOpen').onclick = openMeijinProcedure;
    $('#callableFormat').onclick = formatCallable;
    $('#callableDelete').onclick = deleteCallable;
    $('#callableName').oninput = updateCallableHeader;
    $('#callableArgs').oninput = updateCallableHeader;
    $('#callablePhrase').oninput = updateCallableHeader;
    $('#callableCode').oninput = updateCallableHeader;
    $('#backdropAdd').onclick = addBackdrop;
    $('#costumeAdd').onclick = addCostume;
    $('#imageObjectAddModal').onclick = () => {
      if (!modelLocked()) $('#imageObjectInput').click();
    };
    $('#backdropImageAdd').onclick = () => {
      if (!modelLocked()) $('#imageBackdropInput').click();
    };
    $('#costumeImageAdd').onclick = () => {
      if (!modelLocked()) $('#imageCostumeInput').click();
    };
    $('#soundAdd').onclick = () => {
      if (!modelLocked()) $('#soundInput').click();
    };
    $('#imageObjectInput').onchange = async (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) await importImageObject(f);
    };
    $('#imageBackdropInput').onchange = async (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) await importBackdropImage(f);
    };
    $('#imageCostumeInput').onchange = async (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) await importCostumeImage(f);
    };
    $('#soundInput').onchange = async (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) await importSoundFile(f);
    };
    $('#uiLevel').onchange = () => {
      // The level is chosen on the edit screen only (the picker is not shown while the work runs). The list holds only the
      // levels of the view, so choosing one never changes the view.
      if (modelLocked() || !uiLevelChoices().includes($('#uiLevel').value)) { applyUiLevel(); return; }
      // 名人: the selected body becomes a 名人 text after the confirm (an empty one when there is no body to move).
      if($('#uiLevel').value==='meijin'){
        $('#uiLevel').value=baseUiLevel;
        if (tutorial || composingAny() || headerPending || activeDragCleanup) { setStatus('入力を 決めるか やめてから、レベルを かえてね。'); return; }
        if(!workIsMeijin())startMeijin();
        applyUiLevel();renderHints();renderEntrySurface();renderEditorBinding(mainEditor);mainEditor.view.render({force:true});
        return;
      }
      if (tutorial || composingAny() || [mainEditor,draftEditor].some(binding=>binding.session?.pendingEdit&&binding.session.pendingEdit.kind!=='block-draft') || headerPending || activeDragCleanup) {
        applyUiLevel();
        setStatus('入力を 決めるか やめてから、レベルを かえてね。');
        return;
      }
      baseUiLevel = $('#uiLevel').value;
      applyUiLevel();
      // はじめて has no すべての本文 (nor its 「本文を なおす ところへ もどる」): the list closes, and the body it was opened
      // from is shown again, as that button would.
      if (baseUiLevel === 'entry' && sourceOverviewOpen) { hideSourceOverview(); loadEditor(); }
      try {
        localStorage.setItem(STORAGE_KEYS.uiLevel, baseUiLevel);
      } catch (_) {}
      // はじめて shows the start and click bodies only, with a button for each: a body of another きっかけ chosen before gives
      // way to the start body (the click body for a part with no start), so the body shown is the one a pressed button
      // names (F-05, F2-04).
      if (document.body.dataset.uiLevel === 'entry' && !['start', 'click'].includes(currentEvent))
        selectEntryEvent(eventsFor(selectedId).includes('start') ? 'start' : 'click');
      renderHints();
      renderEntrySurface();
      renderEditorBinding(mainEditor);
      mainEditor.view.render({force:true});
      if ($('#procModal').classList.contains('show')) renderEditorBinding(draftEditor);
    };
    let storedUiLevel = null;
    try {
      storedUiLevel = localStorage.getItem(STORAGE_KEYS.uiLevel);
    } catch (_) {}
    baseUiLevel = normalizeEntryUiLevel(storedUiLevel);
    applyUiLevel();
    let storedEditorMode = null;
    try { storedEditorMode = localStorage.getItem(STORAGE_KEYS.editorMode); } catch (_) {}
    editorModes.set('script', ['code', 'blocks'].includes(storedEditorMode) ? storedEditorMode : 'blocks');
    if(document.body.dataset.uiLevel==='entry'&&editorModes.get('script')==='code'){
      baseUiLevel='basic';applyUiLevel();
    }
    el.projectName.addEventListener('change', () => {
      if (modelLocked()) {
        el.projectName.value = project.name;
        return;
      }
      const v = el.projectName.value.trim();
      if (v && cpLen(v) <= 80) {
        project.name = v;
        markDirty();
        renderAll();
      } else el.projectName.value = project.name;
    });
    $$('.tool').forEach((b) => {
      b.addEventListener('click', () =>
        addComponent(b.dataset.type, null, null, b.dataset.spritePreset || ''),
      );
      b.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/akari-tool', b.dataset.type);
        if (b.dataset.spritePreset)
          e.dataTransfer.setData('text/akari-sprite-preset', b.dataset.spritePreset);
      });
    });
    el.form.addEventListener('dragover', (e) => {
      if (!runtime) e.preventDefault();
    });
    el.form.addEventListener('drop', (e) => {
      if (runtime) return;
      e.preventDefault();
      const type = e.dataTransfer.getData('text/akari-tool'),
        preset = e.dataTransfer.getData('text/akari-sprite-preset');
      if (type) {
        const r = el.form.getBoundingClientRect();
        addComponent(
          type,
          ((e.clientX - r.left) * project.stage.width) / r.width,
          ((r.bottom - e.clientY) * project.stage.height) / r.height,
          preset,
        );
      }
    });
    $('#questionSubmit').onclick = () => {
      const cb = questionCb,
        v = $('#questionAnswer').value;
      if (cb) cb(v);
    };
    $('#questionAnswer').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        e.stopPropagation();
        $('#questionSubmit').click();
      }
    });
    $('#recoveryRestore').onclick = () => {
      if (!recoveryData) return;
      try {
        const {frames,cursor}=recoveryData.restored;
        workspaceIdentity++;
        clearTimeout(historyTimer);clearTimeout(autosaveTimer);
        lastSavedFingerprint=recoveryData.lastSavedFingerprint;
        lastSavedEditorFingerprint=recoveryData.lastSavedEditorFingerprint;
        history=frames.slice(0,cursor+1);redo=frames.slice(cursor+1).reverse();
        initialSnapshot=history[0];restoreSnap(history.at(-1),{restoreView:true});
        $('#recoveryModal').classList.remove('show');recoveryData=null;
        log('このパソコンに のこした 作品と、もとに もどせる きろくを もどしました','ok');
        setStatus(`「${project.name}」の つづきから 作れるよ`);
        // After the dialog has let go of the page (the modal manager clears #app.inert on its own turn).
        setTimeout(()=>$('#runBtn').focus({preventScroll:true}),0);
        // What was restored is what this computer keeps: the state says so at once (restoreSnap marked it as not kept).
        el.autosave.textContent = 'このパソコンに のこして あるよ';
      } catch (err) {
        log('このパソコンに のこした 作品を もどせませんでした。ほぞんした 作品ファイルが あれば、「開く」で えらんで ください。', 'error');
        setStatus('このパソコンに のこした 作品を もどせなかったよ。ほぞんした ファイルが あれば「開く」で えらんでね');
      }
    };
    $('#recoveryDiscard').onclick = () => {
      $('#recoveryModal').classList.remove('show');
      recoveryData = null;
      clearAutosave();
      // The status line says what is true now (F-11), and the focus stays on the page's controls.
      setStatus('このパソコンに のこした 作品を けしたよ');
      setTimeout(()=>$('#runBtn').focus({preventScroll:true}),0);
    };

    // Delete removes the selected part only while the child works with the parts: the focus is on the stage, the part
    // list or the tools that add parts, or it is on the page and the last press was there (a part list row takes no
    // focus). After a press in the body window (a block's 「けす」, もとに もどす, the 本文 heading) or the toolbar, Delete
    // never removes a part.
    const PART_PLACES = '#designerWindow, .side, .toolbox';
    let partPressed = false;
    document.addEventListener('pointerdown', (e) => { partPressed = !!e.target.closest?.(PART_PLACES); }, true);
    window.addEventListener('keydown', (e) => {
      if (
        e.isComposing ||
        e.keyCode === 229 ||
        e.key !== 'Delete' ||
        modelLocked() ||
        selectedId === 'stage'
      )
        return;
      if (document.querySelector('.modal.show')) return;
      const focused = document.activeElement, tag = focused?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      const onPage = !focused || focused === document.body || focused === document.documentElement;
      if (!(onPage ? partPressed : focused.closest(PART_PLACES))) return;
      e.preventDefault();
      deleteSelectedComponent();
    });
    window.addEventListener('beforeunload', (e) => {
      if (
        dirty ||
        paintEditor.hasDrawing() ||
        hasCallableDraft() ||
        (colorEdit && colorEdit.value !== colorEdit.original) ||
        headerPending ||
        mainEditor.session?.pendingEdit || mainEditor.session?.blockDraft ||
        draftEditor.session?.pendingEdit || draftEditor.session?.blockDraft ||
        composingEditors.has(el.editor) ||
        composingEditors.has(draftEditor.textarea)
      ) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    installEditorShell();
    for (const binding of [mainEditor, draftEditor]) {
      const draft = binding.kind === 'draft',
        p = draft ? 'callable' : 'editor';
      binding.view = createBlockEditorView({
        // A notice's rewrite by the block (I120, p2 Q5 (d)) is the same as the one under the code and in 作品チェック.
        onNoteProposal: (note, proposal) => applyNoteProposal(note, proposal),
        onExpand:
          binding.kind === 'script'
            ? () => {
                const expanded = document.body.dataset.workbenchWide !== 'true';
                document.body.dataset.workbenchWide = String(expanded);
                $('#stageThumbnail').hidden = !expanded;
                syncWideInert();
                requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
                return expanded;
              }
            : null,
        root: $(draft ? '#callableBlocks' : '#blockEditor'),
        // The free middle of the row above the workspace, between すべての本文… and もとに もどす…: the floating
        // The cancel control (「入れるのを やめる」) goes there while a place is chosen, so it covers no block (E-12).
        controlsSpace: draft ? null : () => {
          const nav = $('.codewin > .source-nav'), bar = $('.codewin > .debugbar');
          if (!nav?.getClientRects().length || !bar?.getClientRects().length) return null;
          const shown = (n) => [...n.children].filter(c => c.getClientRects().length && getComputedStyle(c).visibility !== 'hidden').map(c => c.getBoundingClientRect());
          const left = shown(nav), right = shown(bar), row = bar.getBoundingClientRect();
          if (Math.abs(nav.getBoundingClientRect().top - row.top) > 4) return null;
          return { left: Math.max(nav.getBoundingClientRect().left, ...left.map(r => r.right)) + 8,
            right: Math.min(row.right, ...right.map(r => r.left)) - 8, top: row.top, bottom: row.bottom };
        },
        getSession: () => getEditorSession(binding),
        getProject: () => project,
        getContext: () => bindingContext(binding),
        tutorialActive: () => !!tutorial,
        onDestinationSelected: selectTutorialInsertion,
        onPresentation: refreshTutorialPresentation,
        lessonCandidate: () => { const step=tutorialStep(tutorial),key=step?.block;return key?{key,node:tutorialCandidate(key,project,step.id),label:TUTORIAL_BLOCKS[key].label}:null; },
        onData: () => $('#dataBtn').click(),
        isLocked: modelLocked,
        onOperation: (operation) => operateBlock(binding, operation),
        onPending: (pending) => {
          if (binding.session) binding.session.pendingEdit = pending || (binding.session.blockDraft
            ? binding.session.blockDraft.pending : null);
          // A cancelled field edit leaves nothing to fix, so its message goes away with it.
          if (!pending && !binding.session?.blockDraft) {clearEditorFailure(binding);keepTutorialTargetInView();}
          scheduleAutosave();
        },
        onCancel: () => {
          clearEditorFailure(binding);
          if (binding.session) binding.session.pendingEdit = binding.session.blockDraft
            ? binding.session.blockDraft.pending : null;
          // はじめて's note on blocks it does not show follows the body as it is again.
          if (binding === mainEditor) renderEntrySurface();
        },
      });
      for (const mode of ['code', 'blocks'])
        $(`#${p}Mode${mode}`).onclick = (event) => {
          // Input commits precede the delayed repaint. Decide this press from the current body, so a repaired
          // sentence does not inherit the previous keystroke's refusal (and a new error cannot use an old permit).
          getEditorSession(binding);
          paintBindingModeToggle(binding);
          if (event.currentTarget.dataset.refused) showModeBlockedNote(binding);
          else switchEditorMode(binding, mode);
        };
      $(`#${p}Cancel`).dataset.blockuiAction = 'cancel';
      $(`#${p}Cancel`).onclick = () => cancelEditorPending(binding);
    }
    callableBaseline = callableSignature();
    $('#questionStop').onclick = stopRun;
    // Large multiline insertion through the browser's native editing command can
    // stall before `input`. Range replacement keeps the same source/history path.
    for (const t of [el.editor, draftEditor.textarea]) {
      const insertLarge = (event, text) => {
        if (
          typeof text !== 'string' ||
          text.length < 4096 ||
          event.isComposing ||
          composingEditors.has(t) ||
          modelLocked() ||
          t.readOnly
        )
          return false;
        event.preventDefault();
        t.setRangeText(text, t.selectionStart, t.selectionEnd, 'end');
        t.dispatchEvent(
          new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: text }),
        );
        return true;
      };
      t.addEventListener('beforeinput', (event) => {
        if (event.cancelable && event.inputType.startsWith('insert'))
          insertLarge(event, event.data);
      });
      t.addEventListener('paste', (event) =>
        insertLarge(event, event.clipboardData?.getData('text/plain')),
      );
    }
    for (const t of [$('#callableName'), $('#callableArgs'), $('#callablePhrase')]) {
      t.addEventListener('compositionstart', () => {
        recoveryEpoch++;
        composingEditors.add(t);
        headerPending = { ownerKey: draftOwner(), composing: true };
      });
      t.addEventListener('compositionend', () => {
        composingEditors.delete(t);
        updateCallableHeader();
      });
    }
    // Native textarea history must not diverge from the project/draft history.
    document.addEventListener(
      'beforeinput',
      (event) => {
        if (!['historyUndo', 'historyRedo'].includes(event.inputType) || event.isComposing) return;
        if (event.target.matches('#codeEditor,#callableCode,#callableName,#callableArgs,#callablePhrase')) {
          event.preventDefault();
          event.inputType === 'historyUndo' ? undo() : redoDo();
        }
      },
      true,
    );
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.isComposing || event.keyCode === 229 || composingEditors.has(event.target))
          return;
        if (
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          ['z', 'y'].includes(event.key.toLowerCase())
        ) {
          if (document.querySelector('.modal.show:not(#procModal),#samplePicker[open]')) return;
          const input = event.target.closest('input,textarea,[contenteditable]');
          if (input && (input.closest('dialog[open]') || !input.matches(
            '#codeEditor,#callableCode,#callableName,#callableArgs,#callablePhrase,[data-blockui-field],[data-blockui-annotation],[data-blockui-structured-role]',
          ))) {
            // Searches and standalone text dialogs keep native text history.
            // Do not let the block editor flush their input on the bubbling shortcut.
            event.stopPropagation();
            return;
          }
          event.preventDefault();
          event.stopImmediatePropagation();
          event.key.toLowerCase() === 'y' || event.shiftKey ? redoDo() : undo();
        }
        // Delete stays inside the block editor; on a selected sentence the editor itself deletes the block (E-05), and on a
        // selected value it says what to do instead (FCB-20), as Backspace does.
        if (event.key === 'Delete' && event.target.closest('#blockEditor,#callableBlocks') &&
            !event.target.matches('.blockui-world .blockui-node:is(.blockui-statement, .blockui-expression)'))
          event.stopPropagation();
      },
      true,
    );
    // Buttons outside the active editor close its input transaction first. A rejected
    // pending field keeps the originating owner, DOM focus, history and redo intact.
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target.closest('button,.tree-item,.tool');
        // うごく作品を ファイルにする closes the input itself and says why it does not go on (exportProject), as ▶ does.
        if (target?.matches('#exportBtn')) return;
        if (!target || modelLocked() || target.closest('#colorModal,#paintModal')) return;
        if (
          // The note under the code holds the way out of a pending edit (its rewrites and 書いた文のまま考える).
          target.closest('#blockEditor,#callableBlocks,.editor-modes,#sourceImport,#loseConfirmModal,#samplePicker,#editorPending,#callablePending') ||
          // ▶ 動かす closes the input itself and says why it does not run (startRun).
          target.matches('#tutorialStart,#tutorialExit,#undoBtn,#redoBtn,#saveBtn,#callableSaveProject,#newBtn,#sampleBtn,#openBtn,#procBtn,#procClose,[data-blockui-action="cancel"],#sourceHeadingBtn[aria-disabled="true"],#runBtn')
        )
          return;
        if (!flushActiveEditor()) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        clearTimeout(historyTimer);
        pushHistoryNow();
      },
      true,
    );
    document.addEventListener(
      'change',
      (event) => {
        if (
          modelLocked() ||
          (event.target===intentInputFocus?.textarea&&intentInputFocus.current()) ||
          event.target.closest('#blockEditor,#callableBlocks,#sourceImport,#colorModal,#paintModal,[data-intent-input]') ||
          (event.target.matches('#codeEditor') && ['source-import','heading-source'].includes(mainEditor.session?.pendingEdit?.kind)) ||
          event.target.matches('#uiLevel,#objectSelect,#eventSelect,#callableType,#callableSelect,#fileInput')
        )
          return;
        if (!flushActiveEditor()) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        clearTimeout(historyTimer);
        pushHistoryNow();
      },
      true,
    );
    document.addEventListener(
      'focusin',
      (event) => {
        if (
          modelLocked() ||
          flushingEditor ||
          event.target.matches('.diagnostic-details > summary') ||
          // Menu navigation does not commit input; each chosen action owns its guard.
          event.target.closest('#projectMenu > summary,#exportBtn,.editor-modes,#sourceImport,#colorModal,#samplePicker,#loseConfirmModal,#uiLevel,#tutorialStart,#tutorialExit,#saveBtn,#callableSaveProject,#newBtn,#sampleBtn,#openBtn,#procBtn,#procClose,[data-blockui-action="cancel"]')
        )
          return;
        const binding = $('#procModal').classList.contains('show') ? draftEditor : mainEditor;
        if (
          !binding.session?.pendingEdit &&
          !headerPending &&
          !composingEditors.has(binding.textarea)
        )
          return;
        const root = $(binding.kind === 'draft' ? '#callableBlocks' : '#blockEditor');
        if (
          root.contains(event.target) ||
          event.target === binding.textarea ||
          // The focus may go to the note's rewrites (Tab from the code): they decide the pending edit themselves.
          event.target.closest('#editorPending,#callablePending') ||
          event.target.matches('#callableName,#callableArgs,#callablePhrase')
        )
          return;
        if (!flushActiveEditor()) {
          event.stopImmediatePropagation();
          if (binding.session?.mode !== 'blocks') binding.textarea.focus({ preventScroll: true });
        }
      },
      true,
    );
    $('#procBtn').onclick = () => {
      if (!flushEditor(mainEditor)) return;
      if (!hasCallableDraft()) renderCallableList(callableLoadedKey);
      $('#procModal').classList.add('show');
      renderEditorBinding(draftEditor);
      if (!modelLocked()) pushHistoryNow();
    };
    $('#sourceOverviewBtn').onclick = () => { if (flushActiveEditor()) showSourceOverview(); };
    $('#sourceEditBtn').onclick = () => { hideSourceOverview(); loadEditor(); };
    $('#sourceHeadingBtn').onclick = (event) => {
      if (event.currentTarget.getAttribute('aria-disabled') === 'true') { showBlockedNote(headingBlockedNote()); return; }
      if (modelLocked() || !switchEditorMode(mainEditor, 'blocks')) return;
      const selected=$('#blockEditor .blockui-selected'),scope=selected?.closest('.blockui-script');
      const field=(scope||$('#blockEditor')).querySelector('[data-blockui-structured-role="heading.event"]');
      if (!field) return;
      for (let parent=field.parentElement;parent;parent=parent.parentElement)
        if (parent.tagName==='DETAILS') parent.open=true;
      field.scrollIntoView({block:'center'}); field.focus({preventScroll:true});
      setStatus('「いつ動く？」で きっかけを えらんでね。「この 本文の きっかけを かえる」で 決まるよ。「かえるのを やめる」で もとに もどれるよ');
    };
    $('#sourceStageBtn').onclick = () => { if (selectObject('stage')) showSourceOverview(); };
    $('#procClose').onclick = () => {
      flushActiveEditor();
      try {
        const saved=captureEditorState();if(saved.callableDraft)callableDraftCore={...saved.callableDraft};
        $('#procModal').classList.remove('show');
        if (sourceOverviewOpen) renderSourceOverview();
        scheduleAutosave();
      } catch(error) { showEditorFailure(draftEditor,error); }
    };
    $('#callableType').onchange = () => {
      if (!flushEditor(draftEditor)) {
        $('#callableType').value = callableDraftCore.type;
        return;
      }
      updateCallableHeader();
    };
    $('#console').textContent = `${productLabel(true)}が はじまりました。`;
    installColorPicker();
    resetHistory();
    renderAll();
    loadEditor();
    setupModalAccessibility();
    checkRecovery();
    // The version is in 出力 (はじまりました); the status line says only what is true now.
    setStatus(emptyProjectStatus());
    app = {
      get editorState() {
        return {
          sourceOverviewOpen,
          selectedScriptId,
          sourceRegistry: sourceRegistry(project).map(({ key, ownerId }) => ({ key, ownerId })),
          main: mainEditor.session,
          draft: draftEditor.session,
          callableDraft: { ...callableDraftCore },
          hasDraft: hasCallableDraft(),
          history: history.length,
          redo: redo.length,
          state: appState,
          dirty,
          contextRevision: editorContextRevision,
        };
      },
      get project() {
        return project;
      },
      get assetStore() {
        return assetStore;
      },
      compile: () => compileProject(project),
      startRun,
      stopRun,
      showDiagnosis,
      exportProject,
    };
  }

