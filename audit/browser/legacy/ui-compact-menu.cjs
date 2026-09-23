// Bounded real pointer QA for compact block menus. No forced or hidden clicks.
// node audit-evidence/browser/ui-compact-menu.cjs [html] [output-prefix]
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const {chromium}=require('playwright');
const U=require('./ui-routes.cjs');
const html=path.resolve(process.argv[2]||'Akari.html'),prefix=path.resolve(process.argv[3]||'audit-evidence/browser/ui-compact-menu');
const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(html)).digest('hex'),sha256=hash();
(async()=>{
 const browser=await chromium.launch({executablePath:(process.env.AKARI_BROWSER||undefined),headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),results=[],pageErrors=[],networkRequests=[];
 fs.mkdirSync(path.dirname(prefix),{recursive:true});page.setDefaultTimeout(10000);page.on('pageerror',e=>pageErrors.push(e.stack));
 await context.route(/^https?:\/\//,route=>{networkRequests.push(route.request().url());return route.abort();});
 const root=page.locator('#blockEditor'),nodes=s=>root.locator('.blockui-node[data-schema-id="'+s+'"]');
 const state=()=>page.evaluate(()=>{const s=Akari.app.editorState;return{source:s.main.sourceText,history:s.history,redo:s.redo};});
 const save=()=>fs.writeFileSync(prefix+'.json',JSON.stringify({html,sha256,sourceUnchanged:hash()===sha256,browser:browser.version(),pageErrors,networkRequests,results,total:results.length,failed:results.filter(r=>!r.pass).length},null,2));
 async function run(id,fn){try{results.push({id,pass:true,evidence:await fn()});console.log('PASS',id);}catch(error){results.push({id,pass:false,error:error.stack,evidence:{screenshot:prefix+'-failure.png'}});await page.screenshot({path:prefix+'-failure.png'}).catch(()=>{});throw error;}finally{save();}}
 async function fixture(source){
  if(await root.isVisible()&&await root.locator('[data-blockui-action="cancel"]').isEnabled())await (await reveal09(root.locator('[data-blockui-action="cancel"]'))).click();
  await (await reveal09(page.locator('#editorModecode'))).click();await (await reveal09(page.locator('#codeEditor'))).fill(source);await (await reveal09(page.locator('#editorModeblocks'))).click();
 }
 async function menuEvidence(node){
  await U.openNodeMenu(node);const menu=node.locator(':scope > .blockui-node-head .blockui-actions'),items=menu.locator('.blockui-action-items');
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const geometry=await items.evaluate(e=>{const w=e.closest('.blockui-workspace'),r=e.getBoundingClientRect(),v=w.getBoundingClientRect();return{menu:{x:r.x,y:r.y,right:r.right,bottom:r.bottom},workspace:{x:v.x,y:v.y,right:v.x+w.clientWidth,bottom:v.y+w.clientHeight}};});
  assert.ok(geometry.menu.x>=geometry.workspace.x&&geometry.menu.right<=geometry.workspace.right+1&&geometry.menu.y>=geometry.workspace.y&&geometry.menu.bottom<=geometry.workspace.bottom+1,JSON.stringify(geometry));
  const buttons=items.locator('button'),reachable=[];
  for(let i=0;i<await buttons.count();i++){
   const b=buttons.nth(i);await b.scrollIntoViewIfNeeded();
   assert.ok(await b.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e===hit||e.contains(hit);}),'menu button is covered: '+await b.innerText());
   reachable.push({action:await b.getAttribute('data-blockui-action'),enabled:await b.isEnabled()});
  }
  return{...geometry,reachable};
 }
 try{
  await page.goto(pathToFileURL(html).href);await fixture(Array.from({length:12},(_,i)=>(i+1)+'と言う。').join('\n'));
  const before=await state();
  await run('UI09-MENU-left-first-number',async()=>{
   const node=nodes('NumberLiteral').first(),evidence=await menuEvidence(node);await (await reveal09(node.locator(':scope > .blockui-node-head [data-blockui-action="move"]'))).click();
   assert.equal(await root.locator('.blockui-destination').isVisible(),true);await (await reveal09(root.locator('[data-blockui-action="cancel"]'))).click();assert.deepEqual(await state(),before);
   return{...evidence,moveCancelled:true,sourceHistoryRedoPreserved:true};
  });
  await run('UI09-MENU-bottom-last-number',async()=>{
   const node=nodes('NumberLiteral').last(),evidence=await menuEvidence(node);await page.screenshot({path:prefix+'-bottom.png'});
   await (await reveal09(node.locator(':scope > .blockui-node-head [data-blockui-action="replace-expression"]'))).click();assert.deepEqual(await state(),before);
   return{...evidence,expressionDestinationSelected:true,sourceHistoryRedoPreserved:true,screenshot:prefix+'-bottom.png'};
  });
  await run('UI09-MENU-bottom-annotation-undo',async()=>{
   const node=nodes('Say').last(),evidence=await menuEvidence(node);await (await reveal09(node.locator(':scope > .blockui-node-head [data-blockui-action="annotations"]'))).click();
   await (await reveal09(node.locator(':scope > .blockui-node-content > .blockui-annotations input'))).fill('※ 末尾');await (await reveal09(root.locator('[data-blockui-action="commit"]'))).click();
   assert.ok((await state()).source.includes('※ 末尾'));await page.keyboard.press('Control+z');assert.equal((await state()).source,before.source);
   return{...evidence,lastMenuActionEditedAnnotation:true,undoRestoredSource:true};
  });
  await run('UI09-MENU-open-scroll-reposition',async()=>{
   const node=nodes('Say').nth(6),first=await menuEvidence(node),old=await state();await root.locator('.blockui-workspace').hover();await page.mouse.wheel(0,100);
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   assert.notEqual(await node.locator(':scope > .blockui-node-head .blockui-actions').getAttribute('open'),null);const after=await menuEvidence(node);assert.deepEqual(await state(),old);
   return{before:first,after,sourceHistoryRedoPreserved:true};
  });
  await run('UI09-MENU-resize-closes-preserves',async()=>{
   const old=await state();await page.setViewportSize({width:900,height:900});
   // Viewport emulation completion can precede the page's asynchronous resize event.
   // Observe the real handler's result; never dismiss a menu from the test itself.
   await page.waitForFunction(()=>innerWidth===900&&!document.querySelector('#blockEditor .blockui-actions[open]'),null,{timeout:5000});
   assert.equal(await root.locator('.blockui-actions[open]').count(),0);assert.deepEqual(await state(),old);
   return{width:900,openMenuCount:0,sourceHistoryRedoPreserved:true};
  });
  await run('UI09-MENU-right-long-statement',async()=>{
   await fixture('「'+('右端の文字'.repeat(8))+'」と言う。');const old=await state(),evidence=await menuEvidence(nodes('Say'));assert.deepEqual(await state(),old);await page.screenshot({path:prefix+'-right.png'});
   return{...evidence,sourceHistoryRedoPreserved:true,screenshot:prefix+'-right.png'};
  });
  await run('UI09-MENU-narrow-390',async()=>{
   const old=await state();await page.setViewportSize({width:390,height:844});
   // setViewportSize can resolve before Akari's resize listener closes the previously open menu.
   // Wait for the product's real resize handling; the audit never closes the menu itself.
   await page.waitForFunction(()=>innerWidth===390&&!document.querySelector('#blockEditor .blockui-actions[open]'),null,{timeout:5000});
   const evidence=await menuEvidence(nodes('Say'));assert.deepEqual(await state(),old);await page.screenshot({path:prefix+'-narrow.png'});
   return{...evidence,width:390,sourceHistoryRedoPreserved:true,screenshot:prefix+'-narrow.png'};
  });
  await run('UI09-MENU-errors-network-source',async()=>{assert.deepEqual(pageErrors,[]);assert.deepEqual(networkRequests,[]);assert.equal(hash(),sha256);return{pageErrors:0,networkRequests:0,sourceUnchanged:true};});
 }finally{save();await browser.close();}
 if(results.some(r=>!r.pass)||pageErrors.length||networkRequests.length||hash()!==sha256)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});


async function reveal09(locator){
 if(await locator.count()===1){if(!await locator.isVisible())for(const panel of await locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())await panel.locator('.blockui-side-toggle').click();const ancestors=locator.locator(await locator.evaluate(e=>e.tagName==='SUMMARY')?'xpath=parent::details/ancestor::details[not(@open)]':'xpath=ancestor::details[not(@open)]');for(const detail of await ancestors.all())await detail.locator(':scope > summary').click();}
 return locator;
}
