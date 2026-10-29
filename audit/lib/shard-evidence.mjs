// Shard evidence: the check each CI shard seals, and the merge the final aggregates run before the
// unchanged full validators. A merge accepts exactly the planned shards, each planned step or task
// once (a split one in exactly its declared parts), one producer per evidence file, and the same
// inputs everywhere; anything else is rejected rather than repaired.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {inputInventory} from './input-snapshot.cjs';
import {currentProductFile} from './product-path.cjs';
import {sha} from './product-test-host.mjs';
import {gateSteps} from './gate-contract.mjs';
import {browserIds} from './entry-workshop-contract.mjs';
import {browserContract,verifyBrowserReport,verifyBrowserGroup} from './verify-browser-results.mjs';
import {verifyGateResults} from './verify-gate-results.mjs';
import {selftestShards,selftestAfterMerge,browserShards,acceptanceShards,acceptanceAfterMerge,splits,parseUnit,partItems,verifyPartCoverage} from './shard-plan.cjs';

export const partLog=(id,part)=>id+'@'+part.replace(/[^A-Za-z0-9.-]/g,'-')+'.log';
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
// The current schema rows in the order the schema processes take them (row i goes to process i % 2).
const schemaIds=()=>createRequire(import.meta.url)('./block-schema-contract.cjs').currentInputs().schemaIds;
export function treeFiles(dir,prefix=''){
  return fs.readdirSync(path.join(dir,prefix),{withFileTypes:true}).flatMap(e=>{
    assert.ok(!e.isSymbolicLink(),'symbolic link in evidence: '+prefix+e.name);
    return e.isDirectory()?treeFiles(dir,prefix+e.name+'/'):[prefix+e.name];
  }).sort();
}
const planOf=(plan,shard,label)=>{assert.ok(Object.hasOwn(plan,shard),'unknown '+label+' shard '+shard);return plan[shard].map(parseUnit);};
function sameShardSet(dirs,plan,label){assert.deepEqual(Object.keys(dirs).sort(),Object.keys(plan).sort(),label+' shards: missing, extra or duplicate');}

// Split-suite part reports. Each part names its suite, its part and the items it ran; the items
// are exactly the part's assignment, and only a complete set of parts is merged.
const browserSpec=task=>{const spec=browserContract().entries.find(e=>e.task===task);assert.ok(spec,'browser result spec '+task);return spec;};
const modernContexts=()=>[1366,768,390].flatMap(width=>['code','blocks'].map(mode=>width+'/'+mode));
const splitReports={
  'entry-browser':{
    file:'entry-browser.json',
    check(r,part,inputs){
      assert.equal(r.schema,'akari-entry-workshop-v1');assert.equal(r.kind,'browser');assert.equal(r.status,'PASS');assert.deepEqual(r.snapshot,inputs);
      assert.deepEqual(r.results.map(x=>x.id),partItems('entry-browser',browserIds,part),'entry-browser part rows');
      for(const row of r.results)assert.equal(row.status,'PASS',row.id);
      assert.deepEqual(r.pageErrors,[]);assert.deepEqual(r.networkRequests,[]);
    },
    merge(parts){
      const [first]=parts,keys=Object.keys(first.report).filter(k=>!['part','results','pageErrors','networkRequests','artifacts','command','startedAt'].includes(k));
      for(const {report} of parts)for(const k of keys)assert.deepEqual(report[k],first.report[k],'entry-browser parts differ in '+k);
      const byId=new Map(parts.flatMap(p=>p.report.results.map(row=>[row.id,row]))),paths=new Set();
      const artifacts=parts.flatMap(p=>p.report.artifacts).map(a=>{assert.ok(!paths.has(a.path),'artifact from two parts: '+a.path);paths.add(a.path);return a;}).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
      return {...Object.fromEntries(keys.map(k=>[k,first.report[k]])),command:first.report.command,startedAt:parts.map(p=>p.report.startedAt).sort()[0],
        results:browserIds.filter(id=>byId.has(id)).map(id=>byId.get(id)),pageErrors:parts.flatMap(p=>p.report.pageErrors),networkRequests:parts.flatMap(p=>p.report.networkRequests),artifacts,
        parts:parts.map(p=>({part:p.part,command:p.report.command,startedAt:p.report.startedAt}))};
    },
  },
  'schema-shards':{
    file:'candidate/browser-schemas.json',
    check(r,part){
      assert.deepEqual(r.part.items,partItems('schema-shards',schemaIds(),part),'schema part rows are its process rows');
      assert.equal(r.part.items.length,r.results.length);assert.deepEqual([...r.results.map(x=>x.id)].sort(),[...r.part.items].sort(),'schema part rows');
      assert.equal(r.complete,true);assert.equal(r.shards.length,1);const [s]=r.shards;assert.equal(s.exit,0);assert.equal(s.expected,s.actual);assert.deepEqual(s.pageErrors,[]);assert.deepEqual(s.networkRequests,[]);
      for(const row of r.results)assert.equal(row.pass,true,row.id);
    },
    merge(parts){
      const [first]=parts;
      for(const {report} of parts){assert.deepEqual(withoutCapture(report.manifest),withoutCapture(first.report.manifest),'schema parts ran other inputs');assert.equal(report.expected,first.report.expected);assert.deepEqual(report.schemaContract,first.report.schemaContract);}
      const results=parts.flatMap(p=>p.report.results),ids=parts.flatMap(p=>p.report.part.items);
      verifyPartCoverage('schema-shards',schemaIds(),Object.fromEntries(parts.map(p=>[p.part,p.report.part.items])));
      const complete=results.length===ids.length&&ids.length===first.report.expected&&new Set(results.map(r=>r.id)).size===ids.length&&ids.every(id=>results.some(r=>r.id===id));
      return {manifest:first.report.manifest,expected:first.report.expected,complete,schemaContract:first.report.schemaContract,results,shards:parts.flatMap(p=>p.report.shards),parts:parts.map(p=>({part:p.part,capturedAt:p.report.manifest.capturedAt}))};
    },
  },
  'modern-browser':{
    file:'candidate/modern-browser.json',
    check(r,part){
      const contexts=partItems('modern-browser',modernContexts(),part);
      assert.deepEqual(r.part.items,contexts,'modern-browser part contexts');
      const keys=browserSpec('modern-browser').keys.filter(k=>contexts.includes(k.split('/').slice(1).join('/'))),got=r.results.map(x=>x.id+'/'+x.viewport.width+'/'+x.mode);
      assert.deepEqual([...got].sort(),[...keys].sort(),'modern-browser part cases');for(const row of r.results)assert.equal(row.pass,true,row.id);
      assert.deepEqual(r.errors,[]);assert.deepEqual(r.network,[]);
    },
    merge(parts){
      const [first]=parts;
      for(const {report} of parts){assert.deepEqual(withoutCapture(report.manifest),withoutCapture(first.report.manifest),'modern-browser parts ran other inputs');assert.equal(report.browser,first.report.browser);}
      verifyPartCoverage('modern-browser',modernContexts(),Object.fromEntries(parts.map(p=>[p.part,p.report.part.items])));
      const order=modernContexts(),rank=row=>order.indexOf(row.viewport.width+'/'+row.mode);
      const results=parts.flatMap(p=>p.report.results).map((row,i)=>[row,i]).sort((a,b)=>rank(a[0])-rank(b[0])||a[1]-b[1]).map(([row])=>row);
      return {manifest:first.report.manifest,browser:first.report.browser,results,errors:parts.flatMap(p=>p.report.errors),network:parts.flatMap(p=>p.report.network),parts:parts.map(p=>({part:p.part,capturedAt:p.report.manifest.capturedAt}))};
    },
  },
};
const withoutCapture=manifest=>{const {capturedAt,...rest}=manifest||{};return rest;};
function checkPartReport(name,report,part,inputs){
  const spec=splitReports[name];assert.ok(spec,'no part report for '+name);
  assert.deepEqual(report.part&&{name:report.part.name,part:report.part.part},{name,part},name+' part identity');
  spec.check(report,part,inputs);
}
export function mergePartReports(name,parts){
  const spec=splitReports[name];
  assert.deepEqual(parts.map(p=>p.part),[...splits[name].parts],name+' parts');
  if(name==='entry-browser')verifyPartCoverage('entry-browser',[...browserIds],Object.fromEntries(parts.map(p=>[p.part,p.report.results.map(r=>r.id)])));
  return spec.merge(parts);
}

// ---- Gate (selftest) shards
export function verifyGateShard(dir,shard,inputs){
  const receipt=readJson(path.join(dir,'gate-shard.json')),plan=planOf(selftestShards,shard,'selftest');
  assert.equal(receipt.schema,'akari-gate-shard-v1');assert.equal(receipt.shard,shard);assert.equal(receipt.status,'PASS');assert.deepEqual(receipt.snapshot,inputs);
  assert.deepEqual(receipt.steps.map(s=>[s.id,s.part]),plan.map(u=>[u.name,u.part]),'selftest shard '+shard+' ran other steps');
  const outputs=new Map(gateSteps('',dir).map(([id,...args])=>[id,args.at(-1)]));
  for(const s of receipt.steps){
    assert.equal(s.status,'PASS',s.id);assert.equal(s.exit,0);assert.equal(s.signal,null);assert.ok(s.ms>=0);
    assert.equal(s.log,s.part?partLog(s.id,s.part):s.id+'.log');assert.ok(fs.statSync(path.join(dir,s.log)).isFile(),'log '+s.log);
    if(s.part)checkPartReport(s.id,readJson(outputs.get(s.id)),s.part,inputs);
  }
  return {shard,steps:receipt.steps.length};
}
const gateReceipts=new Set(['gate-shard.json','bundle.json','input-inventory.json']);
// dirs: {shard: verified shard directory}. Writes the merged selftest tree with gate.json; the caller
// runs verifyGateResults on it.
export function mergeGateShards(dirs,out,inputs){
  sameShardSet(dirs,selftestShards,'selftest');assert.ok(!fs.existsSync(out),'fresh merge directory');fs.mkdirSync(out,{recursive:true});
  const receipts=Object.fromEntries(Object.entries(dirs).map(([shard,dir])=>{verifyGateShard(dir,shard,inputs);return [shard,readJson(path.join(dir,'gate-shard.json'))];}));
  const all=gateSteps('',out),outputs=new Map(all.map(([id,...args])=>[id,path.relative(out,args.at(-1)).replaceAll('\\','/')]));
  const splitFiles=new Map(Object.keys(splits).filter(n=>outputs.has(n)).map(n=>[outputs.get(n),n]));
  copyUnion(dirs,out,{exclude:f=>gateReceipts.has(f),merged:f=>splitFiles.has(f)});
  for(const [file,name] of splitFiles){
    const parts=splits[name].parts.map(part=>{const owner=Object.entries(receipts).filter(([,r])=>r.steps.some(s=>s.id===name&&s.part===part));assert.equal(owner.length,1,name+'@'+part+' in '+owner.length+' shards');return {part,shard:owner[0][0],report:readJson(path.join(dirs[owner[0][0]],file))};});
    fs.mkdirSync(path.dirname(path.join(out,file)),{recursive:true});fs.writeFileSync(path.join(out,file),JSON.stringify(mergePartReports(name,parts),null,2)+'\n');
  }
  const rows=[];
  for(const [id] of all){
    if(selftestAfterMerge.includes(id)){rows.push(runAfterMerge(id,all.find(s=>s[0]===id).slice(1),out));continue;}
    const found=Object.entries(receipts).flatMap(([shard,r])=>r.steps.filter(s=>s.id===id).map(s=>({...s,shard})));
    rows.push(mergedRow(id,found,dirs,out));
  }
  const gate={schema:'akari-gate-v1',status:rows.every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:inputs,steps:rows,shards:Object.fromEntries(Object.entries(receipts).map(([s,r])=>[s,r.steps.map(x=>x.part?x.id+'@'+x.part:x.id)]))};
  fs.writeFileSync(path.join(out,'gate.json'),JSON.stringify(gate,null,2)+'\n');
  return gate;
}
export function mergedRow(id,found,dirs,out,log=id+'.log'){
  assert.ok(found.length,'no shard ran '+id);
  if(found.length===1&&!found[0].part){const {shard,part,...row}=found[0];return {...row,shard};}
  assert.ok(found.every(f=>f.part),id+' ran whole and in parts');
  assert.deepEqual(found.map(f=>f.part),[...splits[id].parts],id+' parts');
  fs.writeFileSync(path.join(out,log),found.map(f=>'=== '+id+'@'+f.part+' (shard '+f.shard+')\n'+fs.readFileSync(path.join(dirs[f.shard],f.log),'utf8')).join('\n'));
  return {id,status:found.every(f=>f.status==='PASS')?'PASS':'FAIL',exit:found.find(f=>f.exit!==0)?.exit??0,signal:found.find(f=>f.signal)?.signal??null,ms:found.reduce((n,f)=>n+f.ms,0),log,parts:found.map(f=>({part:f.part,shard:f.shard,ms:f.ms,log:f.log}))};
}
function runAfterMerge(id,args,out,log=id+'.log'){
  const started=Date.now(),r=cp.spawnSync(process.execPath,args,{encoding:'utf8',timeout:600000,maxBuffer:64*1024*1024});
  fs.writeFileSync(path.join(out,log),(r.stdout||'')+'\n'+(r.stderr||'')+(r.error?.stack||''));
  return {id,status:r.status===0&&!r.signal&&!r.error?'PASS':'FAIL',exit:r.status,signal:r.signal||null,ms:Date.now()-started,log,afterMerge:true};
}
// Copies every shard file into out. A path produced by two shards is rejected unless `shared`
// accepts it (identical bytes are then required) or `merged` claims it for a part merge.
export function copyUnion(dirs,out,{exclude=()=>false,merged=()=>false,shared=()=>false,rename=()=>null}={}){
  const owners=new Map();
  for(const [shard,dir] of Object.entries(dirs))for(const file of treeFiles(dir)){if(exclude(file))continue;(owners.get(file)||owners.set(file,[]).get(file)).push(shard);}
  for(const [file,shards] of owners){
    if(merged(file))continue;
    const renamed=rename(file);
    if(renamed){for(const shard of shards){const target=path.join(out,renamed(shard));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(dirs[shard],file),target);}continue;}
    if(shards.length>1){
      assert.ok(shared(file),'evidence file '+file+' produced by shards '+shards.join(', '));
      const hashes=new Set(shards.map(s=>sha(fs.readFileSync(path.join(dirs[s],file)))));assert.equal(hashes.size,1,'shared input '+file+' differs between shards');
    }
    const target=path.join(out,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(dirs[shards[0]],file),target);
  }
}

// ---- Browser shards
const taskOf=(spec,name)=>spec.entries.find(e=>e.task===name);
export function verifyBrowserShard(dir,shard,inputs){
  const plan=planOf(browserShards,shard,'browser'),summary=readJson(path.join(dir,'summary.json')),contract=browserContract();
  assert.equal(summary.head,inputs.productSha256);assert.equal(summary.shard,shard);assert.equal(summary.group,undefined);
  assert.equal(summary.failed,0);assert.equal(summary.passed,plan.length);
  assert.deepEqual(summary.records.map(r=>[r.task,r.part]),plan.map(u=>[u.name,u.part]),'browser shard '+shard+' ran other tasks');
  for(const r of summary.records){assert.equal(r.status,0);assert.equal(r.signal,null);assert.ok(fs.statSync(path.join(dir,r.log)).isFile());}
  verifyCandidate(dir,inputs);
  for(const u of plan){
    const spec=taskOf(contract,u.name);assert.ok(spec,'browser result spec '+u.name);const report=readJson(path.join(dir,spec.report));
    if(u.part)checkPartReport(u.name,report,u.part,inputs);
    else verifyBrowserReport(report,spec,inputs,{artifactDir:path.dirname(path.join(dir,spec.report))});
  }
  return {shard,tasks:plan.length};
}
const mediaNames=['fixture-manifest.json','picture.jpg','picture.png','picture.webp','silence.mp3','tone.wav'];
function verifyCandidate(dir,inputs){
  const manifest=readJson(path.join(dir,'candidate/manifest.json'));
  assert.equal(manifest.candidate,currentProductFile());assert.equal(manifest.head,inputs.productSha256);
  assert.deepEqual(Object.fromEntries(manifest.files.map(f=>[f.path,f.sha256]).sort(([a],[b])=>a.localeCompare(b))),Object.fromEntries(Object.entries(inputInventory()).sort(([a],[b])=>a.localeCompare(b))),'browser snapshot input coverage');
  for(const f of manifest.files)assert.equal(sha(fs.readFileSync(path.join(dir,'candidate',f.path))),f.sha256,'changed browser input '+f.path);
  assert.deepEqual(manifest.runnerFiles.map(f=>f.snapshotPath).sort(),mediaNames.map(n=>'media/'+n));
  for(const f of manifest.runnerFiles)assert.equal(sha(fs.readFileSync(path.join(dir,'candidate',f.snapshotPath))),f.sha256,'changed generated fixture '+f.path);
  return manifest;
}
const browserReceipts=new Set(['bundle.json','input-inventory.json']);
// Writes one merged browser tree for every group (summary.group 'all'); the caller runs verifyBrowserGroup(out,'all').
export function mergeBrowserShards(dirs,out,inputs){
  sameShardSet(dirs,browserShards,'browser');assert.ok(!fs.existsSync(out),'fresh merge directory');fs.mkdirSync(out,{recursive:true});
  const summaries=Object.fromEntries(Object.entries(dirs).map(([shard,dir])=>{verifyBrowserShard(dir,shard,inputs);return [shard,readJson(path.join(dir,'summary.json'))];}));
  const manifests=Object.values(dirs).map(dir=>verifyCandidate(dir,inputs));
  for(const m of manifests)assert.deepEqual(withoutCapture(m),withoutCapture(manifests[0]),'browser shards ran other inputs');
  const contract=browserContract(),inputsInCandidate=new Set(manifests[0].files.map(f=>'candidate/'+f.path));
  const splitFiles=new Map(Object.keys(splits).filter(n=>taskOf(contract,n)).map(n=>[taskOf(contract,n).report,n]));
  copyUnion(dirs,out,{exclude:f=>browserReceipts.has(f),merged:f=>splitFiles.has(f)||f==='candidate/manifest.json',
    shared:f=>inputsInCandidate.has(f)||f.startsWith('candidate/runner/')||f.startsWith('candidate/media/'),
    rename:f=>f==='summary.json'||f==='prepare-media.log'?shard=>'shards/'+shard+'/'+f:null});
  fs.writeFileSync(path.join(out,'candidate/manifest.json'),fs.readFileSync(path.join(Object.values(dirs)[0],'candidate/manifest.json')));
  for(const [file,name] of splitFiles){
    const parts=splits[name].parts.map(part=>{const owner=Object.entries(summaries).filter(([,s])=>s.records.some(r=>r.task===name&&r.part===part));assert.equal(owner.length,1,name+'@'+part+' in '+owner.length+' shards');return {part,shard:owner[0][0],report:readJson(path.join(dirs[owner[0][0]],file))};});
    fs.writeFileSync(path.join(out,file),JSON.stringify(mergePartReports(name,parts),null,2)+'\n');
  }
  const config=readJson('audit/browser/browser-audit-manifest.json'),records=[];
  for(const task of Object.values(config.groups).flat()){
    const found=Object.entries(summaries).flatMap(([shard,s])=>s.records.filter(r=>r.task===task).map(r=>({...r,shard})));
    assert.ok(found.length,'no shard ran '+task);
    if(found.length===1&&!found[0].part){const {part,...r}=found[0];records.push(r);continue;}
    assert.ok(found.every(f=>f.part));assert.deepEqual(found.map(f=>f.part),[...splits[task].parts],task+' parts');
    const log=task.replace(':','-')+'.log';
    fs.writeFileSync(path.join(out,log),found.map(f=>'=== '+task+'@'+f.part+' (shard '+f.shard+')\n'+fs.readFileSync(path.join(dirs[f.shard],f.log),'utf8')).join('\n'));
    records.push({task,name:found[0].name,args:found[0].args,status:found.every(f=>f.status===0)?0:found.find(f=>f.status!==0).status,signal:found.find(f=>f.signal)?.signal??null,
      started:found.map(f=>f.started).sort()[0],finished:found.map(f=>f.finished).sort().at(-1),log,parts:found.map(f=>({part:f.part,shard:f.shard,log:f.log}))});
  }
  const summary={head:inputs.productSha256,group:'all',productVersion:config.productVersion,records,passed:records.filter(r=>r.status===0).length,failed:records.filter(r=>r.status!==0).length,
    shards:Object.fromEntries(Object.entries(summaries).map(([s,x])=>[s,x.records.map(r=>r.part?r.task+'@'+r.part:r.task)]))};
  fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
  return summary;
}

// ---- Acceptance shards
export function verifyAcceptanceShardReceipt(receipt,kind,shard,inputs,canonical){
  const plan=new Set(planOf(acceptanceShards[kind]||{},shard,'acceptance '+kind).map(u=>{assert.equal(u.part,null,'acceptance parts are not planned');return u.name;}));
  assert.equal(receipt.schema,'akari-acceptance-shard-v1');assert.equal(receipt.kind,kind);assert.equal(receipt.shard,shard);assert.equal(receipt.status,'PASS');assert.deepEqual(receipt.snapshot,inputs);
  assert.deepEqual(receipt.steps.map(s=>s.id),canonical.filter(id=>plan.has(id)),'acceptance shard '+kind+'/'+shard+' ran other steps');
  for(const s of receipt.steps){assert.equal(s.status,'PASS',s.id);assert.equal(s.exit,0);assert.equal(s.signal,null);assert.ok(s.ms>=0);assert.equal(s.log,'step-'+String(canonical.indexOf(s.id)+1).padStart(2,'0')+'.log');}
  return receipt.steps.length;
}
const acceptanceReceipts=new Set(['execution-shard.json','child-ux-shard.json','input-inventory.json']);
// dirs: {shard: verified shard directory}; commands: the kind's acceptance commands; ids: their acceptance IDs.
// Writes the merged kind directory with execution.json; the caller seals and verifies it as one bundle.
export function mergeAcceptanceShards(kind,dirs,out,inputs,commands,ids){
  sameShardSet(dirs,acceptanceShards[kind]||{},'acceptance '+kind);assert.ok(!fs.existsSync(out),'fresh merge directory');fs.mkdirSync(out,{recursive:true});
  const receipts=Object.fromEntries(Object.entries(dirs).map(([shard,dir])=>{const r=readJson(path.join(dir,'execution-shard.json'));verifyAcceptanceShardReceipt(r,kind,shard,inputs,ids);return [shard,r];}));
  copyUnion(dirs,out,{exclude:f=>acceptanceReceipts.has(f)});
  for(const [shard,dir] of Object.entries(dirs)){const target=path.join(out,'shards',shard);fs.mkdirSync(target,{recursive:true});fs.copyFileSync(path.join(dir,'execution-shard.json'),path.join(target,'execution-shard.json'));}
  const after=acceptanceAfterMerge[kind]||[],rows=[];
  for(const [i,id] of ids.entries()){
    const log='step-'+String(i+1).padStart(2,'0')+'.log';
    if(after.includes(id)){
      const args=commands[i].slice(5).match(/"[^"]*"|\S+/g).map(s=>s.replace(/^"|"$/g,''));assert.ok(!args.includes('$AKARI_CODEC_BROWSER'),'an after-merge step runs no browser');
      assert.equal(path.resolve(args.at(-1)),path.resolve(out),'the after-merge step reads the merged directory');
      rows.push(runAfterMerge(id,args,out,log));continue;
    }
    const found=Object.entries(receipts).flatMap(([shard,r])=>r.steps.filter(s=>s.id===id).map(s=>({...s,shard})));
    assert.equal(found.length,1,id+' ran in '+found.length+' shards');const {shard,...row}=found[0];rows.push({...row,shard});
  }
  const report={schema:'akari-acceptance-execution-v1',status:rows.every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:inputs,steps:rows,shards:Object.fromEntries(Object.entries(receipts).map(([s,r])=>[s,r.steps.map(x=>x.id)]))};
  fs.writeFileSync(path.join(out,'execution.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}

// ---- Final audit aggregate: merge every verified shard of a family and run its full validator.
// verified: {bundle kind: directory} of the bundles that passed. A family with a missing or failed
// shard is reported FAIL without merging.
export const mergedKinds=Object.freeze(['selftest','full-browser']);
export function verifyMergedEvidence(verified,inputs,root){
  const families=[
    ['selftest',selftestShards,dirs=>{const out=path.join(root,'selftest');mergeGateShards(dirs,out,inputs);return verifyGateResults(out,inputs);}],
    ['full-browser',browserShards,dirs=>{const out=path.join(root,'full-browser');mergeBrowserShards(dirs,out,inputs);return verifyBrowserGroup(out,'all',inputs);}],
  ];
  return families.map(([family,plan,merge])=>{
    try{
      const dirs=Object.fromEntries(Object.keys(plan).map(shard=>{const dir=verified[family+'-'+shard];assert.ok(dir,'shard '+family+'-'+shard+' missing or failed');return [shard,dir];}));
      return {kind:family,status:'PASS',merged:Object.keys(dirs),result:merge(dirs)};
    }catch(e){return {kind:family,status:'FAIL',reason:e.message.slice(0,3000)};}
  });
}
