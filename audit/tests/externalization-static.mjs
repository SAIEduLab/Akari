import {verifyNoAutomaticPersistence} from '../lib/persistence-transition.mjs';
import './persistence-negative.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import {sha} from '../lib/product-test-host.mjs';
import {verifyAuthority} from '../lib/verify-test-results.mjs';
import {currentNames} from '../lib/launch-identifiers.cjs';
import {release101Assertions} from '../lib/release-101-contract.mjs';
import {verifyCompletedProvenance} from '../lib/completed-baseline.mjs';
import {readHistoricalSource,historicalPaths} from '../lib/historical-source.mjs';
const map=JSON.parse(fs.readFileSync('audit/manifests/externalization-map.json'));
const manifest=JSON.parse(fs.readFileSync('audit/manifests/product-tests.json'));
const policy=JSON.parse(fs.readFileSync('audit/manifests/quality-1.0.0.json'));
verifyAuthority(manifest);
const completedBaseline=verifyCompletedProvenance();
const html=fs.readFileSync('Akari.html','utf8');
verifyNoAutomaticPersistence(html);
for(const file of ['README.md','LANGUAGE.md','MANUAL.html','index.html',...fs.readdirSync('Manual').filter(p=>p.endsWith('.html')).map(p=>'Manual/'+p)]) {
 const text=fs.readFileSync(file,'utf8');
 assert.doesNotMatch(text,/過去版|旧版|以前の版|(?:あかり|Akari)\s*0\.[789]/i,'prelaunch release explanation in '+file);
}
assert.doesNotMatch(html,/(?:Modified for Akari\s+0\.|globalThis\.Akari0[789]|id="[^"]*09")/,'prelaunch product metadata remains');
// Boundary builders intentionally bypass validation to construct above-limit files.
// Their independent envelope must still be the canonical current format.
const assetBuilder=fs.readFileSync('audit/browser/legacy/browser-asset-limits.cjs','utf8');
for(const marker of ['<!-- AKARI-PROJECT-F3-DATA-BEGIN -->','<!-- AKARI-PROJECT-F3-DATA-END -->'])
 assert.ok(assetBuilder.includes(marker),'Asset boundary fixture envelope is stale: '+marker);
for(const entry of map.entries){
 const source=fs.readFileSync(entry.destination,'utf8').replace(/\r\n/g,'\n').trimEnd();
 const approved=policy.overrides.find(e=>e.suite===entry.symbol);
 const frozen=fs.readFileSync('audit/fixtures/1.0.0/source/'+entry.destination,'utf8').replace(/\r\n/g,'\n').trimEnd();
 assert.equal(sha(frozen),approved?.bodySha256||entry.bodySha256,'Frozen suite authority changed: '+entry.symbol);
 assert.equal(source,release101Assertions(entry.destination,currentNames(frozen)),'Assertion changed beyond recorded identifiers and 1.0.1 metadata: '+entry.symbol);
 if(!process.argv.includes('--parallel'))assert.ok(!html.includes(entry.symbol),'Embedded audit remains '+entry.symbol);
}
if(!process.argv.includes('--parallel'))for(const token of ['selfTestReport','data-selftest-failed',"searchParams.get('selftest')"])assert.ok(!html.includes(token),'audit entry/output remains');
const fixture=JSON.parse(fs.readFileSync('audit/fixtures/0.8/manifest.json'));
assert.equal(fixture.sourceCommit,'ec43018d5ba546d5aa9df9c2799b18260a3ab2d7');
const fixed=[];
for(const [name,meta] of Object.entries(fixture.files)){
 const file='audit/fixtures/0.8/'+name;
 const canonical=cp.execFileSync('git',['show','HEAD:'+file],{maxBuffer:8*1024*1024});
 const blob=crypto.createHash('sha1').update(Buffer.from('blob '+canonical.length+'\0')).update(canonical).digest('hex');
 assert.equal(blob,meta.gitBlobSha1);assert.equal(canonical.length,meta.bytes);
 const local=fs.readFileSync(file);
 // Git's Windows checkout conversion is recorded, never hidden as byte equality.
 assert.ok(local.equals(canonical)||local.equals(Buffer.from(canonical.toString('utf8').replace(/\n/g,'\r\n'))),'fixture differs beyond Git checkout EOL conversion');
 fixed.push({name,canonicalBytes:canonical.length,gitBlobSha1:blob,executedWorktreeBytes:local.length,worktreeSha256:sha(local)});
}
const historicalFixturePaths=historicalPaths(map.sourceCommit,'audit/fixtures/0.8');
assert.deepEqual(fs.readdirSync('audit/fixtures/0.8').map(p=>'audit/fixtures/0.8/'+p).sort(),historicalFixturePaths,'historical fixture file set changed');
for(const p of historicalFixturePaths)assert.equal(sha(Buffer.from(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'))),sha(readHistoricalSource(map.sourceCommit,p)),'historical fixture changed: '+p);
// Reviewable withdrawal provenance must refer to actual historical source, not
// just a self-consistent quote/hash pair in the current record.
const transition=JSON.parse(fs.readFileSync('audit/records/phase3-guarantee-transition.json'));
for(const entry of [...transition.entries,...transition.browser]){
  const historical=readHistoricalSource(entry.sourceCommit,entry.source).toString('utf8').replace(/\r\n?/g,'\n');
  assert.equal(sha(entry.originalSource),entry.originalSourceSha256,'historical quotation digest');
  assert.ok(historical.includes(entry.originalSource.replace(/\r\n?/g,'\n').trimEnd()),'quotation is absent from historical source: '+entry.oldId);
}

fs.mkdirSync('audit-evidence',{recursive:true});
fs.writeFileSync(process.argv.find(a=>a.endsWith('.json')) || 'audit-evidence/externalization-static.json',JSON.stringify({status:'PASS',suites:map.entries.length-1,ids:manifest.suites.reduce((n,s)=>n+s.ids.length,0),completedBaseline,historical08:fixed},null,2)+'\n');
console.log('Externalization structure, 1.0.0 guarantee authority, historical archive provenance: PASS');
