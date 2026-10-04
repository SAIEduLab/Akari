import assert from 'node:assert/strict';
import {verifyTriggerReport,triggerWrongMeaning} from './ux-repair03-trigger-contract.mjs';
import {verifySpeechReport,speechWrongMeaning} from './ux-repair03-speech-contract.mjs';
import {verifyListRepairReport,listRepairWrongMeaning} from './ux-repair03-list-contract.mjs';

export const repairFollowupInputs=[
  ['ux-repair03-trigger.json',verifyTriggerReport,triggerWrongMeaning],
  ['ux-repair03-speech.json',verifySpeechReport,speechWrongMeaning],
  ['ux-repair03-list.json',verifyListRepairReport,listRepairWrongMeaning],
];

// Keep the required control registry independent of the exported implementations.
// Removing a suite or a meaning mutation must fail, rather than reduce coverage.
const requiredMeaning={
  'ux-repair03-trigger.json':[
    'open-mutates','cancel-mutates-history','literal-body-lost','event-not-run',
    'selection-edits-event','empty-selection-rewrites-start','empty-body-replaces-start',
    'other-owner-changed','sibling-body-changed','header-reformats-body','linked-trigger-cascades',
    'linked-other-prefix-body-lost','multiple-target-hidden','key-filter-lost','message-filter-lost',
    'layout-clipped','layout-wrong-zoom','layout-pointer-blocked',
  ],
  'ux-repair03-speech.json':[
    'speaker-missing','other-speaker-body','copy-adds-name','speaker-clipped',
    'stale-pair-after-update','stop-retains-dialog','clone-unidentified',
    'generic-value-labelled-speech','B10-time-extended','short-speech-clipped',
    'rerun-missing','page-loses-speaker',
  ],
  'ux-repair03-list.json':[
    'wrong-answer','source-reformatted','silent-conversion','runtime-write','data-reordered',
    'selection-commits','undo-lost','scope-leak','stale-overwrite','old-record-other-body',
    'cancel-mutates','discard-pending','clipped-control','isolated-exception',
    'isolated-wrong-owner','player-lost-error','missing-result','duplicate-result',
  ],
};

export function verifyRepairFollowupInputs(read){
  assert.deepEqual(repairFollowupInputs.map(([file])=>file),Object.keys(requiredMeaning),'Required followup suites');
  return repairFollowupInputs.map(([file,verify])=>({file,cases:verify(read(file))}));
}

// Alter copies of actual evidence. These are validator controls, never additional
// product execution cases. Every registered report and meaning control is required.
export function verifyRepairFollowupBundle(read){
  const reports=Object.fromEntries(repairFollowupInputs.map(([file])=>[file,read(file)]));
  const results=verifyRepairFollowupInputs(file=>reports[file]);
  const negative=[];
  const generic=[
    ['missing-row',r=>r.results.pop()],
    ['duplicate-row',r=>r.results[1]=structuredClone(r.results[0])],
    ['failed-report',r=>r.status='FAIL'],
    ['failed-row',r=>r.results[0].status='FAIL'],
    ['wrong-snapshot',r=>r.snapshot.productSha256='0'.repeat(64)],
    ['wrong-browser',r=>r.environment.browser='0.0.0.0'],
    ['page-error',r=>r.pageErrors.push('exception')],
    ['external-request',r=>r.networkRequests.push('https://example.invalid')],
  ];
  const expectedIds=[];
  for(const [file,verify,meaning]of repairFollowupInputs){
    assert.deepEqual(meaning.map(([id])=>id),requiredMeaning[file],'Required meaning rejection controls: '+file);
    const mutations=[...generic,...meaning];
    assert.equal(new Set(mutations.map(([id])=>id)).size,mutations.length,'Unique rejection IDs: '+file);
    for(const [id,mutate]of mutations){
      const key=file+'/'+id;expectedIds.push(key);
      const bad=structuredClone(reports[file]);mutate(bad);
      assert.throws(()=>verify(bad),key);
      negative.push({id:key,rejected:true});
    }
    const missing=file+'/missing-report';expectedIds.push(missing);
    assert.throws(()=>verifyRepairFollowupInputs(name=>name===file?undefined:reports[name]),missing);
    negative.push({id:missing,rejected:true});
  }
  assert.deepEqual(negative.map(row=>row.id),expectedIds);
  assert.equal(negative.length,75,'Complete additional rejection controls');
  return {results,negative};
}
