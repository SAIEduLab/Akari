// Static contract for .github/workflows/*.yml. The workflows are read as text with a
// strict YAML subset; anything outside the subset is rejected instead of guessed.
import fs from 'node:fs';
import {workForUnit} from '../run-ci-lane.mjs';
import {laneUnits} from './ci-lanes.mjs';
import {auditBundleKinds,acceptanceCommands,workflowContract} from './gate-contract.mjs';

const yamlError=(line,message)=>new Error('line '+line+': '+message);
const keyPattern=/^([A-Za-z_][A-Za-z0-9_.-]*):(?: (.*))?$/;
const isItem=text=>text==='-'||text.startsWith('- ');

function parseQuoted(text,line){
  const quote=text[0];let value='',i=1,closed=false;
  for(;i<text.length;i++){
    const c=text[i];
    if(quote==="'"){
      if(c==="'"){if(text[i+1]==="'"){value+="'";i++;continue;}closed=true;break;}
      value+=c;
    } else {
      if(c==='\\'){const n=text[++i],map={'\\':'\\','"':'"',n:'\n'};if(!Object.hasOwn(map,n))throw yamlError(line,'unsupported escape');value+=map[n];continue;}
      if(c==='"'){closed=true;break;}
      value+=c;
    }
  }
  if(!closed)throw yamlError(line,'unterminated quoted scalar');
  const rest=text.slice(i+1).trim();
  if(rest&&!rest.startsWith('#'))throw yamlError(line,'text after quoted scalar');
  return value;
}
function parsePlain(text,line){
  const at=text.search(/\s#/),value=(at<0?text:text.slice(0,at)).trim();
  if(/^[&*!%@`{}?>|#,\]]/.test(value)||value.startsWith('<<')||value.startsWith('- '))throw yamlError(line,'unsupported YAML construct: '+value.slice(0,24));
  if(/: |:$/.test(value))throw yamlError(line,'ambiguous plain scalar: '+value.slice(0,24));
  return value;
}
function parseScalar(raw,line){
  const text=raw.trim();
  if(text[0]==="'"||text[0]==='"')return parseQuoted(text,line);
  if(text[0]==='['){
    const at=text.lastIndexOf(']');
    if(at<0)throw yamlError(line,'unterminated flow sequence');
    const rest=text.slice(at+1).trim();if(rest&&!rest.startsWith('#'))throw yamlError(line,'text after flow sequence');
    const inner=text.slice(1,at).trim();
    if(/[[\]{}]/.test(inner))throw yamlError(line,'nested flow collection');
    return inner===''?[]:inner.split(',').map(item=>{if(!item.trim())throw yamlError(line,'empty flow item');return parseScalar(item,line);});
  }
  return parsePlain(text,line);
}

// Supports block mappings, block sequences, flow sequences of scalars, quoted and plain
// scalars, comments and literal block scalars (|). Rejects tabs, anchors, aliases, tags,
// merge keys, flow mappings, folded or chomped block scalars, duplicate keys, multi-line
// plain scalars and multiple documents.
export function parseWorkflowYaml(text){
  if(text.charCodeAt(0)===0xFEFF)throw yamlError(1,'byte order mark');
  const raw=text.replace(/\r\n/g,'\n').split('\n');
  raw.forEach((l,n)=>{if(l.includes('\t'))throw yamlError(n+1,'tab character');});
  const lines=raw.map((l,n)=>({no:n+1,indent:l.length-l.trimStart().length,text:l.trim(),raw:l}));
  for(const l of lines)if(/^(---|\.\.\.)(\s|$)|^%/.test(l.text)&&l.indent===0)throw yamlError(l.no,'document marker or directive');
  let i=0;
  const skip=()=>{while(i<lines.length&&(lines[i].text===''||lines[i].text.startsWith('#')))i++;};
  function blockScalar(parentIndent){
    const out=[];let contentIndent=null;
    while(i<lines.length){
      const l=lines[i];
      if(l.text===''){out.push('');i++;continue;}
      if(l.indent<=parentIndent)break;
      contentIndent??=l.indent;
      if(l.indent<contentIndent)throw yamlError(l.no,'block scalar indentation');
      out.push(l.raw.slice(contentIndent));i++;
    }
    while(out.length&&out.at(-1)==='')out.pop();
    if(!out.length)throw yamlError(lines[Math.max(0,i-1)].no,'empty block scalar');
    return out.join('\n')+'\n';
  }
  function value(rest,line,indent){
    const t=(rest??'').trim();
    if(t===''||t.startsWith('#')){
      i++;skip();
      return i<lines.length&&lines[i].indent>indent?node(lines[i].indent):null;
    }
    if(t==='|'||t.startsWith('| #')){i++;return blockScalar(indent);}
    if(/^[|>]/.test(t))throw yamlError(line,'only plain literal block scalars (|) are supported');
    i++;return parseScalar(t,line);
  }
  function mapping(indent){
    const out={};
    for(skip();i<lines.length;skip()){
      const l=lines[i];
      if(l.indent<indent)break;
      if(l.indent>indent)throw yamlError(l.no,'unexpected indentation');
      if(isItem(l.text))throw yamlError(l.no,'sequence item where a mapping key was expected');
      const m=keyPattern.exec(l.text);
      if(!m)throw yamlError(l.no,'unsupported mapping entry: '+l.text.slice(0,30));
      if(Object.hasOwn(out,m[1]))throw yamlError(l.no,'duplicate key '+m[1]);
      if(m[1]==='__proto__')throw yamlError(l.no,'reserved key');
      out[m[1]]=value(m[2],l.no,indent);
    }
    return out;
  }
  function sequence(indent){
    const out=[];
    for(skip();i<lines.length;skip()){
      const l=lines[i];
      if(l.indent<indent)break;
      if(l.indent>indent)throw yamlError(l.no,'unexpected indentation');
      if(!isItem(l.text))throw yamlError(l.no,'mapping key where a sequence item was expected');
      const after=l.text.slice(1),item=after.trim();
      if(item===''||item.startsWith('#')){i++;skip();out.push(i<lines.length&&lines[i].indent>indent?node(lines[i].indent):null);continue;}
      if(keyPattern.test(item)){
        // The item's mapping continues at the column of its first key.
        const keyIndent=l.indent+1+(after.length-after.trimStart().length);
        lines[i]={...l,indent:keyIndent,text:item};
        out.push(mapping(keyIndent));continue;
      }
      i++;out.push(parseScalar(item,l.no));
    }
    return out;
  }
  function node(indent){skip();return isItem(lines[i].text)?sequence(indent):mapping(indent);}
  skip();
  if(i>=lines.length)throw yamlError(1,'empty workflow');
  if(lines[i].indent!==0||isItem(lines[i].text))throw yamlError(lines[i].no,'a workflow is a mapping at column 0');
  const doc=mapping(0);
  skip();if(i<lines.length)throw yamlError(lines[i].no,'unparsed content');
  return doc;
}

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const same=(a,b)=>JSON.stringify(canonical(a??null))===JSON.stringify(canonical(b??null));
const sameSet=(a,b)=>new Set(a).size===a.length&&same([...a].sort(),[...b].sort());
function matrixRows(matrix){
  if(matrix===undefined)return [{}];
  if(!matrix||typeof matrix!=='object'||Array.isArray(matrix))return null;
  if(Object.hasOwn(matrix,'include'))return Object.keys(matrix).length===1&&Array.isArray(matrix.include)?matrix.include:null;
  let rows=[{}];
  for(const [key,values] of Object.entries(matrix)){if(!Array.isArray(values))return null;rows=rows.flatMap(row=>values.map(v=>({...row,[key]:v})));}
  return rows;
}
const tokens=command=>command.match(/"[^"]*"|\S+/g).map(token=>token.replace(/^"|"$/g,''));

export const workflowActions=Object.freeze(['actions/checkout@v5','actions/setup-node@v4','actions/setup-python@v5','actions/upload-artifact@v4','actions/download-artifact@v4']);
// Each action is pinned by the commit its tag named when it was chosen (a tag can be moved; a commit cannot): a workflow
// writes owner/name@<commit> # <tag>, and a step is read as owner/name@<tag> only for this pair (a commit of another
// repository, or of the same one under another tag, is not allowed).
export const workflowActionPins=Object.freeze({'actions/checkout@v5':'fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09','actions/setup-node@v4':'49933ea5288caeca8642d1e84afbd3f7d6820020','actions/setup-python@v5':'a26af69be951a213d495a4c3e4e4022e16d87065','actions/upload-artifact@v4':'ea165f8d65b6e75b540449e92b4886f43607fa02','actions/download-artifact@v4':'d3f86a106a0bac45b974a628896c90dbdf5c8093'});
const pinnedAction=uses=>Object.keys(workflowActionPins).find(named=>uses===named.split('@')[0]+'@'+workflowActionPins[named])??null;
// The packages that follow their newest release instead of one pinned release: Playwright, so that the audit drives
// the newest browser (audit/lib/browser-environment.mjs). An install names each of them as name@latest, never pinned;
// a job of a run that has a plan (lane-plan) installs the release the plan read once for the whole run, as it installs
// the plan's browser (audit/lib/ci-lanes.mjs newestReleases), so the jobs of one run never drive two releases.
export const floatingPackages=Object.freeze(['playwright']);
export const plannedPlaywright='"playwright@${{ needs.lane-plan.outputs.playwright }}"',plannedBrowser='"${{ needs.lane-plan.outputs.browser }}"';
const escaped=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const floating=floatingPackages.join('|'),packageSpec='(?:(?:'+floating+')@latest|'+escaped(plannedPlaywright)+'|(?!(?:'+floating+')@)(?:@[a-z0-9-]+\\/)?[a-z0-9-]+@\\d+\\.\\d+\\.\\d+)';
// The sets of audit tools a job installs from a lock (audit/deps/<set>: package.json and package-lock.json), every
// package of the tree pinned with its integrity, so that a release of a package the tools depend on does not change a
// run. A job copies the set to $RUNNER_TEMP/audit-deps and installs it with npm ci, and installs Playwright apart, in
// $RUNNER_TEMP/playwright-deps; NODE_PATH points at both. The change guard reads no lock: it installs before it puts back
// the base's guard, so a lock of the head would choose what the guard loads; it names every package of its small tree.
export const workflowToolSets=Object.freeze(['full','browser']);
const nodePathBoth='node -e \'require("fs").appendFileSync(process.env.GITHUB_ENV,"NODE_PATH="+["audit-deps","playwright-deps"].map(d=>require("path").join(process.env.RUNNER_TEMP,d,"node_modules")).join(require("path").delimiter)+"\\n")\'';
const toolSetCopy=new RegExp('^cp -r audit\\/deps\\/('+workflowToolSets.join('|')+') "\\$RUNNER_TEMP\\/audit-deps"$'),toolSetInstall='npm ci --prefix "$RUNNER_TEMP/audit-deps" --no-audit --ignore-scripts --no-fund';
// A set's packages: its package.json pins each one, and its lock records the same ones and every package of the tree
// with its integrity, from the npm registry.
export function toolSetIssues(read=file=>fs.readFileSync(file,'utf8')){
  const issues=[];
  for(const set of workflowToolSets){const where='audit/deps/'+set;let manifest,lock;
    try{manifest=JSON.parse(read(where+'/package.json'));lock=JSON.parse(read(where+'/package-lock.json'));}catch(error){issues.push(where+' cannot be read: '+error.message);continue;}
    const wanted=manifest?.dependencies||{};
    for(const [name,version] of Object.entries(wanted))if(!/^\d+\.\d+\.\d+$/.test(version))issues.push(where+'/package.json does not pin '+name+': '+version);
    if(lock?.lockfileVersion!==3||JSON.stringify(lock.packages?.['']?.dependencies||{})!==JSON.stringify(wanted))issues.push(where+'/package-lock.json is not the lock of its package.json');
    for(const [at,entry] of Object.entries(lock?.packages||{}))if(at&&!(typeof entry?.integrity==='string'&&/^https:\/\/registry\.npmjs\.org\//.test(entry.resolved||'')))
      issues.push(where+'/package-lock.json records '+at+' without its integrity from the npm registry');}
  return issues;
}
// Setup lines may install pinned tools and export their paths; they never run an audit check. An npm install runs no
// package's install scripts (--ignore-scripts), and a Python package is named with its version.
export const workflowSetupLines=Object.freeze([
  new RegExp('^npm install --prefix "\\$RUNNER_TEMP\\/audit-deps" --no-package-lock --no-audit --ignore-scripts --no-fund(?: '+packageSpec+')+$'),
  new RegExp('^npm install --prefix "\\$RUNNER_TEMP\\/playwright-deps" --no-package-lock --no-audit --ignore-scripts --no-fund (?:playwright@latest|'+escaped(plannedPlaywright)+')$'),
  toolSetCopy,new RegExp('^'+escaped(toolSetInstall)+'$'),new RegExp('^'+escaped(nodePathBoth)+'$'),
  /^echo "AKARI_PYTHON=python" >> "\$GITHUB_ENV"$/,
  /^node -e 'require\("fs"\)\.appendFileSync\(process\.env\.GITHUB_ENV,"NODE_PATH="\+require\("path"\)\.join\(process\.env\.RUNNER_TEMP,"[A-Za-z0-9_\/.-]+"\)\+"\\n"\)'$/,
  new RegExp('^python audit\\/install-codec-browser\\.py "\\$RUNNER_TEMP\\/[a-z-]+"(?: '+escaped(plannedBrowser)+')?(?: --media)?$'),
  /^python -m pip install Pillow==12\.3\.0 imageio-ffmpeg==0\.6\.0$/,
  /^mkdir -p audit-evidence\/[a-z-]+$/,
]);
// The one Node release every job sets up before its first node entry: shards on different patch releases once gave
// different results.
export const workflowNodeVersion='24.22.2';
export const workflowPythonVersion='3.12';
// What each action step may be given: nothing else (a run, a repository or a token of another download, a version
// other than the plan's). checkout's keys are checked with its job below.
const actionInputs=Object.freeze({'actions/setup-node@v4':['node-version'],'actions/setup-python@v5':['python-version'],
  'actions/upload-artifact@v4':['name','path','if-no-files-found','retention-days','include-hidden-files'],'actions/download-artifact@v4':['pattern','path']});
// The setup line that points NODE_PATH at one directory under $RUNNER_TEMP (the folders the install lines fill must be
// the ones NODE_PATH names).
const nodePathSetting=/^node -e 'require\("fs"\)\.appendFileSync\(process\.env\.GITHUB_ENV,"NODE_PATH="\+require\("path"\)\.join\(process\.env\.RUNNER_TEMP,"([A-Za-z0-9_\/.-]+)"\)\+"\\n"\)'$/;
export const concurrencyCancel="${{ github.event_name == 'pull_request' }}";
export const concurrencyGroup=file=>file.replace(/\.yml$/,'')+'-${{ github.event_name }}-${{ github.event.pull_request.number || github.run_id }}';
export const workflowTriggers=Object.freeze({
  audit:{pull_request:{branches:['main']},push:{branches:['main']},workflow_dispatch:null},
  authorization:{pull_request_target:{branches:['main'],types:['opened','synchronize','reopened','edited']}},
  // The change guard runs with the base's guard for every change, and with the head's own for a change to its workflow.
  guard:{pull_request_target:{branches:['main'],types:['opened','synchronize','reopened']},pull_request:{branches:['main'],types:['opened','synchronize','reopened'],paths:['.github/workflows/akari-change-guard.yml']}},
});
const topLevelKeys=['name','on','permissions','env','concurrency','jobs'];
const jobKeys=['if','needs','runs-on','timeout-minutes','strategy','defaults','permissions','steps','outputs'];
const stepKeys=['id','name','uses','with','run','if','env'];

// files: {fileName: text}. Returns [{rule, file, where, detail}]; an empty list accepts the workflows. scriptPackages,
// when given, names the packages a script may load (audit/lib/script-packages.mjs).
export function workflowIssues(files,contract=workflowContract,scriptPackages=null){
  const issues=[];
  const issue=(rule,file,where,detail)=>issues.push({rule,file,where,detail});
  const names=Object.keys(files).sort(),declared=Object.keys(contract).sort();
  for(const f of names)if(!declared.includes(f))issue('workflow-set',f,'file','undeclared workflow file');
  for(const f of declared)if(!names.includes(f))issue('workflow-set',f,'file','missing workflow file');
  const sealed=[],accepted=[];
  for(const file of declared.filter(f=>names.includes(f))){
    let doc;
    try{doc=parseWorkflowYaml(files[file]);}catch(error){issue('yaml',file,'text',error.message);continue;}
    const spec=contract[file];
    for(const key of Object.keys(doc))if(!topLevelKeys.includes(key))issue('workflow-keys',file,key,'top-level key not allowed');
    if(!same(doc.env,spec.env))issue('workflow-env',file,'env','workflow environment differs from the contract');
    if(!same(doc.on,workflowTriggers[spec.triggers]))issue('triggers',file,'on','triggers must be exactly '+JSON.stringify(workflowTriggers[spec.triggers]));
    if(!same(doc.permissions,spec.permissions??{contents:'read'}))issue('permissions',file,'permissions','workflow permissions must be contents: read');
    const c=doc.concurrency;
    if(!c||typeof c!=='object')issue('concurrency',file,'concurrency','missing concurrency');
    else {
      if(c['cancel-in-progress']!==(spec.cancel??concurrencyCancel))issue('concurrency',file,'cancel-in-progress','only pull-request runs may cancel an in-progress run');
      if(c.group!==concurrencyGroup(file))issue('concurrency',file,'group','runs outside pull requests need their own concurrency group');
      for(const key of Object.keys(c))if(!['group','cancel-in-progress'].includes(key))issue('concurrency',file,key,'unknown concurrency key');
    }
    const jobs=doc.jobs&&typeof doc.jobs==='object'&&!Array.isArray(doc.jobs)?doc.jobs:{};
    for(const id of Object.keys(jobs))if(!Object.hasOwn(spec.jobs,id))issue('jobs',file,id,'undeclared job');
    for(const [id,jobSpec] of Object.entries(spec.jobs)){
      const job=jobs[id];
      if(!job||typeof job!=='object'){issue('jobs',file,id,'missing job');continue;}
      for(const key of Object.keys(job))if(key==='continue-on-error')issue('continue-on-error',file,id,'job continues on error');else if(!jobKeys.includes(key))issue('job-keys',file,id+'.'+key,'job key not allowed');
      if((job.if??null)!==(jobSpec.if??null))issue('jobs',file,id+'.if','job condition differs from the contract');
      if(!same(job.outputs,jobSpec.outputs))issue('jobs',file,id+'.outputs','job outputs differ from the contract');
      const needs=job.needs===undefined?[]:Array.isArray(job.needs)?job.needs:[job.needs];
      if(!sameSet(needs,jobSpec.needs))issue('needs',file,id+'.needs','needs must be '+JSON.stringify(jobSpec.needs));
      if(needs.length&&!/^\$\{\{ always\(\) && /.test(job.if??''))issue('needs',file,id+'.if','a job with needs must run always() so failed dependencies are reported');
      if(!/^[1-9][0-9]*$/.test(String(job['timeout-minutes']??'')))issue('timeout',file,id+'.timeout-minutes','every job needs a positive integer timeout');
      if(job.permissions!==undefined&&(!job.permissions||typeof job.permissions!=='object'||Object.values(job.permissions).some(v=>v!=='read')))issue('permissions',file,id+'.permissions','job permissions must be read-only');
      if(job.defaults!==undefined&&!same(job.defaults,{run:{shell:'bash'}}))issue('job-keys',file,id+'.defaults','only defaults.run.shell: bash is allowed');
      if(job['runs-on']!=='windows-latest')issue('runner',file,id+'.runs-on','every CI job must use windows-latest');
      if(!same(job.defaults,{run:{shell:'bash'}}))issue('runner',file,id+'.defaults','Windows CI entry commands require the declared bash shell');
      const matrix=job.strategy?.matrix;
      // For a runtime matrix, validate its source exactly and check commands for every possible shard.
      const fromPlan=jobSpec.shardExpression&&same(matrix,{shard:jobSpec.shardExpression});
      const rows=matrixRows(fromPlan?{shard:jobSpec.shards}:matrix);
      if(!rows)issue('job-keys',file,id+'.strategy','unsupported matrix form');
      // A sharded job runs exactly the planned shards (audit/lib/shard-plan.cjs), each to completion.
      if(jobSpec.shards){
        if(!same(matrix,{shard:jobSpec.shardExpression??jobSpec.shards}))issue('matrix',file,id+'.strategy.matrix','shards must be exactly '+JSON.stringify(jobSpec.shards));
        if(job.strategy?.['fail-fast']!=='false')issue('matrix',file,id+'.strategy','a failing shard must not cancel the other shards');
        if(job.strategy?.['max-parallel']!==jobSpec.maxParallel)issue('matrix',file,id+'.strategy.max-parallel','parallel limit differs from the contract');
        for(const key of Object.keys(job.strategy||{}))if(!['matrix','fail-fast','max-parallel'].includes(key))issue('matrix',file,id+'.strategy.'+key,'strategy key not allowed');
      }else if(job.strategy!==undefined)issue('matrix',file,id+'.strategy','only planned shard jobs use a matrix');
      const steps=Array.isArray(job.steps)?job.steps:[];
      if(!steps.length)issue('jobs',file,id+'.steps','job has no steps');
      const entries=jobSpec.entries,seen=new Set(),installed=new Set(),filled=new Set();let next=0,nodePath=null,nodeSetUp=false,copied=null;
      steps.forEach((step,n)=>{
        const at=id+'.steps['+n+']';
        if(!step||typeof step!=='object'||Array.isArray(step)){issue('step-keys',file,at,'a step is a mapping');return;}
        for(const key of Object.keys(step))if(key==='continue-on-error')issue('continue-on-error',file,at,'step continues on error');else if(!stepKeys.includes(key))issue('step-keys',file,at+'.'+key,'step key not allowed');
        if((step.uses===undefined)===(step.run===undefined)){issue('step-keys',file,at,'a step has exactly one of uses and run');return;}
        if(step.uses!==undefined){
          if(step.id!==undefined)issue('step-keys',file,at,'action step id not allowed');
          const named=pinnedAction(step.uses);
          if(!named)issue('actions',file,at,workflowActions.includes(step.uses)?'action not pinned by its commit: '+step.uses:'action not allowed: '+step.uses);
          else step={...step,uses:named};
          // An action step always runs (an upload also after a failure, so the evidence of it is kept).
          if(step.if!==undefined&&!(step.uses==='actions/upload-artifact@v4'&&step.if==='always()'))issue('step-if',file,at,'an action step runs always; only an upload is always()');
          for(const key of Object.keys(step.with||{}))if(actionInputs[step.uses]&&!actionInputs[step.uses].includes(key))issue('action-inputs',file,at+'.with.'+key,step.uses+' takes only '+actionInputs[step.uses].join(', '));
          if(step.uses==='actions/setup-python@v5'&&step.with?.['python-version']!==workflowPythonVersion)issue('python-version',file,at,'every job sets up Python '+workflowPythonVersion);
          if(step.uses==='actions/setup-node@v4'){
            if(step.with?.['node-version']!==workflowNodeVersion)issue('node-version',file,at,'the job sets up Node '+step.with?.['node-version']+'; every job sets up Node '+workflowNodeVersion);
            nodeSetUp=true;
          }
          if(step.env!==undefined)issue('step-env',file,at,'undeclared step environment');
          if(step.uses==='actions/upload-artifact@v4'){
            if(step.with?.['retention-days']!=='3')issue('artifact',file,at,'artifacts are kept for 3 days');
            if(step.with?.['if-no-files-found']!=='error')issue('artifact',file,at,'missing evidence must fail the upload');
          }
          // Every checkout takes this repository at the commit the run is for: it chooses only the history and whether the
          // token is kept, and the commit only where the job names one (the authorization's base, the guard's head).
          if(step.uses==='actions/checkout@v5'){
            const allowed=['fetch-depth','persist-credentials',...(jobSpec.trustedBase||jobSpec.headCheckout?['ref']:[])];
            for(const key of Object.keys(step.with||{}))if(!allowed.includes(key))issue('checkout',file,at,'a checkout sets only '+allowed.join(', ')+'; not '+key);
            if(step.with?.['fetch-depth']!==undefined&&step.with['fetch-depth']!=='0')issue('checkout',file,at,'fetch-depth is 0 (the full history) or not set');
            if(step.with?.['persist-credentials']!==undefined&&step.with['persist-credentials']!=='false')issue('checkout',file,at,'persist-credentials is false or not set');
          }
          if(step.uses==='actions/checkout@v5'&&jobSpec.trustedBase&&step.with?.ref!=='${{ github.event.pull_request.base.sha }}')issue('checkout',file,at,'authorization must check out the trusted base');
          if(step.uses==='actions/checkout@v5'&&jobSpec.fullHistory&&step.with?.['fetch-depth']!=='0')issue('checkout',file,at,'the change guard needs the full history');
          if(step.uses==='actions/checkout@v5'&&jobSpec.headCheckout&&(step.with?.ref!=='${{ github.event.pull_request.head.sha }}'||step.with?.['persist-credentials']!=='false'))issue('checkout',file,at,'the change guard checks out the head commit without keeping the token');
          return;
        }
        const run=String(step.run).trim(),index=entries.findIndex(e=>e.run===run);
        if(index<0){
          if(step.id!==undefined)issue('step-keys',file,at,'setup step id not allowed');
          if(step.env!==undefined)issue('step-env',file,at,'undeclared step environment');
          for(const line of run.split('\n').map(s=>s.trim()).filter(Boolean)){
            if(!workflowSetupLines.some(re=>re.test(line)))issue('commands',file,at,'ad-hoc command: '+line);
            // A job of a planned run installs the plan's Playwright and browser; a job of a run with no plan, the newest.
            else if(/^npm install |^python audit\/install-codec-browser\.py /.test(line)&&(line.includes(line.startsWith('npm')?plannedPlaywright:plannedBrowser)!==needs.includes('lane-plan')||(needs.includes('lane-plan')&&/ playwright@latest\b/.test(line))))
              issue('releases',file,at,needs.includes('lane-plan')?'a job of a planned run installs the release its plan read: '+line:'a job with no plan installs the newest release: '+line);
            if(line.startsWith('npm install ')){for(const spec of tokens(line).filter(t=>/^@?[a-z0-9-]+(?:\/[a-z0-9-]+)?@(?:\d|latest$|\$\{\{ needs\.lane-plan\.outputs\.)/.test(t)))installed.add(spec.replace(/(.)@.*$/,'$1'));
              filled.add(line.includes('/playwright-deps" ')?'playwright-deps':'audit-deps');}
            // (a copied set is installed by the npm ci after it)
            else if(toolSetCopy.test(line))copied=line.match(toolSetCopy)[1];
            else if(line===toolSetInstall&&copied){try{Object.keys(JSON.parse(fs.readFileSync('audit/deps/'+copied+'/package.json','utf8')).dependencies||{}).forEach(name=>installed.add(name));}catch{}filled.add('audit-deps');copied=null;}
            else if(line===nodePathBoth)nodePath=['audit-deps','playwright-deps'];
            else if(nodePathSetting.test(line))nodePath=[line.match(nodePathSetting)[1].replace(/\/node_modules$/,'')];
          }
          return;
        }
        // A script's packages are installed before it runs, and NODE_PATH points where they were installed
        // (audit/lib/script-packages.mjs).
        if(/^node /.test(run)&&!nodeSetUp)issue('node-version',file,at,'a node entry runs before the job sets up Node '+workflowNodeVersion);
        if(scriptPackages&&/^node [^ ]+\.[cm]?js\b/.test(run)){
          const script=tokens(run)[1],loads=[...scriptPackages(script)];
          for(const name of loads)if(!installed.has(name))issue('packages',file,at,script+' may load '+name+', and this job does not install it before');
          if(loads.length&&(!nodePath||[...filled].some(dir=>!nodePath.includes(dir))))issue('packages',file,at,script+' may load '+loads.join(', ')+', and NODE_PATH does not point at $RUNNER_TEMP/'+[...filled].join(', $RUNNER_TEMP/')+', where this job installs them');
        }
        if(seen.has(index))issue('commands',file,at,'entry repeated: '+run);
        else if(index!==next)issue('commands',file,at,'entry out of order: '+run);
        seen.add(index);next=Math.max(next,index+1);
        if(step.id!==entries[index].id)issue('step-keys',file,at,'entry id differs from the contract');
        if((step.if??null)!==(entries[index].if??null))issue('step-condition',file,at,'entry condition differs from the contract');
        if(!same(step.env,entries[index].env))issue('step-env',file,at,'entry environment differs from the contract');
        const args=tokens(run);
        if(args[1]==='audit/run-ci-lane.mjs')for(const row of rows||[]){
          try{
            for(const unit of laneUnits(args[2],row.shard)){
              for(const [script,mode,kind] of workForUnit(unit,{}).commands){
                if(script==='audit/verify-evidence.mjs'&&mode==='seal')sealed.push(kind);
                if(script==='audit/run-acceptance.mjs'&&!accepted.includes(mode))accepted.push(mode);
              }
            }
          }catch(error){issue('matrix',file,id,error.message);}
        }
        if(args[1]==='audit/run-acceptance.mjs')accepted.push(args[2]);
      });
      entries.forEach((e,n)=>{if(!seen.has(n))issue('commands',file,id,'missing entry: '+e.run);});
    }
  }
  if(!sameSet(sealed,auditBundleKinds))issue('bundles','*','seal','sealed bundle kinds '+JSON.stringify([...sealed].sort())+' differ from '+JSON.stringify([...auditBundleKinds].sort()));
  if(!sameSet(accepted,Object.keys(acceptanceCommands)))issue('acceptance','*','run-acceptance','acceptance kinds '+JSON.stringify([...accepted].sort())+' differ from '+JSON.stringify(Object.keys(acceptanceCommands).sort()));
  return issues;
}

// The files whose change needs the owner (AUDIT.md「記録の意味」): the guard workflows, every repository file the scripts
// they run load or start (scriptReach), and the owner list itself. files: the workflows by name, as workflowIssues
// takes them; owners: the text of .github/CODEOWNERS; reach(script): the repository files a script loads or starts.
// Returns the files that no line of the owner list names, sorted.
export const GUARD_WORKFLOWS = Object.freeze(['akari-change-guard.yml', 'akari-work-authorization.yml']);
export function unownedGuardFiles(files, owners, reach) {
  const listed = new Set(owners.split('\n').map(line => line.trim()).filter(line => line.startsWith('/')).map(line => line.split(/\s+/)[0].slice(1)));
  const scripts = GUARD_WORKFLOWS.flatMap(name => [...(files[name] ?? '').matchAll(/^\s*(?:- )?run: node (\S+)/gm)].map(m => m[1]));
  if (!scripts.length) throw new Error('the guard workflows run no node script');
  const guarded = new Set(['.github/CODEOWNERS', ...GUARD_WORKFLOWS.map(name => '.github/workflows/' + name), ...scripts.flatMap(reach)]);
  return [...guarded].filter(file => !listed.has(file)).sort();
}
