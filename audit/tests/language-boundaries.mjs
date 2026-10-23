import { currentProductFile } from "./../lib/product-path.cjs";
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
import {boundarySource as make,boundaryCases,boundaryTimeoutMs,verifyLanguageBoundaries,checkLanguageBoundaryNegatives} from '../lib/language-boundaries-contract.mjs';

if(process.argv[2]==='--worker') {
  const [name,count]=process.argv.slice(3), source=make(name,Number(count));
  const html=fs.readFileSync(currentProductFile(),'utf8');
  const api=loadApi(html), start=performance.now(), memory=process.memoryUsage().heapUsed;
  const parsed=api.parseSyntax(source);
  const result={name,count:Number(count),chars:[...source].length,ms:performance.now()-start,heapDelta:process.memoryUsage().heapUsed-memory,accepted:!!parsed.ast,diagnostic:parsed.syntaxDiagnostics[0]?.code};
  console.log(JSON.stringify(result));
} else {
  const output=process.argv[2];
  assert.ok(output,'usage: node audit/tests/language-boundaries.mjs <result.json>');
  if(fs.existsSync(output))throw Error('Evidence already exists');
  const before=snapshot(currentProductFile()),results=[];
  const measure=(name,n)=>{
    const r=cp.spawnSync(process.execPath,[import.meta.filename,'--worker',name,String(n)],{encoding:'utf8',timeout:boundaryTimeoutMs,maxBuffer:1e6});
    assert.equal(r.status,0,`${name}/${n}: ${r.error||r.stderr}`);
    return JSON.parse(r.stdout);
  };
  for(const {name,count,accepted} of boundaryCases){
    const row=measure(name,count);assert.equal(row.accepted,accepted,name+'/'+count);
    // Preserve every input exactly. HEAD already includes missing-slide-duration/12000 (108003 chars)
    // as an over-limit refusal; only the separate near-limit inputs required <=100000.
    assert.equal(row.chars,[...make(name,count)].length);
    if(row.chars>100000){assert.equal(name,'missing-slide-duration');assert.equal(count,12000);assert.equal(row.chars,108003);assert.equal(row.accepted,false);}
    results.push(row);
  }
  const api=loadApi(fs.readFileSync(currentProductFile(),'utf8'));
  assert.ok(api.parseSyntax('※'+'a'.repeat(api.LIMITS.sourceEach-1)).ast);
  assert.equal(api.parseSyntax('※'+'a'.repeat(api.LIMITS.sourceEach)).ast,null);
  assert.equal(api.parseSyntax('（'.repeat(129)+'1'+'）'.repeat(129)+'を点数に加える').ast,null);
  assert.equal(api.parseSyntax('3を点数に加える\n'+' '.repeat(2)+'何もしない').ast,null);
  const frozen=JSON.parse(fs.readFileSync('audit/manifests/features.json'));
  for(const key of ['COMMAND_CATALOG','LIMITS','EXECUTABLE_CONTRACT']) assert.deepEqual(JSON.parse(JSON.stringify(api[key])),frozen[key],key);
  assert.deepEqual([...api.BLOCK_SCHEMAS.map(s=>s.id)],frozen.schemaIds);
  assert.deepEqual(snapshot(currentProductFile()),before);
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const report={status:'PASS',snapshot:before,timeoutMs:boundaryTimeoutMs,results,featureContract:'audit/manifests/features.json'};
  verifyLanguageBoundaries(report,before);report.validatorNegatives=checkLanguageBoundaryNegatives(report,before);
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:'PASS',measurements:results.length,maxMs:Math.max(...results.map(r=>r.ms))}));
}
