  // ────────────────────────────────────────────────────────────────────────
  // 09 — Editor search hints and input assistance
  // ────────────────────────────────────────────────────────────────────────
  function hintSchemaId(id) {
    const prefix = id.split(':')[0];
    return ({read:'VariableRead',set:'Assignment',assignList:'Assignment',add:'NumericUpdate:ADD',
      subtract:'NumericUpdate:SUB',append:'ListAppend',insert:'ListInsert',replace:'ListReplace',
      delete:'ListDelete',clear:'ListClear',each:'ForEach',action:'UserActionCall',function:'UserFunctionCall',return:'ReturnStatement',localScalar:'LocalVariableDeclaration',localList:'LocalListDeclaration'})[prefix] || id;
  }
  function matchesSearch(text, query) {
    return searchQueryVariants(query).some(q => normalizeSearchText(text).includes(normalizeSearchText(q)) || searchReading(text).includes(searchReading(q)));
  }
  // The other forms of a verb find its block too (E-13): ふれた・ふれて・ふれたら・ふれない・ふれます → ふれる,
  // まわった → まわる, and ふれる also finds the forms that keep its stem (ふれている). A stem keeps at least two kana, so
  // short words such as した (下) stay as they are.
  const SEARCH_A_TO_U = Object.freeze({ わ:'う', か:'く', が:'ぐ', さ:'す', た:'つ', な:'ぬ', ば:'ぶ', ま:'む', ら:'る' });
  const SEARCH_I_TO_U = Object.freeze({ い:'う', き:'く', ぎ:'ぐ', し:'す', ち:'つ', に:'ぬ', び:'ぶ', み:'む', り:'る' });
  function searchVerbForms(word) {
    const out = [], add = (stem, ...endings) => { if ([...stem].length >= 2) for (const ending of endings) out.push(stem + ending); };
    const s = word.replace(/([ただ])ら$/, '$1');
    let m;
    if ((m = s.match(/^(.+)っ[たて]$/))) add(m[1], 'る', 'う', 'つ');
    else if ((m = s.match(/^(.+)ん[だで]$/))) add(m[1], 'む', 'ぶ', 'ぬ');
    else if ((m = s.match(/^(.+)い[たて]$/))) add(m[1], 'く'), add(m[1] + 'い', 'る');
    else if ((m = s.match(/^(.+)い[だで]$/))) add(m[1], 'ぐ');
    else if ((m = s.match(/^(.+)し[たて]$/))) add(m[1], 'す'), add(m[1] + 'し', 'る');
    else if ((m = s.match(/^(.+)[たて]$/))) add(m[1], 'る');
    // A noun made from a verb (くりかえし, うごき) finds the verb (くりかえす, うごく).
    if ([...word].length >= 3 && SEARCH_I_TO_U[word.slice(-1)]) add(word.slice(0, -1), SEARCH_I_TO_U[word.slice(-1)]);
    if ((m = word.match(/^(.+)ない$/))) {
      const last = m[1].slice(-1);
      if (SEARCH_A_TO_U[last]) add(m[1].slice(0, -1), SEARCH_A_TO_U[last]);
      add(m[1], 'る');
    }
    if ((m = word.match(/^(.+)ま(?:す|した|せん)$/))) {
      const last = m[1].slice(-1);
      if (SEARCH_I_TO_U[last]) add(m[1].slice(0, -1), SEARCH_I_TO_U[last]);
      add(m[1], 'る');
    }
    // A verb like ふれる・かくれる・とめる (its stem ends in an -i or -e sound) also finds the forms that keep the stem:
    // ふれる finds ふれている. A stem like うご (動く) would find every 動き block, so other verbs do not.
    for (const form of [word, ...out]) if (/[いきしちにひみりぎじびぴえけせてねへめれげぜでべぺ]る$/.test(form)) add(form.slice(0, -1), '');
    return [...new Set(out)];
  }
  // A child searches with what they want: 少し待つ, みんなで待つ, ねこだけ待つ, 待ちたい, 止めたい, ぜんぶけす, スペース, ゆっくり.
  const SEARCH_QUERY_VARIANT_CACHE=new Map();
  function searchQueryVariants(query, {condition=false} = {}) {
    const q = normalizeSearchText(query), out = new Set([q]);
    const cacheKey=(condition?'condition:':'action:')+q;if(SEARCH_QUERY_VARIANT_CACHE.has(cacheKey))return SEARCH_QUERY_VARIANT_CACHE.get(cacheKey);
    const t = q.replace(/^(?:もう)?(?:もっと|少し|すこし|ちょっと|しばらく|みんなで|みんなは|みんなが|全体で)/, '').replace(/^.+?だけ(?=.)/, '').replace(/^(?:ゲーム|げーむ)(?=しゅうりょう)/,'');
    out.add(t);
    const wishes = {ちたい:['つ'],きたい:['く'],したい:['す'],みたい:['む','る'],りたい:['る'],いたい:['う'],びたい:['ぶ'],ぎたい:['ぐ'],
      めたい:['める'],えたい:['える'],せたい:['せる'],れたい:['れる'],げたい:['げる'],べたい:['べる'],けたい:['ける']};
    for (const [wish, endings] of Object.entries(wishes)) if (t.endsWith(wish)) for (const ending of endings) out.add(t.slice(0, -wish.length) + ending);
    // Search-only endings. None of these are added to the sentence reader's forms.
    const endings=[
      [/(.+)(?:たいです|たいな)$/,m=>[m[1]+'たい']],
      [/(.+?)(?:しなさい|しろ|せよ|しましょう|しよう|したい)$/,m=>[m[1]+'する']],
      [/(.+?)([いきぎしちにびみり])(?:ます|ました|なさい|ましょう|な)$/,m=>[m[1]+SEARCH_I_TO_U[m[2]],m[1]+m[2]+'る']],
      [/(.+?[えけげせぜてでねへべめれ])(?:ます|ました|なさい|よう|たい|た)$/,m=>[m[1]+'る']],
      [/(.+?)(?:行っ[たて])$/,m=>[m[1]+'行く']], [/(.+?)いっ[たて]$/,m=>[m[1]+'いく']],
      [/(.+?)([わかがさたなばまら])せ(?:る|た|て)$/,m=>[m[1]+SEARCH_A_TO_U[m[2]]]],
      [/(.+?[えけげせぜてでねへべめれ])させる$/,m=>[m[1]+'る']], [/(.+?)させる$/,m=>[m[1]+'する']],
      [/(.+?)(て|で)(?:くださいね|ください|ほしい|くれ|おいて|おく|ね|よ|いる|てね|て|る)$/,m=>[m[1]+m[2]]],
      [/(.+?)(?:ちゃった|ちゃう|ちゃえ)$/,m=>[m[1]+'て']], [/(.+?)(?:じゃった|じゃう|じゃえ)$/,m=>[m[1]+'で']],
      [/(.+?)(?:といて|とく)$/,m=>[m[1]+'て']], [/(.+?)(?:どいて|どく)$/,m=>[m[1]+'で']],
      [/(.+?)まして$/,m=>[m[1]+'ます']], [/(.+?)まーす$/,m=>[m[1]+'ます']],
      [/(.+?)(?:こと|の|ぞ|よ|ね|ー)$/,m=>[m[1]]], [/(.+?[うくぐすつぬぶむる])(?:んだ|んです)$/,m=>[m[1]]],
      [/(.+?)った$/,m=>['る','う','つ'].map(x=>m[1]+x)], [/(.+?)んだ$/,m=>['む','ぶ','ぬ'].map(x=>m[1]+x)],
      [/(.+?)いた$/,m=>[m[1]+'く']], [/(.+?)いだ$/,m=>[m[1]+'ぐ']], [/(.+?)した$/,m=>[m[1]+'す',m[1]+'する']],
      [/(.+?)([えけげせぜてでねへべめれ])$/,m=>[m[1]+'うくぐすずつづぬふぶむる'['えけげせぜてでねへべめれ'.indexOf(m[2])]]],
      [/(.+?)ろ$/,m=>[m[1]+'る']], [/(.+?)([おこごそとどのほぼもろ])う$/,m=>[m[1]+'うくぐすつづぬふぶむる'['おこごそとどのほぼもろ'.indexOf(m[2])]]],
      [/(.+?)に(?:決める|きめる|設定する|せっていする|セットする|せっとする|変更する|へんこうする)$/,m=>[m[1]+'にする']],
      [/(.+?)のとこ(?:へ|に|まで)$/,m=>[m[1]+'のところへ']],
      [/(.+?)(?:の場合(?:は|には)?|のばあい(?:は|には)?|だと|だったなら|だったとしたら|だとしたら)、?$/,m=>[m[1]+'なら、'],true],
      [/(.+?)(?:じゃなければ|じゃなかったら|じゃないなら)$/,m=>[m[1]+'でなければ'],true],
      [/(.+?)(?:うちは|かぎり|の間は|間は)$/,m=>[m[1]+'あいだ'],true],
      [/(.+?)てなければ$/,m=>[m[1]+'ていなければ'],true], [/(.+?)てるなら$/,m=>[m[1]+'ているなら'],true],
      [/(.+?)くなったら$/,m=>[m[1]+'かったら'],true], [/(.+?)のとき(?:は)?$/,m=>[m[1]+'なら'],true],
      [/(.+?)(?:でかつ|でさらに|かつ|そして)$/,m=>[m[1]+'で'],true], [/(.+?)(?:または|もしくは)$/,m=>[m[1]+'か'],true],
      [/(.+?)てるあいだ$/,m=>[m[1]+'ているあいだ'],true], [/(.+?)てないあいだ$/,m=>[m[1]+'ていないあいだ'],true],
      [/(.+?)ふれなければ$/,m=>[m[1]+'ふれていなければ'],true], [/(.+?)ふれないあいだ$/,m=>[m[1]+'ふれていないあいだ'],true],
      [/(.+?)いとき(?:は)?$/,m=>[m[1]+'いなら'],true], [/(.+?)じゃないとき$/,m=>[m[1]+'でなければ'],true],
      [/(.+?)がいれば$/,m=>[m[1]+'があれば'],true],
      [/(.+?)おおきければ$/,m=>[m[1]+'大きければ'],true], [/(.+?)ちいさければ$/,m=>[m[1]+'小さければ'],true],
      [/(.+?)るのを(?:待つ|まつ|待ちます)$/,m=>[m[1]+'るまで待つ']],
      [/(.+?)るのを待って$/,m=>[m[1]+'るまで待って']],
    ];
    for(let pass=0;pass<2;pass++)for(const form of [...out]){
      for(const [pattern,replace,onlyCondition] of endings){if(onlyCondition&&!condition)continue;const m=pattern.exec(form);if(m)for(const v of replace(m))if(v)out.add(v);}
      for(const [te,word]of SENTENCE_TE_FORMS)if(form.endsWith(te))out.add(form.slice(0,-te.length)+word);
      if(form.endsWith('して'))out.add(form.slice(0,-2)+'す'),out.add(form.slice(0,-2)+'する');
    }
    for (const form of searchVerbForms(t)) out.add(form);
    let written = t;
    for (const [word, key] of [['すぺーすきー','空白'],['すぺーす','空白'],['えんたー','決定'],['りたーん','決定'],['えすけーぷ','取消'],['ぜんぶ','全部'],['すべて','全部'],['けす','消す']])
      written = written.split(word).join(key);
    out.add(written);
    if (t.includes('ゆっくり')) out.add('かけて');
    const variants=[...out].filter(Boolean);if(SEARCH_QUERY_VARIANT_CACHE.size>=2000)SEARCH_QUERY_VARIANT_CACHE.clear();SEARCH_QUERY_VARIANT_CACHE.set(cacheKey,variants);return variants;
  }
  function configureSearchNode(node, intent) {
    if (!intent || node.schemaId !== intent.schemaId) return node;
    // いまのばしょから動く starts as 右へ10歩: the leg moves to the axis of the direction asked for.
    if (intent.direction && node.schemaId === 'MotionCommand:MOVE_BY') {
      const vertical = ['up', 'down'].includes(intent.direction);
      if (vertical && node.inputs.x) { node.inputs.y = node.inputs.x; delete node.inputs.x; }
      node.fields[vertical ? 'yDir' : 'xDir'] = intent.direction;
    } else if (intent.direction) node.fields.direction = intent.direction;
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
  // 書ける ことば finds a sentence by the same words as its block (F2-11): ランダム finds 1から2のどれか.
  function hintSearchSynonyms(id) {
    const schemaId = hintSchemaId(id), builtin = /^builtin:(.+)$/.exec(schemaId);
    return (builtin ? BLOCK_SEARCH_SYNONYMS['BuiltinCall:' + builtin[1]] : BLOCK_SEARCH_SYNONYMS[schemaId]) || [];
  }
  function searchHintCandidates(candidates, query, project, context = {}) {
    if (!query.trim()) return candidates;
    const intent = searchIntent(query), matched = candidates.filter(h => intent
      ? (h.binding && matchesSearch(h.binding.name, query)) || hintSchemaId(h.id) === intent.schemaId
      : matchesSearch(h.text + ' ' + h.category + ' ' + h.searchTerms.join(' ') + ' ' + hintSearchSynonyms(h.id).join(' '), query));
    return matched.map(h => {
      if (!intent || !project) return h;
      try { const node = nodeForSearchHint(h, project, context, intent);
        return {...h, text:formatScript({kind:'Script',body:[blockDecode(node)]},{symbols:buildSymbols(project)})};
      } catch (_) { return h; }
    }).sort((a,b) => Number(!!b.binding) - Number(!!a.binding) || holdFirst(b.id, query) - holdFirst(a.id, query));
  }
  // The keys a child names in a search, by the names the code writes (「スペース」キー, 「エンター」キー).
  const SEARCH_KEYS = Object.freeze({ すぺーす: '空白', えんたー: '決定', りたーん: '決定', えすけーぷ: '取消' });
  function searchKey(query) {
    const q = normalizeSearchText(query).replace(/[「」]/g, '').replace(/きー$/, '');
    return Object.hasOwn(SEARCH_KEYS, q) ? SEARCH_KEYS[q] : null;
  }
  // 〜キーがおされるまで待つ／くり返す (what it repeats stays to be chosen) and 〜キーがおされている, with the key.
  function keyedSearchCandidate(schemaId, key, project) {
    const schema = BLOCK_SCHEMA_BY_ID.get(schemaId);
    if (!schema) return null;
    const sensorOnly = schemaId === 'SensorRead:KEY_DOWN', node = createBlock(schemaId, { draft: !sensorOnly, allowHoles: true, idPrefix: 'search-key' }),
      sensor = sensorOnly ? node : createBlock('SensorRead:KEY_DOWN', { idPrefix: 'search-key-sensor' });
    sensor.inputs.arg.fields.value = key;
    if (!sensorOnly) { sensor.id = node.inputs.condition.id; node.inputs.condition = sensor; }
    let text = '';
    try {
      // The first line is the block's words; what it repeats is still to be chosen, so the copy written here has 何もしない.
      const written = structuredClone(node);
      for (const key of Object.keys(written.bodies || {})) written.bodies[key] = [createBlock('NoOperation', { idPrefix: 'search-key-text' })];
      const decoded = blockDecode(written), symbols = project ? buildSymbols(project) : undefined;
      text = (sensorOnly ? formatExpression(decoded) : formatScript({ kind: 'Script', body: [decoded] }, { symbols })).split(/\n/)[0];
    } catch (_) { /* The face says what it is. */ }
    return { ...schema, candidateNode: node, candidateKey: 'key:' + key + ':' + schemaId, ...(text ? { searchLabel: text, searchCaption: true } : {}) };
  }
  // Holding a key to move (C-16 with B-09): the continuous rule is taught first, so for the words of holding and of
  // moving on at a speed its sentence and its block come before the repeat while a key is held.
  const HOLD_SEARCH_WORDS = ['おしているあいだ', 'おしている間', 'おされているあいだ', 'おされている間', 'おしっぱなし', 'おしつづける',
    '動き続ける', 'うごきつづける', 'つづけて動く', '速さ'];
  function holdFirst(id, query) {
    if (hintSchemaId(id) !== 'ContinuousRule') return 0;
    const q = normalizeSearchText(query);
    return Number(HOLD_SEARCH_WORDS.some(word => { const w = normalizeSearchText(word); return q.includes(w) || (q.length >= 4 && w.includes(q)); }));
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
    // The block of the intent comes first, set as asked; the blocks the words name stay after it (E-13: 小さい finds より小さい too).
    for (const schema of schemas) {
      if (boundSchemas.has(schema.id)) continue;
      const intended = intent && schema.id === intent.schemaId;
      if (!intended && !matchesSearch(blockPaletteSearchText(schema), query)) continue;
      const configured = intended && (intent.direction || intent.scale !== undefined || intent.index !== undefined);
      out.push(configured ? {...schema, candidateNode:configureSearchNode(createBlock(schema.id, {
        draft:schema.inputs.some(s=>s.type==='target'), allowHoles:true}), intent)} : schema);
    }
    // よく使う blocks first, then the ones whose name starts with the word (or has it right after a particle): まつ
    // finds 秒待つ before …まで待つ (E-13). The order is otherwise kept.
    const words = searchQueryVariants(query).map(searchReading).filter(word => [...word].length >= 2 || word === searchReading(query));
    const marks = ['を', 'に', 'の', 'で', 'と', 'へ', 'が', 'は', 'て', '、', '・', 'びょう', 'かい', 'ばんめ'];
    const wordStart = schema => {
      const names = [schema.searchLabel, schema.label].filter(Boolean).map(searchReading);
      if (words.some(word => names.some(name => name.startsWith(word)))) return 0;
      return words.some(word => names.some(name => marks.some(mark => name.includes(mark + word)))) ? 1 : 2;
    };
    // How the word is found in the block's own words (its name, its search words, a bound name): 0 a whole word, 1 the
    // start of a word, 2 only inside another word (てん in かいてん, ど in いどう, かく in かくす) or only in the words
    // a whole family of blocks shares (線をかく・スタンプをおす for every ペン block). 2 comes after every other block
    // (E-13). A verb written whole (かく, おす) is not the start of a longer one.
    const kana = /[ぁ-ゟ゠-ヿ]/, verb = /[うくぐすつぬぶむる]$/, particles = marks.slice(0, 11);
    const found = (text, word) => {
      if (text === word) return 0;
      for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1)) {
        const before = text.slice(0, at), after = text[at + word.length];
        if ((!before || !/[\p{L}ー]$/u.test(before) || particles.some(mark => before.endsWith(mark))) && !(verb.test(word) && after && kana.test(after))) return 1;
      }
      return 2;
    };
    const quality = schema => {
      const own = [schema.searchLabel, schema.label, schema.binding?.name,
        ...((BLOCK_SEARCH_SYNONYMS[schema.id] || BLOCK_SEARCH_SYNONYMS[schema.kind]) || [])].filter(Boolean).map(searchReading);
      return Math.min(2, ...words.flatMap(word => own.map(text => found(text, word))));
    };
    const rank = schema => { if (intent && schema.id === intent.schemaId) return -1; const q = quality(schema); if(searchReading(query)==='ひく'&&['NumericUpdate:SUB','BinaryExpression:SUB'].includes(schema.id))return -1;return (q === 2 ? 60 : 0) + (BASIC_BLOCK_SCHEMA_IDS.has(schema.id) ? 0 : 30) + (q ? 10 : 0) + wordStart(schema); };
    out.splice(0, out.length, ...out.map((schema, i) => ({ schema, i, r: rank(schema) })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.schema));
    // A key named in the search (スペース, エンター …): the blocks that wait for it, repeat until it is pressed and read it
    // come first, with that key (F2-11).
    const key = searchKey(query);
    if (key) {
      const keyed = ['WaitUntil', 'RepeatUntil', 'SensorRead:KEY_DOWN'].map(id => keyedSearchCandidate(id, key, project)).filter(Boolean);
      out.splice(0, out.length, ...keyed, ...out.filter(s => !keyed.some(k => k.id === s.id)));
    }
    // The continuous rule is no statement: search finds it too, and the palette puts it in the body's rules.
    const rule = BLOCK_SCHEMA_BY_ID.get('ContinuousRule');
    if (rule && matchesSearch(blockPaletteSearchText(rule), query)) out.splice(holdFirst(rule.id, query) ? 0 : out.length, 0, rule);
    return out;
  }

  // The words a child uses for what a block does find it too (E-13): くらべる, ランダム, まわす, やめる, へる, クリック …
  const BLOCK_SEARCH_SYNONYMS = Object.freeze({
    "MotionCommand:MOVE_BY": [
      "動く",
      "うごく",
      "移動",
      "ばしょ",
      "いまのばしょ",
      "右へ",
      "左へ",
      "上へ",
      "下へ",
      "みぎ",
      "ひだり",
      "うえ",
      "した",
      "歩く",
      "ずらす",
      "なめらかに動く",
      "時間をかける",
      "おちる",
      "落ちる",
      "さがる",
      "のぼる",
      "ゆっくり",
      "ジャンプ",
      "とぶ",
      "とびはねる",
      "ずれる"
    ],
    "ListInsert": [
      "挿入",
      "そうにゅう",
      "途中に入れる",
      "番号の前に入れる",
      "わりこませる",
      "わりこむ",
      "割り込む",
      "つっこむ",
      "突っ込む",
      "おく",
      "置く"
    ],
    "MotionCommand:MOVE": [
      "進む",
      "すすむ",
      "前へ",
      "後ろへ",
      "まっすぐ",
      "歩く",
      "あるく",
      "動く",
      "うごく",
      "移動",
      "走る",
      "はしる",
      "前進",
      "ぜんしん",
      "ダッシュ",
      "すすめる",
      "進める"
    ],
    "MotionCommand:GOTO": [
      "行く",
      "いく",
      "ばしょ",
      "場所へ行く",
      "決めたばしょ",
      "座標",
      "移動",
      "左下のはし",
      "もどる",
      "戻る"
    ],
    "MotionCommand:GOTO_PART": [
      "ところへ行く",
      "行く",
      "いく",
      "マウス",
      "追いかける",
      "ついていく",
      "近づく",
      "ばしょ",
      "移動",
      "ワープ",
      "近よる",
      "近寄る",
      "ちかよる",
      "くっつく",
      "めざす",
      "目指す",
      "おいつく",
      "追いつく"
    ],
    "MotionCommand:TURN_RIGHT": [
      "右回り",
      "右へ回る",
      "回る",
      "まわる",
      "回す",
      "まわす",
      "向きを変える",
      "回転",
      "曲がる",
      "まがる",
      "ターン",
      "ひねる"
    ],
    "MotionCommand:TURN_LEFT": [
      "左回り",
      "左へ回る",
      "回る",
      "まわる",
      "回す",
      "まわす",
      "向きを変える",
      "回転",
      "曲がる",
      "まがる",
      "ターン",
      "ひねる"
    ],
    "MotionCommand:BOUNCE": [
      "はね返る",
      "はねかえる",
      "はねる",
      "かべ",
      "ぶつかる",
      "反対に動く",
      "はね返す",
      "はねかえす",
      "はずむ",
      "バウンド"
    ],
    "CompareExpression": [
      "くらべる",
      "比べる"
    ],
    "CompareExpression:GTE": [
      "くらべる",
      "比べる",
      "いじょう",
      "と同じか より大きい",
      "と同じかより大きい"
    ],
    "CompareExpression:LTE": [
      "くらべる",
      "比べる",
      "いか",
      "と同じか より小さい",
      "と同じかより小さい"
    ],
    "BuiltinCall:乱数": [
      "ランダム",
      "でたらめ",
      "さいころ"
    ],
    "LooksCommand:SHOW": [
      "見せる",
      "表示",
      "出す",
      "でてくる",
      "出てくる",
      "あらわれる",
      "みえる",
      "登場",
      "出現",
      "あらわす",
      "現す"
    ],
    "LooksCommand:HIDE": [
      "隠す",
      "かくす",
      "非表示",
      "きえる",
      "消える",
      "かくれる",
      "みえなくする",
      "消す",
      "けす",
      "見えないように",
      "表示しない",
      "退場",
      "透明",
      "みえなくなる"
    ],
    "LooksCommand:SET_COSTUME": [
      "きがえる",
      "みため",
      "見た目",
      "変身",
      "へんしん",
      "コスチューム",
      "ポーズ",
      "衣装"
    ],
    "LooksCommand:SET_TARGET_TEXT": [
      "出す",
      "書く",
      "表示",
      "文字",
      "点数",
      "テキスト",
      "ラベル"
    ],
    "StopCommand:ALL": [
      "とめる",
      "止める",
      "とまる",
      "止まる",
      "やめる",
      "ストップ",
      "おわる",
      "おわり",
      "おしまい",
      "ゲームオーバー",
      "終了",
      "終わらせる",
      "おわらせる",
      "ゲームストップ",
      "みんな",
      "全員",
      "ぜんぶやめる",
      "しゅうりょう"
    ],
    "StopCommand:THIS": [
      "とめる",
      "止める",
      "とまる",
      "止まる",
      "やめる",
      "ストップ",
      "スクリプト",
      "プログラム",
      "本文"
    ],
    "StopCommand:OTHERS": [
      "とめる",
      "止める",
      "とまる",
      "止まる",
      "やめる",
      "ストップ",
      "ほかの部品",
      "ほかの部品の動き",
      "自分以外",
      "じぶんいがい"
    ],
    "Break": [
      "やめる",
      "ぬける",
      "おわる",
      "くり返しをやめる",
      "くり返しを止める",
      "くり返しを終わる",
      "くり返しから出る",
      "ループから出る",
      "ループを止める",
      "ループをやめる",
      "ループを終える",
      "ぬけ出す",
      "抜ける",
      "ブレイク"
    ],
    "PenCommand:DOWN": [
      "せん",
      "線",
      "かく",
      "えがく",
      "ペンを下げる",
      "ペンをさげる",
      "ペンをつける",
      "ペンをおく",
      "ペンを置く",
      "ペンを下におく",
      "ペンを紙につける",
      "線を描く",
      "線をひく",
      "線を引く",
      "線をかく",
      "線を書く",
      "かきはじめる",
      "書き始める",
      "書きはじめる",
      "絵をかく",
      "お絵かき",
      "ペンダウン",
      "ペンおろす",
      "ペン下ろす",
      "ペンON",
      "ペンオン",
      "描き始める",
      "描きはじめる",
      "ペンをおとす",
      "ペンを落とす",
      "引き始める",
      "ひきはじめる"
    ],
    "PenCommand:SET_SIZE": [
      "太く",
      "ふとく",
      "細く",
      "ほそく",
      "太い",
      "ふとい",
      "細い",
      "ほそい",
      "ペンを太く",
      "ペンを細く",
      "線を太く",
      "線を細く",
      "線の太さ",
      "ペンのサイズ",
      "ペンの大きさ",
      "太い線",
      "細い線",
      "ふとい線"
    ],
    "LooksCommand:SET_SCALE": [
      "大きさ",
      "おおきさ",
      "サイズ"
    ],
    "Say": [
      "話す",
      "言う",
      "いう",
      "はなす",
      "しゃべる",
      "発言",
      "こんにちは",
      "秒",
      "ひょうじ",
      "発表",
      "はっぴょう",
      "せりふ",
      "ふきだし",
      "こえ",
      "考える",
      "かんがえる",
      "思う",
      "おもう",
      "さけぶ",
      "叫ぶ",
      "つぶやく",
      "語る",
      "あいさつ",
      "話しかける",
      "おしゃべり",
      "返事",
      "声を出す",
      "声に出す",
      "メッセージを出す",
      "つたえる",
      "伝える",
      "見せる",
      "文字を出す",
      "どなる",
      "怒鳴る",
      "答える",
      "こたえる",
      "歌う",
      "うたう",
      "つげる",
      "告げる",
      "口に出す",
      "口にだす"
    ],
    "Ask": [
      "質問",
      "たずねる",
      "答え",
      "きく",
      "聞く",
      "しつもん",
      "もんだい",
      "問題",
      "クイズ",
      "問いかける"
    ],
    "WaitTime": [
      "待つ",
      "まつ",
      "時間",
      "秒"
    ],
    "WaitUntil": [
      "スペース",
      "スペースキー",
      "エンター",
      "エンターキー",
      "キー",
      "おすまで待つ",
      "おすまでまつ",
      "キーを待つ",
      "キーをまつ"
    ],
    "RepeatUntil": [
      "スペース",
      "スペースキー",
      "エンター",
      "エンターキー",
      "キー"
    ],
    "IfStatement": [
      "もし",
      "条件",
      "なら",
      "分かれ道"
    ],
    "RepeatCount": [
      "くり返す",
      "繰り返す",
      "何度も",
      "回数",
      "ループ",
      "リピート",
      "何回も"
    ],
    "UserActionCall": [
      "動作",
      "手順",
      "呼び出す",
      "実行"
    ],
    "UserFunctionCall": [
      "計算",
      "答え",
      "関数",
      "値を求める"
    ],
    "Assignment": [
      "変数",
      "記録",
      "代入",
      "値を入れる",
      "もどす",
      "戻す",
      "セット",
      "設定",
      "変更",
      "決める",
      "きめる",
      "リセット",
      "初期化",
      "クリア",
      "保存"
    ],
    "NumericUpdate:ADD": [
      "増やす",
      "ふやす",
      "増える",
      "ふえる",
      "足す",
      "たす",
      "プラス",
      "数える",
      "かぞえる",
      "点数",
      "スコア",
      "あげる",
      "上げる",
      "アップ",
      "加える",
      "くわえる",
      "加算",
      "増し",
      "多くする",
      "おおくする",
      "カウント",
      "追加",
      "増加",
      "ぞうか",
      "増す"
    ],
    "NumericUpdate:SUB": [
      "減らす",
      "へらす",
      "減る",
      "へる",
      "引く",
      "ひく",
      "マイナス",
      "点数",
      "スコア",
      "少なくする",
      "すくなくする",
      "さげる",
      "下げる",
      "ダウン",
      "減少",
      "げんしょう",
      "けずる",
      "削る"
    ],
    "VariableRead": [
      "変数",
      "値",
      "読む",
      "スコア"
    ],
    "Broadcast": [
      "合図",
      "メッセージ",
      "知らせる",
      "しらせる",
      "つたえる",
      "サイン"
    ],
    "BroadcastAndWait": [
      "合図",
      "メッセージ",
      "知らせる",
      "しらせる",
      "つたえる"
    ],
    "SoundCommand:TONE_WAIT": [
      "ドレミ",
      "ド",
      "レ",
      "ミ",
      "ファ",
      "ソ",
      "ラ",
      "シ",
      "メロディー",
      "ピアノ",
      "音の高さ",
      "鳴る",
      "音楽",
      "ヘルツ",
      "流す",
      "再生",
      "音を出す",
      "ピー",
      "ピッ",
      "ビープ"
    ],
    "SoundCommand:TONE": [
      "ドレミ",
      "ド",
      "レ",
      "ミ",
      "ファ",
      "ソ",
      "ラ",
      "シ",
      "メロディー",
      "ピアノ",
      "音の高さ",
      "鳴る",
      "音楽"
    ],
    "SoundCommand:SAMPLE_WAIT": [
      "鳴る",
      "音楽",
      "流す",
      "ながす",
      "再生",
      "プレイ",
      "音を出す",
      "音がする",
      "聞かせる",
      "きかせる"
    ],
    "SoundCommand:SAMPLE": [
      "鳴る",
      "音楽",
      "スタート",
      "鳴り始める",
      "流し始める"
    ],
    "SensorRead:マウスが押されている": [
      "クリック",
      "タッチ",
      "おす",
      "押す"
    ],
    "EventCount:click": [
      "クリック",
      "タッチ",
      "おす",
      "押す"
    ],
    "SensorRead:KEY_DOWN": [
      "おす",
      "押す",
      "キー",
      "スペース",
      "スペースキー",
      "エンター",
      "エンターキー",
      "やじるし"
    ],
    "SensorRead:押されたキー": [
      "キー"
    ],
    "ContinuousRule": [
      "おしているあいだ",
      "おしている間",
      "おしっぱなし",
      "おしつづける",
      "キーをおしているあいだ",
      "つづけて動く",
      "動き続ける",
      "はやく",
      "はやい",
      "進み続ける",
      "すすみつづける"
    ],
    "RepeatWhile": [
      "おしているあいだ",
      "おしっぱなし",
      "あいだ",
      "間"
    ],
    "SensorRead:TOUCHING": [
      "ふれる",
      "ふれたら",
      "ふれたとき",
      "さわる",
      "さわったら",
      "あたる",
      "当たる",
      "ぶつかる",
      "かさなる",
      "はし",
      "タッチ",
      "かべ"
    ],
    "StopCommand:OWN_OTHERS": [
      "止める",
      "とめる",
      "とまる",
      "止まる",
      "やめる",
      "自分だけ",
      "ほかの動き",
      "ストップ"
    ],
    "MotionCommand:POINT_TO": [
      "向きをかえる",
      "向きを変える",
      "向かう",
      "見る",
      "見つめる",
      "みつめる"
    ],
    "LooksCommand:SET_COLOR": [
      "色をかえる",
      "色を変える",
      "そめる",
      "染める",
      "ぬる",
      "塗る",
      "色の効果",
      "ぬりかえる",
      "塗り替える"
    ],
    "LooksCommand:FRONT": [
      "最前面",
      "前面",
      "前に出る",
      "前に出す",
      "前に来る",
      "前にくる",
      "最前列",
      "さいぜんれつ"
    ],
    "LooksCommand:BACK": [
      "最背面",
      "背面"
    ],
    "LooksCommand:SET_BACKDROP": [
      "うしろの絵",
      "背景を変更"
    ],
    "LooksCommand:PREV_BACKDROP": [
      "もどす",
      "戻す"
    ],
    "LooksCommand:NEXT_COSTUME": [
      "コスチューム",
      "次の見た目",
      "次の絵",
      "ポーズ",
      "衣装"
    ],
    "LooksCommand:PREV_COSTUME": [
      "コスチューム",
      "前の見た目",
      "前の絵",
      "もどす",
      "戻す",
      "ポーズ",
      "衣装"
    ],
    "LooksCommand:SET_INPUT": [
      "入力する",
      "セット"
    ],
    "SoundCommand:PITCH_UP": [
      "半音上げる",
      "ピッチを上げる"
    ],
    "SoundCommand:PITCH_DOWN": [
      "半音下げる",
      "ピッチを下げる"
    ],
    "SoundCommand:STOP_ALL": [
      "音を消す",
      "すべての音を消す",
      "全部の音を消す",
      "音を全部消す",
      "音をストップ",
      "音楽をストップ"
    ],
    "PenCommand:UP": [
      "ペンを離す",
      "ペンをはなす",
      "ペンを紙から離す",
      "ペンを紙からはなす",
      "持ち上げる",
      "もち上げる",
      "うかせる",
      "浮かせる",
      "ペンをはずす",
      "ペンをしまう",
      "ペンをもどす",
      "かくのをやめる",
      "書くのをやめる",
      "かき終わる",
      "書き終わる",
      "線を止める",
      "線をとめる",
      "ペンを止める",
      "ペンをとめる",
      "ペンアップ",
      "ペンあげる",
      "ペン上げる",
      "引くのをやめる",
      "ひくのをやめる",
      "ペンを片づける",
      "ペンを片付ける",
      "ペンをかたづける"
    ],
    "PenCommand:SET_COLOR": [
      "線の色",
      "ペンのカラー"
    ],
    "PenCommand:STAMP": [
      "はんこ",
      "判子",
      "すがたをのこす",
      "スタンプおす",
      "スタンプ押す"
    ],
    "PenCommand:CLEAR": [
      "かいた線を消す",
      "描いた線を消す",
      "すべての線を消す",
      "線を全部消す",
      "作品の線とスタンプを消す",
      "作品の線とスタンプをみんな消す",
      "画面の線とスタンプを全部消す",
      "画面を消す",
      "ステージを消す",
      "画面をクリア",
      "消しゴム",
      "かいたものを消す",
      "描いたものを消す",
      "作品の絵を消す",
      "お絵かきを消す",
      "らくがきを消す",
      "えをけす"
    ],
    "Forever": [
      "ループ",
      "リピート",
      "永遠",
      "えいえん",
      "無限",
      "むげん",
      "永久",
      "いつまでも",
      "つねに",
      "ずーっと",
      "ずうっと",
      "えんえん",
      "つづける",
      "続ける",
      "何回も",
      "なんかいも",
      "何度も",
      "なんども"
    ],
    "NoOperation": [
      "何も起きない",
      "何もない",
      "そのまま",
      "ほうっておく",
      "からっぽ"
    ],
    "Continue": [
      "とばす",
      "スキップ",
      "コンティニュー",
      "次へ進む",
      "次のループ",
      "次にいく",
      "つぎにいく",
      "次に行く"
    ],
    "ListAppend": [
      "追加",
      "ついか",
      "プッシュ",
      "保存",
      "記録",
      "おぼえる",
      "覚える",
      "しまう",
      "メモ",
      "くわえる",
      "加える"
    ],
    "ListReplace": [
      "とりかえる",
      "取り替える",
      "取りかえる",
      "おきかえる",
      "置き換える",
      "置きかえる",
      "入れかえる",
      "入れ替える",
      "いれかえる",
      "書きかえる",
      "書き換える",
      "変更",
      "上書き",
      "セット",
      "交換",
      "こうかん",
      "チェンジ"
    ],
    "ListDelete": [
      "さくじょ",
      "取りのぞく",
      "取り除く",
      "とりのぞく",
      "捨てる",
      "すてる",
      "なくす",
      "消去"
    ],
    "ListClear": [
      "リセット",
      "クリア",
      "初期化",
      "からにする",
      "からっぽ",
      "空っぽ",
      "空にする",
      "すてる",
      "捨てる",
      "なくす"
    ],
    "TimerReset": [
      "タイマーを始める",
      "タイマーをはじめる",
      "タイマーをスタート",
      "クリア",
      "初期化",
      "リスタート",
      "はじめから数える"
    ],
    "Heading:start": [
      "スタート",
      "始まった",
      "はじまった",
      "始めた",
      "はじめた",
      "ゲーム",
      "プログラム",
      "実行",
      "動き出した",
      "開いた",
      "動かす",
      "ボタン"
    ],
    "Heading:click": [
      "タップ",
      "タッチ",
      "さわる",
      "さわった",
      "さわられた",
      "押す",
      "押した",
      "押された",
      "マウス",
      "ダブルクリック",
      "長おし",
      "長くおした"
    ],
    "Heading:keyDown": [
      "ごとに",
      "おされる",
      "押される",
      "タップ",
      "タッチ",
      "クリック",
      "打つ",
      "たたく",
      "どれか",
      "なにか"
    ],
    "Heading:message": [
      "どの合図でも",
      "どんな合図でも"
    ],
    "Heading:backdropChanged": [
      "切りかわる",
      "変化",
      "新しい",
      "かえた",
      "変えた",
      "ちがう",
      "後"
    ],
    "Heading:valueChanged": [
      "文字",
      "入力",
      "書いた",
      "書きこんだ",
      "内容",
      "変化",
      "かえた",
      "変えた"
    ],
    "Heading:cloneStart": [
      "クローン",
      "分身",
      "コピーされた",
      "生まれた",
      "出来た",
      "作成",
      "スタート",
      "始まった",
      "コピーを作った"
    ],
    "Heading:touchStart": [
      "タッチ",
      "接触",
      "重なった",
      "触った",
      "くっついた",
      "ふれあった",
      "来た"
    ],
    "CloneCommand:CREATE_SELF": [
      "クローン",
      "ぶんしん",
      "自分の分身を作る",
      "分身をつくる",
      "複製する",
      "作成する",
      "クローンする",
      "コピーする",
      "分身する",
      "自分をふやす",
      "自分を増やす",
      "もう1人作る",
      "もう一人作る",
      "コピー作る",
      "コピーつくる"
    ],
    "CloneCommand:CREATE_TARGET": [
      "クローン",
      "ぶんしん",
      "コピーする",
      "複製する",
      "クローンする",
      "コピー作る",
      "コピーつくる"
    ],
    "CloneCommand:DELETE_SELF": [
      "自分を消す",
      "自分をけす",
      "自分だけ",
      "自分自身",
      "自分をなくす",
      "このコピーをなくす",
      "コピーを消す",
      "コピーをけす",
      "自分のコピーを消す",
      "自分のコピーだけを消す",
      "このクローンを消す",
      "この分身を消す",
      "コピーを削除",
      "このクローンを削除",
      "コピーを消去",
      "消える",
      "きえる",
      "いなくなる",
      "このコピーを終わらせる",
      "このコピーをおわらせる",
      "このコピーをおしまいにする",
      "すぐ消す",
      "すぐけす",
      "コピー消す",
      "コピーけす"
    ],
    "ReturnStatement": [
      "リターンする"
    ],
    "LocalVariableDeclaration": [
      "という変数",
      "というへんすう"
    ],
    "LocalListDeclaration": [
      "リスト",
      "リストを作る"
    ]
  });
  const ASSIST_MAX=4, ASSIST_FULL_PARSE_CHARS=4000, ASSIST_BUDGET_MS=300;
  function assistSplit(text, separators='、。') {
    const out=[];let start=0,stack=[];
    const pairs={'「':'」','【':'】','（':'）','(' : ')','『':'』','｢':'｣','［':'］'};
    for(let i=0;i<text.length;i++){
      const c=text[i];if(pairs[c])stack.push(pairs[c]);else if(stack.at(-1)===c)stack.pop();
      else if(!stack.length&&separators.includes(c)){out.push({text:text.slice(start,i),start,end:i});start=i+1;}
    }
    out.push({text:text.slice(start),start,end:text.length});return out.filter(x=>x.text.trim());
  }
  function assistNumberText(text) {
    const quotes=[],protectedText=String(text).replace(/「[^「」]*」|【[^【】]*】|『[^『』]*』|｢[^｢｣]*｣|["‘’][^"‘’]*["‘’]|（[^（）]*）|\([^()]*\)|〈[^〈〉]*〉|《[^《》]*》|［[^［］]*］|\[[^\[\]]*\]/g,s=>'§'+(quotes.push(s)-1)+'§');
    let s=protectedText.normalize('NFKC').replace(/(?<=\d),(?=\d{3})/g,'');
    s=s.replace(/じゅっ|じゅう|きゅう|はち|なな|ろく|ご|よん|し|さん|に|いち/g,(m,at,full)=>{
      // Kana numbers are quantities only immediately before a known unit.
      if(at&&!/[はがをにへとで、 ]$/.test(full.slice(0,at)))return m;
      if(!/^(?:びょう|秒|歩|ほ|ぽ|回|かい|度|ど|つ(?!づ)|番)/.test(full.slice(at+m.length)))return m;
      return ({じゅっ:'10',じゅう:'10',きゅう:'9',はち:'8',なな:'7',ろく:'6',ご:'5',よん:'4',し:'4',さん:'3',に:'2',いち:'1'})[m];
    });
    s=s.replace(/[一二三四五六七八九十百千]+(?=歩|秒|度|％|回|番|つ|個|体|匹|人|こ)/g,(word,at,full)=>{
      if(word==='一'&&/^番(?:手前|前|奥|おく|後ろ|うしろ|上|下)/.test(full.slice(at+word.length)))return word;
      const digits='〇一二三四五六七八九',units={十:10,百:100,千:1000};let total=0,n=0;
      for(const c of word)if(units[c]){total+=(n||1)*units[c];n=0;}else n=digits.indexOf(c);return total+n;
    });return s.replace(/§(\d+)§/g,(_,i)=>quotes[i]);
  }
  function assistSeeds(code, symbols, ctx={}) {
    const project=symbols?.project, components=project?.components||[],names=[];
    const addNames=(values,kind)=>{for(const v of values||[])if(v?.name)names.push({name:v.name,kind});};
    addNames(components,'part');addNames(project?.sounds,'sound');addNames(project?.stage?.backdrops,'backdrop');
    addNames(project?.projectData?.variables,'variable');addNames(project?.projectData?.lists,'list');
    addNames(project?.actions,'action');addNames(project?.functions,'function');
    for(const c of components)if(c.id===ctx.targetId){addNames(c.costumes,'costume');addNames(c.localData?.variables,'variable');addNames(c.localData?.lists,'list');}
    addNames((ctx.args||[]).map(name=>({name})),'argument');addNames([...(ctx.localNames||[])].map(name=>({name})),'local');
    let text=assistNumberText(String(code).trim().replace(/[。、，．…〜♪]+$/u,'')), subject=null;
    for(const name of ['自分','体',...components.map(c=>c.name)].sort((a,b)=>b.length-a.length)){
      const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), m=new RegExp('^(?:「'+escaped+'」|'+escaped+')(?:[はが]、?|[、\\s]+|の(?=向き|大きさ|すがた|音|色|ばしょ|文字|中身|見た目|ペン))').exec(text);
      if(m){subject=name;text=text.slice(m[0].length);break;}
    }
    const stringValues=[...text.matchAll(/「([^「」]*)」|『([^『』]*)』|｢([^｢｣]*)｣|["‘’]([^"‘’]*)["‘’]|（([^（）]*)）|\(([^()]*)\)|〈([^〈〉]*)〉|《([^《》]*)》|［([^［］]*)］|\[([^\[\]]*)\]/g)].map(m=>({value:m.slice(1).find(x=>x!==undefined),at:m.index,end:m.index+m[0].length})),strings=stringValues.map(s=>s.value);
    const nameText=text.replace(/^もし、?/,'');
    const extractedNames=names.filter(n=>strings.includes(n.name)||text.includes('【'+n.name+'】')||new RegExp('(?:^|[はがをにへとので、 ])'+n.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|[はがをにへとので、 ])').test(nameText));
    for(const name of names.filter(n=>['action','function'].includes(n.kind)))if(!extractedNames.includes(name)&&new RegExp(name.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:させ|する|して|という)').test(text))extractedNames.push(name);
    if(text.includes('マウス'))extractedNames.push({name:'マウス',kind:'part'});
    let outside=text;for(const s of stringValues)outside=outside.slice(0,s.at)+' '.repeat(s.end-s.at)+outside.slice(s.end);outside=outside.replace(/【[^【】]*】/g,s=>' '.repeat(s.length));
    const keys=[...new Set(strings.map(keyWord).filter(Boolean))];
    for(const word of [...Object.keys(KEY_ALIASES),...KEY_WORDS].sort((a,b)=>b.length-a.length)){
      const escaped=word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      if(new RegExp('(?:^|の)'+escaped+'(?:矢印キー|やじるしキー|キー|(?=[をが]))').test(outside)){const key=keyWord(word);if(key&&!keys.includes(key))keys.push(key);}
    }
    const numbers=[],unitNames={歩:'歩',ほ:'歩',ぽ:'歩',ホ:'歩',ドット:'歩',step:'歩',ステップ:'歩',秒:'秒',びょう:'秒',s:'秒',sec:'秒',度:'度',ど:'度','°':'度','%':'％','％':'％',パーセント:'％',ぱーせんと:'％',パー:'％',Hz:'Hz',hz:'Hz',HZ:'Hz',ヘルツ:'Hz',回:'回',かい:'回',番目:'番目',番め:'番目',ばんめ:'番目',つ目:'番目',つめ:'番目',こめ:'番目',個目:'番目',番:'番目',段:'段階',段階:'段階',つ:'つ',こ:'つ',個:'つ',層:'つ',体:'count',匹:'count',人:'count',px:null,ピクセル:null};
    for(const m of outside.matchAll(/(-?\d+(?:\.\d+)?)([A-Za-z%％°ァ-ヶぁ-ゖ一-龯]*)(?:半|はん)?/g)){
      let unit=Object.keys(unitNames).sort((a,b)=>b.length-a.length).find(u=>m[2].startsWith(u));
      if(m[2]&&!unit&&!/^(?:[をにへとでがは]|から|まで|より|なら)/.test(m[2])&&!searchQueryVariants(m[2]).some(form=>Object.values(BLOCK_SEARCH_SYNONYMS).flat().some(word=>form.startsWith(word))))continue;const suffix=outside.slice(m.index+m[1].length+(unit?.length||0));
      numbers.push({value:Number(m[1])+(/^(?:半|はん)/.test(suffix)&&(!unit||unitNames[unit]==='秒')?0.5:0),unit:unit?unitNames[unit]:null,at:m.index,end:m.index+m[1].length});
    }
    let clauseText='',stack=[];
    const pairs={'「':'」','【':'】','『':'』','｢':'｣'},teWords=[...SENTENCE_TE_FORMS].map(([te])=>te).sort((a,b)=>b.length-a.length);
    for(let i=0;i<text.length;i++){
      const c=text[i];if(pairs[c])stack.push(pairs[c]);else if(stack.at(-1)===c)stack.pop();clauseText+=c;if(stack.length)continue;
      const before=text.slice(0,i+1),after=text.slice(i+1);
      if(/^[、。]/.test(after)||!after)continue;
      if((teWords.some(te=>before.endsWith(te))&&!/^(?:ください|ね|よ|ほしい|くれ|いる|いれ|いな|いた|います|おく|おいて|しまう)/.test(after))||/[てで]$/.test(before)&&after.startsWith('から'))clauseText+='、';
      else if(/[うくぐすつぬぶむる]$/.test(before)&&after.startsWith('そして'))clauseText+='、';
    }
    const clauses=assistSplit(clauseText,'、').map(x=>({...x,text:x.text.replace(/^(?:から|そして|それから|それで|つぎに|次に)/,'')}));
    const seeds=[],seen=new Set(),add=(word,rank,fragment=false)=>{word=word.trim();if(!word||seen.has(word)||/^(?:する|なる|ある|いる|それ|これ|あれ|となり|少し)$/.test(word))return;seen.add(word);seeds.push({text:word,rank,fragment});};
    for(const [raw,rank]of [[text,0],...clauses.map((c,i)=>[c.text,i===clauses.length-1?1:i+2])]){
      const clean=raw.replace(/「[^「」]*」|『[^『』]*』|｢[^｢｣]*｣|"[^"]*"/g,'');
      add(clean,rank);add(clean.replace(/(?:をする|をやる|する)$/,''),rank);
      for(const v of searchQueryVariants(clean,{condition:/(?:たら|と|れば|なら|とき|たとき|あいだ|間|まで)$/.test(clean)}))add(v,rank);
      for(const m of clean.matchAll(/(?:^|[、])(.+?)[をはが]/g))add(m[1],rank);
      for(const word of [clean,...searchQueryVariants(clean)].flatMap(form=>form.replace(/\d+(?:\.\d+)?(?:cm|センチ|メートル|マス|ぽ|ほ)/g,'').replace(/という|として|とともに|といっしょに/g,m=>m.replace(/と/g,'\u0002')).split(/[をにへとでがはの、\d]+|歩|秒|度|％|回|番目/))){
        const w=word.replace(/\u0002/g,'と');add(w,rank,true);add(w.replace(/(?:をする|をやる|する)$/, ''),rank,true);for(const v of searchQueryVariants(w))add(v,rank,true);
      }
    }
    for(const m of text.matchAll(/【([^【】]+)】/g))add(m[1],0,true);
    for(const key of keys)add(keySurface(key),0,true);
    for(const number of numbers)if(number.unit)add(String(number.value)+number.unit,0,true);
    for(const word of new Set(Object.values(BLOCK_SEARCH_SYNONYMS).flat()))if(word.length>2&&word.endsWith('も')&&searchReading(text).startsWith(searchReading(word))){add(word,0);add(text.slice(word.length),0,true);}
    const headerEvent=(!/^もし/.test(text)||/(?:おされた|おした)とき$/.test(text))&&/(?:とき(?:に)?|時|たびに|ごとに|たら)(?:、.*)?$/.test(text)?/合図/.test(text)?'message':/(?:はいけい|背景).*(?:かわ|変わ|かえ|切り)/.test(text)?'backdropChanged':/コピー|クローン/.test(text)?'cloneStart':/中身.*かわ|中身.*変わ|文字が入った/.test(text)?'valueChanged':/キー|矢印/.test(text)||keys.length?'keyDown':/タップ|クリック|タッチされ|おされた|おした/.test(text)?'click':/ふれ|触れ|タッチした/.test(text)?'touchStart':/スタート|始ま|はじま|開始|実行|はじめ|作品を動かした/.test(text)?'start':null:null;
    const grouped=/^(.+?)(?:は|も、)(.+)$/.exec(text),subjectNames=grouped?.[1].split(/と|も/).filter(Boolean).map(name=>name.replace(/[「」]/g,''));
    const subjects=subjectNames?.length>=3&&subjectNames.every(name=>components.some(c=>c.name===name))?{names:subjectNames,body:grouped[2]}:null;
    return {text,subject,strings,stringValues,names:extractedNames,numbers,keys,clauses,seeds,headerEvent,subjects};
  }
  function assistVerificationContext(ctx) {const {key,ownerKey,...rest}=ctx;return rest;}
  function assistCanonical(text, ctx, previous='') {
    const clean=String(text).trim().replace(/。{2,}$/,'。'), variants=[clean,/、$/.test(clean)?clean+'\n  何もしない。':clean+'。',clean.replace(/、?$/,'、')+'\n  何もしない。',clean.replace(/。?$/,'。')+'\n  何もしない。',clean+'\n  何もしない。'];
    for(const source of variants){for(const prefix of ['',...(previous?[previous+'\n']:[])]){
      try{const parsed=parseSyntax(prefix+source,ctx);if(!parsed.ast)continue;let canonical=formatScript(parsed.ast).trim();
        if(prefix){canonical=canonical.split('\n').slice(prefix.trim().split('\n').length).join('\n');if(parsed.ast.body?.length>1)parsed.ast.body=parsed.ast.body.slice(1);}
        if(source!==clean&&source.endsWith('\n  何もしない。'))canonical=canonical.split('\n').slice(0,-1).join('\n');
        return {text:canonical,ast:parsed.ast};
      }catch{}
    }}return null;
  }
  function assistSourceRange(basis, diagnostic, ctx) {
    const lines=basis.split('\n'), index=(diagnostic.line||1)-1, raw=lines[index];if(raw===undefined)return null;
    const lineStart=lines.slice(0,index).reduce((n,s)=>n+s.length+1,0),indent=raw.match(/^\s*/)[0].length;
    let pieces=assistSplit(raw.slice(indent),'。');let piece=pieces[0];
    if(pieces.length>1)piece=pieces.find(p=>{try{return !parseSyntax(p.text+'。',ctx).ast;}catch{return true;}})||{text:raw.slice(indent),start:0,end:raw.length-indent};
    if(/。\s*(?:#|＃|\/\/|／／|--|\/\*)/.test(raw))piece={text:raw.slice(indent),start:0,end:raw.length-indent};
    if(!piece)return null;return {start:lineStart+indent+piece.start,end:lineStart+indent+piece.end,lineStart,lineEnd:lineStart+raw.length,indent,line:index+1,text:piece.text};
  }
  function assistHeadings(project, ctx, data) {
    if(ctx.definitionKind||ctx.meijin||ctx.targetId==='stage')return [];
    const owner=project.components.find(c=>c.id===ctx.targetId);if(!owner)return [];
    const key=data.keys[0],touch=data.text.includes('画面のはし')?'端':data.names.find(n=>n.kind==='part'&&n.name!==owner.name)?.name||project.components.find(c=>c.id!==owner.id)?.name||'端';
    const names=ctx.signalNames||{sent:[],received:[]}, inputs=project.components.filter(c=>c.type==='input');
    const out=[];
    for(const event of new Set(Object.values(EVENT_BY_TYPE).flat())){
      if(event==='interval'||event==='conditionTrue')continue;
      if(['click','cloneStart'].includes(event)&&data.names.some(n=>n.kind==='part'&&n.name!==owner.name))continue;
      if(event!=='valueChanged'&&data.subject&&data.subject!==owner.name&&!['自分','体'].includes(data.subject))continue;
      const variants=event==='valueChanged'?(data.names.some(n=>n.kind==='part')?inputs.filter(input=>data.names.some(n=>n.name===input.name)):inputs):event==='message'?(data.strings.length?data.strings.map(message=>({message})):[{}]): [{}];
      for(const variant of variants){
        const actorRef=event==='valueChanged'?{kind:'named',name:variant.name}:data.subject===owner.name&&!['keyDown','message'].includes(event)?{kind:'named',name:owner.name}:{kind:'self'};
        try{const text=sentenceHeadingSource({event,actorRef,filter:event==='keyDown'?(key?{key}:null):event==='message'?(variant.message!==undefined?variant:null):event==='touchStart'?{target:touch}:null});
          out.push({id:'Heading:'+event,text,mode:'statement',enabled:true,terms:{text:[text],synonyms:BLOCK_SEARCH_SYNONYMS['Heading:'+event]||[],verbForms:[],nounForms:[],intent:[],acceptedReadings:[]}});
        }catch{}
      }
    }return out;
  }
  function assistSlotNameKind(slot) {
    return ({音:'sound',すがた:'costume',はいけい:'backdrop',部品:'part',入力らん:'part',行く相手:'part',向く相手:'part',コピーの元:'part',リスト:'list',調べるリスト:'list',かえるもの:'variable'})[slot.label];
  }
  function assistFillHint(hint, data, project, ctx, intent=null) {
    const parsed=assistCanonical(hint.text,ctx);if(!parsed)return null;
    const ast=parsed.ast, node=ast.body?.[0]||ast.rules?.[0];if(!node||hint.id.startsWith('Heading:'))return {...hint,text:parsed.text,filled:0};
    if(node.kind==='Say'&&data.numbers.some(n=>n.unit==='秒'))node.seconds=sentenceQuantity({kind:'NumberLiteral',value:data.numbers.find(n=>n.unit==='秒').value},'秒');
    const filled=new Set(),boundKinds=new Set(),slots=sentenceRoleSlots(node.kind,node.op,node.seconds?'timedSpeech':null),get=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o),put=(o,p,v)=>{const keys=p.split('.');for(const k of keys.slice(0,-1)){if(!o[k])return false;o=o[k];}o[keys.at(-1)]=v;return true;};
    const literal=value=>value<0?{kind:'UnaryExpression',op:'NEG',value:{kind:'NumberLiteral',value:-value}}:{kind:'NumberLiteral',value},isNumber=node=>node?.kind==='NumberLiteral'||node?.kind==='QuantityLiteral'&&node.value?.kind==='NumberLiteral';
    const numberAt=(slot,value)=>{const old=get(node,slot.path),changed=put(node,slot.path,old?.kind==='QuantityLiteral'?{...old,value:literal(value)}:literal(value));if(changed)filled.add(slot.path);return changed;};
    if(intent){
      if(intent.schemaId==='MotionCommand:MOVE_BY'&&intent.direction){const vertical=['up','down'].includes(intent.direction);if(vertical&&node.x){node.y=node.x;delete node.x;}node[vertical?'yDir':'xDir']=intent.direction;}
      else if(intent.direction&&('direction'in node))node.direction=intent.direction;
      if(intent.scale!==undefined&&node.args?.[0])numberAt({path:'args.0'},intent.scale);
      if(intent.schemaId==='MotionCommand:SET_DIRECTION'&&intent.direction){
        const word=({right:'右',left:'左',up:'上',down:'下'})[intent.direction],directionAst=parseSyntax('画面の'+word+'を向く。',ctx).ast;
        if(directionAst?.body?.[0]?.args)node.args=directionAst.body[0].args;
      }else if(intent.value!==undefined){const s=slots.find(s=>s.type==='expression'&&isNumber(get(node,s.path)));if(s)numberAt(s,intent.value);}
      if(intent.color&&node.args?.[0])node.args[0]={kind:'StringLiteral',value:intent.color};
      if(intent.index!==undefined&&node.index)numberAt({path:'index'},intent.index);
      if(intent.empty&&node.args?.[1])node.args[1]={kind:'StringLiteral',value:''};
    }
    const used=new Set(),slotUnit=s=>s.unit||get(node,s.path)?.unit||({いくつ:'つ',音の高さ:'段階'})[s.label];
    for(const s of slots){if(s.type!=='expression')continue;const old=get(node,s.path);if(!old)continue;
      const number=data.numbers.find((n,i)=>!used.has(i)&&n.unit&&n.unit===slotUnit(s));
      if(number&&isNumber(old)){numberAt(s,number.value);used.add(data.numbers.indexOf(number));filled.add(s.path);}
    }
    const nameKinds=new Set(slots.map(assistSlotNameKind).filter(Boolean)),values=data.strings.filter(value=>!data.names.some(name=>name.name===value&&nameKinds.has(name.kind)));
    const stringSlots=slots.filter(s=>s.type==='expression'&&!s.unit&&!assistSlotNameKind(s)&&(get(node,s.path)?.kind==='StringLiteral'||get(node,s.path)?.kind==='NumberLiteral'&&['新しい中身','入れるもの','はじめの中身','答え'].includes(s.label)));
    if(values.length&&stringSlots.length===1){put(node,stringSlots[0].path,{kind:'StringLiteral',value:values[0]});filled.add(stringSlots[0].path);}
    const remaining=data.numbers.filter((n,i)=>!used.has(i)&&!n.unit),numberSlots=slots.filter(s=>s.type==='expression'&&isNumber(get(node,s.path))&&!data.numbers.some(n=>n.unit&&n.unit===s.unit));
    if(remaining.length&&numberSlots.length===1){numberAt(numberSlots[0],remaining[0].value);filled.add(numberSlots[0].path);}
    for(const s of slots){const kind=assistSlotNameKind(s);if(!kind)continue;const name=data.names.find(n=>n.kind===kind||kind==='variable'&&['list','argument','local'].includes(n.kind));if(!name)continue;const old=get(node,s.path);if(!old)continue;
      if(old.kind==='StringLiteral')put(node,s.path,{...old,value:name.name});else if(typeof old.name==='string')put(node,s.path,{...old,name:name.name});filled.add(s.path);boundKinds.add(name.kind);
    }
    if(hint.binding){const name=data.names.find(n=>['variable','list','argument','local'].includes(n.kind));if(name){for(const s of slots){const old=get(node,s.path);if(old&&old.name===hint.binding.name){old.name=name.name;filled.add(s.path);boundKinds.add(name.kind);}}}}
    if(['Say','ReturnStatement','LooksCommand'].includes(node.kind)){const name=data.names.find(n=>['variable','list','argument','local'].includes(n.kind));if(name){const s=slots.find(s=>['value','args.1'].includes(s.path));if(s){try{put(node,s.path,parseExpression(nameSource(name.name),ctx.symbols,ctx));filled.add(s.path);boundKinds.add(name.kind);}catch{}}}}
    if(node.kind==='UserActionCall'){
      const args=project.actions.find(a=>a.name===node.name)?.args||[],namedArgs=args.map((name,index)=>({name,index,escaped:name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})).sort((a,b)=>b.name.length-a.name.length),assigned=new Set(),prefixArg=value=>namedArgs.find(({escaped})=>new RegExp('(?:^|[、はがをにへとので])'+escaped+'(?:を|は)$').test(data.text.slice(0,value.at))),suffixArg=value=>namedArgs.find(({escaped})=>new RegExp('^(?:を)?'+escaped+'として').test(data.text.slice(value.end)));
      const nameValues=data.names.filter(n=>['variable','list','local','argument'].includes(n.kind)).flatMap(n=>{const escaped=n.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return [...data.text.matchAll(new RegExp('(?:^|(?<=[はがをにへとので、 【]))'+escaped+'(?=$|[はがをにへとので、 】])','g'))].map(m=>{const wrapped=data.text[m.index-1]==='【'&&data.text[m.index+m[0].length]==='】';return{name:n.name,wrapped,at:m.index-(wrapped?1:0),end:m.index+m[0].length+(wrapped?1:0),value:parseExpression(nameSource(n.name),ctx.symbols,ctx)};});}).filter(n=>!data.stringValues.some(s=>s.at<=n.at&&n.end<=s.end)&&!(args.includes(n.name)&&!n.wrapped&&!prefixArg(n)&&!suffixArg(n)&&/^(?:を|は|として)/.test(data.text.slice(n.end))));
      const values=[...data.numbers.filter(n=>!n.unit).map(n=>({at:n.at,end:n.end,value:literal(n.value)})),...data.stringValues.map(s=>({...s,value:{kind:'StringLiteral',value:s.value}})),...nameValues].sort((a,b)=>a.at-b.at);
      for(const value of values){value.index=(prefixArg(value)||suffixArg(value))?.index??-1;if(value.index>=0){node.args[value.index]=value.value;assigned.add(value.index);filled.add('args.'+value.index);}}
      for(const value of values.filter(v=>v.index<0)){const index=node.args.findIndex((_,i)=>!assigned.has(i));if(index<0)break;node.args[index]=value.value;assigned.add(index);filled.add('args.'+index);}
    }
    if(node.kind==='CloneCommand'&&['CREATE_SELF','CREATE_TARGET'].includes(node.op)){const n=data.numbers.find(n=>['count','つ'].includes(n.unit));if(n){node.count=literal(n.value);filled.add('count');}}
    if(['LocalVariableDeclaration','LocalListDeclaration'].includes(node.kind)){
      const name=/【([^【】]+)】/.exec(data.text)?.[1]||/^(.+?)という(?:変数|へんすう|リスト)/.exec(data.text)?.[1];if(name){node.name=name;filled.add('name');}
    }
    if(node.condition?.kind==='SensorRead'&&node.condition.sensor==='KEY_DOWN'&&data.keys.length){node.condition.arg={kind:'StringLiteral',value:data.keys[0]};filled.add('condition.arg');}
    if(node.condition){
      const conditions=[data.text.replace(/(?:、?くり返す|待つ|待って)$/,'').replace(/のを$/,'まで'),data.clauses[0]?.text.replace(/^もし/,'')];
      conditionLoop:for(const condition of conditions)for(const form of ['if','while','until','plain'])try{node.condition=parseCondition(condition,ctx.symbols,ctx,form);filled.add('condition');break conditionLoop;}catch{}
    }
    try{let text=formatScript(ast).trim();if(ctx.assistExistingBody&&['IfStatement','Forever','RepeatCount','RepeatWhile','RepeatUntil','ForEach'].includes(node.kind))text=text.split('\n')[0];return {...hint,text,filled:filled.size,defaultNumericSlots:slots.some(s=>s.type==='expression'&&isNumber(get(node,s.path))&&!filled.has(s.path)),conditionFilled:filled.has('condition')||filled.has('condition.arg'),boundKinds:[...boundKinds],valueChoices:stringSlots.length===1?values:[]};}catch{return null;}
  }
  function assistSearch(project,basis,range,ctx,data) {
    const all=hintCandidates(project,ctx.targetId,{...ctx,source:basis,start:range.lineStart+range.indent,end:range.lineEnd}), candidates=all.filter(h=>h.mode==='statement'&&h.enabled);
    if(range.indent===0&&(/、$/.test(range.text)||/(?:たら|とき|ごと|たび)、?$/.test(range.text)))candidates.push(...assistHeadings(project,ctx,data));
    const ranked=[],fallbacks=[],matchedCache=new Map(),match=(words,seed)=>{const key=words+'\0'+seed;if(!matchedCache.has(key))matchedCache.set(key,matchesSearch(words,seed));return matchedCache.get(key);};
    const nextLine=basis.slice(range.lineEnd+1).split('\n')[0]||'',fillContext={...ctx,assistExistingBody:nextLine.trim()&&nextLine.match(/^\s*/)[0].length>range.indent};
    const namedIntent=seed=>{
      if(data.names.some(n=>n.kind==='part'&&project.components.some(c=>c.name===n.name&&['label','button','box'].includes(c.type)))&&data.names.some(n=>['variable','list'].includes(n.kind))&&/^「[^「」]+」を.+にする$/.test(data.text))return {schemaId:'LooksCommand:SET_TARGET_TEXT'};
      if(data.names.some(n=>['action','function'].includes(n.kind))&&/行う|行って|呼び|させる|わた|として|てじゅん|手順/.test(data.text))return null;
      if(data.names.some(n=>['action','function'].includes(n.kind)&&new RegExp('^'+searchReading(n.name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:する|して|したい|させる)?$').test(searchReading(seed).replace(/[【】]/g,''))))return null;
      let intent=searchIntent(seed,ctx);
      if(/(?:にする|になる|かえる)$/.test(seed)){const image=data.names.find(n=>['costume','backdrop'].includes(n.kind));if(image)intent={schemaId:image.kind==='costume'?'LooksCommand:SET_COSTUME':'LooksCommand:SET_BACKDROP'};}
      if(data.strings.length&&/と(?:伝える|つたえる)$/.test(seed))intent={schemaId:'Broadcast'};
      if(data.strings.length&&/(?:と|って)(?:きく|聞く)$/.test(seed))intent={schemaId:'Ask'};
      const scalar=data.names.some(n=>['variable','argument','local'].includes(n.kind))||(project.projectData?.variables||[]).length===1&&/^.+?を\d+(?:あげる|上げる)$/.test(seed),list=data.names.some(n=>n.kind==='list');
      if(scalar&&/^LooksCommand:SET_SCALE$/.test(intent?.schemaId||''))intent=null;
      if(scalar&&/マイナス|へら|へる|減ら|減る|小さく/.test(seed))intent={schemaId:'NumericUpdate:SUB'};
      else if(scalar&&/ふや|増や|ふえる|増える|たす|足す|大きく|あげる|上げる|上がる|あがる/.test(seed))intent={schemaId:'NumericUpdate:ADD'};
      if(list&&!/番|ばんめ|つ目|つめ/.test(seed)&&/消す|けす|削除|クリア|からに|空に|(?:全部|ぜんぶ)すてる/.test(seed))intent={schemaId:'ListClear'};
      if(list&&/番|ばんめ|つ目|つめ/.test(seed)&&/消す|けす/.test(seed))intent={schemaId:'ListDelete'};
      if(list&&/の中に.*入れる$/.test(seed))intent={schemaId:'ListAppend'};
      if(list&&/中身.*(?:全部|ぜんぶ)?(?:言う|いう)$/.test(seed))intent={schemaId:'Say'};
      if(/(?:ふれる|おされる|おす)(?:のを|まで)(?:待つ|まつ|待って)$/.test(seed))intent={schemaId:'WaitUntil'};
      if(data.strings.length&&/と(?:小さな声で|大きな声で)?(?:言う|いう|話す)$/.test(seed))intent={schemaId:'Say'};
      if(data.strings.length&&/言って答えを待つ$/.test(seed))intent={schemaId:'Ask'};
      if(data.names.some(n=>n.kind==='sound')&&/聞かせる|きかせる/.test(seed))intent={schemaId:'SoundCommand:SAMPLE_WAIT'};
      if(data.names.some(n=>n.kind==='part'&&project.components.some(c=>c.name===n.name&&['label','button','box'].includes(c.type)))&&data.names.some(n=>['variable','list'].includes(n.kind))&&/^「[^「」]+」を.+にする$/.test(data.text))intent={schemaId:'LooksCommand:SET_TARGET_TEXT'};
      if(data.names.some(n=>n.kind==='sound')&&/止める|とめる|ストップ/.test(seed))intent=searchIntent('音を止める',ctx);
      if(intent?.schemaId==='LooksCommand:SET_COLOR'&&data.keys.some(key=>seed.includes(key)||seed.includes(keySurface(key))))return null;
      return intent;
    };
    const mainIntent=namedIntent(data.text)||data.seeds.filter(s=>!s.fragment).map(s=>namedIntent(s.text)).find(Boolean),seeds=data.seeds.map((seed,index)=>({...seed,intent:mainIntent?index===0?mainIntent:null:namedIntent(seed.text)}));
    const restrictMotion=mainIntent&&/^MotionCommand:/.test(mainIntent.schemaId)&&mainIntent.schemaId!=='MotionCommand:GOTO'&&mainIntent.direction!=='backward';
    const mainText=data.clauses.at(-1)?.text||data.text,tail=mainText.replace(/「[^「」]*」|【[^【】]*】/g,'').split(/[をにへとでがはの、\d歩秒度％]+/).filter(Boolean).at(-1)||'';
    const verbs=[...new Set([...searchQueryVariants(tail.replace(/^(?:何回も|何度も|なんかいも|なんども)/,'')),...seeds.filter(seed=>seed.fragment).map(seed=>seed.text)].filter(word=>word.length>=2&&/[うくぐすつぬぶむる]$/.test(word)&&!/^(?:する|なる|ある|いる|にする|になる)$/.test(word)))];
    const sourceWords=[...new Set(data.clauses.flatMap(clause=>clause.text.replace(/「[^「」]*」|【[^【】]*】/g,'').replace(/\d+(?:\.\d+)?(?:歩|秒|度|％|回|番目|Hz)?/g,'').split(/[をにへとでがはの、]/)).filter(Boolean))];
    for(let order=0;order<candidates.length;order++){
      const h=candidates[order],id=hintSchemaId(h.id).replace(/:timed$/,''),terms=h.terms||{text:[h.text.split('\n')[0]],synonyms:hintSearchSynonyms(h.id),verbForms:[],nounForms:[],intent:[],acceptedReadings:[]};let best=null,exactSeen=false,matchLength=0;const matchedWords=new Set();
      if(data.headerEvent&&id!=='Heading:'+data.headerEvent)continue;
      if(restrictMotion&&/^MotionCommand:/.test(id)&&id!==mainIntent.schemaId)continue;
      if(mainIntent?.schemaId==='MotionCommand:GOTO'&&['MotionCommand:MOVE','MotionCommand:MOVE_BY','ContinuousRule'].includes(id))continue;
      if(mainIntent?.schemaId==='ContinuousRule'&&/^MotionCommand:/.test(id))continue;
      if(mainIntent&&/^MotionCommand:/.test(mainIntent.schemaId)&&['UserActionCall','ForEach'].includes(id)&&!data.names.some(n=>n.kind==='action'))continue;
      if(/のところ(?:へ|に|まで)(?:走|はし|とぶ|動)/.test(data.text)&&/^MotionCommand:/.test(id)&&id!=='MotionCommand:GOTO_PART')continue;
      if(/背景|はいけい/.test(data.text)&&/もどす|戻す/.test(data.text)&&id==='LooksCommand:PREV_COSTUME')continue;
      if(/すがた|姿|コスチューム/.test(data.text)&&/もどす|戻す/.test(data.text)&&id==='LooksCommand:PREV_BACKDROP')continue;
      if(h.id.endsWith(':timed')&&!data.numbers.some(n=>n.unit==='秒'))continue;
      if(id==='Say'&&/秒.*(?:話す|はなす|言う|いう)/.test(h.text)&&!data.numbers.some(n=>n.unit==='秒'))continue;
      const strictIntent=['PenCommand:SET_COLOR','PenCommand:SET_SIZE','PenCommand:STAMP','PenCommand:DOWN','PenCommand:CLEAR','SoundCommand:SET_VOLUME','SoundCommand:PITCH_UP','SoundCommand:PITCH_DOWN','TimerReset','WaitTime','WaitUntil','LooksCommand:SET_TARGET_TEXT','LooksCommand:SET_INPUT','ListClear','ListAppend'];
      const intentAlternative=mainIntent?.schemaId==='PenCommand:SET_COLOR'&&id==='PenCommand:DOWN'&&/線.*かく/.test(data.text)||mainIntent?.schemaId==='SoundCommand:SET_VOLUME'&&id==='SoundCommand:STOP_ALL'&&/ミュート|みゅーと/.test(data.text)||mainIntent?.schemaId==='ListAppend'&&id==='ListInsert'&&/の中に.*入れる$/.test(data.text);
      if(mainIntent&&strictIntent.includes(mainIntent.schemaId)&&id!==mainIntent.schemaId&&!intentAlternative)continue;
      if(mainIntent?.schemaId==='LooksCommand:SET_SCALE'&&/大きさ|おおきさ|さいず/.test(data.text)&&id==='SoundCommand:SET_VOLUME')continue;
      if(mainIntent?.schemaId==='RepeatCount'&&id!=='RepeatCount')continue;
      if(ctx.definitionKind==='function'&&id==='ForEach'&&/順|一つずつ/.test(data.text)&&/言う|話す/.test(data.text))continue;
      if(id==='ContinuousRule'&&!/あいだ|間|おしっぱなし/.test(data.text))continue;
      if(mainIntent&&['NumericUpdate:ADD','NumericUpdate:SUB'].includes(mainIntent.schemaId)&&id!==mainIntent.schemaId&&!/ずつ|が.*あいだ|が.*まで/.test(data.text))continue;
      const dataKind=data.names.find(n=>['variable','list','argument','local'].includes(n.kind))?.kind;
      if(h.binding&&['scalar','list'].includes(h.binding.kind)&&dataKind&&(h.binding.kind==='list')!==(dataKind==='list'))continue;
      if(h.binding&&['scalar','list'].includes(h.binding.kind)&&!dataKind&&/^.+?を(?:\d+|[一二三四五六七八九十]|マイナス)/.test(data.text)&&((h.binding.kind==='list'?project.projectData?.lists:project.projectData?.variables)||[]).length!==1)continue;
      if(dataKind&&/^LooksCommand:SET_SCALE$/.test(id)&&mainIntent?.schemaId!=='LooksCommand:SET_SCALE')continue;
      if(id==='UserActionCall'&&!data.names.some(n=>n.kind==='action'))continue;
      const own=[...(terms.text||[]),...(terms.synonyms||[]),...(terms.verbForms||[]),...(terms.nounForms||[])],shortWords=[...own,...(terms.text||[]).flatMap(word=>word.replace(/\d+(?:\.\d+)?(?:つ|段階|秒|歩|回|番目|度|％)/g,'').split(/[をにへとでがはの、。\d]+/))];
      const keyHit=id==='Heading:keyDown'&&data.keys.some(key=>match(h.text,keySurface(key)));
      const verbHit=keyHit||verbs.some(verb=>match(own.join(' '),verb)||verb.endsWith('する')&&verb.length>2&&match(own.join(' '),verb.slice(0,-2)))||own.some(word=>word.length>=2&&/[うくぐすつぬぶむる]$/.test(word)&&data.seeds.some(seed=>!seed.fragment&&searchReading(seed.text).endsWith(searchReading(word))))||(terms.synonyms||[]).some(word=>searchReading(data.text)===searchReading(word)||searchReading(data.text)==='げーむ'+searchReading(word));
      for(const seed of seeds){
        const intent=seed.intent;
        if(intent&&intent.schemaId!==id&&!intentAlternative&&!(h.binding&&match(h.binding.name,seed.text)))continue;
        let layer=6,found=false;
        const unitOnly=/^-?\d+(?:\.\d+)?(歩|秒|度|％|回|番目|Hz|つ|段階)$/.exec(seed.text);
        if(unitOnly){
          const schema=BLOCK_SCHEMA_BY_ID.get(id),slots=SENTENCE_FORMS.filter(f=>f.kind===schema?.kind&&(!f.op||f.op===schema?.op||id===f.kind+':'+f.op)).flatMap(f=>f.roleSlots);
          if(!slots.some(slot=>slot.unit===unitOnly[1]))continue;found=true;layer=5;
        }else if(intent?.schemaId===id||intentAlternative&&seed===seeds[0]){found=true;layer=intentAlternative?5:4;}
        else if(data.headerEvent&&id==='Heading:'+data.headerEvent&&seed===seeds[0]){found=true;layer=5;}
        else for(const word of ([...seed.text].length<=2?shortWords:own)){const short=[...seed.text].length<=2, phrase=(terms.synonyms||[]).includes(word)&&word.search(/[をにへとでがはの]/)>0;
          const hit=short?searchReading(word)===searchReading(seed.text):phrase?match(seed.text,word):match(word,seed.text);
          if(hit){found=true;layer=5;break;}
        }
        if(!found&&[...seed.text].length>2&&match([...(terms.intent||[]),...(terms.acceptedReadings||[])].join(' '),seed.text))found=true;
        if(!found)continue;
        const nounException=data.headerEvent&&id==='Heading:'+data.headerEvent||id==='MotionCommand:BOUNCE'&&searchReading(h.text).startsWith(searchReading(data.clauses[0].text+'、'))||id==='MotionCommand:MOVE'&&/^前に来る$/.test(data.text)||id==='MotionCommand:GOTO_PART'&&/のところ(?:へ|に|まで)(?:走|はし|とぶ|動)/.test(data.text)||['LooksCommand:FRONT','LooksCommand:FORWARD_LAYERS'].includes(id)&&/手前|てまえ/.test(data.text)||['LooksCommand:BACK','LooksCommand:BACKWARD_LAYERS'].includes(id)&&/おく|奥|後ろに下がる/.test(data.text)||['Broadcast','BroadcastAndWait'].includes(id)&&/(?:合図|メッセージ).*出す/.test(data.text);
        if(layer===5&&verbs.length&&!verbHit&&!nounException&&!intentAlternative)layer=6;
        const exact=own.some(w=>searchReading(w)===searchReading(seed.text));exactSeen||=exact;matchLength=Math.max(matchLength,seed.text.length);if(layer<6)matchedWords.add(searchReading(seed.text).replace(/する$/,''));
        const row={schemaId:id,origin:'S3',layer,rank:seed.rank,fragment:seed.fragment,order,intent:layer===4?intent:null,exact:own.some(w=>searchReading(w)===searchReading(seed.text)),inText:verbs.length?verbs.some(verb=>searchReading(terms.text.join(' ')).includes(searchReading(verb))):match(terms.text.join(' '),seed.text)};
        if(!best||row.layer<best.layer||row.layer===best.layer&&(row.rank<best.rank||row.rank===best.rank&&Number(row.fragment)<Number(best.fragment)))best=row;
      }
      if(best){const filled=assistFillHint(h,data,project,fillContext,best.intent||(id==='MotionCommand:MOVE_BY'&&searchReading(data.text)==='はねる'?{schemaId:id,direction:'up'}:null));if(filled){
          const words=sourceWords.filter(word=>match(own.join(' '),word));
          const named=id==='UserActionCall'&&data.names.some(n=>n.kind==='action'&&h.text.includes(n.name))||id==='MotionCommand:GOTO_PART'&&/のところ(?:へ|に|まで)(?:走|はし|とぶ|動)/.test(data.text);
          const row={...filled,...best,named,exact:exactSeen,wordCount:words.length,matchLength:words.length?Math.max(...words.map(word=>word.length)):matchLength};if(['IfStatement','RepeatWhile','RepeatUntil','WaitUntil'].includes(id)&&!filled.conditionFilled)row.layer=6;if(named){row.layer=Math.min(row.layer,5);row.rank=0;row.fragment=false;}ranked.push(row);
          if(best.layer===6&&filled.boundKinds?.length)fallbacks.push({...row,layer:5,rank:10,fragment:true,wordCount:0});
          if(filled.valueChoices?.length>1)for(const [i,value]of filled.valueChoices.slice(1).entries()){const alternative=assistFillHint(h,{...data,strings:[value]},project,fillContext,best.intent);if(alternative)ranked.push({...row,...alternative,order:order+(i+1)/100});}
        }
        if(best.intent?.directions)for(const direction of best.intent.directions.slice(1)){const alt=assistFillHint(h,data,project,fillContext,{...best.intent,direction});if(alt)ranked.push({...alt,...best,order:order+0.1});}
      }else if(data.names.length){
        const schema=BLOCK_SCHEMA_BY_ID.get(id),slots=schema?sentenceRoleSlots(schema.kind,id.split(':')[1]):[];
        const nameSlot=slots.some(slot=>data.names.some(n=>n.kind===assistSlotNameKind(slot)))||['Say','ReturnStatement','LooksCommand:SET_TARGET_TEXT'].includes(id)&&data.names.some(n=>['variable','list','local','argument'].includes(n.kind));
        if(nameSlot){const filled=assistFillHint(h,data,project,fillContext);if(filled?.boundKinds?.length)fallbacks.push({...filled,schemaId:id,origin:'S3',layer:5,rank:10,fragment:true,order:candidates.length+order,exact:false,inText:false,wordCount:0,matchLength:0});}
      }
    }
    const covered=new Set(ranked.filter(r=>r.layer<6).flatMap(r=>r.boundKinds||[]));
    const anyVerb=verbs.some(verb=>all.some(h=>{const t=h.terms;return t&&match([...(t.text||[]),...(t.synonyms||[]),...(t.verbForms||[]),...(t.nounForms||[])].join(' '),verb);}));
    ranked.push(...fallbacks.filter(r=>!anyVerb&&r.boundKinds.some(kind=>!covered.has(kind))));
    const noImageName=!data.names.some(n=>['costume','backdrop'].includes(n.kind));
    for(const row of ranked){row.special=0;
      if(noImageName&&/かえ|変え|にする/.test(data.text)&&/^LooksCommand:(?:SET|NEXT|PREV)_(?:COSTUME|BACKDROP)$/.test(row.schemaId))row.special=row.schemaId.includes(':NEXT_')?-2:row.schemaId.includes(':SET_')?-1:0;
      if(/もどす|戻す/.test(data.text)&&(/はいけい|背景/.test(data.text)&&row.schemaId==='LooksCommand:PREV_BACKDROP'||/すがた|姿/.test(data.text)&&row.schemaId==='LooksCommand:PREV_COSTUME'||/タイマー|たいまー/.test(data.text)&&row.schemaId==='TimerReset'))row.special=-3;
      const otherStop=data.names.some(n=>n.kind==='part'&&project.components.some(c=>c.name===n.name&&c.id!==ctx.targetId))&&/止まる|止める|とまる|とめる/.test(data.text);
      if(otherStop&&row.schemaId==='StopCommand:OTHERS'||/ほかの動き|他の動き/.test(data.text)&&row.schemaId==='StopCommand:OWN_OTHERS')row.special=-4;
      if(row.schemaId==='Break'&&data.seeds.some(seed=>/^(?:やめる|おわる|終わる|終える|おえる|ぬける|抜ける)$/.test(seed.text)))row.special=-4;
      if(ctx.event==='cloneStart'&&row.schemaId==='CloneCommand:DELETE_SELF'&&/^自分だけ.*消える$/.test(data.text))row.special=-4;
    }
    const eligibleSchemas=new Set(candidates.map(h=>hintSchemaId(h.id).replace(/:timed$/,'')));
    for(const row of ranked)row.allowedSchemas=eligibleSchemas;
    return ranked.filter(row=>!anyVerb||row.layer<6);
  }
  function assistClauseForms(text) {
    const quoted=[],protectedText=text.replace(/「[^「」]*」|【[^【】]*】|『[^『』]*』|｢[^｢｣]*｣|"[^"]*"/g,s=>'「§'+(quoted.push(s)-1)+'§」');
    const out=new Set([text,...searchQueryVariants(protectedText).map(form=>form.replace(/「§(\d+)§」/g,(_,i)=>quoted[i]))]);
    for(const [te,word]of SENTENCE_TE_FORMS)if(text.endsWith(te))out.add(text.slice(0,-te.length)+word);
    return [...out];
  }
  function assistCompare(a,b,ctx) {
    const sharedImage=/^LooksCommand:(?:SET|NEXT|PREV)_(?:COSTUME|BACKDROP)$/;
    const group=sharedImage.test(a.schemaId)&&sharedImage.test(b.schemaId)&&a.schemaId.split('_').at(-1)===b.schemaId.split('_').at(-1);
    return a.layer-b.layer||Number(!!b.named)-Number(!!a.named)||(a.special===-4?-1:0)-(b.special===-4?-1:0)||a.rank-b.rank||Number(a.fragment)-Number(b.fragment)||(group?(a.special||0)-(b.special||0):0)||(b.wordCount||0)-(a.wordCount||0)||Number(b.exact)-Number(a.exact)||(b.matchLength||0)-(a.matchLength||0)||b.filled-a.filled||Number(b.inText)-Number(a.inText)||(a.special||0)-(b.special||0)||(ctx.level==='basic'?(Number(BASIC_BLOCK_SCHEMA_IDS.has(b.schemaId))-Number(BASIC_BLOCK_SCHEMA_IDS.has(a.schemaId))):0)||a.order-b.order||a.text.length-b.text.length||a.schemaId.localeCompare(b.schemaId);
  }
  function assistStructuredTransforms(text,data,project,ctx,basis,range) {
    const sources=[],add=(text,extra={})=>sources.push({text,...extra}),indent=body=>body.split('\n').map(line=>'  '+line).join('\n');
    const read=(source,wait=false)=>{
      const forms=assistClauseForms(source);
      for(const form of forms){const parsed=assistCanonical(form,ctx);if(parsed&&!(parsed.ast.heading)&&!(parsed.ast.body?.[0]?.kind==='IfStatement'))return parsed.text;}
      const candidates=assistSearch(project,basis,range,ctx,assistSeeds(source,ctx.symbols,ctx)).filter(c=>c.layer<6).sort((a,b)=>assistCompare(a,b,ctx));
      if(wait){const sample=candidates.find(c=>c.schemaId==='SoundCommand:SAMPLE_WAIT');if(sample)return sample.text;}
      return candidates[0]?.text;
    };
    const isCondition=source=>{for(const form of ['if','while','until','plain'])try{parseCondition(source,ctx.symbols,ctx,form);return true;}catch{}return false;};
    let m;
    if(ctx.event==='cloneStart'&&/^自分だけ消える$/.test(text))for(const id of ['CloneCommand:DELETE_SELF','LooksCommand:HIDE']){const hint=hintCandidates(project,ctx.targetId,{...ctx,source:basis,start:range.lineStart+range.indent,end:range.lineEnd}).find(h=>h.id===id&&h.enabled);if(hint)add(hint.text);}
    if((m=/^(\d+(?:\.\d+)?)秒のあいだ待つ$/.exec(text)))add(m[1]+'秒待つ。');
    if((m=/^(.+?)(\d+(?:\.\d+)?秒(?:待つ|まつ))$/.exec(text))&&/[うくぐすつぬぶむるみ]$|(?:たあと|だあと)$/.test(m[1])){const before=read(m[1].replace(/あと$/,'')),after=read(m[2]);if(before&&after)add(before+'\n'+after);}
    if(/とばして(?:次|つぎ)へ$/.test(text)){const hint=hintCandidates(project,ctx.targetId,{...ctx,source:basis,start:range.lineStart+range.indent,end:range.lineEnd}).find(h=>h.id==='Continue'&&h.enabled);if(hint)add(hint.text);}
    if(data.subjects){const body=read(data.subjects.body),owner=project.components.find(c=>c.id===ctx.targetId)?.name;if(body){const names=[...data.subjects.names.filter(name=>name!==owner),...data.subjects.names.filter(name=>name===owner)];add(names.map(name=>body.split('\n').map(line=>name+'は'+line).join('\n')).join('\n'));}}
    const own=project.components.find(c=>c.id===ctx.targetId)?.name;
    if(own&&new RegExp('^(?:自分|'+own.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')(?:の動きを|を)?(?:全部|だけ)?(?:止まる|止める|とまる|とめる)$').test(text)){add('自分のほかの動きを止める。\nこの動きを止める。');add('この動きを止める。');}
    if((m=/^(\d+(?:\.\d+)?)秒に(\d+(?:\.\d+)?)歩の速さで、?(.+)$/.exec(text))&&!/続ける|つづける/.test(m[3])){const motion=searchIntent(m[3],ctx),direction=({right:'右',left:'左',up:'上',down:'下'})[motion?.direction];if(direction)add(m[1]+'秒かけて、いまのばしょから、'+direction+'へ'+m[2]+'歩動く。');else if(motion?.direction==='forward')add('前へ'+m[2]+'歩進む。\n'+m[1]+'秒待つ。');}
    for(const list of project.projectData?.lists||[]){const q=list.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if((m=new RegExp('^'+q+'(?:の中身)?を(?:全部)?(?:(?:一|1)つずつ)?(?:順に|順番に)?(?:(\\d+(?:\\.\\d+)?)秒ずつ)?(?:言う|話す)$').exec(text))&&/順|(?:一|1)つずつ/.test(text)){const hint=hintCandidates(project,ctx.targetId,{...ctx,source:basis,start:range.lineStart+range.indent,end:range.lineEnd}).find(h=>h.id==='each:'+list.name&&h.enabled);if(hint){const parsed=assistCanonical(hint.text,ctx),node=parsed?.ast?.body?.[0],say=node?.body?.find(n=>n.kind==='Say');if(say){say.seconds=sentenceQuantity({kind:'NumberLiteral',value:Number(m[1]||1)},'秒');add(formatScript(parsed.ast));}}}}
    if(data.subject&&/^\d+回/.test(text))add(data.subject+'が'+text);
    add(text.replace(/を答えにして返す$/,'を答えとして返す'));
    add(text.replace(/を(.+?)で、(?=【[^【】]+】という(?:手順|てじゅん)を行う)/,'を$1として、'));
    if((m=/^([^、]+)と([^、]+)をわたして、(.+)$/.exec(text)))add('（'+m[1]+'、'+m[2]+'）をわたして、'+m[3]);
    if(/という(?:手順|てじゅん)をずっと行う$/.test(text)){const body=read(text.replace('をずっと行う','を行う'));if(body)add('ずっとくり返す。\n'+indent(body));}
    if(/^(?:「[^「」]+」|[^「」、]+)が.*(?:以上|以下|より|同じ)/.test(text)&&!/なら|あいだ|まで|たら|とき/.test(text)&&/待つ$/.test(text))add(text.replace(/(以上で|以下で)(?!、)/g,'$1、').replace(/キーがおされるまで待つ$/,'キーがおされている状態になるまで待つ'));
    if(/^(?:それ以外(?:は|のとき)?|それいがい(?:は|のとき)?|そうでないと|でないと|ほかは|もしそうでなければ|じゃなければ)$/.test(text))add(basis.slice(0,range.start)+'そうでなければ、'+basis.slice(range.end),{schemaId:'IfStatement',start:0,end:basis.length,whole:true});
    if((m=/^(もし.+?、)(もし.+)$/.exec(text)))add(basis.slice(0,range.start)+m[1]+'\n  '+m[2]+basis.slice(range.end),{schemaId:'IfStatement',start:0,end:basis.length,whole:true});
    if(/^(?:みんな|全員|全部|すべて)(?:止まる|とまる)$/.test(text))for(const op of ['ALL','OTHERS']){const hint=hintCandidates(project,ctx.targetId,{...ctx,source:basis,start:range.lineStart+range.indent,end:range.lineEnd}).find(h=>h.id==='StopCommand:'+op&&h.enabled);if(hint)add(hint.text);}
    if(ctx.definitionKind==='action'&&/^(?:全部|ぜんぶ)終わるまで待つ$/.test(text)&&/「[^「」]+」の合図を送る。$/.test(basis.slice(0,range.lineStart).trimEnd()))add('その合図で始まったことが全部終わるまで待つ。',{schemaId:'WaitBroadcastGroup'});
    if((m=/^(?:タイマーが)?(\d+(?:\.\d+)?)秒(?:間)?(?:たつ|すぎる|がすぎる|たつの)(?:まで待つ|を待つ)$/.exec(text)))add(m[1]+'秒待つ。');
    if((m=/^(\d+(?:\.\d+)?)秒(?:半|はん)待つ$/.exec(text)))add((Number(m[1])+0.5)+'秒待つ。');
    if((m=/^(\d+(?:\.\d+)?)秒(?:たったら|すぎたら)、?(.+)$/.exec(text))){const body=read(m[2]);if(body)add(m[1]+'秒待つ。\n'+body);}
    if((m=/^(?:(?:ずっと|いつも)?(\d+(?:\.\d+)?)(?:秒|びょう)(?:ごとに|おきに|たつごとに|に1回)(?:ずっと)?|毎秒)、?(.*)$/.exec(text))&&ctx.definitionKind!=='function'){
      const actor=/^(.*?)は$/.exec(m[2]);const tail=actor&&[project.components.find(c=>c.id===ctx.targetId)?.name,'自分'].includes(actor[1])?'':m[2];
      const body=tail?read(tail):'',header='ずっとくり返す。\n  '+(m[1]||1)+'秒待つ。';if(!tail||body&&!actor)add(header+(body?'\n'+indent(body):''));
    }
    // Repetition and sustained actions use the existing readable sentence/hint as their body.
    if((m=/^(.*?)((?:\d+))回(.+)$/.exec(text))&&!/くり返|くりかえ|繰り返/.test(m[3])){
      const body=read(m[1]+m[3],true);if(body)add(m[2]+'回くり返す。\n'+indent(body));
    }
    if((m=/^[「『](.+)[」』]を(\d+)回くり返す$/.exec(text))){
      const clauses=assistSplit(m[1],'。').map(c=>read(c.text));if(clauses.length&&clauses.every(Boolean))add(m[2]+'回くり返す。\n'+indent(clauses.join('\n')));
    }
    if((m=/^(\d+(?:\.\d+)?)秒(?:のあいだに?|間|たつまで)(?:、)?(?:ずっと)?(?:くり返す)?(?:、)?(.*)$/.exec(text))|| (m=/^(\d+(?:\.\d+)?)秒くり返す(.*)$/.exec(text))){
      const tail=m[2].replace(/^、/,'');if(!tail||tail==='くり返す')add('タイマーを0にする。\nタイマーが'+m[1]+'以上になるまで、くり返す。',{schemaId:'RepeatUntil',description:'タイマーを 0に もどします'});
      else if(!/続ける|つづける|^(?:待つ|まつ)$/.test(tail)){const body=read(tail);if(body)add('タイマーを0にする。\nタイマーが'+m[1]+'以上になるまで、くり返す。\n'+indent(body),{schemaId:'RepeatUntil',description:'タイマーを 0に もどします'});}
    }
    if(!/(?:キー|おしっぱなし|くり返|くりかえ|繰り返)/.test(text)&&(/続ける|つづける/.test(text)||/^(?:ずっと|ずーっと|くり返し)/.test(text))){
      let action=text.replace(/^(?:ずっと|ずーっと|くり返し)、?/,'');
      const duration=/^(\d+(?:\.\d+)?)秒(?:のあいだ|間)、?/.exec(action);if(duration)action=action.slice(duration[0].length);
      const speed=/(\d+(?:\.\d+)?)秒に(\d+(?:\.\d+)?)歩の速さで、?/.exec(action);if(speed)action=action.replace(speed[0],'');
      let until=/^(.+?まで)、?/.exec(action);if(until)action=action.slice(until[0].length);
      const stem=action.replace(/(?:続ける|つづける)$/,''),dictionary=[...meijinDictionary(stem),...assistClauseForms(stem)],bodyOptions=[];
      if(speed&&/動き|うごき|進み|すすみ/.test(stem)){
        const direction=/(右|左|上|下|みぎ|ひだり|うえ|した)/.exec(stem)?.[1],word=direction&&({みぎ:'右',ひだり:'左',うえ:'上',した:'下'})[direction]||direction;
        bodyOptions.push(word?speed[1]+'秒かけて、いまのばしょから、'+word+'へ'+speed[2]+'歩動く。':'前へ'+speed[2]+'歩進む。\n'+speed[1]+'秒待つ。');
      }else if(stem.trim())for(const form of dictionary){if(form.length<2)continue;const actionForm=/動|うご|進|すす/.test(stem)&&!/(?:前|後ろ|右|左|上|下|まえ|うしろ|みぎ|ひだり|うえ|した)/.test(stem)?'前へ'+form:form,body=read(actionForm,true);if(body){bodyOptions.push(body);break;}}
      for(const body of bodyOptions){const header=until?until[1]+'、くり返す。':duration?duration[1]+'回くり返す。':'ずっとくり返す。';add(header+'\n'+indent(body));}
    }
    if((m=/^(.+?)(?:ながら|つつ|のと同時に|あいだ(?:に)?)、?(.+)$/.exec(text))&&!isCondition(m[1]+'あいだ')&&!/が|キー.*(?:おされ|おして)|ふれない|^\d+(?:\.\d+)?秒の?$/.test(m[1])){
      const stem=m[1],before=[...assistClauseForms(stem),...meijinDictionary(stem)].map(form=>read(form)).find(Boolean),after=read(m[2]);
      if(before&&after){const nonwaiting=source=>source.replace(/」を鳴らす。$/,'」を鳴らし始める。').replace(/」と\d+(?:\.\d+)?秒話す。$/,'」と言う。'),a=nonwaiting(before),b=nonwaiting(after),waits=source=>/秒|歩|待つ|鳴らす。/.test(source);
        add(!waits(a)&&waits(b)?a+'\n'+b:!waits(b)&&waits(a)?b+'\n'+a:a+'\n'+b);}
    }
    // Alternate control wording is converted before the full source is diagnosed again.
    add(text.replace(/(あいだ|まで)、?(?:ずっと|何度も)(くり返す|待つ)$/,'$1、$2').replace(/^くり返しつづける$/,'ずっとくり返す'));
    add(text.replace(/(あいだ|まで)、?(?:くりかえし|くり返し|ループ(?:する)?|リピート(?:する)?|つづける|くり返しする|ずっと)$/,'$1、くり返す'));
    add(text.replace(/(?:あいだは|あいだじゅう)、くり返す$/,'あいだ、くり返す').replace(/(?:までは|までの間|までに)、?くり返す$/,'まで、くり返す').replace(/(?:ときは|なら)、くり返す$/,'あいだ、くり返す').replace(/まえに、くり返す$/,'まで、くり返す'));
    add(text.replace(/まで(?:とまる|止まる|じっとする|じっとしている|そのまま|動かない|待機する|待機|たいきする)$/,'まで待つ').replace(/まで、待つ$/,'まで待つ'));
    if(/まで$/.test(text))add(text+(basis.slice(range.lineEnd+1).match(/^\s+/)?'、くり返す。':'待つ。'));
    add(text.replace(/^(?:何|なに)も(?:せず|しないで(?:ください|ね|おく)?|しなくていい(?:よ)?)$/,'何もしない'));
    add(text.replace(/^(?:何|なに)もしなくてよい$/,'何もしない'));
    add(text.replace(/とばして(?=次の回)/,'とばして、'));
    add(text.replace(/^(もし「[^「」]+」キー)(?:がおされた|をおした)(?:とき|なら)、?$/,'$1がおされていれば、'));
    add(text.replace(/あいだ、(?!(?:くり返す|$))/,'あいだ、くり返す。\n  ').replace(/まで、(?!(?:くり返す|$))/,'まで、くり返す。\n  '));
    if((m=/^(.+まで)、(.+)$/.exec(text))){const body=read(m[2]);if(body)add(m[1]+'待つ。\n'+body);}
    // Data operations keep their exact registered target, including operators adjacent to its name.
    for(const variable of project.projectData?.variables||[]){const q=variable.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      if((m=new RegExp('^'+q+'\\s*[＝=は]\\s*(.+?)(?:にする)?$').exec(text)))add(nameSource(variable.name)+'を'+m[1]+'にする');
      if((m=new RegExp('^'+q+'を?([+＋−－-])(\\d+)(?:する)?$').exec(text)))add(nameSource(variable.name)+'を'+m[2]+(/[+＋]/.test(m[1])?'ふやす':'へらす'));
      add(text.replace(new RegExp('^'+q+'を(.+?)に(?:ふやす|増やす|へらす|減らす)$'),nameSource(variable.name)+'を$1にする'));
      add(text.replace(new RegExp('^'+q+'を(.+?)と(?:おく|置く)$'),nameSource(variable.name)+'を$1にする'));
      add(text.replace(new RegExp('^'+q+'を(.+?)(?:から|で)(?:始める|はじめる|スタートする)$'),nameSource(variable.name)+'を$1にする'));
    }
    if((m=/^大きさを(-?\d+)ずつ(?:変える|かえる)$/.exec(text)))add('大きさを（大きさ'+(Number(m[1])<0?'−':'＋')+Math.abs(Number(m[1]))+'）％にする');
    for(const list of project.projectData?.lists||[]){const q=list.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      if((m=new RegExp('^'+q+'から「([^「」]+)」を(?:消す|けす|取り出す)$').exec(text)))add(nameSource(list.name)+'の（'+nameSource(list.name)+'の中で「'+m[1]+'」がはじめて出てくる番号）番目を消す');
    }
    // These expressions share the existing 名人 arithmetic meaning, without adding reader forms.
    if((m=/^(もし)?(.+?)が(.+?)(になるまで|のあいだ|であるあいだ|あいだ|なら)(.*)$/.exec(text))&&new RegExp('^'+MEIJIN_WORD+'$').test(m[3])){
      const subject=m[2],word=meijinWordSpelling(m[3]),mode=/あいだ$/.test(m[4])?'while':m[4]==='になるまで'?'until':'if',ending=mode==='while'?'であるあいだ':mode==='until'?'になるまで':'なら',prefix=mode==='if'?'もし':'',tail=m[5];
      try{const check=meijinWordCheck(subject,word);if(check.same)add(prefix+(mode==='while'?check.same:check.same.replace(/と同じ$/,''))+ending+tail+(mode==='while'&&!tail?'、くり返す':''));
        else if(/の倍数$/.test(word)){const value=word.slice(0,-3),last=subject+'÷'+value+'のあまりが0'+(mode==='while'?'と同じ':'')+ending;add(prefix+subject+'が0とちがっていて、'+last+tail);add(prefix+last+tail);}
        else add(prefix+meijinWordTest(subject,word,m[4])+tail);
      }catch{}
    }
    if((m=/^(もし)?(.+?)が(\d+)で割り切れるなら(.*)$/.exec(text)))add('もし'+m[2]+'÷'+m[3]+'のあまりが0なら'+m[4]);
    // The arithmetic rewrites already used by 名人 are also valid ordinary conditions.
    if(/倍数|約数|偶数|奇数|割り切|からっぽ|より[右左上下]/.test(text)){
      try{let source=text.replace(/ばいすう/g,'倍数');if(/より[右左上下]/.test(source)){source=source.replace(/より([右左上下])なら/,'より$1にいれば');let implicit=false;if(!/(?:「[^「」]+」|[^もし、]+)が.+より/.test(source)){source=source.replace(/^もし/,'');source=(data.subject||own)+'が'+source;implicit=!data.subject;}const written=meijinRewrite(source,ctx.symbols,ctx);if(written){let result=written;if(implicit)result=result.replace('「'+own+'」のよこのばしょ','よこのばしょ').replace('「'+own+'」のたてのばしょ','たてのばしょ');if(!result.startsWith('もし')&&/ければ/.test(result))result='もし'+result;add(result);}}
        else{const written=meijinRewrite(source+(/、$/.test(range.text)&&!source.endsWith('、')?'、':''),ctx.symbols,ctx);if(written)add(written);}
      }catch{}
    }
    return sources.filter(entry=>entry.text!==text);
  }
  function assistSignalTransforms(text,project,ctx,basis,range) {
    if(ctx.definitionKind)return [];
    const sources=[],signals=ctx.signalNames||{sent:[],received:[]},names=[...new Set([...signals.sent,...signals.received])],owner=project.components.find(c=>c.id===ctx.targetId),known=source=>source.replace(/[「」]/g,'').split(/と|、/).every(name=>project.components.some(c=>c.name===name)),sendName=()=>signals.received.find(n=>!signals.sent.includes(n))||signals.received[0]||'開始';
    const add=(text,schemaId,description)=>sources.push({text,schemaId,...(description?{description}:{})}),send=(name,description)=>add('「'+name+'」の合図を送る。','Broadcast',description),receive=(name,body='',description)=>{if(ctx.targetId!=='stage'&&range.indent===0)add(sentenceHeadingSource({event:'message',actorRef:{kind:'self'},filter:name?{message:name}:null})+(body?'\n  '+body.replace(/\n/g,'\n  '):''),'Heading:message',description);};
    let m;
    if((m=/^(.+?)(?:に|へ)「([^「」]+)」(?:と(?:言って)?(?:知らせ|つたえ|教え|伝え)(?:る|て|ます)|の合図を(?:送る|おくる|送って|送ります))$/.exec(text))&&known(m[1]))send(m[2],'合図は、作品の みんなに とどきます');
    if((m=/^「([^「」]+)」の合図を(.+?)に(?:送る|おくる|送ります)$/.exec(text))&&known(m[2]))send(m[1],'合図は、作品の みんなに とどきます');
    if((m=/^(.+?)(?:に|へ)「([^「」]+)」と(?:言う|話す|いう)$/.exec(text))&&known(m[1])){send(m[2],'合図は、作品の みんなに とどきます');add('「'+m[2]+'」と言う。','Say');}
    if(/^合図を(?:送る|出す)$/.test(text))send(sendName());
    if(/^合図を送って、?待つ$/.test(text))add('「'+sendName()+'」の合図を送って、その合図で始まったことが全部終わるまで待つ。','BroadcastAndWait');
    if((m=/^(.+?)(?:から|の)(?:「([^「」]+)」の)?合図(?:が来た|がきた|が届いた|がとどいた|を受けた|をうけた|を受け取った|をもらった|を受信した)(?:とき|ら)、?$/.exec(text))&&known(m[1])){
      const sender=m[1].replace(/[「」]/g,''),choices=m[2]?(names.includes(sender+'から'+m[2])?[sender+'から'+m[2]]:names.includes(m[2])?[m[2]]:[m[2],sender+'から'+m[2]]):names.filter(name=>name.startsWith(sender+'から'));
      if(!choices.length)choices.push(sender+'から出発');for(const name of choices.slice(0,ASSIST_MAX))receive(name,'','送る ほうも「'+name+'」という 名前で 送ります');
    }
    if((m=/^「([^「」]+)」(?:の合図(?:が来た|がきた|が届いた|がとどいた)|が(?:来た|きた|届いた)|の合図を(?:もらった|受信した))(?:とき|ら)、?(.*)$/.exec(text))){
      let body=m[2],subject=/^(.+?)は、?$/.exec(body);if(subject){if(subject[1]!==owner?.name)return sources;body='';}receive(m[1],body);
    }
    if((m=/^(?:【([^【】]+)】|([^「」]+?))(?:の|という)?合図を受けたとき、?$/.exec(text))&&names.includes(m[1]||m[2]))receive(m[1]||m[2]);
    if(/^合図(?:が来た|がきた|が届いた|がとどいた)とき、?$/.test(text))receive(null);
    if((m=/^(?:(.+?)(?:に|へ))?「([^「」]+)」(?:の合図を(?:送って|おくって)(?:から)?|(?:と|を(?:みんなに)?)知らせて)、?(.*(?:待つ|まつ|待ちます))$/.exec(text))&&(!m[1]||known(m[1])))
      add('「'+m[2]+'」の合図を送って、その合図で始まったことが全部終わるまで待つ。','BroadcastAndWait',m[1]?'合図は、作品の みんなに とどきます':null);
    if(/^(?:その合図で始まったことが)?(?:全部|ぜんぶ|みんなが|みんなの仕事が|受けた人が)?(?:終わる|おわる)(?:まで|のを)、?(?:待つ|まつ|待ちます|待って)$/.test(text)){
      const previous=basis.slice(0,range.lineStart).trimEnd().split('\n').at(-1)||'',sent=/「([^「」]+)」の合図を送る。$/.exec(previous),wait='その合図で始まったことが全部終わるまで待つ。';
      add(sent?wait:'「'+sendName()+'」の合図を送る。\n'+wait,'WaitBroadcastGroup');
    }
    return sources;
  }
  function assistCompose(project,basis,range,ctx,data) {
    if(searchIntent(data.text)?.schemaId==='ContinuousRule')return {sources:[],composed:false};
    if(data.strings.length&&(/(?:たずね|聞[くいき]|き[くい]|質問|しつもん|言って|といい).*(?:答え|こたえ|返事)/.test(data.text)||/(?:合図.*(?:送|おく)|知らせて).*(?:待|まつ)/.test(data.text)))return {sources:[],composed:false};
    if(/をわたして|として|という(?:手順|てじゅん)を/.test(data.text))return {sources:[],composed:false};
    if(/(?:あいだ(?:は|じゅう)?|まで)、?(?:ずっと|何度も|くりかえし|くり返し|ループ(?:する)?|リピート(?:する)?|つづける|くり返しする|くり返す)$/.test(data.text))return {sources:[],composed:false};
    const clauses=data.clauses.map(c=>c.text.trim()).filter(Boolean);
    const conditional=clauses.length>1&&/^(?:もし|.*(?:たら|れば|なら|とき|あいだ|まで)$)/.test(clauses[0]);
    const connective=clauses.length>1&&/(?:て|で|たら|たあと|た後に|た後で)$/.test(clauses[0]);
    if(!conditional&&!connective)return {sources:[],composed:false};
    const parts=clauses.map((text,index)=>{
      if(index===0&&conditional)return {condition:text,options:[{text}],readable:true};
      for(const form of assistClauseForms(text)){
        try{const parsed=parseSyntax(form+'。',ctx);if(parsed.ast)return {options:[{text:formatScript(parsed.ast).trim()}],readable:true,schemaId:syntaxSchema(parsed.ast.body?.[0])?.id||parsed.ast.body?.[0]?.kind};}catch{}
      }
      const seeds=assistSeeds(text,ctx.symbols,ctx),options=assistSearch(project,basis,range,ctx,seeds).filter(c=>c.layer<6).sort((a,b)=>/^音を出/.test(text)?Number(b.schemaId==='SoundCommand:SAMPLE_WAIT')-Number(a.schemaId==='SoundCommand:SAMPLE_WAIT')||assistCompare(a,b,ctx):assistCompare(a,b,ctx)).slice(0,3).map(c=>({text:c.text,schemaId:c.schemaId,defaultNumericSlots:c.defaultNumericSlots}));
      return {options,readable:false};
    });
    const unreadable=parts.filter(p=>!p.readable);if(unreadable.length>1||parts.some(p=>!p.options.length))return {sources:[],composed:true};
    const index=parts.findIndex(p=>!p.readable),sources=[];
    for(const replacement of index<0?[null]:parts[index].options){
      if(index>=0){
        if(replacement.defaultNumericSlots||parts.some((part,i)=>i!==index&&part.readable&&part.options[0].text.replace(/[\s。]/g,'')===replacement.text.replace(/[\s。]/g,'')))continue;
      }
      const texts=parts.map((part,i)=>(i===index?replacement:part.options[0]).text),extra=index>=0&&!/^もし/.test(data.text)&&(index===0||conditional||parts[0].schemaId==='WaitTime')?{schemaId:replacement.schemaId}:{};
      if(conditional){const action=texts.slice(1).join('\n');
        if(/^(?:もし|.+あいだ、|.+まで、|.+ふれていれば、はね返る)/.test(action))sources.push({text:action,...extra});
        else sources.push({text:texts[0]+'、'+action,...extra});
      }else sources.push({text:texts.join('\n'),...extra});
    }
    if(conditional)for(const candidate of assistSearch(project,basis,range,ctx,data)){
      if(searchReading(candidate.text).startsWith(searchReading(clauses[0]+'、')))sources.push({text:candidate.text,schemaId:candidate.schemaId});
    }
    return {sources,composed:true};
  }
  function assistTransforms(text,data,project,ctx) {
    const out=new Set(),add=s=>{if(s&&s!==text)out.add(s);},quoted=[],protectedText=text.replace(/「[^「」]*」|『[^『』]*』|｢[^｢｣]*｣|"[^"]*"/g,s=>'「§'+(quoted.push(s)-1)+'§」');
    for(const v of searchQueryVariants(protectedText,{condition:true}))add(v.replace(/「§(\d+)§」/g,(_,i)=>quoted[i]));
    const restore=source=>source.replace(/「§(\d+)§」/g,(_,i)=>quoted[i]);
    const condition=/^(?:もし|.*(?:なら|ならば|たら|れば|とき(?:は)?|あいだ|間|まで|場合|うちは|かぎり)$)/.test(data.clauses[0]?.text||'')||/まで(?:待つ|まつ)$/.test(text);
    if(condition){
      const pieces=assistSplit(protectedText,'、'),head=pieces[0];
      if(head)for(const variant of searchQueryVariants(head.text,{condition:true}))add(restore(variant+protectedText.slice(head.end)));
      let normalized=protectedText;
      normalized=normalized.replace(/ふくまれて/g,'含まれて').replace(/はいって/g,'入って').replace(/でかつ|でさらに|そして|かつ/g,'で').replace(/か、または/g,'か、').replace(/もしくは|または/g,'か');
      for(const form of CONDITION_FORMS)for(const ending of [form.andYes,form.andNo].filter(Boolean).sort((a,b)=>b.length-a.length)){
        const suffix=ending.replace(/[、。]+$/,'');if(suffix)normalized=normalized.split(suffix).map((part,i,all)=>i===all.length-1?part:part+suffix).join('、').replace(/、、/g,'、');
      }
      normalized=normalized.replace(/(以上|以下|大きい|小さい|と同じ|ではない|とちがう|いる|いない|である)か(?!、)/g,'$1か、').replace(/より(大きく|小さく)、/g,'より$1て、');
      add(restore(normalized));
      const conditionVariants=new Set([protectedText,normalized,...searchQueryVariants(protectedText,{condition:true})]);
      for(const input of conditionVariants){
        let v=input.replace(/^もしコピー/,'もし自分がコピー').replace(/てる(?=あいだ|なら|、)/g,'ている').replace(/てなければ/g,'ていなければ').replace(/ているなら/g,'ていれば').replace(/ふれるなら/g,'ふれていれば').replace(/じゃなかった(?:なら|ら)/g,'と同じでなければ').replace(/(大き|小さ)くなったら/g,'$1ければ').replace(/になったとき(?:は)?/g,'になったら').replace(/(?:うちは|かぎり|の間は|間は)/g,'あいだ');
        if(/^もし自分がコピー/.test(v))v=v.replace(/じゃなかったら|と同じでなければ/,'でなければ');
        if(data.names.some(n=>n.kind==='list'))v=v.replace(/に(「§\d+§」)(?:が)?(?:いる|いた|入っていた)(?:なら|と)/g,'に$1が入っていれば');
        if(/以上で|以下で/.test(v)&&/キーがおされるまで待つ$/.test(v))v=v.replace(/(以上で|以下で)(?!、)/g,'$1、').replace(/キーがおされるまで待つ$/,'キーがおされている状態になるまで待つ');
        if(/(?:大き|小さ)ければ$/.test(v)&&!v.startsWith('もし'))v='もし'+v;
        add(restore(v));
      }
      add(restore(protectedText.replace(/より上/g,'より大きい').replace(/より下/g,'より小さい').replace(/と等しい/g,'と同じ').replace(/をこえる/g,'より大きくなる').replace(/(\d+(?:\.\d+)?)(?:てん|点|こ|個|ほ|歩|ど|度|パーセント|％)(?=以上|以下|より|と|なら|にな)/g,'$1')));
      add(restore(protectedText.replace(/くっつい|かさなっ|重なっ|さわっ|あたっ/g,'ふれ').replace(/くっつく|かさなる|重なる|さわる|あたる/g,'ふれる').replace(/クリックされた|クリックした/g,'おされた')));
    }
    add(text.replace(/，/g,'、').replace(/[．]/g,'。'));
    add(text.replace(/」って(?=言う|いう)/g,'」と'));
    add(text.replace(/(\d+(?:\.\d+)?)(?:パーセント|ぱーせんと|パー)/g,'$1％').replace(/(\d+)(?:びょう)/g,'$1秒').replace(/(\d+)(?:px|ピクセル)/g,'$1').replace(/(\d+)ばい/g,'$1倍').replace(/hz/gi,'Hz').replace(/秒間(?=[鳴な])/g,'秒'));
    if((text.match(/、/g)||[]).length===1)add(text.replace('、',''));else add(text.replace(/(\d+(?:\.\d+)?(?:歩|秒|度|％))、/g,'$1'));
    add(text.replace(/「([^「」]+)」/g,(s,name)=>data.names.some(n=>n.name===name)?name:s));
    for(const n of data.names){const name=n.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');add(text.replace(new RegExp('(?:変数|へんすう|リスト)'+name+'(?:の値|の中身)?','g'),n.name).replace(new RegExp(name+'(?:の値|の中身)','g'),n.name));}
    if(/^「[^「」]+」$/.test(text))add(text.slice(1,-1));
    add(text.replace(/^もし(?=.+(?:とき|たら)(?:、|$))/,''));
    add(text.replace(/になった(?:とき|ときは)、/g,'になったら、'));
    add(text.replace(/(毎秒|(?:(\d+(?:\.\d+)?)秒)(?:おきに|たつごとに|に1回))、?$/,(_,a,n)=>(n||1)+'秒ごとに、'));
    let m;
    if((m=/^(\d+(?:\.\d+)?)秒(?:間)?ごとに、?$/.exec(text))&&ctx.definitionKind!=='function')add('ずっとくり返す。\n  '+m[1]+'秒待つ。');
    add(text.replace(/(?:それ以外(?:は|のとき)?|それいがい(?:は|のとき)?|そうでないと|でないと|ほかは|もしそうでなければ|じゃなければ)、?$/,'そうでなければ、'));
    add(text.replace(/(?:の場合(?:は|には)?|のばあい(?:は|には)?|だったとき|なとき|の時|だと|だったなら|だったとしたら|だとしたら|ならばね|ならね)、?$/,'なら、'));
    add(text.replace(/^(ずっと){2,}/,'ずっと'));
    add(text.replace(/^(?:\/\/|／／|#|＃|--|\* |\/\*)\s*(.*?)(?:\*\/)?$/,'※ $1').replace(/。\s*(?:\/\/|／／|#|＃|--|\/\*)\s*(.*?)(?:\*\/)?$/,'。  ※ $1'));
    if((m=/^(.+?)を?([+＋−－-])(\d+)(?:する)?$/.exec(text))&&data.names.some(n=>n.kind==='variable'&&n.name===m[1]))add(m[1]+'を'+m[3]+(/[+＋]/.test(m[2])?'ふやす':'へらす'));
    if((m=/^(.+?)(?:＝|=|は)(.+?)(?:にする)?$/.exec(text))&&data.names.some(n=>n.kind==='variable'&&n.name===m[1]))add(m[1]+'を'+m[2]+'にする');
    if((m=/^(.+?)を(.+?)とする$/.exec(text))&&data.names.some(n=>n.kind==='variable'&&n.name===m[1]))add(m[1]+'を'+m[2]+'にする');
    if((m=/^(.+?)を(-?\d+)(?:ずつ変える|ずつかえる|大きくする|小さくする)$/.exec(text))&&(m[1]==='大きさ'||data.names.some(n=>n.kind==='variable'&&n.name===m[1])))add(m[1]+'を'+Math.abs(Number(m[2]))+((/小さく/.test(text)!==(Number(m[2])<0))?'へらす':'ふやす'));
    if((m=/^(.+?)を(\d+(?:\.\d+)?)(?:倍|ばい)にする$/.exec(text))&&data.names.some(n=>n.kind==='variable'&&n.name===m[1]))add(m[1]+'を'+m[1]+'×'+m[2]+'にする');
    if((m=/^向きを【?(.+?)】?にする$/.exec(text))&&data.names.some(n=>n.kind==='variable'&&n.name===m[1]))add('向きを【'+m[1]+'】度にする');
    if((m=/^(.+?)を(\d+)まで(ふやす|増やす|へらす|減らす)$/.exec(text))&&data.names.some(n=>n.kind==='variable'&&n.name===m[1])){add(m[1]+'を'+m[2]+'にする');add(m[1]+'が'+m[2]+(/ふやす|増やす/.test(m[3])?'以上':'以下')+'になるまで、くり返す。\n  '+m[1]+'を1'+(/ふやす|増やす/.test(m[3])?'ふやす':'へらす')+'。');}
    for(const name of data.names.filter(n=>n.kind==='list')){
      const q=name.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      add(text.replace(new RegExp(q+'の(\\d+)番目の(?:後|あと|うしろ)に'),(_,n)=>name.name+'の'+(Number(n)+1)+'番目に'));
      add(text.replace(new RegExp(q+'の(?:さいご|最後|最後のもの|おわり)'),name.name+'の（'+name.name+'の数）番目').replace(new RegExp(q+'の(?:先頭|最初|はじめ)'),name.name+'の1番目'));
    }
    for(const name of data.names.filter(n=>n.kind==='sound')){const q=name.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(new RegExp('^「?'+q+'」?を(?:かける|かけて|かけます)$').test(text))add('「'+name.name+'」を鳴らす。');}
    if((m=/^画面の(左下|右下|左上|右上)(?:のはし|のすみ|の角)?(?:へ|に)(?:行く|もどる|動く|移動する)$/.exec(text)))add('画面の左下のはしから、右へ'+(m[1].includes('右')?(project.stage.width||640):0)+'歩、上へ'+(m[1].includes('上')?(project.stage.height||400):0)+'歩のばしょへ行く。');
    if(/^(?:はじめ|最初|さいしょ|もと|元)(?:の)?ばしょ(?:へ|に)(?:もどる|戻る|行く)$/.test(text)){const owner=project.components.find(c=>c.id===ctx.targetId);if(owner)add('画面の左下のはしから、右へ'+owner.x+'歩、上へ'+owner.y+'歩のばしょへ行く。');}
    if(/^(?:自分|自分だけ)(?:を|の動きを)?(?:全部|だけ)?(?:止める|止まる|とめる|とまる)$/.test(text))add('自分のほかの動きを止める。\nこの動きを止める。');
    add(text.replace(/([^、。]+?)(?:を|へ|が|で)(ふれ(?:た|る|て|ている|たら))/g,(s,name,verb)=>data.names.some(n=>n.kind==='part'&&['「'+n.name+'」',n.name].includes(name))||name==='画面のはし'?name+'に'+verb:s));
    add(text.replace(/(として|をわたして)(?!、)/g,'$1、').replace(/のを(\d+)回くり返す/,'ことを$1回くり返す'));
    if(text.length<=60)add(text.replace(/([うくぐすつぬぶむる])(?:\s+|[.，．・；→])(?=.)/g,'$1。\n'));
    if(/なら|たら|あいだ|まで/.test(text))add(text.replace(/より上/g,'より大きい').replace(/より下/g,'より小さい').replace(/と等しい/g,'と同じ').replace(/さわ|くっつ|かさな|重な|あた/g,'ふれ').replace(/クリックされた|クリックした/g,'おされた'));
    for(const v of [...out])if(v.includes('、')&&/^(?:もし|.+(?:とき|たら|ごと|たび)|.+くり返す)/.test(v)){const at=v.indexOf('、');if(v.slice(at+1).trim())add(v.slice(0,at+1)+'\n  '+v.slice(at+1).trim());}
    return [...out];
  }
  function assistCandidates(project,basis,context={},diagnostic=null) {
    basis=String(basis).replace(/\r\n?/g,'\n');const ctx=assistVerificationContext({...context,symbols:context.symbols||buildSymbols(project)});
    if(context.meijin||basis.length>ASSIST_FULL_PARSE_CHARS)return [];
    let first=diagnostic;try{if(!first)first=parseSyntax(basis,context).syntaxDiagnostics[0];}catch{return [];}
    if(!first||!first.line||!['P201','P205','S317'].includes(first.code))return [];
    const existing=first.proposals||first.choices||[],range=assistSourceRange(basis,first,ctx);if(!range)return [];
    if(existing.length&&!existing.every(p=>/【([^】]+)】という(?:手順|てじゅん)を行う/.test(p.source)&&!range.text.includes(/【([^】]+)】/.exec(p.source)?.[1])))return [];
    const data=assistSeeds(range.text,ctx.symbols,ctx);if(!data.text||/^(?:※|\s*$)/.test(data.text)||!/(?:何|なに)も(?:しない|せず|ない|しなくてよい)$/.test(data.text)&&/(?:ません|ない|ず|[うくぐすつぬぶむる]な)$/.test(data.text))return [];
    if(data.headerEvent&&(ctx.definitionKind||ctx.targetId==='stage'||data.headerEvent!=='valueChanged'&&data.subject&&data.subject!==project.components.find(c=>c.id===ctx.targetId)?.name&&!['自分','体'].includes(data.subject)||data.headerEvent==='click'&&data.names.some(n=>n.kind==='part'&&project.components.some(c=>c.name===n.name&&c.id!==ctx.targetId))))return [];
    if(data.subjects&&!data.subjects.names.includes(project.components.find(c=>c.id===ctx.targetId)?.name)&&basis.slice(range.lineEnd).trim())return [];
    if(/^(?:\d+(?:\.\d+)?秒ごとに|毎秒)、.+は$/.test(data.text)&&!new RegExp('、(?:自分|'+project.components.find(c=>c.id===ctx.targetId)?.name+')は$').test(data.text))return [];
    if(/^「([^「」]+)」が\d+回/.test(data.text)&&!project.components.some(c=>c.name===/^「([^「」]+)」/.exec(data.text)[1]))return [];
    if(/^もし/.test(data.text)&&/以上と|以下と/.test(data.text))return [];
    if(!ctx.signalNames){try{ctx.signalNames=collectSignalNames(compileProject(project));}catch{ctx.signalNames={sent:[],received:[]};}}
    const previous=basis.slice(0,range.start).trimEnd().split('\n').at(-1)||'',pool=[],add=(text,origin,layer,extra={})=>{
      if(data.clauses.length>1&&/(?:たら|れば|なら|とき|あいだ|まで)$/.test(data.clauses[0].text)&&/、$/.test(String(text).trim())&&!data.clauses.slice(1).every(c=>[project.components.find(c=>c.id===ctx.targetId)?.name+'は','自分は'].includes(c.text)))return;
      const canonical=assistCanonical(text,ctx,previous);if(!canonical)return;
      const node=canonical.ast.body?.[0]||canonical.ast.rules?.[0],schemaId=extra.schemaId||(canonical.ast.heading?'Heading:'+canonical.ast.heading.event:node?syntaxSchema(node)?.id||node.kind:null);if(!schemaId)return;
      if(origin==='S2'&&/のところ(?:へ|に|まで)(?:走|はし|とぶ|動)/.test(data.text)&&node?.kind==='MotionCommand'&&node.op!=='GOTO_PART')return;
      if(schemaId==='Heading:touchStart'&&data.subject===project.components.find(c=>c.id===ctx.targetId)?.name&&canonical.ast.heading?.actorRef?.kind!=='named')return;
      if(data.clauses.length>1&&/あいだ$/.test(data.clauses[0].text)&&(canonical.ast.body?.length||0)<2&&![...(canonical.ast.body||[]),...(canonical.ast.rules||[])].some(n=>['ContinuousRule','IfStatement','RepeatWhile','RepeatUntil','RepeatCount'].includes(n.kind))&&!searchReading(canonical.text).startsWith(searchReading(data.clauses[0].text)))return;
      if(extra.fromDiagnosis&&!/(?:とき(?:は)?|たら|れば|なら|あいだ|まで)$/.test(data.clauses.at(-1)?.text||data.text)){
        let last=canonical.ast.body?.at(-1)||node;while(last?.thenBody?.length||last?.body?.length)last=(last.thenBody?.length?last.thenBody:last.body).at(-1);
        const lastSchema=last?syntaxSchema(last)?.id||last.kind:schemaId,terms=hintCandidates(project,ctx.targetId,{...ctx,source:basis,start:range.lineStart+range.indent,end:range.lineEnd}).filter(h=>hintSchemaId(h.id).replace(/:timed$/,'')===lastSchema).flatMap(h=>[h.text,...h.terms?.synonyms||[],...h.terms?.verbForms||[]]),main=assistSeeds(data.clauses.at(-1)?.text||data.text,ctx.symbols,ctx).seeds.filter(seed=>seed.text.length>=2&&/[うくぐすつぬぶむる]$/.test(seed.text));
        if(main.length&&!main.some(seed=>matchesSearch(terms.join(' '),seed.text)))return;
      }
      pool.push({text:canonical.text,schemaId,label:BLOCK_SCHEMA_BY_ID.get(schemaId)?.label||canonical.text,origin,layer,rank:0,filled:0,order:pool.length,start:range.start,end:range.end,ast:canonical.ast,...extra});
    };
    const composed=assistCompose(project,basis,range,ctx,data);
    for(const entry of [...assistStructuredTransforms(data.text,data,project,ctx,basis,range),...assistTransforms(data.text,data,project,ctx),...composed.sources]){
      const variant=typeof entry==='string'?entry:entry.text;
      const replacement=typeof entry==='object'&&entry.whole?variant:variant.replace(/\n/g,'\n'+' '.repeat(range.indent));
      const written=replacement.endsWith('。')&&basis[range.end]==='。'?replacement.slice(0,-1):replacement,changedEnd=range.start+written.length,delta=written.length-(range.end-range.start);
      let parsed;try{parsed=parseSyntax(typeof entry==='object'&&entry.whole?replacement:basis.slice(0,range.start)+replacement+(replacement.endsWith('。')&&basis[range.end]==='。'?basis.slice(range.end+1):basis.slice(range.end)),ctx);}catch{continue;}
      const from=basis.slice(0,typeof entry==='object'&&entry.whole?0:range.start).split('\n').length,to=from+replacement.split('\n').length-1,next=parsed.syntaxDiagnostics[0],outside=next&&!['P208','F504'].includes(next.code)&&(next.line<from||next.line>to);
      if(parsed.ast||outside)add(variant,'S2',2,typeof entry==='string'?(/。\s+※/.test(variant)?{schemaId:'CommentLine'}:{}):{...(entry.schemaId?{schemaId:entry.schemaId}:{}),...(entry.description?{description:entry.description}:{}),...(entry.whole?{start:entry.start,end:entry.end}:{})});
      else for(const p of parsed.syntaxDiagnostics[0]?.proposals||[]){
        if(p.start>changedEnd||p.end<range.start)continue;
        const action=/【([^】]+)】という(?:手順|てじゅん)を行う/.exec(p.source);if(action&&!data.text.includes(action[1]))continue;
        const start=p.start<=range.start?p.start:p.start>=changedEnd?p.start-delta:range.start,end=p.end<=range.start?p.end:p.end>=changedEnd?p.end-delta:range.end;
        add(p.source,'S2',2,{label:p.label,start,end,fromDiagnosis:true});
      }
    }
    // Names of signals are read once by the same collector as the work-check notices.
    for(const entry of assistSignalTransforms(data.text,project,ctx,basis,range))add(entry.text,'S4',3,{schemaId:entry.schemaId,...(entry.description?{description:entry.description}:{}),...(entry.end!==undefined?{end:entry.end}:{})});
    const allSearched=assistSearch(project,basis,range,ctx,data),searched=composed.composed?allSearched.filter(h=>searchReading(h.text.split('\n')[0].replace(/。$/,''))===searchReading(data.text)):allSearched;
    const signalGroup=pool.some(p=>p.schemaId==='WaitBroadcastGroup');
    const signalHeading=pool.filter(p=>p.origin==='S4'&&p.schemaId==='Heading:message'),directedSignal=pool.some(p=>p.origin==='S4'&&p.schemaId==='Broadcast')&&!/と(?:言う|話す|いう)$/.test(data.text),ownStop=pool.some(p=>p.schemaId==='StopCommand:OWN_OTHERS'&&p.text.includes('\n')),otherStop=data.names.some(n=>n.kind==='part'&&project.components.some(c=>c.name===n.name&&c.id!==ctx.targetId))&&/止まる|止める|とまる|とめる/.test(data.text);
    pool.push(...searched.filter(h=>(!signalGroup||!['Broadcast','BroadcastAndWait'].includes(h.schemaId))&&(!signalHeading.length||h.schemaId!=='Heading:message'||signalHeading.some(p=>p.text===h.text))&&(!directedSignal||h.schemaId!=='Say')&&(!ownStop||h.schemaId!=='StopCommand:OWN_OTHERS')&&(!otherStop||!['StopCommand:THIS','StopCommand:OWN_OTHERS','SoundCommand:STOP_ALL'].includes(h.schemaId))).map(h=>({...h,start:range.start,end:range.end})));
    pool.sort((a,b)=>assistCompare(a,b,ctx));
    const now=()=>globalThis.performance?.now?.()??Date.now();
    const contextHints=hintCandidates(project,ctx.targetId,{...ctx,source:basis,start:range.lineStart+range.indent,end:range.lineEnd}),knownSchemas=new Set(contextHints.filter(h=>h.mode==='statement').map(h=>hintSchemaId(h.id).replace(/:timed$/,'')));
    const hasHigher=pool.some(p=>p.layer<6),seen=new Set(existing.map(p=>p.source.replace(/[\s。]/g,''))),out=[],started=now();
    for(const p of pool){if(p.layer===6&&hasHigher)continue;const key=p.text.replace(/[\s。]/g,'');if(key===range.text.replace(/[\s。]/g,'')||seen.has(key))continue;
      const canonical=assistCanonical(p.text,ctx,previous);if(!canonical)continue;
      const allowed=p.allowedSchemas||new Set(hintCandidates(project,ctx.targetId,{...ctx,source:basis,start:range.lineStart+range.indent,end:range.lineEnd}).filter(h=>h.mode==='statement'&&h.enabled).map(h=>hintSchemaId(h.id)));
      const localNames=new Set([...(ctx.args||[]),...(ctx.localNames||[])]),knownFor=actor=>new Set([...(project.projectData?.variables||[]),...(project.projectData?.lists||[]),...(project.components.find(c=>c.id===actor)?.localData?.variables||[]),...(project.components.find(c=>c.id===actor)?.localData?.lists||[])].map(n=>n.name));
      const gather=node=>{if(!node||typeof node!=='object')return;if(['LocalVariableDeclaration','LocalListDeclaration'].includes(node.kind))localNames.add(node.name);if(node.kind==='ForEach')localNames.add(node.binder);for(const [k,v]of Object.entries(node))if(k!=='sourceSpan'&&v&&typeof v==='object')Array.isArray(v)?v.forEach(gather):gather(v);};gather(canonical.ast);
      let forbidden=false;const visit=(node,actor=ctx.targetId)=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(n=>visit(n,actor));return;}if(node.actorRef?.kind==='named')actor=project.components.find(c=>c.name===node.actorRef.name)?.id;else if(node.actorRef?.kind==='self')actor=ctx.targetId;const knownNames=knownFor(actor),form=sentenceFormFor(node);if(form){const schema=syntaxSchema(node)?.id||node.kind;if(!form.allowedContexts.includes(ctx.definitionKind||'script')||(knownSchemas.has(schema)||ctx.definitionKind==='function')&&!allowed.has(schema))forbidden=true;}
        if(node.heading){const ref=node.heading.actorRef,owner=ref?.kind==='named'?project.components.find(c=>c.name===ref.name):project.components.find(c=>c.id===ctx.targetId);if(!owner||!EVENT_BY_TYPE[owner.type]?.includes(node.heading.event))forbidden=true;}
        if(['VariableRead','ListRead'].includes(node.kind)&&!knownNames.has(node.name)&&!localNames.has(node.name))forbidden=true;
        if(['Assignment','NumericUpdate','ListAppend','ListInsert','ListReplace','ListDelete','ListClear'].includes(node.kind)&&node.target?.name&&!knownNames.has(node.target.name)&&!localNames.has(node.target.name))forbidden=true;
        if(node.kind==='UserActionCall'&&!project.actions.some(a=>a.name===node.name))forbidden=true;
        if(node.kind==='UserFunctionCall'&&!project.functions.some(a=>a.name===node.name))forbidden=true;
        if(node.actorRef?.kind==='named'&&!project.components.some(c=>c.name===node.actorRef.name))forbidden=true;
        if(node.kind==='MotionCommand'&&['GOTO_PART','POINT_TO'].includes(node.op)&&node.args?.[0]?.kind==='StringLiteral'&&!project.components.some(c=>c.name===node.args[0].value)&&node.args[0].value!=='マウス')forbidden=true;
        if(node.kind==='SoundCommand'&&['SAMPLE','SAMPLE_WAIT'].includes(node.op)&&node.args?.[0]?.kind==='StringLiteral'&&!project.sounds.some(c=>c.name===node.args[0].value))forbidden=true;
        if(node.kind==='LooksCommand'&&node.op==='SET_COSTUME'&&node.args?.[0]?.kind==='StringLiteral'&&!project.components.find(c=>c.id===actor)?.costumes?.some(c=>c.name===node.args[0].value))forbidden=true;
        for(const [k,v]of Object.entries(node))if(k!=='sourceSpan'&&v&&typeof v==='object')visit(v,actor);};visit(canonical.ast);
      if(p.schemaId?.startsWith('Heading:'))forbidden=forbidden||!!ctx.definitionKind||ctx.targetId==='stage';if(forbidden)continue;
      const start=p.start??range.start,end=p.end??range.end,source=(p.text.endsWith('。')&&basis[end]==='。'?p.text.slice(0,-1):p.text).replace(/\n/g,'\n'+' '.repeat(range.indent)),replacement=basis.slice(0,start)+source+basis.slice(end);let valid=false;
      const following=basis.slice(end).split('\n').slice(1).find(line=>line.trim()&&line.match(/^\s*/)[0].length<=range.indent);if(following&&/^そうでなければ、/.test(following.trim())&&canonical.ast.body?.[0]?.kind!=='IfStatement')continue;
      try{const parsed=parseSyntax(replacement,ctx),next=parsed.syntaxDiagnostics[0],from=basis.slice(0,start).split('\n').length,to=from+source.split('\n').length-1;valid=!!parsed.ast||next&&!['P208','F504'].includes(next.code)&&(next.line<from||next.line>to||next.code==='P202'&&next.line===from);}catch{}
      if(valid){const label=(p.label||BLOCK_SCHEMA_BY_ID.get(p.schemaId)?.label||p.text).replace(/いまのばしょから/g,'いまの ばしょから').replace(/決めたばしょへ/g,'決めた ばしょへ').replace(/始まったことが/g,'始まった ことが');seen.add(key);out.push({assist:true,schemaId:p.schemaId,origin:p.origin,label,text:p.text,source,start,end,...(p.description?{description:p.description}:{})});}
      if(out.length>=ASSIST_MAX||!hasHigher&&out.length>=2||now()-started>ASSIST_BUDGET_MS)break;
    }return out;
  }
  function blockPaletteSearchText(schema, project) {
    const words = [schema.label, schema.id, schema.kind, schema.palette,
      ...((BLOCK_SEARCH_SYNONYMS[schema.id] || BLOCK_SEARCH_SYNONYMS[schema.kind]) || [])];
    const operation = schema.id.includes(':') ? schema.id.slice(schema.id.indexOf(':') + 1) : null;
    for (const form of SENTENCE_FORMS) {
      if (form.kind !== schema.kind || (form.op && operation && form.op !== operation)) continue;
      // The move verbs and the verbs of ふやす・へらす are shared by blocks of other meanings: their own search words say them.
      words.push(form.intent, ...(['MotionCommand', 'NumericUpdate'].includes(schema.kind)?[]:form.verbForms || []), ...(form.nounForms || []).filter(word=>word!=='動く対象'),
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

