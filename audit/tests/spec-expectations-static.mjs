import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
import {areas,expectationNegatives,readExpectationFiles,verifyExpectations,verifyExpectationsStaticReport} from '../lib/spec-expectations.mjs';

// GA-STATIC: the expectation data is well formed, quotes its specification verbatim and covers every listed item.
// Imports no candidate parser, renderer or runtime.
// usage: node audit/tests/spec-expectations-static.mjs [<result.json>] [--area common|meijin]
// --area checks one area while the other is still being written (no result file, no negative controls).
const flag=process.argv.indexOf('--area'),only=flag>=0?[process.argv[flag+1]]:areas;
assert.ok(only.every(area=>areas.includes(area)),'unknown area');
const out=process.argv[2]&&!process.argv[2].startsWith('--')?process.argv[2]:null;
const files=readExpectationFiles(),{problems,summary}=verifyExpectations(files,{only});
if(problems.length){console.error(problems.join('\n'));process.exit(1);}
assert.ok(Object.values(summary).every(area=>area.cases>0),'no expectation cases');
if(!out||flag>=0){console.log(JSON.stringify({status:'PASS',summary}));process.exit(0);}
// Each rule of the validator is shown to reject a mutated copy of the data.
const negatives=expectationNegatives(files).map(({id,mutate})=>{
  const copy=structuredClone(files);mutate(copy);
  return {id,rejected:verifyExpectations(copy).problems.length>0};
});
const report={schema:'akari-spec-expectations-static-v1',status:negatives.every(n=>n.rejected)?'PASS':'FAIL',snapshot:snapshot(currentProductFile()),summary,negatives};
fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
if(report.status!=='PASS'){console.error(JSON.stringify(negatives.filter(n=>!n.rejected)));process.exit(1);}
verifyExpectationsStaticReport(report,report.snapshot);
console.log(JSON.stringify({status:'PASS',summary}));
