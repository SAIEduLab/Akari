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
    ['value-first',' 3 を 点数 に 加える  ※  残す　 ',['inputs','value'],8,' 8 を 点数 に 加える  ※  残す　 '],
    ['assign','3を点数に代入する', ['inputs','value'],8,'8を点数に代入する'],
    ['target-first','点数 に 3 を 代入する', ['inputs','value'],8,'点数 に 8 を 代入する'],
    ['increase','点数を3だけ増やす',['inputs','value'],8,'点数を8だけ増やす'],
    ['decrease','点数を3減らす',['inputs','value'],8,'点数を8減らす'],
    ['subtract','3を点数から引く',['inputs','value'],8,'8を点数から引く'],
    ['append','3を名前一覧の末尾に追加する',['inputs','value'],8,'8を名前一覧の末尾に追加する'],
    ['insert-index','3を名前一覧の3番目に挿入する',['inputs','index'],2,'3を名前一覧の2番目に挿入する'],
    ['insert-value','3を名前一覧の3番目に挿入する',['inputs','value'],8,'8を名前一覧の3番目に挿入する'],
    ['delete-index','名前一覧から3番目を削除する',['inputs','index'],2,'名前一覧から2番目を削除する'],
    ['input','3を「入力欄」に入れる',['inputs','args',1],8,'8を「入力欄」に入れる'],
    ['turn','３度左に回る',['inputs','args',0],8,'8度左に回る'],
    ['goto-x','縦3、横3の位置に行く',['inputs','args',0],8,'縦3、横8の位置に行く'],
    ['goto-y','縦3、横3の位置へ行く',['inputs','args',1],8,'縦8、横3の位置へ行く'],
    ['glide-x','縦3、横3の位置へ、3秒ですべる',['inputs','args',1],8,'縦3、横8の位置へ、3秒ですべる'],
    ['glide-y','3秒で縦3、横3の位置へ滑る',['inputs','args',2],8,'3秒で縦8、横3の位置へ滑る'],
    ['glide-time','縦3、横3の位置へ3秒で滑る',['inputs','args',0],8,'縦3、横3の位置へ8秒で滑る'],
    ['tone-frequency','3秒、3Hzの音を鳴らす',['inputs','args',0],8,'3秒、8Hzの音を鳴らす'],
    ['tone-time','3秒、3Hzの音を鳴らし、終わるまで待つ',['inputs','args',1],8,'8秒、3Hzの音を鳴らし、終わるまで待つ'],
    ['wait','3秒間待つ',['inputs','seconds'],8,'8秒間待つ'],
    ['compare-left','3より3が小さいという',['inputs','value','inputs','left'],8,'3より8が小さいという'],
    ['compare-right','3が3未満と言う',['inputs','value','inputs','right'],8,'3が8未満と言う'],
    ['nested-expression','（3 ＋ 3）を点数に加える',['inputs','value','inputs','right'],8,'（3 ＋ 8）を点数に加える'],
    ['inline-body','もし 3より点数が小さいならば、3を点数に足す。 ※ 後ろ  ',['bodies','thenBody',0,'inputs','value'],8,'もし 3より点数が小さいならば、8を点数に足す。 ※ 後ろ  '],
    ['inline-condition','もし 3より点数が小さいならば、3を点数に足す。',['inputs','condition','inputs','right'],8,'もし 8より点数が小さいならば、3を点数に足す。'],
  ];
  for(const [key,line,path,value,expected] of edits) test('A10-EDIT/'+key,()=>{
    // Keep a deliberately noncanonical unrelated line and blank lines byte-for-byte.
    const source=line.trimStart()+'\n\n「😀é」  という   ※ そのまま  \n';
    const s=setup(source), before=JSON.stringify(s.blockView), n=input(s,path);
    ok(s.syntaxAst,JSON.stringify(s.syntaxDiagnostics));
    const result=change(s,n.id,value);
    eq(result.source,expected.trimStart()+source.slice(line.trimStart().length));
    eq(s.sourceText,source);eq(JSON.stringify(s.blockView),before);
    ok(api.astEquivalent(result.syntaxAst,api.blockDecode(result.blockView)));
  });
  test('A10-EDIT/target-role',()=>{
    const s=setup('3を点数に代入する ※ 後ろ '), t=s.blockView.bodies.body[0].inputs.target;
    eq(change(s,t.id,'合計','name').source,'3を合計に代入する ※ 後ろ ');
  });
  test('A10-EDIT/crlf-unicode',()=>{
    const source='「😀é」を名前一覧に追加する  ※ 末尾  \r\n3を点数に加える\r\n';
    const s=setup(source), n=s.blockView.bodies.body[1].inputs.value;
    eq(change(s,n.id,8).source,source.replace('3を','8を'));
    const first=s.blockView.bodies.body[0].inputs.value;
    eq(change(s,first.id,'😀新é').source,source.replace('😀é','😀新é'));
  });
  test('A10-EDIT/all-forms-noop',()=>{
    for(const c of forms) {
      const s=setup(c.source);ok(s.syntaxAst,c.source);
      const before=JSON.stringify(s);
      const result=api.prepareBlockEdit(s,{type:'noop'});
      eq(result.source,c.source);eq(result.changed,false);eq(JSON.stringify(s),before);
    }
  });
  test('A10-EDIT/inline-expand',()=>{
    const source='※ 前  \nもし 真なら、3を点数に加える ※ 本文  \n\n「😀」  という ※ 後  \n';
    const s=setup(source), branch=s.blockView.bodies.body[1];
    const result=api.prepareBlockEdit(s,{type:'insert',parentId:branch.id,body:'thenBody',index:1,node:api.createBlock('NoOperation')});
    eq(result.source,'※ 前  \nもし 真なら、次のことをする。\n  点数に3を足す。  ※ 本文  \n  何もしない。\n\n「😀」  という ※ 後  \n');
    eq(result.syntaxAst.body[1].inlineComment,'');eq(result.syntaxAst.body[1].thenBody[0].inlineComment,'※ 本文  ');
  });
  test('A10-EDIT/insert-remove-move',()=>{
    const s=setup('1を点数に足す\n\n2を点数に加える ※ 後  \n3秒間待つ');
    const b=s.blockView.bodies.body;
    eq(api.prepareBlockEdit(s,{type:'move',id:b[1].id,parentId:s.blockView.id,body:'body',index:0}).source,
      '2を点数に加える ※ 後  \n1を点数に足す\n3秒間待つ');
    eq(api.prepareBlockEdit(s,{type:'remove',id:b[1].id}).source,'1を点数に足す\n\n3秒間待つ');
  });
  test('A10-EDIT/atomic-stale-ime-limit',()=>{
    const s=setup('3を点数に加える'), n=s.blockView.bodies.body[0].inputs.value;
    const op={type:'field',id:n.id,key:'value',value:8};
    const reject=options=>{const before=JSON.stringify(s);let failed=false;try{api.prepareBlockEdit(s,op,options);}catch{failed=true;}ok(failed);eq(JSON.stringify(s),before);};
    reject({sourceRevision:99});reject({contextRevision:3});reject({validateCandidate:()=>false});
    s.pendingEdit={id:'composing',composing:true};reject({});s.pendingEdit=null;
    const limit=setup('3を点数に加える\n※'+'a'.repeat(api.LIMITS.sourceEach-11));
    const before=JSON.stringify(limit);let failed=false;
    try{change(limit,limit.blockView.bodies.body[0].inputs.value.id,123456789);}catch{failed=true;}
    ok(failed);eq(JSON.stringify(limit),before);
  });
  test('A10-EDIT/inline-comments-and-position',()=>{
    const source='もし 真なら、 「😀」という  ※ 本文  \n※ 枝の間  \nでなければ、 「é」という ※ 別枝  ';
    const s=setup(source), n=s.syntaxAst.body[0];
    eq(n.inlineComment,'');eq(n.thenBody[0].inlineComment,'※ 本文  ');eq(n.thenBody[1].text,' 枝の間  ');
    eq(n.elseComment,'');eq(n.elseBody[0].inlineComment,'※ 別枝  ');
    eq(n.thenBody[0].sourceSpan.startColumn,9);eq(n.elseBody[0].sourceSpan.startColumn,8);
  });
  test('A10-EDIT/batch-role-offsets',()=>{
    const s=setup('縦3、横3の位置へ、3秒ですべる ※ 末尾 '), args=s.blockView.bodies.body[0].inputs.args;
    const result=api.prepareBlockEdit(s,{type:'batch',operations:[
      {type:'field',id:args[0].id,key:'value',value:10},
      {type:'field',id:args[1].id,key:'value',value:200},
      {type:'field',id:args[2].id,key:'value',value:50},
    ]});
    eq(result.source,'縦50、横200の位置へ、10秒ですべる ※ 末尾 ');
  });
  test('A10-EDIT/predicate-in-expression-slot',()=>{
    const source='0＋0という ※ 末尾  \n「😀」  という\n',s=setup(source);
    const binary=s.blockView.bodies.body[0].inputs.value;
    for(const [schema,expression] of [
      ['BuiltinCall:CONTAINS','0に0が含まれている'],
      ['BuiltinCall:INDEX_OF','0で0が最初にある番号'],
      ['BuiltinCall:LENGTH','0の長さ'],
    ]) {
      const result=api.prepareBlockEdit(s,{type:'replace',id:binary.inputs.left.id,node:api.createBlock(schema)});
      eq(result.source,'（'+expression+'）＋0という ※ 末尾  \n「😀」  という\n');
      eq(result.blockView.bodies.body[0].inputs.value.inputs.left.schemaId,schema);
      eq(s.sourceText,source);
    }
  });
  test('A10-EDIT/condition-connective-operands',()=>{
    for(const head of ['3が8未満の間','3が8未満であるあいだ','3が8より小さいあいだ',
      '3が8と等しい間','3が8と異なるあいだ','3が8以上であるあいだ',
      '3が8未満になるまで','3が8と等しくなるまで','3が8より小さくなるまで']) {
      const source=head+'、次のことを繰り返す ※ 頭  \r\n  3 を 点数 に 加える ※ 本文  \r\n「😀」 という\r\n';
      const s=setup(source), n=s.blockView.bodies.body[0].inputs.condition.inputs.left;
      eq(change(s,n.id,4).source,source.replace(/^3/,'4'));
      eq(s.sourceText,source);
    }
  });
  test('A10-EDIT/condition-wait-and-inline-ranges',()=>{
    for(const prefix of ['', 'もし 真なら、']) for(const text of [
      '3 が 8 未満になるまで待つ', '3 が 8 と等しくなるまで待つ',
      '条件（3 が 8 未満 かつ 真）が成り立つまで待つ']) {
      const source=prefix+text+' ※ 後ろ  \n「😀」 という\n',s=setup(source);
      const stmt=prefix?s.blockView.bodies.body[0].bodies.thenBody[0]:s.blockView.bodies.body[0];
      let n=stmt.inputs.condition;
      while(n.inputs.left)n=n.inputs.left;
      eq(change(s,n.id,4).source,source.replace('3 が','4 が'));
      const location=s.nodeMap.get(n.id);
      eq(location.sourceSpan.startColumn,[...source.slice(0,source.indexOf('3'))].length+1);
    }
  });
  test('A10-EDIT/condition-replacement-keeps-body',()=>{
    const source='3 が 8 未満の間、次のことを繰り返す ※ 頭  \r\n  3 を 点数 に 加える ※ 本文  \r\n「😀」 という\r\n';
    const s=setup(source),n=s.blockView.bodies.body[0].inputs.condition;
    const result=api.prepareBlockEdit(s,{type:'replace',id:n.id,node:api.createBlock('CompareExpression:GT')});
    eq(result.source,'0が0より大きいあいだ、次のことをくり返す'+source.slice(source.indexOf(' ※ 頭')));
  });
  test('A10-EDIT/inline-finite-statement-composition',()=>{
    let checked=0;
    for(const c of forms.filter(c=>!c.source.includes('\n'))) {
      const parsed=api.parseSyntax(c.source);ok(parsed.ast,c.source);
      if(!parsed.ast.body.length || ['IfStatement','RepeatCount','RepeatWhile','RepeatUntil','ForEach','Forever'].includes(parsed.ast.body[0].kind))continue;
      const actual=api.parseSyntax('もし 真なら、'+c.source);
      const expected=api.parseSyntax('もし 真なら、次のことをする\n  '+c.canonical);
      ok(actual.ast&&expected.ast,c.source);ok(api.astEquivalent(actual.ast,expected.ast),c.source);checked++;
    }
    ok(checked>100,'finite statement composition coverage');
  });
  return {total:results.length,failed:results.filter(r=>r.status!=='PASS').length,results};
}
