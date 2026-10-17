import cp from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const [browser,output]=process.argv.slice(2);if(!browser||!output)throw Error('browser and evidence directory are required');fs.mkdirSync(output,{recursive:true});
const tasks=[['matrix','audit/tests/ux-normal-matrix.mjs'],['layout','audit/tests/ux-normal-layout.mjs'],['speech','audit/tests/ux-normal-speech.mjs']];
const results=await Promise.all(tasks.map(([name,script])=>new Promise(resolve=>{const child=cp.spawn(process.execPath,[script,browser,path.join(output,'ux-normal-'+name+'.json')],{stdio:'inherit'});child.on('error',error=>resolve({name,error:String(error),code:null}));child.on('close',(code,signal)=>resolve({name,code,signal}));})));
if(results.some(r=>r.code!==0||r.signal)){console.error(JSON.stringify(results));process.exitCode=1;}
