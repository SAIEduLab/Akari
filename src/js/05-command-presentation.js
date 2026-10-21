  // ────────────────────────────────────────────────────────────────────────
  // 05 — Shared command presentation and structural block vocabulary
  // ────────────────────────────────────────────────────────────────────────
  const COMMAND_PRESENTATION = Object.freeze({
    MotionCommand: Object.freeze({
      palette: '動き',
      operations: Object.freeze({
        MOVE_DIRECTION: Object.freeze({label:'方向へ動く',inputs:Object.freeze(['歩数']),format:(a,n)=>`${{right:'画面の右',left:'画面の左',up:'画面の上',down:'画面の下',forward:'前',backward:'後ろ'}[n.direction]}へ${a(0,'歩')}動く`}),
        GLIDE_DIRECTION: Object.freeze({label:'時間をかけて方向へ動く',inputs:Object.freeze(['秒','歩数']),format:(a,n)=>`${a(0,'秒')}かけて${{right:'画面の右',left:'画面の左',up:'画面の上',down:'画面の下',forward:'前',backward:'後ろ'}[n.direction]}へ${a(1,'歩')}動く`}),
        MOVE: Object.freeze({
          label: '前へ 進む',
          inputs: Object.freeze(['歩数']),
          format: (a) => `前へ${a(0,'歩')}進む`,
        }),
        GOTO: Object.freeze({
          label: 'ばしょへ行く',
          inputs: Object.freeze(['よこの ばしょ', 'たての ばしょ']),
          format: (a) => `よこ${a(0)}、たて${a(1)}のばしょへ行く`,
        }),
        GLIDE: Object.freeze({
          label: '時間をかけて ばしょへ動く',
          inputs: Object.freeze(['秒', 'よこの ばしょ', 'たての ばしょ']),
          format: (a) => `よこ${a(1)}、たて${a(2)}のばしょへ${a(0,'秒')}かけて動く`,
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
          format: (a) => `右に${a(0,'度')}回る`,
        }),
        TURN_LEFT: Object.freeze({
          label: '左に回る',
          inputs: Object.freeze(['何度']),
          format: (a) => `左に${a(0,'度')}回る`,
        }),
        SET_X: Object.freeze({
          label: 'よこの ばしょを決める',
          inputs: Object.freeze(['よこの ばしょ']),
          format: (a) => `よこのばしょを${a(0)}にする`,
        }),
        SET_Y: Object.freeze({
          label: 'たての ばしょを決める',
          inputs: Object.freeze(['たての ばしょ']),
          format: (a) => `たてのばしょを${a(0)}にする`,
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
          format: (a) => `表示色を${a(0)}にする`,
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
    return command.format((index, unit) => {const slot=sentenceFormFor(node)?.roleSlots.find(role=>role.path===`args.${index}`);if(unit&&slot?.unit!==unit)throw new AkariError('P205','文型の単位の役割が一致しません');const arg=node.args?.[index];if(!unit&&node.kind==='MotionCommand'&&['GOTO','GLIDE'].includes(node.op)&&arg?.kind==='QuantityLiteral'&&arg.unit==='歩'&&arg.value?.kind==='BuiltinCall'&&arg.value.name==='乱数')return formatExpression(arg.value);return unit ? sentenceQuantitySource(arg,slot.unit) : formatExpression(arg);}, node);
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
        Script: '動きのまとまり',
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
      // A wait names who waits (みんな is the whole flow). The one-line group wait always waits with the whole flow.
      if (category === 'statement' && kind !== 'WaitBroadcastGroup')
        fields = [...fields, field('actorRef', EVERYONE_WAITS.has(kind) ? 'だれが待つ' : 'だれが動く', 'actor-ref', undefined, { required: false, ...(EVERYONE_WAITS.has(kind) ? { everyone: true } : {}) })];
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
    add('Script', 'script', '動きのまとまり',
      [field('heading', 'できごとの きっかけ', 'heading', undefined, { required: false })],
      [input('rules', 'つづけて動くルール', 'rule', {
        required: false, multiple: true, minItems: 0, maxItems: LIMITS.activeTasks, variadic: true,
      }),input('units','できごとのまとまり','script',{
        required:false,multiple:true,minItems:1,maxItems:LIMITS.scripts,variadic:true,
      })], [body('body', '動きのまとまり', false)]);
    for (const role of ['expression', 'statement', 'target', 'rule'])
      add('Hole', role, 'あいている ところ', [field('label', 'ここに入れるもの', 'string', '中身')],
        [], [], op('role', role), { draftOnly: true, capability: 'draft-hole:' + role });
    add('QuantityLiteral', 'expression', 'たんいを つけた 数',
      [field('unit', 'たんい', 'unit', '歩')], [expression('value', '数や計算')], [], null,
      { capability: 'quantity-value', semanticRoles: ['value', 'unit'] });
    add('UnitlessRead', 'expression', 'たんいを とった数', [], [expression('value', '中身')], [], null,
      { capability: 'unitless-read', semanticRoles: ['value'] });
    add('ActorQualifiedRead', 'expression', 'えらんだキャラの中身',
      [field('actorRef', 'だれの', 'actor-ref', { kind: 'self' })],
      [expression('value', '読む中身')], [], null,
      { capability: 'actor-qualified-read', semanticRoles: ['actorRef', 'value'] });
    // 〜が10回【ジャンプ】するまで / 〜が3回おされるまで: used as the whole condition of a まで.
    add('EventCount', 'expression', '手順を 行った 回数',
      [field('actorRef', 'だれが', 'actor-ref', { kind: 'self' }), name('name', '手順の名前', 'ジャンプ', true)],
      [expression('count', '何回', 3)], [], op('event', 'action'),
      { capability: 'event-count:action', semanticRoles: ['actorRef', 'name', 'count'] });
    add('EventCount', 'expression', 'おされた 回数',
      [field('actorRef', 'だれが', 'actor-ref', { kind: 'self' })],
      [expression('count', '何回', 3)], [], op('event', 'click'),
      { capability: 'event-count:click', semanticRoles: ['actorRef', 'count'] });
    add('ContinuousRule', 'rule', 'きまりに あてはまる間、動きつづける',
      [field('actorRef', 'だれが動く', 'actor-ref', { kind: 'self' }),
        field('direction', '進む向き', 'direction', 'right')],
      [expression('condition', 'つづける きまり', true), expression('seconds', '何秒に', 1),
        expression('distance', '何歩の速さ', 20)], [], null,
      { capability: 'continuous-state-motion', semanticRoles: ['actorRef', 'condition', 'direction', 'seconds', 'distance'] });
    for (const [value, label, labels] of [
      ['MOVE_DIRECTION', '向きを決めて 動く', ['何歩']],
      ['GLIDE_DIRECTION', '時間をかけて 向きを決めて 動く', ['何秒で', '何歩']],
    ]) add('MotionCommand', 'statement', label,
      [field('direction', '進む向き', 'direction', 'right')], [args(labels)], [], op('op', value),
      { palette: '動き', capability: 'absolute-direction-motion:' + value });
    add('WaitBroadcastGroup', 'statement', 'その合図で始まったことが全部終わるまで待つ',
      [field('broadcastRef', '待つ合図', 'reference', 'その合図')], [], [], null,
      { capability: 'notification-group-wait' });
    add('TargetReference', 'target', 'かえるもの', [name(), qualifier()]);
    add('CommentLine', 'statement', 'メモ', [field('text', 'メモの中身', 'comment', '')]);
    add('Assignment', 'statement', '中身を決める', [], [target(), expression('value', '中身')]);
    for (const [value, label] of [
      ['ADD', 'かずを足す'],
      ['SUB', 'かずを引く'],
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
      '自分で作ったブロックを動かす',
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
          ['GTE', 'と同じか より大きい'],
          ['LTE', 'と同じか より小さい'],
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
            value === 'TOUCHING_COLOR'
              ? '#ff0000'
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
      add('SensorRead', 'expression', 'かくちょうの できごとの 中身', [], [], [], { key: 'sensor', value: '拡張の値' }, { palette: 'かくちょう' });
    return Object.freeze(schemas);
  })();
  const BLOCK_SCHEMA_BY_ID = new Map(BLOCK_SCHEMAS.map((schema) => [schema.id, schema]));
  function blockStructureError(message, path = '') {
    throw new AkariError(
      'P210',
      `ブロックの組み方に まちがいが あります: ${message}`,
      0,
      0,
      path,
    );
  }
  // Checks that only fail on broken saved data: first what to do, then the reason.
  function blockDataError(message, path = '') {
    throw new AkariError('P210', `作品の ファイルが こわれているかもしれません。先生に 見てもらってね。（${message}）`, 0, 0, path);
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
          blockRecord(value.filter, ['key', 'message'], path + '.filter');
          const keys = Object.keys(value.filter);
          if (keys.length !== 1 || (keys[0] !== 'key' && keys[0] !== 'message'))
            blockDataError('キーか合図を1つ選んでください', path);
          const key = keys[0];
          if ((key === 'key' && value.event !== 'keyDown') || (key === 'message' && value.event !== 'message'))
            blockDataError('きっかけと、選んだキーや合図が合いません', path);
          heading.filter = { [key]: blockFieldValue({ type: 'string' }, value.filter[key], path + '.filter.' + key) };
        }
      }
      return heading;
    }
    if (type === 'unit' || type === 'direction') {
      const values = type === 'unit' ? ['歩', '度', '秒', '回', '番目', '点', '個', '％', 'Hz']
        : ['right', 'left', 'up', 'down', 'forward', 'backward'];
      if (!values.includes(value)) blockStructureError(type === 'unit' ? 'たんいを えらんでください' : '進む 向きを えらんでください', path);
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
        blockStructureError('文字が長すぎます。短くしてください', path);
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
        blockDataError('きっかけのまとまりは、いちばん外に置いてください',path);
      if (schema.draftOnly && !allowHoles) blockStructureError('空いているところが あります。うめてから動かしてください', path);
      if (active.has(node)) blockDataError('ブロックが自分の中に入っています', path);
      active.add(node);
      if (++count > LIMITS.sourceEach)
        blockStructureError('ブロックが多すぎて、使える数をこえています。ブロックをへらしてください', path);
      if (blockDepth > LIMITS.blockDepth || expressionDepth > LIMITS.expressionDepth)
        blockStructureError('ブロックの中にブロックを重ねすぎています。重ねる数をへらしてください', path);
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
        blockStructureError('入れるものと名前の数が合いません。同じ数にしてください', path + '.argumentNames');
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
      if (schema.kind === 'IfStatement' && !node.hasElse && node.elseComment)
        blockDataError('「そうでなければ」がないのに、そこにメモがあります', path);
      if (schema.kind === 'CommentLine' && node.inlineComment)
        blockDataError('1行のメモは本文の中に置いてください', path);
      active.delete(node);
      return node;
    };
    return visit(root, expected, 'root', 0, expected === 'expression' ? 1 : 0);
  }
  function createSyntaxNode(schema, context = {}) {
    const draft = context.draft === true;
    const hole = (role, label) => ({ kind: 'Hole', role, label });
    if (draft && ['NumberLiteral', 'StringLiteral', 'BooleanLiteral', 'VariableRead', 'TargetReference'].includes(schema.kind))
      return hole(schema.category, schema.label);
    const node = schema.category === 'target' && schema.kind !== 'Hole' ? {} : { kind: schema.kind };
    if (schema.discriminator) node[schema.discriminator.key] = schema.discriminator.value;
    for (const field of schema.fields)
      if (field.required !== false) node[field.key] = blockFieldValue(field, field.initial, 'create.' + field.key);
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
        : slot.type === 'target' ? { name: '値', qualifier: null } : valueNode(slot.initial ?? (
          schema.id === 'LooksCommand:SET_SCALE' ? 100 :
          ['MotionCommand:TURN_RIGHT', 'MotionCommand:TURN_LEFT'].includes(schema.id) ? 15 : 0
        ));
      if (slot.multiple && slot.initialValues && !draft) { node[slot.key] = slot.initialValues.map(cloneDesignProject); continue; }
      node[slot.key] = slot.multiple
        ? Array.from({ length: slot.initialItems ?? slot.minItems }, (_, index) =>
            !draft && schema.id === 'LooksCommand:SET_INPUT' && index === 0
              ? valueNode('入力らん') : !draft && ['MotionCommand:MOVE', 'MotionCommand:MOVE_DIRECTION'].includes(schema.id) && index === 0
                ? valueNode(10) : make())
        : make();
    }
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
      const positions = { 'MotionCommand:GOTO': [[0,'x'],[1,'y']], 'MotionCommand:GLIDE': [[1,'x'],[2,'y']],
        'MotionCommand:SET_X': [[0,'x']], 'MotionCommand:SET_Y': [[0,'y']] }[schema.id] || [];
      for (const [index, key] of positions) node.args[index] = coordinate(position[key]);
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
    return { tree: encode(root, rootType, []), nodeMap, nodeIds };
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
        blockDataError('ブロックの種類か、つなぐ先が正しくありません', path);
      if (
        ++count > LIMITS.sourceEach ||
        blockDepth > LIMITS.blockDepth ||
        expressionDepth > LIMITS.expressionDepth
      )
        blockStructureError('ブロックが多すぎるか、中に重ねすぎています。ブロックをへらしてください', path);
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

