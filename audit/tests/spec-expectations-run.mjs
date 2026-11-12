import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {readExpectationFiles,verifyExpectations,verifyExpectationsRunReport,areas,expectationsRoot} from '../lib/spec-expectations.mjs';
import {runCase} from '../lib/spec-expectations-host.mjs';

// GA-EXEC: runs every executable case of the expectation data against the real product API.
// The expectations are written from LANGUAGE.md alone (spec-expectations-static.mjs); this run never edits or regenerates them.
// usage: node audit/tests/spec-expectations-run.mjs <result.json> [--area common|meijin]
const out=process.argv[2];
if(!out||out.startsWith('--'))throw Error('usage: node audit/tests/spec-expectations-run.mjs <result.json> [--area common|meijin]');
const flag=process.argv.indexOf('--area'),only=flag>=0?[process.argv[flag+1]]:areas;
const files=readExpectationFiles(),{problems}=verifyExpectations(files,{only});
assert.deepEqual(problems,[],'expectation data is not well formed');
const product=currentProductFile(),inputs=snapshot(product),api=loadApi(fs.readFileSync(product,'utf8'));
const inputHashes=Object.fromEntries(areas.flatMap(area=>['items','cases'].map(kind=>{
  const file=path.join(expectationsRoot,area,kind+'.json');return [`${area}/${kind}.json`,sha(fs.readFileSync(file))];})));
const results=[];
for(const area of only)for(const c of files[area].cases.cases)results.push({area,kind:c.kind,polarity:c.polarity,item:c.item,...await runCase(api,c)});
const count=status=>results.filter(r=>r.status===status).length;
const report={schema:'akari-spec-expectations-run-v1',snapshot:inputs,inputs:inputHashes,areas:only,total:results.length,
  passed:count('PASS'),failed:count('FAIL'),notRun:count('NOT_RUN'),
  status:count('FAIL')?'FAIL':'PASS',results};
fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,total:report.total,passed:report.passed,failed:report.failed,notRun:report.notRun}));
for(const r of results.filter(r=>r.status==='FAIL').slice(0,60))console.error(r.id+' ['+r.kind+'] '+r.detail);
if(report.status==='PASS'&&flag<0)verifyExpectationsRunReport(JSON.parse(JSON.stringify(report)),inputs,{sha});
process.exitCode=report.status==='PASS'?0:1;
