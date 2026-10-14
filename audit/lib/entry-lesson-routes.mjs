// Independent audit routes: this file does not read the product's lesson registry.
export const coreRoute=['choose-click','add-speech','speech-text','add-escape','run-original','try-original','stop-original','choose-course'];
export const routeLeaves={motion:['swim','zigzag','small'],score:['goal','bonus','remaining'],show:['melody','costume','dance']};
const trial=tag=>['run-'+tag,'try-'+tag,'stop-'+tag];
export function auditRoute(course='score',leaf='goal'){
 const tag=course+'-'+leaf;
 const parent=course==='motion'?['motion-swim']:course==='score'?['score-point','score-score']:['show-tone'];
 const child={swim:['random'],zigzag:['repeat','right','left'],small:['small'],goal:['if','cheer'],bonus:['if','bonus','cheer'],remaining:['remaining'],melody:['low','wait','mid','high'],costume:['costume','size'],dance:['repeat','turn','wait']}[leaf].map(k=>tag+'-'+k);
 return [...coreRoute,...parent,...trial(course),course+'-choose',...child,...trial(tag),tag+'-change',...trial(tag+'-remix'),tag+'-undo',tag+'-next','save-work','verify-save'];
}
export function auditOperation(id,course='score',leaf='goal'){
 const root=i=>['bodies','body',i],parentCount=course==='score'?2:1,offset=3+parentCount,tag=course+'-'+leaf;
 const insert=(key,at,parent=[],body='body')=>({kind:'insert',key,at,parent,body});
 const fields={swim:{ref:[...root(offset),'inputs','args',0],value:1.5},zigzag:{ref:[...root(offset),'inputs','count'],value:2},small:{ref:[...root(offset),'inputs','args',0],value:55},
 goal:{ref:[...root(offset),'inputs','condition','inputs','right'],value:4},bonus:{ref:[...root(offset),'inputs','condition','inputs','right'],value:4},
 remaining:{ref:[...root(offset),'inputs','args',1,'inputs','args',1,'inputs','args',1,'inputs','left'],value:8},
 melody:{ref:[...root(offset+2),'inputs','args',0],value:740},costume:{ref:[...root(offset+1),'inputs','args',0],value:55},dance:{ref:[...root(offset),'inputs','count'],value:2}};
 const ops={'add-speech':insert('speech',1),'add-escape':insert('escape',2),'speech-text':{kind:'field',ref:[...root(1),'inputs','value'],value:'つかまった！'},
 'motion-swim':insert('swim',3),'score-point':insert('point',3),'score-score':insert('score',4),'show-tone':insert('tone',3)};
 const variants={swim:{random:insert('randomSwim',offset)},zigzag:{repeat:insert('repeat',offset),right:insert('right',0,root(offset)),left:insert('left',1,root(offset))},small:{small:insert('small',offset)},
 goal:{if:insert('finish',offset),cheer:insert('cheer',0,root(offset),'thenBody')},bonus:{if:insert('bonus',offset),bonus:insert('bonusPoint',0,root(offset),'thenBody'),cheer:insert('cheer',1,root(offset),'thenBody')},remaining:{remaining:insert('remaining',offset)},
 melody:{low:insert('lowTone',offset),wait:insert('wait',offset+1),mid:insert('midTone',offset+2),high:insert('highTone',offset+3)},costume:{costume:insert('costume',offset),size:insert('small',offset+1)},dance:{repeat:insert('repeat',offset),turn:insert('turn',0,root(offset)),wait:insert('wait',1,root(offset))}};
 for(const [k,v]of Object.entries(variants[leaf]))ops[tag+'-'+k]=v;
 ops[tag+'-change']={kind:'field',...fields[leaf]};
 if(ops[id])return ops[id];
 if(id==='choose-course')return {kind:'choice',key:course};if(id===course+'-choose')return {kind:'choice',key:leaf};if(id===tag+'-next')return {kind:'choice',key:'finish'};
 return {kind:'action'};
}
