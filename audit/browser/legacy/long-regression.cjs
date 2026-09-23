const {chromium}=require('playwright'),assert=require('assert/strict'),{pathToFileURL}=require('url'),path=require('path'),fs=require('fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.AKARI_BROWSER,headless:true});
 const L=require('./audit-lib.cjs'),manifest=L.verifyManifest(path.resolve(process.argv[2]));const out=path.join(path.resolve(process.argv[2]),'long-evidence');fs.mkdirSync(out,{recursive:true});const results=[];
 const state=p=>p.evaluate(()=>{const s=Akari.app.editorState;return{source:s.main.sourceText,dirty:s.dirty,history:s.history,redo:s.redo,mode:s.main.mode,pending:s.main.pendingEdit};});
 async function setup(source,at){const p=await browser.newPage({viewport:{width:1440,height:900}});p.setDefaultTimeout(30000);p.on('pageerror',e=>{throw e});await p.route(/^https?:/,r=>r.abort());await p.goto(pathToFileURL(path.join(path.resolve(process.argv[2]),JSON.parse(fs.readFileSync(path.join(path.resolve(process.argv[2]),'manifest.json'),'utf8')).candidate)).href);const inputStarted=Date.now();await p.locator('#codeEditor').fill(source);p.inputMs=Date.now()-inputStarted;await p.waitForFunction(()=>Akari.app.editorState.history>=2);const history=await p.evaluate(()=>Akari.app.editorState.history);await p.locator('#codeEditor').fill(source+'\n');await p.waitForFunction(h=>Akari.app.editorState.history===h+1,history);await p.locator('#undoBtn').click();assert.equal((await state(p)).redo,1);await p.locator('#codeEditor').evaluate((e,at)=>{e.focus();e.setSelectionRange(at,at)},at);return p;}
 try{
 for(const [n,where]of [[8333,'start'],[8333,'middle'],[8333,'end'],[16666,'start'],[16666,'middle'],[16666,'end']]){
  const source=Array(n).fill('何もしない').join('\n'),at=where==='start'?0:where==='middle'?Math.floor(n/2)*6:source.length,p=await setup(source,at),before=await state(p),started=Date.now();
  await p.locator('#editorModeblocks').click();const ms=Date.now()-started;await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const view=await p.evaluate(()=>{const s=Akari.app.editorState.main,n=document.querySelector('#blockEditor .blockui-selected'),r=n?.getBoundingClientRect(),w=document.querySelector('#blockEditor .blockui-workspace').getBoundingClientRect();return{selection:s.blockSelection,focused:document.activeElement?.dataset.blockId===s.blockSelection,count:document.querySelectorAll('#blockEditor .blockui-statement').length,path:n?.querySelector(':scope > .blockui-shape path')?.getAttribute('d'),visible:!!r&&r.bottom>w.top&&r.top<w.bottom,line:s.nodeMap.get(s.blockSelection)?.sourceSpan?.startLine}});
  assert.equal((await state(p)).mode,'blocks');assert(view.count<=120);assert(view.focused&&view.visible&&view.path);assert.equal(view.line,where==='start'?1:where==='middle'?Math.floor(n/2)+1:n);
  await p.screenshot({path:path.join(out,`${n}-${where}.png`)});const backStarted=Date.now();await p.locator('#editorModecode').click();const backMs=Date.now()-backStarted;assert.deepEqual(await state(p),before);results.push({id:'B09-LONG-SWITCH',n,characters:source.length,where,inputMs:p.inputMs,ms,backMs,redoPreserved:before.redo,...view,roundTrip:true});await p.close();
 }
 const source=['1と言う。',...Array(298).fill('何もしない。'),'2と言う。'].join('\n'),p=await setup(source,source.length),before=await state(p);await p.locator('#editorModeblocks').click();const root=p.locator('#blockEditor');
 const ids=()=>root.locator('.blockui-statement').evaluateAll(ns=>ns.map(n=>n.dataset.blockId));let rendered=await ids();assert.equal(rendered.length,120);
 for(const action of ['body-gap-next','body-gap-previous','body-gap-next']){
  await root.locator(`[data-blockui-action="${action}"]`).click();const next=await ids();assert(rendered.every(id=>next.includes(id)));assert(next.length>rendered.length&&next.length<=300);rendered=next;
  const current=await state(p);assert.deepEqual({...current,mode:'code'},before);
 }
 assert.equal(rendered.length,300);assert.equal(await root.locator('.blockui-body-gap').count(),0);
 const say=root.locator('.blockui-node[data-schema-id="Say"]').first();async function move(){await say.locator(':scope > .blockui-node-head .blockui-actions > summary').click();await say.locator(':scope > .blockui-node-head [data-blockui-action="move"]').click();}
 await move();await p.keyboard.press('Escape');assert.deepEqual({...await state(p),mode:'code'},before);
 await move();await root.locator('.blockui-script > .blockui-node-content > .blockui-body > [data-insert-index="300"]').click();
 assert.deepEqual(await p.evaluate(()=>Akari.app.editorState.main.syntaxAst.body.slice(-2).map(n=>n.value.value)),[2,1]);assert.equal((await state(p)).history,before.history+1);
 await p.locator('#undoBtn').click();assert.equal((await state(p)).source,source);assert.equal((await state(p)).redo,1);await p.locator('#redoBtn').click();assert.deepEqual(await p.evaluate(()=>Akari.app.editorState.main.syntaxAst.body.slice(-2).map(n=>n.value.value)),[2,1]);
 results.push({id:'B09-LONG-GAP',pagesRetained:true,all300Reachable:true,cancel:true,moveAcrossOriginalGap:true,undoRedo:true});await p.screenshot({path:path.join(out,'gap-move.png')});await p.close();
 }finally{await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({manifest,browser:browser.version(),results},null,2));console.log('LONG_REGRESSION',JSON.stringify(results));}
})().catch(e=>{console.error(e);process.exitCode=1});
