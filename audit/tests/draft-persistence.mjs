import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot} from '../lib/product-test-host.mjs';
import {refusedAs} from '../lib/refusal.cjs';
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
 const loaded=await A.parseProjectFile(A.serializeProject(p,new A.AssetStore(),s));assert.deepEqual(plain(loaded.editorState),plain(s));assert.throws(()=>A.blockDecode(loaded.editorState.pendingEditors[0].draftTree),{name:'AkariError',code:'P210'});return {hole:plain(choice.node),source};
});
await check('draft/contracts-and-corruption-rejected',async()=>{
 const p=project(),base=state();for(const mutate of [s=>s.version=99,s=>s.selectedId='missing',s=>s.views=[{kind:'script'}],s=>s.callableDraft={type:'function'},s=>s.pendingEditors=[{kind:'script'}],
   // (a change kept with a kind or a reason that is no text)
   s=>s.pendingEditors=[{kind:'script',ownerKey:'script:draft-main',source:'点数を',mode:'code',pending:{kind:5,value:'点数を'},draftTree:null}],
   s=>s.pendingEditors=[{kind:'script',ownerKey:'script:draft-main',source:'点数を',mode:'code',pending:{kind:'code',value:'点数を',reason:{}},draftTree:null}],
   // (a change kept with another shape than the editor gives it: a text typed that is no text or is missing, a mistake
   // shown that is no list or whose words are no text, a mark that is no true or false, a source it was made from that
   // is no text)
   ...[{kind:'code',value:5},{kind:'code',value:{a:1}},{kind:'code'},{kind:'code',value:'点数を',diagnostics:'xyz'},
     {kind:'code',value:'点数を',diagnostics:[{code:'S300',message:{a:1},line:1,column:1}]},{kind:'code',value:'点数を',composing:'yes'},
     {kind:'code',value:'点数を',rejected:'no'},{kind:'code',value:'点数を',originalSource:5},
     // (a field that is no name of a field, and a path that is no list: the check of the saved fingerprint refuses them)
     {field:'',value:'x',nodePath:[]},{field:0,value:'x'},{kind:'code',value:'点数を',nodePath:'abc'},{kind:'code',value:'点数を',nodePath:{}}]
     .map(pending=>s=>s.pendingEditors=[{kind:'script',ownerKey:'script:draft-main',source:'点数を',mode:'code',pending,draftTree:null}]),
   // (a kept editor that is nothing, refused as the others are, not with a fault of the check)
   s=>s.pendingEditors=[null],s=>s.pendingEditors=[undefined]]){const bad=plain(base);mutate(bad);assert.throws(()=>A.serializeProject(p,new A.AssetStore(),bad),error=>error.code==='F503',JSON.stringify(bad.pendingEditors));}
 // (a kept text too long is refused as too long, F504, not as a broken record)
 {const long=plain(base),text='あ'.repeat(A.LIMITS.sourceEach+1);long.pendingEditors=[{kind:'script',ownerKey:'script:draft-main',source:text,mode:'code',pending:{kind:'code',value:text},draftTree:null}];
  assert.throws(()=>A.serializeProject(p,new A.AssetStore(),long),error=>error.code==='F504');}
 const text=A.serializeProject(p,new A.AssetStore(),base);await assert.rejects(()=>A.parseProjectFile(text.replace('"revision": 4','"revision": 5')),{name:'AkariError',code:'F512'});return {rejected:22};
});
await check('draft/selection-belongs-to-target-and-event',async()=>{
 const p=project(),s=state();p.scripts.push({id:'second-start',targetId:'sprite-1',event:'start',source:'「二つ目」と言う。'},
   {id:'click-script',targetId:'sprite-1',event:'click',source:'「クリック」と言う。'});
 for(const id of ['draft-main','second-start','click-script']){
   const row=p.scripts.find(row=>row.id===id),valid={...s,selectedScriptId:id,currentEvent:row.event};
   const restored=await A.parseProjectFile(A.serializeProject(p,new A.AssetStore(),valid));
   assert.equal(restored.editorState.selectedScriptId,id);assert.equal(restored.editorState.currentEvent,row.event);
 }
 const good=A.serializeProject(p,new A.AssetStore(),s);
 for(const [key,value]of [['selectedId','stage'],['currentEvent','click']]){
   const invalid={...s,[key]:value};assert.throws(()=>A.serializeProject(p,new A.AssetStore(),invalid),error=>error.code==='F503');
   // Change the readable editor state and its data payload together, so this
   // exercises selection validation rather than only the Markdown mismatch guard.
   const corrupt=good.replaceAll(JSON.stringify(key)+': '+JSON.stringify(s[key]),JSON.stringify(key)+': '+JSON.stringify(value));
   await assert.rejects(()=>A.parseProjectFile(corrupt),error=>error.code==='F503');
 }
 return {validSelections:['draft-main','second-start','click-script'],invalidTargetAndEventRejected:true};
});
await check('draft/pending-number-block-path',async()=>{
 const p=project(),s=state();p.scripts[0].source='10歩動く。';s.editorModes.script='blocks';
 const nodePath=['bodies','body',0,'inputs','args',0,'inputs','value'];
 s.pendingEditors=[{kind:'script',ownerKey:'script:draft-main',source:p.scripts[0].source,mode:'blocks',pending:{field:'value',value:'－',nodePath},draftTree:null}];
 const loaded=await A.parseProjectFile(A.serializeProject(p,new A.AssetStore(),s));assert.deepEqual(plain(loaded.editorState),s);
 const corrupt=plain(s);corrupt.pendingEditors[0].pending.nodePath=['bodies','missing'];assert.throws(()=>A.serializeProject(p,new A.AssetStore(),corrupt),error=>error.code==='F503');return {value:loaded.editorState.pendingEditors[0].pending.value,nodePath};
});
// A number being typed in an empty place for a value (the count of a new 「…回くり返す」): the place is drawn with a
// number's field, 「value」, so the kept state saves and opens as one in a number block does; another field is refused.
await check('draft/pending-number-in-empty-place',async()=>{
 const p=project(),s=state();p.scripts[0].source='';s.editorModes.script='blocks';
 const session=A.createEditorSession('script:draft-main','',{},p,1),location={parentId:session.blockView.id,body:'body',index:0};
 const choice=A.blockInsertionAvailability(session,'RepeatCount',location,{project:p,context:session.context});assert.equal(choice.node.inputs.count.schemaId,'Hole:expression');
 const ast={kind:'Script',body:[A.blockDecode(choice.node,{allowHoles:true})]},tree=A.blockEncode(ast,{allowHoles:true}).tree,source=A.formatScript(ast,{allowHoles:true}),nodePath=['bodies','body',0,'inputs','count'];
 s.pendingEditors=[{kind:'script',ownerKey:'script:draft-main',source,mode:'blocks',pending:{field:'value',value:'5',nodePath},draftTree:tree}];
 const loaded=await A.parseProjectFile(A.serializeProject(p,new A.AssetStore(),s));assert.deepEqual(plain(loaded.editorState),plain(s));
 const other=plain(s);other.pendingEditors[0].pending.field='text';assert.throws(()=>A.serializeProject(p,new A.AssetStore(),other),error=>error.code==='F503');
 return {value:loaded.editorState.pendingEditors[0].pending.value,nodePath};
});
// A field being typed in the body of a made block with an argument: the kept state is read in the draft's own context,
// whose argument the body uses, so the state saves and opens (read with no arguments, 「かずを言う。」 does not read).
await check('draft/callable-argument-kept-field',async()=>{
 const p=project(),s=state(),source='かずを言う。\n「やあ」と言う。';
 s.callableDraft={ownerId:'stage',type:'action',name:'はなす',argsText:'かず',source,editId:'',loadedKey:''};s.editorModes.draft='blocks';
 const nodePath=['bodies','body',1,'inputs','value'];
 s.pendingEditors=[{kind:'draft',ownerKey:'action:draft-1',source,mode:'blocks',pending:{field:'value',value:'こんにちは',nodePath},draftTree:null}];
 const loaded=await A.parseProjectFile(A.serializeProject(p,new A.AssetStore(),s));assert.deepEqual(plain(loaded.editorState),s);
 return {value:loaded.editorState.pendingEditors[0].pending.value,nodePath};
});
await check('history/thirty-frames-deltas-and-cursor',async()=>{
 const frames=Array.from({length:30},(_,i)=>{const p=project();p.scripts[0].source='「'+('長い原文🐈\n'.repeat(300))+i+'」と言う。';return{project:p,editorState:{...state(),revision:i},assets:new Map(),draftSerial:i,draftOpen:false};});
 frames[17].editorState.pendingEditors=[{kind:'script',ownerKey:'script:draft-main',source:'「未完成🐈\n二行目',mode:'code',pending:{kind:'code',value:'「未完成🐈\n二行目'},draftTree:null}];
 const packed=A.encodeWorkspaceHistory(frames,17),restored=await A.decodeWorkspaceHistory(packed);
 assert.equal(restored.cursor,17);assert.equal(restored.frames.length,30);assert.equal(packed.deltas.length,29);assert.ok(JSON.stringify(packed).length<JSON.stringify(frames).length/3);
 for(let i=0;i<30;i++){assert.deepEqual(plain(restored.frames[i].project),plain(frames[i].project));assert.deepEqual(plain(restored.frames[i].editorState),plain(frames[i].editorState));}
 return{frames:30,cursor:17,deltas:29,pending:restored.frames[17].editorState.pendingEditors[0].source,packedLength:JSON.stringify(packed).length,fullLength:JSON.stringify(frames).length};
});
// A history that keeps every picture built into the product (だんご of a sample too) without its bytes is read back by
// the public API as the page keeps it.
await check('history/every-built-in-picture',async()=>{
 const p=A.makeSampleProject('dance'),st=A.makeSampleAssetStore('dance'),refs=st.snapshotRefs(),frames=[{project:p,editorState:{...state(),selectedId:'stage',selectedScriptId:null},assets:refs}];
 const packed=A.encodeWorkspaceHistory(frames,0,[...refs.values()]),restored=await A.decodeWorkspaceHistory(packed);
 assert.ok(packed.assets.length>1&&packed.assets.every(a=>a.builtin&&a.blob===null));assert.equal(restored.frames[0].assets.size,refs.size);return{builtin:packed.assets.length};
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
 for(const mutate of mutations){const bad=plain(packed);mutate(bad);await assert.rejects(()=>A.decodeWorkspaceHistory(bad),refusedAs('draft-persistence#history'));}
 return{rejected:mutations.length};
});
const report={schema:'akari-draft-persistence-v1',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:snapshot(currentProductFile()),environment:'node / actual serializer and parser',uxAcceptance:false,results};
const output=path.resolve(process.argv[2]||'audit-evidence/draft-persistence.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');for(const r of results.filter(r=>r.status==='FAIL'))console.error(r.id+': '+r.error);console.log(`Draft persistence: ${results.filter(r=>r.status==='PASS').length}/${results.length} PASS`);if(report.status!=='PASS')process.exitCode=1;
