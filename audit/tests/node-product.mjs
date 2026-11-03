import {runEditorSyntaxReuseTests} from './editor-syntax-reuse.mjs';
import { currentProductFile } from "./../lib/product-path.cjs";
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {suiteExpression} from '../lib/product-test-host.mjs';
import {nodeProductSuites,writeCaseReport} from '../lib/gate-case-contract.mjs';
const [output]=process.argv.slice(2);assert.ok(output,'usage: node-product.mjs <result.json>');
const html=fs.readFileSync(currentProductFile(),'utf8'),script=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
assert.equal((html.match(/^<script>\r?$/gm)||[]).length,1);
new vm.Script(script);
const manifest=JSON.parse(fs.readFileSync('audit/manifests/product-tests.json'));
const deadline=setTimeout(()=>{console.error('Node product test timeout');process.exit(124);},120000);
const reports=[],results=[];
const syntaxReuse=runEditorSyntaxReuseTests(html);
try {
 for(const name of nodeProductSuites){
  const spec=manifest.suites.find(s=>s.name===name);assert.ok(spec,'node product suite missing from manifest: '+name);
  const context=vm.createContext({console,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,Blob,URL,structuredClone,crypto:crypto.webcrypto,setTimeout,clearTimeout});
  vm.runInContext(script,context,{timeout:30000});
  const report=await vm.runInContext(suiteExpression(spec.name),context,{timeout:30000});
  assert.deepEqual([...report.results.map(r=>r.id)].sort(),[...spec.ids].sort());
  if(report.failed) console.error(report.results.filter(r=>!r.pass));
  results.push(...report.results.map(r=>({id:spec.name+'/'+r.id,status:r.pass===true?'PASS':'FAIL'})));
  reports.push({name:spec.name,total:report.total,failed:report.failed});
 }
 results.push(...syntaxReuse.results.map(r=>({id:'editor-syntax-reuse/'+r.id,status:r.status})));
 const written=writeCaseReport(output,'node-product',results,{environment:'node',requiredBrowserComplete:false,reports});
 assert.ok(reports.every(r=>r.failed===0),'node product suite failure');assert.equal(written.status,'PASS');
 console.log('Node actual product: '+results.length+' PASS (browser obligation separate)');
} finally {clearTimeout(deadline);}
