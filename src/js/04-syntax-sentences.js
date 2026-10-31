  // ────────────────────────────────────────────────────────────────────────
  // 04 — Syntax parsing: sentence forms and their readings
  // ────────────────────────────────────────────────────────────────────────
  // Check role endings before attempting multi-operand captures. A failed ending
  // must not backtrack through every possible particle split in a long sentence.
  const SENTENCE_ROLE_ENDINGS = Object.freeze({
    timedSpeech:/秒(?:間)?(?:言う|いう|話す|はなす)$/,
    addValue:/を足して(?:言う|いう|話す|はなす)$/,
    toneReverse:/Hzの音を(?:鳴らし始める|鳴らす)$/,
    appendReverse:/の(?:最後|さいご)に(?:入れる|いれる)$/,
    insertReverse:/番目(?:の前)?に(?:入れる|いれる)$/,
    assignReverse:/という変数に(?:入れる|いれる)$/,
    update:/(?:増やす|ふやす|減らす|へらす|を足す|をたす|を引く|をひく)$/,
    updateReverse:/(?:に足す|にたす|から引く|からひく)$/,
    assign:/に(?:する|変える|かえる)$/,
  });
  // The parts whose look is their text (文字・ボタン・四角): 「点数らん」に点数を出す writes into them.
  const TEXT_PART_TYPES = Object.freeze(['label', 'button', 'box']);
  const STATEMENT_EXPLICIT_ACTORS = new WeakSet();
  // The symbols a script was read with (the formatter asks them which names are lists; see listCountWord).
  const FORMAT_SYMBOLS = new WeakMap();
  // The symbols a block tree was encoded with (05 blockEncode), given back to the code it decodes to.
  const BLOCK_TREE_SYMBOLS = new WeakMap();
  // 「これを6回くり返す」 repeats the one sentence before it (the check says so when more come before it).
  const REPEAT_PREVIOUS = new WeakSet();
  const STATEMENT_LINE = new WeakMap();
  // 待つ with a subject (だんごは0.2秒待つ) holds only that part; without one (0.2秒待つ, みんなは…) the whole flow
  // waits ({kind:'all'}). A wait does not take the subject of the line before it, only of its own sentence.
  const EVERYONE_WAITS = new Set(['WaitTime','WaitUntil','BroadcastAndWait','WaitBroadcastGroup']);
  const EVERYONE_WORDS = ['みんな','全体'];
  const EVERYONE_START = new RegExp('^(?:'+EVERYONE_WORDS.join('|')+')(?:(?:は|が|で|も)、?|、|(?=[0-9０-９（「]))');
  function everyoneWait(node,ctx) {
    if(node&&EVERYONE_WAITS.has(node.kind))node.actorRef=ctx.sentenceActor?{...ctx.sentenceActor}:{kind:'all'};
    return node;
  }
  // Patterns made of the parts' names, built once per symbols: every line of a long body uses them.
  const ACTOR_NAME_PATTERNS=new WeakMap();
  // The part names diagnoseSentenceIntent looks for, longest first, with their patterns (made once per symbols).
  const PART_NAME_PATTERNS=new WeakMap();
  function partNamePatterns(symbols){
    const cached=symbols&&PART_NAME_PATTERNS.get(symbols);if(cached)return cached;
    const names=[...(symbols?.project?.components||[])].map(c=>c.name).sort((a,b)=>b.length-a.length),escape=name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const patterns={
      endingInParticle:names.filter(name=>/[にの]$/.test(name)&&nameSource(name).startsWith('【')).map(name=>({name,pattern:new RegExp('(?:^|もし、?|[、はがをと])'+escape(name)+'(?=に|の|まで|から)')})),
      looking:names.map(name=>({name,pattern:new RegExp('(?:^|もし、?|[、はがをと])'+escape(name)+'(?=に(?:ふれ|触れ)|の方を向|までのきょり|のところ(?:へ|に))')})),
    };
    if(symbols)PART_NAME_PATTERNS.set(symbols,patterns);
    return patterns;
  }
  function actorNamePatterns(symbols) {
    const cached=symbols&&ACTOR_NAME_PATTERNS.get(symbols);if(cached)return cached;
    const components=(symbols?.project?.components||[]).map(c=>c.name),stage=symbols?.project?.stage?.name;
    const alt=list=>[...new Set(list)].sort((a,b)=>b.length-a.length).map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
    const all=alt(['自分',...components,...(stage?[stage]:[])]),parts=alt(['自分',...components]);
    const patterns={
      partNames:[...new Set([...components,'自分'])].sort((a,b)=>b.length-a.length),
      partsWithSelf:[...(symbols?.project?.components||[]),{name:'自分'}].sort((a,b)=>b.name.length-a.name.length),
      actorsWithSelf:[...(symbols?.project?.components||[]),...(symbols?.project?.stage?[symbols.project.stage]:[]),{name:'自分'}].sort((a,b)=>b.name.length-a.name.length),
      both:new RegExp('^('+all+')(?:と|も|、|や)('+all+')(?:は|が|も)、?(?:いっしょに|一緒に|ともに|みんなで|みんな|ふたりで|二人で)?、?(.+)$'),
      inner:new RegExp('^(もし)?('+parts+')は、?((?:押|お)され|クリックされ|(?:.+?))'),
      // Without a project (a specification example) any name before は reads as the part that waits.
      late:new RegExp('^(.+まで)、?('+(symbols?.project?alt(['自分','みんな','全体',...components]):'[^、。\u0001]+?')+')(?:は|が|だけ|だけは|も)、?(?:待つ|まつ|待ちます)$','d'),
      only:new RegExp('^('+all+')だけ(?:は|が)?、?(?![をのにへとがは])'),
    };
    if(symbols)ACTOR_NAME_PATTERNS.set(symbols,patterns);
    return patterns;
  }
  // Words that only say the order (そして、まず …) or how (はやく …); they are dropped before an action.
  const LEAD_WORDS='そのあと|それから|次に|つぎに|最後に|さいごに|そして|まず|まずは|はじめに|最初に|さいしょに|また|次は|つぎは|最後は|さいごは|こんどは|今度は|はやく|すばやく|さっと';
  // A lead word with 、, or without it before a number, a quote or a usual first word; and a lead word alone.
  const LEAD_BEFORE=new RegExp('^(?:(?:'+LEAD_WORDS+'|くり返しが終わると)、|(?:'+LEAD_WORDS+')(?=[0-9０-９\u0001－]|前へ|後ろへ|右に|右へ|左に|左へ|画面の|いまの|今の|まっすぐ|自分|すがた|姿|はいけい|背景|ペン|すべての|この|ほかの|作品|何も|いちばん|よこ|たて|表示色|大きさ|音の|重なり|向き|次の|前の|みんな|全体))'),LEAD_WORD=new RegExp('^(?:'+LEAD_WORDS+')');
  // Key names a child writes for the keys Akari names 空白・決定・右 ….
  const KEY_ALIASES=Object.freeze({スペース:'空白',スペースキー:'空白',みぎ:'右',ひだり:'左',うえ:'上',した:'下','→':'右','←':'左','↑':'上','↓':'下',エンター:'決定',リターン:'決定',エスケープ:'取消'});
  const KEY_WORDS=Object.freeze(['上','下','左','右','空白','決定','取消']);
  // 「ａ」「Ａ」「A」 are the a key, 「１」 the 1 key (an e.key is half-width; A only comes with Shift).
  function keyName(value){if(typeof value!=='string')return value;if(KEY_ALIASES[value])return KEY_ALIASES[value];
    const half=/^[ａ-ｚＡ-Ｚ０-９]$/.test(value)?String.fromCharCode(value.charCodeAt(0)-0xFEE0):value;return /^[A-Z]$/.test(half)?half.toLowerCase():half;}
  function keyWord(text){return KEY_ALIASES[text]||(KEY_WORDS.includes(text)?text:/^[a-zA-Z0-9ａ-ｚＡ-Ｚ０-９]$/.test(text)?keyName(text):null);}
  // スペースキーがおされている (no 「 」) names the key, unless スペース is data.
  function keyArg(node,symbols,ctx){
    const bare=node?.kind==='VariableRead'&&!node.qualifier&&keyWord(node.name)&&!dataNameKind(node.name,symbols,ctx||{});
    const word=bare?keyWord(node.name):node?.kind==='StringLiteral'&&keyName(node.value)!==node.value&&keyName(node.value);
    if(!word)return node;const literal=exprNode('StringLiteral',{value:word}),location=SOURCE_RANGES.get(node);if(location)SOURCE_RANGES.set(literal,location);return literal;}
  const SENTENCE_TE_FORMS = Object.freeze([
    ['鳴らし始めて','鳴らし始める'], ['言わせて','言わせる'], ['かくして','かくす'], ['隠して','隠す'],
    ['うごかして','うごかす'], ['動かして','動かす'], ['うごいて','うごく'], ['動いて','動く'],
    ['すすんで','すすむ'], ['進んで','進む'], ['あるいて','あるく'], ['歩いて','歩く'], ['まわって','まわる'], ['回って','回る'],
    ['むいて','むく'], ['向いて','向く'], ['行って','行う'],
    ['変えて','変える'], ['かえて','かえる'], ['言って','言う'], ['いって','いう'], ['話して','話す'], ['はなして','はなす'],
    ['待って','待つ'], ['まって','まつ'], ['見せて','見せる'], ['みせて','みせる'], ['入れて','入れる'], ['いれて','いれる'],
    ['足して','足す'], ['たして','たす'], ['引いて','引く'], ['ひいて','ひく'], ['消して','消す'], ['けして','けす'],
    ['知らせて','知らせる'], ['鳴らして','鳴らす'], ['くり返して','くり返す'], ['繰り返して','繰り返す'], ['くりかえして','くりかえす'],
    ['増やして','増やす'], ['ふやして','ふやす'], ['減らして','減らす'], ['へらして','へらす'], ['下ろして','下ろす'], ['おろして','下ろす'],
    ['押して','押す'], ['おして','おす'], ['止めて','止める'], ['作って','作る'], ['つくって','作る'],
    ['送って','送る'], ['上げて','上げる'], ['あげて','上げる'], ['下げて','下げる'], ['下がって','下がる'], ['さがって','さがる'],
    ['出て','出る'], ['はね返って','はね返る'], ['聞いて','たずねて、答えを待つ'], ['きいて','たずねて、答えを待つ'], ['たずねて','たずねて、答えを待つ'], ['して','する'],
  ].map(Object.freeze));
  // すべる (滑る) is no longer read. Its て-form only lets the move guidance find the clause and name 〇秒かけて.
  const GUIDED_TE_FORMS = Object.freeze([...SENTENCE_TE_FORMS, ...[['すべって','すべる'], ['滑って','滑る']].map(Object.freeze)]);
  function surfaceCapture(pattern, code, protectedCode = surfaceMask(code)) {
    const match = pattern.exec(protectedCode);
    if (!match) return null;
    return match.indices.slice(1).map(range => range ? {text:code.slice(...range), start:range[0], end:range[1]} : null);
  }
  // Parser slices share raw columns; each compact scan and code-point prefix is computed once per source line.
  const SURFACE_LINE_CACHE = new WeakMap();
  function surfaceLineInfo(line) {
    let info = SURFACE_LINE_CACHE.get(line);
    if (info?.source === line.code && info.raw === line.raw && info.positions === line.mapped?.positions) return info;
    let columns = line.sourceColumns;
    if (columns?.raw !== line.raw) {
      const values = new Uint32Array(line.raw.length + 1);
      let count = 0;
      for (let i = 0; i < line.raw.length; i++) {
        const value = line.raw.charCodeAt(i), previous = line.raw.charCodeAt(i - 1);
        if (!(value >= 0xDC00 && value <= 0xDFFF && previous >= 0xD800 && previous <= 0xDBFF)) count++;
        values[i + 1] = count;
      }
      columns = { raw: line.raw, values, count };
    }
    info = { source: line.code, raw: line.raw, positions: line.mapped?.positions, text: compactOutsideString(line.code), columns };
    SURFACE_LINE_CACHE.set(line, info);
    return info;
  }
  function surfaceLineSlice(line, start, end, replacement = null) {
    const info = surfaceLineInfo(line), code = info.text.slice(start, end), positions = line.mapped?.positions.slice(start, end) || [];
    let mappedPositions = positions;
    if (replacement !== null) {
      mappedPositions = Array(replacement.length); let prefix = 0, suffix = 0;
      while (prefix < code.length && prefix < replacement.length && code[prefix] === replacement[prefix]) { mappedPositions[prefix] = positions[prefix]; prefix++; }
      while (suffix < code.length - prefix && suffix < replacement.length - prefix && code[code.length - 1 - suffix] === replacement[replacement.length - 1 - suffix]) { mappedPositions[replacement.length - 1 - suffix] = positions[code.length - 1 - suffix]; suffix++; }
    }
    // Match String.slice(0, offset), including an unmapped rewritten prefix (NaN becomes zero).
    const offset = positions[0] - (line.physicalStart ?? line.start), finiteOffset = Number.isNaN(offset) ? 0 : Math.trunc(offset),
      columnIndex = finiteOffset < 0 ? Math.max(0, line.raw.length + finiteOffset) : Math.min(line.raw.length, finiteOffset);
    return { ...line, code: replacement ?? code, mapped: { text: replacement ?? code, positions: mappedPositions }, sourceColumns: info.columns,
      start: positions.length ? positions[0] - (line.indent || 0) : line.start, physicalStart: line.physicalStart ?? line.start,
      startColumn: positions.length ? info.columns.values[columnIndex] + 1 : line.startColumn || 1, inline: true, comment: '',
      rewritten: !!line.rewritten || (replacement !== null && replacement !== code) };
  }
  function surfaceColumn(line, offset) {
    const columns = surfaceLineInfo(line).columns, n = Number.isNaN(offset) ? 0 : Math.trunc(offset),
      index = n < 0 ? Math.max(0, line.raw.length + n) : Math.min(line.raw.length, n);
    return columns.values[index];
  }

  function sentenceActor(text,symbols) {
    if (text === '自分') return {kind:'self'};
    if(symbols?.project?.components.some(component=>component.name===text)||symbols?.project?.stage.name===text)
      return {kind:'named',name:text};
    const name = parsedDeclarationName(text);
    return {kind:'named',name};
  }
  // The subject the following sentences inherit: the part, without the particle its own sentence was written with.
  function topicOf(actorRef) { const topic = {...actorRef}; delete topic.particle; return topic; }
  // 名人 (決まり4): after a sentence whose subjects are inside it (もし, 主語を並べた文, 集まり, あいだ, 同時に始める,
  // くり返しの中), no subject is carried on; 〜ながら (one part) carries its part. A sentence with none inside keeps it.
  function meijinTopicAfter(nodes, topic) {
    const inner = [], walk = v => { if (Array.isArray(v)) { v.forEach(walk); return; } if (!v || typeof v !== 'object') return; if (STATEMENT_EXPLICIT_ACTORS.has(v)) inner.push(topicOf(v.actorRef)); for (const k of ['body', 'thenBody', 'elseBody', 'lanes']) if (v[k]) walk(v[k]); };
    walk(nodes);
    if (nodes.length === 1 && nodes[0].speaksAs) return ['named', 'value'].includes(nodes[0].speaksAs.kind) ? topicOf(nodes[0].speaksAs) : topic;
    const sets = nodes.some(n => ['ParallelEach', 'ForEach'].includes(n.kind));
    if (!inner.length && !sets) return topic;
    const same = a => a.kind === inner[0].kind && a.name === inner[0].name && JSON.stringify(a.value) === JSON.stringify(inner[0].value);
    return !sets && nodes.length === 1 && nodes[0].kind === 'Parallel' && inner.every(same) ? inner[0] : { kind: 'self', topicEnded: true };
  }
  // 名人 (決まり2): a sentence of the part carried on that names what it acts on (ねこの動きを止める, 鳥に知らせる,
  // 星のコピーを全部消す) waits for that part's wait, as the part's next sentence does.
  function meijinLaneRefs(nodes, topic) {
    let current = topic;
    for (const n of nodes || []) {
      if (!n || typeof n !== 'object') continue;
      if (STATEMENT_EXPLICIT_ACTORS.has(n)) { current = topicOf(n.actorRef); continue; }
      if (n.kind === 'Parallel') { for (const lane of n.lanes || []) meijinLaneRefs(lane, current); continue; }
      if (['named', 'value'].includes(current?.kind) && n.actorRef && n.actorRef.kind !== 'all' && JSON.stringify(topicOf(n.actorRef)) !== JSON.stringify(current)) n.laneRef = { ...current };
    }
  }
  function sentenceActorSource(actorRef) { return actorRef?.kind === 'named' ? nameSource(actorRef.name) : '自分'; }
  function sentenceTarget(text, code, line, symbols, ctx, start) {
    const t = parseTargetPrefix(text, symbols, ctx);
    if (!t || t.len !== text.length) throw new AkariError('P205','かえる へんすうや リストの 名前が 分かりません。作った へんすうや リストの 名前と 同じか たしかめて ください');
    const target = {name:t.name,qualifier:t.qualifier};
    const range = sourceRange(line?.mapped?.positions || [],start,start+text.length);
    if (range) SOURCE_RANGES.set(target,{range});
    return target;
  }
  function sentenceQuantity(expr, unit) {
    if (expr.kind === 'QuantityLiteral' && expr.unit === unit) return expr;
    return exprNode('QuantityLiteral',{value:expr,unit});
  }
  function sentenceQuantitySource(expr, unit) {
    const value = expr.kind === 'QuantityLiteral' && expr.unit === unit ? expr.value : expr;
    // AからBのどれか takes the unit on both ends (1秒から3秒のどれか, 右へ20歩から620歩のどれか), as it is said aloud.
    if (value.kind === 'BuiltinCall' && value.name === '乱数' && value.args?.length === 2)
      return quantityValueSource(value.args[0]) + unit + 'から' + quantityValueSource(value.args[1]) + unit + 'のどれか';
    return quantityValueSource(value, true) + unit;
  }
  function readRoleStatement(code, line, symbols, ctx) {
    const protectedCode = surfaceMask(code);
    const polite = [['話します','話す'],['はなします','はなす'],['言います','言う'],['いいます','いう'],['たずねます','たずねる'],['尋ねます','尋ねる'],['待ちます','待つ'],['まちます','まつ'],['増やします','増やす'],['減らします','減らす'],['動きます','動く'],['進みます','進む'],['回ります','回る'],
      // Every action's verb: a specific ending comes before the general します.
      ['向きます','向く'],['行きます','行く'],['いきます','いく'],['歩きます','歩く'],['あるきます','あるく'],['うごきます','うごく'],['下がります','下がる'],['さがります','さがる'],['はね返ります','はね返る'],
      ['かくします','かくす'],['隠します','隠す'],['見せます','見せる'],['出ます','出る'],
      ['かえます','かえる'],['変えます','変える'],['鳴らし始めます','鳴らし始める'],['鳴らします','鳴らす'],['止めます','止める'],
      ['送ります','送る'],['作ります','作る'],['消します','消す'],['けします','けす'],['入れます','入れる'],['足します','足す'],['引きます','引く'],
      ['下ろします','下ろす'],['上げます','上げる'],['おします','おす'],['押します','押す'],['返します','返す'],['行います','行う'],['隠れます','すがたをかくす'],['現れます','すがたを見せる'],['いれます','いれる'],['むきます','むく'],
      ['しません','しない'],['します','する']];
    const suffix = polite.find(([ending])=>protectedCode.endsWith(ending));
    const immediate = protectedCode.startsWith('すぐに') ? 3 : 0;
    if (suffix || immediate) {
      const replacement = code.slice(immediate, suffix ? -suffix[0].length : undefined) + (suffix ? suffix[1] : '');
      const part = surfaceLineSlice(line, immediate, code.length, replacement);
      part.comment = line.comment;
      return readRoleStatement(replacement,part,symbols,ctx);
    }
    // A list's どれか (E2E-R2-12) is rewritten in place: おみくじのどれかを言う → おみくじの（1からおみくじの数のどれか）番目を言う.
    const e = (part) => {
      try { return parseMappedExpression(part.text, code, line, symbols, ctx, part.start); }
      catch (error) {
        if (!error?.listPick) throw error;
        const source = code.slice(0, part.start) + error.listPick + code.slice(part.start + part.text.length);
        let readable = false;
        try { readable = !!parseSyntax(source + '。', { symbols }).ast; } catch (attempt) { if (!(attempt instanceof AkariError)) throw attempt; }
        throw Object.assign(sentenceDiagnostic(error.message, line, readable ? [{ label: 'リストから 1つ えらぶ', source: canonicalStatementSource(source, symbols) }] : []), { listPick: error.listPick });
      }
    };
    const q = (part,unit) => {if(surfaceMask(part.text).endsWith(unit))throw new AkariError('P205','「歩」や「秒」などは 1回だけ 書きます。れい：前へ10歩進む');return sentenceQuantity(e(part),unit);};
    const target = part => sentenceTarget(part.text,code,line,symbols,ctx,part.start);
    const node = (kind,props={}) => statementNode(kind,line,{...props,actorRef:{...(ctx.topicActor || {kind:'self'})}});
    const callSplit=protectedCode.lastIndexOf('、'),shortCall=symbols?.actionCallPhrases?.get(code.slice(callSplit+1));
    const action = surfaceCapture(/^(.*?)という(?:手順|てじゅん)を(?:(.+?)回)?(?:行う|おこなう)$/d,code,protectedCode)|| (shortCall?[{text:code.slice(0,callSplit+1)+`【${shortCall.name}】`}]:null);
    if (action) {
      const text = action[0].text, mask = surfaceMask(text), split = mask.lastIndexOf('、');
      let rawName=text, args=[], argumentNames=null;
      if (split >= 0) {
        rawName=text.slice(split+1);
        const input=text.slice(0,split);
        const passWord=['をわたして','を渡して'].find(w=>input.endsWith(w));
        if (passWord) {
          const inner=input.slice(0,-passWord.length);
          if (!(inner.startsWith('（')&&inner.endsWith('）'))) {
            let one=null;try{one=parseExpression(inner,symbols,ctx);}catch(error){if(!(error instanceof AkariError))throw error;}
            if (!one||!['NumberLiteral','StringLiteral','VariableRead'].includes(one.kind)) throw new AkariError('P205',/と/.test(surfaceMask(inner))?'入れる ものが 2つ いじょう ある ときは、（ ）で かこんで「、」で 分けます。れい：（3、4）をわたして、':'入れる ものを（ ）で かこんで ください。れい：（10、「あかり」）をわたして、');
            args=[one];
          } else args=parseArgumentText(inner.slice(1,-1),symbols,ctx,line.lineNo);
        } else {
          if (!input.endsWith('として')) throw new AkariError('P205','自分で 作った ブロックに 入れる ものは、「として」を つけて 書きます。れい：点数を10として、');
          const content=input.slice(0,-3), protectedInput=surfaceMask(content), chunks=[];
          let at=0;
          for(let i=0;i<=content.length;i++) if(i===content.length||protectedInput[i]==='、'){chunks.push({text:content.slice(at,i),start:at});at=i+1;}
          argumentNames=[];
          for(const chunk of chunks){const pair=surfaceCapture(/^(.+?)を(.+)$/d,chunk.text);if(!pair)throw new AkariError('P205','名前と 入れる ものを「を」で つないで 書きます。れい：点数を10として、');const name=parsedDeclarationName(pair[0].text);if(argumentNames.includes(name))throw new AkariError('S308',`入れる ものの 名前「${name}」を 2回 書いて います。名前は 1回ずつ 書いて ください`);argumentNames.push(name);args.push(e({text:pair[1].text,start:chunk.start+pair[1].start}));}
        }
      }
      const name=callableSurfaceName(rawName);
      const call=node('UserActionCall',{name,args,...(argumentNames ? {argumentNames} : {})});
      return action[1]?node('RepeatCount',{count:q(action[1],'回'),body:[call]}):call;
    }
    // 色を「赤」にする is the character's colour (F-25), as 表示色を「赤」にする; with data named 色 it changes that data.
    if(/^色を/.test(protectedCode)&&/に(?:する|変える|かえる)$/.test(protectedCode)&&!dataNameKind('色',symbols,ctx)&&!(ctx.localNames||[]).includes('色')){
      const part=surfaceLineSlice(line,0,code.length,'表示'+code);part.comment=line.comment;
      return readRoleStatement('表示'+code,part,symbols,ctx);
    }
    // 「点数らん」に点数を出す／書く／表示する (F-31): the text of a 文字・ボタン・四角 part, as 「点数らん」の文字を点数にかえる.
    {const shown=surfaceCapture(/^(\u0001+)に(.+)を(?:出す|だす|書く|かく|表示する)$/d,code,protectedCode),name=shown&&/^「([^「」]+)」$/.exec(shown[0].text)?.[1];
      if(name&&TEXT_PART_TYPES.includes(symbols?.project?.components?.find(c=>c.name===name)?.type))return node('LooksCommand',{op:'SET_TARGET_TEXT',args:[e(shown[0]),e(shown[1])]});}
    // よこのばしょを100にする / たてのばしょを10減らす are not read (B-08): the guidance comes before the data readers.
    // ねこのよこのばしょを… / 自分のよこのばしょを… too, when ねこ is a part.
    {const owned=/^(?:([^、。]+?)の)?(?:よこ|たて|横|縦)(?:のばしょ|の場所|位置)を/.exec(protectedCode),owner=owned?.[1]&&code.slice(0,owned[1].length).replace(/^「(.*)」$/,'$1');
      const removed=owned&&(!owned[1]||owner==='自分'||symbols?.project?.components?.some(c=>c.name===owner))&&removedMoveGuidance(code);if(removed)throw new AkariError('P205',removed.message);}
    for (const form of SENTENCE_FORMS) {
      if(!form.pattern)continue;
      const ending=SENTENCE_ROLE_ENDINGS[form.role];
      if(ending&&!ending.test(protectedCode))continue;
      const parts=surfaceCapture(form.pattern,code,protectedCode);
      if (!parts) continue;
      const unit=path=>form.roleSlots.find(slot=>slot.path===path)?.unit;
      let props=form.op ? {op:form.op} : {};
      switch(form.role) {
        case 'timedSpeech': props.value=e(parts[0]);props.seconds=q(parts[1],'秒');break;
        case 'cloneCount': props.count=e(parts[0]);break;
        case 'cloneTargetCount': props.args=[componentTarget(e(parts[0]),symbols,ctx)];props.count=e(parts[1]);break;
        case 'addValue': props.value=exprNode('BinaryExpression',{op:'ADD',left:e(parts[0]),right:e(parts[1])});break;
        case 'arg': props.args=[['POINT_TO','CREATE_TARGET'].includes(form.op)?componentTarget(e(parts[0]),symbols,ctx):['SAMPLE','SAMPLE_WAIT'].includes(form.op)?solfegeSound(e(parts[0]),symbols,ctx):e(parts[0])]; break;
        case 'args': props.args=parts.map(e); break;
        case 'degree': props.args=[q(parts[0],unit('args.0'))]; break;
        case 'percent': props.args=[q(parts[0],unit('args.0'))]; break;
        case 'tone': props.args=[q(parts[0],unit('args.0')),q(parts[1],unit('args.1'))]; break;
        case 'toneReverse': props.args=[q(parts[1],unit('args.0')),q(parts[0],unit('args.1'))]; break;
        case 'seconds': props.seconds=q(parts[0],unit('seconds')); break;
        case 'concat': {
          const content=parts[0].text,mask=surfaceMask(content),args=[];
          const reverse=surfaceCapture(/^(.+?)を(.+?)に$/d,content),forward=surfaceCapture(/^(.+?)(?:の後ろ)?に(.+)$/d,content);
          if(reverse||forward){const pair=reverse?[reverse[1],reverse[0]]:forward;for(const part of pair)args.push(e({...part,start:parts[0].start+part.start}));}
          else {let at=0;for(let i=0;i<=content.length;i++)if(i===content.length||mask[i]==='と'){args.push(e({text:content.slice(at,i),start:parts[0].start+at}));at=i+1;}}
          if(args.length<2)throw new AkariError('P205','つなげる ものを 2つ いじょう ならべます。れい：「点数は」と点数をつなげて言う');props.value=exprNode('BuiltinCall',{name:'つなぐ',args});break;
        }
        case 'quote': props.value=e(parts[0]); if(props.value.kind!=='StringLiteral') throw new AkariError('P205','言う ことは「「文字」と言う」、へんすうの 中身は「点数を言う」のように 書きます'); break;
        case 'value': {const part=parts[0], raw=part.text.endsWith('の値') && !(part.text === '拡張の値' && EXTENSION_HOST.operations('events').length && !extensionValueIsData(symbols, ctx))?{...part,text:part.text.slice(0,-2)}:part;let error;try{props.value=e(raw);}catch(caught){if(!(caught instanceof AkariError)||caught.listPick)throw caught;error=caught;}
          const resolvedName=props.value?.kind==='VariableRead'?props.value.name:raw.text,
            unknownWord=/^[\p{L}ー][\p{L}\p{N}ー]*$/u.test(raw.text)&&!symbols?.allDataNames?.has(resolvedName)&&![...(ctx.localNames||[]),...(ctx.binders||[]),...(ctx.args||[])].includes(resolvedName);
          if(form.kind==='Say'&&unknownWord&&(error||props.value?.kind==='VariableRead')&&!part.text.endsWith('の値')){
            const name=raw.text;throw sentenceDiagnostic('そのまま 言う 文字か、入れた 音か、へんすう・リストの 中身かを えらんで ください',line,[{label:'そのままの文字を話す',source:`「${name}」と言う`},{label:'同じ名前の音を鳴らす',source:`「${name}」を鳴らす`},{label:'へんすう・リストの 中身を 話す（作った 名前を たしかめる）',source:`【${name}】の値を言う`}],{kind:'Say',missing:['literalOrSoundOrData']});
          }
          if(error)throw error;break;}
        case 'question': props.question=e(parts[0]);break;
        case 'message': props.message=e(parts[0]);break;
        case 'local': props={name:parsedDeclarationName(parts[0].text),initial:e(parts[1])};break;
        case 'localList': props={name:parsedDeclarationName(parts[0].text)};break;
        case 'target': props.target=target(parts[0]);break;
        case 'append': props={target:target(parts[0]),value:e(parts[1])};break;
        case 'appendReverse': props={target:target(parts[1]),value:e(parts[0])};break;
        case 'insert': case 'replace': props={target:target(parts[0]),index:q(parts[1],unit('index')),value:e(parts[2])};break;
        case 'insertReverse': props={target:target(parts[1]),index:q(parts[2],unit('index')),value:e(parts[0])};break;
        case 'delete': props={target:target(parts[0]),index:q(parts[1],unit('index'))};break;
        case 'assignReverse': props={target:target(parts[1]),value:e(parts[0])};break;
        case 'assign': props={target:target(parts[0]),value:e(parts[1])};break;
        case 'update': if(surfaceMask(parts[1].text).endsWith('に'))throw new AkariError('P205','数の あとに「に」を つけて ふやす・へらす とは 書けません。ふやすなら「点数を1ふやす」、その 数に するなら「点数を10にする」と 書きます');props={...props,target:target(parts[0]),value:e(parts[1])};break;
        case 'updateReverse':props={...props,target:target(parts[1]),value:e(parts[0])};break;
      }
      return node(form.kind,props);
    }
    const movement = readSentenceMotion(code,line,symbols,ctx);
    if(movement)return movement;
    if (/まで(?:待つ|まつ)$/.test(protectedCode)) {
      const suffix=code.endsWith('待つ')?'待つ':'まつ';
      const clause=readConditionClause(code.slice(0,-suffix.length),symbols,{...ctx,sourceLine:line});
      if(clause)return node('WaitUntil',{condition:clause.condition});
    }
    return null;
  }
  // The move sentences (LANGUAGE.md 動きの文), each with an optional 〇秒かけて (also 〇秒で) in front:
  //   画面の左下のはしから、右へ100歩、上へ50歩のばしょへ行く — GOTO, both legs (a leg not written is 0歩)
  //   いまのばしょから、右へ10歩、上へ5歩動く — MOVE_BY, one or two legs
  //   前へ10歩進む / 後ろへ10歩動く — MOVE, the facing direction
  //   「ロケット」のところへ行く / マウスのところへ行く — GOTO_PART, centre to centre
  // A leg is one direction word (よこ 右・左, たて 上・下) with its steps; commas between the roles are optional and に
  // reads as へ (B-05). The turns 右に90度回る / 左に90度回る take the same optional time.
  const MOVE_AXIS = Object.freeze({ 右: ['x', 'right'], 左: ['x', 'left'], 上: ['y', 'up'], 下: ['y', 'down'] });
  const MOVE_FROM_FIXED = '画面の左下の(?:はし|端)から', MOVE_FROM_HERE = '(?:いま|今)の(?:ばしょ|場所)から', MOVE_TIME = '秒(?:かけて|で)';
  const MOVE_VERBS = Object.freeze({
    fixed: ['行く', 'いく', '動く', 'うごく'],
    here: ['動く', 'うごく', '進む', 'すすむ', '歩く', 'あるく'],
    forward: ['進む', 'すすむ', '動く', 'うごく', '歩く', 'あるく'],
    backward: ['動く', 'うごく', '進む', 'すすむ', '下がる', 'さがる'],
    part: ['行く', 'いく'],
  });
  const MOVE_EXAMPLE_FIXED = '画面の左下のはしから、右へ100歩、上へ50歩のばしょへ行く', MOVE_EXAMPLE_HERE = 'いまのばしょから、右へ10歩動く';
  // Which legs a fixed place wrote before the unwritten one became 0歩 (the notice of B-17 reads it).
  const MOVE_WRITTEN_LEGS = new WeakMap();
  // One leg: 右へ10歩 / 10歩右へ. A comma inside one leg (10歩、右へ) is not read.
  // mask: the text's surfaceMask, when the caller already has it (a slice of a longer mask cut outside any 「 」 or （ ）).
  function readMoveLeg(text, start, quantity, mask = surfaceMask(text)) {
    let p = surfaceCapture(/^(右|左|上|下)(?:へ|に)(.*)$/d, text, mask), word, amount;
    if (p) { word = p[0].text; amount = p[1]; }
    else if ((p = surfaceCapture(/^([^、]+歩)(右|左|上|下)(?:へ|に)$/d, text, mask))) { word = p[1].text; amount = p[0]; }
    else return null;
    const [axis, dir] = MOVE_AXIS[word], amountMask = mask.slice(amount.start, amount.end);
    if (!amountMask || amountMask.includes('、')) return null;
    if (!amountMask.endsWith('歩')) throw new AkariError('P205', `歩数の あとに「歩」を 書きます。れい：${word}へ10歩`);
    if (amountMask.length === 1) return null;
    return { axis, dir, amount: quantity(amount.text.slice(0, -1), '歩', start + amount.start) };
  }
  // One leg, or two of different axes: 右へ10歩、上へ5歩 (also without the comma, and either order).
  function readMoveLegs(text, start, quantity, example = 'いまのばしょから、右へ10歩、上へ5歩動く') {
    const mask = surfaceMask(text), splits = [], firstComma = mask.indexOf('、'), lastComma = mask.lastIndexOf('、');
    for (let i = 0; i < mask.length; i++) if (mask[i] === '、') splits.push([i, i + 1]);
    for (let i = 1; i < mask.length; i++) if (mask[i - 1] === '歩' && /^(?:右|左|上|下)(?:へ|に)/.test(mask.slice(i))) splits.push([i, i]);
    // Either leg can put its steps before its direction. Keep the original candidates first; add the same
    // source offsets for 歩→steps and direction→steps/direction, without rewriting the child's source.
    for (const match of mask.matchAll(/歩|(?:右|左|上|下)(?:へ|に)/g)) {
      const end = match.index + match[0].length;
      if (end < mask.length) splits.push([end, end]);
    }
    let firstError = null;
    for (const [a, b] of splits) {
      // A leg has no 、 of its own (readMoveLeg reads none), so a side with a 、 is no leg; skipping it keeps a long
      // run of 右へ1歩、… linear.
      if (firstComma >= 0 && firstComma < a) continue;
      let one = null, two = null;
      try { one = readMoveLeg(text.slice(0, a), start, quantity, mask.slice(0, a)); two = one && lastComma < b && readMoveLeg(text.slice(b), start + b, quantity, mask.slice(b)); }
      catch (error) { if (!(error instanceof AkariError)) throw error; firstError ||= error; continue; }
      if (!one || !two) continue;
      if (one.axis === two.axis) throw new AkariError('P205', '「右へ」「左へ」と「上へ」「下へ」を 1つずつ 書きます。れい：' + example);
      return { [one.axis]: one, [two.axis]: two };
    }
    const single = readMoveLeg(text, start, quantity);
    if (!single && firstError) throw firstError;
    return single ? { [single.axis]: single } : null;
  }
  // 画面の左下のはしから、…のばしょへ行く and いまのばしょから、…動く, with the time first, after the から-phrase, or
  // before the verb. null when the sentence has neither から-phrase.
  function readPlaceMotion(body, verb, quantity, build) {
    const P = '(?:へ|に)', time = (part, offset) => quantity(part.text, '秒', offset + part.start);
    let p;
    // 画面の左下のはしへ行く: the corner itself, written with both legs 0歩.
    if ((p = surfaceCapture(new RegExp('^(?:(.+?)' + MOVE_TIME + '、?)?画面の左下の(?:はし|端)' + P + '$', 'd'), body))) {
      if (!MOVE_VERBS.fixed.includes(verb)) throw new AkariError('P205', '決めた ばしょへは「行く」と 書きます。れい：' + MOVE_EXAMPLE_FIXED);
      return build('GOTO', {}, p[0] ? time(p[0], 0) : null, true);
    }
    let seconds = null, rest = body, restStart = 0;
    if ((p = surfaceCapture(new RegExp('^、?(.+?)' + MOVE_TIME + '、?((?:' + MOVE_FROM_FIXED + '|' + MOVE_FROM_HERE + ').*)$', 'd'), body))) {
      seconds = time(p[0], 0); rest = p[1].text; restStart = p[1].start;
    }
    const from = surfaceCapture(new RegExp('^、?(' + MOVE_FROM_FIXED + '|' + MOVE_FROM_HERE + ')、?(.*)$', 'd'), rest);
    if (!from) return null;
    const fixed = /^画面/.test(from[0].text);
    let legs = from[1].text, legsStart = restStart + from[1].start;
    if (!seconds && (p = surfaceCapture(new RegExp('^(.+?)' + MOVE_TIME + '、?(.+)$', 'd'), legs)) && /^(?:右|左|上|下)/.test(surfaceMask(p[1].text))) {
      seconds = time(p[0], legsStart); legsStart += p[1].start; legs = p[1].text;
    }
    if (fixed) {
      // …のばしょへ行く, or …のばしょへ2秒かけて行く.
      if (!seconds && (p = surfaceCapture(new RegExp('^(.+)の(?:ばしょ|場所)' + P + '、?(.+?)' + MOVE_TIME + '$', 'd'), legs))) { seconds = time(p[1], legsStart); legs = p[0].text; }
      else {
        const end = surfaceCapture(new RegExp('^(.+)の(?:ばしょ|場所)' + P + '$', 'd'), legs);
        if (!end) throw new AkariError('P205', (/位置/.test(surfaceMask(legs)) ? '「位置」は 読みません。「ばしょ」と 書きます。' : '行き先は「〜のばしょへ行く」と 書きます。') + 'れい：' + MOVE_EXAMPLE_FIXED);
        legs = end[0].text;
      }
      if (!MOVE_VERBS.fixed.includes(verb)) throw new AkariError('P205', '決めた ばしょへは「行く」と 書きます。れい：' + MOVE_EXAMPLE_FIXED);
    } else {
      if (!seconds && (p = surfaceCapture(new RegExp('^(.+歩)、?(.+?)' + MOVE_TIME + '$', 'd'), legs))) { seconds = time(p[1], legsStart); legs = p[0].text; }
      if (!MOVE_VERBS.here.includes(verb)) throw new AkariError('P205', 'いまの ばしょから 動く ときは「動く」と 書きます。れい：' + MOVE_EXAMPLE_HERE);
    }
    const read = readMoveLegs(legs, legsStart, quantity, fixed ? MOVE_EXAMPLE_FIXED : undefined);
    // ゆっくり among the legs is a time to take; three legs or more write one axis twice (R2-B-10).
    const legsMask = surfaceMask(legs);
    if (!read && /ゆっくり/.test(legsMask)) throw new AkariError('P205', 'ゆっくり 動く ときは「1秒かけて、」のように かける 時間を 文の はじめに 書きます。れい：1秒かけて、' + (fixed ? MOVE_EXAMPLE_FIXED : MOVE_EXAMPLE_HERE));
    if (!read && (legsMask.match(/(?:右|左|上|下)(?:へ|に)/g) || []).length > 2) throw new AkariError('P205', '「右へ」「左へ」と「上へ」「下へ」を 1つずつ 書きます。れい：' + (fixed ? MOVE_EXAMPLE_FIXED : MOVE_EXAMPLE_HERE));
    if (!read) throw new AkariError('P205', fixed
      ? '「右へ100歩、上へ50歩」のように、向きと 歩数を 書きます。れい：' + MOVE_EXAMPLE_FIXED
      : '「右へ10歩」のように、向きと 歩数を 書きます。れい：' + MOVE_EXAMPLE_HERE);
    return build(fixed ? 'GOTO' : 'MOVE_BY', read, seconds, false);
  }
  function readSentenceMotion(code,line,symbols,ctx) {
    const mask=surfaceMask(code), suffix=/(?:動く|うごく|進む|すすむ|歩く|あるく|動かす|うごかす|行く|いく|下がる|さがる|滑る|すべる|回る|まわる|向く|むく)$/.exec(mask);
    if(!suffix)return null;
    const written=suffix[0], verb=['動かす','うごかす'].includes(written)?'動く':written, body=code.slice(0,-written.length);
    const actorRef=()=>({...(ctx.topicActor||{kind:'self'})});
    const node=(op,args,direction)=>statementNode('MotionCommand',line,{op,args,...(direction?{direction}:{}),actorRef:actorRef()});
    const e=(text,start)=>parseMappedExpression(text,code,line,symbols,ctx,start);
    const q=(text,unit,start)=>{if(surfaceMask(text).endsWith(unit))throw new AkariError('P205','「歩」や「秒」などは 1回だけ 書きます。れい：前へ10歩進む');return sentenceQuantity(e(text,start),unit);};
    const timeOf=(part,offset=0)=>q(part.text,'秒',offset+part.start);
    let p;
    if(['回る','まわる'].includes(verb)) {
      // 1秒かけて、右に90度回る (a turn without a time is the sentence form 右に90度回る).
      let rest=body,start=0,seconds=null;
      if((p=surfaceCapture(new RegExp('^(.+?)'+MOVE_TIME+'、?(.+)$','d'),body))&&/^(?:右|左|.+度(?:右|左))/.test(surfaceMask(p[1].text))){seconds=timeOf(p[0]);rest=p[1].text;start=p[1].start;}
      const turn=surfaceCapture(/^(右|左)(?:に|へ)(.+)度$/d,rest),degreeFirst=!turn&&surfaceCapture(/^(.+)度(右|左)(?:に|へ)$/d,rest);
      if(!turn&&!degreeFirst)return null;
      const [word,angle]=turn?[turn[0],turn[1]]:[degreeFirst[1],degreeFirst[0]];
      const made=node(word.text==='右'?'TURN_RIGHT':'TURN_LEFT',[q(angle.text,'度',start+angle.start)]);
      if(seconds)made.seconds=seconds;
      return made;
    }
    if(['向く','むく'].includes(verb)) {
      if((p=surfaceCapture(/^(?:画面の)?(右|左|上|下)を$/d,body)))return node('SET_DIRECTION',[sentenceQuantity(exprNode('NumberLiteral',{value:{右:0,上:90,左:180,下:270}[p[0].text]}),'度')]);
      return null;
    }
    // 決めたばしょへ行く / いまのばしょから動く: the legs and the time are their own inputs (no args).
    const place=readPlaceMotion(body,verb,q,(op,legs,seconds,originOnly)=>{
      const made=statementNode('MotionCommand',line,{op,xDir:legs.x?.dir||'right',yDir:legs.y?.dir||'up',actorRef:actorRef()});delete made.args;
      // A fixed place always has both legs: the one not written is 0歩 (and the notice says so).
      if(op==='GOTO'){MOVE_WRITTEN_LEGS.set(made,{x:!!legs.x,y:!!legs.y,originOnly});for(const key of ['x','y'])if(!legs[key])legs[key]={amount:sentenceQuantity(exprNode('NumberLiteral',{value:0}),'歩')};}
      for(const key of ['x','y'])if(legs[key])made[key]=legs[key].amount;
      if(seconds)made.seconds=seconds;
      return made;
    });
    if(place)return place;
    // 「ロケット」のところへ行く / マウスのところへ行く (the mouse needs no 「 」), with the time first.
    // The ところ forms are tried only when ところ is written (on a long line without it these patterns are slow).
    const partPlace=/のところ(?:へ|に)/.test(mask);
    if(partPlace&&MOVE_VERBS.part.includes(verb)&&(p=surfaceCapture(new RegExp('^、?(?:(.+?)'+MOVE_TIME+'、?)?(.+?)のところ(?:へ|に)$','d'),body))){
      const text=p[1].text,mouse=['マウス','「マウス」'].includes(text),screen=screenPlaceSource(surfaceMask(text),symbols);
      if(screen)throw new AkariError('P205',screen.message);
      const target=mouse?exprNode('StringLiteral',{value:'マウス'}):partNameTarget(componentTarget(e(text,p[1].start),symbols,ctx),symbols,ctx);
      if(mouse){const range=sourceRange(line.mapped?.positions||[],p[1].start,p[1].end);if(range)SOURCE_RANGES.set(target,{range});}
      const made=node('GOTO_PART',[target]);
      if(p[0])made.seconds=timeOf(p[0]);
      return made;
    }
    // The facing direction: 前へ10歩進む / 10歩進む / まっすぐ10歩進む / 100歩まっすぐ進む / 後ろへ10歩動く, with the time
    // first or before the verb (前へ10歩、1秒かけて進む).
    {
      let rest=body,start=0,seconds=null;
      if((p=surfaceCapture(new RegExp('^(.+?)'+MOVE_TIME+'、?(.+)$','d'),rest))&&/^(?:前|後ろ|まっすぐ|[^、]+歩)/.test(surfaceMask(p[1].text))){seconds=timeOf(p[0]);rest=p[1].text;start=p[1].start;}
      if(!seconds&&(p=surfaceCapture(new RegExp('^(.+歩(?:(?:前|後ろ)(?:へ|に)|まっすぐ(?:に)?)?)、?(.+?)'+MOVE_TIME+'$','d'),rest))){seconds=timeOf(p[1]);rest=p[0].text;}
      let back=null,amount=null;
      if((p=surfaceCapture(/^(前|後ろ)(?:へ|に)(.+)歩$/d,rest))){back=p[0].text==='後ろ';amount=p[1];}
      else if((p=surfaceCapture(/^まっすぐ(?:に)?、?(.+)歩$/d,rest))){back=false;amount=p[0];}
      else if((p=surfaceCapture(/^([^、]+)歩(前|後ろ)(?:へ|に)$/d,rest))){back=p[1].text==='後ろ';amount=p[0];}
      else if((p=surfaceCapture(/^([^、]+)歩まっすぐ(?:に)?$/d,rest))){back=false;amount=p[0];}
      else if(!/(?:右|左|上|下)(?:へ|に)|まっすぐ/.test(surfaceMask(rest))&&(p=surfaceCapture(/^([^、]+)歩$/d,rest))){back=false;amount=p[0];}
      if(amount&&surfaceMask(amount.text)){
        if(MOVE_VERBS.part.includes(verb))throw new AkariError('P205','前へ 動く ときは「前へ10歩進む」と 書きます');
        if(!(back?MOVE_VERBS.backward:MOVE_VERBS.forward).includes(verb))return null;
        const made=node('MOVE',[q(amount.text,'歩',start+amount.start)],back?'backward':'forward');
        if(seconds)made.seconds=seconds;
        return made;
      }
    }
    // A removed move form names the one written now (the proposal is made for the whole line by diagnoseSentenceIntent).
    const removed=removedMoveGuidance(code);
    if(removed)throw new AkariError('P205',removed.message);
    // 「いぬ」のところへ動く / 「いぬ」のところへ1秒かけて行く: a part's place is gone to with 行く, the time first.
    if(partPlace&&(p=surfaceCapture(new RegExp('^、?(?:(.+?)'+MOVE_TIME+'、?)?(.+?)のところ(?:へ|に)(?:、?(.+?)'+MOVE_TIME+')?$','d'),body)))
      throw new AkariError('P205',partPlaceGuidance(p[1].text,(p[0]||p[2])?.text,verb,!!p[2],symbols).message);
    // The steps are asked for only when none are written (3回、前へ10歩進む is no move sentence: other readers take it).
    if(/(?:動く|うごく|進む|すすむ|歩く|あるく)/.test(verb)&&!surfaceMask(body).includes('歩'))throw new AkariError('P205','動く ときは 歩数を 書きます。れい：前へ10歩進む／'+MOVE_EXAMPLE_HERE);
    return null;
  }
  // 画面のまん中・画面のどこか are no parts: 〜のところへ行く goes to a part or the mouse, and a place of the screen is
  // written from the bottom-left corner (with the size of the work's screen). null for any other target.
  function screenPlaceSource(mask,symbols) {
    const m=/^画面の(?:(まん中|真ん中|まんなか|中央|中心)|(どこか))$/.exec(mask);if(!m)return null;
    const w=symbols?.project?.stage?.width??640,h=symbols?.project?.stage?.height??400;
    const source=m[1]?`画面の左下のはしから、右へ${w/2}歩、上へ${h/2}歩のばしょへ行く`:`画面の左下のはしから、右へ0歩から${w}歩のどれか、上へ0歩から${h}歩のどれかのばしょへ行く`;
    return {source,place:m[1]?'まん中':'どこか',message:`「〜のところへ行く」の 行き先は、部品か マウスです。画面の ${m[1]?'まん中':'どこか'}へ 行く ときは「${source}」と 書きます`};
  }
  // 〜のところへ動く, 〜のところへ1秒かけて行く and 画面のまん中のところへ行く name the readable sentence (source: the
  // sentence without its subject, the time first).
  function partPlaceGuidance(target,time,verb,timeAfter,symbols) {
    const screen=screenPlaceSource(surfaceMask(target),symbols),seconds=time?time+'秒かけて、':'';
    if(screen)return {message:screen.message,source:seconds+screen.source,label:'決めた ばしょへ 行く'};
    const source=seconds+target+'のところへ行く';
    return MOVE_VERBS.part.includes(verb)&&timeAfter
      ? {message:'「〇秒かけて、」は 文の はじめに 書きます。れい：'+source,source,label:'時間を はじめに 書く'}
      : {message:'部品の ところへは「行く」と 書きます。れい：'+source,source,label:'「行く」と 書く'};
  }
  // The removed move forms that are not read (LANGUAGE.md 読めない書き方): each names the form written now. A move along
  // the screen's directions means the same from いまのばしょ, so it gets a proposal; a place counted the old way (from the
  // top-left corner) would land somewhere else, so it gets the message only. null for any other sentence.
  const MOVE_OLD_VERB = '(?:動く|うごく|進む|すすむ|歩く|あるく|動かす|うごかす|行く|いく)';
  // ねこは、いまのばしょから、…: the subject before いまのばしょから takes 、 as the formatter writes it (B-06).
  const movingSubject = subject => subject ? subject.replace(/、?$/, '、') : '';
  function removedMoveGuidance(code) {
    const mask = surfaceMask(code);
    // The subject (ねこは / ねこが, and ねこを before 動かす) is kept; を becomes は.
    const subjectAt = (pattern) => { const m = pattern.exec(mask); return m ? m[1].length : 0; };
    let at = subjectAt(/^((?:[^、。]+?[はが]、?)?)/), rest = code.slice(at), rmask = mask.slice(at);
    const subject = code.slice(0, at);
    let p;
    // よこのばしょを100にする / たてのばしょを10減らす (also 横・縦 and の場所, and 横位置・縦位置). ねこのよこのばしょを…
    // names who moves (自分の…: the body's own part); the example then names that part, as a 名人 text needs.
    if ((p = /^(?:([^、。]+?)の)?(よこ|たて|横|縦)(?:のばしょ|の場所|位置)を(.+?)(?:歩)?(?:だけ)?(増やす|ふやす|減らす|へらす|にする|にかえる|に変える)$/.exec(rmask))) {
      const owner = p[1] ? rest.slice(0, p[1].length).replace(/^「(.*)」$/, '$1') : null, who = owner && owner !== '自分' ? owner + 'は' : subject;
      const named = owner && owner !== '自分' ? owner : /^(.+?)[はが]、?$/.exec(subject)?.[1].replace(/^「(.*)」$/, '$1'), of = named ? `「${named}」の` : '';
      const horizontal = ['よこ', '横'].includes(p[2]), amount = rest.slice(rmask.indexOf('を', p[1] ? p[1].length : 0) + 1, rest.length - p[4].length).replace(/歩?(?:だけ)?$/, '').replace(/^[、\s]+/, '');
      if (/(?:増やす|ふやす|減らす|へらす)$/.test(p[4])) {
        const up = /^(?:増|ふ)/.test(p[4]), word = horizontal ? (up ? '右' : '左') : (up ? '上' : '下');
        const source = `${movingSubject(who)}いまのばしょから、${word}へ${amount}歩動く`;
        return { message: `ばしょを ふやす・へらす ときは「${source}」のように 書きます`, source, label: '「いまのばしょから」 動く' };
      }
      // The value written is the step count of its direction (LANGUAGE.md: 書いた数を書いた向きに入れ): a number as it is,
      // anything else in （ ）, as the formatter then writes it (右へ【点数】歩, 右へ（マウスのよこのばしょ）歩).
      const value = /^[0-9０-９]+$/.test(amount) ? amount : amount ? (/^（.*）$/.test(amount) ? amount : `（${amount}）`) : null;
      const written = who.replace(/、$/, '') + (horizontal ? `画面の左下のはしから、右へ${value || 100}歩、上へ（${of}たてのばしょ）歩のばしょへ行く` : `画面の左下のはしから、右へ（${of}よこのばしょ）歩、上へ${value || 50}歩のばしょへ行く`);
      const example = canonicalStatementSource(written, undefined);
      return { message: `ばしょを 決める ときは「${example}」のように 書きます` };
    }
    // ねこを右へ10歩動かす: the part moved is the subject.
    if (!at && /動かす$|うごかす$/.test(rmask)) { at = subjectAt(/^((?:[^、。]+?を、?)?)/); rest = code.slice(at); rmask = mask.slice(at); }
    const proposalSubject = code.slice(0, at).replace(/を(、?)$/, 'は$1');
    // マウスの位置へ行く / 「星」のばしょへ行く: going to a part or the mouse is 〜のところへ行く (a place with no steps
    // counted is no ばしょ of today's sentences).
    const toPart = /^((?:[^、。]+?秒(?:間)?かけて、?)?)(.+?)の(位置|ばしょ|場所)(?:へ|に)(行く|いく)$/.exec(rmask);
    if (toPart && !/[、歩]/.test(toPart[2]) && !/^画面/.test(toPart[2]) && !/^(?:いま|今)$/.test(toPart[2])) {
      const time = toPart[1] ? rest.slice(0, toPart[1].length).replace(/、?$/, '、') : '';
      const source = `${movingSubject(proposalSubject)}${time}${rest.slice(toPart[1].length, toPart[1].length + toPart[2].length)}のところへ行く`;
      return { message: `キャラクターや 部品、マウスの ところへ 行く ときは、「${source}」と 書きます`, source, label: '「ところへ行く」と 書く' };
    }
    // いまの位置から / 画面の左下の位置から…のばしょへ行く: 位置 is written ばしょ.
    const ichi = () => /位置/.test(mask) && /(?:行く|いく|動く|うごく|進む|すすむ|歩く|あるく|滑る|すべる)$/.test(mask)
      ? { message: '「位置」は 読みません。「ばしょ」と 書きます。れい：' + code.replace(/位置/g, 'ばしょ'), source: code.replace(/位置/g, 'ばしょ'), label: '「ばしょ」と 書く' } : null;
    // いまのばしょから… and 画面の左下のはしから… are the sentences of today.
    if (/^(?:(?:いま|今)の|画面の左下)/.test(rmask)) return ichi();
    // 右へ10歩動く / 画面の右へ10歩動く / 10歩右へ動く / 右へ10歩、上へ5歩動く, with the time first or before the verb.
    const LEG = '(?:画面の)?(右|左|上|下)(?:へ|に)([^、]+?)歩', LEG_BACK = '([^、]+?)歩、?(?:画面の)?(右|左|上|下)(?:へ|に)';
    const TIME_FIRST = '((?:[^、。]+?秒(?:かけて|で)、?)?)', TIME_LAST = '((?:、?[^、。]+?秒(?:かけて|で))?)';
    let legs = null, time = '';
    // Every leg form has 歩 and a direction word; without them the patterns below only search a long line.
    const stepsWritten = rmask.includes('歩') && /(?:右|左|上|下)(?:へ|に)/.test(rmask);
    if (stepsWritten && (p = surfaceCapture(new RegExp('^' + TIME_FIRST + LEG + '(?:、?' + LEG + ')?' + TIME_LAST + MOVE_OLD_VERB + '$', 'd'), rest, rmask))) {
      legs = [[p[1].text, p[2].text], ...(p[3] ? [[p[3].text, p[4].text]] : [])];
      time = (p[0].text || (p[5]?.text || '').replace(/^、/, '')).replace(/、$/, '');
    } else if (stepsWritten && (p = surfaceCapture(new RegExp('^' + TIME_FIRST + LEG_BACK + TIME_LAST + MOVE_OLD_VERB + '$', 'd'), rest, rmask))) {
      legs = [[p[2].text, p[1].text]];
      time = (p[0].text || (p[3]?.text || '').replace(/^、/, '')).replace(/、$/, '');
    } else if (stepsWritten && (p = surfaceCapture(new RegExp('^([^、]+?)歩、?([^、。]+?秒(?:かけて|で))、?(?:画面の)?(右|左|上|下)(?:へ|に)' + MOVE_OLD_VERB + '$', 'd'), rest, rmask))) {
      // 10歩、2秒かけて画面の右へ動く: the time between the steps and the direction.
      legs = [[p[2].text, p[0].text]];
      time = p[1].text;
    }
    if (legs) {
      const head = `${movingSubject(proposalSubject)}${time ? time + '、' : ''}いまのばしょから、`;
      // 右へ左へ20歩 / 右へ20歩左へ: two directions in one leg say no single move, so the example is the general one,
      // never the child's directions copied into a sentence that does not read (final call 12).
      const ONE_EACH = '画面の 向きへ 動く ときは、「いまのばしょから、」を 書いて、「右へ」「左へ」と「上へ」「下へ」を 1つずつ 書きます。れい：';
      if (legs.some(([, amount]) => /(?:右|左|上|下)(?:へ|に)/.test(surfaceMask(amount)))) return { message: ONE_EACH + MOVE_EXAMPLE_HERE };
      // 右へ10歩、左へ5歩: one leg on each axis. Two numbers on one axis are written as the one leg they add up to.
      const sign = { 右: 1, 上: 1, 左: -1, 下: -1 }, axis = word => ['右', '左'].includes(word) ? 'x' : 'y';
      if (legs.length === 2 && axis(legs[0][0]) === axis(legs[1][0])) {
        const steps = legs.map(([word, amount]) => /^[0-9]+$/.test(amount) ? sign[word] * Number(amount) : NaN), net = steps[0] + steps[1];
        const word = axis(legs[0][0]) === 'x' ? (net < 0 ? '左' : '右') : (net < 0 ? '下' : '上'), source = Number.isFinite(net) ? `${head}${word}へ${Math.abs(net)}歩動く` : null;
        return { message: '画面の 向きへ 動く ときは、「いまのばしょから、」を 書いて、「右へ」「左へ」と「上へ」「下へ」を 1つずつ 書きます。れい：' + (source || 'いまのばしょから、右へ10歩、上へ5歩動く'), ...(source ? { source, label: '「いまのばしょから」 動く' } : {}) };
      }
      const source = `${head}${legs.map(([word, amount]) => word + 'へ' + amount + '歩').join('、')}動く`;
      return { message: '画面の 向きへ 動く ときは、「いまのばしょから、」を 書きます。れい：' + source, source, label: '「いまのばしょから」 動く' };
    }
    // よこ100歩、たて50歩のばしょへ行く / 横100、縦50の位置へ行く / 1秒で横200、縦100の位置へ滑る: the old numbers
    // count from the top-left corner, so the place is written again from the bottom-left corner.
    if (/(?:よこ|たて|横|縦)[^、]+、(?:よこ|たて|横|縦)[^、]+?の(?:ばしょ|場所|位置)(?:へ|に)/.test(rmask) && /(?:行く|いく|動く|うごく|滑る|すべる)$/.test(rmask))
      return { message: '決めた ばしょへ 行くときは、画面の 左下の はしから 数えて「' + MOVE_EXAMPLE_FIXED + '」のように 書きます。ばしょは 部品の まん中で 数えます' };
    if (ichi()) return ichi();
    // 1秒で前へ10歩すべる: the time is written 〇秒かけて. すべる with no time is a move that takes time, so the rewrite
    // takes 1秒, after the subject, as the message says (R2-B-11).
    if (/(?:滑る|すべる)$/.test(mask)) {
      const moved = code.replace(/(?:滑る|すべる)$/, '動く'), subject = /^[^、。\u0001]+?は、?/.exec(mask)?.[0] || '';
      const source = /秒(?:間)?(?:かけて|で)/.test(mask) ? moved : moved.slice(0, subject.length) + '1秒かけて、' + moved.slice(subject.length);
      return { message: '時間を かけて 動く ときは「1秒かけて、前へ10歩進む」のように「〇秒かけて、」を 書きます', source, label: '「' + /(?:滑る|すべる)$/.exec(mask)[0] + '」を 書きかえる' };
    }
    return null;
  }
  // 1秒から3秒のどれか (the unit on both ends, B-12) reads as 1から3のどれか秒. Every character keeps its place in the
  // source, so a block edit of A or B still changes only that number.
  const UNIT_RANGE_OPERAND = '[－\\-＋+]?[0-9０-９]+(?:[.．][0-9０-９]+)?|\u0001+';
  const UNIT_RANGE = new RegExp('(?<![0-9０-９.．\u0001－\\-＋+])(' + UNIT_RANGE_OPERAND + ')(歩|秒|度|回|％|番目|Hz|点|個)から(' + UNIT_RANGE_OPERAND + ')\\2(の?どれか)', 'gu');
  function unitRangeLine(line) {
    const code = line.code, mask = surfaceMask(code);
    if (!/(?:歩|秒|度|回|％|番目|Hz|点|個)から/.test(mask)) return line;
    const order = Array.from({ length: code.length }, (_, i) => i);
    let changed = false;
    for (const m of [...mask.matchAll(UNIT_RANGE)].reverse()) {
      const a = m.index, unit = m[2].length, b = a + m[1].length + unit + 2, d = b + m[3].length + unit, end = d + m[4].length;
      const span = (from, to) => order.slice(from, to);
      // A から B のどれか unit: the first unit moves after どれか, the second is left out.
      order.splice(a, end - a, ...span(a, a + m[1].length), ...span(a + m[1].length + unit, b), ...span(b, b + m[3].length), ...span(d, end), ...span(a + m[1].length, a + m[1].length + unit));
      changed = true;
    }
    if (!changed) return line;
    const text = order.map(i => code[i]).join(''), positions = line.mapped?.positions ? order.map(i => line.mapped.positions[i]) : [];
    return { ...line, code: text, mapped: { text, positions } };
  }
  // ふれたとき's partner as written: a part (in 「 」, 【 】 or bare), 画面のはし (端), or one side of it (端:下 …). A
  // bare word that is no part reads as a part's name too (the check names it), unless it is no name at all (null).
  // What can never be touched by the event says so: マウス, a colour, a corner, a bare はし or 端.
  const TOUCH_MOUSE_MESSAGE='「ふれたとき」の 相手は、部品か 画面のはしです。マウスの やじるしが 重なったかは、「もし「マウス」にふれていれば、」で しらべます';
  // A corner (画面の右上のはし) is touched as one of its two sides; 画面の左下のはし is the corner a place is measured from.
  function touchCornerMessage(corner){
    const [, across, upDown]=/^(左|右)(上|下)$/.exec(corner);
    return `「画面の${corner}のはし」は、${corner==='左下'?'ばしょを 決める ときの もとに する':'画面の'} 角です。ふれるのは「画面のはし」か、「画面の${upDown}のはし」「画面の${across}のはし」のような 一つの はしです`;
  }
  function touchTarget(text,symbols){
    const t=text.trim(),parts=symbols?.project?.components||[];
    if(/^画面の(?:はし|端)$/.test(t))return '端';
    const side=/^画面の(上|下|右|左)の(?:はし|端)$/.exec(t);if(side)return '端:'+side[1];
    {const corner=/^画面の(左下|右下|左上|右上)の(?:はし|端)$/.exec(t);if(corner)throw new AkariError('P205',touchCornerMessage(corner[1]));}
    const quoted=/^「([^「」]+)」$/.exec(t)||/^【([^【】]+)】$/.exec(t),name=quoted?quoted[1]:t;
    if(name==='マウス')throw new AkariError('P205',TOUCH_MOUSE_MESSAGE);
    if(/^「[^「」]+」の色$/.test(t)||(!parts.some(c=>c.name===name)&&/(?:の色|色)$/.test(name)))
      throw new AkariError('P205','「ふれたとき」の 相手は、部品か 画面のはしです。色に ふれたかは、「もし「赤」の色にふれていれば、」で しらべます');
    if(quoted||parts.some(c=>c.name===name))return name;
    if((name==='はし'||name==='端'))throw new AkariError('P205','画面の はしの ことなら、「画面のはし」と 書きます。れい：「画面のはしにふれたとき、」');
    // A bare name that is no part: the check says it is not found (as for 「 」). Words that are no name are not read.
    try{validateName(name);}catch(error){if(error instanceof AkariError)return null;throw error;}
    return /[、。（）［］「」【】]/.test(name)?null:name;
  }
  // The words before にふれ… : [the part that touches (written with が), what it touches]. The toucher is 自分, a name in
  // 【 】 or a part; another word before が is the toucher too when what follows is a part or an edge (the check names a
  // toucher that is not found). Otherwise the whole is what is touched.
  function touchPhrase(head,symbols){
    const mask=surfaceMask(head.text),parts=symbols?.project?.components||[];
    for(let i=mask.indexOf('が',1);i>0;i=mask.indexOf('が',i+1)){
      const who=head.text.slice(0,i),rest=head.text.slice(i+1),bare=who.replace(/^【(.*)】$/,'$1');
      const sure=/^(?:「[^「」]+」|【[^【】]+】|画面の.+)$/.test(rest)||parts.some(c=>c.name===rest);
      if(!sure||/[、。「」]/.test(who))continue;
      if(who==='自分'||/^【[^【】]+】$/.test(who)||parts.some(c=>c.name===bare)||(()=>{try{validateName(bare);return true;}catch(error){if(error instanceof AkariError)return false;throw error;}})()){
        const target=touchTarget(rest,symbols);
        if(target!==null)return {actor:{text:who,start:head.start,end:head.start+i},target,targetPart:{start:head.start+i+1,end:head.end}};
      }
    }
    // ねこは星にふれたとき: inside 〜とき the part is written with が.
    for(let i=mask.indexOf('は',1);i>0;i=mask.indexOf('は',i+1)){const who=head.text.slice(0,i);
      if((who==='自分'||parts.some(c=>c.name===who))&&touchTarget(head.text.slice(i+1),symbols)!==null)
        throw new AkariError('P205',`「〜とき」の 中では、だれの ことかを「${who}が」と 書きます。れい：「${who}が${touchShown(touchTarget(head.text.slice(i+1),symbols))}にふれたとき、」`);}
    const target=touchTarget(head.text,symbols);
    return target===null?null:{actor:null,target,targetPart:{start:head.start,end:head.end}};
  }
  // The names of the work (parts, data, procedures' inputs): a word inside one of them is no word of あかり there.
  function knownWords(symbols,ctx={}){
    return [...(symbols?.project?.components||[]).map(c=>c.name),...(symbols?.projectVars?.keys?.()||[]),...(symbols?.projectLists?.keys?.()||[]),
      ...[...(symbols?.individualByTargetId?.values?.()||[])].flatMap(d=>[...(d.variables?.keys?.()||[]),...(d.lists?.keys?.()||[])]),...(ctx.localNames||[]),...(ctx.args||[])];
  }
  // How a touch target is written back: 画面のはし, 画面の下のはし, or the part's name in 「 」.
  function touchShown(target){return isEdgeTarget(target)?EDGE_TARGETS[target]:formatExpression(exprNode('StringLiteral',{value:target}));}
  // 「星」にふれたとき、/ ねこが「星」にふれたとき、/ 「星」にふれたとき、ねこは、 / 星にふれるたびに、 / 画面のはしにふれたとき、:
  // the body's owner (or the part named as the subject or topic, whose body it then is) touches the target. The body may
  // go on in the same line. 〜にふれたら is no heading (it could mean three things; diagnoseSentenceIntent says which).
  function readTouchHeading(code,mask,symbols){
    if(/^もし/.test(mask))return null;
    const gone=surfaceCapture(/^(.+?)に(?:ふれ|触れ)なくなった(?:とき|ら)、?(.*)$/d,code,mask);
    if(gone){let phrase=null;try{phrase=touchPhrase(gone[0],symbols);}catch(error){if(!(error instanceof AkariError))throw error;}
      if(phrase)throw new AkariError('P205',touchGoneMessage(phrase,symbols));}
    const p=surfaceCapture(/^(.+?)に(?:(?:ふれ|触れ)たとき|(?:ふれ|触れ)るたびに)、?(.*)$/d,code,mask);
    if(!p||/[、。]/.test(surfaceMask(p[0].text)))return null;
    const phrase=touchPhrase(p[0],symbols);
    if(!phrase)return null;
    let actor=phrase.actor,body=p[1];
    const actorRef=text=>text==='自分'?{kind:'self'}:sentenceActor(text.replace(/^【(.*)】$/,'$1'),symbols);
    // The topic line (「星」にふれたとき、ねこは、) names the owner as 作品を動かしたとき、ねこは、 does. With a subject written
    // as well, the same name is the same heading; another name is left in the body (a 名人 form, which the check names).
    const bm=surfaceMask(body.text),topic=/^(\u0001+|[^、。\u0001]+?)は(?:、(.*))?$/d.exec(bm);
    if(topic&&(topic[2]!==undefined||topic[1].length===bm.length-1)){
      const who=body.text.slice(0,topic[1].length),bare=who.replace(/^【(.*)】$/,'$1');
      if(who==='自分'||/^【[^【】]+】$/.test(who)||(symbols?.project?.components||[]).some(c=>c.name===bare)){
        const same=!actor||actor.text.replace(/^【(.*)】$/,'$1')===bare;
        if(same){
          if(!actor)actor={text:who,start:body.start,end:body.start+who.length};
          const at=topic[2]===undefined?body.end:body.start+topic.indices[2][0];
          body={text:body.text.slice(at-body.start),start:at,end:body.end};
        }
      }
    }
    const ref=actor?actorRef(actor.text):{kind:'self'};
    return {heading:{event:'touchStart',actorRef:ref.kind==='self'?{kind:'self'}:ref,filter:{target:phrase.target}},body,
      actor:actor&&actor.text!=='自分'?actor:undefined,target:isEdgeTarget(phrase.target)?undefined:phrase.targetPart};
  }
  // ド・レ・ミ … are pitches: the tone sentence takes the height in Hz (the C major scale from middle ド).
  const SOLFEGE_HZ=Object.freeze({ド:262,レ:294,ミ:330,ファ:349,ソ:392,ラ:440,シ:494});
  // ドを鳴らす (from ドの音を鳴らす): a bare ド・レ・ミ … is the name of a sound, as 「ド」. A sound sentence's name always means
  // a sound: data named ド is never used there (final call 29; the check stops when the work has no such sound, and I132
  // says that the name is the sound's).
  function solfegeSound(node,symbols,ctx={}){
    if(node?.kind!=='VariableRead'||node.qualifier||!Object.hasOwn(SOLFEGE_HZ,node.name))return node;
    const literal=exprNode('StringLiteral',{value:node.name}),location=SOURCE_RANGES.get(node);
    if(location)SOURCE_RANGES.set(literal,location);
    return literal;
  }
  const solfegeMessage=note=>`「${note}」は 音の 高さの 名前です。${note}の 音を 出す ときは「${SOLFEGE_HZ[note]}Hzの音を0.5秒鳴らす」のように、高さ（Hz）と 時間を 書きます`;
  // A ドレミ name with no such sound in the work (final call 29, P10/P20): the check stops with the Hz guidance. When the
  // work has data of that name, the message says that the sound sentence does not use it.
  const solfegeMissingMessage=(note,dataKind=null)=>`この 作品には「${note}」という 音が ありません。ドレミの 高さで 鳴らす ときは「${SOLFEGE_HZ[note]}Hzの音を0.5秒鳴らす」のように Hzで 書きます（ド 262、レ 294、ミ 330、ファ 349、ソ 392、ラ 440、シ 494）`
    +(dataKind?`。音の 文の「${note}」は 音の 名前で、${dataKind==='list'?'リスト':'へんすう'}の「${note}」では ありません`:'');
  // ちがったら、/ まちがえたら、/ そうじゃなかったら、: the other branch of もし is そうでなければ、. Looked for in a line of
  // its own (diagnoseSentenceIntent) and right after a もし block, where the line is first read as that もし's other
  // branch (readBlockHead), before 〜たら's three meanings.
  function otherwiseGuidance(code,mask,line){
    const otherwise=surfaceCapture(/^(?:もし、?)?(?:ちがったら|ちがうなら|ちがえば|まちがえたら|まちがったら|まちがいなら|そうじゃなかったら|そうじゃないなら|そうじゃなければ|そうでないなら|そうでないとき(?:は)?|ちがう(?:とき|時)(?:は)?)、?(.*)$/d,code,mask);
    return otherwise?sentenceDiagnostic('「もし」の 文に あてはまらない ときに する ことは、「そうでなければ、」と 書きます',line,[{label:'「そうでなければ、」と 書く',source:'そうでなければ、'+otherwise[0].text}],{kind:'IfStatement'}):null;
  }
  // 「〜にふれなくなったとき」: leaving is waited for inside the touch body. The heading names who touches as it was written;
  // a 名人 text names it in the wait too (its sentences have their subject), with a part of the work as the example
  // when none was written.
  let bareNameLooking=false,unreadLooking=false,chainLooking=false;
  function touchGoneMessage(phrase,symbols,meijin=false){
    const shown=touchShown(phrase.target),who=phrase.actor?.text||(meijin?(symbols?.project?.components||[]).find(c=>c.name!==phrase.target)?.name||'ねこ':null);
    const heading=(who?who+'が':'')+shown+'にふれたとき、',wait=(meijin?who+'が':'')+shown+'にふれなくなるまで待つ。';
    return `「〜にふれなくなったとき」は ありません。はなれるのを 待つ ときは、「${heading}」の 中に「${wait}」と 書いて、そのあとに する ことを 書きます${meijin&&!phrase.actor?'（名人の 本文では、だれが ふれるかを はじめに 書きます）':''}`;
  }
  function readSentenceHeading(code,symbols,previousHeading=null,ctx={}) {
    const protectedCode = surfaceMask(code);
    if(ctx.meijin){const found=readMeijinHeading(code,protectedCode,symbols,ctx);if(found)return found;}
    else{const touch=readTouchHeading(code,protectedCode,symbols);if(touch)return touch;}
    const same = surfaceCapture(/^(.+?)も同じ合図で動き始め、(.*)$/d,code,protectedCode);
    if(same){
      if(!previousHeading)throw new AkariError('P205','「同じ合図」の 前に、「作品を動かしたとき、」や「…がおされたとき、」などの きっかけを 書いて ください');
      return {heading:{...previousHeading,actorRef:sentenceActor(same[0].text,symbols)},body:same[1],actor:same[0]};
    }
    const forms=[
      [/^始め(?:ると|たら)、(.+?)は、(.*)$/d,'start',0,1],
      [/^(?:作品を動かした(?:とき|ら)|作品を動かすと|始まったとき|開始したとき|「動かす」を(?:押|お)した(?:とき|ら))、(.+?)は、(.*)$/d,'start',0,1],
      // Key headings come first: 「…キーがおされたとき」 must not read as a click on 「…キー」.
      [/^キー(?:が(?:押|お)された(?:とき|ら)|が(?:押|お)されると|を(?:押|お)した(?:とき|ら)|を(?:押|お)すと)、(.+?)は、(.*)$/d,'keyDown',0,1],
      [/^(.+?)キー(?:を(?:押|お)すたびに|を(?:押|お)した(?:とき|ら)|を(?:押|お)すと|が(?:押|お)された(?:とき|ら)|が(?:押|お)されると)、(.+?)は、(.*)$/d,'keyDown',1,2,0],
      [/^(?!もし)(.+?)(?:がおされた(?:とき|ら)|がおされると|がおされるたびに|をおした(?:とき|ら)|をおすたびに|がクリックされた(?:とき|ら)|がクリックされると|がクリックされるたびに|をクリックした(?:とき|ら)|をクリックするたびに)、?(.*)$/d,'click',0,1],
      [/^合図を(?:受けた|受け取った|受けとった|うけた|うけとった)(?:とき|ら)、(.+?)は、(.*)$/d,'message',0,1],
      [/^(.+?)(?:という|の)合図を(?:受けた|受け取った|受けとった|うけた|うけとった)(?:とき|ら)、(.+?)は、(.*)$/d,'message',1,2,0],
      [/^知らせを受け取ったとき、(.+?)は、(.*)$/d,'message',0,1],
      [/^(.+?)という知らせを受け取ったとき、(.+?)は、(.*)$/d,'message',1,2,0],
      [/^(?:背景|はいけい)が(?:変わった|かわった)(?:とき|ら)、(.+?)は、(.*)$/d,'backdropChanged',0,1],
      [/^(?!もし)(.+?)の中身が(?:変わった|かわった)(?:とき|ら)、?(.*)$/d,'valueChanged',0,1],
      [/^(?!もし)(.+?)のコピーが(?:作られた|できた)(?:とき|ら)、?(.*)$/d,'cloneStart',0,1],
      // コピーができたとき (the event's own name) is 自分のコピー: the empty actor is 自分.
      [/^()コピーが(?:作られた|できた)(?:とき|ら)、?(.*)$/d,'cloneStart',0,1],
      // おされたとき、 (the event's own name, no part) is 自分's click.
      [/^()(?:(?:押|お)された(?:とき|ら)|(?:押|お)されると|(?:押|お)されるたびに|クリックされた(?:とき|ら)|クリックされると|クリックされるたびに)、?(.*)$/d,'click',0,1],
    ];
    // 「〜は、」 is read first, so a name with は in it (こはる, ねこは星) is never cut. Without the 、 the heading may end at
    // は (the body on the next line), or go on after a part's own name in the same line. A heading with no part is 自分's.
    const STRICT_ACTOR='(.+?)は、(.*)$';
    function looseActor(rest){
      const mask=surfaceMask(rest.text),part=(from,to)=>({text:rest.text.slice(from,to),start:rest.start+from,end:rest.start+to});
      if(mask.endsWith('は')&&mask.length>1)return [part(0,mask.length-1),part(mask.length,mask.length)];
      for(let i=mask.indexOf('は');i>0;i=mask.indexOf('は',i+1)){const name=rest.text.slice(0,i);
        if(name==='自分'||/^【[^【】]+】$/.test(name)||symbols?.project?.components.some(c=>c.name===name))return [part(0,i),part(i+1,mask.length)];}
      return null;
    }
    // The start button is named in 「」, which the protected text hides, so its heading is matched on the code itself.
    // 「動かす」がおされたとき is the start too, unless a part is called 動かす. Without a part it is 自分's.
    const startButton=(symbols?.project?.components?.some(c=>c.name==='動かす')?/^「動かす」を(?:押|お)した(?:とき|ら)、/:/^「動かす」(?:を(?:押|お)した(?:とき|ら)|が(?:押|お)された(?:とき|ら))、/).exec(code);
    if(startButton){
      const shift=startButton[0].length,after=code.slice(shift),rest=surfaceCapture(/^(.+?)は、(.*)$/d,after)||looseActor({text:after,start:0,end:after.length}),move=p=>p&&{...p,start:p.start+shift,end:p.end+shift};
      if(rest)return {heading:{event:'start',actorRef:sentenceActor(rest[0].text,symbols)},body:move(rest[1]),actor:move(rest[0])};
      return {heading:{event:'start',actorRef:{kind:'self'}},body:{text:after,start:shift,end:code.length}};
    }
    for(const pass of ['strict','loose','bare'])for(const [pattern,event,actorIndex,bodyIndex,filterIndex] of forms){let parts=null,self=false;
      if(pass==='strict')parts=surfaceCapture(pattern,code,protectedCode);
      else if(pattern.source.endsWith(STRICT_ACTOR)&&!protectedCode.startsWith('もし')){const head=surfaceCapture(new RegExp(pattern.source.slice(0,-STRICT_ACTOR.length)+'(.*)$','d'),code,protectedCode);
        if(head&&pass==='loose'){const split=looseActor(head.at(-1));if(split)parts=[...head.slice(0,-1),...split];}
        else if(head&&pass==='bare'){parts=[...head.slice(0,-1),null,head.at(-1)];self=true;}
        if(parts&&filterIndex!==undefined&&!/^「.*」$/.test(parts[filterIndex].text)&&!(event==='keyDown'&&keyWord(parts[filterIndex].text)))parts=null;}
      if(!parts)continue;
      // 「空白」キーがおされたとき is a key, never a click on a part called 「空白」キー.
      if(event==='click'&&/キー$/.test(surfaceMask(parts[actorIndex]?.text||'')))continue;
      if(parts[actorIndex]?.text==='')self=true;const heading={event,actorRef:self?{kind:'self'}:sentenceActor(parts[actorIndex].text,symbols)};if(filterIndex!==undefined){const text=parts[filterIndex].text;
        // 右キー／スペースキー (without 「 」) name the key; 「スペース」 is the key Akari calls 空白.
        if(event==='keyDown'&&!text.startsWith('「')&&keyWord(text)){heading.filter={key:keyWord(text)};return {heading,body:parts[bodyIndex],actor:self?undefined:parts[actorIndex]};}
        if(!text.startsWith('「')||!text.endsWith('」'))throw new AkariError('P205','キーや 合図の 名前は「 」で かこんで 書きます。れい：「「スペース」キーをおすたびに、」');const literal=parseExpression(text);if(literal.kind!=='StringLiteral')throw new AkariError('P205','キーや 合図の 名前は、「 」で かこんだ 文字を 1つだけ 書きます。れい：「「スペース」キーをおすたびに、」');heading.filter=event==='keyDown'?{key:keyName(literal.value)}:{message:literal.value};}return {heading,body:parts[bodyIndex],actor:self?undefined:parts[actorIndex]};}
    const implicit = surfaceCapture(/^始めると、(.*)$/d, code, protectedCode);
    if (implicit) return { heading: { event: 'start', actorRef: { kind: 'self' } }, body: implicit[0] };
    return null;
  }
  function sentenceHeadingSource(heading) {
    const actor=sentenceActorSource(heading.actorRef), filter=heading.filter == null || heading.event === 'touchStart' ? null : formatExpression(exprNode('StringLiteral',{value:heading.filter.key!==undefined?keySurface(heading.filter.key):heading.filter.message}));
    // The body's own part is not written in its heading (作品を動かしたとき、/ おされたとき、); a part named in it is.
    // 自分のコピー and 自分の中身 keep 自分の: it says whose copy or contents, not who acts.
    const named=heading.actorRef?.kind==='named',who=named?actor+'は、':'',by=named?actor+'が':'';
    switch(heading.event){case 'start':return `作品を動かしたとき、${who}`;case 'click':return `${by}おされたとき、`;case 'keyDown':return `${filter?filter+'キーをおすたびに':'キーがおされたとき'}、${who}`;case 'message':return `${filter?filter+'という':''}合図を受けたとき、${who}`;case 'backdropChanged':return `はいけいがかわったとき、${who}`;case 'valueChanged':return `${actor}の中身がかわったとき、`;case 'cloneStart':return `${actor}のコピーが作られたとき、`;
      case 'touchStart':return `${heading.actorRef?.kind==='named'?actor+'が':''}${touchShown(heading.filter?.target??'')}にふれたとき、`;case 'interval':return `${formatExpression(heading.seconds)}ごとに、`;case 'conditionTrue':return `条件（${formatExpression(heading.condition)}）が成り立ったとき、`;default:throw new AkariError('P201','きっかけの 書き方が 分かりません。「作品を動かしたとき、」などの きっかけに して ください');}
  }
  function continuousCondition(text) {
    const mask=surfaceMask(text),suffix=/キー(?:を|が)(?:押|お)(?:して|されて)いる$/.exec(mask);
    return suffix?text.slice(0,suffix.index)+'キーがおされている':text;
  }
  function readContinuousSentence(code,line,symbols,ctx) {
    const parts=surfaceCapture(/^(.+?)(?:あいだ|間)(?:は)?、(.+?)(?:動き続ける|動かし続ける|動く|動かす)$/d,code);
    if(!parts)return null;
    const body=parts[1].text, candidates=[];
    const validRoles=roles=>{
      try{parseExpression(roles.seconds,symbols,ctx);parseExpression(roles.distance,symbols,ctx);return roles;}
      catch(error){if(!(error instanceof AkariError)||error.code==='P208')throw error;return null;}
    };
    // 右へ1秒に200歩の速さで (also with いまのばしょから、 in front, which says nothing more: the motion always starts
    // where the part is). 画面の右へ is not read here, as in the move sentences.
    const readRoles=text=>{
      const from=surfaceCapture(/^(?:いま|今)の(?:ばしょ|場所)から、?(.*)$/d,text);if(from)text=from[0].text;
      let roles=surfaceCapture(/^(前|後ろ|右|左|上|下)(?:へ|に)(.+?)秒に(.+?)歩の速さで$/d,text);
      if(roles)return validRoles({direction:roles[0].text,seconds:roles[1].text,distance:roles[2].text});
      roles=surfaceCapture(/^(.+?)秒に(.+?)歩の速さで(前|後ろ|右|左|上|下)(?:へ|に)$/d,text);
      return roles?validRoles({direction:roles[2].text,seconds:roles[0].text,distance:roles[1].text}):null;
    };
    if(/^(?:.*?(?:は|が)、?)?(?:(?:いま|今)の(?:ばしょ|場所)から、?)?(?:画面の(?:右|左|上|下)(?:へ|に).+?秒に.+?歩の速さで|.+?秒に.+?歩の速さで画面の(?:右|左|上|下)(?:へ|に))$/.test(surfaceMask(body))){
      const proposal=code.replace(/画面の(右|左|上|下)(へ|に)/,'$1$2');
      throw sentenceDiagnostic('動き続ける 文には「画面の」を 書きません。れい：「右へ1秒に100歩の速さで動き続ける」',line,[{label:'「画面の」を とる',source:canonicalStatementSource(proposal,symbols)}],{kind:'ContinuousRule'});
    }
    const implicit=readRoles(body);
    if(implicit)candidates.push({...implicit,actorRef:ctx.topicActor||{kind:'self'}});
    // A particle inside an actor name is not a boundary unless all remaining
    // roles form a complete movement. Quoted names are protected by the lexer.
    for(const match of surfaceMask(body).matchAll(/[はを]/g)){
      if(match.index>66)break; // 32 code points, plus the two name delimiters.
      const roles=readRoles(body.slice(match.index+1).replace(/^、/,''));
      if(roles)candidates.push({...roles,actorRef:sentenceActor(body.slice(0,match.index),symbols),actorRange:sourceRange(line.mapped?.positions||[],parts[1].start,parts[1].start+match.index)});
    }
    if(candidates.length!==1)throw sentenceDiagnostic(candidates.length?'だれが 動くのか、速さが どこからなのか 分かりません。動く キャラクターの 名前の あとに「は」を 書いて ください。れい：「「スペース」キーがおされているあいだ、ねこは前へ1秒に10歩の速さで動き続ける」':'ずっと 動きつづける ときは、向きと「〜秒に〜歩の速さで」を 書きます。れい：「「スペース」キーがおされているあいだ、前へ1秒に10歩の速さで動き続ける」',line,[],{kind:'ContinuousRule',actorRef:ctx.topicActor||{kind:'self'},missing:['speed']});
    const {direction,seconds,distance,actorRef,actorRange}=candidates[0];
    const e=t=>parseExpression(t,symbols,{...ctx,lineNo:line.lineNo});
    const node=statementNode('ContinuousRule',line,{actorRef:{...actorRef},condition:parseCondition(continuousCondition(parts[0].text)+'あいだ',symbols,{...ctx,lineNo:line.lineNo},'while'),direction:{前:'forward',後ろ:'backward',右:'right',左:'left',上:'up',下:'down'}[direction],seconds:sentenceQuantity(e(seconds),'秒'),distance:sentenceQuantity(e(distance),'歩')});
    if(actorRange)SOURCE_RANGES.get(node).actorRange=actorRange;return node;
  }
  // Natural spellings a child writes, rewritten to the form the code writes (outside 「」 and 【】). Used only after the
  // sentence as written fails, so a sentence that reads keeps its meaning.
  function naturalSentenceVariants(code, symbols) {
    const out = [];
    const add = text => { if (text && text !== code && !out.includes(text)) out.push(text); };
    // Replace every unprotected occurrence of a fixed word.
    const word = (text, from, to) => {
      // A word that is not in the text is not in its mask either (the mask only hides characters).
      if (!text.includes(from)) return text;
      const mask = surfaceMask(text);
      let result = '', at = 0, i;
      while ((i = mask.indexOf(from, at)) >= 0) { result += text.slice(at, i) + to; at = i + from.length; }
      return result + text.slice(at);
    };
    const whole = (text, pattern, build) => { const parts = surfaceCapture(pattern, text); return parts ? build(parts.map(p => p ? p.text : '')) : text; };
    const normalize = text => {
      text = text.replace(new RegExp('^(?:'+LEAD_WORDS+')、'), '');
      // かな書きの動詞 → the written verb
      for (const [from, to] of [['かくれる', '隠れる'], ['あらわれる', '現れる'], ['ペンをおろす', 'ペンを下ろす'], ['ペンをあげる', 'ペンを上げる'],
        ['ならし始める', '鳴らし始める'], ['ならして', '鳴らして'], ['をならす', 'を鳴らす'], ['をつくる', 'を作る'], ['をおくる', 'を送る'], ['をおくって', 'を送って']])
        text = word(text, from, to);
      // 連用中止（〜し、） → 〜して、
      for (const [from, to] of [['進み、', '進んで、'], ['動き、', '動いて、'], ['回り、', '回って、'], ['待ち、', '待って、'], ['言い、', '言って、'], ['話し、', '話して、'],
        ['鳴らし、', '鳴らして、'], ['かくし、', 'かくして、'], ['見せ、', '見せて、'], ['消し、', '消して、'], ['けし、', 'けして、'], ['入れ、', '入れて、'],
        ['足し、', '足して、'], ['引き、', '引いて、'], ['すべり、', 'すべって、'], ['増やし、', '増やして、'], ['減らし、', '減らして、'], ['止め、', '止めて、'],
        ['作り、', '作って、'], ['送り、', '送って、'], ['下ろし、', '下ろして、'], ['上げ、', '上げて、'], ['向き、', '向いて、'], ['行き、', '行って、'], ['にし、', 'にして、'], ['かえ、', 'かえて、'],
        ['すすみ、', '進んで、'], ['まわり、', '回って、'], ['ふやし、', '増やして、'], ['へらし、', '減らして、'], ['まち、', '待って、'], ['おろし、', '下ろして、'],
        ['ならし、', '鳴らして、'], ['つくり、', '作って、'], ['いい、', '言って、'], ['むき、', '向いて、'], ['いれ、', '入れて、'], ['おくり、', '送って、'],
        ['とめ、', '止めて、'], ['あげ、', '上げて、'], ['うごき、', '動いて、'], ['歩き、', '歩いて、'], ['あるき、', 'あるいて、'],
        ['へいき、', 'へ行って、'], ['にいき、', 'に行って、'], ['下がり、', '下がって、'], ['さがり、', '下がって、']])
        text = word(text, from, to);
      // 〜て with no 、 before the next action
      for (const te of ['鳴らし始めて', '鳴らして', '進んで', 'すすんで', '動いて', 'うごいて', '歩いて', 'あるいて', '回って', 'まわって', '向いて', '待って', '言って', '話して',
        'かくして', '見せて', '消して', 'けして', '入れて', '足して', '引いて', '変えて', 'かえて', 'すべって', '滑って',
        '増やして', '減らして', '止めて', '作って', '送って', '上げて', '下ろして', 'にして', '行って', 'たずねて', 'はね返って', '追加して', '削除して', '挿入して']) {
        if (!text.includes(te)) continue;
        const mask = surfaceMask(text);
        let result = '', at = 0, i;
        while ((i = mask.indexOf(te, at)) >= 0) {
          const end = i + te.length;
          result += text.slice(at, end) + (end < text.length && mask[end] !== '、' ? '、' : '');
          at = end;
        }
        text = result + text.slice(at);
      }
      // "こんにちは" (ASCII or curly quotes) is 「こんにちは」; a closing ！．. is 。
      text = text.replace(/"([^"\n]*)"/g, '「$1」').replace(/“([^”\n]*)”/g, '「$1」');
      if (/[！!？?．.]+$/.test(surfaceMask(text) || '')) text = text.replace(/[！!？?．.]+$/, '');
      // すがたをけす is すがたをかくす
      text = whole(text, /^((?:[^、。]+?は、?)?)(?:すがた|姿)を(?:けす|消す)$/d, ([s]) => s + 'すがたをかくす');
      // ねこに向かって10歩進む is ねこの方を向いて、10歩進む
      text = whole(text, /^((?:[^、。]+?は、?)?)([^、。]+?)に(?:向かって|むかって)、?(.+(?:進む|すすむ|動く|うごく|歩く|あるく))$/d, ([s, t, rest]) => s + t + 'の方を向いて、' + rest);
      // 名前一覧の最初に「a」を入れる is the 1番目
      text = whole(text, /^(.+?)の(?:最初|はじめ|先頭|いちばん前)に(.+)を(?:入れる|いれる)$/d, ([l, v]) => l + 'の1番目に' + v + 'を入れる');
      text = whole(text, /^(.+)と(?:聞く|きく|聞きます|ききます)$/d, ([q]) => q + 'とたずねる');
      text = whole(text, /^(.+)と(?:聞いて|きいて)、?(?:答え|返事)を待つ$/d, ([q]) => q + 'とたずねて、答えを待つ');
      text = word(text, 'という合図を送る', 'の合図を送る');
      text = word(text, 'という合図を送って、', 'の合図を送って、');
      // つぎの／まえの すがた・はいけい, こたえ／まつ (kana spellings, F-20)
      for (const [from, to] of [['つぎのすがた', '次のすがた'], ['つぎのはいけい', '次のはいけい'], ['まえのすがた', '前のすがた'], ['まえのはいけい', '前のはいけい'],
        ['こたえをまつ', '答えを待つ'], ['答えをまつ', '答えを待つ'], ['こたえを待つ', '答えを待つ']]) text = word(text, from, to);
      // 画面の端に触れていれば、跳ね返る / もし画面のはしにふれているなら、はね返る / はね返る (alone: it bounces only at the edge)
      // are the one bounce sentence. ふれたら・ふれると・ふれれば・ふれていたら are not read (diagnoseSentenceIntent).
      text = whole(text, /^((?:[^、。]+?は、?)?)(?:もし、?)?画面の(?:はし|端)に(?:ふれ|触れ)(?:ていれば|ているなら)、?(?:はね返る|跳ね返る)$/d, ([s]) => s + '画面のはしにふれていれば、はね返る');
      text = whole(text, /^((?:[^、。]+?は、?)?)(?:はね返る|跳ね返る|はねかえる)$/d, ([s]) => s + '画面のはしにふれていれば、はね返る');
      // コピーを作る with no owner is 自分のコピー.
      text = whole(text, /^((?:[^、。]+?は、?)?)コピーを((?:.+?)(?:つ|個|体))?(?:作る|つくる)$/d, ([s, n]) => s + '自分のコピーを' + (n || '') + '作る');
      text = whole(text, /^((?:[^、。]+?は、?)?)このコピーを(?:消す|けす)$/d, ([s]) => s + 'このコピーだけを消す');
      // 点数を1つ増やす / 点数を2こ増やす: つ and こ count (2個 keeps its unit 個).
      text = whole(text, /^(.+?)を([0-9０-９]+)(?:つ|こ)?(?:ずつ)?(増やす|ふやす|減らす|へらす)$/d, ([t, n, v]) => t + 'を' + n + v);

      text = whole(text, /^(.+)の中身をすべて(?:消す|けす)$/d, ([l]) => l + 'の中身を全部消す');
      // かな書きの動詞 at the end
      for (const [from, to] of [['歩すすむ', '歩進む'], ['度まわる', '度回る'], ['ふやす', '増やす'], ['へらす', '減らす']]) if (surfaceMask(text).endsWith(from)) text = text.slice(0, -from.length) + to;
      text = whole(text, /^(.+?)の音を(鳴らす|鳴らし始める)$/d, ([n, v]) => n + 'を' + v);
      return text;
    };
    // です・ます are read by the polite table in readRoleStatement. Together with another natural spelling
    // (10歩すすみます, 後ろへ10歩下がります) the plain verb is tried here.
    if (/ます$/.test(surfaceMask(code)))
      for (const [from, to] of [['します', 'す'], ['します', 'する'], ['きます', 'く'], ['ちます', 'つ'], ['みます', 'む'], ['ります', 'る'], ['います', 'う'], ['ます', 'る']]) {
        if (!surfaceMask(code).endsWith(from)) continue;
        const plain = code.slice(0, -from.length) + to, natural = normalize(plain);
        if (natural !== plain) add(natural);
      }
    {
      const plain = normalize(code);
      add(plain);
      // にする and にかえる are the same action in every 〜を…に sentence.
      if (surfaceMask(plain).endsWith('にする')) add(plain.slice(0, -'する'.length) + 'かえる');
      else if (/に(?:かえる|変える)$/.test(surfaceMask(plain))) add(plain.slice(0, -'かえる'.length) + 'する');
    }
    return out;
  }
  // Natural spellings that do not read as written are tried in the form the code writes (see naturalSentenceVariants).
  // Scan the final letter run once; retrying every numeric/て/で suffix makes malformed long lines quadratic.
  function unknownSentenceVerb(code) {
    if (!/[るうくすつむぶぐ]/u.test(code.at(-1) || '')) return null;
    const chars = Array.from(code), letter = c => /[\p{L}ー]/u.test(c), numeric = c => /[0-9０-９.．]/u.test(c);
    let start = chars.length;
    while (start > 0 && letter(chars[start - 1])) start--;
    const tail = chars.slice(start);
    if (start === 0) return tail.length >= 2 ? [null, code] : null;
    let numberStart = start;
    while (numberStart > 0 && numeric(chars[numberStart - 1])) numberStart--;
    if (numberStart < start) {
      const matched = /^[0-9０-９.．]+(?:歩|度|秒|個|点|番目)?(?:に|へ|を|だけ|間)?([\p{L}ー]+(?:する|る|う|く|す|つ|む|ぶ|ぐ))$/u.exec(chars.slice(numberStart).join(''));
      if (matched) return matched;
    }
    if (tail.length >= 2 && chars[start - 1] === '、' && ['て', 'で'].includes(chars[start - 2])) return [null, tail.join('')];
    const connector = tail.findIndex(c => c === 'て' || c === 'で');
    return connector >= 0 && tail.length - connector - 1 >= 2 ? [null, tail.slice(connector + 1).join('')] : null;
  }
  function parseSentenceSequence(line,symbols,ctx) {
    // 名人: もし…なら、主役は… — a sentence inside a line is read as 名人 first.
    if(ctx.meijin){const read=readMeijinSentence(line,symbols,ctx);if(read)return read;}
    try { return parseSentenceSequenceAsWritten(line,symbols,ctx); }
    catch (error) {
      if (!(error instanceof AkariError) || ctx.naturalVariant) throw error;
      const code = compactOutsideString(line.code);
      for (const variant of naturalSentenceVariants(code, symbols)) {
        const part = surfaceLineSlice(line, 0, code.length, variant);
        part.comment = line.comment; part.inline = line.inline;
        try { return parseSentenceSequenceAsWritten(part, symbols, { ...ctx, naturalVariant: true }); }
        catch (attempt) { if (!(attempt instanceof AkariError)) throw attempt; }
      }
      const who = surfaceCapture(/^([^、。「」『』【】（）]+?)が(.+)$/d, code);
      if (who && !['自分', ...EVERYONE_WORDS].includes(who[0].text) && !dataNameKind(who[0].text, symbols, ctx) && !symbols?.project?.components?.some(c => c.name === who[0].text)) {
        let reads = false;
        try { const part = surfaceLineSlice(line, 0, code.length, who[0].text + 'は' + who[1].text); part.comment = line.comment; parseSentenceSequenceAsWritten(part, symbols, { ...ctx, naturalVariant: true }); reads = true; }
        catch (attempt) { if (!(attempt instanceof AkariError)) throw attempt; }
        if (reads) throw new AkariError('P205', `「${who[0].text}」という キャラクターや 部品が 見つかりません。名前を たしかめて ください`, line.lineNo, 1);
      }
      // unreadName: the sentence began with a word that is no bare name (1秒休む), so the verb after it is looked at.
      const nameMessage = error.message === NAME_BRACKET_MESSAGE || !!error.unreadName;
      // 10歩進んでください / 10歩進め / 10歩進もう / 進んでね: a request or a call is written as 「進む」, also when the
      // whole sentence is not read (F-26).
      if (nameMessage || (error.code === 'P201' && !error.proposals?.length && /^「[\s\S]+」は 読めません。書き方を たしかめて ?ください。$/.test(error.message))) {
        const readsAs = text => { try { const part = surfaceLineSlice(line, 0, code.length, text); part.comment = line.comment; return !!parseSentenceSequence(part, symbols, { ...ctx, naturalVariant: true }); } catch (attempt) { if (!(attempt instanceof AkariError)) throw attempt; return false; } };
        const mask = surfaceMask(code), stem = text => sentenceInfinitive(text);
        const forms = [];
        const polite = /(?:て|で)(?:ください|くださいね|ね|よ)$/.exec(mask);
        if (polite) forms.push(stem(code.slice(0, polite.index + 1)));
        const call = { め: 'む', れ: 'る', け: 'く', て: 'つ', え: 'う', せ: 'す', げ: 'ぐ', べ: 'ぶ', ね: 'ぬ' }, will = { もう: 'む', ろう: 'る', こう: 'く', とう: 'つ', おう: 'う', そう: 'す', ごう: 'ぐ', ぼう: 'ぶ' };
        const last = mask.slice(-1), last2 = mask.slice(-2);
        if (will[last2]) forms.push(code.slice(0, -2) + will[last2]);
        if (/よう$/.test(mask)) forms.push(code.slice(0, -2) + 'る', code.slice(0, -3) + 'する');
        if (/ろ$/.test(mask)) forms.push(code.slice(0, -1) + 'る');
        if (call[last]) forms.push(code.slice(0, -1) + call[last]);
        const plain = forms.find(text => text && text !== code && readsAs(text));
        if (plain) throw sentenceDiagnostic(`お願いや よびかけの 形（〜てください・〜め・〜よう）では 書きません。「${canonicalStatementSource(plain, symbols)}」のように 書きます`, line, [{ label: 'ふつうの 形に する', source: canonicalStatementSource(plain, symbols) }], { kind: 'Sequence' });
      }
      // 10歩下がる / 1秒休む / 1回転する: a word Akari does not have, after a number.
      const unknown = unknownSentenceVerb(code);
      // A verb of あかり (3回、前へ10歩進む / 3回、右に90度回る) is not said to be missing, and the words before it are no
      // name to put in 【 】: the sentence around the verb is what does not read.
      const known = unknown && (Object.values(MOVE_VERBS).some(verbs => verbs.includes(unknown[1])) || SENTENCE_TE_FORMS.some(([, verb]) => verb === unknown[1]));
      if (nameMessage && known && !dataNameKind(unknown[1], symbols, ctx))
        throw new AkariError('P201', `「${line.code}」は 読めません。書き方を たしかめて ください。`, line.lineNo, 1);
      // The word quoted is a whole word (F-26, FM2-05): a piece that begins inside a word (ずつ進む, どまわる, 倍にする,
      // の速さで…) is not quoted; the sentence as written is.
      const whole = unknown && !/^(?:こ|つ|まい|ひき|ほん|ばん|かい)/.test(unknown[1]) && /^(?:[\p{Script=Han}]|(?![ずどのにへをでがとだ])[\p{Script=Hiragana}ー])[^のにへをでが]*$/u.test(unknown[1]);
      if (nameMessage && unknown && !known && !dataNameKind(unknown[1], symbols, ctx))
        throw new AkariError('P205', `「${whole ? unknown[1] : writtenSentence(line)}」という 文は あかりに ありません。「書ける ことば」から 近い 文を えらんで ください`, line.lineNo, 1);
      throw error;
    }
  }
  function parseSentenceSequenceAsWritten(line,symbols,ctx) {
    const code=compactOutsideString(line.code),mask=surfaceMask(code),scope={...ctx};
    // Whole finite forms containing commas win before connective splitting.
    let firstError;
    try {return [parseSimpleStatement(line,symbols,scope)];}catch(error){if(!(error instanceof AkariError))throw error;firstError=error;}
    if(firstError.code==='S308')throw firstError;
    const nodes=[];let start=0;
    for(let i=0;i<mask.length;i++) {
      const connective = mask.startsWith('から',i);
      if(mask[i]!=='、'&&!connective)continue;
      const end=connective?i:mask.slice(Math.max(start,i-2),i)==='から'?i-2:i;
      const pair=SENTENCE_TE_FORMS.find(([te])=>end-start>=te.length&&mask.startsWith(te,end-te.length));
      if(!pair)continue;
      // 「3をわたして、」「点数を10として、」 hand values to a procedure; they are not an action of their own.
      if(/(?:を(?:わたし|渡し)て|として)$/.test(mask.slice(start,end)))continue;
      // そして、 is a lead word, not an action ending in して.
      if(new RegExp('^(?:'+LEAD_WORDS+')$').test(mask.slice(start,end)))continue;
      // 「…」とたずねて、答えを待って、… : the waiting is part of asking.
      if(/(?:たずねて|聞いて|きいて)$/.test(mask.slice(start,end))){const wait=/^(?:答え|返事)を(?:待って|まって|待ち|まち)、/.exec(mask.slice(i+1));if(wait)i+=wait[0].length;}
      const tail=code.slice(start,end);
      let replacement=tail.slice(0,-pair[0].length)+pair[1];
      if(pair[0]==='行って'&&!/(?:手順|てじゅん)を行う$/.test(replacement))replacement=tail.slice(0,-pair[0].length)+'行く';
      // …へいって、 / …にいって、 is going (いく); 「…」といって、 is saying.
      if(pair[0]==='いって'&&/[へに]いって$/.test(mask.slice(start,end)))replacement=tail.slice(0,-pair[0].length)+'いく';
      const part=surfaceLineSlice(line,start,i,replacement),head=readBlockHead(replacement,symbols,{...scope,sourceLine:part,lineNo:line.lineNo});
      let node;
      if(head?.inlineBody){const fields={...head};delete fields.inlineBody;delete fields.kind;node=statementNode(head.kind,part,{...fields,body:head.inlineBody,actorRef:{...(head.actorRef||scope.topicActor||{kind:'self'})}});}
      else {
        try { node=parseSimpleStatement(part,symbols,scope); }
        catch(error){
          if(!(error instanceof AkariError))throw error;
          // A clause that reads only in its natural spelling reads the same way before 「〜して、」 (点数を1つ増やして、…).
          for(const variant of naturalSentenceVariants(replacement,symbols)){try{node=parseSimpleStatement(surfaceLineSlice(line,start,i,variant),symbols,scope);break;}catch(attempt){if(!(attempt instanceof AkariError))throw attempt;}}
          // The message names the child's sentence, not the 〜する made from 〜して.
          if(!node)throw error.code==='P201'&&error.message.includes(replacement)?firstError:error;
        }
      }
      // ねこは「やあ」と言って、1秒待つ: a 待って without its own subject is the wait of the whole flow.
      nodes.push(node);if(STATEMENT_EXPLICIT_ACTORS.has(node))scope.topicActor=topicOf(node.actorRef);start=i+(connective?2:1);if(mask[start]==='、')start++;i=start-1;
    }
    if(!nodes.length)throw firstError;
    if(start>=code.length)throw new AkariError('P202','「〜して、」の あとに、つづきの 文を 書いて ください。れい：前へ10歩進んで、「やあ」と言う',line.lineNo,1);
    const rest=surfaceLineSlice(line,start,code.length);rest.comment=line.comment;
    nodes.push(...parseSentenceSequence(rest,symbols,scope));
    partWaitBeforeOtherSubject(nodes,line,symbols);
    return nodes;
  }
  // ねこは1秒待ってから、だんごは10歩進む: only ねこ would wait and だんご would move at once, so the child chooses.
  function partWaitBeforeOtherSubject(nodes,line,symbols) {
    const same=(a,b)=>a?.kind===b?.kind&&(a?.kind!=='named'||a.name===b.name);
    const at=nodes.findIndex((n,i)=>EVERYONE_WAITS.has(n.kind)&&n.actorRef?.kind!=='all'&&nodes.slice(i+1).some(m=>STATEMENT_EXPLICIT_ACTORS.has(m)&&!same(m.actorRef,n.actorRef)));
    if(at<0)return;
    const write=body=>{try{return formatScript({kind:'Script',body}).trim().replace(/。$/,'');}catch{return null;}};
    const together=write(nodes.map((n,i)=>i===at?{...n,actorRef:{kind:'all'}}:n)),only=write(nodes),who=sentenceActorSource(nodes[at].actorRef);
    throw sentenceDiagnostic(`「待って」のあとに ほかの 主語の 文を つづける ときは、文を 分けて 書きます。みんなで 待つのか、${who}だけが 待つのかを えらんで ください（みんなで 待つときは「1秒待つ。」、${who}だけが 待つときは「${who}は1秒待つ。」と 書いて、次の 文を 書きます）`,line,
      [...(together?[{label:'みんなで 待ってから つづける',source:together}]:[]),...(only?[{label:`${who}だけが 待つ（ほかは すぐ 動く）`,source:only}]:[])],{kind:'Sequence'});
  }
  // 点数が10になったら (no もし): three meanings, each in the child's words (LANGUAGE.md 読めない書き方): now, once by
  // waiting, or each time (名人's 〜になったとき).
  // The condition of 点数が10になったら (点数が10と同じ), or null when it does not read.
  function becomesCondition(written,symbols,ctx){
    try{return parseCondition(/(?:以上|以下|より大きい|より小さい|と同じ|とちがう|と違う)$/.test(surfaceMask(written))?written:written+'と同じ',symbols,ctx,'plain');}
    catch(error){if(!(error instanceof AkariError))throw error;return null;}
  }
  // With もし (もし答えが「7」になったら、) only two readings are meant: now, or after waiting.
  function becomesIfMessage(written,symbols,ctx){
    const condition=written===null?null:becomesCondition(written,symbols,ctx);
    return `「になったら」は ここでは 使えません。いまの ようすを しらべるなら「${condition?'もし'+formatCondition(condition,'if')+'、':'もし点数が10なら、'}」、そう なるまで 待つなら「${condition?formatCondition(condition,'until')+'待つ':'点数が10になるまで待つ'}」のように 書きます`;
  }
  function becomesMessage(written,symbols,ctx){
    const condition=becomesCondition(written,symbols,ctx);
    const now=condition?'もし'+formatCondition(condition,'if')+'、':'もし〜なら、',wait=condition?formatCondition(condition,'until')+'待つ。':'〜になるまで待つ。';
    return `「${written}になったら、」は、いくつかの 意味に とれます。いま しらべるなら「${now}」、そう なるまで 待つなら「${wait}」、そうなる たびに するなら 名人の本文で「${written}になったとき、」と 書きます`;
  }
  function sentenceDiagnostic(message,line,choices=[],draftRole=null,code=null) {
    const error=new AkariError(code||(message.startsWith(MEIJIN_ONLY_MESSAGE)?'S317':'P205'),message.replace(/\n/g,' '),line?.lineNo||0,1),range=sourceRange(line?.mapped?.positions||[]);
    if(choices.length)error.proposals=choices.map(choice=>({...choice,source:choice.source.replace(/\n/g,'\n'+' '.repeat(line?.indent||0)),start:range?.start??line?.start??0,end:range?.end??line?.end??0}));
    if(draftRole)error.draftRole=draftRole;
    return error;
  }
  // Proposals are shown and inserted as written, so they carry the text the formatter writes back.
  function canonicalStatementSource(source,symbols) {
    try{const parsed=parseSyntax(source+'。',{symbols});return parsed.ast?formatScript(parsed.ast).trim().replace(/。$/,''):source;}catch{return source;}
  }
  function sentenceInfinitive(text) {
    const mask=surfaceMask(text),pair=SENTENCE_TE_FORMS.find(([te])=>mask.endsWith(te));
    return pair?text.slice(0,-pair[0].length)+pair[1]:text;
  }
  let diagnosingNaturalIntent=false;
  function repeatChoiceSources(source,previousLine,line,nextLine,turn) {
    const firstRange=sourceRange(previousLine.mapped.positions),turnRange=sourceRange(line.mapped.positions),lastRange=sourceRange(nextLine.mapped.positions);
    if(typeof source!=='string'||!firstRange||!turnRange||!lastRange||firstRange.end>turnRange.start||turnRange.end>lastRange.start||lastRange.end>nextLine.end)return null;
    const tail=source.slice(lastRange.end,nextLine.end),complete=/^[ \t　]*(?:。[ \t　]*)?(?:※[^\r\n]*)?$/u.test(tail),
      end=complete?nextLine.end:lastRange.end+(/^[ \t　]*。[ \t　]*/u.exec(tail)?.[0].length||0),
      eol=source.slice(firstRange.start,end).match(/\r\n|\r|\n/)?.[0]||'\n',indent=' '.repeat(line.indent||0);
    // Only the statement boundary and indentation change. Quoted multiline contents and memo text stay verbatim.
    const fragment=(code,trivia,shift=0)=>{
      if(!/^[ \t　]*。/u.test(trivia))trivia='。'+trivia;
      trivia=trivia.replace(/(?:\r\n|\r|\n)[ 　]*$/u,'');
      trivia=trivia.replace(/(\r\n|\r|\n)([ 　]*)(?=※)/gu,(_,nl,lead)=>nl+' '.repeat(shift)+lead);
      return code+trivia;
    };
    const count=fragment(source.slice(lastRange.start,lastRange.end),source.slice(lastRange.end,end));
    return [0,1].map(choice=>{
      const first=fragment(source.slice(firstRange.start,firstRange.end),source.slice(firstRange.end,turnRange.start),choice===0?2:0),
        turned=fragment(turn,source.slice(turnRange.end,lastRange.start),2);
      let replacement=choice===0?count+eol+indent+'  '+first+eol+indent+'  '+turned:first+eol+indent+count+eol+indent+'  '+turned;
      // A following statement on the same physical line stays outside the newly chosen repeat.
      if(end<nextLine.end)replacement+=eol+indent;
      return {label:choice===0?'前の 文と 回る 文の 両方を くり返す':'前の 文は 一度、回る 文だけを くり返す',source:replacement,start:firstRange.start,end};
    });
  }
  let checkingSentenceIntentReads = false;
  function diagnoseSentenceIntent(line,symbols,ctx,previousLine=null,nextLine=null,source=null) {
    const code=line.code,mask=surfaceMask(code);let p;
    const inlineIf=/^(もし[^、]+?、)(.+)$/.exec(mask);
    if(inlineIf&&/ゆっくり|度、?[^、。]*?秒(?:間)?(?:かけて|で)|のところ(?:へ|に)、?[^、。]*?秒(?:間)?(?:かけて|で)/.test(mask)){
      const head=code.slice(0,inlineIf[1].length),body=surfaceLineSlice(line,head.length,code.length);body.indent=0;let found=null;
      try{diagnoseSentenceIntent(body,symbols,ctx);}catch(error){if(!(error instanceof AkariError))throw error;found=error;}
      if(found?.proposals?.length)throw sentenceDiagnostic(found.message,line,found.proposals.map(({label,source})=>({label,source:head+'\n  '+source.replace(/\n/g,'\n  ')})),found.draftRole);
    }
    if(!diagnosingNaturalIntent&&!chainLooking&&/ゆっくり|度、?[^、。]*?秒(?:間)?(?:かけて|で)|のところ(?:へ|に)、?[^、。]*?秒(?:間)?(?:かけて|で)/.test(mask)){
      for(const variant of naturalSentenceVariants(code,symbols)){
        let found=null;diagnosingNaturalIntent=true;
        try{diagnoseSentenceIntent({...line,code:variant,indent:0},symbols,ctx);}catch(error){if(!(error instanceof AkariError))throw error;found=error;}finally{diagnosingNaturalIntent=false;}
        if(found?.proposals?.length)throw sentenceDiagnostic(found.message,line,found.proposals.map(({label,source})=>({label,source})),found.draftRole);
      }
    }
    const skipRest=/^(.*?は、?)?次のくり返しへ進む$/.exec(mask);
    // A bare はし stays a name, because a part may be called はし (橋, 箸); 端 is no part's name. Bouncing only happens
    // at the stage edge, and a touch test names a part that must exist, so without such a part the child means 画面のはし.
    const bounceForm=/^(?:[^、。]+?は、?)?画面の(?:はし|端)に(?:ふれて|触れて)いれば、?(?:はね返る|跳ね返る)$/;
    const bareEdgeBounce=!bounceForm.test(mask)&&/^(.*?は、?)?(?:もし、?)?(?:はし|端)に(?:ふれ|触れ).*(?:はね返る|跳ね返る)$/.exec(mask);
    // 画面のはしで はね返る: the bounce is one sentence, 画面のはしにふれていれば、はね返る.
    const edgeBounce=/^(.*?は、?)?(?:画面の)?(?:はし|端)で、?(?:はね返る|跳ね返る|はねかえる)$/.exec(mask);
    if(edgeBounce)throw sentenceDiagnostic('画面の はしで はね返る ときは、「画面のはしにふれていれば、はね返る」と 書きます',line,[{label:'画面の はしで はね返る',source:code.slice(0,edgeBounce[1]?.length||0)+'画面のはしにふれていれば、はね返る'}],{kind:'MotionCommand'});
    if(bareEdgeBounce)throw sentenceDiagnostic('画面の はしで はね返る ときは、「画面のはしにふれていれば、はね返る」と 書きます',line,[{label:'画面の はしで はね返る',source:code.slice(0,bareEdgeBounce[1]?.length||0)+'画面のはしにふれていれば、はね返る'}],{kind:'MotionCommand'});
    // 下のはしにふれていれば / 上の端にふれるまで (画面の left out): one side of the screen, 画面の下のはし (C-touch-R2-06),
    // never 画面のはし, which is any side.
    const sideEdgeTouch=/(^|もし、?|、|が|は)(上|下|右|左)の(はし|端)(?=に(?:ふれ|触れ))/.exec(mask);
    if(sideEdgeTouch&&!(symbols?.project?.components||[]).some(c=>c.name===sideEdgeTouch[2]+'の'+sideEdgeTouch[3])){
      const at=sideEdgeTouch.index+sideEdgeTouch[1].length,side=sideEdgeTouch[2],source=code.slice(0,at)+'画面の'+side+'のはし'+code.slice(at+side.length+1+sideEdgeTouch[3].length);
      let readable=false;try{readable=!!parseSyntax(source.replace(/、$/,'、\n  何もしない')+'。',{symbols}).ast;}catch(error){if(!(error instanceof AkariError))throw error;}
      throw sentenceDiagnostic(`画面の ${side}の はしの ことなら、「画面の${side}のはし」と 書きます`,line,readable?[{label:`画面の ${side}の はしに する`,source}]:[]);
    }
    const bareEdgeTouch=/(^|もし|、|が|は)(はし|端)に(?:ふれ|触れ)/.exec(mask);
    if(bareEdgeTouch&&(bareEdgeTouch[2]==='端'||!symbols?.project?.components?.some(c=>c.name==='はし'))){
      const at=bareEdgeTouch.index+bareEdgeTouch[1].length;
      throw sentenceDiagnostic('画面の はしの ことなら、「画面のはし」と 書きます',line,[{label:'画面の はしに ふれている',source:code.slice(0,at)+'画面の'+code.slice(at)}]);
    }
    // 書20: guidance that names the fix (proposals are written as the code writes them).
    const fixed=(message,source,label,kind)=>sentenceDiagnostic(message,line,[{label,source:canonicalStatementSource(source,symbols)}],{kind});
    // ねこもだんごも1秒待つ / ねことだんごは…: a sentence has one subject, so each part gets its own sentence
    // (two waits of parts hold at the same time).
    {const both=actorNamePatterns(symbols).both.exec(code);
      if(both&&both[1]!==both[2]){const one=name=>canonicalStatementSource(name+'は'+both[3],symbols),split=one(both[1])+'。\n'+one(both[2]);
        // A timed action split into sentences runs one subject after the other; say so before the child splits it.
        const timed=/(?:秒(?:間)?かけて|秒(?:間)?(?:話す|はなす|言う|いう|鳴らす|ならす)|を(?:最後まで)?(?:鳴らす|ならす))/.test(surfaceMask(both[3]));
        throw sentenceDiagnostic('1つの 文に 書ける 主語は 1つです。主語ごとに 文を 分けて 書きます'+(timed?'。分けると、書いた じゅんに 一人ずつ 動きます。いっしょに 動かす ときは、名人の本文か、同じ きっかけの 別の 本文で 書きます':''),line,parseSyntax(split+'。',{symbols}).ast?[{label:timed?'文を 分ける（じゅんに 動く）':'文を 分ける',source:split}]:[],{kind:'Sequence'});}}
    const knownName=name=>!!dataNameKind(name,symbols,ctx)||[...(ctx.localNames||[])].includes(name);
    // A sentence, a heading or もし (with a body), or a repeat (くり返す。 with a body).
    const reads=source=>{
      // A failed trial needs no further correction trials; only its readable AST is used here.
      if(checkingSentenceIntentReads)return false;
      checkingSentenceIntentReads=true;
      try{for(const text of [source+'。',source.replace(/、?$/,'、')+'\n  何もしない。',source+'。\n  何もしない。']){
        try{if(parseSyntax(text,{symbols}).ast)return true;}catch(error){if(!(error instanceof AkariError))throw error;}
      }return false;}finally{checkingSentenceIntentReads=false;}
    };
    const wholeScreenTouch=/(^|もし、?|、|が|は)画面に(?:ふれ|触れ)/.exec(mask);
    if(wholeScreenTouch&&symbols?.project&&namesStage(symbols.project,'画面')){const at=wholeScreenTouch.index+wholeScreenTouch[1].length,source=code.slice(0,at)+'画面のはし'+code.slice(at+2);throw sentenceDiagnostic('画面の はしの ことなら「画面のはし」と 書きます',line,reads(source)?[{label:'画面の はしに する',source}]:[],{kind:'IfStatement'});}
    // 画面の下にふれていれば / 画面の右にふれたとき: one side of the screen is 画面の下のはし (no part may be named 画面).
    const sideTouch=/(^|もし、?|、|が|は)画面の(上|下|右|左)に(?:ふれ|触れ)/.exec(mask);
    if(sideTouch&&symbols?.project&&namesStage(symbols.project,'画面')){
      const at=sideTouch.index+sideTouch[1].length+3+sideTouch[2].length,source=code.slice(0,at)+'のはし'+code.slice(at),side=sideTouch[2];
      throw sentenceDiagnostic(`画面の ${side}の はしの ことなら、「画面の${side}のはし」と 書きます`,line,reads(source)?[{label:`画面の ${side}の はしに ふれている`,source}]:[]);
    }
    if(/キーがおされてれば/.test(mask)){
      const source=code.replace(/キーがおされてれば/g,'キーがおされていれば');
      throw sentenceDiagnostic('「おされてれば」は「おされていれば」と 書きます',line,reads(source)?[{label:'「おされていれば」と 書く',source}]:[],{kind:'IfStatement'});
    }
    // 名人 (E2E-R2-01): who touches is written bare (もし「ねこ」が「星」にふれていれば → もしねこが「星」にふれていれば), and a
    // 名人 text has no 自分 (もし自分がコピーであるなら → もしねこがコピーなら). Said only when the line does not read.
    if(ctx.meijin){
      if(/^画面の(?:はし|端|[上下左右]の(?:はし|端))に(?:ふれ|触れ)ているもの/.test(mask))throw sentenceDiagnostic('画面のはしは 部品では ないので、「ふれているもの」の 相手に 書けません。部品の 名前を 書きます',line,[],{kind:'Sequence'});
      const parts=symbols?.project?.components||[],quotedWho=/(^|もし、?|、)「([^「」]+)」が(?=[^、。]*?に(?:ふれ|触れ))/.exec(code);
      if(quotedWho&&parts.some(c=>c.name===quotedWho[2])&&!reads(code)){
        const at=quotedWho.index+quotedWho[1].length,source=code.slice(0,at)+quotedWho[2]+code.slice(at+quotedWho[2].length+2);
        if(reads(source))throw sentenceDiagnostic(`名人の 本文では、ふれる 部品の 名前を「 」で かこまずに 書きます。れい：${source}`,line,[{label:'「 」を とる',source}],{kind:'IfStatement'});
      }
      const self=/^(もし、?)自分(が|は)/.exec(mask),first=(parts.find(c=>c.type==='sprite')||parts[0])?.name;
      if(self&&first&&!reads(code)){
        const source=code.slice(0,self[1].length)+first+'が'+code.slice(self[0].length);
        throw sentenceDiagnostic(`名人の 本文には、「自分」に あたる 部品が ありません。部品の 名前を 書きます。れい：${reads(source)?source:`もし${first}がコピーなら、`}`,line,reads(source)?[{label:`「${first}」に する`,source}]:[],{kind:'IfStatement'});
      }
    }
    // ── ふれる (decisions §3, C-04 … C-10, C-18, final call 6). Each form below is not read, so the line never reads as
    // written; a fix is offered only when the whole line reads with it.
    {
      // 画面の左下のはし is the corner a place is measured from: the touch is with one of its two sides.
      const corner=/画面の(左|右)(上|下)の(?:はし|端)(?=に(?:ふれ|触れ))/.exec(mask);
      if(corner){const at=corner.index,end=at+corner[0].length,sides=[corner[2],corner[1]].map(side=>code.slice(0,at)+'画面の'+side+'のはし'+code.slice(end));
        throw sentenceDiagnostic(touchCornerMessage(corner[1]+corner[2]),line,sides.filter(reads).map(source=>({label:'「'+/画面の.のはし/.exec(source.slice(at))[0]+'」に する',source})),{kind:'IfStatement'});}
      // 画面のはしにふれたら、はね返る (and ると・れば, and the spoken ふれてたら): はね返る is one sentence, with ふれていれば.
      // ふれていたら is written ふれていれば.
      const bounce=/^(.*?は、?)?(?:もし、?)?画面の(?:はし|端)に(?:ふれ|触れ)(たら|ると|れば|ていたら|ていると|てたら|てれば|てると)、?(?:はね返る|跳ね返る)$/.exec(mask);
      if(bounce)throw sentenceDiagnostic((/^て(?:い)?たら$/.test(bounce[2])?`「ふれ${bounce[2]}」は「ふれていれば」と 書きます。`:'')+'画面の はしで はね返る ときは、「画面のはしにふれていれば、はね返る」と 書きます',line,
        [{label:'画面の はしで はね返る',source:code.slice(0,bounce[1]?.length||0)+'画面のはしにふれていれば、はね返る'}],{kind:'MotionCommand'});
      // もし「ねこ」にふれていたら (and ていなかったら, and the spoken てたら・てなかったら): the state is written
      // ふれていれば (ふれていなければ), as are the spoken ふれてれば・ふれてるなら (C-touch-R2-05).
      if(/に(?:ふれ|触れ)て(?:い)?(?:たら|なかったら)|に(?:ふれ|触れ)て(?:れば|なければ|るなら|ないなら)/.test(mask)){
        let out='',at=0,first=null;
        for(const m of mask.matchAll(/に(?:ふれ|触れ)(て(?:い)?(?:たら|なかったら)|て(?:れば|なければ|るなら|ないなら))/g)){const not=/なかった|なければ|ないなら/.test(m[1]);out+=code.slice(at,m.index)+'にふれてい'+(not?'なければ':'れば');at=m.index+m[0].length;first??={written:'ふれ'+m[1],fix:not?'ふれていなければ':'ふれていれば',end:out.length};}
        const source=out+code.slice(at),head=source.slice(0,first.end),example=(/もし/.test(surfaceMask(head))?head:'もし'+head)+'、';
        throw sentenceDiagnostic(`「${first.written}」は 読みません。「${example}」のように「${first.fix}」と 書きます`,line,reads(source)?[{label:`「${first.fix}」と 書く`,source}]:[],{kind:'IfStatement'});
      }
      // 「星」にふれてるあいだ (spoken): the state is ふれている.
      if(/に(?:ふれ|触れ)て(?:る|ない)(?:あいだ|間)/.test(mask)){
        let out='',at=0,written=null;
        for(const m of mask.matchAll(/に(?:ふれ|触れ)て(る|ない)(?=あいだ|間)/g)){out+=code.slice(at,m.index)+'にふれてい'+m[1];at=m.index+m[0].length;written??='ふれて'+m[1];}
        const source=out+code.slice(at),fix=written.endsWith('ない')?'ふれていない':'ふれている';
        throw sentenceDiagnostic(`「${written}」は「${fix}」と 書きます`,line,reads(source)?[{label:`「${fix}」と 書く`,source:canonicalStatementSource(source,symbols)}]:[],{kind:'RepeatWhile'});
      }
      // さわる・当たる・ぶつかる are written ふれる (one verb, one meaning), and 「星」とぶつかる・「星」とふれる are written
      // 「星」にふれる; the line is read again with にふれる below.
      let touchCode=code,touchMask=mask,verbNote='';
      const verb=/(に|と)(さわ|当た|あた|ぶつか|ふれ|触れ)(っ|る|ら|れ|り|た|て)/.exec(mask);
      if(verb&&(verb[1]==='と'||!['ふれ','触れ'].includes(verb[2]))&&!knownWords(symbols,ctx).some(name=>name.includes(verb[1]+verb[2]))){
        let out='',at=0;
        for(const m of mask.matchAll(/(に|と)(さわ|当た|あた|ぶつか|ふれ|触れ)(っ|る|ら|れ|り|た|て)/g)){
          if(m[1]==='に'&&['ふれ','触れ'].includes(m[2]))continue;
          out+=code.slice(at,m.index)+'に'+(['ふれ','触れ'].includes(m[2])?'ふれ'+m[3]:{っ:'ふれ',る:'ふれる',ら:'ふれ',れ:'ふれれ',り:'ふれ',た:'ふれた',て:'ふれて'}[m[3]]);at=m.index+m[0].length;}
        touchCode=out+code.slice(at);touchMask=surfaceMask(touchCode);
        verbNote=['ふれ','触れ'].includes(verb[2])?'「〜とふれる」は「〜にふれる」と 書きます。':`「${verb[1]==='と'?'〜と':''}${verb[2]}る」は「${verb[1]==='と'?'〜に':''}ふれる」と 書きます。`;
      }
      // 「星」にふれたら・ふれると・ふれれば / もし「星」にふれたら: each time, now, or once by waiting? Three meanings, three
      // forms. The heading is offered only at the left margin; the wait only when the action is on the line.
      // もし「星」にふれたとき: もし and 〜たとき are not written together.
      // ふれたなら, and 「星」にふれているとき・ふれてるとき (no such heading), have the same three meanings.
      const word=surfaceCapture(/^(もし、?)?(.+?)に(?:ふれ|触れ)(たら|ると|れば|たとき|たなら|ているとき|てるとき|ていると|てると)、?(.*)$/d,touchCode,touchMask);
      if(word&&(word[2].text!=='たとき'||word[0])&&!/[、。]/.test(surfaceMask(word[1].text))){
        let phrase=null,mouse=false;
        try{phrase=touchPhrase(word[1],symbols);}catch(error){if(!(error instanceof AkariError))throw error;mouse=/^「?マウス」?$/.test(word[1].text);if(mouse)phrase={actor:null,target:'マウス'};}
        if(phrase){
          const shown=(phrase.actor?phrase.actor.text+'が':'')+touchShown(phrase.target),rest=word[3].text,form=word[2].text;
          const each=mouse?null:{label:'ふれる たびに する',source:`${shown}にふれたとき、${rest}`},now={label:'いま ふれて いるかを しらべる',source:`もし${shown}にふれていれば、${rest}`},
            wait=form!=='たとき'&&rest?{label:'ふれるまで 待つ',source:`${shown}にふれるまで待って、${rest}`}:null;
          // A 名人 heading names who touches, so the heading is offered only in an ordinary body.
          const choices=(word[0]?[now,each,wait]:[each,now,wait]).filter(c=>c&&(c!==each||(!line.indent&&!ctx.meijin))&&reads(c.source));
          const message=form==='たとき'?`「もし」と「〜たとき」は いっしょに 書きません。${mouse?'':`ふれる たびに するなら「${shown}にふれたとき、」、`}いま ふれて いるかを しらべるなら「もし${shown}にふれていれば、」と 書きます`
            :`「〜にふれ${form}」は、いくつかの 意味に とれます。${mouse?'':`ふれる たびに するなら「${shown}にふれたとき、」、`}いま ふれて いるかを しらべるなら「もし${shown}にふれていれば、」、ふれるまで 待つなら「${shown}にふれるまで待つ」と 書きます`;
          throw sentenceDiagnostic(verbNote+message,line,choices,{kind:'IfStatement',missing:['touchMeaning']});
        }
      }
      if(verbNote)throw sentenceDiagnostic(verbNote.replace(/。$/,''),line,reads(touchCode)?[{label:'「ふれる」に する',source:touchCode}]:[],{kind:'IfStatement'});
      // 「へや」にふれなくなったとき: no such event; leaving is waited for inside the touch body.
      const gone=surfaceCapture(/^(?:もし、?)?(.+?)に(?:ふれ|触れ)なくなった(?:とき|ら)、?(.*)$/d,code,mask);
      if(gone){let phrase=null;try{phrase=touchPhrase(gone[0],symbols);}catch(error){if(!(error instanceof AkariError))throw error;}
        if(phrase)throw sentenceDiagnostic(touchGoneMessage(phrase,symbols,!!ctx.meijin),line,[],{kind:'Script'});}
      // A touch heading inside a body: headings are written at the left margin.
      if(line.indent>0){let found=null;try{found=readTouchHeading(code,mask,symbols);}catch(error){if(!(error instanceof AkariError))throw error;}
        if(found)throw sentenceDiagnostic(`「${touchShown(found.heading.filter.target)}にふれたとき、」は 見出しです。行の はじめに 書きます`,line,[],{kind:'Script'});}
    }
    // ドの音を鳴らす is the sound named ド (LANGUAGE.md 音と待機). ドの音を0.5秒鳴らす and the like, with a time, are no
    // sentence of a sound, also when the work has a sound ド (G-R2-09): the tone is written in Hz.
    {const note=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(ド|レ|ミ|ファ|ソ|ラ|シ)(?:の音)?を([0-9０-９.．]+)秒(鳴らす|ならす|鳴らし始める|ならし始める)$/d,code,mask);
      if(note){
        const start=/始める$/.test(note[3].text),source=`${note[0].text}${SOLFEGE_HZ[note[1].text]}Hzの音を${note[2].text}秒${start?'鳴らし始める':'鳴らす'}`;
        throw sentenceDiagnostic(solfegeMessage(note[1].text),line,reads(source)?[{label:`${note[1].text}の 高さの 音を 鳴らす`,source}]:[],{kind:'SoundCommand'});}}
    // 1秒から3歩のどれか: the two numbers of どれか take the same unit (F-33).
    {const mixed=/(?<![0-9０-９.．])([0-9０-９.．]+)(歩|秒|度|回|％|番目|Hz|点|個)から([0-9０-９.．]+)(歩|秒|度|回|％|番目|Hz|点|個)の?どれか/.exec(mask);
      if(mixed&&mixed[2]!==mixed[4])throw sentenceDiagnostic(`「${mixed[0]}」は 読めません。「どれか」の 二つの 数には 同じ 単位を 書きます。れい：${mixed[1]}${mixed[2]}から${mixed[3]}${mixed[2]}のどれか`,line,[],{kind:'Sequence'});}
    // ゲームを止める / ゲームを終わる / 全部止める: the whole work stops with 作品を全部止める (F-30).
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(?:(?:ゲーム|げーむ)を(?:止める|とめる|終わる|おわる|終える|おえる|終わりにする|おわりにする)|(?:ゲーム|げーむ|作品|すべて|全部|ぜんぶ)(?:を|が)?(?:終わる|おわる|終える|おえる|終わりにする|おわりにする)|(?:全部|ぜんぶ|みんな|全員)(?:を)?(?:止める|とめる))$/d,code,mask)))
      throw sentenceDiagnostic('作品の 動きを ぜんぶ 止める ときは「作品を全部止める」と 書きます',line,reads('作品を全部止める')?[{label:'作品を 全部 止める',source:'作品を全部止める'}]:[],{kind:'StopCommand'});
    // 「ねこ」に点数を出す (no 文字・ボタン・四角 part) / 点数を画面に出す: the value is shown in a text part (F-31).
    {const shown=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(\u0001+)に(.+)を(?:出す|だす|書く|かく|表示する)$/d,code,mask),name=shown&&/^「([^「」]+)」$/.exec(shown[1].text)?.[1];
      const screen=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(.+)を画面に(?:出す|だす|書く|かく|表示する)$/d,code,mask);
      if((name&&!TEXT_PART_TYPES.includes(symbols?.project?.components?.find(c=>c.name===name)?.type))||screen)
        throw sentenceDiagnostic('画面に 出す ときは、「文字」の 部品を おいて「「文字1」に 点数を 出す」と 書きます',line,[],{kind:'LooksCommand'});}
    // ── More wordings a child writes (F-26, final call 12): each is looked at only when the line does not read as
    // written, and names the sentence to write; a fix is offered when the line reads with it.
    {
      let readMemo=null;
      const unread=()=>{if(unreadLooking)return false;if(readMemo===null){unreadLooking=true;try{readMemo=reads(code);}finally{unreadLooking=false;}}return !readMemo;};
      const choice=(label,source)=>reads(source)?[{label,source:canonicalStatementSource(source,symbols)}]:[];
      const number=text=>Number(text.replace(/[０-９．]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)));
      const parts=symbols?.project?.components||[];
      if(!ctx.meijin){
        if(/(?:たり|だり)、.+(?:たり|だり)する$/.test(mask)&&unread())
          throw sentenceDiagnostic('「〜たり、〜たりする」では、どちらを いつ するかが 決まりません。する ことを 一つずつ 文に 書きます',line,[],{kind:'Sequence'});
        // 点数が10なので、…: a reason says nothing of when; now (もし) or once by waiting, in the child's words.
        if((p=surfaceCapture(/^(?:もし、?)?(.+?)(?:なので|ので)、(.*)$/d,code,mask))&&unread()){
          const condition=becomesCondition(p[0].text,symbols,ctx),now=condition?'もし'+formatCondition(condition,'if')+'、':'もし〜なら、',wait=condition?formatCondition(condition,'until')+'待つ。':'〜になるまで待つ。';
          throw sentenceDiagnostic(`「〜ので」は 理由を 言う ことばで、いつ するかは 決まりません。いま しらべるなら「${now}」、そう なるまで 待つなら「${wait}」と 書きます`,line,condition&&p[1].text?choice('いま そう なって いたら する',now+p[1].text):[],{kind:'IfStatement'});
        }
        if(/^.+?(?:ても|でも)、/.test(mask)&&unread())
          throw sentenceDiagnostic('「〜ても」では、いつ 何を するかが 決まりません。「もし〜なら、」と「そうでなければ、」で 書きます',line,[],{kind:'IfStatement'});
        if(/(?:のに|けれど|けれども|けど)、/.test(mask)&&unread())
          throw sentenceDiagnostic('「〜のに」「〜けれど」では、いつ 何を するかが 決まりません。「もし〜なら、」と「そうでなければ、」で 書きます',line,[],{kind:'IfStatement'});
        // 1秒ごとに、 is a 名人 heading: the S317 text (LANGUAGE.md: 名人の本文だけの種類), then how an ordinary body repeats
        // with a wait (T2-05, MC-044).
        if((p=surfaceCapture(/^(?:[^、。\u0001]+?は、?)?([^、。]+?)秒(?:間)?ごとに、?(.*)$/d,code,mask))&&unread())
          throw sentenceDiagnostic(ctx.definitionKind==='function'?'「答えを もとめる」の 中では、「1秒ごとに、」も「1秒待つ。」も 使えません':ctx.definitionKind==='action'?`ここでは「ずっとくり返す。」の 中に、する ことと「${p[0].text}秒待つ。」を 書きます`:`${MEIJIN_ONLY_MESSAGE}。ふつうの 本文では「ずっとくり返す。」の 中に、する ことと「${p[0].text}秒待つ。」を 書きます`,line,[],{kind:'Forever'},'S317');
      }
      // 2秒かけて、ねこは、…: the time is written after who does it (ねこは、2秒かけて、…).
      if((p=surfaceCapture(/^([^、。\u0001]+?秒(?:間)?かけて)、?([^、。\u0001]+?)(?:は|が)、?(.+)$/d,code,mask))&&(p[1].text==='自分'||parts.some(c=>c.name===p[1].text.replace(/^【(.*)】$/,'$1')))&&unread()){
        const source=`${p[1].text}は、${p[0].text}、${p[2].text}`;
        throw sentenceDiagnostic(`「〇秒かけて、」は、だれが するかの あとに 書きます。れい：${canonicalStatementSource(source,symbols)}`,line,choice('時間を 主語の あとに 書く',source),{kind:'MotionCommand'});
      }
      // 前え10歩進む: the へ of a direction is written へ (a removed move form is written as today's).
      if((p=/(^|もし、?|[はが、])(前|後ろ|右|左|上|下)え(?=[0-9０-９（])/.exec(mask))&&!knownWords(symbols,ctx).some(name=>name.startsWith(p[2]+'え'))){
        const at=p.index+p[1].length+p[2].length,fixedCode=code.slice(0,at)+'へ'+code.slice(at+1),source=reads(fixedCode)?fixedCode:removedMoveGuidance(fixedCode)?.source||fixedCode;
        throw sentenceDiagnostic(`向きを いう「へ」は、「え」ではなく「へ」と 書きます。れい：${canonicalStatementSource(source,symbols)}`,line,choice('「へ」に する',source),{kind:'MotionCommand'});
      }
      // 10かいくり返す / 1分待つ / 1回転する / 2びょう話す: counts, times and turns take 回・秒・度.
      const unit=(pattern,message,label,to)=>{const m=surfaceCapture(pattern,code,mask);if(m&&unread())throw sentenceDiagnostic(message,line,choice(label,to(m.map(x=>x?.text??''))),{kind:'Sequence'});};
      unit(/^(.*?(?<![0-9０-９.．])[0-9０-９.．]+)(?:かい|カイ)(.*)$/d,'回数は「10回」のように「回」と 書きます','「回」と 書く',([a,b])=>a+'回'+b);
      unit(/^(.*?)(?<![0-9０-９.．])([0-9０-９.．]+)(?:ふん|分)(?:かん|間)?(待つ|まつ)$/d,'待つ 時間は 秒で 書きます。れい：60秒待つ','秒で 書く',([a,n])=>a+number(n)*60+'秒待つ');
      unit(/^(.*?)(?<![0-9０-９.．])([0-9０-９.．]+)回転(?:する)?$/d,'回る ときは「右に360度回る」のように 角度で 書きます','角度で 書く',([a,n])=>a+'右に'+number(n)*360+'度回る');
      unit(/^(.*?(?<![0-9０-９.．])[0-9０-９.．]+)(?:びょう|ビョウ)(?!(?:かん|間)?(?:待つ|まつ)$)(.*)$/d,'時間は「2秒」のように「秒」と 書きます','「秒」と 書く',([a,b])=>a+'秒'+b);
      // 2秒「こんにちは」と話す: the time comes after the words.
      if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)([0-9０-９.．]+)秒(?:間)?、?(\u0001+)と(?:話す|はなす|言う|いう)$/d,code,mask))&&unread()){
        const source=`${p[0].text}${p[2].text}と${p[1].text}秒話す`;
        throw sentenceDiagnostic(`話す 時間は、ことばの あとに 書きます。れい：${canonicalStatementSource(source,symbols)}`,line,choice('時間を あとに 書く',source),{kind:'Say'});
      }
      // 90度回る / くり返す / すがたをかえる / 音を止める / 10歩下がる / よりおおきい: the near sentence.
      if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)([^、。]+?)度(?:回る|まわる)$/d,code,mask))&&!/(?:右|左|みぎ|ひだり)(?:に|へ)/.test(p[1].text)&&unread())
        throw sentenceDiagnostic('回る 向きを「右に」か「左に」で 書きます',line,[...choice('右に 回る',`${p[0].text}右に${p[1].text}度回る`),...choice('左に 回る',`${p[0].text}左に${p[1].text}度回る`)],{kind:'MotionCommand'});
      if(/^(?:くり返す|繰り返す|くりかえす)$/.test(mask)&&unread())
        throw sentenceDiagnostic('何回 くり返すかを 書きます。れい：10回くり返す。ずっと くり返すときは「ずっとくり返す。」と 書きます',line,[...choice('10回 くり返す','10回くり返す'),...choice('ずっと くり返す','ずっとくり返す')],{kind:'RepeatCount'});
      // The message shows the sentence as the fix writes it.
      const near=(message,label,source,kind)=>{const fix=choice(label,source);throw sentenceDiagnostic(message.replace('〔文〕',fix[0]?.source||source),line,fix,{kind});};
      if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)すがたを(?:かえる|変える)$/d,code,mask))&&unread())
        near('どの すがたに するかを 書きます。つぎの すがたに する ときは「〔文〕」と 書きます','つぎの すがたに する',p[0].text+'つぎのすがたにかえる','LooksCommand');
      // 消える: a part hides itself; a copy is taken away.
      if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(?:消える|きえる)$/d,code,mask))&&unread())
        throw sentenceDiagnostic('見えなく する ときは「すがたをかくす」、コピーを 消す ときは「このコピーだけを消す」と 書きます',line,[...choice('すがたを かくす',p[0].text+'すがたをかくす')],{kind:'LooksCommand'});
      if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)音を(?:止める|とめる)$/d,code,mask))&&unread())
        near('鳴って いる 音を 止める ときは「〔文〕」と 書きます','すべての 音を 止める',p[0].text+'すべての音を止める','SoundCommand');
      if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)([0-9０-９.．]+)歩(?:下がる|さがる)$/d,code,mask))&&unread())
        near('後ろへ 動く ときは「〔文〕」と 書きます','後ろへ 動く',`${p[0].text}後ろへ${p[1].text}歩進む`,'MotionCommand');
      if(/より(?:おおきい|ちいさい)/.test(mask)&&unread()){
        const source=code.replace(/より(おおきい|ちいさい)/g,(all,word)=>word==='おおきい'?'より大きい':'より小さい');
        throw sentenceDiagnostic('くらべる ことばは「より大きい」「より小さい」と 書きます',line,choice('「大きい」「小さい」と 書く',source),{kind:'IfStatement'});
      }
      {const reversed=/^(もし、?)([^、。\u0001「」【】（）\s]{1,32}?)が答え(なら(?:ば)?|だったら|と同じ)/.exec(mask);
        if(reversed&&!knownName(reversed[2])&&!parts.some(c=>c.name===reversed[2])){
          const source=code.slice(0,reversed[1].length)+'「'+reversed[2]+'」'+code.slice(reversed[1].length+reversed[2].length);
          if(reads(source))throw sentenceDiagnostic('答えと くらべる ことばは「 」で かこみます。れい：もし「'+reversed[2]+'」が答えなら、',line,[{label:'「 」で かこむ',source:canonicalStatementSource(source,symbols)}],{kind:'IfStatement'});
        }}
      // もし答えがりんごなら (FM2-02): a word compared with 答え, or with a variable that holds text, is written in 「 」.
      // Read bare it is a name to make, and the program would never match. Both sides are names (at most 32 characters),
      // so the pattern looks no further: unbounded, a long line of が took seconds (language-boundaries, 45000 が).
      {const cmp=/^(もし、?)?([^、。\u0001【】（）\s]{1,32}?)が([^、。\u0001「」【】（）\s0-9０-９．.－\-＋+]{1,32}?)(なら|ならば|だったら|でなければ|じゃなかったら|と同じ|とちがう|と違う|になる)/.exec(mask);
        const variable=cmp&&[...(symbols?.project?.projectData?.variables||[]),...(symbols?.project?.components||[]).flatMap(c=>c.localData?.variables||[])].find(v=>v.name===cmp[2]);
        const answerStored=variable&&(symbols?.project?.scripts||[]).some(s=>{const source=surfaceMask(compactOutsideString(s.source||'')),name=nameSource(variable.name);return source.includes(name+'を答えにする')||source.includes('答えを'+name+'に入れる')||source.includes(name+'に答えを入れる');});
        const text=cmp&&(cmp[2]==='答え'||answerStored||(variable&&typeof variable.initialValue==='string'&&!/^－?-?[0-9０-９]+(?:[.．][0-9０-９]+)?$/.test(variable.initialValue)));
        const word=cmp?.[3];
        // A word of あかり there (タイマー, よこのばしょ) is a value, not a word to quote: only a bare unknown name is.
        const bareName=word&&(()=>{try{return ['VariableRead',...(!ctx.meijin?['PartRef']:[])].includes(parseExpression(word,symbols,ctx).kind);}catch(error){if(!(error instanceof AkariError))throw error;return /^[\p{L}ー]+$/u.test(word);}})();
        if(text&&bareName&&!dataNameKind(word,symbols,ctx)&&(!ctx.meijin||!(symbols?.project?.components||[]).some(c=>c.name===word))&&(!knownWords(symbols,ctx).includes(word)||(!ctx.meijin&&parts.some(c=>c.name===word)))&&!['空','空っぽ','からっぽ','カラッポ','偶数','奇数','コピー'].includes(word)){
          if(/[かと]/.test(word.slice(1,-1))&&!parts.some(c=>c.name===word))throw sentenceDiagnostic('くらべる ことばを「 」で かこみます。どちらかと くらべる ときは「もし答えが「りんご」と同じか、答えが「みかん」と同じなら、」のように 書きます',line,[],{kind:'IfStatement'});
          const at=(cmp[1]||'').length+cmp[2].length+1,source=code.slice(0,at)+'「'+word+'」'+code.slice(at+word.length);
          const fix=ctx.meijin?source:canonicalStatementSource(source,symbols),first=fix.split('\n')[0],example=first.includes('、')?first.slice(0,first.indexOf('、')+1):first;
          if(reads(source))throw sentenceDiagnostic(`${cmp[2]==='答え'?'答え':'文字'}と くらべる ことばは「 」で かこみます。れい：${example}`,line,[{label:'「 」で かこむ',source:fix}],{kind:'IfStatement'});
        }}
      // 前へ十歩進む / かばんの一番目 (FM2-03): numbers are written in digits, as 名人 says (一つ is a word, not a count).
      if(!ctx.meijin){const kanji=/[〇一二三四五六七八九十百千万]+(?:歩|秒|回|度|個|番目|点|つ)/g;
        for(const m of mask.matchAll(kanji)){
          if(/^一つ$/.test(m[0])||/[\p{Script=Han}]/u.test(mask[m.index-1]||'')||knownWords(symbols,ctx).some(name=>name.includes(m[0])))continue;
          const digits=meijinDigits(m[0]),source=code.slice(0,m.index)+digits+code.slice(m.index+m[0].length);
          throw sentenceDiagnostic(`「${m[0]}」は 漢数字です。数は「${digits}」のように 数字で 書きます`,line,reads(source)?[{label:'数字で 書く',source:canonicalStatementSource(source,symbols)}]:[],{kind:'Sequence'});
        }}
      // FM2-11: more near forms. Each is said only when the line reads with its fix, so a sentence that only looks like
      // one keeps its own message.
      const nearIf=(message,label,source,kind)=>{const fix=choice(label,source);if(fix.length)throw sentenceDiagnostic(message.replace('〔文〕',fix[0].source),line,fix,{kind});};
      // A part's place uses ところへ; a time after まで moves to the start of the action.
      if(!ctx.meijin&&(p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?(?:[^、。]+?秒(?:間)?かけて、?)?)(.+?)(?:のところまで|の(?:方|ほう)(?:へ|に)|まで|の所(?:へ|に))(?:、?(.+?)秒(?:間)?(?:かけて|で))?(?:行く|いく)$/d,code,mask))&&!/^(?:画面|いま|今)/.test(surfaceMask(p[1].text))&&unread()){
        const target=parts.some(c=>c.name===p[1].text)?'「'+p[1].text+'」':p[1].text;
        nearIf('キャラクターや 部品、マウスの ところへ 行く ときは「〔文〕」と 書きます','「ところへ行く」と 書く',p[0].text+(p[2]?p[2].text+'秒かけて、':'')+target+'のところへ行く','MotionCommand');
      }
      // ひだりへ10歩 / まえへ10歩: a direction is written in kanji (右・左・上・下・前・後ろ).
      {const KANA_DIRECTIONS={みぎ:'右',ひだり:'左',うえ:'上',した:'下',まえ:'前',うしろ:'後ろ'},kana=/(^|[、はが]|から)(みぎ|ひだり|うえ|した|まえ|うしろ)(?=(?:へ|に)[^、。]*(?:歩|度))/g;
        if(new RegExp(kana.source).test(mask)&&!knownWords(symbols,ctx).some(name=>Object.keys(KANA_DIRECTIONS).some(word=>name.startsWith(word)))&&unread()){
          let source='',at=0;for(const m of mask.matchAll(kana)){const from=m.index+m[1].length;source+=code.slice(at,from)+KANA_DIRECTIONS[m[2]];at=from+m[2].length;}source+=code.slice(at);
          if(!reads(source))source=removedMoveGuidance(source)?.source||source;
          const word=KANA_DIRECTIONS[new RegExp(kana.source).exec(mask)[2]];
          nearIf(`向きは「${word}${/(?:回る|まわる)$/.test(mask)?'に':'へ'}」のように 漢字で 書きます。れい：〔文〕`,'漢字で 書く',source,'MotionCommand');}}
      if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(右|左|上|下)(?:へ|に)(.+?)歩ずつ(?:動く|うごく)$/d,code,mask))&&unread())
        nearIf('画面の 向きへ 動く ときは「〔文〕」と 書きます','「いまのばしょから」 動く',p[0].text+'いまのばしょから、'+p[1].text+'へ'+p[2].text+'歩動く','MotionCommand');
      if(/(?:ど|ド)(?:回る|まわる)$/.test(mask)&&unread()){
        const source=code.replace(/(?:ど|ド)(回る|まわる)$/,'度$1');
        if(reads(source))nearIf('角度は「90度」のように「度」と 書きます。れい：〔文〕','「度」と 書く',source,'MotionCommand');
      }
      // FM2-05: 10歩ずつ進む / 右に90どまわる / 大きさを2倍にする / 1秒に10歩の速さで前へ動き続ける (no 〜あいだ).
      if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(?:(前|後ろ)(?:へ|に))?([0-9０-９.．]+)歩ずつ(?:進む|すすむ|動く|うごく)$/d,code,mask))&&unread())
        nearIf('前へ 動く ときは「〔文〕」のように 書きます','「前へ〇歩進む」と 書く',`${p[0].text}${p[1]?.text||'前'}へ${p[2].text}歩進む`,'MotionCommand');
      if((p=surfaceCapture(/^(.*?(?<![0-9０-９.．）])[0-9０-９.．）]+)(?:ど|ド)((?:まわる|回る|回って、.*|まわって、.*))$/d,code,mask))&&unread())
        nearIf('角度は「90度」のように「度」と 書きます。れい：〔文〕','「度」と 書く',p[0].text+'度'+p[1].text,'MotionCommand');
      if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)大きさを([0-9０-９.．]+)倍に(?:する|かえる)$/d,code,mask))&&unread())
        nearIf('大きさは「〔文〕」のように ％で 書きます','％で 書く',`${p[0].text}大きさを${Math.round(number(p[1].text)*100)}％にする`,'LooksCommand');
      if(!ctx.meijin&&/(?:動き続ける|動かし続ける|うごきつづける|動きつづける)$/.test(mask)&&!/(?:あいだ|間)、|まで/.test(mask)&&unread())
        throw sentenceDiagnostic('つづけて 動く ときは、はじめに「〜あいだ、」を 書きます。れい：「「右」キーがおされているあいだ、右へ1秒に200歩の速さで動き続ける」',line,[],{kind:'ContinuousRule'});
      // 「やった」としゃべる: speaking is 言う (話す with a time).
      if((p=surfaceCapture(/^(.*?と)((?:[0-9０-９.．]+秒(?:間)?)?)(?:しゃべる|喋る)$/d,code,mask))&&unread())
        nearIf('話す ときは「〔文〕」と 書きます',p[1].text?'「話す」と 書く':'「言う」と 書く',p[1].text?`${p[0].text}${p[1].text}話す`:`${p[0].text}言う`,'Say');
      // 止める alone: what stops is written (this flow, or the whole work).
      if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(?:止める|とめる|ストップする)$/d,code,mask))&&unread()){
        const choices=[...choice('この 動きを 止める',p[0].text+'この動きを止める'),...choice('作品を 全部 止める','作品を全部止める')];
        if(choices.length)throw sentenceDiagnostic('何を 止めるかを 書きます。この 本文の 動きを 止める ときは「この動きを止める」、作品の 動きを ぜんぶ 止める ときは「作品を全部止める」と 書きます',line,choices,{kind:'StopCommand'});
      }
      // 点数を1たす / 点数に1をたす / 点数から1ひく: a variable grows with ふやす and shrinks with へらす. Only a line that
      // ends so is looked at, and the name is at most 32 characters: a long line of を took seconds (language-boundaries).
      if(/(?:たす|足す|ひく|引く)$/.test(mask)&&(p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)([^、。\u0001]{1,32}?)(?:を|に)(.+?)(?:を)?(たす|足す|ひく|引く)$/d,code,mask))&&unread()){
        const up=/^(?:たす|足す)$/.test(p[3].text);
        nearIf(`へんすうの 数を ${up?'ふやす':'へらす'} ときは「〔文〕」と 書きます`,up?'「ふやす」と 書く':'「へらす」と 書く',`${p[0].text}${p[1].text}を${p[2].text}${up?'ふやす':'へらす'}`,'NumericUpdate');
      }
      if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)([^、。\u0001]+?)から(.+?)(?:を)?(ひく|引く)$/d,code,mask))&&unread())
        nearIf('へんすうの 数を へらす ときは「〔文〕」と 書きます','「へらす」と 書く',`${p[0].text}${p[1].text}を${p[2].text}へらす`,'NumericUpdate');
      // もし点数が10より大きい、 (なら left out) / もし「星」にふれていれば「いたい」と言う (、 left out).
      if((p=surfaceCapture(/^(もし、?.+?(?:より大きい|より小さい|以上|以下|と同じ|とちがう|と違う))、?$/d,code,mask))&&unread())
        nearIf('「もし」の きまりの おわりには「なら、」を 書きます。れい：〔文〕','「なら、」を 書く',p[0].text+'なら、','IfStatement');
      if((p=surfaceCapture(/^(もし、?[^、。]+?(?:れば|なら))(?!ば)([^、].*)$/d,code,mask))&&unread())
        nearIf('「もし…れば」「もし…なら」の あとには「、」を 書きます。れい：〔文〕','「、」を 書く',`${p[0].text}、${p[1].text}`,'IfStatement');
    }
    // ── Child wordings that are not read (final call 12). Each names the sentence that is written instead; a fix is
    // offered when the whole line reads with it.
    {
      const parts=symbols?.project?.components||[],part=name=>name==='自分'||parts.some(c=>c.name===name.replace(/^[「【](.*)[」】]$/,'$1'));
      const sound=name=>/^(?:音楽|音|おんがく|BGM)$/.test(name)||(symbols?.project?.sounds||[]).some(s=>s.name===name.replace(/^「(.*)」$/,'$1'))||/の音$/.test(name);
      // ねこが話し終わったら・話しおわってから / 「音楽」が鳴り終わったら・音楽がおわったら: what comes next is the next line.
      const after=surfaceCapture(/^(.+?)(?:が|は)、?((?:話し|はなし|言い|いい|鳴り|なり)?(?:終わ|おわ))(ったら|ってから|ったとき|ると|れば)、?(.*)$/d,code,mask);
      if(after&&!/[、。]/.test(surfaceMask(after[0].text))){
        const who=after[0].text,verb=after[1].text,written=code.slice(0,after[2].end);
        if(sound(who)&&!/^(?:話し|はなし|言い|いい)/.test(verb)){const name=who.replace(/の音$/,'').replace(/^「(.*)」$/,'$1');
          throw sentenceDiagnostic(`音が 鳴り終わってから する ときは、「「${/^(?:音楽|音|おんがく|BGM)$/.test(name)?'音楽':name}」を鳴らす。」の 次の 行に 書きます（「鳴らす」は 音が 鳴り終わるまで 待ちます）`,line,[],{kind:'SoundCommand'});}
        if(part(who)&&/^(?:話し|はなし|言い|いい)/.test(verb))
          throw sentenceDiagnostic(ctx.meijin?`名人の 本文では「${who}が話し終わるまで待つ。」と 書いてから、次の 文を 書きます`
            :`「${written}」は 読みません。話し終わってから する ときは、同じ 本文で「${who}は「…」と2秒話す。」の 次の 行に 書きます（時間を 書いて 話すと、話し終わるまで 待ちます）。ちがう 部品の 本文なら、話したあとで「「つぎ」の合図を送る。」と 書いて、「「つぎ」という合図を受けたとき、」で 始めます`,line,[],{kind:'Say'});
      }
      {const otherwise=otherwiseGuidance(code,mask,line);if(otherwise)throw otherwise;}
      // はいけいが「夜の森」にかわったとき、: the heading is はいけいがかわったとき、; the name is checked inside it.
      const backdrop=surfaceCapture(/^(?:はいけい|背景)が(.+?)に(?:かわった|変わった)(?:とき|ら)、?(.*)$/d,code,mask);
      if(backdrop){const name=/^「.*」$/.test(backdrop[0].text)?backdrop[0].text:'「'+backdrop[0].text+'」',source='はいけいがかわったとき、'+backdrop[1].text;
        throw sentenceDiagnostic(`はいけいの 名前で 分ける ときは、「はいけいがかわったとき、」の 中に「もし新しいはいけいの名前が${name}なら、」と 書きます`,line,!line.indent&&reads(source)?[{label:'「はいけいがかわったとき、」に する',source}]:[],{kind:'Script'});}
      // マウスのボタンをおしている: the button's state is マウスがおされている.
      if(/マウス(?:のボタン)?を(?:おし|押し)て|マウスのボタンが(?:おされ|押され)て/.test(mask)){
        const source=code.replace(/マウス(?:のボタン)?を(?:おし|押し)て|マウスのボタンが(?:おされ|押され)て/g,'マウスがおされて');
        throw sentenceDiagnostic('マウスの ボタンを おして いるかは「マウスがおされている」と 書きます',line,reads(source)?[{label:'「マウスがおされている」と 書く',source}]:[],{kind:'Condition'});
      }
      // 出てくる・あらわれて・かくれて・見えなくなる: a part shows or hides itself with すがたを見せる・すがたをかくす.
      const looks=[[/(?:あらわれ|現れ)て、/g,'すがたを見せて、','すがたを見せる'],[/(?:かくれ|隠れ)て、/g,'すがたをかくして、','すがたをかくす'],
        [/(?:出て|でて|やって)(?:きて、|きます$|くる$)/g,m=>m.endsWith('、')?'すがたを見せて、':'すがたを見せる','すがたを見せる'],[/(?<=^|[はが]、?)(?:出る|でる|出ます|でます)$/g,'すがたを見せる','すがたを見せる'],
        [/見えなく(?:なって、|して、|なる$|する$)/g,m=>m.endsWith('、')?'すがたをかくして、':'すがたをかくす','すがたをかくす'],[/見えるように(?:なって、|して、|なる$|する$)/g,m=>m.endsWith('、')?'すがたを見せて、':'すがたを見せる','すがたを見せる']];
      for(const [pattern,to,word] of looks){const m=new RegExp(pattern.source).exec(mask);if(!m)continue;
        let out='',at=0;for(const found of mask.matchAll(pattern)){out+=code.slice(at,found.index)+(typeof to==='function'?to(found[0]):to);at=found.index+found[0].length;}
        const source=out+code.slice(at);
        throw sentenceDiagnostic(`「${m[0].replace(/[、]$/,'')}」は「${word}」と 書きます`,line,reads(source)?[{label:`「${word}」と 書く`,source}]:[],{kind:'LooksCommand'});}
      // おにに・おにの: a part's name that ends with に or の is written in 「 」 where a part is named (ふれる 相手, 向く 相手).
      // The names and their patterns are made once per work (PERF-02); a line is looked at for a name it contains.
      const named=partNamePatterns(symbols);
      for(const {name:cName,pattern} of named.endingInParticle){
        const c={name:cName};
        if(!mask.includes(cName))continue;
        const at=mask.search(pattern);
        if(at<0)continue;
        const start=mask.indexOf(c.name,at),source=code.slice(0,start)+'「'+c.name+'」'+code.slice(start+c.name.length);
        if(reads(source))throw sentenceDiagnostic(`「${c.name}」のように「に」や「の」で おわる 部品の 名前は、ふれる 相手や 向く 相手には「「${c.name}」」、だれが するかには【${c.name}】と 書きます`,line,[{label:'「 」で かこむ',source}],{kind:'Sequence'});
      }
      // はし・はな・がまくん written bare before にふれ… (C-10): a name that begins like は or が is not read as the part;
      // in 「 」 it is. Said only when the line does not read as written and reads with the name in 「 」 (the line read
      // as written does not look again).
      for(const {name:cName,pattern} of bareNameLooking||!/に(?:ふれ|触れ)|の方を向|までのきょり|のところ(?:へ|に)/.test(mask)?[]:named.looking){
        const c={name:cName};
        if(!mask.includes(cName))continue;
        const at=mask.search(pattern);
        if(at<0)continue;
        const start=mask.indexOf(c.name,at),source=code.slice(0,start)+'「'+c.name+'」'+code.slice(start+c.name.length);
        let written;bareNameLooking=true;try{written=reads(code);}finally{bareNameLooking=false;}
        if(!written&&reads(source))throw sentenceDiagnostic(`部品の「${c.name}」は、${/のところ(?:へ|に)/.test(mask.slice(start))?'行く 先':'ふれる 相手や 向く 相手'}に する ときは「「${c.name}」」と「 」で かこんで 書きます`,line,[{label:'「 」で かこむ',source}],{kind:'Sequence'});
        break;
      }
    }
    // 書21: a removed move form (右へ10歩動く, よこ100歩、たて50歩のばしょへ行く, よこのばしょを10増やす …) names the form of today,
    // also as one 「〜して、」 of a longer sentence and after a lead word (そして) or an inline もし…なら、. The proposal
    // rewrites every such sentence of the chain, in the whole line; the message is the first one's.
    {
      // A lead word may come right before the old move (そのあと上へ5歩動く): the removed forms began with 上へ・下へ too.
      const leadOf=text=>LEAD_BEFORE.exec(text)?.[0]||new RegExp('^(?:'+LEAD_WORDS+')(?=(?:上|下)(?:へ|に)|よこ|たて|横|縦)').exec(text)?.[0]||'';
      const lead=leadOf(mask),inlineHead=/^(?:もし.+?(?:なら(?:ば)?|れば|えば|てば|たら)|そうでなければ|でなければ|それ以外なら|そうでないなら|そうでなかったら)、/.exec(mask.slice(lead.length))?.[0]||'';
      const clauses=[];let start=lead.length+inlineHead.length;
      for(let i=start;i<mask.length;i++){
        if(mask[i]!=='、')continue;
        const pair=GUIDED_TE_FORMS.find(([te])=>i-start>te.length&&mask.startsWith(te,i-te.length));
        if(pair){clauses.push({start,end:i,pair});start=i+1;}
      }
      clauses.push({start,end:code.length,pair:null});
      // 〜のところへ行く (from 〜の位置へ行って, R2-B-09) keeps its て-form too.
      const teForm={動く:'動いて',進む:'進んで',行く:'行って'};
      let first=null,example=null,whole=code;
      // From the last sentence to the first, so the places of the earlier ones still hold.
      for(const clause of [...clauses].reverse()){
        // そのあと上へ5歩動く: a lead word of a later sentence stays in front of it.
        clause.start+=leadOf(mask.slice(clause.start,clause.end)).length;
        const text=code.slice(clause.start,clause.end),plain=clause.pair?text.slice(0,-clause.pair[0].length)+(clause.pair[0]==='行って'||clause.pair[0]==='いって'&&/[へに]いって$/.test(text)?'行く':clause.pair[1]):text;
        const found=removedMoveGuidance(plain);
        if(!found)continue;
        first=found;example=null;
        let source=found.source,rewritten=null;
        // 画面の右へ10歩すべる: the verb is fixed first, then the move form.
        if(source&&!reads(source))source=removedMoveGuidance(source)?.source||source;
        if(source){
          rewritten=example=canonicalStatementSource(source,symbols);
          if(clause.pair){const verb=/(?:動く|進む|行く)$/.exec(rewritten);rewritten=verb?rewritten.slice(0,-2)+teForm[verb[0]]:null;}
        }
        whole=rewritten&&whole!==null?whole.slice(0,clause.start)+rewritten+whole.slice(clause.end):null;
      }
      // The example in the message is the sentence the rewrite writes (R2-B-11): no 読点 after the subject, 〇秒かけて,
      // and the unit on both ends of a どれか.
      const message=first&&first.source&&example?first.message.split('れい：'+first.source).join('れい：'+example.replace(/。$/,'')):first?.message;
      if(first)throw sentenceDiagnostic(message,line,whole&&reads(whole)?[{label:first.label||'書き方を なおす',source:whole}]:[],{kind:'MotionCommand'});
    }
    // いまのばしょから、右へ10歩、左へ5歩動く: one leg on each axis; two numbers on one axis add up to one leg.
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?(?:[^、。]+?秒(?:間)?かけて、?)?(?:いま|今)の(?:ばしょ|場所)から、?)(右|左|上|下)(?:へ|に)([0-9０-９]+)歩、?(右|左|上|下)(?:へ|に)([0-9０-９]+)歩(動く|うごく)$/d,code,mask))){
      const [head,w1,n1,w2,n2]=p.map(x=>x?.text),axis=word=>['右','左'].includes(word)?'x':'y',sign={右:1,上:1,左:-1,下:-1};
      if(axis(w1)===axis(w2)){const net=sign[w1]*Number(n1.replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)))+sign[w2]*Number(n2.replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)));
        const word=axis(w1)==='x'?(net<0?'左':'右'):(net<0?'下':'上'),source=`${head}${word}へ${Math.abs(net)}歩動く`;
        throw sentenceDiagnostic(`「右へ」「左へ」と「上へ」「下へ」は 1つずつ 書きます。ここでは「${canonicalStatementSource(source,symbols)}」と 同じです`,line,reads(source)?[{label:'1つに まとめる',source:canonicalStatementSource(source,symbols)}]:[],{kind:'MotionCommand'});}
    }
    // 横位置・よこの位置・縦位置 (and マウスの…) are written よこのばしょ・たてのばしょ, also inside （ ） (F2-01: the words
    // in 「 」 are hidden, the text in （ ） is looked at).
    const words=code.replace(/「[^」]*」/g,m=>'\u0001'.repeat(m.length));
    if(/(?:横|縦|よこ|たて)の?位置/.test(words)&&!knownWords(symbols,ctx).some(name=>name.includes('位置'))){
      let source='',at=0;
      for(const m of words.matchAll(/(横|縦|よこ|たて)の?位置/g)){source+=code.slice(at,m.index)+(/^(?:横|よこ)/.test(m[1])?'よこのばしょ':'たてのばしょ');at=m.index+m[0].length;}
      source+=code.slice(at);
      throw sentenceDiagnostic(`「位置」は 読みません。「${/^(?:横|よこ)/.test(/(横|縦|よこ|たて)の?位置/.exec(words)[1])?'よこのばしょ':'たてのばしょ'}」と 書きます`,line,reads(source)?[{label:'「ばしょ」と 書く',source:canonicalStatementSource(source,symbols)}]:[]);
    }
    // 位置 / マウスの位置 / 「星」の位置 as a value: the place has two numbers, よこのばしょ and たてのばしょ.
    if((p=/(?:^|[（、をがはにと])((?:(?:\u0001+|[^、。（）\u0001をがはにと]+?)の)?)位置(?=[）をがはの]|$|と|より|に)/.exec(words))&&!knownWords(symbols,ctx).some(name=>name.includes('位置'))){
      const at=p.index+p[0].length-p[1].length-2,of=code.slice(at,at+p[1].length),end=at+p[1].length+2;
      const choices=['よこ','たて'].map(axis=>({label:`「${axis}のばしょ」と 書く`,source:code.slice(0,at)+of+axis+'のばしょ'+code.slice(end)})).filter(c=>reads(c.source)).map(c=>({...c,source:canonicalStatementSource(c.source,symbols)}));
      throw sentenceDiagnostic(`「位置」は 読みません。「${of}よこのばしょ」か「${of}たてのばしょ」と 書きます`,line,choices,{kind:'Sequence'});
    }
    // ねこはおされたとき、 / もしねこは…なら、: inside 〜とき and もし the subject takes が.
    {const inner=actorNamePatterns(symbols).inner.exec(code);
      if(inner&&(inner[1]||/^(?:(?:押|お)され|クリックされ)/.test(inner[3]))){const proposal=(inner[1]||'')+inner[2]+'が'+code.slice(inner[0].length-inner[3].length);
        if(inner[1]?reads(proposal):true)throw sentenceDiagnostic(`${inner[1]?'「もし」の 中':'「〜とき」の 中'}では、だれの ことかを「${inner[2]}が」と 書きます`,line,reads(proposal)?[{label:`「${inner[2]}が」と 書く`,source:proposal}]:[],{kind:inner[1]?'IfStatement':'Script'});}}
    // A name with あかりの ことば in it (いのち, ちから, とくてん, 辺の数) is written in 【 】; written bare it is cut into other
    // words. The inputs of the work's procedures are names too (辺の数を6として、…).
    {const names=[...(symbols?.projectVars?.keys?.()||[]),...(symbols?.projectLists?.keys?.()||[]),...[...(symbols?.individualByTargetId?.values?.()||[])].flatMap(d=>[...(d.variables?.keys?.()||[]),...(d.lists?.keys?.()||[])]),...(ctx.localNames||[]),...(ctx.args||[]),
      ...[...(symbols?.actions?.values?.()||[]),...(symbols?.functions?.values?.()||[])].flatMap(d=>d?.args||[])];
      for(const name of [...new Set(names)].sort((a,b)=>b.length-a.length)){if(!nameSource(name).startsWith('【'))continue;const at=mask.indexOf(name);if(at<0)continue;
        // A name that is itself a word of あかり (大きさ, 向き): written bare it is that word (a notice tells of the data).
        if(RESERVED.has(name))continue;
        const bracketed=code.slice(0,at)+'【'+name+'】'+code.slice(at+name.length);
        // The message names the word of あかり inside the name (もちもの has の), so the child sees why.
        const inside=NAME_BREAKS.filter(word=>word.length&&name.includes(word)).sort((a,b)=>b.length-a.length)[0];
        if(reads(bracketed))throw sentenceDiagnostic(inside?`「${name}」には あかりの ことば「${inside}」が 入って いるので、【${name}】と【 】で かこんで 書きます`:`「${name}」のように あかりの ことばが 入った 名前は、【${name}】と【 】で かこんで 書きます`,line,[{label:'【 】で かこむ',source:canonicalStatementSource(bracketed,symbols)}]);}}
    const unquoted=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)([^\u0001、。]+?)と(?:([^、。\u0001]+?)秒(?:間)?)?(?:言う|いう|話す|はなす|言います|話します)$/d,code,mask);
    if(unquoted&&!knownName(unquoted[1].text)&&/^[\p{L}ー！？!?]+$/u.test(unquoted[1].text)){
      let state=false;try{state=parseExpression(unquoted[1].text,symbols,ctx).kind==='SensorRead';}catch(error){if(!(error instanceof AkariError))throw error;}
      const said=unquoted[1].text,seconds=unquoted[2]?.text;
      const proposals=[{label:'ことばを そのまま 言う',source:canonicalStatementSource(`${unquoted[0].text}「${said}」と${seconds?seconds+'秒話す':'言う'}`,symbols)}];
      if(state)proposals.push({label:'ようすの 中身を 言う',source:canonicalStatementSource(`${unquoted[0].text}${said}を${seconds?seconds+'秒話す':'言う'}`,symbols)});
      throw sentenceDiagnostic('言う ことは「「文字」と言う」、へんすうの 中身は「点数を言う」のように 書きます',line,proposals,{kind:'Say'});
    }
    for(const [pattern,build,message,label,kind,when] of [
      [/^((?:[^、。]+?は、?)?)(大きさ|音の大きさ|音量)を([0-9０-９.．]+)に(?:する|かえる|変える)$/d,p=>`${p[0]}${p[1]==='音量'?'音の大きさ':p[1]}を${p[2]}％にする`,'大きさは「％」を つけて 書きます','％を つける','LooksCommand',p=>!knownName(p[1])],
      [/^((?:[^、。]+?は、?)?)(右|左)に([0-9０-９.．]+)回る$/d,p=>`${p[0]}${p[1]}に${p[2]}度回る`,'回る 角度は「度」を つけて 書きます','度を つける','MotionCommand'],
      [/^((?:[^、。]+?は、?)?)([0-9０-９.．]+)(?:びょう|ビョウ)(?:かん|間)?(?:待つ|まつ)$/d,p=>`${p[0]}${p[1]}秒待つ`,'待つ 時間は「秒」と 書きます','秒と 書く','WaitTime'],
      [/^((?:[^、。]+?は、?)?)(前|後ろ)(?:へ|に)([0-9０-９.．]+)(?:進む|すすむ|動く|うごく)$/d,p=>`${p[0]}${p[1]}へ${p[2]}歩進む`,'動く ときは「歩」を つけて 書きます','歩を つける','MotionCommand'],
      [/^((?:[^、。]+?は、?)?)(?:向き|方向)を([0-9０-９.．]+)に(?:する|かえる|変える)$/d,p=>`${p[0]}向きを${p[1]}度にする`,'向きは「度」を つけて 書きます','度を つける','MotionCommand',()=>!knownName('向き')],
      [/^((?:[^、。]+?は、?)?)向きを「?(右|左|上|下)」?に(?:する|かえる|変える)$/d,p=>`${p[0]}画面の${p[1]}を向く`,'キャラクターの 向きを かえる ときは、「画面の右を向く」のように 書きます','向きを かえる','MotionCommand',()=>!knownName('向き')],
    ]){
      const parts=surfaceCapture(pattern,code);
      if(parts&&(!when||when(parts.map(part=>part?part.text:''))))throw fixed(message,build(parts.map(part=>part?part.text:'')),label,kind);
    }
    // 右に回る: the angle is needed.
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(右|左)に(?:回る|まわる)$/d,code,mask)))
      throw fixed('回る ときは、何度 回るかを 書きます',`${p[0].text}${p[1].text}に90度回る`,'90度 回る','MotionCommand');
    // 右に90度、1秒かけて回る: the time comes first, as in the other timed moves.
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)((?:右|左)(?:に|へ)[^、。]+?度|[^、。]+?度(?:右|左)(?:に|へ))、?([^、。]+?)秒(?:かけて|で)(?:回る|まわる)$/d,code,mask))){
      const source=`${p[0].text}${p[2].text}秒かけて、${p[1].text}回る`;
      if(reads(source))throw fixed('「〇秒かけて、」は 文の はじめに 書きます。れい：'+canonicalStatementSource(source,symbols),source,'時間を はじめに 書く','MotionCommand');
    }
    // 1秒まって / 10歩進んだ: an action is written 〜する.
    {const past=/(?:った|んだ|いた|いだ|した)$/.exec(mask);const te=past?code.slice(0,-past[0].length)+({った:'って',んだ:'んで',いた:'いて',いだ:'いで',した:'して'})[past[0]]:/(?:って|んで|いて|いで|して|えて|めて|げて|せて|れて|ねて|べて|けて)$/.test(mask)?code:null;
      if(te){const plain=sentenceInfinitive(te);if(plain&&plain!==te&&reads(plain))throw fixed(`${past?'これから する ことは':'文の おわりは'}「${canonicalStatementSource(plain,symbols)}」のように 書きます`,plain,'〜する に する');}}
    // 10歩進みません: what is not done is not written.
    if(/(?:みません|りません|きません|ちません|いません|えません|せません|べません|めません|れません|ぎません|びません)$/.test(mask)||(/しません$/.test(mask)&&!/^何もしません$/.test(mask)))
      throw sentenceDiagnostic('しない ことは 書けません。しない ときは その文を 書かないか、「何もしない」と 書きます',line,[]);
    // 点数を0にする、点数を1増やす: two actions are joined with 〜して、
    {const join=surfaceCapture(/^(.+?(?:する|す|る|く|う|つ|む|ぶ|ぐ))、(.+)$/d,code,mask);
      if(join){const pair=SENTENCE_TE_FORMS.find(([te,plain])=>join[0].text.endsWith(plain)&&te!=='して');const joined=pair?join[0].text.slice(0,-pair[1].length)+pair[0]+'、'+join[1].text:join[0].text.endsWith('する')?join[0].text.slice(0,-2)+'して、'+join[1].text:null;
        if(joined&&reads(joined))throw fixed('2つの ことを つづけて する ときは、「〜して、」で つなぎます',joined,'〜して、で つなぐ');}}
    // 「出発」の合図を送って、（全部）終わるまで待つ
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(.+?)の合図を送って、?(?:それが|みんなが)?(?:全部|ぜんぶ|すべて|みんな)?終わるまで待つ$/d,code,mask)))
      throw fixed('合図で 始まった ことが 終わるまで 待つ ときは、「その合図で始まったことが全部終わるまで待つ」と 書きます',`${p[0].text}${p[1].text}の合図を送って、その合図で始まったことが全部終わるまで待つ`,'終わるまで 待つ','BroadcastAndWait');
    // 「開始」と知らせ、受け手の処理が終わるまで待つ (an old form) / その合図で始まったことが終わるまで待つ (no 全部) /
    // ねこはその合図で…待つ (that line always waits with the whole flow).
    if((p=surfaceCapture(/^(.+?)と知らせ、受け手の処理が終わるまで待つ$/d,code,mask)))
      throw fixed('合図で 始まった ことが 終わるまで 待つ ときは、「その合図で始まったことが全部終わるまで待つ」と 書きます',`${p[0].text}の合図を送って、その合図で始まったことが全部終わるまで待つ`,'終わるまで 待つ','BroadcastAndWait');
    {const group=/^(?:(.+?)(?:は|が|も)、?)?その合図で始まったことが((?:全部|ぜんぶ|すべて)?)終わるまで待つ$/.exec(code),who=group?.[1];
      if(group&&(!group[2]||(who&&!EVERYONE_WORDS.includes(who))))
        throw sentenceDiagnostic(who&&!EVERYONE_WORDS.includes(who)?'この 文は、いつも みんなで 待ちます。だれが 待つかは 書かずに「その合図で始まったことが全部終わるまで待つ」と 書きます':'「その合図で始まったことが全部終わるまで待つ」と 書きます',line,[{label:'書きかえる',source:'その合図で始まったことが全部終わるまで待つ'}],{kind:'WaitBroadcastGroup'});}
    // ベルを鳴らす / スタートの合図を送る: a sound's or signal's name is written in 「 」.
    {const sound=/^(?:(.+?)は、?)?(.+?)(?:の音)?を(?:鳴らす|ならす|鳴らし始める|ならし始める|最後まで鳴らす)$/.exec(code),signal=/^(?:(.+?)は、?)?(.+?)の合図を送(?:る|って.+)$/.exec(code);
      const bare=name=>name&&!/^[「【（]/.test(name)&&(!dataNameKind(name,symbols,ctx)||(sound&&name===sound[2]&&Object.hasOwn(SOLFEGE_HZ,name)))&&/^[\p{L}ー0-9０-９]+$/u.test(name);
      // ドの音を鳴らす with no sound ド (final call 29): the check stops with the Hz guidance, and the unquoted form can be
      // written as the tone of that height (鳴らし始める keeps its verb).
      if(sound&&bare(sound[2])&&Object.hasOwn(SOLFEGE_HZ,sound[2])&&!(symbols?.project?.sounds||[]).some(s=>s.name===sound[2])){
        const hz=SOLFEGE_HZ[sound[2]],start=/始める$/.test(code),source=`${sound[1]?sound[1]+'は':''}${hz}Hzの音を0.5秒${start?'鳴らし始める':'鳴らす'}`;
        throw sentenceDiagnostic(solfegeMissingMessage(sound[2],dataNameKind(sound[2],symbols,ctx)),line,reads(source)?[{label:`${sound[2]}の 高さの 音を 鳴らす`,source:canonicalStatementSource(source,symbols)}]:[],{kind:'SoundCommand'});
      }
      // A sound of the work is named in 「 」, a ドレミ name too (LANGUAGE.md 音と待機: with a sound ド in the work,
      // ドの音を鳴らす is stopped and written 「ド」を鳴らす).
      if(sound&&bare(sound[2])&&(symbols?.project?.sounds||[]).some(s=>s.name===sound[2]))throw fixed('音の 名前は「 」で かこんで 書きます',code.replace(sound[2],'「'+sound[2]+'」'),'「 」で かこむ','SoundCommand');
      if(signal&&bare(signal[2]))throw fixed('合図の 名前は「 」で かこんで 書きます',code.replace(signal[2]+'の合図','「'+signal[2]+'」の合図'),'「 」で かこむ','Broadcast');}
    // ゴールに着いたら、: reaching a part is touching it, and 〜たら has the three meanings of 〜にふれたら (C-09): each time
    // (the heading, offered at the left margin of an ordinary body), now (もし…ていれば) or once by waiting (offered when
    // the action is on this line). With もし written, its meaning (now) comes first. A choice is offered only when it
    // reads. ねこがゴールに着いたら: ねこ is who touches (as in ふれたら); a 名人 text writes who touches in every form.
    // 画面の下に着いたら: one side of the screen is 画面の下のはし (C-touch-R2-06). A fix is offered only for a partner the
    // check knows (a part of the work, the mouse, an edge), so a rewrite never stops at the next check.
    const reached=text=>{const name=text.text.replace(/^「(.*)」$/,'$1'),parts=symbols?.project?.components||[];let phrase=null;
      const side=/^(?:画面の(上|下|右|左)(?:の(?:はし|端))?|(上|下|右|左)の(?:はし|端))$/.exec(name);
      if(/^(?:画面の)?(?:はし|端)$/.test(name))phrase={actor:null,target:'端'};
      else if(side&&!parts.some(c=>c.name===name))phrase={actor:null,target:'端:'+(side[1]||side[2])};
      else try{phrase=touchPhrase(text,symbols);}catch(error){if(!(error instanceof AkariError))throw error;}
      phrase||={actor:null,target:name};
      const known=isEdgeTarget(phrase.target)||phrase.target==='マウス'||parts.some(c=>c.name===phrase.target)||!symbols?.project;
      const target=touchShown(phrase.target),who=phrase.actor?.text||(ctx.meijin?parts.find(c=>c.name!==phrase.target)?.name||'ねこ':null);
      return {target,shown:(who?who+'が':'')+target,note:ctx.meijin&&!phrase.actor?'（名人の 本文では、だれが ふれるかを はじめに 書きます）':'',sure:known&&(!ctx.meijin||!!phrase.actor)};};
    if((p=surfaceCapture(/^(もし、?)?(.+?)に(?:着|つ)(?:いたら|くと|けば|いた(?:とき|時))、?(.*)$/d,code,mask))&&!/[、。]/.test(surfaceMask(p[1].text))){
      const {target,shown,note,sure}=reached(p[1]),rest=p[2].text;
      const each={label:'ふれる たびに する',source:`${shown}にふれたとき、${rest}`},now={label:'いま ふれて いるかを しらべる',source:`もし${shown}にふれていれば、${rest}`},
        wait=rest?{label:'ふれるまで 待つ',source:`${shown}にふれるまで待って、${rest}`}:null;
      const choices=(p[0]?[now,each,wait]:[each,now,wait]).filter(c=>c&&sure&&(c!==each||(!line.indent&&!ctx.meijin))&&reads(c.source));
      throw sentenceDiagnostic(`${target}に 着くのは、${target}に ふれる ことです。ふれる たびに するなら「${shown}にふれたとき、」、いま ふれて いるかを しらべるなら「もし${shown}にふれていれば、」、ふれるまで 待つなら「${shown}にふれるまで待つ」と 書きます${note}`,line,
        choices,{kind:'IfStatement',missing:['touchMeaning']});
    }
    // 「ゴール」に着くまで待つ / 着くまで、くり返す: the same touch, written ふれるまで.
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(.+?)に(?:着|つ)くまで(、?.*)$/d,code,mask))&&!/[、。]/.test(surfaceMask(p[1].text))){
      const {target,shown,note,sure}=reached(p[1]),source=p[0].text+shown+'にふれるまで'+p[2].text;
      throw sentenceDiagnostic(`${target}に 着くのは、${target}に ふれる ことです。「${shown}にふれるまで」と 書きます${note}`,line,sure&&reads(source)?[{label:'「ふれるまで」と 書く',source}]:[],{kind:'Condition'});
    }
    // 画面の外に出るまで、くり返す / 出るまで待つ: a part that went out touches the side it went out of.
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)画面の(?:外|そと)(?:へ|に)(?:出|で)るまで(、?.*)$/d,code,mask))){
      const source=p[0].text+'画面のはしにふれるまで'+p[1].text;
      throw sentenceDiagnostic('画面の 外に 出たかは、画面の はしに ふれたかで しらべます。「画面のはしにふれるまで」と 書きます（そのあと「すがたをかくす。」と 書くと、見えなくなります）',line,
        reads(source)?[{label:'画面の はしに ふれるまで',source}]:[],{kind:'Condition'});
    }
    // 画面の外へ出たら、: being out is touching the edge of the screen.
    if((p=surfaceCapture(/^(?:もし、?)?画面の(?:外|そと)(?:へ|に)(?:出|で)(?:たら|ると|れば|た(?:とき|時))、?(.*)$/d,code,mask))){
      const source='もし画面のはしにふれていれば、'+p[0].text;
      throw sentenceDiagnostic('画面の はしに 来たかを しらべる ときは「もし画面のはしにふれていれば、」と 書きます',line,
        reads(source)?[{label:'画面の はしに ふれて いるか しらべる',source:source}]:[],{kind:'IfStatement'});
    }
    // 画面の外へ出る: no sentence does that; the part moves past the edge and is hidden.
    if(/^(?:[^、。\u0001]+?は、?)?(?:[^、。]+?秒(?:かけて|で)、?)?画面の(?:外|そと)(?:へ|に)(?:出る|でる|出ます|でます|出ていく|でていく|出て行く|行く|いく|飛び出す|とび出す|とびだす)$/.test(mask))
      throw sentenceDiagnostic('画面の 外へ 出る 文は ありません。画面の はしの 外まで 動いてから、すがたを かくします。れい：「2秒かけて、いまのばしょから、右へ800歩動く。」と 書いて、次に「すがたをかくす。」と 書きます',line,[],{kind:'MotionCommand'});
    // 「いぬ」のところへ動く / 「いぬ」のところへ1秒かけて行く / 画面のまん中のところへ行く: the readable sentence, with the
    // fix when the place is a part, the mouse or a place of the screen.
    if(/のところ(?:へ|に)/.test(mask)&&(p=surfaceCapture(new RegExp('^((?:[^、。\\u0001]+?は、?)?)(?:(.+?)'+MOVE_TIME+'、?)?(.+?)のところ(?:へ|に)(?:、?(.+?)'+MOVE_TIME+')?('+[...MOVE_VERBS.here,...MOVE_VERBS.part].join('|')+')$','d'),code,mask))){
      const [who,before,target,after,verb]=p,name=target.text.replace(/^「(.*)」$/,'$1'),screen=screenPlaceSource(surfaceMask(target.text),symbols);
      // A place with 、 in it is a chain (1秒待って、「ロケット」のところへ…): its clauses are looked at one by one below.
      if(!/、/.test(surfaceMask(target.text))&&(screen||after||!MOVE_VERBS.part.includes(verb.text))){
        const found=partPlaceGuidance(target.text,(before||after)?.text,verb.text,!!after,symbols),source=who.text+found.source;
        const known=screen||name==='マウス'||symbols?.project?.components?.some(c=>c.name===name);
        throw sentenceDiagnostic(found.message,line,known&&reads(source)?[{label:found.label,source:canonicalStatementSource(source,symbols)}]:[],{kind:'MotionCommand'});
      }
    }
    // 画面のまん中へ行く / まん中へ行く / 画面のどこかへ行く (E2E-R2-13): a place of the screen is written from the bottom-left
    // corner, with the size of this work's screen (final call 3 keeps 画面のまん中 out of the language).
    if((p=surfaceCapture(new RegExp('^((?:[^、。\\u0001]+?は、?)?)(?:(.+?)'+MOVE_TIME+'、?)?(画面の(?:まん中|真ん中|まんなか|中央|中心|どこか)|まん中|真ん中|まんなか)(?:へ|に)(?:、?(.+?)'+MOVE_TIME+')?('+[...MOVE_VERBS.fixed,...MOVE_VERBS.here].join('|')+')$','d'),code,mask))){
      const [who,before,place,after]=p,screen=screenPlaceSource(surfaceMask(place.text.startsWith('画面の')?place.text:'画面の'+place.text),symbols),
        time=(before||after)?.text;
      // A part named まん中 is gone to as a part.
      if(!place.text.startsWith('画面の')&&symbols?.project?.components?.some(c=>c.name===place.text)){
        const source=who.text+(time?time+'秒かけて、':'')+'「'+place.text+'」のところへ行く';
        throw sentenceDiagnostic(`キャラクターや 部品の ところへ 行く ときは「「${place.text}」のところへ行く」と 書きます`,line,reads(source)?[{label:'「ところへ行く」と 書く',source:canonicalStatementSource(source,symbols)}]:[],{kind:'MotionCommand'});
      }
      if(screen){
        const source=who.text+(time?time+'秒かけて、':'')+screen.source;
        throw sentenceDiagnostic(`画面の ${screen.place}へ 行く ときは、画面の 左下の はしから 数えて「${screen.source}」と 書きます`,line,reads(source)?[{label:'決めた ばしょへ 行く',source:canonicalStatementSource(source,symbols)}]:[],{kind:'MotionCommand'});
      }
    }
    // 点数が10になったら、 (no もし): waiting or checking is not decided; 10歩進んだら、1秒待つ: an order is 「〜して、」.
    // The body is written below: the もし line is proposed here, and the wait (which takes the body out one level) is
    // added by the block reader, which sees the body's lines (CC-266).
    if(!/^もし/.test(mask)&&(p=surfaceCapture(/^(.+?)になったら、?$/d,code,mask))){
      const condition=becomesCondition(p[0].text,symbols,ctx);
      throw Object.assign(sentenceDiagnostic(becomesMessage(p[0].text,symbols,ctx),line,condition?[{label:'いま そう なって いたら する',source:'もし'+formatCondition(condition,'if')+'、'}]:[],{kind:'IfStatement',missing:['mode']}),
        condition?{untilSource:formatCondition(condition,'until')+'待つ。'}:{});
    }
    {const after=/^(?!もし)([^、。]+?)(んだら|ったら|いたら|いだら|したら|えたら|けたら|めたら|れたら|せたら|ねたら|てたら)、(.+)$/.exec(mask);
      if(after){const head=code.slice(0,after[1].length),rest=code.slice(after[1].length+after[2].length+1),te=head+after[2].replace(/たら$/,'て').replace(/だら$/,'で')+'、'+rest;
        if(reads(te))throw fixed(ctx.meijin?'「〜したら、」は 読みません。じゅんに する ときは「〜して、」で つなぎます。そう なるのを 待つ ときは「〜になったら、」と 書きます':'「〜たら」は「もし」の 文で 使います。じゅんに する ときは「〜して、」で つなぎます',te,'「〜して、」で つなぐ','Sequence');}}
    // A 「〜して、」 chain that does not read (R2-B-04): each clause is looked at on its own, in its own words, as a sentence
    // of its own would be; a fix for a clause is offered for the whole line, the clause keeping its て-form.
    // Only the clause forms whose line-wide checks would point the wrong way are looked at (ゆっくり, a time after the
    // angle or the place, a place written 〜の位置へ: R2-B-09), so an ordinary chain is read once (PERF-02).
    if(!chainLooking&&mask.includes('、')&&/ゆっくり|度、?[^、。]*?秒(?:間)?(?:かけて|で)|のところ(?:へ|に)、?[^、。]*?秒(?:間)?(?:かけて|で)|の(?:位置|場所|ばしょ)(?:へ|に)(?:行っ|いっ|行き|いき)/.test(mask)){
      const clauses=[];let start=0;
      for(let i=0;i<mask.length;i++){
        if(mask[i]!=='、')continue;
        const head=mask.slice(start,i),pair=SENTENCE_TE_FORMS.find(([te])=>head.length>te.length&&head.endsWith(te));
        if(!pair||/(?:を(?:わたし|渡し)て|として)$/.test(head)||new RegExp('^(?:'+LEAD_WORDS+')$').test(head)||/(?:たずねて|聞いて|きいて)$/.test(head))continue;
        clauses.push({start,end:i,pair});start=i+1;
      }
      let whole=null;
      if(clauses.length&&start<code.length){chainLooking=true;try{whole=reads(code);}finally{chainLooking=false;}}
      if(clauses.length&&start<code.length&&!whole){
        clauses.push({start,end:code.length,pair:null});
        const dictionary=(text,pair)=>pair[0]==='行って'&&!/(?:手順|てじゅん)を行って$/.test(text)?text.slice(0,-3)+'行く':pair[0]==='いって'&&/[へに]いって$/.test(text)?text.slice(0,-3)+'いく':text.slice(0,-pair[0].length)+pair[1];
        const teOf=text=>/行く$/.test(text)?text.slice(0,-2)+'行って':/いく$/.test(text)?text.slice(0,-2)+'いって':(()=>{const back=SENTENCE_TE_FORMS.find(([,plain])=>text.endsWith(plain));return back?text.slice(0,-back[1].length)+back[0]:null;})();
        for(const clause of clauses){
          const text=code.slice(clause.start,clause.end),plain=clause.pair?dictionary(text,clause.pair):text;
          const part=surfaceLineSlice(line,clause.start,clause.end,plain);part.indent=line.indent;
          let found=null;chainLooking=true;
          try{diagnoseSentenceIntent(part,symbols,ctx);}catch(error){if(!(error instanceof AkariError))throw error;found=error;}finally{chainLooking=false;}
          if(!found||found.code!=='P205')continue;
          const fix=found.proposals?.[0],rewritten=fix?(clause.pair?teOf(fix.source):fix.source):null,source=rewritten?code.slice(0,clause.start)+rewritten+code.slice(clause.end):null;
          throw sentenceDiagnostic(found.message,line,source&&reads(source)?[{label:fix.label,source}]:[],found.draftRole||null);
        }
      }
    }
    // Connected sentences have already been diagnosed one clause at a time above. Directions in separate
    // moves do not count as repeated axes of a single move, even when a later clause is unreadable.
    if(!SENTENCE_TE_FORMS.some(([te])=>mask.includes(te+'、')||mask.includes(te+'から'))&&
      (mask.match(/(?:右|左|上|下)(?:へ|に)[^、]*?歩/g)||[]).length>2)
      throw sentenceDiagnostic('「右へ」「左へ」と「上へ」「下へ」を 1つずつ 書きます。れい：'+MOVE_EXAMPLE_HERE,line,[],{kind:'MotionCommand'});
    if(/^(?:[^、。\u0001]+?は、?)?(?:いま|今)の(?:ばしょ|場所)から/.test(mask)&&/ゆっくり/.test(mask)&&!/秒(?:間)?(?:かけて|で)/.test(mask)){
      const plain=code.replace(/ゆっくり(?:と)?、?/,''),who=/^(?:[^、。\u0001]+?は、?)/.exec(surfaceMask(plain))?.[0]||'',slow=plain.slice(0,who.length)+'1秒かけて、'+plain.slice(who.length);
      if(reads(slow))throw fixed('ゆっくり 動くときは、「'+canonicalStatementSource(slow,symbols)+'」のように かける 時間を 書きます',slow,'時間を かけて 動く','MotionCommand');
    }
    // ゆっくり10歩進む (ゆっくり10 was read as a name): slowly is a time to take.
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(?:(前|後ろ|右|左|上|下)(?:へ|に))?ゆっくり(?:と)?(?:(前|後ろ|右|左|上|下)(?:へ|に))?([0-9０-９.．]+)歩(?:進む|すすむ|動く|うごく|歩く|あるく)$/d,code,mask))){
      const way=p[1]?.text||p[2]?.text||'前',facing=['前','後ろ'].includes(way),slow=`${p[0].text}1秒かけて、${facing?'':'いまのばしょから、'}${way}へ${p[3].text}歩${way==='前'?'進む':'動く'}`;
      throw fixed(`ゆっくり 動く ときは、「${canonicalStatementSource(slow,symbols)}」のように かける 時間を 書きます`,slow,'時間を かけて 動く','MotionCommand');
    }
    // ゆっくりいまのばしょから、… / ゆっくり「ロケット」のところへ行く / ゆっくり右に90度回る: the same, with the time first.
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)ゆっくり(?:と)?、?(.+)$/d,code,mask))&&!/秒(?:かけて|で)/.test(surfaceMask(p[1].text))&&
      /(?:動く|うごく|進む|すすむ|歩く|あるく|行く|いく|回る|まわる)$/.test(mask)&&reads(p[0].text+'1秒かけて、'+p[1].text)){
      // The example is the child's own sentence with the time, so it names the kind of move that was written.
      const slow=p[0].text+'1秒かけて、'+p[1].text,turn=/(?:回る|まわる)$/.test(mask);
      throw fixed(`ゆっくり ${turn?'回る':'動く'} ときは、「${canonicalStatementSource(slow,symbols)}」のように かける 時間を 書きます`,slow,turn?'時間を かけて 回る':'時間を かけて 動く','MotionCommand');
    }
    // 2秒かけてゆっくり10歩動く / ゆっくり1秒待つ: the time already says how slowly; ゆっくり is not written.
    if((p=surfaceCapture(/^(.*?)ゆっくり(?:と)?、?(.*(?:秒|歩).*)$/d,code,mask))&&/(?:秒かけて|秒(?:間)?(?:待つ|まつ)$)/.test(surfaceMask(code))&&reads(p[0].text+p[1].text))
      throw fixed('かける 時間を 書いた ときは、「ゆっくり」は 書きません',p[0].text+p[1].text,'「ゆっくり」を けす','MotionCommand');
    // ねこ1秒待つ / ねこ10歩進む (no は): a part's name followed by a number was read as one name 「ねこ1」.
    {const part=actorNamePatterns(symbols).partNames.find(name=>code.startsWith(name)&&/^[0-9０-９]/.test(code.slice(name.length)));
      const digits=part&&/^[0-9０-９]+/.exec(code.slice(part.length))[0];
      if(part&&!dataNameKind(part+digits,symbols,ctx)&&reads(part+'は'+code.slice(part.length)))
        throw fixed(`だれが するかを 書く ときは、名前の あとに「は」を 書きます。れい：${part}は…`,part+'は'+code.slice(part.length),'「は」を 書く','Sequence');}
    // 全部1秒待つ / 全員が1秒待つ: the whole flow's wait has no subject (or みんなは).
    if((p=surfaceCapture(/^(?:全部|ぜんぶ|全員|すべて)(?:が|は|で|も)?、?(.+(?:待つ|まつ))$/d,code,mask))&&reads(p[0].text))
      throw fixed('みんなで 待つ ときは、「みんなは1秒待つ」か「1秒待つ」と 書きます',p[0].text,'みんなで 待つ','WaitTime');
    // 「ベル」を鳴らし、終わるまで待つ (an old form): 鳴らす itself waits until the sound ends.
    if(/終わるまで待つ$/.test(mask)&&(p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(.+?)を(.*?)鳴らし(?:て)?、?(?:鳴り)?終わるまで待つ$/d,code,mask)))
      throw fixed('「鳴らす」は、音が 終わるまで 待ちます',`${p[0].text}${p[1].text}を${p[2].text}鳴らす`,'鳴らして 待つ','SoundCommand');
    // 10歩進みました: what to do is written as 〜する or 〜します.
    if(/ました$/.test(mask))throw sentenceDiagnostic('これから する ことは「進む」「進みます」のように 書きます',line,[{label:'「ます」に する',source:canonicalStatementSource(code.slice(0,-3)+'ます',symbols)}]);
    // 大きさを10増やす: the size is set as a percentage.
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(大きさ|音の大きさ)を([0-9０-９.．]+)％?(増やす|ふやす|減らす|へらす)$/d,code,mask))&&!knownName(p[1].text)){
      const sign=/増|ふ/.test(p[3].text)?'＋':'－';
      throw fixed(`${p[1].text}は「${p[1].text}を120％にする」のように、何％に するかを 書きます`,`${p[0].text}${p[1].text}を（${p[1].text}${sign}${p[2].text}）％にする`,'計算して かえる',p[1].text==='大きさ'?'LooksCommand':'SoundCommand');
    }
    // 「点数は」と点数を言う: things said together are joined, two or more of them (E2E-R2-09: 「点数は」と点数と「点」), with
    // or without a 、 before the time or the verb. The items are kept as written; a rewrite is offered only when it reads.
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(\u0001+と[^、。]+?)を(つなげて)?、?(?:([^、。\u0001]+?)秒(?:間)?)?(つなげて)?、?(?:言う|いう|話す|はなす)$/d,code,mask))&&p[1].text.startsWith('「')
      &&(p[3]||!(p[2]||p[4])||mask.includes('、'))){
      // With a time (〜をつなげて2秒話す), the joined text is said for that time: the message names that sentence.
      const timed=`${p[0].text}（${p[1].text}をつなげた文字）を${p[3]?.text}秒話す`,plain=`${p[0].text}${p[1].text}をつなげて言う`;
      if(p[3]&&reads(timed))throw fixed(`時間を つけて 話す ときは「${canonicalStatementSource(timed,symbols)}」と 書きます`,timed,'時間を つけて 話す','Say');
      if(!p[3]&&reads(plain))throw fixed('いくつかを ならべて 言う ときは、「つなげて言う」と 書きます',plain,'つなげて 言う','Say');
    }
    // もしねこがおされたら: a click starts with its own heading.
    if((p=surfaceCapture(/^もし、?(.+?)が(?:おされ|押され|クリックされ)(?:たら|ていれば|ているなら|れば|ると|てたら)、?$/d,code,mask))){
      const who=p[0].text.replace(/^「(.*)」$/,'$1');
      if(symbols?.project?.components?.some(c=>c.name===who))throw sentenceDiagnostic(`「${who}」が おされた ときに 動かす ときは、「${who}がおされたとき、」で 始めます`,line,[{label:'おされた ときに 動かす',source:`${who}がおされたとき、`}],{kind:'IfStatement'});
    }
    // もしマウスがクリックされたら / もしマウスをクリックしたら (FM2-06): whether the button is held is
    // マウスがおされている; each press of a part is its おされたとき heading.
    if((p=surfaceCapture(/^もし、?「?マウス」?(?:(?:のボタン)?が(?:おされ|押され|クリックされ)(?:たら|ると|てたら)|(?:のボタン)?を(?:おし|押し|クリックし)(?:たら|ていたら|てたら|ていれば))、?(.*)$/d,code,mask))){
      const source='もしマウスがおされていれば、'+p[0].text;
      throw sentenceDiagnostic('マウスの ボタンを おして いるかは「もしマウスがおされていれば、」で しらべます。部品が おされる たびに する ときは「おされたとき、」の 本文に 書きます',line,reads(source)?[{label:'「マウスがおされている」と 書く',source:canonicalStatementSource(source,symbols)}]:[],{kind:'IfStatement'});
    }
    // もし点数が10をこえたら: こえる is より大きい (FM2-06).
    if((p=surfaceCapture(/^もし、?(.+?)が(.+?)を(?:こえ|超え|越え)(?:たら|ていれば|ているなら|れば|ると|てたら|るなら)、?(.*)$/d,code,mask))){
      const source=`もし${p[0].text}が${p[1].text}より大きいなら、${p[2].text}`;
      throw sentenceDiagnostic(`「こえる」は「より大きい」と 書きます。れい：${canonicalStatementSource(source,symbols).split('\n')[0]}`,line,reads(source)?[{label:'「より大きい」と 書く',source:canonicalStatementSource(source,symbols)}]:[],{kind:'IfStatement'});
    }
    if(skipRest)throw sentenceDiagnostic('この回の のこりを とばして 次の回へ 進む ときは、「この回の残りをとばして、次の回へ進む」と 書きます',line,[{label:'この回の のこりを とばして 次の回へ',source:code.slice(0,skipRest[1]?.length||0)+'この回の残りをとばして、次の回へ進む'}],{kind:'Continue'});
    if((p=surfaceCapture(/^(.+?)キーを(?:おして|押して)いる(?:あいだ|間)、(.+?)は(.+?)歩(?:動く|うごく)$/d,code,mask))){
      const key=p[0].text.startsWith('「')?p[0].text:`「${p[0].text}」`,actor=p[1].text,distance=p[2].text;
      throw sentenceDiagnostic('キーを おして いる あいだに 動く 歩数が、ぜんぶで 何歩なのか、1秒に 何歩なのか 分かりません。えらんで ください',line,[
        {label:`おす たびに ぜんぶで ${distance}歩`,source:`${key}キーをおすたびに、${actor}は、前へ${distance}歩進む`},
        {label:`おしている あいだ、1秒に ${distance}歩`,source:`${key}キーがおされているあいだ、${actor}は前へ1秒に${distance}歩の速さで動き続ける`},
      ],{kind:'ContinuousRule',missing:['distanceOrSpeed']});
    }
    if((p=surfaceCapture(/^もし(.+で)、(.+)か、(.+なら)、?$/d,code,mask))){
      const a=parseCondition(p[0].text,symbols,ctx,'and'),b=parseCondition(p[1].text,symbols,ctx,'plain'),c=parseCondition(p[2].text,symbols,ctx,'if');
      const logical=(op,left,right)=>exprNode('LogicalExpression',{op,left,right}),render=n=>'もし条件（'+formatExpression(n)+'）が成り立つなら、';
      throw sentenceDiagnostic('「両方」と「どちらか」の まとまりが 分かりません。どちらの 意味か えらんで ください',line,[
        {label:'前の 2つが 両方、または さいごの 1つ',source:render(logical('OR',logical('AND',a,b),c))},
        {label:'1つ目と、「後ろの 2つの どちらか」の 両方',source:render(logical('AND',a,logical('OR',b,c)))},
      ],{kind:'LogicalExpression',missing:['grouping']});
    }
    if((p=surfaceCapture(/^(.+?)になったら、(.+)$/d,code,mask))){
      let raw=p[0].text;
      if(!/(?:以上|以下|より大きい|より小さい|と同じ|とちがう|と違う)$/.test(surfaceMask(raw)))raw+='と同じ';
      const condition=parseCondition(raw,symbols,ctx,'plain'),body=p[1].text,indent='';
      // The wait is the one the message names (点数が10になるまで待つ): when it is so already, it does not wait. With もし
      // the message names the two readings meant, not the 名人 heading (「もし…になったとき、」 is none).
      const written=p[0].text.replace(/^もし、?/,'');
      throw sentenceDiagnostic(written===p[0].text?becomesMessage(written,symbols,ctx):becomesIfMessage(written,symbols,ctx),line,[
        {label:'いま そう なって いたら する',source:`もし${formatCondition(condition,'if')}、${body}`},
        {label:'そう なるのを 待ってから する',source:`${formatCondition(condition,'until')}待つ。\n${indent}${body}`},
      ],{kind:'Condition',missing:['stateOrTransition']});
    }
    if((p=surfaceCapture(/^(それ|これ|あれ|その子)を(.+(?:動かす|うごかす))$/d,code,mask))){
      const names=(symbols?.project?.components||[]).map(component=>component.name);
      throw sentenceDiagnostic('「それ」などでは、だれを 動かすのか 分かりません。動かす キャラクターの 名前を えらんで ください',line,names.map(name=>({label:`${name}を 動かす`,source:canonicalStatementSource(`${nameSource(name)}を${p[1].text}`,symbols)})),{kind:'MotionCommand',missing:['actorRef']});
    }
    if((p=surfaceCapture(/^(右|左)に曲がる$/d,code,mask))&&previousLine?.code&&nextLine){
      const count=surfaceCapture(/^(.+)回(?:くり返す|繰り返す|くりかえす)$/d,nextLine.code);
      const choices=count&&repeatChoiceSources(source,previousLine,line,nextLine,`${p[0].text}に〔角度をえらぶ〕度回る`);
      if(choices){const error=sentenceDiagnostic('前の 文と 回る 文の、どこまでを くり返すのか 分かりません。えらんで ください',line,[],{kind:'RepeatCount',missing:['scope','angle']});error.proposals=choices;throw error;}
    }
  }
