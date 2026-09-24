import fs from 'node:fs';
import assert from 'node:assert/strict';
import {currentCapabilities,currentBrowserContract,currentGuiIds,verifyRetirementRecord,verifyNoAutomaticPersistence} from '../lib/persistence-transition.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));
const html=fs.readFileSync('Akari.html','utf8');verifyNoAutomaticPersistence(html);verifyRetirementRecord();
for(const addition of ["indexedDB.open('new-name')", "localStorage.setItem('project','data')", "sessionStorage.setItem('draft','data')", 'scheduleAutosave()', '<div id="recoveryModal"></div>', '\\u81ea\\u52d5\\u4fdd\\u5b58'])
  assert.throws(()=>verifyNoAutomaticPersistence(html+'\n'+addition));
const record=read('audit/records/autosave-retirement.json');
for(const mutate of [r=>r.capabilityChanges.pop(),r=>r.browserReplacements.pop(),r=>r.guiReplacements.push(r.guiReplacements[0]),r=>r.authorization.scope='skip all persistence checks',r=>r.unchanged.pop()]){
  const bad=structuredClone(record);mutate(bad);assert.throws(()=>verifyRetirementRecord(bad));
}
const prefix='audit/fixtures/1.0.0/source/';
const frozen=read(prefix+'audit/manifests/quality-1.0.0.json').capabilities,current=read('audit/manifests/quality-1.0.0.json').capabilities;
assert.deepEqual(current,currentCapabilities(frozen));
for(const mutate of [a=>a.pop(),a=>a[0].core='',a=>a.find(x=>x.id==='save:manual-only').browser='',a=>a.push(a[0])]){const bad=structuredClone(current);mutate(bad);assert.throws(()=>assert.deepEqual(bad,currentCapabilities(frozen)));}
const browser=currentBrowserContract(read(prefix+'audit/manifests/browser-results.json'));
assert.deepEqual(browser,read('audit/manifests/browser-results.json'));
for(const mutate of [b=>b.entries[0].keys.pop(),b=>b.entries[0].keys.push('invented'),b=>b.entries[0].keys.push(b.entries[0].keys[0])]){const bad=structuredClone(browser);mutate(bad);assert.throws(()=>assert.deepEqual(bad,browser));}
const gui=currentGuiIds(read(prefix+'audit/records/phase4-audit-inventory.json').guiIds);
assert.equal(gui.length,9);assert.equal(new Set(gui).size,9);
console.log('Persistence retirement: source absence, exact scope, retained guarantees and negative mutations PASS');
