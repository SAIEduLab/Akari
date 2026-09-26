import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root, snapshot, sha} from './product-test-host.mjs';
import {verifyCompletedAuthority} from './completed-baseline.mjs';
export function verify(report, manifest, expectedSnapshot) {
  assert.equal(manifest.schema,'akari-product-tests-v1');
  assert.equal(report.schema,'akari-product-report-v1');
  assert.ok(typeof report.browser==='string'&&report.browser.length>0,'missing browser identity');
  assert.ok(manifest.suites.length>0,'empty manifest');
  assert.deepEqual(report.snapshot,expectedSnapshot,'snapshot mismatch');
  assert.equal(report.environment,'chromium','missing required environment');
  assert.equal(report.complete,true);
  assert.equal(report.status,'PASS');
  const unique = (values,label) => {assert.ok(values.length>0,'empty '+label);assert.equal(new Set(values).size,values.length,'duplicate '+label);return [...values].sort();};
  assert.deepEqual(unique(report.suites.map(s=>s.name),'suite'),unique(manifest.suites.map(s=>s.name),'expected suite'));
  let results=[];
  for(const spec of manifest.suites) {
    assert.deepEqual(spec.environments,['chromium']);
    const suite=report.suites.find(s=>s.name===spec.name);
    assert.equal(suite.environment,'chromium');assert.equal(suite.status,'PASS');
    assert.deepEqual(unique(suite.results.map(r=>r.id),'ID'),unique(spec.ids,'expected ID'),'ID set mismatch');
    assert.equal(suite.total,spec.ids.length);assert.equal(suite.passed,suite.total);assert.equal(suite.failed,0);
    for(const r of suite.results){assert.equal(r.pass,true,r.id+': '+r.detail);assert.equal(r.detail,'PASS');if(r.status!==undefined)assert.equal(r.status,'PASS');}
    results.push(...suite.results);
  }
  unique(results.map(r=>r.id),'global ID');
  assert.deepEqual(report.results,results);
  assert.equal(report.total,results.length);assert.equal(report.passed,results.length);assert.equal(report.failed,0);
  assert.equal(sha(JSON.stringify(results.map(r=>r.id).sort())),manifest.baselineIdSha256,'baseline expected set changed');
  return true;
}
export function verifyAuthority(manifest, policy=JSON.parse(fs.readFileSync(path.join(root,'audit/manifests/quality-1.0.2.json')))) {
  const map=JSON.parse(fs.readFileSync(path.join(root,'audit/manifests/externalization-map.json')));
  const specs=map.entries.filter(e=>e.symbol!=='runReleaseTests');
  assert.equal(policy.schema,'akari-quality-policy-v1');
  assert.equal(policy.targetProductVersion,'1.0.2');
  verifyCompletedAuthority(policy,manifest);
  assert.deepEqual(policy.entries.map(e=>[e.suite,e.id]),specs.flatMap(s=>s.testIds.map(id=>[s.symbol,id])),'guarantee inventory incomplete');
  const release=JSON.parse(fs.readFileSync(path.join(root,'audit/records/phase3-guarantee-transition.json')));
  const replacements=[
    ['VERSION-001 初版の版情報',['A10-VERSION-001 製品言語保存形式の契約']],
    ['SCHEMA 別版の拒否',['A10-PROJECT-METADATA']],
    ['T09-VERSION-CONTRACT',['A10-VERSION-CONTRACT']],
    ['T09-VERSION-REJECT-PROJECT',[]],
    ['T09-VERSION-REJECT-EXECUTABLE',['A10-EXECUTABLE-MALFORMED','A10-EXECUTABLE-ROUNDTRIP']],
    ['AUDIT SCHEMA wrong release duplicate IDs invalid data and excessive input',['AUDIT SCHEMA10 structure duplicate IDs invalid data and excessive input']],
    ['AUDIT MARKDOWN readable code initial data and material manifest',['AUDIT MARKDOWN10 readable code initial data and material manifest']],
  ];
  assert.equal(release.status,'IMPLEMENTED_SPECIFICATION_REPLACEMENT');
  assert.deepEqual(release.entries.map(e=>[e.oldId,e.replacementIds]),replacements);
  for(const e of release.entries){assert.equal(sha(e.originalSource),e.originalSourceSha256);assert.ok(e.originalSource.includes(e.oldId.replace(/^AUDIT /,'')));assert.equal(e.sourceCommit,'77c479425253aad5385095f7a4dd24a96414612c');}
  assert.deepEqual(policy.overrides.map(e=>[e.suite,e.removedIds]),[
    ['runVersion08Tests',['08 indent reject 12']],
    ...[...new Set(release.entries.map(e=>e.suite))].map(s=>[s,release.entries.filter(e=>e.suite===s).map(e=>e.oldId)])
  ],'unapproved guarantee retirement');
  for(const entry of policy.entries) {
    const expectedDisposition=entry.id==='T09-VERSION-REJECT-PROJECT'?'withdraw-old-version-only':
      entry.id==='08 indent reject 12'||replacements.some(([id])=>id===entry.id)?'replace':'maintain';
    assert.equal(entry.disposition,expectedDisposition,'unauthorized disposition '+entry.id);
    assert.ok(entry.reason.length>20);
    const replacement=replacements.find(([id])=>id===entry.id);
    assert.equal(entry.currentTest,entry.id==='08 indent reject 12'?null:replacement?replacement[1][0]||null:entry.id);
    if(replacement)assert.deepEqual(entry.replacementIds,replacement[1]);
  }
  assert.deepEqual(['maintain','replace','withdraw-old-version-only'].map(d=>policy.entries.filter(e=>e.disposition===d).length),[876,7,1]);
  const transition=JSON.parse(fs.readFileSync(path.join(root,'audit/records/language-transition.json')));
  assert.equal(transition.status,'IMPLEMENTED_SPECIFICATION_REPLACEMENT');
  const forms=JSON.parse(fs.readFileSync(path.join(root,'audit/manifests/language-form-coverage.json')));
  assert.deepEqual(transition.entries[0].replacementIds,forms.cases.filter(c=>c.transition).map(c=>'A09-SURFACE-'+c.id+'/'+c.key));
  assert.equal(transition.entries[0].replacementIds.length,8);
  assert.deepEqual(manifest.suites.map(s=>({name:s.name,ids:s.ids})),specs.map(e=>({name:e.symbol,ids:e.testIds.filter(id=>id!=='08 indent reject 12').flatMap(id=>id==='T09-VERSION-REJECT-PROJECT'?['A10-PROJECT-MARKER-BOUNDARIES']:replacements.find(r=>r[0]===id)?.[1]||[id])})));
  assert.equal(manifest.baselineIdSha256,sha(JSON.stringify(manifest.suites.flatMap(s=>s.ids).sort())));
  const audit=fs.readFileSync(path.join(root,'AUDIT.md'),'utf8');
  const ids=new Set(manifest.suites.flatMap(s=>s.ids));
  for(const line of audit.split(/\r?\n/).filter(l=>/^\| [a-z]+:/.test(l))) {
    const cell=line.split('|')[8].trim();
    if(cell.includes('対象外（browser suiteで検査）'))continue;
    for(let ref of cell.split(';')) {
      ref=ref.replaceAll('`','').trim();
      if(ref.includes('*')) {const prefix=ref.split('*')[0].trim();assert.ok([...ids].some(id=>id.startsWith(prefix)),'unknown contract wildcard '+ref);}
      else assert.ok(ids.has(ref),'contract ID missing '+ref);
    }
  }
  const capabilities=audit.split(/\r?\n/).filter(l=>/^\| [a-z]+:/.test(l)).map(l=>l.split('|')[1].trim());
  assert.equal(capabilities.length,257);
  assert.deepEqual(policy.capabilities.map(c=>c.id),capabilities,'1.0.0 capability inventory incomplete');
  // Retain the original 0.8 capability guarantees as historical obligations.
  const old=fs.readFileSync(path.join(root,'audit/fixtures/0.8/AUDIT.md'),'utf8').split('## 0.8 能力・自己検査追跡台帳')[1];
  const ledger=JSON.parse(old.match(/```json\s*(\{[\s\S]*?\})\s*```/)[1]);
  assert.equal(ledger.entries.length,122);
  for(const entry of ledger.entries) for(const id of entry.tests) assert.ok(ids.has(id),'fixed baseline capability missing '+id);
  assert.equal(policy.comparison.switchAfterVerifiedCheckpoint,true);
}
if(process.argv[1] && path.resolve(process.argv[1])===path.resolve(import.meta.filename)) {
  const [reportPath,product='Akari.html']=process.argv.slice(2);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'audit/manifests/product-tests.json')));
  verifyAuthority(manifest);verify(JSON.parse(fs.readFileSync(reportPath)),manifest,snapshot(product));
  console.log('External product report: PASS');
}
