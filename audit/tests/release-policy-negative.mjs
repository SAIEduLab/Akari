import { currentProductFile } from "./../lib/product-path.cjs";
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {releasePolicyIssues} from '../lib/release-policy.mjs';
import {caseRecorder,writeCaseReport} from '../lib/gate-case-contract.mjs';

const [output]=process.argv.slice(2);assert.ok(output,'usage: release-policy-negative.mjs <result.json>');
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
const {results,pass}=caseRecorder();
const issues=(html=base,audit=[])=>releasePolicyIssues(html,audit);
const accept=(id,html,audit)=>{assert.deepEqual(issues(html,audit),[],id);pass(id);};
const reject=(id,html,audit,match)=>{assert.ok(issues(html,audit).some(issue=>match.test(issue)),id+': '+match+' should be rejected');pass(id);};
accept('accepted/base-fixture');
accept('accepted/unrelated-audit-names',base,[{file:'audit/example.js',source:'function validateCase001(){} function base64Encode(){} function formatVersion(){}'}]);
accept('accepted/ipv6-and-base64-names',base.replace('</script>','function parseIPv6Address(){}\n</script>'),
  [{file:'audit/example.js',source:'function decodeIPv6Address(){} function parseBase64Data(){}'}]);
accept('accepted/release-key-and-codec-object',base,[{file:'audit/example.js',source:"const example={'release-1.0.0':true}; const codecs={base64:()=>{}};"}]);
for(const [kind,name] of [['v-number','restoreV103'],['version-number','runVersion09Tests'],['release-number','parseRelease104'],['numbered-suite','runCore103Tests']]){
  reject('release-name/product/'+kind,base.replace('</script>',`function ${name}(){}\n</script>`),[],/release-derived identifier/);
  reject('release-name/audit/'+kind,base,[{file:'audit/example.js',source:`function ${name}(){}`}],/release-derived identifier/);
}
reject('release-name/audit/property-key',base,[{file:'audit/example.js',source:"const audit={'restoreV103':()=>{}};"}],/release-derived identifier/);
reject('release-name/audit/arrow-binding',base,[{file:'audit/example.js',source:'const runVersion09Tests=()=>{};'}],/release-derived identifier/);
reject('release-read/format-check-uses-release',base.replace('project.formatVersion!==EXECUTABLE_CONTRACT.projectFormatVersion','project.appVersion!==PRODUCT_RELEASE'),[],/appVersion read|PRODUCT_RELEASE read/);
reject('release-read/producer-compared-to-release',base.replace('</script>',`function compatibility(project){const label=project.appVersion;return label===PRODUCT_RELEASE;}\n</script>`),[],/appVersion read|PRODUCT_RELEASE read/);
reject('release-read/release-alias',base.replace('</script>',`function compatibility(project){const label=PRODUCT_RELEASE;return label;}\n</script>`),[],/PRODUCT_RELEASE read/);
reject('release-read/producer-literal-compare',base.replace('</script>',`function test(project){if(project.appVersion==='1.0.0')return true;}\n</script>`),[],/appVersion read/);
reject('release-read/computed-producer-key',base.replace('</script>',`function test(project){if(project['appVersion']==='old')return true;}\n</script>`),[],/appVersion read/);
reject('release-literal/copied',base.replace('</script>',`function test(project){if(project.formatVersion==='1.0.0')return true;}\n</script>`),[],/copied release literal/);
reject('release-read/producer-destructured',base.replace('</script>',`function test(project){const {appVersion:label}=project;return label;}\n</script>`),[],/destructuring/);
reject('executable-contract/invalid-format-id',base.replace('languageContractId:1,runtimeContractId:1,programFormatVersion:1,projectFormatVersion:1','languageContractId:1,runtimeContractId:1,programFormatVersion:1,projectFormatVersion:0'),[],/EXECUTABLE_CONTRACT/);

// Mutate the actual candidate source, so the guard is checked against its real syntax.
const actual=fs.readFileSync(currentProductFile(),'utf8');
assert.deepEqual(issues(actual),[],'candidate product must satisfy the release policy');pass('candidate/accepted');
const inject=code=>actual.replace(/<\/script>(?![\s\S]*<\/script>)/,`${code}\n</script>`);
reject('candidate/release-name-function',inject('function restoreV103(){}'),[],/release-derived identifier/);
reject('candidate/release-compare',inject('function releaseGate(project){return project.appVersion===PRODUCT_RELEASE;}'),[],/appVersion read|PRODUCT_RELEASE read/);
reject('candidate/producer-alias',inject('function releaseAlias(project){const producer=project.appVersion;return producer;}'),[],/appVersion read/);
reject('candidate/release-name-object-method',inject('const renamedRuntime={restoreV103(){}};'),[],/release-derived identifier/);
reject('candidate/release-name-class-method',inject('class NamedRuntime { restoreV103(){} }'),[],/release-derived identifier/);
reject('producer-metadata/reused-in-fingerprint',base.replace('return JSON.stringify(content);','return producerLabel + JSON.stringify(content);'),[],/omitted producer metadata/);
reject('release-read/object-alias',base.replace('const Akari={PRODUCT_RELEASE};','const alias={PRODUCT_RELEASE};'),[],/PRODUCT_RELEASE read/);
reject('release-read/destructured-alias',base.replace('value.length<=64','value===releaseAlias')
  .replace('const Akari={PRODUCT_RELEASE};','const Akari={PRODUCT_RELEASE}; const {PRODUCT_RELEASE:releaseAlias}=Akari;'),
  [],/PRODUCT_RELEASE read through destructuring/);
writeCaseReport(output,'release-policy-negative',results);
console.log('Release policy negative fixtures: '+results.length+' PASS');
