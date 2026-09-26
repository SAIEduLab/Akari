import fs from 'node:fs';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {gateSteps} from '../lib/gate-contract.mjs';
import {checkpointCommit,checkpointArchive,verifyCheckpointArchive,verifyCheckpointArchiveBytes} from '../lib/checkpoint-source.mjs';
import {completedFixture,completedProduct,completedManifestSha256,completedManifest,verifyFixedFeatures,verifyFixedAudio} from '../lib/completed-baseline.mjs';

const manifest=completedManifest(),bytes=fs.readFileSync(checkpointArchive),archive=JSON.parse(bytes);
verifyCheckpointArchiveBytes(bytes);
let rejected=0;
const reject=fn=>{assert.throws(fn);rejected++;};
reject(()=>verifyCheckpointArchiveBytes(Buffer.concat([bytes,Buffer.from(' ')])));
const blob=archive.sources[checkpointCommit]['Akari.html'],tree=Object.keys(archive.trees)[0];
for(const mutate of [
  a=>delete a.commits[checkpointCommit],a=>a.commits.main=a.commits[checkpointCommit],
  a=>a.commits[checkpointCommit]=Buffer.from('tree invalid\n').toString('base64'),
  a=>delete a.trees[tree],a=>a.trees[tree]=Buffer.from('changed tree').toString('base64'),
  a=>delete a.blobs[blob],a=>a.blobs[blob].sha256='candidate',a=>a.blobs[blob].bytes++,
  a=>a.blobs[blob].fixture='Akari.html',
  a=>a.blobs[blob].fixture='audit/fixtures/1.0.2/source/../../../../Akari.html',
  a=>a.sources[checkpointCommit]['Akari.html']='0'.repeat(40),
  a=>delete a.sources[checkpointCommit]['Akari.html'],
]){const bad=structuredClone(archive);mutate(bad);reject(()=>verifyCheckpointArchive(bad));}
reject(()=>verifyCheckpointArchive(archive,p=>{
  const b=Buffer.from(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'));
  return p===archive.blobs[blob].fixture?Buffer.concat([b,Buffer.from('x')]):b;
}));
const steps=gateSteps('browser','output');
for(const [id,runner] of [['fixed100','audit/run-historical-baseline.mjs'],['fixed102','audit/run-fixed-baseline.mjs'],['fixed102-features','audit/run-fixed-features.mjs']])
  assert.equal(steps.filter(s=>s[0]===id&&s[1]===runner).length,1,'required checkpoint runner '+id);
const report=JSON.parse(fs.readFileSync(completedFixture+'/evidence/akari-selftest-evidence-36235604048-1/editor-assets-101.json'));
Object.assign(report,{schema:'akari-fixed-editor-assets-v1',snapshot:snapshot('Akari.html'),sourceCommit:checkpointCommit,
  manifestSha256:completedManifestSha256,canonicalProductSha256:manifest.productSha256,
  executedProductSha256:sha(fs.readFileSync(completedProduct)),suiteSha256:manifest.files['source/audit/tests/editor-assets-101.mjs'].sha256});
verifyFixedFeatures(report,report.snapshot);
for(const mutate of [
  r=>r.results.pop(),r=>r.results.push(r.results[0]),r=>r.results[0].pass=false,r=>r.results[0].detail='SKIP',
  r=>r.results[0].status='SKIP',r=>r.results[0].id='new-expectation',r=>r.status='FAIL',r=>r.environment='node',
  r=>r.browser='',r=>r.pageErrors.push('error'),r=>r.networkRequests.push('https://example.test'),
  r=>r.schema='candidate',r=>r.sourceCommit='main',r=>r.manifestSha256='changed',
  r=>r.canonicalProductSha256='candidate',r=>r.executedProductSha256='changed',r=>r.suiteSha256='changed',
  r=>r.snapshot.head='old',r=>delete r.snapshot.files['AUDIT.md'],
]){const bad=structuredClone(report);mutate(bad);reject(()=>verifyFixedFeatures(bad,report.snapshot));}
// Both checkpoint generations must remain verifiable without remote Git or refs.
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>k.toLowerCase()!=='path'&&!/^GIT_(?:DIR|WORK_TREE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES)$/.test(k)));
env.PATH='';
const child=cp.spawnSync(process.execPath,['--input-type=module','-e',
  "import {verifyCompletedProvenance} from './audit/lib/completed-baseline.mjs';const p=verifyCompletedProvenance();console.log(JSON.stringify({commit:p.sourceCommit,files:p.sourceFiles,offline:p.offlineProvenance.sourceFiles}));"],
  {env,encoding:'utf8',timeout:15000});
assert.equal(child.status,0,child.error?.message||child.stderr);
assert.deepEqual(JSON.parse(child.stdout),{commit:checkpointCommit,files:59,offline:59});
const audio=JSON.parse(fs.readFileSync(completedFixture+'/evidence/akari-audio-codecs-linux-36235604048-1/report.json'));
Object.assign(audio,{snapshot:report.snapshot,fixtureManifestSha256:report.snapshot.files['audit/fixtures/audio-1.0.2/manifest.json'],fixedSourceCommit:checkpointCommit,manifestSha256:completedManifestSha256,canonicalProductSha256:manifest.productSha256,executedProductSha256:sha(fs.readFileSync(completedProduct)),suiteSha256:manifest.files['source/audit/tests/audio-codecs-102.mjs'].sha256});
verifyFixedAudio(audio,report.snapshot,'linux');
for(const mutate of [r=>r.fixedSourceCommit='main',r=>r.manifestSha256='bad',r=>r.canonicalProductSha256='candidate',r=>r.executedProductSha256='bad',r=>r.suiteSha256='changed',r=>r.results.pop(),r=>r.results[0].detail='SKIP',r=>r.results[0].pass=false]){const bad=structuredClone(audio);mutate(bad);reject(()=>verifyFixedAudio(bad,report.snapshot,'linux'));}
const auditReadme=fs.readFileSync('audit/README.md','utf8');
const inventory=JSON.parse(fs.readFileSync('audit/records/phase4-audit-inventory.json'));
assert.equal(inventory.audio102.fixedRunner,'audit/run-fixed-audio.mjs');
assert.equal(inventory.audio102.fixedArtifact,'fixed/report.json');
assert.equal(inventory.editorAssets101.fixedArtifact,'fixed102-editor-assets.json');
assert.equal(inventory.editorAssets101.historical101Artifact,'fixed101-editor-assets.json');
assert.match(auditReadme,/all ten successful jobs, nine fresh input/);
assert.doesNotMatch(auditReadme,/all eight successful jobs|all seven artifacts/);
assert.match(fs.readFileSync('audit/BASELINE.md','utf8'),/^# Completed 1\.0\.2 comparison checkpoint/);
console.log('Completed 1.0.2 checkpoint: '+rejected+' invalid proofs/reports rejected; documentation and offline provenance PASS');
