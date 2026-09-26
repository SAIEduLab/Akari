import assert from 'node:assert/strict';
import {snapshot} from '../lib/product-test-host.mjs';
import {audioIds102,codecBrowser102,verifyAudio102,featureFreeze102,verifyFreeze102,release102Runtime} from '../lib/release-102-contract.mjs';
const inputs=snapshot('Akari.html');
const report={schema:'akari-audio-102-v1',status:'PASS',snapshot:inputs,browser:codecBrowser102,playwright:'1.55.0',platform:'linux',executableSha256:'a'.repeat(64),fixtureManifestSha256:inputs.files['audit/fixtures/audio-1.0.2/manifest.json'],results:audioIds102.map(id=>({id,pass:true,detail:'PASS'})),pageErrors:[],networkRequests:[]};
verifyAudio102(report,inputs,'linux');let rejected=0;
for(const mutate of [r=>r.results.pop(),r=>r.results.push(r.results[0]),r=>r.results[0].id='invented',r=>r.results[0].pass=false,
  r=>r.results[0].status='SKIP',r=>r.results[0].detail='SKIP',r=>r.status='FAIL',r=>r.browser='system',r=>r.playwright='other',
  r=>r.platform='win32',r=>r.executableSha256='',r=>r.fixtureManifestSha256='stale',r=>r.snapshot.head='stale',
  r=>r.pageErrors.push('error'),r=>r.networkRequests.push('https://example.invalid')]){
  const bad=structuredClone(report);mutate(bad);assert.throws(()=>verifyAudio102(bad,inputs,'linux'));rejected++;
}
verifyFreeze102();
for(const mutate of [r=>r.productVersion='1.0.1',r=>r.audioIds.pop(),r=>r.platforms.pop(),r=>r.formats.pop(),
  r=>r.limits.durationSeconds=120,r=>r.preserved.coreIds--,r=>r.inputSha256['Akari.html']='stale',r=>r.status='PASS']){
  const bad=featureFreeze102();mutate(bad);assert.throws(()=>verifyFreeze102(bad));rejected++;
}
const runtime="appVersion: '1.0.1'; ['audio/mpeg', 'audio/wav']";
assert.ok(release102Runtime(runtime).includes("appVersion: '1.0.2'"));
for(const bad of [runtime+runtime,runtime.replace('audio/wav','audio/flac'),runtime.replace('1.0.1','1.0.0')]){
  assert.throws(()=>release102Runtime(bad));rejected++;
}
console.log('Release 1.0.2 validators: '+rejected+' corrupt or skipped reports/contracts rejected');
