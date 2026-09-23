import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {snapshot} from './product-test-host.mjs';
import {inlineCases,inlineNegative} from '../fixtures/language/inline.mjs';
export function expectedLanguageIds(manifest) {
  return [...manifest.cases.map(c=>'A09-SURFACE-'+c.id+'/'+c.key),
    ...Array.from({length:37},(_,i)=>([31,32].includes(i)?'A10-INLINE-REPLACES-':'')+'A09-SURFACE-NEG-'+String(i+1).padStart(3,'0')),
    ...inlineCases.map(c=>c.id),...inlineNegative.map(([id])=>'A10-INLINE-NEG/'+id),
    ...['003','004','005','006','007','009','012','015'].map(n=>'A09-ORDER-'+n),'A09-SURFACE-INDEPENDENT-VALUES'];
}
export function verifyLanguageResults(report,manifest,currentSnapshot) {
  const expected=expectedLanguageIds(manifest);
  assert.equal(new Set(expected).size,605,'authority incomplete/duplicate');
  assert.equal(report.total,expected.length);
  assert.deepEqual([...report.results].map(r=>r.id).sort(),expected.sort());
  const byId=new Map(report.results.map(r=>[r.id,r]));
  assert.equal(byId.size,report.total,'duplicate result');
  for(const id of expected) {
    assert.equal(byId.get(id).status,'PASS',id);
    if('pass' in byId.get(id))assert.equal(byId.get(id).pass,true,id);
  }
  const blocked=0;
  assert.equal(report.failed,0);
  assert.equal(report.blocked,blocked);
  assert.equal(report.deferred,0);
  assert.equal(report.status,blocked?'BLOCKED':'PASS');
  assert.ok(['node','chromium'].includes(report.environment),'missing required environment');
  if(report.environment==='chromium')assert.ok(typeof report.browser==='string'&&report.browser.length>0,'missing browser identity');
  assert.equal(report.phase3LanguageComplete,!blocked&&report.environment==='chromium');
  assert.deepEqual(report.snapshot,currentSnapshot,'unbound/stale snapshot');
  return {status:report.status,phase3LanguageComplete:report.phase3LanguageComplete,blocked};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const report=JSON.parse(fs.readFileSync(process.argv[2]));
  console.log(verifyLanguageResults(report,JSON.parse(fs.readFileSync('audit/manifests/language-form-coverage.json')),snapshot('Akari.html')));
  process.exitCode=report.phase3LanguageComplete?0:2;
}
