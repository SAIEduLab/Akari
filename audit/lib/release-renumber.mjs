// Renumbers a product branch after it has taken in its base. The version becomes the one the change guard
// expects against that base (one patch after it when the product or src/ changed, otherwise the base version),
// and every output that follows the version is rewritten or rebuilt from src/. Git state is the caller's:
// this takes nothing in, stages nothing and commits nothing.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {buildProduct} from '../../src/build.mjs';
import {nextPatch} from './change-guard.mjs';
import {validateProductMetadata} from './product-path.cjs';
import {productName,versionNumber,toolPrefix,isDocument} from './publication-contract.mjs';
import {planLanguageRelease,applyLanguageRelease,verifyLanguageRelease} from './language-release.mjs';

// The one form of the release label in src/; the product build and the release policy require it.
const releaseLabel=/^( {2}const PRODUCT_RELEASE = ')(\d+\.\d+\.\d+)(';)$/gm;
const productFileName=/^Akari_?\d+_\d+_\d+\.html$/;
const releaseRecord=/^audit\/manifests\/release-\d+\.\d+\.\d+\.json$/;
// Generated outputs are rebuilt whatever their merge state; every other file is resolved by hand first.
export const generatedOutput=file=>productFileName.test(file)||releaseRecord.test(file);
// Registries that copy the current release into one productVersion field (the static gate equates them).
export const versionRegistries=['audit/manifests/features.json','audit/manifests/language-form-coverage.json','audit/browser/browser-audit-manifest.json'];
const versionField=/"productVersion": "\d+\.\d+\.\d+"/g;
const conflictMarker=/^(?:<{7}|>{7})(?: |$)/m;
const fileFor=version=>'Akari_'+version.replaceAll('.','_')+'.html';
const mentions=(text,versions)=>[...text.matchAll(versionNumber)].filter(m=>versions.has(m[0])&&!toolPrefix.test(text.slice(Math.max(0,m.index-40),m.index)));

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
const listed=text=>[...new Set(text.split('\0').filter(Boolean))];

export function planReleaseRenumber(root,{base='origin/main'}={}){
  root=fs.realpathSync(root);
  const {run,git}=gitIn(root),full=file=>path.join(root,...file.split('/'));
  const exists=file=>fs.existsSync(full(file)),bytes=file=>fs.readFileSync(full(file)),read=file=>bytes(file).toString('utf8');
  const text=file=>exists(file)&&!bytes(file).includes(0);
  assert.ok(!exists('PUBLIC_SYNC.json'),'renumbering belongs to the public development repository; a private product changes only by an authorized synchronization');

  // The base must already be in the branch (merged, rebased, or in an unfinished merge).
  const resolved=run(['rev-parse','--verify','--quiet',base+'^{commit}']);
  assert.equal(resolved.status,0,'unknown base '+base);
  const baseCommit=resolved.stdout.toString('utf8').trim();
  const mergeHead=run(['rev-parse','--verify','--quiet','MERGE_HEAD']).stdout.toString('utf8').trim();
  const contained=['HEAD',...(mergeHead?[mergeHead]:[])].some(commit=>run(['merge-base','--is-ancestor',baseCommit,commit]).status===0);
  assert.ok(contained,'the branch does not contain '+base+' ('+baseCommit+'); take it in first (merge or rebase), then renumber');

  const tracked=listed(git(['ls-files','-z'])).filter(exists);
  const unmerged=listed(git(['ls-files','-u','-z']).split('\0').map(line=>line.slice(line.indexOf('\t')+1)).join('\0'));
  const unresolved=[...unmerged.filter(file=>!generatedOutput(file)),...tracked.filter(file=>!generatedOutput(file)&&!unmerged.includes(file)&&text(file)&&conflictMarker.test(read(file)))];
  assert.deepEqual(unresolved,[],'resolve these conflicts by hand first: '+unresolved.join(', '));

  const show=spec=>git(['show',spec],{buffer:true});
  const baseMeta=validateProductMetadata(JSON.parse(show(baseCommit+':audit/public-files.json').toString('utf8')));
  const baseVersion=baseMeta.productVersion;
  const sources=tracked.filter(file=>file.startsWith('src/'));
  const labelled=sources.filter(file=>[...read(file).matchAll(releaseLabel)].length);
  assert.equal(labelled.length,1,'one src/ file declares PRODUCT_RELEASE');
  const labelFile=labelled[0],labels=[...read(labelFile).matchAll(releaseLabel)];
  assert.equal(labels.length,1,labelFile+': one PRODUCT_RELEASE declaration');
  const previous=labels[0][2],relabel=(source,version)=>source.replace(releaseLabel,(_line,start,_label,end)=>start+version+end);

  // A product change is judged as the guard does: src/ or the product differs from the base at the base's label.
  const atBase=file=>file===labelFile?relabel(read(file),baseVersion):read(file);
  const baseSources=listed(git(['ls-tree','-r','-z','--name-only',baseCommit,'--','src']));
  const sourceChanged=baseSources.length!==sources.length||sources.some(file=>!baseSources.includes(file)||!Buffer.from(atBase(file)).equals(show(baseCommit+':'+file)));
  const builtAtBase=buildProduct({root,read:file=>sources.includes(file)?atBase(file):read(file)}).html;
  const productChanged=sourceChanged||!Buffer.from(builtAtBase).equals(show(baseCommit+':'+baseMeta.productFile));
  const version=productChanged?nextPatch(baseVersion):baseVersion,productFile=fileFor(version);

  const meta=JSON.parse(read('audit/public-files.json'));
  const retired=new Set([previous,baseVersion,meta.productVersion].filter(label=>label!==version));
  // Documents and the product name only the current release (publication contract), so their old labels follow.
  // Elsewhere a label may be data; lines this branch added that name its previous label are left to the author.
  if(previous!==version){
    const stale=[];let file=null;
    const diff=git(['-c','core.quotePath=false','diff','-U0','--no-color','--no-ext-diff','--no-renames',baseCommit,'--','.',':(exclude)src',':(exclude)*.md',':(exclude)*.html']);
    for(const line of diff.split('\n')){
      if(line.startsWith('+++ '))file=line==='+++ /dev/null'?null:line.slice(6);
      else if(file&&line.startsWith('+')&&!generatedOutput(file)&&!versionRegistries.includes(file)&&file!=='audit/public-files.json'&&mentions(line.slice(1),new Set([previous])).length)stale.push(file+': '+line.slice(1).trim());
    }
    assert.deepEqual(stale,[],'lines this branch added name its previous release '+previous+'; change them by hand to '+version+' or to wording without a release:\n'+stale.join('\n'));
  }

  const changes=new Map();
  const put=(file,after)=>{
    const before=exists(file)?bytes(file):null,next=after===null?null:Buffer.from(after);
    if(before===null&&next===null||before&&next&&before.equals(next))return;
    changes.set(file,{before,after:next});
  };
  const follow=source=>source
    .replace(versionNumber,(label,at,whole)=>retired.has(label)&&!toolPrefix.test(whole.slice(Math.max(0,at-40),at))?version:label)
    .replace(productName,name=>[...retired].some(label=>name===fileFor(label))?productFile:name);
  for(const file of tracked.filter(file=>(isDocument(file)||file.startsWith('src/'))&&!generatedOutput(file)&&text(file))){
    const next=follow(read(file));put(file,file===labelFile?relabel(next,version):next);
  }
  for(const file of versionRegistries.filter(file=>tracked.includes(file))){
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
  put('audit/public-files.json',JSON.stringify(meta,null,2)+'\n');
  const built=buildProduct({root,read:file=>changes.has(file)?changes.get(file).after.toString('utf8'):read(file)});
  assert.equal(built.file,productFile,'the rebuilt product carries the renumbered label');
  put(productFile,built.html);
  for(const file of fs.readdirSync(root).filter(name=>productFileName.test(name)&&name!==productFile))put(file,null);
  return {root,base:baseCommit,baseVersion,previous,version,productChanged,changes};
}

// Writes the plan, then the language release. A failure restores every file the run changed.
export function applyReleaseRenumber(plan){
  const {root,changes}=plan,full=file=>path.join(root,...file.split('/'));
  const now=file=>fs.existsSync(full(file))?fs.readFileSync(full(file)):null;
  for(const [file,{before}]of changes)assert.deepEqual(now(file),before,'renumber input changed: '+file);
  const restore=entries=>{for(const [file,{before}]of entries){if(before===null)fs.rmSync(full(file),{force:true});else {fs.mkdirSync(path.dirname(full(file)),{recursive:true});fs.writeFileSync(full(file),before);}}};
  let language=null;
  try{
    for(const [file,{after}]of [...changes].sort((a,b)=>Number(a[1].after===null)-Number(b[1].after===null))){
      if(after===null)fs.unlinkSync(full(file));else {fs.mkdirSync(path.dirname(full(file)),{recursive:true});fs.writeFileSync(full(file),after);}
    }
    language=planLanguageRelease(root);
    applyLanguageRelease(language);
    const meta=validateProductMetadata(JSON.parse(fs.readFileSync(full('audit/public-files.json'),'utf8')));
    assert.equal(meta.productVersion,plan.version,'renumbered publication inventory');
    assert.ok(Buffer.from(buildProduct({root}).html).equals(now(meta.productFile)),'the product equals the build from src/');
    verifyLanguageRelease(root);
  }catch(error){
    if(language)restore([...language.changes]);
    restore([...changes]);
    throw error;
  }
  return [...new Set([...changes.keys(),...language.changes.keys()])].sort();
}

export function renumberRelease(root,options={}){
  const plan=planReleaseRenumber(root,options);
  return {base:plan.base,baseVersion:plan.baseVersion,previous:plan.previous,version:plan.version,productChanged:plan.productChanged,changed:applyReleaseRenumber(plan)};
}
