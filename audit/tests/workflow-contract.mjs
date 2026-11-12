// GA-STATIC: the workflows run only the audit entry points declared in gate-contract,
// with the declared triggers, jobs, dependencies, conditions, limits and evidence retention.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {workflowIssues,unownedGuardFiles,workflowActionPins,toolSetIssues,workflowToolSets} from '../lib/workflow-contract.mjs';
import {scriptPackages,scriptReach} from '../lib/script-packages.mjs';
import {planLanes,auditSeconds,acceptanceSeconds,bundleKind,unpackLanes,newestReleases,releaseSources} from '../lib/ci-lanes.mjs';
import {workForUnit,laneBrowser} from '../run-ci-lane.mjs';
import {workflowContract,auditBundleKinds} from '../lib/gate-contract.mjs';
import {acceptanceShards} from '../lib/shard-plan.cjs';
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
{
  const plan=planLanes(),names=lanes=>lanes.flatMap(lane=>lane.split('+')).sort();
  assert.deepEqual(names(plan.audit),Object.keys(auditSeconds).sort());
  assert.deepEqual(names(plan.acceptance),Object.keys(acceptanceSeconds).sort());
  assert.ok(plan.audit.length+plan.acceptance.length<=20);
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
  assert.throws(()=>unpackLanes('acceptance',delivery,'123','2'),{code:'ERR_ASSERTION',message:/^an acceptance lane comes from the current attempt\n/});
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
// (a step names its action by the commit pinned for its tag, workflowActionPins)
const pin=named=>named.split('@')[0]+'@'+workflowActionPins[named]+' # '+named.split('@')[1];

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
reject('packages/not-installed','packages',/change-guard\.mjs may load @babel\/parser/,f=>edit(f,guard,'          npm install --prefix "$RUNNER_TEMP/audit-deps" --no-package-lock --no-audit --ignore-scripts --no-fund playwright@latest @babel/parser@7.28.4 @babel/types@7.29.11 @babel/helper-string-parser@7.29.13 @babel/helper-validator-identifier@7.29.7\n',''));
// A job that installs from a lock: the set copied is installed only by the npm ci after it, and NODE_PATH names the
// folder of Playwright too.
reject('packages/set-not-installed','packages',/may load .*this job does not install it before/,f=>edit(f,audit,'          npm ci --prefix "$RUNNER_TEMP/audit-deps" --no-audit --ignore-scripts --no-fund\n',''));
reject('packages/node-path-without-playwright','packages',/NODE_PATH does not point/,f=>edit(f,audit,'["audit-deps","playwright-deps"].map(d=>require("path").join(process.env.RUNNER_TEMP,d,"node_modules")).join(require("path").delimiter)','require("path").join(process.env.RUNNER_TEMP,"audit-deps/node_modules")'));
reject('packages/unknown-set','commands',/ad-hoc command: cp -r audit\/deps\/other/,f=>edit(f,audit,'cp -r audit/deps/full','cp -r audit/deps/other'));
reject('packages/playwright-with-others','commands',/ad-hoc command: npm install --prefix "\$RUNNER_TEMP\/playwright-deps"/,f=>edit(f,audit,'--no-fund '+'"playwright@${{ needs.lane-plan.outputs.playwright }}"'+'\n','--no-fund '+'"playwright@${{ needs.lane-plan.outputs.playwright }}"'+' jsdom@26.1.0\n'));
// Each set pins its packages, and its lock is the lock of that package.json, with every package's integrity.
{const read=file=>fs.readFileSync(file,'utf8');assert.deepEqual(toolSetIssues(read),[]);
  const changed=(file,change)=>toolSetIssues(name=>name===file?JSON.stringify(change(JSON.parse(read(name)))):read(name));
  const [set]=workflowToolSets,manifest='audit/deps/'+set+'/package.json',lock='audit/deps/'+set+'/package-lock.json';
  assert.ok(changed(manifest,m=>{m.dependencies['@babel/parser']='^7.28.4';return m;}).some(i=>/does not pin @babel\/parser/.test(i)),'a range');
  assert.ok(changed(manifest,m=>{m.dependencies.extra='1.0.0';return m;}).some(i=>/is not the lock of its package\.json/.test(i)),'a package the lock does not have');
  assert.ok(changed(lock,l=>{const at=Object.keys(l.packages).find(k=>k);delete l.packages[at].integrity;return l;}).some(i=>/without its integrity/.test(i)),'no integrity');
  assert.ok(changed(lock,l=>{const at=Object.keys(l.packages).find(k=>k);l.packages[at].resolved='https://example.org/x.tgz';return l;}).some(i=>/from the npm registry/.test(i)),'another registry');
  pass('packages/tool-sets-locked');}
// Playwright follows its newest release in every job; every other package stays pinned to one release.
for(const [id,from,to] of [['packages/floating-pinned','playwright@latest @babel','playwright@1.65.0 @babel'],['packages/floating-tag','playwright@latest @babel','playwright@next @babel'],['packages/pinned-floats','playwright@latest @babel/parser@7.28.4','playwright@latest @babel/parser@latest']])
  reject(id,'commands',/ad-hoc command: npm install/,f=>edit(f,guard,'--no-fund '+from,'--no-fund '+to));
reject('packages/node-path-missing','packages',/change-guard\.mjs may load @babel\/parser.*NODE_PATH does not point/,f=>edit(f,guard,'"NODE_PATH="+require("path").join(process.env.RUNNER_TEMP,"audit-deps/node_modules")','"AKARI_BROWSER="+require("path").join(process.env.RUNNER_TEMP,"audit-deps/node_modules")'));
// Every job runs the one Node release the contract names, set up before its first node entry.
reject('node-version/other-release','node-version',/sets up Node 24\.22\.1; every job sets up Node 24\.22\.2/,f=>edit(f,guard,"node-version: '24.22.2'","node-version: '24.22.1'"));
reject('node-version/not-set-up','node-version',/runs before the job sets up Node 24\.22\.2/,f=>edit(f,guard,"      - uses: "+pin('actions/setup-node@v4')+"\n        with:\n          node-version: '24.22.2'\n",''));
// An action step always runs (only an upload runs always()), and takes only the inputs its action is given here.
reject('step-if/setup-skipped','step-if',/only an upload is always/,f=>edit(f,guard,"      - uses: "+pin('actions/setup-node@v4')+"\n","      - uses: "+pin('actions/setup-node@v4')+"\n        if: ${{ false }}\n"));
reject('action-inputs/download-run','action-inputs',/download-artifact@v4 takes only pattern, path/,f=>edit(f,acceptance,'          path: audit-evidence/child-ux/downloaded\n','          path: audit-evidence/child-ux/downloaded\n          run-id: 1\n'));
reject('python-version/other','python-version',/every job sets up Python 3\.12/,f=>edit(f,audit,"python-version: '3.12'","python-version: '3.8'"));
reject('packages/child-not-installed','packages',/run-ci-lane\.mjs may load jsdom, and this job does not install it/,f=>edit(f,audit,'cp -r audit/deps/full','cp -r audit/deps/browser'));
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
    // The require that createRequire() makes loads too, named or called at once.
    write('made.mjs',"import {createRequire} from 'node:module';\nconst load=createRequire(import.meta.url);\nload('named-require');\ncreateRequire(import.meta.url)('called-require');\n");
    assert.deepEqual([...scriptPackages(scratch,'made.mjs',{})].sort(),['called-require','named-require']);pass('packages/made-require');
    // An import() of a module it names only through a variable loads what the file declares, as a launch by a variable.
    write('loads.mjs',"const name=process.argv[2];\nawait import(name);\n");
    assert.throws(()=>scriptPackages(scratch,'loads.mjs',{}),/loads\.mjs:2 starts a node script it names only through a variable/);pass('packages/variable-import-undeclared');
    // A TypeScript module is read with its type syntax, and what it imports only as types loads nothing.
    write('typed.mjs',"const {x}=await import('./typed-module.ts');\nconsole.log(x);\n");
    // The relative path is joined in, so that the published-import check does not read the fixture as an import of this file.
    const types='./typed.d.ts';
    write('typed-module.ts',"import type { T } from '"+types+"';\nimport type { U } from 'type-only-package';\nimport 'typed-package';\nexport type V = T | U;\nexport const x: number = 1;\n");
    write('typed.d.ts',"export declare const never: unique symbol;\nexport type T = string;\n");
    assert.deepEqual([...scriptPackages(scratch,'typed.mjs',{})],['typed-package']);pass('packages/typescript-modules');
  }finally{fs.rmSync(scratch,{recursive:true,force:true});}
}
reject('packages/node-path-elsewhere','packages',/change-guard\.mjs may load @babel\/parser.*NODE_PATH does not point/,f=>edit(f,guard,'RUNNER_TEMP,"audit-deps/node_modules")','RUNNER_TEMP,"other/node_modules")'));
reject('artifact/retention-days','artifact',/3 days/,f=>edit(f,guard,'retention-days: 3','retention-days: 90'));
reject('artifact/missing-retention','artifact',/3 days/,f=>edit(f,guard,'          retention-days: 3\n',''));
reject('artifact/missing-files-allowed','artifact',/missing evidence/,f=>edit(f,guard,'if-no-files-found: error','if-no-files-found: warn'));
reject('commands/ad-hoc-audit-check','commands',/ad-hoc command: node audit\/tests\/license-verify/,f=>edit(f,audit,unpackStep,'      - run: node audit/tests/license-verify.mjs audit-evidence/selftest/license-browser.json\n'+unpackStep));
const plannedCodec='          python audit/install-codec-browser.py "$RUNNER_TEMP/functional-browser" "${{ needs.lane-plan.outputs.browser }}" --media\n';
reject('commands/ad-hoc-shell-check','commands',/ad-hoc command: test -f/,f=>edit(f,audit,plannedCodec,plannedCodec+'          test -f Akari.html || exit 1\n'));
// The jobs of a run with a plan install the Playwright and the browser the plan read once (a lane run again later
// takes the same), the plan gives both, and a run with no plan installs the newest.
reject('releases/lane-newest-playwright','releases',/a job of a planned run installs the release its plan read/,f=>edit(f,audit,'audit/deps/full "$RUNNER_TEMP/audit-deps"\n          npm ci --prefix "$RUNNER_TEMP/audit-deps" --no-audit --ignore-scripts --no-fund\n          npm install --prefix "$RUNNER_TEMP/playwright-deps" --no-package-lock --no-audit --ignore-scripts --no-fund "playwright@${{ needs.lane-plan.outputs.playwright }}"\n','audit/deps/full "$RUNNER_TEMP/audit-deps"\n          npm ci --prefix "$RUNNER_TEMP/audit-deps" --no-audit --ignore-scripts --no-fund\n          npm install --prefix "$RUNNER_TEMP/playwright-deps" --no-package-lock --no-audit --ignore-scripts --no-fund playwright@latest\n'));
reject('releases/aggregate-newest-playwright','releases',/a job of a planned run installs the release its plan read/,f=>edit(f,audit,'audit/deps/browser "$RUNNER_TEMP/audit-deps"\n          npm ci --prefix "$RUNNER_TEMP/audit-deps" --no-audit --ignore-scripts --no-fund\n          npm install --prefix "$RUNNER_TEMP/playwright-deps" --no-package-lock --no-audit --ignore-scripts --no-fund "playwright@${{ needs.lane-plan.outputs.playwright }}"\n','audit/deps/browser "$RUNNER_TEMP/audit-deps"\n          npm ci --prefix "$RUNNER_TEMP/audit-deps" --no-audit --ignore-scripts --no-fund\n          npm install --prefix "$RUNNER_TEMP/playwright-deps" --no-package-lock --no-audit --ignore-scripts --no-fund playwright@latest\n'));
reject('releases/lane-newest-browser','releases',/a job of a planned run installs the release its plan read: python/,f=>edit(f,audit,plannedCodec,plannedCodec.replace(' "${{ needs.lane-plan.outputs.browser }}"','')));
reject('releases/unplanned-plan-release','releases',/a job with no plan installs the newest release/,f=>edit(f,guard,'--no-fund playwright@latest @babel','--no-fund "playwright@${{ needs.lane-plan.outputs.playwright }}" @babel'));
// The plan reads the newest Stable Chrome for Testing and the newest Playwright once, and refuses an answer that names
// no release.
{const pages={[releaseSources.browser]:'153.0.8010.12\n',[releaseSources.playwright]:'{"name":"playwright","version":"1.63.0"}'};
  assert.deepEqual(await newestReleases(async url=>pages[url]),{browser:'153.0.8010.12',playwright:'1.63.0'});
  for(const [url,text] of [[releaseSources.browser,'<html>'],[releaseSources.browser,'153.0'],[releaseSources.playwright,'{"version":"next"}'],[releaseSources.playwright,'{}']])
    await assert.rejects(newestReleases(async u=>u===url?text:pages[u]),/is a release number/);
  pass('releases/plan-reads-releases');}
reject('releases/plan-without-browser','jobs',/job outputs differ from the contract/,f=>edit(f,audit,'      browser: ${{ steps.plan.outputs.browser }}\n',''));
// The browser Playwright brings is never installed: a lane runs only on the browser the installer named.
// An install that would run the packages' own scripts, or a Python package with no version, is not a setup line.
reject('commands/npm-install-scripts','commands',/ad-hoc command: npm (?:install|ci)/,f=>edit(f,audit,'--ignore-scripts --no-fund','--no-fund'));
reject('commands/pip-floating','commands',/ad-hoc command: python -m pip install Pillow imageio/,f=>edit(f,audit,'pip install Pillow==12.3.0','pip install Pillow'));
// The functional browser is the one the lane installs (install-codec-browser.py): no setup line names another.
reject('commands/browser-path-set','commands',/ad-hoc command: node -e/,f=>edit(f,audit,'"NODE_PATH="+["audit-deps","playwright-deps"].map(d=>require("path").join(process.env.RUNNER_TEMP,d,"node_modules")).join(require("path").delimiter)','"AKARI_BROWSER="+require("path").join(process.env.RUNNER_TEMP,"chrome/chrome")'));
reject('commands/bundled-browser','commands',/ad-hoc command: "\$RUNNER_TEMP\/audit-deps\/node_modules\/\.bin\/playwright" install/,f=>edit(f,audit,'          python -m pip install Pillow','          "$RUNNER_TEMP/audit-deps/node_modules/.bin/playwright" install --no-shell chromium\n          python -m pip install Pillow'));
{
  const installed=process.execPath,other=path.resolve('audit/run-ci-lane.mjs');
  assert.equal(laneBrowser({AKARI_BROWSER:installed,AKARI_CODEC_BROWSER:installed}),installed);pass('lane-browser/installed');
  for(const [id,env] of [['lane-browser/missing',{}],['lane-browser/empty',{AKARI_BROWSER:'',AKARI_CODEC_BROWSER:''}],
    ['lane-browser/not-installed',{AKARI_BROWSER:'/no/such/chrome',AKARI_CODEC_BROWSER:'/no/such/chrome'}],
    ['lane-browser/directory',{AKARI_BROWSER:path.dirname(installed),AKARI_CODEC_BROWSER:path.dirname(installed)}],
    ['lane-browser/two-browsers',{AKARI_BROWSER:installed,AKARI_CODEC_BROWSER:other}]]){
    assert.throws(()=>laneBrowser(env),/must name the installed browser|one browser for the lane/,id);pass(id);
  }
}
reject('commands/missing-entry','commands',/missing entry: node audit\/lib\/ci-lanes\.mjs unpack/,f=>edit(f,audit,unpackStep,''));
reject('commands/reordered-entries','commands',/out of order/,f=>edit(f,audit,unpackStep+aggregateStep,aggregateStep+unpackStep));
reject('commands/duplicate-entry','commands',/repeated/,f=>edit(f,audit,gateStep,gateStep+gateStep));
reject('step-condition/disabled-entry','step-condition',any,f=>edit(f,audit,gateStep,gateStep+'        if: ${{ false }}\n'));
reject('step-env/entry-env-changed','step-env',/entry environment/,f=>edit(f,audit,'AKARI_NEEDS: ${{ toJSON(needs) }}',"AKARI_NEEDS: '{}'"));
reject('step-env/undeclared','step-env',/undeclared/,f=>edit(f,guard,"        with:\n          node-version: '24.22.2'\n","        with:\n          node-version: '24.22.2'\n        env:\n          NODE_OPTIONS: --require ./preload.cjs\n"));
reject('step-keys/shell-override','step-keys',/not allowed/,f=>edit(f,audit,gateStep,gateStep+'        shell: python\n'));
reject('actions/unknown-action','actions',/not allowed/,f=>edit(f,guard,'      - uses: '+pin('actions/setup-node@v4')+'\n','      - uses: someone/setup-node@main\n'));
// A tag that names an allowed action is not enough (a tag can be moved), and a pinned commit counts only for its own
// repository and tag.
reject('actions/tag-not-commit','actions',/not pinned by its commit: actions\/setup-node@v4$/,f=>edit(f,guard,'      - uses: '+pin('actions/setup-node@v4')+'\n','      - uses: actions/setup-node@v4\n'));
reject('actions/commit-of-another-action','actions',/not allowed/,f=>edit(f,guard,'      - uses: '+pin('actions/setup-node@v4')+'\n','      - uses: actions/setup-python@'+workflowActionPins['actions/setup-node@v4']+' # v4\n'));
reject('bundles/matrix-group-dropped','bundles',/sealed bundle kinds/,f=>edit(f,audit,laneMatrix,'shard: [b01]'));
// The kinds rule is independent of the declared entries: change both the workflow and its declaration.
const singleKind=structuredClone(workflowContract);singleKind[acceptance].jobs['acceptance-lane'].shards=['editing'];
reject('acceptance/kind-dropped','acceptance',/acceptance kinds/,f=>f,singleKind);
// Shard matrices: exactly the planned shards, each run to completion, and no other matrix.
reject('matrix/shard-dropped','matrix',/shards must be exactly/,f=>edit(f,audit,laneMatrix,'shard: [s01]'));
reject('matrix/fail-fast','matrix',/must not cancel/,f=>edit(f,acceptance,'      fail-fast: false\n','      fail-fast: true\n'));
reject('matrix/unplanned-matrix','matrix',/only planned shard jobs/,f=>edit(f,audit,'    timeout-minutes: 5\n','    timeout-minutes: 5\n    strategy:\n      matrix:\n        shard: [s01]\n'));
reject('checkout/guard-shallow-history','checkout',/full history/,f=>edit(f,guard,'          fetch-depth: 0\n',''));
// The guard checks out the head commit, not the merge commit, and keeps no token in the checkout the head's code runs in.
reject('checkout/guard-merge-commit','checkout',/checks out the head commit/,f=>edit(f,guard,'          ref: ${{ github.event.pull_request.head.sha }}\n',''));
reject('checkout/guard-keeps-token','checkout',/without keeping the token/,f=>edit(f,guard,'          persist-credentials: false\n',''));
// Every checkout takes this repository at the commit the run is for: another repository, a ref where no job names one,
// another place or a token are refused, in the audit and the acceptance as in the guard.
const plainCheckout='      - uses: '+pin('actions/checkout@v5')+'\n        with:\n          fetch-depth: 0\n          persist-credentials: false\n';
for(const [id,file,line,detail] of [['checkout/audit-other-repository',audit,'          repository: someone/akari\n',/sets only fetch-depth, persist-credentials; not repository/],
  ['checkout/acceptance-other-ref',acceptance,'          ref: main\n',/sets only fetch-depth, persist-credentials; not ref/],['checkout/audit-other-path',audit,'          path: elsewhere\n',/not path/],
  ['checkout/acceptance-token',acceptance,'          token: ${{ secrets.OTHER }}\n',/not token/]])
  reject(id,'checkout',detail,f=>edit(f,file,plainCheckout,plainCheckout+line));
reject('checkout/audit-shallow-value','checkout',/fetch-depth is 0/,f=>edit(f,audit,plainCheckout,plainCheckout.replace('fetch-depth: 0','fetch-depth: 1')));
reject('checkout/audit-keeps-token','checkout',/persist-credentials is false/,f=>edit(f,audit,plainCheckout,plainCheckout.replace('persist-credentials: false','persist-credentials: true')));
// The base's guard is put back only in the run for pull_request_target.
reject('step-condition/guard-base-guard-always','step-condition',/condition differs/,f=>edit(f,guard,"        if: ${{ github.event_name == 'pull_request_target' }}\n",''));

// Every file of the guard needs the owner: the guard workflows, what the scripts they run load or start, and the owner
// list itself; a file the guard reaches that the list leaves out is found.
const owners=fs.readFileSync('.github/CODEOWNERS','utf8'),reach=script=>scriptReach('.',script).files;
assert.deepEqual(unownedGuardFiles(current,owners,reach),[]);pass('owners/guard-files-listed');
assert.deepEqual(unownedGuardFiles(current,owners.replace(/^\/audit\/lib\/behaviour-snapshot\.mjs .*\n/m,''),reach),['audit/lib/behaviour-snapshot.mjs']);
assert.deepEqual(unownedGuardFiles(current,owners.replace(/^\/\.github\/CODEOWNERS .*\n/m,''),reach),['.github/CODEOWNERS']);
// A JSON file a guard file loads (the recorded refusal reasons) is a guard file too.
assert.deepEqual(unownedGuardFiles(current,owners.replace(/^\/audit\/fixtures\/refusal-reasons\.json .*\n/m,''),reach),['audit/fixtures/refusal-reasons.json']);pass('owners/unlisted-guard-file');
// The modules the guard loads from the tree under review (by a variable import()) are guard files too.
assert.deepEqual(unownedGuardFiles(current,owners.replace(/^\/audit\/lib\/verify-language-results\.mjs .*\n/m,''),reach),['audit/lib/verify-language-results.mjs']);pass('owners/guard-loaded-module-listed');
writeCaseReport(output,'workflow-contract',results,{workflows:Object.keys(current)});
console.log('Workflow contract: current workflows accepted; '+(results.length-1)+' mutated workflows rejected');
