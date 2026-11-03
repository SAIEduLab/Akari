import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha} from './product-test-host.mjs';
import {browserEnvironment} from './browser-environment.mjs';

export const manualPages=['index.html','MANUAL.html','Manual/block-mode.html','Manual/code-mode-beginner.html','Manual/code-mode-intermediate.html','Manual/code-mode-advanced.html','Manual/meijin-mode.html'];
export const manualWidths=[1366,768,390];
export const decodeManualText=s=>s.replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&');
// The intermediate manual explicitly asks the reader to create these two data items before the examples.
export function manualExampleSymbols(api,file){
  const project=api.makeEmptyProject();
  if(file==='Manual/code-mode-intermediate.html')project.projectData.variables.push(
    {id:'manual-score',name:'点数',initialValue:0,expectedUnit:'点'},
    {id:'manual-time',name:'のこり時間',initialValue:0,expectedUnit:'秒'});
  return api.buildSymbols(project);
}
export function manualSnippetInventory(){
  const rows=[];
  for(const file of manualPages){
    const source=fs.readFileSync(file,'utf8'),meijin=file==='Manual/meijin-mode.html';
    for(const [index,m]of [...source.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/g)].entries()){
      const code=decodeManualText(m[1].replace(/<[^>]+>/g,''));
      rows.push({file,index:index+1,sha256:sha(code),status:meijin?'MEIJIN_CHECK_PASS':'SYNTAX_PASS'});
    }
    for(const m of source.matchAll(/<code\b([^>]*)>([^<]+)<\/code>/g)){
      const code=decodeManualText(m[2]);if(!code.endsWith('。')&&!(meijin&&code.endsWith('、')))continue;
      rows.push({file,inline:code,sha256:sha(code),status:meijin?(/class="ng"/.test(m[1])?'MEIJIN_STOPPED_AS_WRITTEN':code.endsWith('、')?'MEIJIN_HEADING_PASS':'MEIJIN_CHECK_PASS'):'SYNTAX_PASS'});
    }
  }
  return rows;
}
const sorted=rows=>rows.map(row=>JSON.stringify(row)).sort();
function verifyImage(name,digest,dir){
  assert.ok(typeof name==='string'&&path.basename(name)===name&&name.endsWith('.png'),'manual image path');
  assert.match(digest,/^[a-f0-9]{64}$/);
  const bytes=fs.readFileSync(path.join(dir,name));
  assert.ok(bytes.length>8);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(sha(bytes),digest,'manual image hash');
}
export function verifyManualDocs(report,inputs,dir){
  assert.equal(report.status,'PASS');assert.deepEqual(report.snapshot,inputs);assert.ok(!report.error);
  assert.equal(report.browser,browserEnvironment.version);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);
  assert.deepEqual(report.pages,manualPages);assert.deepEqual(sorted(report.snippets),sorted(manualSnippetInventory()));
  const keys=manualPages.flatMap(file=>manualWidths.map(width=>file+'/'+width));
  assert.deepEqual(report.views.map(v=>v.file+'/'+v.width).sort(),keys.sort());
  for(const row of report.views){
    assert.ok(!row.error);if('status'in row)assert.equal(row.status,'PASS');
    assert.ok(Number.isFinite(row.scroll)&&row.scroll>0&&row.scroll<=row.width+1);
    assert.ok(typeof row.heading==='string'&&row.heading.trim());assert.equal(row.skipLink,true);
    const detailCount=[...fs.readFileSync(row.file,'utf8').matchAll(/<details\b/g)].length;
    assert.equal(row.details.length,detailCount);
    for(const detail of row.details){assert.equal(typeof detail.before,'boolean');assert.equal(detail.after,!detail.before);}
    verifyImage(row.screenshot,row.screenshotSha256,dir);
  }
  const first=report.firstWork;assert.equal(first.status,'PASS');assert.ok(!first.error);
  assert.ok(typeof first.target==='string'&&first.target!=='stage'&&first.target);assert.ok(typeof first.targetName==='string'&&first.targetName);
  const example=fs.readFileSync('MANUAL.html','utf8').match(/<[^>]*data-example="first-move"[^>]*>([\s\S]*?)<\/[^>]+>/);
  assert.ok(example);const source=decodeManualText(example[1].replace(/<[^>]+>/g,'')).replace(/^ねこ(?=は)/,first.targetName);
  assert.equal(first.source,source);assert.equal(first.expectedMovement,10);assert.ok(Number.isFinite(first.start)&&Number.isFinite(first.end));
  assert.ok(Math.abs(first.end-first.start-10)<0.1);assert.deepEqual(first.compileErrors,[]);
  verifyImage(first.screenshot,first.screenshotSha256,dir);
  return {status:'PASS',snippets:report.snippets.length,views:keys.length};
}
export const manualRejections=['missing-pages','missing-snippets','wrong-snippet','missing-views','duplicate-view','view-failed','view-timeout','missing-details','skip-failed','overflow','missing-first-work','first-work-not-run','wrong-movement','compile-error','missing-image','changed-image','missing-first-image','error','wrong-snapshot'];
export function checkManualDocsNegatives(positive,inputs,dir){
  verifyManualDocs(positive,inputs,dir);
  const mutations=[r=>r.pages=[],r=>r.snippets=[],r=>r.snippets[0].sha256='0'.repeat(64),r=>r.views=[],r=>r.views[0]=r.views[1],r=>r.views[0].status='FAIL',r=>r.views[0].error='Timeout',r=>delete r.views.find(v=>v.details.length).details,r=>r.views[0].skipLink=false,r=>r.views[0].scroll=r.views[0].width+20,r=>delete r.firstWork,r=>r.firstWork.status='NOT_RUN',r=>r.firstWork.end=r.firstWork.start,r=>r.firstWork.compileErrors=[{code:'P205'}],r=>r.views[0].screenshot='missing.png',r=>r.views[0].screenshotSha256='0'.repeat(64),r=>r.firstWork.screenshot='missing.png',r=>r.error='Timeout',r=>r.snapshot.productSha256='0'.repeat(64)];
  return mutations.map((mutate,i)=>{const report=structuredClone(positive);mutate(report);assert.throws(()=>verifyManualDocs(report,inputs,dir),manualRejections[i]);return {id:manualRejections[i],status:'PASS',result:'REJECTED'};});
}
