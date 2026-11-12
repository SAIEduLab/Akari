// The work that 名人 examples are read in: the parts and data their sentences name.
// Used by the specification and manual example audits; the 名人 text is checked as a whole 名人 script.
export function meijinExampleErrors(api,source,{lists=[]}={}){
  const p=api.makeEmptyProject(),base=p.components.find(c=>c.type==='sprite');
  p.components=[...p.components.filter(c=>c.type!=='sprite'),...[['m-cat','ねこ'],['m-dog','犬'],['m-bird','鳥'],['m-star','星'],['m-goal','ゴール'],['m-dango','だんご']]
    .map(([id,name],i)=>({...structuredClone(base),id,name,x:60*i,y:0,costumes:[{id:id+'-face',name:'顔',kind:'text',value:'●'},{id:id+'-smile',name:'えがお',kind:'text',value:'☺'}],costumeId:id+'-face',localData:{variables:[{id:id+'-hp',name:'体力',initialValue:10}],lists:[]}}))];
  p.projectData.variables.push(...['主役','点数','合計'].map((name,i)=>({id:'m-v'+i,name,initialValue:0})));
  p.projectData.lists.push({id:'m-team',name:'なかま',initialValue:[]},{id:'m-items',name:'持ち物',initialValue:['本','ぼうし']});
  p.projectData.lists.push(...lists.map((name,i)=>({id:'m-example-list-'+i,name,initialValue:[]})));
  p.sounds=[{id:'m-sound-bell',name:'ベル',assetId:'m-asset-bell'}];
  p.scripts=[{id:'m-script',mode:'meijin',source:''}].map(s=>({...s,targetId:'meijin',event:'start'}));
  api.updateScriptSource(p.scripts[0],source,p);
  return JSON.parse(JSON.stringify(api.compileProject(p).errors.map(e=>e.code+'@'+e.line+' '+e.message)));
}
