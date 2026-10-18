  // ────────────────────────────────────────────────────────────────────────
  // 09 — Pure editor sessions and atomic block transactions
  // ────────────────────────────────────────────────────────────────────────
  function editorError(message) {
    throw new AkariError('E901', message);
  }
  // Inner consistency checks: the child sees a retry message; the check text stays in the details.
  function editorCheckError(detail) {
    throw new AkariError('E901', 'うまく いかなかったよ。もう一度 やってみてね。', 0, 0, detail);
  }
  function editorOwner(ownerKey) {
    if (typeof ownerKey !== 'string' || !/^(script|action|function):.+/.test(ownerKey))
      editorCheckError('本文の所有者が不正です');
    return ownerKey.split(':')[0];
  }
  function editorContext(ownerKey, context = {}) {
    return { ...context, key: ownerKey, ownerKey };
  }
  function editorDiagnostics(ast, project, context) {
    const header = [],
      definition = context.definition;
    const report = (code, message) =>
      header.push({ code, message, line: 0, column: 1, where: context.ownerKey });
    let analysisContext = context;
    if (context.definitionKind) {
      if (!definition) editorCheckError('定義の下書きがありません');
      try {
        validateName(definition.name, { callable: true });
      } catch (error) {
        report('S302', error.message);
      }
      const supplied = context.args ?? definition.args,
        args = Array.isArray(supplied) ? supplied : [];
      if (!Array.isArray(supplied) || args.length > LIMITS.args)
        report('S308', '入れるものの 数が 多すぎるか、書き方が まちがっています。入れるものを へらすか、書き方を たしかめてね。');
      const names = new Set();
      for (const name of args) {
        try {
          validateName(name);
        } catch (error) {
          report('S302', error.message);
        }
        if (names.has(name)) report('S302', '入れるものに 同じ 名前が 2つ いじょう あります。ちがう 名前に してね');
        names.add(name);
      }
      analysisContext = { ...context, args };
    }
    return [...header, ...analyzeAst(ast, project, analysisContext)];
  }
  function createEditorSession(ownerKey, source, context = {}, project, contextRevision = 0) {
    const ownerKind = editorOwner(ownerKey);
    if (!Number.isSafeInteger(contextRevision) || contextRevision < 0)
      editorCheckError('文脈の世代が不正です');
    const ctx = editorContext(ownerKey, context),
      parsed = parseSyntax(source, { ...ctx, ...(project ? {symbols:buildSymbols(project)} : {}) }),
      encoded = parsed.ast ? blockEncode(parsed.ast) : null;
    return {
      ownerKey,
      ownerKind,
      mode: 'code',
      sourceText: source,
      sourceRevision: 0,
      contextRevision,
      context: ctx,
      project,
      syntaxAst: parsed.ast,
      syntaxDiagnostics: parsed.syntaxDiagnostics,
      diagnostics:
        parsed.ast && project
          ? editorDiagnostics(parsed.ast, project, ctx)
          : parsed.syntaxDiagnostics,
      blockView: encoded?.tree || null,
      nodeMap: encoded?.nodeMap || new Map(),
      nodeIds: encoded?.nodeIds || new WeakMap(),
      codeSelection: { start: 0, end: 0 },
      blockSelection: null,
      scrollState: {},
      pendingEdit: null,
      nextBlockId: 1,
    };
  }
  function resolvedEditorMode(preferences, kind, syntaxAst) {
    return syntaxAst ? preferences.get(kind) || 'code' : 'code';
  }
  function refreshEditorSession(
    session,
    source,
    context = session.context,
    project = session.project,
    contextRevision = session.contextRevision,
  ) {
    if (contextRevision < session.contextRevision) editorCheckError('古い文脈の更新は反映できません');
    const rebuilt = createEditorSession(
        session.ownerKey,
        source,
        context,
        project,
        contextRevision,
      ),
      changed = source !== session.sourceText,
      invalidated = changed || contextRevision !== session.contextRevision;
    if (!changed && session.blockView && rebuilt.blockView) {
      if (!astEquivalent(blockDecode(session.blockView), rebuilt.syntaxAst))
        editorCheckError('ブロックと本文の世代が一致しません');
      const encoded = editorReidentify(
        { tree: rebuilt.blockView, nodeMap: rebuilt.nodeMap },
        session.blockView,
        rebuilt.syntaxAst,
      );
      rebuilt.blockView = encoded.tree;
      rebuilt.nodeMap = encoded.nodeMap;
      rebuilt.nodeIds = encoded.nodeIds;
    }
    return {
      ...session,
      ...rebuilt,
      sourceRevision: session.sourceRevision + (changed ? 1 : 0),
      mode: rebuilt.syntaxAst ? session.mode : 'code',
      codeSelection: session.codeSelection,
      blockSelection: changed || !rebuilt.blockView ? null : session.blockSelection,
      scrollState: session.scrollState,
      pendingEdit: invalidated ? null : session.pendingEdit,
      nextBlockId: session.nextBlockId,
    };
  }
  function buildBlockIndex(tree) {
    const index = new Map(),
      seen = new WeakSet();
    const walk = (
      node,
      parentId = null,
      body = null,
      input = null,
      position = null,
      ancestors = [],
      path = [],
    ) => {
      if (!node || typeof node !== 'object' || seen.has(node) || index.has(node.id))
        editorCheckError('循環または重複したブロックです');
      seen.add(node);
      if (typeof node.id !== 'string' || !node.id) editorCheckError('ブロックIDがありません');
      const schema = BLOCK_SCHEMA_BY_ID.get(node.schemaId);
      if (!schema) editorCheckError('対応していないブロックです');
      const entry = { node, parentId, body, input, index: position, ancestors, path };
      index.set(node.id, entry);
      const lineage = [...ancestors, node.id];
      for (const slot of schema.inputs) {
        const value = node.inputs?.[slot.key];
        if (value === undefined && slot.required === false) continue;
        if (slot.multiple) {
          if (!Array.isArray(value)) editorCheckError('式の配列がありません');
          value.forEach((child, i) =>
            walk(child, node.id, null, slot.key, i, lineage, [...path, 'inputs', slot.key, i]),
          );
        } else walk(value, node.id, null, slot.key, null, lineage, [...path, 'inputs', slot.key]);
      }
      for (const slot of schema.bodies) {
        const children = node.bodies?.[slot.key];
        if (!Array.isArray(children)) editorCheckError('本文の配列がありません');
        children.forEach((child, i) =>
          walk(child, node.id, slot.key, null, i, lineage, [...path, 'bodies', slot.key, i]),
        );
      }
    };
    walk(tree);
    return index;
  }
  function editorCopyBlock(tree) {
    // Validate before copying so malformed cyclic input cannot become a partial edit.
    blockDecode(tree);
    return JSON.parse(JSON.stringify(tree));
  }
  function editorCandidateProject(session, source, project, context) {
    if (!project) editorCheckError('作品の文脈がありません');
    const candidate = {
      ...project,
      scripts: project.scripts.map((x) => ({ ...x })),
      actions: project.actions.map((x) => ({ ...x })),
      functions: project.functions.map((x) => ({ ...x })),
    };
    if (session.ownerKind === 'script') {
      const parts = session.ownerKey.split(':'),
        existing = scriptBySourceKey(candidate, session.ownerKey),
        targetId = existing?.targetId || context.targetId || (parts.length === 3 ? parts[1] : null),
        event = existing?.event || context.event || (parts.length === 3 ? parts[2] : null),
        target = targetId === 'stage' ? { type: 'stage' } : project.components.find((x) => x.id === targetId);
      if (!target || !EVENT_BY_TYPE[target.type]?.includes(event))
        editorError('だれが 動くか、いつ 動くかが かわりました。もう一度 えらんでから やってね。');
      const row = existing || { ...(parts.length === 2 ? { id: parts[1] } : {}), targetId, event, source: '' };
      updateScriptSource(row, source, candidate);
      if (!existing) candidate.scripts.push(row);
    } else {
      const kind = context.definitionKind || session.ownerKind,
        definition = context.definition;
      if (!definition || kind !== session.ownerKind) editorCheckError('定義の下書き文脈がありません');
      candidate.actions = candidate.actions.filter((x) => x.id !== definition.id);
      candidate.functions = candidate.functions.filter((x) => x.id !== definition.id);
      candidate[kind === 'action' ? 'actions' : 'functions'].push({
        ...definition,
        args: context.args || definition.args || [],
        source,
      });
    }
    if (
      candidate.scripts.length > LIMITS.scripts ||
      candidate.actions.length + candidate.functions.length > LIMITS.callables
    )
      editorError('動きの まとまりと 自分で作ったブロックの 数が、いちばん 大きい かずを こえました。いらない ものを けしてね。');
    let total = 0;
    for (const record of [...candidate.scripts, ...candidate.actions, ...candidate.functions]) {
      if (typeof record.source !== 'string' || cpLen(record.source) > LIMITS.sourceEach)
        editorError('1つの 動きの まとまりの 文字の 数が、いちばん 大きい かずを こえました。少し へらしてね。');
      total += cpLen(record.source);
    }
    if (total > LIMITS.sourceTotal) editorError('作品ぜんぶの コードの 長さが、いちばん 大きい かずを こえました。いらない ところを けしてね。');
    return candidate;
  }
  function editorReidentify(encoded, previousTree, ast) {
    const oldIndex = buildBlockIndex(previousTree), fresh = [...buildBlockIndex(encoded.tree).values()];
    const pairs = new Map(), occupied = new Set(oldIndex.keys());
    let serial = 1;
    const pair = (before, after) => {
      if (!before || !after) editorCheckError('再解析でブロックの対応が変わりました');
      // A numeric command role is printed with its unit. Preserve the number's
      // identity when parsing adds that explicit unit wrapper.
      if (after.schemaId === 'QuantityLiteral' && before.schemaId !== 'QuantityLiteral') {
        pair(before, after.inputs.value); return;
      }
      if (before.schemaId === 'QuantityLiteral' && after.schemaId !== 'QuantityLiteral') {
        pair(before.inputs.value, after); return;
      }
      if (before.schemaId !== after.schemaId) editorCheckError('再解析でブロックの対応が変わりました');
      pairs.set(after.id, before.id);
      const schema = BLOCK_SCHEMA_BY_ID.get(after.schemaId);
      for (const slot of schema.inputs) {
        const x = before.inputs[slot.key], y = after.inputs[slot.key];
        if (slot.multiple) {
          if ((x || []).length !== (y || []).length) editorCheckError('再解析で値の数が変わりました');
          (y || []).forEach((child, i) => pair(x[i], child));
        } else if (x || y) pair(x, y);
      }
      for (const slot of schema.bodies) {
        const x = before.bodies[slot.key], y = after.bodies[slot.key];
        if (x.length !== y.length) editorCheckError('再解析で本文の数が変わりました');
        y.forEach((child, i) => pair(x[i], child));
      }
    };
    const oldNodes = [...oldIndex.values()];
    if (oldNodes.length === fresh.length && oldNodes.every((entry, i) => entry.node.schemaId === fresh[i].node.schemaId))
      fresh.forEach((entry, i) => pairs.set(entry.node.id, oldNodes[i].node.id));
    else pair(previousTree, encoded.tree);
    const nodeMap = new Map(), nodeIds = new WeakMap();
    for (const entry of fresh) {
      const oldId = entry.node.id, location = encoded.nodeMap.get(oldId);
      let id = pairs.get(oldId);
      if (!id) { do { id = 'eRole-' + serial++; } while (occupied.has(id)); occupied.add(id); }
      entry.node.id = id; nodeMap.set(id, location);
      let node = ast; for (const key of location.path) node = node[key];
      nodeIds.set(node, id);
    }
    return { tree: encoded.tree, nodeMap, nodeIds };
  }
  function preserveBlockSource(session, tree, sourceOrigins = new Map()) {
    const source = session.sourceText, oldIndex = buildBlockIndex(session.blockView);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const surface = node => session.nodeMap.get(node.id)?.surface;
    const newline = source.includes('\r\n') ? '\r\n' : source.includes('\r') ? '\r' : '\n';
    const inheritedActors = new Map(), originalActors = new Map();
    const rememberTopics = (body, inherited = {kind:'self'}, topics = inheritedActors) => {
      let topic = inherited;
      for (const node of body) {
        const schema = BLOCK_SCHEMA_BY_ID.get(node.schemaId);
        topics.set(node.id, topic);
        for (const slot of schema.bodies) rememberTopics(node.bodies[slot.key], node.fields.actorRef || {kind:'self'}, topics);
        if (!schema.bodies.length && !['CommentLine','Hole'].includes(schema.kind))
          topic = node.fields.actorRef || {kind:'self'};
      }
    };
    rememberTopics(tree.bodies.body);
    rememberTopics(session.blockView.bodies.body, {kind:'self'}, originalActors);
    for(const unit of tree.inputs.units||[])rememberTopics(unit.bodies.body);
    for(const unit of session.blockView.inputs.units||[])rememberTopics(unit.bodies.body,{kind:'self'},originalActors);
    const structuralLines=text=>normalizeSource(text).lines.filter(line=>!line.continuation).map(line=>line.raw);
    const standard = node => {
      const schema = BLOCK_SCHEMA_BY_ID.get(node.schemaId), ast = blockDecode(node);
      if (schema.category === 'expression') return formatExpression(ast, PREC.ATOM);
      if (schema.category === 'target') return formatTarget(ast);
      if (schema.category === 'script') return structuralLines(formatScript(ast)).join(newline);
      if (schema.category === 'rule') return structuralLines(formatScript({kind:'Script',body:[],rules:[ast]})).join(newline);
      // Format a replacement in its destination scope, adding self only when needed.
      return structuralLines(formatScript({kind:'Script', body:[ast]}, {inheritedActor:inheritedActors.get(node.id)})).join(newline);
    };
    const sameActorContext = (before, after) => {
      if (same(originalActors.get(before?.id), inheritedActors.get(after.id))) return true;
      let originalAst = session.syntaxAst;
      for (const key of session.nodeMap.get(before?.id)?.path || []) originalAst = originalAst?.[key];
      return STATEMENT_EXPLICIT_ACTORS.has(originalAst);
    };
    const moved = (node, indent) => {
      const original = oldIndex.get(sourceOrigins.get(node.id)||node.id)?.node, location = original && surface(original);
      const equal=original&&(original.id===node.id?same(original,node):same(blockDecode(original),blockDecode(node)));
      const reusable = equal && location?.extent && sameActorContext(original,node);
      const text = reusable
        ? source.slice(location.extent.start, location.extent.end) : standard(node);
      const oldIndent = reusable ? location.indent : 0;
      return structuralLines(text).map((line, i) => i
        ? ' '.repeat(indent) + line.slice(Math.min(oldIndent, line.match(/^ */)[0].length)) : line).join(newline);
    };
    const fallback = (before, after) => {
      const location = surface(before), schema = BLOCK_SCHEMA_BY_ID.get(before.schemaId);
      // A changed preceding topic only needs an explicit subject. Keep the
      // original control header (including a legacy ForEach binder) and body.
      if (schema.bodies.length && same(before, after) && location?.range && !sameActorContext(before, after))
        return [{start:location.range.start, end:location.range.start, text:sentenceActorSource(after.fields.actorRef) + 'は、'}];
      if(before.schemaId==='ForEach' && after.schemaId==='ForEach' && before.fields.binder!==after.fields.binder &&
        same({...before.fields,binder:after.fields.binder},after.fields) && same(before.inputs,after.inputs) && same(before.bodies,after.bodies) && same(before.annotations,after.annotations)) {
        const binder=`【${after.fields.binder}】`;
        if(location?.binderRange)return [{...location.binderRange,text:binder}];
        if(location?.binderInsert){const {at,indent}=location.binderInsert;return [{start:at,end:at,text:newline+' '.repeat(indent)+`この中では、今見ているものを${binder}と呼ぶ。`}];}
      }
      if(location?.inlineContainer && location.extent && before.schemaId===after.schemaId &&
        ['IfStatement','RepeatCount'].includes(after.schemaId) && same(before.fields,after.fields) && same(before.annotations,after.annotations)) {
        const bodyKey=after.schemaId==='IfStatement'?'thenBody':'body',indent=location.indent+2;
        if(before.bodies[bodyKey].length===1 && !after.fields.hasElse){
          const rows=[standard(after).split(/\r\n?|\n/)[0]];
          for(const child of after.bodies[bodyKey]){
            let text=moved(child,indent);
            if(!/[\r\n]/.test(text)){const parts=splitComment(text);text=parts.code.trimEnd()+(parts.comment?'  '+parts.comment:'');}
            rows.push(' '.repeat(indent)+text);
          }
          return [{...location.extent,text:rows.join(newline)}];
        }
      }
      if (schema.category==='statement' && schema.bodies.length && before.schemaId === after.schemaId && !location?.inlineContainer &&
        location?.range && same(before.bodies, after.bodies) && same(before.annotations, after.annotations) &&
        same(before.fields.actorRef, after.fields.actorRef)) {
        const header = splitComment(standard(after).split(/\r\n?|\n/)[0]).code.trimEnd().replace(/。$/, '');
        return [{...location.range, text:header}];
      }
      // A rule is a whole line like a statement: its range ends before 。 but its text ends with it.
      const lineSchema = ['statement','rule'].includes(schema.category);
      const range = lineSchema ? location?.extent : location?.range;
      if (!range) return null;
      if(schema.category==='script')return [{...range,text:standard(after)+(/\s*$/.exec(source.slice(range.start,range.end))?.[0]||'')}];
      if (location.inline && (BLOCK_SCHEMA_BY_ID.get(after.schemaId)?.bodies.length || /[\r\n]/.test(standard(after)))) return null;
      return [{...range, text:lineSchema ? moved(after, location.indent) : location?.conditionForm ? formatCondition(blockDecode(after),location.conditionForm) : standard(after)}];
    };
    const bodyChanges = (before, after, owner, key) => {
      const location = surface(owner);
      let first = 0, last = before.length, end = after.length;
      const changes = [];
      while (first < last && first < end && before[first].id === after[first].id) {
        const edits = plan(before[first], after[first]);
        if (!edits) return null;
        changes.push(...edits); first++;
      }
      while (last > first && end > first && before[last - 1].id === after[end - 1].id) {
        const edits = plan(before[--last], after[--end]);
        if (!edits) return null;
        changes.push(...edits);
      }
      if (first === last && first === end) return changes;
      if (location?.inlineContainer) return null;
      const old = before.slice(first, last), fresh = after.slice(first, end);
      if (old.some(n => !surface(n)?.extent || surface(n)?.inline)) return null;
      const next = before[last], previous = before[first - 1];
      let start, finish, indent;
      if (old.length) {
        const a = surface(old[0]), b = surface(old[old.length - 1]);
        start = a.extent.start - a.indent;
        finish = b.extent.end;
        indent = a.indent;
        const separator = /^(?:\r\n?|\n)/.exec(source.slice(finish));
        if (separator) finish += separator[0].length;
      } else if (next && surface(next)?.extent && !surface(next).inline) {
        const a = surface(next); start = finish = a.extent.start - a.indent; indent = a.indent;
      } else if (previous && surface(previous)?.extent && !surface(previous).inline) {
        const a = surface(previous); start = finish = a.extent.end; indent = a.indent;
        const text = fresh.map(n => ' '.repeat(indent) + moved(n, indent)).join(newline);
        changes.push({start, end:finish, text:newline + text});
        return changes;
      } else if (owner.schemaId === 'Script') { start = finish = source.length; indent = 0; }
      else return null;
      let text = fresh.map(n => ' '.repeat(indent) + moved(n, indent)).join(newline);
      if (fresh.length && (finish < source.length || /[\r\n]$/.test(source.slice(start, finish)))) text += newline;
      changes.push({start, end:finish, text});
      return changes;
    };
    const headingPrefixChange = (before,after) => {
      const range=surface(before)?.range;
      if(!range||!before.fields.heading||!after.fields.heading)return null;
      const first=normalizeSource(source.slice(range.start,range.end)).lines.find(line=>line.code),
        heading=first&&readSentenceHeading(first.code,buildSymbols(session.project),before.fields.heading);
      if(!heading)return null;
      const begin=first.mapped.positions[0],end=first.mapped.positions[Math.max(0,heading.body.start-1)]+1;
      return Number.isInteger(begin)&&Number.isInteger(end)?[{start:range.start+begin,end:range.start+end,text:sentenceHeadingSource(after.fields.heading)}]:null;
    };
    const plan = (before, after) => {
      if(before.schemaId==='Script'&&after.schemaId==='Script'&&(before.inputs.units||after.inputs.units)){
        const first=node=>{const inputs={...node.inputs};delete inputs.units;return {...node,inputs};};
        const head=plan(first(before),first(after)),rest=bodyChanges(before.inputs.units||[],after.inputs.units||[],before,'units');
        if(head&&rest){
          const old=[first(before),...(before.inputs.units||[])],next=[first(after),...(after.inputs.units||[])];
          for(let i=1;i<next.length;i++)if(old[i]?.id===next[i].id&&same(old[i],next[i])&&!same(old[i-1].fields.heading,next[i-1].fields.heading)){
            const range=surface(old[i])?.range,raw=range&&source.slice(range.start,range.end),line=raw&&normalizeSource(raw).lines.find(line=>line.code);
            // Resolve an inherited cue explicitly when the previous group changes.
            // The following group keeps its existing trigger and exact body text.
            if(line&&/^(.+?)も同じ合図で動き始め、/.test(line.code)){const edits=headingPrefixChange(old[i],next[i]);if(!edits)return null;rest.push(...edits);}
          }
        }
        return head&&rest?[...head,...rest]:null;
      }
      if (same(before, after)) {
        const schema = BLOCK_SCHEMA_BY_ID.get(after.schemaId);
        if (schema.category !== 'statement' || ['CommentLine','Hole'].includes(schema.kind) || sameActorContext(before,after)) return [];
        return fallback(before,after);
      }
      if(before.schemaId==='Script'&&after.schemaId==='Script'&&before.fields.heading&&after.fields.heading&&
        same(before.bodies,after.bodies)&&same(before.inputs,after.inputs)&&same(before.annotations,after.annotations)){
        const edits=headingPrefixChange(before,after);if(edits)return edits;
      }
      if (before.schemaId !== after.schemaId || !same(before.fields, after.fields) || !same(before.annotations, after.annotations))
        return fallback(before, after);
      // The touch test writes the stage edge as 画面のはし, so a change to or from the edge rewrites the whole test.
      if (before.schemaId === 'SensorRead:TOUCHING' && !same(before.inputs.arg, after.inputs.arg) &&
        [before.inputs.arg, after.inputs.arg].some(n => n?.schemaId === 'StringLiteral' && n.fields.value === '端'))
        return fallback(before, after);
      const schema = BLOCK_SCHEMA_BY_ID.get(before.schemaId), changes = [];
      for (const slot of schema.inputs) {
        if (slot.required === false) {
          const had = Object.hasOwn(before.inputs, slot.key), has = Object.hasOwn(after.inputs, slot.key);
          if (!had && !has) continue;
          if (had !== has) return fallback(before, after);
        }
        const a = slot.multiple ? before.inputs[slot.key] : [before.inputs[slot.key]],
          b = slot.multiple ? after.inputs[slot.key] : [after.inputs[slot.key]];
        if (a.length !== b.length) return fallback(before, after);
        for (let i = 0; i < a.length; i++) {
          const edits = plan(a[i], b[i]);
          if (!edits) return fallback(before, after);
          changes.push(...edits);
        }
      }
      if(before.schemaId==='Say' && !same(before.inputs.value,after.inputs.value)) {
        const value=blockDecode(after.inputs.value),needsNoun=value.kind==='VariableRead',
          changesQuote=before.inputs.value.schemaId==='StringLiteral'&&value.kind!=='StringLiteral';
        if(needsNoun||changesQuote){
          const range=surface(before.inputs.value)?.range,
            tail=range&&/^(\s*)(の\s*値\s*)?([をと])(?=\s*(?:言う|いう|話す|はなす))/.exec(source.slice(range.end));
          if(!tail)return fallback(before,after);
          if(needsNoun&&!tail[2])changes.push({start:range.end,end:range.end,text:'の値'});
          if(tail[3]==='と'){const at=range.end+tail[1].length+(tail[2]?.length||0);changes.push({start:at,end:at+1,text:'を'});}
        }
      }
      for (const slot of schema.bodies) {
        const edits = bodyChanges(before.bodies[slot.key], after.bodies[slot.key], before, slot.key);
        if (!edits) return fallback(before, after);
        changes.push(...edits);
      }
      return changes;
    };
    const changes = plan(session.blockView, tree);
    if (!changes) return reprintChangedUnits(session,tree);
    changes.sort((a,b) => b.start - a.start || b.end - a.end);
    let result = source, boundary = source.length;
    for (const change of changes) {
      if (change.start < 0 || change.end > boundary || change.end < change.start)
        editorCheckError('編集範囲が重複しています');
      result = result.slice(0, change.start) + change.text + result.slice(change.end);
      boundary = change.start;
    }
    return result;
  }
  function reprintChangedUnits(session,tree) {
    const units=root=>{const first={...root,inputs:{...root.inputs}};delete first.inputs.units;return [first,...(root.inputs.units||[])];};
    const before=new Map(units(session.blockView).map(unit=>[unit.id,unit])),newline=session.sourceText.includes('\r\n')?'\r\n':'\n';
    let source='';
    for(const unit of units(tree)){
      const original=before.get(unit.id),range=original&&session.nodeMap.get(original.id)?.surface?.range,raw=range?session.sourceText.slice(range.start,range.end):null;
      const same=original&&JSON.stringify(original)===JSON.stringify(unit);
      const formatted=same&&raw!==null?raw:normalizeSource(formatScript(blockDecode(unit))).lines.filter(line=>!line.continuation).map(line=>line.raw).join(newline)+(raw?.match(/\s*$/)?.[0]||'');
      if(source&&!/[\r\n]$/.test(source))source+=newline;
      source+=formatted;
    }
    return source;
  }
  function prepareBlockEdit(session, operation, options = {}) {
    const project = options.project || session.project,
      context = editorContext(session.ownerKey, options.context || session.context || {});
    if (options.locked) editorError('動いている ときや じゅんび中は、なおせません。止まってから もう一度 やってね。');
    for (const key of ['ownerKey', 'sourceRevision', 'contextRevision'])
      if (options[key] !== undefined && options[key] !== session[key])
        editorError('とちゅうで 作品が かわりました。もう一度 やってね。');
    if (!session.syntaxAst || !session.blockView)
      editorError('先に 書き方の まちがいを 直してね。そうすると ブロックが 使えるよ。');
    if (
      session.pendingEdit && session.pendingEdit.kind !== 'block-draft' &&
      (session.pendingEdit.composing ||
        !session.pendingEdit.id ||
        options.pendingEditId !== session.pendingEdit.id)
    )
      editorError('入れている とちゅうの ものを、Enter キーで 決めるか、Esc キーで やめてね。');
    const unchanged = () => ({
      changed: false,
      source: session.sourceText,
      sourceText: session.sourceText,
      syntaxAst: session.syntaxAst,
      blockView: session.blockView,
      nodeMap: session.nodeMap,
      nodeIds: session.nodeIds,
      diagnostics: session.diagnostics,
      syntaxDiagnostics: session.syntaxDiagnostics,
      ownerKey: session.ownerKey,
      sourceRevision: session.sourceRevision,
      contextRevision: session.contextRevision,
      nextBlockId: session.nextBlockId,
      blockSelection: session.blockSelection,
    });
    if (operation?.type === 'cancel' || operation?.type === 'noop') return unchanged();
    const draftCodec = { allowHoles: true };
    const copyDraftBlock = (node) => {
      blockDecode(node, draftCodec);
      return JSON.parse(JSON.stringify(node));
    };
    const original = blockDecode(session.blockView, draftCodec);
    if (!astEquivalent(original, session.syntaxAst))
      editorCheckError('ブロックと本文の世代が一致しません');
    const tree = copyDraftBlock(session.blockView),
      allocatedIds = new Set(buildBlockIndex(tree).keys()), sourceOrigins=new Map();
    let nextId = session.nextBlockId || 1,
      selectedId = session.blockSelection,
      operationCount = 0;
    const lookup = (id) => {
      const result = buildBlockIndex(tree).get(id);
      if (!result) editorError('その ブロックが 見つかりません。もう一度 えらんでね。');
      return result;
    };
    const fresh = (node, preserveSource = false) => {
      const copy = copyDraftBlock(node);
      for (const entry of buildBlockIndex(copy).values()) {
        let id;
        do {
          id = 'eCore-' + nextId++;
        } while (allocatedIds.has(id));
        if(preserveSource)sourceOrigins.set(id,sourceOrigins.get(entry.node.id)||entry.node.id);
        entry.node.id = id;
        allocatedIds.add(id);
      }
      return copy;
    };
    const position = (value, length, allowEnd = false) => {
      if (!Number.isInteger(value) || value < 0 || value > (allowEnd ? length : length - 1))
        editorError('そこには 入れられません。ほかの ばしょを えらんでね。');
      return value;
    };
    const bodySlot = (parentId, key) => {
      const parent = lookup(parentId).node,
        schema = BLOCK_SCHEMA_BY_ID.get(parent.schemaId),
        slot = schema.bodies.find((x) => x.key === key);
      if (!slot || (slot.when && !parent.fields[slot.when]))
        editorError('そこには ブロックを つなげません。ほかの ばしょを えらんでね。');
      return { parent, slot, array: parent.bodies[key] };
    };
    const inputSlot = (parentId, key, index, append = false) => {
      const parent = lookup(parentId).node,
        schema = BLOCK_SCHEMA_BY_ID.get(parent.schemaId),
        slot = schema.inputs.find((x) => x.key === key);
      if (!slot) editorError('そこには 計算を 入れられません。ほかの ばしょを えらんでね。');
      if (slot.required === false && slot.multiple && !Object.hasOwn(parent.inputs, key)) parent.inputs[key] = [];
      if (slot.multiple) position(index, parent.inputs[key].length, append);
      else if (index !== undefined && index !== null) editorCheckError('固定入力に番号は指定しません');
      return { parent, slot, array: slot.multiple ? parent.inputs[key] : null, index };
    };
    const setInput = (location, node) => {
      const schema = BLOCK_SCHEMA_BY_ID.get(node.schemaId);
      if (schema?.category !== location.slot.type) editorError('その 計算は そこには 入れられません。合う ばしょを えらんでね。');
      if (location.slot.multiple) location.array[location.index] = node;
      else location.parent.inputs[location.slot.key] = node;
    };
    const replaceEntry = (entry, node) => {
      if (!entry.parentId) editorCheckError('本文全体はこの操作では置換できません');
      if (entry.body) {
        if (BLOCK_SCHEMA_BY_ID.get(node.schemaId)?.category !== 'statement')
          editorError('ここには ブロックを つなげてね。計算は ここには 入れられません。');
        lookup(entry.parentId).node.bodies[entry.body][entry.index] = node;
      } else setInput(inputSlot(entry.parentId, entry.input, entry.index), node);
    };
    const apply = (op) => {
      if (!op || typeof op !== 'object' || ++operationCount > LIMITS.sourceEach)
        editorCheckError('編集操作が不正です');
      if (op.type === 'batch') {
        if (!Array.isArray(op.operations)) editorCheckError('操作の配列がありません');
        for (const child of op.operations) apply(child);
        return;
      }
      if (op.type === 'cancel' || op.type === 'noop') return;
      if (op.type === 'field' || op.type === 'annotation') {
        const entry = lookup(op.id),
          schema = BLOCK_SCHEMA_BY_ID.get(entry.node.schemaId),
          group = op.type === 'field' ? 'fields' : 'annotations';
        if (!schema[group].some((x) => x.key === op.key)) editorCheckError('編集する欄がありません');
        // The waited-for broadcast is the one just before (LANGUAGE.md 439); a typed name cannot rebind it.
        if (op.type === 'field' && op.key === 'broadcastRef' && op.value !== entry.node.fields.broadcastRef)
          editorError('待つ合図は、すぐ前の行で送った合図に 決まっています。名前を かえて ほかの合図を えらぶことは できません。');
        entry.node[group][op.key] = op.value;
        selectedId = op.id;
        return;
      }
      if (op.type === 'else') {
        const node = lookup(op.id).node;
        if (node.schemaId !== 'IfStatement' || typeof op.enabled !== 'boolean')
          editorCheckError('そうでなければの操作が不正です');
        if (node.fields.hasElse === op.enabled) return;
        node.fields.hasElse = op.enabled;
        node.bodies.elseBody = op.enabled ? [fresh(options.draft === true
          ? createBlock('Hole:statement', { allowHoles: true }) : createBlock('NoOperation'))] : [];
        node.annotations.elseComment = '';
        selectedId = op.id;
        return;
      }
      if (op.type === 'comment-lines') {
        const entry = lookup(op.id);
        if (
          entry.node.schemaId !== 'CommentLine' ||
          !entry.body ||
          !Array.isArray(op.lines) ||
          op.lines.some((x) => typeof x !== 'string' || /[\r\n]/.test(x))
        )
          editorCheckError('コメント行の内容が不正です');
        const array = lookup(entry.parentId).node.bodies[entry.body],
          nodes = op.lines.map((text) => {
            const node = fresh(createBlock('CommentLine'));
            node.fields.text = text;
            return node;
          });
        array.splice(entry.index, 1, ...nodes);
        selectedId = nodes[0]?.id || entry.parentId;
        return;
      }
      if (op.type === 'insert' || op.type === 'duplicate') {
        const destination = bodySlot(op.parentId, op.body),
          at = position(op.index, destination.array.length, true),
          node = fresh(op.type === 'duplicate' ? lookup(op.id).node : op.node, op.type === 'duplicate');
        if (BLOCK_SCHEMA_BY_ID.get(node.schemaId)?.category !== 'statement')
          editorError('ここには ブロックを 入れてね。計算は ここには 入れられません。');
        // A visible body placeholder is replaced by the command the child chooses.
        // Complete existing bodies still use ordinary insertion semantics.
        if (op.type === 'insert' && destination.array.length === 1 &&
            destination.array[0].schemaId === 'Hole:statement')
          destination.array.splice(0, 1, node);
        else destination.array.splice(at, 0, node);
        selectedId = node.id;
        return;
      }
      if (op.type === 'remove') {
        const entry = lookup(op.id);
        if (!entry.body) editorError('この 計算は けせません。ほかの 計算と 入れかえてね。ならんでいる ものは「外す」で 外せるよ。');
        const parent=lookup(entry.parentId).node,array=parent.bodies[entry.body],slot=BLOCK_SCHEMA_BY_ID.get(parent.schemaId).bodies.find(s=>s.key===entry.body);
        if(slot.requiredExecutable&&!array.some((node,i)=>i!==entry.index&&!['CommentLine','Hole:statement'].includes(node.schemaId))){
          if(!options.draft)editorError(`${slot.label}には ブロックが 1つ いります。先に 新しい ブロックを 入れるか、「何もしない」に 入れかえてね`);
          const hole=fresh(createBlock('Hole:statement',{allowHoles:true}));hole.fields.label=slot.label;array.splice(entry.index,1,hole);selectedId=hole.id;return;
        }
        array.splice(entry.index, 1);
        selectedId = array[Math.min(entry.index, array.length - 1)]?.id || entry.parentId;
        return;
      }
      if (op.type === 'replace') {
        const entry = lookup(op.id),
          node = fresh(op.node);
        replaceEntry(entry, node);
        selectedId = node.id;
        return;
      }
      if (op.type === 'move') {
        const entry = lookup(op.id),
          target = lookup(op.parentId);
        if (!entry.body) editorError('この ブロックは ここから 動かせません。');
        if (target.node.id === op.id || target.ancestors.includes(op.id))
          editorError('ブロックを 自分の 中には 動かせません。ほかの ばしょを えらんでね。');
        const source = lookup(entry.parentId).node.bodies[entry.body],
          destination = bodySlot(op.parentId, op.body),
          at = position(op.index, destination.array.length, true);
        let adjusted = at;
        if (source === destination.array && entry.index < at) adjusted--;
        if (source === destination.array && entry.index === adjusted) return;
        source.splice(entry.index, 1);
        destination.array.splice(adjusted, 0, entry.node);
        selectedId = op.id;
        return;
      }
      if (op.type === 'expression') {
        const location = inputSlot(op.parentId, op.input, op.index),
          node = fresh(op.node);
        setInput(location, node);
        selectedId = node.id;
        return;
      }
      if(op.type==='operator'){
        const node=lookup(op.id).node,before=BLOCK_SCHEMA_BY_ID.get(node.schemaId),after=BLOCK_SCHEMA_BY_ID.get(op.schemaId);
        if(!['BinaryExpression','CompareExpression','LogicalExpression'].includes(before.kind)||after?.kind!==before.kind)editorError('同じ なかまの しるしを えらんでね。ちがう ものに かえるときは、計算を はじめから 入れなおしてね。');
        node.schemaId=after.id;selectedId=node.id;return;
      }
      if(op.type==='optional-input-remove'){
        const location=inputSlot(op.parentId,op.input);
        if(location.slot.required!==false||location.slot.multiple)editorError('ここは 外せません。');
        delete location.parent.inputs[op.input];selectedId=op.parentId;return;
      }
      if (op.type === 'expression-move') {
        const entry = lookup(op.id),
          target = lookup(op.parentId);
        if (
          !entry.input ||
          BLOCK_SCHEMA_BY_ID.get(entry.node.schemaId)?.category !== 'expression'
        )
          editorError('この 計算は ここから 動かせません。');
        const destination = inputSlot(op.parentId, op.input, op.index);
        if (target.node.id === op.id || target.ancestors.includes(op.id))
          editorError('ブロックを 自分の 中には 動かせません。ほかの ばしょを えらんでね。');
        if (
          entry.parentId === op.parentId &&
          entry.input === op.input &&
          (entry.index ?? null) === (op.index ?? null)
        )
          return;
        if (!op.replacement) editorCheckError('移動元の式を同じ操作で置き換えてください');
        const replacement = fresh(op.replacement);
        replaceEntry(entry, replacement);
        setInput(destination, entry.node);
        selectedId = entry.node.id;
        return;
      }
      if (['variadic-insert', 'variadic-remove', 'variadic-move'].includes(op.type)) {
        const location = inputSlot(op.parentId, op.input, op.index, op.type === 'variadic-insert');
        if (!location.slot.multiple || !location.slot.variadic)
          editorCheckError('個数を編集できる入力ではありません');
        if (op.type === 'variadic-insert') {
          const node = fresh(op.node);
          if (BLOCK_SCHEMA_BY_ID.get(node.schemaId)?.category !== location.slot.type)
            editorError('そこには 入れられない ものです。合う ものを 入れてね。');
          location.array.splice(op.index, 0, node);
          selectedId = node.id;
        } else if (op.type === 'variadic-remove') {
          location.array.splice(op.index, 1);
          selectedId = location.parent.id;
        } else {
          const at = position(op.toIndex, location.array.length, true),
            adjusted = at > op.index ? at - 1 : at;
          if (adjusted === op.index) return;
          const [node] = location.array.splice(op.index, 1);
          location.array.splice(adjusted, 0, node);
          selectedId = node.id;
        }
        return;
      }
      editorCheckError('対応していない編集操作です');
    };
    apply(operation);
    const candidateAst = blockDecode(tree, draftCodec);
    if (astEquivalent(original, candidateAst)) return unchanged();
    const hasHole = [...buildBlockIndex(tree).values()].some(entry =>
      BLOCK_SCHEMA_BY_ID.get(entry.node.schemaId)?.kind === 'Hole');
    if (hasHole) {
      const draftSource = formatScript(candidateAst, { allowHoles: true });
      const baseline = session.blockDraft?.baseline || {
        sourceText: session.sourceText, syntaxAst: session.syntaxAst, blockView: session.blockView,
        nodeMap: session.nodeMap, nodeIds: session.nodeIds,
        diagnostics: session.diagnostics, syntaxDiagnostics: session.syntaxDiagnostics,
        nextBlockId: session.nextBlockId, blockSelection: session.blockSelection,
        sourceRevision: session.sourceRevision, contextRevision: session.contextRevision,
      };
      const pending = { kind: 'block-draft', ownerKey: session.ownerKey,
        sourceRevision: session.sourceRevision, contextRevision: session.contextRevision,
        value: draftSource, reason: 'あいている ところを えらんで、ブロックを 入れてね' };
      return {
        ...unchanged(), changed: true, draftOnly: true, source: draftSource,
        draftSource, syntaxAst: candidateAst, blockView: tree,
        blockSelection: selectedId, nextBlockId: nextId, pendingEdit: pending,
        blockDraft: { baseline, ast: candidateAst, tree, source: draftSource, pending },
      };
    }
    const parseContext={...context,...(project?{symbols:buildSymbols(project)}:{})};
    let source = session.blockDraft ? formatScript(candidateAst) : preserveBlockSource(session, tree, sourceOrigins),
      parsed = parseSyntax(source, parseContext);
    if(!session.blockDraft&&(!parsed.ast||!astEquivalent(candidateAst,parsed.ast))){
      source=reprintChangedUnits(session,tree);parsed=parseSyntax(source,parseContext);
    }
    if (!parsed.ast) editorError(parsed.syntaxDiagnostics.map((x) => x.message).join('\n'));
    if (!astEquivalent(candidateAst, parsed.ast))
      editorError('このまま なおすと、動きや メモが かわってしまうので、できませんでした。');
    const reidentifyDraft = (encoded) => {
      const ids = new Map();
      const pair = (before, after) => {
        if (!before || !after) return;
        // Role units can become explicit QuantityLiteral nodes during parsing.
        // Keep the chosen value's id and assign an id only to the new wrapper.
        if (after.schemaId === 'QuantityLiteral' && before.schemaId !== 'QuantityLiteral') {
          pair(before, after.inputs.value); return;
        }
        if (before.schemaId === 'QuantityLiteral' && after.schemaId !== 'QuantityLiteral') {
          pair(before.inputs.value, after); return;
        }
        if (before.schemaId !== after.schemaId) return;
        ids.set(after.id, before.id);
        const schema = BLOCK_SCHEMA_BY_ID.get(after.schemaId);
        for (const slot of schema.inputs) {
          const a = before.inputs[slot.key], b = after.inputs[slot.key];
          if (slot.multiple) (b || []).forEach((child, i) => pair(a?.[i], child));
          else pair(a, b);
        }
        for (const slot of schema.bodies)
          after.bodies[slot.key].forEach((child, i) => pair(before.bodies[slot.key][i], child));
      };
      pair(tree, encoded.tree);
      const nodeMap = new Map(), nodeIds = new WeakMap();
      for (const entry of buildBlockIndex(encoded.tree).values()) {
        const oldId = entry.node.id, location = encoded.nodeMap.get(oldId);
        let id = ids.get(oldId);
        if (!id) { do { id = 'eCore-' + nextId++; } while (allocatedIds.has(id)); allocatedIds.add(id); }
        entry.node.id = id; nodeMap.set(id, location);
        let node = parsed.ast; for (const key of location.path) node = node[key];
        nodeIds.set(node, id);
      }
      return { tree: encoded.tree, nodeMap, nodeIds };
    };
    const candidateProject = editorCandidateProject(session, source, project, context),
      diagnostics = editorDiagnostics(parsed.ast, candidateProject, context),
      encoded = session.blockDraft ? reidentifyDraft(blockEncode(parsed.ast))
        : editorReidentify(blockEncode(parsed.ast), tree, parsed.ast);
    const result = {
      changed: true,
      source,
      sourceText: source,
      syntaxAst: parsed.ast,
      blockView: encoded.tree,
      nodeMap: encoded.nodeMap,
      nodeIds: encoded.nodeIds,
      diagnostics,
      syntaxDiagnostics: [],
      ownerKey: session.ownerKey,
      sourceRevision: session.sourceRevision + 1,
      contextRevision: session.contextRevision,
      context,
      project,
      blockSelection: selectedId,
      nextBlockId: nextId,
      pendingEdit: null,
      blockDraft: null,
    };
    if (options.validateCandidate) {
      const verdict = options.validateCandidate(result, candidateProject);
      if (verdict === false || verdict?.ok === false)
        editorError(verdict?.message || '作品の きまりに 合わないので、できませんでした。');
      if (verdict && typeof verdict.then === 'function')
        editorCheckError('確定前の検証は同期して行います');
    }
    return result;
  }
  const EDITOR_AVAILABILITY_CACHE = new WeakMap();
  function blockInsertionAvailability(session, schemaId, location, options = {}) {
    if (options.candidateNode) return computeBlockInsertionAvailability(session, schemaId, location, options);
    const cacheKey = [
      options.ownerKey ?? session.ownerKey,
      options.sourceRevision ?? session.sourceRevision,
      options.contextRevision ?? session.contextRevision,
      schemaId,
      location.parentId,
      location.body || '',
      location.input || '',
      location.index ?? '',
    ].join('|');
    let cache = EDITOR_AVAILABILITY_CACHE.get(session);
    if (!cache) {
      cache = new Map();
      EDITOR_AVAILABILITY_CACHE.set(session, cache);
    }
    if (cache.has(cacheKey)) return JSON.parse(JSON.stringify(cache.get(cacheKey)));
    const result = computeBlockInsertionAvailability(session, schemaId, location, options);
    cache.set(cacheKey, result);
    return JSON.parse(JSON.stringify(result));
  }
  function editorInsertionHints(session, location, options = {}) {
    if (!location.body) return [];
    const context = options.context || session.context,
      project = options.project || session.project,
      entries = buildBlockIndex(session.blockView),
      parent = entries.get(location.parentId),
      children = parent?.node.bodies[location.body];
    if (!children) return [];
    const lines = session.sourceText.split('\n'),
      next = children[location.index],
      previous = children[location.index - 1],
      nextLocation = next && session.nodeMap.get(next.id),
      previousLocation = previous && session.nodeMap.get(previous.id),
      parentLocation = session.nodeMap.get(location.parentId);
    const line = nextLocation?.sourceSpan?.startLine
      ? nextLocation.sourceSpan.startLine - 1
      : previousLocation
        ? previousLocation.endLine || previousLocation.sourceSpan?.endLine || lines.length
        : parentLocation?.sourceSpan?.startLine || 0;
    const parentIndent =
        lines[(parentLocation?.sourceSpan?.startLine || 1) - 1]?.match(/^ */)?.[0].length || 0,
      indent = parent.node.schemaId === 'Script' ? '' : ' '.repeat(parentIndent + 2),
      before = lines.slice(0, line).join('\n') + (line ? '\n' : '') + indent,
      source = before + '\n' + lines.slice(line).join('\n');
    return hintCandidates(project, context.targetId, {
      source,
      start: before.length,
      end: before.length,
      definitionKind: context.definitionKind,
      args: context.args || context.definition?.args || [],
      event: context.event,
    });
  }
  function initialBlockName(base, used) {
    let candidate = base;
    if (!used.has(candidate)) {
      validateName(candidate);
      return candidate;
    }
    for (let n = 2; ; n++) {
      const suffix = String(n);
      if (cpLen(suffix) > 32) throw new AkariError('F503', '利用できる初期名を作れません');
      const stem = Array.from(base)
        .slice(0, Math.max(0, 32 - cpLen(suffix)))
        .join('');
      candidate = stem + suffix;
      if (used.has(candidate)) continue;
      validateName(candidate);
      return candidate;
    }
  }
  function computeBlockInsertionAvailability(session, schemaId, location, options = {}) {
    const schema = BLOCK_SCHEMA_BY_ID.get(schemaId);
    if (!schema) return { enabled: false, reason: 'この ブロックは 使えません', diagnostics: [] };
    // Values on simple command previews remain visible choices. Enclosures and
    // persistent rules start with visible holes, never an implicit true/0/no-op.
    const draft = schema.bodies.some(slot => slot.requiredExecutable) || ['ContinuousRule','ReturnStatement'].includes(schema.kind) || schema.inputs.some(slot => slot.type === 'target');
    const creationContext = options.context || session.context || {},
      creationProject = options.project || session.project,
      component = creationProject?.components?.find(c => c.id === creationContext.targetId),
      designPosition = component && Number.isFinite(component.x) && Number.isFinite(component.y)
        ? { x: component.x, y: component.y } : null;
    let node = options.candidateNode ? JSON.parse(JSON.stringify(options.candidateNode)) : createBlock(schemaId, { draft, allowHoles: draft, designPosition });
    if (schemaId === 'NumberLiteral' && location?.input) {
      const parent = buildBlockIndex(session.blockView).get(location.parentId)?.node;
      if (parent?.schemaId === 'ContinuousRule' && ['seconds', 'distance'].includes(location.input))
        node.fields.value = location.input === 'seconds' ? 1 : 20;
    }
    // These are initial names for new blocks, never changes to existing references.
    if (
      !options.candidateNode && (schemaId === 'ForEach' ||
      schemaId === 'LocalVariableDeclaration' ||
      schemaId === 'LocalListDeclaration')
    ) {
      const used = new Set((options.context || session.context)?.args || []);
      for (const entry of buildBlockIndex(session.blockView).values()) {
        if (entry.node.schemaId === 'ForEach') used.add(entry.node.fields.binder);
        if (['LocalVariableDeclaration', 'LocalListDeclaration'].includes(entry.node.schemaId))
          used.add(entry.node.fields.name);
      }
      const key = schemaId === 'ForEach' ? 'binder' : 'name';
      node.fields[key] = initialBlockName(node.fields[key], used);
    }
    try {
      const cache = EDITOR_AVAILABILITY_CACHE.get(session),
        hintKey =
          'hints|' +
          [
            session.sourceRevision,
            session.contextRevision,
            location.parentId,
            location.body,
            location.index,
          ].join('|');
      let hints = cache?.get(hintKey);
      if (!hints) {
        hints = editorInsertionHints(session, location, options);
        cache?.set(hintKey, hints);
      }
      const commonHint = hints.find((hint) => hint.id === schemaId);
      if (commonHint && !commonHint.enabled)
        return { enabled: false, reason: commonHint.reason, diagnostics: [], node };
      const operation = location.body
        ? { type: 'insert', ...location, node }
        : { type: 'expression', ...location, node };
      // A preview does not commit the pending pointer/field transaction. Keep its
      // owner and generations while checking a separate, complete candidate tree.
      const candidate = prepareBlockEdit({ ...session, pendingEdit: null }, operation, {
          ...options,
          locked: false,
        }),
        entry = buildBlockIndex(candidate.blockView).get(candidate.blockSelection),
        span = candidate.nodeMap.get(candidate.blockSelection),
        start = span?.sourceSpan?.startLine,
        end = span?.endLine || span?.sourceSpan?.endLine || start;
      if (candidate.draftOnly) return { enabled: true, reason: '', diagnostics: [], node, draftOnly: true };
      const baseline = new Set(
          (session.diagnostics || []).map((d) => [d.code, d.message, d.where].join('|')),
        ),
        hard = new Set(['S304', 'S305', 'S306', 'S307', 'S309', 'S311', 'S312', 'S313']);
      let owner = entry;
      while (owner && !candidate.nodeMap.get(owner.node.id)?.sourceSpan && owner.parentId)
        owner = buildBlockIndex(candidate.blockView).get(owner.parentId);
      const ownerSpan = owner ? candidate.nodeMap.get(owner.node.id) : null,
        line = ownerSpan?.sourceSpan?.startLine;
      const diagnostics = candidate.diagnostics.filter(
        (d) =>
          hard.has(d.code) &&
          ((d.where === session.ownerKey &&
            (start !== undefined ? d.line >= start && d.line <= end : d.line === line)) ||
            !baseline.has([d.code, d.message, d.where].join('|'))),
      );
      return {
        enabled: diagnostics.length === 0,
        reason: diagnostics.map((d) => d.message).join('\n'),
        diagnostics,
        node,
      };
    } catch (error) {
      return {
        enabled: false,
        reason: error.message,
        diagnostics: [{ code: error.code || 'E901', message: error.message }],
        node,
      };
    }
  }

  // A view of EditorSession.blockView. All language edits go through onOperation.
  // createBlockEditorView({root,getSession,getProject,getContext,isLocked,
  //   onOperation,onPending,onCancel}) -> {render,flush,cancel,destroy,highlight,focus}.
  // onOperation is synchronous and returns {ok,changed,error}; flush returns {ok,...}.

  // Presentation-only geometry. These values never enter the project or runtime AST.
  function blockShapePath(width, height, kind = 'stack', cavities = []) {
    const w = Math.max(kind === 'stack' || kind === 'hat' ? 72 : 28, Number(width) || 72),
      h = Math.max(28, Number(height) || 28),
      r = 7;
    if (kind === 'boolean')
      return `M 13 0 H ${w - 13} L ${w} ${h / 2} L ${w - 13} ${h} H 13 L 0 ${h / 2} Z`;
    if (kind === 'value')
      return `M 16 0 H ${w - 16} Q ${w} 0 ${w} 16 V ${Math.max(16, h - 16)} Q ${w} ${h} ${w - 16} ${h} H 16 Q 0 ${h} 0 ${h - 16} V 16 Q 0 0 16 0 Z`;
    if (kind === 'hat')
      return `M 0 18 Q 25 -8 66 10 H ${w - r} Q ${w} 10 ${w} 17 V ${h - r} Q ${w} ${h} ${w - r} ${h} H 50 L 44 ${h + 6} H 26 L 20 ${h} H ${r} Q 0 ${h} 0 ${h - r} Z`;
    let path = `M ${r} 0 H 20 L 26 6 H 44 L 50 0 H ${w - r} Q ${w} 0 ${w} ${r}`;
    let bottom = 8;
    for (const c of cavities) {
      const top = Math.max(bottom, Math.min(h - 14, c.top)),
        end = Math.max(top + 4, Math.min(h - 8, c.bottom));
      path += ` V ${top} H 25 Q 18 ${top} 18 ${top + 7} V ${end - 7} Q 18 ${end} 25 ${end} H ${w}`;
      bottom = end;
    }
    return (
      path +
      ` V ${h - r} Q ${w} ${h} ${w - r} ${h} H 50 L 44 ${h + 6} H 26 L 20 ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`
    );
  }
  function blockZoomCore(value) {
    return Math.max(0.2, Math.min(2, Number(value) || 1));
  }
  function blockZoomScroll(scroll, anchor, oldZoom, newZoom) {
    return Math.max(0, ((scroll + anchor) / blockZoomCore(oldZoom)) * blockZoomCore(newZoom) - anchor);
  }
  function blockShapeKind(schema) {
    if (schema.category !== 'expression') return 'stack';
    const boolean =
      schema.kind === 'BooleanLiteral' ||
      schema.kind === 'CompareExpression' ||
      schema.kind === 'LogicalExpression' ||
      schema.id === 'UnaryExpression:NOT' ||
      schema.id === 'BuiltinCall:CONTAINS' ||
      [
        'SensorRead:KEY_DOWN',
        'SensorRead:TOUCHING',
        'SensorRead:TOUCHING_COLOR',
        'SensorRead:\u30de\u30a6\u30b9\u304c\u62bc\u3055\u308c\u3066\u3044\u308b',
        'SensorRead:\u30af\u30ed\u30fc\u30f3\u3067\u3042\u308b',
      ].includes(schema.id);
    return boolean ? 'boolean' : 'value';
  }
  function blockPaletteGroup(schema) {
    if (
      [
        'UnaryExpression',
        'BinaryExpression',
        'CompareExpression',
        'LogicalExpression',
        'BuiltinCall',
      ].includes(schema.kind)
    )
      return 'operator';
    if (schema.kind === 'SensorRead') return 'sense';
    if (schema.kind === 'UserFunctionCall' || schema.kind === 'UserActionCall') return 'action';
    return (
      {
        '動き': 'motion',
        '見た目': 'look',
        '言う・たずねる': 'look',
        'もし・くり返し': 'control',
        '待つ': 'control',
        '止める': 'control',
        '合図': 'event',
        'かず・文字': 'data',
        'へんすう・リスト': 'data',
        'リスト': 'data',
        'この中だけの へんすう・リスト': 'data',
        '音': 'sound',
        'ペン': 'pen',
        'コピー': 'clone',
        '返す': 'action',
        メモ: 'comment',
      }[schema.palette] || 'operator'
    );
  }
  // Entry workshop: presentation and learning state, independent of file/runtime contracts.
  function normalizeEntryUiLevel(value) {
    if (value === null || value === 'entry') return 'entry';
    if (value === 'advanced' || value === 'all') return 'advanced';
    return 'basic';
  }
  const ENTRY_BLOCK_SCHEMA_IDS = new Set([
    'MotionCommand:MOVE_DIRECTION', 'MotionCommand:TURN_RIGHT', 'MotionCommand:TURN_LEFT',
    'MotionCommand:GOTO', 'MotionCommand:GLIDE', 'MotionCommand:GLIDE_DIRECTION',
    'Say', 'WaitTime', 'RepeatCount', 'LooksCommand:SET_COSTUME',
    'LooksCommand:SET_BACKDROP', 'SoundCommand:TONE_WAIT', 'SoundCommand:SAMPLE_WAIT',
  ]);
  const BASIC_BLOCK_SCHEMA_IDS = new Set([
    'Say', 'MotionCommand:GLIDE', 'MotionCommand:GOTO', 'RepeatCount', 'WaitTime',
    'MotionCommand:TURN_RIGHT', 'MotionCommand:TURN_LEFT', 'IfStatement',
    'LooksCommand:SET_TARGET_TEXT', 'UserActionCall', 'SoundCommand:TONE_WAIT',
    'MotionCommand:MOVE', 'MotionCommand:SET_DIRECTION',
    ...ENTRY_BLOCK_SCHEMA_IDS, 'Forever', 'LooksCommand:SHOW', 'LooksCommand:HIDE',
    'Assignment', 'NumericUpdate:ADD', 'ListReplace',
    'PenCommand:DOWN', 'PenCommand:UP', 'PenCommand:SET_COLOR', 'PenCommand:SET_SIZE',
  ]);
  const TUTORIAL_FISH_ASSETS=[{"name": "blue", "sha256": "616a39d40c93c47912be5c1559d78ed5555ccc10b270699ade11a45e193d92a3", "base64": "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", "bytes": 9129}, {"name": "orange", "sha256": "22adce1b1d1bb17451a8b1b536912400f25ac30c47659506a9255f66af958354", "base64": "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", "bytes": 9318}];
  // Guided projects remain ordinary editable programs. Artwork and named data are
  // provided; every reaction and extension below is inserted by the learner.
  function tutorialAssetRecords() {
    return TUTORIAL_FISH_ASSETS.map(a=>makeImmutableAssetRecord({id:'asset-practice-fish-'+a.name,kind:'image',mime:'image/png',
      sha256:a.sha256,bytes:decodeBase64(a.base64),meta:{width:180,height:120}}));
  }
  function makeTutorialProject() {
    const p=makeEmptyProject();p.name='さかなキャッチ';
    Object.assign(p.components[0],{name:'さかな',x:270,y:170,w:100,h:67,
      costumes:[{id:'costume-blue',name:'青いさかな',kind:'image',assetId:'asset-practice-fish-blue'},
        {id:'costume-orange',name:'オレンジのさかな',kind:'image',assetId:'asset-practice-fish-orange'}],costumeId:'costume-blue'});
    p.stage.backdrops[0]={id:'backdrop-1',name:'海',kind:'color',value:'#e4f4fc'};
    p.projectData.variables=[{id:'practice-score',name:'点数',initialValue:0}];
    p.components.push({id:'practice-board',type:'label',name:'点数ボード',x:20,y:20,w:600,h:45,fg:'#173047',bg:null,fontSize:24,
      visible:true,direction:0,scalePercent:100,text:'さかなを キャッチ！',localData:{variables:[],lists:[]}});
    p.scripts=[{id:'practice-click',targetId:'sprite-1',event:'click',source:'ほかの動きをぜんぶ止める。'}];
    return p;
  }
  const TUTORIAL_BLOCKS=Object.freeze({
    speech:{label:'お話しする',source:'「こんにちは」と1秒話す。'},
    escape:{label:'ちがう ばしょへ にげる',source:'よこ70から490のどれか、たて130から270のどれかのばしょへ行く。'},
    swim:{label:'ゆっくり泳ぐ',source:'よこ430歩、たて180歩のばしょへ1秒かけて動く。'},
    randomSwim:{label:'あちこちへ泳ぐ',source:'よこ70から490のどれか、たて130から270のどれかのばしょへ0.5秒かけて動く。'},
    repeat:{label:'くり返す',source:'3回くり返す。\n  0秒待つ。',hole:'body'},
    right:{label:'右へ泳ぐ',source:'0.3秒かけて画面の右へ60歩動く。'},
    left:{label:'左へ泳ぐ',source:'0.3秒かけて画面の左へ60歩動く。'},
    small:{label:'小さくする',source:'大きさを70％にする。'},
    point:{label:'点数を1ふやす',source:'点数を1増やす。'},
    score:{label:'点数を見せる',source:'「点数ボード」の文字を（「つかまえた：」と点数をつなげた文字）にかえる。'},
    finish:{label:'5ひきなら',source:'もし点数が5以上なら、\n  0秒待つ。',hole:'thenBody'},
    bonus:{label:'3ひきなら',source:'もし点数が3と同じなら、\n  0秒待つ。',hole:'thenBody'},
    bonusPoint:{label:'おまけの点を足す',source:'点数を2増やす。'},
    cheer:{label:'おいわいのことば',source:'「クリア！」と0.5秒話す。'},
    remaining:{label:'のこりを見せる',source:'「点数ボード」の文字を（「あと：」と最大（0、10－点数）をつなげた文字）にかえる。'},
    tone:{label:'音を鳴らす',source:'880Hzの音を0.1秒鳴らす。'},
    lowTone:{label:'ひくい音',source:'523Hzの音を0.1秒鳴らす。'},
    midTone:{label:'まん中の音',source:'659Hzの音を0.1秒鳴らす。'},
    highTone:{label:'たかい音',source:'784Hzの音を0.1秒鳴らす。'},
    costume:{label:'すがたをかえる',source:'次のすがたにかえる。'},
    turn:{label:'くるっと回る',source:'右に90度回る。'},
    wait:{label:'少し待つ',source:'0.1秒待つ。'},
  });
  function tutorialCandidate(key,project,identity=key) {
    const spec=TUTORIAL_BLOCKS[key],parsed=parseScript(spec.source,buildSymbols(project),{targetId:'sprite-1',event:'click'});
    const node=blockEncode(parsed.body[0]).tree;
    if(spec.hole)node.bodies[spec.hole]=[createBlock('Hole:statement',{allowHoles:true})];
    let serial=0;const rename=n=>{n.id='lesson-'+identity+'-'+(++serial);for(const v of [...Object.values(n.inputs||{}),...Object.values(n.bodies||{})].flat())if(v&&typeof v==='object'&&v.schemaId)rename(v);};rename(node);return node;
  }
  function tutorialNodeShape(node) {
    if(Array.isArray(node))return node.map(tutorialNodeShape);if(!node||typeof node!=='object')return node;
    return Object.fromEntries(Object.entries(node).filter(([k])=>!['id','annotations','sourceSpan','surface','sourceRange'].includes(k)).map(([k,v])=>[k,tutorialNodeShape(v)]));
  }
  function tutorialNodeAt(tree,path=[]) {let n=tree;for(const part of path)n=n?.[part];return n;}
  function tutorialField(tree,step) {
    let node=tutorialNodeAt(tree,step.ref||[]);if(node?.schemaId==='QuantityLiteral')node=node.inputs.value;
    return {node,key:step.field||'value'};
  }
  function tutorialDestination(tree,step) {
    const parent=tutorialNodeAt(tree,step.parent||[]);if(!parent)return null;
    const body=step.body||'body',items=parent.bodies?.[body];if(!items)return null;
    return {parentId:parent.id,body,index:items.length===1&&items[0].schemaId==='Hole:statement'?0:step.at??items.length};
  }
  function tutorialDefine(s) {return Object.freeze({...s,goal:s.message,target:s.id,
    start:'same-practice-work-and-previous-verified-state',allowed:Object.freeze([s.action||(s.block?'insert:'+s.block:'field:'+s.id),'exit','stop']),
    input:s.ref?{type:typeof s.value==='string'?'text':'number',min:s.min??0,max:s.max??1000}:null,
    ime:'composition is retained; only confirmed input can succeed; Escape cancels this field',success:'expected',
    recovery:s.action==='runtime:click'?'retry-current-run':'stay-and-correct',next:'committed content and observed runtime only',
    exit:'stop-runtime-and-release-all-guards; retain work and pending input'});}
  const tutorialInsert=(id,key,at,parent=[],body='body',message)=>tutorialDefine({id,block:key,at,parent,body,
    message:message||'光る「＋」を おして、「'+TUTORIAL_BLOCKS[key].label+'」を入れよう。'});
  const tutorialTry=(tag,clicks=2)=>[
    tutorialDefine({id:'run-'+tag,action:'run',message:'「動かす」を おしてみよう。何が かわったかな？'}),
    tutorialDefine({id:'try-'+tag,action:'runtime:click',clicks,message:'さかなを'+clicks+'回キャッチして、動きを見てみよう。'}),
    tutorialDefine({id:'stop-'+tag,action:'stop',message:'「止める」で、作る ばしょに もどろう。'})];
  const TUTORIAL_STEPS=Object.freeze([
    tutorialDefine({id:'choose-click',action:'event:click',message:'「キャラが おされたとき」を えらぼう。さかなを おすと 動く作品を 作るよ。'}),
    tutorialInsert('add-speech','speech',1),
    tutorialDefine({id:'speech-text',ref:['bodies','body',1,'inputs','value'],value:'つかまった！',message:'言うことを「つかまった！」にして、Enter キーを おしてね。'}),
    tutorialInsert('add-escape','escape',2),...tutorialTry('original',3),
    tutorialDefine({id:'choose-course',action:'choice',choice:'course',message:'できた！ どんな遊びを足そう？ ここでほぞんして終わってもいいよ。'})]);
  const TUTORIAL_COURSES=Object.freeze([
    {id:'motion',label:'動きをつけよう',description:'泳ぎ方をかえて遊ぼう。',children:[
      {id:'swim',label:'あちこちへ泳ぐ',description:'行く ばしょと 速さを かえよう。'},
      {id:'zigzag',label:'いったりきたり',description:'くり返しで泳がせよう。'},
      {id:'small',label:'小さなさかな',description:'大きさをかえて、つかまえよう。'}]},
    {id:'score',label:'ゲームにしよう',description:'つかまえた数を見せよう。',children:[
      {id:'goal',label:'めざせ、5ひき！',description:'決めた数で、おいわいしよう。'},
      {id:'bonus',label:'おまけの点',description:'ある数になったら、点をふやそう。'},
      {id:'remaining',label:'あと何びき？',description:'ひき算で、のこりを見せよう。'}]},
    {id:'show',label:'音やすがたで遊ぼう',description:'キャッチしたときの 音や すがたを 作ろう。',children:[
      {id:'melody',label:'音をならべよう',description:'短いメロディーを作ろう。'},
      {id:'costume',label:'さかながへんしん',description:'ちがうすがたで遊ぼう。'},
      {id:'dance',label:'くるくるショー',description:'回る動きと、待つ時間を組もう。'}]},
  ]);
  function tutorialCourseSteps(course,offset,tag) {
    const steps=course==='motion'?[tutorialInsert(tag+'-swim','swim',offset)]:course==='score'?
      [tutorialInsert(tag+'-point','point',offset),tutorialInsert(tag+'-score','score',offset+1)]:[tutorialInsert(tag+'-tone','tone',offset)];
    return [...steps,...tutorialTry(tag),tutorialDefine({id:tag+'-choose',action:'choice',choice:'extension',course,offset,
      message:'ここまでできたね！ つぎは、どれを作ろう？'})];
  }
  function tutorialExtensionSteps(course,leaf,offset,tag) {
    const root=i=>['bodies','body',i],steps=[];let ref,value,min=1,max=10;
    if(leaf==='swim'){steps.push(tutorialInsert(tag+'-random','randomSwim',offset));ref=[...root(offset),'inputs','args',0];value=.5;min=.5;max=2;}
    if(leaf==='zigzag'){
      steps.push(tutorialInsert(tag+'-repeat','repeat',offset),tutorialInsert(tag+'-right','right',0,root(offset)),tutorialInsert(tag+'-left','left',1,root(offset)));
      ref=[...root(offset),'inputs','count'];value=3;min=1;max=5;
    }
    if(leaf==='small'){steps.push(tutorialInsert(tag+'-small','small',offset));ref=[...root(offset),'inputs','args',0];value=70;min=45;max=100;}
    if(leaf==='goal'||leaf==='bonus'){
      steps.push(tutorialInsert(tag+'-if',leaf==='goal'?'finish':'bonus',offset));
      if(leaf==='bonus')steps.push(tutorialInsert(tag+'-bonus','bonusPoint',0,root(offset),'thenBody'),tutorialInsert(tag+'-score','score',1,root(offset),'thenBody'));
      steps.push(tutorialInsert(tag+'-cheer','cheer',leaf==='bonus'?2:0,root(offset),'thenBody'));
      ref=[...root(offset),'inputs','condition','inputs','right'];value=leaf==='goal'?5:3;min=2;max=6;
    }
    if(leaf==='remaining'){steps.push(tutorialInsert(tag+'-remaining','remaining',offset));
      // This path is resolved from the parsed arithmetic expression, not guessed DOM IDs.
      ref=[...root(offset),'inputs','args',1,'inputs','args',1,'inputs','args',1,'inputs','left'];value=10;min=5;max=15;
    }
    if(leaf==='melody'){
      steps.push(tutorialInsert(tag+'-low','lowTone',offset),tutorialInsert(tag+'-wait','wait',offset+1),tutorialInsert(tag+'-mid','midTone',offset+2),tutorialInsert(tag+'-high','highTone',offset+3));
      ref=[...root(offset+2),'inputs','args',0];value=659;min=250;max=1200;
    }
    if(leaf==='costume'){steps.push(tutorialInsert(tag+'-costume','costume',offset),tutorialInsert(tag+'-size','small',offset+1));ref=[...root(offset+1),'inputs','args',0];value=70;min=45;max=100;}
    if(leaf==='dance'){
      steps.push(tutorialInsert(tag+'-repeat','repeat',offset),tutorialInsert(tag+'-turn','turn',0,root(offset)),tutorialInsert(tag+'-wait','wait',1,root(offset)));
      ref=[...root(offset),'inputs','count'];value=3;min=1;max=5;
    }
    const clicks=course==='score'?6:2;
    const question={swim:'泳ぐ時間をかえよう。数を大きくすると、ゆっくり泳ぐよ。',zigzag:'何回いったりきたりする？ くり返す回数をかえよう。',small:'どのくらい小さくする？ 100なら、もとの大きさだよ。',goal:'何びきでおいわいする？ ゴールの数をかえよう。',bonus:'何びき目でおまけがもらえる？ その数をかえよう。',remaining:'全部で何びきつかまえる？ はじめの数をかえよう。',melody:'まん中の音をかえよう。数を大きくすると、高い音になるよ。',costume:'へんしんしたら、どの大きさにする？ 100がもとの大きさだよ。',dance:'何回くるくる回る？ くり返す回数をかえよう。'}[leaf];
    steps.push(...tutorialTry(tag,clicks),tutorialDefine({id:tag+'-change',ref,value,free:true,min,max,
      integer:leaf!=='swim',message:question+' 光る数を'+min+'から'+max+'の中で、今とちがう数にして、Enter キーを おしてね。'}),
      ...tutorialTry(tag+'-remix',clicks),tutorialDefine({id:tag+'-undo',action:'undo',ref,value,
        message:'「もとにもどす」を1回 おしてね。自分でかえた数が、もとにもどるよ。'}),
      tutorialDefine({id:tag+'-next',action:'choice',choice:'course',message:'できた！ ほかの遊びも足す？ ほぞんして、自分で遊んでもいいよ。'}));
    return steps;
  }
  function tutorialSequence(state) {return state?.steps||TUTORIAL_STEPS;}
  function tutorialStep(state) {return state&&!['exited','complete'].includes(state.phase)?tutorialSequence(state)[state.index]:null;}
  function tutorialAllows(state,action){const step=tutorialStep(state);return !step||step.allowed.includes(action);}
  function tutorialAdvance(state,facts,epoch){const step=tutorialStep(state);if(!step||step.action==='choice'||epoch!==state.epoch||facts.confirmedStep!==step.id||!facts.sameWork||facts.pending||facts.failed||!facts.expected)return state;
    const index=state.index+1;return {...state,index,confirmedStep:null,phase:index===tutorialSequence(state).length?'complete':'waiting'};}
  function tutorialExpectedTrees(project,steps=TUTORIAL_STEPS,values={}) {
    let tree=blockEncode(parseScript(project.scripts.find(s=>s.event==='click').source,buildSymbols(project),{targetId:'sprite-1',event:'click'})).tree;
    const states=[structuredClone(tree)];
    for(const step of steps){
      if(step.block){const loc=tutorialDestination(tree,step),parent=tutorialNodeAt(tree,step.parent||[]),items=parent.bodies[loc.body],node=tutorialCandidate(step.block,project,step.id);
        if(items.length===1&&items[0].schemaId==='Hole:statement')items.splice(0,1,node);else items.splice(loc.index,0,node);}
      if(step.ref){const role=tutorialField(tree,step);if(!role.node)editorCheckError('案内の入力先が見つかりません: '+step.id);role.node.fields[role.key]=step.free?(values[step.id]??step.value):step.value;}
      states.push(structuredClone(tree));
    }return states;
  }
  // End entry workshop pure definitions.
  const SEARCH_READINGS = Object.freeze({
    '点数':'てんすう','代金':'だいきん','持ち物':'もちもの','大きさ':'おおきさ',
    '右':'みぎ','左':'ひだり','上':'うえ','下':'した','小さく':'ちいさく',
    '変数':'へんすう','手順':'てじゅん','計算':'けいさん','挿入':'そうにゅう',
  });
  function normalizeSearchText(value) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase()
      .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/\s+/g, '');
  }
  function searchReading(value) {
    let text = normalizeSearchText(value);
    for (const [word, reading] of Object.entries(SEARCH_READINGS)) text = text.split(word).join(reading);
    return text;
  }
  function searchIntent(value) {
    const q = normalizeSearchText(value), direction = [
      ['right', /右|みぎ/], ['left', /左|ひだり/], ['up', /上|うえ/], ['down', /下|した(?=へ|に|方向|$)/],
    ].filter(([, re]) => re.test(q));
    if (direction.length === 1 && /行[くき]|い[くき]|進[むみ]|すす[むみ]|動[くきか]|うご[くきか]|移動/.test(q)
      && !/回|まわ|向[くき]|む[くき]/.test(q))
      return {schemaId:'MotionCommand:MOVE_DIRECTION', direction:direction[0][0]};
    if (/小さ|ちいさ|縮小|縮め/.test(q)) return {schemaId:'LooksCommand:SET_SCALE', scale:50};
    if (/大きく|おおきく|拡大/.test(q)) return {schemaId:'LooksCommand:SET_SCALE', scale:150};
    if (/(?:番目|ばんめ)/.test(q) && /入[れる]|いれ|挿入|そうにゅう/.test(q) && !/置き換|おきか|替え/.test(q)) {
      const match = q.match(/(\d+)(?:番目|ばんめ)/), index = match ? Number(match[1]) : null;
      return {schemaId:'ListInsert', ...(Number.isSafeInteger(index) && index >= 1 ? {index} : {})};
    }
    return null;
  }
  function hintSchemaId(id) {
    const prefix = id.split(':')[0];
    return ({read:'VariableRead',set:'Assignment',assignList:'Assignment',add:'NumericUpdate:ADD',
      subtract:'NumericUpdate:SUB',append:'ListAppend',insert:'ListInsert',replace:'ListReplace',
      delete:'ListDelete',clear:'ListClear',each:'ForEach',action:'UserActionCall',function:'UserFunctionCall'})[prefix] || id;
  }
  function matchesSearch(text, query) {
    return normalizeSearchText(text).includes(normalizeSearchText(query)) || searchReading(text).includes(searchReading(query));
  }
  function configureSearchNode(node, intent) {
    if (!intent || node.schemaId !== intent.schemaId) return node;
    if (intent.direction) node.fields.direction = intent.direction;
    if (intent.scale !== undefined) {
      const oldId = node.inputs.args[0].id;
      node.inputs.args[0] = createBlock('NumberLiteral');
      node.inputs.args[0].id = oldId; node.inputs.args[0].fields.value = intent.scale;
    }
    if (intent.index !== undefined) {
      const oldId = node.inputs.index.id;
      node.inputs.index = createBlock('NumberLiteral'); node.inputs.index.id = oldId;
      node.inputs.index.fields.value = intent.index;
    }
    return node;
  }
  function nodeForSearchHint(hint, project, context = {}, intent = null) {
    const symbols = buildSymbols(project), ast = hint.mode === 'expression'
      ? parseExpression(hint.text, symbols, context)
      : parseScript(hint.text, symbols, context).body[0];
    return configureSearchNode(blockEncode(ast).tree, intent);
  }
  function searchHintCandidates(candidates, query, project, context = {}) {
    if (!query.trim()) return candidates;
    const intent = searchIntent(query), matched = candidates.filter(h => intent
      ? (h.binding && matchesSearch(h.binding.name, query)) || hintSchemaId(h.id) === intent.schemaId
      : matchesSearch(h.text + ' ' + h.category + ' ' + h.searchTerms.join(' '), query));
    return matched.map(h => {
      if (!intent || !project) return h;
      try { const node = nodeForSearchHint(h, project, context, intent);
        return {...h, text:formatScript({kind:'Script',body:[blockDecode(node)]})};
      } catch (_) { return h; }
    }).sort((a,b) => Number(!!b.binding) - Number(!!a.binding));
  }
  function blockSearchCandidates(project, context, query, hints) {
    const schemas = BLOCK_SCHEMAS.filter(s => !s.draftOnly && ['statement','expression'].includes(s.category));
    if (!query.trim()) return schemas;
    const intent = searchIntent(query), out = [], boundSchemas = new Set();
    for (const hint of searchHintCandidates(hints, query, project, context)) {
      if (!hint.binding) continue;
      try {
        const candidateNode = nodeForSearchHint(hint, project, context, intent), schema = BLOCK_SCHEMA_BY_ID.get(candidateNode.schemaId);
        if (!schema || !schemas.includes(schema)) continue;
        out.push({...schema, candidateNode, binding:hint.binding, searchLabel:hint.text,
          candidateKey:hint.id, candidateReason:hint.reason}); boundSchemas.add(schema.id);
      } catch (_) { /* An unavailable incomplete hint remains visible through the generic schema. */ }
    }
    for (const schema of schemas) {
      if (boundSchemas.has(schema.id)) continue;
      if (!(intent ? schema.id === intent.schemaId : matchesSearch(blockPaletteSearchText(schema), query))) continue;
      const configured = intent && (intent.direction || intent.scale !== undefined || intent.index !== undefined);
      out.push(configured ? {...schema, candidateNode:configureSearchNode(createBlock(schema.id, {
        draft:schema.inputs.some(s=>s.type==='target'), allowHoles:true}), intent)} : schema);
    }
    return out;
  }

  const BLOCK_SEARCH_SYNONYMS = Object.freeze({
    'MotionCommand:MOVE_DIRECTION': ['画面の右', '画面の左', 'みぎ', 'ひだり', '方向へ進む', '移動'],
    ListInsert: ['挿入', 'そうにゅう', '途中に入れる', '番号の前に入れる'],
    'MotionCommand:MOVE': ['うごく', '動く', '移動', '進む', 'すすむ', '右へ', '左へ', '前へ'],
    'MotionCommand:GOTO': ['場所へ行く', '座標', '移動', '位置'],
    'MotionCommand:GLIDE': ['すべる', 'なめらかに動く', '移動', '時間をかける'],
    'MotionCommand:TURN_RIGHT': ['右回り', '回る', 'まわる', '向きを変える', '回転'],
    'MotionCommand:TURN_LEFT': ['左回り', '回る', 'まわる', '向きを変える', '回転'],
    'LooksCommand:SHOW': ['見せる', '表示', '出す'],
    'LooksCommand:HIDE': ['隠す', 'かくす', '非表示'],
    'LooksCommand:SET_SCALE': ['大きさ', 'おおきさ', 'サイズ'],
    Say: ['話す', '言う', 'いう', 'はなす', 'しゃべる', '発言', 'こんにちは', '秒'],
    Ask: ['質問', 'たずねる', '答え'],
    WaitTime: ['待つ', 'まつ', '時間', '秒'],
    IfStatement: ['もし', '条件', 'なら', '分かれ道'],
    RepeatCount: ['くり返す', '繰り返す', '何度も', '回数'],
    UserActionCall: ['動作', '手順', '呼び出す', '実行'],
    UserFunctionCall: ['計算', '答え', '関数', '値を求める'],
    Assignment: ['変数', '記録', '代入', '値を入れる'],
    NumericUpdate: ['増やす', '減らす', '足す', '引く', '点数'],
    VariableRead: ['変数', '値', '読む'],
  });
  function blockPaletteSearchText(schema, project) {
    const words = [schema.label, schema.id, schema.kind, schema.palette,
      ...((BLOCK_SEARCH_SYNONYMS[schema.id] || BLOCK_SEARCH_SYNONYMS[schema.kind]) || [])];
    const operation = schema.id.includes(':') ? schema.id.slice(schema.id.indexOf(':') + 1) : null;
    for (const form of SENTENCE_FORMS) {
      if (form.kind !== schema.kind || (form.op && operation && form.op !== operation)) continue;
      words.push(form.intent, ...(schema.kind==='MotionCommand'?[]:form.verbForms || []), ...(form.nounForms || []).filter(word=>word!=='動く対象'),
        ...(form.acceptedReadings || []));
    }
    return words.filter(Boolean).join(' ').toLocaleLowerCase();
  }

  // Keep the initial prefix and explicitly revealed distant pages together.
  // A focus jump must not materialize every intervening statement.
  function blockBodyRanges(length, prefixPage, extraPages, pageSize = 60) {
    const ranges = [[0, Math.min(length, (prefixPage + 1) * pageSize)]];
    for (const page of extraPages || [])
      if (Number.isInteger(page) && page >= 0 && page * pageSize < length)
        ranges.push([page * pageSize, Math.min(length, (page + 1) * pageSize)]);
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push([...range]);
    }
    return merged;
  }

