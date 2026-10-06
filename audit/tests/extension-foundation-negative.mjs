import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { currentProductFile } from '../lib/product-path.cjs';
import { snapshot, sha } from '../lib/product-test-host.mjs';
import { browserEnvironment } from '../lib/browser-environment.mjs';
import { extensionFoundationIds, extensionExpectedObservations, extensionNegativeIds, verifyExtensionFoundation, verifyExtensionFoundationNegative } from '../lib/extension-foundation-contract.mjs';

const inputs = snapshot(currentProductFile()), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akari-extension-negative-'));
const names = ['candidate.html', 'derived.html', 'player.html', 'external-player.html'];
for (const name of names) fs.writeFileSync(path.join(directory,name), name === 'candidate.html' ? fs.readFileSync(currentProductFile()) : name);
const control = {
  schema:'akari-extension-foundation-v1',status:'PASS',snapshot:inputs,
  provenance:{run:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'1'},
  environment:{platform:process.platform,browser:browserEnvironment.version,playwright:browserEnvironment.playwright},
  results:extensionFoundationIds.map(id=>({id,status:'PASS',observed:extensionExpectedObservations[id]})),
  networkErrors:[],pageErrors:[],artifacts:names.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(directory,name)))})),
};
// This synthetic accepted control tests the validator only. It is never a product PASS.
verifyExtensionFoundation(control,inputs,directory);
const clone = () => structuredClone(control), mutations = [
  r=>r.results.pop(), r=>r.results.push(r.results[0]), r=>r.results.reverse(), r=>r.results[0].status='FAIL',
  r=>r.results[0].observed.keys=0, r=>r.results[0].error='exception', r=>r.snapshot.productSha256='0'.repeat(64),
  r=>r.environment.browser='unknown', r=>r.environment.playwright='unknown', r=>r.networkErrors.push('https://example.invalid'),
  r=>r.pageErrors.push('exception'), r=>r.artifacts.pop(), r=>r.artifacts.push(r.artifacts[0]),
  r=>r.artifacts[1].path='../escape.html', r=>r.artifacts[0].sha256='0'.repeat(64), r=>r.artifacts[2].sha256='0'.repeat(64),
  r=>r.provenance.run='other', r=>r.provenance.attempt='other',
];
const results = mutations.map((mutate,i)=>{const report=clone();mutate(report);assert.throws(()=>verifyExtensionFoundation(report,inputs,directory),extensionNegativeIds[i]);return{id:extensionNegativeIds[i],rejected:true};});
const output={schema:'akari-extension-foundation-negative-v1',status:'PASS',snapshot:inputs,controlKind:'validator-rejection-only',results};
verifyExtensionFoundationNegative(output,inputs);
const file=path.resolve(process.argv[2]);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(output,null,2)+'\n');
console.log('Extension foundation validator: '+results.length+' rejected controls PASS');
