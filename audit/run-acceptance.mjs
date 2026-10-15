import fs from 'node:fs';import path from 'node:path';import cp from 'node:child_process';import assert from 'node:assert/strict';
import {acceptanceCommands} from './lib/gate-contract.mjs';import {snapshot} from './lib/product-test-host.mjs';import {currentProductFile} from './lib/product-path.cjs';import {writeSummary} from './lib/audit-summary.mjs';
const [kind]=process.argv.slice(2);assert.ok(Object.hasOwn(acceptanceCommands,kind));const dir=kind==='composition'?'audit-evidence/acceptance':'audit-evidence/repair05';fs.mkdirSync(dir,{recursive:true});const steps=[];
for(const [i,command]of acceptanceCommands[kind].entries()){
 const args=command.slice(5).match(/"[^"]*"|\S+/g).map(s=>s.replace(/^"|"$/g,'')).map(s=>s==='$AKARI_CODEC_BROWSER'?process.env.AKARI_CODEC_BROWSER:s);
 const started=Date.now(),r=cp.spawnSync(process.execPath,args,{encoding:'utf8',timeout:600000,maxBuffer:64*1024*1024}),log='step-'+String(i+1).padStart(2,'0')+'.log';
 fs.writeFileSync(path.join(dir,log),(r.stdout||'')+'\n'+(r.stderr||'')+(r.error?.stack||''));const status=r.status===0&&!r.signal&&!r.error?'PASS':'FAIL';steps.push({id:args[0]+(args[0].includes('child-ux')?'/'+args[1]:''),status,exit:r.status,signal:r.signal||null,ms:Date.now()-started,log});console.log(steps.at(-1).id+': '+status);if(status==='FAIL')console.error((r.stderr||'').slice(-3000));
}
const report={schema:'akari-acceptance-execution-v1',status:steps.every(s=>s.status==='PASS')?'PASS':'FAIL',snapshot:snapshot(currentProductFile()),steps};fs.writeFileSync(path.join(dir,'execution.json'),JSON.stringify(report,null,2)+'\n');if(report.status==='PASS'){const sealed=cp.spawnSync(process.execPath,['audit/tests/child-ux.mjs','seal',kind,dir],{encoding:'utf8',timeout:600000,maxBuffer:64*1024*1024});console.log(sealed.stdout||'');if(sealed.status!==0){report.status='FAIL';report.validationFailure=sealed.stderr||sealed.error?.stack||'seal failed';console.error(report.validationFailure);process.exitCode=1;}}else process.exitCode=1;

writeSummary(report,report.validationFailure?[...steps,{id:'result-validation',status:'FAIL',reason:report.validationFailure}]:steps);
