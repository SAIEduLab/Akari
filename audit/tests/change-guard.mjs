// Pull-request entry: node audit/tests/change-guard.mjs <baseSha> <headSha> <report.json> runs the whole guard. In CI the
// guard runs in parts side by side (audit/lib/shard-plan.cjs changeGuardParts):
//   --part <main|m1..> <baseSha> <headSha> <part.json>   the main part (every check but the mutants) or one share of the mutants
//   --merge <parts dir> <baseSha> <headSha> <report.json> the verdict of the parts, the same as the whole guard's
// What fails nothing but the owner reads before the merge is listed in the report (formatGuardReport).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {changeGuard,guardMutantPart,mergeGuardParts,formatGuardReport} from '../lib/change-guard.mjs';
import {changeGuardParts} from '../lib/shard-plan.cjs';
const mode=process.argv[2]?.startsWith('--')?process.argv[2]:null,[name,base,head,output]=mode?process.argv.slice(3):[null,...process.argv.slice(2)];
assert.ok(base&&head&&output&&(!mode||name),'usage: change-guard.mjs [--part <part> | --merge <parts dir>] <baseSha> <headSha> <report.json>');
assert.ok([null,'--part','--merge'].includes(mode),'unknown mode '+mode);
const repo=path.resolve(import.meta.dirname,'../..'),count=changeGuardParts.length-1,attempt=Number(process.env.GITHUB_RUN_ATTEMPT||1);
const write=report=>{fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');};
if(mode==='--part'){
  assert.ok(changeGuardParts.includes(name),'the change guard has no part '+name+' (parts: '+changeGuardParts.join(', ')+')');
  const report=name==='main'?await changeGuard({repo,base,head,part:'main'}):await guardMutantPart({repo,base,head,index:Number(name.slice(1)),count});
  write({...report,attempt});
  if(name==='main'&&process.env.GITHUB_OUTPUT){
    const shards=changeGuardParts.slice(1,1+(report.mutation?.mutants??0));
    fs.appendFileSync(process.env.GITHUB_OUTPUT,'shards='+JSON.stringify(shards)+'\n');
  }
  console.log('Change guard part '+name+': '+(report.errors.length?report.errors.join('; '):name==='main'?'checked, '+(report.mutation?.mutants??0)+' mutants planned':report.ran.length+' of '+report.mutants+' mutants run, '+report.survivors.length+' survive'));
  if(report.errors.length)process.exitCode=1;
}else{
  const parts=[];
  if(mode==='--merge'){
    // A rerun keeps the parts of the earlier attempts: each part counts in its newest attempt only.
    const walk=dir=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):e.name==='part.json'?[path.join(dir,e.name)]:[]):[];
    const read=walk(name).map(file=>JSON.parse(fs.readFileSync(file,'utf8'))),newest=new Map();
    for(const part of read)newest.set(part.part,Math.max(newest.get(part.part)??0,part.attempt));
    parts.push(...read.filter(part=>part.attempt===newest.get(part.part)).map(({attempt:_,...part})=>part));
  }
  const jobResults=process.env.GITHUB_ACTIONS==='true'&&mode==='--merge'
    ?{plan:process.env.AKARI_GUARD_PLAN_RESULT,parts:process.env.AKARI_GUARD_PARTS_RESULT}:undefined;
  const report=mode==='--merge'?mergeGuardParts({repo,base,head,parts,count,jobResults}):await changeGuard({repo,base,head});
  write(report);
  const summary=formatGuardReport(report);
  console.log(summary);
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary+'\n');
  if(report.status!=='PASS')process.exitCode=1;
}
