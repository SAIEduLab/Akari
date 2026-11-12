import { currentProductFile } from "./lib/product-path.cjs";
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadApi} from './browser/cases/audit-lib.cjs';
import {finiteCases} from './fixtures/language/forms.mjs';
import {languageSuite,languageArgs,runLanguageInNode} from './lib/language-suite.mjs';
import {snapshot,sha,withBrowser,pageFor} from './lib/product-test-host.mjs';
import {expectedLanguageIds,verifyLanguageResults} from './lib/verify-language-results.mjs';
const product=currentProductFile(), browser=process.argv[2], nodeOnly=browser==='--node';
const output=process.argv[3] || `audit-evidence/language/language-${nodeOnly?'node':'browser'}.json`;
if(fs.existsSync(output))throw Error('Evidence already exists: '+output);
let browserVersion;
const language=languageSuite(),{suite,args}=language,{manifest}=args;
assert.deepEqual(manifest.cases.map(({id,key,source,canonical})=>({id,key,source,canonical})),finiteCases.map(({id,key,source,canonical})=>({id,key,source,canonical})));
assert.equal(new Set(manifest.cases.map(c=>c.id+'/'+c.key)).size,manifest.cases.length,'duplicate finite case');
const api=loadApi(fs.readFileSync(product,'utf8'));
const auditPaths=['audit/fixtures/regression-project.cjs','audit/fixtures/language/forms.mjs','audit/fixtures/language/inline.mjs','audit/fixtures/language/expected.json','audit/manifests/language-form-coverage.json','audit/suites/language-forms.js','audit/run-language-tests.mjs','audit/lib/language-suite.mjs'];
const inputHashes=()=>Object.fromEntries(auditPaths.map(file=>[file,sha(fs.readFileSync(file))]));
const auditInputs=inputHashes();
const before=snapshot(product);
const report=nodeOnly ? runLanguageInNode(api,language) :
  await withBrowser(browser,b=>{browserVersion=b.version();return pageFor(b,product,async page=>{
    await page.evaluate(suite);
    return await page.evaluate(values=>runLanguageForms(Akari,...values),languageArgs(args));
  });});
assert.deepEqual(snapshot(product),before,'snapshot changed during execution');
assert.deepEqual(inputHashes(),auditInputs,'audit inputs changed during execution');
const expected=expectedLanguageIds(manifest);
assert.equal(new Set(report.results.map(r=>r.id)).size,expected.length,'duplicate or missing tests');
assert.deepEqual([...report.results].map(r=>r.id).sort(),expected.sort());
const result={...report,environment:nodeOnly?'node':'chromium',browser:browserVersion,snapshot:before,
  browserLanguageComplete:report.failed===0&&!nodeOnly,
  status:report.failed?'FAIL':'PASS',referenceCorpusCount:args.referenceCorpus.length,auditInputs};
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({total:result.total,failed:result.failed,status:result.status}));
for(const r of report.results.filter(r=>r.status==='FAIL'))console.error(r);
if(!report.failed) verifyLanguageResults(JSON.parse(JSON.stringify(result)),manifest,before);
process.exitCode=result.failed?1:0;
