  // ────────────────────────────────────────────────────────────────────────
  // 01 — createAkariRuntime, continued: the event scheduler.
  // ────────────────────────────────────────────────────────────────────────
    class EventScheduler {
      constructor(project, compiled, runtime, ui = {}) {
        this.project = project;
        this.compiled = compiled;
        this.runtime = runtime;
        this.ui = ui;
        this.ready = [];
        this.tasks = new Map();
        this.blocked = new Set();
        this.waitGroups = new Map();
        this.pendingExternalUnblocks = new Set();
        this.seq = 0;
        this.waitSeq = 0;
        this.speechTokens = new Map();
        this.running = false;
        // 作品を全部止める: no later click, key, signal or change starts a body until the next start() (F-30).
        this.stoppedAll = false;
        this.paused = false;
        this.loopScheduled = false;
        this.loopTimer = null;
        this.loopDue = 0;
        this.inLoop = false;
        this.questionQueue = [];
        this.activeQuestion = null;
        this.errorRecords = [];
        this.errorSequence = 0;
        this.errorRecordChars = 0;
        this.questionTimer = null;
        this.continuous = new Map();
        this.continuousOrigin = null;
        this.continuousTime = null;
        this.continuousTick = 1;
        this.continuousTrace = [];
        // What may have moved since the ふれたとき watches last looked (pollWatches): the parts a sentence, a glide or a
        // rule moved (movedParts), or anything (geometryStamp counted up: a copy made or removed, an input, a sentence that
        // can act on other parts, and every こま).
        this.geometryStamp = 0;
        this.movedParts = new Set();
        this.pollTick = null;
        this.dueAt = -Infinity;
      }
      initializeContinuous() {
        this.continuous.clear();
        this.continuousTrace = [];
        this.continuousOrigin = this.continuousTime = this.runtime.now();
        this.continuousTick = 1;
        for (const rule of this.compiled.rules || this.project.rules || []) {
          const runtimeId = this.runtime.resolveActorRef(rule.actorRef, rule.targetId || 'stage');
          const key = `${rule.id}:${runtimeId}`;
          if (this.continuous.has(key)) continue;
          const sourceKey = rule.id.replace(/:rule:\d+$/, '');
          const task = { taskId: `rule:${key}`, runtimeId, targetId: runtimeId, eventType: 'continuous',
            sourceKey: /^(script|action|function):/.test(sourceKey) ? sourceKey : null,
            eventContext: {}, subject: { runtimeId }, callFrames: [], execStack: [],
            broadcastGroups: new Map(), state: 'RUNNING', currentNode: rule };
          this.continuous.set(key, { rule, runtimeId, task, state: 'INACTIVE', speed: 0 });
        }
        this.refreshContinuous();
      }
      refreshContinuous() {
        if (!this.running || this.paused) return;
        for (const [key, control] of this.continuous) {
          if (!this.runtime.actor(control.runtimeId)) { this.continuous.delete(key); continue; }
          // A 名人 move (〜まで動き続ける) keeps its speed until its statement ends it.
          if (control.temporary) continue;
          try {
            if (LIMITS.functionOps !== STANDARD_LIMITS.functionOps && hasUserFunction(control.rule)) {
              if (!control.evaluator) control.evaluator = this.evaluateContinuous(control);
              const outcome = advanceEvaluation(control.evaluator);
              if (outcome.done) {
                control.evaluator = null;
                if (outcome.value === null) control.state = 'INACTIVE';
                else if (control.state === 'INACTIVE') { control.speed = outcome.value; control.state = 'ACTIVE'; }
              }
              continue;
            }
            const ctx = this.context(control.task), enabled = bool(evalExpression(control.rule.condition, ctx));
            if (!enabled) { control.state = 'INACTIVE'; continue; }
            if (control.state !== 'INACTIVE') continue;
            const seconds = numberInUnit(evalExpression(control.rule.seconds, ctx), '秒'),
              distance = numberInUnit(evalExpression(control.rule.distance, ctx), '歩');
            if (seconds <= 0) throw new AkariError('R412', '速さの 時間は 0より 大きく します');
            control.speed = ensureFinite(distance / seconds);
            control.state = 'ACTIVE';
          } catch (err) {
            this.continuous.delete(key);
            this.taskError(control.task, err);
            return;
          }
        }
      }
      directionVector(direction, actor) {
        switch (direction) {
          case 'right': return { x: 1, y: 0 };
          case 'left': return { x: -1, y: 0 };
          case 'up': return { x: 0, y: 1 };
          case 'down': return { x: 0, y: -1 };
          case 'forward':
          case 'backward': {
            const sign = direction === 'backward' ? -1 : 1;
            return { x: sign * cosDegrees(actor.direction), y: sign * sinDegrees(actor.direction) };
          }
          default: throw new AkariError('R411', '動く 向きが 正しく ありません');
        }
      }
      // 名人: the earliest end time of a move (〜秒のあいだ…動き続ける) inside the step, or the step's own end.
      moveDeadlineWithin(from, to) {
        let end = to;
        for (const [key, control] of this.continuous) {
          const br = control.temporary ? control.task.blockReason : null;
          if (br?.kind === 'moveUntil' && br.key === key && br.deadline !== null && br.deadline > from && br.deadline < end) end = br.deadline;
        }
        return end;
      }
      // 名人: the distance of a move in this step: speed × time since it began, less what it has already moved.
      moveDistance(control, end) {
        const total = Math.round(control.speed * (end - control.startTime) / 1000 * 1e9) / 1e9, step = total - control.moved;
        control.moved = total;
        return step;
      }
      // 名人: a move ends when its time is reached, or at a clock step where its condition holds (the part stops there).
      settleMoves(at, onStep) {
        for (const [key, control] of [...this.continuous]) {
          if (!control.temporary) continue;
          const task = control.task, br = task.blockReason;
          if (br?.kind !== 'moveUntil' || br.key !== key) { this.continuous.delete(key); continue; }
          try {
            if ((br.deadline !== null && at >= br.deadline) || (onStep && br.condition && bool(evalExpression(br.condition, this.context(task, { runtimeId: br.runtimeId }))))) {
              this.continuous.delete(key);
              this.unblock(task);
            }
          } catch (err) { this.continuous.delete(key); this.taskError(task, err); }
        }
      }
      advanceContinuous(at = this.runtime.now(), refresh = true) {
        if (!this.running || this.paused || this.continuousTime === null) return;
        if (!Number.isFinite(at) || at < this.continuousTime)
          throw new AkariError('R412', '時計を 前へ もどせません');
        while (this.continuousTime < at) {
          const grid = this.continuousOrigin + this.continuousTick * (1000 / 60),
            end = this.moveDeadlineWithin(this.continuousTime, Math.min(at, grid)), seconds = (end - this.continuousTime) / 1000,
            sums = new Map();
          const entries = [], moves = [];
          let failedControl = null;
          try {
            for (const [key, control] of this.continuous) {
              const actor = this.runtime.actor(control.runtimeId);
              if (!actor) { this.continuous.delete(key); continue; }
              if (control.state !== 'ACTIVE') continue;
              failedControl = control;
              const v = this.directionVector(control.rule.direction, actor), distance = control.temporary ? this.moveDistance(control, end) : control.speed * seconds,
                dx = v.x * distance, dy = v.y * distance,
                delta = sums.get(control.runtimeId) || { x: 0, y: 0 };
              delta.x = ensureFinite(delta.x + dx);
              delta.y = ensureFinite(delta.y + dy);
              if (dx) delta.xControl = control;
              if (dy) delta.yControl = control;
              sums.set(control.runtimeId, delta);
              entries.push({ ruleId: control.rule.id, runtimeId: control.runtimeId,
                from: this.continuousTime, to: end, dx, dy });
            }
            // Validate the whole interval before changing any actor or drawing.
            for (const [runtimeId, delta] of sums) {
              const actor = this.runtime.actor(runtimeId), x = actor.x, y = actor.y;
              failedControl = delta.xControl || delta.yControl;
              const nextX = ensureFinite(x + delta.x);
              failedControl = delta.yControl || delta.xControl;
              const nextY = ensureFinite(y + delta.y);
              moves.push({ actor, x, y, nextX, nextY, delta });
            }
          } catch (err) {
            for (const [key, control] of this.continuous)
              if (control === failedControl) this.continuous.delete(key);
            // Do not retry the failing interval from taskError's pause boundary.
            this.paused = true;
            this.taskError(failedControl.task, err);
            return;
          }
          for (const entry of entries) {
            this.continuousTrace.push(entry);
            if (this.continuousTrace.length > 1000) this.continuousTrace.shift();
            this.ui.continuousStep?.(entry);
          }
          for (const { actor } of moves) this.movedParts.add(actor.runtimeId);
          for (const { actor, x, y, nextX, nextY, delta } of moves) {
            actor.x = snapStep(nextX); actor.y = snapStep(nextY);
            if (actor.penDown && (delta.x || delta.y))
              this.ui.penLine?.(x, y, actor.x, actor.y, actor.penColor, actor.penSize);
          }
          this.continuousTime = end;
          // Keep position predicates on the same logical lattice as overlapping glides.
          if (this.continuous.size) {
            for (const task of this.blocked) if (task.blockReason?.kind === 'glide') {
              try { this.advanceGlide(task, task.blockReason, end); }
              catch (err) { this.taskError(task, err); break; }
            }
          }
          this.settleMoves(end, end === grid);
          if (end === grid) { this.continuousTick++; if (refresh) this.refreshContinuous(); if (this.continuous.size) this.pollWatches(end); }
          if (this.paused || !this.running) break;
        }
        if (this.continuous.size) this.ui.render?.();
      }
      inputBoundary(change) {
        this.advanceContinuous();
        this.geometryStamp++;
        change();
        this.refreshContinuous();
        this.schedule();
      }
      setKeyState(key, down) {
        const changed = this.runtime.pressedKeys.has(key) !== down;
        if (changed) this.inputBoundary(() => {
          if (down) this.runtime.pressedKeys.add(key);
          else this.runtime.pressedKeys.delete(key);
        });
        return changed;
      }
      releaseInput(pause = false) {
        this.inputBoundary(() => {
          this.runtime.pressedKeys.clear();
          this.runtime.mouseDown = false;
        });
        if (pause) this.pause();
      }
      scriptAst(targetId, event, scriptId = null) {
        return (scriptId ? this.compiled.astByKey.get(`script:${scriptId}`) : null) ||
          this.compiled.astByKey.get(`script:${targetId}:${event}`) || null;
      }
      matchingScripts(targetId, event, eventContext) {
        const scripts = this.compiled.items?.some(item => item.key.startsWith('script:')) ? this.compiled.items
          .filter(item => item.key.startsWith('script:')).map(item => ({
            id: item.scriptId || item.id || (item.key.split(':').length === 2 ? item.key.split(':')[1] : undefined),
            targetId: item.targetId || item.ownerId, event: item.event || item.key.split(':')[2], filter: item.filter,
          })) : this.project.scripts || (this.compiled.items ||
          [...this.compiled.astByKey.keys()].map((key) => ({ key })))
          .filter((item) => item.key.startsWith('script:')).map((item) => {
            const parts = item.key.split(':');
            return { id: item.scriptId || item.id || (parts.length === 2 ? parts[1] : undefined),
              targetId: item.targetId || item.ownerId || parts[1],
              event: item.event || parts[2], filter: item.filter };
          });
        // A key or a signal is matched here; what a touch body touches is watched (pollWatches), not matched.
        return scripts.filter((s) => s.targetId === targetId && s.event === event &&
          (s.filter == null || !['keyDown', 'message'].includes(event) || (typeof s.filter === 'object' ?
            (event === 'keyDown' ? s.filter.key : s.filter.message) : s.filter) ===
            (event === 'keyDown' ? eventContext.key : eventContext.message)));
      }
      spawnMatching(targetId, runtimeId, eventType, eventContext, waitGroupId) {
        const out = [];
        if (this.stoppedAll) return out;
        for (const script of this.matchingScripts(targetId, eventType, eventContext)) {
          const t = this.createTask(targetId, runtimeId, eventType, eventContext, waitGroupId, script.id);
          if (t) { this.enqueue(t); out.push(t); }
        }
        return out;
      }
      hasExecutable(ast) {
        return !!ast && ast.body.some((n) => n.kind !== 'CommentLine');
      }
      createTask(targetId, runtimeId, eventType, eventContext = {}, waitGroupId = null, scriptId = null) {
        const ast = this.scriptAst(targetId, eventType, scriptId);
        if (!this.hasExecutable(ast)) return null;
        if (this.tasks.size >= LIMITS.activeTasks)
          throw new AkariError('R413', '同時に 動いて いる 動きが 多すぎます。コピーや 合図を へらして ください');
        const task = {
          taskId: `task-${++this.seq}`,
          scriptId,
          subject: { runtimeId },
          broadcastGroups: new Map(),
          targetId,
          runtimeId,
          eventType,
          eventContext: { ...eventContext },
          lastAnswer: '',
          callFrames: [],
          execStack: [{ type: 'seq', nodes: ast.body, index: 0 }],
          state: 'READY',
          waitGroupId,
          createdSequence: this.seq,
          error: null,
        };
        this.tasks.set(task.taskId, task);
        if (waitGroupId) this.waitGroups.get(waitGroupId)?.pending.add(task.taskId);
        return task;
      }
      enqueue(task) {
        if (!task || ['DONE', 'CANCELLED', 'ERROR'].includes(task.state)) return;
        task.state = 'READY';
        if (!this.ready.includes(task)) this.ready.push(task);
        this.schedule();
      }
      spawnForRuntime(runtimeId, eventType, eventContext = {}, waitGroupId = null) {
        if (eventType === 'click') this.runtime.countEvent(runtimeId + '|click');
        let targetId;
        if (runtimeId === 'stage') targetId = 'stage';
        else {
          const a = this.runtime.actor(runtimeId);
          if (!a) return null;
          targetId = a.baseId;
        }
        return this.spawnMatching(targetId, runtimeId, eventType, eventContext, waitGroupId)[0] || null;
      }
      orderedRuntimeIds() {
        const out = ['stage'];
        for (const c of this.project.components) {
          if (this.runtime.actors.has(c.id)) out.push(c.id);
          const clones = [...this.runtime.actors.values()]
            .filter((a) => a.baseId === c.id && a.isClone)
            .sort((a, b) => a.creationSequence - b.creationSequence);
          for (const a of clones) out.push(a.runtimeId);
        }
        return out;
      }
      // ふれたとき (every part's bodies and 名人), 〜になったとき and 〜秒ごとに (名人) are watched on the scheduler's clock:
      // after every sentence of every flow and at every こま. A body started by a change (ふれたとき, 〜になったとき)
      // starts at most once in a こま for the same part (for 画面のはし: for each side); started keeps the こま of the last
      // start, so a change back and forth inside that こま (かくして また見せる, a turn that flips the box) is only recorded.
      initializeWatches() {
        this.watches = [];
        for (const item of this.compiled.items || []) {
          if (!item.key.startsWith('script:') || !['touchStart', 'conditionTrue', 'interval'].includes(item.event)) continue;
          const targetId = item.targetId || item.ownerId, scriptId = item.key.slice('script:'.length);
          const task = { taskId: `watch:${item.key}`, scriptId, runtimeId: targetId, targetId, eventType: item.event, eventContext: {},
            subject: { runtimeId: targetId }, callFrames: [], execStack: [], broadcastGroups: new Map(), state: 'RUNNING', currentNode: item.ast.body?.[0] };
          const watch = { item, targetId, scriptId, event: item.event, task, last: new Map(), started: new Map() };
          if (item.event === 'interval') {
            try {
              watch.period = numberInUnit(evalExpression(item.ast.heading.seconds, this.context(task)), '秒');
              if (!(watch.period > 0)) throw new AkariError('R412', '「〜秒ごとに」の 時間は 0より 大きく します');
            } catch (err) { this.taskError(task, err); return; }
            watch.nextAt = ensureFinite(this.runtime.now() + watch.period * 1000);
          }
          this.watches.push(watch);
        }
      }
      pollWatches(now = this.runtime.now()) {
        if (!this.running || this.paused || !this.watches?.length) return;
        // At every こま the touch watches look at every part again, whatever moved it.
        const tick = Math.floor((now - (this.continuousOrigin ?? 0)) / (1000 / 60) + 1e-9);
        if (tick !== this.pollTick) { this.pollTick = tick; this.geometryStamp++; }
        const all = this.geometryStamp !== this.touchStamp, moved = all ? null : this.movedParts.size ? [...this.movedParts] : [];
        this.touchStamp = this.geometryStamp;
        this.movedNow = this.movedParts;
        this.movedParts = new Set();
        for (const w of this.watches) {
          try {
            if (w.event === 'interval') {
              // A new run each time, even while the last one still runs.
              for (let guard = 0; now >= w.nextAt && guard < 100; guard++) { this.spawnWatch(w, w.targetId); w.nextAt += w.period * 1000; }
            } else if (w.event === 'conditionTrue') {
              const value = bool(evalExpression(w.item.ast.heading.condition, this.context(w.task)));
              if (value && !w.last.get(w.targetId) && w.started.get(w.targetId) !== tick) {
                w.started.set(w.targetId, tick);
                this.spawnWatch(w, w.targetId);
              }
              w.last.set(w.targetId, value);
            } else {
              // ふれたとき starts when not touching becomes touching. The first look at a part (the run's start, a new
              // copy) only records it: a part that already touches starts after it has left and touched again. Every copy
              // is looked at on its own; a hidden part touches nothing, so showing it where it touches is a change.
              // A part is looked at again only when it or what it touches has moved, turned, or changed its look, size or
              // whether it is seen since its last look (the answer cannot have changed otherwise).
              if (moved && !moved.length) continue;
              const target = w.item.filter.target, partners = this.touchPartners(target), partnersMoved = !samePoses(w.partners, partners);
              w.partners = partners;
              w.poses ||= new Map();
              // Only the parts that moved need a look (in the order of all parts), unless what they touch moved too.
              const parts = moved && !partnersMoved
                ? moved.length === 1 ? [this.runtime.actor(moved[0])].filter(a => a?.baseId === w.targetId)
                  : [...this.runtime.actors.values()].filter(a => a.baseId === w.targetId && this.movedNow.has(a.runtimeId))
                : [...this.runtime.actors.values()].filter(a => a.baseId === w.targetId);
              for (const a of parts) {
                const kept = w.poses.get(a.runtimeId);
                if (!partnersMoved && kept && sameWatchPose(kept, a)) continue;
                w.poses.set(a.runtimeId, watchPose(a));
                // 画面のはし watches the four sides one by one: a side that goes from not touched to touched starts it
                // (also while another side stays touched, as for a ball that bounced off the right side and goes on into
                // the top one near a corner), and two sides touched at once start it once.
                if (target === '端') {
                  const sides = EDGE_SIDES.filter(side => this.runtime.touching(a.runtimeId, side)), before = w.last.get(a.runtimeId),
                    fresh = before ? sides.filter(side => !before.includes(side) && w.started.get(a.runtimeId + '|' + side) !== tick) : [];
                  for (const side of fresh) w.started.set(a.runtimeId + '|' + side, tick);
                  if (fresh.length) this.spawnWatch(w, a.runtimeId);
                  w.last.set(a.runtimeId, sides);
                  continue;
                }
                const touching = this.runtime.touching(a.runtimeId, target);
                if (touching && w.last.has(a.runtimeId) && !w.last.get(a.runtimeId) && w.started.get(a.runtimeId) !== tick) {
                  w.started.set(a.runtimeId, tick);
                  this.spawnWatch(w, a.runtimeId);
                }
                w.last.set(a.runtimeId, touching);
              }
            }
          } catch (err) {
            this.watches = this.watches.filter(x => x !== w);
            this.taskError(w.task, err);
            return;
          }
        }
      }
      // What a ふれたとき watch's answers depend on besides the part itself: the mouse, the parts of that name (and their
      // copies), or nothing (the screen's sides do not move).
      touchPartners(target) {
        if (isEdgeTarget(target)) return [];
        if (target === 'マウス') return [{ x: this.runtime.mouseX, y: this.runtime.mouseY, entered: this.runtime.mouseAt.entered }];
        return this.runtime.targetsOf(target).map(watchPose);
      }
      spawnWatch(watch, runtimeId) {
        const task = this.createTask(watch.targetId, runtimeId, watch.event, {}, null, watch.scriptId);
        if (task) this.enqueue(task);
      }
      spawnDistributed(eventType, eventContext = {}, waitGroupId = null, only = null) {
        const out = [];
        for (const rid of this.orderedRuntimeIds()) {
          if (only && !only.has(rid)) continue;
          if (eventType === 'start' && rid !== 'stage' && this.runtime.actor(rid)?.isClone)
            continue;
          out.push(...this.spawnMatching(
            rid === 'stage' ? 'stage' : this.runtime.actor(rid)?.baseId,
            rid, eventType, eventContext, waitGroupId));
        }
        return out;
      }
      start() {
        extensions.endSession();
        this.extensionEpoch = (this.extensionEpoch || 0) + 1;
        this.extensionCompletions = [];
        this.extensionEvents = [];
        if (Object.hasOwn(this.project, 'extensions')) validateExtensionEnvelope(this.project.extensions);
        const epoch = this.extensionEpoch;
        if (extensions.requirements().required.length) extensions.beginSession({ state: this.project.extensions?.state || extensions.initialState(),
          onEvent: event => {
            if (epoch !== this.extensionEpoch) return;
            if (this.extensionEvents.length >= LIMITS.activeTasks) {
              const task = [...this.tasks.values()][0];
              if (task) this.taskError(task, new AkariError('E708', 'かくちょうからの 合図が 多すぎて、うけとりきれません'));
              else this.stop();
              return;
            }
            this.extensionEvents.push(event); this.schedule();
          },
        });
        clearTimeout(this.loopTimer);
        this.loopTimer = null;
        this.loopScheduled = false;
        this.runtime.resumeClock();
        this.running = true;
        this.stoppedAll = false;
        this.paused = false;
        this.ready = [];
        this.tasks.clear();
        this.blocked.clear();
        this.waitGroups.clear();
        this.pendingExternalUnblocks.clear();
        this.errorRecords = [];
        this.errorRecordChars = 0;
        this.errorSequence = 0;
        this.questionQueue = [];
        this.activeQuestion = null;
        this.initializeContinuous();
        this.spawnDistributed('start', {});
        this.initializeWatches();
        this.ui.state?.();
        this.schedule();
      }
      stop() {
        this.advanceContinuous(this.runtime.now(), LIMITS.functionOps === STANDARD_LIMITS.functionOps);
        if (extensions.active && extensions.requirements().required.length) this.project.extensions = {
          ...extensions.requirements(), profile: profiles.requirement(), state: extensions.snapshotState(),
        };
        this.extensionEpoch = (this.extensionEpoch || 0) + 1;
        extensions.endSession();
        this.extensionCompletions = []; this.extensionEvents = [];
        for (const task of this.tasks.values()) task.extensionAbort?.abort();
        clearTimeout(this.loopTimer);
        clearTimeout(this.questionTimer);
        this.loopTimer = null;
        this.questionTimer = null;
        this.loopScheduled = false;
        this.continuous.clear();
        this.watches = [];
        this.runtime.pauseClock();
        this.running = false;
        this.paused = false;
        for (const t of this.tasks.values()) {
          t.state = 'CANCELLED';
          t.blockReason = null;
          t.execStack = [];
          t.callFrames = [];
        }
        this.tasks.clear();
        this.ready = [];
        this.blocked.clear();
        this.waitGroups.clear();
        this.pendingExternalUnblocks.clear();
        this.questionQueue = [];
        this.activeQuestion = null;
        this.errorRecords = [];
        this.errorRecordChars = 0;
        this.runtime.pressedKeys.clear();
        this.runtime.mouseDown = false;
        this.runtime.stopAllAudio(false);
        this.ui.closeQuestion?.();
        this.ui.state?.();
      }
      // Nothing goes on now: no flow runs, waits or is queued, no continuous rule is kept, no question is open, and no
      // extension event or answer waits to be taken in. A body may still start again (ended).
      idle() {
        return !(!this.running || this.tasks.size || this.ready.length || this.continuous.size || this.questionQueue.length ||
          this.activeQuestion || this.extensionEvents?.length || this.extensionCompletions?.length);
      }
      // The run has ended by itself: it is idle, and no body can start again (none waits for input, a 名人 condition or
      // interval, or a registered extension event while the extensions run). An extension that is only registered, and
      // an unregistered 「拡張:…」 name (an ordinary signal of the work), keep nothing going.
      ended() {
        return this.idle() && !(this.compiled.items || []).some(item => RESTARTING_EVENTS.has(item.event) || this.waitsForExtension(item));
      }
      // A body for an event that a running extension registered: the event comes from outside the work, as a key does
      // (the editor's status names its 合図).
      waitsForExtension(item) {
        const name = String((item.filter && typeof item.filter === 'object' ? item.filter.message : item.filter) ?? '');
        return extensions.active && item.event === 'message' && name.startsWith('拡張:') && !!extensions.describe(name.slice(3), 'events');
      }
      pause() {
        if (!this.running) return;
        clearTimeout(this.loopTimer);
        this.loopTimer = null;
        this.loopScheduled = false;
        this.advanceContinuous();
        this.runtime.pauseClock();
        this.paused = true;
        this.ui.state?.();
      }
      resume() {
        if (!this.running) return;
        this.runtime.resumeClock();
        this.paused = false;
        this.refreshContinuous();
        this.ui.state?.();
        this.schedule();
      }
      stepOne() {
        if (!this.running) return;
        this.pause();
        this.runTurn(true);
      }
      schedule(delay = 0) {
        if (!this.running || this.paused || this.inLoop) return;
        const due = nowMs() + delay;
        if (this.loopScheduled) {
          if (due >= this.loopDue) return;
          clearTimeout(this.loopTimer);
        }
        this.loopScheduled = true;
        this.loopDue = due;
        const wake = () => {
          this.loopTimer = null;
          this.loopScheduled = false;
          this.loop();
        };
        // A wake on the channel cannot be taken back: one that pause, stop or an earlier wake has let go of
        // (loopTimer is no longer its own) does nothing.
        if (delay <= 0 && wakeSoon) {
          const token = (this.loopTimer = { soon: true });
          wakeSoon(() => { if (this.loopTimer === token) wake(); });
        } else this.loopTimer = setTimeout(wake, delay);
      }
      loop() {
        if (!this.running || this.paused) return;
        this.inLoop = true;
        const started = nowMs();
        let count = 0;
        try {
          // A slice runs for at most 8 ms. The count only bounds a slice when the clock does not move (a test's clock);
          // it is large enough for 300 paced copies to take their turn at every こま (final call 17). The flows that
          // waited for this time (a paced loop's こま, a wait that ends) become ready when the waits are looked at
          // (recheckBlocked): their turns run once more in this same wake, not one wake later.
          for (let pass = 0; pass < 2; pass++) {
            while (
              this.running &&
              !this.paused &&
              this.ready.length &&
              count < 2000 &&
              nowMs() - started < 8
            ) {
              this.runTurn(false);
              count++;
            }
            this.recheckBlocked();
            if (!this.ready.length || count >= 2000 || nowMs() - started >= 8) break;
          }
        } finally {
          this.inLoop = false;
        }
        if (this.running && !this.paused) {
          if (this.ready.length) this.schedule();
          else if (
            this.continuous.size || this.watches?.length || [...this.blocked].some((t) =>
              ['time', 'condition', 'glide', 'calculation'].includes(t.blockReason?.kind),
            )
          )
            this.schedule(this.wakeDelay());
        }
      }
      // A part speaks until its timed speech ends (名人: ねこが話し終わるまで待つ).
      speaking(runtimeId) {
        for (const t of this.blocked) if (t.blockReason?.speechToken && t.blockReason.runtimeId === runtimeId) return true;
        return false;
      }
      // 名人: 犬と鳥に「出発」と知らせる — the runtime ids of the parts (a list of parts counts each).
      targetRuntimeIds(targets, ctx) {
        const ids = new Set();
        for (const target of targets) {
          const value = evalExpression(target, ctx);
          for (const part of Array.isArray(value) ? partList(value) : [value]) {
            if (!isPart(part)) throw new AkariError('R411', '知らせる 相手には 部品を 書きます');
            ids.add(part.part);
          }
        }
        return ids;
      }
      context(task, extra = {}) {
        return {
          runtime: this.runtime,
          scheduler: this,
          compiled: this.compiled,
          task,
          runtimeId: task.subject?.runtimeId || task.callFrames.at(-1)?.runtimeId || task.runtimeId,
          eventContext: task.eventContext,
          ...extra,
        };
      }
      selectSubject(task, node) {
        const relative = task.callFrames.at(-1)?.runtimeId || task.runtimeId;
        if (node?.actorRef?.kind === 'value') {
          task.subject = { runtimeId: this.runtime.partRuntimeId(evalExpression(node.actorRef.value, this.context(task))) };
          return;
        }
        task.subject = { runtimeId: this.runtime.resolveActorRef(node.actorRef, relative) };
      }
      // A turn of a loop that changed the screen (a part moved, turned or changed its looks, text, pen or speech) and
      // waited nowhere: the flow waits for the next こま of the logical clock (1/60 s, the grid of the continuous rules)
      // before it goes on, whatever comes next (the next turn, or the sentence after the loop), so the motion shows
      // without a wait sentence. A turn that only calculates goes on at once. Each loop frame keeps its own turn's
      // marks; a lane marks the loops of the flow it belongs to. Not while stepping.
      paceTurn(task, top) {
        if (top.visual && !top.waited && !top.yielded && !this.paused) {
          top.yielded = true;
          task.execStack.push({ type: 'frameYield', node: top.node });
          return true;
        }
        top.visual = top.waited = top.yielded = false;
        return false;
      }
      // A 〜まで／〜あいだ loop reads its condition when the loop is reached and once before each next turn, after the
      // こま's wait of a paced turn (normalizeStack), at the flow's own turn.
      enterLoopTurn(task, frame) {
        frame.visual = frame.waited = frame.yielded = false;
        this.enterBody(task, frame.node.body);
      }
      markTurn(task, mark) {
        for (let t = task; t; t = t.laneParent)
          for (const frame of t.execStack) if (PACED_LOOP_FRAMES.has(frame.type)) frame[mark] = true;
      }
      // The こま a paced turn waits for. A flow that waited for こま k waits next for こま k+1, also when the page woke
      // after it: a late wake runs the turns that are due at once, so the speed stays that of the logical clock (1秒に
      // 300歩 for 5歩 a turn). A flow further behind (a page that stopped for a while) starts again from the next こま,
      // so it does not run a long burst of turns. Any other wait ends the chain (block).
      nextFrameTime(task) {
        const grid = 1000 / 60, origin = this.continuousOrigin ?? 0,
          tick = Math.floor((this.runtime.now() - origin) / grid + 1e-9) + 1,
          next = task.paceTick != null && task.paceTick + 1 > tick - PACE_CATCH_UP ? task.paceTick + 1 : tick;
        task.paceTick = next;
        return origin + next * grid;
      }
      // When the loop sleeps: at the end of the next wait that ends within a こま (the next こま of a paced loop), so
      // the wake is not just before it; otherwise in 16 ms, to look at the conditions, glides and rules again.
      wakeDelay() {
        let due = Infinity;
        for (const t of this.blocked) if (t.blockReason?.kind === 'time') due = Math.min(due, t.blockReason.deadline);
        const delay = Math.ceil(due - this.runtime.now());
        return delay <= 17 ? Math.max(0, delay) : 16;
      }
      normalizeStack(task) {
        let guard = 0;
        while (task.execStack.length && guard++ < 1000) {
          const top = task.execStack[task.execStack.length - 1];
          if (top.type === 'frameYield') return top;
          if (top.type === 'seq') {
            if (top.index < top.nodes.length) return top;
            task.execStack.pop();
            continue;
          }
          if (top.type === 'callBoundary') {
            task.execStack.pop();
            const finishedFrame = task.callFrames.pop();
            this.runtime.countEvent(finishedFrame.runtimeId + '|action|' + finishedFrame.name);
            for (const id of finishedFrame.broadcastGroups?.values() || []) this.waitGroups.delete(id);
            continue;
          }
          if (top.type === 'repeatCount') {
            if (this.paceTurn(task, top)) return task.execStack.at(-1);
            if (top.remaining > 0) {
              top.remaining--;
              task.execStack.push({ type: 'seq', nodes: top.node.body, index: 0 });
              if (!top.node.body.some((n) => n.kind !== 'CommentLine'))
                return { type: 'idle', node: top.node };
              continue;
            }
            task.execStack.pop();
            continue;
          }
          if (top.type === 'forever') {
            if (this.paceTurn(task, top)) return task.execStack.at(-1);
            task.execStack.push({ type: 'seq', nodes: top.node.body, index: 0 });
            if (!top.node.body.some((n) => n.kind !== 'CommentLine'))
              return { type: 'idle', node: top.node };
            continue;
          }
          if (top.type === 'foreach') {
            if (this.paceTurn(task, top)) return task.execStack.at(-1);
            if (top.index < top.values.length) {
              const value = deepCopy(top.values[top.index++]);
              task.execStack.push({
                type: 'seq',
                nodes: top.node.body,
                index: 0,
                binder: { name: top.node.binder, value },
              });
              if (!top.node.body.some((n) => n.kind !== 'CommentLine'))
                return { type: 'idle', node: top.node };
              continue;
            }
            task.execStack.pop();
            continue;
          }
          if (top.type === 'while' || top.type === 'until') {
            // A paced turn waits for the next こま first; then the condition is read once, at this flow's own turn
            // (くり返しと画面の動き), after the flows earlier in the order have taken that こま's steps. A body with no
            // sentence, and a condition calculated a little at a time, keep the check as a step of its own.
            if (this.paceTurn(task, top)) return task.execStack.at(-1);
            const condition = top.condition || top.node.condition;
            if (!top.node.body.some((n) => n.kind !== 'CommentLine') ||
              (LIMITS.functionOps !== STANDARD_LIMITS.functionOps && hasUserFunction(condition))) return top;
            this.selectSubject(task, top.node);
            const v = bool(evalExpression(condition, this.context(task)));
            if (top.type === 'while' ? v : !v) this.enterLoopTurn(task, top);
            else task.execStack.pop();
            continue;
          }
          break;
        }
        if (guard >= 1000) throw new AkariError('R413', 'くり返しが 多すぎて 先に すすめません');
        return task.execStack[task.execStack.length - 1] || null;
      }
      nextStep(task) {
        const top = this.normalizeStack(task);
        if (!top) return null;
        if (top.type === 'idle') return { kind: 'idle', node: top.node };
        if (top.type === 'frameYield') { task.execStack.pop(); return { kind: 'frameYield', node: top.node }; }
        if (top.type === 'seq') {
          while (top.index < top.nodes.length) {
            const n = top.nodes[top.index++];
            if (n.kind === 'CommentLine') continue;
            return { kind: 'node', node: n };
          }
          return this.nextStep(task);
        }
        if (top.type === 'while' || top.type === 'until')
          return { kind: 'loopHeader', frame: top, node: top.node };
        return null;
      }
      runTurn(force = false) {
        if (!this.running || (!force && this.paused)) return false;
        const beforeErrors = this.errorSequence;
        this.recheckBlocked(force);
        if (!this.running || this.errorSequence !== beforeErrors || (!force && this.paused))
          return false;
        const task = this.ready.shift();
        if (!task) return false;
        if (task.state !== 'READY') return false;
        task.state = 'RUNNING';
        let step;
        try {
          step = this.nextStep(task);
          if (!step) {
            this.finishTask(task, 'DONE');
            return true;
          }
          // The pacing of a loop (paceTurn): the next turn waits for the next こま.
          if (step.kind === 'frameYield') {
            this.block(task, { kind: 'time', deadline: this.nextFrameTime(task), frame: true });
            this.recheckBlocked(force);
            return true;
          }
          this.selectSubject(task, step.node);
          task.currentNode = step.node;
          const frame = task.callFrames.at(-1);
          if (frame) frame.currentLine = step.node.sourceSpan?.startLine || 1;
          if (step.kind !== 'idle') this.ui.beforeStatement?.(task, step.node);
          if (step.kind === 'node') this.executeNode(task, step.node);
          else if (step.kind === 'loopHeader') this.executeLoopHeader(task, step.frame);
          if (step.kind === 'node') this.markMoved(task, step.node);
          if (task.state === 'RUNNING' && !this.blocked.has(task)) {
            const next = this.normalizeStack(task);
            if (!next) this.finishTask(task, 'DONE');
            else this.enqueue(task);
          }
          this.refreshContinuous();
          this.ui.afterStatement?.(task, step.node);
          this.recheckBlocked(force);
          return true;
        } catch (err) {
          this.taskError(task, err);
          return true;
        }
      }
      // After a sentence, what it may have moved, for the ふれたとき watches (pollWatches): a sentence that acts only on
      // its own part marks that part; any other sentence that is not still, everything.
      markMoved(task, node) {
        if (STILL_KINDS.has(node.kind)) return;
        const own = OWN_PART_KINDS.has(node.kind) && !node.laneRef && node.actorRef?.kind !== 'all' && !OTHER_PART_OPS.has(node.op) && this.runtime.actor(task.subject?.runtimeId);
        if (own) this.movedParts.add(own.runtimeId); else this.geometryStamp++;
      }
      prepareCooperativeNode(task, node, loopFrame = null) {
        if (!hasUserFunction(node)) return false;
        this.selectSubject(task,node);
        const ctx=this.context(task), result={...node};
        function* prepare() {
          const budget={count:0};
          for (const key of ['value','condition','count','seconds','question','message','initial','list','index'])
            if (node[key]?.kind && hasUserFunction(node[key])) result[key]=valueExpression(yield* evalExpressionSteps(node[key],ctx,budget));
          if (node.args?.some(hasUserFunction)) {
            result.args=[];
            for (const argument of node.args) result.args.push(valueExpression(yield* evalExpressionSteps(argument,ctx,budget)));
          }
          return result;
        }
        this.block(task,{kind:'calculation',evaluator:prepare(),epoch:this.extensionEpoch,loopFrame,originalNode:node});
        this.schedule(0); return true;
      }
      advanceCalculation(task) {
        const reason=task.blockReason;
        if (!reason || reason.kind!=='calculation' || !this.running || reason.epoch!==this.extensionEpoch) return;
        const outcome=advanceEvaluation(reason.evaluator);
        if (!outcome.done) return;
        this.blocked.delete(task); task.blockReason=null; task.state='RUNNING';
        if (reason.loopFrame) {
          const keep=bool(evalExpression(outcome.value.condition,this.context(task)));
          if (reason.loopFrame.type==='while'?keep:!keep) this.enterLoopTurn(task,reason.loopFrame);
          else task.execStack.pop();
        } else { this.executePreparedNode(task,outcome.value,reason.originalNode); this.markMoved(task,reason.originalNode); }
        if (task.state==='RUNNING') {
          if (this.normalizeStack(task)) this.enqueue(task); else this.finishTask(task,'DONE');
        }
        this.ui.afterStatement?.(task,outcome.value);
      }
      *evaluateContinuous(control) {
        const ctx=this.context(control.task), budget={count:0};
        if (!bool(yield* evalExpressionSteps(control.rule.condition,ctx,budget))) return null;
        if (control.state !== 'INACTIVE') return control.speed;
        const seconds=numberInUnit(yield* evalExpressionSteps(control.rule.seconds,ctx,budget),'秒'),
          distance=numberInUnit(yield* evalExpressionSteps(control.rule.distance,ctx,budget),'歩');
        if (seconds<=0) throw new AkariError('R412', '速さの 時間は 0より 大きく します');
        return ensureFinite(distance/seconds);
      }

      executeLoopHeader(task, frame) {
        if (LIMITS.functionOps !== STANDARD_LIMITS.functionOps && this.prepareCooperativeNode(task, frame.node, frame)) return;
        const v = bool(evalExpression(frame.condition || frame.node.condition, this.context(task)));
        const keep = frame.type === 'while' ? v : !v;
        if (keep) this.enterLoopTurn(task, frame);
        else task.execStack.pop();
        return { requeue: true };
      }
      enterBody(task, nodes, binder = null) {
        task.execStack.push({ type: 'seq', nodes, index: 0, ...(binder ? { binder } : {}) });
      }
      executeNode(task, n) {
        if (LIMITS.functionOps !== STANDARD_LIMITS.functionOps && this.prepareCooperativeNode(task, n)) return;
        return this.executePreparedNode(task, n);
      }
      executePreparedNode(task, n, originalNode = n) {
        this.selectSubject(task, n);
        if (PACED_SCREEN_KINDS.has(n.kind)) this.markTurn(task, 'visual');
        const ctx = this.context(task);
        switch (n.kind) {
          case 'ExtensionCommand': {
            const controller = new AbortController(), epoch = this.extensionEpoch;
            task.extensionAbort = controller;
            const result = invokeExtension('command', n.name, n.args.map(x => evalExpression(x, ctx)), { ...ctx, signal: controller.signal });
            if (result && typeof result.then === 'function') {
              this.block(task, { kind: 'extension' });
              const complete = (error, value) => {
                if (!this.running || this.extensionEpoch !== epoch || !this.tasks.has(task.taskId) || controller.signal.aborted) return;
                this.extensionCompletions.push(() => {
                  if (!this.tasks.has(task.taskId) || controller.signal.aborted) return;
                  if (error) this.taskError(task, extensionError(error));
                  else { if (value !== null) task.lastAnswer = value; this.unblock(task); }
                }); this.schedule();
              };
              result.then(value => complete(null, value), error => complete(error));
              return { requeue: false };
            }
            if (result !== null) task.lastAnswer = result;
            return;
          }
          case 'TimerReset':
            this.runtime.timerOffset = this.runtime.now() - this.runtime.startTime;
            return;
          case 'NoOperation':
            return;
          case 'Assignment':
            this.runtime.writeTarget(n.target, evalExpression(n.value, ctx), ctx);
            this.ui.render?.();
            return;
          case 'NumericUpdate': {
            const b = this.runtime.resolveBinding(n.target.name, n.target.qualifier, ctx);
            if (!b?.set) throw new AkariError('S301', `入れる先「${n.target.name}」が ありません`);
            const cur = b.get(),
              v = evalExpression(n.value, ctx);
            if (Array.isArray(cur)) throw new AkariError('R411', 'これは 数の へんすうに 使う ブロックです');
            this.runtime.writeTarget(n.target, addNumericUpdate(cur, v, n.op), ctx, {resolvedBinding: b});
            this.ui.renderMonitor?.();
            return;
          }
          case 'ListAppend':
          case 'ListInsert':
          case 'ListReplace':
          case 'ListDelete':
          case 'ListClear':
          case 'ListRemoveValue':
            execListMutation(n, ctx);
            this.ui.renderMonitor?.();
            return;
          case 'IfStatement':
            this.enterBody(task, bool(evalExpression(n.condition, ctx)) ? n.thenBody : n.elseBody);
            return;
          case 'RepeatCount': {
            const count = numberInUnit(evalExpression(n.count, ctx), '回');
            if (!Number.isSafeInteger(count) || count < 0 || count > LIMITS.repeatCount)
              throw new AkariError('R413', 'くり返す 回数は 0、1、2 のような 数に します。マイナスや 小数、大きすぎる 数は 使えません');
            if (count > 0) {
              task.execStack.push({ type: 'repeatCount', node: n, remaining: count - 1 });
              this.enterBody(task, n.body);
            }
            return;
          }
          case 'RepeatWhile': {
            const v = bool(evalExpression(n.condition, ctx));
            if (v) {
              task.execStack.push({ type: 'while', node: originalNode });
              this.enterBody(task, n.body);
            }
            return;
          }
          case 'RepeatUntil': {
            // Counts (〜が3回おされるまで) are compared with those when the repeat began.
            const condition = hasEventCount(originalNode.condition) ? this.runtime.bindEventCounts(originalNode.condition, ctx) : null;
            const v = bool(evalExpression(condition || n.condition, ctx));
            if (!v) {
              task.execStack.push({ type: 'until', node: originalNode, ...(condition ? { condition } : {}) });
              this.enterBody(task, n.body);
            }
            return;
          }
          case 'Forever':
            task.execStack.push({ type: 'forever', node: n });
            this.enterBody(task, n.body);
            return;
          case 'ForEach': {
            const arr = evalExpression(n.list, ctx);
            if (!Array.isArray(arr)) throw new AkariError('R411', '「それぞれ」は リストに 使います');
            const vals = deepCopy(arr);
            if (vals.length) {
              task.execStack.push({ type: 'foreach', node: n, values: vals, index: 1 });
              this.enterBody(task, n.body, { name: n.binder, value: vals[0] });
            }
            return;
          }
          case 'Break':
            this.breakLoop(task, false);
            return;
          case 'Continue':
            this.breakLoop(task, true);
            return;
          case 'WaitTime': {
            const sec = numberInUnit(evalExpression(n.seconds, ctx), '秒');
            if (sec < 0) throw valueError('R412', '待つ 時間は 0より 小さく できません', n.seconds);
            if (sec === 0) return;
            const deadline = ensureFinite(this.runtime.now() + sec * 1000);
            this.block(task, { kind: 'time', deadline });
            return { requeue: false };
          }
          case 'WaitUntil': {
            // Counts (〜が10回【ジャンプ】するまで) are compared with those when the wait began.
            const condition = hasEventCount(originalNode.condition) ? this.runtime.bindEventCounts(originalNode.condition, ctx) : originalNode.condition;
            if (bool(evalExpression(condition === originalNode.condition ? n.condition : condition, ctx))) return;
            this.block(task, { kind: 'condition', condition });
            return { requeue: false };
          }
          case 'Say': {
            const v = evalExpression(n.value, ctx);
            if (Array.isArray(v)) {
              const list = n.value?.kind === 'VariableRead' ? n.value.name : exampleListName(ctx);
              throw new AkariError('R411', list ? `リストは そのまま 言えません。中身を 言う ときは「${list}の1番目を言う」のように 書きます` : 'リストは そのまま 言えません。中身を 1つずつ 言います');
            }
            const sec = n.seconds === undefined ? null : numberInUnit(evalExpression(n.seconds, ctx), '秒');
            if (sec !== null && sec < 0) throw valueError('R412', '話す 時間は 0より 小さく できません', n.seconds);
            const deadline = sec === null ? null : ensureFinite(this.runtime.now() + sec * 1000);
            const token = {};
            this.speechTokens.set(ctx.runtimeId, token);
            this.ui.prepareSpeech?.(v);
            if (sec === null) this.ui.say?.(ctx.runtimeId, valueText(v));
            else this.ui.say?.(ctx.runtimeId, valueText(v), true);
            if (sec !== null) {
              if (sec === 0) { this.ui.clearSpeech?.(ctx.runtimeId); return; }
              this.block(task, {kind:'time', deadline, speechToken:token});
              return {requeue:false};
            }
            return;
          }
          case 'Ask': {
            const q = stringv(evalExpression(n.question, ctx));
            this.block(task, { kind: 'question' });
            this.questionQueue.push({ task, runtimeId: ctx.runtimeId, question: q });
            this.showNextQuestion();
            return { requeue: false };
          }
          case 'Broadcast': {
            const msg = stringv(evalExpression(n.message, ctx)), only = n.targets ? this.targetRuntimeIds(n.targets, ctx) : null;
            const ref = n.broadcastRef || n.groupId;
            const references = task.callFrames.at(-1)?.broadcastGroups || task.broadcastGroups;
            if (ref) {
              const old = references.get(ref);
              if (old) this.waitGroups.delete(old);
              const wg = { id: `wait-${++this.waitSeq}`, sender: task, pending: new Set(), ref, references };
              references.set(ref, wg.id);
              this.waitGroups.set(wg.id, wg);
              this.spawnDistributed('message', { message: msg }, wg.id, only);
              if (!wg.pending.size) { references.delete(ref); this.waitGroups.delete(wg.id); }
            } else this.spawnDistributed('message', { message: msg }, null, only);
            return;
          }
          case 'WaitBroadcastGroup': {
            const references = task.callFrames.at(-1)?.broadcastGroups || task.broadcastGroups;
            const id = references.get(n.broadcastRef), wg = this.waitGroups.get(id);
            references.delete(n.broadcastRef);
            if (!wg || !wg.pending.size) { this.waitGroups.delete(id); return; }
            wg.consumed = true;
            this.block(task, { kind: 'waitGroup', waitGroupId: id });
            return { requeue: false };
          }
          case 'BroadcastAndWait': {
            const msg = stringv(evalExpression(n.message, ctx)), only = n.targets ? this.targetRuntimeIds(n.targets, ctx) : null,
              wg = { id: `wait-${++this.waitSeq}`, sender: task, pending: new Set() };
            this.waitGroups.set(wg.id, wg);
            const ts = this.spawnDistributed('message', { message: msg }, wg.id, only);
            if (ts.length) {
              this.block(task, { kind: 'waitGroup', waitGroupId: wg.id });
              return { requeue: false };
            }
            this.waitGroups.delete(wg.id);
            return;
          }
          case 'Parallel':
            return this.startLanes(task, n.lanes.map(nodes => ({ nodes, binder: null })));
          case 'ParallelEach': {
            // The limit is checked before any lane starts (startLanes); then every member must be a part.
            const values = evalExpression(n.list, ctx);
            if (!Array.isArray(values)) throw new AkariError('R411', '「みんな」は 部品の あつまりに 使います');
            if (this.tasks.size + values.length <= LIMITS.activeTasks) partList(values);
            return this.startLanes(task, values.map(value => ({ nodes: n.body, binder: { name: n.binder, value } })));
          }
          // 名人: 【…】という手順を、次のように作る only registers the procedure.
          case 'ActionDefinition':
            return;
          // 10秒のあいだ、くり返す: each round begins only while the time from the start has not passed.
          case 'TimedRepeat': {
            const sec = numberInUnit(evalExpression(n.seconds, ctx), '秒');
            if (sec < 0) throw new AkariError('R412', 'くり返す 時間は 0より 小さく できません');
            if (sec > 0) {
              task.execStack.push({ type: 'while', node: originalNode, condition: { kind: 'DeadlineBound', deadline: ensureFinite(this.runtime.now() + sec * 1000) } });
              this.enterBody(task, n.body);
            }
            return;
          }
          // ねこは、1秒に20歩の速さで、ゴールにふれるまで前へ動き続ける (or for a time): on the clock of the continuous rules.
          case 'MoveUntil': {
            const actor = this.runtime.requireActor(ctx),
              seconds = numberInUnit(evalExpression(n.seconds, ctx), '秒'),
              distance = numberInUnit(evalExpression(n.distance, ctx), '歩');
            if (seconds <= 0) throw new AkariError('R412', '速さの 時間は 0より 大きく します');
            const condition = n.condition ? (hasEventCount(n.condition) ? this.runtime.bindEventCounts(n.condition, ctx) : n.condition) : null;
            const deadline = n.duration ? ensureFinite(this.runtime.now() + numberInUnit(evalExpression(n.duration, ctx), '秒') * 1000) : null;
            if ((condition && bool(evalExpression(condition, ctx))) || (deadline !== null && deadline <= this.runtime.now())) return;
            this.directionVector(n.direction, actor);
            this.advanceContinuous();
            const key = `move:${task.taskId}:${++this.waitSeq}`;
            this.continuous.set(key, { rule: { id: key, direction: n.direction }, runtimeId: ctx.runtimeId, task, state: 'ACTIVE', speed: ensureFinite(distance / seconds), temporary: true, startTime: this.continuousTime, moved: 0 });
            this.block(task, { kind: 'moveUntil', key, condition, deadline });
            return { requeue: false };
          }
          case 'UserActionCall':
            this.callAction(task, n, ctx);
            return;
          case 'LocalVariableDeclaration': {
            const f = task.callFrames[task.callFrames.length - 1];
            if (!f) throw new AkariError('S313', 'この中だけの へんすうは 自分で作ったブロックの 中でだけ 作れます');
            f.locals.set(n.name, localScalar(evalExpression(n.initial, ctx)));
            return;
          }
          case 'LocalListDeclaration': {
            const f = task.callFrames[task.callFrames.length - 1];
            if (!f) throw new AkariError('S313', 'この中だけの リストは 自分で作ったブロックの 中でだけ 作れます');
            f.localLists.set(n.name, []);
            return;
          }
          case 'ReturnStatement':
            throw new AkariError('S307', '「〜を返す」は「答えを もとめる」の 中でだけ 使えます');
          case 'StopCommand':
            return this.execStop(task, n);
          case 'MotionCommand':
            return this.execMotion(task, n, ctx);
          case 'LooksCommand':
            return this.execLooks(task, n, ctx);
          case 'PenCommand':
            return this.execPen(task, n, ctx);
          case 'SoundCommand':
            return this.execSound(task, n, ctx);
          case 'CloneCommand':
            return this.execClone(task, n, ctx);
          default:
            throw new AkariError('P201', `まだ 動かせない 文 ${n.kind}`);
        }
      }
      breakLoop(task, isContinue) {
        let idx = -1;
        for (let i = task.execStack.length - 1; i >= 0; i--) {
          if (task.execStack[i].type === 'callBoundary') break;
          if (
            ['repeatCount', 'while', 'until', 'forever', 'foreach'].includes(task.execStack[i].type)
          ) {
            idx = i;
            break;
          }
        }
        if (idx < 0) throw new AkariError('S309', 'くり返しの外では使えません');
        task.execStack.splice(isContinue ? idx + 1 : idx);
      }
      callAction(task, n, ctx) {
        const def = this.compiled.symbols.actions.get(n.name);
        if (!def) throw new AkariError('S301', `てじゅん「${n.name}」が ありません`);
        if (task.callFrames.length + 1 > LIMITS.callDepth)
          throw new AkariError('R408', '自分で作ったブロックの よびだしが かさなりすぎました');
        if (def.args.length !== n.args.length)
          throw new AkariError('S308', `てじゅん「${n.name}」に 入れる ものは${def.args.length}こです`+namedArgumentDetails(def.args,n.argumentNames));
        const sourceValues = n.args.map((x) => deepCopy(evalExpression(x, ctx)));
        const names = n.argumentNames || [];
        if (names.length && (names.length !== def.args.length || new Set(names).size !== names.length ||
            names.some((name) => !def.args.includes(name))))
          throw new AkariError('S308', '入れる ものの 名前が 合いません');
        const vals = names.length ? def.args.map((name) => sourceValues[names.indexOf(name)]) : sourceValues;
        const frame = {
          id: def.id,
          runtimeId: ctx.runtimeId,
          broadcastGroups: new Map(),
          name: def.name,
          args: new Map(def.args.map((a, i) => [a, vals[i]])),
          locals: new Map(),
          localLists: new Map(),
        };
        task.callFrames.push(frame);
        task.execStack.push({ type: 'callBoundary', frame });
        task.execStack.push({
          type: 'seq',
          nodes: this.compiled.astByKey.get(`action:${def.id}`)?.body || [],
          index: 0,
        });
      }
      startLanes(task, lanes) {
        if (this.tasks.size + lanes.length > LIMITS.activeTasks)
          throw new AkariError('R413', '同時に 動いて いる 動きが 多すぎます。コピーや 合図を へらして ください');
        const wg = { id: `wait-${++this.waitSeq}`, sender: task, pending: new Set() };
        this.waitGroups.set(wg.id, wg);
        const binders = [...(task.inheritedBinders || [])];
        for (let i = task.execStack.length - 1; i >= 0 && task.execStack[i].type !== 'callBoundary'; i--)
          if (task.execStack[i].binder) binders.unshift(task.execStack[i].binder);
        for (const lane of lanes) {
          if (!lane.nodes.some(x => x.kind !== 'CommentLine')) continue;
          const child = {
            taskId: `task-${++this.seq}`, scriptId: task.scriptId, subject: { ...task.subject },
            broadcastGroups: new Map(), targetId: task.targetId, runtimeId: task.runtimeId,
            eventType: task.eventType, eventContext: { ...task.eventContext }, lastAnswer: task.lastAnswer,
            // Frames are shared, so a lane reads and writes the same この中だけ variables as its flow.
            callFrames: [...task.callFrames],
            inheritedBinders: lane.binder ? [...binders, lane.binder] : binders,
            execStack: [{ type: 'seq', nodes: lane.nodes, index: 0 }],
            state: 'READY', waitGroupId: wg.id, createdSequence: this.seq, error: null,
            laneParent: task, laneRoot: task.laneRoot || task,
          };
          this.tasks.set(child.taskId, child);
          wg.pending.add(child.taskId);
          this.enqueue(child);
        }
        if (!wg.pending.size) { this.waitGroups.delete(wg.id); return; }
        this.block(task, { kind: 'waitGroup', waitGroupId: wg.id, lanes: true });
        return { requeue: false };
      }
      block(task, reason) {
        // A wait of the flow (a time, a condition, a glide, an answer, a sound, a signal's work) is a wait of every loop
        // turn it is in. A frame of the pacing, a calculation step and the wait for the flow's own lanes are not.
        if (!reason.frame && reason.kind !== 'calculation' && !reason.lanes) this.markTurn(task, 'waited');
        if (!reason.frame && reason.kind !== 'calculation') task.paceTick = null;
        // A こま's wait shows every change made so far: a loop around it waits again only for changes made after it.
        if (reason.frame)
          for (let t = task; t; t = t.laneParent) for (const frame of t.execStack) if (PACED_LOOP_FRAMES.has(frame.type)) frame.visual = false;
        if (reason.kind !== 'time' || !(reason.deadline >= this.dueAt)) this.dueAt = -Infinity;
        task.state = 'BLOCKED';
        task.blockReason = { runtimeId: task.subject?.runtimeId || task.runtimeId, ...reason };
        this.blocked.add(task);
      }
      unblock(task) {
        if (!this.blocked.has(task) || ['CANCELLED', 'DONE', 'ERROR'].includes(task.state)) return;
        this.blocked.delete(task);
        task.blockReason = null;
        this.enqueue(task);
      }
      queueExternalUnblock(handleId) {
        if (!this.running) return;
        this.pendingExternalUnblocks.add(handleId);
        this.schedule();
      }
      drainExternalUnblocks() {
        if (!this.running || !this.pendingExternalUnblocks.size) return;
        const ids = new Set(this.pendingExternalUnblocks);
        this.pendingExternalUnblocks.clear();
        for (const t of [...this.blocked].sort((a, b) => a.createdSequence - b.createdSequence)) {
          if (t.blockReason?.kind === 'audio' && ids.has(t.blockReason.handleId)) this.unblock(t);
        }
      }
      advanceGlide(t, br, now) {
              this.movedParts.add(br.runtimeId);
              const p = clamp((now - br.startTime) / br.duration, 0, 1),
                a = this.runtime.actor(br.runtimeId);
              if (!a) throw new AkariError('R405', '動かす キャラクターや 部品が 見つかりません');
              // 〇秒かけて、右に90度回る: the direction goes from where it started by the part of the turn; what else
              // turned the part meanwhile is kept, as for a move.
              if (br.turn !== undefined) {
                const next = br.startDirection + br.turn * p, written = normalizeDirection(br.lastDirection),
                  turned = ((a.direction - written) % 360 + 540) % 360 - 180, other = Math.abs(turned) <= 1e-9 ? 0 : turned;
                a.direction = normalizeDirection(snapStep(normalizeDirection(ensureFinite(next + other))));
                br.lastDirection = next;
                this.ui.render?.();
                return;
              }
              if (a) {
                const nx = ensureFinite(br.startX * (1 - p) + br.targetX * p),
                  ny = ensureFinite(br.startY * (1 - p) + br.targetY * p);
                // What else moved the part during the glide is kept; the rounding left by adding the steps is not
                // (the move ends on its end point: よこ7歩 is 7, not 6.999999999999591).
                const moved = (at, last, next) => { const d = at - last; return Math.abs(d) <= 1e-9 * Math.max(1, Math.abs(next)) ? 0 : d; };
                const actualX = snapStep(ensureFinite(nx + moved(a.x, br.lastX, nx))),
                  actualY = snapStep(ensureFinite(ny + moved(a.y, br.lastY, ny)));
                if (a.penDown && (br.lastX !== nx || br.lastY !== ny))
                  this.ui.penLine?.(a.x, a.y, actualX, actualY, a.penColor, a.penSize);
                a.x = actualX;
                a.y = actualY;
                br.lastX = nx;
                br.lastY = ny;
                this.ui.render?.();
              }
      }
      recheckBlocked(force = false) {
        if (this.running && (!this.paused || force)) {
          for (const complete of (this.extensionCompletions || []).splice(0)) { this.geometryStamp++; complete(); }
          for (const event of (this.extensionEvents || []).splice(0))
            this.spawnDistributed('message', { message: '拡張:' + event.name, payload: event.payload });
        }
        if (!this.running || (this.paused && !force)) return;
        this.advanceContinuous();
        this.drainExternalUnblocks();
        this.pollWatches();
        const now = this.runtime.now();
        // While every blocked flow waits for a time not yet reached (paced loops between こま), nothing is due; the
        // earliest such time is kept (dueAt) until a flow blocks again (block).
        if (now < this.dueAt) return;
        let due = false, next = Infinity;
        for (const t of this.blocked) {
          const br = t.blockReason;
          if (!br) continue;
          if (br.kind !== 'time' || now >= br.deadline) { due = true; break; }
          next = Math.min(next, br.deadline);
        }
        if (!due) { this.dueAt = next; return; }
        this.dueAt = -Infinity;
        const arr = [...this.blocked].sort((a, b) => a.createdSequence - b.createdSequence);
        const timed = [];
        for (const t of arr) {
          const br = t.blockReason;
          if (!br) continue;
          try {
            if (br.kind === 'calculation') { this.advanceCalculation(t); continue; }
            if (br.kind === 'condition' && LIMITS.functionOps !== STANDARD_LIMITS.functionOps && hasUserFunction(br.condition)) {
              if (!br.evaluator) br.evaluator = evalExpressionSteps(br.condition, this.context(t, { runtimeId: br.runtimeId }), {count:0});
              const outcome = advanceEvaluation(br.evaluator);
              if (outcome.done) { br.evaluator = null; if (bool(outcome.value)) this.unblock(t); }
              continue;
            }
            if (br.kind === 'condition' && bool(evalExpression(br.condition, this.context(t, { runtimeId: br.runtimeId }))))
              this.unblock(t);
            else if (br.kind === 'time' && now >= br.deadline) timed.push(t);
            else if (br.kind === 'moveUntil') {
              // Settled on the clock (settleMoves); a move whose control is gone has ended.
              if (!this.continuous.has(br.key)) this.unblock(t);
            }
            else if (br.kind === 'glide') {
              this.advanceGlide(t, br, now);
              const p = clamp((now - br.startTime) / br.duration, 0, 1);
              if (p >= 1) timed.push(t);
            }
          } catch (err) {
            this.taskError(t, err);
            return;
          }
        }
        timed.sort(
          (a, b) =>
            (a.blockReason?.deadline ?? a.blockReason?.startTime ?? 0) -
              (b.blockReason?.deadline ?? b.blockReason?.startTime ?? 0) ||
            a.createdSequence - b.createdSequence,
        );
        for (const t of timed) {
          const reason = t.blockReason;
          if (reason.speechToken && this.speechTokens.get(reason.runtimeId) === reason.speechToken) {
            this.ui.clearSpeech?.(reason.runtimeId);
            this.speechTokens.delete(reason.runtimeId);
          }
          this.unblock(t);
        }
      }
      showNextQuestion() {
        if (!this.running || this.activeQuestion) return;
        while (this.questionQueue.length) {
          const q = this.questionQueue.shift();
          if (q.task.state !== 'BLOCKED') continue;
          this.activeQuestion = q;
          this.ui.ask?.(q.question, (answer) => {
            if (this.running && this.activeQuestion === q) this.answerQuestion(answer);
          });
          return;
        }
      }
      answerQuestion(answer) {
        const q = this.activeQuestion;
        if (!q || !this.running) return;
        this.activeQuestion = null;
        const v = String(answer ?? '');
        if (cpLen(v) > LIMITS.stringChars) {
          this.ui.closeQuestion?.();
          this.taskError(q.task, new AkariError('R413', '答えの 文字が 長すぎます'));
          this.showNextQuestion();
          return;
        }
        q.task.lastAnswer = v;
        this.unblock(q.task);
        this.ui.closeQuestion?.();
        this.showNextQuestion();
      }
      finishTask(task, state = 'DONE') {
        task.extensionAbort?.abort();
        if (['DONE', 'CANCELLED', 'ERROR'].includes(task.state) && task.state !== state) return;
        // 名人: copies made in a lane are the copies the flow made (できたコピー after the lanes).
        if (state === 'DONE' && task.laneParent && task.createdCopies?.length) task.laneParent.createdCopies = [...(task.laneParent.createdCopies || []), ...task.createdCopies];
        task.state = state;
        this.blocked.delete(task);
        for (const [key, control] of this.continuous) if (control.temporary && control.task === task) this.continuous.delete(key);
        this.ready = this.ready.filter((x) => x !== task);
        this.questionQueue = this.questionQueue.filter((q) => q.task !== task);
        if (this.activeQuestion?.task === task) {
          this.activeQuestion = null;
          this.ui.closeQuestion?.();
          clearTimeout(this.questionTimer);
          this.questionTimer = setTimeout(() => {
            this.questionTimer = null;
            this.showNextQuestion();
          }, 0);
        }
        if (task.waitGroupId) {
          const wg = this.waitGroups.get(task.waitGroupId);
          if (wg) {
            wg.pending.delete(task.taskId);
            if (wg.pending.size === 0) {
              if (wg.ref) wg.references.delete(wg.ref);
              this.waitGroups.delete(wg.id);
              if (wg.sender.state === 'BLOCKED' && wg.sender.blockReason?.kind === 'waitGroup' && wg.sender.blockReason.waitGroupId === wg.id)
                this.unblock(wg.sender);
            }
          }
        }
        if (['DONE', 'CANCELLED', 'ERROR'].includes(state)) this.tasks.delete(task.taskId);
        for (const [id, wg] of this.waitGroups) if (wg.sender === task) this.waitGroups.delete(id);
        if (['DONE', 'CANCELLED', 'ERROR'].includes(state))
          for (const t of [...this.tasks.values()]) if (t.laneParent === task) this.cancelTask(t);
        task.broadcastGroups?.clear();
        for (const frame of task.callFrames) frame.broadcastGroups?.clear();
        this.ui.renderMonitor?.();
      }
      // Whose body a flow is and its きっかけ, by the words the child sees: the part (the part a copy was made from), the
      // screen, or the 名人の本文, and the heading as the body selector names it (「星」に ふれたとき); never an internal id.
      ownerName(task, item = null) {
        const id = task.targetId;
        if (item?.meijin || id === 'meijin') return '名人の本文';
        if (id === 'stage') return this.project.stage?.name || '画面';
        const c = this.project.components.find(x => x.id === id) || this.project.components.find(x => x.id === this.runtime.actor(id)?.baseId);
        return c?.name ?? '動き';
      }
      flowName(task) {
        const item = task.scriptId ? this.compiled.items?.find(x => x.scriptId === task.scriptId || x.key === 'script:' + task.scriptId) : null;
        return `${this.ownerName(task, item)} / ${task.eventType === 'continuous' ? 'つづけて動くルール' : eventText(task.eventType, item?.filter) || task.eventType}`;
      }
      taskError(task, err) {
        task.error =
          err instanceof AkariError ? err : new AkariError('R411', err?.message || String(err));
        const e = task.error;
        task.errorCallStack = [
          this.flowName(task),
          ...task.callFrames.map((f) => `自分で作ったブロック ${f.name}`),
          ...(e.akariCallStack || []),
        ];
        const frame = task.callFrames.at(-1);
        let key =
            e.akariSource?.key || task.sourceKey ||
            (frame ? `action:${frame.id}` : task.scriptId ? `script:${task.scriptId}` : `script:${task.targetId}:${task.eventType}`),
          line = e.line || task.currentNode?.sourceSpan?.startLine || 1;
        // 名人: an error in a procedure made in a 名人 script's text is shown at its line in that script.
        const textAction = key.startsWith('action:meijin-') ? this.compiled.items?.find(item => item.key === key)?.definition : null;
        if (textAction?.scriptId && !e.akariSource) { key = `script:${textAction.scriptId}`; line += textAction.line - 1; }
        const definition = key.startsWith('function:')
          ? this.project.functions.find((x) => x.id === key.slice(9))
          : key.startsWith('action:')
            ? this.project.actions.find((x) => x.id === key.slice(7))
            : null;
        const sourceKey = this.compiled.items?.find(item => item.key === key)?.documentKey || key;
        const source =
            definition?.source ??
            this.project.scripts?.find(script =>
              (script.id ? `script:${script.id}` : `script:${script.targetId}:${script.event}`) === sourceKey,
            )?.source ??
            '',
          actor = this.runtime.actor(task.subject?.runtimeId || task.runtimeId);
        if (!e.line) e.column = task.currentNode?.sourceSpan?.startColumn || 1;
        e.line = line;
        e.akariSource = { key };
        const record = {
          id: ++this.errorSequence,
          taskId: task.taskId,
          targetId: task.targetId,
          runtimeId: task.runtimeId,
          eventType: task.eventType,
          eventContext: { ...task.eventContext },
          code: e.code,
          message: e.message,
          key,
          line,
          column: e.column || 1,
          statement: source.split(/\r\n?|\n/)[line - 1] || task.currentNode?.kind || '',
          source,
          ...(e.quotedList ? { quotedList: { ...deepCopy(e.quotedList), ownerKey: sourceKey } } : {}),
          callStack: [...task.errorCallStack],
          frames: [
            ...task.callFrames.map((f) => snapshotFrame(f, 'action')),
            ...(e.akariFrames || []),
          ],
          binders: task.execStack
            .filter((x) => x.binder)
            .map((x) => [x.binder.name, deepCopy(x.binder.value)]),
          projectVariables: snapshotEntries(this.runtime.projectVars),
          projectLists: snapshotEntries(this.runtime.projectLists),
          actor: actor
            ? {
                runtimeId: actor.runtimeId,
                baseId: actor.baseId,
                x: actor.x,
                y: actor.y,
                direction: actor.direction,
                scalePercent: actor.scalePercent,
                visible: actor.visible,
                variables: snapshotEntries(actor.vars),
                lists: snapshotEntries(actor.lists),
              }
            : null,
        };
        record.chars = JSON.stringify(record).length;
        freezeRecord(record);
        this.errorRecords.push(record);
        this.errorRecordChars += record.chars;
        while (
          this.errorRecords.length > 20 ||
          (this.errorRecords.length > 1 && this.errorRecordChars > LIMITS.diagnosticsBytes)
        )
          this.errorRecordChars -= this.errorRecords.shift().chars;
        task.failureRecordId = record.id;
        this.finishTask(task, 'ERROR');
        clearTimeout(this.loopTimer);
        this.loopTimer = null;
        this.loopScheduled = false;
        this.advanceContinuous();
        this.runtime.pauseClock();
        this.paused = true;
        this.ui.runtimeError?.(task, e);
        this.ui.state?.();
      }
      cancelTask(task) {
        if (['DONE', 'ERROR', 'CANCELLED'].includes(task.state)) return;
        this.finishTask(task, 'CANCELLED');
      }
      execStop(task, n) {
        if (n.op === 'THIS') {
          this.finishTask(task.laneRoot || task, 'DONE');
          if (task.laneRoot) this.finishTask(task, 'DONE');
          return { requeue: false };
        }
        if (n.op === 'OTHERS') {
          for (const control of this.continuous.values())
            if (control.state === 'ACTIVE') control.state = 'CANCELLED_UNTIL_FALSE';
          for (const t of this.tasks.values()) if (t !== task) this.cancelTask(t);
          return;
        }
        // 自分のほかの動きを止める: the part's other bodies and continuous rules stop, and what other flows move it
        // ends where it is; this body (with its lanes) goes on, and the other parts go on.
        if (n.op === 'OWN_OTHERS') {
          const root = task.laneRoot || task;
          this.stopPartMotion(task.subject?.runtimeId || task.runtimeId, task, t => (t.laneRoot || t) === root);
          return;
        }
        if (n.op === 'ALL') {
          this.stop();
          this.stoppedAll = true;
          this.ui.allStopped?.();
          return { requeue: false };
        }
        // 名人: ねこの動きを止める (not its copies) / 星のコピーの動きを止める (every copy of it).
        if (n.op === 'PART') this.stopPartMotion(task.subject?.runtimeId, task);
        if (n.op === 'COPIES') {
          const base = this.runtime.actor(task.subject?.runtimeId)?.baseId;
          for (const copy of [...this.runtime.actors.values()].filter(a => a.isClone && a.baseId === base)) this.stopPartMotion(copy.runtimeId, task);
        }
      }
      // The part's own bodies and continuous rules stop. Where another flow moves the part (〜秒かけて動く, 〜まで動き続ける)
      // or the part carries out a procedure for it, that motion or procedure ends where the part is, and the flow goes on
      // with its next sentence. Speech and waits are not motions and go on.
      stopPartMotion(runtimeId, task, keep = null) {
        for (const [key, control] of this.continuous) {
          if (control.runtimeId !== runtimeId || (control.temporary && keep?.(control.task))) continue;
          if (control.temporary) this.continuous.delete(key);
          else if (control.state === 'ACTIVE') control.state = 'CANCELLED_UNTIL_FALSE';
        }
        for (const t of [...this.tasks.values()]) {
          if (t === task || keep?.(t)) continue;
          if (t.runtimeId === runtimeId) { this.cancelTask(t); continue; }
          const at = t.callFrames.findIndex(frame => frame.runtimeId === runtimeId), br = t.blockReason;
          if (at >= 0) {
            if (br?.speechToken && this.speechTokens.get(br.runtimeId) === br.speechToken) { this.ui.clearSpeech?.(br.runtimeId); this.speechTokens.delete(br.runtimeId); }
            const boundary = t.execStack.findIndex(entry => entry.type === 'callBoundary' && entry.frame === t.callFrames[at]);
            if (boundary >= 0) { t.execStack.length = boundary; t.callFrames.length = at; }
            if (this.blocked.has(t)) this.unblock(t);
          } else if (br?.runtimeId === runtimeId && ['glide', 'moveUntil'].includes(br.kind) && this.blocked.has(t)) this.unblock(t);
        }
      }

      execMotion(task, n, ctx) {
        const actor = this.runtime.requireActor(ctx),
          a = { ...actor },
          num = (i) => numberInUnit(evalExpression(n.args[i], ctx), ['SET_DIRECTION', 'TURN_RIGHT', 'TURN_LEFT'].includes(n.op) ? '度' : '歩');
        const before = { x: a.x, y: a.y };
        // 〇秒かけて (a move or a turn): read first, as it is written first. Where it goes and how far it turns are
        // fixed when it starts (LANGUAGE.md 動きの文); a time of 0 moves at once.
        const seconds = n.seconds ? numberInUnit(evalExpression(n.seconds, ctx), '秒') : null;
        if (seconds !== null && seconds < 0)
          throw valueError('R412', ['TURN_RIGHT', 'TURN_LEFT'].includes(n.op) ? '回る 時間（〜秒かけて）は 0より 小さく できません' : '動く 時間（〜秒かけて）は 0より 小さく できません', n.seconds);
        const timed = seconds !== null && seconds > 0;
        const leg = (key, dirKey, back) => n[key] ? numberInUnit(evalExpression(n[key], ctx), '歩') * (n[dirKey] === back ? -1 : 1) : 0;
        let target = null;
        switch (n.op) {
          // 決めたばしょへ行く / いまのばしょから動く: よこ first, then たて, whatever order they were written in.
          case 'GOTO':
          case 'MOVE_BY': {
            const dx = leg('x', 'xDir', 'left'), dy = leg('y', 'yDir', 'down');
            target = n.op === 'GOTO' ? { x: dx, y: dy } : { x: a.x + dx, y: a.y + dy };
            break;
          }
          // 〜のところへ行く: the centre comes to the other's centre, where it is when the sentence runs. A part with
          // copies is the part itself (its copies are not looked at); before the pointer enters, the mouse is at 0・0.
          case 'GOTO_PART': {
            const value = evalExpression(n.args[0], ctx), from = this.runtime.aabb(a);
            if (!isPart(value) && typeof value !== 'string') throw new AkariError('R411', `行き先の へんすうに 入って いるのは「${valueText(value)}」で、部品では ありません`);
            let to;
            if (isPart(value)) to = this.runtime.aabb(this.runtime.partActor(value));
            else if (value === 'マウス') to = { cx: this.runtime.mouseX, cy: this.runtime.mouseY };
            else {
              const base = this.project.components.find((c) => c.name === value), other = base && this.runtime.actor(base.id);
              if (!other) throw new AkariError('R405', `部品「${value}」が ありません`);
              to = this.runtime.aabb(other);
            }
            target = { x: a.x + to.cx - from.cx, y: a.y + to.cy - from.cy };
            break;
          }
          // 前へ10歩進む / 後ろへ10歩動く: along the direction the part faces.
          case 'MOVE': {
            const d = num(0) * (n.direction === 'backward' ? -1 : 1);
            target = { x: a.x + cosDegrees(a.direction) * d, y: a.y + sinDegrees(a.direction) * d };
            break;
          }
          case 'POINT_TO': {
            // 名人: いちばん近い… that is not one part turns no one.
            if (n.args[0]?.kind === 'PartNearest') {
              const nearest = this.runtime.nearestPart(partList(evalExpression(n.args[0].of, ctx)), ctx.runtimeId, true);
              if (!nearest) break;
              const p = this.runtime.nearestTarget(ctx.runtimeId, nearest), aa = this.runtime.aabb(a);
              if (p.x !== aa.cx || p.y !== aa.cy) a.direction = (Math.atan2(p.y - aa.cy, p.x - aa.cx) * 180) / Math.PI;
              break;
            }
            // A target whose centre is at the part's own centre keeps the direction.
            const target = targetValue(evalExpression(n.args[0], ctx), () => partNeeded(ctx)),
              p = this.runtime.nearestTarget(ctx.runtimeId, target),
              aa = this.runtime.aabb(a);
            if (p.x !== aa.cx || p.y !== aa.cy) a.direction = (Math.atan2(p.y - aa.cy, p.x - aa.cx) * 180) / Math.PI;
            break;
          }
          case 'SET_DIRECTION':
            a.direction = num(0);
            break;
          // 右に回る is clockwise (the direction gets smaller); with a time it turns a little each frame.
          case 'TURN_RIGHT':
          case 'TURN_LEFT': {
            const turn = num(0) * (n.op === 'TURN_RIGHT' ? -1 : 1);
            if (timed) {
              ensureFinite(turn);
              this.block(task, { kind: 'glide', startTime: this.runtime.now(), deadline: ensureFinite(this.runtime.now() + seconds * 1000),
                duration: ensureFinite(seconds * 1000), startDirection: a.direction, turn, lastDirection: a.direction });
              return { requeue: false };
            }
            a.direction += turn;
            break;
          }
          case 'BOUNCE':
            this.bounce(a);
            break;
        }
        if (target) {
          ensureFinite(target.x);
          ensureFinite(target.y);
          if (timed) {
            this.block(task, { kind: 'glide', startTime: this.runtime.now(), deadline: ensureFinite(this.runtime.now() + seconds * 1000),
              duration: ensureFinite(seconds * 1000), startX: a.x, startY: a.y, targetX: target.x, targetY: target.y, lastX: a.x, lastY: a.y });
            return { requeue: false };
          }
          a.x = target.x;
          a.y = target.y;
        }
        ensureFinite(a.x);
        ensureFinite(a.y);
        ensureFinite(a.direction);
        a.x = snapStep(a.x);
        a.y = snapStep(a.y);
        a.direction = normalizeDirection(snapStep(normalizeDirection(a.direction)));
        Object.assign(actor, { x: a.x, y: a.y, direction: a.direction });
        if (a.penDown && (before.x !== a.x || before.y !== a.y))
          this.ui.penLine?.(before.x, before.y, a.x, a.y, a.penColor, a.penSize);
        this.ui.render?.();
      }
      // A picture part bounces with what is seen of it (final call 17); a picture of which nothing is seen does not.
      // A touched side turns only the part of the direction that goes into it, as Scratch does: the right side a
      // direction below 90 or above 270 (to 180 − direction), the left side one between 90 and 270, the top one between
      // 0 and 180 (to − direction), the bottom one above 180. Going away from a side or along it, or touching both
      // sides of one axis, keeps that part, so two bounces in one こま do not send the part back into the side.
      bounce(a) {
        const box = this.runtime.visibleBox(a),
          w = this.project.stage.width,
          h = this.project.stage.height;
        if (!box) return;
        const hitX = box.left <= 0 || box.right >= w,
          hitY = box.bottom <= 0 || box.top >= h,
          d = normalizeDirection(a.direction),
          lr = (box.left <= 0) !== (box.right >= w),
          bt = (box.bottom <= 0) !== (box.top >= h);
        if (lr && (box.right >= w ? d < 90 || d > 270 : d > 90 && d < 270)) a.direction = 180 - a.direction;
        if (bt && (box.top >= h ? d > 0 && d < 180 : d > 180)) a.direction = -a.direction;
        if (hitX || hitY) {
          a.direction = normalizeDirection(a.direction);
          const b = this.runtime.visibleBox(a);
          if (b.right - b.left > w) a.x = w / 2;
          else {
            if (b.left < 0) a.x += -b.left;
            if (b.right > w) a.x -= b.right - w;
          }
          const c = this.runtime.visibleBox(a);
          if (c.top - c.bottom > h) a.y = h / 2;
          else {
            if (c.bottom < 0) a.y += -c.bottom;
            if (c.top > h) a.y -= c.top - h;
          }
        }
      }
      execLooks(task, n, ctx) {
        const arg = (i) => evalExpression(n.args[i], ctx),
          actorOps = new Set([
            'FRONT',
            'BACK',
            'HIDE',
            'SHOW',
            'NEXT_COSTUME',
            'PREV_COSTUME',
            'SET_SCALE',
            'FORWARD_LAYERS',
            'BACKWARD_LAYERS',
            'SET_COLOR',
            'SET_COSTUME',
          ]);
        if (actorOps.has(n.op)) {
          const a = this.runtime.requireActor(ctx),
            c = this.runtime.component(ctx.runtimeId);
          if (n.op === 'FRONT' || n.op === 'BACK') this.runtime.reorderActor(ctx.runtimeId, n.op);
          else if (n.op === 'FORWARD_LAYERS' || n.op === 'BACKWARD_LAYERS') {
            const v = numeric(arg(0));
            if (!Number.isInteger(v) || v < 0)
              throw new AkariError('R412', '重なりを 動かす 数は 0、1、2 のような 数に します');
            this.runtime.reorderActor(ctx.runtimeId, n.op, v);
          } else if (n.op === 'HIDE') a.visible = false;
          else if (n.op === 'SHOW') a.visible = true;
          else if (n.op === 'SET_SCALE') {
            const v = numberInUnit(arg(0), '％');
            if (v < 1 || v > 1000) throw new AkariError('R412', '大きさは 1〜1000％に します。見えなく する ときは「すがたをかくす」を 使います');
            a.scalePercent = v;
          } else if (n.op === 'SET_COLOR')
            a.color = resolveColor(stringv(arg(0)), { allowTransparent: false });
          else if (['SET_COSTUME', 'NEXT_COSTUME', 'PREV_COSTUME'].includes(n.op)) {
            if (c?.type !== 'sprite') throw new AkariError('R406', 'すがたを えらべるのは キャラクターだけです');
            const arr = c.costumes;
            if (n.op === 'SET_COSTUME') {
              // A value that is not a name is answered with this character's own costume names (F-03).
              const name = stringv(arg(0), 'すがたの 名前を 入れます。れい：' + arr.slice(0, 3).map(x => '「' + x.name + '」').join('、')),
                co = arr.find((x) => x.name === name);
              if (!co) throw new AkariError('R405', `すがた「${name}」が ありません。この キャラクターの すがたの 名前を 書きます。れい：${arr.slice(0, 3).map(x => '「' + x.name + '」').join('、')}`);
              a.costumeId = co.id;
            } else {
              let i = arr.findIndex((x) => x.id === a.costumeId);
              i = (i + (n.op === 'NEXT_COSTUME' ? 1 : -1) + arr.length) % arr.length;
              a.costumeId = arr[i].id;
            }
          }
          this.ui.render?.();
          return;
        }
        if (n.op === 'SET_BACKDROP' || n.op === 'NEXT_BACKDROP' || n.op === 'PREV_BACKDROP') {
          const ch =
            n.op === 'SET_BACKDROP'
              ? this.runtime.setBackdropByName(stringv(arg(0), 'はいけいの 名前を 入れます。れい：' + this.runtime.project.stage.backdrops.slice(0, 3).map(x => '「' + x.name + '」').join('、')))
              : this.runtime.stepBackdrop(n.op === 'NEXT_BACKDROP' ? 1 : -1);
          if (ch) this.spawnDistributed('backdropChanged', ch);
          return;
        }
        if (n.op === 'SET_SELF_TEXT') {
          const a = this.runtime.requireActor(ctx),
            c = this.runtime.component(ctx.runtimeId);
          if (!['label', 'button', 'box'].includes(c?.type))
            throw new AkariError('R406', '「文字を〜にする」は 文字・ボタン・四角で 使います');
          a.text = valueText(arg(0), true);
          this.ui.render?.();
          return;
        }
        if (n.op === 'SET_TARGET_TEXT') {
          const name = targetName(arg(0), () => partNeeded(ctx, 'text')),
            v = valueText(arg(1), true),
            c = this.project.components.find((x) => x.name === name);
          if (!c) throw new AkariError('R405', `部品「${name}」が ありません`);
          if (!['label', 'button', 'box'].includes(c.type))
            throw new AkariError('R406', `「${name}」は 文字を かえられる 部品では ありません`);
          this.runtime.actor(c.id).text = v;
          this.ui.render?.();
          return;
        }
        if (n.op === 'SET_INPUT') {
          const name = targetName(arg(0), () => partNeeded(ctx, 'input')),
            v = assertRuntimeValueLimit(stringv(arg(1))),
            c = this.project.components.find((x) => x.name === name);
          if (!c) throw new AkariError('R405', `部品「${name}」が ありません`);
          if (c.type !== 'input') throw new AkariError('R406', `「${name}」は 入力らんでは ありません`);
          const a = this.runtime.actor(c.id),
            old = a.inputValue;
          if (old !== v) {
            a.inputValue = v;
            this.spawnForRuntime(c.id, 'valueChanged', { oldValue: old, newValue: v });
          }
          this.ui.render?.();
        }
      }
      execPen(task, n, ctx) {
        if (n.op === 'CLEAR') { this.ui.penClear?.(); return; }
        const a = this.runtime.requireActor(ctx);
        if (n.op === 'DOWN') a.penDown = true;
        else if (n.op === 'UP') a.penDown = false;
        else if (n.op === 'CLEAR') this.ui.penClear?.();
        else if (n.op === 'SET_COLOR')
          a.penColor = resolveColor(stringv(evalExpression(n.args[0], ctx)), {
            allowTransparent: false,
          });
        else if (n.op === 'SET_SIZE') {
          const v = numeric(evalExpression(n.args[0], ctx));
          if (v <= 0 || v > 200)
            throw new AkariError('R412', 'ペンの 太さは 0より 大きく、200までに します');
          a.penSize = v;
        } else if (n.op === 'STAMP') this.ui.stamp?.(ctx.runtimeId);
      }
      execSound(task, n, ctx) {
        const state =
            ctx.runtimeId === 'stage' ? this.runtime.stage : this.runtime.requireActor(ctx),
          num = (i) => numberInUnit(evalExpression(n.args[i], ctx),
            n.op === 'SET_VOLUME' ? '％' : ['PITCH_UP', 'PITCH_DOWN'].includes(n.op) ? null : i === 0 ? 'Hz' : '秒'),
          ended = (id) => this.queueExternalUnblock(id);
        if (n.op === 'STOP_ALL') {
          this.runtime.stopAllAudio(true);
          return;
        }
        // 名人: ねこの音を止める — only the sounds that part plays.
        if (n.op === 'STOP_PART') {
          this.runtime.stopPartSounds(ctx.runtimeId);
          return;
        }
        if (n.op === 'SET_VOLUME') {
          const v = num(0);
          if (v < 0 || v > 100) throw new AkariError('R412', '音の 大きさは 0〜100％に します');
          state.volume = v;
          return;
        }
        if (n.op === 'PITCH_UP' || n.op === 'PITCH_DOWN') {
          const v = num(0);
          state.pitch = ensureFinite(state.pitch + (n.op === 'PITCH_UP' ? v : -v));
          return;
        }
        // A sound's name is text (a へんすう whose value is a number stops here); the example is a sound of the work.
        if (n.op === 'SAMPLE' || n.op === 'SAMPLE_WAIT') {
          const value = evalExpression(n.args[0], ctx),
            name = typeof value === 'string' ? value : stringv(value, (this.project.sounds?.length?`鳴らす 音の 名前は 文字です。れい：「${this.project.sounds[0].name}」を鳴らす`:'鳴らす 音の 名前は 文字です。作品に 音を 入れてから、その 名前を「 」で 書きます')),
            hid = this.runtime.startSample(name, ctx, n.op === 'SAMPLE_WAIT' ? ended : null);
          if (n.op === 'SAMPLE_WAIT') {
            this.block(task, { kind: 'audio', handleId: hid });
            return { requeue: false };
          }
          return;
        }
        const freq = num(0),
          sec = num(1);
        if (freq < 30 || freq > 5000 || sec < 0.01 || sec > 60)
          throw freq < 30 || freq > 5000 ? valueError('R412', '音の 高さは 30Hzから 5000Hzまでの 数に します', n.args[0])
            : valueError('R412', '鳴らす 時間は 0.01秒から 60秒までの 数に します', n.args[1]);
        const hid = this.runtime.startTone(freq, sec, ctx, n.op === 'TONE_WAIT' ? ended : null);
        if (n.op === 'TONE_WAIT') {
          this.block(task, { kind: 'audio', handleId: hid });
          return { requeue: false };
        }
      }
      execClone(task, n, ctx) {
        let src;
        if (n.op === 'CREATE_SELF') src = ctx.runtimeId;
        else if (n.op === 'CREATE_TARGET') {
          // 名人: the part may be a value (主役のコピーを作る copies the part held there).
          const target = targetValue(evalExpression(n.args[0], ctx), () => partNeeded(ctx, 'copy')), name = isPart(target) ? target.name : target,
            c = this.project.components.find((x) => x.name === name);
          if (!c) throw new AkariError('R405', `部品「${name}」が ありません`);
          if (c.type !== 'sprite')
            throw new AkariError('R406', 'コピーを 作れるのは キャラクターだけです');
          const candidates = this.runtime.instancesByName(name);
          src = isPart(target) ? this.runtime.partActor(target).runtimeId : candidates[0]?.runtimeId || c.id;
        } else if (n.op === 'DELETE_ALL') {
          // 名人: 星のコピーを全部消す — every copy of that part; the part itself stays.
          const base = this.runtime.actor(ctx.runtimeId)?.baseId;
          for (const copy of [...this.runtime.actors.values()].filter(a => a.isClone && a.baseId === base)) {
            this.runtime.deleteClone(copy.runtimeId);
            this.cancelRuntimeTasks(copy.runtimeId, task);
          }
          return;
        } else {
          const own = ctx.runtimeId === task.runtimeId;
          this.runtime.deleteClone(ctx.runtimeId);
          this.cancelRuntimeTasks(ctx.runtimeId, task);
          // 名人: a copy named as the subject (できたコピーは…消える) goes; the flow that said so goes on.
          if (!own) return;
          this.finishTask(task, 'DONE');
          return { requeue: false };
        }
        const count=n.count===undefined?1:numberValue(evalExpression(n.count,ctx));
        if(!Number.isSafeInteger(count)||count<0)throw new AkariError('R410','コピーの 数は 0、1、2 のような 数に して ください');
        if([...this.runtime.actors.values()].filter(actor=>actor.isClone).length+count>LIMITS.clones)
          throw new AkariError('R410','コピーは もう 作れません。いらない コピーを けして ください');
        this.runtime.requireActor({runtimeId:src});
        const component=this.runtime.component(src);
        if(component?.type!=='sprite')throw new AkariError('R406','コピーを 作れるのは キャラクターだけです');
        const receivers=this.matchingScripts(component.id,'cloneStart',{sourceRuntimeId:src}).filter(script=>this.hasExecutable(this.scriptAst(component.id,'cloneStart',script.id))).length;
        if(this.tasks.size+count*receivers>LIMITS.activeTasks)throw new AkariError('R413','同時に 動いて いる 動きが 多すぎます。コピーや 合図を へらして ください');
        // 名人: できたコピー are the copies this statement made.
        const made = [];
        for(let i=0;i<count;i++){
          const rid = this.runtime.createClone(src);
          made.push(partValue(rid, component.name));
          this.spawnForRuntime(rid, 'cloneStart', { sourceRuntimeId: src });
        }
        task.createdCopies = made;
      }
      cancelRuntimeTasks(runtimeId, except = null) {
        for (const t of this.tasks.values())
          if ((t.runtimeId === runtimeId || t.blockReason?.runtimeId === runtimeId ||
            t.callFrames.some((f) => f.runtimeId === runtimeId)) && t !== except) this.cancelTask(t);
      }
    }
