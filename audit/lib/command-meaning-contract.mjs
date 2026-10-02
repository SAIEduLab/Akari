import assert from 'node:assert/strict';
import {transferFixtures} from './actions-transfer-contract.mjs';
import {verifySemanticExtension} from './semantic-extension-contract.mjs';
export const commandMeaningIds=transferFixtures().plan.groups.C.map(r=>r.id).filter(id=>!id.startsWith('C-SoundCommand:'));
const doubles=new Set(['IfStatement','RepeatCount','RepeatWhile','RepeatUntil','MotionCommand:BOUNCE','LooksCommand:NEXT_BACKDROP','LooksCommand:PREV_BACKDROP','LooksCommand:NEXT_COSTUME','LooksCommand:PREV_COSTUME','UserActionCall']);
export function verifyCommandMeaning(report){
 const count=verifySemanticExtension(report,'akari-command-meaning-v1',commandMeaningIds);
 for(const row of report.results){const id=row.id.slice(2);assert.equal(row.observed.length,doubles.has(id)?2:1);
  for(const [variant,v]of row.observed.entries()){
   assert.equal(v.variant,variant);assert.deepEqual(v.routes.map(r=>r.mode),['source','blocks']);
   const [s,b]=v.routes;assert.deepEqual(s.input,b.input);assert.equal(s.roundtrips,0);assert.equal(b.roundtrips,3);
   assert.ok(s.states.length>0);assert.deepEqual(s.states,b.states);assert.deepEqual(s.final,b.final);
   const f=s.final,a=f.actors.find(a=>a.runtimeId==='sprite-1'),speech=f.trace.filter(t=>t.kind==='say').map(t=>t.text);
   assert.ok(s.input.scripts.length>0);assert.ok(Array.isArray(f.ink));assert.ok(Number.isFinite(f.time));
   const wantedScore={Assignment:0,'NumericUpdate:ADD':11,'NumericUpdate:SUB':9,RepeatCount:variant?0:3,RepeatWhile:100,RepeatUntil:variant?0:2,WaitUntil:100,Break:1,Continue:3};
   if(Object.hasOwn(wantedScore,id))assert.equal(f.variables.点数,wantedScore[id]);
   const wantedLists={ListAppend:['本','ぼうし','あかり'],ListReplace:['ひかり','ぼうし'],ListInsert:['ほたる','本','ぼうし'],ListDelete:['ぼうし'],ListClear:[]};
   if(Object.hasOwn(wantedLists,id))assert.deepEqual(f.lists.名前一覧,wantedLists[id]);
   const wantedSpeech={IfStatement:[variant?'不一致':'一致'],Say:['10点以上です'],WaitTime:['完了'],WaitUntil:['完了'],ForEach:['本','ぼうし'],Broadcast:['送信後','0.3','0.6'],BroadcastAndWait:['0.3','0.6','送信後'],Ask:['はる'],LocalVariableDeclaration:['1'],ReturnStatement:['5'],'StopCommand:THIS':['他'],'StopCommand:OTHERS':['現在'],'StopCommand:ALL':[],'LooksCommand:SET_INPUT':['前=前','後=答え'],NoOperation:['終わり']};
   if(Object.hasOwn(wantedSpeech,id))assert.deepEqual(speech,wantedSpeech[id]);
   const motion={MOVE:[110,100,0],GOTO:[100,50,0],GLIDE:[200,100,0],TURN_RIGHT:[100,100,15],TURN_LEFT:[100,100,-15],SET_DIRECTION:[100,100,90],SET_X:[100,100,0],SET_Y:[100,50,0],POINT_TO:[100,100,90],BOUNCE:variant?[100,100,0]:[540,100,180]};
   if(id.startsWith('MotionCommand:'))assert.deepEqual([a.x,a.y,a.direction],motion[id.split(':')[1]]);
   const op=id.split(':')[1];
   if(id==='LooksCommand:SET_SCALE')assert.equal(a.scalePercent,120);
   if(id==='LooksCommand:SET_COLOR')assert.equal(a.color,'#ff3b30');
   if(op==='HIDE'||op==='SHOW')assert.equal(a.visible,op==='SHOW');
   const layers={FRONT:['command-star','command-button','sprite-1'],BACK:['sprite-1','command-star','command-button'],FORWARD_LAYERS:['command-star','sprite-1','command-button'],BACKWARD_LAYERS:['command-star','sprite-1','command-button']};
   if(layers[op])assert.deepEqual([...f.actors].sort((a,b)=>a.z-b.z).map(a=>a.runtimeId),layers[op]);
   if(id.startsWith('LooksCommand:')&&/BACKDROP$/.test(op))assert.equal(f.backdrop,'command-bg-'+(op==='SET_BACKDROP'?0:op==='NEXT_BACKDROP'?(variant?0:1):(variant?2:0)));
   if(id.startsWith('LooksCommand:')&&/COSTUME$/.test(op))assert.equal(a.costumeId,'command-costume-'+(op==='SET_COSTUME'?1:op==='NEXT_COSTUME'?(variant?0:1):(variant?2:0)));
   if(op==='SET_TARGET_TEXT')assert.equal(f.actors.find(a=>a.runtimeId==='command-button').text,'始める');
   if(op==='SET_SELF_TEXT')assert.equal(f.actors.find(a=>a.runtimeId==='command-label').text,'文字');
   if(op==='SET_INPUT')assert.equal(f.actors.find(a=>a.runtimeId==='command-input').inputValue,'答え');
   if(id.startsWith('PenCommand:')){assert.equal(f.ink.length,['SET_COLOR','SET_SIZE'].includes(op)?2:op==='CLEAR'?0:1);if(op==='STAMP'){assert.equal(f.ink[0].actor.x,100);assert.equal(a.x,120);}else if(op!=='CLEAR'){assert.deepEqual(f.ink[0],{kind:'line',line:[150,150,170,150,'#147efb',3]});if(f.ink.length===2)assert.deepEqual(f.ink[1],{kind:'line',line:[170,150,190,150,op==='SET_COLOR'?'#ff3b30':'#147efb',op==='SET_SIZE'?6:3]});}}
   if(id==='ReturnStatement')assert.deepEqual(f.trace.find(t=>t.kind==='unreachable-tail-refusal'),{kind:'unreachable-tail-refusal',codes:['S306'],unchanged:true});
   if(id==='LocalListDeclaration'){assert.deepEqual(f.lists.結果,['元']);assert.deepEqual(f.lists.受取,['あかり']);}
   if(id.startsWith('CloneCommand:')){const clones=f.actors.filter(a=>a.isClone);assert.equal(clones.length,1);assert.equal(clones[0].baseId,op==='CREATE_SELF'?'sprite-1':'command-star');assert.equal(f.variables.分身開始数,op==='DELETE_SELF'?2:1);}
   if(id==='UserActionCall'){assert.equal(a.vars.個体点数,13);assert.equal(f.actors.find(a=>a.runtimeId==='command-star').vars.個体点数,20);assert.equal(f.variables.点数,10);}
   if(id==='Forever')assert.ok(a.direction>=30);
   if(id==='WaitTime'){assert.equal(f.trace[0].time,100);assert.deepEqual(s.states[1].trace,[]);}
   if(id==='BroadcastAndWait')assert.equal(f.trace.at(-1).time,600);
  }
 }
 return count;
}
