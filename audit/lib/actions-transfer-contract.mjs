import fs from 'node:fs';
import assert from 'node:assert/strict';
import {sha,snapshot} from './product-test-host.mjs';
import {currentProductFile} from './product-path.cjs';
import {browserEnvironment} from './browser-environment.mjs';
import {fixedValues} from '../fixtures/fixed-values.mjs';

export const fixturePins=Object.freeze({
  'audit/fixtures/composition-acceptance.json':'8cadca66b29a47f8ae9e3eda9965c25021f0422fa14e2d6edab5c8fdb0dedd19',
  'audit/fixtures/actions-transfer-plan.json':'843c92e4c5b5d9a9be87fed7265ccfdc3566c949a491bf092e45a2888249c94c',
  'audit/fixtures/fixed-values.mjs':'3a1fd2fe67dc8242c7f9a6d349e28e79020ca2608fd93f6c199280328d1e04a0',
});
export function transferFixtures(){
  for(const [file,hash]of Object.entries(fixturePins))assert.equal(sha(fs.readFileSync(file)),hash,'unchanged independent fixture '+file);
  const prose=JSON.parse(fs.readFileSync('audit/fixtures/composition-acceptance.json'));
  const plan=JSON.parse(fs.readFileSync('audit/fixtures/actions-transfer-plan.json'));
  assert.deepEqual(prose.drafts.map(d=>d.id),['I07','I08','I09','I10','I11','I12']);
  for(const d of prose.drafts){assert.equal(sha(d.mainFirstDraft),d.draftSha256);assert.equal(d.writtenBeforeVisibleLaunch,true);assert.ok(d.expected&&d.intent);}
  assert.deepEqual(prose.drafts.find(d=>d.id==='I10').extra.argumentNames,['個数','ねだん']);
  for(const [key,count]of Object.entries({C:74,Q:76,E:32,L:38,S:164,O:40})){
    assert.equal(plan.groups[key].length,count);assert.equal(new Set(plan.groups[key].map(r=>r.id)).size,count);
  }
  return {prose,plan};
}
export function schemaForExpression(id){
  const key=id.slice(2),[category,...rest]=key.split(':'),name=rest.join(':');
  if(category==='expression')return name;
  if(category==='builtin')return 'BuiltinCall:'+name;
  if(category==='state'||category==='sensor')return 'SensorRead:'+name;
  const kind=['POS','NEG','NOT'].includes(name)?'UnaryExpression':
    ['ADD','SUB','MUL','DIV','POW'].includes(name)?'BinaryExpression':
    ['GTE','LTE','GT','LT','EQ','NEQ'].includes(name)?'CompareExpression':'LogicalExpression';
  return kind+':'+name;
}
export function verifyTransferReport(r){
  assert.equal(r.schema,'akari-actions-transfer-static-v1');assert.equal(r.status,'PASS');
  assert.deepEqual(r.snapshot,snapshot(currentProductFile()));assert.deepEqual(r.fixturePins,fixturePins);
  assert.equal(r.claim,'REGISTRATION_ONLY');assert.equal(r.productAcceptance,false);assert.equal(r.uxAcceptance,false);
  const {plan}=transferFixtures();
  assert.deepEqual(r.rows.map(x=>x.id),Object.values(plan.groups).flat().map(x=>x.id));
  for(const row of r.rows){assert.ok(row.references.length);assert.equal(row.executionClaim,'NOT_ASSERTED');}
  return r.rows.length;
}
export function verifyValuesReport(r){
  assert.equal(r.schema,'akari-fixed-values-v1');assert.equal(r.status,'PASS');
  assert.deepEqual(r.snapshot,snapshot(currentProductFile()));assert.deepEqual(r.fixturePins,fixturePins);
  assert.equal(r.nativeInputClaim,false);assert.equal(r.uxAcceptance,false);
  assert.deepEqual(r.results.map(x=>x.id),fixedValues.map(x=>'Q-'+x[0]));
  for(let i=0;i<fixedValues.length;i++){
    const [key,source,expected,unit]=fixedValues[i],row=r.results[i];
    assert.equal(row.status,'PASS');assert.equal(row.source,source);assert.deepEqual(row.expected,expected);assert.equal(row.unit,unit||null);
    assert.equal(row.blockAstEquivalent,true);assert.deepEqual(row.observations.map(x=>x.route),['source','block','regenerated-source']);
    for(const value of row.observations.map(x=>x.actual)){
      let actual=value;if(unit){assert.equal(actual.unit,unit);assert.deepEqual(Object.keys(actual).sort(),['magnitude','unit']);actual=actual.magnitude;}
      if(typeof expected==='number'){assert.equal(typeof actual,'number');assert.ok(Math.abs(actual-expected)<1e-9);}
      else assert.deepEqual(actual,expected);
    }
    const required={
      'expression:BooleanLiteral':1,'builtin:四捨五入':1,'builtin:乱数':1,'builtin:CONTAINS':1,'builtin:INDEX_OF':1,
      'state:マウスが押されている':3,'sensor:KEY_DOWN':3,'state:クローンである':1,'sensor:TOUCHING':1,'sensor:TOUCHING_COLOR':1,
    }[key]||0;
    assert.equal(row.variants.length,required);for(const variant of row.variants){
      if(key==='builtin:乱数')assert.ok(Number.isInteger(variant.actual)&&variant.actual>=1&&variant.actual<=10);
      else assert.deepEqual(variant.actual,variant.expected);
    }
  }
  return r.results.length;
}
export const compositionIds=[...['I07','I08','I09','I10','I11','I12'].flatMap(id=>[id+'/source-ui',id+'/semantic-roundtrip']),
  'I10/action-original','I10/function-original','EDITOR/idless-heading-selection'];
export function verifyCompositionMeaning(d,r){
  assert.equal(r.execution,'actual EventScheduler / RuntimeModel');assert.equal(r.source,d.mainFirstDraft);
  assert.deepEqual(r.errors,[]);assert.ok(r.roundtrip.length);
  const first=r.states[0],last=r.states.at(-1),speech=last.speech;
  const variable=name=>last.variables.find(x=>x[0]===name)?.[1],at=time=>r.states.find(x=>x.time===time);
  const actor=last.actors.find(a=>a.id==='sprite-1');assert.ok(actor);
  if(d.id==='I07'){assert.deepEqual(variable('点数'),{magnitude:3,unit:'点'});assert.deepEqual(speech.map(x=>x.text),['できた！','3点']);}
  if(d.id==='I08'){
    assert.deepEqual(last.lists.find(x=>x[0]==='持ち物')[1],['本','かさ','ぼうし']);
    assert.deepEqual(speech.map(x=>[x.text,x.time]),[['本',0],['かさ',2000],['ぼうし',4000]]);
    assert.equal(at(1999).speech.length,1);assert.equal(at(3999).speech.length,2);
  }
  if(d.id==='I09'){
    assert.equal(first.speech.length,0);assert.equal(at(999).speech.length,0);
    assert.deepEqual(r.trace.filter(x=>x.kind==='ask').map(x=>x.text),['名前を教えてください']);
    assert.deepEqual(speech.map(x=>x.text),['はる「青空」さん、こんにちは']);
  }
  if(d.id==='I10'){
    assert.deepEqual(r.trace.filter(x=>x.kind==='motion').map(x=>x.after.direction),[15,0,15,0]);
    assert.deepEqual(speech.map(x=>x.text),['250']);assert.equal(actor.direction,0);
    assert.deepEqual(last.variables,[['点数',0]]);assert.equal(actor.x,100);assert.equal(actor.y,100);
  }
  if(d.id==='I11'){
    assert.equal(at(999).speech.length,0);
    assert.deepEqual(speech.map(x=>[x.id,x.text,x.time]),[['sprite-1','準備できた',1000],['composition-star','準備できた',2000],['sprite-1','全員集合',2000]]);
    assert.ok(!at(1999).speech.some(x=>x.text==='全員集合'));
  }
  if(d.id==='I12'){
    const clones=first.actors.filter(a=>a.isClone);assert.equal(clones.length,3);for(const a of clones){assert.equal(a.x,120);assert.equal(a.y,100);}
    assert.equal(at(999).actors.filter(a=>a.isClone).length,3);assert.equal(last.actors.filter(a=>a.isClone).length,0);
    assert.equal(actor.x,100);assert.equal(actor.y,100);assert.equal(r.projectAfter.components.length,2);
  }
}
export function verifyCompositionReport(r){
  assert.equal(r.schema,'akari-composition-acceptance-v1');assert.equal(r.status,'PASS');
  assert.deepEqual(r.snapshot,snapshot(currentProductFile()));assert.deepEqual(r.fixturePins,fixturePins);
  assert.equal(r.environment.browser,browserEnvironment.version);assert.equal(r.environment.playwright,browserEnvironment.playwright);
  assert.equal(r.uxAcceptance,false);assert.deepEqual(r.pageErrors,[]);assert.deepEqual(r.networkRequests,[]);
  assert.deepEqual(r.results.map(x=>x.id),compositionIds);
  const {prose}=transferFixtures();
  assert.deepEqual(r.originals,prose.drafts);
  for(const result of r.results){assert.equal(result.status,'PASS',result.id);assert.ok(result.evidence);assert.equal(result.expectedOutcome,'SUCCESS_REQUIRED');}
  for(const d of prose.drafts){
    const ui=r.results.find(x=>x.id===d.id+'/source-ui').evidence;
    assert.equal(ui.enteredSource,d.mainFirstDraft);assert.equal(ui.pending,null);assert.equal(ui.codeAfterRoundtrip,d.mainFirstDraft);
    assert.equal(ui.savedSourceExact,true);assert.equal(ui.compileErrors.length,0);
    const meaning=r.results.find(x=>x.id===d.id+'/semantic-roundtrip').evidence;
    verifyCompositionMeaning(d,meaning.source);verifyCompositionMeaning(d,meaning.blocks);
    assert.deepEqual(meaning.blocks.states,meaning.source.states);assert.deepEqual(meaning.blocks.trace,meaning.source.trace);
    if(d.id==='I07'){
      const variant=meaning.twoRepeatVariant;assert.equal(variant.source,d.mainFirstDraft.replace('3回くり返す','2回くり返す'));
      assert.deepEqual(variant.states.at(-1).variables.find(x=>x[0]==='点数')[1],{magnitude:2,unit:'点'});
      assert.deepEqual(variant.states.at(-1).speech.map(x=>x.text),['もう一度','2点']);
    }
    if(d.id==='I11'){
      const variant=meaning.otherMessageVariant;assert.equal(variant.source,d.mainFirstDraft.replace('みんなに「出発」と','みんなに「別の知らせ」と'));
      assert.deepEqual(variant.states.at(-1).speech.map(x=>[x.text,x.time]),[['全員集合',0]]);
    }
  }
  const extra=prose.drafts.find(d=>d.id==='I10').extra;
  for(const kind of ['action','function']){
    const evidence=r.results.find(x=>x.id==='I10/'+kind+'-original').evidence;
    assert.equal(evidence.kind,kind);assert.equal(evidence.original,kind==='action'?extra.actionBody:extra.functionBody);assert.deepEqual(evidence.compileErrors,[]);
  }
  const identity=r.results.find(x=>x.id==='EDITOR/idless-heading-selection').evidence;
  assert.ok(identity.first.scripts[0].id,'edited body identity is required');
  assert.equal(identity.second.scripts[0].id,identity.first.scripts[0].id,'body identity must remain stable');
  for(const observation of [identity.first,identity.second]){
    assert.equal(observation.scripts.length,1);assert.equal(observation.scripts[0].source,identity.source);
    assert.equal(observation.scripts[0].event,'click');assert.equal(observation.textarea,identity.source);assert.equal(observation.event,'click');
  }
  return r.results.length;
}
