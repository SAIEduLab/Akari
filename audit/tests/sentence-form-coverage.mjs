// Every finite sentence form the product accepts has an independent case that reaches it.
// The same run proves each rejection rule on a mutated catalog, case or product script,
// and each gate-validator rule on a mutated report.
import fs from 'node:fs';
import path from 'node:path';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
import {sentenceFormProject,sentenceFormCases} from '../fixtures/language/sentence-forms.mjs';
import {ablateEntry,checkSentenceFormCoverage,productScript,readStaticTables,sentenceFormNegativeIds,sentenceFormTables,
  sentenceFormValidatorNegativeIds,verifySentenceFormCoverage,verifySentenceFormReport} from '../lib/sentence-form-coverage.mjs';

const out=process.argv[2];
if(!out)throw Error('usage: node audit/tests/sentence-form-coverage.mjs <result.json>');
const product=currentProductFile(),html=fs.readFileSync(product,'utf8'),script=productScript(html),api=loadApi(html);
const symbolsFor=productApi=>productApi.buildSymbols(sentenceFormProject(productApi.makeEmptyProject()));
const variantFor=form=>loadApi('<script>'+ablateEntry(script,form)+'</script>');
const catalog=sentenceFormTables(api,script);
const run=(cases,{forms=catalog,productApi=api,variants=variantFor}={})=>checkSentenceFormCoverage(productApi,forms,cases,{symbolsFor,variantFor:variants}).failures;
// A product copy with a redundant table entry that another reader already reads.
const redundant=(from,to)=>{if(!script.includes(from))throw Error('redundant entry anchor missing: '+from);const copy=script.replace(from,to),copyApi=loadApi('<script>'+copy+'</script>');
  return {forms:sentenceFormTables(copyApi,copy),productApi:copyApi,variants:form=>loadApi('<script>'+ablateEntry(copy,form)+'</script>')};};
const redundantAdd=redundant("['に代入する','Assignment',null], ['に加える','NumericUpdate','ADD']","['に代入する','Assignment',null], ['に足す','NumericUpdate','ADD'], ['に加える','NumericUpdate','ADD']");
const redundantPolite=redundant("['たずねます','たずねる']","['たずねます','たずねる'],['くり返します','くり返す']");
const main=checkSentenceFormCoverage(api,catalog,sentenceFormCases,{symbolsFor,variantFor});

// Negative cases: the control must not show the failure, the mutation must.
const base=id=>{const found=sentenceFormCases.find(c=>c.id===id);if(!found)throw Error('negative base case missing: '+id);return structuredClone(found);};
const withClaims=(id,claims)=>({...base(id),claims:{...base(id).claims,...claims}});
const withoutClaim=(id,formId)=>{const c=base(id);delete c.claims[formId];return c;};
const extended=(extra)=>({...catalog,forms:new Map([...catalog.forms,[extra.id,extra]])});
const without=id=>({...catalog,forms:new Map([...catalog.forms].filter(([key])=>key!==id))});
const thrown=fn=>{try{fn();return [];}catch(error){return ['error:'+error.message];}};
const firstTe=readStaticTables(script).te[0].literal;
const negatives=[
  ['product-addition-detected','missing:sentence:AuditAddedForm',()=>run([base('SF-variable-input')]),
    ()=>run([base('SF-variable-input')],{forms:extended({id:'sentence:AuditAddedForm',table:'sentence',index:catalog.forms.size,kind:'NoOperation',op:null,pattern:/^監査だけの文$/d})})],
  ['product-removal-detected','unknown:sentence:Assignment:variableInput:SF-variable-input',()=>run([base('SF-variable-input')]),
    ()=>run([base('SF-variable-input')],{forms:without('sentence:Assignment:variableInput')})],
  ['table-missing-detected','error:te table missing',()=>thrown(()=>readStaticTables(script)),
    ()=>thrown(()=>readStaticTables(script.replaceAll('SENTENCE_TE_FORMS','SENTENCE_TE_ROWS')))],
  ['table-shape-detected','error:te table must be string pairs',()=>thrown(()=>readStaticTables(script)),
    ()=>thrown(()=>readStaticTables(script.slice(0,firstTe.end)+",'監査'"+script.slice(firstTe.end)))],
  ['duplicate-form-detected','duplicate-form:sentence:'+api.SENTENCE_FORMS[0].id,()=>sentenceFormTables(api,script).failures,
    ()=>sentenceFormTables({SENTENCE_FORMS:[...api.SENTENCE_FORMS,api.SENTENCE_FORMS[0]],CONDITION_FORMS:api.CONDITION_FORMS},script).failures],
  ['duplicate-case-detected','duplicate-case:SF-variable-input',()=>run([base('SF-variable-input')]),
    ()=>run([base('SF-variable-input'),base('SF-variable-input')])],
  ['no-claim-detected','no-claim:SF-variable-input',()=>run([base('SF-variable-input')]),
    ()=>run([{...base('SF-variable-input'),claims:{}}])],
  ['ast-mismatch-detected','ast:SF-variable-input',()=>run([base('SF-variable-input')]),
    ()=>{const c=base('SF-variable-input');c.expected.body[0].target.name='点数';return run([c]);}],
  ['parse-failure-detected','parse:SF-variable-input:',()=>run([base('SF-variable-input')]),
    ()=>run([{...base('SF-variable-input'),source:'答えを【名前】という変数に入れる」'}])],
  ['missing-evidence-detected','missing-evidence:SF-variable-input:sentence:Assignment:variableInput',()=>run([base('SF-variable-input')]),
    ()=>run([withClaims('SF-variable-input',{'sentence:Assignment:variableInput':'答えを【名前】という変数に置く'})])],
  ['unmatched-pattern-detected','unmatched-pattern:SF-glide-te:sentence:Broadcast',()=>run([base('SF-glide-te')]),
    ()=>run([withClaims('SF-glide-te',{'sentence:Broadcast':'姿をかくす'})])],
  ['shadowed-pattern-detected','shadowed-pattern:SF-set-x:sentence:Assignment',()=>run([base('SF-set-x')]),
    ()=>run([withClaims('SF-set-x',{'sentence:Assignment':'横位置を100にする'})])],
  ['absent-node-detected','absent-node:SF-wait-polite:sentence:Forever',()=>run([base('SF-wait-polite')]),
    ()=>run([withClaims('SF-wait-polite',{'sentence:Forever':'1秒待ちます'})])],
  ['unmatched-surface-detected','unmatched-surface:SF-glide-te:te:すべって',()=>run([base('SF-glide-te')]),
    ()=>run([withClaims('SF-glide-te',{'te:すべって':'姿をかくす'})])],
  ['condition-context-detected','condition-context:SF-contains-while:condition:含まれている/plain',()=>run([base('SF-contains-while')]),
    ()=>run([withClaims('SF-contains-while',{'condition:含まれている/plain':'【名前一覧】に「あかり」が含まれている'})])],
  ['condition-longer-surface-detected','condition-longer-surface:SF-contains-while:condition:含まれている/whileYes',()=>run([base('SF-contains-while')]),
    ()=>run([base('SF-contains-while')],{forms:extended({id:'condition:監査/whileYes',table:'condition',slot:'whileYes',surface:'が含まれているあいだ'})})],
  // A dead entry: the finite sentence form reads this clause before the alternative ending.
  ['unused-entry-detected','not-load-bearing:SF-add-value-first:ending:に足す',()=>run([base('SF-add-value-first')]),
    ()=>run([withClaims('SF-add-value-first',{'ending:に足す':'3を点数に足す'})],redundantAdd)],
  // Another reader: 「これを…回くり返します」 is read without a polite table entry.
  ['other-reader-detected','not-load-bearing:SF-repeat-previous:polite:くり返します',()=>run([base('SF-repeat-previous')]),
    ()=>run([withClaims('SF-repeat-previous',{'polite:くり返します':'これを2回くり返します'})],redundantPolite)],
].map(([id,expected,control,mutated])=>{
  const hit=failures=>failures.find(failure=>failure.startsWith(expected));
  const clean=control(),found=hit(mutated());
  return {id,rejected:!hit(clean)&&!!found,failure:found||'accepted'};
});
if(negatives.map(row=>row.id).join()!==sentenceFormNegativeIds.join())throw Error('negative case registration changed');

const inputs=snapshot(product);
const report={schema:'akari-sentence-form-coverage-v1',status:main.failures.length||negatives.some(row=>!row.rejected)?'FAIL':'PASS',
  snapshot:inputs,tables:catalog.counts,formIds:[...catalog.forms.keys()],results:main.results,negatives,failures:main.failures};

// Validator negatives: the control report is accepted, each mutated report is rejected.
const rejects=mutate=>{const copy=structuredClone(report);mutate(copy);try{verifySentenceFormReport(copy,inputs);return false;}catch{return true;}};
const accepted=(()=>{try{verifySentenceFormReport(report,inputs);return true;}catch{return false;}})();
report.validatorNegatives=[
  ['report-failed-status',r=>{r.status='FAIL';}],
  ['report-failure-listed',r=>{r.failures.push('missing:te:監査');}],
  ['report-missing-form',r=>{r.formIds.push('te:監査');r.tables.te++;}],
  ['report-unknown-claim',r=>{r.results[0].claims.push('te:監査');}],
  ['report-failed-case',r=>{r.results[0].status='FAIL';}],
  ['report-negative-missing',r=>{r.negatives.pop();}],
  ['report-negative-accepted',r=>{r.negatives[0].rejected=false;}],
  ['report-snapshot',r=>{r.snapshot={...r.snapshot,productSha256:'0'.repeat(64)};}],
].map(([id,mutate])=>({id,rejected:accepted&&rejects(mutate)}));
if(report.validatorNegatives.map(row=>row.id).join()!==sentenceFormValidatorNegativeIds.join())throw Error('validator negative registration changed');
if(report.validatorNegatives.some(row=>!row.rejected))report.status='FAIL';

fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
if(report.status!=='PASS'){
  console.error(JSON.stringify({status:'FAIL',failures:main.failures,negatives:negatives.filter(row=>!row.rejected),
    validatorNegatives:report.validatorNegatives.filter(row=>!row.rejected)},null,1));
  process.exit(1);
}
const verified=verifySentenceFormCoverage(report,inputs);
console.log(JSON.stringify(verified));
// Unreachable product entries stay visible in every run for the owner's decision.
