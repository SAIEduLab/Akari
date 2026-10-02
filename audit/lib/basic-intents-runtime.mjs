// Observations only: parser, codec and scheduler are the actual product.
export function basicProject(A,source){
 const p=A.makeEmptyProject(),actor=p.components[0];Object.assign(actor,{x:100,y:100,direction:0});
 const star=structuredClone(actor);Object.assign(star,{id:'basic-star',name:'星',x:200});star.localData={variables:[],lists:[]};star.costumes=[{id:'basic-star-costume',name:'星',kind:'text',value:'⭐'}];star.costumeId='basic-star-costume';
 p.components.push(star);p.name='基本原作文';p.scripts=[{id:'basic-body',targetId:'sprite-1',event:'start',source}];return p;
}
export function basicExecution(A,draft,makeProject,mode='source'){
 const assert=(v,m)=>{if(!v)throw Error(m);},p=makeProject(A,draft.source),before=JSON.stringify(p),parsed=A.parseSyntax(draft.source,{symbols:A.buildSymbols(p),targetId:'sprite-1',event:'start'});
 assert(parsed.ast,JSON.stringify(parsed.syntaxDiagnostics));const decoded=A.blockDecode(A.blockEncode(parsed.ast).tree),formatted=A.formatScript(decoded),again=A.parseSyntax(formatted,{symbols:A.buildSymbols(p),targetId:'sprite-1',event:'start'});
 assert(A.astEquivalent(parsed.ast,decoded)&&again.ast&&A.astEquivalent(parsed.ast,again.ast),'Code/Block meaning mismatch');if(mode==='blocks')p.scripts[0].source=formatted;
 const compiled=A.compileProject(p);assert(!compiled.errors.length,JSON.stringify(compiled.errors));const runtime=new A.RuntimeModel(p,{}),trace=[],states=[],errors=[];let clock=0;runtime.now=()=>clock;
 const scheduler=new A.EventScheduler(p,compiled,runtime,{say:(id,text)=>trace.push({kind:'say',id,text,time:clock}),penLine:(x1,y1,x2,y2)=>trace.push({kind:'line',x1,y1,x2,y2,time:clock}),runtimeError:(task,error)=>errors.push(error.code)});scheduler.schedule=()=>{};
 const pump=()=>{let turns=0;while(scheduler.ready.length&&turns++<1000)scheduler.runTurn(true);assert(turns<1000&&!errors.length,JSON.stringify(errors));};
 const record=()=>states.push({time:clock,actors:[...runtime.actors].map(([id,a])=>({id,x:a.x,y:a.y,direction:a.direction,visible:a.visible})),speech:trace.filter(x=>x.kind==='say').map(x=>({id:x.id,text:x.text,time:x.time}))});
 const advance=t=>{clock=t;scheduler.advanceContinuous(t);scheduler.recheckBlocked(true);pump();record();};
 const key=(name,down)=>{const changed=scheduler.setKeyState(name,down);if(down&&changed)scheduler.spawnDistributed('keyDown',{key:name});pump();record();};
 try{
  scheduler.start();pump();record();
  if(draft.id==='T01'){advance(500);scheduler.spawnForRuntime('sprite-1','click');pump();record();advance(1000);scheduler.spawnForRuntime('sprite-1','click');pump();record();}
  if(draft.id==='T02'){key('a',true);key('a',false);key('空白',true);advance(499);advance(500);key('空白',true);advance(1000);key('空白',false);key('空白',true);advance(1500);key('空白',false);}
  if(draft.id==='T03'||draft.id==='T13'){advance(1000);key('右',true);advance(2000);key('右',false);advance(3000);}
  if(draft.id==='T05'){advance(999);advance(1000);}
  const expectedProject=makeProject(A,mode==='blocks'?formatted:draft.source);assert(JSON.stringify(p)===JSON.stringify(expectedProject),'runtime mutated design');
  return {source:draft.source,formatted,states,trace,errors,designUnchanged:true};
 }finally{scheduler.stop();}
}
