import fs from 'node:fs';import assert from 'node:assert/strict';
import {snapshot} from '../lib/product-test-host.mjs';import {currentProductFile} from '../lib/product-path.cjs';
import {verifyEntryReport} from '../lib/entry-workshop-contract.mjs';
const [unitFile,browserFile,out]=process.argv.slice(2);if(!unitFile||!browserFile||!out)throw Error('unit, browser, output reports required');
const current=snapshot(currentProductFile()),unit=JSON.parse(fs.readFileSync(unitFile)),browser=JSON.parse(fs.readFileSync(browserFile));
const allowWorkingCopy=process.argv.includes('--working-copy'),options={allowWorkingCopy,file:browserFile};
verifyEntryReport(unit,'unit',current,{allowWorkingCopy});verifyEntryReport(browser,'browser',current,options);
const negatives=[];
for(const [id,change]of [
 ['missing-result',r=>r.results.pop()],['duplicate-result',r=>r.results.push(r.results[0])],
 ['skip-result',r=>r.results[0].status='SKIP'],['failed-result',r=>r.results[0].status='FAIL'],
 ['wrong-snapshot',r=>r.snapshot.productSha256='a'.repeat(64)],['wrong-sha',r=>r.commitSha='b'.repeat(40)],
 ['missing-step',r=>r.results.find(x=>x.id==='TUTORIAL-ALL-STEPS').observations.steps.pop()],
 ['missing-denial',r=>r.results.find(x=>x.id==='TUTORIAL-ALL-STEPS').observations.steps[0].denials.pop()],
 ['changed-work',r=>r.results.find(x=>x.id==='TUTORIAL-ALL-STEPS').observations.steps[0].denials[0].unchanged=false],
 ['fabricated-unchanged',r=>r.results.find(x=>x.id==='TUTORIAL-ALL-STEPS').observations.steps[0].denials[0].after.project='modified'],
 ['page-error',r=>r.pageErrors.push('uncaught product error')],['missing-viewport',r=>r.results.find(x=>x.id==='ENTRY-FIRST-VIEW').observations.viewports.pop()],
 ['missing-exit',r=>r.results.find(x=>x.id==='TUTORIAL-ALL-STEPS').observations.exits.pop()],['missing-artifact',r=>r.artifacts.pop()],
 ]){const bad=structuredClone(browser);change(bad);assert.throws(()=>verifyEntryReport(bad,'browser',current,options),id);negatives.push({id,rejected:true});}
const report={schema:'akari-entry-workshop-verification-v1',status:'PASS',finalCommittedEvidence:!allowWorkingCopy,snapshot:current,commitSha:unit.commitSha,unitIds:unit.results.map(r=>r.id),browserIds:browser.results.map(r=>r.id),negatives};
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log('Entry workshop verified; '+negatives.length+' invalid evidence sets rejected');
