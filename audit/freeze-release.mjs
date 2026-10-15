import {currentProductFile,currentProductVersion,currentReleaseFile} from './lib/product-path.cjs';
import fs from 'node:fs';import assert from 'node:assert/strict';import {sha} from './lib/product-test-host.mjs';
const meta=JSON.parse(fs.readFileSync('audit/public-files.json'));
const files=meta.files.filter(p=>p===currentProductFile()||['LICENSE','LANGUAGE.md','EXTENSIONS.md','MANUAL.html'].includes(p)||p.startsWith('Manual/')||p.startsWith('extensions/'));
const record={schema:'akari-distribution-v1',productVersion:currentProductVersion(),languageContractId:2,runtimeContractId:2,projectFormat:2,programFormat:2,files:Object.fromEntries(files.map(p=>[p,sha(fs.readFileSync(p))]))};
if(process.argv.includes('--record'))fs.writeFileSync(currentReleaseFile(),JSON.stringify(record,null,2)+'\n');else assert.deepEqual(JSON.parse(fs.readFileSync(currentReleaseFile())),record,'Current distribution differs');
console.log('Current distribution: '+files.length+' files');
