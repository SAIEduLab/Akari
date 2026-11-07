import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Windows seconds per indivisible bundle, from the receipts of runs 42003097192 and 42003096921.
// Setup is paid once for all bundles on a worker. Bundle IDs also name the sealed output directories.
export const auditSeconds={s01:467,s02:480,s03:426,s04:410,s05:514,s06:387,s07:478,s08:392,s09:417,
  b01:477,b02:536,b03:518,b04:484,b05:499,b06:484,b07:521,audio:48};
export const acceptanceSeconds={c01:519,c02:510,c03:322,editing:310};
export const runnerSlots=20;

// Longest bundles first; each goes to the worker with the least assigned time, including earlier bundles.
function pack(seconds,count){
  const bins=Array.from({length:count},()=>({units:[],seconds:0}));
  for(const [unit,time] of Object.entries(seconds).sort((a,b)=>b[1]-a[1])){
    const bin=bins.reduce((best,next)=>next.seconds<best.seconds?next:best);
    bin.units.push(unit);bin.seconds+=time;
  }
  return bins;
}

export function planLanes(lines,guardCopies=1){
  assert.ok(Number.isSafeInteger(lines)&&lines>=0);
  assert.ok(guardCopies===1||guardCopies===2);
  // Run 41966888731 spent about 11,000 worker-seconds actually testing mutants for 341 new code lines.
  // This estimate only assigns runners. The guard independently discovers and executes the full actual plan.
  const guardSeconds=lines*32;
  let best;
  for(let audit=1;audit<=Object.keys(auditSeconds).length;audit++){
    for(let acceptance=1;acceptance<=Object.keys(acceptanceSeconds).length;acceptance++){
      const remaining=runnerSlots-audit-acceptance,guard=remaining/guardCopies;
      if(!Number.isInteger(guard)||guard<0||(guard>0)!==(lines>0))continue;
      const a=pack(auditSeconds,audit),c=pack(acceptanceSeconds,acceptance);
      const times=[...a.map(b=>b.seconds+55),...c.map(b=>b.seconds+45),
        ...Array.from({length:remaining},()=>guardSeconds/guard+65)];
      const longest=Math.max(...times),squares=times.reduce((sum,t)=>sum+t*t,0);
      if(!best||longest<best.longest||(longest===best.longest&&squares<best.squares)){
        best={audit:a.map(b=>b.units.join('+')),acceptance:c.map(b=>b.units.join('+')),guard,longest,squares};
      }
    }
  }
  assert.ok(best,'no allocation within the runner budget');
  return best;
}

export function planForCommits(repo,base,head){
  const git=args=>cp.execFileSync('git',['-C',repo,...args],{encoding:'utf8',maxBuffer:128*1024*1024});
  const range=base+'...'+head,mergeBase=git(['merge-base',base,head]).trim();
  // The changed lines of the product's script apart from spacing, as the change guard reads them
  // (audit/lib/change-guard.mjs changedScriptLines reads them by their tokens; this estimate needs no parser).
  const product=commit=>git(['rev-parse','--verify','--quiet',commit+':'+JSON.parse(git(['show',commit+':audit/public-files.json'])).productFile]).trim();
  const before=product(mergeBase),after=product(head);
  const diff=before===after?'':git(['diff','--no-color','--no-ext-diff','--ignore-all-space','-U0',before,after]);
  const html=before===after?'':git(['cat-file','-p',after]),lineAt=offset=>html.slice(0,offset).split('\n').length;
  const first=lineAt(html.indexOf('<script>')+'<script>'.length),last=lineAt(html.lastIndexOf('</script>'));
  const removed=new Set(),added=[];
  let at=0,inHunk=false;
  for(const row of diff.split('\n')){
    const hunk=row.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);if(hunk){at=Number(hunk[1]);inHunk=true;continue;}
    if(!inHunk)continue;
    if(row.startsWith('-'))removed.add(row.slice(1).trim());
    else if(row.startsWith('+')){const here=at++;if(here>=first&&here<=last)added.push(row.slice(1).trim());}
  }
  const code=added.filter(s=>s&&!/^(?:\/\/|\/\*|\*)/.test(s)&&!removed.has(s));
  const copies=git(['diff','--name-only',range,'--','.github/workflows/akari-change-guard.yml']).trim()?2:1;
  return planLanes(Math.max(code.length,added.length?1:0),copies);
}

export function laneUnits(group,lane){
  const weights=group==='audit'?auditSeconds:acceptanceSeconds;
  assert.ok(group==='audit'||group==='acceptance','unknown worker group');
  const units=lane.split('+');
  assert.ok(units.length&&new Set(units).size===units.length&&units.every(u=>Object.hasOwn(weights,u)),'unknown or duplicate work: '+lane);
  return units;
}
export function bundleKind(unit){
  if(unit==='audio')return 'audio-codecs-win32';
  if(unit==='editing')return 'ux-editing';
  if(unit.startsWith('s'))return 'selftest-'+unit;
  if(unit.startsWith('b'))return 'full-browser-'+unit;
  return 'fixed-acceptance-'+unit;
}

// Uploads keep logical bundles separate. Restore the original artifact layout before running the existing validators.
// Each lane must supply its own complete set, including the attempt suffix. Never overwrite another lane's evidence.
export function unpackLanes(group,root,run,attempt){
  assert.match(run,/^[1-9]\d*$/);assert.match(attempt,/^[1-9]\d*$/);
  const prefix='akari-'+group+'-lane-';
  const seen=new Set(),moves=[];
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
    if(!entry.name.startsWith(prefix))continue;
    assert.ok(entry.isDirectory()&&!entry.isSymbolicLink());
    const parts=entry.name.slice(prefix.length).split('-');
    assert.equal(parts.length,3);const [lane,runId,tryId]=parts;
    assert.equal(runId,run);assert.match(tryId,/^[1-9]\d*$/);assert.ok(Number(tryId)<=Number(attempt));
    if(group==='acceptance')assert.equal(tryId,attempt);
    const dir=path.join(root,entry.name),expected=laneUnits(group,lane).map(bundleKind).sort();
    const contents=fs.readdirSync(dir,{withFileTypes:true});
    assert.deepEqual(contents.map(e=>e.name).sort(),expected,'incomplete lane '+lane);
    for(const e of contents){
      assert.ok(e.isDirectory()&&!e.isSymbolicLink());
      const dest=path.join(root,'akari-'+e.name+'-'+runId+'-'+tryId);
      assert.ok(!seen.has(dest)&&!fs.existsSync(dest),'duplicate lane evidence '+dest);
      seen.add(dest);moves.push([path.join(dir,e.name),dest]);
    }
  }
  assert.ok(moves.length,'no lane evidence');
  for(const [src,dest] of moves)fs.renameSync(src,dest);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [mode,group,dir]=process.argv.slice(2);
  assert.ok(group==='audit'||group==='acceptance');
  if(mode==='unpack')unpackLanes(group,dir,process.env.GITHUB_RUN_ID,process.env.GITHUB_RUN_ATTEMPT);
  else{
    assert.equal(mode,'plan');
    const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
    const pr=event.pull_request;
    const plan=pr?planForCommits('.',pr.base.sha,pr.head.sha):planLanes(0);
    fs.appendFileSync(process.env.GITHUB_OUTPUT,'lanes='+JSON.stringify(plan[group])+'\n');
    console.log(JSON.stringify({audit:plan.audit,acceptance:plan.acceptance,mutationWorkersPerGuard:plan.guard}));
  }
}
