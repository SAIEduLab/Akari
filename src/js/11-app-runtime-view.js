  // ────────────────────────────────────────────────────────────────────────
  // 11 — Runtime view: monitor, diagnostics and the execution location
  // ────────────────────────────────────────────────────────────────────────
  // Called once at the start of initApp: appVars is the state it shares, appCalls the functions other parts call.
  function createAppRuntimeView(appVars, appCalls) {
    function tutorialRecordStatement(task,node,epoch,generation) {
      if(!appVars.tutorial||!appVars.tutorialTrace||epoch!==appVars.tutorial.epoch||generation!==appVars.generationToken||appVars.tutorialTrace.epoch!==appVars.tutorial.epoch||!appVars.runtime)return;
      const actor=appVars.runtime.actor(appVars.tutorial.target);if(!actor)return;
      appVars.tutorialTrace.sawTask=true;
      appVars.tutorialTrace.statements.push({kind:node.kind,op:node.op||null,x:actor.x,y:actor.y,click:appVars.tutorialTrace.clicks});
    }
    // A touch body is named with what it touches (「星」に ふれたとき), from the compiled body of the run.
    function runtimeEventText(eventType, scriptKey = null) {
      if (eventType === 'continuous') return 'きまりに 合っている あいだ';
      const filter = scriptKey ? appVars.compiled?.items?.find(item => item.key === scriptKey)?.filter : null;
      return eventText(eventType, filter) || eventType;
    }
    function diagnosticOwner(diagnostic) {
      const key = diagnostic?.where || diagnostic?.key || '', item = appVars.compiled?.items?.find(x => x.key === key),
        sourceKey = item?.documentKey || key, script = scriptBySourceKey(appVars.project, sourceKey),
        definition = appVars.project.actions.find(x => key === 'action:' + x.id) || appVars.project.functions.find(x => key === 'function:' + x.id);
      return { key, item, script, definition };
    }
    // Where a message points: the body (its owner and きっかけ) and the line. The block view has no line numbers (はじめて
    // shows blocks only), so there the place is the sentence itself, as its block reads.
    function diagnosticLocation(diagnostic, { blocks = appCalls.shownEditorMode() === 'blocks' } = {}) {
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
      const mark = appCalls.shownEditorMode() === 'blocks' ? '⚠ が ついた ところを 見てね。'
        : diagnostic?.line ? `コードの ${diagnostic.line}行目を 見てね。` : 'コードの 赤い ところを 見てね。';
      if (!script || (!appVars.sourceOverviewOpen && scriptBySourceKey(appVars.project, appCalls.bindingOwner(appVars.mainEditor)) === script)) return mark;
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
    const targetById = (id) => (id === 'stage' ? appVars.project.stage : id === MEIJIN_OWNER ? appVars.MEIJIN_TARGET : appCalls.componentById(id));
    function closeRuntimeInspector() {
      const dialog = appCalls.$('#runtimeInspector');
      if (dialog.open) dialog.close();
      for (const {node, marker} of appVars.inspectorNodes.splice(0)) { marker.replaceWith(node); }
      if (appVars.appState === 'RUNNING' || appVars.appState === 'PAUSED') {
        appVars.stageView.fitStage();
        appVars.el.form.focus({ preventScroll: true });
      }
    }
    function applyStage() {
      appVars.stageView.renderStage();
      appVars.el.frame.style.width = appVars.project.stage.width + 6 + 'px';
      appVars.el.title.textContent = appVars.project.name;
    }
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
      appVars.valueView = { label, value, index: 0, page: 0 };
      appCalls.renderFullValue();
      appCalls.$('#valueModal').classList.add('show');
    }
    function showFailureDetails(id = null) {
      closeRuntimeInspector();
      const records = appVars.scheduler?.errorRecords || [];
      if (!records.length) return;
      appVars.scheduler.pause();
      appVars.activeFailureId = id ?? records.at(-1).id;
      const select = appCalls.$('#failureSelect');
      select.textContent = '';
      const entry = document.body.dataset.uiLevel === 'entry';
      for (const r of [...records].reverse()) {
        const option = document.createElement('option');
        option.value = String(r.id);
        // はじめて shows no numbers: the place is the part, the きっかけ and the sentence.
        option.textContent = (entry ? '' : '#' + r.id + ' ') + diagnosticLocation(r);
        select.appendChild(option);
      }
      select.value = String(appVars.activeFailureId);
      // The stop's place is marked on the body before the help says so (the paint waits for the next frame otherwise).
      flushRuntimePaint();
      renderFailureDetails();
      appCalls.$('#failureModal').classList.add('show');
    }
    function renderFailureDetails() {
      const r = appVars.scheduler?.errorRecords.find((x) => x.id === appVars.activeFailureId),
        root = appCalls.$('#failureBody');
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
      place.textContent = diagnosticLocation(r); why.textContent = childDiagnosticText(r, diagnosticSource(r), appVars.project);
      reason.append(place, why);
      const latest = r.id === appVars.scheduler.errorRecords.at(-1)?.id, sentence = diagnosticSentence(r),
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
        const expression = parseExpression(original, buildSymbols(appVars.project));
        if (expression.kind !== 'StringLiteral' || expression.value !== record.quotedList.name) return null;
      } catch (_) { return null; }
      return { start, end, original };
    }
    function quotedListCandidates(record) {
      const actor = appVars.project.components.find(c => c.id === record.quotedList.targetId), candidates = [];
      for (const [owner, lists, qualifier] of [
        ['作品', appVars.project.projectData.lists, 'project'],
        [actor?.name, actor?.localData.lists || [], 'self'],
      ]) for (const list of lists) candidates.push({ id:list.id, owner,
        label:`${owner}のリスト「${list.name}」`,
        source:nameSource(list.name, qualifier) });
      return candidates;
    }
    function openQuotedListRepair(record) {
      // Hidden controls from an older run must not discard a current editor draft.
      if (!appVars.scheduler?.paused || !appVars.scheduler.errorRecords.includes(record)) return;
      const range = quotedListRepair(record);
      if (!range) return;
      appCalls.stopRun();
      const ownerKey = record.quotedList.ownerKey, script = scriptBySourceKey(appVars.project, ownerKey);
      if (!script) { appCalls.setStatus('この 本文は もう ないよ。いまの 本文を たしかめてね'); return; }
      appVars.selectedId = script.targetId; appVars.currentEvent = script.event; appVars.selectedScriptId = script.id || null;
      appCalls.hideSourceOverview(); appCalls.renderSelectors(); appCalls.loadEditor(); appCalls.switchEditorMode(appVars.mainEditor, 'code');
      const token = appVars.generationToken, panel = document.createElement('section');
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
      const sourceIsCurrent = () => !appCalls.modelLocked() && appVars.generationToken === token &&
        appCalls.bindingOwner(appVars.mainEditor) === ownerKey && appCalls.readSource(appVars.mainEditor) === record.source &&
        appVars.el.editor.value === record.source.replace(/\r\n?/g, '\n') && !appCalls.hasPendingEditor();
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
          if (!appCalls.commitSource(appVars.mainEditor, source, {atomic:true})) return;
          appVars.el.editor.value = source; appCalls.refreshEditor(); panel.remove();
          appVars.el.editor.focus();
          const start = record.source.slice(0, range.start).replace(/\r\n?/g, '\n').length;
          appVars.el.editor.setSelectionRange(start, start + current.source.length);
          appCalls.setStatus('えらんだ ところを リストに 直したよ。「▶ 動かす」で たしかめてね');
        } catch (error) { notice.textContent = error.message; }
      };
      panel.append(explanation, preview, select, apply, cancel, notice);
      appVars.el.editor.closest('.editor-shell').before(panel);
      if (sourceIsCurrent()) {
        const start = record.source.slice(0,range.start).replace(/\r\n?/g,'\n').length;
        appVars.el.editor.setSelectionRange(start, start + range.original.replace(/\r\n?/g,'\n').length);
      } else stale();
      select.focus();
    }

    // Extension data that the extension keeps in the work (state.persist "project") stays between runs.
    // Show it while stopped, with one button that returns it to the extension's initial value.
    function renderKeptExtensionData() {
      const kept = EXTENSION_HOST.stateInfo().filter(item => item.persist === 'project');
      if (!kept.length) return;
      const saved = appVars.project.extensions?.state || EXTENSION_HOST.initialState(),
        initial = EXTENSION_HOST.initialState();
      renderMonitorSection(appVars.el.monitor, '作品に ほぞんされる かくちょうの 中身', kept.map(item => [item.name,
        JSON.stringify((saved.find(value => value.id === item.id) || initial.find(value => value.id === item.id))?.value ?? null)]));
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'monitor-extension-reset';
      reset.textContent = 'かくちょうの 中身を はじめに もどす';
      reset.onclick = () => {
        if (appVars.runtime || appCalls.modelLocked()) return;
        EXTENSION_HOST.resetState();
        appVars.project.extensions = { ...EXTENSION_HOST.requirements(), profile: AKARI_RUNTIME.profiles.requirement(), state: EXTENSION_HOST.snapshotState() };
        appCalls.pushHistoryNow();
        renderMonitor();
        appCalls.log('かくちょうの 中身を はじめに もどしました', 'ok');
      };
      appVars.el.monitor.appendChild(reset);
    }
    // What one running body does now, as Akari says it (1秒 待っているよ, 話しているよ, 答えを 待っているよ). A timed wait
    // names the time still to wait on the run's clock.
    function taskStateText(task) {
      if (task.state === 'BLOCKED') {
        const reason = task.blockReason || {};
        if (reason.kind === 'time' && reason.speechToken) return '話しているよ';
        if (reason.kind === 'time' && Number.isFinite(reason.deadline) && !reason.frame && typeof appVars.runtime?.now === 'function') {
          const left = Math.max(0, Math.ceil((reason.deadline - appVars.runtime.now()) / 100) / 10);
          return `${left}秒 待っているよ`;
        }
        return { condition: 'そう なるまで 待って いるよ', question: '答えを 待っているよ', waitGroup: 'ほかの 動きが おわるのを 待っているよ',
          glide: '時間を かけて 動いているよ', moveUntil: '動いているよ' }[reason.kind] || '待っているよ';
      }
      return { PAUSED: 'いったん 止めたよ', DONE: 'おわったよ', ERROR: '直す ところが あるよ', CANCELLED: '止めたよ' }[task.state] || '動いているよ';
    }
    function renderMonitor() {
      appVars.el.monitor.textContent = '';
      if (!appVars.runtime) {
        const d = document.createElement('div');
        d.className = 'monitor-empty';
        d.textContent = '止まって いるよ';
        appVars.el.monitor.appendChild(d);
        renderKeptExtensionData();
        return;
      }
      const section = (title, rows) => renderMonitorSection(appVars.el.monitor, title, rows),
        records = appVars.scheduler?.errorRecords || [];
      if (records.length) {
        const last = records.at(-1),
          button = document.createElement('button');
        button.className = 'failure-open';
        button.textContent = `動きが 止まった きろくを 見る（${records.length}こ）`;
        button.onclick = () => showFailureDetails();
        appVars.el.monitor.appendChild(button);
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
        ...appVars.runtime.projectVars,
        ...appVars.runtime.projectLists,
      ]);
      const tasks = appVars.scheduler ? [...appVars.scheduler.tasks.values()] : [],
        live = tasks.filter((t) => !['DONE', 'CANCELLED', 'ERROR'].includes(t.state)),
        focus = appVars.scheduler?.tasks.get(appVars.activeTaskId) || live[0] || tasks[0];
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
      if (appVars.selectedId !== 'stage') {
        const a = appVars.runtime.actor(appVars.selectedId);
        if (a)
          section(appCalls.componentById(appVars.selectedId)?.name || appVars.selectedId, [
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
      const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('pre');summary.textContent='動きの くわしい きろく';text.textContent=tasks.map(t=>`${t.targetId}: ${t.state}`).join('\n');details.append(summary);renderMonitorSection(details,'同じ 動きに するための かず',[['どれかを えらぶ たね',appVars.runtime.runSeed]]);details.append(text);appVars.el.monitor.append(details);
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
    function wrappedCodeLines() {
      const editor = appVars.el.editor, style = getComputedStyle(editor),
        width = Math.max(1, editor.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)),
        key = [width, style.font, style.letterSpacing, style.lineHeight, style.tabSize].join('|');
      if (appVars.codeLineLayout?.source === editor.value && appVars.codeLineLayout.key === key) return appVars.codeLineLayout;
      if (!appVars.codeLineMeasure) {
        appVars.codeLineMeasure = document.createElement('div');
        appVars.codeLineMeasure.setAttribute('aria-hidden', 'true');
        document.body.append(appVars.codeLineMeasure);
      }
      if (appVars.codeLineHeights.key !== key || appVars.codeLineHeights.heights.size > 50000) {
        appVars.codeLineHeights = { key, heights: new Map() };
        Object.assign(appVars.codeLineMeasure.style, { position:'fixed', left:'-100000px', top:'0', visibility:'hidden',
          pointerEvents:'none', width:width+'px', font:style.font, letterSpacing:style.letterSpacing,
          lineHeight:style.lineHeight, tabSize:style.tabSize, whiteSpace:'pre-wrap', overflowWrap:'anywhere' });
      }
      const known = appVars.codeLineHeights.heights, texts = editor.value.split('\n'), fragment = document.createDocumentFragment(), fresh = [];
      for (const text of texts) {
        if (known.has(text)) continue;
        const row = document.createElement('div'); row.textContent = text || '\u200b';
        known.set(text, 0); fresh.push([text, row]); fragment.append(row);
      }
      if (fresh.length) {
        appVars.codeLineMeasure.replaceChildren(fragment);
        for (const [text, row] of fresh) known.set(text, Math.max(22, row.getBoundingClientRect().height));
        appVars.codeLineMeasure.replaceChildren();
      }
      let height = 0;
      const lines = texts.map(text => { const top = height; height += known.get(text); return { top, height:height-top }; });
      return appVars.codeLineLayout = { source:editor.value, key, lines, height };
    }
    function updateGutter(errors = [], notices = appVars.mainEditor.session?.notices || []) {
      appVars.gutterMarks = { errors, notices };
      // A code view that is not on the screen (the block view) has no width to lay its lines out in: it is laid out when
      // it is shown (the observer below), not with every character on a line of its own.
      if (!appVars.el.editor.clientWidth) return;
      const layout = wrappedCodeLines(), count = layout.lines.length,
        key = appCalls.bindingOwner(appVars.mainEditor),
        active = appVars.activeLoc?.key === key ? appVars.activeLoc.line : 0,
        errs = new Set(errors.map((x) => x.line)), noticeLines = new Set(notices.map((x) => x.line));
      for (const mark of [appVars.activeLoc, appVars.keptFail]) if (mark?.key === key && mark.error) errs.add(mark.line);
      let first = 1;
      while (first < count && layout.lines[first].top < appVars.el.editor.scrollTop - 220) first++;
      const last = Math.min(count, first + Math.ceil((appVars.el.editor.clientHeight || 500) / 22) + 25);
      appVars.el.gutter.textContent = '';
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
      appVars.el.gutter.appendChild(space);
      appVars.el.gutter.scrollTop = appVars.el.editor.scrollTop;
    }
    function sourceLocation(task, node, error = null) {
      const frame = task.callFrames[task.callFrames.length - 1],
        def = frame ? appVars.project.actions.find((x) => x.name === frame.name) : null;
      return {
        targetId: task.targetId,
        event: task.eventType,
        scriptId: task.scriptId,
        key:
          error?.akariSource?.key ||
          (def ? `action:${def.id}` : task.scriptId ? `script:${task.scriptId}` : `script:${task.targetId}:${task.eventType}`),
        line: error?.line || node?.sourceSpan?.startLine || appVars.activeLoc?.line || 1,
        column: error?.column || node?.sourceSpan?.startColumn || 1,
        // The sentence the run strip shows: a statement ends on its line; a sentence with a body shows its first line.
        endLine: error ? null : node?.sourceSpan?.endLine ?? null,
        endColumn: error ? null : node?.sourceSpan?.endColumn ?? null,
        error: error || null,
      };
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
      return scriptBySourceKey(appVars.project, appVars.compiled?.items?.find((item) => item.key === scriptKey)?.documentKey || scriptKey);
    }
    function meijinTextLabel(script) {
      return script && isMeijinScript(script) ? `名人の本文 ${appCalls.meijinScripts().indexOf(script) + 1}` : null;
    }
    // follow: the editor shows the body of the sentence that runs (while paused, and when 本文を見て たしかめる opens).
    function paintExecutionLocation({ follow = !!appVars.scheduler?.paused } = {}) {
      if (!appVars.activeLoc) return;
      const loc = appVars.activeLoc,
        parts = loc.key.split(':'),
        scriptKey = parts[0] === 'script' ? loc.key
          : loc.scriptId ? `script:${loc.scriptId}` : `script:${loc.targetId}:${loc.event}`,
        sourceKey = appVars.compiled?.items?.find((item) => item.key === scriptKey)?.documentKey || scriptKey,
        script = scriptBySourceKey(appVars.project, sourceKey),
        def =
          parts[0] === 'action'
            ? appVars.project.actions.find((x) => x.id === parts[1])
            : parts[0] === 'function'
              ? appVars.project.functions.find((x) => x.id === parts[1])
              : null;
      // A 名人 text belongs to no part: its sentences are named by the text (名人の本文 1), not by their subject.
      const owner = def
          ? `${parts[0] === 'action' ? 'てじゅん' : '答えを もとめる'} ${def.name}`
          : meijinTextLabel(script) || targetById(loc.targetId)?.name || loc.targetId,
        label = document.body.dataset.uiLevel === 'entry' ? owner
          : def ? `${owner} / ${loc.line}行目` : `${owner} / ${runtimeEventText(loc.event, scriptKey)} / ${loc.line}行目`;
      appCalls.paintRunStrip(label, runningSentence(def?.source ?? script?.source, loc));
      if (follow) {
        appCalls.hideSourceOverview();
        // Runtime document units have their own IDs; editor selection belongs
        // to the complete source body that can be saved and restored.
        appVars.selectedId = script?.targetId || loc.targetId;
        appVars.currentEvent = script?.event || loc.event;
        appVars.selectedScriptId = script?.id || null;
        const src =
          def?.source ??
          script?.source ??
          '';
        appVars.debugSourceKey = loc.key;
        if (appVars.el.editor.value !== src) appVars.el.editor.value = src;
        appCalls.renderSelectors();
        appCalls.renderTree();
        appCalls.renderProperties();
        if (loc.error) {
          appCalls.showDiagnosticMessage(appVars.el.issue, loc.error, loc.line + '行目', null, src);
          appVars.el.issue.className = 'issue-error';
        }
      }
      appCalls.getEditorSession(appVars.mainEditor);
      appCalls.renderEditorBinding(appVars.mainEditor);
      if (appVars.mainEditor.session.mode === 'blocks' && appVars.mainEditor.session.ownerKey === loc.key)
        appVars.mainEditor.view.highlight(loc);
      updateGutter();
      if (follow) {
        const top = wrappedCodeLines().lines[loc.line - 1]?.top || 0;
        if (top < appVars.el.editor.scrollTop || top > appVars.el.editor.scrollTop + appVars.el.editor.clientHeight - 22)
          appVars.el.editor.scrollTop = Math.max(0, top - Math.floor(appVars.el.editor.clientHeight / 3));
        appVars.el.gutter.scrollTop = appVars.el.editor.scrollTop;
      }
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
        applyStage();
        appCalls.renderComponents();
      }
      if (flags & 2) renderMonitor();
      if (flags & 4) paintExecutionLocation();
      // A flow ended or the run state changed (flag 2): the run may have ended by itself. A pause (stepping, or a stop by
      // an error) is not an end; the run ends there when it goes on and nothing is left. While nothing goes on but an
      // input can start a body again, the status says which input. After the end a body that starts again (on a touch,
      // say) brings 動いているよ back; after 作品を全部止める the scheduler takes no input.
      if (flags & 2 && appVars.scheduler?.running && !appVars.scheduler.paused) {
        if (appVars.runFinished) { if (!appVars.scheduler.idle()) appCalls.resumeFinishedRun(); }
        else if (appVars.scheduler.ended()) finishRun();
        else if (appVars.scheduler.idle()) {
          // No sentence runs now: the strip says so until a body starts again.
          if (appVars.activeLoc) { appVars.activeLoc = null; appCalls.paintRunStrip(); }
          showRunHint(restartHint());
        } else showRunHint('');
      }
    }
    // The run has ended (every body done, or 作品を全部止める). The run screen stays as it is, with its last picture (a
    // ふきだし that would go away by itself stays too), and shows only ■ 止める; the status says what to do next.
    function finishRun({ stoppedAll = false } = {}) {
      if ((appVars.runFinished && !stoppedAll) || !appVars.runtime || !['RUNNING', 'PAUSED'].includes(appVars.appState)) return;
      appVars.runFinished = true;
      appVars.runHint = '';
      appVars.appState = 'RUNNING';
      if (appVars.inspectorNodes.length) closeRuntimeInspector();
      appVars.activeLoc = null;
      appVars.stageView.keepBubbles();
      appCalls.paintRunStrip();
      appCalls.setStatus(stoppedAll ? '作品が 止まったよ。作る 画面に もどる ときは「■ 止める」を おしてね'
        : 'おわったよ。もう一度 動かすときは「■ 止める」を おしてから「▶ 動かす」を おしてね');
      appCalls.updateRunState();
    }
    const signalName = item => String((item.filter && typeof item.filter === 'object' ? item.filter.message : item.filter) ?? '');
    function waitsForExtension(item) {
      if (appVars.scheduler?.waitsForExtension) return appVars.scheduler.waitsForExtension(item);
      const name = signalName(item);
      return EXTENSION_HOST.active && item.event === 'message' && name.startsWith('拡張:') && !!EXTENSION_HOST.describe(name.slice(3), 'events');
    }
    function restartHint() {
      const items = appVars.compiled?.items || [],
        inputs = items.filter(item => ['click', 'keyDown', 'valueChanged'].includes(item.event) || waitsForExtension(item));
      if (!inputs.length || items.some(item => ['conditionTrue', 'interval'].includes(item.event))) return '';
      const order = id => id === 'stage' ? -1 : appVars.project.components.findIndex(c => c.id === id),
        item = inputs.reduce((first, next) => order(next.targetId) < order(first.targetId) ? next : first),
        name = targetById(item.targetId)?.name || appVars.project.stage.name;
      // The stage is 画面 here, as on はじめて's 「画面が おされたとき」 (F-23).
      if (item.event === 'click') return item.targetId === 'stage' ? '画面を おすと 動くよ' : `「${name}」を おすと 動くよ`;
      if (item.event === 'valueChanged') return `「${name}」に 入れると 動くよ`;
      if (item.event === 'message') return `「${signalName(item)}」の 合図を 受けると 動くよ`;
      const key = item.filter?.key;
      return key ? `「${appVars.RUN_HINT_KEYS[key] || key}」キーを おすと 動くよ` : 'キーを おすと 動くよ';
    }
    function showRunHint(text) {
      if (text === appVars.runHint) return;
      appVars.runHint = text;
      appCalls.setStatus(text || '動いているよ');
    }
    // ■ 止める points to the notices of the run once: the same notices after the next run say only 止まって いるよ. A
    // notice in a body that is not shown names that body.
    function stopStatusWithNotices() {
      if (appVars.keptFail?.error) {
        const key = appVars.compiled?.items?.find(item => item.key === appVars.keptFail.key)?.documentKey || appVars.keptFail.key,
          shown = !appVars.sourceOverviewOpen && key === appCalls.bindingOwner(appVars.mainEditor),
          place = shown && appCalls.shownEditorMode() === 'code' && appVars.keptFail.line ? `コードの ${appVars.keptFail.line}行目`
            : shown && document.querySelector('#blockEditor .blockui-current') ? 'オレンジの わくの ところ'
            : diagnosticLocation({...appVars.keptFail, where: appVars.keptFail.key});
        return `止まって いるよ。${place}を なおしてね。`;
      }
      const notes = appVars.compiled?.notes || [], key = notes.map(d => d.where + '|' + d.line + '|' + d.code).join(',');
      const before = appVars.pointedNotices;
      appVars.pointedNotices = key;
      if (!notes.length || key === before) return '止まって いるよ';
      const owner = d => appVars.compiled.items?.find(item => item.key === d.where)?.documentKey || d.where;
      const shown = d => appVars.sourceOverviewOpen ? scriptBySourceKey(appVars.project, owner(d))?.targetId === appVars.selectedId : owner(d) === appCalls.bindingOwner(appVars.mainEditor);
      if (notes.some(shown)) return '止まって いるよ。ⓘ が ついた ところに 知らせが あるよ';
      const { key: where, script, definition } = diagnosticOwner({ where: owner(notes[0]) });
      const place = definition ? (where.startsWith('function:') ? '答えを もとめる「' : 'てじゅん「') + definition.name + '」'
        : meijinTextLabel(script) || `「${targetById(script?.targetId)?.name || appVars.project.stage.name}」の ${eventText(script?.event, script?.filter)}の 本文`;
      return `止まって いるよ。${place}に ⓘ の 知らせが あるよ`;
    }
    function bridge() {
      let speechValue;
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
          if(appVars.tutorialTrace&&tutorialRunEpoch===appVars.tutorial?.epoch&&bridgeGeneration===appVars.generationToken&&rid===appVars.tutorial.target)appVars.tutorialTrace.speech.push(String(text));
        },
        clearSpeech: appVars.stageView.clearSpeech,
        beforeStatement: (task, node) => {
          tutorialRecordStatement(task,node,tutorialRunEpoch,bridgeGeneration);
          appVars.activeTaskId = task.taskId;
          appVars.activeLoc = sourceLocation(task, node);
          requestRuntimePaint(6);
        },
        afterStatement: () => requestRuntimePaint(6),
        runtimeError: (task, err) => {
          if(appVars.tutorialTrace&&tutorialRunEpoch===appVars.tutorial?.epoch&&bridgeGeneration===appVars.generationToken)appVars.tutorialTrace.failed=true;
          appVars.runFailed = true;
          appVars.activeTaskId = task.taskId;
          appVars.activeLoc = sourceLocation(task, null, err);
          requestRuntimePaint(7);
          // The order of the calls names the part (たくどん), not its inner id, below くわしく (F-28).
          const owner = task.targetId === 'stage' ? appVars.project.stage.name : task.targetId === MEIJIN_OWNER ? '名人の本文' : appCalls.componentById(task.targetId)?.name,
            calls = (task.errorCallStack || []).map((entry, i) => i === 0 && owner && document.body.dataset.uiLevel !== 'advanced'
              ? entry.replace('きっかけ ' + task.targetId + ' /', 'きっかけ ' + owner + ' /') : entry);
          const stack = calls.length
            ? `
使った じゅんばん：${calls.join(' → ')}`
            : '';
          // 出力 is the teacher's surface: one polite voice per line (F-18).
          appCalls.log(`${err.code} 動きが うまく いきませんでした：${err.message}${stack}`, 'error');
          appCalls.setStatus('動きが とちゅうで 止まったよ');
          renderMonitor();
          showFailureDetails(task.failureRecordId);
        },
        ask: (q, cb) => appCalls.showQuestion(q, cb),
        closeQuestion: () => hideQuestion(),
        state: appCalls.updateRunState,
      };
    }
    function hideQuestion() {
      appCalls.$('#questionModal').classList.remove('show');
      appVars.questionCb = null;
    }
    Object.assign(appCalls, {applyStage, bridge, closeRuntimeInspector, diagnosticLocation, diagnosticSource, fixPointer, flushRuntimePaint, monitorValue, paintExecutionLocation, renderFailureDetails, renderMonitor, requestRuntimePaint, showFullValue, stopStatusWithNotices, targetById, updateGutter, wrappedCodeLines});
  }
