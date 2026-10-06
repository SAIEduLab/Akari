import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {verifyComponentControls} from '../lib/component-controls-contract.mjs';

const [input,output]=process.argv.slice(2),inputs=snapshot(currentProductFile());
assert.ok(input,'component controls browser report required');
const report=JSON.parse(fs.readFileSync(input)),checked=verifyComponentControls(report,inputs),base=path.dirname(path.resolve(input));
for(const artifact of report.artifacts){
  assert.ok(!path.isAbsolute(artifact.path)&&!artifact.path.split(/[\\/]/).includes('..'));
  const file=path.resolve(base,artifact.path);assert.ok(file.startsWith(base+path.sep));
  const bytes=fs.readFileSync(file);
  assert.equal(sha(bytes),artifact.sha256,'actual screenshot matches recorded artifact');
  assert.deepEqual({width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)},artifact.pixels,'actual PNG pixel dimensions');
}
const negatives=[
  ['missing-case',r=>r.results.pop()],['duplicate-case',r=>r.results[1]=structuredClone(r.results[0])],
  ['false-pass',r=>r.results[0].status='FAIL'],['stale-product',r=>r.snapshot.productSha256='0'.repeat(64)],
  ['clipped-button',r=>r.results[0].observed[0].targets[6].rect.height+=500],
  ['clipped-ruby',r=>r.results[0].observed[0].targets[5].ink[0].y-=100],
  ['not-clickable',r=>r.results[0].observed[0].targets[6].hit=false],
  ['missing-viewport',r=>r.results[0].observed.pop()],['not-opened',r=>r.results[0].observed[0].clicks.assetDialog=false],
  ['changed-history',r=>r.results[0].observed[0].after.history++],
  ['keyboard-unreachable',r=>r.results[1].observed[0].forward=[]],
  ['touch-not-scrolled',r=>r.results[3].observed.scrollAfter=r.results[3].observed.scrollBefore],
  ['fake-zoom',r=>r.results[4].observed[0].actual=1],
  ['wrong-screenshot-scale',r=>r.artifacts.at(-1).pixels.width/=2],
];
for(const [id,change]of negatives){const altered=structuredClone(report);change(altered);assert.throws(()=>verifyComponentControls(altered,inputs),id);}
const proof={...checked,snapshot:inputs,negativeTotal:negatives.length,negatives:negatives.map(([id])=>id)};
if(output){assert.ok(!fs.existsSync(output),'fresh verification report required');fs.writeFileSync(output,JSON.stringify(proof,null,2)+'\n');}
console.log(JSON.stringify({...checked,negativeTotal:negatives.length}));
