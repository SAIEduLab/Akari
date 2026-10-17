// Static contract for .github/workflows/*.yml. The workflows are read as text with a
// strict YAML subset; anything outside the subset is rejected instead of guessed.
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
// Setup lines may install pinned tools and export their paths; they never run an audit check.
export const workflowSetupLines=Object.freeze([
  /^npm install --prefix "\$RUNNER_TEMP\/audit-deps" --no-package-lock --no-audit --no-fund(?: (?:@[a-z0-9-]+\/)?[a-z0-9-]+@\d+\.\d+\.\d+)+$/,
  /^echo "NODE_PATH=\$RUNNER_TEMP\/audit-deps\/node_modules" >> "\$GITHUB_ENV"$/,
  /^echo "AKARI_PYTHON=python" >> "\$GITHUB_ENV"$/,
  /^node -e 'require\("fs"\)\.appendFileSync\(process\.env\.GITHUB_ENV,"(?:NODE_PATH|AKARI_BROWSER)="\+require\("path"\)\.join\(process\.env\.RUNNER_TEMP,"[A-Za-z0-9_\/.-]+"\)\+"\\n"\)'$/,
  /^"\$RUNNER_TEMP\/audit-deps\/node_modules\/\.bin\/playwright" install(?:-deps)?(?: --with-deps)?(?: --no-shell)? chromium$/,
  /^python audit\/install-codec-browser\.py "\$RUNNER_TEMP\/[a-z-]+"$/,
  /^python -m pip install Pillow$/,
  /^sudo apt-get update(?: -qq)?$/,
  /^sudo apt-get install -y(?: -qq)?(?: [a-z0-9-]+)+$/,
  /^mkdir -p audit-evidence\/[a-z-]+$/,
  /^if \[ "\$\{\{ matrix\.platform \}\}" = linux \]; then$/,
  /^fi$/,
]);
export const concurrencyCancel="${{ github.event_name == 'pull_request' }}";
export const concurrencyGroup=file=>file.replace(/\.yml$/,'')+'-${{ github.event_name }}-${{ github.event.pull_request.number || github.run_id }}';
export const workflowTriggers=Object.freeze({
  audit:{pull_request:{branches:['main']},push:{branches:['main']},workflow_dispatch:null},
  guard:{pull_request:{branches:['main'],types:['opened','synchronize','reopened','labeled','unlabeled']}},
});
const topLevelKeys=['name','on','permissions','env','concurrency','jobs'];
const jobKeys=['if','needs','runs-on','timeout-minutes','strategy','defaults','permissions','steps'];
const stepKeys=['name','uses','with','run','if','env'];

// files: {fileName: text}. Returns [{rule, file, where, detail}]; an empty list accepts the workflows.
export function workflowIssues(files,contract=workflowContract){
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
    if(!same(doc.permissions,{contents:'read'}))issue('permissions',file,'permissions','workflow permissions must be contents: read');
    const c=doc.concurrency;
    if(!c||typeof c!=='object')issue('concurrency',file,'concurrency','missing concurrency');
    else {
      if(c['cancel-in-progress']!==concurrencyCancel)issue('concurrency',file,'cancel-in-progress','only pull-request runs may cancel an in-progress run');
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
      const needs=job.needs===undefined?[]:Array.isArray(job.needs)?job.needs:[job.needs];
      if(!sameSet(needs,jobSpec.needs))issue('needs',file,id+'.needs','needs must be '+JSON.stringify(jobSpec.needs));
      if(needs.length&&!/^\$\{\{ always\(\) && /.test(job.if??''))issue('needs',file,id+'.if','a job with needs must run always() so failed dependencies are reported');
      if(!/^[1-9][0-9]*$/.test(String(job['timeout-minutes']??'')))issue('timeout',file,id+'.timeout-minutes','every job needs a positive integer timeout');
      if(job.permissions!==undefined&&(!job.permissions||typeof job.permissions!=='object'||Object.values(job.permissions).some(v=>v!=='read')))issue('permissions',file,id+'.permissions','job permissions must be read-only');
      if(job.defaults!==undefined&&!same(job.defaults,{run:{shell:'bash'}}))issue('job-keys',file,id+'.defaults','only defaults.run.shell: bash is allowed');
      const rows=matrixRows(job.strategy?.matrix);
      if(!rows)issue('job-keys',file,id+'.strategy','unsupported matrix form');
      const steps=Array.isArray(job.steps)?job.steps:[];
      if(!steps.length)issue('jobs',file,id+'.steps','job has no steps');
      const entries=jobSpec.entries,seen=new Set();let next=0;
      steps.forEach((step,n)=>{
        const at=id+'.steps['+n+']';
        if(!step||typeof step!=='object'||Array.isArray(step)){issue('step-keys',file,at,'a step is a mapping');return;}
        for(const key of Object.keys(step))if(key==='continue-on-error')issue('continue-on-error',file,at,'step continues on error');else if(!stepKeys.includes(key))issue('step-keys',file,at+'.'+key,'step key not allowed');
        if((step.uses===undefined)===(step.run===undefined)){issue('step-keys',file,at,'a step has exactly one of uses and run');return;}
        if(step.uses!==undefined){
          if(!workflowActions.includes(step.uses))issue('actions',file,at,'action not allowed: '+step.uses);
          if(step.env!==undefined)issue('step-env',file,at,'undeclared step environment');
          if(step.uses==='actions/upload-artifact@v4'){
            if(step.with?.['retention-days']!=='3')issue('artifact',file,at,'artifacts are kept for 3 days');
            if(step.with?.['if-no-files-found']!=='error')issue('artifact',file,at,'missing evidence must fail the upload');
          }
          if(step.uses==='actions/checkout@v5'&&jobSpec.fullHistory&&step.with?.['fetch-depth']!=='0')issue('checkout',file,at,'the change guard needs the full history');
          return;
        }
        const run=String(step.run).trim(),index=entries.findIndex(e=>e.run===run);
        if(index<0){
          if(step.env!==undefined)issue('step-env',file,at,'undeclared step environment');
          for(const line of run.split('\n').map(s=>s.trim()).filter(Boolean))if(!workflowSetupLines.some(re=>re.test(line)))issue('commands',file,at,'ad-hoc command: '+line);
          return;
        }
        if(seen.has(index))issue('commands',file,at,'entry repeated: '+run);
        else if(index!==next)issue('commands',file,at,'entry out of order: '+run);
        seen.add(index);next=Math.max(next,index+1);
        if((step.if??null)!==(entries[index].if??null))issue('step-condition',file,at,'entry condition differs from the contract');
        if(!same(step.env,entries[index].env))issue('step-env',file,at,'entry environment differs from the contract');
        const args=tokens(run);
        if(args[1]==='audit/verify-evidence.mjs'&&args[2]==='seal')for(const row of rows||[])sealed.push(args[3].replace(/\$\{\{ matrix\.([A-Za-z_-]+) \}\}/g,(_,k)=>row[k]??'<missing '+k+'>'));
        if(args[1]==='audit/run-acceptance.mjs')accepted.push(args[2]);
      });
      entries.forEach((e,n)=>{if(!seen.has(n))issue('commands',file,id,'missing entry: '+e.run);});
    }
  }
  if(!sameSet(sealed,auditBundleKinds))issue('bundles','*','seal','sealed bundle kinds '+JSON.stringify([...sealed].sort())+' differ from '+JSON.stringify([...auditBundleKinds].sort()));
  if(!sameSet(accepted,Object.keys(acceptanceCommands)))issue('acceptance','*','run-acceptance','acceptance kinds '+JSON.stringify([...accepted].sort())+' differ from '+JSON.stringify(Object.keys(acceptanceCommands).sort()));
  return issues;
}
