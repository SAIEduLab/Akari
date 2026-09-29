import fs from 'node:fs';
import assert from 'node:assert/strict';
import {snapshot,sha} from './lib/product-test-host.mjs';
const file='audit/manifests/release-1.0.0.json';
const inputs=snapshot('Akari.html');delete inputs.files[file];
const record={schema:'akari-release-freeze-v1',productVersion:'1.0.0',languageVersion:'1.0.0',runtimeVersion:'1.0.0',projectFormat:1,programFormat:1,
  files:inputs.files,inventorySha256:sha(JSON.stringify(Object.keys(inputs.files)))};
if(process.argv.includes('--record'))fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');
else assert.deepEqual(JSON.parse(fs.readFileSync(file)),record,'Release files differ from their fixed contract');
console.log('Release 1.0.0 file contract: '+Object.keys(record.files).length+' files');
