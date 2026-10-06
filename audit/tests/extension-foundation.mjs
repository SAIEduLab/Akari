import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { currentProductFile } from '../lib/product-path.cjs';
import { snapshot, sha } from '../lib/product-test-host.mjs';
import { loadApi } from '../browser/cases/audit-lib.cjs';
import { browserEnvironment } from '../lib/browser-environment.mjs';
import { extensionFoundationIds, extensionExpectedObservations, verifyExtensionFoundation } from '../lib/extension-foundation-contract.mjs';

const require = createRequire(import.meta.url), [browserPath, output, productOverride] = process.argv.slice(2);
assert.ok(browserPath && output, 'Usage: node extension-foundation.mjs <fixed browser> <new report.json>');
const directory = path.resolve(output).replace(/\.json$/, '.artifacts');
assert.ok(!fs.existsSync(directory), 'Use a fresh evidence directory'); fs.mkdirSync(directory,{recursive:true});
const product=productOverride||currentProductFile();
const inputs=snapshot(product), candidate=path.join(directory,'candidate.html');fs.copyFileSync(product,candidate);
const A=loadApi(fs.readFileSync(candidate,'utf8')), results=new Map(), pageErrors=[], networkErrors=[];
const plain=x=>JSON.parse(JSON.stringify(x));
async function check(id,fn){try{const observed=await fn();assert.deepEqual(observed,extensionExpectedObservations[id]);results.set(id,{id,status:'PASS',observed});}catch(error){results.set(id,{id,status:'FAIL',error:error.stack});console.error(id+': '+error.message);}}
const extras={executableBytes:64*1024*1024,logChars:100000,historyEntries:60,diagnosticsBytes:8388608};
const defaults=JSON.parse(fs.readFileSync('audit/fixtures/1.0.2-baseline-capabilities.json')).limits;
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
await check('EXTENSION-PROFILE-STRICT-REGISTRATION',()=>{
  const p=A.createAkariProfiles(A.profiles.standard),base={id:'audit.invalid',version:'1.0.0',limits:{}};
  const invalid=[{...base,extra:true},{...base,id:'akari.standard'},{...base,id:'INVALID'},{...base,version:'1'},
    {...base,limits:{unknown:1}},...[-1,0,NaN,Infinity,-Infinity,1.5,'2',true].map(v=>({...base,limits:{components:v}}))];
  invalid.push({...base,limits:new Date()}, {...base,[Symbol('extra')]:1}, Object.defineProperty({...base},'hidden',{value:1}));
  for(const definition of invalid)assert.throws(()=>p.register(definition));for(const key of guards)assert.throws(()=>p.register({...base,limits:{[key]:null}}));
  const def={id:'audit.hash',version:'1.0.0',limits:{sourceEach:200000,components:null}},registered=p.register(def);
  const canonical={id:def.id,version:def.version,limits:{components:null,sourceEach:200000}};
  assert.equal(registered.contentHash,crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex'));assert.throws(()=>p.register(def));
  return{invalidRejected:invalid.length,engineGuards:guards.length,duplicateRejected:true,canonicalHash:true};
});
await check('EXTENSION-PROFILE-HOST-REQUIREMENT',()=>{
  const p=A.createAkariProfiles(A.profiles.standard);p.register({id:'audit.selected',version:'1.0.0',limits:{components:501}});const q=p.select('audit.selected','1.0.0');assert.equal(p.validateRequirement(null),true);assert.equal(p.validateRequirement(q),true);
  assert.throws(()=>p.validateRequirement({...q,contentHash:'0'.repeat(64)}));assert.throws(()=>p.validateRequirement({...q,id:'audit.unknown'}));p.select('akari.standard','1');assert.throws(()=>p.validateRequirement(q));assert.equal(p.requirement(),null);
  return{standardAccepted:true,mismatchRejected:true,unknownRejected:true,wrongSelectionRejected:true,unchangedSelection:true};
});
await check('EXTENSION-PROFILE-RUNTIME-ISOLATION',()=>{
  const standard=A.createAkariRuntime(),derived=A.createAkariRuntime({profiles:[{id:'audit.count',version:'1.0.0',limits:{components:501}}],profile:{id:'audit.count',version:'1.0.0'}});
  assert.equal(standard.LIMITS.components,500);assert.equal(derived.LIMITS.components,501);assert.equal(A.LIMITS.components,500);
  return{standardComponents:500,derivedComponents:501,isolated:true};
});

// Exercise the public examples as an independent derived author would.
const {offline,text}=require('../../extensions/examples/offline.js');
const definitions=[offline,text];
const asyncManifest=structuredClone(offline.manifest);asyncManifest.id='audit.async';asyncManifest.commands[0].name='監査非同期記憶';asyncManifest.commands[0].async=true;asyncManifest.calculations=[];asyncManifest.events=[];
function asyncFactory(){return{commands:{remember:args=>new Promise(resolve=>setTimeout(()=>resolve(args[0]),300))}};}
const profile={id:'audit.derivative',version:'1.0.0',limits:{components:501,stringChars:null,sourceEach:null,sourceTotal:null,listItems:null,functionOps:null,fileBytes:null}};
const externalManifest=structuredClone(offline.manifest);externalManifest.id='audit.external';externalManifest.offline=false;externalManifest.capabilities=['demo.add'];externalManifest.commands[0].name='外部接続で数を記憶する';externalManifest.commands[0].async=true;externalManifest.commands[0].capability='demo.add';externalManifest.calculations=[];externalManifest.events=[];
function externalFactory(api){return{commands:{remember(args){if(!api.connector){const error=new Error('外部拡張のコネクタは未接続です');error.code='E707';throw error;}return api.connector.request('demo.add',args);}}};}
let derived,player,externalDerived;
try{const {buildDerivedProduct}=await import('../../extensions/build.mjs');derived=path.join(directory,'derived.html');await buildDerivedProduct({product:candidate,output:derived,extensions:[...definitions,{manifest:asyncManifest,factory:asyncFactory}],profiles:[profile],profile:{id:profile.id,version:profile.version},allowedCapabilities:[]});}catch(error){console.error('Derived product build: '+error.stack);}
try{const {buildDerivedProduct}=await import('../../extensions/build.mjs');externalDerived=path.join(directory,'external-derived.html');await buildDerivedProduct({product:candidate,output:externalDerived,extensions:[...definitions,{manifest:externalManifest,factory:externalFactory}],allowedCapabilities:['demo.add']});}catch(error){console.error('External derived product build: '+error.stack);}
const install=`globalThis.auditDefinitions=[{manifest:${JSON.stringify(offline.manifest)},factory:${offline.factory.toString()}},{manifest:${JSON.stringify(text.manifest)},factory:${text.factory.toString()}}];`;
// Ordinary local files use opaque origin "null". Do not change that contract
// with --allow-file-access-from-files, or mask requests with abort routes.
async function withOrdinaryFileBrowser(fn) {
  const browser=await require('playwright').chromium.launch({executablePath:browserPath,headless:true,timeout:15000,args:['--disable-background-networking']});let timer;
  try{return await Promise.race([fn(browser),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Extension foundation browser timeout')),240000);})]);}
  finally{clearTimeout(timer);await browser.close();}
}
await withOrdinaryFileBrowser(async browser=>{
  assert.equal(browser.version(),browserEnvironment.version);assert.equal(require('playwright/package.json').version,browserEnvironment.playwright);
  async function pageAt(file){const context=await browser.newContext();const page=await context.newPage();const requests=[],sockets=[],errors=[];page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});page.on('websocket',s=>sockets.push(s.url()));page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>!!globalThis.Akari?.app);return{context,page,requests,sockets,errors};}
  const standard=await pageAt(candidate),fork=derived?await pageAt(derived):null;
  if(fork)await fork.page.evaluate(install);
  await check('EXTENSION-STANDARD-NO-NETWORK',async()=>{await standard.page.locator('#runBtn').click();await standard.page.locator('#stopBtn').click();await standard.page.waitForTimeout(300);return{httpRequests:standard.requests.length,socketRequests:standard.sockets.length,errors:standard.errors.length,unblocked:true};});
  await check('EXTENSION-DERIVED-NO-NETWORK',async()=>{assert.ok(fork);await fork.page.locator('#runBtn').click();await fork.page.locator('#stopBtn').click();await fork.page.waitForTimeout(300);return{httpRequests:fork.requests.length,socketRequests:fork.sockets.length,errors:fork.errors.length,unblocked:true};});
  async function evaluate(id,fn){await check(id,async()=>{assert.ok(fork);return fork.page.evaluate(fn);});}
  await evaluate('EXTENSION-REGISTRATION-COLLISION-TYPES',()=>{
    const R=Akari.createAkariRuntime({extensions:auditDefinitions}),host=R.extensions;let duplicateRejected=false,invalidNumberRejected=false,promiseCalculationRejected=false;
    try{host.register(auditDefinitions[0].manifest,auditDefinitions[0].factory);}catch(_){duplicateRejected=true;}host.beginSession();try{host.invokeCalculation('demo.offline/double',['wrong']);}catch(_){invalidNumberRejected=true;}host.endSession();
    const manifest=structuredClone(auditDefinitions[0].manifest);manifest.id='audit.promise';manifest.commands=[];manifest.events=[];manifest.calculations=[manifest.calculations[0]];
    const other=Akari.createAkariRuntime({extensions:[{manifest,factory:()=>({calculations:{double:()=>Promise.resolve(1)}})}]}).extensions;other.beginSession();try{other.invokeCalculation('audit.promise/double',[1]);}catch(_){promiseCalculationRejected=true;}other.endSession();return{duplicateRejected,invalidNumberRejected,promiseCalculationRejected};
  });
  await evaluate('EXTENSION-INDEPENDENT-CALCULATIONS',()=>{const host=Akari.createAkariRuntime({extensions:auditDefinitions}).extensions;host.beginSession();const doubled=host.invokeCalculation('demo.offline/double',[7]),shouted=host.invokeCalculation('demo.text/shout',['hello']);host.endSession();return{doubled,shouted,independent:host.requirements().required.length===2};});
  await evaluate('EXTENSION-COMMAND-EVENT-STATE',async()=>{const host=Akari.createAkariRuntime({extensions:auditDefinitions}).extensions,events=[];host.beginSession({onEvent:e=>events.push(e)});const remembered=await host.invokeCommand('demo.offline/remember',[9]),value=host.invokeCalculation('demo.offline/remembered',[]),state=host.snapshotState();host.endSession();host.restoreState(state);host.beginSession();const restored=host.invokeCalculation('demo.offline/remembered',[]);host.endSession();return{remembered,value,event:events[0].payload,restored};});
  await evaluate('EXTENSION-SESSION-CANCELLATION',async()=>{
    let captured,resolve;const manifest=structuredClone(auditDefinitions[0].manifest);manifest.id='audit.cancel';manifest.calculations=[];manifest.events=[];manifest.commands[0].async=true;
    const host=Akari.createAkariRuntime({extensions:[{manifest,factory:api=>{captured=api;return{commands:{remember:()=>new Promise(r=>{resolve=r;})}};}}]}).extensions;
    host.beginSession();const pending=host.invokeCommand('audit.cancel/remember',[1]).then(()=>false,()=>true);host.endSession();resolve(1);let staleRejected=false;try{captured.setState({value:99});}catch(_){staleRejected=true;}return{staleRejected,signalAborted:captured.signal.aborted,ended:await pending};
  });
  await evaluate('EXTENSION-LANGUAGE-BLOCK-ROUNDTRIP',()=>{
    const A=Akari,p=A.makeDefaultProject(),symbols=A.buildSymbols(p),expression=A.parseExpression('拡張計算「demo.offline」「double」（7）',symbols),decoded=A.blockDecode(A.blockEncode(expression).tree);assertEq(A.astEquivalent(expression,decoded),true);
    const host=A.extensions;host.beginSession();const runtime=new A.RuntimeModel(p,{}),ctx={runtime,runtimeId:p.components[0].id,compiled:A.compileProject(p)};const value=A.evalExpression(expression,ctx);const ast=A.parseScript('拡張「demo.offline」「remember」（9）。',symbols,{targetId:p.components[0].id,event:'start'}),roundtrip=A.blockDecode(A.blockEncode(ast).tree);const equivalent=A.astEquivalent(ast,roundtrip)&&A.astEquivalent(expression,decoded);const commandValue=host.invokeCommand('demo.offline/remember',[9]);host.endSession();return{equivalent,value,commandValue};function assertEq(a,b){if(a!==b)throw Error('AST inequality');}
  });
  await evaluate('EXTENSION-DERIVED-SAVE-RESTORE',async()=>{
    const A=Akari,p=A.makeEmptyProject();p.name='Extension save';p.scripts=[{id:'extension-save',targetId:'stage',event:'start',source:'拡張「demo.offline」「remember」（9）。'}];const file=A.serializeProject(p,A.makeDefaultAssetStore()),loaded=await A.parseProjectFile(file);globalThis.auditSaved=file;
    const profilePreserved=file.includes(A.profiles.requirement().contentHash),extensionsPreserved=A.extensions.requirements().required.every(x=>file.includes(x.contentHash)),sourcePreserved=loaded.project.scripts[0].source===p.scripts[0].source;
    const wrong=file.replace(A.extensions.requirements().required[0].contentHash,'0'.repeat(64));let unavailableRejected=false;try{await A.parseProjectFile(wrong);}catch(_){unavailableRejected=true;}return{profilePreserved,extensionsPreserved,sourcePreserved,unavailableRejected};
  });
  await evaluate('EXTENSION-PROFILE-COUNT-CAPACITY-ROUNDTRIP',async()=>{
    const A=Akari,p=A.makeEmptyProject(),base=A.makeDefaultProject().components[0];p.scripts=[];p.components=Array.from({length:501},(_,i)=>({...structuredClone(base),id:'bound-'+i,name:'部品'+i,costumes:[{id:'cost-'+i,name:'姿',kind:'text',value:'●'}],costumeId:'cost-'+i}));p.projectData.variables=[{id:'large-text',name:'長文',initialValue:'a'.repeat(100001)}];A.validateDesignProject(p);
    const file=A.serializeProject(p,A.makeDefaultAssetStore()),loaded=await A.parseProjectFile(file);let finiteRejected=false,integrityRejected=false;const excess=structuredClone(p);excess.components.push({...structuredClone(base),id:'bound-extra',name:'余分'});try{A.validateDesignProject(excess);}catch(_){finiteRejected=true;}const corrupt=structuredClone(p);corrupt.components[1].id=corrupt.components[0].id;try{A.validateDesignProject(corrupt);}catch(_){integrityRejected=true;}
    return{components:loaded.project.components.length,chars:loaded.project.projectData.variables[0].initialValue.length,finiteRejected,restored:loaded.project.components.length===501,integrityRejected};
  });
  await evaluate('EXTENSION-TYPES-UNITS-DEPENDENCIES',()=>{
    const manifest=structuredClone(auditDefinitions[0].manifest);manifest.id='audit.units';manifest.commands=[];manifest.events=[];manifest.calculations=[manifest.calculations[0]];manifest.calculations[0].id='identity';manifest.calculations[0].args[0].unit='秒';manifest.calculations[0].returns.unit='秒';
    const R=Akari.createAkariRuntime({extensions:[{manifest,factory:()=>({calculations:{identity:args=>args[0]}})}]}),host=R.extensions;host.beginSession();const result=host.invokeCalculation('audit.units/identity',[{magnitude:3,unit:'秒'}]);let unitRejected=false;try{host.invokeCalculation('audit.units/identity',[{magnitude:3,unit:'歩'}]);}catch(_){unitRejected=true;}host.endSession();
    const dependency=structuredClone(auditDefinitions[1].manifest);dependency.id='audit.dependency';dependency.dependencies=[{id:'missing.extension',version:'1.0.0',contentHash:'0'.repeat(64)}];let dependencyRejected=false;try{Akari.createAkariRuntime({extensions:[{manifest:dependency,factory:auditDefinitions[1].factory}]});}catch(_){dependencyRejected=true;}
    const required=host.requirements();required.required[0].version='2.0.0';let versionRejected=false;try{host.validateRequirements(required);}catch(_){versionRejected=true;}
    let stateMismatchRejected=false;try{host.restoreState([{id:'audit.units',formatVersion:99,value:{value:0}}]);}catch(_){stateMismatchRejected=true;}
    for(const source of ['拡張計算「demo.offline」「double」（「文字」）を言う。','拡張計算「demo.offline」「double」（1、2）を言う。','拡張の値を言う。']){const p=Akari.makeEmptyProject();p.scripts[0].source=source;if(!Akari.compileProject(p).errors.length)throw Error('Invalid extension source accepted: '+source);}
    const invalidFunction=Akari.makeEmptyProject();invalidFunction.functions=[{id:'bad-extension-function',ownerId:'stage',name:'不正な計算',args:[],source:'拡張「demo.offline」「remember」（9）。\n1を答えとして返す。'}];if(!Akari.compileProject(invalidFunction).errors.length)throw Error('Extension command accepted inside synchronous function');
    return{unitPreserved:result.magnitude===3&&result.unit==='秒',unitRejected,dependencyRejected,versionRejected,stateMismatchRejected};
  });
  await evaluate('EXTENSION-PROFILE-IMPORT-FILE-RUNTIME',async()=>{
    const A=Akari,p=A.makeEmptyProject();p.scripts[0].source='※'+'a'.repeat(100000);const file=A.serializeProject(p,A.makeDefaultAssetStore()),loaded=await A.parseProjectFile(file),R=A.createAkariRuntime();let listRejected=false;try{R.assertRuntimeValueLimit(Array(100001).fill(1));}catch(_){listRejected=true;}A.diagnostics.assertRuntimeValueLimit(Array(100001).fill(1));
    let capacityRejected=false;try{A.diagnostics.validateSerializedProjectStructure({...loaded.project,assets:Array(129).fill({})});}catch(_){capacityRejected=true;}
    return{sourceChars:loaded.project.scripts[0].source.length,parsed:loaded.diagnostics.length===0,runtimeList:100001,listRejected,capacityRejected};
  });
  await check('EXTENSION-GUI-HISTORY-AUTOSAVE',async()=>{
    assert.ok(fork);const page=fork.page,source='拡張計算「demo.offline」「double」（7）を言う。';await page.locator('#uiLevel').selectOption('advanced');if(await page.locator('#sourceOverview').isVisible())await page.locator('#sourceEditBtn').click();await page.locator('#editorModecode').click();await page.locator('#codeEditor').click();await page.locator('#codeEditor').press('ControlOrMeta+A');await page.keyboard.insertText(source);await page.waitForFunction(s=>Akari.app.editorState.main.sourceText===s,source);await page.waitForTimeout(400);
    const typed=await page.locator('#codeEditor').inputValue()===source;await page.locator('#editorModeblocks').click();const field=page.locator('#blockEditor .blockui-node[data-schema-id="NumberLiteral"] [data-blockui-field="value"]').first();await field.fill('8');await field.press('Enter');await page.waitForFunction(()=>Akari.app.editorState.main.sourceText.includes('（8）'));const blocks=await page.evaluate(()=>Akari.app.project.scripts.some(s=>s.source.includes('（8）')));await page.locator('#undoBtn').click();await page.waitForFunction(()=>Akari.app.editorState.main.sourceText.includes('（7）'));const undo=true;await page.locator('#redoBtn').click();await page.waitForFunction(()=>Akari.app.editorState.main.sourceText.includes('（8）'));const redo=true;await page.waitForTimeout(1800);await page.reload();await page.waitForFunction(()=>!!Akari.app);await page.locator('#recoveryModal').waitFor({state:'visible'});await page.locator('#recoveryRestore').click();await page.waitForFunction(()=>Akari.app.project.scripts.some(s=>s.source.includes('（8）')));const reloaded=true;await page.evaluate(install);return{typed,blocks,undo,redo,reloaded};
  });
  await check('EXTENSION-FAILED-IMPORT-PRESERVES-EDITOR',async()=>{
    assert.ok(fork);await fork.page.locator('#editorModecode').click();const source=await fork.page.locator('#codeEditor').inputValue()+'\n「未保存」と言う。';await fork.page.locator('#codeEditor').fill(source);await fork.page.waitForFunction(s=>Akari.app.editorState.main.sourceText===s,source);await fork.page.waitForTimeout(300);
    const before=await fork.page.evaluate(()=>{const s=Akari.app.editorState;return{source:s.main.sourceText,history:s.history,dirty:s.dirty};});assert.equal(before.dirty,true);
    const serialized=await fork.page.evaluate(()=>({file:Akari.serializeProject(Akari.app.project,Akari.makeDefaultAssetStore()),hash:Akari.extensions.requirements().required[0].contentHash}));const malformed=path.join(directory,'unavailable-extension.akari.md');fs.writeFileSync(malformed,serialized.file.replace(serialized.hash,'0'.repeat(64)));await fork.page.locator('#fileInput').setInputFiles(malformed);await fork.page.waitForTimeout(300);const after=await fork.page.evaluate(()=>{const s=Akari.app.editorState;return{source:s.main.sourceText,history:s.history,dirty:s.dirty};});return{source:before.source===after.source,history:before.history===after.history,dirty:before.dirty===after.dirty};
  });
  await evaluate('EXTENSION-ASYNC-PARALLEL-PAUSE-STOP',async()=>{
    const A=Akari,p=A.makeEmptyProject();p.scripts=[{id:'async-start',targetId:'sprite-1',event:'start',source:'拡張「audit.async」「remember」（9）。\n答えを言う。'},{id:'async-click',targetId:'sprite-1',event:'click',source:'「並行」と言う。'}];const compiled=A.compileProject(p);if(compiled.errors.length)throw Error(JSON.stringify(compiled.errors));
    const logs=[],runtime=new A.RuntimeModel(p,{}),scheduler=new A.EventScheduler(p,compiled,runtime,{say:(_,v)=>logs.push(v),runtimeError:(_,e)=>{throw e;}});scheduler.start();await new Promise(r=>setTimeout(r,30));scheduler.spawnForRuntime('sprite-1','click',{});await new Promise(r=>setTimeout(r,30));const parallel=logs.includes('並行');scheduler.pause();await new Promise(r=>setTimeout(r,320));const paused=!logs.includes('9');scheduler.resume();await new Promise(r=>setTimeout(r,60));const resumed=logs.includes('9');scheduler.stop();scheduler.start();await new Promise(r=>setTimeout(r,30));const before=logs.length;scheduler.stop();await new Promise(r=>setTimeout(r,330));return{parallel,paused,resumed,stopped:!scheduler.running,lateIgnored:logs.length===before};
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
    const motion=await run('【現在】（回数）が0以上のあいだ、自分は画面の右へ1秒に60歩の速さで動き続ける。',[{id:'motion-cancel',targetId:'sprite-1',event:'click',source:'ほかの実行をすべて止める。\n0.1秒待つ。\n回数を-1にする。\n0.1秒待つ。\n回数を0にする。'}]);
    async function state(expected){const until=performance.now()+2000;while(performance.now()<until){if([...motion.q.continuous.values()].some(c=>c.state===expected))return;await delay(5);}throw Error('Missing continuous state '+expected);}
    await state('ACTIVE');motion.q.spawnForRuntime('sprite-1','click',{});await state('CANCELLED_UNTIL_FALSE');await state('INACTIVE');await state('ACTIVE');motion.q.stop();if(motion.errors.length)throw Error(motion.errors.join(','));
    // A continuous predicate may itself call an offline extension; Stop must
    // advance motion while its extension session is still alive.
    const p2=A.makeEmptyProject();p2.scripts=[{id:'extension-motion',targetId:'sprite-1',event:'start',source:'拡張計算「demo.offline」「double」（1）が0以上のあいだ、自分は画面の右へ1秒に60歩の速さで動き続ける。'}];const c2=A.compileProject(p2);if(c2.errors.length)throw Error(JSON.stringify(c2.errors));const errors=[],q2=new A.EventScheduler(p2,c2,new A.RuntimeModel(p2,{}),{runtimeError:(_,e)=>errors.push(e.message)});q2.start();await delay(25);q2.stop();if(errors.length)throw Error(errors.join(','));
    return{overStandard,responsive,stopped:!second.running&&second.tasks.size===0,standardRejected};
  });
  await check('EXTENSION-EVENT-LANGUAGE',async()=>{
    await standard.page.evaluate(()=>{let rejected=false;try{Akari.parseExpression('拡張「できごとの値」',Akari.buildSymbols(Akari.makeEmptyProject()));}catch(_){rejected=true;}if(!rejected)throw Error('Standard editor accepted extension-only event sensor');});
    assert.ok(fork);return fork.page.evaluate(async()=>{
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
  await check('EXTENSION-REAL-POPUP-MESSAGECHANNEL',async()=>{
    assert.ok(fork);const peer=path.join(directory,'peer.html');fs.copyFileSync('extensions/examples/connector.html',peer);
    const popupReady=fork.context.waitForEvent('page');await fork.page.evaluate(url=>{globalThis.auditPeer=window.open(url,'akari-audit-peer');},pathToFileURL(peer).href);const popup=await popupReady;await popup.waitForLoadState();
    await fork.page.evaluate(async()=>{const manifest=structuredClone(auditDefinitions[0].manifest);manifest.id='demo.connector';manifest.offline=false;manifest.commands=[];manifest.calculations=[];manifest.events[0].id='sample';manifest.capabilities=['demo.add','demo.event'];const host=Akari.createAkariRuntime({extensions:[{manifest,factory:()=>({})}],allowedCapabilities:manifest.capabilities}).extensions,events=[];host.beginSession({onEvent:e=>events.push(e)});const connector=await host.connectWindow(auditPeer,{origin:'null',capabilities:manifest.capabilities,timeoutMs:5000});globalThis.auditConnection={host,connector,events,result:await connector.request('demo.add',[7,7])};});
    for(let i=0;i<9;i++)await popup.locator('#notify').click();await fork.page.waitForFunction(()=>auditConnection.events.length===9);
    const observed=await fork.page.evaluate(async()=>{const {host,connector,events,result}=auditConnection,handshake=connector.ready,notification=events.at(-1).payload;host.endSession();let staleRejected=false;try{await connector.request('demo.add',[7,7]);}catch(_){staleRejected=true;}return{popup:!!auditPeer,handshake,result,notification,disconnected:!connector.ready,staleRejected};});await popup.waitForFunction(()=>document.querySelector('#status').textContent==='接続は終了しました'&&document.querySelector('#notify').disabled);await popup.close();return observed;
  });
  await check('EXTENSION-RPC-NEGATIVE-LIFECYCLE',async()=>{
    assert.ok(fork);await fork.context.addInitScript(()=>{window.rawPorts=[];window.inbound=[];window.addEventListener('message',event=>{for(const port of event.ports){rawPorts.push(port);port.addEventListener('message',e=>inbound.push(e.data));port.start();}});});
    const popupReady=fork.context.waitForEvent('page');await fork.page.evaluate(url=>{window.rpcPeer=window.open(url,'akari-rpc-adversarial-peer');},pathToFileURL(path.join(directory,'peer.html')).href);const popup=await popupReady;await popup.waitForLoadState();
    await fork.page.evaluate(async()=>{const manifest=structuredClone(auditDefinitions[0].manifest);manifest.id='demo.connector';manifest.offline=false;manifest.commands=[];manifest.calculations=[];manifest.events[0].id='sample';manifest.capabilities=['demo.add','demo.wait','demo.fail','demo.drop','demo.duplicate','demo.unknown','demo.event'];const host=Akari.createAkariRuntime({extensions:[{manifest,factory:()=>({})}],allowedCapabilities:manifest.capabilities}).extensions,events=[];host.beginSession({onEvent:e=>events.push(e)});const connector=await host.connectWindow(rpcPeer,{origin:'null',capabilities:manifest.capabilities,timeoutMs:3000});window.rpcTest={host,connector,events};});
    // Invalid JSON and signal options must fail synchronously before a
    // request timer/promise exists; a later bad batch item must allocate none.
    const invalidInbound=await popup.evaluate(()=>inbound.length);
    await fork.page.evaluate(()=>{window.rpcUnhandled=[];window.addEventListener('unhandledrejection',event=>rpcUnhandled.push({code:event.reason?.code,message:String(event.reason)}));const {connector}=rpcTest;
      function rejectsSync(fn,code){let rejected=false;try{fn();}catch(error){rejected=error.code===code;}if(!rejected)throw Error('Invalid connector input did not synchronously reject '+code);}
      rejectsSync(()=>connector.request('demo.drop',[NaN],{timeoutMs:20}),'E701');
      rejectsSync(()=>connector.batch([{method:'demo.drop',params:[71,29],timeoutMs:20},{method:'demo.drop',params:[NaN],timeoutMs:20}]),'E701');
      rejectsSync(()=>connector.request('demo.drop',[71,29],{signal:{},timeoutMs:20}),'E707');
      rejectsSync(()=>connector.batch([{method:'demo.drop',params:[71,29],timeoutMs:20},{method:'demo.drop',params:[71,29],signal:{},timeoutMs:20}]),'E707');
    });await fork.page.waitForTimeout(80);assert.equal(await popup.evaluate(()=>inbound.length),invalidInbound,'Invalid input sent a request or leaked timeout cancellation');assert.deepEqual(await fork.page.evaluate(()=>rpcUnhandled),[],'Invalid input leaked an unhandled rejection');
    await popup.evaluate(()=>{const p=rawPorts[0];p.postMessage([]);p.postMessage('{');p.postMessage({jsonrpc:'2.0'});p.postMessage({jsonrpc:'2.0',method:'unknown',id:'unknown-call'});p.postMessage({jsonrpc:'2.0',method:'unknown'});});
    await popup.waitForFunction(()=>inbound.some(v=>v.error?.code===-32600)&&inbound.some(v=>v.error?.code===-32700)&&inbound.some(v=>v.error?.code===-32601));
    const malformed=await popup.evaluate(()=>inbound.filter(v=>v.error?.code===-32600).length>=2&&inbound.some(v=>v.error?.code===-32700));
    const core=await fork.page.evaluate(async()=>{const {connector}=rpcTest;const duplicate=await connector.request('demo.duplicate',[2,4])===6&&await connector.request('demo.add',[1,2])===3,unknown=await connector.request('demo.unknown',[5,9])===14;let error=false,timeout=false,cancel=false;try{await connector.request('demo.fail',[]);}catch(e){error=e.rpc?.code===-32000;}try{await connector.request('demo.drop',[],{timeoutMs:20});}catch(e){timeout=e.code==='E707';}const controller=new AbortController(),pending=connector.request('demo.wait',[1,2],{signal:controller.signal});controller.abort();try{await pending;}catch(e){cancel=e.code==='E706';}return{duplicate,unknown,error,timeout,cancel};});
    await popup.locator('#notify').click();await fork.page.waitForFunction(()=>rpcTest.events.length===1);const info=await fork.page.evaluate(()=>({connectionId:rpcTest.connector.connectionId,sessionId:rpcTest.connector.sessionId}));
    await popup.evaluate(info=>{rawPorts[0].postMessage({jsonrpc:'2.0',method:'akari.event',params:{...info,sequence:1,extensionId:'demo.connector',eventId:'sample',payload:999}});rawPorts[0].postMessage({jsonrpc:'2.0',method:'akari.event',params:{...info,sessionId:'old-session',sequence:2,extensionId:'demo.connector',eventId:'sample',payload:999}});},info);await popup.locator('#notify').click();await fork.page.waitForFunction(()=>rpcTest.events.length===2);
    const oldSession=await fork.page.evaluate(async()=>{const {host,connector,events}=rpcTest;if(events.some(e=>e.payload===999)||events[1].payload!==2)return false;const pending=connector.request('demo.wait',[1,2]);host.endSession();try{await pending;}catch(e){return e.code==='E707'&&!connector.ready;}return false;});
    await popup.waitForFunction(info=>inbound.some(message=>message?.method==='akari.close'&&message.params?.connectionId===info.connectionId&&message.params?.sessionId===info.sessionId),info);await popup.waitForFunction(()=>document.querySelector('#status').textContent==='接続は終了しました');await fork.page.waitForTimeout(30);assert.deepEqual(await fork.page.evaluate(()=>rpcUnhandled),[],'Session end exposed stranded invalid-input requests');
    await fork.page.evaluate(async()=>{rpcTest.host.beginSession();rpcTest.second=await rpcTest.host.connectWindow(rpcPeer,{origin:'null',capabilities:['demo.add'],timeoutMs:3000});});const reconnect=await fork.page.evaluate(async()=>rpcTest.second.connectionId!==rpcTest.connector.connectionId&&await rpcTest.second.request('demo.add',[2,3])===5);
    const expectedReady=fork.context.waitForEvent('page');await fork.page.evaluate(()=>{window.expectedPeer=window.open('about:blank','akari-expected-peer');});const expected=await expectedReady;await expected.evaluate(()=>{window.seen=null;window.addEventListener('message',e=>{if(e.data?.method==='akari.probe')window.seen=e.data;});});
    const impostorReady=fork.context.waitForEvent('page');await fork.page.evaluate(()=>{window.impostorPeer=window.open('about:blank','akari-impostor-peer');});const unrelated=await impostorReady;
    await fork.page.evaluate(()=>{window.spoofResult=null;window.spoofPending=rpcTest.host.connectWindow(expectedPeer,{origin:'null',capabilities:['demo.add'],timeoutMs:700}).then(()=>{spoofResult='accepted';},e=>{spoofResult=e.code;});});await expected.waitForFunction(()=>!!window.seen);const probe=await expected.evaluate(()=>seen);await unrelated.evaluate(probe=>window.opener.postMessage({jsonrpc:'2.0',id:probe.id,result:{nonce:probe.params.nonce}},'*'),probe);await fork.page.waitForFunction(()=>spoofResult!==null);const impostor=await fork.page.evaluate(()=>spoofResult==='E707');
    await fork.page.evaluate(()=>rpcTest.host.endSession());await fork.page.waitForTimeout(30);assert.deepEqual(await fork.page.evaluate(()=>rpcUnhandled),[],'Transport cleanup leaked an unhandled rejection');await Promise.all([popup.close(),expected.close(),unrelated.close()]);return{malformed,...core,impostor,oldSession,reconnect};
  });
  for(const active of [standard,fork].filter(Boolean)){pageErrors.push(...active.errors);networkErrors.push(...active.requests,...active.sockets);await active.context.close();}
}).catch(error=>{pageErrors.push(error.message);console.error(error.stack);});
for(const id of extensionFoundationIds)if(!results.has(id))results.set(id,{id,status:'FAIL',error:'Required check not executed'});
const artifactNames=['candidate.html','derived.html','player.html','peer.html','external-derived.html','external-player.html'].filter(name=>fs.existsSync(path.join(directory,name)));
const report={schema:'akari-extension-foundation-v1',status:[...results.values()].every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:inputs,
  provenance:{run:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'1'},
  environment:{platform:process.platform,browser:browserEnvironment.version,playwright:require('playwright/package.json').version},
  results:extensionFoundationIds.map(id=>results.get(id)),networkErrors,pageErrors,artifacts:artifactNames.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(directory,name)))}))};
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
if(report.status==='PASS')verifyExtensionFoundation(report,inputs,directory);else process.exitCode=1;
console.log('Extension foundation: '+[...results.values()].filter(r=>r.status==='PASS').length+'/'+extensionFoundationIds.length+' PASS');
