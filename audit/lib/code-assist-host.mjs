import fs from 'node:fs';
import {createRequire} from 'node:module';
import {currentProductFile} from './product-path.cjs';
const require=createRequire(import.meta.url);
const {loadApi}=require('../browser/cases/audit-lib.cjs');
export const loadAssistApi=(product=currentProductFile())=>loadApi(fs.readFileSync(product,'utf8'));
const clone=value=>JSON.parse(JSON.stringify(value));
const named=value=>Array.isArray(value)?value.map(v=>typeof v==='string'?{name:v}:v):Object.entries(value||{}).map(([name,initialValue])=>({name,initialValue}));

// Fixtures describe names and types; every test still uses a valid product project.
export function assistWorld(api,world){
  const project=api.makeDefaultProject(),template=clone(project.components[0]);
  const parts=named(world.parts),ui=named(world.uiParts).map(p=>{
    const m=/^(.*?)（(文字|ボタン|入力らん)）$/.exec(p.name);
    if(!m)throw new Error('Invalid uiParts entry: '+p.name);
    return {name:m[1],type:({'文字':'label','ボタン':'button','入力らん':'input'})[m[2]]};
  });
  project.components=[...parts,...ui].map((p,i)=>{
    const type=p.type||world.partTypes?.[p.name]||'sprite',id=type==='sprite'?'sprite-'+(i+1):type+'-'+([...parts,...ui].slice(0,i).filter(n=>(n.type||world.partTypes?.[n.name]||'sprite')===type).length+1);
    const c={...clone(template),id,type,name:p.name,localData:{variables:[],lists:[]}};
    if(type==='sprite'){c.costumes=c.costumes.map((costume,j)=>({...costume,id:id+'-costume-'+j}));c.costumeId=c.costumes[0].id;}
    else{delete c.costumes;delete c.costumeId;}
    return c;
  });
  project.projectData={variables:named(world.variables).map((v,i)=>({id:'variable-'+i,name:v.name,initialValue:v.initialValue??0})),lists:named(world.lists).map((v,i)=>({id:'list-'+i,name:v.name,initialValue:v.initialValue??[]}))};
  project.sounds=named(world.sounds).map((v,i)=>({id:'sound-'+i,name:v.name,assetId:'sound-asset-'+i}));
  project.actions=named(world.actions).map((v,i)=>({id:'action-'+i,ownerId:'stage',name:v.name,args:(v.args||[]).map(a=>typeof a==='string'?a:a.name),source:'何もしない。'}));
  project.functions=named(world.functions).map((v,i)=>({id:'function-'+i,ownerId:'stage',name:v.name,args:(v.args||[]).map(a=>typeof a==='string'?a:a.name),source:'0を答えとして返す。'}));
  project.scripts=[{id:'s1',targetId:project.components[0]?.id||'stage',event:'start',source:'何もしない。'}];
  for(const name of world.signals?.sent||[])project.scripts.push({id:'send-'+project.scripts.length,targetId:project.components[0]?.id||'stage',event:'start',source:'「'+name+'」の合図を送る。'});
  for(const name of world.signals?.received||[])project.scripts.push({id:'receive-'+project.scripts.length,targetId:project.components[0]?.id||'stage',event:'message',filter:{message:name},source:'何もしない。'});
  if(world.backdrops){project.stage.backdrops=named(world.backdrops).map((v,i)=>({id:'backdrop-'+i,name:v.name,kind:'color',value:'#ffffff'}));project.stage.backdropId=project.stage.backdrops[0].id;}
  if(world.scripts)project.scripts.push(...clone(world.scripts));
  api.validateDesignProject(project);return project;
}

export function assistContexts(api,project,context={}){
  const symbols=api.buildSymbols(project),level=context.level||'advanced';
  let verify,ownerKey;
  if(context.definitionKind){
    const definitions=context.definitionKind==='function'?project.functions:project.actions;
    const definition=definitions.find(d=>d.name===context.definition)||definitions[0]||{id:'definition',ownerId:'stage',name:'ためし',args:[],source:''};
    verify={symbols,event:null,targetId:null,targetType:null,definitionKind:context.definitionKind,args:definition.args,definition,draft:true,level};
    ownerKey=(context.definitionKind==='function'?'function:':'action:')+definition.id;
  }else{
    const targetId=context.targetId||'sprite-1',target=project.components.find(c=>c.id===targetId);
    if(targetId!=='stage'&&!target)throw new Error('Unknown fixture target '+targetId);
    verify={symbols,targetId,targetType:target?.type||'stage',event:context.event||'start',args:[],level};ownerKey='script:s1';
  }
  return {verify,trigger:{...verify,key:ownerKey,ownerKey,id:'s1',scriptId:'s1'}};
}

export function canonicalAssist(api,text,context,previous=''){
  const want=String(text).trimEnd(),variants=[want,want.replace(/、?$/,'、')+'\n  何もしない。',want+'\n  何もしない。'];
  for(const prefix of ['',...(previous?[previous+'\n']:[])])for(const [i,source]of variants.entries()){
    try{const parsed=api.parseSyntax(prefix+source,context);if(!parsed.ast)continue;let got=api.formatScript(parsed.ast).trimEnd();
      if(prefix)got=got.split('\n').slice(prefix.trimEnd().split('\n').length).join('\n');
      if(i)got=got.split('\n').filter(line=>line.trim()!=='何もしない。').join('\n');
      if(got===want)return {ast:parsed.ast,canonical:got};
    }catch{}
  }return null;
}

export function assistObservation(api,project,test){
  const {trigger,verify}=assistContexts(api,project,test.context),source=test.input.source,before=JSON.stringify(project),application=api.app;
  let parsed,exception;try{parsed=api.parseSyntax(source,trigger);}catch(error){exception=String(error);}
  const diagnostic=parsed?.syntaxDiagnostics?.[0];
  const candidates=exception?[]:api.assistCandidates(project,source,verify,diagnostic);
  return {code:diagnostic?.code||null,exception,candidates:clone(candidates),seeds:clone(api.assistSeeds(source,verify.symbols,verify)),sourceUnchanged:source===test.input.source,projectUnchanged:JSON.stringify(project)===before,historyUnchanged:application===null&&api.app===null};
}
