  // ────────────────────────────────────────────────────────────────────────
  // 08 — Portable stage view and standalone export
  // ────────────────────────────────────────────────────────────────────────
  const AKARI_STAGE_CSS =
    ':root{\n    --bg:#edf2f8;\n    --panel:#f6f8fb;\n    --panel2:#ffffff;\n    --panel3:#e9eef6;\n    --surface:#ffffff;\n    --surface-2:#f8fbff;\n    --dark:#1f2937;\n    --muted:#5f6b7a;\n    --line:#c7d2df;\n    --line-strong:#a9b8ca;\n    --hilite:#ffffff;\n    --shadow:rgba(38,57,89,.14);\n    --shadow-strong:rgba(27,39,58,.22);\n    --title1:#315a96;\n    --title2:#5076b6;\n    --title3:#6f92cb;\n    --accent:#2f6fd6;\n    --accent-soft:#eaf2ff;\n    --accent-strong:#1f56b4;\n    --danger:#c43b3b;\n    --success:#1d7d44;\n    --code:#fbfcfe;\n    --console:#1d2430;\n    --console-fg:#eef3fb;\n    --select:#2f6fd6;\n    --radius-sm:7px;\n    --radius:10px;\n    --radius-lg:14px;\n  }\n#formSurface{\n    position:relative;width:640px;height:400px;overflow:hidden;background-color:#fff;\n    background-image:radial-gradient(rgba(94,126,168,.24) 1px,transparent 1px);\n    background-size:10px 10px;cursor:default\n  }\n#penCanvas{position:absolute;inset:0;z-index:1;pointer-events:none}\n.component{position:absolute;z-index:2;user-select:none;transform-origin:center center}\n.ak-label{display:flex;align-items:center;white-space:pre-wrap;overflow:hidden;padding:2px 4px}\n.ak-button{\n    display:flex;align-items:center;justify-content:center;\n    border:1px solid var(--line-strong);border-radius:8px;\n    background:linear-gradient(180deg,#ffffff 0%,#eaf1fb 100%);\n    padding:2px 8px;cursor:pointer;\n    box-shadow:0 1px 0 rgba(255,255,255,.8) inset,0 1px 3px rgba(24,36,54,.08)\n  }\n.ak-button:active{transform:translateY(1px)}\n.ak-input{border:1px solid var(--line-strong);border-radius:8px;background:#fff;padding:3px 8px}\n.ak-box{border:1px solid #c5d2e2;border-radius:10px;background:linear-gradient(180deg,#fbfcfe 0%,#eef3f8 100%)}\n.ak-sprite{display:flex;align-items:center;justify-content:center;font-size:34px;cursor:pointer;background:transparent;line-height:1}\n.sprite-bubble{overflow-wrap:anywhere;max-height:160px;overflow:hidden;\n    position:absolute;z-index:20;background:#fff;border:1px solid #b7c5d8;border-radius:12px;padding:6px 10px;\n    min-width:40px;max-width:180px;pointer-events:none;box-shadow:0 8px 18px rgba(48,67,97,.18);white-space:pre-wrap\n  }\n.costume-img{width:100%;height:100%;object-fit:fill;pointer-events:none;user-select:none}\n.component{touch-action:none}\n.component.ak-input{touch-action:auto}\n.sprite-bubble{font-size:13px}\n.sprite-bubble::before{content:attr(data-speaker);display:block;font-size:0.8em;margin-bottom:var(--speech-heading-gap,3px);margin-right:var(--speech-full-space,0px)}' + "\n.sprite-bubble [data-speech-full]::before { content:attr(data-label); }\n.sprite-bubble[data-show-speaker=\"false\"]::before{content:none;display:none}";
  const AKARI_PLAYER_CSS =
    '*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#edf2f8;color:#1f2937;font:14px "Yu Gothic UI","Yu Gothic","Meiryo",sans-serif}button,input{font:inherit}button{padding:7px 12px;background:#fff;border:1px solid #a9b8ca;border-radius:7px;cursor:pointer}button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible{outline:3px solid #2f6fd6;outline-offset:2px}#playerRoot{width:max-content;min-width:min(100%,640px);max-width:100%;margin:0 auto;padding:14px}header{margin-bottom:12px}h1{font-size:20px;margin:0 0 10px;overflow-wrap:anywhere}.player-controls{display:flex;align-items:center;flex-wrap:wrap;gap:8px}#playerStatus{font-size:12px;color:#536273;margin-left:6px}.player-stage{max-width:100%;overflow:auto;border:1px solid #bccbe0;border-radius:10px;background:#fff}#formSurface{outline:none}#formSurface:focus-visible{outline:2px solid #2f6fd6;outline-offset:-2px}#playerOutput{max-height:130px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:10px;background:#fff;border:1px solid #c7d2df;border-radius:8px;margin:12px 0 0}.modal{display:none;position:fixed;inset:0;background:rgba(25,37,55,.4);z-index:10000;align-items:center;justify-content:center;padding:16px}.modal.show{display:flex}.question-box{width:min(500px,100%);max-height:90vh;overflow:auto;background:#fff;padding:20px;border-radius:12px;box-shadow:0 12px 35px #0003}#questionText{white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:14px;font-weight:700}#questionAnswer{width:100%;padding:8px;border:1px solid #a9b8ca;border-radius:7px}.question-controls{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}@media(max-width:600px){#playerRoot{padding:8px}h1{font-size:17px}}\n';
  function createAkariStageView(core, options) {
    'use strict';
    const { LIMITS, clamp } = core,
      { form, canvas } = options,
      pen = canvas.getContext('2d'),
      listeners = [],
      timers = new Set(),
      physicalKeys = new Map(),
      heldPhysicalKeys = new Map();
    let clickTargetScheduler=null,runtimeClickTargets=new Set();
    const project = () => options.getProject(),
      runtime = () => options.getRuntime(),
      scheduler = () => options.getScheduler();
    const allowed = () =>
      !!runtime() &&
      !!scheduler()?.running &&
      !scheduler().paused &&
      (options.canInteract?.() ?? true);
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      listeners.push(() => target.removeEventListener(type, fn, opts));
    };
    const dispatch = (fn) => {
      try {
        return fn();
      } catch (e) {
        options.onError?.(e);
      }
    };
    const record = (c, a) =>
      c.type === 'sprite'
        ? c.costumes.find((x) => x.id === (a?.costumeId ?? c.costumeId)) || null
        : null;
    const text = (c, a) =>
      c.type === 'sprite'
        ? record(c, a)?.kind === 'text'
          ? record(c, a).value
          : c.text
        : (a?.text ?? c.text);
    function limitInputValue(input) {
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
        if (scheduler()) scheduler().releaseInput();
        else { r.pressedKeys.clear(); r.mouseDown = false; }
      }
    }
    const scaleTarget = form.parentElement.id === 'formFrame' ? form.parentElement : form;
    const scaleParent = scaleTarget.parentElement,
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
        available =
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
        : Math.min(1, Math.max(1, available) / width);
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
      if (canvas.width !== p.stage.width) canvas.width = p.stage.width;
      if (canvas.height !== p.stage.height) canvas.height = p.stage.height;
      const b =
        p.stage.backdrops.find((x) => x.id === (r?.stage.backdropId || p.stage.backdropId)) ||
        p.stage.backdrops[0];
      form.style.backgroundRepeat = 'no-repeat';
      form.style.backgroundPosition = 'center';
      if (b.kind === 'color') {
        form.style.backgroundColor = b.value;
        form.style.backgroundImage = 'none';
        form.style.backgroundSize = 'auto';
      } else {
        const url = options.imageUrl(b.assetId);
        form.style.backgroundColor = b.fill;
        form.style.backgroundImage = url ? `url("${url}")` : 'none';
        form.style.backgroundSize = b.fit === 'stretch' ? '100% 100%' : b.fit;
      }
      fitStage();
    }
    function positionBubbles() {
      const rect = form.getBoundingClientRect(),
        sx = rect.width / form.clientWidth || 1,
        sy = rect.height / form.clientHeight || 1;
      const bubbles=[...form.querySelectorAll('.sprite-bubble')],placed=[],overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
      const actors=[...form.querySelectorAll('.component')].filter(n=>n.style.display!=='none').map(n=>{const r=n.getBoundingClientRect();return {left:(r.left-rect.left)/sx,right:(r.right-rect.left)/sx,top:(r.top-rect.top)/sy,bottom:(r.bottom-rect.top)/sy};});
      const bands = actors.length ? [{ top:0, height:Math.min(...actors.map(a=>a.top)) },
          { top:Math.max(...actors.map(a=>a.bottom)), height:form.clientHeight-Math.max(...actors.map(a=>a.bottom)) }] : [];
      // Use the same DOM font layout as the visible heading, including fractional glyph widths.
      const textWidth = (value, style) => {
        const measure = document.createElement('span');
        Object.assign(measure.style, {position:'fixed',visibility:'hidden',whiteSpace:'pre',font:style.font,letterSpacing:style.letterSpacing});
        measure.textContent=value; document.body.append(measure);
        const width=measure.getBoundingClientRect().width; measure.remove(); return width;
      };
      const widths = bubbles.map(b => {
        b.style.fontSize=14/sx+'px';
        const full=b.querySelector('[data-speech-full]');
        if(full)full.style.fontSize=11/sx+'px';
        const heading=getComputedStyle(b,'::before'),body=getComputedStyle(b);
        return {name:b.dataset.showSpeaker==='false'?0:textWidth(b.dataset.speaker||'',heading),body:textWidth(b.querySelector('.sprite-bubble-text')?.textContent||'',body),
          full:full?textWidth(full.dataset.label||'',getComputedStyle(full)):0,
          lineHeight:Math.max(parseFloat(heading.lineHeight),parseFloat(body.lineHeight))*sy};
      });
      const short=bubbles.length&&bubbles.every(b=>!/[\r\n]/.test(b.querySelector('.sprite-bubble-text')?.textContent||'')&&b.querySelector('[data-speech-full]')?.dataset.always!=='true');
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
      form.querySelectorAll('.sprite-bubble').forEach((b, bubbleIndex) => {
        const id = b.dataset.runtimeId,
          node = form.querySelector(`[data-runtime-id="${CSS.escape(id)}"].component`);
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
        const text = b.querySelector('.sprite-bubble-text');
        const full = b.querySelector('[data-speech-full]');
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
          ? ['paddingLeft','paddingRight','borderLeftWidth','borderRightWidth'].reduce((n,k)=>n+(parseFloat(bubbleStyle[k])||0),0) : 0;
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
        const chosen = compactRows||compactFullRows ? {left:0,top:placed.length?placed.at(-1).bottom+1/sy:0,right:width,bottom:(placed.length?placed.at(-1).bottom+1/sy:0)+height}
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
          [...form.querySelectorAll('.component')].map((n) => [n.dataset.runtimeId, n]),
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
        let existing = nodes.get(a.runtimeId);
        if (existing && existing.tagName !== (c.type === 'input' ? 'INPUT' : 'DIV')) {
          existing.remove();
          existing = null;
        }
        const node = existing || document.createElement(c.type === 'input' ? 'input' : 'div');
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

        Object.assign(node.style, {
          left: a.x + 'px',
          top: a.y + 'px',
          width: c.w + 'px',
          height: c.h + 'px',
          color: a.color || c.fg,
          backgroundColor: c.bg || 'transparent',
          backgroundImage: 'none',
          fontSize: c.fontSize + 'px',
          zIndex: String(2 + i),
          display: a.visible ? (c.type === 'input' ? 'block' : 'flex') : 'none',
          transform: `rotate(${a.direction}deg) scale(${a.scalePercent / 100})`,
        });
        if (c.type === 'input') {
          if (Number.isSafeInteger(LIMITS.stringChars * 2) && LIMITS.stringChars * 2 <= 2147483647) node.maxLength = LIMITS.stringChars * 2; else node.removeAttribute('maxlength');
          node.readOnly = !r;
          node.setAttribute('aria-label', c.name);
          const v = r ? a.inputValue : c.text;
          if (!node._composing && node.value !== v) node.value = v;
          if (!existing) {
            node.addEventListener('compositionstart', () => (node._composing = true));
            node.addEventListener('compositionend', () => {
              node._composing = false;
              node.dispatchEvent(new Event('input'));
            });
            node.addEventListener('input', () => {
              if (node._composing) return;
              const actor = runtime()?.actor(node.dataset.runtimeId);
              if (!actor) return;
              if (!allowed()) {
                node.value = actor.inputValue;
                return;
              }
              const old = actor.inputValue,
                nv = limitInputValue(node);
              if (old !== nv) {
                scheduler().inputBoundary(() => { actor.inputValue = nv; });
                dispatch(() =>
                  scheduler().spawnForRuntime(actor.runtimeId, 'valueChanged', {
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
            let img = node.querySelector('img.costume-img');
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
        if (!existing) {
          node.addEventListener('pointerdown', (e) => {
            if (!runtime() && e.button === 0 && e.isPrimary !== false)
              options.onDesignPointer?.(e, node.dataset.id);
          });
          node.addEventListener('click', (e) => {
            e.stopPropagation();
            if (allowed())
              if(options.onRuntimeClick?.(node.dataset.runtimeId)!==false)dispatch(() => scheduler().spawnForRuntime(node.dataset.runtimeId, 'click', {}));
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
              if(options.onRuntimeClick?.(node.dataset.runtimeId)!==false)dispatch(() => scheduler().spawnForRuntime(node.dataset.runtimeId, 'click', {}));
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
    function clearSpeech(id) {
      for (const bubble of form.querySelectorAll('.sprite-bubble')) if (bubble.dataset.runtimeId === id) bubble.remove();
    }
    function showBubble(id, value, actualValue = value, controlled = false) {
      const presentation = core.displayValue(actualValue);
      value = presentation.text;
      const details = { ...presentation, value: actualValue };
      if (id === 'stage') {
        options.onStageMessage?.(value, details);
        return;
      }
      const node = form.querySelector(`[data-runtime-id="${CSS.escape(id)}"].component`);
      if (!node) {
        options.onStageMessage?.(value, details);
        return;
      }
      for (const b of form.querySelectorAll('.sprite-bubble'))
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
        full.setAttribute('aria-label', presentation.rounded ? '数を 短くして 見せています。もとの 数を 見る' : 'ふきだしの 文を ぜんぶ 見る');
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
    function penLine(x1, y1, x2, y2, color, size) {
      pen.beginPath();
      pen.moveTo(x1, y1);
      pen.lineTo(x2, y2);
      pen.lineWidth = size;
      pen.lineCap = 'round';
      pen.strokeStyle = color;
      pen.stroke();
    }
    function clearPen() {
      pen.clearRect(0, 0, canvas.width, canvas.height);
    }
    function stamp(id) {
      const r = runtime(),
        a = r?.actor(id),
        c = r?.component(id);
      if (!a || !c) return;
      pen.save();
      try {
        const box = r.aabb(a);
        pen.translate(box.cx, box.cy);
        pen.rotate((a.direction * Math.PI) / 180);
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
      for (const t of timers) clearTimeout(t);
      timers.clear();
      form.querySelectorAll('.sprite-bubble').forEach((b) => b.remove());
    }
    function point(e) {
      const r = runtime(),
        p = project(),
        rect = form.getBoundingClientRect();
      if (!r || !rect.width || !rect.height) return;
      scheduler().inputBoundary(() => {
        r.mouseX = Math.round(((e.clientX - rect.left) * p.stage.width) / rect.width);
        r.mouseY = Math.round(((e.clientY - rect.top) * p.stage.height) / rect.height);
      });
    }
    on(form, 'pointerdown', (e) => {
      if (e.isPrimary === false || e.button !== 0) return;
      if (allowed()) {
        point(e);
        scheduler().inputBoundary(() => { runtime().mouseDown = true; });
      } else if (!runtime() && e.target === form) options.onDesignStage?.(e);
    });
    on(form, 'pointermove', (e) => {
      if (e.isPrimary !== false && allowed()) point(e);
    });
    const release = (e) => {
      if (e.isPrimary !== false && runtime())
        scheduler().inputBoundary(() => { runtime().mouseDown = false; });
    };
    on(window, 'pointerup', release);
    on(window, 'pointercancel', release);
    on(form, 'click', (e) => {
      if (e.target === form && allowed())
        dispatch(() => scheduler().spawnForRuntime('stage', 'click', {}));
    });
    const keyName = (e) =>
      ({
        ArrowUp: '\u4e0a',
        ArrowDown: '\u4e0b',
        ArrowLeft: '\u5de6',
        ArrowRight: '\u53f3',
        ' ': '\u7a7a\u767d',
        Enter: '\u6c7a\u5b9a',
        Escape: '\u53d6\u6d88',
      })[e.key] ?? e.key;
    on(window, 'keydown', (e) => {
      if (
        e.isComposing ||
        e.keyCode === 229 ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.target.closest?.('input,textarea,select,.modal,dialog')
      )
        return;
      if (e.target.closest?.('button') && (e.key === ' ' || e.key === 'Enter')) return;
      const physical = e.code || e.key,
        k = keyName(e);
      heldPhysicalKeys.set(physical, k);
      if (!allowed()) return;
      physicalKeys.set(physical, k);
      const freshPress = scheduler().setKeyState(k, true);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key))
        e.preventDefault();
      if (!e.repeat && freshPress) dispatch(() => scheduler().spawnDistributed('keyDown', { key: k }));
    });
    on(window, 'keyup', (e) => {
      const physical = e.code || e.key,
        k = physicalKeys.get(physical) || keyName(e);
      physicalKeys.delete(physical);
      heldPhysicalKeys.delete(physical);
      if (![...physicalKeys.values()].includes(k)) scheduler()?.setKeyState(k, false);
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

  function mountAkariPlayer(core, makeView, data, options) {
    'use strict';
    const artwork = options?.artwork === true;
    const $ = (id) => document.getElementById(id),
      root = $('playerRoot'),
      form = $('formSurface'),
      canvas = $('penCanvas'),
      start = $('playerStart'),
      pause = $('playerPause'),
      stop = $('playerStop'),
      status = $('playerStatus'),
      output = $('playerOutput'),
      modal = $('questionModal'),
      answer = $('questionAnswer'),
      activation = $('playerActivation'),
      activationButton = $('playerActivate');
    let session,
      view,
      runtime = null,
      scheduler = null,
      cache = null,
      phase = 'LOADING',
      epoch = 0,
      paintFrame = null,
      questionCb = null,
      previousFocus = null,
      automaticAttempted = false,
      backgroundPaused = false,
      runtimeFailed = false;
    const designUrls = new Map();
    const message = (text) => {
      output.hidden = false;
      const addition = (output.textContent ? '\n' : '') + String(text);
      if (output.textContent.length + addition.length > core.LIMITS.logChars)
        output.textContent = (output.textContent + addition).slice(-Math.floor(core.LIMITS.logChars * 0.9));
      else output.appendChild(document.createTextNode(addition));
      output.scrollTop = output.scrollHeight;
    };
    function state() {
      if (phase === 'RUNNING' || phase === 'PAUSED') {
        phase = scheduler?.running ? (scheduler.paused ? 'PAUSED' : 'RUNNING') : 'STOPPED';
      }
      if (start) start.disabled = phase === 'LOADING' || phase === 'PREPARING' || phase === 'ERROR';
      if (pause) pause.disabled = !scheduler?.running;
      if (stop) stop.disabled = !scheduler?.running && phase !== 'PREPARING';
      if (pause) pause.textContent =
        phase === 'PAUSED' ? '▶ つづける' : '⏸ いったん止める';
      if (status) status.textContent =
        {
          LOADING: '読みこみ中',
          READY: 'じゅんび できました',
          PREPARING: 'じゅんび中',
          RUNNING: '動いているよ',
          PAUSED: 'いったん 止まっているよ',
          STOPPED: '止まっています',
          ERROR: '\u958b\u3051\u307e\u305b\u3093',
        }[phase] || '';
      root.dataset.state = phase;
    }
    function flush() {
      if (paintFrame !== null) cancelAnimationFrame(paintFrame);
      paintFrame = null;
      view?.render();
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
    function ask(question, cb) {
      view.clearInput();
      previousFocus = document.activeElement;
      questionCb = cb;
      $('questionText').textContent = question;
      answer.value = '';
      modal.classList.add('show');
      root.inert = true;
      answer.focus();
    }
    function fail(error) {
      backgroundPaused = false;
      runtimeFailed = true;
      scheduler?.pause();
      view?.clearInput();
      message(`${error.code || 'R411'} ${error.message || error}`);
      flush();
      state();
    }
    function dispose() {
      epoch++;
      backgroundPaused = false;
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
    function stopRun() {
      dispose();
      phase = 'STOPPED';
      flush();
      state();
      (start || form).focus({ preventScroll: true });
    }
    async function audioActivation(localCache, attempt, gesture) {
      const ac = localCache.audioContext;
      let timer, failure;
      try {
        await Promise.race([
          Promise.resolve(attempt).catch(error => { failure = error; }),
          new Promise(resolve => { timer = setTimeout(resolve, gesture ? 1500 : 150); }),
        ]);
      } finally { clearTimeout(timer); }
      if (ac.state === 'running') return true;
      // A pending resume on a suspended context is the browser's activation gate.
      // Decode errors and closed/interrupted contexts never become an activation button.
      if (!gesture && ac.state === 'suspended' && (!failure || failure.name === 'NotAllowedError')) return false;
      throw new core.AkariError('R415', '音をはじめられませんでした', 0, 0,
        failure?.message || 'AudioContext state: ' + ac.state);
    }
    function startupFailure(error, gesture = false) {
      dispose();
      phase = artwork ? 'ERROR' : 'STOPPED';
      if (artwork) {
        message(gesture ? '音をはじめられませんでした。この作品を ちがう 画面で 開いてみてください。'
          : '作品をはじめられませんでした。「くわしく」を見てください。');
        const details = document.createElement('details'), summary = document.createElement('summary'), raw = document.createElement('pre');
        summary.textContent = 'くわしく';
        raw.textContent = `${error.code || 'R415'} ${error.message || error}${error.detail ? '\n' + error.detail : ''}`;
        details.append(summary, raw); output.appendChild(details);
      } else message(`${error.code || 'R415'} ${error.message || error}`);
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
            startupFailure(new core.AkariError('R415', '音をはじめられませんでした', 0, 0,
              event.message || 'AudioContext error event; state: ' + audioContext.state));
          }, { once: true });
        }
        await localCache.prepare(session.project, session.requirements, token, { deferAudioStart: artwork });
        if (token !== epoch) return;
        if (artwork && session.requirements.needsAudio) {
          const ready = await audioActivation(localCache, localCache.audioResumePromise, false);
          if (token !== epoch) return;
          if (!ready) {
            phase = 'WAITING'; state();
            activation.hidden = false; activationButton.disabled = false;
            activationButton.focus({ preventScroll: true });
            return;
          }
        }
        beginRuntime(localCache);
      } catch (error) {
        if (token === epoch) startupFailure(error);
      }
    }
    function beginRuntime(localCache) {
        runtimeFailed = false;
        runtime = new core.RuntimeModel(session.project, {}, localCache);
        let speechValue;
        const br = {
          render: requestPaint,
          penLine: view.penLine,
          penClear: view.clearPen,
          stamp: view.stamp,
          prepareSpeech: value => { speechValue = value; },
          say: (id, text, controlled) => {
            flush();
            const value = speechValue; speechValue = undefined;
            view.showBubble(id, text, value, controlled);
          },
          clearSpeech: view.clearSpeech,
          ask,
          closeQuestion,
          state,
          allStopped: () => {
            const generation = epoch;
            setTimeout(() => {
              if (generation === epoch) stopRun();
            }, 0);
          },
          runtimeError: (_, e) => fail(e),
        };
        runtime.ui = br;
        localCache.onAudioStateError = (err) => fail(new core.AkariError('R415', err.message));
        let seed = Date.now() >>> 0;
        try {
          const n = new Uint32Array(1);
          crypto.getRandomValues(n);
          seed = n[0];
        } catch (_) {}
        runtime.reset(seed);
        scheduler = new core.EventScheduler(session.project, session.compiled, runtime, br);
        view.seedHeldInput();
        phase = 'RUNNING';
        scheduler.start();
        if (start) start.textContent = '\u21bb \u3082\u3046\u4e00\u5ea6';
        flush();
        state();
        form.focus({ preventScroll: true });
    }
    async function activateRun(event) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (phase !== 'WAITING' || !cache) return;
      const token = epoch, localCache = cache;
      activationButton.disabled = true;
      phase = 'PREPARING'; state();
      try {
        // Resume is requested synchronously in the native activation handler.
        const attempt = localCache.audioContext.resume();
        localCache.audioResumePromise = Promise.resolve(attempt);
        localCache.audioResumePromise.catch(() => {});
        await audioActivation(localCache, attempt, true);
        if (token !== epoch) return;
        activation.hidden = true;
        beginRuntime(localCache);
      } catch (error) {
        if (token === epoch) startupFailure(error, true);
      }
    }
    function imageUrl(id) {
      if (cache?.objectUrls.has(id)) return cache.objectUrls.get(id);
      if (designUrls.has(id)) return designUrls.get(id);
      const a = session.assetStore.get(id);
      if (!a || a.kind !== 'image') return '';
      const url = URL.createObjectURL(new Blob([a.bytes], { type: a.mime }));
      designUrls.set(id, url);
      return url;
    }
    if (start) start.onclick = startRun;
    if (stop) stop.onclick = stopRun;
    if (pause) pause.onclick = () => {
      view?.clearInput();
      if (!scheduler?.running) return;
      scheduler.paused ? scheduler.resume() : scheduler.pause();
      flush();
      state();
      form.focus({ preventScroll: true });
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
    $('questionStop').onclick = stopRun;
    $('questionSubmit').onclick = () => {
      if (questionCb) questionCb(view.limitInputValue(answer));
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
        $('questionSubmit').click();
      } else if (e.key === 'Tab') {
        const list = [answer, $('questionStop'), $('questionSubmit')],
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
        if (backgroundPaused) scheduler.pause();
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
      if ($('playerTitle')) $('playerTitle').textContent = session.project.name;
      form.setAttribute('aria-label', session.project.name);
      view = makeView(core, {
        form,
        canvas,
        ...(artwork ? { getScale: () => 1 } : {}),
        getProject: () => session.project,
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
            summary.textContent = 'かずを 短くして 見せています。本当の かずを 見る';
            raw.textContent = details.rawText;
            full.append(summary, raw); output.appendChild(full);
          }
        },
        onValueDetails: value => message((typeof value === 'string' ? 'ふきだしの 文ぜんぶ（えらんで コピーできます）：' : '数を 短くして 見せています。もとの 数（えらんで コピーできます）：') + core.valueText(value)),
      });
      flush();
      phase = 'READY';
      state();
      if (artwork) startRun();
    } catch (e) {
      if (artwork) startupFailure(e);
      else {
        phase = 'ERROR';
        message(`${e.code || 'X602'} ${e.message || e}`);
        state();
      }
    }
  }

  function packExecutable(project, assetStore) {
    assetStore = withDefaultMascotAsset(project, assetStore || new AssetStore());
    const compiled = compileProject(project);
    if (compiled.errors.length) {
      const error = new AkariError(
        'X601',
        '作品の まちがいを 直してから、うごく作品を ファイルにしてください',
      );
      error.diagnostics = compiled.errors;
      throw error;
    }
    const root = serializedRoot(project, assetStore);
    validateSerializedProjectStructure(root);
    const requirements = collectRuntimeAssetRequirements(compiled, project),
      used = new Set([...requirements.imageIds, ...requirements.audioIds]);
    function clean(value) {
      if (Array.isArray(value)) return value.filter((x) => x?.kind !== 'CommentLine').map(clean);
      if (value && typeof value === 'object') {
        const out = {};
        for (const [key, v] of Object.entries(value))
          if (
            ![
              'source',
              'raw',
              'inlineComment',
              'elseComment',
              'endLine',
              'whileForm',
              'untilForm',
              'waitForm',
              'boolExpr',
            ].includes(key)
          )
            out[key] = clean(v);
        return out;
      }
      return value;
    }
    const program = compiled.items.map((item) => ({
      key: item.key, ownerId: item.ownerId, ast: clean(item.ast),
      ...(item.key.startsWith('script:') ? { id: item.id || item.scriptId || item.key.split(':')[1],
        targetId: item.targetId, event: item.event, filter: item.filter || null } : {}),
    }));
    const p = {
      name: root.name,
      stage: root.stage,
      projectData: root.projectData,
      components: root.components,
      actions: root.actions.map(({ id, ownerId, name, args, callPhrase }) => ({ id, ownerId, name, args, ...(callPhrase !== undefined ? {callPhrase} : {}) })),
      functions: root.functions.map(({ id, ownerId, name, args }) => ({ id, ownerId, name, args })),
      sounds: root.sounds.filter((s) => used.has(s.assetId)),
    };
    const assets = root.assets
      .filter((a) => used.has(a.id))
      .map((a) => ({ ...a, meta: { ...assetStore.get(a.id).meta } }));
    return {
      ...(Object.hasOwn(root, 'extensions') ? { extensions: root.extensions } : {}),
      schema: 'akari-executable',
      appVersion: PRODUCT_RELEASE,
      ...AKARI_RUNTIME.EXECUTABLE_CONTRACT,
      project: p,
      program,
      assets,
    };
  }
  function inlineJson(value) {
    return JSON.stringify(value).replace(
      /[<>&\u2028\u2029]/g,
      (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
    );
  }
  function escapeHtmlText(value) {
    return String(value).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  }
  function generateStandaloneHtml(project, assetStore = new AssetStore(), { presentation = 'controls' } = {}) {
    if (!['controls', 'artwork'].includes(presentation)) throw new AkariError('X605', '作品のはじめ方が正しくありません');
    const artwork = presentation === 'artwork';
    const payload = packExecutable(project, assetStore),
      title = escapeHtmlText(payload.project.name);
    const definitions = EXTENSION_HOST.exportDefinitions();
    const selected = AKARI_RUNTIME.profiles.describe();
    const configuration = `{extensions:[${definitions.map(x => `{manifest:${inlineJson(x.manifest)},factory:(${x.factorySource})}`).join(',')}],profiles:${inlineJson(selected.profiles.map(({id,version,limits})=>({id,version,limits})))},profile:${inlineJson(selected.selected ? {id:selected.selected.id,version:selected.selected.version} : null)},allowedCapabilities:${inlineJson(FOUNDATION_CONFIGURATION.allowedCapabilities || [])}}`;
    const script = `'use strict';\n${createAkariProfiles.toString()}\n${createAkariExtensionHost.toString()}\n${createAkariRuntime.toString()}\n${createAkariStageView.toString()}\n${mountAkariPlayer.toString()}\nmountAkariPlayer(createAkariRuntime(${configuration}),createAkariStageView,${inlineJson(payload)},${inlineJson({artwork})});`;
    if (/<\/script/i.test(script))
      throw new AkariError(
        'X603',
        'うごく作品を 安全な ファイルに できませんでした',
      );
    const html =
      '<!DOCTYPE html>\n<!-- SPDX-License-Identifier: MIT -->\n<!--\n' +
      AKARI_LICENSE +
      '\n-->\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
      "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob:; media-src blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'\">\n" +
      '<title>' +
      title +
      '</title>\n<style>' +
      AKARI_STAGE_CSS +
      '\n' +
      AKARI_PLAYER_CSS +
      (artwork ? '\nhtml,body{background:transparent}#playerRoot{min-width:0;max-width:none;margin:0;padding:0}.player-stage{position:relative;max-width:none;overflow:visible;border:0;border-radius:0;background:transparent}.stage-viewport{margin:0!important}#playerActivation{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:1000;background:transparent}#playerActivation[hidden]{display:none}#playerActivate{border:2px solid #000;border-radius:12px;background:#fff;color:#000;opacity:1;max-width:100%;padding:12px 18px;font-weight:700}#playerOutput{max-width:100vw}' : '') +
      '</style>\n</head>\n<body>\n' +
      '<main id="playerRoot">' + (artwork ? '' : '<header><h1 id="playerTitle">' +
      title +
      '</h1><div class="player-controls"><button id="playerStart" disabled>▶ はじめる</button><button id="playerPause" disabled>⏸ いったん止める</button><button id="playerStop" disabled>■ 止める</button><span id="playerStatus" role="status">読みこみ中</span></div></header>') +
      '<div class="player-stage"' + (artwork ? ' style="width:' + payload.project.stage.width + 'px;height:' + payload.project.stage.height + 'px"' : '') + '><div id="formSurface" tabindex="0"><canvas id="penCanvas"></canvas></div>' + (artwork ? '<div id="playerActivation" hidden><button id="playerActivate" type="button">ここをおしてはじめる</button></div>' : '') + '</div><pre id="playerOutput" role="log" hidden></pre></main>' +
      '<div class="modal" id="questionModal" role="dialog" aria-modal="true" aria-labelledby="questionText"><div class="question-box"><div id="questionText"></div><input id="questionAnswer" aria-label="\u7b54\u3048" autocomplete="off"><div class="question-controls"><button id="questionStop">動きを止める</button><button id="questionSubmit">\u7b54\u3048\u308b</button></div></div></div>' +
      '<noscript>この作品を動かすには、JavaScriptを使えるようにしてください。</noscript>\n<script>\n' +
      script +
      '\n<' +
      '/script>\n</body>\n</html>\n';
    if (new TextEncoder().encode(html).length > LIMITS.executableBytes)
      throw new AkariError(
        'X604',
        '作品が 大きすぎて、うごく作品の ファイルに できません。絵や 音を へらしてみてください',
      );
    return html;
  }
  function safeDownloadName(name) {
    const s = String(name)
      .replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g, '_')
      .replace(/[. ]+$/, '');
    return s || 'akari';
  }

  // Editor candidates are pure values. The application alone commits source and history.

