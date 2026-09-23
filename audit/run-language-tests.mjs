import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadApi} from './browser/legacy/audit-lib.cjs';
import {finiteCases} from './fixtures/language/forms.mjs';
import {inlineCases,inlineNegative} from './fixtures/language/inline.mjs';
import {snapshot,sha,withBrowser,pageFor} from './lib/product-test-host.mjs';
import {expectedLanguageIds,verifyLanguageResults} from './lib/verify-language-results.mjs';
import {readHistoricalSource} from './lib/historical-source.mjs';
const product='Akari.html', browser=process.argv[2], nodeOnly=browser==='--node';
const output=process.argv[3] || `audit-evidence/phase3/language-${nodeOnly?'node':'browser'}.json`;
if(fs.existsSync(output))throw Error('Evidence already exists: '+output);
let browserVersion;
const manifest=JSON.parse(fs.readFileSync('audit/manifests/language-form-coverage.json'));
assert.equal(manifest.cases.length,256);
assert.deepEqual(manifest.cases.map(({id,key,source,canonical,phase,transition})=>({id,key,source,canonical,phase,transition})),finiteCases.map(({id,key,source,canonical,phase,transition})=>({id,key,source,canonical,phase,transition})));
assert.equal(new Set(manifest.cases.map(c=>c.id+'/'+c.key)).size,256);
const baseBytes=readHistoricalSource(manifest.baseline,'Akari.html');
assert.equal(sha(baseBytes),manifest.productSha256);
const base=loadApi(baseBytes.toString('utf8')), api=loadApi(fs.readFileSync(product,'utf8'));
const suite=fs.readFileSync('audit/suites/language-forms.js','utf8');
const f=vm.runInNewContext(suite+'\n({runLanguageForms09,languageExecution09})',{structuredClone});
const golden=Object.fromEntries(manifest.cases.map(c=>[c.id+'/'+c.key,f.languageExecution09(base,c.canonical)]));
const legacy=base.COMMAND_CATALOG.map(c=>({source:c.source,ast:base.parseSyntax(c.source).ast}));
for(const name of ['値未満','値と等しい','値だけ','値より値','もし値','ならば','間','横縦秒']) {
 for(const source of [`${name}と言う`,`【${name}】と言う`,`${name}を1にする`]) {
  const r=base.parseSyntax(source);if(r.ast)legacy.push({source,ast:r.ast});
 }
}
const schemaIds=base.BLOCK_SCHEMAS.map(s=>s.id);
const before=snapshot(product), args={manifest,golden,legacy,schemaIds,inlineCases,inlineNegative};
const report=nodeOnly ? f.runLanguageForms09(api,manifest,golden,legacy,schemaIds,inlineCases,inlineNegative) :
  await withBrowser(browser,b=>{browserVersion=b.version();return pageFor(b,product,async page=>{
    await page.evaluate(suite);
    return await page.evaluate(({manifest,golden,legacy,schemaIds,inlineCases,inlineNegative})=>runLanguageForms09(Akari,manifest,golden,legacy,schemaIds,inlineCases,inlineNegative),args);
  });});
assert.deepEqual(snapshot(product),before,'snapshot changed during execution');
const expected=expectedLanguageIds(manifest);
assert.equal(new Set(report.results.map(r=>r.id)).size,expected.length,'duplicate or missing tests');
assert.deepEqual([...report.results].map(r=>r.id).sort(),expected.sort());
const result={...report,environment:nodeOnly?'node':'chromium',browser:browserVersion,snapshot:before,
  phase3LanguageComplete:report.failed===0&&report.blocked===0&&!nodeOnly,
  status:report.failed?'FAIL':report.blocked?'BLOCKED':'PASS',legacyCorpus:legacy.length};
fs.mkdirSync('audit-evidence/phase3',{recursive:true});
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({total:result.total,failed:result.failed,blocked:result.blocked,deferred:result.deferred,status:result.status}));
for(const r of report.results.filter(r=>r.status==='FAIL'))console.error(r);
if(!report.failed) verifyLanguageResults(JSON.parse(JSON.stringify(result)),manifest,before);
process.exitCode=result.failed?1:result.blocked?2:0;
