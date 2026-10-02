import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
import {transferFixtures,verifyCompositionMeaning} from '../lib/actions-transfer-contract.mjs';
import {compositionProject,compositionExecution} from '../lib/composition-runtime.mjs';
const A=loadApi(fs.readFileSync(currentProductFile(),'utf8'));globalThis.Akari=A;
const {prose}=transferFixtures(),results=[],plain=v=>JSON.parse(JSON.stringify(v));
function blockEntries(tree){const out=[],visit=node=>{if(!node?.schemaId)return;out.push({node});for(const value of Object.values({...node.inputs,...node.bodies}))for(const child of Array.isArray(value)?value:[value])visit(child);};visit(tree);return out;}
async function check(id,fn){try{results.push({id,status:'PASS',observed:await fn()});}catch(error){results.push({id,status:'FAIL',error:error.stack});}}
for(const draft of prose.drafts)await check(draft.id+'/actual-meaning',()=>{
 const source=compositionExecution({draft,makeProject:compositionProject}),blocks=compositionExecution({draft,makeProject:compositionProject,mode:'blocks'});
 verifyCompositionMeaning(draft,source);verifyCompositionMeaning(draft,blocks);assert.deepEqual(blocks.trace,source.trace);assert.deepEqual(blocks.states,source.states);return {source,blocks};
});
for(const text of ['1行目\n  2行目\n\t3行目','名前は「空」。\n※これは台詞\n  次に、右へ','🐈\n  e\u0301\\おしまい'])await check('multiline/'+text,()=>{
 const literal={kind:'StringLiteral',value:text},source=A.formatExpression(literal)+'と言う。',parsed=A.parseSyntax(source);
 assert.ok(parsed.ast,JSON.stringify(parsed.syntaxDiagnostics));assert.equal(parsed.ast.body[0].value.value,text);
 const decoded=A.blockDecode(A.blockEncode(parsed.ast).tree),formatted=A.formatScript(decoded),again=A.parseSyntax(formatted);
 assert.ok(A.astEquivalent(parsed.ast,decoded));assert.ok(A.astEquivalent(parsed.ast,again.ast));assert.equal(again.ast.body[0].value.value,text);
 assert.equal(parsed.ast.body[0].sourceSpan.endLine,text.split('\n').length);return {source,formatted,span:plain(parsed.ast.body[0].sourceSpan)};
});
const draft=prose.drafts.find(d=>d.id==='I11'),p=compositionProject(A,draft),script=p.scripts[0];
// This identity fixture uses native text costumes so Node can verify the saved
// document. Image decoding and the original image fixture remain browser gates.
for(const actor of p.components){actor.costumes=[{id:actor.id+'-text-costume',name:'文字',kind:'text',value:'⭐'}];actor.costumeId=actor.costumes[0].id;}
await check('document/stable-ids-and-revision',()=>{
 A.updateScriptSource(script,draft.mainFirstDraft,p);A.validateDesignProject(p);
 assert.equal(script.document.unitIds.length,3);assert.equal(new Set(script.document.unitIds).size,3);
 const initial=plain(script.document),changed=draft.mainFirstDraft.replace('1秒待って','3秒待って');A.updateScriptSource(script,changed,p);
 assert.deepEqual(plain(script.document.unitIds),initial.unitIds);assert.equal(script.document.revision,initial.revision+1);
 A.updateScriptSource(script,changed,p);assert.equal(script.document.revision,initial.revision+1);
 return {initial,after:plain(script.document)};
});
await check('document/reorder-and-insert',()=>{
 const before=plain(script.document),parsed=A.parseSyntax(script.source).ast,first=script.source.slice(0,script.source.indexOf('「出発」という知らせ'));
 const reordered=first+parsed.units[1].source.trim()+'\n'+parsed.units[0].source.trim();A.updateScriptSource(script,reordered,p);
 assert.deepEqual(plain(script.document.unitIds),[before.unitIds[0],before.unitIds[2],before.unitIds[1]]);
 const prefix='あかりがクリックされたとき、\n  「クリック」と言う。\n';A.updateScriptSource(script,prefix+script.source,p);
 assert.deepEqual(plain(script.document.unitIds.slice(1)),[before.unitIds[0],before.unitIds[2],before.unitIds[1]]);assert.equal(new Set(script.document.unitIds).size,4);
 assert.equal(A.compileProject(p).errors.length,0);return {ids:plain(script.document.unitIds)};
});
await check('document/save-readback',async()=>{
 const text=A.serializeProject(p,A.makeDefaultAssetStore()),loaded=await A.parseProjectFile(text),after=loaded.project.scripts[0];
 assert.equal(after.source,script.source);assert.deepEqual(plain(after.document),plain(script.document));
 assert.equal(A.compileProject(loaded.project).errors.length,0);return {sourceExact:true,document:plain(after.document)};
});
await check('document/source-lines-and-negative-scope',()=>{
 const parsed=A.parseSyntax(draft.mainFirstDraft).ast;assert.equal(parsed.units.length,2);
 assert.equal(parsed.units[0].body[0].sourceSpan.startLine,6);assert.equal(parsed.units[1].body[0].sourceSpan.startLine,8);
 const misplaced=A.parseSyntax('作品を動かしたとき、あかりは、\n  あかりがクリックされたとき、\n    何もしない。');assert.equal(misplaced.ast,null);
 const callable=A.parseSyntax(draft.mainFirstDraft,{definitionKind:'function'});assert.equal(callable.ast,null);
 const bad=plain(parsed);bad.units[0].units=[plain(parsed.units[1])];assert.throws(()=>A.blockEncode(bad));
  return {receiverLines:[6,8],misplaced:plain(misplaced.syntaxDiagnostics),callable:plain(callable.syntaxDiagnostics)};
});
await check('document/edit-second-unit-only',()=>{
 const source=draft.mainFirstDraft,project=compositionProject(A,draft),session=A.createEditorSession('script:composition-main',source,{targetId:'sprite-1',event:'start'},project,4);
 const nodes=blockEntries(session.blockView),target=nodes.find(entry=>entry.node.schemaId==='NumberLiteral'&&entry.node.fields.value===2).node;
 const before=JSON.stringify(session),edit=A.prepareBlockEdit(session,{type:'field',id:target.id,key:'value',value:4});
 assert.equal(edit.source,source.replace('2秒待って','4秒待って'));assert.equal(JSON.stringify(session),before);return {source:edit.source};
});
await check('multiline/block-edit-retains-other-event',()=>{
 const original='最初\n  空白を残す',changed='編集\n  🐈と「青空」\\終わり',source='作品を動かしたとき、あかりは、\n  '+A.formatExpression({kind:'StringLiteral',value:original})+'と言う。\nあかりがクリックされたとき、\n  「別の本文」と言う。';
 const project=compositionProject(A,draft,source),session=A.createEditorSession('script:composition-main',source,{targetId:'sprite-1',event:'start'},project,2),target=blockEntries(session.blockView).find(entry=>entry.node.schemaId==='StringLiteral'&&entry.node.fields.value===original).node;
 const edit=A.prepareBlockEdit(session,{type:'field',id:target.id,key:'value',value:changed}),expected=source.replace(A.formatExpression({kind:'StringLiteral',value:original}),A.formatExpression({kind:'StringLiteral',value:changed}));
 assert.equal(edit.source,expected);return {source:edit.source};
});
await check('document/counted-call-reprint-only-changed-unit',()=>{
 const d=prose.drafts.find(d=>d.id==='I10'),tail='\nあかりがクリックされたとき、\n  「  原文を保持  」と言う。 ※ 他のできごと',source=d.mainFirstDraft+tail,project=compositionProject(A,d,source),session=A.createEditorSession('script:composition-main',source,{targetId:'sprite-1',event:'start'},project,1);
 const target=blockEntries(session.blockView).find(entry=>entry.node.schemaId==='NumberLiteral'&&entry.node.fields.value===2).node,edit=A.prepareBlockEdit(session,{type:'field',id:target.id,key:'value',value:3});
 assert.ok(edit.source.endsWith(tail));assert.equal(edit.syntaxAst.body[0].count.value.value,3);assert.equal(edit.syntaxAst.units.length,1);return {source:edit.source};
});
const report={schema:'akari-document-units-v1',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:snapshot(currentProductFile()),environment:'node / actual product',uxAcceptance:false,results};
const output=path.resolve(process.argv[2]||'audit-evidence/document-units.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
for(const result of results.filter(r=>r.status==='FAIL'))console.error(result.id+': '+result.error.split('\n').slice(0,5).join(' '));console.log(`Document units: ${results.filter(r=>r.status==='PASS').length}/${results.length} PASS`);if(report.status!=='PASS')process.exitCode=1;
