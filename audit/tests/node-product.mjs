import {runEditorSyntaxReuseTests} from './editor-syntax-reuse.mjs';
import { currentProductFile } from "./../lib/product-path.cjs";
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {suiteExpression,suiteParts} from '../lib/product-test-host.mjs';
import {nodeProductSuites,writeCaseReport} from '../lib/gate-case-contract.mjs';
const [output]=process.argv.slice(2);assert.ok(output,'usage: node-product.mjs <result.json>');
const html=fs.readFileSync(currentProductFile(),'utf8'),script=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
assert.equal((html.match(/^<script>\r?$/gm)||[]).length,1);
new vm.Script(script);
const manifest=JSON.parse(fs.readFileSync('audit/manifests/product-tests.json'));
// The milliseconds of each suite (each part of a suite in parts) against the limits, written to <result>-timings.json
// beside the result, also when a suite stops at a limit (stopped names it): loading the product into its context
// (loadMs), running the suite until runInContext returns (runSyncMs; the suite limit stops only this stage) and until its
// report settles (runMs). No check reads these times.
const suiteLimitMs=30000,totalLimitMs=120000,started=Date.now(),timingsFile=output.replace(/\.json$/,'')+'-timings.json';
const timings={schema:'akari-node-product-timings-v1',limits:{suiteMs:suiteLimitMs,totalMs:totalLimitMs},totalMs:null,editorSyntaxReuseMs:null,suites:[],stopped:null};
let running=null;
const stop=(limitMs,reason)=>{if(running)timings.stopped={suite:running.name,stage:running.stage,ms:Date.now()-running.at,limitMs,reason};};
const writeTimings=()=>{timings.totalMs=Date.now()-started;fs.mkdirSync(path.dirname(path.resolve(timingsFile)),{recursive:true});fs.writeFileSync(timingsFile,JSON.stringify(timings,null,2)+'\n');};
const deadline=setTimeout(()=>{stop(totalLimitMs,'the whole run passed '+totalLimitMs+' ms');console.error('Node product test timeout'+(running?' in '+running.name+' ('+running.stage+')':''));writeTimings();process.exit(124);},totalLimitMs);
const reports=[],results=[];
try {
 running={name:'editor-syntax-reuse',stage:'run',at:Date.now()};
 const syntaxReuse=runEditorSyntaxReuseTests(html);
 timings.editorSyntaxReuseMs=Date.now()-running.at;running=null;
 console.log('Node product editor-syntax-reuse: '+timings.editorSyntaxReuseMs+' ms ('+totalLimitMs+' ms for the whole run)');
 for(const name of nodeProductSuites){
  const spec=manifest.suites.find(s=>s.name===name);assert.ok(spec,'node product suite missing from manifest: '+name);
  // A suite in parts runs each part in a product of its own, each under the suite limit; their results are the suite's.
  const report={total:0,failed:0,results:[]};
  for(const part of suiteParts(spec)){
   const context=vm.createContext({console,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,Blob,URL,structuredClone,crypto:crypto.webcrypto,setTimeout,clearTimeout});
   const row={name:part,loadMs:null,runSyncMs:null,runMs:null};timings.suites.push(row);
   let partReport;
   try {
    running={name:part,stage:'load',at:Date.now()};
    vm.runInContext(script,context,{timeout:suiteLimitMs});
    row.loadMs=Date.now()-running.at;running={name:part,stage:'run',at:Date.now()};
    const pending=vm.runInContext(suiteExpression(part),context,{timeout:suiteLimitMs});
    row.runSyncMs=Date.now()-running.at;running={...running,stage:'settle'};
    partReport=await pending;
    row.runMs=Date.now()-running.at;
   } catch(error) {
    // (the suite limit holds the load and the run until it returns; the settling is held by the limit of the whole run)
    stop(running?.stage==='settle'?totalLimitMs:suiteLimitMs,String(error?.message??error));
    console.error('Node product suite '+part+': stopped in its '+timings.stopped.stage+' after '+timings.stopped.ms+' ms (limit '+timings.stopped.limitMs+' ms): '+timings.stopped.reason);
    throw error;
   }
   running=null;
   console.log('Node product suite '+part+': load '+row.loadMs+' ms, run '+row.runSyncMs+' ms until it returns (limit '+suiteLimitMs+' ms each), '+row.runMs+' ms until its report settles');
   report.total+=partReport.total;report.failed+=partReport.failed;report.results.push(...partReport.results);
  }
  assert.deepEqual([...report.results.map(r=>r.id)].sort(),[...spec.ids].sort());
  if(report.failed) console.error(report.results.filter(r=>!r.pass));
  results.push(...report.results.map(r=>({id:spec.name+'/'+r.id,status:r.pass===true?'PASS':'FAIL'})));
  reports.push({name:spec.name,total:report.total,failed:report.failed});
 }
 results.push(...syntaxReuse.results.map(r=>({id:'editor-syntax-reuse/'+r.id,status:r.status})));
 const written=writeCaseReport(output,'node-product',results,{environment:'node',requiredBrowserComplete:false,reports});
 assert.ok(reports.every(r=>r.failed===0),'node product suite failure');assert.equal(written.status,'PASS');
 console.log('Node actual product: '+results.length+' PASS (browser obligation separate)');
} finally {clearTimeout(deadline);writeTimings();}
