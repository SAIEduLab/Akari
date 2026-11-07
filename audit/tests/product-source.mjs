import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {buildProduct,repositoryRoot,sourceDirectories} from '../../src/build.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {productSourceIds,verifyProductSource,childGlossaryIssues,childSpacingIssues,CHILD_SPACING_RUN} from '../lib/product-source-contract.mjs';
import {productScript,embeddedSources,sourceSizes,SOURCE_SIZE_LINES} from '../lib/product-script.mjs';
import {dispatchValueIssues,DISPATCH_ALLOWED,domReferenceIssues,productCodes,namedCodes,diagnosticCodeIssues,UNNAMED_CODES,shownTextReads,shownTextIssues,SHOWN_TEXT_BASELINE,platformNames,unwrittenReads,unwrittenIssues,UNWRITTEN_ALLOWED} from '../lib/source-consistency.mjs';
import {trackedFiles} from '../lib/publication-contract.mjs';
import {lintText,lintFindings,LINT_PROBES,LINT_RULES} from '../lib/source-lint.mjs';
import {sourceClones,cloneIssues,CLONE_BASELINE} from '../lib/source-clones.mjs';
import {timeWaitIssues,WAIT_BASELINE,sourceReadIssues,SOURCE_READ_BASELINE,auditLintCounts,auditLintIssues,LINT_BASELINE} from '../lib/audit-code.mjs';
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
// The product script as the checks below read it (audit/lib/product-script.mjs), character for character, and made of
// the files the build took.
check('PRODUCT-SCRIPT-PIECES',()=>{
  const html=built.html,open=html.indexOf('<script>\n')+'<script>\n'.length,script=productScript(read);
  assert.equal(script.text,html.slice(open,html.lastIndexOf('</script>')));
  assert.deepEqual([...new Set(script.pieces.map(p=>p.label))].sort(),built.sources.filter(file=>!file.endsWith('.html')&&!file.endsWith('.css')).sort());
});
// The exported player embeds these functions alone; they must run without the editor's closure.
check('PORTABLE-EMBEDDED-RUN',()=>{
  const sources=embeddedSources(read),context=vm.createContext({});
  vm.runInContext("'use strict';\n"+Object.values(sources).join('\n')+'\nglobalThis.runtime=createAkariRuntime();',context);
  assert.equal(context.runtime.eventText('keyDown',{key:'空白'}),'「スペース」キーを おした とき');
});
// Sizes (AUDIT.md「ソースの境界」): no file of the product script is longer than SOURCE_SIZE_LINES.
let sizes=[];
const productFiles=reader=>[...new Set(productScript(reader).pieces.map(p=>p.label))];
check('SOURCE-SIZE',()=>{
  sizes=sourceSizes(read,productFiles(read));
  assert.deepEqual(sizes.filter(s=>s.lines>SOURCE_SIZE_LINES).map(s=>s.file),[],'split the files over the size');
  const grown=productFiles(read).filter(f=>/^src\//.test(f)).at(-1),over={[grown]:read(grown)+'//\n'.repeat(SOURCE_SIZE_LINES)};
  const reader=f=>f in over?over[f]:read(f);assert.ok(sourceSizes(reader,productFiles(reader)).some(s=>s.file===grown&&s.lines>SOURCE_SIZE_LINES),'a file over the size is found');
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
const report={schema:'akari-product-source-v1',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:snapshot(currentProductFile()),productSha256:sha(product),buildSha256:sha(Buffer.from(built.html,'utf8')),sources:built.sources,results,sourceSizes:sizes.filter(s=>s.lines>SOURCE_SIZE_LINES)};
assert.deepEqual(results.map(r=>r.id),productSourceIds);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
if(report.status!=='PASS'){console.error(JSON.stringify(results.filter(r=>r.status!=='PASS'),null,2));process.exitCode=1;}
else{verifyProductSource(report,snapshot(currentProductFile()));console.log('Product source build: '+results.length+' PASS');}
