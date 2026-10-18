  // ────────────────────────────────────────────────────────────────────────
  // 04 — Syntax parsing (no persistent block representation)
  // ────────────────────────────────────────────────────────────────────────
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
      if (!this.take(s)) this.err(code, `「${s}」がたりません。書き足してください`);
    }
    parse() {
      if (!this.text) this.err('P205', '計算が書かれていません。数や文字を書いてください。れい：10');
      const n = this.logicalOr();
      if (!this.atEnd()) this.err('P201', `計算の「${this.text.slice(this.i)}」のところが読みとれません。書き方をたしかめてください`);
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
          this.err('P205','「より」は1回だけ書いてください。名前に「より」が入るときは【 】でかこみます。れい：【より道】が10より大きい');
        left = term(text.slice(split+2,-ending.length-1), split+2);
        right = term(text.slice(0,split), 0);
      } else {
        // The existing operand parser owns compounds such as キーが押されている.
        const p = parser(text, 0);
        left = p.additive();
        if (!p.take('が')) this.err('P205','くらべるもののあとに「が」を書いてください。れい：点数が10と同じ');
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
            'くらべることばがありません。おわりに「以上」「以下」「より大きい」「より小さい」「と同じ」「とちがう」のどれかを書いてください。れい：点数が10と同じ',
          );
        if (this.starts('が'))
          this.err('P206', 'くらべることを2つつづけては書けません。「かつ」で分けてください。れい：1が2より小さいかつ2が3より小さい');
        return exprNode('CompareExpression', { op, left, right });
      }
      if (this.take('の中に') || this.take('に')) {
        const right = this.additive();
        const negative = this.take('が入っていない') || this.take('\u304c\u542b\u307e\u308c\u3066\u3044\u306a\u3044');
        if (!negative && !this.take('が入っている')) this.expect('\u304c\u542b\u307e\u308c\u3066\u3044\u308b');
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
        this.err('P208', '計算の中に計算が入りすぎています。短い計算に分けてください');
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
          n = exprNode('SensorRead', { sensor: 'DISTANCE_TO', arg: n });
        else if (this.take('キーがおされていない') || this.take('\u30ad\u30fc\u304c\u62bc\u3055\u308c\u3066\u3044\u306a\u3044'))
          n = exprNode('UnaryExpression', {
            op: 'NOT',
            value: exprNode('SensorRead', { sensor: 'KEY_DOWN', arg: n }),
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
            value: exprNode('SensorRead', { sensor: 'TOUCHING', arg: n }),
          });
        else if (this.take('キーがおされている') || this.take('\u30ad\u30fc\u304c\u62bc\u3055\u308c\u3066\u3044\u308b'))
          n = exprNode('SensorRead', { sensor: 'KEY_DOWN', arg: n });
        else if (this.take('の色に触れている') || this.take('色に触れている'))
          n = exprNode('SensorRead', { sensor: 'TOUCHING_COLOR', arg: n });
        else if (this.take('に触れている'))
          n = exprNode('SensorRead', { sensor: 'TOUCHING', arg: n });
        else if (this.take('にふれていない')) n = exprNode('UnaryExpression', {op:'NOT',value:exprNode('SensorRead',{sensor:'TOUCHING',arg:n})});
        else if (this.take('の色にふれていない') || this.take('色にふれていない')) n = exprNode('UnaryExpression',{op:'NOT',value:exprNode('SensorRead',{sensor:'TOUCHING_COLOR',arg:n})});
        else if (this.take('の色にふれている') || this.take('色にふれている')) n = exprNode('SensorRead',{sensor:'TOUCHING_COLOR',arg:n});
        else if (this.take('にふれている')) n = exprNode('SensorRead',{sensor:'TOUCHING',arg:n});
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
        else this.err('P205', 'ここには「あてはまる」か「あてはまらない」のどちらかを書いてください');
        this.expect('）');
        return exprNode('BooleanLiteral', {value});
      }
      if (this.take('条件（')) {
        const value=this.logicalOr(); this.expect('）');
        if(this.take('が成り立たない')) return exprNode('UnaryExpression',{op:'NOT',value});
        this.expect('が成り立つ'); return value;
      }
      if (this.take('コピーではない')) return exprNode('UnaryExpression',{op:'NOT',value:exprNode('SensorRead',{sensor:'クローンである'})});
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
        if (/(?:をつなげた文字|で(?:割|わ)った(?:あまり|余り)|をかけた(?:数|答え)|を足した(?:数|答え)|を引いた(?:数|答え)|で割った(?:数|答え))$/.test(surfaceMask(inner))) {
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
            if (!['\\',open,close].includes(escaped)) this.err('N103','「 」の中の \\ のつぎには、\\ か「 か 」しか書けません。\\ を文字として使うときは \\\\ と書きます');
            value += escaped;
          } else value += ch;
        }
        if (!closed) this.err('N101','「の あとの 」が ありません。文字の おわりに 」を 書いてください');
        if (cpLen(value) > LIMITS.stringChars) this.err('R413','文字が長すぎます');
        // A quoted part name followed by の reads that part's state, as the unquoted name does:
        // 「たくどん」のよこのばしょ is たくどんのよこのばしょ. Text suffixes (の長さ, の2文字目, ...) stay text.
        if (open === '「' && this.starts('の') && !['の数だけ','の値','の答え','の中身','の長さ','の文字数','の色','のどれか','の中で','の中に','のあまり','の余り'].some(t => this.starts(t)) && !(this.starts('の音') && this.i + 2 === this.text.length) &&
          !this.findTopSuffix(['番目','文字目'])) {
          validateName(value); this.i++;
          if (++this.depth + (this.ctx._parserDepth||0) > LIMITS.expressionDepth) this.err('P208','計算の中に計算が入りすぎています。短い計算に分けてください');
          try { return exprNode('ActorQualifiedRead',{actorRef:{kind:'named',name:value},value:this.basic()}); }
          finally { this.depth--; }
        }
        return exprNode('StringLiteral', { value });
      }
      if (this.take('自分の')) {
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
          this.err('N102', '数が大きすぎます。もっと小さい数にしてください');
        return exprNode('NumberLiteral', { value });
      }
      // Sensors are read by their written words; a few internal names are written differently.
      for (const [surface, sensor] of [...FIXED_SENSORS.filter((s) => !SENSOR_CUT_WORDS.includes(s)).map((s) => [s, s]), ...Object.entries(SENSOR_SURFACES).map(([s, w]) => [w, s])].sort((a, b) => b[0].length - a[0].length)) {
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
        if (!found) this.err('E703', '「拡張計算」のあとに、「 」でかこんだ名前を2つ書いてください');
        const name = EXTENSION_HOST.resolve(found[1], found[2], 'calculations');
        if (!name) this.err('E703', '使いたい「拡張計算」が見つかりません。名前をたしかめてください');
        this.i += found[0].length; this.expect('（'); const args = [];
        if (!this.take('）')) for (;;) { args.push(this.logicalOr()); if (this.take('）')) break; this.expect('、'); }
        return exprNode('ExtensionCalculation', { name, args });
      }
      if (EXTENSION_HOST.operations('events').length && this.take('拡張「できごとの値」'))
        return exprNode('SensorRead', { sensor: '拡張の値' });
      if (EXTENSION_HOST.operations('events').length && this.starts('拡張の値') && !extensionValueIsData(this.symbols, this.ctx)) {
        this.i += '拡張の値'.length; return exprNode('SensorRead', { sensor: '拡張の値' });
      }
      // 「画面のはし」 and 「画面の端」 name the stage edge, the same target as the bare word 端.
      // A bare はし stays a name: a part may be called はし (橋, 箸).
      const edgeWord = ['画面のはし', '画面の端'].find((w) => this.starts(w) && nameBoundary(this.text, this.i + w.length));
      if (edgeWord) {
        this.i += edgeWord.length;
        return exprNode('StringLiteral', { value: '端' });
      }
      const builtinWords = [...BUILTIN_NAMES, ...Object.values(BUILTIN_SURFACES)];
      const builtin = builtinWords.sort((a,b) => b.length-a.length).find(name => this.starts(name+'（'));
      const builtinName = builtin && (Object.keys(BUILTIN_SURFACES).find((n) => BUILTIN_SURFACES[n] === builtin) || builtin);
      const token = builtin ? {name:builtinName,end:this.i+builtin.length,exact:false} : readNameToken(this.text, this.i);
      if (!token) this.err('P205', '読みとれないところがあります。書き方をたしかめてください');
      this.i = token.end;
      // 名前一覧の数／名前一覧の個数 is the list's length, the same as 名前一覧の長さ.
      if (!builtin && dataNameKind(token.name, this.symbols, this.ctx) === 'list' && (this.starts('の個数') || (this.starts('の数') && !this.starts('の数だけ')))) {
        this.i += this.starts('の個数') ? 3 : 2;
        return exprNode('BuiltinCall', { name: 'LENGTH', args: [exprNode('VariableRead', { name: token.name, qualifier: token.exact ? 'exact' : null })] });
      }
      if (this.starts('の') && !['の数だけ','の値','の答え','の中身','の長さ','の文字数','の色','のどれか','の中で','の中に','のあまり','の余り'].some(t => this.starts(t)) && !(this.starts('の音') && this.i + 2 === this.text.length)) {
        const suffix = this.findTopSuffix(['番目','文字目']);
        if (!suffix) {
          validateName(token.name); this.i++;
          if (++this.depth + (this.ctx._parserDepth||0) > LIMITS.expressionDepth) this.err('P208','計算の中に計算が入りすぎています。短い計算に分けてください');
          try { return exprNode('ActorQualifiedRead',{actorRef:{kind:'named',name:token.name},value:this.basic()}); }
          finally { this.depth--; }
        }
      }
      if (this.take('\uff08')) {
        if (!token.exact && !BUILTIN_NAMES.has(token.name) && !bareName(token.name))
          this.err(
            'P205',
            'この名前は【名前】のように【 】でかこんでください',
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
        if (WORD_LITERALS.includes(token.name))
          return exprNode('StringLiteral', { value: token.name });
      }
      if (!token.exact && RESERVED.has(token.name)) this.err('P205','あかりで使うことばと同じ名前は、【名前】のように【 】でかこんで書いてください');
      validateName(token.name);
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
          if (split < 1 || split !== itemMask.lastIndexOf('を')) this.err('P205','名前と入れるものを「を」でつないで書きます。れい：点数を10として、');
          const t = readNameToken(item.slice(0,split));
          if (!t || t.end !== split) this.err('P205','入れるものの 名前を たしかめてください。れい：点数を10として、');
          if (argumentNames.includes(t.name)) this.err('P205',`入れるものの名前「${t.name}」を2回書いています。名前は1回ずつ書いてください`);
          argumentNames.push(t.name); args.push(parse(item.slice(split+1),begin+split+1)); begin=j+1;
        }
      } else if (positional >= 0) {
        const values = tail.slice(0,positional);
        if (!values.startsWith('（') || !values.endsWith('）')) this.err('P205','入れるものを（ ）で かこんでください。れい：（10、「あかり」）をわたして、');
        const inner=values.slice(1,-1), visible=surfaceMask(inner); let begin=0;
        for(let j=0;j<=inner.length;j++) if(j===inner.length || visible[j]==='、') {
          if(inner.length) args.push(parse(inner.slice(begin,j),1+begin)); begin=j+1;
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
      if (!t) this.err('P205', '名前がありません。ここに名前を書いてください');
      if (!t.exact && !bareName(t.name))
        this.err(
          'P205',
          'この名前は【名前】のように【 】でかこんでください',
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
        throw new AkariError('P208', '計算の中に計算が入りすぎています。短い計算に分けてください', line, 1);
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
  function parseExpression(text, symbols, ctx = {}) {
    const compact=compactOutsideString(text),mask=surfaceMask(compact),depth=(ctx._parserDepth||0)+1;
    const located=node=>{const range=sourceRange(ctx.sourcePositions||[]);if(range)SOURCE_RANGES.set(node,{...SOURCE_RANGES.get(node),range});return checkExpressionTree(node,ctx.lineNo||0);};
    if(depth>LIMITS.expressionDepth)throw new AkariError('P208','計算の中に計算が入りすぎています。短い計算に分けてください',ctx.lineNo||0,1);
    if(compact.startsWith('（')&&compact.endsWith('）')&&/^\u0001+$/.test(mask))
      return located(parseExpression(compact.slice(1,-1),symbols,{...ctx,_parserDepth:depth,sourcePositions:ctx.sourcePositions?.slice(1,-1)}));
    if (mask.startsWith('今の') && !symbols?.project?.components.some(component=>component.name==='今'))
      return located(parseExpression(compact.slice(2),symbols,{...ctx,_parserDepth:depth,sourcePositions:ctx.sourcePositions?.slice(2)}));
    const arithmetic=[['をかけた',/^(.+?)と(.+?)をかけた(?:数|答え)$/d,'MUL'],['を足した',/^(.+?)(?:に|と)(.+?)を足した(?:数|答え)$/d,'ADD'],['を引いた',/^(.+?)から(.+?)を引いた(?:数|答え)$/d,'SUB'],['で割った',/^(.+?)を(.+?)で割った(?:数|答え)$/d,'DIV']];
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
      if(literal.kind!=='StringLiteral')throw new AkariError('P205','自分で作ったブロックの名前を「 」で1つだけ書いてください');
      name=literal.value;
    }else{
      const token=readNameToken(text);
      if(!token||token.end!==text.length)throw new AkariError('P205','自分で作ったブロックの名前は、【名前】のように【 】でかこんで書いてください');
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
  function naturalConditionVariants(source, form) {
    const out = [];
    const mask0 = surfaceMask(source);
    if (mask0.includes('になったら')) return out;
    const word = (text, from, to) => {
      const mask = surfaceMask(text);
      let result = '', at = 0, i;
      while ((i = mask.indexOf(from, at)) >= 0) { result += text.slice(at, i) + to; at = i + from.length; }
      return result + text.slice(at);
    };
    const ending = (text, from, to) => surfaceMask(text).endsWith(from) ? text.slice(0, -from.length) + to : text;
    let text = source;
    // キーをおす (active) is the same as キーがおされる
    for (const [from, to] of [['キーをおしていなければ', 'キーがおされていなければ'], ['キーを押していなければ', 'キーが押されていなければ'],
      ['キーをおしていなくて', 'キーがおされていなくて'], ['キーをおしていない', 'キーがおされていない'], ['キーをおして', 'キーがおされて'], ['キーを押して', 'キーが押されて'],
      ['キーをおさなくなるまで', 'キーがおされなくなるまで'], ['キーを押さなくなるまで', 'キーが押されなくなるまで'],
      ['キーをおすまで', 'キーがおされるまで'], ['キーを押すまで', 'キーが押されるまで'], ['キーをおしたら', 'キーがおされたら'], ['キーを押したら', 'キーが押されたら']])
      text = word(text, from, to);
    // 未満／より多い／より少ない
    for (const [from, to] of [['未満ではなくて', 'より小さくなくて'], ['未満ではない', 'より小さくない'], ['未満でなければ', 'より小さくなければ'], ['未満のあいだ', 'より小さいあいだ'],
      ['未満になるまで', 'より小さくなるまで'], ['未満なら', 'より小さいなら'], ['未満で', 'より小さくて'], ['より多', 'より大き'], ['より少な', 'より小さ']])
      text = word(text, from, to);
    text = ending(text, '未満', 'より小さい');
    // 〜があれば (with に) is 〜が入っていれば
    if (/に.+が(?:あれば|なければ|あるあいだ|ないあいだ|ある|ない|あったら|なかったら)$/.test(surfaceMask(text)))
      for (const [from, to] of [['があったら', 'が入っていれば'], ['がなかったら', 'が入っていなければ'], ['があれば', 'が入っていれば'], ['がなければ', 'が入っていなければ'],
        ['があるあいだ', 'が入っているあいだ'], ['がないあいだ', 'が入っていないあいだ'], ['がある', 'が入っている'], ['がない', 'が入っていない']])
        if (surfaceMask(text).endsWith(from)) { text = ending(text, from, to); break; }
    // たら (only after もし, form if)
    if (form === 'if')
      for (const [from, to] of [['でなかったら', 'でなければ'], ['くなかったら', 'くなければ'], ['ていなかったら', 'ていなければ'], ['わなかったら', 'わなければ'],
        ['だったら', 'なら'], ['かったら', 'ければ'], ['ていたら', 'ていれば'], ['ちがったら', 'ちがえば'], ['違ったら', '違えば'],
        ['されたら', 'されていれば'], ['れたら', 'れていれば'], ['入ったら', '入っていれば']])
        if (surfaceMask(text).endsWith(from)) { text = ending(text, from, to); break; }
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
    // 点数が10以上で20以下 (one subject): the second condition takes the same subject
    for (const base of [text, source]) {
      const one = surfaceCapture(/^((?:もし、?)?)(.+?)が(.+?(?:以上|以下|より大きく|より小さく|と同じ))(で|て)(?!、)([^が]+)$/d, base);
      if (one) out.push(one[0].text + one[1].text + 'が' + one[2].text + one[3].text + '、' + one[1].text + 'が' + one[4].text);
      // 点数が1か2なら (values) is 点数が1と同じか、点数が2と同じなら
      const pair = form === 'if' && surfaceCapture(/^((?:もし、?)?)(.+?)が([^、か]+?)か([^、か]+?)(なら(?:ば)?)$/d, base);
      if (pair) out.push(pair[0].text + pair[1].text + 'が' + pair[2].text + 'と同じか、' + pair[1].text + 'が' + pair[3].text + 'と同じ' + pair[4].text);
      // A かつ B／A または B (two plain conditions) is the explicit 条件（…）
      const joined = form !== 'plain' && form !== 'and' && surfaceCapture(/^((?:もし、?)?)(.+(?:かつ|または).+?)(なら(?:ば)?|あいだ|間|になるまで|まで)$/d, base);
      if (joined) out.push(joined[0].text + '条件（' + joined[1].text + '）が成り立つ' + (joined[2].text.startsWith('なら') ? 'なら' : joined[2].text.startsWith('あいだ') || joined[2].text === '間' ? 'あいだ' : 'まで'));
    }
    return [...new Set(out)].filter(t => t !== source);
  }
  function parseCondition(text, symbols, ctx = {}, form = 'plain') {
    // 点数がちょうど10なら: ちょうど is not part of the value (ちょうど10 was read as a name).
    const exact = surfaceMask(compactOutsideString(text)).match(/が(?:ちょうど)(?=[0-9０-９「（【－])/);
    if (exact && !ctx.naturalCondition) {
      const plain = compactOutsideString(text).replace(/がちょうど(?=[0-9０-９「（【－])/, 'が');
      return parseCondition(plain, symbols, { ...ctx, sourcePositions: undefined, sourceLine: undefined }, form);
    }
    try { return parseConditionAsWritten(text, symbols, ctx, form); }
    catch (error) {
      if (!(error instanceof AkariError) || ctx.naturalCondition) throw error;
      for (const variant of naturalConditionVariants(compactOutsideString(text), form)) {
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
    if (source.endsWith('、')) {source=source.slice(0,-1);ctx={...ctx,sourcePositions:ctx.sourcePositions?.slice(0,-1)};}
    const mask=surfaceMask(source);
    const fail = message => { throw new AkariError('P205',message,ctx.lineNo||0,1); };
    if (mask.includes('になったら')) fail('「になったら」はここでは使えません。いまのようすをしらべるなら「もし点数が10と同じなら、」、そうなるまで 待つなら「点数が10と同じになるまで待つ」のように書きます');
    // Explicit Boolean expression: its parentheses determine scope and operator precedence.
    if (source.startsWith('条件（')) {
      const endings = form === 'if' ? ['が成り立つなら','が成り立つならば','が成り立つのであれば','が成り立たないなら','が成り立たないならば','が成り立たないのであれば'] : form === 'while' ? ['が成り立つあいだ','が成り立つ間','が成り立たないあいだ','が成り立たない間'] : form === 'until' ? ['が成り立つまで','が成り立たないまで'] : ['が成り立つ','が成り立たない'];
      const ending=endings.find(e=>mask.endsWith(e));
      if (!ending || source[source.length-ending.length-1] !== '）') fail('「条件（ ）」の（ ）がとじているか、そのあとに「が成り立つ」があるかをたしかめてください。れい：もし条件（1が1と同じかつ（2が2と同じまたは3が3と同じ））が成り立つなら、');
      const node=parseExpression(source.slice(3,-ending.length-1),symbols,{...ctx,sourcePositions:ctx.sourcePositions?.slice(3,-ending.length-1),_parserDepth:(ctx._parserDepth||0)+1});
      return ending.includes('成り立たない') ? exprNode('UnaryExpression',{op:'NOT',value:node}) : node;
    }
    const commas=[]; for(let i=0;i<mask.length;i++) if(mask[i]==='、') commas.push(i);
    if (commas.length) {
      if (commas.length !== 1) fail('きまりを3つ いじょう つなぐときは、「条件（…）」でひとまとめにしてください');
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
      if (form !== 'plain' || (mask.includes('かつ') && mask.includes('または'))) fail('いくつかのきまりをつなぐときは、「条件（…）」でひとまとめにしてください。れい：もし条件（1が1と同じかつ（2が2と同じまたは3が3と同じ））が成り立つなら、');
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
        if(split<1) fail('ふれる相手の名前を「に」の前に書いてください');
        const color=body.slice(0,split).endsWith('の色'), target=body.slice(0,split-(color?2:0)), t=readNameToken(target);
        const operand=t && t.end===target.length ? exprNode('StringLiteral',{value:t.name}) : parseExpression(target,symbols,ctx);
        node=exprNode('ActorQualifiedRead',{actorRef:{kind:'named',name:subject.name},value:exprNode('SensorRead',{sensor:color?'TOUCHING_COLOR':'TOUCHING',arg:operand})});
        const actorRange=sourceRange(ctx.sourcePositions||[],0,subject.end);if(actorRange)SOURCE_RANGES.set(node,{actorRange});
      } else node=parseExpression(base,symbols,ctx);
      return negative?exprNode('UnaryExpression',{op:'NOT',value:node}):node;
    }
    if (form === 'if') {
      const equality = surfaceCapture(/^(.+?)が(.+?)なら(?:ば)?$/d, source);
      if (equality) {
        const operands = equality.map(part=>parseExpression(part.text,symbols,{...ctx,sourcePositions:ctx.sourcePositions?.slice(part.start,part.end)}));
        return exprNode('CompareExpression',{op:'EQ',left:operands[0],right:operands[1]});
      }
    }
    if(form==='plain') return parseExpression(source,symbols,ctx);
    fail(form==='if'
      ? 'くらべるものと「なら」をたしかめてください。「なら、」のあとの行に動きを書きます。れい：もし答えが「ほし」と同じなら、'
      : form==='while' ? 'つづけるきまりのおわりを「あいだ」にしてください。れい：点数が10より小さいあいだ、くり返す。' : 'やめるきまりのおわりを「まで」にしてください。れい：点数が10と同じになるまで、くり返す。');
  }
  function formatCondition(node, form = 'plain') {
    const negative=node.kind==='UnaryExpression'&&node.op==='NOT', value=negative?node.value:node;
    if (!negative && value.kind==='LogicalExpression' && ['if','while','until'].includes(form)) {
      const atomic=n => n.kind!=='LogicalExpression' && !(n.kind==='UnaryExpression' && n.op==='NOT' && n.value.kind==='LogicalExpression');
      if(atomic(value.left) && atomic(value.right)) {
        const left=formatCondition(value.left,value.op==='AND'?'and':'plain'), right=formatCondition(value.right,form);
        if(!left.startsWith('条件（') && !right.startsWith('条件（')) return `${left}${value.op==='OR'?'か':''}、${right}`;
      }
    }
    if(value.kind==='LogicalExpression' || (negative && value.kind==='UnaryExpression')) {
      const expression=formatExpressionCore(value), tail=negative?'成り立たない':'成り立つ';
      return `条件（${expression}）が${tail}${form==='if'?'なら':form==='while'?'あいだ':form==='until'?'まで':''}`;
    }
    const source=value.kind==='ActorQualifiedRead' && value.value.kind==='SensorRead' && ['TOUCHING','TOUCHING_COLOR'].includes(value.value.sensor) ? `${nameSource(value.actorRef.name)}が${formatExpressionCore(value.value)}` : formatExpressionCore(value), mask=surfaceMask(source);
    const record=CONDITION_FORMS.find(r=>mask.endsWith(r.plain));
    if(record) {
      const forms=conditionFormCandidates(record,form), match=forms.find(([,no])=>no===negative);
      if(match) return source.slice(0,-record.plain.length)+match[0];
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
        'この名前は【名前】のように【 】でかこんでください',
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
    const args={MOVE:[['歩数','歩']],MOVE_DIRECTION:[['歩数','歩']],GOTO:[['よこのばしょ','歩'],['たてのばしょ','歩']],GLIDE:[['時間','秒'],['よこのばしょ','歩'],['たてのばしょ','歩']],GLIDE_DIRECTION:[['時間','秒'],['歩数','歩']],SET_DIRECTION:[['向き','度']],TURN_RIGHT:[['角度','度']],TURN_LEFT:[['角度','度']],SET_X:[['よこのばしょ','歩']],SET_Y:[['たてのばしょ','歩']],POINT_TO:[['向く相手',null]],SET_SCALE:[['大きさ','％']],SET_VOLUME:[['音の大きさ','％']],TONE:[['周波数','Hz'],['長さ','秒']],TONE_WAIT:[['周波数','Hz'],['長さ','秒']],SET_TARGET_TEXT:[['部品',null],['文字',null]],SET_INPUT:[['入力らん',null],['中身',null]],FORWARD_LAYERS:[['いくつ',null]],BACKWARD_LAYERS:[['いくつ',null]],SET_COLOR:[['色',null]],SET_COSTUME:[['すがた',null]],SET_BACKDROP:[['はいけい',null]],SET_SELF_TEXT:[['文字',null]],SET_SIZE:[['太さ',null]],SAMPLE:[['音',null]],SAMPLE_WAIT:[['音',null]],PITCH_UP:[['音の高さ',null]],PITCH_DOWN:[['音の高さ',null]],CREATE_TARGET:[['コピーの元',null]]};
    const slots=[...(values[kind] || (args[op]||[]).map(([label,unit],i)=>expr(`args.${i}`,label,unit)))];
    if(kind==='Say'&&role==='timedSpeech')slots.push(expr('seconds','話す時間','秒'));
    slots.unshift(Object.freeze({path:'actorRef',label:'動く対象',type:'actor',unit:null,required:true}));
    if(['LocalVariableDeclaration','LocalListDeclaration','UserActionCall'].includes(kind))slots.push(Object.freeze({path:'name',label:'名前',type:'name',unit:null,required:true}));
    if(kind==='WaitBroadcastGroup')slots.push(Object.freeze({path:'broadcastRef',label:'すぐ前の合図',type:'reference',unit:null,required:true}));
    if(kind==='ForEach')slots.push(Object.freeze({path:'binder',label:'今見ているものの名前',type:'name',unit:null,required:true}));
    if(['MOVE_DIRECTION','GLIDE_DIRECTION'].includes(op)||kind==='ContinuousRule')slots.push(Object.freeze({path:'direction',label:'方向',type:'direction',unit:null,required:true}));
    return Object.freeze(slots);
  }
  function sentenceFormRecord(id,pattern,kind,op,role) {
    const roleSlots=sentenceRoleSlots(kind,op,role),semanticOperation=op?`${kind}:${op}`:kind;
    const labels={Assignment:'中身をかえる',NumericUpdate:'中身を増やす・減らす',ListAppend:'最後に入れる',ListInsert:'とちゅうに入れる',ListReplace:'何番目かの中身をかえる',ListDelete:'何番目かを消す',ListClear:'中身を全部消す',IfStatement:'条件で分ける',RepeatCount:'回数を決めてくり返す',RepeatWhile:'あいだくり返す',RepeatUntil:'までくり返す',Forever:'ずっとくり返す',ForEach:'中身を一つずつ見る',WaitTime:'時間を待つ',WaitBroadcastGroup:'その合図で始まったことが全部終わるまで待つ',WaitUntil:'条件を待つ',Say:'内容を言う',Ask:'たずねて答えを待つ',Broadcast:'合図を送る',BroadcastAndWait:'合図を送って、全部終わるまで待つ',LocalVariableDeclaration:'この中だけの へんすうを作る',LocalListDeclaration:'この中だけのリストを作る',ReturnStatement:'答えを返す',UserActionCall:'手順を行う',NoOperation:'何もしない',Break:'このくり返しを終える',Continue:'次の回へ進む',MotionCommand:'ばしょや向きをかえる',LooksCommand:'見た目をかえる',PenCommand:'線をかく・スタンプをおす',SoundCommand:'音を鳴らす・かえる',CloneCommand:'コピーを作る・消す',StopCommand:'動きを止める',ContinuousRule:'条件のあいだ動き続ける'};
    const verbs={MotionCommand:['動く','動いて','動かす','動かして','進む','進んで','回る','回って','向く','向いて','行く','行って','すべる','すべって'],Say:['言う','言って','話す','話して','言わせる','言わせて'],WaitTime:['待つ','待って'],UserActionCall:['行う','行って'],SoundCommand:['鳴らし始める','鳴らし始めて','鳴らす','鳴らして'],NumericUpdate:['足す','足して','引く','引いて','増やす','減らす']};
    return Object.freeze({id,pattern,kind,op,role,intent:labels[kind]||kind,semanticOperation,roleSlots,
      clauses:Object.freeze(roleSlots.map(slot=>Object.freeze({role:slot.path,label:slot.label,unit:slot.unit}))),
      verbForms:Object.freeze(verbs[kind]||[]),nounForms:Object.freeze(roleSlots.map(slot=>slot.label)),
      acceptedReadings:Object.freeze(pattern?[pattern.source]:[role]),evaluationOrder:Object.freeze(roleSlots.filter(slot=>['expression','condition','arguments'].includes(slot.type)).map(slot=>slot.path)),
      allowedContexts:Object.freeze(kind==='ReturnStatement'?['function']:['LocalVariableDeclaration','LocalListDeclaration'].includes(kind)?['action','function']:kind==='ContinuousRule'?['script']:['Assignment','NumericUpdate','ListAppend','ListInsert','ListReplace','ListDelete','ListClear','IfStatement','RepeatCount','RepeatWhile','RepeatUntil','Forever','ForEach','LocalVariableDeclaration','LocalListDeclaration','ReturnStatement','NoOperation','Break','Continue'].includes(kind)?['script','action','function']:['script','action']),
      render:node=>renderSentenceNode(node),preview:node=>renderSentenceNode(node),errors:Object.freeze(['P201','P202','P205'])});
  }
  function sentenceFormFor(node) {if (node.kind === 'ExtensionCommand') return { kind: node.kind, allowedContexts: ['script', 'action'], roleSlots: [], render: n => extensionSurface(n.name, false, n.args), preview: n => extensionSurface(n.name, false, n.args) };return SENTENCE_FORMS.find(form=>form.kind===node.kind&&(!form.op||form.op===node.op));}
  function renderSentenceNode(n) {
    const f=formatExpression,t=n.target?formatTarget(n.target):'';
    switch(n.kind){
      case 'Assignment':return `${t}を${f(n.value)}にする`;
      case 'NumericUpdate':return `${t}を${f(n.value)}${n.op==='ADD'?'増やす':'減らす'}`;
      case 'ListAppend':return `${t}の最後に${f(n.value)}を入れる`;
      case 'ListInsert':return `${t}の${sentenceQuantitySource(n.index,'番目')}に${f(n.value)}を入れる`;
      case 'ListReplace':return `${t}の${sentenceQuantitySource(n.index,'番目')}を${f(n.value)}にかえる`;
      case 'ListDelete':return `${t}の${sentenceQuantitySource(n.index,'番目')}を消す`;
      case 'ListClear':return `${t}の中身を全部消す`;
      case 'NoOperation':return '何もしない';case 'Break':return 'このくり返しを終える';case 'Continue':return 'この回の残りをとばして、次の回へ進む';
      case 'WaitTime':return `${sentenceQuantitySource(n.seconds,'秒')}待つ`;
      case 'WaitBroadcastGroup':return 'その合図で始まったことが全部終わるまで待つ';
      case 'WaitUntil':return `${conditionSource(n.condition,'until')}待つ`;
      case 'Say':if(n.seconds!==undefined)return `${f(n.value)}${n.value.kind==='StringLiteral'?'と':'を'}${sentenceQuantitySource(n.seconds,'秒')}話す`;if(n.value.kind==='VariableRead'||(n.value.kind==='ActorQualifiedRead'&&n.value.value.kind==='VariableRead'))return `${f(n.value)}の値を言う`;if(n.value.kind==='BuiltinCall'&&n.value.name==='つなぐ'&&n.value.args.length>=2)return `${n.value.args.map(joinPartSource).join('と')}をつなげて言う`;return ['CompareExpression','LogicalExpression'].includes(n.value.kind)||(n.value.kind==='UnaryExpression'&&n.value.op==='NOT')?`（${f(n.value)}）の値を言う`:`${f(n.value)}${n.value.kind==='StringLiteral'?'と':'を'}言う`;
      case 'Ask':return `${f(n.question)}とたずねて、答えを待つ`;
      case 'Broadcast':return `${f(n.message)}の合図を送る`;
      case 'BroadcastAndWait':return `${f(n.message)}の合図を送って、その合図で始まったことが全部終わるまで待つ`;
      case 'LocalVariableDeclaration':return `この中だけで使う変数【${n.name}】を作り、最初は${f(n.initial)}にする`;
      case 'LocalListDeclaration':return `この中だけで使うリスト【${n.name}】を空で作る`;
      case 'ReturnStatement':return `${f(n.value)}を答えとして返す`;
      case 'UserActionCall':return (n.argumentNames?n.args.map((value,i)=>`${nameSource(n.argumentNames[i])}を${f(value)}`).join('、')+'として、':n.args.length?'（'+n.args.map(value=>f(value)).join('、')+'）をわたして、':'')+`【${n.name}】という手順を行う`;
      case 'StopCommand':return {THIS:'この動きを止める',OTHERS:'ほかの動きをぜんぶ止める',ALL:'作品ぜんぶを止める'}[n.op];
      case 'MotionCommand':case 'LooksCommand':case 'PenCommand':case 'SoundCommand':case 'CloneCommand':return formatCommand(n);
      case 'IfStatement':return 'もし'+formatCondition(n.condition,'if')+'、';
      case 'RepeatCount':return sentenceQuantitySource(n.count,'回')+'くり返す';
      case 'RepeatWhile':case 'RepeatUntil':return conditionSource(n.condition,n.kind==='RepeatWhile'?'while':'until')+'、くり返す';
      case 'Forever':return 'ずっとくり返す';
      case 'ForEach':return f(n.list)+'の中身を先頭から一つずつ見て、次のことを行う';
      case 'ContinuousRule':return `${formatCondition(n.condition,'while')}、${sentenceActorSource(n.actorRef)}は${{forward:'前',backward:'後ろ',right:'画面の右',left:'画面の左',up:'画面の上',down:'画面の下'}[n.direction]}へ${sentenceQuantitySource(n.seconds,'秒')}に${sentenceQuantitySource(n.distance,'歩')}の速さで動き続ける`;
      default:throw new AkariError('P201',`この文の書き方は、まだ用意されていません: ${n.kind}`);
    }
  }
  // Finite surface records: protected operands are captured by position, never rewritten.
  const SENTENCE_FORMS = Object.freeze([
    ...[
      ['IfStatement','block'],['RepeatCount','block'],['RepeatWhile','block'],['RepeatUntil','block'],['Forever','block'],['ForEach','block'],
      ['WaitBroadcastGroup','broadcastWait'],['WaitUntil','condition'],['UserActionCall','call'],['MotionCommand:MOVE','motion'],['MotionCommand:GOTO','motion'],['MotionCommand:GLIDE','motion'],
      ['MotionCommand:MOVE_DIRECTION','motion'],['MotionCommand:GLIDE_DIRECTION','motion'],['LooksCommand:SET_INPUT','input'],['ContinuousRule','rule']
    ].map(([id,phase])=>[id,null,id.split(':')[0],id.split(':')[1]||null,phase]),
    ['NoOperation', /^何もしない$/d, 'NoOperation'],
    ['Break', /^(?:いま|この)のくり返しを終える$/d, 'Break'],
    ['Continue', /^この回の残りをとばして、次の回へ進む$/d, 'Continue'],
    ['StopCommand:THIS', /^(?:この実行|この動き)を止める$/d, 'StopCommand', 'THIS'],
    ['StopCommand:OTHERS', /^ほかの(?:実行をすべて|動きをぜんぶ)止める$/d, 'StopCommand', 'OTHERS'],
    ['StopCommand:ALL', /^作品(?:全体|ぜんぶ)を止める$/d, 'StopCommand', 'ALL'],
    ['LooksCommand:HIDE', /^(?:姿|すがた)を(?:かくす|隠す)$/d, 'LooksCommand', 'HIDE'],
    ['LooksCommand:SHOW', /^(?:姿|すがた)を(?:見せる|みせる)$/d, 'LooksCommand', 'SHOW'],
    ['LooksCommand:FRONT', /^いちばん手前へ出る$/d, 'LooksCommand', 'FRONT'],
    ['LooksCommand:BACK', /^いちばん(?:おく|奥)へ下がる$/d, 'LooksCommand', 'BACK'],
    ['MotionCommand:BOUNCE', /^(?:画面の(?:はし|端)|端)に(?:ふれて|触れて)いれば、?(?:はね返る|跳ね返る)$/d, 'MotionCommand', 'BOUNCE'],
    ['PenCommand:DOWN', /^ペンを下ろす$/d, 'PenCommand', 'DOWN'],
    ['PenCommand:UP', /^ペンを上げる$/d, 'PenCommand', 'UP'],
    ['PenCommand:STAMP', /^(?:今の(?:姿|すがた)の)?スタンプを(?:押|お)す$/d, 'PenCommand', 'STAMP'],
    ['PenCommand:CLEAR', /^作品の線とスタンプを全部(?:消す|けす)$/d, 'PenCommand', 'CLEAR'],
    ['SoundCommand:STOP_ALL', /^すべての音を止める$/d, 'SoundCommand', 'STOP_ALL'],
    ['CloneCommand:CREATE_SELF', /^自分のコピーを作る$/d, 'CloneCommand', 'CREATE_SELF'],
    ['CloneCommand:CREATE_SELF:count', /^自分のコピーを(.+?)体作る$/d, 'CloneCommand', 'CREATE_SELF', 'cloneCount'],
    ['CloneCommand:DELETE_SELF', /^このコピーだけを(?:消す|けす)$/d, 'CloneCommand', 'DELETE_SELF'],
    ['LooksCommand:NEXT_BACKDROP', /^次の(?:背景|はいけい)に(?:変える|かえる)$/d, 'LooksCommand', 'NEXT_BACKDROP'],
    ['LooksCommand:PREV_BACKDROP', /^前の(?:背景|はいけい)に(?:変える|かえる)$/d, 'LooksCommand', 'PREV_BACKDROP'],
    ['LooksCommand:NEXT_COSTUME', /^次の(?:衣装|すがた)に(?:変える|かえる)$/d, 'LooksCommand', 'NEXT_COSTUME'],
    ['LooksCommand:PREV_COSTUME', /^前の(?:衣装|すがた)に(?:変える|かえる)$/d, 'LooksCommand', 'PREV_COSTUME'],
    ['WaitTime', /^(.+?)秒(?:間)?(?:待つ|まつ)$/d, 'WaitTime', null, 'seconds'],
    ['Say:concat', /^(.+?)をつなげて(?:言う|いう|話す|はなす)$/d, 'Say', null, 'concat'],
    ['Say:timed', /^(.+)(?:と|を)(.+?)秒(?:間)?(?:言う|いう|話す|はなす)$/d, 'Say', null, 'timedSpeech'],
    ['Say:concatReverse', /^(.+?に)つなげて(?:言う|いう|話す|はなす)$/d, 'Say', null, 'concat'],
    ['Say:add', /^(.+?)に(.+?)を足して(?:言う|いう|話す|はなす)$/d, 'Say', null, 'addValue'],
    ['Say:quote', /^(.+?)と(?:言う|いう|話す|はなす)$/d, 'Say', null, 'quote'],
    ['Say:value', /^(.+?)を(?:言う|いう|話す|はなす)$/d, 'Say', null, 'value'],
    ['Ask', /^(.+?)と(?:(?:たずねて|尋ねて|聞いて)、(?:答え|返事)を待つ|たずねる|尋ねる)$/d, 'Ask', null, 'question'],
    ['BroadcastAndWait:signal', /^(.+?)の合図を送って、その合図で始まったことが全部終わるまで待つ$/d, 'BroadcastAndWait', null, 'message'],
    ['Broadcast:signal', /^(.+?)の合図を送る$/d, 'Broadcast', null, 'message'],
    ['BroadcastAndWait', /^みんなに(.+?)と知らせて、知らせを受けて始めたことが全部終わるまで待つ$/d, 'BroadcastAndWait', null, 'message'],
    ['Broadcast', /^みんなに(.+?)と知らせる$/d, 'Broadcast', null, 'message'],
    ['ReturnStatement', /^(.+?)を、?答えとして返す$/d, 'ReturnStatement', null, 'value'],
    ['LocalVariableDeclaration', /^この中だけで使う変数(.+?)を作り、最初は(.+?)にする$/d, 'LocalVariableDeclaration', null, 'local'],
    ['LocalListDeclaration', /^この中だけで使うリスト(.+?)を空で作る$/d, 'LocalListDeclaration', null, 'localList'],
    ['MotionCommand:SET_DIRECTION', /^(?:向き|方向)を(.+?)度にする$/d, 'MotionCommand', 'SET_DIRECTION', 'degree'],
    ['MotionCommand:TURN_RIGHT', /^右(?:に|へ)(.+?)度(?:回る|まわる)$/d, 'MotionCommand', 'TURN_RIGHT', 'degree'],
    ['MotionCommand:TURN_LEFT', /^左(?:に|へ)(.+?)度(?:回る|まわる)$/d, 'MotionCommand', 'TURN_LEFT', 'degree'],
    ['MotionCommand:SET_X', /^(?:横位置|よこのばしょ)を(.+?)に(?:する|変える|かえる)$/d, 'MotionCommand', 'SET_X', 'arg'],
    ['MotionCommand:SET_Y', /^(?:縦位置|たてのばしょ)を(.+?)に(?:する|変える|かえる)$/d, 'MotionCommand', 'SET_Y', 'arg'],
    ['MotionCommand:POINT_TO', /^(.+?)の(?:方向|方)を(?:向く|むく)$/d, 'MotionCommand', 'POINT_TO', 'arg'],
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
    ['CloneCommand:CREATE_TARGET:count', /^(.+?)のコピーを(.+?)体作る$/d, 'CloneCommand', 'CREATE_TARGET', 'cloneTargetCount'],
    ['ListClear', /^(.+?)の(?:中身を全部(?:消す|けす)|すべての要素を削除する)$/d, 'ListClear', null, 'target'],
    ['ListClear:empty', /^(.+?)を空にする$/d, 'ListClear', null, 'target'],
    ['ListAppend', /^(.+?)の最後に(.+?)を(?:入れる|いれる)$/d, 'ListAppend', null, 'append'],
    ['ListAppend:valueFirst', /^(.+?)を(.+?)の最後に(?:入れる|いれる)$/d, 'ListAppend', null, 'appendReverse'],
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
    appendReverse:/の最後に(?:入れる|いれる)$/,
    insertReverse:/番目(?:の前)?に(?:入れる|いれる)$/,
    assignReverse:/という変数に(?:入れる|いれる)$/,
    update:/(?:増やす|ふやす|減らす|へらす|を足す|をたす|を引く|をひく)$/,
    updateReverse:/(?:に足す|にたす|から引く|からひく)$/,
    assign:/に(?:する|変える|かえる)$/,
  });
  const STATEMENT_EXPLICIT_ACTORS = new WeakSet();
  const SENTENCE_TE_FORMS = Object.freeze([
    ['鳴らし始めて','鳴らし始める'], ['言わせて','言わせる'], ['かくして','かくす'], ['隠して','隠す'],
    ['うごかして','うごかす'], ['動かして','動かす'], ['うごいて','うごく'], ['動いて','動く'],
    ['すすんで','すすむ'], ['進んで','進む'], ['まわって','まわる'], ['回って','回る'],
    ['むいて','むく'], ['向いて','向く'], ['行って','行う'], ['すべって','すべる'], ['滑って','滑る'],
    ['変えて','変える'], ['かえて','かえる'], ['言って','言う'], ['いって','いう'], ['話して','話す'], ['はなして','はなす'],
    ['待って','待つ'], ['まって','まつ'], ['見せて','見せる'], ['みせて','みせる'], ['入れて','入れる'], ['いれて','いれる'],
    ['足して','足す'], ['たして','たす'], ['引いて','引く'], ['ひいて','ひく'], ['消して','消す'], ['けして','けす'],
    ['知らせて','知らせる'], ['鳴らして','鳴らす'], ['くり返して','くり返す'], ['繰り返して','繰り返す'], ['くりかえして','くりかえす'], ['して','する'],
  ].map(Object.freeze));
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
      startColumn:positions.length ? cpLen(line.raw.slice(0,positions[0]-(line.physicalStart??line.start)))+1 : line.startColumn||1, inline:true, comment:''};
  }
  function sentenceActor(text,symbols) {
    if (text === '自分') return {kind:'self'};
    if(symbols?.project?.components.some(component=>component.name===text)||symbols?.project?.stage.name===text)
      return {kind:'named',name:text};
    const name = parsedDeclarationName(text);
    return {kind:'named',name};
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
    return quantityValueSource(expr.kind === 'QuantityLiteral' && expr.unit === unit ? expr.value : expr, true) + unit;
  }
  function readRoleStatement(code, line, symbols, ctx) {
    const protectedCode = surfaceMask(code);
    const polite = [['話します','話す'],['はなします','はなす'],['言います','言う'],['いいます','いう'],['たずねます','たずねる'],['尋ねます','尋ねる'],['待ちます','待つ'],['まちます','まつ'],['増やします','増やす'],['減らします','減らす'],['動きます','動く'],['進みます','進む'],['回ります','回る'],
      // Every action's verb (1.3.1): a specific ending comes before the general します.
      ['向きます','向く'],['行きます','行く'],['すべります','すべる'],['下がります','下がる'],['はね返ります','はね返る'],
      ['かくします','かくす'],['隠します','隠す'],['見せます','見せる'],['出ます','出る'],
      ['かえます','かえる'],['変えます','変える'],['鳴らし始めます','鳴らし始める'],['鳴らします','鳴らす'],['止めます','止める'],
      ['送ります','送る'],['作ります','作る'],['消します','消す'],['けします','けす'],['入れます','入れる'],['足します','足す'],['引きます','引く'],
      ['下ろします','下ろす'],['上げます','上げる'],['おします','おす'],['押します','押す'],['返します','返す'],['行います','行う'],
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
    const q = (part,unit) => {if(surfaceMask(part.text).endsWith(unit))throw new AkariError('P205','「歩」や「秒」などは1回だけ書きます。れい：前へ10歩進む');return sentenceQuantity(e(part),unit);};
    const target = part => sentenceTarget(part.text,code,line,symbols,ctx,part.start);
    const node = (kind,props={}) => statementNode(kind,line,{...props,actorRef:{...(ctx.topicActor || {kind:'self'})}});
    const callSplit=protectedCode.lastIndexOf('、'),shortCall=symbols?.actionCallPhrases?.get(code.slice(callSplit+1));
    const action = surfaceCapture(/^(.*?)という手順を(?:(.+?)回)?(?:行う|おこなう)$/d,code,protectedCode)|| (shortCall?[{text:code.slice(0,callSplit+1)+`【${shortCall.name}】`}]:null);
    if (action) {
      const text = action[0].text, mask = surfaceMask(text), split = mask.lastIndexOf('、');
      let rawName=text, args=[], argumentNames=null;
      if (split >= 0) {
        rawName=text.slice(split+1);
        const input=text.slice(0,split);
        const passWord=['をわたして','を渡して'].find(w=>input.endsWith(w));
        if (passWord) {
          const inner=input.slice(0,-passWord.length);
          if (!(inner.startsWith('（')&&inner.endsWith('）'))) throw new AkariError('P205','入れるものを（ ）で かこんでください。れい：（10、「あかり」）をわたして、');
          args=parseArgumentText(inner.slice(1,-1),symbols,ctx,line.lineNo);
        } else {
          if (!input.endsWith('として')) throw new AkariError('P205','自分で作ったブロックに入れるものは、「として」をつけて書きます。れい：点数を10として、');
          const content=input.slice(0,-3), protectedInput=surfaceMask(content), chunks=[];
          let at=0;
          for(let i=0;i<=content.length;i++) if(i===content.length||protectedInput[i]==='、'){chunks.push({text:content.slice(at,i),start:at});at=i+1;}
          argumentNames=[];
          for(const chunk of chunks){const pair=surfaceCapture(/^(.+?)を(.+)$/d,chunk.text);if(!pair)throw new AkariError('P205','名前と入れるものを「を」でつないで書きます。れい：点数を10として、');const name=parsedDeclarationName(pair[0].text);if(argumentNames.includes(name))throw new AkariError('S308',`入れるものの名前「${name}」を2回書いています。名前は1回ずつ書いてください`);argumentNames.push(name);args.push(e({text:pair[1].text,start:chunk.start+pair[1].start}));}
        }
      }
      const name=callableSurfaceName(rawName);
      const call=node('UserActionCall',{name,args,...(argumentNames ? {argumentNames} : {})});
      return action[1]?node('RepeatCount',{count:q(action[1],'回'),body:[call]}):call;
    }
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
        case 'cloneTargetCount': props.args=[e(parts[0])];props.count=e(parts[1]);break;
        case 'addValue': props.value=exprNode('BinaryExpression',{op:'ADD',left:e(parts[0]),right:e(parts[1])});break;
        case 'arg': props.args=[e(parts[0])]; break;
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
        case 'quote': props.value=e(parts[0]); if(props.value.kind!=='StringLiteral') throw new AkariError('P205','言うことは「「文字」と言う」、へんすうの 中身は「点数の値を言う」のように 書きます'); break;
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
        case 'update': if(surfaceMask(parts[1].text).endsWith('に'))throw new AkariError('P205','数のあとに「に」をつけて ふやす・へらす とは書けません。ふやすなら「点数を1増やす」、その数にするなら「点数を10にする」と書きます');props={...props,target:target(parts[0]),value:e(parts[1])};break;
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
  function readSentenceMotion(code,line,symbols,ctx) {
    const mask=surfaceMask(code), suffix=/(?:動く|うごく|進む|すすむ|動かす|うごかす|行く|滑る|すべる|回る|まわる|向く|むく)$/.exec(mask);
    if(!suffix)return null;
    const verb=suffix[0], body=code.slice(0,-verb.length), protectedBody=mask.slice(0,-verb.length);
    const node=(op,args,direction)=>statementNode('MotionCommand',line,{op,args,...(direction?{direction}:{}),actorRef:{...(ctx.topicActor||{kind:'self'})}});
    const e=(text,start)=>parseMappedExpression(text,code,line,symbols,ctx,start);
    const q=(text,unit,start,hasSuffix=true)=>{if(hasSuffix&&surfaceMask(text).endsWith(unit))throw new AkariError('P205','「歩」や「秒」などは1回だけ書きます。れい：10歩動く');return sentenceQuantity(e(text,start),unit);};
    let p;
    if(['回る','まわる'].includes(verb)) {
      if((p=surfaceCapture(/^(.+)度(右|左)(?:に|へ)$/d,body)))return node(p[1].text==='右'?'TURN_RIGHT':'TURN_LEFT',[q(p[0].text,'度',p[0].start)]);
      return null;
    }
    const directions={前:'forward',後ろ:'backward',右:'right',左:'left',上:'up',下:'down'};
    if(['向く','むく'].includes(verb)) {
      if((p=surfaceCapture(/^(?:画面の)?(右|左|上|下)を$/d,body)))return node('SET_DIRECTION',[sentenceQuantity(exprNode('NumberLiteral',{value:{右:0,下:90,左:180,上:270}[p[0].text]}),'度')]);
      return null;
    }
    // Duration can follow the distance or direction role. Keep each capture's
    // original offset so Block edits still address only that quantity.
    if((p=surfaceCapture(/^(.+)歩、?(.+?)秒(?:で|かけて)、?(?:画面の)?(前|後ろ|右|左|上|下)(?:へ|に)$/d,body)))
      return node('GLIDE_DIRECTION',[q(p[1].text,'秒',p[1].start),q(p[0].text,'歩',p[0].start)],directions[p[2].text]);
    if((p=surfaceCapture(/^(?:画面の)?(前|後ろ|右|左|上|下)(?:へ|に)、?(.+?)秒(?:で|かけて)、?(.+)歩$/d,body)))
      return node('GLIDE_DIRECTION',[q(p[1].text,'秒',p[1].start),q(p[2].text,'歩',p[2].start)],directions[p[0].text]);
    let remaining=body, base=0, seconds=null;
    p=surfaceCapture(/^(.+?)秒(?:で|かけて)(.+)$/d,remaining);
    if(p){seconds=q(p[0].text,'秒',p[0].start);remaining=p[1].text;base=p[1].start;}
    else if(/秒(?:で|かけて)$/.test(surfaceMask(remaining))) {
      // A trailing time phrase must follow a completed coordinate/distance role.
      const split=[...surfaceMask(remaining).matchAll(/(?:の(?:位置|ばしょ)(?:へ|に)|歩|(?:前|後ろ|右|左|上|下)(?:へ|に))/g)].at(-1);
      if(split){const at=split.index+split[0].length,tail=remaining.slice(at),time=surfaceCapture(/^、?(.+)秒(?:で|かけて)$/d,tail);if(time){seconds=q(time[0].text,'秒',at+time[0].start);remaining=remaining.slice(0,at);}}
    }
    // よこ／たて／ばしょ are the easy spellings of 横／縦／位置.
    const coords=surfaceCapture(/^(横|縦|よこ|たて)(.+)、(横|縦|よこ|たて)(.+?)(?:の(?:位置|ばしょ))?(?:へ|に)$/d,remaining),horizontal=w=>w==='横'||w==='よこ';
    if(coords){if(horizontal(coords[0].text)===horizontal(coords[2].text))throw new AkariError('P205','「よこ」と「たて」を1つずつ書きます。れい：よこ100歩、たて50歩のばしょへ行く');const a=q(coords[1].text,'歩',base+coords[1].start,false),b=q(coords[3].text,'歩',base+coords[3].start,false),xy=horizontal(coords[0].text)?[a,b]:[b,a];return node(seconds?'GLIDE':'GOTO',seconds?[seconds,...xy]:xy);}
    let direction=null, distance=null;
    if((p=surfaceCapture(/^(?:画面の)?(前|後ろ|右|左|上|下)(?:へ|に)(.+)歩$/d,remaining))){direction=directions[p[0].text];distance=q(p[1].text,'歩',base+p[1].start);}
    else if((p=surfaceCapture(/^(.+)歩、?(?:画面の)?(前|後ろ|右|左|上|下)(?:へ|に)$/d,remaining))){distance=q(p[0].text,'歩',base+p[0].start);direction=directions[p[1].text];}
    else if((p=surfaceCapture(/^(.+)歩$/d,remaining))){distance=q(p[0].text,'歩',base+p[0].start);direction='forward';}
    if(distance){if(['行く','滑る','すべる'].includes(verb)&&!seconds)throw new AkariError('P205','「行く」「すべる」には、行き先のばしょか、かける時間と向きと歩数を書きます。れい：2秒かけて前へ10歩動く');return node(seconds?'GLIDE_DIRECTION':direction==='forward'?'MOVE':'MOVE_DIRECTION',seconds?[seconds,distance]:[distance],seconds||direction!=='forward'?direction:null);}
    if(/(?:動く|うごく|進む|すすむ|動かす|うごかす|滑る|すべる)/.test(verb))throw new AkariError('P205','動くときは歩数を書きます。向きや秒数は1つずつ書きます。れい：画面の右へ10歩動く');
    return null;
  }
  function readSentenceHeading(code,symbols,previousHeading=null) {
    const protectedCode = surfaceMask(code);
    const same = surfaceCapture(/^(.+?)も同じ合図で動き始め、(.*)$/d,code,protectedCode);
    if(same){
      if(!previousHeading)throw new AkariError('P205','「同じ合図」の前に、「作品を動かしたとき、」や「…がおされたとき、」などの きっかけを 書いてください');
      return {heading:{...previousHeading,actorRef:sentenceActor(same[0].text,symbols)},body:same[1],actor:same[0]};
    }
    const forms=[
      [/^始めると、(.+?)は、?(.*)$/d,'start',0,1],
      [/^(?:作品を動かした(?:とき|ら)|始まったとき|開始したとき|「動かす」を(?:押|お)した(?:とき|ら))、(.+?)は、?(.*)$/d,'start',0,1],
      // Key headings come first: 「…キーがおされたとき」 must not read as a click on 「…キー」.
      [/^キー(?:が(?:押|お)された(?:とき|ら)|を(?:押|お)した(?:とき|ら))、(.+?)は、?(.*)$/d,'keyDown',0,1],
      [/^(.+?)キー(?:を(?:押|お)すたびに|を(?:押|お)した(?:とき|ら)|が(?:押|お)された(?:とき|ら))、(.+?)は、?(.*)$/d,'keyDown',1,2,0],
      [/^(?!もし)(.+?)(?:がおされた(?:とき|ら)|がおされると|がおされるたびに|をおした(?:とき|ら)|をおすたびに|がクリックされた(?:とき|ら)|がクリックされると|がクリックされるたびに|をクリックした(?:とき|ら)|をクリックするたびに)、?(.*)$/d,'click',0,1],
      [/^合図を受けた(?:とき|ら)、(.+?)は、?(.*)$/d,'message',0,1],
      [/^(.+?)(?:という|の)合図を受けた(?:とき|ら)、(.+?)は、?(.*)$/d,'message',1,2,0],
      [/^知らせを受け取ったとき、(.+?)は、(.*)$/d,'message',0,1],
      [/^(.+?)という知らせを受け取ったとき、(.+?)は、(.*)$/d,'message',1,2,0],
      [/^(?:背景|はいけい)が(?:変わった|かわった)(?:とき|ら)、(.+?)は、?(.*)$/d,'backdropChanged',0,1],
      [/^(?!もし)(.+?)の中身が(?:変わった|かわった)(?:とき|ら)、?(.*)$/d,'valueChanged',0,1],
      [/^(?!もし)(.+?)のコピーが(?:作られた|できた)(?:とき|ら)、?(.*)$/d,'cloneStart',0,1],
    ];
    // The start button is named in 「」, which the protected text hides, so its heading is matched on the code itself.
    const startButton=/^「動かす」を(?:押|お)した(?:とき|ら)、/.exec(code);
    if(startButton){
      const shift=startButton[0].length,rest=surfaceCapture(/^(.+?)は、?(.*)$/d,code.slice(shift)),move=p=>p&&{...p,start:p.start+shift,end:p.end+shift};
      if(rest)return {heading:{event:'start',actorRef:sentenceActor(rest[0].text,symbols)},body:move(rest[1]),actor:move(rest[0])};
    }
    for(const [pattern,event,actorIndex,bodyIndex,filterIndex] of forms){const parts=surfaceCapture(pattern,code,protectedCode);if(!parts)continue;const heading={event,actorRef:sentenceActor(parts[actorIndex].text,symbols)};if(filterIndex!==undefined){const text=parts[filterIndex].text;if(!text.startsWith('「')||!text.endsWith('」'))throw new AkariError('P205','キーや合図の名前は「 」でかこんで書きます。れい：「空白」キーをおすたびに、自分は、');const literal=parseExpression(text);if(literal.kind!=='StringLiteral')throw new AkariError('P205','キーや合図の名前は、「 」でかこんだ文字を1つだけ書きます。れい：「空白」キーをおすたびに、自分は、');heading.filter=event==='keyDown'?{key:literal.value}:{message:literal.value};}return {heading,body:parts[bodyIndex],actor:parts[actorIndex]};}
    const implicit = surfaceCapture(/^始めると、(.*)$/d, code, protectedCode);
    if (implicit) return { heading: { event: 'start', actorRef: { kind: 'self' } }, body: implicit[0] };
    return null;
  }
  function sentenceHeadingSource(heading) {
    const actor=sentenceActorSource(heading.actorRef), filter=heading.filter == null ? null : formatExpression(exprNode('StringLiteral',{value:heading.filter.key??heading.filter.message}));
    switch(heading.event){case 'start':return `作品を動かしたとき、${actor}は、`;case 'click':return `${actor}がおされたとき、`;case 'keyDown':return `${filter?filter+'キーをおすたびに':'キーがおされたとき'}、${actor}は、`;case 'message':return `${filter?filter+'という':''}合図を受けたとき、${actor}は、`;case 'backdropChanged':return `はいけいがかわったとき、${actor}は、`;case 'valueChanged':return `${actor}の中身がかわったとき、`;case 'cloneStart':return `${actor}のコピーが作られたとき、`;default:throw new AkariError('P201','きっかけの書き方が分かりません。「始めると、」などのきっかけにしてください');}
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
    const readRoles=text=>{
      let roles=surfaceCapture(/^(?:画面の)?(前|後ろ|右|左|上|下)(?:へ|に)(.+?)秒に(.+?)歩の速さで$/d,text);
      if(roles)return validRoles({direction:roles[0].text,seconds:roles[1].text,distance:roles[2].text});
      roles=surfaceCapture(/^(.+?)秒に(.+?)歩の速さで(?:画面の)?(前|後ろ|右|左|上|下)(?:へ|に)$/d,text);
      return roles?validRoles({direction:roles[2].text,seconds:roles[0].text,distance:roles[1].text}):null;
    };
    const implicit=readRoles(body);
    if(implicit)candidates.push({...implicit,actorRef:ctx.topicActor||{kind:'self'}});
    // A particle inside an actor name is not a boundary unless all remaining
    // roles form a complete movement. Quoted names are protected by the lexer.
    for(const match of surfaceMask(body).matchAll(/[はを]/g)){
      if(match.index>66)break; // 32 code points, plus the two name delimiters.
      const roles=readRoles(body.slice(match.index+1).replace(/^、/,''));
      if(roles)candidates.push({...roles,actorRef:sentenceActor(body.slice(0,match.index),symbols),actorRange:sourceRange(line.mapped?.positions||[],parts[1].start,parts[1].start+match.index)});
    }
    if(candidates.length!==1)throw sentenceDiagnostic(candidates.length?'だれが動くのか、速さがどこからなのか分かりません。動くキャラの名前のあとに「は」を書いてください。れい：「空白」キーがおされているあいだ、自分は前へ1秒に10歩の速さで動き続ける':'ずっと動きつづけるときは、向きと「〜秒に〜歩の速さで」を書きます。れい：「空白」キーがおされているあいだ、自分は前へ1秒に10歩の速さで動き続ける',line,[],{kind:'ContinuousRule',actorRef:ctx.topicActor||{kind:'self'},missing:['speed']});
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
      const mask = surfaceMask(text);
      let result = '', at = 0, i;
      while ((i = mask.indexOf(from, at)) >= 0) { result += text.slice(at, i) + to; at = i + from.length; }
      return result + text.slice(at);
    };
    const whole = (text, pattern, build) => { const parts = surfaceCapture(pattern, text); return parts ? build(parts.map(p => p ? p.text : '')) : text; };
    const normalize = text => {
      // かな書きの動詞 → the written verb
      for (const [from, to] of [['かくれる', '隠れる'], ['あらわれる', '現れる'], ['ペンをおろす', 'ペンを下ろす'], ['ペンをあげる', 'ペンを上げる'],
        ['ならし始める', '鳴らし始める'], ['ならして', '鳴らして'], ['をならす', 'を鳴らす'], ['をつくる', 'を作る'], ['をおくる', 'を送る'], ['をおくって', 'を送って']])
        text = word(text, from, to);
      // 連用中止（〜し、） → 〜して、
      for (const [from, to] of [['進み、', '進んで、'], ['動き、', '動いて、'], ['回り、', '回って、'], ['待ち、', '待って、'], ['言い、', '言って、'], ['話し、', '話して、'],
        ['鳴らし、', '鳴らして、'], ['かくし、', 'かくして、'], ['見せ、', '見せて、'], ['消し、', '消して、'], ['けし、', 'けして、'], ['入れ、', '入れて、'],
        ['足し、', '足して、'], ['引き、', '引いて、'], ['すべり、', 'すべって、']])
        text = word(text, from, to);
      // 〜て with no 、 before the next action
      for (const te of ['鳴らし始めて', '鳴らして', '進んで', 'すすんで', '動いて', 'うごいて', '回って', 'まわって', '向いて', '待って', '言って', '話して',
        'かくして', '見せて', '消して', 'けして', '入れて', '足して', '引いて', '変えて', 'かえて', 'すべって', '滑って']) {
        const mask = surfaceMask(text);
        let result = '', at = 0, i;
        while ((i = mask.indexOf(te, at)) >= 0) {
          const end = i + te.length;
          result += text.slice(at, end) + (end < text.length && mask[end] !== '、' ? '、' : '');
          at = end;
        }
        text = result + text.slice(at);
      }
      text = whole(text, /^(.+)と(?:聞く|きく|聞きます|ききます)$/d, ([q]) => q + 'とたずねる');
      text = whole(text, /^(.+)と(?:聞いて|きいて)、?(?:答え|返事)を待つ$/d, ([q]) => q + 'とたずねて、答えを待つ');
      text = word(text, 'という合図を送る', 'の合図を送る');
      text = word(text, 'という合図を送って、', 'の合図を送って、');
      text = whole(text, /^((?:[^、。]+?は、?)?)(?:もし、?)?(?:画面の(?:はし|端)|端)に(?:ふれ|触れ)(?:たら|ると|れば|ていたら|ていれば|ているなら|ていると)、?(?:はね返る|跳ね返る)$/d, ([s]) => s + '画面のはしにふれていれば、はね返る');
      text = whole(text, /^(.*)コピーを(.+?)つ作る$/d, ([a, n]) => a + 'コピーを' + n + '体作る');
      text = whole(text, /^((?:[^、。]+?は、?)?)このコピーを(?:消す|けす)$/d, ([s]) => s + 'このコピーだけを消す');
      text = whole(text, /^(.+)の中身をすべて(?:消す|けす)$/d, ([l]) => l + 'の中身を全部消す');
      for (const [axis, plus, minus] of [['よこ', '画面の右へ', '画面の左へ'], ['たて', '画面の下へ', '画面の上へ']]) {
        text = whole(text, new RegExp('^((?:[^、。]+?は、?)?)' + axis + 'のばしょを(.+?)歩?(?:増やす|ふやす)$', 'd'), ([s, n]) => s + plus + n + '歩動く');
        text = whole(text, new RegExp('^((?:[^、。]+?は、?)?)' + axis + 'のばしょを(.+?)歩?(?:減らす|へらす)$', 'd'), ([s, n]) => s + minus + n + '歩動く');
      }
      text = whole(text, /^(.*)後ろ(?:へ|に)(.+?)歩(?:下がる|さがる)$/d, ([s, n]) => s + '後ろへ' + n + '歩進む');
      text = whole(text, /^(.+?)の音を(鳴らす|鳴らし始める)$/d, ([n, v]) => n + 'を' + v);
      return text;
    };
    // です・ます are read by the polite table in readRoleStatement.
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
      const tail=code.slice(start,end);
      let replacement=tail.slice(0,-pair[0].length)+pair[1];
      if(pair[0]==='行って'&&!replacement.endsWith('手順を行う'))replacement=tail.slice(0,-pair[0].length)+'行く';
      const part=surfaceLineSlice(line,start,i,replacement),head=readBlockHead(replacement,symbols,{...scope,sourceLine:part,lineNo:line.lineNo});
      let node;
      if(head?.inlineBody){const fields={...head};delete fields.inlineBody;delete fields.kind;node=statementNode(head.kind,part,{...fields,body:head.inlineBody,actorRef:{...(head.actorRef||scope.topicActor||{kind:'self'})}});}
      else node=parseSimpleStatement(part,symbols,scope);
      nodes.push(node);if(STATEMENT_EXPLICIT_ACTORS.has(node))scope.topicActor=node.actorRef;start=i+(connective?2:1);if(mask[start]==='、')start++;i=start-1;
    }
    if(!nodes.length)throw firstError;
    if(start>=code.length)throw new AkariError('P202','「〜して、」のあとに、つづきの文を書いてください。れい：10歩動いて、「やあ」と言う',line.lineNo,1);
    const rest=surfaceLineSlice(line,start,code.length);rest.comment=line.comment;
    nodes.push(...parseSentenceSequence(rest,symbols,scope));
    return nodes;
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
    // A bare はし stays a name, because a part may be called はし (橋, 箸). Bouncing only happens at the stage edge,
    // and a touch test names a part that must exist, so without such a part the child means 画面のはし.
    const bounceForm=/^(?:[^、。]+?は、?)?(?:画面の(?:はし|端)|端)に(?:ふれて|触れて)いれば、?(?:はね返る|跳ね返る)$/;
    const bareEdgeBounce=!bounceForm.test(mask)&&/^(.*?は、?)?(?:もし、?)?はしに(?:ふれ|触れ).*(?:はね返る|跳ね返る)$/.exec(mask);
    if(bareEdgeBounce)throw sentenceDiagnostic('画面の はしで はね返るときは、「画面のはしにふれていれば、はね返る」と 書きます',line,[{label:'画面の はしで はね返る',source:code.slice(0,bareEdgeBounce[1]?.length||0)+'画面のはしにふれていれば、はね返る'}],{kind:'MotionCommand'});
    const bareEdgeTouch=/(^|もし|、|が|は)はしに(?:ふれ|触れ)/.exec(mask);
    if(bareEdgeTouch&&!symbols?.project?.components?.some(c=>c.name==='はし')){
      const at=bareEdgeTouch.index+bareEdgeTouch[1].length;
      throw sentenceDiagnostic('画面の はしの ことなら、「画面のはし」と 書きます',line,[{label:'画面の はしに ふれている',source:code.slice(0,at)+'画面の'+code.slice(at)}]);
    }
    // 書20: guidance that names the fix (proposals are written as the code writes them).
    const fixed=(message,source,label,kind)=>sentenceDiagnostic(message,line,[{label,source:canonicalStatementSource(source,symbols)}],{kind});
    const knownName=name=>!!dataNameKind(name,symbols,ctx)||[...(ctx.localNames||[])].includes(name);
    const unquoted=surfaceCapture(/^((?:[^、。]+?は、?)?)([^「」『』【】（）、。]+?)と(?:(.+?)秒(?:間)?)?(?:言う|いう|話す|はなす|言います|話します)$/d,code);
    if(unquoted&&!knownName(unquoted[1].text)&&/^[\p{L}ー！？!?]+$/u.test(unquoted[1].text)){
      let state=false;try{state=parseExpression(unquoted[1].text,symbols,ctx).kind==='SensorRead';}catch(error){if(!(error instanceof AkariError))throw error;}
      const said=unquoted[1].text,seconds=unquoted[2]?.text;
      const proposals=[{label:'ことばを そのまま 言う',source:canonicalStatementSource(`${unquoted[0].text}「${said}」と${seconds?seconds+'秒話す':'言う'}`,symbols)}];
      if(state)proposals.push({label:'ようすの 中身を 言う',source:canonicalStatementSource(`${unquoted[0].text}${said}を${seconds?seconds+'秒話す':'言う'}`,symbols)});
      throw sentenceDiagnostic('言う ことばは「 」で かこみます',line,proposals,{kind:'Say'});
    }
    for(const [pattern,build,message,label,kind,when] of [
      [/^((?:[^、。]+?は、?)?)(大きさ|音の大きさ|音量)を([0-9０-９.．]+)に(?:する|かえる|変える)$/d,p=>`${p[0]}${p[1]==='音量'?'音の大きさ':p[1]}を${p[2]}％にする`,'大きさは「％」を つけて 書きます','％を つける','LooksCommand'],
      [/^((?:[^、。]+?は、?)?)(右|左)に([0-9０-９.．]+)回る$/d,p=>`${p[0]}${p[1]}に${p[2]}度回る`,'回る 角度は「度」を つけて 書きます','度を つける','MotionCommand'],
      [/^((?:[^、。]+?は、?)?)([0-9０-９.．]+)(?:びょう|ビョウ)(?:かん|間)?(?:待つ|まつ)$/d,p=>`${p[0]}${p[1]}秒待つ`,'待つ 時間は「秒」と 書きます','秒と 書く','WaitTime'],
      [/^((?:[^、。]+?は、?)?)(前|後ろ)(?:へ|に)([0-9０-９.．]+)(?:進む|すすむ|動く|うごく)$/d,p=>`${p[0]}${p[1]}へ${p[2]}歩進む`,'動く ときは「歩」を つけて 書きます','歩を つける','MotionCommand'],
      [/^((?:[^、。]+?は、?)?)(?:向き|方向)を([0-9０-９.．]+)に(?:する|かえる|変える)$/d,p=>`${p[0]}向きを${p[1]}度にする`,'向きは「度」を つけて 書きます','度を つける','MotionCommand',()=>!knownName('向き')],
      [/^((?:[^、。]+?は、?)?)向きを「?(右|左|上|下)」?に(?:する|かえる|変える)$/d,p=>`${p[0]}画面の${p[1]}を向く`,'キャラクターの 向きを かえるときは、「画面の右を向く」のように 書きます','向きを かえる','MotionCommand',()=>!knownName('向き')],
      [/^((?:[^、。]+?は、?)?)色を(.+?)に(?:する|かえる|変える)$/d,p=>`${p[0]}表示色を${p[1]}にする`,'キャラクターの 色を かえるときは、「表示色を赤にする」のように 書きます','表示色を かえる','LooksCommand',()=>!knownName('色')],
    ]){
      const parts=surfaceCapture(pattern,code);
      if(parts&&(!when||when()))throw fixed(message,build(parts.map(part=>part?part.text:'')),label,kind);
    }
    if(skipRest)throw sentenceDiagnostic('この回の のこりを とばして 次の回へ 進むときは、「この回の残りをとばして、次の回へ進む」と 書きます',line,[{label:'この回の のこりを とばして 次の回へ',source:code.slice(0,skipRest[1]?.length||0)+'この回の残りをとばして、次の回へ進む'}],{kind:'Continue'});
    if((p=surfaceCapture(/^(.+?)キーを(?:おして|押して)いる(?:あいだ|間)、(.+?)は(.+?)歩(?:動く|うごく)$/d,code))){
      const key=p[0].text.startsWith('「')?p[0].text:`「${p[0].text}」`,actor=p[1].text,distance=p[2].text;
      throw sentenceDiagnostic('キーをおしている間に動く歩数が、ぜんぶで何歩なのか、1秒に何歩なのか分かりません。えらんでください',line,[
        {label:`おすたびに全部で${distance}歩`,source:`${key}キーをおすたびに、${actor}は、前へ${distance}歩進む`},
        {label:`おしている間、1秒に${distance}歩`,source:`${key}キーがおされているあいだ、${actor}は前へ1秒に${distance}歩の速さで動き続ける`},
      ],{kind:'ContinuousRule',missing:['distanceOrSpeed']});
    }
    if((p=surfaceCapture(/^もし(.+で)、(.+)か、(.+なら)、?$/d,code))){
      const a=parseCondition(p[0].text,symbols,ctx,'and'),b=parseCondition(p[1].text,symbols,ctx,'plain'),c=parseCondition(p[2].text,symbols,ctx,'if');
      const logical=(op,left,right)=>exprNode('LogicalExpression',{op,left,right}),render=n=>'もし条件（'+formatExpression(n)+'）が成り立つなら、';
      throw sentenceDiagnostic('「両方」と「どちらか」のまとまりが分かりません。どちらの意味か えらんでください',line,[
        {label:'前の2つが両方、または さいごの1つ',source:render(logical('OR',logical('AND',a,b),c))},
        {label:'1つ目と、「後ろの2つのどちらか」の両方',source:render(logical('AND',a,logical('OR',b,c)))},
      ],{kind:'LogicalExpression',missing:['grouping']});
    }
    if((p=surfaceCapture(/^(.+?)になったら、(.+)$/d,code))){
      let raw=p[0].text;
      if(!/(?:以上|以下|より大きい|より小さい|と同じ|とちがう|と違う)$/.test(surfaceMask(raw)))raw+='と同じ';
      const condition=parseCondition(raw,symbols,ctx,'plain'),negative=exprNode('UnaryExpression',{op:'NOT',value:condition}),body=p[1].text,indent=' '.repeat(line.indent||0);
      throw sentenceDiagnostic('「〜になったら」は、2つの意味にとれます。今そうなっていたらするのか、そうなるときを待つのか、えらんでください',line,[
        {label:'今そうなっていたら する',source:`もし${formatCondition(condition,'if')}、${body}`},
        {label:'そうなるときを待ってから する',source:`${formatCondition(negative,'until')}待つ。\n${indent}${formatCondition(condition,'until')}待つ。\n${indent}${body}`},
      ],{kind:'Condition',missing:['stateOrTransition']});
    }
    if((p=surfaceCapture(/^(それ|これ|あれ|その子)を(.+(?:動かす|うごかす))$/d,code))){
      const names=(symbols?.project?.components||[]).map(component=>component.name);
      throw sentenceDiagnostic('「それ」などでは、だれを動かすのか分かりません。動かすキャラの名前をえらんでください',line,names.map(name=>({label:`${name}を動かす`,source:canonicalStatementSource(`${nameSource(name)}を${p[1].text}`,symbols)})),{kind:'MotionCommand',missing:['actorRef']});
    }
    if((p=surfaceCapture(/^(右|左)に曲がる$/d,code))&&previousLine&&nextLine){
      const count=surfaceCapture(/^(.+)回(?:くり返す|繰り返す|くりかえす)$/d,nextLine.code);
      if(count){const turn=`${p[0].text}に〔角度をえらぶ〕度回る`,first=previousLine.code,amount=count[0].text,indent=' '.repeat(line.indent||0),error=sentenceDiagnostic('進むと回るの、どこまでをくり返すのか分かりません。えらんでください',line,[
        {label:'進む・回るの両方をくり返す',source:`${amount}回くり返す。\n${indent}  ${first}。\n${indent}  ${turn}`},
        {label:'進むのは一度、回るだけをくり返す',source:`${first}。\n${indent}${amount}回くり返す。\n${indent}  ${turn}`},
      ],{kind:'RepeatCount',missing:['scope','angle']});const firstRange=sourceRange(previousLine.mapped.positions),lastRange=sourceRange(nextLine.mapped.positions);for(const proposal of error.proposals){proposal.start=firstRange.start;proposal.end=lastRange.end;}throw error;}
    }
  }
  function parseScript(source, symbols, ctx = {}) {
    if(typeof source!=='string'||cpLen(source)>LIMITS.sourceEach)throw new AkariError('P208','文字が多すぎて、これ いじょうは 書けません。文を 短くするか、ほかの 動きに 分けてください',1,1);
    const physical=normalizeSource(source).lines,headings=[];
    let previousHeading=null;
    for(const line of physical){
      if(line.continuation||!line.code||/^[ \t\u3000]/u.test(line.raw))continue;
      const code=line.mapped.text,mask=surfaceMask(code);let start=0;
      for(let i=0;i<=mask.length;i++)if(i===mask.length||mask[i]==='。'){
        if(i>start){const found=readSentenceHeading(code.slice(start,i),symbols,previousHeading);
          if(found){headings.push({start:line.mapped.positions[start],lineNo:line.lineNo,columnOffset:line.mapped.positions[start]-line.start,previousHeading});previousHeading=found.heading;}}
        start=i+1;
      }
    }
    const firstCode=physical.find(line=>!line.continuation&&line.code),hasPrefix=headings.length&&headings[0].start!==firstCode?.start;
    if(headings.length<=1&&!hasPrefix)return parseScriptUnit(source,symbols,ctx);
    if(ctx.definitionKind||ctx.definition)throw new AkariError('P205','自分で作ったブロックの中には、「始めると、」などのきっかけは書けません',headings[0].lineNo,1);
    const starts=[{start:0,lineNo:1},...headings.slice(hasPrefix?0:1)];
    if(starts.length>LIMITS.scripts)throw new AkariError('P208','できごとが多すぎて、これ いじょう ふやせません。いらないできごとをけしてください',1,1);
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
    SOURCE_RANGES.set(document,SOURCE_RANGES.get(units[0]));return document;
  }
  function parseScriptUnit(source, symbols, ctx = {}) {
    if(typeof source!=='string'||cpLen(source)>LIMITS.sourceEach)throw new AkariError('P208','文字が多すぎて、これ以上は書けません。文を短くするか、べつの動きに分けてください',1,1);
    const rawLines=normalizeSource(source).lines,lines=[];
    for(const line of rawLines){if(line.continuation)continue;const prefix=line.raw.match(/^[ \t\u3000]*/u)[0];if(/[^ ]/u.test(prefix))throw new AkariError('P209','行の はじめを 右へ ずらすときは、小さい 空白で 書きます。Tabキーや 大きい 空白を 使っていないか たしかめてください',line.lineNo,1);line.indent=prefix.length;const code=compactOutsideString(line.code);if(!code){lines.push(line);continue;}const mask=surfaceMask(code);let start=0;for(let i=0;i<=mask.length;i++)if(i===mask.length||mask[i]==='。'){if(i>start){const part=surfaceLineSlice(line,start,i);part.indent=line.indent;part.inline=start>0;part.comment=i===mask.length?line.comment:'';lines.push(part);}start=i+1;}}
    const baseCtx={...ctx,localNames:[...(ctx.localNames||[])],binders:[...(ctx.binders||[])],topicActor:{...(ctx.topicActor||{kind:'self'})}};
    if(ctx.definition){const names=localDeclarationNames(source);baseCtx.localNames.push(...names.vars,...names.lists);for(const line of lines){const p=surfaceCapture(/^この中だけで使う(?:変数|リスト)(.+?)を(?:作り、最初は.+にする|空で作る)$/d,line.code);if(p)baseCtx.localNames.push(parsedDeclarationName(p[0].text));}}
    const nextCode=i=>{while(i<lines.length&&!lines[i].code)i++;return i;};
    const parseAt=(line,fn)=>{try{return fn();}catch(error){if(error instanceof AkariError&&!error.line){error.line=line.lineNo;error.column=error.column||1;}throw error;}};
    let first=nextCode(0),heading=null,headingActorRange=null;
    if(first<lines.length&&lines[first].indent!==0)throw new AkariError('P209','いちばん 外の 文は、行の はじめを 右へ ずらさずに 書きます',lines[first].lineNo,1);
    if(first<lines.length){const found=parseAt(lines[first],()=>readSentenceHeading(lines[first].code,symbols,ctx.previousHeading));if(found){heading=found.heading;const line=lines[first];if(found.actor)headingActorRange=sourceRange(line.mapped?.positions||[],found.actor.start,found.actor.end);if(found.body.text){const body=surfaceLineSlice(line,found.body.start,found.body.end);const following=lines.find((entry,index)=>index>first&&entry.lineNo!==line.lineNo&&entry.code);const headingIndent=following?.indent>0?following.indent:2;body.indent=headingIndent;body.comment=line.comment;lines.splice(first,1,body);for(let j=first+1;j<lines.length&&lines[j].lineNo===line.lineNo;j++)lines[j].indent=headingIndent;}else lines.splice(first,1);first=nextCode(first);if(first<lines.length&&lines[first].indent===0)throw new AkariError('P202','「作品を動かしたとき、自分は、」などの 次の 行は、行の はじめを 右へ ずらして 書いてください',lines[first].lineNo,1);}}
    const rules=[];
    function block(start,indent,scope,depth){
      if(depth>LIMITS.blockDepth)throw new AkariError('P208','「もし」や「くり返す」の 中に、ブロックが 重なりすぎています。いくつかの 動きに 分けてください',lines[start]?.lineNo||1,1);
      scope={...scope,topicActor:{...scope.topicActor}};
      const nodes=[];let i=start,previousSentenceStart=null;
      while(i<lines.length){const line=lines[i];if(!line.code){if(line.comment)nodes.push(statementNode('CommentLine',line,{text:line.comment.slice(1),raw:line.raw,actorRef:{...scope.topicActor}}));i++;continue;}if(line.indent<indent)break;if(line.indent>indent)throw new AkariError('P209','同じ まとまりの 文は、行の はじめの 空白の 数を そろえてください',line.lineNo,1);
        const local={...scope,sourceLine:line,lineNo:line.lineNo};
        const repeatPrevious=surfaceCapture(/^これを(.+?)回(?:くり返す|くり返します|繰り返す|繰り返します)$/d,line.code);
        if(repeatPrevious){
          if(previousSentenceStart===null||previousSentenceStart>=nodes.length)throw sentenceDiagnostic('「これを」の すぐ前の 行に、くり返したい 一文を 書いてください',line,[],{kind:'RepeatCount',missing:['precedingSentence']});
          const body=nodes.splice(previousSentenceStart),part=repeatPrevious[0],count=sentenceQuantity(parseMappedExpression(part.text,line.code,line,symbols,local,part.start),'回');
          const repeat=statementNode('RepeatCount',line,{count,body,actorRef:{...scope.topicActor}});
          const range=SOURCE_RANGES.get(body[0])?.range,location=SOURCE_RANGES.get(repeat);
          if(range&&location){location.range={start:range.start,end:location.range.end};location.extent.start=range.start;}
          nodes.push(repeat);previousSentenceStart=null;i++;continue;
        }
        if(surfaceMask(line.code).startsWith('くり返しが終わると、')&&nodes.at(-1)?.kind!=='RepeatCount')throw sentenceDiagnostic('「くり返しが終わると」の すぐ前に、回数の ある くり返しを 書いてください',line,[],{kind:'Sequence',missing:['precedingRepeat']});
        parseAt(line,()=>diagnoseSentenceIntent(line,symbols,local,lines[i-1]?.indent===indent?lines[i-1]:null,lines[nextCode(i+1)]?.indent===indent?lines[nextCode(i+1)]:null));
        if(['その合図で始まったことが全部終わるまで待つ','その知らせを受けて始めたことが全部終わるまで待つ'].includes(line.code)){
          const previous=[...nodes].reverse().find(node=>node.kind!=='CommentLine');
          if(previous?.kind!=='Broadcast')throw sentenceDiagnostic('「その合図」は、すぐ前の行で送った合図のことです。すぐ前の行に、合図を送る文を書いてください。れい：「スタート」の合図を送る。',line,[],{kind:'WaitBroadcastGroup',missing:['precedingBroadcast']});
          const broadcastRef=previous.broadcastRef||`broadcast-${previous.sourceSpan.startLine}-${previous.sourceSpan.startColumn}`;
          previous.broadcastRef=broadcastRef;
          nodes.push(statementNode('WaitBroadcastGroup',line,{broadcastRef,actorRef:{...scope.topicActor}}));i++;continue;
        }

        if(line.code==='ここまで')throw new AkariError('P203','「ここまで」は 書きません。次の 文の 行の はじめを 左へ もどすと、まとまりが おわります',line.lineNo,1);
        const rule=parseAt(line,()=>{try{return readContinuousSentence(line.code,line,symbols,local);}catch(error){if(error.draftRole?.kind==='ContinuousRule'){const next=lines[nextCode(i+1)],speed=next?surfaceCapture(/^(.+?秒に.+?歩の速さで)(?:動かす|動く)$/d,next.code):null;if(speed&&next.indent===indent){const motion=/(?:動き続ける|動かし続ける)$/.exec(surfaceMask(line.code));if(motion){const range=sourceRange(line.mapped.positions),last=sourceRange(next.mapped.positions);error.proposals=[{label:'2つの文を1つの「つづけて動くルール」にまとめる',source:line.code.slice(0,motion.index)+speed[0].text+motion[0],start:range.start,end:last.end}];}}}throw error;}});if(rule){if(depth!==0)throw new AkariError('P205','つづけて動くルールは、「もし」や「くり返す」の中には書けません。いちばん外に書いてください',line.lineNo,1);rules.push(rule);i++;continue;}
        const head=parseAt(line,()=>readBlockHead(line.code,symbols,local));if(head?.kind==='Else')break;
        if(!head){const parts=parseAt(line,()=>parseSentenceSequence(line,symbols,local));previousSentenceStart=nodes.length;nodes.push(...parts);for(const part of parts)if(STATEMENT_EXPLICIT_ACTORS.has(part))scope.topicActor={...part.actorRef};i++;continue;}
        previousSentenceStart=null;
        const controlActor=head.actorRef||scope.topicActor;
        let childScope={...scope,topicActor:{...controlActor},binders:[...(scope.binders||[])]},childStart=i+1,firstChild=nextCode(childStart),binderRange=null;
        if(head.kind==='ForEach'){
          const legacyBinder=surfaceCapture(/^(.+)の各要素を(.+)として、?(?:次のことを)?(?:くり返す|繰り返す|くりかえす)$/d,line.code);
          if(legacyBinder)binderRange=sourceRange(line.mapped.positions,legacyBinder[1].start,legacyBinder[1].end);
          if(firstChild<lines.length&&lines[firstChild].indent>indent){const declaration=surfaceCapture(/^この中では、今見ているものを(.+?)と呼ぶ$/d,lines[firstChild].code);if(declaration){binderRange=sourceRange(lines[firstChild].mapped.positions,declaration[0].start,declaration[0].end);head.binder=parsedDeclarationName(declaration[0].text);childStart=firstChild+1;firstChild=nextCode(childStart);}}
          childScope.binders.push(head.binder);
        }
        if(!head.inlineBody&&(firstChild>=lines.length||lines[firstChild].indent<=indent))throw Object.assign(sentenceDiagnostic('「もし」や「くり返す」の中に、することを書いてください。何もしないときは「何もしない」と書けます。\nれい：2回くり返す。\n  「やあ」と言う。',line,[],{kind:head.kind,missing:['body']}),{code:'P202'});
        if(head.inlineBody&&firstChild<lines.length&&lines[firstChild].indent>indent)throw new AkariError('P209','中の 文を、同じ 行と 次の 行の 両方に 書かないでください',lines[firstChild].lineNo,1);
        const child=head.inlineBody?{nodes:head.inlineBody,index:i+1}:block(childStart,lines[firstChild].indent,childScope,depth+1);
        const fields={...head,actorRef:{...controlActor}};delete fields.kind;delete fields.inlineBody;
        if(!child.nodes.some(n=>n.kind!=='CommentLine'))throw new AkariError('P202','中に、することの文がありません。何もしないときは「何もしない」と書けます',line.lineNo,1);
        i=child.index;
        if(head.kind==='IfStatement'){fields.thenBody=child.nodes;fields.elseBody=[];fields.hasElse=false;fields.elseComment='';
          const branchIndex=nextCode(i),branchLine=lines[branchIndex],sibling=branchLine?.indent===indent?parseAt(branchLine,()=>readBlockHead(branchLine.code,symbols,{...childScope,sourceLine:branchLine,lineNo:branchLine.lineNo})):null;
          if(sibling?.kind==='Else'){
            for(let j=i;j<branchIndex;j++)if(lines[j].comment)fields.thenBody.push(statementNode('CommentLine',lines[j],{text:lines[j].comment.slice(1),raw:lines[j].raw,actorRef:{...scope.topicActor}}));
            i=branchIndex;const otherwise=lines[i],begin=nextCode(i+1);if(!sibling.inlineBody&&(begin>=lines.length||lines[begin].indent<=indent))throw new AkariError('P202','「そうでなければ、」の次の行に、することを書いてください。\nれい：そうでなければ、\n  「はずれ」と言う。',otherwise.lineNo,1);const other=sibling.inlineBody?{nodes:sibling.inlineBody,index:i+1}:block(i+1,lines[begin].indent,childScope,depth+1);fields.hasElse=true;fields.elseComment=sibling.inlineBody?'':otherwise.comment;fields.elseBody=other.nodes;i=other.index;}}
        else fields.body=child.nodes;
        fields.endLine=lines[Math.max(start,i-1)]?.lineNo||line.lineNo;
        const node=statementNode(head.kind,line,fields),location=SOURCE_RANGES.get(node);if(head.inlineBody)node.inlineComment='';if(location){const actorRange=SOURCE_RANGES.get(head)?.actorRange;if(actorRange)location.actorRange=actorRange;location.extent.end=lines[Math.max(start,i-1)]?.end??line.end;location.inlineContainer=!!head.inlineBody;if(head.kind==='ForEach'){location.binderRange=binderRange;location.binderInsert={at:line.end,indent:lines[firstChild]?.indent??indent+2};}}
        nodes.push(node);
      }
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
      for(const value of Object.values(node)){
        if(Array.isArray(value)){for(const child of value)if(child?.kind)pending.push(child);}
        else if(value?.kind)pending.push(value);
      }
    }
    const ast={kind:'Script',body:result.nodes,...(heading?{heading}:{}),...(rules.length?{rules}:{}),source,sourceSpan:{startLine:1,startColumn:1,endLine:rawLines.length,endColumn:1}};
    SOURCE_RANGES.set(ast,{range:{start:0,end:source.length},extent:{start:0,end:source.length},indent:0,inline:false,...(headingActorRange?{actorRange:headingActorRange}:{})});return ast;
  }
  function readBlockHead(text,symbols,ctx={}) {
    const code=compactOutsideString(text),mask=surfaceMask(code),line=ctx.sourceLine||{raw:text,code:text,lineNo:ctx.lineNo||0};
    const e=part=>parseMappedExpression(part.text,code,line,symbols,ctx,part.start);
    const inline=part=>{const fragment=surfaceLineSlice(line,part.start,part.end);fragment.comment=line.comment;return parseSentenceSequence(fragment,symbols,ctx);};
    // A control's explicit subject is scoped to its header and child suites.
    // Keep the comma mandatory, and accept only a complete finite control form.
    if(!ctx.explicitControlActor){
      const actor=surfaceCapture(/^(.+?)は、(.+)$/d,code);
      if(actor){
        const actorRef=sentenceActor(actor[0].text),fragment=surfaceLineSlice(line,actor[1].start,actor[1].end);
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
    // The bounce command reads like a condition; with or without a subject it is one command.
    if(/^(?:[^、。]+?は、?)?(?:もし、?)?(?:画面の(?:はし|端)|端)に(?:ふれ|触れ).*(?:はね返|跳ね返)(?:る|ります)$/.test(mask))return null;
    // もし…たら reads as もし…なら (only with もし: without it, 〜たら can mean waiting).
    if((parts=surfaceCapture(/^((?:もし)?.+?(?:なら(?:ば)?|れば|えば|てば))、(.*)$/d,code))|| (parts=surfaceCapture(/^((?:もし)?.+?(?:なら(?:ば)?|れば|えば|てば))$/d,code))
      || (parts=surfaceCapture(/^(もし.+?たら)、(.*)$/d,code)) || (parts=surfaceCapture(/^(もし.+?たら)$/d,code))) {
      const condition=parseCondition(parts[0].text,symbols,ctx,'if'),tail=parts[1];
      if(tail?.text&&tail.text!=='次のことをする'&&/(?:なら、|ことを.+回)/.test(surfaceMask(tail.text)))throw new AkariError('P201','「もし」や「くり返す」の 中に 重ねるときは、次の 行に 書いて、行の はじめを 右へ ずらしてください');
      return {kind:'IfStatement',condition,...(tail?.text&&tail.text!=='次のことをする'?{inlineBody:inline(tail)}:{})};
    }
    if((parts=surfaceCapture(/^(.+)ことを(.+)回(?:くり返す|繰り返す|くりかえす|くり返します|繰り返します)$/d,code))) {
      if(/ことを/.test(surfaceMask(parts[0].text)))throw new AkariError('P201','くり返しの 中に くり返しを 重ねるときは、次の 行に 書いて、行の はじめを 右へ ずらしてください');
      return {kind:'RepeatCount',count:sentenceQuantity(e(parts[1]),'回'),inlineBody:inline(parts[0])};
    }
    if(/^(?:次のことを)?ずっと(?:くり返す|繰り返す|くりかえす|くり返します|繰り返します)$/.test(mask))return {kind:'Forever'};
    if((parts=surfaceCapture(/^(?:次のことを)?(.+)回(?:だけ)?(?:、次のことを|、)?(?:くり返す|繰り返す|くりかえす|くり返します|繰り返します)$/d,code)))return {kind:'RepeatCount',count:sentenceQuantity(e(parts[0]),'回')};
    if((parts=surfaceCapture(/^(.+?)(?:の中身)?を先頭から一つずつ見て、次のことを行う$/d,code)))return {kind:'ForEach',list:e(parts[0]),binder:'今見ているもの'};
    if((parts=surfaceCapture(/^(.+)の各要素を(.+)として、?(?:次のことを)?(?:くり返す|繰り返す|くりかえす)$/d,code)))return {kind:'ForEach',list:e(parts[0]),binder:parsedDeclarationName(parts[1].text)};
    if((parts=surfaceCapture(/^(.+(?:あいだ|間|まで))、?(?:次のことを)?(?:くり返す|繰り返す|くりかえす|くり返します|繰り返します)$/d,code))){const clause=readConditionClause(parts[0].text,symbols,ctx);return {kind:clause.mode==='while'?'RepeatWhile':'RepeatUntil',condition:clause.condition};}
    if((parts=surfaceCapture(/^(.+)回((?:.*)(?:進んで|すすんで|動いて|うごいて))、(.+)$/d,code))){const first=sentenceInfinitive(parts[1].text),last=parts[2].text,indent=' '.repeat(line.indent||0);throw sentenceDiagnostic('どこまでをくり返すのか分かりません。えらんでください',line,[{label:'前の動きだけをくり返す',source:`${parts[0].text}回くり返す。\n${indent}  ${first}。\n${indent}${last}`},{label:'2つの動きをくり返す',source:`${parts[0].text}回くり返す。\n${indent}  ${first}。\n${indent}  ${last}`}],{kind:'RepeatCount',missing:['scope']});}
    // 〜たら without もし: a check needs もし (without it, 〜たら can mean waiting).
    if((parts=surfaceCapture(/^((?!もし).+?たら)、(.*)$/d,code))&&!/(?:になったら|終わったら|小さくなったら)/.test(mask))
      {let source='もし'+code;try{source='もし'+formatCondition(parseCondition('もし'+parts[0].text,symbols,ctx,'if'),'if')+'、'+(parts[1]?.text||'');}catch(error){if(!(error instanceof AkariError))throw error;}
      throw sentenceDiagnostic('今そうなっているかを しらべるときは、はじめに「もし」を つけます',line,[{label:'もしを つける',source}],{kind:'IfStatement',missing:['もし']});}
    if(/(?:終わったら|小さくなったら)/.test(mask))throw sentenceDiagnostic('「〜たら」は2つの意味にとれます。そうなるときを待つなら「〜まで待つ」、今そうなっているかを調べるなら「もし〜なら、」と書きます',line,[],{kind:'Condition',missing:['triggerOrState']});
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
        return name==='今見ているもの'?header:`${header}。\n  この中では、今見ているものを${nameSource(name)}と呼ぶ`;
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
      const first=surfaceCapture(/^(.+)に(.+)を(?:入れる|いれる)$/d,text),valueFirst=!first&&surfaceCapture(/^(.+?)を(.+)に(?:入れる|いれる)$/d,text);
      const pair=first||(valueFirst?[valueFirst[1],valueFirst[0]]:null);
      if(!pair||pair[0].text.startsWith('「'))return null;
      const name=readNameToken(pair[0].text,0);
      pair.variable=!!name&&name.end===pair[0].text.length&&dataNameKind(name.name,symbols,ctx)==='variable';
      return pair;
    };
    const extension = /^拡張「([^「」\n]+)」「([^「」\n]+)」（([\s\S]*)）$/.exec(code);
    if (extension) {
      const name = EXTENSION_HOST.resolve(extension[1], extension[2], 'commands');
      if (!name) throw new AkariError('E703', 'この「拡張」のブロックが見つかりません。かくちょうの 名前を たしかめてください', line.lineNo, 1);
      return statementNode('ExtensionCommand', line, { name, args: parseArgumentText(extension[3], symbols, ctx, line.lineNo), actorRef: { ...(ctx.topicActor || { kind: 'self' }) } });
    }
    const lead=/^(?:(?:そのあと|それから|次に|最後に|くり返しが終わると|そして|まず|はじめに|最初に)、|(?:まず|次に)(?=[0-9０-９「（【－]))/.exec(surfaceMask(code));
    if(lead){working=surfaceLineSlice(line,lead[0].length,code.length);working.comment=line.comment;code=working.code;}
    // ねこも10歩進む: a part name with も is the subject, the same as ねこは (ねこも10 was read as a name).
    const also=[...(symbols?.project?.components||[])].sort((a,b)=>b.name.length-a.name.length).find(actor=>code.startsWith(actor.name+'も')&&!surfaceMask(code).startsWith(actor.name+'も同じ'));
    if(also){const inline=working.inline;working=surfaceLineSlice(working,0,code.length,also.name+'は'+code.slice(also.name.length+1));working.comment=line.comment;working.inline=inline;code=working.code;}
    const parse=(text,at,topicActor)=>{const part=at?surfaceLineSlice(working,at,code.length):working;part.comment=line.comment;const local={...ctx,topicActor};return readSurfaceStatement(text,part,symbols,local);};
    let directError;
    try { const direct=parse(code,0,ctx.topicActor||{kind:'self'}); if(direct)return direct; } catch(error) {if(!(error instanceof AkariError))throw error;directError=error;}
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
      const particle=['は','を','に'][k],actors=[...(symbols?.project?.components||[]),...(symbols?.project?.stage?[symbols.project.stage]:[])].sort((a,b)=>b.name.length-a.name.length);
      // A part name with が or も as the subject reads as は: ねこが10歩進む, ねこも10歩進む.
      const subjectParticle=k===0?['は','が','も'].find(p=>actors.some(actor=>code.startsWith(actor.name+p))):particle;
      const known=actors.find(actor=>code.startsWith(actor.name+(subjectParticle||particle)));
      const offset=known?known.name.length+1+(k===0&&code[known.name.length+1]==='、'?1:0):0;
      const parts=known?[{text:known.name,start:0,end:known.name.length},{text:code.slice(offset),start:offset,end:code.length}]:surfaceCapture(actorPatterns[k],code);if(!parts)continue;
      if(k===0&&parts[0].text==='この中で')continue;
      let actorRef;try{actorRef=sentenceActor(parts[0].text,symbols);}catch(error){if(error instanceof AkariError)continue;throw error;}let body=parts[1].text;
      if(k===2)body=body.slice(0,-'言わせる'.length)+'言う';
      const part=surfaceLineSlice(working,parts[1].start,parts[1].end,k===2?body:null);part.comment=line.comment;
      let node=readSurfaceStatement(body,part,symbols,{...ctx,topicActor:actorRef});
      const putBody=!node&&k===0?putInto(body):null;
      if(putBody){
        if(!putBody.variable)throw sentenceDiagnostic('「〜に〜を入れる」では、さいごに入れるのか、何番目かと 入れかえるのか 分かりません。えらんでください',working,[{label:'さいごに入れる',source:`${parts[0].text}は、${putBody[0].text}の最後に${putBody[1].text}を入れる`},{label:'どれかと 入れかえる（何番目かを えらぶ）',source:`${parts[0].text}は、${putBody[0].text}の〔番号を入れる〕番目を${putBody[1].text}にかえる`}],{kind:'ListMutation',target:putBody[0].text,missing:['operation','indexIfReplace']});
        const replacement=`${putBody[0].text}を${putBody[1].text}にする`,assign=surfaceLineSlice(working,parts[1].start,parts[1].end,replacement);assign.comment=line.comment;
        node=readSurfaceStatement(replacement,assign,symbols,{...ctx,topicActor:actorRef});
      }
      // Spellings kept by the finite statement parser take a subject the same way.
      if(!node&&k===0&&!putBody){try{node=parseLegacySimpleStatement(part,symbols,{...ctx,topicActor:actorRef});}catch(error){if(!(error instanceof AkariError))throw error;}}
      if(node){node.actorRef=actorRef;STATEMENT_EXPLICIT_ACTORS.add(node);const location=SOURCE_RANGES.get(node);if(location){location.extent={start:working.start,end:working.end};location.range=sourceRange(working.mapped?.positions||[]);location.inline=!!working.inline;location.actorRange=sourceRange(working.mapped?.positions||[],parts[0].start,parts[0].end);}return node;}
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
    const delayed=surfaceCapture(/^(.+)秒後に(.+)$/d,code);
    if(delayed)throw sentenceDiagnostic('待ってから 動くときは、「待つ」と「動く」の 2つの 文に 分けます',working,[{label:'待ってから次の動きをする',source:`${delayed[0].text}秒待つ。\n${' '.repeat(working.indent||0)}${delayed[1].text}`}],{kind:'Sequence',missing:['motionDestinationIfAbsent']});
    if(directError)throw directError;
    // The preserved advanced spellings are parsed structurally by the original finite parser.
    try {const legacy=parseLegacySimpleStatement(working,symbols,ctx);legacy.actorRef={...(ctx.topicActor||{kind:'self'})};return legacy;}
    catch(error){
      if(!(error instanceof AkariError))throw error;
      if(/^[\p{L}ー]+(?:する|しよう)$/u.test(code)&&symbols?.actions?.size){
        const proposals=[...symbols.actions.values()].map(def=>({label:`「${def.name}」のブロックを使う`,source:(def.args.length?def.args.map(arg=>`${nameSource(arg)}を〔${arg}を入れる〕`).join('、')+'として、':'')+`【${def.name}】という手順を行う`}));
        throw sentenceDiagnostic('この「〜する」という短いよび方は、まだ決めていません。使うブロックをえらぶか、自分で作ったブロックで よび方を決めてください',working,proposals,{kind:'UserActionCall',missing:['registeredCallPhrase']});
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
    const out = text.split(''), stack = [];
    let quote = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        out[i] = '\u0001';
        if (['」','』'].includes(quote) && ch === '\\') {
          if (!['\\',quote==='』'?'『':'「',quote].includes(text[i+1])) throw new AkariError('N103','「 」の中の \\ のつぎには、\\ か「 か 」しか書けません。\\ を文字として使うときは \\\\ と書きます');
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
    if (!/(?:代入する|加える|足す|引く|増やす|減らす|追加する|挿入する|削除する|入れる|回る|行く|滑る|すべる|鳴らす|鳴らし、終わるまで待つ|と聞いて待つ)$/.test(code)) return null;
    const mask = surfaceMask(code), e = (t, start) => parseMappedExpression(t, code, line, symbols, ctx, start);
    const once = marker => mask.indexOf(marker) >= 0 && mask.indexOf(marker) === mask.lastIndexOf(marker);
    if (/(?:滑る|すべる)$/.test(mask) && (!once('秒で') || (!once('の位置へ') && !once('のばしょへ'))))
      throw new AkariError('P205','かける時間と行き先を1つずつ書きます。れい：よこ100、たて50のばしょへ2秒かけて動く');
    if (mask.includes('秒、') && /(?:鳴らす|鳴らし、終わるまで待つ)$/.test(mask) && (!once('秒、') || !once('Hzの音を')))
      throw new AkariError('P205','秒と 音の高さ（Hz）は 1つずつ 書いてください。れい: 440Hzの音を0.2秒鳴らす');
    if (mask.endsWith('に入れる') && !once('を'))
      throw new AkariError('P205','入れる 中身と 入力らんを 1つずつ 書いてください');
    const target = (text, start) => {
      const t = parseTargetPrefix(text, symbols, ctx);
      if (!t || t.len !== text.length) throw new AkariError('P205', 'かえる ものの 名前と 「に」「を」などの 書き方を たしかめてください。れい：点数を1増やす');
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
    const coordinate = (text, start) => {
      const protectedText = surfaceMask(text);
      if (protectedText.indexOf('、') !== protectedText.lastIndexOf('、'))
        throw new AkariError('P205','「よこ」と「たて」を1つずつ書きます。れい：よこ100、たて50のばしょへ行く');
      const c = /^(横|よこ)(.+)、(?:縦|たて)(.+)$/d.exec(protectedText) || /^(縦|たて)(.+)、(?:横|よこ)(.+)$/d.exec(protectedText);
      if (!c) throw new AkariError('P205', '「よこ」と「たて」を1つずつ書きます。れい：よこ100、たて50のばしょへ行く');
      const a = text.slice(...c.indices[2]), b = text.slice(...c.indices[3]);
      return (c[1] === '横' || c[1] === 'よこ') ? [e(a,start+c.indices[2][0]), e(b,start+c.indices[3][0])] : [e(b,start+c.indices[3][0]), e(a,start+c.indices[2][0])];
    };
    if ((m = match(/^(.+)の(?:位置|ばしょ)(?:へ|に)行く$/d))) return node('MotionCommand', {op:'GOTO', args:coordinate(m[0],m.starts[0])});
    if ((m = match(/^(.+)秒で(.+)の(?:位置|ばしょ)へ(?:滑る|すべる)$/d)))
      return node('MotionCommand', {op:'GLIDE', args:[e(m[0],m.starts[0]), ...coordinate(m[1],m.starts[1])]});
    if ((m = match(/^(.+)の(?:位置|ばしょ)へ、?(.+)秒で(?:滑る|すべる)$/d)))
      return node('MotionCommand', {op:'GLIDE', args:[e(m[1],m.starts[1]), ...coordinate(m[0],m.starts[0])]});
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
        if (!d || !destination.slice(d.len).startsWith('の')) throw new AkariError('P205','どの リストの 何番目かを 書いてください。れい: 【くだもの】の1番目に「りんご」を入れる');
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
    if (code === 'このくり返しを終える') return statementNode('Break', line);
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
    if ((m = code.match(/^(?:横位置|よこのばしょ)を(.+)にする$/)))
      return statementNode('MotionCommand', line, { op: 'SET_X', args: [e(m[1])] });
    if ((m = code.match(/^(?:縦位置|たてのばしょ)を(.+)にする$/)))
      return statementNode('MotionCommand', line, { op: 'SET_Y', args: [e(m[1])] });
    if (code.endsWith('の方向を向く'))
      return statementNode('MotionCommand', line, {
        op: 'POINT_TO',
        args: [e(code.slice(0, -'の方向を向く'.length))],
      });
    if (code.endsWith('歩動く'))
      return statementNode('MotionCommand', line, {
        op: 'MOVE',
        args: [e(code.slice(0, -'歩動く'.length))],
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
            '自分で作ったブロックの 名前が 読めません。名前を 【】で かこんでください。れい：【ジャンプ】という手順を行う',
            line.lineNo,
            1,
          );
        if (raw === name && !bareName(name))
          throw new AkariError(
            'P201',
            'この 名前は 【】で かこんでください。れい：【ジャンプ】という手順を行う',
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
    throw new AkariError('P201', `この 文は 読めません。書き方を たしかめてください: ${line.code}`, line.lineNo, 1);
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
          throw new AkariError('P208', '計算の中に計算が入りすぎています。短い計算に分けてください', lineNo, i + 1);
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

