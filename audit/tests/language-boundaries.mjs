import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {loadApi} from '../browser/legacy/audit-lib.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
import {verifyCompletedRuntime} from '../lib/completed-runtime-contract.mjs';
import {completedCommit} from '../lib/completed-baseline.mjs';
import {readCheckpointSource} from '../lib/checkpoint-source.mjs';
const baseline=completedCommit;
const make=(name,n)=>({
  'unclosed-string':'「'+'をにから秒'.repeat(n)+'という',
  'unclosed-name':'【'+'をにから秒'.repeat(n)+'に加える',
  'unclosed-parens':'（'.repeat(n)+'1を点数に足す',
  'duplicate-particles':'1を'+'点数に'.repeat(n)+'足す',
  'duplicate-time':'1秒で'.repeat(n)+'横1、縦2の位置へ滑る',
  'duplicate-coordinates':'横1、縦2、'.repeat(n)+'の位置へ行く',
  'missing-slide-destination':'1秒で'.repeat(n)+'滑る',
  'missing-slide-duration':'横1、縦2の位置へ'.repeat(n)+'すべる',
  'comparison-late-failure':'aが'.repeat(n)+'1と同じと言う',
  'comparison-missing-marker':'1より'.repeat(n)+'大きいという',
  'missing-tone-frequency':'1秒、'.repeat(n)+'鳴らす',
  'duplicate-input-value':'1を'.repeat(n)+'「値」に入れる',
  'long-valid':Array(n).fill('何もしない').join('\n'),
})[name];
if(process.argv[2]==='--worker') {
  const [name,count,version]=process.argv.slice(3), source=make(name,Number(count));
  const html=version==='baseline'?readCheckpointSource(baseline,'Akari.html').toString():fs.readFileSync('Akari.html','utf8');
  const api=loadApi(html), start=performance.now(), memory=process.memoryUsage().heapUsed;
  const parsed=api.parseSyntax(source);
  const result={name,count:Number(count),version,chars:[...source].length,ms:performance.now()-start,heapDelta:process.memoryUsage().heapUsed-memory,accepted:!!parsed.ast,diagnostic:parsed.syntaxDiagnostics[0]?.code};
  console.log(JSON.stringify(result));
} else {
  const before=snapshot('Akari.html'),results=[];
  for(const name of ['unclosed-string','unclosed-name','unclosed-parens','duplicate-particles','duplicate-time','duplicate-coordinates','long-valid',
    'missing-slide-destination','missing-slide-duration','comparison-late-failure','comparison-missing-marker','missing-tone-frequency','duplicate-input-value'])
    for(const n of [1000,4000,12000]) for(const version of ['baseline','candidate']) {
      const r=cp.spawnSync(process.execPath,[import.meta.filename,'--worker',name,String(n),version],{encoding:'utf8',timeout:5000,maxBuffer:1e6});
      assert.equal(r.status,0,`${name}/${n}/${version}: ${r.error||r.stderr}`);
      const row=JSON.parse(r.stdout);assert.equal(row.accepted,name==='long-valid');results.push(row);
    }
  // Exercise malformed late failures just below the product limit as well.
  for(const [name,n] of Object.entries({'missing-slide-destination':32000,'missing-slide-duration':10000,
    'comparison-late-failure':45000,'comparison-missing-marker':32000,'missing-tone-frequency':32000,'duplicate-input-value':45000}))
    for(const version of ['baseline','candidate']) {
      const r=cp.spawnSync(process.execPath,[import.meta.filename,'--worker',name,String(n),version],{encoding:'utf8',timeout:5000,maxBuffer:1e6});
      assert.equal(r.status,0,`${name}/${n}/${version}: ${r.error||r.stderr}`);
      const row=JSON.parse(r.stdout);assert.equal(row.accepted,false);assert.ok(row.chars<=100000);results.push(row);
    }
  const api=loadApi(fs.readFileSync('Akari.html','utf8'));
  assert.ok(api.parseSyntax('※'+'a'.repeat(api.LIMITS.sourceEach-1)).ast);
  assert.equal(api.parseSyntax('※'+'a'.repeat(api.LIMITS.sourceEach)).ast,null);
  assert.equal(api.parseSyntax('（'.repeat(129)+'1'+'）'.repeat(129)+'を点数に加える').ast,null);
  assert.equal(api.parseSyntax('3を点数に加える\n'+' '.repeat(2)+'何もしない').ast,null);
  const base=loadApi(readCheckpointSource(baseline,'Akari.html').toString());
  assert.deepEqual([...Object.keys(api)], [...Object.keys(base)],'public API changed');
  verifyCompletedRuntime(api.createAkariRuntime.toString(),base.createAkariRuntime.toString());
  for(const key of ['COMMAND_CATALOG','LIMITS']) assert.equal(JSON.stringify(api[key]),JSON.stringify(base[key]),key);
  assert.equal(JSON.stringify(api.EXECUTABLE_VERSION),JSON.stringify({appVersion:'1.0.2',runtimeVersion:'1.0.0',languageVersion:'1.0.0',programFormatVersion:3,projectFormatVersion:3}));
  assert.equal(JSON.stringify(api.BLOCK_SCHEMAS.map(s=>s.id)),JSON.stringify(base.BLOCK_SCHEMAS.map(s=>s.id)));
  assert.deepEqual(snapshot('Akari.html'),before);
  const output=process.argv[2]||'audit-evidence/phase3/language-boundaries.json';
  if(fs.existsSync(output))throw Error('Evidence already exists');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify({status:'PASS',snapshot:before,timeoutMs:5000,results,apiAdded:[],schemaAdded:[],opcodeAdded:[],runtimeChanges:['recorded implementation identifiers only'],runtimeEvaluationUnchanged:true},null,2)+'\n');
  console.log(JSON.stringify({status:'PASS',measurements:results.length,maxMs:Math.max(...results.map(r=>r.ms))}));
}
