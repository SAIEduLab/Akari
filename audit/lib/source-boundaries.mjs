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
export function sourceGroup(file,files,hosts={}){
  if(languageGroup.test(file))return 'the language processing (src/js/02-09)';
  if(file.startsWith('extensions/')){const host=hosts[file]??files.slice(0,files.indexOf(file)).filter(f=>f.startsWith('src/js/')).at(-1);return host?sourceGroup(host,files,hosts):file;}
  return file;
}
const includeLine=/^<!-- @include (js\/[a-z0-9._-]+) -->$/;
const portableLine=/^\/\/ @portable (extensions\/[a-z0-9._-]+\.js)$/;
// The product script as src/build.mjs assembles it, with the source of every character (and, for a portable extension,
// the file that embeds it).
export function productScript(read){
  const pieces=[];let text='';
  const add=(label,part,host)=>{pieces.push({label,start:text.length,end:text.length+part.length,...(host?{host}:{})});text+=part;};
  for(const line of read('src/akari.html').split('\n')){
    const include=line.match(includeLine);if(!include)continue;
    const file='src/'+include[1];
    let chunk='';
    for(const row of read(file).replace(/\n$/,'').split('\n')){
      const portable=row.match(portableLine);
      if(!portable){chunk+=row+'\n';continue;}
      if(chunk){add(file,chunk);chunk='';}
      const body=read(portable[1]).replace(/\n$/,'');
      add(portable[1],body.slice(0,body.lastIndexOf('\n')+1),file);
    }
    if(chunk)add(file,chunk);
  }
  return {text,pieces};
}

const isFunction=node=>['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression','ObjectMethod','ClassMethod','ClassPrivateMethod'].includes(node?.type);
const skipKeys=new Set(['loc','start','end','extra','comments','leadingComments','trailingComments','innerComments','range']);
export function patternNames(node,out=[]){
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
// The product script's closure is an arrow function; the body of a function cut across files is read as a function of
// its own kind (callee 'FunctionExpression'), where new.target, yield and await mean what they mean in it.
export function closureReferences(script,{callee='ArrowFunctionExpression'}={}){
  const ast=parse(script.text);
  const call=ast.program.body.length===1&&ast.program.body[0].type==='ExpressionStatement'?ast.program.body[0].expression:null;
  assert.ok(call?.type==='CallExpression'&&call.callee.type===callee&&call.callee.body.type==='BlockStatement','the product script is one closure');
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

// Functions cut across files (AUDIT.md「ソースの置き場所・向き・大きさ」): every closure top-level statement lies in one
// file, except a function declaration whose body is cut between its statements (createAkariRuntime in the 01-runtime
// files). Its head and directives lie in its first file, each statement of its body in one file, and its files hold
// nothing else at the closure level. Its body's own names are resolved like the closure's top level, so its files use
// each other through them, one way like any other files. Per split function: its files, the references to its body's
// names (positions in the product script) and the file that declares each name.
export const statementName=s=>s.id?.name??(s.type==='VariableDeclaration'?s.declarations.flatMap(d=>patternNames(d.id)).join(', '):'a statement ('+s.type+')');
export function splitFunctions(script,ast=parse(script.text),labelAt=at=>script.pieces.find(p=>p.start<=at&&at<p.end)?.label){
  const closure=ast.program.body[0].expression.callee.body,splits=[],issues=[];
  const filesIn=(start,end)=>[...new Set(script.pieces.filter(p=>p.start<end&&start<p.end).map(p=>p.label))];
  const what=statementName;
  for(const s of closure.body){
    const files=filesIn(s.start,s.end);
    if(files.length<2)continue;
    if(s.type!=='FunctionDeclaration'){issues.push(what(s)+' lies in '+files.join(', ')+': only a function declaration is cut across files, between the statements of its body');continue;}
    const body=s.body,headEnd=body.directives.length?body.directives.at(-1).end:body.start+1;
    if(filesIn(s.start,headEnd).length!==1)issues.push(s.id.name+': its head lies in '+filesIn(s.start,headEnd).join(', ')+'; it lies in its first file');
    for(const b of body.body){const at=filesIn(b.start,b.end);if(at.length>1)issues.push(s.id.name+': '+what(b)+' lies in '+at.join(', ')+'; a statement of a cut function lies in one file');}
    // An empty statement (a stray semicolon) does nothing and is not counted.
    for(const o of closure.body){const shared=o===s||o.type==='EmptyStatement'?[]:filesIn(o.start,o.end).filter(f=>files.includes(f));if(shared.length)issues.push(shared.join(', ')+' holds '+what(o)+' besides a part of '+s.id.name);}
    const prefix='('+(s.async?'async ':'')+'function'+(s.generator?'*':'')+' () {',synthetic=prefix+script.text.slice(body.start+1,body.end-1)+'})();\n',offset=body.start+1-prefix.length;
    // Like the closure's top level, the body's names are its top-level declarations; a var inside one of its statements
    // would belong to the whole body, which the resolution does not follow.
    let resolved;try{resolved=closureReferences({text:synthetic,pieces:[{label:s.id.name,start:0,end:synthetic.length}]},{callee:'FunctionExpression'});}
    catch(e){const v=/^a var below the closure top level is not supported: (.*)$/.exec(e.message);if(!v)throw e;issues.push(s.id.name+': a var inside a statement of its body ('+v[1]+') is not followed by the analysis; use let or const (until then, its files\' uses of each other are not read)');resolved={top:new Map(),refs:[]};}
    splits.push({name:s.id.name,files,refs:resolved.refs.map(r=>({at:r.at+offset,name:r.name})),owner:new Map([...resolved.top].map(([n,d])=>[n,labelAt(d.start+offset)]))});
  }
  return {splits,issues};
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
  // A function whose body lies in several files: its files use each other through the body's own names.
  const {splits,issues:splitIssues}=splitFunctions(script,ast,labelAt);
  // A file that embeds a portable extension holds only the embedding: the size rule never splits it.
  const extensionHosts=Object.fromEntries(script.pieces.filter(p=>p.host).map(p=>[p.label,p.host])),hosts=new Set(Object.values(extensionHosts));
  for(const s of ast.program.body[0].expression.callee.body.body){const at=labelAt(s.start);if(hosts.has(at)&&s.type!=='EmptyStatement')splitIssues.push(at+' embeds a portable extension and holds '+statementName(s)+'; such a file holds only the embedding');}
  // A use of a later file of the same cut function, through the body's names (checked one way even inside one group).
  const splitBackward=[];
  for(const sp of splits)for(const r of sp.refs){
    const from=labelAt(r.at),to=sp.owner.get(r.name);
    if(!from||!to||from===to)continue;
    ((uses[from]??={})[to]??=new Set()).add(r.name);
    if(sp.files.indexOf(to)>sp.files.indexOf(from))splitBackward.push({from,to,name:r.name});
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
  const reflectiveMembers=['__proto__','__defineGetter__','__defineSetter__','__lookupGetter__','__lookupSetter__'];
  // The reading above relies on strict code (no with, no sloppy arguments, no eval bound to another name).
  if(!ast.program.body[0].expression.callee.body.directives?.some(d=>d.value.value==='use strict'))opaque.push('the product script is not strict code');
  eachNodeWithAncestors(ast,(node,ancestors)=>{
    const parent=ancestors.at(-1),member=(parent?.type==='MemberExpression'||parent?.type==='OptionalMemberExpression')&&parent.object===node;
    // window.window and the like are the global object again, so they count as using it as a value.
    if(globalObject(node)&&member&&globalAliases.includes(memberName(parent)))opaque.push(labelAt(node.start)+': the global object used as a value ('+node.name+'.'+memberName(parent)+')');
    else if(globalObject(node)&&!(member&&memberName(parent)||parent?.type==='UnaryExpression'&&parent.operator==='typeof'||parent?.type==='BinaryExpression'&&['===','!==','==','!='].includes(parent.operator)
      ||parent?.type==='CallExpression'&&parent.arguments[0]===node&&parent.callee.type==='Identifier'&&parent.callee.name==='on'&&onHelperBinding(parent.callee,ancestors)))
      opaque.push(labelAt(node.start)+': the global object used as a value ('+node.name+')');
    // A direct eval reaches the names around it; in strict code eval cannot be bound to another name, so refusing the free
    // name eval closes it. Members that reach an object's prototype or rewrite its accessors cannot be followed either.
    if(node.type==='Identifier'&&node.name==='eval'&&freeAt.has(node.start))opaque.push(labelAt(node.start)+': eval, which runs text whose names cannot be followed');
    const reached=(node.type==='MemberExpression'||node.type==='OptionalMemberExpression')?(!node.computed?node.property.name:node.property.type==='StringLiteral'?node.property.value:null):null;
    if(reached&&reflectiveMembers.includes(reached))opaque.push(labelAt(node.start)+': '+reached+', which reaches or rewrites a prototype or accessors');
    if(node.type==='Identifier'&&node.name==='Reflect'&&freeAt.has(node.start)&&!(member&&!parent.computed&&readingReflect.includes(parent.property.name)))opaque.push(labelAt(node.start)+': Reflect used other than to read ('+readingReflect.join(', ')+')');
    const helper=node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&node.id.name==='on'&&/Function|Arrow/.test(node.init?.type||'')?node.init:node.type==='FunctionDeclaration'&&node.id?.name==='on'?node:null;
    if(helper){const target=helper.params[0]?.type==='Identifier'?helper.params[0].name:null;let bad=!target;
      eachNodeWithParents(helper.body,(n,p)=>{if(n.type==='Identifier'&&n.name===target&&!((p?.type==='MemberExpression'||p?.type==='OptionalMemberExpression')&&p.object===n&&!p.computed&&['addEventListener','removeEventListener'].includes(p.property.name)))bad=true;});
      if(bad)opaque.push(labelAt(node.start)+': an on helper that does more with its target than add and remove event listeners');}
  });
  const inside=(name,at)=>{const d=top.get(name);return d.start<=at&&at<d.end;};
  for(const name of embeddedFunctions)globalsRead[name]=[...new Set([...free.filter(r=>r.from===name&&productGlobals.has(r.name)),...globalReads.filter(r=>inside(name,r.at)&&productGlobals.has(r.name))].map(r=>r.name))].sort();
  const files=[...new Set(script.pieces.map(p=>p.label))];
  const interfaces=Object.fromEntries(factoryFamilies.map(family=>[family.vars,applicationInterfaces(ast,labelAt,family)]));
  return {files,owner,interfaces,opaque,splitIssues,extensionHosts,splitBackward,splitFiles:Object.fromEntries(splits.map(sp=>[sp.name,sp.files])),embeddedThroughToString:[...toStrings].sort(),globalsRead,productGlobals:[...productGlobals].sort(),uses:Object.fromEntries(Object.entries(uses).map(([f,t])=>[f,Object.fromEntries(Object.entries(t).map(([k,v])=>[k,[...v].sort()]))])),embedded,refs:refs.length};
}

// Two families of factories share state through one object, offer functions to the files after them through a second,
// and take redraw requests from the files before them through a third: the application (initApp in
// src/js/11-application.js, and its parts src/js/11-app-*.js) and the block view (createBlockEditorView in
// src/js/10-block-view.js, whose state is one set per view, and its parts src/js/10-view-*.js). The shell is the function
// that declares the three objects and calls the factories. Per file and family: the names it registers
// (Object.assign(calls, {name, …}), each a function the factory itself declares, under its own name), the redraw slots it
// fills (Object.assign(redraw, {slot: renderSlot, …})), the call names, state names and redraw slots it uses, the state
// names it assigns, its calls of a function kept in the state (and whether the result is used), the factories it declares
// and calls, the objects it declares, and every other use of the three objects, which would hide what is used.
export const factoryFamilies=Object.freeze([
  Object.freeze({vars:'appVars',calls:'appCalls',redraw:'appRedraw',factory:/^createApp[A-Z]\w*$/,part:/^src\/js\/11-app-/,shell:'src/js/11-application.js',shellFunction:'initApp',label:'an application'}),
  Object.freeze({vars:'viewVars',calls:'viewCalls',redraw:'viewRedraw',factory:/^createView[A-Z]\w*$/,part:/^src\/js\/10-view-/,shell:'src/js/10-block-view.js',shellFunction:'createBlockEditorView',label:'a block view'}),
]);
export const familyObjects=family=>[family.vars,family.calls,family.redraw];
// A redraw slot is the name of a drawing function without its verb (renderProperties fills appRedraw.properties), or the
// verb itself when it is the whole name (render fills viewRedraw.render).
export const redrawSlot=name=>{const m=/^(render|refresh|repaint|paint)([A-Z]\w*)?$/.exec(name);return !m?null:m[2]?m[2][0].toLowerCase()+m[2].slice(1):m[1];};
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
// The nearest binding of a name seen from a node (its ancestors, nearest last): {kind:'function'} for `function name(…)`,
// {kind:'const'|'let', init, ancestors} for `const name = …` or `let name = …` (the ancestors of the declaration), {kind:
// 'other'} for any other binding (a parameter of a function or method, a catch parameter, a for declaration, a var
// anywhere in the function, a destructured name, a class, a named function expression), or null when nothing in the
// closure binds it.
const hoisted=new WeakMap(),hoistedOf=body=>{if(!hoisted.has(body))hoisted.set(body,hoistedVars(body.body));return hoisted.get(body);};
function nearestBinding(name,ancestors){
  for(let i=ancestors.length-1;i>=0;i--){
    const a=ancestors[i];
    if(a.params?.some(p=>bindsName(p,name)))return {kind:'other',owner:a};
    if((a.type==='FunctionExpression'||a.type==='ClassExpression')&&a.id?.name===name)return {kind:'other'};
    if(a.type==='CatchClause'&&bindsName(a.param,name))return {kind:'other'};
    if(['ForStatement','ForInStatement','ForOfStatement'].includes(a.type)){const d=a.type==='ForStatement'?a.init:a.left;if(d?.type==='VariableDeclaration'&&d.declarations.some(x=>bindsName(x.id,name)))return {kind:'other'};}
    if(isFunction(a)&&a.body?.type==='BlockStatement'&&hoistedOf(a.body).has(name))return {kind:'other'};
    if(a.type==='StaticBlock'&&hoistedVars(a.body).has(name))return {kind:'other'};
    // A switch's cases share one block: a let, const or function declared in a case binds in all of them, but not in the
    // switch's own expression, which is read outside that block. A static block of a class is a block too.
    const statements=a.type==='BlockStatement'||a.type==='Program'||a.type==='StaticBlock'?a.body:a.type==='SwitchStatement'&&ancestors[i+1]?.type==='SwitchCase'?a.cases.flatMap(c=>c.consequent):null;
    if(!statements)continue;
    for(const s of statements){
      if(s.type==='FunctionDeclaration'&&s.id?.name===name)return {kind:'function'};
      if(s.type==='ClassDeclaration'&&s.id?.name===name)return {kind:'other'};
      // The ancestors of the declaration: for a switch, down to a case, so that its value sees the cases' names.
      if(s.type==='VariableDeclaration')for(const d of s.declarations)if(bindsName(d.id,name))return d.id.type==='Identifier'&&['const','let'].includes(s.kind)?{kind:s.kind,init:d.init,ancestors:ancestors.slice(0,a.type==='SwitchStatement'?i+2:i+1),declarator:d}:{kind:'other'};
    }
  }
  return null;
}
// Every value a const or let binding may hold, each with its ancestors: its first value and, for a let, each value
// later assigned to it with =, ||=, &&= or ??=. A let given a value by destructuring is not followed.
const assigned=new WeakMap();
function bindingValues(b){
  if(!b?.declarator)return [];
  const values=b.init?[{e:b.init,ancestors:b.ancestors}]:[];
  if(b.kind!=='let')return values;
  if(!assigned.has(b.declarator)){
    const later=[],name=b.declarator.id.name;
    // Later assignments are looked for in the whole block that binds it (for a switch, all its cases).
    const at=b.ancestors.at(-1)?.type==='SwitchCase'?b.ancestors.length-2:b.ancestors.length-1;
    eachNodeWithAncestors(b.ancestors[at],(node,ancestors)=>{if(node.type==='AssignmentExpression'&&['=',...logicalAssignment].includes(node.operator)&&node.left.type==='Identifier'&&node.left.name===name&&nearestBinding(name,ancestors)?.declarator===b.declarator)later.push({e:node.right,ancestors});},b.ancestors.slice(0,at));
    assigned.set(b.declarator,later);
  }
  return [...values,...assigned.get(b.declarator)];
}
// 'helper' when the nearest binding is a function declared as `function name(…)` or `const name = (…) => …`, 'other'
// for any other binding, or null when nothing in the closure binds it.
function localFunctionBinding(name,ancestors){
  const b=nearestBinding(name,ancestors);
  return !b?null:b.kind==='function'||b.kind==='const'&&/Function|Arrow/.test(b.init?.type||'')?'helper':'other';
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
// Whether a value, as written, may be a function: a function or arrow, a name bound to a local function or to a const or
// let that may hold one (its first value, or for a let any value assigned to it), a member of the family's calls object,
// a .bind(…) result, or a conditional, logical, sequence or assignment expression that may give one. A value another field
// of the state gives is followed separately (copiedVars), and so is a local copy of a field that is then called (see
// applicationInterfaces). Anything else (a call's result, a member of another object, …) cannot be told from the text;
// AUDIT.md asks that a function be put into the state only as a function or the name of one.
function mayBeFunction(family,e,ancestors,seen=new Set()){
  if(!e)return false;
  const may=(x,a=ancestors)=>mayBeFunction(family,x,a,seen);
  if(/Function|Arrow|Class/.test(e.type))return true;
  if(e.type==='Identifier'){const b=nearestBinding(e.name,ancestors);if(b?.kind==='function')return true;
    for(const v of bindingValues(b))if(!seen.has(v.e)){seen.add(v.e);if(may(v.e,v.ancestors))return true;}
    return false;}
  if((e.type==='MemberExpression'||e.type==='OptionalMemberExpression')&&e.object.type==='Identifier'&&e.object.name===family.calls)return true;
  if((e.type==='CallExpression'||e.type==='OptionalCallExpression')&&(e.callee.type==='MemberExpression'||e.callee.type==='OptionalMemberExpression')&&!e.callee.computed&&e.callee.property.name==='bind')return true;
  if(e.type==='ConditionalExpression')return may(e.consequent)||may(e.alternate);
  if(e.type==='LogicalExpression')return may(e.left)||may(e.right);
  if(e.type==='SequenceExpression')return may(e.expressions.at(-1));
  if(e.type==='AssignmentExpression')return ['=',...logicalAssignment].includes(e.operator)&&(may(e.right)||logicalAssignment.includes(e.operator)&&may(e.left));
  return false;
}
// The fields of the state a value may be copied from (appVars.a = appVars.b, through ?: && || , =, or through a const or
// let that may hold the field).
function copiedVars(family,e,ancestors,seen=new Set()){
  if(!e)return [];
  const copies=(x,a=ancestors)=>copiedVars(family,x,a,seen);
  if((e.type==='MemberExpression'||e.type==='OptionalMemberExpression')&&e.object.type==='Identifier'&&e.object.name===family.vars&&!e.computed)return [e.property.name];
  if(e.type==='Identifier'){const out=[];for(const v of bindingValues(nearestBinding(e.name,ancestors)))if(!seen.has(v.e)){seen.add(v.e);out.push(...copies(v.e,v.ancestors));}return out;}
  if(e.type==='ConditionalExpression')return [...copies(e.consequent),...copies(e.alternate)];
  if(e.type==='LogicalExpression')return [...copies(e.left),...copies(e.right)];
  if(e.type==='SequenceExpression')return copies(e.expressions.at(-1));
  if(e.type==='AssignmentExpression')return e.operator==='='?copies(e.right):logicalAssignment.includes(e.operator)?[...copies(e.left),...copies(e.right)]:[];
  return [];
}
// The names every object has (Object.prototype: constructor, valueOf, __proto__, __defineGetter__, …): reaching one of
// them through an object leads to the object itself, its prototype or a way to rewrite it, which cannot be followed.
const objectNames=new Set(Object.getOwnPropertyNames(Object.prototype));
// A value that is nothing but itself: a literal, void 0, undefined (where no name undefined is bound), an empty array or
// object, or a function whose parameters are plain names (a rest parameter too) and whose body is empty, such a value, or
// one return of such a value, a function excepted (false, null, [], () => ({}), (reason) => {}, (...args) => {},
// () => { return false; }, function () {}). It uses no other name and writes nothing.
function inertValue(e,ancestors=[]){
  if(!e)return false;
  const plainParams=fn=>fn.params.every(p=>{const q=p.type==='RestElement'?p.argument:p;return q.type==='Identifier'&&q.name!=='undefined';});
  const plainBody=b=>!b.body.length||b.body.length===1&&b.body[0].type==='ReturnStatement'&&(!b.body[0].argument||inertValue(b.body[0].argument,ancestors)&&!/Function/.test(b.body[0].argument.type));
  if(['StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral'].includes(e.type)||e.type==='Identifier'&&e.name==='undefined'&&!nearestBinding('undefined',ancestors))return true;
  if(e.type==='ArrayExpression'||e.type==='ObjectExpression')return !(e.elements??e.properties).length;
  if(e.type==='FunctionExpression')return plainParams(e)&&!e.generator&&plainBody(e.body);
  if(e.type==='TemplateLiteral')return !e.expressions.length;
  if(e.type==='UnaryExpression')return e.operator==='-'&&e.argument.type==='NumericLiteral'||e.operator==='void'&&e.argument.type==='NumericLiteral';
  if(e.type==='ArrowFunctionExpression')return plainParams(e)&&(e.body.type==='BlockStatement'?plainBody(e.body):e.body.type!=='ArrowFunctionExpression'&&e.body.type!=='FunctionExpression'&&inertValue(e.body,ancestors));
  return false;
}
// Whether a value, as written, is not a function: a literal, an object or array literal, an arithmetic, comparison,
// logical not, typeof or other operator result, undefined, or a conditional or logical expression giving only such
// values. A new instance is not among them (new Function(…), or a constructor that returns a function).
const logicalAssignment=['||=','&&=','??='];
function notFunction(e,ancestors=[]){
  if(!e)return false;
  const not=x=>notFunction(x,ancestors);
  if(/Literal$/.test(e.type)||['ObjectExpression','ArrayExpression','UnaryExpression','BinaryExpression','UpdateExpression'].includes(e.type))return true;
  if(e.type==='Identifier')return e.name==='undefined'&&!nearestBinding('undefined',ancestors);
  if(e.type==='ConditionalExpression')return not(e.consequent)&&not(e.alternate);
  if(e.type==='LogicalExpression')return not(e.left)&&not(e.right);
  if(e.type==='SequenceExpression')return not(e.expressions.at(-1));
  if(e.type==='AssignmentExpression')return e.operator==='='?not(e.right):logicalAssignment.includes(e.operator)?not(e.left)&&not(e.right):true;
  return false;
}
// A call whose result nothing uses: the whole expression of a statement.
const statementCall=(node,parent,grand)=>(parent?.type==='CallExpression'||parent?.type==='OptionalCallExpression')&&parent.callee===node&&grand?.type==='ExpressionStatement'&&grand.expression===parent;
function applicationInterfaces(ast,labelAt,family){
  const objects=familyObjects(family),{vars,calls,redraw}=family,signature='('+objects.join(', ')+')';
  const per=new Map(),get=label=>{if(!per.has(label))per.set(label,{provides:new Set(),fills:{},calls:new Set(),vars:new Set(),sets:new Set(),redraws:new Set(),varCalls:[],varReads:[],writes:[],otherUses:[],memberReads:[],taken:[],whole:[],factories:[],factoryCalls:[],declares:[],hidden:[]});return per.get(label);};
  const allowed=new Set(),closure=ast.program.body[0].expression.callee.body;
  // Factories are closure top-level declarations taking the three objects; a body holds only function declarations and
  // at most one registration statement for each of the calls and the redraw object.
  for(const s of closure.body)if(s.type==='FunctionDeclaration'&&family.factory.test(s.id?.name||'')){
    const f=get(labelAt(s.start));f.factories.push(s.id.name);
    if(JSON.stringify(s.params.map(p=>p.type==='Identifier'?p.name:p.type))!==JSON.stringify(objects))f.hidden.push(s.id.name+' takes other than '+signature);
    for(const p of s.params)if(p.type==='Identifier'&&objects.includes(p.name))allowed.add(p.start);
    const own=new Set(s.body.body.filter(functionStatement).flatMap(declaredNames)),count={[calls]:0,[redraw]:0};
    for(const t of s.body.body){
      // The registrations come last, after every function declaration (a const function after them would not be there
      // yet when they run; the rule asks it of every function so that a factory has one shape).
      if(functionStatement(t)){if(count[calls]||count[redraw])f.hidden.push(s.id.name+' declares '+declaredNames(t).join(', ')+' after its registration');continue;}
      const e=t.type==='ExpressionStatement'?t.expression:null;
      if(objectAssign(e,calls)){count[calls]++;allowed.add(e.arguments[0].start);
        for(const p of e.arguments[1].properties){if(p.type==='ObjectProperty'&&!p.computed&&p.shorthand&&p.value.type==='Identifier'&&own.has(p.value.name))f.provides.add(p.value.name);else f.hidden.push('a registration that is not one of the factory\'s own functions under its own name');}}
      else if(objectAssign(e,redraw)){count[redraw]++;allowed.add(e.arguments[0].start);
        for(const p of e.arguments[1].properties){const key=p.type==='ObjectProperty'&&!p.computed&&p.key.type==='Identifier'?p.key.name:null,value=p.type==='ObjectProperty'&&p.value.type==='Identifier'?p.value.name:null;
          if(key&&value&&own.has(value)&&redrawSlot(value)===key&&!(key in f.fills))f.fills[key]=value;else f.hidden.push('an '+redraw+' slot not filled with the factory\'s own render, refresh, repaint or paint function of that name');}}
      else f.hidden.push(s.id.name+' holds a statement that is neither a function declaration nor a registration');
    }
    for(const [object,n]of Object.entries(count))if(n>1)f.hidden.push(s.id.name+' registers '+object+' in '+n+' statements');
  }
  // A part holds its one factory and nothing else: what sits outside it would escape the rules for the three objects.
  const parts=new Map();for(const s of closure.body){const label=labelAt(s.start);if(family.part.test(label))(parts.get(label)||parts.set(label,[]).get(label)).push(s);}
  for(const [label,statements]of parts)if(statements.length!==1||!(statements[0].type==='FunctionDeclaration'&&family.factory.test(statements[0].id?.name||'')))get(label).hidden.push(family.label+' part holds something besides its one factory');
  // The shell takes its parameter (what its caller hands in at run time) at once: right after the declarations of the
  // three objects and the factory calls, statements that put the parameter into a field (viewVars.options = options) or
  // destructure it into fields ({a: viewVars.a, b: viewVars.b = () => false} = options), each field once, under keys
  // that no object has already (not constructor, valueOf, __proto__, …), with defaults that are plain values. The shell
  // has one plain parameter, declares no other name of it, and uses neither the parameter outside these statements nor
  // arguments, so nothing of the family runs before the parameter is taken or reaches it afterwards. The fields taken
  // are the caller's: no file writes them again. A field that holds the whole parameter is read only as
  // field.member (a plain name no object has already) and only for the members the shell's boundary record declares.
  // The record (<vars>Taken: viewVarsTaken) lists the fields taken and those members (options.readOnly), so that widening
  // what is taken shows in the declaration. Assumed and not checked: the built-in prototypes are not rewritten. These
  // rules stop what is written in the ordinary way; deliberate use of reflection to get around them is out of their reach
  // (AUDIT.md「ソースの境界」).
  const shellFn=closure.body.find(s=>s.type==='FunctionDeclaration'&&s.id?.name===family.shellFunction&&labelAt(s.start)===family.shell);
  const params=new Set((shellFn?.params??[]).filter(p=>p.type==='Identifier').map(p=>p.name)),takes=new Set(),takeTargets=new Set();
  const field=n=>n?.type==='MemberExpression'&&!n.computed&&n.object.type==='Identifier'&&n.object.name===vars&&n.property.type==='Identifier'?n.property.name:null;
  if(shellFn&&shellFn.params.length&&!(shellFn.params.length===1&&shellFn.params[0].type==='Identifier'))get(family.shell).hidden.push(family.shellFunction+' takes other than one plain parameter');
  if(shellFn&&params.size){
    const f=get(family.shell),body=shellFn.body.body;f.taken=[];f.whole=[];
    const shellAncestors=[ast.program,ast.program.body[0],ast.program.body[0].expression,ast.program.body[0].expression.callee,closure,shellFn,shellFn.body];
    const setup=s=>s.type==='VariableDeclaration'&&s.declarations.length===1&&objects.includes(s.declarations[0].id.name)||s.type==='ExpressionStatement'&&s.expression.type==='CallExpression'&&s.expression.callee.type==='Identifier'&&family.factory.test(s.expression.callee.name);
    let i=0;while(i<body.length&&setup(body[i]))i++;
    for(;i<body.length;i++){
      const e=body[i].type==='ExpressionStatement'?body[i].expression:null;
      if(!(e?.type==='AssignmentExpression'&&e.operator==='='&&e.right.type==='Identifier'&&params.has(e.right.name)))break;
      takes.add(body[i]);
      const take=(n,whole)=>{if(f.taken.includes(field(n)))f.hidden.push(family.shellFunction+' takes '+field(n)+' from its parameter twice');else{f.taken.push(field(n));if(whole)f.whole.push(field(n));takeTargets.add(n);}};
      if(field(e.left)){take(e.left,true);continue;}
      if(e.left.type!=='ObjectPattern'){f.hidden.push(family.shellFunction+' takes its parameter other than into fields of '+vars);continue;}
      for(const p of e.left.properties){
        const v=p.type==='ObjectProperty'&&!p.computed?p.value:null,target=v?.type==='AssignmentPattern'?v.left:v;
        const key=v?(p.key.type==='Identifier'?p.key.name:p.key.type==='StringLiteral'?p.key.value:null):null;
        if(!field(target)||key===null){f.hidden.push(family.shellFunction+' takes its parameter other than into fields of '+vars);continue;}
        if(objectNames.has(key))f.hidden.push(family.shellFunction+' takes '+key+' from its parameter, a name every object has');
        if(v.type==='AssignmentPattern'&&!inertValue(v.right,shellAncestors))f.hidden.push(family.shellFunction+' takes '+field(target)+' from its parameter with a default that is not a plain value');
        take(target,false);
      }
    }
  }
  const inTake=ancestors=>ancestors.some(a=>takes.has(a));
  // The functions each factory declares: reachable by name only inside that factory.
  const factoryOwn=new Map();for(const s of closure.body)if(s.type==='FunctionDeclaration'&&family.factory.test(s.id?.name||''))for(const n of s.body.body.filter(functionStatement).flatMap(declaredNames))factoryOwn.set(n,labelAt(s.start));
  // Inside the shell no name is declared that is the parameter's: a var or function of that name would take its place.
  if(shellFn&&params.size)eachNode(shellFn.body,n=>{
    const bound=n.type==='VariableDeclarator'?patternNames(n.id):(n.type==='FunctionDeclaration'||n.type==='ClassDeclaration'||n.type==='FunctionExpression'||n.type==='ClassExpression')&&n.id?[n.id.name]:[];
    if(isFunction(n))for(const p of n.params)bound.push(...patternNames(p));
    if(n.type==='CatchClause')bound.push(...patternNames(n.param));
    for(const name of bound)if(params.has(name))get(family.shell).hidden.push(family.shellFunction+' declares the name of its parameter '+name+' again');
  });
  eachNodeWithAncestors(ast,(node,ancestors)=>{
    const parent=ancestors.at(-1),grand=ancestors.at(-2),great=ancestors.at(-3);
    const inFamily=family.part.test(labelAt(node.start)||'')||labelAt(node.start)===family.shell;
    if((node.type==='ThisExpression'||node.type==='Super')&&inFamily)get(labelAt(node.start)).hidden.push((node.type==='Super'?'super':'this')+', which a function called through '+objects.join(', ')+' would get as one of them');
    // The shell is called by the family's callers, outside it: inside the family the shell function is used only
    // through members other than call, apply and bind (createBlockEditorView.sequence), so the family cannot start
    // another of itself (and the block view family cannot hand such a view functions of its own).
    const throughMember=(parent?.type==='MemberExpression'||parent?.type==='OptionalMemberExpression')&&parent.object===node&&!parent.computed&&!['call','apply','bind'].includes(parent.property.name);
    const keyOnly=(parent?.type==='MemberExpression'||parent?.type==='OptionalMemberExpression')&&parent.property===node&&!parent.computed||['ObjectProperty','ObjectMethod','ClassMethod','ClassProperty'].includes(parent?.type)&&parent.key===node&&!parent.computed;
    if(node.type==='Identifier'&&node.name===family.shellFunction&&inFamily&&!(parent?.type==='FunctionDeclaration'&&parent.id===node)&&!throughMember&&!keyOnly&&nearestBinding(node.name,ancestors)?.kind==='function')
      get(labelAt(node.start)).hidden.push(family.shellFunction+' used other than through its members; its callers are outside the family');
    // In the family's files, a part's function is reachable by name only inside its part. (A name where nothing binds
    // it is otherwise a global: a family file that means the global of a name a part also uses writes window.name.)
    if(node.type==='Identifier'&&inFamily&&factoryOwn.has(node.name)&&factoryOwn.get(node.name)!==labelAt(node.start)&&!keyOnly&&parent?.type!=='PrivateName'&&!['LabeledStatement','BreakStatement','ContinueStatement'].includes(parent?.type)&&!nearestBinding(node.name,ancestors))
      get(labelAt(node.start)).hidden.push(node.name+' used by name, a function of '+factoryOwn.get(node.name)+', which is reachable by name only inside that part (the files of the family reach it through '+calls+')');
    if(shellFn&&node.type==='Identifier'&&ancestors.includes(shellFn)){
      const nameOnly=(parent?.type==='MemberExpression'||parent?.type==='OptionalMemberExpression')&&parent.property===node&&!parent.computed||['ObjectProperty','ObjectMethod','ClassMethod','ClassProperty'].includes(parent?.type)&&parent.key===node&&!parent.computed||['LabeledStatement','BreakStatement','ContinueStatement'].includes(parent?.type)&&parent.label===node;
      const declared=['VariableDeclarator','FunctionDeclaration','ClassDeclaration','FunctionExpression','ClassExpression','CatchClause'].includes(parent?.type)&&(parent.id===node||parent.param===node)||isFunction(parent)&&parent.params.includes(node);
      if(!nameOnly&&!declared&&params.has(node.name)&&nearestBinding(node.name,ancestors)?.owner===shellFn&&!inTake(ancestors))get(labelAt(node.start)).hidden.push(family.shellFunction+' uses its parameter '+node.name+' outside the statements that take it');
      if(!nameOnly&&node.name==='arguments'&&[...ancestors].reverse().find(a=>isFunction(a)&&a.type!=='ArrowFunctionExpression')===shellFn)get(labelAt(node.start)).hidden.push(family.shellFunction+' uses arguments');
    }
    // Declarations, in the shell function: const appVars = {}; and the hand-over: createAppX(appVars, appCalls, appRedraw).
    if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&objects.includes(node.id.name)&&node.init?.type==='ObjectExpression'&&!node.init.properties.length){
      allowed.add(node.id.start);const fn=[...ancestors].reverse().find(isFunction),f=get(labelAt(node.start));
      if(fn?.type==='FunctionDeclaration'&&fn.id?.name===family.shellFunction)f.declares.push(node.id.name);else f.hidden.push(node.id.name+' declared outside '+family.shellFunction);}
    // A local copy of a field that is called (const g = appVars.f; g(), or g.call(…)) calls the field too.
    if(node.type==='CallExpression'||node.type==='OptionalCallExpression'){
      const c=node.callee,local=c.type==='Identifier'?c:(c.type==='MemberExpression'||c.type==='OptionalMemberExpression')&&!c.computed&&c.object.type==='Identifier'&&['call','apply'].includes(c.property.name)?c.object:null;
      if(local&&!objects.includes(local.name))for(const name of copiedVars(family,local,ancestors))get(labelAt(node.start)).varCalls.push({name,statement:parent?.type==='ExpressionStatement'&&parent.expression===node});
    }
    if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&family.factory.test(node.callee.name)){
      const f=get(labelAt(node.start));f.factoryCalls.push(node.callee.name);
      if(JSON.stringify(node.arguments.map(a=>a.type==='Identifier'?a.name:a.type))===JSON.stringify(objects))for(const a of node.arguments)allowed.add(a.start);
      else f.hidden.push(node.callee.name+' called with other than '+signature);
    }
    if((node.type==='MemberExpression'||node.type==='OptionalMemberExpression')&&node.object.type==='Identifier'&&objects.includes(node.object.name)){
      const name=!node.computed&&node.property.type==='Identifier'?node.property.name:null,f=get(labelAt(node.start)),object=node.object.name;
      if(!name)return;
      allowed.add(node.object.start);
      const written=writtenAt(node,parent,grand);
      // Other than by reading or calling a member by a plain name (appVars.x.y, appVars.x.f()): a member written, a computed
      // member, a name every object has, or the field itself handed on, kept, tested or passed. Refused below for a field
      // that holds the shell's whole parameter.
      const member=(parent?.type==='MemberExpression'||parent?.type==='OptionalMemberExpression')&&parent.object===node;
      // A write at the end of a chain of members (appVars.x.y.z = …) writes into what the field holds, at any depth.
      let top=node,k=ancestors.length-1;while((ancestors[k]?.type==='MemberExpression'||ancestors[k]?.type==='OptionalMemberExpression')&&ancestors[k].object===top){top=ancestors[k];k--;}
      if(object===vars&&(member?writtenAt(parent,grand,great)||parent.computed||top!==parent&&writtenAt(top,ancestors[k],ancestors[k-1]):!written))f.otherUses.push(name);
      if(object===vars&&member&&!parent.computed&&!writtenAt(parent,grand,great))f.memberReads.push(name+'.'+parent.property.name);
      if(object===vars){f.vars.add(name);if(written){f.sets.add(name);const assignment=parent?.type==='AssignmentExpression'&&parent.left===node,rhs=assignment?parent.right:null;
          // Not a function: a value that is plainly none, an arithmetic or string compound assignment, ++ or --, delete.
          const notFn=assignment?!['=',...logicalAssignment].includes(parent.operator)||notFunction(rhs,ancestors):parent?.type==='UpdateExpression'||parent?.type==='UnaryExpression';
          f.writes.push({name,fn:!!rhs&&mayBeFunction(family,rhs,ancestors),copies:rhs?copiedVars(family,rhs,ancestors):[],notFn,input:takeTargets.has(node)});}
        const called=(parent?.type==='CallExpression'||parent?.type==='OptionalCallExpression')&&parent.callee===node;
        // appVars.f.call(…) and .apply(…) call it too; .bind(…) hands it on as a value.
        const through=(parent?.type==='MemberExpression'||parent?.type==='OptionalMemberExpression')&&parent.object===node&&!parent.computed&&['call','apply'].includes(parent.property.name)&&(grand?.type==='CallExpression'||grand?.type==='OptionalCallExpression')&&grand.callee===parent;
        if(called)f.varCalls.push({name,statement:statementCall(node,parent,grand)});
        else if(through)f.varCalls.push({name,statement:great?.type==='ExpressionStatement'&&great.expression===grand});
        else if(!written)f.varReads.push({name,test:testRead(node,ancestors)});}
      else if(object===calls){f.calls.add(name);if(written)f.hidden.push(calls+'.'+name+' written outside the registration');}
      else{f.redraws.add(name);if(!statementCall(node,parent,grand))f.hidden.push(redraw+'.'+name+' used other than as a call whose result nothing uses');}
    }
  });
  eachNode(ast,node=>{if(node.type==='Identifier'&&objects.includes(node.name)&&!allowed.has(node.start))get(labelAt(node.start)).hidden.push(node.name+' used other than by a plain property name');});
  const sorted=set=>[...set].sort();
  return Object.fromEntries([...per].map(([label,v])=>[label,{provides:sorted(v.provides),fills:Object.fromEntries(Object.entries(v.fills).sort()),calls:sorted(v.calls),vars:sorted(v.vars),sets:sorted(v.sets),redraws:sorted(v.redraws),varCalls:v.varCalls,varReads:v.varReads,writes:v.writes,otherUses:v.otherUses,memberReads:v.memberReads,taken:v.taken,whole:v.whole,factories:v.factories,factoryCalls:v.factoryCalls,declares:v.declares,hidden:v.hidden}]));
}

// The source text of each embedded function, as the exported player receives it through toString().
export function embeddedSources(read){
  const script=productScript(read),{top}=closureReferences(script);
  return Object.fromEntries(embeddedFunctions.map(name=>{const d=top.get(name);return [name,script.text.slice(d.start,d.end)];}));
}

// Issues against the boundary declarations: an undeclared use, a declared use that nothing uses, a src/js file
// without a declaration or a declaration without a file, and an embedded function using a closure name.
export function boundaryIssues(analysis,declarations){
  // How the sources are laid out comes first: a cut function the analysis cannot read makes its files' declarations look
  // stale, and its cause is read before those.
  const issues=[...(analysis.splitIssues??[])];
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
  // One way (AUDIT.md「ソースの境界」): a file uses only its own group and the groups before it in src/akari.html, through
  // a top-level name or a family's calls; it reaches a group after it only by a redraw request, which that later file
  // fills. A group is one file, or the files of a module whose parts use each other (sourceGroup); a group's files come
  // together.
  const group=f=>sourceGroup(f,analysis.files,analysis.extensionHosts),groups=[...new Set(analysis.files.map(group))],rank=new Map(groups.map((g,i)=>[g,i]));
  const before=(a,b)=>group(a)!==group(b)&&rank.get(group(a))<rank.get(group(b));
  for(const g of groups){const at=analysis.files.map((f,i)=>group(f)===g?i:-1).filter(i=>i>=0);if(at.at(-1)-at[0]+1!==at.length)issues.push('the files of '+g+' do not come together in src/akari.html');}
  for(const file of sources)for(const to of Object.keys(analysis.uses[file]??{}))if(group(to)!==group(file)&&!before(to,file))issues.push(file+' uses '+to+', which comes after it ('+analysis.uses[file][to].slice(0,5).join(', ')+')');
  for(const family of factoryFamilies)issues.push(...familyIssues(family,analysis.interfaces[family.vars]??{},declarations,sources,group,before));
  for(const o of analysis.opaque??[])issues.push(o);
  // A cut function's files use each other one way also inside one group (between groups, the rule above holds already).
  const backward=new Map();for(const b of analysis.splitBackward??[])if(group(b.to)===group(b.from))(backward.get(b.from+' '+b.to)??backward.set(b.from+' '+b.to,{...b,names:new Set()}).get(b.from+' '+b.to)).names.add(b.name);
  for(const b of backward.values())issues.push(b.from+' uses '+b.to+', which comes after it ('+[...b.names].sort().slice(0,5).join(', ')+')');
  if(JSON.stringify(analysis.embeddedThroughToString)!==JSON.stringify([...embeddedFunctions].sort()))issues.push('the product embeds '+analysis.embeddedThroughToString.join(', ')+' through toString(); the embedded function list names '+[...embeddedFunctions].sort().join(', '));
  return issues;
}

// One family's shared state and calls: each file declares what it registers and uses; every name used is registered by
// exactly one file; nothing reaches the three objects other than by a plain property name.
function familyIssues(family,interfaces,declarations,sources,group,before){
  const issues=[],{vars,calls,redraw}=family;
  const registeredBy=new Map();
  for(const [file,i]of Object.entries(interfaces))for(const n of i.provides)registeredBy.set(n,[...(registeredBy.get(n)||[]),file]);
  for(const [n,list]of registeredBy)if(list.length>1)issues.push(calls+'.'+n+' is registered by '+list.join(' and '));
  const calledAnywhere=new Set(Object.values(interfaces).flatMap(i=>i.calls));
  for(const [n,list]of registeredBy)if(!calledAnywhere.has(n))issues.push(list[0]+' registers '+calls+'.'+n+' but nothing calls it');
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  // The members read of a field that holds the whole parameter, from every file (declared once, in the shell's record).
  const wholeFields=new Set(Object.values(interfaces).flatMap(i=>i.whole??[]));
  const wholeReadsAll=[...new Set(Object.values(interfaces).flatMap(i=>(i.memberReads??[]).filter(m=>wholeFields.has(m.split('.')[0]))))];
  const declaredTaken=new Set(declarations[family.shell]?.[vars+'Taken']??[]);
  for(const [file,i]of Object.entries(interfaces))for(const m of new Set((i.memberReads??[]).filter(m=>wholeFields.has(m.split('.')[0])))){
    if(objectNames.has(m.split('.')[1]))issues.push(file+' reads '+vars+'.'+m+', a name every object has, from the parameter of '+family.shellFunction);
    else if(!declaredTaken.has(m))issues.push(file+' reads '+vars+'.'+m+', which the boundary record of '+family.shell+' does not declare in '+vars+'Taken');
  }
  for(const file of sources){
    const actual=interfaces[file]??{provides:[],calls:[],vars:[],redraws:[],fills:{},hidden:[]},declared=declarations[file]??{};
    const wholeReads=(actual.whole??[]).length?wholeReadsAll:[];
    const dc=declared[calls]??{},dv=declared[vars]??[],dr=declared[redraw]??{};
    for(const h of actual.hidden)issues.push(file+': '+h);
    for(const n of actual.calls)if(!registeredBy.has(n))issues.push(file+' calls '+calls+'.'+n+' that no file registers');
    if(!same(actual.provides,dc.provides??[]))issues.push(file+' registers '+calls+' '+JSON.stringify(actual.provides)+' but declares '+JSON.stringify(dc.provides??[]));
    if(!same(actual.calls,dc.uses??[]))issues.push(file+' calls '+calls+' '+JSON.stringify(actual.calls.filter(n=>!(dc.uses??[]).includes(n)))+' undeclared, '+JSON.stringify((dc.uses??[]).filter(n=>!actual.calls.includes(n)))+' declared but unused');
    const dt=declared[vars+'Taken']??[],at=[...(actual.taken??[]),...wholeReads].sort();
    if(!same(at,dt))issues.push(file+' takes '+vars+' '+JSON.stringify(at)+' from its parameter but declares '+JSON.stringify(dt));
    if(!same(actual.vars,dv))issues.push(file+' uses '+vars+' '+JSON.stringify(actual.vars.filter(n=>!dv.includes(n)))+' undeclared, '+JSON.stringify(dv.filter(n=>!actual.vars.includes(n)))+' declared but unused');
    if(!same(actual.redraws??[],dr.requests??[]))issues.push(file+' calls '+redraw+' '+JSON.stringify((actual.redraws??[]).filter(n=>!(dr.requests??[]).includes(n)))+' undeclared, '+JSON.stringify((dr.requests??[]).filter(n=>!(actual.redraws??[]).includes(n)))+' declared but unused');
    if(!same(actual.fills??{},dr.fills??{}))issues.push(file+' fills '+redraw+' '+JSON.stringify(actual.fills??{})+' but declares '+JSON.stringify(dr.fills??{}));
    for(const n of actual.calls){const from=registeredBy.get(n)?.[0];if(from&&group(from)!==group(file)&&!before(from,file))issues.push(file+' calls '+calls+'.'+n+' of '+from+', which comes after it');}
  }
  const requestedBy=new Map(),filledBy=new Map();
  for(const [file,i]of Object.entries(interfaces)){for(const s of i.redraws??[])requestedBy.set(s,[...(requestedBy.get(s)||[]),file]);for(const s of Object.keys(i.fills??{}))filledBy.set(s,[...(filledBy.get(s)||[]),file]);}
  for(const [s,files]of requestedBy)if(!filledBy.has(s))issues.push(redraw+'.'+s+' is called by '+files.join(', ')+' but no file fills it');
  for(const [s,files]of filledBy){
    if(files.length>1)issues.push(redraw+'.'+s+' is filled by '+files.join(' and '));
    if(!requestedBy.has(s))issues.push(files[0]+' fills '+redraw+'.'+s+' but nothing calls it');
    for(const r of requestedBy.get(s)??[])if(!before(r,files[0]))issues.push(r+' calls '+redraw+'.'+s+', which '+files[0]+' fills; the filling file must come after it');
  }
  // State: every name read is assigned somewhere; a function kept in the state by a later file is called only for what it
  // does, never for its result.
  const setBy=new Map();for(const [file,i]of Object.entries(interfaces))for(const n of i.sets??[])setBy.set(n,[...(setBy.get(n)||[]),file]);
  for(const n of new Set(Object.values(interfaces).flatMap(i=>i.vars??[])))if(!setBy.has(n))issues.push(vars+'.'+n+' is read but no file assigns it');
  // A function kept in the state: a name some file calls (or calls through a local copy), or assigns a function (or a name
  // that may hold one, or a field that is one).
  const writes=Object.entries(interfaces).flatMap(([file,i])=>(i.writes??[]).map(w=>({...w,file})));
  const fnVars=new Set([...Object.values(interfaces).flatMap(i=>(i.varCalls??[]).map(c=>c.name)),...writes.filter(w=>w.fn).map(w=>w.name)]);
  for(let grew=true;grew;){grew=false;for(const w of writes)if(!fnVars.has(w.name)&&w.copies.some(c=>fnVars.has(c))){fnVars.add(w.name);grew=true;}}
  // Who supplies it: every file that assigns it a value that is not plainly something other than a function, and that is
  // not the shell's parameter (the caller's value). Clearing a field (null, false, …) or keeping a number in it supplies
  // nothing.
  const suppliedBy=new Map();for(const w of writes)if(!w.notFn&&!w.input)suppliedBy.set(w.name,[...new Set([...(suppliedBy.get(w.name)||[]),w.file])]);
  // The fields the shell takes from its parameter are written only there, and a field that holds the whole parameter is
  // used only by reading or calling its members.
  const taken=new Set(Object.values(interfaces).flatMap(i=>i.taken??[])),whole=new Set(Object.values(interfaces).flatMap(i=>i.whole??[]));
  for(const w of writes)if(taken.has(w.name)&&!w.input)issues.push(w.file+' writes '+vars+'.'+w.name+', which '+family.shellFunction+' takes from its parameter; it is written only there');
  for(const [file,i]of Object.entries(interfaces))for(const n of new Set(i.otherUses??[]))if(whole.has(n))issues.push(file+' uses '+vars+'.'+n+' other than by reading or calling its members by plain names; it holds the parameter of '+family.shellFunction);
  for(const [file,i]of Object.entries(interfaces))for(const c of i.varCalls??[])if(!c.statement)for(const w of suppliedBy.get(c.name)??[])if(before(file,w))issues.push(file+' uses the result of '+vars+'.'+c.name+'(), which '+w+' (a later file) assigns');
  // Nor is such a function handed on as a value (kept in a name, passed, returned, bound), where a call of it could no
  // longer be seen: a read of it only decides (a test, a comparison). A file that puts in a function of its own and
  // hands it on keeps it in a local name and hands on that name.
  for(const [file,i]of Object.entries(interfaces))for(const r of i.varReads??[])if(!r.test&&fnVars.has(r.name))for(const w of suppliedBy.get(r.name)??[])if(before(file,w))issues.push(file+' hands on '+vars+'.'+r.name+' as a value, a function '+w+' (a later file) assigns');
  // Each factory is declared once and called once; each object is declared once, in the shell function.
  const declaredFactories=Object.values(interfaces).flatMap(i=>i.factories??[]),calledFactories=Object.values(interfaces).flatMap(i=>i.factoryCalls??[]);
  for(const n of new Set([...declaredFactories,...calledFactories]))if(declaredFactories.filter(x=>x===n).length!==1||calledFactories.filter(x=>x===n).length!==1)issues.push(n+' is declared '+declaredFactories.filter(x=>x===n).length+' and called '+calledFactories.filter(x=>x===n).length+' times');
  const present=declaredFactories.length||calledFactories.length;
  for(const o of familyObjects(family)){const at=Object.entries(interfaces).flatMap(([file,i])=>(i.declares??[]).filter(x=>x===o).map(()=>file));
    if((present||at.length)&&!(at.length===1&&at[0]===family.shell))issues.push(o+' is declared '+at.length+' times'+(at.length?' ('+at.join(', ')+')':'')+'; it is declared once, in '+family.shellFunction+' ('+family.shell+')');}
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
    for(const {vars,calls,redraw}of factoryFamilies){
      if(record[vars+'Taken']!==undefined)assert.ok(sortedNames(record[vars+'Taken'])&&record[vars+'Taken'].every(n=>/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)?$/.test(n)),name+' lists sorted unique '+vars+'Taken (fields, and field.member for the whole parameter)');
      if(record[calls]!==undefined)assert.ok(sortedNames(record[calls].provides??[])&&sortedNames(record[calls].uses??[])&&Object.keys(record[calls]).every(k=>['provides','uses'].includes(k)),name+' lists sorted unique '+calls);
      if(record[vars]!==undefined)assert.ok(sortedNames(record[vars]),name+' lists sorted unique '+vars);
      if(record[redraw]!==undefined){const r=record[redraw];assert.ok(r&&typeof r==='object'&&Object.keys(r).every(k=>['requests','fills'].includes(k))&&sortedNames(r.requests??[])&&
        (r.fills===undefined||sortedNames(Object.keys(r.fills))&&Object.entries(r.fills).every(([slot,fn])=>typeof fn==='string'&&redrawSlot(fn)===slot)),name+' lists sorted '+redraw+' requests and fills named after their functions');}
    }
    assert.ok(Object.keys(record).every(k=>['schema','file','uses',...factoryFamilies.flatMap(f=>[...familyObjects(f),f.vars+'Taken'])].includes(k)),name+' has only known fields');
    declarations[record.file]=record;
  }
  return declarations;
}
