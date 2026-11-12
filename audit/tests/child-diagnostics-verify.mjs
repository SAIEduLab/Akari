import fs from 'node:fs';
import path from 'node:path';
import {snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {verifyChildDiagnosticsReport} from '../lib/child-diagnostics-contract.mjs';
const [input,out]=process.argv.slice(2),output=path.resolve(out||input+'.verified.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
try {const report=JSON.parse(fs.readFileSync(input,'utf8'));
  const result=verifyChildDiagnosticsReport(report,snapshot(currentProductFile()));
  fs.writeFileSync(output,JSON.stringify({schema:'akari-child-diagnostics-verification-v1',input,...result},null,2)+'\n');
  console.log('Child diagnostics independent validator: '+result.required+' PASS');
}catch(error){fs.writeFileSync(output,JSON.stringify({schema:'akari-child-diagnostics-verification-v1',status:'FAIL',input,error:error.stack},null,2)+'\n');throw error;}
