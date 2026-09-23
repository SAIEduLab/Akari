import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {currentNames} from './launch-identifiers.cjs';
import {root,sha} from './product-test-host.mjs';
import {editorIds,guiIds} from './verify-surface-results.mjs';
import {expectedLanguageIds} from './verify-language-results.mjs';

export const completedCommit='2f455619440f5abbfbb564927769c85341f25074';
export const completedManifestSha256='db939bbcde1c86ae51c39189d05357d27635e405511d667d6b7588b79f74bd63';
export const completedFixture='audit/fixtures/1.0.0';
export const completedProduct=completedFixture+'/source/Akari.html';
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p)));
const canonical=p=>Buffer.from(fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n'));
const sameIds=(a,b,label)=>{assert.equal(new Set(a).size,a.length,label+' duplicate');assert.deepEqual([...a].sort(),[...b].sort(),label);};
export function completedManifest(){
  const bytes=canonical(completedFixture+'/manifest.json');
  assert.equal(sha(bytes),completedManifestSha256,'completed release manifest changed');
  const m=JSON.parse(bytes);assert.equal(m.schema,'akari-completed-baseline-v1');
  assert.equal(m.sourceCommit,completedCommit);assert.equal(m.sourceRepository,'SAIEduLab/Akari');
  assert.equal(m.productVersion,'1.0.0');assert.equal(m.projectFormatVersion,3);assert.equal(m.programFormatVersion,3);
  for(const [p,f] of Object.entries(m.files)){
    const b=canonical(completedFixture+'/'+p);assert.equal(b.length,f.bytes,p+' bytes');assert.equal(sha(b),f.sha256,p+' hash');
  }
  return m;
}
export function verifyCompletedAuthority(policy,currentCore){
  const m=completedManifest(),fixed=p=>read(completedFixture+'/source/'+p);
  assert.equal(policy.releaseComplete,true,'completed source release decision must be explicit');
  assert.deepEqual(policy.completedBaseline,{sourceCommit:completedCommit,manifest:completedFixture+'/manifest.json',manifestSha256:completedManifestSha256,productSha256:m.productSha256});
  assert.equal(policy.comparison.requiredBaseline,completedCommit);
  assert.equal(policy.comparison.historicalBaseline,m.historicalBaseline.sourceCommit);
  assert.equal(policy.comparison.switchAfterCompletedRelease,true);
  assert.deepEqual(currentCore,fixed('audit/manifests/product-tests.json'),'completed core authority reduced/changed');
  const old=fixed('audit/manifests/quality-1.0.0.json');
  assert.deepEqual(policy.capabilities,old.capabilities,'completed capability/test mapping changed');
  assert.deepEqual(read('audit/manifests/browser-results.json'),fixed('audit/manifests/browser-results.json'),'completed browser case set changed');
  assert.deepEqual(read('audit/manifests/browser-obligations.json'),fixed('audit/manifests/browser-obligations.json'),'completed browser obligations changed');
  const forms=read('audit/manifests/language-form-coverage.json'),oldForms=fixed('audit/manifests/language-form-coverage.json');
  assert.deepEqual(forms.cases,oldForms.cases,'completed finite language cases changed');
  const inventory=fixed('audit/records/phase4-audit-inventory.json');
  assert.deepEqual(editorIds,inventory.editorIds,'completed editor IDs changed');assert.deepEqual(guiIds,inventory.guiIds,'completed GUI IDs changed');
  const language=read(completedFixture+'/evidence/akari-selftest-evidence-35816378510-1/language-browser.json');
  sameIds(expectedLanguageIds(forms),language.results.map(r=>r.id),'completed language IDs');
  for(const p of ['audit/suites/language-forms.js','audit/suites/editor-surface.js'])assert.equal(canonical(p).toString(),currentNames(canonical(completedFixture+'/source/'+p).toString()),'completed assertion suite changed beyond identifier correspondence: '+p);
  assert.equal(forms.baseline,completedCommit);assert.equal(forms.productSha256,m.productSha256);
  assert.equal(read('audit/browser/browser-audit-manifest.json').fixedBaseline,completedCommit);
  assert.deepEqual(read('audit/browser/browser-audit-manifest.json').groups,fixed('audit/browser/browser-audit-manifest.json').groups);
  return m;
}
export function verifyCompletedProvenance(){
  const m=completedManifest(),completion=read(completedFixture+'/completion.json');
  assert.equal(completion.commit,completedCommit);assert.equal(completion.verification.status,'PASS');
  assert.equal(completion.approval.mergeCommit,completedCommit);assert.equal(completion.jobs.length,8);
  for(const job of completion.jobs){assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');}
  const artifacts=completion.artifacts;assert.equal(artifacts.length,8);
  const aggregateArtifact=artifacts.find(a=>a.name.startsWith('akari-aggregate-'));
  const aggregate=read(completedFixture+'/evidence/'+aggregateArtifact.name+'/aggregate.json');
  assert.equal(aggregate.status,'MACHINE_PASS');assert.equal(aggregate.snapshot.head,completedCommit);
  assert.equal(aggregate.snapshot.productSha256,m.productSha256);
  assert.deepEqual(aggregate.provenance,{runId:completion.runId,runAttempt:completion.runAttempt});
  assert.equal(completion.verification.aggregateSha256,m.files['evidence/'+aggregateArtifact.name+'/aggregate.json'].sha256);
  const sourceFiles=Object.entries(m.files).filter(([,f])=>f.sourcePath);
  // Compare archived source bytes with actual immutable public Git objects in one process.
  const raw=cp.execFileSync('git',['cat-file','--batch'],{cwd:root,input:sourceFiles.map(([,f])=>completedCommit+':'+f.sourcePath+'\n').join(''),maxBuffer:32e6});
  let offset=0;
  for(const [p,f] of sourceFiles){const end=raw.indexOf(10,offset),header=raw.subarray(offset,end).toString().split(' ');assert.equal(header[1],'blob');const count=Number(header[2]);const bytes=raw.subarray(end+1,end+1+count);offset=end+count+2;assert.equal(header[0],f.gitBlobSha1,p);assert.equal(sha(bytes),f.sha256,p);assert.equal(aggregate.snapshot.files[f.sourcePath],f.sha256,p);}
  let evidenceFiles=0;
  for(const a of artifacts){
    assert.equal(a.expired,false);assert.equal(a.workflow_run.head_sha,completedCommit);assert.match(a.digest,/^sha256:[a-f0-9]{64}$/);
    if(a===aggregateArtifact)continue;
    const bundle=read(completedFixture+'/evidence/'+a.name+'/bundle.json');
    assert.equal(bundle.status,'PASS');assert.deepEqual(bundle.snapshot,aggregate.snapshot);assert.deepEqual(bundle.provenance,aggregate.provenance);
    assert.deepEqual(bundle.result,aggregate.jobs.find(j=>j.kind===bundle.kind)?.result);
    evidenceFiles+=Object.keys(bundle.files).length;
    for(const [p,f] of Object.entries(m.files).filter(([,f])=>f.artifactId===a.id&&f.artifactPath!=='bundle.json'))assert.equal(bundle.files[f.artifactPath],f.sha256,p+' differs from original sealed evidence');
  }
  assert.equal(evidenceFiles,completion.verification.evidenceFiles);assert.equal(evidenceFiles,1793);
  assert.equal(Object.keys(aggregate.snapshot.files).length,125);
  assert.equal(aggregate.coverage.capabilities.length,257);assert.equal(aggregate.coverage.language.length,42);
  assert.equal(aggregate.coverage.phases.length,16);assert.equal(aggregate.coverage.d09.length,28);
  return {sourceCommit:completedCommit,manifestSha256:completedManifestSha256,productSha256:m.productSha256,contractHashes:m.contractHashes,sourceFiles:sourceFiles.length,originalRun:completion.runId,originalAttempt:completion.runAttempt,inputFiles:125,evidenceFiles};
}
export function verifyFixedCore(report,expectedSnapshot){
  const m=completedManifest(),spec=read(completedFixture+'/source/audit/manifests/product-tests.json');
  assert.equal(report.schema,'akari-fixed-release-report-v1');
  assert.equal(report.status,'PASS');assert.equal(report.environment,'chromium');assert.ok(report.browser);
  assert.deepEqual(report.snapshot,expectedSnapshot);assert.equal(report.sourceCommit,completedCommit);
  assert.equal(report.manifestSha256,completedManifestSha256);assert.equal(report.canonicalProductSha256,m.productSha256);
  assert.equal(report.executedProductSha256,sha(fs.readFileSync(path.join(root,completedProduct))));
  sameIds(report.suites.map(s=>s.name),spec.suites.map(s=>s.name),'fixed suites');
  for(const expected of spec.suites){const actual=report.suites.find(s=>s.name===expected.name);sameIds(actual.results.map(r=>r.id),expected.ids,expected.name);assert.equal(actual.total,expected.ids.length);assert.equal(actual.passed,actual.total);assert.equal(actual.failed,0);assert.equal(actual.status,'PASS');assert.equal(actual.environment,'chromium');for(const r of actual.results){assert.equal(r.pass,true);assert.equal(r.detail,'PASS');if('status' in r)assert.equal(r.status,'PASS');}}
  assert.deepEqual(report.results,report.suites.flatMap(s=>s.results));assert.equal(report.total,884);assert.equal(report.passed,884);assert.equal(report.failed,0);
  return {sourceCommit:completedCommit,manifestSha256:completedManifestSha256,productSha256:m.productSha256,capabilities:257,coreIds:884,languageIds:605,editorIds:38,guiIds:9,browserTasks:27,browserCases:416};
}
