import fs from 'node:fs';
import assert from 'node:assert/strict';
import {snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {verifyPreviewReport} from '../lib/speech-preview-contract.mjs';
const [input,out]=process.argv.slice(2),r=JSON.parse(fs.readFileSync(input,'utf8')),inputs=snapshot(currentProductFile()),count=verifyPreviewReport(r,inputs);
const short=x=>x.results.find(r=>r.id==='speech-preview/full-width-font/fresh/10').observed;
const mutations=[
 ['wrapped-name',x=>{short(x).bubbles[0].heading.height*=3;}],
 ['unnecessary-reservation',x=>{short(x).bubbles[0].reserve=380;}],
 ['unnecessary-full-button',x=>{short(x).bubbles[0].full=true;}],
 ['stage-overflow',x=>{short(x).bubbles[1].rect.bottom+=50;}],
 ['glyph-clipping',x=>{const b=short(x).bubbles[0];b.glyphs[0].bottom=b.textBox.bottom+3;}],
 ['overlap',x=>{short(x).bubbles[1].rect=structuredClone(short(x).bubbles[0].rect);}],
 ['wrong-source',x=>{short(x).scripts[1].source='「あお」と60秒話す。';}],
 ['extended-speech',x=>{short(x).events[2].at+=1000;}],
 ['wrong-dialog-body',x=>{x.results.find(r=>r.id==='speech-preview/full-78/485').observed.openings[1].text='別の本文';}],
 ['unclosed-dialog',x=>{x.results.find(r=>r.id==='speech-preview/full-78/10').observed.openings[0].closed=false;}],
 ['missing-case',x=>x.results.pop()],
 ['duplicate-case',x=>x.results.push(structuredClone(x.results[0]))],
 ['other-snapshot',x=>{x.snapshot.productSha256='0'.repeat(64);}],
];
for(const [id,mutate]of mutations){const bad=structuredClone(r);mutate(bad);assert.throws(()=>verifyPreviewReport(bad,inputs),id);}
const report={schema:'akari-speech-preview-validator-v1',status:'PASS',snapshot:inputs,count,negativeControls:mutations.map(([id])=>({id,status:'PASS'}))};
if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log('Speech preview: '+count+' cases; '+mutations.length+' rejection controls PASS');
