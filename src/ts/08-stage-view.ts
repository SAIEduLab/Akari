import type { Component, Costume } from '../types/project.d.ts';
import type { RuntimeValue } from '../types/runtime.d.ts';
import type { AkariCore, EventScheduler, ImageBackdrop, InputNode, PartNode, Rect, Shown, StageViewOptions, Thrown } from '../types/view.d.ts';
// ────────────────────────────────────────────────────────────────────────
// 08 — The stage view: draws a running work. Portable: the exported player embeds it (08-stage-and-export.ts).
// ────────────────────────────────────────────────────────────────────────
export function createAkariStageView(core: AkariCore, options: StageViewOptions) {
  'use strict';
  const { LIMITS, clamp } = core,
    { form, canvas } = options,
    // (the pen canvas has no other kind of context, so it has a 2d one)
    pen = canvas.getContext('2d')!,
    listeners: (() => void)[] = [],
    timers = new Set<ReturnType<typeof setTimeout>>(),
    physicalKeys = new Map<string, string>(),
    heldPhysicalKeys = new Map<string, string>();
  let clickTargetScheduler: EventScheduler | null=null,runtimeClickTargets=new Set<string>();
  const project = () => options.getProject(),
    runtime = () => options.getRuntime(),
    scheduler = () => options.getScheduler();
  const allowed = () =>
    !!runtime() &&
    !!scheduler()?.running &&
    // (running: there is a scheduler; below, scheduler()! after allowed() is the same one)
    !scheduler()!.paused &&
    (options.canInteract?.() ?? true);
  // The browser calls fn with the event of that type (DocumentEventMap names the event of each type used here).
  const on = <K extends keyof DocumentEventMap>(target: EventTarget, type: K, fn: (event: DocumentEventMap[K]) => void, opts?: AddEventListenerOptions) => {
    target.addEventListener(type, fn as EventListener, opts);
    listeners.push(() => target.removeEventListener(type, fn as EventListener, opts));
  };
  const dispatch: <T>(fn: () => T) => T | undefined = (fn) => {
    try {
      return fn();
    } catch (e) {
      options.onError?.(e as Thrown);
    }
  };
  const record: (c: Component, a?: Shown) => Costume | null = (c, a) =>
    c.type === 'sprite'
      ? c.costumes.find((x) => x.id === (a?.costumeId ?? c.costumeId)) || null
      : null;
  const text: (c: Component, a?: Shown) => string = (c, a) =>
    c.type === 'sprite'
      ? record(c, a)?.kind === 'text'
        // (the record of the same part and actor, of kind text)
        ? (record(c, a) as Extract<Costume, { kind: 'text' }>).value
        : c.text
      : (a?.text ?? c.text);
  function limitInputValue(input: HTMLInputElement) {
    const v = input.value;
    if (v.length > LIMITS.stringChars) {
      const chars = Array.from(v);
      if (chars.length > LIMITS.stringChars)
        input.value = chars.slice(0, LIMITS.stringChars).join('');
    }
    return input.value;
  }
  function clearInput() {
    physicalKeys.clear();
    const r = runtime();
    if (r) {
      // (the same scheduler as the test just before)
      if (scheduler()) scheduler()!.releaseInput();
      else { r.pressedKeys.clear(); r.mouseDown = false; }
    }
  }
  // The stage is in the page (the editor's frame, or the player's box), so it and what holds it have a parent.
  const scaleTarget = form.parentElement!.id === 'formFrame' ? form.parentElement! : form;
  const scaleParent = scaleTarget.parentElement!,
    viewport = document.createElement('div');
  viewport.className = 'stage-viewport';
  Object.assign(viewport.style, {
    position: 'relative',
    overflow: 'hidden',
    flex: 'none',
    maxWidth: options.getScale ? 'none' : '100%',
    margin: '0 auto',
  });
  scaleParent.insertBefore(viewport, scaleTarget);
  viewport.appendChild(scaleTarget);
  Object.assign(scaleTarget.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    margin: '0',
    transformOrigin: 'top left',
  });
  function fitStage() {
    if (options.getScale && (!scaleParent.clientWidth || !scaleParent.clientHeight)) return;
    const p = project(),
      style = getComputedStyle(scaleParent),
      available = options.availableWidth ? options.availableWidth() :
        scaleParent.clientWidth -
        parseFloat(style.paddingLeft || 0) -
        parseFloat(style.paddingRight || 0);
    const width = p.stage.width + (scaleTarget === form ? 0 : 6);
    scaleTarget.style.width = width + 'px';
    const height = scaleTarget.offsetHeight;
    const scale = options.getScale
      ? options.getScale({
          width,
          height,
          availableWidth: available,
          availableHeight: scaleParent.clientHeight -
            parseFloat(style.paddingTop || 0) - parseFloat(style.paddingBottom || 0),
        })
      : Math.min(1, Math.max(1, available) / width,
          options.availableHeight ? Math.max(1, options.availableHeight()) / height : 1);
    scaleTarget.style.transform = 'scale(' + scale + ')';
    viewport.style.width = width * scale + 'px';
    viewport.style.height = height * scale + 'px';
    options.onFit?.(scale);
  }
  const resizeObserver =
    typeof ResizeObserver === 'function' ? new ResizeObserver(fitStage) : null;
  resizeObserver?.observe(scaleParent);
  on(window, 'resize', fitStage);
  function renderStage() {
    const p = project(),
      r = runtime();
    form.style.width = p.stage.width + 'px';
    form.style.height = p.stage.height + 'px';
    // While a work runs, a finger on the screen is the mouse wherever it starts: it does not scroll the page, and a
    // sideways swipe does not go back to the page before. On the edit screen and in a player before ▶ the page still
    // scrolls in both directions (and zooms) under a finger on the screen; overscroll containment keeps a sideways
    // swipe from leaving the page.
    // 開いたら すぐに 動かす keeps the work at its own size, so there (runTouch: 'pinch-zoom') two fingers on the
    // running screen zoom and move the page to reach a part the window cuts off; one finger is still the mouse.
    const touch = r ? options.runTouch || 'none' : 'pan-x pan-y pinch-zoom';
    if (form.style.touchAction !== touch) {
      form.style.touchAction = touch;
      form.style.overscrollBehavior = r ? 'none' : 'auto';
    }
    if (canvas.width !== p.stage.width) canvas.width = p.stage.width;
    if (canvas.height !== p.stage.height) canvas.height = p.stage.height;
    const b =
      p.stage.backdrops.find((x) => x.id === (r?.stage.backdropId || p.stage.backdropId)) ||
      p.stage.backdrops[0];
    // The editor's 作る画面 and 動かす画面 draw the dots over the backdrop on every 10 steps from the bottom-left corner,
    // at any screen height: a ruler for the frame. An exported work (dots: false) shows only its backdrop.
    const dots = options.dots === false ? null : 'radial-gradient(rgba(94,126,168,.24) 1px,transparent 1px)',
      url = b.kind === 'color' ? null : options.imageUrl(b.assetId),
      layers = [dots && [dots, 'repeat', 'left -5px bottom -5px', '10px 10px'],
        // (a url only for an image backdrop)
        url && [`url("${url}")`, 'no-repeat', 'center', (b as ImageBackdrop).fit === 'stretch' ? '100% 100%' : (b as ImageBackdrop).fit]].filter(Boolean);
    form.style.backgroundColor = b.kind === 'color' ? b.value : b.fill;
    form.style.backgroundImage = layers.length ? layers.map(x => x[0]).join(', ') : 'none';
    form.style.backgroundRepeat = layers.length ? layers.map(x => x[1]).join(', ') : 'no-repeat';
    form.style.backgroundPosition = layers.length ? layers.map(x => x[2]).join(', ') : 'center';
    form.style.backgroundSize = layers.length ? layers.map(x => x[3]).join(', ') : 'auto';
    fitStage();
  }
  function positionBubbles() {
    const rect = form.getBoundingClientRect(),
      sx = rect.width / form.clientWidth || 1,
      sy = rect.height / form.clientHeight || 1;
    const bubbles=[...form.querySelectorAll<HTMLElement>('.sprite-bubble')],placed: Rect[]=[],overlap=(a: Rect,b: Rect)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    const actors=[...form.querySelectorAll<HTMLElement>('.component')].filter(n=>n.style.display!=='none').map(n=>{const r=n.getBoundingClientRect();return {left:(r.left-rect.left)/sx,right:(r.right-rect.left)/sx,top:(r.top-rect.top)/sy,bottom:(r.bottom-rect.top)/sy};});
    const bands = actors.length ? [{ top:0, height:Math.min(...actors.map(a=>a.top)) },
        { top:Math.max(...actors.map(a=>a.bottom)), height:form.clientHeight-Math.max(...actors.map(a=>a.bottom)) }] : [];
    // Use the same DOM font layout as the visible heading, including fractional glyph widths.
    const textWidth = (value: string, style: CSSStyleDeclaration) => {
      const measure = document.createElement('span');
      Object.assign(measure.style, {position:'fixed',visibility:'hidden',whiteSpace:'pre',font:style.font,letterSpacing:style.letterSpacing});
      measure.textContent=value; document.body.append(measure);
      const width=measure.getBoundingClientRect().width; measure.remove(); return width;
    };
    const widths = bubbles.map(b => {
      b.style.fontSize=14/sx+'px';
      const full=b.querySelector<HTMLElement>('[data-speech-full]');
      if(full)full.style.fontSize=11/sx+'px';
      const heading=getComputedStyle(b,'::before'),body=getComputedStyle(b);
      return {name:b.dataset.showSpeaker==='false'?0:textWidth(b.dataset.speaker||'',heading),body:textWidth(b.querySelector<HTMLElement>('.sprite-bubble-text')?.textContent||'',body),
        full:full?textWidth(full.dataset.label||'',getComputedStyle(full)):0,
        lineHeight:Math.max(parseFloat(heading.lineHeight),parseFloat(body.lineHeight))*sy};
    });
    const short=bubbles.length&&bubbles.every(b=>!/[\r\n]/.test(b.querySelector<HTMLElement>('.sprite-bubble-text')?.textContent||'')&&b.querySelector<HTMLElement>('[data-speech-full]')?.dataset.always!=='true');
    const compactColumns=rect.height<54&&short&&rect.width>=bubbles.length*Math.max(...widths.map(w=>Math.max(w.name,w.body)*sx+4))+(bubbles.length-1);
    const compactRows=rect.height<54&&short&&!compactColumns&&
      rect.width>=Math.max(...widths.map(w=>(Math.ceil(w.name)+w.body)*sx+0.75))&&
      rect.height>=bubbles.length*(Math.max(...widths.map(w=>w.lineHeight))+0.5)+(bubbles.length-1);
    // When the utterance itself cannot fit, keep each name and its full-text
    // entry in a separate row inside the preview instead of stacking tall bubbles.
    const compactFullRows=rect.height<54&&!compactColumns&&!compactRows&&bubbles.length&&
      rect.width>=Math.max(...widths.map(w=>(w.name+w.full)*sx+7))&&
      rect.height>=bubbles.length*17.5+(bubbles.length-1);
    const compact=compactColumns||compactRows||compactFullRows;
    const band = compact ? {top:0,height:form.clientHeight}
      : bubbles.length > 1 && rect.width >= bubbles.length*80+(bubbles.length-1)*8
        ? bands.filter(b=>b.height*sy>=42).sort((a,b)=>b.height-a.height)[0] : null;
    form.querySelectorAll<HTMLElement>('.sprite-bubble').forEach((b, bubbleIndex) => {
      // (showBubble gives every bubble the runtime id of its speaker)
      const id = b.dataset.runtimeId!,
        node = form.querySelector<HTMLElement>(`[data-runtime-id="${CSS.escape(id)}"].component`);
      if (!runtime()?.actor(id) || !node || node.style.display === 'none') {
        b.remove();
        return;
      }
      const box = node.getBoundingClientRect(), gap = 8 / sx,
        actor = {left:(box.left-rect.left)/sx, right:(box.right-rect.left)/sx,
          top:(box.top-rect.top)/sy, bottom:(box.bottom-rect.top)/sy},
        sideWidth = Math.max(actor.left-gap, form.clientWidth-actor.right-gap),
        availableWidth = sideWidth >= 80/sx ? sideWidth : form.clientWidth;
      b.style.fontSize = 14/sx+'px'; b.style.padding = (compactRows||compactFullRows?0:band?1.5:8)/sy+'px '+(compactRows||compactFullRows?0:compact?1:band?6:10)/sx+'px';
      b.style.borderWidth = compact ? (compactRows||compactFullRows?0.25:0.5)/sx+'px' : '';
      const showName=b.dataset.showSpeaker!=='false';
      b.style.display=compactRows&&showName?'grid':'';
      b.style.minHeight=compactFullRows&&!showName?17.5/sy+'px':'';
      b.style.alignItems=compactRows?'start':'';
      b.style.width=compactRows||compactFullRows?form.clientWidth+'px':'';
      b.style.gridTemplateColumns=compactRows?Math.ceil(widths[bubbleIndex].name)+'px minmax(0,1fr)':'';
      b.style.columnGap=compactRows?0.25/sx+'px':'';
      b.style.setProperty('--speech-heading-gap',compactRows?'0px':'3px');
      b.style.setProperty('--speech-heading-height', showName&&(compactFullRows||band&&!compact) ? 17/sy+'px' : '0px');
      const bandWidth = compactRows||compactFullRows?form.clientWidth:(form.clientWidth-(bubbles.length-1)*(compact?1:8)/sx)/Math.max(1,bubbles.length);
      b.style.maxWidth = Math.min(320/sx,band?bandWidth:availableWidth)+'px';
      const heightBudget=band ? Math.min(160/sy,band.height-1/sy) : Math.min(160/sy,Math.max(54/sy,(form.clientHeight-(bubbles.length-1)*8/sy)/Math.max(1,bubbles.length)));
      b.style.maxHeight = 'none';
      const text = b.querySelector<HTMLElement>('.sprite-bubble-text');
      const full = b.querySelector<HTMLElement>('[data-speech-full]');
      if (full) {
        // The full-text entry shares the speaker row rather than consuming the
        // one readable line available in a small preview.
        Object.assign(full.style, { position:'absolute', top:(compactFullRows?0:band?2:4)/sy+'px', right:(compactFullRows?0.25:4)/sx+'px',
          fontSize:11/sx+'px', lineHeight:'1.2', padding:(compactFullRows?1:2)/sy+'px '+(compactFullRows?1:4)/sx+'px', minHeight:'0' });
      }
      if (text) {
        // At enlarged stage scales, the small logical font can have rounded
        // glyph metrics taller than its original line box. Keep the glyphs whole.
        text.style.lineHeight = sy > 1 ? '1.5' : '';
        text.style.display = compactFullRows ? 'none' : 'block';
      }
      const bubbleStyle = getComputedStyle(b), edges = bubbleStyle.boxSizing === 'border-box'
        // (k is one of the four names in the list)
        ? ['paddingLeft','paddingRight','borderLeftWidth','borderRightWidth'].reduce((n,k)=>n+(parseFloat(bubbleStyle[k as 'paddingLeft' | 'paddingRight' | 'borderLeftWidth' | 'borderRightWidth'])||0),0) : 0;
      const fitText = () => {
        const reserve=full&&!full.hidden?Math.max(0,full.getBoundingClientRect().width/sx+parseFloat(full.style.right)-(parseFloat(bubbleStyle.paddingRight)||0)-(parseFloat(bubbleStyle.borderRightWidth)||0)+4/sx):0;
        b.style.setProperty('--speech-full-space',reserve+'px');
        if(text)text.style.marginRight=showName?'0px':reserve+'px';
        b.style.minWidth=compactRows||compactFullRows?'0px':Math.min(parseFloat(b.style.maxWidth),
          Math.max(compact?0:40/sx,Math.ceil(widths[bubbleIndex].name+reserve+edges+1/sx)))+'px';
        if (text) {
          text.style.maxHeight='0px';
          const chromeHeight=b.getBoundingClientRect().height/sy;
          text.style.maxHeight=Math.min(100/sy,Math.max(19/sy,heightBudget-chromeHeight))+'px';
        }
      };
      // Check clipping with the current heading, then reserve the actual full-text button.
      if (full) full.hidden=!compactFullRows&&full.dataset.always!=='true';
      fitText();
      // Compact layouts have already budgeted one complete line and measured
      // its width. Font em-box overflow can extend scrollHeight beyond that
      // line without clipping a glyph; reserving a button would wrap the name.
      if (full&&full.hidden&&text&&((!compact&&text.scrollHeight>text.clientHeight+1)||text.scrollWidth>text.clientWidth+1)) {full.hidden=false;fitText();}
      const measured=b.getBoundingClientRect(),width=measured.width/sx,height=measured.height/sy, center=(actor.left+actor.right-width)/2,
        positions=[[actor.right+gap,actor.top],[actor.left-width-gap,actor.top],
           [center,actor.top-height-gap],[center,actor.bottom+gap]];
      for(const old of placed)positions.push([center,old.bottom+gap],[center,old.top-height-gap],[old.right+gap,actor.top],[old.left-width-gap,actor.top]);
      const candidates=positions.map(([left,top],order)=>{
        left=clamp(left,0,Math.max(0,form.clientWidth-width));top=clamp(top,0,Math.max(0,form.clientHeight-height));
        const candidate={left,top,right:left+width,bottom:top+height},cost=actors.reduce((sum,a)=>sum+overlap(candidate,a),0)+placed.reduce((sum,b)=>sum+overlap(candidate,b)*10,0);
        return {...candidate,overlap:cost,order};
      }).sort((a,b)=>a.overlap-b.overlap||a.order-b.order);
      // (placed.length: there is a last one)
      const chosen = compactRows||compactFullRows ? {left:0,top:placed.length?placed.at(-1)!.bottom+1/sy:0,right:width,bottom:(placed.length?placed.at(-1)!.bottom+1/sy:0)+height}
        : band ? { left:bubbleIndex*(bandWidth+(compact?1:8)/sx)+(bandWidth-width)/2, top:band.top,
        right:bubbleIndex*(bandWidth+(compact?1:8)/sx)+(bandWidth+width)/2, bottom:band.top+height } : candidates[0];
      b.style.left=chosen.left+'px'; b.style.top=chosen.top+'px'; placed.push(chosen);
    });
  }
  function renderComponents() {
    const p = project(),
      r = runtime(),
      q = scheduler(),
      nodes = new Map(
        [...form.querySelectorAll<HTMLElement>('.component')].map((n) => [n.dataset.runtimeId, n]),
      );
    // Compiled click bodies stay fixed during one run. Reuse the set across
    // paints and clones rather than rescan all scripts for every actor/frame.
    if(clickTargetScheduler!==q){
      clickTargetScheduler=q;runtimeClickTargets=new Set();
      if(q)for(const component of p.components){
        if((q.matchingScripts(component.id,'click',{})||[]).some(script=>q.hasExecutable(q.scriptAst(component.id,'click',script.id))))runtimeClickTargets.add(component.id);
      }
    }
    const actors = r
      ? [...r.actors.values()].sort((a, b) => a.z - b.z)
      : p.components.map((c, i) => ({
          ...c,
          runtimeId: c.id,
          baseId: c.id,
          z: i,
          inputValue: c.text,
          color: null,
        }));
    for (const [i, a] of actors.entries()) {
      const c = p.components.find((x) => x.id === a.baseId);
      if (!c) continue;
      let existing: PartNode | null | undefined = nodes.get(a.runtimeId);
      if (existing && existing.tagName !== (c.type === 'input' ? 'INPUT' : 'DIV')) {
        existing.remove();
        existing = null;
      }
      const node: PartNode = existing || document.createElement(c.type === 'input' ? 'input' : 'div');
      nodes.delete(a.runtimeId);
      node.className = `component ak-${c.type}`;
      node.dataset.id = c.id;
      node.dataset.runtimeId = a.runtimeId;
      if (c.type !== 'input') {
        const interactive = !!r && (c.type === 'button' || runtimeClickTargets.has(c.id));
        node.tabIndex = interactive ? 0 : -1;
        if (interactive) {
          node.setAttribute('role', 'button');
          node.setAttribute('aria-label', c.name);
        } else {
          node.removeAttribute('role');
          node.removeAttribute('aria-label');
        }
      }

      // The stored place is the centre from the bottom-left (y up); the screen measures from the top-left.
      Object.assign(node.style, {
        left: a.x - c.w / 2 + 'px',
        top: p.stage.height - a.y - c.h / 2 + 'px',
        width: c.w + 'px',
        height: c.h + 'px',
        color: a.color || c.fg,
        backgroundColor: c.bg || 'transparent',
        backgroundImage: 'none',
        fontSize: c.fontSize + 'px',
        zIndex: String(2 + i),
        display: a.visible ? (c.type === 'input' ? 'block' : 'flex') : 'none',
        transform: `rotate(${-a.direction}deg) scale(${a.scalePercent / 100})`,
      });
      // An input part's node is an input: made as one, or kept only when its tag is INPUT (above).
      if (c.type === 'input') {
        if (Number.isSafeInteger(LIMITS.stringChars * 2) && LIMITS.stringChars * 2 <= 2147483647) (node as InputNode).maxLength = LIMITS.stringChars * 2; else node.removeAttribute('maxlength');
        (node as InputNode).readOnly = !r;
        node.setAttribute('aria-label', c.name);
        const v = r ? a.inputValue : c.text;
        if (!node._composing && (node as InputNode).value !== v) (node as InputNode).value = v;
        if (!existing) {
          node.addEventListener('compositionstart', () => (node._composing = true));
          node.addEventListener('compositionend', () => {
            node._composing = false;
            node.dispatchEvent(new Event('input'));
          });
          node.addEventListener('input', () => {
            if (node._composing) return;
            // (every node has the ids given above)
            const actor = runtime()?.actor(node.dataset.runtimeId!);
            if (!actor) return;
            if (!allowed()) {
              (node as InputNode).value = actor.inputValue;
              return;
            }
            const old = actor.inputValue,
              nv = limitInputValue(node as InputNode);
            if (old !== nv) {
              scheduler()!.inputBoundary(() => { actor.inputValue = nv; });
              dispatch(() =>
                scheduler()!.spawnForRuntime(actor.runtimeId, 'valueChanged', {
                  oldValue: old,
                  newValue: nv,
                }),
              );
              options.onInputChanged?.();
            }
          });
        }
      } else {
        const co = record(c, a);
        if (c.type === 'sprite' && co?.kind === 'image') {
          const url = options.imageUrl(co.assetId);
          let img = node.querySelector<HTMLImageElement>('img.costume-img');
          if (!img) {
            node.textContent = '';
            img = document.createElement('img');
            img.className = 'costume-img';
            img.alt = '';
            node.appendChild(img);
          }
          if (img.getAttribute('src') !== url) img.src = url;
        } else if (node.textContent !== text(c, a) || node.firstElementChild)
          node.textContent = text(c, a);
      }
      if (!r && c.id === options.selectedId?.()) node.classList.add('design-selected');
      // (every node has the ids given above)
      if (!existing) {
        node.addEventListener('pointerdown', (e) => {
          if (!runtime() && e.button === 0 && e.isPrimary !== false)
            options.onDesignPointer?.(e, node.dataset.id!);
        });
        node.addEventListener('click', (e) => {
          e.stopPropagation();
          // A part pressed with the mouse or a finger does not keep the keys: 空白 and Enter stay the work's keys (only a
          // part chosen with Tab is pressed with them). An input field keeps the keys: they are typed into it.
          if (e.detail && runtime() && c.type !== 'input') { if (form.tabIndex >= 0) form.focus({ preventScroll: true }); else node.blur(); }
          if (allowed())
            if(options.onRuntimeClick?.(node.dataset.runtimeId!)!==false)dispatch(() => scheduler()!.spawnForRuntime(node.dataset.runtimeId!, 'click', {}));
        });
        node.addEventListener('keydown', (e) => {
          if (
            node.getAttribute('role') !== 'button' ||
            !allowed() ||
            e.isComposing ||
            e.keyCode === 229 ||
            !['Enter', ' '].includes(e.key)
          )
            return;
          e.preventDefault();
          e.stopPropagation();
          if (!e.repeat)
            if(options.onRuntimeClick?.(node.dataset.runtimeId!)!==false)dispatch(() => scheduler()!.spawnForRuntime(node.dataset.runtimeId!, 'click', {}));
        });
        form.appendChild(node);
      }
    }
    for (const node of nodes.values()) node.remove();
    positionBubbles();
  }
  function render() {
    renderStage();
    renderComponents();
    fitStage();
  }
  function clearSpeech(id: string) {
    for (const bubble of form.querySelectorAll<HTMLElement>('.sprite-bubble')) if (bubble.dataset.runtimeId === id) bubble.remove();
  }
  function showBubble(id: string, value: RuntimeValue, actualValue: RuntimeValue = value, controlled = false) {
    const presentation = core.displayValue(actualValue);
    value = presentation.text;
    const details = { ...presentation, value: actualValue };
    if (id === 'stage') {
      options.onStageMessage?.(value, details);
      return;
    }
    const node = form.querySelector<HTMLElement>(`[data-runtime-id="${CSS.escape(id)}"].component`);
    if (!node) {
      options.onStageMessage?.(value, details);
      return;
    }
    for (const b of form.querySelectorAll<HTMLElement>('.sprite-bubble'))
      if (b.dataset.runtimeId === id) b.remove();
    const b = document.createElement('div');
    b.className = 'sprite-bubble';
    b.dataset.runtimeId = id;
    b.dataset.showSpeaker = String(project().stage.showSpeechNames !== false);
    b.style.zIndex = '2000';
    b.dataset.speaker=project().components.find(c=>c.id===runtime()?.actor(id)?.baseId)?.name||project().components.find(c=>c.id===id)?.name||'話している人';
    // Keep the speaker and value from this utterance together, even after it changes or clears.
    const speaker = b.dataset.speaker,
      speakerLabel = runtime()?.actor(id)?.isClone ? `${speaker}（コピー）` : speaker;
    b.setAttribute('aria-label',b.dataset.speaker+'：'+value);
    const text = document.createElement('span');
    text.className = 'sprite-bubble-text'; text.textContent = value;
    text.style.display = 'block'; text.style.overflow = 'hidden';
    b.appendChild(text);
    {
      const full = document.createElement('button');
      full.dataset.speechFull = 'true';
      full.dataset.always = String(presentation.rounded || Array.from(value).length > 80 || /[\r\n]/.test(value));
      full.hidden = full.dataset.always !== 'true';
      full.type = 'button';
      full.dataset.label = presentation.rounded ? 'もとの 数' : '全部';
      full.setAttribute('aria-label', presentation.rounded ? '数を 短くして 見せて いるよ。もとの 数を 見る' : 'ふきだしの 文を ぜんぶ 見る');
      full.style.pointerEvents = 'auto';
      full.onclick = e => { e.stopPropagation(); options.onValueDetails?.(actualValue, speakerLabel); };
      b.appendChild(full);
    }
    form.appendChild(b);
    positionBubbles();
    if (controlled) return;
    const timer = setTimeout(() => {
      b.remove();
      timers.delete(timer);
    }, 1600);
    timers.add(timer);
  }
  // Pen points are centres in the child frame (y up).
  function penLine(x1: number, y1: number, x2: number, y2: number, color: string, size: number) {
    const height = project().stage.height;
    pen.beginPath();
    pen.moveTo(x1, height - y1);
    pen.lineTo(x2, height - y2);
    pen.lineWidth = size;
    pen.lineCap = 'round';
    pen.strokeStyle = color;
    pen.stroke();
  }
  function clearPen() {
    pen.clearRect(0, 0, canvas.width, canvas.height);
  }
  function stamp(id: string) {
    const r = runtime(),
      a = r?.actor(id),
      c = r?.component(id);
    if (!a || !c) return;
    pen.save();
    try {
      // (a is an actor of r)
      const box = r!.aabb(a);
      pen.translate(box.cx, project().stage.height - box.cy);
      pen.rotate((-a.direction * Math.PI) / 180);
      pen.scale(a.scalePercent / 100, a.scalePercent / 100);
      const co = record(c, a);
      if (c.type === 'sprite' && co?.kind === 'image') {
        const img = options.getImage(co.assetId);
        if (img) {
          pen.drawImage(img, -c.w / 2, -c.h / 2, c.w, c.h);
        }
      } else {
        pen.fillStyle = a.color || c.fg;
        pen.font = `${c.fontSize}px sans-serif`;
        pen.textAlign = 'center';
        pen.textBaseline = 'middle';
        pen.fillText(text(c, a), 0, 0);
      }
    } finally {
      pen.restore();
    }
  }
  function clear() {
    clearInput();
    clearPen();
    keepBubbles();
    form.querySelectorAll<HTMLElement>('.sprite-bubble').forEach((b) => b.remove());
  }
  // The run has ended and its last picture stays: a ふきだし shown without a time stays instead of going away.
  function keepBubbles() {
    for (const t of timers) clearTimeout(t);
    timers.clear();
  }
  // (called only while allowed)
  function point(e: PointerEvent) {
    const r = runtime(),
      p = project(),
      rect = form.getBoundingClientRect();
    if (!r || !rect.width || !rect.height) return;
    // Within the screen (よこ0〜はば・たて0〜高さ), also for a finger dragged on past the edge (the part keeps the pointer).
    scheduler()!.inputBoundary(() => {
      r.mouseX = Math.min(p.stage.width, Math.max(0, Math.round(((e.clientX - rect.left) * p.stage.width) / rect.width)));
      r.mouseY = Math.min(p.stage.height, Math.max(0, Math.round(((rect.bottom - e.clientY) * p.stage.height) / rect.height)));
    });
  }
  on(form, 'pointerdown', (e) => {
    if (e.isPrimary === false || e.button !== 0) return;
    if (allowed()) {
      point(e);
      scheduler()!.inputBoundary(() => { runtime()!.mouseDown = true; });
    } else if (!runtime() && e.target === form) options.onDesignStage?.(e);
  });
  on(form, 'pointermove', (e) => {
    if (e.isPrimary !== false && allowed()) point(e);
  });
  // A runtime is without a scheduler only inside one step (a start that fails, a stop), where no pointer event comes.
  const release: (e: PointerEvent) => void = (e) => {
    if (e.isPrimary !== false && runtime())
      scheduler()!.inputBoundary(() => { runtime()!.mouseDown = false; });
  };
  on(window, 'pointerup', release);
  on(window, 'pointercancel', release);
  on(form, 'click', (e) => {
    if (e.target === form && allowed())
      dispatch(() => scheduler()!.spawnForRuntime('stage', 'click', {}));
  });
  const keyName: (e: KeyboardEvent) => string = (e) =>
    ({
      ArrowUp: '\u4e0a',
      ArrowDown: '\u4e0b',
      ArrowLeft: '\u5de6',
      ArrowRight: '\u53f3',
      ' ': '\u7a7a\u767d',
      Enter: '\u6c7a\u5b9a',
      Escape: '\u53d6\u6d88',
    } as Partial<Record<string, string>>)[e.key] ??
    // A letter is its key with Shift or CapsLock too (「A」 reads as the 「a」 key), and a digit key giving a digit (a
    // full-width one too) is that digit; with Shift it gives its sign (「!」), which is that sign's key.
    (/^Digit\d$/.test(e.code) && /^[0-9０-９]$/.test(e.key) ? e.code.slice(5) : /^[A-Z]$/.test(e.key) ? e.key.toLowerCase() : e.key);
  // The name a key's press set is cleared by that key's release, whatever the key is called by then.
  const releaseKey = (physical: string, fallback?: string) => {
    const k = physicalKeys.get(physical) ?? fallback;
    physicalKeys.delete(physical);
    if (k !== undefined && ![...physicalKeys.values()].includes(k)) scheduler()?.setKeyState(k, false);
  };
  on(window, 'keydown', (e) => {
    if (
      e.isComposing ||
      e.keyCode === 229 ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      // (the target of a key is the window, the page or an element of it: only an element has closest)
      (e.target as Partial<Element>).closest?.('input,textarea,select,.modal,dialog')
    )
      return;
    if ((e.target as Partial<Element>).closest?.('button') && (e.key === ' ' || e.key === 'Enter')) return;
    const physical = e.code || e.key,
      // A held key keeps the name its press gave it: a repeat that comes under another Shift state (「1」 as 「!」) is
      // the same press.
      k = (e.repeat && heldPhysicalKeys.get(physical)) || keyName(e);
    heldPhysicalKeys.set(physical, k);
    if (!allowed()) return;
    // (a new press of a key whose release was not seen ends the earlier press first)
    if (physicalKeys.has(physical) && physicalKeys.get(physical) !== k) releaseKey(physical);
    physicalKeys.set(physical, k);
    const freshPress = scheduler()!.setKeyState(k, true);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key))
      e.preventDefault();
    if (!e.repeat && freshPress) dispatch(() => scheduler()!.spawnDistributed('keyDown', { key: k }));
  });
  on(window, 'keyup', (e) => {
    const physical = e.code || e.key;
    heldPhysicalKeys.delete(physical);
    releaseKey(physical, keyName(e));
  });
  on(window, 'blur', () => { heldPhysicalKeys.clear(); clearInput(); scheduler()?.pause(); });
  on(document, 'visibilitychange', () => {
    if (document.hidden) { heldPhysicalKeys.clear(); clearInput(); scheduler()?.pause(); }
  });
  return {
    render,
    fitStage,
    renderStage,
    renderComponents,
    positionBubbles,
    showBubble,
    clearSpeech,
    keepBubbles,
    limitInputValue,
    penLine,
    clearPen,
    stamp,
    clear,
    clearInput,
    seedHeldInput() {
      const r = runtime();
      if (!r) return;
      for (const [physical, key] of heldPhysicalKeys) {
        physicalKeys.set(physical, key); r.pressedKeys.add(key);
      }
    },
    destroy() {
      resizeObserver?.disconnect();
      clear();
      for (const off of listeners) off();
    },
  };
}
