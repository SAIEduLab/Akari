import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {withBrowser,pageFor,snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {install,state} from '../lib/ux-repair02-ui.mjs';
const [chrome,out]=process.argv.slice(2),product=currentProductFile(),dir=path.resolve(out+'.artifacts');fs.mkdirSync(dir,{recursive:true});
const cases=JSON.parse(fs.readFileSync(new URL('../fixtures/ux-repair02-matrix.json',import.meta.url))).cases.filter(c=>['B01','B04','B10','B13','B15'].includes(c.id));
const report={schema:'akari-ux-repair02-layout-v1',status:'RUNNING',snapshot:snapshot(product),uxAcceptance:false,results:[]};
const save=()=>fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
try{await withBrowser(chrome,async browser=>{
 for(const viewport of [{width:1188,height:848},{width:1188,height:761},{width:1366,height:768},{width:1024,height:768},{width:390,height:844}])for(const scheme of ['light','dark'])for(const c of cases){
  report.activeCase={task:c.id,viewport,scheme,phase:'preparation'};save();
  await pageFor({newContext:options=>browser.newContext({...options,viewport,colorScheme:scheme})},product,async p=>{p.on('dialog',d=>d.accept());await install(p,c.source,{level:'basic'});const before=await state(p);
   report.activeCase.phase='layout';
   for(const scale of [100,75]){const id=`${c.id}/${viewport.width}x${viewport.height}/${scheme}/${scale}`,row={id,status:'RUNNING'};report.results.push(row);
    try{await p.locator('#blockEditor [data-blockui-action="zoom-reset"]').click();if(scale===75)for(let i=0;i<5;i++)await p.locator('#blockEditor [data-blockui-action="zoom-out"]').click();await p.locator('#blockEditor [data-blockui-action="workspace-home"]').click();await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
     const geometry=await p.evaluate(()=>{const root=document.querySelector('#blockEditor'),w=root.querySelector('.blockui-workspace'),n=root.querySelector('.blockui-navigation'),world=root.querySelector('.blockui-world');const rect=e=>e.getBoundingClientRect().toJSON();return{workspace:rect(w),navigation:rect(n),world:rect(world),main:[...world.querySelectorAll('.blockui-node-main')].map(rect),source:Akari.app.editorState.main.sourceText,scrollWidth:w.scrollWidth,clientWidth:w.clientWidth};});
     assert.ok(geometry.workspace.bottom<=geometry.navigation.top+1,'navigation has its own row');assert.ok(geometry.world.left>=geometry.workspace.left-2&&geometry.world.right<=geometry.workspace.right+2,'world fits viewport');assert.ok(geometry.main.every(r=>r.left>=geometry.workspace.left-2&&r.right<=geometry.workspace.right+2),'default controls fit right edge');assert.equal(geometry.source,before.source);assert.equal((await state(p)).history,before.history);
     await p.screenshot({path:path.join(dir,id.replaceAll('/','-')+'.png')});row.observed={sourceExact:true,historyUnchanged:true,geometry};row.status='PASS';
    }catch(e){row.error=e.stack;row.status='FAIL';await p.screenshot({path:path.join(dir,id.replaceAll('/','-')+'-failure.png')});}save();
   }
   report.activeCase.phase='return-to-code';
   await p.locator('#editorModecode').click();const code=await p.locator('#codeEditor').evaluate(e=>({source:e.value,width:e.clientWidth,scroll:e.scrollWidth,wrap:getComputedStyle(e).whiteSpace}));assert.equal(code.source,before.source);assert.equal(code.wrap,'pre-wrap');assert.ok(code.scroll<=code.width+2);
  });delete report.activeCase;console.log('layout '+c.id+' '+viewport.width+'x'+viewport.height+' '+scheme);
 }
},600000);}catch(e){report.hostFailure=e.stack;}report.status=!report.hostFailure&&report.results.length===100&&report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';save();if(report.status!=='PASS')process.exitCode=1;
