import {makeRegressionProject,installRegressionProject,showAdvancedCode} from '../lib/gate-ui-fixture.mjs';
import { currentProductFile } from "./../lib/product-path.cjs";
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {snapshot, withBrowser, pageFor} from '../lib/product-test-host.mjs';
import U from '../browser/cases/ui-routes.cjs';
import {answerProductConfirms} from '../lib/product-dialogs.cjs';
import {chooseView} from '../browser/cases/view-toggle.cjs';
import {pressStop} from '../lib/stop-press.cjs';

export const uiButtonIds = ['UI-BUTTON-CURRENT-MODE-REFUSAL','UI-BUTTON-GUIDED-CHOICES','UI-BUTTON-SOURCE-NAV','UI-BUTTON-BASIC-HISTORY','UI-BUTTON-SIDE-ACTIONS','UI-BUTTON-LEVELS','UI-BUTTON-PENDING','UI-BUTTON-BLOCK-DESTINATION','UI-BUTTON-BLOCK-INSERTION','UI-BUTTON-BLOCK-COMMANDS','UI-BUTTON-RESPONSIVE'];
const [browserPath, output] = process.argv.slice(2);
assert.ok(output && !fs.existsSync(output), 'fresh button evidence required');
const inputs = snapshot(currentProductFile()), results = [];
const fingerprint = p => p.evaluate(() => { const s=Akari.app.editorState; return {project:JSON.stringify(Akari.app.project),source:s.main.sourceText,history:s.history,redo:s.redo,dirty:s.dirty,draft:s.callableDraft,hasDraft:s.hasDraft}; });
async function reveal(l) {
  if (!await l.isVisible()) for (const panel of await l.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all()) await panel.locator('.blockui-side-toggle').click();
  for (const d of await l.locator('xpath=ancestor::details[not(@open)]').all()) await d.locator(':scope > summary').click();
  return l;
}
async function click(p, s) { await (await reveal(p.locator(s))).click(); }
async function body(p) { if (await p.locator('#sourceOverview').isVisible()) await click(p,'#sourceEditBtn'); }
async function mode(p, m) { await body(p); await chooseView(p,m,{reveal}); }
async function select(p,id) { await (await reveal(p.locator('#objectSelect'))).selectOption(id); }
async function fill(p, source) { await mode(p,'code'); await p.locator('#codeEditor').fill(source); await p.waitForFunction(s=>Akari.app.editorState.main.sourceText===s,source); await p.waitForTimeout(350); }
const number = (p, root='#blockEditor') => p.locator(root+' .blockui-node[data-schema-id="NumberLiteral"] [data-blockui-field="value"]').first();
async function callable(p,kind='Function') { await click(p,'#procBtn'); await click(p,'#callableNew'+kind); await p.locator('#callableName').fill('ボタン検証'); await p.locator('#callableName').press('Tab'); await p.locator('#callableCode').fill(kind==='Function'?'1を答えとして返す。':'1を言う。'); await p.waitForTimeout(350); }
async function visible(p,s,value=true) { assert.equal(await p.locator(s).isVisible(),value,s+' visibility'); }
async function reachable(l) { await l.scrollIntoViewIfNeeded(); const r=await l.boundingBox(); assert.ok(r&&r.width>0&&r.height>0); const v=l.page().viewportSize(); assert.ok(r.x>=-1&&r.y>=-1&&r.x+r.width<=v.width+1&&r.y+r.height<=v.height+1,'control must be reachable by ordinary scrolling'); await l.click(); return {width:r.width,height:r.height}; }
// Observe the required DOM state within the existing page timeout; no retry or added sleep.
const settledHidden = locator => locator.waitFor({state:'hidden'});
async function hiddenObservationControls(p) {
  const frame=await p.context().newPage();
  const controls=[];
  try {
    await frame.setContent('<button id="pending">入力を確定</button>');
    const button=frame.locator('#pending');assert.equal(await button.isVisible(),true);
    await frame.evaluate(()=>requestAnimationFrame(()=>{document.querySelector('#pending').hidden=true;}));
    await settledHidden(button);controls.push({id:'delayed-hidden',hidden:!await button.isVisible()});
  } finally { await frame.close(); }
  const wrong=await p.context().newPage();
  try {
    wrong.setDefaultTimeout(100); // Short negative-control deadline only; production keeps 30000ms.
    await wrong.setContent('<button id="pending">入力を確定</button>');
    const button=wrong.locator('#pending');let timeout;
    try { await settledHidden(button); } catch(error) { timeout=error; }
    assert.equal(timeout?.name,'TimeoutError','permanent visibility must fail within its bound');
    controls.push({id:'permanent-visible',rejected:!!timeout,timeoutMs:100});
    await wrong.close();let closed;
    try { await settledHidden(button); } catch(error) { closed=error; }
    assert.match(closed?.message||'',/Target page, context or browser has been closed/,'closed observation must fail');
    controls.push({id:'closed-page',rejected:!!closed});
  } finally { await wrong.close(); }
  return controls;
}
const cases = {
  async 'UI-BUTTON-CURRENT-MODE-REFUSAL'(p) {
    await mode(p,'code');const editor=p.locator('#codeEditor'),toggle=p.locator('#editorModeblocks'),initial=await fingerprint(p);
    await editor.fill('「');await p.waitForFunction(()=>document.querySelector('#editorModeblocks').dataset.refused==='error');await p.waitForTimeout(400);
    await p.evaluate(()=>{window.modePresses=[];document.querySelector('#editorModeblocks').addEventListener('pointerdown',e=>modePresses.push(e.currentTarget.dataset.refused||null),true);});
    const press=async()=>{const r=await toggle.boundingBox();await p.mouse.click(r.x+r.width/2,r.y+r.height/2);};
    await editor.fill('「直せた」と言う。');const valid=await fingerprint(p);await press();await p.waitForFunction(()=>Akari.app.editorState.main.mode==='blocks');const committed=await fingerprint(p);assert.deepEqual(committed,{...valid,history:valid.history+1},'leaving typing commits that single source edit');await p.waitForTimeout(400);assert.deepEqual(await fingerprint(p),committed,'the delayed repaint adds no history');
    await p.locator('#undoBtn').click();assert.equal((await fingerprint(p)).source,initial.source,'undo returns to the previous confirmed source');await p.locator('#redoBtn').click();assert.equal((await fingerprint(p)).source,valid.source);
    await mode(p,'code');await editor.fill('「');const invalid=await fingerprint(p);await press();assert.equal(await p.evaluate(()=>Akari.app.editorState.main.mode),'code');assert.equal(await p.locator('#modeBlockedNote').isVisible(),true);assert.deepEqual(await fingerprint(p),invalid);
    const previousRefusals=await p.evaluate(()=>modePresses);assert.equal(previousRefusals.length,2);assert.equal(previousRefusals[0],'error','the repaired body is pressed while the old refusal is still painted');assert.ok(previousRefusals[1]===null||previousRefusals[1]==='error','the malformed control may already be painted');
    return {previousRefusals,immediateRepairSwitch:true,newErrorRefused:true,sourceAndHistoryPreserved:true};
  },
  async 'UI-BUTTON-GUIDED-CHOICES'(p) {
    const variants=[];
    await p.removeLocatorHandler(p.locator('#loseConfirmModal.show'));
    await p.evaluate(()=>{window.choiceStarts=0;window.choiceSaid=[];const start=Akari.EventScheduler.prototype.start;Akari.EventScheduler.prototype.start=function(...args){choiceStarts++;window.choiceScheduler=this;const say=this.ui.say;this.ui.say=(...said)=>{choiceSaid.push({id:said[0],text:said[1]});return say?.apply(this.ui,said);};return start.apply(this,args);};});
    const scenarios=[
      {id:'repeat-both',source:'10歩進む。※前のメモ  \r\n※〔角度をえらぶ〕は メモ\r\n\r\n右に曲がる。※回るメモ\r\n4回くり返す。※回数 メモ\r\n「おわり」と言う。',choice:0,value:'９０',expected:'4回くり返す。※回数 メモ\n  10歩進む。※前のメモ  \n  ※〔角度をえらぶ〕は メモ\n\n  右に90度回る。※回るメモ\r\n「おわり」と言う。',position:[0,0]},
      {id:'repeat-turn',source:'10歩進む。右に曲がる。4回くり返す。「おわり」と言う。',choice:1,value:'90',expected:'10歩進む。\n4回くり返す。\n  右に90度回る。\n「おわり」と言う。',position:[10,0]},
      {id:'list-append',source:'持ち物に「かさ」を入れる。',choice:0,expected:'持ち物の最後に「かさ」を入れる。',list:['本','ぼうし','かさ']},
      {id:'list-replace',source:'持ち物に「かさ」を入れる。',choice:1,value:'２',expected:'持ち物の2番目を「かさ」にかえる。',list:['本','かさ']},
    ];
    for(const c of scenarios){
      const file=await p.evaluate(id=>{const q=Akari.makeDefaultProject();q.name='意味の入力 '+id;Object.assign(q.components[0],{x:0,y:0,direction:0});q.projectData.lists=[{id:'guided-list',name:'持ち物',initialValue:['本','ぼうし']}];q.scripts=[{id:'guided-main',targetId:'sprite-1',event:'start',source:'10歩進む。'}];return Akari.serializeProject(q,Akari.makeDefaultAssetStore());},c.id);
      await p.locator('#fileInput').setInputFiles({name:'guided.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});
      await p.waitForFunction(id=>document.querySelector('#loseConfirmModal.show')||Akari.app.project.name==='意味の入力 '+id,c.id);
      if(await p.locator('#loseConfirmModal.show').isVisible())await p.locator('#loseConfirmProceed').click();
      await p.waitForFunction(id=>Akari.app.project.name==='意味の入力 '+id&&Akari.app.editorState.state==='DESIGN'&&!document.querySelector('#fileInput').value,c.id);
      await p.locator('#uiLevel').selectOption('advanced');await select(p,'sprite-1');await mode(p,'code');await p.evaluate(()=>{window.choiceStarts=0;window.choiceSaid=[];});
      await p.locator('#codeEditor').fill(c.source);await p.waitForTimeout(400);
      const directChoice=c.id==='repeat-turn'||c.id==='list-replace';
      if(!directChoice)await p.locator('#runBtn').click();
      const pending=await fingerprint(p),choices=p.locator('[data-intent-choice]'),labels=await choices.allTextContents();assert.equal(labels.length,2);assert.equal(await p.evaluate(()=>choiceStarts),0);
      const chosen=choices.nth(c.choice);await chosen.click();let cancelled=false,detachedRefused=false,invalidRejected=[];
      if(c.value){
        const field=p.locator('[data-intent-input] input'),apply=p.locator('[data-intent-apply]');
        assert.equal(await field.inputValue(),'');assert.equal(await apply.isDisabled(),true);assert.deepEqual(await fingerprint(p),pending);
        assert.equal(await p.locator('[data-intent-input] strong').innerText(),labels[c.choice]);
        assert.ok((await p.locator('[data-intent-input]').getAttribute('aria-label')).includes(labels[c.choice]));
        for(const value of ['', 'Infinity','1e2','0/0',...(c.id==='list-replace'?['0','-1','1.5','2.0000000000000001','9007199254740993']:[])]){await field.fill(value);assert.equal(await apply.isDisabled(),true);invalidRejected.push(value);}
        await field.fill(c.value);await p.evaluate(()=>window.cancelledChoiceApply=document.querySelector('[data-intent-apply]').onclick);
        await p.locator('[data-intent-input-cancel]').click();await p.evaluate(()=>cancelledChoiceApply());assert.deepEqual(await fingerprint(p),pending);assert.equal(await p.locator('#codeEditor').inputValue(),c.source);cancelled=detachedRefused=true;
        await chosen.click();await field.fill(c.value);await chosen.focus();await field.click();assert.equal(await field.evaluate(e=>document.activeElement===e),true);await field.press('Home');assert.equal(await field.evaluate(e=>e.selectionStart),0);await apply.click();
      }
      const after=await fingerprint(p);assert.equal(after.source,c.expected,c.id+' confirmed meaning source');assert.equal(after.history,pending.history+1);assert.equal(await p.evaluate(()=>choiceStarts),0);
      const expectedProject=JSON.parse(pending.project);expectedProject.scripts[0].source=c.expected;assert.deepEqual(JSON.parse(after.project),expectedProject);
      await p.locator('#undoBtn').click();assert.equal((await fingerprint(p)).project,pending.project);await p.locator('#redoBtn').click();assert.equal((await fingerprint(p)).project,after.project);
      await mode(p,'blocks');await mode(p,'code');assert.equal((await fingerprint(p)).project,after.project);
      await p.locator('#runBtn').click();await p.waitForFunction(()=>choiceStarts===1&&window.choiceScheduler&&choiceScheduler.tasks.size===0);
      const runtime=await p.evaluate(()=>{const r=choiceScheduler.runtime,a=r.actor('sprite-1');return {position:[a.x,a.y],list:structuredClone(r.projectLists.get('持ち物')),said:structuredClone(choiceSaid)};});
      if(c.position)c.position.forEach((v,i)=>assert.ok(Math.abs(runtime.position[i]-v)<1e-7));if(c.list)assert.deepEqual(runtime.list,c.list);
      assert.deepEqual(runtime.said,c.id.startsWith('repeat')?[{id:'sprite-1',text:'おわり'}]:[],'a following statement executes once outside the chosen repeat');
      await pressStop(await reveal(p.locator('#stopBtn')));assert.equal((await fingerprint(p)).project,after.project);
      variants.push({id:c.id,labels,choice:c.choice,directChoice,source:c.expected,beforeProject:JSON.parse(pending.project),afterProject:JSON.parse(after.project),noAutomaticExecution:true,cancelled,detachedRefused,invalidRejected,undoRedo:true,modeRoundtrip:true,runtime});
    }
    await callable(p,'Action');await p.locator('#callableCode').press('Tab');await p.locator('#callableCode').fill('持ち物に「かさ」を入れる。');
    const draftChoices=p.locator('#callablePending [data-intent-choice]');await draftChoices.nth(1).waitFor();
    const draftPending=await fingerprint(p);await draftChoices.nth(1).click();
    const draftInput=p.locator('#callablePending [data-intent-input] input');assert.equal(await draftInput.inputValue(),'');
    assert.equal(await draftInput.evaluate(e=>document.activeElement===e),true);assert.deepEqual(await fingerprint(p),draftPending);
    await p.locator('#callablePending [data-intent-input-cancel]').click();assert.deepEqual(await fingerprint(p),draftPending);
    assert.equal(await p.locator('#callableCode').inputValue(),'持ち物に「かさ」を入れる。');
    const beforeRepair=await fingerprint(p),draftSource='10歩進む。\r\n右に曲がる。\r\n4回くり返す。\r\n「おわり」と言う。',
      repairedDraft='4回くり返す。\n  10歩進む。\n  右に90度回る。\r\n「おわり」と言う。';
    await p.locator('#callableCode').fill(draftSource);await draftChoices.first().click();
    await draftInput.fill('90');await p.locator('#callablePending [data-intent-apply]').click();
    const applied=await fingerprint(p);assert.equal(applied.draft.source,repairedDraft);assert.equal(applied.history,beforeRepair.history+1);assert.equal(applied.project,beforeRepair.project);
    assert.equal(await p.locator('#procModal #undoBtn').count(),1);assert.equal(await p.locator('#procModal #redoBtn').count(),1);
    await p.locator('#undoBtn').click();const undone=await fingerprint(p);assert.deepEqual(undone.draft,beforeRepair.draft);assert.equal(undone.project,beforeRepair.project);
    await p.locator('#redoBtn').click();const redone=await fingerprint(p);assert.deepEqual(redone.draft,applied.draft);assert.equal(redone.project,applied.project);
    await p.locator('#procClose').click();assert.equal(await p.locator('#procModal :is(#undoBtn,#redoBtn)').count(),0);assert.equal(await p.locator('#undoBtn').count(),1);assert.equal(await p.locator('#redoBtn').count(),1);
    return {variants,callableFirstNativeClick:true,callableCancelPreserved:true,callableHistory:{sourceBefore:beforeRepair.draft.source,sourceAfter:applied.draft.source,sourceUndo:undone.draft.source,sourceRedo:redone.draft.source,oneEdit:true,bothInside:true,returnedHome:true,unchangedMain:true}};
  },
  async 'UI-BUTTON-SOURCE-NAV'(p) {
    for(const m of ['code','blocks']) {
      await mode(p,m); await select(p,'stage');
      const row=p.locator('#projectTree [tabindex="0"]');await row.focus();await p.keyboard.press('Enter');
      assert.equal(await p.evaluate(()=>document.activeElement?.closest('#projectTree')!==null),true,'part selection keeps keyboard focus in the part list');
      const before=await fingerprint(p);
      await visible(p,'#sourceOverviewBtn'); assert.equal(await p.locator('#sourceOverviewBtn').innerText(),'すべての本文');
      await visible(p,'#sourceEditBtn',false); await visible(p,'#sourceStageBtn',false);
      await click(p,'#sourceOverviewBtn'); await visible(p,'#sourceOverview'); await visible(p,'#sourceOverviewBtn',false); await visible(p,'#sourceEditBtn');
      assert.equal(await p.locator('#sourceEditBtn').innerText(),'本文を なおす ところへ もどる'); await click(p,'#sourceEditBtn'); assert.deepEqual(await fingerprint(p),before);
      await select(p,'sprite-1'); await visible(p,'#sourceStageBtn'); assert.equal(await p.locator('#sourceStageBtn').innerText(),'画面の本文');
      await click(p,'#sourceOverviewBtn'); await visible(p,'#sourceStageBtn'); await click(p,'#sourceStageBtn');
      assert.equal(await p.locator('#objectSelect').inputValue(),'stage'); await visible(p,'#sourceStageBtn',false);
    }
    return {modes:2,sameStateDuplicates:0,viewOnlyFingerprintPreserved:true};
  },
  async 'UI-BUTTON-BASIC-HISTORY'(p) {
    await p.locator('#uiLevel').selectOption('basic'); await body(p); const initial=await fingerprint(p);
    await visible(p,'#undoBtn'); await visible(p,'#redoBtn'); assert.equal(await p.locator('#redoBtn').isDisabled(),true);
    await fill(p,'1を言う。'); const one=await fingerprint(p); assert.ok(one.history>initial.history);
    await click(p,'#undoBtn'); assert.equal((await fingerprint(p)).source,initial.source);
    await click(p,'#redoBtn'); assert.equal((await fingerprint(p)).source,'1を言う。');
    await mode(p,'blocks'); const before=await fingerprint(p); await number(p).fill('2'); await number(p).press('Enter');
    assert.equal((await fingerprint(p)).source,'2を言う。'); assert.equal((await fingerprint(p)).history,before.history+1);
    await click(p,'#undoBtn'); assert.equal((await fingerprint(p)).source,'1を言う。'); await click(p,'#redoBtn'); assert.equal((await fingerprint(p)).source,'2を言う。');
    // Enter on the last redo disables it; the keys still belong to an enabled control or the body.
    await click(p,'#undoBtn');await p.locator('#redoBtn').focus();await p.keyboard.press('Enter');
    assert.equal((await fingerprint(p)).source,'2を言う。');assert.equal(await p.evaluate(()=>document.activeElement===document.body),false);
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
    await mode(p,'code');const projectBefore=(await fingerprint(p)).project;
    for(const label of ['はば','高さ']){const field=p.locator('#properties input[aria-label="'+label+'"]');await field.fill(label==='はば'?'300.5':'200.5');await field.press('Tab');assert.ok((await p.locator('#statusText').innerText()).includes('小数の ない 数'));}
    assert.equal((await fingerprint(p)).project,projectBefore);const refusalLog=await p.locator('#console').textContent();assert.match(refusalLog,/して ください/);assert.doesNotMatch(refusalLog,/してください|❌  /);
    return {plainCodeLabels:true,blockFolding:true,actionsOutsideFold:true,duplicateDelete:true,fractionRefusedWithFormalSpacedLog:true};
  },
  async 'UI-BUTTON-LEVELS'(p) {
    // The levels offered follow the view; a level that cannot be chosen is not in the list (not a disabled option).
    const offered=()=>p.locator('#uiLevel option').evaluateAll(es=>es.map(e=>e.value+(e.disabled?'(disabled)':'')));
    await mode(p,'code'); assert.deepEqual(await offered(),['basic','advanced','meijin']);
    await mode(p,'blocks'); assert.deepEqual(await offered(),['entry','basic','advanced']);
    for(const level of ['basic','advanced']) { await p.locator('#uiLevel').selectOption(level); assert.equal(await p.evaluate(()=>document.body.dataset.uiLevel),level); await p.reload(); assert.equal(await p.locator('#uiLevel').inputValue(),level); }
    // A stored value that is not one of the levels counts as no setting the work can use; it goes on at かんたん.
    await p.evaluate(()=>localStorage.setItem('akari.uiLevel.v1','all')); await p.reload(); assert.equal(await p.locator('#uiLevel').inputValue(),'basic');
    return {levels:['basic','advanced'],perView:true,unknownStored:'basic',reload:true};
  },
  async 'UI-BUTTON-PENDING'(p) {
    await fill(p,'1を言う。'); await mode(p,'blocks'); const mainBefore=await fingerprint(p);
    await number(p).fill('bad'); await number(p).press('Enter'); assert.equal(await number(p).getAttribute('aria-invalid'),'true'); assert.deepEqual(await fingerprint(p),mainBefore); await click(p,'#blockEditor [data-blockui-action="cancel"]'); assert.deepEqual(await fingerprint(p),mainBefore);
    await number(p).fill('4'); await visible(p,'#blockEditor [data-blockui-action="commit"]'); await click(p,'#blockEditor [data-blockui-action="cancel"]'); assert.deepEqual(await fingerprint(p),mainBefore);
    await number(p).fill('5'); await click(p,'#blockEditor [data-blockui-action="commit"]'); assert.equal((await fingerprint(p)).source,'5を言う。'); assert.equal((await fingerprint(p)).history,mainBefore.history+1); await settledHidden(p.locator('#blockEditor [data-blockui-action="commit"]')); await visible(p,'#blockEditor [data-blockui-action="commit"]',false);
    await callable(p); await visible(p,'#callableCancel',false); await visible(p,'#callablePending',false);
    await chooseView(p,'blocks',{prefix:'callable',reveal}); const before=await fingerprint(p), n=number(p,'#callableBlocks');
    await n.fill('invalid'); await n.press('Enter'); assert.equal(await n.getAttribute('aria-invalid'),'true'); await visible(p,'#callableBlocks [data-blockui-action="cancel"]'); assert.deepEqual(await fingerprint(p),before);
    await click(p,'#callableBlocks [data-blockui-action="cancel"]'); assert.deepEqual(await fingerprint(p),before); assert.equal(await number(p,'#callableBlocks').inputValue(),'1');
    await p.locator('#callableName').fill('長'.repeat(501)); await visible(p,'#callablePending'); await visible(p,'#callableCancel'); assert.deepEqual(await fingerprint(p),before); await click(p,'#callableCancel'); assert.deepEqual(await fingerprint(p),before); await visible(p,'#callableCancel',false);
    await number(p,'#callableBlocks').fill('2'); await number(p,'#callableBlocks').press('Enter'); await visible(p,'#callableCancel',false);
    assert.equal(await p.evaluate(()=>Akari.app.project.functions.length),0); assert.equal((await fingerprint(p)).hasDraft,true);
    await click(p,'#callableSave'); assert.equal(await p.evaluate(()=>Akari.app.project.functions.length),1); assert.equal(await p.evaluate(()=>Akari.app.project.functions[0].source),'2を答えとして返す。');
    return {invalidInputCancelable:true,validDraftCancelHidden:true,registrationSeparate:true,observationControls:await hiddenObservationControls(p)};
  },
  async 'UI-BUTTON-BLOCK-DESTINATION'(p) {
    await fill(p,'1を言う。'); await mode(p,'blocks');
    await p.locator('#blockEditor .blockui-extra > summary').first().click();
    const pageErrors=[],rememberError=e=>pageErrors.push(e.message);p.on('pageerror',rememberError);
    const room=await p.locator('#blockEditor .blockui-workspace').boundingBox();
    await p.mouse.move(room.x+room.width-20,room.y+room.height/2);await p.mouse.wheel(0,80);
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    p.off('pageerror',rememberError);assert.deepEqual(pageErrors,[],'scrolling an open extra panel never calls the actions-panel placer');
    const place=p.locator('#blockEditor [data-blockui-action="body-insert"]').first();
    assert.notEqual(await place.evaluate(e=>getComputedStyle(e).pointerEvents),'none','an open panel does not disable uncovered insertion places');
    await place.click();assert.ok(await p.locator('#blockEditor .blockui-chosen-destination').count());await p.keyboard.press('Escape');
    assert.equal(await p.locator('#blockEditor .blockui-extra[open]').count(),0);
    for(const root of ['#blockEditor','#callableBlocks']) {
      if(root==='#callableBlocks') { await callable(p); await chooseView(p,'blocks',{prefix:'callable',reveal}); }
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
    if(root==='#blockEditor') { await fill(p,'1を言う。\n2を言う。\n3を言う。'); await mode(p,'blocks'); } else { await callable(p,'Action'); await p.locator('#callableCode').fill('1を言う。\n2を言う。\n3を言う。'); await p.waitForTimeout(350); await chooseView(p,'blocks',{prefix:'callable',reveal}); } const before=await fingerprint(p);
    const insertions=p.locator(root+' .blockui-script > .blockui-node-content > .blockui-body > [data-blockui-action="body-insert"]'); assert.equal(await insertions.count(),4,'three statements need four insertion boundaries');
    const sizes=[]; for(let i=0;i<4;i++) { const b=insertions.nth(i); assert.equal(await b.isVisible(),true); const r=await reachable(b); assert.ok(r.width>=24&&r.height>=(i===3?24:8),i===3?'minimum pointer target 24px':'a place between blocks is a thin line (E-07)'); sizes.push(r); assert.ok(await p.locator(root+' .blockui-chosen-destination').count()); await p.keyboard.press('Escape'); }
    assert.deepEqual(await fingerprint(p),before); assert.ok(await p.locator(root+' [data-blockui-drag="node"]').count()>=3,'drag alternative remains available');
    await insertions.last().click(); await p.locator(root+' [data-blockui-action="palette-category"][data-blockui-category="'+'look'+'"]').click(); await p.locator(root+' [data-blockui-schema="'+'Say'+'"]').click();
    assert.equal(await p.locator(root+' .blockui-node[data-schema-id="'+'Say'+'"]').count(),4); assert.equal((await fingerprint(p)).history,before.history+1);
    roots.push({root,boundaries:4,sizes,pointerInsertion:true,dragAlternative:true});
    }
    const touchContext=await p.context().browser().newContext({offline:true,hasTouch:true,viewport:{width:1024,height:768}}),errors=[],network=[];
    try { await touchContext.route(/^https?:/,route=>{network.push(route.request().url());return route.abort();}); const t=await touchContext.newPage(); t.on('pageerror',e=>errors.push(e.message)); await t.goto(pathToFileURL(path.resolve(currentProductFile())).href); await t.waitForFunction(()=>!!globalThis.Akari?.app); await installRegressionProject(t); await select(t,'stage'); await fill(t,'1を言う。'); await mode(t,'blocks'); const before=await fingerprint(t);
      async function tap(l) { await l.scrollIntoViewIfNeeded(); const r=await l.boundingBox(); assert.ok(r&&r.width>=24&&r.height>=24); await t.touchscreen.tap(r.x+r.width/2,r.y+r.height/2); }
      // A finger taps 「＋ ここに入れる」; a place between blocks is a thin line until a block is selected (E-07).
      await tap(t.locator('#blockEditor [data-blockui-action="body-insert"]').last()); assert.ok(await t.locator('#blockEditor .blockui-chosen-destination').count()); await tap(t.locator('#blockEditor [data-blockui-action="cancel"]')); assert.equal(await t.locator('#blockEditor .blockui-chosen-destination').count(),0); assert.deepEqual(await fingerprint(t),before);
    } finally { await touchContext.close(); } assert.deepEqual(errors,[]); assert.deepEqual(network,[]); return {roots,touch:true};
  },
  async 'UI-BUTTON-BLOCK-COMMANDS'(p) {
    const roots=[]; for (const root of ['#blockEditor','#callableBlocks']) {
    if(root==='#blockEditor') { await fill(p,'1を言う。\n2を言う。\n3を言う。'); await mode(p,'blocks'); } else { await callable(p,'Action'); await p.locator('#callableCode').fill('1を言う。\n2を言う。\n3を言う。'); await p.waitForTimeout(350); await chooseView(p,'blocks',{prefix:'callable',reveal}); }
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
      await p.setViewportSize(viewport); await fill(p,'1を言う。');
      for(const m of ['code','blocks']) { await mode(p,m); const before=await fingerprint(p); await reachable(p.locator('#sourceOverviewBtn')); await reachable(p.locator('#sourceEditBtn')); assert.deepEqual(await fingerprint(p),before); await reachable(p.locator('#undoBtn')); await reachable(p.locator('#redoBtn')); }
      await U.openNodeMenu(p.locator('#blockEditor .blockui-node[data-schema-id="Say"]').first()); const command=p.locator('#blockEditor .blockui-node[data-schema-id="Say"]').first().locator(':scope > .blockui-node-head [data-blockui-action="duplicate"]'); await reachable(command); assert.equal(await p.locator('#blockEditor .blockui-node[data-schema-id="Say"]').count(),2);
      const toggle=p.locator('.properties-window .blockui-side-toggle'); await reachable(toggle); const expanded=await toggle.getAttribute('aria-expanded'); await reachable(toggle); assert.notEqual(await toggle.getAttribute('aria-expanded'),expanded); evidence.push(viewport);
    }
    const paletteRecovery=[];
    for(const width of [760,390,320]) {
      await p.setViewportSize({width,height:844}); await fill(p,'「こんにちは」と2秒話す。'); await mode(p,'blocks');
      const text=()=>p.locator('#blockEditor .blockui-world input[aria-label="文字"]'),
        palette=p.locator('#blockEditor .blockui-palette'),
        library=p.locator('#blockEditor [data-blockui-action="library-toggle"]');
      await text().fill('おはよう'); await text().press('Enter'); const committed=await fingerprint(p);
      assert.equal(await palette.isVisible(),false,'narrow text editing temporarily hides the palette');
      await library.click(); assert.equal(await palette.isVisible(),true,'one click recovers the hidden palette');
      assert.equal(await library.getAttribute('aria-expanded'),'true'); assert.deepEqual(await fingerprint(p),committed);
      await library.click(); assert.equal(await palette.isVisible(),false); await library.click(); assert.equal(await palette.isVisible(),true);
      await text().fill('いってきます'); await library.click();
      assert.equal(await palette.isVisible(),true); assert.equal((await fingerprint(p)).source,'「いってきます」と2秒話す。');
      assert.equal((await fingerprint(p)).history,committed.history+1,'pending text commits once when returning to the palette');
      const beforeComposition=await fingerprint(p);
      await text().focus(); await text().dispatchEvent('compositionstart'); await text().fill('まだ変換中');
      await library.click(); assert.equal(await palette.isVisible(),false,'composition must be completed before leaving text editing');
      assert.equal(await text().inputValue(),'まだ変換中'); assert.equal((await fingerprint(p)).source,beforeComposition.source);
      assert.equal((await fingerprint(p)).history,beforeComposition.history);
      await text().dispatchEvent('compositionend'); await text().press('Enter'); await library.click();
      assert.equal(await palette.isVisible(),true); assert.equal((await fingerprint(p)).source,'「まだ変換中」と2秒話す。');
      paletteRecovery.push({width,oneClickRecovery:true,committedStatePreserved:true,pendingTextCommittedOnce:true,syntheticCompositionPreserved:true});
    }
    await p.setViewportSize({width:390,height:844});await p.locator('#uiLevel').selectOption('basic');await fill(p,'右に15度回る。\n1秒待つ。\n前へ10歩進む。');await mode(p,'blocks');
    for(let i=0;i<3;i++)await p.locator('#blockEditor [data-blockui-action="zoom-in"]').click();
    await p.locator('#blockEditor .blockui-extra > summary').first().click();await p.waitForTimeout(100);
    const panel=p.locator('#blockEditor .blockui-extra[open] > .blockui-extra-controls'),contained=()=>panel.evaluate(e=>{const r=e.getBoundingClientRect(),w=e.closest('.blockui-workspace').getBoundingClientRect();return r.left>=w.left&&r.right<=w.right&&r.top>=w.top&&r.bottom<=w.bottom;});assert.equal(await contained(),true,'a panel at 200% fits the narrow workspace');
    for(const field of await panel.locator('button,input,select').all()){await field.scrollIntoViewIfNeeded();await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await field.evaluate(e=>{const r=e.getBoundingClientRect(),w=e.closest('.blockui-workspace').getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.left>=w.left&&r.right<=w.right&&r.top>=w.top&&r.bottom<=w.bottom&&(e===hit||e.contains(hit));}),true,'each zoomed panel control fits and can be pressed');}
    await p.keyboard.press('Escape');
    await p.setViewportSize({width:1366,height:768});
    await select(p,'sprite-1');
    await fill(p,'画面の左下のはしから、右へ320歩のばしょへ行く。');await mode(p,'blocks');
    const notice=p.locator('#blockEditor [data-blockui-action="notices"]').first();
    await notice.focus();await p.keyboard.press('Enter');
    const corrections=p.locator('#blockEditor .blockui-node-notices.blockui-open button');assert.equal(await corrections.count(),2);
    const reached=[];for(let i=0;i<16&&reached.length<2;i++){
      await p.keyboard.press('Tab');
      for(let j=0;j<2;j++)if(!reached.includes(j)&&await corrections.nth(j).evaluate(e=>e===document.activeElement))reached.push(j);
    }
    assert.deepEqual(reached,[0,1],'native Tab reaches both notice corrections');
    await p.keyboard.press('Enter');await p.waitForFunction(()=>Akari.app.editorState.main.sourceText.includes('上へ0歩'));
    return {viewports:evidence,ordinaryScrolling:true,navigationUndoRedoCommandsAndFold:true,paletteRecovery,zoomedPopoverContained:true};
  },
};
assert.deepEqual(Object.keys(cases),uiButtonIds);
// Isolate fixture/browser failures; retain the original 360-second suite budget.
let version;const suiteStarted=Date.now();
for(const [id,run] of Object.entries(cases)) {
  let phase='browser-start',failure;
  try {
    const evidence=await withBrowser(browserPath,async b=> {
      const actual=b.version();if(version)assert.equal(actual,version);version=actual;
      phase='page-start';
      return pageFor(b,currentProductFile(),async p=> {
        try {
          p.on('dialog',d=>d.accept());await answerProductConfirms(p,true);await p.setViewportSize({width:1440,height:1000});
          phase='fixture-import';await installRegressionProject(p);
          phase='select-stage';await select(p,'stage');
          phase='button-actions';return await run(p);
        } catch(error) {
          // Capture before pageFor's context.close, which may itself stall.
          failure={phase,detail:error.stack};console.error(id+' '+phase+': '+error.stack);throw error;
        }
      });
    },Math.max(1,360000-(Date.now()-suiteStarted)));
    results.push({id,status:'PASS',pass:true,detail:'PASS',evidence});
  } catch(error) {
    results.push({id,status:'FAIL',pass:false,phase:failure?.phase||phase,detail:failure?.detail||error.stack,
      ...(failure&&failure.detail!==error.stack?{hostFailure:error.stack}:{})});
  }
  console.log(results.at(-1).status+' '+id);if(!results.at(-1).pass)console.error(results.at(-1).detail);
}
assert.deepEqual(snapshot(currentProductFile()),inputs,'test must not modify product inputs');
const report={schema:'akari-ui-buttons-v1',status:results.every(r=>r.pass)?'PASS':'FAIL',environment:'chromium',browser:version,snapshot:inputs,total:results.length,results,pageErrors:[],networkRequests:[]};
fs.mkdirSync(path.dirname(output),{recursive:true}); fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
assert.equal(report.status,'PASS',results.filter(r=>!r.pass).map(r=>r.id+': '+r.detail).join('\n'));
