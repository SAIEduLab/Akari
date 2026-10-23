import assert from 'node:assert/strict';

export const boundaryTimeoutMs=5000;
const scaledNames=['unclosed-string','unclosed-name','unclosed-parens','duplicate-particles','duplicate-time','duplicate-coordinates','long-valid',
  'missing-slide-destination','missing-slide-duration','comparison-late-failure','comparison-missing-marker','missing-tone-frequency','duplicate-input-value',
  'duplicate-steps','duplicate-move-time','missing-move-destination','numeric-motion-late-failure','numeric-fullwidth-unit','numeric-connective-late-failure','numeric-degree-late-failure'];
const nearLimit={'missing-slide-destination':32000,'missing-slide-duration':10000,'comparison-late-failure':45000,'comparison-missing-marker':32000,
  'missing-tone-frequency':32000,'duplicate-input-value':45000,'numeric-motion-late-failure':99980,'numeric-fullwidth-unit':99980,
  'numeric-connective-late-failure':49990,'numeric-degree-late-failure':99980};
export const boundaryCases=Object.freeze([
  ...scaledNames.flatMap(name=>[1000,4000,12000].map(count=>({name,count,accepted:name==='long-valid'}))),
  ...Object.entries(nearLimit).map(([name,count])=>({name,count,accepted:false})),
  ...['mixed-valid','mixed-late-failure','mixed-rotation-valid'].flatMap(name=>[1000,2500,4000].map(count=>({name,count,accepted:name!=='mixed-late-failure'}))),
]);
export function boundarySource(name,n){
  assert.ok(Number.isInteger(n)&&n>0,'boundary count');
  switch(name){
    case 'unclosed-string':return '「'+'をにから秒'.repeat(n)+'という';
    case 'unclosed-name':return '【'+'をにから秒'.repeat(n)+'に加える';
    case 'unclosed-parens':return '（'.repeat(n)+'1を点数に足す';
    case 'duplicate-particles':return '1を'+'点数に'.repeat(n)+'足す';
    case 'duplicate-time':return '1秒で'.repeat(n)+'横1、縦2の位置へ滑る';
    case 'duplicate-coordinates':return '横1、縦2、'.repeat(n)+'の位置へ行く';
    case 'missing-slide-destination':return '1秒で'.repeat(n)+'滑る';
    case 'missing-slide-duration':return '横1、縦2の位置へ'.repeat(n)+'すべる';
    case 'comparison-late-failure':return 'aが'.repeat(n)+'1と同じと言う';
    case 'comparison-missing-marker':return '1より'.repeat(n)+'大きいという';
    case 'missing-tone-frequency':return '1秒、'.repeat(n)+'鳴らす';
    case 'duplicate-input-value':return '1を'.repeat(n)+'「値」に入れる';
    case 'long-valid':return Array(n).fill('何もしない').join('\n');
    case 'duplicate-steps':return '右へ1歩、'.repeat(n)+'動く';
    case 'duplicate-move-time':return '1秒かけて、'.repeat(n)+'画面の左下のはしから、右へ1歩、上へ2歩のばしょへ行く';
    case 'missing-move-destination':return '1秒かけて、'.repeat(n)+'行く';
    case 'numeric-motion-late-failure':return '1'.repeat(n)+'秒かけて、右へ10歩動く。';
    case 'numeric-fullwidth-unit':return '１'.repeat(n)+'分待つ。';
    case 'numeric-connective-late-failure':return '1'.repeat(n)+'秒'+'て'.repeat(n)+'X。';
    case 'numeric-degree-late-failure':return '1'.repeat(n)+'秒かけて、右へ10ど回るX。';
    case 'mixed-valid':return '前へ1歩進んで、1秒待ってから、'.repeat(n)+'何もしない。';
    case 'mixed-late-failure':return '前へ1歩進んで、1秒待ってから、'.repeat(n)+'1秒休む。';
    case 'mixed-rotation-valid':return '前へ1歩進んで、右に1度回ってから、'.repeat(n)+'何もしない。';
    default:throw Error('Unknown boundary input: '+name);
  }
}
export function verifyLanguageBoundaries(report,inputs){
  assert.deepEqual(Object.keys(report).sort(),['status','snapshot','timeoutMs','results','featureContract',...(Object.hasOwn(report,'validatorNegatives')?['validatorNegatives']:[])].sort());
  assert.equal(report.status,'PASS');assert.deepEqual(report.snapshot,inputs);assert.equal(report.timeoutMs,boundaryTimeoutMs);
  assert.equal(Object.hasOwn(report,'error'),false);assert.equal(report.featureContract,'audit/manifests/features.json');
  assert.ok(Array.isArray(report.results));assert.equal(report.results.length,boundaryCases.length);
  report.results.forEach((row,i)=>{
    const expected=boundaryCases[i];assert.deepEqual(Object.keys(row).sort(),(expected.accepted?['name','count','chars','ms','heapDelta','accepted']:['name','count','chars','ms','heapDelta','accepted','diagnostic']).sort());
    assert.equal(row.name,expected.name);assert.equal(row.count,expected.count);assert.equal(row.accepted,expected.accepted);
    assert.equal(row.chars,[...boundarySource(expected.name,expected.count)].length);
    assert.ok(Number.isFinite(row.ms)&&row.ms>=0&&row.ms<=boundaryTimeoutMs,expected.name+' deadline');assert.ok(Number.isFinite(row.heapDelta));
    if(!expected.accepted)assert.match(row.diagnostic,/^[A-Z]\d{3}$/);
  });
  return {status:'PASS',measurements:report.results.length};
}
export const boundaryRejectionIds=Object.freeze(['empty','missing','duplicate','unexpected','wrong-count','wrong-chars','wrong-acceptance','missing-ms','nonfinite-ms','negative-ms','slow',
  'missing-memory','nonfinite-memory','missing-diagnostic','timeout','row-error','report-error','wrong-snapshot','wrong-timeout','false-pass','report-timeout']);
export function checkLanguageBoundaryNegatives(good,inputs){
  verifyLanguageBoundaries(good,inputs);
  const changes=[r=>r.results=[],r=>r.results.pop(),r=>r.results[1]=structuredClone(r.results[0]),r=>r.results[0].name='other',r=>r.results[0].count++,r=>r.results[0].chars++,r=>r.results[0].accepted=true,
    r=>delete r.results[0].ms,r=>r.results[0].ms=Infinity,r=>r.results[0].ms=-1,r=>r.results[0].ms=5001,r=>delete r.results[0].heapDelta,r=>r.results[0].heapDelta=NaN,
    r=>delete r.results[0].diagnostic,r=>r.results[0].status='TIMEOUT',r=>r.results[0].error='worker failed',r=>r.error='worker failed',r=>r.snapshot={other:true},r=>r.timeoutMs=10000,r=>r.status='FAIL',r=>r.timedOut=true];
  return changes.map((mutate,i)=>{const bad=structuredClone(good);mutate(bad);assert.throws(()=>verifyLanguageBoundaries(bad,inputs),boundaryRejectionIds[i]);return {id:boundaryRejectionIds[i],rejected:true};});
}
