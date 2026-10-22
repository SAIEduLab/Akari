import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {buildProduct,repositoryRoot,sourceDirectories} from '../../src/build.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {productSourceIds,verifyProductSource,childGlossaryIssues,childSpacingIssues,CHILD_SPACING_RUN} from '../lib/product-source-contract.mjs';

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
  const label='「きっかけ」で <span class="child-word">えらびます</span>';assert.ok(productText.includes(label));
  assert.deepEqual(words([productInput(productText.replace(label,'「なおす動き」で えらびます'))]),['なおす動き']);
  const hint='いまの 本文を のこして 入れる';assert.ok(productText.includes(hint));
  assert.deepEqual(words([productInput(productText.replace(hint,'今の 動きを のこして 自動保存'))]),['自動保存']);
  assert.ok(words([{file:currentProductFile(),kind:'product',text:productText}]).includes('できごと'),'the embedded extension files are in the scanned script');
});
// F-19 (lead decision 32): no unspaced child text beyond the allowlist, and no allowlist entry that is gone.
const spacing=JSON.parse(read('audit/fixtures/child-spacing-allowlist.json')),spacingInputs=[productInput(productText),...manuals.map(file=>({file,kind:'html',text:read(file)}))];
const allowed=Object.values(spacing.texts).flat();
check('CHILD-SPACING-RUNS',()=>{assert.equal(spacing.schema,'akari-child-spacing-allowlist-v1');assert.equal(spacing.run,CHILD_SPACING_RUN);assert.deepEqual(childSpacingIssues(spacingInputs,allowed),[]);});
// The lint finds an unspaced string, template and markup text, leaves spaced text, quoted parts and allowlisted texts
// alone, and lists an allowlist entry that no text has any more.
check('REJECT-UNSPACED-CHILD-TEXT',()=>{
  const texts=(files,list=[])=>childSpacingIssues(files,list).map(i=>i.text).sort();
  assert.deepEqual(texts([{file:'a.js',kind:'script',text:"// ここをおしてはじめる\nconst a='ここをおしてはじめる', b=`うごかしてみよう`, c='ここを おして はじめる', d='「いまのばしょから」と書く', e='いまのばしょから';"}],['いまのばしょから','もうないもじれつ']),['ここをおしてはじめる','うごかしてみよう'].sort());
  assert.deepEqual(childSpacingIssues([{file:'a.js',kind:'script',text:"const e='いまのばしょから';"}],['いまのばしょから','もうないもじれつ'],{stale:true}),['もうないもじれつ']);
  assert.deepEqual(texts([{file:'b.html',kind:'html',text:'<!-- ここをおしてはじめる --><p>ここをおしてはじめる</p><p>ここを おして はじめる</p><code>いまのばしょから</code><ruby>以上<rt>いじょう</rt></ruby>'}]),['ここをおしてはじめる']);
  const label="'じゅんび できたよ'";assert.ok(productText.includes(label));
  assert.deepEqual(childSpacingIssues([productInput(productText.replace(label,"'じゅんびできたよ'"))],spacing.texts[currentProductFile()]).map(i=>i.text),['じゅんびできたよ']);
});
const report={schema:'akari-product-source-v1',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:snapshot(currentProductFile()),productSha256:sha(product),buildSha256:sha(Buffer.from(built.html,'utf8')),sources:built.sources,results};
assert.deepEqual(results.map(r=>r.id),productSourceIds);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
if(report.status!=='PASS'){console.error(JSON.stringify(results.filter(r=>r.status!=='PASS'),null,2));process.exitCode=1;}
else{verifyProductSource(report,snapshot(currentProductFile()));console.log('Product source build: '+results.length+' PASS');}
