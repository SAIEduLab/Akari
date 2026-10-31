import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
// The pinned parser comes from NODE_PATH. It loads on the first script read, so the
// result validator below imports without it (evidence sealing and aggregation install no parser).
let parser;
const parse=text=>(parser??=require('@babel/parser')).parse(text,{sourceType:'unambiguous',allowReturnOutsideFunction:true,errorRecovery:false});

// Every tracked file under this scope must be reached from an audit entry point.
export const inventoryScope='audit/';
// Documentation roots. Other documents are reached through the links or repository paths of reached documents.
export const documentRoots=['AUDIT.md','audit/README.md'];
// Inventories list or describe files without using them: their paths never make a file reachable.
// An observer script still reaches the modules it imports.
export const inventoryObservers=['audit/public-files.json','audit/lib/audit-inventory-contract.mjs','audit/tests/audit-inventory.mjs'];
// The audit paths the public workflows name. Workflows are public only (PUBLIC_SYNC.json), so an internal checkout
// (it has the synchronization boundary and no workflow) reaches these as the workflows would. A public checkout's
// workflows must name exactly these, so the list cannot drift from them.
export const synchronizationBoundary='PUBLIC_SYNC.json';
export const publicWorkflowEntries=Object.freeze(['audit/browser/run-full-browser-audit.mjs','audit/install-codec-browser.py','audit/run-acceptance.mjs','audit/run-local-gate.mjs',
  'audit/tests/audio-codecs.mjs','audit/tests/block-field-width.mjs','audit/tests/change-guard.mjs','audit/tests/child-ux.mjs','audit/tests/work-authorization.mjs','audit/verify-evidence.mjs']);
// Loaders that compute a file name from a registry. Each mirrors the runtime code named by `runtime`,
// and the inventory fails when that runtime code no longer contains `signature`.
export const computedLoaders=[
  {source:'audit/browser/browser-audit-manifest.json',runtime:'audit/browser/run-full-browser-audit.mjs',signature:"script:path.join(casesDir,name+'.cjs')",
    targets:text=>Object.values(JSON.parse(text).groups).flat().map(task=>'audit/browser/cases/'+task.split(':')[0]+'.cjs')},
  {source:'audit/manifests/product-tests.json',runtime:'audit/lib/product-test-host.mjs',signature:"path.join(root,'audit/suites',name+'.js')",
    targets:text=>JSON.parse(text).suites.map(suite=>'audit/suites/'+suite.name+'.js')},
  {source:'audit/lib/product-path.cjs',runtime:'audit/lib/product-path.cjs',signature:"'audit/manifests/release-' + currentProductVersion() + '.json'",
    targets:(text,read)=>['audit/manifests/release-'+JSON.parse(read('audit/public-files.json')).productVersion+'.json']},
];
// Rejection controls run by audit/tests/audit-inventory.mjs. Inventory controls use a hand-written
// synthetic tree; report controls mutate a valid report. Each must be rejected for its own reason.
export const inventoryControlIds=[
  'valid-tree','orphan-file','orphan-chain','inventory-listing-only','comment-mention-only','data-names-code',
  'unlinked-document','document-names-script','removed-gate-step','removed-acceptance-command','removed-workflow-command',
  'internal-public-workflow-entries','internal-without-workflow-entries','public-workflow-entries-differ',
  'removed-browser-task','removed-suite','missing-release-manifest','changed-runtime-loader',
  'unparsable-script','unparsable-leaf','unreadable-leaf','missing-git-checkout',
  ...['schema','status','snapshot','unreachable','issues','empty-reached','duplicate-reached','outside-reached',
    'truncated-reached','extra-reached','missing-control','reordered-controls','failed-control','error'].map(id=>'report-rejects-'+id),
];
export const inventorySchema='akari-audit-inventory-v1';

const executable=file=>/\.(?:mjs|cjs|js|py)$/.test(file);
const workflow=file=>/^\.github\/workflows\/[^/]+\.ya?ml$/.test(file);
const posix=value=>path.posix.normalize(value.replaceAll('\\','/')).replace(/^\.\//,'').replace(/(.)\/$/,'$1');

function walk(node,visit){
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){for(const child of node)walk(child,visit);return;}
  if(typeof node.type==='string')visit(node);
  for(const [key,value]of Object.entries(node))if(!['loc','start','end','extra','comments','leadingComments','trailingComments','innerComments'].includes(key))walk(value,visit);
}
// String and template literals of code; comments never reach a file. With modulesOnly, only the
// specifiers of import, export-from, require() and import() count.
function scriptLiterals(text,{modulesOnly=false}={}){
  const literals=[];
  const specifier=node=>{if(node?.type==='StringLiteral')literals.push(node.value);};
  walk(parse(text),node=>{
    if(modulesOnly){
      if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type))specifier(node.source);
      else if(node.type==='CallExpression'&&(node.callee?.type==='Import'||node.callee?.name==='require'))specifier(node.arguments[0]);
      else if(node.type==='ImportExpression')specifier(node.source);
    }
    else if(node.type==='StringLiteral')literals.push(node.value);
    else if(node.type==='TemplateElement'&&typeof node.value?.cooked==='string')literals.push(node.value.cooked);
  });
  return literals;
}
function jsonLiterals(text){
  const literals=[];
  const visit=value=>{
    if(typeof value==='string')literals.push(value);
    else if(Array.isArray(value))value.forEach(visit);
    else if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){literals.push(key);visit(child);}
  };
  visit(JSON.parse(text));
  return literals;
}
const pythonLiterals=text=>[...text.matchAll(/'([^'\\\n]*(?:\\.[^'\\\n]*)*)'|"([^"\\\n]*(?:\\.[^"\\\n]*)*)"/g)].map(m=>m[1]??m[2]);
const markdownLinks=text=>[...text.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)].map(m=>m[1]);
const markdownPaths=text=>[...text.matchAll(/(?:^|[^\w./-])(audit\/[\w./-]+\.md)(?![\w/-])/g)].map(m=>m[1]);
const workflowPaths=text=>[...text.matchAll(/(?:^|[\s"'=])(audit\/[\w./-]+)/gm)].map(m=>m[1]);

function directoriesOf(files){
  const dirs=new Set(['']);
  for(const file of files){let dir=path.posix.dirname(file);while(dir!=='.'&&!dirs.has(dir)){dirs.add(dir);dir=path.posix.dirname(dir);}}
  return dirs;
}
const usable=value=>typeof value==='string'&&value.length>0&&value.length<=300&&!/[\n\0]/.test(value)&&!value.includes('://');

// A literal names a file when it is that file's path from the repository root, from the
// file that contains it, or from a directory whose path segments the same file also names.
function literalTargets(file,literals,files,dirs){
  const candidates=[...new Set(literals.filter(usable).map(literal=>literal.replaceAll('\\','/')))];
  const contexts=new Set(['',path.posix.dirname(file)]);
  for(let changed=true;changed;){
    changed=false;
    for(const literal of candidates)for(const context of [...contexts]){
      const dir=posix(path.posix.join(context,literal));
      if(dir!=='.'&&dirs.has(dir)&&!contexts.has(dir)){contexts.add(dir);changed=true;}
    }
  }
  const targets=new Set();
  for(const literal of candidates)for(const context of contexts){
    const target=posix(path.posix.join(context,literal));
    if(files.has(target))targets.add(target);
    else if(literal.startsWith('.')&&files.has(target+'.js'))targets.add(target+'.js');
  }
  return [...targets];
}

export function fileReferences(file,text,files,dirs=directoriesOf(files)){
  const observer=inventoryObservers.includes(file);
  if(/\.(?:mjs|cjs|js)$/.test(file))return literalTargets(file,scriptLiterals(text,{modulesOnly:observer}),files,dirs);
  if(observer)return [];
  if(file.endsWith('.py'))return literalTargets(file,pythonLiterals(text),files,dirs);
  // Data reaches the data and documents it names; code runs only from code, workflows, the gate or a computed loader.
  if(file.endsWith('.json'))return literalTargets(file,jsonLiterals(text),files,dirs).filter(target=>!executable(target));
  // Documents reach only the documents they link or name by repository path. Naming a script runs nothing.
  if(file.endsWith('.md'))return [...new Set([...markdownLinks(text).map(link=>posix(path.posix.join(path.posix.dirname(file),link))),...markdownPaths(text).map(posix)])]
    .filter(target=>target.endsWith('.md')&&files.has(target));
  if(workflow(file))return [...new Set(workflowPaths(text).map(posix))].filter(target=>files.has(target));
  return [];
}

export function entryPoints({files,steps,acceptance,workflowEntries}){
  const roots=[],add=(kind,file)=>{if(files.has(file))roots.push({kind,file});};
  for(const file of documentRoots)add('document',file);
  const workflows=[...files].filter(workflow);
  for(const file of workflows)add('workflow',file);
  if(workflowEntries&&!workflows.length&&files.has(synchronizationBoundary))for(const file of workflowEntries)add('workflow:public',file);
  for(const [id,...args]of steps)for(const arg of args)if(typeof arg==='string')add('gate:'+id,posix(arg));
  for(const [kind,commands]of Object.entries(acceptance))for(const command of commands)for(const token of command.split(/\s+/))add('acceptance:'+kind,posix(token.replace(/^"|"$/g,'')));
  return roots;
}

// Breadth-first reachability from the entry points over file references and computed loaders.
export function auditInventory({files,read,steps,acceptance,workflowEntries}){
  const tracked=new Set(files),dirs=directoriesOf(tracked),parent=new Map(),queue=[],issues=[];
  const visit=(file,from)=>{if(!parent.has(file)){parent.set(file,from);queue.push(file);}};
  for(const root of entryPoints({files:tracked,steps,acceptance,workflowEntries}))visit(root.file,root.kind);
  // A public checkout's workflows name exactly the declared entries (the internal checkout uses them in their place).
  const workflows=[...tracked].filter(workflow);
  if(workflowEntries&&workflows.length&&!tracked.has(synchronizationBoundary)){
    const named=new Set();
    for(const file of workflows){try{for(const target of fileReferences(file,read(file),tracked,dirs))if(target.startsWith(inventoryScope))named.add(target);}catch{}}
    const extra=[...named].filter(file=>!workflowEntries.includes(file)).sort(),missing=workflowEntries.filter(file=>!named.has(file));
    if(extra.length||missing.length)issues.push('the public workflow entries differ from the workflows; workflows name '+(extra.join(', ')||'nothing more')+' and no longer name '+(missing.join(', ')||'nothing'));
  }
  while(queue.length){
    const file=queue.shift();
    let text;
    try{text=read(file);}catch(error){issues.push(file+': unreadable: '+error.message);continue;}
    try{for(const target of fileReferences(file,text,tracked,dirs))visit(target,file);}
    catch(error){issues.push(file+': references could not be read: '+error.message);}
    for(const loader of computedLoaders){
      if(loader.runtime===file&&!text.includes(loader.signature))issues.push(file+': runtime loader changed; '+loader.source+' no longer matches '+loader.signature);
      if(loader.source===file){
        try{for(const target of loader.targets(text,read)){if(tracked.has(target))visit(target,file);else issues.push(file+': loads missing '+target);}}
        catch(error){issues.push(file+': computed loader failed: '+error.message);}
      }
    }
  }
  const scoped=[...tracked].filter(file=>file.startsWith(inventoryScope)).sort();
  return {scoped,unreachable:scoped.filter(file=>!parent.has(file)),issues,reachedFrom:Object.fromEntries(scoped.filter(file=>parent.has(file)).map(file=>[file,parent.get(file)]))};
}

export function assertAuditInventory(result){
  assert.deepEqual(result.issues,[],'audit inventory could not be read:\n'+result.issues.join('\n'));
  assert.deepEqual(result.unreachable,[],'tracked audit files unreachable from every audit entry point:\n'+result.unreachable.join('\n'));
  return result;
}

// The audit files of the publication inventory, which the publication check holds equal to the tracked tree.
export function inventoryAuditFiles(repositoryRoot=root){
  return JSON.parse(fs.readFileSync(path.join(repositoryRoot,'audit/public-files.json'),'utf8')).files.filter(file=>file.startsWith(inventoryScope)).sort();
}

// Parser-free validator for the gate result.
export function verifyAuditInventoryReport(report,inputs,auditFiles=inventoryAuditFiles()){
  assert.equal(report.schema,inventorySchema,'inventory schema');assert.equal(report.status,'PASS','inventory status');
  assert.deepEqual(report.snapshot,inputs,'inventory snapshot');
  assert.ok(!('error' in report),'failed inventory run');
  assert.deepEqual(report.unreachable,[],'unreachable audit files');assert.deepEqual(report.issues,[],'inventory issues');
  assert.ok(Array.isArray(report.reached)&&report.reached.length>0,'reached audit files');
  assert.equal(new Set(report.reached).size,report.reached.length,'duplicate reached file');
  assert.ok(report.reached.every(file=>typeof file==='string'&&file.startsWith(inventoryScope)),'reached file outside the audit scope');
  // The scan covered exactly the audit files of the snapshotted inventory: none missing, none added.
  assert.deepEqual(report.reached,[...auditFiles].sort(),'reached files differ from the audit inventory');
  assert.ok(Array.isArray(report.controls),'inventory controls');
  assert.deepEqual(report.controls.map(row=>row.id),inventoryControlIds,'inventory controls');
  for(const row of report.controls)assert.equal(row.status,'PASS','inventory control '+row.id);
  return {status:'PASS',reached:report.reached.length,controls:report.controls.length};
}
