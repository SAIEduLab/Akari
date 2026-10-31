// Source boundaries: which src/js file may use the names another one declares. The product script is one closure
// (src/js/00 opens it, 12 closes it), so a file reaches another only through the closure's top-level names. Every
// reference is resolved with the pinned parser and its own scopes; the boundary declarations under audit/boundaries/
// must name exactly the files a file uses.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
let parser;
const parse=text=>(parser??=require('@babel/parser')).parse(text,{sourceType:'script',errorRecovery:false});
export const boundaryDirectory='audit/boundaries';
export const boundarySchema='akari-source-boundary-v1';
export const boundaryFileFor=file=>boundaryDirectory+'/'+path.posix.basename(file,'.js')+'.json';
// Functions the exported player embeds through toString(): they must use no closure name but each other.
export const embeddedFunctions=Object.freeze(['createAkariProfiles','createAkariExtensionHost','createAkariRuntime','createAkariStageView','mountAkariPlayer']);

const includeLine=/^<!-- @include (js\/[a-z0-9._-]+) -->$/;
const portableLine=/^\/\/ @portable (extensions\/[a-z0-9._-]+\.js)$/;
// The product script as src/build.mjs assembles it, with the source of every character.
export function productScript(read){
  const pieces=[];let text='';
  const add=(label,part)=>{pieces.push({label,start:text.length,end:text.length+part.length});text+=part;};
  for(const line of read('src/akari.html').split('\n')){
    const include=line.match(includeLine);if(!include)continue;
    const file='src/'+include[1];
    let chunk='';
    for(const row of read(file).replace(/\n$/,'').split('\n')){
      const portable=row.match(portableLine);
      if(!portable){chunk+=row+'\n';continue;}
      if(chunk){add(file,chunk);chunk='';}
      const body=read(portable[1]).replace(/\n$/,'');
      add(portable[1],body.slice(0,body.lastIndexOf('\n')+1));
    }
    if(chunk)add(file,chunk);
  }
  return {text,pieces};
}

const isFunction=node=>['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression','ObjectMethod','ClassMethod','ClassPrivateMethod'].includes(node?.type);
const skipKeys=new Set(['loc','start','end','extra','comments','leadingComments','trailingComments','innerComments','range']);
function patternNames(node,out=[]){
  if(!node)return out;
  if(node.type==='Identifier')out.push(node.name);
  else if(node.type==='ObjectPattern')for(const p of node.properties)patternNames(p.type==='RestElement'?p.argument:p.value,out);
  else if(node.type==='ArrayPattern')for(const e of node.elements)patternNames(e,out);
  else if(node.type==='RestElement')patternNames(node.argument,out);
  else if(node.type==='AssignmentPattern')patternNames(node.left,out);
  return out;
}
// Names a function scope hoists: var declarations and, in its own body block, nothing lexical (that is the block's).
function hoistedVars(body,out=new Set()){
  const visit=node=>{
    if(!node||typeof node!=='object')return;
    if(Array.isArray(node)){node.forEach(visit);return;}
    if(isFunction(node)||node.type==='ClassBody')return;
    if(node.type==='VariableDeclaration'&&node.kind==='var')for(const d of node.declarations)patternNames(d.id).forEach(n=>out.add(n));
    for(const [key,value]of Object.entries(node))if(!skipKeys.has(key)&&value&&typeof value==='object')visit(value);
  };
  visit(body);return out;
}
// Lexical names declared directly in a statement list (let, const, class, and function declarations in strict code).
function lexicalNames(statements,out=new Set()){
  for(const s of statements??[]){
    const d=s.type==='ExportNamedDeclaration'?s.declaration:s;
    if(d?.type==='VariableDeclaration'&&d.kind!=='var')for(const x of d.declarations)patternNames(x.id).forEach(n=>out.add(n));
    else if((d?.type==='FunctionDeclaration'||d?.type==='ClassDeclaration')&&d.id)out.add(d.id.name);
  }
  return out;
}

// Every reference to a closure top-level name: {at, name, from (top-level name whose declaration contains it)}.
export function closureReferences(script){
  const ast=parse(script.text);
  const call=ast.program.body.length===1&&ast.program.body[0].type==='ExpressionStatement'?ast.program.body[0].expression:null;
  assert.ok(call?.type==='CallExpression'&&call.callee.type==='ArrowFunctionExpression'&&call.callee.body.type==='BlockStatement','the product script is one closure');
  const closure=call.callee.body;
  const top=new Map();// name -> declaration node
  for(const s of closure.body){
    if(s.type==='VariableDeclaration')for(const d of s.declarations)for(const n of patternNames(d.id))top.set(n,{start:s.start,end:s.end});
    else if((s.type==='FunctionDeclaration'||s.type==='ClassDeclaration')&&s.id)top.set(s.id.name,{start:s.start,end:s.end});
  }
  for(const n of hoistedVars(closure.body))if(!top.has(n))throw Error('a var below the closure top level is not supported: '+n);
  const statementAt=at=>closure.body.find(s=>s.start<=at&&at<s.end);
  const ownerOf=new Map();for(const s of closure.body){const names=[...top].filter(([,d])=>d.start===s.start).map(([n])=>n);ownerOf.set(s,names);}
  const refs=[],free=[];
  const resolves=(scopes,name)=>{for(let i=scopes.length-1;i>=0;i--)if(scopes[i].has(name))return i;return -1;};
  const reference=(node,scopes)=>{
    const level=resolves(scopes,node.name),from=()=>ownerOf.get(statementAt(node.start))?.[0]??null;
    if(level===0&&top.has(node.name))refs.push({at:node.start,name:node.name,from:from()});
    else if(level<0)free.push({at:node.start,name:node.name,from:from()});
  };
  // Walk with a scope stack; scopes[0] is the closure's top level.
  const walk=(node,scopes,parent,key)=>{
    if(!node||typeof node!=='object')return;
    if(Array.isArray(node)){for(const n of node)walk(n,scopes,parent,key);return;}
    if(typeof node.type!=='string')return;
    if(node.type==='Identifier'){
      if(parent&&(
        (parent.type==='MemberExpression'||parent.type==='OptionalMemberExpression')&&key==='property'&&!parent.computed||
        (parent.type==='ObjectProperty'||parent.type==='ObjectMethod'||parent.type==='ClassMethod'||parent.type==='ClassProperty'||parent.type==='ClassPrivateMethod')&&key==='key'&&!parent.computed||
        ['LabeledStatement','BreakStatement','ContinueStatement'].includes(parent.type)&&key==='label'||
        parent.type==='MetaProperty'||parent.type==='PrivateName'
      ))return;
      reference(node,scopes);return;
    }
    if(isFunction(node)){
      // Parameters and their defaults see the parameter scope; only the body sees the body's declarations.
      const params=new Set(['arguments']);
      if(node.type==='FunctionExpression'&&node.id)params.add(node.id.name);
      for(const p of node.params)patternNames(p).forEach(n=>params.add(n));
      const head=[...scopes,params];
      const inner=[...head,node.body.type==='BlockStatement'?new Set([...hoistedVars(node.body),...lexicalNames(node.body.body)]):new Set()];
      if(node.computed&&node.key)walk(node.key,scopes,node,'key');
      for(const p of node.params)walkPattern(p,head);
      if(node.body.type==='BlockStatement')for(const s of node.body.body)walk(s,inner,node.body,'body');else walk(node.body,inner,node,'body');
      return;
    }
    if(node.type==='BlockStatement'){walkBlock(node.body,scopes,node);return;}
    // A static block is a function-like scope: its var declarations stay inside it.
    if(node.type==='StaticBlock'){const inner=[...scopes,new Set([...lexicalNames(node.body),...hoistedVars(node.body)])];for(const s of node.body)walk(s,inner,node,'body');return;}
    if(node.type==='SwitchStatement'){walk(node.discriminant,scopes,node,'discriminant');const inner=[...scopes,lexicalNames(node.cases.flatMap(c=>c.consequent))];for(const c of node.cases){walk(c.test,inner,c,'test');for(const s of c.consequent)walk(s,inner,c,'consequent');}return;}
    if(['ForStatement','ForInStatement','ForOfStatement'].includes(node.type)){
      const decl=node.type==='ForStatement'?node.init:node.left;
      const scope=new Set(decl?.type==='VariableDeclaration'&&decl.kind!=='var'?decl.declarations.flatMap(d=>patternNames(d.id)):[]);
      const inner=[...scopes,scope];
      for(const [k,v]of Object.entries(node))if(!skipKeys.has(k)&&k!=='type'&&v&&typeof v==='object')walk(v,inner,node,k);
      return;
    }
    if(node.type==='CatchClause'){const inner=[...scopes,new Set(patternNames(node.param))];if(node.param)walkPattern(node.param,inner);walk(node.body,inner,node,'body');return;}
    if(node.type==='ClassDeclaration'||node.type==='ClassExpression'){
      const inner=node.type==='ClassExpression'&&node.id?[...scopes,new Set([node.id.name])]:scopes;
      walk(node.superClass,inner,node,'superClass');walk(node.body,inner,node,'body');return;
    }
    if(node.type==='VariableDeclarator'){walkPattern(node.id,scopes);walk(node.init,scopes,node,'init');return;}
    if(node.type==='ObjectProperty'&&node.shorthand&&!node.computed){walk(node.value,scopes,node,'value');return;}
    for(const [k,v]of Object.entries(node))if(!skipKeys.has(k)&&k!=='type'&&v&&typeof v==='object')walk(v,scopes,node,k);
  };
  // Declared names in a pattern are not references; default values and computed keys are.
  const walkPattern=(node,scopes)=>{
    if(!node)return;
    if(node.type==='Identifier')return;
    if(node.type==='ObjectPattern')for(const p of node.properties){if(p.type==='RestElement')walkPattern(p.argument,scopes);else{if(p.computed)walk(p.key,scopes,p,'key');walkPattern(p.value,scopes);}}
    else if(node.type==='ArrayPattern')for(const e of node.elements)walkPattern(e,scopes);
    else if(node.type==='RestElement')walkPattern(node.argument,scopes);
    else if(node.type==='AssignmentPattern'){walkPattern(node.left,scopes);walk(node.right,scopes,node,'right');}
    else walk(node,scopes,null,null);
  };
  const walkBlock=(statements,scopes,block)=>{const inner=[...scopes,lexicalNames(statements)];for(const s of statements)walk(s,inner,block,'body');};
  // Declarations at the closure top level are not references; their initializers and bodies are walked.
  const topScopes=[new Set(top.keys())];
  for(const s of closure.body){
    if(s.type==='VariableDeclaration')for(const d of s.declarations){walkPattern(d.id,topScopes);walk(d.init,topScopes,d,'init');}
    else if(s.type==='FunctionDeclaration'){walk({...s,type:'FunctionExpression',id:null},topScopes,null,null);}
    else if(s.type==='ClassDeclaration'){walk(s.superClass,topScopes,s,'superClass');walk(s.body,topScopes,s,'body');}
    else walk(s,topScopes,closure,'body');
  }
  return {top,refs,free,ast};
}

function eachNode(node,visit){
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){for(const n of node)eachNode(n,visit);return;}
  if(typeof node.type==='string')visit(node);
  for(const [key,value]of Object.entries(node))if(!skipKeys.has(key)&&value&&typeof value==='object')eachNode(value,visit);
}
const globalObject=node=>node?.type==='Identifier'&&['globalThis','window','self'].includes(node.name);
const memberName=node=>!node.computed&&node.property?.type==='Identifier'?node.property.name:node.computed&&node.property?.type==='StringLiteral'?node.property.value:null;

// The file each top-level name belongs to, and the files each file uses with the names it uses from each.
export function sourceUses(read){
  const script=productScript(read);
  const labelAt=at=>script.pieces.find(p=>p.start<=at&&at<p.end)?.label;
  const {top,refs,free,ast}=closureReferences(script);
  const owner=new Map([...top].map(([name,d])=>[name,labelAt(d.start)]));
  const uses={};
  for(const r of refs){
    const from=labelAt(r.at),to=owner.get(r.name);
    if(!from||!to||from===to)continue;
    ((uses[from]??={})[to]??=new Set()).add(r.name);
  }
  const embedded={},globalsRead={};
  for(const name of embeddedFunctions){
    assert.ok(top.has(name),'embedded function '+name+' is declared at the closure top level');
    embedded[name]=[...new Set(refs.filter(r=>r.from===name&&r.name!==name&&!embeddedFunctions.includes(r.name)).map(r=>r.name))].sort();
  }
  // Names the product writes on the global object; an embedded function must not read them (the player has none).
  const productGlobals=new Set(),toStrings=new Set(),globalReads=[];
  eachNode(ast,node=>{
    if(node.type==='AssignmentExpression'&&node.left.type==='MemberExpression'&&globalObject(node.left.object)&&memberName(node.left))productGlobals.add(memberName(node.left));
    if(node.type==='CallExpression'&&node.arguments.length===0&&node.callee.type==='MemberExpression'&&memberName(node.callee)==='toString'&&node.callee.object.type==='Identifier'&&top.has(node.callee.object.name))toStrings.add(node.callee.object.name);
    if((node.type==='MemberExpression'||node.type==='OptionalMemberExpression')&&globalObject(node.object)&&memberName(node))globalReads.push({at:node.start,name:memberName(node)});
  });
  const inside=(name,at)=>{const d=top.get(name);return d.start<=at&&at<d.end;};
  for(const name of embeddedFunctions)globalsRead[name]=[...new Set([...free.filter(r=>r.from===name&&productGlobals.has(r.name)),...globalReads.filter(r=>inside(name,r.at)&&productGlobals.has(r.name))].map(r=>r.name))].sort();
  const files=[...new Set(script.pieces.map(p=>p.label))];
  return {files,owner,embeddedThroughToString:[...toStrings].sort(),globalsRead,productGlobals:[...productGlobals].sort(),uses:Object.fromEntries(Object.entries(uses).map(([f,t])=>[f,Object.fromEntries(Object.entries(t).map(([k,v])=>[k,[...v].sort()]))])),embedded,refs:refs.length};
}

// The source text of each embedded function, as the exported player receives it through toString().
export function embeddedSources(read){
  const script=productScript(read),{top}=closureReferences(script);
  return Object.fromEntries(embeddedFunctions.map(name=>{const d=top.get(name);return [name,script.text.slice(d.start,d.end)];}));
}

// Issues against the boundary declarations: an undeclared use, a declared use that nothing uses, a src/js file
// without a declaration or a declaration without a file, and an embedded function using a closure name.
export function boundaryIssues(analysis,declarations){
  const issues=[];
  const sources=analysis.files.filter(f=>f.startsWith('src/js/'));
  for(const file of sources)if(!declarations[file])issues.push(file+': no boundary declaration');
  for(const file of Object.keys(declarations))if(!sources.includes(file))issues.push(file+': declared but not a product source');
  for(const file of sources){
    const declared=new Set(declarations[file]?.uses??[]),used=Object.keys(analysis.uses[file]??{});
    for(const to of used)if(!declared.has(to))issues.push(file+' uses '+to+' without declaring it ('+analysis.uses[file][to].slice(0,5).join(', ')+')');
    for(const to of declared)if(!used.includes(to))issues.push(file+' declares '+to+' but uses none of its names');
  }
  for(const [name,list]of Object.entries(analysis.embedded))if(list.length)issues.push(name+' is embedded through toString() but uses closure names: '+list.join(', '));
  for(const [name,list]of Object.entries(analysis.globalsRead))if(list.length)issues.push(name+' is embedded through toString() but reads what the product puts on the global object: '+list.join(', '));
  if(JSON.stringify(analysis.embeddedThroughToString)!==JSON.stringify([...embeddedFunctions].sort()))issues.push('the product embeds '+analysis.embeddedThroughToString.join(', ')+' through toString(); the embedded function list names '+[...embeddedFunctions].sort().join(', '));
  return issues;
}

export function readBoundaries(root,read=file=>fs.readFileSync(path.join(root,file),'utf8')){
  const declarations={};
  for(const name of fs.readdirSync(path.join(root,boundaryDirectory)).filter(name=>name.endsWith('.json')).sort()){
    const record=JSON.parse(read(boundaryDirectory+'/'+name));
    assert.equal(record.schema,boundarySchema,name+' schema');
    assert.equal(boundaryFileFor(record.file),boundaryDirectory+'/'+name,name+' names its source file');
    assert.ok(Array.isArray(record.uses)&&record.uses.every(u=>typeof u==='string')&&JSON.stringify(record.uses)===JSON.stringify([...new Set(record.uses)].sort()),name+' lists sorted unique uses');
    declarations[record.file]=record;
  }
  return declarations;
}
