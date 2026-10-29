import {writeSummary} from './lib/audit-summary.mjs';
import { currentProductFile } from "./lib/product-path.cjs";
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {snapshot} from './lib/product-test-host.mjs';
import {gateSteps} from './lib/gate-contract.mjs';
import {verifyGateResults} from './lib/verify-gate-results.mjs';
import {selftestShards,parseUnit} from './lib/shard-plan.cjs';
import {partLog,verifyGateShard} from './lib/shard-evidence.mjs';
// A CI shard (`--shard <id> <browser> <dir>`) runs only its planned steps and parts; the aggregate merges the shards.
const sharded=process.argv[2]==='--shard',[shard,browser,output]=sharded?process.argv.slice(3):[null,...process.argv.slice(2)],dir=path.resolve(output);
assert.ok(browser&&output);assert.ok(!fs.existsSync(dir),'Use a fresh evidence directory');fs.mkdirSync(dir,{recursive:true});
const inputs=snapshot(currentProductFile()),steps=[];
const planned=sharded?(()=>{assert.ok(Object.hasOwn(selftestShards,shard),'unknown selftest shard '+shard);const all=gateSteps(browser,dir);return selftestShards[shard].map(text=>{const {name,part}=parseUnit(text),step=all.find(s=>s[0]===name);assert.ok(step,'unknown gate step '+name);return {step,part};});})():gateSteps(browser,dir).map(step=>({step,part:null}));
for(const {step:[id,...args],part} of planned){
  const started=Date.now(),r=cp.spawnSync(process.execPath,args,{encoding:'utf8',timeout:600000,maxBuffer:64*1024*1024,...(part?{env:{...process.env,AKARI_PART:part}}:{})});
  const log=part?partLog(id,part):id+'.log';fs.writeFileSync(path.join(dir,log),(r.stdout||'')+'\n'+(r.stderr||'')+(r.error?.stack||''));
  steps.push({id,...(sharded?{part}:{}),status:r.status===0&&!r.signal?'PASS':'FAIL',exit:r.status,signal:r.signal||null,ms:Date.now()-started,log});
  console.log(id+(part?'@'+part:'')+': '+steps.at(-1).status);if(r.status!==0)console.error((r.stderr||'').slice(-2000));
}
const report=sharded?{schema:'akari-gate-shard-v1',shard,status:steps.every(s=>s.status==='PASS')?'PASS':'FAIL',snapshot:inputs,steps}:{schema:'akari-gate-v1',status:steps.every(s=>s.status==='PASS')?'PASS':'FAIL',snapshot:inputs,steps};
const receipt=path.join(dir,sharded?'gate-shard.json':'gate.json');
fs.writeFileSync(receipt,JSON.stringify(report,null,2)+'\n');
if(report.status==='PASS'){try{if(sharded)verifyGateShard(dir,shard,snapshot(currentProductFile()));else verifyGateResults(dir,snapshot(currentProductFile()));}catch(error){report.status='FAIL';report.validationFailure=error.stack;process.exitCode=1;console.error(error.stack);fs.writeFileSync(receipt,JSON.stringify(report,null,2)+'\n');}}else process.exitCode=1;
writeSummary(report,report.validationFailure?[...steps,{id:'result-validation',status:'FAIL',reason:report.validationFailure}]:steps);
