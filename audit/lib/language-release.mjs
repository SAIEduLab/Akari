import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {languageFileForVersion,validateProductMetadata} from './product-path.cjs';

const languageName = /^LANGUAGE(?:_\d+_\d+_\d+)?\.md$/;
const releaseName = /^release-\d+\.\d+\.\d+\.json$/;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value,null,2)+'\n');
const document = file => file.endsWith('.md') || file==='index.html' || file==='MANUAL.html' || /^Manual\/[^/]+\.html$/.test(file);
const writable=(file,product,privateBoundary)=>file!==product&&!file.startsWith('src/')&&(!file.startsWith('extensions/')||file==='extensions/limits.md')&&(document(file)||file==='audit/public-files.json'||/^audit\/manifests\/(?:release-\d+\.\d+\.\d+|component-controls-traceability)\.json$/.test(file)||(privateBoundary&&file==='PUBLIC_SYNC.json'));

// Only actual relative links to the root specification are release paths. Comments,
// prose and fixture document identities do not need a release number.
export function languageLinks(file,text) {
  const rows=[];
  const add=(target,at)=>{
    if(/^[a-z][a-z0-9+.-]*:|^\/\//i.test(target))return;
    const bare=target.split(/[?#]/)[0];
    const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),bare));
    if(languageName.test(resolved))rows.push({target,bare,resolved,at});
  };
  for(const match of text.matchAll(/\]\(<?([^\s<>)]*LANGUAGE(?:_\d+_\d+_\d+)?\.md(?:[?#][^\s<>)]*)?)>?(?:\s+"[^"]*")?\)|\bhref\s*=\s*["']([^"']*LANGUAGE(?:_\d+_\d+_\d+)?\.md(?:[?#][^"']*)?)["']/g))add(match[1]??match[2],match.index);
  return rows;
}

function updateLinks(file,text,current) {
  const targets=new Set(languageLinks(file,text).map(row=>row.target));
  for(const target of targets){
    const next=target.replace(/LANGUAGE(?:_\d+_\d+_\d+)?\.md/,current);
    // Update actual links, retaining unlinked prose and fixture identities.
    text=text.replaceAll(']('+target+')',']('+next+')').replaceAll('](<'+target+'>)','](<'+next+'>)');
    text=text.replaceAll('href="'+target+'"','href="'+next+'"').replaceAll("href='"+target+"'","href='"+next+"'");
  }
  text=text.replace(/\[(`?)(LANGUAGE(?:_\d+_\d+_\d+)?\.md)\1\]\(([^)]+)\)/g,(all,quote,_name,target)=>languageLinks(file,all).some(row=>row.resolved===current)?'['+quote+current+quote+']('+target+')':all);
  text=text.replace(/(<a\b[^>]*\bhref\s*=\s*["'][^"']*["'][^>]*>)(LANGUAGE(?:_\d+_\d+_\d+)?\.md)(<\/a>)/g,(all,open,_name,close)=>languageLinks(file,all).some(row=>row.resolved===current)?open+current+close:all);
  return text;
}

function safeFile(root,relative) {
  assert.ok(typeof relative==='string'&&relative.length&&!path.isAbsolute(relative)&&!relative.includes('\\')&&!relative.split('/').some(p=>p==='..'||p==='.'||!p),'unsafe release path: '+relative);
  let current=root;
  for(const segment of relative.split('/')){
    current=path.join(current,segment);
    if(fs.existsSync(current))assert.ok(!fs.lstatSync(current).isSymbolicLink(),'release path is a symbolic link: '+relative);
  }
  return path.join(root,relative);
}

export function planLanguageRelease(root,{privateBoundary=false}={}) {
  root=fs.realpathSync(root);
  const read=relative=>fs.readFileSync(safeFile(root,relative));
  const meta=validateProductMetadata(JSON.parse(read('audit/public-files.json')));
  assert.equal(new Set(meta.files).size,meta.files.length,'duplicate publication paths');
  meta.files.forEach(file=>safeFile(root,file));
  const current=languageFileForVersion(meta.productVersion);
  const candidates=fs.readdirSync(root).filter(file=>languageName.test(file));
  assert.equal(candidates.length,1,'one source language document required');
  const old=candidates[0];
  assert.deepEqual(meta.files.filter(file=>languageName.test(file)),[old],'language source must be the published document');
  const product=read(meta.productFile);
  const label=product.toString().match(/\bconst PRODUCT_RELEASE = '(\d+\.\d+\.\d+)';/);
  assert.equal(label?.[1],meta.productVersion,'product bytes and release metadata disagree');
  const protectedHash=digest(product);
  const changes=new Map();
  const put=(file,after,mode)=>{
    const full=safeFile(root,file),before=fs.existsSync(full)?fs.readFileSync(full):null;
    assert.ok(writable(file,meta.productFile,privateBoundary),'protected or unsupported release output: '+file);
    const bytes=after===null?null:Buffer.isBuffer(after)?after:Buffer.from(after);
    if(before===null&&bytes===null||before&&bytes&&before.equals(bytes))return;
    changes.set(file,{before,after:bytes,mode:mode??(before?fs.statSync(full).mode&0o777:0o644)});
  };
  let language=read(old).toString();
  language=language.replace(/^# あかり \d+\.\d+\.\d+(?= —)/m,'# あかり '+meta.productVersion)
    .replace(/製品版は\d+\.\d+\.\d+です/g,'製品版は'+meta.productVersion+'です')
    .replace(/Akari_\d+_\d+_\d+\.html/g,meta.productFile);
  const mode=fs.statSync(safeFile(root,old)).mode&0o777;
  put(current,updateLinks(current,language,current),mode);
  if(old!==current)put(old,null);
  for(const file of meta.files.filter(file=>document(file)&&file!==old&&file!==current)){
    const text=read(file).toString();
    put(file,updateLinks(file,text,current));
  }
  const traceFile='audit/manifests/component-controls-traceability.json';
  if(meta.files.includes(traceFile)){
    const trace=JSON.parse(read(traceFile));
    for(const row of trace.uiContracts??[])if(languageName.test(row.specification?.path??''))row.specification.path=current;
    put(traceFile,json(trace));
  }
  if(privateBoundary){
    const boundary=JSON.parse(read('PUBLIC_SYNC.json'));
    assert.equal(boundary.product?.currentFile,meta.productFile,'synchronize the product before its language document');
    const allowed=boundary.shared.filter(file=>languageName.test(file));
    assert.equal(allowed.length,1,'one exact language synchronization path required');
    assert.ok(allowed[0]===old||allowed[0]===current,'language synchronization source differs');
    boundary.shared=boundary.shared.map(file=>languageName.test(file)?current:file);
    put('PUBLIC_SYNC.json',json(boundary));
  }
  const releases=fs.readdirSync(safeFile(root,'audit/manifests')).filter(file=>releaseName.test(file));
  assert.equal(releases.length,1,'one source distribution record required');
  const priorRelease='audit/manifests/'+releases[0],release='audit/manifests/release-'+meta.productVersion+'.json';
  assert.ok(meta.files.includes(priorRelease),'source distribution record must be published');
  if(priorRelease!==release)put(priorRelease,null);
  meta.files=meta.files.map(file=>file===old?current:file===priorRelease?release:file).sort();
  put('audit/public-files.json',json(meta));
  const content=file=>changes.has(file)?changes.get(file).after:read(file);
  for(const file of meta.files.filter(document)){
    for(const row of languageLinks(file,content(file).toString()))assert.equal(row.resolved,current,'unupdated language link in '+file);
  }
  const contract=JSON.parse(read('audit/manifests/features.json')).EXECUTABLE_CONTRACT;
  assert.deepEqual(Object.keys(contract).sort(),['languageContractId','programFormatVersion','projectFormatVersion','runtimeContractId']);
  for(const value of Object.values(contract))assert.ok(Number.isSafeInteger(value)&&value>0,'positive executable contract');
  const distributed=meta.files.filter(file=>file===meta.productFile||file===current||['LICENSE','EXTENSIONS.md','MANUAL.html'].includes(file)||file.startsWith('Manual/')||file.startsWith('extensions/'));
  const record={schema:'akari-distribution-v1',productVersion:meta.productVersion,languageContractId:contract.languageContractId,runtimeContractId:contract.runtimeContractId,projectFormat:contract.projectFormatVersion,programFormat:contract.programFormatVersion,files:Object.fromEntries(distributed.map(file=>[file,digest(content(file))]))};
  put(release,json(record));
  return {root,current,productFile:meta.productFile,protectedHash,privateBoundary,changes};
}

// A failed preflight changes nothing. A failed write restores the previous bytes
// and modes. Staging is temporary task data, not a migration history.
export function applyLanguageRelease(plan,{beforeWrite=()=>{}}={}) {
  const {root,changes}=plan;
  for(const file of changes.keys())assert.ok(writable(file,plan.productFile,plan.privateBoundary),'protected or unsupported release output: '+file);
  const readNow=file=>{const full=safeFile(root,file);return fs.existsSync(full)?fs.readFileSync(full):null;};
  for(const [file,{before}]of changes)assert.deepEqual(readNow(file),before,'release input changed: '+file);
  assert.equal(digest(readNow(plan.productFile)),plan.protectedHash,'product changed during release preflight');
  if(!changes.size)return [];
  const staging=fs.mkdtempSync(path.join(root,'.language-release-')),applied=[];
  let keepStaging=false;
  try{
    for(const [file,{before,mode}]of changes)if(before!==null){const backup=path.join(staging,'.backup',file);fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,before,{mode});}
    for(const [file,{after,mode}]of changes)if(after!==null){const staged=path.join(staging,file);fs.mkdirSync(path.dirname(staged),{recursive:true});fs.writeFileSync(staged,after,{mode});}
    const ordered=[...changes].sort((a,b)=>Number(a[1].after===null)-Number(b[1].after===null));
    for(const [file,{after}]of ordered){
      beforeWrite(file,applied.length);
      const full=safeFile(root,file);
      applied.push(file);
      if(after===null)fs.unlinkSync(full);
      else {fs.renameSync(path.join(staging,file),full);fs.chmodSync(full,changes.get(file).mode);}
    }
    assert.equal(digest(readNow(plan.productFile)),plan.protectedHash,'product changed during release preparation');
    return [...changes.keys()];
  }catch(error){
    const failures=[];
    for(const file of applied.reverse())try{
      const {before,mode}=changes.get(file),full=safeFile(root,file);
      if(before===null)fs.rmSync(full,{force:true});else {fs.writeFileSync(full,before);fs.chmodSync(full,mode);}
    }catch(restore){failures.push(file+': '+restore.message);}
    if(failures.length){keepStaging=true;error.message+='; rollback failed: '+failures.join(', ');error.recoveryDirectory=staging;throw error;}
    throw error;
  }finally{
    // Preserve the backup directory only if recovery itself failed.
    if(!keepStaging)fs.rmSync(staging,{recursive:true,force:true});
  }
}

export const prepareLanguageRelease=(root,options={})=>applyLanguageRelease(planLanguageRelease(root,options),options);
