import {makeRegressionProject,installRegressionProject,showAdvancedCode} from '../lib/gate-ui-fixture.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot,withBrowser,pageFor} from '../lib/product-test-host.mjs';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {blockFieldIds,verifyBlockFields} from '../lib/block-field-contract.mjs';
const [browserPath,output='audit-evidence/block-field-width.json'] = process.argv.slice(2);
const product = currentProductFile(), inputs = snapshot(product), api = loadApi(fs.readFileSync(product,'utf8'));
const sample = 'もし 受け取った知らせが「表示更新」と同じなら、次のことをする。\n  自分の文字をつなぐ（「得点：」、点数）に変える。\nもし 受け取った知らせが「ゲーム開始」と同じなら、次のことをする。\n  自分の文字をつなぐ（「得点：」、点数）に変える。';
const fixture = makeRegressionProject(api); fixture.name = '入力欄の全文表示';
fixture.scripts = [{targetId:'stage',event:'message',source:sample}];
fixture.actions = [{id:'field-action',ownerId:'stage',name:'文字幅',args:[],source:'「表示更新」と言う。'}];
const dir = path.dirname(output);fs.mkdirSync(dir,{recursive:true});
const results = [], pageErrors = [], networkRequests = [], fieldObservations=[];
let currentFieldCase=null;
async function checkFields(locator) {
  const rows = await locator.evaluateAll(inputs => inputs.map(input => {
    const s=getComputedStyle(input), span=document.createElement('span');
    Object.assign(span.style,{position:'fixed',visibility:'hidden',whiteSpace:'pre',font:s.font,letterSpacing:s.letterSpacing});
    span.textContent=input.value;document.body.append(span);const text=span.getBoundingClientRect().width;span.remove();
    const edges=['paddingLeft','paddingRight','borderLeftWidth','borderRightWidth'].reduce((n,k)=>n+(parseFloat(s[k])||0),0);
    const picker=input.hasAttribute('list')?parseFloat(s.getPropertyValue('--blockui-picker-space'))||20:0;
    return {value:input.value,width:parseFloat(s.width),required:text+edges+picker,title:input.title,
      textWidth:text,edges,picker,font:s.font,fontFamily:s.fontFamily,fontSize:s.fontSize,letterSpacing:s.letterSpacing,
      inlineWidth:input.style.getPropertyValue('--blockui-field-width'),fontStatus:document.fonts.status,
      at:performance.now(),notifications:window.__fieldWidthAudit?.events.slice(-30)||[]};
  }));
  fieldObservations.push({sequence:fieldObservations.length+1,id:currentFieldCase,rows});
  assert.ok(rows.length,'rendered fields required');
  for(const row of rows) assert.ok(row.width+0.5>=row.required,'clipped '+JSON.stringify(row));
  return rows;
}
const settle=async p=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const browserVersion = await withBrowser(browserPath,async browser => {
  await pageFor(browser,product,async p => {
    p.on('pageerror',e=>pageErrors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))networkRequests.push(r.url());});p.on('dialog',d=>d.accept());
    await p.setViewportSize({width:1440,height:1000});
    await p.locator('#fileInput').setInputFiles({name:'field-width.akari.md',mimeType:'text/plain',buffer:Buffer.from(api.serializeProject(fixture))});
    await p.waitForFunction(()=>Akari.app.project.name==='入力欄の全文表示');await showAdvancedCode(p);await p.locator('#objectSelect').selectOption('stage');
    await p.locator('#eventSelect').selectOption('message');
    await p.locator('#editorModeblocks').click();
    const fields=p.locator('#blockEditor .blockui-world .blockui-field input');
    const literal=p.locator('#blockEditor [data-schema-id="StringLiteral"] input').first();
    // Passive diagnostics only: retain measurement/notification order without
    // changing the 50ms font check, layout logic or its width tolerance.
    await p.evaluate(()=>{const audit=window.__fieldWidthAudit={events:[],serial:0},note=(kind,detail)=>{audit.events.push({sequence:++audit.serial,at:performance.now(),kind,...detail});if(audit.events.length>300)audit.events.shift();};
      new MutationObserver(records=>{for(const r of records)if(r.target.matches?.('.blockui-field input'))note('field-style',{value:r.target.value,width:r.target.style.getPropertyValue('--blockui-field-width')});}).observe(document.querySelector('#blockEditor'),{subtree:true,attributes:true,attributeFilter:['style']});
      const observer=new ResizeObserver(entries=>note('resize-notification',{sizes:entries.map(e=>({width:e.contentRect.width,height:e.contentRect.height}))}));observer.observe(document.querySelector('#blockEditor'));
      for(const kind of ['loading','loadingdone','loadingerror'])document.fonts.addEventListener(kind,()=>note('font-'+kind,{status:document.fonts.status}));});
    for(const id of blockFieldIds){
      currentFieldCase=id;
      try {
        if(id==='FIELD-SHORT-JAPANESE') {
          await p.waitForFunction(()=>[...document.querySelectorAll('#blockEditor .blockui-field input')].some(i=>i.value==='表示更新'&&i.style.getPropertyValue('--blockui-field-width')));
          const rows=await checkFields(fields);for(const value of ['表示更新','得点：','点数'])assert.ok(rows.some(r=>r.value===value),value);
        } else if(id==='FIELD-MIXED-UNICODE') {
          await literal.fill('得点：W9😀e\u0301');await literal.press('Tab');await settle(p);await checkFields(fields);
        } else if(id==='FIELD-EDIT-GROW-SHRINK') {
          await literal.fill('広い文字WWW得点：');await literal.press('Tab');await settle(p);const wide=parseFloat(await literal.evaluate(i=>getComputedStyle(i).width));
          await literal.fill('点');await literal.press('Tab');await settle(p);const narrow=parseFloat(await literal.evaluate(i=>getComputedStyle(i).width));assert.ok(wide>narrow);await checkFields(fields);
        } else if(id==='FIELD-FONT-CHANGE') {
          await p.addStyleTag({content:'#blockEditor .blockui-field input{font-family:serif;letter-spacing:1px}'});
          await p.setViewportSize({width:1400,height:1000});await p.waitForTimeout(50);await checkFields(fields);
        } else if(id==='FIELD-ZOOM-BOUNDS') {
          for(const action of ['zoom-out','zoom-in','zoom-reset']){await p.locator('#blockEditor [data-blockui-action="'+action+'"]').click();await checkFields(fields);}
        } else if(id==='FIELD-LONG-EDIT') {
          const long='長い文字列'.repeat(80);await literal.fill(long);await literal.press('Tab');await settle(p);assert.equal(await literal.inputValue(),long);assert.equal(await literal.getAttribute('title'),long);
          assert.ok(parseFloat(await literal.evaluate(i=>getComputedStyle(i).width))<1000);await literal.fill('表示更新');await literal.press('Tab');await settle(p);
        } else if(id==='FIELD-CALLABLE') {
          await p.locator('#sourceOverviewBtn').click();await p.locator('[data-source-edit="action:field-action"]').click();await p.locator('#callableModeblocks').click();await settle(p);
          const callable=p.locator('#callableBlocks .blockui-field input:visible');await callable.first().waitFor();await checkFields(callable);await p.locator('#procClose').click();
        } else {
          if(await p.locator('#sourceEditBtn').isVisible())await p.locator('#sourceEditBtn').click();await p.locator('#editorModeblocks').click();await settle(p);
          await literal.evaluate(i=>i.style.width='20px');await assert.rejects(()=>checkFields(fields),/clipped/);await literal.evaluate(i=>i.style.removeProperty('width'));await checkFields(fields);
        }
        results.push({id,pass:true});console.log(id+': PASS');
      } catch(error) {const detail=String(error.stack||error);results.push({id,pass:false,error:detail});console.error(id+': FAIL\n'+detail);}
    }
    await p.screenshot({path:path.join(dir,'block-fields.png'),fullPage:true});
  });return browser.version();
});
assert.deepEqual(snapshot(product),inputs);
const report={status:results.every(r=>r.pass)?'PASS':'FAIL',snapshot:inputs,browser:browserVersion,results,pageErrors,networkRequests,fieldObservations};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');verifyBlockFields(report,inputs);
console.log('Block field visibility: '+results.length+' PASS');
