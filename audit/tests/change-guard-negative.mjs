// Gate step: every change-guard rule against synthetic base/head commits built from the
// candidate checkout in an isolated git repository, plus accepted controls.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {changeGuard,treeIdentity,git,nextPatch} from '../lib/change-guard.mjs';
import {gateSteps,integrityControlIds,acceptanceCommands,acceptanceIds,workflowContract,changeGuardLabel} from '../lib/gate-contract.mjs';
import {declaredGateCases,caseRecorder,writeCaseReport} from '../lib/gate-case-contract.mjs';
import {expectedLanguageIds} from '../lib/verify-language-results.mjs';
import {currentProductFile,currentProductVersion,currentReleaseFile} from '../lib/product-path.cjs';
const [output]=process.argv.slice(2);assert.ok(output,'usage: change-guard-negative.mjs <result.json>');
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
  // The base commit mirrors the candidate checkout: audit/, src/, the product and AUDIT.md.
  const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):e.isFile()?[dir+'/'+e.name]:[]);
  const files=[...walk('audit'),...walk('src'),currentProductFile(),'AUDIT.md'];
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
  const event=(name,payload)=>{const file=path.join(tmp,name);fs.writeFileSync(file,typeof payload==='string'?payload:JSON.stringify(payload));return file;};
  const approved=event('approved.json',{pull_request:{number:1,labels:[{name:'documentation'},{name:changeGuardLabel}]}});
  const otherLabel=event('other-label.json',{pull_request:{number:1,labels:[{name:'documentation'}]}});
  const withoutLabels=event('without-labels.json',{pull_request:{number:1}});
  const unreadable=event('unreadable.json','{"pull_request":');
  const guard=(head,{from=base,eventPath}={})=>changeGuard({repo,base:from,head,eventPath,workDir:trees});
  const accepted=(id,report,removed={})=>{
    assert.equal(report.status,'PASS',id+': '+JSON.stringify(report));assert.deepEqual(report.removed,removed,id+' removed');pass(id);
  };
  const removal=(id,report,removed)=>{
    assert.deepEqual(report.removed,removed,id+' removed');assert.equal(report.approved,false,id);
    assert.deepEqual([report.errors,report.versionIssues,report.releaseIssues],[[],[],[]],id+' fails only for the removal');
    assert.equal(report.status,'FAIL',id);pass(id);
  };
  const failed=(id,report,field,pattern)=>{
    assert.equal(report.status,'FAIL',id);assert.ok(report[field].some(m=>pattern.test(m)),id+': '+JSON.stringify(report[field]));pass(id);
  };

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
  accepted('control/documentation-only',await guard(docHead));
  const addedStep=replaced('audit/lib/gate-contract.mjs',"  ['static',","  ['added-check','audit/tests/added-check.mjs'],\n  ['static',");
  accepted('control/additions-only',await guard(derive({'audit/lib/gate-contract.mjs':addedStep,
    'audit/manifests/product-tests.json':json('audit/manifests/product-tests.json',m=>m.suites.find(s=>s.name==='runExtendedTests').ids.push('ADDED-CHECK')),
    'audit/fixtures/added-pin.json':JSON.stringify({sha256:'d'.repeat(64)})})));
  accepted('control/pin-moved',await guard(derive({'audit/fixtures/basic-intents.json':null,'audit/fixtures/basic-intents-moved.json':text('audit/fixtures/basic-intents.json')})));
  // The base branch gained a step after the head branched: that is not a removal by the head.
  const advanced=await guard(docHead,{from:derive({'audit/lib/gate-contract.mjs':addedStep})});
  assert.equal(advanced.mergeBase,base);accepted('control/base-advanced-after-branch',advanced);

  const withoutStep=derive({'audit/lib/gate-contract.mjs':replaced('audit/lib/gate-contract.mjs',"  ['dom-regression','audit/tests/dom-render-regression.cjs',file('dom-regression')],\n",'')});
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
  const editingEntry='akari-acceptance.yml/ux-editing/node audit/run-acceptance.mjs editing';
  removal('removed/workflow-job',await guard(derive({'audit/lib/gate-contract.mjs':replaced('audit/lib/gate-contract.mjs',"'ux-editing':{if:sameRepository","'ux-edit':{if:sameRepository")})),
    {'workflow-job':['akari-acceptance.yml/ux-editing'],'workflow-entry':[editingEntry]});
  removal('removed/workflow-entry',await guard(derive({'audit/lib/gate-contract.mjs':replaced('audit/lib/gate-contract.mjs',"{run:'node audit/run-acceptance.mjs editing'}","{run:'node audit/run-acceptance.mjs editing --quick'}")})),
    {'workflow-entry':[editingEntry]});
  const changedPin=await guard(derive({'audit/manifests/product-tests.json':json('audit/manifests/product-tests.json',m=>m.fixedIdSha256='e'.repeat(64))}));
  assert.deepEqual(changedPin.pinFiles,{[products.fixedIdSha256]:['audit/manifests/product-tests.json']});
  removal('pin/changed',changedPin,{pin:[products.fixedIdSha256]});
  const startMain=JSON.parse(text('audit/fixtures/child-ux-plan.json')).startMain;assert.match(startMain,/^[0-9a-f]{40}$/);
  removal('pin/removed',await guard(derive({'audit/fixtures/child-ux-plan.json':replaced('audit/fixtures/child-ux-plan.json',startMain,'')})),{pin:[startMain]});

  const approvedRemoval=await guard(withoutStep,{eventPath:approved});
  assert.equal(approvedRemoval.approved,true);accepted('label/approves-removal',approvedRemoval,{'gate-step':['dom-regression']});
  const other=await guard(withoutStep,{eventPath:otherLabel});
  assert.deepEqual(other.labels,['documentation']);removal('label/other-label-only',other,{'gate-step':['dom-regression']});
  failed('label/missing-event',await guard(docHead,{eventPath:path.join(tmp,'missing-event.json')}),'errors',/event payload unreadable/);
  failed('label/payload-without-labels',await guard(docHead,{eventPath:withoutLabels}),'errors',/no label list/);
  failed('label/unreadable-payload',await guard(docHead,{eventPath:unreadable}),'errors',/event payload unreadable/);

  const version=currentProductVersion(),product=currentProductFile(),sourceChange={'src/akari.html':text('src/akari.html')+'\n<!-- changed -->\n'};
  function release(next,{changeSource=false,productBytes=text(product)}={}){
    const file='Akari_'+next.replaceAll('.','_')+'.html';
    return {'audit/public-files.json':json('audit/public-files.json',m=>{m.productVersion=next;m.productFile=file;m.files=m.files.map(f=>f===product?file:f);}),
      [product]:null,[file]:productBytes,[currentReleaseFile()]:null,['audit/manifests/release-'+next+'.json']:text(currentReleaseFile()),...(changeSource?sourceChange:{})};
  }
  failed('version/source-changed-without-bump',await guard(derive(sourceChange)),'versionIssues',new RegExp('must be '+nextPatch(version).replaceAll('.','\\.')));
  failed('version/product-changed-without-bump',await guard(derive({[product]:text(product)+'\n'})),'versionIssues',/must be/);
  accepted('version/patch-bump-accepted',await guard(derive(release(nextPatch(version),{changeSource:true,productBytes:text(product)+'\n'}))));
  failed('version/patch-skipped',await guard(derive(release(nextPatch(nextPatch(version)),{changeSource:true,productBytes:text(product)+'\n'}))),'versionIssues',/must be/);
  const [major,minor]=version.split('.').map(Number);
  failed('version/minor-bump',await guard(derive(release(major+'.'+(minor+1)+'.0',{changeSource:true,productBytes:text(product)+'\n'}))),'versionIssues',/must be/);
  failed('version/bump-without-product-change',await guard(derive(release(nextPatch(version)))),'versionIssues',/must stay/);
  failed('version/label-does-not-excuse',await guard(derive(sourceChange),{eventPath:approved}),'versionIssues',/must be/);

  failed('release/two-manifests',await guard(derive({'audit/manifests/release-0.0.1.json':text(currentReleaseFile())})),'releaseIssues',/exactly one release manifest/);
  failed('release/wrong-name',await guard(derive({[currentReleaseFile()]:null,'audit/manifests/release-9.9.9.json':text(currentReleaseFile())})),'releaseIssues',/exactly one release manifest/);
  failed('release/missing',await guard(derive({[currentReleaseFile()]:null})),'releaseIssues',/found none/);

  failed('identity/head-evaluation-failure',await guard(derive({'audit/lib/gate-contract.mjs':text('audit/lib/gate-contract.mjs')+'\nexport const broken = ;\n'})),'errors',/./);
  const unrelated=commitFiles(new Map([...baseFiles,['AUDIT.md',blob(documentation['AUDIT.md'])]]),[]);
  failed('identity/no-merge-base',await guard(docHead,{from:unrelated}),'errors',/no merge base/);
} finally {
  fs.rmSync(tmp,{recursive:true,force:true});
}
writeCaseReport(output,'change-guard-negative',results);
console.log('Change guard: '+results.length+' synthetic base/head cases PASS');
