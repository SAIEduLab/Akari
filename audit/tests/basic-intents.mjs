import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
import {basicProject,basicExecution} from '../lib/basic-intents-runtime.mjs';
import {verifyProjectedSource} from '../lib/docs-consolidation-contract.mjs';
const A=loadApi(fs.readFileSync(currentProductFile(),'utf8')),fixture=JSON.parse(fs.readFileSync('audit/fixtures/basic-intents.json')),results=[],plain=x=>JSON.parse(JSON.stringify(x)),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
assert.equal(sha(fs.readFileSync('audit/fixtures/basic-intents.json')),'cf9c3ea0c54801fc77d26f1b66c95bf383ddc89e468ddf9a4ae7121ca63c8d08');
assert.deepEqual(fixture.cases.map(d=>d.id),['T01','T02','T03','T04','T05','T06','T13']);
const migration=JSON.parse(fs.readFileSync('audit/fixtures/design-doc-migration-map.json'));
assert.equal(migration.sourceProjection.path,fixture.publicSource);
assert.equal(verifyProjectedSource(migration),fixture.publicSourceSha256);
for(const d of fixture.cases){try{
 assert.equal(sha(d.source),d.sourceSha256);const source=basicExecution(A,d,basicProject),blocks=basicExecution(A,d,basicProject,'blocks');assert.deepEqual(plain(blocks),plain(source));
 const states=source.states,actor=(i,id='sprite-1')=>states[i].actors.find(a=>a.id===id),first=actor(0),last=actor(states.length-1);assert.deepEqual(source.errors,[]);
 if(d.id==='T01'){assert.deepEqual(states.map((s,i)=>actor(i).x),[100,100,130,130,160]);assert.ok(states.every((s,i)=>actor(i).y===100&&actor(i).direction===0));assert.deepEqual(source.trace.map(t=>t.text),['今日はどこへ行こう','今日はどこへ行こう']);}
 if(d.id==='T02'){assert.deepEqual(states.map((s,i)=>actor(i).y),[100,100,100,76,76,100,100,100,100,76,100,100]);assert.ok(states.every((s,i)=>actor(i).x===100&&actor(i).direction===0));}
 if(d.id==='T03'||d.id==='T13'){const distance=d.id==='T03'?30:20,expected=[100,100,100,100+distance,100+distance,100+distance];states.forEach((s,i)=>assert.ok(Math.abs(actor(i).x-expected[i])<1e-8,'floating point integration must retain the fixed rate'));assert.ok(states.every((s,i)=>actor(i).y===100&&actor(i).direction===0));}
 if(d.id==='T04'){assert.equal(first.x,120);assert.equal(actor(0,'basic-star').x,185);assert.ok(states[0].actors.every(a=>a.y===100&&a.direction===0));assert.deepEqual(source.trace,[{kind:'say',id:'sprite-1',text:'先に行くね',time:0},{kind:'say',id:'basic-star',text:'ついていくよ',time:0}]);}
 if(d.id==='T05'){assert.deepEqual(states.map((s,i)=>actor(i).visible),[false,false,true]);assert.deepEqual(states.map(s=>s.speech.length),[0,0,1]);assert.deepEqual(source.trace,[{kind:'say',id:'sprite-1',text:'ただいま',time:1000}]);}
 if(d.id==='T06'){assert.ok(Math.abs(last.x-100)<1e-9&&Math.abs(last.y-100)<1e-9);assert.equal(last.direction%360,0);const lines=source.trace.filter(t=>t.kind==='line'),points=[[190,190,210,190],[210,190,210,210],[210,210,190,210],[190,210,190,190]];assert.equal(lines.length,4);lines.forEach((l,i)=>[l.x1,l.y1,l.x2,l.y2].forEach((n,j)=>assert.ok(Math.abs(n-points[i][j])<1e-9)));}
 results.push({id:d.id,status:'PASS',inputHash:d.sourceSha256,observed:{source,blocks}});
 }catch(error){results.push({id:d.id,status:'FAIL',error:error.stack});}}
const report={schema:'akari-basic-intents-core-v1',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:snapshot(currentProductFile()),uxAcceptance:false,results},out=path.resolve(process.argv[2]);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');for(const r of results.filter(r=>r.status==='FAIL'))console.error(r.id+' '+r.error);console.log('Basic original intents: '+results.filter(r=>r.status==='PASS').length+'/'+results.length+' PASS');if(report.status!=='PASS')process.exitCode=1;
