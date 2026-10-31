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
    // The state initApp shares with the parts of the application (src/js/11-*): assigned where it was declared.
    const appVars = {};
    const appCalls = {};
    const appRedraw = {};
    createAppToolsCore(appVars, appCalls, appRedraw);
    createAppTools(appVars, appCalls, appRedraw);
    createAppServices(appVars, appCalls, appRedraw);
    createAppCommands(appVars, appCalls, appRedraw);
    createAppDrawing(appVars, appCalls, appRedraw);
    appVars.initialSnapshot = null,
      appVars.autosaveQueue = Promise.resolve(),
      appVars.recoveryEpoch = 0,
      appVars.autosaveRevisionTime = 0,
      appVars.lastObservedFingerprint = null,
      appVars.activeDragCleanup = null,
      appVars.designResizePreview = null,
      appVars.colorEdit = null;
    appVars.callableBaseline = '',
      appVars.callableLoadedKey = '',
      appVars.debugSourceKey = null,
      appVars.runtimePaintFrame = null,
      appVars.runtimePaintFlags = 0;
    appVars.physicalKeys = new Map();
    appVars.project = makeEmptyProject(),
      appVars.assetStore = makeDefaultAssetStore(),
      appVars.selectedId = 'sprite-1',
      appVars.currentEvent = 'start',
      appVars.selectedScriptId = null,
      appVars.runtime = null,
      appVars.runtimeCache = null,
      appVars.scheduler = null,
      appVars.compiled = null,
      appVars.activeLoc = null,
      // Where the run stopped by a mistake: after ■ 止める the place stays marked until the next edit.
      appVars.keptFail = null,
      appVars.activeTaskId = null,
      appVars.dirty = false,
      appVars.lastSavedFingerprint = '',
      appVars.lastSavedEditorFingerprint = '',
      appVars.history = [],
      appVars.redo = [],
      appVars.historyTimer = null,
      appVars.queuedHistory = null,
      appVars.autosaveTimer = null,
      appVars.recoveryData = null,
      appVars.appState = 'DESIGN',
      // The run screen after the run ended (every body done, or 作品を全部止める): the last picture stays, ■ 止める only.
      appVars.runFinished = false,
      // The run stopped at a mistake (the failure dialog): it cannot go on, so the run screen shows ■ 止める only.
      appVars.runFailed = false,
      // When ▶ 動かす was pressed: ■ 止める takes its place, and a press of it within 0.5 s (the second press of a double
      // press) does nothing.
      appVars.runPressedAt = -Infinity,
      appVars.generationToken = 0,
      appVars.designObjectUrls = new Map(),
      appVars.previewAudio = null;
    appVars.el = {
      form: appCalls.$('#formSurface'),
      frame: appCalls.$('#formFrame'),
      title: appCalls.$('#formTitle'),
      canvas: appCalls.$('#penCanvas'),
      tree: appCalls.$('#projectTree'),
      props: appCalls.$('#properties'),
      monitor: appCalls.$('#runtimeMonitor'),
      obj: appCalls.$('#objectSelect'),
      event: appCalls.$('#eventSelect'),
      editor: appCalls.$('#codeEditor'),
      gutter: appCalls.$('#lineGutter'),
      issue: appCalls.$('#codeIssue'),
      hints: appCalls.$('#codeHints'),
      console: appCalls.$('#console'),
      status: appCalls.$('#statusText'),
      autosave: appCalls.$('#autosaveState'),
      runState: appCalls.$('#runState'),
      dirty: appCalls.$('#dirtyState'),
      projectName: appCalls.$('#projectName'),
      fileInput: appCalls.$('#fileInput'),
    };
    appVars.propertyHeaderObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(appCalls.syncPropertyScrollPadding) : null;
    appVars.editorContextRevision = 1,
      appVars.editorDraftSerial = 1,
      appVars.syncingDraft = false,
      appVars.headerPending = null;
    appVars.callableDraftCore = {
      ownerId: 'stage',
      type: 'action',
      name: '',
      argsText: '',
      source: '',
      editId: '',
      loadedKey: '',
    };
    appVars.editorSessions = new Map(),
      appVars.editorModes = new Map();
    appVars.mainEditor = { kind: 'script', textarea: appVars.el.editor, session: null, view: null };
    appVars.draftEditor = {
      kind: 'draft',
      textarea: appCalls.$('#callableCode'),
      session: null,
      view: null,
    };
    appVars.sourceOverviewOpen = false, appVars.sourceOverviewViews = [], appVars.sourceOverviewObserver = null, appVars.sourceOverviewSignature = '';
    appVars.entryLayoutPlaced=false;
    appVars.entryControlHomes=new Map();
    appVars.placeHistoryButtons=()=>{};
    // tutorialNotice: a short answer to the child's last try on one step (ことばを 入れてね), shown until the step changes.
    appVars.tutorial=null, appVars.pausedTutorial=null, appVars.tutorialEpoch=0, appVars.workspaceIdentity=0, appVars.tutorialNotice=null,
      appVars.tutorialTimer=null, appVars.tutorialTrace=null, appVars.tutorialSave=null, appVars.tutorialExpected=null, appVars.tutorialInsertion=null;
    // The level (レベル): baseUiLevel is the level chosen other than 名人 (はじめて／かんたん／くわしく). A work with a 名人 text is
    // shown as くわしく with 名人 chosen, and no other level can be chosen while it has one; without one, the chosen level
    // comes back (undo, open, a new work). The work file and autosave keep only the chosen level.
    appVars.baseUiLevel='entry';
    // The workspace (workspaceIdentity) whose 名人 text an editor last showed: when that text goes away there, the view
    // stays code (getEditorSession).
    appVars.meijinShownIn=null;
    // The levels the picker offers depend on the view: blocks はじめて／かんたん／くわしく, code かんたん／くわしく／名人, and a
    // work with a 名人 text only 名人. A level that cannot be chosen is not in the list at all (not a disabled option).
    appVars.UI_LEVEL_NAMES={entry:'はじめて',basic:'かんたん',advanced:'くわしく',meijin:'名人'};
    appCalls.$('#tutorialFinish').onclick=()=>appCalls.tutorialChoose('finish');
    for(const event of ['pointerdown','touchstart','click','keydown','keyup','focusin','input','change','compositionstart','compositionend','dragstart','dragover','drop','contextmenu'])window.addEventListener(event,appCalls.tutorialCapture,{capture:true,passive:false});
    appVars.flushingEditor = false, appVars.intentInputFocus = null;
    appVars.shellPointer = null;
    // The コード／ブロック toggle (final call 22) is one button that shows the view on the screen with ⇄: 「ブロックモード ⇄」
    // or 「コードモード ⇄」. A press switches to the other view, and the label follows. Of the group's two buttons only the
    // one that switches away from the view shown is there (…Modecode in blocks, …Modeblocks in code); its name says the
    // view. The toggle is never pale or hidden on the edit screen: where a press cannot switch (はじめて, a work with a 名人
    // text, a mistake in the code, a picture, sound or work still being read in) it keeps the view and says why under it
    // (modeBlockedNote). Only while getting a run ready (the run screen, where the toolbar's toggle is not shown) can it
    // not be pressed.
    appVars.VIEW_NAMES = { blocks: 'ブロックモード', code: 'コードモード' };
    appVars.MODE_REFUSALS = {
      entry: 'コードで 書くときは、上の「かんたん」か「くわしく」を えらんでね',
      meijin: '名人は、コードモードで だけ 使えるよ',
      error: 'コードの 赤い ところを 直すと、ブロックに もどれるよ',
      busy: '読みこみが おわるまで、まってね',
    };
    appVars.meijinProcedureId = '';

    appVars.pen = appVars.el.canvas.getContext('2d');
    appVars.stageStyle = document.createElement('style');
    appVars.stageStyle.textContent = AKARI_STAGE_CSS;
    document.head.appendChild(appVars.stageStyle);
    appVars.stageZoom = null, appVars.visibleStageScale = 1, appVars.runStageMinimum = null;
    appVars.stageView = createAkariStageView(AKARI_RUNTIME, {
      form: appVars.el.form,
      canvas: appVars.el.canvas,
      getProject: () => appVars.project,
      getRuntime: () => appVars.runtime,
      getScheduler: () => appVars.scheduler,
      imageUrl: appCalls.designImageUrl,
      getImage: (id) => appVars.runtimeCache?.getImage(id),
      selectedId: () => appVars.selectedId,
      getScale: ({ width, height, availableWidth, availableHeight }) => {
        if (appVars.stageZoom !== null) return appVars.stageZoom;
        if (appVars.runStageMinimum && !document.body.classList.contains('stage-enlarged')) {
          const main = appCalls.$('.main');
          availableWidth = Math.min(availableWidth, Math.max(appVars.runStageMinimum.width + 1, main.clientWidth - 1));
          availableHeight = Math.min(availableHeight, Math.max(appVars.runStageMinimum.height + 1, main.clientHeight - 1));
        }
        return Math.max(0.01, Math.min(1, (availableWidth - 1) / width, (availableHeight - 1) / height));
      },
      onFit: (scale) => {
        appVars.visibleStageScale = scale;
        appCalls.$('.designer-wrap').style.setProperty('--stage-scale', scale);
        appCalls.$('#stageZoomReset').textContent = Math.round(scale * 100) + '%';
        appCalls.$('#stageZoomOut').disabled = scale <= 0.1;
        appCalls.$('#stageZoomIn').disabled = scale >= 2;
        appCalls.$('#stageZoomFit').setAttribute('aria-pressed', String(appVars.stageZoom === null));
        appCalls.positionResizeHandles();
        appCalls.updateDesignHelp();
      },
      canInteract: () => !document.querySelector('.modal.show,.modal.open')&&(!appVars.tutorial
        ||(tutorialAllows(appVars.tutorial,'runtime:click')&&!appVars.tutorialTrace?.busy&&appVars.tutorialTrace?.clicks<tutorialStep(appVars.tutorial).clicks)),
      onRuntimeClick: id => {
        if(!appVars.tutorial)return true;
        if(!tutorialAllows(appVars.tutorial,'runtime:click')||id!==appVars.tutorial.target||!appVars.tutorialTrace||appVars.tutorialTrace.busy||appVars.tutorialTrace.clicks>=tutorialStep(appVars.tutorial).clicks)return false;
        appVars.tutorialTrace.clicks++;appVars.tutorialTrace.busy=true;appVars.tutorialTrace.sawTask=false;return true;
      },
      onDesignPointer: (e, id) => {
        if (!appCalls.modelLocked() && appCalls.selectObject(id)) {
          appCalls.startDrag(e, id);
          if (!appVars.activeDragCleanup) appCalls.releaseShellPointer();
        } else appCalls.releaseShellPointer();
      },
      onDesignStage: () => {
        if (!appCalls.modelLocked()) appCalls.selectObject('stage');
      },
      onError: (e) =>
        appCalls.dispatchRuntime(() => {
          throw e;
        }),
      onInputChanged: appCalls.renderMonitor,
      onStageMessage: (text, details) => {
        appCalls.log(text);
        if (details?.rounded) {
          const full = document.createElement('button');
          full.type = 'button'; full.textContent = 'もとの数';
          full.setAttribute('aria-label', '数を 短くして 見せているよ。もとの 数を 見る');
          full.onclick = () => appCalls.showFullValue('出てきた もとの 数', details.value);
          appVars.el.console.appendChild(full);
        }
      },
      onValueDetails: (value, speaker) => appCalls.showFullValue(`${speaker}の 言うこと（${typeof value === 'string' ? '全部' : 'もとの 数'}）`, value),
    });
    window.addEventListener('resize', appCalls.fitRunStageMinimum);
    new ResizeObserver(appCalls.fitRunStageMinimum).observe(appCalls.$('#designerWindow > .win-title'));
    new ResizeObserver(appCalls.fitRunStageMinimum).observe(appCalls.$('#runStrip'));
    // A deliberately focused scroll region owns its navigation keys; keys on the stage still belong to the work.
    appCalls.$('.main').addEventListener('keydown', event => {
      if (appVars.runStageMinimum && event.target === event.currentTarget &&
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key))
        event.stopPropagation();
    });
    // 大きく見る (E-21): the stage at 100% laid over the page; 「もどる」 or Escape gives back the layout, the zoom it had
    // and the focus.
    appVars.enlargedFrom = undefined;
    appCalls.$('#stageEnlarge').onclick = () => appCalls.setStageEnlarged(!document.body.classList.contains('stage-enlarged'));
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.isComposing || !document.body.classList.contains('stage-enlarged') || document.querySelector('dialog[open],.modal.show')) return;
      e.preventDefault();
      e.stopPropagation();
      appCalls.setStageEnlarged(false);
    }, true);
    // With the workspace made wide, the stage stays small at the bottom right; pressing it brings the columns back.
    // 画面も見る brings the columns back and gives the focus to 作業台を広く, which made them go (AX-05).
    appCalls.$('#stageThumbnail').onclick = () => {
      const toggle = appCalls.$('#blockEditor [data-blockui-action="workspace-expand"]');
      toggle?.click();
      if (toggle?.getClientRects().length) toggle.focus({ preventScroll: true }); else appVars.el.form.focus({ preventScroll: true });
    };
    appCalls.$('#stageZoomOut').onclick = () => appCalls.setStageZoom(appVars.visibleStageScale - 0.1);
    appCalls.$('#stageZoomIn').onclick = () => appCalls.setStageZoom(appVars.visibleStageScale + 0.1);
    appCalls.$('#stageZoomReset').onclick = () => appCalls.setStageZoom(1);
    appCalls.$('#stageZoomFit').onclick = () => appCalls.setStageZoom(null);
    // The status line says what is true now: an action's result stays until the next action replaces it (an edit clears
    // it, markDirty). At はじめて a new sentence is lit for a moment, so the child sees that it changed.
    appVars.statusSerial = 0, appVars.statusFlash = null;
    // The status line repeats an editor failure until the source is fixed.
    appVars.editorFailureStatus = null;
    // 名人 scripts belong to no part; the editor lists them under this pseudo owner.
    appVars.MEIJIN_TARGET = Object.freeze({ id: MEIJIN_OWNER, name: '名人の本文', type: MEIJIN_OWNER });
    appVars.inspectorNodes = [];
    appCalls.$('#runtimeInspectBtn').onclick = appCalls.openRuntimeInspector;
    appCalls.$('#runtimeInspectorClose').onclick = appCalls.closeRuntimeInspector;
    appCalls.$('#runtimeInspectorStop').onclick = appCalls.stopRun;
    appCalls.$('#runtimeInspector').addEventListener('close', () => { if (appVars.inspectorNodes.length) appCalls.closeRuntimeInspector(); });
    new ResizeObserver(() => appCalls.placeProjectNameText()).observe(appCalls.$('.menutool'));
    appVars.restoringSnapshot=false;
    appVars.openRequest = null;
    // Asks in the product's own dialog before unsaved work is replaced (開く, 新しく作る, お手本を開く, いっしょに作る):
    // the dialog names the work, and offers to save it first. The answer is void when the work changed while the
    // question was open.
    appVars.loseConfirm = null;
    // 「たて・よこを そろえる」 (E-22) keeps a part's shape while a corner handle is moved, as Shift does with a mouse; it is
    // shown in the stage heading on a touch screen while a part with a box is selected.
    appVars.designRatioLocked = false;
    appCalls.$('#designRatioLock').onclick = () => {
      appVars.designRatioLocked = !appVars.designRatioLocked;
      appCalls.$('#designRatioLock').setAttribute('aria-pressed', String(appVars.designRatioLocked));
    };
    appVars.designResizeSmall = null, appVars.designHandlesShown = null;
    appVars.propHelpSerial = 0;
    // A rename that the work refuses (prepareResourceRename), said in the status line's voice.
    appVars.PROPERTY_REFUSALS = Object.freeze({
      '同じ 名前が あります': 'ほかの キャラクターや 部品と ちがう 名前に してね',
      '同じ ところに 同じ 名前が あります。ちがう 名前に して ください': 'ほかの キャラクターや 部品や 画面と ちがう 名前に してね',
      '書きかけを 先に 決めてから、名前を かえて ください': '書きかけを 先に 決めてから、名前を かえてね',
      '名前を 使って いるか しらべられない 本文が あります。先に 本文を 書きおえてから、名前を かえて ください':
        '名前を 使って いるか しらべられない 本文が あるよ。先に 本文を 書きおえてから、名前を かえてね',
      '同じ 名前が、いくつかの ものを さして います。どれの ことか、はっきり 書いてから 名前を かえて ください':
        '同じ 名前が、いくつかの ものを さして いるよ。どれの ことか、はっきり 書いてから 名前を かえてね',
    });
    appVars.STANDARD_SPRITES = Object.freeze({
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

    appVars.activeFailureId = null,
      appVars.valueView = null;

    appVars.codeLineLayout = null, appVars.codeLineMeasure = null;
    // A line's wrapped height depends only on its text and the editor's width and font (the key): a line measured once
    // is not laid out again, so a keystroke measures the lines it changed, not the whole body (PERF-R2-03). A font that
    // finishes loading measures again.
    appVars.codeLineHeights = { key: '', heights: new Map() };
    document.fonts?.addEventListener?.('loadingdone', () => { appVars.codeLineHeights = { key: '', heights: new Map() }; appVars.codeLineLayout = null; });
    appVars.gutterMarks = { errors: [], notices: [] };
    // Shown again after the block view, or given another width: the line numbers follow the lines.
    new ResizeObserver(() => { if (appVars.el.editor.clientWidth) appCalls.updateGutter(appVars.gutterMarks.errors, appVars.gutterMarks.notices); }).observe(appVars.el.editor);
    // Nothing goes on, but an input can start a body again: the status names the first such body's input (the stage's
    // bodies first, then the parts' in the order they were made). A body that starts by itself later (〜秒ごとに, そう
    // なったとき) keeps 動いているよ. A body for an event of a running extension (合図「拡張:拡張ID/機能ID」 that the
    // extension registers) is started from outside the work, as a click or a key body is (lead decision P22 E2); any
    // other 「拡張:…」 name is an ordinary signal of the work.
    appVars.RUN_HINT_KEYS = { 空白: 'スペース', 決定: 'エンター', 取消: 'エスケープ' };
    appVars.runHint = '';

    // 作品チェックの知らせ at every level (p2 Q5 (d)): they are worked out for the whole work after a change, in a timer and
    // never on the input path, and shown where their sentence is: 「ⓘ 知らせ」 on the block (the block view draws it from
    // session.notices), the line number in blue and 「ⓘ N行目：…」 under the code. A mistake comes first: a body with a
    // mistake or with an edit not yet decided shows no notice. Until the work is checked again, a body whose text has not
    // changed keeps its notices and a changed body shows none. 作品チェック (くわしく・名人) keeps its list.
    appVars.noticeKey = null, appVars.noticeWanted = null, appVars.noticeList = [], appVars.noticeTimer = 0, appVars.noticeSources = new Map(), appVars.pointedNotices = '';
    appVars.signalNameCache={key:null,names:{sent:[],received:[],unfilteredReceivers:0}};
    // What the code view says about a body (FM2-04, FM2-10, FCM-19, FCM-25): a reading error that a 名人 text would read
    // says S317, as 作品チェック and ▶ do, and a body with its own heading that the code view holds until ▶ (or the block
    // view) is checked for its names and meanings before the line under the code calls it fine. Both checks compile a
    // trial work, so they run after a short wait, never on the keystroke; the line under the code follows when they are
    // done. Returns the errors to show, or null while the heading body is still being checked.
    appVars.editorChecks = new Map();
    appVars.editorCheckTimer = 0;

    appVars.hintPage = 0,
      appVars.callableHintPage = 0;
    appVars.composingEditors = new WeakSet();
    // 書ける ことば names a value by its group in the block list (FCB-13): しらべる for a reading of the screen, へんすう・リスト
    // for a value written as it is (［1、2、3］, 条件の答え（あてはまる）), 計算 for a calculation and the ready-made ones. A
    // calculation for くわしく only (2＾3, 平方根, 正弦 …) is not offered below くわしく, as in the block list (F-21).
    appVars.hintGroups = new Map(), appVars.HINT_SENSE_KINDS = new Set(['SensorRead', 'TimerReset', 'InputValueRead']),
      appVars.HINT_DATA_KINDS = new Set(['BooleanLiteral', 'ListLiteral', 'StringLiteral', 'NumberLiteral', 'QuantityLiteral', 'VariableRead', 'ListRead']);
    // A pause and the continue after it change the status line too, when it only said that the work runs (an error or a
    // hint said with the pause stays).
    appVars.PAUSED_STATUS = 'いったん 止めたよ。「▶ つづける」で つづきから 動くよ';
    appVars.questionCb = null;
    if (Number.isSafeInteger(LIMITS.stringChars * 2) && LIMITS.stringChars * 2 <= 2147483647) appCalls.$('#questionAnswer').maxLength = LIMITS.stringChars * 2; else appCalls.$('#questionAnswer').removeAttribute('maxlength');
    appCalls.$('#questionAnswer').addEventListener('input', (e) => {
      if (!e.isComposing) appCalls.limitInputValue(e.target);
    });
    appCalls.$('#questionAnswer').addEventListener('compositionend', (e) => appCalls.limitInputValue(e.target));
    appVars.exportBusy = false, appVars.exportGeneration = 0;

    appCalls.$('#hintSearch').oninput = () => {
      appVars.hintPage = 0;
      appCalls.renderHints();
    };
    appCalls.$('#hintUnavailable').onchange = () => {
      appVars.hintPage = 0;
      appCalls.renderHints();
    };
    appCalls.$('#hintPrev').onclick = () => {
      appVars.hintPage--;
      appCalls.renderHints();
    };
    appCalls.$('#hintNext').onclick = () => {
      appVars.hintPage++;
      appCalls.renderHints();
    };
    appCalls.$('#callableHintSearch').oninput = () => {
      appVars.callableHintPage = 0;
      appCalls.renderCallableHints();
    };
    appCalls.$('#callableHintPrev').onclick = () => {
      appVars.callableHintPage--;
      appCalls.renderCallableHints();
    };
    appCalls.$('#callableHintNext').onclick = () => {
      appVars.callableHintPage++;
      appCalls.renderCallableHints();
    };
    for (const t of [appVars.el.editor, appCalls.$('#callableCode')]) {
      const refresh =
        t === appVars.el.editor
          ? () => {
              appVars.hintPage = 0;
              appCalls.renderHints();
            }
          : () => {
              appVars.callableHintPage = 0;
              appCalls.renderCallableHints();
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
          appVars.composingEditors.has(t) ||
          appCalls.modelLocked()
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
        appVars.recoveryEpoch++;
        appVars.composingEditors.add(t);
        appCalls.cancelAssist(t===appVars.el.editor?appVars.mainEditor:appVars.draftEditor);
        if (t === appVars.el.editor) appCalls.refreshEditor();
      });
      t.addEventListener('compositionend', () => {
        appVars.composingEditors.delete(t);
        if (t === appVars.el.editor) {
          appCalls.saveEditor({ fromInput: true });
          appCalls.refreshEditor();
        } else appCalls.updateCallableHeader();
      });
      for (const ev of ['click', 'keyup', 'select'])
        t.addEventListener(ev, (e) => {
          if (!e.isComposing && !appVars.composingEditors.has(t)) refresh();
        });
    }

    appVars.el.obj.addEventListener('change', () => appCalls.selectObject(appVars.el.obj.value));
    appVars.el.event.addEventListener('change', () => {
      const next = appVars.el.event.value;
      if (next === 'all') { if (appCalls.flushActiveEditor()) appCalls.showSourceOverview(); return; }
      if (!appCalls.flushActiveEditor()) {
        appCalls.renderSelectors();
        return;
      }
      appCalls.captureEditorView(appVars.mainEditor);
      if (!appCalls.modelLocked()) {
        appCalls.dropHistoryTimer();
        appCalls.pushHistoryNow();
      }
      appCalls.hideSourceOverview();
      const row = next.startsWith('script:') ? scriptBySourceKey(appVars.project, next) :
        appVars.project.scripts.find((x) => x.targetId === appVars.selectedId && x.event === next);
      appVars.currentEvent = row?.event || next;
      appVars.selectedScriptId = row?.id || null;
      appCalls.loadEditor();
      // Keep the selected body in the current frame without creating an edit.
      if (!appCalls.modelLocked()) appCalls.pushHistoryNow();
    });
    // 名人: the shown 名人 body is taken off the list (one step of undo).
    appCalls.$('#meijinDelete').onclick = () => {
      if (appCalls.modelLocked() || !appCalls.currentIsMeijin() || !appCalls.flushActiveEditor()) return;
      const row = (appVars.selectedScriptId && appVars.project.scripts.find(x => x.id === appVars.selectedScriptId)) || appCalls.meijinScripts()[0];
      if (!row || !confirm('この 名人の本文を けす？')) return;
      appCalls.dropHistoryTimer(); appCalls.pushHistoryNow();
      appVars.project.scripts = appVars.project.scripts.filter(x => x !== row);
      const rest = appCalls.meijinScripts();
      if (rest.length) { appVars.selectedScriptId = rest[0].id; } else { appVars.selectedId = 'stage'; appVars.currentEvent = 'start'; appVars.selectedScriptId = null; }
      appCalls.hideSourceOverview(); appCalls.markDirty(); appCalls.renderAll(); appCalls.loadEditor(); appCalls.refreshEditor();
      appCalls.dropHistoryTimer(); appCalls.pushHistoryNow();
      appCalls.setStatus('名人の本文を けしたよ');
    };
    appCalls.$('#scriptAdd').onclick = () => {
      if (appCalls.modelLocked() || !appCalls.flushActiveEditor()) return;
      try {
        if (appVars.project.scripts.length >= LIMITS.scripts) throw new AkariError('F504', '本文が いっぱいで、もう ふやせません。いらない 本文を けして ください');
        const next = cloneDesignProject(appVars.project), id = appCalls.ensureUniqueId('script');
        next.scripts.push(appVars.selectedId === MEIJIN_OWNER ? { id, mode: 'meijin', targetId: MEIJIN_OWNER, event: 'start', source: '' } : { id, targetId: appVars.selectedId, event: appVars.currentEvent, source: '', ...appCalls.newBodyFilter(appVars.currentEvent) });
        validateDesignProject(next);
        appCalls.dropHistoryTimer(); appCalls.pushHistoryNow();
        appVars.project = next; appVars.selectedScriptId = id;
        appCalls.hideSourceOverview(); appCalls.markDirty(); appCalls.loadEditor();
        appCalls.dropHistoryTimer(); appCalls.pushHistoryNow();
        appVars.el.editor.focus();
      } catch (error) { appCalls.showEditorFailure(appVars.mainEditor, error); }
    };
    appVars.el.editor.addEventListener('input', () => {
      if (appVars.composingEditors.has(appVars.el.editor)) return;
      appCalls.saveEditor({ fromInput: true });
      clearTimeout(appVars.el.editor._timer);
      appVars.el.editor._timer = setTimeout(appCalls.refreshEditor, 100);
    });
    appVars.el.editor.addEventListener('scroll', () =>
      appCalls.updateGutter(appVars.mainEditor.session?.diagnostics || []),
    );

    appCalls.$('#failureClose').onclick = () => appCalls.$('#failureModal').classList.remove('show');
    appCalls.$('#failureSelect').onchange = () => {
      appVars.activeFailureId = Number(appCalls.$('#failureSelect').value);
      appCalls.renderFailureDetails();
    };
    appCalls.$('#valueClose').onclick = () => {
      appCalls.$('#valueModal').classList.remove('show');
      appVars.valueView = null;
    };
    appCalls.$('#valueItemPrev').onclick = () => {
      if (appVars.valueView) {
        appVars.valueView.index--;
        appVars.valueView.page = 0;
        appCalls.renderFullValue();
      }
    };
    appCalls.$('#valueItemNext').onclick = () => {
      if (appVars.valueView) {
        appVars.valueView.index++;
        appVars.valueView.page = 0;
        appCalls.renderFullValue();
      }
    };
    appCalls.$('#valueItem').onchange = () => {
      if (appVars.valueView) {
        const n = Number(appCalls.$('#valueItem').value);
        appVars.valueView.index = Number.isFinite(n) ? Math.trunc(n) - 1 : 0;
        appVars.valueView.page = 0;
        appCalls.renderFullValue();
      }
    };
    appCalls.$('#valuePagePrev').onclick = () => {
      if (appVars.valueView) {
        appVars.valueView.page--;
        appCalls.renderFullValue();
      }
    };
    appCalls.$('#valuePageNext').onclick = () => {
      if (appVars.valueView) {
        appVars.valueView.page++;
        appCalls.renderFullValue();
      }
    };

    appCalls.$('#runBtn').addEventListener('click', (event) => { appVars.runPressedAt = event.timeStamp; appCalls.startRun(); });
    // ■ 止める takes ▶ 動かす's place: a press within 0.5 s of ▶ is the second press of a double press and does nothing
    // (a click, a tap, a pen press or a key alike).
    appCalls.$('#stopBtn').addEventListener('click', (event) => {
      if (event.timeStamp - appVars.runPressedAt < 500) { appVars.el.form.focus({ preventScroll: true }); return; }
      appCalls.stopRun();
    });
    // ⏸ いったん止める and ▶ つづける share one place: a press within 0.5 s of the last one there is the second press of a
    // double press and does nothing (it would pause and go on at once). After ⏸ the focus goes to ▶ つづける in the same
    // place; after ▶ つづける to the stage, as after ▶ 動かす, so keys reach the work (いっしょに作る keeps its own place).
    appVars.pauseSlotPressedAt = -Infinity;
    appCalls.$('#pauseBtn').onclick = (event) => {
      if (!appCalls.pauseSlotPress(event) || !appVars.scheduler) return;
      appVars.scheduler.pause();
      if (appCalls.$('#continueBtn').dataset.inactive !== 'true') appCalls.$('#continueBtn').focus({ preventScroll: true });
    };
    appCalls.$('#continueBtn').onclick = (event) => {
      if (!appCalls.pauseSlotPress(event) || !appVars.scheduler) return;
      appVars.scheduler.resume();
      if (appVars.tutorial) appCalls.focusTutorialTarget();
      // In 本文と動きのようす the stage is behind the dialog: the focus stays in the same place, on ⏸.
      else if (event.currentTarget.closest('#runtimeInspector')) appCalls.$('#pauseBtn').focus({ preventScroll: true });
      else appVars.el.form.focus({ preventScroll: true });
    };
    appCalls.$('#stepBtn').onclick = () => appVars.scheduler?.stepOne();
    appCalls.$('#formatBtn').onclick = appCalls.formatCurrent;
    appCalls.$('#diagnoseBtn').onclick = appCalls.showDiagnosis;
    appCalls.$('#diagnosisClose').onclick = () => appCalls.$('#diagnosisModal').classList.remove('show');
    appCalls.$('#newBtn').onclick=appCalls.startProject;
    // Two fixed built-in preview images, shared across cards and picker openings.
    // Keep the existing blob-only image CSP; never load a data URL into the DOM.
    appVars.samplePreviewUrls = new Map();
    appCalls.$('#sampleBtn').onclick=appCalls.requestSampleProject;
    appCalls.$('#samplePickerClose').onclick=()=>appCalls.$('#samplePicker').close();
    appCalls.$('#samplePicker').addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...appCalls.$('#samplePicker').querySelectorAll('button:not(:disabled)')];
      const first = controls[0], last = controls.at(-1);
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    });
    appCalls.$('#samplePicker').addEventListener('close',()=>{
      // close events are queued: don't clear a newer confirmation opened meanwhile.
      if(appVars.openRequest?.kind==='sample' && appVars.openRequest.phase==='selection')appVars.openRequest=null;
      if(!document.querySelector('.modal.show:not(#procModal),dialog[open]'))appCalls.$('#sampleBtn').focus({preventScroll:true});
    });
    appCalls.$('#saveBtn').onclick = appCalls.saveProject;
    appCalls.$('#entryStartEvent').onclick=()=>appCalls.selectEntryEvent('start');
    appCalls.$('#entryClickEvent').onclick=()=>appCalls.selectEntryEvent('click');
    appCalls.$('#tutorialStart').onclick=appCalls.beginTutorial;
    appCalls.$('#tutorialExit').onclick=()=>{appCalls.finishTutorial(false);appCalls.setStatus('とちゅうの 作品は のこって いるよ。じゆうに つづけられるよ。');};
    appCalls.$('#tutorialVerifySave').onclick=()=>{if(tutorialAllows(appVars.tutorial,'verify-save')){appCalls.$('#tutorialSavedFile').value='';appCalls.$('#tutorialSavedFile').click();}};
    appCalls.$('#tutorialSavedFile').onchange=event=>{const file=event.target.files?.[0];event.target.value='';appCalls.verifyTutorialSave(file);};
    appCalls.$('#tutorialSavedFile').addEventListener('cancel',()=>{if(appVars.tutorial){appVars.tutorialNotice={step:tutorialStep(appVars.tutorial)?.id,text:'ファイルを えらぶのを やめたよ。もう一度 えらぶか、「いっしょに 作るのを やめる」を おしてね。'};appCalls.tutorialRefresh();}});
    appCalls.$('#callableSaveProject').onclick = appCalls.saveProject;
    appCalls.$('#exportBtn').onclick = appCalls.exportProject;
    appCalls.$('#exportControls').onclick = () => appCalls.downloadProject('controls');
    appCalls.$('#exportArtwork').onclick = () => appCalls.downloadProject('artwork');
    appCalls.$('#exportChoiceCancel').onclick = appCalls.cancelPlayerExport;
    appCalls.$('#openBtn').onclick = appCalls.requestOpenProject;
    appCalls.$('#openRefusalClose').onclick = appCalls.closeOpenRefusal;
    appCalls.$('#loseConfirmProceed').onclick = () => appVars.loseConfirm?.(true);
    appCalls.$('#loseConfirmCancel').onclick = () => appVars.loseConfirm?.(false);
    // ほぞんしてから つづける: the work file is saved first; when it cannot be saved the work stays and the dialog too.
    appCalls.$('#loseConfirmSave').onclick = () => { if (appVars.loseConfirm && appCalls.saveProject()) appVars.loseConfirm?.(true); };
    appVars.el.fileInput.addEventListener('cancel', appCalls.finishOpenSelection);
    appVars.el.fileInput.addEventListener('change', async () => {
      const file = appVars.el.fileInput.files?.[0], approval = appVars.openRequest?.phase === 'selection' ? appVars.openRequest : null;
      // Consume the approval before async loading. Failure/cancel/completion can
      // never lend it to the next operation or an alternate import route.
      appVars.openRequest = null;
      try { if (file) await appCalls.openProject(file, approval); }
      finally { appCalls.finishOpenSelection(); }
    });
    appCalls.$('#undoBtn').onclick = appCalls.historyPress(appCalls.undo, appCalls.$('#redoBtn'));
    appCalls.$('#redoBtn').onclick = appCalls.historyPress(appCalls.redoDo, appCalls.$('#undoBtn'));
    appCalls.$('#resetBtn').onclick = () => {
      if (appCalls.modelLocked()) return;
      if (!appCalls.flushActiveEditor()) return;
      appCalls.pushHistoryNow();
      if (appVars.initialSnapshot) {
        appCalls.restoreSnap(appVars.initialSnapshot);
        appCalls.pushHistoryNow();
      }
      appCalls.setStatus('作品を 開いたときの ようすに もどしたよ');
    };
    appCalls.$('#imageObjectAdd').onclick = () => {
      if (!appCalls.modelLocked()) appCalls.$('#imageObjectInput').click();
    };
    appVars.paintEditor = createPaintEditor(async (canvas) => {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('絵を 作れませんでした');
      let errorMessage = '絵を おけませんでした';
      const ok = await appCalls.importImageObject(new File([blob], 'お絵かき.png', { type: 'image/png' }), {
        nativeSize: true,
        onError: error => { errorMessage = error.message; },
      });
      if (!ok) throw new Error(errorMessage);
    });
    appCalls.$('#paintAdd').onclick = () => {
      if (!appCalls.modelLocked() && appCalls.flushActiveEditor()) appVars.paintEditor.open();
    };
    appCalls.$('#soundQuickAdd').onclick = () => {
      if (!appCalls.modelLocked()) appCalls.$('#soundInput').click();
    };
    appCalls.$('#assetBtn').onclick = () => {
      appCalls.renderAppearance();
      appCalls.$('#assetModal').classList.add('show');
    };
    appCalls.$('#assetClose').onclick = () => {
      appCalls.stopPreview();
      appCalls.$('#assetModal').classList.remove('show');
    };
    appCalls.$('#dataBtn').onclick = () => {
      appCalls.renderDataModal();
      appCalls.$('#dataModal').classList.add('show');
    };
    appCalls.$('#dataClose').onclick = () => appCalls.$('#dataModal').classList.remove('show');
    appCalls.$('#dataScope').onchange = appCalls.renderDataModal;
    appCalls.$('#dataKind').onchange=()=>{appCalls.clearDataFormError();appCalls.updateDataForm();};
    appCalls.$('#dataListMode').onchange=()=>{appCalls.clearDataFormError();appCalls.updateDataForm();};
    appCalls.$('#dataAdd').onclick = appCalls.addData;
    appCalls.$('#callableSelect').onchange = () => {
      const next = appCalls.$('#callableSelect').value;
      if (next.startsWith('meijin:')) {
        if (appCalls.confirmCallableDiscard()) appCalls.showMeijinProcedure(next.slice('meijin:'.length));
        else appCalls.$('#callableSelect').value = appVars.callableLoadedKey;
        return;
      }
      if (appCalls.confirmCallableDiscard()) { appCalls.loadCallable(next); appCalls.pushHistoryNow(); }
      else appCalls.$('#callableSelect').value = appVars.callableLoadedKey;
    };
    appCalls.$('#callableNewAction').onclick = () => {
      if (appCalls.confirmCallableDiscard()) { appCalls.clearCallable('action'); appCalls.pushHistoryNow(); }
    };
    appCalls.$('#callableNewFunction').onclick = () => {
      if (appCalls.confirmCallableDiscard()) { appCalls.clearCallable('function'); appCalls.pushHistoryNow(); }
    };
    appCalls.$('#callableSave').onclick = appCalls.saveCallable;
    appCalls.$('#meijinProcRename').onclick = appCalls.renameMeijinProcedure;
    appCalls.$('#meijinProcOpen').onclick = appCalls.openMeijinProcedure;
    appCalls.$('#callableFormat').onclick = appCalls.formatCallable;
    appCalls.$('#callableDelete').onclick = appCalls.deleteCallable;
    appCalls.$('#callableName').oninput = appCalls.updateCallableHeader;
    appCalls.$('#callableArgs').oninput = appCalls.updateCallableHeader;
    appCalls.$('#callablePhrase').oninput = appCalls.updateCallableHeader;
    appCalls.$('#callableCode').oninput = appCalls.updateCallableHeader;
    appCalls.$('#backdropAdd').onclick = appCalls.addBackdrop;
    appCalls.$('#costumeAdd').onclick = appCalls.addCostume;
    appCalls.$('#imageObjectAddModal').onclick = () => {
      if (!appCalls.modelLocked()) appCalls.$('#imageObjectInput').click();
    };
    appCalls.$('#backdropImageAdd').onclick = () => {
      if (!appCalls.modelLocked()) appCalls.$('#imageBackdropInput').click();
    };
    appCalls.$('#costumeImageAdd').onclick = () => {
      if (!appCalls.modelLocked()) appCalls.$('#imageCostumeInput').click();
    };
    appCalls.$('#soundAdd').onclick = () => {
      if (!appCalls.modelLocked()) appCalls.$('#soundInput').click();
    };
    appCalls.$('#imageObjectInput').onchange = async (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) await appCalls.importImageObject(f);
    };
    appCalls.$('#imageBackdropInput').onchange = async (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) await appCalls.importBackdropImage(f);
    };
    appCalls.$('#imageCostumeInput').onchange = async (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) await appCalls.importCostumeImage(f);
    };
    appCalls.$('#soundInput').onchange = async (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) await appCalls.importSoundFile(f);
    };
    appCalls.$('#uiLevel').onchange = () => {
      // The level is chosen on the edit screen only (the picker is not shown while the work runs). The list holds only the
      // levels of the view, so choosing one never changes the view.
      if (appCalls.modelLocked() || !appCalls.uiLevelChoices().includes(appCalls.$('#uiLevel').value)) { appCalls.applyUiLevel(); return; }
      // 名人: the selected body becomes a 名人 text after the confirm (an empty one when there is no body to move).
      if(appCalls.$('#uiLevel').value==='meijin'){
        appCalls.$('#uiLevel').value=appVars.baseUiLevel;
        if (appVars.tutorial || appCalls.composingAny() || appVars.headerPending || appVars.activeDragCleanup) { appCalls.setStatus('入力を 決めるか やめてから、レベルを かえてね。'); return; }
        if(!appCalls.workIsMeijin())appCalls.startMeijin();
        appCalls.applyUiLevel();appCalls.renderHints();appCalls.renderEntrySurface();appCalls.renderEditorBinding(appVars.mainEditor);appVars.mainEditor.view.render({force:true});
        return;
      }
      if (appVars.tutorial || appCalls.composingAny() || [appVars.mainEditor,appVars.draftEditor].some(binding=>binding.session?.pendingEdit&&binding.session.pendingEdit.kind!=='block-draft') || appVars.headerPending || appVars.activeDragCleanup) {
        appCalls.applyUiLevel();
        appCalls.setStatus('入力を 決めるか やめてから、レベルを かえてね。');
        return;
      }
      appVars.baseUiLevel = appCalls.$('#uiLevel').value;
      appCalls.applyUiLevel();
      // はじめて has no すべての本文 (nor its 「本文を なおす ところへ もどる」): the list closes, and the body it was opened
      // from is shown again, as that button would.
      if (appVars.baseUiLevel === 'entry' && appVars.sourceOverviewOpen) { appCalls.hideSourceOverview(); appCalls.loadEditor(); }
      try {
        localStorage.setItem(STORAGE_KEYS.uiLevel, appVars.baseUiLevel);
      } catch (_) {}
      // はじめて shows the start and click bodies only, with a button for each: a body of another きっかけ chosen before gives
      // way to the start body (the click body for a part with no start), so the body shown is the one a pressed button
      // names (F-05, F2-04).
      if (document.body.dataset.uiLevel === 'entry' && !['start', 'click'].includes(appVars.currentEvent))
        appCalls.selectEntryEvent(appCalls.eventsFor(appVars.selectedId).includes('start') ? 'start' : 'click');
      appCalls.renderHints();
      appCalls.renderEntrySurface();
      appCalls.renderEditorBinding(appVars.mainEditor);
      appVars.mainEditor.view.render({force:true});
      if (appCalls.$('#procModal').classList.contains('show')) appCalls.renderEditorBinding(appVars.draftEditor);
    };
    appVars.storedUiLevel = null;
    try {
      appVars.storedUiLevel = localStorage.getItem(STORAGE_KEYS.uiLevel);
    } catch (_) {}
    appVars.baseUiLevel = normalizeEntryUiLevel(appVars.storedUiLevel);
    appCalls.applyUiLevel();
    appVars.storedEditorMode = null;
    try { appVars.storedEditorMode = localStorage.getItem(STORAGE_KEYS.editorMode); } catch (_) {}
    appVars.editorModes.set('script', ['code', 'blocks'].includes(appVars.storedEditorMode) ? appVars.storedEditorMode : 'blocks');
    if(document.body.dataset.uiLevel==='entry'&&appVars.editorModes.get('script')==='code'){
      appVars.baseUiLevel='basic';appCalls.applyUiLevel();
    }
    appVars.el.projectName.addEventListener('change', () => {
      if (appCalls.modelLocked()) {
        appVars.el.projectName.value = appVars.project.name;
        return;
      }
      const v = appVars.el.projectName.value.trim();
      if (v && cpLen(v) <= 80) {
        appVars.project.name = v;
        appCalls.markDirty();
        appCalls.renderAll();
      } else appVars.el.projectName.value = appVars.project.name;
    });
    appCalls.$$('.tool').forEach((b) => {
      b.addEventListener('click', () =>
        appCalls.addComponent(b.dataset.type, null, null, b.dataset.spritePreset || ''),
      );
      b.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/akari-tool', b.dataset.type);
        if (b.dataset.spritePreset)
          e.dataTransfer.setData('text/akari-sprite-preset', b.dataset.spritePreset);
      });
    });
    appVars.el.form.addEventListener('dragover', (e) => {
      if (!appVars.runtime) e.preventDefault();
    });
    appVars.el.form.addEventListener('drop', (e) => {
      if (appVars.runtime) return;
      e.preventDefault();
      const type = e.dataTransfer.getData('text/akari-tool'),
        preset = e.dataTransfer.getData('text/akari-sprite-preset');
      if (type) {
        const r = appVars.el.form.getBoundingClientRect();
        appCalls.addComponent(
          type,
          ((e.clientX - r.left) * appVars.project.stage.width) / r.width,
          ((r.bottom - e.clientY) * appVars.project.stage.height) / r.height,
          preset,
        );
      }
    });
    appCalls.$('#questionSubmit').onclick = () => {
      const cb = appVars.questionCb,
        v = appCalls.$('#questionAnswer').value;
      if (cb) cb(v);
    };
    appCalls.$('#questionAnswer').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        e.stopPropagation();
        appCalls.$('#questionSubmit').click();
      }
    });
    appCalls.$('#recoveryRestore').onclick = () => {
      if (!appVars.recoveryData) return;
      try {
        const {frames,cursor}=appVars.recoveryData.restored;
        appVars.workspaceIdentity++;
        appCalls.dropHistoryTimer();clearTimeout(appVars.autosaveTimer);
        appVars.lastSavedFingerprint=appVars.recoveryData.lastSavedFingerprint;
        appVars.lastSavedEditorFingerprint=appVars.recoveryData.lastSavedEditorFingerprint;
        appVars.history=frames.slice(0,cursor+1);appVars.redo=frames.slice(cursor+1).reverse();
        appVars.initialSnapshot=appVars.history[0];appCalls.restoreSnap(appVars.history.at(-1),{restoreView:true});
        appCalls.$('#recoveryModal').classList.remove('show');appVars.recoveryData=null;
        appCalls.log('このパソコンに のこした 作品と、もとに もどせる きろくを もどしました','ok');
        appCalls.setStatus(`「${appVars.project.name}」の つづきから 作れるよ`);
        // After the dialog has let go of the page (the modal manager clears #app.inert on its own turn).
        setTimeout(()=>appCalls.$('#runBtn').focus({preventScroll:true}),0);
        // What was restored is what this computer keeps: the state says so at once (restoreSnap marked it as not kept).
        appVars.el.autosave.textContent = 'このパソコンに のこして あるよ';
      } catch (err) {
        appCalls.log('このパソコンに のこした 作品を もどせませんでした。ほぞんした 作品ファイルが あれば、「開く」で えらんで ください。', 'error');
        appCalls.setStatus('このパソコンに のこした 作品を もどせなかったよ。ほぞんした ファイルが あれば「開く」で えらんでね');
      }
    };
    appCalls.$('#recoveryDiscard').onclick = () => {
      appCalls.$('#recoveryModal').classList.remove('show');
      appVars.recoveryData = null;
      appCalls.clearAutosave();
      // The status line says what is true now (F-11), and the focus stays on the page's controls.
      appCalls.setStatus('このパソコンに のこした 作品を けしたよ');
      setTimeout(()=>appCalls.$('#runBtn').focus({preventScroll:true}),0);
    };

    // Delete removes the selected part only while the child works with the parts: the focus is on the stage, the part
    // list or the tools that add parts, or it is on the page and the last press was there (a part list row takes no
    // focus). After a press in the body window (a block's 「けす」, もとに もどす, the 本文 heading) or the toolbar, Delete
    // never removes a part.
    appVars.PART_PLACES = '#designerWindow, .side, .toolbox';
    appVars.partPressed = false;
    document.addEventListener('pointerdown', (e) => { appVars.partPressed = !!e.target.closest?.(appVars.PART_PLACES); }, true);
    window.addEventListener('keydown', (e) => {
      if (
        e.isComposing ||
        e.keyCode === 229 ||
        e.key !== 'Delete' ||
        appCalls.modelLocked() ||
        appVars.selectedId === 'stage'
      )
        return;
      if (document.querySelector('.modal.show')) return;
      const focused = document.activeElement, tag = focused?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      const onPage = !focused || focused === document.body || focused === document.documentElement;
      if (!(onPage ? appVars.partPressed : focused.closest(appVars.PART_PLACES))) return;
      e.preventDefault();
      appCalls.deleteSelectedComponent();
    });
    window.addEventListener('beforeunload', (e) => {
      if (
        appVars.dirty ||
        appVars.paintEditor.hasDrawing() ||
        appCalls.hasCallableDraft() ||
        (appVars.colorEdit && appVars.colorEdit.value !== appVars.colorEdit.original) ||
        appVars.headerPending ||
        appVars.mainEditor.session?.pendingEdit || appVars.mainEditor.session?.blockDraft ||
        appVars.draftEditor.session?.pendingEdit || appVars.draftEditor.session?.blockDraft ||
        appVars.composingEditors.has(appVars.el.editor) ||
        appVars.composingEditors.has(appVars.draftEditor.textarea)
      ) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    appCalls.installEditorShell();
    for (const binding of [appVars.mainEditor, appVars.draftEditor]) {
      const draft = binding.kind === 'draft',
        p = draft ? 'callable' : 'editor';
      binding.view = createBlockEditorView({
        // A notice's rewrite by the block (I120, p2 Q5 (d)) is the same as the one under the code and in 作品チェック.
        onNoteProposal: (note, proposal) => appCalls.applyNoteProposal(note, proposal),
        onExpand:
          binding.kind === 'script'
            ? () => {
                const expanded = document.body.dataset.workbenchWide !== 'true';
                document.body.dataset.workbenchWide = String(expanded);
                appCalls.$('#stageThumbnail').hidden = !expanded;
                appCalls.syncWideInert();
                requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
                return expanded;
              }
            : null,
        root: appCalls.$(draft ? '#callableBlocks' : '#blockEditor'),
        // The free middle of the row above the workspace, between すべての本文… and もとに もどす…: the floating
        // The cancel control (「入れるのを やめる」) goes there while a place is chosen, so it covers no block (E-12).
        controlsSpace: draft ? null : () => {
          const nav = appCalls.$('.codewin > .source-nav'), bar = appCalls.$('.codewin > .debugbar');
          if (!nav?.getClientRects().length || !bar?.getClientRects().length) return null;
          const shown = (n) => [...n.children].filter(c => c.getClientRects().length && getComputedStyle(c).visibility !== 'hidden').map(c => c.getBoundingClientRect());
          const left = shown(nav), right = shown(bar), row = bar.getBoundingClientRect();
          if (Math.abs(nav.getBoundingClientRect().top - row.top) > 4) return null;
          return { left: Math.max(nav.getBoundingClientRect().left, ...left.map(r => r.right)) + 8,
            right: Math.min(row.right, ...right.map(r => r.left)) - 8, top: row.top, bottom: row.bottom };
        },
        getSession: () => appCalls.getEditorSession(binding),
        getProject: () => appVars.project,
        getContext: () => ({...appCalls.bindingContext(binding),signalNames:()=>appVars.signalNameCache.names}),
        tutorialActive: () => !!appVars.tutorial,
        onDestinationSelected: appCalls.selectTutorialInsertion,
        onPresentation: appCalls.refreshTutorialPresentation,
        lessonCandidate: () => { const step=tutorialStep(appVars.tutorial),key=step?.block;return key?{key,node:tutorialCandidate(key,appVars.project,step.id),label:TUTORIAL_BLOCKS[key].label}:null; },
        onData: () => appCalls.$('#dataBtn').click(),
        isLocked: appCalls.modelLocked,
        onOperation: (operation) => appCalls.operateBlock(binding, operation),
        onPending: (pending) => {
          if (binding.session) binding.session.pendingEdit = pending || (binding.session.blockDraft
            ? binding.session.blockDraft.pending : null);
          // A cancelled field edit leaves nothing to fix, so its message goes away with it.
          if (!pending && !binding.session?.blockDraft) {appCalls.clearEditorFailure(binding);appCalls.keepTutorialTargetInView();}
          appCalls.scheduleAutosave();
        },
        onCancel: () => {
          appCalls.clearEditorFailure(binding);
          if (binding.session) binding.session.pendingEdit = binding.session.blockDraft
            ? binding.session.blockDraft.pending : null;
          // はじめて's note on blocks it does not show follows the body as it is again.
          if (binding === appVars.mainEditor) appCalls.renderEntrySurface();
        },
      });
      for (const mode of ['code', 'blocks'])
        appCalls.$(`#${p}Mode${mode}`).onclick = (event) => {
          // Input commits precede the delayed repaint. Decide this press from the current body, so a repaired
          // sentence does not inherit the previous keystroke's refusal (and a new error cannot use an old permit).
          appCalls.getEditorSession(binding);
          appCalls.paintBindingModeToggle(binding);
          if (event.currentTarget.dataset.refused) appCalls.showModeBlockedNote(binding);
          else appCalls.switchEditorMode(binding, mode);
        };
      appCalls.$(`#${p}Cancel`).dataset.blockuiAction = 'cancel';
      appCalls.$(`#${p}Cancel`).onclick = () => appCalls.cancelEditorPending(binding);
    }
    appVars.callableBaseline = appCalls.callableSignature();
    appCalls.$('#questionStop').onclick = appCalls.stopRun;
    // Large multiline insertion through the browser's native editing command can
    // stall before `input`. Range replacement keeps the same source/history path.
    for (const t of [appVars.el.editor, appVars.draftEditor.textarea]) {
      const insertLarge = (event, text) => {
        if (
          typeof text !== 'string' ||
          text.length < 4096 ||
          event.isComposing ||
          appVars.composingEditors.has(t) ||
          appCalls.modelLocked() ||
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
    for (const t of [appCalls.$('#callableName'), appCalls.$('#callableArgs'), appCalls.$('#callablePhrase')]) {
      t.addEventListener('compositionstart', () => {
        appVars.recoveryEpoch++;
        appVars.composingEditors.add(t);
        appVars.headerPending = { ownerKey: appCalls.draftOwner(), composing: true };
      });
      t.addEventListener('compositionend', () => {
        appVars.composingEditors.delete(t);
        appCalls.updateCallableHeader();
      });
    }
    // Native textarea history must not diverge from the project/draft history.
    document.addEventListener(
      'beforeinput',
      (event) => {
        if (!['historyUndo', 'historyRedo'].includes(event.inputType) || event.isComposing) return;
        if (event.target.matches('#codeEditor,#callableCode,#callableName,#callableArgs,#callablePhrase')) {
          event.preventDefault();
          event.inputType === 'historyUndo' ? appCalls.undo() : appCalls.redoDo();
        }
      },
      true,
    );
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.isComposing || event.keyCode === 229 || appVars.composingEditors.has(event.target))
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
          event.key.toLowerCase() === 'y' || event.shiftKey ? appCalls.redoDo() : appCalls.undo();
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
        if (!target || appCalls.modelLocked() || target.closest('#colorModal,#paintModal')) return;
        if (
          // The note under the code holds the way out of a pending edit (its rewrites and 書いた文のまま考える).
          target.closest('#blockEditor,#callableBlocks,.editor-modes,#sourceImport,#loseConfirmModal,#samplePicker,#editorPending,#callablePending') ||
          // ▶ 動かす closes the input itself and says why it does not run (startRun).
          target.matches('#tutorialStart,#tutorialExit,#undoBtn,#redoBtn,#saveBtn,#callableSaveProject,#newBtn,#sampleBtn,#openBtn,#procBtn,#procClose,[data-blockui-action="cancel"],#sourceHeadingBtn[aria-disabled="true"],#runBtn')
        )
          return;
        if (!appCalls.flushActiveEditor()) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        appCalls.dropHistoryTimer();
        appCalls.pushHistoryNow();
      },
      true,
    );
    document.addEventListener(
      'change',
      (event) => {
        if (
          appCalls.modelLocked() ||
          (event.target===appVars.intentInputFocus?.textarea&&appVars.intentInputFocus.current()) ||
          event.target.closest('#blockEditor,#callableBlocks,#sourceImport,#colorModal,#paintModal,[data-intent-input]') ||
          (event.target.matches('#codeEditor') && ['source-import','heading-source'].includes(appVars.mainEditor.session?.pendingEdit?.kind)) ||
          event.target.matches('#uiLevel,#objectSelect,#eventSelect,#callableType,#callableSelect,#fileInput')
        )
          return;
        if (!appCalls.flushActiveEditor()) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        appCalls.dropHistoryTimer();
        appCalls.pushHistoryNow();
      },
      true,
    );
    document.addEventListener(
      'focusin',
      (event) => {
        if (
          appCalls.modelLocked() ||
          appVars.flushingEditor ||
          event.target.matches('.diagnostic-details > summary') ||
          // Menu navigation does not commit input; each chosen action owns its guard.
          event.target.closest('#projectMenu > summary,#exportBtn,.editor-modes,#sourceImport,#colorModal,#samplePicker,#loseConfirmModal,#uiLevel,#tutorialStart,#tutorialExit,#saveBtn,#callableSaveProject,#newBtn,#sampleBtn,#openBtn,#procBtn,#procClose,[data-blockui-action="cancel"]')
        )
          return;
        const binding = appCalls.$('#procModal').classList.contains('show') ? appVars.draftEditor : appVars.mainEditor;
        if (
          !binding.session?.pendingEdit &&
          !appVars.headerPending &&
          !appVars.composingEditors.has(binding.textarea)
        )
          return;
        const root = appCalls.$(binding.kind === 'draft' ? '#callableBlocks' : '#blockEditor');
        if (
          root.contains(event.target) ||
          event.target === binding.textarea ||
          // The focus may go to the note's rewrites (Tab from the code): they decide the pending edit themselves.
          event.target.closest('#editorPending,#callablePending') ||
          event.target.matches('#callableName,#callableArgs,#callablePhrase')
        )
          return;
        if (!appCalls.flushActiveEditor()) {
          event.stopImmediatePropagation();
          if (binding.session?.mode !== 'blocks') binding.textarea.focus({ preventScroll: true });
        }
      },
      true,
    );
    appCalls.$('#procBtn').onclick = () => {
      if (!appCalls.flushEditor(appVars.mainEditor)) return;
      if (!appCalls.hasCallableDraft()) appCalls.renderCallableList(appVars.callableLoadedKey);
      appCalls.$('#procModal').classList.add('show');
      appCalls.renderEditorBinding(appVars.draftEditor);
      if (!appCalls.modelLocked()) appCalls.pushHistoryNow();
    };
    appCalls.$('#sourceOverviewBtn').onclick = () => { if (appCalls.flushActiveEditor()) appCalls.showSourceOverview(); };
    appCalls.$('#sourceEditBtn').onclick = () => { appCalls.hideSourceOverview(); appCalls.loadEditor(); };
    appCalls.$('#sourceHeadingBtn').onclick = (event) => {
      if (event.currentTarget.getAttribute('aria-disabled') === 'true') { appCalls.showBlockedNote(appCalls.headingBlockedNote()); return; }
      if (appCalls.modelLocked() || !appCalls.switchEditorMode(appVars.mainEditor, 'blocks')) return;
      const selected=appCalls.$('#blockEditor .blockui-selected'),scope=selected?.closest('.blockui-script');
      const field=(scope||appCalls.$('#blockEditor')).querySelector('[data-blockui-structured-role="heading.event"]');
      if (!field) return;
      for (let parent=field.parentElement;parent;parent=parent.parentElement)
        if (parent.tagName==='DETAILS') parent.open=true;
      field.scrollIntoView({block:'center'}); field.focus({preventScroll:true});
      appCalls.setStatus('「いつ動く？」で きっかけを えらんでね。「この 本文の きっかけを かえる」で 決まるよ。「かえるのを やめる」で もとに もどれるよ');
    };
    appCalls.$('#sourceStageBtn').onclick = () => { if (appCalls.selectObject('stage')) appCalls.showSourceOverview(); };
    appCalls.$('#procClose').onclick = () => {
      appCalls.flushActiveEditor();
      try {
        const saved=appCalls.captureEditorState();if(saved.callableDraft)appVars.callableDraftCore={...saved.callableDraft};
        appCalls.$('#procModal').classList.remove('show');
        if (appVars.sourceOverviewOpen) appCalls.renderSourceOverview();
        appCalls.scheduleAutosave();
      } catch(error) { appCalls.showEditorFailure(appVars.draftEditor,error); }
    };
    appCalls.$('#callableType').onchange = () => {
      if (!appCalls.flushEditor(appVars.draftEditor)) {
        appCalls.$('#callableType').value = appVars.callableDraftCore.type;
        return;
      }
      appCalls.updateCallableHeader();
    };
    appCalls.$('#console').textContent = `${productLabel(true)}が はじまりました。`;
    appCalls.installColorPicker();
    appCalls.resetHistory();
    appCalls.renderAll();
    appCalls.loadEditor();
    appCalls.setupModalAccessibility();
    appCalls.checkRecovery();
    // The version is in 出力 (はじまりました); the status line says only what is true now.
    appCalls.setStatus(appCalls.emptyProjectStatus());
    app = {
      get editorState() {
        return {
          sourceOverviewOpen: appVars.sourceOverviewOpen,
          selectedScriptId: appVars.selectedScriptId,
          sourceRegistry: sourceRegistry(appVars.project).map(({ key, ownerId }) => ({ key, ownerId })),
          main: appVars.mainEditor.session,
          draft: appVars.draftEditor.session,
          callableDraft: { ...appVars.callableDraftCore },
          hasDraft: appCalls.hasCallableDraft(),
          history: appVars.history.length,
          redo: appVars.redo.length,
          state: appVars.appState,
          dirty: appVars.dirty,
          contextRevision: appVars.editorContextRevision,
        };
      },
      get project() {
        return appVars.project;
      },
      get assetStore() {
        return appVars.assetStore;
      },
      compile: () => compileProject(appVars.project),
      startRun: appCalls.startRun,
      stopRun: appCalls.stopRun,
      showDiagnosis: appCalls.showDiagnosis,
      exportProject: appCalls.exportProject,
    };
  }

