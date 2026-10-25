import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {languageFileForVersion,validateProductMetadata} from './product-path.cjs';

const languageName = /^LANGUAGE(?:_\d+_\d+_\d+)?\.md$/;
const releaseName = /^release-\d+\.\d+\.\d+\.json$/;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value,null,2)+'\n');
const document = file => file.endsWith('.md') || file==='index.html' || file==='MANUAL.html' || /^Manual\/[^/]+\.html$/.test(file);
const writable=(file,product,privateBoundary)=>file!==product&&!file.startsWith('src/')&&(!file.startsWith('extensions/')||file==='extensions/limits.md')&&(document(file)||file==='audit/public-files.json'||/^audit\/manifests\/(?:release-\d+\.\d+\.\d+|component-controls-traceability)\.json$/.test(file)||(privateBoundary&&file==='PUBLIC_SYNC.json'));

// Only actual relative links to the root specification are release paths. Comments,
// prose and fixture document identities do not need a release number.
const require=createRequire(import.meta.url);
let markdownParser,htmlParser;
const offsets=node=>[node.position.start.offset,node.position.end.offset];

function relativeLanguage(file,url) {
  if(/^[a-z][a-z0-9+.-]*:|^\/\//i.test(url))return null;
  const bare=url.split(/[?#]/)[0];let decoded;
  try{decoded=decodeURIComponent(bare);}catch{return null;}
  if(decoded.startsWith('/'))return null;
  const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),decoded));
  if(!languageName.test(resolved))return null;
  return {resolved,prefix:decoded.slice(0,decoded.lastIndexOf('/')+1),suffix:url.slice(bare.length)};
}

function destination(text,offset) {
  let start=offset;
  if(text[start]==='<'){const end=text.indexOf('>',start+1);assert.ok(end>=0,'unterminated parsed destination');return {start:start+1,end,angle:true};}
  let end=start,depth=0;
  for(;end<text.length;end++){
    const char=text[end];
    if(char==='\\'){end++;continue;}
    if(/\s/.test(char))break;
    if(char==='(')depth++;
    if(char===')'){if(!depth)break;depth--;}
  }
  return {start,end,angle:false};
}

export function languageLinks(file,text) {
  const rows=[],htmlRanges=[],rawTextRanges=[];
  const add=(url,span,kind,at,extra={})=>{
    const relative=relativeLanguage(file,url);if(!relative)return;
    rows.push({...relative,...span,...extra,url,target:text.slice(span.start,span.end),kind,at});
  };
  if(file.endsWith('.md')){
    const tree=(markdownParser??=require('mdast-util-from-markdown').fromMarkdown)(text);
    const walk=node=>{
      if(node.type==='html')htmlRanges.push(offsets(node));
      if(node.type==='link'&&relativeLanguage(file,node.url)){
        const close=node.children.at(-1)?.position.end.offset??node.position.start.offset+1;
        const opening=/^\]\(\s*/.exec(text.slice(close,node.position.end.offset));
        assert.ok(opening,'parsed link destination position');
        add(node.url,destination(text,close+opening[0].length),'markdown',close);
      }
      if(node.type==='definition'&&relativeLanguage(file,node.url)){
        const [start,end]=offsets(node),opening=/^ {0,3}\[(?:\\.|[^\]\\])*\]:\s*/.exec(text.slice(start,end));
        assert.ok(opening,'parsed definition destination position');
        add(node.url,destination(text,start+opening[0].length),'reference',start);
      }
      for(const child of node.children??[])walk(child);
    };
    walk(tree);
  }else htmlRanges.push([0,text.length]);
  // Only HTML nodes emitted by the Markdown parser enter HTML parsing. Code,
  // text, reference labels and attribute-like prose never become markup.
  if(htmlRanges.length){
    const visible=text.split('');
    let cursor=0;
    for(const [start,end]of htmlRanges.sort((a,b)=>a[0]-b[0])){for(;cursor<start;cursor++)if(visible[cursor]!=='\n')visible[cursor]=' ';cursor=Math.max(cursor,end);}
    for(;cursor<visible.length;cursor++)if(visible[cursor]!=='\n')visible[cursor]=' ';
    const fragment=(htmlParser??=require('parse5').parseFragment)(visible.join(''),{sourceCodeLocationInfo:true});
    const walk=node=>{
      if(['script','style','textarea','title','xmp','iframe','noembed','noframes','plaintext'].includes(node.tagName)&&node.sourceCodeLocation?.startTag)rawTextRanges.push([node.sourceCodeLocation.startTag.endOffset,node.sourceCodeLocation.endTag?.startOffset??node.sourceCodeLocation.endOffset]);
      for(const attribute of node.attrs??[])if(attribute.name==='href'&&['a','area','link','base'].includes(node.tagName)){
        const key=attribute.prefix?attribute.prefix+':href':'href';
        const location=node.sourceCodeLocation?.attrs?.[key];if(!location)continue;
        const raw=text.slice(location.startOffset,location.endOffset);
        const opening=/^[^\s=]+\s*=\s*(["']?)/.exec(raw);if(!opening)continue;
        const start=location.startOffset+opening[0].length,end=location.endOffset-(opening[1]?1:0);
        const extra={};
        if(node.tagName==='a'){
          const after=node.sourceCodeLocation.startTag.endOffset,label=/^(LANGUAGE(?:_\d+_\d+_\d+)?\.md)(?=<\/a>)/i.exec(text.slice(after));
          if(label){extra.labelStart=after;extra.labelEnd=after+label[1].length;}
        }
        add(attribute.value,{start,end},'html',location.startOffset,extra);
      }
      for(const child of node.childNodes??[])walk(child);
      if(node.content)walk(node.content);
    };
    walk(fragment);
  }
  return rows.filter(row=>row.kind==='html'||!rawTextRanges.some(([start,end])=>row.start>=start&&row.start<end));
}

function updateLinks(file,text,current) {
  const edits=[];
  for(const row of languageLinks(file,text)){
    let next=encodeURI(row.prefix+current)+row.suffix;
    next=next.replace(/&/g,'&amp;').replace(/[<>"'\s]/g,char=>encodeURIComponent(char));
    if(row.kind!=='html'&&!row.angle)next=next.replace(/[\\()]/g,char=>'\\'+char);
    edits.push({start:row.start,end:row.end,next});
    if(row.kind==='markdown'){
      const label=/\[(`?)(LANGUAGE(?:_\d+_\d+_\d+)?\.md)\1$/.exec(text.slice(0,row.at));
      if(label){const start=row.at-label[0].length+1+label[1].length;edits.push({start,end:start+label[2].length,next:current});}
    }
    if(row.labelStart!==undefined)edits.push({start:row.labelStart,end:row.labelEnd,next:current});
  }
  for(const edit of edits.sort((a,b)=>b.start-a.start))text=text.slice(0,edit.start)+edit.next+text.slice(edit.end);
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

export function verifyLanguageRelease(root,options={}) {
  const plan=planLanguageRelease(root,options);
  assert.equal(plan.changes.size,0,'stale language release outputs: '+[...plan.changes.keys()].join(', '));
  return plan.current;
}

export const prepareLanguageRelease=(root,options={})=>applyLanguageRelease(planLanguageRelease(root,options),options);
