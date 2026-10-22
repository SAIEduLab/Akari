// Every ```text example of LANGUAGE.md and EXTENSIONS.md is read by the product parser:
// ordinary blocks are accepted as one script, blocks marked as intentionally invalid are
// rejected statement by statement. The same run proves each rejection rule on mutated
// documents and each gate-validator rule on a mutated report.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {checkSpecExamples,readSpecExampleDocuments,specExampleNegativeIds,specExampleValidatorNegativeIds,
  verifySpecExampleReport,verifySpecExamples} from '../lib/spec-examples-contract.mjs';
import {buildDerivedProduct} from '../../extensions/build.mjs';

const require=createRequire(import.meta.url),out=process.argv[2];
if(!out)throw Error('usage: node audit/tests/spec-examples.mjs <result.json>');
const product=currentProductFile(),inputs=snapshot(product),api=loadApi(fs.readFileSync(product,'utf8'));
// The extension guide's examples name the extensions of extensions/examples/offline.js and meijin.js.
const artifacts=path.resolve(out).replace(/\.json$/,'.artifacts'),derivedFile=path.join(artifacts,'derived-offline.html');
const {offline,text}=require('../../extensions/examples/offline.js'),{meijin}=require('../../extensions/examples/meijin.js');
await buildDerivedProduct({product,output:derivedFile,extensions:[offline,text,meijin]});
const apis={standard:api,'offline-extensions':loadApi(fs.readFileSync(derivedFile,'utf8'))};
const documents=readSpecExampleDocuments(),main=checkSpecExamples(documents,apis);

// Negative cases on synthetic documents: the control must not show the failure, the mutation must.
const doc=text=>[{file:'NEGATIVE.md',context:'standard',text}];
const failuresOf=docs=>checkSpecExamples(docs,apis).failures;
const fence=(body,mark)=>(mark?`<!-- akari-example: ${mark} -->\n`:'')+'```text\n'+body+'\n```\n';
const extensionDocument=documents.find(d=>d.file==='EXTENSIONS.md');
const negatives=[
  ['accepted-example-rejected-detected','rejected:NEGATIVE.md:1',doc(fence('何もしない。')),doc(fence('何もしない。\n次のくり返しへ進む。'))],
  ['rejected-example-accepted-detected','accepted:NEGATIVE.md:2',doc(fence('次のくり返しへ進む。','rejected')),doc(fence('何もしない。','rejected'))],
  // A whole-block reading would reject this block; each statement is read on its own.
  ['rejected-unit-masking-detected','accepted:NEGATIVE.md:2:何もしない。',doc(fence('次のくり返しへ進む。\n次のことを10回くり返す。\n  何もしない。','rejected')),
    doc(fence('次のくり返しへ進む。\n何もしない。','rejected'))],
  ['expression-example-rejected-detected','rejected:NEGATIVE.md:2',doc(fence('2＋3','expression')),doc(fence('2＋3\n2＋','expression'))],
  ['unknown-marker-detected','marker:NEGATIVE.md:1:maybe',doc(fence('何もしない。')),doc(fence('何もしない。','maybe'))],
  ['dangling-marker-detected','marker:NEGATIVE.md:1:dangling',doc(fence('次のくり返しへ進む。','rejected')),
    doc('<!-- akari-example: rejected -->\n\n'+fence('次のくり返しへ進む。'))],
  ['unclosed-block-detected','unclosed:NEGATIVE.md:1',doc(fence('何もしない。')),doc('```text\n何もしない。\n')],
  ['empty-block-detected','empty:NEGATIVE.md:1',doc(fence('何もしない。')),doc(fence(''))],
  ['document-without-blocks-detected','no-blocks:NEGATIVE.md',doc(fence('何もしない。')),doc('説明だけの文書。\n')],
  // The derived product is load-bearing: the standard product rejects the extension examples.
  ['extension-context-detected','rejected:EXTENSIONS.md:',[extensionDocument],[{...extensionDocument,context:'standard'}]],
  // 名人 examples are read as 名人 scripts; a 名人 text that the check stops is a failed example, one it reads is a failed rejected example.
  ['meijin-example-rejected-detected','rejected:NEGATIVE.md:2',doc(fence('ねこは、いまのばしょから、右へ10歩動く。','meijin')),doc(fence('ねこは、いまのばしょから、右へ10歩動く。\nねこはゆっくり前へ10歩進む。','meijin'))],
  ['meijin-rejected-example-accepted-detected','accepted:NEGATIVE.md:2',doc(fence('ねこはゆっくり前へ10歩進む。','meijin-rejected')),doc(fence('ねこは、いまのばしょから、右へ10歩動く。','meijin-rejected'))],
  ['meijin-rejected-unit-masking-detected','accepted:NEGATIVE.md:2:ねこは、いまのばしょから、右へ10歩動く。',doc(fence('ねこはゆっくり前へ10歩進む。\nねこは犬の近くへ行く。','meijin-rejected')),
    doc(fence('ねこはゆっくり前へ10歩進む。\nねこは、いまのばしょから、右へ10歩動く。','meijin-rejected'))],
].map(([id,expected,control,mutated])=>{
  const hit=failures=>failures.find(failure=>failure.startsWith(expected));
  const found=hit(failuresOf(mutated));
  return {id,rejected:!hit(failuresOf(control))&&!!found,failure:found||'accepted'};
});
if(negatives.map(row=>row.id).join()!==specExampleNegativeIds.join())throw Error('negative case registration changed');

const report={schema:'akari-spec-examples-v1',status:main.failures.length||negatives.some(row=>!row.rejected)?'FAIL':'PASS',snapshot:inputs,
  blocks:main.rows,negatives,failures:main.failures,derivedProduct:{path:path.basename(derivedFile),sha256:sha(fs.readFileSync(derivedFile))}};
const options={documents,artifacts};
const accepted=(()=>{try{verifySpecExampleReport(report,inputs,options);return true;}catch{return false;}})();
const rejects=mutate=>{const copy=structuredClone(report);mutate(copy);try{verifySpecExampleReport(copy,inputs,options);return false;}catch{return true;}};
report.validatorNegatives=[
  ['report-failed-status',r=>{r.status='FAIL';}],
  ['report-failure-listed',r=>{r.failures.push('rejected:LANGUAGE.md:1');}],
  ['report-missing-block',r=>{r.blocks.pop();}],
  ['report-extra-block',r=>{r.blocks.push({...r.blocks[0],line:r.blocks[0].line+1});}],
  ['report-failed-block',r=>{r.blocks[0].status='FAIL';}],
  ['report-changed-mode',r=>{r.blocks[0].mode=r.blocks[0].mode==='rejected'?'script':'rejected';}],
  ['report-negative-missing',r=>{r.negatives.pop();}],
  ['report-negative-accepted',r=>{r.negatives[0].rejected=false;}],
  ['report-snapshot',r=>{r.snapshot={...r.snapshot,productSha256:'0'.repeat(64)};}],
  ['report-derived-product',r=>{r.derivedProduct.sha256='0'.repeat(64);}],
].map(([id,mutate])=>({id,rejected:accepted&&rejects(mutate)}));
if(report.validatorNegatives.map(row=>row.id).join()!==specExampleValidatorNegativeIds.join())throw Error('validator negative registration changed');
if(report.validatorNegatives.some(row=>!row.rejected))report.status='FAIL';

fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
if(report.status!=='PASS'){
  console.error(JSON.stringify({status:'FAIL',failures:main.failures,negatives:negatives.filter(row=>!row.rejected),
    validatorNegatives:report.validatorNegatives.filter(row=>!row.rejected)},null,1));
  process.exit(1);
}
console.log(JSON.stringify(verifySpecExamples(report,inputs,options)));
