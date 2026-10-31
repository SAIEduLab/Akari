// Sizes and the split rule (AUDIT.md「ソースの境界」). A unit is a function of an application factory
// (src/js/11-app-*.js) or a closure top-level statement of any other src/js file. Split by the rule, the units the file's
// other units refer to move to a new file placed just before it, and the rest stay. The moved units never refer to the
// ones that stay, so the new file uses nothing after it and the order stays one way.
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {productScript,closureReferences,sourceUses,boundarySchema,boundaryFileFor} from './source-boundaries.mjs';

const require=createRequire(import.meta.url);
const parse=text=>require('@babel/parser').parse(text,{sourceType:'script',errorRecovery:false});
// The size at which a file is due to be split, in lines (AUDIT.md「ソースの境界」).
export const SOURCE_SPLIT_LINES=2000;
const factoryFile=/^src\/js\/11-app-[a-z0-9-]+\.js$/;
const lineCount=text=>text.replace(/\n$/,'').split('\n').length;
const functionStatement=s=>s.type==='FunctionDeclaration'||s.type==='VariableDeclaration'&&s.kind==='const'&&s.declarations.every(d=>d.id.type==='Identifier'&&['FunctionExpression','ArrowFunctionExpression'].includes(d.init?.type));
const declaredNames=s=>s.type==='FunctionDeclaration'||s.type==='ClassDeclaration'?(s.id?[s.id.name]:[]):s.type==='VariableDeclaration'?s.declarations.flatMap(d=>d.id.type==='Identifier'?[d.id.name]:[]):[];
const registration=(s,object)=>s.type==='ExpressionStatement'&&s.expression.type==='CallExpression'&&s.expression.callee.type==='MemberExpression'&&s.expression.callee.object.name==='Object'&&s.expression.callee.property.name==='assign'&&s.expression.arguments[0]?.name===object;

// The units of one file: [{start, end, names, text}] with positions in the file's own text, and the references between
// them (unit index -> set of unit indexes it refers to). Factory files resolve inside the factory body; other files
// resolve at the closure top level of the whole product.
function fileUnits(read,file){
  const text=read(file);
  if(factoryFile.test(file)){
    const prefix='(() => {',wrapped=prefix+text+'})();\n',ast=parse(wrapped),shift=-prefix.length;
    const top=ast.program.body[0].expression.callee.body.body;
    assert.ok(top.length===1&&top[0].type==='FunctionDeclaration'&&/^createApp[A-Z]\w*$/.test(top[0].id.name),file+' holds one application factory');
    const factory=top[0],body=factory.body,stmts=body.body.filter(s=>!registration(s,'appCalls')&&!registration(s,'appRedraw'));
    const units=stmts.map(s=>({start:s.start+shift,end:s.end+shift,names:declaredNames(s),node:s}));
    // References that resolve to the factory's own declarations, through a synthetic closure of its body.
    const open=body.start+1,synthetic=prefix+wrapped.slice(open,body.end-1)+'})();\n',offset=open-prefix.length+shift;
    const {refs}=closureReferences({text:synthetic,pieces:[{label:'x',start:0,end:synthetic.length}]});
    return {kind:'factory',text,factory,shift,units,refs:refs.map(r=>({at:r.at+offset,name:r.name}))};
  }
  assert.ok(file.startsWith('src/js/')&&!/^src\/js\/(00|12)-/.test(file),file+' is a src/js file that parses inside the closure');
  assert.ok(!/^\/\/ @portable /m.test(text),file+' embeds a portable extension and is not split by the rule');
  const script=productScript(read),piece=script.pieces.filter(p=>p.label===file);assert.equal(piece.length,1,file+' is one piece of the product script');
  const base=piece[0].start,ast=parse(script.text),closure=ast.program.body[0].expression.callee.body;
  const units=closure.body.filter(s=>s.start>=base&&s.end<=piece[0].end).map(s=>({start:s.start-base,end:s.end-base,names:declaredNames(s),node:s}));
  const {refs}=closureReferences(script);
  return {kind:'plain',text,units,refs:refs.filter(r=>r.at>=base&&r.at<piece[0].end).map(r=>({at:r.at-base,name:r.name}))};
}
// The dependency order of the units: blocks (units that refer to each other in a cycle stay together, in file order),
// each block after every block it refers to, ties in file order. Any prefix of this order uses nothing after it.
function dependencyOrder(f){
  const n=f.units.length,unitOf=at=>f.units.findIndex(u=>u.start<=at&&at<u.end),byName=new Map();f.units.forEach((u,i)=>u.names.forEach(nm=>byName.set(nm,i)));
  const out=f.units.map(()=>new Set());for(const r of f.refs){const from=unitOf(r.at),to=byName.get(r.name);if(to!==undefined&&from>=0&&from!==to)out[from].add(to);}
  let index=0;const idx=new Array(n),low=new Array(n),on=new Array(n).fill(false),stack=[],block=new Array(n),blocks=[];
  const visit=v=>{idx[v]=low[v]=index++;stack.push(v);on[v]=true;for(const w of out[v]){if(idx[w]===undefined){visit(w);low[v]=Math.min(low[v],low[w]);}else if(on[w])low[v]=Math.min(low[v],idx[w]);}
    if(low[v]===idx[v]){const b=[];let w;do{w=stack.pop();on[w]=false;block[w]=blocks.length;b.push(w);}while(w!==v);blocks.push(b.sort((x,y)=>x-y));}};
  for(let v=0;v<n;v++)if(idx[v]===undefined)visit(v);
  const needs=blocks.map(()=>new Set());blocks.forEach((b,k)=>{for(const v of b)for(const w of out[v])if(block[w]!==k)needs[k].add(block[w]);});
  const done=new Set(),order=[];
  while(order.length<blocks.length){const k=blocks.map((_,i)=>i).filter(i=>!done.has(i)&&[...needs[i]].every(j=>done.has(j))).sort((x,y)=>blocks[x][0]-blocks[y][0])[0];done.add(k);order.push(blocks[k]);}
  return order;
}
// The units of a file as {names, text} (for checking a split).
export const sourceUnits=(read,file)=>{const f=fileUnits(read,file);return f.units.map(u=>({names:u.names,text:f.text.slice(u.start,u.end)}));};
const unitLines=(f,i)=>lineCount(f.text.slice(f.units[i].start,f.units[i].end));
// Why a cut cannot be made without changing behaviour, or null. Only a function declaration is ready before the file
// runs (it is hoisted); every other unit (a const, even one bound to a function, a let, a class, a statement) is ready
// only once the file reaches it, and may be read while the file loads, also through another file of the group. Such
// units keep their order against each other, so a moved one must not have come after one that stays.
function splitBlocked(f,lower){
  if(!lower.size||lower.size===f.units.length)return 'its units form one cycle';
  // A factory runs nothing while the file loads: its body is function declarations, run once initApp calls it.
  if(f.kind==='factory')return null;
  const ordered=u=>u.node.type!=='FunctionDeclaration';
  const firstStaying=f.units.findIndex((u,i)=>!lower.has(i)&&ordered(u));
  const late=f.units.find((u,i)=>lower.has(i)&&ordered(u)&&firstStaying>=0&&i>firstStaying);
  return late?(late.names.join(',')||'a statement')+' would move before '+(f.units[firstStaying].names.join(',')||'a statement')+', which was ready before it':null;
}
// The cut: among the prefixes of the dependency order (at block boundaries) that change no behaviour, the one whose
// lines are closest to half the units' lines.
function middleCut(f){
  const order=dependencyOrder(f),sizes=order.map(b=>b.reduce((s,i)=>s+unitLines(f,i),0)),total=sizes.reduce((s,x)=>s+x,0),cuts=[];
  let acc=0;for(let k=1;k<order.length;k++){acc+=sizes[k-1];cuts.push({k,d:Math.abs(acc-total/2)});}
  cuts.sort((a,b)=>a.d-b.d||a.k-b.k);
  let blocked=cuts.length?null:'its units form one cycle';
  for(const c of cuts){const lower=new Set(order.slice(0,c.k).flat()),why=splitBlocked(f,lower);if(!why)return {order,sizes,lower,blocked:null};blocked??=why;}
  return {order,sizes,lower:new Set(),blocked};
}
// Files the rule does not split: 00 and 12 open and close the closure, and a file that embeds a portable extension.
const exempt=(read,file)=>/^src\/js\/(00|12)-/.test(file)?'it opens or closes the closure':/^\/\/ @portable /m.test(read(file))?'it embeds a portable extension':null;
// Per src/js file: its lines, its units, its largest unit or cycle of units, and whether it is due to be split: over the
// size, every unit and cycle fits in it (so splitting can bring each part under it), and a cut changes no behaviour.
// A file the rule should split but cannot read is an error, never a quiet exemption.
export function sourceSizes(read,files){
  return files.filter(f=>f.startsWith('src/js/')).map(file=>{
    const lines=lineCount(read(file)),why=exempt(read,file);
    if(why)return {file,lines,units:null,largest:null,blocked:'not split by the rule: '+why,due:false};
    const f=fileUnits(read,file),cut=middleCut(f),largest=Math.max(0,...cut.sizes);
    return {file,lines,units:f.units.length,largest,blocked:cut.blocked,due:lines>SOURCE_SPLIT_LINES&&largest<=SOURCE_SPLIT_LINES&&!cut.blocked};
  });
}

// The boundary record of every src/js file, as the analysis finds it (what audit/boundaries/ must hold).
export function boundaryRecords(analysis){
  const out={};
  for(const file of analysis.files.filter(f=>f.startsWith('src/js/'))){
    const i=analysis.interfaces[file],rec={schema:boundarySchema,file,uses:Object.keys(analysis.uses[file]??{}).sort()};
    if(i&&(i.provides.length||i.calls.length))rec.appCalls={provides:i.provides,uses:i.calls};
    if(i&&i.vars.length)rec.appVars=i.vars;
    if(i&&(i.redraws.length||Object.keys(i.fills).length)){rec.appRedraw={};if(i.redraws.length)rec.appRedraw.requests=i.redraws;if(Object.keys(i.fills).length)rec.appRedraw.fills=i.fills;}
    out[boundaryFileFor(file)]=JSON.stringify(rec,null,2)+'\n';
  }
  return out;
}

// The split of one file by the rule: {created, moved, kept, changes: {path: text}} (src files, the template, and every
// boundary record). Nothing is written here.
export function splitSource(read,file,existing=()=>false){
  const why=exempt(read,file);assert.ok(!why,file+' is not split by the rule: '+why);
  const f=fileUnits(read,file),{lower:lowerSet,blocked}=middleCut(f);
  assert.ok(!blocked,file+' cannot be split by the rule: '+blocked);
  const lower=f.units.filter((_,i)=>lowerSet.has(i)),upper=f.units.filter((_,i)=>!lowerSet.has(i));
  let created=file.replace(/\.js$/,'-core.js');for(let n=2;existing(created);n++)created=file.replace(/\.js$/,'-core'+n+'.js');
  // Each unit takes the gap before it (its comments) along; the first unit of a plain file leaves the file's head behind.
  const changes={},gapStart=u=>{const i=f.units.indexOf(u);return i===0?(f.kind==='factory'?f.factory.body.start+1+f.shift:u.start):f.units[i-1].end;};
  const chunk=u=>f.text.slice(gapStart(u),u.end);
  const rule='  // '+'─'.repeat(72);
  if(f.kind==='plain'){
    changes[created]=rule+'\n  // '+path.posix.basename(created)+' — the first half of '+path.posix.basename(file)+' in dependency order, split off by the rule\n  // (AUDIT.md「ソースの境界」; node audit/split-source.mjs). It uses nothing in '+path.posix.basename(file)+'.\n'+rule+lower.map(u=>{const c=chunk(u);return c.startsWith('\n')?c:'\n'+c;}).join('')+'\n';
    let rest='';let pos=0;for(const u of f.units){if(lowerSet.has(f.units.indexOf(u))){rest+=f.text.slice(pos,gapStart(u));pos=u.end;}}
    rest+=f.text.slice(pos);changes[file]=rest;
  }else{
    const name=f.factory.id.name,newName=name+'Core'+(created.endsWith('-core.js')?'':created.match(/-core(\d+)\.js$/)[1]);
    const lowerNames=new Set(lower.flatMap(u=>u.names));
    // In what stays, a reference to a moved function goes through appCalls.
    const factoryAst=parse('(() => {'+f.text+'})();\n');const shorthand=new Set();
    const walk=n=>{if(!n||typeof n!=='object')return;if(Array.isArray(n))return n.forEach(walk);if(n.type==='ObjectProperty'&&n.shorthand&&n.value?.type==='Identifier')shorthand.add(n.value.start+f.shift);for(const [k,v]of Object.entries(n))if(!['loc','start','end','extra'].includes(k)&&v&&typeof v==='object')walk(v);};
    walk(factoryAst.program);
    const edits=f.refs.filter(r=>lowerNames.has(r.name)&&upper.some(u=>u.start<=r.at&&r.at<u.end));
    const rewrite=(start,end)=>{let out='',pos=start;for(const r of edits.filter(r=>r.at>=start&&r.at<end).sort((a,b)=>a.at-b.at)){out+=f.text.slice(pos,r.at)+(shorthand.has(r.at)?r.name+': appCalls.'+r.name:'appCalls.'+r.name);pos=r.at+r.name.length;}return out+f.text.slice(pos,end);};
    const regs=f.factory.body.body.filter(s=>registration(s,'appCalls')).flatMap(s=>s.expression.arguments[1].properties.map(p=>p.value.name));
    const fills=Object.fromEntries(f.factory.body.body.filter(s=>registration(s,'appRedraw')).flatMap(s=>s.expression.arguments[1].properties.map(p=>[p.key.name,p.value.name])));
    const usedByUpper=new Set(edits.map(r=>r.name));
    const lowerRegs=[...lowerNames].filter(n=>regs.includes(n)||usedByUpper.has(n)).sort(),upperRegs=regs.filter(n=>!lowerNames.has(n)).sort();
    const lowerFills=Object.entries(fills).filter(([,fn])=>lowerNames.has(fn)),upperFills=Object.entries(fills).filter(([,fn])=>!lowerNames.has(fn));
    const block=(object,lines)=>lines.length?['    Object.assign('+object+', {',...lines.map(l=>'      '+l+','),'    });']:[];
    const headText=f.text.slice(0,f.factory.start+f.shift),open=f.factory.body.start+1+f.shift;
    const signature=f.text.slice(f.factory.start+f.shift,open);
    changes[created]=[rule,'  // '+path.posix.basename(created)+' — the first half of '+path.posix.basename(file)+' in dependency order, split off by the rule',
      '  // (AUDIT.md「ソースの境界」; node audit/split-source.mjs). It uses nothing in '+path.posix.basename(file)+'.',rule,
      signature.replace(name,newName)+lower.map(chunk).join('').replace(/\s+$/,''),...block('appCalls',lowerRegs),...block('appRedraw',lowerFills.map(([s,fn])=>s+': '+fn)),'  }',''].join('\n');
    changes[file]=[headText+signature+upper.map(u=>rewrite(gapStart(u),u.end)).join('').replace(/\s+$/,''),...block('appCalls',upperRegs),...block('appRedraw',upperFills.map(([s,fn])=>s+': '+fn)),'  }',''].join('\n');
    const shell='src/js/11-application.js',call='    '+name+'(appVars, appCalls, appRedraw);\n',shellText=read(shell);
    assert.equal(shellText.split(call).length,2,shell+' calls '+name+' once');
    changes[shell]=shellText.replace(call,'    '+newName+'(appVars, appCalls, appRedraw);\n'+call);
  }
  const tpl='src/akari.html',tplText=read(tpl),line='<!-- @include '+file.slice(4)+' -->\n';
  assert.equal(tplText.split(line).length,2,tpl+' includes '+file+' once');
  changes[tpl]=tplText.replace(line,'<!-- @include '+created.slice(4)+' -->\n'+line);
  const after=p=>p in changes?changes[p]:read(p);
  Object.assign(changes,boundaryRecords(sourceUses(after)));
  return {created,moved:lower.flatMap(u=>u.names),kept:upper.flatMap(u=>u.names),changes};
}
