import {auditBundleKinds,auditJobIds} from './lib/gate-contract.mjs';
import {writeSummary} from './lib/audit-summary.mjs';
import {executionProvenance} from './lib/input-snapshot.cjs';
import { currentProductFile } from "./lib/product-path.cjs";
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {snapshot} from './lib/product-test-host.mjs';
import {sealBundle,verifyBundle,selectBundleDirectory} from './lib/evidence-bundle.mjs';
import {verifyMergedEvidence} from './lib/shard-evidence.mjs';
const [mode,kindOrDirectory,directoryOrOutput]=process.argv.slice(2);
const provenance=executionProvenance();
if(mode==='seal')sealBundle(kindOrDirectory,directoryOrOutput,provenance);
else {
  assert.equal(mode,'aggregate');const inputs=snapshot(currentProductFile());
  const kinds=auditBundleKinds;
  const results=[],verified={};
  for(const kind of kinds){
    try{const expected={...provenance,platform:'win32'};const selected=selectBundleDirectory(kind,kindOrDirectory,expected);const result=verifyBundle(kind,selected.directory,inputs,selected.provenance);results.push({kind,status:'PASS',provenance:selected.provenance,result:result.result});verified[kind]=selected.directory;}
    catch(e){results.push({kind,status:'FAIL',reason:e.message.slice(0,3000)});}
  }
  // The shards merged into one selftest tree and one browser tree, checked by the unchanged full validators.
  results.push(...verifyMergedEvidence(verified,inputs,path.join(path.dirname(directoryOrOutput),'merged')));
  let jobsPassed=false;
  try {
    const needs=JSON.parse(process.env.AKARI_NEEDS||'null');
    assert.deepEqual(Object.keys(needs).sort(),auditJobIds);
    jobsPassed=Object.values(needs).every(j=>j.result==='success');
  } catch { jobsPassed=false; }
  const report={status:jobsPassed&&results.every(r=>r.status==='PASS')?'MACHINE_PASS':'FAIL',candidateApproved:false,snapshot:inputs,results,jobsPassed};
  fs.mkdirSync(path.dirname(directoryOrOutput),{recursive:true});fs.writeFileSync(directoryOrOutput,JSON.stringify(report,null,2)+'\n');
  writeSummary(report,results);
  if(report.status!=='MACHINE_PASS')process.exitCode=1;
}
