import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
// CI supplies the pinned parser through NODE_PATH. Local callers may install it normally.
const {parse}=require('@babel/parser');

const releaseName=name=>
  /(?:^|[a-z_$])(?:V(?:ersion)?|Release)[_-]?\d/.test(name)||
  /(?:^|[_$])(?:v(?:ersion)?|release)[_-]?\d/i.test(name)||
  /^(?:run|test|verify|validate|check)[A-Za-z_$]*\d{2,3}(?:Tests?|Suite)$/i.test(name);
const keyOf=node=>node?.computed?node.property?.value:node?.property?.name;
const propertyKey=node=>node?.computed?node.key?.value:node?.key?.name ?? node?.key?.value;
const location=node=>`${node.loc?.start.line ?? '?'}:${node.loc?.start.column ?? '?'}`;
const isFunction=node=>/Function(?:Declaration|Expression)$|ArrowFunctionExpression|ObjectMethod|ClassMethod|ClassPrivateMethod/.test(node?.type||'');

function walk(node,visit,parents=[]){
  if(!node||typeof node!=='object')return;
  if(typeof node.type==='string'){
    visit(node,parents);
    parents=[...parents,node];
  }
  for(const [key,value] of Object.entries(node)){
    if(key==='loc'||key==='start'||key==='end'||key==='extra'||key==='tokens'||key==='comments')continue;
    if(Array.isArray(value))for(const child of value)walk(child,visit,parents);
    else if(value&&typeof value==='object')walk(value,visit,parents);
  }
}

function functionName(parents){
  for(let i=parents.length-1;i>=0;i--){
    const node=parents[i];
    if(!isFunction(node))continue;
    if(node.id?.name)return node.id.name;
    if(node.key)return propertyKey(node);
    const parent=parents[i-1];
    if(parent?.type==='VariableDeclarator')return parent.id?.name;
    if(parent?.type==='ObjectProperty')return propertyKey(parent);
  }
  return null;
}

function isReference(node,parent){
  if(!parent)return true;
  if(parent.type==='VariableDeclarator'&&parent.id===node)return false;
  if((parent.type==='FunctionDeclaration'||parent.type==='FunctionExpression'||parent.type==='ClassDeclaration'||parent.type==='ClassExpression')&&parent.id===node)return false;
  if(isFunction(parent)&&parent.params?.includes(node))return false;
  if((parent.type==='ObjectProperty'||parent.type==='ObjectMethod'||parent.type==='ClassMethod')&&parent.key===node&&!parent.computed)return false;
  if((parent.type==='MemberExpression'||parent.type==='OptionalMemberExpression')&&parent.property===node&&!parent.computed)return false;
  return true;
}
function isNamedIdentifier(node,parent){
  if((parent?.type==='ObjectProperty'||parent?.type==='ObjectMethod'||parent?.type==='ClassMethod')&&parent.key===node&&!parent.computed)return false;
  if((parent?.type==='MemberExpression'||parent?.type==='OptionalMemberExpression')&&parent.property===node&&!parent.computed)return false;
  return true;
}

function productSource(html){
  const start=html.indexOf('<script>'),end=html.lastIndexOf('</script>');
  if(start<0||end<=start)throw new Error('Akari.html product script missing');
  return html.slice(start+8,end);
}

function parsed(source,sourceType='unambiguous'){
  return parse(source,{sourceType,allowReturnOutsideFunction:false,errorRecovery:false});
}

function nameIssues(ast,file,{callablesOnly=false}={}){
  const issues=[];
  walk(ast,(node,parents)=>{
    const parent=parents.at(-1);
    let name;
    if((node.type==='FunctionDeclaration'||node.type==='FunctionExpression')&&node.id)name=node.id.name;
    else if(['ObjectMethod','ClassMethod','ClassPrivateMethod'].includes(node.type))name=propertyKey(node);
    else if(node.type==='VariableDeclarator'&&/FunctionExpression|ArrowFunctionExpression/.test(node.init?.type||''))name=node.id?.name;
    else if(node.type==='ObjectProperty'&&/FunctionExpression|ArrowFunctionExpression/.test(node.value?.type||''))name=propertyKey(node);
    else if(node.type==='AssignmentExpression'&&/FunctionExpression|ArrowFunctionExpression/.test(node.right?.type||''))name=node.left?.type==='MemberExpression'?keyOf(node.left):node.left?.name;
    else if(!callablesOnly&&node.type==='Identifier'&&isNamedIdentifier(node,parent))name=node.name;
    if(name&&releaseName(name))issues.push(`${file}:${location(node)} release-derived identifier ${name}`);
  });
  return issues;
}

function productIssues(ast){
  const issues=[];
  const report=(node,message)=>issues.push(`Akari.html:${location(node)} ${message}`);
  let releaseDeclaration=0,contractDeclaration=0;
  walk(ast,(node,parents)=>{
    const parent=parents.at(-1),fn=functionName(parents);
    if(node.type==='VariableDeclarator'&&node.id?.name==='PRODUCT_RELEASE'){
      releaseDeclaration++;
      if(parent?.type!=='VariableDeclaration'||parent.kind!=='const'||node.init?.type!=='StringLiteral'||!/^\d+\.\d+\.\d+$/.test(node.init.value))report(node,'PRODUCT_RELEASE must be one literal release label');
    }
    if(node.type==='StringLiteral'&&/^\d+\.\d+\.\d+$/.test(node.value)&&!(parent?.type==='VariableDeclarator'&&parent.id?.name==='PRODUCT_RELEASE'&&parent.init===node))report(node,'copied release literal outside PRODUCT_RELEASE');
    if(node.type==='VariableDeclarator'&&node.id?.name==='EXECUTABLE_CONTRACT'){
      contractDeclaration++;
      const value=node.init?.type==='CallExpression'&&node.init.callee?.object?.name==='Object'&&node.init.callee?.property?.name==='freeze'?node.init.arguments[0]:node.init;
      const fields=['languageContractId','runtimeContractId','programFormatVersion','projectFormatVersion'];
      if(parent?.type!=='VariableDeclaration'||parent.kind!=='const'||value?.type!=='ObjectExpression'||value.properties.length!==fields.length||fields.some(key=>!value.properties.some(p=>propertyKey(p)===key&&p.value?.type==='NumericLiteral'&&Number.isSafeInteger(p.value.value)&&p.value.value>0)))report(node,'EXECUTABLE_CONTRACT must contain four positive integer literal format IDs');
    }
    if(node.type==='Identifier'&&node.name==='PRODUCT_RELEASE'&&isReference(node,parent)){
      const metadata=parent?.type==='ObjectProperty'&&parent.value===node&&(
        propertyKey(parent)==='appVersion'&&['makeDefaultProject','serializedRoot','packExecutable'].includes(fn)||
        propertyKey(parent)==='PRODUCT_RELEASE'&&parents.at(-2)?.type==='ObjectExpression'&&parents.at(-3)?.type==='VariableDeclarator'&&parents.at(-3).id?.name==='Akari');
      const label=fn==='productLabel'&&parent?.type==='TemplateLiteral'&&parents.at(-2)?.type==='ReturnStatement';
      if(!metadata&&!label)report(node,'PRODUCT_RELEASE read outside product label or producer metadata');
    }
    if((node.type==='MemberExpression'||node.type==='OptionalMemberExpression')&&keyOf(node)==='appVersion'){
      const metadataCheck=parent?.type==='CallExpression'&&parent.arguments.includes(node)&&(
        parent.callee?.name==='validProducerLabel'||
        parent.callee?.type==='MemberExpression'&&parent.callee.object?.name==='AKARI_RUNTIME'&&keyOf(parent.callee)==='validProducerLabel');
      const heading=fn==='markdownBody'&&parent?.type==='BinaryExpression'&&parent.operator==='+';
      const validationForward=fn==='validateSerializedProjectStructure'&&node.object?.name==='root'&&parent?.type==='ObjectProperty'&&propertyKey(parent)==='appVersion'&&parent.value===node;
      if(!metadataCheck&&!heading&&!validationForward)report(node,'appVersion read outside producer-label validation, validation forwarding, or markdown heading');
    }
    if((node.type==='MemberExpression'||node.type==='OptionalMemberExpression')&&keyOf(node)==='PRODUCT_RELEASE')report(node,'product release cannot be read back through an alias or public API');
    if(node.type==='Identifier'&&node.name==='producerLabel'&&isReference(node,parent)&&!(parent?.type==='ObjectProperty'&&parents.at(-2)?.type==='ObjectPattern'))report(node,'omitted producer metadata must not be reused');
    if(node.type==='ObjectProperty'&&parent?.type!=='ObjectPattern'&&propertyKey(node)==='appVersion'){
      const constructorValue=node.value?.type==='Identifier'&&node.value.name==='PRODUCT_RELEASE'&&['makeDefaultProject','serializedRoot','packExecutable'].includes(fn);
      const validationForward=fn==='validateSerializedProjectStructure'&&node.value?.type==='MemberExpression'&&node.value.object?.name==='root'&&keyOf(node.value)==='appVersion';
      if(!constructorValue&&!validationForward)report(node,'appVersion field outside approved producer metadata or validation forwarding');
    }
    if(node.type==='ObjectPattern')for(const property of node.properties){
      if(propertyKey(property)==='appVersion'&&(fn!=='assetStateFingerprint'||property.value?.name!=='producerLabel'))report(property,'appVersion destructuring outside fingerprint omission');
      if(propertyKey(property)==='PRODUCT_RELEASE')report(property,'PRODUCT_RELEASE read through destructuring');
    }
  });
  if(releaseDeclaration!==1)issues.push(`Akari.html: expected one PRODUCT_RELEASE declaration, found ${releaseDeclaration}`);
  if(contractDeclaration!==1)issues.push(`Akari.html: expected one EXECUTABLE_CONTRACT declaration, found ${contractDeclaration}`);
  return issues;
}

export function releasePolicyIssues(html,auditSources=[]){
  const script=productSource(html),issues=[];
  try{
    const ast=parsed(script,'script');
    issues.push(...nameIssues(ast,'Akari.html'),...productIssues(ast));
  }catch(error){issues.push(`Akari.html: parse failed: ${error.message}`);}
  for(const {file,source} of auditSources){
    try{issues.push(...nameIssues(parsed(source),file,{callablesOnly:true}));}
    catch(error){issues.push(`${file}: parse failed: ${error.message}`);}
  }
  return issues;
}

export function assertReleasePolicy(html,auditSources=[]){
  const issues=releasePolicyIssues(html,auditSources);
  if(issues.length)throw new Error('Release policy:\n'+issues.join('\n'));
}
