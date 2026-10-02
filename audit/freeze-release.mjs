import { currentProductFile, currentProductVersion, currentReleaseFile } from "./lib/product-path.cjs";
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {snapshot,sha} from './lib/product-test-host.mjs';
const file=currentReleaseFile();
const inputs=snapshot(currentProductFile());delete inputs.files[file];
const record={schema:'akari-release-freeze-v1',productVersion:currentProductVersion(),languageContractId:2,runtimeContractId:2,projectFormat:2,programFormat:2,
  files:inputs.files,inventorySha256:sha(JSON.stringify(Object.keys(inputs.files)))};
if(process.argv.includes('--record'))fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');
else assert.deepEqual(JSON.parse(fs.readFileSync(file)),record,'Release files differ from their fixed contract');
console.log('Release '+currentProductVersion()+' file contract: '+Object.keys(record.files).length+' files');
