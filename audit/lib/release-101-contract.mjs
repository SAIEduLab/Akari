import assert from 'node:assert/strict';

// Explicit metadata changes authorized by the 1.0.1 product specification.
// Apply to the frozen expectation, never to observed product results.
export function release101Assertions(file, source) {
  const edits = {
    'audit/suites/runAkariSelfTests.js': [["['1.0.0', '1.0.0', 3]", "['1.0.1', '1.0.0', 3]"]],
    'audit/suites/runProductVersion09Tests.js': [
      ["appVersion: '1.0.0'", "appVersion: '1.0.1'"],
      ['# あかり 1.0.0 の作品', '# あかり 1.0.1 の作品'],
    ],
  }[file] || [];
  for (const [from, to] of edits) {
    assert.equal(source.split(from).length, 2, 'version expectation must occur exactly once: ' + file);
    source = source.replace(from, to);
  }
  return source;
}

export const editorAssetIds = [
  'duplicate-types-settings-identities', 'duplicate-images-data-history', 'duplicate-limit',
  'paint-entry-empty-focus', 'paint-tools-colors-fill', 'paint-history-cancelled-gesture',
  'paint-crop-native-transparent-padding', 'paint-large-stage-fit', 'paint-discard',
  'paint-failed-commit-preserves-drawing', 'paint-save-reload-export', 'paint-runtime-lock',
  'paint-small-viewport-touch', 'release-versions-and-100-import', 'release-malformed-state-protection',
];
export function verifyEditorAssets(report, inputs) {
  assert.equal(report.status, 'PASS');
  assert.equal(report.environment, 'chromium');
  assert.ok(report.browser);
  assert.deepEqual(report.snapshot, inputs);
  assert.deepEqual(report.results.map(r => r.id).sort(), [...editorAssetIds].sort());
  for (const result of report.results) assert.equal(result.pass, true, result.id + ': ' + result.detail);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.networkRequests, []);
}
