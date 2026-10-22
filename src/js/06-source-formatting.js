  // ────────────────────────────────────────────────────────────────────────
  // 06 — Canonical source formatting
  // ────────────────────────────────────────────────────────────────────────
  // Formatting is synchronous. A lexical draft scope permits placeholders only
  // during the explicitly requested editor render, and is restored on errors.
  function withExpressionFormatOptions(options, callback) {
    const entered = !!options?.allowHoles;
    if (entered) expressionDraftFormatDepth++;
    try { return callback(); }
    finally { if (entered) expressionDraftFormatDepth--; }
  }
  function formatHoleSource(n) {
    if (!expressionDraftFormatDepth)
      throw new AkariError('P210', 'あいている ところが あります。中身や することを えらんでください');
    let label = typeof n.label === 'string' ? n.label.trim() : '';
    if (/[〔〕\r\n]/u.test(label)) throw new AkariError('P210', 'あいている ところの 名前に 〔 〕や 行がえは 使えません');
    if (!label) label = ({expression:'中身を入れる',statement:'することをえらぶ',target:'かえるものをえらぶ',rule:'動かし方をえらぶ'})[n.role] || '中身を入れる';
    else if (!/(?:選ぶ|えらぶ|入れる|指定する|書く)$/.test(label)) label += label === 'きまり' ? 'をえらぶ' : 'を入れる';
    return `〔${label}〕`;
  }
  // The work's names while a script is formatted (options.symbols, or the symbols it was read with); null when unknown.
  let formatSymbols = null, formatLocalNames = new Set();
  // A name the formatted text can use bare: data of the work, or a name made in this text (この中だけ, 今見ているもの).
  function formatKnownName(name) {
    return !!formatSymbols?.allDataNames?.has?.(name) || formatLocalNames.has(name);
  }
  function localNamesOf(ast) {
    const names = new Set(), visit = node => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (node.kind === 'ForEach' && node.binder) names.add(node.binder);
      if (['LocalVariableDeclaration', 'LocalListDeclaration'].includes(node.kind) && node.name) names.add(node.name);
      for (const [key, value] of Object.entries(node)) if (key !== 'sourceSpan' && value && typeof value === 'object') visit(value);
    };
    visit(ast);
    return names;
  }
  // A list's length is written 持ち物の数 (F-34), but only where that reads back: the name is a list of the work and no
  // data is called 持ち物の数 (then 持ち物の長さ keeps the meaning). Without the work's names it is 〜の長さ.
  function listCountWord(list) {
    const s = formatSymbols;
    if (!s || list?.kind !== 'VariableRead') return 'の長さ';
    const lists = [s.projectLists, ...[...(s.individualByTargetId?.values?.() || [])].map(d => d.lists)];
    const isList = lists.some(m => m?.has?.(list.name)), taken = s.allDataNames?.has?.(list.name + 'の数');
    return isList && !taken ? 'の数' : 'の長さ';
  }
  // The character's colour is written 色を「赤」にする (F-25) when the work is known to have no data named 色; otherwise
  // 表示色 keeps the meaning (色を… would change that data). For 05's formatCommand.
  function colorCommandWord() {
    return formatSymbols && !formatSymbols.allDataNames?.has?.('色') && !formatLocalNames.has('色') ? '色' : '表示色';
  }
  function formatExpression(n, parent = 0, options = {}) {
    if (parent && typeof parent === 'object') { options = parent; parent = 0; }
    // options.symbols: the work's names, as for formatScript (持ち物の数 and the other F-34 forms).
    const outerSymbols = formatSymbols;
    if (options.symbols) formatSymbols = options.symbols;
    try {
      return withExpressionFormatOptions(options, () => {
        validateSyntaxAst(n, 'expression', {allowHoles: expressionDraftFormatDepth > 0});
        return formatExpressionCore(n, parent);
      });
    } finally { formatSymbols = outerSymbols; }
  }
  // The value before a unit (秒・歩・回・度・％・番目・文字目): a number as it is, a name in 【 】, another expression in （ ）.
  function quantityValueSource(value, bareRange = false) {
    if (value.kind === 'NumberLiteral' || (value.kind === 'UnaryExpression' && ['NEG', 'POS'].includes(value.op) && value.value.kind === 'NumberLiteral'))
      return formatExpressionCore(value);
    if (value.kind === 'VariableRead')
      return (value.qualifier === 'project' ? '作品の' : value.qualifier === 'self' ? '自分の' : '') + '【' + value.name + '】';
    if (bareRange && value.kind === 'BuiltinCall' && value.name === '乱数' && value.args.length === 2) return formatExpressionCore(value, PREC.CMP + 0.5);
    const text = formatExpressionCore(value);
    let level = 0, whole = text.startsWith('（');
    for (let i = 0, quote = false; whole && i < text.length; i++) {
      const ch = text[i];
      if (quote) { if (ch === '」') quote = false; continue; }
      if (ch === '「') quote = true;
      else if (ch === '（') level++;
      else if (ch === '）' && !--level && i < text.length - 1) whole = false;
    }
    return whole ? text : '（' + text + '）';
  }
  // A part joined by と (〜と〜をつなげる) is wrapped in （ ） when its own text has と・を・が outside quotes and brackets.
  function joinPartSource(x) {
    const text = formatExpressionCore(x);
    return /[とをがに]/.test(surfaceMask(text)) ? '（' + text + '）' : text;
  }
  function formatExpressionCore(n, parent = 0) {
    let s = '',
      p = PREC.ATOM;
    switch (n.kind) {
      case 'Hole':
        s = formatHoleSource(n);
        break;
      case 'NumberLiteral':
        s = decimalSource(n.value);
        break;
      case 'StringLiteral':
        s = `「${n.value.replace(/[\\「」]/g, ch => '\\' + ch)}」`;
        break;
      case 'BooleanLiteral':
        s = `条件の答え（${n.value ? 'あてはまる' : 'あてはまらない'}）`;
        break;
      case 'QuantityLiteral':
        s = `${quantityValueSource(n.value)}${n.unit}`; p=PREC.POST; break;
      case 'UnitlessRead':
        s = `${formatExpressionCore(n.value,PREC.POST)}の数だけ`; p=PREC.POST; break;
      case 'ActorQualifiedRead': {
        // 「たくどん」のよこのばしょ: a part's state word or data name follows without brackets, as other commands name the part in 「」.
        const state = n.value.kind === 'SensorRead' && n.value.arg === undefined;
        const plain = n.actorRef.kind === 'self' ? state : state || n.value.kind === 'VariableRead';
        const owner = n.actorRef.kind === 'self' ? '自分' : '「' + n.actorRef.name + '」';
        s = plain ? `${owner}の${formatExpressionCore(n.value)}` : `${owner}の（${formatExpressionCore(n.value)}）`; p=PREC.POST; break;
      }
      case 'ListLiteral':
        s = `［${n.items.map((x) => formatExpressionCore(x)).join('、')}］`;
        break;
      case 'VariableRead':
        s = nameSource(n.name, n.qualifier);
        break;
      case 'ExtensionCalculation':
        s = extensionSurface(n.name, true, n.args); break;
      case 'UserFunctionCall':
        s = n.argumentNames ? `（${n.args.map((x,i) => `${nameSource(n.argumentNames[i])}を${formatExpressionCore(x)}`).join('、')}として、【${n.name}】で求めた答え）` : `（${n.args.length === 1 && ['NumberLiteral','StringLiteral','VariableRead'].includes(n.args[0].kind) && !(n.args[0].kind === 'NumberLiteral' && n.args[0].value < 0) ? `${formatExpressionCore(n.args[0])}をわたして、` : n.args.length ? `（${n.args.map(x=>formatExpressionCore(x)).join('、')}）をわたして、` : ''}【${n.name}】で求めた答え）`;
        break;
      case 'BuiltinCall': {
        if (n.name === 'CONTAINS')
          s = `${formatExpressionCore(n.args[0], PREC.CMP + 1)}に${formatExpressionCore(n.args[1], PREC.CMP + 1)}が入っている`;
        else if (n.name === 'INDEX_OF')
          s = `${formatExpressionCore(n.args[0], PREC.POST)}の中で${formatExpressionCore(n.args[1], PREC.POST)}がはじめて出てくる番号`;
        else if (n.name === 'LENGTH') s = `${formatExpressionCore(n.args[0], PREC.POST)}${listCountWord(n.args[0])}`;
        else if (n.name === 'STRING_LENGTH')
          s = `${formatExpressionCore(n.args[0], PREC.POST)}の文字数`;
        else if (n.name === 'STRING_CHAR')
          s = `${formatExpressionCore(n.args[0], PREC.POST)}の${quantityValueSource(n.args[1])}文字目`;
        else if (n.name === '乱数' && n.args.length === 2)
          s = `${formatExpressionCore(n.args[0], PREC.ADD)}から${formatExpressionCore(n.args[1], PREC.ADD)}のどれか`;
        else if (n.name === '余り' && n.args.length === 2)
          s = `${formatExpressionCore(n.args[0], PREC.MUL)}÷${formatExpressionCore(n.args[1], PREC.MUL + 1)}のあまり`;
        else if (n.name === 'つなぐ' && n.args.length >= 2)
          s = `（${n.args.map(joinPartSource).join('と')}をつなげた文字）`;
        else
          s = `${builtinSurfaceName(n.name)}（${n.args.map((x) => formatExpressionCore(x)).join('、')}）`;
        // 「AからBのどれか」 binds looser than ＋ and tighter than a comparison.
        p = n.name === 'CONTAINS' ? PREC.CMP : n.name === 'INDEX_OF' ? PREC.SEARCH
          : n.name === '乱数' && n.args.length === 2 ? PREC.CMP + 0.5 : n.name === '余り' && n.args.length === 2 ? PREC.MUL : PREC.POST;
        break;
      }
      case 'ListRead':
        s = `${formatExpressionCore(n.list, PREC.POST)}の${quantityValueSource(n.index)}番目`;
        p = PREC.POST;
        break;
      case 'SensorRead': {
        if (n.sensor === '拡張の値' && EXTENSION_HOST.operations('events').length) s = '拡張「できごとの値」';
        else if (FIXED_SENSORS.includes(n.sensor)) s = SENSOR_SURFACES[n.sensor] || n.sensor;
        else if (n.sensor === 'INPUT_VALUE') s = `${n.arg.kind==='VariableRead'?'（'+formatExpressionCore(n.arg)+'）':formatExpressionCore(n.arg, PREC.POST)}の中身`;
        else if (n.sensor === 'DISTANCE_TO')
          s = `${formatExpressionCore(n.arg, PREC.POST)}までのきょり`;
        else if (n.sensor === 'KEY_DOWN')
          s = `${n.arg?.kind === 'StringLiteral' ? formatExpressionCore(exprNode('StringLiteral', { value: keySurface(n.arg.value) })) : formatExpressionCore(n.arg, PREC.POST)}キーがおされている`;
        else if (n.sensor === 'TOUCHING_COLOR')
          s = `${formatExpressionCore(n.arg, PREC.POST)}の色にふれている`;
        else if (n.sensor === 'TOUCHING') s = `${n.arg?.kind === 'StringLiteral' && isEdgeTarget(n.arg.value) ? EDGE_TARGETS[n.arg.value] : formatExpressionCore(n.arg, PREC.POST)}にふれている`;
        p = PREC.POST;
        break;
      }
      case 'UnaryExpression':
        if (n.op === 'NOT') {
          s = formatCondition(n, 'plain');
          p = PREC.NOT;
        } else {
          s = `${n.op === 'NEG' ? '－' : '＋'}${formatExpressionCore(n.value, PREC.UNARY + 1)}`;
          p = PREC.UNARY;
        }
        break;
      case 'BinaryExpression': {
        const sym = { ADD: '＋', SUB: '－', MUL: '×', DIV: '÷', POW: '＾' }[n.op];
        p = n.op === 'POW' ? PREC.POW : n.op === 'MUL' || n.op === 'DIV' ? PREC.MUL : PREC.ADD;
        const lp = n.op === 'POW' ? p + 1 : p,
          rp = n.op === 'POW' ? p : p + 1;
        s = `${formatExpressionCore(n.left, lp)}${sym}${formatExpressionCore(n.right, rp)}`;
        break;
      }
      case 'CompareExpression': {
        const suf = {
          GTE: '以上',
          LTE: '以下',
          GT: 'より大きい',
          LT: 'より小さい',
          EQ: 'と同じ',
          NEQ: 'とちがう',
        }[n.op];
        const key = side => side?.kind === 'StringLiteral' && [n.left, n.right].some(x => x?.kind === 'SensorRead' && x.sensor === '押されたキー') ? exprNode('StringLiteral', { value: keySurface(side.value) }) : side;
        s = `${formatExpressionCore(key(n.left), PREC.CMP + 1)}が${formatExpressionCore(key(n.right), PREC.CMP + 1)}${suf}`;
        p = PREC.CMP;
        break;
      }
      case 'EventCount':
        s = eventCountSource(n);
        p = PREC.CMP;
        break;
      case 'LogicalExpression': {
        p = n.op === 'AND' ? PREC.AND : PREC.OR;
        // 「AからBのどれか」 beside かつ／または keeps its （ ）: 「…のどれかまたは…」 does not read back.
        const side = (x, min) => x.kind === 'BuiltinCall' && x.name === '乱数' && x.args.length === 2 ? `（${formatExpressionCore(x)}）` : formatExpressionCore(x, min);
        s = `${side(n.left, p)}${n.op === 'AND' ? 'かつ' : 'または'}${side(n.right, p + 1)}`;
        break;
      }
      default:
        throw new AkariError('P201', `未対応の式 ${n.kind}`);
    }
    return p < parent ? `（${s}）` : s;
  }
  function builtinSurfaceName(n) {
    return BUILTIN_SURFACES[n] || n;
  }
  function formatScript(ast, options = {}) {
    const outerSymbols = formatSymbols, outerLocals = formatLocalNames;
    formatSymbols = options.symbols || FORMAT_SYMBOLS.get(ast) || outerSymbols;
    formatLocalNames = new Set([...outerLocals, ...localNamesOf(ast), ...(options.localNames || [])]);
    try { return formatScriptCore(ast, options); } finally { formatSymbols = outerSymbols; formatLocalNames = outerLocals; }
  }
  function formatScriptCore(ast, options) {
    return withExpressionFormatOptions(options,()=>{
    validateSyntaxAst(ast,'script',{allowHoles:!!options.allowHoles});
    const out=[],line=(depth,text,comment='')=>out.push('  '.repeat(depth)+text+(text.endsWith('、')?'':'。')+(comment?'  '+comment:''));
    // A nested suite inherits its surrounding topic, but its topic changes stay local.
    // A wait of one part always names it (自分は1秒待つ); the wait of the whole flow has no subject.
    // Under a heading that names a part (たくどんは、3回くり返す。) that part's sentences are written without it, until
    // another subject comes; a wait still names it, because without a subject it is the wait of the whole flow.
    const emit=(body,depth,inheritedActor={kind:'self'})=>{let previousActor={...inheritedActor};for(const n of body){if(n.kind==='CommentLine'){out.push('  '.repeat(depth)+'※'+n.text);continue;}const wait=EVERYONE_WAITS.has(n.kind),actorRef=n.actorRef||(wait?{kind:'all'}:{kind:'self'}),everyone=actorRef.kind==='all',sameTopic=actorRef.kind==='named'&&!wait&&inheritedActor.kind==='named'&&actorRef.name===inheritedActor.name&&previousActor.kind==='named'&&previousActor.name===inheritedActor.name,actor=!everyone&&!sameTopic&&!['Hole','WaitBroadcastGroup'].includes(n.kind)&&(wait||actorRef.kind==='named'||(actorRef.kind==='self'&&previousActor.kind==='named'))?sentenceActorSource(actorRef)+(actorRef.particle||'は'):'',f=formatExpression,t=n.target?formatTarget(n.target):'',comment=n.inlineComment||'';let text;
      const controlActor=actorRef.kind!==previousActor.kind||(actorRef.kind==='named'&&actorRef.name!==previousActor.name)
        ? sentenceActorSource(actorRef)+'は、' : '';
      switch(n.kind){
        case 'Hole':text=formatHoleSource(n);break;
        case 'IfStatement':line(depth,controlActor+sentenceFormFor(n).render(n),comment);emit(n.thenBody,depth+1,actorRef);if(n.hasElse){line(depth,'そうでなければ、',n.elseComment||'');emit(n.elseBody,depth+1,actorRef);}continue;
        case 'RepeatCount':line(depth,controlActor+sentenceFormFor(n).render(n),comment);emit(n.body,depth+1,actorRef);continue;
        case 'RepeatWhile':case 'RepeatUntil':line(depth,controlActor+sentenceFormFor(n).render(n),comment);emit(n.body,depth+1,actorRef);continue;
        case 'Forever':line(depth,controlActor+sentenceFormFor(n).render(n),comment);emit(n.body,depth+1,actorRef);continue;
        case 'ForEach':line(depth,controlActor+sentenceFormFor(n).render(n),comment);if(n.binder!=='今見ているもの')line(depth+1,`この中では、今見ているものを【${n.binder}】とよぶ`);emit(n.body,depth+1,actorRef);continue;
        default:{const form=sentenceFormFor(n);if(!form)throw new AkariError('P201',`未対応の文 ${n.kind}`);text=form.render(n);break;}
      }
      // ねこは、点数が10になるまで待つ: a wait that names its subject takes 、 after it, so the subject that waits and
      // the subject inside the condition read apart (as in ねこは、3回くり返す and the other headings with a condition).
      // たくどんは、いまのばしょから、…: the comma keeps a long run of kana apart (B-06).
      line(depth,actor+(actor&&(n.kind==='WaitUntil'||text.startsWith('いまのばしょから'))?'、':'')+text,comment);if(n.kind!=='Hole'&&!everyone)previousActor=actorRef;
    }};
    if(ast.heading)line(0,sentenceHeadingSource(ast.heading));
    emit(ast.body,ast.heading?1:0,options.inheritedActor);
    for(const rule of ast.rules||[])line(ast.heading?1:0,rule.kind==='Hole'?formatHoleSource(rule):sentenceFormFor(rule).render(rule),rule.inlineComment||'');
    for(const unit of ast.units||[])out.push(formatScript(unit,options));
    const source=out.join('\n');if(cpLen(source)>LIMITS.sourceEach)throw new AkariError('P208','この 動きの まとまりが 長すぎます。ブロックや 文字を へらしてください',1,1);return source;
    });
  }
  function formatTarget(t) {
    if(t?.kind==='Hole')return formatHoleSource(t);
    return nameSource(t.name, t.qualifier);
  }

