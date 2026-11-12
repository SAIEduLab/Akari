// Pull-request change guard. Compares the audit identity of the merge base with the head: a removed check ID, a changed
// pin or a file that checks less passes only when the change records it with a reason, which the report lists for the
// owner to read before the merge; one that checks less is recorded only in a change of the audit alone. The product
// version and the release manifest rules hold whatever is recorded.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {verifyAssistLanguageInvariance} from './assist-language-invariance.mjs';
import {boundedSnapshot,snapshotCases,behaviourDifferences,behaviourIssues,intendedChangesFile,runLimited} from './behaviour-snapshot.mjs';
import {assertionCounts,weakenedFiles} from './assertion-counts.mjs';
import {productLines} from './node-coverage.mjs';
const assistInvarianceCache=new Map(),behaviourCache=new Map(),countCache=new Map();
export const guardReportSchema='akari-change-guard-v1';
// The allowances the audit may only shrink (AUDIT.md「製品のソースの一致」「監査のコード」): an entry a change adds is recorded
// with a reason, as a removed check is. A count is one entry for each unit of it, so a raised count adds entries.
export const allowanceCategories=Object.freeze(['unnamed-code','clone-allowance','shown-text-allowance','wait-allowance','source-read-allowance','lint-allowance']);
export const identityCategories=Object.freeze(['gate-step','gate-case','integrity-control','acceptance-suite','browser-group','browser-task','browser-case','product-suite','product-test','language-test','workflow-job','workflow-entry','pin']);
const releasePattern=/^audit\/manifests\/release-[^/]*\.json$/;
const pinPattern=/(?<![0-9A-Za-z])(?:[0-9a-f]{64}|[0-9a-f]{40})(?![0-9A-Za-z])/g;

// A run still going after 180 s never finishes: the limit of one git call and one run of the product (measured: the
// worlds of one product about 11 s).
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

// The ID sets of a tree's own contracts, read by loading them (identitySets runs in a child that may write only its
// answer: the contracts are code of the change under review, and loading them in the guard's process would let them
// change the guard's own checks).
export async function identitySets(dir){
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
  // The oldest browser and Playwright a report may name (null when the tree has none).
  const environment=await load('audit/lib/browser-environment.mjs');
  return {sets,allowances:treeAllowances(dir),oldest:{browser:environment?.oldestBrowser??null,playwright:environment?.oldestPlaywright??null}};
}
// The allowances, read from the tree's modules as the literals they are written as (the modules import the product's
// build, which the copy of audit/ does not have): an allowance written as anything but a literal makes the identity
// unavailable. A module or a list the tree does not have allows nothing.
export function treeAllowances(dir){
  const value=node=>{
    if(['StringLiteral','NumericLiteral','BooleanLiteral'].includes(node.type))return node.value;
    if(node.type==='TemplateLiteral'&&!node.expressions.length)return node.quasis[0].value.cooked;
    if(node.type==='ArrayExpression')return node.elements.map(value);
    if(node.type==='ObjectExpression')return Object.fromEntries(node.properties.map(p=>{
      if(p.type!=='ObjectProperty'||p.computed||!['Identifier','StringLiteral'].includes(p.key.type))throw new Error('an allowance is not a literal');
      return [p.key.name??p.key.value,value(p.value)];}));
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&node.callee.object.name==='Object'&&node.callee.property.name==='freeze'&&node.arguments.length===1)return value(node.arguments[0]);
    throw new Error('an allowance is not a literal');};
  const literal=(rel,name)=>{const file=path.join(dir,rel);if(!fs.existsSync(file))return null;
    const program=createRequire(import.meta.url)('@babel/parser').parse(fs.readFileSync(file,'utf8'),{sourceType:'module'}).program;
    for(const statement of program.body)if(statement.type==='ExportNamedDeclaration'&&statement.declaration?.type==='VariableDeclaration')
      for(const d of statement.declaration.declarations)if(d.id.name===name)return value(d.init);
    return null;};
  const units=(key,n)=>Array.from({length:Number.isSafeInteger(n)&&n>0?n:0},(_,i)=>key+'#'+(i+1));
  const counts=list=>Object.entries(list||{}).flatMap(([file,n])=>units(file,n));
  return {
    'unnamed-code':(literal('audit/lib/source-consistency.mjs','UNNAMED_CODES')||[]).map(String),
    'clone-allowance':(literal('audit/lib/source-clones.mjs','CLONE_BASELINE')||[]).map(e=>String(e?.id)),
    'shown-text-allowance':(literal('audit/lib/source-consistency.mjs','SHOWN_TEXT_BASELINE')||[]).map(e=>e?.file+'|'+e?.source),
    'wait-allowance':counts(literal('audit/lib/audit-code.mjs','WAIT_BASELINE')),
    'source-read-allowance':counts(literal('audit/lib/audit-code.mjs','SOURCE_READ_BASELINE')),
    'lint-allowance':Object.entries(literal('audit/lib/audit-code.mjs','LINT_BASELINE')||{}).flatMap(([file,rules])=>Object.entries(rules||{}).flatMap(([rule,n])=>units(file+'|'+rule,n))),
  };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)&&process.argv[2]==='--identity')
  {fs.writeFileSync(process.argv[4],JSON.stringify(await identitySets(process.argv[3])));process.exit(0);}// (a timer a contract leaves does not hold the child)

// Runs the tree's own contracts in a copy of its audit/ directory. A missing module or
// manifest contributes no IDs; a module that fails to load makes the identity unavailable.
export async function treeIdentity(repo,commit,workDir){
  const {dir,entries,blobs}=materialize(repo,commit,workDir),answer=path.join(workDir,'identity-'+commit+'.json');
  const json=rel=>fs.existsSync(path.join(dir,rel))?JSON.parse(fs.readFileSync(path.join(dir,rel),'utf8')):null;
  let sets,allowances,oldest;
  try{runLimited([fileURLToPath(import.meta.url),'--identity',dir,answer],guardLimitMs,'the contracts of '+commit,[answer]);
    if(!fs.existsSync(answer))throw new Error('the contracts of '+commit+' ended without an answer');
    ({sets,allowances,oldest}=JSON.parse(fs.readFileSync(answer,'utf8')));}
  finally{fs.rmSync(answer,{force:true});}
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
  return {commit,sets,allowances,pins,oldest,version:meta.productVersion,productFile:meta.productFile,product,source:optionalObject(repo,commit+':src'),extensions:optionalObject(repo,commit+':extensions'),
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

const require=createRequire(import.meta.url);
let babel;
// The lines of a script as its tokens read them: on each line, the tokens that start on it with their exact text (a
// string, a template or a regular expression keeps its spacing). Comments and the spacing
// between tokens are left out, so a line changed only in them reads the same; a token over several lines (a template)
// belongs to the line it starts on.
export function scriptTokenLines(script){
  const ast=(babel??=require('@babel/parser')).parse(script,{sourceType:'script',tokens:true,errorRecovery:false,allowReturnOutsideFunction:true});
  // A line is what ends with \n (the parser counts other line terminators too).
  const lines=script.split('\n').map(()=>[]),starts=[0];
  for(let i=0;i<script.length;i++)if(script.charCodeAt(i)===10)starts.push(i+1);
  const lineAt=offset=>{let lo=0,hi=starts.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(starts[mid]<=offset)lo=mid;else hi=mid-1;}return lo;};
  for(const t of ast.tokens){
    if(t.type==='CommentLine'||t.type==='CommentBlock'||t.end===t.start)continue;
    lines[lineAt(t.start)].push(script.slice(t.start,t.end));
  }
  // One line of text each: the tokens as JSON (a template's newlines stay inside it); a line with no token is empty.
  return lines.map(tokens=>tokens.length?JSON.stringify(tokens):'');
}
// The changed lines of the head product's script against the base product's (AUDIT.md「変えた行」), as lines of the
// head product file: [line, text]. Lines are compared as their tokens read them (scriptTokenLines), so spacing and
// comments alone change no line, and a line with no token is no changed line. A line moved as it is (its tokens removed
// elsewhere in the change) is not a changed line when every line of the base that reads the same was removed: a common
// line (return false;) taken out in one place and put in another is a changed line.
export function changedScriptLines(beforeHtml,afterHtml){
  const before=productLines(beforeHtml),after=productLines(afterHtml),a=scriptTokenLines(before.script),b=scriptTokenLines(after.script);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'akari-lines-'));
  let out;
  try{
    const fa=path.join(dir,'base.txt'),fb=path.join(dir,'head.txt');
    fs.writeFileSync(fa,a.join('\n')+'\n');fs.writeFileSync(fb,b.join('\n')+'\n');
    const r=cp.spawnSync('git',['diff','--no-index','--no-color','--no-ext-diff','-U0','--',fa,fb],{encoding:'utf8',maxBuffer:512*1024*1024,timeout:guardLimitMs});
    if(r.status!==0&&r.status!==1)throw new Error('the comparison of the products failed: '+(r.error?.message||r.stderr));
    out=r.stdout;
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
  const added=[],removed=new Map(),count=(map,key)=>map.set(key,(map.get(key)??0)+1);
  let at=0,inHunk=false;
  for(const row of out.split('\n')){
    const hunk=row.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);if(hunk){at=Number(hunk[1]);inHunk=true;continue;}
    if(!inHunk)continue; // the header of the diff
    if(row.startsWith('-'))count(removed,row.slice(1));
    else if(row.startsWith('+')){added.push([at,row.slice(1)]);at++;}
  }
  const inBase=new Map();for(const text of a)count(inBase,text);
  const allowance=new Map([...removed].filter(([text,n])=>inBase.get(text)===n));
  const afterLines=afterHtml.split('\n'),changed=[];
  for(const [scriptLine,tokens] of added){
    if(!tokens)continue;
    const left=allowance.get(tokens)??0;
    if(left>0){allowance.set(tokens,left-1);continue;}
    const line=after.firstLine+scriptLine-1;
    changed.push([line,afterLines[line-1]]);
  }
  return changed;
}
// Whether the guard running here is the base's and the head's own: its file against theirs, read as git stores
// them. The run of a change to the guard workflow with the head's own guard shows how the change judges itself; the run
// with the base's guard judges it.
const guardFiles=['audit/lib/change-guard.mjs'];
function guardCode(repo,commits){
  const here=guardFiles.map(file=>git(repo,['hash-object','--path='+file,'--stdin'],fs.readFileSync(new URL('../../'+file,import.meta.url))).toString('utf8').trim());
  const same=commit=>guardFiles.every((file,i)=>optionalObject(repo,commit+':'+file)===here[i]);
  return {base:same(commits.base),head:same(commits.head)};
}

// What a change does to the audit itself (a removed check or pin, a file that checks less, a lowered oldest browser or
// Playwright, a version raised past the next patch) passes only when the change records each one with a reason; a record that
// matches nothing this change does fails too. As for behaviour changes, an entry kept from the base covers nothing: each change gives its own reasons, which the report lists for the owner to read before the merge.
// The record keeps two lists: `changes` for what the change does to the checks, pins and the version, and `allowances` for
// each entry it adds to an allowance (grown). An entry in the other list than its own matches nothing there, so it fails.
export const auditChangesFile='audit/manifests/intended-audit-changes.json',auditChangesSchema='akari-intended-audit-changes-v1';
export function auditChangeIssues(items,baseRecord,headRecord,grown=[]){
  const read=(record,list)=>{
    if(!record)return [];
    if(record.schema!==auditChangesSchema||!Array.isArray(record.changes)||(record.allowances!==undefined&&!Array.isArray(record.allowances)))throw new Error(auditChangesFile+' has the wrong shape');
    for(const c of [...record.changes,...(record.allowances??[])])if(typeof c?.change!=='string'||typeof c.reason!=='string'||c.reason.trim().length<10)throw new Error(auditChangesFile+': each entry names a change and a reason');
    return record[list]??[];
  };
  const key=c=>c.change+'\u0000'+c.reason,added=list=>{const before=new Set(read(baseRecord,list).map(key));return read(headRecord,list).filter(c=>!before.has(key(c)));};
  const changes=added('changes'),allowances=added('allowances'),recorded=new Set(changes.map(c=>c.change)),allowed=new Set(allowances.map(c=>c.change)),issues=[];
  for(const item of items)if(!recorded.has(item))issues.push('the audit change '+item+' is not recorded with a reason in '+auditChangesFile);
  for(const item of grown)if(!allowed.has(item))issues.push('the audit change '+item+' is not recorded with a reason in the allowances of '+auditChangesFile);
  for(const c of changes)if(!items.includes(c.change))issues.push(auditChangesFile+' records '+c.change+', but this change does not make it');
  for(const c of allowances)if(!grown.includes(c.change))issues.push(auditChangesFile+' records the allowance '+c.change+', but this change does not grow it');
  return {issues,recorded:[...changes.filter(c=>items.includes(c.change)),...allowances.filter(c=>grown.includes(c.change))].map(c=>({change:c.change,reason:c.reason}))};
}

// Whether release number a (1.63.0, 153.0.8010.12) comes before b.
export function olderRelease(a,b){
  const x=String(a).split('.').map(Number),y=String(b).split('.').map(Number),i=x.findIndex((n,k)=>n!==y[k]);
  return i>=0&&(y[i]===undefined?false:x[i]<y[i]);
}

// The verdict from a report whose checks are complete: PASS when nothing fails.
export function guardStatus(report){
  return !report.errors.length&&!report.versionIssues.length&&!report.releaseIssues.length&&!report.behaviourIssues.length&&!report.auditChangeIssues.length?'PASS':'FAIL';
}

const emptyReport=(base,head)=>({schema:guardReportSchema,status:'FAIL',base,head,mergeBase:null,
  guardCode:null,identitySizes:null,removed:{},grown:{},pinFiles:{},version:null,versionIssues:[],releaseIssues:[],behaviour:null,behaviourIssues:[],weakened:[],auditChanges:[],auditChangeIssues:[],errors:[]});
// limitMs: how long one run of the product (the worlds of one product) may take before the guard stops it with an error
// (guardLimitMs).
export async function changeGuard({repo,base,head,workDir,limitMs=guardLimitMs}){
  const report=emptyReport(base,head);
  const ownDir=!workDir;workDir??=fs.mkdtempSync(path.join(os.tmpdir(),'akari-guard-'));
  try{
    const commits=resolveCommits(repo,base,head),{mergeBase,head:headCommit}=Object.assign(report,commits);report.guardCode=guardCode(repo,commits);
    const before=await treeIdentity(repo,mergeBase,workDir),after=await treeIdentity(repo,headCommit,workDir);
    report.identitySizes={};
    for(const category of identityCategories){
      const kept=new Set(after.sets[category]),removed=[...new Set(before.sets[category])].filter(id=>!kept.has(id));
      report.identitySizes[category]={base:new Set(before.sets[category]).size,head:kept.size};
      if(removed.length)report.removed[category]=removed;
    }
    for(const value of report.removed.pin||[])report.pinFiles[value]=before.pins.get(value);
    for(const category of allowanceCategories){const had=new Set(before.allowances[category]),grown=[...new Set(after.allowances[category])].filter(item=>!had.has(item));
      if(grown.length)report.grown[category]=grown;}
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
    // A removed check or a file with fewer checks checks less; a changed pin or a version raised further does not by
    // itself.
    // The oldest browser and Playwright are raised, never lowered (audit/lib/browser-environment.mjs): a lower one, or
    // none, accepts reports of older runs and checks less.
    const lowered=['browser','playwright'].filter(kind=>before.oldest[kind]!==null&&(after.oldest[kind]===null||olderRelease(after.oldest[kind],before.oldest[kind])))
      .map(kind=>'oldest-'+kind+':'+after.oldest[kind]);
    const less=[...Object.entries(report.removed).filter(([category])=>category!=='pin').flatMap(([category,ids])=>ids.map(id=>category+':'+id)),...report.weakened.map(w=>'fewer-checks:'+w.slice(0,w.indexOf(': '))),...lowered];
    // A grown allowance is recorded too, in the record's allowances; it may come with the product change it is for (the
    // finding it allows is there).
    const grown=Object.entries(report.grown).flatMap(([category,items])=>items.map(item=>category+':'+item));
    const items=[...less,...(report.removed.pin||[]).map(id=>'pin:'+id),...(report.version.beyondPatch?['version:'+after.version]:[])];
    const audited=auditChangeIssues(items,auditRecord(mergeBase),auditRecord(headCommit),grown);report.auditChanges=audited.recorded;report.auditChangeIssues=audited.issues;
    // A change that checks less is recorded only in a change of the audit alone: with src/, extensions/ or the product
    // changed as well, the owner would read the weaker audit and the code it lets through in one merge.
    if(productChanged||before.extensions!==after.extensions)for(const c of audited.recorded)if(less.includes(c.change))
      report.auditChangeIssues.push('the audit change '+c.change+' checks less, and this change also changes src/, extensions/ or the product: record it in a change of the audit alone');
    const release='audit/manifests/release-'+after.version+'.json';
    if(JSON.stringify(after.releases)!==JSON.stringify([release]))report.releaseIssues.push('exactly one release manifest, '+release+', must exist; found '+(after.releases.join(', ')||'none'));
  }catch(error){report.errors.push(error.message);}
  finally{if(ownDir)fs.rmSync(workDir,{recursive:true,force:true});}
  report.status=guardStatus(report);
  return report;
}

export function formatGuardReport(report){
  const lines=['### Audit change guard: '+report.status,'','Merge base `'+report.mergeBase+'` → head `'+report.head+'`'];
  if(report.guardCode)lines.push('Guard code: '+(report.guardCode.base?'the base\'s':report.guardCode.head?'the head\'s own (this run shows how the change judges itself; the run with the base\'s guard judges it)':'neither the base\'s nor the head\'s'));
  if(report.version)lines.push('Product version: '+report.version.base+' → '+report.version.head+(report.version.productChanged?' (product or src/ changed)':' (product and src/ unchanged)'));
  if(report.behaviour)lines.push('Behaviour: '+report.behaviour.differences.length+' of '+report.behaviour.cases+' specification worlds differ from the base product');
  for(const message of [...report.errors,...report.versionIssues,...report.releaseIssues,...report.behaviourIssues,...report.auditChangeIssues])lines.push('- '+message);
  const removed=Object.entries(report.removed),intended=report.behaviour?.intended??[],grown=Object.entries(report.grown||{});
  if(removed.length||grown.length||intended.length||report.weakened.length||report.version?.beyondPatch){
    lines.push('','For the owner to read before the merge:');
    const why=change=>{const r=report.auditChanges.find(c=>c.change===change);return r?': '+r.reason:'';};
    if(report.version?.beyondPatch)lines.push('- the product version '+report.version.head+' is raised past the next patch '+report.version.expected+why('version:'+report.version.head));
    for(const [category,ids] of removed)for(const id of ids)lines.push('- '+(category==='pin'?'changed or removed pin '+id+' ('+report.pinFiles[id].join(', ')+')':'removed '+category+' '+id)+why(category+':'+id));
    for(const [category,items] of grown)for(const item of items)lines.push('- a new '+category+' entry '+item+why(category+':'+item));
    for(const change of intended)lines.push('- changed behaviour of '+change.case+': '+change.reason);
    for(const file of report.weakened)lines.push('- fewer checks in '+file+why('fewer-checks:'+file.slice(0,file.indexOf(': '))));
  }
  return lines.join('\n');
}
