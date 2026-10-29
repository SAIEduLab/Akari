// CI shard plan: which runner job executes which gate step, browser task and acceptance step.
// Sharding only distributes execution. Every step, task, case and validator negative still runs
// exactly once (only the schema-contract check inside schema-shards runs in both of its parts, and
// the merge requires the two results to be equal), and the final aggregates merge the shard evidence and run the unchanged full
// validators (verifyGateResults, verifyBrowserGroup, the child UX bundle checks) on the merged tree.
//
// Sizing ground (Actions runs 40881943995 and 40881943951, windows-latest, one runner per job):
// the account runs at most 20 jobs at once and the work-authorization and change-guard jobs start
// with every pull-request head, leaving 18 runners for the audit jobs without queueing. The
// measured suite time is 7866 s (18 runners: about 437 s each). A shard is planned at <= 540 s of
// measured suite time: the largest suites that are not split (workbench-matrix 519 s,
// ux-normal GUI 504 s) fit, and 18 jobs suffice. With job setup <= 61 s and seal/upload <= 15 s a
// shard job takes about 10 minutes, far inside the job limits. A suite whose measured time alone
// exceeds 540 s is split over its own case set (`splits`), never by dropping, sampling or relaxing a case.
'use strict';

// Unit syntax: 'name' runs the whole step/task; 'name@part' runs one declared part of it.
const unit=(name,part)=>name+'@'+part;
const indexed=n=>Array.from({length:n},(_,i)=>(i+1)+'/'+n);

// Split suites. `parts` lists the part tokens; `assign(item,index)` gives an item's part token.
// Measured times are from the runs above.
const splits={
  // 546.8 s. Rows 1-14 end about 270 s in, TUTORIAL-BRANCHES (nine routes) takes about 277 s
  // (saved-file timestamps in entry-browser.json.artifacts).
  'entry-browser':{parts:indexed(2),assign:id=>id==='TUTORIAL-BRANCHES'?'2/2':'1/2'},
  // 887.4 s over its two browser processes (schema rows i % 2) run in sequence; each process
  // becomes one part of about 444 s.
  'schema-shards':{parts:indexed(2),assign:(_,i)=>(i%2+1)+'/2'},
  // 706.8 s over 6 viewport/mode contexts of about 118 s; two parts of three contexts (about 354 s).
  'modern-browser':{parts:indexed(2),assign:(_,i)=>(i%2+1)+'/2'},
};

// Gate steps (audit/lib/gate-contract.mjs gateSteps), run in the listed order. Steps that read another
// step's output stay with that producer and run after it. `selftestAfterMerge` steps read
// a split step's merged output and run in the aggregate job, before the full validation.
const selftestShards={
  s01:[unit('entry-browser','2/2'),'samples','samples-negative'],
  s02:[unit('entry-browser','1/2'),'speech-display','speech-display-verify','entry-unit'],
  s03:['spec-expectations-ui','spec-examples','spec-expectations-static','spec-expectations'],
  s04:['toolbar-stage','toolbar-stage-verify','japanese-intent-browser','designer','review-readable'],
  s05:['change-guard-negative','product','editor-browser-core','editor-gui','ui-buttons','editor-assets','manual','language-boundaries','harness-negative','surface-negative','review-units','review-first-use','extension-foundation','extension-foundation-negative'],
  s06:['static','audit-inventory','product-source','publication-inventory','publication-documents','release-distribution','workflow-contract','release-policy-negative','integrity','browser-environment','ci-regression','dom-regression','node-product','language-node','language-browser','editor-node','normal','ownership','block-fields','format-compatibility','export-open','language-negative','japanese-contract-static','language-expectations-static','sentence-form-coverage','runtime-boundary','japanese-gate-negative','review-actor','review-language','review-harness-negative','license-static','license-browser','license-verify'],
};
const selftestAfterMerge=['entry-verify'];

// Browser tasks (audit/browser/browser-audit-manifest.json). A shard may hold tasks of several
// groups; the aggregate merges every shard and runs verifyBrowserGroup over all groups.
const browserShards={
  b01:['workbench-matrix'],
  b02:[unit('schema-shards','1/2'),'browser-session'],
  b03:[unit('schema-shards','2/2'),'browser-runtime-limits'],
  b04:['browser-event-traces','browser-media-boundaries'],
  b05:[unit('modern-browser','1/2'),'ui-interactions','browser-design-limits'],
  b06:[unit('modern-browser','2/2'),'browser-boundaries','browser-runtime','parent-qa','browser-events'],
  b07:['long-regression','perf-input:keyboard-insert','perf-input:clipboard-paste','browser-asset-limits','workbench-direct','browser-condition','browser-storage-media','browser-product','ui-stage-gesture','run-editor-regression','browser-owner-delete','ui-compact-menu','ui-shell'],
};

// Composition acceptance steps by acceptance ID (audit/lib/gate-contract.mjs acceptanceIds).
// The editing acceptance (307 s) stays one job and is not sharded.
const acceptanceShards={
  composition:{
    c01:['audit/run-ux-normal-gui.mjs','audit/tests/child-ux.mjs/matrix'],
    c02:['audit/tests/code-assist.mjs','audit/tests/code-assist-browser.mjs','audit/tests/code-assist-verify.mjs','audit/run-ux-phrase-gui.mjs','audit/tests/ux-edit-browser.mjs','audit/tests/ux-normal-browser.mjs','audit/tests/composition-acceptance.mjs'],
    c03:['audit/tests/child-ux.mjs/static','audit/tests/actions-transfer-static.mjs','audit/tests/actions-transfer-values.mjs','audit/tests/command-meaning.mjs','audit/tests/basic-intents.mjs','audit/tests/finite-semantic-variants.mjs','audit/tests/semantic-negative-pairs.mjs','audit/tests/natural-roles.mjs','audit/tests/document-units.mjs','audit/tests/draft-persistence.mjs','audit/tests/data-form-values.mjs','audit/tests/numeric-display.mjs','audit/tests/resource-references.mjs','audit/tests/search-bindings.mjs','audit/tests/basic-intents-browser.mjs','audit/tests/audio-output-browser.mjs','audit/tests/structured-editing-browser.mjs','audit/tests/workspace-history-browser.mjs','audit/tests/data-form-browser.mjs','audit/tests/numeric-display-browser.mjs','audit/tests/resource-references-browser.mjs','audit/tests/search-bindings-browser.mjs','audit/tests/ux-surface-browser.mjs','audit/tests/ux-edit-language.mjs','audit/tests/ux-bubble-layout.cjs','audit/tests/ux-normal-language.mjs','audit/tests/autosave-state-browser.mjs','audit/tests/search-layout-browser.mjs'],
  },
};
// Reads the whole merged composition directory, so it runs in the aggregate job.
const acceptanceAfterMerge={composition:['audit/tests/actions-transfer-verify.mjs']};
// Files a step reads inside another step's output directory (exact output files are found from the commands).
const acceptanceReads={composition:{'audit/tests/child-ux.mjs/matrix':['audit/run-ux-normal-gui.mjs']}};

function parseUnit(text){
  const at=text.indexOf('@');
  return at<0?{name:text,part:null}:{name:text.slice(0,at),part:text.slice(at+1)};
}
// Every declared item in plan order: [{shard, name, part}].
function planRows(shards){return Object.entries(shards).flatMap(([shard,units])=>units.map(u=>({shard,...parseUnit(u)})));}

// The part a process runs (AKARI_PART), or null for a whole run. Only declared part tokens are accepted.
function currentPart(name,env=process.env){
  const part=env.AKARI_PART;
  if(part===undefined||part==='')return null;
  const split=splits[name];
  if(!split||!split.parts.includes(part))throw new Error('undeclared part '+JSON.stringify(part)+' for '+name);
  return part;
}
// The items of a split suite selected by its part. A whole run selects every item.
function partItems(name,items,part){
  if(part===null)return items.slice();
  const split=splits[name];
  if(!split||typeof split.assign!=='function')throw new Error('no item assignment for '+name);
  return items.filter((item,index)=>split.assign(item,index)===part);
}
// Checks that the parts of a split suite are exactly its declared parts and cover `items` once each.
function verifyPartCoverage(name,items,partsById){
  const split=splits[name];
  if(!split)throw new Error('not a split suite: '+name);
  const tokens=Object.keys(partsById).sort();
  if(JSON.stringify(tokens)!==JSON.stringify([...split.parts].sort()))throw new Error(name+': parts '+JSON.stringify(tokens)+' differ from '+JSON.stringify(split.parts));
  const seen=new Map();
  for(const [part,ids] of Object.entries(partsById)){
    const expected=partItems(name,items,part);
    if(JSON.stringify(ids)!==JSON.stringify(expected))throw new Error(name+' part '+part+': items differ from its assignment');
    for(const id of ids){if(seen.has(id))throw new Error(name+': item '+id+' in parts '+seen.get(id)+' and '+part);seen.set(id,part);}
  }
  if(seen.size!==items.length)throw new Error(name+': parts cover '+seen.size+' of '+items.length+' items');
  return seen.size;
}

// Static plan check against the current step, task and acceptance sets. steps: gateSteps rows
// [id, script, ...args] (the last argument is the step's output); tasks: browser task names;
// acceptance: {kind: {ids, commands}}. `plan` defaults to this module's plan; validator negatives pass a changed copy.
const defaultPlan={splits,selftestShards,selftestAfterMerge,browserShards,acceptanceShards,acceptanceAfterMerge,acceptanceReads};
function verifyShardPlan({steps,tasks,acceptance},plan=defaultPlan){
  const p={...defaultPlan,...plan},problems=[];
  const cover=(label,declared,rows,after=[])=>{
    const seen=new Map();
    for(const row of rows){
      if(!declared.includes(row.name)){problems.push(label+': unknown '+row.name+' in '+row.shard);continue;}
      const split=p.splits[row.name];
      if(row.part!==null&&(!split||!split.parts.includes(row.part)))problems.push(label+': undeclared part '+row.name+'@'+row.part);
      const list=seen.get(row.name)||[];list.push(row);seen.set(row.name,list);
    }
    for(const name of after){if(!declared.includes(name))problems.push(label+': unknown after-merge '+name);if(seen.has(name))problems.push(label+': '+name+' is both sharded and after-merge');}
    for(const name of declared){
      if(after.includes(name))continue;
      const list=seen.get(name)||[];
      if(!list.length){problems.push(label+': '+name+' is not planned');continue;}
      const parts=list.map(r=>r.part);
      if(parts.includes(null)){if(list.length!==1)problems.push(label+': '+name+' is planned '+list.length+' times');continue;}
      const split=p.splits[name];
      if(!split){problems.push(label+': '+name+' has parts but is not a split suite');continue;}
      if(JSON.stringify([...parts].sort())!==JSON.stringify([...split.parts].sort()))problems.push(label+': parts of '+name+' are '+JSON.stringify(parts));
    }
    for(const shard of new Set(rows.map(r=>r.shard)))if(!/^[a-z][0-9]{2}$/.test(shard))problems.push(label+': shard id '+shard);
  };
  // A reader runs after its producer in the same shard (shards keep the canonical order), or after the merge.
  // wholeTree: the after-merge steps read the whole merged directory rather than one split output.
  const ordered=(label,rows,after,reads,wholeTree=false)=>{
    for(const [id,deps] of reads){
      for(const dep of deps){
        if(after.includes(id))continue;
        const row=rows.find(r=>r.name===id),depRows=rows.filter(r=>r.name===dep);
        if(!row)continue;
        if(depRows.some(r=>r.part!==null))problems.push(label+': '+id+' reads split '+dep+' and must run after the merge');
        else if(depRows.length!==1||depRows[0].shard!==row.shard)problems.push(label+': '+id+' must run in the shard of '+dep);
      }
    }
    if(!wholeTree)for(const id of after){const deps=reads.get(id)||[];if(!deps.some(dep=>rows.some(r=>r.name===dep&&r.part!==null)))problems.push(label+': '+id+' reads no split step and belongs in a shard');}
  };
  const stepIds=steps.map(s=>s[0]),selftestRows=planRows(p.selftestShards),outputOf=new Map(steps.map(([id,,...args])=>[id,args.at(-1)]));
  cover('selftest',stepIds,selftestRows,p.selftestAfterMerge);
  const order=(rows,shard,id)=>p.selftestShards[shard].map(u=>parseUnit(u).name).indexOf(id);
  for(const row of selftestRows)for(const [dep,out] of outputOf)if(dep!==row.name&&steps.find(s=>s[0]===row.name).slice(2,-1).includes(out)){
    const d=selftestRows.find(r=>r.name===dep);if(d&&d.part===null&&d.shard===row.shard&&order(selftestRows,row.shard,dep)>order(selftestRows,row.shard,row.name))problems.push('selftest: '+row.name+' runs before '+dep+' in its shard');
  }
  ordered('selftest',selftestRows,p.selftestAfterMerge,new Map(steps.map(([id,,...args])=>[id,args.slice(0,-1).map(a=>[...outputOf].find(([other,out])=>other!==id&&out===a)?.[0]).filter(Boolean)])));
  cover('browser',tasks,planRows(p.browserShards));
  for(const kind of Object.keys(p.acceptanceShards)){
    if(!acceptance[kind]){problems.push('acceptance: unknown kind '+kind);continue;}
    const {ids,commands}=acceptance[kind],rows=planRows(p.acceptanceShards[kind]),after=p.acceptanceAfterMerge[kind]||[];
    for(const row of rows)if(row.part!==null)problems.push('acceptance/'+kind+': acceptance steps are not split ('+row.name+'@'+row.part+')');
    cover('acceptance/'+kind,ids,rows,after);
    // Exact output files read by later commands, plus the declared reads of files inside a directory output.
    const words=c=>c.slice(5).match(/"[^"]*"|\S+/g),outs=commands.map(c=>words(c).at(-1));
    const reads=new Map(ids.map((id,i)=>[id,[...new Set([...words(commands[i]).slice(1,-1).map(a=>ids[outs.indexOf(a)]).filter(x=>x&&x!==id),...((p.acceptanceReads[kind]||{})[id]||[])])]]));
    for(const [id,deps] of reads)for(const dep of deps)if(ids.indexOf(dep)>ids.indexOf(id))problems.push('acceptance/'+kind+': '+id+' precedes its input '+dep);
    ordered('acceptance/'+kind,rows,after,reads,true);
  }
  return problems;
}

module.exports={splits,selftestShards,selftestAfterMerge,browserShards,acceptanceShards,acceptanceAfterMerge,acceptanceReads,parseUnit,planRows,currentPart,partItems,verifyPartCoverage,verifyShardPlan};
