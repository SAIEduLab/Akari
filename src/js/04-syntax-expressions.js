  // ────────────────────────────────────────────────────────────────────────
  // 04 — Syntax parsing: expressions and conditions (no persistent block representation)
  // ────────────────────────────────────────────────────────────────────────
  // An extension operation registered with scope "meijin" is written only in 名人 text.
  const extensionMeijinOnly = (extension, operation, calculation = false) =>
    `${calculation ? '拡張計算' : '拡張'}「${extension}」「${operation}」は、名人の本文で だけ 使えます`;
  // S317 (LANGUAGE.md 名人): a 名人 form written in an ordinary body.
  // A name that has a word of あかり in it is written in 【 】 (spaced as 03's message is, FCM-02).
  const NAME_BRACKET_MESSAGE = 'この 名前は 【名前】のように 【 】で かこんで ください';
  const MEIJIN_ONLY_MESSAGE = 'この 書き方は、名人の本文で だけ 使えます。使う ときは、コードモードで「名人」を えらびます';
  class ExpressionParser {
    constructor(text, symbols, ctx = {}) {
      this.text = compactOutsideString(text);
      this.i = 0;
      this.symbols = symbols;
      this.ctx = ctx;
      this.depth = 0;
    }
    err(code, msg) {
      throw new AkariError(code, msg, this.ctx.lineNo || 0, this.i + 1);
    }
    atEnd() {
      return this.i >= this.text.length;
    }
    starts(s) {
      return this.text.startsWith(s, this.i);
    }
    take(s) {
      if (this.starts(s)) {
        this.i += s.length;
        return true;
      }
      return false;
    }
    expect(s, code = 'P205') {
      if (!this.take(s)) this.err(code, `「${s}」が たりません。書き足して ください`);
    }
    parse() {
      if (!this.text) this.err('P205', '計算が 書かれて いません。数や 文字を 書いて ください。れい：10');
      const n = this.logicalOr();
      if (!this.atEnd()) this.err('P201', `計算の「${this.text.slice(this.i)}」の ところが 読めません。書き方を たしかめて ください`);
      return checkExpressionTree(n, this.ctx.lineNo || 0);
    }
    logicalOr() {
      let n = this.logicalAnd();
      while (this.take('または'))
        n = exprNode('LogicalExpression', { op: 'OR', left: n, right: this.logicalAnd() });
      return n;
    }
    logicalAnd() {
      let n = this.negation();
      while (this.take('かつ'))
        n = exprNode('LogicalExpression', { op: 'AND', left: n, right: this.negation() });
      return n;
    }
    negation() {
      let n = this.predicate();
      if (this.take('ではない')) n = exprNode('UnaryExpression', { op: 'NOT', value: n });
      if (this.starts('ではない')) this.err('P201', '「ではない」が 2つ つづいて います。前の ほうを（ ）で かこんで ください');
      return n;
    }
    predicate() {
      const start = this.i;
      try {
        const standard = this.standardPredicate();
        if (this.starts('より')) {
          const saved = this.i;
          this.i = start;
          const alternative = this.surfaceComparison();
          if (alternative) return alternative;
          this.i = saved;
        }
        return standard;
      } catch (error) {
        if (!(error instanceof AkariError)) throw error;
        this.i = start;
        const alternative = this.surfaceComparison();
        if (alternative) return alternative;
        throw error;
      }
    }
    surfaceComparison() {
      const start = this.i;
      let end = start, depth = 0, quote = '';
      for (; end < this.text.length; end++) {
        const ch = this.text[end];
        if (quote) { if (quote === '」' && ch === '\\') { end++; continue; } if (ch === quote) quote = ''; continue; }
        if (ch === '「' || ch === '【') { quote = ch === '「' ? '」' : '】'; continue; }
        if (!depth && (['かつ','または','ではない'].some(s => this.text.startsWith(s,end)) || ['、','）','］'].includes(ch))) break;
        if (ch === '（' || ch === '［') depth++;
        if (ch === '）' || ch === '］') depth--;
      }
      const text = this.text.slice(start,end), mask = surfaceMask(text);
      // Select a fixed terminal before parsing roles; never backtrack over splits.
      const ending = ['未満','を超えている','を超える','と等しい','と等しくない','と異なる','大きい','小さい'].find(s => mask.endsWith(s));
      if (!ending) return null;
      const reverse = ending === '大きい' || ending === '小さい';
      const parser = (t, offset) => new ExpressionParser(t,this.symbols,{...this.ctx,
        sourcePositions:this.ctx.sourcePositions?.slice(start + offset, start + offset + t.length),
        _parserDepth:(this.ctx._parserDepth || 0)+this.depth});
      const term = (t, offset) => {
        const p = parser(t, offset);
        const n = p.additive();
        if (!p.atEnd()) this.err('P205','くらべる 2つの ものを（ ）か【 】で かこんで 分けて ください。れい：【点数】が10より大きい');
        return n;
      };
      let left, right;
      if (reverse) {
        const split = mask.indexOf('より');
        if (!mask.endsWith('が'+ending) || split < 1 || split !== mask.lastIndexOf('より'))
          this.err('P205','「より」は 1回だけ 書いて ください。名前に「より」が 入る ときは【 】で かこみます。れい：【より道】が10より大きい');
        left = term(text.slice(split+2,-ending.length-1), split+2);
        right = term(text.slice(0,split), 0);
      } else {
        // The existing operand parser owns compounds such as キーが押されている.
        const p = parser(text, 0);
        left = p.additive();
        if (!p.take('が')) this.err('P205','くらべる ものの あとに「が」を 書いて ください。れい：点数が10と同じ');
        right = term(text.slice(p.i,-ending.length), p.i);
      }
      const op = ({未満:'LT',を超える:'GT',を超えている:'GT',と等しい:'EQ',と等しくない:'NEQ',と異なる:'NEQ',大きい:'GT',小さい:'LT'})[ending];
      this.i = end;
      return exprNode('CompareExpression',{op,left,right});
    }
    standardPredicate() {
      let left = this.additive();
      if (this.take('が')) {
        const right = this.additive();
        let op = null;
        if (this.take('以上')) op = 'GTE';
        else if (this.take('以下')) op = 'LTE';
        else if (this.take('より大きくない')) return exprNode('UnaryExpression',{op:'NOT',value:exprNode('CompareExpression',{op:'GT',left,right})});
        else if (this.take('より小さくない')) return exprNode('UnaryExpression',{op:'NOT',value:exprNode('CompareExpression',{op:'LT',left,right})});
        else if (this.take('とちがわない') || this.take('と違わない')) return exprNode('UnaryExpression',{op:'NOT',value:exprNode('CompareExpression',{op:'NEQ',left,right})});
        else if (this.take('より大きい')) op = 'GT';
        else if (this.take('より小さい')) op = 'LT';
        else if (this.take('と同じ')) op = 'EQ';
        else if (this.take('とちがう') || this.take('と違う')) op = 'NEQ';
        else
          this.err(
            'P205',
            'くらべる ことばが ありません。おわりに「以上」「以下」「より大きい」「より小さい」「と同じ」「とちがう」の どれかを 書いて ください。れい：点数が10と同じ',
          );
        if (this.starts('が'))
          this.err('P206', 'くらべる ことを 2つ つづけては 書けません。「かつ」で 分けて ください。れい：1が2より小さいかつ2が3より小さい');
        return exprNode('CompareExpression', { op, left, right });
      }
      if (this.take('の中に') || this.take('に')) {
        const right = this.additive();
        const negative = this.take('が入っていない') || this.take('\u304c\u542b\u307e\u308c\u3066\u3044\u306a\u3044');
        if (!negative && !this.take('が入っている') && !this.take('が含まれている')) this.err('P205', '「が入っている」が たりません。書き足して ください。れい：名前一覧に「あ」が入っている');
        const value = exprNode('BuiltinCall', { name: 'CONTAINS', args: [left, right] });
        return negative ? exprNode('UnaryExpression', { op: 'NOT', value }) : value;
      }
      return left;
    }
    // 「AからBのどれか」 is the easy spelling of 乱数（A、B）; each side is a whole sum.
    additive() {
      const n = this.sum();
      if (this.starts('から') && this.text.indexOf('のどれか', this.i) > this.i) {
        const saved = this.i;
        this.take('から');
        const high = this.sum();
        if (this.take('までのどれか') || this.take('のどれか')) return exprNode('BuiltinCall', { name: '乱数', args: [n, high] });
        this.i = saved;
      }
      return n;
    }
    sum() {
      let n = this.multiplicative();
      for (;;) {
        if (this.take('＋'))
          n = exprNode('BinaryExpression', { op: 'ADD', left: n, right: this.multiplicative() });
        else if (this.take('－'))
          n = exprNode('BinaryExpression', { op: 'SUB', left: n, right: this.multiplicative() });
        else break;
      }
      return n;
    }
    multiplicative() {
      let n = this.unary();
      for (;;) {
        if (this.take('×'))
          n = exprNode('BinaryExpression', { op: 'MUL', left: n, right: this.unary() });
        else if (this.take('÷')) {
          const right = this.unary();
          // 10÷3のあまり is the remainder of that division, as written in arithmetic.
          n = this.take('のあまり') || this.take('の余り')
            ? exprNode('BuiltinCall', { name: '余り', args: [n, right] })
            : exprNode('BinaryExpression', { op: 'DIV', left: n, right });
        }
        else break;
      }
      return n;
    }
    unary() {
      if (this.take('＋')) return exprNode('UnaryExpression', { op: 'POS', value: this.power() });
      if (this.take('－')) return exprNode('UnaryExpression', { op: 'NEG', value: this.power() });
      return this.power();
    }
    power() {
      if (++this.depth + (this.ctx._parserDepth || 0) > LIMITS.expressionDepth) {
        this.depth--;
        this.err('P208', '計算の 中に 計算が 入りすぎて います。短い 計算に 分けて ください');
      }
      try {
        let n = this.search();
        if (this.take('＾'))
          n = exprNode('BinaryExpression', { op: 'POW', left: n, right: this.unary() });
        return n;
      } finally {
        this.depth--;
      }
    }
    search() {
      let n = this.postfix();
      // 名前一覧の中で「a」がはじめて出てくる番号 (written form) and 名前一覧で「a」が最初にある番号 read the same.
      const inside = this.starts('の中で');
      if (
        (inside || (this.starts('で') && !this.starts('ではない'))) &&
        (this.text.indexOf('が最初にある番号', this.i + 1) >= 0 || this.text.indexOf('がはじめて出てくる番号', this.i + 1) >= 0)
      ) {
        this.take(inside ? 'の中で' : 'で');
        const r = this.postfix();
        if (!this.take('がはじめて出てくる番号')) this.expect('が最初にある番号');
        n = exprNode('BuiltinCall', { name: 'INDEX_OF', args: [n, r] });
      }
      return n;
    }
    postfix() {
      const nounStart=this.i;
      let n = this.basic();
      const nounEnd=this.i;
      for (;;) {
        if (this.take('の数だけ')) n = exprNode('UnitlessRead', { value: n });
        else if (this.take('の答え')) { /* noun phrase: evaluate the original expression once */ }
        else if (this.take('の中身')) n = exprNode('SensorRead', { sensor: 'INPUT_VALUE', arg: n.kind === 'VariableRead' && this.text[nounStart]!=='（' && this.i-'の中身'.length===nounEnd ? exprNode('StringLiteral', {value:n.name}) : n });
        else if (this.take('の長さ')) n = exprNode('BuiltinCall', { name: 'LENGTH', args: [n] });
        else if (this.take('の文字数'))
          n = exprNode('BuiltinCall', { name: 'STRING_LENGTH', args: [n] });
        else if (this.take('の値')) { /* a value noun phrase preserves its expression */ }
        else if (this.take('までのきょり') || this.take('までの距離'))
          n = exprNode('SensorRead', { sensor: 'DISTANCE_TO', arg: componentTarget(n, this.symbols, this.ctx) });
        else if (this.take('キーがおされていない') || this.take('\u30ad\u30fc\u304c\u62bc\u3055\u308c\u3066\u3044\u306a\u3044'))
          n = exprNode('UnaryExpression', {
            op: 'NOT',
            value: exprNode('SensorRead', { sensor: 'KEY_DOWN', arg: keyArg(n, this.symbols, this.ctx) }),
          });
        else if (
          this.take('\u306e\u8272\u306b\u89e6\u308c\u3066\u3044\u306a\u3044') ||
          this.take('\u8272\u306b\u89e6\u308c\u3066\u3044\u306a\u3044')
        )
          n = exprNode('UnaryExpression', {
            op: 'NOT',
            value: exprNode('SensorRead', { sensor: 'TOUCHING_COLOR', arg: n }),
          });
        else if (this.take('\u306b\u89e6\u308c\u3066\u3044\u306a\u3044'))
          n = exprNode('UnaryExpression', {
            op: 'NOT',
            value: exprNode('SensorRead', { sensor: 'TOUCHING', arg: touchingTarget(n, this.symbols, this.ctx) }),
          });
        else if (this.take('キーがおされている') || this.take('キーが押されている'))
          n = exprNode('SensorRead', { sensor: 'KEY_DOWN', arg: keyArg(n, this.symbols, this.ctx) });
        else if (this.take('の色に触れている') || this.take('色に触れている'))
          n = exprNode('SensorRead', { sensor: 'TOUCHING_COLOR', arg: colorWord(n, this.symbols, this.ctx) });
        else if (this.take('に触れている'))
          n = exprNode('SensorRead', { sensor: 'TOUCHING', arg: touchingTarget(n, this.symbols, this.ctx) });
        else if (this.take('にふれていない')) n = exprNode('UnaryExpression', {op:'NOT',value:exprNode('SensorRead',{sensor:'TOUCHING',arg:touchingTarget(n, this.symbols, this.ctx)})});
        else if (this.take('の色にふれていない') || this.take('色にふれていない')) n = exprNode('UnaryExpression',{op:'NOT',value:exprNode('SensorRead',{sensor:'TOUCHING_COLOR',arg:colorWord(n, this.symbols, this.ctx)})});
        else if (this.take('の色にふれている') || this.take('色にふれている')) n = exprNode('SensorRead',{sensor:'TOUCHING_COLOR',arg:colorWord(n, this.symbols, this.ctx)});
        else if (this.take('にふれている')) n = exprNode('SensorRead',{sensor:'TOUCHING',arg:touchingTarget(n, this.symbols, this.ctx)});
        else if (this.starts('の') && !this.starts('の中で') && !this.starts('の中に')) {
          const saved = this.i;
          this.i++;
          const found = this.findTopSuffix(['番目', '文字目']);
          if (!found) {
            this.i = saved;
            break;
          }
          const sub = this.text.slice(this.i, found.pos);
          const subNode = new ExpressionParser(sub, this.symbols, {
            ...this.ctx,
            sourcePositions: this.ctx.sourcePositions?.slice(this.i, found.pos),
            _parserDepth: (this.ctx._parserDepth || 0) + this.depth,
          }).parse();
          this.i = found.pos + found.suffix.length;
          n =
            found.suffix === '番目'
              ? exprNode('ListRead', { list: n, index: subNode })
              : exprNode('BuiltinCall', { name: 'STRING_CHAR', args: [n, subNode] });
        } else {
          const unit = ['秒間','番目','Hz','歩','度','秒','回','点','個','％'].find(u => this.starts(u));
          if (!unit) break;
          this.i += unit.length;
          n = exprNode('QuantityLiteral', {value:n,unit:unit === '秒間' ? '秒' : unit});
        }
      }
      return n;
    }
    findTopSuffix(suffixes) {
      const marks=protectedLexemes(this.text); let depth=0;
      for(let j=this.i;j<this.text.length;j++) {
        if(marks[j]) continue;
        const ch=this.text[j];
        if(ch==='（'||ch==='［') depth++;
        else if(ch==='）'||ch==='］') { if(!depth) break; depth--; }
        else if(ch==='、'&&!depth) break;
        if(!depth) for(const suffix of suffixes) if(this.text.startsWith(suffix,j)) return {pos:j,suffix};
      }
      return null;
    }
    basic() {
      if (this.starts('今見ているもの') && nameBoundary(this.text, this.i + '今見ているもの'.length)) {
        this.i += '今見ているもの'.length;
        const name = this.ctx.binders?.at(-1) || '今見ているもの';
        return exprNode('VariableRead', { name, qualifier: bareName(name) ? null : 'exact' });
      }
      if (this.take('条件の答え（')) {
        let value;
        if (this.take('あてはまらない')) value = false;
        else if (this.take('あてはまる')) value = true;
        else this.err('P205', 'ここには「あてはまる」か「あてはまらない」の どちらかを 書いて ください');
        this.expect('）');
        return exprNode('BooleanLiteral', {value});
      }
      if (this.take('条件（')) {
        const value=this.logicalOr(); this.expect('）');
        if(this.take('が成り立たない')) return exprNode('UnaryExpression',{op:'NOT',value});
        this.expect('が成り立つ'); return value;
      }
      if (this.take('自分がコピーではない')||this.take('コピーではない')) return exprNode('UnaryExpression',{op:'NOT',value:exprNode('SensorRead',{sensor:'クローンである'})});
      if (this.take('自分がコピーである')) return exprNode('SensorRead',{sensor:'クローンである'});
      if (this.take('コピーである')) return exprNode('SensorRead',{sensor:'クローンである'});
      if (this.starts('（')) {
        const call = this.namedFunction();
        if (call) return call;
      }
      if (this.starts('（')) {
        // A noun phrase in （ ） is read whole: （「a」と点数をつなげた文字）, （10を3で割ったあまり）, （10と2をかけた答え）.
        const marks = protectedLexemes(this.text);
        let level = 0, close = -1;
        for (let j = this.i; j < this.text.length; j++) {
          if (marks[j]) continue;
          const ch = this.text[j];
          if (ch === '（' || ch === '［') level++;
          else if ((ch === '）' || ch === '］') && !--level) { close = j; break; }
        }
        const inner = close > 0 ? this.text.slice(this.i + 1, close) : '';
        if (/(?:をつなげた文字|で(?:割|わ)った(?:あまり|余り)|をかけた(?:数|答え)|を(?:足|た)した(?:数|答え)|を(?:引|ひ)いた(?:数|答え)|で(?:割|わ)った(?:数|答え))$/.test(surfaceMask(inner))) {
          const node = parseExpression(inner, this.symbols, { ...this.ctx, sourcePositions: this.ctx.sourcePositions?.slice(this.i + 1, close), _parserDepth: (this.ctx._parserDepth || 0) + this.depth + 1 });
          this.i = close + 1;
          return node;
        }
      }
      if (this.take('（')) {
        const n = this.logicalOr();
        this.expect('）', 'P207');
        return n;
      }
      if (this.take('\uff3b')) {
        const items = [];
        if (!this.take('\uff3d'))
          for (;;) {
            items.push(this.logicalOr());
            if (this.take('\uff3d')) break;
            this.expect('\u3001');
          }
        return exprNode('ListLiteral', { items });
      }
      if (this.starts('リスト「') || this.starts('リスト『')) return this.readNamed('exact');
      if (this.starts('「') || this.starts('『')) {
        const open=this.text[this.i++],close=open==='『'?'』':'」';
        let value = '', closed = false;
        while (!this.atEnd()) {
          const ch = this.text[this.i++];
          if (ch === close) { closed = true; break; }
          if (ch === '\\') {
            const escaped = this.text[this.i++];
            if (!['\\',open,close].includes(escaped)) this.err('N103','「 」の 中の \\ の つぎには、\\ か「 か 」しか 書けません。\\ を 文字として 使う ときは \\\\ と 書きます');
            value += escaped;
          } else value += ch;
        }
        if (!closed) this.err('N101','「 で はじめた 文字を とじる 」が ありません。文字の おわりに 」を 書いて ください');
        if (cpLen(value) > LIMITS.stringChars) this.err('R413','文字が 長すぎます');
        // A quoted part name followed by の reads that part's state, as the unquoted name does:
        // 「たくどん」のよこのばしょ is たくどんのよこのばしょ. Text suffixes (の長さ, の2文字目, ...) stay text.
        if (open === '「' && this.starts('の') && !['の数だけ','の値','の答え','の中身','の長さ','の文字数','の色','のどれか','の中で','の中に','のあまり','の余り'].some(t => this.starts(t)) && !(this.starts('の音') && this.i + 2 === this.text.length) &&
          !this.findTopSuffix(['番目','文字目'])) {
          const mouse = value === 'マウス' && [['のよこのばしょ', 'マウスの横位置'], ['のたてのばしょ', 'マウスの縦位置'],
            ...Object.entries(SENSOR_ALIASES).filter(([word]) => word.startsWith('マウスの')).map(([word, sensor]) => [word.slice('マウス'.length), sensor])]
            .find(([word]) => this.starts(word) && nameBoundary(this.text, this.i + word.length));
          if (mouse) { this.i += mouse[0].length; return exprNode('SensorRead', { sensor: mouse[1] }); }
          validateName(value); this.i++;
          if (++this.depth + (this.ctx._parserDepth||0) > LIMITS.expressionDepth) this.err('P208','計算の 中に 計算が 入りすぎて います。短い 計算に 分けて ください');
          try { return exprNode('ActorQualifiedRead',{actorRef:{kind:'named',name:value},value:this.basic()}); }
          finally { this.depth--; }
        }
        return exprNode('StringLiteral', { value });
      }
      if (this.take('自分の')) {
        if (this.ctx.meijin && this.starts('名前') && nameBoundary(this.text, this.i + 2)) { this.i += 2; return exprNode('PartName', { actorRef: { kind: 'self' } }); }
        if (this.starts('（')) return exprNode('ActorQualifiedRead',{actorRef:{kind:'self'},value:this.basic()});
        // 自分のよこのばしょ: a state word reads as the part's own state; a name stays 自分の data.
        const saved = this.i;
        try { const state = this.basic(); if (state.kind === 'SensorRead' && state.arg === undefined) return exprNode('ActorQualifiedRead',{actorRef:{kind:'self'},value:state}); }
        catch (error) { if (!(error instanceof AkariError)) throw error; }
        this.i = saved;
        return this.readNamed('self');
      }
      if (this.take('\u4f5c\u54c1\u306e')) return this.readNamed('project');
      const num = this.text.slice(this.i).match(/^[0-9]+(?:\.[0-9]+)?/);
      if (num) {
        this.i += num[0].length;
        const value = Number(num[0]);
        if (!Number.isFinite(value))
          this.err('N102', '数が 大きすぎます。もっと 小さい 数に して ください');
        return exprNode('NumberLiteral', { value });
      }
      // Sensors are read by their written words; a few internal names are written differently.
      for (const [surface, sensor] of [...FIXED_SENSORS.filter((s) => !SENSOR_CUT_WORDS.includes(s)).map((s) => [s, s]), ...Object.entries(SENSOR_SURFACES).map(([s, w]) => [w, s]), ...Object.entries(SENSOR_ALIASES)].sort((a, b) => b[0].length - a[0].length)) {
        if (this.starts(surface) && nameBoundary(this.text, this.i + surface.length)) {
          this.i += surface.length;
          return exprNode('SensorRead', { sensor });
        }
      }
      const mouseNot = ['マウスがおされていない', '\u30de\u30a6\u30b9\u304c\u62bc\u3055\u308c\u3066\u3044\u306a\u3044'].find((w) => this.starts(w) && nameBoundary(this.text, this.i + w.length));
      if (mouseNot) {
        this.i += mouseNot.length;
        return exprNode('UnaryExpression', {
          op: 'NOT',
          value: exprNode('SensorRead', {
            sensor: '\u30de\u30a6\u30b9\u304c\u62bc\u3055\u308c\u3066\u3044\u308b',
          }),
        });
      }
      if (this.starts('拡張計算「')) {
        const found = /^拡張計算「([^「」\n]+)」「([^「」\n]+)」/.exec(this.text.slice(this.i));
        if (!found) this.err('E703', '「拡張計算」の あとに、「 」で かこんだ 名前を 2つ 書いて ください');
        const name = EXTENSION_HOST.resolve(found[1], found[2], 'calculations');
        if (!name) this.err('E703', '使いたい「拡張計算」が 見つかりません。名前を たしかめて ください');
        if (!this.ctx.meijin && EXTENSION_HOST.describe(name, 'calculations')?.scope === 'meijin') this.err('S317', extensionMeijinOnly(found[1], found[2], true));
        this.i += found[0].length; this.expect('（'); const args = [];
        if (!this.take('）')) for (;;) { args.push(this.logicalOr()); if (this.take('）')) break; this.expect('、'); }
        return exprNode('ExtensionCalculation', { name, args });
      }
      if (EXTENSION_HOST.operations('events').length && this.take('拡張「できごとの値」'))
        return exprNode('SensorRead', { sensor: '拡張の値' });
      if (EXTENSION_HOST.operations('events').length && this.starts('拡張の値') && !extensionValueIsData(this.symbols, this.ctx)) {
        this.i += '拡張の値'.length; return exprNode('SensorRead', { sensor: '拡張の値' });
      }
      // 画面の上のはし・画面の下のはし・画面の右のはし・画面の左のはし name one side of the screen (端:上 …).
      const side = /^画面の(上|下|右|左)の(?:はし|端)/.exec(this.text.slice(this.i));
      if (side && nameBoundary(this.text, this.i + side[0].length)) {
        this.i += side[0].length;
        return exprNode('StringLiteral', { value: '端:' + side[1] });
      }
      // 画面の左下のはし is the corner a place is measured from, not an edge to touch.
      if (/^画面の(?:左下|右下|左上|右上)の(?:はし|端)に(?:ふれ|触れ)/.test(this.text.slice(this.i)))
        this.err('P205', '「画面の左下のはし」は、ばしょを 決める ときの もとに する 角です。ふれるのは「画面のはし」か、「画面の下のはし」「画面の左のはし」のような 一つの はしです');
      // 「画面のはし」 and 「画面の端」 name the stage edge (端). A bare はし or 端 stays a name: a part may be called はし
      // (橋, 箸); without one, the sentence names 画面のはし (diagnoseSentenceIntent).
      const edgeWord = ['画面のはし', '画面の端'].find((w) => this.starts(w) && nameBoundary(this.text, this.i + w.length));
      if (edgeWord) {
        this.i += edgeWord.length;
        return exprNode('StringLiteral', { value: '端' });
      }
      if (this.ctx.meijin && this.starts('いちばん近い')) { const read = meijinNearestRead(this); if (read) return read; }
      const builtinWords = [...BUILTIN_NAMES, ...Object.values(BUILTIN_SURFACES)];
      const builtin = builtinWords.sort((a,b) => b.length-a.length).find(name => this.starts(name+'（'));
      const builtinName = builtin && (Object.keys(BUILTIN_SURFACES).find((n) => BUILTIN_SURFACES[n] === builtin) || builtin);
      const token = builtin ? {name:builtinName,end:this.i+builtin.length,exact:false} : readNameToken(this.text, this.i);
      if (!token) this.err('P205', '読めない ところが あります。書き方を たしかめて ください');
      this.i = token.end;
      // 名人: ねこの名前, 星のコピーの数, 主役の体力 (主役 holds a part).
      if (this.ctx.meijin && !builtin && !token.exact) { const read = meijinNamedRead(this, token); if (read) return read; }
      // 名前一覧の数／名前一覧の個数 is the list's length, the same as 名前一覧の長さ.
      if (!builtin && dataNameKind(token.name, this.symbols, this.ctx) === 'list' && (this.starts('の個数') || (this.starts('の数') && !this.starts('の数だけ')))) {
        this.i += this.starts('の個数') ? 3 : 2;
        return exprNode('BuiltinCall', { name: 'LENGTH', args: [exprNode('VariableRead', { name: token.name, qualifier: token.exact ? 'exact' : null })] });
      }
      if (this.starts('の') && !['の数だけ','の値','の答え','の中身','の長さ','の文字数','の色','のどれか','の中で','の中に','のあまり','の余り'].some(t => this.starts(t)) && !(this.starts('の音') && this.i + 2 === this.text.length)) {
        const suffix = this.findTopSuffix(['番目','文字目']);
        if (!suffix) {
          validateName(token.name); this.i++;
          if (++this.depth + (this.ctx._parserDepth||0) > LIMITS.expressionDepth) this.err('P208','計算の 中に 計算が 入りすぎて います。短い 計算に 分けて ください');
          try { return exprNode('ActorQualifiedRead',{actorRef:{kind:'named',name:token.name},value:this.basic()}); }
          finally { this.depth--; }
        }
      }
      if (this.take('\uff08')) {
        if (!token.exact && !BUILTIN_NAMES.has(token.name) && !bareName(token.name))
          this.err(
            'P205',
            NAME_BRACKET_MESSAGE,
          );
        validateName(token.name, { callable: !BUILTIN_NAMES.has(token.name) });
        const args = [];
        if (!this.take('\uff09'))
          for (;;) {
            args.push(this.logicalOr());
            if (this.take('\uff09')) break;
            this.expect('\u3001');
          }
        return exprNode(BUILTIN_NAMES.has(token.name) ? 'BuiltinCall' : 'UserFunctionCall', {
          name: token.name,
          args,
        });
      }
      if (!token.exact) {
        // A bare 端 before にふれ… names no edge (C-10): the edge is written 画面のはし.
        if (token.name === '端' && /^に(?:ふれ|触れ)/.test(this.text.slice(this.i)))
          this.err('P205', '画面の はしの ことなら、「画面のはし」と 書きます');
        if (WORD_LITERALS.includes(token.name))
          return exprNode('StringLiteral', { value: token.name });
      }
      // 横位置 / マウスの縦位置: 位置 is not read; the message names the word to write.
      if (!token.exact && /^(?:マウスの)?(?:横|縦)位置$/.test(token.name)) this.err('P205', `「位置」は 読みません。「${SENSOR_SURFACES[token.name]}」と 書きます`);
      if (!token.exact && RESERVED.has(token.name)) this.err('P205','あかりで 使う ことばと 同じ 名前は、【名前】のように【 】で かこんで 書いて ください');
      validateName(token.name);
      // 名人: a part's name is the part itself (written bare or in 【 】).
      if (this.ctx.meijin && isMeijinPart(token.name, this.symbols, this.ctx)) return exprNode('PartRef', { name: token.name });
      return exprNode('VariableRead', {
        name: token.name,
        qualifier: token.exact ? 'exact' : null,
      });
    }
    namedFunction() {
      const start = this.i, marks = protectedLexemes(this.text);
      let end = start + 1, depth = 1;
      for (; end < this.text.length; end++) {
        if (marks[end]) continue;
        if (this.text[end] === '（') depth++;
        else if (this.text[end] === '）' && !--depth) break;
      }
      if (end === this.text.length) return null;
      const body = this.text.slice(start+1,end), mask = surfaceMask(body);
      if (!mask.endsWith('で求めた答え')) return null;
      const tail = body.slice(0,-'で求めた答え'.length), tailMask = surfaceMask(tail);
      const marker = tailMask.lastIndexOf('として、');
      const passWord = ['をわたして、', 'を渡して、'].find(w => tailMask.includes(w)) || 'をわたして、';
      const positional = tailMask.lastIndexOf(passWord);
      const cut = marker >= 0 ? marker : positional;
      const nameText = cut < 0 ? tail : tail.slice(cut+(marker >= 0 ? 4 : passWord.length));
      const name = callableSurfaceName(nameText);
      const args = [], argumentNames = [];
      const parse = (t,offset) => parseExpression(t,this.symbols,{...this.ctx,sourcePositions:this.ctx.sourcePositions?.slice(start+1+offset,start+1+offset+t.length),_parserDepth:(this.ctx._parserDepth||0)+this.depth+1});
      if (marker >= 0) {
        const values = tail.slice(0,marker), visible = surfaceMask(values);
        let begin = 0;
        for (let j=0;j<=values.length;j++) if (j === values.length || visible[j] === '、') {
          const item = values.slice(begin,j), itemMask = visible.slice(begin,j), split = itemMask.indexOf('を');
          if (split < 1 || split !== itemMask.lastIndexOf('を')) this.err('P205','名前と 入れる ものを「を」で つないで 書きます。れい：点数を10として、');
          const t = readNameToken(item.slice(0,split));
          if (!t || t.end !== split) this.err('P205','入れる ものの 名前を たしかめて ください。れい：点数を10として、');
          if (argumentNames.includes(t.name)) this.err('P205',`入れる ものの 名前「${t.name}」を 2回 書いて います。名前は 1回ずつ 書いて ください`);
          argumentNames.push(t.name); args.push(parse(item.slice(split+1),begin+split+1)); begin=j+1;
        }
      } else if (positional >= 0) {
        const values = tail.slice(0,positional);
        if (!values.startsWith('（') || !values.endsWith('）')) {
          let one=null;try{one=parse(values,0);}catch(error){if(!(error instanceof AkariError))throw error;}
          if (!one||!['NumberLiteral','StringLiteral','VariableRead'].includes(one.kind)) this.err('P205',/と/.test(surfaceMask(values))?'入れる ものが 2つ いじょう ある ときは、（ ）で かこんで「、」で 分けます。れい：（3、4）をわたして、':'入れる ものを（ ）で かこんで ください。れい：（10、「あかり」）をわたして、');
          args.push(one);
        } else {
        const inner=values.slice(1,-1), visible=surfaceMask(inner); let begin=0;
        for(let j=0;j<=inner.length;j++) if(j===inner.length || visible[j]==='、') {
          if(inner.length) args.push(parse(inner.slice(begin,j),1+begin)); begin=j+1;
        }
        }
      }
      this.i=end+1;
      return exprNode('UserFunctionCall',{name,args,...(marker>=0?{argumentNames}:{})});
    }
    readNamed(qualifier) {
      // Only an explicit noun turns a quoted label into a data reference.
      // Ordinary quoted values remain strings, including before an ordinal.
      if (this.starts('リスト「') || this.starts('リスト『')) {
        this.i += 'リスト'.length;
        const literal = this.basic();
        validateName(literal.value);
        return exprNode('VariableRead', { name: literal.value, qualifier });
      }
      // An explicit owner reads its named data; it does not change loop scope.
      const phrase = '今見ているもの';
      const t = this.starts(phrase) && nameBoundary(this.text, this.i + phrase.length)
        ? { name: phrase, end: this.i + phrase.length, exact: true }
        : readNameToken(this.text, this.i);
      if (!t) this.err('P205', '名前が ありません。ここに 名前を 書いて ください');
      if (!t.exact && !bareName(t.name))
        this.err(
          'P205',
          NAME_BRACKET_MESSAGE,
        );
      validateName(t.name);
      this.i = t.end;
      return exprNode('VariableRead', { name: t.name, qualifier });
    }
  }
  function checkExpressionTree(root, line = 0) {
    const pending = [[root, 1]];
    while (pending.length) {
      const [node, depth] = pending.pop();
      if (!node || typeof node !== 'object') continue;
      if (depth > LIMITS.expressionDepth)
        throw new AkariError('P208', '計算の 中に 計算が 入りすぎて います。短い 計算に 分けて ください', line, 1);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
          for (const child of value)
            if (child && typeof child === 'object') pending.push([child, depth + 1]);
        } else if (value && typeof value === 'object' && value.kind)
          pending.push([value, depth + 1]);
      }
    }
    return root;
  }
  // だんごが10回【ジャンプ】する / だんごが3回おされる: how many times a part finished a procedure or was clicked.
  // Without a project every name reads as a part, as subjects do.
  function readEventCount(text, symbols, ctx = {}) {
    const compact=compactOutsideString(text),mask=surfaceMask(compact);
    const counted=surfaceCapture(/^(.+?)が(.+?)回(?:(\u0001+)する|おされる|押される|クリックされる)$/d,compact,mask);
    const who=counted&&readNameToken(counted[0].text),procedure=counted?.[2]?.text;
    const part=who&&who.end===counted[0].text.length&&(who.name==='自分'||!symbols?.project||symbols.project.components.some(c=>c.name===who.name));
    if (!part||(procedure&&!/^【[^【】]+】$/.test(procedure))) return null;
    const count=parseExpression(counted[1].text,symbols,{...ctx,sourcePositions:ctx.sourcePositions?.slice(counted[1].start,counted[1].end)});
    return exprNode('EventCount',{event:procedure?'action':'click',actorRef:who.name==='自分'&&!who.exact?{kind:'self'}:{kind:'named',name:who.name},...(procedure?{name:procedure.slice(1,-1)}:{}),count});
  }
  function parseExpression(text, symbols, ctx = {}) {
    const compact=compactOutsideString(text),mask=surfaceMask(compact),depth=(ctx._parserDepth||0)+1;
    const located=node=>{const range=sourceRange(ctx.sourcePositions||[]);if(range)SOURCE_RANGES.set(node,{...SOURCE_RANGES.get(node),range});return checkExpressionTree(node,ctx.lineNo||0);};
    {const counted=/回(?:\u0001+する|おされる|押される|クリックされる)$/.test(mask)&&readEventCount(compact,symbols,ctx);if(counted)return located(counted);}
    if(depth>LIMITS.expressionDepth)throw new AkariError('P208','計算の 中に 計算が 入りすぎて います。短い 計算に 分けて ください',ctx.lineNo||0,1);
    if(compact.startsWith('（')&&compact.endsWith('）')&&/^\u0001+$/.test(mask))
      return located(parseExpression(compact.slice(1,-1),symbols,{...ctx,_parserDepth:depth,sourcePositions:ctx.sourcePositions?.slice(1,-1)}));
    if (mask.startsWith('今の') && !symbols?.project?.components.some(component=>component.name==='今'))
      return located(parseExpression(compact.slice(2),symbols,{...ctx,_parserDepth:depth,sourcePositions:ctx.sourcePositions?.slice(2)}));
    // おみくじのどれか (E2E-R2-12): one item of a list is picked by its number, 1 to the list's 数. The error carries the
    // value written out, for the sentence's own rewrite (〜を言う).
    {const pick=/^【([^【】「」]+)】のどれか$/.exec(compact)||/^([^\u0001、。（）]+?)のどれか$/.exec(mask),name=pick?.[1];
      if(name&&dataNameKind(name,symbols,ctx)==='list'){
        const value=`${nameSource(name)}の（1から${nameSource(name)}の数のどれか）番目`;
        throw Object.assign(new AkariError('P205',`リストの 中から 1つ えらぶ ときは「${value}」と 書きます`,ctx.lineNo||0,1),{listPick:value});
      }}
    // The kana spellings たした・ひいた・わった read the same (F-20).
    const arithmetic=[['をかけた',/^(.+?)と(.+?)をかけた(?:数|答え)$/d,'MUL'],['を足した',/^(.+?)(?:に|と)(.+?)を足した(?:数|答え)$/d,'ADD'],['をたした',/^(.+?)(?:に|と)(.+?)をたした(?:数|答え)$/d,'ADD'],
      ['を引いた',/^(.+?)から(.+?)を引いた(?:数|答え)$/d,'SUB'],['をひいた',/^(.+?)から(.+?)をひいた(?:数|答え)$/d,'SUB'],['で割った',/^(.+?)を(.+?)で割った(?:数|答え)$/d,'DIV'],['でわった',/^(.+?)を(.+?)でわった(?:数|答え)$/d,'DIV']];
    for(const [ending,pattern,op] of arithmetic){
      if(!mask.endsWith(ending+'数')&&!mask.endsWith(ending+'答え'))continue;
      const roles=surfaceCapture(pattern,compact);
      if(roles){
        const operands=roles.map(part=>parseExpression(part.text,symbols,{...ctx,_parserDepth:depth,sourcePositions:ctx.sourcePositions?.slice(part.start,part.end)}));
        return located(exprNode('BinaryExpression',{op,left:operands[0],right:operands[1]}));
      }
    }
    // 10を3で割ったあまり; 「a」と点数をつなげた文字 (any number of parts joined by と).
    const remainder=surfaceCapture(/^(.+?)を(.+?)で(?:割|わ)った(?:あまり|余り)$/d,compact);
    if(remainder){
      const operands=remainder.map(part=>parseExpression(part.text,symbols,{...ctx,_parserDepth:depth,sourcePositions:ctx.sourcePositions?.slice(part.start,part.end)}));
      return located(exprNode('BuiltinCall',{name:'余り',args:operands}));
    }
    if(mask.endsWith('をつなげた文字')){
      const body=compact.slice(0,-'をつなげた文字'.length),args=[];let at=0;
      for(let i=0;i<=body.length;i++)if(i===body.length||mask[i]==='と'){args.push(parseExpression(body.slice(at,i),symbols,{...ctx,_parserDepth:depth,sourcePositions:ctx.sourcePositions?.slice(at,i)}));at=i+1;}
      if(args.length<2)throw new AkariError('P205','つなげる ものを 2つ いじょう、「と」で ならべます。れい：（「点数は」と点数をつなげた文字）',ctx.lineNo||0,1);
      return located(exprNode('BuiltinCall',{name:'つなぐ',args}));
    }
    if(mask.endsWith('で求めた答え')){
      const parser=new ExpressionParser('（'+compact+'）',symbols,{...ctx,_parserDepth:depth,sourcePositions:ctx.sourcePositions?[null,...ctx.sourcePositions,null]:undefined});
      return located(parser.namedFunction());
    }
    return new ExpressionParser(text, symbols, ctx).parse();
  }
  function callableSurfaceName(text) {
    let name;
    if(text.startsWith('「')){
      const literal=new ExpressionParser(text,null).parse();
      if(literal.kind!=='StringLiteral')throw new AkariError('P205','自分で 作った ブロックの 名前を「 」で 1つだけ 書いて ください');
      name=literal.value;
    }else{
      const token=readNameToken(text);
      if(!token||token.end!==text.length)throw new AkariError('P205','自分で 作った ブロックの 名前は、【名前】のように【 】で かこんで 書いて ください');
      name=token.name;
    }
    validateName(name,{callable:true});return name;
  }
  // Each record owns a predicate's accepted inflections; protected words are never rewritten.
  const CONDITION_FORMS = Object.freeze([
    ['以上','以上なら','以上でなければ','以上のあいだ','以上になるまで','以上で','以上ではなくて','以上ではない'],
    ['以下','以下なら','以下でなければ','以下のあいだ','以下になるまで','以下で','以下ではなくて','以下ではない'],
    ['より小さい','より小さければ','より小さくなければ','より小さいあいだ','より小さくなるまで','より小さくて','より小さくなくて','より小さくない'],
    ['より大きい','より大きければ','より大きくなければ','より大きいあいだ','より大きくなるまで','より大きくて','より大きくなくて','より大きくない'],
    ['と同じ','と同じなら','と同じでなければ','と同じであるあいだ','と同じになるまで','と同じで','と同じではなくて','と同じではない'],
    ['とちがう','とちがえば','とちがわなければ','とちがうあいだ','と同じでなくなるまで','とちがっていて','とちがわなくて','とちがわない'],
    ['と違う','と違えば','と違わなければ','と違うあいだ','と違う状態になるまで','と違っていて','と違わなくて','と違わない'],
    ['押されている','押されていれば','押されていなければ','押されているあいだ','押されるまで','押されていて','押されていなくて','押されていない'],
    ['おされている','おされていれば','おされていなければ','おされているあいだ','おされるまで','おされていて','おされていなくて','おされていない'],
    ['ふれている','ふれていれば','ふれていなければ','ふれているあいだ','ふれるまで','ふれていて','ふれていなくて','ふれていない'],
    ['触れている','触れていれば','触れていなければ','触れているあいだ','触れるまで','触れていて','触れていなくて','触れていない'],
    ['入っている','入っていれば','入っていなければ','入っているあいだ','入るまで','入っていて','入っていなくて','入っていない'],
    ['含まれている','含まれていれば','含まれていなければ','含まれているあいだ','含まれるまで','含まれていて','含まれていなくて','含まれていない'],
    ['コピーである','コピーなら','コピーでなければ','コピーであるあいだ','コピーになるまで','コピーで','コピーではなくて','コピーではない'],
  ].map(([plain,ifYes,ifNo,whileYes,untilYes,andYes,andNo,plainNo]) => Object.freeze({plain,ifYes,ifNo,whileYes,untilYes,andYes,andNo,plainNo})));
  function conditionFormCandidates(record, form) {
    if (form === 'plain') return [[record.plain,false],[record.plainNo,true]];
    if (form === 'and') return [[record.andYes,false],[record.andNo,true]];
    if (form === 'if') return [[record.ifYes,false],[record.ifNo,true],
      [record.ifYes.endsWith('なら') ? record.ifYes+'ば' : record.plain+'なら',false],
      [record.plain+'ならば',false], ...(record.ifYes.endsWith('なら') ? [[record.ifYes.slice(0,-2)+'であれば',false]] : []),
      [record.plainNo+'なら',true]];
    if (form === 'while') return [[record.whileYes,false],[record.whileYes.replace(/あいだ$/,'間'),false],[record.plainNo+'あいだ',true],[record.plainNo+'間',true]];
    if (form === 'until') {
      const negative = ({'押されている':'押されなくなるまで','おされている':'おされなくなるまで','ふれている':'ふれなくなるまで','触れている':'触れなくなるまで','入っている':'入らなくなるまで','含まれている':'含まれなくなるまで'})[record.plain];
      return [[record.untilYes,false],...(negative ? [[negative,true]] : [])];
    }
    throw new AkariError('P205','きまりの 書き方を たしかめて ください');
  }
  // Natural ways to write a condition, rewritten to the forms the code writes. Tried only after the condition as
  // written fails, so a condition that reads keeps its meaning.
  function naturalConditionVariants(source, form, names = []) {
    const out = [];
    const mask0 = surfaceMask(source);
    if (mask0.includes('になったら')) return out;
    const word = (text, from, to) => {
      // A word that is not in the text is not in its mask either (the mask only hides characters).
      if (!text.includes(from)) return text;
      const mask = surfaceMask(text);
      let result = '', at = 0, i;
      while ((i = mask.indexOf(from, at)) >= 0) { result += text.slice(at, i) + to; at = i + from.length; }
      return result + text.slice(at);
    };
    const ending = (text, from, to) => surfaceMask(text).endsWith(from) ? text.slice(0, -from.length) + to : text;
    let text = source;
    // 10いじょう／10いか／10みまん: the kana spellings of 以上・以下・未満, right after a number, a value in （ ）「 」【 】
    // or a name of the work, and before an ending of the condition (F-20).
    {
      const mask = surfaceMask(text), found = [...mask.matchAll(/(いじょう|いか|みまん)(?=なら|で|か|、|のあいだ|あいだ|になるまで|まで|$)/g)]
        .filter(m => /[0-9０-９\u0001]/.test(mask[m.index - 1] || '') || names.some(name => name && mask.slice(0, m.index).endsWith(name)));
      for (const m of found.reverse()) text = text.slice(0, m.index) + { いじょう: '以上', いか: '以下', みまん: '未満' }[m[1]] + text.slice(m.index + m[1].length);
    }
    // キーをおす (active) is the same as キーがおされる
    for (const [from, to] of [['キーをおしていなければ', 'キーがおされていなければ'], ['キーを押していなければ', 'キーが押されていなければ'],
      ['キーをおしていなくて', 'キーがおされていなくて'], ['キーをおしていない', 'キーがおされていない'], ['キーをおして', 'キーがおされて'], ['キーを押して', 'キーが押されて'],
      ['キーをおさなくなるまで', 'キーがおされなくなるまで'], ['キーを押さなくなるまで', 'キーが押されなくなるまで'],
      ['キーをおすまで', 'キーがおされるまで'], ['キーを押すまで', 'キーが押されるまで'], ['キーをおしたら', 'キーがおされたら'], ['キーを押したら', 'キーが押されたら']])
      text = word(text, from, to);
    // とおなじ (かな). さわる・当たる・ぶつかる are not read as ふれる (C-08: the check names ふれる).
    text = word(text, 'とおなじ', 'と同じ');
    // すがたが3番 is すがたの番号が3; すがたが「丸」 is すがたの名前が「丸」
    text = text.replace(/(すがた|姿|はいけい|背景)が([0-9０-９]+)番目?/, '$1の番号が$2').replace(/(すがた|姿|はいけい|背景)が(?=「)/, '$1の名前が');
    // 未満／より多い／より少ない (again after たら: 10未満だったら)
    const lessThan = () => {
      for (const [from, to] of [['未満ではなくて', 'より小さくなくて'], ['未満ではない', 'より小さくない'], ['未満でなければ', 'より小さくなければ'], ['未満のあいだ', 'より小さいあいだ'], ['未満であるあいだ', 'より小さいあいだ'],
        ['未満になるまで', 'より小さくなるまで'], ['未満であれば', 'より小さければ'], ['未満なら', 'より小さいなら'], ['未満で', 'より小さくて'], ['より多', 'より大き'], ['より少な', 'より小さ']])
        text = word(text, from, to);
      text = ending(text, '未満', 'より小さい');
    };
    lessThan();
    // 〜があれば (with に) is 〜が入っていれば
    if (/に.+が(?:あれば|なければ|あるあいだ|ないあいだ|ある|ない|あったら|なかったら|あるなら|ないなら)$/.test(surfaceMask(text)))
      for (const [from, to] of [['があったら', 'が入っていれば'], ['がなかったら', 'が入っていなければ'], ['があれば', 'が入っていれば'], ['がなければ', 'が入っていなければ'], ['があるなら', 'が入っていれば'], ['がないなら', 'が入っていなければ'],
        ['があるあいだ', 'が入っているあいだ'], ['がないあいだ', 'が入っていないあいだ'], ['がある', 'が入っている'], ['がない', 'が入っていない']])
        if (surfaceMask(text).endsWith(from)) { text = ending(text, from, to); break; }
    // たら (only after もし, form if). A touch is not read with たら (decisions §3): もし「星」にふれたら could mean each time
    // or waiting, and ふれていたら・ふれていなかったら are written ふれていれば・ふれていなければ (diagnoseSentenceIntent).
    // The spoken てたら・てなかったら (おされてたら) are ていたら・ていなかったら.
    if (form === 'if' && !/(?:ふれ|触れ)(?:ていたら|ていなかったら|てたら|てなかったら|たら)$/.test(surfaceMask(text)))
      for (const [from, to] of [['でなかったら', 'でなければ'], ['くなかったら', 'くなければ'], ['ていなかったら', 'ていなければ'], ['てなかったら', 'ていなければ'], ['わなかったら', 'わなければ'],
        ['だったら', 'なら'], ['かったら', 'ければ'], ['ていたら', 'ていれば'], ['てたら', 'ていれば'], ['ちがったら', 'ちがえば'], ['違ったら', '違えば'],
        ['されたら', 'されていれば'], ['れたら', 'れていれば'], ['入ったら', '入っていれば']])
        if (surfaceMask(text).endsWith(from)) { text = ending(text, from, to); break; }
    lessThan();
    // あいだ: と同じあいだ / 以上であるあいだ
    text = ending(text, 'と同じあいだ', 'と同じであるあいだ');
    text = ending(text, '以上であるあいだ', '以上のあいだ');
    text = ending(text, '以下であるあいだ', '以下のあいだ');
    // 否定: でないなら／でなくて／ではなくて after a value or a predicate
    const negate = (t, from, yes) => {
      const mask = surfaceMask(t);
      if (!mask.endsWith(from)) return t;
      const before = mask.slice(0, -from.length);
      return t.slice(0, -from.length) + (/(?:と同じ|以上|以下|コピー)$/.test(before) ? '' : 'と同じ') + yes;
    };
    if (form === 'if') { text = negate(text, 'でないなら', 'でなければ'); text = negate(text, 'でなければ', 'でなければ'); }
    if (form === 'while') { text = negate(text, 'でないあいだ', 'ではないあいだ'); text = negate(text, 'でない間', 'ではないあいだ'); }
    if (form === 'and') { text = negate(text, 'でなくて', 'ではなくて'); text = negate(text, 'ではなくて', 'ではなくて'); }
    // 点数が10になるまで (a value) is と同じになるまで; 点数が10でなくなるまで is と同じでなくなるまで
    if (form === 'until') {
      text = ending(text, 'とちがう状態になるまで', 'と同じでなくなるまで');
      if (surfaceMask(text).endsWith('でなくなるまで') && !surfaceMask(text).endsWith('と同じでなくなるまで')) text = text.slice(0, -'でなくなるまで'.length) + 'と同じでなくなるまで';
      const mask = surfaceMask(text);
      if (mask.endsWith('になるまで') && !/(?:と同じ|以上|以下|大きく|小さく|コピー)になるまで$/.test(mask)) text = text.slice(0, -'になるまで'.length) + 'と同じになるまで';
    }
    // The left side of 〜か、 in a まで sentence may use the plain verb: 画面のはしにふれるか、…
    if (form === 'plain')
      for (const [from, to] of [['ふれる', 'ふれている'], ['触れる', '触れている'], ['おされる', 'おされている'], ['押される', '押されている'], ['入る', '入っている']])
        if (surfaceMask(text).endsWith(from)) { text = ending(text, from, to); break; }
    if (text !== source) out.push(text);
    // 点数が10以上で20以下 (one subject): the second condition takes the same subject. A part that is only a name
    // (クリアなら) is not 「点数がクリアと同じ」.
    const comparable = t => /^[0-9０-９\u0001－]/.test(surfaceMask(t) || '') || /(?:以上|以下|より|と同じ|とちが|と違)/.test(surfaceMask(t) || '');
    // 点数が10から20（のあいだ）なら, 10以上20以下, 10以上、20以下: the range
    if (form === 'if') {
      const range = surfaceCapture(/^((?:もし、?)?)([^、が]+?)が([^、が]+?)から([^、が]+?)(?:まで)?(?:のあいだ|の間)?(なら(?:ば)?|であれば|だったら)$/d, text);
      if (range && !/どれか/.test(range[3].text)) out.push(range[0].text + range[1].text + 'が' + range[2].text + '以上で、' + range[1].text + 'が' + range[3].text + '以下なら');
    }
    text = text.replace(/(以上|以下)、?(?=[0-9０-９])/g, (m, w) => w + (m.endsWith('、') ? 'で、' : 'で'));
    // 点数が10で、名前が10なら: a value before で is と同じで
    if (form === 'and' && /(?:[0-9０-９]|\u0001)で$/.test(surfaceMask(text) || '')) text = text.slice(0, -1) + 'と同じで';
    if (text !== source && !out.includes(text)) out.push(text);
    for (const base of [text, source]) {
      const one = surfaceCapture(/^((?:もし、?)?)(.+?)が(.+?(?:以上|以下|より大きく|より小さく|と同じ))(で|て)(?!、)([^が]+)$/d, base);
      if (one && comparable(one[4].text)) out.push(one[0].text + one[1].text + 'が' + one[2].text + one[3].text + '、' + one[1].text + 'が' + one[4].text);
      // 点数が10以上か5以下 (one subject, か): the second condition takes the same subject
      const either = surfaceCapture(/^((?:もし、?)?)(.+?)が(.+?(?:以上|以下|より大きい|より小さい|と同じ|とちがう))か(?![つ、])([^が]+)$/d, base);
      if (either && comparable(either[3].text)) out.push(either[0].text + either[1].text + 'が' + either[2].text + 'か、' + either[1].text + 'が' + either[3].text);
      // 点数が10以上で、20以下なら: the part after 、 with no subject takes the same subject
      const second = surfaceCapture(/^((?:もし、?)?)([^、が]+?)が([^、]+?(?:で|て|か))、([^、が]+)$/d, base);
      if (second && comparable(second[3].text)) out.push(second[0].text + second[1].text + 'が' + second[2].text + '、' + second[1].text + 'が' + second[3].text);
      // 点数が1か2なら (values) is 点数が1と同じか、点数が2と同じなら
      const pair = form === 'if' && surfaceCapture(/^((?:もし、?)?)(.+?)が([^、か]+?)か(?!ら)([^、か]+?)(なら(?:ば)?)$/d, base);
      if (pair) out.push(pair[0].text + pair[1].text + 'が' + pair[2].text + 'と同じか、' + pair[1].text + 'が' + pair[3].text + 'と同じ' + pair[4].text);
      // A かつ B／A または B (two plain conditions) is the explicit 条件（…）
      const joined = form !== 'plain' && form !== 'and' && surfaceCapture(/^((?:もし、?)?)(.+(?:かつ|または).+?)(なら(?:ば)?|あいだ|間|になるまで|まで)$/d, base);
      if (joined) out.push(joined[0].text + '条件（' + joined[1].text + '）が成り立つ' + (joined[2].text.startsWith('なら') ? 'なら' : joined[2].text.startsWith('あいだ') || joined[2].text === '間' ? 'あいだ' : 'まで'));
    }
    return [...new Set(out)].filter(t => t !== source);
  }
  function parseCondition(text, symbols, ctx = {}, form = 'plain') {
    if (!ctx.naturalCondition) {
      const written = compactOutsideString(text), mask = surfaceMask(written) || '';
      // 点数が5ではなく、… / 自分がコピーでなく、… / 大きくなく、…: the 「〜なく、」 of a first check is 「〜なくて、」.
      if (/(?:ではなく|でなく|くなく)、/.test(mask)) {
        let out = '', at = 0;
        for (const m of mask.matchAll(/(ではなく|でなく|くなく)、/g)) { out += written.slice(at, m.index) + (m[1] === 'でなく' ? 'ではなく' : m[1]) + 'て、'; at = m.index + m[0].length; }
        return parseCondition(out + written.slice(at), symbols, { ...ctx, sourcePositions: undefined, sourceLine: undefined }, form);
      }
      // もしコピーか、…: the copy check (コピーか was read as the name コピー).
      if (/^(?:もし、?)?(?:自分が)?コピーか、/.test(mask))
        return parseCondition(written.replace(/^((?:もし、?)?(?:自分が)?)コピーか、/, '$1コピーであるか、'), symbols, { ...ctx, sourcePositions: undefined, sourceLine: undefined }, form);
      // 点数が1から6のどれかなら: 1から6のどれか picks one number each time; it is not 「1から6のあいだ」.
      if (/が[^が]*から[^が]*のどれか(?:と(?:同じ|おなじ|ちが|違)|なら(?:ば)?|であれば|だったら|でなければ|になるまで|のあいだ|であるあいだ)/.test(mask))
        throw new AkariError('P205', '「1から6のどれか」は、そのたびに 数を 1つ えらびます。あいだに あるかを しらべる ときは「点数が1以上で、6以下なら」のように 書きます', ctx.lineNo || 0, 1);
      // 点数が10以上で20以下ではないなら: the child means outside the range, not 「10以上で、20以下ではない」.
      if (/^(?:もし、?)?[^、が]+?が[^、が]+?(?:以上|以下|より大きく|より小さく)で、?[^、が]+?(?:以上|以下|大き|小さ)[^、が]*?(?:ない|なければ|なかったら)(?:なら(?:ば)?|あいだ|間|まで)?$/.test(mask))
        throw new AkariError('P205', '「10以上で20以下」に あてはまらない ときを しらべる ときは、「点数が10より小さいか、点数が20より大きければ」のように 書きます', ctx.lineNo || 0, 1);
      // 点数が10ではないなら is 点数が10と同じでなければ (「10ではない」 was read as 「10 is not true」).
      const not = /が([^が]+?)では(ないなら(?:ば)?|なければ|なかったら|ないあいだ|ない間|なくなるまで|なくて|ない)$/.exec(mask);
      if (not && !/(?:と同じ|以上|以下|大き[いく]|小さ[いく]|ちが[うい]|違[うい]|コピー|いる|ある|れる)$/.test(not[1])) {
        const to = { ないなら: 'と同じでなければ', ないならば: 'と同じでなければ', なければ: 'と同じでなければ', なかったら: 'と同じでなければ', ないあいだ: 'と同じではないあいだ', ない間: 'と同じではないあいだ', なくなるまで: 'と同じでなくなるまで', なくて: 'と同じではなくて', ない: 'と同じではない' }[not[2]];
        return parseCondition(written.slice(0, not.index + 1 + not[1].length) + to, symbols, { ...ctx, naturalCondition: true, sourcePositions: undefined, sourceLine: undefined }, form);
      }
    }
    // 点数がちょうど10なら: ちょうど is not part of the value (ちょうど10 was read as a name).
    const exact = surfaceMask(compactOutsideString(text)).match(/が(?:ちょうど)(?=[0-9０-９「（【－])/);
    if (exact && !ctx.naturalCondition) {
      const plain = compactOutsideString(text).replace(/がちょうど(?=[0-9０-９「（【－])/, 'が');
      return parseCondition(plain, symbols, { ...ctx, sourcePositions: undefined, sourceLine: undefined }, form);
    }
    try { return parseConditionAsWritten(text, symbols, ctx, form); }
    catch (error) {
      if (!(error instanceof AkariError) || ctx.naturalCondition) throw error;
      for (const variant of naturalConditionVariants(compactOutsideString(text), form, [...(symbols?.allDataNames || []), ...(ctx.localNames || []), ...(ctx.args || [])].sort((a, b) => b.length - a.length))) {
        try { return parseConditionAsWritten(variant, symbols, { ...ctx, naturalCondition: true, sourcePositions: undefined, sourceLine: undefined }, form); }
        catch (attempt) { if (!(attempt instanceof AkariError)) throw attempt; }
      }
      throw error;
    }
  }
  function parseConditionAsWritten(text, symbols, ctx = {}, form = 'plain') {
    const compact=compactOutsideString(text),line=ctx.sourceLine;
    let positions=ctx.sourcePositions;
    if(!positions&&line?.mapped){const offset=compactOutsideString(line.code).indexOf(compact);if(offset>=0)positions=line.mapped.positions.slice(offset,offset+compact.length);}
    const root=parseConditionCore(text,symbols,{...ctx,sourcePositions:positions},form),range=positions&&sourceRange(positions,compact.startsWith('もし、')?3:compact.startsWith('もし')?2:0,compact.length-(compact.endsWith('、')?1:0));
    if(range)SOURCE_RANGES.set(root,{...SOURCE_RANGES.get(root),range,conditionForm:form});
    return attachExpressionSourceSpans(root,line);
  }
  function parseConditionCore(text, symbols, ctx = {}, form = 'plain') {
    let source = compactOutsideString(text);
    const prefix=source.startsWith('もし、')?3:source.startsWith('もし')?2:0;
    if (prefix) {source=source.slice(prefix);ctx={...ctx,sourcePositions:ctx.sourcePositions?.slice(prefix)};}
    // 自分がコピーなら: the copy check is about 自分 (the code writes 自分が).
    if (source.startsWith('自分がコピー')) {source=source.slice(3);ctx={...ctx,sourcePositions:ctx.sourcePositions?.slice(3)};}
    if (source.endsWith('、')) {source=source.slice(0,-1);ctx={...ctx,sourcePositions:ctx.sourcePositions?.slice(0,-1)};}
    const mask=surfaceMask(source);
    const fail = message => { throw new AkariError('P205',message,ctx.lineNo||0,1); };
    // もし答えが「7」になったら: the two readings are named with the words written (final call 12), as for the one with no もし.
    if (mask.includes('になったら')) fail(becomesIfMessage(mask.endsWith('になったら') ? source.slice(0, -'になったら'.length) : null, symbols, ctx));
    // Explicit Boolean expression: its parentheses determine scope and operator precedence.
    if (source.startsWith('条件（')) {
      const endings = form === 'if' ? ['が成り立つなら','が成り立つならば','が成り立つのであれば','が成り立たないなら','が成り立たないならば','が成り立たないのであれば'] : form === 'while' ? ['が成り立つあいだ','が成り立つ間','が成り立たないあいだ','が成り立たない間'] : form === 'until' ? ['が成り立つまで','が成り立たないまで'] : ['が成り立つ','が成り立たない'];
      const ending=endings.find(e=>mask.endsWith(e));
      if (!ending || source[source.length-ending.length-1] !== '）') fail('「条件（ ）」の（ ）が とじて いるか、その あとに「が成り立つ」が あるかを たしかめて ください。れい：もし条件（点数が10以上かつ（名前が「あ」と同じまたは名前が「い」と同じ））が成り立つなら、');
      const node=parseExpression(source.slice(3,-ending.length-1),symbols,{...ctx,sourcePositions:ctx.sourcePositions?.slice(3,-ending.length-1),_parserDepth:(ctx._parserDepth||0)+1});
      return ending.includes('成り立たない') ? exprNode('UnaryExpression',{op:'NOT',value:node}) : node;
    }
    // 〜状態になるまで: everything before it is what is waited for (点数が10以上で、「空白」キーがおされている状態になるまで).
    if (form === 'until' && mask.endsWith('状態になるまで') && mask.length > '状態になるまで'.length) {
      const whole = source.slice(0, -'状態になるまで'.length), inner = /(?:以上|以下)の$/.test(surfaceMask(whole)) ? whole.slice(0, -1) : whole;
      return parseConditionCore(inner, symbols, { ...ctx, sourcePositions: ctx.sourcePositions?.slice(0, inner.length) }, 'plain');
    }
    const commas=[]; for(let i=0;i<mask.length;i++) if(mask[i]==='、') commas.push(i);
    if (commas.length) {
      if (commas.length !== 1) fail('きまりを 3つ いじょう つなぐ ときは、「条件（…）」で ひとまとめに して ください');
      const split=commas[0], left=source.slice(0,split), right=source.slice(split+1), leftMask=mask.slice(0,split);
      if (/かつ|または/.test(mask)) fail('「かつ」「または」で つなぐ きまりを、1つずつ（ ）で かこんで ください');
      const or=leftMask.endsWith('か');
      const l=parseCondition(or?left.slice(0,-1):left,symbols,{...ctx,sourcePositions:ctx.sourcePositions?.slice(0,split-(or?1:0))},or?'plain':'and');
      const r=parseCondition(right,symbols,{...ctx,sourcePositions:ctx.sourcePositions?.slice(split+1)},form);
      if (l.kind==='LogicalExpression'||r.kind==='LogicalExpression') fail('きまりを 1つずつ（ ）で かこんで 分けて ください');
      return exprNode('LogicalExpression',{op:or?'OR':'AND',left:l,right:r});
    }
    // か joins two conditions only right after a finished predicate (点数が1と同じか点数が2と同じ). A か inside a
    // name (かず, あかり) or in 1から6のどれか belongs to that word.
    const orJoin=/(?:以上|以下|大きい|小さい|大きくない|小さくない|と同じ|ではない|でない|とちがう|ちがわない|と違う|違わない|いる|いない|である)か(?!つ)/.test(mask);
    if (/かつ|または/.test(mask) || orJoin) {
      if (form !== 'plain' || (mask.includes('かつ') && mask.includes('または'))) fail('いくつかの きまりを つなぐ ときは、「条件（…）」で ひとまとめに して ください。れい：もし条件（点数が10以上かつ（名前が「あ」と同じまたは名前が「い」と同じ））が成り立つなら、');
    }
    // だんごが10回【ジャンプ】するまで / だんごが3回おされるまで: the times a part finished a procedure or was clicked,
    // counted from when the wait (or the repeat) began.
    if (form === 'until' && mask.endsWith('まで')) {
      const counted=readEventCount(source.slice(0,-2),symbols,ctx);
      if (counted) return counted;
    }
    const matches=[];
    for(const record of CONDITION_FORMS) for(const [ending,negative] of conditionFormCandidates(record,form))
      if(mask.endsWith(ending)) matches.push({record,ending,negative});
    matches.sort((a,b)=>b.ending.length-a.ending.length);
    if (matches.length) {
      const {record,ending,negative}=matches[0], base=source.slice(0,-ending.length)+record.plain;
      // A subject belongs to this read; it never changes the surrounding action's subject.
      const baseMask=surfaceMask(base), subject=readNameToken(base), after=subject?base.slice(subject.end):'';
      let node;
      if (subject && after.startsWith('が') && /(?:ふれている|触れている)$/.test(baseMask)) {
        const body=after.slice(1), bmask=surfaceMask(body);
        const split=bmask.lastIndexOf('に');
        if(split<1) fail('ふれる 相手の 名前を「に」の 前に 書いて ください');
        const color=body.slice(0,split).endsWith('の色'), target=body.slice(0,split-(color?2:0)), t=readNameToken(target);
        const operand=t && t.end===target.length ? exprNode('StringLiteral',{value:t.name}) : parseExpression(target,symbols,ctx);
        const touch=exprNode('SensorRead',{sensor:color?'TOUCHING_COLOR':'TOUCHING',arg:color?operand:touchingTarget(operand,symbols,ctx)});
        // 自分が…にふれている is the same as …にふれている.
        node=subject.name==='自分'&&!subject.exact?touch:exprNode('ActorQualifiedRead',{actorRef:{kind:'named',name:subject.name},value:touch});
        const actorRange=sourceRange(ctx.sourcePositions||[],0,subject.end);if(actorRange&&node!==touch)SOURCE_RANGES.set(node,{actorRange});
      } else node=parseExpression(base,symbols,ctx);
      return negative?exprNode('UnaryExpression',{op:'NOT',value:node}):node;
    }
    if (form === 'if' && /なら(?:ば)?$/.test(mask)) {
      // The subject ends at the first が that leaves two readable sides (すがたの番号が3なら: not す／たの番号が3).
      const end = source.length - (mask.endsWith('ならば') ? 3 : 2);
      let firstError = null;
      for (let at = mask.indexOf('が'); at > 0 && at + 1 < end; at = mask.indexOf('が', at + 1)) {
        try {
          const operands = [[0, at], [at + 1, end]].map(([from, to]) => parseExpression(source.slice(from, to), symbols, { ...ctx, sourcePositions: ctx.sourcePositions?.slice(from, to) }));
          return exprNode('CompareExpression', { op: 'EQ', left: operands[0], right: operands[1] });
        } catch (error) { if (!(error instanceof AkariError)) throw error; firstError ??= error; }
      }
      if (firstError) throw firstError;
    }
    if(form==='plain') return parseExpression(source,symbols,ctx);
    // もしクリアなら: a name alone is not a check; say what to compare.
    {const only=source.replace(/(?:なら(?:ば)?|あいだ|間|まで)$/,'').replace(/^【(.+)】$/,'$1');if(only&&dataNameKind(only,symbols,ctx))
      fail(`「${only}」の 中身を しらべる ときは、「もし${nameSource(only)}が1なら、」のように くらべる 数や 文字を 書きます`);}
    fail(form==='if'
      ? 'くらべる ものと「なら」を たしかめて ください。「なら、」の あとの 行に する ことを 書きます。れい：もし答えが「ほし」なら、'
      : form==='while' ? 'つづける きまりの おわりを「あいだ」に して ください。れい：点数が10より小さいあいだ、くり返す。'
        // The first of two checks (〜で、…): its own ending is 〜で／〜くて／〜ではなくて.
        : form==='and' ? '「、」の 前の きまりが 読めません。「点数が10以上で、」「点数が10より大きくて、」のように 書いて ください'
        // Read for くり返す and for 待つ alike, so the example names no command.
        : 'どう なるまで なのかが 読めません。「点数が10になるまで」「「スペース」キーがおされるまで」のように 書いて ください');
  }
  function eventCountSource(n) {
    const who=n.actorRef?.kind==='named'?sentenceActorSource(n.actorRef):'自分',count=formatExpressionCore(n.count);
    return `${who}が${count}回${n.event==='action'?'【'+n.name+'】する':'おされる'}`;
  }
  // 〜状態になるまで: a number word takes の (10以上の状態).
  function stateUntil(text) { return text + (/(?:以上|以下)$/.test(surfaceMask(text)) ? 'の' : '') + '状態になるまで'; }
  // もし答えが「ふじ山」なら: the comparison of もし without と同じ (F-34). Only when both sides are plain values and the
  // shorter text reads back as the same comparison (点数が「星」にふれているなら would read as a touch); otherwise null and
  // と同じなら is written.
  function equalsIfSource(compare) {
    const plain=n=>!!n&&!isConditionValue(n)&&(['NumberLiteral','StringLiteral','VariableRead','QuantityLiteral','ListRead','BinaryExpression','SensorRead','UnitlessRead'].includes(n.kind)||
      (n.kind==='UnaryExpression'&&['NEG','POS'].includes(n.op))||(n.kind==='BuiltinCall'&&n.name!=='CONTAINS')||(n.kind==='ActorQualifiedRead'&&plain(n.value)));
    if(!plain(compare.left)||!plain(compare.right))return null;
    // おされたキーが「スペース」なら: the key compared with the pressed key is written by its keyboard name.
    const key=side=>side?.kind==='StringLiteral'&&[compare.left,compare.right].some(x=>x?.kind==='SensorRead'&&x.sensor==='押されたキー')?exprNode('StringLiteral',{value:keySurface(side.value)}):side;
    const left=formatExpressionCore(key(compare.left),PREC.CMP+1),right=formatExpressionCore(key(compare.right),PREC.CMP+1),text=left+'が'+right+'なら';
    const shape=n=>JSON.stringify(n,(k,v)=>k==='sourceSpan'?undefined:v);
    let read=null;
    try{read=parseConditionAsWritten(text,formatSymbols||undefined,{},'if');}catch(error){if(!(error instanceof AkariError))throw error;}
    return read&&shape(read)===shape({...compare,left:key(compare.left),right:key(compare.right)})?text:null;
  }
  // short: 点数が2なら for one equality; a condition of several parts writes と同じ on every part (LANGUAGE.md: もし点数が1と
  // 同じか、点数が2と同じなら、), so its parts are written without it.
  function formatCondition(node, form = 'plain', short = true) {
    const negative=node.kind==='UnaryExpression'&&node.op==='NOT', value=negative?node.value:node;
    if (value.kind==='EventCount'&&!negative&&form==='until') return eventCountSource(value)+'まで';
    if (!negative && value.kind==='LogicalExpression' && ['if','while','until'].includes(form)) {
      const atomic=n => n.kind!=='LogicalExpression' && !(n.kind==='UnaryExpression' && n.op==='NOT' && n.value.kind==='LogicalExpression');
      if(atomic(value.left) && atomic(value.right)) {
        const left=formatCondition(value.left,value.op==='AND'?'and':'plain'), right=value.op==='AND'&&form==='until'?stateUntil(formatCondition(value.right,'plain')):formatCondition(value.right,form,false);
        if(!left.startsWith('条件（') && !right.startsWith('条件（')) return `${left}${value.op==='OR'?'か':''}、${right}`;
      }
    }
    if(value.kind==='LogicalExpression' || (negative && value.kind==='UnaryExpression')) {
      const expression=formatExpressionCore(value), tail=negative?'成り立たない':'成り立つ';
      return `条件（${expression}）が${tail}${form==='if'?'なら':form==='while'?'あいだ':form==='until'?'まで':''}`;
    }
    // 名人: ねこが「星」にふれている and ねこがコピーである name who with が (the common form 「ねこ」の… reads the part's value).
    const source=value.kind==='ActorQualifiedRead' && value.value.kind==='SensorRead' && ['TOUCHING','TOUCHING_COLOR'].includes(value.value.sensor) ? `${nameSource(value.actorRef.name)}が${formatExpressionCore(value.value)}`
      : value.kind==='ActorQualifiedRead' && value.actorRef?.kind==='named' && value.value.kind==='SensorRead' && value.value.sensor==='クローンである' ? `${nameSource(value.actorRef.name)}がコピーである` : formatExpressionCore(value), mask=surfaceMask(source);
    const predicate=['SensorRead','CompareExpression','ActorQualifiedRead'].includes(value.kind)||(value.kind==='BuiltinCall'&&value.name==='CONTAINS');
    const record=predicate?CONDITION_FORMS.find(r=>mask.endsWith(r.plain)):null;
    if(record) {
      const forms=conditionFormCandidates(record,form), match=forms.find(([,no])=>no===negative);
      // 点数が10になるまで: と同じ is not written before になるまで, unless the value itself ends in a predicate word.
      if(match&&record.plain==='と同じ'&&form==='until'&&!negative&&!/(?:と同じ|以上|以下|大きく|小さく|コピー)$/.test(surfaceMask(source.slice(0,-record.plain.length))))
        return source.slice(0,-record.plain.length)+'になるまで';
      if(short&&match&&record.plain==='と同じ'&&form==='if'&&!negative&&value.kind==='CompareExpression'&&value.op==='EQ'){const short=equalsIfSource(value);if(short)return short;}
      if(match) return (record.plain==='コピーである'&&!source.slice(0,-record.plain.length)?'自分が':'')+source.slice(0,-record.plain.length)+match[0];
    }
    if(!negative && form==='plain') return source;
    return `条件（${source}）が成り立${negative?'たない':'つ'}${form==='if'?'なら':form==='while'?'あいだ':form==='until'?'まで':''}`;
  }

  // Parser methods record consumed ranges in a side table; evaluation still sees only nodes.
  for (const key of ['logicalOr','logicalAnd','negation','predicate','standardPredicate','surfaceComparison',
    'additive','multiplicative','unary','power','search','postfix','basic','readNamed']) {
    const parse = ExpressionParser.prototype[key];
    ExpressionParser.prototype[key] = function (...args) {
      const start = this.i, node = parse.apply(this, args);
      if (node && this.ctx.sourcePositions) {
        const range = sourceRange(this.ctx.sourcePositions, start, this.i);
        if (range) {
          // 「ロケット」のよこのばしょ: the part's name in 「 」 has its place too, so renaming the part changes it (R2-B-02).
          const named = key === 'basic' && node.kind === 'ActorQualifiedRead' && node.actorRef.kind === 'named',
            close = named && this.text[start] === '「' ? this.text.indexOf('」', start + 1) : -1,
            quoted = close > start && this.text.slice(start + 1, close) === node.actorRef.name ? { name: node.actorRef.name, end: close + 1 } : null;
          const previous = SOURCE_RANGES.get(node), token = quoted || (named ? readNameToken(this.text, start) : null);
          const actorRange = token && token.name === node.actorRef?.name ? sourceRange(this.ctx.sourcePositions, start, token.end) : previous?.actorRange;
          SOURCE_RANGES.set(node, { ...previous, range, ...(actorRange ? { actorRange } : {}) });
        }
      }
      return node;
    };
  }
  function parseMappedExpression(text, code, line, symbols, ctx, start, mappedPositions) {
    const compact = compactOutsideString(text);
    if (start === undefined) {
      start = code.indexOf(compact);
      if (start !== code.lastIndexOf(compact)) start = -1;
    }
    const sourcePositions = mappedPositions ?? (start >= 0 ? line?.mapped?.positions.slice(start, start + compact.length) : undefined);
    const root = parseExpression(text, symbols, { ...ctx, lineNo:line?.lineNo || ctx.lineNo, sourcePositions });
    return attachExpressionSourceSpans(root,line);
  }
  function attachExpressionSourceSpans(root,line) {
    if (line) {
      const pending = [root], physicalStart = line.physicalStart ?? line.start;
      while (pending.length) {
        const node = pending.pop(), range = SOURCE_RANGES.get(node)?.range;
        if (range) node.sourceSpan = { startLine:line.lineNo, endLine:line.lineNo,
          startColumn:surfaceColumn(line, range.start - physicalStart) + 1,
          endColumn:surfaceColumn(line, range.end - physicalStart) + 1 };
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) pending.push(...value.filter(n => n?.kind));
          else if (value?.kind) pending.push(value);
        }
      }
    }
    return root;
  }
  // Whether a bare data name is a list or a variable anywhere in the work (parts included); null when unknown.
  // A part's own name written without 「」 (ねこの方を向く, ねこまでのきょり, ねこにふれている) names that part when no data
  // has that name.
  // 画面の下にふれている reads as 画面's 「下」: the side of the screen is 画面の下のはし (the run would look for a part 下).
  function touchingTarget(node, symbols, ctx = {}) {
    const side = node?.kind === 'ActorQualifiedRead' && node.actorRef?.kind === 'named' && node.actorRef.name === '画面' && symbols?.project && namesStage(symbols.project, '画面') &&
      ({ StringLiteral: node.value?.value, VariableRead: node.value?.name }[node.value?.kind]);
    if (['上', '下', '右', '左'].includes(side)) throw new AkariError('P205', `画面の ${side}の はしの ことなら、「画面の${side}のはし」と 書きます`);
    return componentTarget(node, symbols, ctx);
  }
  function componentTarget(node, symbols, ctx = {}) {
    if (node?.kind !== 'VariableRead' || node.qualifier || dataNameKind(node.name, symbols, ctx) || !symbols?.project?.components?.some((c) => c.name === node.name)) return node;
    const literal = exprNode('StringLiteral', { value: node.name }), location = SOURCE_RANGES.get(node);
    if (location) SOURCE_RANGES.set(literal, location);
    return literal;
  }
  // ロケットのところへ行く: a bare name that names no data is the name of a part (written 「ロケット」 back; the check says
  // when no part has it). Any other value is kept for the check.
  function partNameTarget(node, symbols, ctx = {}) {
    if (ctx.meijin || node?.kind !== 'VariableRead' || node.qualifier || dataNameKind(node.name, symbols, ctx) || (ctx.localNames || []).includes(node.name)) return node;
    const literal = exprNode('StringLiteral', { value: node.name }), location = SOURCE_RANGES.get(node);
    if (location) SOURCE_RANGES.set(literal, location);
    return literal;
  }
  // 赤い色にふれている is 「赤」の色にふれている.
  function colorWord(node, symbols, ctx = {}) {
    const color = node?.kind === 'VariableRead' && !node.qualifier && !dataNameKind(node.name, symbols, ctx) && { 赤い: '赤', 青い: '青', 白い: '白', 黒い: '黒', 黄色い: '黄', 茶色い: '茶', あかい: '赤', あおい: '青', しろい: '白', くろい: '黒', きいろい: '黄', ちゃいろい: '茶' }[node.name];
    if (!color) return node;
    const literal = exprNode('StringLiteral', { value: color }), location = SOURCE_RANGES.get(node);
    if (location) SOURCE_RANGES.set(literal, location);
    return literal;
  }
  function dataNameKind(name, symbols, ctx = {}) {
    const parts = [...(symbols?.individualByTargetId?.values?.() || [])];
    if (symbols?.projectLists?.has(name) || parts.some((d) => d.lists?.has(name))) return 'list';
    if (symbols?.projectVars?.has(name) || parts.some((d) => d.variables?.has(name)) || [...(ctx.args || []), ...(ctx.binders || [])].includes(name)) return 'variable';
    return null;
  }
  function parseTargetPrefix(code, symbols, ctx) {
    let pos = 0,
      qualifier = null;
    for (const [prefix, q] of [
      ['\u81ea\u5206\u306e', 'self'],
      ['\u4f5c\u54c1\u306e', 'project'],
    ])
      if (code.startsWith(prefix)) {
        pos = prefix.length;
        qualifier = q;
        break;
      }
    const t = readNameToken(code, pos);
    if (!t) return null;
    if (!t.exact && !bareName(t.name))
      throw new AkariError(
        'P205',
        NAME_BRACKET_MESSAGE,
      );
    return {
      text: code.slice(0, t.end),
      name: t.name,
      qualifier: qualifier || (t.exact ? 'exact' : null),
      len: t.end,
    };
  }
  function statementNode(kind, line, props = {}) {
    const node = {
      kind,
      ...(['MotionCommand', 'LooksCommand', 'PenCommand', 'SoundCommand', 'CloneCommand'].includes(
        kind,
      )
        ? { args: [] }
        : {}),
      ...props,
      sourceSpan: sourceSpan(line),
      inlineComment: kind === 'CommentLine' ? '' : line.comment || '',
    };
    if (line.mapped) SOURCE_RANGES.set(node, {
      range: sourceRange(line.mapped.positions),
      extent: { start: line.start + (line.indent || 0), end: line.end },
      indent: line.indent || 0,
      inline: !!line.inline,
      rewritten: !!line.rewritten,
    });
    return node;
  }
  // Syntax errors never expose a partial tree. Semantic diagnostics belong to analyzeAst/analyzeProject.
  function sentenceProposalInput(proposal, role) {
    const spec = role?.kind === 'RepeatCount' && role.missing?.includes('angle')
      ? {kind:'angle', marker:'〔角度をえらぶ〕', label:'回る 角度（度）', probe:'0'}
      : role?.kind === 'ListMutation' && role.missing?.includes('indexIfReplace')
        ? {kind:'index', marker:'〔番号を入れる〕', label:'入れかえる 番号', probe:'1'} : null;
    if (!spec) return null;
    const offsets=[];
    for(const line of normalizeSource(proposal.source).lines){
      if(line.continuation)continue;
      const mask=surfaceMask(line.mapped.text);
      for(let at=mask.indexOf(spec.marker);at>=0;at=mask.indexOf(spec.marker,at+spec.marker.length)){
        const offset=line.mapped.positions[at];
        if(proposal.source.slice(offset,offset+spec.marker.length)===spec.marker)offsets.push(offset);
      }
    }
    return offsets.length===1 ? {...spec,offset:offsets[0]} : null;
  }
  let checkingSentenceProposals = false;
  function parseSyntax(source, context = {}) {
    try {
      return { ast: parseScript(source, context.symbols, context), syntaxDiagnostics: [] };
    } catch (error) {
      if (!(error instanceof AkariError)) throw error;
      if (!checkingSentenceProposals && error.proposals?.length) {
        checkingSentenceProposals = true;
        try { error.proposals = error.proposals.filter(p => {
          const begin=source.lastIndexOf('\n',p.start-1)+1,prefix=source.slice(begin,p.start),indent=indentWidth(prefix.match(/^[ 　]*/u)[0]);
          // A following else belongs to this block. A wait or event heading cannot replace its if.
          if(!prefix.trim()){
            const following=source.slice(source.indexOf('\n',p.start)<0?source.length:source.indexOf('\n',p.start)+1).split('\n');
            for(const raw of following){if(!raw.trim())continue;const lead=raw.match(/^[ 　]*/u)[0],width=indentWidth(lead);if(width>indent)continue;
              if(width===indent&&/^(?:そうでなければ|でなければ)/.test(raw.slice(lead.length))&&!/^もし/.test(p.source))return false;break;}
          }
          const input=sentenceProposalInput(p,error.draftRole), replacement=input
            ? p.source.slice(0,input.offset)+input.probe+p.source.slice(input.offset+input.marker.length) : p.source;
          const next=parseSyntax(source.slice(0,p.start)+replacement+source.slice(p.end),context);
          if(next.ast){if(input)p.input=input;return true;}
          const from=source.slice(0,p.start).split('\n').length,to=from+p.source.split('\n').length-1,line=next.syntaxDiagnostics[0]?.line;
          // A different malformed line must not hide a useful correction here.
          const useful=!line||line<from||line>to;if(useful&&input)p.input=input;return useful;
        }); }
        finally { checkingSentenceProposals = false; }
      }
      // 10の倍数・12の約数・からっぽ in an ordinary body: the code view shows the same guidance as the check (FCM-19).
      let word = null;
      if (!context.meijin && !error.proposals?.length && ['P201', 'P205'].includes(error.code)) {
        const text = String(source).split('\n')[(error.line || 1) - 1] || '';
        for (const [pattern, say] of WORD_LINES) { const m = pattern.exec(text); if (m) { word = say(m); break; } }
      }
      // A 名人 form in a part's body (点数が10になったとき、 / あかりが2秒かけて、前へ40歩進むあいだ、…): the code view says
      // S317, as the check does (FM2-04). Only a body of the work is tried (its key and part), never a probe of a phrase.
      const meijin = !word && !context.meijin && !context.definitionKind && !context.definition && (context.key || context.ownerKey) && context.targetId && context.symbols?.project
        && genericReadingError(error) && meijinTrialReads(context.symbols.project, String(source), context.targetId);
      return {
        ast: null,
        syntaxDiagnostics: [
          {
            code: word ? 'S301' : meijin ? 'S317' : error.code,
            message: word || (meijin ? MEIJIN_ONLY_MESSAGE : error.message),
            line: error.line || 0,
            column: error.column || 1,
            where: context.key || context.ownerKey || '',
            ...(error.proposals ? {proposals:error.proposals} : {}),
            ...(error.choices ? {choices:error.choices} : {}),
            ...(error.draftRole ? {draftRole:error.draftRole} : {}),
          },
        ],
      };
    }
  }
  function sentenceRoleSlots(kind,op,role) {
    const expr=(path,label,unit=null)=>Object.freeze({path,label,type:path==='target'?'target':path==='condition'?'condition':path==='args'?'arguments':'expression',unit,required:true});
    const values={
      Assignment:[expr('target','かえるもの'),expr('value','新しい中身')],NumericUpdate:[expr('target','かえるもの'),expr('value','ふやす・へらす数')],
      ListAppend:[expr('target','リスト'),expr('value','入れるもの')],ListInsert:[expr('target','リスト'),expr('index','何番目','番目'),expr('value','入れるもの')],ListReplace:[expr('target','リスト'),expr('index','何番目','番目'),expr('value','新しい中身')],ListDelete:[expr('target','リスト'),expr('index','何番目','番目')],ListClear:[expr('target','リスト')],
      IfStatement:[expr('condition','条件')],RepeatCount:[expr('count','回数','回')],RepeatWhile:[expr('condition','条件')],RepeatUntil:[expr('condition','条件')],ForEach:[expr('list','調べるリスト')],WaitTime:[expr('seconds','待つ時間','秒')],WaitUntil:[expr('condition','待つ条件')],
      Say:[expr('value','言う内容')],Ask:[expr('question','たずねる内容')],Broadcast:[expr('message','合図')],BroadcastAndWait:[expr('message','合図')],ReturnStatement:[expr('value','答え')],LocalVariableDeclaration:[expr('initial','はじめの中身')],UserActionCall:[expr('args','入れるもの')],ContinuousRule:[expr('condition','続ける条件'),expr('seconds','速さの時間','秒'),expr('distance','速さの歩数','歩')],
    };
    const args={MOVE:[['歩数','歩']],GOTO_PART:[['行く相手',null]],SET_DIRECTION:[['向き','度']],TURN_RIGHT:[['角度','度']],TURN_LEFT:[['角度','度']],POINT_TO:[['向く相手',null]],SET_SCALE:[['大きさ','％']],SET_VOLUME:[['音の大きさ','％']],TONE:[['周波数','Hz'],['長さ','秒']],TONE_WAIT:[['周波数','Hz'],['長さ','秒']],SET_TARGET_TEXT:[['部品',null],['文字',null]],SET_INPUT:[['入力らん',null],['中身',null]],FORWARD_LAYERS:[['いくつ',null]],BACKWARD_LAYERS:[['いくつ',null]],SET_COLOR:[['色',null]],SET_COSTUME:[['すがた',null]],SET_BACKDROP:[['はいけい',null]],SET_SELF_TEXT:[['文字',null]],SET_SIZE:[['太さ',null]],SAMPLE:[['音',null]],SAMPLE_WAIT:[['音',null]],PITCH_UP:[['音の高さ',null]],PITCH_DOWN:[['音の高さ',null]],CREATE_TARGET:[['コピーの元',null]]};
    const slots=[...(values[kind] || (args[op]||[]).map(([label,unit],i)=>expr(`args.${i}`,label,unit)))];
    if(kind==='Say'&&role==='timedSpeech')slots.push(expr('seconds','話す時間','秒'));
    // The move sentences: よこ and たて legs (GOTO always has both, MOVE_BY one or two) and the optional 〇秒かけて.
    const optional=(path,label,unit)=>Object.freeze({...expr(path,label,unit),required:false});
    if(kind==='MotionCommand'&&['GOTO','MOVE_BY'].includes(op))slots.push(...[['x','よこの歩数'],['y','たての歩数']].map(([path,label])=>op==='GOTO'?expr(path,label,'歩'):optional(path,label,'歩')));
    if(kind==='MotionCommand'&&['GOTO','MOVE_BY','MOVE','GOTO_PART','TURN_RIGHT','TURN_LEFT'].includes(op))slots.push(optional('seconds','かける時間','秒'));
    slots.unshift(Object.freeze({path:'actorRef',label:'動く対象',type:'actor',unit:null,required:true}));
    if(['LocalVariableDeclaration','LocalListDeclaration','UserActionCall'].includes(kind))slots.push(Object.freeze({path:'name',label:'名前',type:'name',unit:null,required:true}));
    if(kind==='WaitBroadcastGroup')slots.push(Object.freeze({path:'broadcastRef',label:'すぐ前の合図',type:'reference',unit:null,required:true}));
    if(kind==='ForEach')slots.push(Object.freeze({path:'binder',label:'今 見て いる ものの 名前',type:'name',unit:null,required:true}));
    if(op==='MOVE'||kind==='ContinuousRule')slots.push(Object.freeze({path:'direction',label:'方向',type:'direction',unit:null,required:true}));
    if(['GOTO','MOVE_BY'].includes(op))slots.push(Object.freeze({path:'xDir',label:'よこの向き',type:'direction',unit:null,required:true}),Object.freeze({path:'yDir',label:'たての向き',type:'direction',unit:null,required:true}));
    return Object.freeze(slots);
  }
  function sentenceFormRecord(id,pattern,kind,op,role) {
    const roleSlots=sentenceRoleSlots(kind,op,role),semanticOperation=op?`${kind}:${op}`:kind;
    const labels={TimerReset:'タイマーを0にもどす',Assignment:'中身をかえる',NumericUpdate:'中身をふやす・へらす',ListAppend:'さいごに入れる',ListInsert:'とちゅうに入れる',ListReplace:'何番目かの中身をかえる',ListDelete:'何番目かを消す',ListClear:'中身を全部消す',IfStatement:'条件で分ける',RepeatCount:'回数を決めてくり返す',RepeatWhile:'あいだくり返す',RepeatUntil:'までくり返す',Forever:'ずっとくり返す',ForEach:'中身を一つずつ見る',WaitTime:'時間を待つ',WaitBroadcastGroup:'その合図で始まったことが全部終わるまで待つ',WaitUntil:'条件を待つ',Say:'内容を言う',Ask:'たずねて答えを待つ',Broadcast:'合図を送る',BroadcastAndWait:'合図を送って、全部終わるまで待つ',LocalVariableDeclaration:'この中だけの へんすうを作る',LocalListDeclaration:'この中だけのリストを作る',ReturnStatement:'答えを返す',UserActionCall:'てじゅんを行う',NoOperation:'何もしない',Break:'このくり返しを終える',Continue:'次の回へ進む',MotionCommand:'ばしょや向きをかえる',LooksCommand:'見た目をかえる',PenCommand:'線をかく・スタンプをおす',SoundCommand:'音を鳴らす・かえる',CloneCommand:'コピーを作る・消す',StopCommand:'動きを止める',ContinuousRule:'条件のあいだ動き続ける'};
    const verbs={MotionCommand:['動く','動いて','動かす','動かして','進む','進んで','歩く','歩いて','あるく','あるいて','回る','回って','向く','向いて','行く','行って'],Say:['言う','言って','話す','話して','言わせる','言わせて'],WaitTime:['待つ','待って'],UserActionCall:['行う','行って'],SoundCommand:['鳴らし始める','鳴らし始めて','鳴らす','鳴らして'],NumericUpdate:['足す','足して','引く','引いて','ふやす','へらす','増やす','減らす']};
    return Object.freeze({id,pattern,kind,op,role,intent:labels[kind]||kind,semanticOperation,roleSlots,
      clauses:Object.freeze(roleSlots.map(slot=>Object.freeze({role:slot.path,label:slot.label,unit:slot.unit}))),
      verbForms:Object.freeze(verbs[kind]||[]),nounForms:Object.freeze(roleSlots.map(slot=>slot.label)),
      acceptedReadings:Object.freeze(pattern?[pattern.source]:[role]),evaluationOrder:Object.freeze(roleSlots.filter(slot=>['expression','condition','arguments'].includes(slot.type)).map(slot=>slot.path)),
      allowedContexts:Object.freeze(kind==='ReturnStatement'?['function']:['LocalVariableDeclaration','LocalListDeclaration'].includes(kind)?['action','function']:kind==='ContinuousRule'?['script']:['Assignment','NumericUpdate','ListAppend','ListInsert','ListReplace','ListDelete','ListClear','IfStatement','RepeatCount','RepeatWhile','RepeatUntil','Forever','ForEach','LocalVariableDeclaration','LocalListDeclaration','ReturnStatement','NoOperation','Break','Continue'].includes(kind)?['script','action','function']:['script','action']),
      render:node=>renderSentenceNode(node),preview:node=>renderSentenceNode(node),errors:Object.freeze(['P201','P202','P205'])});
  }
  function sentenceFormFor(node) {if (node.kind === 'ExtensionCommand') return { kind: node.kind, allowedContexts: ['script', 'action'], roleSlots: [], render: n => extensionSurface(n.name, false, n.args), preview: n => extensionSurface(n.name, false, n.args) };return SENTENCE_FORMS.find(form=>form.kind===node.kind&&(!form.op||form.op===node.op));}
  // A condition put into data keeps its （ ）: クリアを（点数が10以上）にする (not 点数が10以上にする).
  function isConditionValue(v) {
    if (!v) return false;
    if (['CompareExpression','LogicalExpression'].includes(v.kind) || (v.kind === 'UnaryExpression' && v.op === 'NOT')) return true;
    if (v.kind === 'BuiltinCall') return v.name === 'CONTAINS';
    if (v.kind === 'SensorRead') return ['KEY_DOWN','TOUCHING','TOUCHING_COLOR','マウスが押されている','クローンである'].includes(v.sensor);
    return v.kind === 'ActorQualifiedRead' && isConditionValue(v.value);
  }
  function isStateRead(v) {
    if (!v || isConditionValue(v)) return false;
    return v.kind === 'SensorRead' || (v.kind === 'ActorQualifiedRead' && isStateRead(v.value));
  }
  function valueSource(v) { const text = formatExpression(v); return isConditionValue(v) && !/^（.*）$/.test(text) ? `（${text}）` : text; }
  // 点数を言う (F-34). A bare name is read back so only when it is a name the work knows (an unknown word before を言う is
  // asked about: text, a sound or data); otherwise the の値 is kept: 点数の値を言う reads the same.
  function speechValueParticle(value){
    const bare=value.kind==='VariableRead'&&value.qualifier!=='exact'?value.name:null;
    return bare===null||formatKnownName(bare)?'を':'の値を';
  }
  function renderSentenceNode(n) {
    const f=formatExpression,t=n.target?formatTarget(n.target):'';
    switch(n.kind){
      // 答えを名前に入れる: a read of the answer or of a state is put into the named variable (名前を答えにする can be
      // read the other way round). Any written variable reads back so: 自分の体力, 作品の点数, 【この中だけの名前】.
      case 'Assignment':return isStateRead(n.value)?`${valueSource(n.value)}を${t}に入れる`:`${t}を${valueSource(n.value)}にする`;
      // Kana-first output (F-20): ふやす・へらす・さいご・てじゅん; the kanji spellings are read as well.
      case 'NumericUpdate':return `${t}を${f(n.value)}${n.op==='ADD'?'ふやす':'へらす'}`;
      case 'ListAppend':return `${t}のさいごに${valueSource(n.value)}を入れる`;
      case 'ListInsert':return `${t}の${sentenceQuantitySource(n.index,'番目')}に${valueSource(n.value)}を入れる`;
      case 'ListReplace':return `${t}の${sentenceQuantitySource(n.index,'番目')}を${valueSource(n.value)}にかえる`;
      case 'ListDelete':return `${t}の${sentenceQuantitySource(n.index,'番目')}を消す`;
      case 'ListClear':return `${t}の中身を全部消す`;
      case 'NoOperation':return '何もしない';case 'TimerReset':return 'タイマーを0にする';case 'Break':return 'このくり返しを終える';case 'Continue':return 'この回の残りをとばして、次の回へ進む';
      case 'WaitTime':return `${sentenceQuantitySource(n.seconds,'秒')}待つ`;
      case 'WaitBroadcastGroup':return 'その合図で始まったことが全部終わるまで待つ';
      case 'WaitUntil':return `${conditionSource(n.condition,'until')}待つ`;
      case 'Say':if(n.seconds!==undefined)return `${f(n.value)}${n.value.kind==='StringLiteral'?'と':'を'}${sentenceQuantitySource(n.seconds,'秒')}話す`;if(n.value.kind==='BuiltinCall'&&n.value.name==='つなぐ'&&n.value.args.length>=2)return `${n.value.args.map(joinPartSource).join('と')}をつなげて言う`;return ['CompareExpression','LogicalExpression'].includes(n.value.kind)||(n.value.kind==='UnaryExpression'&&n.value.op==='NOT')?`（${f(n.value)}）の値を言う`:`${f(n.value)}${n.value.kind==='StringLiteral'?'と':speechValueParticle(n.value)}言う`;
      case 'Ask':return `${f(n.question)}とたずねて、答えを待つ`;
      case 'Broadcast':return `${f(n.message)}の合図を送る`;
      case 'BroadcastAndWait':return `${f(n.message)}の合図を送って、その合図で始まったことが全部終わるまで待つ`;
      case 'LocalVariableDeclaration':return `この中だけで使う変数【${n.name}】を作り、最初は${f(n.initial)}にする`;
      case 'LocalListDeclaration':return `この中だけで使うリスト【${n.name}】を空で作る`;
      case 'ReturnStatement':return `${f(n.value)}を答えとして返す`;
      case 'UserActionCall':return (n.argumentNames?n.args.map((value,i)=>`${nameSource(n.argumentNames[i])}を${f(value)}`).join('、')+'として、':n.args.length===1&&['NumberLiteral','StringLiteral','VariableRead'].includes(n.args[0].kind)&&!(n.args[0].kind==='NumberLiteral'&&n.args[0].value<0)?f(n.args[0])+'をわたして、':n.args.length?'（'+n.args.map(value=>f(value)).join('、')+'）をわたして、':'')+`【${n.name}】というてじゅんを行う`;
      case 'StopCommand':return {THIS:'この動きを止める',OTHERS:'ほかの動きを全部止める',OWN_OTHERS:'自分のほかの動きを止める',ALL:'作品を全部止める'}[n.op];
      case 'MotionCommand':case 'LooksCommand':case 'PenCommand':case 'SoundCommand':case 'CloneCommand':return formatCommand(n);
      case 'IfStatement':return 'もし'+formatCondition(n.condition,'if')+'、';
      case 'RepeatCount':return sentenceQuantitySource(n.count,'回')+'くり返す';
      case 'RepeatWhile':case 'RepeatUntil':return conditionSource(n.condition,n.kind==='RepeatWhile'?'while':'until')+'、くり返す';
      case 'Forever':return 'ずっとくり返す';
      case 'ForEach':return f(n.list)+'の中身を先頭から一つずつ見て、次のことを行う';
      case 'ContinuousRule':return `${formatCondition(n.condition,'while')}、${n.actorRef?.kind==='named'?sentenceActorSource(n.actorRef)+'は':''}${{forward:'前',backward:'後ろ',right:'右',left:'左',up:'上',down:'下'}[n.direction]}へ${sentenceQuantitySource(n.seconds,'秒')}に${sentenceQuantitySource(n.distance,'歩')}の速さで動き続ける`;
      default:throw new AkariError('P201',`この 文の 書き方は、まだ ありません（${n.kind}）`);
    }
  }
  // Finite surface records: protected operands are captured by position, never rewritten.
  const SENTENCE_FORMS = Object.freeze([
    ...[
      ['IfStatement','block'],['RepeatCount','block'],['RepeatWhile','block'],['RepeatUntil','block'],['Forever','block'],['ForEach','block'],
      ['WaitBroadcastGroup','broadcastWait'],['WaitUntil','condition'],['UserActionCall','call'],['MotionCommand:MOVE','motion'],['MotionCommand:GOTO','motion'],
      ['MotionCommand:MOVE_BY','motion'],['MotionCommand:GOTO_PART','motion'],['LooksCommand:SET_INPUT','input'],['ContinuousRule','rule']
    ].map(([id,phase])=>[id,null,id.split(':')[0],id.split(':')[1]||null,phase]),
    ['NoOperation', /^何もしない$/d, 'NoOperation'],
    ['TimerReset', /^タイマーを0にする$/d, 'TimerReset'],
    ['Break', /^(?:いま|この)のくり返しを終える$/d, 'Break'],
    ['Continue', /^この回の残りをとばして、次の回へ進む$/d, 'Continue'],
    ['StopCommand:THIS', /^(?:この実行|この動き)を止める$/d, 'StopCommand', 'THIS'],
    ['StopCommand:OTHERS', /^ほかの(?:実行|動き)を(?:全部|ぜんぶ|すべて)止める$/d, 'StopCommand', 'OTHERS'],
    // 自分のほかの動きを止める: only the part's own other bodies and rules (F-29); 全部 written in it says the same.
    ['StopCommand:OWN_OTHERS', /^自分のほかの(?:実行|動き)を(?:全部|ぜんぶ|すべて)?止める$/d, 'StopCommand', 'OWN_OTHERS'],
    // 作品を止める and すべてを止める say the same (F-30: 作品 has one meaning).
    ['StopCommand:ALL', /^(?:作品(?:を(?:全部|ぜんぶ|すべて)?|(?:全体|全部|ぜんぶ)を)|すべてを)止める$/d, 'StopCommand', 'ALL'],
    ['LooksCommand:HIDE', /^(?:姿|すがた)を(?:かくす|隠す)$/d, 'LooksCommand', 'HIDE'],
    ['LooksCommand:SHOW', /^(?:姿|すがた)を(?:見せる|みせる)$/d, 'LooksCommand', 'SHOW'],
    ['LooksCommand:FRONT', /^いちばん手前へ出る$/d, 'LooksCommand', 'FRONT'],
    ['LooksCommand:BACK', /^いちばん(?:おく|奥)へ下がる$/d, 'LooksCommand', 'BACK'],
    ['MotionCommand:BOUNCE', /^画面の(?:はし|端)に(?:ふれて|触れて)いれば、?(?:はね返る|跳ね返る)$/d, 'MotionCommand', 'BOUNCE'],
    ['PenCommand:DOWN', /^ペンを下ろす$/d, 'PenCommand', 'DOWN'],
    ['PenCommand:UP', /^ペンを上げる$/d, 'PenCommand', 'UP'],
    ['PenCommand:STAMP', /^(?:今の(?:姿|すがた)の)?スタンプを(?:押|お)す$/d, 'PenCommand', 'STAMP'],
    ['PenCommand:CLEAR', /^作品の線とスタンプを(?:全部|ぜんぶ|すべて)(?:消す|けす)$/d, 'PenCommand', 'CLEAR'],
    ['SoundCommand:STOP_ALL', /^すべての音を止める$/d, 'SoundCommand', 'STOP_ALL'],
    ['CloneCommand:CREATE_SELF', /^自分のコピーを作る$/d, 'CloneCommand', 'CREATE_SELF'],
    ['CloneCommand:CREATE_SELF:count', /^自分のコピーを(.+?)(?:つ|個|体)作る$/d, 'CloneCommand', 'CREATE_SELF', 'cloneCount'],
    ['CloneCommand:DELETE_SELF', /^このコピーだけを(?:消す|けす)$/d, 'CloneCommand', 'DELETE_SELF'],
    ['LooksCommand:NEXT_BACKDROP', /^次の(?:背景|はいけい)に(?:変える|かえる)$/d, 'LooksCommand', 'NEXT_BACKDROP'],
    ['LooksCommand:PREV_BACKDROP', /^前の(?:背景|はいけい)に(?:変える|かえる)$/d, 'LooksCommand', 'PREV_BACKDROP'],
    ['LooksCommand:NEXT_COSTUME', /^次の(?:衣装|すがた)に(?:変える|かえる)$/d, 'LooksCommand', 'NEXT_COSTUME'],
    ['LooksCommand:PREV_COSTUME', /^前の(?:衣装|すがた)に(?:変える|かえる)$/d, 'LooksCommand', 'PREV_COSTUME'],
    ['WaitTime', /^(.+?)秒(?:間|だけ)?(?:待つ|まつ)$/d, 'WaitTime', null, 'seconds'],
    ['Say:concat', /^(.+?)をつなげて(?:言う|いう|話す|はなす)$/d, 'Say', null, 'concat'],
    ['Say:timed', /^(.+)(?:と|を)(.+?)秒(?:間)?(?:言う|いう|話す|はなす)$/d, 'Say', null, 'timedSpeech'],
    ['Say:concatReverse', /^(.+?に)つなげて(?:言う|いう|話す|はなす)$/d, 'Say', null, 'concat'],
    ['Say:add', /^(.+?)に(.+?)を足して(?:言う|いう|話す|はなす)$/d, 'Say', null, 'addValue'],
    ['Say:quote', /^(.+?)と(?:言う|いう|話す|はなす)$/d, 'Say', null, 'quote'],
    ['Say:value', /^(.+?)を(?:言う|いう|話す|はなす)$/d, 'Say', null, 'value'],
    ['Ask', /^(.+?)と(?:(?:たずねて|尋ねて|聞いて)、(?:答え|返事)を待つ|たずねる|尋ねる)$/d, 'Ask', null, 'question'],
    ['BroadcastAndWait:signal', /^(.+?)の合図を送って、その合図で始まったことが(?:全部|ぜんぶ|すべて)終わるまで待つ$/d, 'BroadcastAndWait', null, 'message'],
    ['Broadcast:signal', /^(.+?)の合図を送る$/d, 'Broadcast', null, 'message'],
    ['BroadcastAndWait', /^みんなに(.+?)と知らせて、知らせを受けて始めたことが全部終わるまで待つ$/d, 'BroadcastAndWait', null, 'message'],
    ['Broadcast', /^みんなに(.+?)と知らせる$/d, 'Broadcast', null, 'message'],
    ['ReturnStatement', /^(.+?)を、?答えとして返す$/d, 'ReturnStatement', null, 'value'],
    ['LocalVariableDeclaration', /^この中だけで使う変数(.+?)を作り、最初は(.+?)にする$/d, 'LocalVariableDeclaration', null, 'local'],
    ['LocalListDeclaration', /^この中だけで使うリスト(.+?)を空で作る$/d, 'LocalListDeclaration', null, 'localList'],
    ['MotionCommand:SET_DIRECTION', /^(?:向き|方向)を(.+?)度にする$/d, 'MotionCommand', 'SET_DIRECTION', 'degree'],
    ['MotionCommand:TURN_RIGHT', /^右(?:に|へ)(.+?)度(?:回る|まわる)$/d, 'MotionCommand', 'TURN_RIGHT', 'degree'],
    ['MotionCommand:TURN_LEFT', /^左(?:に|へ)(.+?)度(?:回る|まわる)$/d, 'MotionCommand', 'TURN_LEFT', 'degree'],
    ['MotionCommand:POINT_TO', /^(.+?)の(?:方向|方|ほう)を(?:向く|むく)$/d, 'MotionCommand', 'POINT_TO', 'arg'],
    ['LooksCommand:SET_SCALE', /^大きさを(.+?)％にする$/d, 'LooksCommand', 'SET_SCALE', 'percent'],
    ['LooksCommand:SET_COLOR', /^表示色を(.+?)に(?:する|変える|かえる)$/d, 'LooksCommand', 'SET_COLOR', 'arg'],
    ['LooksCommand:SET_COSTUME', /^(?:衣装|すがた)を(.+?)に(?:する|変える|かえる)$/d, 'LooksCommand', 'SET_COSTUME', 'arg'],
    ['LooksCommand:SET_BACKDROP', /^(?:背景|はいけい)を(.+?)に(?:する|変える|かえる)$/d, 'LooksCommand', 'SET_BACKDROP', 'arg'],
    ['LooksCommand:SET_SELF_TEXT', /^自分の文字を(.+?)に(?:変える|かえる)$/d, 'LooksCommand', 'SET_SELF_TEXT', 'arg'],
    ['LooksCommand:SET_TARGET_TEXT', /^(.+?)の文字を(.+?)に(?:変える|かえる)$/d, 'LooksCommand', 'SET_TARGET_TEXT', 'args'],
    ['LooksCommand:FORWARD_LAYERS', /^重なりを(.+?)つ手前にする$/d, 'LooksCommand', 'FORWARD_LAYERS', 'arg'],
    ['LooksCommand:BACKWARD_LAYERS', /^重なりを(.+?)つ(?:おく|奥)にする$/d, 'LooksCommand', 'BACKWARD_LAYERS', 'arg'],
    ['PenCommand:SET_COLOR', /^ペンの色を(.+?)にする$/d, 'PenCommand', 'SET_COLOR', 'arg'],
    ['PenCommand:SET_SIZE', /^ペンの太さを(.+?)にする$/d, 'PenCommand', 'SET_SIZE', 'arg'],
    ['SoundCommand:SET_VOLUME', /^(?:音量|音の大きさ)を(.+?)％にする$/d, 'SoundCommand', 'SET_VOLUME', 'percent'],
    ['SoundCommand:PITCH_UP', /^(?:音の高さ|音程)を(.+?)段階上げる$/d, 'SoundCommand', 'PITCH_UP', 'arg'],
    ['SoundCommand:PITCH_DOWN', /^(?:音の高さ|音程)を(.+?)段階下げる$/d, 'SoundCommand', 'PITCH_DOWN', 'arg'],
    ['SoundCommand:TONE', /^(.+?)Hzの音を(.+?)秒鳴らし始める$/d, 'SoundCommand', 'TONE', 'tone'],
    ['SoundCommand:TONE_WAIT', /^(.+?)Hzの音を(.+?)秒鳴らす$/d, 'SoundCommand', 'TONE_WAIT', 'tone'],
    ['SoundCommand:TONE:timeFirst', /^(.+?)秒(?:間)?、(.+?)Hzの音を鳴らし始める$/d, 'SoundCommand', 'TONE', 'toneReverse'],
    ['SoundCommand:TONE_WAIT:timeFirst', /^(.+?)秒(?:間)?、(.+?)Hzの音を鳴らす$/d, 'SoundCommand', 'TONE_WAIT', 'toneReverse'],
    ['SoundCommand:SAMPLE', /^(.+?)を鳴らし始める$/d, 'SoundCommand', 'SAMPLE', 'arg'],
    ['SoundCommand:SAMPLE_WAIT', /^(.+?)を鳴らす$/d, 'SoundCommand', 'SAMPLE_WAIT', 'arg'],
    ['CloneCommand:CREATE_TARGET', /^(.+?)のコピーを作る$/d, 'CloneCommand', 'CREATE_TARGET', 'arg'],
    ['CloneCommand:CREATE_TARGET:count', /^(.+?)のコピーを(.+?)(?:つ|個|体)作る$/d, 'CloneCommand', 'CREATE_TARGET', 'cloneTargetCount'],
    ['ListClear', /^(.+?)の(?:中身を(?:全部|ぜんぶ|すべて)(?:消す|けす)|すべての要素を削除する)$/d, 'ListClear', null, 'target'],
    ['ListClear:empty', /^(.+?)を空にする$/d, 'ListClear', null, 'target'],
    ['ListAppend', /^(.+?)の(?:最後|さいご)に(.+?)を(?:入れる|いれる)$/d, 'ListAppend', null, 'append'],
    ['ListAppend:valueFirst', /^(.+?)を(.+?)の(?:最後|さいご)に(?:入れる|いれる)$/d, 'ListAppend', null, 'appendReverse'],
    ['ListInsert', /^(.+)の(.+?)番目(?:の前)?に(.+?)を(?:入れる|いれる)$/d, 'ListInsert', null, 'insert'],
    ['ListInsert:valueFirst', /^(.+?)を(.+)の(.+?)番目(?:の前)?に(?:入れる|いれる)$/d, 'ListInsert', null, 'insertReverse'],
    ['ListReplace', /^(.+)の(.+?)番目を(.+?)に(?:変える|かえる|する)$/d, 'ListReplace', null, 'replace'],
    ['ListDelete', /^(.+)の(.+?)番目を(?:消す|けす)$/d, 'ListDelete', null, 'delete'],
    ['NumericUpdate:ADD', /^(.+?)を(.+?)(?:(?<!の数)だけ)?(?:増やす|ふやす)$/d, 'NumericUpdate', 'ADD', 'update'],
    ['NumericUpdate:SUB', /^(.+?)を(.+?)(?:(?<!の数)だけ)?(?:減らす|へらす)$/d, 'NumericUpdate', 'SUB', 'update'],
    ['NumericUpdate:ADD:targetFirst', /^(.+?)に(.+?)を(?:足す|たす)$/d, 'NumericUpdate', 'ADD', 'update'],
    ['NumericUpdate:SUB:targetFirst', /^(.+?)から(.+?)を(?:引く|ひく)$/d, 'NumericUpdate', 'SUB', 'update'],
    ['NumericUpdate:ADD:valueFirst', /^(.+?)を(.+?)に(?:足す|たす)$/d, 'NumericUpdate', 'ADD', 'updateReverse'],
    ['NumericUpdate:SUB:valueFirst', /^(.+?)を(.+?)から(?:引く|ひく)$/d, 'NumericUpdate', 'SUB', 'updateReverse'],
    ['Assignment:variableInput', /^(.+?)を(.+?)という変数に(?:入れる|いれる)$/d, 'Assignment', null, 'assignReverse'],
    ['Assignment', /^(.+?)を(.+?)に(?:する|変える|かえる)$/d, 'Assignment', null, 'assign'],
  ].map(([id, pattern, kind, op, role]) => sentenceFormRecord(id,pattern,kind,op,role)));
