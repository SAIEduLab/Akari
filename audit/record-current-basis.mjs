import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {basisPath,basisTargets,sha,validateBasisDocument,verifyCurrentAuditBasis} from './lib/current-audit-basis.cjs';
const root=path.resolve(import.meta.dirname,'..');
if(!process.argv.includes('--record')){console.log(JSON.stringify(verifyCurrentAuditBasis(root)));}
else{
  const at=process.argv.indexOf('--reason'),reason=at>=0?process.argv[at+1]:null;
  assert.ok(reason&&reason.trim().length>=20,'--record requires the explicitly approved update reason');
  const record={schema:'akari-current-audit-basis-v1',productVersion:'1.1.2',startingCommit:'2997cac6e74895e12cfd6ede51311ce09ddbdfd8',updateReason:reason,
    executionStatus:'NOT_ASSERTED_BY_BYTE_INTEGRITY',files:basisTargets.map(file=>{const bytes=fs.readFileSync(path.join(root,file));return{path:file,sha256:sha(bytes),bytes:bytes.length};})};
  validateBasisDocument(record);const bytes=Buffer.from(JSON.stringify(record,null,2)+'\n');
  const anchor=path.join(root,'audit/lib/current-audit-basis.cjs'),source=fs.readFileSync(anchor,'utf8'),pin=/const REVIEWED_BASIS_SHA256='[a-f0-9]{64}';/g;
  assert.equal([...source.matchAll(pin)].length,1,'one current-basis trust anchor');
  fs.writeFileSync(path.join(root,basisPath),bytes);
  fs.writeFileSync(anchor,source.replace(pin,"const REVIEWED_BASIS_SHA256='"+sha(bytes)+"';"));
  console.log(JSON.stringify({operation:'REVIEWED_BASIS_RECORDED',targets:record.files.length,basisSha256:sha(bytes),executionStatus:record.executionStatus,releaseFreeze:'MUST_BE_RECORDED_SEPARATELY'}));
}
