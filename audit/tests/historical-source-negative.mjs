import fs from 'node:fs';
import cp from 'node:child_process';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {sha} from '../lib/product-test-host.mjs';
import {historicalArchive,verifyHistoricalArchive,verifyHistoricalArchiveBytes,gitObjectHash} from '../lib/historical-source.mjs';

const bytes=fs.readFileSync(historicalArchive),archive=JSON.parse(bytes),fixed='2f455619440f5abbfbb564927769c85341f25074';
const original='41d787b664ed00467bf55881c419ba4f3727add9';
const verified=verifyHistoricalArchiveBytes(bytes);
assert.deepEqual(verified.summary,{commits:5,trees:24,blobs:43,sourceFiles:43});
assert.deepEqual(verifyHistoricalArchiveBytes(Buffer.from(bytes.toString().replace(/\r\n/g,'\n').replace(/\n/g,'\r\n'))).summary,verified.summary);
assert.equal(sha(verified.read(fixed,'Akari.html')),'48b440829174256952ab3f12e13553c64cba95f392e30e8f79768ff7411c0acf');
assert.deepEqual(verified.paths(original,'audit/fixtures/0.8'),['AUDIT.md','Akari.html','LANGUAGE.md','akari-audit.yml','manifest.json'].map(p=>'audit/fixtures/0.8/'+p));
const root=Buffer.from(archive.commits[fixed],'base64').toString().match(/^tree (\w+)/)[1];
const embedded=Object.keys(archive.blobs).find(id=>archive.blobs[id].deflateBase64);
const fixture=archive.sources[fixed]['Akari.html'];
let rejected=0;
const reject=fn=>{assert.throws(fn);rejected++;};
const mutate=fn=>{const copy=structuredClone(archive);fn(copy);reject(()=>verifyHistoricalArchive(copy));};
reject(()=>verifyHistoricalArchiveBytes(Buffer.concat([bytes,Buffer.from('\n')])));
reject(()=>verified.read('main','Akari.html'));
reject(()=>verified.read(fixed,'not-archived.html'));
reject(()=>verified.read(fixed,'../Akari.html'));
mutate(a=>delete a.commits[fixed]);
mutate(a=>a.commits[fixed]=Buffer.concat([Buffer.from(a.commits[fixed],'base64'),Buffer.from('\n')]).toString('base64'));
mutate(a=>a.commits[fixed]=a.commits[original]);
mutate(a=>a.trees[root]=Buffer.concat([Buffer.from(a.trees[root],'base64'),Buffer.from('x')]).toString('base64'));
mutate(a=>delete a.trees[root]);
mutate(a=>a.sources[fixed]['Akari.html']=embedded);
mutate(a=>a.blobs[embedded].deflateBase64=zlib.deflateSync(Buffer.from('candidate substituted for historical source')).toString('base64'));
mutate(a=>a.blobs[fixture].sha256='0'.repeat(64));
mutate(a=>a.blobs[fixture].bytes++);
mutate(a=>a.blobs[fixture].fixture='audit/fixtures/1.0.0/source/LANGUAGE.md');
mutate(a=>a.blobs[fixture].fixture='audit/fixtures/1.0.0/source/../../../../Akari.html');
mutate(a=>a.blobs[fixture].deflateBase64=zlib.deflateSync(Buffer.from('extra storage')).toString('base64'));
mutate(a=>delete a.blobs[fixture]);
mutate(a=>delete a.sources[fixed]['Akari.html']);
mutate(a=>{
  const extra=Buffer.from('unrelated source');a.blobs[gitObjectHash('blob',extra)]={bytes:extra.length,sha256:sha(extra),deflateBase64:zlib.deflateSync(extra).toString('base64')};
});
reject(()=>verifyHistoricalArchive(archive,p=>{
  const b=Buffer.from(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'));
  return p===archive.blobs[fixture].fixture?Buffer.concat([b,Buffer.from('x')]):b;
}));
// A valid proof for a subset still cannot claim the whole frozen directory.
const partial=structuredClone(archive),omitted='audit/fixtures/0.8/manifest.json',blob=partial.sources[original][omitted];
delete partial.sources[original][omitted];delete partial.blobs[blob];
reject(()=>verifyHistoricalArchive(partial).paths(original,'audit/fixtures/0.8'));

// Resolve the complete release provenance with Git unavailable to the child.
const environment=Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toLowerCase()!=='path'&&!/^GIT_(?:DIR|WORK_TREE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES)$/.test(key)));
environment.PATH='';
const child=cp.spawnSync(process.execPath,['--input-type=module','-e',
  "import {verifyCompletedProvenance} from './audit/lib/completed-baseline.mjs'; const p=verifyCompletedProvenance(); console.log(JSON.stringify({commit:p.sourceCommit,files:p.sourceFiles,offline:p.offlineProvenance.sourceFiles}));"],
  {env:environment,encoding:'utf8',timeout:15000});
assert.equal(child.status,0,child.error?.message||child.stderr);
assert.deepEqual(JSON.parse(child.stdout),{commit:fixed,files:31,offline:43});
console.log('Offline public provenance: 43 paths / 5 fixed commits PASS; '+rejected+' corrupt or missing proofs rejected; complete provenance verified without Git');
