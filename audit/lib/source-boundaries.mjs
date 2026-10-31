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

// Groups for the one-way rule (AUDIT.md「ソースの境界」). The language processing (src/js/02-09: contracts, assets,
// syntax, presentation, formatting, analysis, stage and export, editor sessions) is one module whose parts use each other
// (parsing, formatting and analysis call one another to read and to explain); every other src/js file is a group of its
// own. A portable extension belongs to the file that embeds it. Files split off by the rule keep their prefix, so they
// stay in their group.
export const languageGroup=/^src\/js\/0[2-9]-/;
export function sourceGroup(file,files){
  if(languageGroup.test(file))return 'the language processing (src/js/02-09)';
  if(file.startsWith('extensions/')){const host=files.slice(0,files.indexOf(file)).filter(f=>f.startsWith('src/js/')).at(-1);return host?sourceGroup(host,files):file;}
  return file;
}
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
  // Top-level functions: declarations and const/let bound to a function or class expression.
  const functions=new Set(closure.body.flatMap(s=>s.type==='FunctionDeclaration'&&s.id?[s.id.name]:s.type==='VariableDeclaration'?s.declarations.filter(d=>d.id.type==='Identifier'&&['FunctionExpression','ArrowFunctionExpression','ClassExpression'].includes(d.init?.type)).map(d=>d.id.name):[]));
  return {top,refs,free,ast,functions};
}

function eachNode(node,visit){
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){for(const n of node)eachNode(n,visit);return;}
  if(typeof node.type==='string')visit(node);
  for(const [key,value]of Object.entries(node))if(!skipKeys.has(key)&&value&&typeof value==='object')eachNode(value,visit);
}
const globalNames=['globalThis','window','self'];
const memberName=node=>!node.computed&&node.property?.type==='Identifier'?node.property.name:node.computed&&node.property?.type==='StringLiteral'?node.property.value:null;

// The file each top-level name belongs to, and the files each file uses with the names it uses from each.
export function sourceUses(read){
  const script=productScript(read);
  const labelAt=at=>script.pieces.find(p=>p.start<=at&&at<p.end)?.label;
  const {top,refs,free,ast,functions}=closureReferences(script);
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
  // The global object is a free globalThis, window or self (a local binding of that name is not it).
  const freeAt=new Set(free.map(r=>r.at));
  const globalObject=node=>node?.type==='Identifier'&&globalNames.includes(node.name)&&freeAt.has(node.start);
  const keyName=p=>!p.computed&&p.key?.type==='Identifier'?p.key.name:p.key?.type==='StringLiteral'?p.key.value:null;
  // A top-level function turned into text: X.toString(), Function.prototype.toString.call(X), String(X), `${X}`, X + ''.
  // Only an identifier that resolves to the top-level function (not a local of the same name) counts.
  const refAt=new Set(refs.map(r=>r.at));
  const fn=node=>node?.type==='Identifier'&&functions.has(node.name)&&refAt.has(node.start)?node.name:null;
  eachNode(ast,node=>{
    if(node.type==='AssignmentExpression'&&node.left.type==='MemberExpression'&&globalObject(node.left.object)&&memberName(node.left))productGlobals.add(memberName(node.left));
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&memberName(node.callee)==='defineProperty'&&node.callee.object.type==='Identifier'&&node.callee.object.name==='Object'&&globalObject(node.arguments[0])&&node.arguments[1]?.type==='StringLiteral')productGlobals.add(node.arguments[1].value);
    if(node.type==='CallExpression'&&node.arguments.length===0&&node.callee.type==='MemberExpression'&&memberName(node.callee)==='toString'&&fn(node.callee.object))toStrings.add(fn(node.callee.object));
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&['call','apply','bind'].includes(memberName(node.callee))&&node.callee.object.type==='MemberExpression'&&memberName(node.callee.object)==='toString'&&fn(node.arguments[0]))toStrings.add(fn(node.arguments[0]));
    if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name==='String'&&freeAt.has(node.callee.start)&&fn(node.arguments[0]))toStrings.add(fn(node.arguments[0]));
    if(node.type==='TemplateLiteral')for(const e of node.expressions)if(fn(e))toStrings.add(fn(e));
    if(node.type==='BinaryExpression'&&node.operator==='+')for(const side of [node.left,node.right])if(fn(side))toStrings.add(fn(side));
    if((node.type==='MemberExpression'||node.type==='OptionalMemberExpression')&&globalObject(node.object)&&memberName(node))globalReads.push({at:node.start,name:memberName(node)});
    // Destructuring the global object reads each key: ({Akari} = globalThis), const {Akari} = window.
    const target=node.type==='VariableDeclarator'?[node.id,node.init]:node.type==='AssignmentExpression'?[node.left,node.right]:null;
    if(target&&target[0]?.type==='ObjectPattern'&&globalObject(target[1]))for(const p of target[0].properties)if(p.type==='ObjectProperty'&&keyName(p))globalReads.push({at:p.start,name:keyName(p)});
  });
  // What the reading above cannot follow, refused: the global object as a value (an alias, an argument to Object.assign
  // or Reflect, a computed key) other than reading or writing a named property, typeof, or the target of the event helper
  // on(target, …); Reflect other than its reading methods; and an on helper that does more with its target than add and
  // remove event listeners.
  const opaque=[],readingReflect=['ownKeys','has','getPrototypeOf','getOwnPropertyDescriptor'],globalAliases=['window','self','globalThis','frames','parent','top'];
  eachNodeWithAncestors(ast,(node,ancestors)=>{
    const parent=ancestors.at(-1),member=(parent?.type==='MemberExpression'||parent?.type==='OptionalMemberExpression')&&parent.object===node;
    // window.window and the like are the global object again, so they count as using it as a value.
    if(globalObject(node)&&member&&globalAliases.includes(memberName(parent)))opaque.push(labelAt(node.start)+': the global object used as a value ('+node.name+'.'+memberName(parent)+')');
    else if(globalObject(node)&&!(member&&memberName(parent)||parent?.type==='UnaryExpression'&&parent.operator==='typeof'||parent?.type==='BinaryExpression'&&['===','!==','==','!='].includes(parent.operator)
      ||parent?.type==='CallExpression'&&parent.arguments[0]===node&&parent.callee.type==='Identifier'&&parent.callee.name==='on'&&onHelperBinding(parent.callee,ancestors)))
      opaque.push(labelAt(node.start)+': the global object used as a value ('+node.name+')');
    if(node.type==='Identifier'&&node.name==='Reflect'&&freeAt.has(node.start)&&!(member&&!parent.computed&&readingReflect.includes(parent.property.name)))opaque.push(labelAt(node.start)+': Reflect used other than to read ('+readingReflect.join(', ')+')');
    const helper=node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&node.id.name==='on'&&/Function|Arrow/.test(node.init?.type||'')?node.init:node.type==='FunctionDeclaration'&&node.id?.name==='on'?node:null;
    if(helper){const target=helper.params[0]?.type==='Identifier'?helper.params[0].name:null;let bad=!target;
      eachNodeWithParents(helper.body,(n,p)=>{if(n.type==='Identifier'&&n.name===target&&!((p?.type==='MemberExpression'||p?.type==='OptionalMemberExpression')&&p.object===n&&!p.computed&&['addEventListener','removeEventListener'].includes(p.property.name)))bad=true;});
      if(bad)opaque.push(labelAt(node.start)+': an on helper that does more with its target than add and remove event listeners');}
  });
  const inside=(name,at)=>{const d=top.get(name);return d.start<=at&&at<d.end;};
  for(const name of embeddedFunctions)globalsRead[name]=[...new Set([...free.filter(r=>r.from===name&&productGlobals.has(r.name)),...globalReads.filter(r=>inside(name,r.at)&&productGlobals.has(r.name))].map(r=>r.name))].sort();
  const files=[...new Set(script.pieces.map(p=>p.label))];
  const interfaces=applicationInterfaces(ast,labelAt);
  return {files,owner,interfaces,opaque,embeddedThroughToString:[...toStrings].sort(),globalsRead,productGlobals:[...productGlobals].sort(),uses:Object.fromEntries(Object.entries(uses).map(([f,t])=>[f,Object.fromEntries(Object.entries(t).map(([k,v])=>[k,[...v].sort()]))])),embedded,refs:refs.length};
}

// The application's files (src/js/11-*) share state through appVars, offer functions to the files after them through
// appCalls, and take redraw requests from the files before them through appRedraw. Per file: the appCalls names it
// registers (Object.assign(appCalls, {name, …}), each a function the factory itself declares, under its own name), the
// appRedraw slots it fills (Object.assign(appRedraw, {slot: renderSlot, …})), the appCalls names, appVars names and
// appRedraw slots it uses, the appVars names it assigns, its calls of a function kept in appVars (and whether the result
// is used), the factories it declares and calls, and every other use of the three objects, which would hide what is used.
export const applicationObjects=Object.freeze(['appVars','appCalls','appRedraw']);
const factoryName=/^createApp[A-Z]\w*$/;
// A redraw slot is the name of a drawing function without its verb: renderProperties fills appRedraw.properties.
export const redrawSlot=name=>{const m=/^(?:render|refresh|repaint|paint)([A-Z]\w*)$/.exec(name);return m?m[1][0].toLowerCase()+m[1].slice(1):null;};
const functionStatement=s=>s.type==='FunctionDeclaration'||s.type==='VariableDeclaration'&&s.kind==='const'&&s.declarations.every(d=>d.id.type==='Identifier'&&['FunctionExpression','ArrowFunctionExpression'].includes(d.init?.type));
const declaredNames=s=>s.type==='FunctionDeclaration'?[s.id.name]:s.declarations.map(d=>d.id.name);
const objectAssign=(node,target)=>node?.type==='CallExpression'&&node.callee.type==='MemberExpression'&&!node.callee.computed&&node.callee.object.type==='Identifier'&&node.callee.object.name==='Object'&&node.callee.property.name==='assign'&&node.arguments.length===2&&node.arguments[0].type==='Identifier'&&node.arguments[0].name===target&&node.arguments[1].type==='ObjectExpression';
// Walk with every ancestor (nearest last).
function eachNodeWithAncestors(node,visit,ancestors=[]){
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){for(const n of node)eachNodeWithAncestors(n,visit,ancestors);return;}
  const typed=typeof node.type==='string';if(typed)visit(node,ancestors);
  const next=typed?[...ancestors,node]:ancestors;
  for(const [key,value]of Object.entries(node))if(!skipKeys.has(key)&&value&&typeof value==='object')eachNodeWithAncestors(value,visit,next);
}
// Whether the name `on` at this call resolves to an event helper: the nearest binding of `on` (a parameter, or a
// declaration directly in an enclosing block, function body or the closure) is `const on = (target, …) => {…}` or
// `function on(target, …) {…}`. A parameter or a destructured `on` is not a helper.
const bindsName=(pattern,name)=>!!pattern&&(pattern.type==='Identifier'?pattern.name===name:pattern.type==='ObjectPattern'?pattern.properties.some(p=>bindsName(p.type==='RestElement'?p.argument:p.value,name)):pattern.type==='ArrayPattern'?pattern.elements.some(e=>bindsName(e,name)):pattern.type==='AssignmentPattern'?bindsName(pattern.left,name):pattern.type==='RestElement'?bindsName(pattern.argument,name):false);
function onHelperBinding(callee,ancestors){return localFunctionBinding('on',ancestors)==='helper';}
// The nearest binding of a name seen from a node (its ancestors, nearest last): 'helper' when it is a function declared
// as `function name(…)` or `const name = (…) => …`, 'other' for any other binding (a parameter of a function or method,
// a catch parameter, a for declaration, a var anywhere in the function, a destructured or non-function const, a class, a
// named function expression), or null when nothing in the closure binds it.
function localFunctionBinding(name,ancestors){
  for(let i=ancestors.length-1;i>=0;i--){
    const a=ancestors[i];
    if(a.params?.some(p=>bindsName(p,name)))return 'other';
    if(a.type==='FunctionExpression'&&a.id?.name===name)return 'other';
    if(a.type==='CatchClause'&&bindsName(a.param,name))return 'other';
    if(['ForStatement','ForInStatement','ForOfStatement'].includes(a.type)){const d=a.type==='ForStatement'?a.init:a.left;if(d?.type==='VariableDeclaration'&&d.declarations.some(x=>bindsName(x.id,name)))return 'other';}
    if(isFunction(a)&&a.body?.type==='BlockStatement'&&hoistedVars(a.body.body).has(name))return 'other';
    const statements=a.type==='BlockStatement'||a.type==='Program'?a.body:null;
    if(!statements)continue;
    for(const s of statements){
      if(s.type==='FunctionDeclaration'&&s.id?.name===name)return 'helper';
      if(s.type==='ClassDeclaration'&&s.id?.name===name)return 'other';
      if(s.type==='VariableDeclaration')for(const d of s.declarations)if(bindsName(d.id,name))return d.id.type==='Identifier'&&s.kind==='const'&&/Function|Arrow/.test(d.init?.type||'')?'helper':'other';
    }
  }
  return null;
}
function eachNodeWithParents(node,visit,parent=null,grand=null){
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){for(const n of node)eachNodeWithParents(n,visit,parent,grand);return;}
  if(typeof node.type==='string')visit(node,parent,grand);
  for(const [key,value]of Object.entries(node))if(!skipKeys.has(key)&&value&&typeof value==='object')eachNodeWithParents(value,visit,typeof node.type==='string'?node:parent,typeof node.type==='string'?parent:grand);
}
// A member written to: assigned, updated, deleted, or a target of destructuring or of for-in/of.
const writtenAt=(node,parent,grand)=>parent&&(parent.type==='AssignmentExpression'&&parent.left===node||parent.type==='UpdateExpression'||parent.type==='UnaryExpression'&&parent.operator==='delete'||
  parent.type==='ArrayPattern'||parent.type==='AssignmentPattern'&&parent.left===node||(parent.type==='ForOfStatement'||parent.type==='ForInStatement')&&parent.left===node||parent.type==='ObjectProperty'&&parent.value===node&&grand?.type==='ObjectPattern'||parent.type==='RestElement');
// A read used only to decide (a test, a comparison, a negation, or an operand of && || ?? that is itself only used to
// decide or as a whole statement), never handed on as a value.
function testRead(node,ancestors){
  let cur=node;
  for(let i=ancestors.length-1;i>=0;i--){
    const p=ancestors[i];
    if(p.type==='BinaryExpression'&&['===','!==','==','!='].includes(p.operator))return true;
    if(p.type==='UnaryExpression'&&p.operator==='!')return true;
    if(['IfStatement','WhileStatement','DoWhileStatement','ForStatement','ConditionalExpression'].includes(p.type)&&p.test===cur)return true;
    if(p.type==='ExpressionStatement')return true;
    if(p.type!=='LogicalExpression')return false;
    cur=p;
  }
  return false;
}
// A call whose result nothing uses: the whole expression of a statement.
const statementCall=(node,parent,grand)=>(parent?.type==='CallExpression'||parent?.type==='OptionalCallExpression')&&parent.callee===node&&grand?.type==='ExpressionStatement'&&grand.expression===parent;
function applicationInterfaces(ast,labelAt){
  const per=new Map(),get=label=>{if(!per.has(label))per.set(label,{provides:new Set(),fills:{},calls:new Set(),vars:new Set(),sets:new Set(),redraws:new Set(),varCalls:[],varReads:[],writes:[],factories:[],factoryCalls:[],hidden:[]});return per.get(label);};
  const allowed=new Set(),closure=ast.program.body[0].expression.callee.body;
  // Factories are closure top-level declarations taking (appVars, appCalls, appRedraw); a body holds only function
  // declarations and at most one registration statement for each object.
  for(const s of closure.body)if(s.type==='FunctionDeclaration'&&factoryName.test(s.id?.name||'')){
    const f=get(labelAt(s.start));f.factories.push(s.id.name);
    if(JSON.stringify(s.params.map(p=>p.type==='Identifier'?p.name:p.type))!==JSON.stringify(applicationObjects))f.hidden.push(s.id.name+' takes other than (appVars, appCalls, appRedraw)');
    for(const p of s.params)if(p.type==='Identifier'&&applicationObjects.includes(p.name))allowed.add(p.start);
    const own=new Set(s.body.body.filter(functionStatement).flatMap(declaredNames)),count={appCalls:0,appRedraw:0};
    for(const t of s.body.body){
      if(functionStatement(t))continue;
      const e=t.type==='ExpressionStatement'?t.expression:null;
      if(objectAssign(e,'appCalls')){count.appCalls++;allowed.add(e.arguments[0].start);
        for(const p of e.arguments[1].properties){if(p.type==='ObjectProperty'&&!p.computed&&p.shorthand&&p.value.type==='Identifier'&&own.has(p.value.name))f.provides.add(p.value.name);else f.hidden.push('a registration that is not one of the factory\'s own functions under its own name');}}
      else if(objectAssign(e,'appRedraw')){count.appRedraw++;allowed.add(e.arguments[0].start);
        for(const p of e.arguments[1].properties){const key=p.type==='ObjectProperty'&&!p.computed&&p.key.type==='Identifier'?p.key.name:null,value=p.type==='ObjectProperty'&&p.value.type==='Identifier'?p.value.name:null;
          if(key&&value&&own.has(value)&&redrawSlot(value)===key&&!(key in f.fills))f.fills[key]=value;else f.hidden.push('an appRedraw slot not filled with the factory\'s own render, refresh, repaint or paint function of that name');}}
      else f.hidden.push(s.id.name+' holds a statement that is neither a function declaration nor a registration');
    }
    for(const [object,n]of Object.entries(count))if(n>1)f.hidden.push(s.id.name+' registers '+object+' in '+n+' statements');
  }
  // An application part (src/js/11-app-*) holds its one factory and nothing else: what sits outside it would escape the
  // rules for the three objects.
  const parts=new Map();for(const s of closure.body){const label=labelAt(s.start);if(/^src\/js\/11-app-/.test(label))(parts.get(label)||parts.set(label,[]).get(label)).push(s);}
  for(const [label,statements]of parts)if(statements.length!==1||!(statements[0].type==='FunctionDeclaration'&&factoryName.test(statements[0].id?.name||'')))get(label).hidden.push('an application part holds something besides its one factory');
  eachNodeWithAncestors(ast,(node,ancestors)=>{
    const parent=ancestors.at(-1),grand=ancestors.at(-2),great=ancestors.at(-3);
    // Declarations and the hand-over to the factories: const appVars = {}; createAppX(appVars, appCalls, appRedraw).
    if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&applicationObjects.includes(node.id.name)&&node.init?.type==='ObjectExpression'&&!node.init.properties.length)allowed.add(node.id.start);
    if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&factoryName.test(node.callee.name)){
      const f=get(labelAt(node.start));f.factoryCalls.push(node.callee.name);
      if(JSON.stringify(node.arguments.map(a=>a.type==='Identifier'?a.name:a.type))===JSON.stringify(applicationObjects))for(const a of node.arguments)allowed.add(a.start);
      else f.hidden.push(node.callee.name+' called with other than (appVars, appCalls, appRedraw)');
    }
    if((node.type==='MemberExpression'||node.type==='OptionalMemberExpression')&&node.object.type==='Identifier'&&applicationObjects.includes(node.object.name)){
      const name=!node.computed&&node.property.type==='Identifier'?node.property.name:null,f=get(labelAt(node.start)),object=node.object.name;
      if(!name)return;
      allowed.add(node.object.start);
      const written=writtenAt(node,parent,grand);
      if(object==='appVars'){f.vars.add(name);if(written){f.sets.add(name);const rhs=parent?.type==='AssignmentExpression'&&parent.left===node?parent.right:null;
          // A first value is an assignment initApp itself makes at the top of its body (where the state was declared).
          const fn=!!rhs&&(/Function|Arrow/.test(rhs.type)||rhs.type==='Identifier'&&localFunctionBinding(rhs.name,ancestors)==='helper'),nearest=[...ancestors].reverse().find(isFunction);
          f.writes.push({name,fn,first:nearest?.type==='FunctionDeclaration'&&nearest.id?.name==='initApp'});}
        const called=(parent?.type==='CallExpression'||parent?.type==='OptionalCallExpression')&&parent.callee===node;
        // appVars.f.call(…) and .apply(…) call it too; .bind(…) hands it on as a value.
        const through=(parent?.type==='MemberExpression'||parent?.type==='OptionalMemberExpression')&&parent.object===node&&!parent.computed&&['call','apply'].includes(parent.property.name)&&(grand?.type==='CallExpression'||grand?.type==='OptionalCallExpression')&&grand.callee===parent;
        if(called)f.varCalls.push({name,statement:statementCall(node,parent,grand)});
        else if(through)f.varCalls.push({name,statement:great?.type==='ExpressionStatement'&&great.expression===grand});
        else if(!written)f.varReads.push({name,test:testRead(node,ancestors)});}
      else if(object==='appCalls'){f.calls.add(name);if(written)f.hidden.push('appCalls.'+name+' written outside the registration');}
      else{f.redraws.add(name);if(!statementCall(node,parent,grand))f.hidden.push('appRedraw.'+name+' used other than as a call whose result nothing uses');}
    }
  });
  eachNode(ast,node=>{if(node.type==='Identifier'&&applicationObjects.includes(node.name)&&!allowed.has(node.start))get(labelAt(node.start)).hidden.push(node.name+' used other than by a plain property name');});
  const sorted=set=>[...set].sort();
  return Object.fromEntries([...per].map(([label,v])=>[label,{provides:sorted(v.provides),fills:Object.fromEntries(Object.entries(v.fills).sort()),calls:sorted(v.calls),vars:sorted(v.vars),sets:sorted(v.sets),redraws:sorted(v.redraws),varCalls:v.varCalls,varReads:v.varReads,writes:v.writes,factories:v.factories,factoryCalls:v.factoryCalls,hidden:v.hidden}]));
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
  // The application's shared state and calls: each file declares what it registers and uses; every name used is
  // registered by exactly one file; nothing reaches the three objects other than by a plain property name.
  const registeredBy=new Map();
  for(const [file,i]of Object.entries(analysis.interfaces))for(const n of i.provides)registeredBy.set(n,[...(registeredBy.get(n)||[]),file]);
  for(const [n,list]of registeredBy)if(list.length>1)issues.push('appCalls.'+n+' is registered by '+list.join(' and '));
  const calledAnywhere=new Set(Object.entries(analysis.interfaces).flatMap(([,i])=>i.calls));
  for(const [n,list]of registeredBy)if(!calledAnywhere.has(n))issues.push(list[0]+' registers appCalls.'+n+' but nothing calls it');
  for(const file of sources){
    const actual=analysis.interfaces[file]??{provides:[],calls:[],vars:[],hidden:[]},declared=declarations[file]??{};
    for(const h of actual.hidden)issues.push(file+': '+h);
    for(const n of actual.calls)if(!registeredBy.has(n))issues.push(file+' calls appCalls.'+n+' that no file registers');
    const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    if(!same(actual.provides,declared.appCalls?.provides??[]))issues.push(file+' registers appCalls '+JSON.stringify(actual.provides)+' but declares '+JSON.stringify(declared.appCalls?.provides??[]));
    if(!same(actual.calls,declared.appCalls?.uses??[]))issues.push(file+' calls appCalls '+JSON.stringify(actual.calls.filter(n=>!(declared.appCalls?.uses??[]).includes(n)))+' undeclared, '+JSON.stringify((declared.appCalls?.uses??[]).filter(n=>!actual.calls.includes(n)))+' declared but unused');
    if(!same(actual.vars,declared.appVars??[]))issues.push(file+' uses appVars '+JSON.stringify(actual.vars.filter(n=>!(declared.appVars??[]).includes(n)))+' undeclared, '+JSON.stringify((declared.appVars??[]).filter(n=>!actual.vars.includes(n)))+' declared but unused');
    if(!same(actual.redraws??[],declared.appRedraw?.requests??[]))issues.push(file+' calls appRedraw '+JSON.stringify((actual.redraws??[]).filter(n=>!(declared.appRedraw?.requests??[]).includes(n)))+' undeclared, '+JSON.stringify((declared.appRedraw?.requests??[]).filter(n=>!(actual.redraws??[]).includes(n)))+' declared but unused');
    if(!same(actual.fills??{},declared.appRedraw?.fills??{}))issues.push(file+' fills appRedraw '+JSON.stringify(actual.fills??{})+' but declares '+JSON.stringify(declared.appRedraw?.fills??{}));
  }
  // One way (AUDIT.md「ソースの境界」): a file uses only its own group and the groups before it in src/akari.html, through
  // a top-level name or appCalls; it reaches a group after it only by a redraw request, which that later file fills. A
  // group is one file, or the files of a module whose parts use each other (sourceGroup); a group's files come together.
  const group=f=>sourceGroup(f,analysis.files),groups=[...new Set(analysis.files.map(group))],rank=new Map(groups.map((g,i)=>[g,i]));
  const before=(a,b)=>group(a)!==group(b)&&rank.get(group(a))<rank.get(group(b));
  for(const g of groups){const at=analysis.files.map((f,i)=>group(f)===g?i:-1).filter(i=>i>=0);if(at.at(-1)-at[0]+1!==at.length)issues.push('the files of '+g+' do not come together in src/akari.html');}
  for(const file of sources){
    for(const to of Object.keys(analysis.uses[file]??{}))if(group(to)!==group(file)&&!before(to,file))issues.push(file+' uses '+to+', which comes after it ('+analysis.uses[file][to].slice(0,5).join(', ')+')');
    for(const n of analysis.interfaces[file]?.calls??[]){const from=registeredBy.get(n)?.[0];if(from&&group(from)!==group(file)&&!before(from,file))issues.push(file+' calls appCalls.'+n+' of '+from+', which comes after it');}
  }
  const requestedBy=new Map(),filledBy=new Map();
  for(const [file,i]of Object.entries(analysis.interfaces)){for(const s of i.redraws??[])requestedBy.set(s,[...(requestedBy.get(s)||[]),file]);for(const s of Object.keys(i.fills??{}))filledBy.set(s,[...(filledBy.get(s)||[]),file]);}
  for(const [s,files]of requestedBy)if(!filledBy.has(s))issues.push('appRedraw.'+s+' is called by '+files.join(', ')+' but no file fills it');
  for(const [s,files]of filledBy){
    if(files.length>1)issues.push('appRedraw.'+s+' is filled by '+files.join(' and '));
    if(!requestedBy.has(s))issues.push(files[0]+' fills appRedraw.'+s+' but nothing calls it');
    for(const r of requestedBy.get(s)??[])if(!before(r,files[0]))issues.push(r+' calls appRedraw.'+s+', which '+files[0]+' fills; the filling file must come after it');
  }
  // State: every appVars name read is assigned somewhere; a function kept in appVars by a later file is called only for
  // what it does, never for its result.
  const setBy=new Map();for(const [file,i]of Object.entries(analysis.interfaces))for(const n of i.sets??[])setBy.set(n,[...(setBy.get(n)||[]),file]);
  for(const n of new Set(Object.values(analysis.interfaces).flatMap(i=>i.vars??[])))if(!setBy.has(n))issues.push('appVars.'+n+' is read but no file assigns it');
  // A function kept in appVars: a name some file calls, or assigns a function (or a name bound to one). Who supplies it:
  // the files that assign it, apart from initApp's first values.
  const fnVars=new Set(Object.values(analysis.interfaces).flatMap(i=>[...(i.varCalls??[]).map(c=>c.name),...(i.writes??[]).filter(w=>w.fn).map(w=>w.name)]));
  const suppliedBy=new Map();for(const [file,i]of Object.entries(analysis.interfaces))for(const w of i.writes??[])if(!w.first)suppliedBy.set(w.name,[...new Set([...(suppliedBy.get(w.name)||[]),file])]);
  for(const [file,i]of Object.entries(analysis.interfaces))for(const c of i.varCalls??[])if(!c.statement)for(const w of suppliedBy.get(c.name)??[])if(before(file,w))issues.push(file+' uses the result of appVars.'+c.name+'(), which '+w+' (a later file) assigns');
  // Nor is such a function handed on as a value (kept in a name, passed, returned, bound), where a call of it could no
  // longer be seen: a read of it only decides (a test, a comparison).
  for(const [file,i]of Object.entries(analysis.interfaces))for(const r of i.varReads??[])if(!r.test&&fnVars.has(r.name))for(const w of suppliedBy.get(r.name)??[])if(before(file,w))issues.push(file+' hands on appVars.'+r.name+' as a value, a function '+w+' (a later file) assigns');
  // Each factory is declared once and called once.
  const declaredFactories=Object.values(analysis.interfaces).flatMap(i=>i.factories??[]),calledFactories=Object.values(analysis.interfaces).flatMap(i=>i.factoryCalls??[]);
  for(const n of new Set([...declaredFactories,...calledFactories]))if(declaredFactories.filter(x=>x===n).length!==1||calledFactories.filter(x=>x===n).length!==1)issues.push(n+' is declared '+declaredFactories.filter(x=>x===n).length+' and called '+calledFactories.filter(x=>x===n).length+' times');
  for(const o of analysis.opaque??[])issues.push(o);
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
    const sortedNames=list=>Array.isArray(list)&&list.every(u=>typeof u==='string')&&JSON.stringify(list)===JSON.stringify([...new Set(list)].sort());
    if(record.appCalls!==undefined)assert.ok(sortedNames(record.appCalls.provides??[])&&sortedNames(record.appCalls.uses??[])&&Object.keys(record.appCalls).every(k=>['provides','uses'].includes(k)),name+' lists sorted unique appCalls');
    if(record.appVars!==undefined)assert.ok(sortedNames(record.appVars),name+' lists sorted unique appVars');
    if(record.appRedraw!==undefined){const r=record.appRedraw;assert.ok(r&&typeof r==='object'&&Object.keys(r).every(k=>['requests','fills'].includes(k))&&sortedNames(r.requests??[])&&
      (r.fills===undefined||sortedNames(Object.keys(r.fills))&&Object.entries(r.fills).every(([slot,fn])=>typeof fn==='string'&&redrawSlot(fn)===slot)),name+' lists sorted appRedraw requests and fills named after their functions');}
    assert.ok(Object.keys(record).every(k=>['schema','file','uses','appCalls','appVars','appRedraw'].includes(k)),name+' has only known fields');
    declarations[record.file]=record;
  }
  return declarations;
}
