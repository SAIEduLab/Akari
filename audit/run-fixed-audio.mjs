import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {root,snapshot,sha} from './lib/product-test-host.mjs';
import {readCheckpointSource} from './lib/checkpoint-source.mjs';
import {completedCommit,completedFixture,completedProduct,completedManifestSha256,completedManifest,verifyFixedAudio} from './lib/completed-baseline.mjs';
const [,output]=process.argv.slice(2);
assert.ok(output&&!fs.existsSync(output),'fresh fixed audio evidence required');
const manifest=completedManifest(),before=snapshot('Akari.html');
let source=readCheckpointSource(completedCommit,'audit/tests/audio-codecs-102.mjs').toString('utf8');
const replaceOnce=(from,to)=>{assert.equal(source.split(from).length,2,'fixed audio host substitution: '+from);source=source.replace(from,to);};
for(const [from,to] of [
  ['../lib/product-test-host.mjs','audit/lib/product-test-host.mjs'],
  ['../browser/legacy/audit-lib.cjs','audit/browser/legacy/audit-lib.cjs'],
  ['../lib/release-102-contract.mjs',completedFixture+'/source/audit/lib/release-102-contract.mjs'],
])replaceOnce("'"+from+"'",JSON.stringify(pathToFileURL(path.join(root,to)).href));
replaceOnce('createRequire(import.meta.url)','createRequire('+JSON.stringify(pathToFileURL(path.join(root,'audit/tests/audio-codecs-102.mjs')).href)+')');
replaceOnce("pageFor(browser,'Akari.html',",'pageFor(browser,'+JSON.stringify(completedProduct)+',');
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
assert.deepEqual(snapshot('Akari.html'),before,'inputs changed during fixed audio replay');
const report=JSON.parse(fs.readFileSync(output));
Object.assign(report,{fixedSourceCommit:completedCommit,manifestSha256:completedManifestSha256,
  canonicalProductSha256:manifest.productSha256,executedProductSha256:sha(fs.readFileSync(completedProduct)),
  suiteSha256:manifest.files['source/audit/tests/audio-codecs-102.mjs'].sha256});
verifyFixedAudio(report,before,process.platform);
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log('Completed 1.0.2 fixed audio: 18/18 PASS');
