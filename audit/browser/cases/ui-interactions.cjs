const { currentProductFile } = require("./../../lib/product-path.cjs");
// Real browser interactions. Run: node audit-evidence/browser/ui-interactions.cjs [html] [output-prefix]
const U=require('./ui-routes.cjs');
const {withFreshPage}=require('./ui-case.cjs');
const {setupRegressionPage,openPaletteTools}=require('./regression-setup.cjs');
const {chooseView,viewToggle,readViewToggle}=require('./view-toggle.cjs');
const {openBodyForTest} = require('./regression-setup.cjs');
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const {chromium}=require('playwright');
const html=path.resolve(process.argv[2]||currentProductFile()),prefix=path.resolve(process.argv[3]||'audit-evidence/browser/ui-interactions'),initialHash=crypto.createHash('sha256').update(fs.readFileSync(html)).digest('hex');
(async()=>{
 const browser=await chromium.launch({executablePath:(process.env.AKARI_BROWSER||undefined),headless:true});
 const browserVersion=browser.version(),results=[],errors=[],networkRequests=[];
 let page,root;
 const nodes=id=>root.locator('.blockui-node[data-schema-id="'+id+'"]');
 const state=()=>page.evaluate(()=>{const s=Akari.app.editorState;return{source:s.main.sourceText,history:s.history,redo:s.redo,pending:s.main.pendingEdit,mode:s.main.mode,owner:s.main.ownerKey,selection:s.main.blockSelection,scroll:s.main.scrollState,ast:s.main.syntaxAst};});
 const fixture=async source=>{if(await root.isVisible()){const cancel=root.locator('[data-blockui-action="cancel"]');if(await cancel.isEnabled())await cancel.click();}await chooseView(page,'code',{reveal:reveal,open:openBodyForTest});await (async()=>{const control=await reveal(page.locator('#codeEditor')); await openBodyForTest(control.page()); return control.fill(source);})();await chooseView(page,'blocks',{reveal:reveal,open:openBodyForTest});assert.equal((await state()).mode,'blocks');};
 const selected=new Set((process.argv[4]||'').split(',').filter(Boolean));
 const test=async(id,fn,url=pathToFileURL(html).href)=>{
  if(selected.size&&!selected.has(id))return;
  try{
   await withFreshPage(browser,{url,errors,networkRequests},async fresh=>{
    page=fresh;await setupRegressionPage(page);root=page.locator('#blockEditor');
    try{
     await fn();const observed=await state();
     await page.screenshot({path:prefix+'.'+id+'.png',fullPage:true});
     // Keep the established summary image as well as per-case diagnostics.
     await page.screenshot({path:prefix+'.png',fullPage:true});
     results.push({id,pass:true,evidence:{source:observed.source,history:observed.history,redo:observed.redo,mode:observed.mode,pending:observed.pending}});
    }catch(error){await page.screenshot({path:prefix+'.'+id+'.FAIL.png',fullPage:true}).catch(()=>{});throw error;}
   });
   console.log('PASS',id);
  }catch(error){results.push({id,pass:false,error:error.stack});console.log('FAIL',id,error.message);}
 };
 try{
  await test('UI-empty-body-switch',async()=>{await fixture('');assert.equal((await state()).source,'');assert.equal(await nodes('Script').count(),1);await chooseView(page,'code',{reveal:reveal,open:openBodyForTest});assert.equal(await page.locator('#codeEditor').inputValue(),'');await chooseView(page,'blocks',{reveal:reveal,open:openBodyForTest});assert.equal((await state()).ast.body.length,0);});
  await test('UI-pending-number-commit-cancel',async()=>{
   await fixture('点数を1にする\n点数に2を足す');const old=await state(),field=nodes('NumberLiteral').first().locator('input');
   await (await reveal(field)).fill('-');await (await reveal(root.locator('[data-blockui-action="commit"]'))).click();let now=await state();assert.equal(now.source,old.source);assert.equal(now.history,old.history);assert.equal(now.pending.value,'-');
   await (await reveal(root.locator('[data-blockui-action="cancel"]'))).click();assert.equal(await field.inputValue(),'1');await (await reveal(field)).fill('7');await field.press('Enter');assert.equal((await state()).ast.body[0].value.value,7);
   // Entering a text field or typing in it moves no other block (E-12). A number that cannot be read is given up, with
   // its mistake, when another field is entered; the new field takes the typing (E-12).
   await fixture('右に15度回る。\n「こんにちは」と言う。\n1秒待つ。');const tops=()=>root.locator('.blockui-world .blockui-node.blockui-statement').evaluateAll(n=>n.map(e=>Math.round(e.getBoundingClientRect().top)).join(','));
   const t0=await tops(),text=nodes('Say').locator('.blockui-field[data-field-type="string"] input').first();await (await reveal(text)).click();assert.equal(await tops(),t0);await page.keyboard.insertText('あ');assert.equal(await tops(),t0);await page.keyboard.press('Escape');
   const main=':scope > .blockui-node-content > .blockui-node-main input',turn=nodes('MotionCommand:TURN_RIGHT').locator(main).first(),wait=nodes('WaitTime').locator(main).first(),error=root.locator('.blockui-field-error');
   await (await reveal(turn)).click();await page.keyboard.type('x');await page.keyboard.press('Enter');assert.notEqual((await error.textContent()).trim(),'');
   await (await reveal(wait)).click();assert.equal((await error.textContent()).trim(),'');assert.equal(await turn.inputValue(),'15');await page.keyboard.type('3');await page.keyboard.press('Enter');
   now=await state();assert(now.source.includes('右に15度回る。')&&now.source.includes('3秒待つ。'),now.source);
  });
  // A minus number given up with Esc shows again as it was drawn (－2), not as a number's text (-2).
  // A minus number entered while another field cannot be decided shows again as it was drawn (－2), as with Esc.
  await test('UI-minus-number-kept-beside-undecided-field',async()=>{
   await fixture('点数を－2にする');const name=root.locator('input[data-blockui-field="name"]').first(),field=nodes('UnaryExpression:NEG').locator('input[data-signed-edit="true"]').first();
   await (await reveal(name)).fill('あ。い');await field.focus();await page.keyboard.type('5');
   await page.waitForFunction(()=>!!Akari.app.editorState.main?.pendingEdit);
   assert.equal(await field.inputValue(),'－2');
   return {shown:await field.inputValue()};
  });
  // A style added to the page's head (a font loaded, a user style) measures the fields again, also after the blocks
  // were drawn again (a field changed): the head is watched until the view is put away.
  await test('UI-head-style-measures-fields',async()=>{
   await fixture('「こんにちは」と言う');const field=()=>root.locator('[data-blockui-field="value"]').first();await field().waitFor();
   await (await reveal(field())).fill('もういちど');await field().press('Enter');await page.waitForFunction(()=>Akari.app.editorState.main.sourceText.includes('もういちど'));
   await page.evaluate(()=>document.activeElement?.blur());await page.waitForFunction(()=>document.activeElement===document.body||!document.activeElement?.closest('#blockEditor'));
   const before=await field().evaluate(e=>e.getBoundingClientRect().width);
   await page.evaluate(()=>{const s=document.createElement('style');s.textContent='#blockEditor [data-blockui-field]{font-size:8px !important}';document.head.append(s);});
   const grown=await page.waitForFunction(w=>{const e=document.querySelector('#blockEditor [data-blockui-field="value"]');return e&&e.getBoundingClientRect().width<w-5;},before,{timeout:3000}).then(()=>true,()=>false);
   assert.equal(grown,true,'the field was not measured again: '+before);
   return {grown};
  });
  // The count of copies reads in the block as the code writes it (3つ), so the block and the code say the same.
  await test('UI-copy-count-word-as-code',async()=>{
   await fixture('自分のコピーを3つ作る');const words=await root.locator('.blockui-node[data-schema-id^="CloneCommand"]').first().locator('.blockui-node-main > span').allTextContents();
   assert.ok(words.includes('つ')&&!words.includes('体'),words.join('|'));
   return {words};
  });
  await test('UI-minus-number-escape-keeps-its-sign',async()=>{
   await fixture('点数を－2にする');const field=nodes('UnaryExpression:NEG').locator('input[data-signed-edit="true"]').first();assert.equal(await field.inputValue(),'－2');
   await (await reveal(field)).fill('5');await field.press('Escape');assert.equal(await field.inputValue(),'－2');assert.equal((await state()).pending,null);
   await (await reveal(field)).fill('－7');await field.press('Escape');assert.equal(await field.inputValue(),'－2');
   await (await reveal(field)).fill('－7');await field.press('Enter');assert.equal(await field.inputValue(),'－7');
  });
  // Esc in a field tells what its button names (入力を やめる), and speaks of a block being put in only when there is one.
  await test('UI-field-escape-says-input-stopped',async()=>{
   await fixture('点数を1にする');const field=nodes('NumberLiteral').first().locator('input'),message=root.locator('.blockui-message');
   await (await reveal(field)).fill('5');assert.equal((await root.locator('[data-blockui-action="cancel"]').textContent()).trim(),'入力を やめる');
   await field.press('Escape');assert.equal((await message.textContent()).trim(),'入力を やめたよ');assert.equal(await field.inputValue(),'1');
  });
  await test('UI-statement-duplicate-order-delete',async()=>{
   await fixture('点数を1にする\n点数に2を足す');await U.nodeAction(nodes('Assignment').first(),'duplicate');assert.equal((await state()).ast.body.length,3);
   await U.nodeAction(nodes('Assignment').first(),'move-down');await U.nodeAction(nodes('Assignment').first(),'remove');assert.equal((await state()).ast.body.length,2);
  });
  await test('UI-else-annotation-and-comment-lines',async()=>{
   await fixture('もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n  何もしない。');await U.openNodeMenu(nodes('IfStatement').first());await (await reveal(root.locator('[data-blockui-field="hasElse"]'))).selectOption('true');assert.equal((await state()).ast.body[0].elseBody.length,1);
   await U.openAnnotations(nodes('IfStatement').first());const ann=root.locator('[data-blockui-annotation="elseComment"]');await ann.fill('※ 空でも保持 ');await ann.press('Enter');assert.equal((await state()).ast.body[0].elseComment,'※ 空でも保持 ');
   await U.openNodeMenu(nodes('IfStatement').first());await (await reveal(root.locator('[data-blockui-field="hasElse"]'))).selectOption('false');assert.equal((await state()).ast.body[0].hasElse,false);
   await fixture('※ 元 ');await nodes('CommentLine').locator('textarea').fill(' 一行目  \n 二行目 ');await (await reveal(root.locator('[data-blockui-action="commit"]'))).click();assert.deepEqual((await state()).ast.body.map(n=>n.text),[' 一行目  ',' 二行目 ']);
  });
  await test('UI-variadic-order-size-and-nested-replace',async()=>{
   await fixture('［1、2、3］を言う。');let list=nodes('ListLiteral');await U.slotAction(U.ownedSlots(list).first(),'variadic-down');assert.deepEqual((await state()).ast.body[0].value.items.map(x=>x.value),[2,1,3]);
   await (await reveal(list.locator('[data-blockui-action="variadic-add"]'))).click();assert.equal((await state()).ast.body[0].value.items.length,4);await U.slotAction(U.ownedSlots(list).first(),'variadic-remove');assert.equal((await state()).ast.body[0].value.items.length,3);
   await U.slotAction(U.ownedSlots(list).first(),'slot-select');await (await reveal(root.locator('[data-blockui-search]'))).fill('BinaryExpression:ADD');await (await reveal(root.locator('[data-blockui-schema="BinaryExpression:ADD"]'))).click();assert.equal((await state()).ast.body[0].value.items[0].kind,'BinaryExpression');
  });
  await test('UI-variadic-40-input-paging',async()=>{
   await fixture('［'+Array.from({length:40},(_,i)=>i+1).join('、')+'］を言う');const list=nodes('ListLiteral');assert.equal(await list.locator('.blockui-node[data-schema-id="NumberLiteral"]').count(),20);
   await (await reveal(list.locator('[data-blockui-action="input-next"]'))).click();const last=list.locator('.blockui-node[data-schema-id="NumberLiteral"] input').last();assert.equal(await last.inputValue(),'40');await last.fill('99');await last.press('Enter');assert.equal((await state()).ast.body[0].value.items[39].value,99);
  });
  await test('UI-required-body-noop-replacement',async()=>{
   await fixture('2回くり返す。\n  1を言う。');let old=await state();await U.nodeAction(nodes('Say'),'remove');assert.equal((await state()).source,old.source);assert.equal((await state()).history,old.history);
   assert.equal(await nodes('Hole:statement').count(),1);assert.ok(await page.evaluate(()=>Akari.app.editorState.main.blockDraft));await page.locator('#runBtn').click();assert.equal(await page.evaluate(()=>Akari.app.editorState.state),'DESIGN');
   // A refused run chooses the empty body as the destination, so the next real palette press repairs it.
   await root.locator('[data-blockui-action="palette-add"][data-blockui-schema="WaitTime"]').click();
   assert.equal((await state()).ast.body[0].body[0].kind,'WaitTime');assert.equal((await state()).ast.body.length,1);
   assert.equal(await nodes('Hole:statement').count(),0);await page.locator('#undoBtn').click();assert.equal((await state()).source,old.source);assert.equal(await nodes('Say').count(),1);await U.nodeAction(nodes('Say'),'replace-noop');assert.equal((await state()).ast.body[0].body[0].kind,'NoOperation');await page.locator('#undoBtn').click();assert.equal((await state()).source,old.source);
  });
  await test('UI-pointer-preview-single-drop-cancel',async()=>{
   await fixture('1を言う。\n2を言う。\n3を言う。');for(let i=0;i<3;i++){await U.nodeAction(nodes('Say').nth(i),'collapse');await U.nodeAction(nodes('Say').nth(i),'collapse');}
   const handle=nodes('Say').first().locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-phrase-text').last(),drop=root.locator('.blockui-script > .blockui-node-content > .blockui-body > [data-insert-index="3"]');
   let old=await state();const drag=async()=>{let h=await handle.boundingBox(),d=await drop.boundingBox();await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(d.x+20,d.y+d.height/2,{steps:7});d=await drop.boundingBox();await page.mouse.move(d.x+20,d.y+d.height/2);};
   await drag();assert.equal(await root.locator('.blockui-drop-preview').count(),1);assert.equal((await state()).source,old.source);await page.mouse.up();assert.deepEqual((await state()).ast.body.map(x=>x.value.value),[2,3,1]);assert.equal((await state()).history,old.history+1);await page.waitForTimeout(400);
   old=await state();await drag();await root.dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();assert.equal((await state()).source,old.source);assert.equal((await state()).history,old.history);assert.equal((await state()).pending,null);
   // Right over an empty value hole a sentence turns grey and says why, and let go there it puts nothing in (E-04;
   // LANGUAGE.md: 命令を値の穴へ入れる). The hole is the empty condition of a もし put in from the block list; a sentence over a
   // value already in a block goes before or after that block (UI-carry-over-a-value-not-refused). Over the block list
   // only the block list is the red delete zone (E-05).
   await page.waitForTimeout(400);await fixture('1秒待つ。');
   const ifItem=root.locator('.blockui-palette-item [data-blockui-schema="IfStatement"]').first();await ifItem.scrollIntoViewIfNeeded();await ifItem.click();await page.waitForTimeout(300);old=await state();
   const wait=nodes('WaitTime').locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-phrase-text').last(),slot=nodes('IfStatement').locator('.blockui-input-slot[data-blockui-drop]').filter({has:page.locator('.blockui-node[data-schema-id="Hole:expression"]')}).first(),list=root.locator('.blockui-palette');
   assert.equal(await slot.count(),1,'the もし has an empty condition hole');
   let w=await wait.boundingBox(),s=await slot.boundingBox();await page.mouse.move(w.x+w.width/2,w.y+w.height/2);await page.mouse.down();await page.mouse.move(s.x+s.width/2,s.y+s.height/2,{steps:7});s=await slot.boundingBox();await page.mouse.move(s.x+s.width/2,s.y+s.height/2);
   assert.equal(await page.locator('.blockui-drag-ghost.blockui-ghost-invalid').count(),1);assert.equal((await page.locator('.blockui-drag-reason').textContent()).trim(),'ここには おけないよ');
   const l=await list.boundingBox();await page.mouse.move(l.x+l.width/2,l.y+l.height/2,{steps:7});
   const zone=await list.evaluate(p=>{const a=getComputedStyle(p,'::after');return{on:p.classList.contains('blockui-delete-zone'),w:parseFloat(a.width),h:parseFloat(a.height),cw:p.clientWidth,ch:p.clientHeight};});
   assert(zone.on&&Math.abs(zone.w-zone.cw)<=2&&Math.abs(zone.h-zone.ch)<=2,JSON.stringify(zone));
   s=await slot.boundingBox();await page.mouse.move(s.x+s.width/2,s.y+s.height/2,{steps:7});await page.mouse.up();
   assert.equal((await state()).source,old.source);assert.equal((await state()).history,old.history);assert.deepEqual((await state()).pending,old.pending);assert.equal(await slot.locator('.blockui-node[data-schema-id="Hole:expression"]').count(),1,'the hole stays empty');
   assert.equal((await page.locator('.blockui-drop-note').textContent()).trim(),'ここには おけないよ');await page.waitForTimeout(400);
  });
  // An empty place (あいている ところ) carried to the block list is no sentence to delete: the list does not turn into the
  // delete zone, and letting it go there deletes nothing and does not say けしたよ.
  await test('UI-hole-to-list-not-deleted',async()=>{
   await fixture('もし点数が1なら、\n  10歩進む。');await (await reveal(root.locator('[data-blockui-action="else-add"]').first())).click();
   const hole=root.locator('.blockui-world [data-schema-id="IfStatement"] [data-blockui-body-wrapper="elseBody"] [data-schema-id="Hole:statement"]').first();
   assert.equal(await hole.count(),1);const before=await state(),list=root.locator('.blockui-palette');
   const h=await hole.boundingBox(),l=await root.locator('.blockui-palette-list').boundingBox();await page.mouse.move(h.x+10,h.y+h.height/2);await page.mouse.down();
   await page.mouse.move(h.x+30,h.y+h.height/2,{steps:5});await page.mouse.move(l.x+40,l.y+60,{steps:10});const zone=await list.evaluate(p=>p.classList.contains('blockui-delete-zone'));await page.mouse.up();
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const after=await state(),note=(await page.locator('.blockui-drop-note').textContent().catch(()=>''))||'';
   assert.deepEqual({zone,deleted:/けした/.test(note),source:after.source,holes:await hole.count()},{zone:false,deleted:false,source:before.source,holes:1});
   return {note:note.trim()};
  });
  // A subject carried over from the sentence before stays a pale chip when the sentence quotes 「…、マスコットは…」: a name
  // with は inside a quoted text is no subject written there.
  await test('UI-carried-subject-beside-quote',async()=>{
   await fixture('マスコットは10歩進む。\n「こんにちは、マスコットは元気」と言う。');
   const say=nodes('Say').first(),carried=await say.locator('[data-carried-subject="マスコット"]').count(),written=await say.locator('.blockui-subject-text').count();
   assert.deepEqual({carried,written},{carried:1,written:0});return {carried,written};
  });
  // A made block being written and not saved, with its screen closed (とじる): ▶ and 「うごく作品を ファイルに」 say what
  // to do with it (open it, save or stop), not to close a screen that is already closed, and not nothing.
  await test('UI-closed-callable-draft-told',async()=>{
   await (await reveal(page.locator('#procBtn'))).click();await (await reveal(page.locator('#callableNewFunction'))).click();
   await (await reveal(page.locator('#callableName'))).fill('二倍');await (await reveal(page.locator('#procClose'))).click();
   assert.equal(await page.evaluate(()=>document.querySelector('#procModal').classList.contains('show')),false);
   const status=async button=>{const before=(await page.locator('#statusText').textContent()).trim();await (await reveal(page.locator(button))).click();await page.waitForFunction(old=>document.querySelector('#statusText').textContent.trim()!==old,before,{timeout:3000});return (await page.locator('#statusText').textContent()).trim();};
   const run=await status('#runBtn'),exported=await status('#exportBtn');
   assert.deepEqual({run:/とじてから/.test(run),runTells:/書きかけ/.test(run),exportTells:/書きかけ/.test(exported)},{run:false,runTells:true,exportTells:true});
   return {run,exported};
  });
  // A tool button pressed while the code does not read does nothing yet: the status line says so and where to look,
  // and the same button works once the code reads.
  await test('UI-tool-waits-for-unreadable-code-says-why',async()=>{
   await chooseView(page,'code',{reveal:reveal,open:openBodyForTest});const code=await reveal(page.locator('#codeEditor'));await openBodyForTest(code.page());await code.fill('「あ」とゆう。');
   const paint=async()=>(await reveal(page.locator('#paintAdd'))).click();
   await paint();await page.waitForFunction(()=>document.querySelector('#statusText').textContent.trim().startsWith('まだ できないよ。'),null,{timeout:3000});
   const said=(await page.locator('#statusText').textContent()).trim();
   assert.deepEqual({said,open:await page.evaluate(()=>document.querySelector('#paintModal').classList.contains('show'))},{said:'まだ できないよ。書き方に 直す ところが あるよ。コードの 1行目を 見てね。',open:false});
   await code.fill('「あ」と言う。');await paint();await page.waitForFunction(()=>document.querySelector('#paintModal').classList.contains('show'),null,{timeout:3000});
   return {said};
  });
  // A draft saved in the file and not changed since is no unsaved change (LANGUAGE「編集と読み込みからの復帰」): leaving
  // the page does not ask, and the title has no ●; a change after the save asks again.
  await test('UI-saved-draft-not-unsaved',async()=>{
   await chooseView(page,'code',{reveal:reveal,open:openBodyForTest});const code=await reveal(page.locator('#codeEditor'));await openBodyForTest(code.page());
   await code.fill('「あ」と言う。\nほにゃららする。');await page.waitForFunction(()=>document.querySelector('#dirtyState').textContent.includes('書きかけ'));
   const leave=()=>page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return {asks:e.defaultPrevented,mark:document.title.startsWith('● ')};});
   const download=page.waitForEvent('download');await (await reveal(page.locator('#saveBtn'))).click();
   if(await page.locator('#saveConfirmModal.show').isVisible())await page.locator('#saveConfirmYes').click();await download;
   await page.waitForFunction(()=>document.querySelector('#statusText').textContent.includes('ほぞんしたよ'));
   const saved=await leave();await code.fill('「あ」と言う。\nほにゃららする。\nむにゃむにゃする。');await page.waitForFunction(()=>document.querySelector('#dirtyState').textContent.includes('書きかけ'));const changed=await leave();
   assert.deepEqual({saved,changed},{saved:{asks:false,mark:false},changed:{asks:true,mark:true}});
   return {saved,changed};
  });
  // With no IndexedDB, a work whose pictures are all built into the product (だんご of the toolbox) is kept on this
  // computer (localStorage), as one with the default mascot only is (LANGUAGE「内蔵素材以外の素材を必要としない作品」).
  await test('UI-autosave-built-in-pictures-without-indexeddb',async()=>{
   await page.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{get(){throw new Error('no IndexedDB');}});});
   await page.reload();await setupRegressionPage(page);
   await page.evaluate(()=>document.querySelector('.tool[data-sprite-preset="dango"]').click());
   await page.waitForFunction(()=>Akari.app.project.components.some(c=>c.name.startsWith('だんご')));
   await page.waitForFunction(()=>/のこしたよ|のこせないよ/.test(document.querySelector('#autosaveState').textContent),null,{timeout:8000});
   const kept=await page.evaluate(()=>({said:document.querySelector('#autosaveState').textContent.trim(),stored:Object.keys(localStorage).some(k=>k.startsWith('akari.autosave'))}));
   assert.equal(kept.stored,true,kept.said);assert.ok(!kept.said.includes('のこせないよ'),kept.said);
   return kept;
  });
  // A mistake that stops the run while another body asks a question closes the question: no answer goes on, and the
  // question does not come back when the mistake's window is closed.
  await test('UI-run-failure-closes-question',async()=>{
   const text=await page.evaluate(()=>{const p=Akari.makeEmptyProject();p.name='質問と まちがい';p.projectData.variables=[{id:'q-score',name:'点数',initialValue:0}];
    p.scripts=[{id:'q-ask',targetId:'stage',event:'start',source:'作品を動かしたとき、\n  「名前は？」と聞く。'},{id:'q-fail',targetId:'sprite-1',event:'start',source:'作品を動かしたとき、たくどんは、\n  0.3秒待つ。\n  点数を（10÷0）にする。'}];
    return Akari.serializeProject(p,Akari.makeDefaultAssetStore());});
   await page.locator('#fileInput').setInputFiles({name:'question-failure.akari.md',mimeType:'text/markdown',buffer:Buffer.from(text)});
   await page.waitForFunction(()=>document.querySelector('#loseConfirmModal.show')||Akari.app.project.name==='質問と まちがい');
   if(await page.locator('#loseConfirmModal.show').isVisible())await page.locator('#loseConfirmProceed').click();
   await page.waitForFunction(()=>Akari.app.project.name==='質問と まちがい'&&Akari.app.editorState.state==='DESIGN');
   await (await reveal(page.locator('#runBtn'))).click();await page.locator('#questionModal.show').waitFor();await page.locator('#failureModal.show').waitFor();
   const shown=()=>page.evaluate(()=>document.querySelector('#questionModal').classList.contains('show'));
   const atFailure=await shown();await page.locator('#failureClose').click();await page.waitForFunction(()=>!document.querySelector('#failureModal.show'));
   assert.deepEqual({atFailure,afterClose:await shown()},{atFailure:false,afterClose:false});
   return {atFailure};
  });
  await test('UI-IME-switch-hold-end-commit',async()=>{
   await fixture('1を言う');const old=await state(),field=nodes('NumberLiteral').locator('input');await field.dispatchEvent('compositionstart');await (await reveal(field)).fill('24');await chooseView(page,'code',{reveal:reveal,open:openBodyForTest});assert.equal((await state()).mode,'blocks');assert.equal((await state()).source,old.source);await field.dispatchEvent('compositionend');await field.press('Enter');assert.equal((await state()).ast.body[0].value.value,24);
  });
  await test('UI-palette-drag-new-nested-location',async()=>{
   await fixture('2回くり返す。\n  何もしない。');await U.openDetails(root.locator('.blockui-palette-options'));await root.locator('[data-blockui-palette-mode]').selectOption('statement');await root.locator('.blockui-palette-options > summary').click();await (await reveal(root.locator('[data-blockui-search]'))).fill('Say');const candidate=root.locator('[data-blockui-schema="Say"]');
   const parentId=await nodes('RepeatCount').getAttribute('data-block-id'),drop=root.locator('[data-parent-id="'+parentId+'"][data-blockui-body="body"][data-insert-index="1"]');
   let old=await state(),h=await candidate.boundingBox(),d=await drop.boundingBox();await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(d.x+20,d.y+d.height/2,{steps:7});d=await drop.boundingBox();await page.mouse.move(d.x+20,d.y+d.height/2);assert.equal(await root.locator('.blockui-drop-preview').count(),1);assert.equal((await state()).source,old.source);await page.mouse.up();assert.equal((await state()).ast.body.length,1);assert.deepEqual((await state()).ast.body[0].body.map(n=>n.kind),['NoOperation','Say']);assert.equal((await state()).history,old.history+1);await page.waitForTimeout(400);
  });
  // The blocks offered to put back where a value was moved from are the ones the list offers there: no call of an
  // 答えを もとめる the work does not have.
  await test('UI-replacement-offers-available-blocks',async()=>{
   await fixture('（1＋2）を言う。\n3を言う。');const sum=nodes('BinaryExpression:ADD').first();await U.nodeAction(sum,'move');await U.slotAction(U.ownedSlots(nodes('Say').nth(1)).first());
   const offered=await (await reveal(root.locator('[data-blockui-replacement-schema]'))).evaluate(s=>[...s.options].map(o=>o.value));
   assert.ok(offered.includes('NumberLiteral')&&!offered.includes('UserFunctionCall')&&!offered.includes('UserActionCall'),offered.join());
   return {offered:offered.length};
  });
  // What goes back where a value was moved from is checked at that place, not where the value goes: the colour's place
  // is not offered an empty 「文字」, and a place that takes a number starts at a number the button can put there.
  await test('UI-replacement-checks-the-place-left',async()=>{
   const before=errors.length;await (await reveal(page.locator('#objectSelect'))).selectOption('sprite-1');await (await reveal(page.locator('#eventSelect'))).selectOption('start');await fixture('表示色を「赤」にする。\n3を言う。');await U.nodeAction(nodes('LooksCommand:SET_COLOR').first().locator('.blockui-node[data-schema-id="StringLiteral"]').first(),'move');await U.slotAction(U.ownedSlots(nodes('Say').first()).first());
   const select=await reveal(root.locator('[data-blockui-replacement-schema]')),colour=await select.evaluate(s=>({offered:[...s.options].map(o=>o.value),chosen:s.value}));
   assert.ok(!colour.offered.includes('StringLiteral')&&colour.offered.includes(colour.chosen),JSON.stringify(colour));await (await reveal(root.locator('[data-blockui-action="confirm-expression-move"]'))).click();
   const moved=await page.evaluate(()=>({source:Akari.app.editorState.main.sourceText,codes:(Akari.app.editorState.main.diagnostics||[]).map(d=>d.code)}));assert.match(moved.source,/「赤」と言う/);assert.deepEqual(moved.codes,[]);
   // (a value is not taken where the list would not put it: 3 is no partner to touch, and nothing is asked or changed)
   await fixture('もし「ボタン1」にふれているなら、\n  「やあ」と言う。\n3を言う。');const touch=(await state()).source;await U.nodeAction(nodes('Say').nth(1).locator('.blockui-node[data-schema-id="NumberLiteral"]').first(),'move');await U.slotAction(U.ownedSlots(root.locator('.blockui-node[data-schema-id^="SensorRead:TOUCHING"]').first()).first());
   assert.equal(await root.locator('[data-blockui-replacement-schema]').count(),0);assert.equal((await state()).source,touch);
   await fixture('「やあ」と言う。\n3を言う。');await U.nodeAction(nodes('Say').nth(1).locator('.blockui-node[data-schema-id="NumberLiteral"]').first(),'move');await U.slotAction(U.ownedSlots(nodes('Say').first()).first());
   const number=await (await reveal(root.locator('[data-blockui-replacement-schema]'))).evaluate(s=>s.value);assert.equal(number,'NumberLiteral');
   const confirm=root.locator('[data-blockui-action="confirm-expression-move"]');await (await reveal(confirm)).click();if(await confirm.count())await confirm.click();assert.equal(errors.length,before,errors.slice(before).join('\n'));
   return{colour:colour.chosen,number,source:moved.source};
  });
  // A block put in from the list of an 答えを もとめる body goes where the list said it can: before its 「返す」 (the list
  // counts the end of the body there), with the 「返す」 sentence selected as it is when the body opens.
  await test('UI-function-body-end-before-return',async()=>{
   await (await reveal(page.locator('#procBtn'))).click();await (await reveal(page.locator('#callableNewFunction'))).click();
   await (await reveal(page.locator('#callableName'))).fill('いち');await (await reveal(page.locator('#callableCode'))).fill('1を答えとして返す。');
   await chooseView(page,'blocks',{prefix:'callable',reveal});const croot=page.locator('#callableBlocks');await croot.locator('.blockui-node[data-schema-id="ReturnStatement"]').first().waitFor();
   const tools=croot.locator('[data-blockui-action="palette-tools-toggle"]');if((await tools.getAttribute('aria-expanded'))!=='true')await tools.click();
   await croot.locator('[data-blockui-search]').fill('何もしない');const item=croot.locator('.blockui-palette-item > button[data-blockui-schema="NoOperation"]').first();
   assert.notEqual(await item.getAttribute('aria-disabled'),'true');await item.click();
   await page.waitForFunction(()=>/何もしない/.test(Akari.app.editorState.draft.sourceText));const source=await page.evaluate(()=>Akari.app.editorState.draft.sourceText);
   assert.match(source,/何もしない。\n1を答えとして返す。/);return{source};
  });
  // ＋ and 外す on a list input stop at what the language counts: つなぐ takes two values at least, a made block's call as
  // many as its definition names.
  await test('UI-item-count-follows-the-language',async()=>{
   await (await reveal(page.locator('#objectSelect'))).selectOption('sprite-1');await (await reveal(page.locator('#eventSelect'))).selectOption('start');
   await fixture('（「あ」と「い」をつなげた文字）を言う。');const join=root.locator('.blockui-node[data-schema-id="BuiltinCall:つなぐ"]').first();await join.waitFor();
   const slot=U.ownedSlots(join).first();await U.openSlot(slot);const remove=slot.locator(':scope > .blockui-slot-head [data-blockui-action="variadic-remove"]');
   assert.ok(await remove.count()&&await remove.isDisabled(),'外す stops at two values');
   await (await reveal(page.locator('#procBtn'))).click();await (await reveal(page.locator('#callableNewAction'))).click();
   await (await reveal(page.locator('#callableName'))).fill('増やす');await (await reveal(page.locator('#callableArgs'))).fill('量');await (await reveal(page.locator('#callableCode'))).fill('量歩進む。');
   await (await reveal(page.locator('#callableSave'))).click();if(await page.locator('#procModal').isVisible())await (await reveal(page.locator('#procClose'))).click();
   await fixture('3をわたして、【増やす】というてじゅんを行う。');const call=nodes('UserActionCall').first();await U.clickNode(call);
   const add=call.locator('[data-blockui-action="variadic-add"]');assert.ok(await add.count()&&await add.first().isDisabled(),'＋ stops at the one value 増やす takes');
   return{joinRemove:'disabled',callAdd:'disabled'};
  });
  // In a てじゅん that takes 色, the colour sentence's face keeps 表示色, as its code does (色 there is the value taken).
  await test('UI-colour-face-with-a-taken-colour',async()=>{
   await (await reveal(page.locator('#procBtn'))).click();await (await reveal(page.locator('#callableNewAction'))).click();
   await (await reveal(page.locator('#callableName'))).fill('ぬる');await (await reveal(page.locator('#callableArgs'))).fill('色');await (await reveal(page.locator('#callableCode'))).fill('表示色を「赤」にする。');
   await chooseView(page,'blocks',{prefix:'callable',reveal});const face=page.locator('#callableBlocks .blockui-node[data-schema-id="LooksCommand:SET_COLOR"]').first();await face.waitFor();
   const text=await face.textContent();assert.match(text,/表示色を/);return{face:text.replace(/\s+/g,' ').trim().slice(0,40)};
  });
  // A letter key held with Shift (or CapsLock) is still that key; a digit key held with Shift gives its sign's key (「!」).
  await test('UI-key-with-shift-is-the-same-key',async()=>{
   const file=await page.evaluate(()=>{const p=Akari.makeEmptyProject();p.name='キーのしけん';p.scripts=[{id:'k',targetId:'sprite-1',event:'start',source:'「a」キーがおされるまで待つ。\n「エー」と言う。\n「!」キーがおされるまで待つ。\n「びっくり」と言う。'}];return Akari.serializeProject(p,Akari.makeDefaultAssetStore());});
   await page.locator('#fileInput').setInputFiles({name:'k.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});
   await page.waitForFunction(()=>document.querySelector('#loseConfirmModal.show')||Akari.app.project.name==='キーのしけん');await page.evaluate(()=>document.querySelector('#loseConfirmModal.show #loseConfirmProceed')?.click());
   await page.waitForFunction(()=>Akari.app.project.name==='キーのしけん');await page.evaluate(()=>Akari.app.startRun());await page.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');await page.locator('#formSurface').focus();
   const said=text=>page.waitForFunction(t=>[...document.querySelectorAll('.sprite-bubble-text')].some(n=>n.textContent===t),text);
   await page.keyboard.down('Shift');await page.keyboard.down('KeyA');await said('エー');await page.keyboard.up('KeyA');
   await page.keyboard.down('Digit1');await said('びっくり');await page.keyboard.up('Digit1');await page.keyboard.up('Shift');
   await page.evaluate(()=>Akari.app.stopRun());return{shiftA:'a',shift1:'!'};
  });
  // A key held while Shift goes down or up keeps the name its press gave it, and its release ends that press: a digit
  // key that repeats as its sign (「1」 as 「!」), or a sign that repeats as its digit, leaves no key held.
  await test('UI-key-renamed-while-held-is-released',async()=>{
   const body='ずっとくり返す。\n  もし「1」キーがおされていれば、\n    もし「!」キーがおされていれば、\n      「両方」と言う。\n    そうでなければ、\n      「数字」と言う。\n  そうでなければ、\n    もし「!」キーがおされていれば、\n      「記号」と言う。\n    そうでなければ、\n      「なし」と言う。';
   const file=await page.evaluate(source=>{const p=Akari.makeEmptyProject();p.name='キーのなまえのしけん';p.scripts=[{id:'k',targetId:'sprite-1',event:'start',source}];return Akari.serializeProject(p,Akari.makeDefaultAssetStore());},body);
   await page.locator('#fileInput').setInputFiles({name:'k.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});
   await page.waitForFunction(()=>document.querySelector('#loseConfirmModal.show')||Akari.app.project.name==='キーのなまえのしけん');await page.evaluate(()=>document.querySelector('#loseConfirmModal.show #loseConfirmProceed')?.click());
   await page.waitForFunction(()=>Akari.app.project.name==='キーのなまえのしけん');await page.evaluate(()=>Akari.app.startRun());await page.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');await page.locator('#formSurface').focus();
   const said=text=>page.waitForFunction(t=>{const all=[...document.querySelectorAll('.sprite-bubble-text')].map(n=>n.textContent);return all.length===1&&all[0]===t;},text,{timeout:5000});
   await said('なし');
   await page.keyboard.down('Digit1');await said('数字');await page.keyboard.down('Shift');await page.keyboard.down('Digit1');await page.keyboard.up('Digit1');await said('なし');await page.keyboard.up('Shift');
   await page.keyboard.down('Shift');await page.keyboard.down('Digit1');await said('記号');await page.keyboard.up('Shift');await page.keyboard.down('Digit1');await page.keyboard.up('Digit1');await said('なし');
   await page.keyboard.down('Digit1');await said('数字');await page.keyboard.up('Digit1');await said('なし');
   await page.evaluate(()=>Akari.app.stopRun());return{heldAsDigit:'1',heldAsSign:'!'};
  });
  // A new part does not take the screen's name: a part put on the screen, a copy of a part and a picture put in as a
  // part each take the next free name.
  await test('UI-new-part-is-not-named-as-the-screen',async()=>{
   const file=await page.evaluate(()=>{const p=Akari.makeEmptyProject();p.name='がめんのなまえのしけん';p.stage.name='ボタン1';return Akari.serializeProject(p,Akari.makeDefaultAssetStore());});
   await page.locator('#fileInput').setInputFiles({name:'s.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});
   await page.waitForFunction(()=>document.querySelector('#loseConfirmModal.show')||Akari.app.project.name==='がめんのなまえのしけん');await page.evaluate(()=>document.querySelector('#loseConfirmModal.show #loseConfirmProceed')?.click());
   await page.waitForFunction(()=>Akari.app.project.name==='がめんのなまえのしけん');
   const names=()=>page.evaluate(()=>[Akari.app.project.stage.name,...Akari.app.project.components.map(c=>c.name)]);
   await (await reveal(page.locator('.tool[data-type="button"]').first())).click();
   await page.waitForFunction(()=>Akari.app.project.components.length===2);
   assert.deepEqual(await names(),['ボタン1','たくどん','ボタン2']);
   await (await reveal(page.locator('#objectSelect'))).selectOption('stage');
   const field=await reveal(page.locator('#properties input[type="text"]').first());await field.fill('ボタン2_2');await field.press('Tab');
   await page.waitForFunction(()=>Akari.app.project.stage.name==='ボタン2_2');
   const button=await page.evaluate(()=>Akari.app.project.components[1].id);
   await (await reveal(page.locator('#objectSelect'))).selectOption(button);
   await (await reveal(page.locator('#properties .prop-duplicate'))).click();
   await page.waitForFunction(()=>Akari.app.project.components.length===3);
   const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=8;c.getContext('2d').fillRect(0,0,8,8);return c.toDataURL('image/png').split(',')[1];});
   await page.locator('#imageObjectInput').setInputFiles({name:'ボタン2_2.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
   await page.waitForFunction(()=>Akari.app.project.components.length===4);
   assert.deepEqual(await names(),['ボタン2_2','たくどん','ボタン2','ボタン2_3','ボタン2_2_2']);
   return{screen:'ボタン2_2',parts:['ボタン2','ボタン2_3','ボタン2_2_2']};
  });
  // A name with a space, ※ or 【 】 is not given to a part or the screen: the name field keeps the name and says why,
  // and a picture put in as a part has each of them as _ in its name.
  await test('UI-part-name-without-spaces',async()=>{
   const file=await page.evaluate(()=>{const p=Akari.makeEmptyProject();p.name='くうはくのなまえのしけん';return Akari.serializeProject(p,Akari.makeDefaultAssetStore());});
   await page.locator('#fileInput').setInputFiles({name:'n.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});
   await page.waitForFunction(()=>document.querySelector('#loseConfirmModal.show')||Akari.app.project.name==='くうはくのなまえのしけん');await page.evaluate(()=>document.querySelector('#loseConfirmModal.show #loseConfirmProceed')?.click());
   await page.waitForFunction(()=>Akari.app.project.name==='くうはくのなまえのしけん');
   const names=()=>page.evaluate(()=>[Akari.app.project.stage.name,...Akari.app.project.components.map(c=>c.name)]);
   const before=await names(),rename=async(id,name)=>{await (await reveal(page.locator('#objectSelect'))).selectOption(id);const field=await reveal(page.locator('#properties input[type="text"]').first());await field.fill(name);await field.press('Tab');
    await page.waitForFunction(old=>document.querySelector('#properties input[type="text"]')?.value===old,before[id==='stage'?0:1]);
    assert.match(await page.locator('#statusText').textContent(),/名前に 空白や ※ 【 】は 使えないよ/);};
   for(const name of ['my cat','くろ　ねこ','ねこ※1','【ねこ】'])await rename('sprite-1',name);
   await rename('stage','うみ の 画面');
   assert.deepEqual(await names(),before);
   const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=8;c.getContext('2d').fillRect(0,0,8,8);return c.toDataURL('image/png').split(',')[1];});
   await page.locator('#imageObjectInput').setInputFiles({name:'スクリーンショット 2026-11-10 123456 【1】※.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
   await page.waitForFunction(()=>Akari.app.project.components.length===2);
   assert.deepEqual(await names(),[...before,'スクリーンショット_2026-11-10_123456__1__']);
   return{refused:['my cat','くろ　ねこ','ねこ※1','【ねこ】','うみ の 画面'],picture:'スクリーンショット_2026-11-10_123456__1__'};
  });
  // A part pressed with the mouse while the work runs does not keep the keys: the 空白 key after it is the work's key,
  // not one more press of that part.
  await test('UI-pressed-part-leaves-the-keys',async()=>{
   const file=await page.evaluate(()=>{const p=Akari.makeEmptyProject();p.name='くうはくのしけん';const star=structuredClone(p.components[0]);Object.assign(star,{id:'star',name:'星',x:500,y:200});
    star.costumes=star.costumes.map(c=>({...c,id:'star-'+c.id}));star.costumeId='star-'+p.components[0].costumeId;p.components.push(star);p.projectData.variables=[{id:'v2',name:'クリック回数',initialValue:0}];
    p.scripts=[{id:'k',targetId:'sprite-1',event:'keyDown',filter:{key:'空白'},source:'「くうはく」と言う。'},{id:'c',targetId:'star',event:'click',source:'クリック回数を1ふやす。\nクリック回数を言う。'}];
    return Akari.serializeProject(p,Akari.makeDefaultAssetStore());});
   await page.locator('#fileInput').setInputFiles({name:'s.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});
   await page.waitForFunction(()=>document.querySelector('#loseConfirmModal.show')||Akari.app.project.name==='くうはくのしけん');await page.evaluate(()=>document.querySelector('#loseConfirmModal.show #loseConfirmProceed')?.click());
   await page.waitForFunction(()=>Akari.app.project.name==='くうはくのしけん');await page.evaluate(()=>Akari.app.startRun());await page.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');
   const said=()=>page.evaluate(()=>[...document.querySelectorAll('.sprite-bubble-text')].map(n=>n.textContent));
   await page.locator('.component[data-id="star"]').click();await page.waitForFunction(()=>[...document.querySelectorAll('.sprite-bubble-text')].some(n=>n.textContent==='1'));
   await page.keyboard.press(' ');await page.waitForFunction(()=>[...document.querySelectorAll('.sprite-bubble-text')].some(n=>n.textContent==='くうはく'));
   const texts=await said();assert.ok(texts.includes('1')&&!texts.includes('2'),texts.join());await page.evaluate(()=>Akari.app.stopRun());return{said:texts};
  });
  // A qualifier chosen while another field cannot be decided goes back to what it was: とくに なし, not an empty choice.
  await test('UI-qualifier-given-back-shows-none',async()=>{
   await (await reveal(page.locator('#objectSelect'))).selectOption('sprite-1');await (await reveal(page.locator('#eventSelect'))).selectOption('start');
   await fixture('点数を言う。\n点数を1にする。');await (await reveal(root.locator('input[data-blockui-field="name"]').last())).fill('あ。い');
   const q=nodes('VariableRead').first().locator('select[data-blockui-field="qualifier"]');await q.selectOption('self');
   const shown=await q.evaluate(s=>({value:s.value,index:s.selectedIndex}));assert.deepEqual(shown,{value:'none',index:shown.index});assert.ok(shown.index>=0);return shown;
  });
  // A colour picker opened and left as it was is no change to keep: leaving the page does not ask.
  await test('UI-unchanged-colour-asks-nothing-on-leaving',async()=>{
   const leave=()=>page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;});
   await (await reveal(page.locator('#objectSelect'))).selectOption('sprite-1');const before=await leave();
   await page.evaluate(()=>{for(const d of document.querySelectorAll('details'))if(d.querySelector('.prop-color'))d.open=true;document.querySelector('.prop-color[data-color-field="fg"] .color-more').click();});
   await page.locator('#colorModal.show').waitFor();const open=await leave();await page.locator('#colorCancel').click();
   assert.deepEqual([before,open],[false,false]);return{open};
  });
  // An input field pressed with the mouse while the work runs keeps the keys: what is typed goes into it.
  await test('UI-pressed-input-takes-the-keys',async()=>{
   const file=await page.evaluate(()=>{const p=Akari.makeDefaultProject();p.name='入力のしけん';
    p.components.push({id:'input-1',type:'input',name:'入力1',x:320,y:80,w:200,h:36,fg:'#111111',bg:'#ffffff',fontSize:16,visible:true,direction:0,scalePercent:100,text:'',localData:{variables:[],lists:[]}});
    p.scripts=[{id:'script-a',targetId:'input-1',event:'valueChanged',source:'「かわった」と言う。'}];return Akari.serializeProject(p,Akari.makeDefaultAssetStore());});
   await page.locator('#fileInput').setInputFiles({name:'i.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});
   await page.waitForFunction(()=>document.querySelector('#loseConfirmModal.show')||Akari.app.project.name==='入力のしけん');await page.evaluate(()=>document.querySelector('#loseConfirmModal.show #loseConfirmProceed')?.click());
   await page.waitForFunction(()=>Akari.app.project.name==='入力のしけん');await page.evaluate(()=>Akari.app.startRun());await page.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');
   const field=page.locator('#formSurface input.component');await field.click();await page.keyboard.type('abc');
   const value=await field.inputValue();
   await page.evaluate(()=>Akari.app.stopRun());assert.equal(value,'abc');return{value};
  });
  // An enclosure put in from the list of an 答えを もとめる body does not take its 「返す」 in: 返す stays the last sentence.
  await test('UI-function-body-wrap-leaves-return',async()=>{
   await (await reveal(page.locator('#procBtn'))).click();await (await reveal(page.locator('#callableNewFunction'))).click();
   await (await reveal(page.locator('#callableName'))).fill('に');await (await reveal(page.locator('#callableCode'))).fill('1を答えとして返す。');
   await chooseView(page,'blocks',{prefix:'callable',reveal});const croot=page.locator('#callableBlocks');await croot.locator('.blockui-node[data-schema-id="ReturnStatement"]').first().waitFor();
   const tools=croot.locator('[data-blockui-action="palette-tools-toggle"]');if((await tools.getAttribute('aria-expanded'))!=='true')await tools.click();
   await croot.locator('[data-blockui-search]').fill('くり返す');await croot.locator('.blockui-palette-item > button[data-blockui-schema="RepeatCount"]').first().click();
   await page.waitForFunction(()=>/くり返す/.test(Akari.app.editorState.draft.blockDraft?.source||Akari.app.editorState.draft.sourceText));
   const source=await page.evaluate(()=>Akari.app.editorState.draft.blockDraft?.source||Akari.app.editorState.draft.sourceText);
   assert.ok(/\n1を答えとして返す。$/.test(source)&&!/\n {2}1を答えとして返す/.test(source),source);return{source};
  });
  // The block of 答えを〜という変数に入れる (a name the work has not yet) reads as its code does.
  await test('UI-answer-into-new-variable-face',async()=>{
   await (await reveal(page.locator('#objectSelect'))).selectOption('sprite-1');await (await reveal(page.locator('#eventSelect'))).selectOption('start');
   await fixture('答えをひみつという変数に入れる。');const face=(await nodes('Assignment').first().textContent()).replace(/\s+/g,'');
   assert.match(face,/という変数に入れる/);return{face};
  });
  // The block put back where a value was moved from is made as the list makes it, with the work's defaults: the 中身 of
  // an input field names an input field the work has.
  await test('UI-replacement-made-with-defaults',async()=>{
   const file=await page.evaluate(()=>{const p=Akari.makeDefaultProject();p.name='もとのばしょのしけん';
    p.components.push({id:'input-1',type:'input',name:'なまえらん',x:200,y:100,w:160,h:32,fg:'#111111',bg:'#ffffff',fontSize:14,visible:true,direction:0,scalePercent:100,text:'',localData:{variables:[],lists:[]}});
    p.scripts=[{id:'s1',targetId:'sprite-1',event:'start',source:'「やあ」と言う。\n「こんにちは」と言う。'}];return Akari.serializeProject(p,Akari.makeDefaultAssetStore());});
   await page.locator('#fileInput').setInputFiles({name:'r.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});
   await page.waitForFunction(()=>document.querySelector('#loseConfirmModal.show')||Akari.app.project.name==='もとのばしょのしけん');await page.evaluate(()=>document.querySelector('#loseConfirmModal.show #loseConfirmProceed')?.click());
   await page.waitForFunction(()=>Akari.app.project.name==='もとのばしょのしけん');
   await (await reveal(page.locator('#objectSelect'))).selectOption('sprite-1');await (await reveal(page.locator('#eventSelect'))).selectOption('start');await chooseView(page,'blocks',{reveal:reveal,open:openBodyForTest});
   await U.nodeAction(nodes('Say').first().locator('.blockui-node').first(),'move');await U.slotAction(U.ownedSlots(nodes('Say').nth(1)).first());
   await (await reveal(root.locator('[data-blockui-replacement-schema]'))).selectOption('SensorRead:INPUT_VALUE');await (await reveal(root.locator('[data-blockui-action="confirm-expression-move"]'))).click();
   const source=(await state()).source;assert.match(source.split('\n')[0],/なまえらん/);return{first:source.split('\n')[0]};
  });
  await test('UI-expression-move-atomic-replacement',async()=>{
   await fixture('［1、2］を言う');const first=nodes('ListLiteral').locator('.blockui-node[data-schema-id="NumberLiteral"]').first();await U.nodeAction(first,'move');await U.slotAction(U.ownedSlots(nodes('ListLiteral')).nth(1));assert.equal((await state()).ast.body[0].value.items[0].value,1);
   await (await reveal(root.locator('[data-blockui-replacement-schema]'))).selectOption('NumberLiteral');await (await reveal(root.locator('[data-blockui-action="confirm-expression-move"]'))).click();assert.deepEqual((await state()).ast.body[0].value.items.map(x=>x.value),[0,1]);
  });
  // A choice of the block to put back (a value moved out of its place) is not kept in a saved file: it cannot be put back
  // into its controls, and a file that kept it opened with every block edit refused (E901) for an input nowhere.
  await test('UI-replacement-choice-not-kept',async()=>{
   await fixture('［1、2］を言う');const first=nodes('ListLiteral').locator('.blockui-node[data-schema-id="NumberLiteral"]').first();await U.nodeAction(first,'move');await U.slotAction(U.ownedSlots(nodes('ListLiteral')).nth(1));
   await root.locator('[data-blockui-replacement-schema]').waitFor();
   const download=page.waitForEvent('download');await (await reveal(page.locator('#saveBtn'))).click();
   if(await page.locator('#saveConfirmModal.show').isVisible())await page.locator('#saveConfirmYes').click();
   const text=fs.readFileSync(await (await download).path(),'utf8');
   const kept=await page.evaluate(async text=>(await Akari.parseProjectFile(text)).editorState.pendingEditors.map(e=>e.pending),text);
   assert.ok(kept.every(p=>p.kind!==undefined||p.field!==undefined),JSON.stringify(kept));
   // A file an earlier release saved with such a choice opens with nothing being put in.
   const older=await page.evaluate(async text=>{const file=await Akari.parseProjectFile(text),state=file.editorState,owner='script:'+(state.selectedScriptId||state.selectedId+':'+state.currentEvent);
    state.pendingEditors=[{kind:'script',ownerKey:owner,source:Akari.app.editorState.main.sourceText,mode:'blocks',pending:{reason:'もとの ばしょに 入れる ブロックを えらんでね'},draftTree:null}];
    return Akari.serializeProject(file.project,file.assetStore,state);},text);
   await page.locator('#fileInput').setInputFiles({name:'older-choice.akari.md',mimeType:'text/markdown',buffer:Buffer.from(older)});
   if(await page.locator('#loseConfirmModal.show').isVisible({timeout:1000}).catch(()=>false))await page.locator('#loseConfirmProceed').click();
   await page.waitForFunction(()=>Akari.app.editorState.state==='DESIGN'&&!document.querySelector('#fileInput').value);
   assert.equal(await page.evaluate(()=>Akari.app.editorState.main?.pendingEdit??null),null);
   return {kept};
  });
  await test('UI-deep-expression-move-prompt-reachable',async()=>{
   await page.setViewportSize({width:1440,height:900});await fixture('（1＋2）＋（3＋4）を言う。\n0＋0を言う。');const source=nodes('Say').first().locator('.blockui-node[data-schema-id="BinaryExpression:ADD"]').first(),destination=nodes('Say').nth(1).locator('.blockui-node[data-schema-id="BinaryExpression:ADD"]').first();
   await U.nodeAction(source,'duplicate');await U.slotAction(U.ownedSlots(destination).first());
   const moved=U.ownedSlots(destination).first().locator(':scope > .blockui-node');await U.nodeAction(moved,'move');await U.slotAction(U.ownedSlots(destination).nth(1));await (await reveal(root.locator('[data-blockui-action="confirm-expression-move"]'))).click();const ast=(await state()).ast;assert.equal(ast.body[1].value.left.value,0);assert.equal(ast.body[1].value.right.kind,'BinaryExpression');await page.setViewportSize({width:1440,height:1800});
  });
  await test('UI-else-branch-focus-nested-comments',async()=>{
   const source='もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n  もし 条件（条件の答え（あてはまらない））が成り立つなら、次のことをする。\n    何もしない。\n  そうでなければ、次のことをする。 ※ 内側\n    ※ 本文コメント\n    何もしない。\n※ 外側枝の前\nそうでなければ、次のことをする。 ※ 外側\n  何もしない。';
   await fixture(source);for(const line of [4,8]){await chooseView(page,'code',{reveal:reveal,open:openBodyForTest});const offset=source.split('\n').slice(0,line-1).join('\n').length+1;await page.locator('#codeEditor').evaluate((e,at)=>{e.setSelectionRange(at,at);e.focus();},offset);await chooseView(page,'blocks',{reveal:reveal,open:openBodyForTest});const active=await page.evaluate(()=>({body:document.activeElement.dataset.blockuiBodyWrapper,line:document.activeElement.dataset.sourceLine}));assert.equal(active.body,'elseBody');assert.equal(Number(active.line),line);assert.equal((await state()).source,source);}
   assert.equal(await root.locator('[data-blockui-body-wrapper="elseBody"][data-source-line]').count(),2);
  });
  // The body of 「もし」 chosen in the blocks is at the block's line in the code (its そうでなければ at its own line).
  await test('UI-then-branch-focus-to-code',async()=>{
   const source='点数を1にする。\n点数を2にする。\nもし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n  何もしない。\nそうでなければ、次のことをする。\n  何もしない。';
   const lines={};for(const body of ['thenBody','elseBody']){await fixture(source);await page.locator('#codeEditor').evaluate(t=>t.setSelectionRange(0,0));
     await nodes('IfStatement').first().locator('[data-blockui-body-wrapper="'+body+'"]').first().evaluate(n=>n.focus());await chooseView(page,'code',{reveal:reveal,open:openBodyForTest});
     lines[body]=source.slice(0,await page.locator('#codeEditor').evaluate(t=>t.selectionStart)).split('\n').length;}
   assert.deepEqual(lines,{thenBody:3,elseBody:5});
  });
  // 「だれが」 → 「名前で えらぶ」 waits for the name: choosing it alone changes nothing and tells no mistake (the edit
  // waits as any field being written does); the name written and left is taken in.
  // 「書ける ことば」 of a text part (a button here) reads 「「やあ」と書く」 as writing its own text, as 「ブロックを さがす」
  // and the near forms of its body do: the part's kind goes with the words.
  await test('UI-hint-search-knows-the-part',async()=>{
   await (await reveal(page.locator('#objectSelect'))).selectOption('button-1');await chooseView(page,'code',{reveal:reveal,open:openBodyForTest});
   const unavailable=await reveal(page.locator('#hintUnavailable'));if(!await unavailable.isChecked())await unavailable.check();
   await (await reveal(page.locator('#hintSearch'))).fill('「やあ」と書く');
   await page.waitForFunction(()=>document.querySelector('#hintCount')?.textContent.includes('('),null,{timeout:5000}).catch(async()=>{throw new Error('no hints: '+await page.evaluate(()=>[document.querySelector('#hintCount')?.textContent,document.querySelector('#codeHints')?.innerHTML.length,Akari.app.editorState.main?.mode].join(' | ')));});
   const shown=(await page.locator('#codeHints').textContent()).replace(/\s+/g,'');
   assert.ok(/かえる/.test(shown)&&!/と言う/.test(shown),(await page.locator('#hintCount').textContent())+' '+shown.slice(0,200));
   return {shown:shown.slice(0,80)};
  });
  // A block that holds sentences (くり返す, もし …) writes its subject with は (マスコットは、3回くり返す。): it offers no
  // choice of は or が, which the code could not keep. A sentence still offers it.
  await test('UI-enclosing-block-has-no-particle',async()=>{
   await (await reveal(page.locator('#objectSelect'))).selectOption('sprite-1');await (await reveal(page.locator('#eventSelect'))).selectOption('start');
   await fixture('3回くり返す。\n  10歩進む。');const offered=async block=>{await U.openNodeMenu(block);const who=block.locator('details.blockui-who').first();
    if(!await who.evaluate(d=>d.open))await (await reveal(who.locator(':scope > summary'))).click();await (await reveal(who.locator('[data-blockui-structured-role="actorRef.kind"]'))).selectOption('named');
    return who.locator('[data-blockui-structured-role="actorRef.particle"]').count();};
   const repeat=await offered(root.locator('.blockui-node[data-schema-id="RepeatCount"]').first());
   assert.equal(repeat,0,'a block that holds sentences offers no は／が');
   return {repeat};
  });
  await test('UI-who-named-waits-for-name',async()=>{
   await (await reveal(page.locator('#objectSelect'))).selectOption('sprite-1');await (await reveal(page.locator('#eventSelect'))).selectOption('start');
   await fixture('10歩進む。');const move=root.locator('.blockui-node[data-schema-id^="MotionCommand"]').first();await U.openNodeMenu(move);
   const who=move.locator('details.blockui-who').first();if(!await who.evaluate(d=>d.open))await (await reveal(who.locator(':scope > summary'))).click();
   const kind=who.locator('[data-blockui-structured-role="actorRef.kind"]'),name=who.locator('[data-blockui-structured-role="actorRef.name"]');
   await (await reveal(kind)).selectOption('named');
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const chosen=await state(),told=(await page.locator('#editorPending').textContent()).trim();
   assert.deepEqual({source:chosen.source,waiting:chosen.pending?.reason??null,told},{source:'10歩進む。',waiting:'入れたら「決める」を おしてね',told:''});
   await (await reveal(name)).fill('ボタン1');await name.evaluate(input=>input.blur());
   await page.waitForFunction(()=>Akari.app.editorState.main.sourceText!=='10歩進む。',null,{timeout:5000}).catch(()=>{});
   const named=await state();assert.match(named.source,/ボタン1/);assert.equal(named.pending?.reason??null,null);
   return {chosen:chosen.source,named:named.source};
  });
  // An assignment's block reads in the order its code does: a value read from the answer or a state is put into the
  // variable (答えを 点数に 入れる, 「マスコット」の よこのばしょを 点数に 入れる); any other value is the variable's
  // new value (点数を 1に する).
  await test('UI-assignment-face-as-code',async()=>{
   const faces={};
   for(const source of ['答えを点数に入れる。','「マスコット」のよこのばしょを点数に入れる。','点数を1にする。']){
    await fixture(source);
    faces[source]=await nodes('Assignment').first().locator('.blockui-node-main').first().evaluate(head=>{
     const read=el=>[...el.childNodes].map(n=>n.nodeType===3?n.textContent:n.nodeType!==1||n.closest('.blockui-tools,.blockui-actions,.blockui-who,button,details,datalist')?'':
      n.tagName==='INPUT'||n.tagName==='TEXTAREA'?n.value:n.tagName==='SELECT'?n.selectedOptions[0]?.textContent||'':read(n)).join('');
     return read(head).replace(/\s+/g,'');
    });
   }
   // (the face also holds the fields' labels: what is compared is which comes first and how the sentence ends)
   const order=(face,value)=>({first:face.indexOf(value)<face.indexOf('点数')?'value':'variable',ending:/に入れる$/.test(face)?'に入れる':/にする$/.test(face)?'にする':face.slice(-6)});
   assert.deepEqual({answer:order(faces['答えを点数に入れる。'],'答え'),state:order(faces['「マスコット」のよこのばしょを点数に入れる。'],'マスコット'),number:order(faces['点数を1にする。'],'1')},
    {answer:{first:'value',ending:'に入れる'},state:{first:'value',ending:'に入れる'},number:{first:'variable',ending:'にする'}});
  });
  // The character's colour block reads as its code: 色を〔赤〕にする, but 表示色を〔赤〕にする when the body makes its
  // own 色 (この中だけ), as the code is written then (色を… would change that variable).
  await test('UI-colour-face-with-local-name',async()=>{
   const faces={};
   for(const source of ['表示色を「赤」にする。','この中だけで使う変数【色】を作り、最初は0にする。\n表示色を「赤」にする。']){
    await fixture(source);
    faces[source]=(await nodes('LooksCommand:SET_COLOR').first().locator('.blockui-node-main').first().innerText()).replace(/\s+/g,'');
   }
   const word=face=>/^表示色を/.test(face)?'表示色':/^色を/.test(face)?'色':face;
   assert.deepEqual(Object.values(faces).map(word),['色','表示色']);
   return faces;
  });
  // A value changed to 「文字」 while a group of controls in it is being typed (だれの, its name refused) takes no text
  // from the group: what a group reads is no text, and the 文字 starts empty.
  await test('UI-value-to-text-beside-group',async()=>{
   await fixture('マスコットの自分のHPを言う。');const read=nodes('ActorQualifiedRead').first(),name=read.locator('[data-blockui-structured-role="actorRef.name"]');await U.clickNode(read);
   await (await reveal(name)).fill('');const types=root.locator('[data-blockui-value-type][aria-label="言うことの中身の しゅるい"]');
   await (await reveal(types)).focus();await types.selectOption('StringLiteral');
   await page.waitForFunction(()=>Akari.app.editorState.main.sourceText!=='マスコットの自分のHPを言う。',null,{timeout:5000}).catch(()=>{});
   const now=await state(),shown=await page.evaluate(()=>document.body.innerText);
   assert.equal(now.source,'「」を言う。',JSON.stringify({source:now.source,broken:/こわれて/.test(shown)}));assert.ok(!/こわれて/.test(shown),'the work is said to be broken');
  });
  // 「コードを整える」 keeps the meaning of the body: what it writes reads as the same program, or the body stays as written.
  await test('UI-format-keeps-meaning',async()=>{
   const after=[];await chooseView(page,'code',{reveal:reveal,open:openBodyForTest});
   for(const source of ['点数を（10÷3のあまり）＋（リストの1番目）にする。','リストの（1からリストの数のどれか）番目を消す。','（答え）の合図を送る。']){
    await (async()=>{const control=await reveal(page.locator('#codeEditor'));await openBodyForTest(control.page());return control.fill(source);})();
    await (async()=>{const control=await reveal(page.locator('#formatBtn'));await openBodyForTest(control.page());return control.click();})();
    const written=await page.locator('#codeEditor').inputValue(),same=await page.evaluate(([a,b])=>{const x=Akari.parseSyntax(a).ast,y=Akari.parseSyntax(b).ast;return !!x&&!!y&&Akari.astEquivalent(x,y);},[source,written]);
    assert.ok(same,'整える changed the meaning: '+source+' → '+written);after.push(written);
   }
   return {after};
  });
  // A number said turned into words to say (「文字を話す」) keeps the number as its words, 0 as well; a text box holds
  // text only.
  await test('UI-say-number-as-words',async()=>{
   const said=[];
   for(const source of ['5を言う。','0を言う。','5を2秒話す。']){
    await fixture(source);const data=root.locator('.blockui-speech-data').first();
    await (await reveal(data)).focus();await data.selectOption('literal');
    await page.waitForFunction(was=>Akari.app.editorState.main.sourceText!==was,source,{timeout:5000}).catch(()=>{});
    const now=await state(),shown=await page.evaluate(()=>document.body.innerText);
    assert.ok(!/こわれて/.test(shown),'the work is said to be broken: '+source);said.push(now.source);
   }
   assert.deepEqual(said,['「5」と言う。','「0」と言う。','「5」と2秒話す。']);
  });
  // The block view gives the hints the work's signal names themselves, not the call that gives them: a speech's choice
  // of data, the palette's search for a value's place, and the list chosen again for a list written as text (『買うもの』).
  // A copy of the product records what each call of the hints is given (the product is not changed).
  {const probe=prefix+'.hint-probe.html',text=fs.readFileSync(html,'utf8'),head='  function hintCandidates(project, targetId, options = {}) {';
   assert.equal(text.split(head).length,2,'one maker of the hints');
   fs.writeFileSync(probe,text.replace(head,head+" (globalThis.__hintSignalKinds ??= []).push((String(new Error().stack).split('\\n')[2]||'').trim().split(' ')[1]+':'+typeof options.signalNames);"));
   await test('UI-hints-take-signal-names',async()=>{
    await fixture('「やあ」と言う。');const before=await page.evaluate(()=>(globalThis.__hintSignalKinds||[]).length);
    await U.slotAction(U.ownedSlots(nodes('Say').first()).first(),'slot-select');await (await reveal(root.locator('[data-blockui-search]'))).fill('あ');
    await page.waitForFunction(n=>(globalThis.__hintSignalKinds||[]).length>n,before);
    await fixture('『買うもの』の1番目を言う。');await root.locator('.blockui-list-repair').first().waitFor({state:'attached'});
    const kinds=await page.evaluate(()=>globalThis.__hintSignalKinds);
    const sites=new Set(kinds.map(k=>k.split(':')[0]));assert.ok(['renderPalette','renderNode','renderSlot'].some(s=>sites.has(s))&&kinds.length>=3,'the speech, the search and the list ask for hints: '+JSON.stringify(kinds));
    const given=kinds.filter(k=>k.endsWith(':function'));assert.deepEqual(given,[],'a call given the call of the names: '+JSON.stringify([...new Set(given)]));
   },pathToFileURL(probe).href);}
  await test('UI-else-selection-follows-formatting',async()=>{
   const source='もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n\n  何もしない。\nそうでなければ、次のことをする。\n  何もしない。';await fixture(source);await U.openAnnotations(nodes('IfStatement').first());await chooseView(page,'code',{reveal:reveal,open:openBodyForTest});const offset=source.indexOf('そうでなければ');await page.locator('#codeEditor').evaluate((e,at)=>{e.setSelectionRange(at,at);e.focus();},offset);await chooseView(page,'blocks',{reveal:reveal,open:openBodyForTest});assert.equal(await page.evaluate(()=>Akari.app.editorState.main.blockSelectionLocation.line),4);
   const annotation=root.locator('[data-blockui-annotation="elseComment"]');await annotation.fill('※ 位置確認');await annotation.press('Enter');const updated=await state(),line=updated.source.split('\n').findIndex(x=>x.startsWith('そうでなければ'))+1;assert.equal(line,3,JSON.stringify(updated));assert.equal(await page.evaluate(()=>Akari.app.editorState.main.blockSelectionLocation.line),line);await chooseView(page,'code',{reveal:reveal,open:openBodyForTest});assert.equal(await page.locator('#codeEditor').evaluate(e=>e.value.slice(0,e.selectionStart).split('\n').length),line);await chooseView(page,'blocks',{reveal:reveal,open:openBodyForTest});
  });
  // A finger or a pen carries a block once it moves sideways more than 12 px (E-09); a shorter move is a press.
  for(const pointerType of ['touch','pen'])await test('UI-'+pointerType+'-pointer-drag',async()=>{
   await fixture('1を言う。\n2を言う。\n3を言う。');for(let i=0;i<3;i++){await U.nodeAction(nodes('Say').nth(i),'collapse');await U.nodeAction(nodes('Say').nth(i),'collapse');}await page.evaluate(()=>{window.__pointerEvidence=[];document.querySelector('#blockEditor').addEventListener('pointerdown',e=>__pointerEvidence.push({type:e.pointerType,trusted:e.isTrusted}),{once:true});});
   const old=await state(),handle=nodes('Say').first().locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-phrase-text').last(),drop=root.locator('.blockui-script > .blockui-node-content > .blockui-body > [data-insert-index="3"]'),h=await handle.boundingBox(),d=await drop.boundingBox(),start={x:h.x+h.width/2,y:h.y+h.height/2},end={x:d.x+20,y:d.y+d.height/2},cdp=await page.context().newCDPSession(page);
   let previews=0;try{
    if(pointerType==='touch'){await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x-20,y:start.y,id:1}]});}
    else{await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',buttons:1,clickCount:1,pointerType:'pen'});await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x-20,y:start.y,buttons:1,pointerType:'pen'});}
    await root.locator('.blockui-dragging').waitFor();for(let attempt=0;attempt<5;attempt++){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const current=await drop.boundingBox();end.x=current.x+20;end.y=current.y+10;if(pointerType==='touch')await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:1}]});else await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...end,buttons:1,pointerType:'pen'});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));previews=await root.locator('.blockui-drop-preview').count();if(previews===1)break;}assert.equal((await state()).source,old.source);
   }finally{if(pointerType==='touch'){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});}else await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button:'left',buttons:0,clickCount:1,pointerType:'pen'});await cdp.detach();}
   assert.equal(previews,1,JSON.stringify({h,d,end,pointers:await page.evaluate(()=>__pointerEvidence)}));assert.deepEqual((await state()).ast.body.map(n=>n.value.value),[2,3,1]);const movedSource=(await state()).source;await page.keyboard.press('Control+z');assert.equal((await state()).source,old.source);await page.keyboard.press('Control+y');assert.equal((await state()).source,movedSource);assert.deepEqual(await page.evaluate(()=>__pointerEvidence),[{type:pointerType,trusted:true}]);await page.waitForTimeout(400);
   // A finger that goes up from a number, a choice, a 「…」 or a text of a placed block moves the workspace and changes
   // nothing (E-09).
   if(pointerType==='touch'){
    await page.setViewportSize({width:1366,height:768});await fixture(Array.from({length:16},(_,i)=>i%2?'前へ'+(i+1)+'歩進む。':'「やあ'+i+'」と言う。').join('\n'));
    const before=await state(),space=root.locator('.blockui-workspace'),move=nodes('MotionCommand:MOVE').nth(1).locator(':scope > .blockui-node-content > .blockui-node-main'),touch=await page.context().newCDPSession(page);
    await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    try{for(const control of [move.locator('input').first(),move.locator('select').first(),move.locator('.blockui-extra > summary').first(),nodes('Say').nth(2).locator('.blockui-field[data-field-type="string"] input').first()]){
     await space.evaluate(w=>w.scrollTo(0,0));await control.evaluate(e=>e.scrollIntoView({block:'center'}));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const b=await control.boundingBox(),at={x:b.x+b.width/2,y:b.y+b.height/2},top0=await space.evaluate(w=>w.scrollTop);
     await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...at,id:1}]});for(let i=1;i<=8;i++){await page.waitForTimeout(20);await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:at.x+1,y:at.y-i*18,id:1}]});}await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     const top=await space.evaluate(w=>w.scrollTop)-top0;assert(top>100,'a swipe from '+await control.evaluate(e=>e.tagName)+' moved the workspace '+top+' px');assert.equal((await state()).source,before.source);await page.waitForTimeout(400);
    }}finally{await touch.send('Emulation.setTouchEmulationEnabled',{enabled:false});await touch.detach();}
   }
  });
  await test('UI-outside-drop-preserves-state',async()=>{
   await fixture('1を言う。\n2を言う。');const old=await state(),h=await nodes('Say').first().locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-phrase-text').last().boundingBox();await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(10,10,{steps:7});await page.mouse.up();const now=await state();for(const key of ['source','history','redo'])assert.equal(now[key],old[key]);assert.equal(now.pending,null);assert.equal(await root.locator('.blockui-drop-preview,.blockui-drop-invalid').count(),0);await page.waitForTimeout(400);
  });
  // B-02/B-03 (LANGUAGE.md いまのばしょから動く): the one direction is chosen from 右・左・上・下, the other leg is added and
  // either leg taken off, and a time is added and taken off. Each edit writes the sentence in its written form (horizontal leg
  // first, the new leg 10歩, the time 1秒) and is one undo step that gives the sentence back (R1-B-01: 左 and 下 were refused).
  await test('UI-move-by-directions-legs-time-undo',async()=>{
   await (await reveal(page.locator('#objectSelect'))).selectOption('sprite-1');await (await reveal(page.locator('#eventSelect'))).selectOption('start');
   const word={right:'右',left:'左',up:'上',down:'下'},axis=d=>['right','left'].includes(d)?'x':'y',leg=(d,n=10)=>word[d]+'へ'+n+'歩';
   const sentence=(x,y)=>'いまのばしょから、'+[x,y].filter(Boolean).join('、')+'動く。';
   const block=()=>nodes('MotionCommand:MOVE_BY').first(),extra=action=>block().locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-extra [data-blockui-action="'+action+'"]');
   const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const source=async()=>(await state()).source.trim();
   const step=async(what,act,want)=>{const before=await state();await act();await settle();const after=await state();
    assert.equal(after.source.trim(),want,what);assert.equal(after.pending,null,what+' leaves no pending edit');assert.equal(after.history,before.history+1,what+' is one undo step');return before;};
   const undo=async(before,what)=>{await page.locator('#undoBtn').click();await settle();const now=await state();assert.equal(now.source,before.source,'one undo gives back the sentence before '+what);assert.equal(now.history,before.history);};
   const chosen=()=>block().locator('[data-blockui-action="motion-direction"]');
   const select=async()=>{if(!await block().evaluate(e=>e.classList.contains('blockui-selected')))await U.clickNode(block());};
   const changes=[],legs=[],times=[];
   // All 12 changes of the one direction.
   for(const from of Object.keys(word))for(const to of Object.keys(word)){if(from===to)continue;
    await fixture(sentence(leg(from)));const what=word[from]+'→'+word[to];
    const before=await step(what,()=>chosen().selectOption(to),sentence(axis(to)==='x'?leg(to):null,axis(to)==='y'?leg(to):null));
    assert.equal(await chosen().inputValue(),to,what+' shows the new direction');await undo(before,what);assert.equal(await chosen().inputValue(),from,what+' undone shows the old direction');changes.push(what);}
   // The other leg added in each of its two directions, then either leg taken off.
   for(const start of Object.keys(word))for(const added of axis(start)==='x'?['up','down']:['right','left'])for(const off of ['start','added']){
    await fixture(sentence(leg(start)));const a=axis(start),b=a==='x'?'y':'x',what=word[start]+' + '+word[added]+' − '+off;
    const two=(sx,sy)=>sentence(sx,sy),x=d=>axis(d)==='x'?leg(d):null,y=d=>axis(d)==='y'?leg(d):null,plain=b==='x'?'right':'up';
    await select();const s0=await step(what+' add',async()=>(await reveal(extra('motion-leg-add-'+b))).click(),two(x(start)??x(plain),y(start)??y(plain)));
    let s1=null;if(added!==plain){const field=root.locator('[data-blockui-field="'+(b==='x'?'xDir':'yDir')+'"][data-block-id="'+await block().getAttribute('data-block-id')+'"]');
     s1=await step(what+' direction',()=>field.selectOption(added),two(x(start)??x(added),y(start)??y(added)));}
    await select();const kept=off==='start'?added:start;
    const s2=await step(what+' off',async()=>(await reveal(extra('motion-leg-remove-'+(off==='start'?a:b)))).click(),sentence(x(kept),y(kept)));
    await undo(s2,what+' off');if(s1)await undo(s1,what+' direction');await undo(s0,what+' add');assert.equal(await source(),sentence(leg(start)));legs.push(what);}
   // A time added and taken off, for each direction.
   for(const d of Object.keys(word)){await fixture(sentence(leg(d)));await select();
    const t0=await step(word[d]+' timed',async()=>(await reveal(extra('motion-timed'))).click(),'1秒かけて、'+sentence(axis(d)==='x'?leg(d):null,axis(d)==='y'?leg(d):null));
    await select();const t1=await step(word[d]+' untimed',async()=>(await reveal(extra('motion-untimed'))).click(),sentence(axis(d)==='x'?leg(d):null,axis(d)==='y'?leg(d):null));
    await undo(t1,word[d]+' untimed');await undo(t0,word[d]+' timed');times.push(word[d]);}
   assert.equal(changes.length,12);assert.equal(legs.length,16);assert.equal(times.length,4);
  });
  // 向きを決める (LANGUAGE.md いまのばしょから動く): 0・90・180・270度 read 画面の右・上・左・下を向く with the side to choose. A
  // choice writes that side, and なおす's 数で 決める writes 向きを45度にする, read with its number; each is one undo step.
  await test('UI-set-direction-sides-degrees-undo',async()=>{
   await (await reveal(page.locator('#objectSelect'))).selectOption('sprite-1');await (await reveal(page.locator('#eventSelect'))).selectOption('start');
   const word={0:'右',90:'上',180:'左',270:'下'},block=()=>nodes('MotionCommand:SET_DIRECTION').first(),side=()=>block().locator('[data-blockui-action="motion-side"]');
   const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const step=async(what,act,want)=>{const before=await state();await act();await settle();const after=await state();
    assert.equal(after.source.trim(),want,what);assert.equal(after.pending,null,what+' leaves no pending edit');assert.equal(after.history,before.history+1,what+' is one undo step');return before;};
   const undo=async(before,what)=>{await page.locator('#undoBtn').click();await settle();assert.equal((await state()).source,before.source,'one undo gives back the sentence before '+what);};
   const changes=[];
   for(const from of Object.keys(word))for(const to of Object.keys(word)){if(from===to)continue;
    const what=word[from]+'→'+word[to];await fixture('画面の'+word[from]+'を向く。');assert.equal(await side().inputValue(),from,what);
    const before=await step(what,()=>side().selectOption(to),'画面の'+word[to]+'を向く。');assert.equal(await side().inputValue(),to,what+' shows the new side');
    await undo(before,what);assert.equal(await side().inputValue(),from,what+' undone shows the old side');changes.push(what);}
   for(const from of Object.keys(word)){const what=word[from]+' 数で 決める';await fixture('画面の'+word[from]+'を向く。');
    if(!await block().evaluate(e=>e.classList.contains('blockui-selected')))await U.clickNode(block());
    const before=await step(what,async()=>(await reveal(block().locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-extra [data-blockui-action="motion-side-degrees"]'))).click(),'向きを45度にする。');
    assert.equal(await side().count(),0,what+' has no side to choose');assert.equal(await block().locator(':is(.blockui-node[data-schema-id="NumberLiteral"], .blockui-flat-value) input[data-blockui-field="value"]').first().inputValue(),'45');
    await undo(before,what);assert.equal(await side().inputValue(),from,what+' undone');changes.push(what);}
   assert.equal(changes.length,16);
  });
  // E1-R1-01 (E-04, E-07, E-09): a short press, move and release on a placed block, where nothing else moves under the
  // pointer, leaves the work as it was: no new order and no history step. Every block in view, the workspace scrolled and
  // not, with the mouse (8 steps, past the 5-step slop) and a finger moving sideways (18 steps).
  await test('UI-press-move-release-in-place-keeps-source',async()=>{
   await fixture(Array.from({length:10},(_,i)=>'「'+(i+1)+'」と言う。').join('\n'));
   const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const workspace=root.locator('.blockui-workspace'),cdp=await page.context().newCDPSession(page),seen=[];
   try{await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    for(const scrolled of [false,true]){
     await workspace.evaluate((w,s)=>{w.scrollTop=s?Math.min(80,w.scrollHeight-w.clientHeight):0;},scrolled);await settle();
     const view=await workspace.boundingBox(),count=await nodes('Say').count();
     for(let i=0;i<count;i++){
      const word=nodes('Say').nth(i).locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-phrase-text').first(),box=await word.boundingBox();
      if(!box||box.y<view.y||box.y+box.height>view.y+view.height)continue;
      for(const [kind,dx] of [['mouse',8],['touch',18]]){
       const before=await state(),b=await word.boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;
       if(kind==='mouse'){await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y,{steps:4});await page.mouse.up();}
       else{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let k=1;k<=4;k++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*k/4,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
       await settle();const after=await state(),what=kind+' on block '+(i+1)+(scrolled?' (scrolled)':'');
       assert.equal(after.source,before.source,what+' keeps the order');assert.equal(after.history,before.history,what+' makes no history step');assert.equal(after.pending,null,what);
       seen.push(what);
      }
     }
    }
   }finally{await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false}).catch(()=>{});await cdp.detach().catch(()=>{});}
   assert.ok(seen.filter(w=>!w.includes('scrolled')).length>=4&&seen.filter(w=>w.includes('scrolled')).length>=4,'blocks in view, scrolled and not: '+seen.length);
  });
  // D1-04 (LANGUAGE.md コードとブロックで同じ本文を編集する): while the code has a mistake, 「いつ動く？」 is pale and a press
  // keeps the code view; it shows 「コードの 赤い ところを 直すと、ブロックに もどれるよ」 under 「いつ動く？」, and a press elsewhere
  // takes it away. The view toggle 「コードモード ⇄」 is never pale (final call 22): it is refused, and says why when pressed.
  await test('UI-when-button-refused-with-code-error',async()=>{
   await chooseView(page,'code',{reveal:reveal});await (async()=>{const control=await reveal(page.locator('#codeEditor')); await openBodyForTest(control.page()); return control.fill('「こんにちは」と言');})();await page.waitForTimeout(400);
   const when=page.locator('#sourceHeadingBtn'),toggle=viewToggle(page),before=await state();
   assert.equal((await readViewToggle(page)).refused,'error','the view toggle is refused while the code has a mistake');
   assert.equal(await when.getAttribute('aria-disabled'),'true','いつ動く？ is pale while the code has a mistake');
   // The pale look is the refused state's opacity; each button keeps its own colour in both states.
   const pale=async e=>Number(await e.evaluate(n=>getComputedStyle(n).opacity));assert.ok(await pale(when)<1,'いつ動く？ is pale');
   assert.equal(await pale(toggle),1,'the view toggle is not pale');assert.equal(await toggle.getAttribute('aria-disabled'),null,'the view toggle is not made unpressable');
   await when.click({force:true});await page.waitForTimeout(200);
   const note=await when.evaluate(button=>{const b=button.getBoundingClientRect(),words='コードの赤いところを直すと、ブロックにもどれるよ';
    const shown=[...document.querySelectorAll('body *')].filter(n=>n.children.length===0&&n.getClientRects().length&&n.textContent.replace(/\s+/g,'').includes(words));
    return shown.map(n=>{const r=n.getBoundingClientRect();return{top:r.top,left:r.left,right:r.right,below:r.top>=b.bottom-1&&r.left<b.right+80&&r.right>b.left-80};});});
   assert.ok(note.some(n=>n.below),'the note shows under いつ動く？: '+JSON.stringify(note));
   assert.equal((await state()).mode,'code','the press keeps the code view');
   await page.locator('#formSurface').click({position:{x:5,y:5}});await page.waitForTimeout(200);
   const later=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(n=>n.children.length===0&&n.getClientRects().length&&n.textContent.replace(/\s+/g,'').includes('コードの赤いところを直すと、ブロックにもどれるよ')).length);
   assert.equal(later,0,'a press elsewhere takes the note away');
   const after=await state();assert.equal(after.source,before.source);assert.equal(after.history,before.history);
   await (async()=>{const control=await reveal(page.locator('#codeEditor')); return control.fill('');})();await page.waitForTimeout(400);
  });
  // E1-R1-05 (LANGUAGE.md: 「はじめて」では、数や文字の欄に「ちがう ものに かえる」「計算を入れる」を表示しません): at はじめて the
  // placed 1秒待つ, 3回くり返す and 「…」と2秒話す offer no way to put a calculation or another kind of value into their fields,
  // also not in their 「…」 (the はじめて block list has no value blocks to put there).
  await test('UI-entry-places-offer-no-calculation',async()=>{
   await fixture('1秒待つ。\n3回くり返す。\n  何もしない。\n「やあ」と2秒話す。');await page.locator('#uiLevel').selectOption('entry');await page.waitForFunction(()=>document.body.dataset.uiLevel==='entry');
   const offered=[];
   for(const schema of ['WaitTime','RepeatCount','Say']){const node=nodes(schema).first();await U.clickNode(node);
    for(const more of await node.locator(':scope > .blockui-node-content > .blockui-node-main [data-blockui-action="more"], :scope > .blockui-node-head [data-blockui-action="more"]').all())if(await more.isVisible())await more.click();
    await page.waitForTimeout(150);
    const actions=await page.evaluate(()=>[...document.querySelectorAll('#blockEditor [data-blockui-action]')].filter(e=>e.getClientRects().length&&['quantity-expression','replace-expression','slot-select'].includes(e.dataset.blockuiAction)).map(e=>e.dataset.blockuiAction+':'+e.textContent.trim()));
    const words=await page.evaluate(()=>[...document.querySelectorAll('#blockEditor button,#blockEditor option')].filter(e=>e.getClientRects().length&&/計算で決める|計算を入れる|ちがう ものに かえる/.test(e.textContent)).map(e=>e.textContent.trim()));
    offered.push(...actions.map(a=>schema+' '+a),...words.map(w=>schema+' '+w));await page.keyboard.press('Escape');}
   assert.deepEqual([...new Set(offered)],[],'no calculation or other value offered at はじめて');
   await page.locator('#uiLevel').selectOption('advanced');
  });
  // E1-R1-06 (E-03, E-12): at はじめて a loop put in from the block list, with its body still to fill, is not a movement
  // that はじめて cannot show: no 「「はじめて」では 見えない 動きも あるよ」 notice, and the workspace does not move.
  // The regression work holds bodies はじめて cannot show, so its notice is there before any loop: the case starts from
  // 「新しく作る」, which opens at はじめて with nothing hidden, so a notice could come only from the loop being put in.
  await test('UI-entry-loop-draft-no-hidden-notice',async()=>{
   await (await reveal(page.locator('#newBtn'))).click();if(await page.locator('#loseConfirmProceed').isVisible())await page.locator('#loseConfirmProceed').click();
   await page.waitForFunction(()=>document.body.dataset.uiLevel==='entry'&&Akari.app.project.scripts.every(s=>!s.source.trim()));
   const notice=()=>page.evaluate(()=>[...document.querySelectorAll('body *')].filter(n=>n.children.length===0&&n.getClientRects().length&&n.textContent.replace(/\s+/g,'').includes('「はじめて」では見えない')).length);
   const top=()=>root.locator('.blockui-workspace').evaluate(e=>Math.round(e.getBoundingClientRect().top));
   const before={notice:await notice(),top:await top()};assert.equal(before.notice,0,'a new work shows no notice at はじめて');
   await root.locator('.blockui-palette-item [data-blockui-schema="RepeatCount"]').first().click();await page.waitForTimeout(300);
   const after={notice:await notice(),top:await top(),loops:await nodes('RepeatCount').count()};
   assert.equal(after.loops,1,'the loop is in the work');assert.equal(after.notice,0,'no notice about movements はじめて cannot show');assert.equal(after.top,before.top,'the workspace stays where it was');
   await page.locator('#uiLevel').selectOption('advanced');
  });
  // Carries a block with the mouse. The place is measured once the carry has begun, because the places to put it
  // open between the sentences then and move the sentences below them.
  const carry=async(from,target)=>{const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(from.x+12,from.y+4,{steps:3});await page.mouse.move(from.x+60,from.y+10,{steps:4});await settle();
   const to=await target();await page.mouse.move(to.x,to.y,{steps:8});await settle();
   const refused=await page.evaluate(()=>[...document.querySelectorAll('body *')].some(n=>n.children.length===0&&n.getClientRects().length&&n.textContent.replace(/\s+/g,'').includes('ここにはおけないよ')));
   await page.mouse.up();await settle();return refused;};
  // The block view draws the fixture after its source is set: the place is read once the block is shown, and read again
  // when the block was drawn anew between finding it and reading it.
  const boxOf=async l=>{for(let attempt=0;attempt<5;attempt++){await l.waitFor();const b=await l.boundingBox();if(b)return b;await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}throw Error('no box to read: '+l);};
  const middle=async l=>{const b=await boxOf(l);return{x:b.x+b.width/2,y:b.y+b.height/2};};
  // The list's sample of a sentence is cut into the same pieces as the placed sentence: a value, its unit and the verb
  // each a piece of its own (［1］ 秒 待つ), and a speech's particle apart from its verb (［こんにちは］ と 言う).
  await test('UI-list-sample-cut-as-placed',async()=>{
   await (await reveal(page.locator('#objectSelect'))).selectOption('sprite-1');await (await reveal(page.locator('#eventSelect'))).selectOption('start');
   const want={'WaitTime':['□','秒','待つ'],'MotionCommand:TURN_RIGHT':['右に','□','度','回る'],'Say:timed':['□','と','□','秒','話す'],'Say':['□','と','言う'],
    'MotionCommand:MOVE_BY':['いまのばしょから、','□','へ','□','歩','動く'],'MotionCommand:MOVE':['□','へ','□','歩','進む'],'RepeatCount':['□','回','くり返す'],
    'MotionCommand:GOTO':['画面の左下のはしから、','右へ','□','歩','、','上へ','□','歩','のばしょへ行く']};
   await fixture('1秒待つ。\n右に15度回る。\n「こんにちは」と2秒話す。\n「やあ」と言う。\nいまのばしょから、右へ10歩動く。\n前へ10歩進む。\n3回くり返す。\n  1秒待つ。\n画面の左下のはしから、右へ80歩、上へ150歩のばしょへ行く。');
   // (a word is a span of the sentence; text between two other pieces is one piece; anything else shown is a value)
   const cut=main=>main.evaluate(m=>{const out=[];let run='';const end=()=>{if(run.trim())out.push(run.trim());run='';};
    for(const n of m.childNodes){if(n.nodeType===3){run+=n.textContent;continue;}end();if(n.nodeType!==1||n.hidden||n.matches('details,.blockui-preview-cavity')||getComputedStyle(n).display==='none')continue;
     out.push(n.matches('.blockui-phrase-text,.blockui-punctuation')?n.textContent.trim():'□');}end();return out;});
   const placed={'Say:timed':nodes('Say').nth(0),'Say':nodes('Say').nth(1)};
   await (await reveal(root.locator('[data-blockui-action="palette-category"]').filter({hasText:'すべて'}).first())).click();
   for(const [schema,words] of Object.entries(want)){
    assert.deepEqual(await cut(root.locator('.blockui-palette-item [data-blockui-schema="'+schema+'"] .blockui-preview-main').first()),words,schema+' in the list');
    assert.deepEqual(await cut((placed[schema]||nodes(schema).first()).locator(':scope > .blockui-node-content > .blockui-node-main')),words,schema+' placed');
   }
  });
  // E1-R1-03 (E-04): a sentence carried over the number of a placed sentence goes before or after that sentence
  // (上半分で離すとその前、下半分で離すとその後ろ) and is never refused there.
  await test('UI-carry-over-a-value-not-refused',async()=>{
   for(const [dy,expected] of [[-6,'1秒待つ。\n1秒待つ。\n2秒待つ。'],[6,'1秒待つ。\n2秒待つ。\n1秒待つ。']]){
    await fixture('1秒待つ。\n2秒待つ。');const before=await state();
    const item=root.locator('.blockui-palette-item [data-blockui-schema="WaitTime"]').first();await item.scrollIntoViewIfNeeded();
    const refused=await carry(await middle(item),async()=>{const m=await middle(nodes('WaitTime').nth(1).locator('[data-blockui-field="value"]').first());return{x:m.x,y:m.y+dy};});
    const after=await state();
    assert.equal(refused,false,'a sentence over the number 2 is not refused ('+dy+')');
    assert.equal(after.source.trim(),expected,'the sentence goes before or after 2秒待つ ('+dy+')');assert.equal(after.history,before.history+1);
   }
  });
  // E1-R1-04 (E-09): with the mouse a placed sentence is carried from its value as well as from its words; a press there
  // without moving keeps editing the value.
  await test('UI-carry-from-a-value-with-mouse',async()=>{
   await fixture('「a」と言う。\n「b」と言う。');const start=await state();
   const pill=nodes('Say').first().locator('[data-blockui-field="value"]').first();
   await carry(await middle(pill),async()=>{const b=await nodes('Say').nth(1).locator(':scope > .blockui-node-content > .blockui-node-main').first().boundingBox();return{x:b.x+b.width/2,y:b.y+b.height-3};});
   const moved=await state();assert.equal(moved.source.trim(),'「b」と言う。\n「a」と言う。','a placed sentence is carried from its value with the mouse');assert.equal(moved.history,start.history+1);
  });
  // E-09: a finger carries a placed sentence from its value and from the word beside the value, going sideways at once
  // or after a press held longer than the 300 ms that lifts the block; the sentence goes, not its value alone. A sentence
  // of the list goes the same way from its sample's value and the word beside it.
  await test('UI-carry-from-a-value-with-finger',async()=>{
   const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))),cdp=await page.context().newCDPSession(page),seen=[];
   const T=(type,p)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:p?[{...p,id:1}]:[]});
   const after=async l=>{const b=await boxOf(l);return{x:b.x+b.width/2,y:b.y+b.height-3};};
   // The work is checked a moment after it changes, and the check may draw the blocks and the list anew: a press waits
   // until the checks begun have run, so it is on the block that stays.
   await page.evaluate(()=>{const native=window.setTimeout.bind(window),clear=window.clearTimeout.bind(window),checks=window.uiWorkChecks={waiting:new Set(),seen:0};
    window.setTimeout=(fn,ms,...args)=>{if(fn?.name!=='checkNotices')return native(fn,ms,...args);checks.seen++;const id=native(()=>{checks.waiting.delete(id);fn(...args);},ms);checks.waiting.add(id);return id;};
    window.clearTimeout=id=>{checks.waiting.delete(id);clear(id);};});
   const checked=async()=>{await page.waitForFunction(()=>!window.uiWorkChecks.waiting.size);await settle();};
   // (a held press moves once the block is lifted; a sideways one moves at once, 32 px, past the 12 px of a press; the
   // place to let go is read again at each move, as the places opened between the sentences move the sentences)
   const carry=async(from,to,hold)=>{await checked();await from.scrollIntoViewIfNeeded();await settle();const at=await middle(from);await T('touchStart',at);if(hold)await root.locator('.blockui-lift').waitFor();
    for(let k=1;k<=4;k++){await T('touchMove',{x:at.x+k*8,y:at.y});await settle();}
    await root.locator('.blockui-dragging').waitFor();for(let k=0;k<3;k++){await T('touchMove',await to());await settle();}await T('touchEnd');await settle();};
   const main=n=>n.locator(':scope > .blockui-node-content > .blockui-node-main'),sample=()=>root.locator('.blockui-palette-item [data-blockui-schema="Say"] .blockui-preview-main').first();
   try{await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    for(const hold of [false,true]){
     for(const [what,from] of [['its number',()=>nodes('Say').first().locator('[data-blockui-field="value"]').first()],['the word beside its number',()=>main(nodes('Say').first()).locator(':scope > .blockui-phrase-text').first()]]){
      await fixture('3を言う。\n「b」と言う。');const start=await state();
      await carry(from(),()=>after(main(nodes('Say').nth(1)).first()),hold);
      const moved=await state(),how=what+(hold?' after a hold':' sideways');assert.equal(moved.source.trim(),'「b」と言う。\n3を言う。','a placed sentence is carried from '+how);assert.equal(moved.history,start.history+1,how);seen.push('placed: '+how);
     }
     for(const [what,from] of [['its value',()=>sample().locator(':scope > .blockui-preview-slot').first()],['the word beside its value',()=>sample().locator(':scope > .blockui-phrase-text').first()]]){
      await fixture('3を言う。');const start=await state();
      await carry(from(),()=>after(main(nodes('Say').first()).first()),hold);
      const added=await state(),how=what+(hold?' after a hold':' sideways');assert.equal(added.source.trim(),'3を言う。\n「こんにちは」と言う。','a sentence of the list is carried from '+how);assert.equal(added.history,start.history+1,how);seen.push('list: '+how);
     }
    }
   }finally{await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false}).catch(()=>{});await cdp.detach().catch(()=>{});}
   assert.ok(await page.evaluate(()=>window.uiWorkChecks.seen)>0,'the presses waited for the checks of the work');
   return {seen};
  });
  // E-09: a pen goes as a finger does. It carries a placed sentence from its value and from the word beside the value,
  // going sideways at once or after a press held longer than the 300 ms that lifts the block, and a sentence of the list
  // from its sample's value and the word beside it; going up from a value it moves the workspace and changes nothing. A
  // field being typed in keeps a pen's press for its caret and its selection, as a mouse's.
  await test('UI-carry-from-a-value-with-pen',async()=>{
   const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))),cdp=await page.context().newCDPSession(page),seen=[];
   let last=null,down=false;const P=(type,p)=>{if(p)last=p;down=type!=='mouseReleased';return cdp.send('Input.dispatchMouseEvent',{type,...last,...(type==='mouseMoved'?{}:{button:'left',clickCount:1}),buttons:type==='mouseReleased'?0:1,pointerType:'pen'});};
   const after=async l=>{const b=await boxOf(l);return{x:b.x+b.width/2,y:b.y+b.height-3};};
   // The work is checked a moment after it changes, and the check may draw the blocks and the list anew: a press waits
   // until the checks begun have run, so it is on the block that stays.
   await page.evaluate(()=>{const native=window.setTimeout.bind(window),clear=window.clearTimeout.bind(window),checks=window.uiWorkChecks={waiting:new Set(),seen:0};
    window.setTimeout=(fn,ms,...args)=>{if(fn?.name!=='checkNotices')return native(fn,ms,...args);checks.seen++;const id=native(()=>{checks.waiting.delete(id);fn(...args);},ms);checks.waiting.add(id);return id;};
    window.clearTimeout=id=>{checks.waiting.delete(id);clear(id);};});
   const checked=async()=>{await page.waitForFunction(()=>!window.uiWorkChecks.waiting.size);await settle();};
   // (a held press moves once the block is lifted; a sideways one moves at once, 32 px, past the 12 px of a press; the
   // place to let go is read again at each move, as the places opened between the sentences move the sentences)
   const carry=async(from,to,hold)=>{await checked();await from.scrollIntoViewIfNeeded();await settle();const at=await middle(from);await P('mousePressed',at);if(hold)await root.locator('.blockui-lift').waitFor();
    for(let k=1;k<=4;k++){await P('mouseMoved',{x:at.x+k*8,y:at.y});await settle();}
    await root.locator('.blockui-dragging').waitFor();for(let k=0;k<3;k++){await P('mouseMoved',await to());await settle();}await P('mouseReleased');await settle();};
   const main=n=>n.locator(':scope > .blockui-node-content > .blockui-node-main'),sample=()=>root.locator('.blockui-palette-item [data-blockui-schema="Say"] .blockui-preview-main').first();
   try{
    for(const hold of [false,true]){
     for(const [what,from] of [['its number',()=>nodes('Say').first().locator('[data-blockui-field="value"]').first()],['the word beside its number',()=>main(nodes('Say').first()).locator(':scope > .blockui-phrase-text').first()]]){
      await fixture('3を言う。\n「b」と言う。');const start=await state();
      await carry(from(),()=>after(main(nodes('Say').nth(1)).first()),hold);
      const moved=await state(),how=what+(hold?' after a hold':' sideways');assert.equal(moved.source.trim(),'「b」と言う。\n3を言う。','a placed sentence is carried by a pen from '+how);assert.equal(moved.history,start.history+1,how);seen.push('placed: '+how);
     }
     for(const [what,from] of [['its value',()=>sample().locator(':scope > .blockui-preview-slot').first()],['the word beside its value',()=>sample().locator(':scope > .blockui-phrase-text').first()]]){
      await fixture('3を言う。');const start=await state();
      await carry(from(),()=>after(main(nodes('Say').first()).first()),hold);
      const added=await state(),how=what+(hold?' after a hold':' sideways');assert.equal(added.source.trim(),'3を言う。\n「こんにちは」と言う。','a sentence of the list is carried by a pen from '+how);assert.equal(added.history,start.history+1,how);seen.push('list: '+how);
     }
    }
    await page.setViewportSize({width:1366,height:768});await fixture(Array.from({length:16},(_,i)=>i%2?'前へ'+(i+1)+'歩進む。':'「やあ'+i+'」と言う。').join('\n'));
    const before=await state(),space=root.locator('.blockui-workspace'),move=main(nodes('MotionCommand:MOVE').nth(1));
    for(const control of [move.locator('input').first(),move.locator('select').first(),move.locator('.blockui-extra > summary').first(),nodes('Say').nth(2).locator('.blockui-field[data-field-type="string"] input').first()]){
     await checked();await space.evaluate(w=>w.scrollTo(0,0));await control.evaluate(e=>e.scrollIntoView({block:'center'}));await settle();const at=await middle(control),top0=await space.evaluate(w=>w.scrollTop);
     await P('mousePressed',at);for(let i=1;i<=8;i++){await settle();await P('mouseMoved',{x:at.x+1,y:at.y-i*18});}await P('mouseReleased');await settle();
     const tag=await control.evaluate(e=>e.tagName),top=await space.evaluate(w=>w.scrollTop)-top0;assert(top>100,'a pen going up from '+tag+' moved the workspace '+top+' px');assert.equal((await state()).source,before.source,'a pen going up from '+tag);seen.push('up from '+tag);
    }
    // (a field is entered with a pen's press; then a press in it that goes sideways stays the field's)
    for(const [what,field] of [['a text being typed in',()=>nodes('Say').first().locator('.blockui-field[data-field-type="string"] input').first()],['a number entered',()=>nodes('Say').nth(1).locator('[data-blockui-field="value"]').first()]]){
     await fixture('「abcdef」と言う。\n12345を言う。\n「b」と言う。');const start=await state();await checked();await field().scrollIntoViewIfNeeded();await settle();const m=await middle(field());
     await P('mousePressed',m);await P('mouseReleased');await page.waitForFunction(()=>document.activeElement?.tagName==='INPUT'&&!!document.activeElement.closest('.blockui-node'));await settle();
     const at=await page.evaluate(()=>{const b=document.activeElement.getBoundingClientRect();return{x:b.x+6,y:b.y+b.height/2};});let carried=false;
     await P('mousePressed',at);for(let k=1;k<=5;k++){await P('mouseMoved',{x:at.x+k*8,y:at.y});await settle();carried=carried||await root.locator('.blockui-dragging').count()>0;}await P('mouseReleased');await settle();
     assert.equal(carried,false,'a pen going sideways in '+what+' carries nothing');assert.equal(await page.evaluate(()=>document.activeElement?.tagName==='INPUT'&&!!document.activeElement.closest('.blockui-node')),true,what+' keeps the typing');
     assert.equal((await state()).source,start.source,what);seen.push('kept by '+what);
    }
   }finally{if(down)await P('mouseReleased').catch(()=>{});await cdp.detach().catch(()=>{});}
   assert.ok(await page.evaluate(()=>window.uiWorkChecks.seen)>0,'the presses waited for the checks of the work');
   return {seen};
  });
  await test('UI-keyboard-only-create-move-delete-history',async()=>{
   await fixture('何もしない。');const tabTo=async locator=>{for(let i=0;i<500;i++){if(await locator.evaluate(e=>e===document.activeElement))return;await page.keyboard.press('Tab');}throw Error('Keyboard target not reachable: '+await locator.getAttribute('data-blockui-action'));};const openWithKeyboard=async node=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const more=node.locator(':scope > .blockui-node-head [data-blockui-action="more"]');await tabTo(more);if(!await more.evaluate(e=>e.closest('details').open))await page.keyboard.press('Enter');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await more.evaluate(e=>e.closest('details').open),true,'keyboard disclosure must be open');};const toolsToggle=root.locator('[data-blockui-action="palette-tools-toggle"]');if(await toolsToggle.getAttribute('aria-expanded')==='false'){await tabTo(toolsToggle);await page.keyboard.press('Enter');assert.equal(await toolsToggle.getAttribute('aria-expanded'),'true');}if(await root.locator('.blockui-palette-options').getAttribute('open')===null){await tabTo(root.locator('.blockui-palette-options > summary'));await page.keyboard.press('Enter');}await tabTo(root.locator('[data-blockui-palette-mode]'));await page.keyboard.press('Home');await tabTo(root.locator('[data-blockui-search]'));await page.keyboard.press('Control+a');await page.keyboard.type('Say');await tabTo(root.locator('[data-blockui-schema="Say"]'));await page.keyboard.press('Enter');assert.deepEqual((await state()).ast.body.map(n=>n.kind),['NoOperation','Say']);await openWithKeyboard(nodes('Say')); await tabTo(nodes('Say').locator(':scope > .blockui-node-head [data-blockui-action="move-up"]'));await page.keyboard.press('Enter');assert.deepEqual((await state()).ast.body.map(n=>n.kind),['Say','NoOperation']);await openWithKeyboard(nodes('Say')); await tabTo(nodes('Say').locator(':scope > .blockui-node-head [data-blockui-action="remove"]'));await page.keyboard.press('Enter');assert.deepEqual((await state()).ast.body.map(n=>n.kind),['NoOperation']);await page.keyboard.press('Control+z');assert.deepEqual((await state()).ast.body.map(n=>n.kind),['Say','NoOperation']);await page.keyboard.press('Control+y');assert.deepEqual((await state()).ast.body.map(n=>n.kind),['NoOperation']);
  });
  if(errors.length)results.push({id:'UI-page-errors',pass:false,errors});else results.push({id:'UI-page-errors',pass:true});
 }finally{await browser.close();}
 const report={html,sha256:initialHash,sourceUnchanged:initialHash===crypto.createHash('sha256').update(fs.readFileSync(html)).digest('hex'),browser:browserVersion,timestamp:new Date().toISOString(),total:results.length,failed:results.filter(r=>!r.pass).length,results,pageErrors:errors,networkRequests};fs.writeFileSync(prefix+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify({total:report.total,failed:report.failed,report:prefix+'.json'}));if(report.failed||!report.sourceUnchanged||networkRequests.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});


async function reveal(locator){
 if(await locator.count()===1){
  if(!await locator.isVisible())for(const panel of await locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())await panel.locator('.blockui-side-toggle').click();
  const controls=locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-palette-controls ")]');
  if(await controls.count())await openPaletteTools(controls.locator('..'));
  const ancestors=locator.locator(await locator.evaluate(e=>e.tagName==='SUMMARY')?'xpath=parent::details/ancestor::details[not(@open)]':'xpath=ancestor::details[not(@open)]');
  for(const detail of await ancestors.all())await detail.locator(':scope > summary').click();
 }
 return locator;
}
