function runSemanticContractTests2() {
    const results = [],
      test = (name, fn) => {
        try {
          fn();
          results.push({ id: 'TEST-CONTRACT ' + name, pass: true, detail: 'PASS' });
        } catch (e) {
          results.push({
            id: 'TEST-CONTRACT ' + name,
            pass: false,
            detail: (e.code || e.name) + ': ' + e.message,
          });
        }
      },
      ok = (v, m = 'contract mismatch') => {
        if (!v) throw Error(m);
      },
      eq = (a, b) =>
        ok(
          JSON.stringify(a) === JSON.stringify(b),
          'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a),
        );
    const parts=(prefix,names)=>{const p=makeDefaultProject(),base=p.components.find(c=>c.type==='sprite');
      p.components=names.map((name,i)=>({...structuredClone(base),id:prefix+i,name,x:100+i*5,y:100,costumes:[{id:prefix+'face-'+i,name:'丸',kind:'text',value:'●'}],costumeId:prefix+'face-'+i}));return p;};
    // LANGUAGE.md 読めない文の近い書き方: a near sentence does not change the other sentences. One that names another subject
    // (ねこは…) would carry it on to the next sentence without one, so that sentence is given the subject it had (自分は, or
    // the one carried on to the place of the near sentence). Each row: the body, its owner, and the body after the first
    // near sentence is chosen.
    test('near sentences keep who does the next sentence',()=>{
      const p=parts('next-',['ねこ','犬','鳥']),applied=(body,targetId)=>{const ctx={symbols:buildSymbols(p),targetId,targetType:'sprite',event:'start',args:[],level:'advanced'};
        const [c]=Akari.assistCandidates(p,body,ctx,parseSyntax(body,ctx).syntaxDiagnostics[0]);return c&&body.slice(0,c.start)+c.source+body.slice(c.end);};
      const glide='ねこは2秒かけて、いまのばしょから、右へ40歩動く。',written='ねこを2秒で右へ40歩移動させる。';
      for(const [body,owner,after]of [
        // The next sentence is written as the button shows it: on a line of its own, with 。 (LANGUAGE.md 読めない文の
        // 近い書き方).
        [written+'「やあ」と言う。','next-1',glide+'\n自分は「やあ」と言う。'],
        [written+'\n「やあ」と言う。','next-1',glide+'\n自分は「やあ」と言う。'],
        ['2回くり返す。\n  '+written+'\n  前へ10歩進む。','next-1','2回くり返す。\n  '+glide+'\n  自分は前へ10歩進む。'],
        ['鳥は前へ10歩進む。'+written+'「やあ」と言う。','next-1','鳥は前へ10歩進む。'+glide+'\n鳥は「やあ」と言う。'],
        [written+'\n犬は「やあ」と言う。','next-1',glide+'\n犬は「やあ」と言う。'],
        [written+'「やあ」と言う。','next-0',glide+'「やあ」と言う。'],
        [written,'next-1',glide],
        // Before a heading the subject is written with 、, as the code writes it.
        [written+'\n3回くり返す。\n  「やあ」と言う。','next-1',glide+'\n自分は、3回くり返す。\n  「やあ」と言う。'],
        [written+'\n3回くり返す。\n  「やあ」と言う。\n前へ10歩進む。','next-1',glide+'\n自分は、3回くり返す。\n  「やあ」と言う。\n前へ10歩進む。'],
        // Empty lines are left out and lines of notes (※) kept, as the code writes them; a sentence at another depth, or lines
        // after it, are as written.
        [written+'\n\n「やあ」と言う。','next-1',glide+'\n自分は「やあ」と言う。'],
        [written+'\n※メモ\n「やあ」と言う。','next-1',glide+'\n※メモ\n自分は「やあ」と言う。'],
        [written+'\n「やあ」と言う。\n前へ10歩進む。','next-1',glide+'\n自分は「やあ」と言う。\n前へ10歩進む。'],
        [written+'\n「やあ」と言う','next-1',glide+'\n自分は「やあ」と言う。'],
        [written+'\n「やあ」と言う。前へ10歩進む。','next-1',glide+'\n自分は「やあ」と言う。\n前へ10歩進む。'],
        // A next sentence that cannot be read cannot be written so: no near sentence is shown.
        [written+'\nほげほげする。','next-1',undefined],
        ['2回くり返す。\n  '+written+'\n「やあ」と言う。','next-1','2回くり返す。\n  '+glide+'\n「やあ」と言う。'],
        // A heading begins a body of its own, which carries on no subject.
        [written+'\n「スペース」キーがおされたとき、\n  「やあ」と言う。','next-1',glide+'\n「スペース」キーがおされたとき、\n  「やあ」と言う。'],
      ])eq(applied(body,owner),after);
      // The button shows the next sentence too, as it is written.
      {const ctx={symbols:buildSymbols(p),targetId:'next-1',targetType:'sprite',event:'start',args:[],level:'advanced'},shown=body=>Akari.assistCandidates(p,body,ctx,parseSyntax(body,ctx).syntaxDiagnostics[0]).map(c=>c.text);
        eq(shown('// メモ\n「やあ」と言う。'),['※ メモ']);
        eq(shown(written+'\n「やあ」と言う。\n前へ10歩進む。'),[glide+'\n自分は「やあ」と言う。']);
        eq(shown('2回くり返す。\n  '+written+'\n  前へ10歩進む。'),[glide+'\n自分は前へ10歩進む。']);}
      // The button of the near sentence says so under it (its description).
      {const ctx={symbols:buildSymbols(p),targetId:'next-1',targetType:'sprite',event:'start',args:[],level:'advanced'},body=written+'「やあ」と言う。';
        eq(Akari.assistCandidates(p,body,ctx,parseSyntax(body,ctx).syntaxDiagnostics[0]).map(c=>c.description),['つぎの 文の はじめに「自分は」を 書きます（つぎの 文は、これまでどおり 犬が します）']);}
      // The rewrite of a check keeps it too (assistProposalKeepsSubject).
      const ctx={symbols:buildSymbols(p),targetId:'next-1',targetType:'sprite',event:'start'},body='ねこを2秒かけて右へ40歩うごかす。「やあ」と言う。',[fix]=parseSyntax(body,ctx).syntaxDiagnostics[0].proposals,kept=Akari.assistProposalKeepsSubject(fix,body,ctx,p);
      eq(body.slice(0,kept.start)+kept.source+body.slice(kept.end),glide+'自分は「やあ」と言う。');
      eq(kept.note,'つぎの 文の はじめに「自分は」を 書きます（つぎの 文は、これまでどおり 犬が します）');
      // In a loop too; a proposal that asks for a number, or whose place or text is not given, is as it is.
      const looped='2回くり返す。\n  ねこを2秒かけて右へ40歩うごかす。\n  「やあ」と言う。',[loopFix]=parseSyntax(looped,ctx).syntaxDiagnostics[0].proposals,loopKept=Akari.assistProposalKeepsSubject(loopFix,looped,ctx,p);
      eq(looped.slice(0,loopKept.start)+loopKept.source+looped.slice(loopKept.end),'2回くり返す。\n  '+glide+'\n  自分は「やあ」と言う。');
      // Before a heading nothing is written: the rewrite is as it is, and still reads.
      const headed='ねこを2秒かけて右へ40歩うごかす。\n「スペース」キーがおされたとき、\n  「やあ」と言う。',[headFix]=parseSyntax(headed,ctx).syntaxDiagnostics[0].proposals,headKept=Akari.assistProposalKeepsSubject(headFix,headed,ctx,p);
      ok(headKept===headFix);ok(!!parseSyntax(headed.slice(0,headKept.start)+headKept.source+headed.slice(headKept.end),ctx).ast);
      for(const asIs of [{...fix,input:{kind:'angle'}},{...fix,start:undefined},{...fix,end:1.5},{...fix,start:fix.start+0.5},{...fix,end:fix.end+0.5},{...fix,source:null}])ok(Akari.assistProposalKeepsSubject(asIs,body,ctx,p)===asIs);
      ok(Akari.assistProposalKeepsSubject(fix,null,ctx,p)===fix);
      // The stage's body: the part named moves (the stage does not); a sentence of the part's body gets the part's name
      // (ねこのすがたを見せる → ねこはすがたを見せる), the number written is kept, and no sentence is shown twice.
      const stage={symbols:buildSymbols(p),targetId:'stage',targetType:'stage',event:'start',args:[],level:'advanced'},onStage=text=>Akari.assistCandidates(p,text,stage,parseSyntax(text,stage).syntaxDiagnostics[0]).map(c=>c.text);
      eq(onStage(written),[glide]);
      eq(onStage('犬は右に行く。'),['犬は、いまのばしょから、右へ10歩動く。','犬はいまのばしょから、右へ10歩動く。']);
      eq(onStage('ねこのすがたを見せる。'),['ねこはすがたを見せる。']);
      eq(onStage('ねこの向きを90度にする。'),['ねこは画面の上を向く。']);
      eq(onStage('ねこの向きを45度にする。'),['ねこは向きを45度にする。']);
      // Its button keeps the name of what it does, or names the part when the button showed the sentence.
      const buttons=text=>Akari.assistCandidates(p,text,stage,parseSyntax(text,stage).syntaxDiagnostics[0]).map(c=>[c.label,c.source]);
      eq(buttons('ねこのすがたを見せる。'),[['すがたを見せる','ねこはすがたを見せる']]);
      eq(buttons(written),[['いまの ばしょから動く','ねこは2秒かけて、いまのばしょから、右へ40歩動く']]);
      // Every near sentence of a body, applied, and every rewrite of its check as kept: a note written after # , a heading
      // after the sentence, the stage's body.
      const all=(body,targetId)=>{const c={symbols:buildSymbols(p),targetId,targetType:targetId==='stage'?'stage':'sprite',event:'start',args:[],level:'advanced'},d=parseSyntax(body,c).syntaxDiagnostics[0];
        return [Akari.assistCandidates(p,body,c,d).map(k=>[k.label,body.slice(0,k.start)+k.source+body.slice(k.end)]),
          (d?.proposals||d?.choices||[]).map(x=>{const k=Akari.assistProposalKeepsSubject(x,body,c,p);return [body.slice(0,k.start)+k.source+body.slice(k.end),k.note??null];})];};
      for(const [body,owner,expected]of [
        ["ねこのすがたを見せる。 # メモ\n「やあ」と言う。","next-0",[[["メモ","すがたを見せる。  ※ メモ\n「やあ」と言う。"],["すがたを かくす","すがたをかくす。\n「やあ」と言う。"],["すがたを見せる","すがたを見せる。\n「やあ」と言う。"],["今の すがたの スタンプを おす","今のすがたのスタンプをおす。\n「やあ」と言う。"]],[]]],
        ["ねこを2秒で右へ40歩移動させる。 # メモ\n「やあ」と言う。","next-0",[[["いまの ばしょから動く","ねこは2秒かけて、いまのばしょから、右へ40歩動く。\n「やあ」と言う。"],["いまの ばしょから動く","2秒かけて、いまのばしょから、右へ40歩動く。\n「やあ」と言う。"]],[]]],
        ["ねこを2秒かけて右へ40歩うごかす。\n「スペース」キーがおされたとき、\n「やあ」と言う。","next-1",[[],[["ねこは2秒かけて、いまのばしょから、右へ40歩動く。\n「スペース」キーがおされたとき、\n「やあ」と言う。",null]]]],
        ["鳥は前へ10歩進む。ねこを2秒で右へ40歩移動させる。\n「やあ」と言う。","stage",[[["いまの ばしょから動く","鳥は前へ10歩進む。ねこは2秒かけて、いまのばしょから、右へ40歩動く。\n鳥は「やあ」と言う。"]],[]]],
        ["ねこを2秒で右へ40歩移動させる。\n  「やあ」と言う。","stage",[[],[]]],
        ["鳥は前へ10歩進む。ねこを2秒で右へ40歩移動させる。","stage",[[["いまの ばしょから動く","鳥は前へ10歩進む。ねこは2秒かけて、いまのばしょから、右へ40歩動く。"]],[]]],
        // Parts written together (LANGUAGE.md 読めない文の近い書き方): a sentence for each, in the order written, kept whole;
        // a time that may be either gives each meaning, and a wait before it is the body's, once. Nothing is shown when the
        // sentence of a part cannot be made, and never the sentence of one of them.
        ...[['ねこと犬は','next-0',['ねこ','犬']],['犬とねこは','next-0',['犬','ねこ']],['ねこも犬も','next-0',['ねこ','犬']],['ねこと犬が','next-0',['ねこ','犬']],['「ねこ」と「犬」は','next-0',['ねこ','犬']],
          ['ねこと犬と鳥は','next-0',['ねこ','犬','鳥']],['ねこと犬を','next-1',['ねこ','犬']],['ねこと鳥を','next-1',['ねこ','鳥']],['ねこと犬は','stage',['ねこ','犬']],['ねこと自分は','next-0',['ねこ','自分']]]
          .map(([who,owner,names])=>[who+'2秒で右へ40歩'+(who.endsWith('を')?'移動させる。':'移動する。'),owner,[[['文を 分ける（じゅんに 動く）',names.map(n=>n+'は2秒かけて、いまのばしょから、右へ40歩動く。').join('\n')]],[]]]),
        ["犬と鳥は2秒で右へ40歩移動する。\n「やあ」と言う。","next-0",[[["文を 分ける（じゅんに 動く）","犬は2秒かけて、いまのばしょから、右へ40歩動く。\n鳥は2秒かけて、いまのばしょから、右へ40歩動く。\n自分は「やあ」と言う。"]],[]]],
        ["2回くり返す。\n  ねこと犬は2秒で右へ40歩移動する。\n  「やあ」と言う。","next-0",[[["文を 分ける（じゅんに 動く）","2回くり返す。\n  ねこは2秒かけて、いまのばしょから、右へ40歩動く。\n  犬は2秒かけて、いまのばしょから、右へ40歩動く。\n  自分は「やあ」と言う。"]],[]]],
        ["鳥は前へ10歩進む。\nねこと犬は2秒で右へ40歩移動する。","stage",[[["文を 分ける（じゅんに 動く）","鳥は前へ10歩進む。\nねこは2秒かけて、いまのばしょから、右へ40歩動く。\n犬は2秒かけて、いまのばしょから、右へ40歩動く。"]],[]]],
        ["鳥は前へ10歩進む。ねこと犬は2秒で右へ40歩移動する。\n「やあ」と言う。","stage",[[["文を 分ける（じゅんに 動く）","鳥は前へ10歩進む。ねこは2秒かけて、いまのばしょから、右へ40歩動く。\n犬は2秒かけて、いまのばしょから、右へ40歩動く。\n鳥は「やあ」と言う。"]],[]]],
        ["ねこと犬は右へ40歩移動する。","next-0",[[["文を 分ける","ねこは、いまのばしょから、右へ40歩動く。\n犬は、いまのばしょから、右へ40歩動く。"]],[]]],
        ["ねこと犬は2秒右へ40歩移動する。","next-0",[[["文を 分ける（じゅんに 動く）","ねこは2秒かけて、いまのばしょから、右へ40歩動く。\n犬は2秒かけて、いまのばしょから、右へ40歩動く。"],["この 本文で 待つ","2秒待つ。\nねこは、いまのばしょから、右へ40歩動く。\n犬は、いまのばしょから、右へ40歩動く。"]],[]]],
        ["ねこと犬は1秒待ってから、2秒で右へ40歩移動する。","next-0",[[["この 本文で 待つ（じゅんに 動く）","1秒待つ。\nねこは2秒かけて、いまのばしょから、右へ40歩動く。\n犬は2秒かけて、いまのばしょから、右へ40歩動く。"]],[]]],
        ["ねこと犬は「やあ」と2秒しゃべる。","next-0",[[["文を 分ける（じゅんに 話す）","ねこは「やあ」と2秒話す。\n犬は「やあ」と2秒話す。"]],[]]],
        ["ねこと犬と鳥は前へ10歩進む。","next-0",[[["文を 分ける","ねこは前へ10歩進む。\n犬は前へ10歩進む。\n鳥は前へ10歩進む。"]],[]]],
        ["自分と犬は2秒で右へ40歩移動する。","next-0",[[["文を 分ける（じゅんに 動く）","2秒かけて、いまのばしょから、右へ40歩動く。\n犬は2秒かけて、いまのばしょから、右へ40歩動く。"]],[]]],
        ["ねこと犬に「やあ」と言わせる。","next-0",[[["文を 分ける","ねこは「やあ」と言う。\n犬は「やあ」と言う。"]],[]]],
        ["ねこと犬を右へ90度回す。","next-0",[[["文を 分ける","ねこは右に90度回る。\n犬は右に90度回る。"]],[]]],
        ["ねこと犬を見せる。","next-0",[[["文を 分ける","ねこはすがたを見せる。\n犬はすがたを見せる。"]],[]]],
        ["ねこと犬はすがたを見せてね。","next-0",[[["文を 分ける","ねこはすがたを見せる。\n犬はすがたを見せる。"]],[]]],
        ["ねこと犬は2秒まつね。","next-0",[[["この 本文で 待つ","2秒待つ。"]],[]]],
        // A part written twice is that part; parts written together after a clause do only that clause.
        ["ねことねこは2秒で右へ40歩移動する。","next-1",[[["いまの ばしょから動く","ねこは2秒かけて、いまのばしょから、右へ40歩動く。"]],[]]],
        ["前へ10歩進んで、犬と鳥は2秒で右へ40歩移動する。","next-0",[[],[]]],
        ["前へ10歩進んで、犬と鳥が2秒で右へ40歩移動する。","next-0",[[],[]]],
        ["前へ10歩進んでから犬と鳥は2秒で右へ40歩移動する。","next-0",[[],[]]],
        ["ねこは前へ10歩進んで犬と鳥は右へ40歩移動する。","next-0",[[],[]]],
        ["ねこと犬が点数が10になるまで右へ40歩移動する。","next-0",[[],[]]],
        ["もし、ねこと犬がふれていれば、","next-0",[[],[]]],
        ["ねこと犬は2秒で右へ40歩移動して、「やあ」と言う。","next-0",[[],[]]],
        ["ねこと犬は点数が10になるまで右へ40歩移動する。","next-0",[[],[]]],
        ["ねこと犬にすがたを見せる。","next-0",[[],[]]],
        ["ねこは「やあ」と言う。犬を2秒で右へ40歩移動させる。「やあ」と言う。","next-0",[[["いまの ばしょから動く","ねこは「やあ」と言う。犬は2秒かけて、いまのばしょから、右へ40歩動く。\n自分は「やあ」と言う。"]],[]]],
        ["2回くり返す。\n  前へ10歩進む。\nねこを2秒かけて右へ40歩うごかす。\n「やあ」と言う。","next-1",[[],[["2回くり返す。\n  前へ10歩進む。\nねこは2秒かけて、いまのばしょから、右へ40歩動く。\n自分は「やあ」と言う。","つぎの 文の はじめに「自分は」を 書きます（つぎの 文は、これまでどおり 犬が します）"]]]],
      ])eq(all(body,owner),expected);
      // The sentence after them keeps who does it, and the button says by name who does it; parts named in a heading, a
      // part written twice, parts looked at or told something are not parts written together.
      const described=(body,targetId)=>{const c={symbols:buildSymbols(p),targetId,targetType:targetId==='stage'?'stage':'sprite',event:'start',args:[],level:'advanced'};
        return Akari.assistCandidates(p,body,c,parseSyntax(body,c).syntaxDiagnostics[0]).map(k=>k.description??null);};
      eq(described('犬と鳥は2秒で右へ40歩移動する。\n「やあ」と言う。','next-0'),['つぎの 文の はじめに「自分は」を 書きます（つぎの 文は、これまでどおり ねこが します）']);
      eq(described('鳥は前へ10歩進む。ねこと犬は2秒で右へ40歩移動する。\n「やあ」と言う。','stage'),['つぎの 文の はじめに「鳥は」を 書きます（つぎの 文は、これまでどおり 鳥が します）']);
      eq(described('ねこと犬は2秒で右へ40歩移動する。','next-0'),[null]);
      for(const body of ['ねこもねこも前へ10歩すすんだ。','ねこと犬を見る。','ねこと犬に「やあ」と言う。','ねこと犬がふれたとき、','犬と鳥に「出発」と知らせる。'])
        ok(all(body,'next-0')[0].length&&all(body,'next-0')[0].every(([label])=>!label.startsWith('文を 分ける')),body);
    });
    // The same in the work of the assist examples (audit/fixtures/assist): ねこ (whose body it is), 犬 and 星, the
    // variable 点数, the list 持ち物, the sound ベル, the procedure ジャンプ, and with ui the parts 文字1, ボタン1 and
    // 入力らん1. Each row: input, whether the work has the ui parts, and either every near sentence in order or the first
    // and the sentences that must not come; a sentence is its text, or [its button's name, its text] when they differ.
    test('near sentences in the work of the assist examples',()=>{
      const example=(ui,plain=false)=>{const p=makeDefaultProject(),base=p.components.find(c=>c.type==='sprite');
        p.components=[...['ねこ','犬','星'].map((name,i)=>({...structuredClone(base),id:'sprite-'+(i+1),name,costumes:base.costumes.map((c,j)=>({...c,id:'sprite-'+(i+1)+'-costume-'+j})),costumeId:'sprite-'+(i+1)+'-costume-0',localData:{variables:[],lists:[]}})),
          ...(ui?[['文字1','label'],['ボタン1','button'],['入力らん1','input']].map(([name,type])=>{const c={...structuredClone(base),id:type+'-1',type,name,localData:{variables:[],lists:[]}};delete c.costumes;delete c.costumeId;return c;}):[])];
        p.projectData={variables:[{id:'variable-0',name:'点数',initialValue:0}],lists:[{id:'list-0',name:'持ち物',initialValue:[]}]};
        p.sounds=[{id:'sound-0',name:'ベル',assetId:'sound-asset-0'}];p.actions=plain?[]:[{id:'action-0',ownerId:'stage',name:'ジャンプ',args:[],source:'何もしない。'}];
        p.scripts=[{id:'s1',targetId:'sprite-1',event:'start',source:'何もしない。'}];return p;};
      // The third work is the first without the procedure ジャンプ, as some assist examples are ({plain:true}).
      const works=[example(false),example(true),example(false,true)];
      const near=(source,ui,{plain,...extra}={})=>{const p=works[plain?2:Number(!!ui)],ctx={symbols:buildSymbols(p),targetId:'sprite-1',targetType:'sprite',event:'start',args:[],level:'advanced',...extra};
        const got=Akari.assistCandidates(p,source,ctx,parseSyntax(source,ctx).syntaxDiagnostics[0]);ok(got.every(c=>c.assist===true),source+': every near sentence is marked as one');
        return got.map(c=>c.label===c.text?c.text:[c.label,c.text]);};
      const step='前へ10歩進む。',stop='この動きを止める。\n1秒待つ。';
      const rows=[
        // The near sentences these rules shape: what is said, played, drawn or changed only when it is written, a
        // part written with を, and a wait written in kana.
        ['「ベル」をかける。',false,[['えらんだ音を鳴らして待つ','「ベル」を鳴らす。']]],
        ['330Hzの音を0.5秒出す。',false,[['音を鳴らして待つ','330Hzの音を0.5秒鳴らす。']]],
        ['音をけす。',false,{first:['すべての音を止める','すべての音を止める。'],not:['持ち物の1番目を消す。']}],
        ['ペンを下げる。',false,[['ペンを下ろす','ペンを下ろす。']]],
        ['線を引く。',false,[['ペンを下ろす','ペンを下ろす。']]],
        ['ペンを上げた。',false,[['ペンを上げる','ペンを上げる。']]],
        ['ペンを上にあげる。',false,[['ペンを上げる','ペンを上げる。']]],
        ['犬のペンを上げる。',false,[['ペンを上げる','犬はペンを上げる。']]],
        ['ペンを上げておく。',false,[['ペンを上げる','ペンを上げる。']]],
        ['ペンを下におく。',false,{first:['ペンを下ろす','ペンを下ろす。'],not:['点数を1へらす。','音の高さを1段階下げる。']}],
        ['ほかのぜんぶを止める。',false,[['ほかの動きを全部止める','ほかの動きを全部止める。'],['自分のほかの動きを止める','自分のほかの動きを止める。'],['作品を全部止める','作品を全部止める。'],['この動きを止める','この動きを止める。']]],
        ['点数が10になるまで待ちたい。',false,[['きまりに あてはまるまで待つ','点数が10になるまで待つ。']]],
        ['点数が10になるまでまちなさい。',false,[['きまりに あてはまるまで待つ','点数が10になるまで待つ。']]],
        ['点数が10になるまでずっと待つ。',false,[['きまりに あてはまるまで待つ','点数が10になるまで待つ。']]],
        ['点数を1さげる。',false,[['数を へらす','点数を1へらす。']]],
        ['2番目に「かさ」を入れる。',false,[['リストの とちゅうに入れる','持ち物の2番目に「かさ」を入れる。']]],
        ['持ち物の2番目を「かさ」にとりかえる。',false,[['リストの中身を1つ入れかえる','持ち物の2番目を「かさ」にかえる。']]],
        ['ねこのすがたを見せる。',false,[['すがたを見せる','すがたを見せる。']]],
        ['持ち物がからっぽになるまで待つ。',false,{first:['きまりに あてはまるまで待つ','持ち物の数が0になるまで待つ。'],not:['「開始」の合図を送って、その合図で始まったことが全部終わるまで待つ。','「名前は？」とたずねて、答えを待つ。']}],
        ['「ベル」を聞かせる。',false,[['えらんだ音を鳴らして待つ','「ベル」を鳴らす。']]],
        ['3回くり返す。\n  おわる。',false,[['このくり返しを終える','このくり返しを終える。'],['作品を全部止める','作品を全部止める。']]],
        ['おわり。',false,[['作品を全部止める','作品を全部止める。']]],
        ['3番目に「ボール」を入れる。',false,[['リストの とちゅうに入れる','持ち物の3番目に「ボール」を入れる。']]],
        ['持ち物の3番目を「ボール」にとりかえる。',false,[['リストの中身を1つ入れかえる','持ち物の3番目を「ボール」にかえる。']]],
        ['点数が12の約数になるまで待つ。',false,{first:['きまりに あてはまるまで待つ','条件（点数が0より大きいかつ切り捨て（点数）が点数と同じかつ12÷点数のあまりが0と同じ）が成り立つまで待つ。'],not:['「開始」の合図を送って、その合図で始まったことが全部終わるまで待つ。']}],
        ['すがたを「丸」にかえた。',false,{first:['すがたを かえる','すがたを「丸」にかえる。'],not:['次のすがたにかえる。','前のすがたにかえる。','点数を「丸」にする。','色を「丸」にする。']}],
        ['もし点数が10以上なら、もし点数が20以下なら、\n    何もしない。',false,{first:['もし','もし点数が10以上なら、\n  もし点数が20以下なら、\n    何もしない。'],not:['もし点数が10以上なら、\n  点数を0にする。']}],
        ['ずっとくり返す。\n  とばして次へ。',false,[['この回の のこりを とばして 次の回へ','この回の残りをとばして、次の回へ進む。']]],
        ['すがたを切りかえる。',false,[['次のすがた','次のすがたにかえる。'],['すがたを かえる','すがたを「たくどん」にかえる。']]],
        ['前へ10歩。',false,[['前へ進む',step]]],
        ['前へ、10歩進む',false,[['前へ進む',step]]],
        ['10歩前にいって。',false,[['前へ進む',step]]],
        ['1秒、待つ。',false,[['秒待つ','1秒待つ。']]],
        ['左に90度曲がる。',false,[['左に回る','左に90度回る。']]],
        ['ペンを紙からはなす。',false,[['ペンを上げる','ペンを上げる。']]],
        ['とまって、1秒待つ',false,{first:['この動きを止める',stop],not:[]}],
        ['ぶつかったら、はねる。',false,[['はしで はね返る','画面のはしにふれていれば、はね返る。']]],
        ['「星」にふれたら、止まる。',false,{first:['ふれる たびに する','「星」にふれたとき、\n  この動きを止める。'],not:[]}],
        ['2秒待ってから、右へ10歩動かす。',false,[['いまの ばしょから動く','2秒待つ。\nいまのばしょから、右へ10歩動く。']]],
        ['ねこは10歩動いて止まる。',false,{first:['前へ進む','ねこは前へ10歩進む。\nねこはこの動きを止める。'],not:[]}],
        ['ねこを2びょうで右へ40ほ移動させる。',false,[['いまの ばしょから動く','ねこは2秒かけて、いまのばしょから、右へ40歩動く。'],['いまの ばしょから動く','2秒かけて、いまのばしょから、右へ40歩動く。']]],
        ['「スペース」キーが押されるのを待ちます。',true,{first:['きまりに あてはまるまで待つ','「スペース」キーがおされるまで待つ。'],not:['「スペース」キーがおされるまで、くり返す。\n  前へ10歩進む。','「スペース」とたずねて、答えを待つ。','「スペース」の合図を送って、その合図で始まったことが全部終わるまで待つ。']}],
        ['「入力らん1」を空にする。',true,[['入力らんに入れる','「入力らん1」に「」を入れる。']]],
        ['「入力らん1」に「こんにちは」をいれる。',true,[['入力らんに入れる','「入力らん1」に「こんにちは」を入れる。']]],
        // The near sentences of the assist examples whose answers these rules decide (the example named in
        // audit/fixtures/assist/code-assist-cases.json): every sentence shown, in its order. A fourth entry is the body: the
        // stage, or a copy as it starts.
        // ASSIST-101
        ["前に10歩いく。",false,[["前へ進む","前へ10歩進む。"]]],
        // ASSIST-102
        ["10歩前にいって。",false,[["前へ進む","前へ10歩進む。"]]],
        // ASSIST-103
        ["10歩移動する。",false,[["前へ進む","前へ10歩進む。"],["いまの ばしょから動く","いまのばしょから、右へ10歩動く。"]]],
        // ASSIST-137
        ["座標（100、50）へ行く。",false,[["決めた ばしょへ行く","画面の左下のはしから、右へ100歩、上へ50歩のばしょへ行く。"],["〜のところへ行く","「犬」のところへ行く。"]]],
        // ASSIST-139
        ["画面の左下のはしから、右へ100歩、上へ50歩のばしょまで行く。",false,[["決めた ばしょへ行く","画面の左下のはしから、右へ100歩、上へ50歩のばしょへ行く。"],["〜のところへ行く","「犬」のところへ行く。"]]],
        // ASSIST-144
        ["「犬」のところへ走る。",false,[["〜のところへ行く","「犬」のところへ行く。"]]],
        // ASSIST-147
        ["犬を追いかける。",false,[["〜のところへ行く","「犬」のところへ行く。"]]],
        // ASSIST-149
        ["「犬」のところへ行った。",false,[["〜のところへ行く","「犬」のところへ行く。"]]],
        // ASSIST-156
        ["右へ曲がる。",false,[["右に回る","右に15度回る。"],["いちばん おくへ下がる","いちばんおくへ下がる。"]]],
        // ASSIST-170
        ["向きを点数にする。",false,[["向きを決める","向きを【点数】度にする。"],["向きを決める","向きを45度にする。"],["数を ふやす","点数を1ふやす。"],["数を へらす","点数を1へらす。"]]],
        // ASSIST-212
        ["2倍にする。",false,[["大きさを決める","大きさを200％にする。"]]],
        // ASSIST-221
        ["すがたを「丸」にかえた。",false,[["すがたを かえる","すがたを「丸」にかえる。"]]],
        // ASSIST-250
        ["最前面へ移動する。",false,[["いちばん手前へ出る","いちばん手前へ出る。"]]],
        // ASSIST-336
        ["犬に「やあ」と言う。",false,[["合図を送る","「やあ」の合図を送る。"],["言う・話す","「やあ」と言う。"]]],
        // ASSIST-362
        ["440Hzの音を0.2秒なる。",false,[["音を鳴らして待つ","440Hzの音を0.2秒鳴らす。"],["音を鳴らして、すぐ次へ","440Hzの音を0.2秒鳴らし始める。"]]],
        // ASSIST-389
        ["「ベル」を止める。",false,[["すべての音を止める","すべての音を止める。"],["この動きを止める","この動きを止める。"],["自分のほかの動きを止める","自分のほかの動きを止める。"],["ほかの動きを全部止める","ほかの動きを全部止める。"]]],
        // ASSIST-509
        ["3回くり返すよ。\n  何もしない。",false,[["回数を決めてくり返す","3回くり返す。"]]],
        // ASSIST-591
        ["前へ10歩進む。 # メモ",false,[["メモ","前へ10歩進む。  ※ メモ"],["前へ進む","前へ10歩進む。"]]],
        // ASSIST-745
        ["もし点数が0になったら、\n  「やった」と言う。",true,[["いま そう なって いたら する","もし点数が0なら、"],["そう なるのを 待ってから する","点数が0になるまで待つ。\n「やった」と言う。"]]],
        // ASSIST-916
        ["自分を消す。",false,[["このコピーだけを消す","このコピーだけを消す。"],["すがたを かくす","すがたをかくす。"]],{"event":"cloneStart"}],
        // ASSIST-1055
        ["ねこの向きを90度にする。",false,[["向きを決める","ねこは画面の上を向く。"]],{"targetId":"stage","targetType":"stage"}],
        // ASSIST-250, ASSIST-221 and ASSIST-212 in their own work, without the procedure ジャンプ.
        ["最前面へ移動する。",false,[["いちばん手前へ出る","いちばん手前へ出る。"]],{"plain":true}],
        ["すがたを「丸」にかえた。",false,[["すがたを かえる","すがたを「丸」にかえる。"]],{"plain":true}],
        ["2倍にする。",false,[["大きさを決める","大きさを200％にする。"]],{"plain":true}],
        // A sentence ending in た or て read as its plain form, a question of a sentence made with て, and a sound named
        // with no word of sound.
        ["ピッチを上げた。",false,[["音の高さを上げる","音の高さを1段階上げる。"]]],
        ["ねこに「名前は？」とたずねて。",false,[["たずねる","「名前は？」とたずねて、答えを待つ。"],["合図を送って待つ","「名前は？」の合図を送って、その合図で始まったことが全部終わるまで待つ。"],["秒待つ","0.1秒待つ。"]]],
        ["ベルを上げる。",false,[["音の高さを上げる","音の高さを1段階上げる。"]]],
        ["ベルを下げる。",false,[["音の高さを下げる","音の高さを1段階下げる。"]]],
      ];
      for(const [source,ui,expected,extra]of rows){const got=near(source,ui,extra);
        if(Array.isArray(expected))eq(got,expected);else{eq(got[0],expected.first);for(const s of expected.not)ok(!got.some(g=>(Array.isArray(g)?g[1]:g)===s),source+' has '+s);}}
    });
    return {
      total: results.length,
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
      results,
    };
  }
