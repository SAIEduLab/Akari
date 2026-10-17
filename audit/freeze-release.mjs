import {currentProductFile,currentProductVersion,currentReleaseFile} from './lib/product-path.cjs';
import fs from 'node:fs';import assert from 'node:assert/strict';import {sha} from './lib/product-test-host.mjs';
const meta=JSON.parse(fs.readFileSync('audit/public-files.json'));
const files=meta.files.filter(p=>p===currentProductFile()||['LICENSE','LANGUAGE.md','EXTENSIONS.md','MANUAL.html'].includes(p)||p.startsWith('Manual/')||p.startsWith('extensions/'));
// The contract numbers are the executable contract that the static gate equates to the product.
const contract=JSON.parse(fs.readFileSync('audit/manifests/features.json')).EXECUTABLE_CONTRACT;
assert.deepEqual(Object.keys(contract).sort(),['languageContractId','programFormatVersion','projectFormatVersion','runtimeContractId'],'executable contract fields');
for(const [key,value]of Object.entries(contract))assert.ok(Number.isInteger(value)&&value>0,'executable contract '+key);
// Only the current release has a release manifest.
const releases=fs.readdirSync('audit/manifests').filter(name=>/^release-.*\.json$/.test(name)).map(name=>'audit/manifests/'+name);
assert.deepEqual(releases.filter(file=>file!==currentReleaseFile()),[],'only the current release manifest may exist');
const record={schema:'akari-distribution-v1',productVersion:currentProductVersion(),languageContractId:contract.languageContractId,runtimeContractId:contract.runtimeContractId,projectFormat:contract.projectFormatVersion,programFormat:contract.programFormatVersion,files:Object.fromEntries(files.map(p=>[p,sha(fs.readFileSync(p))]))};
if(process.argv.includes('--record'))fs.writeFileSync(currentReleaseFile(),JSON.stringify(record,null,2)+'\n');else assert.deepEqual(JSON.parse(fs.readFileSync(currentReleaseFile())),record,'Current distribution differs');
console.log('Current distribution: '+files.length+' files');
