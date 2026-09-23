import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha} from './product-test-host.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));
export const browserContract=()=>read('audit/manifests/browser-results.json');
export function verifyBrowserReport(report,spec,expectedSnapshot) {
  for(const key of ['pageErrors','networkRequests','errors','network'])if(key in report)assert.deepEqual(report[key],[],spec.task+'/'+key);
  for(const key of ['failed'])if(key in report)assert.equal(report[key],0);
  for(const key of ['sourceUnchanged','sourceFileUnchanged','environmentPass','complete'])if(key in report)assert.equal(report[key],true);
  for(const key of ['sha256','htmlSha256','sha','finalSha'])if(key in report)assert.equal(report[key],expectedSnapshot.productSha256,'wrong product '+spec.task);
  if(report.manifest){assert.equal(report.manifest.head,expectedSnapshot.head);assert.equal(report.manifest.files.find(f=>f.path==='Akari.html')?.sha256,expectedSnapshot.productSha256);}
  if(spec.task!=='schema-shards')assert.ok(typeof report.browser==='string'&&report.browser.length>0,'missing browser '+spec.task);
  if(spec.key==='single'){
    assert.equal(report.pass,true);assert.equal(report.method,spec.keys[0]);assert.equal(report.lines,16666);
    assert.equal(report.sourceUnchanged,true);assert.equal(report.state.mode,'blocks');assert.equal(report.state.chars,99995);assert.ok(report.state.dom<=5000);
    return;
  }
  assert.ok(Array.isArray(report.results));
  const keys=report.results.map(r=>spec.key==='viewport/zoom'?r.evidence.viewport.width+'/'+r.evidence.workbenchZoom:
    spec.key==='id/viewport/mode'?r.id+'/'+r.viewport.width+'/'+r.mode:
    spec.key==='long'&&r.id==='B09-LONG-SWITCH'?r.id+'/'+r.n+'/'+r.where:r.id);
  assert.deepEqual([...keys].sort(),[...spec.keys].sort(),'missing/duplicate/unexpected cases '+spec.task);
  assert.equal(new Set(keys).size,keys.length,'duplicate case tuple');
  for(const r of report.results){
    if(spec.key==='long'){
      if(r.id==='B09-LONG-SWITCH'){assert.equal(r.roundTrip,true);assert.equal(r.focused,true);assert.equal(r.visible,true);assert.ok(r.count<=120);}
      else for(const k of ['pagesRetained','all300Reachable','cancel','moveAcrossOriginalGap','undoRedo'])assert.equal(r[k],true);
    }else assert.equal(r.pass,true,spec.task+'/'+r.id);
    if('status' in r)assert.equal(r.status,'PASS');
    assert.ok(!r.error,spec.task+': '+r.error);
  }
  if(spec.task==='ui-stage-gesture'){
    const e=report.results.find(r=>r.id==='stage-gesture:window-blur-cleans-up').evidence;
    assert.equal(e.environment.phase,'gesture');assert.equal(e.environment.headless,false);
    assert.equal(e.environment.adapters.length,2);
    for(const a of e.environment.adapters){assert.equal(a.playwright,'1.55.0');assert.equal(a.session,'playwright-main-frame');assert.equal(a.enabled,false);}
    assert.equal(e.environment.lostFocus.focused,false);assert.equal(e.environment.regainedFocus,true);
    const trusted=events=>events.some(x=>x.type==='blur'&&x.target==='window'&&x.trusted===true);
    assert.ok(trusted(e.environment.lostFocus.events),'missing preflight native blur');
    assert.equal(e.focusBeforeDrag.focused,true);assert.equal(e.blurredFocus,false);
    assert.ok(trusted(e.blurred.events),'missing gesture native blur');
  }
  if(spec.task==='schema-shards'){
    assert.equal(report.complete,true);assert.equal(report.expected,153);assert.equal(report.shards.length,2);
    for(const s of report.shards){assert.equal(s.exit,0);assert.equal(s.expected,s.actual);assert.deepEqual(s.pageErrors,[]);assert.deepEqual(s.networkRequests,[]);}
  }
}
export function verifyBrowserGroup(dir,group,expectedSnapshot) {
  const config=read('audit/browser/browser-audit-manifest.json'),contract=browserContract();
  const tasks=group==='all'?Object.values(config.groups).flat():config.groups[group];
  const summary=read(path.join(dir,'summary.json'));
  assert.equal(summary.head,expectedSnapshot.head);assert.equal(summary.group,group);
  assert.equal(summary.failed,0);assert.equal(summary.passed,tasks.length);
  assert.deepEqual(summary.records.map(r=>r.task).sort(),[...tasks].sort());
  for(const r of summary.records){assert.equal(r.status,0);assert.equal(r.signal,null);assert.ok(fs.existsSync(path.join(dir,r.log)));}
  const manifest=read(path.join(dir,'candidate/manifest.json'));
  assert.equal(manifest.head,expectedSnapshot.head);assert.equal(manifest.baseline,config.fixedBaseline);
  const fixedFiles={'baseline/Akari.html':'Akari.html','baseline/AUDIT.md':'AUDIT.md','baseline/LANGUAGE.md':'LANGUAGE.md','baseline/.github/workflows/akari-audit.yml':'.github/workflows/akari-audit.yml'};
  assert.deepEqual(manifest.files.filter(f=>f.gitRef).map(f=>f.path).sort(),Object.keys(fixedFiles).sort());
  for(const [p,source] of Object.entries(fixedFiles)){const f=manifest.files.find(f=>f.path===p);assert.equal(f.gitRef,config.fixedBaseline);assert.equal(f.sha256,expectedSnapshot.files['audit/fixtures/1.0.0/source/'+source],'browser baseline substituted: '+p);}
  assert.deepEqual(Object.fromEntries(manifest.files.filter(f=>!f.gitRef).map(f=>[f.path,f.sha256]).sort(([a],[b])=>a.localeCompare(b))),
    Object.fromEntries(Object.entries(expectedSnapshot.files).sort(([a],[b])=>a.localeCompare(b))),'browser snapshot input coverage');
  for(const f of manifest.files)assert.equal(sha(fs.readFileSync(path.join(dir,'candidate',f.path))),f.sha256,'changed browser input '+f.path);
  assert.deepEqual(manifest.runnerFiles.map(f=>f.snapshotPath).sort(),['fixture-manifest.json','picture.jpg','picture.png','picture.webp','silence.mp3','tone.wav'].map(n=>'media/'+n));
  for(const f of manifest.runnerFiles)assert.equal(sha(fs.readFileSync(path.join(dir,'candidate',f.snapshotPath))),f.sha256,'changed generated fixture '+f.path);
  const media=read(path.join(dir,'candidate/media/fixture-manifest.json'));
  assert.deepEqual(media.files.map(f=>f.path).sort(),['picture.jpg','picture.png','picture.webp','silence.mp3','tone.wav']);
  for(const f of media.files){const bytes=fs.readFileSync(path.join(dir,'candidate/media',f.path));assert.equal(bytes.length,f.bytes);assert.equal(sha(bytes),f.sha256);}
  const specs=contract.entries.filter(e=>group==='all'||e.group===group);
  assert.deepEqual(specs.map(s=>s.task).sort(),[...tasks].sort());
  for(const spec of specs)verifyBrowserReport(read(path.join(dir,spec.report)),spec,expectedSnapshot);
  if(group==='schemas'||group==='all')for(let i=0;i<2;i++){
    const r=read(path.join(dir,'candidate/schema-shard-'+i+'/browser-schemas-selected.json'));
    assert.ok(typeof r.browser==='string'&&r.browser.length>0);assert.deepEqual(r.pageErrors,[]);assert.deepEqual(r.networkRequests,[]);
  }
  return {group,tasks:specs.length,cases:specs.reduce((n,s)=>n+s.keys.length,0)};
}
