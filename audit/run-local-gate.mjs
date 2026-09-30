import { currentProductFile } from "./lib/product-path.cjs";
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {snapshot} from './lib/product-test-host.mjs';
import {gateSteps} from './lib/gate-contract.mjs';
import {verifyGateResults} from './lib/verify-gate-results.mjs';
const [browser,output]=process.argv.slice(2),dir=path.resolve(output);
assert.ok(browser&&output);assert.ok(!fs.existsSync(dir),'Use a fresh evidence directory');fs.mkdirSync(dir,{recursive:true});
const inputs=snapshot(currentProductFile()),steps=[];
for(const [id,...args]of gateSteps(browser,dir)){
  const started=Date.now(),r=cp.spawnSync(process.execPath,args,{encoding:'utf8',timeout:600000,maxBuffer:64*1024*1024});
  const log=id+'.log';fs.writeFileSync(path.join(dir,log),(r.stdout||'')+'\n'+(r.stderr||'')+(r.error?.stack||''));
  steps.push({id,status:r.status===0&&!r.signal?'PASS':'FAIL',exit:r.status,signal:r.signal||null,ms:Date.now()-started,log});
  console.log(id+': '+steps.at(-1).status);if(r.status!==0)console.error((r.stderr||'').slice(-2000));
}
const report={schema:'akari-gate-v1',status:steps.every(s=>s.status==='PASS')?'PASS':'FAIL',snapshot:inputs,steps};
fs.writeFileSync(path.join(dir,'gate.json'),JSON.stringify(report,null,2)+'\n');
if(report.status==='PASS')verifyGateResults(dir,snapshot(currentProductFile()));else process.exitCode=1;
