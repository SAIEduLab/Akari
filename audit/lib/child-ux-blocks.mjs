import assert from 'node:assert/strict';

// This small audit interpreter implements only the seven fixed task concepts.
// Its input is measured DOM controls, not product AST, parser, compiler or blockDecode.
// Expected traces remain the pre-existing independently authored task fixture.
const displayedLabels={Say:'言う',WaitTime:'秒待つ',Ask:'たずねる',RepeatCount:'回数を決めてくり返す',IfStatement:'もし',Assignment:'値を設定','NumericUpdate:ADD':'値を足す',NoOperation:'何もしない',StringLiteral:'文字',NumberLiteral:'数','SensorRead:答え':'答え',VariableRead:'名前を読む',TargetReference:'変更先','BinaryExpression:ADD':'足す','BinaryExpression:SUB':'引く','CompareExpression:EQ':'と同じ',ListRead:'リストの要素'};
export function blockMeaning(views,project,runs,taskId){
  assert.match(taskId,/^B(?:0[1-9]|1[0-9]|2[0-4])$/,'fixed task intent required');
  assert.ok(Array.isArray(views)&&views.length,'actual block documents required');
  const scripts=project.scripts.filter(s=>s.source.trim());assert.deepEqual(views.map(v=>v.scriptId),scripts.map(s=>s.id));
  const actors=new Map(project.components.map(c=>[c.name,c.id]));actors.set(project.stage.name,'stage');
  const programs=[];
  for(const [vi,v]of views.entries()){
    assert.equal(v.selectedOwner,scripts[vi].targetId);assert.equal(v.selectedEvent,scripts[vi].event);
    assert.ok(v.nodes.length);const nodes=v.nodes;
    for(const [i,n]of nodes.entries()){
      assert.ok(n.rendered&&typeof n.title==='string'&&n.title.trim(),'rendered block label');
      if(n.schema!=='Script'){assert.ok(Object.hasOwn(displayedLabels,n.schema),'fixed task displayed command');assert.equal(n.title,displayedLabels[n.schema],'displayed label agrees with intended command');}
      assert.ok(n.parent===null||Number.isInteger(n.parent)&&n.parent>=0&&n.parent<i,'DOM parent order');
      if(n.schema.startsWith('BinaryExpression:')||n.schema.startsWith('CompareExpression:'))assert.equal(n.operator,n.schema,'visible operator agrees with block kind');
    }
    const children=(n,slot)=>nodes.filter((c,i)=>c.parent===nodes.indexOf(n)&&c.slot===slot);
    const field=(n,key)=>{assert.ok(Object.hasOwn(n.fields,key),'DOM field '+n.schema+'/'+key);return n.fields[key];};
    const ref=(n,actor,prefix='actorRef.')=>{
      const kind=n.fields[prefix+'kind'];if(kind===undefined)return actor;
      if(kind==='self')return actor;assert.equal(kind,'named');const id=actors.get(field(n,prefix+'name'));assert.ok(id,'known displayed actor');return id;
    };
    const actorName=id=>id==='stage'?project.stage.name:project.components.find(c=>c.id===id)?.name;
    for(const n of nodes.filter(n=>n.schema==='Script')){
      const actor=ref(n,v.selectedOwner,'heading.actorRef.'),event=field(n,'heading.event');
      assert.ok(['start','click'].includes(event),'fixed task event');
      assert.ok(n.title.includes(actorName(actor))&&n.title.includes(event==='start'?'開始したとき':'クリックしたとき'),'displayed actor and event');
      programs.push({actor,event,n,children,field,ref,nodes});
    }
  }
  const arithmetic={B16:['BinaryExpression:ADD',2,3],B17:['BinaryExpression:SUB',4,1],B18:['BinaryExpression:ADD',2,3]}[taskId];
  if(arithmetic){
    const say=programs.flatMap(p=>p.nodes.filter(n=>n.schema==='Say').map(n=>({p,n})));assert.equal(say.length,1,'fixed arithmetic task has one spoken expression');
    const {p,n}=say[0],value=p.children(n,'value');assert.equal(value.length,1);assert.equal(value[0].schema,arithmetic[0],'task requires the intended expression, not a fixed answer');
    for(const [i,slot]of ['left','right'].entries()){const operand=p.children(value[0],slot);assert.equal(operand.length,1);assert.equal(operand[0].schema,'NumberLiteral');assert.equal(Number(p.field(operand[0],'value')),arithmetic[i+1],'fixed arithmetic task operand');}
  }
  assert.ok(programs.length,'actual script headings required');
  return runs.map(run=>{
    const variables=new Map(project.projectData.variables.map(v=>[v.name,v.initialValue]));
    const lists=new Map(project.projectData.lists.map(v=>[v.name,[...v.initialValue]]));
    const trace=[],samples=[],questions=[],tasks=new Set(),queue=[];let now=0,answer='',pending=null,order=0,turns=0;
    const initialScore=variables.get('点数');assert.equal(initialScore,0,'fixed initial score');
    const lookup=(p,n)=>{const name=p.field(n,'name'),scope=n.fields.qualifier;assert.ok(['none','exact','project'].includes(scope),'fixed task global data scope');
      if(scope!=='project')assert.ok(!project.components.some(c=>[...c.localData.variables,...c.localData.lists].some(v=>v.name===name)),'fixed task has no shadowing local name');
      assert.ok(variables.has(name)||lists.has(name));return name;};
    const expression=(p,n)=>{
      assert.ok(n,'displayed operand required');const one=slot=>{const found=p.children(n,slot);assert.equal(found.length,1);return expression(p,found[0]);};
      switch(n.schema){
        case 'StringLiteral':return p.field(n,'value');
        case 'NumberLiteral':{const number=Number(p.field(n,'value'));assert.ok(Number.isFinite(number));return number;}
        case 'SensorRead:答え':return answer;
        case 'VariableRead':{const name=lookup(p,n);return variables.has(name)?variables.get(name):lists.get(name);}
        case 'BinaryExpression:ADD':return Number(one('left'))+Number(one('right'));
        case 'BinaryExpression:SUB':return Number(one('left'))-Number(one('right'));
        case 'CompareExpression:EQ':return one('left')===one('right');
        case 'ListRead':{const list=one('list'),index=Number(one('index'));assert.ok(Array.isArray(list)&&Number.isInteger(index)&&index>=1&&index<=list.length);return list[index-1];}
        default:throw Error('Unsupported/missing displayed task expression: '+n.schema);
      }
    };
    function* statements(p,body,actor){
      for(const n of body){
        if(++turns>10000)throw Error('Block audit operation bound');const who=p.ref(n,actor),one=slot=>{const found=p.children(n,slot);assert.equal(found.length,1);return expression(p,found[0]);};
        const seconds=()=>{assert.equal(p.field(n,'unit'),'秒');const duration=Number(p.field(n,'value'));assert.ok(Number.isFinite(duration)&&duration>=0);return duration*1000;};
        switch(n.schema){
          case 'Say':yield {kind:'say',actor:who,text:String(one('value')),duration:seconds()};yield {kind:'clear',actor:who};break;
          case 'WaitTime':yield {kind:'wait',duration:seconds()};break;
          case 'Ask':answer=yield {kind:'ask',text:String(one('question'))};break;
          case 'RepeatCount':{assert.equal(p.field(n,'unit'),'回');const count=Number(p.field(n,'value'));assert.ok(Number.isInteger(count)&&count>=0&&count<=100);for(let i=0;i<count;i++)yield* statements(p,p.children(n,'body'),who);break;}
          case 'IfStatement':assert.ok(['true','false'].includes(p.field(n,'hasElse')));yield* statements(p,p.children(n,one('condition')?'thenBody':'elseBody'),who);break;
          case 'Assignment':case 'NumericUpdate:ADD':{
            const targets=p.children(n,'target');assert.equal(targets.length,1);assert.equal(targets[0].schema,'TargetReference');const name=lookup(p,targets[0]),value=Number(one('value'));assert.ok(variables.has(name)&&Number.isFinite(value));variables.set(name,n.schema==='Assignment'?value:Number(variables.get(name))+value);break;
          }
          case 'NoOperation':break;
          default:throw Error('Unsupported/missing displayed task command: '+n.schema);
        }
      }
    }
    const schedule=(task,due)=>queue.push({task,due,order:order++});
    const resume=(task,value)=>{
      for(;;){const next=task.next(value);value=undefined;if(next.done){tasks.delete(task);return;}const e=next.value;
        if(e.kind==='ask'){assert.equal(pending,null,'single fixed task question');questions.push(e.text);trace.push({at:now,kind:'ask',text:e.text});pending=task;return;}
        if(e.kind==='say')trace.push({at:now,kind:'say',actor:e.actor,text:e.text});
        if(e.kind==='clear'){trace.push({at:now,kind:'clear',actor:e.actor});continue;}
        schedule(task,now+e.duration);return;
      }
    };
    const spawn=(event,actor)=>{for(const p of programs)if(p.event===event&&(actor===undefined||p.actor===actor)){const task=statements(p,p.children(p.n,'body'),p.actor);tasks.add(task);schedule(task,now);}};
    const pump=()=>{queue.sort((a,b)=>a.due-b.due||a.order-b.order);while(queue.length&&queue[0].due<=now){const {task}=queue.shift();resume(task);queue.sort((a,b)=>a.due-b.due||a.order-b.order);}};
    spawn('start');pump();
    for(const step of run.steps){now=step.at;if(step.click)spawn('click',step.click);if(Object.hasOwn(step,'answer')){assert.ok(pending,'displayed question before answer');const task=pending;pending=null;resume(task,step.answer);}pump();const visible={};for(const e of trace){if(e.kind==='say')visible[e.actor]=e.text;if(e.kind==='clear')delete visible[e.actor];}samples.push({at:now,visible,score:variables.get('点数')});}
    return {errors:[],initialScore,trace,samples,questions,activeTasks:tasks.size,pendingQuestion:!!pending};
  });
}
