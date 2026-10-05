const {makeRegressionProject, setupRegressionPage, openRegressionEditor, installRegressionFactory} = require('./regression-setup.cjs');
const { currentProductFile } = require("./../../lib/product-path.cjs");
const U=require('./ui-routes.cjs');
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const{chromium}=require('playwright');
const html=path.resolve(process.argv[2]||currentProductFile()),output=path.resolve(process.argv[3]||'audit-evidence/browser/parent-qa.json');
(async()=>{const browser=await chromium.launch({executablePath:(process.env.AKARI_BROWSER||undefined),headless:true,args:['--allow-file-access-from-files']});const results=[];try{const test=async(id,fn)=>{const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('dialog',d=>d.accept());try{await page.goto(pathToFileURL(html).href);await setupRegressionPage(page);await fn(page);assert.deepEqual(errors,[]);results.push({id,pass:true});}catch(e){results.push({id,pass:false,error:e.stack,pageErrors:errors});await page.screenshot({path:path.join(path.dirname(output),id+'.png'),fullPage:true});}finally{await page.close();}console.log(results.at(-1));};
const state=p=>p.evaluate(()=>{const a=Akari.app,s=a.editorState;return{source:s.main.sourceText,owner:s.main.ownerKey,mode:s.main.mode,project:JSON.stringify(a.project),history:s.history,redo:s.redo,dirty:s.dirty,draft:s.callableDraft,hasDraft:s.hasDraft};});
const field=p=>p.locator('#blockEditor article[data-schema-id="NumberLiteral"] input[data-blockui-field="value"]').first();
await test('parent-switch-edit-history',async p=>{const src='※  空白を保持\n\n点数を１にする\n点数の値を言う ※末尾 ';
 const initialHistory=(await state(p)).history;await (async()=>{const control=await reveal(p.locator('#codeEditor')); await openBodyForTest(control.page()); return control.fill(src);})();await p.waitForFunction(({src,initialHistory})=>{const s=Akari.app.editorState;return s.main.sourceText===src&&s.history===initialHistory+1;},{src,initialHistory});const before=await state(p);await (async()=>{const control=await reveal(p.locator('#editorModeblocks')); await openBodyForTest(control.page()); return control.click();})();await (async()=>{const control=await reveal(p.locator('#editorModecode')); await openBodyForTest(control.page()); return control.click();})();assert.deepEqual(await state(p),before);
 await (async()=>{const control=await reveal(p.locator('#editorModeblocks')); await openBodyForTest(control.page()); return control.click();})();await field(p).fill('7');await field(p).press('Enter');assert.equal((await state(p)).source.includes('7'),true);assert.equal((await state(p)).history,before.history+1);
 await (await reveal(p.locator('#undoBtn'))).click();assert.equal((await state(p)).source,src);await (await reveal(p.locator('#redoBtn'))).click();assert.match((await state(p)).source,/7/);
});
await test('parent-pending-keeps-owner',async p=>{await (async()=>{const control=await reveal(p.locator('#codeEditor')); await openBodyForTest(control.page()); return control.fill('点数を1にする');})();await p.waitForTimeout(350);await (async()=>{const control=await reveal(p.locator('#editorModeblocks')); await openBodyForTest(control.page()); return control.click();})();const before=await state(p);await field(p).fill('');await (async()=>{const control=await reveal(p.locator('#editorModecode')); await openBodyForTest(control.page()); return control.click();})();assert.deepEqual(await state(p),before);await (await reveal(p.locator('#objectSelect'))).selectOption('sprite-1');assert.deepEqual(await state(p),before);await (await reveal(p.locator('#editorCancel'))).click();await (async()=>{const control=await reveal(p.locator('#editorModecode')); await openBodyForTest(control.page()); return control.click();})();assert.equal(await p.locator('#codeEditor').inputValue(),before.source);});
await test('parent-definition-draft',async p=>{await (await reveal(p.locator('#procBtn'))).click();await (await reveal(p.locator('#callableNewAction'))).click();await (await reveal(p.locator('#callableName'))).fill('増やす');await (await reveal(p.locator('#callableArgs'))).fill('量');await (await reveal(p.locator('#callableCode'))).fill('点数に量を足す');await p.waitForTimeout(350);assert.equal((await state(p)).draft.source,'点数に量を足す');assert.equal((await state(p)).hasDraft,true);assert.equal(await p.evaluate(()=>Akari.app.project.actions.length),0);
 await (await reveal(p.locator('#callableModeblocks'))).click();await (await reveal(p.locator('#callableModecode'))).click();assert.equal(await p.locator('#callableCode').inputValue(),'点数に量を足す');await (await reveal(p.locator('#callableSave'))).click();assert.equal(await p.evaluate(()=>Akari.app.project.actions[0]?.source),'点数に量を足す');assert.equal((await state(p)).hasDraft,false);
 await (await reveal(p.locator('#callableCode'))).fill('点数に2を足す');await p.waitForTimeout(350);await (await reveal(p.locator('#callableModeblocks'))).click();const n=p.locator('#callableBlocks article[data-schema-id="NumberLiteral"] input[data-blockui-field="value"]').first();await n.fill('4');await n.press('Enter');assert.equal((await state(p)).draft.source.includes('4'),true);assert.equal(await p.evaluate(()=>Akari.app.project.actions[0]?.source),'点数に量を足す');await (await reveal(p.locator('#callableSave'))).click();assert.match(await p.evaluate(()=>Akari.app.project.actions[0]?.source),/4/);
 await p.locator('#callableName').press('Control+z');assert.equal((await state(p)).hasDraft,true);assert.equal(await p.evaluate(()=>Akari.app.project.actions[0]?.source),'点数に量を足す');await p.locator('#callableName').press('Control+y');assert.equal((await state(p)).hasDraft,false);assert.match(await p.evaluate(()=>Akari.app.project.actions[0]?.source),/4/);
});
await test('parent-syntax-semantic-switch',async p=>{
 // Spec 11: syntax-valid semantic errors remain editable in both representations.
 const valid='【未定義の値】の値を言う';
 await (await reveal(p.locator('#codeEditor'))).fill(valid);
 await (await reveal(p.locator('#editorModeblocks'))).click();
 assert.equal((await state(p)).mode,'blocks');
 assert.match(await p.locator('#blockEditor').innerText(),/たしかめる/);
 await (await reveal(p.locator('#editorModecode'))).click();
 const before=await state(p),raw='点数を';
 await (await reveal(p.locator('#codeEditor'))).fill(raw);await p.waitForTimeout(200);
 assert.equal(await p.locator('#editorModeblocks').isDisabled(),true);
 assert.equal(await p.locator('#codeEditor').inputValue(),raw);
 assert.equal(await p.evaluate(()=>Akari.app.editorState.main.pendingEdit.value),raw);
 assert.deepEqual(await state(p),before,'unfinished text does not overwrite the valid project or add history');
 await (await reveal(p.locator('#objectSelect'))).selectOption('sprite-1');
 assert.deepEqual(await state(p),before,'owner change refuses the same unfinished input atomically');
 assert.equal(await p.locator('#codeEditor').inputValue(),raw);
 assert.equal(await p.locator('#editorPending').isVisible(),true);
 assert.equal(await p.locator('#editorCancel').isVisible(),true);
 await p.locator('#editorCancel').click();
 assert.deepEqual(await state(p),before,'explicit cancel adds no history and retains the valid source');
 assert.equal(await p.locator('#codeEditor').inputValue(),valid);
 assert.equal(await p.evaluate(()=>Akari.app.editorState.main.pendingEdit),null);
});
await test('parent-code-native-history',async p=>{const initial=(await state(p)).source;await (async()=>{const control=await reveal(p.locator('#codeEditor')); await openBodyForTest(control.page()); return control.fill('点数を2にする');})();await p.waitForTimeout(350);await (async()=>{const control=p.locator('#codeEditor'); await openBodyForTest(control.page()); return control.press('Control+z');})();assert.equal((await state(p)).source,initial);await (async()=>{const control=p.locator('#codeEditor'); await openBodyForTest(control.page()); return control.press('Control+y');})();assert.equal((await state(p)).source,'点数を2にする');await (async()=>{const control=p.locator('#codeEditor'); await openBodyForTest(control.page()); return control.press('Control+z');})();await (async()=>{const control=await reveal(p.locator('#codeEditor')); await openBodyForTest(control.page()); return control.fill('点数を3にする');})();assert.equal((await state(p)).redo,0);});
await test('parent-syntax-undo-fallback',async p=>{
 // Spec 11 / design 9: unfinished raw text belongs to the draft, not confirmed undo history.
 const before=await state(p),raw='壊れた構文',corrected='何もしない。';
 await (await reveal(p.locator('#codeEditor'))).fill(raw);await p.waitForTimeout(350);
 assert.deepEqual(await state(p),before,'unfinished input leaves every confirmed state field unchanged');
 assert.equal(await p.locator('#codeEditor').inputValue(),raw);
 assert.equal(await p.evaluate(()=>Akari.app.editorState.main.pendingEdit.value),raw);
 assert.equal(await p.locator('#editorModeblocks').isDisabled(),true);
 await (await reveal(p.locator('#procBtn'))).click();
 assert.equal(await p.locator('#procModal').isVisible(),false);
 assert.deepEqual(await state(p),before,'definition change refuses an unfinished statement');
 assert.equal(await p.locator('#codeEditor').inputValue(),raw);
 await (await reveal(p.locator('#runBtn'))).click();
 assert.equal(await p.evaluate(()=>Akari.app.editorState.state),'DESIGN');
 assert.deepEqual(await state(p),before,'run refusal creates no state or history entry');
 await (await reveal(p.locator('#editorCancel'))).click();
 assert.deepEqual(await state(p),before,'cancel preserves the complete valid draft and history');
 assert.equal(await p.locator('#codeEditor').inputValue(),before.source);
 assert.equal(await p.evaluate(()=>Akari.app.editorState.main.pendingEdit),null);
 await (await reveal(p.locator('#codeEditor'))).fill(raw);await p.waitForTimeout(350);
 await (await reveal(p.locator('#codeEditor'))).fill(corrected);await p.waitForTimeout(350);
 const committed=await state(p);assert.equal(committed.history,before.history+1);
 assert.equal(committed.source,corrected);assert.equal(await p.evaluate(()=>Akari.app.editorState.main.pendingEdit),null);
 await (await reveal(p.locator('#editorModeblocks'))).click();
 await (await reveal(p.locator('#undoBtn'))).click();
 const undone=await state(p);assert.equal(undone.project,before.project);assert.equal(undone.source,before.source);
 assert.equal(undone.history,before.history);assert.equal(undone.redo,1);
 await (await reveal(p.locator('#editorModecode'))).click();
 assert.equal(await p.locator('#codeEditor').inputValue(),before.source);
 assert.equal(await p.locator('#codeEditor').isVisible(),true);
 await (await reveal(p.locator('#redoBtn'))).click();
 assert.equal((await state(p)).source,corrected);assert.equal((await state(p)).history,committed.history);
 assert.equal(await p.locator('#codeEditor').inputValue(),corrected);
});
await test('parent-pending-header-owner',async p=>{await (await reveal(p.locator('#procBtn'))).click();await (await reveal(p.locator('#callableNewAction'))).click();await (await reveal(p.locator('#callableName'))).fill('試験');await (await reveal(p.locator('#callableCode'))).fill('1を言う。\n2を言う。');await (await reveal(p.locator('#callableModeblocks'))).click();await U.nodeAction(p.locator('#callableBlocks article[data-schema-id="Say"]').first(),'duplicate');const fields=p.locator('#callableBlocks article[data-schema-id="NumberLiteral"] input[data-blockui-field="value"]');assert.equal(await fields.count(),3);await fields.last().fill('');await (await reveal(p.locator('#callableName'))).fill('変更');assert.equal(await p.locator('#callableName').inputValue(),'試験');await fields.last().fill('9');await fields.last().press('Enter');assert.equal((await state(p)).draft.source,'1を言う。\n1を言う。\n9を言う。');});
await test('parent-header-limit-switch',async p=>{await (await reveal(p.locator('#procBtn'))).click();await (await reveal(p.locator('#callableCode'))).fill('1を言う。');await (await reveal(p.locator('#callableName'))).fill('名'.repeat(501));const before=await state(p);await (await reveal(p.locator('#callableModeblocks'))).click();assert.equal(await p.evaluate(()=>Akari.app.editorState.draft.mode),'code');assert.equal((await p.locator('#callableName').inputValue()).length,501);assert.deepEqual(await state(p),before);await (await reveal(p.locator('#callableCancel'))).click();assert.equal(await p.locator('#callableName').inputValue(),'');});
await test('parent-tool-drag-pending',async p=>{await (async()=>{const control=await reveal(p.locator('#editorModeblocks')); await openBodyForTest(control.page()); return control.click();})();await p.locator('#componentPickerCore > summary').click();const before=await state(p);await field(p).fill('');await (await reveal(p.locator('.tool[data-type="label"]'))).dragTo(p.locator('#formSurface'));assert.deepEqual(await state(p),before);assert.equal(await field(p).inputValue(),'');});
fs.writeFileSync(output,JSON.stringify({html,sha256:crypto.createHash('sha256').update(fs.readFileSync(html)).digest('hex'),browser:browser.version(),results},null,2));if(results.some(x=>!x.pass))process.exitCode=1;
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});


async function reveal(locator){
 if(await locator.count()===1){if(!await locator.isVisible())for(const panel of await locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())await panel.locator('.blockui-side-toggle').click();const ancestors=locator.locator(await locator.evaluate(e=>e.tagName==='SUMMARY')?'xpath=parent::details/ancestor::details[not(@open)]':'xpath=ancestor::details[not(@open)]');for(const detail of await ancestors.all())await detail.locator(':scope > summary').click();}
 return locator;
}

// Enter the visible body editor before exercising editing operations.
async function openBodyForTest(page) { if (await page.locator("#sourceOverview").isVisible()) await page.locator("#sourceEditBtn").click(); }
