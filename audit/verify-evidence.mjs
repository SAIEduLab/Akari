import { currentProductFile } from "./lib/product-path.cjs";
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {snapshot} from './lib/product-test-host.mjs';
import {sealBundle,verifyBundle} from './lib/evidence-bundle.mjs';
const [mode,kindOrDirectory,directoryOrOutput]=process.argv.slice(2);
const provenance={run:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'1'};
if(mode==='seal')sealBundle(kindOrDirectory,directoryOrOutput,provenance);
else {
  assert.equal(mode,'aggregate');const inputs=snapshot(currentProductFile());
  const kinds=['static','selftest','audio-codecs-linux','audio-codecs-win32',...['session','ui','limits','schemas','extra'].map(g=>'full-browser-'+g)];
  const results=[];
  for(const kind of kinds){
    try{const result=verifyBundle(kind,path.join(kindOrDirectory,'akari-'+kind+'-'+provenance.run+'-'+provenance.attempt),inputs,provenance);results.push({kind,status:'PASS',result:result.result});}
    catch(e){results.push({kind,status:'FAIL',reason:e.message});}
  }
  let jobsPassed=false;
  try {
    const needs=JSON.parse(process.env.AKARI_NEEDS||'null');
    assert.deepEqual(Object.keys(needs).sort(),['audio-codecs','full-browser-gate','selftest','static']);
    jobsPassed=Object.values(needs).every(j=>j.result==='success');
  } catch { jobsPassed=false; }
  const report={status:jobsPassed&&results.every(r=>r.status==='PASS')?'MACHINE_PASS':'FAIL',candidateApproved:false,snapshot:inputs,results,jobsPassed};
  fs.mkdirSync(path.dirname(directoryOrOutput),{recursive:true});fs.writeFileSync(directoryOrOutput,JSON.stringify(report,null,2)+'\n');
  if(report.status!=='MACHINE_PASS')process.exitCode=1;
}
