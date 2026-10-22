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

const {clickNode}=require('../browser/cases/ui-routes.cjs');
// The toolbox's 「はじめから ある キャラクター」 buttons; はじめて's own ＋ buttons (#entryAddRow) carry the same preset names.
const TOOLBOX_PRESET='.tool.sprite-preset';

// Works the steps start from: parts named in the cases, text costumes, the variable 点数 (0), no body yet; one with a 名人
// body, and one that also has 星. Positions are centres from the bottom-left corner of the 640×400 screen.
const PARTS=[['w-neko','ねこ'],['w-dango','だんご'],['w-takudon','たくどん'],['w-inu','犬']];
// The 名人 body keeps running for a while, so the run screen's 「本文を見て たしかめる」 can be pressed (MC-587).
const MEIJIN_SOURCE='ねこはいまのばしょから、右へ10歩動く。\n3秒待つ。';
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
  if(file){await page.setInputFiles('#fileInput',workFiles[file]);await page.waitForFunction(()=>Akari.app.project.components.some(c=>c.name==='ねこ'));}
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
  code:async()=>{if(await page.locator('#editorModecode').getAttribute('aria-pressed')!=='true')await page.click('#editorModecode');await page.waitForTimeout(150);},
  blocks:async()=>{await page.click('#editorModeblocks');await page.waitForTimeout(250);},
  mode:()=>page.evaluate(()=>document.querySelector('#editorModeblocks').getAttribute('aria-pressed')==='true'?'blocks':'code'),
  // The コード／ブロック switch is shown (a switch that is only pale still counts as shown).
  toggle:()=>page.evaluate(()=>{const m=document.querySelector('#editorModecode')?.closest('.editor-modes');return !!m&&!!m.getClientRects().length&&getComputedStyle(m).visibility!=='hidden';}),
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
  startMeijin:async accept=>{let kind=null;const take=d=>{kind=d.type();accept?d.accept():d.dismiss();};
    if(await page.locator('#editorModecode').isVisible()&&await page.locator('#editorModecode').getAttribute('aria-pressed')!=='true'){await page.click('#editorModecode');await page.waitForTimeout(150);}
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
    return {expect:{heading:lines[0]==='たくどんは、3回くり返す。',moveWithoutSubject:lines[1]==='  いまのばしょから、右へ10歩動く。',otherSubject:/^ {2}だんごは.+と言う。$/.test(lines[2]||'')},info:{lines,hole}};},
  'CC-151':async s=>{const pen=()=>s.page.evaluate(()=>{const c=document.querySelector('#penCanvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n;});
    await s.select('w-neko');await s.code();await s.write('ペンを下ろす。\nいまのばしょから、右へ100歩動く。');await s.select('stage');await s.code();await s.write('2秒待つ。\n作品の線とスタンプを全部消す。');
    const check=await s.check();await s.run();await s.page.waitForTimeout(1000);const early=await pen();await s.page.waitForTimeout(2300);const late=await pen();
    return {expect:{lineAtOneSecond:early>0,clearedAfterThree:late===0,noIssue:check.issues.length===0},info:{early,late}};},
  'CC-155':async s=>{await s.select('w-neko');await s.code();await s.write('タイマーを0にする。');await s.blocks();
    const mode=await s.mode(),pale=await s.page.locator('#editorModeblocks').getAttribute('aria-disabled'),note=await s.page.evaluate(()=>{const n=document.querySelector('#modeBlockedNote');return n?.getClientRects().length?n.textContent:'';});
    const blocks=await s.page.evaluate(()=>{const ids=[];const walk=x=>{if(x.schemaId!=='Script')ids.push(x.schemaId);for(const b of Object.values(x.bodies||{}))b.forEach(walk);};walk(Akari.app.editorState.main.blockView);return ids;});
    await s.code();const code=(await s.text()).trim();await s.blocks();await s.category('sense');const sense=await s.palette();
    return {expect:{switched:mode==='blocks'&&pale!=='true'&&!note,oneTimerBlock:blocks.length===1&&blocks[0]==='TimerReset',sameCode:code==='タイマーを0にする。',inSense:sense.includes('TimerReset')},info:{blocks,code,note}};},
  'CC-181':async s=>{await s.newWork();const l=await s.level(),takudon=await s.part('たくどん');
    const empty=(await s.scripts()).every(x=>!x.source.trim());
    return {expect:{entry:l.chosen==='entry'&&l.shown==='entry',blocks:(await s.mode())==='blocks'&&!(await s.toggle()),centre:!!takudon&&takudon.x===320&&takudon.y===200,noCommands:empty},info:{l,takudon}};},
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
  'CC-294':async s=>{const step1=await s.level(),toggle1=await s.toggle();await s.page.selectOption('#uiLevel','basic');await s.page.waitForTimeout(200);await s.code();const step2=await s.level();
    const step3=await s.level();await s.page.selectOption('#uiLevel','advanced');await s.page.waitForTimeout(200);await s.blocks();const step4=await s.level();
    const named=await s.page.getByRole('combobox',{name:'レベル',exact:true}).evaluateAll(es=>es.map(e=>e.id));
    const layout=await s.page.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom};},modes=box(document.querySelector('#editorModecode').closest('.editor-modes')),level=box(document.querySelector('#uiLevel')),name=box(document.querySelector('#projectName'));
      const heading=[...document.querySelectorAll('label,span,div,strong,legend')].some(e=>e.getClientRects().length&&e.textContent.trim()==='見せ方');return{modes,level,name,heading,innerWidth};});
    const row=[layout.modes,layout.level,layout.name],sameRow=row.every(b=>b.top<layout.level.bottom&&b.bottom>layout.level.top);
    return {expect:{entryBlocks:step1.options.join('|')==='はじめて|かんたん|くわしく'&&!toggle1,codeKeepsBasic:step2.chosen==='basic',codeLevels:step3.options.join('|')==='かんたん|くわしく|名人',
      blocksKeepAdvanced:step4.chosen==='advanced'&&step4.options.join('|')==='はじめて|かんたん|くわしく',named:named.length===1&&named[0]==='uiLevel'&&!layout.heading,
      order:sameRow&&layout.modes.right<=layout.level.left&&layout.level.right<=layout.name.left},info:{step1,step2,step3,step4,named,layout}};},
  'CC-295':async s=>{const p=s.page;await s.select('w-takudon');await s.code();await s.write('ずっとくり返す。\n  1秒待つ。');
    const edit={run:await p.locator('#runBtn').isVisible(),stop:await p.locator('#stopBtn').isVisible(),level:await p.locator('#uiLevel').isVisible(),toggle:await s.toggle()},runBox=await p.locator('#runBtn').boundingBox();
    // A double press of ▶ 動かす: its second press lands on ■ 止める, which took ▶'s place (二度押し, LANGUAGE.md).
    await p.mouse.dblclick(runBox.x+runBox.width/2,runBox.y+runBox.height/2);await p.locator('#stopBtn').waitFor({state:'visible'});const stopBox=await p.locator('#stopBtn').boundingBox();await p.waitForTimeout(100);
    const early={state:await p.evaluate(()=>Akari.app.editorState.state),run:await p.locator('#runBtn').isVisible(),stop:await p.locator('#stopBtn').isVisible()};
    await p.waitForTimeout(1000);const band=bare(await p.locator('#execLocation').innerText()),sentence=bare(await p.locator('#execSentence').innerText().catch(()=>'')),running={level:await p.locator('#uiLevel').isVisible(),toggle:await s.toggle(),run:await p.locator('#runBtn').isVisible()};
    await p.click('#stopBtn');await p.waitForFunction(()=>Akari.app.editorState.state==='DESIGN');const back=await p.locator('#runBtn').isVisible();
    return {expect:{editScreen:edit.run&&!edit.stop&&edit.level&&edit.toggle,doublePressIgnored:early.state==='RUNNING'&&!early.run&&early.stop&&Math.abs(stopBox.x-runBox.x)<2&&Math.abs(stopBox.y-runBox.y)<2,
      runScreen:!running.level&&!running.toggle&&!running.run&&band.startsWith('いま動いている文：')&&band.includes('たくどん')&&band.includes('「動かす」をおしたとき')&&/\d+行目/.test(band)&&sentence.length>0,stopped:back},info:{edit,early,band,sentence,running}};},
  'CC-296':async s=>{const p=s.page,motion=['MotionCommand:GOTO','MotionCommand:MOVE_BY','MotionCommand:MOVE'],extra=id=>p.locator('#blockEditor .blockui-node[data-block-id="'+id+'"]');
    const timedOps=async ids=>{const out={};for(const n of ids){const node=extra(n.id);await clickNode(node);out[n.s]=await node.locator(':scope > .blockui-node-content > .blockui-node-main > .blockui-extra [data-blockui-action="motion-timed"]').count();}return out;};
    await s.select('w-neko');await s.category('motion');const entry=await s.palette();for(const id of motion)await s.place(id);const entryTimed=await timedOps((await s.tree()).b.body);
    await p.selectOption('#uiLevel','basic');await p.waitForTimeout(250);await s.category('motion');const basicMotion=await s.palette();await s.category('basic');const basicCommon=await s.palette();
    const events=await p.evaluate(()=>[...document.querySelectorAll('#eventSelect option')].map(o=>o.value));await s.category('motion');await s.place('MotionCommand:GOTO_PART');
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
  // ── 名人 ──
  'MC-001':async s=>{const l=await s.level();return {expect:{three:l.options.join('|')==='かんたん|くわしく|名人',noEntry:!l.options.includes('はじめて')},info:l};},
  'MC-002':async s=>{await s.select('w-neko');await s.code();const anywhere=await s.page.evaluate(()=>[...document.querySelectorAll('button,a,summary,option')].some(b=>b.textContent.includes('名人モードで 書く')&&b.offsetParent!==null));
    return {expect:{nowhere:!anywhere}};},
  'MC-003':async s=>{const before=await s.level();await s.page.selectOption('#uiLevel','basic',{timeout:1000}).catch(()=>{});await s.page.waitForTimeout(200);const after=await s.level();
    const screen=await s.visible('#diagnoseBtn')&&await s.visible('#procBtn')&&await s.visible('#formatBtn');
    return {expect:{meijin:before.chosen==='meijin'&&after.chosen==='meijin'&&before.options.join('|')==='名人'&&after.options.join('|')==='名人',noOthers:!before.others.length&&!after.others.length,advancedScreen:after.shown==='advanced'&&screen,noToggle:!(await s.toggle())},info:{before,after}};},
  'MC-004':async s=>{await s.select('stage');await s.code();const kind=await s.startMeijin(false);return {expect:{confirm:kind==='confirm',notYet:(await s.scripts()).every(x=>x.mode!=='meijin')}};},
  'MC-005':async s=>{await s.select('stage');await s.code();await s.startMeijin(true);const scripts=await s.scripts(),meijin=scripts.filter(x=>x.mode==='meijin');
    const listed=await s.page.evaluate(()=>[...document.querySelectorAll('#objectSelect option')].some(o=>o.value==='meijin'&&o.textContent.includes('名人の本文')));
    return {expect:{empty:meijin.length===1&&meijin[0].source==='',ownerless:meijin.every(x=>x.targetId==='meijin'),listed,chosen:(await s.level()).chosen==='meijin'}};},
  'MC-006':async s=>{await s.select('stage');await s.code();await s.write('ねこは、いまのばしょから、右へ10歩動く。');await s.startMeijin(true);const before=await s.text();await s.page.locator('#editorModeblocks').click({force:true,timeout:1000}).catch(()=>{});await s.page.waitForTimeout(250);
    const blocks=await s.page.evaluate(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='ブロック'&&b.getClientRects().length));
    const after=await s.text();return {expect:{noToggle:!(await s.toggle())&&!blocks,stillCode:(await s.mode())==='code',sameText:after===before},info:{before,after}};},
  'MC-007':async s=>{await s.select('stage');await s.code();const kind=await s.startMeijin(false);const ordinary=(await s.scripts()).every(x=>x.mode!=='meijin'),level=await s.level();await s.blocks();
    return {expect:{ordinary:kind==='confirm'&&ordinary,levelKept:level.chosen==='basic'&&level.shown==='basic',blocks:(await s.mode())==='blocks'},info:level};},
  'MC-008':async s=>{await s.select('stage');await s.code();await s.write('ねこは、いまのばしょから、右へ10歩動く。');await s.startMeijin(true);await s.page.click('#undoBtn');await s.page.waitForTimeout(300);
    const undone=(await s.scripts()).every(x=>x.mode!=='meijin'),afterUndo=await s.level();await s.blocks();const blocksAfterUndo=(await s.mode())==='blocks';
    await s.code();await s.page.click('#redoBtn');await s.page.waitForTimeout(300);const redone=(await s.scripts()).some(x=>x.mode==='meijin'),afterRedo=await s.level();
    return {expect:{undone,levelBack:afterUndo.chosen==='basic'&&afterUndo.others.includes('advanced'),blocksAfterUndo,redone,levelMeijin:afterRedo.chosen==='meijin',noToggleAfterRedo:!(await s.toggle())&&(await s.mode())==='code'},info:{afterUndo,afterRedo}};},
  'MC-009':async s=>{const options=await s.page.evaluate(()=>[...document.querySelectorAll('#objectSelect option')].map(o=>[o.value,o.textContent.trim()]));
    const meijin=options.find(([v])=>v==='meijin');if(meijin)await s.select('meijin');
    return {expect:{listed:!!meijin&&meijin[1].includes('名人の本文'),opens:(await s.text()).trim()===MEIJIN_SOURCE},info:{options}};},
  'MC-010':async s=>{await s.select('meijin');await s.write('ねこが前へ10歩進む\n主役が「やあ」と言う');const before=await s.text();
    if(await s.page.locator('#formatBtn').isVisible()&&await s.page.locator('#formatBtn').isEnabled())await s.page.click('#formatBtn');await s.page.waitForTimeout(300);return {expect:{unchanged:(await s.text())===before}};},
  'MC-011':async s=>{await s.select('meijin');const revert=await s.page.evaluate(()=>[...document.querySelectorAll('button,summary,option,a')].some(b=>b.offsetParent!==null&&/通常の本文に|ふつうの本文に|名人モードを ?やめる/.test(b.textContent)));
    return {expect:{noRevert:!revert,noToggle:!(await s.toggle())&&(await s.mode())==='code'}};},
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
      meijinOnly:l.options.join('|')==='名人'&&!(await s.toggle())},info:{meijin,l}};},
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
  // A work with a 名人 text is code only: no コード／ブロック switch anywhere, not even pale (MC-411 retired).
  'MC-587':async s=>{const p=s.page,switches=()=>p.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>/^(コード|ブロック)$/.test(b.textContent.trim())&&b.getClientRects().length).map(b=>b.id||b.textContent.trim()));
    await s.select('meijin');const meijin={switches:await switches(),code:await s.visible('#codeEditor')};
    await s.select('w-neko');const neko={switches:await switches(),code:await s.visible('#codeEditor')};
    await p.click('#procBtn');await p.locator('#procModal').waitFor({state:'visible'});await p.click('#callableNewAction');await p.waitForTimeout(200);const callable={switches:await switches(),code:await s.visible('#callableCode')};await p.click('#procClose');
    await s.select('meijin');await s.run();await p.locator('#runtimeInspectBtn').waitFor({state:'visible'});await p.click('#runtimeInspectBtn');await p.waitForTimeout(300);
    const inspector={switches:await switches(),code:await p.evaluate(()=>!!document.querySelector('#runtimeInspector[open] #codeEditor')?.getClientRects().length)};
    return {expect:{noSwitch:[meijin,neko,callable,inspector].every(v=>!v.switches.length),code:meijin.code&&neko.code&&callable.code&&inspector.code},info:{meijin,neko,callable,inspector}};},
  // A mistake in the code: ブロック stays, pale; a press says how to come back, the view stays code, and a press elsewhere hides it.
  'MC-588':async s=>{await s.select('w-neko');await s.code();await s.write('「こんにちは」と言');await s.page.locator('#editorModeblocks').click({force:true});await s.page.waitForTimeout(200);
    const shown=()=>s.page.evaluate(()=>{const n=document.querySelector('#modeBlockedNote');return n?.getClientRects().length?n.textContent:'';}),note=await shown();
    await s.page.locator('#formSurface').click({position:{x:5,y:5}});await s.page.waitForTimeout(200);const later=await shown();
    return {expect:{pale:(await s.page.locator('#editorModeblocks').getAttribute('aria-disabled'))==='true'&&(await s.mode())==='code',says:bare(note).includes('コードの赤いところを直すと、ブロックにもどれるよ'),hides:!later},info:{note,later}};},
  'MC-659':async s=>touchMeijin(s,'だんごは画面の左下のはしから、右へ490歩、上へ370歩のばしょへ行く。',false),
  'MC-660':async s=>touchMeijin(s,'だんごは、たくどんのところへ行く。',true),
  'MC-701':async s=>{await s.select('w-neko');await s.code();await s.write('「星」にふれたとき、\n  「いたい」と言う。');await s.startMeijin(true);
    const scripts=await s.scripts(),meijin=scripts.filter(x=>x.mode==='meijin').map(x=>x.source);
    return {expect:{heading:meijin.some(t=>t.includes('ねこが「星」にふれたとき、ねこは、')),body:meijin.some(t=>t.includes('「いたい」と言う。')),moved:!scripts.some(x=>x.mode!=='meijin'&&x.targetId==='w-neko'&&x.source.includes('いたい'))},info:{meijin}};},
  'MC-707':async s=>{const opened={mode:await s.mode(),level:await s.level(),toggle:await s.toggle()};await s.select('meijin');const meijin={mode:await s.mode(),text:await s.text()};
    await s.select('w-neko');const neko={mode:await s.mode(),toggle:await s.toggle()};
    return {expect:{opensInCode:opened.mode==='code'&&opened.level.options.join('|')==='名人',noToggle:!opened.toggle,meijinText:meijin.mode==='code'&&meijin.text===MEIJIN_SOURCE,nekoCode:neko.mode==='code'&&!neko.toggle},info:{opened,meijin,neko}};},
};
// MC-659/660: 「新しく作る」, だんご from the presets, then a 名人 body whose touch event watches たくどん (both picture parts).
async function touchMeijin(s,second,expected){const p=s.page;await s.newWork();
  // A new work opens at ブロックの「はじめて」, which shows neither the part picker nor コード: かんたん is chosen first.
  await p.selectOption('#uiLevel','basic');await p.waitForTimeout(250);await (await reveal(p.locator(TOOLBOX_PRESET+'[data-sprite-preset="dango"]'))).click();await p.waitForTimeout(300);
  const takudon=await s.part('たくどん'),dango=await s.part('だんご');await s.code();await s.startMeijin(true);await s.write('');
  await s.write('だんごがたくどんにふれたとき、だんごは「ふれた」と言う。\nだんごは画面の左下のはしから、右へ520歩、上へ400歩のばしょへ行く。\n1秒待つ。\n'+second);
  // Every start of the touch body is counted where the product says it (EventScheduler.ui.say), not only what stays on the screen.
  await p.evaluate(()=>{globalThis.__said=[];const Q=Akari.EventScheduler.prototype,start=Q.start;Q.start=function(...a){const say=this.ui.say;this.ui.say=(id,value)=>{__said.push(value);return say?.(id,value);};return start.apply(this,a);};});
  await s.run();await p.waitForTimeout(3000);const said=await p.evaluate(()=>__said.filter(v=>v==='ふれた').length),dangoAt=await p.evaluate(id=>{const a=document.querySelector('.component[data-runtime-id="'+id+'"]');return a&&{left:a.style.left,top:a.style.top};},dango?.id);await s.stop();
  return {expect:expected?{touchedOnce:said===1}:{notTouched:said===0},info:{takudon,dango,said,dangoAt}};}
// A step chooses the level together with its view: 「ブロックで「はじめて」を選ぶ」, 「コードで「くわしく」を選ぶ」. 名人 is chosen
// by the case itself (it turns a body into 名人 text), from code at かんたん; without a step the work opens in blocks at かんたん.
const LEVELS={はじめて:'entry',かんたん:'basic',くわしく:'advanced',名人:'basic'};
const levelOf=c=>{const m=c.steps.join(' ').match(/(コード|ブロック)で「(はじめて|かんたん|くわしく|名人)」(を選|のまま)/);return m?{view:m[1]==='コード'?'code':'blocks',level:LEVELS[m[2]]}:{view:'blocks',level:'basic'};};
const usesMeijinWork=c=>/名人の本文に|「名人の本文」を選|名人モードの本文を開く|名人モードの本文に|名人の本文を一つ持つ作品/.test(c.steps.join(' '));
// Works a case names by its parts rather than by a 名人 body.
const FILE_FOR={'MC-235':'parts','MC-659':'parts','MC-660':'parts','MC-701':'star'};
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
