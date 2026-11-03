import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {snapshot,root} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {gateSteps,acceptanceCommands} from '../lib/gate-contract.mjs';
import {trackedFiles} from '../lib/publication-contract.mjs';
import {auditInventory,assertAuditInventory,inventoryControlIds,inventorySchema,verifyAuditInventoryReport} from '../lib/audit-inventory-contract.mjs';

//   node audit/tests/audit-inventory.mjs <result.json>   every tracked audit file is reached from an audit entry point
const outputArgument=process.argv[2];
assert.ok(outputArgument,'usage: node audit/tests/audit-inventory.mjs <result.json>');
const output=path.resolve(outputArgument);
assert.ok(!fs.existsSync(output),'fresh result required: '+output);
fs.mkdirSync(path.dirname(output),{recursive:true});
const inputs=snapshot(currentProductFile());

// Synthetic tree: one file per entry kind, computed loader and observer. Contents are hand written.
// Module edges are built by these helpers so the publication import scan does not read them as this file's imports.
const imports=target=>'import '+JSON.stringify(target)+';\n',requires=target=>'require('+JSON.stringify(target)+');\n';
const base=()=>({
  '.github/workflows/check.yml':'jobs:\n  check:\n    steps:\n      - run: node audit/run-local-gate.mjs "$AKARI_BROWSER" audit-evidence/local\n      - run: python audit/install-browser.py "$RUNNER_TEMP/browser"\n',
  'AUDIT.md':'[forms](audit/FORMS.md)\nThe current plan is audit/reviewed/PLAN.md.\n',
  'audit/README.md':'- node audit/run-local-gate.mjs "$AKARI_BROWSER" audit-evidence/local\n',
  'audit/FORMS.md':'Forms.\n',
  'audit/reviewed/PLAN.md':'Plan.\n',
  'audit/install-browser.py':"open('audit/fixtures/browser-pin.json')\n",
  'audit/fixtures/browser-pin.json':'{}',
  'audit/public-files.json':JSON.stringify({productVersion:'9.9.9',files:[]}),
  'audit/run-local-gate.mjs':imports('./lib/runner.mjs'),
  'audit/lib/runner.mjs':"import fs from 'node:fs';\n"+imports('./product-path.cjs')+imports('./product-test-host.mjs')+imports('../browser/run-full-browser-audit.mjs')
    +"fs.readFileSync('audit/fixtures/sample.json');\nfs.readFileSync('audit/browser/browser-audit-manifest.json');\nfs.readFileSync('audit/manifests/product-tests.json');\n",
  'audit/lib/product-path.cjs':"const file='audit/public-files.json';\nconst currentReleaseFile=()=>'audit/manifests/release-' + currentProductVersion() + '.json';\n",
  'audit/lib/product-test-host.mjs':"export const suite=name=>fs.readFileSync(path.join(root,'audit/suites',name+'.js'));\n",
  'audit/browser/run-full-browser-audit.mjs':"const casesDir='cases';\nexport const task=name=>({name,script:path.join(casesDir,name+'.cjs')});\n",
  'audit/fixtures/sample.json':JSON.stringify({input:'audit/fixtures/sample-input.json',guide:'audit/reviewed/PLAN.md'}),
  'audit/fixtures/sample-input.json':'{}',
  'audit/tests/step.mjs':imports('../lib/step-helper.mjs'),
  'audit/lib/step-helper.mjs':'export const helper=1;\n',
  'audit/tests/accept.mjs':'export {};\n',
  'audit/tests/audit-inventory.mjs':imports('../lib/inventory-helper.mjs')+"export const tree={'audit/NOTES.md':'x','audit/fixtures/orphan.json':'{}'};\n",
  'audit/lib/inventory-helper.mjs':'export {};\n',
  'audit/browser/browser-audit-manifest.json':JSON.stringify({groups:{session:['case-a'],extra:['case-b:wide']}}),
  'audit/browser/cases/case-a.cjs':requires('./case-lib.cjs'),
  'audit/browser/cases/case-b.cjs':'module.exports={};\n',
  'audit/browser/cases/case-lib.cjs':'module.exports={};\n',
  'audit/manifests/product-tests.json':JSON.stringify({suites:[{name:'runSampleTests'}]}),
  'audit/suites/runSampleTests.js':'function runSampleTests(){return 1;}\n',
  'audit/manifests/release-9.9.9.json':'{}',
});
const baseSteps=()=>[['step','audit/tests/step.mjs','EVIDENCE/step.json'],['inventory','audit/tests/audit-inventory.mjs','EVIDENCE/inventory.json']];
const baseAcceptance=()=>({composition:['node audit/tests/accept.mjs "$AKARI_CODEC_BROWSER" audit-evidence/acceptance/accept.json']});
function run({tree=base(),steps=baseSteps(),acceptance=baseAcceptance(),unreadable=[]}={}){
  return auditInventory({files:Object.keys(tree),read:file=>{if(unreadable.includes(file)||!(file in tree))throw Error('ENOENT '+file);return tree[file];},steps,acceptance});
}
const edit=change=>{const tree=base();change(tree);return run({tree});};
// Each rejection must happen for its own reason: the exact unreachable set, and a named issue or none.
const rejects=(result,{unreachable=[],issue})=>{
  assert.throws(()=>assertAuditInventory(result));
  assert.deepEqual(result.unreachable,unreachable);
  if(issue)assert.ok(result.issues.length>0&&result.issues.every(text=>text.includes(issue)),JSON.stringify(result.issues));
  else assert.deepEqual(result.issues,[]);
};
const orphan='audit/tests/orphan.mjs';
// A valid report for the validator controls, over a hand-written audit file list.
const reportFiles=['audit/README.md','audit/lib/a.mjs','audit/tests/b.mjs'];
const validReport=()=>({schema:inventorySchema,status:'PASS',snapshot:structuredClone(inputs),reached:[...reportFiles],unreachable:[],issues:[],controls:inventoryControlIds.map(id=>({id,status:'PASS'}))});
const reportRejects=(mutate,reason)=>()=>{
  verifyAuditInventoryReport(validReport(),inputs,reportFiles);
  const report=validReport();mutate(report);
  assert.throws(()=>verifyAuditInventoryReport(report,inputs,reportFiles),reason);
};
const controls={
  'valid-tree':()=>{const result=assertAuditInventory(run());assert.deepEqual(result.scoped,Object.keys(base()).filter(f=>f.startsWith('audit/')).sort());},
  'orphan-file':()=>rejects(edit(t=>{t[orphan]='export {};\n';}),{unreachable:[orphan]}),
  'orphan-chain':()=>rejects(edit(t=>{t[orphan]=imports('../lib/orphan-helper.mjs');t['audit/lib/orphan-helper.mjs']='export {};\n';}),{unreachable:['audit/lib/orphan-helper.mjs',orphan]}),
  // Listing a document or data file in the publication inventory, or naming it in the inventory test, reaches nothing.
  'inventory-listing-only':()=>rejects(edit(t=>{t['audit/NOTES.md']='Notes.\n';t['audit/fixtures/orphan.json']='{}';t['audit/public-files.json']=JSON.stringify({productVersion:'9.9.9',files:['audit/NOTES.md','audit/fixtures/orphan.json']});}),{unreachable:['audit/NOTES.md','audit/fixtures/orphan.json']}),
  'comment-mention-only':()=>rejects(edit(t=>{t[orphan]='export {};\n';t['audit/lib/runner.mjs']+="// runs 'audit/tests/orphan.mjs'\n/* audit/tests/orphan.mjs */\n";}),{unreachable:[orphan]}),
  'data-names-code':()=>rejects(edit(t=>{t[orphan]='export {};\n';t['audit/fixtures/sample.json']=JSON.stringify({input:'audit/fixtures/sample-input.json',guide:'audit/reviewed/PLAN.md',runner:orphan});}),{unreachable:[orphan]}),
  'unlinked-document':()=>rejects(edit(t=>{t['audit/NOTES.md']='[forms](FORMS.md)\n';}),{unreachable:['audit/NOTES.md']}),
  // A command, a path or a link to a script in a reached document does not run it.
  'document-names-script':()=>rejects(edit(t=>{t[orphan]='export {};\n';t['audit/make-fixture.py']="print('fixture')\n";
    t['AUDIT.md']+='Run `node audit/tests/orphan.mjs`; see audit/tests/orphan.mjs and [it](audit/tests/orphan.mjs).\n';t['audit/README.md']+='- python audit/make-fixture.py\n';}),{unreachable:['audit/make-fixture.py',orphan]}),
  'removed-gate-step':()=>rejects(run({steps:baseSteps().filter(([id])=>id!=='step')}),{unreachable:['audit/lib/step-helper.mjs','audit/tests/step.mjs']}),
  'removed-acceptance-command':()=>rejects(run({acceptance:{composition:[]}}),{unreachable:['audit/tests/accept.mjs']}),
  'removed-workflow-command':()=>rejects(edit(t=>{t['.github/workflows/check.yml']=t['.github/workflows/check.yml'].replace(/ *- run: python .*\n/,'');}),{unreachable:['audit/fixtures/browser-pin.json','audit/install-browser.py']}),
  'removed-browser-task':()=>rejects(edit(t=>{t['audit/browser/browser-audit-manifest.json']=JSON.stringify({groups:{session:[],extra:['case-b:wide']}});}),{unreachable:['audit/browser/cases/case-a.cjs','audit/browser/cases/case-lib.cjs']}),
  'removed-suite':()=>rejects(edit(t=>{t['audit/manifests/product-tests.json']=JSON.stringify({suites:[]});}),{unreachable:['audit/suites/runSampleTests.js']}),
  'missing-release-manifest':()=>rejects(edit(t=>{t['audit/public-files.json']=JSON.stringify({productVersion:'9.9.10',files:[]});}),{unreachable:['audit/manifests/release-9.9.9.json'],issue:'loads missing audit/manifests/release-9.9.10.json'}),
  // The runtime loader no longer matches its inventory copy: an issue, although every file is still reached.
  'changed-runtime-loader':()=>rejects(edit(t=>{t['audit/browser/run-full-browser-audit.mjs']="const casesDir='cases';\nexport const task=name=>({name,script:path.join(casesDir,'run-'+name+'.cjs')});\n";}),{issue:'audit/browser/run-full-browser-audit.mjs: runtime loader changed'}),
  'unparsable-script':()=>rejects(edit(t=>{t['audit/lib/runner.mjs']="import fs from 'node:fs'\nfs.readFileSync(;\n";}),{unreachable:['audit/browser/browser-audit-manifest.json','audit/browser/cases/case-a.cjs','audit/browser/cases/case-b.cjs','audit/browser/cases/case-lib.cjs','audit/browser/run-full-browser-audit.mjs','audit/fixtures/sample-input.json','audit/fixtures/sample.json','audit/lib/product-path.cjs','audit/lib/product-test-host.mjs','audit/manifests/product-tests.json','audit/manifests/release-9.9.9.json','audit/public-files.json','audit/suites/runSampleTests.js'],issue:'audit/lib/runner.mjs: references could not be read'}),
  // A reached file that cannot be read or parsed fails the inventory on its own, with nothing unreachable.
  'unparsable-leaf':()=>rejects(edit(t=>{t['audit/lib/step-helper.mjs']='export const helper=;\n';}),{issue:'audit/lib/step-helper.mjs: references could not be read'}),
  'unreadable-leaf':()=>rejects(run({unreadable:['audit/lib/step-helper.mjs']}),{issue:'audit/lib/step-helper.mjs: unreadable'}),
  'missing-git-checkout':()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'akari-inventory-'));
    try{fs.mkdirSync(path.join(dir,'audit'));fs.writeFileSync(path.join(dir,'audit','README.md'),'');assert.throws(()=>trackedFiles(dir),/needs a git checkout/);}
    finally{fs.rmSync(dir,{recursive:true,force:true});}
  },
  'report-rejects-schema':reportRejects(r=>{r.schema='akari-audit-inventory-v0';},/inventory schema/),
  'report-rejects-status':reportRejects(r=>{r.status='FAIL';},/inventory status/),
  'report-rejects-snapshot':reportRejects(r=>{r.snapshot.productSha256='0'.repeat(64);},/inventory snapshot/),
  'report-rejects-unreachable':reportRejects(r=>{r.unreachable=['audit/lib/a.mjs'];},/unreachable audit files/),
  'report-rejects-issues':reportRejects(r=>{r.issues=['audit/lib/a.mjs: unreadable'];},/inventory issues/),
  'report-rejects-empty-reached':reportRejects(r=>{r.reached=[];},/reached audit files/),
  'report-rejects-duplicate-reached':reportRejects(r=>{r.reached.push(r.reached[0]);},/duplicate reached file/),
  'report-rejects-outside-reached':reportRejects(r=>{r.reached.push('src/build.mjs');},/outside the audit scope/),
  'report-rejects-truncated-reached':reportRejects(r=>{r.reached=r.reached.slice(0,1);},/differ from the audit inventory/),
  'report-rejects-extra-reached':reportRejects(r=>{r.reached=[...r.reached,'audit/tests/c.mjs'].sort();},/differ from the audit inventory/),
  'report-rejects-missing-control':reportRejects(r=>{r.controls.pop();},/inventory controls/),
  'report-rejects-reordered-controls':reportRejects(r=>{r.controls.reverse();},/inventory controls/),
  'report-rejects-failed-control':reportRejects(r=>{r.controls[0].status='FAIL';},/inventory control valid-tree/),
  'report-rejects-error':reportRejects(r=>{r.error='Error: inventory crashed';},/failed inventory run/),
};
assert.deepEqual(Object.keys(controls),inventoryControlIds);

const results=inventoryControlIds.map(id=>{try{controls[id]();return {id,status:'PASS'};}catch(error){return {id,status:'FAIL',error:error.stack};}});
const report={schema:inventorySchema,status:'FAIL',snapshot:inputs,reached:[],unreachable:[],issues:[],controls:results};
try{
  // The tracked set comes only from Git; outside a checkout this throws instead of skipping.
  const inventory=auditInventory({files:trackedFiles(root),read:file=>fs.readFileSync(path.join(root,file),'utf8'),steps:gateSteps('BROWSER','EVIDENCE'),acceptance:acceptanceCommands});
  Object.assign(report,{reached:inventory.scoped.filter(file=>!inventory.unreachable.includes(file)),unreachable:inventory.unreachable,issues:inventory.issues});
  if(results.every(row=>row.status==='PASS')&&!inventory.unreachable.length&&!inventory.issues.length){
    report.status='PASS';
    verifyAuditInventoryReport(report,snapshot(currentProductFile()));
  }
}catch(error){report.status='FAIL';report.error=error.stack;}
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const failedControls=results.filter(row=>row.status!=='PASS');
if(report.status!=='PASS'){
  console.error(JSON.stringify({unreachable:report.unreachable,issues:report.issues,failedControls,error:report.error},null,2));
  process.exitCode=1;
}else console.log('Audit inventory: '+report.reached.length+' audit files reached; '+results.length+' controls PASS');
