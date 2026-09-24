import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const read=p=>JSON.parse(fs.readFileSync(p));
// This is the complete authorized exception, not a configurable exemption list.
export const browserReplacements = [
  ['browser-session','autosave-draft-recovery','draft-session-without-persistence'],
  ['browser-storage-media','invalid-syntax-save-and-format3-storage-isolation','invalid-syntax-file-roundtrip-without-persistence'],
];
export const guiReplacements = [
  ['A10-GUI/unregistered-draft-autosave-registration','A10-GUI/unregistered-draft-explicit-registration'],
  ['A10-GUI/corrupt-autosave-preserves-current','A10-GUI/retired-storage-isolation'],
];
const retirementReason='User-approved complete autosave retirement: require no automatic project/draft persistence; retain manual file roundtrip, draft separation, invalid-input and unsaved-state protection.';
export function currentCapabilities(frozen) {
  const expected=structuredClone(frozen);
  for(const row of expected){
    for(const [task,oldId,newId] of browserReplacements)row.browser=row.browser.replaceAll(task+':'+oldId,task+':'+newId);
    if(row.id==='save:autosave'){row.id='save:manual-only';row.reason=retirementReason;}
  }
  return expected;
}
export function currentBrowserContract(frozen) {
  const expected=structuredClone(frozen);
  for(const [task,oldId,newId] of browserReplacements){
    const entry=expected.entries.find(e=>e.task===task);assert.equal(entry.keys.filter(k=>k===oldId).length,1);
    entry.keys=entry.keys.map(k=>k===oldId?newId:k);
  }
  return expected;
}
export const currentGuiIds=frozen=>frozen.map(id=>guiReplacements.find(([old])=>old===id)?.[1]||id);
export function verifyRetirementRecord(record=read('audit/records/autosave-retirement.json')) {
  const expected=read('audit/fixtures/1.0.0/source/audit/manifests/quality-1.0.0.json').capabilities;
  const current=currentCapabilities(expected);
  assert.deepEqual(record.capabilityChanges,expected.flatMap((before,i)=>JSON.stringify(before)===JSON.stringify(current[i])?[]:[{oldId:before.id,before,after:current[i]}]));
  assert.deepEqual(record.browserReplacements.map(e=>[e.task,e.oldId,e.newId]),browserReplacements);
  assert.deepEqual(record.guiReplacements.map(e=>[e.oldId,e.newId]),guiReplacements);
  // Bind the reviewed rationale, authorization, retained guarantees and exact scope as well.
  const digest=crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
  assert.equal(digest,'5311ec6649155ac01b351e9a5bcd36e78cb015a86f3b1fedb270764ad8d7253f','unreviewed retirement scope/authorization change');
}
export function verifyNoAutomaticPersistence(html) {
  const decoded=html.replace(/\\u([0-9a-f]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
  assert.doesNotMatch(decoded,/autosave|自動保存|recovery(?:Epoch|Data|Modal|Restore|Discard|Text)?|captureCallableDraft|restoreCallableDraft|save-state|akari-workspace/i,'retired code/UI remains');
  assert.doesNotMatch(decoded,/indexedDB|sessionStorage|\bStorage\b|\bcaches\b|navigator\s*\.\s*storage|showSaveFilePicker|showDirectoryPicker/,'automatic persistence API remains');
  assert.match(html,/const STORAGE_KEYS = Object\.freeze\(\{\s*uiLevel: 'akari\.uiLevel\.v1',\s*\}\);/);
  const allowed=["localStorage.setItem(STORAGE_KEYS.uiLevel, $('#uiLevel').value)","localStorage.getItem(STORAGE_KEYS.uiLevel)"];
  let rest=html;for(const call of allowed){assert.equal(rest.split(call).length,2,'UI setting access changed');rest=rest.replace(call,'');}
  assert.doesNotMatch(rest,/localStorage/,'unexpected browser storage access');
  for(const required of ['function validateCallableDraft(', 'function saveProject(', 'function openProject(', 'function confirmLose(', 'function restoreSnap(', "window.addEventListener('beforeunload'"])
    assert.ok(html.includes(required),'retained operation missing: '+required);
}
