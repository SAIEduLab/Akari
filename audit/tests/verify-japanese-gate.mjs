import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
import {verifyContractReport,verifyMigrationReport,verifyNegativeReport} from '../lib/japanese-gate-contract.mjs';
const [directory]=process.argv.slice(2);assert.ok(directory);const inputs=snapshot(currentProductFile()),read=n=>JSON.parse(fs.readFileSync(path.join(directory,n+'.json')));
verifyContractReport(read('japanese-contract-static'),inputs);verifyMigrationReport(read('language-migration-static'),inputs);verifyNegativeReport(read('japanese-gate-negative'),inputs);console.log(JSON.stringify({status:'PASS',scope:'GA-STATIC / current snapshot'}));
