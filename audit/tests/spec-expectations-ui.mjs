import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {readExpectationFiles,verifyExpectations,verifyExpectationsUiReport,areas,expectationsRoot} from '../lib/spec-expectations.mjs';

// GA-EXEC (real browser): every screen-operation case (kind ui) of the expectation data, done with the product's own
// controls in the order its steps give. The checks below follow each case's steps and assert its listed results;
// they hold no expected value of their own beyond what the case text says.
// usage: node audit/tests/spec-expectations-ui.mjs <browser> <result.json>
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const {revealRegressionControl:reveal,openPaletteTools}=require('../browser/cases/regression-setup.cjs');
const {loadApi}=require('../browser/cases/audit-lib.cjs');
const [browserPath,out]=process.argv.slice(2);
assert.ok(browserPath&&out,'usage: node audit/tests/spec-expectations-ui.mjs <browser> <result.json>');
const product=currentProductFile(),inputs=snapshot(product),A=loadApi(fs.readFileSync(product,'utf8'));
const files=readExpectationFiles();assert.deepEqual(verifyExpectations(files).problems,[],'expectation data is not well formed');
const uiCases=areas.flatMap(area=>files[area].cases.cases.filter(c=>c.kind==='ui'));
const directory=path.resolve(out).replace(/\.json$/,'.artifacts');fs.mkdirSync(directory,{recursive:true});

// Works the steps start from: parts named in the cases, text costumes, no body yet (and one with a 名人 body).
const PARTS=[['w-neko','ねこ'],['w-dango','だんご'],['w-takudon','たくどん'],['w-inu','犬']];
function work(meijinSource=null){
  const p=A.makeEmptyProject(),base=p.components.find(c=>c.type==='sprite');
  p.components=PARTS.map(([id,name],i)=>({...structuredClone(base),id,name,x:80+120*i,y:150,w:60,h:60,costumes:[{id:id+'-face',name:'顔',kind:'text',value:'●'}],costumeId:id+'-face'}));
  p.scripts=[];
  if(meijinSource!==null){const s={id:'w-meijin',mode:'meijin',targetId:'meijin',event:'start',source:''};p.scripts.push(s);A.updateScriptSource(s,meijinSource,p);}
  return A.serializeProject(p);
}
const workFiles={parts:path.join(directory,'parts.akari.md'),meijin:path.join(directory,'meijin.akari.md')};
fs.writeFileSync(workFiles.parts,work());fs.writeFileSync(workFiles.meijin,work('ねこは右へ10歩動く。'));

const browser=await chromium.launch({executablePath:browserPath,headless:true});
const pageErrors=[],network=[];
async function open({level='basic',file='parts'}={}){
  const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
  await context.route(/^https?:\/\//,r=>{network.push(r.request().url());return r.abort();});
  const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>pageErrors.push(e.message));
  await page.addInitScript(l=>{try{localStorage.setItem('akari.uiLevel.v1',l);}catch(_){}},level);
  await page.goto(pathToFileURL(product).href);await page.waitForFunction(()=>!!globalThis.Akari?.app);
  if(file){await page.setInputFiles('#fileInput',workFiles[file]);await page.waitForFunction(()=>Akari.app.project.components.some(c=>c.name==='ねこ'));}
  if(await page.locator('#uiLevel').inputValue()!==level){await page.selectOption('#uiLevel',level);}
  return {page,context};
}
const S=page=>({
  page,
  select:async id=>{await (await reveal(page.locator('#objectSelect'))).selectOption(id);await page.waitForTimeout(150);},
  code:async()=>{if(await page.locator('#editorModecode').getAttribute('aria-pressed')!=='true')await page.click('#editorModecode');await page.waitForTimeout(150);},
  blocks:async()=>{await page.click('#editorModeblocks');await page.waitForTimeout(250);},
  mode:()=>page.evaluate(()=>document.querySelector('#editorModeblocks').getAttribute('aria-pressed')==='true'?'blocks':'code'),
  write:async text=>{await page.fill('#codeEditor',text);await page.waitForTimeout(450);},
  text:()=>page.locator('#codeEditor').inputValue(),
  visible:selector=>page.locator(selector).isVisible(),
  scripts:()=>page.evaluate(()=>Akari.app.project.scripts.map(s=>({id:s.id,mode:s.mode||'normal',targetId:s.targetId,source:s.source}))),
  check:async()=>{await page.click('#diagnoseBtn');
    const opened=await page.locator('#diagnosisModal').waitFor({state:'visible',timeout:1500}).then(()=>true,()=>false);
    if(!opened){const text=await page.locator('#editorPending').isVisible()?await page.locator('#editorPending').textContent():'';return {issues:text?[text]:[],notes:[],where:'editor'};}
    const r=await page.evaluate(()=>({issues:[...document.querySelectorAll('#diagnosisBody .diagnosis-issue')].map(x=>x.textContent),notes:[...document.querySelectorAll('#diagnosisBody .diagnosis-note')].map(x=>x.textContent)}));
    await page.click('#diagnosisClose');await page.locator('#diagnosisModal').waitFor({state:'hidden'});return {...r,where:'list'};},
  startMeijin:async accept=>{let kind=null;page.once('dialog',d=>{kind=d.type();accept?d.accept():d.dismiss();});await page.click('#meijinStart');await page.waitForTimeout(300);return kind;},
});
const bare=t=>t.replace(/\s+/g,'');
const runs=[];
// Each route returns { expect: {…}, info: {…} }: every expect entry is true when that result of the case was seen.
const notice='だんごはすぐ話します（待つのはねこだけです）';
const blockInput=async(page,value)=>{const inputs=page.locator('#blockEditor input');const n=await inputs.count();for(let i=0;i<n;i++)if(await inputs.nth(i).inputValue()===value)return inputs.nth(i);return null;};
const checks={
  // ── common ──
  'CC-055':async s=>{await s.select('w-neko');await s.code();await s.write('ねこは「こんにちは」と言う。\nねこは1秒待つ。\nだんごは「やあ」と言う。');
    const r=await s.check();await s.page.click('#exportBtn');await s.page.locator('#exportChoiceModal').waitFor({state:'visible'});
    const title=await s.page.locator('#exportChoiceTitle').textContent();await s.page.click('#exportChoiceCancel');
    return {expect:{notice:r.notes.some(n=>bare(n).includes(notice)),exportOpens:bare(title)==='作品のはじめ方をえらぼう'},info:r};},
  'CC-056':async s=>{await s.select('w-neko');await s.code();await s.write('ねこは「こんにちは」と言う。\nねこは1秒待つ。\nだんごは「やあ」と言う。');
    const first=await s.check();await s.page.click('#runBtn');await s.page.waitForTimeout(500);const runs=await s.page.evaluate(()=>document.querySelector('#formSurface').innerText.includes('こんにちは'));
    await s.page.click('#stopBtn');await s.page.waitForTimeout(300);
    await s.write('ねこは「こんにちは」と言う。\nねこは\nだんごは「やあ」と言う。');const second=await s.check();
    return {expect:{firstNotice:first.notes.some(n=>bare(n).includes(notice)),firstNoIssue:first.issues.length===0,runs,secondIssue:second.issues.some(t=>/2行目|2行/.test(t))},info:{first,second}};},
  'CC-076':async s=>{await s.select('w-neko');await s.blocks();const root=s.page.locator('#blockEditor');await openPaletteTools(root);
    await (await reveal(root.locator('[data-blockui-palette-mode]'))).selectOption('statement');await (await reveal(root.locator('[data-blockui-search]'))).fill('MotionCommand:MOVE_DIRECTION');
    await root.locator('.blockui-palette-item [data-blockui-schema="MotionCommand:MOVE_DIRECTION"]').first().click();await s.page.waitForTimeout(300);
    const role=r=>root.locator(`[data-blockui-structured-role="${r}"]`).last();
    const placed=await role('actorRef.particle').inputValue();
    await (await reveal(role('actorRef.kind'))).selectOption('named');await (await reveal(role('actorRef.name'))).fill('ねこ');await role('actorRef.name').press('Enter');await s.page.waitForTimeout(300);
    await (await reveal(role('actorRef.particle'))).selectOption('が');await s.page.waitForTimeout(300);
    await s.code();const text=(await s.text()).trim();await s.blocks();const after=await role('actorRef.particle').inputValue();
    return {expect:{newBlockHa:placed==='は',codeGa:text==='ねこが画面の右へ10歩動く。',blockStillGa:after==='が'},info:{text}};},
  'CC-077':async s=>{await s.select('w-neko');await s.code();await s.write('ねこが右へ10歩動く。');await s.page.click('#formatBtn');await s.page.waitForTimeout(300);
    const formatted=(await s.text()).trim();await s.blocks();const particle=await s.page.locator('#blockEditor [data-blockui-structured-role="actorRef.particle"]').last().inputValue();
    await s.code();const back=(await s.text()).trim();
    return {expect:{formatted:formatted==='ねこが画面の右へ10歩動く。',blockGa:particle==='が',backToCode:back==='ねこが画面の右へ10歩動く。'},info:{formatted,back}};},
  'CC-091':async s=>{await s.select('w-takudon');await s.blocks();const root=s.page.locator('#blockEditor');await openPaletteTools(root);
    const add=async schema=>{await (await reveal(root.locator('[data-blockui-search]'))).fill(schema);await s.page.waitForTimeout(150);await root.locator(`.blockui-palette-item [data-blockui-schema="${schema}"]`).first().click();await s.page.waitForTimeout(300);};
    const tree=()=>s.page.evaluate(()=>{const w=x=>({s:x.schemaId,id:x.id,b:Object.fromEntries(Object.entries(x.bodies||{}).map(([k,a])=>[k,a.map(w)]))});return w(Akari.app.editorState.main.blockView);});
    const subject=async(id,name)=>{const kind=root.locator(`[data-blockui-structured-role="actorRef.kind"][data-block-id="${id}"]`);await (await reveal(kind)).selectOption('named');
      const input=root.locator(`[data-blockui-structured-role="actorRef.name"][data-block-id="${id}"]`);await (await reveal(input)).fill(name);await input.press('Enter');await s.page.waitForTimeout(300);};
    await add('RepeatCount');let t1=await tree();const repeat=t1.b.body[0].id,hole=t1.b.body[0].b.body[0].id;
    const count=root.locator(`.blockui-node[data-block-id="${repeat}"] input[aria-label$="数"]`).first();await (await reveal(count)).fill('3');await count.press('Enter');await s.page.waitForTimeout(200);
    await subject(repeat,'たくどん');
    await (await reveal(root.locator(`.blockui-node[data-block-id="${hole}"] [data-blockui-action="hole-select-statement"]`).first())).click();await s.page.waitForTimeout(150);await add('MotionCommand:MOVE_DIRECTION');
    let t2=await tree();const move=t2.b.body[0].b.body[0].id;await subject(move,'たくどん');
    await (await reveal(root.locator(`[data-blockui-action="body-insert"][data-parent-id="${repeat}"][data-insert-index="1"]`).first())).click();await s.page.waitForTimeout(150);await add('Say');
    let t3=await tree();const say=t3.b.body[0].b.body[1].id;await subject(say,'だんご');
    await s.code();const lines=(await s.text()).split('\n');
    return {expect:{heading:lines[0]==='たくどんは、3回くり返す。',moveWithoutSubject:lines[1]==='  画面の右へ10歩動く。',otherSubject:/^ {2}だんごは.+と言う。$/.test(lines[2]||'')},info:{lines}};},
  'CC-151':async s=>{const pen=()=>s.page.evaluate(()=>{const c=document.querySelector('#penCanvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n;});
    await s.select('w-neko');await s.code();await s.write('ペンを下ろす。\n右へ100歩動く。');await s.select('stage');await s.code();await s.write('2秒待つ。\n作品の線とスタンプを全部消す。');
    const check=await s.check();await s.page.click('#runBtn');await s.page.waitForTimeout(1000);const early=await pen();await s.page.waitForTimeout(2300);const late=await pen();
    return {expect:{lineAtOneSecond:early>0,clearedAfterThree:late===0,noIssue:check.issues.length===0},info:{early,late}};},
  'CC-155':async s=>{await s.select('w-neko');await s.code();await s.write('タイマーを0にする。');await s.blocks();
    const mode=await s.mode(),blocks=await s.page.evaluate(()=>{const ids=[];const walk=x=>{if(x.schemaId!=='Script')ids.push(x.schemaId);for(const b of Object.values(x.bodies||{}))b.forEach(walk);};walk(Akari.app.editorState.main.blockView);return ids;});
    await s.code();const code=(await s.text()).trim();
    return {expect:{switched:mode==='blocks',oneTimerBlock:blocks.length===1&&blocks[0]==='TimerReset',sameCode:code==='タイマーを0にする。'},info:{blocks,code}};},
  // ── 名人 ──
  'MC-001':async s=>{await s.select('w-neko');await s.code();return {expect:{button:await s.visible('#meijinStart')}};},
  'MC-002':async s=>{await s.select('w-neko');await s.blocks();return {expect:{noButton:!(await s.visible('#meijinStart'))}};},
  'MC-003':async s=>{await s.select('w-neko');const anywhere=await s.page.evaluate(()=>[...document.querySelectorAll('button,a,summary,option')].some(b=>b.textContent.includes('名人モードで 書く')&&b.offsetParent!==null));
    return {expect:{nowhere:!anywhere,noCode:await s.page.locator('#editorModecode').isDisabled()}};},
  'MC-004':async s=>{await s.select('stage');await s.code();const kind=await s.startMeijin(false);return {expect:{confirm:kind==='confirm',notYet:(await s.scripts()).every(x=>x.mode!=='meijin')}};},
  'MC-005':async s=>{await s.select('stage');await s.code();await s.startMeijin(true);const scripts=await s.scripts();
    const listed=await s.page.evaluate(()=>[...document.querySelectorAll('#objectSelect option')].some(o=>o.value==='meijin'&&o.textContent.includes('名人の本文')));
    return {expect:{meijin:scripts.some(x=>x.mode==='meijin'),ownerless:scripts.filter(x=>x.mode==='meijin').every(x=>x.targetId==='meijin'),listed}};},
  'MC-006':async s=>{await s.select('stage');await s.code();await s.write('ねこは右へ10歩動く。');await s.startMeijin(true);const before=await s.text();await s.page.locator('#editorModeblocks').click({force:true}).catch(()=>{});await s.page.waitForTimeout(250);
    return {expect:{stillCode:(await s.mode())==='code',sameText:(await s.text())===before}};},
  'MC-416':async s=>{await s.select('meijin');await s.code();const meijin=async()=>(await s.scripts()).filter(x=>x.mode==='meijin').length;
    const label=bare(await s.page.locator('#scriptAdd').textContent());await s.page.click('#scriptAdd');await s.page.waitForTimeout(300);
    const bodies=await s.page.evaluate(()=>[...document.querySelectorAll('#eventSelect option')].map(o=>o.textContent.replace(/\s+/g,'')));const added=await meijin();
    s.page.once('dialog',d=>d.accept());await s.page.click('#meijinDelete');await s.page.waitForTimeout(300);const removed=await meijin();
    await s.page.click('#undoBtn');await s.page.waitForTimeout(300);const undone=await meijin();
    return {expect:{label:label==='名人の本文をふやす',listed:bodies.includes('名人の本文1')&&bodies.includes('名人の本文2'),added:added===2,removed:removed===1,undone:undone===2},info:{label,bodies,added,removed,undone}};},
  'MC-417':async s=>{await s.select('w-neko');await s.code();await s.write('右へ10歩動く。');await s.blocks();const before=await s.mode();
    await s.select('meijin');const onMeijin=await s.mode(),text=await s.text();await s.select('w-neko');const back=await s.mode();
    return {expect:{blocksChosen:before==='blocks',meijinInCode:onMeijin==='code'&&text.includes('ねこは右へ10歩動く。'),backToBlocks:back==='blocks'},info:{before,onMeijin,back}};},
  'MC-469':async s=>{await s.select('w-neko');await s.code();await s.write('作品を動かしたとき、\n  「やあ」と言う。');await s.startMeijin(true);
    const scripts=await s.scripts(),meijin=scripts.filter(x=>x.mode==='meijin').map(x=>x.source);
    return {expect:{heading:meijin.some(t=>t.includes('作品を動かしたとき、ねこは、')),body:meijin.some(t=>t.includes('「やあ」と言う。')),moved:!scripts.some(x=>x.mode!=='meijin'&&x.targetId==='w-neko'&&x.source.includes('やあ'))},info:{meijin}};},
  'MC-411':async s=>{await s.select('meijin');await s.code();
    const note=await s.page.evaluate(()=>[...document.querySelectorAll('.mode-blocked-note')].filter(n=>n.offsetParent).map(n=>n.textContent).join(''));
    return {expect:{blocksDisabled:await s.page.locator('#editorModeblocks').isDisabled(),saysCode:bare(note).includes('コードでなおします'),noRedFix:!bare(note).includes('赤いところを直す')},info:{note}};},
  'MC-007':async s=>{await s.select('stage');await s.code();await s.startMeijin(false);const button=await s.visible('#meijinStart');const ordinary=(await s.scripts()).every(x=>x.mode!=='meijin');await s.blocks();
    return {expect:{ordinary,blocks:(await s.mode())==='blocks',buttonStill:button}};},
  'MC-008':async s=>{await s.select('stage');await s.code();await s.write('ねこは右へ10歩動く。');await s.startMeijin(true);await s.page.click('#undoBtn');await s.page.waitForTimeout(300);
    const undone=(await s.scripts()).every(x=>x.mode!=='meijin');await s.blocks();const blocksAfterUndo=(await s.mode())==='blocks';
    await s.code();await s.page.click('#redoBtn');await s.page.waitForTimeout(300);const redone=(await s.scripts()).some(x=>x.mode==='meijin');
    await s.page.locator('#editorModeblocks').click({force:true}).catch(()=>{});await s.page.waitForTimeout(250);
    return {expect:{undone,blocksAfterUndo,redone,noBlocksAfterRedo:(await s.mode())==='code'}};},
  'MC-009':async s=>{const options=await s.page.evaluate(()=>[...document.querySelectorAll('#objectSelect option')].map(o=>[o.value,o.textContent.trim()]));
    const meijin=options.find(([v])=>v==='meijin');if(meijin)await s.select('meijin');
    return {expect:{listed:!!meijin&&meijin[1].includes('名人の本文'),opens:(await s.text()).trim()==='ねこは右へ10歩動く。'},info:{options}};},
  'MC-010':async s=>{await s.select('meijin');await s.write('ねこが右へ10歩動く\n主役が「やあ」と言う');const before=await s.text();
    if(await s.page.locator('#formatBtn').isVisible()&&await s.page.locator('#formatBtn').isEnabled())await s.page.click('#formatBtn');await s.page.waitForTimeout(300);return {expect:{unchanged:(await s.text())===before}};},
  'MC-011':async s=>{await s.select('meijin');const revert=await s.page.evaluate(()=>[...document.querySelectorAll('button,summary,option,a')].some(b=>b.offsetParent!==null&&/通常の本文に|ふつうの本文に|名人モードを ?やめる/.test(b.textContent)));
    await s.page.locator('#editorModeblocks').click({force:true}).catch(()=>{});await s.page.waitForTimeout(250);return {expect:{noRevert:!revert,stillCode:(await s.mode())==='code'}};},
  'MC-012':async s=>{await s.select('meijin');await s.write('【ジャンプ】という手順を、次のように作る。\n  画面の上へ20歩動く。');await s.page.click('#procBtn');await s.page.waitForTimeout(300);
    const before=await s.page.evaluate(()=>[...document.querySelectorAll('#callableSelect option')].map(o=>o.textContent));
    await s.page.click('#callableNewAction');await s.page.fill('#callableName','おじぎ');await s.page.click('#callableSave');await s.page.waitForTimeout(400);
    const after=await s.page.evaluate(()=>[...document.querySelectorAll('#callableSelect option')].map(o=>o.textContent));
    return {expect:{jump:before.some(t=>t.includes('ジャンプ')&&t.includes('（名人の本文）')),bow:after.some(t=>t.includes('おじぎ')&&!t.includes('（名人の本文）'))},info:{before,after}};},
  'MC-013':async s=>{await s.select('meijin');await s.write('【ジャンプ】という手順を、次のように作る。\n  画面の上へ20歩動く。\nねこは【ジャンプ】という手順を行う。');
    await s.select('w-neko');await s.code();await s.write('【ジャンプ】という手順を行う。');await s.page.click('#procBtn');await s.page.waitForTimeout(300);
    const value=await s.page.evaluate(()=>[...document.querySelectorAll('#callableSelect option')].find(o=>o.textContent.includes('ジャンプ'))?.value);
    await s.page.selectOption('#callableSelect',value);await s.page.fill('#meijinProcName','とぶ');await s.page.click('#meijinProcRename');await s.page.waitForTimeout(400);
    if(await s.page.locator('#procModal').isVisible())await s.page.click('#procClose');
    const scripts=await s.scripts(),meijin=scripts.find(x=>x.mode==='meijin').source,neko=scripts.find(x=>x.targetId==='w-neko').source,check=await s.check();
    return {expect:{heading:meijin.includes('【とぶ】という手順を、次のように作る。'),call:meijin.includes('ねこは【とぶ】という手順を行う。'),nekoCall:neko.includes('【とぶ】という手順を行う。'),
      noJump:!scripts.some(x=>x.source.includes('ジャンプ')),noIssue:check.issues.length===0},info:{meijin,neko}};},
  'MC-014':async s=>{await s.select('meijin');await s.write('【ジャンプ】という手順を、次のように作る。\n  画面の上へ20歩動く。');await s.page.click('#procBtn');await s.page.waitForTimeout(300);
    const value=await s.page.evaluate(()=>[...document.querySelectorAll('#callableSelect option')].find(o=>o.textContent.includes('ジャンプ'))?.value);
    await s.page.selectOption('#callableSelect',value);await s.page.waitForTimeout(200);
    const noBodyEditor=await s.page.evaluate(()=>{const c=document.querySelector('#callableCode');return !c||c.offsetParent===null||c.readOnly||c.disabled;});
    await s.page.click('#meijinProcOpen');await s.page.waitForTimeout(300);
    const selected=await s.page.evaluate(()=>{const t=document.querySelector('#codeEditor');return t.value.slice(t.selectionStart,t.selectionEnd);});
    return {expect:{opensLine:selected.includes('【ジャンプ】という手順を、次のように作る。'),noBodyEditor},info:{selected}};},
  'MC-015':async s=>{await s.select('meijin');await s.write('ねこは「やあ」と言う。\nねこは、犬の近くへ行く。');const check=await s.check();
    await s.page.click('#runBtn');await s.page.waitForTimeout(500);const spoke=await s.page.evaluate(()=>document.querySelector('#formSurface').innerText.includes('やあ'));
    if(await s.page.locator('#diagnosisModal').isVisible())await s.page.click('#diagnosisClose');
    return {expect:{showsLine:check.issues.some(t=>/2行目/.test(t)&&bare(t).includes('近く')),showsReason:check.issues.some(t=>bare(t).length>30),notRun:!spoke},info:check};},
  'MC-235':async s=>{await s.select('meijin');await s.write('10秒のあいだ、くり返す。\n  1秒待つ。\n  点数を1増やす。\nねこは「おわり」と言う。');
    const said=()=>s.page.evaluate(()=>document.querySelector('#formSurface').innerText.includes('おわり'));
    const t0=Date.now();await s.page.click('#runBtn');await s.page.waitForTimeout(3000);await s.page.click('#pauseBtn');await s.page.waitForTimeout(5000);
    const duringPause=await said();await s.page.click('#continueBtn');let at=null;
    for(let i=0;i<60&&at===null;i++){await s.page.waitForTimeout(250);if(await said())at=Date.now()-t0;}
    return {expect:{notDuringPause:!duringPause,afterTenRunningSeconds:at!==null&&at>=14500&&at<=17500},info:{at}};},
};
const levelOf=c=>{const steps=c.steps.join(' ');return /「見せ方」で「はじめて」/.test(steps)?'entry':/「見せ方」で「くわしく」/.test(steps)?'advanced':'basic';};
const usesMeijinWork=c=>/名人の本文に|「名人の本文」を選|名人モードの本文を開く|名人モードの本文に|名人の本文を一つ持つ作品/.test(c.steps.join(' '));
for(const c of uiCases){
  const level=levelOf(c),file=usesMeijinWork(c)?'meijin':'parts';
  let page,context;
  try{
    ({page,context}=await open({level,file}));
    if(c.id==='MC-235')await page.evaluate(()=>{const p=Akari.app.project;if(!p.projectData.variables.some(v=>v.name==='点数'))p.projectData.variables.push({id:'w-score',name:'点数',initialValue:0});});
    const fn=checks[c.id];if(!fn)throw Error('no browser route for '+c.id);
    const {expect,info}=await fn(S(page)),missed=Object.entries(expect).filter(([,v])=>v!==true).map(([k])=>k);
    runs.push({id:c.id,level,status:missed.length?'FAIL':'PASS',expect,...(info?{info}:{}),...(missed.length?{detail:'not seen: '+missed.join(',')}:{})});
  }catch(error){runs.push({id:c.id,level,status:'FAIL',detail:(error.message||String(error)).split('\n')[0]});}
  finally{await context?.close();}
}
await browser.close();
const report={schema:'akari-spec-expectations-ui-v1',status:runs.every(r=>r.status==='PASS')&&!pageErrors.length&&!network.length?'PASS':'FAIL',snapshot:inputs,browser:browser.version?.()||null,
  inputs:Object.fromEntries(areas.map(area=>[area+'/cases.json',sha(fs.readFileSync(path.join(expectationsRoot,area,'cases.json')))])),results:runs,pageErrors,network};
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,total:runs.length,passed:runs.filter(r=>r.status==='PASS').length,pageErrors:pageErrors.length}));
for(const r of runs.filter(r=>r.status!=='PASS'))console.error(r.id,r.detail,JSON.stringify(r.observed||{}).slice(0,300));
if(report.status==='PASS')verifyExpectationsUiReport(JSON.parse(JSON.stringify(report)),inputs,{sha});
process.exitCode=report.status==='PASS'?0:1;
