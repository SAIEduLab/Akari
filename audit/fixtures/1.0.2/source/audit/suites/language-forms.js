// External product observations. No parser or runtime replacement is implemented here.
function languageExecution09(api, source) {
  const p = api.makeDefaultProject();
  const actorId = p.components.find(c => c.type === 'sprite').id;
  p.projectData.variables[0].initialValue = 5;
  p.projectData.lists[0].initialValue = [7, 8];
  p.components.push({...structuredClone(p.components[0]), id:'input-surface', type:'input', name:'入力欄', text:''});
  p.functions=[{id:'surface-calc',name:'計算',args:['値'],source:'値を返す'}];
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

function runLanguageForms09(api, manifest, golden, legacy, schemaIds, inlineCases, inlineNegative) {
  const results=[];
  const eq=(a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('expected '+JSON.stringify(b)+'; got '+JSON.stringify(a));};
  const ok=(v,m='assertion failed')=>{if(!v)throw Error(m);};
  const test=(id,fn)=>{try {fn();results.push({id,status:'PASS'});}catch(e){results.push({id,status:'FAIL',detail:(e.code||e.name)+': '+e.message});}};
  const parsed=s=>{const r=api.parseSyntax(s);ok(r.ast,JSON.stringify(r.syntaxDiagnostics));return r.ast;};
  const exec=s=>languageExecution09(api,s);
  for (const c of manifest.cases) {
    const id='A09-SURFACE-'+c.id+'/'+c.key;
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
  test('A09-ORDER-009',()=>{for(const c of legacy)ok(api.astEquivalent(parsed(c.source),c.ast),c.source);});
  test('A09-ORDER-012',()=>eq(api.BLOCK_SCHEMAS.map(s=>s.id),schemaIds));
  test('A09-ORDER-006',()=>{
    const source='3を未登録に加える', ast=parsed(source);
    for(const initialValue of [0,'文字',false]) {
      const p=api.makeDefaultProject();
      p.projectData.variables.push({id:'surface-name',name:'未登録',initialValue});
      const changed=api.parseSyntax(source,{symbols:api.buildSymbols(p)});
      ok(api.astEquivalent(ast,changed.ast));
    }
    const p=api.makeDefaultProject();
    ok(api.analyzeAst(ast,p,{targetId:'stage'}).some(d=>d.code==='S301'));
    for(const source of ['3を点数に代入する','3を点数に足す','3を名前一覧に追加する','0秒間待つ']) {
      p.functions=[{id:'surface-function',name:'試す',args:[],source:source+'\n0を返す'}];
      ok(api.compileProject(p).errors.some(d=>d.code==='S305'),'purity: '+source);
    }
  });
  test('A09-ORDER-007',()=>{
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
    '横100、横50の位置へ行く','縦50の位置へ行く','100、50の位置へ行く','横100、縦50、横20の位置へ行く',
    '1秒後に横100、縦50の位置へ滑る','横100、1秒で縦50の位置へ滑る','横100、縦50の位置に1秒で滑る',
    '横100、縦50の位置へ、、1秒で滑る','横100、縦50の位置へで滑る','1秒で横100、縦50の位置に滑る',
    '15右に回る','15秒右に回る','15度上に回る','0.2秒440Hzの音を鳴らす','0.2秒、440の音を鳴らす',
    '点数が10未満あいだ、次のことをくり返す\n  何もしない','点数が10と異なるまで待つ',
    '10より点数が小さいあいだ、次のことをくり返す\n  何もしない',
    'もし 真なら','もし 真なら、\n※本文なし','でなければ\n  何もしない',
    'もし 真なら\n  何もしない\n何もしない\nでなければ\n  何もしない',
    'もし 真なら、何もしない','もし 真なら\n  何もしない\nでなければ、何もしない',
    '3回だけ','「名前は？」と聞く','少し右へ','点数に1を3回足す',
  ];
  for(const [i,source] of negative.entries()) {
    const id='A09-SURFACE-NEG-'+String(i+1).padStart(3,'0');
    if ([31,32].includes(i)) test('A10-INLINE-REPLACES-'+id,()=>ok(api.parseSyntax(source).ast,source));
    else test(id,()=>ok(!api.parseSyntax(source).ast,source));
  }
  for (const c of inlineCases) test(c.id,()=>{
    ok(api.astEquivalent(parsed(c.source),parsed(c.canonical)),'inline AST');
    eq(exec(c.source),exec(c.canonical));
    eq(exec(c.source).vars.find(([name])=>name==='点数')[1],c.value);
    eq(api.formatScript(parsed(c.source)),api.formatScript(parsed(c.canonical)));
  });
  for (const [id,source] of inlineNegative) test('A10-INLINE-NEG/'+id,()=>ok(!api.parseSyntax(source).ast,source));
  test('A09-ORDER-003',()=>{
    for(const [source,canonical] of [
      ['縦乱数（1、100）、横乱数（1、100）の位置へ行く','横乱数（1、100）、縦乱数（1、100）の位置へ行く'],
      ['縦乱数（1、100）、横乱数（1、100）の位置へ乱数（0、1）秒で滑る','乱数（0、1）秒で横乱数（1、100）、縦乱数（1、100）の位置へ滑る'],
      ['乱数（1、9）を名前一覧の乱数（1、2）番目に挿入する','名前一覧の乱数（1、2）番目に乱数（1、9）を挿入する'],
      ['乱数（1、100）より乱数（1、100）が小さいと言う','乱数（1、100）が乱数（1、100）より小さいと言う'],
      ['乱数（1、2）秒、乱数（440、880）Hzの音を鳴らす','乱数（440、880）Hzの音を乱数（1、2）秒鳴らす'],
    ]) eq(exec(source),exec(canonical));
    const state=exec('縦乱数（1、100）、横乱数（1、100）の位置へ行く');
    eq(state.random.length,2);ok(state.actor.x!==state.actor.y,'seed distinguishes coordinates');
  });
  test('A09-ORDER-004',()=>{
    const r=exec('乱数（2、3）回だけくり返す\n  1を点数に足す');
    eq(r.random.length,1);eq(r.vars,[['点数',8]]);
    const each=exec('名前一覧の各要素を項目としてくり返す\n  名前一覧のすべてを削除する\n  項目という');
    eq(each.out,[['7',0],['8',0]]);
    const p=api.makeDefaultProject();p.scripts=[{targetId:'stage',event:'start',source:'名前一覧の各要素を項目としてくり返す\n  1を項目に代入する'}];
    ok(api.compileProject(p).errors.some(d=>d.code==='S312'));
    eq(exec('「質問」と聞いて待つ\n答えという').calls,[['ask','質問']]);
    eq(exec('「質問」と聞いて待つ\n答えという').out,[['回答',1000]]);
    const functionResult=exec('計算（2）を名前一覧の計算（1）番目に挿入する');
    eq(functionResult,exec('名前一覧の計算（1）番目に計算（2）を挿入する'));
    eq(functionResult.bindings.filter(b=>b[0]==='値').length,2);
    eq(functionResult.lists,[['名前一覧',[2,7,8]]]);
    const sensorResult=exec('縦位置より横位置が大きいという');
    eq(sensorResult,exec('横位置が縦位置より大きいと言う'));eq(sensorResult.out,[['真',0]]);
    for(const sensor of ['「a」キーが押されている','「a」キーが押されていない','マウスが押されている','マウスが押されていない']) {
      for(const source of [`${sensor}が真と等しいという`,`真が${sensor}と等しいという`]) {
        const canonical=source.replace('と等しいという','と同じと言う');
        ok(api.astEquivalent(parsed(source),parsed(canonical)),'sensor compound role boundary');
        eq(exec(source),exec(canonical));
      }
    }
  });
  test('A09-ORDER-005',()=>{
    for(const [source,canonical,code] of [
      ['縦数（「x」）、横1÷0の位置へ行く','横1÷0、縦数（「x」）の位置へ行く','R401'],
      ['1÷0を名前一覧の0番目に挿入する','名前一覧の0番目に1÷0を挿入する','R404'],
      ['数（「x」）より1÷0が大きいと言う','1÷0が数（「x」）より大きいと言う','R401'],
    ]) {
      const result=exec(source);eq(result,exec(canonical));eq(result.errors[0]?.[0],code);
      eq(result.vars,[['点数',5]]);eq(result.lists,[['名前一覧',[7,8]]]);
    }
  });
  test('A09-ORDER-015',()=>{
    eq(exec('偽かつ0より1÷0が大きいという\n真または0より1÷0が小さいという').out,[['偽',0],['真',0]]);
    for(const value of [9,10,11]) {
      eq(exec(`${value}が10未満という`).out,[[value<10?'真':'偽',0]]);
      eq(exec(`${value}が10を超えるという`).out,[[value>10?'真':'偽',0]]);
    }
    eq(exec('条件（10より点数が大きい）が成り立つ間、次のことをくり返す\n  1を点数に加える').vars,[['点数',5]]);
    eq(exec('点数が10未満になるまで、次のことをくり返す\n  1を点数に加える').vars,[['点数',5]]);
  });
  test('A09-SURFACE-INDEPENDENT-VALUES',()=>{
    for(const [source,value] of [['3を点数に代入する',3],['点数を3増やす',8],['点数を3だけ減らす',2],['3を点数から引く',2]]) eq(exec(source).vars,[['点数',value]]);
    eq(exec('3を名前一覧の1番目に挿入する').lists,[['名前一覧',[3,7,8]]]);
    eq(exec('3を名前一覧の3番目に挿入する').lists,[['名前一覧',[7,8,3]]]);
    eq(exec('名前一覧から1番目を削除する').lists,[['名前一覧',[8]]]);
    eq(exec('名前一覧のすべての要素を削除する').lists,[['名前一覧',[]]]);
    eq(exec('縦50、横100の位置に行く').actor,{x:100,y:50,direction:0});
    eq(exec('15度左に回る').actor.direction,-15);
    eq(exec('「値」を「入力欄」に入れる').input,'値');
    eq(exec('0.2秒、440Hzの音を鳴らす').calls,[['tone',440,0.2,false]]);
    eq(exec('0.2秒、440Hzの音を鳴らし、終わるまで待つ').blocked.kind,'audio');
    eq(exec('1秒間待つ\n「後」という').out,[['後',1000]]);
  });
  return {results,total:results.length,failed:results.filter(r=>r.status==='FAIL').length,
    blocked:results.filter(r=>r.status==='BLOCKED_TRANSITION').length,
    deferred:results.filter(r=>r.status==='DEFERRED_PHASE_3').length};
}
