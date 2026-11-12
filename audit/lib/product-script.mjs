// The product script as src/build.mjs builds it, read back into the source modules it comes from: the pieces the
// checks of the product source (selftest product-source) and the map from files to the tests that run them
// (audit/test-map.mjs) use. Also the functions the exported player embeds through toString(), and the size of the
// source files.
import {createRequire} from 'node:module';
import {buildProduct, portableExtensions} from '../../src/build.mjs';

const require=createRequire(import.meta.url);
let parser;
const parse=text=>(parser??=require('@babel/parser')).parse(text,{sourceType:'script',errorRecovery:false});

// The product script as src/build.mjs builds it from the files `read` gives: {text, pieces, lines, built}. A piece is
// a run of lines from one file ({label, start, end}, offsets in text; extension: true for a portable extension, the
// fork developers' interface); lines[i] is {file, line}, the source line of line i + 1 of the script.
export function productScript(read, list) {
  const built=buildProduct({read,...(list?{list}:{})});
  const {script:text,scriptLines:lines}=built,pieces=[];
  let at=0;
  for(const where of lines){
    const end=text.indexOf('\n',at)+1||text.length,last=pieces.at(-1);
    if(last&&last.label===where.file)last.end=end;
    else pieces.push({label:where.file,start:at,end,...(portableExtensions.includes(where.file)?{extension:true}:{})});
    at=end;
  }
  if(at!==text.length)throw new Error('the build maps '+lines.length+' lines, not the whole script');
  return {text,pieces,lines,built};
}

// [file, line] for each offset of the script, by the files' own line numbers.
export function lineMap({text,lines}) {
  const starts=[0];
  for(let i=0;i<text.length;i++)if(text[i]==='\n')starts.push(i+1);
  return offset=>{
    if(offset<0||offset>=text.length)return null;
    let lo=0,hi=starts.length-1;
    while(lo<hi){const mid=(lo+hi+1)>>1;if(starts[mid]<=offset)lo=mid;else hi=mid-1;}
    const where=lines[lo];
    return where?[where.file,where.line]:null;
  };
}

// The functions the exported player embeds through toString() (PORTABLE_FUNCTIONS, src/build.mjs): {name, file, text},
// the text as the product's closure declares the function at its top level, in the list's order.
export function embeddedSources(script) {
  const {text,built}=script,closure=parse(text).program.body[0]?.expression?.callee?.body?.body;
  if(!Array.isArray(closure))throw new Error('the product script is not one closure');
  return built.portableFunctions.map(({name,file})=>{
    const found=closure.filter(s=>s.type==='FunctionDeclaration'&&s.id?.name===name);
    if(found.length!==1)throw new Error('the product closure declares '+name+' '+found.length+' times at its top level');
    return {name,file,text:text.slice(found[0].start,found[0].end)};
  });
}

// The longest a source file may be (AUDIT.md「ソースの境界」): a time to split it, not the reading limit of any LLM.
export const SOURCE_SIZE_LINES=2000;
// {file, lines} for each file.
export const sourceSizes=(read,files)=>files.map(file=>{const text=read(file);return {file,lines:text.split('\n').length-(text.endsWith('\n')?1:0)};});
