import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
// CI supplies the pinned parser through NODE_PATH. Local callers may install it normally.
const {parse}=require('@babel/parser');

// Every finite surface table that decides which sentence forms the product accepts.
// Exported tables are read from the running product; the others are read from the
// product script itself, so a table that is added, removed or reshaped is noticed.
export const sentenceFormTableNames=Object.freeze(['sentence','condition','te','polite','heading','until-negative','ending']);
// Entries of these tables are literals in the product script. A claim on such an entry
// is proven by neutralising that one literal in a copy of the product: the claimed case
// must then stop producing its expected tree. A sentence that another reader accepts in
// the same way (a dead or redundant entry) therefore never counts as coverage.
export const ablatedTableNames=Object.freeze(['te','polite','heading','until-negative','ending']);
export const sentenceFormNegativeIds=Object.freeze([
  'product-addition-detected','product-removal-detected','table-missing-detected','table-shape-detected',
  'duplicate-form-detected','duplicate-case-detected','no-claim-detected','ast-mismatch-detected',
  'parse-failure-detected','missing-evidence-detected','unmatched-pattern-detected','shadowed-pattern-detected',
  'absent-node-detected','unmatched-surface-detected','condition-context-detected','condition-longer-surface-detected',
  'unused-entry-detected','other-reader-detected',
  'unreachable-reachable-detected','unreachable-claimed-detected','unreachable-unknown-detected','unreachable-evidence-detected',
  'unreachable-duplicate-detected',
]);
// The gate validator rejects these report mutations; the runner proves each one.
export const sentenceFormValidatorNegativeIds=Object.freeze([
  'report-failed-status','report-failure-listed','report-missing-form','report-unknown-claim','report-failed-case',
  'report-unreachable-covered','report-unreachable-unknown','report-negative-missing','report-negative-accepted','report-snapshot',
]);

const ignoredKeys=new Set(['sourceSpan','endLine','inlineComment','elseComment']);
// Product syntax trees without source positions, source text, comments or generated link names.
export function normalizeSyntax(ast) {
  const links=new Map();
  const visit=value=>{
    if(Array.isArray(value))return value.map(visit);
    if(!value||typeof value!=='object')return value;
    const out={};
    for(const [key,child] of Object.entries(value)){
      if(ignoredKeys.has(key)||(key==='source'&&value.kind==='Script'))continue;
      if(key==='broadcastRef'&&typeof child==='string'){if(!links.has(child))links.set(child,'ref#'+(links.size+1));out[key]=links.get(child);continue;}
      out[key]=visit(child);
    }
    return out;
  };
  return visit(JSON.parse(JSON.stringify(ast)));
}

// The product surface protection: quoted text, exact names, parentheses and
// comments never take part in surface matching. Unbalanced text has no mask.
export function surfaceMask(text) {
  const chars=text.split(''),stack=[];let quote='';
  for(let i=0;i<chars.length;i++){
    const ch=chars[i];
    if(quote){chars[i]='\u0001';if((quote==='」'||quote==='』')&&ch==='\\'){chars[++i]='\u0001';continue;}if(ch===quote)quote='';continue;}
    if(ch==='※'){for(let j=i;j<chars.length;j++)chars[j]='\u0001';break;}
    if(ch==='「'||ch==='『'||ch==='【'){quote=ch==='「'?'」':ch==='『'?'』':'】';chars[i]='\u0001';continue;}
    if(ch==='（'||ch==='［'){stack.push(ch==='（'?'）':'］');chars[i]='\u0001';}
    else if(ch==='）'||ch==='］'){if(stack.pop()!==ch)return null;chars[i]='\u0001';}
    else if(stack.length)chars[i]='\u0001';
  }
  return quote||stack.length?null:chars.join('');
}

export function productScript(html) {
  const start=html.indexOf('<script>'),end=html.lastIndexOf('</script>');
  if(start<0||end<=start)throw Error('product script missing');
  return html.slice(start+8,end);
}

function walk(node,visit) {
  if(!node||typeof node!=='object')return;
  if(typeof node.type==='string'&&visit(node)===false)return;
  for(const [key,value] of Object.entries(node)){
    if(['loc','start','end','extra','comments','leadingComments','trailingComments','innerComments'].includes(key))continue;
    if(Array.isArray(value))for(const child of value)walk(child,visit);else if(value&&typeof value==='object')walk(value,visit);
  }
}
function find(root,test) {let found=null;walk(root,node=>{if(found)return false;if(test(node)){found=node;return false;}});return found;}
function literal(node) {
  switch(node?.type){
    case 'StringLiteral':case 'NumericLiteral':return node.value;
    case 'NullLiteral':return null;
    case 'RegExpLiteral':return new RegExp(node.pattern,node.flags);
    case 'ArrayExpression':return node.elements.map(literal);
    default:throw Error('non-literal table entry '+(node?.type||'missing'));
  }
}
const span=node=>({start:node.start,end:node.end,type:node.type});
const declared=(root,name)=>find(root,node=>node.type==='VariableDeclarator'&&node.id?.type==='Identifier'&&node.id.name===name);
const declaredFunction=(root,name)=>find(root,node=>node.type==='FunctionDeclaration'&&node.id?.name===name);
function rowsOf(node,label) {
  if(node?.type!=='ArrayExpression'||!node.elements.length||node.elements.some(row=>row?.type!=='ArrayExpression'))throw Error(label+' shape changed');
  return node.elements;
}
function pairs(rows,label) {
  return rows.map(row=>{
    const values=literal(row);
    if(values.length!==2||values.some(x=>typeof x!=='string'))throw Error(label+' must be string pairs');
    return {values,literal:span(row.elements[0])};
  });
}

// Static tables keep their product order: the product chooses the first match.
// Each row records the source range of the literal that decides whether it matches.
export function readStaticTables(script) {
  const ast=parse(script,{sourceType:'script',errorRecovery:false}),tables={};
  const te=declared(ast,'SENTENCE_TE_FORMS');if(!te)throw Error('te table missing');
  const teRows=find(te.init,node=>node.type==='ArrayExpression'&&node.elements.length>0&&node.elements.every(x=>x?.type==='ArrayExpression'));
  tables.te=pairs(rowsOf(teRows,'te table'),'te table').map(({values:[te,plain],literal})=>({te,plain,literal}));
  const roleReader=declaredFunction(ast,'readRoleStatement'),polite=roleReader&&declared(roleReader,'polite');
  if(!polite)throw Error('polite table missing');
  tables.polite=pairs(rowsOf(polite.init,'polite table'),'polite table').map(({values:[polite,plain],literal})=>({polite,plain,literal}));
  const headingReader=declaredFunction(ast,'readSentenceHeading'),headings=headingReader&&declared(headingReader,'forms');
  if(!headings)throw Error('heading table missing');
  tables.heading=rowsOf(headings.init,'heading table').map(row=>{
    const values=literal(row);
    if(!(values[0] instanceof RegExp)||typeof values[1]!=='string'||values.slice(2).some(x=>typeof x!=='number'))throw Error('heading table shape changed');
    return {pattern:values[0],event:values[1],literal:span(row.elements[0])};
  });
  const candidates=declaredFunction(ast,'conditionFormCandidates'),negative=candidates&&declared(candidates,'negative');
  const negativeTable=negative&&find(negative.init,node=>node.type==='ObjectExpression');
  if(!negativeTable)throw Error('until negative table missing');
  tables['until-negative']=negativeTable.properties.map(p=>{
    if(p.type!=='ObjectProperty'||p.computed||p.value.type!=='StringLiteral')throw Error('until negative table shape changed');
    return {plain:p.key.type==='StringLiteral'?p.key.value:p.key.name,surface:p.value.value,literal:span(p.value)};
  });
  // The alternative endings are the for-of tables destructured as [ending, kind, ...].
  const loops=[];walk(ast,node=>{if(node.type==='ForOfStatement'&&node.left?.declarations?.[0]?.id?.type==='ArrayPattern'&&node.left.declarations[0].id.elements[0]?.name==='ending'&&node.right?.type==='ArrayExpression')loops.push(node.right);});
  if(!loops.length)throw Error('ending tables missing');
  tables.ending=loops.flatMap(rows=>rowsOf(rows,'ending table').map(row=>{
    const values=literal(row);
    if(typeof values[0]!=='string'||typeof values[1]!=='string')throw Error('ending table shape changed');
    return {ending:values[0],kind:values[1],literal:span(row.elements[0])};
  }));
  return tables;
}

// Form IDs from all tables. A duplicate ID inside the catalog is itself a failure.
export function sentenceFormTables(api,script) {
  const tables=readStaticTables(script),forms=new Map(),failures=[];
  const add=(id,info)=>{if(forms.has(id))failures.push('duplicate-form:'+id);forms.set(id,{id,...info});};
  [...api.SENTENCE_FORMS].forEach((form,index)=>add('sentence:'+form.id,{table:'sentence',index,kind:form.kind,op:form.op??null,pattern:form.pattern||null}));
  for(const record of api.CONDITION_FORMS)for(const [slot,surface] of Object.entries(record))add('condition:'+record.plain+'/'+slot,{table:'condition',slot,surface});
  tables.te.forEach((row,index)=>add('te:'+row.te,{table:'te',index,surface:row.te,literal:row.literal}));
  tables.polite.forEach((row,index)=>add('polite:'+row.polite,{table:'polite',index,surface:row.polite,literal:row.literal}));
  tables.heading.forEach((row,index)=>add('heading:'+row.event+'/'+row.pattern.source,{table:'heading',index,event:row.event,pattern:row.pattern,literal:row.literal}));
  for(const row of tables['until-negative'])add('until-negative:'+row.plain,{table:'until-negative',surface:row.surface,literal:row.literal});
  for(const row of tables.ending)add('ending:'+row.ending,{table:'ending',surface:row.ending,kind:row.kind,literal:row.literal});
  const counts=Object.fromEntries(sentenceFormTableNames.map(name=>[name,[...forms.values()].filter(f=>f.table===name).length]));
  return {forms,failures,counts};
}

// The product copy in which exactly this entry can no longer match any sentence.
export function ablateEntry(script,form) {
  if(!ablatedTableNames.includes(form.table)||!form.literal)throw Error('entry is not ablated: '+form.id);
  const {start,end,type}=form.literal,text=script.slice(start,end);
  const replacement=type==='RegExpLiteral'?'/(?!)/d':type==='StringLiteral'?"'\\u0000'":null;
  if(!replacement||!text||text===replacement)throw Error('ablation target changed: '+form.id);
  return script.slice(0,start)+replacement+script.slice(end);
}

// A condition slot is proven only in the sentence position that uses it.
const followers={plain:['か、'],plainNo:['か、'],andYes:['、'],andNo:['、'],ifYes:['、'],ifNo:['、'],whileYes:['、'],untilYes:['、','待つ']};
function nodes(value,out=[]) {
  if(Array.isArray(value))for(const child of value)nodes(child,out);
  else if(value&&typeof value==='object'){if(typeof value.kind==='string')out.push(value);for(const child of Object.values(value))nodes(child,out);}
  return out;
}
const hasNode=(ast,kind,op)=>nodes(ast).some(node=>node.kind===kind&&(op==null||node.op===op));

// The surface half of a proof: the clause is in the case and shows this entry's surface
// where the product reads it. Ablated tables prove the other half by ablation.
function proveSurface(clause,testCase,form,forms,actual) {
  if(typeof clause!=='string'||!clause||!testCase.source.includes(clause))return 'missing-evidence';
  const mask=surfaceMask(clause);if(mask===null)return 'missing-evidence';
  switch(form.table){
    case 'sentence':
      // Records without a pattern are read by the block, motion, input and rule readers.
      if(!form.pattern)return hasNode(actual,form.kind,form.op)?null:'absent-node';
      if(!form.pattern.exec(mask))return 'unmatched-pattern';
      // The product tries the patterned records in order and keeps the first match.
      return [...forms.values()].some(other=>other.table==='sentence'&&other.pattern&&other.index<form.index&&other.pattern.exec(mask))?'shadowed-pattern':null;
    case 'condition':
      if(!mask.endsWith(form.surface))return 'unmatched-surface';
      // The product prefers the longest accepted ending of the condition.
      if([...forms.values()].some(other=>other.table==='condition'&&other.surface.length>form.surface.length&&mask.endsWith(other.surface)))return 'condition-longer-surface';
      return (followers[form.slot]||[]).some(next=>testCase.source.includes(clause+next))?null:'condition-context';
    case 'heading':
      return form.pattern.exec(mask)?null:'unmatched-pattern';
    case 'te':case 'polite':case 'until-negative':case 'ending':
      return mask.endsWith(form.surface)?null:'unmatched-surface';
    default:return 'unknown-table';
  }
}

function parseCase(api,testCase,symbolsFor) {
  return normalizeSyntax(api.parseScript(testCase.source,symbolsFor(api),{...(testCase.context||{})}));
}
// true when the product copy still reads the case to its expected tree.
function unchangedIn(productApi,testCase,symbolsFor) {
  try{return isDeepStrictEqual(parseCase(productApi,testCase,symbolsFor),testCase.expected);}
  catch(error){if(!error?.code)throw error;return false;}
}

// Coverage, meaning and reachability of every finite sentence form.
// variantFor(form) returns the product API loaded from ablateEntry(script, form).
// `unreachable` declares table entries that no sentence can reach; each declaration is
// proven by its witness case and is reported, never silently counted as coverage.
export function checkSentenceFormCoverage(api,catalog,cases,{symbolsFor,variantFor,unreachable=[]}) {
  const failures=[...catalog.failures],results=[],claimed=new Set(),caseIds=new Set(),variants=new Map(),passed=new Set();
  const variant=form=>{
    if(!variants.has(form.id)){let value;try{value={api:variantFor(form)};}catch(error){value={error:String(error?.message||error)};}variants.set(form.id,value);}
    return variants.get(form.id);
  };
  for(const testCase of cases){
    if(caseIds.has(testCase.id))failures.push('duplicate-case:'+testCase.id);caseIds.add(testCase.id);
    let actual=null,matches=false,status='PASS';
    const fail=text=>{failures.push(text);status='FAIL';};
    try{actual=parseCase(api,testCase,symbolsFor);}
    catch(error){if(!error?.code)throw error;fail('parse:'+testCase.id+':'+error.code);}
    // Only the case ID is reported: expected trees are written from the language
    // contract, never copied from a product tree.
    if(actual){matches=isDeepStrictEqual(actual,testCase.expected);if(!matches)fail('ast:'+testCase.id);}
    const claims=Object.entries(testCase.claims||{});
    if(!claims.length)fail('no-claim:'+testCase.id);
    for(const [formId,clause] of claims){
      const form=catalog.forms.get(formId);
      if(!form){fail('unknown:'+formId+':'+testCase.id);continue;}
      claimed.add(formId);
      const problem=actual?proveSurface(clause,testCase,form,catalog.forms,actual):'parse';
      if(problem){fail(problem+':'+testCase.id+':'+formId);continue;}
      if(!matches||!ablatedTableNames.includes(form.table))continue;
      const ablated=variant(form);
      if(ablated.error){fail('ablation:'+testCase.id+':'+formId+':'+ablated.error);continue;}
      if(unchangedIn(ablated.api,testCase,symbolsFor))fail('not-load-bearing:'+testCase.id+':'+formId);
    }
    if(status==='PASS')passed.add(testCase.id);
    results.push({id:testCase.id,status,claims:claims.map(([formId])=>formId)});
  }
  // A declared entry must be a static table literal, unclaimed, shown by a passing
  // witness clause that another claimed form reads, and still unchanged without it.
  const declaredForms=new Set(),proven=[];
  for(const declaration of unreachable){
    const id=declaration.form,form=catalog.forms.get(id),testCase=cases.find(c=>c.id===declaration.case);
    if(declaredForms.has(id)){failures.push('duplicate-unreachable:'+id);continue;}declaredForms.add(id);
    if(!form){failures.push('unknown:'+id+':unreachable');continue;}
    if(claimed.has(id)){failures.push('unreachable-claimed:'+id);continue;}
    if(!ablatedTableNames.includes(form.table)){failures.push('unreachable-table:'+id);continue;}
    const reader=catalog.forms.get(declaration.readBy);
    const evidence=testCase&&passed.has(testCase.id)&&reader&&declaration.readBy!==id&&testCase.claims?.[declaration.readBy]===declaration.clause&&
      proveSurface(declaration.clause,testCase,form,catalog.forms,null)===null;
    if(!evidence){failures.push('unreachable-evidence:'+id);continue;}
    const ablated=variant(form);
    if(ablated.error){failures.push('ablation:'+declaration.case+':'+id+':'+ablated.error);continue;}
    if(!unchangedIn(ablated.api,testCase,symbolsFor)){failures.push('reachable:'+id+':'+declaration.case);continue;}
    proven.push({form:id,case:declaration.case,readBy:declaration.readBy});
  }
  for(const formId of catalog.forms.keys())if(!claimed.has(formId)&&!declaredForms.has(formId))failures.push('missing:'+formId);
  return {failures,results,unreachable:proven};
}

// Core report shape. The gate validator additionally requires the validator negatives.
export function verifySentenceFormReport(report,inputs) {
  assert.equal(report.schema,'akari-sentence-form-coverage-v1');
  assert.equal(report.status,'PASS');assert.deepEqual(report.snapshot,inputs);
  assert.deepEqual(report.failures,[]);
  assert.deepEqual(Object.keys(report.tables),[...sentenceFormTableNames]);
  for(const name of sentenceFormTableNames)assert.ok(Number.isSafeInteger(report.tables[name])&&report.tables[name]>0,name);
  assert.ok(Array.isArray(report.formIds)&&report.formIds.length>0);
  assert.equal(new Set(report.formIds).size,report.formIds.length);
  const tableOf=id=>id.slice(0,id.indexOf(':'));
  for(const name of sentenceFormTableNames)assert.equal(report.formIds.filter(id=>tableOf(id)===name).length,report.tables[name],name);
  assert.ok(report.formIds.every(id=>sentenceFormTableNames.includes(tableOf(id))));
  const ids=report.results.map(row=>row.id);assert.equal(new Set(ids).size,ids.length);assert.ok(ids.length>0);
  const known=new Set(report.formIds),covered=new Set();
  for(const row of report.results){assert.equal(row.status,'PASS',row.id);assert.ok(row.claims.length>0,row.id);for(const id of row.claims){assert.ok(known.has(id),row.id+' '+id);covered.add(id);}}
  // Every form is either covered or a proven unreachable entry, never both.
  assert.ok(Array.isArray(report.unreachable));
  const unreachable=report.unreachable.map(row=>row.form);
  assert.equal(new Set(unreachable).size,unreachable.length);
  for(const row of report.unreachable){
    assert.ok(known.has(row.form),row.form);assert.ok(!covered.has(row.form),row.form);
    assert.ok(ablatedTableNames.includes(tableOf(row.form)),row.form);
    assert.ok(ids.includes(row.case),row.form);assert.ok(covered.has(row.readBy),row.form);
  }
  assert.deepEqual([...covered,...unreachable].sort(),[...report.formIds].sort());
  assert.deepEqual(report.negatives.map(row=>row.id),[...sentenceFormNegativeIds]);
  for(const row of report.negatives){assert.equal(row.rejected,true,row.id);assert.ok(typeof row.failure==='string'&&row.failure.length>0&&row.failure!=='accepted',row.id);}
  return {status:'PASS',forms:report.formIds.length,cases:ids.length,unreachable:unreachable.length};
}

export function verifySentenceFormCoverage(report,inputs) {
  const verified=verifySentenceFormReport(report,inputs);
  assert.deepEqual(report.validatorNegatives.map(row=>row.id),[...sentenceFormValidatorNegativeIds]);
  for(const row of report.validatorNegatives)assert.equal(row.rejected,true,row.id);
  return verified;
}
