import fs from 'node:fs';
import path from 'node:path';
import {snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {verifyRepairFollowupBundle} from '../lib/ux-repair03-contract.mjs';

const dir=path.resolve(process.argv[2]);
let report;
try{
  const evidence=verifyRepairFollowupBundle(file=>JSON.parse(fs.readFileSync(path.join(dir,file))));
  report={schema:'akari-ux-repair-followup-aggregate-v1',status:'MACHINE_PASS',
    snapshot:snapshot(currentProductFile()),uxAcceptance:false,...evidence,
    validatorControl:'Changed evidence copies; not product execution'};
}catch(error){
  report={schema:'akari-ux-repair-followup-aggregate-v1',status:'FAIL',
    snapshot:snapshot(currentProductFile()),uxAcceptance:false,error:error.stack};
  process.exitCode=1;
}
fs.writeFileSync(path.join(dir,'ux-repair03-aggregate.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({schema:report.schema,status:report.status,results:report.results,
  rejectionControls:report.negative?.length,error:report.error}));
