import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {snapshot as inputSnapshot} from '../lib/product-test-host.mjs';
import {verifyBrowserGroup} from '../lib/verify-browser-results.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const legacy=path.join(here,'legacy');
const args=process.argv.slice(2);
const value=(flag,def='')=>{const i=args.indexOf(flag);return i>=0?args[i+1]:def;};
const product=value('--product','Akari.html');
const audit=value('--audit','AUDIT.md');
const manifestPath=value('--manifest',path.join(here,'browser-audit-manifest.json'));
const evidence=path.resolve(root,value('--evidence','audit-evidence/full-browser'));
const group=value('--group','all');
const before=inputSnapshot(product);
const config=JSON.parse(fs.readFileSync(path.resolve(root,manifestPath),'utf8'));
if(group!=='all'&&!Object.hasOwn(config.groups,group))throw new Error('Unknown browser audit group: '+group);
for(const p of [product,audit,manifestPath])if(!fs.existsSync(path.resolve(root,p)))throw new Error('Missing audit input: '+p);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const run=(cmd,a,opts={})=>{
  const r=cp.spawnSync(cmd,a,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024,...opts});
  if(r.error)throw r.error;
  return r;
};
if(fs.existsSync(evidence))throw new Error('Evidence directory already exists; choose a fresh output path: '+evidence);
fs.mkdirSync(evidence,{recursive:true});
const prep=run(process.env.AKARI_PYTHON||'python3',[path.join(legacy,'prepare-media.py')],{timeout:120000});
fs.writeFileSync(path.join(evidence,'prepare-media.log'),(prep.stdout||'')+'\n'+(prep.stderr||''));
if(prep.status!==0){
  const detail=((prep.stdout||'')+'\n'+(prep.stderr||'')).trim();
  if(detail)process.stderr.write(detail+'\n');
  throw new Error('Media fixture preparation failed');
}

const candidate=path.join(evidence,'candidate');
fs.mkdirSync(candidate,{recursive:true});
const tracked=run('git',['ls-files','-z']).stdout.split('\0').filter(Boolean);
const files=[];
for(const rel of tracked){
  const src=path.join(root,rel),dst=path.join(candidate,rel);
  fs.mkdirSync(path.dirname(dst),{recursive:true});
  const bytes=fs.readFileSync(src);fs.writeFileSync(dst,bytes);
  files.push({path:rel,bytes:bytes.length,sha256:sha(bytes)});
}
const baselineMap=[
  ['audit/fixtures/1.0.0/source/Akari.html','baseline/Akari.html'],
  ['audit/fixtures/1.0.0/source/AUDIT.md','baseline/AUDIT.md'],
  ['audit/fixtures/1.0.0/source/LANGUAGE.md','baseline/LANGUAGE.md'],
  ['audit/fixtures/1.0.0/source/.github/workflows/akari-audit.yml','baseline/.github/workflows/akari-audit.yml'],
];
for(const [srcRel,dstRel] of baselineMap){
  const src=path.join(root,srcRel),dst=path.join(candidate,dstRel);
  fs.mkdirSync(path.dirname(dst),{recursive:true});
  const bytes=fs.readFileSync(src);fs.writeFileSync(dst,bytes);
  files.push({path:dstRel,gitRef:config.fixedBaseline,bytes:bytes.length,sha256:sha(bytes)});
}
fs.cpSync(legacy,path.join(candidate,'runner'),{recursive:true,filter:s=>!s.includes(path.sep+'media'+path.sep)});
if(fs.existsSync(path.join(legacy,'media')))fs.cpSync(path.join(legacy,'media'),path.join(candidate,'media'),{recursive:true});
const head=run('git',['rev-parse','HEAD']).stdout.trim();
const generatedMedia=['fixture-manifest.json','picture.jpg','picture.png','picture.webp','silence.mp3','tone.wav'];
const runnerFiles=generatedMedia.map(name=>({path:'audit/browser/legacy/media/'+name,snapshotPath:'media/'+name,
  sha256:sha(fs.readFileSync(path.join(legacy,'media',name)))}));
const snapshot={
  provenanceVersion:1,
  capturedAt:new Date().toISOString(),head,baseline:config.fixedBaseline,main:config.fixedBaseline,
  candidate:product,files,runnerFiles,auditContract:audit,runnerProvenance:config.runnerProvenance
};
fs.writeFileSync(path.join(candidate,'manifest.json'),JSON.stringify(snapshot,null,2));

const task=(name,a=[candidate])=>({name,args:a,script:path.join(legacy,name+'.cjs')});
const ui=name=>task(name,[path.join(candidate,product),path.join(evidence,name)]);
const groups={
  session:['browser-session','browser-storage-media','browser-events','browser-event-traces','browser-condition','browser-runtime','browser-boundaries'].map(n=>task(n)),
  ui:['ui-interactions','ui-compact-menu','ui-shell','ui-stage-gesture','ui-compact-routes'].map(ui)
    .concat(task('workbench-matrix'),task('workbench-direct'),task('run-editor-regression',[path.join(candidate,product),candidate]),task('browser-owner-delete')),
  limits:['browser-design-limits','browser-runtime-limits','browser-product','browser-asset-limits'].map(n=>task(n))
    .concat(task('browser-media-boundaries',[path.join(candidate,product),path.join(evidence,'media-boundaries')])),
  schemas:[task('schema-shards')],
  extra:[task('parent-qa',[path.join(candidate,product),path.join(evidence,'parent-qa.json')]),
    task('perf-input',[candidate,'keyboard-insert','16666']),task('perf-input',[candidate,'clipboard-paste','16666']),
    task('modern-browser'),task('long-regression')]
};
const selected=group==='all'?Object.values(groups).flat():groups[group];
for(const [name,tasks] of Object.entries(groups))assert.deepEqual(tasks.map(t=>t.name+(t.name==='perf-input'?':'+t.args[1]:'')),config.groups[name],'manifest/runner divergence '+name);
const records=[];
for(const item of selected){
  const started=new Date().toISOString();
  const timeout=['schema-shards','modern-browser'].includes(item.name)?1800000:600000;
  // Native tab activation is required by the trusted window-blur check.
  // Keep this suite headed; never substitute a synthetic blur or headless fallback.
  const headed=item.name==='ui-stage-gesture'&&process.platform==='linux';
  const r=run(headed?'xvfb-run':process.execPath,headed?['-a',process.execPath,item.script,...item.args]:[item.script,...item.args],{timeout});
  const log=item.name+(item.name==='perf-input'?'-'+item.args[1]:'')+'.log';
  fs.writeFileSync(path.join(evidence,log),(r.stdout||'')+'\n'+(r.stderr||''));
  records.push({task:item.name+(item.name==='perf-input'?':'+item.args[1]:''),name:item.name,args:item.args.map(x=>path.relative(root,x)||x),status:r.status,signal:r.signal,started,finished:new Date().toISOString(),log});
  if(r.status!==0)process.stderr.write(((r.stdout||'')+'\n'+(r.stderr||'')).slice(-6000));
}
const summary={head,group,runnerProvenance:config.runnerProvenance,records,passed:records.filter(r=>r.status===0).length,failed:records.filter(r=>r.status!==0).length};
fs.writeFileSync(path.join(evidence,'summary.json'),JSON.stringify(summary,null,2));
assert.deepEqual(inputSnapshot(product),before,'inputs changed during browser run');
if(!summary.failed)verifyBrowserGroup(evidence,group,before);
console.log(JSON.stringify(summary,null,2));
if(summary.failed)process.exitCode=1;
