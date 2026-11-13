import {chooseView} from '../browser/cases/view-toggle.cjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { currentProductFile } from '../lib/product-path.cjs';
import { snapshot, sha } from '../lib/product-test-host.mjs';
import { loadApi } from '../browser/cases/audit-lib.cjs';
import { answerProductConfirms } from '../lib/product-dialogs.cjs';
import { installGreetingFixture } from '../lib/gate-ui-fixture.mjs';
import { checkBrowserVersion, checkPlaywrightVersion } from '../lib/browser-environment.mjs';
import { extensionFoundationIds, extensionExpectedObservations, verifyExtensionFoundation } from '../lib/extension-foundation-contract.mjs';
import {pressStop} from '../lib/stop-press.cjs';
import {observeExtensionRuntimeContracts} from '../lib/extension-runtime-observations.mjs';

const require = createRequire(import.meta.url), [browserPath, output, productOverride] = process.argv.slice(2);
assert.ok(browserPath && output, 'Usage: node extension-foundation.mjs <fixed browser> <new report.json>');
const directory = path.resolve(output).replace(/\.json$/, '.artifacts');
assert.ok(!fs.existsSync(directory), 'Use a fresh evidence directory'); fs.mkdirSync(directory,{recursive:true});
const product=productOverride||currentProductFile();
const inputs=snapshot(product), candidate=path.join(directory,'candidate.html');fs.copyFileSync(product,candidate);
const candidateText=fs.readFileSync(candidate,'utf8'), A=loadApi(candidateText), results=new Map(), pageErrors=[], networkErrors=[];
const plain=x=>JSON.parse(JSON.stringify(x));
async function check(id,fn){try{const observed=await fn();assert.deepEqual(observed,extensionExpectedObservations[id]);results.set(id,{id,status:'PASS',observed});}catch(error){results.set(id,{id,status:'FAIL',error:error.stack});console.error(id+': '+error.message);}}
const extras={executableBytes:64*1024*1024,logChars:100000,historyEntries:60,diagnosticsBytes:8388608};
const defaults=JSON.parse(fs.readFileSync('audit/fixtures/capability-oracle.json')).limits;
const guards=['audioChannels','audioSampleRateMin','audioSampleRateMax','blockDepth','expressionDepth','callDepth'];
let P;
await check('EXTENSION-STANDARD-POLICIES',()=>{P=A.createAkariProfiles(A.profiles.standard);assert.deepEqual(plain(A.LIMITS),defaults);assert.deepEqual(plain(P.standard),{...defaults,...extras});return{standardUnchanged:true,standardFrozen:Object.isFrozen(P.standard),keys:Object.keys(P.standard).length};});
await check('EXTENSION-PROFILE-INHERIT-FINITE-UNLIMITED',()=>{
  const p=A.createAkariProfiles(A.profiles.standard),ref=p.effective,adjustable=Object.keys(p.standard).filter(k=>!guards.includes(k));
  assert.deepEqual(plain(ref),{...defaults,...extras});const finite=Object.fromEntries(adjustable.map(k=>[k,p.standard[k]*2]));
  p.register({id:'audit.finite',version:'1.0.0',limits:finite});p.select('audit.finite','1.0.0');for(const k of adjustable)assert.equal(ref[k],finite[k]);for(const k of guards)assert.equal(ref[k],defaults[k]);
  p.register({id:'audit.unlimited',version:'1.0.0',limits:Object.fromEntries(adjustable.map(k=>[k,null]))});p.select('audit.unlimited','1.0.0');for(const k of adjustable)assert.equal(ref[k],Infinity);
  p.register({id:'audit.inherit',version:'1.0.0',limits:{components:undefined}});p.select('audit.inherit','1.0.0');assert.deepEqual(plain(ref),{...defaults,...extras});
  return{adjustable:adjustable.length,inherited:true,finite:true,unlimited:true,stable:ref===p.effective};
});
// Under a profile's own function limit, a wait whose condition holds a count and calls a made block reads it a step at a
// time from the first reading on: no turn runs the whole calculation (one would take most of a second here, a step
// takes some milliseconds; 200 ms is well between the two).
await check('EXTENSION-PROFILE-COUNTED-CONDITION-IN-STEPS',()=>{
  const R=A.createAkariRuntime({profiles:[{id:'audit.steps',version:'1.0.0',limits:{functionOps:50000000}}],profile:{id:'audit.steps',version:'1.0.0'}}),p=A.makeEmptyProject(),part=p.components.find(c=>c.type==='sprite');
  p.functions=[{id:'heavy',ownerId:'stage',name:'重い',args:[],source:'この中だけで使う変数【あ】を作り、最初は0にする。\n400000回くり返す。\n  あを1ふやす。\n2を答えとして返す。'}];
  p.scripts=[{id:'steps',targetId:part.id,event:'start',source:part.name+'が3回おされるか、（【重い】で求めた答え）が1と同じになるまで待つ。'}];
  const compiled=A.compileProject(p);assert.equal(compiled.errors.length,0,JSON.stringify(compiled.errors));const r=new R.RuntimeModel(p,{});r.now=()=>0;r.pauseClock=()=>{};r.resumeClock=()=>{};
  const q=new R.EventScheduler(p,compiled,r,{});q.schedule=()=>{};let longest=0;q.start();
  try{for(let i=0;i<400;i++){const t0=globalThis.performance.now();q.runTurn();q.recheckBlocked();longest=Math.max(longest,globalThis.performance.now()-t0);if(i>5&&!q.ready.length&&![...q.blocked].some(t=>t.blockReason.kind==='calculation'))break;}
    return {inSteps:longest<200,waiting:[...q.blocked].map(t=>t.blockReason.kind)};}finally{q.stop();}
});
await check('EXTENSION-PROFILE-STRICT-REGISTRATION',()=>{
  const p=A.createAkariProfiles(A.profiles.standard),base={id:'audit.invalid',version:'1.0.0',limits:{}};
  const invalid=[{...base,extra:true},{...base,id:'akari.standard'},{...base,id:'INVALID'},{...base,version:'1'},
    {...base,limits:{unknown:1}},...[-1,0,NaN,Infinity,-Infinity,1.5,'2',true].map(v=>({...base,limits:{components:v}}))];
  invalid.push({...base,limits:new Date()}, {...base,[Symbol('extra')]:1}, Object.defineProperty({...base},'hidden',{value:1}));
  for(const definition of invalid)assert.throws(()=>p.register(definition),{code:'E_PROFILE'});for(const key of guards)assert.throws(()=>p.register({...base,limits:{[key]:null}}),{code:'E_PROFILE',message:'変更できない上限です: '+key});
  const def={id:'audit.hash',version:'1.0.0',limits:{sourceEach:200000,components:null}},registered=p.register(def);
  const canonical={id:def.id,version:def.version,limits:{components:null,sourceEach:200000}};
  assert.equal(registered.contentHash,crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex'));assert.throws(()=>p.register(def),{code:'E_PROFILE',message:'プロファイルのID・版が重複しています: audit.hash@1.0.0'});
  return{invalidRejected:invalid.length,engineGuards:guards.length,duplicateRejected:true,canonicalHash:true};
});
await check('EXTENSION-PROFILE-HOST-REQUIREMENT',()=>{
  const p=A.createAkariProfiles(A.profiles.standard);p.register({id:'audit.selected',version:'1.0.0',limits:{components:501}});const q=p.select('audit.selected','1.0.0');assert.equal(p.validateRequirement(null),true);assert.equal(p.validateRequirement(q),true);
  assert.throws(()=>p.validateRequirement({...q,contentHash:'0'.repeat(64)}),{code:'E_PROFILE',message:'派生プロファイルの内容が一致しません'});assert.throws(()=>p.validateRequirement({...q,id:'audit.unknown'}),{code:'E_PROFILE',message:'必要な派生プロファイルが登録されていません'});p.select('akari.standard','1');assert.throws(()=>p.validateRequirement(q),{code:'E_PROFILE',message:'派生プロファイルをホスト側で選択してください'});assert.equal(p.requirement(),null);
  return{standardAccepted:true,mismatchRejected:true,unknownRejected:true,wrongSelectionRejected:true,unchangedSelection:true};
});
await check('EXTENSION-PROFILE-RUNTIME-ISOLATION',()=>{
  const standard=A.createAkariRuntime(),derived=A.createAkariRuntime({profiles:[{id:'audit.count',version:'1.0.0',limits:{components:501}}],profile:{id:'audit.count',version:'1.0.0'}});
  assert.equal(standard.LIMITS.components,500);assert.equal(derived.LIMITS.components,501);assert.equal(A.LIMITS.components,500);
  return{standardComponents:500,derivedComponents:501,isolated:true};
});
// The public profile example (EXTENSIONS.md 派生上限と適合確認), imported as a derived author imports it. The build
// takes its definitions through JSON, so they are plain data.
const profileExamples=await import('../../extensions/examples/profile.ts');
await check('EXTENSION-PROFILE-EXAMPLES',()=>{
  const examples=profileExamples.profiles;
  assert.deepEqual(plain(examples),examples);
  const changed=['components','sourceEach','listItems','functionOps'];
  const observe=definitions=>{
    const p=A.createAkariProfiles(A.profiles.standard),ref=p.effective;for(const definition of definitions)p.register(definition);
    const inherits=()=>Object.keys(p.standard).filter(k=>!changed.includes(k)).every(k=>ref[k]===p.standard[k]);
    p.select('demo.roomy','1.0.0');const roomy=Object.fromEntries(changed.map(k=>[k,ref[k]])),roomyInherits=inherits();
    p.select('demo.unlimited','1.0.0');const unlimited=changed.filter(k=>ref[k]===Infinity),unlimitedInherits=inherits();
    const runtime=A.createAkariRuntime({profiles:definitions,profile:{id:'demo.roomy',version:'1.0.0'}});
    return{ids:definitions.map(d=>d.id+'@'+d.version),roomy,roomyInherits,unlimited,unlimitedInherits,roomyRuntimeComponents:runtime.LIMITS.components,standardComponents:A.LIMITS.components,plainData:true};
  };
  // The comparison is sensitive: the same example with another declared ceiling is not accepted.
  const altered=plain(examples);altered[0].limits.components=601;
  const alteredDetected=!isDeepStrictEqual({...observe(altered),alteredDetected:true},extensionExpectedObservations['EXTENSION-PROFILE-EXAMPLES']);
  return{...observe(examples),alteredDetected};
});

// Exercise the public examples as an independent derived author would.
const {offline,text}=await import('../../extensions/examples/offline.ts'),{connector}=await import('../../extensions/examples/connector.ts');
const definitions=[offline,text];
const asyncManifest=structuredClone(offline.manifest);asyncManifest.id='audit.async';delete asyncManifest.name;asyncManifest.commands[0].name='監査非同期記憶';asyncManifest.commands[0].async=true;asyncManifest.calculations=[];asyncManifest.events=[];
// (a command whose promise fails with no reason: the flow stops with a mistake, as for one with a reason)
asyncManifest.commands.push({...structuredClone(asyncManifest.commands[0]),id:'fail',name:'監査理由なし失敗'});
function asyncFactory(){return{commands:{remember:args=>new Promise(resolve=>setTimeout(()=>resolve(args[0]),300)),fail:()=>Promise.reject()}};}
const profile={id:'audit.derivative',version:'1.0.0',limits:{components:501,stringChars:null,sourceEach:null,sourceTotal:null,listItems:null,functionOps:null,fileBytes:null}};
const externalManifest=structuredClone(offline.manifest);externalManifest.id='audit.external';delete externalManifest.name;externalManifest.offline=false;externalManifest.capabilities=['demo.add'];externalManifest.commands[0].name='外部接続で数を記憶する';externalManifest.commands[0].async=true;externalManifest.commands[0].capability='demo.add';externalManifest.calculations=[];externalManifest.events=[];
function externalFactory(api){return{commands:{remember(args){if(!api.connector){const error=new Error('外部拡張のコネクタは未接続です');error.code='E707';throw error;}return api.connector.request('demo.add',args);}}};}
let derived,player,externalDerived;
// The browser that ran the checks, as it names itself; null when it did not start.
let browserVersion=null;
try{const {buildDerivedProduct}=await import('../../extensions/build.mjs');derived=path.join(directory,'derived.html');await buildDerivedProduct({product:candidate,output:derived,extensions:[...definitions,{manifest:asyncManifest,factory:asyncFactory}],profiles:[profile],profile:{id:profile.id,version:profile.version},allowedCapabilities:[]});}catch(error){console.error('Derived product build: '+error.stack);}
try{const {buildDerivedProduct}=await import('../../extensions/build.mjs');externalDerived=path.join(directory,'external-derived.html');await buildDerivedProduct({product:candidate,output:externalDerived,extensions:[...definitions,{manifest:externalManifest,factory:externalFactory}],allowedCapabilities:['demo.add']});}catch(error){console.error('External derived product build: '+error.stack);}
// A factory is embedded as it is written: "$" in its text is not a replacement pattern of the build.
await check('EXTENSION-BUILD-AS-WRITTEN',async()=>{
  const {buildDerivedProduct}=await import('../../extensions/build.mjs'),file=path.join(directory,'dollar-derived.html');
  const manifest={...structuredClone(text.manifest),id:'audit.dollar',name:'ドルの文字',calculations:[{...structuredClone(text.manifest.calculations[0]),id:'price',name:'ドルを付ける'}]};
  const factory=function dollarFactory(){return {commands:{},calculations:{price(args){return '$'+args[0]+"$'"+'$&'+`$${'$'}`;}}};};
  await buildDerivedProduct({product:candidate,output:file,extensions:[{manifest,factory}]});
  const html=fs.readFileSync(file,'utf8'),[before,after]=fs.readFileSync(candidate,'utf8').split('  function configureAkariFoundation() { return { extensions: [], profiles: [], profile: null, allowedCapabilities: [] }; }');
  const productKept=html.startsWith(before)&&html.endsWith(after),sourceKept=html.includes(Function.prototype.toString.call(factory));
  const context={console,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,Blob,URL,structuredClone,crypto:crypto.webcrypto,setTimeout,clearTimeout,AbortController:globalThis.AbortController,queueMicrotask:globalThis.queueMicrotask};
  vm.runInNewContext(html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')),context,{timeout:30000});
  const D=context.Akari,p=D.makeEmptyProject();p.scripts=[{id:'s0',event:'start',source:'',targetId:p.components[0].id}];
  D.updateScriptSource(p.scripts[0],'拡張計算「ドルの文字」「ドルを付ける」（「3」）を言う。',p);
  const compiled=D.compileProject(p),said=[];let now=0;const r=new D.RuntimeModel(p,{});r.now=()=>now;
  const q=new D.EventScheduler(p,compiled,r,{say:(id,t)=>said.push(String(t))});q.schedule=()=>{};
  try{q.start();for(;now<20;now++){for(let i=0;i<50&&q.ready.length;i++)q.runTurn();q.recheckBlocked();}}finally{q.stop();}
  // The hash a host of this realm gives the same definition: the build embedded the text it hashed.
  const {createAkariExtensionHost}=await import('../../extensions/foundation.ts'),host=createAkariExtensionHost({});host.register(manifest,factory);
  return {productKept,sourceKept,compiled:compiled.errors.length===0,said,
    sameHash:D.extensions.requirements().required[0].contentHash===host.requirements().required[0].contentHash};
});
// extensions/build.mjs checks a definition as the product's host does when the derived product starts: a calculation
// named as a built-in one (四捨五入) is refused at the build with the product's E702, and so is a Standard other than the
// contract of the product built from (here a copy that says language contract 6), with E701. No derived product is written.
await check('EXTENSION-BUILD-CHECKS-AS-PRODUCT',async()=>{
  const {buildDerivedProduct}=await import('../../extensions/build.mjs'),file=path.join(directory,'reserved-derived.html'),later=path.join(directory,'contract-derived.html');
  const manifest={...structuredClone(text.manifest),id:'audit.reserved',name:'まるめる道具',calculations:[{...structuredClone(text.manifest.calculations[0]),id:'round',name:'四捨五入'}]};
  const refusal=build=>build.then(()=>null,error=>error.code||'no code: '+error.message);
  const reserved=await refusal(buildDerivedProduct({product:candidate,output:file,extensions:[{manifest,factory:text.factory}]}));
  const contract='    const EXECUTABLE_CONTRACT = Object.freeze({\n      languageContractId: 5,',source=candidateText,other=path.join(directory,'contract-6.html');
  assert.equal(source.split(contract).length,2,'one contract in the product');fs.writeFileSync(other,source.replace(contract,contract.replace(': 5,',': 6,')));
  const standard=await refusal(buildDerivedProduct({product:other,output:later,extensions:[text]}));
  // The capabilities a run may be given are names, each once: others would refuse every run of the product (E707).
  const allowed=path.join(directory,'capabilities-derived.html'),capabilities={};
  for(const [key,value] of [['twice',['demo.add','demo.add']],['text','demo.add'],['number',[1]]])capabilities[key]=await refusal(buildDerivedProduct({product:candidate,output:allowed,extensions:[offline],allowedCapabilities:value}));
  return {reserved,standard,capabilities,written:fs.existsSync(file)||fs.existsSync(later)||fs.existsSync(allowed)};
});
// extensions/build.mjs checks the definitions as they are written, before it writes them as JSON: a ceiling of NaN or
// Infinity is refused as the product refuses it (E_PROFILE), not written as null (no ceiling); null (no ceiling) and a
// ceiling left undefined (the standard one) are built; a state of NaN in a manifest is refused (E701), not written as null.
await check('EXTENSION-BUILD-JSON-AS-WRITTEN',async()=>{
  const {buildDerivedProduct}=await import('../../extensions/build.mjs');let n=0;
  const outcome=options=>buildDerivedProduct({product:candidate,output:path.join(directory,'json-'+(n++)+'.html'),...options}).then(()=>'built',error=>error.code||'no code: '+error.message);
  const ceiling=value=>outcome({extensions:[offline],profiles:[{id:'audit.ceiling',version:'1.0.0',limits:{components:value}}],profile:{id:'audit.ceiling',version:'1.0.0'}});
  const manifest={...structuredClone(offline.manifest),id:'audit.nan',name:'数でない初め',state:{...structuredClone(offline.manifest.state),initial:{value:NaN}}};
  // A derived product with a profile and no extension records the profile in a saved work, with no extension and no state.
  const profileOnly=path.join(directory,'json-profile-only.html');await buildDerivedProduct({product:candidate,output:profileOnly,profiles:[{id:'audit.profile-only',version:'1.0.0',limits:{components:600}}],profile:{id:'audit.profile-only',version:'1.0.0'}});
  {const P=loadApi(fs.readFileSync(profileOnly,'utf8')),saved=P.serializeProject(P.makeEmptyProject(),P.makeDefaultAssetStore()),record=JSON.parse(saved.slice(saved.lastIndexOf('```json')+7,saved.lastIndexOf('```'))).extensions;
    assert.deepEqual(JSON.parse(JSON.stringify([record?.required,record?.profile,record?.state])),[[],JSON.parse(JSON.stringify(P.profiles.requirement())),[]]);
    assert.deepEqual([record.profile.id,record.profile.version,/^[0-9a-f]{64}$/.test(record.profile.contentHash)],['audit.profile-only','1.0.0',true]);}
  return {nan:await ceiling(NaN),infinite:await ceiling(Infinity),none:await ceiling(null),standard:await ceiling(undefined),
    state:await outcome({extensions:[{manifest,factory:offline.factory}]})};
});
// A factory whose text opens an HTML comment or a script (<!-- or <script) is refused as one that closes the script is:
// in the inline script of a derived product or a written player, they would take the closing tag into the script, and the
// player would not start. The host (the product embeds extensions/foundation.ts as it is) and extensions/build.mjs refuse it (E701).
await check('EXTENSION-FACTORY-MARKUP-REFUSED',async()=>{
  const {createAkariExtensionHost}=await import('../../extensions/foundation.ts'),{buildDerivedProduct}=await import('../../extensions/build.mjs');
  const factories={commentOpen:()=>({calculations:{double:()=>'<!--'}}),scriptOpen:()=>({calculations:{double:()=>'<script>'}}),scriptClose:()=>({calculations:{double:()=>'</script>'}})};
  const manifest=key=>({...structuredClone(offline.manifest),id:'audit.markup.'+key.toLowerCase(),name:'しるしの道具'+Object.keys(factories).indexOf(key)});
  const refusal=register=>{try{register();return 'registered';}catch(error){return error.code||'no code: '+error.message;}};
  const observed={host:Object.fromEntries(Object.entries(factories).map(([key,factory])=>[key,refusal(()=>createAkariExtensionHost({}).register(manifest(key),factory))]))};
  const files=[];observed.build={};
  for(const [key,factory] of Object.entries(factories)){const file=path.join(directory,'markup-'+key+'.html');files.push(file);
    observed.build[key]=await buildDerivedProduct({product:candidate,output:file,extensions:[{manifest:manifest(key),factory}]}).then(()=>'built',error=>error.code||'no code: '+error.message);}
  return {...observed,written:files.some(file=>fs.existsSync(file))};
});
// A name with \ is refused (the code that names it could not be read back), and so is a factory whose text has CR (the
// derived product's page reads it as LF, so its hash would differ there from the build's).
await check('EXTENSION-NAMES-AND-LINES-REFUSED',async()=>{
  const {createAkariExtensionHost}=await import('../../extensions/foundation.ts');
  const refusal=(manifest,factory=offline.factory)=>{try{createAkariExtensionHost({}).register(manifest,factory);return 'registered';}catch(error){return error.code||'no code: '+error.message;}};
  const base=()=>({...structuredClone(offline.manifest),id:'audit.lines',name:'行の道具'}),operation=base();operation.calculations[0].name='文字\\加工';
  const crlf=(0,eval)('(()=>({calculations:{double:args=>args[0]}\r\n}))');
  return {extensionName:refusal({...base(),name:'円\\記号'}),operationName:refusal(operation),crlfFactory:refusal(base(),crlf),plain:refusal(base()),
    // (60 characters counted as characters: 31 of a character outside the basic plane are not too long)
    wideName:refusal({...base(),name:'\u{20BB7}'.repeat(31)}),longName:refusal({...base(),name:'あ'.repeat(61)})};
});
// A factory's text goes into the inline script of a derived product as it is: NUL (U+0000), which the page reads as
// U+FFFD, and a lone surrogate, which a file in UTF-8 cannot hold, are refused by the host and by extensions/build.mjs
// (E701), and no derived product is written. A pair of surrogates, U+000C, U+FEFF, U+2028 and U+2029 are registered
// (EXTENSION-FACTORY-TEXT-IN-PAGE opens a derived product holding them).
const factoryHolding=character=>(0,eval)('(()=>({calculations:{double:()=>"'+character+'"}}))');
await check('EXTENSION-FACTORY-CHARACTERS-REFUSED',async()=>{
  const {createAkariExtensionHost}=await import('../../extensions/foundation.ts'),{buildDerivedProduct}=await import('../../extensions/build.mjs');
  const characters={nul:'\0',high:'\ud800',low:'\udc00',reversed:'\udc00\ud800',pairThenLow:'\ud83d\ude00\ude00',pair:'\ud83d\ude00',formFeed:'\f',byteOrderMark:'\ufeff',lineSeparator:'\u2028',paragraphSeparator:'\u2029'};
  const manifest=key=>({...structuredClone(offline.manifest),id:'audit.character.'+key.toLowerCase(),name:'文字の道具'+Object.keys(characters).indexOf(key)});
  const refusal=register=>{try{register();return 'registered';}catch(error){return error.code||'no code: '+error.message;}};
  const observed={host:Object.fromEntries(Object.entries(characters).map(([key,character])=>[key,refusal(()=>createAkariExtensionHost({}).register(manifest(key),factoryHolding(character)))]))},files=[];
  observed.build={};
  for(const key of ['nul','high','low']){const file=path.join(directory,'character-'+key+'.html');files.push(file);
    observed.build[key]=await buildDerivedProduct({product:candidate,output:file,extensions:[{manifest:manifest(key),factory:factoryHolding(characters[key])}]}).then(()=>'built',error=>error.code||'no code: '+error.message);}
  return {...observed,written:files.some(file=>fs.existsSync(file))};
});
// The API of a derived product run in Node (its script in a realm of its own).
const derivedApi=file=>{const html=fs.readFileSync(file,'utf8'),context={console,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,Blob,URL,structuredClone,crypto:crypto.webcrypto,setTimeout,clearTimeout,AbortController:globalThis.AbortController,queueMicrotask:globalThis.queueMicrotask};
  vm.runInNewContext(html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')),context,{timeout:30000});return context.Akari;};
// An event and an answer that come while the run is paused are taken in, on resuming, in the order they came, as they
// are without the pause (LANGUAGE 拡張基盤).
await check('EXTENSION-PAUSED-ARRIVALS-IN-ORDER',async()=>{
  const {buildDerivedProduct}=await import('../../extensions/build.mjs'),manifest={...structuredClone(offline.manifest),id:'audit.order',name:'順番の道具',state:{formatVersion:1,initial:null},calculations:[],
    commands:[{id:'later',name:'できごとのあとで答える',description:'x',args:[],returns:{type:'number',unit:null},async:true}],events:[{id:'ping',name:'合図が来た',description:'x',payload:{type:'number',unit:null}}]};
  const factory=function orderFactory(api){return{commands:{later(){setTimeout(()=>api.emit('ping',1),5);return new Promise(resolve=>setTimeout(()=>resolve(2),20));}},calculations:{}};};
  const file=path.join(directory,'order.html');await buildDerivedProduct({product:candidate,output:file,extensions:[{manifest,factory}]});const D=derivedApi(file);
  const run=async paused=>{const p=D.makeEmptyProject(),id=p.components[0].id;p.scripts=[{id:'s0',event:'start',source:'',targetId:id},{id:'s1',event:'message',source:'',targetId:id}];
    D.updateScriptSource(p.scripts[0],'拡張「順番の道具」「できごとのあとで答える」（）。\n「答えが来た」と言う。',p);D.updateScriptSource(p.scripts[1],'「拡張:audit.order/ping」という合図を受けたとき、\n  「できごとが来た」と言う。',p);
    const said=[],q=new D.EventScheduler(p,D.compileProject(p),new D.RuntimeModel(p,{}),{say:(_,t)=>said.push(String(t))});q.schedule=()=>{};
    try{q.start();for(let i=0;i<20&&q.ready.length;i++)q.runTurn();if(paused)q.pause();
      if(paused){await new Promise(r=>setTimeout(r,60));q.resume();}else for(let t=0;t<12;t++){await new Promise(r=>setTimeout(r,5));q.recheckBlocked();for(let i=0;i<50&&q.ready.length;i++)q.runTurn();}
      for(let k=0;k<10;k++){q.recheckBlocked();for(let i=0;i<50&&q.ready.length;i++)q.runTurn();}}finally{q.stop();}return said;};
  return {running:await run(false),paused:await run(true)};
});
// A lone surrogate in a name written in a work's code (the extension's, an operation's, an argument's, an event's) is
// refused by the host and by extensions/build.mjs (E701), as in a factory's text: a file in UTF-8 would give the work
// back another name. A pair, and a lone surrogate in a description or in the initial state (kept in JSON), are registered.
await check('EXTENSION-NAME-CHARACTERS-REFUSED',async()=>{
  const {createAkariExtensionHost}=await import('../../extensions/foundation.ts'),{buildDerivedProduct}=await import('../../extensions/build.mjs');
  const base=()=>({...structuredClone(offline.manifest),id:'audit.name-characters',name:'名前の文字の道具'}),change=(edit)=>{const manifest=base();edit(manifest);return manifest;};
  const manifests={extension:change(m=>{m.name='名前\ud800';}),command:change(m=>{m.commands[0].name='記\udc00憶する';}),argument:change(m=>{m.commands[0].args[0].name='\ud800';}),
    event:change(m=>{m.events[0].name='\udc00\ud800';}),stateKey:change(m=>{m.state={...m.state,initial:{'\ud800':1}};}),stateText:change(m=>{m.state={...m.state,initial:['a\udc00']};}),
    pair:change(m=>{m.name='名前😀';}),description:change(m=>{m.description='\ud800';})};
  const refusal=register=>{try{register();return 'registered';}catch(error){return error.code||'no code: '+error.message;}};
  const file=path.join(directory,'name-characters.html');
  return {host:Object.fromEntries(Object.entries(manifests).map(([key,manifest])=>[key,refusal(()=>createAkariExtensionHost({}).register(manifest,offline.factory))])),
    build:await buildDerivedProduct({product:candidate,output:file,extensions:[{manifest:manifests.command,factory:offline.factory}]}).then(()=>'built',error=>error.code||'no code: '+error.message),
    written:fs.existsSync(file)};
});
// A work saved with t.main 1.0.0, which depends on t.dep, opened where t.main 1.1.0 no longer depends on it: with t.dep
// not registered, a work that uses none of t.dep is asked about as a newer release of t.main is, and opens without the
// record of t.dep; one that uses a block or an event of t.dep is refused, naming t.dep as not registered, without asking.
// With t.dep still registered, the work keeps its record of t.dep.
await check('EXTENSION-DROPPED-DEPENDENCY-OPEN',async()=>{
  const {buildDerivedProduct}=await import('../../extensions/build.mjs'),{createAkariExtensionHost}=await import('../../extensions/foundation.ts');
  const shape=(id,name,version,extra)=>({...structuredClone(offline.manifest),id,name,version,dependencies:[],capabilities:[],state:{formatVersion:1,initial:null},calculations:[],events:[],...extra});
  const command=(id,name)=>({id,name,description:'x',args:[],returns:{type:'void',unit:null},async:false});
  const factory=function droppedFactory(){return{commands:{a(){},b(){}},calculations:{}};};
  const dependency=shape('t.dep','依存の道具','1.0.0',{commands:[command('b','依存の命令')],events:[{id:'ping',name:'依存の合図',description:'x',payload:{type:'number',unit:null}}]});
  const main=(version,dependencies)=>shape('t.main','主の道具',version,{commands:[command('a','主の命令')],dependencies});
  const derived=async(label,manifests)=>{const built=path.join(directory,'dropped-'+label+'.html');await buildDerivedProduct({product:candidate,output:built,extensions:manifests.map(manifest=>({manifest,factory}))});return derivedApi(built);};
  const older=await derived('older',[dependency,main('1.0.0',[createAkariExtensionHost({}).register(dependency,factory)])]);
  // (a part drawn as a letter: an image would need decoding, which Node has not)
  const save=(sources)=>{const p=older.makeEmptyProject(),part=p.components[0],id=part.id;part.costumes=[{id:'face',name:'顔',kind:'text',value:'●'}];part.costumeId='face';p.scripts=sources.map(([event],index)=>({id:'s'+index,event,source:'',targetId:id}));
    sources.forEach(([,source],index)=>older.updateScriptSource(p.scripts[index],source,p));return older.serializeProject(p,older.makeDefaultAssetStore(),null);};
  const works={unused:save([['start','拡張「主の道具」「主の命令」（）。']]),block:save([['start','拡張「主の道具」「主の命令」（）。\n拡張「依存の道具」「依存の命令」（）。']]),
    event:save([['start','拡張「主の道具」「主の命令」（）。'],['message','「拡張:t.dep/ping」という合図を受けたとき、\n  「来た」と言う。']])};
  const open=async(A,text,options)=>{try{const r=await A.parseProjectFile(text,options);return {record:r.project.extensions.required.map(item=>item.id+'@'+item.version),state:r.project.extensions.state.map(item=>item.id)};}
    catch(error){return {code:error.code,message:error.message,asked:(error.extensionUpgrades||[]).map(item=>item.id+' '+item.from+'→'+item.to)};}};
  const gone=await derived('gone',[main('1.1.0',[])]),still=await derived('still',[dependency,main('1.1.0',[])]),observed={};
  for(const [key,text] of Object.entries(works))observed[key]={first:await open(gone,text),agreed:await open(gone,text,{upgradeExtensions:true})};
  observed.stillRegistered=await open(still,works.unused,{upgradeExtensions:true});
  // (the lists come from the derived product's realm)
  return plain(observed);
});
// A text an extension keeps in a "project" state is saved in the work's JSON as it is, a lone surrogate too (written as
// a \u escape), and the work opens with the same state: the state is never changed on saving.
await check('EXTENSION-STATE-TEXT-KEPT',async()=>{
  const {buildDerivedProduct}=await import('../../extensions/build.mjs');
  const manifest={...structuredClone(offline.manifest),id:'audit.kept-text',name:'文字の記憶',state:{formatVersion:1,initial:'\ud800',persist:'project'},calculations:[],events:[],
    commands:[{id:'keep',name:'文字を記憶する',description:'x',args:[],returns:{type:'void',unit:null},async:false}]};
  const factory=function keptTextFactory(api){return{commands:{keep(){api.setState('a\udc00b😀');}},calculations:{}};};
  const built=path.join(directory,'kept-text.html');await buildDerivedProduct({product:candidate,output:built,extensions:[{manifest,factory}]});const D=derivedApi(built);
  const p=D.makeEmptyProject(),part=p.components[0];part.costumes=[{id:'face',name:'顔',kind:'text',value:'●'}];part.costumeId='face';
  p.scripts=[{id:'s0',event:'start',source:'',targetId:part.id}];D.updateScriptSource(p.scripts[0],'拡張「文字の記憶」「文字を記憶する」（）。',p);
  const q=new D.EventScheduler(p,D.compileProject(p),new D.RuntimeModel(p,{}),{say(){}});q.schedule=()=>{};
  try{q.start();for(let i=0;i<20&&q.ready.length;i++)q.runTurn();}finally{q.stop();}
  const codes=value=>[...String(value)].map(character=>character.codePointAt(0).toString(16));
  const text=new TextDecoder().decode(new TextEncoder().encode(D.serializeProject(p,D.makeDefaultAssetStore(),null))),opened=await D.parseProjectFile(text);
  return {set:codes(p.extensions.state[0].value),reopened:codes(opened.project.extensions.state[0].value)};
});
// Two derived products for EXTENSION-STATE-OF-UNRECORDED: one with the offline example only, one with a second extension.
const fewerDerived=path.join(directory,'fewer-derived.html'),moreDerived=path.join(directory,'more-derived.html');
try{
  const {buildDerivedProduct}=await import('../../extensions/build.mjs'),extra=structuredClone(offline.manifest);
  extra.id='audit.extra';extra.name='べつの記憶';extra.commands[0].name='べつに記憶する';
  extra.calculations[0].name='べつに2倍にする';extra.calculations[1].name='べつに記憶した数';extra.events[0].name='べつに変わった';
  await buildDerivedProduct({product:candidate,output:fewerDerived,extensions:[offline]});
  await buildDerivedProduct({product:candidate,output:moreDerived,extensions:[offline,{manifest:extra,factory:offline.factory}]});
}catch(error){console.error('Derived products with fewer and more extensions: '+error.stack);}
// A derived product for EXTENSION-FACTORY-TEXT-IN-PAGE: audit.carried holds in its factory's text the characters a page
// reads as they are, and in its manifest those it would not (written as JSON escapes); audit.depending depends on it.
const carriedDerived=path.join(directory,'carried-derived.html'),carriedDescription='\0\ud800\udc00</script><!--<script>\u2028\r\n',carried=[];
try{
  const {buildDerivedProduct}=await import('../../extensions/build.mjs'),{createAkariExtensionHost}=await import('../../extensions/foundation.ts');
  const first={manifest:{...structuredClone(offline.manifest),id:'audit.carried',name:'運ぶ道具',description:carriedDescription},
    factory:factoryHolding('\ud83d\ude00\f\ufeff\u2028\u2029')};
  const identity=createAkariExtensionHost({}).register(first.manifest,first.factory),extra=structuredClone(offline.manifest);
  extra.id='audit.depending';extra.name='よりかかる道具';extra.dependencies=[identity];extra.commands[0].name='よりかかって記憶する';
  extra.calculations[0].name='よりかかって2倍にする';extra.calculations[1].name='よりかかって記憶した数';extra.events[0].name='よりかかって変わった';
  const second={manifest:extra,factory:offline.factory},host=createAkariExtensionHost({});
  for(const definition of [first,second]){host.register(definition.manifest,definition.factory);carried.push(Function.prototype.toString.call(definition.factory));}
  carried.push(host.requirements().required.map(x=>x.id+' '+x.contentHash));
  await buildDerivedProduct({product:candidate,output:carriedDerived,extensions:[first,second]});
}catch(error){console.error('Derived product with carried characters: '+error.stack);}
// The 名人-only example (scope "meijin"), built and run as an independent derived author would, on the real runtime.
await check('EXTENSION-MEIJIN-SCOPE',async()=>{
  const {buildDerivedProduct}=await import('../../extensions/build.mjs'),{meijin}=await import('../../extensions/examples/meijin.ts'),file=path.join(directory,'meijin-derived.html');
  await buildDerivedProduct({product:candidate,output:file,extensions:[offline,meijin]});
  const html=fs.readFileSync(file,'utf8'),context={console,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,Blob,URL,structuredClone,crypto:crypto.webcrypto,setTimeout,clearTimeout,AbortController:globalThis.AbortController,queueMicrotask:globalThis.queueMicrotask};
  vm.runInNewContext(html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')),context,{timeout:30000});
  const M=context.Akari,work=scripts=>{const p=M.makeEmptyProject();p.components[0].name='ねこ';p.components[0].costumes=[{id:'c-face',name:'顔',kind:'text',value:'●'}];p.components[0].costumeId='c-face';
    p.scripts=scripts.map((s,i)=>({id:'s'+i,event:'start',source:'',...(s.meijin?{mode:'meijin',targetId:'meijin'}:{targetId:p.components[0].id})}));p.scripts.forEach((s,i)=>M.updateScriptSource(s,scripts[i].source,p));return p;};
  const first=p=>M.compileProject(p).errors[0]?.code||null;
  const text='拡張「名人の記録」「数を記録する」（7）。\nねこは拡張計算「名人の記録」「記録した数」（）を言う。',p=work([{meijin:true,source:text}]),compiled=M.compileProject(p);
  const said=[];let now=0;const r=new M.RuntimeModel(p,{});r.now=()=>now;const q=new M.EventScheduler(p,compiled,r,{say:(id,t)=>said.push(String(t))});q.schedule=()=>{};
  try{q.start();for(;now<100;now++){for(let i=0;i<50&&q.ready.length;i++)q.runTurn();q.recheckBlocked();}}finally{q.stop();}
  const hints=target=>M.hintCandidates(work([{meijin:true,source:''}]),target,{}).some(x=>x.text.includes('「名人の記録」'));
  let invalidScopeRejected=null;try{const host=M.createAkariExtensionHost();host.register({...structuredClone(meijin.manifest),id:'audit.badscope',name:'監査の記録',commands:[{...meijin.manifest.commands[0],scope:'block'}],calculations:[],events:[]},meijin.factory);}catch(error){invalidScopeRejected=error.code;}
  // Values made in the product's own context are compared as plain data.
  return plain({meijinChecked:compiled.errors.length===0,meijinSaid:said,ordinaryCommandStopped:first(work([{source:'拡張「名人の記録」「数を記録する」（7）。'}])),
    ordinaryCalculationStopped:first(work([{source:'拡張計算「名人の記録」「記録した数」（）を言う。'}])),
    ordinaryEventStopped:first(work([{source:'「拡張:demo.meijin/recorded」という合図を受けたとき、\n  「きた」と言う。'}])),
    // An ordinary body that receives the 名人-only event's Japanese name is not told the event's signal name (I137).
    ordinaryEventNameNotice:(p=>{p.scripts[0].event='message';M.updateScriptSource(p.scripts[0],'「記録した」という合図を受けたとき、\n  「きた」と言う。',p);
      return M.compileProject(p).notes.filter(n=>n.code==='I137').map(n=>[n.message,n.proposals?.length??0]);})(work([{source:''}])),
    otherExtensionOrdinary:first(work([{source:'拡張「数の記憶」「数を記憶する」（9）。'}]))===null,
    blocks:M.BLOCK_SCHEMAS.filter(s=>s.id.startsWith('ExtensionCommand:')).map(s=>s.id),meijinHints:hints('meijin'),ordinaryHints:hints(work([]).components[0].id),
    invalidScopeRejected,scopes:['commands','calculations','events'].map(kind=>M.extensions.operations(kind).find(x=>x.extensionId==='demo.meijin').scope)});
});
// A file carries the extensions its work's record names, with what they depend on (LANGUAGE「拡張基盤」): an extension
// the work does not use, whose state is its initial one, is left out, so one that cannot be carried in a file refuses
// only a work whose record names it (E709): one that uses it or an extension that depends on it, or keeps its state.
// The file's player opens the work with the extensions it carries.
await check('EXTENSION-STANDALONE-USED-ONLY',async()=>{
  const {buildDerivedProduct}=await import('../../extensions/build.mjs'),{createAkariExtensionHost}=await import('../../extensions/foundation.ts'),standardIds=offline.manifest.standard;
  const unfit={manifest:{...structuredClone(connector.manifest),selfContained:false},factory:connector.factory};
  const one={id:'one',name:'もとの一',description:'x',args:[],returns:{type:'number',unit:null},async:false};
  const base={manifest:{id:'audit.base',name:'もとの道具',version:'1.0.0',apiContract:1,standard:standardIds,description:'x',dependencies:[],capabilities:[],offline:true,selfContained:true,
    state:{formatVersion:1,initial:null},commands:[],events:[],calculations:[one]},factory:function baseFactory(){return{commands:{},calculations:{one(){return 1;}}};}};
  const {contentHash}=createAkariExtensionHost({standard:standardIds}).register(base.manifest,base.factory);
  const user={manifest:{...structuredClone(base.manifest),id:'audit.user',name:'つかう道具',dependencies:[{id:'audit.base',version:'1.0.0',contentHash}],calculations:[{...one,id:'two',name:'つかう二'}]},
    factory:function userFactory(){return{commands:{},calculations:{two(){return 2;}}};}};
  // (an extension that depends on the one that cannot be carried)
  const leaning={manifest:{...structuredClone(base.manifest),id:'audit.leaning',name:'よりかかる道具',calculations:[{...one,id:'three',name:'よりかかる三'}],
    dependencies:[{id:'demo.connector',version:connector.manifest.version,contentHash:createAkariExtensionHost({standard:standardIds}).register(unfit.manifest,unfit.factory).contentHash}]},
    factory:function leaningFactory(){return{commands:{},calculations:{three(){return 3;}}};}};
  const made=async(name,options)=>{const file=path.join(directory,name+'.html');await buildDerivedProduct({product:candidate,output:file,allowedCapabilities:connector.manifest.capabilities,...options});return derivedApi(file);};
  const D=await made('used-only',{extensions:[offline,unfit,base,user,leaning]}),P=await made('used-only-profile',{extensions:[offline,unfit],profiles:[profile],profile:{id:profile.id,version:profile.version}});
  const work=(A,source,receive)=>{const p=A.makeEmptyProject(),id=p.components[0].id;p.scripts=[{id:'s0',targetId:id,event:'start',source:''}];A.updateScriptSource(p.scripts[0],source,p);
    if(receive)p.scripts.push({id:'r',targetId:id,event:'message',filter:{message:receive},source:'「来た」と言う。'});return p;};
  const run=(api,p,compiled)=>{const said=[],q=new api.EventScheduler(p,compiled,new api.RuntimeModel(p,{}),{say:(_,t)=>said.push(String(t))});q.schedule=()=>{};
    try{q.start();for(let i=0;i<50&&q.ready.length;i++)q.runTurn();}finally{q.stop();}return said;};
  // The file's player is started as it starts itself, and opens the work it holds (only the mount on the page is replaced).
  const player=(A,p)=>{let html;try{html=A.generateStandaloneHtml(p,A.makeDefaultAssetStore());}catch(error){return error.code||error.message;}
    const script=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')),needle='\nmountAkariPlayer(createAkariRuntime(';assert.equal(script.split(needle).length,2,'one player mount');let opened=null;
    const context={console,TextEncoder,TextDecoder,Uint8Array,Uint32Array,DataView,ArrayBuffer,Blob,URL,structuredClone,crypto:crypto.webcrypto,setTimeout,clearTimeout,AbortController:globalThis.AbortController,queueMicrotask:globalThis.queueMicrotask,
      __open:(api,_stage,payload)=>{const restored=api.restoreExecutable(payload);
        opened={carried:api.extensions.stateInfo().map(x=>x.id),kept:(payload.extensions?.state??[]).map(item=>[item.id,JSON.stringify(item.value)]),said:run(api,restored.project,restored.compiled)};}};
    vm.runInNewContext(script.replace(needle,'\n__open(createAkariRuntime('),context,{timeout:30000});return opened;};
  const observed={none:player(D,work(D,'「ふつう」と言う。')),used:player(D,work(D,'拡張計算「数の記憶」「数を2倍にする」（3）を言う。')),
    dependency:player(D,work(D,'拡張計算「つかう道具」「つかう二」（）を言う。')),profileOnly:player(P,work(P,'「ふつう」と言う。')),
    unfit:player(D,work(D,'「ふつう」と言う。','拡張:demo.connector/sample')),unfitDependency:player(D,work(D,'拡張計算「よりかかる道具」「よりかかる三」（）を言う。'))};
  // The work keeps the state its run left (persist "project"), then no longer uses the extension.
  const kept=work(D,'拡張「数の記憶」「数を記憶する」（5）。');run(D,kept,D.compileProject(kept));D.updateScriptSource(kept.scripts[0],'「ふつう」と言う。',kept);
  return plain({...observed,kept:player(D,kept)});
});
// A heading written in the body that receives a registered extension event by its Japanese name is told the event's
// signal name, with the button that writes it, and the work receives the event once it is pressed; a name that is no
// event's is told as before (LANGUAGE I137).
await check('EXTENSION-EVENT-NAME-NOTICE',async()=>{
  const D=derivedApi(fewerDerived),sender='拡張「数の記憶」「数を記憶する」（17）。';
  const work=heading=>{const p=D.makeEmptyProject(),id=p.components[0].id;p.scripts=[{id:'s0',targetId:id,event:'start',source:''},{id:'s1',targetId:id,event:'message',source:''}];
    D.updateScriptSource(p.scripts[0],sender,p);D.updateScriptSource(p.scripts[1],heading+'\n  「来た」と言う。',p);return p;};
  const notices=p=>D.compileProject(p).notes.filter(n=>n.code==='I137');
  const told=p=>notices(p).map(n=>({message:n.message,button:n.proposals?.[0]?.label??null,source:n.proposals?.[0]?.source??null}));
  const named=work('「記憶した数が変わった」という合図を受けたとき、'),[proposal]=notices(named)[0].proposals;
  D.updateScriptSource(named.scripts[1],proposal.original.slice(0,proposal.start)+proposal.source+proposal.original.slice(proposal.end),named);
  const said=[];let now=0;const r=new D.RuntimeModel(named,{});r.now=()=>now;const q=new D.EventScheduler(named,D.compileProject(named),r,{say:(_,t)=>said.push(String(t))});q.schedule=()=>{};
  try{q.start();for(;now<20;now++){for(let i=0;i<50&&q.ready.length;i++)q.runTurn();q.recheckBlocked();}}finally{q.stop();}
  return plain({event:told(work('「記憶した数が変わった」という合図を受けたとき、')),fixedSaid:said,ordinary:told(work('「開始」という合図を受けたとき、'))});
});
const install=`globalThis.auditDefinitions=[{manifest:${JSON.stringify(offline.manifest)},factory:${offline.factory.toString()}},{manifest:${JSON.stringify(text.manifest)},factory:${text.factory.toString()}}];globalThis.auditConnector={manifest:${JSON.stringify(connector.manifest)},factory:${connector.factory.toString()}};`;
// Ordinary local files use opaque origin "null". Do not change that contract
// with --allow-file-access-from-files, or mask requests with abort routes.
async function withOrdinaryFileBrowser(fn) {
  const browser=await require('playwright').chromium.launch({executablePath:browserPath,headless:true,timeout:15000,args:['--disable-background-networking']});let timer;
  try{return await Promise.race([fn(browser),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Extension foundation browser timeout')),240000);})]);}
  finally{clearTimeout(timer);await browser.close();}
}
await withOrdinaryFileBrowser(async browser=>{
  let runtimeContractsPromise;
  const runtimeContracts=()=>runtimeContractsPromise ||= observeExtensionRuntimeContracts(browser,candidate,directory);
  browserVersion=checkBrowserVersion(browser.version());checkPlaywrightVersion(require('playwright/package.json').version);
  async function pageAt(file){const context=await browser.newContext();const page=await context.newPage();const requests=[],sockets=[],errors=[];page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});page.on('websocket',s=>sockets.push(s.url()));page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>!!globalThis.Akari?.app);return{context,page,requests,sockets,errors};}
  const standard=await pageAt(candidate),fork=derived?await pageAt(derived):null;
  if(fork)await fork.page.evaluate(install);
  // The product asks about unsaved work in its own dialog. The handler answers it during the next
  // locator action, so the opening step waits for that action before reading the result.
  if(fork)await answerProductConfirms(fork.page,true);
  const productQuestionAnswered=page=>page.locator('#loseConfirmModal').waitFor({state:'hidden'});
  // The first work has no sentence and does not run (LANGUAGE.md 新しい作品とお手本、吹出し), so a running work is opened first.
  await check('EXTENSION-STANDARD-NO-NETWORK',async()=>{await installGreetingFixture(standard.page,{keepRunning:true});await standard.page.locator('#runBtn').click();await pressStop(standard.page.locator('#stopBtn'));await standard.page.waitForTimeout(300);return{httpRequests:standard.requests.length,socketRequests:standard.sockets.length,errors:standard.errors.length,unblocked:true};});
  await check('EXTENSION-DERIVED-NO-NETWORK',async()=>{assert.ok(fork);await installGreetingFixture(fork.page,{keepRunning:true});await fork.page.locator('#runBtn').click();await pressStop(fork.page.locator('#stopBtn'));await fork.page.waitForTimeout(300);return{httpRequests:fork.requests.length,socketRequests:fork.sockets.length,errors:fork.errors.length,unblocked:true};});
  async function evaluate(id,fn){await check(id,async()=>{assert.ok(fork);const observed=await fork.page.evaluate(fn);return id==='EXTENSION-COMMAND-EVENT-STATE'?{...observed,handlerContext:(await runtimeContracts()).handlerContext}:observed;});}
  await evaluate('EXTENSION-REGISTRATION-COLLISION-TYPES',()=>{
    const R=Akari.createAkariRuntime({extensions:auditDefinitions}),host=R.extensions;let duplicateRejected=false,invalidNumberRejected=false,promiseCalculationRejected=false;
    try{host.register(auditDefinitions[0].manifest,auditDefinitions[0].factory);}catch(error){duplicateRejected=error?.code==='E702'&&error.message==='起動設定の確定後は拡張を登録できません';}host.beginSession();try{host.invokeCalculation('demo.offline/double',['wrong']);}catch(error){invalidNumberRejected=error?.code==='E705'&&error.message==='かくちょうの 中身の しゅるいか たんいが 合いません';}host.endSession();
    const manifest=structuredClone(auditDefinitions[0].manifest);manifest.id='audit.promise';delete manifest.name;manifest.commands=[];manifest.events=[];manifest.calculations=[manifest.calculations[0]];
    const other=Akari.createAkariRuntime({extensions:[{manifest,factory:()=>({calculations:{double:()=>Promise.resolve(1)}})}]}).extensions;other.beginSession();try{other.invokeCalculation('audit.promise/double',[1]);}catch(error){promiseCalculationRejected=error?.code==='E705'&&error.message==='同期の拡張処理はPromiseを返せません';}other.endSession();
    // An extension written for the earlier contract (standard 3/3) is refused, with the product's contract as the control.
    const older=structuredClone(auditDefinitions[0].manifest);older.id='audit.older';delete older.name;older.standard={languageContractId:Akari.EXECUTABLE_CONTRACT.languageContractId-1,runtimeContractId:Akari.EXECUTABLE_CONTRACT.runtimeContractId-1};
    let olderStandardRejected=null;try{Akari.createAkariRuntime({extensions:[{manifest:older,factory:auditDefinitions[0].factory}]});olderStandardRejected='accepted';}catch(e){olderStandardRejected=e.code||e.message;}
    const current=structuredClone(older);current.standard={languageContractId:Akari.EXECUTABLE_CONTRACT.languageContractId,runtimeContractId:Akari.EXECUTABLE_CONTRACT.runtimeContractId};const currentStandardAccepted=Akari.createAkariRuntime({extensions:[{manifest:current,factory:auditDefinitions[0].factory}]}).extensions.requirements().required.length===1;
    return{duplicateRejected,invalidNumberRejected,promiseCalculationRejected,olderStandardRejected,currentStandardAccepted};
  });
  await evaluate('EXTENSION-INDEPENDENT-CALCULATIONS',()=>{const host=Akari.createAkariRuntime({extensions:auditDefinitions}).extensions;host.beginSession();const doubled=host.invokeCalculation('demo.offline/double',[7]),shouted=host.invokeCalculation('demo.text/shout',['hello']);host.endSession();return{doubled,shouted,independent:host.requirements().required.length===2};});
  await evaluate('EXTENSION-COMMAND-EVENT-STATE',async()=>{const host=Akari.createAkariRuntime({extensions:auditDefinitions}).extensions,events=[];host.beginSession({onEvent:e=>events.push(e)});const remembered=await host.invokeCommand('demo.offline/remember',[9]),value=host.invokeCalculation('demo.offline/remembered',[]),state=host.snapshotState();host.endSession();host.restoreState(state);host.beginSession();const restored=host.invokeCalculation('demo.offline/remembered',[]);host.endSession();return{remembered,value,event:events[0].payload,restored};});
  await evaluate('EXTENSION-SESSION-CANCELLATION',async()=>{
    let captured,resolve;const manifest=structuredClone(auditDefinitions[0].manifest);manifest.id='audit.cancel';delete manifest.name;manifest.calculations=[];manifest.events=[];manifest.commands[0].async=true;
    const host=Akari.createAkariRuntime({extensions:[{manifest,factory:api=>{captured=api;return{commands:{remember:()=>new Promise(r=>{resolve=r;})}};}}]}).extensions;
    host.beginSession();const pending=host.invokeCommand('audit.cancel/remember',[1]).then(()=>false,error=>error?.code==='E706'&&error.message==='拡張の処理を取り消しました');host.endSession();resolve(1);let staleRejected=false;try{captured.setState({value:99});}catch(error){staleRejected=error?.code==='E706'&&error.message==='拡張の実行sessionは終了しています';}return{staleRejected,signalAborted:captured.signal.aborted,ended:await pending};
  });
  await evaluate('EXTENSION-LANGUAGE-BLOCK-ROUNDTRIP',()=>{
    const A=Akari,p=A.makeDefaultProject(),symbols=A.buildSymbols(p),expression=A.parseExpression('拡張計算「demo.offline」「double」（7）',symbols),decoded=A.blockDecode(A.blockEncode(expression).tree);assertEq(A.astEquivalent(expression,decoded),true);
    const host=A.extensions;host.beginSession();const runtime=new A.RuntimeModel(p,{}),ctx={runtime,runtimeId:p.components[0].id,compiled:A.compileProject(p)};const value=A.evalExpression(expression,ctx);const ast=A.parseScript('拡張「demo.offline」「remember」（9）。',symbols,{targetId:p.components[0].id,event:'start'}),roundtrip=A.blockDecode(A.blockEncode(ast).tree);const equivalent=A.astEquivalent(ast,roundtrip)&&A.astEquivalent(expression,decoded);const commandValue=host.invokeCommand('demo.offline/remember',[9]);host.endSession();return{equivalent,value,commandValue};function assertEq(a,b){if(a!==b)throw Error('AST inequality');}
  });
  await evaluate('EXTENSION-DERIVED-SAVE-RESTORE',async()=>{
    const A=Akari,p=A.makeEmptyProject();p.name='Extension save';p.scripts=[{id:'extension-save',targetId:'stage',event:'start',source:'拡張「demo.offline」「remember」（9）。'}];const file=A.serializeProject(p,A.makeDefaultAssetStore()),loaded=await A.parseProjectFile(file);globalThis.auditSaved=file;
    // The record names the extensions the work uses (with what they depend on), not every registered one: a work that
    // uses none records none, and opens where those extensions are not registered.
    const recorded=text=>JSON.parse(text.slice(text.lastIndexOf('```json')+7,text.lastIndexOf('```'))).extensions?.required.map(x=>x.id)??null;
    const plain=A.makeEmptyProject();plain.scripts=[{id:'plain-save',targetId:'stage',event:'start',source:'「やあ」と言う。'}];
    const profilePreserved=file.includes(A.profiles.requirement().contentHash),extensionsPreserved=A.extensions.requirements().required.length>1&&JSON.stringify(recorded(file))==='["demo.offline"]'&&
      JSON.stringify(recorded(A.serializeProject(plain,A.makeDefaultAssetStore())))==='[]',sourcePreserved=loaded.project.scripts[0].source===p.scripts[0].source;
    const wrong=file.replace(A.extensions.requirements(['demo.offline']).required[0].contentHash,'0'.repeat(64));let unavailableRejected=false;try{await A.parseProjectFile(wrong);}catch(error){unavailableRejected=error?.code==='E703'&&error.message==='必要な拡張「demo.offline」の版・内容が一致しません';}return{profilePreserved,extensionsPreserved,sourcePreserved,unavailableRejected};
  });
  await evaluate('EXTENSION-PROFILE-COUNT-CAPACITY-ROUNDTRIP',async()=>{
    const A=Akari,p=A.makeEmptyProject(),base=A.makeDefaultProject().components[0];p.scripts=[];p.components=Array.from({length:501},(_,i)=>({...structuredClone(base),id:'bound-'+i,name:'部品'+i,costumes:[{id:'cost-'+i,name:'姿',kind:'text',value:'●'}],costumeId:'cost-'+i}));p.projectData.variables=[{id:'large-text',name:'長文',initialValue:'a'.repeat(100001)}];A.validateDesignProject(p);
    const file=A.serializeProject(p,A.makeDefaultAssetStore()),loaded=await A.parseProjectFile(file);let finiteRejected=false,integrityRejected=false;const excess=structuredClone(p);excess.components.push({...structuredClone(base),id:'bound-extra',name:'余分'});try{A.validateDesignProject(excess);}catch(error){finiteRejected=error?.code==='F504'&&error.message==='部品の 数が 多すぎます';}const corrupt=structuredClone(p);corrupt.components[1].id=corrupt.components[0].id;try{A.validateDesignProject(corrupt);}catch(error){integrityRejected=error?.code==='F505'&&error.message==='ID「bound-0」が 2つ いじょう あります';}
    return{components:loaded.project.components.length,chars:loaded.project.projectData.variables[0].initialValue.length,finiteRejected,restored:loaded.project.components.length===501,integrityRejected};
  });
  await evaluate('EXTENSION-TYPES-UNITS-DEPENDENCIES',()=>{
    const manifest=structuredClone(auditDefinitions[0].manifest);manifest.id='audit.units';delete manifest.name;manifest.commands=[];manifest.events=[];manifest.calculations=[manifest.calculations[0]];manifest.calculations[0].id='identity';manifest.calculations[0].args[0].unit='秒';manifest.calculations[0].returns.unit='秒';
    const R=Akari.createAkariRuntime({extensions:[{manifest,factory:()=>({calculations:{identity:args=>args[0]}})}]}),host=R.extensions;host.beginSession();const result=host.invokeCalculation('audit.units/identity',[{magnitude:3,unit:'秒'}]);let unitRejected=false;try{host.invokeCalculation('audit.units/identity',[{magnitude:3,unit:'歩'}]);}catch(error){unitRejected=error?.code==='E705'&&error.message==='かくちょうの 中身の しゅるいか たんいが 合いません';}host.endSession();
    const dependency=structuredClone(auditDefinitions[1].manifest);dependency.id='audit.dependency';delete dependency.name;dependency.dependencies=[{id:'missing.extension',version:'1.0.0',contentHash:'0'.repeat(64)}];let dependencyRejected=false;try{Akari.createAkariRuntime({extensions:[{manifest:dependency,factory:auditDefinitions[1].factory}]});}catch(error){dependencyRejected=error?.code==='E703'&&error.message==='必要な拡張「missing.extension」の版・内容が一致しません';}
    const required=host.requirements();required.required[0].version='2.0.0';let versionRejected=false;try{host.validateRequirements(required);}catch(error){versionRejected=error?.code==='E703'&&error.message==='必要な拡張「audit.units」の版・内容が一致しません';}
    let stateMismatchRejected=false;try{host.restoreState([{id:'audit.units',formatVersion:99,value:{value:0}}]);}catch(error){stateMismatchRejected=error?.code==='E703'&&error.message==='拡張状態の版が一致しません';}
    for(const source of ['拡張計算「demo.offline」「double」（「文字」）を言う。','拡張計算「demo.offline」「double」（1、2）を言う。','拡張の値を言う。']){const p=Akari.makeEmptyProject();p.scripts[0].source=source;if(!Akari.compileProject(p).errors.length)throw Error('Invalid extension source accepted: '+source);}
    const invalidFunction=Akari.makeEmptyProject();invalidFunction.functions=[{id:'bad-extension-function',ownerId:'stage',name:'不正な計算',args:[],source:'拡張「demo.offline」「remember」（9）。\n1を答えとして返す。'}];if(!Akari.compileProject(invalidFunction).errors.length)throw Error('Extension command accepted inside synchronous function');
    return{unitPreserved:result.magnitude===3&&result.unit==='秒',unitRejected,dependencyRejected,versionRejected,stateMismatchRejected};
  });
  await evaluate('EXTENSION-STATE-LIFETIME',()=>{
    const project=structuredClone(auditDefinitions[0].manifest),run=structuredClone(project);run.id='audit.run-state';delete run.name;delete run.state.persist;run.commands[0].name='一回だけ記憶する';run.calculations=run.calculations.map(c=>({...c,name:'一回だけ'+c.name}));run.events=run.events.map(e=>({...e,name:'一回だけ'+e.name}));
    const definitions=[{manifest:project,factory:auditDefinitions[0].factory},{manifest:run,factory:auditDefinitions[0].factory}];
    const host=Akari.createAkariRuntime({extensions:definitions}).extensions,read=()=>[host.invokeCalculation('audit.run-state/remembered',[]),host.invokeCalculation('demo.offline/remembered',[])];
    host.beginSession();host.invokeCommand('audit.run-state/remember',[7]);host.invokeCommand('demo.offline/remember',[7]);const during=host.snapshotState();host.endSession();
    host.beginSession();const [runRestart,projectRestart]=read();host.endSession();
    host.restoreState([{id:'demo.offline',formatVersion:1,value:{value:5}},{id:'audit.run-state',formatVersion:1,value:{value:5}}]);host.beginSession();const [runRestored,projectRestored]=read();
    let resetDuringRunRejected=false;try{host.resetState();}catch(error){resetDuringRunRejected=error.code==='E706';}host.endSession();
    host.resetState();host.beginSession();const projectReset=read()[1];host.endSession();
    const defaultLifetime=host.stateInfo().find(x=>x.id==='audit.run-state').persist;
    const invalid=structuredClone(run);invalid.id='audit.invalid-state';delete invalid.name;invalid.state.persist='forever';invalid.commands=[];invalid.calculations=[];let invalidLifetimeRejected=false;try{Akari.createAkariRuntime({extensions:[{manifest:invalid,factory:()=>({})}]});}catch(error){invalidLifetimeRejected=error?.code==='E701'&&error.message==='拡張の登録情報が不正です';}
    return{runRestart,projectRestart,runSnapshot:during.find(x=>x.id==='audit.run-state').value.value,projectSnapshot:during.find(x=>x.id==='demo.offline').value.value,runRestored,projectRestored,projectReset,resetDuringRunRejected,defaultLifetime,invalidLifetimeRejected};
  });
  await evaluate('EXTENSION-JAPANESE-NAMES',()=>{
    const A=Akari,p=A.makeDefaultProject(),symbols=A.buildSymbols(p),opts={targetId:p.components[0].id,event:'start'};
    const named=A.parseScript('拡張「数の記憶」「数を記憶する」（9）。',symbols,opts),byId=A.parseScript('拡張「demo.offline」「remember」（9）。',symbols,opts),mixed=A.parseScript('拡張「demo.offline」「数を記憶する」（9）。',symbols,opts);
    const calculation=A.parseExpression('拡張計算「demo.offline」「double」（7）',symbols);
    let unknownRejected=false;try{A.parseScript('拡張「数の記憶」「ない命令」（9）。',symbols,opts);}catch(error){unknownRejected=error.code==='E703';}
    const base=auditDefinitions[1].manifest,rejected=(change,message)=>{const m=structuredClone(base);m.id='audit.names';delete m.name;m.calculations[0].name='名前の検査用';change(m);try{A.createAkariRuntime({extensions:[auditDefinitions[1],{manifest:m,factory:auditDefinitions[1].factory}]});return false;}catch(error){return error?.code==='E702'&&error.message===message;}};
    return{sameAst:A.astEquivalent(named,byId),mixedAst:A.astEquivalent(mixed,byId),printedCommand:A.formatScript(byId).replace(/。\s*$/,''),printedCalculation:A.formatExpression(calculation),
      idsStillRead:byId.units?.length>0||!!byId,unknownRejected,duplicateNameRejected:rejected(m=>{m.name=base.name;},'拡張のIDまたは日本語名が重複しています'),nameClashesWithIdRejected:rejected(m=>{m.name='demo.text';},'拡張のIDまたは日本語名が重複しています'),invalidNameRejected:rejected(m=>{m.name='名前「かっこ」';},'拡張の日本語名が不正です'),
      operationNamedAsOtherIdRejected:rejected(m=>{m.calculations.push({...structuredClone(m.calculations[0]),id:'other',name:m.calculations[0].id});},'拡張の識別子・名前が不正または重複しています')};
  });
  await evaluate('EXTENSION-VERSION-UPGRADE',()=>{
    const current=structuredClone(auditDefinitions[0].manifest);current.id='audit.upgrade';delete current.name;current.version='1.2.0';delete current.name;current.commands[0].name='更新用に記憶する';current.calculations=current.calculations.map(c=>({...c,name:'更新用の'+c.name}));current.events=[];
    const host=Akari.createAkariRuntime({extensions:[{manifest:current,factory:auditDefinitions[0].factory}]}).extensions,now=host.requirements();
    const envelope=(version,hash='1'.repeat(64),formatVersion=1)=>({...structuredClone(now),required:[{id:'audit.upgrade',version,contentHash:hash}],state:[{id:'audit.upgrade',formatVersion,value:{value:4}}]});
    const rejects=value=>{try{host.upgradeRequirements(value);return false;}catch(error){return error.code==='E703';}};
    const plan=host.upgradeRequirements(envelope('1.0.0'));let validates=false;try{validates=host.validateRequirements(plan.envelope);}catch(_){}
    // A broken record (an entry that is no object, a version that is no text) is refused as a record (E703), not by a TypeError.
    const withNull={...envelope('1.0.0'),required:[envelope('1.0.0').required[0],null]};
    const linked=Akari.createAkariExtensionHost({}),manifest=(id,dependencies)=>({id,version:'1.0.0',apiContract:1,standard:structuredClone(linked.standard),description:'依存の検査',dependencies,capabilities:[],offline:true,selfContained:true,state:{formatVersion:1,initial:null},commands:[],calculations:[],events:[]});
    const base=linked.register(manifest('audit.base',[]),()=>({}));linked.register(manifest('audit.linked',[base]),()=>({}));
    const recorded=linked.requirements(),validateRejects=value=>{try{linked.validateRequirements(value);return false;}catch(error){return error.code==='E703';}};
    return{upgraded:plan.upgrades.map(x=>x.from+'→'+x.to).join(),validates,stateKept:plan.envelope.state[0].value,sameVersionChangedRejected:rejects(envelope('1.2.0')),
      newerRecordedRejected:rejects(envelope('1.3.0')),otherMajorRejected:rejects(envelope('0.9.0')),prereleaseRejected:rejects(envelope('1.0.0-beta')),stateFormatRejected:rejects(envelope('1.0.0','1'.repeat(64),2)),
      nullEntryRejected:rejects(withNull),listVersionRejected:rejects(envelope(['1.0.0'])),
      nullBesideDependentRejected:validateRejects({...recorded,required:[recorded.required.find(x=>x.id==='audit.linked'),null]}),
      // A build record (+…) does not make a release newer or older (EXTENSIONS.md 版の決まり): it upgrades as the release does.
      ...(()=>{const page=globalThis,built=page.Akari.createAkariRuntime({extensions:[{manifest:{...current,version:'1.2.0+build.7'},factory:page.auditDefinitions[0].factory}]}).extensions,
        tried=(h,value)=>{try{return h.upgradeRequirements(value).upgrades.map(x=>x.from+'→'+x.to).join();}catch(error){return error.code;}};
        return{buildRecorded:tried(host,envelope('1.0.0+build.3')),buildCurrent:tried(built,envelope('1.0.0')),sameReleaseBuildRejected:rejects(envelope('1.2.0+build.1'))};})()};
  });
  await evaluate('EXTENSION-PROFILE-IMPORT-FILE-RUNTIME',async()=>{
    const A=Akari,p=A.makeEmptyProject();p.scripts[0].source='※'+'a'.repeat(100000);const file=A.serializeProject(p,A.makeDefaultAssetStore()),loaded=await A.parseProjectFile(file),R=A.createAkariRuntime();let listRejected=false;try{R.assertRuntimeValueLimit(Array(100001).fill(1));}catch(error){listRejected=error?.code==='R413'&&error.message==='リストが 長すぎます';}A.diagnostics.assertRuntimeValueLimit(Array(100001).fill(1));
    let capacityRejected=false;try{A.diagnostics.validateSerializedProjectStructure({...loaded.project,assets:Array(129).fill({})});}catch(error){capacityRejected=error?.code==='F504'&&error.message==='絵や音が 多すぎます。いらない 絵や音を けして ください';}
    return{sourceChars:loaded.project.scripts[0].source.length,parsed:loaded.diagnostics.length===0,runtimeList:100001,listRejected,capacityRejected};
  });
  await check('EXTENSION-GUI-HISTORY-AUTOSAVE',async()=>{
    assert.ok(fork);const page=fork.page,source='拡張計算「demo.offline」「double」（7）を言う。';await page.locator('#uiLevel').selectOption('advanced');if(await page.locator('#sourceOverview').isVisible())await page.locator('#sourceEditBtn').click();await chooseView(page,'code');await page.locator('#codeEditor').click();await page.locator('#codeEditor').press('ControlOrMeta+A');await page.keyboard.insertText(source);await page.waitForFunction(s=>Akari.app.editorState.main.sourceText===s,source);await page.waitForTimeout(400);
    const typed=await page.locator('#codeEditor').inputValue()===source;await chooseView(page,'blocks');const field=page.locator('#blockEditor .blockui-node[data-schema-id="NumberLiteral"] [data-blockui-field="value"]').first();await field.fill('8');await field.press('Enter');await page.waitForFunction(()=>Akari.app.editorState.main.sourceText.includes('（8）'));const blocks=await page.evaluate(()=>Akari.app.project.scripts.some(s=>s.source.includes('（8）')));await page.locator('#undoBtn').click();await page.waitForFunction(()=>Akari.app.editorState.main.sourceText.includes('（7）'));const undo=true;await page.locator('#redoBtn').click();await page.waitForFunction(()=>Akari.app.editorState.main.sourceText.includes('（8）'));const redo=true;await page.waitForTimeout(1800);await page.reload();await page.waitForFunction(()=>!!Akari.app);await page.locator('#recoveryModal').waitFor({state:'visible'});await page.locator('#recoveryRestore').click();await page.waitForFunction(()=>Akari.app.project.scripts.some(s=>s.source.includes('（8）')));const reloaded=true;await page.evaluate(install);return{typed,blocks,undo,redo,reloaded};
  });
  await check('EXTENSION-FAILED-IMPORT-PRESERVES-EDITOR',async()=>{
    assert.ok(fork);await chooseView(fork.page,'code');const source=await fork.page.locator('#codeEditor').inputValue()+'\n「未保存」と言う。';await fork.page.locator('#codeEditor').fill(source);await fork.page.waitForFunction(s=>Akari.app.editorState.main.sourceText===s,source);await fork.page.waitForTimeout(300);
    const before=await fork.page.evaluate(()=>{const s=Akari.app.editorState;return{source:s.main.sourceText,history:s.history,dirty:s.dirty};});assert.equal(before.dirty,true);
    const serialized=await fork.page.evaluate(()=>({file:Akari.serializeProject(Akari.app.project,Akari.makeDefaultAssetStore()),hash:Akari.extensions.requirements().required[0].contentHash}));const malformed=path.join(directory,'unavailable-extension.akari.md');fs.writeFileSync(malformed,serialized.file.replace(serialized.hash,'0'.repeat(64)));await fork.page.locator('#fileInput').setInputFiles(malformed);await productQuestionAnswered(fork.page);await fork.page.waitForTimeout(300);const after=await fork.page.evaluate(()=>{const s=Akari.app.editorState;return{source:s.main.sourceText,history:s.history,dirty:s.dirty};});return{source:before.source===after.source,history:before.history===after.history,dirty:before.dirty===after.dirty};
  });
  await check('EXTENSION-UPGRADE-OPEN-CONFIRM',async()=>{
    assert.ok(fork);const page=fork.page;
    const prepared=await page.evaluate(()=>{const file=Akari.serializeProject(Akari.app.project,Akari.makeDefaultAssetStore()),open='```json\n',start=file.lastIndexOf(open)+open.length,end=file.lastIndexOf('\n```'),text=file.slice(start,end),root=JSON.parse(text),indent=JSON.stringify(root,null,2)===text?2:undefined;
      const item=root.extensions.required.find(x=>x.id==='demo.offline');item.version='1.0.0';item.contentHash='1'.repeat(64);return{file:file.slice(0,start)+JSON.stringify(root,null,indent)+file.slice(end),source:Akari.app.editorState.main.sourceText};});
    const older=path.join(directory,'older-extension-release.akari.md');fs.writeFileSync(older,prepared.file);
    const messages=[];let acceptUpgrade=false;const onDialog=dialog=>{messages.push(dialog.message());return dialog.message().includes('前の バージョン')?(acceptUpgrade?dialog.accept():dialog.dismiss()):dialog.accept();};page.on('dialog',onDialog);
    const questionAnswered=()=>productQuestionAnswered(page);
    try{
      await page.locator('#fileInput').setInputFiles(older);await questionAnswered();await page.waitForTimeout(500);
      const kept=await page.evaluate(()=>Akari.app.editorState.main.sourceText);const asked=messages.some(m=>m.includes('前の バージョン'));
      acceptUpgrade=true;await page.locator('#fileInput').setInputFiles(older);await questionAnswered();await page.waitForFunction(version=>Akari.app.project.extensions?.required?.some(x=>x.id==='demo.offline'&&x.version===version),offline.manifest.version);
      const recordedVersion=await page.evaluate(()=>Akari.app.project.extensions.required.find(x=>x.id==='demo.offline').version);
      return{asked,namesVersions:messages.some(m=>m.includes('数の記憶')&&m.includes('1.0.0 → 1.2.1')),dismissedKeepsWork:kept===prepared.source,acceptedOpens:true,recordedVersion};
    }finally{page.off('dialog',onDialog);}
  });
  await evaluate('EXTENSION-ASYNC-PARALLEL-PAUSE-STOP',async()=>{
    const A=Akari,p=A.makeEmptyProject();p.scripts=[{id:'async-start',targetId:'sprite-1',event:'start',source:'拡張「audit.async」「remember」（9）。\n答えを言う。'},{id:'async-click',targetId:'sprite-1',event:'click',source:'「並行」と言う。'}];const compiled=A.compileProject(p);if(compiled.errors.length)throw Error(JSON.stringify(compiled.errors));
    const logs=[],runtime=new A.RuntimeModel(p,{}),scheduler=new A.EventScheduler(p,compiled,runtime,{say:(_,v)=>logs.push(v),runtimeError:(_,e)=>{throw e;}});scheduler.start();await new Promise(r=>setTimeout(r,30));scheduler.spawnForRuntime('sprite-1','click',{});await new Promise(r=>setTimeout(r,30));const parallel=logs.includes('並行');scheduler.pause();await new Promise(r=>setTimeout(r,320));const paused=!logs.includes('9');scheduler.resume();await new Promise(r=>setTimeout(r,60));const resumed=logs.includes('9');scheduler.stop();scheduler.start();await new Promise(r=>setTimeout(r,30));const before=logs.length;scheduler.stop();await new Promise(r=>setTimeout(r,330));
    const q=A.makeEmptyProject();q.scripts=[{id:'reject-start',targetId:'sprite-1',event:'start',source:'「まえ」と言う。\n拡張「audit.async」「fail」（1）。\n「つづいた」と言う。'}];const failing=A.compileProject(q);if(failing.errors.length)throw Error(JSON.stringify(failing.errors));
    const said=[],codes=[],third=new A.EventScheduler(q,failing,new A.RuntimeModel(q,{}),{say:(_,v)=>said.push(v),runtimeError:(_,e)=>codes.push(e.code)});third.start();await new Promise(r=>setTimeout(r,120));third.stop();
    return{parallel,paused,resumed,stopped:!scheduler.running,lateIgnored:logs.length===before,rejectedWithoutReason:{said,codes}};
  });
  await evaluate('EXTENSION-COOPERATIVE-FUNCTION-BUDGET',async()=>{
    const A=Akari,p=A.makeEmptyProject();p.functions=[{id:'long-function',ownerId:'stage',name:'大計算',args:[],source:'この中だけで使う変数【合計】を作り、最初は0にする。\n60000回くり返す。\n  合計に1を足す。\n合計を答えとして返す。'}];p.scripts=[{id:'long-start',targetId:'sprite-1',event:'start',source:'【大計算】で求めた答えを言う。'}];const compiled=A.compileProject(p);if(compiled.errors.length)throw Error(JSON.stringify(compiled.errors));const standard=A.createAkariRuntime(),standardModel=new standard.RuntimeModel(p,{});let standardRejected=false;try{standard.runUserFunction('大計算',[],{runtime:standardModel,runtimeId:'sprite-1',compiled});}catch(e){standardRejected=e.code==='R409';}
    const logs=[],runtime=new A.RuntimeModel(p,{}),scheduler=new A.EventScheduler(p,compiled,runtime,{say:(_,v)=>logs.push(v),runtimeError:(_,e)=>{throw e;}});scheduler.start();let tick=false;setTimeout(()=>{tick=true;},10);const deadline=performance.now()+8000;while(!logs.includes('60000')&&performance.now()<deadline)await new Promise(r=>setTimeout(r,20));const overStandard=logs.includes('60000'),responsive=tick;scheduler.stop();p.functions[0].source=p.functions[0].source.replace('60000回','1000000回');const long=A.compileProject(p),second=new A.EventScheduler(p,long,new A.RuntimeModel(p,{}),{say:()=>{},runtimeError:(_,e)=>{throw e;}});second.start();await new Promise(r=>setTimeout(r,30));second.stop();
    const delay=ms=>new Promise(r=>setTimeout(r,ms));
    // Removing the software repeat maximum cannot make an unsafe JS integer
    // count executable: decrementing 2^53 otherwise loses forward progress.
    const unlimitedRepeat=A.createAkariRuntime({profiles:[{id:'audit.repeat',version:'1.0.0',limits:{repeatCount:null}}],profile:{id:'audit.repeat',version:'1.0.0'}}),unsafe=A.makeEmptyProject();unsafe.scripts=[{id:'unsafe-repeat',targetId:'sprite-1',event:'start',source:'9007199254740992回くり返す。\n  「実行してはいけない」を言う。'}];const unsafeCompiled=A.compileProject(unsafe);if(unsafeCompiled.errors.length)throw Error(JSON.stringify(unsafeCompiled.errors));const unsafeErrors=[],unsafeLogs=[],unsafeScheduler=new unlimitedRepeat.EventScheduler(unsafe,unsafeCompiled,new unlimitedRepeat.RuntimeModel(unsafe,{}),{say:(_,v)=>unsafeLogs.push(v),runtimeError:(_,e)=>unsafeErrors.push(e.code)});try{unsafeScheduler.start();await delay(50);}finally{unsafeScheduler.stop();}if(unlimitedRepeat.LIMITS.repeatCount!==Infinity||unsafeErrors.join(',')!=='R413'||unsafeLogs.length)throw Error('Unsafe integer repeat count must reject R413 even with unlimited policy');
    async function run(source,additional=[]){const p=A.makeEmptyProject();p.projectData.variables=[{id:'counter',name:'回数',initialValue:0}];p.functions=[{id:'identity',ownerId:'stage',name:'現在',args:['値'],source:'値を答えとして返す。'}];p.scripts=[{id:'recurring-start',targetId:'sprite-1',event:'start',source},...additional];const c=A.compileProject(p);if(c.errors.length)throw Error(JSON.stringify(c.errors));const errors=[],logs=[],runtime=new A.RuntimeModel(p,{}),q=new A.EventScheduler(p,c,runtime,{say:(_,v)=>logs.push(v),runtimeError:(_,e)=>errors.push(e.message)});q.start();return{q,runtime,logs,errors};}
    const recurring=await run('【現在】（回数）が3より小さいあいだ、くり返す。\n  回数を1増やす。\n回数を言う。');await delay(100);recurring.q.stop();if(recurring.logs.join(',')!=='3'||recurring.runtime.projectVars.get('回数')!==3||recurring.errors.length)throw Error('Cooperative RepeatWhile did not reevaluate');
    const waiting=await run('【現在】（回数）が1以上になるまで待つ。\n「再開」を言う。',[{id:'parallel-update',targetId:'sprite-1',event:'start',source:'0.02秒待つ。\n回数を1にする。'}]);await delay(120);waiting.q.stop();if(waiting.logs.join(',')!=='再開'||waiting.errors.length)throw Error('Cooperative WaitUntil did not observe other event');
    // A count of presses whose number a function gives (〜が（【現在】（2））回おされるまで) is bound once, then counted
    // while it waits or repeats.
    const who=A.makeEmptyProject().components.find(c=>c.id==='sprite-1').name;
    for(const [kind,source] of [['WaitUntil',who+'が（【現在】（2））回おされるまで待つ。\n「数えた」を言う。'],['RepeatUntil',who+'が（【現在】（2））回おされるまで、くり返す。\n  何もしない。\n「数えた」を言う。']]){
      const counted=await run(source);await delay(40);for(let i=0;i<2;i++){counted.q.spawnForRuntime('sprite-1','click',{});await delay(40);}counted.q.stop();
      if(counted.logs.join(',')!=='数えた'||counted.errors.length)throw Error('Cooperative '+kind+' did not count the presses: '+JSON.stringify({logs:counted.logs,errors:counted.errors}));}
    const motion=await run('【現在】（回数）が0以上のあいだ、自分は右へ1秒に60歩の速さで動き続ける。',[{id:'motion-cancel',targetId:'sprite-1',event:'click',source:'ほかの実行をすべて止める。\n0.1秒待つ。\n回数を-1にする。\n0.1秒待つ。\n回数を0にする。'}]);
    async function state(expected){const until=performance.now()+2000;while(performance.now()<until){if([...motion.q.continuous.values()].some(c=>c.state===expected))return;await delay(5);}throw Error('Missing continuous state '+expected);}
    await state('ACTIVE');motion.q.spawnForRuntime('sprite-1','click',{});await state('CANCELLED_UNTIL_FALSE');await state('INACTIVE');await state('ACTIVE');motion.q.stop();if(motion.errors.length)throw Error(motion.errors.join(','));
    // A continuous predicate may itself call an offline extension; Stop must
    // advance motion while its extension session is still alive.
    const p2=A.makeEmptyProject();p2.scripts=[{id:'extension-motion',targetId:'sprite-1',event:'start',source:'拡張計算「demo.offline」「double」（1）が0以上のあいだ、自分は右へ1秒に60歩の速さで動き続ける。'}];const c2=A.compileProject(p2);if(c2.errors.length)throw Error(JSON.stringify(c2.errors));const errors=[],q2=new A.EventScheduler(p2,c2,new A.RuntimeModel(p2,{}),{runtimeError:(_,e)=>errors.push(e.message)});q2.start();await delay(25);q2.stop();if(errors.length)throw Error(errors.join(','));
    return{overStandard,responsive,stopped:!second.running&&second.tasks.size===0,standardRejected};
  });
  await check('EXTENSION-EVENT-LANGUAGE',async()=>{
    await standard.page.evaluate(()=>{let rejected=false;try{Akari.parseExpression('拡張「できごとの値」',Akari.buildSymbols(Akari.makeEmptyProject()));}catch(error){rejected=error?.code==='P201'&&error.message==='計算の「「できごとの値」」の ところが 読めません。書き方を たしかめて ください';}if(!rejected)throw Error('Standard editor accepted extension-only event sensor');});
    assert.ok(fork);const observed=await fork.page.evaluate(async()=>{
      const A=Akari,canonical='拡張「できごとの値」',bare='拡張の値を言う。';
      function variableRead(ast){const value=ast?.body[0]?.value;if(value?.kind!=='VariableRead'||value.name!=='拡張')throw Error('Existing variable read was shadowed by extension sensor');}
      for(const owner of ['project','component']){
        const project=A.makeEmptyProject(),record={id:'extension-name',name:'拡張',initialValue:7};
        if(owner==='project')project.projectData.variables=[record];else project.components.find(c=>c.id==='sprite-1').localData.variables=[record];
        project.scripts=[{id:'collision-'+owner,targetId:'sprite-1',event:'start',source:bare}];
        const symbols=A.buildSymbols(project),ctx={targetId:'sprite-1',event:'start'},ast=A.parseScript(bare,symbols,ctx);variableRead(ast);const compiled=A.compileProject(project);if(compiled.errors.length)throw Error(JSON.stringify(compiled.errors));
        const decoded=A.blockDecode(A.blockEncode(ast).tree);variableRead(decoded);if(!A.astEquivalent(ast,decoded))throw Error('Variable collision block conversion changed meaning');project.scripts[0].source=A.formatScript(decoded);variableRead(A.parseScript(project.scripts[0].source,symbols,ctx));if(A.compileProject(project).errors.length)throw Error('Formatted variable collision source no longer compiles');
        for(const source of ['【拡張】の値を言う。','（拡張）の値を言う。'])variableRead(A.parseScript(source,symbols,{targetId:'sprite-1',event:'start'}));
        const sensor=A.parseExpression(canonical,symbols),formatted=A.formatExpression(sensor);if(sensor.kind!=='SensorRead'||sensor.sensor!=='拡張の値'||formatted!==canonical||!A.astEquivalent(sensor,A.parseExpression(formatted,symbols)))throw Error('Explicit event sensor did not roundtrip with a variable collision');
      }
      const empty=A.makeEmptyProject(),symbols=A.buildSymbols(empty);
      for(const key of ['localNames','args','binders']){const ctx={targetId:'sprite-1',event:'start',[key]:['拡張']};variableRead(A.parseScript(bare,symbols,ctx));const expression=A.parseExpression('拡張の値',symbols,ctx);if(expression.kind!=='VariableRead'||expression.name!=='拡張')throw Error('Parser context variable was shadowed: '+key);}
      const sensor=A.parseExpression(canonical,symbols),formatted=A.formatExpression(sensor);if(sensor.kind!=='SensorRead'||sensor.sensor!=='拡張の値'||formatted!==canonical||!A.astEquivalent(sensor,A.parseExpression(formatted,symbols)))throw Error('Canonical event sensor did not roundtrip');
      const p=A.makeEmptyProject();p.scripts=[{id:'event-source',targetId:'sprite-1',event:'start',source:'拡張「demo.offline」「remember」（9）。'},{id:'event-target',targetId:'sprite-1',event:'message',filter:{message:'拡張:demo.offline/changed'},source:canonical+'を言う。'}];const compiled=A.compileProject(p);if(compiled.errors.length)throw Error(JSON.stringify(compiled.errors));const file=A.serializeProject(p,A.makeDefaultAssetStore()),loaded=await A.parseProjectFile(file),logs=[],scheduler=new A.EventScheduler(loaded.project,A.compileProject(loaded.project),new A.RuntimeModel(loaded.project,{}),{say:(_,v)=>logs.push(v),runtimeError:(_,e)=>{throw e;}});scheduler.start();await new Promise(r=>setTimeout(r,80));scheduler.stop();return{value:logs[0],compiled:true,saved:file.includes(canonical),restored:loaded.project.scripts[1].filter.message==='拡張:demo.offline/changed'};
    });
    return{...observed,eventLifetime:(await runtimeContracts()).eventLifetime};
  });
  await check('EXTENSION-OFFLINE-STANDALONE',async()=>{
    assert.ok(fork);const generated=await fork.page.evaluate(()=>{const p=Akari.makeEmptyProject();p.name='Independent extension player';p.scripts=[{id:'player-extension',targetId:'stage',event:'start',source:'拡張計算「demo.offline」「double」（7）を言う。'}];return Akari.generateStandaloneHtml(p,Akari.makeDefaultAssetStore());});player=path.join(directory,'player.html');fs.writeFileSync(player,generated);
    const context=await browser.newContext({offline:true}),page=await context.newPage(),requests=[],errors=[];page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(player).href);await page.locator('#playerStart').waitFor({state:'visible'});await page.locator('#playerStart').click();await page.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('14'));const value=await page.locator('#playerOutput').textContent();await context.close();
    // Export an external-capability work as well: loading is allowed, offline
    // calculation works, and the unconnected command gives a visible E707.
    assert.ok(externalDerived);const externalEditor=await pageAt(externalDerived),externalHtml=await externalEditor.page.evaluate(()=>{const p=Akari.makeEmptyProject();p.scripts=[{id:'external-player',targetId:'stage',event:'start',source:'拡張計算「demo.offline」「double」（7）を言う。\n拡張「audit.external」「remember」（7）。'}];return Akari.generateStandaloneHtml(p,Akari.makeDefaultAssetStore());});await externalEditor.context.close();const externalPlayer=path.join(directory,'external-player.html');fs.writeFileSync(externalPlayer,externalHtml);
    const externalContext=await browser.newContext({offline:true}),externalPage=await externalContext.newPage();externalPage.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});externalPage.on('pageerror',e=>errors.push(e.message));await externalPage.goto(pathToFileURL(externalPlayer).href);await externalPage.locator('#playerStart').waitFor({state:'visible'});assert.equal(await externalPage.locator('#playerStart').isEnabled(),true);await externalPage.locator('#playerStart').click();await externalPage.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('E707'));const externalLog=await externalPage.locator('#playerOutput').textContent();assert.ok(externalLog.includes('14')&&externalLog.includes('未接続'));await externalContext.close();
    return{independentContext:true,value:value.trim(),profilePreserved:generated.includes(profile.id),externalLoaded:true,unconnectedDiagnostic:true,offlineCalculation:true,httpRequests:requests.length,errors:errors.length};
  });
  // A work keeps the state of the extensions it was saved with. Opened where more extensions are registered, the others
  // start from their initial state: the work saves before it runs, and it never reads what another work left in the page.
  await check('EXTENSION-STATE-OF-UNRECORDED',async()=>{
    const fewer=await pageAt(fewerDerived),more=await pageAt(moreDerived);
    try{
      const run=([source,file])=>{const A=Akari,work=async()=>{if(!file){const p=A.makeEmptyProject();p.scripts=[{id:'s0',event:'start',source:'',targetId:p.components[0].id}];A.updateScriptSource(p.scripts[0],source,p);return {p,store:A.makeDefaultAssetStore()};}
          const opened=await A.parseProjectFile(file);let savedBeforeRun;try{A.serializeProject(opened.project,opened.assetStore);savedBeforeRun=true;}catch(error){savedBeforeRun=error.code||error.message;}
          A.updateScriptSource(opened.project.scripts[0],source,opened.project);return {p:opened.project,store:opened.assetStore,savedBeforeRun,recorded:opened.project.extensions.state.map(s=>s.id)};};
        return work().then(({p,store,savedBeforeRun,recorded})=>{const compiled=A.compileProject(p),said=[];let now=0;const r=new A.RuntimeModel(p,{});r.now=()=>now;
          const q=new A.EventScheduler(p,compiled,r,{say:(id,t)=>said.push(String(t))});q.schedule=()=>{};
          try{q.start();for(;now<20;now++){for(let i=0;i<50&&q.ready.length;i++)q.runTurn();q.recheckBlocked();}}finally{q.stop();}
          return {said,file:A.serializeProject(p,store),savedBeforeRun,recorded,afterRun:p.extensions.state.map(s=>[s.id,s.value.value])};});};
      // Another work in the page with more extensions leaves 100 in the other extension; the work saved with fewer keeps 5.
      await more.page.evaluate(run,['拡張「べつの記憶」「べつに記憶する」（100）。',null]);
      const saved=await fewer.page.evaluate(run,['拡張「数の記憶」「数を記憶する」（5）。',null]);
      const opened=await more.page.evaluate(run,['拡張計算「数の記憶」「記憶した数」（）を言う。\n拡張計算「べつの記憶」「べつに記憶した数」（）を言う。',saved.file]);
      return {recorded:opened.recorded,savedBeforeRun:opened.savedBeforeRun,said:opened.said,afterRun:opened.afterRun};
    }finally{for(const active of [fewer,more]){pageErrors.push(...active.errors);networkErrors.push(...active.requests,...active.sockets);await active.context.close();}}
  });
  // The derived product starts, and its page holds the factories' text, the manifest's text and the identities the build registered.
  await check('EXTENSION-FACTORY-TEXT-IN-PAGE',async()=>{
    const opened=await pageAt(carriedDerived);
    try{
      const page=await opened.page.evaluate(()=>({sources:Akari.extensions.exportDefinitions().map(x=>x.factorySource),required:Akari.extensions.requirements().required.map(x=>x.id+' '+x.contentHash),
        description:Akari.extensions.exportDefinitions()[0].manifest.description}));
      const units=text=>Array.from({length:text.length},(_,i)=>text.charCodeAt(i).toString(16)).join(' ');
      return {started:true,sameFactories:JSON.stringify(page.sources)===JSON.stringify(carried.slice(0,2)),sameIdentities:JSON.stringify(page.required)===JSON.stringify(carried[2]),
        sameDescription:units(page.description)===units(carriedDescription),errors:opened.errors.length};
    }finally{pageErrors.push(...opened.errors);networkErrors.push(...opened.requests,...opened.sockets);await opened.context.close();}
  });
  await check('EXTENSION-REAL-POPUP-MESSAGECHANNEL',async()=>{
    // The page sends the event of the example extension, and answers every capability it asks for.
    const page=fs.readFileSync('extensions/examples/connector.html','utf8'),said=key=>[...page.matchAll(new RegExp(key+":'([^']+)'",'g'))].map(m=>m[1]),supported=JSON.parse(page.match(/const supported = (\[[^\]]*\])/)[1].replace(/'/g,'"'));
    assert.deepEqual(said('extensionId'),[connector.manifest.id]);assert.deepEqual(said('eventId').filter(id=>!connector.manifest.events.some(e=>e.id===id)),[]);assert.deepEqual(connector.manifest.capabilities.filter(c=>!supported.includes(c)),[]);
    assert.ok(fork);const peer=path.join(directory,'peer.html');fs.copyFileSync('extensions/examples/connector.html',peer);
    const popupReady=fork.context.waitForEvent('page');await fork.page.evaluate(url=>{globalThis.auditPeer=window.open(url,'akari-audit-peer');},pathToFileURL(peer).href);const popup=await popupReady;await popup.waitForLoadState();
    await fork.page.evaluate(async()=>{const {manifest,factory}=auditConnector;const host=Akari.createAkariRuntime({extensions:[{manifest,factory}],allowedCapabilities:manifest.capabilities}).extensions,events=[];host.beginSession({onEvent:e=>events.push(e)});const connector=await host.connectWindow(auditPeer,{origin:'null',capabilities:manifest.capabilities,timeoutMs:5000});globalThis.auditConnection={host,connector,events,result:await connector.request('demo.add',[7,7])};});
    for(let i=0;i<9;i++)await popup.locator('#notify').click();await fork.page.waitForFunction(()=>auditConnection.events.length===9);
    const observed=await fork.page.evaluate(async()=>{const {host,connector,events,result}=auditConnection,handshake=connector.ready,notification=events.at(-1).payload;host.endSession();let staleRejected=false;try{await connector.request('demo.add',[7,7]);}catch(error){staleRejected=error?.code==='E706'&&error.message==='拡張の実行sessionは終了しています';}return{popup:!!auditPeer,handshake,result,notification,disconnected:!connector.ready,staleRejected};});await popup.waitForFunction(()=>document.querySelector('#status').textContent==='接続は終了しました'&&document.querySelector('#notify').disabled);await popup.close();return observed;
  });
  await check('EXTENSION-RPC-NEGATIVE-LIFECYCLE',async()=>{
    assert.ok(fork);await fork.context.addInitScript(()=>{window.rawPorts=[];window.inbound=[];window.addEventListener('message',event=>{for(const port of event.ports){rawPorts.push(port);port.addEventListener('message',e=>inbound.push(e.data));port.start();}});});
    const popupReady=fork.context.waitForEvent('page');await fork.page.evaluate(url=>{window.rpcPeer=window.open(url,'akari-rpc-adversarial-peer');},pathToFileURL(path.join(directory,'peer.html')).href);const popup=await popupReady;await popup.waitForLoadState();
    await fork.page.evaluate(async()=>{const {manifest:example,factory}=auditConnector,manifest=structuredClone(example);manifest.capabilities=['demo.add','demo.wait','demo.fail','demo.drop','demo.duplicate','demo.unknown','demo.event'];const host=Akari.createAkariRuntime({extensions:[{manifest,factory}],allowedCapabilities:manifest.capabilities}).extensions,events=[];host.beginSession({onEvent:e=>events.push(e)});const connector=await host.connectWindow(rpcPeer,{origin:'null',capabilities:manifest.capabilities,timeoutMs:3000});window.rpcTest={host,connector,events};});
    // Invalid JSON and signal options must fail synchronously before a
    // request timer/promise exists; a later bad batch item must allocate none.
    const invalidInbound=await popup.evaluate(()=>inbound.length);
    await fork.page.evaluate(()=>{window.rpcUnhandled=[];window.addEventListener('unhandledrejection',event=>rpcUnhandled.push({code:event.reason?.code,message:String(event.reason)}));const {connector}=rpcTest;
      function rejectsSync(fn,code){let rejected=false;try{fn();}catch(error){rejected=error.code===code;}if(!rejected)throw Error('Invalid connector input did not synchronously reject '+code);}
      rejectsSync(()=>connector.request('demo.drop',[NaN],{timeoutMs:20}),'E701');
      rejectsSync(()=>connector.batch([{method:'demo.drop',params:[71,29],timeoutMs:20},{method:'demo.drop',params:[NaN],timeoutMs:20}]),'E701');
      rejectsSync(()=>connector.request('demo.drop',[71,29],{signal:{},timeoutMs:20}),'E707');
      rejectsSync(()=>connector.request('demo.drop',[71,29],{timeoutMs:3e9}),'E707');
      rejectsSync(()=>connector.batch([{method:'demo.drop',params:[71,29],timeoutMs:20},{method:'demo.drop',params:[71,29],signal:{},timeoutMs:20}]),'E707');
    });await fork.page.waitForTimeout(80);assert.equal(await popup.evaluate(()=>inbound.length),invalidInbound,'Invalid input sent a request or leaked timeout cancellation');assert.deepEqual(await fork.page.evaluate(()=>rpcUnhandled),[],'Invalid input leaked an unhandled rejection');
    // A connection timeout longer than setTimeout keeps is refused, not ended at once.
    assert.match(await fork.page.evaluate(async()=>{try{await globalThis.rpcTest.host.connectWindow(globalThis.rpcPeer,{origin:'null',capabilities:['demo.add'],timeoutMs:3e9});return 'connected';}catch(e){return e.code+' '+e.message;}}),/^E707 .*2147483647/);
    await popup.evaluate(()=>{const p=rawPorts[0];p.postMessage([]);p.postMessage('{');p.postMessage({jsonrpc:'2.0'});p.postMessage({jsonrpc:'2.0',method:'unknown',id:'unknown-call'});p.postMessage({jsonrpc:'2.0',method:'unknown'});});
    await popup.waitForFunction(()=>inbound.some(v=>v.error?.code===-32600)&&inbound.some(v=>v.error?.code===-32700)&&inbound.some(v=>v.error?.code===-32601));
    const malformed=await popup.evaluate(()=>inbound.filter(v=>v.error?.code===-32600).length>=2&&inbound.some(v=>v.error?.code===-32700));
    const core=await fork.page.evaluate(async()=>{const {connector}=rpcTest;const duplicate=await connector.request('demo.duplicate',[2,4])===6&&await connector.request('demo.add',[1,2])===3,unknown=await connector.request('demo.unknown',[5,9])===14;let error=false,timeout=false,cancel=false;try{await connector.request('demo.fail',[]);}catch(e){error=e.rpc?.code===-32000;}try{await connector.request('demo.drop',[],{timeoutMs:20});}catch(e){timeout=e.code==='E707';}const controller=new AbortController(),pending=connector.request('demo.wait',[1,2],{signal:controller.signal});controller.abort();try{await pending;}catch(e){cancel=e.code==='E706';}return{duplicate,unknown,error,timeout,cancel};});
    await popup.locator('#notify').click();await fork.page.waitForFunction(()=>rpcTest.events.length===1);const info=await fork.page.evaluate(()=>({connectionId:rpcTest.connector.connectionId,sessionId:rpcTest.connector.sessionId}));
    await popup.evaluate(info=>{rawPorts[0].postMessage({jsonrpc:'2.0',method:'akari.event',params:{...info,sequence:1,extensionId:'demo.connector',eventId:'sample',payload:999}});rawPorts[0].postMessage({jsonrpc:'2.0',method:'akari.event',params:{...info,sessionId:'old-session',sequence:2,extensionId:'demo.connector',eventId:'sample',payload:999}});},info);await popup.locator('#notify').click();await fork.page.waitForFunction(()=>rpcTest.events.length===2);
    // An event received in order whose value is refused moves the order on: the next one in order is taken, connected.
    await popup.evaluate(info=>{const port=globalThis.rawPorts[0];for(const [sequence,payload] of [[3,'いち'],[4,44]])port.postMessage({jsonrpc:'2.0',method:'akari.event',params:{...info,sequence,extensionId:'demo.connector',eventId:'sample',payload}});},info);
    const refusedValueMovesOn=await fork.page.waitForFunction(()=>{const {events,connector}=globalThis.rpcTest;return events.length===3&&events[2].payload===44&&connector.ready;},null,{timeout:2000}).then(()=>true,()=>false);
    const oldSession=await fork.page.evaluate(async()=>{const {host,connector,events}=rpcTest;if(events.some(e=>e.payload===999)||events[1].payload!==2)return false;const pending=connector.request('demo.wait',[1,2]);host.endSession();try{await pending;}catch(e){return e.code==='E707'&&!connector.ready;}return false;});
    await popup.waitForFunction(info=>inbound.some(message=>message?.method==='akari.close'&&message.params?.connectionId===info.connectionId&&message.params?.sessionId===info.sessionId),info);await popup.waitForFunction(()=>document.querySelector('#status').textContent==='接続は終了しました');await fork.page.waitForTimeout(30);assert.deepEqual(await fork.page.evaluate(()=>rpcUnhandled),[],'Session end exposed stranded invalid-input requests');
    await fork.page.evaluate(async()=>{rpcTest.host.beginSession();rpcTest.second=await rpcTest.host.connectWindow(rpcPeer,{origin:'null',capabilities:['demo.add'],timeoutMs:3000});});const reconnect=await fork.page.evaluate(async()=>rpcTest.second.connectionId!==rpcTest.connector.connectionId&&await rpcTest.second.request('demo.add',[2,3])===5);
    const expectedReady=fork.context.waitForEvent('page');await fork.page.evaluate(()=>{window.expectedPeer=window.open('about:blank','akari-expected-peer');});const expected=await expectedReady;await expected.evaluate(()=>{window.seen=null;window.addEventListener('message',e=>{if(e.data?.method==='akari.probe')window.seen=e.data;});});
    const impostorReady=fork.context.waitForEvent('page');await fork.page.evaluate(()=>{window.impostorPeer=window.open('about:blank','akari-impostor-peer');});const unrelated=await impostorReady;
    await fork.page.evaluate(()=>{window.spoofResult=null;window.spoofPending=rpcTest.host.connectWindow(expectedPeer,{origin:'null',capabilities:['demo.add'],timeoutMs:700}).then(()=>{spoofResult='accepted';},e=>{spoofResult=e.code;});});await expected.waitForFunction(()=>!!window.seen);const probe=await expected.evaluate(()=>seen);await unrelated.evaluate(probe=>window.opener.postMessage({jsonrpc:'2.0',id:probe.id,result:{nonce:probe.params.nonce}},'*'),probe);await fork.page.waitForFunction(()=>spoofResult!==null);const impostor=await fork.page.evaluate(()=>spoofResult==='E707');
    await fork.page.evaluate(()=>rpcTest.host.endSession());await fork.page.waitForTimeout(30);assert.deepEqual(await fork.page.evaluate(()=>rpcUnhandled),[],'Transport cleanup leaked an unhandled rejection');await Promise.all([popup.close(),expected.close(),unrelated.close()]);return{malformed,...core,impostor,oldSession,reconnect,refusedValueMovesOn};
  });
  // The heading's 「いつ動く？」 offers the registered extension events by their Japanese names and writes the chosen
  // event's signal name (拡張:拡張ID/機能ID); the standard product, which registers none, offers no such choice.
  await check('EXTENSION-EVENT-HEADING-CHOICE',async()=>{
    assert.ok(fork);await answerProductConfirms(standard.page,true);
    const role=(page,name)=>page.locator('#blockEditor [data-blockui-structured-role="heading.'+name+'"]:visible');
    const open=async page=>{
      const file=await page.evaluate(()=>{const q=Akari.makeEmptyProject();q.name='heading-choice';q.scripts=[{id:'main',targetId:q.components[0].id,event:'start',source:'「来た」と言う。'}];return Akari.serializeProject(q,Akari.makeDefaultAssetStore());});
      await page.locator('#fileInput').setInputFiles({name:'heading-choice.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});await page.waitForFunction(()=>Akari.app.project.name==='heading-choice');
      await page.locator('#uiLevel').selectOption('basic');if(await page.locator('#sourceOverview').isVisible())await page.locator('#sourceEditBtn').click();
      await chooseView(page,'blocks');await page.waitForFunction(()=>document.body.dataset.editorMode==='blocks');
      await page.locator('#sourceHeadingBtn').click();await role(page,'event').selectOption('message');
      await page.locator('#blockEditor .blockui-heading-editor[open] .blockui-trigger-details > summary').click();await role(page,'filter.kind').selectOption('message');
    };
    await open(standard.page);const standardChoices=await role(standard.page,'filter.extension').count();
    await open(fork.page);const choices=await role(fork.page,'filter.extension').locator('option').evaluateAll(options=>options.map(option=>[option.value,option.textContent]));
    const label=role(fork.page,'filter.extension').locator('xpath=..').locator('.blockui-field-label'),shownLabel=await label.isVisible()?await label.textContent():null;
    await role(fork.page,'filter.extension').selectOption('拡張:demo.offline/changed');const written=await role(fork.page,'filter.value').inputValue();
    // えらばない empties the event's name; the event is then chosen again for the heading.
    await role(fork.page,'filter.extension').selectOption('');const cleared=await role(fork.page,'filter.value').inputValue();
    await role(fork.page,'filter.extension').selectOption('拡張:demo.offline/changed');
    await fork.page.locator('#blockEditor [data-blockui-action="heading-commit"]:visible').click();
    await fork.page.waitForFunction(()=>Akari.app.project.scripts[0]?.event==='message');
    const heading=await fork.page.evaluate(()=>({event:Akari.app.project.scripts[0].event,filter:Akari.app.project.scripts[0].filter}));
    return{standardChoices,choices,shownLabel,written,cleared,heading};
  });
  for(const active of [standard,fork].filter(Boolean)){pageErrors.push(...active.errors);networkErrors.push(...active.requests,...active.sockets);await active.context.close();}
}).catch(error=>{pageErrors.push(error.message);console.error(error.stack);});
for(const id of extensionFoundationIds)if(!results.has(id))results.set(id,{id,status:'FAIL',error:'Required check not executed'});
const artifactNames=['candidate.html','derived.html','player.html','peer.html','external-derived.html','external-player.html','meijin-derived.html','context-derived.html','context-async-player.html'].filter(name=>fs.existsSync(path.join(directory,name)));
const report={schema:'akari-extension-foundation-v1',status:[...results.values()].every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:inputs,
  provenance:{run:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'1'},
  environment:{platform:process.platform,browser:browserVersion,playwright:require('playwright/package.json').version},
  results:extensionFoundationIds.map(id=>results.get(id)),networkErrors,pageErrors,artifacts:artifactNames.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(directory,name)))}))};
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
if(report.status==='PASS')verifyExtensionFoundation(report,inputs,directory);else process.exitCode=1;
console.log('Extension foundation: '+[...results.values()].filter(r=>r.status==='PASS').length+'/'+extensionFoundationIds.length+' PASS');
