import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {sha} from './product-test-host.mjs';
import {verifyChildMatrix,verifyChildLanguage,verifyProvenance,verifyNeeds,verifyRetryHistory} from './child-ux-contract.mjs';
import {verifyInsertionContextReport} from './insertion-context-contract.mjs';
import {verifySpeechNameLayoutReport} from './speech-name-layout-contract.mjs';
import {verifyPreviewReport} from './speech-preview-contract.mjs';
import {verifyComponentControls} from './component-controls-contract.mjs';
import {verifyChildDiagnosticsReport} from './child-diagnostics-contract.mjs';
export const requiredBundleFiles={composition:['child-ux-static.json','child-ux-matrix.json','ux-repair02-matrix.json','aggregate.json'],repair05:['child-ux-language.json','child-language-ui.json','insertion-context.json','speech-name-layout.json','speech-preview.json','component-controls.json','child-diagnostics.json']};
export function verifyReportPlatform(file,report,platform){
  const actual={
    'insertion-context.json':()=>report.execution?.platform,
    'speech-name-layout.json':()=>report.environment?.os,
    'speech-preview.json':()=>report.environment?.os,
    'component-controls.json':()=>report.platform,
    'child-diagnostics.json':()=>report.environment?.platform,
  }[file];assert.ok(actual,'platform-bearing required report');assert.equal(actual(),platform,'same OS for '+file);
}
export function evidenceFiles(dir,prefix=''){
  return fs.readdirSync(path.join(dir,prefix),{withFileTypes:true}).flatMap(e=>{const f=prefix+e.name;assert.ok(!e.isSymbolicLink());return e.isDirectory()?evidenceFiles(dir,f+'/'):f==='child-ux-bundle.json'?[]:[f];}).sort();
}
const read=(dir,name)=>JSON.parse(fs.readFileSync(path.join(dir,name)));
export function verifyBundleHeader(b,kind,inputs,provenance){
  assert.equal(b.schema,'akari-child-ux-bundle-v1');assert.equal(b.kind,kind);assert.equal(b.status,'PASS');assert.deepEqual(b.snapshot,inputs);verifyProvenance(b.provenance,provenance);
  assert.deepEqual(b.required,requiredBundleFiles[kind]);for(const f of b.required)assert.ok(Object.hasOwn(b.files,f),'missing required result '+f);
  for(const [f,h]of Object.entries(b.files)){assert.ok(!path.isAbsolute(f)&&!f.split(/[\\/]/).includes('..'));assert.match(h,/^[a-f0-9]{64}$/);}
  assert.equal(b.humanAcceptance,'UNVERIFIED');assert.equal(b.realIME,'UNVERIFIED');
}
function controlRows(proof,expected){assert.deepEqual(proof.controls.map(c=>c.id),expected);for(const c of proof.controls)assert.equal(c.rejected,true);assert.equal(proof.controlClassification,'SYNTHETIC_VALIDATION_ONLY');}
export const matrixControlIds=['missing','duplicate','failed','skipped','cancelled','timeout','snapshot','provenance','platform','route-missing','route-direction','source-drift','project-drift','history-drift','value','actor','order','branch','repeat-count','displayed-block-value','displayed-block-operator','displayed-block-heading','displayed-block-missing','displayed-block-hidden','fixed-string-B16','fixed-number-B17','fixed-string-B18','same-result-wrong-expression-B16','same-result-wrong-expression-B17','same-result-wrong-expression-B18','wrong-command-label','wrong-expression-label','missing-screenshot'];
export const languageControlIds=['missing','duplicate','failed','snapshot','platform','provenance','required-hint-missing','hidden-support','missing-frame','missing-artifact','artifact-hash','vocabulary-omitted','vocabulary-auto-approved','frame-and-inventory-omitted'];
export const staticControlIds=['needs-missing','needs-failed','needs-skipped','needs-cancelled','needs-timeout','provenance-sha','provenance-run','provenance-attempt','manual-prediction-missing','manual-prediction-after','manual-source-assisted-first','manual-solution-provided','manual-no-return','manual-child-guarantee','history-missing-attempt','history-wrong-sha','mixed-os/insertion','mixed-os/names','mixed-os/preview','mixed-os/components','mixed-os/diagnostics','manual-no-hash','manual-no-counts','manual-no-vocabulary-review','manual-no-real-ime-detail','manual-duplicate-kind','adapter-wrong-expectation','adapter-extra-change'];
function verifyProof(p,schema,inputs,provenance){assert.equal(p.schema,schema);assert.equal(p.status,'PASS');assert.deepEqual(p.snapshot,inputs);verifyProvenance(p.provenance,provenance);}
export function verifyBundleResults(kind,dir,inputs,provenance){
  if(kind==='composition'){
    const fixed=read(dir,'aggregate.json');assert.equal(fixed.status,'MACHINE_PASS');assert.equal(fixed.uxAcceptance,false);
    // Execute only the unchanged independent validators, never the browser tasks again.
    const before=sha(fs.readFileSync(path.join(dir,'aggregate.json')));
    const check=cp.spawnSync(process.execPath,['audit/tests/actions-transfer-verify.mjs',dir],{encoding:'utf8',maxBuffer:64*1024*1024});
    assert.equal(check.status,0,'existing fixed-acceptance validators: '+check.stderr);assert.equal(sha(fs.readFileSync(path.join(dir,'aggregate.json'))),before,'existing aggregate must already be genuine');
    const stat=read(dir,'child-ux-static.json');verifyProof(stat,'akari-child-ux-static-v1',inputs,provenance);controlRows(stat,staticControlIds);
    const proof=read(dir,'child-ux-matrix.json');verifyProof(proof,'akari-child-ux-matrix-proof-v1',inputs,provenance);controlRows(proof,matrixControlIds);
    assert.equal(proof.inputSha256,sha(fs.readFileSync(path.join(dir,'ux-repair02-matrix.json'))));
    assert.deepEqual(proof.result,verifyChildMatrix(read(dir,'ux-repair02-matrix.json'),inputs,provenance,path.join(dir,'ux-repair02-matrix.json')));
  }else{
    assert.equal(kind,'repair05');
    for(const file of ['insertion-context.json','speech-name-layout.json','speech-preview.json','component-controls.json','child-diagnostics.json'])verifyReportPlatform(file,read(dir,file),provenance.platform);
    verifyInsertionContextReport(read(dir,'insertion-context.json'));verifySpeechNameLayoutReport(read(dir,'speech-name-layout.json'),inputs);
    verifyPreviewReport(read(dir,'speech-preview.json'),inputs);verifyComponentControls(read(dir,'component-controls.json'),inputs);verifyChildDiagnosticsReport(read(dir,'child-diagnostics.json'),inputs);
    const proof=read(dir,'child-ux-language.json');verifyProof(proof,'akari-child-ux-language-proof-v1',inputs,provenance);controlRows(proof,languageControlIds);
    assert.equal(proof.inputSha256,sha(fs.readFileSync(path.join(dir,'child-language-ui.json'))));
    assert.deepEqual(proof.result,verifyChildLanguage(read(dir,'child-language-ui.json'),inputs,provenance,path.join(dir,'child-language-ui.json'),proof.inventory));
  }
}
export function sealChildBundle(kind,dir,inputs,provenance){
  assert.ok(!fs.existsSync(path.join(dir,'child-ux-bundle.json')),'fresh bundle required');verifyBundleResults(kind,dir,inputs,provenance);
  const files=Object.fromEntries(evidenceFiles(dir).map(f=>[f,sha(fs.readFileSync(path.join(dir,f)))]));
  const b={schema:'akari-child-ux-bundle-v1',kind,status:'PASS',snapshot:inputs,provenance,required:requiredBundleFiles[kind],files,humanAcceptance:'UNVERIFIED',realIME:'UNVERIFIED'};
  verifyBundleHeader(b,kind,inputs,provenance);fs.writeFileSync(path.join(dir,'child-ux-bundle.json'),JSON.stringify(b,null,2)+'\n');return b;
}
export function verifyChildBundle(kind,dir,inputs,provenance){
  const b=read(dir,'child-ux-bundle.json');verifyBundleHeader(b,kind,inputs,provenance);assert.deepEqual(Object.keys(b.files),evidenceFiles(dir));
  verifyBundleFileHashes(b,dir);
  verifyBundleResults(kind,dir,inputs,provenance);return b;
}
export function verifyBundleFileHashes(b,dir){for(const [f,h]of Object.entries(b.files))assert.equal(sha(fs.readFileSync(path.join(dir,f))),h,'actual artifact '+f);}
export const aggregateControlIds=['bundle-missing','bundle-failed','bundle-snapshot','bundle-sha','bundle-run','bundle-attempt','bundle-platform','bundle-required-result','bundle-required-set','bundle-artifact-hash','bundle-unsafe-path','bundle-fake-human-pass','bundle-valid-format-wrong-hash'];
export function verifyChildAggregate(dirs,needs,history,inputs,provenance){
  verifyNeeds(needs);assert.deepEqual(Object.keys(dirs).sort(),['composition','repair05']);
  const bundles=Object.entries(dirs).map(([kind,dir])=>verifyChildBundle(kind,dir,inputs,provenance));
  const retry=verifyRetryHistory(history,provenance),base=bundles.find(b=>b.kind==='composition');verifyBundleHeader(base,'composition',inputs,provenance);
  const mutations=[
    b=>delete b.schema,b=>b.status='FAIL',b=>b.snapshot.productSha256='0'.repeat(64),b=>b.provenance.testedCommit='0'.repeat(40),
    b=>b.provenance.run='wrong',b=>b.provenance.attempt='999',b=>b.provenance.platform='wrong',b=>delete b.files[b.required[0]],
    b=>b.required.pop(),b=>b.files[b.required[0]]='wrong',b=>b.files['../escape']='0'.repeat(64),b=>b.humanAcceptance='PASS'];
  const controls=mutations.map((mutate,i)=>{const bad=structuredClone(base);mutate(bad);assert.throws(()=>verifyBundleHeader(bad,'composition',inputs,provenance));return{id:aggregateControlIds[i],rejected:true};});
  const f=base.required[0],badHash='0'.repeat(64);assert.notEqual(base.files[f],badHash);const bad=structuredClone(base);bad.files[f]=badHash;
  verifyBundleHeader(bad,'composition',inputs,provenance);assert.throws(()=>verifyBundleFileHashes(bad,dirs.composition),'valid-format hash of actual required evidence cannot be forged');
  controls.push({id:aggregateControlIds.at(-1),rejected:true});
  return {schema:'akari-child-ux-aggregate-v1',status:'MACHINE_PASS',snapshot:inputs,provenance,bundles:bundles.map(b=>({kind:b.kind,required:b.required,files:Object.keys(b.files).length})),
    tasks:24,machineRoutes:48,controls,controlClassification:'SYNTHETIC_VALIDATION_ONLY',retry,humanAcceptance:'UNVERIFIED',realIME:'UNVERIFIED',scratchComparison:'UNVERIFIED',realChild:'UNVERIFIED'};
}
