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
await check('draft/pending-number-block-path',async()=>{
 const p=project(),s=state();p.scripts[0].source='10歩動く。';s.editorModes.script='blocks';
 const nodePath=['bodies','body',0,'inputs','args',0,'inputs','value'];
 s.pendingEditors=[{kind:'script',ownerKey:'script:draft-main',source:p.scripts[0].source,mode:'blocks',pending:{field:'value',value:'－',nodePath},draftTree:null}];
 const loaded=await A.parseProjectFile(A.serializeProject(p,new A.AssetStore(),s));assert.deepEqual(plain(loaded.editorState),s);
 const corrupt=plain(s);corrupt.pendingEditors[0].pending.nodePath=['bodies','missing'];assert.throws(()=>A.serializeProject(p,new A.AssetStore(),corrupt));return {value:loaded.editorState.pendingEditors[0].pending.value,nodePath};
});
await check('history/thirty-frames-deltas-and-cursor',async()=>{
 const frames=Array.from({length:30},(_,i)=>{const p=project();p.scripts[0].source='「'+('長い原文🐈\n'.repeat(300))+i+'」と言う。';return{project:p,editorState:{...state(),revision:i},assets:new Map(),draftSerial:i,draftOpen:false};});
 frames[17].editorState.pendingEditors=[{kind:'script',ownerKey:'script:draft-main',source:'「未完成🐈\n二行目',mode:'code',pending:{kind:'code',value:'「未完成🐈\n二行目'},draftTree:null}];
 const packed=A.encodeWorkspaceHistory(frames,17),restored=await A.decodeWorkspaceHistory(packed);
 assert.equal(restored.cursor,17);assert.equal(restored.frames.length,30);assert.equal(packed.deltas.length,29);assert.ok(JSON.stringify(packed).length<JSON.stringify(frames).length/3);
 for(let i=0;i<30;i++){assert.deepEqual(plain(restored.frames[i].project),plain(frames[i].project));assert.deepEqual(plain(restored.frames[i].editorState),plain(frames[i].editorState));}
 return{frames:30,cursor:17,deltas:29,pending:restored.frames[17].editorState.pendingEditors[0].source,packedLength:JSON.stringify(packed).length,fullLength:JSON.stringify(frames).length};
});
await check('history/shared-and-history-only-assets',async()=>{
 const p=A.makeDefaultProject(),st=A.makeDefaultAssetStore(),frames=[{project:p,editorState:{...state(),selectedId:'stage',selectedScriptId:null},assets:st.snapshotRefs()}];
 const q=project();frames.push({project:q,editorState:state(),assets:new Map()});frames.push({...frames[0],editorState:{...frames[0].editorState,revision:9}});
 const packed=A.encodeWorkspaceHistory(frames,1),restored=await A.decodeWorkspaceHistory(packed);
 assert.equal(packed.assets.length,1);assert.equal(packed.assets[0].builtin,true);assert.equal(packed.assets[0].blob,null);assert.equal(restored.frames[1].assets.size,0);
 for(const i of [0,2])assert.equal([...restored.frames[i].assets.values()][0].sha256,[...st.snapshotRefs().values()][0].sha256);
 return{sharedAssets:1,historyOnlyAsset:true,currentAssets:0};
});
await check('history/corrupt-delta-asset-contract-rejected',async()=>{
 const p=A.makeDefaultProject(),s={...state(),selectedId:'stage',selectedScriptId:null};const packed=A.encodeWorkspaceHistory([{project:p,editorState:s,assets:A.makeDefaultAssetStore().snapshotRefs()}],0);
 const mutations=[x=>x.version=99,x=>x.cursor=2,x=>x.assets[0].sha256='0'.repeat(64),x=>x.base.assetRefs[0][1]=2,
   x=>x.base.editorState.selectedId='missing',x=>{x.deltas=[['array',1,{}]];x.cursor=1;},x=>{x.deltas=[['object',{project:['object',{scripts:['array',2,{}]},[]]},[]]];x.cursor=1;}];
 for(const mutate of mutations){const bad=plain(packed);mutate(bad);await assert.rejects(()=>A.decodeWorkspaceHistory(bad));}
 return{rejected:mutations.length};
});
const report={schema:'akari-draft-persistence-v1',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:snapshot(currentProductFile()),environment:'node / actual serializer and parser',uxAcceptance:false,results};
const output=path.resolve(process.argv[2]||'audit-evidence/draft-persistence.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');for(const r of results.filter(r=>r.status==='FAIL'))console.error(r.id+': '+r.error);console.log(`Draft persistence: ${results.filter(r=>r.status==='PASS').length}/${results.length} PASS`);if(report.status!=='PASS')process.exitCode=1;
