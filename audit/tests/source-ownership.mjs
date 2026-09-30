import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {snapshot,withBrowser,pageFor} from '../lib/product-test-host.mjs';

const [browserPath,output='audit-evidence/source-ownership.json']=process.argv.slice(2);
const inputs=snapshot('Akari.html'), api=loadApi(fs.readFileSync('Akari.html','utf8'));
const plain=value=>JSON.parse(JSON.stringify(value));
async function openStageSources(page) {
  if(await page.locator('#objectSelect').inputValue() !== 'stage') await page.locator('#sourceStageBtn').click();
  else if(!await page.locator('#sourceOverview').isVisible()) await page.locator('#sourceOverviewBtn').click();
  assert.equal(await page.locator('#objectSelect').inputValue(), 'stage');
  assert.equal(await page.locator('#sourceOverview').isVisible(), true);
}
const fixture=()=>{
  const p=api.makeDefaultProject();p.name='コードの所属を読む';
  p.components.push({...p.components.find(c=>c.id==='button-1'),id:'button-empty',name:'空のボタン',y:300});
  const sprite=p.components.find(c=>c.id==='sprite-1');
  sprite.costumes=[{id:'costume-test',name:'顔',kind:'text',value:'🙂'}];sprite.costumeId='costume-test';
  p.scripts=[
    {targetId:'stage',event:'message',source:'「画面の知らせ」と言う'},
    {targetId:'button-1',event:'click',source:'表示（倍（3））を実行する。'},
    {targetId:'sprite-1',event:'start',source:'「はじめ」と言う'},
    {targetId:'sprite-1',event:'message',source:'「受け取った」と言う'},
  ];
  p.actions=[{id:'action-show',ownerId:'stage',name:'表示',args:['数'],source:'数と言う'}];
  p.functions=[{id:'function-double',ownerId:'stage',name:'倍',args:['数'],source:'数 * 2を返す'},
    {id:'function-unused',ownerId:'stage',name:'未使用',args:[],source:'7を返す'}];
  return p;
};
const results=[];
async function test(id,fn){try{await fn();results.push({id,pass:true,detail:'PASS'});}catch(e){results.push({id,pass:false,detail:e.stack});console.error(id,e.message);}}
await test('OWNER-COMPLETE-REGISTRY',()=>{
  const p=fixture(),rows=plain(api.sourceRegistry(p));
  assert.equal(rows.length,p.scripts.length+p.actions.length+p.functions.length);
  assert.equal(new Set(rows.map(r=>r.key)).size,rows.length);
  assert.ok(rows.every(r=>r.ownerId==='stage'||p.components.some(c=>c.id===r.ownerId)));
  assert.deepEqual(plain(api.compileProject(p).errors),[]);
  assert.deepEqual(plain(api.compileProject(p).items.map(i=>[i.key,i.ownerId])),rows.map(r=>[r.key,r.ownerId]));
});
await test('OWNER-REJECT-UNOWNED-AT-BOUNDARIES',async()=>{
  for(const kind of ['actions','functions'])for(const owner of [undefined,null,'missing','sprite-1']){
    const p=fixture();if(owner===undefined)delete p[kind][0].ownerId;else p[kind][0].ownerId=owner;
    assert.throws(()=>api.validateProject(p));assert.throws(()=>api.serializeProject(p));
    assert.ok(api.compileProject(p).errors.length);assert.throws(()=>api.packExecutable(p));
  }
  const p=fixture();p.scripts[0].targetId='missing';assert.throws(()=>api.sourceRegistry(p));
});
await test('OWNER-SAVE-ROUNDTRIP',async()=>{
  const p=fixture(),saved=api.serializeProject(p),loaded=await api.parseProjectFile(saved);
  assert.deepEqual(plain(loaded.project),plain(p));
  const data=api.packExecutable(p),restored=api.restoreExecutable(data);
  assert.deepEqual(plain(restored.compiled.items.map(r=>[r.key,r.ownerId])),plain(api.sourceRegistry(p).map(r=>[r.key,r.ownerId])));
  for(const change of [d=>delete d.program[0].ownerId,d=>d.program[0].ownerId='missing',d=>d.program[0].key='script:stage:missing',d=>d.program[0].key='script:stage:start:extra',d=>d.project.actions[0].ownerId='sprite-1',d=>d.program=d.program.filter(r=>r.key!=='action:action-show')]){
    const copy=plain(data);change(copy);assert.throws(()=>api.restoreExecutable(copy));
  }
});
await test('OWNER-FORMAT-REJECTION',async()=>{
  for(const [key,value]of [['appVersion',null],['formatVersion',2],['languageContractId',2]]){
    const p=fixture();p[key]=value;assert.throws(()=>api.serializeProject(p));assert.ok(api.compileProject(p).errors.length);
  }
});
await test('OWNER-CALLER-RECEIVER-AND-FUNCTION',()=>{
  const p=fixture(),compiled=api.compileProject(p),out=[];
  const runtime=new api.RuntimeModel(p,{}),q=new api.EventScheduler(p,compiled,runtime,{say:(id,value)=>out.push([id,value])});
  runtime.reset(42);q.running=true;q.paused=true;q.spawnForRuntime('button-1','click');
  for(let i=0;i<100&&q.ready.length;i++)q.runTurn(true);
  assert.deepEqual(out,[['button-1','6']]);
});
await test('OWNER-REFERENCES-INCLUDING-EXPRESSION',()=>{
  const p=fixture(),row=api.sourceRegistry(p).find(r=>r.ownerId==='button-1');
  assert.deepEqual(plain(api.sourceReferences(row,p)).sort(),['action:action-show','function:function-double']);
});
await test('OWNER-INCOMPLETE-AND-UNUSED',()=>{
  const p=fixture();p.scripts.push({targetId:'button-1',event:'message',source:'もし'});p.functions[1].source='';
  const rows=api.sourceRegistry(p);assert.equal(rows.length,8);assert.ok(rows.some(r=>r.source==='もし'));assert.ok(rows.some(r=>r.key==='function:function-unused'));
});
const dir=path.dirname(output);fs.mkdirSync(dir,{recursive:true});
const md=path.join(dir,'ownership.akari.md');fs.writeFileSync(md,api.serializeProject(fixture()));
let browserVersion;
await withBrowser(browserPath,async browser=>{
  browserVersion=browser.version();
  await pageFor(browser,'Akari.html',async p=>{
    p.on('dialog',d=>d.accept());await p.setViewportSize({width:1440,height:1000});
    const startup={overview:await p.locator('#sourceOverview').isVisible(),editable:await p.locator('#codeEditor').isEditable()};
    await p.locator('#fileInput').setInputFiles(md);await p.waitForFunction(()=>Akari.app.project.name==='コードの所属を読む');
    await test('OWNER-GUI-DIRECT-BUTTON',async()=>{
      assert.deepEqual(startup,{overview:false,editable:true});
      const original='表示（倍（3））を実行する。',changed='表示（倍（4））を実行する。';
      for(const mode of ['code','blocks']){
        await p.locator('#editorMode'+mode).click();
        await p.locator('#sourceOverviewBtn').click();await p.locator('#newBtn').click();
        assert.equal(await p.locator('#sourceOverview').isVisible(),false,'new project opens the editor');
        assert.equal(await p.locator('#eventSelect').inputValue(),'start');
        const editor=mode==='code'?p.locator('#codeEditor'):p.locator('#blockEditor');
        assert.ok(await editor.isVisible());
        if(mode==='code')assert.ok(await editor.isEditable());
        else assert.equal(await editor.locator('[data-schema-id="NumberLiteral"] [data-blockui-field="value"]').first().isEditable(),true);
        await p.locator('#sourceOverviewBtn').click();
        await p.locator('#fileInput').setInputFiles(md);await p.waitForFunction(()=>Akari.app.project.name==='コードの所属を読む');
        assert.equal(await p.locator('#sourceOverview').isVisible(),false,'import closes a previous overview');
        await p.locator('#formSurface .component[data-id="button-1"]').click();
        assert.equal(await p.locator('#objectSelect').inputValue(),'button-1');
        assert.equal(await p.locator('#eventSelect').inputValue(),'click','nonempty click body opens instead of empty start');
        assert.equal(await p.locator('#sourceOverview').isVisible(),false);
        await p.screenshot({path:path.join(dir,`ownership-direct-${mode}.png`)});
        if(mode==='code')await p.locator('#codeEditor').fill(changed);
        else{
          const value=p.locator('#blockEditor [data-schema-id="NumberLiteral"] [data-blockui-field="value"]').first();
          assert.ok(await value.isEditable());await value.fill('4');await value.press('Enter');
        }
        const source=()=>p.evaluate(()=>Akari.app.editorState.main.sourceText);
        assert.equal(await source(),changed);
        await p.locator('#undoBtn').click();assert.equal(await source(),original);
        await p.locator('#redoBtn').click();assert.equal(await source(),changed);
        await p.locator('#objectSelect').selectOption('sprite-1');
        assert.equal(await p.locator('#eventSelect').inputValue(),'start','first nonempty compatible event opens');
        await p.locator('#eventSelect').selectOption('message');
        await p.locator('#objectSelect').selectOption('stage');
        assert.equal(await p.locator('#eventSelect').inputValue(),'message','current event with source is preserved');
        await p.locator('#objectSelect').selectOption('button-1');
        assert.equal(await p.locator('#eventSelect').inputValue(),'click');assert.equal(await source(),changed,'selection preserves edited source');
        await p.locator('#eventSelect').selectOption('start');
        await p.locator('#formSurface .component[data-id="button-1"]').click();
        assert.equal(await p.locator('#eventSelect').inputValue(),'start','reselection preserves an explicitly selected empty event');
        await p.locator('#objectSelect').selectOption('button-empty');
        assert.equal(await p.locator('#eventSelect').inputValue(),'start','all-empty target preserves current valid event');
      }
      await p.locator('#editorModeblocks').click();
      await p.locator('#formSurface .component[data-id="button-1"]').click();
      assert.equal(await p.locator('#objectSelect').inputValue(),'button-1');
      await p.locator('#sourceOverviewBtn').click();
      assert.equal(await p.locator('#eventSelect').inputValue(),'all');
      const card=p.locator('[data-source-key="script:button-1:click"]');
      await card.locator('.blockui-script').waitFor({state:'visible'});
      assert.equal(await card.locator('[data-blockui-schema]').count(),0,'read-only preview does not prepare editing candidates');
      assert.equal(await card.locator('[data-schema-id="UserActionCall"] [data-blockui-field="name"]').first().textContent(),'表示');
      assert.equal(await card.locator('[data-schema-id="UserFunctionCall"] [data-blockui-field="name"]').first().textContent(),'倍');
      assert.equal(await card.locator('.blockui-node input,.blockui-node textarea,.blockui-node select').count(),0,'read-only values are complete text, without clipped disabled inputs');
      assert.equal(await p.locator('[data-source-key="action:action-show"]').count(),1);
      assert.equal(await p.locator('[data-source-key="function:function-double"]').count(),1);
      await p.screenshot({path:path.join(dir,'ownership-button.png')});
    });
    await test('OWNER-GUI-ALL-EVENTS',async()=>{
      await p.locator('#objectSelect').selectOption('sprite-1');
      await p.locator('#sourceOverviewBtn').click();
      for(const event of ['start','message']){const card=p.locator(`[data-source-key="script:sprite-1:${event}"]`);await card.scrollIntoViewIfNeeded();await card.locator('.blockui-script').waitFor({state:'visible'});assert.equal(await card.locator('.blockui-script').count(),1);}
    });
    await test('OWNER-GUI-UNUSED-STAGE-DEFINITIONS',async()=>{
      await openStageSources(p);
      const all=await p.locator('#sourceOverview [data-source-key]').evaluateAll(ns=>ns.map(n=>n.dataset.sourceKey));
      for(const key of ['script:stage:message','action:action-show','function:function-double','function:function-unused'])assert.ok(all.includes(key),key);
      await p.locator('[data-source-edit="function:function-unused"]').click();
      assert.equal(await p.locator('#callableName').inputValue(),'未使用');
      assert.equal(await p.locator('#callableCode').inputValue(),'7を返す');
      await p.locator('#procClose').click();
    });
    await test('OWNER-GUI-SYNTAX-ERROR-RAW-BODY',async()=>{
      await p.locator('#objectSelect').selectOption('button-1');await p.locator('#eventSelect').selectOption('message');
      await p.locator('#editorModecode').click();await p.locator('#codeEditor').fill('もし');
      await p.locator('#sourceOverviewBtn').click();await p.locator('#editorModeblocks').click();
      assert.equal(await p.locator('[data-source-key="script:button-1:message"] pre').textContent(),'もし');
      assert.equal(await p.locator('[data-source-key="script:button-1:click"] .blockui-script').count(),1);
    });
    await test('OWNER-GUI-DRAFT-OWNERSHIP',async()=>{
      // Open the existing definition via its visible card, then type an incomplete body.
      await openStageSources(p);await p.locator('[data-source-edit="function:function-unused"]').click();
      await p.locator('#callableCode').fill('下書きのまま');
      assert.equal(await p.evaluate(()=>Akari.app.editorState.callableDraft.ownerId),'stage');
      assert.equal(await p.evaluate(()=>Akari.app.project.functions.find(d=>d.id==='function-unused').source),'7を返す');
      await p.locator('#callableSave').click();
      assert.equal(await p.evaluate(()=>Akari.app.project.functions.find(d=>d.id==='function-unused').source),'下書きのまま');
      await p.locator('#procClose').click();await openStageSources(p);
      assert.equal(await p.locator('[data-source-key="function:function-unused"] pre').textContent(),'下書きのまま');
    });
    await test('OWNER-GUI-RECURSION-AND-HIDDEN-OBJECT',async()=>{
      const data=fixture();data.name='再帰の参照';data.components.find(c=>c.id==='sprite-1').visible=false;
      data.scripts.find(s=>s.targetId==='button-1').source='甲（巡る（1））を実行する';
      data.actions=[{id:'a',ownerId:'stage',name:'甲',args:['値'],source:'乙（値）を実行する'},{id:'b',ownerId:'stage',name:'乙',args:['値'],source:'甲（値）を実行する'}];
      data.functions=[{id:'f',ownerId:'stage',name:'巡る',args:['値'],source:'巡る（値）を返す'}];
      await p.locator('#fileInput').setInputFiles({name:'references.akari.md',mimeType:'text/plain',buffer:Buffer.from(api.serializeProject(data))});
      await p.waitForFunction(()=>Akari.app.project.name==='再帰の参照');
      await p.locator('#objectSelect').selectOption('button-1');
      await p.locator('#sourceOverviewBtn').click();
      const keys=await p.locator('#sourceOverview [data-source-key]').evaluateAll(ns=>ns.map(n=>n.dataset.sourceKey));
      assert.deepEqual(keys.sort(),['script:button-1:click','action:a','action:b','function:f'].sort());
      assert.equal(await p.locator('[data-source-key="action:b"] .source-references a').count(),1);
      await p.locator('#objectSelect').selectOption('sprite-1');
      await p.locator('#sourceOverviewBtn').click();
      assert.equal(await p.locator('#sourceOverview [data-source-key]').count(),2);
    });
    await test('OWNER-GUI-VIEWPORT-AND-UNDO-REACHABILITY',async()=>{
      for(const width of [1440,768,390]){
        await p.setViewportSize({width,height:900});await p.locator('#editorModecode').click();
        await p.locator('#objectSelect').selectOption('button-1');
        await p.locator('#sourceOverviewBtn').click();
        const body=p.locator('[data-source-key="script:button-1:click"] pre');
        assert.ok(await body.isVisible());
        const r=await body.boundingBox(),panel=await p.locator('#sourceOverview').boundingBox();
        assert.ok(r.y+r.height>panel.y&&r.y<panel.y+panel.height,'primary body is visible without scrolling');
        assert.ok(await p.locator('#undoBtn').isVisible());
      }
      await p.screenshot({path:path.join(dir,'ownership-narrow.png'),fullPage:true});
    });
  });
});
assert.deepEqual(snapshot('Akari.html'),inputs);
const report={schema:'akari-source-ownership-v1',status:results.every(r=>r.pass)?'PASS':'FAIL',environment:'chromium',browser:browserVersion,snapshot:inputs,results};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(`Source ownership: ${results.filter(r=>r.pass).length}/${results.length}`);
if(results.some(r=>!r.pass))process.exitCode=1;
