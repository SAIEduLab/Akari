  // ────────────────────────────────────────────────────────────────────────
  // 05 — Shared command presentation and structural block vocabulary
  // ────────────────────────────────────────────────────────────────────────
  const COMMAND_PRESENTATION = Object.freeze({
    MotionCommand: Object.freeze({
      palette: '動き',
      operations: Object.freeze({
        // The four move sentences (LANGUAGE.md 動きの文). A leg is one direction word and its steps, written
        // horizontal first; an optional time comes first of all (2秒かけて、…).
        GOTO: Object.freeze({
          label: '決めたばしょへ行く',
          inputs: Object.freeze([]),
          format: (a, n) => `${moveTimeSource(n)}画面の左下のはしから、${moveLegsSource(n)}のばしょへ行く`,
        }),
        MOVE_BY: Object.freeze({
          label: 'いまのばしょから動く',
          inputs: Object.freeze([]),
          format: (a, n) => `${moveTimeSource(n)}いまのばしょから、${moveLegsSource(n)}動く`,
        }),
        // 後ろへ is written with 動く: 進む says forward, 下がる also reads as 下へ.
        MOVE: Object.freeze({
          label: '前へ進む',
          inputs: Object.freeze(['歩数']),
          format: (a, n) => `${moveTimeSource(n)}${n.direction === 'backward' ? `後ろへ${a(0,'歩')}動く` : `前へ${a(0,'歩')}進む`}`,
        }),
        // The centre comes to the other's centre; the mouse is written without 「 」.
        GOTO_PART: Object.freeze({
          label: '〜のところへ行く',
          inputs: Object.freeze(['行く相手']),
          format: (a, n) => `${moveTimeSource(n)}${n.args?.[0]?.kind === 'StringLiteral' && n.args[0].value === 'マウス' ? 'マウス' : a(0)}のところへ行く`,
        }),
        SET_DIRECTION: Object.freeze({
          label: '向きを決める',
          inputs: Object.freeze(['向き']),
          // The four screen directions are written as words: 画面の右を向く (0度), 上 (90度), 左 (180度), 下 (270度).
          format: (a, n) => {
            const v = n?.args?.[0], degrees = v?.kind === 'QuantityLiteral' && v.value?.kind === 'NumberLiteral' ? v.value.value : null;
            const side = { 0: '右', 90: '上', 180: '左', 270: '下' }[degrees];
            return side ? `画面の${side}を向く` : `向きを${a(0,'度')}にする`;
          },
        }),
        TURN_RIGHT: Object.freeze({
          label: '右に回る',
          inputs: Object.freeze(['何度']),
          format: (a, n) => `${moveTimeSource(n)}右に${a(0,'度')}回る`,
        }),
        TURN_LEFT: Object.freeze({
          label: '左に回る',
          inputs: Object.freeze(['何度']),
          format: (a, n) => `${moveTimeSource(n)}左に${a(0,'度')}回る`,
        }),
        POINT_TO: Object.freeze({
          label: 'だれかの方を向く',
          inputs: Object.freeze(['だれ']),
          format: (a) => `${a(0)}の方を向く`,
        }),
        BOUNCE: Object.freeze({
          label: 'はしで はね返る',
          inputs: Object.freeze([]),
          format: (a) => '画面のはしにふれていれば、はね返る',
        }),
      }),
    }),
    LooksCommand: Object.freeze({
      palette: '見た目',
      operations: Object.freeze({
        FRONT: Object.freeze({
          label: 'いちばん手前へ出る',
          inputs: Object.freeze([]),
          format: (a) => 'いちばん手前へ出る',
        }),
        BACK: Object.freeze({
          label: 'いちばん おくへ下がる',
          inputs: Object.freeze([]),
          format: (a) => 'いちばんおくへ下がる',
        }),
        HIDE: Object.freeze({
          label: 'すがたを かくす',
          inputs: Object.freeze([]),
          format: (a) => 'すがたをかくす',
        }),
        SHOW: Object.freeze({
          label: 'すがたを見せる',
          inputs: Object.freeze([]),
          format: (a) => 'すがたを見せる',
        }),
        NEXT_COSTUME: Object.freeze({
          label: '次のすがた',
          inputs: Object.freeze([]),
          format: (a) => '次のすがたにかえる',
        }),
        PREV_COSTUME: Object.freeze({
          label: '前のすがた',
          inputs: Object.freeze([]),
          format: (a) => '前のすがたにかえる',
        }),
        NEXT_BACKDROP: Object.freeze({
          label: '次のはいけい',
          inputs: Object.freeze([]),
          format: (a) => '次のはいけいにかえる',
        }),
        PREV_BACKDROP: Object.freeze({
          label: '前のはいけい',
          inputs: Object.freeze([]),
          format: (a) => '前のはいけいにかえる',
        }),
        SET_SCALE: Object.freeze({
          label: '大きさを決める',
          inputs: Object.freeze(['大きさ']),
          format: (a) => `大きさを${a(0,'％')}にする`,
        }),
        FORWARD_LAYERS: Object.freeze({
          label: '重なりを手前へ出す',
          inputs: Object.freeze(['いくつ']),
          format: (a) => `重なりを${a(0)}つ手前にする`,
        }),
        BACKWARD_LAYERS: Object.freeze({
          label: '重なりを おくへ下げる',
          inputs: Object.freeze(['いくつ']),
          format: (a) => `重なりを${a(0)}つおくにする`,
        }),
        SET_COLOR: Object.freeze({
          label: '色を決める',
          inputs: Object.freeze(['色']),
          // 色を「赤」にする where the work has no data named 色, 表示色 otherwise (F-25, colorCommandWord).
          format: (a) => `${colorCommandWord()}を${a(0)}にする`,
        }),
        SET_COSTUME: Object.freeze({
          label: 'すがたを かえる',
          inputs: Object.freeze(['すがた']),
          format: (a) => `すがたを${a(0)}にかえる`,
        }),
        SET_BACKDROP: Object.freeze({
          label: 'はいけいを かえる',
          inputs: Object.freeze(['はいけい']),
          format: (a) => `はいけいを${a(0)}にかえる`,
        }),
        SET_SELF_TEXT: Object.freeze({
          label: '自分の文字をかえる',
          inputs: Object.freeze(['文字']),
          format: (a) => `自分の文字を${a(0)}にかえる`,
        }),
        SET_TARGET_TEXT: Object.freeze({
          label: 'だれかの文字をかえる',
          inputs: Object.freeze(['だれ', '文字']),
          format: (a) => `${a(0)}の文字を${a(1)}にかえる`,
        }),
        SET_INPUT: Object.freeze({
          label: '入力らんに入れる',
          inputs: Object.freeze(['入力らん', '中身']),
          format: (a) => `${a(0)}に${a(1)}を入れる`,
        }),
      }),
    }),
    PenCommand: Object.freeze({
      palette: 'ペン',
      operations: Object.freeze({
        DOWN: Object.freeze({
          label: 'ペンを下ろす',
          inputs: Object.freeze([]),
          format: (a) => 'ペンを下ろす',
        }),
        UP: Object.freeze({
          label: 'ペンを上げる',
          inputs: Object.freeze([]),
          format: (a) => 'ペンを上げる',
        }),
        CLEAR: Object.freeze({
          label: '線とスタンプを消す',
          inputs: Object.freeze([]),
          format: (a) => '作品の線とスタンプを全部消す',
        }),
        STAMP: Object.freeze({
          label: '今の すがたの スタンプを おす',
          inputs: Object.freeze([]),
          format: (a) => '今のすがたのスタンプをおす',
        }),
        SET_COLOR: Object.freeze({
          label: 'ペンの色を決める',
          inputs: Object.freeze(['色']),
          format: (a) => `ペンの色を${a(0)}にする`,
        }),
        SET_SIZE: Object.freeze({
          label: 'ペンの太さを決める',
          inputs: Object.freeze(['太さ']),
          format: (a) => `ペンの太さを${a(0)}にする`,
        }),
      }),
    }),
    SoundCommand: Object.freeze({
      palette: '音',
      operations: Object.freeze({
        STOP_ALL: Object.freeze({
          label: 'すべての音を止める',
          inputs: Object.freeze([]),
          format: (a) => 'すべての音を止める',
        }),
        TONE_WAIT: Object.freeze({
          label: '音を鳴らして待つ',
          inputs: Object.freeze(['音の高さ', '秒']),
          format: (a) => `${a(0,'Hz')}の音を${a(1,'秒')}鳴らす`,
        }),
        TONE: Object.freeze({
          label: '音を鳴らして、すぐ次へ',
          inputs: Object.freeze(['音の高さ', '秒']),
          format: (a) => `${a(0,'Hz')}の音を${a(1,'秒')}鳴らし始める`,
        }),
        SAMPLE_WAIT: Object.freeze({
          label: 'えらんだ音を鳴らして待つ',
          inputs: Object.freeze(['音']),
          format: (a) => `${a(0)}を鳴らす`,
        }),
        SAMPLE: Object.freeze({
          label: 'えらんだ音を鳴らして、すぐ次へ',
          inputs: Object.freeze(['音']),
          format: (a) => `${a(0)}を鳴らし始める`,
        }),
        SET_VOLUME: Object.freeze({
          label: '音の大きさを決める',
          inputs: Object.freeze(['音の大きさ']),
          format: (a) => `音の大きさを${a(0,'％')}にする`,
        }),
        PITCH_UP: Object.freeze({
          label: '音の高さを上げる',
          inputs: Object.freeze(['いくつ']),
          format: (a) => `音の高さを${a(0)}段階上げる`,
        }),
        PITCH_DOWN: Object.freeze({
          label: '音の高さを下げる',
          inputs: Object.freeze(['いくつ']),
          format: (a) => `音の高さを${a(0)}段階下げる`,
        }),
      }),
    }),
    CloneCommand: Object.freeze({
      palette: 'コピー',
      operations: Object.freeze({
        CREATE_SELF: Object.freeze({
          label: '自分のコピーを作る',
          inputs: Object.freeze([]),
          format: (a,n) => n.count===undefined?'自分のコピーを作る':`自分のコピーを${formatExpression(n.count)}つ作る`,
        }),
        DELETE_SELF: Object.freeze({
          label: 'このコピーだけを消す',
          inputs: Object.freeze([]),
          format: (a) => 'このコピーだけを消す',
        }),
        CREATE_TARGET: Object.freeze({
          label: 'えらんだキャラクターのコピーを作る',
          inputs: Object.freeze(['だれ']),
          format: (a,n) => `${a(0)}のコピーを${n.count===undefined?'':formatExpression(n.count)+'つ'}作る`,
        }),
      }),
    }),
  });
  function formatCommand(node) {
    const command = COMMAND_PRESENTATION[node.kind]?.operations[node.op];
    if (!command) throw new AkariError('P201', `未対応の命令 ${node.kind}:${node.op}`);
    return command.format((index, unit) => {const slot=sentenceFormFor(node)?.roleSlots.find(role=>role.path===`args.${index}`);if(unit&&slot?.unit!==unit)throw new AkariError('P205','文型の単位の役割が一致しません');const arg=node.args?.[index];return unit ? sentenceQuantitySource(arg,slot.unit) : formatExpression(arg);}, node);
  }
  const MOVE_DIRECTION_WORDS = Object.freeze({ right: '右', left: '左', up: '上', down: '下' });
  // 2秒かけて、 (the time of a move or a turn) is written first, with its comma.
  function moveTimeSource(n) {
    return n.seconds ? sentenceQuantitySource(n.seconds, '秒') + 'かけて、' : '';
  }
  // 右へ10歩、上へ5歩: the horizontal leg first, whatever order the code was written in.
  function moveLegsSource(n) {
    return [['x', 'xDir'], ['y', 'yDir']].filter(([key]) => n[key])
      .map(([key, dir]) => MOVE_DIRECTION_WORDS[n[dir]] + 'へ' + sentenceQuantitySource(n[key], '歩')).join('、');
  }
  const BLOCK_SCHEMAS = (() => {
    const schemas = [];
    const field = (key, label, type, initial, extra = {}) => ({
      key,
      label,
      type,
      initial,
      required: true,
      ...extra,
    });
    const input = (key, label, type = 'expression', extra = {}) => ({
      key,
      label,
      type,
      required: true,
      multiple: false,
      ...extra,
    });
    const body = (key, label, requiredExecutable = true, extra = {}) => ({
      key,
      label,
      required: true,
      requiredExecutable,
      ...extra,
    });
    const args = (labels = [], extra = {}) =>
      input('args', '入れるもの', 'expression', {
        multiple: true,
        minItems: labels.length,
        maxItems: labels.length,
        labels,
        ...extra,
      });
    const add = (
      kind,
      category,
      label,
      fields = [],
      inputs = [],
      bodies = [],
      discriminator = null,
      extra = {},
    ) => {
      const id = kind + (discriminator ? ':' + discriminator.value : '');
      const groups = {
        Script: '本文',
        TargetReference: 'へんすう・リスト',
        CommentLine: 'メモ',
        UserActionCall: 'てじゅん',
        UserFunctionCall: '答えを もとめる',
        BuiltinCall: 'はじめから ある 計算',
        SensorRead: 'しらべる',
        LocalVariableDeclaration: 'この中だけの へんすう・リスト',
        LocalListDeclaration: 'この中だけの へんすう・リスト',
        ReturnStatement: '返す',
        Say: '言う・たずねる',
        Ask: '言う・たずねる',
        Broadcast: '合図',
        BroadcastAndWait: '合図',
        WaitTime: '待つ',
        WaitUntil: '待つ',
        StopCommand: '止める',
        TimerReset: 'しらべる',
      };
      const palette =
        groups[kind] ||
        (kind.startsWith('List')
          ? 'リスト'
          : category === 'expression'
            ? 'かず・文字'
            : ['Assignment', 'NumericUpdate'].includes(kind)
              ? 'へんすう・リスト'
              : 'もし・くり返し');
      // Who acts is chosen in 「だれが」 for every sentence (F-27); a wait also offers みんな (the whole flow). The one-line
      // group wait always waits with the whole flow.
      if (category === 'statement' && kind !== 'WaitBroadcastGroup')
        fields = [...fields, field('actorRef', 'だれが', 'actor-ref', undefined, { required: false, ...(EVERYONE_WAITS.has(kind) ? { everyone: true } : {}) })];
      const annotations =
        category === 'statement'
          ? [
              field('inlineComment', '行の終わりのメモ', 'annotation', '', {
                editable: kind !== 'CommentLine',
              }),
              ...(kind === 'IfStatement'
                ? [
                    field('elseComment', 'そうでなければのメモ', 'annotation', '', {
                      when: 'hasElse',
                    }),
                  ]
                : []),
            ]
          : category === 'rule'
            ? [field('inlineComment', '行の終わりのメモ', 'annotation', '', { required: false })]
            : [];
      const schema = {
        id,
        kind,
        discriminator,
        category,
        palette,
        label,
        fields,
        inputs,
        bodies,
        annotations,
        ...extra,
      };
      schema.create = (context = {}) => createSyntaxNode(schema, context);
      schema.encode = (node, context = {}) => {
        if (syntaxSchema(node, schema.category).id !== id)
          blockDataError('ブロックの種類が合いません');
        return blockEncode(node, { ...context, expected: schema.category });
      };
      schema.decode = (tree, context = {}) => {
        if (tree?.schemaId !== id) blockDataError('ブロックの種類が合いません');
        return blockDecode(tree, context);
      };
      schema.availability = (context = {}) => blockAvailability(context);
      for (const group of [fields, inputs, bodies, annotations]) {
        for (const item of group) {
          if (item.labels) Object.freeze(item.labels);
          Object.freeze(item);
        }
        Object.freeze(group);
      }
      if (discriminator) Object.freeze(discriminator);
      schemas.push(Object.freeze(schema));
    };
    const name = (key = 'name', label = '名前', initial = '中身', callable = false) =>
      field(key, label, 'name', initial, { callable });
    const qualifier = () => field('qualifier', '使う ばしょ', 'qualifier', null);
    const target = () => input('target', 'かえるもの', 'target');
    const expression = (key, label, initial) =>
      input(key, label, 'expression', initial === undefined ? {} : { initial });
    const op = (key, value) => ({ key, value });
    add('Script', 'script', '本文',
      [field('heading', 'きっかけ', 'heading', undefined, { required: false })],
      [input('rules', 'つづけて動くルール', 'rule', {
        required: false, multiple: true, minItems: 0, maxItems: LIMITS.activeTasks, variadic: true,
      }),input('units','ほかの きっかけの 本文','script',{
        required:false,multiple:true,minItems:1,maxItems:LIMITS.scripts,variadic:true,
      })], [body('body', '本文', false)]);
    for (const role of ['expression', 'statement', 'target', 'rule'])
      add('Hole', role, 'あいている ところ', [field('label', 'ここに入れるもの', 'string', '中身')],
        [], [], op('role', role), { draftOnly: true, capability: 'draft-hole:' + role });
    add('QuantityLiteral', 'expression', 'たんいを つけた 数',
      [field('unit', 'たんい', 'unit', '歩')], [expression('value', '数や計算')], [], null,
      { capability: 'quantity-value', semanticRoles: ['value', 'unit'] });
    add('UnitlessRead', 'expression', 'たんいを とった数', [], [expression('value', '中身')], [], null,
      { capability: 'unitless-read', semanticRoles: ['value'] });
    add('ActorQualifiedRead', 'expression', 'えらんだ キャラクターの 中身',
      [field('actorRef', 'だれの', 'actor-ref', { kind: 'self' })],
      [expression('value', '読む中身')], [], null,
      { capability: 'actor-qualified-read', semanticRoles: ['actorRef', 'value'] });
    // 〜が10回【ジャンプ】するまで / 〜が3回おされるまで: used as the whole condition of a まで.
    add('EventCount', 'expression', 'てじゅんを 行った 回数',
      [field('actorRef', 'だれが', 'actor-ref', { kind: 'self' }), name('name', 'てじゅんの 名前', 'ジャンプ', true)],
      [expression('count', '何回', 3)], [], op('event', 'action'),
      { capability: 'event-count:action', semanticRoles: ['actorRef', 'name', 'count'] });
    add('EventCount', 'expression', 'おされた 回数',
      [field('actorRef', 'だれが', 'actor-ref', { kind: 'self' })],
      [expression('count', '何回', 3)], [], op('event', 'click'),
      { capability: 'event-count:click', semanticRoles: ['actorRef', 'count'] });
    // One name for the rule on every surface (F-23: ルール); a new one moves while the 右 key is held, as the hint does.
    add('ContinuousRule', 'rule', 'つづけて動くルール',
      [field('actorRef', 'だれが動く', 'actor-ref', { kind: 'self' }),
        field('direction', '進む向き', 'direction', 'right')],
      [expression('condition', 'つづける きまり', true), expression('seconds', '何秒に', 1),
        expression('distance', '何歩の速さ', 200)], [], null,
      { capability: 'continuous-state-motion', semanticRoles: ['actorRef', 'condition', 'direction', 'seconds', 'distance'] });
    // The move blocks keep one leg per axis (右・左 and 上・下). 決めたばしょへ行く always has both legs; いまのばしょから動く
    // has one or two. Every move and turn takes an optional time (〇秒かけて、).
    const seconds = () => input('seconds', 'かける時間', 'expression', { required: false });
    const legDirections = [field('xDir', 'よこの向き', 'direction', 'right', { choices: ['right', 'left'] }),
      field('yDir', 'たての向き', 'direction', 'up', { choices: ['up', 'down'] })];
    add('MotionCommand', 'statement', '決めたばしょへ行く', legDirections,
      [input('x', 'よこの歩数'), input('y', 'たての歩数'), seconds()], [], op('op', 'GOTO'),
      { palette: '動き', capability: 'place-motion:GOTO' });
    add('MotionCommand', 'statement', 'いまのばしょから動く', legDirections,
      [input('x', 'よこの歩数', 'expression', { required: false }), input('y', 'たての歩数', 'expression', { required: false }), seconds()],
      [], op('op', 'MOVE_BY'), { palette: '動き', capability: 'place-motion:MOVE_BY' });
    add('MotionCommand', 'statement', '前へ進む', [field('direction', '進む向き', 'direction', 'forward', { choices: ['forward', 'backward'] })],
      [args(['何歩']), seconds()], [], op('op', 'MOVE'), { palette: '動き', capability: 'facing-motion:MOVE' });
    add('MotionCommand', 'statement', '〜のところへ行く', [], [args(['行く相手']), seconds()], [], op('op', 'GOTO_PART'),
      { palette: '動き', capability: 'part-motion:GOTO_PART' });
    for (const [value, label] of [['TURN_RIGHT', '右に回る'], ['TURN_LEFT', '左に回る']])
      add('MotionCommand', 'statement', label, [], [args(['何度']), seconds()], [], op('op', value), { palette: '動き' });
    add('WaitBroadcastGroup', 'statement', 'その合図で始まったことが全部終わるまで待つ',
      [field('broadcastRef', '待つ合図', 'reference', 'その合図')], [], [], null,
      { capability: 'notification-group-wait' });
    add('TargetReference', 'target', 'かえるもの', [name(), qualifier()]);
    add('CommentLine', 'statement', 'メモ', [field('text', 'メモの中身', 'comment', '')]);
    add('Assignment', 'statement', '中身を決める', [], [target(), expression('value', '中身')]);
    for (const [value, label] of [
      ['ADD', '数を ふやす'],
      ['SUB', '数を へらす'],
    ])
      add(
        'NumericUpdate',
        'statement',
        label,
        [],
        [target(), expression('value', '中身')],
        [],
        op('op', value),
      );
    add(
      'ListAppend',
      'statement',
      'リストのさいごに入れる',
      [],
      [target(), expression('value', '入れる中身')],
    );
    for (const [kind, label] of [
      ['ListInsert', 'リストの とちゅうに入れる'],
      ['ListReplace', 'リストの中身を1つ入れかえる'],
    ])
      add(
        kind,
        'statement',
        label,
        [],
        [target(), expression('index', '番号', 1), expression('value', '入れる中身')],
      );
    add(
      'ListDelete',
      'statement',
      'リストの中身を1つ消す',
      [],
      [target(), expression('index', '番号', 1)],
    );
    add('ListClear', 'statement', 'リストの中身を全部消す', [], [target()]);
    for (const [kind, label] of [
      ['NoOperation', '何もしない'],
      ['Break', 'このくり返しを終える'],
      ['Continue', 'この回の のこりを とばして 次の回へ'],
      ['TimerReset', 'タイマーを 0に する'],
    ])
      add(kind, 'statement', label);
    add(
      'IfStatement',
      'statement',
      'もし',
      [field('hasElse', 'そうでなければ', 'boolean', false)],
      [expression('condition', 'きまり', true)],
      [
        body('thenBody', 'きまりに あてはまる とき'),
        body('elseBody', 'そうでなければ', true, { when: 'hasElse' }),
      ],
    );
    add(
      'RepeatCount',
      'statement',
      '回数を決めてくり返す',
      [],
      [expression('count', '回数', 3)],
      [body('body', 'くり返すこと')],
    );
    for (const [kind, label] of [
      ['RepeatWhile', 'きまりに あてはまる あいだ'],
      ['RepeatUntil', 'きまりに あてはまるまで'],
    ])
      add(
        kind,
        'statement',
        label,
        [],
        [expression('condition', 'きまり', true)],
        [body('body', 'くり返すこと')],
      );
    add('Forever', 'statement', 'ずっとくり返す', [], [], [body('body', 'くり返すこと')]);
    add(
      'ForEach',
      'statement',
      '中身を 一つずつ 見る',
      [name('binder', '今見ているものの名前', 'これ')],
      [input('list', 'リスト', 'expression', { initial: [] })],
      [body('body', 'くり返すこと')],
    );
    for (const [kind, label, key, inputLabel, initial] of [
      ['WaitTime', '秒待つ', 'seconds', '秒', 1],
      ['WaitUntil', 'きまりに あてはまるまで待つ', 'condition', 'きまり', true],
      ['Say', '言う・話す', 'value', '言うこと', 'こんにちは'],
      ['ReturnStatement', '返す', 'value', '返す答え', 0],
      ['Ask', 'たずねる', 'question', 'しつもん', ''],
      ['Broadcast', '合図を送る', 'message', '合図', ''],
      ['BroadcastAndWait', '合図を送って待つ', 'message', '合図', ''],
    ])
      add(kind, 'statement', label,
        kind === 'Broadcast' ? [field('broadcastRef', 'あとで 待つときの 合図の 名前', 'reference', undefined, { required: false })] : [],
        [expression(key, inputLabel, initial), ...(kind==='Say'?[input('seconds','話す時間','expression',{required:false})]:[])]);
    add(
      'UserActionCall',
      'statement',
      // 動かす is kept for movement and ▶ 動かす (F-22); the face reads 【…】というてじゅんを行う.
      'てじゅんを 行う',
      [name('name', '作ったブロックの名前', 'てじゅん', true), field('argumentNames', '入れるものの名前', 'argument-names', undefined, { required: false })],
      [
        args([], {
          minItems: 0,
          maxItems: LIMITS.sourceEach,
          variadic: true,
          semanticArity: 'definition',
        }),
      ],
    );
    add(
      'LocalVariableDeclaration',
      'statement',
      'この中だけの へんすうを作る',
      [name('name', 'へんすうの名前', 'けっか')],
      [expression('initial', 'はじめの中身')],
    );
    add('LocalListDeclaration', 'statement', 'この中だけのリストを作る', [
      name('name', 'リストの名前', '結果'),
    ]);
    for (const [value, label] of [
      ['THIS', 'この動きを止める'],
      ['OTHERS', 'ほかの動きを全部止める'],
      ['OWN_OTHERS', '自分のほかの動きを止める'],
      ['ALL', '作品を全部止める'],
    ])
      add('StopCommand', 'statement', label, [], [], [], op('op', value));
    for (const [kind, group] of Object.entries(COMMAND_PRESENTATION))
      for (const [value, command] of Object.entries(group.operations)) {
        if (schemas.some(schema => schema.id === kind + ':' + value)) continue;
        add(
          kind,
          'statement',
          command.label,
          [],
          [args([...command.inputs]),...(kind==='CloneCommand'&&value!=='DELETE_SELF'?[input('count','作るコピーの数','expression',{required:false})]:[])],
          [],
          op('op', value),
          { palette: group.palette },
        );
      }
    add('NumberLiteral', 'expression', '数', [field('value', '数', 'number', 0)]);
    add('StringLiteral', 'expression', '文字', [field('value', '文字', 'string', '', { multiline:true })]);
    add('BooleanLiteral', 'expression', 'あてはまる・あてはまらない', [field('value', 'あてはまる・あてはまらない', 'boolean', true)]);
    add(
      'ListLiteral',
      'expression',
      'リスト',
      [],
      [
        input('items', '中身', 'expression', {
          multiple: true,
          minItems: 0,
          maxItems: LIMITS.sourceEach,
          variadic: true,
        }),
      ],
    );
    add('VariableRead', 'expression', '名前を読む', [name(), qualifier()]);
    for (const [value, label] of [
      ['POS', 'プラスのしるし'],
      ['NEG', 'マイナスのしるし'],
      ['NOT', 'あてはまらない（反対にする）'],
    ])
      add(
        'UnaryExpression',
        'expression',
        label,
        [],
        [expression('value', '中身')],
        [],
        op('op', value),
      );
    for (const [kind, rows] of [
      [
        'BinaryExpression',
        [
          ['ADD', '＋（たす）'],
          ['SUB', '－（ひく）'],
          ['MUL', '×（かける）'],
          ['DIV', '÷（わる）'],
          ['POW', '＾（同じ数を くり返し かける）'],
        ],
      ],
      [
        'CompareExpression',
        [
          // The face reads as the code (F2-03, LANGUAGE.md: 以上・以下 are written in kanji on every surface).
          ['GTE', '以上'],
          ['LTE', '以下'],
          ['GT', 'より大きい'],
          ['LT', 'より小さい'],
          ['EQ', 'と同じ'],
          ['NEQ', 'とちがう'],
        ],
      ],
      [
        'LogicalExpression',
        [
          ['AND', 'かつ（どちらも）'],
          ['OR', 'または（どちらか）'],
        ],
      ],
    ])
      for (const [value, label] of rows)
        add(
          kind,
          'expression',
          label,
          [],
          [expression('left', '左の中身'), expression('right', '右の中身')],
          [],
          op('op', value),
        );
    add(
      'ListRead',
      'expression',
      'リストの中身を1つ読む',
      [],
      [input('list', 'リスト', 'expression', { initial: [] }), expression('index', '番号', 1)],
    );
    add(
      'UserFunctionCall',
      'expression',
      '答えを もとめる',
      [name('name', '名前', '計算', true), field('argumentNames', '入れるものの名前', 'argument-names', undefined, { required: false })],
      [
        args([], {
          minItems: 0,
          maxItems: LIMITS.sourceEach,
          variadic: true,
          semanticArity: 'definition',
        }),
      ],
    );
    for (const meta of GRAMMAR_REGISTRY.builtins)
      add(
        'BuiltinCall',
        'expression',
        BUILTIN_LABELS[meta.name] || meta.name,
        [],
        [
          args([], {
            minItems: 0,
            maxItems: LIMITS.sourceEach,
            variadic: meta.maxArgs !== meta.minArgs,
            ...(meta.name === 'つなぐ' ? { separator: 'と' } : {}),
            initialItems: meta.minArgs,
            semanticMin: meta.minArgs,
            semanticMax: meta.maxArgs,
          }),
        ],
        [],
        op('name', meta.name),
      );
    for (const [value, label, labels] of [
      ['CONTAINS', '入っている', ['リストまたは文字', 'さがすもの']],
      ['INDEX_OF', 'はじめに ある 番号', ['リストまたは文字', 'さがすもの']],
      ['LENGTH', '長さ', ['リストまたは文字']],
      ['STRING_LENGTH', '文字数', ['文字']],
      ['STRING_CHAR', '文字の 何文字目か', ['文字', '番号']],
    ])
      add('BuiltinCall', 'expression', label, [], [args(labels)], [], op('name', value));
    for (const value of GRAMMAR_REGISTRY.sensors)
      add('SensorRead', 'expression', SENSOR_LABELS[value] || SENSOR_SURFACES[value] || value, [], [], [], op('sensor', value), { palette: 'しらべる' });
    for (const [value, label] of [
      ['INPUT_VALUE', '入力らんの中身'],
      ['DISTANCE_TO', 'だれかまでの きょり'],
      ['KEY_DOWN', 'キーが おされている'],
      ['TOUCHING_COLOR', '色に ふれている'],
      ['TOUCHING', 'だれかに ふれている'],
    ])
      add(
        'SensorRead',
        'expression',
        label,
        [],
        [
          expression(
            'arg',
            value === 'TOUCHING_COLOR'
              ? '色'
              : value === 'KEY_DOWN'
                ? 'キー'
                : value === 'INPUT_VALUE'
                  ? '入力らん'
                  : 'だれ',
            // A colour is named as the child names it (F-21): 「赤」, not #ff0000.
            value === 'TOUCHING_COLOR'
              ? '赤'
              : value === 'KEY_DOWN'
                ? '空白'
                : value === 'INPUT_VALUE'
                  ? '入力らん1'
                  : 'マウス',
          ),
        ],
        [],
        op('sensor', value),
        { palette: 'しらべる' },
      );
    for (const [kind, category, collection] of [
      ['ExtensionCommand', 'statement', 'commands'], ['ExtensionCalculation', 'expression', 'calculations'],
    ]) for (const operation of EXTENSION_HOST.operations(collection).filter(x => x.scope !== 'meijin')) {
      const labels = operation.args.map(x => x.name);
      add(kind, category, operation.displayName, [], [args(labels, { initialValues: operation.args.map(extensionDefaultExpression) })], [], { key: 'name', value: operation.name }, { palette: 'かくちょう' });
    }
    if (EXTENSION_HOST.operations('events').some(x => x.scope !== 'meijin'))
      add('SensorRead', 'expression', 'かくちょうの きっかけの 中身', [], [], [], { key: 'sensor', value: '拡張の値' }, { palette: 'かくちょう' });
    return Object.freeze(schemas);
  })();
  const BLOCK_SCHEMA_BY_ID = new Map(BLOCK_SCHEMAS.map((schema) => [schema.id, schema]));
  function blockStructureError(message, path = '') {
    throw new AkariError(
      'P210',
      `ブロックの 組み方に まちがいが あります。${message}`,
      0,
      0,
      path,
    );
  }
  // Checks that only fail on broken saved data: the child is told what to do; the reason and where it is go to the
  // details (F-07).
  function blockDataError(message, path = '') {
    throw new AkariError('P210', '作品の ファイルが こわれているかもしれないよ。先生に 見てもらってね。', 0, 0, message + (path ? '（' + path + '）' : ''));
  }
  function syntaxSchema(node, expected) {
    if (!node || typeof node !== 'object' || Array.isArray(node))
      blockDataError('ブロックがありません');
    const kind = expected === 'target' && node.kind !== 'Hole' ? 'TargetReference' : node.kind;
    const discriminator =
      kind === 'Hole'
        ? 'role'
        : ['BuiltinCall', 'ExtensionCommand', 'ExtensionCalculation'].includes(kind)
        ? 'name'
        : kind === 'SensorRead'
          ? 'sensor'
          : kind === 'EventCount'
          ? 'event'
          : [
                'NumericUpdate',
                'StopCommand',
                'MotionCommand',
                'LooksCommand',
                'PenCommand',
                'SoundCommand',
                'CloneCommand',
                'UnaryExpression',
                'BinaryExpression',
                'CompareExpression',
                'LogicalExpression',
              ].includes(kind)
            ? 'op'
            : null;
    const schema = BLOCK_SCHEMA_BY_ID.get(
      kind + (discriminator ? ':' + node[discriminator] : ''),
    );
    if (!schema) blockDataError('あかりにないブロックです');
    if (expected && schema.category !== expected)
      blockStructureError('このブロックは ここには入りません。形の合う ばしょに 入れてください');
    return schema;
  }
  function blockRecord(record, allowed, path) {
    if (!record || typeof record !== 'object' || Array.isArray(record))
      blockDataError('ブロックの中身がありません', path);
    for (const key of Object.keys(record))
      if (!allowed.includes(key)) blockDataError('このブロックにはない項目があります', path + (path ? ' / ' : '') + key);
  }
  function blockFieldValue(field, value, path) {
    const type = field.type;
    if (value === undefined && field.required === false) return undefined;
    if (type === 'actor-ref') {
      blockRecord(value, ['kind', 'name', 'particle'], path);
      // みんな (the whole flow) is a subject only a wait takes.
      if (!['self', 'named', ...(field.everyone ? ['all'] : [])].includes(value.kind)) blockDataError('だれが動くかの書き方が正しくありません', path);
      if (value.kind === 'self' || value.kind === 'all') {
        if (Object.hasOwn(value, 'name')) blockDataError('「自分」にはほかの名前を付けられません', path);
        if (Object.hasOwn(value, 'particle')) blockDataError('主語の「が」は 名前で えらんだ ときに 使います', path);
        return { kind: value.kind };
      }
      blockFieldValue({ type: 'name' }, value.name, path + '.name');
      // ねこが…: the subject is written with が; は is the default and is not stored.
      if (Object.hasOwn(value, 'particle') && value.particle !== 'が') blockDataError('主語の あとには「は」か「が」を 書きます', path + '.particle');
      return value.particle === 'が' ? { kind: 'named', name: value.name, particle: 'が' } : { kind: 'named', name: value.name };
    }
    if (type === 'argument-names') {
      if (!Array.isArray(value) || value.length > LIMITS.sourceEach)
        blockDataError('入れるものの名前がありません', path);
      return value.map((name, index) => blockFieldValue({ type: 'name' }, name, path + '[' + index + ']'));
    }
    if (type === 'heading') {
      blockRecord(value, ['event', 'actorRef', 'filter'], path);
      if (!Object.hasOwn(EVENT_LABELS, value.event)) blockDataError('きっかけの種類が正しくありません', path);
      const heading = { event: value.event, actorRef: blockFieldValue({ type: 'actor-ref' }, value.actorRef, path + '.actorRef') };
      if (Object.hasOwn(value, 'filter')) {
        if (value.filter === null) heading.filter = null;
        else {
          // A key (キーを おしたとき), a signal (合図を 受けたとき) or what is touched (ふれたとき: a part, or 端 and its sides).
          blockRecord(value.filter, ['key', 'message', 'target'], path + '.filter');
          const keys = Object.keys(value.filter);
          if (keys.length !== 1 || !['key', 'message', 'target'].includes(keys[0]))
            blockDataError('キーか合図を1つ選んでください', path);
          const key = keys[0];
          if ((key === 'key' && value.event !== 'keyDown') || (key === 'message' && value.event !== 'message') ||
            (key === 'target' && value.event !== 'touchStart') || (value.event === 'touchStart' && key !== 'target'))
            blockDataError('きっかけと、選んだキーや合図が合いません', path);
          heading.filter = { [key]: blockFieldValue({ type: 'string' }, value.filter[key], path + '.filter.' + key) };
        }
      }
      return heading;
    }
    if (type === 'unit' || type === 'direction') {
      const values = type === 'unit' ? ['歩', '度', '秒', '回', '番目', '点', '個', '％', 'Hz']
        : ['right', 'left', 'up', 'down', 'forward', 'backward'];
      if (!values.includes(value) || (field.choices && !field.choices.includes(value)))
        blockStructureError(type === 'unit' ? 'たんいを えらんでください' : '進む 向きを えらんでください', path);
      return value;
    }
    if (type === 'reference' && (typeof value !== 'string' || !value.length))
      blockStructureError('待つ合図が空いています。何か書いてください', path);
    if (type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || Object.is(value, -0))
        blockDataError('数は0以上の数にしてください', path);
    } else if (type === 'boolean') {
      if (typeof value !== 'boolean') blockDataError('「あてはまる」か「あてはまらない」を入れてください', path);
    } else if (type === 'qualifier') {
      if (![null, 'exact', 'self', 'project'].includes(value))
        blockStructureError('使う ばしょが 正しくありません', path);
    } else {
      if (typeof value !== 'string') blockDataError('文字を入れてください', path);
      if (type === 'name')
        try {
          validateName(value, { callable: field.callable === true });
        } catch (error) {
          blockStructureError(error.message, path);
        }
      if (!field.multiline && /[\r\n]/.test(value)) blockDataError('1行で書いてください', path);
      if (type === 'string' && cpLen(value) > LIMITS.stringChars)
        blockStructureError('文字が 長すぎます。短く してください', path);
      if (type === 'annotation' && value && value[0] !== '※')
        blockStructureError('メモは「※」から書きはじめます。れい：※ ここで回る', path);
    }
    return value;
  }
  function validateSyntaxAst(root, expected = 'script', { allowHoles = false } = {}) {
    const active = new WeakSet();
    let count = 0;
    const visit = (node, type, path, blockDepth, expressionDepth) => {
      const schema = syntaxSchema(node, type);
      if(node.units&&(type!=='script'||path!=='root'))
        blockDataError('きっかけの 本文は、いちばん 外に 置いてください',path);
      if (schema.draftOnly && !allowHoles) blockStructureError('空いているところが あります。うめてから動かしてください', path);
      if (active.has(node)) blockDataError('ブロックが自分の中に入っています', path);
      active.add(node);
      if (++count > LIMITS.sourceEach)
        blockStructureError('ブロックが 多すぎて、使える 数を こえています。ブロックを へらしてください', path);
      if (blockDepth > LIMITS.blockDepth || expressionDepth > LIMITS.expressionDepth)
        blockStructureError('ブロックの 中に ブロックを 重ねすぎています。重ねる 数を へらしてください', path);
      const allowed = [
        ...(type === 'target' && schema.kind !== 'Hole' ? [] : ['kind']),
        ...schema.fields.map((x) => x.key),
        ...schema.inputs.map((x) => x.key),
        ...schema.bodies.map((x) => x.key),
        'sourceSpan',
      ];
      if (schema.discriminator) allowed.push(schema.discriminator.key);
      allowed.push(...schema.annotations.map((x) => x.key));
      if (schema.bodies.length && type !== 'script') allowed.push('endLine');
      if (schema.kind === 'Script') allowed.push('source');
      if (schema.kind === 'CommentLine') allowed.push('raw');
      blockRecord(node, allowed, path);
      for (const field of schema.fields) {
        if (!Object.hasOwn(node, field.key)) {
          if (field.required === false) continue;
          blockDataError('「' + (field.label || field.key) + '」がありません', path);
        }
        blockFieldValue(field, node[field.key], path + '.' + field.key);
      }
      for (const annotation of schema.annotations) {
        if (!Object.hasOwn(node, annotation.key)) {
          if (annotation.required === false) continue;
          blockDataError('「' + (annotation.label || annotation.key) + '」がありません', path);
        }
        blockFieldValue(annotation, node[annotation.key], path + '.' + annotation.key);
      }
      if (
        (type === 'target' || schema.kind === 'VariableRead') &&
        node.qualifier === null &&
        !bareName(node.name)
      )
        blockStructureError('名前を【 】でかこむか、使う ばしょを えらんでください', path);
      if (Object.hasOwn(node, 'argumentNames') && node.argumentNames !== undefined && (!Array.isArray(node.args) || node.argumentNames.length !== node.args.length))
        blockStructureError('入れるものと 名前の 数が 合いません。同じ 数に してください', path + '.argumentNames');
      for (const slot of schema.inputs) {
        if (!Object.hasOwn(node, slot.key) && slot.required === false) continue;
        const value = node[slot.key];
        if (slot.multiple) {
          if (!Array.isArray(value) || value.length < slot.minItems || value.length > slot.maxItems)
            blockDataError('入れるものの数が合いません', path + '.' + slot.key);
          for (let i = 0; i < value.length; i++)
            visit(
              value[i],
              slot.type,
              path + '.' + slot.key + '[' + i + ']',
              blockDepth,
              slot.type === 'expression' ? expressionDepth + 1 : 0,
            );
        } else
          visit(
            value,
            slot.type,
            path + '.' + slot.key,
            blockDepth,
            slot.type === 'expression' ? expressionDepth + 1 : 0,
          );
      }
      for (const slot of schema.bodies) {
        const children = node[slot.key],
          enabled = !slot.when || node[slot.when];
        if (!Array.isArray(children))
          blockDataError('中のブロックがありません', path + '.' + slot.key);
        if (!enabled && children.length)
          blockDataError('使えないところにブロックがあります', path + '.' + slot.key);
        if (
          enabled &&
          slot.requiredExecutable &&
          !children.some((n) => n && n.kind !== 'CommentLine')
        )
          blockStructureError('中にブロックを1つ入れてください。メモだけでは動きません', path + '.' + slot.key);
        for (let i = 0; i < children.length; i++)
          visit(
            children[i],
            'statement',
            path + '.' + slot.key + '[' + i + ']',
            type === 'script' ? 0 : blockDepth + 1,
            0,
          );
      }
      // いまのばしょから動く has one or two legs; with none it would be written いまのばしょから、動く, which does not read.
      if (schema.kind === 'MotionCommand' && node.op === 'MOVE_BY' && !Object.hasOwn(node, 'x') && !Object.hasOwn(node, 'y'))
        blockStructureError('よこか たての どちらかの 歩数を 入れてください', path);
      if (schema.kind === 'IfStatement' && !node.hasElse && node.elseComment)
        blockDataError('「そうでなければ」がないのに、そこにメモがあります', path);
      if (schema.kind === 'CommentLine' && node.inlineComment)
        blockDataError('1行のメモは本文の中に置いてください', path);
      active.delete(node);
      return node;
    };
    return visit(root, expected, 'root', 0, expected === 'expression' ? 1 : 0);
  }
  // A new block runs as it is and does something (FCB-05, F-25): the values the 書ける ことば examples use, never 0 where
  // 0 stops the run (ペンの太さ), silences it (音の大きさ) or does nothing (重なり, 音の高さ, ふやす).
  const NEW_BLOCK_VALUES = Object.freeze({
    'PenCommand:SET_SIZE|args': 3, 'SoundCommand:SET_VOLUME|args': 50, 'LooksCommand:FORWARD_LAYERS|args': 1,
    'LooksCommand:BACKWARD_LAYERS|args': 1, 'SoundCommand:PITCH_UP|args': 1, 'SoundCommand:PITCH_DOWN|args': 1,
    'LooksCommand:SET_SELF_TEXT|args': 'こんにちは', 'NumericUpdate:ADD|value': 1, 'NumericUpdate:SUB|value': 1,
    'Ask|question': '名前は？', 'Broadcast|message': 'スタート', 'BroadcastAndWait|message': 'スタート',
  });
  function createSyntaxNode(schema, context = {}) {
    const draft = context.draft === true;
    const hole = (role, label) => ({ kind: 'Hole', role, label });
    if (draft && ['NumberLiteral', 'StringLiteral', 'BooleanLiteral', 'VariableRead', 'TargetReference'].includes(schema.kind))
      return hole(schema.category, schema.label);
    const node = schema.category === 'target' && schema.kind !== 'Hole' ? {} : { kind: schema.kind };
    if (schema.discriminator) node[schema.discriminator.key] = schema.discriminator.value;
    for (const field of schema.fields)
      if (field.required !== false) node[field.key] = blockFieldValue(field, field.initial, 'create.' + field.key);
    // A call names a ブロック of the work when the editor gives one (F2-06, E2E-R2-07), never a name that is not there.
    const own = schema.kind === 'UserActionCall' ? context.actionName : schema.kind === 'UserFunctionCall' ? context.functionName : null;
    if (typeof own === 'string' && own && schema.fields.some(field => field.key === 'name')) node.name = blockFieldValue(schema.fields.find(field => field.key === 'name'), own, 'create.name');
    const valueNode = (value) =>
      Array.isArray(value)
        ? { kind: 'ListLiteral', items: [] }
        : {
            kind:
              typeof value === 'boolean'
                ? 'BooleanLiteral'
                : typeof value === 'string'
                  ? 'StringLiteral'
                  : 'NumberLiteral',
            value,
          };
    for (const slot of schema.inputs) {
      if (slot.required === false) continue;
      const make = () => draft ? hole(slot.type, slot.label)
        : slot.type === 'target' ? { name: '値', qualifier: null } : valueNode(NEW_BLOCK_VALUES[schema.id + '|' + slot.key] ?? slot.initial ?? (
          schema.id === 'LooksCommand:SET_SCALE' ? 100 :
          ['MotionCommand:TURN_RIGHT', 'MotionCommand:TURN_LEFT'].includes(schema.id) ? 15 :
          // 向きを45度にする changes a new part's direction (0 is the direction it has, F2-16).
          schema.id === 'MotionCommand:SET_DIRECTION' ? 45 :
          // A colour is named as the child names it (F-21), as the hints write it: 色を「赤」に, ペンの色を「青」に.
          schema.id === 'LooksCommand:SET_COLOR' ? '赤' : schema.id === 'PenCommand:SET_COLOR' ? '青' : 0
        ));
      if (slot.multiple && slot.initialValues && !draft) { node[slot.key] = slot.initialValues.map(cloneDesignProject); continue; }
      // A new block runs as it is and shows or plays something (F-03): すがた and はいけい take the next name of the
      // work when the editor gives one, and a tone is 440Hz for 0.5秒.
      const named = { 'LooksCommand:SET_COSTUME': context.costume, 'LooksCommand:SET_BACKDROP': context.backdrop }[schema.id],
        tone = ['SoundCommand:TONE_WAIT', 'SoundCommand:TONE'].includes(schema.id) ? [440, 0.5] : null;
      node[slot.key] = slot.multiple
        ? Array.from({ length: slot.initialItems ?? slot.minItems }, (_, index) =>
            !draft && index === 0 && typeof named === 'string' && named
              ? valueNode(named) : !draft && tone && index < tone.length
              ? valueNode(tone[index]) : !draft && ['LooksCommand:SET_INPUT', 'LooksCommand:SET_TARGET_TEXT'].includes(schema.id) && index < 2
              // The part the editor names, else the name a new 入力らん／文字 part gets, and the words the hint writes (F2-01).
              ? valueNode(index === 1 ? 'こんにちは' : schema.id === 'LooksCommand:SET_INPUT' ? context.inputTarget || '入力らん1' : context.textTarget || '文字1')
              // 1から6のどれか: a die, so the value changes (F2-16).
              : !draft && schema.id === 'BuiltinCall:乱数' && index < 2 ? valueNode(index ? 6 : 1) : !draft && schema.id === 'MotionCommand:MOVE' && index === 0
                ? valueNode(10) : !draft && ['MotionCommand:GOTO_PART', 'MotionCommand:POINT_TO'].includes(schema.id) && index === 0
                  // The first part in the work other than the body's owner, or the mouse (LANGUAGE.md 動きの文).
                  ? valueNode(typeof context.partTarget === 'string' && context.partTarget ? context.partTarget : 'マウス')
                  // A copy is made of a character: the one the editor names, else the first other part.
                  : !draft && schema.id === 'CloneCommand:CREATE_TARGET' && index === 0 && [context.spriteTarget, context.partTarget].some(name => typeof name === 'string' && name && name !== 'マウス')
                    ? valueNode([context.spriteTarget, context.partTarget].find(name => typeof name === 'string' && name && name !== 'マウス')) : make())
        : make();
    }
    // A new いまのばしょから動く moves 右へ10歩; its second leg and the time are added in the block.
    if (schema.id === 'MotionCommand:MOVE_BY') node.x = valueNode(10);
    if (schema.id === 'ContinuousRule' && !draft) node.condition = { kind: 'SensorRead', sensor: 'KEY_DOWN', arg: valueNode('右') };
    for (const slot of schema.bodies)
      node[slot.key] =
        slot.requiredExecutable && (!slot.when || node[slot.when])
          ? [draft ? { ...hole('statement', slot.label), inlineComment: '' } : { kind: 'NoOperation', inlineComment: '' }]
          : [];
    for (const annotation of schema.annotations) node[annotation.key] = '';
    // Only the editor supplies a confirmed design position. API-only creation
    // keeps its established defaults, and existing nodes are never rewritten.
    const position = context.designPosition;
    if (!draft && position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
      const coordinate = value => value < 0 || Object.is(value, -0)
        ? { kind: 'UnaryExpression', op: 'NEG', value: valueNode(Math.abs(value)) } : valueNode(value);
      // A new 決めたばしょへ行く holds the part's current centre (右へ よこ歩、上へ たて歩); a negative place keeps 右へ/上へ
      // with its sign, as the code writes it.
      if (schema.id === 'MotionCommand:GOTO') { node.x = coordinate(position.x); node.y = coordinate(position.y); }
    }
    validateSyntaxAst(node, schema.category, { allowHoles: draft || context.allowHoles === true });
    return node;
  }
  function blockAvailability(context = {}) {
    if (!context.ast || !context.project)
      return { enabled: false, reason: '挿入先を含む本文と作品の確認が必要です', diagnostics: [] };
    const diagnostics = analyzeAst(context.ast, context.project, context);
    return {
      enabled: diagnostics.length === 0,
      reason: diagnostics.map((x) => x.message).join('\n'),
      diagnostics,
    };
  }
  function blockEncode(root, context = {}) {
    const rootType = context.expected || syntaxSchema(root).category;
    validateSyntaxAst(root, rootType, context);
    const nodeMap = new Map(),
      nodeIds = new WeakMap();
    let nextId = 0;
    const encode = (node, type, path) => {
      const schema = syntaxSchema(node, type),
        id = String(context.idPrefix ?? 'blockui') + '-' + ++nextId,
        tree = { id, schemaId: schema.id, fields: {}, inputs: {}, bodies: {}, annotations: {} };
      const location = { path: [...path], kind: schema.kind };
      const surface = SOURCE_RANGES.get(node);
      if (surface) location.surface = surface;
      for (const key of ['sourceSpan', 'endLine', 'raw', 'source'])
        if (Object.hasOwn(node, key))
          location[key] = key === 'sourceSpan' ? { ...node[key] } : node[key];
      nodeMap.set(id, location);
      nodeIds.set(node, id);
      for (const field of schema.fields)
        if (Object.hasOwn(node, field.key) && node[field.key] !== undefined)
          tree.fields[field.key] = blockFieldValue(field, node[field.key], 'encode.' + field.key);
      for (const slot of schema.inputs) {
        if (!Object.hasOwn(node, slot.key) && slot.required === false) continue;
        tree.inputs[slot.key] = slot.multiple
          ? node[slot.key].map((child, i) => encode(child, slot.type, [...path, slot.key, i]))
          : encode(node[slot.key], slot.type, [...path, slot.key]);
      }
      for (const slot of schema.bodies)
        tree.bodies[slot.key] = node[slot.key].map((child, i) =>
          encode(child, 'statement', [...path, slot.key, i]),
        );
      for (const annotation of schema.annotations)
        if (annotation.required !== false || Object.hasOwn(node, annotation.key))
          tree.annotations[annotation.key] = node[annotation.key] ?? '';
      return tree;
    };
    // The names the code was read with stay with the blocks, so block→code writes what 整える writes (F-34:
    // 点数を言う, 持ち物の数).
    const tree = encode(root, rootType, []), symbols = context.symbols || FORMAT_SYMBOLS.get(root);
    if (symbols) BLOCK_TREE_SYMBOLS.set(tree, symbols);
    return { tree, nodeMap, nodeIds };
  }
  function blockDecode(tree, context = {}) {
    const seen = new WeakSet(),
      ids = new Set();
    let count = 0;
    const decode = (block, type, path, blockDepth, expressionDepth) => {
      blockRecord(block, ['id', 'schemaId', 'fields', 'inputs', 'bodies', 'annotations'], path);
      if (seen.has(block)) blockDataError('同じブロックが2か所につながっています', path);
      seen.add(block);
      if (typeof block.id !== 'string' || !block.id || ids.has(block.id))
        blockDataError('ブロックの番号がないか、同じ番号があります', path);
      ids.add(block.id);
      const schema = BLOCK_SCHEMA_BY_ID.get(block.schemaId);
      if (!schema || (type && schema.category !== type))
        blockDataError('ブロックの しゅるいか、つなぐ 先が 正しくありません', path);
      if (
        ++count > LIMITS.sourceEach ||
        blockDepth > LIMITS.blockDepth ||
        expressionDepth > LIMITS.expressionDepth
      )
        blockStructureError('ブロックが 多すぎるか、中に 重ねすぎています。ブロックを へらしてください', path);
      blockRecord(
        block.fields,
        schema.fields.map((x) => x.key),
        path + '.fields',
      );
      blockRecord(
        block.inputs,
        schema.inputs.map((x) => x.key),
        path + '.inputs',
      );
      blockRecord(
        block.bodies,
        schema.bodies.map((x) => x.key),
        path + '.bodies',
      );
      const annotationKeys = schema.annotations.map((x) => x.key);
      blockRecord(block.annotations, annotationKeys, path + '.annotations');
      const node = schema.category === 'target' && schema.kind !== 'Hole' ? {} : { kind: schema.kind };
      if (schema.discriminator) node[schema.discriminator.key] = schema.discriminator.value;
      for (const field of schema.fields) {
        if (!Object.hasOwn(block.fields, field.key)) {
          if (field.required === false) continue;
          blockDataError('「' + (field.label || field.key) + '」がありません', path);
        }
        node[field.key] = blockFieldValue(
          field,
          block.fields[field.key],
          path + '.fields.' + field.key,
        );
      }
      for (const slot of schema.inputs) {
        if (!Object.hasOwn(block.inputs, slot.key) && slot.required === false) continue;
        const value = block.inputs[slot.key];
        if (slot.multiple) {
          if (!Array.isArray(value) || value.length < slot.minItems || value.length > slot.maxItems)
            blockDataError('入れるものの数が合いません', path + '.inputs.' + slot.key);
          node[slot.key] = value.map((child, i) =>
            decode(
              child,
              slot.type,
              path + '.inputs.' + slot.key + '[' + i + ']',
              blockDepth,
              slot.type === 'expression' ? expressionDepth + 1 : 0,
            ),
          );
        } else
          node[slot.key] = decode(
            value,
            slot.type,
            path + '.inputs.' + slot.key,
            blockDepth,
            slot.type === 'expression' ? expressionDepth + 1 : 0,
          );
      }
      for (const slot of schema.bodies) {
        const children = block.bodies[slot.key];
        if (!Array.isArray(children))
          blockDataError('中のブロックがありません', path + '.bodies.' + slot.key);
        node[slot.key] = children.map((child, i) =>
          decode(
            child,
            'statement',
            path + '.bodies.' + slot.key + '[' + i + ']',
            schema.category === 'script' ? 0 : blockDepth + 1,
            0,
          ),
        );
      }
      for (const key of annotationKeys) {
        if (!Object.hasOwn(block.annotations, key)) {
          if (schema.annotations.find(annotation => annotation.key === key)?.required === false) continue;
          blockDataError('メモを書くところがありません', path + (path ? ' / ' : '') + key);
        }
        node[key] = block.annotations[key];
      }
      return node;
    };
    const rootType = context.expected || BLOCK_SCHEMA_BY_ID.get(tree?.schemaId)?.category;
    const ast = decode(tree, rootType, 'root', 0, rootType === 'expression' ? 1 : 0);
    validateSyntaxAst(ast, rootType, context);
    const symbols = context.symbols || (tree && typeof tree === 'object' ? BLOCK_TREE_SYMBOLS.get(tree) : null);
    if (symbols && ast && typeof ast === 'object') FORMAT_SYMBOLS.set(ast, symbols);
    return ast;
  }
  function createBlock(schemaId, context = {}) {
    const schema = BLOCK_SCHEMA_BY_ID.get(schemaId);
    if (!schema) blockDataError('あかりにないブロックです');
    return blockEncode(schema.create(context), { ...context, expected: schema.category }).tree;
  }

  const PREC = {
    OR: 1,
    AND: 2,
    NOT: 3,
    CMP: 4,
    ADD: 5,
    MUL: 6,
    UNARY: 7,
    POW: 8,
    SEARCH: 9,
    POST: 10,
    ATOM: 11,
  };
  function decimalSource(value) {
    const text = String(value);
    if (!/[eE]/.test(text)) return text;
    const [mantissa, exp] = text.toLowerCase().split('e'),
      parts = mantissa.split('.'),
      digits = parts.join(''),
      point = parts[0].length + Number(exp);
    return point <= 0
      ? '0.' + '0'.repeat(-point) + digits
      : point >= digits.length
        ? digits + '0'.repeat(point - digits.length)
        : digits.slice(0, point) + '.' + digits.slice(point);
  }

