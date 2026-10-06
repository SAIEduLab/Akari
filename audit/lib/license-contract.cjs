const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const LICENSE_ID = 'MIT';
const COPYRIGHT = 'Copyright (c) 2026 SAIEduLab';
const LICENSE_TEXT = `MIT License

Copyright (c) 2026 SAIEduLab

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function verifyLicenseText(text) { assert.equal(text, LICENSE_TEXT, 'canonical MIT license and SAIEL copyright'); }
function verifyLicensedArtifact(html) {
  assert.ok(html.includes('SPDX-License-Identifier: MIT'), 'MIT SPDX missing');
  assert.ok(html.includes(LICENSE_TEXT), 'full MIT license missing');
  assert.ok(html.includes(COPYRIGHT), 'SAIEL copyright missing');
  assert.ok(!html.includes('SPDX-License-Identifier: Apache-2.0'), 'obsolete Apache SPDX');
  assert.ok(!html.includes('Version 2.0, January 2004'), 'obsolete Apache license body');
  return true;
}
const migratedPaths = new Set(['audit/suites/runAkariSelfTests.js', 'audit/browser/cases/run-editor-regression.cjs', 'audit/browser/cases/browser-storage-media.cjs']);
function licenseMigration() {
  const record = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifests/license-migration.json')));
  assert.equal(record.schema, 'akari-license-migration-v1');
  assert.equal(record.from, 'Apache-2.0'); assert.equal(record.to, LICENSE_ID);
  assert.equal(record.copyright, COPYRIGHT);
  assert.equal(record.stableTestId, 'EXPORT Apache-2.0ライセンス保持');
  assert.deepEqual(record.sources.map(x => x.path).sort(), [...migratedPaths].sort());
  return record;
}
// Reverse only explicitly approved, exact license hunks. Existing historical
// pins then validate every remaining byte; their hashes and old sources stay fixed.
function preservedLicenseSource(file, bytes) {
  if (!migratedPaths.has(file)) return bytes;
  const row = licenseMigration().sources.find(x => x.path === file);
  let text = bytes.toString('utf8');
  assert.ok(row.replacements.length > 0);
  for (const {before, after} of row.replacements) {
    assert.notEqual(before, after); assert.ok(before && after);
    assert.equal(text.split(after).length, 2, 'missing or duplicated MIT migration hunk: '+file);
    text = text.replace(after, before);
  }
  const restored = Buffer.from(text);
  assert.equal(sha(restored), row.originalSha256, 'non-license source change: '+file);
  return restored;
}
function licensingSnapshot() {
  const root = path.resolve(__dirname, '../..'), meta = JSON.parse(fs.readFileSync(path.join(root, 'audit/public-files.json')));
  const {currentProductFile} = require('./product-path.cjs');
  return {productSha256:sha(fs.readFileSync(path.join(root,currentProductFile()))),
    files:Object.fromEntries(meta.files.filter(file=>fs.existsSync(path.join(root,file))).map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]))};
}
function verifyLicenseBrowserReport(report, artifactDirectory, expected = licensingSnapshot()) {
  assert.equal(report.schema,'akari-license-browser-v1'); assert.equal(report.status,'PASS');
  assert.deepEqual(report.snapshot,expected); assert.ok(/^140\./.test(report.browser));
  assert.deepEqual(report.pageErrors,[]); assert.deepEqual(report.networkRequests,[]);
  const root = path.resolve(__dirname,'../..'), {currentProductFile} = require('./product-path.cjs');
  const source = fs.readFileSync(path.join(root,currentProductFile()),'utf8');
  const derivedRequired = source.includes('function configureAkariFoundation');
  const ids = ['STANDARD-EDITOR-STANDALONE', ...(derivedRequired ? ['DERIVED-EDITOR-STANDALONE'] : [])];
  assert.deepEqual(report.results.map(row=>row.id),ids);
  for (const row of report.results) {
    assert.equal(row.status,'PASS'); assert.equal(row.copyright,COPYRIGHT);
    assert.equal(row.offline,true); assert.equal(row.nativeDownload,true); assert.equal(row.playerStopped,true);
    assert.ok(row.output.includes('MIT監査'));
    for (const kind of ['editor','player']) {
      const entry=row[kind]; assert.ok(/^[a-z-]+\.html$/.test(entry.file),'artifact path');
      const bytes=fs.readFileSync(path.join(artifactDirectory,entry.file)); assert.equal(sha(bytes),entry.sha256);
      verifyLicensedArtifact(bytes.toString('utf8'));
      if(row.id==='STANDARD-EDITOR-STANDALONE'&&kind==='editor')assert.equal(sha(bytes),expected.productSha256);
    }
  }
  return true;
}
module.exports = {LICENSE_ID, COPYRIGHT, LICENSE_TEXT, sha, verifyLicenseText, verifyLicensedArtifact, licenseMigration, preservedLicenseSource, licensingSnapshot, verifyLicenseBrowserReport};
