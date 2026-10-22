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
  await test('UI-IME-switch-hold-end-commit',async()=>{
   await fixture('1を言う');const old=await state(),field=nodes('NumberLiteral').locator('input');await field.dispatchEvent('compositionstart');await (await reveal(field)).fill('24');await chooseView(page,'code',{reveal:reveal,open:openBodyForTest});assert.equal((await state()).mode,'blocks');assert.equal((await state()).source,old.source);await field.dispatchEvent('compositionend');await field.press('Enter');assert.equal((await state()).ast.body[0].value.value,24);
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
   await fixture(source);for(const line of [4,8]){await chooseView(page,'code',{reveal:reveal,open:openBodyForTest});const offset=source.split('\n').slice(0,line-1).join('\n').length+1;await page.locator('#codeEditor').evaluate((e,at)=>{e.setSelectionRange(at,at);e.focus();},offset);await chooseView(page,'blocks',{reveal:reveal,open:openBodyForTest});const active=await page.evaluate(()=>({body:document.activeElement.dataset.blockuiBodyWrapper,line:document.activeElement.dataset.sourceLine}));assert.equal(active.body,'elseBody');assert.equal(Number(active.line),line);assert.equal((await state()).source,source);}
   assert.equal(await root.locator('[data-blockui-body-wrapper="elseBody"][data-source-line]').count(),2);
  });
  await test('UI-else-selection-follows-formatting',async()=>{
   const source='もし 条件（条件の答え（あてはまる））が成り立つなら、次のことをする。\n\n  何もしない。\nそうでなければ、次のことをする。\n  何もしない。';await fixture(source);await U.openAnnotations(nodes('IfStatement').first());await chooseView(page,'code',{reveal:reveal,open:openBodyForTest});const offset=source.indexOf('そうでなければ');await page.locator('#codeEditor').evaluate((e,at)=>{e.setSelectionRange(at,at);e.focus();},offset);await chooseView(page,'blocks',{reveal:reveal,open:openBodyForTest});assert.equal(await page.evaluate(()=>Akari.app.editorState.main.blockSelectionLocation.line),4);
   const annotation=root.locator('[data-blockui-annotation="elseComment"]');await annotation.fill('※ 位置確認');await annotation.press('Enter');const updated=await state(),line=updated.source.split('\n').findIndex(x=>x.startsWith('そうでなければ'))+1;assert.equal(line,3,JSON.stringify(updated));assert.equal(await page.evaluate(()=>Akari.app.editorState.main.blockSelectionLocation.line),line);await chooseView(page,'code',{reveal:reveal,open:openBodyForTest});assert.equal(await page.locator('#codeEditor').evaluate(e=>e.value.slice(0,e.selectionStart).split('\n').length),line);await chooseView(page,'blocks',{reveal:reveal,open:openBodyForTest});
  });
  // A finger or a pen carries a block once it moves sideways more than 12 px (E-09); a shorter move is a press.
  for(const pointerType of ['touch','pen'])await test('UI-'+pointerType+'-pointer-drag',async()=>{
   await fixture('1を言う。\n2を言う。\n3を言う。');for(let i=0;i<3;i++){await U.nodeAction(nodes('Say').nth(i),'collapse');await U.nodeAction(nodes('Say').nth(i),'collapse');}await page.evaluate(()=>{window.__pointerEvidence=[];document.querySelector('#blockEditor').addEventListener('pointerdown',e=>__pointerEvidence.push({type:e.pointerType,trusted:e.isTrusted}),{once:true});});
   const old=await state(),handle=nodes('Say').first().locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-phrase-text'),drop=root.locator('.blockui-script > .blockui-node-content > .blockui-body > [data-insert-index="3"]'),h=await handle.boundingBox(),d=await drop.boundingBox(),start={x:h.x+h.width/2,y:h.y+h.height/2},end={x:d.x+20,y:d.y+d.height/2},cdp=await page.context().newCDPSession(page);
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
   await fixture('1を言う。\n2を言う。');const old=await state(),h=await nodes('Say').first().locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-phrase-text').boundingBox();await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(10,10,{steps:7});await page.mouse.up();const now=await state();for(const key of ['source','history','redo'])assert.equal(now[key],old[key]);assert.equal(now.pending,null);assert.equal(await root.locator('.blockui-drop-preview,.blockui-drop-invalid').count(),0);await page.waitForTimeout(400);
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
  const middle=async l=>{const b=await l.boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2};};
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

