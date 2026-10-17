import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {currentProductFile,currentProductVersion} from '../lib/product-path.cjs';
import {snapshot,root} from '../lib/product-test-host.mjs';
import {publicationIds,trackedFiles,assertInventoryMatches,releaseNameViolations,isDocument,verifyPublicationReport,checkPublicationValidatorNegatives} from '../lib/publication-contract.mjs';

//   node audit/tests/publication.mjs inventory <result.json>   audit/public-files.json equals the tracked files
//   node audit/tests/publication.mjs documents <result.json>   tracked Markdown/HTML name only the current release
const [mode,outputArgument]=process.argv.slice(2);
assert.ok(Object.hasOwn(publicationIds,mode)&&outputArgument,'usage: node audit/tests/publication.mjs inventory|documents <result.json>');
const output=path.resolve(outputArgument);
assert.ok(!fs.existsSync(output),'fresh result required: '+output);
fs.mkdirSync(path.dirname(output),{recursive:true});
const inputs=snapshot(currentProductFile()),results=[];
function check(id,fn){try{fn();results.push({id,status:'PASS'});}catch(error){results.push({id,status:'FAIL',error:error.stack});}}
const productFile=currentProductFile(),productVersion=currentProductVersion(),current={productFile,productVersion};
const report={schema:mode==='inventory'?'akari-publication-inventory-v1':'akari-document-releases-v1',status:'FAIL',snapshot:inputs,productFile,productVersion};

if(mode==='inventory'){
  const listed=JSON.parse(fs.readFileSync(path.join(root,'audit/public-files.json'),'utf8')).files;
  // Scaffolding directories for the repository refusals; removed before the result is written.
  const scaffold=fs.mkdtempSync(path.join(path.dirname(output),'publication-scaffold-'));
  const fixture=['LICENSE','README.md','audit/public-files.json'];
  try{
    check('INVENTORY-EQUALS-TRACKED',()=>{const tracked=trackedFiles(root);report.tracked=tracked.length;assertInventoryMatches(listed,tracked);});
    check('REJECT-LISTED-UNTRACKED',()=>{assertInventoryMatches(fixture,fixture);assert.throws(()=>assertInventoryMatches([...fixture,'retired.md'],fixture),/"untracked":\["retired\.md"\]/);});
    check('REJECT-TRACKED-UNLISTED',()=>assert.throws(()=>assertInventoryMatches(fixture.slice(1),fixture),/"unlisted":\["LICENSE"\]/));
    check('REJECT-DUPLICATE-LISTED',()=>assert.throws(()=>assertInventoryMatches([...fixture,'README.md'],fixture),/"repeated":\["README\.md"\]/));
    check('REJECT-NO-REPOSITORY',()=>{const dir=fs.mkdtempSync(path.join(scaffold,'plain-'));fs.writeFileSync(path.join(dir,'LICENSE'),'fixture\n');assert.throws(()=>trackedFiles(dir),/needs a git checkout; no \.git at/);});
    // git itself would find the enclosing checkout from a subdirectory; the inventory refuses instead.
    check('REJECT-REPOSITORY-SUBDIRECTORY',()=>assert.throws(()=>trackedFiles(path.join(root,'audit')),/needs a git checkout; no \.git at/));
    check('REJECT-BROKEN-REPOSITORY',()=>{const dir=fs.mkdtempSync(path.join(scaffold,'broken-'));fs.writeFileSync(path.join(dir,'.git'),'gitdir: '+path.join(dir,'missing').replaceAll('\\','/')+'\n');assert.throws(()=>trackedFiles(dir),/git rev-parse --show-toplevel failed/);});
    check('REJECT-INCOMPLETE-REPORT',()=>checkPublicationValidatorNegatives('inventory'));
  }finally{fs.rmSync(scaffold,{recursive:true,force:true});}
}else{
  // Release labels that are not the current one: an old release and the next patch.
  const [major,minor,patch]=productVersion.split('.').map(Number);
  const others=['0.0.1',major+'.'+minor+'.'+(patch+1)];
  for(const label of others)assert.notEqual(label,productVersion);
  const fileOf=label=>'Akari_'+label.replaceAll('.','_')+'.html';
  check('DOCUMENTS-NAME-CURRENT-RELEASE',()=>{
    report.documents=trackedFiles(root).filter(isDocument);assert.ok(report.documents.length>0,'tracked documents');
    report.violations=report.documents.flatMap(file=>releaseNameViolations(file,fs.readFileSync(path.join(root,file),'utf8'),current));
    if(report.violations.length)throw Error('documents name another product file or release:\n'+report.violations.map(v=>v.file+':'+v.line+' '+v.found+' (current '+v.expected+')').join('\n'));
  });
  check('ACCEPT-CURRENT-RELEASE-AND-TOOL-VERSIONS',()=>{
    const text=['# あかり '+productVersion,'現行製品は ['+productFile+'](./'+productFile+') です。v'+productVersion+'。','固定 Chrome for Testing 140.0.7339.207・Playwright 1.55.0、playwright@1.55.0 @babel/parser@7.28.4、jsdom 26.1.0、Node.js 24.0.0。'].join('\n');
    assert.deepEqual(releaseNameViolations('fixture.md',text,current),[]);
  });
  check('REJECT-RETIRED-PRODUCT-FILE',()=>{
    for(const name of [...others.map(fileOf),productFile.replace('Akari_','Akari')])
      assert.deepEqual(releaseNameViolations('fixture.md','開く: ['+name+'](./'+name+')\n',current).map(v=>[v.found,v.line]),[[name,1],[name,1]],name);
  });
  check('REJECT-OTHER-RELEASE-LABEL',()=>{
    for(const label of others)for(const text of ['あかり '+label+' の拡張API','製品版は'+label+'です。','v'+label,'<title>Akari '+label+'</title>','初版は'+label+'。\n'+productVersion])
      assert.deepEqual(releaseNameViolations('fixture.md','前置き\n'+text,current).map(v=>[v.found,v.line]),[[label,2]],text);
  });
  check('REJECT-INCOMPLETE-REPORT',()=>checkPublicationValidatorNegatives('documents'));
}

assert.deepEqual(results.map(r=>r.id),publicationIds[mode]);
report.results=results;report.status=results.every(r=>r.status==='PASS')?'PASS':'FAIL';
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
if(report.status!=='PASS'){console.error(JSON.stringify(results.filter(r=>r.status!=='PASS'),null,2));process.exitCode=1;}
else{verifyPublicationReport(report,mode,snapshot(currentProductFile()));console.log('Publication '+mode+': '+results.length+' PASS');}
