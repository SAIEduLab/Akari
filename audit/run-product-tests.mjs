import fs from 'node:fs';
import path from 'node:path';
import {root,snapshot,withBrowser,externalReports} from './lib/product-test-host.mjs';
import {verify,verifyAuthority} from './lib/verify-test-results.mjs';
const [browserPath,product,output]=process.argv.slice(2);
if(!browserPath||!product||!output)throw Error('usage: node audit/run-product-tests.mjs <browser> <html> <output-json>');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'audit/manifests/product-tests.json')));
verifyAuthority(manifest);
const before=snapshot(product);
const report=await withBrowser(browserPath,async browser=>{
  const suites=await externalReports(browser,product,manifest.suites.map(s=>s.name));
  const results=suites.flatMap(s=>s.results);
  return {schema:'akari-product-report-v1',snapshot:before,environment:'chromium',browser:browser.version(),node:process.version,
    status:results.every(r=>r.pass)?'PASS':'FAIL',complete:true,suites,results,total:results.length,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length};
});
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
verify(report,manifest,snapshot(product));
console.log(`${product}: external ${report.passed}/${report.total} PASS`);
