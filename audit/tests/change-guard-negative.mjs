// Gate step: every change-guard rule against synthetic base/head commits built from the
// candidate checkout in an isolated git repository, plus accepted controls.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {changeGuard,treeIdentity,git,nextPatch,formatGuardReport,auditChangesFile,auditChangesSchema,changedScriptLines} from '../lib/change-guard.mjs';
import {gateSteps,integrityControlIds,acceptanceCommands,acceptanceIds,workflowContract,guardCodePaths} from '../lib/gate-contract.mjs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {declaredGateCases,caseRecorder,writeCaseReport,gateCaseIds} from '../lib/gate-case-contract.mjs';
import {currentPart,partItems} from '../lib/shard-plan.cjs';
import {expectedLanguageIds} from '../lib/verify-language-results.mjs';
import {currentProductFile,currentProductVersion,currentReleaseFile} from '../lib/product-path.cjs';
import {boundedSnapshot,productApi,runLimited} from '../lib/behaviour-snapshot.mjs';
import {boundedCoverage} from '../lib/node-coverage.mjs';
const [output]=process.argv.slice(2);assert.ok(output,'usage: change-guard-negative.mjs <result.json>');
const part=currentPart('change-guard-negative'),mine=new Set(partItems('change-guard-negative',gateCaseIds['change-guard-negative'],part));
const {results,pass}=caseRecorder();
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'akari-guard-test-'));
try {
  // Isolated git: no system or user configuration, fixed identity and dates.
  const config=path.join(tmp,'gitconfig');fs.writeFileSync(config,'');
  Object.assign(process.env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:config,GIT_TERMINAL_PROMPT:'0',
    GIT_AUTHOR_NAME:'Akari audit',GIT_AUTHOR_EMAIL:'audit@akari.invalid',GIT_COMMITTER_NAME:'Akari audit',GIT_COMMITTER_EMAIL:'audit@akari.invalid',
    GIT_AUTHOR_DATE:'2000-01-01T00:00:00Z',GIT_COMMITTER_DATE:'2000-01-01T00:00:00Z'});
  const repo=path.join(tmp,'repo'),trees=path.join(tmp,'trees');
  cp.execFileSync('git',['init','-q',repo],{stdio:'pipe'});fs.mkdirSync(trees);
  // The base commit mirrors the candidate checkout: audit/, src/, the portable extensions src/ embeds, the product and AUDIT.md.
  const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):e.isFile()?[dir+'/'+e.name]:[]);
  const files=[...walk('audit'),...walk('src'),...walk('extensions'),currentProductFile(),'AUDIT.md'];
  const oids=git(repo,['hash-object','-w','--no-filters','--stdin-paths'],files.map(f=>path.resolve(f)).join('\n')+'\n').toString().trim().split('\n');
  assert.equal(oids.length,files.length);
  const baseFiles=new Map(files.map((f,i)=>[f,oids[i]]));
  const blob=content=>git(repo,['hash-object','-w','--no-filters','--stdin'],content).toString().trim();
  let made=0;
  function commitFiles(map,parents){
    const index=path.join(tmp,'index');fs.rmSync(index,{force:true});
    const env={...process.env,GIT_INDEX_FILE:index},run=(args,input)=>cp.execFileSync('git',['-C',repo,...args],{env,input,stdio:['pipe','pipe','pipe']}).toString().trim();
    run(['update-index','--add','-z','--index-info'],[...map].map(([p,oid])=>'100644 '+oid+'\t'+p+'\0').join(''));
    return run(['commit-tree',run(['write-tree']),...parents.flatMap(p=>['-p',p]),'-m','fixture '+(++made)]);
  }
  const base=commitFiles(baseFiles,[]);
  function derive(changes,parent=base){
    const map=new Map(baseFiles);
    for(const [file,content] of Object.entries(changes)){if(content===null){assert.ok(map.delete(file),'fixture lacks '+file);}else map.set(file,blob(content));}
    return commitFiles(map,[parent]);
  }
  const text=file=>fs.readFileSync(file,'utf8');
  const replaced=(file,from,to)=>{const t=text(file);assert.ok(t.includes(from),file+' lacks '+JSON.stringify(from.slice(0,80)));return t.replace(from,to);};
  const json=(file,change)=>{const value=JSON.parse(text(file));change(value);return JSON.stringify(value,null,2)+'\n';};
  // The record of audit changes, with a reason for each change named (auditChangesFile).
  const record=(...changes)=>({[auditChangesFile]:JSON.stringify({schema:auditChangesSchema,changes:changes.map(change=>({change,reason:'an audit change made for this guard case'}))},null,2)+'\n'});
  const allowance=(...grown)=>({[auditChangesFile]:JSON.stringify({schema:auditChangesSchema,changes:[],allowances:grown.map(change=>({change,reason:'an audit change made for this guard case'}))},null,2)+'\n'});
  const guard=(head,{from=base,limitMs}={})=>changeGuard({repo,base:from,head,workDir:trees,limitMs});
  const accepted=(id,report,removed={})=>{
    assert.equal(report.status,'PASS',id+': '+JSON.stringify(report));assert.deepEqual(report.removed,removed,id+' removed');pass(id);
  };
  // A removal that the change does not record with a reason fails.
  const removal=(id,report,removed)=>{
    assert.deepEqual(report.removed,removed,id+' removed');assert.ok(report.auditChangeIssues.some(m=>/is not recorded with a reason/.test(m)),id+': '+JSON.stringify(report.auditChangeIssues));
    assert.deepEqual([report.errors,report.versionIssues,report.releaseIssues],[[],[],[]],id+' fails only for the removal');
    assert.equal(report.status,'FAIL',id);pass(id);
  };
  const failed=(id,report,field,pattern)=>{
    assert.equal(report.status,'FAIL',id);assert.ok(report[field].some(m=>pattern.test(m)),id+': '+JSON.stringify(report[field]));pass(id);
  };

  // Releases the version and behaviour cases build: the product renamed to its next version, src changed or not.
  const version=currentProductVersion(),product=currentProductFile(),templateText=text('src/akari.html'),sourceChange={'src/akari.html':templateText+'\n<!-- changed -->\n'};
  function release(next,{changeSource=false,productBytes=text(product)}={}){
    const file='Akari_'+next.replaceAll('.','_')+'.html';
    return {'audit/public-files.json':json('audit/public-files.json',m=>{m.productVersion=next;m.productFile=file;m.files=m.files.map(f=>f===product?file:f);}),
      [product]:null,[file]:productBytes,[currentReleaseFile()]:null,['audit/manifests/release-'+next+'.json']:text(currentReleaseFile()),...(changeSource?sourceChange:{})};
  }
  // Shared by the groups: a record of intended behaviour changes and the product to change.
  const intended=cases=>({'audit/manifests/intended-behaviour-changes.json':JSON.stringify({schema:'akari-intended-behaviour-changes-v1',changes:cases.map(c=>({case:c,reason:'a check message reworded in this audit fixture'}))},null,2)+'\n'});
  // The guard reads the product, not the sources it is built from: the cases that change a line change the product's
  // script (one anchor, which must be in it once), and the head product is the next patch.
  const productText=text(product);
  const productLine=(anchor,insert)=>{assert.equal(productText.split(anchor).length,2,'one anchor in the product: '+anchor.trim());return productText.replace(anchor,()=>anchor+insert);};
  // A function the syntax suite runs, and a no-op sum to put at its start.
  const runFn='  function replaceUnprotectedWord(text, from, to) {\n',noOpLine='    void (1 + 1);\n';
  // A CI part (AKARI_PART) runs its planned groups (audit/lib/shard-plan.cjs): the tree, record, version and language
  // rules and the confinement; or the behaviour and limit rules, the assertion and changed-line rules, the test map and
  // the record without a change.
  if(mine.has('real-tree/identity-extracted')){
  // The identity of the candidate tree, read through git and the tree's own contracts.
  const identity=await treeIdentity(repo,base,trees);
  const products=JSON.parse(text('audit/manifests/product-tests.json')),browser=JSON.parse(text('audit/browser/browser-audit-manifest.json')),browserResults=JSON.parse(text('audit/manifests/browser-results.json'));
  const expectedSets={
    'gate-step':gateSteps('','').map(step=>step[0]),'gate-case':declaredGateCases(products),'integrity-control':integrityControlIds,
    'acceptance-suite':Object.keys(acceptanceCommands).flatMap(kind=>acceptanceIds(kind).map(id=>kind+'/'+id)),
    'browser-group':Object.keys(browser.groups),'browser-task':Object.entries(browser.groups).flatMap(([group,tasks])=>tasks.map(task=>group+'/'+task)),
    'browser-case':browserResults.entries.flatMap(e=>e.keys.map(key=>e.group+'/'+e.task+'/'+key)),
    'product-suite':products.suites.map(suite=>suite.name),'product-test':products.suites.flatMap(suite=>suite.ids.map(id=>suite.name+'/'+id)),
    'language-test':expectedLanguageIds(JSON.parse(text('audit/manifests/language-form-coverage.json'))),
    'workflow-job':Object.entries(workflowContract).flatMap(([file,w])=>Object.keys(w.jobs).map(job=>file+'/'+job)),
    'workflow-entry':Object.entries(workflowContract).flatMap(([file,w])=>Object.entries(w.jobs).flatMap(([job,j])=>j.entries.map(e=>file+'/'+job+'/'+e.run))),
  };
  for(const [category,ids] of Object.entries(expectedSets)){assert.ok(ids.length,category+' is empty');assert.deepEqual(identity.sets[category],ids,category);}
  assert.ok(identity.sets.pin.includes(products.fixedIdSha256),'pins include the product test ID pin');
  assert.ok([...identity.pins.values()].flat().every(file=>!/release-[^/]*\.json$/.test(file)),'the release record is not a pin');
  assert.deepEqual([identity.version,identity.productFile,identity.releases],[currentProductVersion(),currentProductFile(),[currentReleaseFile()]]);
  pass('real-tree/identity-extracted');

  const documentation={'AUDIT.md':text('AUDIT.md')+'\n<!-- note -->\n'},docHead=derive(documentation);
  const documented=await guard(docHead);accepted('control/documentation-only',documented);
  // The report names whose guard judged the change: here the guard of the base, which the head keeps; a head that edits
  // the guard leaves it the base's only.
  assert.deepEqual(documented.guardCode,{base:true,head:true},'the guard running here is the base\'s and the head\'s');
  assert.ok(formatGuardReport(documented).includes("Guard code: the base's"),'the report names the base\'s guard');
  const editedGuard=await guard(derive({'audit/lib/change-guard.mjs':text('audit/lib/change-guard.mjs')+'\n// edited\n'}));
  assert.deepEqual([editedGuard.status,editedGuard.guardCode],['PASS',{base:true,head:false}],'a head that edits the guard');pass('control/guard-code-named');
  const addedStep=replaced('audit/lib/gate-contract.mjs',"  ['static',","  ['added-check','audit/tests/added-check.mjs'],\n  ['static',");
  accepted('control/additions-only',await guard(derive({'audit/lib/gate-contract.mjs':addedStep,
    'audit/manifests/product-tests.json':json('audit/manifests/product-tests.json',m=>m.suites.find(s=>s.name==='runExtendedTests').ids.push('ADDED-CHECK')),
    'audit/fixtures/added-pin.json':JSON.stringify({sha256:'d'.repeat(64)})})));
  accepted('control/pin-moved',await guard(derive({'audit/fixtures/basic-intents.json':null,'audit/fixtures/basic-intents-moved.json':text('audit/fixtures/basic-intents.json')})));
  // The base branch gained a step after the head branched: that is not a removal by the head.
  const advanced=await guard(docHead,{from:derive({'audit/lib/gate-contract.mjs':addedStep})});
  assert.equal(advanced.mergeBase,base);accepted('control/base-advanced-after-branch',advanced);

  const withoutStepChange={'audit/lib/gate-contract.mjs':replaced('audit/lib/gate-contract.mjs',"  ['dom-regression','audit/tests/dom-render-regression.cjs',file('dom-regression')],\n",'')},withoutStep=derive(withoutStepChange);
  removal('removed/gate-step',await guard(withoutStep),{'gate-step':['dom-regression']});
  removal('removed/gate-case',await guard(derive({'audit/lib/gate-case-contract.mjs':replaced('audit/lib/gate-case-contract.mjs',"'dom-regression':['normal-observation',","'dom-regression':[")})),{'gate-case':['dom-regression/normal-observation']});
  removal('removed/integrity-control',await guard(derive({'audit/lib/gate-contract.mjs':replaced('audit/lib/gate-contract.mjs',"'freeze-second-release-refused',",'')})),{'integrity-control':['freeze-second-release-refused']});
  removal('removed/acceptance-suite',await guard(derive({'audit/lib/gate-contract.mjs':replaced('audit/lib/gate-contract.mjs','    "node audit/tests/natural-roles.mjs audit-evidence/acceptance/natural-roles.json",\n','')})),{'acceptance-suite':['composition/audit/tests/natural-roles.mjs']});
  removal('removed/browser-group',await guard(derive({'audit/browser/browser-audit-manifest.json':json('audit/browser/browser-audit-manifest.json',m=>delete m.groups.extra)})),
    {'browser-group':['extra'],'browser-task':browser.groups.extra.map(task=>'extra/'+task)});
  removal('removed/browser-task',await guard(derive({'audit/browser/browser-audit-manifest.json':json('audit/browser/browser-audit-manifest.json',m=>m.groups.extra=m.groups.extra.filter(t=>t!=='long-regression'))})),
    {'browser-task':['extra/long-regression']});
  const firstEntry=browserResults.entries[0];
  removal('removed/browser-case',await guard(derive({'audit/manifests/browser-results.json':json('audit/manifests/browser-results.json',m=>m.entries[0].keys.pop())})),
    {'browser-case':[firstEntry.group+'/'+firstEntry.task+'/'+firstEntry.keys.at(-1)]});
  const boundary=products.suites.find(s=>s.name==='runLimitBoundaryTests');
  removal('removed/product-suite',await guard(derive({'audit/manifests/product-tests.json':json('audit/manifests/product-tests.json',m=>m.suites=m.suites.filter(s=>s.name!=='runLimitBoundaryTests'))})),
    {'product-suite':['runLimitBoundaryTests'],'product-test':boundary.ids.map(id=>'runLimitBoundaryTests/'+id)});
  const coreId=products.suites.find(s=>s.name==='runCoreTests').ids[0];
  removal('removed/product-test',await guard(derive({'audit/manifests/product-tests.json':json('audit/manifests/product-tests.json',m=>m.suites.find(s=>s.name==='runCoreTests').ids.shift())})),
    {'gate-case':['node-product/runCoreTests/'+coreId],'product-test':['runCoreTests/'+coreId]});
  const languageManifest=JSON.parse(text('audit/manifests/language-form-coverage.json')),fewerCases={...languageManifest,cases:languageManifest.cases.slice(1)};
  removal('removed/language-test',await guard(derive({'audit/manifests/language-form-coverage.json':JSON.stringify(fewerCases)})),
    {'language-test':expectedLanguageIds(languageManifest).filter(id=>!expectedLanguageIds(fewerCases).includes(id))});
  const unpackEntry='node audit/lib/ci-lanes.mjs unpack acceptance audit-evidence/child-ux/downloaded';
  const worker='akari-acceptance.yml/acceptance-lane';
  removal('removed/workflow-job',await guard(derive({'audit/lib/gate-contract.mjs':replaced('audit/lib/gate-contract.mjs',"'acceptance-lane':laneWorker","'other-acceptance':laneWorker")})),
    {'workflow-job':[worker],'workflow-entry':[worker+'/node audit/run-ci-lane.mjs acceptance "${{ matrix.shard }}"']});
  removal('removed/workflow-entry',await guard(derive({'audit/lib/gate-contract.mjs':replaced('audit/lib/gate-contract.mjs',unpackEntry,unpackEntry+' --quick')})),
    {'workflow-entry':['akari-acceptance.yml/child-ux-aggregate/'+unpackEntry]});
  const changedPin=await guard(derive({'audit/manifests/product-tests.json':json('audit/manifests/product-tests.json',m=>m.fixedIdSha256='e'.repeat(64))}));
  assert.deepEqual(changedPin.pinFiles,{[products.fixedIdSha256]:['audit/manifests/product-tests.json']});
  removal('pin/changed',changedPin,{pin:[products.fixedIdSha256]});
  const startMain=JSON.parse(text('audit/fixtures/child-ux-plan.json')).startMain;assert.match(startMain,/^[0-9a-f]{40}$/);
  removal('pin/removed',await guard(derive({'audit/fixtures/child-ux-plan.json':replaced('audit/fixtures/child-ux-plan.json',startMain,'')})),{pin:[startMain]});

  // The oldest browser and Playwright a report may name are raised, never lowered: a lower one checks less.
  const environmentFile='audit/lib/browser-environment.mjs',oldestLine=/export const oldestBrowser='([0-9.]+)',oldestPlaywright='([0-9.]+)';/,[,oldestBrowser,oldestPlaywright]=text(environmentFile).match(oldestLine);
  const oldestAt=(b,p)=>({[environmentFile]:text(environmentFile).replace(oldestLine,"export const oldestBrowser='"+b+"',oldestPlaywright='"+p+"';")});
  const lowerBrowser=oldestBrowser.replace(/^\d+/,n=>String(Number(n)-1));
  failed('lowered/oldest-browser',await guard(derive(oldestAt(lowerBrowser,oldestPlaywright))),'auditChangeIssues',new RegExp('the audit change oldest-browser:'+lowerBrowser.replaceAll('.','\\.')+' is not recorded'));
  accepted('control/oldest-raised',await guard(derive(oldestAt(oldestBrowser.replace(/^\d+/,n=>String(Number(n)+1)),oldestPlaywright))));
  // The allowances the audit may only shrink (allowanceCategories): an entry the head adds, or a raised count, fails
  // unless the change records it with a reason in the record's allowances, and may come with a product change; a
  // lowered count adds nothing. Recorded among the changes it is not recorded, and an allowance nothing grows fails.
  const grownCodes=replaced('audit/lib/source-consistency.mjs',"export const UNNAMED_CODES = Object.freeze([","export const UNNAMED_CODES = Object.freeze(['E999', ");
  failed('grown/unnamed-code',await guard(derive({'audit/lib/source-consistency.mjs':grownCodes})),'auditChangeIssues',/the audit change unnamed-code:E999 is not recorded/);
  const waits=(from,to)=>replaced('audit/lib/audit-code.mjs',"  'audit/browser/cases/browser-condition.cjs': "+from+",","  'audit/browser/cases/browser-condition.cjs': "+to+",");
  const raised=await guard(derive({'audit/lib/audit-code.mjs':waits(2,4)}));
  failed('grown/raised-count',raised,'auditChangeIssues',/the audit change wait-allowance:audit\/browser\/cases\/browser-condition\.cjs#3 is not recorded/);
  assert.deepEqual(raised.grown,{'wait-allowance':['audit/browser/cases/browser-condition.cjs#3','audit/browser/cases/browser-condition.cjs#4']},'the units a raised count adds');
  const asChange=await guard(derive({'audit/lib/source-consistency.mjs':grownCodes,...record('unnamed-code:E999')}));
  failed('record/grown-among-changes',asChange,'auditChangeIssues',/the audit change unnamed-code:E999 is not recorded/);
  assert.ok(asChange.auditChangeIssues.some(issue=>/records unnamed-code:E999, but this change does not make it/.test(issue)),'the entry among the changes matches nothing');
  failed('record/allowance-not-grown',await guard(derive(allowance('unnamed-code:E999'))),'auditChangeIssues',/records the allowance unnamed-code:E999, but this change does not grow it/);
  const wrongAllowances={[auditChangesFile]:JSON.stringify({schema:auditChangesSchema,changes:[],allowances:{}})+'\n'};
  failed('record/allowances-wrong-shape',await guard(derive({'audit/lib/source-consistency.mjs':grownCodes,...wrongAllowances})),'errors',/has the wrong shape/);
  const recordedCode=await guard(derive({'audit/lib/source-consistency.mjs':grownCodes,...allowance('unnamed-code:E999')}));
  accepted('record/approves-grown-allowance',recordedCode);
  assert.ok(formatGuardReport(recordedCode).includes('- a new unnamed-code entry E999: an audit change made for this guard case'),'the reason is listed for the owner');
  const lowered=await guard(derive({'audit/lib/audit-code.mjs':waits(2,1)}));accepted('control/allowance-lowered',lowered);assert.deepEqual(lowered.grown,{},'a lowered count');

  // The record of audit changes: a removal recorded with a reason passes and the report gives the reason; a record of
  // another change leaves the removal failing and fails itself; an entry kept from the base covers nothing; a record
  // without a reason, or of another shape, fails.
  const recordedRemoval=await guard(derive({...withoutStepChange,...record('gate-step:dom-regression')}));
  accepted('record/approves-removal',recordedRemoval,{'gate-step':['dom-regression']});
  assert.ok(formatGuardReport(recordedRemoval).includes('- removed gate-step dom-regression: an audit change made for this guard case'),'the reason is listed for the owner');
  const other=await guard(derive({...withoutStepChange,...record('gate-step:another-step')}));
  removal('record/other-change-only',other,{'gate-step':['dom-regression']});assert.ok(other.auditChangeIssues.some(m=>/records gate-step:another-step, but this change does not make it/.test(m)),JSON.stringify(other.auditChangeIssues));
  const recordAtBase=derive(record('gate-step:dom-regression'));
  removal('record/kept-from-base',await guard(derive({...withoutStepChange,...record('gate-step:dom-regression')},recordAtBase),{from:recordAtBase}),{'gate-step':['dom-regression']});
  failed('record/without-reason',await guard(derive({...withoutStepChange,[auditChangesFile]:JSON.stringify({schema:auditChangesSchema,changes:[{change:'gate-step:dom-regression',reason:'ok'}]})})),'errors',/each entry names a change and a reason/);
  failed('record/wrong-shape',await guard(derive({...withoutStepChange,[auditChangesFile]:JSON.stringify({changes:[]})})),'errors',/has the wrong shape/);
  // A removal recorded in a change that also changes src/ fails: a change that checks less is made in a change of the
  // audit alone. A pin changed with the product (a product test added re-pins the IDs) is recorded with it and passes.
  const productRelease=release(nextPatch(version),{changeSource:true,productBytes:text(product)+'\n'});
  const lessWithProduct=await guard(derive({...productRelease,...withoutStepChange,...record('gate-step:dom-regression')}));
  assert.deepEqual([lessWithProduct.errors,lessWithProduct.versionIssues,lessWithProduct.releaseIssues],[[],[],[]],'it fails only for the record');
  failed('record/less-only-in-audit-change',lessWithProduct,'auditChangeIssues',/gate-step:dom-regression checks less, and this change also changes src\/, extensions\/ or the product: record it in a change of the audit alone/);
  accepted('record/pin-with-product-change',await guard(derive({...productRelease,'audit/manifests/product-tests.json':json('audit/manifests/product-tests.json',m=>m.fixedIdSha256='e'.repeat(64)),...record('pin:'+products.fixedIdSha256)})),{pin:[products.fixedIdSha256]});

  failed('version/source-changed-without-bump',await guard(derive(sourceChange)),'versionIssues',new RegExp('must be '+nextPatch(version).replaceAll('.','\\.')));
  failed('version/product-changed-without-bump',await guard(derive({[product]:text(product)+'\n'})),'versionIssues',/must be/);
  accepted('version/patch-bump-accepted',await guard(derive(release(nextPatch(version),{changeSource:true,productBytes:text(product)+'\n'}))));
  const skipped=derive(release(nextPatch(nextPatch(version)),{changeSource:true,productBytes:text(product)+'\n'}));
  const raisedTo=next=>'version:'+next;
  failed('version/patch-skipped',await guard(skipped),'auditChangeIssues',/version:/);
  accepted('version/patch-skipped-recorded',await guard(derive({...release(nextPatch(nextPatch(version)),{changeSource:true,productBytes:text(product)+'\n'}),...record(raisedTo(nextPatch(nextPatch(version))))})));
  const [major,minor]=version.split('.').map(Number),minorBump=derive(release(major+'.'+(minor+1)+'.0',{changeSource:true,productBytes:text(product)+'\n'}));
  failed('version/minor-bump',await guard(minorBump),'auditChangeIssues',/version:/);
  accepted('version/minor-bump-recorded',await guard(derive({...release(major+'.'+(minor+1)+'.0',{changeSource:true,productBytes:text(product)+'\n'}),...record(raisedTo(major+'.'+(minor+1)+'.0'))})));
  accepted('version/major-bump-recorded',await guard(derive({...release((major+1)+'.0.0',{changeSource:true,productBytes:text(product)+'\n'}),...record(raisedTo((major+1)+'.0.0'))})));
  failed('version/lower-recorded',await guard(derive({...release(major+'.'+minor+'.0',{changeSource:true,productBytes:text(product)+'\n'}),...record(raisedTo(major+'.'+minor+'.0'))})),'versionIssues',/must be/);
  failed('version/bump-without-product-change',await guard(derive(release(nextPatch(version)))),'versionIssues',/must stay/);
  failed('version/record-does-not-excuse',await guard(derive({...sourceChange,...record(raisedTo(version))})),'versionIssues',/must be/);

  failed('release/two-manifests',await guard(derive({'audit/manifests/release-0.0.1.json':text(currentReleaseFile())})),'releaseIssues',/exactly one release manifest/);
  failed('release/wrong-name',await guard(derive({[currentReleaseFile()]:null,'audit/manifests/release-9.9.9.json':text(currentReleaseFile())})),'releaseIssues',/exactly one release manifest/);
  failed('release/missing',await guard(derive({[currentReleaseFile()]:null})),'releaseIssues',/found none/);

  failed('identity/head-evaluation-failure',await guard(derive({'audit/lib/gate-contract.mjs':text('audit/lib/gate-contract.mjs')+'\nexport const broken = ;\n'})),'errors',/./);
  const unrelated=commitFiles(new Map([...baseFiles,['AUDIT.md',blob(documentation['AUDIT.md'])]]),[]);
  failed('identity/no-merge-base',await guard(docHead,{from:unrelated}),'errors',/no merge base/);
  const tableChanged=derive({[product]:replaced(product,'const SENTENCE_TE_FORMS = Object.freeze([',"const SENTENCE_TE_FORMS = Object.freeze([['未知て','未知る'],")});
  failed('language/reader-table-changed',await guard(tableChanged),'errors',/reader tables changed/);
  failed('language/verbs-changed',await guard(derive({[product]:replaced(product,"const verbs={MotionCommand:['動く'","const verbs={MotionCommand:['別の動詞'")})),'errors',/reader tables changed/);
  failed('language/reader-change-recorded',await guard(derive({[product]:replaced(product,'const SENTENCE_TE_FORMS = Object.freeze([',"const SENTENCE_TE_FORMS = Object.freeze([['未知て','未知る'],"),...record('reader-tables')})),'errors',/reader tables changed/);
  failed('language/candidate-not-base-canonical',await guard(derive({'audit/fixtures/assist/code-assist-cases.json':json('audit/fixtures/assist/code-assist-cases.json',data=>{data.cases[0].expect.first.text='存在しない書き方。';})})),'errors',/not a base canonical sentence/);
  }
  if(mine.has('behaviour/unrecorded-change')){
  // Behaviour against the base product (AUDIT.md「前の版との振る舞いの差分」): a check message the 名人 worlds show, worded
  // otherwise, changes those worlds; unrecorded it fails, recorded with a reason it passes with the reason listed, and a
  // record without a change fails.
  const message='かを 書きます。れい：${part}の${messageExpression(n)}`;';
  const reworded=replaced(product,message,message.replace('書きます','書いてね'));
  const unrecorded=await guard(derive(release(nextPatch(version),{changeSource:true,productBytes:reworded})));
  failed('behaviour/unrecorded-change',unrecorded,'behaviourIssues',/changed, and audit\/manifests\/intended-behaviour-changes\.json does not record it/);
  const changedCases=unrecorded.behaviour.differences;assert.ok(changedCases.length>0,'the turn changes at least one world');
  const recordedHead=derive({...release(nextPatch(version),{changeSource:true,productBytes:reworded}),...intended(changedCases)});
  const recorded=await guard(recordedHead);
  assert.deepEqual([recorded.status,recorded.behaviourIssues,recorded.behaviour.intended.map(c=>c.case)],['PASS',[],changedCases],'a recorded change passes: '+JSON.stringify(recorded.errors));
  assert.ok(formatGuardReport(recorded).includes('- changed behaviour of '+changedCases[0]+': '),'the recorded change is listed for the owner');pass('behaviour/recorded-change-listed');
  // A product whose worlds never finish stops the guard at its limit with an error, instead of holding the job.
  const endless=replaced(product,"const turn = num(0) * (n.op === 'TURN_RIGHT' ? -1 : 1);","for (;;) {} const turn = 0;");
  failed('limits/worlds-never-finish',await guard(derive(release(nextPatch(version),{changeSource:true,productBytes:endless})),{limitMs:20000}),'errors',/the specification worlds did not finish within 20 s/);
  }
  if(mine.has('assertions/fewer-checks-needs-record')){
  // A file that checks less is an audit change to record: one assertion fewer in static-contract.
  const weakenedHead=derive({'audit/tests/static-contract.mjs':replaced('audit/tests/static-contract.mjs',"assert.ok(!publicationPathAllowed('AGENTS.md'));assert.ok(!publicationPathAllowed('audit/AGENTS.md'));","assert.ok(!publicationPathAllowed('AGENTS.md'));")});
  const weakened=await guard(weakenedHead);
  assert.equal(weakened.status,'FAIL','fewer checks without a record');assert.ok(weakened.weakened.some(w=>w.startsWith('audit/tests/static-contract.mjs: ')),JSON.stringify(weakened.weakened));
  const weakenedRecorded=await guard(derive({'audit/tests/static-contract.mjs':replaced('audit/tests/static-contract.mjs',"assert.ok(!publicationPathAllowed('AGENTS.md'));assert.ok(!publicationPathAllowed('audit/AGENTS.md'));","assert.ok(!publicationPathAllowed('AGENTS.md'));"),...record('fewer-checks:audit/tests/static-contract.mjs')}));
  assert.equal(weakenedRecorded.status,'PASS','a recorded file with fewer checks passes');pass('assertions/fewer-checks-needs-record');
  // Spacing alone changes no line: a line of the extension host the product embeds, indented further, changes the
  // product and no line of it, and the guard passes it.
  {
    const extOpening='function createAkariExtensionHost(options) {\n',spacedText=productText.replace(extOpening,()=>'    '+extOpening);
    assert.notEqual(spacedText,productText,'the indented line');
    const spaced=await guard(derive(release(nextPatch(version),{productBytes:spacedText})));
    assert.deepEqual([spaced.status,changedScriptLines(productText,spacedText)],['PASS',[]],'spacing is no changed line: '+JSON.stringify(spaced.errors));
    pass('coverage/spacing-only-no-changed-line');
  }
  // A change of the sources that leaves the product as it was passes, and the guard builds nothing: the head's template
  // holds a directive no build accepts.
  {
    const unbuilt={'src/akari.html':templateText+'<!-- @include  unbuildable -->\n'};
    const same=await guard(derive({...release(nextPatch(version),{productBytes:productText}),...unbuilt}));
    assert.deepEqual([same.status,same.errors],['PASS',[]],'the product as it was: '+JSON.stringify(same.errors));
    pass('coverage/source-only-unbuilt');
  }
  // Changed lines are read by their tokens (changedScriptLines): a space taken out of a string changes its line, and the
  // lines after an added line that starts with ++ keep their numbers.
  const lineOf=(text,anchor)=>text.slice(0,text.indexOf(anchor)).split('\n').length;
  {
    const spaceLine="    void (' ' + 1);\n",withSpace=productLine(runFn,spaceLine),spaceAt=lineOf(withSpace,spaceLine);
    assert.deepEqual(changedScriptLines(withSpace,withSpace.replace(spaceLine,"    void ('' + 1);\n")),[[spaceAt,"    void ('' + 1);"]],'a space taken out of a string');
    const counted=productLine(runFn,'++ zz;\nzz = zz + 1;\n'),at=lineOf(counted,runFn)+1;
    assert.deepEqual(changedScriptLines(productText,counted),[[at,'++ zz;'],[at+1,'zz = zz + 1;']],'the lines after a line that starts with ++');
    pass('coverage/spacing-in-a-string-changes-a-line');
  }
  // A function moved as it is to another place of the same scope changes no line but its closing brace (a line many
  // lines read the same as); the guard passes it and no world behaves otherwise.
  {
    const from=productText.indexOf('  function isConditionValue(v) {\n'),to=productText.indexOf('\n  }\n',from)+5,fn=productText.slice(from,to);
    assert.ok(from>0&&to>from,'the moved function');
    const parseStart='  function parseSyntax(source, context = {}) {\n',cut=productText.slice(0,from)+productText.slice(to);
    const moved=cut.replace(parseStart,()=>fn+parseStart);
    assert.deepEqual(changedScriptLines(productText,moved).map(([,text])=>text),['  }'],'only the closing brace is a changed line');
    const judged=await guard(derive(release(nextPatch(version),{productBytes:moved})));
    assert.deepEqual([judged.status,judged.behaviour.differences],['PASS',[]],'moved as it is');
    pass('coverage/moved-line-unchanged');
  }
  // A common line taken out in one place and put in another is a changed line: of two lines that read the same in the
  // base, one moved is a changed line.
  {
    const parseStart='  function parseSyntax(source, context = {}) {\n',twice=productLine(runFn,noOpLine).replace(parseStart,()=>parseStart+noOpLine);
    const worldsLine="      const sprites = project.components.filter(c => c.type === 'sprite'), arg = n.arg;";
    const movedOne=twice.replace(runFn+noOpLine,()=>runFn).replace(worldsLine,()=>'    void (1 + 1);\n'+worldsLine);
    assert.deepEqual(changedScriptLines(twice,movedOne),[[lineOf(movedOne,worldsLine)-1,'    void (1 + 1);']],'the moved common line');
    pass('coverage/common-line-not-moved');
  }
  }
  // The guard's own process loads only guard code (guardCodePaths, which the workflow takes from the base): a fixture or
  // another file of the tree that it loaded would run the change's code there, where it could rewrite the verdict.
  if(mine.has('confined/guard-loads-only-guard-code')){
    const record='const seen=[];(await import("node:module")).registerHooks({load(url,context,next){seen.push(url);return next(url,context);}});'+
      'try{await import('+JSON.stringify(pathToFileURL(path.resolve('audit/tests/change-guard.mjs')).href)+');}catch{}console.log(JSON.stringify(seen));';
    const args=['--input-type=module','-e',record],r=cp.spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:16*1024*1024});
    assert.equal(r.status,0,r.stderr);
    const loaded=JSON.parse(r.stdout.trim().split('\n').at(-1)).filter(url=>url.startsWith('file:')).map(url=>path.relative(path.resolve('.'),fileURLToPath(url)).split(path.sep).join('/')).filter(file=>!file.startsWith('..')&&!file.includes('node_modules/'));
    assert.ok(loaded.includes('audit/lib/change-guard.mjs')&&loaded.includes('audit/lib/language-suite.mjs'),'the guard and its imports are loaded: '+loaded.join(', '));
    assert.deepEqual(loaded.filter(file=>!guardCodePaths.some(p=>file===p||file.startsWith(p+'/'))),[],'files outside the guard code that the guard loads');
    pass('confined/guard-loads-only-guard-code');
  }
  // A product run by the guard writes no file but its own record: from inside the vm it reaches the host's process (as
  // the in-process load shows), but the worlds and the coverage run are children that may not write.
  if(mine.has('confined/product-writes-nothing')){
    const mark=path.join(tmp,'written-by-product'),script='try{console.log.constructor("return process")().getBuiltinModule("fs").writeFileSync('+JSON.stringify(mark)+',"x");}catch{}';
    const page='<script>'+script+'</script>',written=()=>{const was=fs.existsSync(mark);fs.rmSync(mark,{force:true});return was;};
    productApi(page);assert.ok(written(),'the escape writes from an unconfined process');
    boundedSnapshot(page,60000);assert.equal(written(),false,'the worlds');
    try{boundedCoverage(page,product,60000);}catch{}assert.equal(written(),false,'the coverage run');
    // (and the tree's own contracts, which the guard reads in a child too: a gate contract that writes when it is loaded, and leaves a timer)
    const tree=path.join(tmp,'contracts');fs.mkdirSync(path.join(tree,'audit/lib'),{recursive:true});
    fs.writeFileSync(path.join(tree,'audit/lib/gate-contract.mjs'),'import fs from "node:fs";\ntry{fs.writeFileSync('+JSON.stringify(mark)+',"x");}catch{}\nsetInterval(()=>{},1000);\nexport const integrityControlIds=["x"];\n');
    const answer=path.join(tmp,'identity.json');runLimited([path.resolve('audit/lib/change-guard.mjs'),'--identity',tree,answer],60000,'the contracts',[answer]);
    assert.equal(written(),false,'the contracts');assert.deepEqual(JSON.parse(fs.readFileSync(answer,'utf8')).sets['integrity-control'],['x']);
    pass('confined/product-writes-nothing');
  }
  if(mine.has('test-map/names-the-suites')){
  // The map from src files to what runs them names the suite that runs the formatter.
  {
    const {testMap}=await import('../test-map.mjs');
    const map=await testMap(['src/ts/06-source-formatting.ts'],{suites:['runSyntaxTests','runColorPickerTests'],worlds:[]});
    assert.ok(map.suites.includes('runSyntaxTests'),'the syntax suite formats code');pass('test-map/names-the-suites');
  }
  failed('behaviour/record-without-change',await guard(derive({...release(nextPatch(version),{changeSource:true,productBytes:text(product)+'\n'}),...intended(['common/CC-001'])})),'behaviourIssues',/records a change of common\/CC-001, but its behaviour did not change/);
  }
} finally {
  fs.rmSync(tmp,{recursive:true,force:true});
}
assert.deepEqual(results.map(row=>row.id).sort(),[...mine].sort(),'the run records exactly the cases of its part');
writeCaseReport(output,'change-guard-negative',results,part?{part:{name:'change-guard-negative',part}}:{});
console.log('Change guard: '+results.length+' synthetic base/head cases PASS');
