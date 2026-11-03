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
import {verifyAssistLanguageInvariance} from './assist-language-invariance.mjs';
import {boundedSnapshot,snapshotCases,behaviourDifferences,behaviourIssues,intendedChangesFile} from './behaviour-snapshot.mjs';
import {unitsByName,sourceMoves} from './source-moves.mjs';
import {assertionCounts,weakenedFiles} from './assertion-counts.mjs';
import {boundedCoverage} from './node-coverage.mjs';
import {survivingMutants,mutationIssues,equivalentsFile} from './mutation.mjs';
import {buildProduct} from '../../src/build.mjs';
const assistInvarianceCache=new Map(),behaviourCache=new Map(),unitCache=new Map(),countCache=new Map(),coverageCache=new Map(),mutationCache=new Map();
// The src files the node suites and the specification worlds run; the screens (10-12) run only in the browser.
export const coveredSourceFiles=/^src\/js\/0[1-9]-[^/]+\.js$/;

export const guardReportSchema='akari-change-guard-v1';
export const identityCategories=Object.freeze(['gate-step','gate-case','integrity-control','acceptance-suite','browser-group','browser-task','browser-case','product-suite','product-test','language-test','workflow-job','workflow-entry','pin']);
const releasePattern=/^audit\/manifests\/release-[^/]*\.json$/;
const pinPattern=/(?<![0-9A-Za-z])(?:[0-9a-f]{64}|[0-9a-f]{40})(?![0-9A-Za-z])/g;

// A run still going after 180 s never finishes: the limit one mutant run has (audit/lib/mutation.mjs), here for one
// git call and one run of the product (measured: the worlds of one product about 11 s, the coverage run about 24 s).
export const guardLimitMs=180000;
export function git(repo,args,input){
  return cp.execFileSync('git',['-C',repo,...args],{input,maxBuffer:512*1024*1024,stdio:['pipe','pipe','pipe'],timeout:guardLimitMs});
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
  return {commit,sets,pins,version:meta.productVersion,productFile:meta.productFile,product,source:optionalObject(repo,commit+':src'),extensions:optionalObject(repo,commit+':extensions'),
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
export function versionAfter(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false;}

// limitMs: how long one run of the product (the worlds of one product, the coverage run) may take before the guard
// stops it with an error (guardLimitMs).
export async function changeGuard({repo,base,head,eventPath,workDir,limitMs=guardLimitMs}){
  const report={schema:guardReportSchema,status:'FAIL',base,head,mergeBase:null,approvalLabel:changeGuardLabel,approved:false,labels:[],
    identitySizes:null,removed:{},pinFiles:{},version:null,versionIssues:[],releaseIssues:[],behaviour:null,behaviourIssues:[],moves:null,weakened:[],mutation:null,mutationIssues:[],errors:[]};
  const ownDir=!workDir;workDir??=fs.mkdtempSync(path.join(os.tmpdir(),'akari-guard-'));
  try{
    const approval=readApproval(eventPath);Object.assign(report,{approved:approval.approved,labels:approval.labels});
    const baseCommit=gitText(repo,['rev-parse','--verify',base+'^{commit}']),headCommit=gitText(repo,['rev-parse','--verify',head+'^{commit}']);
    let mergeBase;
    try{mergeBase=gitText(repo,['merge-base',baseCommit,headCommit]);}catch{throw new Error('no merge base between '+baseCommit+' and '+headCommit);}
    Object.assign(report,{base:baseCommit,head:headCommit,mergeBase});
    const equivalents=commit=>{const oid=optionalObject(repo,commit+':'+equivalentsFile);return oid?JSON.parse(readBlobs(repo,[oid]).get(oid).toString('utf8')):null;};
    const before=await treeIdentity(repo,mergeBase,workDir),after=await treeIdentity(repo,headCommit,workDir);
    report.identitySizes={};
    for(const category of identityCategories){
      const kept=new Set(after.sets[category]),removed=[...new Set(before.sets[category])].filter(id=>!kept.has(id));
      report.identitySizes[category]={base:new Set(before.sets[category]).size,head:kept.size};
      if(removed.length)report.removed[category]=removed;
    }
    for(const value of report.removed.pin||[])report.pinFiles[value]=before.pins.get(value);
    const productChanged=before.source!==after.source||before.product!==after.product;
    const assistFixture=optionalObject(repo,headCommit+':audit/fixtures/assist/code-assist-cases.json');
    if(assistFixture){
      const key=[before.product,after.product,assistFixture].join(':');
      if(!assistInvarianceCache.has(key)){
        const objects=readBlobs(repo,[before.product,after.product,assistFixture]);
        assistInvarianceCache.set(key,verifyAssistLanguageInvariance(objects.get(before.product).toString('utf8'),objects.get(after.product).toString('utf8'),JSON.parse(objects.get(assistFixture).toString('utf8'))));
      }
      report.languageInvariance=assistInvarianceCache.get(key);
    }
    // The behaviour of every specification world, base product against head product (AUDIT.md「前の版との振る舞いの差分」):
    // a difference passes only when this change records it with a reason, and then it needs the owner's label.
    if(productChanged){
      const objects=readBlobs(repo,[before.product,after.product]),cases=snapshotCases();
      const snapshot=blob=>{if(!behaviourCache.has(blob))behaviourCache.set(blob,boundedSnapshot(objects.get(blob).toString('utf8'),limitMs));return behaviourCache.get(blob);};
      const script=blob=>{const html=objects.get(blob).toString('utf8');return html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')).replace(/const PRODUCT_RELEASE = '\d+\.\d+\.\d+';/,'');};
      // Scripts that differ only in the release label (a renumbered branch) behave alike; nothing is run for them.
      const differences=script(before.product)===script(after.product)?[]:behaviourDifferences(snapshot(before.product),snapshot(after.product));
      const record=commit=>{const oid=optionalObject(repo,commit+':'+intendedChangesFile);return oid?JSON.parse(readBlobs(repo,[oid]).get(oid).toString('utf8')):null;};
      const {issues,intended}=behaviourIssues(differences,record(mergeBase),record(headCommit));
      report.behaviour={cases:cases.length,differences,intended:intended.map(c=>({case:c.case,reason:c.reason}))};report.behaviourIssues=issues;
    }
    // A statement that moves to another src file keeps its text (AUDIT.md「移動だけの変更」); one moved and changed needs the label.
    if(before.source!==after.source||before.extensions!==after.extensions){
      const units=commit=>{const key=gitText(repo,['rev-parse',commit+':src']);if(!unitCache.has(key))unitCache.set(key,unitsByName(file=>{const oid=optionalObject(repo,commit+':'+file);if(!oid)throw new Error(commit+' has no '+file);return readBlobs(repo,[oid]).get(oid).toString('utf8');}));return unitCache.get(key);};
      report.moves=sourceMoves(units(mergeBase),units(headCommit));
      // The changed code lines of 01-09, and of an extension file the product embeds, that the node suites or the worlds
      // run are the lines the mutants change (AUDIT.md「変えた行の変異」). A changed line none of them runs needs nothing.
      const diff=gitText(repo,['diff','-U0','--no-color',mergeBase,headCommit,'--','src/js','extensions']),candidates=[],removedText=new Set();
      // The product's own files are those with a boundary record (audit/boundaries); a synthetic tree's files have none.
      const declared=new Set((optionalObject(repo,headCommit+':audit/boundaries')?gitText(repo,['ls-tree','--name-only',headCommit+':audit/boundaries']).split('\n'):[])
        .filter(Boolean).map(name=>'src/js/'+name.replace(/\.json$/,'.js')));
      // The extension files a src file embeds whole (its `// @portable extensions/<file>` lines).
      const portable=new Set(gitText(repo,['ls-tree','-r','--name-only',headCommit,'src/js']).split('\n').filter(f=>/\.js$/.test(f))
        .flatMap(f=>[...gitText(repo,['show',headCommit+':'+f]).matchAll(/^\/\/ @portable (extensions\/[a-z0-9._-]+\.js)$/gm)].map(m=>m[1])));
      const covered=f=>coveredSourceFiles.test(f)&&declared.has(f)||portable.has(f);
      let file=null,from=null,at=0;
      for(const line of diff.split('\n')){
        // A line counts as moved only when its text left one of the files this check covers (not 10-12).
        const origin=line.match(/^--- (?:a\/(.+)|\/dev\/null)$/);if(origin){from=origin[1]&&(coveredSourceFiles.test(origin[1])||portable.has(origin[1]))?origin[1]:null;continue;}
        const target=line.match(/^\+\+\+ (?:b\/(.+)|\/dev\/null)$/);if(target){file=target[1]&&covered(target[1])?target[1]:null;continue;}
        const hunk=line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);if(hunk){at=Number(hunk[1]);continue;}
        if(line.startsWith('-')){if(from)removedText.add(line.slice(1).trim());continue;}
        if(!line.startsWith('+')||line.startsWith('+++'))continue;
        const here=at++;
        if(file&&!/^\s*(?:\/\/.*|\/\*.*|\*.*)?$/.test(line.slice(1)))candidates.push([file,here]);
      }
      if(candidates.length){
        const key=gitText(repo,['rev-parse',headCommit+':src'])+':'+after.extensions;
        if(!coverageCache.has(key)){
          const files=gitText(repo,['ls-tree','-r','--name-only',headCommit,'src','extensions']).split('\n').filter(Boolean),text=new Map();
          const read=file=>{if(!text.has(file)){const oid=optionalObject(repo,headCommit+':'+file);if(!oid)throw new Error(headCommit+' has no '+file);text.set(file,readBlobs(repo,[oid]).get(oid).toString('utf8'));}return text.get(file);};
          const list=dir=>files.filter(file=>file.startsWith(dir+'/')&&!file.slice(dir.length+1).includes('/')).sort();
          coverageCache.set(key,boundedCoverage(buildProduct({read,list}).html,read,files,limitMs));
        }
          const coverage=coverageCache.get(key),ran=coverage.all;
        const executed=candidates.filter(([file,here])=>ran.get(file)?.has(here)).map(([file,here])=>file+':'+here);
        // Mutants on the changed lines that ran (AUDIT.md「変えた行の変異」): each survivor is a listed equivalent or the check fails.
        const headText=new Map(),lineText=(f,l)=>{if(!headText.has(f)){const oid=optionalObject(repo,headCommit+':'+f);headText.set(f,readBlobs(repo,[oid]).get(oid).toString('utf8').split('\n'));}return headText.get(f)[l-1]??'';};
        const lines=executed.map(at=>{const i=at.lastIndexOf(':'),f=at.slice(0,i),l=Number(at.slice(i+1));return {file:f,line:l,text:lineText(f,l)};}).filter(row=>!removedText.has(row.text.trim())); // a line moved as it is (removed elsewhere in this change) is not mutated
        // The worlds judge a mutant by their record against the unmutated product's (audit/lib/mutation.mjs).
        const suitesFor=(f,l)=>[...coverage.bySuite].filter(([,map])=>map.get(f)?.has(l)).map(([name])=>name);
        // The same head src and the same lines give the same mutants and the same verdicts (one process may guard a head
        // more than once, as the synthetic cases do with and without the label).
        const mutationKey=key+'\u0000'+JSON.stringify(lines);
        if(!mutationCache.has(mutationKey))mutationCache.set(mutationKey,await survivingMutants({script:coverage.script,shift:coverage.shift,lineOffsets:coverage.lineOffsets,lines,suitesFor}));
        const {mutants,survivors}=mutationCache.get(mutationKey);
        const {issues,used}=mutationIssues(survivors,equivalents(mergeBase),equivalents(headCommit));
        report.mutation={lines:lines.length,mutants,survivors,equivalents:used};report.mutationIssues=issues;
      }
    }
    // With nothing mutated, an entry the change adds to the record of equivalent mutants matches no survivor.
    if(!report.mutation){const {issues}=mutationIssues([],equivalents(mergeBase),equivalents(headCommit));report.mutationIssues=issues;}
    // An audit file that checks less than at the base needs the label (AUDIT.md「監査の変更ガード」).
    const counts=commit=>{const key=gitText(repo,['rev-parse',commit+':audit']);if(!countCache.has(key)){
      const rows=gitText(repo,['ls-tree','-r',commit,'audit']).split('\n').filter(Boolean).map(line=>{const [meta,file]=line.split('\t');return [file,meta.split(' ')[2]];}).filter(([file])=>/\.(?:m|c)?js$/.test(file));
      const blobs=readBlobs(repo,rows.map(([,oid])=>oid)),byFile=new Map(rows);
      countCache.set(key,assertionCounts(rows.map(([file])=>file),file=>blobs.get(byFile.get(file)).toString('utf8')));}
      return countCache.get(key);};
    report.weakened=weakenedFiles(counts(mergeBase),counts(headCommit));
    const expected=productChanged?nextPatch(before.version):before.version;
    report.version={base:before.version,head:after.version,expected,productChanged};
    // A product change raises the version: one patch by default; any other raise is the owner's decision (label).
    if(!productChanged&&after.version!==expected)report.versionIssues.push('the product and src/ are unchanged: the product version must stay '+before.version+', found '+after.version);
    else if(productChanged&&!versionAfter(after.version,before.version))report.versionIssues.push('the product or src/ changed: the head product version must be '+expected+' (one patch after '+before.version+'), found '+after.version);
    else if(productChanged&&after.version!==expected&&!report.approved)report.versionIssues.push('the product version '+after.version+' is not one patch after '+before.version+' (expected '+expected+'); another raise needs the `'+changeGuardLabel+'` label set by the owner');
    const release='audit/manifests/release-'+after.version+'.json';
    if(JSON.stringify(after.releases)!==JSON.stringify([release]))report.releaseIssues.push('exactly one release manifest, '+release+', must exist; found '+(after.releases.join(', ')||'none'));
  }catch(error){report.errors.push(error.message);}
  finally{if(ownDir)fs.rmSync(workDir,{recursive:true,force:true});}
  const removals=Object.keys(report.removed).length>0||report.behaviour?.intended.length>0||report.moves?.movedAndChanged.length>0||report.weakened.length>0||report.mutation?.equivalents.length>0;
  report.status=!report.errors.length&&!report.versionIssues.length&&!report.releaseIssues.length&&!report.behaviourIssues.length&&!report.mutationIssues.length&&(!removals||report.approved)?'PASS':'FAIL';
  return report;
}

export function formatGuardReport(report){
  const lines=['### Audit change guard: '+report.status,'','Merge base `'+report.mergeBase+'` → head `'+report.head+'`'];
  if(report.version)lines.push('Product version: '+report.version.base+' → '+report.version.head+(report.version.productChanged?' (product or src/ changed)':' (product and src/ unchanged)'));
  if(report.behaviour)lines.push('Behaviour: '+report.behaviour.differences.length+' of '+report.behaviour.cases+' specification worlds differ from the base product');
  if(report.mutation)lines.push('Mutants: '+report.mutation.mutants+' on '+report.mutation.lines+' changed lines that ran, '+report.mutation.survivors.length+' survive');
  for(const message of [...report.errors,...report.versionIssues,...report.releaseIssues,...report.behaviourIssues,...report.mutationIssues])lines.push('- '+message);
  if(report.moves)lines.push('Moves: '+report.moves.moved.length+' statements moved to another src file, '+report.moves.movedAndChanged.length+' of them changed');
  const removed=Object.entries(report.removed),intended=report.behaviour?.intended??[],movedAndChanged=report.moves?.movedAndChanged??[];
  const equivalents=report.mutation?.equivalents??[];
  if(removed.length||intended.length||movedAndChanged.length||report.weakened.length||equivalents.length){
    lines.push('',(report.approved?'Approved by the `'+report.approvalLabel+'` label':'Needs the `'+report.approvalLabel+'` label set by the owner')+':');
    for(const [category,ids] of removed)for(const id of ids)lines.push('- '+(category==='pin'?'changed or removed pin '+id+' ('+report.pinFiles[id].join(', ')+')':'removed '+category+' '+id));
    for(const change of intended)lines.push('- changed behaviour of '+change.case+': '+change.reason);
    for(const move of movedAndChanged)lines.push('- moved and changed in one change: '+move);
    for(const file of report.weakened)lines.push('- fewer checks in '+file);
    for(const e of equivalents)lines.push('- an equivalent mutant in '+e.file+' ('+e.operator+' on "'+e.source+'"): '+e.reason);
  }
  return lines.join('\n');
}
