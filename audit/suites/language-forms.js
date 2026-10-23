// External product observations. No parser or runtime replacement is implemented here.
function languageExecution(api, source) {
  const p = makeAkariRegressionProject(api);
  const actorId = p.components.find(c => c.type === 'sprite').id;
  p.projectData.variables[0].initialValue = 5;
  p.projectData.lists[0].initialValue = [7, 8];
  p.components.push({...structuredClone(p.components[0]), id:'input-surface', type:'input', name:'入力欄', text:''});
  p.functions=[{ownerId:'stage', id:'surface-calc',name:'計算',args:['値'],source:'値を答えとして返す'}];
  p.scripts = [{targetId:actorId, event:'start', source}];
  const c = api.compileProject(p);
  if (c.errors.length) throw Error('compile: '+JSON.stringify(c.errors));
  const r = new api.RuntimeModel(p, {}), out = [], errors = [], calls = [], random = [], bindings = [];
  r.reset(12345);
  const resolve=r.resolveBinding.bind(r);
  r.resolveBinding=(name,qualifier,ctx)=>{bindings.push([name,qualifier]);return resolve(name,qualifier,ctx);};
  let time = 0, answer = null, ended = null;
  r.now = () => time;
  const next = r.prng.nextUint32.bind(r.prng);
  r.prng.nextUint32 = () => { const value = next(); random.push(value); return value; };
  r.startTone = (frequency, seconds, ctx, onEnded) => {
    calls.push(['tone', frequency, seconds, !!onEnded]); ended = onEnded; return 'surface-tone';
  };
  const q = new api.EventScheduler(p,c,r,{
    say:(id,value)=>out.push([value,time]),
    ask:(question,callback)=>{calls.push(['ask',question]); answer=callback;},
    runtimeError:(task,error)=>errors.push([error.code,error.message]),
  });
  q.running=true; q.paused=true;
  const turns = [];
  const pump = () => {
    let count=0;
    while(q.ready.length && count++<32) q.runTurn(true);
    turns.push(count);
  };
  const task = q.spawnForRuntime(actorId,'start');
  try {
    pump();
    // A wait stores the actual expression AST. Diagnostic positions intentionally
    // differ between surface forms; compare every semantic field, excluding only
    // sourceSpan. Exact positions are asserted by the editor and real-GUI suites.
    const blocked = task?.blockReason ? JSON.parse(JSON.stringify(task.blockReason,
      (key,value)=>key==='sourceSpan'?undefined:value)) : null;
    // Controlled time/audio/question events exercise the actual scheduler's waiting branch.
    if(answer) answer('回答');
    if(ended) ended();
    time=1000; q.recheckBlocked(true); pump();
    const a=r.actor(actorId);
    return {out,errors,calls,random,bindings,randomState:r.prng.state,turns,blocked,
      vars:[...r.projectVars],lists:[...r.projectLists],
      actor:{x:a.x,y:a.y,direction:a.direction},input:r.actor('input-surface').inputValue,
      state:task?.state,answer:task?.lastAnswer};
  } finally {q.stop();}
}

function runLanguageForms(api, manifest, golden, referenceCorpus, schemaIds, inlineCases, inlineNegative) {
  const results=[];
  const eq=(a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('expected '+JSON.stringify(b)+'; got '+JSON.stringify(a));};
  const ok=(v,m='assertion failed')=>{if(!v)throw Error(m);};
  const test=(id,fn)=>{try {fn();results.push({id,status:'PASS'});}catch(e){results.push({id,status:'FAIL',detail:(e.code||e.name)+': '+e.message});}};
  const parsed=s=>{const r=api.parseSyntax(s);ok(r.ast,JSON.stringify(r.syntaxDiagnostics));return r.ast;};
  const exec=s=>languageExecution(api,s);
  for (const c of manifest.cases) {
    const id='LANG-SURFACE-'+c.id+'/'+c.key;
    test(id,()=>{
      const ast=parsed(c.source);
      ok(api.astEquivalent(ast,c.canonicalAst),'canonical AST mismatch');
      eq(ast.source,c.source);
      const formatted=api.formatScript(ast);
      eq(formatted,c.canonicalFormatted);
      ok(api.astEquivalent(ast,parsed(formatted)),'format reparse');
      eq(api.formatScript(parsed(formatted)),formatted);
      eq(exec(c.source),golden[c.id+'/'+c.key]);
    });
  }
  test('LANG-ORDER-009',()=>{for(const c of referenceCorpus)ok(api.astEquivalent(parsed(c.source),c.ast),c.source);});
  test('LANG-ORDER-012',()=>eq(api.BLOCK_SCHEMAS.map(s=>s.id).filter(id=>schemaIds.includes(id)),schemaIds));
  test('LANG-ORDER-006',()=>{
    const source='3を未登録に加える', ast=parsed(source);
    for(const initialValue of [0,'文字',false]) {
      const p=makeAkariRegressionProject(api);
      p.projectData.variables.push({id:'surface-name',name:'未登録',initialValue});
      const changed=api.parseSyntax(source,{symbols:api.buildSymbols(p)});
      ok(api.astEquivalent(ast,changed.ast));
    }
    const p=makeAkariRegressionProject(api);
    ok(api.analyzeAst(ast,p,{targetId:'stage'}).some(d=>d.code==='S301'));
    for(const source of ['3を点数に代入する','3を点数に足す','3を名前一覧に追加する','0秒間待つ']) {
      p.functions=[{ownerId:'stage', id:'surface-function',name:'試す',args:[],source:source+'\n0を答えとして返す'}];
      ok(api.compileProject(p).errors.some(d=>d.code==='S305'),'purity: '+source);
    }
  });
  test('LANG-ORDER-007',()=>{
    const literal='「1を点数に足す。なら、まで※という文字」';
    eq(parsed(literal+'という').body[0].value.value,literal.slice(1,-1));
    for(const name of ['手がかり','なら未満間','をにからより横縦秒','未満','と等しい','もし点数']) {
      const ast=parsed('3を【'+name+'】に加える ※  空白　 ');
      eq(ast.body[0].target,{name,qualifier:'exact'});
      eq(ast.body[0].inlineComment,'※  空白　 ');
    }
    ok(api.astEquivalent(parsed('（2＋3）を作品の点数に加える'),parsed('作品の点数に（2＋3）を足す')));
    ok(api.astEquivalent(parsed('名前一覧の1番目を点数に加える'),parsed('点数に名前一覧の1番目を足す')));
    for(const source of ['「をに」を名前一覧に追加する','「の末尾に」を名前一覧の末尾に追加する','3を【の末尾】に代入する']) parsed(source);
  });
  const negative=[
    '点数を10に増やす','点数を10に減らす','1を点数に残高に足す','を点数に代入する','1をに代入する',
    '点数にを代入する','1に点数を代入する','3を点数を足す','3を点数に足すです',
    '画面の左下のはしから、右へ100歩、左へ50歩のばしょへ行く','画面の左下のはしから、のばしょへ行く','画面の左下のはしから、100歩、50歩のばしょへ行く','画面の左下のはしから、右へ100歩、上へ50歩、右へ20歩のばしょへ行く',
    '1秒後に、画面の左下のはしから、右へ100歩、上へ50歩のばしょへ行く','画面の左下のはしから、右へ100歩、1秒かけて、上へ50歩のばしょへ行く','1秒秒かけて、画面の左下のはしから、右へ100歩、上へ50歩のばしょへ行く',
    '1秒かけて、、画面の左下のはしから、右へ100歩、上へ50歩のばしょへ行く','画面の左下のはしから、右へ100歩、上へ50歩のばしょへで行く','1秒かけて、画面の左下のはしから、右へ100歩、上へ50歩のばしょにに行く',
    '15右に回る','15秒右に回る','15度上に回る','0.2秒440Hzの音を鳴らし始める','0.2秒、440の音を鳴らし始める',
    '点数が10未満あいだ、次のことをくり返す\n  何もしない','点数が10と異なるまで待つ',
    '10より点数が小さいあいだ、次のことをくり返す\n  何もしない',
    'もし 条件（条件の答え（あてはまる））が成り立つなら','もし 条件（条件の答え（あてはまる））が成り立つなら、\n※本文なし','でなければ\n  何もしない',
    'もし 条件（条件の答え（あてはまる））が成り立つなら\n  何もしない\n何もしない\nでなければ\n  何もしない',
    'もし 条件（条件の答え（あてはまる））が成り立つなら、何もしない','もし 条件（条件の答え（あてはまる））が成り立つなら\n  何もしない\nでなければ、何もしない',
    '3回だけ','「名前は？」と聞きたい','少し右へ','点数に1を3回足す',
  ];
  for(const [i,source] of negative.entries()) {
    const id='LANG-SURFACE-NEG-'+String(i+1).padStart(3,'0');
    if ([31,32].includes(i)) test('RELEASE-INLINE-REPLACES-'+id,()=>ok(api.parseSyntax(source).ast,source));
    else test(id,()=>ok(!api.parseSyntax(source).ast,source));
  }
  for (const c of inlineCases) test(c.id,()=>{
    ok(api.astEquivalent(parsed(c.source),parsed(c.canonical)),'inline AST');
    eq(exec(c.source),exec(c.canonical));
    eq(exec(c.source).vars.find(([name])=>name==='点数')[1],c.value);
    eq(api.formatScript(parsed(c.source)),api.formatScript(parsed(c.canonical)));
  });
  for (const [id,source] of inlineNegative) test('RELEASE-INLINE-NEG/'+id,()=>ok(!api.parseSyntax(source).ast,source));
  test('LANG-ORDER-003',()=>{
    for(const [source,canonical] of [
      ['画面の左下のはしから、上へ1歩から100歩のどれか、右へ1歩から100歩のどれかのばしょへ行く','画面の左下のはしから、右へ1歩から100歩のどれか、上へ1歩から100歩のどれかのばしょへ行く'],
      ['乱数（0、1）秒かけて、画面の左下のはしから、上へ乱数（1、100）歩、右へ乱数（1、100）歩のばしょへ行く','0秒から1秒のどれかかけて、画面の左下のはしから、右へ1歩から100歩のどれか、上へ1歩から100歩のどれかのばしょへ行く'],
      ['乱数（0、1）秒かけて、いまのばしょから、下へ1歩から100歩のどれか、左へ1歩から100歩のどれか動く','0秒から1秒のどれかかけて、いまのばしょから、左へ1歩から100歩のどれか、下へ1歩から100歩のどれか動く'],
      ['乱数（1、9）を名前一覧の乱数（1、2）番目に挿入する','名前一覧の乱数（1、2）番目に乱数（1、9）を挿入する'],
      ['（乱数（1、100）より乱数（1、100）が小さい）の値を言う','（乱数（1、100）が乱数（1、100）より小さい）の値を言う'],
      ['乱数（1、2）秒、乱数（440、880）Hzの音を鳴らし始める','乱数（440、880）Hzの音を乱数（1、2）秒鳴らし始める'],
    ]) eq(exec(source),exec(canonical));
    const state=exec('画面の左下のはしから、上へ1歩から100歩のどれか、右へ1歩から100歩のどれかのばしょへ行く');
    eq(state.random.length,2);ok(state.actor.x!==state.actor.y,'seed distinguishes coordinates');
  });
  test('LANG-ORDER-004',()=>{
    const r=exec('乱数（2、3）回だけくり返す\n  1を点数に足す');
    eq(r.random.length,1);eq(r.vars,[['点数',8]]);
    const each=exec('名前一覧の各要素を項目としてくり返す\n  名前一覧の中身を全部消す\n  項目の値を言う');
    eq(each.out,[['7',0],['8',0]]);
    const p=makeAkariRegressionProject(api);p.scripts=[{targetId:'stage',event:'start',source:'名前一覧の各要素を項目としてくり返す\n  1を項目に代入する'}];
    ok(api.compileProject(p).errors.some(d=>d.code==='S312'));
    eq(exec('「質問」と聞いて待つ\n答えの値を言う').calls,[['ask','質問']]);
    eq(exec('「質問」と聞いて待つ\n答えの値を言う').out,[['回答',1000]]);
    const functionResult=exec('（（2）を渡して、【計算】で求めた答え）を名前一覧の（（1）を渡して、【計算】で求めた答え）番目に挿入する');
    eq(functionResult,exec('名前一覧の（（1）を渡して、【計算】で求めた答え）番目に（（2）を渡して、【計算】で求めた答え）を挿入する'));
    eq(functionResult.bindings.filter(b=>b[0]==='値').length,2);
    eq(functionResult.lists,[['名前一覧',[2,7,8]]]);
    const sensorResult=exec('（たてのばしょよりよこのばしょが大きい）の値を言う');
    eq(sensorResult,exec('（よこのばしょがたてのばしょより大きい）の値を言う'));eq(sensorResult.out,[['あてはまる',0]]);
    for(const sensor of ['「a」キーが押されている','「a」キーが押されていない','マウスが押されている','マウスが押されていない']) {
      for(const source of [`（（${sensor}）が条件の答え（あてはまる）と等しい）の値を言う`,`（条件の答え（あてはまる）が（${sensor}）と等しい）の値を言う`]) {
        const canonical=source.replace('と等しい','と同じ');
        ok(api.astEquivalent(parsed(source),parsed(canonical)),'sensor compound role boundary');
        eq(exec(source),exec(canonical));
      }
    }
  });
  test('LANG-ORDER-005',()=>{
    for(const [source,canonical,code] of [
      ['画面の左下のはしから、上へ（数（「x」））歩、右へ（1÷0）歩のばしょへ行く','画面の左下のはしから、右へ（1÷0）歩、上へ（数（「x」））歩のばしょへ行く','R401'],
      ['1÷0を名前一覧の0番目に挿入する','名前一覧の0番目に1÷0を挿入する','R404'],
      ['（数（「x」）より1÷0が大きい）の値を言う','（1÷0が数（「x」）より大きい）の値を言う','R401'],
    ]) {
      const result=exec(source);eq(result,exec(canonical));eq(result.errors[0]?.[0],code);
      eq(result.vars,[['点数',5]]);eq(result.lists,[['名前一覧',[7,8]]]);
    }
  });
  test('LANG-ORDER-015',()=>{
    eq(exec('（条件の答え（あてはまらない）かつ（0より1÷0が大きい））の値を言う\n（条件の答え（あてはまる）または（0より1÷0が小さい））の値を言う').out,[['あてはまらない',0],['あてはまる',0]]);
    for(const value of [9,10,11]) {
      eq(exec(`（${value}が10未満）の値を言う`).out,[[value<10?'あてはまる':'あてはまらない',0]]);
      eq(exec(`（${value}が10を超える）の値を言う`).out,[[value>10?'あてはまる':'あてはまらない',0]]);
    }
    eq(exec('条件（10より点数が大きい）が成り立つ間、次のことをくり返す\n  1を点数に加える').vars,[['点数',5]]);
    eq(exec('点数が10より小さくなるまで、次のことをくり返す\n  1を点数に加える').vars,[['点数',5]]);
  });
  test('LANG-SURFACE-INDEPENDENT-VALUES',()=>{
    for(const [source,value] of [['3を点数に代入する',3],['点数を3増やす',8],['点数を3だけ減らす',2],['3を点数から引く',2]]) eq(exec(source).vars,[['点数',value]]);
    eq(exec('3を名前一覧の1番目に挿入する').lists,[['名前一覧',[3,7,8]]]);
    eq(exec('3を名前一覧の3番目に挿入する').lists,[['名前一覧',[7,8,3]]]);
    eq(exec('名前一覧から1番目を削除する').lists,[['名前一覧',[8]]]);
    eq(exec('名前一覧の中身を全部消す').lists,[['名前一覧',[]]]);
    eq(exec('画面の左下のはしから、上へ50歩、右へ100歩のばしょに行く').actor,{x:100,y:50,direction:0});
    eq(exec('いまのばしょから、上へ5歩、左へ20歩動く').actor,{x:300,y:205,direction:0});
    eq(exec('いまのばしょから、右へ－10歩動く').actor,{x:310,y:200,direction:0});
    eq(exec('15度左に回る').actor.direction,15);
    eq(exec('「値」を「入力欄」に入れる').input,'値');
    eq(exec('0.2秒、440Hzの音を鳴らし始める').calls,[['tone',440,0.2,false]]);
    eq(exec('0.2秒、440Hzの音を鳴らす').blocked.kind,'audio');
    eq(exec('1秒間待つ\n「後」という').out,[['後',1000]]);
  });
  // Independent values from LANGUAGE.md 組み込み求値の一覧: the remainder keeps the
  // dividend's sign, text length counts code points, text containment is a contiguous
  // substring, and bouncing at the left edge mirrors the direction and puts the box at 0.
  test('LANG-BUILTIN-INDEPENDENT-VALUES',()=>{
    for(const [source,value] of [
      ['点数を余り（－7、3）にする',-1],['点数を余り（7、－3）にする',1],['点数を余り（－7、－3）にする',-1],['点数を余り（5.5、2）にする',1.5],
      ['点数を「😀あ」の長さにする',2],['点数を「」の長さにする',0],['点数を「か\u3099」の長さにする',2],
      ['もし「こんにちは」に「にち」が含まれていれば、点数を1にする',1],['もし「こんにちは」に「ちに」が含まれていれば、点数を1にする',5],
      ['もし「こんにちは」に「」が含まれていれば、点数を1にする',1],
    ]) eq(exec(source).vars,[['点数',value]]);
    for(const [source,code] of [['点数を余り（1、0）にする','R401'],['もし「123」に1が含まれていれば、点数を1にする','R411'],['もし［1、2］に［1］が含まれていれば、点数を1にする','R411']]) {
      const result=exec(source);eq(result.errors[0]?.[0],code);eq(result.vars,[['点数',5]]);
    }
    // The regression actor is 180×180 with its centre at 横320・縦200 on a 640×400 stage.
    for(const [source,actor] of [
      ['すがたを「丸」にかえる\n画面の左下のはしから、左へ20歩、上へ（たてのばしょ）歩のばしょへ行く\n方向を180度にする\n画面の端にふれていれば、はね返る',{x:90,y:200,direction:0}],
      ['すがたを「丸」にかえる\n画面の左下のはしから、右へ0歩、上へ（たてのばしょ）歩のばしょへ行く\n方向を180度にする\n画面の端にふれていれば、はね返る',{x:90,y:200,direction:0}],
      ['すがたを「丸」にかえる\n画面の左下のはしから、右へ100歩、上へ（たてのばしょ）歩のばしょへ行く\n方向を180度にする\n画面の端にふれていれば、はね返る',{x:100,y:200,direction:180}],
      ['すがたを「丸」にかえる\n画面の左下のはしから、右へ320歩、上へ10歩のばしょへ行く\n方向を270度にする\n画面の端にふれていれば、はね返る',{x:320,y:90,direction:90}],
    ]) eq(exec(source).actor,actor);
  });
  // A subject before a statement names who does it (LANGUAGE.md 202), also for the bounce
  // command that reads like a condition and for statements of the finite parser; the
  // list question for 「〜に〜を入れる」 stays the same with or without a subject.
  test('LANG-SUBJECT-STATEMENTS',()=>{
    const symbols=api.buildSymbols(makeAkariRegressionProject(api)),read=s=>api.parseSyntax(s,{symbols});
    for(const [source,kind,op] of [
      ['マスコットは画面のはしにふれていれば、はね返る。','MotionCommand','BOUNCE'],
      ['マスコットは、画面のはしにふれていれば、はね返る。','MotionCommand','BOUNCE'],
      ['マスコットは「入力欄」に「あ」を入れる。','LooksCommand','SET_INPUT'],
    ]){const r=read(source);ok(r.ast,source+' '+JSON.stringify(r.syntaxDiagnostics));const n=r.ast.body[0];
      eq([n.kind,n.op,n.actorRef],[kind,op,{kind:'named',name:'マスコット'}]);eq(api.formatScript(r.ast).trim(),source.replace('は、','は'));}
    for(const source of ['名前一覧に「あ」を入れる。','マスコットは名前一覧に「あ」を入れる。']){const r=read(source);ok(!r.ast,source);
      ok(/さいごに入れるのか、何番目かと 入れかえるのか/.test(r.syntaxDiagnostics[0].message),source);}
    // 1.3.1: headings are written in easy words; the older words are still read. 1.5.0 writes the keyboard's own key names (「スペース」キー).
    for(const [source,written] of [
      ['マスコットがクリックされたとき、\n  「a」と言う。','マスコットがおされたとき、'],
      ['マスコットがおされたとき、\n  「a」と言う。','マスコットがおされたとき、'],
      ['「空白」キーを押すたびに、マスコットは、\n  「a」と言う。','「スペース」キーをおすたびに、マスコットは、'],
      ['キーが押されたとき、マスコットは、\n  「a」と言う。','キーがおされたとき、マスコットは、'],
      ['背景が変わったとき、マスコットは、\n  「a」と言う。','はいけいがかわったとき、マスコットは、'],
    ]){const r=read(source);ok(r.ast,source+' '+JSON.stringify(r.syntaxDiagnostics));eq(api.formatScript(r.ast).split('\n')[0],written);}
    // 1.3.1: what a child naturally writes reads as the written form (tried only after the written form fails).
    for(const [source,written] of [
      ['「名前は？」と聞く。','「名前は？」とたずねて、答えを待つ。'],['マスコットが10歩進む。','マスコットが前へ10歩進む。'],['マスコットも10歩進む。','マスコットは前へ10歩進む。'],
      ['まず10歩進む。','前へ10歩進む。'],['すがたをかくします。','すがたをかくす。'],['かくれる。','すがたをかくす。'],
      ['10歩進み、右に90度回る。','前へ10歩進む。\n右に90度回る。'],['10歩進んで右に90度回る。','前へ10歩進む。\n右に90度回る。'],
      ['もし1が2より小さかったら、\n  何もしない。','もし1が2より小さければ、\n  何もしない。'],['もし1が2未満なら、\n  何もしない。','もし1が2より小さければ、\n  何もしない。'],
      ['もし1が2でないなら、\n  何もしない。','もし1が2と同じでなければ、\n  何もしない。'],['もし1が1か2なら、\n  何もしない。','もし1が1と同じか、1が2と同じなら、\n  何もしない。'],
      ['マスコットをクリックしたら、\n  何もしない。','マスコットがおされたとき、\n  何もしない。'],['「空白」キーをおしたとき、マスコットは、\n  何もしない。','「スペース」キーをおすたびに、マスコットは、\n  何もしない。'],
      ['「a」と「b」をつなげて言う。','「a」と「b」をつなげて言う。'],['つなぐ（「a」、「b」）を言う。','「a」と「b」をつなげて言う。'],['あまり（10、3）を言う。','10÷3のあまりを言う。'],
      ['向きを90度にする。','画面の上を向く。'],['（1＋2）秒待つ。','（1＋2）秒待つ。'],
      ['マスコットはいまのばしょから、右へ10歩動く。','マスコットは、いまのばしょから、右へ10歩動く。'],['マスコットを、いまのばしょから、右へ10歩動かす。','マスコットは、いまのばしょから、右へ10歩動く。'],
      ['マスコットは、2秒かけて、いまのばしょから、右へ10歩動く。','マスコットは2秒かけて、いまのばしょから、右へ10歩動く。'],
      ['マスコットは、画面の左下のはしから、右へ100歩、上へ50歩のばしょへ行く。','マスコットは画面の左下のはしから、右へ100歩、上へ50歩のばしょへ行く。'],
    ]){const r=read(source);ok(r.ast,source+' '+JSON.stringify(r.syntaxDiagnostics));eq(api.formatScript(r.ast).trim(),written);}
    // A condition with もし missing, and 〜になったら, are not guessed.
    for(const source of ['1が2より小さかったら、\n  何もしない。','もし1が2になったら、\n  何もしない。']){const r=read(source);ok(!r.ast,source);}
    // Color words the picker shows are text like 赤, with or without 「 」.
    for(const word of ['だいだい','むらさき','もも色','ねずみ色','赤']){const r=read('ペンの色を'+word+'にする。');ok(r.ast,word);eq(api.formatScript(r.ast).trim(),'ペンの色を「'+word+'」にする。');}
    // Calculations with a fixed number of inputs have no ＋ to add one more.
    for(const [id,variadic] of [['BuiltinCall:余り',false],['BuiltinCall:乱数',false],['BuiltinCall:四捨五入',false],['BuiltinCall:つなぐ',true],['BuiltinCall:最大',true]])
      eq(api.BLOCK_SCHEMAS.find(s=>s.id===id).inputs.find(s=>s.key==='args').variadic,variadic);
  });
  return {results,total:results.length,failed:results.filter(r=>r.status==='FAIL').length};
}
