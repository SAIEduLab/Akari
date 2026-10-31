// Renumbers a product branch after it has merged its base. The version becomes the one the change guard
// expects against that base (one patch after it when the product or src/ changed, otherwise the base version),
// and every output that follows the version is rewritten or rebuilt from src/. Git state is the caller's:
// this merges nothing, stages nothing and commits nothing.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {buildProduct} from '../../src/build.mjs';
import {nextPatch,versionAfter} from './change-guard.mjs';
import {validateProductMetadata} from './product-path.cjs';
import {productName,versionNumber,toolPrefix,isDocument,releaseNameViolations} from './publication-contract.mjs';
import {planLanguageRelease,applyLanguageRelease,verifyLanguageRelease} from './language-release.mjs';

// The one form of the release label in src/; the product build and the release policy require it.
const releaseLabel=/^( {2}const PRODUCT_RELEASE = ')(\d+\.\d+\.\d+)(';)$/gm;
const productFileName=/^Akari_?\d+_\d+_\d+\.html$/;
const releaseRecord=/^audit\/manifests\/release-\d+\.\d+\.\d+\.json$/;
// Generated outputs are rebuilt whatever their merge state; every other file is resolved by hand first.
export const generatedOutput=file=>productFileName.test(file)||releaseRecord.test(file);
// Registries that copy the current release into one productVersion field (the static gate equates them).
export const versionRegistries=['audit/manifests/features.json','audit/manifests/language-form-coverage.json','audit/browser/browser-audit-manifest.json'];
const inventory='audit/public-files.json';
const versionField=/"productVersion": "\d+\.\d+\.\d+"/g;
const recordedVersion=/^[+-]\s*"productVersion": "(\d+\.\d+\.\d+)"/gm;
const conflictMarker=/^(?:<{7}|>{7})(?: |$)/m;
const stagingPrefix='.release-renumber-';
const fileFor=version=>'Akari_'+version.replaceAll('.','_')+'.html';
const labelsIn=(text,versions)=>[...text.matchAll(versionNumber)].filter(m=>versions.has(m[0])&&!toolPrefix.test(text.slice(Math.max(0,m.index-40),m.index)));

function gitIn(root){
  // Repository variables from the caller's environment would point git at another tree.
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR)$/.test(key)));
  const run=args=>{
    const r=cp.spawnSync('git',['-C',root,...args],{env,maxBuffer:1024*1024*1024});
    assert.ok(!r.error,'git '+args.join(' ')+' failed: '+r.error?.message);
    return r;
  };
  const git=(args,{buffer=false}={})=>{
    const r=run(args);
    assert.equal(r.status,0,'git '+args.join(' ')+' failed: '+r.stderr.toString('utf8').trim());
    return buffer?r.stdout:r.stdout.toString('utf8');
  };
  return {run,git};
}
// A refusal lists what the author must fix, in plain words.
const refuse=(items,message)=>{if(items.length)throw new Error(message);};
const listed=text=>[...new Set(text.split('\0').filter(Boolean))];

// The files the next commit holds: tracked and untracked ones that are not ignored.
function checkoutFiles(root,git){
  const exists=file=>fs.existsSync(path.join(root,...file.split('/')));
  return [...new Set([...listed(git(['ls-files','-z'])),...listed(git(['ls-files','-z','--others','--exclude-standard']))])].filter(exists).sort();
}

export function planReleaseRenumber(root,{base='origin/main'}={}){
  root=fs.realpathSync(root);
  const {run,git}=gitIn(root),full=file=>path.join(root,...file.split('/'));
  const exists=file=>fs.existsSync(full(file)),bytes=file=>fs.readFileSync(full(file)),read=file=>bytes(file).toString('utf8');
  const text=file=>exists(file)&&!bytes(file).includes(0);
  const top=git(['rev-parse','--show-toplevel']).trim();
  assert.equal(fs.realpathSync(top),root,'run from the repository root '+top);
  assert.ok(!exists('PUBLIC_SYNC.json'),'renumbering belongs to the public development repository; a private product changes only by an authorized synchronization');
  const gitPath=name=>path.resolve(root,git(['rev-parse','--git-path',name]).trim());
  // A rebase replays each commit against outputs renumbered at an earlier stop, so the base comes in by a merge.
  assert.ok(!['rebase-merge','rebase-apply'].some(name=>fs.existsSync(gitPath(name))),'a rebase is in progress; take the base in with a merge, then renumber');

  // The base must already be in the branch (merged, or in an unfinished merge).
  const resolved=run(['rev-parse','--verify','--quiet',base+'^{commit}']);
  assert.equal(resolved.status,0,'unknown base '+base);
  const baseCommit=resolved.stdout.toString('utf8').trim();
  const mergeHead=run(['rev-parse','--verify','--quiet','MERGE_HEAD']).stdout.toString('utf8').trim();
  const contained=['HEAD',...(mergeHead?[mergeHead]:[])].some(commit=>run(['merge-base','--is-ancestor',baseCommit,commit]).status===0);
  assert.ok(contained,'the branch does not contain '+base+' ('+baseCommit+'); merge it first, then renumber');

  const files=checkoutFiles(root,git);
  const leftover=files.filter(file=>file.startsWith(stagingPrefix));
  refuse(leftover,'an earlier renumber left its recovery files; restore from them or remove them first: '+leftover.join(', '));
  const unmerged=listed(git(['ls-files','-u','-z']).split('\0').map(line=>line.slice(line.indexOf('\t')+1)).join('\0'));
  const unresolved=[...unmerged.filter(file=>!generatedOutput(file)),...files.filter(file=>!generatedOutput(file)&&!unmerged.includes(file)&&text(file)&&conflictMarker.test(read(file)))];
  refuse(unresolved,'resolve these conflicts by hand first: '+unresolved.join(', '));
  // Git keeps both language documents when the two sides renamed it differently, without a conflict.
  const languages=files.filter(file=>/^LANGUAGE(?:_\d+_\d+_\d+)?\.md$/.test(file));
  assert.equal(languages.length,1,'merge the language documents into one by hand first: '+languages.join(', '));

  const show=spec=>git(['show',spec],{buffer:true});
  const baseMeta=validateProductMetadata(JSON.parse(show(baseCommit+':'+inventory).toString('utf8')));
  const baseVersion=baseMeta.productVersion;
  const sources=files.filter(file=>file.startsWith('src/'));
  const labelled=sources.filter(file=>[...read(file).matchAll(releaseLabel)].length);
  assert.equal(labelled.length,1,'one src/ file declares PRODUCT_RELEASE');
  const labelFile=labelled[0],labels=[...read(labelFile).matchAll(releaseLabel)];
  assert.equal(labels.length,1,labelFile+': one PRODUCT_RELEASE declaration');
  const previous=labels[0][2],relabel=(source,version)=>source.replace(releaseLabel,(_line,start,_label,end)=>start+version+end);

  // A product change is judged as the guard does: src/ or the product differs from the base at the base's label.
  const atBase=file=>file===labelFile?Buffer.from(relabel(read(file),baseVersion)):bytes(file);
  const baseSources=listed(git(['ls-tree','-r','-z','--name-only',baseCommit,'--','src']));
  const sourceChanged=baseSources.length!==sources.length||sources.some(file=>!baseSources.includes(file)||!atBase(file).equals(show(baseCommit+':'+file)));
  const builtAtBase=buildProduct({root,read:file=>sources.includes(file)?atBase(file).toString('utf8'):read(file)}).html;
  const productChanged=sourceChanged||!Buffer.from(builtAtBase).equals(show(baseCommit+':'+baseMeta.productFile));
  const version=productChanged?nextPatch(baseVersion):baseVersion,productFile=fileFor(version);
  // Renumbering never lowers the branch: a raise other than one patch is the owner's decision (label).
  assert.ok(!versionAfter(previous,version),'the branch names '+previous+', above '+version+'; a raise other than one patch is the owner\'s decision (label), so renumber it by hand');

  // Every label the branch carried or set since it left the base, the base's, and the inventory's are retired.
  const meta=JSON.parse(read(inventory));
  const history=git(['log','-p','--no-color','--no-ext-diff','--format=',baseCommit+'..HEAD','--',inventory]);
  const retired=new Set([previous,baseVersion,meta.productVersion,...[...history.matchAll(recordedVersion)].map(m=>m[1])].filter(label=>label!==version));
  // Documents and the product name only the current release (publication contract), so their old labels follow.
  // Elsewhere a label may be data: lines this branch added that name a retired label are left to the author.
  const outside=file=>!isDocument(file)&&!file.startsWith('src/')&&!generatedOutput(file)&&!versionRegistries.includes(file)&&file!==inventory;
  const stale=[];
  if(retired.size){
    const diff=git(['-c','core.quotePath=false','-c','diff.noprefix=false','diff','--no-color','--no-ext-diff','--no-textconv','--no-renames','-U0','--src-prefix=a/','--dst-prefix=b/',baseCommit,'--','.',':(exclude)src',':(exclude)*.md',':(exclude)*.html']);
    let file=null,header=false;
    for(const line of diff.split('\n')){
      if(line.startsWith('diff --git ')){header=true;file=null;continue;}
      if(header){if(line.startsWith('+++ '))file=line==='+++ /dev/null'?null:line.slice(6);if(line.startsWith('@@'))header=false;continue;}
      if(file&&outside(file)&&line.startsWith('+')&&labelsIn(line.slice(1),retired).length)stale.push(file+': '+line.slice(1).trim());
    }
    const untracked=new Set(listed(git(['ls-files','-z','--others','--exclude-standard'])));
    for(const file of files.filter(file=>untracked.has(file)&&outside(file)&&text(file)))
      for(const line of read(file).split('\n'))if(labelsIn(line,retired).length)stale.push(file+': '+line.trim());
  }
  refuse(stale,'lines this branch added name an earlier release ('+[...retired].join(', ')+'); change them by hand to '+version+' or to wording without a release:\n'+stale.join('\n'));

  const changes=new Map();
  const put=(file,after)=>{
    const before=exists(file)?bytes(file):null,next=after===null?null:Buffer.from(after);
    if(before===null&&next===null||before&&next&&before.equals(next))return;
    changes.set(file,{before,after:next});
  };
  const follow=source=>source
    .replace(versionNumber,(label,at,whole)=>retired.has(label)&&!toolPrefix.test(whole.slice(Math.max(0,at-40),at))?version:label)
    .replace(productName,name=>[...retired].some(label=>name===fileFor(label))?productFile:name);
  for(const file of files.filter(file=>(isDocument(file)||file.startsWith('src/'))&&!generatedOutput(file)&&text(file))){
    const source=read(file),next=file===labelFile?relabel(follow(source),version):follow(source);
    if(next!==source)put(file,next);
  }
  for(const file of versionRegistries.filter(file=>files.includes(file))){
    const source=read(file);
    assert.equal((source.match(versionField)||[]).length,1,file+': one productVersion field');
    put(file,source.replace(versionField,'"productVersion": "'+version+'"'));
  }
  // The release record is regenerated by the language release from a placeholder of the current name.
  const record='audit/manifests/release-'+version+'.json';
  for(const file of fs.readdirSync(full('audit/manifests')).map(name=>'audit/manifests/'+name).filter(file=>releaseRecord.test(file)&&file!==record))put(file,null);
  if(!exists(record))put(record,'{}\n');
  meta.productVersion=version;meta.productFile=productFile;
  meta.files=[...new Set(meta.files.map(file=>productFileName.test(file)?productFile:releaseRecord.test(file)?record:file))].sort();
  put(inventory,JSON.stringify(meta,null,2)+'\n');
  const built=buildProduct({root,read:file=>changes.has(file)?changes.get(file).after.toString('utf8'):read(file)});
  assert.equal(built.file,productFile,'the rebuilt product carries the renumbered label');
  put(productFile,built.html);
  // Only the current product may stay at the root; any other product file there is a stale output.
  for(const file of fs.readdirSync(root).filter(name=>productFileName.test(name)&&name!==productFile))put(file,null);
  return {root,base:baseCommit,baseVersion,previous,version,productChanged,changes};
}

// Writes the plan through a staging directory with backups, then the language release, then checks the result
// the way the gate does. A failure restores every file the run changed; if restoring fails, the backups stay.
export function applyReleaseRenumber(plan){
  const {root,changes}=plan,full=file=>path.join(root,...file.split('/'));
  const now=file=>fs.existsSync(full(file))?fs.readFileSync(full(file)):null;
  for(const [file,{before}]of changes)assert.deepEqual(now(file),before,'renumber input changed: '+file);
  const staging=fs.mkdtempSync(path.join(root,stagingPrefix)),applied=[];
  const place=(from,file)=>{fs.mkdirSync(path.dirname(full(file)),{recursive:true});fs.renameSync(from,full(file));};
  const copy=(file,bytes,dir)=>{const target=path.join(staging,dir,...file.split('/'));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);return target;};
  let language=null,languageApplied=false,keepStaging=false;
  try{
    for(const [file,{before,after}]of changes){if(before!==null)copy(file,before,'backup');if(after!==null)copy(file,after,'next');}
    for(const [file,{after}]of [...changes].sort((a,b)=>Number(a[1].after===null)-Number(b[1].after===null))){
      applied.push(file);
      if(after===null)fs.unlinkSync(full(file));else place(path.join(staging,'next',...file.split('/')),file);
    }
    language=planLanguageRelease(root);
    applyLanguageRelease(language);languageApplied=true;
    const {git}=gitIn(root);
    const meta=validateProductMetadata(JSON.parse(fs.readFileSync(full(inventory),'utf8')));
    assert.equal(meta.productVersion,plan.version,'renumbered publication inventory');
    assert.ok(Buffer.from(buildProduct({root}).html).equals(now(meta.productFile)),'the product equals the build from src/');
    verifyLanguageRelease(root);
    const documents=checkoutFiles(root,git).filter(file=>isDocument(file)&&!file.startsWith(stagingPrefix));
    const violations=documents.flatMap(file=>releaseNameViolations(file,fs.readFileSync(full(file),'utf8'),{productFile:meta.productFile,productVersion:meta.productVersion}));
    refuse(violations,'documents still name another product file or release; fix them by hand:\n'+violations.map(v=>v.file+':'+v.line+' '+v.found).join('\n'));
  }catch(error){
    const failures=[];
    const attempt=(file,fn)=>{try{fn();}catch(restore){failures.push(file+': '+restore.message);}};
    if(languageApplied)for(const [file,{before}]of language.changes)attempt(file,()=>{if(before===null)fs.rmSync(full(file),{force:true});else {fs.mkdirSync(path.dirname(full(file)),{recursive:true});fs.writeFileSync(full(file),before);}});
    for(const file of applied.reverse())attempt(file,()=>{
      const {before}=changes.get(file);
      if(before===null)fs.rmSync(full(file),{force:true});else {fs.mkdirSync(path.dirname(full(file)),{recursive:true});fs.copyFileSync(path.join(staging,'backup',...file.split('/')),full(file));}
    });
    if(failures.length){keepStaging=true;error.message+='; restoring failed: '+failures.join(', ')+'; the previous files are in '+staging;error.recoveryDirectory=staging;}
    throw error;
  }finally{
    if(!keepStaging)fs.rmSync(staging,{recursive:true,force:true});
  }
  return [...new Set([...changes.keys(),...language.changes.keys()])].sort();
}

export function renumberRelease(root,options={}){
  const plan=planReleaseRenumber(root,options);
  return {base:plan.base,baseVersion:plan.baseVersion,previous:plan.previous,version:plan.version,productChanged:plan.productChanged,changed:applyReleaseRenumber(plan)};
}
