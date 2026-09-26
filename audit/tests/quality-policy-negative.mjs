import fs from 'node:fs';
import assert from 'node:assert/strict';
import {verifyAuthority} from '../lib/verify-test-results.mjs';
const manifest=JSON.parse(fs.readFileSync('audit/manifests/product-tests.json'));
const policy=JSON.parse(fs.readFileSync('audit/manifests/quality-1.0.2.json'));
verifyAuthority(manifest,policy);
const mutations=[
 p=>p.comparison.completionEvidence.pop(),p=>p.comparison.reason="stale",p=>p.policy="user-authorized-verified-checkpoint",
 p=>p.completionRecord.sourceCommit='main',p=>p.completionRecord.sha256='changed',
 p=>p.completionRecord.scope='current-candidate',p=>p.audioIds.pop(),p=>p.audioIds.push(p.audioIds[0]),
 p=>p.entries.pop(),p=>p.entries.push(p.entries[0]),
 p=>p.entries[0].currentTest=null,p=>p.entries[0].disposition='skip',
 p=>p.overrides[0].removedIds.push('DEFAULT-001 初期作品'),
 p=>p.capabilities.pop(),p=>p.capabilities[0].id='fake',
 p=>p.comparison.requiredBaseline='main',p=>p.comparison.switchAfterVerifiedCheckpoint=false,
  p=>p.checkpointApproved=false,p=>p.editorAssetIds.pop(),p=>p.editorAssetIds.push(p.editorAssetIds[0]),p=>p.completedBaseline='unfinished-head',p=>p.releaseComplete=false,
  p=>p.completedBaseline=null,p=>p.completedBaseline.sourceCommit='main',
  p=>p.completedBaseline.productSha256='candidate-output',p=>p.completedBaseline.manifestSha256='changed',
  p=>p.comparison.historicalBaseline='rewritten',
  p=>p.entries[0].disposition='replace',
  p=>p.entries.find(e=>e.disposition==='replace').disposition='maintain',
  p=>p.entries.find(e=>e.disposition==='withdraw-old-version-only').disposition='replace',
];
for(const mutate of mutations){const candidate=structuredClone(policy);mutate(candidate);assert.throws(()=>verifyAuthority(manifest,candidate));}
console.log('Quality policy: '+mutations.length+' unauthorized changes rejected');
