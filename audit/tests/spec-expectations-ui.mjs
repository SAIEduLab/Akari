import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {childSpacingIssues} from '../lib/product-source-contract.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {snapshot,sha} from '../lib/product-test-host.mjs';
import {readExpectationFiles,verifyExpectations,verifyExpectationsUiReport,areas,expectationsRoot} from '../lib/spec-expectations.mjs';
import {VIEW_NAMES,chooseView,shownView,readViewToggle,pressViewToggle,viewRefusalNote} from '../browser/cases/view-toggle.cjs';

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

const {clickNode}=require('../browser/cases/ui-routes.cjs');
// The toolbox's 「はじめから ある キャラクター」 buttons; はじめて's own ＋ buttons (#entryAddRow) carry the same preset names.
const TOOLBOX_PRESET='.tool.sprite-preset';

// Works the steps start from: parts named in the cases, text costumes, the variable 点数 (0), no body yet; one with a 名人
// body, and one that also has 星. Positions are centres from the bottom-left corner of the 640×400 screen.
const PARTS=[['w-neko','ねこ'],['w-dango','だんご'],['w-takudon','たくどん'],['w-inu','犬']];
// The 名人 body keeps running for a while, so the run screen's 「本文を見て たしかめる」 can be pressed (MC-587).
const MEIJIN_SOURCE='ねこは、いまのばしょから、右へ10歩動く。\n3秒待つ。';
function work(meijinSource=null,extra=[]){
  const p=A.makeEmptyProject(),base=p.components.find(c=>c.type==='sprite');
  p.components=[...PARTS,...extra].map(([id,name],i)=>({...structuredClone(base),id,name,x:80+120*i,y:150,w:60,h:60,costumes:[{id:id+'-face',name:'顔',kind:'text',value:'●'}],costumeId:id+'-face'}));
  p.projectData.variables.push({id:'w-score',name:'点数',initialValue:0});
  p.scripts=[];
  if(meijinSource!==null){const s={id:'w-meijin',mode:'meijin',targetId:'meijin',event:'start',source:''};p.scripts.push(s);A.updateScriptSource(s,meijinSource,p);}
  return A.serializeProject(p);
}
const workFiles={parts:path.join(directory,'parts.akari.md'),meijin:path.join(directory,'meijin.akari.md'),star:path.join(directory,'star.akari.md'),f4:path.join(directory,'format-4.akari.md')};
fs.writeFileSync(workFiles.parts,work());fs.writeFileSync(workFiles.meijin,work(MEIJIN_SOURCE));fs.writeFileSync(workFiles.star,work(null,[['w-hoshi','星']]));
// CC-416: a work with the two parts 「おじいさん」「おばあさん」 only.
function kabuWork(){const p=A.makeEmptyProject(),base=p.components.find(c=>c.type==='sprite');
  p.components=[['w-ojii','おじいさん'],['w-obaa','おばあさん']].map(([id,name],i)=>({...structuredClone(base),id,name,x:160+240*i,y:150,w:60,h:60,costumes:[{id:id+'-face',name:'顔',kind:'text',value:'●'}],costumeId:id+'-face'}));
  p.scripts=[];return A.serializeProject(p);}
workFiles.kabu=path.join(directory,'kabu.akari.md');fs.writeFileSync(workFiles.kabu,kabuWork());
// CC-297: a saved work whose data marks are the ones of saved-file format 4.
fs.writeFileSync(workFiles.f4,work().replaceAll('AKARI-PROJECT-F'+A.PROJECT_FORMAT_ID+'-DATA-','AKARI-PROJECT-F4-DATA-'));

const browser=await chromium.launch({executablePath:browserPath,headless:true});
const pageErrors=[],network=[];
async function open({level='basic',view='blocks',file='parts'}={}){
  const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
  await context.route(/^https?:\/\//,r=>{network.push(r.request().url());return r.abort();});
  const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>pageErrors.push(e.message));
  await page.addInitScript(([l,v])=>{try{localStorage.setItem('akari.uiLevel.v1',l);localStorage.setItem('akari.editorMode.v1',v);}catch(_){}},[level,view]);
  await page.goto(pathToFileURL(product).href);await page.waitForFunction(()=>!!globalThis.Akari?.app);
  if(file){await page.setInputFiles('#fileInput',workFiles[file]);await page.waitForFunction(()=>Akari.app.project.components.some(c=>c.name==='ねこ'||c.name==='おじいさん'));}
  // A work with a 名人 text keeps 名人 chosen; the level stays the one chosen before it.
  if(!['meijin',level].includes(await page.locator('#uiLevel').inputValue())){await page.selectOption('#uiLevel',level);}
  return {page,context};
}
// What a block reads on the screen: its words and the values in its fields, without labels, tools or hidden parts.
const readBlock=locator=>locator.evaluate(main=>{const read=el=>{let s='';for(const n of el.childNodes){if(n.nodeType===3){s+=n.textContent;continue;}if(n.nodeType!==1)continue;
  if(n.matches('.blockui-field-label,.blockui-slot-label,.blockui-slot-head,.blockui-node-head,details,datalist,option,script,style')||n.hidden)continue;const cs=getComputedStyle(n);if(cs.display==='none'||cs.visibility==='hidden')continue;
  s+=n.matches('input,textarea')?n.value:n.matches('select')?(n.selectedOptions[0]?.textContent||''):read(n);}return s;};return read(main).replace(/\s+/g,'');});
const S=page=>({
  page,
  select:async id=>{await (await reveal(page.locator('#objectSelect'))).selectOption(id);await page.waitForTimeout(150);},
  // The view on the screen, chosen with the one view toggle 「ブロックモード ⇄」「コードモード ⇄」 (final call 22).
  code:async()=>{await chooseView(page,'code');await page.waitForTimeout(150);},
  blocks:async()=>{await chooseView(page,'blocks');await page.waitForTimeout(250);},
  mode:()=>shownView(page),
  // The view toggle as the screen shows it: its label while it is on the screen and neither pale nor hidden, else ''.
  toggle:()=>page.evaluate(()=>{const b=document.querySelector('#editorModecode:not([hidden]),#editorModeblocks:not([hidden])');if(!b||!b.getClientRects().length)return '';const cs=getComputedStyle(b);
    return cs.visibility==='hidden'||Number(cs.opacity)<1||b.disabled||b.getAttribute('aria-disabled')==='true'?'':b.textContent;}),
  // A press of the view toggle, which shows the label the step names.
  press:async label=>{const t=await readViewToggle(page);if(t.label!==label)throw Error('the view toggle shows '+t.label+', not '+label);await pressViewToggle(page);await page.waitForTimeout(250);},
  // The note under the view toggle while it shows, when it is a role=status note; else ''.
  note:async()=>{const text=await viewRefusalNote(page);if(!text)return '';return await page.locator('#modeBlockedNote').getAttribute('role')==='status'?text:'(not role=status) '+text;},
  // The toolbar's and the run strip's controls as the screen shows them: shown (laid out, not visibility:hidden), place, pressable.
  toolbar:()=>page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.menutool [id], #runStrip [id], #pauseBtn, #continueBtn, #stepBtn, #runtimeInspectBtn')].filter(e=>e.id&&e.matches('button,select,input,details')).map(e=>{const r=e.getBoundingClientRect(),cs=getComputedStyle(e);
    return [e.id,{shown:!!e.getClientRects().length&&cs.visibility!=='hidden',x:r.x,y:r.y,w:r.width,h:r.height,pressable:!e.disabled&&e.getAttribute('aria-disabled')!=='true'}];}))),
  samePlace:(a,b)=>!!a&&!!b&&a.w>0&&b.w>0&&Math.abs(a.x-b.x)<2.5&&Math.abs(a.y-b.y)<2.5,
  // Controls shown on both screens keep their places (the run screen does not pack the bar).
  unmoved:(edit,run,except=[])=>Object.keys(edit).filter(id=>!except.includes(id)&&edit[id].shown&&run[id]?.shown).every(id=>Math.abs(edit[id].x-run[id].x)<2.5&&Math.abs(edit[id].y-run[id].y)<2.5),
  // The work's name while it runs: plain text in the name box's place, not a field to write in. The text is seen, says
  // the work's name and is not an input; the box keeps its room but is not seen and cannot be written in.
  nameIsText:()=>page.evaluate(()=>{const t=[...document.querySelectorAll('.menutool *')].find(e=>e.id!=='projectName'&&e.textContent===Akari.app.project.name&&!e.children.length&&e.getClientRects().length&&getComputedStyle(e).visibility==='visible'),n=document.querySelector('#projectName');
    if(!t)return false;const tr=t.getBoundingClientRect(),nr=n.getBoundingClientRect(),cs=getComputedStyle(n);
    return !t.matches('input,textarea,select,[contenteditable],[contenteditable="true"]')&&(cs.visibility==='hidden'||!n.getClientRects().length)&&n.disabled&&Math.abs(tr.x-nr.x)<2.5&&Math.abs(tr.y-nr.y)<2.5;}),
  write:async text=>{await page.fill('#codeEditor',text);await page.waitForTimeout(450);},
  text:()=>page.locator('#codeEditor').inputValue(),
  visible:selector=>page.locator(selector).isVisible(),
  scripts:()=>page.evaluate(()=>Akari.app.project.scripts.map(s=>({id:s.id,mode:s.mode||'normal',targetId:s.targetId,event:s.event,source:s.source}))),
  check:async()=>{await page.click('#diagnoseBtn');
    const opened=await page.locator('#diagnosisModal').waitFor({state:'visible',timeout:1500}).then(()=>true,()=>false);
    if(!opened){const text=await page.locator('#editorPending').isVisible()?await page.locator('#editorPending').textContent():'';return {issues:text?[text]:[],notes:[],where:'editor'};}
    const r=await page.evaluate(()=>({issues:[...document.querySelectorAll('#diagnosisBody .diagnosis-issue')].map(x=>x.textContent),notes:[...document.querySelectorAll('#diagnosisBody .diagnosis-note')].map(x=>x.textContent)}));
    await page.click('#diagnosisClose');await page.locator('#diagnosisModal').waitFor({state:'hidden'});return {...r,where:'list'};},
  // 名人 is chosen in code (コードで「名人」を選ぶ); the confirm comes before the body becomes a 名人 text.
  startMeijin:async accept=>{let kind=null;const take=d=>{kind=d.type();page.__akariLastDialog={type:kind,message:d.message()};accept?d.accept():d.dismiss();};
    if(await chooseView(page,'code'))await page.waitForTimeout(150);
    page.once('dialog',take);await page.selectOption('#uiLevel','meijin');await page.waitForTimeout(300);page.off('dialog',take);return kind;},
  // The level picker removes the levels the view does not offer (1.5.0: hidden, not disabled).
  level:()=>page.evaluate(()=>({chosen:document.querySelector('#uiLevel').value,shown:document.body.dataset.uiLevel,
    options:[...document.querySelectorAll('#uiLevel option')].filter(o=>!o.hidden).map(o=>o.textContent.trim()),others:[...document.querySelectorAll('#uiLevel option')].filter(o=>o.value!=='meijin'&&!o.disabled&&!o.hidden).map(o=>o.value)})),
  openFile:async file=>{await page.setInputFiles('#fileInput',file);await page.waitForTimeout(300);for(const id of ['#loseConfirmProceed'])if(await page.locator(id).isVisible())await page.click(id);await page.waitForTimeout(500);},
  // The page is loaded again and the autosaved work is restored; seen() looks at the page before 「もどす」 is pressed.
  reload:async(seen=null)=>{await page.waitForTimeout(1500);await page.reload();await page.waitForFunction(()=>!!globalThis.Akari?.app);await page.locator('#recoveryRestore').waitFor({state:'visible'});const before=seen?await seen():null;await page.click('#recoveryRestore');await page.waitForTimeout(500);return before;},
  newWork:async()=>{await (await reveal(page.locator('#newBtn'))).click();await page.waitForTimeout(300);if(await page.locator('#loseConfirmProceed').isVisible())await page.click('#loseConfirmProceed');await page.waitForTimeout(500);},
  // せってい: one row per setting, found by its name.
  prop:async(label,value)=>{const input=page.locator('#properties input[aria-label="'+label+'"]');await (await reveal(input)).fill(String(value));await input.press('Tab');await page.waitForTimeout(150);},
  propValue:label=>page.locator('#properties input[aria-label="'+label+'"]').inputValue(),
  propHelp:label=>page.locator('#properties .prop-row').filter({has:page.locator('input[aria-label="'+label+'"]')}).locator('.prop-help').innerText().catch(()=>''),
  part:name=>page.evaluate(name=>{const c=Akari.app.project.components.find(c=>c.name===name);return c&&{id:c.id,name:c.name,x:c.x,y:c.y,w:c.w,h:c.h,scale:c.scalePercent,direction:c.direction};},name),
  // ▶ 動かす. A ■ 止める pressed within 0.5 s of it is taken as a double press (LANGUAGE.md), so stop waits that out.
  run:async()=>{await page.click('#runBtn');await page.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');},
  stop:async()=>{await page.waitForTimeout(600);await page.click('#stopBtn');await page.waitForFunction(()=>Akari.app.editorState.state==='DESIGN');},
  bubble:id=>page.evaluate(id=>document.querySelector('.sprite-bubble[data-runtime-id="'+id+'"] .sprite-bubble-text')?.textContent??null,id),
  // The palette: a kind's button, the blocks it shows, and a block put into the workspace from it.
  category:async kind=>{const chip=page.locator('#blockEditor [data-blockui-action="palette-category"][data-blockui-category="'+kind+'"]');if(await chip.count()&&await chip.first().isVisible())await chip.first().click();await page.waitForTimeout(200);},
  palette:()=>page.locator('#blockEditor .blockui-palette [data-blockui-schema]').evaluateAll(es=>[...new Set(es.filter(e=>e.getClientRects().length).map(e=>e.dataset.blockuiSchema))]),
  place:async schema=>{await page.locator('#blockEditor .blockui-palette-item [data-blockui-schema="'+schema+'"]').first().click();await page.waitForTimeout(300);},
  // A block's own tools (だれが, ほかのそうさ) show in its head while it is selected.
  who:async(id,name,particle)=>{const node=page.locator('#blockEditor .blockui-node[data-block-id="'+id+'"]');if(!await node.evaluate(e=>e.classList.contains('blockui-selected')))await clickNode(node);
    const role=r=>page.locator('#blockEditor [data-blockui-structured-role="'+r+'"][data-block-id="'+id+'"]');
    await (await reveal(role('actorRef.kind'))).selectOption('named');await (await reveal(role('actorRef.name'))).fill(name);await role('actorRef.name').press('Enter');await page.waitForTimeout(300);
    if(particle){await (await reveal(role('actorRef.particle'))).selectOption(particle);await page.waitForTimeout(300);}
    for(const summary of await page.locator('#blockEditor details.blockui-who[open] > summary').all())if(await summary.isVisible())await summary.click();},
  tree:()=>page.evaluate(()=>{const w=x=>({s:x.schemaId,id:x.id,f:x.fields,i:Object.fromEntries(Object.entries(x.inputs||{}).map(([k,v])=>[k,Array.isArray(v)?v.map(w):w(v)])),b:Object.fromEntries(Object.entries(x.bodies||{}).map(([k,a])=>[k,a.map(w)]))});return w(Akari.app.editorState.main.blockView);}),
});
const bare=t=>t.replace(/\s+/g,'');
const runs=[];
// Each route returns { expect: {…}, info: {…} }: every expect entry is true when that result of the case was seen.
const notice='だんごはすぐ話します（待つのはねこだけです）';
// The touch rule of picture parts (LANGUAGE.md): the 1-second speech of a loop is sampled for a while; every text seen is kept.
const listen=async(s,id,ms=2600)=>{const seen=new Set();for(let t=0;t<ms;t+=200){const text=await s.bubble(id);if(text)seen.add(text);await s.page.waitForTimeout(200);}return [...seen];};
const touchLoop=other=>'ずっとくり返す。\n  もし「'+other+'」にふれていれば、\n    「ふれた」と1秒話す。\n  そうでなければ、\n    「はなれている」と1秒話す。';
// 🎨 お絵かき: a filled circle of the given diameter, drawn with だ円（長い丸） on the 500×500 paper and kept.
const paintCircle=async(s,diameter)=>{const p=s.page,before=await p.evaluate(()=>Akari.app.project.components.map(c=>c.id));
  await (await reveal(p.locator('#paintAdd'))).click();await p.locator('#paintModal.show').waitFor();await p.click('[data-paint-tool="ellipse"]');await p.selectOption('#paintShape','filled');
  const box=await p.locator('#paintCanvas').boundingBox(),k=box.width/500,from=250-diameter/2,to=250+diameter/2;
  await p.mouse.move(box.x+from*k,box.y+from*k);await p.mouse.down();await p.mouse.move(box.x+250*k,box.y+250*k,{steps:4});await p.mouse.move(box.x+to*k,box.y+to*k,{steps:4});await p.mouse.up();
  await p.click('#paintCommit');await p.locator('#paintModal').waitFor({state:'hidden'});
  return p.evaluate(b=>Akari.app.project.components.find(c=>!b.includes(c.id)),before);};
const place=async(s,c,{x,y,w,h,scale=100,direction=0})=>{await s.select(c.id);await s.prop('向き',direction);await s.prop('大きさ%',scale);if(w!==undefined){await s.prop('はば',w);await s.prop('高さ',h);}await s.prop('よこのばしょ',x);await s.prop('たてのばしょ',y);return s.part(c.name);};
// A point of the work screen (よこ, たて from the bottom-left corner) on the page.
const screenPoint=(s,x,y)=>s.page.locator('#formSurface').evaluate((el,[x,y])=>{const r=el.getBoundingClientRect(),st=Akari.app.project.stage;return{x:r.left+x*r.width/st.width,y:r.top+(st.height-y)*r.height/st.height};},[x,y]);
const checks={
  'CC-398':async s=>{const p=s.page;await s.select('w-neko');
    p.once('dialog',d=>d.accept('ベル'));await p.locator('#soundInput').setInputFiles({name:'ベル.wav',mimeType:'audio/wav',buffer:fs.readFileSync('audit/fixtures/audio/tone.wav')});await p.waitForFunction(()=>Akari.app.project.sounds.some(x=>x.name==='ベル'));
    await s.write('「ベル」を鳴らす。');
    // The case explicitly delays asset preparation. Keep the real preparation after releasing that delay.
    await p.evaluate(()=>{const prepare=Akari.AssetRuntimeCache.prototype.prepare;globalThis.__preparationOriginal=prepare;Akari.AssetRuntimeCache.prototype.prepare=async function(...args){await new Promise(resolve=>globalThis.__releasePreparation=resolve);return prepare.apply(this,args);};});
    await p.click('#runBtn');await p.waitForFunction(()=>Akari.app.editorState.state==='PREPARING'&&typeof __releasePreparation==='function');const bar=await s.toolbar();
    await p.evaluate(()=>{Akari.AssetRuntimeCache.prototype.prepare=__preparationOriginal;__releasePreparation();delete globalThis.__preparationOriginal;delete globalThis.__releasePreparation;});await p.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');await s.stop();
    return {expect:{preparingStopOnly:bar.stopBtn.shown&&bar.stopBtn.pressable&&['runBtn','pauseBtn','continueBtn','stepBtn','runtimeInspectBtn'].every(id=>!bar[id].shown)},info:{bar}};},
  'CC-399':async s=>{const p=s.page;await p.locator('#tutorialStart').click();if(await p.locator('#loseConfirmProceed').isVisible())await p.locator('#loseConfirmProceed').click();
    const step=async id=>p.waitForFunction(id=>document.body.dataset.tutorialStep===id,id);await step('choose-click');await p.locator('#entryClickEvent').click();
    const insert=async key=>{await p.locator('#blockEditor [data-blockui-action="body-insert"].tutorial-target,#blockEditor .blockui-hole-target.tutorial-target').first().click();await p.locator('#blockEditor [data-lesson-block="'+key+'"]').click();};
    await step('add-speech');await insert('speech');await step('speech-text');
    const id=await p.evaluate(()=>Akari.app.editorState.main.blockView.bodies.body.find(n=>n.schemaId==='Say').inputs.value.id),field=p.locator('#blockEditor [data-block-id="'+id+'"][data-blockui-field="value"]');await field.fill('つかまった！');await field.press('Enter');
    await step('add-escape');await insert('escape');await step('run-original');await p.click('#runBtn');await p.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');await p.waitForTimeout(550);
    const running=await s.toolbar(),guide=await p.locator('#tutorialExit').evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {inGuide:!!e.closest('#tutorialGuide'),text:e.textContent,shown:!!e.getClientRects().length&&getComputedStyle(e).visibility==='visible',enabled:!e.disabled,hit:hit===e||e.contains(hit)};});
    await p.click('#pauseBtn');await p.waitForFunction(()=>Akari.app.editorState.state==='PAUSED');await p.waitForTimeout(550);const paused=await s.toolbar();await p.click('#continueBtn');await p.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');await s.stop();const state=await p.evaluate(()=>Akari.app.editorState.state);
    return {expect:{tutorialExit:!running.tutorialStart.shown&&running.tutorialStart.w>0&&guide.inGuide&&guide.text==='いっしょに 作るのを やめる'&&guide.shown&&guide.enabled&&guide.hit,runningControls:running.stopBtn.shown&&running.stopBtn.pressable&&running.pauseBtn.shown&&running.pauseBtn.pressable,resumes:paused.continueBtn.shown&&paused.continueBtn.pressable,back:state==='DESIGN'},info:{running,paused,guide,state}};},
  'CC-410':async s=>{const p=s.page;await s.select('w-neko');
    // Delay just the input file's bytes; the importer and canonicalizer run unchanged after release.
    await p.evaluate(()=>{const read=File.prototype.arrayBuffer;globalThis.__fileArrayBuffer=read;File.prototype.arrayBuffer=async function(){if(this.name==='audit-loading.png')await new Promise(resolve=>globalThis.__releaseImage=resolve);return read.call(this);};});
    const png=Buffer.from(await p.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=1024;const g=c.getContext('2d');g.fillStyle='#f00';g.fillRect(0,0,1024,1024);return c.toDataURL('image/png').split(',')[1];}),'base64');
    await p.locator('#imageObjectInput').setInputFiles({name:'audit-loading.png',mimeType:'image/png',buffer:png});await p.waitForFunction(()=>typeof __releaseImage==='function');
    const before=await readViewToggle(p);await pressViewToggle(p);const during=await readViewToggle(p),note=await viewRefusalNote(p),style=await p.locator('#editorModecode').evaluate(e=>({opacity:getComputedStyle(e).opacity,visibility:getComputedStyle(e).visibility,disabled:e.disabled})),role=await p.locator('#modeBlockedNote').getAttribute('role');
    await p.evaluate(()=>{File.prototype.arrayBuffer=__fileArrayBuffer;__releaseImage();delete globalThis.__fileArrayBuffer;delete globalThis.__releaseImage;});await p.waitForFunction(()=>Akari.app.project.components.some(c=>c.name==='audit-loading'));await chooseView(p,'code');
    return {expect:{kept:before.view==='blocks'&&during.view==='blocks'&&during.label===before.label&&style.opacity==='1'&&style.visibility==='visible'&&!style.disabled,note:note==='読みこみが おわるまで、まってね'&&role==='status',switches:await shownView(p)==='code'},info:{before,during,note,style,role}};},
  'CC-422':async s=>{const p=s.page,{buildDerivedProduct}=await import('../../extensions/build.mjs'),{offline}=require('../../extensions/examples/offline.js'),derived=path.join(directory,'CC-422-derived.html');
    await buildDerivedProduct({product,output:derived,extensions:[offline]});await p.goto(pathToFileURL(derived).href);await p.waitForFunction(()=>!!globalThis.Akari?.app);await p.setInputFiles('#fileInput',workFiles.parts);await p.waitForFunction(()=>Akari.app.project.components.some(c=>c.id==='w-neko'));await chooseView(p,'code');await s.select('w-neko');
    await s.write('「はじめ」と言う。');await p.selectOption('#eventSelect','message');await s.write('「拡張:demo.offline/changed」という合図を受けたとき、「とどいた」と1秒言う。');await s.run();await p.waitForTimeout(1000);
    const r={state:(await p.locator('#runState').innerText()).trim(),line:(await p.locator('#statusText').innerText()).trim()};await s.stop();
    return {expect:{running:r.state==='動いているよ',line:r.line==='「拡張:demo.offline/changed」の 合図を 受けると 動くよ'},info:r};},
  'CC-424':async s=>{const p=s.page,allowlist=JSON.parse(fs.readFileSync('audit/fixtures/child-spacing-allowlist.json')),observations=[];await s.select('w-neko');await s.code();await s.write('3秒待つ。');
    const scan=async()=>{const texts=await p.evaluate(()=>{const names=new Set([Akari.app.project.name,Akari.app.project.stage.name,...Akari.app.project.components.map(c=>c.name)]),texts=[],walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      const excluded=e=>e.closest('script,style,code,pre,kbd,rt,textarea,.component,.sprite-bubble');
      for(let n; n=walk.nextNode();){const e=n.parentElement,text=n.textContent.trim();if(!text||!e||excluded(e))continue;const r=document.createRange();r.selectNode(n);if(!r.getClientRects().length||getComputedStyle(e).visibility!=='visible'||names.has(text))continue;texts.push(text);}
      for(const e of document.querySelectorAll('[aria-label],[title],[placeholder],[alt]')){if(excluded(e)||!e.getClientRects().length||getComputedStyle(e).visibility!=='visible')continue;for(const attr of ['aria-label','title','placeholder','alt']){const text=e.getAttribute(attr)?.trim();if(text&&!names.has(text))texts.push(text);}}return texts;});
      return texts.flatMap((text,index)=>childSpacingIssues([{file:'visible-text-'+index,kind:'html',text:text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}],allowlist));};
    // Independent observer controls: another space cannot hide a bad run, including in an accessible label.
    await p.evaluate(()=>{const button=document.createElement('button');button.id='audit-spacing-negative';button.textContent='前に ここをおしてはじめる';button.setAttribute('aria-label','前に あとをおしてはじめる');document.body.append(button);});
    const negative=await scan();await p.locator('#audit-spacing-negative').evaluate(e=>e.remove());assert.ok(negative.some(x=>x.run==='ここをおしてはじめる'));assert.ok(negative.some(x=>x.run==='あとをおしてはじめる'));
    for(const [view,level] of [['blocks','entry'],['blocks','basic'],['blocks','advanced'],['code','basic'],['code','advanced']]){if(await p.locator('#uiLevel').inputValue()==='entry')await p.selectOption('#uiLevel','basic');await chooseView(p,view);await p.selectOption('#uiLevel',level);await p.waitForTimeout(150);const edit=await scan();await s.run();const run=await scan();await s.stop();observations.push({view,level,edit,run});}
    return {expect:{allSurfacesSpaced:observations.every(r=>!r.edit.length&&!r.run.length)},info:{observations,negativeControlRuns:negative.map(x=>x.run)}};},

  // ── common ──
  'CC-055':async s=>{await s.select('w-neko');await s.code();await s.write('ねこは「こんにちは」と言う。\nねこは1秒待つ。\nだんごは「やあ」と言う。');
    const r=await s.check();await s.page.click('#exportBtn');await s.page.locator('#exportChoiceModal').waitFor({state:'visible'});
    const title=await s.page.locator('#exportChoiceTitle').textContent();await s.page.click('#exportChoiceCancel');
    return {expect:{notice:r.notes.some(n=>bare(n).includes(notice)),exportOpens:bare(title)==='作品のはじめ方をえらぼう'},info:r};},
  'CC-056':async s=>{await s.select('w-neko');await s.code();await s.write('ねこは「こんにちは」と言う。\nねこは1秒待つ。\nだんごは「やあ」と言う。');
    const first=await s.check();await s.run();await s.page.waitForTimeout(500);const runs=await s.page.evaluate(()=>document.querySelector('#formSurface').innerText.includes('こんにちは'));
    await s.stop();
    await s.write('ねこは「こんにちは」と言う。\nねこは\nだんごは「やあ」と言う。');const second=await s.check();
    return {expect:{firstNotice:first.notes.some(n=>bare(n).includes(notice)),firstNoIssue:first.issues.length===0,runs,secondIssue:second.issues.some(t=>/2行目|2行/.test(t))},info:{first,second}};},
  'CC-076':async s=>{await s.select('w-neko');await s.blocks();await s.category('motion');await s.place('MotionCommand:MOVE_BY');
    const id=(await s.tree()).b.body[0].id,role=r=>s.page.locator(`#blockEditor [data-blockui-structured-role="${r}"][data-block-id="${id}"]`);
    await s.who(id,'ねこ');const placed=await role('actorRef.particle').inputValue();
    await s.who((await s.tree()).b.body[0].id,'ねこ','が');
    await s.code();const text=(await s.text()).trim();await s.blocks();const after=await s.page.locator(`#blockEditor [data-blockui-structured-role="actorRef.particle"][data-block-id="${(await s.tree()).b.body[0].id}"]`).inputValue();
    return {expect:{newBlockHa:placed==='は',codeGa:text==='ねこが、いまのばしょから、右へ10歩動く。',blockStillGa:after==='が'},info:{placed,text,after}};},
  'CC-077':async s=>{await s.select('w-neko');await s.code();await s.write('ねこがいまのばしょから、右へ10歩動く。');await s.page.click('#formatBtn');await s.page.waitForTimeout(300);
    const formatted=(await s.text()).trim();await s.blocks();const id=(await s.tree()).b.body[0].id;
    const particle=await s.page.locator(`#blockEditor [data-blockui-structured-role="actorRef.particle"][data-block-id="${id}"]`).inputValue();
    await s.code();const back=(await s.text()).trim();
    return {expect:{formatted:formatted==='ねこが、いまのばしょから、右へ10歩動く。',blockGa:particle==='が',backToCode:back==='ねこが、いまのばしょから、右へ10歩動く。'},info:{formatted,particle,back}};},
  'CC-091':async s=>{await s.select('w-takudon');await s.blocks();const root=s.page.locator('#blockEditor');await openPaletteTools(root);
    const add=async schema=>{await (await reveal(root.locator('[data-blockui-search]'))).fill(schema);await s.page.waitForTimeout(150);await root.locator(`.blockui-palette-item [data-blockui-schema="${schema}"]`).first().click();await s.page.waitForTimeout(300);};
    await add('RepeatCount');let t=await s.tree();const hole=t.b.body[0].b.body[0].id;
    const count=root.locator(`.blockui-node[data-block-id="${t.b.body[0].id}"] input[aria-label$="数"]`).first();await (await reveal(count)).fill('3');await count.press('Enter');await s.page.waitForTimeout(200);
    await s.who((await s.tree()).b.body[0].id,'たくどん');
    t=await s.tree();await (await reveal(root.locator(`.blockui-node[data-block-id="${t.b.body[0].b.body[0].id}"] [data-blockui-action="hole-select-statement"]`).first())).click();await s.page.waitForTimeout(150);await add('MotionCommand:MOVE_BY');
    t=await s.tree();await s.who(t.b.body[0].b.body[0].id,'たくどん');
    t=await s.tree();await (await reveal(root.locator(`[data-blockui-action="body-insert"][data-parent-id="${t.b.body[0].id}"][data-insert-index="1"]`).first())).click();await s.page.waitForTimeout(150);await add('Say');
    t=await s.tree();await s.who(t.b.body[0].b.body[1].id,'だんご');
    await s.code();const lines=(await s.text()).split('\n');
    return {expect:{heading:lines[0]==='たくどんは、3回くり返す。',moveWithoutSubject:lines[1]==='  いまのばしょから、右へ10歩動く。',otherSubject:lines[2]==='  だんごは「こんにちは」と言う。'},info:{lines,hole}};},
  'CC-151':async s=>{const pen=()=>s.page.evaluate(()=>{const c=document.querySelector('#penCanvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n;});
    await s.select('w-neko');await s.page.selectOption('#eventSelect','start');await s.code();await s.write('ペンを下ろす。\nいまのばしょから、右へ100歩動く。');await s.select('stage');await s.code();await s.write('2秒待つ。\n作品の線とスタンプを全部消す。');
    const check=await s.check();await s.run();await s.page.waitForTimeout(1000);const early=await pen();await s.page.waitForTimeout(2300);const late=await pen();
    return {expect:{lineAtOneSecond:early>0,clearedAfterThree:late===0,noIssue:check.issues.length===0},info:{early,late}};},
  'CC-155':async s=>{await s.select('w-neko');await s.code();await s.write('タイマーを0にする。');await s.press('コードモード ⇄');
    const mode=await s.mode(),label=await s.toggle(),note=await s.note();
    const blocks=await s.page.evaluate(()=>{const ids=[];const walk=x=>{if(x.schemaId!=='Script')ids.push(x.schemaId);for(const b of Object.values(x.bodies||{}))b.forEach(walk);};walk(Akari.app.editorState.main.blockView);return ids;});
    await s.press('ブロックモード ⇄');const back=await s.mode(),code=(await s.text()).trim();await s.press('コードモード ⇄');await s.category('sense');const sense=await s.palette();
    return {expect:{switched:mode==='blocks'&&label==='ブロックモード ⇄'&&!note,oneTimerBlock:blocks.length===1&&blocks[0]==='TimerReset',sameCode:back==='code'&&code==='タイマーを0にする。',inSense:sense.includes('TimerReset')},info:{blocks,code,note,label}};},
  'CC-181':async s=>{await s.newWork();const l=await s.level(),takudon=await s.part('たくどん');
    const empty=(await s.scripts()).every(x=>!x.source.trim());
    return {expect:{entry:l.chosen==='entry'&&l.shown==='entry',blocks:(await s.mode())==='blocks'&&(await s.toggle())==='ブロックモード ⇄',centre:!!takudon&&takudon.x===320&&takudon.y===200,noCommands:empty},info:{l,takudon}};},
  'CC-243':async s=>{await s.newWork();await s.page.selectOption('#uiLevel','advanced');await s.page.waitForTimeout(200);const id=(await s.part('たくどん')).id;await s.select(id);
    const x=await s.propValue('よこのばしょ'),y=await s.propValue('たてのばしょ'),yHelp=bare(await s.propHelp('たてのばしょ')),dirHelp=bare(await s.propHelp('向き'));
    await s.select('stage');await s.prop('高さ',300);await s.select(id);const after=await s.propValue('たてのばしょ');
    return {expect:{centre:x==='320'&&y==='200',help:yHelp===bare('画面の 左下の はしから、まん中までの 歩数です')&&dirHelp===bare('0＝右　90＝上　180＝左　270＝下'),kept:after==='200'},info:{x,y,yHelp,dirHelp,after}};},
  'CC-244':async s=>{await s.newWork();await s.page.selectOption('#uiLevel','basic');await s.page.waitForTimeout(200);await s.select((await s.part('たくどん')).id);await s.blocks();
    await s.category('motion');const motion=await s.palette();await s.place('MotionCommand:GOTO');await s.place('MotionCommand:MOVE_BY');
    const t=await s.tree(),[go,by]=t.b.body,node=id=>s.page.locator('#blockEditor .blockui-node[data-block-id="'+id+'"] > .blockui-node-content > .blockui-node-main');
    const goText=await readBlock(node(go.id)),goChoices=await node(go.id).locator('select[data-blockui-field="xDir"],select[data-blockui-field="yDir"],select[data-blockui-action="motion-direction"]').count();
    const byText=await readBlock(node(by.id)),byChoices=await node(by.id).locator('select[data-blockui-action="motion-direction"]').count();
    await s.code();const lines=(await s.text()).split('\n');
    return {expect:{four:['MotionCommand:GOTO','MotionCommand:MOVE_BY','MotionCommand:MOVE','MotionCommand:GOTO_PART'].every(id=>motion.includes(id)),
      fixedPlace:go.s==='MotionCommand:GOTO'&&goText.includes('右へ320歩')&&goText.includes('上へ200歩')&&goChoices===0,
      oneDirection:by.s==='MotionCommand:MOVE_BY'&&byText.includes('右へ10歩')&&byChoices===1&&!by.i.y,
      code:lines.length===2&&lines[0]==='画面の左下のはしから、右へ320歩、上へ200歩のばしょへ行く。'&&lines[1]==='いまのばしょから、右へ10歩動く。'},info:{motion,goText,byText,lines}};},
  'CC-245':async s=>{await s.select('w-neko');await s.code();await s.write('1秒から3秒のどれか待つ。');await s.blocks();
    const wait=(await s.tree()).b.body[0],text=await readBlock(s.page.locator('#blockEditor .blockui-node[data-block-id="'+wait.id+'"] > .blockui-node-content > .blockui-node-main'));
    await s.code();const code=(await s.text()).trim(),at=text.indexOf('1秒から3秒のどれか');
    return {expect:{shown:wait.s==='WaitTime'&&at>=0&&!text.slice(at+'1秒から3秒のどれか'.length).startsWith('秒'),sameCode:code==='1秒から3秒のどれか待つ。'},info:{text,code}};},
  'CC-292':async s=>{await s.code();const one=await paintCircle(s,200),two=await paintCircle(s,200),W=one.w;
    const a=await place(s,one,{x:150,y:150}),b=await place(s,two,{x:150+0.9*W,y:150+0.9*W});
    await s.select(one.id);await s.page.selectOption('#eventSelect','start');await s.code();await s.write(touchLoop(two.name));
    await s.run();const corners=await listen(s,one.id);await s.stop();
    await place(s,two,{x:150+0.6*W,y:150});await s.run();const overlap=await listen(s,one.id);await s.stop();
    await s.select(one.id);await s.page.selectOption('#eventSelect','start');await s.write(touchLoop('マウス'));await s.run();
    const corner=await screenPoint(s,150-W/2+0.08*W,150+W/2-0.08*W);await s.page.mouse.move(corner.x,corner.y);await s.page.waitForTimeout(300);const atCorner=await listen(s,one.id,1800);
    const centre=await screenPoint(s,150,150);await s.page.mouse.move(centre.x,centre.y);await s.page.waitForTimeout(1200);const atCentre=await listen(s,one.id,1800);await s.stop();
    return {expect:{boxesOnly:corners.length>0&&corners.every(t=>t==='はなれている'),circlesOverlap:overlap.includes('ふれた'),mouseCorner:atCorner.length>0&&atCorner.every(t=>t==='はなれている'),mouseCentre:atCentre.includes('ふれた')},info:{a,b,corners,overlap,atCorner,atCentre}};},
  'CC-293':async s=>{await s.code();const add=async()=>{const before=await s.page.evaluate(()=>Akari.app.project.components.map(c=>c.id));await (await reveal(s.page.locator(TOOLBOX_PRESET+'[data-sprite-preset="star"]'))).click();await s.page.waitForTimeout(200);return s.page.evaluate(b=>Akari.app.project.components.find(c=>!b.includes(c.id)),before);};
    const one=await add(),two=await add();await place(s,one,{x:200,y:200,w:70,h:70});await place(s,two,{x:265,y:265,w:70,h:70});
    await s.select(one.id);await s.page.selectOption('#eventSelect','start');await s.code();await s.write(touchLoop(two.name));await s.run();const stars=await listen(s,one.id);await s.stop();
    const circle=await paintCircle(s,70);await place(s,circle,{x:265,y:265});await s.select(two.id);await s.prop('よこのばしょ',1000);
    await s.select(one.id);await s.page.selectOption('#eventSelect','start');await s.write(touchLoop(circle.name));await s.run();const withCircle=await listen(s,one.id);await s.stop();
    return {expect:{starBoxes:stars.includes('ふれた'),circleSeen:withCircle.length>0&&withCircle.every(t=>t==='はなれている')},info:{stars,withCircle,circle:await s.part(circle.name)}};},
  'CC-294':async s=>{const step1=await s.level(),toggle1=await s.toggle();await s.page.selectOption('#uiLevel','basic');await s.page.waitForTimeout(200);await s.press('ブロックモード ⇄');const step2=await s.level(),mode2=await s.mode(),toggle2=await s.toggle();
    const step3=await s.level();await s.page.selectOption('#uiLevel','advanced');await s.page.waitForTimeout(200);await s.press('コードモード ⇄');const step4=await s.level(),mode4=await s.mode();
    const named=await s.page.getByRole('combobox',{name:'レベル',exact:true}).evaluateAll(es=>es.map(e=>e.id));
    const layout=await s.page.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom};},modes=box(document.querySelector('#editorModecode:not([hidden]),#editorModeblocks:not([hidden])')),level=box(document.querySelector('#uiLevel')),name=box(document.querySelector('#projectName'));
      const heading=[...document.querySelectorAll('label,span,div,strong,legend')].some(e=>e.getClientRects().length&&e.textContent.trim()==='見せ方');return{modes,level,name,heading,innerWidth};});
    const row=[layout.modes,layout.level,layout.name],sameRow=row.every(b=>b.top<layout.level.bottom&&b.bottom>layout.level.top);
    return {expect:{entryBlocks:step1.options.join('|')==='はじめて|かんたん|くわしく'&&toggle1==='ブロックモード ⇄',codeKeepsBasic:mode2==='code'&&toggle2==='コードモード ⇄'&&step2.chosen==='basic',codeLevels:step3.options.join('|')==='かんたん|くわしく|名人',
      blocksKeepAdvanced:mode4==='blocks'&&step4.chosen==='advanced'&&step4.options.join('|')==='はじめて|かんたん|くわしく',named:named.length===1&&named[0]==='uiLevel'&&!layout.heading,
      order:sameRow&&layout.modes.right<=layout.level.left&&layout.level.right<=layout.name.left},info:{step1,step2,step3,step4,named,layout}};},
  'CC-295':async s=>{const p=s.page;await s.select('w-takudon');await s.code();await s.write('ずっとくり返す。\n  1秒待つ。');
    const work=['newBtn','sampleBtn','basicActionGuide','openBtn','saveBtn','exportBtn'],gone=[...work,'uiLevel','editorModeblocks'];
    const edit=await s.toolbar(),editToggle=await s.toggle(),runBox=await p.locator('#runBtn').boundingBox();
    // A double press of ▶ 動かす: its second press lands on ■ 止める, which took ▶'s place (二度押し, LANGUAGE.md).
    await p.mouse.dblclick(runBox.x+runBox.width/2,runBox.y+runBox.height/2);await p.locator('#stopBtn').waitFor({state:'visible'});const stopBox=await p.locator('#stopBtn').boundingBox();await p.waitForTimeout(100);
    const early={state:await p.evaluate(()=>Akari.app.editorState.state),run:await p.locator('#runBtn').isVisible(),stop:await p.locator('#stopBtn').isVisible()};
    await p.waitForTimeout(1000);const band=bare(await p.locator('#execLocation').innerText()),sentence=bare(await p.locator('#execSentence').innerText().catch(()=>'')),run=await s.toolbar(),nameIsText=await s.nameIsText();
    await p.click('#pauseBtn');await p.waitForTimeout(200);const paused=await s.toolbar();
    await p.click('#stopBtn');await p.waitForFunction(()=>Akari.app.editorState.state==='DESIGN');const back=await s.toolbar();
    return {expect:{editScreen:edit.runBtn.shown&&!edit.stopBtn.shown&&work.every(id=>edit[id].shown)&&edit.uiLevel.shown&&editToggle==='コードモード ⇄',
      doublePressIgnored:early.state==='RUNNING'&&!early.run&&early.stop&&Math.abs(stopBox.x-runBox.x)<2&&Math.abs(stopBox.y-runBox.y)<2,
      runHidesKeepingPlace:gone.every(id=>!run[id].shown&&s.samePlace(edit[id],run[id])),notPacked:s.unmoved(edit,run,['runBtn','stopBtn']),
      stopAndName:s.samePlace(edit.runBtn,run.stopBtn)&&run.stopBtn.shown&&s.samePlace(edit.projectName,run.projectName)&&nameIsText,
      runControls:run.pauseBtn.shown&&run.stepBtn.shown&&run.runtimeInspectBtn.shown&&!run.runBtn.shown,
      band:band.startsWith('いま動いている文：')&&band.includes('たくどん')&&band.includes('「動かす」をおしたとき')&&/\d+行目/.test(band)&&sentence.length>0,
      pausedContinue:paused.continueBtn.shown&&paused.continueBtn.pressable,stopped:back.runBtn.shown&&!back.stopBtn.shown},info:{band,sentence,early,edit,run}};},
  'CC-296':async s=>{const p=s.page,motion=['MotionCommand:GOTO','MotionCommand:MOVE_BY','MotionCommand:MOVE'],extra=id=>p.locator('#blockEditor .blockui-node[data-block-id="'+id+'"]');
    const timedOps=async ids=>{const out={};for(const n of ids){const node=extra(n.id);await clickNode(node);out[n.s]=await node.locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-extra [data-blockui-action="motion-timed"]').count();}return out;};
    await s.select('w-neko');await s.category('motion');const entry=await s.palette();for(const id of motion)await s.place(id);const entryTimed=await timedOps((await s.tree()).b.body);
    await p.selectOption('#uiLevel','basic');await p.waitForTimeout(250);await s.category('motion');const basicMotion=await s.palette();await s.category('basic');const basicCommon=await s.palette();
    const when=p.locator('#blockEditor details.blockui-heading-editor > summary').first();await when.click();await p.waitForTimeout(200);
    const events=await p.locator('#blockEditor [data-blockui-structured-role="heading.event"]').first().evaluate(e=>[...e.options].filter(o=>!o.hidden&&!o.disabled).map(o=>o.value));
    await p.locator('#blockEditor [data-blockui-action="heading-cancel"]').first().click();await p.waitForTimeout(200);await s.category('motion');await s.place('MotionCommand:GOTO_PART');
    const basicTimed=await timedOps((await s.tree()).b.body);
    await p.selectOption('#uiLevel','advanced');await p.waitForTimeout(250);await s.category('');const all=await s.palette();
    const disabled=await p.locator('#blockEditor .blockui-palette [data-blockui-schema][aria-disabled="true"]').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>e.dataset.blockuiSchema));
    return {expect:{entryMotion:motion.every(id=>entry.includes(id))&&!entry.includes('MotionCommand:GOTO_PART'),entryTime:entryTimed['MotionCommand:MOVE_BY']===1&&entryTimed['MotionCommand:GOTO']===0&&entryTimed['MotionCommand:MOVE']===0,
      basicAdds:basicMotion.includes('MotionCommand:GOTO_PART')&&events.includes('touchStart')&&[...basicMotion,...basicCommon].includes('StopCommand:OWN_OTHERS'),
      basicTime:[...motion,'MotionCommand:GOTO_PART'].every(id=>basicTimed[id]===1),advanced:all.includes('BuiltinCall:正弦')&&!disabled.length},info:{entry,entryTimed,basicMotion,events,basicTimed,disabled}};},
  'CC-297':async s=>{const p=s.page,before=await p.evaluate(()=>({project:JSON.stringify(Akari.app.project),history:Akari.app.editorState.history,redo:Akari.app.editorState.redo,dirty:Akari.app.editorState.dirty}));
    const menu=p.locator('#entryProjectMenu');if(await menu.getAttribute('open')===null)await menu.locator(':scope > summary').click();
    const [chooser]=await Promise.all([p.waitForEvent('filechooser'),p.locator('#entryOpen').click()]);await chooser.setFiles(workFiles.f4);
    await p.locator('#openRefusalModal.show').waitFor();const title=await p.locator('#openRefusalTitle').textContent(),message=await p.locator('#openRefusalMessage').textContent(),focusClose=await p.evaluate(()=>document.activeElement?.id);
    await p.click('#openRefusalClose');await p.waitForTimeout(200);
    const focusOpen=await p.evaluate(()=>{const a=document.activeElement;return a?.id==='entryOpen'?'entryOpen':a?.matches?.('#entryProjectMenu > summary')?'entryProjectMenu':a?.id||a?.tagName;});
    const after=await p.evaluate(()=>({project:JSON.stringify(Akari.app.project),history:Akari.app.editorState.history,redo:Akari.app.editorState.redo,dirty:Akari.app.editorState.dirty}));
    return {expect:{dialog:bare(title)===bare('この ファイルは 開けなかったよ')&&bare(message)===bare('前の あかりで ほぞんした 作品なので、この あかりでは 開けないよ。その 作品を 作った ときの あかりで 開いてね。'),closeFocused:focusClose==='openRefusalClose',
      // 開く sits in the 作品 menu at はじめて; with the menu closed its summary is the 開く control that takes the focus.
      backToOpen:['entryOpen','entryProjectMenu'].includes(focusOpen),unchanged:JSON.stringify(after)===JSON.stringify(before)},info:{title,message,focusClose,focusOpen}};},
  // The one view toggle (final call 22): it names the view on the screen, and its accessible name says the same.
  'CC-331':async s=>{const p=s.page;await s.select('w-neko');
    const look=async()=>({label:await s.toggle(),view:await s.mode(),named:{blocks:await p.getByRole('button',{name:'ブロックモード',exact:true}).count(),code:await p.getByRole('button',{name:'コードモード',exact:true}).count()},
      buttons:await p.locator('.menutool > .editor-modes > button').evaluateAll(es=>es.filter(e=>!e.hidden&&e.getClientRects().length).length),blocksShown:await s.visible('#blockEditor'),codeShown:await s.visible('#codeEditor')});
    const first=await look();await s.press('ブロックモード ⇄');const second=await look();await s.press('コードモード ⇄');const third=await look();
    return {expect:{oneToggle:first.buttons===1&&first.label==='ブロックモード ⇄'&&first.view==='blocks'&&first.blocksShown&&first.named.blocks===1&&first.named.code===0,
      toCode:second.codeShown&&!second.blocksShown&&second.label==='コードモード ⇄'&&second.named.code===1&&second.named.blocks===0,back:third.blocksShown&&third.label==='ブロックモード ⇄'&&third.view==='blocks'},info:{first,second,third}};},
  'CC-332':async s=>{const p=s.page,label=await s.toggle();await s.press('ブロックモード ⇄');const view=await s.mode(),note=await s.note();
    await p.locator('#formSurface').click({position:{x:5,y:5}});await p.waitForTimeout(200);const later=await s.note();
    await s.press('ブロックモード ⇄');const again=await s.note();await p.keyboard.press('Shift');await p.waitForTimeout(200);const afterKey=await s.note();
    const why='コードで 書くときは、上の「かんたん」か「くわしく」を えらんでね';
    return {expect:{shown:label==='ブロックモード ⇄',stays:view==='blocks'&&(await s.level()).chosen==='entry',says:note===why,hides:!later,keyHides:again===why&&!afterKey},info:{label,note,later,again,afterKey}};},
  'CC-333':async s=>{const p=s.page;await (await reveal(p.locator('#procBtn'))).click();await p.locator('#procModal').waitFor({state:'visible'});await p.getByRole('button',{name:'新しい てじゅん',exact:true}).click();await p.waitForTimeout(300);
    const look=async()=>{const t=await readViewToggle(p,'callable');return {...t,blocksShown:await s.visible('#callableBlocks'),codeShown:await s.visible('#callableCode')};};
    const shows=t=>t.label===VIEW_NAMES[t.view]+' ⇄'&&t.name===VIEW_NAMES[t.view]&&(t.view==='blocks'?t.blocksShown&&!t.codeShown:t.codeShown&&!t.blocksShown);
    const first=await look();await pressViewToggle(p,'callable');await p.waitForTimeout(250);const second=await look();await pressViewToggle(p,'callable');await p.waitForTimeout(250);const third=await look();
    return {expect:{toggle:shows(first),switched:second.view!==first.view&&shows(second),back:third.view===first.view&&shows(third)},info:{first,second,third}};},
  // はじめて's run screen (final call 21, lead decision 26): ⏸ いったん止める and ▶ つづける take turns right under the work's
  // screen; 1つずつ 動かす and 本文を見て たしかめる are not there; 作品, ↶ ↷ and いっしょに作る are not shown and keep their places.
  'CC-334':async s=>{const p=s.page;await s.select('w-neko');
    const wait=p.locator('#blockEditor [data-blockui-action="palette-add"][data-blockui-schema="WaitTime"]:visible').first();for(let i=0;i<3;i++){await wait.click();await p.waitForTimeout(250);}
    const body=(await s.scripts()).find(x=>x.targetId==='w-neko'&&x.event==='start');
    const gone=['entryProjectMenu','undoBtn','redoBtn','tutorialStart','uiLevel','editorModecode'];
    const edit=await s.toolbar();await p.click('#runBtn');await p.waitForTimeout(600);
    // The approved row puts ⏸／▶ at the right of the current-sentence strip, directly beneath the stage.
    const under=await p.evaluate(()=>{const r=q=>document.querySelector(q).getBoundingClientRect(),view=r('.stage-viewport'),strip=r('#runStrip'),slot=r('#pauseBtn'),win=r('#designerWindow');
      const between=[...document.querySelectorAll('#designerWindow *')].filter(e=>(e.matches('button,input,select,label,a')||[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))&&e.getClientRects().length&&getComputedStyle(e).visibility==='visible').filter(e=>{const b=e.getBoundingClientRect();return b.top>=view.bottom-1&&b.bottom<=strip.top+1;}).map(e=>e.id||e.className);
      return {between,sharedRow:Math.abs(slot.top+slot.height/2-strip.top-strip.height/2)<1&&slot.left-strip.right>=-1&&slot.left-strip.right<12,inWindow:slot.left>=win.left&&slot.right<=win.right&&slot.bottom<=win.bottom,overlapsX:slot.left<view.right&&slot.right>view.left};});
    const run=await s.toolbar(),nameIsText=await s.nameIsText(),band=bare(await p.locator('#execLocation').innerText()),sentence=bare(await p.locator('#execSentence').innerText().catch(()=>''));
    await p.click('#pauseBtn');const pausedAt=await p.evaluate(()=>performance.now());await p.waitForTimeout(300);const paused=await s.toolbar();await p.waitForTimeout(1200);
    // The three waits take 3 s of run time; paused after about 0.5 s, the rest is under 3 s once ▶ つづける is pressed (more
    // than 0.5 s after ⏸, the time in which a second press of that place does nothing).
    await p.evaluate(()=>{globalThis.__doneAt=null;new MutationObserver(()=>{if(!globalThis.__doneAt&&/おわったよ/.test(document.querySelector('#statusText').textContent))globalThis.__doneAt=performance.now();}).observe(document.querySelector('#statusText'),{childList:true,characterData:true,subtree:true});});
    const resumedAt=await p.evaluate(()=>performance.now());await p.click('#continueBtn');await p.waitForTimeout(200);const resumed=await s.toolbar();await p.waitForFunction(()=>globalThis.__doneAt!==null,null,{timeout:5000}).catch(()=>{});
    const doneAfter=await p.evaluate(at=>globalThis.__doneAt===null?null:globalThis.__doneAt-at,resumedAt);
    await p.waitForTimeout(600);await p.click('#stopBtn');await p.waitForFunction(()=>Akari.app.editorState.state==='DESIGN');const back=await s.toolbar();
    return {expect:{threeWaits:!!body&&body.source.trim()==='1秒待つ。\n1秒待つ。\n1秒待つ。',
      stopAndName:run.stopBtn.shown&&s.samePlace(edit.runBtn,run.stopBtn)&&s.samePlace(edit.projectName,run.projectName)&&nameIsText,
      hiddenKeepingPlace:gone.every(id=>edit[id].shown&&!run[id].shown&&s.samePlace(edit[id],run[id]))&&s.unmoved(edit,run,['runBtn','stopBtn']),
      runControls:run.pauseBtn.shown&&!run.continueBtn.shown&&!run.stepBtn.shown&&!run.runtimeInspectBtn.shown&&!under.between.length&&under.sharedRow&&under.inWindow&&under.overlapsX,
      band:band==='いま動いている文：ねこ'&&sentence==='1秒待つ',
      pausedControls:paused.continueBtn.shown&&paused.continueBtn.pressable&&!paused.pauseBtn.shown&&s.samePlace(run.pauseBtn,paused.continueBtn)&&Math.abs(run.pauseBtn.w-paused.continueBtn.w)<1&&!paused.stepBtn.shown&&!paused.runtimeInspectBtn.shown,
      continues:doneAfter!==null&&doneAfter>1500&&doneAfter<2800&&resumed.pauseBtn.shown&&!resumed.continueBtn.shown&&s.samePlace(paused.continueBtn,resumed.pauseBtn),
      backToEdit:back.runBtn.shown&&!back.stopBtn.shown&&['runBtn','entryProjectMenu','undoBtn','redoBtn','tutorialStart'].every(id=>back[id].shown&&s.samePlace(edit[id],back[id]))},
      info:{body,band,sentence,doneAfter,pausedAt,under,edit,run,paused}};},
  // The exported player with 「「▶ 動かす」の ボタンを つける」 shows only the buttons that can be pressed (final call 21).
  'CC-335':async s=>{const p=s.page;await s.select('w-neko');await s.code();await s.write('3秒待つ。');
    await (await reveal(p.locator('#exportBtn'))).click();await p.locator('#exportChoiceModal').waitFor({state:'visible'});
    const downloading=p.waitForEvent('download');await p.click('#exportControls');const file=path.join(directory,'CC-335-player.html');await (await downloading).saveAs(file);
    const q=await p.context().newPage();q.on('pageerror',e=>pageErrors.push(e.message));await q.goto(pathToFileURL(file).href);await q.waitForFunction(()=>document.querySelector('#playerRoot')?.dataset.state==='READY');
    // ⏸ いったん止める and ▶ つづける share one place (one button with both labels): only the label that applies is seen, and
    // while neither applies the place keeps its room unseen.
    const shown=()=>q.evaluate(()=>{const seen=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility==='visible';
      return ['playerStart','playerStop','playerPause'].map(id=>document.getElementById(id)).filter(e=>e&&seen(e)).map(e=>(e.children.length?[...e.children].filter(seen).map(c=>c.textContent).join(''):e.textContent).trim()).filter(Boolean).join('|');});
    const scene=()=>q.evaluate(()=>[...document.querySelectorAll('#formSurface .component')].map(c=>[c.style.left,c.style.top,c.style.transform,c.style.display].join(' ')).join('|')+'|'+document.querySelectorAll('#formSurface .sprite-bubble').length);
    const ready=await shown(),startScene=await scene(),startBox=await q.locator('#playerStart').boundingBox();await q.click('#playerStart');await q.waitForTimeout(600);
    const running=await shown(),stopBox=await q.locator('#playerStop').boundingBox(),pauseBox=await q.locator('#playerPause').boundingBox();
    // ▶ つづける is pressed after the 0.5 s in which a second press of the ⏸／▶ つづける place does nothing.
    await q.click('#playerPause');await q.waitForTimeout(600);const paused=await shown(),continueBox=await q.locator('#playerPause').boundingBox();
    await q.click('#playerPause');await q.waitForTimeout(4000);const finished=await shown();await q.click('#playerStop');await q.waitForTimeout(300);
    const stopped={shown:await shown(),state:await q.locator('#playerRoot').getAttribute('data-state'),scene:await scene()};await q.close();
    return {expect:{ready:ready==='▶ 動かす',running:running==='■ 止める|⏸ いったん止める'&&!!stopBox&&Math.abs(stopBox.x-startBox.x)<2&&Math.abs(stopBox.y-startBox.y)<2,
      paused:paused==='■ 止める|▶ つづける'&&Math.abs(pauseBox.x-continueBox.x)<1&&Math.abs(pauseBox.y-continueBox.y)<1&&Math.abs(pauseBox.width-continueBox.width)<1,
      finished:finished==='■ 止める',stopped:stopped.shown==='▶ 動かす'&&!['RUNNING','PAUSED','FINISHED'].includes(stopped.state)&&stopped.scene===startScene},info:{ready,running,paused,finished,stopped,startScene}};},
  // The body selector is 「きっかけ」 (final call 19).
  'CC-336':async s=>{const p=s.page;await s.select('w-neko');const why='どの きっかけの 本文を なおすかを えらびます';
    const selector=await p.locator('#eventSelect').evaluate(e=>({label:[...e.labels[0].childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim(),title:e.title,described:(e.getAttribute('aria-describedby')||'').split(' ').map(id=>document.getElementById(id)?.textContent||'').join(' ')}));
    const named=await p.getByRole('combobox',{name:'きっかけ'}).evaluateAll(es=>es.map(e=>e.id));
    const add=bare(await p.locator('#scriptAdd').innerText());
    await (await reveal(p.locator('#sourceOverviewBtn'))).click();await p.waitForTimeout(300);const all=await p.locator('#eventSelect').evaluate(e=>e.selectedOptions[0]?.textContent.trim());
    return {expect:{named:selector.label==='きっかけ'&&named.includes('eventSelect'),explained:selector.title===why,
      addButton:add===bare('同じ きっかけの 本文を ふやす'),allBodies:all==='すべての本文を 見せています'},info:{selector,named,add,all}};},
  'CC-337':async s=>{const p=s.page;await s.select('w-neko');await s.category('motion');await s.place('MotionCommand:MOVE');const before=await s.scripts();
    // The script block's own 「いつ動く？」 opens its heading editor.
    await p.locator('#blockEditor details.blockui-heading-editor > summary').first().click();await p.waitForTimeout(250);
    const panel=p.locator('#blockEditor details.blockui-heading-editor[open]').first(),text=await panel.innerText();
    const commit=await panel.locator('[data-blockui-action="heading-commit"]').innerText(),cancel=panel.getByRole('button',{name:'かえるのを やめる',exact:true});
    const cancels=await cancel.count();await cancel.click();await p.waitForTimeout(250);
    const after=await s.scripts(),selected={target:await p.locator('#objectSelect').inputValue(),event:await p.locator('#eventSelect').inputValue()};
    return {expect:{panel:commit.trim()==='この 本文の きっかけを かえる'&&/かえる 本文：/.test(text)&&cancels===1&&before.some(x=>x.targetId==='w-neko'&&x.event==='start'&&x.source.includes('前へ')),
      unchanged:JSON.stringify(after)===JSON.stringify(before)&&selected.target==='w-neko'&&selected.event==='start'},info:{text,commit,selected}};},
  // F-23's one word per idea, on every edit screen; 名人 is never 「名人モード」 (final call 23).
  'CC-338':async s=>{const p=s.page,banned=['できごと','なおす動き','作業欄','組み立てる ばしょ','作る ばしょ','自動で のこす','自動保存','名人モード'],seen=[];
    const read=async where=>{if(await p.locator('#basicActionGuide').count()){const g=p.locator('#basicActionGuide');if(await g.isVisible()&&!await g.evaluate(e=>e.open))await g.locator(':scope > summary').click();}
      const text=await p.evaluate(()=>{const parts=[document.body.innerText];for(const e of document.querySelectorAll('select'))if(e.getClientRects().length)parts.push([...e.options].filter(o=>!o.hidden).map(o=>o.textContent).join(' '));
        for(const e of document.querySelectorAll('[title],[aria-label]'))if(e.getClientRects().length)parts.push(e.title||'',e.getAttribute('aria-label')||'');return parts.join('\n');});
      const heading=await p.locator('.objects-window > .win-title').innerText().catch(()=>'');seen.push({where,found:banned.filter(w=>text.includes(w)),kyara:/キャラ(?!クター)/.test(text),heading,view:await s.mode()});
      if(await p.locator('#basicActionGuide').isVisible()&&await p.locator('#basicActionGuide').evaluate(e=>e.open))await p.locator('#basicActionGuide > summary').click();};
    for(const [view,level] of [['blocks','entry'],['blocks','basic'],['blocks','advanced'],['code','basic'],['code','advanced']]){
      if(view==='code'&&await s.mode()==='blocks'){await p.selectOption('#uiLevel','basic');await p.waitForTimeout(200);await s.code();}
      await p.selectOption('#uiLevel',level);await p.waitForTimeout(250);await read(view+'/'+level);}
    await s.openFile(workFiles.meijin);await p.waitForTimeout(300);await read('meijin/'+(await s.level()).chosen);
    return {expect:{noVariant:seen.every(x=>!x.found.length),kyara:seen.every(x=>!x.kyara),heading:seen.every(x=>x.heading.trim()==='キャラクター・部品')&&seen.some(x=>x.view==='blocks')&&seen.some(x=>x.view==='code')},info:{seen}};},
  'CC-347':async s=>{const p=s.page;await s.newWork();await p.selectOption('#uiLevel','basic');await p.waitForTimeout(250);await p.click('#runBtn');await p.waitForTimeout(400);
    const status=await p.locator('#statusText').innerText(),state=await p.evaluate(()=>Akari.app.editorState.state);
    return {expect:{notRun:state==='DESIGN'&&(await s.mode())==='blocks',says:status.trim()==='ブロックが まだ ないよ。「＋ ここに入れる」を おして、ブロックを 入れてね'},info:{status,state}};},
  'CC-348':async s=>{const p=s.page;await s.newWork();await p.selectOption('#uiLevel','basic');await p.waitForTimeout(250);await s.press('ブロックモード ⇄');await p.click('#runBtn');await p.waitForTimeout(400);
    const status=await p.locator('#statusText').innerText(),state=await p.evaluate(()=>Akari.app.editorState.state);
    return {expect:{notRun:state==='DESIGN'&&(await s.mode())==='code',says:status.trim()==='本文が まだ ないよ。コードに 文を 書いてね',noPlus:!status.includes('＋ ここに入れる')},info:{status,state}};},
  // 本文を見て たしかめる opens the body the band names, not the one chosen on the edit screen (MW-04).
  'CC-349':async s=>{const p=s.page,source='ずっとくり返す。\n  1秒待つ。';await s.select('w-neko');await p.selectOption('#eventSelect','start');await s.code();await s.write(source);await s.select('w-dango');
    await s.run();await p.waitForTimeout(1000);const band=bare(await p.locator('#execLocation').innerText()),line=Number(band.match(/(\d+)行目/)?.[1]);
    await p.click('#runtimeInspectBtn');await p.locator('#runtimeInspector[open]').waitFor();await p.waitForTimeout(300);
    const shown=await p.evaluate(()=>{const t=document.querySelector('#runtimeInspector #codeEditor');return t&&t.getClientRects().length?{text:t.value,top:t.scrollTop,lineHeight:parseFloat(getComputedStyle(t).lineHeight)||20,height:t.clientHeight}:null;});
    await p.locator('#runtimeInspectorClose').click();await s.stop();
    const lineSeen=!!shown&&line>=1&&(line-1)*shown.lineHeight>=shown.top-1&&(line-1)*shown.lineHeight<shown.top+shown.height;
    return {expect:{band:band.includes('ねこ')&&band.includes('「動かす」をおしたとき')&&line>=1,opensRunning:!!shown&&shown.text===source&&lineSeen},info:{band,line,shown}};},
  // The toolbar keeps one row at 1366 and 1093 px on the edit and run screens (final call 22); at 800 px the wrapped
  // buttons never cover the view toggle, the level picker or the work's name.
  'CC-350':async s=>{const p=s.page,rows=[];
    const row=async where=>{const r=await p.evaluate(()=>{const items=[...document.querySelectorAll('.menutool > *')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).position!=='absolute'&&getComputedStyle(e).position!=='fixed')
      .map(e=>{const b=e.getBoundingClientRect();return{id:e.id||e.className,top:b.top,bottom:b.bottom,left:b.left,right:b.right};});return{items,innerWidth};});
      const one=r.items.every(a=>r.items.every(b=>a.top<b.bottom&&b.top<a.bottom));rows.push({where,one,items:r.items.length});};
    const both=async where=>{await row(where+'/edit');await s.run();await p.waitForTimeout(400);await row(where+'/run');await s.stop();};
    for(const width of [1366,1093]){await p.setViewportSize({width,height:900});await s.openFile(workFiles.parts);await p.selectOption('#uiLevel','basic');await p.waitForTimeout(200);await s.select('w-neko');await p.selectOption('#eventSelect','start');
     await s.code();await s.write('ずっとくり返す。\n  1秒待つ。');await s.blocks();
      for(const level of ['entry','basic','advanced']){await p.selectOption('#uiLevel',level);await p.waitForTimeout(250);await both(width+'/blocks/'+level);}
      await p.selectOption('#uiLevel','basic');await p.waitForTimeout(200);await s.code();
      for(const level of ['basic','advanced']){await p.selectOption('#uiLevel',level);await p.waitForTimeout(250);await both(width+'/code/'+level);}
      await s.openFile(workFiles.meijin);await both(width+'/meijin');}
    await p.setViewportSize({width:800,height:900});await s.openFile(workFiles.parts);await p.selectOption('#uiLevel','basic');await p.waitForTimeout(250);
    const narrow=await p.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom};},fixed=['#editorModecode:not([hidden]),#editorModeblocks:not([hidden])','#uiLevel','#projectName'].map(q=>box(document.querySelector(q)));
      const others=[...document.querySelectorAll('.menutool button, .menutool summary, .menutool select, .menutool input')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&!e.matches('#editorModecode,#editorModeblocks,#uiLevel,#projectName')).map(box);
      const meets=(a,b)=>a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1;
      return{covered:others.filter(o=>fixed.some(f=>meets(o,f))).length,outside:[...fixed,...others].filter(b=>b.left<-1||b.right>innerWidth+1).length,count:others.length};});
    return {expect:{oneRow:rows.length===24&&rows.every(r=>r.one),narrow:narrow.covered===0&&narrow.outside===0&&narrow.count>0},info:{rows:rows.filter(r=>!r.one),narrow}};},
  // ── The run screen after final calls 21 and 26–28 (lead decision 27: the ⏸／▶ つづける place). ──
  // A mistake stops the run: neither ⏸ nor ▶ つづける, their place kept empty; 本文を見て たしかめる stays, 1つずつ 動かす goes.
  'CC-393':async s=>{const p=s.page;await s.select('w-neko');await s.write('「あ」と言う。\n「い」と言う。\n1秒待つ。\n点数を（5÷点数のあまり）にする。');
    assert.ok(await p.evaluate(()=>Akari.compileProject(Akari.app.project).notes.some(n=>n.code==='I130')),'the regression includes an independent non-stopping notice');
    const edit=await s.toolbar();await s.run();await p.waitForTimeout(600);const running=await s.toolbar();
    await p.locator('#failureModal.show').waitFor({timeout:4000});await p.click('#failureClose');await p.waitForTimeout(300);
    const failed=await s.toolbar(),nameIsText=await s.nameIsText(),nameState=await p.evaluate(()=>({state:Akari.app.editorState.state,text:document.querySelector('#projectNameText')?.hidden})),slot=await p.locator('#runPauseSlot').boundingBox(),work=['newBtn','sampleBtn','basicActionGuide','openBtn','saveBtn','exportBtn','uiLevel'];
    await p.waitForTimeout(300);await p.click('#stopBtn');await p.waitForFunction(()=>Akari.app.editorState.state==='DESIGN');const back=await s.toolbar(),stoppedLine=(await p.locator('#statusText').innerText()).trim();
    return {expect:{noPauseOrContinue:!failed.pauseBtn.shown&&!failed.continueBtn.shown&&!!slot&&slot.width>0&&s.samePlace(running.pauseBtn,failed.pauseBtn),
      inspectNotStep:failed.runtimeInspectBtn.shown&&failed.runtimeInspectBtn.pressable&&!failed.stepBtn.shown,
      barStopAndName:failed.stopBtn.shown&&s.samePlace(edit.runBtn,failed.stopBtn)&&work.every(id=>!failed[id].shown)&&nameIsText,
      back:back.runBtn.shown&&!back.stopBtn.shown,failureBeforeNotice:stoppedLine==='止まって いるよ。コードの 4行目を なおしてね。'&&!stoppedLine.includes('ⓘ')},info:{failed,slot,nameState,stoppedLine}};},
  // A second press of the place within 0.5 s of ⏸ does nothing; ▶ つづける pressed after that goes on.
  'CC-394':async s=>{const p=s.page;await s.select('w-neko');await s.write('ずっとくり返す。\n  1秒待つ。\n  点数を1ふやす。');
    const score=()=>p.evaluate(()=>[...document.querySelectorAll('#runtimeMonitor .monitor-row')].find(r=>r.querySelector('.monitor-key')?.textContent==='点数')?.querySelector('.monitor-value')?.textContent??null);
    await s.run();await p.waitForTimeout(2000);const box=await p.locator('#pauseBtn').boundingBox();
    await p.click('#pauseBtn');await p.mouse.click(box.x+box.width/2,box.y+box.height/2);const pausedScore=await score();await p.waitForTimeout(1000);
    const paused={state:await p.evaluate(()=>Akari.app.editorState.state),bar:await s.toolbar(),score:await score()};
    await p.click('#continueBtn');await p.waitForTimeout(2000);const resumed={state:await p.evaluate(()=>Akari.app.editorState.state),bar:await s.toolbar(),score:await score()};await s.stop();
    return {expect:{stillPaused:paused.state==='PAUSED'&&paused.bar.continueBtn.shown&&!paused.bar.pauseBtn.shown&&s.samePlace(paused.bar.continueBtn,{x:box.x,y:box.y,w:box.width})&&paused.score===pausedScore,
      goesOn:resumed.state==='RUNNING'&&Number(resumed.score)>Number(paused.score)&&resumed.bar.pauseBtn.shown&&!resumed.bar.continueBtn.shown&&s.samePlace(resumed.bar.pauseBtn,paused.bar.continueBtn)},info:{pausedScore,paused:{state:paused.state,score:paused.score},resumed:{state:resumed.state,score:resumed.score}}};},
  // ⏸ pressed with the keyboard leaves the focus on the place, now ▶ つづける; ▶ つづける sends the keys to the work.
  'CC-395':async s=>{const p=s.page;await s.select('w-neko');await s.write('ずっとくり返す。\n  1秒待つ。');
    await p.selectOption('#eventSelect','keyDown');await p.waitForTimeout(250);await s.write('「スペース」キーをおすたびに、\n  点数を1ふやす。');
    const score=()=>p.evaluate(()=>Akari.app.runtime?.projectVars?.get?.('点数')??[...document.querySelectorAll('#runtimeMonitor .monitor-row')].find(r=>r.querySelector('.monitor-key')?.textContent==='点数')?.querySelector('.monitor-value')?.textContent??null);
    await s.run();await p.waitForTimeout(1000);let tabs=0;while(tabs<40&&await p.evaluate(()=>document.activeElement?.id)!=='pauseBtn'){await p.keyboard.press('Tab');tabs++;}
    const reached=await p.evaluate(()=>document.activeElement?.id)==='pauseBtn';await p.keyboard.press('Enter');await p.waitForTimeout(200);
    const paused={state:await p.evaluate(()=>Akari.app.editorState.state),focus:await p.evaluate(()=>document.activeElement?.id)};
    await p.waitForTimeout(1000);await p.keyboard.press('Enter');await p.waitForTimeout(200);await p.keyboard.press('Space');await p.waitForTimeout(500);
    const resumed={state:await p.evaluate(()=>Akari.app.editorState.state),score:String(await score())};await s.stop();
    return {expect:{pausedFocusOnContinue:reached&&paused.state==='PAUSED'&&paused.focus==='continueBtn',keyReachesWork:resumed.state==='RUNNING'&&resumed.score==='1'},info:{tabs,paused,resumed}};},
  // From ▶ 動かす to ■ 止める the screen and the buttons keep their places and sizes, at 1366 and 600 px; the save line
  // is not on the run screen, and at 600 px the bottom line keeps room for two lines.
  'CC-396':async s=>{const p=s.page,rows={};await s.select('w-neko');await s.write('1秒待つ。\n「やあ」と言う。\n1秒待つ。');
    const look=()=>p.evaluate(()=>{const r=q=>{const e=document.querySelector(q),b=e?.getBoundingClientRect();return b?[b.x,b.y,b.width,b.height].map(v=>Math.round(v)).join(','):null;};
      const status=document.querySelector('.status'),text=document.querySelector('#statusText'),proxy=document.createElement('span');proxy.style.cssText='display:block;position:absolute;visibility:hidden;height:1lh;';text.append(proxy);const line=proxy.getBoundingClientRect().height;proxy.remove();if(!(line>0))throw Error('actual status line height is missing');
      const style=getComputedStyle(text),statusTextHeight=text.getBoundingClientRect().height-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)-parseFloat(style.borderTopWidth)-parseFloat(style.borderBottomWidth);
      return {stage:r('#formFrame'),stop:r('#stopBtn'),slot:r('#runPauseSlot'),sentence:r('#execSentence'),strip:r('#runStrip'),saveShown:!!document.querySelector('#saveState').getClientRects().length&&getComputedStyle(document.querySelector('#saveState')).visibility!=='hidden',statusHeight:status.getBoundingClientRect().height,statusTextHeight,line,oneLineControl:line};});
    for(const width of [1366,600]){await p.setViewportSize({width,height:900});await p.waitForTimeout(300);
      await s.run();await p.waitForTimeout(500);const start=await look();await p.click('#pauseBtn');await p.waitForTimeout(500);const paused=await look();
      await p.click('#continueBtn');await p.waitForTimeout(500);const resumed=await look();await p.waitForTimeout(3000);const finished=await look();await p.click('#stopBtn');await p.waitForFunction(()=>Akari.app.editorState.state==='DESIGN');
      rows[width]={start,paused,resumed,finished};}
    const same=r=>['paused','resumed','finished'].every(k=>['stage','stop','slot','sentence','strip'].every(f=>r[k][f]===r.start[f]));
    const hasTwoLines=(height,line)=>height>=2*line-1;
    return {expect:{unmoved1366:same(rows[1366]),noSaveLine:Object.values(rows).every(r=>Object.values(r).every(v=>!v.saveShown)),unmoved600:same(rows[600]),twoLines600:Object.values(rows[600]).every(v=>hasTwoLines(v.statusTextHeight,v.line)&&!hasTwoLines(v.oneLineControl,v.line))},info:rows};},
  // When every body has ended: ■ 止める only; the places of ⏸／▶ つづける, 1つずつ 動かす and 本文を見て たしかめる stay empty.
  'CC-397':async s=>{const p=s.page;await s.select('w-neko');await s.write('1秒待つ。');await s.run();await p.waitForTimeout(500);const running=await s.toolbar();await p.waitForTimeout(1500);const done=await s.toolbar();
    const kept=['pauseBtn','stepBtn','runtimeInspectBtn'];await s.stop();
    return {expect:{stopOnly:done.stopBtn.shown&&done.stopBtn.pressable&&['pauseBtn','continueBtn','stepBtn','runtimeInspectBtn','runBtn'].every(id=>!done[id].shown)&&kept.every(id=>done[id].w>0&&s.samePlace(running[id],done[id]))},info:{running:Object.fromEntries(kept.map(k=>[k,running[k]])),done:Object.fromEntries(kept.map(k=>[k,done[k]]))}};},
  // The ▶ player stopped by a mistake: ■ 止める only, and the line under it says what ■ does.
  'CC-400':async s=>{const p=s.page;await s.select('w-neko');await s.write('1秒待つ。\n点数を（5÷点数のあまり）にする。');
    await (await reveal(p.locator('#exportBtn'))).click();await p.locator('#exportChoiceModal').waitFor({state:'visible'});
    const downloading=p.waitForEvent('download');await p.click('#exportControls');const file=path.join(directory,'CC-400-player.html');await (await downloading).saveAs(file);
    const q=await p.context().newPage();q.on('pageerror',e=>pageErrors.push(e.message));await q.goto(pathToFileURL(file).href);await q.waitForFunction(()=>document.querySelector('#playerRoot')?.dataset.state==='READY');
    const shown=()=>q.evaluate(()=>{const seen=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility==='visible';
      return ['playerStart','playerStop','playerPause'].map(id=>document.getElementById(id)).filter(e=>e&&seen(e)).map(e=>(e.children.length?[...e.children].filter(seen).map(c=>c.textContent).join(''):e.textContent).trim()).filter(Boolean).join('|');});
    const scene=()=>q.evaluate(()=>[...document.querySelectorAll('#formSurface .component')].map(c=>[c.style.left,c.style.top,c.style.transform,c.style.display].join(' ')).join('|')+'|'+document.querySelectorAll('#formSurface .sprite-bubble').length);
    const startScene=await scene();await q.click('#playerStart');await q.waitForFunction(()=>document.querySelector('#playerRoot').dataset.state==='FAILED',null,{timeout:4000});
    const failed={shown:await shown(),line:(await q.locator('#playerStatus').innerText()).trim()};await q.waitForTimeout(300);await q.click('#playerStop');await q.waitForTimeout(300);
    const stopped={shown:await shown(),scene:await scene()};await q.close();
    return {expect:{stopOnly:failed.shown==='■ 止める',line:failed.line==='動きが とちゅうで 止まったよ。「■ 止める」を おすと、はじめに もどるよ',back:stopped.shown==='▶ 動かす'&&stopped.scene===startScene},info:{failed,stopped}};},
  // The ▶ player's ⏸／▶ つづける place: a second press within 0.5 s does nothing, the keyboard focus stays on the place, and
  // after ▶ つづける the keys reach the work.
  'CC-401':async s=>{const p=s.page;await s.select('w-neko');await s.write('ずっとくり返す。\n  1秒待つ。');
    await p.selectOption('#eventSelect','keyDown');await p.waitForTimeout(250);await s.write('「スペース」キーをおすたびに、\n  点数を1ふやす。\n  点数を言う。');
    await (await reveal(p.locator('#exportBtn'))).click();await p.locator('#exportChoiceModal').waitFor({state:'visible'});
    const downloading=p.waitForEvent('download');await p.click('#exportControls');const file=path.join(directory,'CC-401-player.html');await (await downloading).saveAs(file);
    const q=await p.context().newPage();q.on('pageerror',e=>pageErrors.push(e.message));await q.goto(pathToFileURL(file).href);await q.waitForFunction(()=>document.querySelector('#playerRoot')?.dataset.state==='READY');
    const label=()=>q.evaluate(()=>{const b=document.querySelector('#playerPause');return [...b.children].filter(c=>getComputedStyle(c).visibility==='visible').map(c=>c.textContent).join('');});
    await q.click('#playerStart');await q.waitForTimeout(1000);const before=await q.locator('#playerPause').boundingBox();
    await q.click('#playerPause');await q.mouse.click(before.x+before.width/2,before.y+before.height/2);await q.waitForTimeout(1000);
    const paused={state:await q.locator('#playerRoot').getAttribute('data-state'),label:await label(),box:await q.locator('#playerPause').boundingBox()};
    await q.locator('#playerPause').focus();await q.keyboard.press('Enter');await q.waitForTimeout(200);await q.keyboard.press('Space');await q.waitForTimeout(500);
    const said=await q.evaluate(()=>document.querySelector('.sprite-bubble[data-runtime-id="w-neko"] .sprite-bubble-text')?.textContent??null),resumed=await q.locator('#playerRoot').getAttribute('data-state');
    // The focus is moved back with Shift+Tab: a Tab past the page's last control leaves the page, and leaving the page
    // pauses the work (as the player does when its window loses the focus).
    await q.waitForTimeout(600);let tabs=0;while(tabs<20&&await q.evaluate(()=>document.activeElement?.id)!=='playerPause'){await q.keyboard.press('Shift+Tab');tabs++;}
    await q.keyboard.press('Enter');await q.waitForTimeout(200);const again={state:await q.locator('#playerRoot').getAttribute('data-state'),focus:await q.evaluate(()=>document.activeElement?.id),label:await label()};await q.close();
    return {expect:{stillPaused:paused.state==='PAUSED'&&paused.label==='▶ つづける'&&Math.abs(paused.box.x-before.x)<1&&Math.abs(paused.box.width-before.width)<1,
      keyReachesWork:resumed==='RUNNING'&&said==='1',keyboardPauseFocus:again.state==='PAUSED'&&again.focus==='playerPause'&&again.label==='▶ つづける'},info:{paused,said,resumed,tabs,again}};},
  // A work whose only body starts on a press does not end: it is running, and the line says what starts it.
  'CC-420':async s=>{const p=s.page;await s.select('w-neko');await p.selectOption('#eventSelect','click');await p.waitForTimeout(250);await s.write('「やあ」と言う。');
    await s.run();await p.waitForTimeout(1000);const r={state:(await p.locator('#runState').innerText()).trim(),line:(await p.locator('#statusText').innerText()).trim()};await s.stop();
    return {expect:{running:r.state==='動いているよ',line:r.line==='「ねこ」を おすと 動くよ'},info:r};},
  // A body that waits for an extension signal nobody registered is an ordinary signal: the work ends.
  'CC-421':async s=>{const p=s.page,done='おわったよ。もう一度 動かすときは「■ 止める」を おしてから「▶ 動かす」を おしてね';await s.select('w-neko');
    await s.write('「拡張:demo.nothing/x」という合図を受けたとき、「あ」と言う。');await s.run();await p.waitForTimeout(1000);
    const r={state:(await p.locator('#runState').innerText()).trim(),line:(await p.locator('#statusText').innerText()).trim()};await s.stop();
    return {expect:{ended:r.line===done&&[done,'おわったよ'].includes(r.state)},info:r};},
  // 作品を全部止める after a ふきだし keeps the ふきだし; the line says how to go back, and no notice comes with it.
  'CC-423':async s=>{const p=s.page;await s.select('w-neko');await s.write('「まけ」と言う。\n作品を全部止める。');await s.run();await p.waitForTimeout(1000);
    const r={bubble:await s.bubble('w-neko'),line:(await p.locator('#statusText').innerText()).trim(),notice:(await p.locator('#codeIssue').innerText().catch(()=>'')).trim()};
    await s.stop();await p.waitForTimeout(300);const after=(await p.locator('#codeIssue').innerText().catch(()=>'')).trim();
    return {expect:{bubbleKept:r.bubble==='まけ'&&r.line==='作品が 止まったよ。作る 画面に もどる ときは「■ 止める」を おしてね',noNotice:!r.notice.includes('ⓘ')&&!after.includes('ⓘ')},info:{...r,after}};},
  // はじめて's run screen keeps only what can be used (lead decision 34): no event, ＋ or block tool buttons, a larger
  // screen with the blocks small beside it; at 650 px or less the screen and the parts list in one column.
  'CC-392':async s=>{const p=s.page;await p.setViewportSize({width:1366,height:900});await s.select('w-neko');
    const wait=p.locator('#blockEditor [data-blockui-action="palette-add"][data-blockui-schema="WaitTime"]:visible').first();for(let i=0;i<3;i++){await wait.click();await p.waitForTimeout(250);}
    const second=p.locator('#blockEditor .blockui-node[data-schema-id="WaitTime"]').nth(1);await clickNode(second);await p.waitForTimeout(200);
    const look=()=>p.evaluate(()=>{const seen=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility==='visible',all=q=>[...document.querySelectorAll(q)];
      const box=q=>{const e=document.querySelector(q);if(!e||!seen(e))return null;const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,bottom:b.bottom,right:b.right};};
      return {events:all('#entryEvents button').filter(seen).length,adds:all('.entry-add').filter(seen).length,tools:all('#blockEditor [data-blockui-action="move-up"],#blockEditor [data-blockui-action="move-down"],#blockEditor [data-blockui-action="remove"]').filter(seen).length,
        inserts:all('#blockEditor [data-blockui-action="body-insert"]').filter(seen).length,pale:all('#entryEvents button,.entry-add,#blockEditor .blockui-node-head button').filter(e=>seen(e)&&(e.disabled||Number(getComputedStyle(e).opacity)<1)).length,
        blocks:all('#blockEditor .blockui-node').filter(seen).length,stage:box('#formFrame'),strip:box('#runStrip'),slot:box('#runPauseSlot'),parts:box('#projectTree'),editor:box('#blockEditor'),scroll:document.documentElement.scrollWidth>innerWidth+1};});
    const before=await look();await s.run();await p.waitForTimeout(500);const wide=await look();await p.waitForTimeout(3000);await s.stop();const back=await look();
    await p.setViewportSize({width:600,height:900});await p.waitForTimeout(300);const narrowEdit=await look();await s.run();await p.waitForTimeout(500);const narrow=await look();await s.stop();await p.waitForTimeout(300);const narrowBack=await look();
    const column=n=>!!n.stage&&!!n.parts&&n.parts.y>=n.stage.bottom-1&&n.blocks===0&&!!n.strip&&!!n.slot&&n.slot.y>=n.stage.bottom-1&&n.slot.bottom<=n.parts.y+1&&!n.scroll;
    return {expect:{nothingUnusable:before.events>0&&before.adds>0&&before.tools>0&&before.inserts>0&&wide.events===0&&wide.adds===0&&wide.tools===0&&wide.inserts===0&&wide.pale===0,
      largerWithBlocks:!!wide.stage&&wide.stage.w>before.stage.w&&wide.blocks>0,back:back.events>0&&back.adds>0&&back.inserts>0,
      oneColumn:column(narrow),restored:narrowBack.blocks>0&&narrowBack.events===narrowEdit.events&&narrowBack.inserts===narrowEdit.inserts},info:{before,wide,back,narrowEdit,narrow,narrowBack}};},
  // A screen height change that leaves a part outside says so and keeps the part where it is (A-07, A-20).
  'CC-403':async s=>{const p=s.page;await s.newWork();await p.selectOption('#uiLevel','advanced');await p.waitForTimeout(200);const id=(await s.part('たくどん')).id;await s.select(id);
    await s.prop('たてのばしょ',600);await s.select('stage');await s.prop('高さ',300);const line=(await p.locator('#statusText').innerText()).trim();await s.select(id);const y=await s.propValue('たてのばしょ');
    return {expect:{note:line==='「たくどん」は 画面の 外に あるよ。「せってい」の「よこのばしょ」・「たてのばしょ」で もどせるよ',kept:y==='600'},info:{line,y}};},
  // The stage dots lie on the backdrop every 10 steps from the bottom-left corner, on the edit screen, the run screen and
  // 大きく見る, also at a height that is not a multiple of 10 (A-16). The dots are found in a screenshot of the screen at
  // 100%: columns from the left edge and rows from the bottom edge, at 0, 10, 20… steps.
  'CC-404':async s=>{const p=s.page;await s.newWork();await p.selectOption('#uiLevel','advanced');await p.waitForTimeout(200);await s.select('stage');
    // The bottom-left corner of the screen is scrolled into view, and a 60-step square there is read at 100%.
    const dots=async()=>{const reset=p.locator('#stageZoomReset');if(await reset.isVisible())await reset.click();await p.waitForTimeout(200);
      await p.locator('#formSurface').evaluate(n=>{for(let v=n.parentElement;v;v=v.parentElement){v.scrollTop=v.scrollHeight;v.scrollLeft=0;}});await p.waitForTimeout(150);
      const r=await p.locator('#formSurface').evaluate(n=>{const b=n.getBoundingClientRect();return {x:b.left+scrollX,bottom:b.bottom+scrollY,k:b.width/n.clientWidth};}),size=Math.ceil(60*r.k);
      const shot=await p.screenshot({clip:{x:r.x,y:r.bottom-size,width:size,height:size}});
      return p.evaluate(async({b64,k})=>{const raw=atob(b64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);const img=await createImageBitmap(new Blob([bytes],{type:'image/png'})),c=new OffscreenCanvas(img.width,img.height),g=c.getContext('2d');g.drawImage(img,0,0);
        const d=g.getImageData(0,0,img.width,img.height).data,z=img.width/Math.ceil(60*k)*k,px=(x,y)=>{const i=(Math.round(y)*img.width+Math.round(x))*4;return [d[i],d[i+1],d[i+2]];};
        const bg=px(5*z,img.height-1-5*z),differs=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2])>18;
        // A dot at (10i, 10j) steps: its ink differs from the backdrop, which shows between two dots (5 steps away).
        let on=0,off=0;for(let i=1;i<=4;i++)for(let j=1;j<=4;j++){const x=10*i*z,y=img.height-1-10*j*z;if(differs(px(x,y),bg))on++;if(differs(px(x+5*z,y-5*z),bg))off++;}
        return {on,off,bg,scale:z,size:[img.width,img.height]};},{b64:shot.toString('base64'),k:r.k});};
    // ▶ 動かす does not run a work with no sentence (CC-347, CC-348), so the run screen of step 6 is reached with one
    // body that waits; it draws nothing on the screen.
    const edit=await dots();await s.prop('高さ',405);const tall=await dots();await s.select((await s.part('たくどん')).id);await s.code();await s.write('3秒待つ。');await s.select('stage');await s.run();await p.waitForTimeout(500);const running=await dots();await s.stop();
    await p.locator('#stageZoomFull, #designerFullscreen, button:has-text("大きく見る")').first().click();await p.waitForTimeout(400);const full=await dots();
    const ok=d=>d.on===16&&d.off===0;
    return {expect:{onBackdrop:ok(edit)&&ok(tall),running:ok(running),large:ok(full)},info:{edit,tall,running,full}};},
  // A made file shows no stage dots in either way to start (P7/P21 (c)).
  'CC-405':async s=>{const p=s.page;await s.newWork();await p.selectOption('#uiLevel','advanced');await p.waitForTimeout(200);
    const make=async(button,name)=>{await (await reveal(p.locator('#exportBtn'))).click();await p.locator('#exportChoiceModal').waitFor({state:'visible'});const downloading=p.waitForEvent('download');await p.click(button);
      const file=path.join(directory,name);await (await downloading).saveAs(file);return file;};
    const dotted=q=>q.evaluate(()=>[document.querySelector('#formSurface'),...document.querySelectorAll('#formSurface *')].some(e=>/radial-gradient/.test(getComputedStyle(e).backgroundImage)));
    const controls=await make('#exportControls','CC-405-controls.html'),q=await p.context().newPage();await q.goto(pathToFileURL(controls).href);await q.waitForFunction(()=>document.querySelector('#playerRoot')?.dataset.state==='READY');
    const ready=await dotted(q);await q.click('#playerStart');await q.waitForTimeout(500);const running=await dotted(q);await q.waitForFunction(()=>document.querySelector('#playerRoot').dataset.state==='FINISHED',null,{timeout:4000}).catch(()=>{});const finished=await dotted(q);await q.close();
    const artwork=await make('#exportArtwork','CC-405-artwork.html'),r=await p.context().newPage();await r.goto(pathToFileURL(artwork).href);await r.waitForTimeout(500);const opened=await dotted(r);await r.close();
    return {expect:{controls:!ready&&!running&&!finished,artwork:!opened},info:{ready,running,finished,opened}};},
  // A toolbox drop puts the part's centre where it is let go (A-11): 四角 at よこ100・たて300.
  'CC-406':async s=>{const p=s.page;await s.newWork();await p.selectOption('#uiLevel','advanced');await p.waitForTimeout(200);await s.code();
    // At 100% one step is one pixel; a drop's place is a whole pixel, so a smaller screen could not show the 1-step rule.
    if(await p.locator('#stageZoomReset').isVisible()){await p.click('#stageZoomReset');await p.waitForTimeout(200);}
    const before=await p.evaluate(()=>Akari.app.project.components.map(c=>c.id)),r=await p.locator('#formSurface').evaluate(n=>{const b=n.getBoundingClientRect();return {w:b.width,h:b.height,W:Akari.app.project.stage.width,H:Akari.app.project.stage.height};});
    const tool=await reveal(p.locator('.tool[data-type="box"]'));await tool.dragTo(p.locator('#formSurface'),{targetPosition:{x:100*r.w/r.W,y:r.h-300*r.h/r.H}});await p.waitForTimeout(300);
    const id=await p.evaluate(b=>Akari.app.project.components.find(c=>!b.includes(c.id))?.id,before);if(id)await s.select(id);
    const got={x:Number(await s.propValue('よこのばしょ')),y:Number(await s.propValue('たてのばしょ')),w:Number(await s.propValue('はば')),h:Number(await s.propValue('高さ'))};
    return {expect:{centre:!!id&&Math.abs(got.x-100)<=1&&Math.abs(got.y-300)<=1,size:got.w===120&&got.h===80},info:{id,got}};},
  // While a part is dragged the bottom line reads its centre, and while it is resized its size; resizing keeps the
  // centre, so 10 steps out on the right handle make it 20 steps wider (A-08, A-15).
  'CC-407':async s=>{const p=s.page;await s.newWork();await p.selectOption('#uiLevel','advanced');await p.waitForTimeout(200);const id=(await s.part('たくどん')).id;await s.select(id);
    const k=await p.locator('#formSurface').evaluate(n=>n.getBoundingClientRect().width/Akari.app.project.stage.width),part=p.locator('#formSurface .component[data-id="'+id+'"]'),b=await part.boundingBox();
    const cx=b.x+b.width/2,cy=b.y+b.height/2;await p.mouse.move(cx,cy);await p.mouse.down();await p.mouse.move(cx+25*k,cy+35*k,{steps:4});await p.mouse.move(cx+50*k,cy+70*k,{steps:4});
    const dragging=(await p.locator('#statusText').innerText()).trim();await p.mouse.up();await p.waitForTimeout(200);
    const moved={x:await s.propValue('よこのばしょ'),y:await s.propValue('たてのばしょ'),w:await s.propValue('はば'),h:await s.propValue('高さ')};
    const handle=p.locator('.design-resize-handle[data-resize-for="'+id+'"][data-resize-direction="e"]'),hb=await handle.boundingBox(),hx=hb.x+hb.width/2,hy=hb.y+hb.height/2;
    await p.mouse.move(hx,hy);await p.mouse.down();await p.mouse.move(hx+5*k,hy,{steps:3});await p.mouse.move(hx+10*k,hy,{steps:3});const resizing=(await p.locator('#statusText').innerText()).trim();await p.mouse.up();await p.waitForTimeout(200);
    const resized={x:await s.propValue('よこのばしょ'),y:await s.propValue('たてのばしょ'),w:await s.propValue('はば'),h:await s.propValue('高さ')};
    return {expect:{dragLine:dragging==='よこのばしょ 370　たてのばしょ 130',moved:moved.x==='370'&&moved.y==='130',resizeLine:resizing==='はば 200　高さ 180',resized:resized.x==='370'&&resized.y==='130'&&resized.w==='200'&&resized.h==='180'},info:{dragging,moved,resizing,resized,k}};},
  // キャラクター and 部品 are named apart on the delete button and the copy's title; the ヒント names both (F-23).
  'CC-408':async s=>{const p=s.page;await s.newWork();await p.selectOption('#uiLevel','advanced');await p.waitForTimeout(200);
    const actions=()=>p.evaluate(()=>{const d=document.querySelector('.prop-actions .prop-delete'),c=document.querySelector('.prop-actions .prop-duplicate');return {del:d?.textContent??null,copy:c?.textContent??null,title:c?.title??null};});
    await s.select((await s.part('たくどん')).id);const sprite=await actions();
    const before=await p.evaluate(()=>Akari.app.project.components.map(c=>c.id));await (await reveal(p.locator('.tool[data-type="label"]'))).click();await p.waitForTimeout(300);
    const label=await p.evaluate(b=>Akari.app.project.components.find(c=>!b.includes(c.id))?.id,before);await s.select(label);const text=await actions();
    const hint=await p.evaluate(()=>[...document.querySelectorAll('#basicActionGuide p')].map(n=>n.textContent).find(t=>t.startsWith('見た目のコピー'))||'');
    await s.select('stage');const names=await p.locator('#properties .prop-name').allInnerTexts();
    return {expect:{character:sprite.copy==='見た目のコピー'&&sprite.del==='🗑 この キャラクターを けす'&&sprite.title==='見た目と せっていが 同じ キャラクターを もう1つ 作ります（本文は もちません）',
      part:text.copy==='見た目のコピー'&&text.del==='🗑 この 部品を けす'&&text.title==='見た目と せっていが 同じ 部品を もう1つ 作ります（本文は もちません）',
      hint:hint.includes('見た目と せっていが 同じ キャラクターや 部品を もう1つ 作ります。本文は もちません。'),names:names.map(n=>n.trim()).includes('名前の ひょうじ')},info:{sprite,text,hint,names}};},
  // ── Notices (P11 (d)) and the new-block values. ──
  // はじめて's blocks also mark a sentence with a notice: a blue dashed outline and 「ⓘ 知らせ」, whose press opens the text.
  'CC-411':async s=>{const p=s.page;await s.select('w-neko');
    const say=p.locator('#blockEditor [data-blockui-action="palette-add"][data-blockui-schema^="Say"]:visible').first();await say.click();await p.waitForTimeout(250);await say.click();await p.waitForTimeout(250);
    const nodes=p.locator('#blockEditor .blockui-node[data-schema-id="Say"]');
    for(const [i,text] of [[0,'あ'],[1,'い']]){const node=nodes.nth(i),field=node.locator('[data-schema-id="StringLiteral"] input[data-blockui-field="value"]').first();await field.fill(text);await field.press('Enter');await p.waitForTimeout(250);
      await clickNode(node);const extra=node.locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-extra');if(await extra.count()&&!await extra.evaluate(e=>e.open))await extra.locator(':scope > summary').click();
      await node.locator('[data-blockui-action="speech-untimed"]').first().click();await p.waitForTimeout(300);
      // The 「…」 panel floats over the next block; it is closed before that block is chosen.
      if(await extra.count()&&await extra.evaluate(e=>e.open))await extra.locator(':scope > summary').click();await p.waitForTimeout(200);}
    const source=await p.evaluate(()=>Akari.app.editorState.main.sourceText);
    const look=()=>p.evaluate(()=>{const n=[...document.querySelectorAll('#blockEditor .blockui-node[data-schema-id="Say"]')],seen=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility==='visible';
      return n.map(x=>{const mark=x.querySelector(':scope > .blockui-node-head [data-blockui-action="notices"]'),list=x.querySelector(':scope > .blockui-node-notices'),cs=getComputedStyle(x.querySelector(':scope > .blockui-node-content > .blockui-node-main')),rgb=(cs.outlineColor.match(/\d+/g)||[]).map(Number);
        return {notice:x.classList.contains('blockui-notice'),dashed:cs.outlineStyle==='dashed'&&rgb.length>=3&&rgb[2]>rgb[0],mark:seen(mark),text:seen(list)?list.innerText.trim():''};});});
    const first=await look();await p.locator('#blockEditor .blockui-node[data-schema-id="Say"] [data-blockui-action="notices"]').first().click();await p.waitForTimeout(250);const opened=await look();
    await p.locator('#blockEditor .blockui-node[data-schema-id="Say"] [data-blockui-action="notices"]').first().click();await p.waitForTimeout(250);const closed=await look();
    return {expect:{twoUntimed:source.trim()==='「あ」と言う。\n「い」と言う。',marked:first[0].notice&&first[0].dashed&&first[0].mark&&!first[1].notice&&!first[1].mark,
      opens:opened[0].text.startsWith('時間を 書かない「言う」は、すぐ 次の 文へ 進みます。'),closes:closed[0].text===''},info:{source,first,opened,closed}};},
  // The code view marks a notice by a blue line number and 「ⓘ N行目：」 under the code; a second notice is counted, and a
  // notice with a fix offers it.
  'CC-412':async s=>{const p=s.page;await s.select('w-neko');
    const look=()=>p.evaluate(()=>({issue:document.querySelector('#codeIssue').innerText.trim(),kind:document.querySelector('#codeIssue').className,notice:[...document.querySelectorAll('.gutter-line.notice')].map(n=>Number(n.textContent)),
      error:document.querySelectorAll('.gutter-line.error').length,blue:(()=>{const n=document.querySelector('.gutter-line.notice'),o=document.querySelector('.gutter-line:not(.notice):not(.error):not(.active)');return !!n&&!!o&&getComputedStyle(n).color!==getComputedStyle(o).color;})(),
      fixes:[...document.querySelectorAll('#codeIssue [data-note-fix]')].map(b=>b.title)}));
    await s.write('「あ」と言う。\n「い」と言う。');const two=await look();await s.write('「あ」と言う。\n「い」と言う。\n画面の左下のはしから、右へ320歩のばしょへ行く。');const three=await look();
    await s.write('画面の左下のはしから、右へ320歩のばしょへ行く。');const one=await look();
    return {expect:{notice:two.notice.includes(1)&&two.issue.startsWith('ⓘ 1行目：時間を 書かない「言う」は、すぐ 次の 文へ 進みます。')&&two.error===0&&two.kind==='issue-notice'&&two.blue,
      counted:three.issue.startsWith('ⓘ 1行目：')&&three.issue.includes('ほかにも 知らせが 1つ あります。')&&three.notice.includes(3),
      fixes:bare(one.issue).startsWith(bare('ⓘ 1行目：たての 歩数を 書いていないので、'))&&one.fixes.length===2&&one.fixes.some(t=>t.includes('上へ（たてのばしょ）歩'))&&one.fixes.some(t=>t.includes('上へ0歩'))},info:{two,three,one}};},
  // A mistake comes first: with one, no notice mark is shown.
  'CC-413':async s=>{const p=s.page;await s.select('w-neko');await s.write('「あ」と言う。\n「い」と言う。\n右へ10歩動く。');
    const r=await p.evaluate(()=>({issue:document.querySelector('#codeIssue').innerText.trim(),kind:document.querySelector('#codeIssue').className,notice:document.querySelectorAll('.gutter-line.notice').length,error:[...document.querySelectorAll('.gutter-line.error')].map(n=>Number(n.textContent))}));
    return {expect:{mistakeFirst:r.kind.includes('issue-error')&&r.error.includes(3)&&r.issue.includes('3行目'),noNotice:!r.issue.includes('ⓘ')&&r.notice===0},info:r};},
  // The run screen shows no notice; ■ says once that there is one, names the body when it is another one, and says
  // only 止まって いるよ when the same notice comes again.
  'CC-414':async s=>{const p=s.page,two='「あ」と言う。\n「い」と言う。';await s.select('w-neko');await s.write(two);
    const marks=()=>p.evaluate(()=>{const seen=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility==='visible';return {issue:seen(document.querySelector('#codeIssue'))&&document.querySelector('#codeIssue').innerText.includes('ⓘ'),
      outlines:[...document.querySelectorAll('.blockui-node-main')].filter(e=>seen(e)&&getComputedStyle(e).outlineStyle==='dashed').length,marks:[...document.querySelectorAll('[data-blockui-action="notices"],.blockui-node-notices')].filter(seen).length,fixes:[...document.querySelectorAll('[data-note-fix]')].filter(seen).length,blue:[...document.querySelectorAll('.gutter-line.notice')].filter(seen).length};});
    const line=async()=>(await p.locator('#statusText').innerText()).trim();
    await s.run();await p.waitForTimeout(300);const running=await marks();await p.waitForTimeout(700);await s.stop();const first=await line(),back=await marks();
    await s.run();await p.waitForTimeout(1000);await s.stop();const again=await line();
    await s.write('');await s.select('w-dango');await s.write(two);await s.select('w-neko');await s.run();await p.waitForTimeout(1000);await s.stop();const other=await line();
    return {expect:{noneWhileRunning:!running.issue&&running.outlines===0&&running.marks===0&&running.fixes===0&&running.blue===0,onceAfterStop:first==='止まって いるよ。ⓘ が ついた ところに 知らせが あるよ'&&back.issue,
      sameAgain:again==='止まって いるよ',namesOther:other==='止まって いるよ。「だんご」の 「動かす」を おしたときの 本文に ⓘ の 知らせが あるよ'},info:{running,first,back,again,other}};},
  // A rewrite button right under the code works with the mouse and with Tab and Enter.
  'CC-415':async s=>{const p=s.page;await s.select('w-neko');
    // The rewrite button names its sentence in its title; it is the one right under the code.
    const fix=source=>p.locator('button[title^="'+source.replace(/。$/,'')+'"]:visible').first();
    await s.write('もし画面のはしにふれていたら、はね返る。');const under=await fix('画面のはしにふれていれば、はね返る。').evaluate(b=>{const c=document.querySelector('#codeEditor').getBoundingClientRect(),area=b.closest('#editorPending,#codeIssue'),box=area.getBoundingClientRect();return {gap:box.top-c.bottom,where:area.id};}).catch(()=>({gap:NaN}));
    await fix('画面のはしにふれていれば、はね返る。').click();await p.waitForTimeout(450);const mouse=await s.text();
    // Tab goes from the code through what lies before the button (the 先生むけ details) to the rewrite button.
    await s.write('ドの音を0.5秒鳴らす。');await p.locator('#codeEditor').focus();let tabs=0;do{await p.keyboard.press('Tab');tabs++;}while(tabs<4&&await p.evaluate(()=>!(document.activeElement?.tagName==='BUTTON'&&document.activeElement.title)));const focused=await p.evaluate(()=>{const a=document.activeElement;return a?.tagName==='BUTTON'?a.title.replace(/。?$/,'。'):null;});
    await p.keyboard.press('Enter');await p.waitForTimeout(450);const keyboard=await s.text();
    return {expect:{mouse:under.gap>=-1&&under.gap<8&&mouse.trim()==='画面のはしにふれていれば、はね返る。',keyboard:focused==='262Hzの音を0.5秒鳴らす。'&&keyboard.trim()==='262Hzの音を0.5秒鳴らす。'},info:{under,mouse,focused,tabs,keyboard}};},
  // A sentence with no subject after 「おばあさんは…」 shows the carried-over subject as a pale chip in its だれが slot, and the
  // code does not write it (lead decision 30).
  'CC-416':async s=>{const p=s.page,source='おばあさんは「こんにちは」と言う。\n「うんとこしょ」と2秒話す。\n「やあ」と言う。';await s.select('w-ojii');await s.write(source);await s.press('コードモード ⇄');
    const chips=await p.evaluate(()=>[...document.querySelectorAll('#blockEditor .blockui-script .blockui-node[data-schema-id^="Say"]')].map(n=>{const c=n.querySelector('.blockui-subject-carried'),seen=c&&c.getClientRects().length>0;
      let contrasts=[];
      if(seen){const rgb=x=>x.match(/[\d.]+/g).map(Number),luma=x=>x.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0),style=getComputedStyle(c),fg=rgb(style.color),background=rgb(style.backgroundColor),before=n.dataset.paletteTone;
        for(const tone of ['motion','look','control','event','data','operator','sense','sound','pen','action','clone','comment']){n.dataset.paletteTone=tone;const shape=n.querySelector(':scope > .blockui-shape path'),base=rgb(getComputedStyle(shape).fill),bg=background.slice(0,3).map((v,i)=>v*(background[3]??1)+base[i]*(1-(background[3]??1))),a=luma(fg),b=luma(bg);contrasts.push({tone,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)});}n.dataset.paletteTone=before;}
      return {chip:seen?c.textContent.trim():null,title:c?.title||c?.getAttribute('aria-description')||'',name:c?.getAttribute('aria-label')||'',contrasts,pale:seen?getComputedStyle(c).borderStyle==='dashed'&&Number(getComputedStyle(c).opacity)===1&&getComputedStyle(c).backgroundColor==='rgba(255, 255, 255, 0.6)':false,read:n.querySelector(':scope > .blockui-node-content > .blockui-node-main')?.innerText.replace(/\s+/g,'')||''};}));
    for(const chip of chips)for(const contrast of chip.contrasts)assert.ok(contrast.ratio>=4.5,'carried subject text contrast '+JSON.stringify(contrast));
    await s.press('ブロックモード ⇄');const back=await s.text();
    return {expect:{firstNamed:chips.length===3&&chips[0].chip===null&&chips[0].read.includes('おばあさんは'),carried:chips[1].chip==='（おばあさんは）'&&chips[2].chip==='（おばあさんは）'&&chips[1].pale,
      explained:chips[1].name==='前の 文の「おばあさんは」を ひきついで、おばあさんが します'&&chips[1].title==='',notWritten:back===source&&!back.includes('（おばあさんは）')},info:{chips,back}};},
  // はじめて's 「回数を決めてくり返す」 comes with 3, and 「前へ進む」 put after it goes inside it.
  'CC-417':async s=>{const p=s.page;await s.newWork();const id=(await s.part('たくどん')).id;await s.select(id);
    const shown=await p.locator('#blockEditor [data-blockui-action="palette-add"][data-blockui-schema="RepeatCount"]:visible').first().evaluate(e=>[...e.querySelectorAll('input')].map(i=>i.value).join(',')||e.innerText.replace(/\s+/g,''));
    await p.locator('#blockEditor [data-blockui-action="palette-add"][data-blockui-schema="RepeatCount"]:visible').first().click();await p.waitForTimeout(300);
    await p.locator('#blockEditor [data-blockui-action="palette-add"][data-blockui-schema="MotionCommand:MOVE"]:visible').first().click();await p.waitForTimeout(300);
    const source=await p.evaluate(()=>Akari.app.editorState.main.sourceText);await s.run();await p.waitForFunction(()=>/おわったよ/.test(document.querySelector('#statusText').textContent),null,{timeout:6000}).catch(()=>{});
    // The part's centre on the run screen, from its place on the screen (left/top in screen steps, the bottom-left frame).
    const after=await p.evaluate(id=>{const e=document.querySelector('#formSurface .component[data-runtime-id="'+id+'"]');return e?{x:parseFloat(e.style.left)+e.offsetWidth/2,y:Akari.app.project.stage.height-parseFloat(e.style.top)-e.offsetHeight/2}:null;},id),failure=await p.locator('#failureModal.show').count();await s.stop();
    return {expect:{three:/3/.test(shown),inside:source.trim()==='3回くり返す。\n  前へ10歩進む。',ran:failure===0&&!!after&&Math.abs(after.x-350)<1e-6&&Math.abs(after.y-200)<1e-6},info:{shown,source,after}};},
  // An empty 「回数を決めてくり返す」 alone does not run: the focus goes to its inside, and the line names the hole.
  'CC-418':async s=>{const p=s.page;await s.newWork();await s.select((await s.part('たくどん')).id);
    await p.locator('#blockEditor [data-blockui-action="palette-add"][data-blockui-schema="RepeatCount"]:visible').first().click();await p.waitForTimeout(300);
    await p.click('#runBtn');await p.waitForTimeout(400);const r=await p.evaluate(()=>{const a=document.activeElement;return {state:Akari.app.editorState.state,line:document.querySelector('#statusText').textContent.trim(),
      focus:a?.dataset?.blockuiAction||a?.tagName,hole:/^Hole:/.test(a?.dataset?.schemaId||''),inLoop:!!a?.parentElement?.closest?.('.blockui-node[data-schema-id="RepeatCount"]')};});
    return {expect:{notRun:r.state==='DESIGN',focusInside:(r.focus==='body-insert'||r.hole)&&r.inLoop,line:r.line==='まだ 動かせないよ。あいている ところが あるよ。くり返すことを 入れてね。'},info:r};},
  // くわしく's new blocks come with values that run: the first other part, 3, 50％, 1つ, 1段階, and the rule 1秒に200歩.
  'CC-419':async s=>{const p=s.page;await s.select('w-neko');await openPaletteTools(p.locator('#blockEditor'));
    for(const id of ['MotionCommand:POINT_TO','CloneCommand:CREATE_TARGET','PenCommand:SET_SIZE','SoundCommand:SET_VOLUME','LooksCommand:FORWARD_LAYERS','SoundCommand:PITCH_UP']){
      await p.locator('#blockEditor [data-blockui-search]').first().fill('');await s.category('all');const add=p.locator('#blockEditor [data-blockui-action="palette-add"][data-blockui-schema="'+id+'"]');
      if(!await add.first().isVisible()){const all=p.locator('#blockEditor [data-blockui-action="palette-category"]').filter({hasText:'すべて'});if(await all.count())await all.first().click();await p.waitForTimeout(200);}
      await add.first().click();await p.waitForTimeout(300);}
    const blocks=await p.evaluate(()=>Akari.app.editorState.main.sourceText);
    await (await reveal(p.locator('#blockEditor [data-blockui-action="rule-add"], #blockEditor button:has-text("＋ キーを おす間など、つづけて動かす")').first())).click();await p.waitForTimeout(400);
    const ruleNode=p.locator('#blockEditor .blockui-node[data-schema-id="ContinuousRule"]').first(),rule=await ruleNode.count()?{text:await readBlock(ruleNode.locator(':scope > .blockui-node-content > .blockui-node-main'))}:null;if(rule)rule.hole=/〔つづけるきまりを(えらぶ|入れる)〕/.test(rule.text);
    await s.press('ブロックモード ⇄');const code=await s.text();
    const want=['「だんご」の方を向く。','「だんご」のコピーを作る。','ペンの太さを3にする。','音の大きさを50％にする。','重なりを1つ手前にする。','音の高さを1段階上げる。'];
    return {expect:{values:want.every(t=>blocks.includes(t)),rule:!!rule&&rule.text.includes('1秒に200歩')&&rule.hole,code:want.every(t=>code.includes(t))&&code.includes('1秒に200歩')},info:{blocks,rule,code}};},
  // ── 名人 ──
  'MC-001':async s=>{const l=await s.level();return {expect:{three:l.options.join('|')==='かんたん|くわしく|名人',noEntry:!l.options.includes('はじめて')},info:l};},
  'MC-002':async s=>{await s.select('w-neko');await s.code();const anywhere=await s.page.evaluate(()=>[...document.querySelectorAll('button,a,summary,option')].some(b=>/名人モードで ?書く|名人で ?書く/.test(b.textContent)&&b.offsetParent!==null));
    return {expect:{nowhere:!anywhere}};},
  'MC-003':async s=>{const before=await s.level();await s.page.selectOption('#uiLevel','basic',{timeout:1000}).catch(()=>{});await s.page.waitForTimeout(200);const after=await s.level();
    const screen=await s.visible('#diagnoseBtn')&&await s.visible('#procBtn')&&await s.visible('#formatBtn');
    return {expect:{meijin:before.chosen==='meijin'&&after.chosen==='meijin'&&before.options.join('|')==='名人'&&after.options.join('|')==='名人',noOthers:!before.others.length&&!after.others.length,advancedScreen:after.shown==='advanced'&&screen,toggleCode:(await s.toggle())==='コードモード ⇄'},info:{before,after}};},
  // The confirm before a body becomes a 名人 text (final call 23).
  'MC-004':async s=>{await s.select('w-neko');await s.code();const kind=await s.startMeijin(false),message=s.page.__akariLastDialog?.message;
    return {expect:{confirm:kind==='confirm'&&message==='名人で 書くと、この本文は ねこから はなれて、「動かすもの」の「名人の本文」に うつります。ブロックには もどせません。\n名人で 書きますか？',notYet:(await s.scripts()).every(x=>x.mode!=='meijin')},info:{message}};},
  'MC-005':async s=>{await s.select('stage');await s.code();await s.startMeijin(true);const scripts=await s.scripts(),meijin=scripts.filter(x=>x.mode==='meijin');
    const listed=await s.page.evaluate(()=>[...document.querySelectorAll('#objectSelect option')].some(o=>o.value==='meijin'&&o.textContent.includes('名人の本文')));
    return {expect:{empty:meijin.length===1&&meijin[0].source==='',ownerless:meijin.every(x=>x.targetId==='meijin'),listed,chosen:(await s.level()).chosen==='meijin'}};},
  'MC-006':async s=>{await s.select('stage');await s.code();await s.write('ねこは、いまのばしょから、右へ10歩動く。');await s.startMeijin(true);const before=await s.text(),label=await s.toggle();await s.press('コードモード ⇄');
    const after=await s.text(),note=await s.note();return {expect:{shown:label==='コードモード ⇄',stillCode:(await s.mode())==='code',sameText:after===before,says:note==='名人は、コードモードで だけ 使えるよ'},info:{before,after,note}};},
  'MC-007':async s=>{await s.select('stage');await s.code();const kind=await s.startMeijin(false);const ordinary=(await s.scripts()).every(x=>x.mode!=='meijin'),level=await s.level();await s.press('コードモード ⇄');
    return {expect:{ordinary:kind==='confirm'&&ordinary,levelKept:level.chosen==='basic'&&level.shown==='basic',blocks:(await s.mode())==='blocks'&&(await s.toggle())==='ブロックモード ⇄'},info:level};},
  'MC-008':async s=>{await s.select('stage');await s.code();await s.write('ねこは、いまのばしょから、右へ10歩動く。');await s.startMeijin(true);await s.page.click('#undoBtn');await s.page.waitForTimeout(300);
    const undone=(await s.scripts()).every(x=>x.mode!=='meijin'),afterUndo=await s.level();await s.press('コードモード ⇄');const blocksAfterUndo=(await s.mode())==='blocks';
    await s.press('ブロックモード ⇄');await s.page.click('#redoBtn');await s.page.waitForTimeout(300);const redone=(await s.scripts()).some(x=>x.mode==='meijin'),afterRedo=await s.level();
    await s.press('コードモード ⇄');const note=await s.note();
    return {expect:{undone,levelBack:afterUndo.chosen==='basic'&&afterUndo.others.includes('advanced'),blocksAfterUndo,redone,levelMeijin:afterRedo.chosen==='meijin',refusedAfterRedo:(await s.mode())==='code'&&note==='名人は、コードモードで だけ 使えるよ'},info:{afterUndo,afterRedo,note}};},
  'MC-009':async s=>{const options=await s.page.evaluate(()=>[...document.querySelectorAll('#objectSelect option')].map(o=>[o.value,o.textContent.trim()]));
    const meijin=options.find(([v])=>v==='meijin');if(meijin)await s.select('meijin');
    return {expect:{listed:!!meijin&&meijin[1].includes('名人の本文'),opens:(await s.text()).trim()===MEIJIN_SOURCE},info:{options}};},
  'MC-010':async s=>{await s.select('meijin');await s.write('ねこが前へ10歩進む\n主役が「やあ」と言う');const before=await s.text();
    if(await s.page.locator('#formatBtn').isVisible()&&await s.page.locator('#formatBtn').isEnabled())await s.page.click('#formatBtn');await s.page.waitForTimeout(300);return {expect:{unchanged:(await s.text())===before}};},
  'MC-011':async s=>{await s.select('meijin');const revert=await s.page.evaluate(()=>[...document.querySelectorAll('button,summary,option,a')].some(b=>b.offsetParent!==null&&/通常の本文に|ふつうの本文に|名人モードを ?やめる|名人を ?やめる/.test(b.textContent)));
    await s.press('コードモード ⇄');const note=await s.note();
    return {expect:{noRevert:!revert,refused:(await s.mode())==='code'&&note==='名人は、コードモードで だけ 使えるよ'},info:{note}};},
  'MC-012':async s=>{await s.select('meijin');await s.write('【ジャンプ】という手順を、次のように作る。\n  いまのばしょから、上へ20歩動く。');await s.page.click('#procBtn');await s.page.waitForTimeout(300);
    const before=await s.page.evaluate(()=>[...document.querySelectorAll('#callableSelect option')].map(o=>o.textContent));
    await s.page.click('#callableNewAction');await s.page.fill('#callableName','おじぎ');await s.page.click('#callableSave');await s.page.waitForTimeout(400);
    const after=await s.page.evaluate(()=>[...document.querySelectorAll('#callableSelect option')].map(o=>o.textContent));
    return {expect:{jump:before.some(t=>t.includes('ジャンプ')&&t.includes('（名人の本文）')),bow:after.some(t=>t.includes('おじぎ')&&!t.includes('（名人の本文）'))},info:{before,after}};},
  'MC-013':async s=>{await s.select('meijin');await s.write('【ジャンプ】という手順を、次のように作る。\n  いまのばしょから、上へ20歩動く。\nねこは【ジャンプ】という手順を行う。');
    await s.select('w-neko');await s.code();await s.write('【ジャンプ】という手順を行う。');await s.page.click('#procBtn');await s.page.waitForTimeout(300);
    const value=await s.page.evaluate(()=>[...document.querySelectorAll('#callableSelect option')].find(o=>o.textContent.includes('ジャンプ'))?.value);
    await s.page.selectOption('#callableSelect',value);await s.page.fill('#meijinProcName','とぶ');await s.page.click('#meijinProcRename');await s.page.waitForTimeout(400);
    if(await s.page.locator('#procModal').isVisible())await s.page.click('#procClose');
    const scripts=await s.scripts(),meijin=scripts.find(x=>x.mode==='meijin').source,neko=scripts.find(x=>x.targetId==='w-neko').source,check=await s.check();
    return {expect:{heading:meijin.includes('【とぶ】という手順を、次のように作る。'),call:meijin.includes('ねこは【とぶ】という手順を行う。'),nekoCall:neko.includes('【とぶ】という手順を行う。'),
      noJump:!scripts.some(x=>x.source.includes('ジャンプ')),noIssue:check.issues.length===0},info:{meijin,neko}};},
  'MC-014':async s=>{await s.select('meijin');await s.write('【ジャンプ】という手順を、次のように作る。\n  いまのばしょから、上へ20歩動く。');await s.page.click('#procBtn');await s.page.waitForTimeout(300);
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
  'MC-235':async s=>{await s.select('stage');await s.code();await s.startMeijin(true);await s.write('10秒のあいだ、くり返す。\n  1秒待つ。\n  点数を1ふやす。\nねこは「おわり」と言う。');
    const said=()=>s.page.evaluate(()=>document.querySelector('#formSurface').innerText.includes('おわり'));
    const score=()=>s.page.evaluate(()=>{const row=[...document.querySelectorAll('#runtimeMonitor .monitor-row')].find(r=>r.querySelector('.monitor-key')?.textContent==='点数');return row?[...row.querySelector('.monitor-value').childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(''):null;});
    const t0=Date.now();await s.page.click('#runBtn');await s.page.waitForTimeout(3000);await s.page.click('#pauseBtn');await s.page.waitForTimeout(200);const pausedAt=await score();await s.page.waitForTimeout(4800);
    const duringPause=await said(),pausedEnd=await score();await s.page.click('#continueBtn');let at=null;
    for(let i=0;i<60&&at===null;i++){await s.page.waitForTimeout(250);if(await said())at=Date.now()-t0;}
    return {expect:{notDuringPause:!duringPause,afterTenRunningSeconds:at!==null&&at>=14500&&at<=17500,scoreHeld:pausedAt!==null&&pausedAt===pausedEnd},info:{at,pausedAt,pausedEnd}};},
  'MC-416':async s=>{await s.select('meijin');await s.code();const meijin=async()=>(await s.scripts()).filter(x=>x.mode==='meijin').length;
    const label=bare(await s.page.locator('#scriptAdd').textContent());await s.page.click('#scriptAdd');await s.page.waitForTimeout(300);
    const bodies=await s.page.evaluate(()=>[...document.querySelectorAll('#eventSelect option')].map(o=>o.textContent.replace(/\s+/g,'')));const added=await meijin();
    s.page.once('dialog',d=>d.accept());await s.page.click('#meijinDelete');await s.page.waitForTimeout(300);const removed=await meijin();
    await s.page.click('#undoBtn');await s.page.waitForTimeout(300);const undone=await meijin();
    return {expect:{label:label==='名人の本文をふやす',listed:bodies.includes('名人の本文1')&&bodies.includes('名人の本文2'),added:added===2,removed:removed===1,undone:undone===2},info:{label,bodies,added,removed,undone}};},
  'MC-469':async s=>{await s.select('w-neko');await s.code();await s.write('作品を動かしたとき、\n  「やあ」と言う。');await s.startMeijin(true);
    const scripts=await s.scripts(),meijin=scripts.filter(x=>x.mode==='meijin').map(x=>x.source),l=await s.level();
    return {expect:{heading:meijin.some(t=>t.includes('作品を動かしたとき、ねこは、')),body:meijin.some(t=>t.includes('「やあ」と言う。')),moved:!scripts.some(x=>x.mode!=='meijin'&&x.targetId==='w-neko'&&x.source.includes('やあ')),
      meijinOnly:l.options.join('|')==='名人'&&(await s.toggle())==='コードモード ⇄'},info:{meijin,l}};},
  'MC-522':async s=>{await s.select('w-neko');await s.code();await s.write('いちばん近いだんごの方を向く。');await s.startMeijin(true);
    const meijin=(await s.scripts()).filter(x=>x.mode==='meijin').map(x=>x.source),errors=await s.page.evaluate(()=>Akari.compileProject(Akari.app.project).errors.map(e=>e.code));
    return {expect:{made:meijin.some(t=>t.includes('作品を動かしたとき、ねこは、')&&t.includes('いちばん近いだんごの方を向く。')),checks:!errors.length},info:{meijin,errors}};},
  'MC-579':async s=>{await s.select('meijin');s.page.once('dialog',d=>d.accept());await s.page.click('#meijinDelete');await s.page.waitForTimeout(300);const l=await s.level();
    return {expect:{gone:(await s.scripts()).every(x=>x.mode!=='meijin'),back:l.chosen==='basic'&&l.shown==='basic',codeLevels:(await s.mode())==='code'&&l.options.join('|')==='かんたん|くわしく|名人'},info:l};},
  'MC-581':async s=>{await s.openFile(workFiles.meijin);const l=await s.level();return {expect:{meijin:l.chosen==='meijin'&&l.options.join('|')==='名人'},info:l};},
  'MC-582':async s=>{await s.openFile(workFiles.meijin);const during=await s.level();await s.openFile(workFiles.parts);const l=await s.level();
    return {expect:{advanced:during.chosen==='meijin'&&l.chosen==='advanced'&&l.shown==='advanced',others:l.others.includes('basic')},info:{during,l}};},
  'MC-583':async s=>{await s.select('meijin');await s.write('ねこは「こんにちは」と言う。');await s.reload();const l=await s.level();
    return {expect:{restored:(await s.scripts()).some(x=>x.mode==='meijin'&&x.source==='ねこは「こんにちは」と言う。')&&l.chosen==='meijin'},info:l};},
  // The level this browser keeps (akari.uiLevel.v1) is かんたん when the page loads again, so only the autosave record can bring くわしく back.
  'MC-584':async s=>{await s.page.selectOption('#uiLevel','advanced');await s.select('w-neko');await s.code();await s.write('いまのばしょから、右へ10歩動く。');
    await s.page.evaluate(()=>localStorage.setItem('akari.uiLevel.v1','basic'));const kept=await s.reload(()=>s.page.evaluate(()=>localStorage.getItem('akari.uiLevel.v1')));const l=await s.level();
    return {expect:{keptBasic:kept==='basic',restored:(await s.scripts()).some(x=>x.targetId==='w-neko'&&x.source==='いまのばしょから、右へ10歩動く。')&&l.chosen==='advanced'&&l.shown==='advanced'},info:{kept,l}};},
  'MC-585':async s=>{await s.select('w-neko');await s.code();await s.write('いまのばしょから、右へ10歩動く。');const l=await s.level(),kind=await s.startMeijin(true);const scripts=await s.scripts();
    return {expect:{noConfirm:l.options.join('|')==='名人'&&kind===null&&scripts.some(x=>x.targetId==='w-neko'&&x.mode!=='meijin'&&x.source==='いまのばしょから、右へ10歩動く。'),oneMeijin:scripts.filter(x=>x.mode==='meijin').length===1},info:l};},
  // Blocks offer はじめて／かんたん／くわしく only, and a level never switches the view (MC-580 retired).
  'MC-586':async s=>{const l=await s.level();
    return {expect:{threeOnly:l.options.join('|')==='はじめて|かんたん|くわしく',noMeijin:!l.options.includes('名人'),stillBlocks:(await s.mode())==='blocks'},info:l};},
  // A work with a 名人 text is code only: every toggle stays in code and says why (final calls 22, 23); the run screen has none.
  'MC-587':async s=>{const p=s.page,why='名人は、コードモードで だけ 使えるよ';
    await s.select('meijin');const label=await s.toggle();await s.press('コードモード ⇄');const meijin={view:await s.mode(),note:await s.note(),code:await s.visible('#codeEditor')};
    await s.select('w-neko');await s.press('コードモード ⇄');const neko={view:await s.mode(),note:await s.note(),code:await s.visible('#codeEditor')};
    await (await reveal(p.locator('#procBtn'))).click();await p.locator('#procModal').waitFor({state:'visible'});if(!await p.locator('#callableCode').isVisible()&&!await p.locator('#callableBlocks').isVisible())await p.click('#callableNewAction');await p.waitForTimeout(200);
    const callableBefore=await readViewToggle(p,'callable');await pressViewToggle(p,'callable');await p.waitForTimeout(200);
    const callable={label:callableBefore.label,view:(await readViewToggle(p,'callable')).view,note:await viewRefusalNote(p,'callable'),code:await s.visible('#callableCode')};await p.click('#procClose');
    await s.select('meijin');await s.run();await p.locator('#runtimeInspectBtn').waitFor({state:'visible'});const runToggle=await s.toggle();
    await p.click('#runtimeInspectBtn');await p.locator('#runtimeInspector[open]').waitFor();await p.waitForTimeout(300);await pressViewToggle(p);await p.waitForTimeout(200);
    const inspector={view:await s.mode(),note:await s.note(),host:await p.locator('#modeBlockedNote').evaluate(n=>n.parentElement?.id||''),code:await p.evaluate(()=>!!document.querySelector('#runtimeInspector[open] #codeEditor')?.getClientRects().length)};
    return {expect:{editToolbar:label==='コードモード ⇄'&&meijin.view==='code'&&meijin.note===why,neko:neko.view==='code'&&neko.note===why,callable:callable.label==='コードモード ⇄'&&callable.view==='code'&&callable.note===why,
      runToolbar:!runToggle,inspector:inspector.view==='code'&&inspector.note===why&&inspector.host==='runtimeInspectorModes',code:meijin.code&&neko.code&&callable.code&&inspector.code},info:{meijin,neko,callable,runToggle,inspector}};},
  // A mistake in the code: the toggle is not pale; a press keeps the code and says how to come back, until the next press or key.
  'MC-588':async s=>{const p=s.page,why='コードの 赤い ところを 直すと、ブロックに もどれるよ';await s.select('w-neko');await s.code();await s.write('「こんにちは」と言');
    const label=await s.toggle();await s.press('コードモード ⇄');const view=await s.mode(),note=await s.note();
    await p.locator('#formSurface').click({position:{x:5,y:5}});await p.waitForTimeout(200);const later=await s.note();
    await s.press('コードモード ⇄');const again=await s.note();await p.keyboard.press('Shift');await p.waitForTimeout(200);const afterKey=await s.note();
    return {expect:{notPale:label==='コードモード ⇄'&&view==='code',says:note===why,hides:!later,keyHides:again===why&&!afterKey},info:{label,note,later,again,afterKey}};},
  // Two お絵かき circles whose bounding boxes meet only at a corner do not touch (owner decision 17).
  'MC-659':async s=>{const p=s.page;await s.code();const moon=await paintCircle(s,200);await s.select(moon.id);await s.prop('名前','つき');
    const placed=await place(s,{...moon,name:'つき'},{x:150,y:150}),W=placed.w,H=placed.h;
    const before=await p.evaluate(()=>Akari.app.project.components.map(c=>c.id));await (await reveal(p.locator('#properties .prop-duplicate'))).click();await p.waitForTimeout(300);
    const copy=await p.evaluate(b=>Akari.app.project.components.find(c=>!b.includes(c.id)),before);await s.select(copy.id);await s.prop('名前','たま');
    const at=v=>String(Math.round(v*100)/100);
    return countTouches(s,'たまが「つき」にふれたとき、たまは「ふれた」と言う。\nたまは画面の左下のはしから、右へ550歩、上へ300歩のばしょへ行く。\n1秒待つ。\nたまは画面の左下のはしから、右へ'+at(150+W*0.9)+'歩、上へ'+at(150+H*0.9)+'歩のばしょへ行く。',false,{W,H,moon:placed,copy:await s.part('たま')});},
  'MC-660':async s=>{const p=s.page;await s.newWork();
    // A new work opens at ブロックの「はじめて」, which shows neither the part picker nor コード: かんたん is chosen first.
    await p.selectOption('#uiLevel','basic');await p.waitForTimeout(250);await (await reveal(p.locator(TOOLBOX_PRESET+'[data-sprite-preset="dango"]'))).click();await p.waitForTimeout(300);
    const takudon=await s.part('たくどん'),dango=await s.part('だんご');await s.press('ブロックモード ⇄');
    return countTouches(s,'だんごがたくどんにふれたとき、だんごは「ふれた」と言う。\nだんごは画面の左下のはしから、右へ520歩、上へ400歩のばしょへ行く。\n1秒待つ。\nだんごは、たくどんのところへ行く。',true,{takudon,dango});},
  'MC-701':async s=>{await s.select('w-neko');await s.code();await s.write('「星」にふれたとき、\n  「いたい」と言う。');await s.startMeijin(true);
    const scripts=await s.scripts(),meijin=scripts.filter(x=>x.mode==='meijin').map(x=>x.source);
    return {expect:{heading:meijin.some(t=>t.includes('ねこが「星」にふれたとき、ねこは、')),body:meijin.some(t=>t.includes('「いたい」と言う。')),moved:!scripts.some(x=>x.mode!=='meijin'&&x.targetId==='w-neko'&&x.source.includes('いたい'))},info:{meijin}};},
  'MC-707':async s=>{const opened={mode:await s.mode(),level:await s.level(),toggle:await s.toggle()};await s.select('meijin');const meijin={mode:await s.mode(),text:await s.text()};
    await s.select('w-neko');const neko={mode:await s.mode(),toggle:await s.toggle()};
    return {expect:{opensInCode:opened.mode==='code'&&opened.level.options.join('|')==='名人',toggleCode:opened.toggle==='コードモード ⇄',meijinText:meijin.mode==='code'&&meijin.text===MEIJIN_SOURCE,nekoCode:neko.mode==='code'&&neko.toggle==='コードモード ⇄'},info:{opened,meijin,neko}};},
};
// MC-659/660: the case's 名人 body, from code, then ▶ and 3 seconds. Every start of the touch body is counted where the
// product says it (EventScheduler.ui.say), not only what stays on the screen.
async function countTouches(s,source,expected,info){const p=s.page;await s.code();await s.startMeijin(true);await s.write('');await s.write(source);
  await p.evaluate(()=>{globalThis.__said=[];const Q=Akari.EventScheduler.prototype,start=Q.start;Q.start=function(...a){const say=this.ui.say;this.ui.say=(id,value)=>{__said.push(value);return say?.(id,value);};return start.apply(this,a);};});
  await s.run();await p.waitForTimeout(3000);const said=await p.evaluate(()=>__said.filter(v=>v==='ふれた').length);await s.stop();
  return {expect:expected?{touchedOnce:said===1}:{notTouched:said===0},info:{...info,said}};}
// A step chooses the level together with its view: 「ブロックで「はじめて」を選ぶ」, 「コードで「くわしく」を選ぶ」. 名人 is chosen
// by the case itself (it turns a body into 名人 text), from code at かんたん; without a step the work opens in blocks at かんたん.
const LEVELS={はじめて:'entry',かんたん:'basic',くわしく:'advanced',名人:'basic'};
const levelOf=c=>{const m=c.steps.join(' ').match(/(コード|ブロック)で「(はじめて|かんたん|くわしく|名人)」(を選|のまま)/);return m?{view:m[1]==='コード'?'code':'blocks',level:LEVELS[m[2]]}:{view:'blocks',level:'basic'};};
const usesMeijinWork=c=>/名人の本文に|「名人の本文」を選|名人モードの本文を開く|名人モードの本文に|名人の本文を一つ持つ作品/.test(c.steps.join(' '));
// Works a case names by its parts rather than by a 名人 body.
const FILE_FOR={'CC-416':'kabu','MC-235':'parts','MC-659':'parts','MC-660':'parts','MC-701':'star'};
// AKARI_SPEC_UI_ONLY=CC-295,MC-006 runs only those cases while looking into them; such a run never passes.
const only=process.env.AKARI_SPEC_UI_ONLY?.split(',').filter(Boolean);
for(const c of uiCases){
  if(only&&!only.includes(c.id))continue;
  const {level,view}=levelOf(c),file=FILE_FOR[c.id]??(usesMeijinWork(c)?'meijin':'parts');
  let page,context;
  try{
    ({page,context}=await open({level,view,file}));
    const fn=checks[c.id];if(!fn)throw Error('no browser route for '+c.id);
    const {expect,info}=await fn(S(page)),missed=Object.entries(expect).filter(([,v])=>v!==true).map(([k])=>k);
    runs.push({id:c.id,level,status:missed.length?'FAIL':'PASS',expect,...(info?{info}:{}),...(missed.length?{detail:'not seen: '+missed.join(',')}:{})});
  }catch(error){runs.push({id:c.id,level,status:'FAIL',detail:(error.message||String(error)).split('\n').slice(0,3).join(' ')});await page?.screenshot({path:path.join(directory,c.id+'-failure.png'),fullPage:true}).catch(()=>{});}
  finally{await context?.close();}
}
await browser.close();
const report={schema:'akari-spec-expectations-ui-v1',status:only?'INCOMPLETE':runs.every(r=>r.status==='PASS')&&!pageErrors.length&&!network.length?'PASS':'FAIL',snapshot:inputs,browser:browser.version?.()||null,
  inputs:Object.fromEntries(areas.map(area=>[area+'/cases.json',sha(fs.readFileSync(path.join(expectationsRoot,area,'cases.json')))])),results:runs,pageErrors,network};
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,total:runs.length,passed:runs.filter(r=>r.status==='PASS').length,pageErrors:pageErrors.length}));
for(const r of runs.filter(r=>r.status!=='PASS'))console.error(r.id,r.detail,JSON.stringify(r.observed||{}).slice(0,300));
if(report.status==='PASS')verifyExpectationsUiReport(JSON.parse(JSON.stringify(report)),inputs,{sha});
process.exitCode=report.status==='PASS'?0:1;
