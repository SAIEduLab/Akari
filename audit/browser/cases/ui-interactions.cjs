const { currentProductFile } = require("./../../lib/product-path.cjs");
// Real browser interactions. Run: node audit-evidence/browser/ui-interactions.cjs [html] [output-prefix]
const U=require('./ui-routes.cjs');
const {withFreshPage}=require('./ui-case.cjs');
const {setupRegressionPage}=require('./regression-setup.cjs');
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const {chromium}=require('playwright');
const html=path.resolve(process.argv[2]||currentProductFile()),prefix=path.resolve(process.argv[3]||'audit-evidence/browser/ui-interactions'),initialHash=crypto.createHash('sha256').update(fs.readFileSync(html)).digest('hex');
(async()=>{
 const browser=await chromium.launch({executablePath:(process.env.AKARI_BROWSER||undefined),headless:true});
 const browserVersion=browser.version(),results=[],errors=[],networkRequests=[];
 let page,root;
 const nodes=id=>root.locator('.blockui-node[data-schema-id="'+id+'"]');
 const state=()=>page.evaluate(()=>{const s=Akari.app.editorState;return{source:s.main.sourceText,history:s.history,redo:s.redo,pending:s.main.pendingEdit,mode:s.main.mode,owner:s.main.ownerKey,selection:s.main.blockSelection,scroll:s.main.scrollState,ast:s.main.syntaxAst};});
 const fixture=async source=>{if(await root.isVisible()){const cancel=root.locator('[data-blockui-action="cancel"]');if(await cancel.isEnabled())await cancel.click();}await (async()=>{const control=await reveal(page.locator('#editorModecode')); await openBodyForTest(control.page()); return control.click();})();await (async()=>{const control=await reveal(page.locator('#codeEditor')); await openBodyForTest(control.page()); return control.fill(source);})();await (async()=>{const control=await reveal(page.locator('#editorModeblocks')); await openBodyForTest(control.page()); return control.click();})();assert.equal((await state()).mode,'blocks');};
 const selected=new Set((process.argv[4]||'').split(',').filter(Boolean));
 const test=async(id,fn)=>{
  if(selected.size&&!selected.has(id))return;
  try{
   await withFreshPage(browser,{url:pathToFileURL(html).href,errors,networkRequests},async fresh=>{
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
  await test('UI-empty-body-switch',async()=>{await fixture('');assert.equal((await state()).source,'');assert.equal(await nodes('Script').count(),1);await (async()=>{const control=await reveal(page.locator('#editorModecode')); await openBodyForTest(control.page()); return control.click();})();assert.equal(await page.locator('#codeEditor').inputValue(),'');await (async()=>{const control=await reveal(page.locator('#editorModeblocks')); await openBodyForTest(control.page()); return control.click();})();assert.equal((await state()).ast.body.length,0);});
  await test('UI-pending-number-commit-cancel',async()=>{
   await fixture('点数を1にする\n点数に2を足す');const old=await state(),field=nodes('NumberLiteral').first().locator('input');
   await (await reveal(field)).fill('-');await (await reveal(root.locator('[data-blockui-action="commit"]'))).click();let now=await state();assert.equal(now.source,old.source);assert.equal(now.history,old.history);assert.equal(now.pending.value,'-');
   await (await reveal(root.locator('[data-blockui-action="cancel"]'))).click();assert.equal(await field.inputValue(),'1');await (await reveal(field)).fill('7');await field.press('Enter');assert.equal((await state()).ast.body[0].value.value,7);
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
   assert.equal(await nodes('Hole:statement').count(),1);assert.ok(await page.evaluate(()=>Akari.app.editorState.main.blockDraft));await page.locator('#runBtn').click();assert.equal(await page.evaluate(()=>Akari.app.editorState.state),'DESIGN');await page.locator('#undoBtn').click();assert.equal((await state()).source,old.source);assert.equal(await nodes('Say').count(),1);await U.nodeAction(nodes('Say'),'replace-noop');assert.equal((await state()).ast.body[0].body[0].kind,'NoOperation');await page.locator('#undoBtn').click();assert.equal((await state()).source,old.source);
  });
  await test('UI-pointer-preview-single-drop-cancel',async()=>{
   await fixture('1を言う。\n2を言う。\n3を言う。');for(let i=0;i<3;i++){await U.nodeAction(nodes('Say').nth(i),'collapse');await U.nodeAction(nodes('Say').nth(i),'collapse');}
   const handle=nodes('Say').first().locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-phrase-text'),drop=root.locator('.blockui-script > .blockui-node-content > .blockui-body > [data-insert-index="3"]');
   let old=await state();const drag=async()=>{let h=await handle.boundingBox(),d=await drop.boundingBox();await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(d.x+20,d.y+d.height/2,{steps:7});d=await drop.boundingBox();await page.mouse.move(d.x+20,d.y+d.height/2);};
   await drag();assert.equal(await root.locator('.blockui-drop-preview').count(),1);assert.equal((await state()).source,old.source);await page.mouse.up();assert.deepEqual((await state()).ast.body.map(x=>x.value.value),[2,3,1]);assert.equal((await state()).history,old.history+1);await page.waitForTimeout(400);
   old=await state();await drag();await root.dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();assert.equal((await state()).source,old.source);assert.equal((await state()).history,old.history);assert.equal((await state()).pending,null);
  });
  await test('UI-IME-switch-hold-end-commit',async()=>{
   await fixture('1を言う');const old=await state(),field=nodes('NumberLiteral').locator('input');await field.dispatchEvent('compositionstart');await (await reveal(field)).fill('24');await (async()=>{const control=await reveal(page.locator('#editorModecode')); await openBodyForTest(control.page()); return control.click();})();assert.equal((await state()).mode,'blocks');assert.equal((await state()).source,old.source);await field.dispatchEvent('compositionend');await field.press('Enter');assert.equal((await state()).ast.body[0].value.value,24);
  });
  await test('UI-palette-drag-new-nested-location',async()=>{
   await fixture('2回くり返す。\n  何もしない。');await U.openDetails(root.locator('.blockui-palette-options'));await root.locator('[data-blockui-palette-mode]').selectOption('statement');await root.locator('.blockui-palette-options > summary').click();await (await reveal(root.locator('[data-blockui-search]'))).fill('Say');const candidate=root.locator('[data-blockui-schema="Say"]');
   const parentId=await nodes('RepeatCount').getAttribute('data-block-id'),drop=root.locator('[data-parent-id="'+parentId+'"][data-blockui-body="body"][data-insert-index="1"]');
   let old=await state(),h=await candidate.boundingBox(),d=await drop.boundingBox();await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(d.x+20,d.y+d.height/2,{steps:7});d=await drop.boundingBox();await page.mouse.move(d.x+20,d.y+d.height/2);assert.equal(await root.locator('.blockui-drop-preview').count(),1);assert.equal((await state()).source,old.source);await page.mouse.up();assert.equal((await state()).ast.body.length,1);assert.deepEqual((await state()).ast.body[0].body.map(n=>n.kind),['NoOperation','Say']);assert.equal((await state()).history,old.history+1);await page.waitForTimeout(400);
  });
  await test('UI-expression-move-atomic-replacement',async()=>{
   await fixture('［1、2］を言う');const first=nodes('ListLiteral').locator('.blockui-node[data-schema-id="NumberLiteral"]').first();await U.nodeAction(first,'move');await U.slotAction(U.ownedSlots(nodes('ListLiteral')).nth(1));assert.equal((await state()).ast.body[0].value.items[0].value,1);
   await (await reveal(root.locator('[data-blockui-replacement-schema]'))).selectOption('NumberLiteral');await (await reveal(root.locator('[data-blockui-action="confirm-expression-move"]'))).click();assert.deepEqual((await state()).ast.body[0].value.items.map(x=>x.value),[0,1]);
  });
  await test('UI-deep-expression-move-prompt-reachable',async()=>{
   await page.setViewportSize({width:1440,height:900});await fixture('（1＋2）＋（3＋4）を言う。\n0＋0を言う。');const source=nodes('Say').first().locator('.blockui-node[data-schema-id="BinaryExpression:ADD"]').first(),destination=nodes('Say').nth(1).locator('.blockui-node[data-schema-id="BinaryExpression:ADD"]').first();
   await U.nodeAction(source,'duplicate');await U.slotAction(U.ownedSlots(destination).first());
   const moved=U.ownedSlots(destination).first().locator(':scope > .blockui-node');await U.nodeAction(moved,'move');await U.slotAction(U.ownedSlots(destination).nth(1));await (await reveal(root.locator('[data-blockui-action="confirm-expression-move"]'))).click();const ast=(await state()).ast;assert.equal(ast.body[1].value.left.value,0);assert.equal(ast.body[1].value.right.kind,'BinaryExpression');await page.setViewportSize({width:1440,height:1800});
  });
  await test('UI-else-branch-focus-nested-comments',async()=>{
   const source='もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n  もし 条件（条件の答え（あてはまらない））が成り立つなら、次のことをする。\n    何もしない。\n  そうでなければ、次のことをする。 ※ 内側\n    ※ 本文コメント\n    何もしない。\n※ 外側枝の前\nそうでなければ、次のことをする。 ※ 外側\n  何もしない。';
   await fixture(source);for(const line of [4,8]){await (async()=>{const control=await reveal(page.locator('#editorModecode')); await openBodyForTest(control.page()); return control.click();})();const offset=source.split('\n').slice(0,line-1).join('\n').length+1;await page.locator('#codeEditor').evaluate((e,at)=>{e.setSelectionRange(at,at);e.focus();},offset);await (async()=>{const control=await reveal(page.locator('#editorModeblocks')); await openBodyForTest(control.page()); return control.click();})();const active=await page.evaluate(()=>({body:document.activeElement.dataset.blockuiBodyWrapper,line:document.activeElement.dataset.sourceLine}));assert.equal(active.body,'elseBody');assert.equal(Number(active.line),line);assert.equal((await state()).source,source);}
   assert.equal(await root.locator('[data-blockui-body-wrapper="elseBody"][data-source-line]').count(),2);
  });
  await test('UI-else-selection-follows-formatting',async()=>{
   const source='もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n\n  何もしない。\nそうでなければ、次のことをする。\n  何もしない。';await fixture(source);await U.openAnnotations(nodes('IfStatement').first());await (async()=>{const control=await reveal(page.locator('#editorModecode')); await openBodyForTest(control.page()); return control.click();})();const offset=source.indexOf('そうでなければ');await page.locator('#codeEditor').evaluate((e,at)=>{e.setSelectionRange(at,at);e.focus();},offset);await (async()=>{const control=await reveal(page.locator('#editorModeblocks')); await openBodyForTest(control.page()); return control.click();})();assert.equal(await page.evaluate(()=>Akari.app.editorState.main.blockSelectionLocation.line),4);
   const annotation=root.locator('[data-blockui-annotation="elseComment"]');await annotation.fill('※ 位置確認');await annotation.press('Enter');const updated=await state(),line=updated.source.split('\n').findIndex(x=>x.startsWith('そうでなければ'))+1;assert.equal(line,3,JSON.stringify(updated));assert.equal(await page.evaluate(()=>Akari.app.editorState.main.blockSelectionLocation.line),line);await (async()=>{const control=await reveal(page.locator('#editorModecode')); await openBodyForTest(control.page()); return control.click();})();assert.equal(await page.locator('#codeEditor').evaluate(e=>e.value.slice(0,e.selectionStart).split('\n').length),line);await (async()=>{const control=await reveal(page.locator('#editorModeblocks')); await openBodyForTest(control.page()); return control.click();})();
  });
  for(const pointerType of ['touch','pen'])await test('UI-'+pointerType+'-pointer-drag',async()=>{
   await fixture('1を言う。\n2を言う。\n3を言う。');for(let i=0;i<3;i++){await U.nodeAction(nodes('Say').nth(i),'collapse');await U.nodeAction(nodes('Say').nth(i),'collapse');}await page.evaluate(()=>{window.__pointerEvidence=[];document.querySelector('#blockEditor').addEventListener('pointerdown',e=>__pointerEvidence.push({type:e.pointerType,trusted:e.isTrusted}),{once:true});});
   const old=await state(),handle=nodes('Say').first().locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-phrase-text'),drop=root.locator('.blockui-script > .blockui-node-content > .blockui-body > [data-insert-index="3"]'),h=await handle.boundingBox(),d=await drop.boundingBox(),start={x:h.x+h.width/2,y:h.y+h.height/2},end={x:d.x+20,y:d.y+d.height/2},cdp=await page.context().newCDPSession(page);
   let previews=0;try{
    if(pointerType==='touch'){await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x-10,y:start.y,id:1}]});}
    else{await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',buttons:1,clickCount:1,pointerType:'pen'});await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x-10,y:start.y,buttons:1,pointerType:'pen'});}
    await root.locator('.blockui-dragging').waitFor();for(let attempt=0;attempt<5;attempt++){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const current=await drop.boundingBox();end.x=current.x+20;end.y=current.y+10;if(pointerType==='touch')await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:1}]});else await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...end,buttons:1,pointerType:'pen'});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));previews=await root.locator('.blockui-drop-preview').count();if(previews===1)break;}assert.equal((await state()).source,old.source);
   }finally{if(pointerType==='touch'){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});}else await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button:'left',buttons:0,clickCount:1,pointerType:'pen'});await cdp.detach();}
   assert.equal(previews,1,JSON.stringify({h,d,end,pointers:await page.evaluate(()=>__pointerEvidence)}));assert.deepEqual((await state()).ast.body.map(n=>n.value.value),[2,3,1]);const movedSource=(await state()).source;await page.keyboard.press('Control+z');assert.equal((await state()).source,old.source);await page.keyboard.press('Control+y');assert.equal((await state()).source,movedSource);assert.deepEqual(await page.evaluate(()=>__pointerEvidence),[{type:pointerType,trusted:true}]);await page.waitForTimeout(400);
  });
  await test('UI-outside-drop-preserves-state',async()=>{
   await fixture('1を言う。\n2を言う。');const old=await state(),h=await nodes('Say').first().locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-phrase-text').boundingBox();await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(10,10,{steps:7});await page.mouse.up();const now=await state();for(const key of ['source','history','redo'])assert.equal(now[key],old[key]);assert.equal(now.pending,null);assert.equal(await root.locator('.blockui-drop-preview,.blockui-drop-invalid').count(),0);await page.waitForTimeout(400);
  });
  await test('UI-keyboard-only-create-move-delete-history',async()=>{
   await fixture('何もしない。');const tabTo=async locator=>{for(let i=0;i<500;i++){if(await locator.evaluate(e=>e===document.activeElement))return;await page.keyboard.press('Tab');}throw Error('Keyboard target not reachable: '+await locator.getAttribute('data-blockui-action'));};const openWithKeyboard=async node=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const more=node.locator(':scope > .blockui-node-head [data-blockui-action="more"]');await tabTo(more);if(!await more.evaluate(e=>e.closest('details').open))await page.keyboard.press('Enter');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await more.evaluate(e=>e.closest('details').open),true,'keyboard disclosure must be open');};const toolsToggle=root.locator('[data-blockui-action="palette-tools-toggle"]');if(await toolsToggle.getAttribute('aria-expanded')==='false'){await tabTo(toolsToggle);await page.keyboard.press('Enter');assert.equal(await toolsToggle.getAttribute('aria-expanded'),'true');}if(await root.locator('.blockui-palette-options').getAttribute('open')===null){await tabTo(root.locator('.blockui-palette-options > summary'));await page.keyboard.press('Enter');}await tabTo(root.locator('[data-blockui-palette-mode]'));await page.keyboard.press('Home');await tabTo(root.locator('[data-blockui-search]'));await page.keyboard.press('Control+a');await page.keyboard.type('Say');await tabTo(root.locator('[data-blockui-schema="Say"]'));await page.keyboard.press('Enter');assert.deepEqual((await state()).ast.body.map(n=>n.kind),['NoOperation','Say']);await openWithKeyboard(nodes('Say')); await tabTo(nodes('Say').locator(':scope > .blockui-node-head [data-blockui-action="move-up"]'));await page.keyboard.press('Enter');assert.deepEqual((await state()).ast.body.map(n=>n.kind),['Say','NoOperation']);await openWithKeyboard(nodes('Say')); await tabTo(nodes('Say').locator(':scope > .blockui-node-head [data-blockui-action="remove"]'));await page.keyboard.press('Enter');assert.deepEqual((await state()).ast.body.map(n=>n.kind),['NoOperation']);await page.keyboard.press('Control+z');assert.deepEqual((await state()).ast.body.map(n=>n.kind),['Say','NoOperation']);await page.keyboard.press('Control+y');assert.deepEqual((await state()).ast.body.map(n=>n.kind),['NoOperation']);
  });
  if(errors.length)results.push({id:'UI-page-errors',pass:false,errors});else results.push({id:'UI-page-errors',pass:true});
 }finally{await browser.close();}
 const report={html,sha256:initialHash,sourceUnchanged:initialHash===crypto.createHash('sha256').update(fs.readFileSync(html)).digest('hex'),browser:browserVersion,timestamp:new Date().toISOString(),total:results.length,failed:results.filter(r=>!r.pass).length,results,pageErrors:errors,networkRequests};fs.writeFileSync(prefix+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify({total:report.total,failed:report.failed,report:prefix+'.json'}));if(report.failed||!report.sourceUnchanged||networkRequests.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});


async function reveal(locator){
 if(await locator.count()===1){if(!await locator.isVisible())for(const panel of await locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())await panel.locator('.blockui-side-toggle').click();const ancestors=locator.locator(await locator.evaluate(e=>e.tagName==='SUMMARY')?'xpath=parent::details/ancestor::details[not(@open)]':'xpath=ancestor::details[not(@open)]');for(const detail of await ancestors.all())await detail.locator(':scope > summary').click();}
 return locator;
}

// Enter the visible body editor before exercising editing operations.
async function openBodyForTest(page) { if (await page.locator("#sourceOverview").isVisible()) await page.locator("#sourceEditBtn").click(); }
