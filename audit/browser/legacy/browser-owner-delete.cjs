// Actual keyboard/pointer regressions for owner deletion and expression movement.
const L=require('./audit-lib.cjs'),U=require('./ui-routes.cjs'),assert=require('assert/strict');
const {pathToFileURL}=require('url'),{chromium}=require('playwright');
(async()=>{
 const dir=L.path.resolve(process.argv[2]),manifest=L.verifyManifest(dir);
 const browser=await chromium.launch({executablePath:process.env.AKARI_BROWSER||undefined,headless:true,args:['--allow-file-access-from-files']});
 const results=[],pageErrors=[],networkRequests=[];
 const read=p=>p.evaluate(()=>{const a=Akari.app,s=a.editorState;return{project:JSON.stringify(a.project),owner:s.main.ownerKey,source:s.main.sourceText,pending:s.main.pendingEdit,history:s.history,redo:s.redo,dirty:s.dirty};});
 const outsideButton=async p=>{const route=[];for(let i=0;i<180;i++){await p.keyboard.press('Shift+Tab');const a=await p.evaluate(()=>({tag:document.activeElement.tagName,id:document.activeElement.id,inside:!!document.activeElement.closest('#blockEditor')}));route.push(a);if(a.tag==='BUTTON'&&!a.inside)return route;}throw Error('No outside button reached with normal keyboard navigation');};
 const run=async(id,source,test)=>{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route(/^https?:\/\//,r=>{networkRequests.push(r.request().url());return r.abort();});
  const p=await context.newPage(),dialogs=[];p.setDefaultTimeout(10000);
  p.on('pageerror',e=>pageErrors.push({id,error:e.message}));
  p.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
  try{
   await p.goto(pathToFileURL(L.path.join(dir,manifest.candidate)).href);
   await (await reveal09(p.locator('#objectSelect'))).selectOption('sprite-1');await (await reveal09(p.locator('#codeEditor'))).fill(source);
   await (await reveal09(p.locator('#editorModeblocks'))).click();await p.waitForTimeout(400);
   results.push({id,pass:true,evidence:await test(p,dialogs)});
  }catch(e){results.push({id,pass:false,error:e.stack,dialogs,observed:await read(p).catch(()=>null)});await p.screenshot({path:L.path.join(dir,id+'.png'),fullPage:true}).catch(()=>{});}
  finally{await context.close();}
  console.log(JSON.stringify(results.at(-1)));
  L.result(L.path.join(dir,'browser-owner-delete.json'),{manifest,browser:browser.version(),results,pageErrors,networkRequests});
 };
 try{
  await run('pending-expression-owner-delete-refused','［1、2］と言う。',async(p,dialogs)=>{
   const root=p.locator('#blockEditor'),list=root.locator('[data-schema-id="ListLiteral"]');
   await U.nodeAction(list.locator('[data-schema-id="NumberLiteral"]').first(),'move');
   await U.slotAction(U.ownedSlots(list).nth(1));
   const before=await read(p);assert.ok(before.pending,'Replacement must actually be pending');
   const route=await outsideButton(p);assert.ok((await read(p)).pending,'Navigation must not discard pending replacement');
   await p.keyboard.press('Delete');const after=await read(p);
   for(const key of ['project','owner','source','history','redo','dirty'])assert.equal(after[key],before[key],key+' must remain unchanged');
   assert.deepEqual(after.pending,before.pending);assert.deepEqual(dialogs,[],'Rejected editing must not reach deletion confirmation');
   await (await reveal09(root.locator('[data-blockui-action="cancel-expression-move"]'))).click();assert.equal((await read(p)).pending,null);
   return{route,before,after,cancelled:true};
  });
  await run('confirmed-owner-delete-common-history','1と言う。\n2と言う。',async(p,dialogs)=>{
   await (await reveal09(p.locator('#editorModecode'))).click();const route=await outsideButton(p),before=await read(p);
   await p.keyboard.press('Delete');const deleted=await read(p);
   assert.equal(JSON.parse(deleted.project).components.some(c=>c.id==='sprite-1'),false);assert.equal(dialogs.length,1);
   await (await reveal09(p.locator('#undoBtn'))).click();assert.equal((await read(p)).project,before.project);
   await (await reveal09(p.locator('#redoBtn'))).click();assert.equal((await read(p)).project,deleted.project);
   return{route,before,deleted,confirmationCount:dialogs.length,undoRedoExact:true};
  });
  await run('expression-move-destination-not-obscured','1と言う。\n2と言う。',async p=>{
   const root=p.locator('#blockEditor'),before=await read(p);
   await U.nodeAction(root.locator('[data-schema-id="NumberLiteral"]').first(),'move');
   await U.slotAction(U.ownedSlots(root.locator('[data-schema-id="Say"]').nth(1)).first());
   assert.ok((await read(p)).pending,'Pointer click must reach the next statement slot');
   await (await reveal09(root.locator('[data-blockui-action="cancel-expression-move"]'))).click();const after=await read(p);
   for(const key of ['project','source','history','redo','dirty'])assert.equal(after[key],before[key]);
   assert.equal(after.pending,null);return{pointerDestinationReached:true,cancelledWithoutMutation:true};
  });
  L.verifyManifest(dir);
 }finally{await browser.close();}
 if(results.some(r=>!r.pass)||pageErrors.length||networkRequests.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});


async function reveal09(locator){
 if(await locator.count()===1){if(!await locator.isVisible())for(const panel of await locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())await panel.locator('.blockui-side-toggle').click();const ancestors=locator.locator(await locator.evaluate(e=>e.tagName==='SUMMARY')?'xpath=parent::details/ancestor::details[not(@open)]':'xpath=ancestor::details[not(@open)]');for(const detail of await ancestors.all())await detail.locator(':scope > summary').click();}
 return locator;
}
