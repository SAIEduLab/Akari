import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {suiteExpression} from '../lib/product-test-host.mjs';
const html=fs.readFileSync('Akari.html','utf8'),script=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
assert.equal((html.match(/^<script>\r?$/gm)||[]).length,1);
new vm.Script(script);
const manifest=JSON.parse(fs.readFileSync('audit/manifests/product-tests.json'));
const deadline=setTimeout(()=>{console.error('Node product test timeout');process.exit(124);},120000);
const reports=[];
try {
 const pureSuites=['runEditorCore09Tests','runSemanticContract09Tests','runAkariSelfTests','runVersion08Tests','runSyntax09Tests','runBlockCodec09Tests','runDesignResize09Tests','runColorPicker09Tests'];
 for(const spec of manifest.suites.filter(s=>pureSuites.includes(s.name))){
  const context=vm.createContext({console,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,Blob,URL,structuredClone,crypto:crypto.webcrypto,setTimeout,clearTimeout});
  vm.runInContext(script,context,{timeout:30000});
  const report=await vm.runInContext(suiteExpression(spec.name),context,{timeout:30000});
  assert.deepEqual([...report.results.map(r=>r.id)].sort(),[...spec.ids].sort());
  if(report.failed) console.error(report.results.filter(r=>!r.pass));
  assert.equal(report.failed,0);reports.push({name:spec.name,total:report.total});
 }
 fs.writeFileSync(process.argv[2] || 'audit-evidence/node-product.json',JSON.stringify({environment:'node',requiredBrowserComplete:false,reports},null,2)+'\n');
 console.log('Node actual product: '+reports.reduce((n,r)=>n+r.total,0)+' PASS (browser obligation separate)');
} finally {clearTimeout(deadline);}
