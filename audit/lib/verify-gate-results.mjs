import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {verify,verifyAuthority} from './verify-test-results.mjs';
import {verifyLanguageResults} from './verify-language-results.mjs';
import {verifySurfaceResults} from './verify-surface-results.mjs';
import {gateSteps} from './gate-contract.mjs';
import {ledger08,ledger09} from '../browser/legacy/audit-lib.cjs';
import {completedCommit,verifyFixedCore} from './completed-baseline.mjs';
export function verifyGateResults(dir,currentSnapshot) {
  const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name)));
  const manifest=JSON.parse(fs.readFileSync('audit/manifests/product-tests.json'));
  const receipt=read('gate.json');
  assert.equal(receipt.status,'PASS');assert.deepEqual(receipt.snapshot,currentSnapshot);
  assert.deepEqual(receipt.steps.map(s=>s.id),gateSteps('',dir).map(s=>s[0]));
  for(const s of receipt.steps){assert.equal(s.exit,0);assert.equal(s.signal,null);assert.ok(!s.error);assert.ok(fs.existsSync(path.join(dir,s.log)));}
  const current=read('current-selftest.json');verifyAuthority(manifest);verify(current,manifest,currentSnapshot);
  const completed=verifyFixedCore(read('completed-baseline-selftest.json'),currentSnapshot);
  assert.deepEqual(current.results.map(r=>r.id).sort(),read('completed-baseline-selftest.json').results.map(r=>r.id).sort(),'candidate lost a completed-release core guarantee');
  const baseline=read('baseline-selftest.json');
  assert.ok(typeof baseline.browser==='string'&&baseline.browser.length>0);
  assert.equal(baseline.fixtureSha256,currentSnapshot.files['audit/fixtures/0.8/Akari.html']);
  assert.equal(baseline.total,508);assert.equal(baseline.passed,508);assert.equal(baseline.failed,0);
  assert.equal(baseline.results.length,508);assert.equal(new Set(baseline.results.map(r=>r.id)).size,508);
  for(const r of baseline.results){assert.equal(r.pass,true);if('status' in r)assert.equal(r.status,'PASS');}
  const ledger=ledger08(fs.readFileSync('audit/fixtures/0.8/AUDIT.md','utf8'));
  const oldIds=[...new Set(ledger.entries.flatMap(e=>e.tests))];
  assert.equal(ledger.entries.length,122);assert.equal(oldIds.length,130);
  for(const id of oldIds)for(const r of [baseline,current])assert.equal(r.results.find(x=>x.id===id)?.pass,true,id);
  const rows=ledger09(fs.readFileSync('AUDIT.md','utf8'));
  assert.equal(rows.length,257);
  // All current core IDs are independently verified above. Resolve each wildcard
  // against the required authority, never against only the subset that happened to run.
  for(const row of rows)if(!row.selftest.includes('対象外（browser suiteで検査）'))for(let ref of row.selftest.split(';')){
    ref=ref.replaceAll('`','').trim();const ids=manifest.suites.flatMap(s=>s.ids);
    const required=ref.includes('*')?ids.filter(id=>id.startsWith(ref.split('*')[0].trim())):[ref];
    assert.ok(required.length);for(const id of required)assert.equal(current.results.find(r=>r.id===id)?.pass,true,row.id+': '+id);
  }
  const languageManifest=JSON.parse(fs.readFileSync('audit/manifests/language-form-coverage.json'));
  for(const env of ['node','browser']){
    const language=read('language-'+env+'.json');assert.equal(language.environment,env==='node'?'node':'chromium');
    verifyLanguageResults(language,languageManifest,currentSnapshot);
    verifySurfaceResults(read('editor-'+env+'.json'),'editor',currentSnapshot,env==='node'?'node':'chromium');
  }
  verifySurfaceResults(read('gui.json'),'gui',currentSnapshot,'chromium');
  const normal=read('normal-product.json');assert.equal(normal.status,'PASS');assert.deepEqual(normal.snapshot,currentSnapshot);
  for(const k of ['sourcePreserved','saveReload','exportOffline','noAuditGlobal','stringNotExecuted','freshContextIsolation'])assert.equal(normal[k],true);
  const bounds=read('language-boundaries.json');assert.equal(bounds.status,'PASS');assert.deepEqual(bounds.snapshot,currentSnapshot);
  assert.equal(bounds.results.length,90);assert.equal(bounds.timeoutMs,5000);assert.equal(bounds.runtimeEvaluationUnchanged,true);
  for(const r of bounds.results){assert.ok(r.ms>=0&&r.ms<5000);assert.equal(r.accepted,r.name==='long-valid');}
  const node=read('node-product.json');assert.equal(node.environment,'node');assert.equal(node.requiredBrowserComplete,false);
  assert.equal(node.reports.reduce((n,s)=>n+s.total,0),793);
  const external=read('externalization-static.json');assert.equal(external.status,'PASS');assert.equal(external.ids,884);
  return {fixedSourceCommit:completedCommit,completedBaseline:completed,baselineCapabilities:257,baselineRequiredTestIds:884,currentResults:884,currentCapabilityRows:257,
    historical08:{sourceCommit:'ec43018d5ba546d5aa9df9c2799b18260a3ab2d7',capabilities:122,requiredTestIds:130,results:508}};
}
