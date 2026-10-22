  // ────────────────────────────────────────────────────────────────────────
  // 04 — Syntax parsing (no persistent block representation)
  // ────────────────────────────────────────────────────────────────────────
  // An extension operation registered with scope "meijin" is written only in 名人 text.
  const extensionMeijinOnly = (extension, operation, calculation = false) =>
    `${calculation ? '拡張計算' : '拡張'}「${extension}」「${operation}」は、名人の本文で だけ 使えます`;
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
      if (!this.take(s)) this.err(code, `「${s}」が たりません。書き足してください`);
    }
    parse() {
      if (!this.text) this.err('P205', '計算が 書かれていません。数や 文字を 書いてください。れい：10');
      const n = this.logicalOr();
      if (!this.atEnd()) this.err('P201', `計算の「${this.text.slice(this.i)}」の ところが 読めません。書き方を たしかめてください`);
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
      if (this.starts('ではない')) this.err('P201', '「ではない」が 2つ つづいています。前の ほうを（ ）で かこんでください');
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
        if (!p.atEnd()) this.err('P205','くらべる 2つの ものを（ ）か【 】で かこんで 分けてください。れい：【点数】が10より大きい');
        return n;
      };
      let left, right;
      if (reverse) {
        const split = mask.indexOf('より');
        if (!mask.endsWith('が'+ending) || split < 1 || split !== mask.lastIndexOf('より'))
          this.err('P205','「より」は 1回だけ 書いてください。名前に「より」が 入るときは【 】で かこみます。れい：【より道】が10より大きい');
        left = term(text.slice(split+2,-ending.length-1), split+2);
        right = term(text.slice(0,split), 0);
      } else {
        // The existing operand parser owns compounds such as キーが押されている.
        const p = parser(text, 0);
        left = p.additive();
        if (!p.take('が')) this.err('P205','くらべる ものの あとに「が」を 書いてください。れい：点数が10と同じ');
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
            'くらべる ことばが ありません。おわりに「以上」「以下」「より大きい」「より小さい」「と同じ」「とちがう」の どれかを 書いてください。れい：点数が10と同じ',
          );
        if (this.starts('が'))
          this.err('P206', 'くらべる ことを 2つ つづけては 書けません。「かつ」で 分けてください。れい：1が2より小さいかつ2が3より小さい');
        return exprNode('CompareExpression', { op, left, right });
      }
      if (this.take('の中に') || this.take('に')) {
        const right = this.additive();
        const negative = this.take('が入っていない') || this.take('\u304c\u542b\u307e\u308c\u3066\u3044\u306a\u3044');
        if (!negative && !this.take('が入っている') && !this.take('が含まれている')) this.err('P205', '「が入っている」が たりません。書き足してください。れい：名前一覧に「あ」が入っている');
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
        this.err('P208', '計算の 中に 計算が 入りすぎています。短い 計算に 分けてください');
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
        else this.err('P205', 'ここには「あてはまる」か「あてはまらない」の どちらかを 書いてください');
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
            if (!['\\',open,close].includes(escaped)) this.err('N103','「 」の 中の \\ の つぎには、\\ か「 か 」しか 書けません。\\ を 文字として 使うときは \\\\ と 書きます');
            value += escaped;
          } else value += ch;
        }
        if (!closed) this.err('N101','「 で はじめた 文字を とじる 」が ありません。文字の おわりに 」を 書いてください');
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
          if (++this.depth + (this.ctx._parserDepth||0) > LIMITS.expressionDepth) this.err('P208','計算の 中に 計算が 入りすぎています。短い 計算に 分けてください');
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
          this.err('N102', '数が 大きすぎます。もっと 小さい 数に してください');
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
        if (!found) this.err('E703', '「拡張計算」の あとに、「 」で かこんだ 名前を 2つ 書いてください');
        const name = EXTENSION_HOST.resolve(found[1], found[2], 'calculations');
        if (!name) this.err('E703', '使いたい「拡張計算」が 見つかりません。名前を たしかめてください');
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
      if (!token) this.err('P205', '読めない ところが あります。書き方を たしかめてください');
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
          if (++this.depth + (this.ctx._parserDepth||0) > LIMITS.expressionDepth) this.err('P208','計算の 中に 計算が 入りすぎています。短い 計算に 分けてください');
          try { return exprNode('ActorQualifiedRead',{actorRef:{kind:'named',name:token.name},value:this.basic()}); }
          finally { this.depth--; }
        }
      }
      if (this.take('\uff08')) {
        if (!token.exact && !BUILTIN_NAMES.has(token.name) && !bareName(token.name))
          this.err(
            'P205',
            'この 名前は【名前】のように【 】で かこんでください',
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
      if (!token.exact && RESERVED.has(token.name)) this.err('P205','あかりで 使う ことばと 同じ 名前は、【名前】のように【 】で かこんで 書いてください');
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
          if (split < 1 || split !== itemMask.lastIndexOf('を')) this.err('P205','名前と 入れるものを「を」で つないで 書きます。れい：点数を10として、');
          const t = readNameToken(item.slice(0,split));
          if (!t || t.end !== split) this.err('P205','入れるものの 名前を たしかめてください。れい：点数を10として、');
          if (argumentNames.includes(t.name)) this.err('P205',`入れるものの 名前「${t.name}」を 2回 書いています。名前は 1回ずつ 書いてください`);
          argumentNames.push(t.name); args.push(parse(item.slice(split+1),begin+split+1)); begin=j+1;
        }
      } else if (positional >= 0) {
        const values = tail.slice(0,positional);
        if (!values.startsWith('（') || !values.endsWith('）')) {
          let one=null;try{one=parse(values,0);}catch(error){if(!(error instanceof AkariError))throw error;}
          if (!one||!['NumberLiteral','StringLiteral','VariableRead'].includes(one.kind)) this.err('P205',/と/.test(surfaceMask(values))?'入れるものが 2つ いじょう あるときは、（ ）で かこんで「、」で 分けます。れい：（3、4）をわたして、':'入れるものを（ ）で かこんでください。れい：（10、「あかり」）をわたして、');
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
      if (!t) this.err('P205', '名前が ありません。ここに 名前を 書いてください');
      if (!t.exact && !bareName(t.name))
        this.err(
          'P205',
          'この 名前は【名前】のように【 】で かこんでください',
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
        throw new AkariError('P208', '計算の 中に 計算が 入りすぎています。短い 計算に 分けてください', line, 1);
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
    if(depth>LIMITS.expressionDepth)throw new AkariError('P208','計算の 中に 計算が 入りすぎています。短い 計算に 分けてください',ctx.lineNo||0,1);
    if(compact.startsWith('（')&&compact.endsWith('）')&&/^\u0001+$/.test(mask))
      return located(parseExpression(compact.slice(1,-1),symbols,{...ctx,_parserDepth:depth,sourcePositions:ctx.sourcePositions?.slice(1,-1)}));
    if (mask.startsWith('今の') && !symbols?.project?.components.some(component=>component.name==='今'))
      return located(parseExpression(compact.slice(2),symbols,{...ctx,_parserDepth:depth,sourcePositions:ctx.sourcePositions?.slice(2)}));
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
      if(args.length<2)throw new AkariError('P205','つなげるものを 2つ いじょう、「と」で ならべます。れい：（「点数は」と点数をつなげた文字）',ctx.lineNo||0,1);
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
      if(literal.kind!=='StringLiteral')throw new AkariError('P205','自分で 作った ブロックの 名前を「 」で 1つだけ 書いてください');
      name=literal.value;
    }else{
      const token=readNameToken(text);
      if(!token||token.end!==text.length)throw new AkariError('P205','自分で 作った ブロックの 名前は、【名前】のように【 】で かこんで 書いてください');
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
    throw new AkariError('P205','きまりの 書き方を たしかめてください');
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
    if (form === 'if' && !/(?:ふれ|触れ)(?:ていたら|ていなかったら|たら)$/.test(surfaceMask(text)))
      for (const [from, to] of [['でなかったら', 'でなければ'], ['くなかったら', 'くなければ'], ['ていなかったら', 'ていなければ'], ['わなかったら', 'わなければ'],
        ['だったら', 'なら'], ['かったら', 'ければ'], ['ていたら', 'ていれば'], ['ちがったら', 'ちがえば'], ['違ったら', '違えば'],
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
        throw new AkariError('P205', '「1から6のどれか」は、そのたびに 数を 1つ えらびます。あいだに あるかを しらべるときは「点数が1以上で、6以下なら」のように 書きます', ctx.lineNo || 0, 1);
      // 点数が10以上で20以下ではないなら: the child means outside the range, not 「10以上で、20以下ではない」.
      if (/^(?:もし、?)?[^、が]+?が[^、が]+?(?:以上|以下|より大きく|より小さく)で、?[^、が]+?(?:以上|以下|大き|小さ)[^、が]*?(?:ない|なければ|なかったら)(?:なら(?:ば)?|あいだ|間|まで)?$/.test(mask))
        throw new AkariError('P205', '「10以上で20以下」に あてはまらない ときを しらべるときは、「点数が10より小さいか、点数が20より大きければ」のように 書きます', ctx.lineNo || 0, 1);
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
    if (mask.includes('になったら')) fail('「になったら」は ここでは 使えません。いまの ようすを しらべるなら「もし点数が10なら、」、そうなるまで 待つなら「点数が10になるまで待つ」のように 書きます');
    // Explicit Boolean expression: its parentheses determine scope and operator precedence.
    if (source.startsWith('条件（')) {
      const endings = form === 'if' ? ['が成り立つなら','が成り立つならば','が成り立つのであれば','が成り立たないなら','が成り立たないならば','が成り立たないのであれば'] : form === 'while' ? ['が成り立つあいだ','が成り立つ間','が成り立たないあいだ','が成り立たない間'] : form === 'until' ? ['が成り立つまで','が成り立たないまで'] : ['が成り立つ','が成り立たない'];
      const ending=endings.find(e=>mask.endsWith(e));
      if (!ending || source[source.length-ending.length-1] !== '）') fail('「条件（ ）」の（ ）が とじているか、その あとに「が成り立つ」が あるかを たしかめてください。れい：もし条件（点数が10以上かつ（名前が「あ」と同じまたは名前が「い」と同じ））が成り立つなら、');
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
      if (commas.length !== 1) fail('きまりを 3つ いじょう つなぐときは、「条件（…）」で ひとまとめに してください');
      const split=commas[0], left=source.slice(0,split), right=source.slice(split+1), leftMask=mask.slice(0,split);
      if (/かつ|または/.test(mask)) fail('「かつ」「または」で つなぐ きまりを、1つずつ（ ）で かこんでください');
      const or=leftMask.endsWith('か');
      const l=parseCondition(or?left.slice(0,-1):left,symbols,{...ctx,sourcePositions:ctx.sourcePositions?.slice(0,split-(or?1:0))},or?'plain':'and');
      const r=parseCondition(right,symbols,{...ctx,sourcePositions:ctx.sourcePositions?.slice(split+1)},form);
      if (l.kind==='LogicalExpression'||r.kind==='LogicalExpression') fail('きまりを 1つずつ（ ）で かこんで 分けてください');
      return exprNode('LogicalExpression',{op:or?'OR':'AND',left:l,right:r});
    }
    // か joins two conditions only right after a finished predicate (点数が1と同じか点数が2と同じ). A か inside a
    // name (かず, あかり) or in 1から6のどれか belongs to that word.
    const orJoin=/(?:以上|以下|大きい|小さい|大きくない|小さくない|と同じ|ではない|でない|とちがう|ちがわない|と違う|違わない|いる|いない|である)か(?!つ)/.test(mask);
    if (/かつ|または/.test(mask) || orJoin) {
      if (form !== 'plain' || (mask.includes('かつ') && mask.includes('または'))) fail('いくつかの きまりを つなぐときは、「条件（…）」で ひとまとめに してください。れい：もし条件（点数が10以上かつ（名前が「あ」と同じまたは名前が「い」と同じ））が成り立つなら、');
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
        if(split<1) fail('ふれる 相手の 名前を「に」の 前に 書いてください');
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
      fail(`「${only}」の 中身を しらべるときは、「もし${nameSource(only)}が1なら、」のように くらべる 数や 文字を 書きます`);}
    fail(form==='if'
      ? 'くらべる ものと「なら」を たしかめてください。「なら、」の あとの 行に する ことを 書きます。れい：もし答えが「ほし」なら、'
      : form==='while' ? 'つづける きまりの おわりを「あいだ」に してください。れい：点数が10より小さいあいだ、くり返す。'
        // The first of two checks (〜で、…): its own ending is 〜で／〜くて／〜ではなくて.
        : form==='and' ? '「、」の 前の きまりが 読めません。「点数が10以上で、」「点数が10より大きくて、」のように 書いてください'
        // Read for くり返す and for 待つ alike, so the example names no command.
        : 'どうなるまで なのかが 読めません。「点数が10になるまで」「「スペース」キーがおされるまで」のように 書いてください');
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
  function formatCondition(node, form = 'plain') {
    const negative=node.kind==='UnaryExpression'&&node.op==='NOT', value=negative?node.value:node;
    if (value.kind==='EventCount'&&!negative&&form==='until') return eventCountSource(value)+'まで';
    if (!negative && value.kind==='LogicalExpression' && ['if','while','until'].includes(form)) {
      const atomic=n => n.kind!=='LogicalExpression' && !(n.kind==='UnaryExpression' && n.op==='NOT' && n.value.kind==='LogicalExpression');
      if(atomic(value.left) && atomic(value.right)) {
        const left=formatCondition(value.left,value.op==='AND'?'and':'plain'), right=value.op==='AND'&&form==='until'?stateUntil(formatCondition(value.right,'plain')):formatCondition(value.right,form);
        if(!left.startsWith('条件（') && !right.startsWith('条件（')) return `${left}${value.op==='OR'?'か':''}、${right}`;
      }
    }
    if(value.kind==='LogicalExpression' || (negative && value.kind==='UnaryExpression')) {
      const expression=formatExpressionCore(value), tail=negative?'成り立たない':'成り立つ';
      return `条件（${expression}）が${tail}${form==='if'?'なら':form==='while'?'あいだ':form==='until'?'まで':''}`;
    }
    const source=value.kind==='ActorQualifiedRead' && value.value.kind==='SensorRead' && ['TOUCHING','TOUCHING_COLOR'].includes(value.value.sensor) ? `${nameSource(value.actorRef.name)}が${formatExpressionCore(value.value)}` : formatExpressionCore(value), mask=surfaceMask(source);
    const predicate=['SensorRead','CompareExpression','ActorQualifiedRead'].includes(value.kind)||(value.kind==='BuiltinCall'&&value.name==='CONTAINS');
    const record=predicate?CONDITION_FORMS.find(r=>mask.endsWith(r.plain)):null;
    if(record) {
      const forms=conditionFormCandidates(record,form), match=forms.find(([,no])=>no===negative);
      // 点数が10になるまで: と同じ is not written before になるまで, unless the value itself ends in a predicate word.
      if(match&&record.plain==='と同じ'&&form==='until'&&!negative&&!/(?:と同じ|以上|以下|大きく|小さく|コピー)$/.test(surfaceMask(source.slice(0,-record.plain.length))))
        return source.slice(0,-record.plain.length)+'になるまで';
      if(match&&record.plain==='と同じ'&&form==='if'&&!negative&&value.kind==='CompareExpression'&&value.op==='EQ'){const short=equalsIfSource(value);if(short)return short;}
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
          const previous = SOURCE_RANGES.get(node), token = key === 'basic' && node.kind === 'ActorQualifiedRead' && node.actorRef.kind === 'named' ? readNameToken(this.text, start) : null;
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
          startColumn:cpLen(line.raw.slice(0, range.start - physicalStart)) + 1,
          endColumn:cpLen(line.raw.slice(0, range.end - physicalStart)) + 1 };
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
        'この 名前は【名前】のように【 】で かこんでください',
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
  function parseSyntax(source, context = {}) {
    try {
      return { ast: parseScript(source, context.symbols, context), syntaxDiagnostics: [] };
    } catch (error) {
      if (!(error instanceof AkariError)) throw error;
      return {
        ast: null,
        syntaxDiagnostics: [
          {
            code: error.code,
            message: error.message,
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
    if(kind==='ForEach')slots.push(Object.freeze({path:'binder',label:'今見ているものの名前',type:'name',unit:null,required:true}));
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
  // A key is written with the name printed on the keyboard (F-34): 「スペース」キー, 「エンター」キー, 「エスケープ」キー.
  const KEY_SURFACES=Object.freeze({空白:'スペース',決定:'エンター',取消:'エスケープ'});
  function keySurface(key){return typeof key==='string'&&Object.hasOwn(KEY_SURFACES,key)?KEY_SURFACES[key]:key;}
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
  function surfaceLineSlice(line, start, end, replacement = null) {
    const code = compactOutsideString(line.code).slice(start, end), positions = line.mapped?.positions.slice(start, end) || [];
    let mappedPositions=positions;
    if(replacement!==null){
      mappedPositions=Array(replacement.length);let prefix=0,suffix=0;
      while(prefix<code.length&&prefix<replacement.length&&code[prefix]===replacement[prefix]){mappedPositions[prefix]=positions[prefix];prefix++;}
      while(suffix<code.length-prefix&&suffix<replacement.length-prefix&&code[code.length-1-suffix]===replacement[replacement.length-1-suffix]){mappedPositions[replacement.length-1-suffix]=positions[code.length-1-suffix];suffix++;}
    }
    return {...line, code:replacement ?? code, mapped:{text:replacement ?? code, positions:mappedPositions},
      start:positions.length ? positions[0]-(line.indent||0) : line.start, physicalStart:line.physicalStart ?? line.start,
      startColumn:positions.length ? cpLen(line.raw.slice(0,positions[0]-(line.physicalStart??line.start)))+1 : line.startColumn||1, inline:true, comment:'',
      // Text put in place of what was written (a 名人 rewrite, a subject put in front): its range is not that text's own.
      rewritten:!!line.rewritten||(replacement!==null&&replacement!==code)};
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
    if (!t || t.len !== text.length) throw new AkariError('P205','かえる へんすうや リストの 名前が 分かりません。作った へんすうや リストの 名前と 同じか たしかめてください');
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
    const e = (part) => parseMappedExpression(part.text, code, line, symbols, ctx, part.start);
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
            if (!one||!['NumberLiteral','StringLiteral','VariableRead'].includes(one.kind)) throw new AkariError('P205',/と/.test(surfaceMask(inner))?'入れるものが 2つ いじょう あるときは、（ ）で かこんで「、」で 分けます。れい：（3、4）をわたして、':'入れるものを（ ）で かこんでください。れい：（10、「あかり」）をわたして、');
            args=[one];
          } else args=parseArgumentText(inner.slice(1,-1),symbols,ctx,line.lineNo);
        } else {
          if (!input.endsWith('として')) throw new AkariError('P205','自分で 作った ブロックに 入れるものは、「として」を つけて 書きます。れい：点数を10として、');
          const content=input.slice(0,-3), protectedInput=surfaceMask(content), chunks=[];
          let at=0;
          for(let i=0;i<=content.length;i++) if(i===content.length||protectedInput[i]==='、'){chunks.push({text:content.slice(at,i),start:at});at=i+1;}
          argumentNames=[];
          for(const chunk of chunks){const pair=surfaceCapture(/^(.+?)を(.+)$/d,chunk.text);if(!pair)throw new AkariError('P205','名前と 入れるものを「を」で つないで 書きます。れい：点数を10として、');const name=parsedDeclarationName(pair[0].text);if(argumentNames.includes(name))throw new AkariError('S308',`入れるものの 名前「${name}」を 2回 書いています。名前は 1回ずつ 書いてください`);argumentNames.push(name);args.push(e({text:pair[1].text,start:chunk.start+pair[1].start}));}
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
          if(args.length<2)throw new AkariError('P205','つなげるものを 2つ いじょう ならべます。れい：「点数は」と点数をつなげて言う');props.value=exprNode('BuiltinCall',{name:'つなぐ',args});break;
        }
        case 'quote': props.value=e(parts[0]); if(props.value.kind!=='StringLiteral') throw new AkariError('P205','言う ことは「「文字」と言う」、へんすうの 中身は「点数を言う」のように 書きます'); break;
        case 'value': {const part=parts[0], raw=part.text.endsWith('の値') && !(part.text === '拡張の値' && EXTENSION_HOST.operations('events').length && !extensionValueIsData(symbols, ctx))?{...part,text:part.text.slice(0,-2)}:part;let error;try{props.value=e(raw);}catch(caught){if(!(caught instanceof AkariError))throw caught;error=caught;}
          const resolvedName=props.value?.kind==='VariableRead'?props.value.name:raw.text,
            unknownWord=/^[\p{L}ー][\p{L}\p{N}ー]*$/u.test(raw.text)&&!symbols?.allDataNames?.has(resolvedName)&&![...(ctx.localNames||[]),...(ctx.binders||[]),...(ctx.args||[])].includes(resolvedName);
          if(form.kind==='Say'&&unknownWord&&(error||props.value?.kind==='VariableRead')&&!part.text.endsWith('の値')){
            const name=raw.text;throw sentenceDiagnostic('そのまま 言う 文字か、入れた 音か、へんすう・リストの 中身かを えらんでください',line,[{label:'そのままの文字を話す',source:`「${name}」と言う`},{label:'同じ名前の音を鳴らす',source:`「${name}」を鳴らす`},{label:'へんすう・リストの 中身を 話す（作った 名前を たしかめる）',source:`【${name}】の値を言う`}],{kind:'Say',missing:['literalOrSoundOrData']});
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
      if (!MOVE_VERBS.here.includes(verb)) throw new AkariError('P205', 'いまの ばしょから 動くときは「動く」と 書きます。れい：' + MOVE_EXAMPLE_HERE);
    }
    const read = readMoveLegs(legs, legsStart, quantity, fixed ? MOVE_EXAMPLE_FIXED : undefined);
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
        if(MOVE_VERBS.part.includes(verb))throw new AkariError('P205','前へ 動くときは「前へ10歩進む」と 書きます');
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
    if(/(?:動く|うごく|進む|すすむ|歩く|あるく)/.test(verb)&&!surfaceMask(body).includes('歩'))throw new AkariError('P205','動くときは 歩数を 書きます。れい：前へ10歩進む／'+MOVE_EXAMPLE_HERE);
    return null;
  }
  // 画面のまん中・画面のどこか are no parts: 〜のところへ行く goes to a part or the mouse, and a place of the screen is
  // written from the bottom-left corner (with the size of the work's screen). null for any other target.
  function screenPlaceSource(mask,symbols) {
    const m=/^画面の(?:(まん中|真ん中|まんなか|中央|中心)|(どこか))$/.exec(mask);if(!m)return null;
    const w=symbols?.project?.stage?.width??640,h=symbols?.project?.stage?.height??400;
    const source=m[1]?`画面の左下のはしから、右へ${w/2}歩、上へ${h/2}歩のばしょへ行く`:`画面の左下のはしから、右へ0歩から${w}歩のどれか、上へ0歩から${h}歩のどれかのばしょへ行く`;
    return {source,message:`「〜のところへ行く」の 行き先は、部品か マウスです。画面の ${m[1]?'まん中':'どこか'}へ 行くときは「${source}」と 書きます`};
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
      const horizontal = ['よこ', '横'].includes(p[2]), amount = rest.slice(rmask.indexOf('を', p[1] ? p[1].length : 0) + 1, rest.length - p[4].length).replace(/歩?(?:だけ)?$/, '');
      if (/(?:増やす|ふやす|減らす|へらす)$/.test(p[4])) {
        const up = /^(?:増|ふ)/.test(p[4]), word = horizontal ? (up ? '右' : '左') : (up ? '上' : '下');
        const source = `${movingSubject(who)}いまのばしょから、${word}へ${amount}歩動く`;
        return { message: `ばしょを ふやす・へらすときは「${source}」のように 書きます`, source, label: 'いまのばしょから 動く' };
      }
      const value = /^[0-9０-９]+$/.test(amount) ? amount : null;
      const example = who.replace(/、$/, '') + (horizontal ? `画面の左下のはしから、右へ${value || 100}歩、上へ（${of}たてのばしょ）歩のばしょへ行く` : `画面の左下のはしから、右へ（${of}よこのばしょ）歩、上へ${value || 50}歩のばしょへ行く`);
      return { message: `ばしょを 決めるときは「${example}」のように 書きます` };
    }
    // ねこを右へ10歩動かす: the part moved is the subject.
    if (!at && /動かす$|うごかす$/.test(rmask)) { at = subjectAt(/^((?:[^、。]+?を、?)?)/); rest = code.slice(at); rmask = mask.slice(at); }
    const proposalSubject = code.slice(0, at).replace(/を(、?)$/, 'は$1');
    // いまの位置から / 〜の位置へ行く: 位置 is written ばしょ.
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
      const source = `${movingSubject(proposalSubject)}${time ? time + '、' : ''}いまのばしょから、${legs.map(([word, amount]) => word + 'へ' + amount + '歩').join('、')}動く`;
      return { message: '画面の 向きへ 動くときは、「いまのばしょから、」を 書きます。れい：' + source, source, label: 'いまのばしょから 動く' };
    }
    // よこ100歩、たて50歩のばしょへ行く / 横100、縦50の位置へ行く / 1秒で横200、縦100の位置へ滑る: the old numbers
    // count from the top-left corner, so the place is written again from the bottom-left corner.
    if (/(?:よこ|たて|横|縦)[^、]+、(?:よこ|たて|横|縦)[^、]+?の(?:ばしょ|場所|位置)(?:へ|に)/.test(rmask) && /(?:行く|いく|動く|うごく|滑る|すべる)$/.test(rmask))
      return { message: '決めた ばしょへ 行くときは、画面の 左下の はしから 数えて「' + MOVE_EXAMPLE_FIXED + '」のように 書きます。ばしょは 部品の まん中で 数えます' };
    if (ichi()) return ichi();
    // 1秒で前へ10歩すべる: the time is written 〇秒かけて.
    if (/(?:滑る|すべる)$/.test(mask))
      return { message: '時間を かけて 動くときは「1秒かけて、前へ10歩進む」のように「〇秒かけて、」を 書きます', source: code.replace(/(?:滑る|すべる)$/, '動く'), label: '時間を かけて 動く' };
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
    if((name==='はし'||name==='端'))throw new AkariError('P205','画面の はしの ことなら、「画面のはし」と 書きます。れい：画面のはしにふれたとき、');
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
        throw new AkariError('P205',`「〜とき」の 中では、だれのことかを「${who}が」と 書きます。れい：${who}が${touchShown(touchTarget(head.text.slice(i+1),symbols))}にふれたとき、`);}
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
  // ドを鳴らす (from ドの音を鳴らす): a bare ド・レ・ミ … that names no data is the name of a sound, as 「ド」 (the check tells when
  // the work has no such sound, I131).
  function solfegeSound(node,symbols,ctx={}){
    if(node?.kind!=='VariableRead'||node.qualifier||!Object.hasOwn(SOLFEGE_HZ,node.name)||dataNameKind(node.name,symbols,ctx)||(ctx.localNames||[]).includes(node.name))return node;
    const literal=exprNode('StringLiteral',{value:node.name}),location=SOURCE_RANGES.get(node);
    if(location)SOURCE_RANGES.set(literal,location);
    return literal;
  }
  const solfegeMessage=note=>`「${note}」は 音の 高さの 名前です。${note}の 音を 出すときは「${SOLFEGE_HZ[note]}Hzの音を0.5秒鳴らす」のように、高さ（Hz）と 時間を 書きます`;
  // ちがったら、/ まちがえたら、/ そうじゃなかったら、: the other branch of もし is そうでなければ、. Looked for in a line of
  // its own (diagnoseSentenceIntent) and right after a もし block, where the line is first read as that もし's other
  // branch (readBlockHead), before 〜たら's three meanings.
  function otherwiseGuidance(code,mask,line){
    const otherwise=surfaceCapture(/^(?:もし、?)?(?:ちがったら|ちがうなら|ちがえば|まちがえたら|まちがったら|まちがいなら|そうじゃなかったら|そうじゃないなら|そうでないとき(?:は)?|ちがう(?:とき|時)(?:は)?)、?(.*)$/d,code,mask);
    return otherwise?sentenceDiagnostic('「もし」の 文に あてはまらない ときに することは、「そうでなければ、」と 書きます',line,[{label:'「そうでなければ、」と 書く',source:'そうでなければ、'+otherwise[0].text}],{kind:'IfStatement'}):null;
  }
  // 「〜にふれなくなったとき」: leaving is waited for inside the touch body. The heading names who touches as it was written;
  // a 名人 text names it in the wait too (its sentences have their subject), with a part of the work as the example
  // when none was written.
  let bareNameLooking=false;
  function touchGoneMessage(phrase,symbols,meijin=false){
    const shown=touchShown(phrase.target),who=phrase.actor?.text||(meijin?(symbols?.project?.components||[]).find(c=>c.name!==phrase.target)?.name||'ねこ':null);
    const heading=(who?who+'が':'')+shown+'にふれたとき、',wait=(meijin?who+'が':'')+shown+'にふれなくなるまで待つ。';
    return `「〜にふれなくなったとき」は ありません。はなれるのを 待つときは、「${heading}」の 中に「${wait}」と 書いて、そのあとに することを 書きます${meijin&&!phrase.actor?'（名人の 本文では、だれが ふれるかを はじめに 書きます）':''}`;
  }
  function readSentenceHeading(code,symbols,previousHeading=null,ctx={}) {
    const protectedCode = surfaceMask(code);
    if(ctx.meijin){const found=readMeijinHeading(code,protectedCode,symbols,ctx);if(found)return found;}
    else{const touch=readTouchHeading(code,protectedCode,symbols);if(touch)return touch;}
    const same = surfaceCapture(/^(.+?)も同じ合図で動き始め、(.*)$/d,code,protectedCode);
    if(same){
      if(!previousHeading)throw new AkariError('P205','「同じ合図」の 前に、「作品を動かしたとき、」や「…がおされたとき、」などの きっかけを 書いてください');
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
        if(!text.startsWith('「')||!text.endsWith('」'))throw new AkariError('P205','キーや 合図の 名前は「 」で かこんで 書きます。れい：「スペース」キーをおすたびに、');const literal=parseExpression(text);if(literal.kind!=='StringLiteral')throw new AkariError('P205','キーや 合図の 名前は、「 」で かこんだ 文字を 1つだけ 書きます。れい：「スペース」キーをおすたびに、');heading.filter=event==='keyDown'?{key:keyName(literal.value)}:{message:literal.value};}return {heading,body:parts[bodyIndex],actor:self?undefined:parts[actorIndex]};}
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
      case 'touchStart':return `${heading.actorRef?.kind==='named'?actor+'が':''}${touchShown(heading.filter?.target??'')}にふれたとき、`;case 'interval':return `${formatExpression(heading.seconds)}ごとに、`;case 'conditionTrue':return `条件（${formatExpression(heading.condition)}）が成り立ったとき、`;default:throw new AkariError('P201','きっかけの 書き方が 分かりません。「作品を動かしたとき、」などの きっかけに してください');}
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
      throw sentenceDiagnostic('動き続ける 文には「画面の」を 書きません。れい：右へ1秒に100歩の速さで動き続ける',line,[{label:'「画面の」を とる',source:canonicalStatementSource(proposal,symbols)}],{kind:'ContinuousRule'});
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
    if(candidates.length!==1)throw sentenceDiagnostic(candidates.length?'だれが 動くのか、速さが どこからなのか 分かりません。動く キャラクターの 名前の あとに「は」を 書いてください。れい：「スペース」キーがおされているあいだ、ねこは前へ1秒に10歩の速さで動き続ける':'ずっと 動きつづけるときは、向きと「〜秒に〜歩の速さで」を 書きます。れい：「スペース」キーがおされているあいだ、前へ1秒に10歩の速さで動き続ける',line,[],{kind:'ContinuousRule',actorRef:ctx.topicActor||{kind:'self'},missing:['speed']});
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
        if (reads) throw new AkariError('P205', `「${who[0].text}」という キャラクターや 部品が 見つかりません。名前を たしかめてください`, line.lineNo, 1);
      }
      const nameMessage = error.message === 'この 名前は【名前】のように【 】で かこんでください';
      // 10歩進んでください / 10歩進め / 10歩進もう / 進んでね: a request or a call is written as 「進む」.
      if (nameMessage) {
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
      const unknown = /(?:^|て、?|で、?|[0-9０-９.．]+(?:歩|度|秒|個|点|番目)?(?:に|へ|を|だけ|間)?)([\p{L}ー]+(?:する|る|う|く|す|つ|む|ぶ|ぐ))$/u.exec(code);
      // A verb of あかり (3回、前へ10歩進む / 3回、右に90度回る) is not said to be missing, and the words before it are no
      // name to put in 【 】: the sentence around the verb is what does not read.
      const known = unknown && (Object.values(MOVE_VERBS).some(verbs => verbs.includes(unknown[1])) || SENTENCE_TE_FORMS.some(([, verb]) => verb === unknown[1]));
      if (nameMessage && known && !dataNameKind(unknown[1], symbols, ctx))
        throw new AkariError('P201', `「${line.code}」は 読めません。書き方を たしかめてください。`, line.lineNo, 1);
      if (nameMessage && unknown && !known && !dataNameKind(unknown[1], symbols, ctx))
        throw new AkariError('P205', `「${unknown[1]}」という 文は あかりに ありません。「書ける ことば」から 近い 文を えらんでください`, line.lineNo, 1);
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
    if(start>=code.length)throw new AkariError('P202','「〜して、」の あとに、つづきの 文を 書いてください。れい：前へ10歩進んで、「やあ」と言う',line.lineNo,1);
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
    const write=body=>{try{return formatScript({kind:'Script',body}).trim().replace(/。$/,'').split('\n').join('\n'+' '.repeat(line.indent||0));}catch{return null;}};
    const together=write(nodes.map((n,i)=>i===at?{...n,actorRef:{kind:'all'}}:n)),only=write(nodes),who=sentenceActorSource(nodes[at].actorRef);
    throw sentenceDiagnostic(`「待って」のあとに ほかの 主語の 文を つづけるときは、文を 分けて 書きます。みんなで 待つのか、${who}だけが 待つのかを えらんでください（みんなで 待つときは「1秒待つ。」、${who}だけが 待つときは「${who}は1秒待つ。」と 書いて、次の 文を 書きます）`,line,
      [...(together?[{label:'みんなで 待ってから つづける',source:together}]:[]),...(only?[{label:`${who}だけが 待つ（ほかは すぐ 動く）`,source:only}]:[])],{kind:'Sequence'});
  }
  // 点数が10になったら (no もし): three meanings, each in the child's words (LANGUAGE.md 読めない書き方): now, once by
  // waiting, or each time (名人's 〜になったとき).
  // The condition of 点数が10になったら (点数が10と同じ), or null when it does not read.
  function becomesCondition(written,symbols,ctx){
    try{return parseCondition(/(?:以上|以下|より大きい|より小さい|と同じ|とちがう|と違う)$/.test(surfaceMask(written))?written:written+'と同じ',symbols,ctx,'plain');}
    catch(error){if(!(error instanceof AkariError))throw error;return null;}
  }
  function becomesMessage(written,symbols,ctx){
    const condition=becomesCondition(written,symbols,ctx);
    const now=condition?'もし'+formatCondition(condition,'if')+'、':'もし〜なら、',wait=condition?formatCondition(condition,'until')+'待つ。':'〜になるまで待つ。';
    return `「${written}になったら、」は、いくつかの 意味に とれます。いま しらべるなら「${now}」、そうなるまで 待つなら「${wait}」、そうなる たびに するなら 名人の本文で「${written}になったとき、」と 書きます`;
  }
  function sentenceDiagnostic(message,line,choices=[],draftRole=null) {
    const error=new AkariError('P205',message,line?.lineNo||0,1),range=sourceRange(line?.mapped?.positions||[]);
    if(choices.length)error.proposals=choices.map(choice=>({...choice,start:range?.start??line?.start??0,end:range?.end??line?.end??0}));
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
  function diagnoseSentenceIntent(line,symbols,ctx,previousLine=null,nextLine=null) {
    const code=line.code,mask=surfaceMask(code);let p;
    const skipRest=/^(.*?は、?)?次のくり返しへ進む$/.exec(mask);
    // A bare はし stays a name, because a part may be called はし (橋, 箸); 端 is no part's name. Bouncing only happens
    // at the stage edge, and a touch test names a part that must exist, so without such a part the child means 画面のはし.
    const bounceForm=/^(?:[^、。]+?は、?)?画面の(?:はし|端)に(?:ふれて|触れて)いれば、?(?:はね返る|跳ね返る)$/;
    const bareEdgeBounce=!bounceForm.test(mask)&&/^(.*?は、?)?(?:もし、?)?(?:はし|端)に(?:ふれ|触れ).*(?:はね返る|跳ね返る)$/.exec(mask);
    if(bareEdgeBounce)throw sentenceDiagnostic('画面の はしで はね返るときは、「画面のはしにふれていれば、はね返る」と 書きます',line,[{label:'画面の はしで はね返る',source:code.slice(0,bareEdgeBounce[1]?.length||0)+'画面のはしにふれていれば、はね返る'}],{kind:'MotionCommand'});
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
      if(both&&both[1]!==both[2]){const one=name=>canonicalStatementSource(name+'は'+both[3],symbols),split=one(both[1])+'。\n'+' '.repeat(line.indent||0)+one(both[2]);
        // A timed action split into sentences runs one subject after the other; say so before the child splits it.
        const timed=/(?:秒(?:間)?かけて|秒(?:間)?(?:話す|はなす|言う|いう|鳴らす|ならす)|を(?:最後まで)?(?:鳴らす|ならす))/.test(surfaceMask(both[3]));
        throw sentenceDiagnostic('1つの 文に 書ける 主語は 1つです。主語ごとに 文を 分けて 書きます'+(timed?'。分けると、書いた じゅんに 一人ずつ 動きます。いっしょに 動かすときは、名人の本文か、同じ きっかけの 別の 本文で 書きます':''),line,parseSyntax(split+'。',{symbols}).ast?[{label:timed?'文を 分ける（じゅんに 動く）':'文を 分ける',source:split}]:[],{kind:'Sequence'});}}
    const knownName=name=>!!dataNameKind(name,symbols,ctx)||[...(ctx.localNames||[])].includes(name);
    // A sentence, a heading or もし (with a body), or a repeat (くり返す。 with a body).
    const reads=source=>{for(const text of [source+'。',source.replace(/、?$/,'、')+'\n  何もしない。',source+'。\n  何もしない。']){try{if(parseSyntax(text,{symbols}).ast)return true;}catch(error){if(!(error instanceof AkariError))throw error;}}return false;};
    // 画面の下にふれていれば / 画面の右にふれたとき: one side of the screen is 画面の下のはし (no part may be named 画面).
    const sideTouch=/(^|もし、?|、|が|は)画面の(上|下|右|左)に(?:ふれ|触れ)/.exec(mask);
    if(sideTouch&&symbols?.project&&namesStage(symbols.project,'画面')){
      const at=sideTouch.index+sideTouch[1].length+3+sideTouch[2].length,source=code.slice(0,at)+'のはし'+code.slice(at),side=sideTouch[2];
      throw sentenceDiagnostic(`画面の ${side}の はしの ことなら、「画面の${side}のはし」と 書きます`,line,reads(source)?[{label:`画面の ${side}の はしに ふれている`,source}]:[]);
    }
    // ── ふれる (decisions §3, C-04 … C-10, C-18, final call 6). Each form below is not read, so the line never reads as
    // written; a fix is offered only when the whole line reads with it.
    {
      // 画面の左下のはし is the corner a place is measured from: the touch is with one of its two sides.
      const corner=/画面の(左|右)(上|下)の(?:はし|端)(?=に(?:ふれ|触れ))/.exec(mask);
      if(corner){const at=corner.index,end=at+corner[0].length,sides=[corner[2],corner[1]].map(side=>code.slice(0,at)+'画面の'+side+'のはし'+code.slice(end));
        throw sentenceDiagnostic(touchCornerMessage(corner[1]+corner[2]),line,sides.filter(reads).map(source=>({label:'「'+/画面の.のはし/.exec(source.slice(at))[0]+'」に する',source})),{kind:'IfStatement'});}
      // 画面のはしにふれたら、はね返る (and ると・れば): はね返る is one sentence, with ふれていれば. ふれていたら is written ふれていれば.
      const bounce=/^(.*?は、?)?(?:もし、?)?画面の(?:はし|端)に(?:ふれ|触れ)(たら|ると|れば|ていたら|ていると)、?(?:はね返る|跳ね返る)$/.exec(mask);
      if(bounce)throw sentenceDiagnostic((bounce[2]==='ていたら'?'「ふれていたら」は「ふれていれば」と 書きます。':'')+'画面の はしで はね返るときは、「画面のはしにふれていれば、はね返る」と 書きます',line,
        [{label:'画面の はしで はね返る',source:code.slice(0,bounce[1]?.length||0)+'画面のはしにふれていれば、はね返る'}],{kind:'MotionCommand'});
      // もし「ねこ」にふれていたら (and ていなかったら): the state is written ふれていれば (ふれていなければ).
      if(/に(?:ふれ|触れ)てい(?:たら|なかったら)/.test(mask)){
        let out='',at=0,first=null;
        for(const m of mask.matchAll(/に(?:ふれ|触れ)てい(たら|なかったら)/g)){out+=code.slice(at,m.index)+'にふれてい'+(m[1]==='たら'?'れば':'なければ');at=m.index+m[0].length;first??={written:'ふれてい'+m[1],fix:m[1]==='たら'?'ふれていれば':'ふれていなければ',end:out.length};}
        const source=out+code.slice(at),head=source.slice(0,first.end),example=(/もし/.test(surfaceMask(head))?head:'もし'+head)+'、';
        throw sentenceDiagnostic(`「${first.written}」は 読みません。「${example}」のように「${first.fix}」と 書きます`,line,reads(source)?[{label:`「${first.fix}」と 書く`,source}]:[],{kind:'IfStatement'});
      }
      // さわる・当たる・ぶつかる are written ふれる (one verb, one meaning); the line is read again with ふれる below.
      let touchCode=code,touchMask=mask,verbNote='';
      const verb=/に(さわ|当た|あた|ぶつか)(っ|る|ら|れ|り)/.exec(mask);
      if(verb&&!knownWords(symbols,ctx).some(name=>name.includes('に'+verb[1]))){
        let out='',at=0;
        for(const m of mask.matchAll(/に(さわ|当た|あた|ぶつか)(っ|る|ら|れ|り)/g)){out+=code.slice(at,m.index)+'に'+{っ:'ふれ',る:'ふれる',ら:'ふれ',れ:'ふれれ',り:'ふれ'}[m[2]];at=m.index+m[0].length;}
        touchCode=out+code.slice(at);touchMask=surfaceMask(touchCode);verbNote=`「${verb[1]}る」は「ふれる」と 書きます。`;
      }
      // 「星」にふれたら・ふれると・ふれれば / もし「星」にふれたら: each time, now, or once by waiting? Three meanings, three
      // forms. The heading is offered only at the left margin; the wait only when the action is on the line.
      // もし「星」にふれたとき: もし and 〜たとき are not written together.
      const word=surfaceCapture(/^(もし、?)?(.+?)に(?:ふれ|触れ)(たら|ると|れば|たとき)、?(.*)$/d,touchCode,touchMask);
      if(word&&(word[2].text!=='たとき'||word[0])&&!/[、。]/.test(surfaceMask(word[1].text))){
        let phrase=null,mouse=false;
        try{phrase=touchPhrase(word[1],symbols);}catch(error){if(!(error instanceof AkariError))throw error;mouse=/^「?マウス」?$/.test(word[1].text);if(mouse)phrase={actor:null,target:'マウス'};}
        if(phrase){
          const shown=(phrase.actor?phrase.actor.text+'が':'')+touchShown(phrase.target),rest=word[3].text,form=word[2].text;
          const each=mouse?null:{label:'ふれる たびに する',source:`${shown}にふれたとき、${rest}`},now={label:'いま ふれているかを しらべる',source:`もし${shown}にふれていれば、${rest}`},
            wait=form!=='たとき'&&rest?{label:'ふれるまで 待つ',source:`${shown}にふれるまで待って、${rest}`}:null;
          // A 名人 heading names who touches, so the heading is offered only in an ordinary body.
          const choices=(word[0]?[now,each,wait]:[each,now,wait]).filter(c=>c&&(c!==each||(!line.indent&&!ctx.meijin))&&reads(c.source));
          const message=form==='たとき'?`「もし」と「〜たとき」は いっしょに 書きません。${mouse?'':`ふれる たびに するなら「${shown}にふれたとき、」、`}いま ふれているかを しらべるなら「もし${shown}にふれていれば、」と 書きます`
            :`「〜にふれ${form}」は、いくつかの 意味に とれます。${mouse?'':`ふれる たびに するなら「${shown}にふれたとき、」、`}いま ふれているかを しらべるなら「もし${shown}にふれていれば、」、ふれるまで 待つなら「${shown}にふれるまで待つ」と 書きます`;
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
    // ドの音を鳴らす is the sound named ド (LANGUAGE.md 音と待機); with no such sound the check gives a notice (I131).
    // 2秒のドの音を鳴らす and the like, with a time, are no sentence of a sound: the tone is written in Hz.
    {const note=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(ド|レ|ミ|ファ|ソ|ラ|シ)(?:の音)?を([0-9０-９.．]+)秒(鳴らす|ならす|鳴らし始める|ならし始める)$/d,code,mask);
      if(note&&!(symbols?.project?.sounds||[]).some(s=>s.name===note[1].text)&&!knownName(note[1].text)){
        const start=/始める$/.test(note[3].text),source=`${note[0].text}${SOLFEGE_HZ[note[1].text]}Hzの音を${note[2].text}秒${start?'鳴らし始める':'鳴らす'}`;
        throw sentenceDiagnostic(solfegeMessage(note[1].text),line,reads(source)?[{label:`${note[1].text}の 高さの 音を 鳴らす`,source}]:[],{kind:'SoundCommand'});}}
    // 1秒から3歩のどれか: the two numbers of どれか take the same unit (F-33).
    {const mixed=/(?<![0-9０-９.．])([0-9０-９.．]+)(歩|秒|度|回|％|番目|Hz|点|個)から([0-9０-９.．]+)(歩|秒|度|回|％|番目|Hz|点|個)の?どれか/.exec(mask);
      if(mixed&&mixed[2]!==mixed[4])throw sentenceDiagnostic(`「${mixed[0]}」は 読めません。「どれか」の 二つの 数には 同じ 単位を 書きます。れい：${mixed[1]}${mixed[2]}から${mixed[3]}${mixed[2]}のどれか`,line,[],{kind:'Sequence'});}
    // ゲームを止める / ゲームを終わる / 全部止める: the whole work stops with 作品を全部止める (F-30).
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(?:(?:ゲーム|げーむ)を(?:止める|とめる|終わる|おわる|終える|おえる|終わりにする|おわりにする)|(?:ゲーム|げーむ|作品|すべて|全部|ぜんぶ)(?:を|が)?(?:終わる|おわる|終える|おえる|終わりにする|おわりにする)|(?:全部|ぜんぶ|みんな|全員)(?:を)?(?:止める|とめる))$/d,code,mask)))
      throw sentenceDiagnostic('作品の 動きを ぜんぶ 止めるときは「作品を全部止める」と 書きます',line,reads('作品を全部止める')?[{label:'作品を 全部 止める',source:'作品を全部止める'}]:[],{kind:'StopCommand'});
    // 「ねこ」に点数を出す (no 文字・ボタン・四角 part) / 点数を画面に出す: the value is shown in a text part (F-31).
    {const shown=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(\u0001+)に(.+)を(?:出す|だす|書く|かく|表示する)$/d,code,mask),name=shown&&/^「([^「」]+)」$/.exec(shown[1].text)?.[1];
      const screen=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(.+)を画面に(?:出す|だす|書く|かく|表示する)$/d,code,mask);
      if((name&&!TEXT_PART_TYPES.includes(symbols?.project?.components?.find(c=>c.name===name)?.type))||screen)
        throw sentenceDiagnostic('画面に 出すときは、「文字」の 部品を おいて「「文字1」に 点数を 出す」と 書きます',line,[],{kind:'LooksCommand'});}
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
          throw sentenceDiagnostic(`音が 鳴り終わってから するときは、「「${/^(?:音楽|音|おんがく|BGM)$/.test(name)?'音楽':name}」を鳴らす。」の 次の 行に 書きます（「鳴らす」は 音が 鳴り終わるまで 待ちます）`,line,[],{kind:'SoundCommand'});}
        if(part(who)&&/^(?:話し|はなし|言い|いい)/.test(verb))
          throw sentenceDiagnostic(ctx.meijin?`名人の 本文では「${who}が話し終わるまで待つ。」と 書いてから、次の 文を 書きます`
            :`「${written}」は 読みません。話し終わってから するときは、同じ 本文で「${who}は「…」と2秒話す。」の 次の 行に 書きます（時間を 書いて 話すと、話し終わるまで 待ちます）。ちがう 部品の 本文なら、話したあとで「「つぎ」の合図を送る。」と 書いて、「「つぎ」という合図を受けたとき、」で 始めます`,line,[],{kind:'Say'});
      }
      {const otherwise=otherwiseGuidance(code,mask,line);if(otherwise)throw otherwise;}
      // はいけいが「夜の森」にかわったとき、: the heading is はいけいがかわったとき、; the name is checked inside it.
      const backdrop=surfaceCapture(/^(?:はいけい|背景)が(.+?)に(?:かわった|変わった)(?:とき|ら)、?(.*)$/d,code,mask);
      if(backdrop){const name=/^「.*」$/.test(backdrop[0].text)?backdrop[0].text:'「'+backdrop[0].text+'」',source='はいけいがかわったとき、'+backdrop[1].text;
        throw sentenceDiagnostic(`はいけいの 名前で 分けるときは、「はいけいがかわったとき、」の 中に「もし新しいはいけいの名前が${name}なら、」と 書きます`,line,!line.indent&&reads(source)?[{label:'「はいけいがかわったとき、」に する',source}]:[],{kind:'Script'});}
      // マウスのボタンをおしている: the button's state is マウスがおされている.
      if(/マウス(?:のボタン)?を(?:おし|押し)て|マウスのボタンが(?:おされ|押され)て/.test(mask)){
        const source=code.replace(/マウス(?:のボタン)?を(?:おし|押し)て|マウスのボタンが(?:おされ|押され)て/g,'マウスがおされて');
        throw sentenceDiagnostic('マウスの ボタンを おしているかは「マウスがおされている」と 書きます',line,reads(source)?[{label:'「マウスがおされている」と 書く',source}]:[],{kind:'Condition'});
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
      for(const c of [...parts].sort((a,b)=>b.name.length-a.name.length)){
        if(!/[にの]$/.test(c.name)||!nameSource(c.name).startsWith('【'))continue;
        const at=mask.search(new RegExp('(?:^|もし、?|[、はがをと])'+c.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=に|の|まで|から)'));
        if(at<0)continue;
        const start=mask.indexOf(c.name,at),source=code.slice(0,start)+'「'+c.name+'」'+code.slice(start+c.name.length);
        if(reads(source))throw sentenceDiagnostic(`「${c.name}」のように「に」や「の」で おわる 部品の 名前は、ふれる 相手や 向く 相手には「「${c.name}」」、だれが するかには【${c.name}】と 書きます`,line,[{label:'「 」で かこむ',source}],{kind:'Sequence'});
      }
      // はし・はな・がまくん written bare before にふれ… (C-10): a name that begins like は or が is not read as the part;
      // in 「 」 it is. Said only when the line does not read as written and reads with the name in 「 」 (the line read
      // as written does not look again).
      for(const c of bareNameLooking?[]:[...parts].sort((a,b)=>b.name.length-a.name.length)){
        const at=mask.search(new RegExp('(?:^|もし、?|[、はがをと])'+c.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=に(?:ふれ|触れ)|の方を向|までのきょり)'));
        if(at<0)continue;
        const start=mask.indexOf(c.name,at),source=code.slice(0,start)+'「'+c.name+'」'+code.slice(start+c.name.length);
        let written;bareNameLooking=true;try{written=reads(code);}finally{bareNameLooking=false;}
        if(!written&&reads(source))throw sentenceDiagnostic(`部品の「${c.name}」は、ふれる 相手や 向く 相手に するときは「「${c.name}」」と「 」で かこんで 書きます`,line,[{label:'「 」で かこむ',source}],{kind:'Sequence'});
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
      const teForm={動く:'動いて',進む:'進んで'};
      let first=null,whole=code;
      // From the last sentence to the first, so the places of the earlier ones still hold.
      for(const clause of [...clauses].reverse()){
        // そのあと上へ5歩動く: a lead word of a later sentence stays in front of it.
        clause.start+=leadOf(mask.slice(clause.start,clause.end)).length;
        const text=code.slice(clause.start,clause.end),plain=clause.pair?text.slice(0,-clause.pair[0].length)+(clause.pair[0]==='行って'||clause.pair[0]==='いって'&&/[へに]いって$/.test(text)?'行く':clause.pair[1]):text;
        const found=removedMoveGuidance(plain);
        if(!found)continue;
        first=found;
        let source=found.source,rewritten=null;
        // 画面の右へ10歩すべる: the verb is fixed first, then the move form.
        if(source&&!reads(source))source=removedMoveGuidance(source)?.source||source;
        if(source){
          rewritten=canonicalStatementSource(source,symbols);
          if(clause.pair){const verb=/(?:動く|進む)$/.exec(rewritten);rewritten=verb?rewritten.slice(0,-2)+teForm[verb[0]]:null;}
        }
        whole=rewritten&&whole!==null?whole.slice(0,clause.start)+rewritten+whole.slice(clause.end):null;
      }
      if(first)throw sentenceDiagnostic(first.message,line,whole&&reads(whole)?[{label:first.label||'書き方を なおす',source:whole}]:[],{kind:'MotionCommand'});
    }
    // 横位置・縦位置 (and マウスの…) are written よこのばしょ・たてのばしょ.
    if(/(?:横|縦)位置/.test(mask)){
      const source=code.replace(/(横|縦)位置/g,(all,axis)=>axis==='横'?'よこのばしょ':'たてのばしょ');
      throw sentenceDiagnostic(`「位置」は 読みません。「${/横位置/.test(mask)?'よこのばしょ':'たてのばしょ'}」と 書きます`,line,reads(source)?[{label:'「ばしょ」と 書く',source:canonicalStatementSource(source,symbols)}]:[]);
    }
    // ねこはおされたとき、 / もしねこは…なら、: inside 〜とき and もし the subject takes が.
    {const inner=actorNamePatterns(symbols).inner.exec(code);
      if(inner&&(inner[1]||/^(?:(?:押|お)され|クリックされ)/.test(inner[3]))){const proposal=(inner[1]||'')+inner[2]+'が'+code.slice(inner[0].length-inner[3].length);
        if(inner[1]?reads(proposal):true)throw sentenceDiagnostic(`${inner[1]?'「もし」の 中':'「〜とき」の 中'}では、だれのことかを「${inner[2]}が」と 書きます`,line,reads(proposal)?[{label:`「${inner[2]}が」と 書く`,source:proposal}]:[],{kind:inner[1]?'IfStatement':'Script'});}}
    // A name with あかりの ことば in it (いのち, ちから, とくてん, 辺の数) is written in 【 】; written bare it is cut into other
    // words. The inputs of the work's procedures are names too (辺の数を6として、…).
    {const names=[...(symbols?.projectVars?.keys?.()||[]),...(symbols?.projectLists?.keys?.()||[]),...[...(symbols?.individualByTargetId?.values?.()||[])].flatMap(d=>[...(d.variables?.keys?.()||[]),...(d.lists?.keys?.()||[])]),...(ctx.localNames||[]),...(ctx.args||[]),
      ...[...(symbols?.actions?.values?.()||[]),...(symbols?.functions?.values?.()||[])].flatMap(d=>d?.args||[])];
      for(const name of [...new Set(names)].sort((a,b)=>b.length-a.length)){if(!nameSource(name).startsWith('【'))continue;const at=mask.indexOf(name);if(at<0)continue;
        // A name that is itself a word of あかり (大きさ, 向き): written bare it is that word (a notice tells of the data).
        if(RESERVED.has(name))continue;
        const bracketed=code.slice(0,at)+'【'+name+'】'+code.slice(at+name.length);
        if(reads(bracketed))throw sentenceDiagnostic(`「${name}」のように あかりの ことばが 入った 名前は、【${name}】と【 】で かこんで 書きます`,line,[{label:'【 】で かこむ',source:canonicalStatementSource(bracketed,symbols)}]);}}
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
      [/^((?:[^、。]+?は、?)?)向きを「?(右|左|上|下)」?に(?:する|かえる|変える)$/d,p=>`${p[0]}画面の${p[1]}を向く`,'キャラクターの 向きを かえるときは、「画面の右を向く」のように 書きます','向きを かえる','MotionCommand',()=>!knownName('向き')],
    ]){
      const parts=surfaceCapture(pattern,code);
      if(parts&&(!when||when(parts.map(part=>part?part.text:''))))throw fixed(message,build(parts.map(part=>part?part.text:'')),label,kind);
    }
    // 右に回る: the angle is needed.
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(右|左)に(?:回る|まわる)$/d,code,mask)))
      throw fixed('回るときは、何度 回るかを 書きます',`${p[0].text}${p[1].text}に90度回る`,'90度 回る','MotionCommand');
    // 右に90度、1秒かけて回る: the time comes first, as in the other timed moves.
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)((?:右|左)(?:に|へ)[^、。]+?度|[^、。]+?度(?:右|左)(?:に|へ))、?([^、。]+?)秒(?:かけて|で)(?:回る|まわる)$/d,code,mask))){
      const source=`${p[0].text}${p[2].text}秒かけて、${p[1].text}回る`;
      if(reads(source))throw fixed('「〇秒かけて、」は 文の はじめに 書きます。れい：'+canonicalStatementSource(source,symbols),source,'時間を はじめに 書く','MotionCommand');
    }
    // 1秒まって / 10歩進んだ: an action is written 〜する.
    {const past=/(?:った|んだ|いた|いだ|した)$/.exec(mask);const te=past?code.slice(0,-past[0].length)+({った:'って',んだ:'んで',いた:'いて',いだ:'いで',した:'して'})[past[0]]:/(?:って|んで|いて|いで|して|えて|めて|げて|せて|れて|ねて|べて|けて)$/.test(mask)?code:null;
      if(te){const plain=sentenceInfinitive(te);if(plain&&plain!==te&&reads(plain))throw fixed(past?'これから する ことは「進む」のように 書きます':'文の おわりは「待つ」のように 書きます',plain,'〜する に する');}}
    // 10歩進みません: what is not done is not written.
    if(/(?:みません|りません|きません|ちません|いません|えません|せません|べません|めません|れません|ぎません|びません)$/.test(mask)||(/しません$/.test(mask)&&!/^何もしません$/.test(mask)))
      throw sentenceDiagnostic('しないことは 書けません。しないときは その文を 書かないか、「何もしない」と 書きます',line,[]);
    // 点数を0にする、点数を1増やす: two actions are joined with 〜して、
    {const join=surfaceCapture(/^(.+?(?:する|す|る|く|う|つ|む|ぶ|ぐ))、(.+)$/d,code,mask);
      if(join){const pair=SENTENCE_TE_FORMS.find(([te,plain])=>join[0].text.endsWith(plain)&&te!=='して');const joined=pair?join[0].text.slice(0,-pair[1].length)+pair[0]+'、'+join[1].text:join[0].text.endsWith('する')?join[0].text.slice(0,-2)+'して、'+join[1].text:null;
        if(joined&&reads(joined))throw fixed('2つの ことを つづけて するときは、「〜して、」で つなぎます',joined,'〜して、で つなぐ');}}
    // 「出発」の合図を送って、（全部）終わるまで待つ
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(.+?)の合図を送って、?(?:それが|みんなが)?(?:全部|ぜんぶ|すべて|みんな)?終わるまで待つ$/d,code,mask)))
      throw fixed('合図で 始まったことが 終わるまで 待つときは、「その合図で始まったことが全部終わるまで待つ」と 書きます',`${p[0].text}${p[1].text}の合図を送って、その合図で始まったことが全部終わるまで待つ`,'終わるまで 待つ','BroadcastAndWait');
    // 「開始」と知らせ、受け手の処理が終わるまで待つ (an old form) / その合図で始まったことが終わるまで待つ (no 全部) /
    // ねこはその合図で…待つ (that line always waits with the whole flow).
    if((p=surfaceCapture(/^(.+?)と知らせ、受け手の処理が終わるまで待つ$/d,code,mask)))
      throw fixed('合図で 始まったことが 終わるまで 待つときは、「その合図で始まったことが全部終わるまで待つ」と 書きます',`${p[0].text}の合図を送って、その合図で始まったことが全部終わるまで待つ`,'終わるまで 待つ','BroadcastAndWait');
    {const group=/^(?:(.+?)(?:は|が|も)、?)?その合図で始まったことが((?:全部|ぜんぶ|すべて)?)終わるまで待つ$/.exec(code),who=group?.[1];
      if(group&&(!group[2]||(who&&!EVERYONE_WORDS.includes(who))))
        throw sentenceDiagnostic(who&&!EVERYONE_WORDS.includes(who)?'この 文は、いつも みんなで 待ちます。だれが 待つかは 書かずに「その合図で始まったことが全部終わるまで待つ」と 書きます':'「その合図で始まったことが全部終わるまで待つ」と 書きます',line,[{label:'書きかえる',source:'その合図で始まったことが全部終わるまで待つ'}],{kind:'WaitBroadcastGroup'});}
    // ベルを鳴らす / スタートの合図を送る: a sound's or signal's name is written in 「 」.
    {const sound=/^(?:(.+?)は、?)?(.+?)(?:の音)?を(?:鳴らす|ならす|鳴らし始める|ならし始める|最後まで鳴らす)$/.exec(code),signal=/^(?:(.+?)は、?)?(.+?)の合図を送(?:る|って.+)$/.exec(code);
      const bare=name=>name&&!/^[「【（]/.test(name)&&!dataNameKind(name,symbols,ctx)&&/^[\p{L}ー0-9０-９]+$/u.test(name);
      // ドの音を鳴らす is read as the sound named ド (LANGUAGE.md 音と待機), so a ドレミ name is not sent to 「 」.
      if(sound&&bare(sound[2])&&!Object.hasOwn(SOLFEGE_HZ,sound[2])&&(symbols?.project?.sounds||[]).some(s=>s.name===sound[2]))throw fixed('音の 名前は「 」で かこんで 書きます',code.replace(sound[2],'「'+sound[2]+'」'),'「 」で かこむ','SoundCommand');
      if(signal&&bare(signal[2]))throw fixed('合図の 名前は「 」で かこんで 書きます',code.replace(signal[2]+'の合図','「'+signal[2]+'」の合図'),'「 」で かこむ','Broadcast');}
    // ゴールに着いたら、: reaching a part is touching it, and 〜たら has the three meanings of 〜にふれたら (C-09): each time
    // (the heading, offered at the left margin of an ordinary body), now (もし…ていれば) or once by waiting (offered when
    // the action is on this line). With もし written, its meaning (now) comes first. A choice is offered only when it
    // reads. ねこがゴールに着いたら: ねこ is who touches (as in ふれたら); a 名人 text writes who touches in every form.
    const reached=text=>{const name=text.text.replace(/^「(.*)」$/,'$1');let phrase=null;
      if(/^(?:画面の)?(?:はし|端)$/.test(name))phrase={actor:null,target:'端'};
      else try{phrase=touchPhrase(text,symbols);}catch(error){if(!(error instanceof AkariError))throw error;}
      phrase||={actor:null,target:name};
      const target=touchShown(phrase.target),who=phrase.actor?.text||(ctx.meijin?(symbols?.project?.components||[]).find(c=>c.name!==phrase.target)?.name||'ねこ':null);
      return {target,shown:(who?who+'が':'')+target,note:ctx.meijin&&!phrase.actor?'（名人の 本文では、だれが ふれるかを はじめに 書きます）':'',sure:!ctx.meijin||!!phrase.actor};};
    if((p=surfaceCapture(/^(もし、?)?(.+?)に(?:着|つ)(?:いたら|くと|けば|いた(?:とき|時))、?(.*)$/d,code,mask))&&!/[、。]/.test(surfaceMask(p[1].text))){
      const {target,shown,note,sure}=reached(p[1]),rest=p[2].text;
      const each={label:'ふれる たびに する',source:`${shown}にふれたとき、${rest}`},now={label:'いま ふれているかを しらべる',source:`もし${shown}にふれていれば、${rest}`},
        wait=rest?{label:'ふれるまで 待つ',source:`${shown}にふれるまで待って、${rest}`}:null;
      const choices=(p[0]?[now,each,wait]:[each,now,wait]).filter(c=>c&&sure&&(c!==each||(!line.indent&&!ctx.meijin))&&reads(c.source));
      throw sentenceDiagnostic(`${target}に 着くのは、${target}に ふれることです。ふれる たびに するなら「${shown}にふれたとき、」、いま ふれているかを しらべるなら「もし${shown}にふれていれば、」、ふれるまで 待つなら「${shown}にふれるまで待つ」と 書きます${note}`,line,
        choices,{kind:'IfStatement',missing:['touchMeaning']});
    }
    // 「ゴール」に着くまで待つ / 着くまで、くり返す: the same touch, written ふれるまで.
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(.+?)に(?:着|つ)くまで(、?.*)$/d,code,mask))&&!/[、。]/.test(surfaceMask(p[1].text))){
      const {target,shown,note,sure}=reached(p[1]),source=p[0].text+shown+'にふれるまで'+p[2].text;
      throw sentenceDiagnostic(`${target}に 着くのは、${target}に ふれることです。「${shown}にふれるまで」と 書きます${note}`,line,sure&&reads(source)?[{label:'「ふれるまで」と 書く',source}]:[],{kind:'Condition'});
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
      throw sentenceDiagnostic('画面の はしに 来たかを しらべるときは「もし画面のはしにふれていれば、」と 書きます',line,
        reads(source)?[{label:'画面の はしに ふれているか しらべる',source:source}]:[],{kind:'IfStatement'});
    }
    // 画面の外へ出る: no sentence does that; the part moves past the edge and is hidden.
    if(/^(?:[^、。\u0001]+?は、?)?(?:[^、。]+?秒(?:かけて|で)、?)?画面の(?:外|そと)(?:へ|に)(?:出る|でる|出ます|でます|出ていく|でていく|出て行く|行く|いく|飛び出す|とび出す|とびだす)$/.test(mask))
      throw sentenceDiagnostic('画面の 外へ 出る 文は ありません。画面の はしの 外まで 動いてから、すがたを かくします。れい：「2秒かけて、いまのばしょから、右へ800歩動く。」と 書いて、次に「すがたをかくす。」と 書きます',line,[],{kind:'MotionCommand'});
    // 「いぬ」のところへ動く / 「いぬ」のところへ1秒かけて行く / 画面のまん中のところへ行く: the readable sentence, with the
    // fix when the place is a part, the mouse or a place of the screen.
    if(/のところ(?:へ|に)/.test(mask)&&(p=surfaceCapture(new RegExp('^((?:[^、。\\u0001]+?は、?)?)(?:(.+?)'+MOVE_TIME+'、?)?(.+?)のところ(?:へ|に)(?:、?(.+?)'+MOVE_TIME+')?('+[...MOVE_VERBS.here,...MOVE_VERBS.part].join('|')+')$','d'),code,mask))){
      const [who,before,target,after,verb]=p,name=target.text.replace(/^「(.*)」$/,'$1'),screen=screenPlaceSource(surfaceMask(target.text),symbols);
      if(screen||after||!MOVE_VERBS.part.includes(verb.text)){
        const found=partPlaceGuidance(target.text,(before||after)?.text,verb.text,!!after,symbols),source=who.text+found.source;
        const known=screen||name==='マウス'||symbols?.project?.components?.some(c=>c.name===name);
        throw sentenceDiagnostic(found.message,line,known&&reads(source)?[{label:found.label,source:canonicalStatementSource(source,symbols)}]:[],{kind:'MotionCommand'});
      }
    }
    // 点数が10になったら、 (no もし): waiting or checking is not decided; 10歩進んだら、1秒待つ: an order is 「〜して、」.
    // The body is written below, so only the もし line is proposed (a wait cannot hold the body).
    if(!/^もし/.test(mask)&&(p=surfaceCapture(/^(.+?)になったら、?$/d,code,mask))){
      const condition=becomesCondition(p[0].text,symbols,ctx);
      throw sentenceDiagnostic(becomesMessage(p[0].text,symbols,ctx),line,condition?[{label:'いま そうなっていたら する',source:'もし'+formatCondition(condition,'if')+'、'}]:[],{kind:'IfStatement',missing:['mode']});
    }
    {const after=/^(?!もし)([^、。]+?)(んだら|ったら|いたら|いだら|したら|えたら|けたら|めたら|れたら|せたら|ねたら|てたら)、(.+)$/.exec(mask);
      if(after){const head=code.slice(0,after[1].length),rest=code.slice(after[1].length+after[2].length+1),te=head+after[2].replace(/たら$/,'て').replace(/だら$/,'で')+'、'+rest;
        if(reads(te))throw fixed(ctx.meijin?'「〜したら、」は 読みません。じゅんに するときは「〜して、」で つなぎます。そう なるのを 待つときは「〜になったら、」と 書きます':'「〜たら」は「もし」の 文で 使います。じゅんに するときは「〜して、」で つなぎます',te,'「〜して、」で つなぐ','Sequence');}}
    // ゆっくり10歩進む (ゆっくり10 was read as a name): slowly is a time to take.
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(?:(前|後ろ|右|左|上|下)(?:へ|に))?ゆっくり(?:と)?(?:(前|後ろ|右|左|上|下)(?:へ|に))?([0-9０-９.．]+)歩(?:進む|すすむ|動く|うごく|歩く|あるく)$/d,code,mask))){
      const way=p[1]?.text||p[2]?.text||'前',facing=['前','後ろ'].includes(way),slow=`${p[0].text}1秒かけて、${facing?'':'いまのばしょから、'}${way}へ${p[3].text}歩${way==='前'?'進む':'動く'}`;
      throw fixed(`ゆっくり 動くときは、「${canonicalStatementSource(slow,symbols)}」のように かける 時間を 書きます`,slow,'時間を かけて 動く','MotionCommand');
    }
    // ゆっくりいまのばしょから、… / ゆっくり「ロケット」のところへ行く / ゆっくり右に90度回る: the same, with the time first.
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)ゆっくり(?:と)?、?(.+)$/d,code,mask))&&!/秒(?:かけて|で)/.test(surfaceMask(p[1].text))&&
      /(?:動く|うごく|進む|すすむ|歩く|あるく|行く|いく|回る|まわる)$/.test(mask)&&reads(p[0].text+'1秒かけて、'+p[1].text)){
      // The example is the child's own sentence with the time, so it names the kind of move that was written.
      const slow=p[0].text+'1秒かけて、'+p[1].text,turn=/(?:回る|まわる)$/.test(mask);
      throw fixed(`ゆっくり ${turn?'回る':'動く'}ときは、「${canonicalStatementSource(slow,symbols)}」のように かける 時間を 書きます`,slow,turn?'時間を かけて 回る':'時間を かけて 動く','MotionCommand');
    }
    // 2秒かけてゆっくり10歩動く / ゆっくり1秒待つ: the time already says how slowly; ゆっくり is not written.
    if((p=surfaceCapture(/^(.*?)ゆっくり(?:と)?、?(.*(?:秒|歩).*)$/d,code,mask))&&/(?:秒かけて|秒(?:間)?(?:待つ|まつ)$)/.test(surfaceMask(code))&&reads(p[0].text+p[1].text))
      throw fixed('かける 時間を 書いたときは、「ゆっくり」は 書きません',p[0].text+p[1].text,'「ゆっくり」を けす','MotionCommand');
    // ねこ1秒待つ / ねこ10歩進む (no は): a part's name followed by a number was read as one name 「ねこ1」.
    {const part=actorNamePatterns(symbols).partNames.find(name=>code.startsWith(name)&&/^[0-9０-９]/.test(code.slice(name.length)));
      const digits=part&&/^[0-9０-９]+/.exec(code.slice(part.length))[0];
      if(part&&!dataNameKind(part+digits,symbols,ctx)&&reads(part+'は'+code.slice(part.length)))
        throw fixed(`だれが するかを 書くときは、名前の あとに「は」を 書きます。れい：${part}は…`,part+'は'+code.slice(part.length),'「は」を 書く','Sequence');}
    // 全部1秒待つ / 全員が1秒待つ: the whole flow's wait has no subject (or みんなは).
    if((p=surfaceCapture(/^(?:全部|ぜんぶ|全員|すべて)(?:が|は|で|も)?、?(.+(?:待つ|まつ))$/d,code,mask))&&reads(p[0].text))
      throw fixed('みんなで 待つときは、「みんなは1秒待つ」か「1秒待つ」と 書きます',p[0].text,'みんなで 待つ','WaitTime');
    // 「ベル」を鳴らし、終わるまで待つ (an old form): 鳴らす itself waits until the sound ends.
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(.+?)を(.*?)鳴らし(?:て)?、?(?:鳴り)?終わるまで待つ$/d,code,mask)))
      throw fixed('「鳴らす」は、音が 終わるまで 待ちます',`${p[0].text}${p[1].text}を${p[2].text}鳴らす`,'鳴らして 待つ','SoundCommand');
    // 10歩進みました: what to do is written as 〜する or 〜します.
    if(/ました$/.test(mask))throw sentenceDiagnostic('これから する ことは「進む」「進みます」のように 書きます',line,[{label:'「ます」に する',source:canonicalStatementSource(code.slice(0,-3)+'ます',symbols)}]);
    // 大きさを10増やす: the size is set as a percentage.
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(大きさ|音の大きさ)を([0-9０-９.．]+)％?(増やす|ふやす|減らす|へらす)$/d,code,mask))&&!knownName(p[1].text)){
      const sign=/増|ふ/.test(p[3].text)?'＋':'－';
      throw fixed(`${p[1].text}は「${p[1].text}を120％にする」のように、何％に するかを 書きます`,`${p[0].text}${p[1].text}を（${p[1].text}${sign}${p[2].text}）％にする`,'計算して かえる',p[1].text==='大きさ'?'LooksCommand':'SoundCommand');
    }
    // 「点数は」と点数を言う: two things said together are joined.
    if((p=surfaceCapture(/^((?:[^、。\u0001]+?は、?)?)(\u0001+)と([^\u0001、。]+?)を(?:つなげて)?(?:([^、。\u0001]+?)秒(?:間)?)?(?:つなげて)?(?:言う|いう|話す|はなす)$/d,code,mask))&&p[1].text.startsWith('「')&&(p[3]||!mask.includes('つなげて')))
      throw fixed('2つを ならべて 言うときは、「つなげて言う」と 書きます',p[3]?`（${p[1].text}と${p[2].text}をつなげた文字）を${p[3].text}秒話す`:`${p[0].text}${p[1].text}と${p[2].text}をつなげて言う`,'つなげて 言う','Say');
    // もしねこがおされたら: a click starts with its own heading.
    if((p=surfaceCapture(/^もし、?(.+?)が(?:おされ|押され|クリックされ)(?:たら|ていれば|ているなら|れば|ると)、?$/d,code,mask))){
      const who=p[0].text.replace(/^「(.*)」$/,'$1');
      if(symbols?.project?.components?.some(c=>c.name===who))throw sentenceDiagnostic(`「${who}」が おされた ときに 動かすときは、「${who}がおされたとき、」で 始めます`,line,[{label:'おされたときに 動かす',source:`${who}がおされたとき、`}],{kind:'IfStatement'});
    }
    if(skipRest)throw sentenceDiagnostic('この回の のこりを とばして 次の回へ 進むときは、「この回の残りをとばして、次の回へ進む」と 書きます',line,[{label:'この回の のこりを とばして 次の回へ',source:code.slice(0,skipRest[1]?.length||0)+'この回の残りをとばして、次の回へ進む'}],{kind:'Continue'});
    if((p=surfaceCapture(/^(.+?)キーを(?:おして|押して)いる(?:あいだ|間)、(.+?)は(.+?)歩(?:動く|うごく)$/d,code,mask))){
      const key=p[0].text.startsWith('「')?p[0].text:`「${p[0].text}」`,actor=p[1].text,distance=p[2].text;
      throw sentenceDiagnostic('キーを おしている あいだに 動く 歩数が、ぜんぶで 何歩なのか、1秒に 何歩なのか 分かりません。えらんでください',line,[
        {label:`おす たびに ぜんぶで ${distance}歩`,source:`${key}キーをおすたびに、${actor}は、前へ${distance}歩進む`},
        {label:`おしている あいだ、1秒に ${distance}歩`,source:`${key}キーがおされているあいだ、${actor}は前へ1秒に${distance}歩の速さで動き続ける`},
      ],{kind:'ContinuousRule',missing:['distanceOrSpeed']});
    }
    if((p=surfaceCapture(/^もし(.+で)、(.+)か、(.+なら)、?$/d,code,mask))){
      const a=parseCondition(p[0].text,symbols,ctx,'and'),b=parseCondition(p[1].text,symbols,ctx,'plain'),c=parseCondition(p[2].text,symbols,ctx,'if');
      const logical=(op,left,right)=>exprNode('LogicalExpression',{op,left,right}),render=n=>'もし条件（'+formatExpression(n)+'）が成り立つなら、';
      throw sentenceDiagnostic('「両方」と「どちらか」の まとまりが 分かりません。どちらの 意味か えらんでください',line,[
        {label:'前の 2つが 両方、または さいごの 1つ',source:render(logical('OR',logical('AND',a,b),c))},
        {label:'1つ目と、「後ろの 2つの どちらか」の 両方',source:render(logical('AND',a,logical('OR',b,c)))},
      ],{kind:'LogicalExpression',missing:['grouping']});
    }
    if((p=surfaceCapture(/^(.+?)になったら、(.+)$/d,code,mask))){
      let raw=p[0].text;
      if(!/(?:以上|以下|より大きい|より小さい|と同じ|とちがう|と違う)$/.test(surfaceMask(raw)))raw+='と同じ';
      const condition=parseCondition(raw,symbols,ctx,'plain'),body=p[1].text,indent=' '.repeat(line.indent||0);
      // The wait is the one the message names (点数が10になるまで待つ): when it is so already, it does not wait.
      throw sentenceDiagnostic(becomesMessage(p[0].text,symbols,ctx),line,[
        {label:'いま そうなっていたら する',source:`もし${formatCondition(condition,'if')}、${body}`},
        {label:'そうなるのを 待ってから する',source:`${formatCondition(condition,'until')}待つ。\n${indent}${body}`},
      ],{kind:'Condition',missing:['stateOrTransition']});
    }
    if((p=surfaceCapture(/^(それ|これ|あれ|その子)を(.+(?:動かす|うごかす))$/d,code,mask))){
      const names=(symbols?.project?.components||[]).map(component=>component.name);
      throw sentenceDiagnostic('「それ」などでは、だれを 動かすのか 分かりません。動かす キャラクターの 名前を えらんでください',line,names.map(name=>({label:`${name}を 動かす`,source:canonicalStatementSource(`${nameSource(name)}を${p[1].text}`,symbols)})),{kind:'MotionCommand',missing:['actorRef']});
    }
    if((p=surfaceCapture(/^(右|左)に曲がる$/d,code,mask))&&previousLine&&nextLine){
      const count=surfaceCapture(/^(.+)回(?:くり返す|繰り返す|くりかえす)$/d,nextLine.code);
      if(count){const turn=`${p[0].text}に〔角度をえらぶ〕度回る`,first=previousLine.code,amount=count[0].text,indent=' '.repeat(line.indent||0),error=sentenceDiagnostic('進むと 回るの、どこまでを くり返すのか 分かりません。えらんでください',line,[
        {label:'進む・回るの 両方を くり返す',source:`${amount}回くり返す。\n${indent}  ${first}。\n${indent}  ${turn}`},
        {label:'進むのは 一度、回るだけを くり返す',source:`${first}。\n${indent}${amount}回くり返す。\n${indent}  ${turn}`},
      ],{kind:'RepeatCount',missing:['scope','angle']});const firstRange=sourceRange(previousLine.mapped.positions),lastRange=sourceRange(nextLine.mapped.positions);for(const proposal of error.proposals){proposal.start=firstRange.start;proposal.end=lastRange.end;}throw error;}
    }
  }
  // 「「海」は何と読みますか」と言う: a かぎ inside a かぎ ends the outer one (final call 12). Inside 「 」 a quote is written
  // 『 』; the fix turns the inner pairs into 『 』 when the line then reads.
  function nestedQuoteDiagnostic(line,symbols){
    const raw=line.raw,stack=[],inner=[];let max=0,first=-1,last=-1;
    for(let i=0;i<raw.length;i++){const ch=raw[i];
      if(stack.length&&ch==='\\'){i++;continue;}
      if(!stack.length){if(ch==='※')break;if(ch==='【'||ch==='『'){const end=raw.indexOf(ch==='【'?'】':'』',i+1);if(end<0)return null;i=end;continue;}}
      if(!/\s/.test(ch)){if(first<0)first=i;last=i;}
      if(ch==='「'){stack.push(i);max=Math.max(max,stack.length);}
      else if(ch==='」'&&stack.length){const open=stack.pop();if(stack.length)inner.push(open,i);}
    }
    if(stack.length||max<2||first<0)return null;
    const text=raw.slice(first,last+1).split(''),at=new Set(inner.map(i=>i-first));
    for(const i of at)text[i]=text[i]==='「'?'『':'』';
    const fixed=text.join(''),error=new AkariError('P205','「 」の 中で かぎを 使うときは、『 』を 使います。れい：「『海』は何と読みますか」と言う',line.lineNo,1);
    let reads=false;try{reads=!!parseSyntax(fixed.replace(/。?$/,'。'),{symbols}).ast;}catch(attempt){if(!(attempt instanceof AkariError))throw attempt;}
    if(reads)error.proposals=[{label:'中の かぎを『 』に する',source:fixed.replace(/。$/,''),start:line.start+first,end:line.start+last+1-(raw[last]==='。'?1:0)}];
    return error;
  }
  function parseScript(source, symbols, ctx = {}) {
    if(typeof source!=='string'||cpLen(source)>LIMITS.sourceEach)throw new AkariError('P208','文字が多すぎて、これ いじょうは 書けません。文を 短くするか、ほかの 動きに 分けてください',1,1);
    const physical=normalizeSource(source).lines,headings=[];
    for(const line of physical){if(line.continuation)continue;const nested=nestedQuoteDiagnostic(line,symbols);if(nested)throw nested;}
    let previousHeading=null,headingError=null;
    for(const line of physical){
      if(line.continuation||!line.code||/^[ \t\u3000]/u.test(line.raw))continue;
      const code=line.mapped.text,mask=surfaceMask(code);let start=0,inLine=false;
      for(let i=0;i<=mask.length;i++)if(i===mask.length||mask[i]==='。'){
        if(i>start){let found=null;try{found=readSentenceHeading(code.slice(start,i),symbols,previousHeading,ctx);}catch(error){if(!(error instanceof AkariError))throw error;if(!error.line){error.line=line.lineNo;error.column=1;}headingError??=error;}
          if(found){headings.push({start:line.mapped.positions[start],lineNo:line.lineNo,columnOffset:line.mapped.positions[start]-line.start,previousHeading});previousHeading=found.heading;inLine=true;}}
        start=i+1;
      }
      // 名人: a sentence at the left margin after a heading's lines is not that heading's; it starts when the work is run.
      if(ctx.meijin&&!inLine&&headings.length&&!headings[headings.length-1].plain)
        headings.push({start:line.mapped.positions[0],lineNo:line.lineNo,columnOffset:line.mapped.positions[0]-line.start,previousHeading:null,plain:true});
    }
    const firstCode=physical.find(line=>!line.continuation&&line.code),hasPrefix=headings.length&&headings[0].start!==firstCode?.start;
    // A line whose heading could not be read is read again in its turn; when nothing before it fails, its error is given.
    if(headingError){try{parseScriptUnits(source,symbols,ctx,physical,headings,firstCode,hasPrefix);}catch(error){if(error instanceof AkariError&&(error.line||Infinity)<headingError.line)throw error;}throw headingError;}
    return parseScriptUnits(source,symbols,ctx,physical,headings,firstCode,hasPrefix);
  }
  function parseScriptUnits(source,symbols,ctx,physical,headings,firstCode,hasPrefix) {
    if(headings.length<=1&&!hasPrefix)return parseScriptUnit(source,symbols,ctx);
    if(ctx.definitionKind||ctx.definition)throw new AkariError('P205','自分で 作った ブロックの 中には、「作品を動かしたとき、」などの きっかけは 書けません',headings[0].lineNo,1);
    const starts=[{start:0,lineNo:1},...headings.slice(hasPrefix?0:1)];
    if(starts.length>LIMITS.scripts)throw new AkariError('P208','見出しが 多すぎて、これ いじょう ふやせません。いらない 見出しの 本文を けしてください',1,1);
    const units=starts.map((entry,index)=>{
      const end=starts[index+1]?.start??source.length,text=source.slice(entry.start,end);let unit;
      try{unit=parseScriptUnit(text,symbols,{...ctx,previousHeading:entry.previousHeading});}catch(error){if(error instanceof AkariError)error.line=(error.line||1)+entry.lineNo-1;throw error;}
      const pending=[unit],shift=entry.lineNo-1;
      while(pending.length){
        const node=pending.pop();
        if(node.sourceSpan){if(node.sourceSpan.startLine===1)node.sourceSpan.startColumn+=entry.columnOffset||0;if(node.sourceSpan.endLine===1)node.sourceSpan.endColumn+=entry.columnOffset||0;node.sourceSpan.startLine+=shift;node.sourceSpan.endLine+=shift;}
        if(node.endLine)node.endLine+=shift;
        const location=SOURCE_RANGES.get(node);
        if(location){const move=value=>{if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){if(['start','end','at'].includes(key)&&typeof child==='number')value[key]=child+entry.start;else if(child&&typeof child==='object')move(child);}};move(location);}
        for(const child of Object.values(node))if(Array.isArray(child))pending.push(...child.filter(value=>value?.kind));else if(child?.kind)pending.push(child);
      }
      SOURCE_RANGES.set(unit,{...SOURCE_RANGES.get(unit),range:{start:entry.start,end},extent:{start:entry.start,end},indent:0,inline:false});
      return unit;
    });
    const document={...units[0],units:units.slice(1),source,sourceSpan:{startLine:1,startColumn:1,endLine:physical.length,endColumn:1}};
    if(symbols)FORMAT_SYMBOLS.set(document,symbols);
    SOURCE_RANGES.set(document,SOURCE_RANGES.get(units[0]));return document;
  }
  // 行のはじめ (F-24): a full-width space counts as two small spaces (整える writes small ones); a Tab is refused. A line
  // moved right with no もし or くり返す around it is told to line up with the line before it.
  const INDENT_TAB_MESSAGE='Tabキーでは 行の はじめを ずらせません。スペースキーで 空白を 2つ 入れます。';
  function indentWidth(prefix){return prefix.length+(prefix.match(/\u3000/gu)||[]).length;}
  function parseScriptUnit(source, symbols, ctx = {}) {
    if(typeof source!=='string'||cpLen(source)>LIMITS.sourceEach)throw new AkariError('P208','文字が 多すぎて、これ いじょうは 書けません。文を 短くするか、ほかの 動きに 分けてください',1,1);
    const rawLines=normalizeSource(source).lines,lines=[];
    for(const line of rawLines){if(line.continuation)continue;const prefix=line.raw.match(/^[ \t\u3000]*/u)[0];if(prefix.includes('\t'))throw new AkariError('P209',INDENT_TAB_MESSAGE,line.lineNo,1);line.indent=indentWidth(prefix);const code=compactOutsideString(line.code);if(!code){lines.push(line);continue;}const mask=surfaceMask(code);let start=0;for(let i=0;i<=mask.length;i++)if(i===mask.length||mask[i]==='。'){if(i>start){const part=surfaceLineSlice(line,start,i);part.indent=line.indent;part.inline=start>0;part.comment=i===mask.length?line.comment:'';lines.push(unitRangeLine(part));}start=i+1;}}
    const baseCtx={...ctx,localNames:[...(ctx.localNames||[])],binders:[...(ctx.binders||[])],topicActor:{...(ctx.topicActor||{kind:'self'})}};
    if(ctx.definition){const names=localDeclarationNames(source);baseCtx.localNames.push(...names.vars,...names.lists);baseCtx.localVarNames=[...names.vars];for(const line of lines){const p=surfaceCapture(/^この中だけで使う(?:変数|リスト)(.+?)を(?:作り、最初は.+にする|空で作る)$/d,line.code);if(p)baseCtx.localNames.push(parsedDeclarationName(p[0].text));}}
    const nextCode=i=>{while(i<lines.length&&!lines[i].code)i++;return i;};
    const parseAt=(line,fn)=>{try{return fn();}catch(error){if(error instanceof AkariError){sentenceReadError(error,line);if(!error.line){error.line=line.lineNo;error.column=error.column||1;}}throw error;}};
    let first=nextCode(0),heading=null,headingActorRange=null,headingTargetRange=null;
    if(first<lines.length&&lines[first].indent!==0)throw new AkariError('P209','いちばん 外の 文は、行の はじめを 右へ ずらさずに 書きます',lines[first].lineNo,1);
    if(first<lines.length){const found=parseAt(lines[first],()=>readSentenceHeading(lines[first].code,symbols,ctx.previousHeading,ctx));if(found){heading=found.heading;const line=lines[first];if(ctx.meijin&&found.bodyTopic)baseCtx.topicActor={...found.bodyTopic};if(ctx.meijin&&found.body?.text){const who=/^(【[^】]+】|[^、。「」【】\s]+?)は、(.*)$/.exec(found.body.text),bare=who&&who[1].replace(/^【(.*)】$/,'$1');if(who&&((symbols?.project?.components||[]).some(c=>c.name===bare)||dataNameKind(bare,symbols,ctx)==='variable')){baseCtx.topicActor=dataNameKind(bare,symbols,ctx)==='variable'?{kind:'value',value:exprNode('VariableRead',{name:bare,qualifier:null})}:{kind:'named',name:bare};found.body={...found.body,text:who[2],start:found.body.end-who[2].length};}}if(found.actor)headingActorRange=sourceRange(line.mapped?.positions||[],found.actor.start,found.actor.end);if(found.target)headingTargetRange=sourceRange(line.mapped?.positions||[],found.target.start,found.target.end);if(found.body.text){const body=surfaceLineSlice(line,found.body.start,found.body.end);const following=lines.find((entry,index)=>index>first&&entry.lineNo!==line.lineNo&&entry.code);const headingIndent=following?.indent>0?following.indent:2;body.indent=headingIndent;body.comment=line.comment;lines.splice(first,1,body);for(let j=first+1;j<lines.length&&lines[j].lineNo===line.lineNo;j++)lines[j].indent=headingIndent;}else lines.splice(first,1);first=nextCode(first);if(first<lines.length&&lines[first].indent===0)throw new AkariError('P202','「作品を動かしたとき、」などの 次の 行は、行の はじめを 右へ ずらして 書きます',lines[first].lineNo,1);}}
    const rules=[];
    function block(start,indent,scope,depth){
      if(depth>LIMITS.blockDepth)throw new AkariError('P208','「もし」や「くり返す」の 中に、ブロックが 重なりすぎています。いくつかの 動きに 分けてください',lines[start]?.lineNo||1,1);
      // 名人: each line of a 並び starts from the subject before the 並び (the lines run side by side, R15).
      const laneTopic=scope.laneTopic;
      scope={...scope,topicActor:{...scope.topicActor},laneTopic:undefined};
      const nodes=[];let i=start,previousSentenceStart=null,tagLine=-1;
      // Each statement remembers the sentence it was read from (名人: one sentence is one lane).
      // Only the statements added since the last call are new (the list is only appended to, or cut at its end).
      let tagged=0;
      const tag=()=>{if(tagged>nodes.length)tagged=nodes.length;for(;tagged<nodes.length;tagged++){const n=nodes[tagged];if(!STATEMENT_LINE.has(n))STATEMENT_LINE.set(n,tagLine);}};
      while(i<lines.length){tag();tagLine=i;const line=lines[i];if(laneTopic)scope.topicActor={...laneTopic};if(!line.code){if(line.comment)nodes.push(statementNode('CommentLine',line,{text:line.comment.slice(1),raw:line.raw,actorRef:{...scope.topicActor}}));i++;continue;}if(line.indent<indent)break;if(line.indent>indent)throw new AkariError('P209',depth===0?'前の 行と 同じ だけ 右へ ずらします。この 行の はじめの 空白を へらしてください。':'同じ まとまりの 文は、行の はじめの 空白の 数を そろえてください',line.lineNo,1);
        const local={...scope,sourceLine:line,lineNo:line.lineNo};
        if(scope.meijin){
          const read=parseAt(line,()=>readMeijinLine(line,{symbols,scope:local,lines,top:depth===0,index:i,indent,nextCode,children:(at,childScope)=>block(at,lines[at].indent,childScope,depth+1)}));
          if(read?.rewrite){lines[i]=read.rewrite;continue;}
          if(read){if(scope.meijin&&line.meijinOwned)for(const p of read.nodes)STATEMENT_EXPLICIT_ACTORS.delete(p);if(scope.meijin)meijinLaneRefs(read.nodes,scope.topicActor);previousSentenceStart=nodes.length;nodes.push(...read.nodes);scope.topicSet=read.nodes.some(n=>['Parallel','ParallelEach','ForEach'].includes(n.kind));for(const part of read.nodes)if(STATEMENT_EXPLICIT_ACTORS.has(part))scope.topicActor=topicOf(part.actorRef);if(scope.meijin&&!read.nodes.some(p=>STATEMENT_EXPLICIT_ACTORS.has(p)))scope.topicActor=meijinTopicAfter(read.nodes,scope.topicActor);if(scope.meijin){const named=new Set(read.nodes.filter(p=>STATEMENT_EXPLICIT_ACTORS.has(p)).map(p=>JSON.stringify(topicOf(p.actorRef))));if(named.size>1)scope.topicActor={kind:'self',topicEnded:true};}i=read.index;continue;}
        }
        const repeatPrevious=surfaceCapture(/^これを(.+?)回(?:くり返す|くり返します|繰り返す|繰り返します)$/d,line.code);
        if(repeatPrevious){
          if(previousSentenceStart===null||previousSentenceStart>=nodes.length)throw sentenceDiagnostic('「これを」の すぐ前の 行に、くり返したい 一文を 書いてください',line,[],{kind:'RepeatCount',missing:['precedingSentence']});
          const body=nodes.splice(previousSentenceStart),part=repeatPrevious[0],count=sentenceQuantity(parseMappedExpression(part.text,line.code,line,symbols,local,part.start),'回');
          const repeat=statementNode('RepeatCount',line,{count,body,actorRef:{...scope.topicActor}});REPEAT_PREVIOUS.add(repeat);
          const range=SOURCE_RANGES.get(body[0])?.range,location=SOURCE_RANGES.get(repeat);
          if(range&&location){location.range={start:range.start,end:location.range.end};location.extent.start=range.start;}
          nodes.push(repeat);previousSentenceStart=null;i++;continue;
        }
        if(surfaceMask(line.code).startsWith('くり返しが終わると、')&&nodes.at(-1)?.kind!=='RepeatCount')throw sentenceDiagnostic('「くり返しが終わると」の すぐ前に、回数の ある くり返しを 書いてください',line,[],{kind:'Sequence',missing:['precedingRepeat']});
        parseAt(line,()=>diagnoseSentenceIntent(line,symbols,local,lines[i-1]?.indent===indent?lines[i-1]:null,lines[nextCode(i+1)]?.indent===indent?lines[nextCode(i+1)]:null));
        // It always waits with the whole flow; みんなは in front says the same.
        if(/^(?:(?:みんな|全体)(?:は|が|で|も)、?)?(?:その合図で始まったことが|その知らせを受けて始めたことが)(?:全部|ぜんぶ|すべて)終わるまで待つ$/.test(line.code)){
          const previous=[...nodes].reverse().find(node=>node.kind!=='CommentLine');
          if(previous?.kind!=='Broadcast')throw sentenceDiagnostic('「その合図」は、すぐ前の 行で 送った 合図の ことです。すぐ前の 行に、合図を 送る 文を 書いてください。れい：「スタート」の合図を送る。',line,[],{kind:'WaitBroadcastGroup',missing:['precedingBroadcast']});
          const broadcastRef=previous.broadcastRef||`broadcast-${previous.sourceSpan.startLine}-${previous.sourceSpan.startColumn}`;
          previous.broadcastRef=broadcastRef;
          nodes.push(statementNode('WaitBroadcastGroup',line,{broadcastRef}));i++;continue;
        }

        if(line.code==='ここまで')throw new AkariError('P203','「ここまで」は 書きません。次の 文の 行の はじめを 左へ もどすと、まとまりが おわります',line.lineNo,1);
        const rule=parseAt(line,()=>{try{return readContinuousSentence(line.code,line,symbols,local);}catch(error){if(error.draftRole?.kind==='ContinuousRule'){const next=lines[nextCode(i+1)],speed=next?surfaceCapture(/^(.+?秒に.+?歩の速さで)(?:動かす|動く)$/d,next.code):null;if(speed&&next.indent===indent){const motion=/(?:動き続ける|動かし続ける)$/.exec(surfaceMask(line.code));if(motion){const range=sourceRange(line.mapped.positions),last=sourceRange(next.mapped.positions);error.proposals=[{label:'2つの文を1つの「つづけて動くルール」にまとめる',source:line.code.slice(0,motion.index)+speed[0].text+motion[0],start:range.start,end:last.end}];}}}throw error;}});if(rule){if(depth!==0)throw new AkariError('P205','つづけて 動く ルールは、「もし」や「くり返す」の 中には 書けません。いちばん 外に 書いてください',line.lineNo,1);rules.push(rule);i++;continue;}
        const head=parseAt(line,()=>readBlockHead(line.code,symbols,local));if(head?.kind==='Else')break;
        if(!head){const parts=parseAt(line,()=>parseSentenceSequence(line,symbols,local));if(scope.meijin&&line.meijinOwned)for(const p of parts)STATEMENT_EXPLICIT_ACTORS.delete(p);if(scope.meijin)meijinLaneRefs(parts,scope.topicActor);previousSentenceStart=nodes.length;nodes.push(...parts);scope.topicSet=parts.some(n=>['Parallel','ParallelEach','ForEach'].includes(n.kind));for(const part of parts)if(STATEMENT_EXPLICIT_ACTORS.has(part))scope.topicActor=topicOf(part.actorRef);if(scope.meijin&&!parts.some(p=>STATEMENT_EXPLICIT_ACTORS.has(p)))scope.topicActor=meijinTopicAfter(parts,scope.topicActor);if(scope.meijin){const named=new Set(parts.filter(p=>STATEMENT_EXPLICIT_ACTORS.has(p)).map(p=>JSON.stringify(topicOf(p.actorRef))));if(named.size>1)scope.topicActor={kind:'self',topicEnded:true};}i++;continue;}
        previousSentenceStart=null;
        const controlActor=head.actorRef||scope.topicActor;
        let childScope={...scope,topicActor:{...controlActor},binders:[...(scope.binders||[])]},childStart=i+1,firstChild=nextCode(childStart),binderRange=null;
        if(head.kind==='ForEach'){
          const legacyBinder=surfaceCapture(/^(.+)の各要素を(.+)として、?(?:次のことを)?(?:くり返す|繰り返す|くりかえす)$/d,line.code);
          if(legacyBinder)binderRange=sourceRange(line.mapped.positions,legacyBinder[1].start,legacyBinder[1].end);
          if(firstChild<lines.length&&lines[firstChild].indent>indent){const declaration=surfaceCapture(/^この中では、今見ているものを(.+?)と(?:呼ぶ|よぶ)$/d,lines[firstChild].code);if(declaration){binderRange=sourceRange(lines[firstChild].mapped.positions,declaration[0].start,declaration[0].end);head.binder=parsedDeclarationName(declaration[0].text);childStart=firstChild+1;firstChild=nextCode(childStart);}}
          childScope.binders.push(head.binder);
        }
        // The next line at the same place is the body written without moving it right (F-26: the message names the fix).
        if(!head.inlineBody&&firstChild<lines.length&&lines[firstChild].indent===indent&&lines[firstChild].code&&!/^(?:そうでなければ|でなければ)/.test(surfaceMask(lines[firstChild].code))){
          const sentence=text=>/、$/.test(text)?text:text+'。',written=sentence(line.code);
          throw Object.assign(sentenceDiagnostic(`「${written}」の 中で する 文は、次の 行の はじめを 右へ ずらして 書きます。
れい：${written}
  ${sentence(lines[firstChild].code)}`,line,[],{kind:head.kind,missing:['body']}),{code:'P202'});
        }
        if(!head.inlineBody&&(firstChild>=lines.length||lines[firstChild].indent<=indent))throw Object.assign(sentenceDiagnostic('「もし」や「くり返す」の 中に、する ことを 書いてください。何も しないときは「何もしない」と 書けます。\nれい：2回くり返す。\n  「やあ」と言う。',line,[],{kind:head.kind,missing:['body']}),{code:'P202'});
        if(head.inlineBody&&firstChild<lines.length&&lines[firstChild].indent>indent)throw new AkariError('P209','中の 文を、同じ 行と 次の 行の 両方に 書かないでください',lines[firstChild].lineNo,1);
        const child=head.inlineBody?{nodes:head.inlineBody,index:i+1}:block(childStart,lines[firstChild].indent,childScope,depth+1);
        const fields={...head,actorRef:{...controlActor}};delete fields.kind;delete fields.inlineBody;
        if(!child.nodes.some(n=>n.kind!=='CommentLine'))throw new AkariError('P202','中に、する ことの 文が ありません。何も しないときは「何もしない」と 書けます',line.lineNo,1);
        i=child.index;
        if(head.kind==='IfStatement'){fields.thenBody=child.nodes;fields.elseBody=[];fields.hasElse=false;fields.elseComment='';
          const branchIndex=nextCode(i),branchLine=lines[branchIndex],peek=()=>parseAt(branchLine,()=>readBlockHead(branchLine.code,symbols,{...childScope,sourceLine:branchLine,lineNo:branchLine.lineNo}));
          // 名人: the next line may be a 名人 sentence (read in its turn); only そうでなければ is looked for here.
          const sibling=branchLine?.indent!==indent?null:scope.meijin?(()=>{try{return peek();}catch(error){if(!(error instanceof AkariError))throw error;return null;}})():peek();
          if(sibling?.kind==='Else'){
            for(let j=i;j<branchIndex;j++)if(lines[j].comment)fields.thenBody.push(statementNode('CommentLine',lines[j],{text:lines[j].comment.slice(1),raw:lines[j].raw,actorRef:{...scope.topicActor}}));
            i=branchIndex;const otherwise=lines[i],begin=nextCode(i+1);if(!sibling.inlineBody&&(begin>=lines.length||lines[begin].indent<=indent))throw new AkariError('P202','「そうでなければ、」の 次の 行に、する ことを 書いてください。\nれい：そうでなければ、\n  「はずれ」と言う。',otherwise.lineNo,1);const other=sibling.inlineBody?{nodes:sibling.inlineBody,index:i+1}:block(i+1,lines[begin].indent,childScope,depth+1);fields.hasElse=true;fields.elseComment=sibling.inlineBody?'':otherwise.comment;fields.elseBody=other.nodes;i=other.index;}}
        else fields.body=child.nodes;
        fields.endLine=lines[Math.max(start,i-1)]?.lineNo||line.lineNo;
        const node=statementNode(head.kind,line,fields),location=SOURCE_RANGES.get(node);if(head.inlineBody)node.inlineComment='';if(location){const actorRange=SOURCE_RANGES.get(head)?.actorRange;if(actorRange)location.actorRange=actorRange;location.extent.end=lines[Math.max(start,i-1)]?.end??line.end;location.inlineContainer=!!head.inlineBody;if(head.kind==='ForEach'){location.binderRange=binderRange;location.binderInsert={at:line.end,indent:lines[firstChild]?.indent??indent+2};}}
        nodes.push(node);
        if(scope.meijin)scope.topicActor=meijinTopicAfter([node],scope.topicActor);
      }
      tag();
      return {nodes,index:i};
    }
    const indent=heading&&first<lines.length?lines[first].indent:0,result=block(0,indent,baseCtx,0);
    if(result.index<lines.length)throw new AkariError('P204','「そうでなければ、」と 組になる「もし」が ありません。「もし」と 行の はじめを そろえてください',lines[result.index].lineNo,1);
    const point=offset=>{let lo=0,hi=rawLines.length;while(lo+1<hi){const mid=(lo+hi)>>1;if(rawLines[mid].start<=offset)lo=mid;else hi=mid;}return {line:rawLines[lo].lineNo,column:cpLen(source.slice(rawLines[lo].start,offset))+1};};
    const pending=[...result.nodes,...rules];
    while(pending.length){
      const node=pending.pop(),range=SOURCE_RANGES.get(node)?.range,
        physical=node.sourceSpan?rawLines[node.sourceSpan.startLine-1]:null;
      if(range&&physical){const begin=point(range.start),end=point(range.end);node.sourceSpan={startLine:begin.line,startColumn:begin.column,endLine:end.line,endColumn:end.column};}
      // おされたキーが「みぎ」なら: the pressed key is compared with Akari's key name (右), as a heading reads it.
      // 「ねこ」の「犬」までのきょり is ねこ's distance to 犬 (it was read as the distance to ねこ's 「犬」).
      if(node.kind==='SensorRead'&&node.sensor==='DISTANCE_TO'&&node.arg?.kind==='ActorQualifiedRead'&&node.arg.actorRef?.kind==='named'&&
        (node.arg.value?.kind==='StringLiteral'||(node.arg.value?.kind==='VariableRead'&&!node.arg.value.qualifier&&symbols?.project?.components?.some(c=>c.name===node.arg.value.name)&&!dataNameKind(node.arg.value.name,symbols,ctx)))){
        const owner=node.arg.actorRef,target=node.arg.value.kind==='StringLiteral'?node.arg.value:exprNode('StringLiteral',{value:node.arg.value.name});
        const distance=exprNode('SensorRead',{sensor:'DISTANCE_TO',arg:target});if(node.sourceSpan)distance.sourceSpan=node.sourceSpan;
        for(const key of Object.keys(node))if(!['sourceSpan'].includes(key))delete node[key];
        Object.assign(node,{kind:'ActorQualifiedRead',actorRef:owner,value:distance});
      }
      if(node.kind==='CompareExpression'&&['EQ','NEQ'].includes(node.op))for(const [key,other] of [['left','right'],['right','left']])
        if(node[key]?.kind==='SensorRead'&&node[key].sensor==='押されたキー'&&node[other]?.kind==='StringLiteral')node[other].value=keyName(node[other].value);
      for(const value of Object.values(node)){
        if(Array.isArray(value)){for(const child of value)if(child?.kind)pending.push(child);}
        else if(value?.kind)pending.push(value);
      }
    }
    const ast={kind:'Script',body:result.nodes,...(heading?{heading}:{}),...(rules.length?{rules}:{}),source,sourceSpan:{startLine:1,startColumn:1,endLine:rawLines.length,endColumn:1}};
    if(symbols)FORMAT_SYMBOLS.set(ast,symbols);
    SOURCE_RANGES.set(ast,{range:{start:0,end:source.length},extent:{start:0,end:source.length},indent:0,inline:false,...(headingActorRange?{actorRange:headingActorRange}:{}),...(headingTargetRange?{targetRange:headingTargetRange}:{})});return ast;
  }
  // 「点数を2倍にする」は 読めません (F-26): a statement that is not read names the whole sentence. 計算の「…」 stays only
  // when the part not read is inside （ ） of the sentence (a calculation the child wrote).
  function sentenceReadError(error,line){
    if(error.code!=='P201'||error.proposals?.length)return;
    const code=compactOutsideString(line.code||''),calc=/^計算の「([\s\S]+)」の ところが 読めません/.exec(error.message);
    if(!code||(!calc&&!/^この 文は 読めません/.test(error.message)))return;
    if(calc){let mask;try{mask=surfaceMask(code);}catch(caught){if(!(caught instanceof AkariError))throw caught;return;}
      const at=code.lastIndexOf(calc[1]);
      if(at>0&&mask[at]==='\u0001'){error.message=`計算の「${calc[1]}」の ところが 読めません。書き方を たしかめてください`;return;}}
    error.message=`「${code}」は 読めません。書き方を たしかめてください。`;
  }
  function readBlockHead(text,symbols,ctx={}) {
    const code=compactOutsideString(text),mask=surfaceMask(code),line=ctx.sourceLine||{raw:text,code:text,lineNo:ctx.lineNo||0};
    // まず・次に… before もし or a repeat only say the order.
    const lead=new RegExp('^(?:'+LEAD_WORDS+')、?(?=もし|[0-9０-９]+回|ずっと|次のことを)').exec(mask||'');
    if(lead){const rest=code.slice(lead[0].length);return readBlockHead(rest,symbols,{...ctx,sourceLine:line.mapped&&compactOutsideString(line.code)===code?surfaceLineSlice(line,lead[0].length,code.length):undefined});}
    // もし…のとき、 is もし…なら、
    const when=surfaceCapture(/^(もし.+?)(?:の)?とき(?:は)?、(.*)$/d,code)||surfaceCapture(/^(もし.+?)(?:の)?とき(?:は)?$/d,code);
    if(when&&!/(?:なら|れば|えば|てば|たら)$/.test(surfaceMask(when[0].text)))return readBlockHead(when[0].text+'なら、'+(when[1]?.text||''),symbols,{...ctx,sourceLine:undefined});
    const e=part=>parseMappedExpression(part.text,code,line,symbols,ctx,part.start);
    const inline=part=>{const fragment=surfaceLineSlice(line,part.start,part.end);fragment.comment=line.comment;return parseSentenceSequence(fragment,symbols,ctx);};
    // A control's explicit subject is scoped to its header and child suites.
    // Keep the comma mandatory, and accept only a complete finite control form.
    if(!ctx.explicitControlActor){
      const actor=surfaceCapture(/^(.+?)は、(.+)$/d,code);
      // A part's name is looked up first (こはるは、… names the part こはる). Words that are no name (そのあと、星は、…)
      // are not a control's subject: the line is read as a sentence instead.
      let actorRef=null;
      if(actor){try{actorRef=sentenceActor(actor[0].text,symbols);}catch(error){if(!(error instanceof AkariError))throw error;}}
      if(actorRef){
        const fragment=surfaceLineSlice(line,actor[1].start,actor[1].end);
        fragment.comment=line.comment;
        const head=readBlockHead(actor[1].text,symbols,{...ctx,sourceLine:fragment,topicActor:actorRef,explicitControlActor:true});
        if(head&&head.kind!=='Else'){
          const result={...head,actorRef},actorRange=sourceRange(line.mapped?.positions||[],actor[0].start,actor[0].end);
          if(actorRange)SOURCE_RANGES.set(result,{actorRange});return result;
        }
      }
    }
    let parts;
    if((parts=surfaceCapture(/^(?:そうでなければ|でなければ|それ以外なら|そうでないなら|そうでなかったら)、?(.*)$/d,code))) {
      const tail=parts[0].text;
      return {kind:'Else',...(tail&&tail!=='次のことをする'?{inlineBody:inline(parts[0])}:{})};
    }
    {const otherwise=otherwiseGuidance(code,mask,line);if(otherwise)throw otherwise;}
    // The bounce command reads like a condition; with or without a subject it is one command.
    if(/^(?:[^、。]+?は、?)?(?:もし、?)?(?:画面の(?:はし|端)|端)に(?:ふれ|触れ)[^、]*、?(?:はね返|跳ね返)(?:る|ります|って)/.test(mask))return null;
    // もし…たら reads as もし…なら (only with もし: without it, 〜たら can mean waiting).
    if((parts=surfaceCapture(/^((?:もし)?.+?(?:なら(?:ば)?|れば|えば|てば))、(.*)$/d,code))|| (parts=surfaceCapture(/^((?:もし)?.+?(?:なら(?:ば)?|れば|えば|てば))$/d,code))
      || (parts=surfaceCapture(/^(もし.+?たら)、(.*)$/d,code)) || (parts=surfaceCapture(/^(もし.+?たら)$/d,code))) {
      const condition=parseCondition(parts[0].text,symbols,ctx,'if'),tail=parts[1];
      if(tail?.text&&tail.text!=='次のことをする'&&/(?:なら、|ことを.+回)/.test(surfaceMask(tail.text)))throw new AkariError('P201','「もし」や「くり返す」の 中に 重ねるときは、次の 行に 書いて、行の はじめを 右へ ずらしてください');
      return {kind:'IfStatement',condition,...(tail?.text&&tail.text!=='次のことをする'?{inlineBody:inline(tail)}:{})};
    }
    // 次のことを10回くり返す (an old form) names the form to write.
    if((parts=surfaceCapture(/^次のことを(.+?回)(?:くり返す|繰り返す|くりかえす|くり返します|繰り返します|くりかえします)$/d,code)))
      throw sentenceDiagnostic('「次のことを」は 書きません。くり返すことは 次の 行に 右へ ずらして 書きます',line,[{label:'次のことを を けす',source:`${parts[0].text}くり返す`}],{kind:'RepeatCount'});
    if((parts=surfaceCapture(/^(?!次のことを)(.+)ことを(.+)回(?:くり返す|繰り返す|くりかえす|くり返します|繰り返します|くりかえします)$/d,code))) {
      if(/ことを/.test(surfaceMask(parts[0].text)))throw new AkariError('P201','くり返しの 中に くり返しを 重ねるときは、次の 行に 書いて、行の はじめを 右へ ずらしてください');
      return {kind:'RepeatCount',count:sentenceQuantity(e(parts[1]),'回'),inlineBody:inline(parts[0])};
    }
    if((parts=surfaceCapture(/^(?!次のことを)(.+)ことをずっと(?:くり返す|繰り返す|くりかえす|くり返します|繰り返します|くりかえします)$/d,code)))return {kind:'Forever',inlineBody:inline(parts[0])};
    if((parts=surfaceCapture(/^(.+(?:あいだ|間|まで))、(?!次のことを)(.+)ことを(?:くり返す|繰り返す|くりかえす|くり返します|繰り返します|くりかえします)$/d,code))){const clause=readConditionClause(parts[0].text,symbols,ctx);if(clause)return {kind:clause.mode==='while'?'RepeatWhile':'RepeatUntil',condition:clause.condition,inlineBody:inline(parts[1])};}
    if(/^(?:次のことを)?ずっと(?:くり返す|繰り返す|くりかえす|くり返します|繰り返します|くりかえします)$/.test(mask))return {kind:'Forever'};
    if((parts=surfaceCapture(/^(?:次のことを)?(.+)回(?:だけ)?(?:、次のことを|、)?(?:くり返す|繰り返す|くりかえす|くり返します|繰り返します|くりかえします)$/d,code)))return {kind:'RepeatCount',count:sentenceQuantity(e(parts[0]),'回')};
    if((parts=surfaceCapture(/^(.+?)(?:の中身)?を(?:先頭から)?(?:一つずつ|1つずつ)見て、次のことを(?:行う|行います)$/d,code)))return {kind:'ForEach',list:e(parts[0]),binder:'今見ているもの'};
    if((parts=surfaceCapture(/^(.+)の各要素を(.+)として、?(?:次のことを)?(?:くり返す|繰り返す|くりかえす)$/d,code)))return {kind:'ForEach',list:e(parts[0]),binder:parsedDeclarationName(parts[1].text)};
    if((parts=surfaceCapture(/^(.+(?:あいだ|間|まで))、?(?:次のことを)?(?:くり返す|繰り返す|くりかえす|くり返します|繰り返します|くりかえします)$/d,code))){const clause=readConditionClause(parts[0].text,symbols,ctx);return {kind:clause.mode==='while'?'RepeatWhile':'RepeatUntil',condition:clause.condition};}
    if((parts=surfaceCapture(/^(.+)回((?:.*)(?:進んで|すすんで|動いて|うごいて))、(.+)$/d,code))){const first=sentenceInfinitive(parts[1].text),last=parts[2].text,indent=' '.repeat(line.indent||0);throw sentenceDiagnostic('どこまでを くり返すのか 分かりません。えらんでください',line,[{label:'前の 動きだけを くり返す',source:`${parts[0].text}回くり返す。\n${indent}  ${first}。\n${indent}${last}`},{label:'2つの 動きを くり返す',source:`${parts[0].text}回くり返す。\n${indent}  ${first}。\n${indent}  ${last}`}],{kind:'RepeatCount',missing:['scope']});}
    // 〜たら without もし: now (もし), once by waiting (〜まで待つ), or each time (an event's heading)? The three meanings,
    // as for 〜にふれたら (C-09); the fixes are offered only when they read (もしゲームが始まったら does not).
    const taraMessage='「〜たら」は、いくつかの 意味に とれます。いま そうなっているかを しらべるなら「もし〜なら、」、そうなるまで 待つなら「〜まで待つ。」、そうなる たびに するなら「〜がおされたとき、」のような きっかけの 見出しで 書きます';
    if((parts=surfaceCapture(/^((?!もし).+?たら)、(.*)$/d,code))&&!/(?:になったら|終わったら|小さくなったら)/.test(mask)){
      const rest=parts[1]?.text||'',choices=[];
      const readsAs=text=>{for(const source of [text+'。',text.replace(/、?$/,'、')+'\n  何もしない。']){try{if(parseSyntax(source,{symbols}).ast)return true;}catch(error){if(!(error instanceof AkariError))throw error;}}return false;};
      try{const condition=parseCondition('もし'+parts[0].text,symbols,ctx,'if');
        choices.push({label:'いま そうなっているかを しらべる',source:'もし'+formatCondition(condition,'if')+'、'+rest});
        if(rest)choices.push({label:'そうなるまで 待つ',source:formatCondition(condition,'until')+'待って、'+rest});
      }catch(error){if(!(error instanceof AkariError))throw error;}
      throw sentenceDiagnostic(taraMessage,line,choices.filter(c=>readsAs(c.source)),{kind:'IfStatement',missing:['もし']});
    }
    if(/(?:終わったら|小さくなったら)/.test(mask))throw sentenceDiagnostic(taraMessage,line,[],{kind:'Condition',missing:['triggerOrState']});
    return null;
  }
  function blockSource(kind,fields={}) {
    const {condition='〔きまりをえらぶ〕',count='〔回数をえらぶ〕',list='〔リストをえらぶ〕',binder='今見ているもの'}=fields;
    switch(kind){
      case 'IfStatement':return `もし${condition}${/(?:なら(?:ば)?|れば|えば|てば)$/.test(surfaceMask(condition))?'':'なら'}、`;
      case 'Else':return 'そうでなければ、';
      case 'RepeatCount':return `${count}${surfaceMask(count).endsWith('回')?'':'回'}くり返す`;
      case 'Forever':return 'ずっとくり返す';
      case 'ForEach':{
        const header=`${list}の中身を先頭から一つずつ見て、次のことを行う`,name=binder==='今見ているもの'?binder:parsedDeclarationName(binder);
        return name==='今見ているもの'?header:`${header}。\n  この中では、今見ているものを【${name}】とよぶ`;
      }
      case 'RepeatWhile':return `${condition}${/(?:あいだ|間)$/.test(surfaceMask(condition))?'':'あいだ'}、くり返す`;
      case 'RepeatUntil':return `${condition}${surfaceMask(condition).endsWith('まで')?'':'まで'}、くり返す`;
      default:throw new Error('Unknown block kind: '+kind);
    }
  }
  function readConditionClause(text,symbols,ctx={}) {
    const code=compactOutsideString(text),mask=surfaceMask(code),mode=/(?:あいだ|間)$/.test(mask)?'while':mask.endsWith('まで')?'until':null;
    return mode?{mode,condition:parseCondition(code,symbols,ctx,mode)}:null;
  }
  function conditionSource(node,mode) {return formatCondition(node,mode);}
  function readSurfaceStatement(code,line,symbols,ctx) {return readRoleStatement(code,line,symbols,ctx);}
  function parseSimpleStatement(line,symbols,ctx={}) {
    let code=compactOutsideString(line.code),working=line;
    // 〜に〜を入れる / 〜を〜に入れる with a bare (not 「」) target, as [target, value]; .variable when the target is a variable.
    const putInto=text=>{
      const first=surfaceCapture(/^(.+)に(.+)を(?:入れる|いれる|入れます|いれます)$/d,text),valueFirst=!first&&surfaceCapture(/^(.+?)を(.+)に(?:入れる|いれる|入れます|いれます)$/d,text);
      const pair=first||(valueFirst?[valueFirst[1],valueFirst[0]]:null);
      if(!pair||pair[0].text.startsWith('「'))return null;
      // The place is a variable however it is written (自分の体力, 作品の点数, 【名前】, this definition's own variable).
      let target=null;try{target=parseTargetPrefix(pair[0].text,symbols,ctx);}catch(error){if(!(error instanceof AkariError))throw error;}
      pair.variable=!!target&&target.len===pair[0].text.length&&(dataNameKind(target.name,symbols,ctx)==='variable'||(ctx.localVarNames||[]).includes(target.name));
      return pair;
    };
    const extension = /^拡張「([^「」\n]+)」「([^「」\n]+)」（([\s\S]*)）$/.exec(code);
    if (extension) {
      const name = EXTENSION_HOST.resolve(extension[1], extension[2], 'commands');
      if (!name) throw new AkariError('E703', ctx.meijin ? 'この「拡張」の 命令が 見つかりません。かくちょうの 名前を たしかめてください' : 'この「拡張」の ブロックが 見つかりません。かくちょうの 名前を たしかめてください', line.lineNo, 1);
      if (!ctx.meijin && EXTENSION_HOST.describe(name, 'commands')?.scope === 'meijin') throw new AkariError('S317', extensionMeijinOnly(extension[1], extension[2]), line.lineNo, 1);
      return statementNode('ExtensionCommand', line, { name, args: parseArgumentText(extension[3], symbols, ctx, line.lineNo), actorRef: { ...(ctx.topicActor || { kind: 'self' }) } });
    }
    // そのあと・それから・そして・また… only say the order. Without 、 they are dropped before a number, a quote, a
    // known name or a usual first word (そして10歩進む was read as a name 「そして10」).
    // The same words after the subject (ねこは、まず10歩進む / ねこはすばやく10歩進む) are dropped the same way.
    const leadOf=text=>{
      let found=LEAD_BEFORE.exec(surfaceMask(text));
      if(!found){const word=LEAD_WORD.exec(surfaceMask(text)),rest=word&&text.slice(word[0].length),token=rest&&readNameToken(rest),whole=word&&readNameToken(text);
        if(rest&&((token&&(dataNameKind(token.name,symbols,ctx)||symbols?.project?.components?.some(c=>c.name===token.name)))||symbols?.project?.components?.some(c=>rest.startsWith(c.name)))&&!(whole&&dataNameKind(whole.name,symbols,ctx)))found=word;}
      if(found&&/は$/.test(found[0])&&symbols?.project?.components?.some(c=>c.name===found[0].slice(0,-1)))found=null;
      return found;
    };
    const lead=leadOf(code);
    if(lead){working=surfaceLineSlice(line,lead[0].length,code.length);working.comment=line.comment;code=working.code;}
    // だんごが…まで、たくどんは待つ: the condition written first reads as たくどんは、…まで待つ. みんな／全体 is the wait of the
    // whole flow (unless a part has that name). The 、 is found outside quotes.
    {const late=surfaceCapture(actorNamePatterns(symbols).late,code);
      if(late){const actor=late[1].text,whole=EVERYONE_WORDS.includes(actor)&&!symbols?.project?.components?.some(c=>c.name===actor);
        const inline=working.inline;working=surfaceLineSlice(working,0,code.length,(whole?'':actor+'は、')+late[0].text+'待つ');working.comment=line.comment;working.inline=inline;code=working.code;}}
    // 点数が10になるまで、待つ: the same wait without a subject; the 、 only marks the end of the condition.
    {const plain=surfaceCapture(/^(.+まで)、(?:待つ|まつ|待ちます)$/d,code);
      if(plain){const inline=working.inline;working=surfaceLineSlice(working,0,code.length,plain[0].text+'待つ');working.comment=line.comment;working.inline=inline;code=working.code;}}
    // ねこも10歩進む: a part name with も is the subject, the same as ねこは (ねこも10 was read as a name).
    const also=actorNamePatterns(symbols).partsWithSelf.find(actor=>code.startsWith(actor.name+'も')&&!surfaceMask(code).startsWith(actor.name+'も同じ'));
    if(also){const inline=working.inline;working=surfaceLineSlice(working,0,code.length,also.name+'は'+code.slice(also.name.length+1));working.comment=line.comment;working.inline=inline;code=working.code;}
    // だんごだけ0.2秒待つ / 自分だけは…: だけ says the same as は.
    const onlyMatch=actorNamePatterns(symbols).only.exec(code),only=onlyMatch&&!dataNameKind(onlyMatch[1]+'だけ',symbols,ctx)?onlyMatch:null;
    if(only){const inline=working.inline,name=only[0].replace(/だけ(?:は|が)?、?$/,'');working=surfaceLineSlice(working,0,code.length,name+'は'+code.slice(only[0].length));working.comment=line.comment;working.inline=inline;code=working.code;}
    // 1秒みんなで待つ is みんなで1秒待つ.
    const lateEveryone=/^(.+?秒(?:間)?)(みんな|全体)(で|は|が|も)、?(待つ|まつ)$/.exec(code);
    if(lateEveryone&&!EVERYONE_WORDS.some(word=>symbols?.project?.components?.some(c=>c.name===word)&&word===lateEveryone[2])){const inline=working.inline;working=surfaceLineSlice(working,0,code.length,lateEveryone[2]+lateEveryone[3]+lateEveryone[1]+'待つ');working.comment=line.comment;working.inline=inline;code=working.code;}
    // みんなは／全体が／みんなで…待つ is the wait of the whole flow, the same as 待つ without a subject (みんな1秒待つ too).
    const everyone=!EVERYONE_WORDS.some(word=>code.startsWith(word)&&(symbols?.project?.components?.some(c=>c.name===word)||symbols?.project?.stage?.name===word||dataNameKind(word,symbols,ctx)))&&
      EVERYONE_START.exec(code);
    if(everyone){
      const word=everyone[0].replace(/、$/,''),part=surfaceLineSlice(working,everyone[0].length,code.length);part.comment=line.comment;
      // みんなが…まで待つ: が belongs to the condition (ねこがはしにふれるまで), and みんなが cannot be one.
      if(/が$/.test(word)&&surfaceMask(part.code).endsWith('まで待つ'))
        throw sentenceDiagnostic(`「〜まで」の 前の「${word}」は、だれが どうなるまでかが 分かりません。みんなで 待つときは「${word.replace(/が$/,'は')}」と 書くか、何も 書かずに「〜まで待つ」と 書きます`,working,[],{kind:'WaitUntil',missing:['condition']});
      let node=null;try{node=readSurfaceStatement(part.code,part,symbols,{...ctx,sentenceActor:null});}catch(error){if(!(error instanceof AkariError))throw error;}
      if(!node){try{node=parseLegacySimpleStatement(part,symbols,ctx);}catch(error){if(!(error instanceof AkariError))throw error;}}
      if(node&&EVERYONE_WAITS.has(node.kind)){node.actorRef={kind:'all'};return node;}
      if(node?.kind==='Ask')throw sentenceDiagnostic('たずねるときは、たずねる キャラクターや 部品の 名前を 書きます。答えが 出るまでは、いつも みんなが 待ちます',working,[],{kind:'Ask',missing:['actor']});
      if(/待つ$/.test(surfaceMask(part.code)))throw sentenceDiagnostic(`この「待つ」の 文は 読めません。「${word}」の あとの 書き方を たしかめてください`,working,[],{kind:'Sequence'});
      throw sentenceDiagnostic(`「${word}」と 書けるのは「待つ」の 文だけです。動く キャラクターや 部品の 名前を 書いてください`,working,[],{kind:'Sequence',missing:['actor']});
    }
    const parse=(text,at,topicActor)=>{const part=at?surfaceLineSlice(working,at,code.length):working;part.comment=line.comment;const local={...ctx,topicActor};return readSurfaceStatement(text,part,symbols,local);};
    let directError;
    try { const direct=parse(code,0,ctx.topicActor||{kind:'self'}); if(direct)return everyoneWait(direct,ctx); } catch(error) {if(!(error instanceof AkariError))throw error;directError=error;}
    const directionFirst=surfaceCapture(/^((?:画面の)?(?:前|後ろ|右|左|上|下)(?:へ|に))、(.+?)を(.+(?:動かす|うごかす))$/d,code);
    if(directionFirst){
      const [direction,actor,movement]=directionFirst,actorRef=sentenceActor(actor.text,symbols),text=direction.text+movement.text;
      const positions=working.mapped?.positions,part={...working,code:text,mapped:{text,positions:positions?[...positions.slice(direction.start,direction.end),...positions.slice(movement.start,movement.end)]:[]}};
      const result=readSentenceMotion(text,part,symbols,{...ctx,topicActor:actorRef});
      if(result){STATEMENT_EXPLICIT_ACTORS.add(result);const location=SOURCE_RANGES.get(result);if(location)location.actorRange=sourceRange(working.mapped?.positions||[],actor.start,actor.end);return result;}
    }
    // Actor extraction is permitted only when a complete action/data frame accepts its suffix.
    const actorPatterns=[/^(.+?)は、?(.+)$/d,/^(.+?)を(.+(?:動かす|うごかす))$/d,/^(.+?)に(.+(?:言わせる))$/d];
    for(let k=0;k<actorPatterns.length;k++){
      if(k===1&&!/(?:動かす|うごかす)$/.test(code)||k===2&&!code.endsWith('言わせる'))continue;
      const particle=['は','を','に'][k],actors=actorNamePatterns(symbols).actorsWithSelf;
      // A part name (or 自分) with が or も as the subject reads as は: ねこが10歩進む, 自分も10歩進む.
      const subjectParticle=k===0?['は','が','も'].find(p=>actors.some(actor=>code.startsWith(actor.name+p))):particle;
      const known=actors.find(actor=>code.startsWith(actor.name+(subjectParticle||particle)));
      let offset=known?known.name.length+1+(k===0&&code[known.name.length+1]==='、'?1:0):0;
      if(known&&k===0){const after=leadOf(code.slice(offset));if(after)offset+=after[0].length;}
      const parts=known?[{text:known.name,start:0,end:known.name.length},{text:code.slice(offset),start:offset,end:code.length}]:surfaceCapture(actorPatterns[k],code);if(!parts)continue;
      if(k===0&&parts[0].text==='この中で')continue;
      let actorRef;try{actorRef=sentenceActor(parts[0].text,symbols);}catch(error){if(error instanceof AkariError)continue;throw error;}let body=parts[1].text;
      if(k===2)body=body.slice(0,-'言わせる'.length)+'言う';
      const part=surfaceLineSlice(working,parts[1].start,parts[1].end,k===2?body:null);part.comment=line.comment;
      let node=readSurfaceStatement(body,part,symbols,{...ctx,topicActor:actorRef});
      const putBody=!node&&k===0?putInto(body):null;
      if(putBody){
        if(!putBody.variable)throw sentenceDiagnostic('「〜に〜を入れる」では、さいごに入れるのか、何番目かと 入れかえるのか 分かりません。えらんでください',working,[{label:'さいごに入れる',source:`${parts[0].text}は、${putBody[0].text}のさいごに${putBody[1].text}を入れる`},{label:'どれかと 入れかえる（何番目かを えらぶ）',source:`${parts[0].text}は、${putBody[0].text}の〔番号を入れる〕番目を${putBody[1].text}にかえる`}],{kind:'ListMutation',target:putBody[0].text,missing:['operation','indexIfReplace']});
        const replacement=`${putBody[0].text}を${putBody[1].text}にする`,assign=surfaceLineSlice(working,parts[1].start,parts[1].end,replacement);assign.comment=line.comment;
        node=readSurfaceStatement(replacement,assign,symbols,{...ctx,topicActor:actorRef});
      }
      // Spellings kept by the finite statement parser take a subject the same way.
      if(!node&&k===0&&!putBody){try{node=parseLegacySimpleStatement(part,symbols,{...ctx,topicActor:actorRef});}catch(error){if(!(error instanceof AkariError))throw error;}}
      // The extent starts after the indent, as statementNode makes it (a moved block keeps the line it came from).
      // ねこが10歩進む keeps its が (written back the same way); the meaning is that of ねこは.
      if(node){node.actorRef=subjectParticle==='が'&&actorRef.kind==='named'?{...actorRef,particle:'が'}:actorRef;STATEMENT_EXPLICIT_ACTORS.add(node);const location=SOURCE_RANGES.get(node);if(location){location.extent={start:working.start+(working.indent||0),end:working.end};location.range=sourceRange(working.mapped?.positions||[]);location.inline=!!working.inline;location.actorRange=sourceRange(working.mapped?.positions||[],parts[0].start,parts[0].end);}return node;}
    }
    const unclear=putInto(code);
    if(unclear){
      // A variable takes the value: 点数に答えを入れる and 答えを点数に入れる are 点数を答えにする.
      if(unclear.variable){
        const replacement=`${unclear[0].text}を${unclear[1].text}にする`,part=surfaceLineSlice(working,0,code.length,replacement);part.comment=line.comment;
        return readSurfaceStatement(replacement,part,symbols,ctx);
      }
    }
    if(unclear)throw sentenceDiagnostic('「〜に〜を入れる」では、さいごに入れるのか、何番目かと 入れかえるのか 分かりません。えらんでください',working,[{label:'さいごに入れる',source:`${unclear[0].text}の最後に${unclear[1].text}を入れる`},{label:'どれかと 入れかえる（何番目かを えらぶ）',source:`${unclear[0].text}の〔番号を入れる〕番目を${unclear[1].text}にかえる`}],{kind:'ListMutation',target:unclear[0].text,missing:['operation','indexIfReplace']});
    // 10秒後に右へ10歩動く: the move is written as the code writes it (いまのばしょから、右へ10歩動く), so the
    // second sentence of the fix reads too.
    const delayed=surfaceCapture(/^(.+)秒後に、?(.+)$/d,code);
    if(delayed){
      const rest=delayed[1].text,readable=text=>{try{return !!parseSyntax(text+'。',{symbols}).ast;}catch(error){if(!(error instanceof AkariError))throw error;return false;}};
      const then=[rest,'いまのばしょから、'+rest].find(readable);
      throw sentenceDiagnostic('待ってから 動くときは、「待つ」と「動く」の 2つの 文に 分けます',working,[{label:'待ってから次の動きをする',source:`${delayed[0].text}秒待つ。\n${' '.repeat(working.indent||0)}${then?canonicalStatementSource(then,symbols):rest}`}],{kind:'Sequence',missing:['motionDestinationIfAbsent']});
    }
    if(directError)throw directError;
    // The preserved advanced spellings are parsed structurally by the original finite parser.
    try {const legacy=parseLegacySimpleStatement(working,symbols,ctx);legacy.actorRef={...(ctx.topicActor||{kind:'self'})};return everyoneWait(legacy,ctx);}
    catch(error){
      if(!(error instanceof AkariError))throw error;
      if(/^[\p{L}ー]+(?:する|しよう)$/u.test(code)&&symbols?.actions?.size){
        const proposals=[...symbols.actions.values()].map(def=>({label:`「${def.name}」のブロックを使う`,source:(def.args.length?def.args.map(arg=>`${nameSource(arg)}を〔${arg}を入れる〕`).join('、')+'として、':'')+`【${def.name}】という手順を行う`}));
        throw sentenceDiagnostic('この「〜する」という 短い よび方は、まだ 決めていません。使う ブロックを えらぶか、自分で 作った ブロックで よび方を 決めてください',working,proposals,{kind:'UserActionCall',missing:['registeredCallPhrase']});
      }
      throw error;
    }
  }
  function splitCommandArgs(text, delimiters) {
    const parts = [];
    let start = 0,
      depth = 0,
      inStr = false,
      which = 0;
    for (let i = 0; i < text.length && which < delimiters.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (ch === '」') inStr = false;
        continue;
      }
      if (ch === '「') {
        inStr = true;
        continue;
      }
      if (ch === '（' || ch === '［' || ch === '【') {
        depth++;
        continue;
      }
      if (ch === '）' || ch === '］' || ch === '】') {
        depth--;
        continue;
      }
      const delimiter = delimiters[which];
      if (depth === 0 && text.startsWith(delimiter, i)) {
        parts.push(text.slice(start, i));
        i += delimiter.length - 1;
        start = i + 1;
        which++;
      }
    }
    if (which !== delimiters.length) return null;
    parts.push(text.slice(start));
    return parts.every((x) => x.length) ? parts : null;
  }
  // One length-preserving scan protects strings, exact names and nested expressions.
  // Only outer fixed markers select a surface frame; names and values never select it.
  function surfaceMask(text) {
    // Without a quote, a bracket or ※ nothing is hidden (and no bracket can be left open).
    if (typeof text === 'string' && !/[「『【（［）］※]/.test(text)) return text;
    const out = text.split(''), stack = [];
    let quote = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        out[i] = '\u0001';
        if (['」','』'].includes(quote) && ch === '\\') {
          if (!['\\',quote==='』'?'『':'「',quote].includes(text[i+1])) throw new AkariError('N103','「 」の 中の \\ の つぎには、\\ か「 か 」しか 書けません。\\ を 文字として 使うときは \\\\ と 書きます');
          out[++i] = '\u0001'; continue;
        }
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === '※') { for(let j=i;j<text.length;j++) out[j]='\u0001'; break; }
      if (ch === '「' || ch === '『' || ch === '【') {
        quote = ch === '「' ? '」' : ch === '『' ? '』' : '】';
        out[i] = '\u0001';
        continue;
      }
      if (ch === '（' || ch === '［') {
        stack.push(ch === '（' ? '）' : '］');
        out[i] = '\u0001';
      } else if (ch === '）' || ch === '］') {
        if (stack.pop() !== ch) throw new AkariError('P207', 'かっこの 開く しるしと とじる しるしが 合っているか たしかめてください');
        out[i] = '\u0001';
      } else if (stack.length) out[i] = '\u0001';
    }
    if (quote || stack.length) throw new AkariError('P207', '「 」・【 】・（ ）などの とじる しるしを 書いてください');
    return out.join('');
  }
  function readLegacySurfaceStatement(code, line, symbols, ctx) {
    // Restrict dispatch before scanning. Standard statements retain their diagnostics.
    if (!/(?:代入する|加える|足す|引く|増やす|減らす|追加する|挿入する|削除する|入れる|回る|鳴らす|鳴らし、終わるまで待つ|と聞いて待つ)$/.test(code)) return null;
    const mask = surfaceMask(code), e = (t, start) => parseMappedExpression(t, code, line, symbols, ctx, start);
    const once = marker => mask.indexOf(marker) >= 0 && mask.indexOf(marker) === mask.lastIndexOf(marker);
    if (mask.includes('秒、') && /(?:鳴らす|鳴らし、終わるまで待つ)$/.test(mask) && (!once('秒、') || !once('Hzの音を')))
      throw new AkariError('P205','秒と 音の 高さ（Hz）は 1つずつ 書いてください。れい：440Hzの音を0.2秒鳴らす');
    if (mask.endsWith('に入れる') && !once('を'))
      throw new AkariError('P205','入れる 中身と 入力らんを 1つずつ 書いてください');
    const target = (text, start) => {
      const t = parseTargetPrefix(text, symbols, ctx);
      if (!t || t.len !== text.length) throw new AkariError('P205', 'かえる ものの 名前と「に」「を」などの 書き方を たしかめてください。れい：点数を1ふやす');
      const node = {name:t.name, qualifier:t.qualifier};
      const range = sourceRange(line.mapped?.positions || [], start, start + text.length);
      if (range) SOURCE_RANGES.set(node, {range});
      return node;
    };
    // Captures index original compact text, never a reordered virtual statement.
    const match = re => {
      const m = re.exec(mask);
      if (!m) return null;
      const parts = m.indices.slice(1).map(range => range && code.slice(range[0], range[1]));
      parts.starts = m.indices.slice(1).map(range => range?.[0]);
      return parts;
    };
    const node = (kind, fields) => statementNode(kind, line, fields);
    let m;
    for (const [ending, kind, field] of [['と聞いて待つ','Ask','question']])
      if (mask.endsWith(ending)) return node(kind, {[field]:e(code.slice(0,-ending.length), 0)});
    if ((m = match(/^(.+)度(右|左)に回る$/d)))
      return node('MotionCommand', {op:m[1] === '右' ? 'TURN_RIGHT' : 'TURN_LEFT', args:[e(m[0],m.starts[0])]});
    if ((m = match(/^(.+)秒、(.+)Hzの音を(鳴らす|鳴らし、終わるまで待つ)$/d)))
      return node('SoundCommand', {op:m[2] === '鳴らす' ? 'TONE' : 'TONE_WAIT', args:[e(m[1],m.starts[1]),e(m[0],m.starts[0])]});
    if ((m = match(/^(.+)を(.+)に入れる$/d))) return node('LooksCommand', {op:'SET_INPUT', args:[e(m[1],m.starts[1]),e(m[0],m.starts[0])]});
    // A target-first frame has exactly the existing syntactic target prefix.
    // A value-first frame ends with that same target/position phrase.
    let t = null;
    try { t = parseTargetPrefix(code, symbols, ctx); } catch (error) {
      if (!(error instanceof AkariError)) throw error;
    }
    const rest = t && code.slice(t.len), restMask = t && mask.slice(t.len);
    const dest = t && target(code.slice(0,t.len),0);
    if (t) {
      for (const [ending, kind, op] of [['を代入する','Assignment',null], ['を加える','NumericUpdate','ADD']])
        if (restMask.startsWith('に') && restMask.endsWith(ending))
          return node(kind, {target:dest, value:e(rest.slice(1,-ending.length),t.len+1), ...(op ? {op} : {})});
      if (restMask.startsWith('を') && /(?:増やす|減らす)$/.test(restMask)) {
        const amount = rest.slice(1,-3).replace(/だけ$/, '');
        return node('NumericUpdate', {op:restMask.endsWith('増やす') ? 'ADD' : 'SUB', target:dest, value:e(amount,t.len+1)});
      }
      if (restMask.startsWith('の末尾に') && restMask.endsWith('を追加する'))
        return node('ListAppend', {target:dest, value:e(rest.slice(4,-5),t.len+4)});
      if (restMask.startsWith('から') && restMask.endsWith('番目を削除する'))
        return node('ListDelete', {target:dest, index:e(rest.slice(2,-7),t.len+2)});
      if (['のすべてを削除する','のすべての要素を削除する'].includes(restMask)) return node('ListClear',{target:dest});
    }
    for (const [ending, kind, op] of [['に代入する','Assignment',null], ['に加える','NumericUpdate','ADD'], ['に追加する','ListAppend',null], ['の末尾に追加する','ListAppend',null], ['番目に挿入する','ListInsert',null]]) {
      if (!mask.endsWith(ending)) continue;
      const end = code.length-ending.length, split = mask.lastIndexOf('を',end);
      if (split < 1) continue;
      const valueText = code.slice(0,split), destination = code.slice(split+1,end);
      if (kind === 'ListInsert') {
        const d = parseTargetPrefix(destination,symbols,ctx);
        if (!d || !destination.slice(d.len).startsWith('の')) throw new AkariError('P205','どの リストの 何番目かを 書いてください。れい：【くだもの】の1番目に「りんご」を入れる');
        return node(kind,{target:target(destination.slice(0,d.len),split+1), index:e(destination.slice(d.len+1),split+d.len+2), value:e(valueText,0)});
      }
      // Explicit末尾 is the longer suffix, not a name selected through lookup.
      if (ending === 'に追加する' && mask.endsWith('の末尾に追加する')) continue;
      return node(kind,{target:target(destination,split+1), value:e(valueText,0), ...(op ? {op} : {})});
    }
    return null;
  }
  function parseLegacySimpleStatement(line, symbols, ctx) {
    const code = compactOutsideString(line.code);
    let expressionCursor = 0;
    const e = (t) => {
      const text = compactOutsideString(t), start = code.indexOf(text, expressionCursor);
      if (start >= 0) expressionCursor = start + text.length;
      return parseMappedExpression(t, code, line, symbols, ctx, start);
    };
    const surface = readLegacySurfaceStatement(code, line, symbols, ctx);
    if (surface) return surface;
    let m;
    if (code === '何もしない') return statementNode('NoOperation', line);
    if (code === 'タイマーを0にする') return statementNode('TimerReset', line);
    if (code === 'このくり返しを終える' || code === 'このくり返しを終えます') return statementNode('Break', line);
    if (code === '次のくり返しへ進む') return statementNode('Continue', line);
    if (code === 'このスクリプトを止める')
      return statementNode('StopCommand', line, { op: 'THIS' });
    if (code === 'ほかのスクリプトを止める')
      return statementNode('StopCommand', line, { op: 'OTHERS' });
    if (code === 'すべてを止める') return statementNode('StopCommand', line, { op: 'ALL' });
    if (code === '前面へ出す') return statementNode('LooksCommand', line, { op: 'FRONT' });
    if (code === '背面へ下げる') return statementNode('LooksCommand', line, { op: 'BACK' });
    if (code === '隠れる') return statementNode('LooksCommand', line, { op: 'HIDE' });
    if (code === '現れる') return statementNode('LooksCommand', line, { op: 'SHOW' });
    if (code === '次の衣装にする' || code === '次のすがたにする')
      return statementNode('LooksCommand', line, { op: 'NEXT_COSTUME' });
    if (code === '前の衣装にする' || code === '前のすがたにする')
      return statementNode('LooksCommand', line, { op: 'PREV_COSTUME' });
    if (code === '次の背景にする' || code === '次のはいけいにする')
      return statementNode('LooksCommand', line, { op: 'NEXT_BACKDROP' });
    if (code === '前の背景にする' || code === '前のはいけいにする')
      return statementNode('LooksCommand', line, { op: 'PREV_BACKDROP' });
    if (code === 'ペンを下ろす') return statementNode('PenCommand', line, { op: 'DOWN' });
    if (code === 'ペンを上げる') return statementNode('PenCommand', line, { op: 'UP' });
    if (code === '描いた線とスタンプを消す')
      return statementNode('PenCommand', line, { op: 'CLEAR' });
    if (code === 'スタンプを押す') return statementNode('PenCommand', line, { op: 'STAMP' });
    if (code === 'すべての音を止める')
      return statementNode('SoundCommand', line, { op: 'STOP_ALL' });
    if (code === '端に触れていれば跳ね返る')
      return statementNode('MotionCommand', line, { op: 'BOUNCE' });
    if (code.endsWith('と知らせ、受け手の処理が終わるまで待つ'))
      return statementNode('BroadcastAndWait', line, {
        message: e(code.slice(0, -'と知らせ、受け手の処理が終わるまで待つ'.length)),
      });
    if (code.endsWith('と知らせる'))
      return statementNode('Broadcast', line, { message: e(code.slice(0, -'と知らせる'.length)) });
    if (code.endsWith('とたずねる'))
      return statementNode('Ask', line, { question: e(code.slice(0, -'とたずねる'.length)) });

    if (code.endsWith('秒待つ'))
      return statementNode('WaitTime', line, { seconds: e(code.slice(0, -'秒待つ'.length)) });
    if (code.endsWith('と言う'))
      return statementNode('Say', line, { value: e(code.slice(0, -'と言う'.length)) });
    if (code.endsWith('を返す'))
      return statementNode('ReturnStatement', line, { value: e(code.slice(0, -'を返す'.length)) });
    if ((m = code.match(/^方向を(.+)度にする$/)))
      return statementNode('MotionCommand', line, { op: 'SET_DIRECTION', args: [e(m[1])] });
    if ((m = code.match(/^右に(.+)度回る$/)))
      return statementNode('MotionCommand', line, { op: 'TURN_RIGHT', args: [e(m[1])] });
    if ((m = code.match(/^左に(.+)度回る$/)))
      return statementNode('MotionCommand', line, { op: 'TURN_LEFT', args: [e(m[1])] });
    if (code.endsWith('の方向を向く'))
      return statementNode('MotionCommand', line, {
        op: 'POINT_TO',
        args: [e(code.slice(0, -'の方向を向く'.length))],
      });
    if ((m = code.match(/^大きさを(.+)％にする$/)))
      return statementNode('LooksCommand', line, { op: 'SET_SCALE', args: [e(m[1])] });
    if ((m = code.match(/^(.+)層前へ出す$/)))
      return statementNode('LooksCommand', line, { op: 'FORWARD_LAYERS', args: [e(m[1])] });
    if ((m = code.match(/^(.+)層後ろへ下げる$/)))
      return statementNode('LooksCommand', line, { op: 'BACKWARD_LAYERS', args: [e(m[1])] });
    if (code.startsWith('表示色を') && code.endsWith('にする'))
      return statementNode('LooksCommand', line, {
        op: 'SET_COLOR',
        args: [e(code.slice('表示色を'.length, -'にする'.length))],
      });
    if (code.startsWith('衣装を') && code.endsWith('にする'))
      return statementNode('LooksCommand', line, {
        op: 'SET_COSTUME',
        args: [e(code.slice('衣装を'.length, -'にする'.length))],
      });
    if (code.startsWith('背景を') && code.endsWith('にする'))
      return statementNode('LooksCommand', line, {
        op: 'SET_BACKDROP',
        args: [e(code.slice('背景を'.length, -'にする'.length))],
      });
    if (code.startsWith('ペンの色を') && code.endsWith('にする'))
      return statementNode('PenCommand', line, {
        op: 'SET_COLOR',
        args: [e(code.slice('ペンの色を'.length, -'にする'.length))],
      });
    if (code.startsWith('ペンの太さを') && code.endsWith('にする'))
      return statementNode('PenCommand', line, {
        op: 'SET_SIZE',
        args: [e(code.slice('ペンの太さを'.length, -'にする'.length))],
      });
    if (
      code.endsWith('秒鳴らし、終わるまで待つ') &&
      (m = splitCommandArgs(code.slice(0, -'秒鳴らし、終わるまで待つ'.length), ['Hzの音を']))
    )
      return statementNode('SoundCommand', line, { op: 'TONE_WAIT', args: m.map(e) });
    if (
      code.endsWith('秒鳴らす') &&
      (m = splitCommandArgs(code.slice(0, -'秒鳴らす'.length), ['Hzの音を']))
    )
      return statementNode('SoundCommand', line, { op: 'TONE', args: m.map(e) });
    if (code.endsWith('を鳴らし、終わるまで待つ'))
      return statementNode('SoundCommand', line, {
        op: 'SAMPLE_WAIT',
        args: [e(code.slice(0, -'を鳴らし、終わるまで待つ'.length))],
      });
    if ((m = code.match(/^(?:音量|音の大きさ)を(.+)％にする$/)))
      return statementNode('SoundCommand', line, { op: 'SET_VOLUME', args: [e(m[1])] });
    if (code.startsWith('音程を') && code.endsWith('段階上げる'))
      return statementNode('SoundCommand', line, {
        op: 'PITCH_UP',
        args: [e(code.slice('音程を'.length, -'段階上げる'.length))],
      });
    if (code.startsWith('音程を') && code.endsWith('段階下げる'))
      return statementNode('SoundCommand', line, {
        op: 'PITCH_DOWN',
        args: [e(code.slice('音程を'.length, -'段階下げる'.length))],
      });
    if (code.startsWith('文字を') && code.endsWith('にする'))
      return statementNode('LooksCommand', line, {
        op: 'SET_SELF_TEXT',
        args: [e(code.slice('文字を'.length, -'にする'.length))],
      });
    if (
      code.endsWith('にする') &&
      (m = splitCommandArgs(code.slice(0, -'にする'.length), ['の文字を']))
    )
      return statementNode('LooksCommand', line, { op: 'SET_TARGET_TEXT', args: m.map(e) });
    if (
      code.endsWith('を入れる') &&
      (m = splitCommandArgs(code.slice(0, -'を入れる'.length), ['に']))
    )
      return statementNode('LooksCommand', line, { op: 'SET_INPUT', args: m.map(e) });
    if (code.endsWith('\uff09\u3092\u5b9f\u884c\u3059\u308b')) {
      const p = code.indexOf('\uff08');
      if (p > 0) {
        const raw = code.slice(0, p),
          name = declarationName(raw);
        validateName(name, { callable: true });
        if (raw !== name && !raw.startsWith('\u3010'))
          throw new AkariError(
            'P201',
            '自分で 作った ブロックの 名前が 読めません。名前を【 】で かこんでください。れい：【ジャンプ】というてじゅんを行う',
            line.lineNo,
            1,
          );
        if (raw === name && !bareName(name))
          throw new AkariError(
            'P201',
            'この 名前は【 】で かこんでください。れい：【ジャンプ】というてじゅんを行う',
            line.lineNo,
            1,
          );
        const inner = code.slice(p + 1, -6);
        return statementNode('UserActionCall', line, {
          name,
          args: parseArgumentText(inner, symbols, ctx, line.lineNo),
        });
      }
    }
    m = line.code.match(/^(.+?)という変数を作り、初期値を(.+?)にする$/);
    if (m)
      return statementNode('LocalVariableDeclaration', line, {
        name: parsedDeclarationName(m[1]),
        initial: e(m[2]),
      });
    m = line.code.match(/^(.+?)というリストを作る$/);
    if (m)
      return statementNode('LocalListDeclaration', line, { name: parsedDeclarationName(m[1]) });
    if (code.endsWith('\u307e\u3067\u5f85\u3064')) {
      const clause = readConditionClause(code.slice(0, -2), symbols, {
        ...ctx,
        lineNo: line.lineNo,
        sourceLine: line,
      });
      if (clause) return statementNode('WaitUntil', line, { condition: clause.condition });
    }
    const t = parseTargetPrefix(code, symbols, ctx);
    if (t) {
      validateName(t.name);
      const rest = code.slice(t.len),
        target = { name: t.name, qualifier: t.qualifier };
      expressionCursor = t.len;
      const range = sourceRange(line.mapped?.positions || [], 0, t.len);
      if (range) SOURCE_RANGES.set(target, {range});
      if (rest.startsWith('に') && rest.endsWith('を追加する'))
        return statementNode('ListAppend', line, {
          target,
          value: e(rest.slice(1, -'を追加する'.length)),
        });
      if (rest.startsWith('の')) {
        let mm;
        if (
          rest.endsWith('を挿入する') &&
          (mm = splitCommandArgs(rest.slice(1, -'を挿入する'.length), ['番目に']))
        )
          return statementNode('ListInsert', line, { target, index: e(mm[0]), value: e(mm[1]) });
        if (
          rest.endsWith('にする') &&
          (mm = splitCommandArgs(rest.slice(1, -'にする'.length), ['番目を']))
        )
          return statementNode('ListReplace', line, { target, index: e(mm[0]), value: e(mm[1]) });
        if (rest.endsWith('番目を削除する'))
          return statementNode('ListDelete', line, {
            target,
            index: e(rest.slice(1, -'番目を削除する'.length)),
          });
      }
      if (rest === 'を空にする') return statementNode('ListClear', line, { target });
      if (rest.startsWith('に') && rest.endsWith('を足す'))
        return statementNode('NumericUpdate', line, {
          op: 'ADD',
          target,
          value: e(rest.slice(1, -'を足す'.length)),
        });
      if (rest.startsWith('から') && rest.endsWith('を引く'))
        return statementNode('NumericUpdate', line, {
          op: 'SUB',
          target,
          value: e(rest.slice(2, -'を引く'.length)),
        });
      if (rest.startsWith('を') && rest.endsWith('にする'))
        return statementNode('Assignment', line, {
          target,
          value: e(rest.slice(1, -'にする'.length)),
        });
    }
    try {
      parseExpression(line.code, symbols, { ...ctx, lineNo: line.lineNo });
    } catch (err) {
      if (err instanceof AkariError && err.code === 'P206') throw err;
    }
    throw new AkariError('P201', `「${line.code}」は 読めません。書き方を たしかめてください。`, line.lineNo, 1);
  }
  function parseArgumentText(inner, symbols, ctx, lineNo) {
    if (!inner) return [];
    const parts = [],
      stack = [];
    let start = 0,
      inStr = false;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (inStr) {
        if (ch === '」') inStr = false;
        continue;
      }
      if (ch === '「') {
        inStr = true;
        continue;
      }
      if (ch === '（' || ch === '［') {
        stack.push(ch);
        if (stack.length > LIMITS.expressionDepth)
          throw new AkariError('P208', '計算の 中に 計算が 入りすぎています。短い 計算に 分けてください', lineNo, i + 1);
      } else if (ch === '）' || ch === '］') {
        if (stack.pop() !== (ch === '）' ? '（' : '［'))
          throw new AkariError('P207', '入れるものの かっこが 合っていません。（ は ）で、［ は ］で とじてください', lineNo, i + 1);
      } else if (ch === '、' && !stack.length) {
        parts.push(inner.slice(start, i));
        start = i + 1;
      }
    }
    if (inStr)
      throw new AkariError('N101', '「 」の とじる しるしを 書いてください', lineNo, inner.length + 1);
    if (stack.length)
      throw new AkariError('P207', '入れるものの かっこが とじていません。（ は ）で、［ は ］で とじてください', lineNo, inner.length + 1);
    parts.push(inner.slice(start));
    return parts.map((x) => parseExpression(x, symbols, { ...ctx, lineNo }));
  }
  // The structural editing vocabulary is shared by validation and the pure block codec.
  // Positions belong to the returned nodeMap; blocks never carry source or a hidden AST.
  // Command presentation contract: one entry owns its label, argument order and canonical source.
  // Parser and runtime remain independent semantic checks; every operation is covered by the existing ledger.

