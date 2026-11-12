import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Windows seconds per indivisible bundle, from the receipts of two CI runs, with the parts of the change guard's
// negative test (audit/lib/shard-plan.cjs) at 0.86 of their time on a second machine (the ratio of a CI run to that
// machine, 372 s to 433 s): s04 runs the designer alone (38 s, its receipt less the guard's cases);
// s05 is its receipt less 0.86 of 346 s and s08 less 0.86 of 68 s, the cases they ran; s07 runs the cases it ran; s10 is
// 0.86 of about 123 s and its warm-up.
// Setup is paid once for all bundles on a worker. Bundle IDs also name the sealed output directories.
export const auditSeconds={s01:467,s02:480,s03:426,s04:38,s05:216,s06:387,s07:478,s08:334,s09:417,s10:111,
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

// The audit and acceptance workers within the runner budget whose longest worker is shortest (then the most even).
export function planLanes(){
  let best;
  for(let audit=1;audit<=Object.keys(auditSeconds).length;audit++){
    for(let acceptance=1;acceptance<=Object.keys(acceptanceSeconds).length&&audit+acceptance<=runnerSlots;acceptance++){
      const a=pack(auditSeconds,audit),c=pack(acceptanceSeconds,acceptance);
      const times=[...a.map(b=>b.seconds+55),...c.map(b=>b.seconds+45)];
      const longest=Math.max(...times),squares=times.reduce((sum,t)=>sum+t*t,0);
      if(!best||longest<best.longest||(longest===best.longest&&squares<best.squares)){
        best={audit:a.map(b=>b.units.join('+')),acceptance:c.map(b=>b.units.join('+')),longest,squares};
      }
    }
  }
  assert.ok(best,'no allocation within the runner budget');
  return best;
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
    if(group==='acceptance')assert.equal(tryId,attempt,'an acceptance lane comes from the current attempt');
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

// The newest Stable Chrome for Testing and the newest Playwright, read once for a run by its plan: every lane and the
// job that merges their evidence install these two (a lane run again later takes them from the same plan), so the
// reports of one run name one browser and one Playwright.
export const releaseSources=Object.freeze({browser:'https://googlechromelabs.github.io/chrome-for-testing/LATEST_RELEASE_STABLE',playwright:'https://registry.npmjs.org/playwright/latest'});
export async function newestReleases(read=async url=>{const answer=await fetch(url);assert.ok(answer.ok,url+' answered '+answer.status);return answer.text();}){
  const browser=(await read(releaseSources.browser)).trim(),playwright=JSON.parse(await read(releaseSources.playwright)).version;
  assert.match(browser,/^\d+\.\d+\.\d+\.\d+$/,'the newest Stable Chrome for Testing is a release number');
  assert.match(String(playwright),/^\d+\.\d+\.\d+$/,'the newest Playwright is a release number');
  return {browser,playwright};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [mode,group,dir]=process.argv.slice(2);
  assert.ok(group==='audit'||group==='acceptance');
  if(mode==='unpack')unpackLanes(group,dir,process.env.GITHUB_RUN_ID,process.env.GITHUB_RUN_ATTEMPT);
  else{
    assert.equal(mode,'plan');
    const plan=planLanes();
    const releases=await newestReleases();
    fs.appendFileSync(process.env.GITHUB_OUTPUT,'lanes='+JSON.stringify(plan[group])+'\nbrowser='+releases.browser+'\nplaywright='+releases.playwright+'\n');
    console.log(JSON.stringify({audit:plan.audit,acceptance:plan.acceptance,...releases}));
  }
}
