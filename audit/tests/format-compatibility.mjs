import { currentProductFile } from "./../lib/product-path.cjs";
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {snapshot,sha,withBrowser,pageFor} from '../lib/product-test-host.mjs';
import {formatCompatibilityIds,verifyFormatCompatibility,checkFormatValidatorNegatives} from '../lib/format-compatibility-contract.mjs';

const require=createRequire(import.meta.url);
const {loadApi}=require('../browser/cases/audit-lib.cjs');
const [browserPath,output]=process.argv.slice(2);
assert.ok(output && !fs.existsSync(output),'fresh format evidence path required');
fs.mkdirSync(path.dirname(output),{recursive:true});
checkFormatValidatorNegatives();
const product=currentProductFile(),before=snapshot(product),source=fs.readFileSync(product,'utf8');
const producerPattern=/(const PRODUCT_RELEASE\s*=\s*['"])([^'"]+)(['"])/g;
const found=[...source.matchAll(producerPattern)];
assert.equal(found.length,1,'one product release declaration required');
const currentRelease=found[0][2],priorRelease=currentRelease==='1.0.0'?'0.9.9':'1.0.0';
assert.notEqual(currentRelease,priorRelease);
const priorSource=source.replace(producerPattern,(_all,a,_value,b)=>a+priorRelease+b);
assert.notEqual(priorSource,source,'prior producer fixture must be a different product build');
const api=loadApi(source),priorApi=loadApi(priorSource),plain=x=>JSON.parse(JSON.stringify(x));
const contracts={languageContractId:2,runtimeContractId:2,programFormatVersion:2,projectFormatVersion:2};
assert.deepEqual(plain(api.EXECUTABLE_CONTRACT),contracts);
assert.equal(api.PRODUCT_RELEASE,currentRelease);
assert.equal(priorApi.PRODUCT_RELEASE,priorRelease);
const fixture=()=>{
  const p=priorApi.makeDefaultProject();p.name='形式互換の作品';
  // Keep this fixture asset-free so Node-side file parsing tests the data contract,
  // while media decoding stays in its dedicated browser coverage.
  p.components=p.components.filter(component=>component.id!=='sprite-1');
  p.scripts=[
    {targetId:'stage',event:'start',source:'※ 先頭  \n「形式互換」と言う ※ 末尾  \n'},
    {targetId:'button-1',event:'click',source:'表示（二倍（3））を実行する'},
  ];
  p.actions=[{id:'action-format',ownerId:'stage',name:'表示',args:['値'],source:'値を言う'}];
  p.functions=[{id:'function-format',ownerId:'stage',name:'二倍',args:['値'],source:'値 * 2を答えとして返す'}];
  return p;
};
const priorProject=fixture(),savedPrior=priorApi.serializeProject(priorProject);
const results=[],pageErrors=[],networkRequests=[];
async function run(id,fn){
  try{const evidence=await fn();results.push({id,status:'PASS',pass:true,evidence});}
  catch(e){results.push({id,status:'FAIL',pass:false,detail:e.stack});console.error(id,e.message);}
  console.log(id+': '+results.at(-1).status);
}
const reject=fn=>{let error;try{fn();}catch(e){error=e;}assert.ok(error,'incompatible contract accepted');assert.ok(error.code,'rejection must have a product error code');return error.code;};
const editSaved=(text,key,value)=>{
  const needle=`"${key}": 2`;
  assert.equal(text.split(needle).length-1,1,'expected one serialized '+key);
  return text.replace(needle,`"${key}": ${JSON.stringify(value)}`);
};

await run('FORMAT-PROJECT-PRODUCER-INDEPENDENT',async()=>{
  const loaded=await api.parseProjectFile(savedPrior);
  assert.equal(loaded.project.appVersion,priorRelease);
  assert.equal(loaded.project.languageContractId,2);
  assert.equal(loaded.project.formatVersion,2);
  assert.equal('languageVersion' in loaded.project,false);
  assert.deepEqual(plain(loaded.project.scripts),plain(priorProject.scripts),'exact source and ownership survive load');
  assert.deepEqual(plain(loaded.project.actions),plain(priorProject.actions));
  assert.deepEqual(plain(loaded.project.functions),plain(priorProject.functions));
  assert.deepEqual(plain(api.compileProject(loaded.project).errors),[]);
  const currentFile=api.serializeProject(loaded.project,loaded.assetStore);
  assert.ok(currentFile.startsWith(`# あかり ${currentRelease} の作品`));
  assert.equal((await api.parseProjectFile(currentFile)).project.appVersion,currentRelease);
  assert.deepEqual(plain((await api.parseProjectFile(currentFile)).project.scripts),plain(priorProject.scripts));
  return {priorProducer:priorRelease,currentProducer:currentRelease,priorFileSha256:sha(savedPrior),savedFileSha256:sha(currentFile),sourceExact:true};
});
await run('FORMAT-PROJECT-CONTRACT-REJECTION',async()=>{
  const codes=[];
  for(const key of ['formatVersion','languageContractId'])for(const value of [1,'2',null]){
    const p=plain(priorProject);p[key]=value;
    codes.push({key,value,code:reject(()=>api.validateProject(p))});
    codes.push({key,value,fileCode:(await api.parseProjectFile(editSaved(savedPrior,key,value)).then(()=>null,e=>e.code))});
    assert.ok(codes.at(-1).fileCode);
  }
  for(const key of ['formatVersion','languageContractId']){
    const p=plain(priorProject);delete p[key];
    codes.push({key,missing:true,code:reject(()=>api.validateProject(p))});
  }
  for(const label of [null,'','bad\nlabel','<tag>','x'.repeat(81)]){
    const p=plain(priorProject);p.appVersion=label;
    codes.push({producerLabel:label,code:reject(()=>api.validateProject(p))});
  }
  return {rejected:codes};
});
await run('FORMAT-RUNTIME-PRODUCER-INDEPENDENT',async()=>{
  const payload=plain(priorApi.packExecutable(priorProject));
  assert.equal(payload.appVersion,priorRelease);
  for(const [key,value] of Object.entries(contracts))assert.equal(payload[key],value);
  assert.equal('runtimeVersion' in payload,false);
  assert.equal('languageVersion' in payload,false);
  const restored=api.restoreExecutable(payload);
  assert.deepEqual(plain(restored.compiled.items.map(i=>[i.key,i.ownerId])),plain(api.sourceRegistry(priorProject).map(i=>[i.key,i.ownerId])));
  const output=[],runtime=new api.RuntimeModel(restored.project,{});
  const scheduler=new api.EventScheduler(restored.project,restored.compiled,runtime,{say:(id,value)=>output.push([id,value])});
  runtime.reset(42);scheduler.running=true;scheduler.paused=true;scheduler.spawnForRuntime('button-1','click');
  for(let i=0;i<100&&scheduler.ready.length;i++)scheduler.runTurn(true);
  assert.deepEqual(output,[['button-1','6']],'caller and function evaluation survive producer change');
  return {priorProducer:payload.appVersion,programItems:payload.program.length,output};
});
await run('FORMAT-RUNTIME-CONTRACT-REJECTION',async()=>{
  const payload=plain(priorApi.packExecutable(priorProject)),rejected=[];
  for(const key of Object.keys(contracts))for(const value of [1,'2',null]){
    const copy=plain(payload);copy[key]=value;
    rejected.push({key,value,code:reject(()=>api.restoreExecutable(copy))});
  }
  for(const key of Object.keys(contracts)){
    const copy=plain(payload);delete copy[key];rejected.push({key,missing:true,code:reject(()=>api.restoreExecutable(copy))});
  }
  for(const label of [null,'','bad\nlabel','<tag>','x'.repeat(81)]){
    const copy=plain(payload);copy.appVersion=label;
    rejected.push({producerLabel:label,code:reject(()=>api.restoreExecutable(copy))});
  }
  const extra=plain(payload);extra.unexpected=true;
  rejected.push({extraField:true,code:reject(()=>api.restoreExecutable(extra))});
  return {rejected};
});
await run('FORMAT-FINGERPRINT-METADATA-EXCLUSION',async()=>{
  const fingerprint=api.diagnostics.assetStateFingerprint;
  assert.equal(typeof fingerprint,'function');
  const p=plain(priorProject),store=api.makeDefaultAssetStore(),base=fingerprint(p,store);
  p.appVersion=currentRelease;assert.equal(fingerprint(p,store),base,'producer label must not make project dirty');
  p.name+=' 改';assert.notEqual(fingerprint(p,store),base,'content change must make project dirty');
  p.name=priorProject.name;p.languageContractId=1;assert.notEqual(fingerprint(p,store),base,'language contract must affect fingerprint');
  p.languageContractId=2;p.formatVersion=1;assert.notEqual(fingerprint(p,store),base,'project format must affect fingerprint');
  p.formatVersion=2;p.scripts[0].source+='\n';assert.notEqual(fingerprint(p,store),base,'source change must affect fingerprint');
  return {producerIgnored:true,contentAndContractsTracked:true};
});

function editorState(p){return p.evaluate(()=>{
  const s=Akari.app.editorState;
  return {project:JSON.stringify(Akari.app.project),source:s.main.sourceText,dirty:s.dirty,
    owner:s.main.ownerKey,history:s.history,redo:s.redo,
    selected:document.querySelector('#objectSelect').value,event:document.querySelector('#eventSelect').value};
});}
async function reveal(locator){
  if(!await locator.isVisible())for(const panel of await locator.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())
    await panel.locator('.blockui-side-toggle').click();
  for(const details of await locator.locator('xpath=ancestor::details[not(@open)]').all())await details.locator(':scope > summary').click();
  return locator;
}
async function editSource(p,sourceText){
  await (await reveal(p.locator('#objectSelect'))).selectOption('stage');await (await reveal(p.locator('#eventSelect'))).selectOption('start');
  if(await p.locator('#sourceOverview').isVisible())await p.locator('#sourceEditBtn').click();
  await (await reveal(p.locator('#editorModecode'))).click();await (await reveal(p.locator('#codeEditor'))).fill(sourceText);
  await p.waitForFunction(s=>Akari.app.editorState.main.sourceText===s&&Akari.app.editorState.dirty===true&&
    Akari.app.project.scripts.some(row=>row.targetId==='stage'&&row.event==='start'&&row.source===s),sourceText);
}
async function seedAutosave(p,record){
  await p.evaluate(async rec=>{
    await new Promise((resolve,reject)=>{
      const q=indexedDB.open('akari-workspace-f2',1);
      q.onupgradeneeded=()=>q.result.createObjectStore('workspace',{keyPath:'id'});
      q.onerror=()=>reject(q.error);
      q.onsuccess=()=>{const db=q.result,tx=db.transaction('workspace','readwrite');tx.objectStore('workspace').put(rec);
        tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};};
    });
  },record);
}
let browserVersion;
await withBrowser(browserPath,async browser=>{
  browserVersion=browser.version();
  const browserPage=(id,fn)=>pageFor(browser,product,async p=>{
    p.on('dialog',d=>d.accept());
    p.on('pageerror',e=>pageErrors.push(id+': '+e.message));
    p.on('request',r=>{if(/^https?:/.test(r.url()))networkRequests.push(r.url());});
    return fn(p);
  });
  const browserCase=(id,fn)=>run(id,()=>browserPage(id,fn));
  await browserCase('FORMAT-BROWSER-FILE-ROUNDTRIP',async p=>{
    await p.locator('#fileInput').setInputFiles({name:'prior.akari.md',mimeType:'text/markdown',buffer:Buffer.from(savedPrior)});
    await p.waitForFunction(v=>Akari.app.project.appVersion===v,priorRelease);
    assert.equal((await editorState(p)).source,priorProject.scripts[0].source);
    assert.deepEqual(await p.evaluate(()=>Akari.app.project.actions),plain(priorProject.actions));
    const pending=p.waitForEvent('download');await (await reveal(p.locator('#saveBtn'))).click();
    const file=path.join(path.dirname(output),'format-resaved.akari.md');await (await pending).saveAs(file);
    const saved=fs.readFileSync(file,'utf8'),loaded=await api.parseProjectFile(saved);
    assert.equal(loaded.project.appVersion,currentRelease);
    assert.equal(loaded.project.scripts[0].source,priorProject.scripts[0].source);
    return {importedProducer:priorRelease,savedProducer:currentRelease,savedSha256:sha(saved)};
  });
  await browserCase('FORMAT-BROWSER-IMPORT-ATOMICITY',async p=>{
    const unsaved='「未保存のまま」と言う ※ 保持  ';
    await editSource(p,unsaved);const beforeState=await editorState(p);assert.equal(beforeState.dirty,true);
    const badFiles=[editSaved(savedPrior,'formatVersion',1),editSaved(savedPrior,'languageContractId','2'),savedPrior.slice(0,-25)];
    for(let i=0;i<badFiles.length;i++){
      const previousLog=await p.locator('#console').textContent();
      await p.locator('#fileInput').setInputFiles({name:`bad-${i}.akari.md`,mimeType:'text/markdown',buffer:Buffer.from(badFiles[i])});
      await p.waitForFunction(previous=>{const now=document.querySelector('#console').textContent;
        return now!==previous&&now.length>previous.length&&now.slice(previous.length).includes('読み込み失敗')&&Akari.app.editorState.state==='DESIGN';},previousLog);
      const afterState=await editorState(p);
      const {history:beforeHistory,...beforeWork}=beforeState;
      const {history:afterHistory,...afterWork}=afterState;
      assert.deepEqual(afterWork,beforeWork,'rejected import changed current unsaved work');
      assert.ok(afterHistory>=beforeHistory,'rejected import discarded undo history');
    }
    return {rejected:badFiles.length,unsavedSourcePreserved:true};
  });
  await run('FORMAT-BROWSER-AUTOSAVE-RECOVERY',async()=>{
    const fingerprint=priorApi.diagnostics.assetStateFingerprint(priorProject,priorApi.makeDefaultAssetStore());
    const makeRecord=(lastSavedFingerprint,project=plain(priorProject))=>({id:'latest',updatedAt:Date.now(),project,assets:[],selectedId:'stage',currentEvent:'start',lastSavedFingerprint,callableDraft:null});
    for(const [label,savedFingerprint,expectedDirty] of [['clean',fingerprint,false],['dirty','',true]]){
      await browserPage('FORMAT-BROWSER-AUTOSAVE-RECOVERY/'+label,async p=>{
        await seedAutosave(p,makeRecord(savedFingerprint));await p.reload();
        await p.locator('#recoveryModal.show').waitFor();
        assert.notEqual(await p.evaluate(()=>Akari.app.project.name),priorProject.name,'offer must not install record');
        await p.locator('#recoveryRestore').click();
        assert.equal(await p.evaluate(()=>Akari.app.project.appVersion),priorRelease);
        assert.equal((await editorState(p)).source,priorProject.scripts[0].source);
        assert.equal((await editorState(p)).dirty,expectedDirty,label+' recovery dirty state');
      });
    }
    for(const [label,changed] of [['format',p=>{p.formatVersion=1;}],['language',p=>{p.languageContractId='2';}],['malformed',p=>{p.components.push(plain(p.components[0]));}]]){
      await browserPage('FORMAT-BROWSER-AUTOSAVE-RECOVERY/'+label,async p=>{
        const bad=plain(priorProject);changed(bad);await seedAutosave(p,makeRecord('',bad));await p.reload();
        await p.waitForFunction(()=>document.querySelector('#autosaveState').textContent.includes('復元検証に失敗'));
        assert.equal(await p.locator('#recoveryModal.show').count(),0);
        assert.notEqual(await p.evaluate(()=>Akari.app.project.name),priorProject.name,'invalid recovery changed current project');
      });
    }
    return {crossReleaseClean:true,crossReleaseDirty:true,rejectedMalformedAndContractMismatch:true,storageKey:'akari-workspace-f2'};
  });
  await run('FORMAT-BROWSER-STANDALONE-OFFLINE',async()=>{
    const loaded=await api.parseProjectFile(savedPrior);
    const html=api.generateStandaloneHtml(loaded.project,loaded.assetStore);
    const currentToken=`"appVersion":"${currentRelease}"`,priorToken=`"appVersion":"${priorRelease}"`;
    assert.equal(html.split(currentToken).length-1,1,'one embedded payload producer label');
    const crossReleaseHtml=html.replace(currentToken,priorToken);
    assert.ok(crossReleaseHtml.includes(priorToken));
    const file=path.join(path.dirname(output),'format-player.html');fs.writeFileSync(file,crossReleaseHtml);
    const context=await browser.newContext({offline:true}),errors=[],network=[];
    try{
      await context.route(/^https?:/,r=>{network.push(r.request().url());return r.abort();});
      const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
      await p.goto(pathToFileURL(path.resolve(file)).href);
      await p.locator('#playerStart:not([disabled])').click();
      await p.waitForFunction(()=>document.querySelector('#playerOutput').textContent.includes('形式互換')||
        document.querySelector('#formSurface').textContent.includes('形式互換'));
      await p.locator('#playerStop').click();assert.equal(await p.locator('#playerStop').isDisabled(),true);
    }finally{await context.close();}
    pageErrors.push(...errors);networkRequests.push(...network);
    assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
    return {embeddedProducer:priorRelease,generatedBy:currentRelease,generatedSha256:sha(crossReleaseHtml),offline:true};
  });
},360000);
assert.deepEqual(snapshot(product),before,'candidate changed during format audit');
assert.deepEqual(results.map(r=>r.id),formatCompatibilityIds);
const report={schema:'akari-format-compatibility-v1',status:results.every(r=>r.pass)&&!pageErrors.length&&!networkRequests.length?'PASS':'FAIL',snapshot:before,
  environment:'chromium',browser:browserVersion,total:results.length,fixture:{priorRelease,currentRelease,priorProductSha256:sha(priorSource),priorFileSha256:sha(savedPrior)},results,pageErrors,networkRequests};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
verifyFormatCompatibility(report,before);
