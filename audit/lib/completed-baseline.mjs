import {audioIds102,verifyAudio102} from './release-102-contract.mjs';
import {verifyCompletedProvenance as verifyPreviousCheckpoint} from './historical-checkpoint-101.mjs';
import {verifyRetirementRecord} from './persistence-transition.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,sha} from './product-test-host.mjs';
import {editorIds,guiIds} from './verify-surface-results.mjs';
import {expectedLanguageIds} from './verify-language-results.mjs';
import {gitObjectHash} from './historical-source.mjs';
import {readCheckpointSource,verifyCheckpointSources} from './checkpoint-source.mjs';
import {editorAssetIds,verifyEditorAssets} from './release-101-contract.mjs';
import {verifyCompletedProvenance as verifyHistoricalRelease} from './historical-release-baseline.mjs';

export const completedCommit='1207f8a44b783afbb2274e794759de4c58edb450';
export const completedManifestSha256='76a2e673285ec05ca8d4e81d096d08a89ee3bd3c461b4ad194abd5b51aa03732';
export const completedFixture='audit/fixtures/1.0.2';
export const completedCompletionSha256='964a3c9bf52e03d68d3a25db2e4f83f4cb3532afc623c6b2bb77c601ec06cbfb';
export const completedProduct=completedFixture+'/source/Akari.html';
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p)));
const canonical=p=>/\.(?:mp3|wav|m4a|flac|ogg|opus|aac)$/.test(p)?fs.readFileSync(path.join(root,p)):Buffer.from(fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n'));
const sameIds=(a,b,label)=>{assert.equal(new Set(a).size,a.length,label+' duplicate');assert.deepEqual([...a].sort(),[...b].sort(),label);};
export function completedManifest(){
  const bytes=canonical(completedFixture+'/manifest.json');
  assert.equal(sha(bytes),completedManifestSha256,'completed release manifest changed');
  const m=JSON.parse(bytes);assert.equal(m.schema,'akari-completed-checkpoint-v2');
  assert.equal(m.sourceCommit,completedCommit);assert.equal(m.sourceRepository,'SAIEduLab/Akari');
  assert.equal(m.productVersion,'1.0.2');assert.equal(m.projectFormatVersion,3);assert.equal(m.programFormatVersion,3);
  for(const [p,f] of Object.entries(m.files)){
    const b=canonical(completedFixture+'/'+p);assert.equal(b.length,f.bytes,p+' bytes');assert.equal(sha(b),f.sha256,p+' hash');
  }
  return m;
}
export function verifyCompletedAuthority(policy,currentCore){
  const m=completedManifest(),fixed=p=>read(completedFixture+'/source/'+p);
  assert.equal(policy.releaseComplete,true,'completed 1.0.2 source decision required');
  assert.equal(policy.policy,'user-authorized-completed-release');
  assert.deepEqual(policy.comparison,{"requiredBaseline": "1207f8a44b783afbb2274e794759de4c58edb450", "completionEvidence": ["commit", "artifact hashes", "capability/test mapping", "validation results"], "reason": "Completed 1.0.2 at the exact merged source 1207f8a44b783afbb2274e794759de4c58edb450, with ten successful jobs and nine verified input bundles from 36235604048/1. Completion applies only to this fixed source. Every candidate requires fresh machine and semantic review; historical 1.0.1, 1.0.0 and 0.8 guarantees remain mandatory.", "historicalBaseline": "ec43018d5ba546d5aa9df9c2799b18260a3ab2d7", "switchAfterVerifiedCheckpoint": true});
  assert.deepEqual(policy.completionRecord,{sourceCommit:completedCommit,path:completedFixture+'/completion.json',sha256:completedCompletionSha256,scope:'fixed-source-only'});
  assert.equal(policy.checkpointApproved,true,'explicit checkpoint authorization required');
  assert.deepEqual(policy.completedBaseline,{sourceCommit:completedCommit,manifest:completedFixture+'/manifest.json',manifestSha256:completedManifestSha256,productSha256:m.productSha256});
  assert.equal(policy.comparison.requiredBaseline,completedCommit);
  assert.equal(policy.comparison.historicalBaseline,'ec43018d5ba546d5aa9df9c2799b18260a3ab2d7');
  assert.equal(policy.comparison.switchAfterVerifiedCheckpoint,true);
  assert.equal(policy.comparison.switchAfterCompletedRelease,undefined);
  assert.deepEqual(currentCore,fixed('audit/manifests/product-tests.json'),'completed core authority reduced/changed');
  const old=fixed('audit/manifests/quality-1.0.0.json');
  verifyRetirementRecord();
  assert.deepEqual(policy.capabilities,old.capabilities,'unapproved capability/test mapping change');
  assert.deepEqual(read('audit/manifests/browser-results.json'),fixed('audit/manifests/browser-results.json'),'unapproved browser case set change');
  assert.deepEqual(read('audit/manifests/browser-obligations.json'),fixed('audit/manifests/browser-obligations.json'),'completed browser obligations changed');
  const forms=read('audit/manifests/language-form-coverage.json'),oldForms=fixed('audit/manifests/language-form-coverage.json');
  assert.deepEqual(forms.cases,oldForms.cases,'completed finite language cases changed');
  const inventory=fixed('audit/records/phase4-audit-inventory.json');
  assert.deepEqual(editorIds,inventory.editorIds,'completed editor IDs changed');assert.deepEqual(guiIds,inventory.guiIds,'unapproved GUI IDs change');
  const language=read(completedFixture+'/evidence/akari-selftest-evidence-36235604048-1/language-browser.json');
  sameIds(expectedLanguageIds(forms),language.results.map(r=>r.id),'completed language IDs');
  for(const p of ['audit/suites/language-forms.js','audit/suites/editor-surface.js'])assert.equal(canonical(p).toString(),canonical(completedFixture+'/source/'+p).toString(),'frozen 1.0.1 assertion suite changed: '+p);
  assert.equal(forms.baseline,completedCommit);assert.equal(forms.productSha256,m.productSha256);
  assert.equal(read('audit/browser/browser-audit-manifest.json').fixedBaseline,completedCommit);
  assert.deepEqual(read('audit/browser/browser-audit-manifest.json').groups,fixed('audit/browser/browser-audit-manifest.json').groups);
  assert.deepEqual(policy.editorAssetIds,editorAssetIds,'1.0.1 feature guarantee inventory');
  for(const p of ['audit/tests/editor-assets-101.mjs','audit/lib/release-101-contract.mjs'])
    assert.equal(canonical(p).toString(),canonical(completedFixture+'/source/'+p).toString(),'frozen 1.0.2 assertions changed: '+p);
  assert.deepEqual(policy.audioIds,audioIds102,'1.0.2 audio guarantee inventory');
  for(const p of ['audit/tests/audio-codecs-102.mjs',...Object.values(m.files).filter(f=>f.sourcePath?.startsWith('audit/fixtures/audio-1.0.2/')).map(f=>f.sourcePath)])
    assert.deepEqual(canonical(p),readCheckpointSource(completedCommit,p),'frozen audio assertion or fixture changed: '+p);
  return m;
}
export function verifyCompletedProvenance(){
  const m=completedManifest(),bytes=canonical(completedFixture+'/completion.json');
  assert.equal(sha(bytes),completedCompletionSha256,'completion decision changed');
  const completion=JSON.parse(bytes);
  assert.equal(completion.schema,'akari-completed-checkpoint-evidence-v2');
  assert.equal(completion.commit,completedCommit);assert.equal(completion.verification.status,'PASS');
  assert.equal(completion.approval.kind,'user-authorized-completed-release-checkpoint');
  assert.equal(completion.approval.releaseComplete,true);
  const previous=verifyPreviousCheckpoint();
  assert.equal(m.previousCheckpoint.sourceCommit,previous.sourceCommit);
  assert.equal(m.previousCheckpoint.manifestSha256,previous.manifestSha256);
  assert.equal(completion.jobs.length,10);assert.equal(new Set(completion.jobs.map(j=>j.name)).size,10);
  for(const job of completion.jobs){assert.equal(job.head_sha,completedCommit);assert.equal(String(job.run_id),completion.runId);assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');}
  const artifacts=completion.artifacts;assert.equal(artifacts.length,10);assert.equal(new Set(artifacts.map(a=>a.id)).size,10);assert.equal(new Set(artifacts.map(a=>a.name)).size,10);
  const aggregateArtifact=artifacts.find(a=>a.name.startsWith('akari-aggregate-'));
  const aggregate=read(completedFixture+'/evidence/'+aggregateArtifact.name+'/aggregate.json');
  assert.equal(aggregate.status,'MACHINE_PASS');assert.equal(aggregate.releaseComplete,false,'original machine result must stay unchanged');assert.equal(aggregate.snapshot.head,completedCommit);
  assert.equal(aggregate.snapshot.productSha256,m.productSha256);assert.deepEqual(aggregate.provenance,{runId:completion.runId,runAttempt:completion.runAttempt});
  assert.equal(completion.verification.aggregateSha256,m.files['evidence/'+aggregateArtifact.name+'/aggregate.json'].sha256);
  const sourceFiles=Object.entries(m.files).filter(([,f])=>f.sourcePath),offlineProvenance=verifyCheckpointSources();
  for(const [p,f] of sourceFiles){const b=readCheckpointSource(completedCommit,f.sourcePath);assert.equal(gitObjectHash('blob',b),f.gitBlobSha1,p);assert.equal(sha(b),f.sha256,p);assert.equal(aggregate.snapshot.files[f.sourcePath],f.sha256,p);}
  let evidenceFiles=0;const kinds=[];
  for(const a of artifacts){
    assert.equal(a.expired,false);assert.equal(a.workflow_run.head_sha,completedCommit);assert.match(a.digest,/^sha256:[a-f0-9]{64}$/);
    if(a===aggregateArtifact)continue;
    const bundle=read(completedFixture+'/evidence/'+a.name+'/bundle.json');kinds.push(bundle.kind);
    assert.equal(bundle.status,'PASS');assert.deepEqual(bundle.snapshot,aggregate.snapshot);assert.deepEqual(bundle.provenance,aggregate.provenance);
    assert.deepEqual(bundle.result,aggregate.jobs.find(j=>j.kind===bundle.kind)?.result);
    evidenceFiles+=Object.keys(bundle.files).length;
    for(const [p,f] of Object.entries(m.files).filter(([,f])=>f.artifactId===a.id&&f.artifactPath!=='bundle.json'))assert.equal(bundle.files[f.artifactPath],f.sha256,p);
  }
  assert.deepEqual(kinds.sort(),['static','selftest','audio-codecs-linux','audio-codecs-win32',...['session','ui','limits','schemas','extra'].map(g=>'full-browser-'+g)].sort());
  assert.equal(evidenceFiles,3322);assert.equal(evidenceFiles,completion.verification.evidenceFiles);assert.equal(Object.keys(aggregate.snapshot.files).length,334);
  const feature=read(completedFixture+'/evidence/akari-selftest-evidence-36235604048-1/editor-assets-101.json');verifyEditorAssets(feature,aggregate.snapshot);
  for(const platform of ['linux','win32'])verifyAudio102(read(completedFixture+'/evidence/akari-audio-codecs-'+platform+'-36235604048-1/report.json'),aggregate.snapshot,platform);
  assert.equal(aggregate.coverage.capabilities.length,257);assert.equal(aggregate.coverage.language.length,42);assert.equal(aggregate.coverage.phases.length,16);assert.equal(aggregate.coverage.d09.length,28);
  return {sourceCommit:completedCommit,manifestSha256:completedManifestSha256,productSha256:m.productSha256,contractHashes:m.contractHashes,sourceFiles:sourceFiles.length,originalRun:completion.runId,originalAttempt:completion.runAttempt,inputFiles:334,evidenceFiles,offlineProvenance,releaseComplete:true,completionRecord:completedFixture+'/completion.json',completionSha256:completedCompletionSha256,previousCheckpoint:previous.sourceCommit};
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
  return {sourceCommit:completedCommit,manifestSha256:completedManifestSha256,productSha256:m.productSha256,capabilities:257,coreIds:884,languageIds:605,editorIds:38,guiIds:9,browserTasks:27,browserCases:416,editorAssetIds:15};
}

export function verifyFixedFeatures(report,expectedSnapshot){
  const m=completedManifest();verifyEditorAssets(report,expectedSnapshot);
  assert.equal(report.schema,'akari-fixed-editor-assets-v1');
  assert.equal(report.sourceCommit,completedCommit);assert.equal(report.manifestSha256,completedManifestSha256);
  assert.equal(report.canonicalProductSha256,m.productSha256);
  assert.equal(report.executedProductSha256,sha(fs.readFileSync(path.join(root,completedProduct))));
  assert.equal(report.suiteSha256,m.files['source/audit/tests/editor-assets-101.mjs'].sha256);
  for(const r of report.results){assert.equal(r.detail,'PASS');if('status' in r)assert.equal(r.status,'PASS');}
  return {sourceCommit:completedCommit,editorAssetIds:15,suiteSha256:report.suiteSha256};
}

export function verifyFixedAudio(report,expectedSnapshot,platform){
  const m=completedManifest();verifyAudio102(report,expectedSnapshot,platform);
  assert.equal(report.fixedSourceCommit,completedCommit);assert.equal(report.manifestSha256,completedManifestSha256);
  assert.equal(report.canonicalProductSha256,m.productSha256);
  assert.equal(report.executedProductSha256,sha(fs.readFileSync(path.join(root,completedProduct))));
  assert.equal(report.suiteSha256,m.files['source/audit/tests/audio-codecs-102.mjs'].sha256);
  return {sourceCommit:completedCommit,platform,cases:audioIds102.length,suiteSha256:report.suiteSha256};
}
