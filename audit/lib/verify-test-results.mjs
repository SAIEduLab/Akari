import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root, snapshot, sha} from './product-test-host.mjs';

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
  assert.equal(sha(JSON.stringify(results.map(r=>r.id).sort())),manifest.fixedIdSha256,'fixed expected ID set changed');
  return true;
}
export function verifyAuthority(manifest) {
  assert.equal(manifest.schema,'akari-product-tests-v1');
  const ids=manifest.suites.flatMap(s=>s.ids);
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(manifest.fixedIdSha256,sha(JSON.stringify([...ids].sort())));
  const audit=fs.readFileSync(path.join(root,'AUDIT.md'),'utf8');
  const known=new Set(ids);
  for(const line of audit.split(/\r?\n/).filter(l=>/^\| [a-z]+:/.test(l))) {
    const cell=line.split('|')[8].trim();
    if(cell.includes('対象外（browser suiteで検査）'))continue;
    for(let ref of cell.split(';')) {
      ref=ref.replaceAll('`','').trim();
      if(ref.includes('*')) assert.ok(ids.some(id=>id.startsWith(ref.split('*')[0].trim())),'unknown capability test '+ref);
      else assert.ok(known.has(ref),'missing capability test '+ref);
    }
  }
  return true;
}
if(process.argv[1] && path.resolve(process.argv[1])===path.resolve(import.meta.filename)) {
  const [reportPath,product='Akari.html']=process.argv.slice(2);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'audit/manifests/product-tests.json')));
  verifyAuthority(manifest);verify(JSON.parse(fs.readFileSync(reportPath)),manifest,snapshot(product));
  console.log('External product report: PASS');
}
