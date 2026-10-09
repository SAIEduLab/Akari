import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {currentProductFile} from '../lib/product-path.cjs';

// Compare the optimized editor against the identical, uncached semantic path.
// Existing language/editor suites remain the independent behavior oracles.
export function runEditorSyntaxReuseTests(html=fs.readFileSync(currentProductFile(),'utf8')) {
  const call='parseProjectSyntax(candidate, true)';
  assert.equal(html.split(call).length,2,'one editor-only syntax reuse boundary');
  const cached=loadApi(html), uncached=loadApi(html.replace(call,'parseProjectSyntax(candidate)'));
  const plain=value=>JSON.parse(JSON.stringify(value));
  const project=plain(cached.makeDefaultProject());
  project.actions=[{id:'shared',ownerId:'stage',name:'準備',args:[],source:'「共有」と言う。'}];
  project.scripts=[{id:'start',targetId:'sprite-1',event:'start',source:'【準備】という手順を行う。'}];
  const results=[];
  const compare=(id,p=project)=>{
    const before=JSON.stringify(p), target='sprite-1', row=p.scripts.find(s=>s.id==='start');
    const context={targetId:target,targetType:p.components.find(c=>c.id===target).type,event:row.event,args:[]};
    const actual=cached.createEditorSession('script:start',row.source,context,p);
    const expected=uncached.createEditorSession('script:start',row.source,context,p);
    assert.deepEqual(plain(actual),plain(expected),id+' session parity');
    if(actual.blockView) {
      const locate=s=>({parentId:s.blockView.id,body:'body',index:s.blockView.bodies.body.length});
      for(const schema of ['Say','WaitTime','MotionCommand:MOVE_DIRECTION','UserActionCall','IfStatement']) {
        assert.deepEqual(plain(cached.blockInsertionAvailability(actual,schema,locate(actual),{project:p,context})),
          plain(uncached.blockInsertionAvailability(expected,schema,locate(expected),{project:p,context})),id+' '+schema);
      }
    }
    assert.equal(JSON.stringify(p),before,id+' does not mutate project');
    results.push({id,status:'PASS'});return actual;
  };
  compare('cold');compare('warm');compare('equivalent-project-copy',plain(project));
  const original=plain(project);
  const mutate=(id,change)=>{change(project);compare(id);};
  mutate('shared-source-error',p=>p.actions[0].source='存在しない言葉を実行せよ');
  mutate('shared-source-repair',p=>p.actions[0].source=original.actions[0].source);
  mutate('shared-argument-change',p=>p.actions[0].args=['数']);
  mutate('shared-argument-restore',p=>p.actions[0].args=[]);
  mutate('shared-name-change',p=>p.actions[0].name='別の手順');
  mutate('shared-name-restore',p=>p.actions[0].name='準備');
  mutate('registered-call-phrase',p=>{p.actions[0].callPhrase='準備する';p.scripts[0].source='準備する。';});
  mutate('call-phrase-removed',p=>delete p.actions[0].callPhrase);
  mutate('stage-and-actor-rename',p=>{p.stage.name='別の画面';p.components[0].name='新しい部品';p.scripts[0].source='新しい部品を右へ10歩動かす。';});
  mutate('actor-name-ambiguous-source',p=>{p.components[0].name='今';p.scripts[0].source='今を右へ10歩動かす。';});
  mutate('data-declaration-added',p=>{p.projectData.variables.push({id:'v1',name:'点数',initial:0});p.scripts[0].source='点数を3にする。';});
  mutate('data-declaration-removed',p=>p.projectData.variables=[]);
  mutate('local-data-added',p=>p.components[0].localData.variables.push({id:'v2',name:'点数',initial:1}));
  mutate('local-data-removed',p=>p.components[0].localData.variables=[]);
  mutate('syntax-error',p=>p.scripts[0].source='もし');
  const erroneous=compare('syntax-error-cached');
  for(const d of erroneous.syntaxDiagnostics||[])d.message='caller changed diagnostic';
  compare('returned-diagnostics-isolated');
  mutate('multi-unit-document',p=>{p.components[0].name='あかり';p.scripts[0].source='作品を動かしたとき、あかりは、\n  「一」と言う。\nあかりをクリックしたとき、\n  「二」と言う。';p.scripts[0].document={revision:1,unitIds:['u1','u2']};});
  mutate('document-unit-id-change',p=>p.scripts[0].document.unitIds=['u3','u4']);
  compare('undo-restores-old-project',plain(original));
  compare('redo-restores-new-project',plain(project));
  // Same keys in a different project must never borrow stale shared syntax.
  const other=plain(original);other.actions[0].source='「別作品」と言う。';compare('different-project-same-keys',other);
  compare('return-to-first-project',plain(original));
  // Test-only instrumentation counts real parser entries, not elapsed wall time.
  // Nothing is added to the shipped API or its runtime instrumentation.
  const parser='function parseScript(source, symbols, ctx = {}) {';
  assert.equal(html.split(parser).length,2);
  const instrumented=html.replace(parser,
    'const auditParseCounts = new Map(); '+parser+' auditParseCounts.set(source,(auditParseCounts.get(source)||0)+1);')
    .replace('const Akari = {',`const Akari = {
      auditSyntaxProbe: () => ({ counts: [...auditParseCounts], entries: EDITOR_PROJECT_SYNTAX_CACHE.records.size,
        size: EDITOR_PROJECT_SYNTAX_CACHE.size }),`);
  const measured=loadApi(instrumented), large=plain(original);
  const sharedSource='「独立した長い本文」と言う。\n'.repeat(100);
  large.actions[0].source=sharedSource;
  const create=()=>measured.createEditorSession('script:start',large.scripts[0].source,
    {targetId:'sprite-1',targetType:'sprite',event:'start',args:[]},large);
  const session=create(), point={parentId:session.blockView.id,body:'body',index:1};
  for(const schema of ['Say','WaitTime','MotionCommand:MOVE_DIRECTION','UserActionCall'])
    measured.blockInsertionAvailability(session,schema,point,{project:large,context:session.context});
  create();
  const count=()=>new Map(measured.auditSyntaxProbe().counts).get(sharedSource);
  assert.equal(count(),1,'unchanged shared source parsed once across session/palette checks');
  large.actions[0].source+='「変更」と言う。';create();
  assert.equal(new Map(measured.auditSyntaxProbe().counts).get(large.actions[0].source),1,'changed source is parsed');
  large.actions[0].source=sharedSource;create();assert.equal(count(),2,'restored source is parsed again');
  results.push({id:'unchanged-source-parser-count',status:'PASS'});
  // Fixed upper bound across projects containing more documents than the cache.
  large.actions=[];large.scripts=Array.from({length:300},(_,i)=>({id:'doc-'+i,targetId:'sprite-1',event:'start',source:'「'+i+'」と言う。'}));
  measured.createEditorSession('script:doc-0',large.scripts[0].source,{targetId:'sprite-1',event:'start'},large);
  const bound=measured.auditSyntaxProbe();assert.ok(bound.entries<=256);assert.ok(bound.size<=1000000);
  results.push({id:'bounded-retained-documents',status:'PASS'});
  return {status:'PASS',total:results.length,results};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  const report=runEditorSyntaxReuseTests();
  if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}
