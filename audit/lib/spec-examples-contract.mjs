import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {meijinExampleErrors} from './meijin-example-world.mjs';

// Every ```text block of the language and extension specifications is read by the
// product parser. A block is one script that must be accepted, unless the line right
// before its fence carries a marker:
//   <!-- akari-example: rejected -->    every statement (a line and its indented lines)
//                                       is an intentionally invalid example and must be
//                                       rejected on its own;
//   <!-- akari-example: expression -->  every line is one expression or condition;
//   <!-- akari-example: meijin -->      the block is one 名人 script, read in a work with the parts and
//                                       data its sentences name, and the check finds no error;
//   <!-- akari-example: meijin-rejected -->  every statement is an intentionally invalid 名人 example
//                                       and the check must stop it on its own.
// EXTENSIONS.md examples are read by a derived product that registers the extensions
// that guide builds (extensions/examples/offline.js and meijin.js).
export const specExampleDocuments=Object.freeze([
  Object.freeze({file:'LANGUAGE.md',context:'standard'}),
  Object.freeze({file:'EXTENSIONS.md',context:'offline-extensions'}),
]);
export const specExampleModes=Object.freeze(['script','rejected','expression','meijin','meijin-rejected']);
export const readSpecExampleDocuments=(root=path.resolve(import.meta.dirname,'../..'))=>
  specExampleDocuments.map(({file,context})=>({file,context,text:fs.readFileSync(path.join(root,file),'utf8')}));
export const specExampleNegativeIds=Object.freeze([
  'accepted-example-rejected-detected','rejected-example-accepted-detected','rejected-unit-masking-detected',
  'expression-example-rejected-detected','unknown-marker-detected','dangling-marker-detected','unclosed-block-detected',
  'empty-block-detected','document-without-blocks-detected','extension-context-detected',
  'meijin-example-rejected-detected','meijin-rejected-example-accepted-detected','meijin-rejected-unit-masking-detected',
]);
export const specExampleValidatorNegativeIds=Object.freeze([
  'report-failed-status','report-failure-listed','report-missing-block','report-extra-block','report-failed-block',
  'report-changed-mode','report-negative-missing','report-negative-accepted','report-snapshot','report-derived-product',
]);

const marker=/^<!--\s*akari-example:\s*([a-z-]+)\s*-->\s*$/;
// Structure of one document: its text blocks and every marker/fence problem.
export function readExampleBlocks(text,file) {
  const lines=text.replace(/\r\n?/g,'\n').split('\n'),blocks=[],failures=[];
  let open=null;
  lines.forEach((line,index)=>{
    const lineNo=index+1;
    if(open){if(/^```\s*$/.test(line)){blocks.push(open);open=null;}else open.body.push(line);return;}
    const found=marker.exec(line);
    if(found){
      if(!specExampleModes.includes(found[1])||found[1]==='script')failures.push('marker:'+file+':'+lineNo+':'+found[1]);
      else if(!/^```text\s*$/.test(lines[index+1]??''))failures.push('marker:'+file+':'+lineNo+':dangling');
      return;
    }
    if(/^```text\s*$/.test(line)){
      const previous=marker.exec(lines[index-1]??'');
      open={file,line:lineNo,mode:previous&&specExampleModes.includes(previous[1])?previous[1]:'script',body:[]};
    }
  });
  if(open)failures.push('unclosed:'+file+':'+open.line);
  for(const block of blocks)if(!block.body.some(line=>line.trim()))failures.push('empty:'+file+':'+block.line);
  if(!blocks.length)failures.push('no-blocks:'+file);
  return {blocks,failures};
}

// A statement unit: a line written at the left margin with its indented lines.
// Comment lines are explanations, not statements.
export function statementUnits(body) {
  const units=[];
  for(const line of body){
    if(!line.trim()||line.trim().startsWith('※'))continue;
    if(/^[ 　\t]/.test(line)&&units.length)units[units.length-1].push(line);
    else units.push([line]);
  }
  return units.map(unit=>unit.join('\n'));
}

const diagnostic=error=>error?.code||error?.name||'error';
// Product reading of one block; returns the failure text or null.
export function checkExampleBlock(api,block) {
  const id=block.file+':'+block.line,source=block.body.join('\n');
  if(block.mode==='script'){
    const result=api.parseSyntax(source);
    return result.ast?null:'rejected:'+id+':'+(result.syntaxDiagnostics[0]?.code||'none');
  }
  if(block.mode==='expression'){
    for(const line of block.body){
      if(!line.trim()||line.trim().startsWith('※'))continue;
      try{api.parseExpression(line.trim());}catch(error){if(!error?.code)throw error;return 'rejected:'+id+':'+diagnostic(error)+':'+line.trim();}
    }
    return null;
  }
  if(block.mode==='meijin'){
    const errors=meijinExampleErrors(api,source);
    return errors.length?'rejected:'+id+':'+errors[0]:null;
  }
  // Intentionally invalid examples: each statement must be rejected by itself, so an
  // accepted statement cannot hide behind a rejected neighbour.
  const units=statementUnits(block.body);
  if(!units.length)return 'empty:'+id;
  const accepts=block.mode==='meijin-rejected'?unit=>!meijinExampleErrors(api,unit).length:unit=>!!api.parseSyntax(unit).ast;
  for(const unit of units)if(accepts(unit))return 'accepted:'+id+':'+unit.split('\n')[0];
  return null;
}

export function checkSpecExamples(documents,apis) {
  const failures=[],rows=[];
  for(const {file,context,text} of documents){
    const read=readExampleBlocks(text,file);failures.push(...read.failures);
    const api=apis[context];if(!api){failures.push('context:'+file+':'+context);continue;}
    for(const block of read.blocks){
      const problem=checkExampleBlock(api,block);if(problem)failures.push(problem);
      rows.push({file,line:block.line,mode:block.mode,context,units:['rejected','meijin-rejected'].includes(block.mode)?statementUnits(block.body).length:null,status:problem?'FAIL':'PASS'});
    }
  }
  return {failures,rows};
}

// The validator re-reads the documents, so a report always covers the current blocks.
// With the evidence directory it also binds the derived product that read EXTENSIONS.md.
export function verifySpecExampleReport(report,inputs,{documents=readSpecExampleDocuments(),artifacts=null}={}) {
  assert.equal(report.schema,'akari-spec-examples-v1');
  assert.equal(report.status,'PASS');assert.deepEqual(report.snapshot,inputs);
  assert.deepEqual(report.failures,[]);
  assert.equal(report.derivedProduct?.path,'derived-offline.html');assert.match(report.derivedProduct.sha256,/^[0-9a-f]{64}$/);
  if(artifacts)assert.equal(createHash('sha256').update(fs.readFileSync(path.join(artifacts,report.derivedProduct.path))).digest('hex'),report.derivedProduct.sha256);
  const expected=documents.flatMap(({file,context,text})=>{const read=readExampleBlocks(text,file);assert.deepEqual(read.failures,[],file);return read.blocks.map(block=>({file,line:block.line,mode:block.mode,context}));});
  assert.deepEqual(report.blocks.map(({file,line,mode,context})=>({file,line,mode,context})),expected);
  for(const row of report.blocks)assert.equal(row.status,'PASS',row.file+':'+row.line);
  for(const {file} of specExampleDocuments)assert.ok(report.blocks.some(row=>row.file===file),file);
  assert.deepEqual(report.negatives.map(row=>row.id),[...specExampleNegativeIds]);
  for(const row of report.negatives){assert.equal(row.rejected,true,row.id);assert.ok(typeof row.failure==='string'&&row.failure!=='accepted',row.id);}
  return {status:'PASS',blocks:report.blocks.length,rejected:report.blocks.filter(row=>row.mode==='rejected').length};
}
export function verifySpecExamples(report,inputs,options={}) {
  const verified=verifySpecExampleReport(report,inputs,options);
  assert.deepEqual(report.validatorNegatives.map(row=>row.id),[...specExampleValidatorNegativeIds]);
  for(const row of report.validatorNegatives)assert.equal(row.rejected,true,row.id);
  return verified;
}
