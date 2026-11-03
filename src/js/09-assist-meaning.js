  // A complete reading keeps roles attached to their own action. Quoted values are
  // carried through unchanged; they never supply verbs, directions or quantities.
  function assistMeaningReference(source, ctx) {
    const quoted=[],protect=source=>source.replace(/「[^「」]*」|『[^『』]*』|｢[^｢｣]*｣|"[^"]*"/g,s=>'「§'+(quoted.push(s)-1)+'§」');
    let text=protect(assistNumberText(source));
    const names=['自分','体',...(ctx.symbols?.project?.components||[]).map(c=>c.name)].sort((a,b)=>b.length-a.length);
    const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    for(const name of names){
      if((['自分','体'].includes(name)||name===ctx.symbols?.project?.components.find(c=>c.id===ctx.targetId)?.name)&&new RegExp('^'+escape(name)+'の動きを(?:全部)?止める[。]?$').test(text))text=name+'は自分のほかの動きを止める。\n'+name+'はこの動きを止める。';
      const aliases=[escape(name),...quoted.flatMap((q,i)=>q.slice(1,-1)===name?['「§'+i+'§」']:[])].join('|');
      if(!/(?:まで|たら|なら|れば|とき|あいだ)/.test(text))text=text.replace(new RegExp('(^|[、。\\n])('+aliases+')が','g'),(_,boundary)=>boundary+sentenceActorSource({kind:['自分','体'].includes(name)?'self':'named',name})+'は');
      text=text.replace(new RegExp('(^|[、。\\n])('+aliases+')(?:を(?=[^。\\n]*?(?:移動させ|動か|走らせ|進ま|待た|休ま|言わ|話さ))|は)','g'),(_,boundary)=>boundary+sentenceActorSource({kind:name==='自分'||name==='体'?'self':'named',name})+'は');
      text=text.replace(new RegExp('('+aliases+')を(?:(\\d+(?:\\.\\d+)?)(?:匹|体|つ|個))?(?:コピー|複製)(する|して|させる)','g'),(_,target,count,ending)=>{
        const literal=['自分','体'].includes(target)?'自分':target.startsWith('「')?target:'「'+target+'」';
        return literal+'のコピーを'+(count?count+'つ':'')+(ending==='して'?'作って':'作る');
      });
    }
    text=text.replace(/(^|[は、。\n])(?:大きさを)?(\d+(?:\.\d+)?)(?:倍|ばい)にする(?=$|[。])/g, '$1大きさを（大きさ×$2）％にする');
    text=text.replace(/(\d+)度(?=くり返|繰り返|繰返)/g,'$1回');
    text=text.replace(/(「§\d+§」)を空にする/g,'$1に「」を入れる');
    text=text.replace(/(^|[は、。\n])(\d+(?:\.\d+)?)歩進ませる/g,'$1前へ$2歩進む');
    text=text.replace(/(\d+(?:\.\d+)?)びょう/g,'$1秒').replace(/秒おきに/g,'秒ごとに');
    text=text.replace(/(\d+(?:\.\d+)?)秒(?:止まる|じっとする|ねる|ねむる|ウエイト|あける|まちなさい|まちたい)/g,'$1秒待つ');
    text=text.replace(/^(?:毎秒)、?/,'1秒ごとに、');
    text=text.replace(/(\d+(?:\.\d+)?)歩(?:進む|進み|進んだあと)(?=\d)/g,'前へ$1歩進んで、');
    text=text.replace(/(\d+(?:\.\d+)?)秒(?:のあいだ|たつまで)待つ/g,'$1秒待つ');
    text=text.replace(/まで、?ずっと待つ/g,'まで待つ').replace(/まで待ってる/g,'まで待つ');
    text=text.replace(/と(?:言わせて|いわせて|話させて)/g,'と言って');
    text=text.replace(/と(?:言わせる|いわせる|話させる|しゃべる)/g,'と言う').replace(/(\d+(?:\.\d+)?)秒間/g,'$1秒');
    text=text.replace(/(\d+(?:\.\d+)?)(?:秒で|秒かけて)(?=、?(?:いまのばしょから、?|今の場所から、?)?(?:右|左|上|下)(?:へ|に)\d+(?:\.\d+)?歩(?:移動|動))/g,'$1秒かけて、');
    text=text.replace(/(\d+(?:\.\d+)?)歩(?:走って|移動して)/g,'$1歩進んで');
    text=text.replace(/(?:いまのばしょから、?|今の場所から、?)?(右|左|上|下)(?:へ|に)(\d+(?:\.\d+)?)歩(?:移動させる|移動する|動かす|走らせる|走る|移動させて|移動して|動かして|走らせて|走って|進んで|進む|移動し(?=、)|走り(?=、))/g,(whole,direction,amount)=>'いまのばしょから、'+direction+'へ'+amount+'歩'+(/(?:て|で|し|り)$/.test(whole)?'動いて':'動く'));
    text=text.replace(/(\d+(?:\.\d+)?)秒で(?=、?いまのばしょから)/g,'$1秒かけて、').replace(/、その後/g,'、');
    text=text.replace(/(\d+(?:\.\d+)?)秒後に、?/g,'$1秒待ってから、');
    text=text.replace(/(\d+(?:\.\d+)?)秒(?:たったら|経ったら)、?/g,'$1秒待ってから、');
    text=text.replace(/(\d+(?:\.\d+)?)秒(?:休む|やすむ|休んで|やすんで)/g,(whole,n)=>n+'秒'+(whole.endsWith('で')?'待って':'待つ'));
    text=text.replace(/(^|[、。\n])(?:きえる|消える)(?=$|[、。\n])/g,'$1すがたを かくす');
    const group=/^(.+?)(?:は|も、)(.+)$/s.exec(text),members=group?.[1].split(/と|も/).filter(Boolean);
    if(members?.length>=3&&members.every(name=>names.includes(name))&&!/秒|待|ながら|あいだ/.test(group[2]))text=members.map(name=>name+'は'+group[2]).join('。\n');
    const periodic=/^(\d+(?:\.\d+)?)秒ごとに、?(.*)$/s.exec(text);
    const periodicTopic=/^(.+?)は、?$/.exec(periodic?.[2]?.trim()||'');
    if(periodicTopic&&names.includes(periodicTopic[1]))periodic[2]='';
    if(periodic)text='ずっとくり返す。\n  '+periodic[1]+'秒待つ。'+(periodic[2].trim()?'\n  '+periodic[2].trim().replace(/\n/g,'\n  '):'');
    text=text.replace(/「§(\d+)§」/g,(_,i)=>quoted[i]);
    if(text===source)return null;
    try{const parsed=parseSyntax(text,ctx);return parsed.ast?{ast:parsed.ast,text:formatScript(parsed.ast).trim()}:null;}catch{return null;}
  }
  function assistSubjectText(text, data, ctx) {
    if(!data.subject||data.headerEvent)return text;
    try{
      const parsed=parseSyntax(text,ctx),first=parsed.ast?.body?.[0];
      if(!first||first.actorRef?.kind==='named')return text;
      return sentenceActorSource({kind:data.subject==='自分'||data.subject==='体'?'self':'named',name:data.subject})+'は、'+text;
    }catch{return text;}
  }
  function assistMeaningCompatible(candidate, reference, data, ctx) {
    const body=[...(candidate.body||[]),...(candidate.rules||[])],first=body[0];
    // Unresolved negation, modality and bounds cannot be reduced to an action.
    if(/(?:のをやめ|するな(?:[。！!]|$)|しないで|したくない|ふりを|ことを禁止|(?:歩|度|秒|回)(?:未満|より少な|を超え|以内|以上|以下)(?!なら|になる|であ|のとき))/.test(data.outside)&&!(first?.kind==='NoOperation'&&/^何もしない/.test(data.outside))&&!(first?.kind==='PenCommand'&&first.op==='UP'&&/^(?:かく|書く|描く|線を引く)のをやめる$/.test(data.outside)))return false;
    if(/を\d+(?:\.\d+)?回(?:ふや|増や|へら|減ら)/.test(data.outside))return false;
    if(reference)return astEquivalent(candidate,reference.ast);
    if(/^\/\//.test(data.text))return first?.kind==='CommentLine'&&body.length===1;
    const subject=/^([^、。「」]+?)は(?=、|\d|「|右|左|上|下|待|動|進|走|話|言|しゃべ|コピー)/.exec(data.text.replace(/「([^「」]+)」(?=[はが])/g,'$1'))?.[1]||/^([^、。「」]+?)が(?=、|\d|「|右|左|上へ|下へ|待|動|進|話|言|しゃべ)/.exec(data.text)?.[1];
    const known=name=>['自分','体','みんな','全体','全員','全部'].includes(name)||data.names.some(n=>n.name===name)||ctx.symbols?.project?.components.some(c=>c.name===name);
    if(!data.subject&&subject&&!known(subject)&&!['はいけい','背景','大きさ','向き','音量','色','タイマー'].includes(subject)&&!/(?:まで|なら|れば|とき|時|あいだ)/.test(data.outside)&&!data.headerEvent&&!/(?:の|で$|この回|もし|いつ|まで|なら|れば|あいだ|うち|場合)/.test(subject))return false;
    const moved=/^([^、。「」\d]+?)を(?=(?:\d+(?:\.\d+)?(?:秒|歩|度|回)|右|左|前|後ろ|上|下|移動|進|走|動))/.exec(data.text)?.[1];
    const copied=/^([^、。「」]+?)を(?:\d+(?:回|匹|体|つ|個))?(?:コピー|複製|クローン)/.exec(data.text)?.[1];
    if(copied&&!(['自分','体'].includes(copied)||ctx.symbols?.project?.components.some(c=>c.name===copied)))return false;
    if(data.numbers.some(n=>n.unsupportedUnit))return false;
    if(moved&&!known(moved)&&!['前','後ろ','右','左','上','下','作品'].includes(moved)&&/(?:移動|進|走|動)/.test(data.outside))return false;
    // Do not guess an unknown actor or turn an unresolved time or compound
    // request into a shorter, syntactically valid command. A full reading is
    // required to associate each of these roles with its action.
    if(/(?:秒(?:間)?(?:後|あと|で|かけて)|\d+(?:\.\d+)?(?:分|時間|センチ|cm|メートル|ミリ|マス)|移動させ|走らせ|進ませ|進める|動かして|作らせ)/.test(data.outside))return false;
    const actions=data.clauses.filter(c=>/[うくぐすつぬぶむるてで]$/.test(c.text.trim())&&!/かけて$/.test(c.text.trim()));
    if(actions.length>1&&!/(?:として|という(?:手順|てじゅん)|わたして)/.test(data.outside)&&!candidate.heading&&!candidate.rules?.length&&!/(?:たら|れば|なら|とき|あいだ|まで|うちは)$/.test(data.clauses[0]?.text||'')&&!['Continue','ReturnStatement'].includes(first?.kind)&&!(first?.kind==='Ask'&&/^(?:答え|こたえ|返事)を(?:待つ|まつ|もらう)$/.test(data.clauses.at(-1)?.text||''))&&!(first?.kind==='BroadcastAndWait'&&/^(?:(?:(?:この|その)合図で)?始まったことが(?:全部)?)?(?:終わるまで)?待つ$/.test(data.clauses.at(-1)?.text||''))){
      if(body.length!==data.clauses.length)return false;
      for(let i=0;i<body.length;i++){
        const source=sentenceInfinitive(data.clauses[i].text)+'。',part=assistSeeds(source,ctx.symbols,ctx);
        let parsed=null;try{parsed=parseSyntax(source,ctx).ast;}catch{}
        const sub={...candidate,body:[body[i]]};
        if(parsed?!astEquivalent(sub,parsed):!assistMeaningCompatible(sub,assistMeaningReference(source,ctx),part,ctx))return false;
      }
      return true;
    }
    if(data.subject&&!data.headerEvent&&first){
      const expected=['自分','体'].includes(data.subject)?'self':'named';
      if(first.actorRef?.kind!==expected||expected==='named'&&first.actorRef.name!==data.subject)return false;
    }
    // A complete quoted utterance describes speech, regardless of its contents.
    if(data.strings.length&&/^と(?:言わせる|いわせる|言う|いう|話す|話させる)$/.test(data.outside.trim())){
      if(body.length!==1||first.kind!=='Say'||first.value?.kind!=='StringLiteral'||!data.strings.includes(first.value.value))return false;
    }
    if(/(?:コピー|こぴー|クローン|くろーん|複製|ふくせい|分身|ぶんしん)/.test(data.outside)&&/(?:作|つく|する|させ|増|ふや)/.test(data.outside)&&!['CloneCommand','RepeatCount'].includes(first?.kind)&&!data.headerEvent)return false;
    if(/(?:コピー|こぴー|クローン|くろーん|複製|ふくせい|分身|ぶんしん)/.test(data.outside)&&!data.headerEvent&&!['IfStatement','WaitUntil','RepeatUntil','RepeatWhile'].includes(first?.kind)){
      let command=first;while(command?.kind==='RepeatCount'&&command.body?.length===1)command=command.body[0];
      if(command?.kind!=='CloneCommand')return false;
    }
    const action=data.outside.trim();
    if(first?.kind==='WaitUntil'&&/(?:とき|時|なら|れば)/.test(action)&&!/(?:待|まつ)/.test(action))return false;
    if(/今のすがたをのこす/.test(action)&&!(first?.kind==='PenCommand'&&first.op==='STAMP'))return false;
    if(/(?:ながら|のと同時に)/.test(action))return false;
    if(/(?:秒(?:間)?(?:のあいだ|くり返す|たつまで)|秒に\d+歩|毎秒)/.test(action)&&!['ContinuousRule','WaitTime','Forever'].includes(first?.kind))return false;
    if(first?.kind==='ContinuousRule'){
      if(!/キー/.test(action)||!/(?:秒に|毎秒)/.test(action))return false;
      const distance=data.numbers.find(n=>n.unit==='歩'),seconds=data.numbers.find(n=>n.unit==='秒');
      if(distance&&first.distance?.value?.value!==distance.value||seconds&&first.seconds?.value?.value!==seconds.value)return false;
    }
    if(/動き.*(?:止|とめ)/.test(action)&&first?.kind!=='StopCommand')return false;
    if(/(?:音|おと).*(?:止|とめ|ストップ)/.test(action)&&first?.kind!=='SoundCommand')return false;
    if(/(?:止|とめ|ストップ)/.test(action)&&first?.kind==='SoundCommand'&&!first.op.startsWith('STOP'))return false;
    if(/(?:すがた|姿|色)/.test(action)&&!/(?:ペン|線|スタンプ|のこす)/.test(action)&&!['LooksCommand','IfStatement'].includes(first?.kind))return false;
    if(/(?:すがた|姿).*色|色.*(?:する|かえ)/.test(action)&&first?.kind==='PenCommand'&&!/(?:ペン|線)/.test(action))return false;
    if(/自分(?:だけ)?を(?:消|ふや)/.test(action)&&first?.kind!=='CloneCommand')return false;

    if(/(?:鳴ら|ならす|再生|聞かせ)/.test(action)&&!/(?:たら|なら|れば|とき|まで|あいだ)/.test(action)&&!['SoundCommand','RepeatCount','Forever'].includes(first?.kind))return false;
    if(/ペン/.test(action)&&!/(?:たら|なら|れば|とき|まで|あいだ)/.test(action)&&first?.kind!=='PenCommand')return false;
    if(/(?:と(?:言|話|しゃべ)|を(?:言|話))/.test(action)&&!/(?:たら|なら|れば|とき|まで|あいだ)/.test(action)&&!['Say','Ask','ForEach','RepeatCount'].includes(first?.kind))return false;
    if(data.subject&&first?.kind==='StopCommand'&&first.op!=='PART'&&!(first.op==='OWN_OTHERS'&&body.length===2&&body[1].op==='THIS'&&ctx.symbols?.project?.components.find(c=>c.id===ctx.targetId)?.name===data.subject))return false;
    if(data.subject&&/音.*(?:止|とめ)/.test(action)&&!(first?.kind==='SoundCommand'&&first.op==='STOP_PART'))return false;
    if(first?.kind==='CloneCommand'&&!/(?:コピー|こぴー|クローン|くろーん|複製|ふくせい|分身|ぶんしん)/.test(data.outside)&&!/^自分(?:だけ)?(?:を)?(?:消す|消える|ふやす)$/.test(action))return false;
    const holds=(node,kind,value)=>node&&typeof node==='object'&&(((!kind||node.kind===kind)&&(node.name===value||node.value===value))||Object.entries(node).some(([key,v])=>key!=='sourceSpan'&&v&&typeof v==='object'&&(Array.isArray(v)?v.some(n=>holds(n,kind,value)):holds(v,kind,value))));
    if(data.stringValues.filter(s=>/^[「『｢\"‘’]/.test(data.text.slice(s.at))).some(({value})=>!holds(candidate,null,value)&&!holds(candidate,null,keyWord(value))&&!JSON.stringify(candidate.heading||{}).includes(value)&&!JSON.stringify(candidate.heading||{}).includes(keyWord(value))))return false;
    for(const part of data.names.filter(n=>n.kind==='part'&&n.name!==data.subject)){
      const quoted=data.stringValues.some(s=>s.value===part.name&&/^[をにへの]/.test(data.text.slice(s.end)));
      const escaped=part.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      if(!quoted&&!new RegExp(escaped+'[をにへの]').test(data.outside))continue;
      if(!holds(candidate,'PartRef',part.name)&&!holds(candidate,'StringLiteral',part.name)&&!JSON.stringify(candidate.heading||{}).includes(part.name))return false;
    }
    if(/(?:右|左|前|後ろ|上|下)から/.test(data.outside))return false;
    if(/色の効果/.test(data.outside)&&data.numbers.length)return false;
    const distance=data.numbers.filter(n=>n.unit==='歩');
    if(distance.length&&!candidate.heading){
      if(body.length!==1)return false;
      if(first?.kind!=='MotionCommand'){if(!['ContinuousRule','RepeatCount','RepeatWhile','RepeatUntil','IfStatement'].includes(first?.kind))return false;}
      else if(distance.length>1){if(!first.x||!first.y||distance.length!==2||first.x.value?.value!==distance[0].value||first.y.value?.value!==distance[1].value)return false;}
      else {
      const direction=/(右|左|上|下|前|後ろ)(?:へ|に)/.exec(data.outside)?.[1],axis=direction&&({右:'x',左:'x',上:'y',下:'y'})[direction];
      const value=axis?first[axis]:first.args?.[0];
      if(value?.unit!=='歩'||value.value?.value!==distance[0].value)return false;
      if(axis&&first[axis+'Dir']!==({右:'right',左:'left',上:'up',下:'down'})[direction])return false;
      }
    }
    if(data.subjects)return false;
    if(/(?:一つずつ|ひとつずつ|ずつ順に|順に.*ずつ)/.test(data.outside)&&first?.kind!=='ForEach')return false;
    if(/鳴らし続ける/.test(action)&&first?.kind!=='Forever')return false;
    if(/キー/.test(action)&&['Say','Ask','Broadcast','BroadcastAndWait'].includes(first?.kind))return false;
    const cloneCount=data.numbers.filter(n=>['count','つ'].includes(n.unit));
    if(first?.kind==='CloneCommand'&&cloneCount.length&&(cloneCount.length!==1||first.count?.value!==cloneCount[0].value))return false;
    const values=(node,unit)=>{
      if(!node||typeof node!=='object')return [];
      if(node.kind==='QuantityLiteral'&&node.unit===unit)return [node.value?.value];
      if(node.kind==='TimerReset'&&unit==='秒')return [0];
      if(node.kind==='EventCount'&&unit==='回')return [node.count?.value];
      return Object.entries(node).filter(([key])=>key!=='sourceSpan').flatMap(([,v])=>Array.isArray(v)?v.flatMap(n=>values(n,unit)):values(v,unit));
    };
    for(const unit of ['歩','秒','度','％','Hz']){const available=values(candidate,unit);for(const number of data.numbers.filter(n=>n.unit===unit)){const index=available.indexOf(number.value);if(index<0)return false;available.splice(index,1);}}
    if(first?.kind==='MotionCommand'&&/移動|進む|走る|動く|動かす/.test(action)&&data.numbers.some(n=>['度','％','Hz'].includes(n.unit)))return false;
    if(/\d+(?:\.\d+)?\s*(?:％|%|パーセント|ぱーせんと)(?:大きく|小さく)/.test(action))return false;
    const count=data.numbers.filter(n=>n.unit==='回');
    if(count.length){
      if(/(?:おされる|する)まで/.test(action)){if(!values(candidate,'回').includes(count[0].value))return false;}
      else if(count.length!==1||first?.kind!=='RepeatCount'||(first.count?.value?.value??first.count?.value)!==count[0].value)return false;
    }
    const time=data.numbers.filter(n=>n.unit==='秒');
    if(time.length){
      const waiting=first?.kind==='WaitTime'&&/(?:待|まつ|休|やす)/.test(data.outside);
      const sound=first?.kind==='SoundCommand'&&/(?:鳴|なら|音)/.test(data.outside);
      const talking=first?.kind==='Say'&&/(?:話す|はなす|しゃべ|言う|いう)/.test(data.outside);
      if(time.length!==1||body.length!==1)return false;
      if(waiting||talking){if(first.seconds?.value?.value!==time[0].value)return false;}
      else if(sound){if(first.args?.[1]?.value?.value!==time[0].value&&first.args?.[1]?.value!==time[0].value)return false;}
      else if(first?.kind==='ForEach'){const say=first.body?.find(n=>n.kind==='Say');if(!say||say.seconds?.value?.value!==time[0].value)return false;}
      else if(first?.kind==='TimerReset'){if(time[0].value!==0)return false;}
      else if(first?.kind!=='ContinuousRule')return false;
    }
    return true;
  }
