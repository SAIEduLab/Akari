// The product script as src/build.mjs assembles it, read back into the source files it comes from: the pieces the
// checks of the product source (selftest product-source) and the map from files to the tests that run them
// (audit/test-map.mjs) use. Also the functions the exported player embeds through toString(), and the size of the
// source files.
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
let parser;
const parse=text=>(parser??=require('@babel/parser')).parse(text,{sourceType:'script',errorRecovery:false});

const includeLine=/^<!-- @include (js\/[a-z0-9._-]+) -->$/;
const portableLine=/^\/\/ @portable (extensions\/[a-z0-9._-]+\.js)$/;
// The product script as src/build.mjs assembles it, with the source of every character (and, for a portable extension,
// the file that embeds it).
export function productScript(read){
  const pieces=[];let text='';
  const add=(label,part,host)=>{pieces.push({label,start:text.length,end:text.length+part.length,...(host?{host}:{})});text+=part;};
  for(const line of read('src/akari.html').split('\n')){
    const include=line.match(includeLine);if(!include)continue;
    const file='src/'+include[1];
    let chunk='';
    for(const row of read(file).replace(/\n$/,'').split('\n')){
      const portable=row.match(portableLine);
      if(!portable){chunk+=row+'\n';continue;}
      if(chunk){add(file,chunk);chunk='';}
      const body=read(portable[1]).replace(/\n$/,'');
      add(portable[1],body.slice(0,body.lastIndexOf('\n')+1),file);
    }
    if(chunk)add(file,chunk);
  }
  return {text,pieces};
}

// [file, line] for each offset of the joined script, by the files' own line numbers (a portable line counts in its host).
export function lineMap(text, pieces) {
  const next = {}, starts = [];
  for (const p of pieces) {
    if (p.host) { starts.push([p, 1]); next[p.host] = (next[p.host] ?? 1) + 1; continue; }
    const first = next[p.label] ?? 1;
    starts.push([p, first]);
    next[p.label] = first + text.slice(p.start, p.end).split('\n').length - 1;
  }
  return offset => {
    const entry = starts.find(([p]) => p.start <= offset && offset < p.end);
    if (!entry) return null;
    const [p, first] = entry;
    let line = first; for (let i = p.start; i < offset; i++) if (text[i] === '\n') line++;
    return [p.label, line];
  };
}

// Functions the exported player embeds through toString(): it runs them without the editor's closure.
export const embeddedFunctions=Object.freeze(['createAkariProfiles','createAkariExtensionHost','createAkariRuntime','createAkariStageView','mountAkariPlayer']);
// The text of each embedded function, as the product's closure declares it at its top level.
export function embeddedSources(read){
  const {text}=productScript(read),closure=parse(text).program.body[0]?.expression?.callee?.body?.body;
  if(!Array.isArray(closure))throw new Error('the product script is not one closure');
  return Object.fromEntries(embeddedFunctions.map(name=>{
    const found=closure.filter(s=>s.type==='FunctionDeclaration'&&s.id?.name===name);
    if(found.length!==1)throw new Error('the product closure declares '+name+' '+found.length+' times at its top level');
    return [name,text.slice(found[0].start,found[0].end)];
  }));
}

// The longest a source file may be (AUDIT.md「ソースの境界」): a time to split it, not the reading limit of any LLM.
export const SOURCE_SIZE_LINES=2000;
// {file, lines} for each file.
export const sourceSizes=(read,files)=>files.map(file=>{const text=read(file);return {file,lines:text.split('\n').length-(text.endsWith('\n')?1:0)};});
