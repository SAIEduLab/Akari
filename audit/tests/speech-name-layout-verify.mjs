import fs from 'node:fs';
import assert from 'node:assert/strict';
import {snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {verifySpeechNameLayoutReport} from '../lib/speech-name-layout-contract.mjs';
const [input,out]=process.argv.slice(2),report=JSON.parse(fs.readFileSync(input,'utf8')),inputs=snapshot(currentProductFile());
const count=verifySpeechNameLayoutReport(report,inputs);
const mutations=[
 ['wrapped-name',r=>{const h=r.results[0].observed.bubbles[0].heading;h.height=3*h.lineHeight;}],
 ['clipped-name',r=>{r.results[0].observed.bubbles[0].heading.width=0;}],
 ['wrong-speaker-body',r=>{r.results.find(x=>x.id==='speech-name/full-78/1180').observed.openings[1].text='別の発話';}],
 ['extended-speech',r=>{r.results[0].observed.events[2].at+=1000;}],
 ['fake-native-zoom',r=>{const n=r.results.find(x=>x.id==='speech-name/native-browser-125/short').observed.nativeZoom;n.after.dpr=n.before.dpr;}],
 ['missing-case',r=>r.results.pop()],
 ['duplicate-case',r=>r.results.push(structuredClone(r.results[0]))],
 ['other-snapshot',r=>{r.snapshot.productSha256='0'.repeat(64);}],
 ['short-stage-clipping',r=>{r.results[0].observed.bubbles[0].ink.bottom+=500;}],
];
for(const[id,mutate]of mutations){const r=structuredClone(report);mutate(r);assert.throws(()=>verifySpeechNameLayoutReport(r,inputs),id);}
const result={schema:'akari-speech-name-layout-validator-v1',status:'PASS',snapshot:inputs,input,count,negativeControls:mutations.map(([id])=>({id,status:'PASS'}))};
if(out)fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log('Speech name layout: '+count+' cases; '+mutations.length+' rejection controls PASS');
