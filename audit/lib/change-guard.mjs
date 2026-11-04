// Pull-request change guard. Compares the audit identity of the merge base with the head: a removed check ID, a changed
// pin or a file that checks less passes only when the change records it with a reason, which the report lists for the
// owner to read before the merge; one that checks less is recorded only in a change of the audit alone. The product
// version and the release manifest rules hold whatever is recorded.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {verifyAssistLanguageInvariance} from './assist-language-invariance.mjs';
import {boundedSnapshot,snapshotCases,behaviourDifferences,behaviourIssues,intendedChangesFile} from './behaviour-snapshot.mjs';
import {unitsByName,sourceMoves} from './source-moves.mjs';
import {assertionCounts,weakenedFiles} from './assertion-counts.mjs';
import {boundedCoverage} from './node-coverage.mjs';
import {mutantPlan,partJobs,runMutants,sortSurvivors,mutationIssues,equivalentsFile,equivalentKey,assistDifferences,assistFixtureFile} from './mutation.mjs';
import {buildProduct} from '../../src/build.mjs';
const assistInvarianceCache=new Map(),behaviourCache=new Map(),unitCache=new Map(),countCache=new Map(),coverageCache=new Map(),planCache=new Map(),mutationCache=new Map(),assistCache=new Map();
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
  // Pins: every standalone SHA-1/SHA-256 hex value in the audit tree except the release record and the record of audit
  // changes, which names the pins a change changes.
  const pins=new Map();
  for(const e of entries){
    if(releasePattern.test(e.path)||e.path===auditChangesFile)continue;
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

export function nextPatch(version){const [major,minor,patch]=version.split('.').map(Number);return major+'.'+minor+'.'+(patch+1);}
export function versionAfter(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false;}

function resolveCommits(repo,base,head){
  const baseCommit=gitText(repo,['rev-parse','--verify',base+'^{commit}']),headCommit=gitText(repo,['rev-parse','--verify',head+'^{commit}']);
  let mergeBase;
  try{mergeBase=gitText(repo,['merge-base',baseCommit,headCommit]);}catch{throw new Error('no merge base between '+baseCommit+' and '+headCommit);}
  return {base:baseCommit,head:headCommit,mergeBase};
}
const equivalentsAt=(repo,commit)=>{const oid=optionalObject(repo,commit+':'+equivalentsFile);return oid?JSON.parse(readBlobs(repo,[oid]).get(oid).toString('utf8')):null;};

// The mutants of the changed code lines of 01-09, and of an extension file the product embeds, that the node suites or
// the worlds run (AUDIT.md「変えた行の変異」), in the order every part of the guard computes alike; null when the change
// has no such changed line to look at. A changed line none of them runs needs nothing.
async function changedLineMutants(repo,mergeBase,headCommit,limitMs){
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
  if(!candidates.length)return null;
  const key=gitText(repo,['rev-parse',headCommit+':src'])+':'+optionalObject(repo,headCommit+':extensions');
  if(!coverageCache.has(key)){
    const files=gitText(repo,['ls-tree','-r','--name-only',headCommit,'src','extensions']).split('\n').filter(Boolean),text=new Map();
    const read=file=>{if(!text.has(file)){const oid=optionalObject(repo,headCommit+':'+file);if(!oid)throw new Error(headCommit+' has no '+file);text.set(file,readBlobs(repo,[oid]).get(oid).toString('utf8'));}return text.get(file);};
    const list=dir=>files.filter(file=>file.startsWith(dir+'/')&&!file.slice(dir.length+1).includes('/')).sort();
    coverageCache.set(key,boundedCoverage(buildProduct({read,list}).html,read,files,limitMs));
  }
  const coverage=coverageCache.get(key),ran=coverage.all;
  const executed=candidates.filter(([file,here])=>ran.get(file)?.has(here)).map(([file,here])=>file+':'+here);
  const headText=new Map(),lineText=(f,l)=>{if(!headText.has(f)){const oid=optionalObject(repo,headCommit+':'+f);headText.set(f,readBlobs(repo,[oid]).get(oid).toString('utf8').split('\n'));}return headText.get(f)[l-1]??'';};
  const lines=executed.map(at=>{const i=at.lastIndexOf(':'),f=at.slice(0,i),l=Number(at.slice(i+1));return {file:f,line:l,text:lineText(f,l)};}).filter(row=>!removedText.has(row.text.trim())); // a line moved as it is (removed elsewhere in this change) is not mutated
  // The worlds judge a mutant by their record against the unmutated product's (audit/lib/mutation.mjs).
  const suitesFor=(f,l)=>[...coverage.bySuite].filter(([,map])=>map.get(f)?.has(l)).map(([name])=>name);
  // The same head src and the same lines give the same mutants (one process may guard a head more than once, as the
  // synthetic cases do with and without a record).
  const planKey=key+'\u0000'+JSON.stringify(lines);
  if(!planCache.has(planKey))planCache.set(planKey,{key:planKey,lines,...mutantPlan({script:coverage.script,shift:coverage.shift,lineOffsets:coverage.lineOffsets,lines,suitesFor})});
  return planCache.get(planKey);
}
// The survivors of the given mutants of a plan. A survivor the head records as equivalent runs the head's assist fixtures
// too (audit/lib/mutation.mjs assistDifferences): the first case that tells it apart from the script as it is is kept as
// toldApart. A mutant of a plan runs once per process: a share of a plan already run whole (the synthetic cases guard a
// head whole and in parts) runs nothing again.
async function planSurvivors(plan,jobs,repo,headCommit){
  if(!mutationCache.has(plan.key))mutationCache.set(plan.key,new Map());
  const survived=mutationCache.get(plan.key),missing=jobs.filter(job=>!survived.has(job.index));
  if(missing.length){const ids=new Set(await runMutants(plan.script,missing));for(const job of missing)survived.set(job.index,ids.has(job.index));}
  const surviving=jobs.filter(job=>survived.get(job.index)),record=equivalentsAt(repo,headCommit);
  const claimed=new Set((Array.isArray(record?.equivalents)?record.equivalents:[]).map(equivalentKey)),checked=surviving.filter(job=>claimed.has(equivalentKey(job))),told=new Map();
  if(checked.length){
    const fixture=optionalObject(repo,headCommit+':'+assistFixtureFile);
    if(!fixture)throw new Error('the head records equivalent mutants and has no '+assistFixtureFile+' to check them with');
    const cacheKey=plan.key+'\u0000'+fixture;if(!assistCache.has(cacheKey))assistCache.set(cacheKey,new Map());
    const known=assistCache.get(cacheKey),unknown=checked.filter(job=>!known.has(job.index));
    if(unknown.length){const got=await assistDifferences(plan.script,unknown,readBlobs(repo,[fixture]).get(fixture).toString('utf8'));for(const job of unknown)known.set(job.index,got.get(job.index)??null);}
    for(const job of checked)if(known.get(job.index))told.set(job.index,known.get(job.index));
  }
  return sortSurvivors(surviving.map(({index,file,line,operator,source})=>({file,line,operator,source,...(told.has(index)?{toldApart:told.get(index)}:{})})));
}
// Whether the guard running here is the base's and the head's own: its two files against theirs, read as git stores
// them. The run of a change to the guard workflow with the head's own guard shows how the change judges itself; the run
// with the base's guard judges it.
const guardFiles=['audit/lib/change-guard.mjs','audit/lib/mutation.mjs'];
function guardCode(repo,commits){
  const here=guardFiles.map(file=>git(repo,['hash-object','--path='+file,'--stdin'],fs.readFileSync(new URL('../../'+file,import.meta.url))).toString('utf8').trim());
  const same=commit=>guardFiles.every((file,i)=>optionalObject(repo,commit+':'+file)===here[i]);
  return {base:same(commits.base),head:same(commits.head)};
}

// What a change does to the audit itself (a removed check or pin, a file that checks less, a statement moved and changed,
// a version raised past the next patch) passes only when the change records each one with a reason; a record that
// matches nothing this change does fails too. As for behaviour changes and equivalent mutants, an entry kept from the
// base covers nothing: each change gives its own reasons, which the report lists for the owner to read before the merge.
export const auditChangesFile='audit/manifests/intended-audit-changes.json',auditChangesSchema='akari-intended-audit-changes-v1';
export function auditChangeIssues(items,baseRecord,headRecord){
  const read=record=>{
    if(!record)return [];
    if(record.schema!==auditChangesSchema||!Array.isArray(record.changes))throw new Error(auditChangesFile+' has the wrong shape');
    for(const c of record.changes)if(typeof c?.change!=='string'||typeof c.reason!=='string'||c.reason.trim().length<10)throw new Error(auditChangesFile+': each entry names a change and a reason');
    return record.changes;
  };
  const key=c=>c.change+'\u0000'+c.reason,before=new Set(read(baseRecord).map(key)),added=read(headRecord).filter(c=>!before.has(key(c))),recorded=new Set(added.map(c=>c.change)),issues=[];
  for(const item of items)if(!recorded.has(item))issues.push('the audit change '+item+' is not recorded with a reason in '+auditChangesFile);
  for(const c of added)if(!items.includes(c.change))issues.push(auditChangesFile+' records '+c.change+', but this change does not make it');
  return {issues,recorded:added.filter(c=>items.includes(c.change)).map(c=>({change:c.change,reason:c.reason}))};
}

// The verdict from a report whose checks are complete: PASS when nothing fails.
export function guardStatus(report){
  return !report.errors.length&&!report.versionIssues.length&&!report.releaseIssues.length&&!report.behaviourIssues.length&&!report.mutationIssues.length&&!report.auditChangeIssues.length?'PASS':'FAIL';
}

const emptyReport=(base,head)=>({schema:guardReportSchema,status:'FAIL',base,head,mergeBase:null,
  guardCode:null,identitySizes:null,removed:{},pinFiles:{},version:null,versionIssues:[],releaseIssues:[],behaviour:null,behaviourIssues:[],moves:null,weakened:[],mutation:null,mutationIssues:[],auditChanges:[],auditChangeIssues:[],errors:[]});
// limitMs: how long one run of the product (the worlds of one product, the coverage run) may take before the guard
// stops it with an error (guardLimitMs). part 'main' does every check but run the mutants: its report holds the mutants'
// plan and waits for the parts that run them (guardMutantPart, mergeGuardParts).
export async function changeGuard({repo,base,head,workDir,limitMs=guardLimitMs,part=null}){
  const report=emptyReport(base,head);
  if(part!==null&&part!=='main')throw new Error('unknown change guard part '+part);
  if(part)report.part=part;
  const ownDir=!workDir;workDir??=fs.mkdtempSync(path.join(os.tmpdir(),'akari-guard-'));
  try{
    const commits=resolveCommits(repo,base,head),{mergeBase,head:headCommit}=Object.assign(report,commits);report.guardCode=guardCode(repo,commits);
    const equivalents=commit=>equivalentsAt(repo,commit);
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
    // a difference passes only when this change records it with a reason.
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
    // A statement that moves to another src file keeps its text (AUDIT.md「移動だけの変更」); one moved and changed is an audit change.
    if(before.source!==after.source||before.extensions!==after.extensions){
      const units=commit=>{const key=gitText(repo,['rev-parse',commit+':src']);if(!unitCache.has(key))unitCache.set(key,unitsByName(file=>{const oid=optionalObject(repo,commit+':'+file);if(!oid)throw new Error(commit+' has no '+file);return readBlobs(repo,[oid]).get(oid).toString('utf8');}));return unitCache.get(key);};
      report.moves=sourceMoves(units(mergeBase),units(headCommit));
      const plan=await changedLineMutants(repo,mergeBase,headCommit,limitMs);
      // Mutants on the changed lines that ran (AUDIT.md「変えた行の変異」): each survivor is a listed equivalent or the check
      // fails. The main part leaves them to the parts and keeps the plan they must agree on.
      if(plan&&part==='main')report.mutation={lines:plan.lines.length,mutants:plan.jobs.length,plan:plan.digest};
      else if(plan){
        const survivors=await planSurvivors(plan,plan.jobs,repo,headCommit),{issues,used}=mutationIssues(survivors,equivalents(mergeBase),equivalents(headCommit));
        report.mutation={lines:plan.lines.length,mutants:plan.jobs.length,survivors,equivalents:used};report.mutationIssues=issues;
      }
    }
    // With nothing mutated, an entry the change adds to the record of equivalent mutants matches no survivor.
    if(!report.mutation){const {issues}=mutationIssues([],equivalents(mergeBase),equivalents(headCommit));report.mutationIssues=issues;}
    // An audit file that checks less than at the base is an audit change (AUDIT.md「監査の変更ガード」).
    const counts=commit=>{const key=gitText(repo,['rev-parse',commit+':audit']);if(!countCache.has(key)){
      const rows=gitText(repo,['ls-tree','-r',commit,'audit']).split('\n').filter(Boolean).map(line=>{const [meta,file]=line.split('\t');return [file,meta.split(' ')[2]];}).filter(([file])=>/\.(?:m|c)?js$/.test(file));
      const blobs=readBlobs(repo,rows.map(([,oid])=>oid)),byFile=new Map(rows);
      countCache.set(key,assertionCounts(rows.map(([file])=>file),file=>blobs.get(byFile.get(file)).toString('utf8')));}
      return countCache.get(key);};
    report.weakened=weakenedFiles(counts(mergeBase),counts(headCommit));
    const expected=productChanged?nextPatch(before.version):before.version;
    report.version={base:before.version,head:after.version,expected,productChanged};
    // A product change raises the version: one patch by default; any other raise is an audit change.
    if(!productChanged&&after.version!==expected)report.versionIssues.push('the product and src/ are unchanged: the product version must stay '+before.version+', found '+after.version);
    else if(productChanged&&!versionAfter(after.version,before.version))report.versionIssues.push('the product or src/ changed: the head product version must be '+expected+' (one patch after '+before.version+'), found '+after.version);
    else if(productChanged&&after.version!==expected)report.version.beyondPatch=true;
    const auditRecord=commit=>{const oid=optionalObject(repo,commit+':'+auditChangesFile);return oid?JSON.parse(readBlobs(repo,[oid]).get(oid).toString('utf8')):null;};
    // A removed check or a file with fewer checks checks less; a changed pin, a statement moved and changed, a version
    // raised further do not by themselves.
    const less=[...Object.entries(report.removed).filter(([category])=>category!=='pin').flatMap(([category,ids])=>ids.map(id=>category+':'+id)),...report.weakened.map(w=>'fewer-checks:'+w.slice(0,w.indexOf(': ')))];
    const items=[...less,...(report.removed.pin||[]).map(id=>'pin:'+id),
      ...(report.moves?.movedAndChanged||[]).map(m=>'moved-and-changed:'+m.slice(0,m.indexOf(': '))),...(report.version.beyondPatch?['version:'+after.version]:[])];
    const audited=auditChangeIssues(items,auditRecord(mergeBase),auditRecord(headCommit));report.auditChanges=audited.recorded;report.auditChangeIssues=audited.issues;
    // A change that checks less is recorded only in a change of the audit alone: with src/, extensions/ or the product
    // changed as well, the owner would read the weaker audit and the code it lets through in one merge.
    if(productChanged||before.extensions!==after.extensions)for(const c of audited.recorded)if(less.includes(c.change))
      report.auditChangeIssues.push('the audit change '+c.change+' checks less, and this change also changes src/, extensions/ or the product: record it in a change of the audit alone');
    const release='audit/manifests/release-'+after.version+'.json';
    if(JSON.stringify(after.releases)!==JSON.stringify([release]))report.releaseIssues.push('exactly one release manifest, '+release+', must exist; found '+(after.releases.join(', ')||'none'));
  }catch(error){report.errors.push(error.message);}
  finally{if(ownDir)fs.rmSync(workDir,{recursive:true,force:true});}
  report.status=report.mutation?.plan?'PART':guardStatus(report);
  return report;
}

// One part of the mutants (part `index` of `count`, 1-based) of the head, run apart from the main part: the merge base,
// the plan it ran a share of, the mutants of that share and their survivors.
export const guardPartSchema='akari-change-guard-part-v1';
export async function guardMutantPart({repo,base,head,index,count,limitMs=guardLimitMs}){
  const report={schema:guardPartSchema,part:'m'+index,index,count,base,head,mergeBase:null,plan:null,mutants:0,ran:[],survivors:[],errors:[]};
  try{
    if(!(Number.isInteger(index)&&Number.isInteger(count)&&index>=1&&index<=count))throw new Error('part '+index+' of '+count+' is no part');
    const {mergeBase,head:headCommit}=Object.assign(report,resolveCommits(repo,base,head));
    const changed=commit=>[optionalObject(repo,commit+':src'),optionalObject(repo,commit+':extensions')].join(':');
    // The main part makes a plan only for a change of src/ or extensions/ (changeGuard), and so does a part.
    const plan=changed(mergeBase)!==changed(headCommit)?await changedLineMutants(repo,mergeBase,headCommit,limitMs):null;
    if(plan){
      const jobs=partJobs(plan.jobs,index,count);
      Object.assign(report,{plan:plan.digest,mutants:plan.jobs.length,ran:jobs.map(job=>job.index),survivors:await planSurvivors(plan,jobs,repo,headCommit)});
    }
  }catch(error){report.errors.push(error.message);}
  return report;
}

// The verdict of the parts: the main part and the mutant parts m1..m<count>, each reported once. They guard the same base
// and head, a part ran exactly its share of the main part's plan, and the survivors of all parts are judged as one run of
// every mutant would judge them. Anything else is an error of the merged report.
export function mergeGuardParts({repo,base,head,parts,count}){
  const mains=parts.filter(p=>p?.part==='main'),main=mains.length===1?mains[0]:null;
  const valid=main?.schema===guardReportSchema&&Array.isArray(main.errors);
  const report=valid?structuredClone(main):emptyReport(base,head),fail=message=>report.errors.push(message);
  delete report.part;
  try{
    if(!valid)throw new Error('the main part is reported '+mains.length+' times'+(mains.length===1?', in another form':''));
    const commits=resolveCommits(repo,base,head);report.guardCode=guardCode(repo,commits);
    for(const field of ['base','head','mergeBase'])if(main[field]!==commits[field])fail('the main part guards '+field+' '+main[field]+', not '+commits[field]);
    const names=Array.from({length:count},(_,i)=>'m'+(i+1)),seen=parts.filter(p=>p!==main).map(p=>p?.part);
    for(const name of names)if(seen.filter(n=>n===name).length!==1)fail('mutant part '+name+' is reported '+seen.filter(n=>n===name).length+' times');
    for(const name of seen)if(!names.includes(name))fail('an undeclared part '+name+' is reported');
    const plan=main.mutation?.plan??null,mutants=plan?main.mutation.mutants:0,survivors=[];
    for(const part of parts.filter(p=>p!==main)){
      if(!names.includes(part?.part))continue;
      if(part.schema!==guardPartSchema||!Array.isArray(part.errors)||!Array.isArray(part.ran)||!Array.isArray(part.survivors)){fail(part.part+' is not a report of a mutant part');continue;}
      for(const message of part.errors)fail(part.part+': '+message);
      for(const field of ['base','head','mergeBase'])if(part[field]!==commits[field])fail(part.part+' guards '+field+' '+part[field]+', not '+commits[field]);
      if(part.count!==count||part.part!=='m'+part.index)fail(part.part+' is part '+part.index+' of '+part.count+', not of '+count);
      if(part.plan!==plan||part.mutants!==mutants)fail(part.part+' ran a share of another plan of mutants than the main part');
      const share=Array.from({length:mutants},(_,i)=>i).filter(i=>i%count===part.index-1);
      if(JSON.stringify(part.ran)!==JSON.stringify(share))fail(part.part+' ran mutants '+JSON.stringify(part.ran)+', not its share '+JSON.stringify(share));
      survivors.push(...part.survivors);
    }
    if(plan){
      const {issues,used}=mutationIssues(sortSurvivors(survivors),equivalentsAt(repo,commits.mergeBase),equivalentsAt(repo,commits.head));
      report.mutation={lines:main.mutation.lines,mutants,survivors:sortSurvivors(survivors),equivalents:used};report.mutationIssues=issues;
    }
  }catch(error){fail(error.message);}
  if(report.mutation?.plan)report.mutation={...report.mutation,survivors:[],equivalents:[]};
  report.status=guardStatus(report);
  return report;
}

export function formatGuardReport(report){
  const lines=['### Audit change guard: '+report.status,'','Merge base `'+report.mergeBase+'` → head `'+report.head+'`'];
  if(report.guardCode)lines.push('Guard code: '+(report.guardCode.base?'the base\'s':report.guardCode.head?'the head\'s own (this run shows how the change judges itself; the run with the base\'s guard judges it)':'neither the base\'s nor the head\'s'));
  if(report.version)lines.push('Product version: '+report.version.base+' → '+report.version.head+(report.version.productChanged?' (product or src/ changed)':' (product and src/ unchanged)'));
  if(report.behaviour)lines.push('Behaviour: '+report.behaviour.differences.length+' of '+report.behaviour.cases+' specification worlds differ from the base product');
  if(report.mutation)lines.push('Mutants: '+report.mutation.mutants+' on '+report.mutation.lines+' changed lines that ran, '+report.mutation.survivors.length+' survive');
  for(const message of [...report.errors,...report.versionIssues,...report.releaseIssues,...report.behaviourIssues,...report.mutationIssues,...report.auditChangeIssues])lines.push('- '+message);
  if(report.moves)lines.push('Moves: '+report.moves.moved.length+' statements moved to another src file, '+report.moves.movedAndChanged.length+' of them changed');
  const removed=Object.entries(report.removed),intended=report.behaviour?.intended??[],movedAndChanged=report.moves?.movedAndChanged??[];
  const equivalents=report.mutation?.equivalents??[];
  if(removed.length||intended.length||movedAndChanged.length||report.weakened.length||equivalents.length||report.version?.beyondPatch){
    lines.push('','For the owner to read before the merge:');
    const why=change=>{const r=report.auditChanges.find(c=>c.change===change);return r?': '+r.reason:'';};
    if(report.version?.beyondPatch)lines.push('- the product version '+report.version.head+' is raised past the next patch '+report.version.expected+why('version:'+report.version.head));
    for(const [category,ids] of removed)for(const id of ids)lines.push('- '+(category==='pin'?'changed or removed pin '+id+' ('+report.pinFiles[id].join(', ')+')':'removed '+category+' '+id)+why(category+':'+id));
    for(const change of intended)lines.push('- changed behaviour of '+change.case+': '+change.reason);
    for(const move of movedAndChanged)lines.push('- moved and changed in one change: '+move+why('moved-and-changed:'+move.slice(0,move.indexOf(': '))));
    for(const file of report.weakened)lines.push('- fewer checks in '+file+why('fewer-checks:'+file.slice(0,file.indexOf(': '))));
    for(const e of equivalents)lines.push('- an equivalent mutant in '+e.file+' ('+e.operator+' on "'+e.source+'"): '+e.reason);
  }
  return lines.join('\n');
}
