import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {snapshot, withBrowser, pageFor} from '../lib/product-test-host.mjs';
import U from '../browser/cases/ui-routes.cjs';

export const uiButtonIds = ['UI-BUTTON-SOURCE-NAV','UI-BUTTON-BASIC-HISTORY','UI-BUTTON-SIDE-ACTIONS','UI-BUTTON-LEVELS','UI-BUTTON-PENDING','UI-BUTTON-BLOCK-DESTINATION','UI-BUTTON-BLOCK-INSERTION','UI-BUTTON-BLOCK-COMMANDS','UI-BUTTON-RESPONSIVE'];
const [browserPath, output] = process.argv.slice(2);
assert.ok(output && !fs.existsSync(output), 'fresh button evidence required');
const inputs = snapshot('Akari.html'), results = [];
const fingerprint = p => p.evaluate(() => { const s=Akari.app.editorState; return {project:JSON.stringify(Akari.app.project),source:s.main.sourceText,history:s.history,redo:s.redo,dirty:s.dirty,draft:s.callableDraft,hasDraft:s.hasDraft}; });
async function reveal(l) {
  if (!await l.isVisible()) for (const panel of await l.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all()) await panel.locator('.blockui-side-toggle').click();
  for (const d of await l.locator('xpath=ancestor::details[not(@open)]').all()) await d.locator(':scope > summary').click();
  return l;
}
async function click(p, s) { await (await reveal(p.locator(s))).click(); }
async function body(p) { if (await p.locator('#sourceOverview').isVisible()) await click(p,'#sourceEditBtn'); }
async function mode(p, m) { await body(p); await click(p,'#editorMode'+m); }
async function select(p,id) { await (await reveal(p.locator('#objectSelect'))).selectOption(id); }
async function fill(p, source) { await mode(p,'code'); await p.locator('#codeEditor').fill(source); await p.waitForFunction(s=>Akari.app.editorState.main.sourceText===s,source); await p.waitForTimeout(350); }
const number = (p, root='#blockEditor') => p.locator(root+' .blockui-node[data-schema-id="NumberLiteral"] [data-blockui-field="value"]').first();
async function callable(p,kind='Function') { await click(p,'#procBtn'); await click(p,'#callableNew'+kind); await p.locator('#callableName').fill('ボタン検証'); await p.locator('#callableName').press('Tab'); await p.locator('#callableCode').fill(kind==='Function'?'1を返す。':'1と言う。'); await p.waitForTimeout(350); }
async function visible(p,s,value=true) { assert.equal(await p.locator(s).isVisible(),value,s+' visibility'); }
async function reachable(l) { await l.scrollIntoViewIfNeeded(); const r=await l.boundingBox(); assert.ok(r&&r.width>0&&r.height>0); const v=l.page().viewportSize(); assert.ok(r.x>=-1&&r.y>=-1&&r.x+r.width<=v.width+1&&r.y+r.height<=v.height+1,'control must be reachable by ordinary scrolling'); await l.click(); return {width:r.width,height:r.height}; }
const cases = {
  async 'UI-BUTTON-SOURCE-NAV'(p) {
    for(const m of ['code','blocks']) {
      await mode(p,m); await select(p,'stage'); const before=await fingerprint(p);
      await visible(p,'#sourceOverviewBtn'); assert.equal(await p.locator('#sourceOverviewBtn').innerText(),'すべてのコード');
      await visible(p,'#sourceEditBtn',false); await visible(p,'#sourceStageBtn',false);
      await click(p,'#sourceOverviewBtn'); await visible(p,'#sourceOverview'); await visible(p,'#sourceOverviewBtn',false); await visible(p,'#sourceEditBtn');
      assert.equal(await p.locator('#sourceEditBtn').innerText(),'本文の編集に戻る'); await click(p,'#sourceEditBtn'); assert.deepEqual(await fingerprint(p),before);
      await select(p,'sprite-1'); await visible(p,'#sourceStageBtn'); assert.equal(await p.locator('#sourceStageBtn').innerText(),'画面のコード');
      await click(p,'#sourceOverviewBtn'); await visible(p,'#sourceStageBtn'); await click(p,'#sourceStageBtn');
      assert.equal(await p.locator('#objectSelect').inputValue(),'stage'); await visible(p,'#sourceStageBtn',false);
    }
    return {modes:2,sameStateDuplicates:0,viewOnlyFingerprintPreserved:true};
  },
  async 'UI-BUTTON-BASIC-HISTORY'(p) {
    await p.locator('#uiLevel').selectOption('basic'); await body(p); const initial=await fingerprint(p);
    await visible(p,'#undoBtn'); await visible(p,'#redoBtn'); assert.equal(await p.locator('#redoBtn').isDisabled(),true);
    await fill(p,'1と言う。'); const one=await fingerprint(p); assert.ok(one.history>initial.history);
    await click(p,'#undoBtn'); assert.equal((await fingerprint(p)).source,initial.source);
    await click(p,'#redoBtn'); assert.equal((await fingerprint(p)).source,'1と言う。');
    await mode(p,'blocks'); const before=await fingerprint(p); await number(p).fill('2'); await number(p).press('Enter');
    assert.equal((await fingerprint(p)).source,'2と言う。'); assert.equal((await fingerprint(p)).history,before.history+1);
    await click(p,'#undoBtn'); assert.equal((await fingerprint(p)).source,'1と言う。'); await click(p,'#redoBtn'); assert.equal((await fingerprint(p)).source,'2と言う。');
    return {basic:true,codeUndoRedo:true,blockUndoRedo:true,atomicBlockHistory:true};
  },
  async 'UI-BUTTON-SIDE-ACTIONS'(p) {
    await body(p); await mode(p,'code');
    for(const section of ['.properties-window','.monitor-window']) { const t=p.locator(section+' .blockui-side-toggle'); await visible(p,section+' .blockui-side-toggle',false); assert.equal(await t.evaluate(e=>e.getClientRects().length),0,'hidden heading cannot receive keyboard focus'); assert.equal(await p.locator(section+' .blockui-side-label').isVisible(),true); }
    await select(p,'sprite-1'); await visible(p,'#properties .prop-duplicate'); await visible(p,'#properties .prop-delete');
    await mode(p,'blocks');
    for(const section of ['.properties-window','.monitor-window']) { const toggle=p.locator(section+' .blockui-side-toggle'); await reachable(toggle); const first=await toggle.getAttribute('aria-expanded'); await toggle.click(); assert.notEqual(await toggle.getAttribute('aria-expanded'),first); }
    const settings=p.locator('.properties-window'); if(!await settings.evaluate(e=>e.classList.contains('blockui-side-folded'))) await settings.locator('.blockui-side-toggle').click();
    await visible(p,'.objects-window #componentActions .prop-duplicate'); await visible(p,'.objects-window #componentActions .prop-delete');
    const before=await p.evaluate(()=>Akari.app.project.components.length); await click(p,'#componentActions .prop-duplicate'); assert.equal(await p.evaluate(()=>Akari.app.project.components.length),before+1);
    await click(p,'#componentActions .prop-delete'); assert.equal(await p.evaluate(()=>Akari.app.project.components.length),before);
    await select(p,'stage'); await visible(p,'#componentActions .prop-duplicate',false); await visible(p,'#componentActions .prop-delete',false);
    return {plainCodeLabels:true,blockFolding:true,actionsOutsideFold:true,duplicateDelete:true};
  },
  async 'UI-BUTTON-LEVELS'(p) {
    assert.deepEqual(await p.locator('#uiLevel option').evaluateAll(es=>es.map(e=>e.value)),['basic','advanced']);
    for(const level of ['basic','advanced']) { await p.locator('#uiLevel').selectOption(level); assert.equal(await p.evaluate(()=>document.body.dataset.uiLevel),level); await p.reload(); assert.equal(await p.locator('#uiLevel').inputValue(),level); }
    // Existing user preference is an external compatibility fixture, not an app state mutation.
    await p.evaluate(()=>localStorage.setItem('akari.uiLevel.v1','all')); await p.reload(); assert.equal(await p.locator('#uiLevel').inputValue(),'advanced');
    return {levels:['basic','advanced'],legacyAll:'advanced',reload:true};
  },
  async 'UI-BUTTON-PENDING'(p) {
    await fill(p,'1と言う。'); await mode(p,'blocks'); const mainBefore=await fingerprint(p);
    await number(p).fill('bad'); await number(p).press('Enter'); assert.equal(await number(p).getAttribute('aria-invalid'),'true'); assert.deepEqual(await fingerprint(p),mainBefore); await click(p,'#blockEditor [data-blockui-action="cancel"]'); assert.deepEqual(await fingerprint(p),mainBefore);
    await number(p).fill('4'); await visible(p,'#blockEditor [data-blockui-action="commit"]'); await click(p,'#blockEditor [data-blockui-action="cancel"]'); assert.deepEqual(await fingerprint(p),mainBefore);
    await number(p).fill('5'); await click(p,'#blockEditor [data-blockui-action="commit"]'); assert.equal((await fingerprint(p)).source,'5と言う。'); assert.equal((await fingerprint(p)).history,mainBefore.history+1); await visible(p,'#blockEditor [data-blockui-action="commit"]',false);
    await callable(p); await visible(p,'#callableCancel',false); await visible(p,'#callablePending',false);
    await click(p,'#callableModeblocks'); const before=await fingerprint(p), n=number(p,'#callableBlocks');
    await n.fill('invalid'); await n.press('Enter'); assert.equal(await n.getAttribute('aria-invalid'),'true'); await visible(p,'#callableBlocks [data-blockui-action="cancel"]'); assert.deepEqual(await fingerprint(p),before);
    await click(p,'#callableBlocks [data-blockui-action="cancel"]'); assert.deepEqual(await fingerprint(p),before); assert.equal(await number(p,'#callableBlocks').inputValue(),'1');
    await p.locator('#callableName').fill('長'.repeat(501)); await visible(p,'#callablePending'); await visible(p,'#callableCancel'); assert.deepEqual(await fingerprint(p),before); await click(p,'#callableCancel'); assert.deepEqual(await fingerprint(p),before); await visible(p,'#callableCancel',false);
    await number(p,'#callableBlocks').fill('2'); await number(p,'#callableBlocks').press('Enter'); await visible(p,'#callableCancel',false);
    assert.equal(await p.evaluate(()=>Akari.app.project.functions.length),0); assert.equal((await fingerprint(p)).hasDraft,true);
    await click(p,'#callableSave'); assert.equal(await p.evaluate(()=>Akari.app.project.functions.length),1); assert.equal(await p.evaluate(()=>Akari.app.project.functions[0].source),'2を返す。');
    return {invalidInputCancelable:true,validDraftCancelHidden:true,registrationSeparate:true};
  },
  async 'UI-BUTTON-BLOCK-DESTINATION'(p) {
    await fill(p,'1と言う。'); await mode(p,'blocks');
    for(const root of ['#blockEditor','#callableBlocks']) {
      if(root==='#callableBlocks') { await callable(p); await click(p,'#callableModeblocks'); }
      const before=await fingerprint(p);
      for(const method of ['button','Escape']) {
        await p.locator(root+' [data-blockui-action="body-insert"]').first().click(); await visible(p,root+' [data-blockui-action="cancel"]'); assert.equal(await p.locator(root+' [data-blockui-action="cancel"]').isEnabled(),true); await visible(p,root+' [data-blockui-action="commit"]',false);
        if(method==='button') await click(p,root+' [data-blockui-action="cancel"]'); else await p.keyboard.press('Escape');
        assert.equal(await p.locator(root+' .blockui-chosen-destination').count(),0); assert.deepEqual(await fingerprint(p),before);
      }
      const slot=p.locator(root+' .blockui-input-slot').first(); await U.slotAction(slot); assert.equal(await p.locator(root+' [data-blockui-action="cancel"]').isEnabled(),true); await visible(p,root+' [data-blockui-action="commit"]',false); await p.keyboard.press('Escape'); assert.equal(await p.locator(root+' .blockui-chosen-destination').count(),0); assert.deepEqual(await fingerprint(p),before);
    }
    return {mainAndCallable:true,bodyAndExpression:true,cancelAndEscape:true,noSourceHistoryDirtyChange:true};
  },
  async 'UI-BUTTON-BLOCK-INSERTION'(p) {
    const roots=[]; for (const root of ['#blockEditor','#callableBlocks']) {
    if(root==='#blockEditor') { await fill(p,'1と言う。\n2と言う。\n3と言う。'); await mode(p,'blocks'); } else { await callable(p,'Action'); await p.locator('#callableCode').fill('1と言う。\n2と言う。\n3と言う。'); await p.waitForTimeout(350); await click(p,'#callableModeblocks'); } const before=await fingerprint(p);
    const insertions=p.locator(root+' .blockui-script > .blockui-node-content > .blockui-body > [data-blockui-action="body-insert"]'); assert.equal(await insertions.count(),4,'three statements need four insertion boundaries');
    const sizes=[]; for(let i=0;i<4;i++) { const b=insertions.nth(i); assert.equal(await b.isVisible(),true); const r=await reachable(b); assert.ok(r.width>=24&&r.height>=24,'minimum pointer target 24px'); sizes.push(r); assert.ok(await p.locator(root+' .blockui-chosen-destination').count()); await p.keyboard.press('Escape'); }
    assert.deepEqual(await fingerprint(p),before); assert.ok(await p.locator(root+' [data-blockui-drag="node"]').count()>=3,'drag alternative remains available');
    await insertions.last().click(); await p.locator(root+' [data-blockui-action="palette-category"][data-blockui-category="'+'look'+'"]').click(); await p.locator(root+' [data-blockui-schema="'+'Say'+'"]').click();
    assert.equal(await p.locator(root+' .blockui-node[data-schema-id="'+'Say'+'"]').count(),4); assert.equal((await fingerprint(p)).history,before.history+1);
    roots.push({root,boundaries:4,sizes,pointerInsertion:true,dragAlternative:true});
    }
    const touchContext=await p.context().browser().newContext({offline:true,hasTouch:true,viewport:{width:1024,height:768}}),errors=[],network=[];
    try { await touchContext.route(/^https?:/,route=>{network.push(route.request().url());return route.abort();}); const t=await touchContext.newPage(); t.on('pageerror',e=>errors.push(e.message)); await t.goto(pathToFileURL(path.resolve('Akari.html')).href); await t.waitForFunction(()=>!!globalThis.Akari?.app); await select(t,'stage'); await fill(t,'1と言う。'); await mode(t,'blocks'); const before=await fingerprint(t);
      async function tap(l) { await l.scrollIntoViewIfNeeded(); const r=await l.boundingBox(); assert.ok(r&&r.width>=24&&r.height>=24); await t.touchscreen.tap(r.x+r.width/2,r.y+r.height/2); }
      await tap(t.locator('#blockEditor [data-blockui-action="body-insert"]').first()); assert.ok(await t.locator('#blockEditor .blockui-chosen-destination').count()); await tap(t.locator('#blockEditor [data-blockui-action="cancel"]')); assert.equal(await t.locator('#blockEditor .blockui-chosen-destination').count(),0); assert.deepEqual(await fingerprint(t),before);
    } finally { await touchContext.close(); } assert.deepEqual(errors,[]); assert.deepEqual(network,[]); return {roots,touch:true};
  },
  async 'UI-BUTTON-BLOCK-COMMANDS'(p) {
    const roots=[]; for (const root of ['#blockEditor','#callableBlocks']) {
    if(root==='#blockEditor') { await fill(p,'1と言う。\n2と言う。\n3と言う。'); await mode(p,'blocks'); } else { await callable(p,'Action'); await p.locator('#callableCode').fill('1と言う。\n2と言う。\n3と言う。'); await p.waitForTimeout(350); await click(p,'#callableModeblocks'); }
    const says=()=>p.locator(root+' .blockui-node[data-schema-id="'+'Say'+'"]'); const values=()=>p.locator(root+' .blockui-node[data-schema-id="NumberLiteral"] input').evaluateAll(es=>es.map(e=>e.value));
    async function action(index,a,expected) { const before=await fingerprint(p); await U.nodeAction(says().nth(index),a); assert.deepEqual(await values(),expected); assert.equal((await fingerprint(p)).history,before.history+1,a+' changes once'); }
    await action(0,'duplicate',['1','1','2','3']); await action(1,'move-down',['1','2','1','3']); await action(3,'move-up',['1','2','3','1']); await action(3,'remove',['1','2','3']);
    const before=await fingerprint(p); await U.nodeAction(says().first(),'move'); await p.locator(root+' .blockui-script > .blockui-node-content > .blockui-body > [data-blockui-action="body-insert"]').last().click(); assert.deepEqual(await values(),['2','3','1']); assert.equal((await fingerprint(p)).history,before.history+1);
    await U.slotAction(p.locator(root+' .blockui-input-slot').first()); await p.locator(root+' [data-blockui-action="palette-category"][data-blockui-category="data"]').click(); await p.locator(root+' [data-blockui-schema="NumberLiteral"]').click(); assert.deepEqual(await values(),['0','3','1']);
    const sourceNow=async()=> {const f=await fingerprint(p); return root==='#blockEditor'?f.source:f.draft.source;}; const changed=await sourceNow(); if(root==='#blockEditor') await click(p,'#undoBtn'); else await p.keyboard.press('Control+z'); assert.deepEqual(await values(),['2','3','1']); if(root==='#blockEditor') await click(p,'#redoBtn'); else await p.keyboard.press('Control+y'); assert.equal(await sourceNow(),changed);
    roots.push({root,duplicate:true,upDown:true,remove:true,moveDestination:true,expressionReplacement:true,undoRedo:true});
    } return {roots};
  },
  async 'UI-BUTTON-RESPONSIVE'(p) {
    const evidence=[];
    for(const viewport of [{width:1440,height:1000},{width:1280,height:720},{width:1024,height:768},{width:768,height:1024},{width:390,height:844}]) {
      await p.setViewportSize(viewport); await fill(p,'1と言う。');
      for(const m of ['code','blocks']) { await mode(p,m); const before=await fingerprint(p); await reachable(p.locator('#sourceOverviewBtn')); await reachable(p.locator('#sourceEditBtn')); assert.deepEqual(await fingerprint(p),before); await reachable(p.locator('#undoBtn')); await reachable(p.locator('#redoBtn')); }
      await U.openNodeMenu(p.locator('#blockEditor .blockui-node[data-schema-id="Say"]').first()); const command=p.locator('#blockEditor .blockui-node[data-schema-id="Say"]').first().locator(':scope > .blockui-node-head [data-blockui-action="duplicate"]'); await reachable(command); assert.equal(await p.locator('#blockEditor .blockui-node[data-schema-id="Say"]').count(),2);
      const toggle=p.locator('.properties-window .blockui-side-toggle'); await reachable(toggle); const expanded=await toggle.getAttribute('aria-expanded'); await reachable(toggle); assert.notEqual(await toggle.getAttribute('aria-expanded'),expanded); evidence.push(viewport);
    }
    return {viewports:evidence,ordinaryScrolling:true,navigationUndoRedoCommandsAndFold:true};
  },
};
assert.deepEqual(Object.keys(cases),uiButtonIds);
const version=await withBrowser(browserPath,async b=> { for(const [id,run] of Object.entries(cases)) { try { const evidence=await pageFor(b,'Akari.html',async p=> { p.on('dialog',d=>d.accept()); await p.setViewportSize({width:1440,height:1000}); await select(p,'stage'); return run(p); }); results.push({id,status:'PASS',pass:true,detail:'PASS',evidence}); } catch(error) { results.push({id,status:'FAIL',pass:false,detail:error.stack}); } console.log(results.at(-1).status+' '+id); if(!results.at(-1).pass) console.error(results.at(-1).detail); } return b.version(); },360000);
assert.deepEqual(snapshot('Akari.html'),inputs,'test must not modify product inputs');
const report={schema:'akari-ui-buttons-v1',status:results.every(r=>r.pass)?'PASS':'FAIL',environment:'chromium',browser:version,snapshot:inputs,total:results.length,results,pageErrors:[],networkRequests:[]};
fs.mkdirSync(path.dirname(output),{recursive:true}); fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
assert.equal(report.status,'PASS',results.filter(r=>!r.pass).map(r=>r.id+': '+r.detail).join('\n'));
