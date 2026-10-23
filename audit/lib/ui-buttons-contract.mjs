import { currentProductFile } from "./product-path.cjs";
import assert from 'node:assert/strict';

export const uiButtonIds = Object.freeze([
  'UI-BUTTON-CURRENT-MODE-REFUSAL',
  'UI-BUTTON-GUIDED-CHOICES',
  'UI-BUTTON-SOURCE-NAV',
  'UI-BUTTON-BASIC-HISTORY',
  'UI-BUTTON-SIDE-ACTIONS',
  'UI-BUTTON-LEVELS',
  'UI-BUTTON-PENDING',
  'UI-BUTTON-BLOCK-DESTINATION',
  'UI-BUTTON-BLOCK-INSERTION',
  'UI-BUTTON-BLOCK-COMMANDS',
  'UI-BUTTON-RESPONSIVE',
]);

export function verifyUiButtons(report, currentSnapshot) {
  assert.equal(report.schema, 'akari-ui-buttons-v1');
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.snapshot, currentSnapshot);
  assert.equal(report.environment, 'chromium');
  assert.ok(typeof report.browser === 'string' && report.browser.length > 0);
  assert.equal(report.total, uiButtonIds.length);
  const ids = report.results.map(row => row.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate UI button test ID');
  assert.deepEqual([...ids].sort(), [...uiButtonIds].sort(), 'UI button coverage');
  for (const row of report.results) {
    assert.equal(row.status, 'PASS', row.id);
    assert.equal(row.pass, true, row.id);
    assert.ok(row.evidence && typeof row.evidence === 'object' && Object.keys(row.evidence).length, row.id);
  }
  assert.deepEqual(report.results.find(row=>row.id==='UI-BUTTON-PENDING').evidence.observationControls,[{id:'delayed-hidden',hidden:true},{id:'permanent-visible',rejected:true,timeoutMs:100},{id:'closed-page',rejected:true}],'bounded UI observation controls');
  const mode=report.results.find(row=>row.id==='UI-BUTTON-CURRENT-MODE-REFUSAL').evidence;
  assert.equal(mode.previousRefusals.length,2);assert.equal(mode.previousRefusals[0],'error');assert.ok(mode.previousRefusals[1]===null||mode.previousRefusals[1]==='error');
  for(const key of ['immediateRepairSwitch','newErrorRefused','sourceAndHistoryPreserved'])assert.equal(mode[key],true);
  verifyGuidedChoices(report.results.find(row=>row.id==='UI-BUTTON-GUIDED-CHOICES').evidence);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.networkRequests, []);
  return true;
}

const guided=[
  {id:'repeat-both',choice:0,source:'4回くり返す。\n  10歩進む。\n  右に90度回る。',position:[0,0]},
  {id:'repeat-turn',choice:1,source:'10歩進む。\n4回くり返す。\n  右に90度回る。',position:[10,0]},
  {id:'list-append',choice:0,source:'持ち物の最後に「かさ」を入れる。',list:['本','ぼうし','かさ']},
  {id:'list-replace',choice:1,source:'持ち物の2番目を「かさ」にかえる。',list:['本','かさ']},
];
const guidedLabels=id=>id.startsWith('repeat')?['進む・回るの 両方を くり返す','進むのは 一度、回るだけを くり返す']:['さいごに入れる','どれかと 入れかえる（何番目かを えらぶ）'];
const guidedInvalid=id=>id==='list-append'?[]:['','Infinity','1e2','0/0',...(id==='list-replace'?['0','-1','1.5','2.0000000000000001','9007199254740993']:[])];
function verifyGuidedChoices(evidence){
  assert.deepEqual(evidence.variants.map(v=>v.id),guided.map(v=>v.id));
  for(const [i,v]of evidence.variants.entries()){
    const e=guided[i];assert.equal(v.choice,e.choice);assert.equal(v.source,e.source);assert.deepEqual(v.labels,guidedLabels(e.id));
    assert.equal(v.beforeProject.scripts.length,1);assert.equal(v.beforeProject.scripts[0].source,'10歩進む。');
    const project=structuredClone(v.beforeProject);project.scripts[0].source=e.source;assert.deepEqual(v.afterProject,project);
    for(const key of ['noAutomaticExecution','undoRedo','modeRoundtrip'])assert.equal(v[key],true);
    for(const key of ['cancelled','detachedRefused'])assert.equal(v[key],e.id!=='list-append');
    assert.deepEqual(v.invalidRejected,guidedInvalid(e.id));
    assert.deepEqual(v.runtime.list,e.list||['本','ぼうし']);
    const point=e.position||[0,0];assert.equal(v.runtime.position.length,2);point.forEach((n,k)=>assert.ok(Number.isFinite(v.runtime.position[k])&&Math.abs(v.runtime.position[k]-n)<1e-7));
  }
}
function guidedFixture(){return {variants:guided.map(e=>{const beforeProject={scripts:[{id:'guided-main',targetId:'sprite-1',event:'start',source:'10歩進む。'}]},afterProject=structuredClone(beforeProject);afterProject.scripts[0].source=e.source;return {...e,labels:guidedLabels(e.id),beforeProject,afterProject,noAutomaticExecution:true,cancelled:e.id!=='list-append',detachedRefused:e.id!=='list-append',invalidRejected:guidedInvalid(e.id),undoRedo:true,modeRoundtrip:true,runtime:{position:e.position||[0,0],list:e.list||['本','ぼうし']}};})};}

export function checkUiButtonValidatorNegatives() {
  const inputs = {productSha256:'a'.repeat(64), files:{[currentProductFile()]:'a'.repeat(64)}};
  const valid = () => ({schema:'akari-ui-buttons-v1', status:'PASS', snapshot:structuredClone(inputs),
    environment:'chromium', browser:'fixture-browser', total:uiButtonIds.length,
    results:uiButtonIds.map(id => ({id, status:'PASS', pass:true, evidence:id==='UI-BUTTON-PENDING'?{checked:true,observationControls:[{id:'delayed-hidden',hidden:true},{id:'permanent-visible',rejected:true,timeoutMs:100},{id:'closed-page',rejected:true}]}:id==='UI-BUTTON-GUIDED-CHOICES'?guidedFixture():id==='UI-BUTTON-CURRENT-MODE-REFUSAL'?{previousRefusals:['error',null],immediateRepairSwitch:true,newErrorRefused:true,sourceAndHistoryPreserved:true}:{checked:true}})),
    pageErrors:[], networkRequests:[]});
  verifyUiButtons(valid(), inputs);
  for (const mutate of [
    r => r.results.pop(),
    r => r.results[1].id = r.results[0].id,
    r => r.results[0].status = 'SKIP',
    r => r.results[0].pass = false,
    r => r.results[0].evidence = {},
    r => r.snapshot.productSha256 = 'b'.repeat(64),
    r => r.environment = 'node',
    r => r.browser = '',
    r => r.pageErrors.push('page error'),
    r => r.networkRequests.push('https://example.invalid'),
    r => delete r.results.find(x=>x.id==='UI-BUTTON-PENDING').evidence.observationControls,
    r => r.results.find(x=>x.id==='UI-BUTTON-PENDING').evidence.observationControls[0].hidden=false,
    r => r.results.find(x=>x.id==='UI-BUTTON-PENDING').evidence.observationControls[1].rejected=false,
    r => r.results.find(x=>x.id==='UI-BUTTON-PENDING').evidence.observationControls[2].rejected=false,
    r => r.results.find(x=>x.id==='UI-BUTTON-PENDING').evidence.observationControls.push({id:'extra',rejected:true}),
    r => r.results.find(x=>x.id==='UI-BUTTON-PENDING').evidence.observationControls[1].timeoutMs=30000,
    r => r.results.find(x=>x.id==='UI-BUTTON-CURRENT-MODE-REFUSAL').evidence.previousRefusals[0]=null,
    r => r.results.find(x=>x.id==='UI-BUTTON-CURRENT-MODE-REFUSAL').evidence.newErrorRefused=false,
    r => r.results.find(x=>x.id==='UI-BUTTON-GUIDED-CHOICES').evidence.variants[0].runtime.position=[10,0],
    r => r.results.find(x=>x.id==='UI-BUTTON-GUIDED-CHOICES').evidence.variants[3].source='持ち物のさいごに「かさ」を入れる。',
    r => r.results.find(x=>x.id==='UI-BUTTON-GUIDED-CHOICES').evidence.variants[1].detachedRefused=false,
    r => r.results.find(x=>x.id==='UI-BUTTON-GUIDED-CHOICES').evidence.variants[3].invalidRejected.pop(),
  ]) {
    const report = valid();
    mutate(report);
    assert.throws(() => verifyUiButtons(report, inputs));
  }
  return true;
}
