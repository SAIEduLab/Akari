// Full GUI row for every current block schema: create it through the real block GUI,
// edit every declared role, run the structural operations, compare block and source
// ASTs, and save and reopen. Rows listed in the schema contract's semanticRows also
// check the hand-written sentence and runtime result LANGUAGE.md gives them.
const {setupRegressionPage, completeRegressionHoles, openPaletteTools, openBodyForTest} = require('./regression-setup.cjs');
const U=require('./ui-routes.cjs');
const L=require('./audit-lib.cjs'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const C=require('../../lib/block-schema-contract.cjs');
const {answerProductConfirms}=require('../../lib/product-dialogs.cjs');
const{chromium}=require('playwright');
// Sentences without a subject: comment lines (LANGUAGE.md 243) and the wait for the
// preceding broadcast (LANGUAGE.md 428, 439). A subject choice must not change them.
const SUBJECTLESS=new Set(['CommentLine','WaitBroadcastGroup']);
const ARGUMENT_NAMES=['高さ','幅','速さ'];
(async()=>{const dir=L.path.resolve(process.argv[2]||'audit-evidence/browser/candidate'),output=L.path.resolve(process.argv[4]||dir),manifest=L.verifyManifest(dir),filter=process.argv[3]?.split(','),api=L.loadApi(L.read(L.path.join(dir,manifest.candidate))),contract=C.currentInputs(dir);
C.verifySchemaContract({fixture:contract.fixture,schemaIds:contract.schemaIds,productSchemas:api.BLOCK_SCHEMAS});
const schemas=contract.fixture.schemas,semanticRows=contract.fixture.semanticRows,results=[],errors=[],network=[],browser=await chromium.launch({executablePath:(process.env.AKARI_BROWSER||undefined),headless:true,args:['--allow-file-access-from-files']});
const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});await context.route(/^https?:\/\//,r=>{network.push(r.request().url());return r.abort();});const p=await context.newPage();p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.stack));p.on('dialog',d=>d.accept(d.type()==='prompt'?d.defaultValue():undefined));await answerProductConfirms(p);
const openPage=async()=>{await p.goto(pathToFileURL(L.path.join(dir,manifest.candidate)).href);await setupRegressionPage(p);await (await reveal(p.locator('#assetBtn'))).click();await p.locator('#soundInput').setInputFiles(L.path.join(__dirname,'media','tone.wav'));await p.waitForFunction(()=>Akari.app.project.sounds.length>=1);await (await reveal(p.locator('#assetClose'))).click();await (await reveal(p.locator('.tool[data-type="input"]'))).click();return p.locator('#objectSelect').inputValue();};
let inputId=await openPage();let draft=false,rootId='#blockEditor';
const session=()=>p.evaluate(d=>(d?Akari.app.editorState.draft:Akari.app.editorState.main),draft);
const projectText=()=>p.evaluate(()=>JSON.stringify(Akari.app.project));
const mode=async which=>{await p.locator(`#${draft?'callable':'editor'}Mode${which}`).click();await p.locator(rootId).waitFor({state:which==='blocks'?'visible':'hidden'});};
const root=()=>p.locator(rootId),node=(id)=>root().locator('.blockui-node[data-block-id="'+id+'"]');
const walkTree=(n,fn)=>{fn(n);for(const v of Object.values(n.inputs||{}))(Array.isArray(v)?v:[v]).forEach(c=>walkTree(c,fn));for(const v of Object.values(n.bodies||{}))v.forEach(c=>walkTree(c,fn));};
const locate=async schema=>{const s=await session(),found=[];walkTree(s.blockView,n=>{if(n.schemaId===schema)found.push(n);});return found;};
const byId=async id=>{let hit=null;walkTree((await session()).blockView,n=>{if(n.id===id)hit=n;});return hit;};
const at=(tree,path)=>path.reduce((n,k)=>n?.[k],tree);
const ownerName=async()=>draft?'たくどん':p.evaluate(()=>{const id=document.querySelector('#objectSelect').value;return Akari.app.project.components.find(c=>c.id===id)?.name||Akari.app.project.stage.name;});
const settle=async()=>{for(let i=0;i<20&&(await session()).pendingEdit;i++)await p.waitForTimeout(100);};
const paletteButton=async(schema,category)=>{await (await reveal(root().locator('[data-blockui-palette-mode]'))).selectOption(category==='expression'?'expression':'statement');const options=root().locator('.blockui-palette-options');if(await options.getAttribute('open')!==null)await options.locator(':scope > summary').click();await (await reveal(root().locator('[data-blockui-search]'))).fill(schema);const button=root().locator('[data-blockui-schema="'+schema+'"]');
 if(await button.count()===0){await U.showUnavailable(root());await (await reveal(root().locator('[data-blockui-search]'))).fill(schema);const hidden=root().locator('[data-blockui-schema="'+schema+'"]');const reason=await hidden.count()?await hidden.getAttribute('title'):'not listed';throw Error('Palette refuses '+schema+' here: '+reason);}
 assert.equal(await button.count(),1,'palette '+schema);if(await button.isDisabled()||await button.getAttribute('aria-disabled')==='true')throw Error('Disabled palette '+schema+': '+await button.getAttribute('title'));return button;};
const categoryOf=schema=>schemas.find(s=>s.id===schema)?.category;
const addRaw=async schema=>{await (await paletteButton(schema,categoryOf(schema))).click();};
const add=async schema=>{await addRaw(schema);await completeRegressionHoles(p,rootId);};
const setBody=async(target,event,source)=>{draft=false;rootId='#blockEditor';await (await reveal(p.locator('#objectSelect'))).selectOption(target);const available=await p.locator('#eventSelect option').evaluateAll(o=>o.map(x=>x.value));assert.ok(available.includes(event),'event '+event);await (await reveal(p.locator('#eventSelect'))).selectOption(event);await mode('code');const control=await reveal(p.locator('#codeEditor'));await openBodyForTest(control.page());await control.fill(source);await mode('blocks');await (await reveal(root().locator('[data-blockui-search]'))).fill('');};
const reset=async s=>{if(await p.locator('#procModal').isVisible())await (await reveal(p.locator('#procClose'))).click();draft=['ReturnStatement','LocalVariableDeclaration','LocalListDeclaration'].includes(s.id);rootId=draft?'#callableBlocks':'#blockEditor';if(draft){await (await reveal(p.locator('#procBtn'))).click();await p.locator(s.id==='ReturnStatement'?'#callableNewFunction':'#callableNewAction').click();await (await reveal(p.locator('#callableName'))).fill('検証定義');await mode('code');await (await reveal(p.locator('#callableCode'))).fill('');}else{await (await reveal(p.locator('#objectSelect'))).selectOption(s.id==='SensorRead:以前の値'||s.id==='SensorRead:新しい値'?inputId:s.id==='LooksCommand:SET_SELF_TEXT'?'button-1':'sprite-1');let event=s.id==='CloneCommand:DELETE_SELF'?'cloneStart':'start';if(s.id==='SensorRead:以前の値'||s.id==='SensorRead:新しい値')event='valueChanged';if(s.id==='SensorRead:受け取った知らせ')event='message';if(s.id==='SensorRead:押されたキー')event='keyDown';if(s.id==='SensorRead:以前の背景名'||s.id==='SensorRead:新しい背景名')event='backdropChanged';const available=await p.locator('#eventSelect option').evaluateAll(o=>o.map(x=>x.value));if(available.includes(event))await (await reveal(p.locator('#eventSelect'))).selectOption(event);await mode('code');await (async()=>{const control=await reveal(p.locator('#codeEditor')); await openBodyForTest(control.page()); return control.fill('');})();}await mode('blocks');await (await reveal(root().locator('[data-blockui-search]'))).fill('');await (await reveal(root().locator('[data-blockui-palette-mode]'))).selectOption('statement');await root().locator('.blockui-palette-options > summary').click();};
// Roles whose value is a structured choice rather than a text field.
const editActor=async(id,name,schemaId)=>{const before=await session(),current=(await byId(id)).fields.actorRef||{kind:'self'};
 const kind=root().locator('[data-blockui-structured-role="actorRef.kind"][data-block-id="'+id+'"]');await (await reveal(kind)).selectOption('named');
 const input=root().locator('[data-blockui-structured-role="actorRef.name"][data-block-id="'+id+'"]');await (await reveal(input)).fill(name);await input.press('Enter');await settle();
 // Leaving the field also commits; it reports the real refusal when Enter only stages the value.
 if((await session()).pendingEdit&&await input.isVisible()){await input.press('Tab');await settle();}
 if(SUBJECTLESS.has(schemaId)){if((await session()).pendingEdit)await (await reveal(p.locator('#editorCancel'))).click();const after=await session();assert.equal(after.pendingEdit,null);assert.equal(after.sourceText,before.sourceText,'a sentence without a subject keeps its text');assert.deepEqual((await locate(schemaId))[0].fields.actorRef||{kind:'self'},current,'a sentence without a subject keeps its block subject');return{key:'actorRef',type:'actor-ref',before:current,subjectInSentence:false,unchanged:true};}
 const value={kind:'named',name},after=await session();assert.equal(after.pendingEdit,null,schemaId+' subject '+name+' refused: '+after.pendingEdit?.reason+' '+JSON.stringify(after.pendingEdit?.value));assert.deepEqual((await locate(schemaId))[0].fields.actorRef,value,'block subject');
 if(categoryOf(schemaId)!=='expression')assert.ok(after.sourceText.split('\n').some(line=>line.trimStart().startsWith(name+'は')||line.includes('、'+name+'は')),'sentence names its subject: '+after.sourceText);
 assert.notDeepEqual(value,current);await closeWho();return{key:'actorRef',type:'actor-ref',before:current,value};};
// Back to the default subject, so later statements keep the subject the row's other
// operations were written for (an explicit subject also becomes the topic, LANGUAGE.md 202).
// The だれが choice stays open over the sentence until its summary is pressed again (1.5.0); close it when done.
const closeWho=async()=>{for(const summary of await root().locator('details.blockui-who[open] > summary').all())if(await summary.isVisible())await summary.click();};
const restoreSelf=async(schemaId,named)=>{const n=(await locate(schemaId))[0],kind=root().locator('[data-blockui-structured-role="actorRef.kind"][data-block-id="'+n.id+'"]');await (await reveal(kind)).selectOption('self');await settle();await closeWho();
 const after=await session();assert.equal(after.pendingEdit,null);assert.deepEqual((await locate(schemaId))[0].fields.actorRef,{kind:'self'},'subject restored');
 if(categoryOf(schemaId)!=='expression')assert.ok(!after.sourceText.split('\n').some(line=>line.trimStart().startsWith(named+'は')),'restored sentence has no explicit subject');return{kind:'self'};};
const editReference=async(id,f)=>{const node0=await byId(id);
 // A 「〜の合図を送る」 shows no field for its link to the wait after it: that link comes from the code that follows
 // (1.5.0, E-14 / I4V-09), so it is not a choice of the block and stays as it was.
 if(node0.schemaId==='Broadcast'&&f.key==='broadcastRef'){assert.equal(await root().locator('[data-blockui-field="'+f.key+'"][data-block-id="'+id+'"]').count(),0,'no field for the internal broadcastRef');
  return{key:f.key,type:f.type,before:node0.fields[f.key]??null,shown:false,internal:true};}
 const control=root().locator('[data-blockui-field="'+f.key+'"][data-block-id="'+id+'"]'),before=await session(),project=await projectText(),shown=await (await reveal(control)).inputValue();
 // LANGUAGE.md 439: the broadcast is bound by position, so a typed name cannot rebind it.
 await control.fill(shown+'改');await control.press('Tab');await p.waitForFunction(d=>!!(d?Akari.app.editorState.draft:Akari.app.editorState.main).pendingEdit,draft);
 const pending=(await session()).pendingEdit;assert.ok(pending.reason,'reference change explains its refusal');assert.equal(await projectText(),project,'refused reference leaves the project unchanged');
 await (await reveal(p.locator('#editorCancel'))).click();const after=await session();assert.equal(after.pendingEdit,null);assert.equal(after.sourceText,before.sourceText);assert.equal(await control.inputValue(),shown,'cancel restores the shown reference');
 return{key:f.key,type:f.type,before:shown,refused:true,reason:pending.reason};};
const editHeading=async(id,f)=>{const before=(await byId(id)).fields.heading,role=suffix=>root().locator('[data-blockui-structured-role="heading.'+suffix+'"][data-block-id="'+id+'"]'),event=await p.locator('#eventSelect').inputValue();
 await (await reveal(role('enabled'))).selectOption('yes');await (await reveal(root().locator('[data-blockui-action="heading-commit"]').first())).click();await settle();
 const value={event,actorRef:{kind:'self'}},after=await session();assert.equal(after.pendingEdit,null);assert.deepEqual(after.blockView.fields.heading,value,'heading chosen in the block');assert.deepEqual(after.syntaxAst.heading,value,'heading in the sentence');assert.notDeepEqual(value,before);return{key:f.key,type:f.type,before:before??null,value};};
const editArgumentNames=async(id,f)=>{const n=await byId(id),names=ARGUMENT_NAMES.slice(0,n.inputs.args.length);assert.ok(names.length,'argument names need passed values');
 await (await reveal(root().locator('[data-blockui-structured-role="argumentNames.mode"][data-block-id="'+id+'"]'))).selectOption('named');
 for(const [i,name]of names.entries()){const input=root().locator('[data-blockui-structured-role="argumentNames.'+i+'"][data-block-id="'+id+'"]');await (await reveal(input)).fill(name);if(i===names.length-1)await input.press('Enter');}await settle();
 assert.equal((await session()).pendingEdit,null);assert.deepEqual((await locate(n.schemaId))[0].fields.argumentNames,names,'named arguments');return{key:f.key,type:f.type,before:n.fields.argumentNames??null,value:names};};
// Directions of the move blocks (LANGUAGE.md 789-791). いまのばしょから動く starts with one direction, chosen from
// 右・左・上・下; the other one is added with 「＋ たてにも動く」／「＋ よこにも動く」 and taken off again with
// 「たてを外す」／「よこを外す」. 決めたばしょへ行く shows 「右へ」「上へ」 as words with no choice unless the code writes
// 左へ／下へ. Every other direction is a choice of its field; the choices are the product schema's.
const directionChoices=(schemaId,key)=>api.BLOCK_SCHEMA_BY_ID.get(schemaId)?.fields.find(x=>x.key===key)?.choices||['left','right'];
const editMoveDirection=async(id,f,choice)=>{const n=await byId(id),schemaId=n.schemaId;
 if(!['MotionCommand:MOVE_BY','MotionCommand:GOTO'].includes(schemaId)||await root().locator('[data-blockui-field="'+f.key+'"][data-block-id="'+id+'"]').count())return null;
 const choices=directionChoices(schemaId,f.key),leg=f.key==='xDir'?'x':'y',main=node(id).locator(':scope > .blockui-node-content > .blockui-node-main');
 if(schemaId==='MotionCommand:GOTO'){const word=f.key==='xDir'?'右へ':'上へ';assert.ok((await main.innerText()).replace(/\s+/g,'').includes(word),'fixed word '+word);
  assert.equal(await main.locator('select[data-blockui-field="'+f.key+'"],select[data-blockui-action="motion-direction"]').count(),0,'no direction choice in a fixed place');assert.equal(n.fields[f.key],choices[0]);return{key:f.key,type:f.type,before:n.fields[f.key],fixedWord:word,noChoice:true};}
 const single=main.locator(':scope > [data-blockui-action="motion-direction"]');
 if(n.inputs[leg]&&await single.count()){const before=await single.inputValue(),value=choice??choices.find(c=>c!==before);await (await reveal(single)).selectOption(value);await settle();
  const after=await session();assert.equal(after.pendingEdit,null);assert.equal((await locate(schemaId))[0].fields[f.key],value,'one direction chosen');assert.notEqual(value,before);return{key:f.key,type:f.type,before,value,oneDirection:true};}
 const source=(await session()).sourceText,add=node(id).locator('.blockui-extra [data-blockui-action="motion-leg-add-'+leg+'"]');await (await reveal(add)).click();await settle();id=(await locate(schemaId))[0].id;
 const control=root().locator('[data-blockui-field="'+f.key+'"][data-block-id="'+id+'"]'),before=await control.inputValue(),value=choice??choices.find(c=>c!==before);await (await reveal(control)).selectOption(value);await settle();
 assert.equal((await session()).pendingEdit,null);assert.equal((await locate(schemaId))[0].fields[f.key],value,'added direction chosen');
 await (await reveal(node(id).locator('.blockui-extra [data-blockui-action="motion-leg-remove-'+leg+'"]'))).click();await settle();{const now=(await session()).sourceText;assert.equal(now,source,'taking the added direction off restores the sentence: '+JSON.stringify({now,source}));}
 return{key:f.key,type:f.type,before,value,addedAndRemoved:true};};
const editField=async(id,f,annotation=false,choice)=>{
 if(!annotation&&f.type==='direction'){const moved=await editMoveDirection(id,f,choice);if(moved)return moved;}
 if(!annotation&&f.type==='actor-ref'){const schemaId=(await byId(id)).schemaId,name=choice??await ownerName(),result=await editActor(id,name,schemaId);if(!result.unchanged)result.restored=await restoreSelf(schemaId,name);return result;}
 if(!annotation&&f.type==='reference')return editReference(id,f);
 if(!annotation&&f.type==='heading')return editHeading(id,f);
 if(f.key==='hasElse')await U.openNodeMenu(node(id));if(annotation)await U.openAnnotations(node(id));let control=root().locator('['+(annotation?'data-blockui-annotation':'data-blockui-field')+'="'+f.key+'"][data-block-id="'+id+'"]');if(annotation){const details=control.locator('xpath=ancestor::details[1]');if(!(await details.getAttribute('open')!==null))await (await reveal(details.locator('summary'))).click();}const before=await control.inputValue(),signedParentId=await control.getAttribute('data-signed-parent-id'),signedNumber=f.type==='number'&&!!signedParentId;let value;
 if(f.type==='boolean'){value=before==='true'?'false':'true';await (await reveal(control)).selectOption(value);}else if(f.type==='qualifier'){value=before==='project'?'exact':'project';await (await reveal(control)).selectOption(value);}else if(f.type==='unit'){value=choice??(before==='点'?'歩':'点');await (await reveal(control)).selectOption(value);}else if(f.type==='direction'){const schemaId=(await byId(id)).schemaId;value=choice??directionChoices(schemaId,f.key).find(c=>c!==before);await (await reveal(control)).selectOption(value);}else{value=annotation?(f.fixtureValue||'※ 注釈  '):f.type==='number'?(choice!==undefined?String(choice):signedNumber?'-13':'13'):f.type==='comment'?' コメント改　 ':f.type==='string'?'文字改':f.key==='binder'?'要素改':'名前改';await (await reveal(control)).fill(value);await control.press('Tab');}
 if(f.key==='hasElse'&&value==='true')await completeRegressionHoles(p,rootId,id);
 const active=await session();assert.equal(active.pendingEdit,null,`${id}.${f.key} pending`);if(signedNumber){const nodes=[];walkTree(active.blockView,n=>nodes.push(n));const unary=nodes.find(n=>n.id===signedParentId);assert.ok(unary,'original signed parent remains in the tree');assert.equal(unary.inputs.value.id,id,'edited magnitude remains under the original signed parent');assert.equal(unary.schemaId,'UnaryExpression:NEG','merged signed control preserves the original negation');assert.equal(unary.inputs.value.schemaId,'NumberLiteral');assert.equal(unary.inputs.value.fields.value,13,'original child magnitude remains exactly13');}assert.notEqual(value,before);return{key:f.key,type:f.type,before,value,annotation};};
const action=(id,name)=>({click:async()=>{await U.openNodeMenu(node(id));await node(id).locator(':scope > .blockui-node-head [data-blockui-action="'+name+'"]').click();}});
const bodyPosition=(id,body,position)=>({click:async()=>keyboardActivate(root().locator('[data-blockui-action="body-insert"][data-parent-id="'+id+'"][data-blockui-body="'+body+'"][data-insert-index="'+position+'"]'))});
const slot=(id,input)=>({click:async()=>selectSlot(root().locator('[data-parent-id="'+id+'"][data-blockui-input="'+input+'"]').first())});
const append=async(schema)=>{const state=await session(),r=state.blockView,position=state.context.definitionKind==='function'&&r.bodies.body.at(-1)?.schemaId==='ReturnStatement'?r.bodies.body.length-1:r.bodies.body.length;await bodyPosition(r.id,'body',position).click();await add(schema);return(await session()).blockView.bodies.body[position];};
const historyRoundtrip=async before=>{const after=await session();assert.notEqual(after.sourceText,before.sourceText,'operation changes source');await p.keyboard.press('Control+z');assert.equal((await session()).sourceText,before.sourceText,'undo exact source');await p.keyboard.press('Control+y');assert.equal((await session()).sourceText,after.sourceText,'redo exact source');};
const blockSourceAgreement=async()=>{const before=await session();assert.equal(before.pendingEdit,null);assert.ok(before.syntaxAst);const equivalent=await p.evaluate(d=>{const A=Akari,s=d?A.app.editorState.draft:A.app.editorState.main;const parsed=A.parseSyntax(s.sourceText,s.context);return !!parsed.ast&&A.astEquivalent(s.syntaxAst,parsed.ast)&&A.astEquivalent(A.blockDecode(s.blockView),parsed.ast);},draft);assert.equal(equivalent,true,'block/source AST');await mode('code');const text=await p.locator(draft?'#callableCode':'#codeEditor').inputValue();assert.equal(text,before.sourceText);await mode('blocks');assert.equal((await session()).sourceText,text);return{before,text};};
const eventCountStructural=async s=>{
 const original=(await locate(s.id))[0],first=await append('WaitUntil');await action(original.id,'duplicate').click();await slot(first.id,'condition').click();
 let now=await session(),copied=now.blockView.bodies.body.find(n=>n.id===first.id).inputs.condition;assert.equal(copied.schemaId,s.id);assert.equal(api.astEquivalent(api.blockDecode(now.blockView),api.parseSyntax(now.sourceText,now.context).ast),true,'tree decode agrees after copy');
 const second=await append('WaitUntil');await action(copied.id,'move').click();await slot(second.id,'condition').click();await (await reveal(root().locator('[data-blockui-replacement-schema]'))).selectOption('BooleanLiteral');await (await reveal(root().locator('[data-blockui-action="confirm-expression-move"]'))).click();
 now=await session();assert.equal(now.blockView.bodies.body.find(n=>n.id===second.id).inputs.condition.schemaId,s.id);assert.equal(now.blockView.bodies.body.find(n=>n.id===first.id).inputs.condition.schemaId,'BooleanLiteral');
 const before=await session();await action(second.id,'remove').click();await historyRoundtrip(before);return{duplicateIntoConditionSlot:true,movedAcrossRequiredSlotsWithReplacement:true,deleteContainingStatement:true,undoRedoExact:true};
};
const structuralOperations=async(s,id)=>{
 if(s.kind==='EventCount')return eventCountStructural(s);
 if(s.category==='expression'){
  const original=(await locate(s.id))[0],destination=await append('Say');await slot(destination.id,'value').click();await add('BinaryExpression:ADD');const nested=(await session()).blockView.bodies.body.at(-1).inputs.value;
  await action(original.id,'duplicate').click();await slot(nested.id,'left').click();let now=await session(),copied=now.blockView.bodies.body.at(-1).inputs.value.inputs.left;assert.equal(copied.schemaId,s.id);assert.equal(api.astEquivalent(api.blockDecode(now.blockView),api.parseSyntax(now.sourceText,now.context).ast),true,'tree decode agrees after copy');
  await action(copied.id,'move').click();await slot(nested.id,'right').click();await (await reveal(root().locator('[data-blockui-replacement-schema]'))).selectOption('NumberLiteral');await (await reveal(root().locator('[data-blockui-action="confirm-expression-move"]'))).click();now=await session();assert.equal(now.blockView.bodies.body.at(-1).inputs.value.inputs.right.schemaId,s.id);assert.equal(now.blockView.bodies.body.at(-1).inputs.value.inputs.left.schemaId,'NumberLiteral');
  const before=await session();await action(destination.id,'remove').click();await historyRoundtrip(before);return{duplicateIntoNestedSlot:true,movedAcrossRequiredSlotsWithReplacement:true,deleteContainingStatement:true,undoRedoExact:true};
 }
 let current=await session(),originalId=s.category==='target'?current.blockView.bodies.body[0].id:s.category==='script'?current.blockView.bodies.body[0].id:id;
 const container=await append('RepeatCount');await editField(container.bodies.body[0].id,{key:'inlineComment',fixtureValue:'※ 移動先 '},true);await action(originalId,'duplicate').click();current=await session();const list=[];const walk=n=>{list.push(n);for(const children of Object.values(n.bodies||{}))children.forEach(walk);};walk(current.blockView);const original=list.find(n=>n.id===originalId),copy=list.filter(n=>n.schemaId===original.schemaId&&n.id!==originalId&&n.id!==container.id).find(n=>JSON.stringify({...n,id:null})===JSON.stringify({...original,id:null}))||list.find(n=>n.schemaId===original.schemaId&&n.id!==originalId&&n.id!==container.id);
 assert.ok(copy,'duplicate present');await action(copy.id,'move').click();await bodyPosition(container.id,'body',1).click();current=await session();const containerIndex=current.blockView.bodies.body.findIndex(n=>n.id===container.id),moved=current.blockView.bodies.body[containerIndex].bodies.body;assert.equal(moved.at(-1).id,copy.id);
 // A committed edit may give the blocks new ids (1.5.0), so the copy is found again by its place after each move.
 const shape=treeShape(moved.at(-1)),inner=async()=>(await session()).blockView.bodies.body[containerIndex].bodies.body;
 await action(copy.id,'move-up').click();const up=(await inner()).at(-2);assert.equal(treeShape(up),shape,'move-up moves the copy one place up');
 await action(up.id,'move-down').click();const down=(await inner()).at(-1);assert.equal(treeShape(down),shape,'move-down moves it back');
 const before=await session();await action(down.id,'remove').click();await historyRoundtrip(before);return{scope:s.category==='target'?'required target through owning statement':s.category==='script'?'root body child':'statement',duplicate:true,nestedMove:true,reorderBothDirections:true,delete:true,undoRedoExact:true};
};
const download=async name=>{const pending=p.waitForEvent('download');await (await reveal(p.locator('#saveBtn'))).click();const file=L.path.join(output,name);await (await pending).saveAs(file);return file;};
const reopen=async(file,expected)=>{await (await reveal(p.locator('#newBtn'))).click();assert.notEqual(await projectText(),expected);await p.locator('#fileInput').setInputFiles(file);await p.waitForFunction(expected=>JSON.stringify(Akari.app.project)===expected,expected);};
const saveReopen=async(index)=>{
 const before=await session(),owner=before.ownerKey;
 if(draft){await (await reveal(p.locator('#callableName'))).fill('保存検査'+index);await (await reveal(p.locator('#callableSave'))).click();assert.equal(await p.evaluate(()=>Akari.app.editorState.hasDraft),false);}
 const definition=draft?await p.evaluate(()=>Akari.app.editorState.callableDraft.loadedKey):null;if(draft)await (await reveal(p.locator('#procClose'))).click();
 const expected=await projectText(),file=await download('schema-roundtrip-'+index+'.akari.md');await reopen(file,expected);
 if(draft){await (await reveal(p.locator('#procBtn'))).click();await (await reveal(p.locator('#callableSelect'))).selectOption(definition);}else{const {targetId}=before.context;await (await reveal(p.locator('#objectSelect'))).selectOption(targetId);const choice=await p.locator('#eventSelect option').evaluateAll((options,key)=>options.find(option=>option.dataset.scriptKey===key)?.value,owner);assert.ok(choice,'saved body remains selectable by exact source ID '+owner);await (await reveal(p.locator('#eventSelect'))).selectOption(choice);}
 await mode('blocks');const after=await session();assert.equal(after.sourceText,before.sourceText,'saved source exact');assert.equal(api.astEquivalent(before.syntaxAst,after.syntaxAst),true,'saved AST/comments exact');return{file:L.path.basename(file),bytes:L.fs.statSync(file).size,explicitDraftSave:draft,sourceExact:true,astAndCommentEquivalent:true};
};
// An unfinished block stays a draft beside the committed body; saving keeps it and
// reopening restores the hole at the same place (LANGUAGE.md 67, 491, 511).
const saveReopenDraft=async(path,schemaId,index)=>{const before=await session(),expected=await projectText();assert.equal(before.pendingEdit?.kind,'block-draft');assert.equal(at(before.blockView,path)?.schemaId,schemaId);
 const file=await download('schema-draft-'+index+'.akari.md');await reopen(file,expected);await root().locator('.blockui-node[data-schema-id="'+schemaId+'"]').first().waitFor({state:'visible'});const after=await session();
 assert.equal(after.ownerKey,before.ownerKey,'reopened draft owner');assert.equal(after.sourceText,before.sourceText,'committed body unchanged by the draft');assert.equal(after.pendingEdit?.kind,'block-draft','reopened draft');assert.equal(at(after.blockView,path)?.schemaId,schemaId,'reopened hole at the same place');
 await root().locator('.blockui-node[data-schema-id="'+schemaId+'"]').first().waitFor({state:'visible'});return{file:L.path.basename(file),bytes:L.fs.statSync(file).size,holeRestored:true,path};};
const holeShown=async(id,schemaId)=>{const shown=node(id);await shown.waitFor({state:'visible'});assert.equal(await shown.getAttribute('data-schema-id'),schemaId);assert.ok((await shown.getAttribute('class')).includes('blockui-draft-hole'),'hole is drawn as an open place');const label=await shown.locator('.blockui-hole-label').first().textContent();assert.match(label,/^〔.+を えらぶ〕$/,'hole asks for a choice');return label;};
const treeShape=tree=>JSON.stringify(tree,(key,value)=>key==='id'?undefined:value);
const runRefused=async()=>{const before=await session(),project=await projectText();await (await reveal(p.locator('#runBtn'))).click();await p.waitForTimeout(400);assert.equal(await p.evaluate(()=>Akari.app.editorState.state),'DESIGN','an unfinished body does not run');assert.equal(await projectText(),project);const after=await session();assert.equal(after.pendingEdit?.kind,'block-draft');assert.equal(treeShape(after.blockView),treeShape(before.blockView),'the draft is kept');assert.equal(await p.locator('#editorPending').isVisible(),true,'the open place is pointed out');return{refused:true,notice:(await p.locator('#editorPending').innerText()).slice(0,200)};};
// A compact numeric hole is a number field in its slot (1.5.0): choosing the field shows the slot's tools,
// whose 「計算を入れる」 opens the expression palette.
const chooseExpression=async(holeId,schema)=>{const compact=root().locator('[data-expression-hole="true"][data-block-id="'+holeId+'"]');
 if(await compact.count()){await (await reveal(compact)).click();await (await reveal(compact.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-input-slot ")][1]').locator(':scope > .blockui-slot-head [data-blockui-action="slot-select"]'))).click();}
 else await (await reveal(node(holeId).locator('[data-blockui-action="hole-select-expression"]').first())).click();
 await (await paletteButton(schema,'expression')).click();};
const chooseStatement=async(holeId,schema)=>{await (await reveal(node(holeId).locator('[data-blockui-action="hole-select-statement"]').first())).click();await (await paletteButton(schema,'statement')).click();};
const chooseTarget=async(holeId,name)=>{await (await reveal(root().locator('[data-blockui-hole-target="'+holeId+'"]'))).selectOption(name);};
const readMonitor=()=>p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#runtimeMonitor .monitor-row')].map(r=>[r.querySelector('.monitor-key')?.textContent,[...(r.querySelector('.monitor-value')?.childNodes||[])].filter(n=>n.nodeType===3).map(n=>n.textContent).join('')])));
const actorBox=id=>p.evaluate(id=>{const e=document.querySelector('#formSurface .component[data-id="'+id+'"]');return e&&{x:parseFloat(e.style.left),y:parseFloat(e.style.top),transform:e.style.transform};},id);
// Runs the work and compares what the child sees with the hand-written expectation.
const runObserve=async row=>{const design=await projectText(),observed={};
 if(row.run?.from){const c=await p.evaluate(id=>Akari.app.project.components.find(c=>c.id===id),row.run.actor);assert.deepEqual({x:c.x,y:c.y,direction:c.direction},row.run.from,'design position before running');}
 await (await reveal(p.locator('#runBtn'))).click();await p.waitForFunction(()=>Akari.app.editorState.state==='RUNNING',null,{timeout:5000});
 if(row.run?.glideMs){const samples=await p.evaluate(({id,ms})=>new Promise(resolve=>{const out=[],t0=performance.now();const tick=()=>{const e=document.querySelector('#formSurface .component[data-id="'+id+'"]');out.push({x:parseFloat(e.style.left),y:parseFloat(e.style.top),t:performance.now()-t0});if(performance.now()-t0<ms)requestAnimationFrame(tick);else resolve(out);};tick();}),{id:row.run.actor,ms:row.run.glideMs+900});
  const {from,to}=row.run,moving=samples.filter(s=>s.x!==from.x||s.y!==from.y),between=samples.filter(s=>(s.x!==from.x||s.y!==from.y)&&(s.x!==to.x||s.y!==to.y)),arrived=samples.find(s=>s.x===to.x&&s.y===to.y);
  assert.ok(between.length>0,'the glide passes through intermediate positions');assert.ok(arrived,'the glide reaches its end point');assert.deepEqual(samples.at(-1),{...samples.at(-1),x:to.x,y:to.y},'the glide stays at its end point');
  for(let i=1;i<samples.length;i++){assert.ok(Math.abs(samples[i].x-to.x)<=Math.abs(samples[i-1].x-to.x)+1e-9&&Math.abs(samples[i].y-to.y)<=Math.abs(samples[i-1].y-to.y)+1e-9,'the glide moves only toward its end point');}
  const duration=arrived.t-moving[0].t;assert.ok(duration>=row.run.glideMs*0.6&&duration<=row.run.glideMs+600,'glide duration '+duration);observed.glide={samples:samples.length,intermediate:between.length,durationMs:Math.round(duration)};}
 if(row.run?.to){await p.waitForFunction(({id,to})=>{const e=document.querySelector('#formSurface .component[data-id="'+id+'"]');return e&&parseFloat(e.style.left)===to.x&&parseFloat(e.style.top)===to.y;},{id:row.run.actor,to:row.run.to},{timeout:5000}).catch(()=>{});await p.waitForTimeout(300);const box=await actorBox(row.run.actor);assert.equal(box.x,row.run.to.x,'x after running');assert.equal(box.y,row.run.to.y,'y after running');assert.match(box.transform,new RegExp('rotate\\('+row.run.to.direction+'deg\\)'),'direction after running');observed.position=box;}
 if(row.run?.stepsPerSecond!==undefined){await p.waitForTimeout(150);const start=await p.evaluate(id=>({x:parseFloat(document.querySelector('#formSurface .component[data-id="'+id+'"]').style.left),t:performance.now()}),row.run.actor);await p.waitForTimeout(row.run.observeMs);const end=await p.evaluate(id=>({x:parseFloat(document.querySelector('#formSurface .component[data-id="'+id+'"]').style.left),t:performance.now()}),row.run.actor);const seconds=(end.t-start.t)/1000,moved=end.x-start.x;assert.ok(Math.abs(moved-row.run.stepsPerSecond*seconds)<=row.run.tolerance,'continuous motion '+moved+' in '+seconds+'s');observed.continuous={seconds,moved};}
 if(row.speech!==undefined){await p.waitForFunction(text=>[...document.querySelectorAll('#formSurface .sprite-bubble-text')].some(e=>e.textContent===text),row.speech,{timeout:5000}).catch(()=>{});observed.speech=await p.locator('#formSurface .sprite-bubble-text').allTextContents();assert.ok(observed.speech.includes(row.speech),'speech '+JSON.stringify(observed.speech));}
 if(row.monitor){await p.waitForFunction(()=>true);for(let i=0;i<50;i++){const m=await readMonitor();if(Object.entries(row.monitor).every(([k,v])=>m[k]===v))break;await p.waitForTimeout(100);}observed.monitor=await readMonitor();for(const [k,v]of Object.entries(row.monitor))assert.equal(observed.monitor[k],v,'monitor '+k);}
 await (await reveal(p.locator('#stopBtn'))).click();await p.waitForFunction(()=>Akari.app.editorState.state==='DESIGN');await root().waitFor({state:'visible'});assert.equal(await projectText(),design,'running leaves the design unchanged');return observed;};
// The GUI result must mean the hand-written LANGUAGE.md sentence (same AST in the same
// body context) and end every generated sentence with one 。 (LANGUAGE.md 233). The
// generated wording itself is owned by the command catalog, not by these rows.
const sentenceIs=async row=>{const s=await session();assert.equal(s.pendingEdit,null);
 for(const line of s.sourceText.split('\n'))assert.ok(!/。。$/.test(line),'one sentence end per generated sentence: '+JSON.stringify(s.sourceText));
 const same=await p.evaluate(({d,text})=>{const A=Akari,m=d?A.app.editorState.draft:A.app.editorState.main,parsed=A.parseSyntax(text,m.context);return !!parsed.ast&&A.astEquivalent(parsed.ast,m.syntaxAst);},{d:draft,text:row.sentence});
 assert.equal(same,true,'the GUI result means the hand-written sentence '+JSON.stringify(row.sentence)+', got '+JSON.stringify(s.sourceText));return s.sourceText;};
// Rows whose GUI route is the generic palette route; their semantic step runs after the role edits.
const semanticStep=async(s,id)=>{const row=semanticRows[s.id],edits=row.edits||{};
 if(edits.actorRef)await editActor((await locate(s.id))[0].id,edits.actorRef,s.id);
 if(edits.value&&typeof edits.value==='object'){const owner=(await locate(s.id))[0];await slot(owner.id,'value').click();await (await paletteButton(edits.value.schema,'expression')).click();const inner=(await byId(owner.id)).inputs.value;assert.equal(inner.schemaId,edits.value.schema);
  if(edits.value.unit!==undefined)await editField(inner.id,{key:'unit',type:'unit'},false,edits.value.unit);
  if(edits.value.value!==undefined){const number=(await byId(inner.id)).inputs.value;await editField(number.id,{key:'value',type:'number'},false,edits.value.value);}}
 const result={sentence:await sentenceIs(row),runtime:await runObserve(row)};
 if(edits.actorRef&&categoryOf(s.id)!=='expression')result.restored=await restoreSelf(s.id,edits.actorRef);return result;};
const SEMANTIC_GENERIC=new Set(['QuantityLiteral','UnitlessRead','ActorQualifiedRead','MotionCommand:MOVE_BY']);
const fieldChoice=(s,f)=>semanticRows[s.id]?.edits?.[f.key];
const numberChoice=(s,input,index)=>{const edits=semanticRows[s.id]?.edits||{};if(input.key==='args'&&Array.isArray(edits.args))return edits.args[index];return typeof edits[input.key]==='number'?edits[input.key]:undefined;};
const genericRow=async(s,evidence)=>{
 await reset(s);let id;if(s.id==='Script'){id=(await session()).blockView.id;await add('NoOperation');evidence.creation='Implicit root with palette-created body';}else if(s.category==='target'){await add('Assignment');id=(await locate(s.id))[0].id;evidence.creation='Assignment target slot';}else if(s.category==='expression'){const holder=s.kind==='EventCount'?{statement:'WaitUntil',input:'condition'}:{statement:'Say',input:'value'};await add(holder.statement);const owner=(await locate(holder.statement))[0];await selectSlot(root().locator('[data-blockui-input="'+holder.input+'"][data-parent-id="'+owner.id+'"]').first());await add(s.id);id=(await locate(s.id))[0].id;evidence.creation='Expression palette into '+holder.statement+'.'+holder.input;}else{if(['Break','Continue'].includes(s.id)){await add('Forever');const owner=(await locate('Forever'))[0];await root().locator('[data-blockui-body="body"][data-parent-id="'+owner.id+'"]').last().click();}await add(s.id);id=(await locate(s.id))[0].id;evidence.creation='Statement palette';}
 assert.ok(await node(id).count()||s.id==='Script','Created node visible '+s.id);
 for(const f of s.fields.filter(f=>f.type!=='argument-names')){evidence.fields.push(await editField(id,f,false,fieldChoice(s,f)));id=(await locate(s.id))[0].id;}
 // Edit every value slot through its own child controls, including fixed arity arguments.
 for(const input of s.inputs){let created=(await locate(s.id))[0];
  // 〜のところへ行く: the partner is chosen from the work's parts and マウス, never typed (LANGUAGE.md 789).
  if(s.id==='MotionCommand:GOTO_PART'&&input.key==='args'){const target=node(id).locator(':scope > .blockui-node-content > .blockui-node-main [data-blockui-action="motion-target"]').first(),before=await target.inputValue(),options=await target.locator('option').evaluateAll(o=>o.map(x=>x.value)),value=options.find(v=>v!==before);
   assert.equal(created.inputs.args[0].fields.value,before,'the shown partner is the block\'s');await (await reveal(target)).selectOption(value);await settle();created=(await locate(s.id))[0];id=created.id;assert.equal((await session()).pendingEdit,null);assert.equal(created.inputs.args[0].fields.value,value,'chosen partner');
   evidence.inputs.push({key:input.key,multiple:input.multiple,count:1,edited:[{index:0,schema:created.inputs.args[0].schemaId,key:'value',type:'part-choice',before,value,options}]});continue;}
  if(created.inputs[input.key]===undefined){assert.equal(input.required,false,'required input missing '+s.id+'.'+input.key);
   // Optional roles absent from a new block: timed speech has its own control; the others are recorded as absent.
   if(s.id==='Say'&&input.key==='seconds'){await (await reveal(node(id).locator('[data-blockui-action="speech-timed"]').first())).click();created=(await locate(s.id))[0];assert.ok(created.inputs.seconds,'timed speech adds its time');}
   else{evidence.inputs.push({key:input.key,optional:true,absentAfterCreation:true});continue;}}
  let children=input.multiple?created.inputs[input.key]:[created.inputs[input.key]];const slotResult={key:input.key,multiple:input.multiple,count:children.length,edited:[]};for(let i=0;i<children.length;i++){let child=children[i];if(child.schemaId==='QuantityLiteral'){const expectedUnit=roleUnit(s.id,input.key,i);assert.ok(expectedUnit,'declared quantity role '+s.id+'.'+input.key+'['+i+']');assert.equal(child.fields.unit,expectedUnit,'exact role unit while retaining the original numeric operand edit');slotResult.unit=child.fields.unit;child=child.inputs.value;}const childSchema=schemas.find(x=>x.id===child.schemaId);for(const f of childSchema.fields){slotResult.edited.push({index:i,schema:child.schemaId,...await editField(child.id,f,false,f.type==='number'?numberChoice(s,input,i):undefined)});}if(!childSchema.fields.length&&input.type==='expression'){const slotControl=root().locator('[data-blockui-input="'+input.key+'"][data-parent-id="'+id+'"]'+(input.multiple?'[data-slot-index="'+i+'"]':''));await selectSlot(slotControl.first());await add('NumberLiteral');slotResult.edited.push({index:i,replacedBy:'NumberLiteral'});}}
  if(input.variadic){const before=children.length;await node(id).locator('[data-blockui-action="variadic-add"]').first().click();created=(await locate(s.id))[0];assert.equal(created.inputs[input.key].length,before+1);slotResult.variadicAdded=true;}
  evidence.inputs.push(slotResult);}
 // Named arguments need the passed values, so they are chosen after the slots.
 for(const f of s.fields.filter(f=>f.type==='argument-names')){evidence.fields.push(await editArgumentNames(id,f));id=(await locate(s.id))[0].id;}
 // The hand-written sentence has no memo, so the semantic step precedes the memo edits.
 if(SEMANTIC_GENERIC.has(s.id))evidence.semantic=await semanticStep(s,id);
 for(const a of s.annotations.filter(x=>x.editable!==false)){if(a.key==='elseComment'&&!(await locate(s.id))[0].fields.hasElse)continue;evidence.annotations.push(await editField(id,a,true));}
 for(const body of s.bodies){const owner=(await locate(s.id))[0];if(body.when&&!owner.fields[body.when])continue;const before=owner.bodies[body.key].length;await root().locator('[data-blockui-body="'+body.key+'"][data-parent-id="'+id+'"]').last().click();await add('NoOperation');assert.equal((await locate(s.id))[0].bodies[body.key].length,before+1);evidence.bodies.push({key:body.key,insertedNoOperation:true});}
 evidence.structuralOperations=await structuralOperations(s,id);const {before,text}=await blockSourceAgreement();evidence.source=text;evidence.diagnostics=before.diagnostics;evidence.roundtrip=true;evidence.saveReopen=await saveReopen(schemas.indexOf(s));
};
// Hole rows: a palette block with open roles stays a draft, cannot run, survives save
// and reopen, and becomes the hand-written sentence once each place is chosen.
const holeRow=async(s,evidence)=>{const row=semanticRows[s.id];draft=false;rootId='#blockEditor';await reset({id:'Hole'});const committed=await session();
 await addRaw(row.statement);let top=(await session()).blockView.bodies.body[0],holeId,path;assert.equal(top.schemaId,row.statement);
 if(row.statement==='Assignment'){assert.equal(top.inputs.target.schemaId,'Hole:target','target stays open');assert.equal(top.inputs.value.schemaId,'Hole:expression','value stays open, never 0');await chooseTarget(top.inputs.target.id,row.target);top=(await session()).blockView.bodies.body[0];holeId=top.inputs.value.id;path=['bodies','body',0,'inputs','value'];}
 else if(row.statement==='ListClear'){assert.equal(top.inputs.target.schemaId,'Hole:target','list stays open');holeId=top.inputs.target.id;path=['bodies','body',0,'inputs','target'];}
 else{assert.equal(top.inputs.condition.schemaId,'Hole:expression','condition stays open, never あてはまる');assert.deepEqual(top.bodies.thenBody.map(n=>n.schemaId),['Hole:statement'],'branch stays open, never 何もしない');await chooseExpression(top.inputs.condition.id,row.condition);top=(await session()).blockView.bodies.body[0];holeId=top.bodies.thenBody[0].id;path=['bodies','body',0,'bodies','thenBody',0];}
 // A hole shows only its label; a subject or memo belongs to whatever is chosen for it.
 evidence.creation='Statement palette leaves '+s.id+' open';evidence.label=await holeShown(holeId,s.id);evidence.fields.push({key:'label',shown:evidence.label});
 const pending=await session();assert.equal(pending.pendingEdit?.kind,'block-draft','the unfinished block is a draft');assert.equal(pending.sourceText,committed.sourceText,'the committed body is unchanged');
 evidence.run=await runRefused();evidence.saveReopen=await saveReopenDraft(path,s.id,schemas.indexOf(s));
 holeId=at((await session()).blockView,path).id;
 if(s.id==='Hole:expression'){await chooseExpression(holeId,row.fill);const number=at((await session()).blockView,path);assert.equal(number.schemaId,row.fill);evidence.fields.push(await editField(number.id,{key:'value',type:'number'},false,row.value));}
 else if(s.id==='Hole:target')await chooseTarget(holeId,row.target);
 else await chooseStatement(holeId,row.fill);
 await settle();evidence.sentence=await sentenceIs(row);const filled=await session();
 await p.keyboard.press('Control+z');const undone=await session();assert.notEqual(undone.sourceText+JSON.stringify(undone.pendingEdit),filled.sourceText+'null','undo returns before the last choice');await p.keyboard.press('Control+y');await settle();assert.equal((await session()).sourceText,filled.sourceText,'redo exact source');
 const {text}=await blockSourceAgreement();evidence.source=text;evidence.roundtrip=true;evidence.runtime=await runObserve(row);};
// A rule hole has no palette route: it comes back from a saved work file.
const ruleHoleRow=async(s,evidence)=>{const row=semanticRows[s.id];draft=false;rootId='#blockEditor';await reset({id:'Hole'});await add(row.body);const committed=await session();assert.equal(committed.sourceText,row.sentence);
 await (await reveal(root().locator('[data-blockui-action="rule-add"]'))).click();assert.equal((await session()).pendingEdit?.kind,'block-draft');
 const saved=await download('schema-rule-draft.akari.md'),expected=await projectText();
 const text=await p.evaluate(async t=>{const x=await Akari.parseProjectFile(t),editor=x.editorState.pendingEditors.find(e=>e.kind==='script'),rules=editor.draftTree.inputs.rules;rules.splice(0,1,{id:rules[0].id,schemaId:'Hole:rule',fields:{label:'続けて動くルール'},inputs:{},bodies:{},annotations:{}});return Akari.serializeProject(x.project,x.assetStore,x.editorState);},L.read(saved));
 const file=L.path.join(output,'schema-rule-hole-input.akari.md');L.fs.writeFileSync(file,text);await reopen(file,expected);await root().locator('.blockui-node[data-schema-id="Hole:rule"]').first().waitFor({state:'visible'});
 let state=await session(),hole=state.blockView.inputs.rules?.[0];assert.equal(hole?.schemaId,'Hole:rule','the saved rule hole is restored');assert.equal(state.sourceText,committed.sourceText,'the committed body is unchanged');evidence.creation='Restored from a saved work file';evidence.label=await holeShown(hole.id,s.id);evidence.fields.push({key:'label',shown:evidence.label});
 evidence.run=await runRefused();evidence.saveReopen=await saveReopenDraft(['inputs','rules',0],s.id,schemas.indexOf(s));
 // Removing the open rule finishes the draft; the committed body is unchanged, so no history step is added (LANGUAGE.md 176).
 await (await reveal(root().locator('[data-blockui-action="rule-remove"]').first())).click();await settle();evidence.sentence=await sentenceIs(row);assert.equal(((await session()).blockView.inputs.rules||[]).length,0,'the open rule is gone');
 const {text:code}=await blockSourceAgreement();evidence.source=code;evidence.roundtrip=true;evidence.runtime=await runObserve(row);};
const continuousRuleRow=async(s,evidence)=>{const row=semanticRows[s.id];draft=false;rootId='#blockEditor';await reset({id:'ContinuousRule'});
 await (await reveal(root().locator('[data-blockui-action="rule-add"]'))).click();let rule=(await session()).blockView.inputs.rules[0];assert.equal(rule.schemaId,s.id);
 for(const key of ['condition','seconds','distance'])assert.equal(rule.inputs[key].schemaId,'Hole:expression',key+' starts open, never an implicit value');
 assert.equal((await session()).pendingEdit?.kind,'block-draft');evidence.creation='Script rule list: add a rule';
 for(const [key,schema]of Object.entries(row.fill)){await chooseExpression((await session()).blockView.inputs.rules[0].inputs[key].id,schema);evidence.inputs.push({key,chosen:schema});}
 await settle();assert.equal((await session()).pendingEdit,null,'the rule is complete');rule=(await session()).blockView.inputs.rules[0];
 for(const key of ['seconds','distance'])assert.equal(rule.inputs[key].fields.unit,roleUnit(s.id,key,0),key+' role unit');
 for(const f of s.fields){evidence.fields.push(await editField(rule.id,f,false,row.edits[f.key]));rule=(await session()).blockView.inputs.rules[0];}
 // A rule's subject is not a topic for the body, so the hand-written subject stays.
 await editActor(rule.id,row.edits.actorRef,s.id);rule=(await session()).blockView.inputs.rules[0];
 const distance=rule.inputs.distance.inputs.value;evidence.fields.push(await editField(distance.id,{key:'value',type:'number'},false,row.edits.distance));
 evidence.semantic={sentence:await sentenceIs(row)};const agreement=await blockSourceAgreement();evidence.source=agreement.text;evidence.roundtrip=true;evidence.semantic.runtime=await runObserve(row);
 for(const a of s.annotations.filter(x=>x.editable!==false))evidence.annotations.push(await editField((await session()).blockView.inputs.rules[0].id,a,true));
 const before=await session();await (await reveal(root().locator('[data-blockui-action="rule-remove"]').first())).click();await settle();assert.equal(((await session()).blockView.inputs.rules||[]).length,0);await historyRoundtrip(before);
 await p.keyboard.press('Control+z');await settle();assert.equal((await session()).sourceText,before.sourceText,'undo restores the removed rule');assert.equal((await session()).blockView.inputs.rules[0].schemaId,s.id);
 evidence.structuralOperations={removeRule:true,undoRedoExact:true};evidence.saveReopen=await saveReopen(schemas.indexOf(s));};
const waitBroadcastGroupRow=async(s,evidence)=>{const row=semanticRows[s.id];
 // Precondition: a receiver that takes time, entered through the code editor of its own body.
 await setBody(row.receiver.target,row.receiver.event,row.receiver.source);assert.equal((await session()).sourceText,row.receiver.source);
 await reset({id:s.id});await add('Broadcast');const broadcastId=(await session()).blockView.bodies.body[0].inputs.message.id;
 const message=root().locator('[data-blockui-field="value"][data-block-id="'+broadcastId+'"]');await (await reveal(message)).fill(row.message);await message.press('Tab');await settle();
 await bodyPosition((await session()).blockView.id,'body',1).click();await add(s.id);let wait=(await locate(s.id))[0];evidence.creation='Statement palette directly after a Broadcast';
 await bodyPosition((await session()).blockView.id,'body',2).click();await add('Say');const say=(await locate('Say'))[0];await (await reveal(node(say.id).locator('.blockui-speech-data'))).selectOption({label:'点数の いまの中身'});await settle();
 const broadcast=(await session()).blockView.bodies.body[0];wait=(await locate(s.id))[0];assert.ok(wait.fields.broadcastRef,'the wait names its broadcast');assert.equal(wait.fields.broadcastRef,broadcast.fields.broadcastRef,'the wait is bound to the preceding broadcast');
 for(const f of s.fields){evidence.fields.push(await editField(wait.id,f,false));wait=(await locate(s.id))[0];}
 evidence.semantic={sentence:await sentenceIs(row)};const agreement=await blockSourceAgreement();evidence.source=agreement.text;evidence.roundtrip=true;evidence.semantic.runtime=await runObserve(row);
 for(const a of s.annotations.filter(x=>x.editable!==false)){evidence.annotations.push(await editField(wait.id,a,true));wait=(await locate(s.id))[0];}
 const kept=await session();await action(wait.id,'duplicate').click();await settle();assert.equal((await session()).sourceText,kept.sourceText,'a copy cannot leave its broadcast');
 wait=(await locate(s.id))[0];const before=await session();await action(wait.id,'remove').click();await settle();await historyRoundtrip(before);await p.keyboard.press('Control+z');await settle();assert.equal((await session()).sourceText,kept.sourceText,'undo restores the wait');
 evidence.structuralOperations={duplicateKeptBinding:true,delete:true,undoRedoExact:true};evidence.saveReopen=await saveReopen(schemas.indexOf(s));
 await setBody(row.receiver.target,row.receiver.event,'');};
const DEDICATED={'Hole:expression':holeRow,'Hole:statement':holeRow,'Hole:target':holeRow,'Hole:rule':ruleHoleRow,ContinuousRule:continuousRuleRow,WaitBroadcastGroup:waitBroadcastGroupRow};
try{for(const s of schemas){if(filter&&!filter.includes(s.id))continue;const evidence={category:s.category,fields:[],inputs:[],bodies:[],annotations:[]};try{
 await (DEDICATED[s.id]||genericRow)(s,evidence);results.push({id:s.id,pass:true,evidence});console.log('PASS '+s.id);
 }catch(e){results.push({id:s.id,pass:false,evidence,error:e.message.split('\n').slice(0,9).join('\n')});console.log('FAIL '+s.id+': '+e.stack);L.result(L.path.join(output,'schema-debug.json'),results);await p.screenshot({path:L.path.join(output,'schema-failure-'+results.length+'.png'),fullPage:true}).catch(()=>{});inputId=await openPage();draft=false;rootId='#blockEditor';}
 L.result(L.path.join(output,'schema-case-'+schemas.indexOf(s)+'.json'),results.at(-1));}
L.result(L.path.join(output,filter?'browser-schemas-selected.json':'browser-schemas.json'),{manifest,browser:browser.version(),expected:filter?filter.length:schemas.length,results,pageErrors:errors,networkRequests:network});
}finally{await browser.close();}console.log(JSON.stringify({passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,pageErrors:errors,networkRequests:network}));if(results.some(r=>!r.pass)||errors.length||network.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});


async function reveal(locator){
 if(await locator.count()===1){
  if(!await locator.isVisible())for(const panel of await locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())await panel.locator('.blockui-side-toggle').click();
  const controls=locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-palette-controls ")]');
  if(await controls.count())await openPaletteTools(controls.locator('..'));
  // A block's own tools (だれが, ほかのそうさ) are in its head, shown while the block is selected: select it first.
  const owner=locator.locator('xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," blockui-node-tools ")][1]/../..');
  if(await owner.count()&&!await owner.evaluate(e=>e.classList.contains('blockui-selected')))await U.clickNode(owner);
  // A selected value's own tools (「全部見て なおす」) are drawn over the words after it, and so over its sentence's
  // 「…」. A child chooses the sentence itself first: press the block where nothing lies over it.
  const extra=locator.locator('xpath=ancestor::details[contains(concat(" ",normalize-space(@class)," ")," blockui-extra ")][1]');
  if(await extra.count()&&await extra.getAttribute('open')===null){const summary=extra.locator(':scope > summary');
   if(await summary.isVisible()&&!await summary.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!hit&&e.contains(hit);}))await extra.locator('xpath=ancestor::article[1]').click({position:{x:4,y:4}});}
  // Open the outermost closed disclosure first; inner ones are re-read after each click.
  const ancestors=locator.locator(await locator.evaluate(e=>e.tagName==='SUMMARY')?'xpath=parent::details/ancestor::details[not(@open)]':'xpath=ancestor::details[not(@open)]');
  for(let i=0;await ancestors.count();i++){assert.ok(i<12,'disclosure ancestors open');await ancestors.first().locator(':scope > summary').click();}
 }
 return locator;
}

async function keyboardActivate(l){const p=l.page();for(let i=0;i<500&&!await l.evaluate(e=>e===document.activeElement);i++){const backwards=await l.evaluate(e=>!!(e.compareDocumentPosition(document.activeElement)&Node.DOCUMENT_POSITION_FOLLOWING));await p.keyboard.press(backwards?'Shift+Tab':'Tab');}assert(await l.evaluate(e=>e===document.activeElement),'exact insertion receives keyboard focus');await l.press('Enter');}
async function selectSlot(slot){await U.clickNode(slot.locator(':scope > .blockui-node'));await U.openSlot(slot);return keyboardActivate(slot.locator(':scope > .blockui-slot-head [data-blockui-action="slot-select"]'));}


// Specification-owned role units (LANGUAGE.md 227, 270, 280); never inferred from the observed block.
function roleUnit(schema,key,index){
 if(schema==='RepeatCount'&&key==='count')return '回';
 if(['WaitTime','Say'].includes(schema)&&key==='seconds')return '秒';
 if(schema==='ContinuousRule')return {seconds:'秒',distance:'歩'}[key]||null;
 if(['ListInsert','ListReplace','ListDelete','ListRead'].includes(schema)&&key==='index')return '番目';
 // The move sentences (LANGUAGE.md 745-760): legs in 歩, the time in 秒 on every move and turn block.
 if(['MotionCommand:GOTO','MotionCommand:MOVE_BY'].includes(schema)&&['x','y'].includes(key))return '歩';
 if(schema.startsWith('MotionCommand:')&&key==='seconds')return '秒';
 const args={
  'MotionCommand:MOVE':['歩'],'MotionCommand:SET_DIRECTION':['度'],
  'MotionCommand:TURN_RIGHT':['度'],'MotionCommand:TURN_LEFT':['度'],
  'LooksCommand:SET_SCALE':['％'],'SoundCommand:SET_VOLUME':['％'],
  'SoundCommand:TONE':['Hz','秒'],'SoundCommand:TONE_WAIT':['Hz','秒']
 };
 return key==='args'?args[schema]?.[index]:null;
}
