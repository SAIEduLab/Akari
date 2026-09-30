import { currentProductFile } from "./../lib/product-path.cjs";
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {releasePolicyIssues} from '../lib/release-policy.mjs';

const base=`<script>
const PRODUCT_RELEASE = '1.0.0';
const EXECUTABLE_CONTRACT = Object.freeze({languageContractId:1,runtimeContractId:1,programFormatVersion:1,projectFormatVersion:1});
function validProducerLabel(value){return typeof value==='string' && value.length<=64;}
function makeDefaultProject(){return {appVersion:PRODUCT_RELEASE,languageContractId:1,formatVersion:1};}
function serializedRoot(){return {appVersion:PRODUCT_RELEASE};}
function packExecutable(){return {appVersion:PRODUCT_RELEASE};}
function productLabel(){return \`あかり \${PRODUCT_RELEASE}\`;}
function markdownBody(root){return '# あかり ' + root.appVersion + ' の作品';}
function assetStateFingerprint(project){const {appVersion:producerLabel,...content}=project;return JSON.stringify(content);}
function validateProject(project){if(!validProducerLabel(project.appVersion))throw Error('producer');if(project.formatVersion!==EXECUTABLE_CONTRACT.projectFormatVersion)throw Error('format');}
const Akari={PRODUCT_RELEASE};
</script>`;
const issues=(html=base,audit=[])=>releasePolicyIssues(html,audit);
const reject=(html,audit,match)=>assert.ok(issues(html,audit).some(issue=>match.test(issue)),match+' should be rejected');
assert.deepEqual(issues(),[]);
assert.deepEqual(issues(base,[{file:'audit/example.js',source:'function validateCase001(){} function base64Encode(){} function formatVersion(){}'}]),[]);
assert.deepEqual(issues(base.replace('</script>','function parseIPv6Address(){}\n</script>'),
  [{file:'audit/example.js',source:'function decodeIPv6Address(){} function parseBase64Data(){}'}]),[]);
assert.deepEqual(issues(base,[{file:'audit/example.js',source:"const example={'release-1.0.0':true}; const codecs={base64:()=>{}};"}]),[]);
for(const name of ['restoreV103','runVersion09Tests','parseRelease104','runCore103Tests']){
  reject(base.replace('</script>',`function ${name}(){}\n</script>`),[],/release-derived identifier/);
  reject(base,[{file:'audit/example.js',source:`function ${name}(){}`}],/release-derived identifier/);
}
reject(base,[{file:'audit/example.js',source:"const audit={'restoreV103':()=>{}};"}],/release-derived identifier/);
reject(base,[{file:'audit/example.js',source:'const runVersion09Tests=()=>{};'}],/release-derived identifier/);
reject(base.replace('project.formatVersion!==EXECUTABLE_CONTRACT.projectFormatVersion','project.appVersion!==PRODUCT_RELEASE'),[],/appVersion read|PRODUCT_RELEASE read/);
reject(base.replace('</script>',`function compatibility(project){const label=project.appVersion;return label===PRODUCT_RELEASE;}\n</script>`),[],/appVersion read|PRODUCT_RELEASE read/);
reject(base.replace('</script>',`function compatibility(project){const label=PRODUCT_RELEASE;return label;}\n</script>`),[],/PRODUCT_RELEASE read/);
reject(base.replace('</script>',`function test(project){if(project.appVersion==='1.0.0')return true;}\n</script>`),[],/appVersion read/);
reject(base.replace('</script>',`function test(project){if(project['appVersion']==='old')return true;}\n</script>`),[],/appVersion read/);
reject(base.replace('</script>',`function test(project){if(project.formatVersion==='1.0.0')return true;}\n</script>`),[],/copied release literal/);
reject(base.replace('</script>',`function test(project){const {appVersion:label}=project;return label;}\n</script>`),[],/destructuring/);
reject(base.replace('languageContractId:1,runtimeContractId:1,programFormatVersion:1,projectFormatVersion:1','languageContractId:1,runtimeContractId:1,programFormatVersion:1,projectFormatVersion:0'),[],/EXECUTABLE_CONTRACT/);

// Mutate the actual candidate source, so the guard is checked against its real syntax.
const actual=fs.readFileSync(currentProductFile(),'utf8');
assert.deepEqual(issues(actual),[],'candidate product must satisfy the release policy');
const inject=code=>actual.replace(/<\/script>(?![\s\S]*<\/script>)/,`${code}\n</script>`);
reject(inject('function restoreV103(){}'),[],/release-derived identifier/);
reject(inject('function releaseGate(project){return project.appVersion===PRODUCT_RELEASE;}'),[],/appVersion read|PRODUCT_RELEASE read/);
reject(inject('function releaseAlias(project){const producer=project.appVersion;return producer;}'),[],/appVersion read/);
reject(inject('const renamedRuntime={restoreV103(){}};'),[],/release-derived identifier/);
reject(inject('class NamedRuntime { restoreV103(){} }'),[],/release-derived identifier/);
reject(base.replace('return JSON.stringify(content);','return producerLabel + JSON.stringify(content);'),[],/omitted producer metadata/);
reject(base.replace('const Akari={PRODUCT_RELEASE};','const alias={PRODUCT_RELEASE};'),[],/PRODUCT_RELEASE read/);
reject(base.replace('value.length<=64','value===releaseAlias')
  .replace('const Akari={PRODUCT_RELEASE};','const Akari={PRODUCT_RELEASE}; const {PRODUCT_RELEASE:releaseAlias}=Akari;'),
  [],/PRODUCT_RELEASE read through destructuring/);
console.log('Release policy negative fixtures: PASS');
