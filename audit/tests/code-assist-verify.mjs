import fs from 'node:fs';
import assert from 'node:assert/strict';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {verifyCodeAssistReport,verifyCodeAssistBrowserReport,verifyCodeAssistVerification,codeAssistWrongMeaning,codeAssistBrowserWrongMeaning} from '../lib/code-assist-contract.mjs';
const [nodeFile,browserFile,output]=process.argv.slice(2);
if(!nodeFile||!browserFile||!output)throw Error('Usage: code-assist-verify.mjs <node report> <browser report> <report>');
const node=JSON.parse(fs.readFileSync(nodeFile,'utf8')),browser=JSON.parse(fs.readFileSync(browserFile,'utf8'));
verifyCodeAssistReport(node);verifyCodeAssistBrowserReport(browser);
const negatives=[];
for(const [kind,report,verify,changes]of [['node',node,verifyCodeAssistReport,codeAssistWrongMeaning],['browser',browser,verifyCodeAssistBrowserReport,codeAssistBrowserWrongMeaning]])for(const [id,change]of changes){
  const bad=structuredClone(report);change(bad);assert.throws(()=>verify(bad),kind+'/'+id+' must be rejected');negatives.push({id:kind+'/'+id,rejected:true});
}
const report={schema:'akari-code-assist-verification-v1',status:'PASS',uxAcceptance:false,snapshot:snapshot(currentProductFile()),nodeIds:node.results.map(row=>row.id),browserIds:browser.results.map(row=>row.id),nodeSha256:sha(fs.readFileSync(nodeFile)),browserSha256:sha(fs.readFileSync(browserFile)),negatives};
verifyCodeAssistVerification(report,fs.readFileSync(nodeFile),fs.readFileSync(browserFile));
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log('Code assist verified; '+negatives.length+' invalid reports rejected');
