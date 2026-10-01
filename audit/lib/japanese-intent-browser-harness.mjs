// Browser-side adapter for established public Akari APIs. This does not evaluate
// a substitute AST interpreter: every command goes through the actual scheduler.
export function browserScenario({scenario:s,mode='source',projectOnly=false}) {
  const A=globalThis.Akari,copy=x=>JSON.parse(JSON.stringify(x));
  const demand=(v,m)=>{if(!v)throw Error(m);};
  const p=A.makeDefaultProject(),cat=p.components.find(c=>c.id==='sprite-1');
  demand(cat,'fixture needs the default sprite');
  Object.assign(cat,{name:'ねこ',x:0,y:0,direction:s.direction??0});
  for(const [id,name,x]of [['intent-dog','犬',100],['intent-bird','鳥',200]])p.components.push({...copy(cat),id,name,x,direction:0,costumeId:id+'-costume-'+cat.costumes.findIndex(c=>c.id===cat.costumeId),costumes:cat.costumes.map((c,i)=>({...copy(c),id:id+'-costume-'+i})),localData:{variables:[],lists:[]}});
  const variables={点数:0,長さ:99,合計:0,保存名:'',かぎ:false,赤接触:false,青接触:false,...s.vars};
  for(const [name,initialValue]of Object.entries(variables)){
    const existing=p.projectData.variables.find(v=>v.name===name);
    if(existing)existing.initialValue=initialValue;
    else p.projectData.variables.push({id:'intent-var-'+p.projectData.variables.length,name,initialValue});
  }
  for(const [name,initialValue]of Object.entries(s.lists||{}))p.projectData.lists.push({id:'intent-list-'+p.projectData.lists.length,name,initialValue});
  for(const [kind,items]of [['actions',s.actions],['functions',s.functions]])p[kind]=(items||[]).map((v,i)=>({id:'intent-'+kind+'-'+i,ownerId:'stage',...v}));
  p.name='独立意図 '+s.id;
  p.scripts=[{id:'intent-main',targetId:s.targetId||'sprite-1',event:s.event||'start',...(s.filter?{filter:s.filter}:{}),source:s.source},...(s.extraScripts||[]).map((v,i)=>({id:'intent-extra-'+i,...v}))];
  if(projectOnly)return p;
  const symbols=A.buildSymbols(p),roundtrips=[];
  for(const script of p.scripts){
    const ast=A.parseScript(script.source,symbols,{targetId:script.targetId,event:script.event});
    demand(ast,'no parsed AST');
    if(mode==='blocks') {
      const encoded=A.blockEncode(ast),decoded=A.blockDecode(encoded.tree),formatted=A.formatScript(decoded);
      const again=A.parseScript(formatted,symbols,{targetId:script.targetId,event:script.event});
      demand(A.astEquivalent(ast,decoded),'block encode/decode changed semantic AST');
      demand(A.astEquivalent(ast,again),'generated source changed semantic AST');
      roundtrips.push({original:script.source,formatted});script.source=formatted;
    } else roundtrips.push({original:script.source,parsed:true});
  }
  const compiled=A.compileProject(p);
  demand(!compiled.errors.length,'compile: '+JSON.stringify(compiled.errors));
  let clock=0,answer=null;
  const r=new A.RuntimeModel(p,{}),trace=[],errors=[];
  r.now=()=>clock;
  const actors=()=>[...r.actors].map(([id,v])=>({id,x:v.x,y:v.y,direction:v.direction,isClone:!!v.isClone}));
  const bridge={say:(id,value)=>trace.push({kind:'say',id,value,time:clock}),runtimeError:(task,e)=>errors.push({code:e.code,message:e.message}),
    ask:(text,reply)=>{trace.push({kind:'ask',text,time:clock});answer=reply;},
    stamp:id=>trace.push({kind:'stamp',id,time:clock,actor:actors().find(a=>a.id===id)}),
    continuousStep:entry=>trace.push({kind:'continuous',time:clock,entry:copy(entry)})};
  const q=new A.EventScheduler(p,compiled,r,bridge);
  // Suppress only the host's RAF scheduling; core methods, gates and command
  // execution are unchanged and consume the controlled monotonic clock.
  q.schedule=()=>{};
  const execute=q.executeNode;
  q.executeNode=function(task,node){const before=actors();const result=execute.call(this,task,node);const after=actors();
    for(const next of after){const old=before.find(a=>a.id===next.id);if(old&&(old.x!==next.x||old.y!==next.y||old.direction!==next.direction))trace.push({kind:'motion',id:next.id,before:old,after:next,time:clock});}
    return result;
  };
  const state=()=>({time:clock,actors:actors(),vars:copy([...r.projectVars]),lists:copy([...r.projectLists]),says:trace.filter(t=>t.kind==='say').length,blocked:q.blocked.size});
  const pump=()=>{let turns=0;while(q.ready.length&&turns++<10000)q.runTurn(true);demand(turns<10000,'scheduler did not quiesce');demand(!errors.length,'runtime: '+JSON.stringify(errors));};
  q.start();
  const nextRandom=r.prng.nextUint32.bind(r.prng);
  r.prng.nextUint32=()=>{const value=nextRandom();trace.push({kind:'random',value,time:clock});return value;};
  pump();const checkpoints=[state()];
  for(const step of s.steps||[]){
    if(step.at!==undefined){clock=step.at;q.advanceContinuous?.(clock);q.recheckBlocked(true);}
    if(step.key){demand(typeof q.setKeyState==='function','setKeyState API missing');const fresh=q.setKeyState(step.key,step.down);
      if(step.down&&fresh){demand(typeof q.spawnDistributed==='function','spawnDistributed API missing');q.spawnDistributed('keyDown',{key:step.key});}
      q.recheckBlocked(true);
    }
    if(step.answer!==undefined){demand(typeof answer==='function','question did not wait for a response');const reply=answer;answer=null;reply(step.answer);q.recheckBlocked(true);}
    pump();checkpoints.push(state());
  }
  const final=state();q.stop();
  return {project:p,roundtrips,trace,checkpoints,final,errors,execution:'real EventScheduler / RuntimeModel'};
}
