  // ────────────────────────────────────────────────────────────────────────
  // 01 — createAkariRuntime, continued: the runtime model and expression evaluation.
  // ────────────────────────────────────────────────────────────────────────
    class RuntimeModel {
      constructor(project, ui = {}, assetCache = null) {
        this.project = project;
        this.ui = ui;
        this.assetCache = assetCache;
        this.creationSequence = 0;
        this.reset(1);
      }
      validate() {
        return validateRuntimeData(this.project);
      }
      reset(seed) {
        this.validate();
        this.stopAllAudio();
        this.projectVars = new Map(
          this.project.projectData.variables.map((d) => [d.name, deepCopy(d.initialValue)]),
        );
        this.projectLists = new Map(
          this.project.projectData.lists.map((d) => [d.name, deepCopy(d.initialValue)]),
        );
        this.actors = new Map();
        this.touchCache = new Map();
        this.creationSequence = 0;
        for (let i = 0; i < this.project.components.length; i++) {
          const c = this.project.components[i];
          this.actors.set(c.id, this.makeActor(c, c.id, false, i));
        }
        this.stage = { backdropId: this.project.stage.backdropId, volume: 100, pitch: 0 };
        this.clockOffset = 0;
        this.pausedAt = null;
        this.startTime = this.now();
        // タイマーを0にする restarts the timer as an offset from the run's start, which is kept.
        this.timerOffset = 0;
        // How many times each part finished a procedure or was clicked (〜が10回【ジャンプ】するまで).
        this.eventCounts = new Map();
        // Until the pointer enters the screen it reads よこ0・たて0 and touches no part.
        this.mouseAt = { x: 0, y: 0, entered: false };
        this.mouseDown = false;
        this.pressedKeys = new Set();
        this.prng = new PRNG(seed >>> 0);
        this.runSeed = seed >>> 0;
        this.ui.render?.();
      }
      // The pointer's place in the child frame; setting it means the pointer has entered the screen.
      get mouseX() {
        return this.mouseAt.x;
      }
      set mouseX(x) {
        this.mouseAt.x = x;
        this.mouseAt.entered = true;
      }
      get mouseY() {
        return this.mouseAt.y;
      }
      set mouseY(y) {
        this.mouseAt.y = y;
        this.mouseAt.entered = true;
      }
      now() {
        return (this.pausedAt === null ? nowMs() : this.pausedAt) - this.clockOffset;
      }
      pauseClock() {
        if (this.pausedAt === null) {
          this.pausedAt = nowMs();
          this.assetCache?.setPaused(true);
        }
      }
      resumeClock() {
        if (this.pausedAt !== null) {
          this.clockOffset += nowMs() - this.pausedAt;
          this.pausedAt = null;
          this.assetCache?.setPaused(false);
        }
      }
      makeActor(c, runtimeId, isClone, z) {
        return {
          runtimeId,
          baseId: c.id,
          isClone,
          creationSequence: ++this.creationSequence,
          x: c.x,
          y: c.y,
          w: c.w,
          h: c.h,
          direction: normalizeDirection(c.direction),
          scalePercent: c.scalePercent,
          visible: c.visible,
          color: null,
          costumeId: c.type === 'sprite' ? c.costumeId : null,
          z,
          text: c.text,
          inputValue: c.type === 'input' ? c.text : '',
          volume: 100,
          pitch: 0,
          penDown: false,
          penColor: c.fg,
          penSize: 2,
          vars: new Map(c.localData.variables.map((d) => [d.name, deepCopy(d.initialValue)])),
          lists: new Map(c.localData.lists.map((d) => [d.name, deepCopy(d.initialValue)])),
        };
      }
      component(runtimeId) {
        const a = this.actors.get(runtimeId);
        return a ? this.project.components.find((c) => c.id === a.baseId) : null;
      }
      actor(runtimeId) {
        return this.actors.get(runtimeId) || null;
      }
      resolveActorRef(ref, relativeRuntimeId) {
        let id = relativeRuntimeId;
        // みんな ({kind:'all'}, a wait of the whole flow) reads its time or condition as 自分.
        if (ref && ref.kind === 'named') {
          id = ref.targetId || (namesStage(this.project, ref.name) ? 'stage' :
            this.project.components.find((c) => c.name === ref.name)?.id);
        }
        if (id !== 'stage' && !this.actor(id))
          throw new AkariError('R405', '動かす キャラクターや 部品が 見つかりません');
        return id;
      }
      countEvent(key) {
        this.eventCounts.set(key, (this.eventCounts.get(key) || 0) + 1);
      }
      // A まで on counts compares with the counts when the wait or the repeat began.
      bindEventCounts(condition, ctx) {
        if (!condition || typeof condition !== 'object') return condition;
        if (Array.isArray(condition)) return condition.map(x => this.bindEventCounts(x, ctx));
        if (condition.kind === 'EventCount') {
          const runtimeId = this.resolveActorRef(condition.actorRef, ctx.runtimeId);
          const key = runtimeId + (condition.event === 'action' ? '|action|' + condition.name : '|click');
          const target = numberInUnit(evalExpression(condition.count, ctx), '回');
          if (!Number.isSafeInteger(target) || target < 0)
            throw new AkariError('R413', '回数は 0、1、2 のような 数に します。マイナスや 小数は 使えません');
          return { kind: 'EventCountBound', key, baseline: this.eventCounts.get(key) || 0, target };
        }
        const out = {};
        for (const [k, v] of Object.entries(condition)) out[k] = v && typeof v === 'object' ? this.bindEventCounts(v, ctx) : v;
        return out;
      }
      // A part value used as a subject must still exist (a deleted copy does not).
      partRuntimeId(v) {
        if (!isPart(v)) throw new AkariError('R411', `主語の へんすうに 入って いるのは「${valueText(v)}」で、部品では ありません。先に「主役をねこにする」のように 部品を 入れます`);
        // A copy that is gone (このコピーだけを消す, 全部消す) is not there any more; a part is always there.
        if (v.part !== 'stage' && !this.actor(v.part))
          throw new AkariError('R405', `主語の へんすうに 入って いる「${v.name}」の コピーは、もう 消えて います`);
        return v.part;
      }
      requireActor(ctx) {
        const a = this.actor(ctx.runtimeId);
        if (!a)
          throw new AkariError('R407', 'この ブロックは、キャラクターや 部品の 動きの 中で 使います');
        return a;
      }
      currentCallFrame(ctx) {
        if (ctx.functionFrame) return ctx.functionFrame;
        if (ctx.task?.callFrames?.length)
          return ctx.task.callFrames[ctx.task.callFrames.length - 1];
        return null;
      }
      binderValue(ctx, name) {
        if (ctx.functionFrame || !ctx.task?.execStack) return null;
        for (let i = ctx.task.execStack.length - 1; i >= 0; i--) {
          if (ctx.task.execStack[i].type === 'callBoundary') break;
          const b = ctx.task.execStack[i].binder;
          if (b && b.name === name) return { found: true, value: b.value };
        }
        if (!ctx.task.execStack.some(f => f.type === 'callBoundary'))
          for (const b of ctx.task.inheritedBinders || []) if (b.name === name) return { found: true, value: b.value };
        return { found: false };
      }
      resolveBinding(name, qualifier, ctx) {
        if (qualifier === 'exact') qualifier = null;
        const frame = this.currentCallFrame(ctx);
        if (!qualifier) {
          const b = this.binderValue(ctx, name);
          if (b?.found) return { scope: 'binder', kind: 'scalar', get: () => b.value, set: null };
          if (frame) {
            if (frame.locals?.has(name))
              return {
                scope: 'local',
                kind: 'scalar',
                get: () => frame.locals.get(name),
                set: (v) => frame.locals.set(name, v),
              };
            if (frame.localLists?.has(name))
              return {
                scope: 'local',
                kind: 'list',
                get: () => frame.localLists.get(name),
                set: (v) => frame.localLists.set(name, v),
              };
            if (frame.args?.has(name))
              return {
                scope: 'arg',
                kind: Array.isArray(frame.args.get(name)) ? 'list' : 'scalar',
                get: () => frame.args.get(name),
                set: (v) => frame.args.set(name, v),
              };
          }
        }
        if (qualifier !== 'project' && ctx.runtimeId && ctx.runtimeId !== 'stage') {
          const a = this.actor(ctx.runtimeId);
          if (a) {
            if (a.vars.has(name))
              return {
                scope: 'self',
                kind: 'scalar',
                expectedUnit: this.component(ctx.runtimeId)?.localData.variables.find(d => d.name === name)?.expectedUnit,
                get: () => a.vars.get(name),
                set: ctx.functionFrame ? null : (v) => a.vars.set(name, v),
              };
            if (a.lists.has(name))
              return {
                scope: 'self',
                kind: 'list',
                get: () => a.lists.get(name),
                set: ctx.functionFrame ? null : (v) => a.lists.set(name, v),
              };
          }
        }
        if (qualifier !== 'self') {
          if (this.projectVars.has(name))
            return {
              scope: 'project',
              kind: 'scalar',
              expectedUnit: this.project.projectData.variables.find(d => d.name === name)?.expectedUnit,
              get: () => this.projectVars.get(name),
              set: ctx.functionFrame ? null : (v) => this.projectVars.set(name, v),
            };
          if (this.projectLists.has(name))
            return {
              scope: 'project',
              kind: 'list',
              get: () => this.projectLists.get(name),
              set: ctx.functionFrame ? null : (v) => this.projectLists.set(name, v),
            };
        }
        return null;
      }
      readName(n, ctx) {
        const b = this.resolveBinding(n.name, n.qualifier === 'exact' ? null : n.qualifier, ctx);
        if (!b) throw new AkariError('S301', `まだ 作って いない 名前「${n.name}」です`);
        return deepCopy(b.get());
      }
      writeTarget(t, value, ctx, { resolvedBinding = null } = {}) {
        assertRuntimeValueLimit(value);
        const b = resolvedBinding || this.resolveBinding(t.name, t.qualifier === 'exact' ? null : t.qualifier, ctx);
        if (!b) throw new AkariError('S301', `入れる先「${t.name}」が ありません`);
        if (!b.set) throw new AkariError('S312', `「${t.name}」は 見るだけで、かえられません`);
        if (b.kind === 'list' && !Array.isArray(value))
          throw new AkariError('R411', 'リストには リストだけを 入れられます');
        if (b.kind === 'scalar' && !scalar(value))
          throw new AkariError('R411', 'へんすうには 数・文字・あてはまる／あてはまらない だけを 入れられます');
        if (Array.isArray(value) && value.length > LIMITS.listItems)
          throw new AkariError('R413', 'リストが 長すぎます');
        validateExpectedUnit(value, b.expectedUnit);
        b.set(deepCopy(value));
        this.ui.renderMonitor?.();
        return b;
      }
      instancesByName(name) {
        const base = this.project.components.find((c) => c.name === name);
        if (!base) return [];
        return [...this.actors.values()]
          .filter((a) => a.baseId === base.id)
          .sort((a, b) => a.creationSequence - b.creationSequence);
      }
      targetsOf(target) {
        if (!isPart(target)) return this.instancesByName(target);
        const a = this.actor(target.part);
        if (!a) throw new AkariError('R405', '動かす キャラクターや 部品が 見つかりません');
        return [a];
      }
      partActor(part) {
        const a = this.actor(part.part);
        if (!a) throw new AkariError('R405', '動かす キャラクターや 部品が 見つかりません');
        return a;
      }
      // 〜のうち、右にいるほう / 体力が大きいほう: one part only when the comparison decides it.
      // ねこにいちばん近いもの is one of the others: ねこ itself is not among them.
      pickPart(parts, by, ctx) {
        const base = by.kind === 'near' ? this.actor(this.resolveActorRef({ kind: 'named', name: by.to }, ctx.runtimeId)) : null;
        if (base) parts = parts.filter(part => this.actor(part.part) !== base);
        const score = part => {
          const a = this.partActor(part), box = this.aabb(a);
          if (by.kind === 'position') return { 右: box.cx, 左: -box.cx, 上: box.cy, 下: -box.cy }[by.side];
          if (by.kind === 'near') { const to = this.aabb(base); return -Math.hypot(box.cx - to.cx, box.cy - to.cy); }
          const value = numberValue(this.readName({ name: by.name, qualifier: 'self' }, { ...ctx, runtimeId: part.part }), `「${by.name}」には 数が いります`);
          return by.order === 'max' ? value : -value;
        };
        const scored = parts.map(part => ({ part, score: score(part) })), best = Math.max(...scored.map(x => x.score));
        const top = scored.filter(x => x.score === best);
        return top.length === 1 ? [top[0].part] : [];
      }
      // いちばん近い星: of the parts other than the one who acts. Undecided (a tie, or none) gives null when strict:
      // the one who acts toward it then does nothing (名人 M-06). Otherwise the earlier made wins a tie.
      nearestPart(parts, runtimeId, strict = false) {
        const from = this.aabb(this.requireActor({ runtimeId }));
        let best = null, distance = Infinity, tie = false;
        for (const part of parts) {
          if (part.part === runtimeId) continue;
          const a = this.partActor(part), box = this.aabb(a), d = Math.hypot(box.cx - from.cx, box.cy - from.cy);
          if (d < distance - 1e-12) { best = { part, actor: a }; distance = d; tie = false; }
          else if (Math.abs(d - distance) < 1e-12) { tie = true; if (a.creationSequence < best.actor.creationSequence) best = { part, actor: a }; }
        }
        if (strict && (!best || tie)) return null;
        if (!best) throw new AkariError('R405', 'いちばん 近い 部品が いません（自分の ほかに 一つも ありません）。いるかを「もし〜なら、」で しらべてから 使います');
        return best.part;
      }
      // ねこにふれているもの / ゴールにふれている星: every visible part touching it now (of that part only, with of).
      partsTouching(target, ofName) {
        if (!isPart(target)) throw new AkariError('R411', 'ふれる 相手には 部品を 書きます');
        const a = this.partActor(target), base = ofName ? this.project.components.find(c => c.name === ofName)?.id : null;
        const out = [];
        for (const b of [...this.actors.values()].sort((x, y) => x.creationSequence - y.creationSequence)) {
          if (b.runtimeId === a.runtimeId || !b.visible || !a.visible || (base && b.baseId !== base)) continue;
          if (this.partsTouch(a, b)) out.push(partValue(b.runtimeId, this.component(b.runtimeId)?.name ?? ''));
        }
        return out;
      }
      // The parts whose sounds are playing now.
      soundingParts() {
        const playing = this.assetCache?.activeAudioHandles, out = new Set();
        for (const [id, runtimeId] of this.audioOwners || []) {
          if (playing?.has(id)) out.add(runtimeId); else this.audioOwners.delete(id);
        }
        return out;
      }
      stopPartSounds(runtimeId) {
        for (const [id, owner] of [...(this.audioOwners || [])]) if (owner === runtimeId) this.assetCache?.stopHandle(id, { notify: true });
      }
      // The box around the turned and scaled part, in the child frame: bottom is the smaller たてのばしょ.
      aabb(a) {
        const sc = a.scalePercent / 100,
          hw = (a.w * sc) / 2,
          hh = (a.h * sc) / 2,
          cs = cosDegrees(a.direction),
          sn = sinDegrees(a.direction);
        const ex = Math.abs(hw * cs) + Math.abs(hh * sn),
          ey = Math.abs(hw * sn) + Math.abs(hh * cs),
          cx = a.x,
          cy = a.y;
        return { left: cx - ex, right: cx + ex, bottom: cy - ey, top: cy + ey, cx, cy };
      }
      touching(runtimeId, target) {
        const a = this.requireActor({ runtimeId });
        if (!a.visible) return false;
        // One side of the screen (画面の下のはし: たて0 and below); 画面のはし is any of the four. A part outside the screen
        // touches the side it went out of. A picture part touches it with what is seen of it (visibleBox).
        const W = this.project.stage.width, H = this.project.stage.height;
        if (isEdgeTarget(target)) {
          const vb = this.visibleBox(a);
          if (!vb) return false;
          if (target === '端:下') return vb.bottom <= 0;
          if (target === '端:上') return vb.top >= H;
          if (target === '端:左') return vb.left <= 0;
          if (target === '端:右') return vb.right >= W;
          return vb.left <= 0 || vb.bottom <= 0 || vb.right >= W || vb.top >= H;
        }
        const aa = this.aabb(a);
        // The mouse touches a picture part only where the picture is seen.
        if (target === 'マウス') {
          const mask = this.pictureMask(a);
          return (
            this.mouseAt.entered &&
            this.mouseX >= aa.left &&
            this.mouseX <= aa.right &&
            this.mouseY >= aa.bottom &&
            this.mouseY <= aa.top &&
            (!mask || this.pictureSeenAt(a, mask, this.mouseX, this.mouseY))
          );
        }
        const targets = this.targetsOf(target).filter(
          (x) => x.runtimeId !== runtimeId && x.visible,
        );
        if (!targets.length) {
          if (!isPart(target) && !this.project.components.some((c) => c.name === target)) {
            const other = this.project.components.find(c => c.id !== a.baseId);
            throw new AkariError('R405', `部品「${target}」が ありません。ふれる 相手には、作品に ある キャラクターや 部品の 名前を 書きます。れい：「${other?.name ?? 'マウス'}」`);
          }
          return false;
        }
        return targets.some((b) => this.partsTouch(a, b));
      }
      // The cells of a part whose look is a picture (an imported picture or お絵かき); null for a look of text and for
      // every other kind of part (label, button, box, input), which touch with their box (final call 17).
      pictureMask(a) {
        if (!a.costumeId || !this.assetCache?.getMask) return null;
        const c = this.component(a.runtimeId);
        if (c?.type !== 'sprite') return null;
        const co = c.costumes?.find((x) => x.id === a.costumeId);
        return co?.kind === 'image' ? this.assetCache.getMask(co.assetId) : null;
      }
      // Whether a picture is seen at (x, y) on the screen: the point is turned back by the part's direction and scaled
      // into the picture, which fills the part's box (as it is drawn).
      pictureSeenAt(a, mask, x, y) {
        return this.pictureSampler(a, mask).seen(x, y);
      }
      // Where a point of the screen falls in a part's picture, as (column, row) of its cells, and whether that cell is seen.
      pictureSampler(a, mask) {
        const sc = a.scalePercent / 100, cs = cosDegrees(a.direction), sn = sinDegrees(a.direction), W = a.w * sc, H = a.h * sc,
          ax = a.x, ay = a.y, mw = mask.w, mh = mask.h, cells = mask.cells;
        const cell = (x, y) => {
          const dx = x - ax, dy = y - ay;
          return [((dx * cs + dy * sn) / W + 0.5) * mw, (0.5 - (dy * cs - dx * sn) / H) * mh];
        };
        return {
          cell,
          seen(x, y) {
            const dx = x - ax, dy = y - ay, u = (dx * cs + dy * sn) / W + 0.5, v = 0.5 - (dy * cs - dx * sn) / H;
            if (!(u >= -1e-9 && u <= 1 + 1e-9 && v >= -1e-9 && v <= 1 + 1e-9)) return false;
            const col = Math.min(mw - 1, Math.max(0, Math.floor(u * mw))), row = Math.min(mh - 1, Math.max(0, Math.floor(v * mh)));
            return cells[row * mw + col] === 1;
          },
          // Whether a cell is seen in the part of the picture that a rectangle of the screen covers (turned, the cells
          // around it).
          anySeenIn(left, right, bottom, top) {
            // The rectangle's corners in cells, as cell() gives them: each is a sum of one term of a side and one of the
            // bottom or top, so the smallest and largest are sums of the terms' (the same numbers, with no list made).
            const l = left - ax, rr = right - ax, b = bottom - ay, t = top - ay,
              c0 = ((Math.min(l * cs, rr * cs) + Math.min(b * sn, t * sn)) / W + 0.5) * mw,
              c1 = ((Math.max(l * cs, rr * cs) + Math.max(b * sn, t * sn)) / W + 0.5) * mw,
              r0 = (0.5 - (Math.max(b * cs, t * cs) - Math.min(l * sn, rr * sn)) / H) * mh,
              r1 = (0.5 - (Math.min(b * cs, t * cs) - Math.max(l * sn, rr * sn)) / H) * mh;
            const cl = Math.max(0, Math.floor(c0 - 1e-9)), cr = Math.min(mw - 1, Math.ceil(c1 + 1e-9) - 1),
              rt = Math.max(0, Math.floor(r0 - 1e-9)), rb = Math.min(mh - 1, Math.ceil(r1 + 1e-9) - 1);
            if (cl > cr || rt > rb) return false;
            const n = mask.counts, w1 = mw + 1;
            return n[(rb + 1) * w1 + cr + 1] - n[rt * w1 + cr + 1] - n[(rb + 1) * w1 + cl] + n[rt * w1 + cl] > 0;
          },
        };
      }
      // The box around what is seen of a part: for a picture, around its seen cells (turned and scaled); for any other
      // part, its box. A picture of which nothing is seen has none.
      visibleBox(a) {
        const mask = this.pictureMask(a);
        if (!mask) return this.aabb(a);
        if (!mask.seen) return null;
        const sc = a.scalePercent / 100, cs = cosDegrees(a.direction), sn = sinDegrees(a.direction), W = a.w * sc, H = a.h * sc,
          xs = [(mask.seen.left / mask.w - 0.5) * W, (mask.seen.right / mask.w - 0.5) * W],
          ys = [(0.5 - mask.seen.bottom / mask.h) * H, (0.5 - mask.seen.top / mask.h) * H];
        let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
        for (const lx of xs)
          for (const ly of ys) {
            const px = a.x + lx * cs - ly * sn, py = a.y + lx * sn + ly * cs;
            left = Math.min(left, px); right = Math.max(right, px); bottom = Math.min(bottom, py); top = Math.max(top, py);
          }
        return { left, right, bottom, top, cx: a.x, cy: a.y };
      }
      // Whether two parts touch: their boxes overlap, as for every part, and where they overlap a point is seen of both
      // — of a picture where its cells are seen, of any other part anywhere in its box (final call 17). Opaque cells are
      // checked for overlap without sampling away small intersections. A pair's answer is kept until either part moves,
      // turns, or changes its size or look.
      partsTouch(a, b) {
        const aa = this.aabb(a), bb = this.aabb(b);
        if (!(aa.left <= bb.right && aa.right >= bb.left && aa.bottom <= bb.top && aa.top >= bb.bottom)) return false;
        const ma = this.pictureMask(a), mb = this.pictureMask(b);
        if (!ma && !mb) return true;
        if ((ma && !ma.seen) || (mb && !mb.seen)) return false;
        const [p, q] = a.runtimeId < b.runtimeId ? [a, b] : [b, a], key = p.runtimeId + '|' + q.runtimeId,
          kept = this.touchCache.get(key);
        if (kept && samePose(kept.p, p) && samePose(kept.q, q)) return kept.result;
        const keep = (result) => {
          if (this.touchCache.size >= 20000) this.touchCache.clear();
          this.touchCache.set(key, { p: pose(p), q: pose(q), result });
          return result;
        };
        // Only where both are seen can they touch: the boxes' overlap within the boxes of what is seen of each.
        const va = this.visibleBox(a), vb = this.visibleBox(b),
          left = Math.max(aa.left, bb.left, va.left, vb.left), right = Math.min(aa.right, bb.right, va.right, vb.right),
          bottom = Math.max(aa.bottom, bb.bottom, va.bottom, vb.bottom), top = Math.min(aa.top, bb.top, va.top, vb.top), rw = right - left, rh = top - bottom;
        if (rw < 0 || rh < 0) return keep(false);
        const sa = ma && this.pictureSampler(a, ma), sb = mb && this.pictureSampler(b, mb);
        if ((sa && !sa.anySeenIn(left, right, bottom, top)) || (sb && !sb.anySeenIn(left, right, bottom, top))) return keep(false);
        const cell = (x, m) => (m ? Math.min((x.w * x.scalePercent) / 100 / m.w, (x.h * x.scalePercent) / 100 / m.h) : Infinity);
        // Check opaque cells exactly at every overlap size; a finite point grid can miss a small turned corner.
        {
          const [x, m, sx, other, om] = !mb || (ma && cell(a, ma) <= cell(b, mb)) ? [a, ma, sa, sb, mb] : [b, mb, sb, sa, ma];
          const sc = x.scalePercent / 100, W = x.w * sc, H = x.h * sc, cs = cosDegrees(x.direction), sn = sinDegrees(x.direction);
          let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
          for (const px of [left, right])
            for (const py of [bottom, top]) { const [c, r] = sx.cell(px, py); c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r); }
          const cw = W / m.w, ch = H / m.h, mc = Math.ceil((cw + ch) / cw) + 1, mr = Math.ceil((cw + ch) / ch) + 1;
          const cFrom = Math.max(0, Math.floor(c0) - mc), cTo = Math.min(m.w - 1, Math.ceil(c1) + mc),
            rFrom = Math.max(0, Math.floor(r0) - mr), rTo = Math.min(m.h - 1, Math.ceil(r1) + mr);
          // Where the box on the screen of the cells in columns c..c2 and rows r..r2 lies: 0 outside the overlap, 2 all
          // inside it (then so is the box of each of these cells), 1 partly. Each coordinate of the box is a sum of one term
          // of a column and one of a row, so its smallest and largest values are those of the terms (the same numbers as
          // from the four corners). A block's box holds the boxes of its cells.
          const n = m.counts, w1 = m.w + 1;
          const inOverlap = (c, c2, r, r2) => {
            const lx0 = (c / m.w - 0.5) * W, lx1 = ((c2 + 1) / m.w - 0.5) * W, ly0 = (0.5 - r / m.h) * H, ly1 = (0.5 - (r2 + 1) / m.h) * H,
              l = x.x + Math.min(lx0 * cs, lx1 * cs) - Math.max(ly0 * sn, ly1 * sn), rr = x.x + Math.max(lx0 * cs, lx1 * cs) - Math.min(ly0 * sn, ly1 * sn),
              bo = x.y + Math.min(lx0 * sn, lx1 * sn) + Math.min(ly0 * cs, ly1 * cs), to = x.y + Math.max(lx0 * sn, lx1 * sn) + Math.max(ly0 * cs, ly1 * cs);
            if (!(Math.max(l, left) < Math.min(rr, right) && Math.max(bo, bottom) < Math.min(to, top))) return 0;
            return l >= left && rr <= right && bo >= bottom && to <= top ? 2 : 1;
          };
          // Where the other part has a picture: a corner (c, r) of this picture's cells falls in the other's cells at
          // (u00 + c·uc + r·ur, row00 + c·vc + r·vr), with the same turn and scale for every cell. So each cell there is the
          // parallelogram with the sides (uc, vc) (one cell across) and (ur, vr) (one cell down), in the other's cells,
          // which are squares of side 1; nothing is turned again for each cell.
          const on = om?.counts, ow1 = om ? om.w + 1 : 0;
          const at = (c, r) => {
            const lx = (c / m.w - 0.5) * W, ly = (0.5 - r / m.h) * H;
            return other.cell(x.x + lx * cs - ly * sn, x.y + lx * sn + ly * cs);
          };
          const [u00, row00] = other ? at(0, 0) : [0, 0], [u10, row10] = other ? at(1, 0) : [0, 0], [u01, row01] = other ? at(0, 1) : [0, 0],
            uc = u10 - u00, vc = row10 - row00, ur = u01 - u00, vr = row01 - row00,
            uLo = Math.min(0, uc) + Math.min(0, ur), uHi = Math.max(0, uc) + Math.max(0, ur), vLo = Math.min(0, vc) + Math.min(0, vr), vHi = Math.max(0, vc) + Math.max(0, vr);
          // Whether a seen cell of the other part lies where the cells in columns c..c2 and rows r..r2 fall in its cells
          // (their four corners, a little widened): when none does, none of these cells can touch it.
          const reaches = (c, c2, r, r2) => {
            const u = u00 + Math.min(c * uc, (c2 + 1) * uc) + Math.min(r * ur, (r2 + 1) * ur), u2 = u00 + Math.max(c * uc, (c2 + 1) * uc) + Math.max(r * ur, (r2 + 1) * ur),
              v = row00 + Math.min(c * vc, (c2 + 1) * vc) + Math.min(r * vr, (r2 + 1) * vr), rowEnd = row00 + Math.max(c * vc, (c2 + 1) * vc) + Math.max(r * vr, (r2 + 1) * vr);
            const c0 = Math.max(0, Math.floor(u - 1e-9)), c1 = Math.min(om.w - 1, Math.ceil(u2 + 1e-9) - 1),
              r0 = Math.max(0, Math.floor(v - 1e-9)), r1 = Math.min(om.h - 1, Math.ceil(rowEnd + 1e-9) - 1);
            return c0 <= c1 && r0 <= r1 && on[(r1 + 1) * ow1 + c1 + 1] - on[r0 * ow1 + c1 + 1] - on[(r1 + 1) * ow1 + c0] + on[r0 * ow1 + c0] > 0;
          };
          // The cell in column c and row r as it lies on the screen (a corner and its two sides), against what is seen of
          // the other part: each of the other's seen cells that the cell reaches in the other picture, or the overlap of the
          // boxes for a part with no picture. Two such shapes overlap when no line along a side of either separates them
          // (overlap).
          const ew = W / m.w, eh = H / m.h, e1x = ew * cs, e1y = ew * sn, e2x = eh * sn, e2y = -eh * cs;
          const cellTouches = (c, r) => {
            if (!other) {
              const lx = (c / m.w - 0.5) * W, ly = (0.5 - r / m.h) * H;
              return overlap(x.x + lx * cs - ly * sn, x.y + lx * sn + ly * cs, e1x, e1y, e2x, e2y, left, right, bottom, top, 0);
            }
            const u0 = u00 + c * uc + r * ur, rowStart = row00 + c * vc + r * vr;
            const c0 = Math.max(0, Math.floor(u0 + uLo)), c1 = Math.min(om.w - 1, Math.ceil(u0 + uHi) - 1),
              r0 = Math.max(0, Math.floor(rowStart + vLo)), r1 = Math.min(om.h - 1, Math.ceil(rowStart + vHi) - 1);
            if (c0 > c1 || r0 > r1 || on[(r1 + 1) * ow1 + c1 + 1] - on[r0 * ow1 + c1 + 1] - on[(r1 + 1) * ow1 + c0] + on[r0 * ow1 + c0] === 0) return false;
            for (let rr = r0; rr <= r1; rr++)
              for (let cc = c0; cc <= c1; cc++) if (om.cells[rr * om.w + cc] && overlap(u0, rowStart, uc, vc, ur, vr, cc, cc + 1, rr, rr + 1, 0)) return true;
            return false;
          };
          // Blocks of 4×4 cells first: a block with no seen cell, outside the overlap, or where no seen cell of the other
          // picture lies, holds no cell that touches it, so the answer is that of looking at every cell.
          for (let br = rFrom; br <= rTo; br += 4)
            for (let bc = cFrom; bc <= cTo; bc += 4) {
              const br2 = Math.min(rTo, br + 3), bc2 = Math.min(cTo, bc + 3);
              if (n[(br2 + 1) * w1 + bc2 + 1] - n[br * w1 + bc2 + 1] - n[(br2 + 1) * w1 + bc] + n[br * w1 + bc] === 0 ||
                (other && !reaches(bc, bc2, br, br2))) continue;
              const where = inOverlap(bc, bc2, br, br2);
              if (!where) continue;
              for (let r = br; r <= br2; r++)
                for (let c = bc; c <= bc2; c++) if (m.cells[r * m.w + c] && (where === 2 || inOverlap(c, c, r, r)) && cellTouches(c, r)) return keep(true);
            }
          return keep(false);
        }
      }
      distance(runtimeId, target) {
        const a = this.requireActor({ runtimeId }),
          aa = this.aabb(a);
        if (target === 'マウス')
          return ensureFinite(Math.hypot(this.mouseX - aa.cx, this.mouseY - aa.cy));
        const ts = this.targetsOf(target).filter((x) => x.runtimeId !== runtimeId);
        if (!ts.length) throw new AkariError('R405', `部品「${isPart(target) ? target.name : target}」が ありません`);
        let best = Infinity;
        for (const b of ts) {
          const bb = this.aabb(b);
          best = Math.min(best, ensureFinite(Math.hypot(bb.cx - aa.cx, bb.cy - aa.cy)));
        }
        return best;
      }
      nearestTarget(runtimeId, target) {
        const a = this.requireActor({ runtimeId }),
          aa = this.aabb(a);
        if (target === 'マウス') return { x: this.mouseX, y: this.mouseY };
        const ts = this.targetsOf(target).filter((x) => x.runtimeId !== runtimeId);
        if (!ts.length) throw new AkariError('R405', `部品「${isPart(target) ? target.name : target}」が ありません`);
        let best = null,
          bd = Infinity;
        for (const b of ts) {
          const bb = this.aabb(b),
            d = ensureFinite(Math.hypot(bb.cx - aa.cx, bb.cy - aa.cy));
          if (
            d < bd - 1e-12 ||
            (Math.abs(d - bd) < 1e-12 && b.creationSequence < (best?.creationSequence ?? Infinity))
          ) {
            best = b;
            bd = d;
          }
        }
        const bb = this.aabb(best);
        return { x: bb.cx, y: bb.cy, creationSequence: best.creationSequence };
      }
      touchingColor(runtimeId, color) {
        const a = this.requireActor({ runtimeId });
        if (!a.visible) return false;
        const css = resolveColor(color, { allowTransparent: false }),
          aa = this.aabb(a),
          back = this.project.stage.backdrops.find((b) => b.id === this.stage.backdropId);
        if (
          back?.kind === 'color' &&
          back.value.toLowerCase() === css.toLowerCase() &&
          aa.right >= 0 &&
          aa.top >= 0 &&
          aa.left <= this.project.stage.width &&
          aa.bottom <= this.project.stage.height
        )
          return true;
        for (const b of this.actors.values()) {
          if (b.runtimeId === runtimeId || !b.visible) continue;
          const bb = this.aabb(b);
          if (
            aa.left <= bb.right &&
            aa.right >= bb.left &&
            aa.bottom <= bb.top &&
            aa.top >= bb.bottom
          ) {
            const c = this.component(b.runtimeId);
            let vals = [];
            if (c?.type === 'sprite') {
              const co = c.costumes?.find((x) => x.id === b.costumeId);
              vals = co?.kind === 'image' ? [c.bg] : [b.color || c.fg, c.bg];
            } else vals = [b.color || c?.fg, c?.bg];
            vals = vals.filter(Boolean).map((x) => x.toLowerCase());
            if (vals.includes(css.toLowerCase())) return true;
          }
        }
        return false;
      }
      createClone(sourceRuntimeId) {
        if ([...this.actors.values()].filter((a) => a.isClone).length >= LIMITS.clones)
          throw new AkariError('R410', 'コピーは もう 作れません。いらない コピーを けして ください');
        const src = this.requireActor({ runtimeId: sourceRuntimeId }),
          c = this.component(sourceRuntimeId);
        if (c?.type !== 'sprite')
          throw new AkariError('R406', 'コピーを 作れるのは キャラクターだけです');
        let id;
        do {
          id = `${c.id}-clone-${++this.creationSequence}`;
        } while (this.actors.has(id));
        const a = {
          ...src,
          runtimeId: id,
          isClone: true,
          creationSequence: this.creationSequence,
          vars: new Map([...src.vars].map(([k, v]) => [k, deepCopy(v)])),
          lists: new Map([...src.lists].map(([k, v]) => [k, deepCopy(v)])),
          z: Math.max(0, ...[...this.actors.values()].map((x) => x.z)) + 1,
        };
        this.actors.set(id, a);
        this.ui.render?.();
        return id;
      }
      reorderActor(runtimeId, mode, amount = 0) {
        const actor = this.requireActor({ runtimeId });
        const ordered = [...this.actors.values()].sort(
            (a, b) => a.z - b.z || a.creationSequence - b.creationSequence,
          ),
          old = ordered.indexOf(actor);
        ordered.splice(old, 1);
        const dest =
          mode === 'FRONT'
            ? ordered.length
            : mode === 'BACK'
              ? 0
              : clamp(old + (mode === 'FORWARD_LAYERS' ? amount : -amount), 0, ordered.length);
        ordered.splice(dest, 0, actor);
        ordered.forEach((a, i) => (a.z = i));
      }
      deleteClone(runtimeId) {
        const a = this.requireActor({ runtimeId });
        if (!a.isClone)
          throw new AkariError('R406', `「${this.component(runtimeId)?.name ?? ''}」は コピーでは ないので、消えません。「このコピーだけを消す」「消える」で 消えるのは コピーだけです`);
        this.actors.delete(runtimeId);
        this.ui.render?.();
      }
      setBackdropByName(name) {
        const b = this.project.stage.backdrops.find((x) => x.name === name);
        if (!b) throw new AkariError('R405', `はいけい「${name}」が ありません。画面に ある はいけいの 名前を 書きます。れい：${this.project.stage.backdrops.slice(0, 3).map(x => '「' + x.name + '」').join('、')}`);
        const old = this.project.stage.backdrops.find((x) => x.id === this.stage.backdropId);
        if (b.id === this.stage.backdropId) return null;
        this.stage.backdropId = b.id;
        this.ui.render?.();
        return { oldName: old?.name || '', newName: b.name };
      }
      stepBackdrop(delta) {
        const arr = this.project.stage.backdrops,
          i = Math.max(
            0,
            arr.findIndex((x) => x.id === this.stage.backdropId),
          ),
          n = (i + delta + arr.length) % arr.length;
        return this.setBackdropByName(arr[n].name);
      }
      startTone(freq, duration, ctx, onEnded = null) {
        if (!this.assetCache) throw new AkariError('R415', '音の じゅんびが できて いません');
        const a = ctx.runtimeId && ctx.runtimeId !== 'stage' ? this.actor(ctx.runtimeId) : null,
          volume = a?.volume ?? this.stage.volume,
          pitch = a?.pitch ?? this.stage.pitch;
        return this.ownSound(this.assetCache.startTone(freq, duration, volume, pitch, onEnded), ctx.runtimeId);
      }
      // Who plays a sound: 名人 waits for one part's sounds (鳴り終わる) and stops them (〜の音を止める).
      ownSound(handleId, runtimeId) {
        (this.audioOwners ||= new Map()).set(handleId, runtimeId || 'stage');
        return handleId;
      }
      startSample(name, ctx, onEnded = null) {
        const snd = this.project.sounds.find((x) => x.name === name);
        if (!snd) throw new AkariError('R414', `音「${name}」が ありません。作品に 入れた 音の 名前を 書きます`);
        const buf = this.assetCache?.getAudioBuffer(snd.assetId);
        if (!buf) throw new AkariError('R415', `音「${name}」の じゅんびが できて いません`);
        const a = ctx.runtimeId && ctx.runtimeId !== 'stage' ? this.actor(ctx.runtimeId) : null,
          volume = a?.volume ?? this.stage.volume,
          pitch = a?.pitch ?? this.stage.pitch;
        return this.ownSound(this.assetCache.startSample(buf, volume, pitch, onEnded), ctx.runtimeId);
      }
      stopAllAudio(notify = false) {
        this.assetCache?.stopAllHandles({ notify });
      }
    }
    function localScalar(v) {
      assertRuntimeValueLimit(v);
      if (!scalar(v))
        throw new AkariError('R411', 'この中だけの へんすうには 数・文字・あてはまる／あてはまらない だけを 入れられます');
      return v;
    }
    function numberInUnit(v, expectedUnit, msg = 'ここには 数が いります。れい：10') {
      const magnitude = numberValue(v, msg), unit = unitOf(v);
      if (expectedUnit !== null && !UNIT_TAGS.includes(expectedUnit))
        throw new AkariError('R417', '使えない たんいです');
      if (unit !== null && unit !== expectedUnit)
        throw new AkariError('R417', expectedUnit === null
          ? 'この 計算には たんいの ない 数を 使います。「の数だけ」で たんいを 外せます'
          : `ここでは${expectedUnit}の数を使います。${unit}の数は使えません`);
      return magnitude;
    }
    function numeric(v, msg = 'ここには 数が いります。れい：10') {
      return numberInUnit(v, null, msg);
    }
    function commonUnit(values) {
      let unit = null;
      for (const value of values) {
        numberValue(value);
        const next = unitOf(value);
        if (unit !== null && next !== null && unit !== next)
          throw new AkariError('R417', `${unit}と${next}は同じ たんいでは ありません。たんいを そろえて ください`);
        if (next !== null) unit = next;
      }
      return unit;
    }
    function arithmetic(op, left, right) {
      const a = numberValue(left), b = numberValue(right),
        au = unitOf(left), bu = unitOf(right);
      let unit = null, result;
      if (op === 'ADD' || op === 'SUB') {
        unit = commonUnit([left, right]);
        result = op === 'ADD' ? a + b : a - b;
      } else if (op === 'MUL') {
        if (au !== null && bu !== null)
          throw new AkariError('R417', 'たんいの ある 数どうしは かけられません。「の数だけ」で たんいを 外せます');
        unit = au || bu;
        result = a * b;
      } else if (op === 'DIV') {
        if (bu !== null && au !== bu)
          throw new AkariError('R417', 'この たんいどうしは われません。「の数だけ」で たんいを 外せます');
        if (b === 0) throw new AkariError('R401', '0では われません。わる数を 0では ない 数に して ください');
        unit = bu === null ? au : null;
        result = a / b;
      } else {
        numeric(left); numeric(right);
        if (a === 0 && b === 0) throw new AkariError('R402', '0＾0は 計算できません');
        result = Math.pow(a, b);
        if (!Number.isFinite(result))
          throw new AkariError('R402', 'この＾の 計算は 答えが 出せません。使う 数を たしかめて ください');
      }
      return quantity(ensureFinite(result), unit);
    }
    function addNumericUpdate(current, increment, op = 'ADD') {
      const a = numberValue(current), b = numberInUnit(increment, unitOf(current));
      return quantity(ensureFinite(op === 'ADD' ? a + b : a - b), unitOf(current));
    }
    function validateExpectedUnit(value, expectedUnit) {
      if (expectedUnit == null) return;
      numberInUnit(value, expectedUnit, 'たんいを 決めた へんすうには 数を 入れます');
    }
    function validateRuntimeData(project, fail = null) {
      const reject = fail || ((message) => { throw new AkariError('R411', message); });
      for (const data of [project.projectData, ...project.components.map(c => c?.localData)]) {
        if (!data || !Array.isArray(data.variables) || !Array.isArray(data.lists)) reject('へんすう・リストが 正しく ありません');
        for (const d of data.variables) {
          if (!scalar(d?.initialValue) || isPart(d.initialValue)) reject('へんすうの はじめの 中身が 正しく ありません');
          if (d.expectedUnit != null && !UNIT_TAGS.includes(d.expectedUnit)) reject('へんすうの たんいが 正しく ありません');
          try { assertRuntimeValueLimit(d.initialValue); validateExpectedUnit(d.initialValue, d.expectedUnit); }
          catch (e) { if (fail) fail(e.message); else throw e; }
        }
        for (const d of data.lists) {
          if (!listValue(d?.initialValue) || d.initialValue.some(isPart)) reject('リストの はじめの 中身が 正しく ありません');
          try { assertRuntimeValueLimit(d.initialValue); } catch (e) { if (fail) fail(e.message); else throw e; }
        }
      }
      return true;
    }
    function bool(v, msg = 'ここには あてはまるか どうかを 入れます。れい：点数が10より大きい') {
      if (typeof v !== 'boolean') throw new AkariError('R411', msg);
      return v;
    }
    function integerIndex(v) {
      const n = numberInUnit(v, '番目', '番号には 数が いります。れい：2');
      if (!Number.isInteger(n) || n < 1)
        throw new AkariError('R404', '番号は 1、2、3 のような 数に します。0や マイナス、小数は 使えません');
      return n;
    }
    function unicodeIndexOf(text, search) {
      const source = Array.from(text),
        needle = Array.from(search);
      if (!needle.length) return 1;
      const prefix = new Uint32Array(needle.length);
      for (let i = 1, j = 0; i < needle.length; i++) {
        while (j && needle[i] !== needle[j]) j = prefix[j - 1];
        if (needle[i] === needle[j]) j++;
        prefix[i] = j;
      }
      for (let i = 0, j = 0; i < source.length; i++) {
        while (j && source[i] !== needle[j]) j = prefix[j - 1];
        if (source[i] === needle[j]) j++;
        if (j === needle.length) return i - needle.length + 2;
      }
      return 0;
    }
    function evalExpression(ast, ctx, budget = null) {
      try {
      if (budget && ast.kind !== 'QuantityLiteral') {
        if (++budget.count > LIMITS.functionOps)
          throw new AkariError('R409', '計算の 回数が 多すぎます。くり返しの 回数を へらして ください');
      }
      switch (ast.kind) {
        case 'QuantityLiteral':
          return quantity(numberInUnit(evalExpression(ast.value, ctx, budget), ast.unit), ast.unit);
        case 'UnitlessRead':
          return numberValue(evalExpression(ast.value, ctx, budget));
        case 'EventCountBound':
          return (ctx.runtime.eventCounts.get(ast.key) || 0) - ast.baseline >= ast.target;
        case 'EventCount':
          throw new AkariError('R411', '回数の 条件は「〜まで待つ」と「〜まで、くり返す」で 使います');
        case 'PartRef': {
          const runtimeId = ctx.runtime.resolveActorRef({ kind: 'named', name: ast.name }, ctx.runtimeId);
          return partValue(runtimeId, ast.name);
        }
        // 名人 part sets: each is a list of parts, in the order of the work's parts and their copies.
        case 'PartFamily':
          return ctx.runtime.instancesByName(ast.name).map(a => partValue(a.runtimeId, ast.name));
        case 'PartExcept': {
          const except = evalExpression(ast.except, ctx, budget);
          return partList(evalExpression(ast.list, ctx, budget)).filter(p => !isPart(except) || p.part !== except.part);
        }
        case 'PartRandom': {
          const parts = partList(evalExpression(ast.list, ctx, budget));
          return parts.length ? [parts[Math.floor(ctx.runtime.prng.nextFloat() * parts.length)]] : [];
        }
        case 'PartPick':
          return ctx.runtime.pickPart(partList(evalExpression(ast.list, ctx, budget)), ast.by, ctx);
        case 'PartNearest':
          return ctx.runtime.nearestPart(partList(evalExpression(ast.of, ctx, budget)), ctx.runtimeId);
        case 'PartsTouching':
          return ctx.runtime.partsTouching(evalExpression(ast.target, ctx, budget), ast.of ? ast.of.name : null);
        case 'CreatedCopies':
          return (ctx.task?.createdCopies || []).filter(p => ctx.runtime.actor(p.part));
        case 'PartName': {
          const runtimeId = ast.actorRef?.kind === 'value'
            ? ctx.runtime.partRuntimeId(evalExpression(ast.actorRef.value, ctx, budget))
            : ctx.runtime.resolveActorRef(ast.actorRef, ctx.runtimeId);
          return runtimeId === 'stage' ? ctx.runtime.project.stage.name : ctx.runtime.component(runtimeId)?.name ?? '';
        }
        case 'PartState': {
          const runtimeId = ast.actorRef?.kind === 'value'
            ? ctx.runtime.partRuntimeId(evalExpression(ast.actorRef.value, ctx, budget))
            : ctx.runtime.resolveActorRef(ast.actorRef, ctx.runtimeId);
          if (ast.state === 'speechDone') return !ctx.scheduler?.speaking(runtimeId);
          if (ast.state === 'soundDone') return !ctx.runtime.soundingParts().has(runtimeId);
          if (ast.state === 'copyCount') {
            const base = ctx.runtime.actor(runtimeId)?.baseId;
            return [...ctx.runtime.actors.values()].filter(a => a.isClone && a.baseId === base).length;
          }
          throw new AkariError('R411', '部品の ようすを 読み取れません');
        }
        case 'DeadlineBound':
          return ctx.runtime.now() < ast.deadline;
        case 'PartValue':
          return ast.value;
        case 'ActorQualifiedRead': {
          const runtimeId = ast.actorRef?.kind === 'value'
            ? ctx.runtime.partRuntimeId(evalExpression(ast.actorRef.value, ctx, budget))
            : ctx.runtime.resolveActorRef(ast.actorRef, ctx.runtimeId);
          return evalExpression(ast.value, { ...ctx, runtimeId }, budget);
        }
        case 'NumberLiteral':
          return numeric(ast.value);
        case 'StringLiteral':
        case 'BooleanLiteral':
          return ast.value;
        case 'ListLiteral': {
          const arr = ast.items.map((x) => evalExpression(x, ctx, budget));
          if (!arr.every(scalar))
            throw new AkariError('R411', 'リストに 入れられるのは 数・文字・あてはまる／あてはまらない だけです');
          if (arr.length > LIMITS.listItems) throw new AkariError('R413', 'リストが 長すぎます');
          return arr;
        }
        case 'VariableRead':
          return ctx.runtime.readName(ast, ctx);
        case 'UnaryExpression': {
          const v = evalExpression(ast.value, ctx, budget);
          if (ast.op === 'NOT') return !bool(v);
          const n = numberValue(v);
          return quantity(ast.op === 'NEG' ? ensureFinite(-n) : n, unitOf(v));
        }
        case 'BinaryExpression': {
          const left = evalExpression(ast.left, ctx, budget),
            right = evalExpression(ast.right, ctx, budget);
          return arithmetic(ast.op, left, right);
        }
        case 'CompareExpression': {
          const left = evalExpression(ast.left, ctx, budget),
            right = evalExpression(ast.right, ctx, budget);
          if (ast.op === 'EQ' || ast.op === 'NEQ') {
            let equal;
            if (isNumberValue(left) && isNumberValue(right)) {
              commonUnit([left, right]);
              equal = numberValue(left) === numberValue(right);
            } else equal = sameValue(left, right);
            return ast.op === 'EQ' ? equal : !equal;
          }
          const a = numberValue(left, 'くらべる 左がわは 数に します'),
            b = numberValue(right, 'くらべる 右がわは 数に します');
          commonUnit([left, right]);
          return ast.op === 'GTE' ? a >= b : ast.op === 'LTE' ? a <= b : ast.op === 'GT' ? a > b : a < b;
        }
        case 'LogicalExpression': {
          const a = bool(evalExpression(ast.left, ctx, budget));
          if (ast.op === 'AND') return a ? bool(evalExpression(ast.right, ctx, budget)) : false;
          return a ? true : bool(evalExpression(ast.right, ctx, budget));
        }
        case 'ListRead': {
          const arr = evalExpression(ast.list, ctx, budget);
          if (!Array.isArray(arr)) {
            const error = new AkariError('R411', ast.list.kind === 'VariableRead'
              ? `「${ast.list.name}」は リストでは ないので、何番目かを えらべません。何番目かを えらべるのは リストです`
              : '「N番目」はリストに使います');
            if (ast.list.kind === 'StringLiteral' && ast.list.sourceSpan && ctx.runtime?.actor)
              error.quotedList = { name: ast.list.value, span: { ...ast.list.sourceSpan },
                targetId: ctx.runtime.actor(ctx.runtimeId)?.baseId || 'stage' };
            throw error;
          }
          const i = integerIndex(evalExpression(ast.index, ctx, budget));
          if (i > arr.length) throw new AkariError('R404', 'その 番号の ものは リストに ありません。番号を たしかめて ください');
          return deepCopy(arr[i - 1]);
        }
        case 'ExtensionCalculation':
          return assertRuntimeValueLimit(invokeExtension('calculation', ast.name, ast.args.map(x => evalExpression(x, ctx, budget)), ctx));
        case 'BuiltinCall':
          return assertRuntimeValueLimit(evalBuiltin(ast, ctx, budget));
        case 'UserFunctionCall':
          return runUserFunction(
            ast.name,
            ast.args.map((x) => evalExpression(x, ctx, budget)),
            ctx,
            budget,
            (ctx.callDepth || 0) + 1,
            ast.argumentNames || [],
          );
        case 'SensorRead':
          return evalSensor(ast, ctx, budget);
        default:
          throw new AkariError('R411', `計算できない ところ ${ast.kind}`);
      }
      } catch (error) {
        if (error instanceof AkariError && !error.line && ast.sourceSpan) {
          error.line = ast.sourceSpan.startLine;
          error.column = ast.sourceSpan.startColumn;
        }
        throw error;
      }
    }
    // An example names a list of the child's own work (the work's first list, then the part's own), never one the work
    // does not have; with none, the example has no name.
    function exampleListName(ctx) {
      const r = ctx?.runtime;
      for (const lists of [r?.projectLists, r?.actor?.(ctx.runtimeId)?.lists]) if (lists?.size) return lists.keys().next().value;
      return null;
    }
    function evalBuiltin(ast, ctx, budget) {
      const name = ast.name,
        args = ast.args.map((x) => evalExpression(x, ctx, budget)),
        meta = BUILTIN_META.get(name);
      if (meta && (args.length < meta.minArgs || args.length > meta.maxArgs))
        throw new AkariError('R411', `はじめから ある 計算「${({余り:'あまり',乱数:'AからBのどれか'})[name] || name}」に 入れる ものの 数が ちがいます`);
      if (name === 'CONTAINS') {
        const [a, b] = args;
        if (Array.isArray(a)) {
          if (Array.isArray(b))
            throw new AkariError('R411', 'リストの 中から さがす ものは 1つに します');
          return a.some((x) => sameValue(x, b));
        }
        if (typeof a === 'string' && typeof b === 'string') return a.includes(b);
        throw new AkariError('R411', '「入っている」は リストか 文字に 使います。れい：［1、2］に2が入っている');
      }
      if (name === 'INDEX_OF') {
        const [a, b] = args;
        if (Array.isArray(a)) {
          const i = a.findIndex((x) => sameValue(x, b));
          return i < 0 ? 0 : i + 1;
        }
        if (typeof a === 'string' && typeof b === 'string') {
          return unicodeIndexOf(a, b);
        }
        throw new AkariError('R411', '「最初にある番号」は リストか 文字に 使います');
      }
      if (name === 'LENGTH') {
        const a = args[0];
        if (Array.isArray(a)) return a.length;
        if (typeof a === 'string') return Array.from(a).length;
        const list = exampleListName(ctx);
        throw new AkariError('R411', '数えられるのは、リストに 入って いる ものの 数か、文字の 数です。れい：' + (list ? list + 'の数' : '「あいう」の長さ'));
      }
      if (name === 'STRING_LENGTH') {
        return Array.from(stringv(args[0])).length;
      }
      if (name === 'STRING_CHAR') {
        const arr = Array.from(stringv(args[0])),
          i = integerIndex(args[1]);
        if (i > arr.length) throw new AkariError('R404', 'その 番号の 文字は ありません。番号を たしかめて ください');
        return arr[i - 1];
      }
      const nums = () => args.map((x) => numberValue(x));
      switch (name) {
        case '乱数': {
          if (args.length !== 2) throw new AkariError('R411', '「どれか」の 計算には 数を 2つ 入れます。れい：1から10のどれか');
          const unit = commonUnit(args);
          let [a, b] = nums();
          if (a === b) return quantity(a, unit);
          const lo = Math.min(a, b),
            hi = Math.max(a, b),
            f = ctx.runtime.prng.nextFloat();
          const span = hi - lo,
            integers = Number.isInteger(a) && Number.isInteger(b);
          let value;
          if (integers && Number.isSafeInteger(span + 1)) value = Math.floor(f * (span + 1)) + lo;
          else {
            value = Number.isFinite(span) ? lo + f * span : lo * (1 - f) + hi * f;
            if (integers) value = Math.floor(value);
          }
          return quantity(clamp(ensureFinite(value), lo, hi), unit);
        }
        case '余り': {
          if (args.length !== 2) throw new AkariError('R411', '「あまり」には 数を 2つ 入れます。れい：あまり（10、3）');
          const unit = commonUnit(args);
          const [a, b] = nums();
          if (b === 0) throw new AkariError('R401', '0で わった あまりは 出せません。わる数を 0では ない 数に して ください');
          return quantity(ensureFinite(a % b), unit);
        }
        case '四捨五入': {
          const n = numberValue(args[0]);
          return quantity(n >= 0 ? Math.floor(n + 0.5) : Math.ceil(n - 0.5), unitOf(args[0]));
        }
        case '切り上げ':
          return quantity(Math.ceil(numberValue(args[0])), unitOf(args[0]));
        case '切り捨て':
          return quantity(Math.floor(numberValue(args[0])), unitOf(args[0]));
        case '絶対値':
          return quantity(Math.abs(numberValue(args[0])), unitOf(args[0]));
        case '平方根': {
          const n = numeric(args[0]);
          if (n < 0) throw new AkariError('R402', 'マイナスの 数の「平方根」は 出せません。0か、0より 大きい 数を 入れて ください');
          return Math.sqrt(n);
        }
        case '正弦':
          return Math.sin(numberInUnit(args[0], '度') * (Math.PI / 180));
        case '余弦':
          return Math.cos(numberInUnit(args[0], '度') * (Math.PI / 180));
        case '正接':
          return Math.tan(numberInUnit(args[0], '度') * (Math.PI / 180));
        case '逆正弦': {
          const n = numeric(args[0]);
          if (n < -1 || n > 1) throw new AkariError('R402', '「逆正弦」には -1〜1の 数を 入れます');
          return quantity((Math.asin(n) * 180) / Math.PI, '度');
        }
        case '逆余弦': {
          const n = numeric(args[0]);
          if (n < -1 || n > 1) throw new AkariError('R402', '「逆余弦」には -1〜1の 数を 入れます');
          return quantity((Math.acos(n) * 180) / Math.PI, '度');
        }
        case '逆正接':
          return quantity((Math.atan(numeric(args[0])) * 180) / Math.PI, '度');
        case '自然対数': {
          const n = numeric(args[0]);
          if (n <= 0) throw new AkariError('R402', '「自然対数」には 0より 大きい 数を 入れます');
          return Math.log(n);
        }
        case '常用対数': {
          const n = numeric(args[0]);
          if (n <= 0) throw new AkariError('R402', '「常用対数」には 0より 大きい 数を 入れます');
          return Math.log10(n);
        }
        case '指数':
          return ensureFinite(Math.exp(numeric(args[0])));
        case '最小':
          if (!args.length) throw new AkariError('R411', '「最小」には 数を 少なくとも 1つ 入れます');
          return quantity(Math.min(...nums()), commonUnit(args));
        case '最大':
          if (!args.length) throw new AkariError('R411', '「最大」には 数を 少なくとも 1つ 入れます');
          return quantity(Math.max(...nums()), commonUnit(args));
        case '数': {
          if (args.length !== 1 || typeof args[0] !== 'string')
            throw new AkariError('R411', '数（...）には 文字を 1つ 入れます。れい：数（「12」）');
          const s = args[0];
          if (!/^[＋+－-]?[0-9]+(?:\.[0-9]+)?$/.test(s))
            throw new AkariError('R411', 'この 文字は 数に かえられません。数字だけの 文字に します。れい：「12」');
          return ensureFinite(Number(s.replace('＋', '+').replace('－', '-')));
        }
        case '文字':
          if (args.length !== 1 || Array.isArray(args[0]) || args[0] == null)
            throw new AkariError('R411', 'これは 文字に かえられません');
          return valueText(args[0], true);
        case 'つなぐ':
          if (args.length < 2) throw new AkariError('R411', '「つなぐ」には つなぐ ものを 少なくとも 2つ 入れます。れい：つなぐ（「あ」、「い」）');
          {
            const s = args
              .map((x, i) => {
                if (Array.isArray(x)) {
                  const list = ast.args[i]?.kind === 'VariableRead' ? ast.args[i].name : exampleListName(ctx);
                  throw new AkariError('R411', 'リストは そのまま 文字に つなげません。' + (list ? `「${list}の1番目」のように、` : '') + '中身を 1つずつ つなぎます');
                }
                return valueText(x, true);
              })
              .join('');
            if (cpLen(s) > LIMITS.stringChars) throw new AkariError('R413', '文字が 長すぎます');
            return s;
          }
        default:
          throw new AkariError('R411', `計算「${name}」を 使えません`);
      }
    }
    function evalSensor(ast, ctx, budget) {
      const r = ctx.runtime,
        a = ctx.runtimeId && ctx.runtimeId !== 'stage' ? r.actor(ctx.runtimeId) : null,
        s = ast.sensor;
      switch (s) {
        case '横位置':
          if (!a) throw new AkariError('R407', '「よこのばしょ」は キャラクターや 部品の 動きの 中で 使います');
          return quantity(a.x, '歩');
        case '縦位置':
          if (!a) throw new AkariError('R407', '「たてのばしょ」は キャラクターや 部品の 動きの 中で 使います');
          return quantity(a.y, '歩');
        case '方向':
          if (!a) throw new AkariError('R407', '「方向」は キャラクターや 部品の 動きの 中で 使います');
          return quantity(a.direction, '度');
        case '大きさ':
          if (!a) throw new AkariError('R407', '「大きさ」は キャラクターや 部品の 動きの 中で 使います');
          return quantity(a.scalePercent, '％');
        case '衣装番号': {
          if (!a) throw new AkariError('R407', '「すがたの番号」は キャラクターの 動きの 中で 使います');
          const c = r.component(ctx.runtimeId);
          if (c?.type !== 'sprite') throw new AkariError('R406', 'すがたを えらべるのは キャラクターだけです');
          return c.costumes.findIndex((x) => x.id === a.costumeId) + 1;
        }
        case '衣装名': {
          if (!a) throw new AkariError('R407', '「すがたの名前」は キャラクターの 動きの 中で 使います');
          const c = r.component(ctx.runtimeId);
          return c?.costumes?.find((x) => x.id === a.costumeId)?.name || '';
        }
        case '背景番号':
          return r.project.stage.backdrops.findIndex((x) => x.id === r.stage.backdropId) + 1;
        case '背景名':
          return r.project.stage.backdrops.find((x) => x.id === r.stage.backdropId)?.name || '';
        case 'マウスの横位置':
          return quantity(r.mouseX, '歩');
        case 'マウスの縦位置':
          return quantity(r.mouseY, '歩');
        case 'マウスが押されている':
          return r.mouseDown;
        // In whole milliseconds: the browser's clock has digits below them that are only noise, and a race time a
        // child says would show them (0.773800000012秒).
        case 'タイマー':
          return quantity(Math.round(r.now() - r.startTime - r.timerOffset) / 1000, '秒');
        case '拡張の値':
          if (!Object.hasOwn(ctx.eventContext || {}, 'payload')) throw new AkariError('E705', '拡張「できごとの値」は、かくちょうの きっかけの 本文で 使って ください');
          return assertRuntimeValueLimit(ctx.eventContext.payload);
        case '答え':
          return ctx.task?.lastAnswer ?? '';
        case '音量':
          return quantity(a?.volume ?? r.stage.volume, '％');
        case '音程':
          return a?.pitch ?? r.stage.pitch;
        case 'クローンである':
          if (!a) throw new AkariError('R407', '「コピーである」は キャラクターの 動きの 中で 使います');
          return !!a.isClone;
        case '押されたキー':
          return ctx.eventContext?.key ?? '';
        case '受け取った知らせ':
          return ctx.eventContext?.message ?? '';
        case '以前の値':
          return ctx.eventContext?.oldValue ?? '';
        case '新しい値':
          return ctx.eventContext?.newValue ?? '';
        case '以前の背景名':
          return ctx.eventContext?.oldName ?? '';
        case '新しい背景名':
          return ctx.eventContext?.newName ?? '';
        case 'INPUT_VALUE': {
          const name = targetName(evalExpression(ast.arg, ctx, budget), () => partNeeded(ctx, 'input'));
          const c = r.project.components.find((x) => x.name === name);
          if (!c) throw new AkariError('R405', `部品「${name}」が ありません`);
          if (c.type !== 'input') throw new AkariError('R406', `「${name}」は 入力らんでは ありません`);
          const inst = r.actor(c.id);
          return inst?.inputValue ?? c.text;
        }
        case 'DISTANCE_TO':
          return quantity(r.distance(ctx.runtimeId, targetValue(evalExpression(ast.arg, ctx, budget), () => partNeeded(ctx))), '歩');
        case 'KEY_DOWN':
          return r.pressedKeys.has(stringv(evalExpression(ast.arg, ctx, budget)));
        case 'TOUCHING':
          return r.touching(ctx.runtimeId, targetValue(evalExpression(ast.arg, ctx, budget), () => partNeeded(ctx)));
        case 'TOUCHING_COLOR':
          return r.touchingColor(ctx.runtimeId, stringv(evalExpression(ast.arg, ctx, budget)));
        default:
          throw new AkariError('R411', `「${s}」を読み取れません`);
      }
    }

    function snapshotEntries(map) {
      return [...(map || [])].map(([k, v]) => [k, deepCopy(v)]);
    }
    function snapshotFrame(frame, kind) {
      return {
        kind,
        id: frame.id || '',
        name: frame.name,
        line: frame.currentLine || 0,
        args: snapshotEntries(frame.args),
        locals: snapshotEntries(frame.locals),
        localLists: snapshotEntries(frame.localLists),
      };
    }
    function freezeRecord(value) {
      if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const x of Object.values(value)) freezeRecord(x);
        Object.freeze(value);
      }
      return value;
    }

    function namedArgumentDetails(expected, supplied) {
      if (!supplied?.length) return '';
      const parts=[],quoted=names=>names.map(name=>`「${name}」`).join('、');
      const missing=expected.filter(name=>!supplied.includes(name)),unknown=[...new Set(supplied.filter(name=>!expected.includes(name)))],duplicates=[...new Set(supplied.filter((name,i)=>supplied.indexOf(name)!==i))];
      if(missing.length)parts.push('足りない名前: '+quoted(missing));
      if(unknown.length)parts.push('入れるものに ない 名前: '+quoted(unknown));
      if(duplicates.length)parts.push('2回 書いた 名前: '+quoted(duplicates));
      return parts.length?'（'+parts.join('。')+'）':'';
    }
    function runUserFunction(name, args, ctx, budget = null, depth = 1, argumentNames = []) {
      if (depth > LIMITS.callDepth) throw new AkariError('R408', '自分で作ったブロックの 中で ブロックを 使うのが かさなりすぎました');
      const def = ctx.compiled.symbols.functions.get(name);
      if (!def) throw new AkariError('S301', `答えを もとめる「${name}」が ありません`);
      if (def.args.length !== args.length)
        throw new AkariError('S308', `答えを もとめる「${name}」に 入れる ものは${def.args.length}こです`+namedArgumentDetails(def.args,argumentNames));
      if (argumentNames.length) {
        if (argumentNames.length !== args.length || new Set(argumentNames).size !== argumentNames.length ||
          argumentNames.some(n => !def.args.includes(n)) || def.args.some(n => !argumentNames.includes(n)))
          throw new AkariError('S308', `答えを もとめる「${name}」に 入れる ものの 名前が 合いません`+namedArgumentDetails(def.args,argumentNames));
        const named = new Map(argumentNames.map((n, i) => [n, args[i]]));
        args = def.args.map(n => named.get(n));
      }
      budget = budget || { count: 0 };
      const ast = ctx.compiled.astByKey.get(`function:${def.id}`);
      if (!ast) throw new AkariError('S301', `自分で作ったブロック「${name}」の じゅんびが できませんでした`);
      const frame = {
        args: new Map(def.args.map((n, i) => [n, deepCopy(args[i])])),
        locals: new Map(),
        localLists: new Map(),
        name,
        id: def.id,
        selfRuntimeId: ctx.runtimeId,
      };
      const fctx = { ...ctx, functionFrame: frame, callDepth: depth, budget };
      try {
        execFunctionNodes(ast.body, fctx, budget, 0);
      } catch (sig) {
        if (sig instanceof ScriptSignal && sig.kind === 'return') return deepCopy(sig.value);
        if (sig instanceof AkariError) {
          sig.akariCallStack = [`自分で作ったブロック ${name}`, ...(sig.akariCallStack || [])];
          sig.akariFrames = [snapshotFrame(frame, 'function'), ...(sig.akariFrames || [])];
        }
        throw sig;
      }
      throw new AkariError('S306', `答えを もとめる「${name}」が 答えを 返しませんでした。答えの れい：1＋2を答えとして返す。`);
    }
    function execFunctionNodes(nodes, inheritedContext, budget, loopDepth) {
      for (const n of nodes) {
        if (n.kind === 'CommentLine') continue;
        // A nested suite changes the effective subject, never the function's self.
        const ctx = { ...inheritedContext, runtimeId: inheritedContext.runtime.resolveActorRef(
          n.actorRef, inheritedContext.functionFrame.selfRuntimeId) };
        ctx.functionFrame.currentLine = n.sourceSpan?.startLine || 1;
        if (++budget.count > LIMITS.functionOps)
          throw new AkariError('R409', '計算の 回数が 多すぎます。くり返しの 回数を へらして ください');
        try {
          switch (n.kind) {
            case 'NoOperation':
              break;
            case 'LocalVariableDeclaration':
              ctx.functionFrame.locals.set(
                n.name,
                localScalar(evalExpression(n.initial, ctx, budget)),
              );
              break;
            case 'LocalListDeclaration':
              ctx.functionFrame.localLists.set(n.name, []);
              break;
            case 'Assignment':
              ctx.runtime.writeTarget(n.target, evalExpression(n.value, ctx, budget), ctx);
              break;
            case 'NumericUpdate': {
              const b = ctx.runtime.resolveBinding(n.target.name, n.target.qualifier, ctx);
              if (!b?.set) throw new AkariError('S301', '入れる先が ありません');
              const value = addNumericUpdate(b.get(), evalExpression(n.value, ctx, budget), n.op);
              ctx.runtime.writeTarget(n.target, value, ctx, {resolvedBinding: b});
              break;
            }
            case 'ListAppend':
            case 'ListInsert':
            case 'ListReplace':
            case 'ListDelete':
            case 'ListClear':
              execListMutation(n, ctx, budget);
              break;
            case 'IfStatement':
              execFunctionNodes(
                bool(evalExpression(n.condition, ctx, budget)) ? n.thenBody : n.elseBody,
                ctx,
                budget,
                loopDepth,
              );
              break;
            case 'RepeatCount': {
              const count = numberInUnit(evalExpression(n.count, ctx, budget), '回');
              if (!Number.isSafeInteger(count) || count < 0 || count > LIMITS.repeatCount)
                throw new AkariError('R413', 'くり返す 回数は 0、1、2 のような 数に します。マイナスや 小数、大きすぎる 数は 使えません');
              for (let i = 0; i < count; i++) {
                if (++budget.count > LIMITS.functionOps)
                  throw new AkariError('R409', '計算の 回数が 多すぎます。くり返しの 回数を へらして ください');
                try {
                  execFunctionNodes(n.body, ctx, budget, loopDepth + 1);
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') break;
                  if (s instanceof ScriptSignal && s.kind === 'continue') continue;
                  throw s;
                }
              }
              break;
            }
            case 'RepeatWhile':
              while (bool(evalExpression(n.condition, ctx, budget))) {
                try {
                  execFunctionNodes(n.body, ctx, budget, loopDepth + 1);
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') break;
                  if (s instanceof ScriptSignal && s.kind === 'continue') continue;
                  throw s;
                }
              }
              break;
            case 'RepeatUntil':
              while (!bool(evalExpression(n.condition, ctx, budget))) {
                try {
                  execFunctionNodes(n.body, ctx, budget, loopDepth + 1);
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') break;
                  if (s instanceof ScriptSignal && s.kind === 'continue') continue;
                  throw s;
                }
              }
              break;
            case 'Forever':
              for (;;) {
                if (++budget.count > LIMITS.functionOps)
                  throw new AkariError('R409', '計算の 回数が 多すぎます。くり返しの 回数を へらして ください');
                try {
                  execFunctionNodes(n.body, ctx, budget, loopDepth + 1);
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') break;
                  if (s instanceof ScriptSignal && s.kind === 'continue') continue;
                  throw s;
                }
              }
              break;
            case 'ForEach': {
              const arr = evalExpression(n.list, ctx, budget);
              if (!Array.isArray(arr))
                throw new AkariError('R411', '「それぞれ」は リストに 使います');
              for (const v of deepCopy(arr)) {
                if (++budget.count > LIMITS.functionOps)
                  throw new AkariError('R409', '計算の 回数が 多すぎます。くり返しの 回数を へらして ください');
                const old = ctx.functionFrame.locals.has(n.binder)
                    ? ctx.functionFrame.locals.get(n.binder)
                    : undefined,
                  had = ctx.functionFrame.locals.has(n.binder);
                ctx.functionFrame.locals.set(n.binder, deepCopy(v));
                try {
                  execFunctionNodes(n.body, ctx, budget, loopDepth + 1);
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') {
                    if (had) ctx.functionFrame.locals.set(n.binder, old);
                    else ctx.functionFrame.locals.delete(n.binder);
                    break;
                  }
                  if (!(s instanceof ScriptSignal && s.kind === 'continue')) throw s;
                }
                if (had) ctx.functionFrame.locals.set(n.binder, old);
                else ctx.functionFrame.locals.delete(n.binder);
              }
              break;
            }
            case 'Break':
              throw new ScriptSignal('break');
            case 'Continue':
              throw new ScriptSignal('continue');
            case 'ReturnStatement': {
              const s = new ScriptSignal('return');
              s.value = evalExpression(n.value, ctx, budget);
              throw s;
            }
            default:
              throw new AkariError('S305', '「答えを もとめる」の 中では、この ブロックは 使えません');
          }
        } catch (err) {
          if (err instanceof AkariError && !err.akariSource) {
            if (!err.line) {
              err.line = n.sourceSpan?.startLine || 1;
              err.column = n.sourceSpan?.startColumn || 1;
            }
            err.akariSource = { key: `function:${ctx.functionFrame.id}` };
          }
          throw err;
        }
      }
    }
    function execListMutation(n, ctx, budget = null) {
      const b = ctx.runtime.resolveBinding(n.target.name, n.target.qualifier, ctx);
      if (!b || !b.set) throw new AkariError('S301', 'リストが ありません');
      const arr = b.get();
      if (!Array.isArray(arr)) throw new AkariError('R411', 'これは リストに 使う ブロックです');
      if (n.kind === 'ListClear') {
        b.set([]);
        return;
      }
      const idx = n.index ? integerIndex(evalExpression(n.index, ctx, budget)) : null;
      if (n.kind === 'ListAppend') {
        const v = assertRuntimeValueLimit(evalExpression(n.value, ctx, budget));
        if (!scalar(v)) throw new AkariError('R411', 'リストへ 入れられるのは 数・文字・あてはまる／あてはまらない です');
        if (arr.length >= LIMITS.listItems) throw new AkariError('R413', 'リストが 長すぎます');
        arr.push(deepCopy(v));
      } else if (n.kind === 'ListInsert') {
        if (idx > arr.length + 1) throw new AkariError('R404', 'リストに 入れる 番号が 大きすぎます。番号を たしかめて ください');
        const v = assertRuntimeValueLimit(evalExpression(n.value, ctx, budget));
        if (!scalar(v)) throw new AkariError('R411', 'リストへ 入れられるのは 数・文字・あてはまる／あてはまらない です');
        if (arr.length >= LIMITS.listItems) throw new AkariError('R413', 'リストが 長すぎます');
        arr.splice(idx - 1, 0, deepCopy(v));
      } else if (n.kind === 'ListReplace') {
        if (idx > arr.length) throw new AkariError('R404', '入れかえる 番号の ものが リストに ありません');
        const v = assertRuntimeValueLimit(evalExpression(n.value, ctx, budget));
        if (!scalar(v)) throw new AkariError('R411', 'リストへ 入れられるのは 数・文字・あてはまる／あてはまらない です');
        arr[idx - 1] = deepCopy(v);
      } else if (n.kind === 'ListDelete') {
        if (idx > arr.length) throw new AkariError('R404', 'けす 番号の ものが リストに ありません');
        arr.splice(idx - 1, 1);
      } else if (n.kind === 'ListRemoveValue') {
        // 名人: 持ち物から「本」を全部消す — every item that is the same; none is no change.
        const v = evalExpression(n.value, ctx, budget);
        b.set(arr.filter(item => !sameValue(item, v)));
        return;
      }
      b.set(arr);
    }
    // Derived operation policies use resumable evaluation on the main event loop.
    // The standard policy retains the existing synchronous evaluator and accounting.
    function hasUserFunction(value) {
      if (!value || typeof value !== 'object') return false;
      if (value.kind === 'UserFunctionCall') return true;
      return Object.entries(value).some(([key, child]) => !['body','thenBody','elseBody','sourceSpan','actorRef'].includes(key) &&
        (Array.isArray(child) ? child.some(hasUserFunction) : hasUserFunction(child)));
    }
    function valueExpression(value) {
      if (isQuantity(value)) return {kind:'QuantityLiteral',unit:value.unit,value:{kind:'NumberLiteral',value:value.magnitude}};
      if (Array.isArray(value)) return {kind:'ListLiteral',items:value.map(valueExpression)};
      if (isPart(value)) return {kind:'PartValue',value};
      return {kind:typeof value==='number'?'NumberLiteral':typeof value==='boolean'?'BooleanLiteral':'StringLiteral',value};
    }
    function* calculationCheckpoint(budget) {
      if (++budget.count > LIMITS.functionOps) throw new AkariError('R409','計算の 回数が 多すぎます。くり返しの 回数を へらして ください');
      if ((budget.count & 127) === 0) yield;
    }
    function* evalExpressionSteps(ast, ctx, budget) {
      if (ast.kind !== 'QuantityLiteral') yield* calculationCheckpoint(budget);
      if (ast.kind === 'UserFunctionCall') {
        const args=[]; for (const argument of ast.args) args.push(yield* evalExpressionSteps(argument,ctx,budget));
        return yield* runUserFunctionSteps(ast.name,args,ctx,budget,(ctx.callDepth||0)+1,ast.argumentNames||[]);
      }
      if (ast.kind === 'ActorQualifiedRead') return yield* evalExpressionSteps(ast.value,
        {...ctx,runtimeId:ast.actorRef?.kind==='value'?ctx.runtime.partRuntimeId(yield* evalExpressionSteps(ast.actorRef.value,ctx,budget)):ctx.runtime.resolveActorRef(ast.actorRef,ctx.runtimeId)},budget);
      if (ast.kind === 'LogicalExpression') {
        const left=bool(yield* evalExpressionSteps(ast.left,ctx,budget));
        if (ast.op==='AND') return left ? bool(yield* evalExpressionSteps(ast.right,ctx,budget)) : false;
        return left ? true : bool(yield* evalExpressionSteps(ast.right,ctx,budget));
      }
      const prepared={...ast};
      for (const key of ['value','left','right','list','index','arg']) if (ast[key] && typeof ast[key]==='object' && ast[key].kind)
        prepared[key]=valueExpression(yield* evalExpressionSteps(ast[key],ctx,budget));
      for (const key of ['args','items']) if (Array.isArray(ast[key])) {
        prepared[key]=[];
        for (const child of ast[key]) prepared[key].push(valueExpression(yield* evalExpressionSteps(child,ctx,budget)));
      }
      return evalExpression(prepared,ctx);
    }
    function advanceEvaluation(evaluator) {
      const started=nowMs(); let outcome;
      do { outcome=evaluator.next(); } while (!outcome.done && nowMs()-started<8);
      return outcome;
    }
    function* runUserFunctionSteps(name, args, ctx, budget = null, depth = 1, argumentNames = []) {
      if (depth > LIMITS.callDepth) throw new AkariError('R408', '自分で作ったブロックの よびだしが かさなりすぎました');
      const def = ctx.compiled.symbols.functions.get(name);
      if (!def) throw new AkariError('S301', `自分で作ったブロック「${name}」が ありません`);
      if (def.args.length !== args.length)
        throw new AkariError('S308', `計算「${name}」に 入れる ものは${def.args.length}こです`+namedArgumentDetails(def.args,argumentNames));
      if (argumentNames.length) {
        if (argumentNames.length !== args.length || new Set(argumentNames).size !== argumentNames.length ||
          argumentNames.some(n => !def.args.includes(n)) || def.args.some(n => !argumentNames.includes(n)))
          throw new AkariError('S308', `計算「${name}」に 入れる ものの 名前が 合いません`+namedArgumentDetails(def.args,argumentNames));
        const named = new Map(argumentNames.map((n, i) => [n, args[i]]));
        args = def.args.map(n => named.get(n));
      }
      budget = budget || { count: 0 };
      const ast = ctx.compiled.astByKey.get(`function:${def.id}`);
      if (!ast) throw new AkariError('S301', `計算「${name}」の じゅんびが できませんでした`);
      const frame = {
        args: new Map(def.args.map((n, i) => [n, deepCopy(args[i])])),
        locals: new Map(),
        localLists: new Map(),
        name,
        id: def.id,
        selfRuntimeId: ctx.runtimeId,
      };
      const fctx = { ...ctx, functionFrame: frame, callDepth: depth, budget };
      try {
        (yield* execFunctionNodesSteps(ast.body, fctx, budget, 0));
      } catch (sig) {
        if (sig instanceof ScriptSignal && sig.kind === 'return') return deepCopy(sig.value);
        if (sig instanceof AkariError) {
          sig.akariCallStack = [`自分で作ったブロック ${name}`, ...(sig.akariCallStack || [])];
          sig.akariFrames = [snapshotFrame(frame, 'function'), ...(sig.akariFrames || [])];
        }
        throw sig;
      }
      throw new AkariError('S306', `計算「${name}」が 答えを 返しませんでした。答えの れい：1＋2を返す。`);
    }
    function* execFunctionNodesSteps(nodes, inheritedContext, budget, loopDepth) {
      for (const n of nodes) {
        if (n.kind === 'CommentLine') continue;
        // A nested suite changes the effective subject, never the function's self.
        const ctx = { ...inheritedContext, runtimeId: inheritedContext.runtime.resolveActorRef(
          n.actorRef, inheritedContext.functionFrame.selfRuntimeId) };
        ctx.functionFrame.currentLine = n.sourceSpan?.startLine || 1;
        yield* calculationCheckpoint(budget);
        try {
          switch (n.kind) {
            case 'NoOperation':
              break;
            case 'LocalVariableDeclaration':
              ctx.functionFrame.locals.set(
                n.name,
                localScalar((yield* evalExpressionSteps(n.initial, ctx, budget))),
              );
              break;
            case 'LocalListDeclaration':
              ctx.functionFrame.localLists.set(n.name, []);
              break;
            case 'Assignment':
              ctx.runtime.writeTarget(n.target, (yield* evalExpressionSteps(n.value, ctx, budget)), ctx);
              break;
            case 'NumericUpdate': {
              const b = ctx.runtime.resolveBinding(n.target.name, n.target.qualifier, ctx);
              if (!b?.set) throw new AkariError('S301', '入れる先が ありません');
              const value = addNumericUpdate(b.get(), (yield* evalExpressionSteps(n.value, ctx, budget)), n.op);
              ctx.runtime.writeTarget(n.target, value, ctx, {resolvedBinding: b});
              break;
            }
            case 'ListAppend':
            case 'ListInsert':
            case 'ListReplace':
            case 'ListDelete':
            case 'ListClear':
              (yield* execListMutationSteps(n, ctx, budget));
              break;
            case 'IfStatement':
              (yield* execFunctionNodesSteps(
                bool((yield* evalExpressionSteps(n.condition, ctx, budget))) ? n.thenBody : n.elseBody,
                ctx,
                budget,
                loopDepth,
              ));
              break;
            case 'RepeatCount': {
              const count = numberInUnit((yield* evalExpressionSteps(n.count, ctx, budget)), '回');
              if (!Number.isSafeInteger(count) || count < 0 || count > LIMITS.repeatCount)
                throw new AkariError('R413', 'くり返す 回数は 0、1、2 のような 数に します。マイナスや 小数、大きすぎる 数は 使えません');
              for (let i = 0; i < count; i++) {
                yield* calculationCheckpoint(budget);
                try {
                  (yield* execFunctionNodesSteps(n.body, ctx, budget, loopDepth + 1));
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') break;
                  if (s instanceof ScriptSignal && s.kind === 'continue') continue;
                  throw s;
                }
              }
              break;
            }
            case 'RepeatWhile':
              while (bool((yield* evalExpressionSteps(n.condition, ctx, budget)))) {
                try {
                  (yield* execFunctionNodesSteps(n.body, ctx, budget, loopDepth + 1));
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') break;
                  if (s instanceof ScriptSignal && s.kind === 'continue') continue;
                  throw s;
                }
              }
              break;
            case 'RepeatUntil':
              while (!bool((yield* evalExpressionSteps(n.condition, ctx, budget)))) {
                try {
                  (yield* execFunctionNodesSteps(n.body, ctx, budget, loopDepth + 1));
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') break;
                  if (s instanceof ScriptSignal && s.kind === 'continue') continue;
                  throw s;
                }
              }
              break;
            case 'Forever':
              for (;;) {
                yield* calculationCheckpoint(budget);
                try {
                  (yield* execFunctionNodesSteps(n.body, ctx, budget, loopDepth + 1));
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') break;
                  if (s instanceof ScriptSignal && s.kind === 'continue') continue;
                  throw s;
                }
              }
              break;
            case 'ForEach': {
              const arr = (yield* evalExpressionSteps(n.list, ctx, budget));
              if (!Array.isArray(arr))
                throw new AkariError('R411', '「それぞれ」は リストに 使います');
              for (const v of deepCopy(arr)) {
                yield* calculationCheckpoint(budget);
                const old = ctx.functionFrame.locals.has(n.binder)
                    ? ctx.functionFrame.locals.get(n.binder)
                    : undefined,
                  had = ctx.functionFrame.locals.has(n.binder);
                ctx.functionFrame.locals.set(n.binder, deepCopy(v));
                try {
                  (yield* execFunctionNodesSteps(n.body, ctx, budget, loopDepth + 1));
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') {
                    if (had) ctx.functionFrame.locals.set(n.binder, old);
                    else ctx.functionFrame.locals.delete(n.binder);
                    break;
                  }
                  if (!(s instanceof ScriptSignal && s.kind === 'continue')) throw s;
                }
                if (had) ctx.functionFrame.locals.set(n.binder, old);
                else ctx.functionFrame.locals.delete(n.binder);
              }
              break;
            }
            case 'Break':
              throw new ScriptSignal('break');
            case 'Continue':
              throw new ScriptSignal('continue');
            case 'ReturnStatement': {
              const s = new ScriptSignal('return');
              s.value = (yield* evalExpressionSteps(n.value, ctx, budget));
              throw s;
            }
            default:
              throw new AkariError('S305', '計算ではこの命令を使えません');
          }
        } catch (err) {
          if (err instanceof AkariError && !err.akariSource) {
            if (!err.line) {
              err.line = n.sourceSpan?.startLine || 1;
              err.column = n.sourceSpan?.startColumn || 1;
            }
            err.akariSource = { key: `function:${ctx.functionFrame.id}` };
          }
          throw err;
        }
      }
    }
    function* execListMutationSteps(n, ctx, budget = null) {
      const b = ctx.runtime.resolveBinding(n.target.name, n.target.qualifier, ctx);
      if (!b || !b.set) throw new AkariError('S301', 'リストが ありません');
      const arr = b.get();
      if (!Array.isArray(arr)) throw new AkariError('R411', 'これは リストに 使う ブロックです');
      if (n.kind === 'ListClear') {
        b.set([]);
        return;
      }
      const idx = n.index ? integerIndex((yield* evalExpressionSteps(n.index, ctx, budget))) : null;
      if (n.kind === 'ListAppend') {
        const v = assertRuntimeValueLimit((yield* evalExpressionSteps(n.value, ctx, budget)));
        if (!scalar(v)) throw new AkariError('R411', 'リストへ 入れられるのは 数・文字・あてはまる／あてはまらない です');
        if (arr.length >= LIMITS.listItems) throw new AkariError('R413', 'リストが 長すぎます');
        arr.push(deepCopy(v));
      } else if (n.kind === 'ListInsert') {
        if (idx > arr.length + 1) throw new AkariError('R404', 'リストに 入れる 番号が 大きすぎます。番号を たしかめて ください');
        const v = assertRuntimeValueLimit((yield* evalExpressionSteps(n.value, ctx, budget)));
        if (!scalar(v)) throw new AkariError('R411', 'リストへ 入れられるのは 数・文字・あてはまる／あてはまらない です');
        if (arr.length >= LIMITS.listItems) throw new AkariError('R413', 'リストが 長すぎます');
        arr.splice(idx - 1, 0, deepCopy(v));
      } else if (n.kind === 'ListReplace') {
        if (idx > arr.length) throw new AkariError('R404', 'おきかえる 番号の ものが リストに ありません');
        const v = assertRuntimeValueLimit((yield* evalExpressionSteps(n.value, ctx, budget)));
        if (!scalar(v)) throw new AkariError('R411', 'リストへ 入れられるのは 数・文字・あてはまる／あてはまらない です');
        arr[idx - 1] = deepCopy(v);
      } else if (n.kind === 'ListDelete') {
        if (idx > arr.length) throw new AkariError('R404', 'けす 番号の ものが リストに ありません');
        arr.splice(idx - 1, 1);
      }
      b.set(arr);
    }

    // Loop pacing (EventScheduler.paceTurn): the loop frames whose turns are paced, and the statements that change the
    // screen (moving and turning, looks, text and backdrop, the pen and stamps, speech).
    const PACED_LOOP_FRAMES = new Set(['repeatCount', 'forever', 'foreach', 'while', 'until']);
    // Events that can start a body after every flow has ended: input from outside the work, and 名人's conditions and
    // intervals. The other events (start, signals, a backdrop change, a copy, a touch) start only from a running flow.
    const RESTARTING_EVENTS = new Set(['click', 'keyDown', 'valueChanged', 'conditionTrue', 'interval']);
    const PACED_SCREEN_KINDS = new Set(['MotionCommand', 'LooksCommand', 'PenCommand', 'Say']);
    // How many こま a paced flow may be behind and still catch up (EventScheduler.nextFrameTime): 100 ms.
    const PACE_CATCH_UP = 6;
    // The sentences that never move, turn or show a part or change its look or size (EventScheduler.pollWatches): after
    // them, what touches what cannot have changed.
    const STILL_KINDS = new Set(['Assignment', 'NumericUpdate', 'ListAppend', 'ListInsert', 'ListReplace', 'ListDelete', 'ListClear',
      'LocalVariableDeclaration', 'LocalListDeclaration', 'Say', 'Ask', 'WaitTime', 'WaitUntil', 'Broadcast', 'BroadcastAndWait',
      'WaitBroadcastGroup', 'SoundCommand', 'PenCommand', 'TimerReset', 'CommentLine', 'ReturnStatement', 'IfStatement', 'RepeatCount',
      'Forever', 'ForEach', 'RepeatWhile', 'RepeatUntil']);
    // The sentences that move or change only the part that does them (its subject), but for the ops that change another.
    const OWN_PART_KINDS = new Set(['MotionCommand', 'LooksCommand']);
    const OTHER_PART_OPS = new Set(['SET_TARGET_TEXT', 'SET_INPUT']);
