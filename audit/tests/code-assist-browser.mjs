import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {chooseView} from '../browser/cases/view-toggle.cjs';
import {codeAssistBrowserIds,verifyCodeAssistBrowserObservation} from '../lib/code-assist-contract.mjs';
const require=createRequire(import.meta.url),[chrome,output]=process.argv.slice(2);
if(!chrome||!output)throw new Error('Usage: code-assist-browser.mjs <browser> <report>');
const product=currentProductFile(),report={schema:'akari-code-assist-v1',kind:'browser',status:'RUNNING',uxAcceptance:false,snapshot:snapshot(product),environment:{browser:null,playwright:require('playwright/package.json').version},execution:{platform:process.platform,node:process.version,realIME:false},pageErrors:[],networkRequests:[],results:[]};
fs.mkdirSync(path.dirname(output),{recursive:true});
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const state=p=>p.evaluate(()=>{const s=Akari.app.editorState;return{source:s.main.sourceText,value:document.querySelector('#codeEditor').value,project:structuredClone(Akari.app.project),history:s.history,redo:s.redo,pending:structuredClone(s.main.pendingEdit),focus:document.activeElement?.id,selection:[codeEditor.selectionStart,codeEditor.selectionEnd],status:document.querySelector('#statusText').textContent};});
async function install(p,{signals=false,receiver=false,original=false,short=false}={}){
  const file=await p.evaluate(({signals,receiver,original,short})=>{
    const project=Akari.makeDefaultProject();project.name='近い書き方の検証';project.scripts=[{id:'assist-main',targetId:'sprite-1',event:receiver?'message':'start',...(receiver?{filter:{message:'受け取る'}}:{}),source:signals?(receiver?'何もしない。':'「出発」の合図を送る。'):'前へ10歩進む。'}];
    if(signals)project.scripts.push(receiver?{id:'sender',targetId:'sprite-1',event:'click',source:'「出発」の合図を送る。'}:{id:'receiver',targetId:'sprite-1',event:'message',filter:{message:'受け取る'},source:'何もしない。'});
    if(original||short)project.projectData={variables:[{id:'assist-score',name:'点数',initialValue:0}],lists:[{id:'assist-list',name:'持ち物',initialValue:['本','ぼうし']}]};
    if(short)project.actions=[{id:'assist-action',ownerId:'stage',name:'ジャンプ',args:[],source:'何もしない。'}];
    return Akari.serializeProject(project,Akari.app.assetStore);
  },{signals,receiver,original,short});
  await p.locator('#fileInput').setInputFiles({name:'assist.akari.md',mimeType:'text/plain',buffer:Buffer.from(file)});
  await p.waitForFunction(()=>Akari.app.project.name==='近い書き方の検証');await p.locator('#uiLevel').selectOption('advanced');await p.locator('#objectSelect').selectOption('sprite-1');await p.locator('#eventSelect').selectOption(receiver?'message':'start');
  if(await p.locator('#sourceOverview').isVisible())await p.locator('#sourceEditBtn').click();await chooseView(p,'code');await p.waitForTimeout(350);
}
const awaitChoices=(p,root='#editorPending')=>p.locator(root+' [data-assist-choice]').first().waitFor({state:'visible',timeout:2500});
const candidateView=(p,root='#editorPending')=>p.locator(root).evaluate(n=>({lead:n.querySelector('.assist-lead')?.textContent,choices:[...n.querySelectorAll('[data-assist-choice]')].map(b=>({label:b.childNodes[0]?.textContent,text:b.querySelector('code')?.textContent||b.textContent,title:b.getAttribute('title'),description:b.getAttribute('aria-describedby'),descriptionFound:!b.getAttribute('aria-describedby')||!!document.getElementById(b.getAttribute('aria-describedby'))})),originalChoices:n.querySelectorAll('[data-intent-choice]').length,cancels:n.querySelectorAll('[data-intent-cancel]').length}));
const optionValues=(p,selector)=>p.locator(selector).evaluate(input=>[...input.list?.options||[]].map(option=>option.value));
async function exercise(p,id){
  const signals=id.startsWith('signals/');await install(p,{signals,receiver:signals&&id!=='signals/send'&&id!=='signals/refresh',original:id==='ui/original-proposals',short:id==='ui/short-call-proposals'});
  if(id==='ui/original-proposals'||id==='ui/short-call-proposals'){
    const before=await state(p);await p.locator('#codeEditor').fill(id==='ui/original-proposals'?'持ち物に「かさ」を入れる。':'点数をリセットする。');await p.waitForTimeout(700);
    return{before,after:await state(p),originalChoices:await p.locator('[data-intent-choice]').count(),assistChoices:await p.locator('[data-assist-choice]').count(),cancels:await p.locator('[data-intent-cancel]').count(),originalBeforeAssist:await p.evaluate(()=>{const a=document.querySelector('[data-intent-choice]'),b=document.querySelector('[data-assist-choice]');return !!a&&!!b&&!!(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING);})};
  }
  if(signals){
    const before=await state(p);await chooseView(p,'blocks');await p.waitForTimeout(400);
    if(id==='signals/send'||id==='signals/refresh'){
      const selector='#blockEditor .blockui-node[data-schema-id="StringLiteral"] input[data-focus-key$=":field:value"]';
      const initial=await optionValues(p,selector);
      if(id==='signals/refresh'){await chooseView(p,'code');await p.locator('#codeEditor').fill('「新しい合図」の合図を送る。');await p.locator('#codeEditor').press('Tab');await chooseView(p,'blocks');await p.waitForTimeout(600);return{initial,updated:await optionValues(p,selector),after:await state(p)};}
      return{before,values:initial,after:await state(p)};
    }
    await p.locator('#sourceHeadingBtn').click();await p.locator('#blockEditor .blockui-trigger-details > summary').click();
    const role=name=>p.locator('#blockEditor [data-blockui-structured-role="heading.'+name+'"]');
    await role('enabled').selectOption('yes');await role('filter.kind').selectOption('message');const values=await optionValues(p,'#blockEditor [data-blockui-structured-role="heading.filter.value"]');
    if(id==='signals/switch'){await role('event').selectOption('keyDown');await role('filter.kind').selectOption('key');const keys=await optionValues(p,'#blockEditor [data-blockui-structured-role="heading.filter.value"]');await p.locator('#blockEditor [data-blockui-action="heading-cancel"]').click();return{before,values,keys,after:await state(p)};}
    await p.locator('#blockEditor [data-blockui-action="heading-cancel"]').click();return{before,values,after:await state(p)};
  }
  if(id==='ui/callable-escape'){
    await p.locator('#procBtn').click();await p.locator('#callableName').fill('ためす');await chooseView(p,'code',{prefix:'callable'});await p.locator('#callableCode').fill('1秒ごとに、');await awaitChoices(p,'#callablePending');const view=await candidateView(p,'#callablePending');await p.locator('#callablePending [data-assist-choice]').first().focus();await p.keyboard.press('Escape');return{view,modalOpen:await p.locator('#procModal').isVisible(),choices:await p.locator('#callablePending [data-assist-choice]').count(),focus:await p.evaluate(()=>document.activeElement.id),realIME:false};
  }
  if(id==='ui/history-queued'||id==='ui/history-after-undo'){
    await p.locator('#codeEditor').fill('前へ20歩進む。');
    if(id==='ui/history-after-undo')await p.keyboard.press('Control+z');else await p.waitForTimeout(100);
  }
  const before=await state(p),input=id==='ui/two-sentences'?'10歩進む。右に行く。':id==='ui/multiline'?'10歩進んで、きえる。':/^ui\/(?:1180|1024|390)$/.test(id)?'止まる。':'右に行く。';
  if(id==='ui/runtime'){
    await p.locator('#runBtn').click();await p.waitForFunction(()=>document.body.classList.contains('runtime'));const runtime={runtime:await p.evaluate(()=>document.body.classList.contains('runtime')),choices:await p.locator('[data-assist-choice]:visible').count(),readOnly:await p.locator('#codeEditor').getAttribute('readonly')!==null};return runtime;
  }
  if(id==='ui/ime'){
    await p.locator('#codeEditor').evaluate(t=>t.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'みぎ'})));
    await p.locator('#codeEditor').fill(input);await p.waitForTimeout(650);const during=await p.locator('[data-assist-choice]').count();await p.locator('#codeEditor').evaluate(t=>t.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'右に行く。'})));await awaitChoices(p);return{before,during,view:await candidateView(p),after:await state(p),realIME:false};
  }
  await p.locator('#codeEditor').fill(input);await awaitChoices(p);await p.waitForTimeout(350);const pending=await state(p),view=await candidateView(p);
  if(id==='ui/stale-source'){await p.locator('[data-assist-choice]').first().evaluate(button=>{window.staleAssistButton=button;});await p.locator('#codeEditor').fill('左に行く。');const pending=await state(p);await p.evaluate(()=>window.staleAssistButton.click());return{pending,after:await state(p)};}
  if(id==='ui/revision-same-message'){await p.locator('[data-assist-choice]').first().evaluate(button=>{window.staleAssistButton=button;});await p.locator('#codeEditor').fill('右に行く。 ');await p.waitForTimeout(700);await awaitChoices(p);const pending=await state(p),replaced=await p.locator('[data-assist-choice]').first().evaluate(button=>button!==window.staleAssistButton&&!document.contains(window.staleAssistButton));await p.locator('[data-assist-choice]').first().click();return{before,pending,replaced,after:await state(p)};}
  if(id==='ui/close'||id==='ui/escape'){
    if(id==='ui/close')await p.locator('[data-intent-cancel]').click();else{await p.locator('[data-assist-choice]').first().focus();await p.keyboard.press('Escape');}
    return{before,pending,view,after:await state(p),choices:await p.locator('[data-assist-choice]').count()};
  }
  if(id==='ui/cached-error'){
    await p.locator('#codeEditor').focus();await p.keyboard.press('Tab');await p.keyboard.press('Tab');const focused=await p.evaluate(()=>document.activeElement.hasAttribute('data-assist-choice'));await p.locator('#codeEditor').focus();await p.keyboard.press('Tab');await p.waitForTimeout(350);return{before,pending,view,focused,second:await candidateView(p),after:await state(p)};
  }
  if(/^ui\/(?:1180|1024|390)$/.test(id)){
    const boxes=[];for(const button of await p.locator('[data-assist-choice],[data-intent-cancel]').all()){await button.scrollIntoViewIfNeeded();boxes.push(await button.evaluate(b=>({rect:b.getBoundingClientRect().toJSON(),font:parseFloat(getComputedStyle(b).fontSize),viewport:{width:innerWidth,height:innerHeight},hit:b.contains(document.elementFromPoint(b.getBoundingClientRect().x+b.getBoundingClientRect().width/2,b.getBoundingClientRect().y+b.getBoundingClientRect().height/2))})));}
    await p.screenshot({path:output+'.'+id.split('/')[1]+'.png'});return{before,pending,view,boxes,scroll:await p.locator('#editorPending').evaluate(n=>({overflow:getComputedStyle(n).overflowY,client:n.clientHeight,height:n.scrollHeight,scrollTop:n.scrollTop}))};
  }
  const first=p.locator('[data-assist-choice]').first();
  if(id==='ui/keyboard'){await p.locator('#codeEditor').focus();await p.keyboard.press('Tab');const summary=await p.evaluate(()=>document.activeElement.tagName==='SUMMARY');await p.keyboard.press('Tab');const focused=await p.evaluate(()=>document.activeElement.hasAttribute('data-assist-choice'));await p.keyboard.press('Enter');const after=await state(p);await p.keyboard.press('Control+z');const undo=await state(p);await p.keyboard.press('Control+y');return{before,pending,view,summary,focused,after,undo,redo:await state(p)};}
  await first.scrollIntoViewIfNeeded();const box=await first.boundingBox();await p.mouse.click(box.x+box.width/2,box.y+box.height/2);const after=await state(p);await p.keyboard.press('Control+z');const undo=await state(p);await p.keyboard.press('Control+y');return{before,pending,view,after,undo,redo:await state(p)};
}
try{
  await withBrowser(chrome,async browser=>{
    report.environment.browser=browser.version();
    for(const id of codeAssistBrowserIds){
      if(process.env.AKARI_ASSIST_BROWSER_CASES&&!process.env.AKARI_ASSIST_BROWSER_CASES.split(',').includes(id))continue;
      let observed;try{
        observed=await pageFor(browser,product,async p=>{p.on('pageerror',error=>report.pageErrors.push(error.message));p.on('request',request=>{if(/^https?:/.test(request.url()))report.networkRequests.push(request.url());});return exercise(p,id);},{viewport:{width:id==='ui/390'?390:id==='ui/1024'?1024:1180,height:844}});
        verifyCodeAssistBrowserObservation(id,observed);report.results.push({id,status:'PASS',observed});
      }catch(error){report.results.push({id,status:'FAIL',observed,error:error.stack||String(error)});}
      save();console.log(id+': '+report.results.at(-1).status);
    }
  });
  report.status=report.results.every(row=>row.status==='PASS')?'PASS':'FAIL';
}catch(error){report.status='FAIL';report.hostFailure=error.stack||String(error);}finally{save();}
if(report.status!=='PASS')process.exitCode=1;
