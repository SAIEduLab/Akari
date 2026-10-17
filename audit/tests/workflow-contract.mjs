// GA-STATIC: the workflows run only the audit entry points declared in gate-contract,
// with the declared triggers, jobs, dependencies, conditions, limits and evidence retention.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {workflowIssues} from '../lib/workflow-contract.mjs';
import {workflowContract} from '../lib/gate-contract.mjs';
import {caseRecorder,writeCaseReport} from '../lib/gate-case-contract.mjs';
const [output]=process.argv.slice(2);assert.ok(output,'usage: workflow-contract.mjs <result.json>');
const dir='.github/workflows';
const current=Object.fromEntries(fs.readdirSync(dir).filter(name=>/\.ya?ml$/.test(name)).sort().map(name=>[name,fs.readFileSync(path.join(dir,name),'utf8').replace(/\r\n/g,'\n')]));
const {results,pass}=caseRecorder();
const issues=workflowIssues(current);
assert.deepEqual(issues,[],'current workflows:\n'+issues.map(i=>i.rule+' '+i.file+' '+i.where+': '+i.detail).join('\n'));
pass('current-workflows-accepted');

const audit='akari-audit.yml',acceptance='akari-acceptance.yml',guard='akari-change-guard.yml';
// Replace exactly one occurrence, so every mutation is known to change the text it names.
function edit(files,file,from,to){
  const text=files[file];assert.ok(text.includes(from),file+' lacks '+JSON.stringify(from));
  return {...files,[file]:text.replace(from,to)};
}
function reject(id,rule,detail,mutate,contract=workflowContract){
  const found=workflowIssues(mutate(current),contract);
  assert.ok(found.some(i=>i.rule===rule&&detail.test(i.detail)),id+' must be rejected by '+rule+' '+detail+'; got '+JSON.stringify(found));
  pass(id);
}
const gateStep='      - run: node audit/run-local-gate.mjs "$AKARI_BROWSER" audit-evidence/selftest\n';
const sealStep='      - run: node audit/verify-evidence.mjs seal selftest audit-evidence/selftest\n        if: always()\n';
const sameRepositoryIf="    if: ${{ github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository }}\n";
const any=/./;

reject('workflow-set/unknown-file','workflow-set',/undeclared/,f=>({...f,'akari-extra.yml':f[guard]}));
reject('workflow-set/missing-file','workflow-set',/missing/,f=>{const {[guard]:_,...rest}=f;return rest;});
reject('yaml/anchor','yaml',/unsupported YAML construct/,f=>edit(f,audit,'permissions:\n  contents: read','permissions: &perm\n  contents: read'));
reject('yaml/alias','yaml',/unsupported YAML construct/,f=>edit(f,guard,"node-version: '24'",'node-version: *version'));
reject('yaml/tab-indentation','yaml',/tab character/,f=>edit(f,guard,'    runs-on: ubuntu-latest','\truns-on: ubuntu-latest'));
reject('yaml/flow-mapping','yaml',/unsupported YAML construct/,f=>edit(f,audit,'permissions:\n  contents: read','permissions: {contents: read}'));
reject('yaml/folded-scalar','yaml',/literal block scalars/,f=>edit(f,audit,'      - run: |\n','      - run: >\n'));
reject('yaml/duplicate-key','yaml',/duplicate key/,f=>edit(f,guard,'    timeout-minutes: 10\n','    timeout-minutes: 10\n    timeout-minutes: 30\n'));
reject('workflow-keys/top-level-defaults','workflow-keys',any,f=>({...f,[guard]:f[guard]+'defaults:\n  run:\n    shell: bash\n'}));
reject('workflow-env/changed','workflow-env',any,f=>edit(f,audit,'AKARI_REQUESTED_SHA: ${{ github.event.pull_request.head.sha || github.sha }}','AKARI_REQUESTED_SHA: ${{ github.sha }}'));
reject('triggers/missing-push','triggers',any,f=>edit(f,audit,'  push:\n    branches: [main]\n',''));
reject('triggers/extra-branch','triggers',any,f=>edit(f,audit,'  pull_request:\n    branches: [main]\n','  pull_request:\n    branches: [main, develop]\n'));
reject('triggers/missing-dispatch','triggers',any,f=>edit(f,acceptance,'  workflow_dispatch:\n',''));
reject('triggers/extra-schedule','triggers',any,f=>edit(f,acceptance,'  workflow_dispatch:\n',"  workflow_dispatch:\n  schedule:\n    - cron: '0 0 * * *'\n"));
reject('triggers/path-filter','triggers',any,f=>edit(f,audit,'  pull_request:\n    branches: [main]\n','  pull_request:\n    branches: [main]\n    paths: [src/**]\n'));
reject('triggers/guard-without-label-events','triggers',any,f=>edit(f,guard,'types: [opened, synchronize, reopened, labeled, unlabeled]','types: [opened, synchronize, reopened]'));
reject('permissions/write-contents','permissions',/contents: read/,f=>edit(f,audit,'permissions:\n  contents: read','permissions:\n  contents: write'));
reject('permissions/job-write','permissions',/read-only/,f=>edit(f,acceptance,'      actions: read','      actions: write'));
reject('concurrency/cancels-main','concurrency',/cancel/,f=>edit(f,audit,"  cancel-in-progress: ${{ github.event_name == 'pull_request' }}",'  cancel-in-progress: true'));
reject('concurrency/shared-main-group','concurrency',/own concurrency group/,f=>edit(f,acceptance,'  group: akari-acceptance-${{ github.event_name }}-${{ github.event.pull_request.number || github.run_id }}','  group: akari-acceptance-${{ github.event.pull_request.number || github.ref }}'));
reject('concurrency/missing','concurrency',/missing concurrency/,f=>edit(f,guard,"concurrency:\n  group: akari-change-guard-${{ github.event_name }}-${{ github.event.pull_request.number || github.run_id }}\n  cancel-in-progress: ${{ github.event_name == 'pull_request' }}\n",''));
reject('jobs/missing-job','jobs',/missing job/,f=>edit(f,guard,'  audit-change-guard:\n','  change-guard:\n'));
reject('jobs/extra-job','jobs',/undeclared job/,f=>({...f,[guard]:f[guard]+'  extra-check:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - run: echo ok\n'}));
reject('jobs/condition-changed','jobs',/condition differs/,f=>edit(f,audit,sameRepositoryIf,'    if: ${{ false }}\n'));
reject('job-keys/reusable-workflow','job-keys',/not allowed/,f=>edit(f,guard,'    runs-on: ubuntu-latest\n','    runs-on: ubuntu-latest\n    uses: ./.github/workflows/other.yml\n'));
reject('needs/dropped-job','needs',/needs must be/,f=>edit(f,audit,'needs: [selftest, full-browser-gate, audio-codecs]','needs: [selftest, full-browser-gate]'));
reject('needs/without-always','needs',/always\(\)/,f=>edit(f,audit,"    if: ${{ always() && (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository) }}\n",sameRepositoryIf));
reject('continue-on-error/job','continue-on-error',/job/,f=>edit(f,guard,'    timeout-minutes: 10\n','    timeout-minutes: 10\n    continue-on-error: true\n'));
reject('continue-on-error/step','continue-on-error',/step/,f=>edit(f,audit,gateStep,gateStep+'        continue-on-error: true\n'));
reject('timeout/missing','timeout',any,f=>edit(f,guard,'    timeout-minutes: 10\n',''));
reject('timeout/not-integer','timeout',any,f=>edit(f,guard,'    timeout-minutes: 10\n','    timeout-minutes: ${{ 10 }}\n'));
reject('artifact/retention-days','artifact',/3 days/,f=>edit(f,guard,'retention-days: 3','retention-days: 90'));
reject('artifact/missing-retention','artifact',/3 days/,f=>edit(f,guard,'          retention-days: 3\n',''));
reject('artifact/missing-files-allowed','artifact',/missing evidence/,f=>edit(f,guard,'if-no-files-found: error','if-no-files-found: warn'));
reject('commands/ad-hoc-audit-check','commands',/ad-hoc command: node audit\/tests\/license-verify/,f=>edit(f,audit,sealStep,'      - run: node audit/tests/license-verify.mjs audit-evidence/selftest/license-browser.json\n'+sealStep));
reject('commands/ad-hoc-shell-check','commands',/ad-hoc command: test -f/,f=>edit(f,audit,'          python audit/install-codec-browser.py "$RUNNER_TEMP/functional-browser"\n','          python audit/install-codec-browser.py "$RUNNER_TEMP/functional-browser"\n          test -f Akari.html || exit 1\n'));
reject('commands/missing-entry','commands',/missing entry: node audit\/verify-evidence\.mjs seal selftest/,f=>edit(f,audit,sealStep,''));
reject('commands/reordered-entries','commands',/out of order/,f=>edit(f,audit,gateStep+sealStep,sealStep+gateStep));
reject('commands/duplicate-entry','commands',/repeated/,f=>edit(f,audit,gateStep,gateStep+gateStep));
reject('step-condition/disabled-entry','step-condition',any,f=>edit(f,audit,gateStep,gateStep+'        if: ${{ false }}\n'));
reject('step-env/entry-env-changed','step-env',/entry environment/,f=>edit(f,audit,'AKARI_NEEDS: ${{ toJSON(needs) }}',"AKARI_NEEDS: '{}'"));
reject('step-env/undeclared','step-env',/undeclared/,f=>edit(f,guard,"        with:\n          node-version: '24'\n","        with:\n          node-version: '24'\n        env:\n          NODE_OPTIONS: --require ./preload.cjs\n"));
reject('step-keys/shell-override','step-keys',/not allowed/,f=>edit(f,audit,gateStep,gateStep+'        shell: python\n'));
reject('actions/unknown-action','actions',/not allowed/,f=>edit(f,guard,'      - uses: actions/setup-node@v4\n','      - uses: someone/setup-node@main\n'));
reject('bundles/matrix-group-dropped','bundles',/full-browser-extra/,f=>edit(f,audit,'group: [session, ui, limits, schemas, extra]','group: [session, ui, limits, schemas]'));
// The kinds rule is independent of the declared entries: change both the workflow and its declaration.
const singleKind=structuredClone(workflowContract);singleKind[acceptance].jobs['composition-acceptance'].entries=[{run:'node audit/run-acceptance.mjs editing'}];
reject('acceptance/kind-dropped','acceptance',/acceptance kinds/,f=>edit(f,acceptance,'run: node audit/run-acceptance.mjs composition','run: node audit/run-acceptance.mjs editing'),singleKind);
reject('checkout/guard-shallow-history','checkout',/full history/,f=>edit(f,guard,'      - uses: actions/checkout@v5\n        with:\n          fetch-depth: 0\n','      - uses: actions/checkout@v5\n'));

writeCaseReport(output,'workflow-contract',results,{workflows:Object.keys(current)});
console.log('Workflow contract: current workflows accepted; '+(results.length-1)+' mutated workflows rejected');
