// Follow the visible disclosure controls. Never force a hidden control or mutate UI state.
const assert=require('assert/strict');
async function openDetails(details){
 if(await details.count()) await require('./regression-setup.cjs').revealRegressionControl(details);
 if(!await details.count())return false; // Compact disclosure may be absent.
 if(await details.getAttribute('open')===null)await details.locator(':scope > summary').click();
 assert.notEqual(await details.getAttribute('open'),null);return true;
}
const openHints=page=>openDetails(page.locator('#hintsDisclosure'));
async function clickNode(node){
 await node.waitFor({state:'visible'});
 const ownInput=node.locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-field input, :scope > .blockui-node-content > .blockui-node-main > .blockui-field textarea').first();
 const ownText=node.locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-phrase-text, :scope > .blockui-node-content > .blockui-node-main > .blockui-punctuation').first();
 if(await ownInput.isVisible())await ownInput.click();
 else if(await ownText.isVisible())await ownText.click();
 else await node.click({position:{x:2,y:2}});
}
async function openNodeMenu(node){
 const menu=node.locator(':scope > .blockui-node-head .blockui-actions');if(!await menu.count())return false;
 if(!await menu.locator(':scope > summary').isVisible())await clickNode(node);
 return openDetails(menu);
}
async function nodeAction(node,action){
 if(['move-up','move-down'].includes(action))await clickNode(node);
 else await openNodeMenu(node);
 await node.locator(':scope > .blockui-node-head [data-blockui-action="'+action+'"]').click();
}
async function openAnnotations(node){
 const details=node.locator(':scope > .blockui-node-content > .blockui-annotations');if(!await details.count())return false;
 if(await details.getAttribute('open')!==null)return true;
 if(await details.locator(':scope > summary').isVisible())return openDetails(details);
 await nodeAction(node,'annotations');await details.locator(':scope > summary').waitFor({state:'visible'});assert.notEqual(await details.getAttribute('open'),null);return true;
}
const ownedSlots=node=>node.locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-input-slot, :scope > .blockui-node-content > .blockui-node-main > .blockui-multiple-inputs > .blockui-input-slot, :scope > .blockui-node-content > .blockui-input-slot, :scope > .blockui-node-content > .blockui-multiple-inputs > .blockui-input-slot');
// A field whose only tool would be its name has none (E-12).
async function openSlot(slot){
 const head=slot.locator(':scope > .blockui-slot-head');if(!await head.count()||!await head.isVisible())await clickNode(slot.locator(':scope > .blockui-node'));
 if(await head.count())await head.waitFor({state:'visible'});return slot;
}
// A value's tools (E-12): at くわしく with the selected field; at かんたん in the 「…」 after its sentence, one row per value.
async function valueTool(slot,selector){
 const head=slot.locator(':scope > .blockui-slot-head '+selector);if(await head.count())return head;
 const label=await slot.getAttribute('aria-label'),statement=slot.locator('xpath=ancestor::article[contains(concat(" ",normalize-space(@class)," ")," blockui-statement ")][1]');
 const extra=statement.locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-extra');
 if(await extra.getAttribute('open')===null)await extra.locator(':scope > summary').click();
 const exact=new RegExp('^'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$');
 return extra.locator('.blockui-value-row').filter({has:slot.page().locator('.blockui-slot-label',{hasText:exact})}).locator(selector);
}
async function slotAction(slot,action='slot-select'){await openSlot(slot);await (await valueTool(slot,'[data-blockui-action="'+action+'"]')).click();}
async function showUnavailable(root){
 const options=root.locator('.blockui-palette-options');if(!await options.count())return false;
 await openDetails(options);await options.getByRole('checkbox',{name:'使えないブロックも見せる',exact:true}).check();await options.locator(':scope > summary').click();return true;
}
async function inspectUnavailableChoice(choice,snapshot){
 await choice.waitFor({state:'visible'});assert.equal(await choice.getAttribute('aria-disabled'),'true');
 assert.equal(await choice.getAttribute('disabled'),null);
 const before=await snapshot();await choice.scrollIntoViewIfNeeded();const box=await choice.boundingBox();assert.ok(box&&box.width>0&&box.height>0);
 // ARIA marks insertion unavailable; a real pointer click still opens its reason.
 // Locator.click intentionally refuses aria-disabled, so use the measured visible control.
 await choice.page().mouse.click(box.x+box.width/2,box.y+box.height/2);assert.deepEqual(await snapshot(),before);
 const reason=choice.locator('..').locator('.blockui-unavailable');await reason.waitFor({state:'visible'});
 const text=await reason.innerText();assert.ok(text.trim());return text;
}
module.exports={openDetails,openHints,clickNode,openNodeMenu,nodeAction,openAnnotations,ownedSlots,openSlot,slotAction,showUnavailable,inspectUnavailableChoice};
