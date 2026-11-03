import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {buildDerivedProduct} from '../../extensions/build.mjs';
import {answerProductConfirms} from './product-dialogs.cjs';
import {pressStop} from './stop-press.cjs';

// Independent fixtures from EXTENSIONS.md factory/context and LANGUAGE.md extension-event lifetime.
const manifest={id:'audit.context',name:'監査の見え方',version:'1.0.0',apiContract:1,
  standard:{languageContractId:4,runtimeContractId:4},description:'公開APIの見え方を確かめる。',
  dependencies:[],capabilities:[],offline:true,selfContained:true,state:{formatVersion:1,initial:null},
  commands:[{id:'inspect',name:'見え方を記録する',description:'呼出しの見え方を記録する。',args:[{name:'番号',type:'number',unit:null}],returns:{type:'number',unit:null},async:false},{id:'hold',name:'停止を待つ',description:'実行中の呼出しを保つ。',args:[],returns:{type:'number',unit:null},async:true},{id:'read-later',name:'あとで読み直す',description:'ほかの本文が動いた後の見え方を読む。',args:[],returns:{type:'number',unit:null},async:true}],
  calculations:[{id:'inspect-value',name:'見え方を数にする',description:'計算の呼出しを記録する。',args:[{name:'番号',type:'number',unit:null}],returns:{type:'number',unit:null},async:false}],
  events:[{id:'changed',name:'数が変わった',description:'数を届ける。',payload:{type:'number',unit:null}},{id:'stage-changed',name:'舞台の数が変わった',description:'舞台へ数を届ける。',payload:{type:'number',unit:null}}]};
function contextFactory(api){
  globalThis.auditContextRecords=[];globalThis.auditContextRefs=[];globalThis.auditFactorySignal=api.signal;globalThis.auditHeldContext=null;globalThis.auditAsyncContext=null;globalThis.auditAsyncResult=null;globalThis.auditReleaseAsync=null;
  let first;
  function record(args,context,kind){
    'use strict';
    const view=context.runtime.actor(context.runtimeId),second=context.runtime.actor(context.runtimeId),before=view&&{...view};
    let writeRejected=false;if(view)try{view.x=999;}catch(error){writeRejected=error instanceof TypeError;}
    const after=context.runtime.actor(context.runtimeId),row={tag:args[0],kind,runtimeId:context.runtimeId,
      contextKeys:Object.keys(context).sort(),contextFrozen:Object.isFrozen(context),runtimeKeys:Object.keys(context.runtime),runtimeFrozen:Object.isFrozen(context.runtime),
      signal:context.signal instanceof AbortSignal,initiallyActive:!context.signal.aborted,session:typeof context.sessionId==='string'&&context.sessionId.length>0,
      viewKeys:view?Object.keys(view).sort():null,viewFrozen:view?Object.isFrozen(view):null,fresh:view?view!==second:null,
      before,after:after&&{...after},writeRejected,stageNull:context.runtime.actor('stage')===null,unknownNull:context.runtime.actor('no-such-actor')===null};
    if(args[0]===1)first={context,view};
    if(args[0]===3)row.later={snapshot:{...first.view},current:{...first.context.runtime.actor(first.context.runtimeId)}};
    if(args[0]===80){try{api.emit('not-registered',1);row.unknownEmissionRejected=false;}catch(_){row.unknownEmissionRejected=true;}}
    globalThis.auditContextRecords.push(row);globalThis.auditContextRefs.push(context);
    if(args[0]===5){api.emit('changed',17);api.emit('stage-changed',19);}
    return args[0];
  }
  return{commands:{'read-later':async function(_args,context){'use strict';const view=context.runtime.actor(context.runtimeId),before={...view};record([41],context,'async-before');globalThis.auditAsyncContext=context;await new Promise(resolve=>globalThis.auditReleaseAsync=resolve);record([43],context,'async-after');globalThis.auditAsyncResult={before,snapshot:{...view},after:{...context.runtime.actor(context.runtimeId)}};return 0;},inspect:(args,context)=>record(args,context,'command'),hold:(_args,context)=>{globalThis.auditHeldContext=context;return new Promise(resolve=>context.signal.addEventListener('abort',()=>resolve(0),{once:true}));}},calculations:{'inspect-value':(args,context)=>record(args,context,'calculation')}};
}
const keys=['runtime','runtimeId','sessionId','signal'],viewKeys=['baseId','direction','isClone','runtimeId','x','y'];
export async function observeExtensionRuntimeContracts(browser,product,directory){
  const file=path.join(directory,'context-derived.html');await buildDerivedProduct({product,output:file,extensions:[{manifest,factory:contextFactory}]});
  const context=await browser.newContext(),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
  try{
    await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>!!globalThis.Akari?.app);await answerProductConfirms(page,true);
    async function open(name,scripts){
      const serialized=await page.evaluate(({name,scripts})=>{const p=Akari.makeEmptyProject();p.name=name;Object.assign(p.components[0],{x:320,y:200,direction:30});p.scripts=scripts;return Akari.serializeProject(p,Akari.makeDefaultAssetStore());},{name,scripts});
      await page.locator('#fileInput').setInputFiles({name:name+'.akari.md',mimeType:'text/plain',buffer:Buffer.from(serialized)});
      await page.waitForFunction(name=>Akari.app.project.name===name,name);return serialized;
    }
    const inspect=n=>'拡張「audit.context」「inspect」（'+n+'）。';
    await open('handler-context',[
      {id:'base-start',targetId:'sprite-1',event:'start',source:inspect(1)+'\n自分のコピーを作る。\nいまのばしょから、右へ10歩動く。\n向きを300度にする。\n'+inspect(3)+'\n拡張計算「audit.context」「inspect-value」（4）を言う。\n拡張「audit.context」「hold」（）。'},
      {id:'clone-start',targetId:'sprite-1',event:'cloneStart',source:inspect(2)},
      {id:'stage-start',targetId:'stage',event:'start',source:inspect(0)}]);
    await page.locator('#runBtn').click();await page.waitForFunction(()=>globalThis.auditContextRecords?.length===5&&!!globalThis.auditHeldContext);
    const observations=await page.evaluate(()=>auditContextRecords),base=observations.find(r=>r.tag===1),later=observations.find(r=>r.tag===3),clone=observations.find(r=>r.tag===2),stage=observations.find(r=>r.tag===0);
    for(const row of observations){assert.deepEqual(row.contextKeys,keys);assert.deepEqual(row.runtimeKeys,['actor']);assert.ok(row.contextFrozen&&row.runtimeFrozen&&row.signal&&row.initiallyActive&&row.session&&row.stageNull&&row.unknownNull);
      if(row.before){assert.deepEqual(row.viewKeys,viewKeys);assert.ok(row.viewFrozen&&row.fresh&&row.writeRejected);assert.deepEqual(row.before,row.after);}}
    assert.deepEqual(base.before,{runtimeId:'sprite-1',baseId:'sprite-1',isClone:false,x:320,y:200,direction:30});
    assert.deepEqual(later.later.snapshot,base.before);assert.deepEqual(later.later.current,{...base.before,x:330,direction:300});
    assert.equal(clone.before.baseId,'sprite-1');assert.equal(clone.before.isClone,true);assert.notEqual(clone.before.runtimeId,'sprite-1');assert.deepEqual([clone.before.x,clone.before.y,clone.before.direction],[320,200,30]);assert.equal(stage.before,null);
    assert.ok(observations.some(r=>r.kind==='calculation'));assert.equal(await page.evaluate(()=>auditHeldContext.signal.aborted),false);await pressStop(page.locator('#stopBtn'));
    const aborted=await page.evaluate(()=>({session:auditFactorySignal.aborted,active:auditHeldContext.signal.aborted}));assert.deepEqual(aborted,{session:true,active:true});
    const handlerContext={commandsAndCalculations:true,contextKeys:keys,contextFrozen:true,runtimeFrozen:true,viewKeys,freshFrozenView:true,
      original:[320,200,30],later:[330,200,300],snapshotUnchanged:true,writeRejected:true,writeHasNoEffect:true,cloneOwnView:true,stageNull:true,unknownNull:true,signalsInitiallyActive:true,stopAbortsSessionSignal:true,stopAbortsActiveCallSignal:true};
    const eventScripts=[{id:'event-source',targetId:'sprite-1',event:'start',source:inspect(5)},
      // Deliberately list the component body first; status ordering is stage/component registration order.
      {id:'part-event',targetId:'sprite-1',event:'message',filter:{message:'拡張:audit.context/changed'},source:'拡張「audit.context」「inspect」（拡張「できごとの値」）。'},
      {id:'stage-event',targetId:'stage',event:'message',filter:{message:'拡張:audit.context/stage-changed'},source:'拡張「audit.context」「inspect」（拡張「できごとの値」）。'}];
    await open('registered-events',eventScripts);await page.locator('#runBtn').click();await page.waitForFunction(()=>globalThis.auditContextRecords?.filter(r=>r.tag===17||r.tag===19).length===2);
    await page.waitForFunction(()=>document.querySelector('#statusText').textContent.includes('拡張:audit.context/stage-changed'));
    const registered=await page.evaluate(()=>({rows:auditContextRecords.filter(r=>r.tag===17||r.tag===19),finished:document.body.classList.contains('run-finished'),status:document.querySelector('#statusText').textContent,
      sameSession:auditContextRefs.every(c=>c.sessionId===auditContextRefs[0].sessionId)}));
    assert.equal(registered.finished,false);assert.equal(registered.status,'「拡張:audit.context/stage-changed」の 合図を 受けると 動くよ');assert.equal(registered.sameSession,true);
    assert.deepEqual(registered.rows.map(r=>[r.runtimeId,r.tag]).sort(),[['sprite-1',17],['stage',19]]);for(const row of registered.rows){assert.deepEqual(row.contextKeys,keys);assert.equal(row.contextFrozen,true);}await pressStop(page.locator('#stopBtn'));
    const finishing=[];
    for(const filter of [null,'拡張:audit.context/not-registered','拡張:not.registered/changed']){
      const scripts=[{id:'finite-start',targetId:'sprite-1',event:'start',source:'「終わり」と言う。'}];if(filter)scripts.push({id:'ordinary-message',targetId:'sprite-1',event:'message',filter:{message:filter},source:'「来た」と言う。'});
      await open('finite-'+finishing.length,scripts);await page.locator('#runBtn').click();await page.waitForFunction(()=>document.body.classList.contains('run-finished'));finishing.push(true);await pressStop(page.locator('#stopBtn'));
    }
    const negatives=await page.evaluate(()=>{const rejects=source=>{const p=Akari.makeEmptyProject();p.scripts[0].source=source;return Akari.compileProject(p).errors.length>0;};
      const p=Akari.makeEmptyProject();p.scripts=[{id:'bad-sensor',targetId:'sprite-1',event:'message',filter:{message:'拡張:audit.context/not-registered'},source:'拡張「できごとの値」を言う。'}];
      return{unknownCommand:rejects('拡張「audit.context」「not-registered」（1）。'),unknownCalculation:rejects('拡張計算「audit.context」「not-registered」（1）を言う。'),unregisteredEventValue:Akari.compileProject(p).errors.length>0};});assert.deepEqual(negatives,{unknownCommand:true,unknownCalculation:true,unregisteredEventValue:true});
    await open('unknown-emission',[{id:'emit-start',targetId:'sprite-1',event:'start',source:inspect(80)}]);await page.locator('#runBtn').click();await page.waitForFunction(()=>globalThis.auditContextRecords?.length===1);assert.equal(await page.evaluate(()=>auditContextRecords[0].unknownEmissionRejected),true);await pressStop(page.locator('#stopBtn'));
    // A-06/P18 on both real surfaces: an async handler keeps its original immutable snapshot while another body moves it.
    const asyncWork=await page.evaluate(()=>{const p=Akari.makeEmptyProject();p.name='async-context-surfaces';Object.assign(p.components[0],{name:'ねこ',x:320,y:200,direction:30});p.scripts=[
      {id:'async-read',targetId:'sprite-1',event:'start',source:'拡張「audit.context」「read-later」（）。'},
      {id:'other-body',targetId:'stage',event:'start',source:'0.01秒待つ。\nねこは、いまのばしょから、右へ10歩動く。\nねこは向きを300度にする。'}];return{serialized:Akari.serializeProject(p,Akari.makeDefaultAssetStore()),player:Akari.generateStandaloneHtml(p,Akari.makeDefaultAssetStore())};});
    const asyncPlayer=path.join(directory,'context-async-player.html');fs.writeFileSync(asyncPlayer,asyncWork.player);
    const exerciseAsync=async(p,start)=>{await p.locator(start).click();await p.waitForFunction(()=>{const c=globalThis.auditAsyncContext,a=c?.runtime.actor(c.runtimeId);return !!globalThis.auditReleaseAsync&&a?.x===330&&a?.y===200&&a?.direction===300;});
      assert.equal(await p.evaluate(()=>auditAsyncResult),null,'handler still waits while the other body moves');await p.evaluate(()=>auditReleaseAsync());await p.waitForFunction(()=>!!globalThis.auditAsyncResult);
      const observed=await p.evaluate(()=>({result:auditAsyncResult,rows:auditContextRecords.filter(r=>r.tag===41||r.tag===43)}));
      assert.deepEqual(observed.result,{before:{runtimeId:'sprite-1',baseId:'sprite-1',isClone:false,x:320,y:200,direction:30},snapshot:{runtimeId:'sprite-1',baseId:'sprite-1',isClone:false,x:320,y:200,direction:30},after:{runtimeId:'sprite-1',baseId:'sprite-1',isClone:false,x:330,y:200,direction:300}});
      assert.deepEqual(observed.rows.map(r=>r.tag),[41,43]);for(const row of observed.rows){assert.deepEqual(row.contextKeys,keys);assert.deepEqual(row.runtimeKeys,['actor']);assert.deepEqual(row.viewKeys,viewKeys);assert.ok(row.contextFrozen&&row.runtimeFrozen&&row.viewFrozen&&row.fresh&&row.initiallyActive&&row.signal&&row.session&&row.writeRejected&&row.stageNull&&row.unknownNull);assert.deepEqual(row.before,row.after);}
      return observed.result;};
    await page.locator('#fileInput').setInputFiles({name:'async-context.akari.md',mimeType:'text/plain',buffer:Buffer.from(asyncWork.serialized)});await page.waitForFunction(()=>Akari.app.project.name==='async-context-surfaces');const editorAsync=await exerciseAsync(page,'#runBtn');await pressStop(page.locator('#stopBtn'));
    const playerContext=await browser.newContext(),playerPage=await playerContext.newPage();playerPage.on('pageerror',e=>errors.push(e.message));playerPage.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});let playerAsync;
    try{await playerPage.goto(pathToFileURL(asyncPlayer).href);await playerPage.waitForFunction(()=>document.querySelector('#playerRoot')?.dataset.state==='READY');playerAsync=await exerciseAsync(playerPage,'#playerStart');await pressStop(playerPage.locator('#playerStop'));}finally{await playerContext.close();}
    assert.deepEqual(playerAsync,editorAsync);handlerContext.asyncSurfaces={editor:true,player:true,before:[320,200,30],after:[330,200,300],snapshotUnchanged:true,frozenReadOnly:true,stageNull:true,unknownNull:true};
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
    return{handlerContext,eventLifetime:{registeredKeepsRunning:true,registeredValues:[['sprite-1',17],['stage',19]],eventContextsFrozen:true,sameSession:true,stageFirstStatus:true,
      noBodyFinishes:finishing[0],unknownEventFinishes:finishing[1],unknownExtensionFinishes:finishing[2],unknownCommandRejected:true,unknownCalculationRejected:true,unregisteredEventValueRejected:true,unknownEmissionRejected:true}};
  }finally{await context.close();}
}
