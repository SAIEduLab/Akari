// Reproducible Node + actual file:// boundary checks. Does not modify the product.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runtimeRuns} from '../lib/japanese-gate-contract.mjs';
const [input, browserPath, destination] = process.argv.slice(2);
assert.ok(input && browserPath, 'usage: node audit/tests/runtime-boundary.mjs <product-html> <browser> [output-directory]');
const product = path.resolve(input);
const output = destination ? path.resolve(destination) : fs.mkdtempSync(path.join(os.tmpdir(), 'akari-runtime-boundary-'));
fs.mkdirSync(output, {recursive: true});
const snapshot = path.join(output, 'candidate.html');
assert.notEqual(product, snapshot, 'Output directory must not overwrite the input product');
fs.copyFileSync(product, snapshot);
const productSha256 = crypto.createHash('sha256').update(fs.readFileSync(snapshot)).digest('hex');
const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'runtime-boundary');
const expectedPassCount = runtimeRuns.flatMap(([,,ids])=>ids).length;
const runs=[];
for (const [script,evidenceName] of runtimeRuns) {
  const result=spawnSync(process.execPath, [path.join(directory,script)], {encoding:'utf8',timeout:120000,env:{...process.env,AKARI_RUNTIME_BOUNDARY_PRODUCT:snapshot,AKARI_RUNTIME_BOUNDARY_OUTPUT:output,AKARI_BROWSER:browserPath}});
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
  const evidencePath=path.join(output,evidenceName);
  const evidence=fs.existsSync(evidencePath)?JSON.parse(fs.readFileSync(evidencePath,'utf8')):null;
  runs.push({script,exitCode:result.status,signal:result.signal,error:result.error?.message,evidence:evidenceName,snapshotMatches:evidence?.productSha256===productSha256,reports:evidence?.reports||[]});
}
const reports=runs.flatMap(r=>r.reports),passed=reports.filter(x=>x.pass===true).length,failed=reports.filter(x=>x.pass===false).length,unverified=reports.filter(x=>x.pass==null).length;
const success=runs.every(x=>x.exitCode===0&&x.snapshotMatches)&&passed===expectedPassCount&&failed===0;
fs.writeFileSync(path.join(output,'runtime-boundary.json'),JSON.stringify({schema:'akari-runtime-boundary-evidence-v1',product,productSha256,transport:'file://',status:success?'PASS':'FAIL',expectedPassCount,passed,failed,unverified,runs},null,2)+'\n');
console.log(JSON.stringify({status:success?'PASS':'FAIL',passed,failed,unverified,output}));
if(!success) process.exitCode=1;
