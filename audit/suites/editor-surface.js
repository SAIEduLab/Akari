// Expected source strings are authored independently of the product's range planner.
function runEditorSurface10(api, forms) {
  const results = [], ok = (v,m='assertion failed') => {if(!v) throw Error(m);};
  const eq = (a,b) => ok(JSON.stringify(a)===JSON.stringify(b),`expected ${JSON.stringify(b)}; got ${JSON.stringify(a)}`);
  const test = (id, fn) => {try {fn();results.push({id,status:'PASS'});} catch(e) {results.push({id,status:'FAIL',detail:(e.code||e.name)+': '+e.message});}};
  const setup = source => {
    const p=api.makeDefaultProject();p.scripts=[{targetId:'stage',event:'start',source}];
    return api.createEditorSession('script:stage:start',source,{targetId:'stage',event:'start'},p,4);
  };
  const change = (s,id,value,key='value') => api.prepareBlockEdit(s,{type:'field',id,key,value});
  const input = (s,path) => path.reduce((n,k)=>n[k],s.blockView.bodies.body[0]);
  const edits = [
    ['value-first',' 点数に3を足す。  ※  残す　 ',['inputs','value'],8,' 点数に8を足す。  ※  残す　 '],
    ['assign','点数を3にする。', ['inputs','value'],8,'点数を8にする。'],
    ['target-first','点数を3にする。', ['inputs','value'],8,'点数を8にする。'],
    ['increase','点数を3増やす。',['inputs','value'],8,'点数を8増やす。'],
    ['decrease','点数を3減らす。',['inputs','value'],8,'点数を8減らす。'],
    ['subtract','点数から3を引く。',['inputs','value'],8,'点数から8を引く。'],
    ['append','名前一覧の最後に3を入れる。',['inputs','value'],8,'名前一覧の最後に8を入れる。'],
    ['insert-index','名前一覧の3番目に3を入れる。',['inputs','index','inputs','value'],2,'名前一覧の2番目に3を入れる。'],
    ['insert-value','名前一覧の3番目に3を入れる。',['inputs','value'],8,'名前一覧の3番目に8を入れる。'],
    ['delete-index','名前一覧の3番目を消す。',['inputs','index','inputs','value'],2,'名前一覧の2番目を消す。'],
    ['input','「入力欄」に3を入れる。',['inputs','args',1],8,'「入力欄」に8を入れる。'],
    ['turn','左に３度回る。',['inputs','args',0,'inputs','value'],8,'左に8度回る。'],
    ['goto-x','横3、縦3の位置へ行く。',['inputs','args',0,'inputs','value'],8,'横8、縦3の位置へ行く。'],
    ['goto-y','横3、縦3の位置へ行く。',['inputs','args',1,'inputs','value'],8,'横3、縦8の位置へ行く。'],
    ['glide-x','横3、縦3の位置へ3秒かけて動く。',['inputs','args',1,'inputs','value'],8,'横8、縦3の位置へ3秒かけて動く。'],
    ['glide-y','横3、縦3の位置へ3秒かけて動く。',['inputs','args',2,'inputs','value'],8,'横3、縦8の位置へ3秒かけて動く。'],
    ['glide-time','横3、縦3の位置へ3秒かけて動く。',['inputs','args',0,'inputs','value'],8,'横3、縦3の位置へ8秒かけて動く。'],
    ['tone-frequency','3Hzの音を3秒鳴らす。',['inputs','args',0,'inputs','value'],8,'8Hzの音を3秒鳴らす。'],
    ['tone-time','3Hzの音を3秒鳴らす。',['inputs','args',1,'inputs','value'],8,'3Hzの音を8秒鳴らす。'],
    ['wait','3秒待つ。',['inputs','seconds','inputs','value'],8,'8秒待つ。'],
    ['compare-left','（3が3より小さい）の値を言う。',['inputs','value','inputs','left'],8,'（8が3より小さい）の値を言う。'],
    ['compare-right','（3が3未満）の値を言う。',['inputs','value','inputs','right'],8,'（3が8未満）の値を言う。'],
    ['nested-expression','点数に（3＋3）を足す。',['inputs','value','inputs','right'],8,'点数に（3＋8）を足す。'],
    ['inline-body','もし点数が3より大きいなら、点数に3を足す。 ※ 後ろ  ',['bodies','thenBody',0,'inputs','value'],8,'もし点数が3より大きいなら、点数に8を足す。 ※ 後ろ  '],
    ['inline-condition','もし点数が3より小さいなら、点数に3を足す。',['inputs','condition','inputs','right'],8,'もし点数が8より小さいなら、点数に3を足す。'],
  ];
  for(const [key,line,path,value,expected] of edits) test('RELEASE-EDIT/'+key,()=>{
    // Keep a deliberately noncanonical unrelated line and blank lines byte-for-byte.
    const source=line.trimStart()+'\n\n「😀é」  と言う。   ※ そのまま  \n';
    const s=setup(source), before=JSON.stringify(s.blockView), n=input(s,path);
    ok(s.syntaxAst,JSON.stringify(s.syntaxDiagnostics));
    const result=change(s,n.id,value);
    eq(result.source,expected.trimStart()+source.slice(line.trimStart().length));
    eq(s.sourceText,source);eq(JSON.stringify(s.blockView),before);
    ok(api.astEquivalent(result.syntaxAst,api.blockDecode(result.blockView)));
  });
  test('RELEASE-EDIT/target-role',()=>{
    const s=setup('点数を3にする。 ※ 後ろ '), t=s.blockView.bodies.body[0].inputs.target;
    eq(change(s,t.id,'合計','name').source,'合計を3にする。 ※ 後ろ ');
  });
  test('RELEASE-EDIT/crlf-unicode',()=>{
    const source='名前一覧の最後に「😀é」を入れる。  ※ 末尾  \r\n点数に3を足す。\r\n';
    const s=setup(source), n=s.blockView.bodies.body[1].inputs.value;
    eq(change(s,n.id,8).source,source.replace('点数に3を','点数に8を'));
    const first=s.blockView.bodies.body[0].inputs.value;
    eq(change(s,first.id,'😀新é').source,source.replace('😀é','😀新é'));
  });
  test('RELEASE-EDIT/all-forms-noop',()=>{
    for(const c of forms) {
      const s=setup(c.source);ok(s.syntaxAst,c.source);
      const before=JSON.stringify(s);
      const result=api.prepareBlockEdit(s,{type:'noop'});
      eq(result.source,c.source);eq(result.changed,false);eq(JSON.stringify(s),before);
    }
  });
  test('RELEASE-EDIT/inline-expand',()=>{
    const source='※ 前  \nもし条件（条件の答え（あてはまる））が成り立つなら、点数に3を足す。 ※ 本文  \n\n「😀」  と言う。 ※ 後  \n';
    const s=setup(source), branch=s.blockView.bodies.body[1];
    const result=api.prepareBlockEdit(s,{type:'insert',parentId:branch.id,body:'thenBody',index:1,node:api.createBlock('NoOperation')});
    eq(result.source,'※ 前  \nもし条件（条件の答え（あてはまる））が成り立つなら、\n  点数に3を足す。  ※ 本文  \n  何もしない。\n\n「😀」  と言う。 ※ 後  \n');
    eq(result.syntaxAst.body[1].inlineComment,'');eq(result.syntaxAst.body[1].thenBody[0].inlineComment,'※ 本文  ');
  });
  test('RELEASE-EDIT/insert-remove-move',()=>{
    const s=setup('点数に1を足す。\n\n点数に2を足す。 ※ 後  \n3秒待つ。');
    const b=s.blockView.bodies.body;
    eq(api.prepareBlockEdit(s,{type:'move',id:b[1].id,parentId:s.blockView.id,body:'body',index:0}).source,
      '点数に2を足す。 ※ 後  \n点数に1を足す。\n3秒待つ。');
    eq(api.prepareBlockEdit(s,{type:'remove',id:b[1].id}).source,'点数に1を足す。\n\n3秒待つ。');
  });
  test('RELEASE-EDIT/atomic-stale-ime-limit',()=>{
    const s=setup('点数に3を足す。'), n=s.blockView.bodies.body[0].inputs.value;
    const op={type:'field',id:n.id,key:'value',value:8};
    const reject=options=>{const before=JSON.stringify(s);let failed=false;try{api.prepareBlockEdit(s,op,options);}catch{failed=true;}ok(failed);eq(JSON.stringify(s),before);};
    reject({sourceRevision:99});reject({contextRevision:3});reject({validateCandidate:()=>false});
    s.pendingEdit={id:'composing',composing:true};reject({});s.pendingEdit=null;
    const limit=setup('点数に3を足す。\n※'+'a'.repeat(api.LIMITS.sourceEach-11));
    const before=JSON.stringify(limit);let failed=false;
    try{change(limit,limit.blockView.bodies.body[0].inputs.value.id,123456789);}catch{failed=true;}
    ok(failed);eq(JSON.stringify(limit),before);
  });
  test('RELEASE-EDIT/inline-comments-and-position',()=>{
    const source='もし条件（条件の答え（あてはまる））が成り立つなら、\n  「😀」を言う。  ※ 本文  \n※ 枝の間  \nそうでなければ、\n  「é」を言う。 ※ 別枝  ';
    const s=setup(source), n=s.syntaxAst.body[0];
    eq(n.inlineComment,'');eq(n.thenBody[0].inlineComment,'※ 本文  ');eq(n.thenBody[1].text,' 枝の間  ');
    eq(n.elseComment,'');eq(n.elseBody[0].inlineComment,'※ 別枝  ');
    eq(n.thenBody[0].sourceSpan.startColumn,3);eq(n.elseBody[0].sourceSpan.startColumn,3);
  });
  test('RELEASE-EDIT/batch-role-offsets',()=>{
    const s=setup('横3、縦3の位置へ3秒かけて動く。 ※ 末尾 '), args=s.blockView.bodies.body[0].inputs.args;
    const result=api.prepareBlockEdit(s,{type:'batch',operations:[
      {type:'field',id:args[0].inputs.value.id,key:'value',value:10},
      {type:'field',id:args[1].inputs.value.id,key:'value',value:200},
      {type:'field',id:args[2].inputs.value.id,key:'value',value:50},
    ]});
    eq(result.source,'横200、縦50の位置へ10秒かけて動く。 ※ 末尾 ');
  });
  test('RELEASE-EDIT/predicate-in-expression-slot',()=>{
    const source='（0＋0）の値を言う。 ※ 末尾  \n「😀」  と言う。\n',s=setup(source);
    const binary=s.blockView.bodies.body[0].inputs.value;
    for(const [schema,expression] of [
      ['BuiltinCall:CONTAINS','0に0が含まれている'],
      ['BuiltinCall:INDEX_OF','0で0が最初にある番号'],
      ['BuiltinCall:LENGTH','0の長さ'],
    ]) {
      const result=api.prepareBlockEdit(s,{type:'replace',id:binary.inputs.left.id,node:api.createBlock(schema)});
      eq(result.source,'（（'+(schema==='BuiltinCall:CONTAINS'?'0に0が入っている':expression)+'）＋0）の値を言う。 ※ 末尾  \n「😀」  と言う。\n');
      eq(result.blockView.bodies.body[0].inputs.value.inputs.left.schemaId,schema);
      eq(s.sourceText,source);
    }
  });
  test('RELEASE-EDIT/condition-connective-operands',()=>{
    for(const head of ['3が8より小さいあいだ','条件（3が8未満）が成り立つあいだ','3が8より小さいあいだ',
      '3が8と同じであるあいだ','3が8と違うあいだ','3が8以上のあいだ',
      '条件（3が8未満）が成り立つまで','3が8と同じになるまで','3が8より小さくなるまで']) {
      const source=head+'、くり返す。 ※ 頭  \r\n  点数に3を足す。 ※ 本文  \r\n「😀」 と言う。\r\n';
      const s=setup(source), n=s.blockView.bodies.body[0].inputs.condition.inputs.left;
      eq(change(s,n.id,4).source,source.replace('3が','4が'));
      eq(s.sourceText,source);
    }
  });
  test('RELEASE-EDIT/condition-wait-and-inline-ranges',()=>{
    for(const prefix of ['', 'もし条件（条件の答え（あてはまる））が成り立つなら、']) for(const text of [
      '条件（3が8未満）が成り立つまで待つ。', '3が8と同じになるまで待つ。',
      '条件（（3が8未満）かつ（条件の答え（あてはまる）））が成り立つまで待つ。']) {
      const source=prefix+text+' ※ 後ろ  \n「😀」 と言う。\n',s=setup(source);
      const stmt=prefix?s.blockView.bodies.body[0].bodies.thenBody[0]:s.blockView.bodies.body[0];
      let n=stmt.inputs.condition;
      while(n.inputs.left)n=n.inputs.left;
      eq(change(s,n.id,4).source,source.replace('3が','4が'));
      const location=s.nodeMap.get(n.id);
      eq(location.sourceSpan.startColumn,[...source.slice(0,source.indexOf('3'))].length+1);
    }
  });
  test('RELEASE-EDIT/condition-replacement-keeps-body',()=>{
    const source='3が8より小さいあいだ、くり返す。 ※ 頭  \r\n  点数に3を足す。 ※ 本文  \r\n「😀」 と言う。\r\n';
    const s=setup(source),n=s.blockView.bodies.body[0].inputs.condition;
    const result=api.prepareBlockEdit(s,{type:'replace',id:n.id,node:api.createBlock('CompareExpression:GT')});
    eq(result.source,'0が0より大きいあいだ、くり返す。'+source.slice(source.indexOf(' ※ 頭')));
  });
  test('RELEASE-EDIT/inline-finite-statement-composition',()=>{
    let checked=0;
    for(const c of forms.filter(c=>!c.source.includes('\n'))) {
      const parsed=api.parseSyntax(c.source);ok(parsed.ast,c.source);
      if(!parsed.ast.body.length || ['IfStatement','RepeatCount','RepeatWhile','RepeatUntil','ForEach','Forever'].includes(parsed.ast.body[0].kind))continue;
      const ifHead='もし条件（条件の答え（あてはまる））が成り立つなら、';
      const actual=api.parseSyntax(ifHead+c.source);
      const expected=api.parseSyntax(ifHead+'\n  '+c.canonical);
      ok(actual.ast&&expected.ast,c.source);ok(api.astEquivalent(actual.ast,expected.ast),c.source);checked++;
    }
    ok(checked>100,'finite statement composition coverage');
  });
  return {total:results.length,failed:results.filter(r=>r.status!=='PASS').length,results};
}
