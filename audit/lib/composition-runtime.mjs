// Fixture adapter and observations only. All parsing/evaluation/execution uses
// the actual candidate product; there is no alternate statement interpreter.
export function compositionProject(A,d,source=d.mainFirstDraft){
 const p=A.makeDefaultProject(),cat=p.components.find(c=>c.id==='sprite-1');
 Object.assign(cat,{name:'あかり',x:100,y:100,direction:0});
 const star=structuredClone(cat);Object.assign(star,{id:'composition-star',name:'星',x:200});
 star.costumes=[{id:'composition-star-costume',name:'星',kind:'text',value:'⭐'}];star.costumeId='composition-star-costume';
 p.components=[cat,star];p.projectData={variables:[{id:'composition-score',name:'点数',initialValue:0}],lists:[]};
 if(d.id==='I08')p.projectData.lists.push({id:'composition-inventory',name:'持ち物',initialValue:['本','ぼうし']});
 p.name='原作文受入 '+d.id;p.scripts=[{id:'composition-main',targetId:'sprite-1',event:'start',source}];
 p.actions=[];p.functions=[];
 if(d.extra){
  p.actions=[{id:'composition-action',ownerId:'stage',name:d.extra.actionName,args:[],source:d.extra.actionBody}];
  p.functions=[{id:'composition-function',ownerId:'stage',name:d.extra.functionName,args:d.extra.argumentNames,source:d.extra.functionBody}];
 }
 return p;
}
export function compositionExecution({draft:d,makeProject,mode='source',source=d.mainFirstDraft}){
 const A=globalThis.Akari,assert=(value,message)=>{if(!value)throw Error(message);},copy=x=>JSON.parse(JSON.stringify(x));
 const p=makeProject(A,d,source),syntax=A.parseSyntax(source,{targetId:'sprite-1',event:'start'});
 assert(syntax.ast,'original source was rejected: '+JSON.stringify(syntax.diagnostics));
 const roundtrip=[];
 for(const item of [...p.scripts,...p.actions,...p.functions]){
  const kind=p.functions.includes(item)?'function':p.actions.includes(item)?'action':null;
  const context=kind?{definitionKind:kind,args:item.args}:{targetId:item.targetId,event:item.event};
  const parsed=A.parseSyntax(item.source,context);assert(parsed.ast,'original definition/source rejected: '+JSON.stringify(parsed.diagnostics));
  const decoded=A.blockDecode(A.blockEncode(parsed.ast).tree),formatted=A.formatScript(decoded),again=A.parseSyntax(formatted,context);
  assert(A.astEquivalent(parsed.ast,decoded),'block decode changed original meaning');
  assert(again.ast&&A.astEquivalent(parsed.ast,again.ast),'block-generated source changed original meaning');
  roundtrip.push({original:item.source,formatted});if(mode==='blocks')item.source=formatted;
 }
 const compiled=A.compileProject(p);assert(!compiled.errors.length,'original compile failed: '+JSON.stringify(compiled.errors));
 const runtime=new A.RuntimeModel(p,{}),trace=[],errors=[];let clock=0,reply=null;
 runtime.now=()=>clock;
 const scheduler=new A.EventScheduler(p,compiled,runtime,{
  say:(id,text)=>trace.push({kind:'say',id,text,time:clock}),
  ask:(text,answer)=>{trace.push({kind:'ask',text,time:clock});reply=answer;},
  runtimeError:(task,error)=>errors.push({code:error.code,message:error.message}),
 });
 scheduler.schedule=()=>{};
 const execute=scheduler.executeNode;
 scheduler.executeNode=function(task,node){
  const before=[...runtime.actors].map(([id,a])=>({id,x:a.x,y:a.y,direction:a.direction})),result=execute.call(this,task,node);
  for(const [id,a]of runtime.actors){const old=before.find(v=>v.id===id);if(old&&(old.x!==a.x||old.y!==a.y||old.direction!==a.direction))trace.push({kind:'motion',id,before:old,after:{x:a.x,y:a.y,direction:a.direction},time:clock});}
  return result;
 };
 const state=()=>({time:clock,actors:[...runtime.actors].map(([id,a])=>({id,x:a.x,y:a.y,direction:a.direction,isClone:!!a.isClone})),
  variables:copy([...runtime.projectVars]),lists:copy([...runtime.projectLists]),speech:trace.filter(t=>t.kind==='say'),blocked:scheduler.blocked.size});
 const pump=()=>{let turns=0;while(scheduler.ready.length&&turns++<10000)scheduler.runTurn(true);assert(turns<10000,'scheduler did not finish current turn');assert(!errors.length,'runtime errors: '+JSON.stringify(errors));};
 const states=[];
 try{
  scheduler.start();pump();states.push(state());
  const times={I07:[],I08:[1999,2000,3999,4000,5999,6000],I09:[999,1000],I10:[],I11:[999,1000,1999,2000],I12:[999,1000]}[d.id];
  for(const time of times){clock=time;if(d.id==='I09'&&time===1000){assert(reply,'question was not awaiting an answer');const answer=reply;reply=null;answer('はる「青空」');}
   scheduler.advanceContinuous?.(clock);scheduler.recheckBlocked(true);pump();states.push(state());}
  return {execution:'actual EventScheduler / RuntimeModel',source,roundtrip,states,trace,errors,projectAfter:copy(p),initialSourcePreserved:mode==='source'};
 }finally{scheduler.stop();}
}
