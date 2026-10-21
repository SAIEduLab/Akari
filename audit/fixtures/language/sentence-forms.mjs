// Independent sentence-form cases: every finite sentence form of the product needs one.
// Sources and expected trees are written by hand from LANGUAGE.md (役割と語順、
// いつ始まるか、数・単位・発言、条件述語の有限活用 and the command sections) and the
// block schema fixture, never copied from a product tree. A claim names a form ID and the
// clause of the source that is written in that form (see audit/lib/sentence-form-coverage.mjs).

// The data and actors the cases name. Applied to the product's empty project.
export function sentenceFormProject(project) {
  project.components[0].name='ねこ';
  project.projectData.variables.push({id:'sentence-score',name:'点数',initialValue:0},{id:'sentence-name',name:'名前',initialValue:''});
  project.projectData.lists.push({id:'sentence-names',name:'名前一覧',initialValue:['あかり','ひかり']});
  return project;
}

const self={kind:'self'};
const named=name=>({kind:'named',name});
const num=value=>({kind:'NumberLiteral',value});
const str=value=>({kind:'StringLiteral',value});
// 歩・度・秒・回・番目・％・Hz keep their role as a quantity (LANGUAGE.md 数・単位・発言).
const quantity=(value,unit)=>({kind:'QuantityLiteral',value:typeof value==='number'?num(value):value,unit});
const read=(name,qualifier=null)=>({kind:'VariableRead',name,qualifier});
const target=(name,qualifier=null)=>({name,qualifier});
const sensor=(name,arg)=>arg===undefined?{kind:'SensorRead',sensor:name}:{kind:'SensorRead',sensor:name,arg};
const not=value=>({kind:'UnaryExpression',op:'NOT',value});
const compare=(op,left,right)=>({kind:'CompareExpression',op,left,right});
const logical=(op,left,right)=>({kind:'LogicalExpression',op,left,right});
const builtin=(name,args)=>({kind:'BuiltinCall',name,args});
const contains=(list,value)=>builtin('CONTAINS',[list,value]);
// A wait written without a subject is the whole flow's (みんな); with one, only that part waits (LANGUAGE.md 役割と語順).
const everyone={kind:'all'},waits=['WaitTime','WaitUntil','BroadcastAndWait'];
const statement=(kind,props={},actorRef=waits.includes(kind)?everyone:self)=>({kind,...props,actorRef});
const command=(kind,op,args=[],props={},actorRef=self)=>({kind,args,op,...props,actorRef});
const nothing=(actorRef=self)=>statement('NoOperation',{},actorRef);
const script=(body,extra={})=>({kind:'Script',body,...extra});
const inlineIf=(condition,thenBody=[nothing()])=>statement('IfStatement',{condition,thenBody,elseBody:[],hasElse:false});
const score=read('点数'),names=read('名前一覧'),exactNames=read('名前一覧','exact');
const say=(value,actorRef=self)=>statement('Say',{value},actorRef);
const hide=(actorRef=self)=>command('LooksCommand','HIDE',[],{},actorRef);
const show=(actorRef=self)=>command('LooksCommand','SHOW',[],{},actorRef);
const wait=(seconds,actorRef=everyone)=>statement('WaitTime',{seconds:quantity(seconds,'秒')},actorRef);
const steps=n=>quantity(n,'歩'),degrees=n=>quantity(n,'度'),times=n=>quantity(n,'回');
const update=(op,value,name='点数')=>statement('NumericUpdate',{op,target:target(name),value});

// 条件述語の有限活用: every predicate in every position of a sentence. Each row is
// written from LANGUAGE.md; `yes` is the meaning of the plain (affirmative) predicate.
const sameThree='点数が3と同じなら',sameThreeMeaning=compare('EQ',score,num(3));
const predicateRows=[
  {plain:'以上',operand:'点数が10',yes:compare('GTE',score,num(10)),
    forms:{plain:'以上',ifYes:'以上なら',ifNo:'以上でなければ',whileYes:'以上のあいだ',untilYes:'以上になるまで',andYes:'以上で',andNo:'以上ではなくて',plainNo:'以上ではない'}},
  {plain:'以下',operand:'点数が10',yes:compare('LTE',score,num(10)),
    forms:{plain:'以下',ifYes:'以下なら',ifNo:'以下でなければ',whileYes:'以下のあいだ',untilYes:'以下になるまで',andYes:'以下で',andNo:'以下ではなくて',plainNo:'以下ではない'}},
  {plain:'より小さい',operand:'点数が10',yes:compare('LT',score,num(10)),
    forms:{plain:'より小さい',ifYes:'より小さければ',ifNo:'より小さくなければ',whileYes:'より小さいあいだ',untilYes:'より小さくなるまで',andYes:'より小さくて',andNo:'より小さくなくて',plainNo:'より小さくない'}},
  {plain:'より大きい',operand:'点数が10',yes:compare('GT',score,num(10)),
    forms:{plain:'より大きい',ifYes:'より大きければ',ifNo:'より大きくなければ',whileYes:'より大きいあいだ',untilYes:'より大きくなるまで',andYes:'より大きくて',andNo:'より大きくなくて',plainNo:'より大きくない'}},
  {plain:'と同じ',operand:'点数が1',yes:compare('EQ',score,num(1)),
    forms:{plain:'と同じ',ifYes:'と同じなら',ifNo:'と同じでなければ',whileYes:'と同じであるあいだ',untilYes:'と同じになるまで',andYes:'と同じで',andNo:'と同じではなくて',plainNo:'と同じではない'}},
  {plain:'とちがう',operand:'点数が1',yes:compare('NEQ',score,num(1)),
    forms:{plain:'とちがう',ifYes:'とちがえば',ifNo:'とちがわなければ',whileYes:'とちがうあいだ',untilYes:'と同じでなくなるまで',andYes:'とちがっていて',andNo:'とちがわなくて',plainNo:'とちがわない'}},
  {plain:'と違う',operand:'点数が1',yes:compare('NEQ',score,num(1)),
    forms:{plain:'と違う',ifYes:'と違えば',ifNo:'と違わなければ',whileYes:'と違うあいだ',untilYes:'と違う状態になるまで',andYes:'と違っていて',andNo:'と違わなくて',plainNo:'と違わない'}},
  {plain:'押されている',operand:'「空白」キーが',yes:sensor('KEY_DOWN',str('空白')),
    forms:{plain:'押されている',ifYes:'押されていれば',ifNo:'押されていなければ',whileYes:'押されているあいだ',untilYes:'押されるまで',andYes:'押されていて',andNo:'押されていなくて',plainNo:'押されていない'}},
  {plain:'おされている',operand:'「空白」キーが',yes:sensor('KEY_DOWN',str('空白')),
    forms:{plain:'おされている',ifYes:'おされていれば',ifNo:'おされていなければ',whileYes:'おされているあいだ',untilYes:'おされるまで',andYes:'おされていて',andNo:'おされていなくて',plainNo:'おされていない'}},
  {plain:'ふれている',operand:'端に',yes:sensor('TOUCHING',str('端')),
    forms:{plain:'ふれている',ifYes:'ふれていれば',ifNo:'ふれていなければ',whileYes:'ふれているあいだ',untilYes:'ふれるまで',andYes:'ふれていて',andNo:'ふれていなくて',plainNo:'ふれていない'}},
  {plain:'触れている',operand:'端に',yes:sensor('TOUCHING',str('端')),
    forms:{plain:'触れている',ifYes:'触れていれば',ifNo:'触れていなければ',whileYes:'触れているあいだ',untilYes:'触れるまで',andYes:'触れていて',andNo:'触れていなくて',plainNo:'触れていない'}},
  {plain:'入っている',operand:'名前一覧に「あかり」が',yes:contains(names,str('あかり')),
    forms:{plain:'入っている',ifYes:'入っていれば',ifNo:'入っていなければ',whileYes:'入っているあいだ',untilYes:'入るまで',andYes:'入っていて',andNo:'入っていなくて',plainNo:'入っていない'}},
  {plain:'含まれている',operand:'名前一覧に「あかり」が',yes:contains(names,str('あかり')),
    forms:{plain:'含まれている',ifYes:'含まれていれば',ifNo:'含まれていなければ',whileYes:'含まれているあいだ',untilYes:'含まれるまで',andYes:'含まれていて',andNo:'含まれていなくて',plainNo:'含まれていない'}},
  // コピーである has no operand: the condition reads the running clone itself.
  {plain:'コピーである',operand:'',yes:sensor('クローンである'),
    forms:{plain:'コピーである',ifYes:'コピーなら',ifNo:'コピーでなければ',whileYes:'コピーであるあいだ',untilYes:'コピーになるまで',andYes:'コピーで',andNo:'コピーではなくて',plainNo:'コピーではない'}},
];
// One script per predicate: もし (yes/no), あいだ, まで, で (AND yes/no) and か (OR yes/no).
// The second operand of AND/OR is the fixed condition 「点数が3と同じなら」.
function predicateCase(row,index) {
  const c=slot=>row.operand+row.forms[slot],yes=row.yes,no=not(row.yes);
  const source=[
    `もし${c('ifYes')}、何もしない`,
    `もし${c('ifNo')}、何もしない`,
    `${c('whileYes')}、くり返す`,'  何もしない',
    `${c('untilYes')}待つ`,
    `もし${c('andYes')}、${sameThree}、何もしない`,
    `もし${c('andNo')}、${sameThree}、何もしない`,
    `もし${c('plain')}か、${sameThree}、何もしない`,
    `もし${c('plainNo')}か、${sameThree}、何もしない`,
  ].join('\n');
  const expected=script([
    inlineIf(yes),inlineIf(no),
    statement('RepeatWhile',{condition:yes,body:[nothing()]}),
    statement('WaitUntil',{condition:yes}),
    inlineIf(logical('AND',yes,sameThreeMeaning)),inlineIf(logical('AND',no,sameThreeMeaning)),
    inlineIf(logical('OR',yes,sameThreeMeaning)),inlineIf(logical('OR',no,sameThreeMeaning)),
  ]);
  const claims=Object.fromEntries(Object.keys(row.forms).map(slot=>['condition:'+row.plain+'/'+slot,c(slot)]));
  return {id:'SF-condition-'+String(index+1).padStart(2,'0'),source,expected,claims};
}

export const sentenceFormCases=[
  // 自然文の質問・計算・名前付きリスト: the answer is stored into a named variable.
  {
    id:'SF-variable-input',
    source:'答えを【名前】という変数に入れる',
    expected:script([statement('Assignment',{target:target('名前','exact'),value:sensor('答え')})]),
    claims:{'sentence:Assignment:variableInput':'答えを【名前】という変数に入れる'},
  },
  // リスト包含: 含まれていれば／含まれているあいだ／含まれるまで／含まれなくなるまで.
  {
    id:'SF-contains-if',
    source:'もし【名前一覧】に「あかり」が含まれていれば、何もしない',
    expected:script([inlineIf(contains(exactNames,str('あかり')))]),
    claims:{'condition:含まれている/ifYes':'【名前一覧】に「あかり」が含まれていれば','sentence:IfStatement':'もし','sentence:NoOperation':'何もしない'},
  },
  {
    id:'SF-contains-while',
    source:'【名前一覧】に「あかり」が含まれているあいだ、くり返す\n  何もしない',
    expected:script([statement('RepeatWhile',{condition:contains(exactNames,str('あかり')),body:[nothing()]})]),
    claims:{'condition:含まれている/whileYes':'【名前一覧】に「あかり」が含まれているあいだ','sentence:RepeatWhile':'くり返す'},
  },
  {
    id:'SF-contains-until',
    source:'【名前一覧】に「あかり」が含まれるまで待つ',
    expected:script([statement('WaitUntil',{condition:contains(exactNames,str('あかり'))})]),
    claims:{'condition:含まれている/untilYes':'【名前一覧】に「あかり」が含まれるまで','sentence:WaitUntil':'待つ'},
  },
  {
    id:'SF-contains-until-negative',
    source:'【名前一覧】に「あかり」が含まれなくなるまで待つ',
    expected:script([statement('WaitUntil',{condition:not(contains(exactNames,str('あかり')))})]),
    claims:{'until-negative:含まれている':'【名前一覧】に「あかり」が含まれなくなるまで'},
  },
  // 本文の「て」形は命令を順に接続します: すべって.
  {
    id:'SF-glide-te',
    source:'右へ1秒で10歩すべって、姿をかくす',
    expected:script([command('MotionCommand','GLIDE_DIRECTION',[quantity(1,'秒'),steps(10)],{direction:'right'}),hide()]),
    claims:{'te:すべって':'右へ1秒で10歩すべって','sentence:MotionCommand:GLIDE_DIRECTION':'右へ1秒で10歩すべって','sentence:LooksCommand:HIDE':'姿をかくす'},
  },
  {
    id:'SF-wait-polite',
    source:'1秒待ちます',
    expected:script([wait(1)]),
    claims:{'polite:待ちます':'1秒待ちます'},
  },
  {
    id:'SF-start-heading',
    source:'作品を動かしたとき、ねこは、姿を見せる',
    expected:script([show()],{heading:{event:'start',actorRef:named('ねこ')}}),
    claims:{'heading:start/^(?:作品を動かした(?:とき|ら)|作品を動かすと|始まったとき|開始したとき|「動かす」を(?:押|お)した(?:とき|ら))、(.+?)は、(.*)$':'作品を動かしたとき、ねこは、姿を見せる','sentence:LooksCommand:SHOW':'姿を見せる'},
  },
  {
    id:'SF-ask-ending',
    source:'「名前は」と聞いて待つ',
    expected:script([statement('Ask',{question:str('名前は')})]),
    claims:{'ending:と聞いて待つ':'「名前は」と聞いて待つ'},
  },
  {
    id:'SF-add-value-first',
    source:'3を点数に足す',
    expected:script([update('ADD',num(3))]),
    claims:{'sentence:NumericUpdate:ADD:valueFirst':'3を点数に足す'},
  },
  {
    id:'SF-sub-value-first',
    source:'1を点数から引く',
    expected:script([update('SUB',num(1))]),
    claims:{'sentence:NumericUpdate:SUB:valueFirst':'1を点数から引く'},
  },
  // `これを2回くり返します` は直前の一文に含まれる動作列を2回実行します.
  {
    id:'SF-repeat-previous',
    source:'姿をかくす。これを2回くり返します',
    expected:script([statement('RepeatCount',{count:times(2),body:[hide()]})]),
    claims:{'sentence:RepeatCount':'これを2回くり返します'},
  },
  {
    id:'SF-repeat-previous-kanji',
    source:'姿をかくす。これを2回繰り返します',
    expected:script([statement('RepeatCount',{count:times(2),body:[hide()]})]),
    claims:{'sentence:RepeatCount':'これを2回繰り返します'},
  },
  {
    id:'SF-set-x',
    source:'横位置を100にする',
    expected:script([command('MotionCommand','SET_X',[num(100)])]),
    claims:{'sentence:MotionCommand:SET_X':'横位置を100にする'},
  },
  // タイマーを0にする: the timer counts again from 0 (LANGUAGE.md タイマー).
  {
    id:'SF-timer-reset',
    source:'タイマーを0にする',
    expected:script([statement('TimerReset')]),
    claims:{'sentence:TimerReset':'タイマーを0にする'},
  },

  // ── Control blocks and sentences read by their own readers ──
  {
    id:'SF-repeat-until',
    source:'点数が10以上になるまで、くり返す\n  何もしない',
    expected:script([statement('RepeatUntil',{condition:compare('GTE',score,num(10)),body:[nothing()]})]),
    claims:{'sentence:RepeatUntil':'点数が10以上になるまで、くり返す'},
  },
  {
    id:'SF-forever-break',
    source:'ずっとくり返す\n  いまのくり返しを終える',
    expected:script([statement('Forever',{body:[statement('Break')]})]),
    claims:{'sentence:Forever':'ずっとくり返す','sentence:Break':'いまのくり返しを終える'},
  },
  {
    id:'SF-foreach-continue',
    source:'名前一覧の中身を先頭から一つずつ見て、次のことを行う\n  この中では、今見ているものを【項目】と呼ぶ\n  この回の残りをとばして、次の回へ進む',
    expected:script([statement('ForEach',{list:names,binder:'項目',body:[statement('Continue')]})]),
    claims:{'sentence:ForEach':'名前一覧の中身を先頭から一つずつ見て、次のことを行う','sentence:Continue':'この回の残りをとばして、次の回へ進む'},
  },
  // 「その知らせ」は同じまとまりで直前に送った通知に結び付けます.
  {
    id:'SF-broadcast-wait-group',
    source:'みんなに「出発」と知らせる\nその知らせを受けて始めたことが全部終わるまで待つ',
    expected:script([statement('Broadcast',{message:str('出発'),broadcastRef:'ref#1'}),{kind:'WaitBroadcastGroup',broadcastRef:'ref#1'}]),
    claims:{'sentence:Broadcast':'みんなに「出発」と知らせる','sentence:WaitBroadcastGroup':'その知らせを受けて始めたことが全部終わるまで待つ'},
  },
  {
    id:'SF-signal-wait-group',
    source:'「出発」の合図を送る\nその合図で始まったことが全部終わるまで待つ',
    expected:script([statement('Broadcast',{message:str('出発'),broadcastRef:'ref#1'}),{kind:'WaitBroadcastGroup',broadcastRef:'ref#1'}]),
    claims:{'sentence:Broadcast:signal':'「出発」の合図を送る'},
  },
  {
    id:'SF-signal-and-wait',
    source:'「出発」の合図を送って、その合図で始まったことが全部終わるまで待つ',
    expected:script([statement('BroadcastAndWait',{message:str('出発')})]),
    claims:{'sentence:BroadcastAndWait:signal':'「出発」の合図を送って、その合図で始まったことが全部終わるまで待つ'},
  },
  {
    id:'SF-action-call',
    source:'【ジャンプ】という手順を行う',
    expected:script([statement('UserActionCall',{name:'ジャンプ',args:[]})]),
    claims:{'sentence:UserActionCall':'【ジャンプ】という手順を行う'},
  },
  // 前・後ろは現在の向き、右・左・上・下は画面の軸 (役割と語順、移動量と座標の意味).
  {
    id:'SF-move-forward',
    source:'前へ10歩進む',
    expected:script([command('MotionCommand','MOVE',[steps(10)])]),
    claims:{'sentence:MotionCommand:MOVE':'前へ10歩進む'},
  },
  {
    id:'SF-goto',
    source:'横100、縦50の位置へ行く',
    expected:script([command('MotionCommand','GOTO',[steps(100),steps(50)])]),
    claims:{'sentence:MotionCommand:GOTO':'横100、縦50の位置へ行く'},
  },
  {
    id:'SF-glide',
    source:'横100、縦50の位置へ1秒かけて動く',
    expected:script([command('MotionCommand','GLIDE',[quantity(1,'秒'),steps(100),steps(50)])]),
    claims:{'sentence:MotionCommand:GLIDE':'横100、縦50の位置へ1秒かけて動く'},
  },
  {
    id:'SF-move-direction',
    source:'画面の右へ10歩動く',
    expected:script([command('MotionCommand','MOVE_DIRECTION',[steps(10)],{direction:'right'})]),
    claims:{'sentence:MotionCommand:MOVE_DIRECTION':'画面の右へ10歩動く'},
  },
  {
    id:'SF-set-input',
    source:'「入力欄1」に「こんにちは」を入れる',
    expected:script([command('LooksCommand','SET_INPUT',[str('入力欄1'),str('こんにちは')])]),
    claims:{'sentence:LooksCommand:SET_INPUT':'「入力欄1」に「こんにちは」を入れる'},
  },
  {
    id:'SF-continuous-rule',
    source:'点数が0以上のあいだ、自分は画面の右へ1秒に60歩の速さで動き続ける',
    expected:script([],{rules:[statement('ContinuousRule',{condition:compare('GTE',score,num(0)),direction:'right',seconds:quantity(1,'秒'),distance:steps(60)})]}),
    claims:{'sentence:ContinuousRule':'点数が0以上のあいだ、自分は画面の右へ1秒に60歩の速さで動き続ける'},
  },

  // ── Fixed sentences ──
  {
    id:'SF-control-sentences',
    source:'何もしない\nこの実行を止める\nほかの実行をすべて止める\n作品全体を止める',
    expected:script([nothing(),statement('StopCommand',{op:'THIS'}),statement('StopCommand',{op:'OTHERS'}),statement('StopCommand',{op:'ALL'})]),
    claims:{'sentence:NoOperation':'何もしない','sentence:StopCommand:THIS':'この実行を止める','sentence:StopCommand:OTHERS':'ほかの実行をすべて止める','sentence:StopCommand:ALL':'作品全体を止める'},
  },
  {
    id:'SF-looks-sentences',
    source:'姿をかくす\n姿を見せる\nいちばん手前へ出る\nいちばん奥へ下がる\n次の背景に変える\n前の背景に変える\n次の衣装に変える\n前の衣装に変える',
    expected:script(['HIDE','SHOW','FRONT','BACK','NEXT_BACKDROP','PREV_BACKDROP','NEXT_COSTUME','PREV_COSTUME'].map(op=>command('LooksCommand',op))),
    claims:{'sentence:LooksCommand:HIDE':'姿をかくす','sentence:LooksCommand:SHOW':'姿を見せる','sentence:LooksCommand:FRONT':'いちばん手前へ出る','sentence:LooksCommand:BACK':'いちばん奥へ下がる',
      'sentence:LooksCommand:NEXT_BACKDROP':'次の背景に変える','sentence:LooksCommand:PREV_BACKDROP':'前の背景に変える','sentence:LooksCommand:NEXT_COSTUME':'次の衣装に変える','sentence:LooksCommand:PREV_COSTUME':'前の衣装に変える'},
  },
  {
    id:'SF-motion-sentences',
    source:'画面の端にふれていれば、はね返る\n向きを90度にする\n右に15度回る\n左へ15度回る\n横位置を100にする\n縦位置を50に変える\nマウスの方を向く',
    expected:script([command('MotionCommand','BOUNCE'),command('MotionCommand','SET_DIRECTION',[degrees(90)]),command('MotionCommand','TURN_RIGHT',[degrees(15)]),
      command('MotionCommand','TURN_LEFT',[degrees(15)]),command('MotionCommand','SET_X',[num(100)]),command('MotionCommand','SET_Y',[num(50)]),command('MotionCommand','POINT_TO',[str('マウス')])]),
    claims:{'sentence:MotionCommand:BOUNCE':'画面の端にふれていれば、はね返る','sentence:MotionCommand:SET_DIRECTION':'向きを90度にする','sentence:MotionCommand:TURN_RIGHT':'右に15度回る',
      'sentence:MotionCommand:TURN_LEFT':'左へ15度回る','sentence:MotionCommand:SET_X':'横位置を100にする','sentence:MotionCommand:SET_Y':'縦位置を50に変える','sentence:MotionCommand:POINT_TO':'マウスの方を向く'},
  },
  {
    id:'SF-pen-sound-sentences',
    source:'ペンを下ろす\nペンを上げる\nスタンプを押す\n作品の線とスタンプを全部消す\nペンの色を「青」にする\nペンの太さを3にする\nすべての音を止める\n音量を50％にする\n音の高さを1段階上げる\n音程を2段階下げる',
    expected:script([command('PenCommand','DOWN'),command('PenCommand','UP'),command('PenCommand','STAMP'),command('PenCommand','CLEAR'),command('PenCommand','SET_COLOR',[str('青')]),
      command('PenCommand','SET_SIZE',[num(3)]),command('SoundCommand','STOP_ALL'),command('SoundCommand','SET_VOLUME',[quantity(50,'％')]),command('SoundCommand','PITCH_UP',[num(1)]),command('SoundCommand','PITCH_DOWN',[num(2)])]),
    claims:{'sentence:PenCommand:DOWN':'ペンを下ろす','sentence:PenCommand:UP':'ペンを上げる','sentence:PenCommand:STAMP':'スタンプを押す','sentence:PenCommand:CLEAR':'作品の線とスタンプを全部消す',
      'sentence:PenCommand:SET_COLOR':'ペンの色を「青」にする','sentence:PenCommand:SET_SIZE':'ペンの太さを3にする','sentence:SoundCommand:STOP_ALL':'すべての音を止める',
      'sentence:SoundCommand:SET_VOLUME':'音量を50％にする','sentence:SoundCommand:PITCH_UP':'音の高さを1段階上げる','sentence:SoundCommand:PITCH_DOWN':'音程を2段階下げる'},
  },
  // 「鳴らし始める」は待たず、「鳴らす」は終わるまで待つ (音と待機).
  {
    id:'SF-tone-sentences',
    source:'440Hzの音を0.2秒鳴らし始める\n440Hzの音を1秒鳴らす\n0.2秒、440Hzの音を鳴らし始める\n1秒、880Hzの音を鳴らす\n「ベル」を鳴らし始める\n「ベル」を鳴らす',
    expected:script([command('SoundCommand','TONE',[quantity(440,'Hz'),quantity(0.2,'秒')]),command('SoundCommand','TONE_WAIT',[quantity(440,'Hz'),quantity(1,'秒')]),
      command('SoundCommand','TONE',[quantity(440,'Hz'),quantity(0.2,'秒')]),command('SoundCommand','TONE_WAIT',[quantity(880,'Hz'),quantity(1,'秒')]),
      command('SoundCommand','SAMPLE',[str('ベル')]),command('SoundCommand','SAMPLE_WAIT',[str('ベル')])]),
    claims:{'sentence:SoundCommand:TONE':'440Hzの音を0.2秒鳴らし始める','sentence:SoundCommand:TONE_WAIT':'440Hzの音を1秒鳴らす','sentence:SoundCommand:TONE:timeFirst':'0.2秒、440Hzの音を鳴らし始める',
      'sentence:SoundCommand:TONE_WAIT:timeFirst':'1秒、880Hzの音を鳴らす','sentence:SoundCommand:SAMPLE':'「ベル」を鳴らし始める','sentence:SoundCommand:SAMPLE_WAIT':'「ベル」を鳴らす'},
  },
  {
    id:'SF-clone-sentences',
    source:'自分のコピーを作る\n自分のコピーを3体作る\nこのコピーだけを消す\n「ねこ」のコピーを作る\n「ねこ」のコピーを2体作る',
    expected:script([command('CloneCommand','CREATE_SELF'),command('CloneCommand','CREATE_SELF',[],{count:num(3)}),command('CloneCommand','DELETE_SELF'),
      command('CloneCommand','CREATE_TARGET',[str('ねこ')]),command('CloneCommand','CREATE_TARGET',[str('ねこ')],{count:num(2)})]),
    claims:{'sentence:CloneCommand:CREATE_SELF':'自分のコピーを作る','sentence:CloneCommand:CREATE_SELF:count':'自分のコピーを3体作る','sentence:CloneCommand:DELETE_SELF':'このコピーだけを消す',
      'sentence:CloneCommand:CREATE_TARGET':'「ねこ」のコピーを作る','sentence:CloneCommand:CREATE_TARGET:count':'「ねこ」のコピーを2体作る'},
  },
  // 引用した台詞は「…」と言う、データの値は「…の値を言う」 (数・単位・発言).
  {
    id:'SF-wait-say-sentences',
    source:'1秒待つ\n「点数は」と点数をつなげて言う\n「こんにちは」と2秒言う\n「点」を点数につなげて言う\n点数に1を足して言う\n「こんにちは」と言う\n点数の値を言う\n「名前は」とたずねて、答えを待つ',
    expected:script([wait(1),say(builtin('つなぐ',[str('点数は'),score])),statement('Say',{value:str('こんにちは'),seconds:quantity(2,'秒')}),
      say(builtin('つなぐ',[score,str('点')])),say({kind:'BinaryExpression',op:'ADD',left:score,right:num(1)}),say(str('こんにちは')),say(score),statement('Ask',{question:str('名前は')})]),
    claims:{'sentence:WaitTime':'1秒待つ','sentence:Say:concat':'「点数は」と点数をつなげて言う','sentence:Say:timed':'「こんにちは」と2秒言う','sentence:Say:concatReverse':'「点」を点数につなげて言う',
      'sentence:Say:add':'点数に1を足して言う','sentence:Say:quote':'「こんにちは」と言う','sentence:Say:value':'点数の値を言う','sentence:Ask':'「名前は」とたずねて、答えを待つ'},
  },
  {
    id:'SF-broadcast-return-locals',
    source:'みんなに「出発」と知らせて、知らせを受けて始めたことが全部終わるまで待つ\n点数を答えとして返す\nこの中だけで使う変数【合計】を作り、最初は0にする\nこの中だけで使うリスト【結果】を空で作る',
    expected:script([statement('BroadcastAndWait',{message:str('出発')}),statement('ReturnStatement',{value:score}),
      statement('LocalVariableDeclaration',{name:'合計',initial:num(0)}),statement('LocalListDeclaration',{name:'結果'})]),
    claims:{'sentence:BroadcastAndWait':'みんなに「出発」と知らせて、知らせを受けて始めたことが全部終わるまで待つ','sentence:ReturnStatement':'点数を答えとして返す',
      'sentence:LocalVariableDeclaration':'この中だけで使う変数【合計】を作り、最初は0にする','sentence:LocalListDeclaration':'この中だけで使うリスト【結果】を空で作る'},
  },
  {
    id:'SF-looks-value-sentences',
    source:'大きさを120％にする\n表示色を「赤」にする\n衣装を「星」にする\n背景を「空色」に変える\n自分の文字を「始める」に変える\n「ボタン1」の文字を「始める」に変える\n重なりを1つ手前にする\n重なりを2つ奥にする',
    expected:script([command('LooksCommand','SET_SCALE',[quantity(120,'％')]),command('LooksCommand','SET_COLOR',[str('赤')]),command('LooksCommand','SET_COSTUME',[str('星')]),
      command('LooksCommand','SET_BACKDROP',[str('空色')]),command('LooksCommand','SET_SELF_TEXT',[str('始める')]),command('LooksCommand','SET_TARGET_TEXT',[str('ボタン1'),str('始める')]),
      command('LooksCommand','FORWARD_LAYERS',[num(1)]),command('LooksCommand','BACKWARD_LAYERS',[num(2)])]),
    claims:{'sentence:LooksCommand:SET_SCALE':'大きさを120％にする','sentence:LooksCommand:SET_COLOR':'表示色を「赤」にする','sentence:LooksCommand:SET_COSTUME':'衣装を「星」にする',
      'sentence:LooksCommand:SET_BACKDROP':'背景を「空色」に変える','sentence:LooksCommand:SET_SELF_TEXT':'自分の文字を「始める」に変える','sentence:LooksCommand:SET_TARGET_TEXT':'「ボタン1」の文字を「始める」に変える',
      'sentence:LooksCommand:FORWARD_LAYERS':'重なりを1つ手前にする','sentence:LooksCommand:BACKWARD_LAYERS':'重なりを2つ奥にする'},
  },
  // 挿入・置換・削除の位置は1始まりの「番目」 (値の型と数量の受け渡し).
  {
    id:'SF-list-sentences',
    source:'名前一覧の中身を全部消す\n名前一覧を空にする\n名前一覧の最後に「ほたる」を入れる\n「ほたる」を名前一覧の最後に入れる\n名前一覧の1番目に「ほたる」を入れる\n「ほたる」を名前一覧の2番目の前に入れる\n名前一覧の1番目を「ひかり」に変える\n名前一覧の2番目を消す',
    expected:script([statement('ListClear',{target:target('名前一覧')}),statement('ListClear',{target:target('名前一覧')}),
      statement('ListAppend',{target:target('名前一覧'),value:str('ほたる')}),statement('ListAppend',{target:target('名前一覧'),value:str('ほたる')}),
      statement('ListInsert',{target:target('名前一覧'),index:quantity(1,'番目'),value:str('ほたる')}),statement('ListInsert',{target:target('名前一覧'),index:quantity(2,'番目'),value:str('ほたる')}),
      statement('ListReplace',{target:target('名前一覧'),index:quantity(1,'番目'),value:str('ひかり')}),statement('ListDelete',{target:target('名前一覧'),index:quantity(2,'番目')})]),
    claims:{'sentence:ListClear':'名前一覧の中身を全部消す','sentence:ListClear:empty':'名前一覧を空にする','sentence:ListAppend':'名前一覧の最後に「ほたる」を入れる',
      'sentence:ListAppend:valueFirst':'「ほたる」を名前一覧の最後に入れる','sentence:ListInsert':'名前一覧の1番目に「ほたる」を入れる','sentence:ListInsert:valueFirst':'「ほたる」を名前一覧の2番目の前に入れる',
      'sentence:ListReplace':'名前一覧の1番目を「ひかり」に変える','sentence:ListDelete':'名前一覧の2番目を消す'},
  },
  {
    id:'SF-update-sentences',
    source:'点数を3増やす\n点数を2だけ減らす\n点数に3を足す\n点数から1を引く\n点数を0にする',
    expected:script([update('ADD',num(3)),update('SUB',num(2)),update('ADD',num(3)),update('SUB',num(1)),statement('Assignment',{target:target('点数'),value:num(0)})]),
    claims:{'sentence:NumericUpdate:ADD':'点数を3増やす','sentence:NumericUpdate:SUB':'点数を2だけ減らす','sentence:NumericUpdate:ADD:targetFirst':'点数に3を足す',
      'sentence:NumericUpdate:SUB:targetFirst':'点数から1を引く','sentence:Assignment':'点数を0にする'},
  },

  // ── 条件述語の有限活用 ──
  ...predicateRows.map(predicateCase),

  // ── 「て」形: each clause runs in the written order; an explicit subject stays the topic ──
  {
    id:'SF-te-hide-wait-show',
    source:'ねこは姿をかくして、1秒待って、姿を見せる',
    // The 待って has no subject of its own, so the whole flow waits (LANGUAGE.md いつ始まるか、どう続けるか).
    expected:script([hide(named('ねこ')),wait(1),show(named('ねこ'))]),
    claims:{'te:かくして':'ねこは姿をかくして','te:待って':'1秒待って'},
  },
  // ── 待つ and its subject: with a subject only that part waits; without one (or みんなは／全体が) the whole flow ──
  {
    id:'SF-wait-subject',
    source:'1秒待つ\nねこは1秒待つ\n自分は1秒待つ\nみんなは1秒待つ\n全体が1秒待つ\nみんなで1秒待つ\nねこだけ1秒待つ\nねこは点数が1と同じになるまで待つ\n点数が1と同じになるまで待つ',
    expected:script([wait(1),wait(1,named('ねこ')),wait(1,self),wait(1),wait(1),wait(1),wait(1,named('ねこ')),
      statement('WaitUntil',{condition:compare('EQ',score,num(1))},named('ねこ')),statement('WaitUntil',{condition:compare('EQ',score,num(1))})]),
    claims:{'sentence:WaitTime':'ねこは1秒待つ','sentence:WaitUntil':'ねこは点数が1と同じになるまで待つ'},
  },
  // A wait without a subject does not take the one before it, and the topic goes on after it.
  {
    id:'SF-wait-topic',
    source:'ねこは画面の右へ10歩動く\n1秒待つ\n画面の右へ10歩動く',
    expected:script([command('MotionCommand','MOVE_DIRECTION',[steps(10)],{direction:'right'},named('ねこ')),wait(1),
      command('MotionCommand','MOVE_DIRECTION',[steps(10)],{direction:'right'},named('ねこ'))]),
    claims:{'sentence:WaitTime':'1秒待つ'},
  },
  // 自分が／自分も are 自分は; まず・それから・すばやく after the subject only say the order or how.
  {
    id:'SF-subject-self-and-lead',
    source:"自分が1秒待つ\n自分も1秒待つ\nねこは、まず1秒待つ\nそれからねこだけ1秒待つ\nねこはすばやく10歩進む",
    expected:{"kind":"Script","body":[{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"named","name":"ねこ"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"named","name":"ねこ"}},{"kind":"MotionCommand","args":[{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":10},"unit":"歩"}],"op":"MOVE","actorRef":{"kind":"named","name":"ねこ"}}]},
    claims:{"sentence:WaitTime":"自分が1秒待つ","sentence:MotionCommand:MOVE":"ねこはすばやく10歩進む"},
  },
  // 2こ counts like 2つ.
  {
    id:'SF-count-ko',
    source:"点数を2こ増やす",
    expected:{"kind":"Script","body":[{"kind":"NumericUpdate","op":"ADD","target":{"name":"点数","qualifier":null},"value":{"kind":"NumberLiteral","value":2},"actorRef":{"kind":"self"}}]},
    claims:{"sentence:NumericUpdate:ADD":"点数を2こ増やす"},
  },
  // 〜ではなく、 is the first check 〜ではなくて、.
  {
    id:'SF-and-first-naku',
    source:"もし点数が5ではなく、点数が1より大きければ、\n  何もしない",
    expected:{"kind":"Script","body":[{"kind":"IfStatement","condition":{"kind":"LogicalExpression","op":"AND","left":{"kind":"UnaryExpression","op":"NOT","value":{"kind":"CompareExpression","op":"EQ","left":{"kind":"VariableRead","name":"点数","qualifier":null},"right":{"kind":"NumberLiteral","value":5}}},"right":{"kind":"CompareExpression","op":"GT","left":{"kind":"VariableRead","name":"点数","qualifier":null},"right":{"kind":"NumberLiteral","value":1}}},"actorRef":{"kind":"self"},"thenBody":[{"kind":"NoOperation","actorRef":{"kind":"self"}}],"elseBody":[],"hasElse":false}]},
    claims:{"sentence:IfStatement":"もし点数が5ではなく、点数が1より大きければ、"},
  },
  // スペースキー／みぎキー without 「 」 name the keys 空白／右.
  {
    id:'SF-key-bare-alias',
    source:"スペースキーがおされるまで待つ\nもしみぎキーがおされていれば、\n  何もしない",
    expected:{"kind":"Script","body":[{"kind":"WaitUntil","condition":{"kind":"SensorRead","sensor":"KEY_DOWN","arg":{"kind":"StringLiteral","value":"空白"}},"actorRef":{"kind":"all"}},{"kind":"IfStatement","condition":{"kind":"SensorRead","sensor":"KEY_DOWN","arg":{"kind":"StringLiteral","value":"右"}},"actorRef":{"kind":"self"},"thenBody":[{"kind":"NoOperation","actorRef":{"kind":"self"}}],"elseBody":[],"hasElse":false}]},
    claims:{"sentence:WaitUntil":"スペースキーがおされるまで待つ"},
  },
  {
    id:'SF-te-repeat-inline',
    source:'10歩進んで、1秒待つことを3回くり返す',
    expected:script([statement('RepeatCount',{count:times(3),body:[command('MotionCommand','MOVE',[steps(10)]),wait(1)]})]),
    claims:{'te:進んで':'10歩進んで'},
  },
  {
    id:'SF-te-turn-then-move',
    source:'右を向いて、10歩進む',
    expected:script([command('MotionCommand','SET_DIRECTION',[degrees(0)]),command('MotionCommand','MOVE',[steps(10)])]),
    claims:{'te:向いて':'右を向いて'},
  },
  {
    id:'SF-te-turns',
    source:'画面の右をむいて、前へ10歩すすんで、右に15度まわって、左へ15度回って、姿をかくす',
    expected:script([command('MotionCommand','SET_DIRECTION',[degrees(0)]),command('MotionCommand','MOVE',[steps(10)]),command('MotionCommand','TURN_RIGHT',[degrees(15)]),
      command('MotionCommand','TURN_LEFT',[degrees(15)]),hide()]),
    claims:{'te:むいて':'画面の右をむいて','te:すすんで':'前へ10歩すすんで','te:まわって':'右に15度まわって','te:回って':'左へ15度回って'},
  },
  {
    id:'SF-te-moves',
    source:'ねこを右へ10歩うごかして、ねこを左へ10歩動かして、右へ10歩うごいて、左へ10歩動いて、姿を見せる',
    expected:script([command('MotionCommand','MOVE_DIRECTION',[steps(10)],{direction:'right'},named('ねこ')),command('MotionCommand','MOVE_DIRECTION',[steps(10)],{direction:'left'},named('ねこ')),
      command('MotionCommand','MOVE_DIRECTION',[steps(10)],{direction:'right'},named('ねこ')),command('MotionCommand','MOVE_DIRECTION',[steps(10)],{direction:'left'},named('ねこ')),show(named('ねこ'))]),
    claims:{'te:うごかして':'ねこを右へ10歩うごかして','te:動かして':'ねこを左へ10歩動かして','te:うごいて':'右へ10歩うごいて','te:動いて':'左へ10歩動いて'},
  },
  {
    id:'SF-te-goto',
    source:'横100、縦50の位置へ行って、姿を隠す',
    expected:script([command('MotionCommand','GOTO',[steps(100),steps(50)]),hide()]),
    claims:{'te:行って':'横100、縦50の位置へ行って','sentence:LooksCommand:HIDE':'姿を隠す'},
  },
  {
    id:'SF-te-glide-hide-show-wait',
    source:'1秒で横200、縦100の位置へ滑って、姿を隠して、姿をみせて、1秒まって、姿を見せる',
    expected:script([command('MotionCommand','GLIDE',[quantity(1,'秒'),steps(200),steps(100)]),hide(),show(),wait(1),show()]),
    claims:{'te:滑って':'1秒で横200、縦100の位置へ滑って','te:隠して':'姿を隠して','te:みせて':'姿をみせて','te:まって':'1秒まって'},
  },
  {
    id:'SF-te-change-say',
    source:'表示色を「赤」に変えて、「やあ」と言って、「やあ」といって、「やあ」と話して、「やあ」とはなして、姿を見せて、何もしない',
    expected:script([command('LooksCommand','SET_COLOR',[str('赤')]),say(str('やあ')),say(str('やあ')),say(str('やあ')),say(str('やあ')),show(),nothing()]),
    claims:{'te:変えて':'表示色を「赤」に変えて','te:言って':'「やあ」と言って','te:いって':'「やあ」といって','te:話して':'「やあ」と話して','te:はなして':'「やあ」とはなして','te:見せて':'姿を見せて'},
  },
  {
    // The easy spelling かえる (LANGUAGE.md やさしい書き方) changes the same role as 変える.
    id:'SF-te-change-easy',
    source:'表示色を「青」にかえて、何もしない',
    expected:script([command('LooksCommand','SET_COLOR',[str('青')]),nothing()]),
    claims:{'te:かえて':'表示色を「青」にかえて'},
  },
  {
    id:'SF-te-data',
    source:'名前一覧の最後に「ほたる」を入れて、名前一覧の最後に「ひかり」をいれて、点数に1を足して、点数に1をたして、点数から1を引いて、点数から1をひいて、点数を0にして、何もしない',
    expected:script([statement('ListAppend',{target:target('名前一覧'),value:str('ほたる')}),statement('ListAppend',{target:target('名前一覧'),value:str('ひかり')}),
      update('ADD',num(1)),update('ADD',num(1)),update('SUB',num(1)),update('SUB',num(1)),statement('Assignment',{target:target('点数'),value:num(0)}),nothing()]),
    claims:{'te:入れて':'名前一覧の最後に「ほたる」を入れて','te:いれて':'名前一覧の最後に「ひかり」をいれて','te:足して':'点数に1を足して','te:たして':'点数に1をたして',
      'te:引いて':'点数から1を引いて','te:ひいて':'点数から1をひいて','te:して':'点数を0にして'},
  },
  {
    id:'SF-te-clear-notify-sound',
    source:'名前一覧の中身を全部消して、名前一覧の中身を全部けして、みんなに「出発」と知らせて、「ベル」を鳴らして、440Hzの音を1秒鳴らし始めて、何もしない',
    expected:script([statement('ListClear',{target:target('名前一覧')}),statement('ListClear',{target:target('名前一覧')}),statement('Broadcast',{message:str('出発')}),
      command('SoundCommand','SAMPLE_WAIT',[str('ベル')]),command('SoundCommand','TONE',[quantity(440,'Hz'),quantity(1,'秒')]),nothing()]),
    claims:{'te:消して':'名前一覧の中身を全部消して','te:けして':'名前一覧の中身を全部けして','te:知らせて':'みんなに「出発」と知らせて','te:鳴らして':'「ベル」を鳴らして','te:鳴らし始めて':'440Hzの音を1秒鳴らし始めて'},
  },
  {
    id:'SF-te-make-say',
    source:'ねこに「やあ」と言わせて、姿をかくす',
    expected:script([say(str('やあ'),named('ねこ')),hide(named('ねこ'))]),
    claims:{'te:言わせて':'ねこに「やあ」と言わせて'},
  },
  {
    id:'SF-te-repeat',
    source:'姿をかくすことを2回くり返して、姿をかくすことを2回繰り返して、姿をかくすことを2回くりかえして、何もしない',
    expected:script([statement('RepeatCount',{count:times(2),body:[hide()]}),statement('RepeatCount',{count:times(2),body:[hide()]}),statement('RepeatCount',{count:times(2),body:[hide()]}),nothing()]),
    claims:{'te:くり返して':'姿をかくすことを2回くり返して','te:繰り返して':'姿をかくすことを2回繰り返して','te:くりかえして':'姿をかくすことを2回くりかえして'},
  },

  // ── 敬体: 定めた敬体は対応する動作と同じ意味です ──
  {
    id:'SF-polite-timed-speech',
    source:'『こんにちは』と2秒話します',
    expected:script([statement('Say',{value:str('こんにちは'),seconds:quantity(2,'秒')})]),
    claims:{'polite:話します':'『こんにちは』と2秒話します'},
  },
  {
    id:'SF-polite-speech',
    source:'「やあ」とはなします\n「やあ」と言います\n「やあ」といいます\n「名前は」とたずねます\n「名前は」と尋ねます',
    expected:script([say(str('やあ')),say(str('やあ')),say(str('やあ')),statement('Ask',{question:str('名前は')}),statement('Ask',{question:str('名前は')})]),
    claims:{'polite:はなします':'「やあ」とはなします','polite:言います':'「やあ」と言います','polite:いいます':'「やあ」といいます','polite:たずねます':'「名前は」とたずねます','polite:尋ねます':'「名前は」と尋ねます'},
  },
  {
    id:'SF-polite-actions',
    source:'1秒まちます\n点数を1増やします\n点数を1減らします\n右へ10歩動きます\n前へ10歩進みます\n右に15度回ります\n点数を0にします',
    expected:script([wait(1),update('ADD',num(1)),update('SUB',num(1)),command('MotionCommand','MOVE_DIRECTION',[steps(10)],{direction:'right'}),command('MotionCommand','MOVE',[steps(10)]),
      command('MotionCommand','TURN_RIGHT',[degrees(15)]),statement('Assignment',{target:target('点数'),value:num(0)})]),
    claims:{'polite:まちます':'1秒まちます','polite:増やします':'点数を1増やします','polite:減らします':'点数を1減らします','polite:動きます':'右へ10歩動きます',
      'polite:進みます':'前へ10歩進みます','polite:回ります':'右に15度回ります','polite:します':'点数を0にします'},
  },
  // 1.3.1: every action reads in です・ます; each polite entry is the one that reads its sentence.
  {
    id:'SF-polite-every-action',
    source:"「マウス」の方を向きます\nよこ100、たて50のばしょへ行きます\n1秒で横200、縦100の位置へすべります\nいちばんおくへ下がります\n画面のはしにふれていれば、はね返ります\nすがたをかくします\n姿を隠します\nすがたを見せます\nいちばん手前へ出ます\n次のすがたにかえます\n次の背景に変えます\n「ベル」を鳴らし始めます\n「ベル」を鳴らします\nこの動きを止めます\n「開始」の合図を送ります\n自分のコピーを作ります\nこのコピーだけを消します\nこのコピーだけをけします\n名前一覧の最後に「あ」を入れます\n点数に1を足します\n点数から1を引きます\nペンを下ろします\nペンを上げます\n今のすがたのスタンプをおします\nスタンプを押します\n点数を答えとして返します\n【増やす】という手順を行います\n何もしません",
    expected:{"kind":"Script","body":[{"kind":"MotionCommand","args":[{"kind":"StringLiteral","value":"マウス"}],"op":"POINT_TO","actorRef":{"kind":"self"}},{"kind":"MotionCommand","args":[{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":100},"unit":"歩"},{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":50},"unit":"歩"}],"op":"GOTO","actorRef":{"kind":"self"}},{"kind":"MotionCommand","args":[{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":200},"unit":"歩"},{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":100},"unit":"歩"}],"op":"GLIDE","actorRef":{"kind":"self"}},{"kind":"LooksCommand","args":[],"op":"BACK","actorRef":{"kind":"self"}},{"kind":"MotionCommand","args":[],"op":"BOUNCE","actorRef":{"kind":"self"}},{"kind":"LooksCommand","args":[],"op":"HIDE","actorRef":{"kind":"self"}},{"kind":"LooksCommand","args":[],"op":"HIDE","actorRef":{"kind":"self"}},{"kind":"LooksCommand","args":[],"op":"SHOW","actorRef":{"kind":"self"}},{"kind":"LooksCommand","args":[],"op":"FRONT","actorRef":{"kind":"self"}},{"kind":"LooksCommand","args":[],"op":"NEXT_COSTUME","actorRef":{"kind":"self"}},{"kind":"LooksCommand","args":[],"op":"NEXT_BACKDROP","actorRef":{"kind":"self"}},{"kind":"SoundCommand","args":[{"kind":"StringLiteral","value":"ベル"}],"op":"SAMPLE","actorRef":{"kind":"self"}},{"kind":"SoundCommand","args":[{"kind":"StringLiteral","value":"ベル"}],"op":"SAMPLE_WAIT","actorRef":{"kind":"self"}},{"kind":"StopCommand","op":"THIS","actorRef":{"kind":"self"}},{"kind":"Broadcast","message":{"kind":"StringLiteral","value":"開始"},"actorRef":{"kind":"self"}},{"kind":"CloneCommand","args":[],"op":"CREATE_SELF","actorRef":{"kind":"self"}},{"kind":"CloneCommand","args":[],"op":"DELETE_SELF","actorRef":{"kind":"self"}},{"kind":"CloneCommand","args":[],"op":"DELETE_SELF","actorRef":{"kind":"self"}},{"kind":"ListAppend","target":{"name":"名前一覧","qualifier":null},"value":{"kind":"StringLiteral","value":"あ"},"actorRef":{"kind":"self"}},{"kind":"NumericUpdate","op":"ADD","target":{"name":"点数","qualifier":null},"value":{"kind":"NumberLiteral","value":1},"actorRef":{"kind":"self"}},{"kind":"NumericUpdate","op":"SUB","target":{"name":"点数","qualifier":null},"value":{"kind":"NumberLiteral","value":1},"actorRef":{"kind":"self"}},{"kind":"PenCommand","args":[],"op":"DOWN","actorRef":{"kind":"self"}},{"kind":"PenCommand","args":[],"op":"UP","actorRef":{"kind":"self"}},{"kind":"PenCommand","args":[],"op":"STAMP","actorRef":{"kind":"self"}},{"kind":"PenCommand","args":[],"op":"STAMP","actorRef":{"kind":"self"}},{"kind":"ReturnStatement","value":{"kind":"VariableRead","name":"点数","qualifier":null},"actorRef":{"kind":"self"}},{"kind":"UserActionCall","name":"増やす","args":[],"actorRef":{"kind":"self"}},{"kind":"NoOperation","actorRef":{"kind":"self"}}]},
    claims:{"polite:向きます":"「マウス」の方を向きます","polite:行きます":"よこ100、たて50のばしょへ行きます","polite:すべります":"1秒で横200、縦100の位置へすべります","polite:下がります":"いちばんおくへ下がります","polite:はね返ります":"画面のはしにふれていれば、はね返ります","polite:かくします":"すがたをかくします","polite:隠します":"姿を隠します","polite:見せます":"すがたを見せます","polite:出ます":"いちばん手前へ出ます","polite:かえます":"次のすがたにかえます","polite:変えます":"次の背景に変えます","polite:鳴らし始めます":"「ベル」を鳴らし始めます","polite:鳴らします":"「ベル」を鳴らします","polite:止めます":"この動きを止めます","polite:送ります":"「開始」の合図を送ります","polite:作ります":"自分のコピーを作ります","polite:消します":"このコピーだけを消します","polite:けします":"このコピーだけをけします","polite:入れます":"名前一覧の最後に「あ」を入れます","polite:足します":"点数に1を足します","polite:引きます":"点数から1を引きます","polite:下ろします":"ペンを下ろします","polite:上げます":"ペンを上げます","polite:おします":"今のすがたのスタンプをおします","polite:押します":"スタンプを押します","polite:返します":"点数を答えとして返します","polite:行います":"【増やす】という手順を行います","polite:しません":"何もしません"},
  },

  // はね返って、: the bounce goes on to the next action.
  {
    id:'SF-te-bounce',
    source:"画面のはしにふれていれば、はね返って、1秒待つ",
    expected:{"kind":"Script","body":[{"kind":"MotionCommand","args":[],"op":"BOUNCE","actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}}]},
    claims:{"te:はね返って":"画面のはしにふれていれば、はね返って"},
  },
  // いれます／むきます: です・ます of the かな verbs.
  {
    id:'SF-polite-kana',
    source:"名前一覧の最後に「あ」をいれます\n右をむきます",
    expected:{"kind":"Script","body":[{"kind":"ListAppend","target":{"name":"名前一覧","qualifier":null},"value":{"kind":"StringLiteral","value":"あ"},"actorRef":{"kind":"self"}},{"kind":"MotionCommand","args":[{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":0},"unit":"度"}],"op":"SET_DIRECTION","actorRef":{"kind":"self"}}]},
    claims:{"polite:いれます":"名前一覧の最後に「あ」をいれます","polite:むきます":"右をむきます"},
  },
  // 隠れます／現れます: です・ます of the words read as すがたをかくす／すがたを見せる.
  {
    id:'SF-polite-hide-show',
    source:'隠れます\n現れます',
    expected:script([hide(),show()]),
    claims:{'polite:隠れます':'隠れます','polite:現れます':'現れます'},
  },
  // 1.3.1: every action's て形 runs the two actions in order; each て entry is the one that reads its clause.
  {
    id:'SF-te-every-verb',
    source:"点数を1増やして、1秒待つ\n点数を1ふやして、1秒待つ\n点数を1減らして、1秒待つ\n点数を1へらして、1秒待つ\nペンを下ろして、1秒待つ\nペンをおろして、1秒待つ\nスタンプを押して、1秒待つ\n今のすがたのスタンプをおして、1秒待つ\nすべての音を止めて、1秒待つ\n自分のコピーを作って、1秒待つ\n自分のコピーをつくって、1秒待つ\n「開始」の合図を送って、1秒待つ\nペンを上げて、1秒待つ\nペンをあげて、1秒待つ\n音の高さを1段階下げて、1秒待つ\nいちばんおくへ下がって、1秒待つ\nいちばん手前へ出て、1秒待つ\n「名前は？」と聞いて、1秒待つ\n「名前は？」ときいて、1秒待つ\n「名前は？」とたずねて、1秒待つ",
    expected:{"kind":"Script","body":[{"kind":"NumericUpdate","op":"ADD","target":{"name":"点数","qualifier":null},"value":{"kind":"NumberLiteral","value":1},"actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}},{"kind":"NumericUpdate","op":"ADD","target":{"name":"点数","qualifier":null},"value":{"kind":"NumberLiteral","value":1},"actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}},{"kind":"NumericUpdate","op":"SUB","target":{"name":"点数","qualifier":null},"value":{"kind":"NumberLiteral","value":1},"actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}},{"kind":"NumericUpdate","op":"SUB","target":{"name":"点数","qualifier":null},"value":{"kind":"NumberLiteral","value":1},"actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}},{"kind":"PenCommand","args":[],"op":"DOWN","actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}},{"kind":"PenCommand","args":[],"op":"DOWN","actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}},{"kind":"PenCommand","args":[],"op":"STAMP","actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}},{"kind":"PenCommand","args":[],"op":"STAMP","actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}},{"kind":"SoundCommand","args":[],"op":"STOP_ALL","actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}},{"kind":"CloneCommand","args":[],"op":"CREATE_SELF","actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}},{"kind":"CloneCommand","args":[],"op":"CREATE_SELF","actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}},{"kind":"Broadcast","message":{"kind":"StringLiteral","value":"開始"},"actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}},{"kind":"PenCommand","args":[],"op":"UP","actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}},{"kind":"PenCommand","args":[],"op":"UP","actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}},{"kind":"SoundCommand","args":[{"kind":"NumberLiteral","value":1}],"op":"PITCH_DOWN","actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}},{"kind":"LooksCommand","args":[],"op":"BACK","actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}},{"kind":"LooksCommand","args":[],"op":"FRONT","actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}},{"kind":"Ask","question":{"kind":"StringLiteral","value":"名前は？"},"actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}},{"kind":"Ask","question":{"kind":"StringLiteral","value":"名前は？"},"actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}},{"kind":"Ask","question":{"kind":"StringLiteral","value":"名前は？"},"actorRef":{"kind":"self"}},{"kind":"WaitTime","seconds":{"kind":"QuantityLiteral","value":{"kind":"NumberLiteral","value":1},"unit":"秒"},"actorRef":{"kind":"all"}}]},
    claims:{"te:増やして":"点数を1増やして","te:ふやして":"点数を1ふやして","te:減らして":"点数を1減らして","te:へらして":"点数を1へらして","te:下ろして":"ペンを下ろして","te:おろして":"ペンをおろして","te:押して":"スタンプを押して","te:おして":"今のすがたのスタンプをおして","te:止めて":"すべての音を止めて","te:作って":"自分のコピーを作って","te:つくって":"自分のコピーをつくって","te:送って":"「開始」の合図を送って","te:上げて":"ペンを上げて","te:あげて":"ペンをあげて","te:下げて":"音の高さを1段階下げて","te:下がって":"いちばんおくへ下がって","te:出て":"いちばん手前へ出て","te:聞いて":"「名前は？」と聞いて","te:きいて":"「名前は？」ときいて","te:たずねて":"「名前は？」とたずねて"},
  },

  // ── できごとの見出し (いつ始まるか、どう続けるか) ──
  // コピーができたとき (the event's own name) starts 自分's copies.
  {
    id:'SF-heading-copy-self',
    source:'コピーができたとき、姿をかくす',
    expected:script([hide()],{heading:{event:'cloneStart',actorRef:self}}),
    claims:{'heading:cloneStart/^()コピーが(?:作られた|できた)(?:とき|ら)、?(.*)$':'コピーができたとき、姿をかくす'},
  },
  // おされたとき、 (the event's own name, no part) is 自分's click.
  {
    id:'SF-heading-click-self',
    source:'おされたとき、姿をかくす',
    expected:script([hide()],{heading:{event:'click',actorRef:self}}),
    claims:{'heading:click/^()(?:(?:押|お)された(?:とき|ら)|(?:押|お)されると|(?:押|お)されるたびに|クリックされた(?:とき|ら)|クリックされると|クリックされるたびに)、?(.*)$':'おされたとき、姿をかくす'},
  },
  {
    id:'SF-heading-start-short',
    source:'始めると、ねこは、姿を見せる',
    expected:script([show()],{heading:{event:'start',actorRef:named('ねこ')}}),
    claims:{'heading:start/^始め(?:ると|たら)、(.+?)は、(.*)$':'始めると、ねこは、姿を見せる'},
  },
  {
    id:'SF-heading-click',
    source:'ねこがおされたとき、姿をかくす',
    expected:script([hide()],{heading:{event:'click',actorRef:named('ねこ')}}),
    claims:{'heading:click/^(?!もし)(.+?)(?:がおされた(?:とき|ら)|がおされると|がおされるたびに|をおした(?:とき|ら)|をおすたびに|がクリックされた(?:とき|ら)|がクリックされると|がクリックされるたびに|をクリックした(?:とき|ら)|をクリックするたびに)、?(.*)$':'ねこがおされたとき、姿をかくす'},
  },
  {
    id:'SF-heading-any-key',
    source:'キーがおされたとき、ねこは、姿をかくす',
    expected:script([hide()],{heading:{event:'keyDown',actorRef:named('ねこ')}}),
    claims:{'heading:keyDown/^キー(?:が(?:押|お)された(?:とき|ら)|が(?:押|お)されると|を(?:押|お)した(?:とき|ら)|を(?:押|お)すと)、(.+?)は、(.*)$':'キーがおされたとき、ねこは、姿をかくす'},
  },
  {
    id:'SF-heading-named-key',
    source:'「空白」キーをおすたびに、ねこは、姿をかくす',
    expected:script([hide()],{heading:{event:'keyDown',actorRef:named('ねこ'),filter:{key:'空白'}}}),
    claims:{'heading:keyDown/^(.+?)キー(?:を(?:押|お)すたびに|を(?:押|お)した(?:とき|ら)|を(?:押|お)すと|が(?:押|お)された(?:とき|ら)|が(?:押|お)されると)、(.+?)は、(.*)$':'「空白」キーをおすたびに、ねこは、姿をかくす'},
  },
  {
    id:'SF-heading-any-message',
    source:'知らせを受け取ったとき、ねこは、姿をかくす',
    expected:script([hide()],{heading:{event:'message',actorRef:named('ねこ')}}),
    claims:{'heading:message/^知らせを受け取ったとき、(.+?)は、(.*)$':'知らせを受け取ったとき、ねこは、姿をかくす'},
  },
  {
    id:'SF-heading-named-message',
    source:'「出発」という知らせを受け取ったとき、ねこは、姿をかくす',
    expected:script([hide()],{heading:{event:'message',actorRef:named('ねこ'),filter:{message:'出発'}}}),
    claims:{'heading:message/^(.+?)という知らせを受け取ったとき、(.+?)は、(.*)$':'「出発」という知らせを受け取ったとき、ねこは、姿をかくす'},
  },
  {
    id:'SF-heading-any-signal',
    source:'合図を受けたとき、ねこは、姿をかくす',
    expected:script([hide()],{heading:{event:'message',actorRef:named('ねこ')}}),
    claims:{'heading:message/^合図を(?:受けた|受け取った|受けとった|うけた|うけとった)(?:とき|ら)、(.+?)は、(.*)$':'合図を受けたとき、ねこは、姿をかくす'},
  },
  {
    id:'SF-heading-named-signal',
    source:'「出発」という合図を受けたとき、ねこは、姿をかくす',
    expected:script([hide()],{heading:{event:'message',actorRef:named('ねこ'),filter:{message:'出発'}}}),
    claims:{'heading:message/^(.+?)(?:という|の)合図を(?:受けた|受け取った|受けとった|うけた|うけとった)(?:とき|ら)、(.+?)は、(.*)$':'「出発」という合図を受けたとき、ねこは、姿をかくす'},
  },
  {
    id:'SF-heading-backdrop',
    source:'背景が変わったとき、ねこは、姿をかくす',
    expected:script([hide()],{heading:{event:'backdropChanged',actorRef:named('ねこ')}}),
    claims:{'heading:backdropChanged/^(?:背景|はいけい)が(?:変わった|かわった)(?:とき|ら)、(.+?)は、(.*)$':'背景が変わったとき、ねこは、姿をかくす'},
  },
  {
    id:'SF-heading-value-changed',
    source:'入力欄1の中身が変わったとき、何もしない',
    expected:script([nothing()],{heading:{event:'valueChanged',actorRef:named('入力欄1')}}),
    claims:{'heading:valueChanged/^(?!もし)(.+?)の中身が(?:変わった|かわった)(?:とき|ら)、?(.*)$':'入力欄1の中身が変わったとき、何もしない'},
  },
  {
    id:'SF-heading-clone',
    source:'ねこのコピーが作られたとき、姿をかくす',
    expected:script([hide()],{heading:{event:'cloneStart',actorRef:named('ねこ')}}),
    claims:{'heading:cloneStart/^(?!もし)(.+?)のコピーが(?:作られた|できた)(?:とき|ら)、?(.*)$':'ねこのコピーが作られたとき、姿をかくす'},
  },

  // ── 「〜なくなるまで」 ──
  {
    id:'SF-until-negative',
    source:'「空白」キーが押されなくなるまで待つ\n「空白」キーがおされなくなるまで待つ\n端にふれなくなるまで待つ\n端に触れなくなるまで待つ\n名前一覧に「あかり」が入らなくなるまで待つ',
    expected:script([statement('WaitUntil',{condition:not(sensor('KEY_DOWN',str('空白')))}),statement('WaitUntil',{condition:not(sensor('KEY_DOWN',str('空白')))}),statement('WaitUntil',{condition:not(sensor('TOUCHING',str('端')))}),
      statement('WaitUntil',{condition:not(sensor('TOUCHING',str('端')))}),statement('WaitUntil',{condition:not(contains(names,str('あかり')))})]),
    claims:{'until-negative:押されている':'「空白」キーが押されなくなるまで','until-negative:おされている':'「空白」キーがおされなくなるまで','until-negative:ふれている':'端にふれなくなるまで','until-negative:触れている':'端に触れなくなるまで','until-negative:入っている':'名前一覧に「あかり」が入らなくなるまで'},
  },

  // ── 旧基準表記の語尾 (基準機能を追跡する旧表記一覧) ──
  {
    id:'SF-ending-assign-add',
    source:'点数に3を代入する\n点数に3を加える\n3を点数に代入する\n3を点数に加える',
    expected:script([statement('Assignment',{target:target('点数'),value:num(3)}),update('ADD',num(3)),statement('Assignment',{target:target('点数'),value:num(3)}),update('ADD',num(3))]),
    claims:{'ending:を代入する':'点数に3を代入する','ending:を加える':'点数に3を加える','ending:に代入する':'3を点数に代入する','ending:に加える':'3を点数に加える'},
  },
  // The legacy ending carries 番目 itself, so its index operand is the plain number.
  {
    id:'SF-ending-list',
    source:'「ほたる」を名前一覧に追加する\n「ひかり」を名前一覧の末尾に追加する\n「あかり」を名前一覧の1番目に挿入する',
    expected:script([statement('ListAppend',{target:target('名前一覧'),value:str('ほたる')}),statement('ListAppend',{target:target('名前一覧'),value:str('ひかり')}),
      statement('ListInsert',{target:target('名前一覧'),index:num(1),value:str('あかり')})]),
    claims:{'ending:に追加する':'「ほたる」を名前一覧に追加する','ending:の末尾に追加する':'「ひかり」を名前一覧の末尾に追加する','ending:番目に挿入する':'「あかり」を名前一覧の1番目に挿入する'},
  },
  // Spellings read by the sentence readers (no table entry of their own).
  {
    id:'SF-wait-seconds-ending',
    source:'1秒間待つ',
    expected:script([wait(1)]),
    claims:{'sentence:WaitTime':'1秒間待つ'},
  },
  {
    id:'SF-ask-ending-kanji',
    source:'「名前は」と尋ねる',
    expected:script([statement('Ask',{question:str('名前は')})]),
    claims:{'sentence:Ask':'「名前は」と尋ねる'},
  },
  {
    id:'SF-say-ending',
    source:'「やあ」という',
    expected:script([say(str('やあ'))]),
    claims:{'sentence:Say:quote':'「やあ」という'},
  },
];

