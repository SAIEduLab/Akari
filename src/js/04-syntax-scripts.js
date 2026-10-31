  // ────────────────────────────────────────────────────────────────────────
  // 04 — Syntax parsing: script lines, headings and indentation
  // ────────────────────────────────────────────────────────────────────────
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
    const fixed=text.join(''),error=new AkariError('P205','「 」の 中で かぎを 使う ときは、『 』を 使います。れい：「『海』は何と読みますか」と言う',line.lineNo,1);
    let reads=false;try{reads=!!parseSyntax(fixed.replace(/。?$/,'。'),{symbols}).ast;}catch(attempt){if(!(attempt instanceof AkariError))throw attempt;}
    if(reads)error.proposals=[{label:'中の かぎを『 』に する',source:fixed.replace(/。$/,''),start:line.start+first,end:line.start+last+1-(raw[last]==='。'?1:0)}];
    return error;
  }
  function parseScript(source, symbols, ctx = {}) {
    if(typeof source!=='string'||cpLen(source)>LIMITS.sourceEach)throw new AkariError('P208','文字が多すぎて、これ いじょうは 書けません。文を 短くするか、ほかの 動きに 分けて ください',1,1);
    const physical=normalizeSource(source).lines,headings=[];
    for(const line of physical){if(line.continuation)continue;const nested=nestedQuoteDiagnostic(line,symbols);if(nested)throw nested;}
    // A 「, 【 or （ left open, or a ） that closes nothing, is told on the line where that mark is (F2-06 of the manuals'
    // review; it was 0, shown as 1行目): each line's code is scanned as the parser masks it, and the place is mapped back.
    for(const line of physical){
      if(line.continuation||!line.mapped.text)continue;
      try{surfaceMask(line.mapped.text);}catch(error){
        const at=error instanceof AkariError&&error.code==='P207'&&Number.isInteger(error.markAt)?line.mapped.positions[error.markAt]:undefined;
        if(at===undefined)continue;
        // The physical line the place is on (a 「 」 may go on over lines).
        const where=physical.findLast(item=>item.lineNo>=line.lineNo&&item.start<=at)||line;
        error.line=where.lineNo;error.column=surfaceColumn(where,at-where.start)+1;throw error;
      }
    }
    let previousHeading=null,headingError=null;
    for(const line of physical){
      if(line.continuation||!line.code||/^[ \t\u3000]/u.test(line.raw))continue;
      const code=line.mapped.text,mask=surfaceMask(code);let start=0,inLine=false;
      for(let i=0;i<=mask.length;i++)if(i===mask.length||mask[i]==='。'){
        if(i>start){let found=null;try{found=readSentenceHeading(code.slice(start,i),symbols,previousHeading,ctx);}catch(error){if(!(error instanceof AkariError))throw error;if(!error.proposals?.length){const slip=headingSlip(surfaceLineSlice(line,start,i),symbols,{...ctx,previousHeading});if(slip)error=slip;}if(!error.line){error.line=line.lineNo;error.column=1;}headingError??=error;}
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
    if(starts.length>LIMITS.scripts)throw new AkariError('P208','見出しが 多すぎて、これ いじょう ふやせません。いらない 見出しの 本文を けして ください',1,1);
    const units=starts.map((entry,index)=>{
      const end=starts[index+1]?.start??source.length,text=source.slice(entry.start,end);let unit;
      // A fix's place is in the whole text, as the code view applies it (the unit's own places start at its heading).
      try{unit=parseScriptUnit(text,symbols,{...ctx,previousHeading:entry.previousHeading});}catch(error){if(error instanceof AkariError){error.line=(error.line||1)+entry.lineNo-1;for(const proposal of error.proposals||[]){if(Number.isInteger(proposal.start))proposal.start+=entry.start;if(Number.isInteger(proposal.end))proposal.end+=entry.start;}}throw error;}
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
  // A そうでなければ moved right of its もし, and a line whose spaces match no line above it (F-24: the message is
  // chosen by what the line is, so it never asks for spaces the line already has).
  const OTHERWISE_INDENT_MESSAGE='「そうでなければ、」は、組に なる「もし」と 行の はじめを そろえます。この 行の はじめの 空白を へらして ください。';
  const UNALIGNED_INDENT_MESSAGE='この 行の はじめの 空白が、上の どの 行とも そろって いません。同じ まとまりに する 行と 同じ 数の 空白に して ください。';
  // A line of a heading's body written left of the body (a slip in moving it right): name the heading, with the lines
  // as they read (FM2-01). The line above is shown too when it is a sentence of the body.
  function headingBodyIndentMessage(head,above,stray){
    const sentence=text=>/[、。]$/.test(text)?text:text+'。',plain=above&&!above.inline&&!/^(?:もし|そうでなければ|でなければ|ずっと|次のことを)/.test(surfaceMask(above.code))&&!/(?:、|くり返す|繰り返す)$/.test(surfaceMask(above.code));
    return `「${head.split('\n')[0].replace(/、[^、]+、$/,'、')}」の 中の 文は、上の 文と 同じ だけ 右へ ずらして 書きます。\nれい：${[head,...(plain?['  '+sentence(writtenSentence(above))]:[]),'  '+sentence(writtenSentence(stray))].join('\n')}`;
  }
  // A heading written a little off (F-26): ▶ 動かす or a flag for the start, a part's name in 「 」 before おされたとき,
  // クリックしたとき with no part, or no 、 at its end. Each names the heading that reads; null when none applies.
  const PRESSED_HEADING='(?:が(?:押|お)され(?:た(?:とき|ら)|ると|るたびに)|を(?:押|お)し(?:た(?:とき|ら))|を(?:押|お)す(?:と|たびに)|がクリックされ(?:た(?:とき|ら)|ると|るたびに)|をクリックし(?:た(?:とき|ら))|をクリックする(?:と|たびに))';
  function headingSlip(line,symbols,ctx){
    const code=compactOutsideString(line.code||''),mask=surfaceMask(code),parts=symbols?.project?.components||[];
    if(/^この(?:キャラクター|部品)が(?:お|押)されたとき/.test(mask)){
      const owner=parts.find(c=>c.id===ctx.targetId),source=code.replace(/^この(?:キャラクター|部品)/,owner?.name||'');
      return sentenceDiagnostic('おされた 部品の 名前を 書きます。'+(owner?'れい：'+owner.name+'がおされたとき、':'部品を えらんで、その 本文に「おされたとき、」と 書きます'),line,owner?[{label:'部品の 名前を 書く',source}]:[],{kind:'Script'});
    }
    const heads=text=>{try{return !!readSentenceHeading(text,symbols,ctx.previousHeading,ctx);}catch(error){if(!(error instanceof AkariError))throw error;return false;}};
    let p=new RegExp('^(「?▶\\s*(?:動かす)?」?|旗|はた|緑の旗|みどりの旗|みどりのはた)'+PRESSED_HEADING+'、?(.*)$').exec(code);
    if(p&&!parts.some(c=>c.name===p[1])&&heads('作品を動かしたとき、'+p[2]))
      return sentenceDiagnostic('「▶ 動かす」を おした ときに 始める ときは、「作品を動かしたとき、」と 書きます',line,[{label:'「作品を動かしたとき、」に する',source:'作品を動かしたとき、'+p[2]}],{kind:'Script'});
    p=new RegExp('^「([^「」]+)」('+PRESSED_HEADING+'、?.*)$').exec(code);
    if(p&&symbols?.project&&!parts.some(c=>c.name===p[1])&&!namesStage(symbols.project,p[1]))
      return sentenceDiagnostic(`「${p[1]}」という キャラクターや 部品が 見つかりません。名前を たしかめて ください`,line,[],{kind:'Script'});
    if(p&&parts.some(c=>c.name===p[1])&&heads(nameSource(p[1])+p[2])){const source=nameSource(p[1])+p[2];
      return sentenceDiagnostic(`おされる キャラクターや 部品の 名前は、「 」で かこまずに 書きます。れい：「${nameSource(p[1])}がおされたとき、」`,line,[{label:'「 」を とる',source}],{kind:'Script'});}
    // さくひんをうごかしたとき / 作品を動かすと: the start is 作品を動かしたとき、 (FM2-11).
    p=/^(?:作品|さくひん)を(?:うごか|動か)(?:した(?:とき|ら)|すと|すとき|したら)、?(.*)$/.exec(code);
    if(p&&!/^作品を動かしたとき/.test(code)&&heads('作品を動かしたとき、'+p[1]))
      return sentenceDiagnostic('「▶ 動かす」を おした ときに 始める ときは、「作品を動かしたとき、」と 書きます',line,[{label:'「作品を動かしたとき、」に する',source:'作品を動かしたとき、'+p[1]}],{kind:'Script'});
    // 「スタート」を受けとったとき: a signal is received with 「スタート」という合図を受けたとき、.
    p=/^(「[^「」]+」)(?:を|の合図を)(?:受けとった|受け取った|うけとった|受けた|うけた|もらった)(?:とき|ら)、?(.*)$/.exec(code);
    if(p&&heads(p[1]+'という合図を受けたとき、'+p[2]))
      return sentenceDiagnostic(`合図を 受けた ときに 始める ときは、「${p[1]}という合図を受けたとき、」と 書きます`,line,[{label:'「〜という合図を受けたとき、」に する',source:p[1]+'という合図を受けたとき、'+p[2]}],{kind:'Script'});
    p=/^(?:クリックした(?:とき|ら)|クリックする(?:と|たびに)|クリックすると)、?(.*)$/.exec(code);
    if(p&&heads('おされたとき、'+p[1]))
      return sentenceDiagnostic('この 部品が おされた ときに 始める ときは、「おされたとき、」と 書きます',line,[{label:'「おされたとき、」に する',source:'おされたとき、'+p[1]}],{kind:'Script'});
    if(!/、$/.test(mask)&&/(?:とき|たびに|ごとに|たら|ると)$/.test(mask)&&heads(code+'、'))
      return sentenceDiagnostic(`見出しの おわりには「、」を 書きます。れい：${code}、`,line,[{label:'「、」を 書く',source:code+'、'}],{kind:'Script'});
    return null;
  }
  function indentWidth(prefix){return prefix.length+(prefix.match(/\u3000/gu)||[]).length;}
  function parseScriptUnit(source, symbols, ctx = {}) {
    if(typeof source!=='string'||cpLen(source)>LIMITS.sourceEach)throw new AkariError('P208','文字が 多すぎて、これ いじょうは 書けません。文を 短くするか、ほかの 動きに 分けて ください',1,1);
    const rawLines=normalizeSource(source).lines,lines=[];
    for(const line of rawLines){if(line.continuation)continue;const prefix=line.raw.match(/^[ \t\u3000]*/u)[0];if(prefix.includes('\t'))throw new AkariError('P209',INDENT_TAB_MESSAGE,line.lineNo,1);line.indent=indentWidth(prefix);const code=compactOutsideString(line.code);if(!code){lines.push(line);continue;}const mask=surfaceMask(code);let start=0;for(let i=0;i<=mask.length;i++)if(i===mask.length||mask[i]==='。'){if(i>start){const part=surfaceLineSlice(line,start,i);part.indent=line.indent;part.inline=start>0;part.comment=i===mask.length?line.comment:'';lines.push(unitRangeLine(part));}start=i+1;}}
    const baseCtx={...ctx,localNames:[...(ctx.localNames||[])],binders:[...(ctx.binders||[])],topicActor:{...(ctx.topicActor||{kind:'self'})}};
    if(ctx.definition){const names=localDeclarationNames(source);baseCtx.localNames.push(...names.vars,...names.lists);baseCtx.localVarNames=[...names.vars];for(const line of lines){const p=surfaceCapture(/^この中だけで使う(?:変数|リスト)(.+?)を(?:作り、最初は.+にする|空で作る)$/d,line.code);if(p)baseCtx.localNames.push(parsedDeclarationName(p[0].text));}}
    const nextCode=i=>{while(i<lines.length&&!lines[i].code)i++;return i;};
    const parseAt=(line,fn)=>{try{return fn();}catch(error){if(error instanceof AkariError){sentenceReadError(error,line);if(!error.line){error.line=line.lineNo;error.column=error.column||1;}}throw error;}};
    let first=nextCode(0),heading=null,headingActorRange=null,headingTargetRange=null,headingWritten=null;
    if(first<lines.length&&lines[first].indent!==0)throw new AkariError('P209','いちばん 外の 文は、行の はじめを 右へ ずらさずに 書きます',lines[first].lineNo,1);
    if(first<lines.length){const found=parseAt(lines[first],()=>{let read=null,failure=null;try{read=readSentenceHeading(lines[first].code,symbols,ctx.previousHeading,ctx);}catch(error){if(!(error instanceof AkariError)||error.proposals?.length)throw error;failure=error;}if(read)return read;const slip=headingSlip(lines[first],symbols,ctx);if(slip)throw slip;if(failure)throw failure;return null;});
      // 動かすがおされたとき / スタートボタンがおされたとき: the ▶ button is no part (FM2-14); its heading is 作品を動かしたとき、.
      const pressed=found?.heading?.event==='click'&&found.heading.actorRef?.kind==='named'?found.heading.actorRef.name:null;
      if(pressed&&/^(?:▶\s*)?(?:動かす|うごかす|スタート|はじめる)(?:ボタン)?$/.test(pressed)&&symbols?.project&&!symbols.project.components.some(c=>c.name===pressed)&&!namesStage(symbols.project,pressed)){
        const source='作品を動かしたとき、'+(found.body?.text||'');
        throw sentenceDiagnostic('「▶ 動かす」を おした ときに 始める ときは、「作品を動かしたとき、」と 書きます',lines[first],[{label:'「作品を動かしたとき、」に する',source}],{kind:'Script'});}
      if(found){heading=found.heading;const line=lines[first];headingWritten=sentenceHeadingSource(heading);if(found.body?.text)headingWritten+='\n  '+found.body.text.replace(/。?$/,'。');if(ctx.meijin&&found.bodyTopic)baseCtx.topicActor={...found.bodyTopic};if(ctx.meijin&&found.body?.text){const who=/^(【[^】]+】|[^、。「」【】\s]+?)は、(.*)$/.exec(found.body.text),bare=who&&who[1].replace(/^【(.*)】$/,'$1');if(who&&((symbols?.project?.components||[]).some(c=>c.name===bare)||dataNameKind(bare,symbols,ctx)==='variable')){baseCtx.topicActor=dataNameKind(bare,symbols,ctx)==='variable'?{kind:'value',value:exprNode('VariableRead',{name:bare,qualifier:null})}:{kind:'named',name:bare};found.body={...found.body,text:who[2],start:found.body.end-who[2].length};}}if(found.actor)headingActorRange=sourceRange(line.mapped?.positions||[],found.actor.start,found.actor.end);if(found.target)headingTargetRange=sourceRange(line.mapped?.positions||[],found.target.start,found.target.end);if(found.body.text){const body=surfaceLineSlice(line,found.body.start,found.body.end);const following=lines.find((entry,index)=>index>first&&entry.lineNo!==line.lineNo&&entry.code);const headingIndent=following?.indent>0?following.indent:2;body.indent=headingIndent;body.comment=line.comment;lines.splice(first,1,body);for(let j=first+1;j<lines.length&&lines[j].lineNo===line.lineNo;j++)lines[j].indent=headingIndent;}else lines.splice(first,1);first=nextCode(first);if(first<lines.length&&lines[first].indent===0)throw new AkariError('P202','「作品を動かしたとき、」などの 次の 行は、行の はじめを 右へ ずらして 書きます',lines[first].lineNo,1);}}
    const rules=[];
    function block(start,indent,scope,depth){
      if(depth>LIMITS.blockDepth)throw new AkariError('P208','「もし」や「くり返す」の 中に、ブロックが 重なりすぎて います。いくつかの 動きに 分けて ください',lines[start]?.lineNo||1,1);
      // 名人: each line of a 並び starts from the subject before the 並び (the lines run side by side, R15).
      const laneTopic=scope.laneTopic;
      scope={...scope,topicActor:{...scope.topicActor},laneTopic:undefined};
      const nodes=[];let i=start,previousSentenceStart=null,tagLine=-1;
      // Each statement remembers the sentence it was read from (名人: one sentence is one lane).
      // Only the statements added since the last call are new (the list is only appended to, or cut at its end).
      let tagged=0;
      const tag=()=>{if(tagged>nodes.length)tagged=nodes.length;for(;tagged<nodes.length;tagged++){const n=nodes[tagged];if(!STATEMENT_LINE.has(n))STATEMENT_LINE.set(n,tagLine);}};
      while(i<lines.length){tag();tagLine=i;const line=lines[i];if(laneTopic)scope.topicActor={...laneTopic};if(!line.code){if(line.comment)nodes.push(statementNode('CommentLine',line,{text:line.comment.slice(1),raw:line.raw,actorRef:{...scope.topicActor}}));i++;continue;}if(line.indent<indent)break;if(line.indent>indent){const before=lines.slice(0,i).reverse().find(entry=>entry.code);throw new AkariError('P209',/^(?:そうでなければ|でなければ)/.test(surfaceMask(line.code))?(lines.slice(0,i).some(entry=>entry.indent<line.indent&&/^もし/.test(surfaceMask(entry.code||'')))?OTHERWISE_INDENT_MESSAGE:'「そうでなければ、」と 組になる「もし」が ありません。「もし」と 行の はじめを そろえて ください'):depth>0?'同じ まとまりの 文は、行の はじめの 空白の 数を そろえて ください':!before||line.indent>before.indent?'前の 行と 同じ だけ 右へ ずらします。この 行の はじめの 空白を へらして ください。':UNALIGNED_INDENT_MESSAGE,line.lineNo,1);}
        const local={...scope,sourceLine:line,lineNo:line.lineNo};
        if(scope.meijin){
          const read=parseAt(line,()=>readMeijinLine(line,{symbols,scope:local,lines,top:depth===0,index:i,indent,nextCode,children:(at,childScope)=>block(at,lines[at].indent,childScope,depth+1)}));
          if(read?.rewrite){lines[i]=read.rewrite;continue;}
          if(read){if(scope.meijin&&line.meijinOwned)for(const p of read.nodes)STATEMENT_EXPLICIT_ACTORS.delete(p);if(scope.meijin)meijinLaneRefs(read.nodes,scope.topicActor);previousSentenceStart=nodes.length;nodes.push(...read.nodes);scope.topicSet=read.nodes.some(n=>['Parallel','ParallelEach','ForEach'].includes(n.kind));for(const part of read.nodes)if(STATEMENT_EXPLICIT_ACTORS.has(part))scope.topicActor=topicOf(part.actorRef);if(scope.meijin&&!read.nodes.some(p=>STATEMENT_EXPLICIT_ACTORS.has(p)))scope.topicActor=meijinTopicAfter(read.nodes,scope.topicActor);if(scope.meijin){const named=new Set(read.nodes.filter(p=>STATEMENT_EXPLICIT_ACTORS.has(p)).map(p=>JSON.stringify(topicOf(p.actorRef))));if(named.size>1)scope.topicActor={kind:'self',topicEnded:true};}i=read.index;continue;}
        }
        const repeatPrevious=surfaceCapture(/^これを(.+?)回(?:くり返す|くり返します|繰り返す|繰り返します)$/d,line.code);
        if(repeatPrevious){
          if(previousSentenceStart===null||previousSentenceStart>=nodes.length)throw sentenceDiagnostic('「これを」の すぐ前の 行に、くり返したい 一文を 書いて ください',line,[],{kind:'RepeatCount',missing:['precedingSentence']});
          const body=nodes.splice(previousSentenceStart),part=repeatPrevious[0],count=sentenceQuantity(parseMappedExpression(part.text,line.code,line,symbols,local,part.start),'回');
          const repeat=statementNode('RepeatCount',line,{count,body,actorRef:{...scope.topicActor}});REPEAT_PREVIOUS.add(repeat);
          const range=SOURCE_RANGES.get(body[0])?.range,location=SOURCE_RANGES.get(repeat);
          if(range&&location){location.range={start:range.start,end:location.range.end};location.extent.start=range.start;}
          nodes.push(repeat);previousSentenceStart=null;i++;continue;
        }
        if(surfaceMask(line.code).startsWith('くり返しが終わると、')&&nodes.at(-1)?.kind!=='RepeatCount')throw sentenceDiagnostic('「くり返しが終わると」の すぐ前に、回数の ある くり返しを 書いて ください',line,[],{kind:'Sequence',missing:['precedingRepeat']});
        // まず、 / さいしょに、 on a line of its own (FM2-07): an order word is said with what is done, on its line. At the
        // place of a heading, with the lines under it moved right, it stands for 作品を動かしたとき、.
        const orderWord=new RegExp('^('+LEAD_WORDS+')、?$').exec(surfaceMask(line.code));
        if(orderWord){const under=lines[nextCode(i+1)];
          if(depth===0&&!heading&&!ctx.definitionKind&&!ctx.definition&&under&&under.indent>indent)throw sentenceDiagnostic(`「${orderWord[1]}、」は 見出しでは ありません。「▶ 動かす」を おした ときに 始める ときは、「作品を動かしたとき、」と 書きます`,line,[{label:'「作品を動かしたとき、」に する',source:'作品を動かしたとき、'}],{kind:'Script'});
          throw sentenceDiagnostic(`「${orderWord[1]}、」の あとに、する ことを 同じ 行に 書きます。れい：${orderWord[1]}、前へ10歩進む。`,line,[],{kind:'Sequence'});}
        let previousCode=i-1;while(previousCode>=0&&!lines[previousCode].code)previousCode--;
        try{parseAt(line,()=>diagnoseSentenceIntent(line,symbols,local,lines[previousCode]?.indent===indent?lines[previousCode]:null,lines[nextCode(i+1)]?.indent===indent?lines[nextCode(i+1)]:null,source));}
        catch(error){
          // 点数が10になったら、 with its body on the lines below (CC-266): the wait is offered for the whole block, the
          // heading line becoming the wait and the body lines moving out one level, so the result reads.
          const under=lines[nextCode(i+1)];
          if(error instanceof AkariError&&error.draftRole?.missing?.includes('mode')&&error.proposals?.length===1&&under&&under.indent>indent){
            const until=error.untilSource;let last=i+1;
            for(let k=i+1;k<lines.length&&(!lines[k].code||lines[k].indent>indent);k++)if(lines[k].code)last=k;
            const physical=rawLines.filter(entry=>!entry.continuation&&entry.lineNo>line.lineNo&&entry.lineNo<=lines[last].lineNo),shift=under.indent-indent;
            const moved=physical.map(entry=>{const lead=entry.raw.match(/^[ 　]*/u)[0],width=indentWidth(lead);return entry.raw.trim()?' '.repeat(Math.max(0,width-shift))+entry.raw.slice(lead.length):'';});
            const source=until+'\n'+moved.join('\n'),end=physical.at(-1)?.end;
            if(until&&typeof end==='number'){
              let readable=false;try{readable=!!parseScriptUnit([until,...moved.map(text=>text.slice(indent))].join('\n'),symbols,{...ctx,previousHeading:null});}catch(attempt){if(!(attempt instanceof AkariError))throw attempt;}
              if(readable)error.proposals=[...error.proposals,{label:'そう なるのを 待ってから する',source,start:error.proposals[0].start,end}];
            }
          }
          throw error;
        }
        // It always waits with the whole flow; みんなは in front says the same.
        if(/^(?:(?:みんな|全体)(?:は|が|で|も)、?)?(?:その合図で始まったことが|その知らせを受けて始めたことが)(?:全部|ぜんぶ|すべて)終わるまで待つ$/.test(line.code)){
          const previous=[...nodes].reverse().find(node=>node.kind!=='CommentLine');
          if(previous?.kind!=='Broadcast')throw sentenceDiagnostic('「その合図」は、すぐ前の 行で 送った 合図の ことです。すぐ前の 行に、合図を 送る 文を 書いて ください。れい：「スタート」の合図を送る。',line,[],{kind:'WaitBroadcastGroup',missing:['precedingBroadcast']});
          const broadcastRef=previous.broadcastRef||`broadcast-${previous.sourceSpan.startLine}-${previous.sourceSpan.startColumn}`;
          previous.broadcastRef=broadcastRef;
          nodes.push(statementNode('WaitBroadcastGroup',line,{broadcastRef}));i++;continue;
        }

        if(line.code==='ここまで')throw new AkariError('P203','「ここまで」は 書きません。次の 文の 行の はじめを 左へ もどすと、まとまりが おわります',line.lineNo,1);
        const rule=parseAt(line,()=>{try{return readContinuousSentence(line.code,line,symbols,local);}catch(error){if(error.draftRole?.kind==='ContinuousRule'){const next=lines[nextCode(i+1)],speed=next?surfaceCapture(/^(.+?秒に.+?歩の速さで)(?:動かす|動く)$/d,next.code):null;if(speed&&next.indent===indent){const motion=/(?:動き続ける|動かし続ける)$/.exec(surfaceMask(line.code));if(motion){const range=sourceRange(line.mapped.positions),last=sourceRange(next.mapped.positions);error.proposals=[{label:'2つの文を1つの「つづけて動くルール」にまとめる',source:line.code.slice(0,motion.index)+speed[0].text+motion[0],start:range.start,end:last.end}];}}}throw error;}});if(rule){if(depth!==0)throw new AkariError('P205','つづけて 動く ルールは、「もし」や「くり返す」の 中には 書けません。いちばん 外に 書いて ください',line.lineNo,1);rules.push(rule);i++;continue;}
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
        if(!head.inlineBody&&(firstChild>=lines.length||lines[firstChild].indent<=indent))throw Object.assign(sentenceDiagnostic('「もし」や「くり返す」の 中に、する ことを 書いて ください。何も しない ときは「何もしない」と 書けます。\nれい：2回くり返す。\n  「やあ」と言う。',line,[],{kind:head.kind,missing:['body']}),{code:'P202'});
        if(head.inlineBody&&firstChild<lines.length&&lines[firstChild].indent>indent)throw new AkariError('P209','中の 文を、同じ 行と 次の 行の 両方に 書かないで ください',lines[firstChild].lineNo,1);
        const child=head.inlineBody?{nodes:head.inlineBody,index:i+1}:block(childStart,lines[firstChild].indent,childScope,depth+1);
        const fields={...head,actorRef:{...controlActor}};delete fields.kind;delete fields.inlineBody;
        if(!child.nodes.some(n=>n.kind!=='CommentLine'))throw new AkariError('P202','中に、する ことの 文が ありません。何も しない ときは「何もしない」と 書けます',line.lineNo,1);
        i=child.index;
        if(head.kind==='IfStatement'){fields.thenBody=child.nodes;fields.elseBody=[];fields.hasElse=false;fields.elseComment='';
          const branchIndex=nextCode(i),branchLine=lines[branchIndex],peek=()=>parseAt(branchLine,()=>readBlockHead(branchLine.code,symbols,{...childScope,sourceLine:branchLine,lineNo:branchLine.lineNo}));
          // 名人: the next line may be a 名人 sentence (read in its turn); only そうでなければ is looked for here.
          const sibling=branchLine?.indent!==indent?null:scope.meijin?(()=>{try{return peek();}catch(error){if(!(error instanceof AkariError))throw error;return null;}})():peek();
          if(sibling?.kind==='Else'){
            for(let j=i;j<branchIndex;j++)if(lines[j].comment)fields.thenBody.push(statementNode('CommentLine',lines[j],{text:lines[j].comment.slice(1),raw:lines[j].raw,actorRef:{...scope.topicActor}}));
            i=branchIndex;const otherwise=lines[i],begin=nextCode(i+1);if(!sibling.inlineBody&&(begin>=lines.length||lines[begin].indent<=indent))throw new AkariError('P202','「そうでなければ、」の 次の 行に、する ことを 書いて ください。\nれい：「そうでなければ、\n  「はずれ」と言う。」',otherwise.lineNo,1);const other=sibling.inlineBody?{nodes:sibling.inlineBody,index:i+1}:block(i+1,lines[begin].indent,childScope,depth+1);fields.hasElse=true;fields.elseComment=sibling.inlineBody?'':otherwise.comment;fields.elseBody=other.nodes;i=other.index;}}
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
    if(result.index<lines.length){const stray=lines[result.index];if(heading&&stray.indent<indent&&!/^(?:そうでなければ|でなければ)/.test(surfaceMask(stray.code||'')))throw new AkariError('P209',headingBodyIndentMessage(headingWritten||sentenceHeadingSource(heading),lines.slice(0,result.index).reverse().find(entry=>entry.code&&entry.indent===indent),stray),stray.lineNo,1);throw new AkariError('P204','「そうでなければ、」と 組になる「もし」が ありません。「もし」と 行の はじめを そろえて ください',stray.lineNo,1);}
    const point=offset=>{let lo=0,hi=rawLines.length;while(lo+1<hi){const mid=(lo+hi)>>1;if(rawLines[mid].start<=offset)lo=mid;else hi=mid;}return {line:rawLines[lo].lineNo,column:surfaceColumn(rawLines[lo], offset - rawLines[lo].start)+1};};
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
    if(!code||(!calc&&!/^この 文は 読めません/.test(error.message)&&!/^「[\s\S]*」は 読めません。書き方を たしかめて ?ください。$/.test(error.message)))return;
    if(calc){const at=code.lastIndexOf(calc[1]);
      if(at>0&&insideParens(code,at)){error.message=`計算の「${calc[1]}」の ところが 読めません。書き方を たしかめて ください`;return;}}
    error.message=`「${writtenSentence(line)}」は 読めません。書き方を たしかめて ください。`;
  }
  // 計算 is the text inside （ ） (F-26): a 「 」 is words, even when the reader looked into it.
  function insideParens(code,at){
    let depth=0,quote=0;
    for(let i=0;i<at;i++){const ch=code[i];if(ch==='「')quote++;else if(ch==='」'&&quote)quote--;else if(!quote&&ch==='（')depth++;else if(!quote&&ch==='）'&&depth)depth--;}
    return depth>0;
  }
  // The sentence as the child wrote it, with its spaces (F-26: a message quotes what was written); the read text when
  // the line was put in place of what was written.
  function writtenSentence(line){
    const code=compactOutsideString(line.code||''),positions=line.mapped?.positions,base=line.physicalStart??line.start;
    if(line.rewritten||!positions?.length||typeof line.raw!=='string'||typeof base!=='number')return code;
    const text=line.raw.slice(positions[0]-base,positions[positions.length-1]-base+1).trim();
    return compactOutsideString(text)===code?text:code;
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
      if(tail?.text&&tail.text!=='次のことをする'&&/(?:なら、|ことを.+回)/.test(surfaceMask(tail.text)))throw new AkariError('P201','「もし」や「くり返す」の 中に 重ねる ときは、次の 行に 書いて、行の はじめを 右へ ずらして ください');
      return {kind:'IfStatement',condition,...(tail?.text&&tail.text!=='次のことをする'?{inlineBody:inline(tail)}:{})};
    }
    // 次のことを10回くり返す (an old form) names the form to write.
    if((parts=surfaceCapture(/^次のことを(.+?回)(?:くり返す|繰り返す|くりかえす|くり返します|繰り返します|くりかえします)$/d,code)))
      throw sentenceDiagnostic('「次のことを」は 書きません。くり返すことは 次の 行に 右へ ずらして 書きます',line,[{label:'次のことを を けす',source:`${parts[0].text}くり返す`}],{kind:'RepeatCount'});
    if((parts=surfaceCapture(/^(?!次のことを)(.+)ことを(.+)回(?:くり返す|繰り返す|くりかえす|くり返します|繰り返します|くりかえします)$/d,code))) {
      if(/ことを/.test(surfaceMask(parts[0].text)))throw new AkariError('P201','くり返しの 中に くり返しを 重ねる ときは、次の 行に 書いて、行の はじめを 右へ ずらして ください');
      return {kind:'RepeatCount',count:sentenceQuantity(e(parts[1]),'回'),inlineBody:inline(parts[0])};
    }
    if((parts=surfaceCapture(/^(?!次のことを)(.+)ことをずっと(?:くり返す|繰り返す|くりかえす|くり返します|繰り返します|くりかえします)$/d,code)))return {kind:'Forever',inlineBody:inline(parts[0])};
    if((parts=surfaceCapture(/^(.+(?:あいだ|間|まで))、(?!次のことを)(.+)ことを(?:くり返す|繰り返す|くりかえす|くり返します|繰り返します|くりかえします)$/d,code))){const clause=readConditionClause(parts[0].text,symbols,ctx);if(clause)return {kind:clause.mode==='while'?'RepeatWhile':'RepeatUntil',condition:clause.condition,inlineBody:inline(parts[1])};}
    if(/^(?:次のことを)?ずっと(?:くり返す|繰り返す|くりかえす|くり返します|繰り返します|くりかえします)$/.test(mask))return {kind:'Forever'};
    if((parts=surfaceCapture(/^(?:次のことを)?(.+)回(?:だけ)?(?:、次のことを|、)?(?:くり返す|繰り返す|くりかえす|くり返します|繰り返します|くりかえします)$/d,code)))return {kind:'RepeatCount',count:sentenceQuantity(e(parts[0]),'回')};
    if((parts=surfaceCapture(/^(.+?)(?:の中身)?を(?:先頭から)?(?:一つずつ|1つずつ)見て、次のことを(?:行う|行います)$/d,code)))return {kind:'ForEach',list:e(parts[0]),binder:'今見ているもの'};
    if((parts=surfaceCapture(/^(.+)の各要素を(.+)として、?(?:次のことを)?(?:くり返す|繰り返す|くりかえす)$/d,code)))return {kind:'ForEach',list:e(parts[0]),binder:parsedDeclarationName(parts[1].text)};
    if((parts=surfaceCapture(/^(.+(?:あいだ|間|まで))、?(?:次のことを)?(?:くり返す|繰り返す|くりかえす|くり返します|繰り返します|くりかえします)$/d,code))){const clause=readConditionClause(parts[0].text,symbols,ctx);return {kind:clause.mode==='while'?'RepeatWhile':'RepeatUntil',condition:clause.condition};}
    // A repeat count precedes the first clause separator. 回 in a later 回って is a rotation, not a count.
    const countPrefix=mask.slice(0,mask.indexOf('、')<0?mask.length:mask.indexOf('、'));
    for(let at=countPrefix.indexOf('回');at>=0;at=countPrefix.indexOf('回',at+1)){
      if(!at)continue;
      try{e({text:code.slice(0,at),start:0,end:at});}catch(error){if(!(error instanceof AkariError))throw error;continue;}
      const tail=surfaceCapture(/^((?:.*)(?:進んで|すすんで|動いて|うごいて))、(.+)$/d,code.slice(at+1));
      if(!tail)continue;
      const count=code.slice(0,at),first=sentenceInfinitive(tail[0].text),last=tail[1].text;
      throw sentenceDiagnostic('どこまでを くり返すのか 分かりません。えらんで ください',line,[{label:'前の 動きだけを くり返す',source:`${count}回くり返す。\n  ${first}。\n${last}`},{label:'2つの 動きを くり返す',source:`${count}回くり返す。\n  ${first}。\n  ${last}`}],{kind:'RepeatCount',missing:['scope']});
    }
    // 〜たら without もし: now (もし), once by waiting (〜まで待つ), or each time (an event's heading)? The three meanings,
    // as for 〜にふれたら (C-09); the fixes are offered only when they read (もしゲームが始まったら does not).
    const taraMessage='「〜たら」は、いくつかの 意味に とれます。いま そう なって いるかを しらべるなら「もし〜なら、」、そう なるまで 待つなら「〜まで待つ。」、そうなる たびに するなら「〜がおされたとき、」のような きっかけの 見出しで 書きます';
    if((parts=surfaceCapture(/^((?!もし).+?たら)、(.*)$/d,code))&&!/(?:になったら|終わったら|小さくなったら)/.test(mask)){
      const rest=parts[1]?.text||'',choices=[];
      const readsAs=text=>{for(const source of [text+'。',text.replace(/、?$/,'、')+'\n  何もしない。']){try{if(parseSyntax(source,{symbols}).ast)return true;}catch(error){if(!(error instanceof AkariError))throw error;}}return false;};
      try{const condition=parseCondition('もし'+parts[0].text,symbols,ctx,'if');
        choices.push({label:'いま そう なって いるかを しらべる',source:'もし'+formatCondition(condition,'if')+'、'+rest});
        if(rest)choices.push({label:'そう なるまで 待つ',source:formatCondition(condition,'until')+'待って、'+rest});
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
      // Only a sentence that ends with 入れる is looked at: the patterns go back over every に and を, which took
      // seconds on a long line of 点数に (language-boundaries).
      if(!/(?:入れる|いれる|入れます|いれます)$/.test(text))return null;
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
      if (!name) throw new AkariError('E703', ctx.meijin ? 'この「拡張」の 命令が 見つかりません。かくちょうの 名前を たしかめて ください' : 'この「拡張」の ブロックが 見つかりません。かくちょうの 名前を たしかめて ください', line.lineNo, 1);
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
        throw sentenceDiagnostic(`「〜まで」の 前の「${word}」は、だれが どう なるまで なのかが 分かりません。みんなで 待つ ときは「${word.replace(/が$/,'は')}」と 書くか、何も 書かずに「〜まで待つ」と 書きます`,working,[],{kind:'WaitUntil',missing:['condition']});
      let node=null;try{node=readSurfaceStatement(part.code,part,symbols,{...ctx,sentenceActor:null});}catch(error){if(!(error instanceof AkariError))throw error;}
      if(!node){try{node=parseLegacySimpleStatement(part,symbols,ctx);}catch(error){if(!(error instanceof AkariError))throw error;}}
      if(node&&EVERYONE_WAITS.has(node.kind)){node.actorRef={kind:'all'};return node;}
      if(node?.kind==='Ask')throw sentenceDiagnostic('たずねる ときは、たずねる キャラクターや 部品の 名前を 書きます。答えが 出るまでは、いつも みんなが 待ちます',working,[],{kind:'Ask',missing:['actor']});
      if(/待つ$/.test(surfaceMask(part.code)))throw sentenceDiagnostic(`この「待つ」の 文は 読めません。「${word}」の あとの 書き方を たしかめて ください`,working,[],{kind:'Sequence'});
      throw sentenceDiagnostic(`「${word}」と 書けるのは「待つ」の 文だけです。動く キャラクターや 部品の 名前を 書いて ください`,working,[],{kind:'Sequence',missing:['actor']});
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
        if(!putBody.variable)throw sentenceDiagnostic('「〜に〜を入れる」では、さいごに入れるのか、何番目かと 入れかえるのか 分かりません。えらんで ください',working,[{label:'さいごに入れる',source:`${parts[0].text}は、${putBody[0].text}のさいごに${putBody[1].text}を入れる`},{label:'どれかと 入れかえる（何番目かを えらぶ）',source:`${parts[0].text}は、${putBody[0].text}の〔番号を入れる〕番目を${putBody[1].text}にかえる`}],{kind:'ListMutation',target:putBody[0].text,missing:['operation','indexIfReplace']});
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
    if(unclear)throw sentenceDiagnostic('「〜に〜を入れる」では、さいごに入れるのか、何番目かと 入れかえるのか 分かりません。えらんで ください',working,[{label:'さいごに入れる',source:`${unclear[0].text}の最後に${unclear[1].text}を入れる`},{label:'どれかと 入れかえる（何番目かを えらぶ）',source:`${unclear[0].text}の〔番号を入れる〕番目を${unclear[1].text}にかえる`}],{kind:'ListMutation',target:unclear[0].text,missing:['operation','indexIfReplace']});
    // 10秒後に右へ10歩動く: the move is written as the code writes it (いまのばしょから、右へ10歩動く), so the
    // second sentence of the fix reads too.
    const delayed=surfaceCapture(/^(.+)秒後に、?(.+)$/d,code);
    if(delayed){
      const rest=delayed[1].text,readable=text=>{try{return !!parseSyntax(text+'。',{symbols}).ast;}catch(error){if(!(error instanceof AkariError))throw error;return false;}};
      const then=[rest,'いまのばしょから、'+rest].find(readable);
      throw sentenceDiagnostic('待ってから 動く ときは、「待つ」と「動く」の 2つの 文に 分けます',working,[{label:'待ってから次の動きをする',source:`${delayed[0].text}秒待つ。\n${then?canonicalStatementSource(then,symbols):rest}`}],{kind:'Sequence',missing:['motionDestinationIfAbsent']});
    }
    if(directError)throw directError;
    // The preserved advanced spellings are parsed structurally by the original finite parser.
    try {const legacy=parseLegacySimpleStatement(working,symbols,ctx);legacy.actorRef={...(ctx.topicActor||{kind:'self'})};return everyoneWait(legacy,ctx);}
    catch(error){
      if(!(error instanceof AkariError))throw error;
      if(/^[\p{L}ー]+(?:する|しよう)$/u.test(code)&&symbols?.actions?.size){
        const proposals=[...symbols.actions.values()].map(def=>({label:`「${def.name}」のブロックを使う`,source:(def.args.length?def.args.map(arg=>`${nameSource(arg)}を〔${arg}を入れる〕`).join('、')+'として、':'')+`【${def.name}】という手順を行う`}));
        throw sentenceDiagnostic('この「〜する」という 短い よび方は、まだ 決めて いません。使う ブロックを えらぶか、自分で 作った ブロックで よび方を 決めて ください',working,proposals,{kind:'UserActionCall',missing:['registeredCallPhrase']});
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
    // The place of the mark that is left open, or of a ） that closes the wrong one, goes with P207 (markAt).
    const out = text.split(''), stack = [], opens = [];
    let quote = '', quoteAt = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        out[i] = '\u0001';
        if (['」','』'].includes(quote) && ch === '\\') {
          if (!['\\',quote==='』'?'『':'「',quote].includes(text[i+1])) throw new AkariError('N103','「 」の 中の \\ の つぎには、\\ か「 か 」しか 書けません。\\ を 文字として 使う ときは \\\\ と 書きます');
          out[++i] = '\u0001'; continue;
        }
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === '※') { for(let j=i;j<text.length;j++) out[j]='\u0001'; break; }
      if (ch === '「' || ch === '『' || ch === '【') {
        quote = ch === '「' ? '」' : ch === '『' ? '』' : '】'; quoteAt = i;
        out[i] = '\u0001';
        continue;
      }
      if (ch === '（' || ch === '［') {
        stack.push(ch === '（' ? '）' : '］'); opens.push(i);
        out[i] = '\u0001';
      } else if (ch === '）' || ch === '］') {
        opens.pop();
        if (stack.pop() !== ch) throw Object.assign(new AkariError('P207', 'かっこの 開く しるしと とじる しるしが 合って いるか たしかめて ください'), { markAt: i });
        out[i] = '\u0001';
      } else if (stack.length) out[i] = '\u0001';
    }
    if (quote || stack.length) throw Object.assign(new AkariError('P207', '「 」・【 】・（ ）などの とじる しるしを 書いて ください'), { markAt: quote ? quoteAt : opens[0] });
    return out.join('');
  }
  function readLegacySurfaceStatement(code, line, symbols, ctx) {
    // Restrict dispatch before scanning. Standard statements retain their diagnostics.
    if (!/(?:代入する|加える|足す|引く|増やす|減らす|追加する|挿入する|削除する|入れる|回る|鳴らす|鳴らし、終わるまで待つ|と聞いて待つ)$/.test(code)) return null;
    const mask = surfaceMask(code), e = (t, start) => parseMappedExpression(t, code, line, symbols, ctx, start);
    const once = marker => mask.indexOf(marker) >= 0 && mask.indexOf(marker) === mask.lastIndexOf(marker);
    if (mask.includes('秒、') && /(?:鳴らす|鳴らし、終わるまで待つ)$/.test(mask) && (!once('秒、') || !once('Hzの音を')))
      throw new AkariError('P205','秒と 音の 高さ（Hz）は 1つずつ 書いて ください。れい：440Hzの音を0.2秒鳴らす');
    if (mask.endsWith('に入れる') && !once('を'))
      throw new AkariError('P205','入れる 中身と 入力らんを 1つずつ 書いて ください');
    const target = (text, start) => {
      const t = parseTargetPrefix(text, symbols, ctx);
      if (!t || t.len !== text.length) throw new AkariError('P205', 'かえる ものの 名前と「に」「を」などの 書き方を たしかめて ください。れい：点数を1ふやす');
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
        if (!d || !destination.slice(d.len).startsWith('の')) throw new AkariError('P205','どの リストの 何番目かを 書いて ください。れい：【くだもの】の1番目に「りんご」を入れる');
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
            '自分で 作った ブロックの 名前が 読めません。名前を【 】で かこんで ください。れい：「【ジャンプ】というてじゅんを行う」',
            line.lineNo,
            1,
          );
        if (raw === name && !bareName(name))
          throw new AkariError(
            'P201',
            'この 名前は【 】で かこんで ください。れい：「【ジャンプ】というてじゅんを行う」',
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
    // A name before を…にする (and the list and number forms below) is the data changed; any other sentence has no
    // such name, so a word at its start is not asked to be put in 【 】 (作品を動かしたとき, 右へ動いたりする).
    let t = null, unreadName = false;
    try { t = parseTargetPrefix(code, symbols, ctx); }
    catch (error) { if (!(error instanceof AkariError) || error.code !== 'P205' || /(?:を追加する|を挿入する|番目を削除する|を空にする|を足す|を引く|にする)$/.test(code)) throw error; unreadName = true; }
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
    throw Object.assign(new AkariError('P201', `「${line.code}」は 読めません。書き方を たしかめて ください。`, line.lineNo, 1), unreadName ? { unreadName } : {});
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
          throw new AkariError('P208', '計算の 中に 計算が 入りすぎて います。短い 計算に 分けて ください', lineNo, i + 1);
      } else if (ch === '）' || ch === '］') {
        if (stack.pop() !== (ch === '）' ? '（' : '［'))
          throw new AkariError('P207', '入れる ものの かっこが 合って いません。（ は ）で、［ は ］で とじて ください', lineNo, i + 1);
      } else if (ch === '、' && !stack.length) {
        parts.push(inner.slice(start, i));
        start = i + 1;
      }
    }
    if (inStr)
      throw new AkariError('N101', '「 」の とじる しるしを 書いて ください', lineNo, inner.length + 1);
    if (stack.length)
      throw new AkariError('P207', '入れる ものの かっこが とじて いません。（ は ）で、［ は ］で とじて ください', lineNo, inner.length + 1);
    parts.push(inner.slice(start));
    return parts.map((x) => parseExpression(x, symbols, { ...ctx, lineNo }));
  }
  // The structural editing vocabulary is shared by validation and the pure block codec.
  // Positions belong to the returned nodeMap; blocks never carry source or a hidden AST.
  // Command presentation contract: one entry owns its label, argument order and canonical source.
  // Parser and runtime remain independent semantic checks; every operation is covered by the existing ledger.

