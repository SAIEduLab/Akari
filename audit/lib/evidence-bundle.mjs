import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {snapshot,sha} from './product-test-host.mjs';
import {verifyGateResults} from './verify-gate-results.mjs';
import {verifyBrowserGroup} from './verify-browser-results.mjs';
import {verifyAudio} from './feature-contract.mjs';
export function evidenceFiles(dir,prefix=''){
  return fs.readdirSync(path.join(dir,prefix),{withFileTypes:true}).flatMap(e=>{
    assert.ok(!e.isSymbolicLink());const rel=prefix+e.name;
    return e.isDirectory()?evidenceFiles(dir,rel+'/'):rel==='bundle.json'?[]:[rel];
  }).sort();
}
export function verifyEvidence(kind,dir,inputs){
  if(kind==='selftest')return verifyGateResults(dir,inputs);
  if(kind.startsWith('full-browser-'))return verifyBrowserGroup(dir,kind.slice(13),inputs);
  if(kind.startsWith('audio-codecs-')){
    const report=JSON.parse(fs.readFileSync(path.join(dir,'report.json')));
    verifyAudio(report,inputs,kind.slice(13));return {status:'PASS',cases:report.results.length,platform:report.platform};
  }
  assert.equal(kind,'static');const report=JSON.parse(fs.readFileSync(path.join(dir,'static.json')));
  assert.equal(report.status,'PASS');assert.deepEqual(report.snapshot,inputs);assert.equal(report.capabilities,259);
  return {status:'PASS',capabilities:259};
}
export function sealBundle(kind,dir,provenance={}){
  assert.ok(!fs.existsSync(path.join(dir,'bundle.json')));
  const inputs=snapshot('Akari.html'),result=verifyEvidence(kind,dir,inputs);
  const files=Object.fromEntries(evidenceFiles(dir).map(f=>[f,sha(fs.readFileSync(path.join(dir,f)))]));
  const bundle={schema:'akari-evidence-v1',kind,status:'PASS',snapshot:inputs,provenance,result,files};
  fs.writeFileSync(path.join(dir,'bundle.json'),JSON.stringify(bundle,null,2)+'\n');return bundle;
}
export function verifyBundle(kind,dir,inputs,provenance={}){
  const bundle=JSON.parse(fs.readFileSync(path.join(dir,'bundle.json')));
  assert.equal(bundle.schema,'akari-evidence-v1');assert.equal(bundle.kind,kind);assert.equal(bundle.status,'PASS');
  assert.deepEqual(bundle.snapshot,inputs);assert.deepEqual(bundle.provenance,provenance);
  assert.deepEqual(Object.keys(bundle.files),evidenceFiles(dir));
  for(const [file,hash]of Object.entries(bundle.files))assert.equal(sha(fs.readFileSync(path.join(dir,file))),hash,file);
  assert.deepEqual(verifyEvidence(kind,dir,inputs),bundle.result);return bundle;
}
