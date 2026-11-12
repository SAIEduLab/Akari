import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
import {verifyJapaneseContract} from './japanese-contract-static.mjs';
import {contractInputPaths,expectationInputPaths,inputHashes,verifyContractReport,verifyExpectationReport} from '../lib/japanese-gate-contract.mjs';
const [kind,destination]=process.argv.slice(2);assert.ok(destination&&['static','expectations'].includes(kind),'usage: contract-gate.mjs static|expectations NEW_REPORT.json');
const inputs=snapshot(currentProductFile());let report;
if(kind==='static')report={schema:'akari-japanese-static-gate-v1',status:'PASS',snapshot:inputs,auditInputs:inputHashes(contractInputPaths),contract:verifyJapaneseContract()};
else{
  const r=spawnSync(process.execPath,['audit/tests/language-expectations-static.mjs'],{encoding:'utf8',timeout:60000});
  assert.equal(r.status,0,(r.stderr||'')+(r.error?.message||''));assert.equal(r.signal,null);
  report={schema:'akari-language-expectations-gate-v1',status:'PASS',snapshot:inputs,auditInputs:inputHashes(expectationInputPaths),expectations:JSON.parse(r.stdout)};
}
assert.deepEqual(snapshot(currentProductFile()),inputs,'candidate changed during the static gate');
(kind==='static'?verifyContractReport:verifyExpectationReport)(report,inputs);
fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'PASS',kind,destination}));
