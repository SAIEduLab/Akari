import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {snapshot,sha,withBrowser,pageFor} from './lib/product-test-host.mjs';
import {completedCommit,completedManifestSha256,completedFixture,completedProduct,completedManifest,verifyFixedCore} from './lib/completed-baseline.mjs';
const [browserPath,output]=process.argv.slice(2);
if(!output||fs.existsSync(output))throw Error('Supply a fresh fixed-baseline evidence path');
const fixed=completedManifest(),before=snapshot('Akari.html');
const source=completedFixture+'/source',manifest=JSON.parse(fs.readFileSync(source+'/audit/manifests/product-tests.json'));
const bindings=fs.readFileSync(source+'/audit/suites/bindings.js','utf8');
const report=await withBrowser(browserPath,async browser=>{
  const suites=[];
  for(const spec of manifest.suites){
    const body=fs.readFileSync(source+'/audit/suites/'+spec.name+'.js','utf8');
    const actual=await pageFor(browser,completedProduct,p=>p.evaluate(`(async()=>{${bindings}\n${body}\nreturn await ${spec.name}();})()`));
    suites.push({name:spec.name,environment:'chromium',status:'PASS',...actual});
  }
  const results=suites.flatMap(s=>s.results),passed=results.filter(r=>r.pass).length;
  return {schema:'akari-fixed-release-report-v1',status:passed===884?'PASS':'FAIL',environment:'chromium',browser:browser.version(),node:process.version,snapshot:before,
    sourceCommit:completedCommit,manifestSha256:completedManifestSha256,canonicalProductSha256:fixed.productSha256,executedProductSha256:sha(fs.readFileSync(completedProduct)),suites,results,total:results.length,passed,failed:results.length-passed};
});
assert.deepEqual(snapshot('Akari.html'),before);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
verifyFixedCore(report,before);console.log('Verified 1.0.1 fixed checkpoint: 884/884 PASS');
