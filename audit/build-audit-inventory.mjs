import fs from 'node:fs';
import assert from 'node:assert/strict';
import {ledger09} from './browser/legacy/audit-lib.cjs';
import {editorIds,guiIds} from './lib/verify-surface-results.mjs';
import {audioIds102} from './lib/release-102-contract.mjs';
import {editorAssetIds} from './lib/release-101-contract.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));
const audit=fs.readFileSync('AUDIT.md','utf8'),core=read('audit/manifests/product-tests.json');
const browser=read('audit/manifests/browser-results.json'),obligations=read('audit/manifests/browser-obligations.json');
const forms=read('audit/manifests/language-form-coverage.json').cases;
const coreIds=core.suites.flatMap(s=>s.ids);
const machine={local:'Final committed HEAD: gate.json, static/preflight and review attestation; per-item results resolved from required IDs',
  actions:'Required on each applicable exact pushed HEAD: Ubuntu/Chromium, static/selftest/full-browser-gate/aggregate; completed release evidence is frozen separately',
  unverified:'Actions is not discharged by local results; physical-device/native-IME/user-study claims are not made',
  pass:'All required IDs/case tuples PASS, expected environment, unchanged inputs, no missing/duplicate results; semantic review is separate'};
const phaseSpecs=[
  [1,'HYBRID','S01',['snapshot','VERSION','FORMAT_VERSION'],['static']],
  [2,'HYBRID','S02',['parseSyntax','blockEncode','blockDecode','analyzeAst'],['static','selftest','full-browser-gate']],
  [3,'HYBRID','S03',['BLOCK_SCHEMAS','COMMAND_CATALOG','parseExpression','formatExpression','formatScript'],['static','selftest','full-browser-gate:schemas']],
  [4,'HYBRID','S11',['createBlockEditorView','blockInsertionAvailability','BLOCK_SCHEMAS'],['selftest','full-browser-gate:schemas','full-browser-gate:ui']],
  [5,'HYBRID','S05',['preserveBlockSource','prepareBlockEdit','switchEditorMode'],['selftest','full-browser-gate:session','full-browser-gate:ui']],
  [6,'HYBRID','S04',['parseScript','readBlockHead','blockEncode','blockDecode'],['selftest','full-browser-gate:schemas']],
  [7,'HYBRID','S07',['analyzeAst','resolveBinding','parseTargetPrefix'],['selftest','full-browser-gate:limits','full-browser-gate:schemas']],
  [8,'HYBRID','S08',['EventScheduler','RuntimeModel','evalExpression'],['selftest','full-browser-gate:session','full-browser-gate:limits']],
  [9,'HYBRID','S08',['sourceSpan','nodeMap','runtimeError','debug'],['selftest','full-browser-gate:session']],
  [10,'HYBRID','S09',['serializeProject','parseProjectFile','saveProject','packExecutable','restoreExecutable'],['selftest','full-browser-gate:session','full-browser-gate:limits']],
  [11,'HYBRID','S06',['prepareBlockEdit','createEditorSession','modelLocked','createBlockEditorView'],['selftest','full-browser-gate:ui','full-browser-gate:extra']],
  [12,'HYBRID','S10',['COMMAND_CATALOG','GRAMMAR_REGISTRY','BLOCK_SCHEMAS','LIMITS'],['selftest','full-browser-gate']],
  [13,'HYBRID','S13',['mountAkariPlayer','serializeProject','packExecutable','createAkariRuntime'],['static','selftest','full-browser-gate:session']],
  [14,'HYBRID','S12',['LIMITS','parseSyntax','validateSerializedProjectStructure'],['static','selftest','full-browser-gate:limits','full-browser-gate:extra']],
  [15,'HYBRID','S14',['audit/lib/product-test-host.mjs','audit/lib/verify-test-results.mjs','audit/lib/evidence-bundle.mjs'],['static','selftest','aggregate']],
  [16,'HYBRID','S16',['LANGUAGE.md','AUDIT.md','MANUAL.html','audit/README.md','audit/LANGUAGE_FORMS.md'],['static','aggregate']],
];
const phases=phaseSpecs.map(([number,classification,review,sources,jobs])=>({id:'PHASE-'+number,
  requirement:audit.match(new RegExp('^## フェーズ '+number+' — (.+)$','m'))[1],classification,
  sources:sources.map(p=>p.includes('.')?p:'Akari.html#'+p),jobs,review:'phase4-semantic-review.md#'+review,
  fixtures:['audit/manifests/product-tests.json','audit/manifests/language-form-coverage.json','audit/manifests/browser-results.json'],
  independentExpectation:'AUDIT phase '+number+' obligations plus named source-review counterexamples; exact assertion literals in external suites, fixed completed-1.0.0 canonical forms and preserved historical 0.8',
  evidence:['static.json','gate.json','full-browser-*/summary.json','aggregate.json','review-attestation.json'],
  result:'SOURCE_REVIEW_COMPLETE; MACHINE_RESULTS_SEPARATELY_BOUND',notApplicable:null,...machine}));
const productSource=fs.readFileSync('Akari.html','utf8');
for(const p of phases)for(const source of p.sources)if(source.startsWith('Akari.html#'))assert.ok(productSource.includes(source.slice(11)),source);
const dmap={'CORE-001':[2,3,5],'CORE-002':[4,12],'CORE-003':[3,7],'CORE-004':[5,10],'CORE-005':[5,8],
  'CORE-006':[3,4],'CORE-007':[12,15],'CORE-008':[13],'CORE-009':[13,15],'CORE-010':[15],
  'CORE-011':[14],'CORE-012':[3,4],'MODEL-001':[5,11],'MODEL-002':[5,7],
  'LANG-001':[3],'LANG-002':[7],'LANG-003':[3,5],'LANG-004':[4,5,6],
  'GUI-001':[11],'GUI-002':[4,6],'GUI-003':[5,6],'SWITCH-001':[5,8],
  'EDIT-001':[5,11],'EDIT-002':[6,11],'RUN-001':[8,9],'SAVE-001':[10],'SAVE-002':[10],
  'RELEASE-001':[1,15,16]};
const d09=[...audit.matchAll(/^### (D09-([A-Z0-9-]+)) — (.+)$/gm)].map(([,id,key,requirement])=>{
  assert.ok(dmap[key],id);return{id,requirement,classification:'HYBRID',phases:dmap[key].map(n=>'PHASE-'+n),
    implementationAndEvidence:'Resolve all linked phase and capability rows; source-review section and exact test contracts are mandatory',
    result:'SOURCE_REVIEW_COMPLETE; MACHINE_RESULTS_SEPARATELY_BOUND',notApplicable:null,...machine};});
assert.equal(d09.length,28);
const aliases={'B09-LANG':['schema-shards'],'B09-EVENT':['browser-events','browser-event-traces'],
  'B09-PRODUCT':['browser-product','browser-session','browser-runtime','browser-storage-media'],
  'B09-DESIGNER':['modern-browser'],'B09-WORKBENCH':[...new Set(obligations.entries.filter(e=>e.id.startsWith('WB09-')).flatMap(e=>e.tasks))],
  'B09-SHELL':['ui-shell','ui-stage-gesture'],'B09-LIMIT':['browser-design-limits','browser-runtime-limits','browser-asset-limits','browser-media-boundaries']};
for(const obligation of obligations.entries)aliases[obligation.id]=obligation.tasks;
const browserRef=ref=>{
  const colon=ref.indexOf(':'),name=ref.slice(0,colon),key=ref.slice(colon+1);
  const specs=aliases[ref]?browser.entries.filter(e=>aliases[ref].includes(e.task)):
    browser.entries.filter(e=>e.task===(name==='browser-schemas'?'schema-shards':name));
  assert.ok(specs.length,'unresolved browser reference '+ref);
  return specs.map(spec=>{
    const ids=aliases[ref]?spec.keys:spec.keys.filter(id=>key.includes('*')?id.startsWith(key.split('*')[0]):id===key||id.startsWith(key+'/')||id.startsWith(key+':'));
    assert.ok(ids.length,'unresolved browser ID '+ref);
    return{reference:ref,task:spec.task,source:spec.source,ids,runner:'audit/browser/run-full-browser-audit.mjs',
      validator:'audit/lib/verify-browser-results.mjs',job:'full-browser-gate:'+spec.group,artifact:'full-browser-'+spec.group+'/'+spec.report};
  });
};
const capabilities=ledger09(audit).map(row=>{
  const ids=row.selftest.includes('対象外（browser suiteで検査）')?[]:row.selftest.split(';').flatMap(r=>{
    r=r.replaceAll('`','').trim();const found=r.includes('*')?coreIds.filter(id=>id.startsWith(r.split('*')[0].trim())):coreIds.filter(id=>id===r);
    assert.ok(found.length,'unresolved core reference '+r);return found;
  });
  return{id:row.id,requirement:row.capability,classification:'HYBRID',source:{product:'Akari.html',ast:row.ast,cui:row.cui,gui:row.gui,runtime:row.runtime},
    independentExpectation:{semantic:row.semantic,guarantee:row.guarantee},
    core:[...new Set(ids)].map(id=>({id,suite:core.suites.find(s=>s.ids.includes(id)).name})),
    coreExecution:{runner:'audit/run-product-tests.mjs',validator:'audit/lib/verify-test-results.mjs',job:'selftest',artifact:'current-selftest.json'},
    browser:row.browser.split(';').flatMap(r=>browserRef(r.trim())),
    review:'phase4-semantic-review.md',result:'SOURCE_REVIEW_COMPLETE; MACHINE_RESULTS_SEPARATELY_BOUND',
    notApplicable:ids.length?null:'Pure core cannot establish this GUI capability; concrete browser cases above are mandatory',...machine};
});
assert.equal(capabilities.length,257);
const roleTable=fs.readFileSync('audit/LANGUAGE_FORMS.md','utf8');
const language=Array.from({length:42},(_,i)=>{
  const number=String(i+1).padStart(3,'0'),id='JPF-'+number,cases=forms.filter(c=>c.id===id);
  assert.ok(cases.length,id);const cells=roleTable.split(/\r?\n/).find(l=>l.startsWith('| '+number+' |')).split('|').slice(1,-1).map(x=>x.trim());
  return{id,classification:'HYBRID',rolesAndOrders:cells[2],loweringAndEvaluation:cells[3],
    cases:cases.map(c=>({id:'A09-SURFACE-'+c.id+'/'+c.key,source:c.source,independentCanonical:c.canonical})),
    fixture:'audit/fixtures/language/forms.mjs',suite:'audit/suites/language-forms.js',runner:'audit/run-language-tests.mjs',
    validator:'audit/lib/verify-language-results.mjs',job:'selftest',environments:['node','chromium'],
    review:'phase4-semantic-review.md#S02-S05',result:'SOURCE_REVIEW_COMPLETE; MACHINE_RESULTS_SEPARATELY_BOUND',notApplicable:null,...machine};
});
const inventory={schema:'akari-phase4-inventory-v1',scope:'All applicable product acceptance against the completed 1.0.2 checkpoint; candidate machine and semantic verdicts are separately bound',
  binding:'Final execution snapshot and review attestation contain actual HEAD and hashes; this file does not contain its own commit SHA',
  statusLegend:machine,phases,d09,capabilities,language,editorIds,guiIds,browserObligations:obligations.entries,
  audio102:{ids:audioIds102,runner:'audit/tests/audio-codecs-102.mjs',validator:'audit/lib/release-102-contract.mjs',jobs:['audio-codecs:linux','audio-codecs:win32'],artifact:'report.json',fixedRunner:'audit/run-fixed-audio.mjs',fixedValidator:'audit/lib/completed-baseline.mjs',fixedArtifact:'fixed/report.json',freeze:'audit/manifests/release-1.0.2.json'},
  editorAssets101:{ids:editorAssetIds,candidateRunner:'audit/tests/editor-assets-101.mjs',fixedRunner:'audit/run-fixed-features.mjs',validator:'audit/lib/completed-baseline.mjs',job:'selftest',candidateArtifact:'editor-assets-101.json',fixedArtifact:'fixed102-editor-assets.json',historical101Runner:'audit/run-historical-101-features.mjs',historical101Artifact:'fixed101-editor-assets.json'},
  nonTechnicalLimits:['No user study or learning-effect measurement','No physical mobile-device or native Japanese IME study'],
  completedBaseline:{sourceCommit:'1207f8a44b783afbb2274e794759de4c58edb450',manifest:'audit/fixtures/1.0.2/manifest.json'},
  remainingReleaseDecisions:['Actions on the current candidate SHA','Current candidate semantic acceptance; completed baseline is not current PASS']};
const target='audit/records/phase4-audit-inventory.json',text=JSON.stringify(inventory,null,2)+'\n';
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(target,'utf8').replace(/\r\n/g,'\n'),text,'inventory drift');
else fs.writeFileSync(target,text);
console.log('Audit inventory: 16 phases, 28 D09, 257 capabilities, 42 JPF groups; exact runner/ID references resolved');
