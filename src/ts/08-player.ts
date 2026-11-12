import type { RuntimeUi } from '../types/run.d.ts';
import type { RuntimeValue } from '../types/runtime.d.ts';
import type { AkariCore, AssetRuntimeCache, EventScheduler, ExecutableData, FocusTarget, PlayerPhase, RuntimeModel, StageView, StageViewOptions, Thrown } from '../types/view.d.ts';
// ────────────────────────────────────────────────────────────────────────
// 08 — The player of an exported work. Portable: the exported player embeds it (08-stage-and-export.ts).
// ────────────────────────────────────────────────────────────────────────
export function mountAkariPlayer(core: AkariCore, makeView: (core: AkariCore, options: StageViewOptions) => StageView, data: ExecutableData, options?: { artwork?: boolean }) {
  'use strict';
  const artwork = options?.artwork === true;
  // The page (generateStandaloneHtml) always has the root, the stage, the output and the question; the title, the
  // buttons and the status only with ▶ (not 開いたら すぐに 動かす), the activation only without.
  const $: (id: string) => HTMLElement | null = (id) => document.getElementById(id),
    root = $('playerRoot')!,
    form = $('formSurface')!,
    canvas = $('penCanvas') as HTMLCanvasElement,
    start = $('playerStart') as HTMLButtonElement | null,
    pause = $('playerPause') as HTMLButtonElement | null,
    stop = $('playerStop'),
    status = $('playerStatus'),
    output = $('playerOutput')!,
    modal = $('questionModal')!,
    answer = $('questionAnswer') as HTMLInputElement,
    activation = $('playerActivation'),
    activationButton = $('playerActivate') as HTMLButtonElement | null;
  let session: ReturnType<AkariCore['restoreExecutable']> | undefined,
    view: StageView | undefined,
    runtime: RuntimeModel | null = null,
    scheduler: EventScheduler | null = null,
    cache: AssetRuntimeCache | null = null,
    phase: PlayerPhase = 'LOADING',
    epoch = 0,
    paintFrame: number | null = null,
    questionCb: ((text: string) => void) | null = null,
    previousFocus: FocusTarget | null = null,
    automaticAttempted = false,
    backgroundPaused = false,
    runtimeFailed = false,
    // When ▶ 動かす was pressed: ■ 止める takes its place, and a press of it within 0.5 s (the second press of a double
    // press) does nothing. endFrame looks, after a flow ended, whether the whole run has ended.
    startPressedAt = -Infinity,
    // When ⏸ いったん止める or ▶ つづける was last pressed: a press of the same place within 0.5 s does nothing, so a
    // double press does not pause and go on at once.
    pausePressedAt = -Infinity,
    endFrame: number | null = null;
  const designUrls = new Map<string, string>();
  // A file that cannot start cannot be put right here: whoever made it makes it again.
  const CANNOT_START = 'この 作品を 動かせなかったよ。作った 人に、もう一度 ファイルに して もらってね。';
  const message: (text: unknown) => void = (text) => {
    output.hidden = false;
    const addition = (output.textContent ? '\n' : '') + String(text);
    if (output.textContent.length + addition.length > core.LIMITS.logChars)
      output.textContent = core.tailText(output.textContent + addition, Math.floor(core.LIMITS.logChars * 0.9));
    else output.appendChild(document.createTextNode(addition));
    output.scrollTop = output.scrollHeight;
  };
  // A sentence for the child, then the code and the rule's own words folded under 「先生むけの くわしい せつめい」, as
  // in the editor.
  const explain = (text: unknown, error: Thrown, code: string) => {
    message(text);
    const details = document.createElement('details'), summary = document.createElement('summary'), raw = document.createElement('pre');
    summary.textContent = '先生むけの くわしい せつめい';
    raw.textContent = `${error?.code || code} ${error?.message || error}${error?.detail ? '\n' + error.detail : ''}`;
    details.append(summary, raw);
    output.appendChild(details);
  };
  // The buttons follow the editor's rule. Stopped: ▶ 動かす only. Getting ready: ■ 止める only. Running: ■ 止める (where
  // ▶ 動かす was) and ⏸ いったん止める; paused, ■ 止める and ▶ つづける, in the same place and of the same width (the two
  // labels share one button, and the one that does not apply is not seen). Finished (every body done, or 作品を全部止める),
  // and stopped by a mistake (FAILED, which cannot go on): ■ 止める only, and the last picture stays. On the run screen
  // the place of ⏸／▶ つづける stays while neither can be pressed, so nothing moves.
  function state() {
    // After every body ended, a body that starts again (on a touch, say) goes on running; after 作品を全部止める the
    // scheduler takes no input.
    if (phase === 'FINISHED' && scheduler?.running && !scheduler.paused && !scheduler.idle()) phase = 'RUNNING';
    // A scheduler that stopped by itself (作品を全部止める) ends the run; ■ 止める (dispose) lets go of it first.
    if (phase === 'RUNNING' || phase === 'PAUSED') {
      phase = !scheduler ? 'STOPPED' : !scheduler.running ? 'FINISHED'
        : scheduler.paused ? 'PAUSED' : scheduler.ended() ? 'FINISHED' : 'RUNNING';
    }
    // The last picture stays: a ふきだし shown without a time stays too.
    if (phase === 'FINISHED') view?.keepBubbles();
    const runScreen = ['PREPARING', 'RUNNING', 'PAUSED', 'FINISHED', 'FAILED'].includes(phase);
    if (start) {
      start.hidden = runScreen;
      start.disabled = phase === 'LOADING' || phase === 'ERROR';
    }
    if (stop) stop.hidden = !runScreen;
    if (pause) {
      const idle = phase !== 'RUNNING' && phase !== 'PAUSED';
      pause.hidden = !runScreen;
      pause.disabled = idle;
      pause.dataset.idle = String(idle);
      pause.dataset.paused = String(phase === 'PAUSED');
    }
    // The focus does not fall to the page when its button goes away.
    // (the focus is on an HTML, SVG or MathML element, if on any)
    if ((document.activeElement as FocusTarget | null)?.hidden || (document.activeElement as FocusTarget | null)?.dataset?.idle === 'true') form.focus({ preventScroll: true });
    if (status) status.textContent =
      {
        LOADING: '読みこみ中',
        READY: 'じゅんび できたよ',
        PREPARING: 'じゅんび中',
        RUNNING: '動いているよ',
        PAUSED: 'いったん 止めたよ',
        FINISHED: 'おわったよ。もう一度 動かすときは「■ 止める」を おしてから「▶ 動かす」を おしてね',
        FAILED: '動きが とちゅうで 止まったよ。「■ 止める」を おすと、はじめに もどるよ',
        STOPPED: '止まって いるよ',
        ERROR: '開けないよ',
        // (WAITING has no words: the table gives undefined, and the line is empty)
      }[phase as Exclude<PlayerPhase, 'WAITING'>] as string | undefined || '';
    root.dataset.state = phase;
  }
  function flush() {
    if (paintFrame !== null) cancelAnimationFrame(paintFrame);
    paintFrame = null;
    view?.render();
    if (phase === 'FINISHED' && scheduler?.running && !scheduler.idle()) state();
  }
  function requestPaint() {
    if (paintFrame === null) paintFrame = requestAnimationFrame(flush);
  }
  function closeQuestion() {
    modal.classList.remove('show');
    root.inert = false;
    questionCb = null;
    if (previousFocus?.isConnected && !previousFocus.disabled)
      previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }
  // The view is made when the page opens; a run, its questions and its mistakes come after (startRun waits for the
  // view: a page whose view could not be made is ERROR, and does not start).
  function ask(question: string, cb: (text: string) => void) {
    view!.clearInput();
    previousFocus = document.activeElement as FocusTarget | null;
    questionCb = cb;
    $('questionText')!.textContent = question;
    answer.value = '';
    modal.classList.add('show');
    root.inert = true;
    answer.focus();
  }
  // A mistake found while the work runs stops it where it is. It cannot go on (no ▶ つづける); ■ 止める goes back to the
  // start. The reason shows without its code, which is in the fold.
  function fail(error: Thrown) {
    backgroundPaused = false;
    runtimeFailed = true;
    scheduler?.pause();
    view?.clearInput();
    // (a question another body asks gets no answer that goes on: it closes with the run)
    closeQuestion();
    if (scheduler) phase = 'FAILED';
    explain(error?.code ? error.message : '動きが とちゅうで 止まったよ。', error, 'R411');
    if(artwork)output.scrollIntoView({block:'nearest'});else view?.fitStage();
    flush();
    state();
  }
  function dispose() {
    epoch++;
    backgroundPaused = false;
    if (endFrame !== null) cancelAnimationFrame(endFrame);
    endFrame = null;
    if (activation) activation.hidden = true;
    view?.clearInput();
    const oldScheduler = scheduler;
    scheduler = null;
    oldScheduler?.stop();
    runtime = null;
    const oldCache = cache;
    cache = null;
    if (oldCache) oldCache.dispose().catch(() => {});
    closeQuestion();
    if (paintFrame !== null) cancelAnimationFrame(paintFrame);
    paintFrame = null;
    view?.clear();
  }
  // 開いたら すぐに 動かす has no ▶ 動かす: when the question's ■ 止める stops it (LANGUAGE.md keeps 質問・回答・停止 there,
  // and its run again is a reload of the page), the page says so instead of leaving a still stage with no word.
  function stopRun() {
    dispose();
    phase = 'STOPPED';
    flush();
    state();
    if (artwork) {message('止めたよ。もう一度 動かすときは、この ページを 読みこみなおしてね');output.scrollIntoView({block:'nearest'});}
    (start || form).focus({ preventScroll: true });
  }
  // Called once the context is made (ensureAudioContext, before the activation that resumes it). A resume of an
  // AudioContext is rejected with a DOMException.
  async function audioActivation(localCache: AssetRuntimeCache, attempt: Promise<void> | null, gesture: boolean) {
    const ac = localCache.audioContext!;
    let timer: ReturnType<typeof setTimeout> | undefined, failure: Error | undefined;
    try {
      await Promise.race([
        Promise.resolve(attempt).catch(error => { failure = error as Error; }),
        new Promise(resolve => { timer = setTimeout(resolve, gesture ? 1500 : 150); }),
      ]);
    } finally { clearTimeout(timer); }
    if (ac.state === 'running') return true;
    // A pending resume on a suspended context is the browser's activation gate.
    // Decode errors and closed/interrupted contexts never become an activation button.
    if (!gesture && ac.state === 'suspended' && (!failure || failure.name === 'NotAllowedError')) return false;
    throw new core.AkariError('R415', '音を はじめられませんでした', 0, 0,
      failure?.message || 'AudioContext state: ' + ac.state);
  }
  function startupFailure(error: Thrown, gesture = false) {
    dispose();
    phase = artwork ? 'ERROR' : 'STOPPED';
    // The same words with ▶ and without: what to do, then the code and the reason in the fold.
    explain(gesture || error?.code === 'R415' ? '音を 出せなかったよ。この 作品を ちがう 画面で 開いて みてね。' : CANNOT_START,
      error, 'R415');
    flush(); state();
  }
  async function startRun() {
    if (!session || phase === 'LOADING' || phase === 'PREPARING' || phase === 'ERROR' || phase === 'WAITING') return;
    if (artwork && automaticAttempted) return;
    if (artwork) automaticAttempted = true;
    dispose();
    const token = ++epoch,
      localCache = new core.AssetRuntimeCache(session.assetStore);
    cache = localCache;
    phase = 'PREPARING';
    state();
    output.textContent = '';
    output.hidden = true;
    try {
      if (session.requirements.needsAudio) {
        const audioContext = localCache.ensureAudioContext();
        if (artwork) audioContext.addEventListener('error', event => {
          if (token !== epoch || cache !== localCache) return;
          startupFailure(new core.AkariError('R415', '音を はじめられませんでした', 0, 0,
            // (an error event may carry a message)
            (event as Partial<ErrorEvent>).message || 'AudioContext error event; state: ' + audioContext.state));
        }, { once: true });
      }
      await localCache.prepare(session.project, session.requirements, token, { deferAudioStart: artwork });
      if (token !== epoch) return;
      if (artwork && session.requirements.needsAudio) {
        const ready = await audioActivation(localCache, localCache.audioResumePromise, false);
        if (token !== epoch) return;
        if (!ready) {
          phase = 'WAITING'; state();
          // (WAITING is only without ▶, where the page has the activation)
          activation!.hidden = false; activationButton!.disabled = false;
          activationButton!.focus({ preventScroll: true });
          return;
        }
      }
      beginRuntime(localCache);
    } catch (error) {
      if (token === epoch) startupFailure(error as Thrown);
    }
  }
  // (after startRun: there are a session and a view)
  function beginRuntime(localCache: AssetRuntimeCache) {
      runtimeFailed = false;
      runtime = new core.RuntimeModel(session!.project, {}, localCache);
      let speechValue: RuntimeValue | undefined;
      const br: RuntimeUi = {
        render: requestPaint,
        penLine: view!.penLine,
        penClear: view!.clearPen,
        stamp: view!.stamp,
        prepareSpeech: value => { speechValue = value; },
        say: (id, text, controlled) => {
          flush();
          const value = speechValue; speechValue = undefined;
          view!.showBubble(id, text, value, controlled);
        },
        clearSpeech: view!.clearSpeech,
        ask,
        closeQuestion,
        state,
        // A flow ended: once the scheduler has settled, the run may have ended by itself.
        renderMonitor: () => {
          if (phase === 'RUNNING' && endFrame === null) endFrame = requestAnimationFrame(() => { endFrame = null; state(); });
        },
        // 作品を全部止める: the run screen keeps its last picture until ■ 止める.
        allStopped: () => {
          const generation = epoch;
          setTimeout(() => {
            if (generation === epoch && runtime) { phase = 'FINISHED'; flush(); state(); }
          }, 0);
        },
        runtimeError: (_, e) => fail(e as Thrown),
      };
      runtime.ui = br;
      // (a suspend or a resume of the context is rejected with a DOMException, or with an AkariError when it is
      // cancelled or takes too long)
      localCache.onAudioStateError = (err) => fail(new core.AkariError('R415', (err as Error).message));
      let seed = Date.now() >>> 0;
      try {
        const n = new Uint32Array(1);
        crypto.getRandomValues(n);
        seed = n[0];
      } catch (_) {}
      runtime.reset(seed);
      scheduler = new core.EventScheduler(session!.project, session!.compiled, runtime, br);
      view!.seedHeldInput();
      phase = 'RUNNING';
      scheduler.start();
      flush();
      state();
      form.focus({ preventScroll: true });
  }
  async function activateRun(event: MouseEvent) {
    event.preventDefault(); event.stopImmediatePropagation();
    if (phase !== 'WAITING' || !cache) return;
    const token = epoch, localCache = cache;
    // (the activation's own button)
    activationButton!.disabled = true;
    phase = 'PREPARING'; state();
    try {
      // Resume is requested synchronously in the native activation handler.
      // (WAITING: the context was made)
      const attempt = localCache.audioContext!.resume();
      localCache.audioResumePromise = Promise.resolve(attempt);
      localCache.audioResumePromise.catch(() => {});
      await audioActivation(localCache, attempt, true);
      if (token !== epoch) return;
      activation!.hidden = true;
      beginRuntime(localCache);
    } catch (error) {
      if (token === epoch) startupFailure(error as Thrown, true);
    }
  }
  // (has: get gives it; pictures are shown once the session is read)
  function imageUrl(id: string) {
    if (cache?.objectUrls.has(id)) return cache.objectUrls.get(id)!;
    if (designUrls.has(id)) return designUrls.get(id)!;
    const a = session!.assetStore.get(id);
    if (!a || a.kind !== 'image') return '';
    const url = URL.createObjectURL(new Blob([a.bytes], { type: a.mime }));
    designUrls.set(id, url);
    return url;
  }
  if (start) start.onclick = (event) => { startPressedAt = event.timeStamp; startRun(); };
  if (stop) stop.onclick = (event) => {
    if (event.timeStamp - startPressedAt < 500) return form.focus({ preventScroll: true });
    stopRun();
  };
  if (pause) pause.onclick = (event) => {
    // After ⏸ the keys go on to ▶ つづける in the same place; after ▶ つづける they go to the work, as after ▶ 動かす
    // (also after a press that does nothing, which a click would otherwise leave on the button).
    const focus = () => (scheduler?.running && scheduler.paused ? pause : form).focus({ preventScroll: true });
    if (event.timeStamp - pausePressedAt < 500) return focus();
    pausePressedAt = event.timeStamp;
    view?.clearInput();
    if (!scheduler?.running) return;
    scheduler.paused ? scheduler.resume() : scheduler.pause();
    flush();
    state();
    focus();
  };
  if (activationButton) {
    activationButton.onclick = activateRun;
    for (const type of ['pointerdown', 'pointerup', 'keydown', 'keyup'])
      activationButton.addEventListener(type, event => event.stopPropagation());
  }
  // The shared stage pauses when the page loses focus. Resume that same run on
  // return, while preserving explicit stops and runtime failures.
  const rememberPause = () => { if (scheduler?.running && !runtimeFailed && phase !== 'ERROR') backgroundPaused = true; };
  const resumeBackground = () => {
    if (!backgroundPaused || document.hidden || !scheduler?.running || runtimeFailed) return;
    backgroundPaused = false; scheduler.resume(); flush(); state();
  };
  if (artwork) {
    window.addEventListener('blur', rememberPause);
    window.addEventListener('focus', resumeBackground);
    document.addEventListener('visibilitychange', () => document.hidden ? rememberPause() : resumeBackground());
  }
  // (the page's question: its buttons are always there, and a question is asked only while a work runs, after the view)
  $('questionStop')!.onclick = stopRun;
  $('questionSubmit')!.onclick = () => {
    if (questionCb) questionCb(view!.limitInputValue(answer));
  };
  if (Number.isSafeInteger(core.LIMITS.stringChars * 2) && core.LIMITS.stringChars * 2 <= 2147483647) answer.maxLength = core.LIMITS.stringChars * 2; else answer.removeAttribute('maxlength');
  answer.addEventListener('input', (e) => {
    if (!e.isComposing) view?.limitInputValue(answer);
  });
  answer.addEventListener('compositionend', () => view?.limitInputValue(answer));
  modal.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      stopRun();
    } else if (e.key === 'Enter' && e.target === answer) {
      e.preventDefault();
      $('questionSubmit')!.click();
    } else if (e.key === 'Tab') {
      const list = [answer, $('questionStop')!, $('questionSubmit')!],
        i = list.indexOf(document.activeElement);
      if (i < 0 || (e.shiftKey && i === 0) || (!e.shiftKey && i === list.length - 1)) {
        e.preventDefault();
        list[e.shiftKey ? list.length - 1 : 0].focus();
      }
    }
  });
  window.addEventListener('pagehide', (e) => {
    if (artwork && e.persisted) {
      rememberPause();
      // (rememberPause: only while a scheduler runs)
      if (backgroundPaused) scheduler!.pause();
      return;
    }
    dispose();
    for (const u of designUrls.values()) URL.revokeObjectURL(u);
    designUrls.clear();
    phase = 'STOPPED';
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && session) {
      if (artwork) resumeBackground();
      flush();
      state();
    }
  });
  try {
    session = core.restoreExecutable(data);
    document.title = session.project.name;
    // (the same title as the test just before)
    if ($('playerTitle')) $('playerTitle')!.textContent = session.project.name;
    form.setAttribute('aria-label', session.project.name);
    view = makeView(core, {
      form,
      canvas,
      // An exported work is the work alone: no dots (they are the editor's ruler).
      dots: false,
      // 開いたら すぐに 動かす: the set size, never scaled; two fingers zoom the page while it runs (final call 36).
      ...(artwork ? { getScale: () => 1, runTouch: 'pinch-zoom' } : {
        // With ▶ the room is the window, not the box around the stage (that box takes the stage's own width): the
        // stage shows at its own size when it fits and shrinks to fit otherwise, as the editor does.
        availableWidth: () => {
          // (the stage is in the player's box)
          const page = getComputedStyle(root), box = getComputedStyle(form.closest('.player-stage')!);
          return document.documentElement.clientWidth - parseFloat(page.paddingLeft || 0) - parseFloat(page.paddingRight || 0) -
            parseFloat(box.borderLeftWidth || 0) - parseFloat(box.borderRightWidth || 0);
        },
        // The height is the window's below the title and the buttons: a stage too tall for it shrinks until both its
        // width and its height fit (LANGUAGE.md: the ▶ export 「同じ縮尺処理を使います」).
        availableHeight: () => {
          const page = getComputedStyle(root), box = getComputedStyle(form.closest('.player-stage')!), header = root.querySelector('header');
          return document.documentElement.clientHeight - parseFloat(page.paddingTop || 0) - parseFloat(page.paddingBottom || 0) -
            (header ? header.offsetHeight + parseFloat(getComputedStyle(header).marginBottom || 0) : 0) -
            parseFloat(box.borderTopWidth || 0) - parseFloat(box.borderBottomWidth || 0) -
            (!output.hidden && ['FAILED','ERROR'].includes(phase) ? output.offsetHeight + parseFloat(getComputedStyle(output).marginTop || 0) : 0);
        },
      }),
      // (the session is read just before the view is made)
      getProject: () => session!.project,
      getRuntime: () => runtime,
      getScheduler: () => scheduler,
      imageUrl,
      getImage: (id) => cache?.getImage(id),
      canInteract: () => !modal.classList.contains('show'),
      onError: fail,
      onStageMessage: (text, details) => {
        message(text);
        if (details?.rounded) {
          const full = document.createElement('details'), summary = document.createElement('summary'), raw = document.createElement('span');
          summary.textContent = '数を 短くして 見せて いるよ。もとの 数を 見る';
          raw.textContent = details.rawText;
          full.append(summary, raw); output.appendChild(full);
        }
      },
      onValueDetails: value => message((typeof value === 'string' ? 'ふきだしの 文 ぜんぶ：' : '数を 短くして 見せて いるよ。もとの 数：') + core.valueText(value)),
    });
    // When the title or the status line takes another row (a narrow window), the stage fits again below it.
    const header = root.querySelector('header');
    if (header && typeof ResizeObserver === 'function') new ResizeObserver(() => view!.fitStage()).observe(header);
    flush();
    phase = 'READY';
    state();
    if (artwork) startRun();
  } catch (e) {
    if (artwork) startupFailure(e as Thrown);
    else {
      phase = 'ERROR';
      explain(CANNOT_START, e as Thrown, 'X602');
      state();
    }
  }
}
