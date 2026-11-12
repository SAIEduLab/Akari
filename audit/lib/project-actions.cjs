const assert=require('node:assert/strict');
async function openProjectMenu(page){
 const menu=page.locator('#projectMenu'),summary=menu.locator(':scope > summary');
 await summary.scrollIntoViewIfNeeded();
 if(await menu.getAttribute('open')===null)await summary.click();
 assert.notEqual(await menu.getAttribute('open'),null,'作品 opens through its visible summary');
 return menu;
}
async function projectAction(page,id,options){
 assert.ok(['newBtn','openBtn','exportBtn'].includes(id),'known project action');
 await openProjectMenu(page);
 await page.locator('#'+id).click(options);
}
module.exports={openProjectMenu,projectAction};
