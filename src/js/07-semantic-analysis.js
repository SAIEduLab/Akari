  // ────────────────────────────────────────────────────────────────────────
  // 07 — Semantic analysis and compilation
  // ────────────────────────────────────────────────────────────────────────
  
  // 名人: the text has no blocks. The name is changed where it is written as a name (not in speech, a signal, nor a ※
  // note), and the text must then read the same, with the new name, as before. A quoted name is changed only where it
  // names the thing (「ねこ」のよこのばしょ, 「ねこ」にふれていれば), not where it is words (「ねこ」と言う, 「ねこ」の合図).
  // When the bare new name reads differently (ねこ → ねこが), it is written in 【 】, as a renamed block writes it; if
  // that does not read the same either, the rename is refused with the line whose reading changes.
  function meijinRenamedSource(record, project, next, resource, newName) {
    const source = record.source, old = resource.name;
    if (!source.includes(old)) return null;
    const quotes = [];
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (ch === '※') { const end = source.indexOf('\n', i); i = end < 0 ? source.length : end; continue; }
      if (ch === '「' || ch === '『') {
        const close = source.indexOf(ch === '「' ? '」' : '』', i + 1), end = close < 0 ? source.length : close + 1;
        if (source.slice(i + 1, end - 1) === old) quotes.push(i);
        i = end - 1;
      }
    }
    // Another name that holds this one (子ねこ for ねこ) is kept whole.
    const names = [...project.components, ...project.actions, ...project.functions, ...project.projectData.variables, ...project.projectData.lists,
      ...project.components.flatMap(c => [...(c.localData?.variables || []), ...(c.localData?.lists || [])])].map(x => x.name);
    const longer = [...new Set(names)].filter(name => name !== old && name.includes(old)).sort((a, b) => b.length - a.length);
    // written: how a bare name is written; changed: the quotes (by their place) that name the thing.
    const renamed = (written, changed) => {
      let out = '', i = 0;
      while (i < source.length) {
        const ch = source[i];
        if (ch === '※') { const end = source.indexOf('\n', i); out += source.slice(i, end < 0 ? source.length : end); i = end < 0 ? source.length : end; continue; }
        if (ch === '「' || ch === '『') {
          const close = source.indexOf(ch === '「' ? '」' : '』', i + 1), end = close < 0 ? source.length : close + 1;
          out += changed.has(i) ? ch + newName + source[end - 1] : source.slice(i, end);
          i = end; continue;
        }
        const kept = longer.find(name => source.startsWith(name, i));
        if (kept) { out += kept; i += kept.length; continue; }
        if (source.startsWith(old, i)) { out += written; i += old.length; continue; }
        out += ch; i++;
      }
      return out;
    };
    // The places where a quoted word names this thing (the reference graph's literal places).
    const literal = new Set(buildProjectReferenceGraph(project).references
      .filter(r => r.sourceKey === record.key && r.resourceKey === resource.key && r.binding === 'literal' && r.nodePath).map(r => r.nodePath.join('.')));
    // A name in 【 】 is the same name as written bare. Before the rename, a name (and a quoted word in a literal
    // place) stands for the new name.
    const shape = (ast, renaming) => {
      const walk = (v, path, key) => Array.isArray(v) ? v.map((x, i) => walk(x, [...path, i], key)) : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).filter(([k]) => !['sourceSpan', 'source', 'raw', 'inlineComment', 'comment', 'endLine', 'text', 'exact'].includes(k))
          .map(([k, x]) => [k, k === 'qualifier' && x === 'exact' ? null
            : renaming && x === old && (k === 'name' || k === 'target' || (k === 'value' && v.kind === 'StringLiteral' && literal.has(path.join('.')))) ? newName : walk(x, [...path, k], k)]))
        : v;
      return walk(ast, [], null);
    };
    const read = (text, p) => parseSyntax(text, { ...record.context, symbols: buildSymbols(p) });
    const before = read(source, project), want = before.ast && stableJson(shape(before.ast, true));
    const reads = text => { const after = read(text, next); return !!want && !!after.ast && stableJson(shape(after.ast, false)) === want; };
    // Which quotes name the thing is found by trying them (a few quotes at most; more are tried all or none).
    const choices = quotes.length <= 6 ? [...Array(1 << quotes.length).keys()].map(mask => new Set(quotes.filter((_, i) => mask & (1 << i)))) : [new Set(), new Set(quotes)];
    // The new name is tried first as a renamed block (and 整える) writes it: bare when it can stand bare, otherwise in
    // 【 】 (ねこ → 【ねこが】は、…), even where the bare name would also read now that the part has that name.
    const writings = bareName(newName) ? [newName, '【' + newName + '】'] : ['【' + newName + '】', newName];
    for (const written of writings) for (const changed of choices) { const text = renamed(written, changed); if (reads(text)) return text; }
    const lines = source.split('\n'), after = renamed(newName, new Set(quotes)).split('\n');
    const line = lines.findIndex((text, i) => text !== after[i] && !(() => { const a = read(text.trim(), project), b = read(after[i].trim(), next); return a.ast && b.ast && stableJson(shape(a.ast, true)) === stableJson(shape(b.ast, false)); })());
    throw new AkariError('S301', line < 0 ? '名人の 本文の 中で、名前を かえても 同じ ものを さすかを たしかめられません。名前を【 】で かこむなど、どれの ことか はっきり 書いて ください'
      : `名前を「${newName}」に すると、${(() => { const s = buildSymbols(project), what = project.components.some(c => c.name === newName) ? '部品' : s.projectLists?.has(newName) ? 'リスト' : s.projectVars?.has(newName) ? 'へんすう' : null; return what ? `「${newName}」という ${what}が あるので、` : ''; })()}名人の 本文の ${line + 1}行目「${lines[line].trim()}」が ちがう 意味に 読めます。ちがう 名前に して ください`);
  }
  // A procedure made in a 名人 text is renamed in that text and wherever it is called; every changed text must read
  // the same with the new name.
  function prepareMeijinProcedureRename(project, definitionId, newName) {
    const d = meijinProjectDefinitions(project).find(x => x.id === definitionId);
    if (!d) throw new AkariError('F503', '名前を かえる てじゅんが 見つかりません');
    const name = normalizeCharsOutsideString(String(newName ?? '').trim());
    validateName(name, { callable: true });
    if (name === d.name) return cloneDesignProject(project);
    if ([...project.actions, ...project.functions, ...meijinProjectDefinitions(project)].some(x => x.name === name))
      throw new AkariError('F503', '自分で 作った ブロックに 同じ 名前が あります。ちがう 名前に して ください');
    // A part, data or received value of the same name: the new name would be read as that one where it is written bare.
    {
      const s = buildSymbols(project), local = [...(s.individualByTargetId?.values?.() || [])];
      const what = [project.stage, ...project.components].some(c => c.name === name) ? '部品'
        : s.projectLists?.has(name) || local.some(x => x.lists?.has(name)) ? 'リスト'
          : s.projectVars?.has(name) || local.some(x => x.variables?.has(name)) ? 'へんすう'
            : meijinProjectDefinitions(project).some(x => (x.args || []).includes(name)) ? '入れるもの' : null;
      if (what) throw new AkariError('F503', `「${name}」という ${what}が あるので、手順の 名前には できません。ちがう 名前に して ください`);
    }
    const next = cloneDesignProject(project), resource = { name: d.name }, records = sourceRegistry(project);
    const place = (record, source) => {
      if (source === null || source === record.source) return;
      const target = record.kind === 'script' ? scriptBySourceKey(next, record.key) : next[record.kind === 'action' ? 'actions' : 'functions'].find(x => record.key === record.kind + ':' + x.id);
      target.source = source;
      if (target.document) target.document.revision++;
    };
    // The text that makes it first, so the others read the new name as a procedure.
    const own = records.find(r => r.key === `script:${d.scriptId}`);
    place(own, meijinRenamedSource(own, project, next, resource, name));
    for (const record of records) if (record !== own) place(record, meijinRenamedSource(record, project, next, resource, name));
    if (!meijinProjectDefinitions(next).some(x => x.id === d.id && x.name === name))
      throw new AkariError('S301', '名人の 本文の 見出しで、てじゅんの 名前を かえられませんでした。名前を【 】で かこんで 書いて ください');
    validateDesignProject(next);
    return next;
  }
  function prepareBindingRename(project, resourceKey, newName, options = {}) {
    const graph = buildProjectReferenceGraph(project, options), resource = graph.resources.find(r => r.key === resourceKey);
    if (!resource) throw new AkariError('F503', '名前を かえる ものが 見つかりません');
    validateResourceName(newName, '名前');
    if (newName === resource.name) return cloneDesignProject(project);
    if (graph.uncertain.some(r=>!r.kind||r.kind===resource.kind)) throw new AkariError('S301', '書きかけの 本文か、動かして はじめて 決まる 名前が あります。本文を 書きおえてから、名前を かえて ください');
    const next = cloneDesignProject(project), items = resource.kind === 'component' ? [next.stage, ...next.components]
      : resource.kind === 'data' ? (resource.ownerId === 'stage' ? next.projectData : next.components.find(c => c.id === resource.ownerId).localData)
      : next[resource.kind === 'action' ? 'actions' : 'functions'];
    const siblings = Array.isArray(items) ? items : [...items.variables, ...items.lists];
    if ((resource.kind === 'action' || resource.kind === 'function' ? [...next.actions, ...next.functions] : siblings).some(d => d.id !== resource.id && d.name === newName))
      throw new AkariError('F503', '同じ ところに 同じ 名前が あります。ちがう 名前に して ください');
    siblings.find(d => d.id === resource.id).name = newName;
    validateDesignProject(next);
    const at = (root, path) => path.reduce((value,key) => value?.[key],root), grouped = new Map();
    for (const ref of graph.references.filter(r => r.resourceKey === resourceKey)) {
      if (options.drafts?.some(d => d.key === ref.sourceKey)) throw new AkariError('S301', 'なおして いる とちゅうの 自分で 作った ブロックを、先に 決めてから 名前を かえて ください');
      if (graph.references.some(r => r.sourceKey === ref.sourceKey && r.binding === ref.binding && stableJson(r.nodePath) === stableJson(ref.nodePath) && r.resourceKey !== resourceKey))
        throw new AkariError('S301', '同じ 名前が、いくつかの ものを さして います。どの 部品の ものか、はっきり 書いてから 名前を かえて ください');
      const rows = grouped.get(ref.sourceKey) || []; rows.push(ref); grouped.set(ref.sourceKey,rows);
    }
    for (const record of sourceRegistry(project)) {
      if (record.context.meijin) {
        if (options.drafts?.some(d => d.key === record.key)) continue;
        const source = meijinRenamedSource(record, project, next, resource, newName);
        if (source !== null) { const target = scriptBySourceKey(next, record.key); target.source = source; if (target.document && source !== record.source) target.document.revision++; }
        continue;
      }
      const refs = grouped.get(record.key); if (!refs) continue;
      const session = createEditorSession(record.key,record.source,record.context,project), tree = cloneDesignProject(session.blockView), index = buildBlockIndex(tree), edits = [];
      if (!session.syntaxAst || !tree) throw new AkariError('S301', '本文の どこで 名前を 使って いるか、決められません');
      for (const ref of refs) {
        const entry = [...session.nodeMap].find(([,loc]) => stableJson(loc.path) === stableJson(ref.nodePath));
        if (!entry) throw new AkariError('F503', '名前を 使って いる ばしょを、たしかめられません');
        const [id,loc] = entry, node = index.get(id).node, original = at(session.syntaxAst,ref.nodePath);
        // A touch body with no heading keeps its partner in the work only (renamed below).
        if (ref.binding === 'filter') continue;
        // ふれたとき's partner in the heading: the token is written again in its own way (「 」 or 【 】).
        if (ref.binding === 'touch') {
          const heading = node.fields.heading, range = loc.surface?.targetRange;
          if (!heading?.filter || heading.filter.target !== resource.name || !range) throw new AkariError('F503', '書いた 文の 中で、ふれる 相手の 名前の ばしょを たしかめられません');
          heading.filter.target = newName;
          const token = compactOutsideString(record.source.slice(range.start, range.end));
          edits.push({ ...range, text: token.startsWith('【') ? `【${newName}】` : formatExpression({ kind: 'StringLiteral', value: newName }) });
          continue;
        }
        if (ref.binding === 'actor') {
          const actor = node.fields.heading?.actorRef || node.fields.actorRef;
          if (!actor || actor.name !== resource.name) continue; // The stable alias 画面 keeps its spelling.
          actor.name = newName;
        } else if (ref.binding === 'literal') node.fields.value = newName;
        else node.fields.name = newName;
        // Inherited subjects update the semantic field, but have no source token.
        const range = ref.binding === 'actor' ? loc.surface?.actorRange : loc.surface?.range;
        if (ref.binding === 'actor' && !range) continue;
        if (!range) throw new AkariError('F503', '書いた 文の 中で、名前の ばしょを たしかめられません');
        if (ref.binding === 'actor') {
          const token=compactOutsideString(record.source.slice(range.start,range.end));
          if(![resource.name,`【${resource.name}】`,`「${resource.name}」`].includes(token))throw new AkariError('F503','書いた 文の 中で、だれが 動くかの 名前の ばしょを たしかめられません');
          const text=token.startsWith('【')?`【${newName}】`:token.startsWith('「')?formatExpression({kind:'StringLiteral',value:newName}):nameSource(newName);
          edits.push({...range,text});continue;
        }
        if (ref.binding === 'literal') { edits.push({...range,text:formatExpression({kind:'StringLiteral',value:newName})}); continue; }
        const phrase=original.kind==='UserActionCall'&&project.actions.find(a=>a.id===resource.id)?.callPhrase;
        if(phrase&&compactOutsideString(record.source.slice(range.start,range.end)).replace(/[。．.]$/,'').endsWith(actionCallPhraseKey(phrase)))continue;
        let end = range.end;
        // Values, quoted speech and nested bodies are separate semantic nodes.
        // A containing command's name must never rename text inside those nodes.
        const protectedRanges = [...session.nodeMap.values()].filter(child => child.path.length > loc.path.length && loc.path.every((k,i) => child.path[i] === k)).map(child => child.surface?.range).filter(Boolean);
        const candidates = [];
        for (let pos=record.source.indexOf(resource.name,range.start);pos>=0&&pos+resource.name.length<=end;pos=record.source.indexOf(resource.name,pos+resource.name.length)) {
          if (protectedRanges.some(r => pos>=r.start&&pos<r.end)) continue;
          let start=pos,finish=pos+resource.name.length,text=nameSource(newName);
          const before=record.source[pos-1],after=record.source[finish];
          if (before==='【'&&after==='】') {start--;finish++;text=`【${newName}】`;}
          else if (before==='「'&&after==='」') {start--;finish++;text=formatExpression({kind:'StringLiteral',value:newName});}
          candidates.push({start,end:finish,text});
        }
        if (candidates.length>1) throw new AkariError('S301', '1つの 文の 中に、同じ 名前が いくつも あります。どれの ことか、はっきり 書いてから 名前を かえて ください');
        if (candidates.length) edits.push(candidates[0]);
        else if (ref.binding!=='actor'&&!(original.kind==='UserActionCall'&&project.actions.find(a=>a.id===resource.id)?.callPhrase))
          throw new AkariError('F503', '名前の 書き方を、たしかめられません');
      }
      let source=record.source,boundary=source.length;
      const unique=[...new Map(edits.map(e=>[e.start+':'+e.end,e])).values()].sort((a,b)=>b.start-a.start);
      for (const edit of unique) {if(edit.end>boundary)throw new AkariError('F503','名前を かえる ところが、重なって います');source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);boundary=edit.start;}
      const parsed=parseSyntax(source,{...record.context,symbols:buildSymbols(next)});
      if(!parsed.ast||!astEquivalent(parsed.ast,blockDecode(tree)))throw new AkariError('S301','この 書き方では、名前を かえても 同じ ものを さした ままか、たしかめられません。どれの ことか はっきり 書いて ください（へんすうの 名前は【 】、部品の 名前は「 」で かこみます）');
      const target=record.kind==='script'?scriptBySourceKey(next,record.key):next[record.kind==='action'?'actions':'functions'].find(d=>record.key===record.kind+':'+d.id);
      target.source=source;if(target.document&&source!==record.source)target.document.revision++;
    }
    // ふれたときの相手 kept in the work (filter.target) is renamed with the part, with or without a heading.
    if (resource.kind === 'component') for (const script of next.scripts)
      if (script.event === 'touchStart' && script.filter?.target === resource.name) script.filter = { target: newName };
    const identity = rows => rows.map(r => [r.sourceKey,r.resourceKey,r.binding,r.nodePath]).map(stableJson).sort(), after = buildProjectReferenceGraph(next);
    if (after.uncertain.length!==graph.uncertain.length || stableJson(identity(graph.references)) !== stableJson(identity(after.references)))
      throw new AkariError('S301', 'その 名前に すると、さす ものや、どの 部品の ものかが かわって しまいます。ちがう 名前に するか、どの 部品の ものか、はっきり 書いて ください');
    validateDesignProject(next);return next;
  }

  function prepareResourceRename(project, resourceKey, newName, options = {}) {
    const impact = resourceChangeImpact(project, resourceKey, options), resource = impact.resource;
    if (!['costume', 'backdrop', 'sound'].includes(resource.kind)) return prepareBindingRename(project,resourceKey,newName,options);
    validateResourceName(newName, '名前');
    if (newName === resource.name) return cloneDesignProject(project);
    if (impact.uncertain.length) throw new AkariError('S301', '名前を 使って いるか しらべられない 本文が あります。先に 本文を 書きおえてから、名前を かえて ください');
    const next = cloneDesignProject(project), items = resource.kind === 'costume'
      ? next.components.find(c => c.id === resource.ownerId).costumes : resource.kind === 'backdrop' ? next.stage.backdrops : next.sounds;
    if (items.some(x => x.id !== resource.id && x.name === newName)) throw new AkariError('F503', '同じ 名前が あります');
    const graph = buildProjectReferenceGraph(project, options), grouped = new Map();
    // 名人: the name is changed in the text and the text must read the same (as for parts and data).
    const meijinKeys = new Set(project.scripts.filter(isMeijinScript).map(scriptSourceKey));
    for (const ref of impact.references) {
      if (meijinKeys.has(ref.sourceKey)) continue;
      if (ref.binding !== 'literal' || !ref.range || options.drafts?.some(r => r.key === ref.sourceKey)) throw new AkariError('S301', '書きかけを 先に 決めてから、名前を かえて ください');
      if (graph.references.some(other => other.sourceKey === ref.sourceKey && other.range?.start === ref.range.start && other.range?.end === ref.range.end && other.resourceKey !== resourceKey))
        throw new AkariError('S301', '同じ 名前が、いくつかの ものを さして います。どれの ことか、はっきり 書いてから 名前を かえて ください');
      const edits = grouped.get(ref.sourceKey) || []; if (!edits.some(e => e.start === ref.range.start && e.end === ref.range.end)) edits.push(ref.range); grouped.set(ref.sourceKey, edits);
    }
    const replacement = formatExpression({ kind: 'StringLiteral', value: newName });
    for (const [key, edits] of grouped) {
      const record = key.startsWith('script:') ? scriptBySourceKey(next, key) : [...next.actions, ...next.functions].find(d => key.endsWith(':' + d.id));
      if (!record) throw new AkariError('F503', '名前を かえる 本文が 見つかりません');
      for (const { start, end } of edits.sort((a, b) => b.start - a.start)) {
        const literal = parseExpression(record.source.slice(start, end), buildSymbols(project));
        if (literal.kind !== 'StringLiteral' || literal.value !== resource.name) throw new AkariError('F503', '名前を 使って いる ばしょを、たしかめられません');
        record.source = record.source.slice(0, start) + replacement + record.source.slice(end);
      }
      // Only a literal token changed; document ownership and unit IDs stay fixed.
      if (record.document) record.document.revision++;
    }
    items.find(x => x.id === resource.id).name = newName;
    for (const record of sourceRegistry(project)) {
      if (!record.context.meijin || options.drafts?.some(d => d.key === record.key)) continue;
      const source = meijinRenamedSource(record, project, next, resource, newName);
      if (source !== null && source !== record.source) { const target = scriptBySourceKey(next, record.key); target.source = source; if (target.document) target.document.revision++; }
    }
    validateDesignProject(next);
    return next;
  }
  function analyzeAst(ast, project, context = {}) {
    // A 名人 script has its own sentence kinds; no block reads it.
    if (!context.meijin) validateSyntaxAst(ast);
    // A definition draft is inspected in a private candidate environment; it is never registered here.
    let candidate = project;
    const kind = context.definitionKind || null,
      definition = context.definition || null;
    if (kind && definition) {
      candidate = {
        ...project,
        actions: project.actions.filter((x) => x.id !== definition.id),
        functions: project.functions.filter((x) => x.id !== definition.id),
      };
      candidate[kind === 'action' ? 'actions' : 'functions'].push({
        ...definition,
        args: context.args || definition.args || [],
        source: ast.source || '',
      });
    }
    const targetId = kind ? null : context.targetId || 'stage',
      event = kind ? null : context.event || 'start';
    const key =
      context.key ||
      context.ownerKey ||
      (kind ? `${kind}:${definition?.id || 'draft'}` : context.id || context.scriptId
        ? `script:${context.id || context.scriptId}` : `script:${targetId}:${event}`);
    const compiled = parseProjectSyntax(candidate, true),
      targetType = kind
        ? null
        : targetId === 'stage'
          ? 'stage'
          : candidate.components.find((x) => x.id === targetId)?.type;
    const items = documentSyntaxItems(ast, key, {
      ...context,
      targetId,
      targetType,
      event,
      definition,
      definitionKind: kind,
      args: context.args || definition?.args || [],
    },candidate,compiled.errors);
    compiled.items = compiled.items.filter((x) => x.key !== key && x.documentKey !== key);
    compiled.items.push(...items);
    compiled.astByKey=syntaxItemMap(compiled.items,compiled.errors);
    const out = placeMeijinDefinitionErrors(candidate, analyzeProject(candidate, compiled, { rootKeys: new Set(items.map(item=>item.key)) }));
    // The code view gives S317 for a 名人 form, as the check does (FM2-04: いちばん近い星の方を向く).
    if (!context.meijin && !kind && typeof ast.source === 'string') {
      const keys = new Set([key, ...items.map(item => item.key)]), at = out.findIndex(e => keys.has(e.where));
      if (at >= 0 && genericReadingError(out[at]) && meijinTrialReads(candidate, ast.source, targetId)) {
        const { proposals, draftRole, ...location } = out[at];
        return [...out.slice(0, at), { ...location, code: 'S317', message: MEIJIN_ONLY_MESSAGE }, ...out.slice(at + 1).filter(e => !keys.has(e.where))];
      }
    }
    return out;
  }
  function compileProject(project) {
    try {
      validateProject(project);
    } catch (err) {
      return {
        symbols: null,
        items: [],
        astByKey: new Map(),
        errors: [
          { code: err.code || 'F503', message: err.message, line: 0, column: 1, where: 'project' },
        ],
      };
    }
    const compiled = parseProjectSyntax(project);
    compiled.errors.push(...placeMeijinDefinitionErrors(project, [...analyzeProject(project, compiled), ...eventCountPlacement(compiled), ...laneControlPlacement(compiled)]));
    compiled.errors = meijinSelfWord(project, wordLines(project, meijinFormsInOrdinary(project, compiled.errors)));
    compiled.notes = projectNotes(project, compiled);
    return compiled;
  }
  // Whether a part's body reads with no error as a 名人 text: as written (its own headings and procedures), or as the
  // part's sentences, which a 名人 text writes under a heading that names the part.
  function meijinTrialReads(project, source, targetId) {
    source = source.replace(/\r\n?/g, '\n');
    const owner = project.components.find(c => c.id === targetId)?.name, sources = [source];
    if (owner && /^[^\s、。「」【】（）()]+$/.test(owner)) {
      sources.push(`作品を動かしたとき、${owner}は、\n` + source.split('\n').map(line => line.trim() ? '  ' + line : line).join('\n'));
      // A part's body names no subject (or names 自分): in a 名人 text the part is written as the subject.
      const named = text => project.components.some(c => text.startsWith(c.name) && /^[はがともや、]/.test(text.slice(c.name.length)));
      sources.push(source.split('\n').map(line => {
        const [, indent, text] = /^(\s*)([\s\S]*)$/.exec(line);
        if (!text || /^(?:もし|そうでなければ|ずっと|次のことを|※)/.test(text) || /(?:とき|たら|ごとに)、$/.test(text) || named(text)) return line;
        return indent + owner + 'は、' + text.replace(/^自分(?:は|が)、?/, '');
      }).join('\n'));
    }
    // A text that does not even read as 名人 text is not compiled (the code view tries this on every change).
    let symbols = null;
    return sources.some(text => {
      try { if (!parseSyntax(text, { symbols: symbols ||= buildSymbols(project), meijin: true }).ast) return false; } catch (error) { if (!(error instanceof AkariError)) throw error; return false; }
      const trial = cloneDesignProject(project);
      trial.scripts = [{ id: 'meijin-reading', mode: 'meijin', targetId: MEIJIN_OWNER, event: 'start', source: text }];
      try { return compileProject(trial).errors.length === 0; } catch (error) { if (!(error instanceof AkariError)) throw error; return false; }
    });
  }
  function meijinFormsInOrdinary(project, errors) {
    let out = errors;
    for (const script of project.scripts) {
      if (isMeijinScript(script) || !script.source?.trim()) continue;
      const key = scriptSourceKey(script), at = out.findIndex(e => e.where === key), first = out[at];
      if (!genericReadingError(first) || !meijinTrialReads(project, script.source, script.targetId)) continue;
      const { proposals, draftRole, ...location } = first;
      out = [...out.slice(0, at), { ...location, code: 'S317', message: MEIJIN_ONLY_MESSAGE }, ...out.slice(at).filter(e => e.where !== key)];
    }
    return out;
  }

  // Independent of the formatter and block schema: executable hierarchy plus source-order comment anchors.
  function syntaxComparison(ast) {
    const consumedUnit = (node, key, i) => {
      if (key === 'count' && node.kind === 'RepeatCount') return '回';
      if (key === 'seconds' && ['WaitTime', 'Say', 'ContinuousRule', 'MotionCommand'].includes(node.kind)) return '秒';
      if (['x', 'y'].includes(key) && node.kind === 'MotionCommand') return '歩';
      if (key === 'distance' && node.kind === 'ContinuousRule') return '歩';
      if (key === 'index' && ['ListItemRead', 'ListInsert', 'ListReplace', 'ListDelete'].includes(node.kind)) return '番目';
      if (key !== 'args') return null;
      if (node.kind === 'MotionCommand' && !['POINT_TO', 'BOUNCE', 'GOTO_PART'].includes(node.op))
        return ['SET_DIRECTION', 'TURN_RIGHT', 'TURN_LEFT'].includes(node.op) ? '度' : '歩';
      if (node.kind === 'LooksCommand' && node.op === 'SET_SCALE') return '％';
      if (node.kind === 'SoundCommand')
        return node.op === 'SET_VOLUME' ? '％' : ['TONE', 'TONE_WAIT'].includes(node.op) ? i === 0 ? 'Hz' : '秒' : null;
      return null;
    };
    const shape = (value, roleUnit = null) => {
      if (Array.isArray(value)) return value.filter((x) => x?.kind !== 'CommentLine').map(x => shape(x));
      if (!value || typeof value !== 'object') return value;
      // Unit role annotations consumed at an effect boundary do not change a
      // stored value. Data expressions retain their units in this comparison.
      if (roleUnit && value.kind === 'QuantityLiteral' && value.unit === roleUnit)
        return shape(value.value, roleUnit);
      const out = {};
      for (const [key, child] of Object.entries(value)) {
        if (['sourceSpan', 'endLine', 'raw', 'source'].includes(key)) continue;
        // A group wait always means the broadcast just before it (LANGUAGE.md 439); the
        // reference name is derived from that position, so it is not part of the meaning.
        if (key === 'broadcastRef') continue;
        // A statement without a subject is 自分's; a wait without one is the whole flow's (みんな).
        if (key === 'actorRef' && child?.kind === (EVERYONE_WAITS.has(value.kind) ? 'all' : 'self')) continue;
        if (key === 'argumentNames' && Array.isArray(child) && child.length === 0) continue;
        // The subject's が is how the sentence is written, not what it does.
        if (key === 'particle' && value.kind === 'named') continue;
        // A script without rules has no rule list; an emptied block rule list is the same script.
        if (key === 'rules' && Array.isArray(child) && child.length === 0) continue;
        out[key] =
          key === 'qualifier' && child === 'exact' && bareName(value.name) ? null
            : key === 'args' && Array.isArray(child) ? child.map((arg, i) => shape(arg, consumedUnit(value, key, i)))
              : shape(child, consumedUnit(value, key));
      }
      return out;
    };
    const comments = [];
    const walk = (nodes) => {
      for (const node of nodes) {
        if (node.kind === 'CommentLine') {
          comments.push(['comment', node.text]);
          continue;
        }
        comments.push(['statement']);
        if (node.kind === 'IfStatement') {
          walk(node.thenBody);
          if (node.hasElse) {
            comments.push(['else']);
            walk(node.elseBody);
          }
        } else if (Array.isArray(node.body)) walk(node.body);
      }
    };
    if (ast.kind === 'Script') {walk(ast.body);for(const unit of ast.units||[])walk(unit.body);}
    else walk([ast]);
    return { execution: shape(ast), comments };
  }
  function astEquivalent(left, right) {
    return stableJson(syntaxComparison(left)) === stableJson(syntaxComparison(right));
  }
  function stableJson(v) {
    if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
    if (v && typeof v === 'object') {
      return (
        '{' +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + stableJson(v[k]))
          .join(',') +
        '}'
      );
    }
    return JSON.stringify(v);
  }

  function u16le(b, o) {
    if (o + 2 > b.length) throw new AkariError('F509', 'ファイルの 中身が、とちゅうで 切れて います。ほかの ファイルを えらんで ください');
    return b[o] | (b[o + 1] << 8);
  }
  function u32le(b, o) {
    if (o + 4 > b.length) throw new AkariError('F509', 'ファイルの 中身が、とちゅうで 切れて います。ほかの ファイルを えらんで ください');
    return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] * 0x1000000)) >>> 0;
  }
  function u16be(b, o) {
    if (o + 2 > b.length) throw new AkariError('F509', 'ファイルの 中身が、とちゅうで 切れて います。ほかの ファイルを えらんで ください');
    return (b[o] << 8) | b[o + 1];
  }
  function u32be(b, o) {
    if (o + 4 > b.length) throw new AkariError('F509', 'ファイルの 中身が、とちゅうで 切れて います。ほかの ファイルを えらんで ください');
    return (b[o] * 0x1000000 + b[o + 1] * 0x10000 + b[o + 2] * 0x100 + b[o + 3]) >>> 0;
  }
  function ascii(b, o, n) {
    if (o + n > b.length) return '';
    return String.fromCharCode(...b.subarray(o, o + n));
  }
  function checkImageLimits(w, h) {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1)
      throw new AkariError('F510', '絵の たてと よこの 大きさが、正しく ありません。ほかの 絵を えらんで ください');
    if (w > LIMITS.imageWidth || h > LIMITS.imageHeight || w * h > LIMITS.imagePixels)
      throw new AkariError('F504', '絵が 大きすぎます。もっと 小さい 絵を えらんで ください');
  }
  function sniffImage(bytes) {
    if (
      bytes.length >= 24 &&
      bytes[0] === 0x89 &&
      ascii(bytes, 1, 3) === 'PNG' &&
      bytes[4] === 13 &&
      bytes[5] === 10 &&
      bytes[6] === 26 &&
      bytes[7] === 10
    ) {
      if (u32be(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== 'IHDR')
        throw new AkariError('F510', 'この 絵の ファイルは、こわれて いる ようです。ほかの 絵を えらんで ください');
      const w = u32be(bytes, 16),
        h = u32be(bytes, 20);
      checkImageLimits(w, h);
      let pos = 8,
        actl = false;
      while (pos + 12 <= bytes.length) {
        const len = u32be(bytes, pos),
          end = pos + 12 + len;
        if (end > bytes.length) throw new AkariError('F509', 'この 絵の ファイルは、こわれて いる ようです。ほかの 絵を えらんで ください');
        const type = ascii(bytes, pos + 4, 4);
        if (type === 'acTL') actl = true;
        pos = end;
        if (type === 'IEND') break;
      }
      if (actl) throw new AkariError('F509', '動く 絵（アニメーション）は 使えません。動かない 絵を えらんで ください');
      return { mime: 'image/png', width: w, height: h };
    }
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      let pos = 2,
        w = 0,
        h = 0;
      const sof = new Set([
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
      ]);
      while (pos < bytes.length) {
        while (pos < bytes.length && bytes[pos] === 0xff) pos++;
        if (pos >= bytes.length) break;
        const m = bytes[pos++];
        if (m === 0xd9) break;
        if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue;
        if (pos + 2 > bytes.length) throw new AkariError('F509', 'この 絵の ファイルは、こわれて いる ようです。ほかの 絵を えらんで ください');
        const len = u16be(bytes, pos);
        if (len < 2 || pos + len > bytes.length)
          throw new AkariError('F509', 'この 絵の ファイルは、こわれて いる ようです。ほかの 絵を えらんで ください');
        if (sof.has(m)) {
          if (len < 7) throw new AkariError('F510', 'この 絵の ファイルは、こわれて いる ようです。ほかの 絵を えらんで ください');
          h = u16be(bytes, pos + 3);
          w = u16be(bytes, pos + 5);
          break;
        }
        if (m === 0xda) break;
        pos += len;
      }
      if (!w || !h) throw new AkariError('F510', 'この 絵の 大きさが 読みとれません。ほかの 絵を えらんで ください');
      checkImageLimits(w, h);
      return { mime: 'image/jpeg', width: w, height: h };
    }
    if (bytes.length >= 20 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
      const riff = u32le(bytes, 4);
      if (riff + 8 > bytes.length) throw new AkariError('F509', 'この 絵の ファイルは、こわれて いる ようです。ほかの 絵を えらんで ください');
      let pos = 12,
        w = 0,
        h = 0,
        animated = false;
      while (pos + 8 <= bytes.length) {
        const type = ascii(bytes, pos, 4),
          len = u32le(bytes, pos + 4),
          ps = pos + 8,
          end = ps + len;
        if (end > bytes.length) throw new AkariError('F509', 'この 絵の ファイルは、こわれて いる ようです。ほかの 絵を えらんで ください');
        if (type === 'ANIM' || type === 'ANMF') animated = true;
        if (type === 'VP8X') {
          if (len < 10) throw new AkariError('F510', 'この 絵の ファイルは、こわれて いる ようです。ほかの 絵を えらんで ください');
          if (bytes[ps] & 0x02) animated = true;
          w = 1 + bytes[ps + 4] + (bytes[ps + 5] << 8) + (bytes[ps + 6] << 16);
          h = 1 + bytes[ps + 7] + (bytes[ps + 8] << 8) + (bytes[ps + 9] << 16);
        } else if (type === 'VP8L' && !w) {
          if (len < 5 || bytes[ps] !== 0x2f) throw new AkariError('F510', 'この 絵の ファイルは、こわれて いる ようです。ほかの 絵を えらんで ください');
          const b1 = bytes[ps + 1],
            b2 = bytes[ps + 2],
            b3 = bytes[ps + 3],
            b4 = bytes[ps + 4];
          w = 1 + (b1 | ((b2 & 0x3f) << 8));
          h = 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10));
        } else if (type === 'VP8 ' && !w) {
          if (
            len < 10 ||
            bytes[ps + 3] !== 0x9d ||
            bytes[ps + 4] !== 0x01 ||
            bytes[ps + 5] !== 0x2a
          )
            throw new AkariError('F510', 'この 絵の ファイルは、こわれて いる ようです。ほかの 絵を えらんで ください');
          w = u16le(bytes, ps + 6) & 0x3fff;
          h = u16le(bytes, ps + 8) & 0x3fff;
        }
        pos = end + (len & 1);
      }
      if (animated) throw new AkariError('F509', '動く 絵（アニメーション）は 使えません。動かない 絵を えらんで ください');
      if (!w || !h) throw new AkariError('F510', 'この 絵の 大きさが 読みとれません。ほかの 絵を えらんで ください');
      checkImageLimits(w, h);
      return { mime: 'image/webp', width: w, height: h };
    }
    throw new AkariError('F509', 'この ファイルは 絵として 使えません。ほかの 絵の ファイルを えらんで ください', 0, 0, '使える 絵の ファイル：PNG / JPEG / WebP');
  }
  function parseWav(bytes) {
    if (bytes.length < 44 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE')
      throw new AkariError('F509', 'この 音の ファイルは、こわれて いる ようです。ほかの 音を えらんで ください');
    const riff = u32le(bytes, 4);
    if (riff + 8 > bytes.length) throw new AkariError('F511', 'この 音の ファイルは、こわれて いる ようです。ほかの 音を えらんで ください');
    let pos = 12,
      fmt = null,
      data = null;
    while (pos + 8 <= bytes.length) {
      const type = ascii(bytes, pos, 4),
        len = u32le(bytes, pos + 4),
        ps = pos + 8,
        end = ps + len;
      if (end > bytes.length) throw new AkariError('F511', 'この 音の ファイルは、こわれて いる ようです。ほかの 音を えらんで ください');
      if (type === 'fmt ') {
        if (fmt) throw new AkariError('F511', 'この 音の ファイルは、こわれて いる ようです。ほかの 音を えらんで ください');
        if (len < 16) throw new AkariError('F511', 'この 音の ファイルは、こわれて いる ようです。ほかの 音を えらんで ください');
        fmt = {
          audioFormat: u16le(bytes, ps),
          channels: u16le(bytes, ps + 2),
          sampleRate: u32le(bytes, ps + 4),
          byteRate: u32le(bytes, ps + 8),
          blockAlign: u16le(bytes, ps + 12),
          bitsPerSample: u16le(bytes, ps + 14),
        };
      } else if (type === 'data') {
        if (data) throw new AkariError('F511', 'この 音の ファイルは、こわれて いる ようです。ほかの 音を えらんで ください');
        data = bytes.slice(ps, end);
      }
      pos = end + (len & 1);
    }
    if (!fmt || !data) throw new AkariError('F511', 'この 音の ファイルは、こわれて いる ようです。ほかの 音を えらんで ください');
    if (fmt.audioFormat !== 1) throw new AkariError('F509', 'この 音の ファイルは、使えない 形です。ほかの 音を えらんで ください');
    if (![8, 16, 24, 32].includes(fmt.bitsPerSample))
      throw new AkariError('F511', 'この 音の ファイルは、使えない 形です。ほかの 音を えらんで ください');
    if (
      !fmt.channels ||
      !fmt.sampleRate ||
      !fmt.blockAlign ||
      !data.length ||
      data.length % fmt.blockAlign !== 0 ||
      fmt.blockAlign !== (fmt.channels * fmt.bitsPerSample) / 8 ||
      fmt.byteRate !== fmt.sampleRate * fmt.blockAlign
    )
      throw new AkariError('F511', 'この 音の ファイルは、こわれて いる ようです。ほかの 音を えらんで ください');
    return { ...fmt, data };
  }
  function rebuildCanonicalWav(parsed) {
    const size = 44 + parsed.data.length + (parsed.data.length & 1),
      out = new Uint8Array(size),
      dv = new DataView(out.buffer),
      put = (o, t) => {
        for (let i = 0; i < t.length; i++) out[o + i] = t.charCodeAt(i);
      };
    put(0, 'RIFF');
    dv.setUint32(4, size - 8, true);
    put(8, 'WAVE');
    put(12, 'fmt ');
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, parsed.channels, true);
    dv.setUint32(24, parsed.sampleRate, true);
    dv.setUint32(28, parsed.byteRate, true);
    dv.setUint16(32, parsed.blockAlign, true);
    dv.setUint16(34, parsed.bitsPerSample, true);
    put(36, 'data');
    dv.setUint32(40, parsed.data.length, true);
    out.set(parsed.data, 44);
    return out;
  }
  function parseMp3FrameMeta(bytes) {
    if (bytes.length < 4 || bytes[0] !== 0xff || (bytes[1] & 0xe0) !== 0xe0)
      throw new AkariError('F511', 'この 音の ファイルは、音として 読みとれません。ほかの 音を えらんで ください');
    const ver = (bytes[1] >> 3) & 3,
      layer = (bytes[1] >> 1) & 3,
      br = (bytes[2] >> 4) & 15,
      sri = (bytes[2] >> 2) & 3;
    if (ver === 1 || layer !== 1 || br === 0 || br === 15 || sri === 3)
      throw new AkariError('F511', 'この 音の ファイルは、音として 読みとれません。ほかの 音を えらんで ください');
    const base = [44100, 48000, 32000][sri],
      sampleRate = ver === 3 ? base : ver === 2 ? base / 2 : base / 4,
      channels = ((bytes[3] >> 6) & 3) === 3 ? 1 : 2;
    return { sampleRate, channels };
  }
  function stripMp3Metadata(bytes) {
    let start = 0,
      end = bytes.length;
    if (bytes.length >= 10 && ascii(bytes, 0, 3) === 'ID3') {
      for (let i = 6; i < 10; i++)
        if (bytes[i] & 0x80) throw new AkariError('F511', 'この 音の ファイルは、こわれて いる ようです。ほかの 音を えらんで ください');
      const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9],
        footer = bytes[3] === 4 && bytes[5] & 0x10 ? 10 : 0;
      start = 10 + size + footer;
      if (start > end) throw new AkariError('F511', 'この 音の ファイルは、こわれて いる ようです。ほかの 音を えらんで ください');
    }
    if (end - start >= 128 && ascii(bytes, end - 128, 3) === 'TAG') end -= 128;
    const out = bytes.slice(start, end);
    parseMp3FrameMeta(out);
    return out;
  }
  function parseFlac(bytes) {
    const bad = () => { throw new AkariError('F511', 'この 音の ファイルは、こわれて いる ようです。ほかの 音を えらんで ください'); };
    let pos = 4, stream = null, last = false;
    while (!last) {
      if (pos + 4 > bytes.length) bad();
      const type = bytes[pos] & 127, size = (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
      last = !!(bytes[pos] & 128);
      if (type === 127 || pos + 4 + size > bytes.length || (!stream && type !== 0)) bad();
      if (type === 0) {
        if (stream || size !== 34) bad();
        stream = bytes.slice(pos + 4, pos + 38);
      }
      pos += 4 + size;
    }
    if (!stream || pos + 2 > bytes.length || bytes[pos] !== 255 || (bytes[pos + 1] & 254) !== 248) bad();
    const sampleRate = (stream[10] << 12) | (stream[11] << 4) | (stream[12] >> 4),
      channels = ((stream[12] >> 1) & 7) + 1,
      bits = (((stream[12] & 1) << 4) | (stream[13] >> 4)) + 1,
      samples = (stream[13] & 15) * 4294967296 + u32be(stream, 14);
    if (u16be(stream, 0) < 16 || u16be(stream, 2) < u16be(stream, 0) || bits < 4 || bits > 32) bad();
    const clean = new Uint8Array(42 + bytes.length - pos);
    clean.set([102, 76, 97, 67, 128, 0, 0, 34]);
    clean.set(stream, 8); clean.set(bytes.subarray(pos), 42);
    return { mime: 'audio/flac', clean, frameMeta: { sampleRate, channels },
      duration: samples ? samples / sampleRate : null };
  }
  function parseOggOpus(bytes) {
    const bad = () => { throw new AkariError('F511', 'この 音の ファイルは、こわれて いる ようです。ほかの 音を えらんで ください'); };
    const table = Uint32Array.from({ length: 256 }, (_, n) => {
      let crc = n << 24;
      for (let i = 0; i < 8; i++) crc = (crc << 1) ^ (crc & 0x80000000 ? 0x04c11db7 : 0);
      return crc >>> 0;
    });
    const crc = (data, start, end) => {
      let value = 0;
      for (let p = start; p < end; p++) {
        const byte = p >= start + 22 && p < start + 26 ? 0 : data[p];
        value = ((value << 8) ^ table[((value >>> 24) ^ byte) & 255]) >>> 0;
      }
      return value;
    };
    const pages = [], packets = [], clean = bytes.slice();
    let pos = 0, serial = null, sequence = 0, parts = [], packetSize = 0, count = 0,
      ended = false, finalGranule = null, previousGranule = 0;
    while (pos < bytes.length) {
      if (ended || pos + 27 > bytes.length || ascii(bytes, pos, 4) !== 'OggS' || bytes[pos + 4] !== 0) bad();
      const flags = bytes[pos + 5], segments = bytes[pos + 26], headerEnd = pos + 27 + segments,
        stream = u32le(bytes, pos + 14), seq = u32le(bytes, pos + 18);
      if (flags & ~7 || headerEnd > bytes.length || !segments) bad();
      if (serial === null) { serial = stream; if (flags !== 2 || seq !== 0) bad(); }
      else if (stream !== serial || flags & 2) bad();
      if (seq !== sequence++ || !!(flags & 1) !== !!parts.length) bad();
      let end = headerEnd;
      for (let i = 0; i < segments; i++) end += bytes[pos + 27 + i];
      if (end > bytes.length || crc(bytes, pos, end) !== u32le(bytes, pos + 22)) bad();
      let body = headerEnd;
      for (let i = 0; i < segments; i++) {
        const size = bytes[pos + 27 + i];
        parts.push([body, size]); packetSize += size; body += size;
        if (size < 255) {
          if (!packetSize) bad();
          if (count < 2) {
            const packet = new Uint8Array(packetSize); let at = 0;
            for (const [start, length] of parts) { packet.set(bytes.subarray(start, start + length), at); at += length; }
            packets.push({ bytes: packet, parts });
          }
          count++; parts = []; packetSize = 0;
        }
      }
      const lo = u32le(bytes, pos + 6), hi = u32le(bytes, pos + 10);
      const granule = hi === 0xffffffff && lo === 0xffffffff ? null : hi * 4294967296 + lo;
      if (granule !== null) {
        if (!Number.isSafeInteger(granule) || granule < previousGranule) bad();
        previousGranule = granule;
      }
      if (pages.length === 0 && (count !== 1 || parts.length || granule !== 0)) bad();
      ended = !!(flags & 4); if (ended) finalGranule = granule;
      pages.push([pos, end]); pos = end;
    }
    if (!ended || parts.length || count < 3 || finalGranule === null) bad();
    const head = packets[0].bytes, tags = packets[1].bytes;
    if (head.length < 19 || ascii(head, 0, 8) !== 'OpusHead')
      throw new AkariError('F509', 'この 音の ファイルは、使えない 形です。ほかの 音を えらんで ください');
    if (head[8] < 1 || head[8] > 15 || head[9] < 1) bad();
    const channels = head[9], mapping = head[18], preSkip = u16le(head, 10);
    if (mapping === 0) { if (channels > 2 || (head[8] === 1 && head.length !== 19)) bad(); }
    else {
      if (mapping !== 1 || head.length < 21 + channels || !head[19] || head[20] > head[19]) bad();
      for (let i = 0; i < channels; i++) if (head[21 + i] !== 255 && head[21 + i] >= head[19] + head[20]) bad();
    }
    if (tags.length < 16 || ascii(tags, 0, 8) !== 'OpusTags') bad();
    let tagPos = 12 + u32le(tags, 8);
    if (tagPos + 4 > tags.length) bad();
    const comments = u32le(tags, tagPos); tagPos += 4;
    if (comments > (tags.length - tagPos) / 4) bad();
    for (let i = 0; i < comments; i++) {
      if (tagPos + 4 > tags.length) bad();
      const size = u32le(tags, tagPos); tagPos += 4 + size;
      if (tagPos > tags.length) bad();
    }
    // Keep packet/page boundaries and granule positions; replace comments and
    // vendor data with a valid empty OpusTags packet plus zero padding.
    const empty = new Uint8Array(tags.length); empty.set([79,112,117,115,84,97,103,115]);
    let at = 0;
    for (const [start, length] of packets[1].parts) { clean.set(empty.subarray(at, at + length), start); at += length; }
    for (const [start, end] of pages) new DataView(clean.buffer).setUint32(start + 22, crc(clean, start, end), true);
    if (finalGranule <= preSkip) bad();
    return { mime: 'audio/ogg', clean, frameMeta: { channels, sampleRate: 48000 },
      duration: (finalGranule - preSkip) / 48000 };
  }
  function parseM4a(bytes) {
    const bad = () => { throw new AkariError('F511', 'この 音の ファイルは、こわれて いる ようです。ほかの 音を えらんで ください'); };
    const unsupported = () => { throw new AkariError('F509', 'この 音の ファイルは、使えない 形です。ほかの 音を えらんで ください'); };
    const boxes = (start, end) => {
      const result = [];
      while (start < end) {
        if (start + 8 > end) bad();
        let size = u32be(bytes, start), header = 8;
        if (size === 1) {
          if (start + 16 > end) bad();
          size = u32be(bytes, start + 8) * 4294967296 + u32be(bytes, start + 12); header = 16;
        } else if (size === 0) size = end - start;
        if (!Number.isSafeInteger(size) || size < header || start + size > end) bad();
        result.push({ type: ascii(bytes, start + 4, 4), start, data: start + header, end: start + size });
        start += size;
      }
      return result;
    };
    const one = (list, type) => { const found = list.filter(b => b.type === type); if (found.length !== 1) bad(); return found[0]; };
    const children = box => boxes(box.data, box.end);
    const top = boxes(0, bytes.length), ftyp = one(top, 'ftyp'), moov = one(top, 'moov'),
      mdats = top.filter(b => b.type === 'mdat');
    if (top[0] !== ftyp || ftyp.end - ftyp.data < 8 || (ftyp.end - ftyp.data) % 4 || !mdats.length) bad();
    const brands = [ascii(bytes, ftyp.data, 4)];
    for (let p = ftyp.data + 8; p < ftyp.end; p += 4) brands.push(ascii(bytes, p, 4));
    if (!brands.some(b => ['M4A ', 'isom', 'iso2', 'mp41', 'mp42'].includes(b)) || top.some(b => b.type === 'moof')) unsupported();
    const movie = children(moov), tracks = movie.filter(b => b.type === 'trak');
    if (tracks.length !== 1 || movie.some(b => b.type === 'mvex')) unsupported();
    const track = children(tracks[0]), mdia = one(track, 'mdia'), media = children(mdia),
      hdlr = one(media, 'hdlr'), mdhd = one(media, 'mdhd');
    if (hdlr.end - hdlr.data < 24 || ascii(bytes, hdlr.data + 8, 4) !== 'soun') unsupported();
    const minf = one(media, 'minf'), mediaInfo = children(minf), stbl = one(mediaInfo, 'stbl'),
      table = children(stbl), stsd = one(table, 'stsd');
    if (stsd.data + 8 > stsd.end || u32be(bytes, stsd.data) !== 0 || u32be(bytes, stsd.data + 4) !== 1) unsupported();
    const entries = boxes(stsd.data + 8, stsd.end), entry = one(entries, 'mp4a'), p = entry.data;
    if (entries.length !== 1 || p + 28 > entry.end) bad();
    const entryVersion = u16be(bytes, p + 8);
    if (entryVersion > 1) unsupported();
    const entryChildren = boxes(p + 28 + (entryVersion === 1 ? 16 : 0), entry.end), esds = one(entryChildren, 'esds');
    const descriptor = (start, end) => {
      if (start >= end) bad();
      const type = bytes[start++]; let size = 0, terminated = false;
      for (let i = 0; i < 4; i++) {
        if (start >= end) bad();
        const byte = bytes[start++]; size = size * 128 + (byte & 127);
        if (!(byte & 128)) { terminated = true; break; }
      }
      if (!terminated || start + size > end) bad();
      return { type, data: start, end: start + size };
    };
    if (esds.data + 4 > esds.end || u32be(bytes, esds.data) !== 0) bad();
    const es = descriptor(esds.data + 4, esds.end);
    if (es.type !== 3 || es.data + 3 > es.end) bad();
    const flags = bytes[es.data + 2]; let at = es.data + 3;
    if (flags & 128) at += 2;
    if (flags & 64) { if (at >= es.end) bad(); at += 1 + bytes[at]; }
    if (flags & 32) at += 2;
    const config = descriptor(at, es.end);
    if (config.type !== 4 || config.data + 13 > config.end) bad();
    if (bytes[config.data] !== 0x40 || (bytes[config.data + 1] >> 2) !== 5) unsupported();
    const asc = descriptor(config.data + 13, config.end);
    if (asc.type !== 5) bad();
    let bit = asc.data * 8;
    const read = n => {
      if (bit + n > asc.end * 8) bad(); let value = 0;
      while (n--) { value = value * 2 + ((bytes[bit >> 3] >> (7 - (bit & 7))) & 1); bit++; }
      return value;
    };
    const objectType = read(5), rateIndex = read(4),
      sampleRate = rateIndex === 15 ? read(24) : [96000,88200,64000,48000,44100,32000,24000,22050,16000,12000,11025,8000,7350][rateIndex],
      channels = read(4);
    if (objectType !== 2 || !sampleRate || ![1,2].includes(channels)) unsupported();
    read(1); if (read(1) || read(1)) unsupported();
    if (asc.end * 8 - bit >= 11) {
      if (read(11) !== 0x2b7 || read(5) !== 5 || read(1)) unsupported();
    }
    while (bit < asc.end * 8) if (read(1)) unsupported();
    const stsz = one(table, 'stsz'), stsc = one(table, 'stsc'), stts = one(table, 'stts'),
      offsets = table.filter(b => b.type === 'stco' || b.type === 'co64');
    if (offsets.length !== 1 || stsz.data + 12 > stsz.end || stsc.data + 8 > stsc.end || stts.data + 8 > stts.end) bad();
    const size = u32be(bytes, stsz.data + 4), sampleCount = u32be(bytes, stsz.data + 8),
      chunkMapCount = u32be(bytes, stsc.data + 4), times = u32be(bytes, stts.data + 4), offset = offsets[0], width = offset.type === 'stco' ? 4 : 8;
    if (offset.data + 8 > offset.end) bad();
    const chunks = u32be(bytes, offset.data + 4);
    if (!sampleCount || sampleCount > bytes.length || !chunks || !chunkMapCount || !times ||
      stsz.end !== stsz.data + 12 + (size ? 0 : sampleCount * 4) ||
      stsc.end !== stsc.data + 8 + chunkMapCount * 12 || stts.end !== stts.data + 8 + times * 8 ||
      offset.end !== offset.data + 8 + chunks * width) bad();
    const chunkMap = [];
    for (let i = 0; i < chunkMapCount; i++) {
      const start = stsc.data + 8 + i * 12, first = u32be(bytes, start), perChunk = u32be(bytes, start + 4);
      if (!first || first > chunks || !perChunk || perChunk > sampleCount || u32be(bytes, start + 8) !== 1 ||
        (i === 0 ? first !== 1 : first <= chunkMap[i - 1].first)) bad();
      chunkMap.push({ first, perChunk });
    }
    let sample = 0, mapIndex = 0;
    const ranges = [];
    for (let i = 1; i <= chunks; i++) {
      if (mapIndex + 1 < chunkMap.length && i === chunkMap[mapIndex + 1].first) mapIndex++;
      const start = offset.data + 8 + (i - 1) * width;
      let address = width === 4 ? u32be(bytes, start) : u32be(bytes, start) * 4294967296 + u32be(bytes, start + 4);
      const chunkStart = address;
      for (let n = 0; n < chunkMap[mapIndex].perChunk; n++) {
        if (sample >= sampleCount) bad();
        const length = size || u32be(bytes, stsz.data + 12 + sample * 4); sample++;
        if (!length) bad(); address += length;
      }
      if (!Number.isSafeInteger(address) || !mdats.some(b => chunkStart >= b.data && address <= b.end)) bad();
      ranges.push([chunkStart, address]);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < ranges.length; i++) if (ranges[i][0] < ranges[i - 1][1]) bad();
    let totalSamples = 0;
    for (let i = 0; i < times; i++) {
      const count = u32be(bytes, stts.data + 8 + i * 8), delta = u32be(bytes, stts.data + 12 + i * 8);
      if (!count || !delta) bad(); totalSamples += count;
    }
    if (sample !== sampleCount || totalSamples !== sampleCount) bad();
    const clean = bytes.slice(), zeroBox = box => {
      clean.set([102,114,101,101], box.start + 4); clean.fill(0, box.data, box.end);
    };
    // Replacing metadata by same-sized free boxes preserves every chunk offset.
    const sanitize = (list, allowed) => { for (const box of list) if (!allowed.includes(box.type)) zeroBox(box); };
    sanitize(top, ['ftyp','moov','mdat']); sanitize(movie, ['mvhd','trak']);
    sanitize(track, ['tkhd','edts','mdia']); sanitize(media, ['mdhd','hdlr','minf']);
    sanitize(mediaInfo, ['smhd','dinf','stbl']);
    sanitize(table, ['stsd','stts','stsc','stsz','stco','co64','ctts','stss','sgpd','sbgp']);
    sanitize(entryChildren, ['esds','btrt']);
    for (const box of [...movie, ...track, mdhd]) if (['mvhd','tkhd','mdhd'].includes(box.type)) {
      const length = bytes[box.data] === 0 ? 8 : bytes[box.data] === 1 ? 16 : 0;
      if (!length || box.data + 4 + length > box.end) bad();
      clean.fill(0, box.data + 4, box.data + 4 + length);
    }
    clean.fill(0, hdlr.data + 24, hdlr.end);
    for (const box of track.filter(b => b.type === 'edts')) sanitize(children(box), ['elst']);
    for (const box of mediaInfo.filter(b => b.type === 'dinf')) {
      const list = children(box), dref = one(list, 'dref'); sanitize(list, ['dref']);
      if (dref.data + 8 > dref.end || u32be(bytes, dref.data + 4) !== 1) bad();
      const refs = boxes(dref.data + 8, dref.end);
      if (refs.length !== 1 || refs[0].type !== 'url ' || refs[0].end - refs[0].data !== 4 || u32be(bytes, refs[0].data) !== 1) unsupported();
    }
    return { mime: 'audio/mp4', clean, frameMeta: { channels, sampleRate } };
  }
  function sniffAudio(bytes) {
    if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE')
      return { mime: 'audio/wav', parsed: parseWav(bytes) };
    if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'fLaC') return parseFlac(bytes);
    if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'OggS') return parseOggOpus(bytes);
    if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') return parseM4a(bytes);
    const id3 = bytes.length >= 10 && ascii(bytes, 0, 3) === 'ID3',
      frame = bytes.length >= 4 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    if (!id3 && !frame) throw new AkariError('F509', 'この ファイルは 音として 使えません。ほかの 音の ファイルを えらんで ください', 0, 0, '使える 音の ファイル：MP3 / PCM WAV / M4A（AAC-LC）/ FLAC / Ogg Opus');
    const clean = stripMp3Metadata(bytes);
    return { mime: 'audio/mpeg', clean, frameMeta: parseMp3FrameMeta(clean) };
  }
  function audioContainerMeta(sn) {
    return sn.mime === 'audio/wav'
      ? { channels: sn.parsed.channels, sampleRate: sn.parsed.sampleRate }
      : sn.frameMeta;
  }
  function checkAudioContainerLimits(m) {
    if (!m || !Number.isInteger(m.channels) || m.channels < 1 || m.channels > LIMITS.audioChannels)
      throw new AkariError('F511', 'この 音の ファイルは、使えない 形です。ほかの 音を えらんで ください');
    if (
      !Number.isInteger(m.sampleRate) ||
      m.sampleRate < LIMITS.audioSampleRateMin ||
      m.sampleRate > LIMITS.audioSampleRateMax
    )
      throw new AkariError('F511', 'この 音の ファイルは、使えない 形です。ほかの 音を えらんで ください');
  }

  function awaitMedia(promise, code, disposeLate = null) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(
          new AkariError(
            code,
            '絵や音を 読みこむのに 10秒より 長く かかったので、やめました。もう 一度 ためすか、小さい ファイルを えらんで ください',
          ),
        );
      }, 10000);
      Promise.resolve(promise).then(
        (value) => {
          if (settled) {
            disposeLate?.(value);
            return;
          }
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  async function decodeImageBytes(bytes, mime) {
    const blob = new Blob([bytes], { type: mime });
    let bitmap = null,
      img = null,
      url = null;
    try {
      if (typeof createImageBitmap === 'function') {
        bitmap = await awaitMedia(
          createImageBitmap(blob, { imageOrientation: 'from-image' }),
          'F510',
          (value) => value.close?.(),
        );
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          close: () => bitmap.close?.(),
        };
      }
      url = URL.createObjectURL(blob);
      img = new Image();
      img.src = url;
      await awaitMedia(img.decode(), 'F510');
      return {
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        close: () => URL.revokeObjectURL(url),
      };
    } catch (e) {
      if (url) URL.revokeObjectURL(url);
      throw new AkariError('F510', 'この 絵を 読みとれません。ほかの 絵を えらんで ください', 0, 0, e?.message || '');
    }
  }
  async function canonicalizeImage(fileBytes) {
    const bytes = fileBytes instanceof Uint8Array ? fileBytes : new Uint8Array(fileBytes);
    if (bytes.length > LIMITS.importFileBytes)
      throw new AkariError('F504', 'この ファイルは 大きすぎて 使えません。もっと 小さい ファイルを えらんで ください', 0, 0, `入れられるファイルは${LIMITS.importFileBytes / 1048576}MiBまで`);
    const pre = sniffImage(bytes),
      dec = await decodeImageBytes(bytes, pre.mime);
    try {
      checkImageLimits(dec.width, dec.height);
      const canvas = document.createElement('canvas');
      canvas.width = dec.width;
      canvas.height = dec.height;
      const cx = canvas.getContext('2d', { alpha: true });
      cx.drawImage(dec.source, 0, 0);
      const quality = pre.mime === 'image/png' ? undefined : 0.92;
      const blob = await awaitMedia(
        new Promise((res) => canvas.toBlob(res, pre.mime, quality)),
        'F510',
      );
      if (!blob || blob.type !== pre.mime)
        throw new AkariError('F510', 'この 絵を、あかりで 使える 形に できませんでした。ほかの 絵を えらんで ください');
      const out = new Uint8Array(await blob.arrayBuffer());
      if (out.length > LIMITS.imageBytes)
        throw new AkariError('F504', 'この 絵は、あかりで 使える 形に すると 大きすぎます。もっと 小さい 絵を えらんで ください', 0, 0, '使える形にした絵は4MiBまで');
      const post = sniffImage(out),
        check = await decodeImageBytes(out, post.mime);
      try {
        if (check.width !== post.width || check.height !== post.height)
          throw new AkariError('F510', 'この 絵を あかりで 使える 形に したら、大きさが かわって しまいました。ほかの 絵を えらんで ください');
      } finally {
        check.close();
      }
      return { mime: post.mime, bytes: out, width: post.width, height: post.height };
    } finally {
      dec.close();
    }
  }
  async function audioContextForValidation() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) throw new AkariError('R415', 'この ブラウザでは 音を 使えません。ほかの ブラウザで ためして ください');
    return new AC();
  }
  async function decodeAudioMeta(bytes) {
    const ac = await audioContextForValidation();
    try {
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        buf = await awaitMedia(ac.decodeAudioData(copy), 'F511');
      return { duration: buf.duration, channels: buf.numberOfChannels, sampleRate: buf.sampleRate };
    } catch (e) {
      throw new AkariError('F511', 'この 音を 読みとれません。ほかの 音を えらんで ください', 0, 0, e?.message || '');
    } finally {
      try {
        await awaitMedia(ac.close(), 'F511');
      } catch (_) {}
    }
  }
  function checkAudioLimits(m) {
    if (!(m.duration > 0) || m.duration > LIMITS.audioDuration)
      throw new AkariError(
        m.duration > LIMITS.audioDuration ? 'F504' : 'F511',
        'この 音は 長すぎるか、長さが 読みとれません。ほかの 音を えらんで ください',
      );
    checkAudioContainerLimits(m);
  }
  async function canonicalizeAudio(fileBytes) {
    const bytes = fileBytes instanceof Uint8Array ? fileBytes : new Uint8Array(fileBytes);
    if (bytes.length > LIMITS.importFileBytes)
      throw new AkariError('F504', 'この ファイルは 大きすぎて 使えません。もっと 小さい ファイルを えらんで ください', 0, 0, `入れられるファイルは${LIMITS.importFileBytes / 1048576}MiBまで`);
    const sn = sniffAudio(bytes),
      containerMeta = audioContainerMeta(sn);
    checkAudioContainerLimits(containerMeta);
    if (sn.duration != null) checkAudioLimits({ ...containerMeta, duration: sn.duration });
    const out = sn.mime === 'audio/wav' ? rebuildCanonicalWav(sn.parsed) : sn.clean;
    if (out.length > LIMITS.audioBytes)
      throw new AkariError('F504', 'この 音は、あかりで 使える 形に すると 大きすぎます。もっと 短い 音を えらんで ください', 0, 0, '使える形にした音は6MiBまで');
    const decoded = await decodeAudioMeta(out);
    if (decoded.channels !== containerMeta.channels)
      throw new AkariError('F511', 'この 音の ファイルは、中身が 合って いません。ほかの 音を 使って ください');
    if (sn.duration != null && Math.abs(decoded.duration - sn.duration) > 0.02)
      throw new AkariError('F511', 'この 音の ファイルは、書いて ある 長さと 本当の 長さが 合いません。ほかの 音を 使って ください');
    const meta = {
      duration: decoded.duration,
      channels: containerMeta.channels,
      sampleRate: containerMeta.sampleRate,
    };
    checkAudioLimits(meta);
    return { mime: sn.mime, bytes: out, ...meta };
  }

  function collectReachableAssetIds(project) {
    const ids = new Set();
    for (const b of project.stage.backdrops) if (b.kind === 'image') ids.add(b.assetId);
    for (const c of project.components)
      if (c.type === 'sprite')
        for (const co of c.costumes) if (co.kind === 'image') ids.add(co.assetId);
    for (const snd of project.sounds) ids.add(snd.assetId);
    return ids;
  }
  function assetStateFingerprint(project, store) {
    const meta = [...collectReachableAssetIds(project)].sort().map((id) => {
      const a = store.get(id);
      return a ? `${a.id}:${a.kind}:${a.mime}:${a.byteLength}:${a.sha256}` : `${id}:MISSING`;
    });
    // Producer metadata is not an edit to the child's work.
    const { appVersion: producerLabel, ...content } = project;
    return stableJson(content) + '|' + meta.join('|');
  }
  function validateAssetReferences(project, store, { serializedAssetIds = null } = {}) {
    validateDesignProject(project);
    const reachable = collectReachableAssetIds(project);
    let raw = 0,
      imgCount = 0,
      audCount = 0,
      pixels = 0,
      duration = 0;
    const digestSeen = new Set();
    for (const id of reachable) {
      const a = store.get(id);
      if (!a) throw new AkariError('F503', `使うはずの絵や音「${id}」が ありません`);
      raw += a.byteLength;
      if (a.kind === 'image') {
        imgCount++;
        const m = a.meta || {};
        if (m.width && m.height) pixels += m.width * m.height;
      } else if (a.kind === 'audio') {
        audCount++;
        if (a.meta?.duration) duration += a.meta.duration;
      }
      const dk = `${a.kind}:${a.sha256}:${a.byteLength}`;
      if (digestSeen.has(dk)) throw new AkariError('F503', '同じ中身の絵や音が、2つ以上あります');
      digestSeen.add(dk);
    }
    if (
      reachable.size > LIMITS.assets ||
      imgCount > LIMITS.imageAssets ||
      audCount > LIMITS.audioAssets ||
      raw > LIMITS.assetRawTotal ||
      pixels > LIMITS.imagePixelsTotal ||
      duration > LIMITS.audioDurationTotal
    )
      throw new AkariError('F504', '作品の 絵や音が、多すぎるか 大きすぎます。使わない 絵や音を けして ください');
    for (const b of project.stage.backdrops)
      if (b.kind === 'image' && store.get(b.assetId)?.kind !== 'image')
        throw new AkariError('F509', '絵の はいけいが、絵では ない ものを 使って います');
    for (const c of project.components)
      if (c.type === 'sprite')
        for (const co of c.costumes)
          if (co.kind === 'image' && store.get(co.assetId)?.kind !== 'image')
            throw new AkariError('F509', '絵の すがたが、絵では ない ものを 使って います');
    for (const snd of project.sounds)
      if (store.get(snd.assetId)?.kind !== 'audio')
        throw new AkariError('F509', '音が、音では ない ものを 使って います');
    if (serializedAssetIds) {
      if (
        serializedAssetIds.size !== reachable.size ||
        [...serializedAssetIds].some((id) => !reachable.has(id))
      )
        throw new AkariError('F503', '作品ファイルに、使われて いない 絵や 音か、足りない 絵や 音が あります');
    }
    return true;
  }
  async function makeAssetBlob(id, kind, canonical) {
    const digest = await sha256(canonical.bytes);
    return {
      id,
      kind,
      mime: canonical.mime,
      byteLength: canonical.bytes.length,
      sha256: digest,
      bytes: canonical.bytes,
      meta: {
        width: canonical.width,
        height: canonical.height,
        duration: canonical.duration,
        channels: canonical.channels,
        sampleRate: canonical.sampleRate,
      },
    };
  }

  function designEntityIds(project) {
    const ids = new Set(['stage']);
    for (const b of project.stage.backdrops) ids.add(b.id);
    for (const d of [...project.projectData.variables, ...project.projectData.lists]) ids.add(d.id);
    for (const c of project.components) {
      ids.add(c.id);
      for (const d of [...c.localData.variables, ...c.localData.lists]) ids.add(d.id);
      for (const co of c.costumes || []) ids.add(co.id);
    }
    for (const x of [...project.actions, ...project.functions, ...project.sounds]) ids.add(x.id);
    return ids;
  }
  function orderedDataRecord(d) {
    return { id: d.id, name: d.name, initialValue: cloneDesignProject(d.initialValue),
      ...(Object.hasOwn(d, 'expectedUnit') ? { expectedUnit: d.expectedUnit } : {}) };
  }
  function orderedBackdropRecord(b) {
    return b.kind === 'color'
      ? { id: b.id, name: b.name, kind: 'color', value: b.value }
      : { id: b.id, name: b.name, kind: 'image', assetId: b.assetId, fit: b.fit, fill: b.fill };
  }
  function orderedCostumeRecord(c) {
    return c.kind === 'text'
      ? { id: c.id, name: c.name, kind: 'text', value: c.value }
      : { id: c.id, name: c.name, kind: 'image', assetId: c.assetId };
  }
  function orderedComponentRecord(c) {
    const out = {
      id: c.id,
      type: c.type,
      name: c.name,
      x: c.x,
      y: c.y,
      w: c.w,
      h: c.h,
      fg: c.fg,
      bg: c.bg,
      fontSize: c.fontSize,
      visible: c.visible,
      direction: normalizedDesignDirection(c.direction),
      scalePercent: c.scalePercent,
      text: c.text,
      localData: {
        variables: c.localData.variables.map(orderedDataRecord),
        lists: c.localData.lists.map(orderedDataRecord),
      },
    };
    if (c.type === 'sprite') {
      out.costumes = c.costumes.map(orderedCostumeRecord);
      out.costumeId = c.costumeId;
    }
    return out;
  }
  function serializedRoot(project, assetStore) {
    validateDesignProject(project);
    validateAssetReferences(project, assetStore);
    const reachable = [...collectReachableAssetIds(project)].sort(),
      assets = [];
    for (const id of reachable) {
      const a = assetStore.get(id);
      if (!a) throw new AkariError('F503', `絵や音「${id}」が ありません`);
      const dataBase64=AKARI_RUNTIME.verifiedAssetText(a);
      if (a.kind === 'image') {
        const sn = sniffImage(a.bytes);
        if (sn.mime !== a.mime)
          throw new AkariError('F509', `絵「${id}」のファイルの形が、記録と合いません`);
      } else if (a.kind === 'audio') {
        const sn = sniffAudio(a.bytes);
        if (sn.mime !== a.mime)
          throw new AkariError('F509', `音「${id}」のファイルの形が、記録と合いません`);
      } else throw new AkariError('F509', `絵や音「${id}」の種類が、正しく ありません`);
      assets.push({
        id: a.id,
        kind: a.kind,
        mime: a.mime,
        byteLength: a.byteLength,
        sha256: a.sha256,
        dataBase64,
      });
    }
    return {
      ...(extensionEnvelope(project) ? { extensions: extensionEnvelope(project) } : {}),
      schema: project.schema,
      appVersion: PRODUCT_RELEASE,
      languageContractId: project.languageContractId,
      formatVersion: project.formatVersion,
      name: project.name,
      stage: {
        id: project.stage.id,
        name: project.stage.name,
        width: project.stage.width,
        height: project.stage.height,
        backdrops: project.stage.backdrops.map(orderedBackdropRecord),
        backdropId: project.stage.backdropId,
        ...(Object.hasOwn(project.stage, 'showSpeechNames') ? {showSpeechNames: project.stage.showSpeechNames} : {}),
      },
      projectData: {
        variables: project.projectData.variables.map(orderedDataRecord),
        lists: project.projectData.lists.map(orderedDataRecord),
      },
      components: project.components.map(orderedComponentRecord),
      scripts: project.scripts.map((x) => isMeijinScript(x) ? ({
        id: x.id, mode: 'meijin', source: x.source,
        ...(x.document?{document:{revision:x.document.revision,unitIds:[...x.document.unitIds]}}:{}),
      }) : ({
        ...(x.id ? { id: x.id } : {}),
        targetId: x.targetId,
        event: x.event,
        ...(x.filter !== undefined ? { filter: cloneDesignProject(x.filter) } : {}),
        source: x.source,
        ...(x.document?{document:{revision:x.document.revision,unitIds:[...x.document.unitIds]}}:{}),
      })),
      actions: project.actions.map((x) => ({
        id: x.id,
        ownerId: x.ownerId,
        name: x.name,
        ...(x.callPhrase !== undefined ? {callPhrase:x.callPhrase} : {}),
        args: [...x.args],
        source: x.source,
      })),
      functions: project.functions.map((x) => ({
        id: x.id,
        ownerId: x.ownerId,
        name: x.name,
        args: [...x.args],
        source: x.source,
      })),
      sounds: project.sounds.map((x) => ({ id: x.id, name: x.name, assetId: x.assetId })),
      assets,
    };
  }
  // A saved 名人 script has neither owner nor event; in memory it takes the editor's pseudo owner.
  function inMemoryScripts(scripts) {
    return scripts.map(x => {
      if (x?.mode === undefined) return x;
      if (x.mode !== 'meijin' || !exactKeys(x, ['id', 'mode', 'source', ...(Object.hasOwn(x, 'document') ? ['document'] : [])]))
        throw new AkariError('F503', '名人の本文の 形が 正しく ありません');
      return { id: x.id, mode: 'meijin', targetId: MEIJIN_OWNER, event: 'start', source: x.source, ...(x.document ? { document: x.document } : {}) };
    });
  }
  function validateSerializedProjectStructure(root) {
    if (
      !exactKeys(root, [
        'schema',
        'appVersion',
        'languageContractId',
        'formatVersion',
        'name',
        'stage',
        'projectData',
        'components',
        'scripts',
        'actions',
        'functions',
        'sounds',
        'assets',
        ...(Object.hasOwn(root || {}, 'editorState') ? ['editorState'] : []),
        ...(Object.hasOwn(root || {}, 'extensions') ? ['extensions'] : []),
      ])
    )
      throw new AkariError('F503', '作品の ファイルの 形が、あかりで 読める 形と 合いません');
    if (!Array.isArray(root.assets) || root.assets.length > LIMITS.assets)
      throw new AkariError('F504', '絵や音が 多すぎます。いらない 絵や音を けして ください', 0, 0, '絵や音の 数が、上限より 多いです');
    if (Array.isArray(root.scripts)) root = { ...root, scripts: inMemoryScripts(root.scripts) };
    const design = {
      ...(Object.hasOwn(root, 'extensions') ? { extensions: AKARI_RUNTIME.validateExtensionEnvelope(root.extensions) } : {}),
      schema: root.schema,
      appVersion: root.appVersion,
      languageContractId: root.languageContractId,
      formatVersion: root.formatVersion,
      name: root.name,
      stage: root.stage,
      projectData: root.projectData,
      components: root.components,
      scripts: root.scripts,
      actions: root.actions,
      functions: root.functions,
      sounds: root.sounds,
    };
    validateDesignProject(design);
    if(root.editorState!==undefined)validateEditorState(root.editorState,design);
    const ids = designEntityIds(design),
      assetIds = new Set(),
      digestKeys = new Set();
    let predicted = 0,
      ic = 0,
      ac = 0;
    for (const a of root.assets) {
      if (!exactKeys(a, ['id', 'kind', 'mime', 'byteLength', 'sha256', 'dataBase64']))
        throw new AkariError('F503', '絵や 音の 記録の 形が、正しく ありません');
      if (!safeId(a.id)) throw new AkariError('F503', '絵や 音の 番号が、正しく ありません');
      if (ids.has(a.id) || assetIds.has(a.id))
        throw new AkariError('F505', `ID「${a.id}」が 2つ あります`);
      ids.add(a.id);
      assetIds.add(a.id);
      if (a.kind === 'image') {
        ic++;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(a.mime))
          throw new AkariError('F509', 'あかりで使えない形の絵があります');
        if (!Number.isInteger(a.byteLength) || a.byteLength < 1 || a.byteLength > LIMITS.imageBytes)
          throw new AkariError('F504', '絵の大きさが、使える大きさの外です');
      } else if (a.kind === 'audio') {
        ac++;
        if (!['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/flac', 'audio/ogg'].includes(a.mime))
          throw new AkariError('F509', 'あかりで使えない形の音があります');
        if (!Number.isInteger(a.byteLength) || a.byteLength < 1 || a.byteLength > LIMITS.audioBytes)
          throw new AkariError('F504', '音の大きさが、使える大きさの外です');
      } else throw new AkariError('F509', 'あかりで使えない種類の絵や音があります');
      if (!/^[0-9a-f]{64}$/.test(a.sha256)) throw new AkariError('F508', '絵や 音の 中身を たしかめる しるしの 書き方が、正しく ありません');
      const n = decodedBase64Length(a.dataBase64);
      if (n !== a.byteLength)
        throw new AkariError('F508', '絵や 音の 大きさが、記録と ちがいます');
      predicted += n;
      if (predicted > LIMITS.assetRawTotal)
        throw new AkariError('F504', '絵や音を 合わせた 大きさが 大きすぎて 使えません。いらない 絵や音を けして ください', 0, 0, `絵や音の合計は${LIMITS.assetRawTotal / 1048576}MiBまで`);
      const dk = `${a.kind}:${a.sha256}:${a.byteLength}`;
      if (digestKeys.has(dk)) throw new AkariError('F503', '作品ファイルに、同じ絵や音が2つ以上あります');
      digestKeys.add(dk);
    }
    if (ic > LIMITS.imageAssets || ac > LIMITS.audioAssets)
      throw new AkariError('F504', '絵や音が 多すぎます。いらない 絵や音を けして ください', 0, 0, '絵や音の 数が、上限より 多いです');
    return { design, assetIds };
  }

  function validateCallableDraftState(d) {
    if (d == null) return null;
    if (
      !(exactKeys(d, ['ownerId', 'type', 'name', 'argsText', 'source', 'editId', 'loadedKey']) ||
        exactKeys(d, ['ownerId', 'type', 'name', 'argsText', 'callPhrase', 'source', 'editId', 'loadedKey'])) ||
      d.ownerId !== 'stage' ||
      !['action', 'function'].includes(d.type)
    )
      throw new AkariError('F503', '自分で 作った ブロックの 下書きが、正しく ありません');
    for (const [k, limit] of [
      ['name', 500],
      ['argsText', 4096],
      ['source', LIMITS.sourceEach],
      ['editId', 64],
      ['loadedKey', 80],
    ])
      if (typeof d[k] !== 'string' || cpLen(d[k]) > limit)
        throw new AkariError(
          'F504',
          '下書きの 文字が 多すぎます',
        );
    if (d.callPhrase !== undefined && (d.type !== 'action' || typeof d.callPhrase !== 'string' || cpLen(d.callPhrase) > 80))
      throw new AkariError('F503', '短い よび方は、80文字までで 書いて ください');
    if (d.editId && !safeId(d.editId))
      throw new AkariError('F503', '下書きの 中身が こわれて います');
    return { ...d };
  }
  function validateEditorState(state,project) {
    if(!exactKeys(state,['version','revision','selectedId','currentEvent','selectedScriptId','uiLevel','sourceOverviewOpen','editorModes','callableDraft','pendingEditors','views'])||state.version!==1||!Number.isSafeInteger(state.revision)||state.revision<0)
      throw new AkariError('F503','なおして いた ときの きろくの 形が、正しく ありません');
    // 名人の本文 is selected under its pseudo owner, with the one slot 'start'.
    const actor=state.selectedId==='stage'?{type:'stage'}:state.selectedId===MEIJIN_OWNER&&project.scripts.some(isMeijinScript)?{type:MEIJIN_OWNER}:project.components.find(c=>c.id===state.selectedId);
    if(!actor||!(actor.type===MEIJIN_OWNER?state.currentEvent==='start':EVENT_BY_TYPE[actor.type]?.includes(state.currentEvent))||
      state.selectedScriptId!==null&&!project.scripts.some(s=>s.id===state.selectedScriptId&&s.targetId===state.selectedId&&s.event===state.currentEvent)||
      !['basic','advanced'].includes(state.uiLevel)||typeof state.sourceOverviewOpen!=='boolean'||
      !exactKeys(state.editorModes,['script','draft'])||!Object.values(state.editorModes).every(mode=>['code','blocks'].includes(mode)))
      throw new AkariError('F503','なおして いた 画面で えらんで いた ものが、正しく ありません');
    validateCallableDraftState(state.callableDraft);
    const pending=state.pendingEditors;
    if(!Array.isArray(pending)||pending.length>2||new Set(pending.map(d=>d.kind)).size!==pending.length)
      throw new AkariError('F503','作文の 下書きが 正しく ありません');
    for(const saved of pending){
      if(!exactKeys(saved,['kind','ownerKey','source','mode','pending','draftTree'])||!['script','draft'].includes(saved.kind)||!['code','blocks'].includes(saved.mode)||
        typeof saved.ownerKey!=='string'||saved.ownerKey.length>150||typeof saved.source!=='string'||cpLen(saved.source)>LIMITS.sourceEach||
        !saved.pending||typeof saved.pending!=='object'||Array.isArray(saved.pending)||JSON.stringify(saved.pending).length>LIMITS.sourceEach*4)
        throw new AkariError('F503','作文の 下書きが 正しく ありません');
      if(saved.kind==='script'&&!sourceRegistry(project).some(row=>row.key===saved.ownerKey)&&saved.ownerKey!==`script:${state.selectedId}:${state.currentEvent}`)
        throw new AkariError('F503','下書きの 本文が 見つかりません');
      if(saved.kind==='script'&&saved.ownerKey!==(state.selectedScriptId?`script:${state.selectedScriptId}`:`script:${state.selectedId}:${state.currentEvent}`))
        throw new AkariError('F503','下書きと、えらんで いる 本文が 合いません');
      if(saved.kind==='draft'&&!state.callableDraft)throw new AkariError('F503','自分で 作った ブロックの 下書きが 見つかりません');
      if(saved.draftTree!==null){const ast=blockDecode(saved.draftTree,{allowHoles:true});validateSyntaxAst(ast,'script',{allowHoles:true});if(cpLen(formatScript(ast,{allowHoles:true}))>LIMITS.sourceEach)throw new AkariError('F504','ブロックの 下書きが 長すぎます');}
      if(saved.pending.field){
        const path=saved.pending.nodePath;
        if(typeof saved.pending.field!=='string'||typeof saved.pending.value!=='string'||!Array.isArray(path)||path.length>LIMITS.blockDepth*4||path.some(k=>typeof k!=='string'&&!Number.isInteger(k)))
          throw new AkariError('F503','書きかけの 入力らんが、正しく ありません');
        const record=sourceRegistry(project).find(row=>row.key===saved.ownerKey),context=saved.kind==='draft'?{definitionKind:state.callableDraft.type,args:[]}:(record?.context||{}),
          ast=saved.draftTree?blockDecode(saved.draftTree,{allowHoles:true}):parseSyntax(saved.kind==='draft'?state.callableDraft.source:record?.source||'',{...context,symbols:buildSymbols(project)}).ast;
        let node=saved.draftTree||blockEncode(ast,{allowHoles:true}).tree;for(const k of path){if(!node||!Object.hasOwn(node,k))throw new AkariError('F503','書きかけの 入力先が 見つかりません');node=node[k];}
        const schema=BLOCK_SCHEMA_BY_ID.get(node?.schemaId),field=schema&&[...schema.fields,...schema.annotations].find(f=>f.key===saved.pending.field);
        if(!field)throw new AkariError('F503','書きかけの、入力する ところが 見つかりません');
      }
    }
    const records=sourceRegistry(project);let total=records.reduce((n,row)=>n+cpLen(row.source),0);
    for(const saved of pending.filter(d=>d.kind==='script'))total+=cpLen(saved.source)-cpLen(records.find(row=>row.key===saved.ownerKey)?.source||'');
    if(state.callableDraft){const d=state.callableDraft;total+=cpLen(pending.find(row=>row.kind==='draft')?.source??d.source)-cpLen(records.find(row=>row.key===`${d.type}:${d.editId}`)?.source||'');}
    if(total>LIMITS.sourceTotal)throw new AkariError('F504','書きかけも 合わせると、作品 ぜんたいの 本文が 長すぎます');
    if(!Array.isArray(state.views)||state.views.length>2)throw new AkariError('F503','なおして いた ばしょの きろくが、正しく ありません');
    for(const view of state.views){
      if(!exactKeys(view,['kind','ownerKey','codeSelection','scrollState'])||!['script','draft'].includes(view.kind)||typeof view.ownerKey!=='string'||view.ownerKey.length>150||
        !exactKeys(view.codeSelection,['start','end','direction'])||!['none','forward','backward'].includes(view.codeSelection.direction)||
        ![view.codeSelection.start,view.codeSelection.end].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=LIMITS.sourceEach*2)||
        !exactKeys(view.scrollState,['codeTop','codeLeft'])||!Object.values(view.scrollState).every(n=>Number.isFinite(n)&&n>=0&&n<=1e9))throw new AkariError('F503','なおして いた ばしょの きろくが、正しく ありません');
    }
    return state;
  }
  // Persistent history stores one design/editor frame and structural deltas. Asset
  // bytes are shared by digest, while each frame retains its original asset IDs.
  const WORKSPACE_HISTORY_LIMIT = LIMITS.historyEntries;
  function workspaceDelta(before, after) {
    if (stableJson(before) === stableJson(after)) return null;
    if (typeof before === 'string' && typeof after === 'string') {
      let start=0,end=0;
      while(start<before.length&&start<after.length&&before[start]===after[start])start++;
      while(end<before.length-start&&end<after.length-start&&before[before.length-end-1]===after[after.length-end-1])end++;
      return ['text',start,end,after.slice(start,after.length-end)];
    }
    if (Array.isArray(before)&&Array.isArray(after)) {
      const changed={};for(let i=0;i<after.length;i++){const d=i<before.length?workspaceDelta(before[i],after[i]):['value',after[i]];if(d)changed[i]=d;}
      return ['array',after.length,changed];
    }
    if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after)){
      const changed={};for(const key of Object.keys(after)){const d=Object.hasOwn(before,key)?workspaceDelta(before[key],after[key]):['value',after[key]];if(d)Object.defineProperty(changed,key,{value:d,enumerable:true});}
      return ['object',changed,Object.keys(before).filter(key=>!Object.hasOwn(after,key))];
    }
    return ['value',after];
  }
  function applyWorkspaceDelta(before,delta,depth=0) {
    const fail=()=>{throw new AkariError('F503','もとに もどせる きろくが、こわれて います');};
    if(depth>LIMITS.blockDepth*4||!Array.isArray(delta))return fail();
    const [kind,a,b,c]=delta;
    if(kind==='value'&&delta.length===2)return cloneDesignProject(a);
    if(kind==='text'&&delta.length===4&&typeof before==='string'&&typeof c==='string'&&
      Number.isSafeInteger(a)&&Number.isSafeInteger(b)&&a>=0&&b>=0&&a+b<=before.length)return before.slice(0,a)+c+before.slice(before.length-b);
    const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
    if(kind==='array'&&delta.length===3&&Array.isArray(before)&&Number.isSafeInteger(a)&&a>=0&&a<=LIMITS.sourceTotal&&record(b)){
      const out=before.slice(0,a);out.length=a;
      for(const [key,d]of Object.entries(b)){if(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=a)return fail();out[Number(key)]=applyWorkspaceDelta(before[Number(key)],d,depth+1);}
      for(let i=0;i<a;i++)if(!Object.hasOwn(out,i))return fail();return out;
    }
    if(kind==='object'&&delta.length===3&&record(before)&&record(a)&&Array.isArray(b)&&b.every(key=>typeof key==='string'&&Object.hasOwn(before,key))){
      const out={...before};for(const key of b)delete out[key];
      for(const [key,d]of Object.entries(a))Object.defineProperty(out,key,{value:applyWorkspaceDelta(before[key],d,depth+1),enumerable:true,writable:true,configurable:true});
      return out;
    }
    return fail();
  }
  function encodeWorkspaceHistory(frames,cursor) {
    if(!Array.isArray(frames)||!frames.length||frames.length>WORKSPACE_HISTORY_LIMIT||!Number.isInteger(cursor)||cursor<0||cursor>=frames.length)
      throw new AkariError('F503','もとに もどせる きろくの ばしょが、正しく ありません');
    const assets=[],assetIndexes=new Map(),packed=[];
    for(const frame of frames){
      const store=new AssetStore(frame.assets);validateAssetReferences(frame.project,store);validateEditorState(frame.editorState,frame.project);
      const assetRefs=[];
      for(const id of collectReachableAssetIds(frame.project)){
        const a=store.get(id),key=`${a.kind}:${a.mime}:${a.byteLength}:${a.sha256}`;
        if(!assetIndexes.has(key)){
          const builtin=a.id===DEFAULT_MASCOT_ASSET_ID&&a.kind==='image'&&a.mime==='image/png'&&a.byteLength===5476&&a.sha256===DEFAULT_MASCOT_SHA256;
          assetIndexes.set(key,assets.length);assets.push({kind:a.kind,mime:a.mime,byteLength:a.byteLength,sha256:a.sha256,builtin,
            blob:builtin?null:new Blob([a.bytes],{type:a.mime})});
        }
        assetRefs.push([id,assetIndexes.get(key)]);
      }
      packed.push({project:cloneDesignProject(frame.project),editorState:cloneDesignProject(frame.editorState),assetRefs,
        callableBaseline:frame.callableBaseline||'',callableLoadedKey:frame.callableLoadedKey||'',draftSerial:frame.draftSerial||0,draftOpen:!!frame.draftOpen});
    }
    return {version:1,cursor,base:packed[0],deltas:packed.slice(1).map((frame,i)=>workspaceDelta(packed[i],frame)||['object',{},[]]),assets};
  }
  async function decodeWorkspaceHistory(saved) {
    const fail=()=>{throw new AkariError('F503','このパソコンに のこした 作品の、もとに もどせる きろくが 正しく ありません');};
    if(!exactKeys(saved,['version','cursor','base','deltas','assets'])||saved.version!==1||!Array.isArray(saved.deltas)||saved.deltas.length>=WORKSPACE_HISTORY_LIMIT||
      !Number.isInteger(saved.cursor)||saved.cursor<0||saved.cursor>saved.deltas.length||!Array.isArray(saved.assets)||saved.assets.length>LIMITS.assets*WORKSPACE_HISTORY_LIMIT)return fail();
    const loaded=[],digests=new Set();let bytesTotal=0;
    for(const a of saved.assets){
      if(!exactKeys(a,['kind','mime','byteLength','sha256','builtin','blob'])||!['image','audio'].includes(a.kind)||typeof a.builtin!=='boolean'||
        !Number.isSafeInteger(a.byteLength)||a.byteLength<1||a.byteLength>(a.kind==='image'?LIMITS.imageBytes:LIMITS.audioBytes))return fail();
      bytesTotal+=a.byteLength;if(bytesTotal>LIMITS.assetRawTotal*WORKSPACE_HISTORY_LIMIT)return fail();
      const key=`${a.kind}:${a.mime}:${a.byteLength}:${a.sha256}`;if(digests.has(key))return fail();digests.add(key);
      if(a.builtin){const record=defaultMascotAssetRecord();if(a.blob!==null||a.kind!==record.kind||a.mime!==record.mime||a.byteLength!==record.byteLength||a.sha256!==record.sha256)return fail();loaded.push(record);}
      else{
        if(!(a.blob instanceof Blob)||a.blob.size!==a.byteLength||a.blob.type!==a.mime)return fail();
        loaded.push(await validateLoadedAssetRecord({id:`history-asset-${loaded.length}`,kind:a.kind,mime:a.mime,byteLength:a.byteLength,sha256:a.sha256,dataBase64:encodeBase64(new Uint8Array(await a.blob.arrayBuffer()))}));
      }
    }
    const frames=[];let frame=saved.base;
    for(let i=0;i<=saved.deltas.length;i++){
      if(i)frame=applyWorkspaceDelta(frame,saved.deltas[i-1]);
      if(!exactKeys(frame,['project','editorState','assetRefs','callableBaseline','callableLoadedKey','draftSerial','draftOpen'])||
        typeof frame.callableBaseline!=='string'||frame.callableBaseline.length>LIMITS.sourceEach*4+30000||typeof frame.callableLoadedKey!=='string'||frame.callableLoadedKey.length>80||
        !Number.isSafeInteger(frame.draftSerial)||frame.draftSerial<0||typeof frame.draftOpen!=='boolean'||!Array.isArray(frame.assetRefs)||frame.assetRefs.length>LIMITS.assets)return fail();
      validateDesignProject(frame.project);validateEditorState(frame.editorState,frame.project);
      const st=new AssetStore();
      for(const ref of frame.assetRefs){if(!Array.isArray(ref)||ref.length!==2||!safeId(ref[0])||!Number.isInteger(ref[1])||!loaded[ref[1]])return fail();st.addImmutable({...loaded[ref[1]],id:ref[0]});}
      validateAssetReferences(frame.project,st,{serializedAssetIds:new Set(st.ids())});
      frames.push({...cloneDesignProject(frame),assets:st.snapshotRefs(),fingerprint:assetStateFingerprint(frame.project,st)});
    }
    const used=new Set(frames.flatMap(f=>f.assetRefs.map(ref=>ref[1])));if(used.size!==saved.assets.length)return fail();
    return {frames,cursor:saved.cursor};
  }

  function markdownText(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/([\\`*_{}\[\]()#+.!|~-])/g, '\\$1')
      .replace(/\r\n?|\n/g, '\\n');
  }
  function markdownFence(value, language = 'text') {
    const text = String(value).replace(/\r\n?/g, '\n'),
      runs = text.match(/`+/g) || [],
      fence = '`'.repeat(Math.max(3, ...runs.map((x) => x.length + 1)));
    return fence + language + '\n' + text + '\n' + fence + '\n';
  }
  function markdownBody(root) {
    const out = [
      '# あかり ' + root.appVersion + ' の作品',
      '',
      `\u4f5c\u54c1\u540d\uff1a${markdownText(root.name)}`,
      '',
      '> \u3053\u306e\u672c\u6587\u306f\u95b2\u89a7\u7528\u3067\u3059\u3002\u7de8\u96c6\u306f\u3042\u304b\u308a\u306e\u753b\u9762\u5185\u3067\u884c\u3044\u307e\u3059\u3002\u672b\u5c3e\u306e\u5fa9\u5143\u30c7\u30fc\u30bf\u304c\u6b63\u672c\u3067\u3059\u3002\u672c\u6587\u3068\u6b63\u672c\u304c\u4e00\u81f4\u3057\u306a\u3044\u5834\u5408\u306fF512\u3067\u8aad\u8fbc\u307f\u3092\u4e2d\u6b62\u3057\u3001\u5909\u66f4\u3092\u9ed9\u3063\u3066\u6368\u3066\u307e\u305b\u3093\u3002',
      '',
      '## \u753b\u9762',
      `\u540d\u524d\uff1a${markdownText(root.stage.name)}\uff0f\u5e45\uff1a${root.stage.width}\uff0f\u9ad8\u3055\uff1a${root.stage.height}`,
      '',
    ];
    const data = (title, d) => {
      out.push('### ' + markdownText(title));
      if (!d.variables.length && !d.lists.length) out.push('\u306a\u3057', '');
      for (const [kind, items] of [
        ['\u5909\u6570', d.variables],
        ['\u30ea\u30b9\u30c8', d.lists],
      ])
        for (const x of items) {
          out.push(
            `${kind}\uff1a${markdownText(x.name)}\uff08${x.id}\uff09`,
            markdownFence(JSON.stringify(x.initialValue, null, 2), 'json'),
          );
        }
    };
    out.push('## \u521d\u671f\u30c7\u30fc\u30bf');
    data('\u4f5c\u54c1', root.projectData);
    for (const c of root.components) data(c.name, c.localData);
    out.push('## \u90e8\u54c1');
    for (const c of root.components) {
      out.push('### ' + markdownText(c.name) + `\uff08${c.type} / ${c.id}\uff09`);
      const { localData, costumes, ...props } = c;
      out.push(markdownFence(JSON.stringify(props, null, 2), 'json'));
    }
    out.push('## \u3067\u304d\u3054\u3068\u306e\u30b3\u30fc\u30c9');
    for (const script of root.scripts) {
      if (script.mode === 'meijin') { out.push('### ' + markdownText('名人の本文'), markdownFence(script.source)); continue; }
      const target =
        script.targetId === 'stage'
          ? root.stage
          : root.components.find((x) => x.id === script.targetId);
      out.push(
        '### ' +
          markdownText(target?.name || script.targetId) +
          ' / ' +
          markdownText(EVENT_LABELS[script.event] || script.event),
        markdownFence(script.source),
      );
    }
    for (const [label, defs] of [
      ['\u52d5\u4f5c', root.actions],
      ['\u6c42\u5024', root.functions],
    ]) {
      out.push('## ' + label);
      if (!defs.length) out.push('\u306a\u3057', '');
      for (const d of defs) {
        out.push(
          '### ' + markdownText(d.name),
          '所属：' + markdownText(root.stage.name) + '（' + d.ownerId + '）',
          '\u5f15\u6570\uff1a' +
            (d.args.length ? d.args.map(markdownText).join('\u3001') : '\u306a\u3057'),
          '',
          markdownFence(d.source),
        );
      }
    }
    out.push(
      '## \u7d20\u6750',
      '### \u80cc\u666f',
      markdownFence(JSON.stringify(root.stage.backdrops, null, 2), 'json'),
    );
    for (const c of root.components)
      if (c.type === 'sprite')
        out.push(
          '### ' + markdownText(c.name) + '\u306e\u8863\u88c5',
          markdownFence(JSON.stringify(c.costumes, null, 2), 'json'),
        );
    out.push(
      '### \u97f3',
      markdownFence(JSON.stringify(root.sounds, null, 2), 'json'),
      '### \u7d20\u6750\u30c7\u30fc\u30bf\u4e00\u89a7',
    );
    for (const a of root.assets)
      out.push(`- ${a.id} / ${a.kind} / ${a.mime} / ${a.byteLength} bytes / SHA-256: ${a.sha256}`);
    if (!root.assets.length) out.push('\u306a\u3057');
    if(root.editorState)out.push('','## 書きかけと編集位置',markdownFence(JSON.stringify(root.editorState,null,2),'json'));
    out.push(
      '',
      '## \u5fa9\u5143\u30c7\u30fc\u30bf',
      '\u3053\u306e \u30c7\u30fc\u30bf\u3068 \u4e0a\u306e \u672c\u6587\u306f \u540c\u3058 \u4f5c\u54c1\u304b\u3089 \u751f\u6210\u3055\u308c\u3066 \u3044\u307e\u3059\u3002',
      '',
    );
    return out.join('\n') + '\n';
  }
  const MARKDOWN_BEGIN = '<!-- AKARI-PROJECT-F' + PROJECT_FORMAT_ID + '-DATA-BEGIN -->\n```json\n';
  const MARKDOWN_END = '\n```\n<!-- AKARI-PROJECT-F' + PROJECT_FORMAT_ID + '-DATA-END -->\n';

  function serializeProject(project, assetStore = new AssetStore(), editorState = null) {
    assetStore = withDefaultMascotAsset(project, assetStore);
    const root = serializedRoot(project, assetStore);
    if(editorState!==null)root.editorState=validateEditorState(cloneDesignProject(editorState),project);
    validateSerializedProjectStructure(root);
    const payload = JSON.stringify(root, null, 2).replace(
      /[<>&\u2028\u2029]/g,
      (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
    );
    const text = markdownBody(root) + MARKDOWN_BEGIN + payload + MARKDOWN_END;
    if (new TextEncoder().encode(text).length > LIMITS.fileBytes)
      throw new AkariError(
        'F504',
        `ほぞんする ファイルは ${LIMITS.fileBytes / 1048576}MiBまでです`,
      );
    return text;
  }
  // options.upgradeExtensions opens a work recorded with an older release of a registered extension
  // (see the extension host's upgradeRequirements); the caller asks the person first.
  async function parseProjectFile(text, options = {}) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > LIMITS.fileBytes)
      throw new AkariError(
        'F504',
        `作品の ファイルは ${LIMITS.fileBytes / 1048576}MiBまでです`,
      );
    text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const begin = text.lastIndexOf(MARKDOWN_BEGIN);
    let root;
    try {
      if (begin < 0 || !text.endsWith(MARKDOWN_END)) throw Error();
      root = JSON.parse(text.slice(begin + MARKDOWN_BEGIN.length, -MARKDOWN_END.length));
    } catch (_) {
      // A file written in another project format names its format in the data marker.
      const other = text.match(/<!-- AKARI-PROJECT-F(\d+)-DATA-BEGIN -->/);
      if (other && Number(other[1]) !== PROJECT_FORMAT_ID)
        throw Object.assign(new AkariError(
          'F502',
          (Number(other[1]) < PROJECT_FORMAT_ID ? '前の' : 'あたらしい') +
            ' あかりで ほぞんした 作品なので、この あかりでは 開けないよ。その 作品を 作った ときの あかりで 開いてね。',
        ), { otherFormat: true });
      throw new AkariError(
        'F502',
        '作品の 中身を 読めません。あかりで ほぞんした ファイル（名前が「.akari.md」で おわる ファイル）を えらんで ください',
      );
    }
    const recorded = root;
    if (options.upgradeExtensions && root && typeof root === 'object' && Object.hasOwn(root, 'extensions'))
      root = { ...root, extensions: EXTENSION_HOST.upgradeRequirements(root.extensions).envelope };
    let assetIds;
    try { ({ assetIds } = validateSerializedProjectStructure(root)); }
    catch (error) {
      if (!options.upgradeExtensions && error?.code === 'E703' && root && typeof root === 'object' && Object.hasOwn(root, 'extensions')) {
        let plan = null;
        try { plan = EXTENSION_HOST.upgradeRequirements(root.extensions); } catch (_) {}
        if (plan?.upgrades.length) error.extensionUpgrades = plan.upgrades;
      }
      throw error;
    }
    if (text.slice(0, begin) !== markdownBody(recorded))
      throw new AkariError(
        'F512',
        'ファイルの 本文と、作品を もどす ための 中身が 合いません。いま なおして いる 作品は かえて いません。',
      );
    const store = new AssetStore();
    for (const record of root.assets) store.addImmutable(await validateLoadedAssetRecord(record));
    const project = {
      ...root,
      components: root.components.map((c) => ({ ...c, direction: normalizedDesignDirection(c.direction) })),
      scripts: inMemoryScripts(root.scripts),
    };
    delete project.assets;
    delete project.editorState;
    validateAssetReferences(project, store, { serializedAssetIds: assetIds });
    return { project, assetStore: store, diagnostics: compileProject(project).errors, ...(root.editorState?{editorState:root.editorState}:{}) };
  }
  async function validateLoadedAssetRecord(a) {
    const bytes = decodeBase64(a.dataBase64);
    if (bytes.length !== a.byteLength)
      throw new AkariError('F508', '絵や音の大きさが、記録と合いません');
    const digest = await sha256(bytes);
    if (digest !== a.sha256) throw new AkariError('F508', '絵や音の中身が、記録と合いません');
    if (a.kind === 'image') {
      const sn = sniffImage(bytes);
      if (sn.mime !== a.mime) throw new AkariError('F509', '絵の ファイルの 形が、書いて ある 形と 合いません。作品の ファイルが こわれて いる ようです');
      const dec = await decodeImageBytes(bytes, a.mime);
      try {
        if (dec.width !== sn.width || dec.height !== sn.height)
          throw new AkariError('F510', '絵の 大きさが、書いて ある 大きさと 合いません。作品の ファイルが こわれて いる ようです');
      } finally {
        dec.close();
      }
      return {
        id: a.id,
        kind: 'image',
        mime: a.mime,
        byteLength: a.byteLength,
        sha256: a.sha256,
        bytes,
        meta: { width: sn.width, height: sn.height },
      };
    }
    const sn = sniffAudio(bytes);
    if (sn.mime !== a.mime) throw new AkariError('F509', '音の ファイルの 形が、書いて ある 形と 合いません。作品の ファイルが こわれて いる ようです');
    if (a.mime === 'audio/mpeg' && !bytesEqual(sn.clean, bytes))
      throw new AkariError('F508', 'ほぞんした 音（MP3）に、取りのぞく はずの おまけの 情報が 残って います');
    if (a.mime === 'audio/wav') {
      const rebuilt = rebuildCanonicalWav(sn.parsed);
      if (!bytesEqual(rebuilt, bytes))
        throw new AkariError('F508', 'ほぞんした 音（WAV）が、決まった 形に なって いません');
    }
    if (['audio/mp4', 'audio/flac', 'audio/ogg'].includes(a.mime) && !bytesEqual(sn.clean, bytes))
      throw new AkariError('F508', 'ほぞんした 音が、おまけの 情報を 取りのぞいた 決まった 形に なって いません');
    const containerMeta = audioContainerMeta(sn);
    checkAudioContainerLimits(containerMeta);
    if (sn.duration != null) checkAudioLimits({ ...containerMeta, duration: sn.duration });
    const decoded = await decodeAudioMeta(bytes);
    if (decoded.channels !== containerMeta.channels)
      throw new AkariError('F511', 'この 音の ファイルは、中身が 合って いません。ほかの 音を 使って ください');
    if (sn.duration != null && Math.abs(decoded.duration - sn.duration) > 0.02)
      throw new AkariError('F511', 'この 音の ファイルは、書いて ある 長さと 本当の 長さが 合いません。ほかの 音を 使って ください');
    const meta = {
      duration: decoded.duration,
      channels: containerMeta.channels,
      sampleRate: containerMeta.sampleRate,
    };
    checkAudioLimits(meta);
    return {
      id: a.id,
      kind: 'audio',
      mime: a.mime,
      byteLength: a.byteLength,
      sha256: a.sha256,
      bytes,
      meta,
    };
  }
  function parseLiteralForData(text, kind) {
    const s = String(text ?? '').trim();
    const dummy = { projectData: { variables: [], lists: [] }, components: [], actions: [], functions: [] };
    const sy = buildSymbols(dummy);
    // Unquoted ordinary text remains a convenient initial text value. Explicit
    // literal delimiters and numeric prefixes always undergo the language lexer.
    if (kind === 'variable' && !/^(?:[「［（(]|条件の答え|[＋+－−-]?[０-９0-9])/.test(s)) return s;
    const ast = parseExpression(s || '［］', sy, {});
    const literal = n => {
      if (['NumberLiteral', 'StringLiteral', 'BooleanLiteral'].includes(n.kind)) return n.value;
      if (n.kind === 'QuantityLiteral') return quantity(numberInUnit(literal(n.value), n.unit), n.unit);
      if (n.kind === 'UnitlessRead') return numberValue(literal(n.value));
      if (n.kind === 'UnaryExpression' && ['NEG', 'POS'].includes(n.op)) {
        const value = literal(n.value), magnitude = numberValue(value);
        return quantity(n.op === 'NEG' ? -magnitude : magnitude, unitOf(value));
      }
      if (n.kind === 'ListLiteral') return n.items.map(literal);
      throw new AkariError('R411', 'はじめの 中身には、数や 文字など、決まった ものを 書きます。計算や へんすう・リストの 名前は 使えません。れい：0、こんにちは');
    };
    const value = literal(ast);
    if (kind === 'variable' ? !scalar(value) : !listValue(value))
      throw new AkariError('R411', kind === 'variable' ? 'へんすう（1つ おぼえる はこ）の はじめの 中身には、数か 文字を 1つだけ 書きます。れい：0' : 'リストの はじめの 中身は、［ ］で かこみ、「、」で 分けて 書きます。れい：［「本」、「かさ」、3］');
    assertRuntimeValueLimit(value);
    return value;
  }
  function parseDataFormInitial(text,kind,{mode='literal',expectedUnit=null}={}) {
    if(!['variable','list'].includes(kind)||!['literal','lines'].includes(mode))throw new AkariError('F503','へんすう・リストの 中身の 入れ方が 正しく ありません');
    let value;
    if(kind==='list'&&mode==='lines')value=String(text)===''?[]:String(text).replace(/\r\n?/g,'\n').split('\n');
    else value=parseLiteralForData(text,kind);
    if(kind==='variable'&&expectedUnit)value=quantity(numberInUnit(value,expectedUnit,'たんいを 決めた へんすうの、はじめの 中身には 数を 入れて ください。れい：0'),expectedUnit);
    assertRuntimeValueLimit(value);return value;
  }

