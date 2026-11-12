import { MEIJIN_OWNER } from './02-language-contracts.ts';
import type { AppRedraw, AppRunCalls, AppServicesCalls, AppToolsCalls, AppToolsCoreCalls, AppVars, PageControl } from '../types/app.d.ts';
import type { RuntimeValue } from '../types/runtime.d.ts';
import type { RuntimeUi } from '../types/run.d.ts';

// ────────────────────────────────────────────────────────────────────────
// 11 — Application run: the work while it runs or takes in pictures and sounds (the controls locked, the state shown),
// the screen the runtime draws on and its painting, the end of a run and going on after it, and the failure shown.
// ────────────────────────────────────────────────────────────────────────
// The application files come in this order in src/akari.html: a file uses only the files before it and asks the files
// after it only for a redraw (AUDIT.md「ソースの境界」). Called once at the start of initApp: appVars is the state
// it shares, appCalls the functions it offers the files after it and those it calls from the files before it,
// appRedraw the redraw slots it calls (the drawing fills them).
export function createAppRun(appVars: AppVars, appCalls: AppToolsCoreCalls & AppToolsCalls & AppServicesCalls, appRedraw: AppRedraw): asserts appCalls is AppToolsCoreCalls & AppToolsCalls & AppServicesCalls & AppRunCalls {
  function updateEditingLock() {
    const locked = appCalls.modelLocked();
    if (locked && appVars.colorEdit) appCalls.closeColorPicker();
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
      // (each is a control of the page)
      (appCalls.$('#' + id) as PageControl).disabled = locked;
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
      // (a control of the properties, when they are shown)
      const n = appCalls.$('#' + id) as PageControl | null;
      if (n) n.disabled = locked;
    }
    // The other toolbar controls cannot be pressed while the work runs either (保存, いっしょに作る, はじめて's もとに もどす・
    // やり直す, and the 作品 menu): the run screen shows none of the locked toolbar controls, but keeps their
    // room (final call 21), so ■ 止める stays where ▶ 動かす was.
    appCalls.$('#saveBtn').disabled = locked;
    appCalls.$('#tutorialStart').disabled = locked;
    for (const menu of [appCalls.$('#projectMenu')]) {
      // (the 作品 menu is a details with its summary: src/akari.html)
      const summary = menu.querySelector(':scope > summary')!;
      if (locked) {
        menu.open = false;
        summary.setAttribute('aria-disabled', 'true');
      } else summary.removeAttribute('aria-disabled');
    }
    appCalls.$('#uiLevel').disabled = appVars.appState === 'IMPORTING';
    // Do not change history ownership while an asynchronous import is still settling.
    // Runtime inspection keeps its existing target/event navigation.
    appVars.el.obj.disabled = appVars.el.event.disabled = appVars.appState === 'IMPORTING' || appVars.appState === 'PREPARING';
    appVars.el.editor.readOnly = locked;
    appVars.el.projectName.disabled = locked;
    // The run screen shows the work's name as plain text in the name box's place: the box keeps its room but is not
    // shown, so it is not read as an edit field either.
    const nameText = appCalls.$('#projectNameText'), runScreen = ['PREPARING', 'RUNNING', 'PAUSED'].includes(appVars.appState);
    nameText.hidden = !runScreen;
    if (runScreen) {
      if (nameText.textContent !== appVars.project.name) nameText.textContent = nameText.title = appVars.project.name;
      appCalls.placeProjectNameText();
    }
    appCalls.$$('.tool').forEach((b) => {
      b.disabled = locked;
      b.draggable = !locked;
    });
    appCalls.$$('.entry-add').forEach((b) => (b.disabled = locked));
    appCalls.$$('.hint-button').forEach((b) => (b.disabled = locked || b.dataset.unavailable === 'true'));
    // The run screen: from ▶ 動かす (getting ready) until ■ 止める, also paused, stopped by an error and finished. The edit
    // screen (DESIGN, IMPORTING) shows ▶ 動かす only, the run screen ■ 止める only, in the same place.
    const wasRuntime = document.body.classList.contains('runtime'), main = appCalls.$('.main');
    if (runScreen && !wasRuntime) {
      const r = appCalls.$('#formFrame').getBoundingClientRect();
      appVars.runStageMinimum = { width: r.width, height: r.height, left: main.scrollLeft, top: main.scrollTop };
      main.tabIndex = 0; main.setAttribute('aria-label', '画面と 本文を スクロールする');
      document.body.dataset.runStageMinimum = '';
    }
    document.body.classList.toggle('runtime', runScreen);
    if (runScreen && !wasRuntime) appCalls.fitRunStageMinimum();
    else if (!runScreen && wasRuntime) {
      const previous = appVars.runStageMinimum; appVars.runStageMinimum = null;
      delete document.body.dataset.runStageMinimum;
      main.removeAttribute('tabindex'); main.removeAttribute('aria-label');
      appCalls.$('#designerWindow').style.removeProperty('--run-stage-min-width');
      appCalls.$('#designerWindow').style.removeProperty('--run-stage-min-height');
      main.scrollLeft = previous?.left || 0; main.scrollTop = previous?.top || 0;
    }
    document.body.classList.toggle('run-finished', appVars.runFinished);
    appCalls.syncWideInert();
    // はじめて's run screen shows the blocks to read only: they are not Tab stops between the stage and ■ 止める (AX-11).
    const world = appCalls.$('#blockEditor .blockui-world');
    if (world) world.inert = document.body.dataset.uiLevel === 'entry' && ['PREPARING', 'RUNNING', 'PAUSED'].includes(appVars.appState);
    if (locked && appVars.appState !== 'IMPORTING') appCalls.closeEditingModals();
    if (appVars.mainEditor.view) appRedraw.editorBinding(appVars.mainEditor);
    // A picture or work being read in refuses the toggle's press (読みこみが おわるまで…), and the refusal ends with it.
    if (appVars.draftEditor.session) appRedraw.bindingModeToggle(appVars.draftEditor);
    appCalls.updateDirty();
  }
  function showFailureDetails(id: number | null = null) {
    appCalls.closeRuntimeInspector();
    const records = appVars.scheduler?.errorRecords || [];
    if (!records.length) return;
    // (records are a run's)
    appVars.scheduler!.pause();
    appVars.activeFailureId = id ?? records.at(-1)!.id;
    const select = appCalls.$('#failureSelect');
    select.textContent = '';
    const entry = document.body.dataset.uiLevel === 'entry';
    for (const r of [...records].reverse()) {
      const option = document.createElement('option');
      option.value = String(r.id);
      // はじめて shows no numbers: the place is the part, the きっかけ and the sentence.
      option.textContent = (entry ? '' : '#' + r.id + ' ') + appCalls.diagnosticLocation(r);
      select.appendChild(option);
    }
    select.value = String(appVars.activeFailureId);
    // The stop's place is marked on the body before the help says so (the paint waits for the next frame otherwise).
    flushRuntimePaint();
    appRedraw.failureDetails();
    appCalls.$('#failureModal').classList.add('show');
  }
  function requestRuntimePaint(flags = 7) {
    appVars.runtimePaintFlags |= flags;
    if (appVars.scheduler?.paused) {
      flushRuntimePaint();
      return;
    }
    if (appVars.runtimePaintFrame === null) appVars.runtimePaintFrame = requestAnimationFrame(flushRuntimePaint);
  }
  function flushRuntimePaint() {
    if (appVars.runtimePaintFrame !== null) cancelAnimationFrame(appVars.runtimePaintFrame);
    appVars.runtimePaintFrame = null;
    const flags = appVars.runtimePaintFlags;
    appVars.runtimePaintFlags = 0;
    if (!appVars.runtime) return;
    if (flags & 1) {
      appCalls.applyStage();
      appRedraw.components();
    }
    if (flags & 2) appRedraw.monitor();
    if (flags & 4) appRedraw.executionLocation();
    // A flow ended or the run state changed (flag 2): the run may have ended by itself. A pause (stepping, or a stop by
    // an error) is not an end; the run ends there when it goes on and nothing is left. While nothing goes on but an
    // input can start a body again, the status says which input. After the end a body that starts again (on a touch,
    // say) brings 動いているよ back; after 作品を全部止める the scheduler takes no input.
    if (flags & 2 && appVars.scheduler?.running && !appVars.scheduler.paused) {
      if (appVars.runFinished) { if (!appVars.scheduler.idle()) resumeFinishedRun(); }
      else if (appVars.scheduler.ended()) finishRun();
      else if (appVars.scheduler.idle()) {
        // No sentence runs now: the strip says so until a body starts again.
        if (appVars.activeLoc) { appVars.activeLoc = null; appRedraw.runStrip(); }
        appCalls.showRunHint(appCalls.restartHint());
      } else appCalls.showRunHint('');
    }
  }
  // The run has ended (every body done, or 作品を全部止める). The run screen stays as it is, with its last picture (a
  // ふきだし that would go away by itself stays too), and shows only ■ 止める; the status says what to do next.
  function finishRun({ stoppedAll = false } = {}) {
    if ((appVars.runFinished && !stoppedAll) || !appVars.runtime || !['RUNNING', 'PAUSED'].includes(appVars.appState)) return;
    appVars.runFinished = true;
    appVars.runHint = '';
    appVars.appState = 'RUNNING';
    if (appVars.inspectorNodes.length) appCalls.closeRuntimeInspector();
    appVars.activeLoc = null;
    appVars.stageView.keepBubbles();
    appRedraw.runStrip();
    appCalls.setStatus(stoppedAll ? '作品が 止まったよ。作る 画面に もどる ときは「■ 止める」を おしてね'
      : 'おわったよ。もう一度 動かすときは「■ 止める」を おしてから「▶ 動かす」を おしてね');
    updateRunState();
  }
  function resumeFinishedRun() {
    appVars.runFinished = false;
    appCalls.setStatus('動いているよ');
    updateRunState();
  }
  function bridge(): RuntimeUi {
    let speechValue: RuntimeValue | undefined;
    const tutorialRunEpoch=appVars.tutorial?.epoch,bridgeGeneration=appVars.generationToken;
    return {
      render: () => requestRuntimePaint(3),
      // 作品を全部止める: every body, rule and sound has stopped and no input starts a body; the run screen keeps the
      // last picture until ■ 止める.
      allStopped: () => {
        const token = appVars.generationToken;
        setTimeout(() => {
          if (token === appVars.generationToken) finishRun({ stoppedAll: true });
        }, 0);
      },
      renderMonitor: () => requestRuntimePaint(2),
      penLine: appVars.stageView.penLine,
      penClear: appVars.stageView.clearPen,
      stamp: appVars.stageView.stamp,
      prepareSpeech: value => { speechValue = value; },
      say: (rid, text, controlled) => {
        flushRuntimePaint();
        const value = speechValue; speechValue = undefined;
        appVars.stageView.showBubble(rid, text, value, controlled);
        // (a trace is kept only while the guide is: they begin and end together, and nothing speaks between)
        if(appVars.tutorialTrace&&tutorialRunEpoch===appVars.tutorial?.epoch&&bridgeGeneration===appVars.generationToken&&rid===appVars.tutorial!.target)appVars.tutorialTrace.speech.push(String(text));
      },
      clearSpeech: appVars.stageView.clearSpeech,
      beforeStatement: (task, node) => {
        // (a guide's run has its epoch; a run without the guide is not recorded: tutorialRecordStatement)
        appCalls.tutorialRecordStatement(task,node,tutorialRunEpoch,bridgeGeneration);
        appVars.activeTaskId = task.taskId;
        appVars.activeLoc = appCalls.sourceLocation(task, node);
        requestRuntimePaint(6);
      },
      afterStatement: () => requestRuntimePaint(6),
      runtimeError: (task, err) => {
        if(appVars.tutorialTrace&&tutorialRunEpoch===appVars.tutorial?.epoch&&bridgeGeneration===appVars.generationToken)appVars.tutorialTrace.failed=true;
        appVars.runFailed = true;
        appVars.activeTaskId = task.taskId;
        appVars.activeLoc = appCalls.sourceLocation(task, null, err);
        requestRuntimePaint(7);
        // The order of the calls names the part (たくどん), not its inner id, below くわしく (F-28).
        const owner = task.targetId === 'stage' ? appVars.project.stage.name : task.targetId === MEIJIN_OWNER ? '名人の本文' : appCalls.componentById(task.targetId)?.name,
          calls = (task.errorCallStack || []).map((entry, i) => i === 0 && owner && document.body.dataset.uiLevel !== 'advanced'
            ? entry.replace('きっかけ ' + task.targetId + ' /', () => ('きっかけ ' + owner + ' /')) : entry);
        const stack = calls.length
          ? `
使った じゅんばん：${calls.join(' → ')}`
          : '';
        // 出力 is the teacher's surface: one polite voice per line (F-18).
        appCalls.log(`${err.code} 動きが うまく いきませんでした：${err.message}${stack}`, 'error');
        appCalls.setStatus('動きが とちゅうで 止まったよ');
        appRedraw.monitor();
        // (a question another body asks gets no answer that goes on: it closes with the run)
        appCalls.hideQuestion();
        showFailureDetails(task.failureRecordId);
      },
      ask: (q, cb) => appCalls.showQuestion(q, cb),
      closeQuestion: () => appCalls.hideQuestion(),
      state: updateRunState,
    };
  }
  function updateRunState() {
    const running = !!appVars.scheduler?.running && !appVars.runFinished;
    // (a run that goes on has its scheduler)
    if (running) appVars.appState = appVars.scheduler!.paused ? 'PAUSED' : 'RUNNING';
    const words = appCalls.runStateText(), before = appVars.runStateWords;
    appVars.runStateWords = words;
    appVars.el.runState.textContent = words;
    if (words !== before && running) {
      if (words === 'いったん 止めたよ' && ['動いているよ', appVars.runHint].includes(appVars.statusMessage)) appCalls.setStatus(appVars.PAUSED_STATUS);
      else if (words === '動いているよ' && appVars.statusMessage === appVars.PAUSED_STATUS) appCalls.setStatus(appVars.runHint || '動いているよ');
    }
    appVars.el.runState.className = 'runstate ' + (running ? 'run-on' : 'run-off');
    // The run screen never shows a button that cannot be pressed (the exported player's rule too). ⏸ いったん止める and
    // ▶ つづける take turns in one place: ⏸ while the work runs, ▶ つづける while it is paused. 1つずつ 動かす and 本文を見て
    // たしかめる show while it runs or is paused. While getting ready, once the run has ended, and after a mistake
    // stopped it (nothing can go on past the failed sentence: ■ 止める only), a button that cannot be pressed is not
    // shown, but its place stays (data-inactive hides it), so the stage and the other buttons do not move.
    const focused = document.activeElement, failed = running && appVars.runFailed,
      inactive = {
        pauseBtn: !running || appVars.scheduler!.paused || failed,
        continueBtn: !running || !appVars.scheduler!.paused || failed,
        stepBtn: !running || failed,
        runtimeInspectBtn: !running,
      };
    for (const [id, off] of Object.entries(inactive)) {
      // (each is a button of the run screen)
      const button = appCalls.$('#' + id) as HTMLButtonElement;
      button.disabled = off;
      button.dataset.inactive = String(off);
    }
    appCalls.$('#runtimeInspectBtn').hidden = !['PREPARING', 'RUNNING', 'PAUSED'].includes(appVars.appState);
    // A button that went away does not take the focus with it to the page: it goes to the stage (⏸ and ▶ つづける move
    // it on themselves).
    // (an element the focus is on that has no data is not a button of the run screen)
    if ((focused as HTMLElement | null)?.dataset?.inactive === 'true' && Object.hasOwn(inactive, focused!.id)) appVars.el.form.focus({ preventScroll: true });
    appCalls.$('#runBtn').disabled = appVars.appState !== 'DESIGN';
    appCalls.$('#stopBtn').disabled = appVars.appState === 'DESIGN' || appVars.appState === 'IMPORTING';
    updateEditingLock();
    if (running && !appVars.scheduler!.paused) requestRuntimePaint(2);
  }
  async function runAssetImport(label: string, work: () => Promise<unknown>, onError?: (e: unknown) => void) {
    if (appCalls.modelLocked()) return;
    if (!appCalls.flushActiveEditor()) return;
    appCalls.dropHistoryTimer();
    appCalls.pushHistoryNow();
    appVars.recoveryEpoch++;
    appVars.appState = 'IMPORTING';
    appCalls.setAssetProgress(`${label}を たしかめて います…`);
    updateRunState();
    appRedraw.appearance();
    try {
      await work();
      return true;
    } catch (e) {
      // (what taking a picture or sound in throws is an error: the readers throw AkariError, the browser Error)
      appCalls.log(`${(e as { code?: unknown }).code || ''} ${label}を 入れられませんでした: ${(e as Error).message}`, 'error');
      appCalls.setStatus(`${label}を 入れられなかったよ`);
      onError?.(e);
      return false;
    } finally {
      if (appVars.appState === 'IMPORTING') {
        appVars.appState = 'DESIGN';
        appCalls.setAssetProgress('');
        updateRunState();
        appRedraw.appearance();
      }
    }
  }
  Object.assign(appCalls, {
    bridge,
    flushRuntimePaint,
    runAssetImport,
    showFailureDetails,
    updateRunState,
  } satisfies AppRunCalls);
}
