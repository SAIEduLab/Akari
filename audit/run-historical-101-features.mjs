import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {root,snapshot,sha} from './lib/product-test-host.mjs';
import {readCheckpointSource} from './lib/checkpoint-101-source.mjs';
import {completedCommit,completedFixture,completedProduct,completedManifestSha256,completedManifest,verifyFixedFeatures} from './lib/historical-checkpoint-101.mjs';

const [,output]=process.argv.slice(2);
assert.ok(output&&!fs.existsSync(output),'fresh fixed feature evidence required');
const manifest=completedManifest(),before=snapshot('Akari.html');
let source=readCheckpointSource(completedCommit,'audit/tests/editor-assets-101.mjs').toString('utf8');
// Resolve host imports and the target file only. Every assertion and case in
// the successful checkpoint executes unchanged, including its original IDs.
const replaceOnce=(from,to)=>{
  assert.equal(source.split(from).length,2,'fixed feature host substitution: '+from);
  source=source.replace(from,to);
};
for(const [from,to] of [
  ['../lib/product-test-host.mjs','audit/lib/product-test-host.mjs'],
  ['../browser/legacy/audit-lib.cjs','audit/browser/legacy/audit-lib.cjs'],
  ['../lib/release-101-contract.mjs',completedFixture+'/source/audit/lib/release-101-contract.mjs'],
])replaceOnce("'"+from+"'",JSON.stringify(pathToFileURL(path.join(root,to)).href));
replaceOnce("pageFor(browser,'Akari.html',",'pageFor(browser,'+JSON.stringify(completedProduct)+',');
replaceOnce("'editor-assets-101'","'fixed101-editor-assets'");
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
assert.deepEqual(snapshot('Akari.html'),before,'inputs changed during fixed feature replay');
const report=JSON.parse(fs.readFileSync(output));
Object.assign(report,{schema:'akari-fixed-editor-assets-v1',sourceCommit:completedCommit,
  manifestSha256:completedManifestSha256,canonicalProductSha256:manifest.productSha256,
  executedProductSha256:sha(fs.readFileSync(completedProduct)),
  suiteSha256:manifest.files['source/audit/tests/editor-assets-101.mjs'].sha256});
verifyFixedFeatures(report,before);
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log('Verified 1.0.1 fixed features: 15/15 PASS');
