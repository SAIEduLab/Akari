import assert from 'node:assert/strict';
import {currentProductVersion} from './product-path.cjs';
import fs from 'node:fs';
import {preservedLicenseSource,sha} from './license-contract.cjs';
const metadataPaths=new Set([
  'audit/manifests/language-form-coverage.json',
  'audit/manifests/features.json',
  'audit/browser/browser-audit-manifest.json',
]);
// Keep every pinned source byte except the current producer's single label.
// The historical candidate label remains fixed; no oracle pin is regenerated.
export function preservedCandidateBytes(file,bytes){
  bytes=preservedLicenseSource(file,bytes);
  // Undo only the four approved playback UI-route changes for historical comparison.
  // The fixed ledger and semantic oracle are not refreshed from the candidate.
  if(file==='audit/browser/cases/browser-session.cjs'){
    const rows=JSON.parse(fs.readFileSync(new URL('../fixtures/approved-run-preview-fix.json',import.meta.url))).files.filter(r=>r.file===file);
    assert.equal(rows.length,1,'one approved playback source record');
    const [row]=rows;
    assert.equal(sha(Buffer.from(JSON.stringify(row))),'103392751c14b9a17feddc3fa3250ef8070c31aed075874f1cda6de1f2aa7b41','exact approved playback source record');
    assert.equal(sha(bytes),row.afterSha256,'exact approved playback test source');
    let text=bytes.toString('utf8');
    for(const c of [...row.changes].reverse()){
      assert.equal(text.split(c.after).length,c.count+1,'exact playback hunk: '+file);
      text=text.replaceAll(c.after,c.before);
    }
    bytes=Buffer.from(text);
    assert.equal(sha(bytes),'e0079530882bc7381b86b1583e431f9adfc9320c4a14217be6bf9ce48cbc234c','all historical test bytes preserved');
  }
  if(!metadataPaths.has(file))return bytes;
  const text=bytes.toString('utf8'),label=/^  "productVersion": "([^"]+)",?$/m;
  assert.equal(JSON.parse(text).productVersion,currentProductVersion());
  assert.equal([...text.matchAll(new RegExp(label.source,'gm'))].length,1);
  return Buffer.from(text.replace(label,match=>match.replace(JSON.stringify(currentProductVersion()),'"1.0.2"')));
}
