import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gateSteps} from './gate-contract.mjs';
import {verify} from './verify-test-results.mjs';
import {verifyLanguageResults} from './verify-language-results.mjs';
import {verifySurfaceResults} from './verify-surface-results.mjs';
import {verifyEditorAssets,verifyDesignerZoom} from './feature-contract.mjs';
import {verifyBrowserEnvironment} from './browser-environment.mjs';
import {verifyFormatCompatibility} from './format-compatibility-contract.mjs';
export function verifyGateResults(dir,inputs){
  const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n+'.json'))),gate=read('gate');
  assert.equal(gate.status,'PASS');assert.deepEqual(gate.snapshot,inputs);
  assert.deepEqual(gate.steps.map(s=>s.id),gateSteps('',dir).map(s=>s[0]));
  for(const s of gate.steps){assert.equal(s.status,'PASS',s.id);assert.equal(s.exit,0);assert.equal(s.signal,null);assert.ok(fs.existsSync(path.join(dir,s.log)));}
  verify(read('product'),JSON.parse(fs.readFileSync('audit/manifests/product-tests.json')),inputs);
  verifyBrowserEnvironment(read('browser-environment'),inputs);
  const language=JSON.parse(fs.readFileSync('audit/manifests/language-form-coverage.json'));
  for(const n of ['language-node','language-browser'])verifyLanguageResults(read(n),language,inputs);
  for(const [n,kind,env]of [['editor-node','editor','node'],['editor-browser-core','editor','chromium'],['editor-gui','gui','chromium']])verifySurfaceResults(read(n),kind,inputs,env);
  verifyEditorAssets(read('editor-assets'),inputs);verifyDesignerZoom(read('designer'),inputs);
  verifyFormatCompatibility(read('format-compatibility'),inputs);
  const ids=['OWNER-COMPLETE-REGISTRY','OWNER-REJECT-UNOWNED-AT-BOUNDARIES','OWNER-SAVE-ROUNDTRIP','OWNER-FORMAT-REJECTION','OWNER-CALLER-RECEIVER-AND-FUNCTION','OWNER-REFERENCES-INCLUDING-EXPRESSION','OWNER-INCOMPLETE-AND-UNUSED','OWNER-GUI-DIRECT-BUTTON','OWNER-GUI-ALL-EVENTS','OWNER-GUI-UNUSED-STAGE-DEFINITIONS','OWNER-GUI-SYNTAX-ERROR-RAW-BODY','OWNER-GUI-DRAFT-OWNERSHIP','OWNER-GUI-RECURSION-AND-HIDDEN-OBJECT','OWNER-GUI-VIEWPORT-AND-UNDO-REACHABILITY'];
  const ownership=read('ownership/report');assert.equal(ownership.status,'PASS');assert.deepEqual(ownership.snapshot,inputs);assert.ok(ownership.browser);assert.deepEqual(ownership.results.map(r=>r.id),ids);for(const r of ownership.results)assert.equal(r.pass,true,r.id);
  for(const name of ['static','integrity','normal','language-boundaries','manual/manual-docs']){const r=read(name);assert.equal(r.status,'PASS');assert.deepEqual(r.snapshot,inputs);}
  const integrity=read('integrity');assert.equal(integrity.results.length,30);assert.equal(new Set(integrity.results.map(r=>r.id)).size,30);for(const r of integrity.results)assert.equal(r.pass,true);
  return {status:'PASS',steps:gate.steps.length};
}
