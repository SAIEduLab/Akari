import assert from 'node:assert/strict';
import {currentProductVersion} from './product-path.cjs';
const metadataPaths=new Set([
  'audit/manifests/language-form-coverage.json',
  'audit/manifests/features.json',
  'audit/browser/browser-audit-manifest.json',
]);
// Keep every pinned source byte except the current producer's single label.
// The historical candidate label remains fixed; no oracle pin is regenerated.
export function preservedCandidateBytes(file,bytes){
  if(!metadataPaths.has(file))return bytes;
  const text=bytes.toString('utf8'),label=/^  "productVersion": "([^"]+)",?$/m;
  assert.equal(JSON.parse(text).productVersion,currentProductVersion());
  assert.equal([...text.matchAll(new RegExp(label.source,'gm'))].length,1);
  return Buffer.from(text.replace(label,match=>match.replace(JSON.stringify(currentProductVersion()),'"1.0.2"')));
}
