import { currentProductFile, currentProductVersion } from "./../lib/product-path.cjs";
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {snapshot,sha,withBrowser,pageFor} from '../lib/product-test-host.mjs';
import U from '../browser/cases/ui-routes.cjs';
import {openPaletteTools} from '../browser/cases/regression-setup.cjs';
import {verifySurfaceResults} from '../lib/verify-surface-results.mjs';
import {pressStop} from '../lib/stop-press.cjs';
const [browser,output]=process.argv.slice(2), product=currentProductFile(), before=snapshot(product);
if(!output||fs.existsSync(output))throw Error('Supply a new output path');
const dir=path.dirname(output);fs.mkdirSync(dir,{recursive:true});
const require=createRequire(import.meta.url);
const {makeRegressionProject}=require('../fixtures/regression-project.cjs');
const {loadApi}=require('../browser/cases/audit-lib.cjs');
const {answerProductConfirms}=require('../lib/product-dialogs.cjs');
const autosaved='このパソコンに のこしたよ',autosaveDatabase='akari-workspace-f5',autosaveFallback='akari.autosave.f5';
const regressionProject=makeRegressionProject(loadApi(fs.readFileSync(product,'utf8')));
regressionProject.scripts=[{targetId:'stage',event:'start',source:'何もしない。'}];
regressionProject.actions=[];regressionProject.functions=[];
const regressionFixture=path.join(dir,'editor-surface-regression.akari.md');
fs.writeFileSync(regressionFixture,loadApi(fs.readFileSync(product,'utf8')).serializeProject(regressionProject));
let browserVersion;
async function reveal(l){
  if(!await l.isVisible())for(const panel of await l.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())await panel.locator('.blockui-side-toggle').click();
  for(const d of await l.locator('xpath=ancestor::details[not(@open)]').all())await d.locator(':scope > summary').click();
  return l;
}
const click=async(p,id)=>(await reveal(p.locator('#'+id))).click();
const mode=(p,m)=>click(p,'editorMode'+m);
const state=p=>p.evaluate(()=>{const s=Akari.app.editorState;return{source:s.main.sourceText,history:s.history,redo:s.redo,dirty:s.dirty,project:JSON.stringify(Akari.app.project),hasDraft:s.hasDraft,draft:s.callableDraft};});
const fill=async(p,s)=>{await openBodyForTest(p);if(await p.locator('body').getAttribute('data-editor-mode')!=='code')await mode(p,'code');const history=(await state(p)).history;await (async()=>{const control=await reveal(p.locator('#codeEditor')); await openBodyForTest(control.page()); return control.fill(s);})();await p.waitForFunction(({s,history})=>Akari.app.editorState.main.sourceText===s&&Akari.app.editorState.history>history,{s,history});};
const number=p=>p.locator('#blockEditor .blockui-node[data-schema-id="NumberLiteral"] [data-blockui-field="value"]').first();
const source='※ 😀é 前  \n点数を3にする。 ※ 初期  \n\nもし点数が3と同じなら、点数に2を足す。 ※ 本文  \nそうでなければ、点数から1を引く。\n点数  の値を言う。 ※ 後  \n';
const results=[];
await withBrowser(browser,async b=>{
  browserVersion=b.version();
  const run=async(id,fn)=>{
    try{const evidence=await pageFor(b,product,async p=>{p.on('dialog',d=>d.accept());await answerProductConfirms(p,true);await (await reveal(p.locator('#uiLevel'))).selectOption('advanced');if(id!=='RELEASE-GUI/corrupt-autosave-preserves-current'){await p.locator('#fileInput').setInputFiles(regressionFixture);await p.waitForFunction(name=>Akari.app.project.name===name,regressionProject.name);}await (await reveal(p.locator('#uiLevel'))).selectOption('advanced');await (await reveal(p.locator('#objectSelect'))).selectOption('stage');await (await reveal(p.locator('#eventSelect'))).selectOption('start');return fn(p);});results.push({id,status:'PASS',evidence});}
    catch(e){results.push({id,status:'FAIL',detail:e.stack});}
    console.log(id+': '+results.at(-1).status);
  };
  await run('RELEASE-GUI/source-selection-history-focus',async p=>{
    await fill(p,source);const initial=await state(p);
    const selection=source.indexOf('2を');await p.locator('#codeEditor').evaluate((t,n)=>t.setSelectionRange(n,n+1),selection);
    for(let i=0;i<3;i++){await mode(p,'blocks');await mode(p,'code');}
    assert.deepEqual(await state(p),initial);
    assert.deepEqual(await p.locator('#codeEditor').evaluate(t=>[t.selectionStart,t.selectionEnd,document.activeElement===t]),[selection,selection+1,true]);
    await mode(p,'blocks');await number(p).fill('7');await number(p).press('Enter');
    const changed=source.replace('点数を3','点数を7');assert.equal((await state(p)).source,changed);assert.equal((await state(p)).history,initial.history+1);
    assert.ok(await number(p).evaluate(t=>document.activeElement===t));
    await click(p,'undoBtn');assert.equal((await state(p)).source,source);await click(p,'redoBtn');assert.equal((await state(p)).source,changed);
    const glide='3秒かけて、画面の左下のはしから、右へ3歩、上へ3歩のばしょへ行く。';
    await mode(p,'code');await fill(p,glide);
    const at=glide.indexOf('右へ3')+'右へ'.length;await p.locator('#codeEditor').evaluate((t,n)=>t.setSelectionRange(n,n+1),at);await mode(p,'blocks');
    const selected=await p.evaluate(()=>{const s=Akari.app.editorState.main;return s.nodeMap.get(s.blockSelection).path;});
    assert.deepEqual(selected,['body',0,'x','value']);
    const nativeHistory=[];
    for(const editorMode of ['code','blocks']){
      await mode(p,editorMode);
      if(editorMode==='blocks')await openPaletteTools(p.locator('#blockEditor'));
      const search=await reveal(p.locator(editorMode==='code'?'#hintSearch':'#blockEditor [data-blockui-search]'));
      await search.fill('');
      const unchanged=await state(p);
      await search.focus();await p.keyboard.insertText('test');
      await search.press('Control+z');assert.equal(await search.inputValue(),'');
      assert.deepEqual(await state(p),unchanged,'search undo must preserve project, source and history');
      await search.press('Control+y');assert.equal(await search.inputValue(),'test');
      assert.deepEqual(await state(p),unchanged,'search redo must preserve project, source and history');
      nativeHistory.push(editorMode+'-search');
    }
    await fill(p,'「最初」と言う。');await mode(p,'blocks');
    const literal=p.locator('#blockEditor .blockui-node[data-schema-id="StringLiteral"]').first();
    await literal.locator('[data-blockui-field="value"]').click();
    await literal.locator('[data-blockui-action="edit-text"]').click();
    const text=p.locator('.blockui-text-dialog textarea'),beforeText=await state(p);
    await text.press('Control+End');await p.keyboard.insertText('new');
    await text.press('Control+z');assert.equal(await text.inputValue(),'最初');
    assert.deepEqual(await state(p),beforeText,'full-text undo must stay in the open dialog');
    await text.press('Control+y');assert.equal(await text.inputValue(),'最初new');
    assert.deepEqual(await state(p),beforeText,'full-text redo must not commit the pending field');
    await p.locator('[data-blockui-text-action="cancel"]').click();
    assert.deepEqual(await state(p),beforeText);
    nativeHistory.push('full-text-dialog');
    await mode(p,'code');await fill(p,'「変更」と言う。');
    await p.locator('#codeEditor').press('Control+z');assert.equal((await state(p)).source,'「最初」と言う。');
    await p.locator('#codeEditor').press('Control+y');assert.equal((await state(p)).source,'「変更」と言う。');
    const eventHistory=[];
    for(const editorMode of ['code','blocks'])for(const route of ['selector','overview']){
      await mode(p,'code');await p.locator('#eventSelect').selectOption('click');
      const label=editorMode+' '+route,original='「クリック '+label+'」と言う。',changed='「編集 '+label+'」と言う。';
      await fill(p,original);
      const owner=await p.evaluate(()=>Akari.app.editorState.main.ownerKey);
      const chooseClick=async()=>{
        if(route==='selector')await p.locator('#eventSelect').selectOption('click');
        else{await click(p,'sourceOverviewBtn');await p.locator('[data-source-edit="'+owner+'"]').click();}
      };
      await p.locator('#eventSelect').selectOption('start');
      await fill(p,'「開始 '+label+'」と言う。');await mode(p,editorMode);
      const navigation=await state(p);await chooseClick();
      const beforeEdit=await state(p);
      assert.equal(beforeEdit.source,original);assert.equal(beforeEdit.history,navigation.history);assert.equal(beforeEdit.redo,navigation.redo);
      if(editorMode==='code')await fill(p,changed);
      else{
        const field=p.locator('#blockEditor .blockui-node[data-schema-id="StringLiteral"] [data-blockui-field="value"]').first();
        await field.fill('編集 '+label);await field.press('Enter');
      }
      await click(p,'undoBtn');assert.equal((await state(p)).source,original);assert.equal(await p.locator('#eventSelect').inputValue(),'click');
      assert.equal((await state(p)).project,beforeEdit.project);
      const undone=await state(p);
      await p.locator('#eventSelect').selectOption('start');await chooseClick();
      assert.equal((await state(p)).history,undone.history);assert.equal((await state(p)).redo,undone.redo);
      await click(p,'redoBtn');assert.equal((await state(p)).source,changed);assert.equal(await p.locator('#eventSelect').inputValue(),'click');
      eventHistory.push({mode:editorMode,route});
    }
    return{roundtrips:3,exactSource:true,selection,sharedHistory:true,focus:true,nativeHistory,codeKeyboardUndoRedo:true,eventHistory};
  });
  await run('RELEASE-GUI/condition-connective-local-edit',async p=>{
    const source='3が8より小さいあいだ、くり返す。 ※ 頭  \n  点数に3を足す。 ※ 本文  \n「😀」 と言う。\n';
    await fill(p,source);await mode(p,'blocks');
    const before=await state(p);await number(p).fill('4');await number(p).press('Enter');
    const after=await state(p);assert.equal(after.source,source.replace('3が','4が'));
    assert.equal(after.history,before.history+1);
    await p.keyboard.press('Control+z');assert.equal((await state(p)).source,source);
    await p.keyboard.press('Control+y');assert.equal((await state(p)).source,after.source);
    await mode(p,'code');assert.equal(await p.locator('#codeEditor').inputValue(),after.source);
    return {sourcePreserved:true,oneHistory:true,undoRedo:true};
  });
  await run('RELEASE-GUI/else-surface-branch-position',async p=>{
    const cases=[];
    for(const lead of ['そうでなければ'])for(const ending of ['、','、（2）の値を言う。']){
      const inline=ending==='、（2）の値を言う。',header=lead+ending+' ※ 枝  ',
        source='もし条件（条件の答え（あてはまらない））が成り立つなら、（1）の値を言う。\n※ でなければ、次のことをする\n'+header+(inline?'':'\n  （2）の値を言う。')+'\n（3）の値を言う。',
        at=source.indexOf(header);
      await fill(p,source);const before=await state(p);
      await p.locator('#codeEditor').evaluate((t,n)=>{t.focus();t.setSelectionRange(n,n);},at);
      await mode(p,'blocks');
      const branch=p.locator('#blockEditor [data-blockui-body-wrapper="elseBody"]');
      assert.equal(await branch.getAttribute('data-source-line'),'3');
      assert.equal(await branch.evaluate(e=>document.activeElement===e),true);
      assert.equal(await p.evaluate(()=>Akari.app.editorState.main.blockSelectionLocation?.body),'elseBody');
      assert.deepEqual(await state(p),before);
      await mode(p,'code');assert.equal(await p.locator('#codeEditor').evaluate(t=>t.selectionStart),at);
      if(inline){
        await p.locator('#codeEditor').evaluate((t,n)=>t.setSelectionRange(n,n),at+lead.length+1);
        await mode(p,'blocks');
        assert.equal(await p.evaluate(()=>Akari.app.editorState.main.blockSelectionLocation),null);
        assert.equal(await p.locator('#blockEditor .blockui-selected').getAttribute('data-schema-id'),'Say');
        await mode(p,'code');
      }
      cases.push({lead,ending,headerLine:3,sourceHistoryPreserved:true,inlineBodyDistinguished:inline});
    }
    return{cases,commentLookalikeIgnored:true};
  });
  await run('RELEASE-GUI/inline-ime',async p=>{
    await fill(p,'もし条件（条件の答え（あてはまる））が成り立つなら、点数に3を足す。 ※ 末尾  ');const initial=await state(p);
    await p.locator('#codeEditor').dispatchEvent('compositionstart');
    await p.locator('#codeEditor').evaluate(t=>{t.value=t.value.replace('3を','4を');t.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));});
    await mode(p,'blocks');assert.deepEqual(await state(p),initial);
    await p.locator('#codeEditor').dispatchEvent('compositionend');await p.waitForFunction(history=>Akari.app.editorState.main.sourceText.includes('4を')&&Akari.app.editorState.history===history+1,initial.history);
    await mode(p,'blocks');const second=await state(p);await number(p).dispatchEvent('compositionstart');await number(p).fill('8');await mode(p,'code');assert.deepEqual(await state(p),second);
    await number(p).dispatchEvent('compositionend');await number(p).press('Enter');assert.equal((await state(p)).source,'もし条件（条件の答え（あてはまる））が成り立つなら、点数に8を足す。 ※ 末尾  ');
    return{codeAndBlockComposition:true};
  });
  await run('RELEASE-GUI/inline-structure-single-history',async p=>{
    const original='※ 前  \nもし条件（条件の答え（あてはまる））が成り立つなら、点数に3を足す。 ※ 本文  \n\n「😀」  と言う。 ※ 後  \n';
    await fill(p,original);await mode(p,'blocks');const initial=await state(p);
    await U.nodeAction(p.locator('#blockEditor .blockui-node[data-schema-id="NumericUpdate:ADD"]').first(),'duplicate');
    const expected='※ 前  \nもし条件（条件の答え（あてはまる））が成り立つなら、\n  点数に3を足す。  ※ 本文  \n  点数に3を足す。  ※ 本文  \n\n「😀」  と言う。 ※ 後  \n';
    assert.equal((await state(p)).source,expected);assert.equal((await state(p)).history,initial.history+1);
    await click(p,'undoBtn');assert.equal((await state(p)).source,original);await click(p,'redoBtn');assert.equal((await state(p)).source,expected);
    return{smallestContainer:true,comments:true,oneHistory:true};
  });
  await run('RELEASE-GUI/inline-step-and-error-role',async p=>{
    await fill(p,'もし条件（条件の答え（あてはまる））が成り立つなら、1秒待つ。\nもし条件（条件の答え（あてはまる））が成り立つなら、点数に（1÷0）を足す。');await mode(p,'blocks');
    await click(p,'runBtn');await p.waitForFunction(()=>!document.querySelector('#pauseBtn').disabled);await click(p,'pauseBtn');assert.equal(await p.evaluate(()=>Akari.app.editorState.state),'PAUSED');
    await click(p,'stepBtn');assert.ok(await p.locator('#blockEditor .blockui-current').count());
    // On the run screen the view is switched in 本文と動きのようす (the toolbar shows neither the level nor the toggle).
    await click(p,'runtimeInspectBtn');await mode(p,'code');await mode(p,'blocks');assert.ok(await p.locator('#blockEditor .blockui-current').count());await click(p,'runtimeInspectorClose');
    await click(p,'continueBtn');await p.locator('#failureModal.show').waitFor();await click(p,'failureClose');
    const highlighted=await p.locator('#blockEditor .blockui-current').getAttribute('data-schema-id');assert.equal(highlighted,'BinaryExpression:DIV');
    assert.match(await p.locator('#failureBody').textContent(),/R/);await pressStop(await reveal(p.locator('#stopBtn')));
    return{sameLineBody:true,errorRole:highlighted,pausedModeSwitch:true};
  });
  await run('RELEASE-GUI/save-reload-generated-offline',async p=>{
    await fill(p,source);await mode(p,'blocks');await number(p).fill('3');await number(p).press('Enter');
    const save=async(id,name)=>{const pending=p.waitForEvent('download');await click(p,id);if(id==='exportBtn')await p.locator('#exportControls').click();const f=path.join(dir,name);await (await pending).saveAs(f);return f;};
    const file=await save('saveBtn','editor-gui-saved.akari.md'),saved=fs.readFileSync(file,'utf8');
    assert.ok(saved.startsWith(("# あかり "+currentProductVersion()+" の作品")));assert.ok(saved.includes('AKARI-PROJECT-F5-DATA-BEGIN'));
    const initial=await state(p);await click(p,'newBtn');await p.locator('#fileInput').setInputFiles(file);await p.waitForFunction(s=>Akari.app.editorState.main.sourceText===s,source);assert.equal((await state(p)).project,initial.project);
    const generated=await save('exportBtn','editor-gui-player.html');
    const c=await b.newContext({offline:true}),errors=[],network=[];
    try{await c.route(/^https?:/,r=>{network.push(r.request().url());return r.abort();});const player=await c.newPage();player.on('pageerror',e=>errors.push(e.message));await player.goto(pathToFileURL(path.resolve(generated)).href);await player.locator('#playerStart:not([disabled])').click();await player.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('5'));await pressStop(player.locator('#playerStop'));assert.equal(await player.locator('#playerStop').isHidden(),true);assert.equal(await player.locator('#playerStart').isVisible(),true);}finally{await c.close();}
    assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
    return{sourceExact:true,offline:true,saveSha256:sha(saved),generatedSha256:sha(fs.readFileSync(generated))};
  });
  await run('RELEASE-GUI/unregistered-draft-autosave-registration',async p=>{
    await click(p,'procBtn');await click(p,'callableNewFunction');
    const set=async(id,text)=>{await p.locator('#'+id).fill(text);await p.waitForTimeout(350);};
    await set('callableName','仮計算');await set('callableArgs','値');await set('callableCode','もし値が0より大きければ、値を答えとして返す。\nそうでなければ、未知名を答えとして返す。 ※ 下書き');
    const initial=await state(p);assert.equal(JSON.parse(initial.project).functions.length,0);assert.equal(initial.hasDraft,true);
    await click(p,'callableModeblocks');await click(p,'callableModecode');assert.deepEqual(await state(p),initial);
    await p.waitForFunction(text=>document.querySelector('#autosaveState').textContent.includes(text),autosaved);await p.reload();await p.locator('#recoveryModal.show').waitFor();await click(p,'recoveryRestore');
    const recovered=await state(p);assert.equal(JSON.parse(recovered.project).functions.length,0);assert.equal(recovered.draft.source,initial.draft.source);
    await p.locator('#procModal.show').waitFor();await click(p,'callableSave');assert.equal(JSON.parse((await state(p)).project).functions[0].source,initial.draft.source);
    await p.keyboard.press('Control+z');assert.equal(JSON.parse((await state(p)).project).functions.length,0);assert.equal((await state(p)).hasDraft,true);
    await p.keyboard.press('Control+y');assert.equal(JSON.parse((await state(p)).project).functions.length,1);
    const definitions=[];
    for(const type of ['action','function']){
      await click(p,type==='action'?'callableNewAction':'callableNewFunction');await click(p,'callableModecode');
      await set('callableName',type==='action'?'戻る手順':'戻る計算');
      await set('callableCode',type==='action'?'「元」と言う。':'1を答えとして返す。');
      await click(p,'callableSave');definitions.push({type,key:await p.locator('#callableSelect').inputValue()});
    }
    const callableHistory=[];
    for(const editorMode of ['code','blocks'])for(const definition of definitions){
      const other=definitions.find(d=>d!==definition);
      await p.locator('#callableSelect').selectOption(other.key);await p.locator('#callableSelect').selectOption(definition.key);
      await click(p,'callableMode'+editorMode);
      const beforeEdit=await state(p),original=beforeEdit.draft.source;
      const changed=definition.type==='action'?'「新 '+editorMode+'」と言う。':(editorMode==='code'?'2':'3')+'を答えとして返す。';
      if(editorMode==='code')await set('callableCode',changed);
      else{
        const field=p.locator('#callableBlocks .blockui-node[data-schema-id="'+(definition.type==='action'?'StringLiteral':'NumberLiteral')+'"] [data-blockui-field="value"]').first();
        await (await reveal(field)).fill(definition.type==='action'?'新 '+editorMode:'3');await field.press('Enter');
      }
      await p.keyboard.press('Control+z');
      assert.equal(await p.locator('#procModal.show').count(),1,'undo must leave the edited definition open');
      assert.equal(await p.locator('#callableSelect').inputValue(),definition.key);assert.equal((await state(p)).draft.source,original);
      assert.equal((await state(p)).project,beforeEdit.project);
      const undone=await state(p);
      await p.locator('#callableSelect').selectOption(other.key);await p.locator('#callableSelect').selectOption(definition.key);
      assert.equal((await state(p)).history,undone.history);assert.equal((await state(p)).redo,undone.redo);
      await p.keyboard.press('Control+y');assert.equal((await state(p)).draft.source,changed);
      assert.equal(await p.locator('#callableSelect').inputValue(),definition.key);
      await p.keyboard.press('Control+z');
      callableHistory.push({mode:editorMode,type:definition.type});
    }
    return{draftSeparate:true,unknownNamePreserved:true,autosaveRecovery:true,registrationUndoRedo:true,callableHistory};
  });
  await run('RELEASE-GUI/corrupt-autosave-preserves-current',async p=>{
    const initial=await state(p);await fill(p,source);await p.waitForFunction(text=>document.querySelector('#autosaveState').textContent.includes(text),autosaved);
    const validRecord=await p.evaluate(async database=>{let valid;await new Promise((resolve,reject)=>{const q=indexedDB.open(database);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result,tx=db.transaction('workspace','readwrite'),s=tx.objectStore('workspace'),get=s.get('latest');get.onsuccess=()=>{const v=get.result;if(!v){reject(Error('missing latest autosave'));return;}valid=structuredClone(v);v.workspace.base.project.components[0].id='stage';s.put(v);};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});return valid;},autosaveDatabase);
    await p.reload();await p.waitForFunction(()=>document.querySelector('#console').textContent.includes('F505'));
    assert.equal(await p.locator('#recoveryModal.show').count(),0);
    const current=await state(p);assert.notEqual(current.source,source);assert.equal(current.project,initial.project);
    await p.evaluate(async ({validRecord,autosaveDatabase,autosaveFallback})=>{
      const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(autosaveDatabase);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
      await new Promise((resolve,reject)=>{const tx=db.transaction('workspace','readwrite');tx.objectStore('workspace').delete('latest');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
      db.close();
      const restoredRecord=structuredClone(validRecord);restoredRecord.workspace.base.project.name='自動保存の復元';
      localStorage.setItem(autosaveFallback,JSON.stringify(restoredRecord));
    },{validRecord,autosaveDatabase,autosaveFallback});
    await p.reload();await p.locator('#recoveryModal.show').waitFor();
    assert.equal((await state(p)).project,initial.project,'recovery offer must not replace current project');
    await click(p,'recoveryRestore');
    assert.equal(await p.evaluate(()=>Akari.app.project.appVersion),(""+currentProductVersion()+""));
    assert.equal(await p.evaluate(()=>Akari.app.project.name),'自動保存の復元');
    await p.evaluate(key=>{indexedDB.open=()=>{throw Error('database unavailable');};localStorage.removeItem(key);},autosaveFallback);
    await fill(p,'点数を88にする。');
    await p.waitForFunction(text=>document.querySelector('#autosaveState').textContent.includes(text),autosaved);
    const fallback=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),autosaveFallback);
    assert.equal(fallback.version,2);assert.equal(fallback.workspace.base.project.appVersion,(""+currentProductVersion()+""));assert.ok(fallback.workspace.assets.every(a=>a.builtin&&a.blob===null));
    return{invalidRecordNotInstalled:true,fallbackValidatedBeforeRestore:true,mediaFreeFallbackWrites:true};
  });
});
assert.deepEqual(snapshot(product),before);
const report={status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',snapshot:before,environment:'chromium',browser:browserVersion,total:results.length,results};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
verifySurfaceResults(report,'gui',before,'chromium');

// Enter the visible body editor before exercising editing operations.
async function openBodyForTest(page) { if (await page.locator("#sourceOverview").isVisible()) await page.locator("#sourceEditBtn").click(); }
