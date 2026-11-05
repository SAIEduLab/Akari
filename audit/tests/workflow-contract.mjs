// GA-STATIC: the workflows run only the audit entry points declared in gate-contract,
// with the declared triggers, jobs, dependencies, conditions, limits and evidence retention.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {workflowIssues} from '../lib/workflow-contract.mjs';
import {scriptPackages} from '../lib/script-packages.mjs';
import {planLanes,auditSeconds,acceptanceSeconds,bundleKind,unpackLanes} from '../lib/ci-lanes.mjs';
import {workForUnit} from '../run-ci-lane.mjs';
import {workflowContract,auditBundleKinds} from '../lib/gate-contract.mjs';
import {changeGuardParts,acceptanceShards} from '../lib/shard-plan.cjs';
import {caseRecorder,writeCaseReport} from '../lib/gate-case-contract.mjs';
const [output]=process.argv.slice(2);assert.ok(output,'usage: workflow-contract.mjs <result.json>');
const dir='.github/workflows';
const current=Object.fromEntries(fs.readdirSync(dir).filter(name=>/\.ya?ml$/.test(name)).sort().map(name=>[name,fs.readFileSync(path.join(dir,name),'utf8').replace(/\r\n/g,'\n')]));
// Each logical suite runs once, across the same twenty workers for all workflows of a push.
assert.deepEqual(Object.keys(auditSeconds).map(bundleKind).sort(),[...auditBundleKinds].sort());
assert.deepEqual(Object.keys(acceptanceSeconds).sort(),[...Object.keys(acceptanceShards.composition),'editing'].sort());
const browserEnv={AKARI_BROWSER:'functional',AKARI_CODEC_BROWSER:'codec'};
for(const unit of Object.keys(auditSeconds)){
  const {commands,dir}=workForUnit(unit,browserEnv);
  assert.deepEqual(commands.at(-1),['audit/verify-evidence.mjs','seal',bundleKind(unit),dir]);
  if(unit==='audio')assert.deepEqual(commands.slice(0,-1),[
    ['audit/tests/audio-codecs.mjs','codec',dir+'/report.json'],
    ['audit/tests/block-field-width.mjs','codec',dir+'/block-field-width.json']]);
  else if(unit.startsWith('s'))assert.deepEqual(commands[0],['audit/run-local-gate.mjs','--shard',unit,'functional',dir]);
  else assert.deepEqual(commands[0],['audit/browser/run-full-browser-audit.mjs','--shard',unit,'--evidence',dir]);
}
for(const unit of Object.keys(acceptanceSeconds)){
  const args=unit==='editing'?['editing']:['composition','--shard',unit];
  assert.deepEqual(workForUnit(unit,browserEnv).commands,[['audit/run-acceptance.mjs',...args]]);
}
for(const lines of [0,1,20,341,2000]){
  for(const copies of [1,2]){
    const plan=planLanes(lines,copies),names=lanes=>lanes.flatMap(lane=>lane.split('+')).sort();
    assert.deepEqual(names(plan.audit),Object.keys(auditSeconds).sort());
    assert.deepEqual(names(plan.acceptance),Object.keys(acceptanceSeconds).sort());
    assert.equal(plan.audit.length+plan.acceptance.length+plan.guard*copies,20);
    assert.equal(plan.guard>0,lines>0);
  }
}
// Downloaded lanes keep each bundle and attempt separate; a malformed delivery must fail before any move.
const delivery=fs.mkdtempSync(path.join(os.tmpdir(),'akari-lane-delivery-'));
try{
  const artifact=(name,kinds)=>{const dir=path.join(delivery,name);for(const k of kinds)fs.mkdirSync(path.join(dir,k),{recursive:true});};
  artifact('akari-audit-lane-s01+b01-123-1',['selftest-s01','full-browser-b01']);
  artifact('akari-audit-lane-b01-123-2',['full-browser-b01']);
  artifact('akari-audit-lane-s02+audio-123-2',['selftest-s02']);
  assert.throws(()=>unpackLanes('audit',delivery,'123','2'),/incomplete lane/);
  assert.ok(!fs.existsSync(path.join(delivery,'akari-selftest-s01-123-1')));
  artifact('akari-audit-lane-s02+audio-123-2',['audio-codecs-win32']);
  unpackLanes('audit',delivery,'123','2');
  for(const id of ['selftest-s01-123-1','full-browser-b01-123-1','full-browser-b01-123-2','audio-codecs-win32-123-2','selftest-s02-123-2'])
    assert.ok(fs.statSync(path.join(delivery,'akari-'+id)).isDirectory());
  artifact('akari-acceptance-lane-c01+editing-123-1',['fixed-acceptance-c01','ux-editing']);
  assert.throws(()=>unpackLanes('acceptance',delivery,'123','2'));
  artifact('akari-acceptance-lane-c01-123-1',['fixed-acceptance-c01']);
  assert.throws(()=>unpackLanes('acceptance',delivery,'123','1'),/duplicate lane evidence/);
}finally{fs.rmSync(delivery,{recursive:true,force:true});}
const {results,pass}=caseRecorder();
const packages=new Map(),loads=script=>{if(!packages.has(script))packages.set(script,scriptPackages('.',script));return packages.get(script);};
const issues=workflowIssues(current,workflowContract,loads);
assert.deepEqual(issues,[],'current workflows:\n'+issues.map(i=>i.rule+' '+i.file+' '+i.where+': '+i.detail).join('\n'));
const authorization='akari-work-authorization.yml';
for(const [from,to,rule]of [['ref: ${{ github.event.pull_request.base.sha }}','ref: ${{ github.event.pull_request.head.sha }}','checkout'],['pull_request_target:','pull_request:','triggers'],['pull-requests: read','pull-requests: write','permissions']]){const changed={...current,[authorization]:current[authorization].replace(from,to)};assert.ok(workflowIssues(changed).some(issue=>issue.file===authorization&&issue.rule===rule),'owner authorization boundary '+rule);}
pass('current-workflows-accepted');

const audit='akari-audit.yml',acceptance='akari-acceptance.yml',guard='akari-change-guard.yml';
// Replace exactly one occurrence, so every mutation is known to change the text it names.
function edit(files,file,from,to){
  const text=files[file];assert.ok(text.includes(from),file+' lacks '+JSON.stringify(from));
  return {...files,[file]:text.replace(from,to)};
}
function reject(id,rule,detail,mutate,contract=workflowContract){
  const found=workflowIssues(mutate(current),contract,loads);
  assert.ok(found.some(i=>i.rule===rule&&detail.test(i.detail)),id+' must be rejected by '+rule+' '+detail+'; got '+JSON.stringify(found));
  pass(id);
}
const gateStep='      - run: node audit/run-ci-lane.mjs audit "${{ matrix.shard }}"\n';
const unpackStep='      - run: node audit/lib/ci-lanes.mjs unpack audit downloaded-evidence\n';
const aggregateStep='      - run: node audit/verify-evidence.mjs aggregate downloaded-evidence audit-evidence/aggregate.json\n        env:\n          AKARI_NEEDS: ${{ toJSON(needs) }}\n';
const laneMatrix='shard: ${{ fromJSON(needs.lane-plan.outputs.lanes) }}';
const sameRepositoryIf="    if: ${{ github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository }}\n";
const any=/./;

reject('workflow-set/unknown-file','workflow-set',/undeclared/,f=>({...f,'akari-extra.yml':f[guard]}));
reject('workflow-set/missing-file','workflow-set',/missing/,f=>{const {[guard]:_,...rest}=f;return rest;});
reject('yaml/anchor','yaml',/unsupported YAML construct/,f=>edit(f,audit,'permissions:\n  contents: read','permissions: &perm\n  contents: read'));
reject('yaml/alias','yaml',/unsupported YAML construct/,f=>edit(f,guard,"node-version: '24.22.2'",'node-version: *version'));
reject('yaml/tab-indentation','yaml',/tab character/,f=>edit(f,guard,'    runs-on: windows-latest','\truns-on: windows-latest'));
reject('yaml/flow-mapping','yaml',/unsupported YAML construct/,f=>edit(f,audit,'permissions:\n  contents: read','permissions: {contents: read}'));
reject('yaml/folded-scalar','yaml',/literal block scalars/,f=>edit(f,audit,'      - run: |\n','      - run: >\n'));
reject('yaml/duplicate-key','yaml',/duplicate key/,f=>edit(f,guard,'    timeout-minutes: 360\n','    timeout-minutes: 360\n    timeout-minutes: 30\n'));
reject('workflow-keys/top-level-defaults','workflow-keys',any,f=>({...f,[guard]:f[guard]+'defaults:\n  run:\n    shell: bash\n'}));
reject('workflow-env/changed','workflow-env',any,f=>edit(f,audit,'AKARI_REQUESTED_SHA: ${{ github.event.pull_request.head.sha || github.sha }}','AKARI_REQUESTED_SHA: ${{ github.sha }}'));
reject('triggers/missing-push','triggers',any,f=>edit(f,audit,'  push:\n    branches: [main]\n',''));
reject('triggers/extra-branch','triggers',any,f=>edit(f,audit,'  pull_request:\n    branches: [main]\n','  pull_request:\n    branches: [main, develop]\n'));
reject('triggers/missing-dispatch','triggers',any,f=>edit(f,acceptance,'  workflow_dispatch:\n',''));
reject('triggers/extra-schedule','triggers',any,f=>edit(f,acceptance,'  workflow_dispatch:\n',"  workflow_dispatch:\n  schedule:\n    - cron: '0 0 * * *'\n"));
reject('triggers/path-filter','triggers',any,f=>edit(f,audit,'  pull_request:\n    branches: [main]\n','  pull_request:\n    branches: [main]\n    paths: [src/**]\n'));
reject('triggers/guard-with-label-events','triggers',any,f=>edit(f,guard,'types: [opened, synchronize, reopened]','types: [opened, synchronize, reopened, labeled, unlabeled]'));
// Every change is judged by the base's guard (pull_request_target); the head's own guard runs only for a change to its workflow.
reject('triggers/guard-without-base-guard','triggers',any,f=>edit(f,guard,'  pull_request_target:\n    branches: [main]\n    types: [opened, synchronize, reopened]\n',''));
reject('triggers/guard-head-run-unfiltered','triggers',any,f=>edit(f,guard,'    paths: [.github/workflows/akari-change-guard.yml]\n',''));
reject('permissions/write-contents','permissions',/contents: read/,f=>edit(f,audit,'permissions:\n  contents: read','permissions:\n  contents: write'));
reject('permissions/job-write','permissions',/read-only/,f=>edit(f,acceptance,'      actions: read','      actions: write'));
reject('concurrency/cancels-main','concurrency',/cancel/,f=>edit(f,audit,"  cancel-in-progress: ${{ github.event_name == 'pull_request' }}",'  cancel-in-progress: true'));
reject('concurrency/shared-main-group','concurrency',/own concurrency group/,f=>edit(f,acceptance,'  group: akari-acceptance-${{ github.event_name }}-${{ github.event.pull_request.number || github.run_id }}','  group: akari-acceptance-${{ github.event.pull_request.number || github.ref }}'));
reject('concurrency/missing','concurrency',/missing concurrency/,f=>edit(f,guard,"concurrency:\n  group: akari-change-guard-${{ github.event_name }}-${{ github.event.pull_request.number || github.run_id }}\n  cancel-in-progress: ${{ startsWith(github.event_name, 'pull_request') }}\n",''));
reject('jobs/missing-job','jobs',/missing job/,f=>edit(f,guard,'  audit-change-guard:\n','  change-guard:\n'));
reject('jobs/extra-job','jobs',/undeclared job/,f=>({...f,[guard]:f[guard]+'  extra-check:\n    runs-on: windows-latest\n    timeout-minutes: 5\n    steps:\n      - run: echo ok\n'}));
reject('jobs/condition-changed','jobs',/condition differs/,f=>edit(f,audit,sameRepositoryIf,'    if: ${{ false }}\n'));
reject('runner/wrong-platform','runner',/windows-latest/,f=>edit(f,guard,'    runs-on: windows-latest','    runs-on: ubuntu-latest'));
reject('runner/missing-bash','runner',/declared bash shell/,f=>edit(f,guard,'    defaults:\n      run:\n        shell: bash\n',''));
reject('job-keys/reusable-workflow','job-keys',/not allowed/,f=>edit(f,guard,'    runs-on: windows-latest\n','    runs-on: windows-latest\n    uses: ./.github/workflows/other.yml\n'));
reject('needs/dropped-job','needs',/needs must be/,f=>edit(f,audit,'needs: [lane-plan, audit-lane]','needs: [lane-plan]'));
reject('needs/without-always','needs',/always\(\)/,f=>edit(f,audit,"    if: ${{ always() && (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository) }}\n",sameRepositoryIf));
reject('continue-on-error/job','continue-on-error',/job/,f=>edit(f,guard,'    timeout-minutes: 360\n','    timeout-minutes: 360\n    continue-on-error: true\n'));
reject('continue-on-error/step','continue-on-error',/step/,f=>edit(f,audit,gateStep,gateStep+'        continue-on-error: true\n'));
reject('timeout/missing','timeout',any,f=>edit(f,guard,'    timeout-minutes: 360\n',''));
reject('timeout/not-integer','timeout',any,f=>edit(f,guard,'    timeout-minutes: 360\n','    timeout-minutes: ${{ 10 }}\n'));
reject('packages/not-installed','packages',/change-guard\.mjs may load @babel\/parser/,f=>edit(f,guard,'          npm install --prefix "$RUNNER_TEMP/audit-deps" --no-package-lock --no-audit --no-fund playwright@1.55.0 @babel/parser@7.28.4\n',''));
reject('packages/node-path-missing','packages',/change-guard\.mjs may load @babel\/parser.*NODE_PATH does not point/,f=>edit(f,guard,'"NODE_PATH="+require("path").join(process.env.RUNNER_TEMP,"audit-deps/node_modules")','"AKARI_BROWSER="+require("path").join(process.env.RUNNER_TEMP,"audit-deps/node_modules")'));
// Every job runs the one Node release the contract names, set up before its first node entry.
reject('node-version/other-release','node-version',/sets up Node 24\.22\.1; every job sets up Node 24\.22\.2/,f=>edit(f,guard,"node-version: '24.22.2'","node-version: '24.22.1'"));
reject('node-version/not-set-up','node-version',/runs before the job sets up Node 24\.22\.2/,f=>edit(f,guard,"      - uses: actions/setup-node@v4\n        with:\n          node-version: '24.22.2'\n",''));
reject('packages/child-not-installed','packages',/run-ci-lane\.mjs may load jsdom, and this job does not install it/,f=>edit(f,audit,' jsdom@26.1.0 ',' '));
// The packages of a child node script count for the script that starts it; a launch of a script named only through
// a variable needs its launching file declared.
{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'akari-packages-')),write=(file,text)=>fs.writeFileSync(path.join(scratch,file),text);
  try{
    write('parent.mjs',"import cp from 'node:child_process';\ncp.spawnSync(process.execPath,['child.mjs']);\n");
    write('child.mjs',"import 'child-only-package';\n");
    assert.deepEqual([...scriptPackages(scratch,'parent.mjs',{})],['child-only-package']);pass('packages/child-literal');
    write('dynamic.mjs',"import cp from 'node:child_process';\nconst script=process.argv[2];\ncp.spawnSync(process.execPath,[script]);\n");
    assert.throws(()=>scriptPackages(scratch,'dynamic.mjs',{}),/dynamic\.mjs:3 starts a node script it names only through a variable/);pass('packages/child-undeclared');
    // A package read only inside a function, by require() or import(), counts too: the job must have it when it is called.
    write('lazy.cjs',"function later(){return require('required-later');}\nasync function imported(){return import('imported-later');}\nmodule.exports={later,imported};\n");
    assert.deepEqual([...scriptPackages(scratch,'lazy.cjs',{})].sort(),['imported-later','required-later']);pass('packages/lazy-loads');
  }finally{fs.rmSync(scratch,{recursive:true,force:true});}
}
reject('packages/node-path-elsewhere','packages',/change-guard\.mjs may load @babel\/parser.*NODE_PATH does not point/,f=>edit(f,guard,'RUNNER_TEMP,"audit-deps/node_modules")','RUNNER_TEMP,"other/node_modules")'));
reject('artifact/retention-days','artifact',/3 days/,f=>edit(f,guard,'retention-days: 3','retention-days: 90'));
reject('artifact/missing-retention','artifact',/3 days/,f=>edit(f,guard,'          retention-days: 3\n',''));
reject('artifact/missing-files-allowed','artifact',/missing evidence/,f=>edit(f,guard,'if-no-files-found: error','if-no-files-found: warn'));
reject('commands/ad-hoc-audit-check','commands',/ad-hoc command: node audit\/tests\/license-verify/,f=>edit(f,audit,unpackStep,'      - run: node audit/tests/license-verify.mjs audit-evidence/selftest/license-browser.json\n'+unpackStep));
reject('commands/ad-hoc-shell-check','commands',/ad-hoc command: test -f/,f=>edit(f,audit,'          python audit/install-codec-browser.py "$RUNNER_TEMP/functional-browser" --media\n','          python audit/install-codec-browser.py "$RUNNER_TEMP/functional-browser" --media\n          test -f Akari.html || exit 1\n'));
reject('commands/missing-entry','commands',/missing entry: node audit\/lib\/ci-lanes\.mjs unpack/,f=>edit(f,audit,unpackStep,''));
reject('commands/reordered-entries','commands',/out of order/,f=>edit(f,audit,unpackStep+aggregateStep,aggregateStep+unpackStep));
reject('commands/duplicate-entry','commands',/repeated/,f=>edit(f,audit,gateStep,gateStep+gateStep));
reject('step-condition/disabled-entry','step-condition',any,f=>edit(f,audit,gateStep,gateStep+'        if: ${{ false }}\n'));
reject('step-env/entry-env-changed','step-env',/entry environment/,f=>edit(f,audit,'AKARI_NEEDS: ${{ toJSON(needs) }}',"AKARI_NEEDS: '{}'"));
reject('step-env/undeclared','step-env',/undeclared/,f=>edit(f,guard,"        with:\n          node-version: '24.22.2'\n","        with:\n          node-version: '24.22.2'\n        env:\n          NODE_OPTIONS: --require ./preload.cjs\n"));
reject('step-keys/shell-override','step-keys',/not allowed/,f=>edit(f,audit,gateStep,gateStep+'        shell: python\n'));
reject('actions/unknown-action','actions',/not allowed/,f=>edit(f,guard,'      - uses: actions/setup-node@v4\n','      - uses: someone/setup-node@main\n'));
reject('bundles/matrix-group-dropped','bundles',/sealed bundle kinds/,f=>edit(f,audit,laneMatrix,'shard: [b01]'));
// The kinds rule is independent of the declared entries: change both the workflow and its declaration.
const singleKind=structuredClone(workflowContract);singleKind[acceptance].jobs['acceptance-lane'].shards=['editing'];
reject('acceptance/kind-dropped','acceptance',/acceptance kinds/,f=>f,singleKind);
// Shard matrices: exactly the planned shards, each run to completion, and no other matrix.
reject('matrix/shard-dropped','matrix',/shards must be exactly/,f=>edit(f,audit,laneMatrix,'shard: [s01]'));
reject('matrix/fail-fast','matrix',/must not cancel/,f=>edit(f,acceptance,'      fail-fast: false\n','      fail-fast: true\n'));
reject('matrix/unplanned-matrix','matrix',/only planned shard jobs/,f=>edit(f,audit,'    timeout-minutes: 5\n','    timeout-minutes: 5\n    strategy:\n      matrix:\n        shard: [s01]\n'));
// The guard runs exactly its planned parts.
const mutantParts=changeGuardParts.slice(1);
assert.equal(mutantParts.length,20);
reject('matrix/guard-part-dropped','matrix',/shards must be exactly/,f=>edit(f,guard,'shard: ${{ fromJSON(needs.guard-plan.outputs.shards) }}','shard: ['+mutantParts.slice(0,-1).join(', ')+']'));
reject('checkout/guard-shallow-history','checkout',/full history/,f=>edit(f,guard,'          fetch-depth: 0\n',''));
// The guard checks out the head commit, not the merge commit, and keeps no token in the checkout the head's code runs in.
reject('checkout/guard-merge-commit','checkout',/checks out the head commit/,f=>edit(f,guard,'          ref: ${{ github.event.pull_request.head.sha }}\n',''));
reject('checkout/guard-keeps-token','checkout',/without keeping the token/,f=>edit(f,guard,'          persist-credentials: false\n',''));
// The base's guard is put back only in the run for pull_request_target.
reject('step-condition/guard-base-guard-always','step-condition',/condition differs/,f=>edit(f,guard,"        if: ${{ github.event_name == 'pull_request_target' }}\n",''));

writeCaseReport(output,'workflow-contract',results,{workflows:Object.keys(current)});
console.log('Workflow contract: current workflows accepted; '+(results.length-1)+' mutated workflows rejected');
