import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
const A=loadApi(fs.readFileSync(currentProductFile(),'utf8')),results=[],plain=v=>JSON.parse(JSON.stringify(v));
const project=()=>{const p=A.makeDefaultProject();p.scripts=[{id:'draft-main',targetId:'sprite-1',event:'start',source:'「前の文」と言う。'}];for(const actor of p.components.filter(c=>c.type==='sprite')){actor.costumes=[{id:actor.id+'-text',name:'文字',kind:'text',value:'🐈'}];actor.costumeId=actor.costumes[0].id;}return p;};
const state=()=>({version:1,revision:4,selectedId:'sprite-1',currentEvent:'start',selectedScriptId:'draft-main',uiLevel:'advanced',sourceOverviewOpen:false,editorModes:{script:'code',draft:'code'},callableDraft:null,pendingEditors:[],views:[]});
async function check(id,fn){try{results.push({id,status:'PASS',observed:await fn()});}catch(error){results.push({id,status:'FAIL',error:error.stack});}}
for(const source of ['「開いた引用','点数を','作品を動かしたとき、あかりは、\n  「始める」と言う。\nあかりがクリックされたとき、\n  「未完成'])await check('draft/source/'+source,async()=>{
 const p=project(),s=state();s.pendingEditors=[{kind:'script',ownerKey:'script:draft-main',source,mode:'code',pending:{kind:'code',value:source,reason:'書きかけ'},draftTree:null}];
 const text=A.serializeProject(p,new A.AssetStore(),s),loaded=await A.parseProjectFile(text);assert.deepEqual(plain(loaded.project),plain(p));assert.deepEqual(plain(loaded.editorState),s);return {source,savedSource:loaded.editorState.pendingEditors[0].source};
});
await check('draft/semantic-errors-are-readable',async()=>{
 const p=project();p.scripts[0].source='1歩＋1秒を言う。';const before=plain(A.compileProject(p).errors);assert.ok(before.length);
 const loaded=await A.parseProjectFile(A.serializeProject(p,new A.AssetStore(),state()));assert.equal(loaded.project.scripts[0].source,p.scripts[0].source);assert.deepEqual(plain(loaded.diagnostics),before);return {diagnostics:before};
});
await check('draft/unfinished-callable-and-return-hole',async()=>{
 const p=project(),s=state();s.callableDraft={ownerId:'stage',type:'function',name:'答え',argsText:'',source:'',editId:'',loadedKey:''};s.editorModes.draft='blocks';
 const session=A.createEditorSession('function:draft-1','',{definitionKind:'function',args:[],definition:{id:'draft-1',ownerId:'stage',name:'答え',args:[],source:''}},p,1);
 const location={parentId:session.blockView.id,body:'body',index:0},choice=A.blockInsertionAvailability(session,'ReturnStatement',location,{project:p,context:session.context});assert.equal(choice.node.inputs.value.schemaId,'Hole:expression');
 const ast={kind:'Script',body:[A.blockDecode(choice.node,{allowHoles:true})]},tree=A.blockEncode(ast,{allowHoles:true}).tree,source=A.formatScript(ast,{allowHoles:true});
 s.pendingEditors=[{kind:'draft',ownerKey:'function:draft-1',source,mode:'blocks',pending:{kind:'block-draft'},draftTree:tree}];
 const loaded=await A.parseProjectFile(A.serializeProject(p,new A.AssetStore(),s));assert.deepEqual(plain(loaded.editorState),plain(s));assert.throws(()=>A.blockDecode(loaded.editorState.pendingEditors[0].draftTree));return {hole:plain(choice.node),source};
});
await check('draft/contracts-and-corruption-rejected',async()=>{
 const p=project(),base=state();for(const mutate of [s=>s.version=99,s=>s.selectedId='missing',s=>s.views=[{kind:'script'}],s=>s.callableDraft={type:'function'},s=>s.pendingEditors=[{kind:'script'}]]){const bad=plain(base);mutate(bad);assert.throws(()=>A.serializeProject(p,new A.AssetStore(),bad));}
 const text=A.serializeProject(p,new A.AssetStore(),base);await assert.rejects(()=>A.parseProjectFile(text.replace('"revision": 4','"revision": 5')));return {rejected:6};
});
const report={schema:'akari-draft-persistence-v1',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:snapshot(currentProductFile()),environment:'node / actual serializer and parser',uxAcceptance:false,results};
const output=path.resolve(process.argv[2]||'audit-evidence/draft-persistence.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');for(const r of results.filter(r=>r.status==='FAIL'))console.error(r.id+': '+r.error);console.log(`Draft persistence: ${results.filter(r=>r.status==='PASS').length}/${results.length} PASS`);if(report.status!=='PASS')process.exitCode=1;
