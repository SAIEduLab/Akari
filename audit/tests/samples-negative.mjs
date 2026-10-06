import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {browserEnvironment} from '../lib/browser-environment.mjs';
import {sampleTestIds,sampleExpected,sampleNegativeIds,verifySamples,verifySamplesNegative} from '../lib/samples-contract.mjs';
const inputs=snapshot(currentProductFile()),dir=fs.mkdtempSync(path.join(os.tmpdir(),'akari-samples-negative-'));
fs.writeFileSync(path.join(dir,'candidate.html'),fs.readFileSync(currentProductFile()));
const names=['dance.png','flower.png','game.png',...['dance','flower','game'].flatMap(id=>[id+'.akari.md',id+'-player.html'])];
for(const name of names)fs.writeFileSync(path.join(dir,name),'<html>validator negative control</html>');
// Synthetic success is only a control for rejection tests, never execution evidence.
const control={schema:'akari-samples-evidence-v1',status:'PASS',snapshot:inputs,environment:{...{browser:browserEnvironment.version,playwright:browserEnvironment.playwright}},pageErrors:[],networkRequests:[],results:sampleTestIds.map(id=>({id,status:'PASS',observed:sampleExpected[id]})),artifacts:names.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(dir,name)))}))};
verifySamples(control,inputs,dir);
const mutations=[r=>r.results.pop(),r=>r.results.push(r.results[0]),r=>r.results.reverse(),r=>r.results[0].status='FAIL',r=>r.results[0].observed.count=1,r=>r.results[0].error='exception',r=>r.snapshot.productSha256='0'.repeat(64),r=>r.environment.browser='unknown',r=>r.environment.playwright='unknown',r=>r.networkRequests.push('https://invalid'),r=>r.pageErrors.push('exception'),r=>r.artifacts.pop(),r=>r.artifacts[0].sha256='0'.repeat(64),r=>r.artifacts[0].path='../escape',()=>fs.writeFileSync(path.join(dir,'candidate.html'),'changed')];
const results=mutations.map((mutate,i)=>{const report=structuredClone(control);mutate(report);assert.throws(()=>verifySamples(report,inputs,dir),sampleNegativeIds[i]);return{id:sampleNegativeIds[i],rejected:true};});
const report={schema:'akari-samples-negative-v1',status:'PASS',snapshot:inputs,results};verifySamplesNegative(report,inputs);const output=path.resolve(process.argv[2]);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log('Samples validator: '+results.length+' rejected controls PASS');
