import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {buildProduct,repositoryRoot,sourceDirectories} from '../../src/build.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {productSourceIds,verifyProductSource,childGlossaryIssues,childSpacingIssues,CHILD_SPACING_RUN} from '../lib/product-source-contract.mjs';
import {readBoundaries,sourceUses,closureReferences,boundaryIssues,embeddedSources,productScript} from '../lib/source-boundaries.mjs';
import {sourceSizes,splitSource,sourceUnits,SOURCE_SPLIT_LINES} from '../lib/source-split.mjs';
import {dispatchValueIssues,DISPATCH_ALLOWED,domReferenceIssues,productCodes,namedCodes,diagnosticCodeIssues,UNNAMED_CODES,shownTextReads,shownTextIssues,SHOWN_TEXT_BASELINE,platformNames,unwrittenReads,unwrittenIssues,UNWRITTEN_ALLOWED} from '../lib/source-consistency.mjs';
import {trackedFiles} from '../lib/publication-contract.mjs';
import {lintText,lintFindings,LINT_PROBES,LINT_RULES} from '../lib/source-lint.mjs';
import {sourceClones,cloneIssues,CLONE_BASELINE} from '../lib/source-clones.mjs';
import {timeWaitIssues,WAIT_BASELINE,sourceReadIssues,SOURCE_READ_BASELINE,auditLintCounts,auditLintIssues,LINT_BASELINE} from '../lib/audit-code.mjs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';

const output=path.resolve(process.argv[2]||'audit-evidence/product-source.json');
assert.ok(!fs.existsSync(output),'fresh result required: '+output);
const read=file=>fs.readFileSync(path.join(repositoryRoot,file),'utf8');
const list=dir=>fs.readdirSync(path.join(repositoryRoot,dir)).sort().map(name=>dir+'/'+name);
// Build with one file's text replaced, or with an extra listed source file.
const variant=(changes={},extra={})=>buildProduct({read:file=>file in changes?changes[file]:read(file),list:dir=>[...list(dir),...(extra[dir]||[])]});
const product=fs.readFileSync(currentProductFile()),built=buildProduct(),results=[];
function check(id,fn){try{fn();results.push({id,status:'PASS'});}catch(error){results.push({id,status:'FAIL',error:error.stack});}}
// Template and execution-core text with one directive line rewritten.
const template=read('src/akari.html'),apiLine='<!-- @include js/12-public-api.js -->\n';
const withInclude=(...names)=>({'src/akari.html':template.replace(apiLine,names.map(name=>'<!-- @include '+name+' -->\n').join(''))});
const core='src/js/01-execution-core.js',coreText=read(core);

check('PRODUCT-SOURCE-BYTES',()=>{assert.equal(built.file,currentProductFile());assert.ok(product.equals(Buffer.from(built.html,'utf8')),'committed product differs from the build of src/');});
check('PRODUCT-SOURCE-COMPLETE',()=>{const all=sourceDirectories.flatMap(list);assert.ok(all.length>0);for(const file of all)assert.ok(built.sources.includes(file),file);});
check('PRODUCT-SOURCE-PORTABLE-EXTENSIONS',()=>{assert.deepEqual(built.sources.filter(file=>file.startsWith('extensions/')).sort(),['extensions/foundation.js','extensions/profiles.js']);for(const name of ['profiles.js','foundation.js']){const text=read('extensions/'+name).replace(/\n$/,'');assert.ok(built.html.includes(text.slice(0,text.lastIndexOf('\n')+1)),name);}});
const sample=list('src/js').at(-1);
check('REJECT-CHANGED-SOURCE',()=>assert.notEqual(variant({[sample]:read(sample).replace('Akari','Akira')}).html,built.html));
check('REJECT-CHANGED-EXTENSION',()=>{const file='extensions/profiles.js',text=read(file);assert.notEqual(variant({[file]:'// changed\n'+text}).html,built.html);});
check('REJECT-UNINCLUDED-SOURCE',()=>assert.throws(()=>variant({'src/js/99-orphan.js':'\n'},{'src/js':['src/js/99-orphan.js']}),/not included/));
check('REJECT-DUPLICATE-INCLUDE',()=>assert.throws(()=>variant(withInclude('js/12-public-api.js','js/12-public-api.js')),/included twice/));
check('REJECT-MALFORMED-DIRECTIVE',()=>assert.throws(()=>variant({'src/akari.html':template.replace(apiLine,'<!-- @include  js/12-public-api.js -->\n')}),/malformed directive/));
// A second spelling of an included file is the same target, so it is a duplicate.
check('REJECT-ALIAS-DUPLICATE-INCLUDE',()=>{for(const alias of ['js/./12-public-api.js','js//12-public-api.js','css/../js/12-public-api.js'])assert.throws(()=>variant(withInclude('js/12-public-api.js',alias)),/included twice: src\/js\/12-public-api\.js/,alias);});
// Traversal out of src/css and src/js, including into src/ itself and the portable extensions.
check('REJECT-INCLUDE-OUTSIDE-SOURCE',()=>{for(const target of ['js/../../extensions/profiles.js','js/../build.mjs','css/../../index.html','js/../akari.html','js'])assert.throws(()=>variant(withInclude(target)),/include outside src\/css or src\/js/,target);});
// The only spelling of a file through another source directory is still refused.
check('REJECT-INCLUDE-ALIAS',()=>{for(const alias of ['css/../js/12-public-api.js','js/./12-public-api.js','js//12-public-api.js'])assert.throws(()=>variant(withInclude(alias)),/include alias/,alias);});
check('REJECT-UNLISTED-PORTABLE',()=>{const other='extensions/other.js',text="const other = 1;\nif (typeof module !== 'undefined') module.exports = {other};\n";assert.throws(()=>variant({[core]:coreText.replace('// @portable extensions/profiles.js','// @portable '+other),[other]:text}),/not an allowed portable extension: extensions\/other\.js/);});
// Source boundaries (AUDIT.md「ソースの境界」): each src/js file uses only the files its declaration names.
// Reading and analysis happen inside the checks, so a broken declaration or source fails its check by ID.
let loaded;const state=()=>loaded??={boundaries:readBoundaries(repositoryRoot),uses:sourceUses(read)};
const usesWith=changes=>sourceUses(file=>file in changes?changes[file]:read(file));
check('SOURCE-BOUNDARIES-RESOLVER',()=>{
  // Shadowed names are local; member and key names, labels and declarations are not references; defaults and
  // computed keys are. A default sees the parameters, not the body; a static block keeps its var.
  const text=['(() => {','  const a = 1, b = 2;','  function f(a, {x = b} = {}) { return a + x; }',
    '  const g = () => { let a = 3; label: for (const b of [a]) break label; return {a, b: a}.b; };',
    '  class C { a() { return this.a; } static b = a; [b]() {} }','  const h = () => a;','  try { h(); } catch (a) { a; }',
    '  const k = (y = a) => { const a = 0; return y + a; };','  const m = ({[b]: v} = {}) => v?.[a] ?? {[a]: b}[b];',
    '  class D { static { var a = 0; a; } }','})();',''].join('\n');
  const found=closureReferences({text,pieces:[{label:'x',start:0,end:text.length}]}).refs.map(r=>r.name+'@'+text.slice(0,r.at).split('\n').length).sort();
  assert.deepEqual(found,['a@5','a@6','a@8','a@9','a@9','b@3','b@5','b@9','b@9','b@9','h@7']);
});
check('SOURCE-BOUNDARIES-DECLARED',()=>{
  // The analysed script is the product's script, character for character.
  const html=built.html,open=html.indexOf('<script>\n')+'<script>\n'.length;
  assert.equal(productScript(read).text,html.slice(open,html.lastIndexOf('</script>')));
  const {boundaries,uses}=state();assert.deepEqual(boundaryIssues(uses,boundaries),[]);assert.ok(uses.refs>0);
});
// The exported player embeds these functions alone; they must run without the editor's closure.
check('SOURCE-BOUNDARIES-EMBEDDED-RUN',()=>{
  const sources=embeddedSources(read),context=vm.createContext({});
  vm.runInContext("'use strict';\n"+Object.values(sources).join('\n')+'\nglobalThis.runtime=createAkariRuntime();',context);
  assert.equal(context.runtime.eventText('keyDown',{key:'空白'}),'「スペース」キーを おした とき');
});
const without=(file,use)=>{const {boundaries}=state();return {...boundaries,[file]:{...boundaries[file],uses:boundaries[file].uses.filter(u=>u!==use)}};};
check('REJECT-UNDECLARED-SOURCE-USE',()=>{const {boundaries,uses}=state(),file='src/js/11-application.js',use=boundaries[file].uses[0];assert.ok(boundaryIssues(uses,without(file,use)).some(i=>i.startsWith(file+' uses '+use+' without declaring')));});
// The cases name files that parse on their own (10, 11); src/js/00 and 12 open and close the product's closure.
check('REJECT-STALE-SOURCE-USE',()=>{const {boundaries,uses}=state(),file='src/js/10-block-view.js',extra='src/js/11-application.js';assert.ok(!boundaries[file].uses.includes(extra));assert.ok(boundaryIssues(uses,{...boundaries,[file]:{...boundaries[file],uses:[...boundaries[file].uses,extra]}}).includes(file+' declares '+extra+' but uses none of its names'));});
check('REJECT-MISSING-SOURCE-BOUNDARY',()=>{const {boundaries,uses}=state(),{['src/js/10-block-view.js']:_,...rest}=boundaries;assert.ok(boundaryIssues(uses,rest).includes('src/js/10-block-view.js: no boundary declaration'));});
// An embedded function using a closure name, reading what the product puts on the global object, or a toString()
// embedding the list does not name.
check('REJECT-EMBEDDED-CLOSURE-USE',()=>{
  // The line lies in a part of createAkariRuntime, whose body is cut across the 01-runtime files.
  const {boundaries}=state(),line="KEY_SURFACES[key] : key;",keyFile=Object.keys(boundaries).find(file=>read(file).includes(line)),keyText=keyFile&&read(keyFile);assert.ok(keyFile);
  const issues=boundaryIssues(usesWith({[keyFile]:keyText.replace(line,'KEY_SURFACES[key] : keyName(key);')}),boundaries);
  assert.ok(issues.includes('createAkariRuntime is embedded through toString() but uses closure names: keyName'),JSON.stringify(issues));
  const keyNameFile=Object.keys(boundaries).find(file=>read(file).includes('  function keyName('));assert.ok(keyNameFile);
  assert.ok(issues.some(i=>i.startsWith(keyFile+' uses '+keyNameFile+' without declaring')),JSON.stringify(issues));
  const global=boundaryIssues(usesWith({[keyFile]:keyText.replace(line,'KEY_SURFACES[key] : globalThis.Akari && key;')}),boundaries);
  assert.ok(global.includes('createAkariRuntime is embedded through toString() but reads what the product puts on the global object: Akari'),JSON.stringify(global));
  const destructured=boundaryIssues(usesWith({[keyFile]:keyText.replace(line,'KEY_SURFACES[key] : (({Akari: q} = globalThis), key);')}),boundaries);
  assert.ok(destructured.includes('createAkariRuntime is embedded through toString() but reads what the product puts on the global object: Akari'),JSON.stringify(destructured));
  const exporter='src/js/08-stage-and-export.js',exportText=read(exporter),call='${createAkariStageView.toString()}';assert.ok(exportText.includes(call));
  for(const form of ['${keyName.toString()}','${String(keyName)}','${keyName}']){
    const listed=boundaryIssues(usesWith({[exporter]:exportText.replace(call,call+form)}),boundaries);
    assert.ok(listed.some(i=>i.startsWith('the product embeds ')&&i.includes('keyName')),form+' '+JSON.stringify(listed));
  }
  // A local of the same name is not the top-level function; a top-level const arrow function is one.
  const local=boundaryIssues(usesWith({[exporter]:exportText.replace(call,call+'${((keyName) => `${keyName}`)(1)}')}),boundaries);
  assert.ok(!local.some(i=>i.startsWith('the product embeds ')),JSON.stringify(local));
  const anchor='  const KEY_WORDS=',parser=Object.keys(boundaries).find(file=>read(file).includes(anchor));assert.ok(parser);
  const arrow=boundaryIssues(usesWith({[parser]:read(parser).replace(anchor,'  const KEY_ALIASES_ARROW=()=>keyName;\n'+anchor),[exporter]:exportText.replace(call,call+'${KEY_ALIASES_ARROW.toString()}')}),boundaries);
  assert.ok(arrow.some(i=>i.startsWith('the product embeds ')&&i.includes('KEY_ALIASES_ARROW')),JSON.stringify(arrow));
});
// The application's shared state and calls (AUDIT.md「ソースの境界」): an undeclared call or state, a name registered
// twice or under another name, a call nothing registers, a registration nothing calls, a computed key, a write to
// appCalls, a state nothing assigns, a factory of another shape, and a factory holding other statements are each refused.
const variantIssues=(changes,expected)=>{const issues=boundaryIssues(usesWith(changes),state().boundaries);assert.ok(issues.some(i=>i.startsWith(expected)),expected+' '+JSON.stringify(issues.slice(0,4)));};
const services='src/js/11-app-services.js',servicesHead='  function createAppServices(appVars, appCalls, appRedraw) {\n',register='    Object.assign(appCalls, {\n';
check('REJECT-APP-INTERFACE-MISMATCH',()=>{
  const {boundaries,uses}=state(),file=services,call=boundaries[file].appCalls.uses[0],shared=boundaries[file].appVars[0];
  const drop=(field,name)=>({...boundaries,[file]:{...boundaries[file],...(field==='appVars'?{appVars:boundaries[file].appVars.filter(n=>n!==name)}:{appCalls:{...boundaries[file].appCalls,uses:boundaries[file].appCalls.uses.filter(n=>n!==name)}})}});
  assert.ok(boundaryIssues(uses,drop('appCalls',call)).some(i=>i.startsWith(file+' calls appCalls ["'+call+'"] undeclared')));
  assert.ok(boundaryIssues(uses,drop('appVars',shared)).some(i=>i.startsWith(file+' uses appVars ["'+shared+'"] undeclared')));
  const text=read(file);assert.ok(text.includes(servicesHead)&&text.includes(register));
  const own=boundaries[file].appCalls.provides[0],other=Object.keys(boundaries).find(f=>f!==file&&boundaries[f].appCalls?.provides?.length),theirs=boundaries[other].appCalls.provides[0];
  const variants=[
    [text.replace(register,register+'      '+theirs+',\n'),file+': a registration that is not one of the factory\'s own functions under its own name'],
    [text.replace(register,register+'      alias: '+own+',\n'),file+': a registration that is not one of the factory\'s own functions under its own name'],
    [text.replace(servicesHead,servicesHead+'    function neverCalledFromElsewhere() {}\n').replace(register,register+'      neverCalledFromElsewhere,\n'),file+' registers appCalls.neverCalledFromElsewhere but nothing calls it'],
    [text.replace(servicesHead,servicesHead+'    function noSuchUse() { return appCalls.noSuchApplicationCall; }\n'),file+' calls appCalls.noSuchApplicationCall that no file registers'],
    [text.replace(servicesHead,servicesHead+"    function dynamicUse() { return appCalls['dynamic']; }\n"),file+': appCalls used other than by a plain property name'],
    [text.replace(servicesHead,servicesHead+'    function aliasUse() { const calls = appCalls; return calls; }\n'),file+': appCalls used other than by a plain property name'],
    [text.replace(servicesHead,servicesHead+'    function writeCalls() { appCalls.'+own+' = null; }\n'),file+': appCalls.'+own+' written outside the registration'],
    [text.replace(servicesHead,servicesHead+'    function readUnset() { return appVars.noSuchState; }\n'),'appVars.noSuchState is read but no file assigns it'],
    [text.replace(servicesHead,'  function createAppServices(appCalls, appVars, appRedraw) {\n'),file+': createAppServices takes other than (appVars, appCalls, appRedraw)'],
    [text.replace(servicesHead,servicesHead+'    appVars.loose = 1;\n'),file+': createAppServices holds a statement that is neither a function declaration nor a registration'],
  ];
  for(const [changed,expected]of variants)variantIssues({[file]:changed},expected);
  const shell='src/js/11-application.js',call0='createAppServices(appVars, appCalls, appRedraw);';assert.ok(read(shell).includes(call0));
  variantIssues({[shell]:read(shell).replace(call0,'createAppServices(appCalls, appVars, appRedraw);')},shell+': createAppServices called with other than (appVars, appCalls, appRedraw)');
  variantIssues({[shell]:read(shell).replace(call0,call0+'\n    '+call0)},'createAppServices is declared 1 and called 2 times');
  variantIssues({[file]:text+'  function outsideTheFactory() {}\n'},file+': an application part holds something besides its one factory');
});
// One way (AUDIT.md「ソースの境界」): an application file reaching a file after it, other than by a redraw request, is
// refused: an appCalls name a later file registers, a top-level name of a later file, and the result of a function a
// later file keeps in appVars.
check('REJECT-APP-AGAINST-ORDER',()=>{
  const {boundaries}=state(),tools='src/js/11-app-tools-core.js',toolsText=read(tools),head='  function createAppToolsCore(appVars, appCalls, appRedraw) {\n';assert.ok(toolsText.includes(head));
  const later=boundaries[services].appCalls.provides[0];
  variantIssues({[tools]:toolsText.replace(head,head+'    function upward() { return appCalls.'+later+'(); }\n')},tools+' calls appCalls.'+later+' of '+services+', which comes after it');
  variantIssues({[tools]:toolsText.replace(head,head+'    function upwardName() { return createAppDrawing; }\n')},tools+' uses src/js/11-app-drawing.js, which comes after it');
  const kept='appVars.activeDragCleanup?.();';assert.ok(read(services).includes(kept));
  assert.ok((boundaries['src/js/11-app-commands.js'].appVars??[]).includes('activeDragCleanup'));
  variantIssues({[services]:read(services).replace(kept,'const kept = appVars.activeDragCleanup?.();')},services+' uses the result of appVars.activeDragCleanup(), which src/js/11-app-commands.js (a later file) assigns');
  variantIssues({[services]:read(services).replace(kept,'const kept = appVars.activeDragCleanup?.call(null);')},services+' uses the result of appVars.activeDragCleanup(), which src/js/11-app-commands.js (a later file) assigns');
  variantIssues({[services]:read(services).replace(kept,'const cleanup = appVars.activeDragCleanup; cleanup?.();')},services+' hands on appVars.activeDragCleanup as a value, a function src/js/11-app-commands.js (a later file) assigns');
  // A function only ever called through a name, and one initApp assigns later than its first values, count too.
  const commands='src/js/11-app-commands.js',commandsHead='  function createAppCommands(appVars, appCalls, appRedraw) {\n';assert.ok(read(commands).includes(commandsHead));
  variantIssues({[commands]:read(commands).replace(commandsHead,commandsHead+'    function keepExtra() { appVars.extraKept = () => 1; }\n'),[services]:read(services).replace(kept,'const extra = appVars.extraKept; extra?.();')},services+' hands on appVars.extraKept as a value, a function src/js/11-app-commands.js (a later file) assigns');
  const shellText=read('src/js/11-application.js'),setup='    createAppDrawing(appVars, appCalls, appRedraw);\n';assert.ok(shellText.includes(setup));
  variantIssues({'src/js/11-application.js':shellText.replace(setup,setup+'    const setLater = () => { appVars.laterFn = () => 42; };\n'),[services]:read(services).replace(kept,'const later = appVars.laterFn; later?.();')},services+' hands on appVars.laterFn as a value, a function src/js/11-application.js (a later file) assigns');
  // initApp's first values count when they put in a function.
  const direct=shellText.replace(setup,setup+'    appVars.laterFn = () => 42;\n');
  variantIssues({'src/js/11-application.js':direct,[services]:read(services).replace(kept,'const answer = appVars.laterFn();')},services+' uses the result of appVars.laterFn(), which src/js/11-application.js (a later file) assigns');
  variantIssues({'src/js/11-application.js':direct,[services]:read(services).replace(kept,'const later = appVars.laterFn; later?.();')},services+' hands on appVars.laterFn as a value, a function src/js/11-application.js (a later file) assigns');
  // A function put in through ?:, &&, .bind, appCalls or another field is still one.
  for(const value of ['flag ? () => 1 : null','flag && (() => 1)','(() => 1).bind(null)','appCalls.setStatus','appVars.activeDragCleanup'])
    variantIssues({[commands]:read(commands).replace(commandsHead,commandsHead+'    function keepExtra(flag) { appVars.extraKept = '+value+'; }\n'),[services]:read(services).replace(kept,'const extra = appVars.extraKept; extra?.();')},services+' hands on appVars.extraKept as a value, a function src/js/11-app-commands.js (a later file) assigns');
  // So is one kept first in a local const, and a field whose local copy is called, however the function was put in;
  // a file that also assigns the field gets no exception.
  variantIssues({[commands]:read(commands).replace(commandsHead,commandsHead+'    function keepExtra(flag) { const h = flag ? () => 1 : null; appVars.extraKept = h; }\n'),[services]:read(services).replace(kept,'const extra = appVars.extraKept; setTimeout(extra);')},services+' hands on appVars.extraKept as a value, a function src/js/11-app-commands.js (a later file) assigns');
  for(const put of ['appVars.extraKept = obj.handler;','({ handler: appVars.extraKept } = obj);','appVars.extraKept = obj.make();'])
    variantIssues({[commands]:read(commands).replace(commandsHead,commandsHead+'    function keepExtra(obj) { '+put+' }\n'),[services]:read(services).replace(kept,'const extra = appVars.extraKept; const kept = extra.call(null);')},services+' uses the result of appVars.extraKept(), which src/js/11-app-commands.js (a later file) assigns');
  variantIssues({[commands]:read(commands).replace(commandsHead,commandsHead+'    function keepExtra() { appVars.extraKept = () => 1; }\n'),[services]:read(services).replace(kept,'appVars.extraKept = null; const extra = appVars.extraKept; extra?.();')},services+' hands on appVars.extraKept as a value, a function src/js/11-app-commands.js (a later file) assigns');
  // A let assigned a function after its first value, and a field copied through a local, count; a later file that only
  // clears the field supplies no function.
  variantIssues({[commands]:read(commands).replace(commandsHead,commandsHead+'    function keepExtra() { let h = null; h = () => 1; appVars.extraKept = h; }\n'),[services]:read(services).replace(kept,'const extra = appVars.extraKept; setTimeout(extra);')},services+' hands on appVars.extraKept as a value, a function src/js/11-app-commands.js (a later file) assigns');
  variantIssues({[commands]:read(commands).replace(commandsHead,commandsHead+'    function keepExtra() { const h = appVars.activeDragCleanup; appVars.extraKept = h; }\n'),[services]:read(services).replace(kept,'const extra = appVars.extraKept; setTimeout(extra);')},services+' hands on appVars.extraKept as a value, a function src/js/11-app-commands.js (a later file) assigns');
  for(const put of ['let h = null; appVars.extraKept = (h ||= () => 1);','let h = null; h ??= () => 1; appVars.extraKept = h;'])
    variantIssues({[commands]:read(commands).replace(commandsHead,commandsHead+'    function keepExtra() { '+put+' }\n'),[services]:read(services).replace(kept,'const extra = appVars.extraKept; setTimeout(extra);')},services+' hands on appVars.extraKept as a value, a function src/js/11-app-commands.js (a later file) assigns');
  // A new instance may be a function (new Function(…)); it supplies one.
  variantIssues({[commands]:read(commands).replace(commandsHead,commandsHead+'    function keepExtra() { appVars.extraKept = new Function(\'return 1\'); }\n'),[services]:read(services).replace(kept,'const kept = appVars.extraKept();')},services+' uses the result of appVars.extraKept(), which src/js/11-app-commands.js (a later file) assigns');
  const cleared=boundaryIssues(usesWith({[commands]:read(commands).replace(commandsHead,commandsHead+'    function clearExtra() { appVars.extraKept = null; }\n'),[services]:read(services).replace(kept,'appVars.extraKept = () => 1; setTimeout(appVars.extraKept);')}),state().boundaries);
  assert.ok(!cleared.some(i=>/appVars\.extraKept(?: as a value|\(\))/.test(i)),'a field a later file only clears: '+JSON.stringify(cleared.filter(i=>i.includes('extraKept'))));
  // The language processing is one group: its files may use each other, but not a group after it; its files come together.
  const language='src/js/05-command-presentation.js',languageText=read(language),blockView='src/js/10-block-view.js';assert.ok(read(blockView).includes('  function createBlockEditorView('));
  variantIssues({[language]:languageText+'  function reachesBlockView() { return createBlockEditorView; }\n'},language+' uses '+blockView+', which comes after it');
  const tpl='src/akari.html',tplText=read(tpl),line='<!-- @include js/10-block-view.js -->\n',second='<!-- @include js/03-default-assets.js -->\n';assert.ok(tplText.includes(line)&&tplText.includes(second));
  variantIssues({[tpl]:tplText.replace(line,'').replace(second,line+second)},'the files of the language processing (src/js/02-09) do not come together in src/akari.html');
});
// Redraw requests (AUDIT.md「ソースの境界」): a request used for its result or as a value, an undeclared request, a slot
// nothing fills, filled by an earlier file, filled twice or with another function, written outside the registration, and
// a filled slot nothing calls are each refused.
check('REJECT-APP-REDRAW-MISUSE',()=>{
  const {boundaries,uses}=state(),drawing='src/js/11-app-drawing.js',drawingText=read(drawing),fills='    Object.assign(appRedraw, {\n',request='appRedraw.tree();';
  assert.ok(drawingText.includes(fills)&&read(services).includes(request)&&boundaries[drawing].appRedraw.fills.tree==='renderTree');
  variantIssues({[services]:read(services).replace(request,'const drawn = appRedraw.tree();')},services+': appRedraw.tree used other than as a call whose result nothing uses');
  variantIssues({[services]:read(services).replace(request,'setTimeout(appRedraw.tree);')},services+': appRedraw.tree used other than as a call whose result nothing uses');
  variantIssues({[services]:read(services).replace(request,request+' appRedraw.noSuchSlot();')},'appRedraw.noSuchSlot is called by '+services+' but no file fills it');
  const requests=boundaries[services].appRedraw.requests;
  assert.ok(boundaryIssues(uses,{...boundaries,[services]:{...boundaries[services],appRedraw:{requests:requests.filter(s=>s!=='tree')}}}).some(i=>i.startsWith(services+' calls appRedraw ["tree"] undeclared')));
  variantIssues({[drawing]:drawingText.replace('      tree: renderTree,\n','      tree: renderProperties,\n')},drawing+': an appRedraw slot not filled with the factory\'s own render, refresh, repaint or paint function of that name');
  variantIssues({[drawing]:drawingText.replace('      tree: renderTree,\n','      tree: renderTree,\n      tree: renderTree,\n')},drawing+': an appRedraw slot not filled with the factory\'s own render, refresh, repaint or paint function of that name');
  variantIssues({[services]:read(services).replace(servicesHead,servicesHead+'    function renderLocal() {}\n').replace(register,'    Object.assign(appRedraw, {\n      local: renderLocal,\n    });\n'+register).replace(request,request+' appRedraw.local();')},services+' calls appRedraw.local, which '+services+' fills; the filling file must come after it');
  variantIssues({[services]:read(services).replace(request,request+' appRedraw.tree = null;')},services+': appRedraw.tree used other than as a call whose result nothing uses');
  const unasked=drawingText.replace(fills,fills+'      monitorSection: renderMonitorSection,\n');assert.ok(drawingText.includes('    function renderMonitorSection('));
  variantIssues({[drawing]:unasked},drawing+' fills appRedraw.monitorSection but nothing calls it');
});
// The block view is the second family (AUDIT.md「ソースの境界」): its parts follow the same rules with viewVars, viewCalls
// and viewRedraw, its three objects are declared once, in createBlockEditorView, and only what that function takes from
// its parameter (the caller's value, with defaults that use no name) may be called for its result by the parts before it.
check('REJECT-VIEW-FAMILY',()=>{
  const {boundaries,uses}=state(),tools='src/js/10-view-base.js',ops='src/js/10-view-editing.js',drawing='src/js/10-view-drawing.js',shell='src/js/10-block-view.js';
  const toolsText=read(tools),opsText=read(ops),shellText=read(shell),head='  function createViewBase(viewVars, viewCalls, viewRedraw) {\n',setup='    viewVars.options = options;\n';
  assert.ok(toolsText.includes(head)&&shellText.includes(setup)&&opsText.includes('viewRedraw.render('));
  const later=boundaries[drawing].viewCalls.provides[0];
  variantIssues({[tools]:toolsText.replace(head,head+'    function upward() { return viewCalls.'+later+'(); }\n')},tools+' calls viewCalls.'+later+' of '+drawing+', which comes after it');
  variantIssues({[ops]:opsText.replace('viewRedraw.render(','void viewRedraw.render(')},ops+': viewRedraw.render used other than as a call whose result nothing uses');
  // After the parameter is taken, a function the view itself puts into the state is a later file's.
  const after='    } = options);\n';assert.ok(shellText.includes(after));
  const put=s=>shellText.replace(after,after+'    '+s+'\n');
  variantIssues({[shell]:put('viewVars.laterFn = () => 42;'),[tools]:toolsText.replace(head,head+'    function early() { return viewVars.laterFn(); }\n')},tools+' uses the result of viewVars.laterFn(), which '+shell+' (a later file) assigns');
  // The parameter is taken at once, and only what is allowed reaches it: the parts may call what it holds for the result,
  // and the fields taken and the members read of the whole parameter are declared. Each of these is refused: a default
  // that is not a plain value (also one hiding a write), a key every object has (also as a string), a second parameter,
  // the parameter's name declared again, the parameter used outside the statements that take it, arguments, a field
  // taken twice or written again, the whole parameter used other than by reading or calling a member by a plain name (also
  // a write deeper down), a member every object has, this in the families' files, members that reach a prototype or
  // accessors, eval, and code that is not strict.
  const locked='isLocked: viewVars.isLocked = () => false,';assert.ok(shellText.includes(locked));
  assert.ok(boundaryIssues(uses,boundaries).length===0&&(uses.interfaces.viewVars[tools].varCalls??[]).some(c=>c.name==='getSession'&&!c.statement),'the parts call getSession for its result');
  assert.deepEqual(boundaries[shell].viewVarsTaken,['getContext','getProject','getSession','isLocked','onCancel','onOperation','onPending','options','options.controlsSpace','options.lessonCandidate','options.onData','options.onDestinationSelected','options.onExpand','options.onNoteProposal','options.onPresentation','options.readOnly','options.tutorialActive','root']);
  {const issues=boundaryIssues(usesWith({[tools]:toolsText.replace(head,head+'    function probeMember() { return viewVars.options.newMember; }\n')}),boundaries);
    assert.ok(issues.some(i=>i.startsWith(shell+' takes viewVars [')),'a new member of the parameter is declared');
    assert.ok(issues.includes(tools+' reads viewVars.options.newMember, which the boundary record of '+shell+' does not declare in viewVarsTaken'),'the file reading it is named');}
  assert.ok(boundaryIssues(uses,{...boundaries,[shell]:{...boundaries[shell],viewVarsTaken:boundaries[shell].viewVarsTaken.filter(n=>n!=='root')}}).some(i=>i.startsWith(shell+' takes viewVars [')),'what is taken is declared');
  for(const fallback of ['() => viewVars.destroyed','[(viewVars.getSession = viewCalls.render)]'])
    variantIssues({[shell]:shellText.replace(locked,'isLocked: viewVars.isLocked = '+fallback+',')},shell+': createBlockEditorView takes isLocked from its parameter with a default that is not a plain value');
  for(const key of ['valueOf',"'__defineGetter__'"])
    variantIssues({[shell]:shellText.replace(locked,locked+'\n      '+key+': viewVars.probeKey,')},shell+': createBlockEditorView takes '+key.replace(/'/g,'')+' from its parameter, a name every object has');
  const signature='  function createBlockEditorView(options) {\n';assert.ok(shellText.includes(signature));
  variantIssues({[shell]:shellText.replace(signature,'  function createBlockEditorView(options, extra = 1) {\n')},shell+': createBlockEditorView takes other than one plain parameter');
  for(const form of ['var options;','function options() {}','[].map((options) => options);'])
    variantIssues({[shell]:put(form)},shell+': createBlockEditorView declares the name of its parameter options again');
  variantIssues({[shell]:shellText.replace(after,'    } = Object.assign({}, options));\n')},shell+': createBlockEditorView uses its parameter options outside the statements that take it');
  for(const form of ['options = {...options};','options.getContext = () => viewVars.root;','const opts = options;','if (typeof options) {}'])
    variantIssues({[shell]:put(form)},shell+': createBlockEditorView uses its parameter options outside the statements that take it');
  variantIssues({[shell]:put('arguments[0].x = 1;')},shell+': createBlockEditorView uses arguments');
  variantIssues({[shell]:shellText.replace(setup,setup+setup)},shell+': createBlockEditorView takes options from its parameter twice');
  variantIssues({[tools]:toolsText.replace(head,head+'    function replace() { viewVars.getSession = () => null; }\n')},tools+' writes viewVars.getSession, which createBlockEditorView takes from its parameter; it is written only there');
  for(const form of ['viewVars.options.extra = () => 1;','const o = viewVars.options; o.extra = 1;','Object.assign(viewVars.options, {});',"viewVars.options['onData']();",'viewVars.options.onExpand.call = () => null;'])
    variantIssues({[tools]:toolsText.replace(head,head+'    function rewire() { '+form+' }\n')},tools+' uses viewVars.options other than by reading or calling its members by plain names; it holds the parameter of createBlockEditorView');
  variantIssues({[tools]:toolsText.replace(head,head+"    function probeOwn() { return viewVars.options.hasOwnProperty('readOnly'); }\n")},tools+' reads viewVars.options.hasOwnProperty, a name every object has, from the parameter of createBlockEditorView');
  variantIssues({[tools]:toolsText.replace(head,head+'    function probeThis() { return this; }\n')},tools+': this, which a function called through viewVars, viewCalls, viewRedraw would get as one of them');
  variantIssues({[tools]:toolsText.replace(head,head+'    function probeSuper() { return { m() { return super.toString; } }; }\n')},tools+': super, which a function called through viewVars, viewCalls, viewRedraw would get as one of them');
  const appTools='src/js/11-app-tools-core.js',appHead='  function createAppToolsCore(appVars, appCalls, appRedraw) {\n';assert.ok(read(appTools).includes(appHead));
  variantIssues({[appTools]:read(appTools).replace(appHead,appHead+"    function probeHandler(el) { el.addEventListener('click', function () { this.hidden = true; }); }\n")},appTools+': this, which a function called through appVars, appCalls, appRedraw would get as one of them');
  // The views are made by their callers: the family neither calls the shell function nor hands it on.
  for(const [file,text,form]of [[shell,shellText,"viewVars.child = () => createBlockEditorView({ root: viewVars.root });"],[shell,shellText,'viewVars.child = () => createBlockEditorView.call(null, { root: viewVars.root });'],[tools,toolsText,'function probeView() { return createBlockEditorView; }']])
    variantIssues({[file]:file===shell?put(form):text.replace(head,head+'    '+form+'\n')},file+': createBlockEditorView used other than through its members; its callers are outside the family');
  // A part's functions are reachable by name only inside it; another part uses viewCalls.
  variantIssues({[ops]:opsText.replace(/(  function createViewEditing\(viewVars, viewCalls, viewRedraw\) \{\n)/,'$1    function probeMoved() { return edgeSlot(1, 2); }\n')},ops+': edgeSlot used by name, a function of '+tools+', which is reachable by name only inside that part (the files of the family reach it through viewCalls)');
  // A binding of that name in a switch case (seen from every case), a class expression's name (also in its body), a
  // static block's declaration and a #name are not that function; the switch's own expression is outside them.
  const probeIn=body=>usesWith({[ops]:opsText.replace(/(  function createViewEditing\(viewVars, viewCalls, viewRedraw\) \{\n)/,'$1    '+body+'\n')});
  assert.deepEqual(boundaryIssues(probeIn('function probeLocal(k) { switch (k) { case 1: const edgeSlot = 2; return edgeSlot; case 2: return edgeSlot; default: return class edgeSlot { #edgeSlot = 1; m() { return edgeSlot; } static { const keySlot = 1; void keySlot; } }; } }'),boundaries),[]);
  assert.ok(boundaryIssues(probeIn('function probeSwitch(k) { switch (edgeSlot(k, 1)) { case 1: const edgeSlot = 2; return edgeSlot; default: return 0; } }'),boundaries).some(i=>i.startsWith(ops+': edgeSlot used by name')),'the switch expression is outside its cases');
  // A var nested in a static block binds in the whole block; a let there binds only in its own block.
  assert.deepEqual(boundaryIssues(probeIn('function probeStatic(k) { class P { static { if (k) { var edgeSlot = 1; } void edgeSlot; } } return P; }'),boundaries),[]);
  assert.ok(boundaryIssues(probeIn('function probeStaticLet(k) { class P { static { if (k) { let edgeSlot = 1; } void edgeSlot; } } return P; }'),boundaries).some(i=>i.startsWith(ops+': edgeSlot used by name')),'a let binds only in its block');
  // The check is for the families' files: elsewhere a name nothing binds is a global, and a family file writes
  // window.name for a global of a part's function's name.
  const diag='src/js/10-diagnostic-text.js';
  assert.ok(!boundaryIssues(usesWith({[diag]:read(diag)+'  function probeGlobal() { return typeof edgeSlot; }\n'}),boundaries).some(i=>i.includes('used by name')),'outside the families');
  assert.ok(!boundaryIssues(probeIn('function probeWindow() { return window.edgeSlot; }'),boundaries).some(i=>i.includes('used by name')),'window.name');
  // A binding in a switch case is followed like any other (its value, through a local copy, is still a function).
  const probeHead='  function createViewDrawing(viewVars, viewCalls, viewRedraw) {\n',drawingProbe=read(drawing).replace(probeHead,probeHead+'    function probeW(k) { switch (k) { case 1: const inner = () => 1; const g = inner; viewVars.probeField = g; break; default: } }\n');
  variantIssues({[drawing]:drawingProbe,[ops]:opsText.replace(/(  function createViewEditing\(viewVars, viewCalls, viewRedraw\) \{\n)/,'$1    function probeR() { const v = viewVars.probeField; return v; }\n')},ops+' hands on viewVars.probeField as a value, a function '+drawing+' (a later file) assigns');
  // undefined is the value only where no name undefined is bound.
  variantIssues({[shell]:put('function undefined() { return 1; }').replace(locked,'isLocked: viewVars.isLocked = undefined,')},shell+': createBlockEditorView takes isLocked from its parameter with a default that is not a plain value');
  const drawingText=read(drawing),drawingHead='  function createViewDrawing(viewVars, viewCalls, viewRedraw) {\n';assert.ok(drawingText.includes(drawingHead));
  variantIssues({[drawing]:drawingText.replace(drawingHead,drawingHead+'    function undefined() { return 42; }\n    function probeSet() { viewVars.laterFn = undefined; }\n'),[tools]:toolsText.replace(head,head+'    function early() { return viewVars.laterFn(); }\n')},tools+' uses the result of viewVars.laterFn(), which '+drawing+' (a later file) assigns');
  // Plain defaults pass: a function whose parameters it does not use, an empty array, undefined.
  for(const fallback of ['(reason) => {}','[]','undefined','(...args) => {}','void 0','() => { return false; }'])
    assert.deepEqual(boundaryIssues(usesWith({[shell]:shellText.replace(locked,'isLocked: viewVars.isLocked = '+fallback+',')}),boundaries),[],fallback);
  for(const [form,expected]of [["({}).__defineGetter__('x', () => 1);",': __defineGetter__, which reaches or rewrites a prototype or accessors'],["({})['__proto__'];",': __proto__, which reaches or rewrites a prototype or accessors'],["eval('1');",': eval, which runs text whose names cannot be followed']])
    variantIssues({[tools]:toolsText.replace(head,head+'    function probeReach() { '+form+' }\n')},tools+expected);
  const prelude=productScript(read).pieces.map(p=>p.label).find(f=>/^src\/js\/[^/]*-prelude\.js$/.test(f)),preludeText=read(prelude);assert.ok(preludeText.includes("  'use strict';\n"));
  variantIssues({[prelude]:preludeText.replace("  'use strict';\n",'')},'the product script is not strict code');
  // A function declared after the registrations is not there yet when they run.
  const registration='    Object.assign(viewCalls, {\n';assert.ok(toolsText.includes(registration));
  variantIssues({[tools]:toolsText.replace(registration,'    Object.assign(viewCalls, {\n      lateTool,\n').replace(/\n  \}\n$/,'\n    const lateTool = () => 1;\n  }\n')},tools+': createViewBase declares lateTool after its registration');
  // The objects: declared once, in createBlockEditorView; a factory of another shape; a part holding more than its factory.
  variantIssues({[shell]:put('{ const viewVars = {}; }')},'viewVars is declared 2 times ('+shell+', '+shell+'); it is declared once, in createBlockEditorView ('+shell+')');
  variantIssues({[shell]:shellText+'  function strayView() { const viewRedraw = {}; return viewRedraw.x; }\n'},shell+': viewRedraw declared outside createBlockEditorView');
  variantIssues({[tools]:toolsText.replace(head,'  function createViewBase(viewCalls, viewVars, viewRedraw) {\n')},tools+': createViewBase takes other than (viewVars, viewCalls, viewRedraw)');
  variantIssues({[tools]:toolsText+'  function outsideTheFactory() {}\n'},tools+': a block view part holds something besides its one factory');
  const shared=boundaries[tools].viewVars[0];
  assert.ok(boundaryIssues(uses,{...boundaries,[tools]:{...boundaries[tools],viewVars:boundaries[tools].viewVars.filter(n=>n!==shared)}}).some(i=>i.startsWith(tools+' uses viewVars ["'+shared+'"] undeclared')));
});
// What the reading cannot follow (AUDIT.md「ソースの境界」): the global object as a value, Reflect other than reading,
// an on helper that does more with its target, and a function's text taken through toString.apply are each refused.
check('REJECT-OPAQUE-GLOBAL-USE',()=>{
  const stage='src/js/08-stage-and-export.js',text=read(stage),line="on(window, 'resize', fitStage);",helper='      target.addEventListener(type, fn, opts);\n';assert.ok(text.includes(line)&&text.includes(helper));
  for(const [form,expected]of [['const g = globalThis;',stage+': the global object used as a value (globalThis)'],['Object.assign(globalThis, {});',stage+': the global object used as a value (globalThis)'],
    ["Reflect.get(window, 'Akari');",stage+': Reflect used other than to read'],['globalThis[String(1)];',stage+': the global object used as a value (globalThis)'],['((g) => g)(self);',stage+': the global object used as a value (self)']])
    variantIssues({[stage]:text.replace(line,line+' '+form)},expected);
  for(const form of ['((on) => on(window, {}))(Object.assign);','{ const {assign: on} = Object; on(window, {}); }','try { throw 0; } catch (on) { on(window, {}); }',
    'for (const on of [Object.assign]) on(window, {});','({m(on) { on(window, {}); }}).m(Object.assign);'])variantIssues({[stage]:text.replace(line,line+' '+form)},stage+': the global object used as a value (window)');
  variantIssues({[stage]:text.replace(line,line+' Object.assign(window.window, {});')},stage+': the global object used as a value (window.window)');
  assert.ok(!boundaryIssues(usesWith({[stage]:text.replace(line,line+' if (globalThis === window) {}')}),state().boundaries).some(i=>i.includes('global object')),'a comparison with the global object is allowed');
  variantIssues({[stage]:text.replace(helper,helper+'      target.flag = 1;\n')},stage+': an on helper that does more with its target than add and remove event listeners');
  const call='${createAkariStageView.toString()}';assert.ok(text.includes(call));
  variantIssues({[stage]:text.replace(call,call+'${Function.prototype.toString.apply(keyName)}')},'the product embeds ');
});
// A function cut across files (AUDIT.md「ソースの置き場所・向き・大きさ」): createAkariRuntime's body lies in the 01-runtime
// files, which use each other through its own names, one way. A file using a name of the body that a later file
// declares, an undeclared use between them, a statement of the body cut across files, a head outside the first file, a
// file of the function holding another statement, any other statement cut across files, a var inside a statement of
// its body, a backward use between its files inside one group, and a statement besides the embedding in the file that
// embeds the portable extensions are each refused; new.target in its body and a stray semicolon after it are not.
check('REJECT-SPLIT-FUNCTION',()=>{
  const {uses}=state(),parts=uses.splitFiles.createAkariRuntime;assert.ok(parts?.length>=3,JSON.stringify(uses.splitFiles));
  const [first,second,third]=parts,last=parts.at(-1),firstText=read(first),secondText=read(second),thirdText=read(third);
  const opening='  function createAkariRuntime(options) {\n',head=opening+"    'use strict';\n",model='    class RuntimeModel ',scheduler='    class EventScheduler {\n';
  assert.ok(firstText.includes(head)&&secondText.includes(model)&&thirdText.includes(scheduler));
  variantIssues({[first]:firstText.replace(head,head+'    function zzLater() { return RuntimeModel; }\n')},first+' uses '+second+', which comes after it');
  assert.ok(boundaryIssues(uses,without(second,first)).some(i=>i.startsWith(second+' uses '+first+' without declaring')));
  variantIssues({[second]:secondText+scheduler,[third]:thirdText.replace(scheduler,'')},'createAkariRuntime: EventScheduler lies in '+second+', '+third+'; a statement of a cut function lies in one file');
  variantIssues({[core]:coreText+opening,[first]:firstText.replace(opening,'')},'createAkariRuntime: its head lies in '+core+', '+first+'; it lies in its first file');
  variantIssues({[last]:read(last)+'  const zzAfter = 1;\n'},last+' holds zzAfter besides a part of createAkariRuntime');
  const before='src/js/05-command-presentation.js',after='src/js/06-source-formatting.js';
  variantIssues({[before]:read(before)+'  const zzCut = [\n',[after]:'  1];\n'+read(after)},'zzCut lies in '+before+', '+after+': only a function declaration is cut across files');
  // The cause comes first: until it is fixed, the files' declared uses of each other look stale.
  const withVar=boundaryIssues(usesWith({[first]:firstText.replace(head,head+'    for (var zzI = 0; zzI < 1; zzI++) {}\n')}),state().boundaries);
  assert.ok(withVar[0]?.startsWith('createAkariRuntime: a var inside a statement of its body (zzI) is not followed by the analysis'),JSON.stringify(withVar.slice(0,2)));
  // Inside one group the one-way rule between files is off; a cut function's own files still use each other one way.
  variantIssues({[before]:read(before)+'  function zzCutHere() {\n    return zzLater;\n',[after]:'    const zzLater = 1;\n  }\n'+read(after)},before+' uses '+after+', which comes after it (zzLater)');
  variantIssues({[core]:coreText+'  const zzCore = 1;\n'},core+' embeds a portable extension and holds zzCore; such a file holds only the embedding');
  // The embedding file is the one whose line embeds the extension, also when that line is the file's first.
  const bare=boundaryIssues(usesWith({[core]:'// @portable extensions/profiles.js\n// @portable extensions/foundation.js\n  const zzBare = 1;\n'}),state().boundaries);
  assert.ok(bare.some(i=>i.startsWith(core+' embeds a portable extension and holds zzBare'))&&!bare.some(i=>i.includes('embeds a portable extension')&&!i.startsWith(core)),JSON.stringify(bare.slice(0,3)));
  for(const [what,changes]of [['new.target in the body',{[first]:firstText.replace(head,head+"    if (new.target) throw new TypeError('not a constructor');\n")}],['a semicolon after the function',{[last]:read(last).replace(/\n  \}\n(\s*)$/,'\n  };\n$1')}]]){
    assert.notEqual(Object.values(changes)[0],read(Object.keys(changes)[0]),what);assert.deepEqual(boundaryIssues(usesWith(changes),state().boundaries),[],what);}
});
// Sizes (AUDIT.md「ソースの境界」): a file over the size whose units all fit in it is due to be split and fails;
// every file over the size is listed, with its largest unit (a unit over the size alone is not split by the rule).
let sizes=[];
const productFiles=reader=>[...new Set(productScript(reader).pieces.map(p=>p.label))];
check('SOURCE-SIZE',()=>{
  sizes=sourceSizes(read,productFiles(read));
  assert.deepEqual(sizes.filter(s=>s.due).map(s=>s.file),[],'split them by node audit/split-source.mjs <file>');
  const padded=file=>({...Object.fromEntries([[file,read(file)+'  //\n'.repeat(SOURCE_SPLIT_LINES)]])}),grown='src/js/11-app-drawing.js',over=padded(grown);
  const reader=f=>f in over?over[f]:read(f);assert.ok(sourceSizes(reader,productFiles(reader)).some(s=>s.file===grown&&s.due),'a file over the size is due');
  // A part of a function cut across files is sized by its body's statements: over the size it is due, and a part whose
  // one statement alone is over the size is listed as one unit.
  const parts=state().uses.splitFiles.createAkariRuntime,part=parts[1],grownPart=padded(part),partReader=f=>f in grownPart?grownPart[f]:read(f);
  assert.ok(sourceSizes(partReader,productFiles(partReader)).some(s=>s.file===part&&s.due),'a part of a cut function over the size is due');
  const one=sizes.find(s=>s.units===1&&parts.includes(s.file)),scheduler='    class EventScheduler {\n';assert.ok(one&&read(one.file).includes(scheduler),JSON.stringify(one));
  const longer={[one.file]:read(one.file).replace(scheduler,scheduler+'      //\n'.repeat(SOURCE_SPLIT_LINES))},longReader=f=>f in longer?longer[f]:read(f);
  assert.ok(sourceSizes(longReader,productFiles(longReader)).some(s=>s.file===one.file&&!s.due&&s.largest>SOURCE_SPLIT_LINES&&s.blocked==='it is one unit'),'one unit over the size is listed');
  // A file the rule should read but cannot is an error, never a quiet exemption.
  const broken={[grown]:read(grown)+'  function outsideTheFactory() {}\n'};assert.throws(()=>sourceSizes(f=>f in broken?broken[f]:read(f),[grown]),/holds one application factory/);
});
// The split rule (AUDIT.md「ソースの境界」): splitting a plain file, an application part, a block view part and the part
// of createAkariRuntime that opens it keeps every boundary, the product's free names and every unit; the new file comes
// just before (and opens the function); neither part is larger than the file; and what the rule cannot split is refused.
check('SOURCE-SPLIT-RULE',()=>{
  const free=reader=>[...new Set(closureReferences(productScript(reader)).free.map(x=>x.name))].sort();
  const runtimeFirst=state().uses.splitFiles.createAkariRuntime[0],runtimeOpening='  function createAkariRuntime(options) {\n';
  for(const file of ['src/js/07-semantic-analysis.js',services,'src/js/10-view-base.js',runtimeFirst]){
    const s=splitSource(read,file,f=>fs.existsSync(path.join(repositoryRoot,f))),after=p=>p in s.changes?s.changes[p]:read(p);
    const records={...state().boundaries};for(const [p,t]of Object.entries(s.changes))if(p.startsWith('audit/boundaries/'))records[JSON.parse(t).file]=JSON.parse(t);
    assert.deepEqual(boundaryIssues(sourceUses(after),records),[],file);
    assert.deepEqual(free(after),free(read),file+' free names');
    const tpl=after('src/akari.html');assert.ok(tpl.includes('<!-- @include '+s.created.slice(4)+' -->\n<!-- @include '+file.slice(4)+' -->\n'),file+' comes right after the new file');
    if(file===runtimeFirst)assert.ok(after(s.created).includes(runtimeOpening)&&!after(file).includes(runtimeOpening),'the new file opens createAkariRuntime');
    const lines=t=>t.split('\n').length;assert.ok(lines(after(s.created))<lines(read(file))&&lines(after(file))<lines(read(file)),file+' parts');
    const moved=new Set(s.moved),restore=t=>t.replace(/\b(\w+): (?:appCalls|viewCalls)\.\1\b/g,(m,n)=>moved.has(n)?n:m).replace(/\b(?:appCalls|viewCalls)\.(\w+)\b/g,(m,n)=>moved.has(n)?n:m);
    const now=[...sourceUnits(after,s.created),...sourceUnits(after,file)],key=u=>u.names.join(',')||u.text;
    const was=sourceUnits(read,file);assert.equal(now.length,was.length,file+' units');
    for(const u of was){const v=now.find(x=>key(x)===key(u));assert.ok(v&&(v.text===u.text||restore(v.text)===u.text),file+' keeps '+key(u).slice(0,40));}
  }
  const opening=productFiles(read).find(f=>f.endsWith('-prelude.js'));assert.ok(opening);assert.throws(()=>splitSource(read,opening),/opens or closes the closure/);
  // A destructuring declaration's names are its unit's names, so the units that use them come after it.
  const destructuring={'src/js/05-command-presentation.js':read('src/js/05-command-presentation.js')+'  const {zzA, zzB: [zzC]} = {zzA: 1, zzB: [2]};\n'};
  assert.ok(sourceUnits(f=>f in destructuring?destructuring[f]:read(f),'src/js/05-command-presentation.js').some(u=>JSON.stringify(u.names)==='["zzA","zzC"]'));
  // The command refuses a call without one src/js file and changes nothing.
  const cli=spawnSync(process.execPath,[path.join(repositoryRoot,'audit/split-source.mjs')],{cwd:repositoryRoot,encoding:'utf8'});
  assert.notEqual(cli.status,0);assert.match(cli.stderr,/usage: node audit\/split-source\.mjs/);
  assert.throws(()=>splitSource(read,'src/js/01-execution-core.js'),/portable extension/);
  const cyclic='src/js/05-command-presentation.js',loop={[cyclic]:'  function loopA() { return loopB(); }\n  function loopB() { return loopA(); }\n'};
  assert.throws(()=>splitSource(f=>f in loop?loop[f]:read(f),cyclic),/form one cycle/);
  // A const, even one bound to a function, is ready only when the file reaches it, and another file of the group may read
  // it while loading (zzV's initializer calls into another file, which may call zzA): the middle cut would move zzV before
  // zzA, so the split is refused.
  const ordered={[cyclic]:'  const zzA = () => zzH();\n  const zzV = otherFileFunction();\n  function zzH() {\n'+'    void 0;\n'.repeat(50)+'  }\n'};
  assert.throws(()=>splitSource(f=>f in ordered?ordered[f]:read(f),cyclic),/zzV would move before zzA/);
});
check('REJECT-UNEMBEDDED-PORTABLE',()=>{const line='// @portable extensions/foundation.js\n';assert.ok(coreText.includes(line));assert.throws(()=>variant({[core]:coreText.replace(line,'')}),/portable extensions not embedded: extensions\/foundation\.js/);});
// F-23: the strings of the product (its screens and the exported player) and the manuals use no banned variant. The
// portable extension files built into the product are the fork developers' interface and are left out.
const manuals=['MANUAL.html',...list('Manual').filter(file=>file.endsWith('.html'))];
const embedded=['extensions/foundation.js','extensions/profiles.js'].map(file=>{const text=read(file).replace(/\n$/,'');return text.slice(0,text.lastIndexOf('\n')+1);});
const productText=product.toString('utf8'),productInput=text=>({file:currentProductFile(),kind:'product',text,embedded});
check('CHILD-GLOSSARY-ONE-WORD',()=>{assert.ok(manuals.length>=6,'the manuals are scanned');assert.deepEqual(childGlossaryIssues([productInput(productText),...manuals.map(file=>({file,kind:'html',text:read(file)}))]),[]);});
// The scan finds a banned word in a string, a template and markup, and in the real product text; it skips comments,
// キャラクター, the code name 拡張「できごとの値」 (not a banned word next to it), only the exact not-screen strings, and only
// the embedded extension files (the product scanned without them reports their できごと).
check('REJECT-BANNED-CHILD-WORD',()=>{
  const words=files=>childGlossaryIssues(files).map(i=>i.word).sort();
  assert.deepEqual(words([{file:'a.js',kind:'script',text:"// なおす動き\nconst a='「なおす動き」で えらびます', b=`名人モードで ${a}`, c='キャラクター', d='キャラが おされたとき', z='とちゅうで やめる';"}]),['なおす動き','名人モード','キャラ','とちゅうで やめる'].sort());
  assert.deepEqual(words([{file:'b.js',kind:'script',text:"const e='拡張「できごとの値」は 本文で 使います', f='拡張「できごとの値」と できごと', h='## できごとのコード', i='自動保存DBを開けません。';"}]),['できごと','自動保存'].sort());
  assert.deepEqual(words([{file:'c.html',kind:'html',text:'<!-- 作業欄 --><p>作る ばしょ</p><button aria-label="自動保存">x</button><script>const g="作業欄";</script>'}]),['作る ばしょ','自動保存'].sort());
  const label='どの きっかけの 本文を なおすかを えらびます';assert.ok(productText.includes(label));
  assert.deepEqual(words([productInput(productText.replace(label,'「なおす動き」で えらびます'))]),['なおす動き']);
  const hint='いまの 本文を のこして 入れる';assert.ok(productText.includes(hint));
  assert.deepEqual(words([productInput(productText.replace(hint,'今の 動きを のこして 自動保存'))]),['自動保存']);
  assert.ok(words([{file:currentProductFile(),kind:'product',text:productText}]).includes('できごと'),'the embedded extension files are in the scanned script');
});
// F-19 (lead decision 32): no unspaced child text beyond the allowlist. An entry no scanned text has any more is a note
// for the next re-record, not a failure (product-source-contract.mjs).
const spacing=JSON.parse(read('audit/fixtures/child-spacing-allowlist.json')),spacingInputs=[productInput(productText),...manuals.map(file=>({file,kind:'html',text:read(file)}))];
const allowed=spacing;
check('CHILD-SPACING-RUNS',()=>{assert.equal(spacing.schema,'akari-child-spacing-allowlist-v2');assert.equal(spacing.run,CHILD_SPACING_RUN);assert.deepEqual(childSpacingIssues(spacingInputs,allowed),[]);});
// The lint finds an unspaced string, template and markup text, leaves spaced text, quoted parts and allowlisted texts
// alone, and lists an allowlist entry that no text has any more.
check('REJECT-UNSPACED-CHILD-TEXT',()=>{
  const rules={runs:[{text:'もどせません',reason:'動詞もどすの可能形・丁寧否定の一文節'}],codeLiterals:[{text:'いまのばしょから',reason:'共通の移動文のコードだけのリテラル'}]};
  const issues=text=>childSpacingIssues([{file:'a.js',kind:'script',text}],rules);
  assert.deepEqual(issues("const a='ここを おして はじめる',b='もどせません',c='「ここをおしてはじめる」と 書きます',d='いまのばしょから';"),[]);
  assert.equal(issues("const a='前に ここをおしてはじめる';")[0].run,'ここをおしてはじめる','a space elsewhere never hides a bad run');
  assert.equal(issues("const a='もどせません。ここをおしてはじめる';")[0].run,'ここをおしてはじめる','a permitted run never exempts the rest of a message');
  assert.equal(issues("const a='説明は いまのばしょからです';")[0].run,'いまのばしょからです','a code literal never exempts mixed prose');
  assert.equal(issues("const a=`ここをおしてはじめる`; ")[0].run,'ここをおしてはじめる','JS delimiters are not quoted child content');
  for(const field of ['source','sample'])assert.equal(issues(`const help={${field}:'説明は ここをおしてはじめる'};`)[0].run,'ここをおしてはじめる','property names never exempt presentation prose');
  for(const attr of ['aria-label','title','placeholder','alt'])assert.equal(childSpacingIssues([{file:'a.html',kind:'html',text:`<input ${attr}="前に ここをおしてはじめる">`}],rules)[0].run,'ここをおしてはじめる','child-facing HTML attributes are checked');
  assert.equal(issues("const a='（ここをおしてはじめる）';")[0].run,'ここをおしてはじめる','parentheses do not quote code');
  assert.equal(issues("const a='「例：ここをおしてはじめる';")[0].run,'ここをおしてはじめる','an unmatched quote cannot hide remaining prose');
  assert.deepEqual(issues('const a=`「名前：${name}『本文』」を おしてね`;'),[],'balanced nested quotes survive template interpolation');
  const label="'じゅんび できたよ'";assert.ok(productText.includes(label));
  assert.ok(childSpacingIssues([productInput(productText.replace(label,"'先に じゅんびできたよ'"))],spacing).some(i=>i.run==='じゅんびできたよ'));
});

// Dispatch values (AUDIT.md「ソースの一致」): a value a property is compared with is written somewhere in the product.
const scriptText=productScript(read).text;
check('SOURCE-DISPATCH-VALUES',()=>assert.deepEqual(dispatchValueIssues(scriptText),[]));
// A renamed node kind that a check still names is found, as is a value only a comparison has; an allowance that
// matches nothing any more is refused, so the list cannot keep a reason for a value that is gone.
check('REJECT-UNPRODUCED-DISPATCH-VALUE',()=>{
  const kept="n.kind === 'ListRead') expect(child(n.index)";assert.ok(scriptText.includes(kept));
  assert.ok(dispatchValueIssues(scriptText.replace(kept,"n.kind === 'ListItemRead') expect(child(n.index)")).some(i=>i.includes("'ListItemRead'")));
  const probe=line=>dispatchValueIssues(scriptText+'\n'+line+'\n');
  assert.ok(probe("if (probe.op === 'NeverWrittenOp') {}").some(i=>i.includes("op === 'NeverWrittenOp'")));
  assert.ok(probe("switch (probe.event) { case 'NeverWrittenEvent': break; }").some(i=>i.includes('NeverWrittenEvent')));
  assert.ok(probe("['NeverWrittenRole'].includes(probe.role);").some(i=>i.includes('NeverWrittenRole')));
  assert.deepEqual(probe("const made = {kind: 'MadeHere'}; if (made.kind === 'MadeHere') {}"),[]);
});
check('REJECT-STALE-DISPATCH-ALLOWANCE',()=>assert.ok(dispatchValueIssues(scriptText,[...DISPATCH_ALLOWED,{property:'kind',value:'GoneKind',reason:'test'}]).some(i=>i.includes("allowance kind 'GoneKind'"))));
// DOM references (AUDIT.md「ソースの一致」): an element id looked up and a data-* attribute read are given or written.
const pageText=read('src/akari.html');
check('SOURCE-DOM-REFERENCES',()=>assert.deepEqual(domReferenceIssues(scriptText,pageText),[]));
check('REJECT-UNGIVEN-DOM-REFERENCE',()=>{
  const probe=line=>domReferenceIssues(scriptText+'\n'+line+'\n',pageText);
  for(const [line,found]of [["document.getElementById('neverGivenId');",'element id neverGivenId'],["document.querySelector('#neverGivenSel .x');",'element id neverGivenSel'],
    ['el.dataset.neverWritten;','data-never-written'],["el.closest('[data-never-matched]');",'data-never-matched'],["el.getAttribute('data-never-read');",'data-never-read']])
    assert.ok(probe(line).some(i=>i.includes(found)),line);
  // Written through dataset, an attribute object, a chosen attribute name or markup, the same name is not reported.
  for(const line of ["el.dataset.madeHere='1'; el.dataset.madeHere;","E('p','',{'data-made-attr':1}); el.dataset.madeAttr;","E('p','',{[c?'data-made-a':'data-made-b']:1}); el.dataset.madeB;",
    "x.innerHTML='<p id=\"madeInMarkup\"></p>'; document.getElementById('madeInMarkup');"])
    assert.deepEqual(probe(line),[],line);
});
// Diagnostic codes (AUDIT.md「ソースの一致」): a code the product raises is named by an audit file, or still in the
// shrinking list of codes no audit file named when the check began. The list itself is not read as naming.
const auditTexts=trackedFiles(repositoryRoot).filter(file=>file.startsWith('audit/')&&file!=='audit/lib/source-consistency.mjs'&&!/\.(png|jpe?g|webp|mp3|wav|m4a|ogg|ttf|woff2?)$/.test(file)).map(read);
check('SOURCE-DIAGNOSTIC-CODES-NAMED',()=>assert.deepEqual(diagnosticCodeIssues(productCodes(scriptText),namedCodes(auditTexts)),[]));
check('REJECT-UNNAMED-DIAGNOSTIC-CODE',()=>{
  const codes=productCodes(scriptText),named=namedCodes(auditTexts);
  // Built from parts, so this file does not itself name the code.
  const fresh='Q'+'999';assert.ok(diagnosticCodeIssues(new Set([...codes,fresh]),named).some(i=>i.includes('raises '+fresh)),'a new code without a test');
  assert.ok(diagnosticCodeIssues(codes,new Set([...named,UNNAMED_CODES[0]])).some(i=>i.includes(UNNAMED_CODES[0]+' is listed as unnamed but an audit file names it')),'a listed code that a test now names');
  const gone=new Set(codes);gone.delete(UNNAMED_CODES[0]);
  assert.ok(diagnosticCodeIssues(gone,named).some(i=>i.includes('no longer has it')),'a listed code the product dropped');
  assert.ok(productCodes("const e = new AkariError('Z123', 'x');").has('Z123'));
});
// ESLint over the product script (AUDIT.md「ソースの一致」): no finding, and each rule refuses its probe.
let lintRun;try{lintRun={messages:await lintText(repositoryRoot,scriptText),probes:Object.fromEntries(await Promise.all(Object.entries(LINT_PROBES).map(async([rule,probe])=>[rule,await lintText(repositoryRoot,probe)])))};}catch(error){lintRun={error};}
check('SOURCE-LINT',()=>{if(lintRun.error)throw lintRun.error;assert.deepEqual(lintFindings(lintRun.messages,scriptText,productScript(read).pieces),[]);});
check('REJECT-LINT-PROBES',()=>{
  if(lintRun.error)throw lintRun.error;
  assert.deepEqual(Object.keys(LINT_PROBES).sort(),Object.keys(LINT_RULES).sort(),'one probe per rule');
  for(const [rule,messages]of Object.entries(lintRun.probes))assert.ok(messages.some(m=>m.ruleId===rule),rule+' refuses its probe; got '+messages.map(m=>m.ruleId).join(','));
});
// Repeated code (AUDIT.md「ソースの一致」): no repetition of 100 tokens beyond the baseline, and no stale baseline entry.
const clonePieces=productScript(read).pieces;
check('SOURCE-CLONES',()=>assert.deepEqual(cloneIssues(sourceClones(scriptText,clonePieces)),[]));
check('REJECT-NEW-CLONE',()=>{
  // A second copy of a long function in the last file is a new repetition; a baseline entry for a repetition that is gone is refused.
  const last=clonePieces.filter(p=>!p.host).at(-1),body=scriptText.slice(scriptText.indexOf('  function replaceUnprotectedWord'),scriptText.indexOf('  function naturalConditionVariants'));
  assert.ok(body.length>200,'the copied function');
  const copied=scriptText.slice(0,last.end)+body.replace('replaceUnprotectedWord','replaceUnprotectedWordAgain')+body.replace('replaceUnprotectedWord','replaceUnprotectedWordThird')+scriptText.slice(last.end);
  const shifted=clonePieces.map(p=>p===last?{...p,end:p.end+copied.length-scriptText.length}:p.start>=last.end?{...p,start:p.start+copied.length-scriptText.length,end:p.end+copied.length-scriptText.length}:p);
  assert.ok(cloneIssues(sourceClones(copied,shifted,20)).some(i=>i.startsWith('clone ')),'a new repetition');
  assert.ok(cloneIssues(sourceClones(scriptText,clonePieces),[...CLONE_BASELINE,{id:'0000000000000000',what:'gone'}]).some(i=>i.includes('0000000000000000')),'a stale entry');
});
// Shown text as state (AUDIT.md「ソースの一致」): no new logic that decides by what an element shows.
const ownPieces=productScript(read).pieces.filter(p=>!p.host),pieceFile=o=>ownPieces.find(p=>p.start<=o&&o<p.end)?.label??'?';
check('SOURCE-SHOWN-TEXT',()=>assert.deepEqual(shownTextIssues(shownTextReads(scriptText,pieceFile),SHOWN_TEXT_BASELINE),[]));
check('REJECT-SHOWN-TEXT-DECISION',()=>{
  const probe=line=>shownTextIssues(shownTextReads(scriptText+'\n'+line+'\n',o=>o>=scriptText.length?'probe':pieceFile(o)),SHOWN_TEXT_BASELINE);
  for(const line of ["if (el.textContent === 'もういちど') retry();","if (el.innerText.startsWith('エラー')) stop();","if (['はい','いいえ'].includes(el.textContent)) go();",
    "if (el.textContent.trim() === 'もういちど') retry();","function f(el){const said=el.innerText;return said==='はい';}","switch (el.textContent) { case 'はい': go(); }",
    "function g(el,ok){const unit=ok?el.textContent.trim():'';return unit.startsWith('歩');}"])assert.ok(probe(line).some(i=>i.startsWith('probe decides by shown text')),line);
  assert.ok(shownTextIssues(shownTextReads(scriptText,pieceFile),[...SHOWN_TEXT_BASELINE,{file:'src/js/x.js',source:'gone'}]).some(i=>i.includes('is gone')),'a stale entry');
});
// Properties read and never written (AUDIT.md「ソースの一致」): each is given by the product, the platform or an allowance.
const platform=platformNames(),unwritten=unwrittenReads(scriptText);
check('SOURCE-UNWRITTEN-PROPERTIES',()=>assert.deepEqual(unwrittenIssues(unwritten,platform),[]));
check('REJECT-UNWRITTEN-PROPERTY',()=>{
  const probe=line=>unwrittenIssues(unwrittenReads(scriptText+'\n'+line+'\n'),platform);
  assert.ok(probe('function probe(o){return o.misspeltPropertyName;}').some(i=>i.includes('.misspeltPropertyName but nothing')),'a misspelt field');
  assert.deepEqual(probe('function probe(o){o.probeGivenField=1;return o.probeGivenField+o.textContent.length;}'),[],'a written field and a platform one');
  assert.deepEqual(probe('function probe(el){el.setAttribute(\'data-probe-flag\',\'1\');return el.dataset.probeFlag;}'),[],'a dataset name its data-* attribute gives');
  assert.ok(unwrittenIssues(unwritten,platform,[...UNWRITTEN_ALLOWED,{name:'goneProbeName',reason:'test'}]).some(i=>i.startsWith('allowance goneProbeName is stale')),'a stale allowance');
});
// Waits by time in the audit code (AUDIT.md「監査のコード」): no file adds one, and one with fewer lowers its entry.
const auditCode=Object.fromEntries(trackedFiles(repositoryRoot).filter(file=>file.startsWith('audit/')&&/\.(?:mjs|cjs|js)$/.test(file)).map(file=>[file,read(file)]));
check('AUDIT-TIME-WAITS',()=>assert.deepEqual(timeWaitIssues(auditCode),[]));
check('REJECT-AUDIT-TIME-WAIT',()=>{
  const [file,text]=Object.entries(auditCode).find(([name])=>WAIT_BASELINE[name]);
  assert.ok(timeWaitIssues({...auditCode,[file]:text+'\nawait page.waitForTimeout(500);\n'}).some(i=>i.startsWith(file+' waits by time')),'one more wait by time');
  assert.ok(timeWaitIssues({...auditCode,'audit/tests/probe-wait.mjs':'await page.waitForTimeout(10);\n'}).some(i=>i.startsWith('audit/tests/probe-wait.mjs waits by time 1 times (at most 0)')),'a new file that waits by time');
  assert.ok(timeWaitIssues({...auditCode,[file]:''}).some(i=>i===file+' waits by time 0 times now; lower its WAIT_BASELINE entry to 0'),'a count that went down');
  assert.deepEqual(timeWaitIssues({...auditCode,'audit/tests/probe-text.mjs':'// page.waitForTimeout(1) in a comment\nconst s="page.waitForTimeout(1)";\n'}),[],'a comment or a string is no wait');
});
// Reads of the product source as text in the audit code: no file adds one; checks take the shared readers' result.
check('AUDIT-SOURCE-READS',()=>assert.deepEqual(sourceReadIssues(auditCode),[]));
check('REJECT-AUDIT-SOURCE-READ',()=>{
  const reading=['const s=fs.readFileSync(\'src/js/04-syntax-sentences.js\',\'utf8\');','const s=read(path.join(root,\'src/js/x.js\'));',
    'const html=fs.readFileSync(currentProductFile(),\'utf8\');','const t=text(`src/js/${name}.js`);','const h=readFileSync(\'Akari_1_0_0.html\',\'utf8\');'];
  for(const line of reading)assert.ok(sourceReadIssues({...auditCode,'audit/tests/probe-read.mjs':line+'\n'}).some(i=>i.startsWith('audit/tests/probe-read.mjs reads the product source as text 1 times (at most 0)')),line);
  const [file]=Object.keys(SOURCE_READ_BASELINE);
  assert.ok(sourceReadIssues({...auditCode,[file]:''}).some(i=>i===file+' reads the product source as text 0 times now; lower its SOURCE_READ_BASELINE entry to 0'),'a count that went down');
  assert.deepEqual(sourceReadIssues({...auditCode,'audit/tests/probe-other.mjs':'const s=fs.readFileSync(\'audit/fixtures/x.json\',\'utf8\');\nconst t="readFileSync(\'src/js/x.js\')";\n'}),[],'another file, or a read written in a string');
});
// ESLint over the audit code: no file adds a finding of a rule; one with fewer lowers its entry.
const auditLintRun=await auditLintCounts(repositoryRoot,auditCode).then(counts=>({counts}),error=>({error}));
check('AUDIT-LINT',()=>{if(auditLintRun.error)throw auditLintRun.error;assert.deepEqual(auditLintIssues(auditLintRun.counts,auditCode),[]);});
const probeLint=await auditLintCounts(repositoryRoot,{'audit/tests/probe-lint.mjs':"import fs from 'node:fs';\nconst unused=1;\nundefinedHelper(fs);\nexport function a(v) {\n  const x = v + fs.length;\n  const y = x * 2;\n  return y - 3;\n}\nexport function b(v) {\n  const x = v + fs.length;\n  const y = x * 2;\n  return y - 3;\n}\n",
  'audit/tests/probe-page.mjs':"export const run=page=>page.evaluate(()=>{__pageProbe.push(document.title);return Akari.version;});\n",'audit/suites/probe-suite.js':'undefinedInSuite();\n'}).then(counts=>({counts}),error=>({error}));
check('REJECT-AUDIT-LINT',()=>{
  if(probeLint.error)throw probeLint.error;
  assert.deepEqual(probeLint.counts,{'audit/tests/probe-lint.mjs':{'no-undef':1,'no-unused-vars':1,'sonarjs/no-identical-functions':1}},'a name not defined, a name not used and a copied function; a page name and the suites are not findings');
  assert.ok(auditLintIssues({...auditLintRun.counts,...probeLint.counts},{...auditCode,'audit/tests/probe-lint.mjs':''}).some(i=>i==='audit/tests/probe-lint.mjs has 1 no-undef findings (at most 0)'),'a new finding');
  const [file]=Object.keys(LINT_BASELINE);
  assert.ok(auditLintIssues({...auditLintRun.counts,[file]:{}},auditCode).some(i=>i.startsWith(file+' has 0 ')&&i.includes('lower its LINT_BASELINE entry to 0')),'a count that went down');
});
const report={schema:'akari-product-source-v1',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:snapshot(currentProductFile()),productSha256:sha(product),buildSha256:sha(Buffer.from(built.html,'utf8')),sources:built.sources,results,sourceSizes:sizes.filter(s=>s.lines>SOURCE_SPLIT_LINES)};
assert.deepEqual(results.map(r=>r.id),productSourceIds);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
if(report.status!=='PASS'){console.error(JSON.stringify(results.filter(r=>r.status!=='PASS'),null,2));process.exitCode=1;}
else{verifyProductSource(report,snapshot(currentProductFile()));console.log('Product source build: '+results.length+' PASS');}
