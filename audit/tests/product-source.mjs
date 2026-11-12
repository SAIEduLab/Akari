import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {buildProduct,compileModule,repositoryRoot,sourceDirectories} from '../../src/build.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {productSourceIds,verifyProductSource,childGlossaryIssues,childSpacingIssues,CHILD_SPACING_RUN} from '../lib/product-source-contract.mjs';
import {productScript,embeddedSources,sourceSizes,SOURCE_SIZE_LINES} from '../lib/product-script.mjs';
import {dispatchValueIssues,DISPATCH_ALLOWED,domReferenceIssues,productCodes,namedCodes,diagnosticCodeIssues,UNNAMED_CODES,shownTextReads,shownTextIssues,SHOWN_TEXT_BASELINE,platformNames,unwrittenReads,unwrittenIssues,UNWRITTEN_ALLOWED} from '../lib/source-consistency.mjs';
import {trackedFiles} from '../lib/publication-contract.mjs';
import {lintText,lintFindings,LINT_PROBES,LINT_RULES} from '../lib/source-lint.mjs';
import {sourceClones,cloneIssues,CLONE_BASELINE} from '../lib/source-clones.mjs';
import {timeWaitIssues,WAIT_BASELINE,timerPromiseIssues,TIMER_PROMISE_COUNTS,sourceReadIssues,SOURCE_READ_BASELINE,scopedReadIssues,scopedSourceReads,SCOPED_SOURCE_READS,copyReadIssues,PRODUCT_COPY_READS,auditLintCounts,auditLintIssues,LINT_BASELINE} from '../lib/audit-code.mjs';
import {refusalReasonIssues,reasonlessRefusals,refusalHelperCopies} from '../lib/audit-code.mjs';
import {refusedWith,refusedAs} from '../lib/refusal.cjs';
import vm from 'node:vm';
import nodeModule,{createRequire} from 'node:module';
import {typeCheck,typeIssues,FILLED_BAGS,tsconfigFindings,PINNED_OPTIONS,PARAMETER_CASTS} from '../lib/type-check.mjs';
import {syntaxTypes,syntaxTypesFile} from '../lib/syntax-types.mjs';
import {meijinDeclarationsFile,runtimeFormMismatches} from '../lib/runtime-forms.mjs';
import {pageTypes,pageTypesFile,repositoryPage,MADE_BY_SCRIPT} from '../lib/page-types.mjs';
import {captureGroups,captureMismatches} from '../lib/capture-parts.mjs';
const require=createRequire(import.meta.url);
// An import's `from` clause, for the module texts the checks write (built here so no audit scan reads it as an import).
const importFrom=file=>"from '"+file+"'";

const output=path.resolve(process.argv[2]||'audit-evidence/product-source.json');
assert.ok(!fs.existsSync(output),'fresh result required: '+output);
const read=file=>fs.readFileSync(path.join(repositoryRoot,file),'utf8');
const list=dir=>fs.readdirSync(path.join(repositoryRoot,dir)).sort().map(name=>dir+'/'+name);
// Build with one file's text replaced, or with an extra listed source file.
const variant=(changes={},extra={})=>buildProduct({read:file=>file in changes?changes[file]:read(file),list:dir=>[...list(dir),...(extra[dir]||[])]});
const product=fs.readFileSync(currentProductFile()),built=buildProduct(),script=productScript(read),results=[];
function check(id,fn){try{fn();results.push({id,status:'PASS'});}catch(error){results.push({id,status:'FAIL',error:error.stack});}}
// Template and module text with one line rewritten.
const template=read('src/akari.html'),apiLine='<!-- @include ts/12-public-api.ts -->\n';
const withInclude=(...names)=>({'src/akari.html':template.replace(apiLine,names.map(name=>'<!-- @include '+name+' -->\n').join(''))});
const composer='src/ts/01-runtime.ts',composerText=read(composer),exporter=built.portableList,exporterText=read(exporter);
const withLine=(file,text,old,replacement)=>{assert.equal(text.split(old).length,2,file+' has the line once: '+old);return {[file]:text.replace(old,replacement)};};

check('PRODUCT-SOURCE-BYTES',()=>{assert.equal(built.file,currentProductFile());assert.ok(product.equals(Buffer.from(built.html,'utf8')),'committed product differs from the build of src/');});
check('PRODUCT-SOURCE-COMPLETE',()=>{const all=sourceDirectories.flatMap(list);assert.ok(all.length>0);for(const file of all)assert.ok(built.sources.includes(file),file);});
// The portable extensions are in the product, as portable modules the exported player embeds.
check('PRODUCT-SOURCE-PORTABLE-EXTENSIONS',()=>{
  assert.deepEqual(built.sources.filter(file=>file.startsWith('extensions/')).sort(),['extensions/foundation.ts','extensions/profiles.ts']);
  for(const file of ['extensions/profiles.ts','extensions/foundation.ts']){assert.ok(built.portable.includes(file),file+' is portable');assert.ok(script.pieces.some(p=>p.label===file&&p.extension),file+' is in the script');}
});
const sample=list('src/ts').at(-1);
check('REJECT-CHANGED-SOURCE',()=>{const text=read(sample),code='.Akari = Akari';assert.ok(text.includes(code));assert.notEqual(variant({[sample]:text.replace(code,'.Akira = Akari')}).html,built.html);});
check('REJECT-CHANGED-EXTENSION',()=>{const file='extensions/profiles.ts',text=read(file);assert.notEqual(variant({[file]:'// changed\n'+text}).html,built.html);});
check('REJECT-UNINCLUDED-SOURCE',()=>assert.throws(()=>variant({'src/ts/99-orphan.ts':'\n'},{'src/ts':['src/ts/99-orphan.ts']}),/not included/));
check('REJECT-DUPLICATE-INCLUDE',()=>assert.throws(()=>variant(withInclude('ts/12-public-api.ts','ts/12-public-api.ts')),/included twice/));
check('REJECT-MALFORMED-DIRECTIVE',()=>{
  assert.throws(()=>variant({'src/akari.html':template.replace(apiLine,'<!-- @include  ts/12-public-api.ts -->\n')}),/malformed directive/);
  assert.throws(()=>variant({'src/akari.html':template.replace(apiLine,'<!-- @portable-list ts/12-public-api.ts -->\n')}),/malformed directive/);
});
// A second spelling of an included file is the same target, so it is a duplicate.
check('REJECT-ALIAS-DUPLICATE-INCLUDE',()=>{for(const alias of ['ts/./12-public-api.ts','ts//12-public-api.ts','css/../ts/12-public-api.ts'])assert.throws(()=>variant(withInclude('ts/12-public-api.ts',alias)),/included twice: src\/ts\/12-public-api\.ts/,alias);});
// Traversal out of src/css and src/ts, including into src/ itself, and files of extensions/ that are not portable.
check('REJECT-INCLUDE-OUTSIDE-SOURCE',()=>{for(const target of ['ts/../build.mjs','css/../../index.html','ts/../akari.html','ts','../extensions/types.d.ts','../extensions/build.mjs'])assert.throws(()=>variant(withInclude(target)),/include outside src\/css or src\/ts and the portable extensions/,target);});
// The only spelling of a file through another source directory is still refused.
check('REJECT-INCLUDE-ALIAS',()=>{for(const alias of ['css/../ts/12-public-api.ts','ts/./12-public-api.ts','ts//12-public-api.ts'])assert.throws(()=>variant(withInclude(alias)),/include alias/,alias);});
// A module goes in the script and a style sheet in the style.
check('REJECT-INCLUDE-PLACE',()=>{
  const css=list('src/css')[0].slice('src/'.length),styleLine='<!-- @include '+css+' -->\n';assert.ok(template.includes(styleLine));
  assert.throws(()=>variant({'src/akari.html':template.replace(styleLine,'').replace(apiLine,apiLine+styleLine)}),/the script includes the \.ts modules/);
  assert.throws(()=>variant({'src/akari.html':template.replace(apiLine,'').replace(styleLine,styleLine+apiLine)}),/the script includes the \.ts modules/);
  assert.ok(template.includes('<body'));assert.throws(()=>variant({'src/akari.html':template.replace(styleLine,'').replace(/(<body[^>]*>\n)/,'$1'+styleLine)}),/the script includes the \.ts modules/,'a style sheet outside the style');
});
check('REJECT-UNLISTED-PORTABLE',()=>{const other='extensions/other.ts',text="export function other() {\n  'use strict';\n}\n";assert.throws(()=>variant({'src/akari.html':template.replace(apiLine,apiLine+'<!-- @portable ../'+other+' -->\n'),[other]:text}),/include outside src\/css or src\/ts and the portable extensions: \.\.\/extensions\/other\.ts/);});
// The product script as the checks below read it (audit/lib/product-script.mjs), character for character, made of the
// files the build took, with a source line for each of its lines.
check('PRODUCT-SCRIPT-PIECES',()=>{
  const html=built.html,open=html.indexOf('<script>\n')+'<script>\n'.length;
  assert.equal(script.text,html.slice(open,html.lastIndexOf('</script>')));
  assert.deepEqual([...new Set(script.pieces.map(p=>p.label))].sort(),built.sources.filter(file=>!file.endsWith('.css')).sort());
  assert.equal(script.lines.length,script.text.split('\n').length-1,'one source line for each line of the script');
  const at=script.text.indexOf('function createAkariRuntime('),line=script.text.slice(0,at).split('\n').length;
  assert.deepEqual(script.lines[line-1],{file:composer,line:composerText.split('\n').findIndex(l=>l.startsWith('export function createAkariRuntime('))+1});
});
// The exported player embeds these functions alone; they must run without the editor's closure.
check('PORTABLE-EMBEDDED-RUN',()=>{
  const sources=embeddedSources(script),context=vm.createContext({});
  assert.deepEqual(sources.map(s=>s.name),built.portableFunctions.map(f=>f.name));
  vm.runInContext("'use strict';\n"+sources.map(s=>s.text).join('\n')+'\nglobalThis.runtime=createAkariRuntime();',context);
  assert.equal(context.runtime.eventText('keyDown',{key:'空白'}),'「スペース」キーを おしたとき');
});
// The embedded functions use no name that only the editor declares: every name they read is theirs, another embedded
// function's, or the browser's (the lint's closed list).
let freeNameRun;
try{
  const text="'use strict';\n"+embeddedSources(script).map(s=>s.text).join('\n')+'\n',editorName='LIMITS';
  const probe=text.replace(/(function createAkariRuntime\(options\) \{\n( *)'use strict';\n)/,(_,head,indent)=>head+indent+'void '+editorName+';\n');
  freeNameRun={text,probe,editorName,messages:await lintText(repositoryRoot,text),probed:await lintText(repositoryRoot,probe)};
}catch(error){freeNameRun={error};}
const undefinedNames=messages=>messages.filter(m=>m.ruleId==='no-undef').map(m=>m.message);
check('PORTABLE-FREE-NAMES',()=>{if(freeNameRun.error)throw freeNameRun.error;assert.deepEqual(undefinedNames(freeNameRun.messages),[]);});
check('REJECT-PORTABLE-FREE-NAME',()=>{
  if(freeNameRun.error)throw freeNameRun.error;
  assert.notEqual(freeNameRun.probe,freeNameRun.text,'the probe reads a name of the editor in an embedded function');
  const contracts='src/ts/02-language-contracts.ts';assert.ok(compileModule(read(contracts),contracts).declared.includes(freeNameRun.editorName),'the editor declares '+freeNameRun.editorName+' at its top level');
  assert.deepEqual(undefinedNames(freeNameRun.probed),["'"+freeNameRun.editorName+"' is not defined."]);
});
// A portable module holds only functions, each strict by itself, and takes values only from portable modules;
// PORTABLE_FUNCTIONS lists every one of their functions in the template's order.
check('REJECT-PORTABLE-MODULE',()=>{
  assert.throws(()=>variant({[composer]:composerText+'export const LEFT_BEHIND = 1;\n'}),/a portable module holds only functions/);
  assert.throws(()=>variant(withLine(composer,composerText,"export function createAkariRuntime(options?: RuntimeOptions) {\n  'use strict';\n","export function createAkariRuntime(options?: RuntimeOptions) {\n")),/the portable function createAkariRuntime opens with 'use strict';/);
  assert.throws(()=>variant({[composer]:"import { LIMITS } "+importFrom('./02-language-contracts.ts')+";\n"+composerText}),/the portable module imports LIMITS from src\/ts\/02-language-contracts\.ts, which is not portable/);
});
check('REJECT-PORTABLE-LIST',()=>{
  const listLine=exporterText.split('\n').find(l=>l.startsWith('export const PORTABLE_FUNCTIONS = Object.freeze(['));assert.ok(listLine,'the list in '+exporter);
  assert.ok(listLine.endsWith(']);'),'the list is frozen');const names=listLine.slice(listLine.indexOf('[')+1,listLine.lastIndexOf(']')).split(', ');assert.deepEqual(names,built.portableFunctions.map(f=>f.name));
  const listed=list=>withLine(exporter,exporterText,listLine,'export const PORTABLE_FUNCTIONS = Object.freeze(['+list.join(', ')+']);');
  assert.throws(()=>variant(listed(names.slice(0,-1))),/PORTABLE_FUNCTIONS lists .*; the functions of the portable modules/,'a function left out');
  assert.throws(()=>variant(listed([...names.slice(1),names[0]])),/PORTABLE_FUNCTIONS lists .*; the functions of the portable modules/,'another order');
  assert.throws(()=>variant({[composer]:composerText+"export function createAkariHelper() {\n  'use strict';\n}\n"}),/the functions of the portable modules, in the order the template includes them, are .*createAkariHelper/,'a new portable function not listed');
  const api='src/ts/12-public-api.ts',apiText=read(api),apiImport="import { PORTABLE_FUNCTIONS, generateStandaloneHtml, packExecutable }",apiEntry='  PORTABLE_FUNCTIONS,\n';
  assert.ok(apiText.includes(apiImport)&&apiText.includes(apiEntry),'the public API takes the list');
  assert.throws(()=>variant({...withLine(exporter,exporterText,listLine+'\n',''),[api]:apiText.replace(apiImport,"import { generateStandaloneHtml, packExecutable }").replace(apiEntry,'')}),/PORTABLE_FUNCTIONS is declared 0 times at the top level/,'no list');
  assert.throws(()=>variant({[sample]:read(sample)+'const PORTABLE_FUNCTIONS = [];\n'}),/top-level name PORTABLE_FUNCTIONS is declared by both src\/ts\/08-stage-and-export\.ts and src\/ts\/12-public-api\.ts/,'declared twice');
  assert.throws(()=>variant(withLine(exporter,exporterText,listLine,listLine.replace('const ','let '))),/is a const Object\.freeze\(\[…\]\) of function names/,'a list that can change');
  assert.throws(()=>variant(withLine(exporter,exporterText,listLine,listLine.replace('Object.freeze([','([').replace(']);','];').replace('([','['))),/is a const Object\.freeze\(\[…\]\) of function names/,'a list that is not frozen');
  const imported=exporterText.split('\n').find(l=>l.startsWith('import { mountAkariPlayer }'));assert.ok(imported);
  assert.throws(()=>variant(withLine(exporter,exporterText,imported+'\n','')),/PORTABLE_FUNCTIONS names mountAkariPlayer without importing it from src\/ts\/08-player\.ts/,'a name not imported');
});
// Sizes (AUDIT.md「ソースの境界」): no module of the product script is longer than SOURCE_SIZE_LINES.
let sizes=[];
const productFiles=reader=>[...new Set(productScript(reader).pieces.map(p=>p.label))].filter(f=>f.endsWith('.ts'));
check('SOURCE-SIZE',()=>{
  sizes=sourceSizes(read,productFiles(read));
  assert.deepEqual(sizes.filter(s=>s.lines>SOURCE_SIZE_LINES).map(s=>s.file),[],'split the files over the size');
  const grown=productFiles(read).filter(f=>/^src\//.test(f)).at(-1),over={[grown]:read(grown)+'//\n'.repeat(SOURCE_SIZE_LINES)};
  const reader=f=>f in over?over[f]:read(f);assert.ok(sourceSizes(reader,productFiles(reader)).some(s=>s.file===grown&&s.lines>SOURCE_SIZE_LINES),'a file over the size is found');
});
check('REJECT-UNEMBEDDED-PORTABLE',()=>{
  const line='<!-- @portable ../extensions/foundation.ts -->\n';assert.ok(template.includes(line));
  assert.throws(()=>variant({'src/akari.html':template.replace(line,'')}),/portable extensions not embedded: extensions\/foundation\.ts/);
  assert.throws(()=>variant({'src/akari.html':template.replace(line,line.replace('@portable','@include'))}),/extensions\/foundation\.ts is not @portable/);
});
// Types are erased and nothing else: the module's JavaScript stays as it is written, line for line. Syntax that does
// not erase to JavaScript is refused, as are the module forms the build does not join.
check('ERASE-TYPES',()=>{
  const out=compileModule("import { a } "+importFrom('./a.ts')+";\nimport type { T } "+importFrom('./t.ts')+";\nexport interface Shape { size: number }\nexport type Size = number;\nexport function f<V>(x: number, y?: string): number {\n  const z = x as number satisfies number;\n  return z! + (y ?? '').length;\n}\nexport class C implements Shape {\n  declare kind: string;\n  size = 1;\n  #inner: number = 0;\n}\n",'src/ts/probe.ts');
  assert.equal(out.text,"  function f(x, y) {\n    const z = x;\n    return z + (y ?? '').length;\n  }\n  class C {\n    size = 1;\n    #inner = 0;\n  }\n");
  assert.deepEqual(out.lines,[5,6,7,8,9,11,12,13]);
  assert.deepEqual(out.imports,[{from:'./a.ts',line:1,names:[{name:'a',typeOnly:false}]},{from:'./t.ts',line:2,names:[{name:'T',typeOnly:true}]}]);
  assert.deepEqual(out.exported.map(e=>e.name).sort(),['C','Shape','Size','f']);
  // A string continued over lines keeps its spacing; type arguments of a heritage clause and of an instantiation, the
  // ? of an optional method and a this parameter go; a comment at the end of the line before a removed type stays.
  const erased=text=>compileModule(text,'src/ts/probe.ts').text;
  assert.equal(erased("export const s = 'ab\\\ncd';\n"),"  const s = 'ab\\\ncd';\n");
  assert.equal(erased('class Sub extends Base<number> {}\nconst g = f<string>;\n'),'  class Sub extends Base {}\n  const g = f;\n');
  assert.equal(erased('class A { m?(): void {} }\n'),'  class A { m() {} }\n');
  assert.equal(erased('function f(this: X /* c */, a: number) {}\nfunction g(this: X,) {}\n'),'  function f(a) {}\n  function g() {}\n');
  assert.equal(erased('const a = 1; // keep\ntype T = number;\nconst b = 2;\n'),'  const a = 1; // keep\n  const b = 2;\n');
  // The parentheses written only for the type of an arrow function's one parameter go with the type; comments stay.
  assert.equal(erased('export const f = (x: number) => x + 1;\nexport const g = (x) => x;\nexport const h = async (x: number): Promise<number> => x;\n'),'  const f = x => x + 1;\n  const g = (x) => x;\n  const h = async x => x;\n');
  assert.equal(erased('// what T is\nexport type T = number;\nexport const a = 1;\n'),'  // what T is\n  const a = 1;\n');
  // So do the parentheses written only to cast a name or a member chain; those around any other cast stay.
  assert.equal(erased('export const a = (x as Y).z + (o.p[0] as Y).q + (f() as G)(1) + (this as Y).w;\n'),'  const a = x.z + o.p[0].q + f()(1) + this.w;\n');
  assert.equal(erased('export const b = (a?.b as Y).c + (x + 1 as number) + new (f() as C)() + typeof(x as Y);\n'),'  const b = (a?.b).c + (x + 1) + new (f())() + typeof(x);\n');
  assert.equal(erased('export const c = (a?.b as Y)?.c + (a?.[0] as Y)?.[1] + (f?.() as G)?.();\n'),'  const c = a?.b?.c + a?.[0]?.[1] + f?.()?.();\n');
  // They stay where going would change the program: after type parameters (async<T>(x: T) => is no asyncx =>) and over
  // lines (return ( … ).y returns the member, not nothing).
  assert.equal(erased('export const d = async<T>(x: T) => x;\n'),'  const d = async(x) => x;\n');
  assert.equal(erased('export function e(o: { x: { y: number } }) {\n  return (\n    o.x as { y: number }\n  ).y;\n}\n'),'  function e(o) {\n    return (\n      o.x\n    ).y;\n  }\n');
});
check('REJECT-UNERASABLE-SYNTAX',()=>{
  const refused=(text,why)=>assert.throws(()=>compileModule(text,'src/ts/probe.ts'),{message:why},text);
  refused('export enum E { A }\n',/enum does not erase/);
  refused('namespace N { export const a = 1; }\n',/namespace and module declarations/);
  refused('declare global { const g: number; }\n',/namespace and module declarations/);
  refused('export class C { constructor(readonly a: number) {} }\n',/parameter properties/);
  refused('export class C { @d m() {} }\n',/decorators are not used/);
  refused('export const a = <number>b;\n',/use `value as Type`/);
  refused('export function f(c: boolean, g: () => void) {\n  if (c) type X = number;\n  g();\n}\n',/a type declared where a block is not written/);
  refused('export class C { a: number; }\n',/a class field without a value/);
  refused('export class C { a!: number; }\n',/a class field without a value|declared with !/);
  refused('export default function f() {}\n',/default exports are not used/);
  refused('const a = 1;\nexport { a };\n',/export lists and re-exports are not used/);
  refused('var a = 1;\n',/var is not used at the top level/);
  refused("import { a as b } "+importFrom('./a.ts')+";\n",/renames a/);
  refused("import a "+importFrom('./a.ts')+";\n",/default imports are not used/);
  refused("import * as a "+importFrom('./a.ts')+";\n",/only named imports/);
  // A statement without its semicolon, U+2028 in the text, an optional method in an object, an abstract method, and
  // `declare` of a value (it makes nothing).
  refused('const a = xs as number[][]\n[0].length;\n',/end the statement with ";"/);
  refused("export const s = 'a"+String.fromCharCode(0x2028)+"b';\n",/U\+2028 and U\+2029/);
  refused('const o = { m?() {} };\n',/an optional method in an object is not JavaScript/);
  refused('class A { abstract m(): void; f() {} }\n',/abstract members are not used/);
  refused('export declare const ghost: number;\n',/"declare" makes no value/);
  refused('declare class Ghost {}\n',/"declare" makes no value/);
});
check('REJECT-MODULE-LINKS',()=>{
  const first='src/ts/12-public-api.ts',text=read(first);
  assert.throws(()=>variant({[first]:"import { gone } "+importFrom('./02-language-contracts.ts')+";\n"+text}),/src\/ts\/02-language-contracts\.ts exports no gone/);
  assert.throws(()=>variant({[first]:"import { a } "+importFrom('./99-missing.ts')+";\n"+text}),/which the product does not include/);
  assert.throws(()=>variant({[first]:"import { readFileSync } from 'node:fs';\n"+text}),/only the product's own modules/);
  assert.throws(()=>variant({[first]:text+'export function createAkariRuntime() {}\n'}),/top-level name createAkariRuntime is declared by both src\/ts\/01-runtime\.ts and src\/ts\/12-public-api\.ts/);
  // A type of the same name does not hide the value a portable module would take from a module that is not portable.
  const contracts='src/ts/02-language-contracts.ts',player='src/ts/08-player.ts';
  assert.throws(()=>variant({[contracts]:read(contracts)+'export type helperX = number;\nexport function helperX() {}\n',[player]:'import { helperX } '+importFrom('./02-language-contracts.ts')+';\n'+read(player)}),/the portable module imports helperX from src\/ts\/02-language-contracts\.ts, which is not portable/);
  // The shared types are imported as types only.
  assert.throws(()=>variant({[first]:"import { Value } "+importFrom('../../extensions/types.d.ts')+";\n"+text}),/extensions\/types\.d\.ts holds types only: import from it with `import type`/);
  assert.ok(variant({[first]:"import type { Value } "+importFrom('../../extensions/types.d.ts')+";\n"+text}).html===built.html,'a type import changes nothing');
  // A module whose text holds the end tag of a script would end the page's script.
  assert.throws(()=>variant({[first]:text+"export const endTag = '</'+'script>';\nexport const raw = '</script>';\n"}),/the script holds "<\/script"/);
});
// The eraser agrees with Node's own type stripping: for every module, the JavaScript tokens the build writes equal the
// tokens of the build's output for the module as Node strips it (Node puts spaces where the types were). A typed
// sample shows the agreement on type syntax too; a changed token is a disagreement.
// JavaScript tokens only: comments are not compared (Node keeps the comment above a type it strips; the build removes it with the type).
// The program a script is, without where its parts are written and without comments: the build drops parentheses it
// finds written only for a type (`(x: T) =>`, `(x as T).y`), and Node keeps them, so the two are compared as programs.
const programOf=text=>{const ast=require('@babel/parser').parse(text,{sourceType:'script',allowReturnOutsideFunction:true});
  const where=new Set(['start','end','loc','range','extra','leadingComments','trailingComments','innerComments','comments','tokens']);
  return JSON.stringify(ast.program,(key,value)=>where.has(key)?undefined:value);};
const stripped=text=>nodeModule.stripTypeScriptTypes(text,{mode:'strip'});
const typedSample="import type { Shape } "+importFrom('./shape.ts')+";\nexport interface Point { x: number; y: number }\nexport function size(value: string): number;\nexport function size(value: string | readonly unknown[]): number {\n  return value.length;\n}\nexport function first<T>(items: readonly T[], fallback?: T): T | undefined {\n  return (items[0] as T | undefined) ?? fallback!;\n}\nexport class Counter implements Shape {\n  declare kind: string;\n  #count: number = 0;\n  protected readonly step: number = 1;\n  add(this: Counter, n: number): number { return this.#count += n * this.step; }\n}\nexport const pick = <K extends keyof Point,>(p: Point, k: K): Point[K] => p[k];\nexport const table = {a: 1} satisfies Record<string, number>;\n";
check('ERASE-MATCHES-NODE',()=>{
  const modules=built.sources.filter(f=>f.endsWith('.ts'));assert.ok(modules.length>30);
  for(const file of modules){const text=read(file);assert.equal(programOf(compileModule(stripped(text),file).text),programOf(compileModule(text,file).text),file);}
  assert.equal(programOf(compileModule(stripped(typedSample),'src/ts/sample.ts').text),programOf(compileModule(typedSample,'src/ts/sample.ts').text),'the typed sample');
  // Parentheses right after a word stay (async(x: T) =>, return(x: T) =>), and so do those around the callee of a new
  // that has a call in its chain (new (o.f().C as T)() is not new o.f().C()).
  const edgeSample="export const later = async(x: number) => x;\nexport function maker() { return(x: number) => x; }\n"+
    "export const made = (o: { f(): { C: new () => object } }) => new (o.f().C as new () => object)();\nexport const plain = (o: { C: new () => object }) => new (o.C as new () => object)();\n";
  for(const [line,sample] of edgeSample.split('\n').filter(Boolean).map(text=>text+'\n').entries())
    assert.equal(programOf(compileModule(stripped(sample),'src/ts/sample.ts').text),programOf(compileModule(sample,'src/ts/sample.ts').text),'edge sample '+line+': '+sample);
});
check('REJECT-ERASE-MISMATCH',()=>{
  const ours=compileModule(typedSample,'src/ts/sample.ts').text;assert.ok(ours.includes('this.#count += n * this.step'));
  assert.notEqual(programOf(compileModule(stripped(typedSample),'src/ts/sample.ts').text),programOf(ours.replace('this.#count += n * this.step','this.#count += n')),'a part the eraser lost');
});
// The runtime's parts return only names that cannot change (const, function, class): a later part takes them by
// destructuring, so it would keep a stale copy of a let.
const runtimeParts=['src/ts/01-runtime-base.ts','src/ts/01-runtime-model.ts','src/ts/01-runtime-scheduler.ts'];
function partReturnIssues(file,text){
  const ts=require('typescript'),sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),issues=[];
  const fn=sf.statements.find(s=>ts.isFunctionDeclaration(s)&&s.body);if(!fn)return [file+': no part function'];
  const body=fn.body.statements,last=body.at(-1);
  if(!last||!ts.isReturnStatement(last)||!last.expression||!ts.isObjectLiteralExpression(last.expression))return [file+': the part does not end by returning its names'];
  for(const prop of last.expression.properties){
    if(!ts.isShorthandPropertyAssignment(prop)){issues.push(file+': the part returns '+prop.getText(sf)+', not a name');continue;}
    const name=prop.name.text,decl=body.find(s=>(ts.isFunctionDeclaration(s)||ts.isClassDeclaration(s))&&s.name?.text===name||ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>ts.isIdentifier(d.name)?d.name.text===name:d.name.getText(sf).includes(name)));
    if(!decl)issues.push(file+': the part returns '+name+', which it does not declare');
    else if(ts.isVariableStatement(decl)&&!(decl.declarationList.flags&ts.NodeFlags.Const))issues.push(file+': the part returns '+name+', a let');
  }
  return issues;
}
check('RUNTIME-PARTS-CONST',()=>assert.deepEqual(runtimeParts.flatMap(f=>partReturnIssues(f,read(f))),[]));
check('REJECT-RUNTIME-PART-LET',()=>{
  const file=runtimeParts[0],text=read(file),line=text.split('\n').find(l=>/^  const [A-Z_]+ = /.test(l));assert.ok(line,'a const the part returns');
  const name=line.match(/^  const ([A-Z_]+) =/)[1];assert.ok(new RegExp('\\b'+name+'\\b').test(text.slice(text.lastIndexOf('return {'))),name+' is returned');
  assert.deepEqual(partReturnIssues(file,text.replace(line,line.replace('  const ','  let '))),[file+': the part returns '+name+', a let']);
});
// Types (AUDIT.md「型」): the compiler finds no error and no any in any module or declaration file (among the errors, the
// name, import and assignment errors the joined product script would run silently).
// The syntax tree's types (src/types/syntax.d.ts) are what the block schemas make (audit/lib/syntax-types.mjs), and each
// tree the parser reads from the language guide's and the fixtures' texts (as normal and as 名人 text) has them:
// every tree read is written, with its texts as they are (a type takes an op or a qualifier as a literal), as a typed
// value into the type check's program; trees that differ only in their numbers are written once.
const syntaxApi=require('../browser/cases/audit-lib.cjs').loadApi(built.html),syntaxSchemas=syntaxApi.BLOCK_SCHEMAS;
const syntaxExamples=(()=>{const texts=new Set(),collect=v=>{if(typeof v==='string'){if(/[。、]/.test(v)&&v.length<4000)texts.add(v);}else if(Array.isArray(v))v.forEach(collect);else if(v&&typeof v==='object')Object.values(v).forEach(collect);};
  for(const file of list('.').filter(f=>/^\.\/LANGUAGE_[0-9_]+\.md$/.test(f)))for(const m of read(file).matchAll(/```text\n([\s\S]*?)```/g))texts.add(m[1]);
  const fixtures=dir=>fs.readdirSync(path.join(repositoryRoot,dir),{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:1).flatMap(e=>e.isDirectory()?fixtures(dir+'/'+e.name):e.name.endsWith('.json')?[dir+'/'+e.name]:[]);
  for(const file of fixtures('audit/fixtures'))collect(JSON.parse(read(file)));
  const p=syntaxApi.makeDefaultProject(),symbols=syntaxApi.buildSymbols(p),trees=new Map();
  const shape=x=>Array.isArray(x)?'['+x.map(shape).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>k+':'+shape(x[k])).join(',')+'}':typeof x==='number'?'number':JSON.stringify(x);
  for(const text of texts)for(const meijin of [false,true]){let tree;try{tree=syntaxApi.parseScript(text,symbols,{targetId:p.components[0].id,event:'start',meijin});}catch(_){continue;}
    const key=shape(tree);if(!trees.has(key))trees.set(key,JSON.parse(JSON.stringify(tree)));}
  return [...trees.values()];})();
const syntaxCorpusFile='src/ts/zz-syntax-corpus.ts',syntaxCorpus=trees=>"import type { Script } "+importFrom('../types/syntax.d.ts')+";\n"+trees.map((t,i)=>'export const tree'+i+': Script = '+JSON.stringify(t)+';').join('\n')+'\n';
check('SYNTAX-TYPES',()=>{assert.equal(syntaxTypes(syntaxSchemas),read(syntaxTypesFile),syntaxTypesFile+' is not what the block schemas make: run node audit/lib/syntax-types.mjs --write');});
// The members of a block are typed by their keys only while each input is one block, or a list, in every schema.
check('REJECT-BLOCK-INPUT-SHAPES',()=>{assert.throws(()=>syntaxTypes(syntaxSchemas.map(s=>s.id==='Say'?{...s,inputs:s.inputs.map(i=>i.key==='value'?{...i,multiple:true}:i)}:s)),/the input value is one block in a schema and a list in another/);});
check('REJECT-STALE-SYNTAX-TYPES',()=>{const changed=syntaxSchemas.map(s=>s.id==='Say'?{...s,inputs:s.inputs.filter(i=>i.key!=='seconds')}:s);assert.notEqual(syntaxTypes(changed),read(syntaxTypesFile));});
// The forms an exported work's run reads (RUNTIME_FORMS, 01-runtime-restore.ts): each block's parts are what its schema
// says, each form only 名人 text writes has the parts src/types/syntax-base.d.ts says it always has, and no other form is
// there; a table, a schema or a declaration that changed alone is told apart.
const runtimeForms=syntaxApi.createAkariRuntime().RUNTIME_FORMS,meijinDeclarations=read(meijinDeclarationsFile);
check('RUNTIME-FORMS',()=>{assert.equal(runtimeForms.size>180,true);assert.deepEqual(runtimeFormMismatches(runtimeForms,syntaxSchemas,meijinDeclarations),[]);});
check('REJECT-RUNTIME-FORMS',()=>{
  const table=new Map(runtimeForms);table.set('WaitTime',[]);table.delete('PartRandom');table.set('Probe',[]);
  assert.deepEqual(runtimeFormMismatches(table,syntaxSchemas,meijinDeclarations),['WaitTime: the table has , the schema seconds:e','PartRandom: a 名人 form not in the table','Probe: a form no schema and no declaration has']);
  const schemas=syntaxSchemas.map(x=>x.id==='Ask'?{...x,inputs:x.inputs.map(i=>({...i,required:false}))}:x);
  assert.deepEqual(runtimeFormMismatches(runtimeForms,schemas,meijinDeclarations),['Ask: the table has question:e, the schema ']);
  const declarations=meijinDeclarations.replace("kind: 'PartRandom'; list: Expression }","kind: 'PartRandom'; list: Expression; seed: Expression }");
  assert.notEqual(declarations,meijinDeclarations);
  assert.deepEqual(runtimeFormMismatches(runtimeForms,syntaxSchemas,declarations),['PartRandom: the table has list:e, syntax-base.d.ts list:e seed:e']);});
// The elements of the editor's page (src/types/page.d.ts) are what the page and the selectors the application writes
// make, at each run; a page whose element changes makes another file, and a page or a selector the map cannot be made
// from is refused with its reason.
check('PAGE-TYPES',()=>{const {html,sources}=repositoryPage();assert.equal(pageTypes(html,sources),read(pageTypesFile),pageTypesFile+' is not what the page and the sources make: run node audit/lib/page-types.mjs --write');});
check('REJECT-PAGE-TYPES',()=>{const {html,sources}=repositoryPage();assert.ok(html.includes('<textarea id="codeEditor"'));
  assert.notEqual(pageTypes(html.replace('<textarea id="codeEditor"','<input id="codeEditor"'),sources),read(pageTypesFile),'a page whose element changed makes another file');
  const refusal=(page,extra,made=MADE_BY_SCRIPT)=>{try{pageTypes(page,{...sources,'src/ts/11-zz-probe.ts':extra},made);return '';}catch(error){return error.message;}};
  for(const [page,extra,reason]of [[html.replace('</body>','<div id="codeEditor"></div></body>'),'',/two elements have the id codeEditor/],
    [html,"$('#codeEditr');",/"#codeEditr" finds nothing in the page and is not in MADE_BY_SCRIPT/],
    [html,"appCalls.$(ok ? '#codeEditor' : '.no-such-place');",/"\.no-such-place" finds nothing/],[html,"$('button');",/"button" finds \d+ elements of the page/],
    [html,"$('#a[');",/"#a\[" is not one/],[html.replace('</body>','<akariprobe id="probeUnknown"></akariprobe></body>'),'',/<akariprobe> is no element of HTML/],
    [html.replace('</body>','<svg id="probeSvg"></svg></body>'),'',/<svg> is no element of HTML/]])
    assert.match(refusal(page,extra),reason);
  assert.match(refusal(html,'',[...MADE_BY_SCRIPT,'#neverWritten']),/MADE_BY_SCRIPT names "#neverWritten", which no source writes/);
  assert.match(refusal(html.replace('</body>','<div id="listRepairPanel"></div></body>'),''),/MADE_BY_SCRIPT names "#listRepairPanel", which the page has/);
});
let typeRun;try{typeRun=typeCheck(repositoryRoot,{[syntaxCorpusFile]:syntaxCorpus(syntaxExamples)});}catch(error){typeRun={error};}
check('SYNTAX-TYPES-EXAMPLES',()=>{if(typeRun.error)throw typeRun.error;assert.ok(syntaxExamples.length>300,'trees of '+syntaxExamples.length+' shapes');
  assert.deepEqual(typeRun.errors.filter(e=>e.file===syntaxCorpusFile).map(e=>e.line+': '+e.message),[]);});
// A value a type no longer lets a member take (a qualifier taken out of Qualifier) is an error of the trees that hold it.
check('REJECT-SYNTAX-TYPES-EXAMPLES',()=>{const holding=syntaxExamples.filter(t=>JSON.stringify(t).includes('"qualifier":"self"'));assert.ok(holding.length>0,'a tree read with the qualifier self');
  const line="export type Qualifier = null | 'exact' | 'self' | 'project';";assert.equal(meijinDeclarations.split(line).length,2);
  const run=typeCheck(repositoryRoot,{[syntaxCorpusFile]:syntaxCorpus(holding),[meijinDeclarationsFile]:meijinDeclarations.replace(line,"export type Qualifier = null | 'exact' | 'project';")});
  assert.equal(new Set(run.errors.filter(e=>e.file===syntaxCorpusFile).map(e=>e.line)).size,holding.length,'each tree with the qualifier self');});
// The sources as read here, with some texts given instead.
const sourcesWith=texts=>f=>Object.hasOwn(texts,f)?texts[f]:read(f);
// surfaceCapture's parts: each call reads them with the type its pattern gives (a group the match may leave out is
// SourcePart | null), and a pattern read some other way with such a group is named with its reader.
check('CAPTURE-PARTS',()=>{assert.deepEqual(captureMismatches(read),[]);
  assert.deepEqual([captureGroups('^(a)?(b|c)(d)$'),captureGroups('(x(y)?)'),captureGroups('^(a)|(b)$'),captureGroups('(?!(z))w'),captureGroups('(?<n>q){0,2}')],
    [[true,false,false],[false,true],[true,true],[true],[true]]);});
// The module of surfaceCapture, as read here (the capture checks and the type check change it).
const sentencesFile='src/ts/04-syntax-sentences.ts',sentencesText=read(sentencesFile);
check('REJECT-CAPTURE-PARTS',()=>{const file=sentencesFile,text=sentencesText,typed='surfaceCapture<[SourcePart, SourcePart | null]>(/^(.*?)という';assert.ok(text.includes(typed));
  assert.match(captureMismatches(sourcesWith({[file]:text.replace(typed,'surfaceCapture(/^(.*?)という')})).join('\n'),/04-syntax-sentences\.ts:\d+ reads SourcePart\[\] where its pattern gives \[SourcePart, SourcePart \| null\]/);
  assert.match(captureMismatches(sourcesWith({[file]:text+'\nconst probe = /^(a)?b$/d;\n'})).join('\n'),/a group that may be left out and no reader named for it/);
  // A pattern not written in the call is compared too: built with the texts kept near it, given to a helper, or read
  // from a table; one the check cannot build is refused unless every part is read as SourcePart | null.
  const later=/04-syntax-sentences\.ts:\d+ reads SourcePart\[\] where a pattern it may have gives \[SourcePart, SourcePart \| null\]/;
  for(const probe of ["export const probeKept = (code: string) => { const late = '(?:(.+?)秒かけて)?'; return surfaceCapture(new RegExp('^(.+?)' + late + '行く$', 'd'), code); };",
    "const probeHelper = (pattern: string, code: string) => surfaceCapture(new RegExp(pattern, 'd'), code);\nexport const probeGiven = (code: string) => probeHelper('^(.+?)(?:を(.+?))?消す$', code);",
    "const probeTable = [/^(.+?)は(.+?)$/d, /^(.+?)(?:を(.+?))?$/d];\nexport function probeRows(code: string) { for (const pattern of probeTable) surfaceCapture(pattern, code); }"])
    assert.match(captureMismatches(sourcesWith({[file]:text+'\n'+probe+'\n'})).join('\n'),later,probe);
  assert.match(captureMismatches(sourcesWith({[file]:text+'\nexport const probeUnbuilt = (code: string) => surfaceCapture(patternOf(code), code);\n'})).join('\n'),/04-syntax-sentences\.ts:\d+ reads SourcePart\[\] from a pattern the check cannot build/);
  assert.deepEqual(captureMismatches(sourcesWith({[file]:text+'\nexport const probeLoose = (code: string) => surfaceCapture<(SourcePart | null)[]>(patternOf(code), code);\n'})),[],'every part read as SourcePart | null');});
// The program holds every module the product is built from, every example extension and every declaration file, as
// the template and the folders list them (not as tsconfig.json does): a module the program leaves out has no check.
const programModules=[...new Set([...built.sources.filter(f=>f.endsWith('.ts')),...list('extensions').filter(f=>f.endsWith('.ts')),
  ...list('extensions/examples').filter(f=>f.endsWith('.ts')),...list('src/types').filter(f=>f.endsWith('.d.ts'))])];
const missingFromProgram=files=>programModules.filter(f=>!files.includes(f));
check('TYPE-NAMES',()=>{if(typeRun.error)throw typeRun.error;assert.ok(programModules.length>50);assert.deepEqual(missingFromProgram(typeRun.files),[]);assert.deepEqual(typeIssues({...typeRun,errors:typeRun.errors.filter(e=>e.file!==syntaxCorpusFile)}),[]);});
check('REJECT-TYPE-NAMES',()=>{
  const probes={'src/ts/zz-probe-names.ts':'export function probeNames() { return LIMITS; }\n',
    'src/ts/zz-probe-loose.ts':'export function probeLoose(value) { return value; }\n',
    'src/ts/zz-probe-assign.ts':"import { app } "+importFrom('./11-application.ts')+";\nexport function probeAssign() { app = null; }\n",
    'src/ts/zz-probe-import.ts':"import { notExported } "+importFrom('./02-language-contracts.ts')+";\nexport const probeImport = notExported;\n",
    'src/ts/zz-probe-typed.ts':'export function probeTyped(text: string) { const kept: any = text; return JSON.parse(kept); }\nexport function probeHeld() { const seen = new Map(); const made = {} as { size: number }; return [seen, made]; }\nexport const probeWide = ({ a: 1 } as { readonly [key: string]: number })[\'b\'];\nexport const probePaired = (n: number | string) => ({ kind: typeof n === \'number\' ? \'n\' : \'s\', value: n } as { kind: \'n\'; value: number } | { kind: \'s\'; value: string });\n',
    'src/ts/zz-probe-syntax.ts':"import type { Statement } "+importFrom('../types/syntax.d.ts')+";\nexport const probeSyntax: Statement = { kind: 'MotionCommand', op: 'JUMP', xDir: 'right', yDir: 'up', inlineComment: '' };\n",
    'src/ts/zz-probe-older-audio.ts':'export const probeOlderAudio = webkitAudioContext;\n',
    'src/ts/zz-probe-off.ts':'// @ts-ignore\nexport const probeOff: number = \'a\';\n',
    'src/ts/zz-probe-early.ts':'export const probeEarly = later;\nconst later = 1;\n',
    'src/types/zz-probe-ghost.d.ts':'declare const ghostGlobal: number;\ndeclare function clearTimeout(timeout: unknown): void;\n',
    'src/ts/zz-probe-named-given.ts':"export const bump = (m: string, d: number): string => String(d + 1);\nexport const p1 = 'a1'.replace(/(\\d)/g, bump);\nexport const p2 = 'a1'.replace(/(\\d)/g, ((m: string, d: number) => String(d)));\nexport const p3 = 'a1'.replace(/(\\d)/g, (m, d, at, all, extra: string) => extra.toUpperCase());\nfunction keep(k: string, v: number): number { return v; }\nexport const p4 = JSON.stringify({}, keep);\nexport const p5 = 'ab'.replace(/(?<x>a)/, (m, x, at, all, groups: { x: string }) => groups.x);\n",
    'src/ts/zz-probe-given-any.ts':"export const probeJson = (x: object): string => JSON.stringify(x, (k: string, v: string) => v.trim());\nexport const probePort = (port: MessagePort): void => { port.onmessage = (event: MessageEvent<number[]>) => port.postMessage(event.data.length); };\nexport const probeUnknown = (x: object): string => JSON.stringify(x, (k: string, v: unknown) => v);\n",
    'src/ts/zz-probe-replace.ts':"export const probeDigit = '12'.replace(/(\\d)/, (m: string, d: number) => d + 1);\nexport const probeBranch = 'x'.replace(/(a)|(x)/, (m: string, p: string, q: string) => p.length + q);\nexport const probeRight = 'x'.replace(/(a)|(x)/, (m: string, p: string | undefined, q: string | undefined, at: number) => (p ?? q ?? '') + at);\n",
    'src/ts/zz-probe-held.ts':"export function probePromise(e: PromiseRejectionEvent) { const p: Promise<number> = e.promise; return p; }\nexport function probeField(o: object) { const d: { value?: number } | undefined = Object.getOwnPropertyDescriptor(o, 'x'); return d; }\nexport function probeKept(o: object) { const d = Object.getOwnPropertyDescriptor(o, 'x'); return d?.writable; }\n",
    'src/ts/zz-probe-shadow.ts':'export const performance = { now: () => 0 };\nexport function status() { return 1; }\nexport const probeOwn = 1;\n',
    'src/ts/zz-probe-type-only.ts':'import type { LIMITS } '+importFrom('./02-language-contracts.ts')+';\nexport const probeTypeOnly = LIMITS;\n',
    'src/types/zz-probe.d.ts':'export interface Probe { a: string; [key: string]: number }\nexport type ProbeAny = any;\n',
    'src/ts/zz-probe-cast.ts':"export const castParen = ({}) as { size: number };\nexport const castSteps = {} as Partial<{ size: number }> as { size: number };\nexport const castChecked = ({} satisfies object) as { size: number };\nexport const castThrough = ('a' as unknown) as number;\nexport const castOne = ('a' as string).length;\nexport const castConst = ['a', 'b'] as const;\nexport const castNothing: number = undefined!;\nexport const castMaybe = (n?: number) => n!;\n",
    'src/ts/zz-probe-never.ts':"export const neverOne: string = 1 as never;\nexport const neverHeld = (xs: number[]): string[] => xs as never[];\nexport const neverField = (o: { a: number }): string => (o as { a: never }).a;\nexport const neverAngle: string = <never>1;\nexport function isNothing(x: unknown): x is never { return x === 0; }\nexport const neverReturned = (f: () => number): string => (f as () => never)();\nexport const neverAbsent = (o: object) => o as { a?: never };\nexport function failNow(): never { throw Error('x'); }\n",
    'src/ts/zz-probe-parameter.ts':"export function claim<T>(x: unknown): asserts x is T {}\nexport function isIt<T>(x: unknown): x is T { return x !== null; }\nexport function isText(x: unknown): x is string { return typeof x === 'string'; }\n"};
  // (casts to a type parameter in a module the table names once: the second is one more than it allows)
  probes['src/ts/zz-probe-cast-parameter.ts']='export function made<T>(x: unknown): T { return x as T; }\nexport function again<T>(x: unknown): T { return x as T; }\n';
  // (inside surfaceCapture the other checks of a cast still run: a literal cast to the parts is a finding)
  assert.equal(sentencesText.split('  const match = pattern.exec(protectedCode);').length,2);
  probes[sentencesFile]=sentencesText.replace('  const match = pattern.exec(protectedCode);',()=>'  const probeLiteral = {} as Parts;\n  const match = pattern.exec(protectedCode);');
  const issues=typeIssues(typeCheck(repositoryRoot,probes,FILLED_BAGS,{...PARAMETER_CASTS,'src/ts/zz-probe-cast-parameter.ts':1}));
  // A tsconfig.json that leaves a module out is refused: the module is missing from the program.
  const config=JSON.parse(read('tsconfig.json'));
  assert.deepEqual(missingFromProgram(typeCheck(repositoryRoot,{'tsconfig.json':JSON.stringify({...config,exclude:['src/ts/12-public-api.ts']})}).files),['src/ts/12-public-api.ts'],'a module left out of the program');
  // The check runs with the options it pins: a tsconfig.json that weakens one, adds one or brings options from elsewhere is refused.
  assert.deepEqual(config.compilerOptions,PINNED_OPTIONS);assert.deepEqual(tsconfigFindings(config),[]);
  for(const weaker of [{skipLibCheck:true},{strictFunctionTypes:false},{strictPropertyInitialization:false},{noImplicitOverride:false},{noFallthroughCasesInSwitch:false},
    {noImplicitThis:false},{erasableSyntaxOnly:false},{strict:false},{strictNullChecks:false},{noImplicitAny:false},{useUnknownInCatchVariables:false},{strictBindCallApply:false},
    {noStrictGenericChecks:true},{allowUnreachableCode:true},{types:['node']},{lib:['es2023','dom','dom.iterable','webworker']}])
    assert.equal(tsconfigFindings({...config,compilerOptions:{...config.compilerOptions,...weaker}}).length,1,'a weaker tsconfig.json: '+JSON.stringify(weaker));
  const {noFallthroughCasesInSwitch,...fewer}=config.compilerOptions;
  assert.equal(tsconfigFindings({...config,compilerOptions:fewer}).length,1,'an option left out');
  assert.equal(tsconfigFindings({...config,extends:'./other.json'}).length,1,'options brought by extends');
  assert.ok(typeIssues(typeCheck(repositoryRoot,{'tsconfig.json':JSON.stringify({...config,compilerOptions:{...config.compilerOptions,skipLibCheck:true}})})).some(i=>i.startsWith('tsconfig.json:1 compiler options other than the pinned ones: skipLibCheck')),'a weaker tsconfig.json is a finding of the check');
  for(const [file,code]of [['src/ts/zz-probe-loose.ts',7006],['src/ts/zz-probe-names.ts',2304],['src/ts/zz-probe-assign.ts',2632],['src/ts/zz-probe-import.ts',2305],['src/ts/zz-probe-type-only.ts',1361]])assert.ok(issues.some(i=>i.startsWith(file+':')&&i.includes(' TS'+code+' ')),file+' TS'+code+': '+issues.join('; '));
  // Checking turned off by a comment is a finding, and a name used before its declaration an error (in the joined
  // product script it would run as undefined or throw).
  assert.ok(issues.some(i=>i.startsWith('src/ts/zz-probe-off.ts:1 checking turned off: @ts-ignore')),'a @ts-ignore: '+issues.filter(i=>i.includes('zz-probe-off')).join('; '));
  assert.ok(issues.some(i=>i.startsWith('src/ts/zz-probe-early.ts:1 TS2448 ')),'a name used before its declaration: '+issues.filter(i=>i.includes('zz-probe-early')).join('; '));
  // A top-level name that a library declares as a global value would take its place in every module of the joined script.
  for(const line of [1,2])assert.ok(issues.some(i=>i.startsWith('src/ts/zz-probe-shadow.ts:'+line+' a top-level name that hides a global')),'zz-probe-shadow.ts:'+line+': '+issues.filter(i=>i.includes('zz-probe-shadow')).join('; '));
  assert.ok(!issues.some(i=>i.startsWith('src/ts/zz-probe-shadow.ts:3 ')),'a name of its own is no finding');
  // A library's any held by a property read, or given in a field to a type whose field is not any, is a finding.
  for(const [line,kind] of [[1,'a value whose type holds any'],[2,'an any field given to a type']])assert.ok(issues.some(i=>i.startsWith('src/ts/zz-probe-held.ts:'+line+' '+kind)),'zz-probe-held.ts:'+line+' '+kind+': '+issues.filter(i=>i.includes('zz-probe-held')).join('; '));
  assert.ok(!issues.some(i=>i.startsWith('src/ts/zz-probe-held.ts:3 ')),'a library value read for a field that is not any is no finding');
  // A replacer's parameter takes what replace gives there: a group is text (or undefined too when it may match nothing).
  for(const [line,count] of [[1,1],[2,2]])assert.equal(issues.filter(i=>i.startsWith('src/ts/zz-probe-replace.ts:'+line+' a replacer parameter typed as what replace does not give')).length,count,'zz-probe-replace.ts:'+line+': '+issues.filter(i=>i.includes('zz-probe-replace')).join('; '));
  assert.ok(!issues.some(i=>i.startsWith('src/ts/zz-probe-replace.ts:3 ')),'a replacer typed as replace gives is no finding');
  // A global value a declaration file of the product declares is the library's own, or the page may not have it.
  assert.ok(issues.some(i=>i.startsWith('src/types/zz-probe-ghost.d.ts:1 a global value declared that the page may not have')),'a ghost global: '+issues.filter(i=>i.includes('zz-probe-ghost')).join('; '));
  assert.ok(!issues.some(i=>i.startsWith('src/types/zz-probe-ghost.d.ts:2 ')),'the library\'s own global is no finding');
  // A replacer or a function given by its name, or in brackets, is checked as one written there; after the whole text a
  // replacer is given the named groups only.
  for(const [line,kind] of [[1,'a replacer parameter typed as what replace does not give'],[3,'a replacer parameter typed as what replace does not give'],[4,'a replacer parameter typed as what replace does not give'],[5,'a parameter typed narrower than the any it is given']])
    assert.ok(issues.some(i=>i.startsWith('src/ts/zz-probe-named-given.ts:'+line+' '+kind)),'zz-probe-named-given.ts:'+line+': '+issues.filter(i=>i.includes('zz-probe-named-given')).join('; '));
  assert.ok(!issues.some(i=>i.startsWith('src/ts/zz-probe-named-given.ts:7 ')),'the named groups after the whole text are given');
  // A parameter of a function given where the library gives any is written unknown there, not a narrower type.
  for(const line of [1,2])assert.ok(issues.some(i=>i.startsWith('src/ts/zz-probe-given-any.ts:'+line+' a parameter typed narrower than the any it is given')),'zz-probe-given-any.ts:'+line+': '+issues.filter(i=>i.includes('zz-probe-given-any')).join('; '));
  assert.ok(!issues.some(i=>i.startsWith('src/ts/zz-probe-given-any.ts:3 ')),'a parameter written unknown is no finding');
  // The older name of AudioContext is no global name: read bare where it is missing, it throws.
  assert.ok(issues.some(i=>i.startsWith('src/ts/zz-probe-older-audio.ts:1 ')&&/ TS(?:2304|2552) /.test(i)),'a bare webkitAudioContext: '+issues.filter(i=>i.includes('older-audio')).join('; '));
  assert.ok(issues.some(i=>i.startsWith('src/ts/zz-probe-typed.ts:1 any written')),'any written in a module');
  assert.ok(issues.some(i=>i.startsWith('src/ts/zz-probe-typed.ts:1 a value of type any')),'a value of type any in a module');
  assert.ok(issues.some(i=>i.startsWith('src/ts/zz-probe-typed.ts:2 a value whose type holds any: new Map()')),'a Map of any in a module');
  assert.ok(issues.some(i=>i.startsWith('src/ts/zz-probe-typed.ts:2 a literal cast to a type')),'a literal cast in a module');
  assert.ok(!issues.some(i=>/^src\/ts\/zz-probe-typed\.ts:[34] /.test(i)),'a literal cast to a wider type, or with every property of the type, is no finding');
  // A cast is judged from the value it starts from to the type it ends with (parentheses, satisfies and steps hide nothing).
  for(const [line,kind]of [[1,'a literal cast to a type'],[2,'a cast in steps'],[3,'a literal cast to a type'],[4,'a cast through unknown']])
    assert.ok(issues.some(i=>i.startsWith('src/ts/zz-probe-cast.ts:'+line+' '+kind)),'zz-probe-cast.ts:'+line+' '+kind+': '+issues.filter(i=>i.includes('zz-probe-cast')).join('; '));
  assert.ok(!issues.some(i=>/^src\/ts\/zz-probe-cast\.ts:[56] /.test(i)),'one cast, and as const, are no finding');
  assert.ok(issues.some(i=>i.startsWith('src/ts/zz-probe-cast.ts:7 a non-null claim of nothing')),'a ! of undefined');
  assert.ok(!issues.some(i=>/^src\/ts\/zz-probe-cast\.ts:8 /.test(i)),'a ! of what may be a number is no finding');
  // A cast to never, or to a type that holds it where a value is read, and a type guard to never are findings; <T>x is no erasable syntax.
  for(const [line,kind]of [[1,'a cast to never'],[2,'a cast to never'],[3,'a cast to never'],[4,'TS1294'],[5,'a type guard to never'],[6,'a cast to never']])
    assert.ok(issues.some(i=>i.startsWith('src/ts/zz-probe-never.ts:'+line+' '+kind)),'zz-probe-never.ts:'+line+' '+kind+': '+issues.filter(i=>i.includes('zz-probe-never')).join('; '));
  assert.ok(!issues.some(i=>/^src\/ts\/zz-probe-never\.ts:[78] /.test(i)),'a member that may be absent, and a function that never returns, are no finding');
  // A guard to a type parameter is a finding; a guard to a named type is not.
  for(const line of [1,2])assert.ok(issues.some(i=>i.startsWith('src/ts/zz-probe-parameter.ts:'+line+' a type guard to a type parameter')),'zz-probe-parameter.ts:'+line+': '+issues.filter(i=>i.includes('zz-probe-parameter')).join('; '));
  assert.ok(!issues.some(i=>i.startsWith('src/ts/zz-probe-parameter.ts:3 ')),'a guard to string is no finding');
  // A cast to a type parameter is counted exactly (PARAMETER_CASTS) and may stand only in surfaceCapture, whose parts CAPTURE-PARTS checks.
  for(const line of [1,2])assert.ok(issues.some(i=>i.startsWith('src/ts/zz-probe-cast-parameter.ts:'+line+' a cast to a type parameter outside surfaceCapture')),'a cast to T outside surfaceCapture: '+line);
  assert.ok(issues.includes('src/ts/zz-probe-cast-parameter.ts:1 casts to a type parameter other than PARAMETER_CASTS: 2 where the table has 1'),'a second cast in a module the table names once');
  assert.ok(typeIssues({errors:[],anys:[]}).length===0&&PARAMETER_CASTS['src/ts/04-syntax-sentences.ts']===1,'the table names the cast of surfaceCapture');
  assert.ok(issues.some(i=>/^src\/ts\/04-syntax-sentences\.ts:\d+ a literal cast to a type: \{\} as Parts/.test(i)),'a literal cast inside surfaceCapture: '+issues.filter(i=>i.includes('04-syntax-sentences')).join('; '));
  assert.ok(!issues.some(i=>/^src\/ts\/04-syntax-sentences\.ts:138 /.test(i)),'the cast of surfaceCapture is no finding');
  // A declaration file has no error and no any either (the modules lean on its types).
  assert.ok(issues.some(i=>i.startsWith('src/types/zz-probe.d.ts:1 TS2411')),'an error in a declaration file: '+issues.filter(i=>i.includes('zz-probe.d.ts')).join('; '));
  assert.ok(issues.some(i=>i.startsWith('src/types/zz-probe.d.ts:2 any written')),'any written in a declaration file');
  assert.ok(issues.some(i=>i.startsWith('src/ts/zz-probe-syntax.ts:2 TS2322')),'a tree the syntax types refuse');
});
// The bags a creator makes empty and fills (FILLED_BAGS): the empty object of a listed bag is no literal cast, and a
// bag that breaks a rule of the list is a finding (a part that does more than declare functions, asserts nothing, or
// gives calls other than what it asserts; a bag read before it is written, not filled, or not made as listed).
check('REJECT-FILLED-BAGS',()=>{
  const file='src/ts/zz-probe-bag.ts',text=['export interface ProbeVars { a: number; b: string }',
    'export interface ProbeCalls { get: () => number }',
    'export interface ProbeMore { more: () => number }',
    'export function probePart(vars: ProbeVars, calls: object): asserts calls is ProbeCalls {',
    "  const get: ProbeCalls['get'] = () => vars.a;",
    "  vars.b = 'x';",
    '  Object.assign(calls, { get } satisfies ProbeCalls);',
    '}',
    'export function probeLater(vars: ProbeVars, calls: ProbeCalls): asserts calls is ProbeCalls & ProbeMore {',
    "  const more: ProbeMore['more'] = () => calls.get() + vars.a;",
    '  Object.assign(calls, { more } satisfies { more: () => number });',
    '}',
    'export function probeLoose(vars: ProbeVars) { return vars.a; }',
    'export function probeCreator() {',
    '  const vars = {} as ProbeVars;',
    '  const calls = {};',
    '  const early = vars.a;',
    '  probePart(vars, calls);',
    '  probeLater(vars, calls);',
    '  probeLoose(vars);',
    "  if (early) vars.b = 'y';",
    '  vars.a = 1;',
    '  return calls.more() + early;',
    '}',
    'export function probeOther() { const made = {} as ProbeVars; return made; }',
    'export interface ProbeRedraw { draw: () => void }',
    'export function probeDrawing(redraw: ProbeRedraw, calls: object): asserts calls is ProbeCalls {',
    "  const get: ProbeCalls['get'] = () => 1;",
    '  Object.assign(calls, { get } satisfies ProbeCalls);',
    '  Object.assign(redraw, { draw: () => {} });',
    '}',
    'export function probeView() {',
    '  const redraw = {} as ProbeRedraw;',
    '  const calls = {};',
    '  probeDrawing(redraw, calls);',
    '  return [calls.get(), redraw];',
    '}',''].join('\n');
  const bags=[...FILLED_BAGS,{file,creator:'probeCreator',name:'vars',type:'ProbeVars',fill:'creator'},{file,creator:'probeView',name:'redraw',type:'ProbeRedraw',fill:'probeDrawing'},
    {file,creator:'probeGone',name:'vars',type:'ProbeVars',fill:'creator'}];
  const issues=typeIssues(typeCheck(repositoryRoot,{[file]:text},bags)).filter(i=>i.startsWith(file+':'));
  for(const expected of ['6 a part that does more than declare functions: probePart',"9 a part not checked against what it asserts: probeLater",'13 a part that asserts nothing: probeLoose',
    '17 a filled bag read before it is filled: vars.a','15 a filled bag not filled: vars.b','25 a literal cast to a type','33 a filled bag not filled: redraw','0 a filled bag not made as listed'])
    assert.ok(issues.some(i=>i.startsWith(file+':'+expected)),expected+': '+issues.join('; '));
  assert.ok(!issues.some(i=>/^src\/ts\/zz-probe-bag\.ts:(15|33) a literal cast/.test(i)),'the empty object of a listed bag is no literal cast');
  assert.ok(!issues.some(i=>/ TS\d+ /.test(i)),'the probe itself is typed: '+issues.join('; '));
  // The ways around the rule are findings too: a write that may not run, a use other than bag.name, a part's default, a
  // part giving more than names, calls as methods, a part taking other calls than the one before it gives, a part that
  // is no declared function, and a bag a part fills read before the part runs.
  const holes='src/ts/zz-probe-bag-holes.ts',lines=['export interface PV { a: number; b: string }','export interface PC { get: () => number }',
    'export interface PM { more(): number }','export interface PR { draw: () => void }',
    "export function pOk(vars: PV, calls: object): asserts calls is PC { const get: PC['get'] = () => vars.a; Object.assign(calls, { get } satisfies PC); }",
    "export function pDefault(vars: PV, calls: object, early = vars.a): asserts calls is PC { const get: PC['get'] = () => early; Object.assign(calls, { get } satisfies PC); }",
    "export function pOther(vars: PV, calls: PC): asserts calls is PC & PC {",
    '  Object.assign(vars, { a: 1 });',
    "  const get: PC['get'] = () => vars.a; Object.assign(calls, { get, ...{} } satisfies PC);",
    '}',
    "export function pMethods(vars: PV, calls: object): asserts calls is PM { const more: PM['more'] = () => vars.a; Object.assign(calls, { more } satisfies PM); }",
    'export const pArrow = (vars: PV, calls: object): void => { Object.assign(calls, { n: vars.a }); };',
    'export function cWrites(maybe?: (n: unknown) => void) {','  const vars = {} as PV;','  const calls = {};','  pOk(vars, calls);',
    "  let x = 0; x ||= (vars.a = 1); maybe?.(vars.b = 'y');",'  return [calls, x];','}',
    'export function cEarly(skip: boolean) {','  const vars = {} as PV;','  const calls = {};','  pOk(vars, calls);',
    '  const seen = (() => vars.a)();','  const given = [1].map(() => vars.b);','  setTimeout(() => vars.b);','  vars.a = 1;','  if (skip) return calls;',"  vars.b = 'z';",'  return [calls, seen, given];','}',
    'function pLoose(vars: PV) { return vars.a; }',
    'export function cNamed() {','  const vars = {} as PV;','  const calls = {};','  pOk(vars, calls);','  const early = () => vars.a;','  function readB() { return vars.b; }',
    '  const seenNamed = early() + readB().length;',"  vars.a = 1; vars.b = 'x';",'  return [calls, seenNamed];','}',
    'export function cGiven() {','  const vars = {} as PV;','  const calls = {};','  pOk(vars, calls);','  function peekA() { return vars.a; }','  const peekB = () => vars.b;',
    '  [0].forEach(peekA); [0].map(peekB);',"  vars.a = 1; vars.b = 'x';",'  return calls;','}',
    'export function cPromise() {','  const vars = {} as PV;','  const calls = {};','  pOk(vars, calls);','  const waiting = new Promise<number>(done => done(vars.a));',"  vars.a = 1; vars.b = 'x';",'  return [calls, waiting];','}',
    'export function cUses() {','  const vars = {} as PV;','  const calls = {};','  pOk(vars, calls);',"  vars.a = 1; vars.b = 'x';",
    '  const v = vars;','  const { a } = vars;','  const r = (vars).a + pLoose(vars);','  return [calls, v, a, r];','}',
    'export function cParts() {','  const vars = {} as PV;','  const calls = {};','  pDefault(vars, calls);','  pOther(vars, calls);','  pMethods(vars, calls);',
    '  pArrow(vars, calls);',"  vars.a = 1; vars.b = 'x';",'  return calls;','}',
    "export function pDraw(redraw: PR, calls: object, extra: unknown): asserts calls is PC { const get: PC['get'] = () => 1; Object.assign(calls, { get } satisfies PC); Object.assign(redraw, { draw: () => {} } satisfies PR); }",
    'export function cRedraw() {','  const redraw = {} as PR;','  const calls = {};','  pDraw(redraw, calls, redraw.draw());','  return calls;','}',''];
  const at=part=>lines.findIndex(l=>l.includes(part))+1,holeBags=[...FILLED_BAGS,...['cWrites','cEarly','cUses','cParts','cNamed','cGiven','cPromise'].map(creator=>({file:holes,creator,name:'vars',type:'PV',fill:'creator'})),
    {file:holes,creator:'cRedraw',name:'redraw',type:'PR',fill:'pDraw'}];
  const found=typeIssues(typeCheck(repositoryRoot,{[holes]:lines.join('\n')},holeBags)).filter(i=>i.startsWith(holes+':'));
  for(const [line,expected]of [[at('function cWrites')+1,'a filled bag not filled: vars.a'],[at('function cWrites')+1,'a filled bag not filled: vars.b'],
    [at('function cEarly')+1,'a filled bag not filled: vars.b'],[at('const seen'),'a filled bag read before it is filled: vars.a'],
    [at('const given'),'a filled bag read before it is filled: vars.b'],
    // (a function declared there and called by its name runs now: what it reads is followed)
    [at('const early = () => vars.a'),'a filled bag read before it is filled: vars.a'],[at('function readB'),'a filled bag read before it is filled: vars.b'],
    [at('const v = vars'),'a use of a filled bag the rule does not follow'],[at('const { a } = vars'),'a use of a filled bag the rule does not follow'],
    [at('const r = (vars)'),'a use of a filled bag the rule does not follow'],[at('function pDefault'),'a part whose parameters do more than name'],
    [at('Object.assign(vars, { a: 1 })'),'a part that does more than declare functions'],[at('{ get, ...{} }'),'a part that does more than declare functions'],
    // (and so does one given by its name to a call that runs it now)
    [at('function peekA'),'a filled bag read before it is filled: vars.a'],
    // (new Promise runs its function at once)
    [at('const waiting'),'a filled bag read before it is filled: vars.a'],[at('const peekB'),'a filled bag read before it is filled: vars.b'],
    [at('function pMethods'),'calls written as methods'],[at('  pMethods(vars, calls)'),'a part that takes other calls than the part before it gives'],
    [at('  pArrow(vars, calls)'),'a part that is not a declared function'],[at('redraw.draw()'),'a filled bag read before it is filled: redraw.draw']])
    assert.ok(found.some(i=>i.startsWith(holes+':'+line+' '+expected)),line+' '+expected+': '+found.join('; '));
  assert.ok(!found.some(i=>/ TS\d+ /.test(i)),'the probe of the holes is typed: '+found.join('; '));
  // A function a call keeps for later (a timer, a listener) runs after the creator: what it reads is not followed.
  assert.ok(!found.some(i=>i.startsWith(holes+':'+at('setTimeout(() => vars.b)')+' ')),'a timer is no read now: '+found.join('; '));
});
// The extension examples' versions (EXTENSIONS.md 版の決まり): a version names one content (the manifest and the
// factory's text), so a change of either comes with a new version, and a work saved with the old one opens through
// upgradeRequirements. The factories hold no type syntax, so their text is the same however the types are removed.
const EXAMPLE_VERSIONS=Object.freeze({'demo.connector@1.2.1':'a29ceed2ea8fca1e36987049707613483f592008f27cdba4c1b0ada1808af80f',
  'demo.offline@1.2.1':'285d568231b71c9df66651cb383b7538abb50b91861198cfbbaf2e28ab0edd28',
  'demo.text@1.2.1':'e177df6bdb7d28d39c17d10124973098885c77aa2a68933709ba163eafa095f6','demo.meijin@1.1.1':'8fe4c0b63631a7eba2c9ffe7eb28baf08d66cbc342737b6ef961c981160384df'});
const {createAkariExtensionHost}=await import('../../extensions/foundation.ts'),{offline,text:textExample}=await import('../../extensions/examples/offline.ts'),{meijin}=await import('../../extensions/examples/meijin.ts');
// Every example of extensions/examples: each export of a file there that has a manifest and a factory.
const allExamples=[];for(const file of list('extensions/examples').filter(f=>f.endsWith('.ts')).sort())
  for(const value of Object.values(await import(pathToFileURL(path.join(repositoryRoot,file)).href)))if(value&&typeof value==='object'&&value.manifest&&typeof value.factory==='function')allExamples.push(value);
const exampleVersions=definitions=>{const host=createAkariExtensionHost({});return Object.fromEntries(definitions.map(d=>host.register(d.manifest,d.factory)).map(x=>[x.id+'@'+x.version,x.contentHash]));};
check('EXAMPLE-VERSIONS',()=>{assert.ok(allExamples.length>=4,'the examples are found');assert.deepEqual(exampleVersions(allExamples),EXAMPLE_VERSIONS);});
check('REJECT-EXAMPLE-CHANGED-UNVERSIONED',()=>{const changed={...offline,manifest:{...offline.manifest,description:offline.manifest.description+'！'}};
  assert.notDeepEqual(exampleVersions([changed,textExample,meijin]),EXAMPLE_VERSIONS);});
// F-23: the strings of the product (its screens and the exported player) and the manuals use no banned variant. The
// portable extension files built into the product are the fork developers' interface and are left out.
const manuals=['MANUAL.html',...list('Manual').filter(file=>file.endsWith('.html'))];
const embedded=script.pieces.filter(p=>p.extension).map(p=>script.text.slice(p.start,p.end));
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
// The confirm windows' way of speaking (AUDIT.md 言い方 F-18): every confirm window of the product, by file and in order,
// asks an operation in the 〜よ way; only the named exception, 名人's (where the body moves to), says です・ます. A window
// not in the list, a です・ます where 〜よ is asked, a 〜よ in the exception, the two mixed in one window, or a window
// that says neither fail. The windows: the browser's confirm(), however the script reaches it (confirm, window.confirm,
// globalThis.confirm, self.confirm, by name in brackets), in every part of the product script (extensions too), and the
// page's own confirm dialogs: the message of an element whose id ends in ConfirmMessage, as the page writes it and where
// the script sets it. A window's words are its strings in the order they are written (a ${} in the middle stays there).
const CONFIRM_WINDOWS=Object.freeze({'src/akari.html':['yo','yo'],'src/ts/11-app-commands.ts':['yo','masu','yo','yo','yo'],'src/ts/11-app-drawing.ts':['yo'],
  'src/ts/11-app-services.ts':['yo'],'src/ts/11-application.ts':['yo','yo']});
const confirmWindows=(sources,page)=>{const ts=require('typescript'),found={};
  const words=node=>{const parts=[],walk=n=>{if(ts.isStringLiteralLike(n)||ts.isTemplateHead(n)||ts.isTemplateMiddle(n)||ts.isTemplateTail(n))parts.push(n.text);else ts.forEachChild(n,walk);};walk(node);return parts.join('');};
  const named=(n,name)=>ts.isPropertyAccessExpression(n)?n.name.text===name:ts.isElementAccessExpression(n)&&ts.isStringLiteralLike(n.argumentExpression)&&n.argumentExpression.text===name;
  const browserConfirm=e=>{while(ts.isParenthesizedExpression(e))e=e.expression;
    return ts.isIdentifier(e)?e.text==='confirm':named(e,'confirm')&&ts.isIdentifier(e.expression)&&['window','globalThis','self'].includes(e.expression.text);};
  const message=n=>ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken&&(named(n.left,'textContent')||named(n.left,'innerHTML'))&&
    ts.isCallExpression(n.left.expression)&&n.left.expression.arguments.some(arg=>ts.isStringLiteralLike(arg)&&/ConfirmMessage$/.test(arg.text));
  const add=(file,text)=>(found[file]??=[]).push(text);
  if(page)for(const m of page.html.matchAll(/<(\w+)\b[^>]*\bid="\w*ConfirmMessage"[^>]*>([\s\S]*?)<\/\1>/g))add(page.file,m[2].replace(/<rt>[\s\S]*?<\/rt>/g,'').replace(/<[^>]+>/g,''));
  for(const {file,text} of sources){const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const visit=node=>{if(ts.isCallExpression(node)&&browserConfirm(node.expression)&&node.arguments[0])add(file,words(node.arguments[0]));
      else if(message(node))add(file,words(node.right));ts.forEachChild(node,visit);};visit(sf);}
  return found;};
const confirmStyle=text=>{const masu=/です|ます|ません|ください/.test(text),yo=/よ(?:[。\s？]|$)|？/.test(text.replace(/(?:ます|です|ません)か？/g,''));
  return masu&&yo?'mixed':masu?'masu':yo?'yo':'none';};
const confirmIssues=(found,listed=CONFIRM_WINDOWS)=>{const issues=[];
  for(const file of new Set([...Object.keys(found),...Object.keys(listed)])){const texts=found[file]||[],styles=listed[file]||[];
    if(texts.length!==styles.length)issues.push(file+' has '+texts.length+' confirm windows; the list has '+styles.length);
    texts.forEach((text,i)=>{const style=confirmStyle(text);if(style==='none'||styles[i]&&style!==styles[i])issues.push(file+' confirm '+(i+1)+' speaks '+style+', not '+(styles[i]||'listed')+': '+text.slice(0,40));});}
  return issues;};
const productWindows=()=>confirmWindows(script.pieces.map(p=>({file:p.label,text:script.text.slice(p.start,p.end)})),{file:'src/akari.html',html:built.html});// (the page as the build writes it)
check('CONFIRM-WORDING',()=>assert.deepEqual(confirmIssues(productWindows()),[]));
check('REJECT-CONFIRM-WORDING',()=>{const found=productWindows();
  const changed=(file,i,text)=>{const copy=structuredClone(found);if(i>=copy[file].length)copy[file].push(text);else copy[file][i]=text;return confirmIssues(copy);};
  assert.ok(changed('src/ts/11-application.ts',2,'この 部品を けしますか？').some(i=>/has 3 confirm windows/.test(i)),'a window not in the list');
  assert.ok(changed('src/ts/11-application.ts',0,'絵を すてて とじますか？').some(i=>/speaks masu, not yo/.test(i)),'です・ます where 〜よ is asked');
  assert.ok(changed('src/ts/11-app-commands.ts',1,'名人の本文に うつるよ。書く？').some(i=>/speaks yo, not masu/.test(i)),'〜よ in the exception');
  assert.ok(changed('src/ts/11-app-commands.ts',0,'けしますか？ けすよ。').some(i=>/speaks mixed/.test(i)),'two ways in one window');
  assert.ok(changed('src/ts/11-app-commands.ts',0,'けす？ ください').some(i=>/speaks mixed/.test(i)),'a question before です・ます');
  assert.ok(changed('src/ts/11-app-drawing.ts',0,'').some(i=>/speaks none/.test(i)),'a window that says neither');
  // Every way of reaching the browser's confirm, in any file, and the page's dialogs, are counted, words in written order.
  const probe=confirmWindows([{file:'extensions/zz-probe.ts',text:"window.confirm('a？');globalThis['confirm']('b？');(confirm)('c？');self.confirm(`d${x?'e':''}f？`);other.confirm('g');\n"+
    "$('#zzConfirmMessage').textContent=`h${n}よ。`;"}],{file:'zz.html',html:'<p id="zzConfirmMessage">この <ruby>名前<rt>なまえ</rt></ruby>で いい？</p><p id="zzOther">x</p>'});
  assert.deepEqual(probe,{'zz.html':['この 名前で いい？'],'extensions/zz-probe.ts':['a？','b？','c？','def？','hよ。']});});
check('CHILD-SPACING-RUNS',()=>{assert.equal(spacing.schema,'akari-child-spacing-allowlist-v2');assert.equal(spacing.run,CHILD_SPACING_RUN);assert.deepEqual(childSpacingIssues(spacingInputs,allowed),[]);});
// The lint finds an unspaced string, template and markup text, leaves spaced text, quoted parts and allowlisted texts
// alone (a code literal only where it is a script string), and lists an allowlist entry that no text has any more.
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
  for(const text of ['<p>いまのばしょから</p>','<input title="いまのばしょから">'])assert.equal(childSpacingIssues([{file:'a.html',kind:'html',text}],rules)[0].run,'いまのばしょから','a code literal is left alone only as a script string, never as markup text');
  assert.equal(issues("const a='（ここをおしてはじめる）';")[0].run,'ここをおしてはじめる','parentheses do not quote code');
  assert.equal(issues("const a='「例：ここをおしてはじめる';")[0].run,'ここをおしてはじめる','an unmatched quote cannot hide remaining prose');
  assert.deepEqual(issues('const a=`「名前：${name}『本文』」を おしてね`;'),[],'balanced nested quotes survive template interpolation');
  const label="'じゅんび できたよ'";assert.ok(productText.includes(label));
  assert.ok(childSpacingIssues([productInput(productText.replace(label,"'先に じゅんびできたよ'"))],spacing).some(i=>i.run==='じゅんびできたよ'));
});

// Dispatch values (AUDIT.md「ソースの一致」): a value a property is compared with is written somewhere in the product.
const scriptText=script.text;
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
// A code is named by a test: the audit's code (its tests and checks) or an expected value of its fixtures, not a document.
const auditTexts=trackedFiles(repositoryRoot).filter(file=>file.startsWith('audit/')&&file!=='audit/lib/source-consistency.mjs'&&(/\.(?:mjs|cjs|js)$/.test(file)||(file.startsWith('audit/fixtures/')&&file.endsWith('.json')))).map(read);
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
check('SOURCE-LINT',()=>{if(lintRun.error)throw lintRun.error;assert.deepEqual(lintFindings(lintRun.messages,script),[]);});
check('REJECT-LINT-PROBES',()=>{
  if(lintRun.error)throw lintRun.error;
  assert.deepEqual(Object.keys(LINT_PROBES).sort(),Object.keys(LINT_RULES).sort(),'one probe per rule');
  for(const [rule,messages]of Object.entries(lintRun.probes))assert.ok(messages.some(m=>m.ruleId===rule),rule+' refuses its probe; got '+messages.map(m=>m.ruleId).join(','));
});
// Repeated code (AUDIT.md「ソースの一致」): no repetition of 100 tokens beyond the baseline, and no stale baseline entry.
check('SOURCE-CLONES',()=>assert.deepEqual(cloneIssues(sourceClones(script)),[]));
check('REJECT-NEW-CLONE',()=>{
  // A second copy of a long function after the last module is a new repetition; a baseline entry for a repetition that is gone is refused.
  const last=script.pieces.filter(p=>!p.extension&&p.label.endsWith('.ts')).at(-1),from=scriptText.indexOf('  function replaceUnprotectedWord'),body=scriptText.slice(from,scriptText.indexOf('\n  function ',scriptText.indexOf('  function naturalConditionVariants'))+1);
  assert.ok(body.length>200&&body.endsWith('\n'),'the copied function');
  const added=body.replace('replaceUnprotectedWord','replaceUnprotectedWordAgain')+body.replace('replaceUnprotectedWord','replaceUnprotectedWordThird'),before=scriptText.slice(0,last.end).split('\n').length-1;
  const withAdded=text=>({text:scriptText.slice(0,last.end)+text+scriptText.slice(last.end),
    pieces:script.pieces.map(p=>p===last?{...p,end:p.end+text.length}:p.start>=last.end?{...p,start:p.start+text.length,end:p.end+text.length}:p),
    lines:[...script.lines.slice(0,before),...text.slice(0,-1).split('\n').map(()=>({file:last.label,line:0})),...script.lines.slice(before)]});
  const copied=withAdded(added);
  assert.equal(copied.lines.length,copied.text.split('\n').length-1);
  // (at the length the check counts, CLONE_TOKENS: the product as it is has none but the listed ones, the copy has one)
  assert.ok(!cloneIssues(sourceClones(script)).some(i=>i.startsWith('clone '))&&cloneIssues(sourceClones(copied)).some(i=>i.startsWith('clone ')),'a new repetition');
  // Comments are not tokens: the copies with a note in only one of them are the same repetition, as long and named alike.
  const third=added.indexOf('replaceUnprotectedWordThird'),cut=added.indexOf('\n',added.indexOf('\n',third)+1)+1;
  const noted=withAdded(added.slice(0,cut)+'    // a note only this copy has\n    /* and another */\n'+added.slice(cut));
  assert.ok(cut>third&&noted.text.length>copied.text.length,'the note is in the second copy');
  const shape=s=>sourceClones(s,20).map(c=>[c.id,c.length]);
  assert.deepEqual(shape(noted),shape(copied),'a copy whose comments differ');
  assert.ok(cloneIssues(sourceClones(script),[...CLONE_BASELINE,{id:'0000000000000000',what:'gone'}]).some(i=>i.includes('0000000000000000')),'a stale entry');
});
// Shown text as state (AUDIT.md「ソースの一致」): no new logic that decides by what an element shows.
const ownPieces=script.pieces.filter(p=>!p.extension),pieceFile=o=>ownPieces.find(p=>p.start<=o&&o<p.end)?.label??'?';
check('SOURCE-SHOWN-TEXT',()=>assert.deepEqual(shownTextIssues(shownTextReads(scriptText,pieceFile),SHOWN_TEXT_BASELINE),[]));
check('REJECT-SHOWN-TEXT-DECISION',()=>{
  const probe=line=>shownTextIssues(shownTextReads(scriptText+'\n'+line+'\n',o=>o>=scriptText.length?'probe':pieceFile(o)),SHOWN_TEXT_BASELINE);
  for(const line of ["if (el.textContent === 'もういちど') retry();","if (el.innerText.startsWith('エラー')) stop();","if (['はい','いいえ'].includes(el.textContent)) go();",
    "if (el.textContent.trim() === 'もういちど') retry();","function f(el){const said=el.innerText;return said==='はい';}","switch (el.textContent) { case 'はい': go(); }",
    "function g(el,ok){const unit=ok?el.textContent.trim():'';return unit.startsWith('歩');}"])assert.ok(probe(line).some(i=>i.startsWith('probe decides by shown text')),line);
  assert.ok(shownTextIssues(shownTextReads(scriptText,pieceFile),[...SHOWN_TEXT_BASELINE,{file:'src/ts/x.ts',source:'gone'}]).some(i=>i.includes('is gone')),'a stale entry');
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
  // The same wait written another way: called if there, by a computed name, taken out or apart, or a sleep of timers/promises.
  for(const line of ['await page?.waitForTimeout(10);',"await page['waitForTimeout'](10);",'await page[`waitForTimeout`](10);','const wait=page.waitForTimeout.bind(page);',
    'const {waitForTimeout}=page;',"import {setTimeout as sleep} from 'node:timers/promises';\nawait sleep(10);","const timers=require('timers/promises');\nawait timers.setTimeout(10);"])
    assert.ok(timeWaitIssues({...auditCode,'audit/tests/probe-wait.mjs':line+'\n'}).some(i=>i.startsWith('audit/tests/probe-wait.mjs waits by time 1 times (at most 0)')),line);
  assert.deepEqual(timeWaitIssues({...auditCode,'audit/tests/probe-other-wait.mjs':"function f(sleep){return sleep(1);}\nimport {setTimeout as sleep} from 'node:timers/promises';\n"}),[],'a parameter of the same name is no sleep');
});
// Promises that end only on a timer in the audit code: each file has exactly the count of TIMER_PROMISE_COUNTS.
check('AUDIT-TIMER-PROMISES',()=>assert.deepEqual(timerPromiseIssues(auditCode),[]));
check('REJECT-AUDIT-TIMER-PROMISE',()=>{
  for(const [line,count] of [['await new Promise(r=>setTimeout(r,500));',1],['await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,50)));',1],['await new Promise(r=>setTimeout(()=>r(),5));',1],
    ['const delay=ms=>new Promise(r=>setTimeout(r,ms));\nawait delay(5);\nawait delay(6);',2],['const settle=()=>p.evaluate(()=>new Promise(resolve=>setTimeout(resolve,350)));\nawait settle();',1]])
    assert.ok(timerPromiseIssues({...auditCode,'audit/tests/probe-timer.mjs':line+'\n'}).includes('audit/tests/probe-timer.mjs has '+count+' promises that end only on a timer (TIMER_PROMISE_COUNTS has 0); wait for a state instead'),line);
  const [file,text]=Object.entries(auditCode).find(([name])=>TIMER_PROMISE_COUNTS[name]);
  assert.ok(timerPromiseIssues({...auditCode,[file]:text+'\nawait new Promise(r=>setTimeout(r,1));\n'}).some(i=>i.startsWith(file+' has '+(TIMER_PROMISE_COUNTS[file]+1)+' promises')),'one more in a file of the table');
  assert.ok(timerPromiseIssues({...auditCode,[file]:''}).includes(file+' has 0 promises that end only on a timer now; lower its TIMER_PROMISE_COUNTS entry to 0'),'a count that went down');
  // A state waited for, a deadline, an answer given later and a loop that tests a state are no such promise.
  assert.deepEqual(timerPromiseIssues({...auditCode,'audit/tests/probe-timer-other.mjs':"await page.waitForFunction(()=>ready());\nawait Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(Error('x')),9))]);\nconst later=()=>new Promise(resolve=>setTimeout(()=>resolve(2),20));\nwhile(!ready())await new Promise(r=>setTimeout(r,20));\n"}),[],'no such promise');
});
// Reads of the product source as text in the audit code: no file adds one; checks take the shared readers' result.
check('AUDIT-SOURCE-READS',()=>assert.deepEqual(sourceReadIssues(auditCode),[]));
check('REJECT-AUDIT-SOURCE-READ',()=>{
  const reading=['const s=fs.readFileSync(\'src/ts/04-syntax-sentences.ts\',\'utf8\');','const s=read(path.join(root,\'src/ts/x.ts\'));',
    'const html=fs.readFileSync(currentProductFile(),\'utf8\');','const t=text(`src/ts/${name}.ts`);','const h=readFileSync(\'Akari_1_0_0.html\',\'utf8\');',
    // (a path given through a name bound to it is read the same)
    'const product=currentProductFile();const t=fs.readFileSync(product,\'utf8\');','const f=path.join(root,\'src/ts/x.ts\');const t=read(f);',
    // (a helper that reads its parameter, given a product path, with a name bound to one around it)
    "const file=currentProductFile(); const rd=(root,file)=>fs.readFileSync(path.join(root,file)); rd(root,'src/ts/x.ts')"];
  for(const line of reading)assert.ok(sourceReadIssues({...auditCode,'audit/tests/probe-read.mjs':line+'\n'}).some(i=>i.startsWith('audit/tests/probe-read.mjs reads the product source as text 1 times (at most 0)')),line);
  const [file]=Object.keys(SOURCE_READ_BASELINE);
  assert.ok(sourceReadIssues({...auditCode,[file]:''}).some(i=>i===file+' reads the product source as text 0 times now; lower its SOURCE_READ_BASELINE entry to 0'),'a count that went down');
  assert.deepEqual(sourceReadIssues({...auditCode,'audit/tests/probe-other.mjs':'const s=fs.readFileSync(\'audit/fixtures/x.json\',\'utf8\');\nconst t="readFileSync(\'src/ts/x.ts\')";\n'}),[],'another file, or a read written in a string');
});
// The reads the rule above does not count and the scoped look finds (SCOPED_SOURCE_READS, exact per file): both rules
// hold, so a read either counts is refused.
check('AUDIT-SCOPED-SOURCE-READS',()=>assert.deepEqual(scopedReadIssues(auditCode),[]));
check('REJECT-AUDIT-SCOPED-SOURCE-READ',()=>{
  const refused=(name,text)=>[...sourceReadIssues({...auditCode,[name]:text}),...scopedReadIssues({...auditCode,[name]:text})].some(i=>i.startsWith(name+' reads the product source as text'));
  const reading=[
    'const s=fs.readFileSync(path.join(root,\'src\',\'ts\',\'04-syntax.ts\'),\'utf8\');','const t=read(`${root}/src/ts/x.ts`);',
    'let file;file=currentProductFile();const t=fs.readFileSync(file,\'utf8\');','const [file]=[currentProductFile()];const t=fs.readFileSync(file,\'utf8\');',
    'const {page}={page:currentProductFile()};const t=read(page);','const dir=path.join(root,\'src\',\'ts\');for(const f of fs.readdirSync(dir))read(path.join(dir,f));',
    'for(const file of [\'src/ts/a.ts\'])read(file);',
    // (a var belongs to its function, from a block or a for statement; the product's files, as productFiles or a build lists them)
    'function f(){if(x){var p=\'src/ts/a.ts\';}return fs.readFileSync(p);}','for(var i=0,p=\'src/ts/a.ts\';i<1;i++){}fs.readFileSync(p);',
    'const grown=productFiles(read).filter(f=>/^src\\//.test(f)).at(-1);const t=read(grown);','const built=buildProduct({});for(const file of built.sources.filter(f=>f.endsWith(\'.ts\')))read(file);'];
  for(const line of reading)assert.ok(refused('audit/tests/probe-read.mjs',line+'\n'),line);
  assert.ok(scopedReadIssues({...auditCode,'audit/tests/probe-read.mjs':''},{...SCOPED_SOURCE_READS,'audit/tests/probe-read.mjs':1}).includes('audit/tests/probe-read.mjs reads the product source as text, seen by scope, 0 times now; lower its SCOPED_SOURCE_READS entry to 0'),'a count that went down');
  // The scoped look adds nothing for a name of another scope, a parameter, a for…of over what a function written there
  // leaves out, a src folder alone, a let of another block, or the sources of what is not a build.
  assert.equal(scopedSourceReads('function a(){const file=currentProductFile();return file;}\nfunction b(file){return read(file);}\nfor(const f of files.filter(f=>!f.startsWith(\'src/\')))read(f);\nfs.readdirSync(path.join(root,\'src\'));\nfunction g(){if(x){let q=\'src/ts/a.ts\';}return read(q);}\nconst made=other();for(const file of made.sources)read(file);\n'),0,'names of other scopes');
});
// Reads of a copy of the product or of a derived product as text: each file has exactly the count of PRODUCT_COPY_READS.
check('AUDIT-COPY-READS',()=>assert.deepEqual(copyReadIssues(auditCode),[]));
check('REJECT-AUDIT-COPY-READ',()=>{
  for(const line of ["const copy=path.join(dir,'c.html');fs.copyFileSync(currentProductFile(),copy);const t=fs.readFileSync(copy,'utf8');",
    "const out=path.join(dir,'d.html');await buildDerivedProduct({product:currentProductFile(),output:out,extensions:[]});const t=fs.readFileSync(out,'utf8');"])
    assert.ok(copyReadIssues({...auditCode,'audit/tests/probe-copy.mjs':line+'\n'}).includes('audit/tests/probe-copy.mjs reads a copy of the product as text 1 times (PRODUCT_COPY_READS has 0); take it from a shared reader instead'),line);
  const [file]=Object.keys(PRODUCT_COPY_READS);
  assert.ok(copyReadIssues({...auditCode,[file]:''}).includes(file+' reads a copy of the product as text 0 times now; lower its PRODUCT_COPY_READS entry to 0'),'a count that went down');
  // A copy of another file, a derived product made from another file, and the product itself (counted by the rule above) are not counted here.
  assert.deepEqual(copyReadIssues({...auditCode,'audit/tests/probe-copy-other.mjs':"fs.copyFileSync('audit/fixtures/x.json',copy);fs.readFileSync(copy);\nawait buildDerivedProduct({product:other,output:out});fs.readFileSync(out);\nfs.readFileSync(currentProductFile());\n"}),[],'no copy of the product');
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
// Refusals in the audit code (assert.throws / assert.rejects) name the reason they expect; none is left without one.
check('AUDIT-REFUSAL-REASONS',()=>assert.deepEqual(refusalReasonIssues(auditCode),[]));
check('REJECT-AUDIT-REFUSAL-WITHOUT-REASON',()=>{
  const issue=file=>file+':2 refuses without a reason; give assert.throws / assert.rejects the pattern, test or fields of the error it expects';
  const probe=line=>refusalReasonIssues({'audit/tests/probe-refusal.mjs':"import assert from 'node:assert/strict';\n"+line+'\n'});
  const without=['assert.throws(()=>verify(bad));',"assert.throws(()=>verify(bad),'must be rejected');","assert.throws(()=>verify(bad),id+' rejected');",
    'assert.throws(()=>verify(bad),ids[i]);','await assert.rejects(()=>load(bad));',"await assert.rejects(load(bad),'refused');",'assert.strict.throws(()=>verify(bad));',
    'assert.throws(()=>verify(bad),{});','assert.throws(()=>verify(bad),()=>true);',"const label='x';assert.throws(()=>verify(bad),label);",'const t=(fn,why)=>assert.throws(fn,why);'];
  for(const line of without)assert.deepEqual(probe(line),[issue('audit/tests/probe-refusal.mjs')],line);
  assert.deepEqual(refusalReasonIssues({'audit/tests/probe-require.cjs':"const check=require('node:assert');\ncheck.throws(()=>verify(bad));\n"}),[issue('audit/tests/probe-require.cjs')],'a name the assert module is bound to');
  const named=['assert.throws(()=>verify(bad),/wrong schema/);',"assert.throws(()=>verify(bad),new RegExp('no hint data in '+name));","assert.throws(()=>verify(bad),error=>error.code==='E703');",
    "assert.throws(()=>verify(bad),{name:'AkariError',code:'P210'},'refused');",'await assert.rejects(()=>load(bad),/missing/);','const reason=/stale/;assert.throws(()=>verify(bad),reason);',
    'const refused=error=>!/^TypeError$/.test(error.name);assert.throws(()=>verify(bad),refused,id);','assert.throws(()=>verify(bad),strict?/wrong schema/:/missing report/);',
    '// assert.throws(()=>verify(bad)) in a comment','const s="assert.throws(()=>verify(bad))";','other.throws(()=>verify(bad));'];
  for(const line of named)assert.deepEqual(probe(line),[],line);
  // A reason that no error can fail, a try/catch or a promise handler that takes any error, and each way to reach the
  // module or the function: each sample is one refusal without a reason.
  const counted=text=>reasonlessRefusals(text).length;
  const head="import assert from 'node:assert/strict';\n";
  const saysNothing=['/./','/Error/',"new RegExp('')",'e=>{return true;}','()=>!0','{name:/./}','{...{}}'].map(reason=>head+'assert.throws(()=>verify(bad),'+reason+');');
  const forms=[...saysNothing,
    head+'function yes(error){return true;}\nassert.throws(()=>verify(bad),yes);',
    head+'function a(){const why=/wrong schema/;return why;}\nfunction b(why){assert.throws(()=>verify(bad),why);}',
    head+"try{verify(bad);assert.fail('accepted');}catch{}",
    head+'const refused=()=>{try{verify(bad);return false;}catch{return true;}};',
    head+'let rejected=false;try{verify(bad);}catch(_){rejected=true;}',
    head+'const rejected=load(bad).then(()=>false,()=>true);',
    head+'const rejected=load(bad).catch(()=>true);',
    head+'assert?.throws(()=>verify(bad));',head+'assert.throws?.(()=>verify(bad));',head+"assert['throws'](()=>verify(bad));",
    "import {throws} from 'node:assert';\nthrows(()=>verify(bad));","import {strict as s} from 'node:assert';\ns.throws(()=>verify(bad));",
    "import * as all from 'node:assert';\nall.rejects(load(bad));",head+'const {throws:t}=assert;\nt(()=>verify(bad));',head+'const a=assert;\na.throws(()=>verify(bad));',
    "require('assert').strict.throws(()=>verify(bad));","const {rejects}=require('node:assert/strict');\nrejects(load(bad));"];
  for(const text of forms)assert.equal(counted(text),1,text);
  // Near misses: a specific reason in each of these forms is no finding.
  const near=[head+"assert.throws(()=>verify(bad),{code:'E703',message:'missing'});",head+"function reason(error){return error.code==='E703';}\nassert.throws(()=>verify(bad),reason);",
    head+"let rejected=false;try{verify(bad);}catch(error){rejected=error.code==='E703';}",head+'const refused=()=>{try{verify(bad);return true;}catch{return false;}};',
    head+"const r=load(bad).then(()=>false,error=>error.code==='E706');",head+'const gap=measure().catch(error=>({gap:NaN,error:String(error?.message??error)}));',head+'try{fs.rmSync(dir);}catch{}',
    "import {throws} from 'node:assert';\nthrows(()=>verify(bad),/wrong schema/);",head+'const a=assert;\na.throws(()=>verify(bad),/^missing report\\n/);',
    "require('assert').strict.throws(()=>verify(bad),{code:'ERR_ASSERTION',message:/^bundle status\\n/});",'const t=x=>x;t.throws(()=>verify(bad));'];
  for(const text of near)assert.equal(counted(text),0,text);
  // More forms that take any error as the refusal, each counted once; and the near ones that read the error.
  const more=[head+'const r=await load(bad).catch(()=>{});',head+"const r=await load(bad).catch(()=>'refused');",head+"load(bad).then(()=>assert.fail('accepted'),()=>{});",
    head+'let c;try{verify(bad);}catch(e){c=e;}assert.ok(c);',head+'const e=await load(bad).catch(e=>e);assert.ok(e);',
    ...['e=>e instanceof Error','e=>!!e','e=>e||true','e=>e?true:true',"{name:'Error'}",'/[ぁ-ん]/','/[A-Z]\\d{3}/','/.{40}/'].map(reason=>head+'assert.throws(()=>verify(bad),'+reason+');'),
    head+'let n=0;try{verify(bad);}catch{n++;}',head+"const seen=[];try{verify(bad);}catch{seen.push('refused');}",head+"const r=(()=>{try{verify(bad);return 'kept';}catch{return 'refused';}})();",
    head+'const t=assert.throws.bind(assert);t(()=>verify(bad));',head+'assert.throws.call(assert,()=>verify(bad));',head+'Reflect.apply(assert.throws,assert,[()=>verify(bad)]);',
    head+'const fns=[assert.throws];fns[0](()=>verify(bad));',head+'const o={t:assert.throws};o.t(()=>verify(bad));',"import test from 'node:test';\ntest('x',t=>{t.assert.throws(()=>verify(bad));});",
    head+"const [r]=await Promise.allSettled([load(bad)]);assert.equal(r.status,'rejected');".replace("assert.equal(r.status,'rejected')","assert.ok(r.status==='rejected')")];
  for(const text of more)assert.equal(counted(text),1,text);
  const moreNear=[head+"const r=await load(bad).catch(e=>e.code);assert.equal(r,'E706');",head+"let c;try{verify(bad);}catch(e){c=e;}assert.equal(c.code,'E703');",
    head+"assert.throws(()=>verify(bad),e=>e instanceof TypeError&&e.message==='Expected #RRGGBB');",head+'assert.throws(()=>verify(bad),/^E703$/);',head+'assert.throws(()=>verify(bad),/^missing report\\n/);',
    head+"await page.screenshot({path:'x.png'}).catch(()=>{});",head+"try{fs.rmSync(dir);}catch{}",head+"const t=assert.throws.bind(assert);t(()=>verify(bad),{code:'E1',message:'x'});",
    head+"const [r]=await Promise.allSettled([load(bad)]);assert.ok(r.status==='rejected'&&r.reason.code==='E706');",
    "import {refusedAs,refusedWith} from '../lib/refusal.cjs';\nimport assert from 'node:assert/strict';\nassert.throws(()=>verify(bad),refusedAs('probe#1'));assert.throws(()=>verify(bad),refusedWith({code:'E703'}));"];
  for(const text of moreNear)assert.equal(counted(text),0,text);
  assert.equal(counted("import {refusedWith} from '../lib/refusal.cjs';\nimport assert from 'node:assert/strict';\nassert.throws(()=>verify(bad),refusedWith({name:'Error'}));"),1,'refusedWith without a code or a message');
});
// One shared refusal helper (audit/lib/refusal.cjs): no check defines its own.
check('AUDIT-REFUSAL-HELPER-SHARED',()=>assert.deepEqual(refusalHelperCopies(auditCode),[]));
check('REJECT-REFUSAL-HELPER-COPY',()=>{
  for(const [i,text] of ['const refusedNotCrashed=error=>!/^(?:Type|Reference|Range)Error$/.test(error?.name);','function refusedAs(site){return ()=>true;}',
    'assert.throws(()=>verify(bad),error=>!/^(?:Type|Reference|Range)Error$/.test(error?.name));'].entries())assert.equal(refusalHelperCopies({'audit/tests/probe-copy.mjs':text+'\n'}).length,[2,1,1][i],text);
  assert.deepEqual(refusalHelperCopies({'audit/lib/refusal.cjs':'function refusedAs(site){}\n','audit/tests/probe-use.mjs':"import {refusedAs} from '../lib/refusal.cjs';\n"}),[],'the shared helper and its use');
});
// The shared helper counts only the refusal written down for the input: not a crash, a missing file, another assertion,
// another code or message, a thrown value that is not an error, and not a pass.
check('REJECT-REFUSAL-OTHER-REASON',()=>{
  const asError=(name,props)=>Object.assign(name==='TypeError'?new TypeError('q'):new Error('q'),props);
  const check703=refusedWith({name:'AkariError',code:'E703',message:'拡張状態の版が一致しません'});
  const refusal=Object.assign(new Error('拡張状態の版が一致しません'),{name:'AkariError',code:'E703'});
  assert.equal(check703(refusal),true,'the refusal itself');
  const others=[Object.assign(new Error('Expected values to be strictly equal:'),{name:'AssertionError',code:'ERR_ASSERTION'}),Object.assign(new Error("ENOENT: no such file or directory, open 'x'"),{code:'ENOENT'}),
    asError('TypeError',{}),Object.assign(new Error('拡張状態の版が一致しません'),{name:'AkariError',code:'E702'}),Object.assign(new Error('別の ことわり'),{name:'AkariError',code:'E703'}),undefined,'refused',{code:'E703',message:'拡張状態の版が一致しません'}];
  for(const error of others)assert.equal(check703(error),false,String(error?.message??error));
  assert.throws(()=>assert.throws(()=>{},check703),{code:'ERR_ASSERTION',message:/^Missing expected exception/},'a pass is no refusal');
  assert.throws(()=>assert.throws(()=>{throw others[2];},check703),{code:'ERR_ASSERTION',message:/^The validation function is expected to return "true"/},'a crash inside the checked call is no refusal');
  // a row of a site: only the reason written down for it, and nothing for a row that is not written down
  const site=refusedAs('product-source#probe');assert.equal(site(refusal),false,'a site with no row written down refuses nothing');
  assert.throws(()=>refusedWith({name:'Error'}),/needs the code or the message/);assert.throws(()=>refusedWith({name:'TypeError',code:'x'}),/a crash is not a refusal/);
});
const report={schema:'akari-product-source-v1',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:snapshot(currentProductFile()),productSha256:sha(product),buildSha256:sha(Buffer.from(built.html,'utf8')),sources:built.sources,results,sourceSizes:sizes.filter(s=>s.lines>SOURCE_SIZE_LINES)};
assert.deepEqual(results.map(r=>r.id),productSourceIds);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
if(report.status!=='PASS'){console.error(JSON.stringify(results.filter(r=>r.status!=='PASS'),null,2));process.exitCode=1;}
else{verifyProductSource(report,snapshot(currentProductFile()));console.log('Product source build: '+results.length+' PASS');}
