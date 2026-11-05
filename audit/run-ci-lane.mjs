import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {bundleKind,laneUnits} from './lib/ci-lanes.mjs';

export function workForUnit(unit,env){
  const kind=bundleKind(unit);
  if(unit==='editing'||unit.startsWith('c')){
    const editing=unit==='editing';
    return {dir:'audit-evidence/'+(editing?'editing':'acceptance'),
      commands:[editing?['audit/run-acceptance.mjs','editing']:['audit/run-acceptance.mjs','composition','--shard',unit]]};
  }
  const dir='audit-evidence/'+(unit==='audio'?'audio':kind);
  let commands;
  if(unit==='audio')commands=[
    ['audit/tests/audio-codecs.mjs',env.AKARI_CODEC_BROWSER,dir+'/report.json'],
    ['audit/tests/block-field-width.mjs',env.AKARI_CODEC_BROWSER,dir+'/block-field-width.json']];
  else if(unit.startsWith('s'))commands=[['audit/run-local-gate.mjs','--shard',unit,env.AKARI_BROWSER,dir]];
  else commands=[['audit/browser/run-full-browser-audit.mjs','--shard',unit,'--evidence',dir]];
  commands.push(['audit/verify-evidence.mjs','seal',kind,dir]);
  return {dir,commands};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [group,lane]=process.argv.slice(2),units=laneUnits(group,lane);
  const out=path.resolve('audit-evidence/ci-lane');
  assert.ok(!fs.existsSync(out),'fresh lane output required');
  fs.mkdirSync(out,{recursive:true});
  for(const unit of units){
    const {dir,commands}=workForUnit(unit,process.env);
    assert.ok(!fs.existsSync(dir),'fresh suite output required: '+dir);
    console.log('::group::'+unit);
    try{
      for(const args of commands){
        const child=cp.spawnSync(process.execPath,args,{stdio:'inherit'});
        if(child.error)console.error(child.error.message);
        if(child.status!==0||child.signal)process.exitCode=1;
      }
    }finally{
      if(fs.existsSync(dir))fs.renameSync(dir,path.join(out,bundleKind(unit)));
      console.log('::endgroup::');
    }
  }
}
