import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {snapshot,sha} from './product-test-host.mjs';
import {verifyGateResults} from './verify-gate-results.mjs';
import {verifyBrowserEnvironment} from './browser-environment.mjs';
import {verifyBrowserGroup} from './verify-browser-results.mjs';
import {verifyCompletedProvenance,verifyFixedAudio} from './completed-baseline.mjs';
import {verifyAudio102} from './release-102-contract.mjs';
export function evidenceFiles(dir,prefix='') {
  return fs.readdirSync(path.join(dir,prefix),{withFileTypes:true}).flatMap(e=>{
    assert.ok(!e.isSymbolicLink(),'evidence symlink');const rel=prefix+e.name;
    return e.isDirectory()?evidenceFiles(dir,rel+'/'):rel==='bundle.json'?[]:[rel];
  }).sort();
}
export function verifyEvidence(kind,dir,inputs) {
  if(kind.startsWith('audio-codecs-')){
    const report=JSON.parse(fs.readFileSync(path.join(dir,'report.json')));
    verifyAudio102(report,inputs,kind.slice(13));
    const fixedReport=JSON.parse(fs.readFileSync(path.join(dir,'fixed/report.json')));
    const fixed=verifyFixedAudio(fixedReport,inputs,kind.slice(13));
    assert.deepEqual(report.results.map(r=>r.id).sort(),fixedReport.results.map(r=>r.id).sort(),'candidate lost a completed audio guarantee');
    return {status:'PASS',platform:report.platform,cases:report.results.length,fixed};
  }
  if(kind==='selftest'||kind.startsWith('full-browser-'))verifyBrowserEnvironment(JSON.parse(fs.readFileSync(path.join(dir,'browser-environment.json'))),inputs);
  if(kind==='selftest')return verifyGateResults(dir,inputs);
  if(kind.startsWith('full-browser-')){
    const result=verifyBrowserGroup(path.join(dir,kind),kind.slice(13),inputs);
    if(kind==='full-browser-extra'){
      const docs=JSON.parse(fs.readFileSync(path.join(dir,'manual-docs/manual-docs.json')));
      assert.equal(docs.status,'PASS');assert.deepEqual(docs.snapshot,inputs);
      assert.ok(docs.browser);assert.equal(docs.snippets.length,46);assert.equal(docs.internalLinks,139);
      for(const s of docs.snippets)assert.equal(s.status,'SYNTAX_PASS');
      const pages=['index.html','MANUAL.html','Manual/block-mode.html','Manual/code-mode-beginner.html','Manual/code-mode-intermediate.html','Manual/code-mode-advanced.html'];
      assert.deepEqual(docs.pages,pages);
      assert.deepEqual(docs.views.map(v=>v.file+'/'+v.width).sort(),[1366,768,390].flatMap(w=>pages.map(p=>p+'/'+w)).sort());
      for(const v of docs.views){assert.ok(v.scroll<=v.width+1);assert.ok(fs.existsSync(path.join(dir,'manual-docs',v.screenshot)));}
      assert.equal(docs.firstWork.status,'PASS');assert.equal(docs.firstWork.expectedMovement,10);
      assert.ok(fs.existsSync(path.join(dir,'manual-docs/first-work-editor.png')));
    }
    return result;
  }
  assert.equal(kind,'static');
  const report=JSON.parse(fs.readFileSync(path.join(dir,'static.json')));
  assert.equal(report.head,inputs.head);assert.equal(report.d09Count,28);assert.equal(report.inventoryRows,257);
  assert.deepEqual(report.phases,Array.from({length:16},(_,i)=>i+1));
  const external=JSON.parse(fs.readFileSync(path.join(dir,'externalization-static.json')));
  assert.equal(external.status,'PASS');assert.equal(external.ids,884);
  assert.deepEqual(external.completedBaseline,verifyCompletedProvenance(),'unverified completed source provenance');
  const preflight=JSON.parse(fs.readFileSync(path.join(dir,'workflow-preflight.json')));
  assert.equal(preflight.status,'PASS');assert.equal(preflight.workflowSha256,inputs.files['.github/workflows/akari-audit.yml']);
  return {selftestRequired:report.selftestRequired,fullBrowserRequired:report.fullBrowserRequired};
}
export function sealBundle(kind,dir,provenance={}) {
  assert.ok(!fs.existsSync(path.join(dir,'bundle.json')),'bundle already exists');
  const inputs=snapshot('Akari.html'),result=verifyEvidence(kind,dir,inputs);
  const files=Object.fromEntries(evidenceFiles(dir).map(f=>[f,sha(fs.readFileSync(path.join(dir,f)))]));
  const bundle={schema:'akari-evidence-bundle-v1',kind,status:'PASS',snapshot:inputs,provenance,result,files};
  fs.writeFileSync(path.join(dir,'bundle.json'),JSON.stringify(bundle,null,2)+'\n');return bundle;
}
export function verifyBundle(kind,dir,inputs,provenance={}) {
  const bundle=JSON.parse(fs.readFileSync(path.join(dir,'bundle.json')));
  assert.equal(bundle.schema,'akari-evidence-bundle-v1');assert.equal(bundle.kind,kind);assert.equal(bundle.status,'PASS');
  assert.deepEqual(bundle.snapshot,inputs,'different HEAD/product/contract/suite/fixture/runner');
  assert.deepEqual(bundle.provenance,provenance,'different run/attempt');
  assert.deepEqual(Object.keys(bundle.files).sort(),evidenceFiles(dir),'missing/extra artifact files');
  for(const [file,hash] of Object.entries(bundle.files))assert.equal(sha(fs.readFileSync(path.join(dir,file))),hash,'artifact changed: '+file);
  assert.deepEqual(verifyEvidence(kind,dir,inputs),bundle.result,'unverified artifact result');return bundle;
}
