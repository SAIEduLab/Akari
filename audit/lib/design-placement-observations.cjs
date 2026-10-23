const assert=require('node:assert/strict');
// Preserved 1.5.0 placement fixture: empty project + 60 actual star-tool presses.
// Pin the built baseline's complete coordinates, including the approved 16-step fallback.
const expected=[[115,285],[205,355],[285,355],[365,355],[445,355],[525,355],[465,275],[545,275],[45,195],[125,195],[465,195],[545,195],[45,115],[125,115],[465,115],[545,115],[205,55],[285,55],[365,55],[131,269],[147,253],[163,237],[179,221],[195,205],[211,189],[227,173],[243,157],[259,141],[275,125],[291,109],[307,93],[323,77],[339,61],[355,45],[371,29],[387,13],[403,-3],[419,-19],[435,-35],[451,-51],[467,-67],[483,-83],[499,-99],[515,-115],[531,-131],[547,-147],[563,-163],[579,-179],[595,-195],[611,-211],[627,-227],[643,-243],[659,-259],[675,-275],[691,-291],[707,-307],[723,-323],[739,-339],[755,-355],[771,-371]];
module.exports=async function observeDesignPlacement(page){
 const saved=await page.evaluate(()=>({name:Akari.app.project.name,text:Akari.serializeProject(Akari.app.project,Akari.app.assetStore)}));
 const open=async(name,buffer)=>{await page.locator('#fileInput').setInputFiles({name:name+'.akari.md',mimeType:'text/plain',buffer:Buffer.from(buffer)});await page.waitForFunction(name=>Akari.app.project.name===name||document.querySelector('#loseConfirmModal.show'),name);if(await page.locator('#loseConfirmModal.show').count())await page.locator('#loseConfirmProceed').evaluate(button=>button.click());await page.waitForFunction(name=>Akari.app.project.name===name,name);};
 const empty=await page.evaluate(()=>{const q=Akari.makeEmptyProject();q.name='placement-contract';return Akari.serializeProject(q,Akari.makeDefaultAssetStore());});
 const rows=[];
 try{
  await open('placement-contract',empty);
  for(let i=0;i<60;i++){
   await page.locator('.tool[data-sprite-preset="star"]').click();
   const row=await page.evaluate(()=>{const c=Akari.app.project.components.at(-1);return {id:c.id,name:c.name,x:c.x,y:c.y,w:c.w,h:c.h,status:document.querySelector('#statusText').textContent};});
   assert.deepEqual([row.x,row.y],expected[i],'preserved position of star '+(i+1));
   const outside=row.x+row.w/2<=0||row.x-row.w/2>=640||row.y+row.h/2<=0||row.y-row.h/2>=400;
   if(outside){assert.ok(row.status.includes('「'+row.name+'」は 画面の 外に あるよ'));assert.ok(row.status.includes('せってい')&&row.status.includes('よこのばしょ')&&row.status.includes('たてのばしょ'));}
   rows.push({...row,outside});
  }
  assert.equal(rows[38].y+rows[38].h/2,0,'star 39 touches the bottom boundary with no visible area');assert.equal(rows[38].outside,true);
  const last=rows.at(-1);assert.equal(last.outside,true);
  for(const [label,value]of [['よこのばしょ',320],['たてのばしょ',200]]){const field=page.locator('#properties input[aria-label="'+label+'"]');await field.fill(String(value));await field.press('Tab');}
  const recovered=await page.evaluate(id=>{const c=Akari.app.project.components.find(c=>c.id===id),n=document.querySelector('.component[data-runtime-id="'+CSS.escape(id)+'"]'),r=n.getBoundingClientRect(),f=document.querySelector('#formSurface').getBoundingClientRect();return{x:c.x,y:c.y,rect:r.toJSON(),stage:f.toJSON()};},last.id);
  assert.deepEqual([recovered.x,recovered.y],[320,200]);assert.ok(recovered.rect.width>0&&recovered.rect.height>0&&recovered.rect.left<recovered.stage.right&&recovered.rect.right>recovered.stage.left&&recovered.rect.top<recovered.stage.bottom&&recovered.rect.bottom>recovered.stage.top,'settings recover an offscreen part into the stage');
  return {positions:rows.map(r=>[r.x,r.y]),firstOutside:rows.findIndex(r=>r.outside)+1,boundaryWarning:true,recovery:{x:recovered.x,y:recovered.y}};
 }finally{await open(saved.name,saved.text);}
};
