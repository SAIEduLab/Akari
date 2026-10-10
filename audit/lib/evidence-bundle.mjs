import {verifyBlockFields} from './block-field-contract.mjs';
import { currentProductFile } from "./product-path.cjs";
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {snapshot,sha} from './product-test-host.mjs';
import {verifyGateResults} from './verify-gate-results.mjs';
import {verifyBrowserGroup} from './verify-browser-results.mjs';
import {verifyAudio} from './feature-contract.mjs';
export function selectBundleDirectory(kind,directory,provenance){
  const current=Number(provenance.attempt);
  assert.ok(Number.isSafeInteger(current)&&current>0,'positive current attempt');
  assert.match(String(provenance.run),/^(?:local|[1-9][0-9]*)$/,'current workflow run');
  const prefix='akari-'+kind+'-'+provenance.run+'-';
  const candidates=fs.readdirSync(directory,{withFileTypes:true}).filter(e=>e.name.startsWith(prefix)).map(e=>{
    assert.ok(e.isDirectory()&&!e.isSymbolicLink(),'evidence directory');
    const suffix=e.name.slice(prefix.length);
    assert.match(suffix,/^[1-9][0-9]*$/,'positive evidence attempt');
    const attempt=Number(suffix);
    assert.ok(Number.isSafeInteger(attempt)&&attempt<=current,'evidence cannot come from a future attempt');
    return {directory:path.join(directory,e.name),attempt};
  }).sort((a,b)=>b.attempt-a.attempt);
  assert.ok(candidates.length,'missing evidence for '+kind);
  // Select before validation: a newer failure must never fall back to an old PASS.
  const selected=candidates[0];
  return {...selected,provenance:{...provenance,attempt:String(selected.attempt)}};
}
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
    verifyAudio(report,inputs,kind.slice(13));
    const fields=JSON.parse(fs.readFileSync(path.join(dir,'block-field-width.json')));verifyBlockFields(fields,inputs);return {status:'PASS',cases:report.results.length,platform:report.platform};
  }
  assert.equal(kind,'static');const report=JSON.parse(fs.readFileSync(path.join(dir,'static.json')));
  assert.equal(report.status,'PASS');assert.deepEqual(report.snapshot,inputs);assert.equal(report.capabilities,260);
  return {status:'PASS',capabilities:260};
}
export function sealBundle(kind,dir,provenance={}){
  assert.ok(!fs.existsSync(path.join(dir,'bundle.json')));
  const inputs=snapshot(currentProductFile()),result=verifyEvidence(kind,dir,inputs);
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
