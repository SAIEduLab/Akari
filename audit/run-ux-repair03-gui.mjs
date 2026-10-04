import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [browser,output]=process.argv.slice(2);
if(!browser||!output)throw Error('browser and evidence directory are required');
fs.mkdirSync(output,{recursive:true});
const results=await Promise.all(['trigger','speech','list'].map(name=>new Promise(resolve=>{
  const child=cp.spawn(process.execPath,['audit/tests/ux-repair03-'+name+'.mjs',browser,path.join(output,'ux-repair03-'+name+'.json')],{stdio:'inherit'});
  child.on('error',error=>resolve({name,error:String(error),code:null}));
  child.on('close',(code,signal)=>resolve({name,code,signal}));
})));
if(results.some(result=>result.code!==0||result.signal)){
  console.error(JSON.stringify(results));process.exitCode=1;
}
