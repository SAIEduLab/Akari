import fs from 'node:fs';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {gateSteps} from '../lib/gate-contract.mjs';
import {checkpointCommit,checkpointArchive,verifyCheckpointArchive,verifyCheckpointArchiveBytes} from '../lib/checkpoint-101-source.mjs';
import {completedFixture,completedProduct,completedManifestSha256,completedManifest,verifyFixedFeatures} from '../lib/historical-checkpoint-101.mjs';

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
  a=>a.blobs[blob].fixture='audit/fixtures/1.0.1/source/../../../../Akari.html',
  a=>a.sources[checkpointCommit]['Akari.html']='0'.repeat(40),
  a=>delete a.sources[checkpointCommit]['Akari.html'],
]){const bad=structuredClone(archive);mutate(bad);reject(()=>verifyCheckpointArchive(bad));}
reject(()=>verifyCheckpointArchive(archive,p=>{
  const b=Buffer.from(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'));
  return p===archive.blobs[blob].fixture?Buffer.concat([b,Buffer.from('x')]):b;
}));
const steps=gateSteps('browser','output');
for(const [id,runner] of [['fixed100','audit/run-historical-baseline.mjs'],['fixed101','audit/run-historical-101.mjs'],['fixed101-features','audit/run-historical-101-features.mjs']])
  assert.equal(steps.filter(s=>s[0]===id&&s[1]===runner).length,1,'required checkpoint runner '+id);
const report=JSON.parse(fs.readFileSync(completedFixture+'/evidence/akari-selftest-evidence-36017186869-1/editor-assets-101.json'));
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
  "import {verifyCompletedProvenance} from './audit/lib/historical-checkpoint-101.mjs';const p=verifyCompletedProvenance();console.log(JSON.stringify({commit:p.sourceCommit,files:p.sourceFiles,offline:p.offlineProvenance.sourceFiles}));"],
  {env,encoding:'utf8',timeout:15000});
assert.equal(child.status,0,child.error?.message||child.stderr);
assert.deepEqual(JSON.parse(child.stdout),{commit:checkpointCommit,files:34,offline:34});
console.log('Verified 1.0.1 checkpoint: '+rejected+' invalid proofs/reports rejected; historical and current provenance PASS without Git');
