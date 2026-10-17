import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [browser,output]=process.argv.slice(2);
if(!browser||!output)throw Error('browser and evidence directory are required');
fs.mkdirSync(output,{recursive:true});
const tasks=[['trigger','audit/tests/ux-phrase-trigger.mjs'],['speech','audit/tests/ux-phrase-speech.mjs'],['list','audit/tests/ux-phrase-list.mjs']];
const results=await Promise.all(tasks.map(([name,script])=>new Promise(resolve=>{
  const child=cp.spawn(process.execPath,[script,browser,path.join(output,'ux-phrase-'+name+'.json')],{stdio:'inherit'});
  child.on('error',error=>resolve({name,error:String(error),code:null}));
  child.on('close',(code,signal)=>resolve({name,code,signal}));
})));
if(results.some(result=>result.code!==0||result.signal)){
  console.error(JSON.stringify(results));process.exitCode=1;
}
