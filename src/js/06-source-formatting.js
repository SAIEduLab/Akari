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
  function formatExpression(n, parent = 0, options = {}) {
    if (parent && typeof parent === 'object') { options = parent; parent = 0; }
    return withExpressionFormatOptions(options, () => {
      validateSyntaxAst(n, 'expression', {allowHoles: expressionDraftFormatDepth > 0});
      return formatExpressionCore(n, parent);
    });
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
        s = `${formatExpressionCore(n.value,PREC.POST)}${n.unit}`; p=PREC.POST; break;
      case 'UnitlessRead':
        s = `${formatExpressionCore(n.value,PREC.POST)}の数だけ`; p=PREC.POST; break;
      case 'ActorQualifiedRead':
        s = `${n.actorRef.kind==='self'?'自分':nameSource(n.actorRef.name)}の（${formatExpressionCore(n.value)}）`; p=PREC.POST; break;
      case 'ListLiteral':
        s = `［${n.items.map((x) => formatExpressionCore(x)).join('、')}］`;
        break;
      case 'VariableRead':
        s = nameSource(n.name, n.qualifier);
        break;
      case 'ExtensionCalculation':
        s = extensionSurface(n.name, true, n.args); break;
      case 'UserFunctionCall':
        s = n.argumentNames ? `（${n.args.map((x,i) => `${nameSource(n.argumentNames[i])}を${formatExpressionCore(x)}`).join('、')}として、【${n.name}】で求めた答え）` : `（${n.args.length ? `（${n.args.map(x=>formatExpressionCore(x)).join('、')}）を渡して、` : ''}【${n.name}】で求めた答え）`;
        break;
      case 'BuiltinCall': {
        if (n.name === 'CONTAINS')
          s = `${formatExpressionCore(n.args[0], PREC.CMP + 1)}に${formatExpressionCore(n.args[1], PREC.CMP + 1)}が入っている`;
        else if (n.name === 'INDEX_OF')
          s = `${formatExpressionCore(n.args[0], PREC.POST)}で${formatExpressionCore(n.args[1], PREC.POST)}が最初にある番号`;
        else if (n.name === 'LENGTH') s = `${formatExpressionCore(n.args[0], PREC.POST)}の長さ`;
        else if (n.name === 'STRING_LENGTH')
          s = `${formatExpressionCore(n.args[0], PREC.POST)}の文字数`;
        else if (n.name === 'STRING_CHAR')
          s = `${formatExpressionCore(n.args[0], PREC.POST)}の${formatExpressionCore(n.args[1], PREC.POST + 1)}文字目`;
        else if (n.name === '乱数' && n.args.length === 2)
          s = `${formatExpressionCore(n.args[0], PREC.ADD)}から${formatExpressionCore(n.args[1], PREC.ADD)}のどれか`;
        else
          s = `${builtinSurfaceName(n.name)}（${n.args.map((x) => formatExpressionCore(x)).join('、')}）`;
        // 「AからBのどれか」 binds looser than ＋ and tighter than a comparison.
        p = n.name === 'CONTAINS' ? PREC.CMP : n.name === 'INDEX_OF' ? PREC.SEARCH
          : n.name === '乱数' && n.args.length === 2 ? PREC.CMP + 0.5 : PREC.POST;
        break;
      }
      case 'ListRead':
        s = `${formatExpressionCore(n.list, PREC.POST)}の${formatExpressionCore(n.index, PREC.POST + 1)}番目`;
        p = PREC.POST;
        break;
      case 'SensorRead': {
        if (n.sensor === '拡張の値' && EXTENSION_HOST.operations('events').length) s = '拡張「できごとの値」';
        else if (FIXED_SENSORS.includes(n.sensor)) s = SENSOR_SURFACES[n.sensor] || n.sensor;
        else if (n.sensor === 'INPUT_VALUE') s = `${n.arg.kind==='VariableRead'?'（'+formatExpressionCore(n.arg)+'）':formatExpressionCore(n.arg, PREC.POST)}の中身`;
        else if (n.sensor === 'DISTANCE_TO')
          s = `${formatExpressionCore(n.arg, PREC.POST)}までの距離`;
        else if (n.sensor === 'KEY_DOWN')
          s = `${formatExpressionCore(n.arg, PREC.POST)}キーがおされている`;
        else if (n.sensor === 'TOUCHING_COLOR')
          s = `${formatExpressionCore(n.arg, PREC.POST)}の色にふれている`;
        else if (n.sensor === 'TOUCHING') s = `${n.arg?.kind === 'StringLiteral' && n.arg.value === '端' ? '画面の端' : formatExpressionCore(n.arg, PREC.POST)}にふれている`;
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
          NEQ: 'と違う',
        }[n.op];
        s = `${formatExpressionCore(n.left, PREC.CMP + 1)}が${formatExpressionCore(n.right, PREC.CMP + 1)}${suf}`;
        p = PREC.CMP;
        break;
      }
      case 'LogicalExpression':
        p = n.op === 'AND' ? PREC.AND : PREC.OR;
        s = `${formatExpressionCore(n.left, p)}${n.op === 'AND' ? 'かつ' : 'または'}${formatExpressionCore(n.right, p + 1)}`;
        break;
      default:
        throw new AkariError('P201', `未対応の式 ${n.kind}`);
    }
    return p < parent ? `（${s}）` : s;
  }
  function builtinSurfaceName(n) {
    return BUILTIN_SURFACES[n] || n;
  }
  function formatScript(ast, options = {}) {
    return withExpressionFormatOptions(options,()=>{
    validateSyntaxAst(ast,'script',{allowHoles:!!options.allowHoles});
    const out=[],line=(depth,text,comment='')=>out.push('  '.repeat(depth)+text+(text.endsWith('、')?'':'。')+(comment?'  '+comment:''));
    // A nested suite inherits its surrounding topic, but its topic changes stay local.
    const emit=(body,depth,inheritedActor={kind:'self'})=>{let previousActor={...inheritedActor};for(const n of body){if(n.kind==='CommentLine'){out.push('  '.repeat(depth)+'※'+n.text);continue;}const actorRef=n.actorRef||{kind:'self'},actor=!['Hole','WaitBroadcastGroup'].includes(n.kind)&&(actorRef.kind==='named'||(actorRef.kind==='self'&&previousActor.kind==='named'))?sentenceActorSource(actorRef)+'は':'',f=formatExpression,t=n.target?formatTarget(n.target):'',comment=n.inlineComment||'';let text;
      const controlActor=actorRef.kind!==previousActor.kind||(actorRef.kind==='named'&&actorRef.name!==previousActor.name)
        ? sentenceActorSource(actorRef)+'は、' : '';
      switch(n.kind){
        case 'Hole':text=formatHoleSource(n);break;
        case 'IfStatement':line(depth,controlActor+sentenceFormFor(n).render(n),comment);emit(n.thenBody,depth+1,actorRef);if(n.hasElse){line(depth,'そうでなければ、',n.elseComment||'');emit(n.elseBody,depth+1,actorRef);}continue;
        case 'RepeatCount':line(depth,controlActor+sentenceFormFor(n).render(n),comment);emit(n.body,depth+1,actorRef);continue;
        case 'RepeatWhile':case 'RepeatUntil':line(depth,controlActor+sentenceFormFor(n).render(n),comment);emit(n.body,depth+1,actorRef);continue;
        case 'Forever':line(depth,controlActor+sentenceFormFor(n).render(n),comment);emit(n.body,depth+1,actorRef);continue;
        case 'ForEach':line(depth,controlActor+sentenceFormFor(n).render(n),comment);if(n.binder!=='今見ているもの')line(depth+1,`この中では、今見ているものを【${n.binder}】と呼ぶ`);emit(n.body,depth+1,actorRef);continue;
        default:{const form=sentenceFormFor(n);if(!form)throw new AkariError('P201',`未対応の文 ${n.kind}`);text=form.render(n);break;}
      }
      line(depth,actor+text,comment);if(n.kind!=='Hole')previousActor=actorRef;
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

