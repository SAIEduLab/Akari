import fs from 'node:fs';
import cp from 'node:child_process';
import crypto from 'node:crypto';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export function childUxProvenance(){
  const testedCommit=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const fontFiles=process.platform==='win32'
    ? ['C:/Windows/Fonts/meiryo.ttc','C:/Windows/Fonts/meiryob.ttc']
    : ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'];
  return {repository:'SAIEduLab/Akari',testedCommit,candidateCommit:process.env.AKARI_REQUESTED_SHA||testedCommit,
    run:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'1',platform:process.platform,
    workingTreeDirty:!!cp.execFileSync('git',['status','--porcelain','--untracked-files=normal'],{encoding:'utf8'}).trim(),
    node:process.version,fontFiles:fontFiles.map(path=>({path,present:fs.existsSync(path),sha256:fs.existsSync(path)?sha(fs.readFileSync(path)):null})),
    inputKind:'browser automation; composition events are synthetic; real OS IME is UNVERIFIED'};
}
async function captureBlockDocuments(p,project){
  const original=await p.evaluate(()=>({owner:document.querySelector('#objectSelect').value,event:document.querySelector('#eventSelect').value})),views=[];
  for(const script of project.scripts.filter(s=>s.source.trim())){
    await p.locator('#objectSelect').selectOption(script.targetId);await p.locator('#eventSelect').selectOption(script.event);
    if(await p.locator('#sourceOverview').isVisible())await p.locator('#sourceEditBtn').click();
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    views.push(await p.evaluate(scriptId=>{
      const all=[...document.querySelectorAll('#blockEditor .blockui-world .blockui-node')];
      const nodes=all.map(n=>{
        const own=selector=>[...n.querySelectorAll(selector)].filter(f=>f.closest('.blockui-node')===n),parent=n.parentElement.closest('.blockui-node');
        const input=n.parentElement.closest('.blockui-input-slot'),body=n.parentElement.closest('[data-blockui-body-wrapper]');
        const slot=input&&input.closest('.blockui-node')===parent?(input.dataset.blockuiInput||input.getAttribute('aria-label')==='変更先'&&'target'):(body?.dataset.blockuiBodyWrapper||null);
        const title=n.querySelector(':scope > .blockui-node-head > .blockui-node-title'),r=n.getBoundingClientRect(),style=getComputedStyle(n);
        return {schema:n.dataset.schemaId,parent:parent?all.indexOf(parent):null,slot:slot||null,title:title?.textContent||'',rendered:!!r.width&&!!r.height&&style.visibility!=='hidden',
          fields:Object.fromEntries(own('input[data-blockui-field],select[data-blockui-field],input[data-blockui-structured-role],select[data-blockui-structured-role]').map(f=>[f.dataset.blockuiField||f.dataset.blockuiStructuredRole,f.type==='checkbox'?String(f.checked):f.value])),
          operator:own('.blockui-operator')[0]?.value||null};
      });
      return {scriptId,selectedOwner:document.querySelector('#objectSelect').value,selectedEvent:document.querySelector('#eventSelect').value,nodes};
    },script.id));
  }
  await p.locator('#objectSelect').selectOption(original.owner);await p.locator('#eventSelect').selectOption(original.event);
  if(await p.locator('#sourceOverview').isVisible())await p.locator('#sourceEditBtn').click();
  return views;
}
export async function captureModeRoundtrip(p,mode,runs,meaning){
  const observe=async()=>{
    const state=await p.evaluate(()=>{
      const a=Akari.app,s=a.editorState.main,visible=e=>!!e?.getClientRects().length;
      return {mode:s.mode,domMode:document.body.dataset.editorMode,owner:s.ownerKey,source:s.sourceText,
        project:JSON.parse(JSON.stringify(a.project)),history:a.editorState.history,redo:a.editorState.redo,dirty:a.editorState.dirty,
        codeVisible:visible(document.querySelector('#codeEditor')),blockVisible:visible(document.querySelector('#blockEditor')),
        codeText:document.querySelector('#codeEditor').value,font:getComputedStyle(document.querySelector('#codeEditor')).fontFamily};
    });
    const project=state.project;delete state.project;state.projectSha256=sha(Buffer.from(JSON.stringify(project)));
    const blockDocuments=state.mode==='blocks'?await captureBlockDocuments(p,project):null;
    const after=await p.evaluate(()=>({owner:Akari.app.editorState.main.ownerKey,source:Akari.app.editorState.main.sourceText,history:Akari.app.editorState.history,redo:Akari.app.editorState.redo,dirty:Akari.app.editorState.dirty,project:JSON.parse(JSON.stringify(Akari.app.project))}));
    const afterProject=after.project;delete after.project;after.projectSha256=sha(Buffer.from(JSON.stringify(afterProject)));
    return {state,afterBlockNavigation:after,blockDocuments,meaning:await meaning(p,project,runs)};
  };
  const route=[mode,mode==='code'?'blocks':'code',mode],observations=[await observe()];
  for(const next of route.slice(1)){
    await p.locator('#editorMode'+next).click();
    await p.waitForFunction(m=>Akari.app.editorState.main.mode===m&&document.body.dataset.editorMode===m,next);
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    observations.push(await observe());
  }
  return {route,observations};
}
export async function collectLanguageFrame(p,name,artifact){
  const frame=await p.evaluate(()=>{
    const v={width:innerWidth,height:innerHeight},rows=[];
    for(const e of document.querySelectorAll('button,input,select,summary,label,p,h1,h2,h3,[role="alert"],.hint')){
      const r=e.getBoundingClientRect(),style=getComputedStyle(e),x=r.left+r.width/2,y=r.top+r.height/2;
      if(!r.width||!r.height||style.visibility==='hidden'||style.display==='none'||x<0||y<0||x>=v.width||y>=v.height)continue;
      const hit=document.elementFromPoint(x,y);if(!hit||!(e===hit||e.contains(hit)))continue;
      const text=(e.innerText||e.getAttribute('aria-label')||e.getAttribute('placeholder')||'').trim();if(!text)continue;
      rows.push({tag:e.tagName,id:e.id,text,rect:{x:r.left,y:r.top,width:r.width,height:r.height},hit:true,
        readings:[...e.querySelectorAll('ruby')].map(n=>({text:n.textContent,reading:n.querySelector('rt')?.textContent||null}))});
    }
    const canvas=document.createElement('canvas'),c=canvas.getContext('2d');c.font=getComputedStyle(document.body).font;
    const m=c.measureText('あかり漢字あ');
    return {viewport:v,dpr:devicePixelRatio,font:{declared:getComputedStyle(document.body).fontFamily,sample:'あかり漢字あ',width:m.width,ascent:m.actualBoundingBoxAscent,descent:m.actualBoundingBoxDescent},rows};
  });
  return {name,artifact,...frame};
}
