import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import {snapshot} from '../lib/product-test-host.mjs';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {verifyAuthority} from '../lib/verify-test-results.mjs';
import {expectedLanguageIds} from '../lib/verify-language-results.mjs';
const html=fs.readFileSync('Akari.html','utf8');new vm.Script(html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')));
const api=loadApi(html),features=JSON.parse(fs.readFileSync('audit/manifests/features.json'));
for(const key of ['COMMAND_CATALOG','LIMITS','EXECUTABLE_VERSION'])assert.deepEqual(JSON.parse(JSON.stringify(api[key])),features[key],key);
assert.deepEqual([...api.BLOCK_SCHEMAS.map(s=>s.id)],features.schemaIds);
const productTests=JSON.parse(fs.readFileSync('audit/manifests/product-tests.json'));
verifyAuthority(productTests);
const numberedStage=/^(?:[A-Z]{1,12}\d{2,3}-|\d{2,3} [A-Za-z]|run[A-Za-z]+\d{2,3}Tests$)/;
const functionalId=(id,kind)=>{assert.ok(typeof id==='string'&&id.length>0,kind+' missing');assert.doesNotMatch(id,numberedStage,kind+' uses a version-derived name: '+id);};
for(const sample of ['FEATURE42-CASE','42 sample','runFuture42Tests'])assert.throws(()=>functionalId(sample,'negative example'));
for(const suite of productTests.suites){functionalId(suite.name,'suite');for(const id of suite.ids)functionalId(id,'product test');}
const browserTests=JSON.parse(fs.readFileSync('audit/manifests/browser-results.json'));
for(const entry of browserTests.entries){functionalId(entry.task,'browser task');for(const id of entry.keys)functionalId(id,'browser test');}
const languageTests=JSON.parse(fs.readFileSync('audit/manifests/language-form-coverage.json'));
for(const id of expectedLanguageIds(languageTests))functionalId(id,'language test');
const audit=fs.readFileSync('AUDIT.md','utf8'),capabilities=audit.split(/\r?\n/).filter(l=>/^\| [a-z]+:/.test(l));
assert.equal(capabilities.length,257);
for(const row of capabilities)functionalId(row.split('|')[1].trim(),'capability');
const files=JSON.parse(fs.readFileSync('audit/public-files.json')).files;
assert.equal(new Set(files).size,files.length);assert.ok(files.includes('Akari.html')&&files.includes('LANGUAGE.md')&&files.includes('AUDIT.md'));
for(const file of files){assert.ok(!path.isAbsolute(file)&&!file.split('/').includes('..'));assert.ok(fs.existsSync(file),file);assert.ok(!/(AGENTS|PROJECT_INSTRUCTIONS|PUBLIC_SYNC|fixtures\/(?:0\.|1\.)|historical|checkpoint|records\/)/.test(file),file);if(file.startsWith('audit/suites/run'))functionalId(path.basename(file,'.js'),'suite file');}
for(const file of files.filter(p=>/\.(mjs|cjs|js)$/.test(p))){
  const source=fs.readFileSync(file,'utf8');
  for(const m of source.matchAll(/(?:from\s*|require\(\s*|import\s*)['"](\.[^'"]+)['"]/g)){
    const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1]));
    assert.ok(files.includes(target)||files.includes(target+'.js'),file+' imports unpublished '+target);
  }
}
assert.ok(!/run[A-Za-z0-9]*Tests/.test(html),'tests embedded in product');
const report={status:'PASS',snapshot:snapshot('Akari.html'),capabilities:257,files:files.length};
fs.writeFileSync(process.argv[2]||'audit-evidence/static.json',JSON.stringify(report,null,2)+'\n');console.log('Static publication contract: PASS');
