import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {snapshot} from './lib/product-test-host.mjs';
import {gateSteps} from './lib/gate-contract.mjs';
import {verifyGateResults} from './lib/verify-gate-results.mjs';
const [browser,output]=process.argv.slice(2);
if(!output||fs.existsSync(output))throw Error('Supply a fresh evidence directory');
const dir=path.resolve(output);fs.mkdirSync(dir,{recursive:true});
const before=snapshot('Akari.html'),steps=[];
const save=status=>fs.writeFileSync(path.join(dir,'gate.json'),JSON.stringify({status,snapshot:before,node:process.version,platform:process.platform,steps},null,2)+'\n');
for(const [id,...args] of gateSteps(browser,dir)){
  console.log('START '+id);const started=new Date().toISOString();
  const r=cp.spawnSync(process.execPath,args,{encoding:'utf8',timeout:600000,maxBuffer:32e6});
  const log=id+'.log';fs.writeFileSync(path.join(dir,log),(r.stdout||'')+'\n'+(r.stderr||''));
  steps.push({id,args,started,finished:new Date().toISOString(),exit:r.status,signal:r.signal,error:r.error?.message,log});
  if(r.status!==0||r.error)process.exitCode=1;
  save(process.exitCode?'FAIL':'RUNNING');
  console.log((r.status===0?'PASS ':'FAIL ')+id+' '+(r.stdout||'').trim().slice(-400));
  if(r.status!==0||r.error){console.error((r.stderr||'').slice(-5000));process.exitCode=1;}
}
assert.deepEqual(snapshot('Akari.html'),before,'inputs changed during local gate');
if(!process.exitCode){save('PASS');try{const result=verifyGateResults(dir,before);fs.writeFileSync(path.join(dir,'nonregression.json'),JSON.stringify({snapshot:before,...result},null,2)+'\n');}catch(e){save('FAIL');throw e;}}
