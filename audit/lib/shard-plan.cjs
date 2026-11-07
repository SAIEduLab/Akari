// CI shard plan: which runner job executes which gate step, browser task and acceptance step.
// Sharding only distributes execution. Every step, task, case and validator negative still runs
// exactly once (only the schema-contract check inside schema-shards runs in both of its parts, and
// the merge requires the two results to be equal), and the final aggregates merge the shard evidence and run the unchanged full
// validators (verifyGateResults, verifyBrowserGroup, the child UX bundle checks) on the merged tree.
//
// Shard times below are from the Windows CI runs named with each group. A producer and its verifier run together.
// On pull requests the audit matrices share the runner pool with acceptance, authorization and the change guard.
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
  // Its two halves took 315 s and 270 s locally (69 cases, 685b2f9) and up to 525 s each in CI; in run 41864291413 the
  // first passed the 600 s child limit and the second took 542 s, about 2.0 times its local time. Five parts, one for each
  // group the test runs together (gated by its first case), measured on a second machine (4 CPUs, which ran the mutant
  // group of four parts in 433 s where run 42027123430 took 372 s): the tree, record, version and language rules (63 s);
  // behaviour and limits (68 s); assertions and coverage (346 s; the same group with the move cases took 414 s there); the
  // mutant rules, the survivor record and the parts that share its head (283 s); the worlds' lines, the test map and the
  // record without a change (212 s). In run 42374045117 the mutant rules, with the worlds' lines in one part, passed the
  // 600 s child limit.
  'change-guard-negative':{parts:indexed(5),assign:id=>/^(?:assertions|coverage)\//.test(id)?'3/5':['mutants/worlds-judge-their-lines','test-map/names-the-suites','behaviour/record-without-change'].includes(id)?'5/5':/^mutants\//.test(id)?'4/5':/^(?:behaviour|limits)\//.test(id)?'2/5':'1/5'},
  // 347-574 s (runs 41424226627 and 41424221208) over 9 viewport/zoom contexts of about 55-78 s (runs 41420498555 and
  // 41420493498, whose 598 s reached the 600 s child limit); two parts of five and four contexts (about 319 s and 255 s
  // at the slower run).
  'workbench-matrix':{parts:indexed(2),assign:(_,i)=>(i%2+1)+'/2'},
};

// Gate steps (audit/lib/gate-contract.mjs gateSteps), run in the listed order. Steps that read another
// step's output stay with that producer and run after it. `selftestAfterMerge` steps read
// a split step's merged output and run in the aggregate job, before the full validation.
// Timed bundles are packed across workflows by audit/lib/ci-lanes.mjs. Keep each producer with its verifier.
const selftestShards={
  s01:[unit('entry-browser','2/2'),'samples','samples-negative','entry-unit'],
  s02:[unit('entry-browser','1/2'),'review-readable','export-open','ui-buttons'],
  s03:['spec-expectations-ui','spec-examples','spec-expectations-static','spec-expectations'],
  s04:[unit('change-guard-negative','4/5'),'designer'],
  s05:[unit('change-guard-negative','3/5'),'toolbar-stage','toolbar-stage-verify','review-first-use','extension-foundation','extension-foundation-negative'],
  s06:['static','audit-inventory','product-source','publication-inventory','publication-documents','release-distribution','workflow-contract','integrity'],
  s07:[unit('change-guard-negative','1/5'),'japanese-intent-browser','speech-display','speech-display-verify'],
  s08:[unit('change-guard-negative','2/5'),'product','manual','language-boundaries','harness-negative','review-units',
    'release-policy-negative','browser-environment','ci-regression','dom-regression','node-product','language-node','language-browser','editor-node','normal',
    'ownership','block-fields','format-compatibility','language-negative','japanese-contract-static','language-expectations-static','sentence-form-coverage',
    'runtime-boundary','japanese-gate-negative','review-actor','review-language','review-harness-negative','license-static','license-browser','license-verify'],
  s09:['save-name','save-name-verify','editor-browser-core','editor-gui','editor-assets','surface-negative'],
  s10:[unit('change-guard-negative','5/5')],
};
const selftestAfterMerge=['entry-verify'];

// Browser tasks (audit/browser/browser-audit-manifest.json). A shard may hold tasks of several
// groups; the aggregate merges every shard and runs verifyBrowserGroup over all groups.
const browserShards={
  b01:[unit('workbench-matrix','1/2'),'ui-interactions','parent-qa','browser-session'],
  b02:[unit('schema-shards','1/2')],
  b03:[unit('schema-shards','2/2')],
  b04:['browser-event-traces','browser-media-boundaries','browser-runtime-limits','browser-events'],
  b05:[unit('modern-browser','1/2'),unit('workbench-matrix','2/2'),'browser-design-limits'],
  b06:[unit('modern-browser','2/2'),'browser-boundaries'],
  b07:['long-regression','perf-input:keyboard-insert','perf-input:clipboard-paste','browser-asset-limits','workbench-direct','browser-condition','browser-storage-media','browser-product','ui-stage-gesture','run-editor-regression','browser-owner-delete','ui-compact-menu','ui-shell','browser-runtime'],
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

// Logical maximum. The CI planner assigns the actual worker count for each change.
const changeGuardParts=['main',...Array.from({length:20},(_,i)=>'m'+(i+1))];
// Files a step reads inside another step's output directory (exact output files are found from the commands).
const acceptanceReads={composition:{'audit/tests/child-ux.mjs/matrix':['audit/run-ux-normal-gui.mjs']}};

// The time one child process may run (audit/run-local-gate.mjs, audit/browser/run-full-browser-audit.mjs): ten
// minutes. A whole run of a split step or task runs what CI runs as its parts, back to back, so it gets ten minutes a part.
const childLimitMs=600000;
function childLimit(name,part){return (part||!splits[name]?1:splits[name].parts.length)*childLimitMs;}

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

module.exports={childLimitMs,childLimit,splits,selftestShards,selftestAfterMerge,browserShards,acceptanceShards,acceptanceAfterMerge,acceptanceReads,changeGuardParts,parseUnit,planRows,currentPart,partItems,verifyPartCoverage,verifyShardPlan};
