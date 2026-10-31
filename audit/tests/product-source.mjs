import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {buildProduct,repositoryRoot,sourceDirectories} from '../../src/build.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {productSourceIds,verifyProductSource,childGlossaryIssues,childSpacingIssues,CHILD_SPACING_RUN} from '../lib/product-source-contract.mjs';
import {readBoundaries,sourceUses,closureReferences,boundaryIssues,embeddedSources,productScript} from '../lib/source-boundaries.mjs';
import vm from 'node:vm';

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
  const {boundaries}=state(),line="KEY_SURFACES[key] : key;";assert.ok(coreText.includes(line));
  const issues=boundaryIssues(usesWith({[core]:coreText.replace(line,'KEY_SURFACES[key] : keyName(key);')}),boundaries);
  assert.ok(issues.includes('createAkariRuntime is embedded through toString() but uses closure names: keyName'),JSON.stringify(issues));
  const keyNameFile=Object.keys(boundaries).find(file=>read(file).includes('  function keyName('));assert.ok(keyNameFile);
  assert.ok(issues.some(i=>i.startsWith(core+' uses '+keyNameFile+' without declaring')),JSON.stringify(issues));
  const global=boundaryIssues(usesWith({[core]:coreText.replace(line,'KEY_SURFACES[key] : globalThis.Akari && key;')}),boundaries);
  assert.ok(global.includes('createAkariRuntime is embedded through toString() but reads what the product puts on the global object: Akari'),JSON.stringify(global));
  const destructured=boundaryIssues(usesWith({[core]:coreText.replace(line,'KEY_SURFACES[key] : (({Akari: q} = globalThis), key);')}),boundaries);
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
check('REJECT-UNEMBEDDED-PORTABLE',()=>{const line='// @portable extensions/foundation.js\n';assert.ok(coreText.includes(line));assert.throws(()=>variant({[core]:coreText.replace(line,'')}),/portable extensions not embedded: extensions\/foundation\.js/);});
// F-23: the strings of the product (its screens and the exported player) and the manuals use no banned variant. The
// portable extension files built into the product are the fork developers' interface and are left out.
// The manuals are public only (PUBLIC_SYNC.json); an internal checkout scans the product alone, the public one both.
const boundary=fs.existsSync(path.join(repositoryRoot,'PUBLIC_SYNC.json'))?JSON.parse(read('PUBLIC_SYNC.json')):null;
if(boundary)assert.ok(['MANUAL.html','Manual/**'].every(file=>boundary.publicOnly.includes(file))&&!fs.existsSync(path.join(repositoryRoot,'Manual')),'an internal checkout holds no public-only manual');
const manuals=boundary?[]:['MANUAL.html',...list('Manual').filter(file=>file.endsWith('.html'))];
const embedded=['extensions/foundation.js','extensions/profiles.js'].map(file=>{const text=read(file).replace(/\n$/,'');return text.slice(0,text.lastIndexOf('\n')+1);});
const productText=product.toString('utf8'),productInput=text=>({file:currentProductFile(),kind:'product',text,embedded});
check('CHILD-GLOSSARY-ONE-WORD',()=>{assert.ok(boundary||manuals.length>=6,'the manuals are scanned');assert.deepEqual(childGlossaryIssues([productInput(productText),...manuals.map(file=>({file,kind:'html',text:read(file)}))]),[]);});
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
// F-19 (lead decision 32): no unspaced child text beyond the allowlist, and no allowlist entry that is gone.
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

const report={schema:'akari-product-source-v1',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:snapshot(currentProductFile()),productSha256:sha(product),buildSha256:sha(Buffer.from(built.html,'utf8')),sources:built.sources,results};
assert.deepEqual(results.map(r=>r.id),productSourceIds);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
if(report.status!=='PASS'){console.error(JSON.stringify(results.filter(r=>r.status!=='PASS'),null,2));process.exitCode=1;}
else{verifyProductSource(report,snapshot(currentProductFile()));console.log('Product source build: '+results.length+' PASS');}
