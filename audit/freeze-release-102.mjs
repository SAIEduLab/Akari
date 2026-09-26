import fs from 'node:fs';
import {featureFreeze102,verifyFreeze102} from './lib/release-102-contract.mjs';
const file='audit/manifests/release-1.0.2.json';
if(process.argv.includes('--record'))fs.writeFileSync(file,JSON.stringify(featureFreeze102(),null,2)+'\n');
verifyFreeze102();console.log('1.0.2 feature freeze: PASS');
