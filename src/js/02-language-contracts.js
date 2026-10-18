  // ────────────────────────────────────────────────────────────────────────
  // 02 — Language contracts and editor-side utilities
  // ────────────────────────────────────────────────────────────────────────
  // Fork authors configure bundled extensions and authorized policies before boot.
  let expressionDraftFormatDepth = 0;
  function configureAkariFoundation() { return { extensions: [], profiles: [], profile: null, allowedCapabilities: [] }; }
  const FOUNDATION_CONFIGURATION = configureAkariFoundation();
  const AKARI_RUNTIME = createAkariRuntime(FOUNDATION_CONFIGURATION);
  const EXTENSION_HOST = AKARI_RUNTIME.extensions;
  function extensionValueIsData(symbols, ctx = {}) {
    return symbols?.allDataNames?.has('拡張') ||
      [...(ctx.localNames || []), ...(ctx.binders || []), ...(ctx.args || [])].includes('拡張');
  }
  // Code shows the registered Japanese names; the IDs remain accepted when reading code.
  function extensionLabels(name, calculation) {
    const [id, operation] = name.split('/'), found = EXTENSION_HOST.describe(name, calculation ? 'calculations' : 'commands');
    return found ? [found.extensionName, found.displayName] : [id, operation];
  }
  function extensionSurface(name, calculation, args) {
    const [extension, operation] = extensionLabels(name, calculation);
    return `${calculation ? '拡張計算' : '拡張'}「${extension}」「${operation}」（${args.map(x => formatExpression(x)).join('、')}）`;
  }
  function extensionDefaultExpression(shape) {
    if (shape.type === 'number' && shape.unit !== null) return {kind:'QuantityLiteral',unit:shape.unit,value:{kind:'NumberLiteral',value:0}};
    if (shape.type === 'string') return {kind:'StringLiteral',value:''};
    if (shape.type === 'boolean') return {kind:'BooleanLiteral',value:false};
    if (shape.type === 'list') return {kind:'ListLiteral',items:[]};
    return {kind:'NumberLiteral',value:0};
  }
  function extensionInitialSource(shape) {
    if (shape.type === 'number') return '0' + (shape.unit || '');
    if (shape.type === 'string') return '「」';
    if (shape.type === 'boolean') return '条件の答え（あてはまらない）';
    if (shape.type === 'list') return '［］';
    return '0';
  }
  function extensionEnvelope(project) {
    const requirements = EXTENSION_HOST.requirements(), profile = AKARI_RUNTIME.profiles.requirement();
    if (!requirements.required.length && !profile) return null;
    return { ...requirements, profile, state: EXTENSION_HOST.active ? EXTENSION_HOST.snapshotState() : project?.extensions?.state || EXTENSION_HOST.initialState() };
  }

  const {
    LIMITS,
    COLOR_NAMES,
    COLOR_LABELS,
    EVENT_LABELS,
    BUILTIN_META,
    AkariError,
    ScriptSignal,
    cpLen,
    deepCopy,
    finite,
    clamp,
    exactKeys,
    safeId,
    scalar,
    listValue,
    assertRuntimeValueLimit,
    valueText,
    displayValue,
    ensureFinite,
    typeName,
    sameValue,
    validateColorHex,
    resolveColor,
    PRNG,
    nowMs,
    cloneDesignProject,
    bytesEqual,
    encodeBase64,
    decodedBase64Length,
    decodeBase64,
    rotr,
    sha256Fallback,
    sha256,
    IMMUTABLE_ASSET_RECORDS,
    makeImmutableAssetRecord,
    AssetStore,
    collectRuntimeAssetRequirements,
    AssetRuntimeCache,
    RuntimeModel,
    localScalar,
    numeric,
    UNIT_TAGS,
    quantity,
    isQuantity,
    isNumberValue,
    unitOf,
    numberValue,
    numberInUnit,
    validateExpectedUnit,
    validateRuntimeData,
    bool,
    stringv,
    integerIndex,
    unicodeIndexOf,
    evalExpression,
    evalBuiltin,
    evalSensor,
    namedArgumentDetails,
    runUserFunction,
    execFunctionNodes,
    execListMutation,
    EventScheduler,
  } = AKARI_RUNTIME;
  const LANGUAGE_CONTRACT_ID = AKARI_RUNTIME.EXECUTABLE_CONTRACT.languageContractId;
  const PROJECT_FORMAT_ID = AKARI_RUNTIME.EXECUTABLE_CONTRACT.projectFormatVersion;
  const STORAGE_KEYS = Object.freeze({
    database: 'akari-workspace-f' + PROJECT_FORMAT_ID,
    fallback: 'akari.autosave.f' + PROJECT_FORMAT_ID,
    uiLevel: 'akari.uiLevel.v1',
    editorMode: 'akari.editorMode.v1',
  });

  const EVENT_BY_TYPE = {
    stage: ['start', 'click', 'keyDown', 'message', 'backdropChanged'],
    label: ['start', 'click', 'keyDown', 'message', 'backdropChanged'],
    button: ['start', 'click', 'keyDown', 'message', 'backdropChanged'],
    box: ['start', 'click', 'keyDown', 'message', 'backdropChanged'],
    input: ['start', 'click', 'keyDown', 'message', 'backdropChanged', 'valueChanged'],
    sprite: ['start', 'click', 'keyDown', 'message', 'backdropChanged', 'cloneStart'],
  };

  const COMMAND_CATALOG = Object.freeze(
    [
      {
        id: 'Assignment',
        kind: 'Assignment',
        op: '',
        source: '点数を0にする',
      },
      {
        id: 'NumericUpdate:ADD',
        kind: 'NumericUpdate',
        op: 'ADD',
        source: '点数を1増やす',
      },
      {
        id: 'NumericUpdate:SUB',
        kind: 'NumericUpdate',
        op: 'SUB',
        source: '点数を1減らす',
      },
      {
        id: 'ListAppend',
        kind: 'ListAppend',
        op: '',
        source: '名前一覧の最後に「あかり」を入れる',
      },
      {
        id: 'ListReplace',
        kind: 'ListReplace',
        op: '',
        source: '名前一覧の1番目を「ひかり」にかえる',
      },
      {
        id: 'ListInsert',
        kind: 'ListInsert',
        op: '',
        source: '名前一覧の1番目に「ほたる」を入れる',
      },
      {
        id: 'ListDelete',
        kind: 'ListDelete',
        op: '',
        source: '名前一覧の1番目を消す',
      },
      {
        id: 'ListClear',
        kind: 'ListClear',
        op: '',
        source: '名前一覧の中身を全部消す',
      },
      {
        id: 'IfStatement',
        kind: 'IfStatement',
        op: '',
        source: 'もし点数が10以上なら、\n  何もしない',
      },
      {
        id: 'Say',
        kind: 'Say',
        op: '',
        source: '「10点以上です」と言う',
      },
      {
        id: 'RepeatCount',
        kind: 'RepeatCount',
        op: '',
        source: '3回くり返す。\n  何もしない',
      },
      {
        id: 'RepeatWhile',
        kind: 'RepeatWhile',
        op: '',
        source: '点数が100より小さいあいだ、くり返す。\n  何もしない',
      },
      {
        id: 'RepeatUntil',
        kind: 'RepeatUntil',
        op: '',
        source: '「空白」キーがおされるまで、くり返す。\n  何もしない',
      },
      {
        id: 'WaitTime',
        kind: 'WaitTime',
        op: '',
        source: '0.1秒待つ',
      },
      {
        id: 'WaitUntil',
        kind: 'WaitUntil',
        op: '',
        source: '点数が100以上になるまで待つ',
      },
      {
        id: 'ForEach',
        kind: 'ForEach',
        op: '',
        source: '名前一覧の中身を先頭から一つずつ見て、次のことを行う。\n  この中では、今見ているものを【名前】と呼ぶ。\n  何もしない',
      },
      {
        id: 'MotionCommand:MOVE',
        kind: 'MotionCommand',
        op: 'MOVE',
        source: '前へ10歩進む',
      },
      {
        id: 'MotionCommand:GOTO',
        kind: 'MotionCommand',
        op: 'GOTO',
        source: 'よこ100歩、たて50歩のばしょへ行く',
      },
      {
        id: 'MotionCommand:GLIDE',
        kind: 'MotionCommand',
        op: 'GLIDE',
        source: 'よこ200歩、たて100歩のばしょへ1秒かけて動く',
      },
      {
        id: 'MotionCommand:TURN_RIGHT',
        kind: 'MotionCommand',
        op: 'TURN_RIGHT',
        source: '右に15度回る',
      },
      {
        id: 'MotionCommand:TURN_LEFT',
        kind: 'MotionCommand',
        op: 'TURN_LEFT',
        source: '左に15度回る',
      },
      {
        id: 'MotionCommand:SET_DIRECTION',
        kind: 'MotionCommand',
        op: 'SET_DIRECTION',
        source: '向きを45度にする',
      },
      {
        id: 'MotionCommand:SET_X',
        kind: 'MotionCommand',
        op: 'SET_X',
        source: 'よこのばしょを100にする',
      },
      {
        id: 'MotionCommand:SET_Y',
        kind: 'MotionCommand',
        op: 'SET_Y',
        source: 'たてのばしょを50にする',
      },
      {
        id: 'MotionCommand:POINT_TO',
        kind: 'MotionCommand',
        op: 'POINT_TO',
        source: '「マウス」の方を向く',
      },
      {
        id: 'MotionCommand:BOUNCE',
        kind: 'MotionCommand',
        op: 'BOUNCE',
        source: '画面のはしにふれていれば、はね返る',
      },
      {
        id: 'LooksCommand:SET_SCALE',
        kind: 'LooksCommand',
        op: 'SET_SCALE',
        source: '大きさを120％にする',
      },
      {
        id: 'LooksCommand:SET_COLOR',
        kind: 'LooksCommand',
        op: 'SET_COLOR',
        source: '表示色を「赤」にする',
      },
      {
        id: 'LooksCommand:HIDE',
        kind: 'LooksCommand',
        op: 'HIDE',
        source: 'すがたをかくす',
      },
      {
        id: 'LooksCommand:SHOW',
        kind: 'LooksCommand',
        op: 'SHOW',
        source: 'すがたを見せる',
      },
      {
        id: 'LooksCommand:FRONT',
        kind: 'LooksCommand',
        op: 'FRONT',
        source: 'いちばん手前へ出る',
      },
      {
        id: 'LooksCommand:BACK',
        kind: 'LooksCommand',
        op: 'BACK',
        source: 'いちばんおくへ下がる',
      },
      {
        id: 'LooksCommand:FORWARD_LAYERS',
        kind: 'LooksCommand',
        op: 'FORWARD_LAYERS',
        source: '重なりを1つ手前にする',
      },
      {
        id: 'LooksCommand:BACKWARD_LAYERS',
        kind: 'LooksCommand',
        op: 'BACKWARD_LAYERS',
        source: '重なりを1つおくにする',
      },
      {
        id: 'PenCommand:DOWN',
        kind: 'PenCommand',
        op: 'DOWN',
        source: 'ペンを下ろす',
      },
      {
        id: 'PenCommand:SET_COLOR',
        kind: 'PenCommand',
        op: 'SET_COLOR',
        source: 'ペンの色を「青」にする',
      },
      {
        id: 'PenCommand:SET_SIZE',
        kind: 'PenCommand',
        op: 'SET_SIZE',
        source: 'ペンの太さを3にする',
      },
      {
        id: 'PenCommand:UP',
        kind: 'PenCommand',
        op: 'UP',
        source: 'ペンを上げる',
      },
      {
        id: 'PenCommand:STAMP',
        kind: 'PenCommand',
        op: 'STAMP',
        source: '今のすがたのスタンプをおす',
      },
      {
        id: 'PenCommand:CLEAR',
        kind: 'PenCommand',
        op: 'CLEAR',
        source: '作品の線とスタンプを全部消す',
      },
      {
        id: 'LooksCommand:SET_BACKDROP',
        kind: 'LooksCommand',
        op: 'SET_BACKDROP',
        source: 'はいけいを「空色」にかえる',
      },
      {
        id: 'LooksCommand:NEXT_BACKDROP',
        kind: 'LooksCommand',
        op: 'NEXT_BACKDROP',
        source: '次のはいけいにかえる',
      },
      {
        id: 'LooksCommand:PREV_BACKDROP',
        kind: 'LooksCommand',
        op: 'PREV_BACKDROP',
        source: '前のはいけいにかえる',
      },
      {
        id: 'LooksCommand:SET_COSTUME',
        kind: 'LooksCommand',
        op: 'SET_COSTUME',
        source: 'すがたを「たくどん」にかえる',
      },
      {
        id: 'LooksCommand:NEXT_COSTUME',
        kind: 'LooksCommand',
        op: 'NEXT_COSTUME',
        source: '次のすがたにかえる',
      },
      {
        id: 'LooksCommand:PREV_COSTUME',
        kind: 'LooksCommand',
        op: 'PREV_COSTUME',
        source: '前のすがたにかえる',
      },
      {
        id: 'LooksCommand:SET_TARGET_TEXT',
        kind: 'LooksCommand',
        op: 'SET_TARGET_TEXT',
        source: '「ボタン1」の文字を「始める」にかえる',
      },
      {
        id: 'SoundCommand:TONE',
        kind: 'SoundCommand',
        op: 'TONE',
        source: '440Hzの音を0.2秒鳴らし始める',
      },
      {
        id: 'SoundCommand:TONE_WAIT',
        kind: 'SoundCommand',
        op: 'TONE_WAIT',
        source: '440Hzの音を0.2秒鳴らす',
      },
      {
        id: 'SoundCommand:SET_VOLUME',
        kind: 'SoundCommand',
        op: 'SET_VOLUME',
        source: '音の大きさを50％にする',
      },
      {
        id: 'SoundCommand:PITCH_UP',
        kind: 'SoundCommand',
        op: 'PITCH_UP',
        source: '音の高さを1段階上げる',
      },
      {
        id: 'SoundCommand:PITCH_DOWN',
        kind: 'SoundCommand',
        op: 'PITCH_DOWN',
        source: '音の高さを1段階下げる',
      },
      {
        id: 'SoundCommand:STOP_ALL',
        kind: 'SoundCommand',
        op: 'STOP_ALL',
        source: 'すべての音を止める',
      },
      {
        id: 'Broadcast',
        kind: 'Broadcast',
        op: '',
        source: '「開始」の合図を送る',
      },
      {
        id: 'BroadcastAndWait',
        kind: 'BroadcastAndWait',
        op: '',
        source: '「開始」の合図を送って、その合図で始まったことが全部終わるまで待つ',
      },
      {
        id: 'Ask',
        kind: 'Ask',
        op: '',
        source: '「名前は？」とたずねて、答えを待つ',
      },
      {
        id: 'LocalVariableDeclaration',
        kind: 'LocalVariableDeclaration',
        op: '',
        source: 'この中だけで使う変数【合計】を作り、最初は0にする',
      },
      {
        id: 'ReturnStatement',
        kind: 'ReturnStatement',
        op: '',
        source: '合計を答えとして返す',
      },
      {
        id: 'CloneCommand:CREATE_SELF',
        kind: 'CloneCommand',
        op: 'CREATE_SELF',
        source: '自分のコピーを作る',
      },
      {
        id: 'CloneCommand:CREATE_TARGET',
        kind: 'CloneCommand',
        op: 'CREATE_TARGET',
        source: '「たくどん」のコピーを作る',
      },
      {
        id: 'CloneCommand:DELETE_SELF',
        kind: 'CloneCommand',
        op: 'DELETE_SELF',
        source: 'このコピーだけを消す',
      },
      {
        id: 'StopCommand:THIS',
        kind: 'StopCommand',
        op: 'THIS',
        source: 'この動きを止める',
      },
      {
        id: 'StopCommand:OTHERS',
        kind: 'StopCommand',
        op: 'OTHERS',
        source: 'ほかの動きをぜんぶ止める',
      },
      {
        id: 'StopCommand:ALL',
        kind: 'StopCommand',
        op: 'ALL',
        source: '作品ぜんぶを止める',
      },
      {
        id: 'LooksCommand:SET_SELF_TEXT',
        kind: 'LooksCommand',
        op: 'SET_SELF_TEXT',
        source: '自分の文字を「文字」にかえる',
      },
      {
        id: 'LooksCommand:SET_INPUT',
        kind: 'LooksCommand',
        op: 'SET_INPUT',
        source: '「入力らん1」に「答え」を入れる',
      },
      {
        id: 'SoundCommand:SAMPLE',
        kind: 'SoundCommand',
        op: 'SAMPLE',
        source: '「ベル」を鳴らし始める',
      },
      {
        id: 'SoundCommand:SAMPLE_WAIT',
        kind: 'SoundCommand',
        op: 'SAMPLE_WAIT',
        source: '「ベル」を鳴らす',
      },
      {
        id: 'Break',
        kind: 'Break',
        op: '',
        source: 'このくり返しを終える',
      },
      {
        id: 'Continue',
        kind: 'Continue',
        op: '',
        source: 'この回の残りをとばして、次の回へ進む',
      },
      {
        id: 'LocalListDeclaration',
        kind: 'LocalListDeclaration',
        op: '',
        source: 'この中だけで使うリスト【結果】を空で作る',
      },
      {
        id: 'Forever',
        kind: 'Forever',
        op: '',
        source: 'ずっとくり返す。\n  何もしない',
      },
      {
        id: 'UserActionCall',
        kind: 'UserActionCall',
        op: '',
        source: '3をわたして、【増やす】という手順を行う',
      },
      {
        id: 'NoOperation',
        kind: 'NoOperation',
        op: '',
        source: '何もしない',
      },
      ...EXTENSION_HOST.operations('commands').map(operation => ({id:'ExtensionCommand:'+operation.name,kind:'ExtensionCommand',op:'',source:`拡張「${operation.extensionName}」「${operation.displayName}」（${operation.args.map(extensionInitialSource).join('、')}）`})),
    ].map((x) =>
      Object.freeze({
        ...x,
        source: x.source + '。',
      }),
    ),
  );

  function insertionContext(source, start = source.length, end = start) {
    start = clamp(Math.trunc(start) || 0, 0, source.length);
    end = clamp(Math.trunc(end) || 0, start, source.length);
    const before = source.slice(0, start),
      after = source.slice(end),
      head = before.slice(before.lastIndexOf('\n') + 1),
      tail = after.split('\n')[0],
      stack = [];
    const lines = normalizeSource(before.slice(0, before.lastIndexOf('\n') + 1)).lines;
    let executable = false;
    for (const l of lines) {
      if (!l.code) continue;
      const indent=l.raw.match(/^ */)[0].length,s=compactOutsideString(l.code);
      while(stack.length&&stack.at(-1).indent>=indent)stack.pop();
      const binding=s.match(/^この中では、今見ているものを(.+?)と呼ぶ$/);
      if(binding&&stack.at(-1)?.kind==='ForEach'){stack.at(-1).binder=declarationName(binding[1]);continue;}
      if(!/^(?:この中だけで使う変数.+?を作り、最初は.+?にする|この中だけで使うリスト.+?を空で作る|.+?という変数を作り、初期値を.+?にする|.+?というリストを作る)$/.test(s))executable=true;
      let header=null;
      try{header=readBlockHead(s,undefined,{lineNo:l.lineNo});}catch(error){if(!(error instanceof AkariError))throw error;}
      if(header&&!header.inlineBody){
        const loop=['RepeatCount','RepeatWhile','RepeatUntil','Forever','ForEach'].includes(header.kind);
        stack.push({indent,loop,kind:header.kind,binder:header.kind==='ForEach'?header.binder:null});
      }
    }
    const selected = source.slice(start, end),
      indentText = head.match(/^ */)[0] || (!head && selected ? selected.match(/^ */)[0] : '');
    const indent = indentText.length;
    while (stack.length && stack.at(-1).indent >= indent) stack.pop();
    const suffix = normalizeSource(after).lines.filter((x) => x.code);
    return {
      start,
      end,
      before,
      after,
      head,
      tail,
      indentText,
      statementSlot: !head.trim() && !tail.trim(),
      insideLoop: stack.some((x) => x.loop),
      binders: stack.filter((x) => x.binder).map((x) => x.binder),
      depth: stack.length,
      declarationSlot: !executable && !stack.length,
      returnSlot: !stack.length && !suffix.length && !lines.some((x) => /(?:を返す|を答えとして返す)$/.test(compactOutsideString(x.code))),
      locals: localDeclarationNames(before),
    };
  }
  function insertSource(source, start, end, text, mode = 'statement') {
    const c = insertionContext(source, start, end);
    if (mode === 'expression') {
      const out = c.before + text + c.after;
      return {
        source: out,
        start: c.before.length + text.length,
        end: c.before.length + text.length,
      };
    }
    if (!c.statementSlot)
      throw new AkariError(
        'P201',
        'ここには やることを 入れられません。あいている 行か、1行 全部を えらんでから 入れてね',
      );
    const indent = c.indentText,
      body = (c.head ? '' : indent) + text.split('\n').join('\n' + indent),
      suffix = c.after && !c.after.startsWith('\n') ? '\n' : '';
    const pos = c.before.length + body.length;
    return { source: c.before + body + suffix + c.after, start: pos, end: pos };
  }
  function hintCandidates(project, targetId, options = {}) {
    const source = options.source ?? '',
      start = options.start ?? source.length,
      end = options.end ?? start,
      place = insertionContext(source, start, end),
      kind = options.definitionKind || null,
      pure = kind === 'function',
      component = project.components.find((c) => c.id === targetId),
      type = kind ? 'any' : component?.type || 'stage',
      event = options.event || 'start',
      out = [],
      seen = new Set();
    const labels = {
      MotionCommand: '\u52d5\u304d',
      LooksCommand: '\u898b\u305f\u76ee',
      PenCommand: '\u30da\u30f3',
      SoundCommand: '\u97f3',
      CloneCommand: 'コピー',
      StopCommand: '止める',
      Say: '言う・たずねる',
      Ask: '言う・たずねる',
      Broadcast: '合図',
      BroadcastAndWait: '合図',
      WaitTime: '待つ',
      WaitUntil: '待つ',
    };
    const intentTerms = {
      '\u52d5\u304d': ['動く', 'うごく', '移動', '進む', 'すすむ'],
      '\u898b\u305f\u76ee': ['見せる', 'かくす', '表示', '話す', 'しゃべる'],
      '言う・たずねる': ['話す', 'はなす', 'しゃべる', '質問', '答え'],
      'もし・くり返し': ['もし', 'くり返す', '繰り返す', '条件'],
      '待つ': ['待つ', 'まつ', '時間', '秒'],
      'へんすう': ['へんすう', '中身', '記録', '変数', '値'],
      '\u30ea\u30b9\u30c8': ['リスト', '一覧', '並べる', 'これ'],
      'へんすう・リストの 中身': ['へんすう', '中身', '記録', '変数', '値'],
      '\u8a08\u7b97': ['計算', '答え', '値を求める'],
      'てじゅん': ['手順', '呼び出す', '実行'],
    };
    let activeBinding = null;
    const add = (id, category, text, mode = 'statement', reason = '', binding = activeBinding) => {
      const key = mode + '|' + text;
      if (seen.has(key)) return;
      seen.add(key);
      if (mode === 'statement' && !place.statementSlot)
        reason =
          reason ||
          '行の とちゅうでは 計算だけ 使えます';
      const schemaKey = hintSchemaId(id);
      const semanticForms = SENTENCE_FORMS.filter(form =>
        schemaKey === form.id ||
        (form.kind && schemaKey.startsWith(form.kind + ':') && (!form.op || schemaKey.includes(form.op)))
      );
      const idTerms = [
        ...((BLOCK_SEARCH_SYNONYMS[schemaKey] || BLOCK_SEARCH_SYNONYMS[id] || BLOCK_SEARCH_SYNONYMS[schemaKey.split(':')[0]]) || []),
        ...semanticForms.flatMap(form => [form.intent, ...(form.kind==='MotionCommand'?[]:form.verbForms || []), ...(form.nounForms || []).filter(word=>word!=='動く対象'), ...(form.acceptedReadings || [])]),
      ];
      out.push({
        id,
        category,
        text,
        mode,
        enabled: !reason,
        reason,
        binding,
        searchTerms: [...new Set([...(intentTerms[category] || []), ...idTerms])],
      });
    };
    const bindings = [],
      names = new Set();
    const bind = (name, qualifier, value, bkind, readonly = false) => {
      const text = nameSource(name, qualifier);
      if (names.has(text)) return;
      names.add(text);
      bindings.push({ name, text, value, kind: bkind, readonly, qualifier, local: !qualifier });
    };
    for (const a of options.args || []) bind(a, null, 0, 'dynamic');
    for (const a of place.locals.vars) bind(a, null, 0, 'scalar');
    for (const a of place.locals.lists) bind(a, null, [], 'list');
    for (const a of place.binders) bind(a, null, 0, 'scalar', true);
    for (const a of project.projectData.variables)
      bind(a.name, 'project', a.initialValue, 'scalar');
    for (const a of project.projectData.lists) bind(a.name, 'project', a.initialValue, 'list');
    const localComponents = kind ? project.components : component ? [component] : [];
    for (const c of localComponents) {
      for (const a of c.localData.variables) bind(a.name, 'self', a.initialValue, 'scalar');
      for (const a of c.localData.lists) bind(a.name, 'self', a.initialValue, 'list');
    }
    const n = bindings.find((x) => x.kind !== 'list' && typeof x.value === 'number'),
      v = n?.text || '0',
      usedNames = new Set(bindings.map((x) => x.name)),
      binder = initialBlockName('これ', usedNames);
    for (const x of COMMAND_CATALOG) {
      let text = x.source,
        reason = '';
      if (
        [
          'Assignment',
          'NumericUpdate',
          'ListAppend',
          'ListInsert',
          'ListReplace',
          'ListDelete',
          'ListClear',
          'LocalVariableDeclaration',
          'LocalListDeclaration',
          'ReturnStatement',
          'ForEach',
          'UserActionCall',
        ].includes(x.kind)
      )
        continue;
      const effect = [
        'Say',
        'Ask',
        'Broadcast',
        'BroadcastAndWait',
        'WaitTime',
        'WaitUntil',
        'MotionCommand',
        'LooksCommand',
        'PenCommand',
        'SoundCommand',
        'CloneCommand',
        'StopCommand',
      ].includes(x.kind);
      if (pure && effect) continue;
      if (['Break', 'Continue'].includes(x.kind) && !place.insideLoop) continue;
      if (x.kind === 'IfStatement')
        text = `もし${v}が10以上なら、\n  何もしない。\nそうでなければ、\n  何もしない。`;
      if (x.kind === 'RepeatWhile')
        text = `${v}が10より小さいあいだ、くり返す。\n  何もしない。`;
      if (x.kind === 'RepeatUntil')
        text = `「空白」キーがおされるまで、くり返す。\n  何もしない。`;
      if (x.kind === 'WaitUntil')
        text = '\u300c\u7a7a\u767d\u300dキーがおされるまで\u5f85\u3064';
      const actorRequired =
        ['MotionCommand', 'PenCommand'].includes(x.kind) ||
        (x.kind === 'LooksCommand' &&
          ![
            'SET_BACKDROP',
            'NEXT_BACKDROP',
            'PREV_BACKDROP',
            'SET_TARGET_TEXT',
            'SET_INPUT',
          ].includes(x.op));
      if (actorRequired && type === 'stage')
        reason = 'キャラクターや 部品で 使えます';
      if (x.kind === 'LooksCommand' && x.op.includes('COSTUME')) {
        if (!['sprite', 'any'].includes(type)) reason = 'キャラクターだけで使えます';
        if (x.op === 'SET_COSTUME') {
          const co = component?.costumes?.[0];
          text = `すがたを「${co?.name || 'たくどん'}」にかえる`;
          if (!co)
            reason =
              reason ||
              '使う キャラクターの すがたの 名前に かえます';
        }
      }
      if (x.op === 'SET_BACKDROP')
        text = `はいけいを「${project.stage.backdrops[0].name}」にかえる`;
      if (
        x.kind === 'LooksCommand' &&
        x.op === 'SET_SELF_TEXT' &&
        !['label', 'button', 'box', 'any'].includes(type)
      )
        reason = '文字・ボタン・四角だけで 使えます';
      if (x.op === 'SET_INPUT') {
        const c = project.components.find((c) => c.type === 'input');
        text = `\u300c${c?.name || '入力らん1'}\u300d\u306b\u300c\u3053\u3093\u306b\u3061\u306f\u300d\u3092\u5165\u308c\u308b`;
        if (!c) reason = '入力らんを 先に 作ります';
      }
      if (x.op === 'SET_TARGET_TEXT') {
        const c = project.components.find((c) => ['label', 'button', 'box'].includes(c.type));
        text = `「${c?.name || '文字1'}」の文字を「こんにちは」にかえる`;
        if (!c)
          reason =
            '\u6587\u5b57\u30fb\u30dc\u30bf\u30f3\u30fb\u56db\u89d2\u3092\u5148\u306b\u4f5c\u308a\u307e\u3059';
      }
      if (x.kind === 'CloneCommand') {
        if (x.op === 'CREATE_TARGET') {
          const c = project.components.find((c) => c.type === 'sprite');
          text = `「${c?.name || 'たくどん'}」のコピーを作る`;
          if (!c) reason = 'キャラクターを先に作ります';
        } else if (!['sprite', 'any'].includes(type)) reason = 'キャラクターだけで使えます';
        if (x.op === 'DELETE_SELF' && !kind && event !== 'cloneStart')
          reason = 'コピーが できたときの 動きで 使います';
      }
      if (x.kind === 'SoundCommand' && ['SAMPLE', 'SAMPLE_WAIT'].includes(x.op)) {
        const snd = project.sounds[0];
        text = `「${snd?.name || 'ベル'}」を${x.op === 'SAMPLE' ? '鳴らし始める' : '鳴らす'}`;
        if (!snd) reason = '音を 先に 入れます';
      }
      add(x.id, labels[x.kind] || 'もし・くり返し', text, 'statement', reason);
    }
    if (!pure) add('MotionCommand:MOVE_DIRECTION', '動き', '画面の右へ10歩動く。', 'statement',
      type === 'stage' ? 'キャラクターや 部品で 使えます' : '');
    for (const b of bindings) {
      activeBinding = {name:b.name, qualifier:b.qualifier, kind:b.kind};
      const name = b.text;
      add('read:' + name, 'へんすう・リストの 中身', name, 'expression');
      if (!b.readonly && (!pure || b.local)) {
        if (b.kind !== 'list') {
          add('set:' + name, 'へんすう', `${name}\u30920\u306b\u3059\u308b`);
          add('add:' + name, 'へんすう', `${name}を1増やす`);
          add('subtract:' + name, 'へんすう', `${name}を1減らす`);
        }
        if (b.kind !== 'scalar') {
          for (const [id, suffix] of [
            ['append', '\u306e\u6700\u5f8c\u306b1\u3092\u5165\u308c\u308b'],
            ['insert', 'の1番目に1を入れる'],
            ['replace', 'の1番目を1にかえる'],
            ['delete', '\u306e1\u756a\u76ee\u3092\u6d88\u3059'],
            ['clear', '\u306e\u4e2d\u8eab\u3092\u5168\u90e8\u6d88\u3059'],
          ])
            add(id + ':' + name, '\u30ea\u30b9\u30c8', name + suffix);
          add(
            'assignList:' + name,
            '\u30ea\u30b9\u30c8',
            `${name}\u3092\uff3b1\u30012\u30013\uff3d\u306b\u3059\u308b`,
          );
        }
      }
      if (b.kind !== 'scalar') {
        add(
          'each:' + name,
          '\u30ea\u30b9\u30c8',
          blockSource('ForEach',{list:name,binder:nameSource(binder)})+'。\n  何もしない。',
        );
        for (const suffix of [
          '\u306e\u9577\u3055',
          '\u306e1\u756a\u76ee',
          'に1が入っている',
          'の中で1がはじめて出てくる番号',
        ])
          add(
            'listExpr:' + name + suffix,
            'へんすう・リストの 中身',
            name + suffix,
            'expression',
          );
      }
    }
    activeBinding = null;
    if (kind && place.declarationSlot) {
      const fresh = initialBlockName('けっか', usedNames);
      add(
        'localScalar',
        'この中だけの へんすう・リスト',
        `この中だけで使う変数【${fresh}】を作り、最初は0にする`,
      );
      add(
        'localList',
        'この中だけの へんすう・リスト',
        `この中だけで使うリスト【${fresh}】を空で作る`,
      );
    }
    if (pure && place.returnSlot) {
      add('return:0', '\u8fd4\u3059', '0を答えとして返す');
      for (const b of bindings)
        add('return:' + b.text, '\u8fd4\u3059', b.text + 'を答えとして返す');
    }
    for (const d of project.actions)
      if (!pure)
        add(
          'action:' + d.id,
          'てじゅん',
          `${d.args.length ? d.args.map(arg => `${nameSource(arg)}を1`).join('、') + 'として、' : ''}【${d.name}】という手順を行う`,
          'statement', '', {kind:'action', id:d.id, name:d.name},
        );
    for (const d of project.functions)
      add(
        'function:' + d.id,
        '答えを もとめる',
        `（${d.args.length ? d.args.map(arg => `${nameSource(arg)}を1`).join('、') + 'として、' : ''}【${d.name}】で求めた答え）`,
        'expression', '', {kind:'function', id:d.id, name:d.name},
      );
    const exclusive = {
      '\u62bc\u3055\u308c\u305f\u30ad\u30fc': 'keyDown',
      '\u53d7\u3051\u53d6\u3063\u305f\u77e5\u3089\u305b': 'message',
      '\u4ee5\u524d\u306e\u5024': 'valueChanged',
      '\u65b0\u3057\u3044\u5024': 'valueChanged',
      '\u4ee5\u524d\u306e\u80cc\u666f\u540d': 'backdropChanged',
      '\u65b0\u3057\u3044\u80cc\u666f\u540d': 'backdropChanged',
    };
    for (const sensor of GRAMMAR_REGISTRY.sensors) {
      if (exclusive[sensor] && (kind || exclusive[sensor] !== event)) continue;
      if (
        type === 'stage' &&
        [
          '\u6a2a\u4f4d\u7f6e',
          '\u7e26\u4f4d\u7f6e',
          '\u65b9\u5411',
          '\u5927\u304d\u3055',
          '\u30af\u30ed\u30fc\u30f3\u3067\u3042\u308b',
        ].includes(sensor)
      )
        continue;
      if (
        !['sprite', 'any'].includes(type) &&
        ['\u8863\u88c5\u756a\u53f7', '\u8863\u88c5\u540d'].includes(sensor)
      )
        continue;
      // The candidate is the written word (SENSOR_SURFACES), not the internal sensor name.
      add('sensor:' + sensor, 'しらべる', SENSOR_SURFACES[sensor] || sensor, 'expression');
    }
    const exprs = [
      '2\uff0b3\u00d74',
      '\uff082\uff0b3\uff09\u00d74',
      '2\uff3e3',
      '\uff0d2',
      '条件の答え（あてはまる）',
      '条件の答え（あてはまらない）',
      '1\u304c2\u3088\u308a\u5c0f\u3055\u3044',
      '1\u304c0\u3088\u308a\u5927\u304d\u3044',
      '1\u304c1\u4ee5\u4e0a',
      '1\u304c1\u4ee5\u4e0b',
      '1\u304c1\u3068\u540c\u3058',
      '1が2とちがう',
      '条件（条件の答え（あてはまる））が成り立たない',
      '条件の答え（あてはまる）かつ条件の答え（あてはまらない）',
      '条件の答え（あてはまる）または条件の答え（あてはまらない）',
      '\u300c\u3042\u304b\u308a\u300d\u306e\u6587\u5b57\u6570',
      '\u300c\u3042\u304b\u308a\u300d\u306e1\u6587\u5b57\u76ee',
      '「あかり」の中で「か」がはじめて出てくる番号',
      '\uff3b1\u30012\u30013\uff3d',
      '「空白」キーがおされている',
    ];
    if (type !== 'stage')
      exprs.push(
        '画面のはしにふれている',
        '「マウス」までのきょり',
        '「赤」の色にふれている',
      );
    for (const c of project.components)
      if (c.type === 'input') exprs.push(`\u300c${c.name}\u300dの中身`);
    for (const operation of EXTENSION_HOST.operations('calculations')) exprs.push(extensionSurface(operation.name,true,operation.args.map(extensionDefaultExpression)));
    if (EXTENSION_HOST.operations('events').length) exprs.push('拡張「できごとの値」');
    for (const text of exprs) add('expr:' + text, '計算', text, 'expression');
    for (const b of GRAMMAR_REGISTRY.builtins) {
      const args =
        b.name === '\u6570'
          ? ['\u300c12\u300d']
          : Array.from({ length: Math.max(b.minArgs, ['最小', '最大'].includes(b.name) ? 2 : 0) }, (_, i) => String(i + 1));
      // The written form, as the formatter writes it (1から2のどれか, 1÷2のあまり, （1と2をつなげた文字）).
      add(
        'builtin:' + b.name,
        'はじめから ある 計算',
        b.name === '乱数' && args.length === 2 ? `${args[0]}から${args[1]}のどれか` : b.name === '余り' ? `${args[0]}÷${args[1]}のあまり` : b.name === 'つなぐ' ? `（${args.join('と')}をつなげた文字）` : `${BUILTIN_SURFACES[b.name] || b.name}（${args.join('、')}）`,
        'expression',
      );
    }
    return out;
  }

  function availableHints(project, targetId, level = 'advanced') {
    return hintCandidates(project, targetId, { level })
      .filter((x) => x.enabled && x.mode === 'statement')
      .map((x) => x.text);
  }

  const GRAMMAR_REGISTRY = Object.freeze({
    reserved: Object.freeze([
      '何もしない',
      '真',
      '偽',
      'ここまで',
      'そうでなければ',
      'ずっと',
      '自分',
      '作品',
      '横位置',
      '縦位置',
      'よこのばしょ',
      'たてのばしょ',
      'すがたの名前',
      'すがたの番号',
      'はいけいの名前',
      'はいけいの番号',
      '受けた合図',
      'おされたキー',
      '前の中身',
      '新しい中身',
      '方向',
      '大きさ',
      '答え',
      'タイマー',
      '押されたキー',
      '受け取った知らせ',
      '以前の値',
      '新しい値',
      '以前の背景名',
      '新しい背景名',
      'なら',
      'あいだ',
      '間',
      'まで',
      '条件',
    ]),
    builtins: AKARI_RUNTIME.BUILTIN_DEFINITIONS,
    sensors: Object.freeze([
      'マウスが押されている',
      'マウスの横位置',
      'マウスの縦位置',
      '以前の背景名',
      '新しい背景名',
      '受け取った知らせ',
      '押されたキー',
      'クローンである',
      '背景番号',
      '背景名',
      '衣装番号',
      '衣装名',
      '横位置',
      '縦位置',
      '方向',
      '大きさ',
      'タイマー',
      '答え',
      '音量',
      '音程',
      '以前の値',
      '新しい値',
    ]),
    hints: Object.freeze({
      basic: Object.freeze(
        COMMAND_CATALOG.filter((x) =>
          ['Assignment', 'NumericUpdate', 'IfStatement', 'RepeatCount', 'Say', 'WaitTime'].includes(
            x.kind,
          ),
        ).map((x) => x.source),
      ),
      advanced: Object.freeze(COMMAND_CATALOG.map((x) => x.source)),
      functionSafe: Object.freeze(
        COMMAND_CATALOG.filter((x) =>
          [
            'LocalVariableDeclaration',
            'LocalListDeclaration',
            'ForEach',
            'ReturnStatement',
          ].includes(x.kind),
        ).map((x) => x.source),
      ),
      sound: Object.freeze(
        COMMAND_CATALOG.filter((x) => x.kind === 'SoundCommand').map((x) => x.source),
      ),
    }),
  });

  const BUILTIN_NAMES = new Set(BUILTIN_META.keys());
  const FIXED_SENSORS = [...GRAMMAR_REGISTRY.sensors];
  // Written words of sensors whose internal name differs (the standard spelling the formatter writes).
  const SENSOR_SURFACES = Object.freeze({
    'クローンである': '自分がコピーである', '横位置': 'よこのばしょ', '縦位置': 'たてのばしょ',
    'マウスの横位置': 'マウスのよこのばしょ', 'マウスの縦位置': 'マウスのたてのばしょ', 'マウスが押されている': 'マウスがおされている',
    '衣装名': 'すがたの名前', '衣装番号': 'すがたの番号', '背景名': 'はいけいの名前', '背景番号': 'はいけいの番号',
    '以前の背景名': '前のはいけいの名前', '新しい背景名': '新しいはいけいの名前', '受け取った知らせ': '受けた合図',
    '押されたキー': 'おされたキー', '以前の値': '前の中身', '新しい値': '新しい中身', '音程': '音の高さ', '音量': '音の大きさ',
  });
  // Internal names that are no longer read in code (the owner cut them); the others stay readable.
  const SENSOR_CUT_WORDS = Object.freeze(['クローンである']);
  // Block names: the written word, with spaces where a child reads them in pieces.
  const SENSOR_LABELS = Object.freeze({
    'マウスの横位置': 'マウスの よこのばしょ', 'マウスの縦位置': 'マウスの たてのばしょ', 'マウスが押されている': 'マウスが おされている',
    '以前の背景名': '前の はいけいの名前', '新しい背景名': '新しい はいけいの名前',
  });
  // Builtin calculations whose written word differs from the internal name.
  const BUILTIN_SURFACES = Object.freeze({ '余り': 'あまり' });
  const BUILTIN_LABELS = Object.freeze({ '数': '数に直す', '文字': '文字に直す', '乱数': 'AからBのどれか', '余り': 'あまり' });
  // Every written sensor word is reserved like the internal one, so a same-named datum is written 【name】.
  const RESERVED = new Set([...GRAMMAR_REGISTRY.reserved, ...GRAMMAR_REGISTRY.sensors, ...Object.values(SENSOR_SURFACES)]);
  const GRAMMAR_HINTS = GRAMMAR_REGISTRY.hints;

  // Ephemeral UTF-16 source coordinates. Never serialized or part of the semantic AST.
  const SOURCE_RANGES = new WeakMap();
  // Shared UTF-16 lexer: quoted content, exact names and comments are opaque.
  function protectedLexemes(text) {
    text = String(text);
    const protectedAt = new Uint8Array(text.length);
    let quote = '', comment = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (comment) { protectedAt[i] = 1; if (ch === '\n') comment = false; continue; }
      if (quote) {
        protectedAt[i] = 1;
        if (['」','』'].includes(quote) && ch === '\\') {
          if (!['\\', quote === '』' ? '『' : '「', quote].includes(text[i + 1]))
            throw new AkariError('N103', '「」の 中で \\ を 使うときは、\\「、\\」、\\\\ の どれかに してね', 0, i + 1);
          protectedAt[++i] = 1;
        } else if (ch === quote) quote = '';
        continue;
      }
      if (ch === '「' || ch === '『' || ch === '【') { quote = ch === '「' ? '」' : ch === '『' ? '』' : '】'; protectedAt[i] = 1; }
      else if (ch === '※') { comment = true; protectedAt[i] = 1; }
    }
    return protectedAt;
  }
  function compactSourceMap(text, offset = 0) {
    const normalized = normalizeCharsOutsideString(text), protectedAt = protectedLexemes(normalized), positions = [];
    let compact = '';
    for (let i = 0; i < normalized.length; i++) {
      const ch = normalized[i];
      if (protectedAt[i] || (ch !== ' ' && ch !== '\t')) { compact += ch; positions.push(offset + i); }
    }
    return { text: compact, positions };
  }
  function sourceRange(positions, start = 0, end = positions.length) {
    return end > start && positions[start] !== undefined && positions[end - 1] !== undefined
      ? { start: positions[start], end: positions[end - 1] + 1 } : null;
  }
  const sourceSpan = (line) => ({
    startLine: line.lineNo,
    startColumn: line.startColumn || 1,
    endLine: line.lineNo,
    endColumn: Math.max(1, cpLen(line.raw) + 1),
  });

  function splitComment(raw) {
    let quote = '';
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (quote) {
        if (['」','』'].includes(quote) && ch === '\\') {
          if (!['\\',quote === '』' ? '『' : '「',quote].includes(raw[i+1])) throw new AkariError('N103','「」の 中の \\ の 使い方が ちがいます。\\「、\\」、\\\\ の どれかに してね');
          i++;
        } else if (ch === quote) quote = '';
      } else if (ch === '「' || ch === '『' || ch === '【') quote = ch === '「' ? '」' : ch === '『' ? '』' : '】';
      else if (ch === '※') return {code:raw.slice(0,i),comment:raw.slice(i)};
    }
    return {code:raw,comment:''};
  }
  function normalizeCharsOutsideString(text) {
    text = String(text);
    const protectedAt = protectedLexemes(text);
    return text.split('').map((ch, i) => {
      if (protectedAt[i]) return ch;
      const code = ch.charCodeAt(0);
      if (code >= 0xff10 && code <= 0xff19) return String.fromCharCode(code - 0xfee0);
      if ((code >= 0xff21 && code <= 0xff3a) || (code >= 0xff41 && code <= 0xff5a)) return String.fromCharCode(code - 0xfee0);
      return ({ '(': '（', ')': '）', ',': '、', '[': '［', ']': '］', '+': '＋', '-': '－', '−': '－', '*': '×', '/': '÷', '%': '％', '^': '＾', '．': '.', '　': ' ' })[ch] ?? ch;
    }).join('');
  }
  function normalizeSource(source) {
    const original = String(source ?? '');
    const lines=[];let start=0;
    for(let i=0;i<=original.length;i++)if(i===original.length||original[i]==='\r'||original[i]==='\n'){
      lines.push({raw:original.slice(start,i),start,end:i,lineNo:lines.length+1,code:'',comment:'',mapped:{text:'',positions:[]}});
      if(original[i]==='\r'&&original[i+1]==='\n')i++;start=i+1;
    }
    let quote='',first=0;
    for(let i=0;i<lines.length;i++){
      const physical=lines[i];
      for(let j=0;j<physical.raw.length;j++){
        const ch=physical.raw[j];
        if(quote){if(['」','』'].includes(quote)&&ch==='\\'){j++;continue;}if(ch===quote)quote='';}
        else if(ch==='※')break;
        else if(ch==='「'||ch==='『'||ch==='【')quote=ch==='「'?'」':ch==='『'?'』':'】';
      }
      if(quote&&i+1<lines.length)continue;
      const line=lines[first],raw=original.slice(line.start,physical.end),p=splitComment(raw),mapped=compactSourceMap(p.code,line.start);
      if (mapped.text.endsWith('。')) { mapped.text = mapped.text.slice(0, -1); mapped.positions.pop(); }
      Object.assign(line,{raw,end:physical.end,endLine:physical.lineNo,mapped,code:normalizeCharsOutsideString(p.code).trim().replace(/。$/,''),comment:p.comment});
      for(let j=first+1;j<=i;j++)lines[j].continuation=true;
      first=i+1;
    }
    return { source:original, lines };
  }
  function compactOutsideString(text) {
    return compactSourceMap(text).text;
  }
  function validateName(name, { callable = false } = {}) {
    if (typeof name !== 'string' || cpLen(name) < 1 || cpLen(name) > 32)
      throw new AkariError(
        'F503',
        '名前は 1〜32文字で つけてね',
      );
    if (
      /[\p{Cc}\p{Zl}\p{Zp}\s\u300c\u300d\u3010\u3011\uff08\uff09\uff3b\uff3d\u3001\u203b]/u.test(
        name,
      )
    )
      throw new AkariError(
        'F503',
        `\u540d\u524d\u300c${name}」には 使えない 文字が あります。空白や 「」【】（）［］、※ を けしてね`,
      );
    if (callable && (BUILTIN_NAMES.has(name) || Object.values(BUILTIN_SURFACES).includes(name)))
      throw new AkariError('F503', `「${name}」は あかりに はじめから ある 計算の 名前です。ちがう 名前に してね`);
    return name;
  }

