// Pull-request change guard. Compares the audit identity of the merge base with the head:
// removed check IDs and changed pins need the owner label; the product version and the
// release manifest rules hold with or without it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {changeGuardLabel} from './gate-contract.mjs';

export const guardReportSchema='akari-change-guard-v1';
export const identityCategories=Object.freeze(['gate-step','gate-case','integrity-control','acceptance-suite','browser-group','browser-task','browser-case','product-suite','product-test','language-test','workflow-job','workflow-entry','pin']);
const releasePattern=/^audit\/manifests\/release-[^/]*\.json$/;
const pinPattern=/(?<![0-9A-Za-z])(?:[0-9a-f]{64}|[0-9a-f]{40})(?![0-9A-Za-z])/g;

export function git(repo,args,input){
  return cp.execFileSync('git',['-C',repo,...args],{input,maxBuffer:512*1024*1024,stdio:['pipe','pipe','pipe']});
}
const gitText=(repo,args)=>git(repo,args).toString('utf8').trim();
function optionalObject(repo,spec){
  try{return gitText(repo,['rev-parse','--verify','--quiet',spec]);}catch{return null;}
}
export function treeEntries(repo,commit,prefix){
  return git(repo,['ls-tree','-r','-z','--full-tree',commit,'--',prefix]).toString('utf8').split('\0').filter(Boolean).map(line=>{
    const tab=line.indexOf('\t'),[mode,type,oid]=line.slice(0,tab).split(' ');return {mode,type,oid,path:line.slice(tab+1)};
  });
}
export function readBlobs(repo,oids){
  const unique=[...new Set(oids)],blobs=new Map();
  if(!unique.length)return blobs;
  const out=git(repo,['cat-file','--batch'],unique.join('\n')+'\n');let at=0;
  for(const oid of unique){
    const newline=out.indexOf(10,at),[got,type,size]=out.subarray(at,newline).toString('utf8').split(' ');
    assert.equal(got,oid,'object order');assert.equal(type,'blob','object '+oid+' is not a readable blob');
    const start=newline+1,end=start+Number(size);blobs.set(oid,out.subarray(start,end));at=end+1;
  }
  return blobs;
}

// Writes the audit/ tree of a commit once per tree object; identical trees share one copy.
function materialize(repo,commit,workDir){
  const auditTree=optionalObject(repo,commit+':audit');
  assert.ok(auditTree,'commit '+commit+' has no audit directory');
  const dir=path.join(workDir,auditTree.slice(0,16));
  const entries=treeEntries(repo,commit,'audit').filter(e=>e.type==='blob');
  const blobs=readBlobs(repo,entries.map(e=>e.oid));
  if(!fs.existsSync(dir)){
    const partial=dir+'.partial';fs.rmSync(partial,{recursive:true,force:true});
    for(const e of entries){
      assert.ok(e.mode!=='120000','symbolic link in the audit tree: '+e.path);
      const file=path.join(partial,...e.path.split('/'));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,blobs.get(e.oid));
    }
    fs.renameSync(partial,dir);
  }
  return {dir,entries,blobs};
}

// Runs the tree's own contracts in a copy of its audit/ directory. A missing module or
// manifest contributes no IDs; a module that fails to load makes the identity unavailable.
export async function treeIdentity(repo,commit,workDir){
  const {dir,entries,blobs}=materialize(repo,commit,workDir);
  const load=async rel=>fs.existsSync(path.join(dir,rel))?import(pathToFileURL(path.join(dir,rel)).href):null;
  const json=rel=>fs.existsSync(path.join(dir,rel))?JSON.parse(fs.readFileSync(path.join(dir,rel),'utf8')):null;
  const gate=await load('audit/lib/gate-contract.mjs'),cases=await load('audit/lib/gate-case-contract.mjs'),language=await load('audit/lib/verify-language-results.mjs');
  const products=json('audit/manifests/product-tests.json'),browser=json('audit/browser/browser-audit-manifest.json'),browserResults=json('audit/manifests/browser-results.json'),languageManifest=json('audit/manifests/language-form-coverage.json');
  const workflows=Object.entries(gate?.workflowContract||{});
  const sets={
    'gate-step':gate?.gateSteps?gate.gateSteps('',dir).map(step=>step[0]):[],
    'gate-case':cases?.declaredGateCases&&products?cases.declaredGateCases(products):[],
    'integrity-control':gate?.integrityControlIds||[],
    'acceptance-suite':gate?.acceptanceCommands&&gate.acceptanceIds?Object.keys(gate.acceptanceCommands).flatMap(kind=>gate.acceptanceIds(kind).map(id=>kind+'/'+id)):[],
    'browser-group':browser?Object.keys(browser.groups):[],
    'browser-task':browser?Object.entries(browser.groups).flatMap(([group,tasks])=>tasks.map(task=>group+'/'+task)):[],
    'browser-case':browserResults?browserResults.entries.flatMap(e=>e.keys.map(key=>e.group+'/'+e.task+'/'+key)):[],
    'product-suite':products?products.suites.map(suite=>suite.name):[],
    'product-test':products?products.suites.flatMap(suite=>suite.ids.map(id=>suite.name+'/'+id)):[],
    'language-test':language?.expectedLanguageIds&&languageManifest?language.expectedLanguageIds(languageManifest):[],
    'workflow-job':workflows.flatMap(([file,w])=>Object.keys(w.jobs).map(job=>file+'/'+job)),
    'workflow-entry':workflows.flatMap(([file,w])=>Object.entries(w.jobs).flatMap(([job,j])=>j.entries.map(entry=>file+'/'+job+'/'+entry.run))),
  };
  // Pins: every standalone SHA-1/SHA-256 hex value in the audit tree except the release record.
  const pins=new Map();
  for(const e of entries){
    if(releasePattern.test(e.path))continue;
    const bytes=blobs.get(e.oid);if(bytes.includes(0))continue;
    for(const [value] of bytes.toString('utf8').matchAll(pinPattern))pins.set(value,[...new Set([...(pins.get(value)||[]),e.path])]);
  }
  sets.pin=[...pins.keys()];
  const meta=json('audit/public-files.json');
  assert.ok(meta&&/^\d+\.\d+\.\d+$/.test(meta.productVersion),'commit '+commit+' has no product version');
  assert.equal(meta.productFile,'Akari_'+meta.productVersion.replaceAll('.','_')+'.html','commit '+commit+' product file name');
  const product=optionalObject(repo,commit+':'+meta.productFile);assert.ok(product,'commit '+commit+' lacks '+meta.productFile);
  return {commit,sets,pins,version:meta.productVersion,productFile:meta.productFile,product,source:optionalObject(repo,commit+':src'),
    releases:entries.map(e=>e.path).filter(p=>releasePattern.test(p)).sort()};
}

// GITHUB_EVENT_PATH: unset means a local run without labels; a set but unreadable payload fails closed.
export function readApproval(eventPath){
  if(!eventPath)return {approved:false,labels:[],source:'no event payload'};
  let event;
  try{event=JSON.parse(fs.readFileSync(eventPath,'utf8'));}catch(error){throw new Error('pull request event payload unreadable: '+error.message);}
  const labels=event?.pull_request?.labels;
  if(!Array.isArray(labels)||labels.some(label=>typeof label?.name!=='string'))throw new Error('pull request event payload has no label list');
  const names=labels.map(label=>label.name);
  return {approved:names.includes(changeGuardLabel),labels:names,source:'event payload'};
}
export function nextPatch(version){const [major,minor,patch]=version.split('.').map(Number);return major+'.'+minor+'.'+(patch+1);}

export async function changeGuard({repo,base,head,eventPath,workDir}){
  const report={schema:guardReportSchema,status:'FAIL',base,head,mergeBase:null,approvalLabel:changeGuardLabel,approved:false,labels:[],
    identitySizes:null,removed:{},pinFiles:{},version:null,versionIssues:[],releaseIssues:[],errors:[]};
  const ownDir=!workDir;workDir??=fs.mkdtempSync(path.join(os.tmpdir(),'akari-guard-'));
  try{
    const approval=readApproval(eventPath);Object.assign(report,{approved:approval.approved,labels:approval.labels});
    const baseCommit=gitText(repo,['rev-parse','--verify',base+'^{commit}']),headCommit=gitText(repo,['rev-parse','--verify',head+'^{commit}']);
    let mergeBase;
    try{mergeBase=gitText(repo,['merge-base',baseCommit,headCommit]);}catch{throw new Error('no merge base between '+baseCommit+' and '+headCommit);}
    Object.assign(report,{base:baseCommit,head:headCommit,mergeBase});
    const before=await treeIdentity(repo,mergeBase,workDir),after=await treeIdentity(repo,headCommit,workDir);
    report.identitySizes={};
    for(const category of identityCategories){
      const kept=new Set(after.sets[category]),removed=[...new Set(before.sets[category])].filter(id=>!kept.has(id));
      report.identitySizes[category]={base:new Set(before.sets[category]).size,head:kept.size};
      if(removed.length)report.removed[category]=removed;
    }
    for(const value of report.removed.pin||[])report.pinFiles[value]=before.pins.get(value);
    const productChanged=before.source!==after.source||before.product!==after.product;
    const expected=productChanged?nextPatch(before.version):before.version;
    report.version={base:before.version,head:after.version,expected,productChanged};
    if(after.version!==expected)report.versionIssues.push(productChanged
      ?'the product or src/ changed: the head product version must be '+expected+' (one patch after '+before.version+'), found '+after.version
      :'the product and src/ are unchanged: the product version must stay '+before.version+', found '+after.version);
    const release='audit/manifests/release-'+after.version+'.json';
    if(JSON.stringify(after.releases)!==JSON.stringify([release]))report.releaseIssues.push('exactly one release manifest, '+release+', must exist; found '+(after.releases.join(', ')||'none'));
  }catch(error){report.errors.push(error.message);}
  finally{if(ownDir)fs.rmSync(workDir,{recursive:true,force:true});}
  const removals=Object.keys(report.removed).length>0;
  report.status=!report.errors.length&&!report.versionIssues.length&&!report.releaseIssues.length&&(!removals||report.approved)?'PASS':'FAIL';
  return report;
}

export function formatGuardReport(report){
  const lines=['### Audit change guard: '+report.status,'','Merge base `'+report.mergeBase+'` → head `'+report.head+'`'];
  if(report.version)lines.push('Product version: '+report.version.base+' → '+report.version.head+(report.version.productChanged?' (product or src/ changed)':' (product and src/ unchanged)'));
  for(const message of [...report.errors,...report.versionIssues,...report.releaseIssues])lines.push('- '+message);
  const removed=Object.entries(report.removed);
  if(removed.length){
    lines.push('',(report.approved?'Approved by the `'+report.approvalLabel+'` label':'Needs the `'+report.approvalLabel+'` label set by the owner')+':');
    for(const [category,ids] of removed)for(const id of ids)lines.push('- '+(category==='pin'?'changed or removed pin '+id+' ('+report.pinFiles[id].join(', ')+')':'removed '+category+' '+id));
  }
  return lines.join('\n');
}
