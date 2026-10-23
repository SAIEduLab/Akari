import fs from 'node:fs';
import {sha} from './product-test-host.mjs';
import assert from 'node:assert/strict';
export const editorAssetIds = [
  'duplicate-types-settings-identities', 'duplicate-images-data-history', 'duplicate-limit',
  'paint-entry-empty-focus', 'paint-tools-colors-fill', 'paint-history-cancelled-gesture',
  'paint-crop-native-transparent-padding', 'paint-large-stage-fit', 'paint-discard',
  'paint-failed-commit-preserves-drawing', 'paint-save-reload-export', 'paint-runtime-lock',
  'paint-small-viewport-touch', 'format-contract-and-import', 'format-malformed-state-protection',
  'mascot-dango-original-save-standalone',
];
export function verifyEditorAssets(report, inputs) {
  assert.equal(report.status, 'PASS');
  assert.equal(report.environment, 'chromium');
  assert.ok(report.browser);
  assert.deepEqual(report.snapshot, inputs);
  assert.deepEqual(report.results.map(r => r.id).sort(), [...editorAssetIds].sort());
  for (const result of report.results) assert.equal(result.pass, true, result.id + ': ' + result.detail);
  assert.deepEqual(report.standaloneObservationControls,[{id:'permanent-preparing',rejected:true,timeoutMs:100},{id:'delayed-running',accepted:true},{id:'missing-target',rejected:true,timeoutMs:100},{id:'wrong-image-size',rejected:true,timeoutMs:100},{id:'closed-page',rejected:true}],'bounded standalone observation controls');
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.networkRequests, []);
}
export const audioFixtures = [
  ['mp3', 'tone.mp3', 'audio/mpeg', 2, 48000],
  ['wav', 'tone.wav', 'audio/wav', 2, 48000],
  ['m4a', 'tone.m4a', 'audio/mp4', 2, 48000],
  ['m4a-mono', 'mono.m4a', 'audio/mp4', 1, 44100],
  ['flac', 'tone.flac', 'audio/flac', 2, 48000],
  ['flac-mono', 'mono.flac', 'audio/flac', 1, 8000],
  ['opus', 'tone.ogg', 'audio/ogg', 2, 48000],
  ['opus-mono', 'mono.opus', 'audio/ogg', 1, 48000],
];
export const audioIds = [
  ...audioFixtures.map(([name]) => 'audio-import-' + name),
  'audio-file-picker', 'audio-unsupported-codecs', 'audio-aac-profile',
  'audio-malformed-containers', 'audio-ogg-crc', 'audio-container-limits',
  'audio-saved-mime-and-metadata', 'audio-ui-failure-atomic',
  'audio-project-roundtrip', 'audio-runtime-mime-rejection',
];
export const codecBrowser = '140.0.7339.207';
export function verifyAudio(report, inputs, platform) {
  assert.equal(report.schema, 'akari-audio-v1');
  assert.equal(report.status, 'PASS'); assert.deepEqual(report.snapshot, inputs);
  assert.equal(report.browser, codecBrowser); assert.equal(report.playwright, '1.55.0');
  assert.equal(report.platform, platform); assert.ok(['win32','linux'].includes(platform));
  assert.match(report.executableSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(report.results.map(r => r.id).sort(), [...audioIds].sort());
  for (const result of report.results) { assert.equal(result.pass, true, result.id); assert.equal(result.detail, 'PASS'); if(result.status!==undefined)assert.equal(result.status,'PASS'); }
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.networkRequests, []);
  assert.equal(report.fixtureManifestSha256, sha(fs.readFileSync('audit/fixtures/audio/manifest.json')));
}
export const designerZoomIds = [
  'DESIGN-ZOOM-FIT-CODE', 'DESIGN-ZOOM-FIT-BLOCKS', 'DESIGN-ZOOM-ZOOM-SCROLL',
  'DESIGN-ZOOM-STABLE-RESIZE', 'DESIGN-ZOOM-POINTER-HISTORY', 'DESIGN-ZOOM-RUNTIME',
  'DESIGN-ZOOM-SAVE-EXPORT', 'DESIGN-ZOOM-FORMAT', 'DESIGN-ZOOM-NARROW-TOUCH', 'DESIGN-ZOOM-HANDLE-KEYS',
];
export function verifyDesignerZoom(report, inputs) {
  assert.equal(report.schema, 'akari-designer-v1');
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.snapshot, inputs);
  assert.equal(report.environment, 'chromium');
  assert.ok(typeof report.browser === 'string' && report.browser.length > 0);
  assert.deepEqual(report.results.map(r => r.id).sort(), [...designerZoomIds].sort());
  for (const r of report.results) {
    assert.equal(r.pass, true, r.id); assert.equal(r.detail, 'PASS');
    if (r.status !== undefined) assert.equal(r.status, 'PASS');
  }
  const touch = report.results.find(r => r.id === 'DESIGN-ZOOM-NARROW-TOUCH').evidence.touchEditing;
  const runMinimum=report.results.find(r=>r.id==='DESIGN-ZOOM-RUNTIME').evidence.runMinimum;
  assert.deepEqual(runMinimum.map(r=>[...r.viewport,...r.stage]),[[740,360,640,400],[740,360,1200,200],[740,360,200,800],[844,390,640,400],[844,390,1200,200],[844,390,200,800],[1366,650,640,400],[650,700,640,400],[651,700,640,400]]);
  for(const r of runMinimum){for(const key of ['stageMinimum','parentContains','wholeStageReachable','rootFits','stopFixed','wheel','touch','keyboard','gameKeysPreserved','controlsReachable','pauseStable','designPreserved'])assert.equal(r[key],true);assert.ok(r.run[0]>=r.edit[0]-.1&&r.run[1]>=r.edit[1]-.1);}
  assert.deepEqual(touch.map(r => r.width),[1366,1024,760]);
  for (const r of touch) { assert.equal(r.centerHit,true);assert.equal(r.covered,false);assert.equal(r.wobblePreserved,true);assert.equal(r.dragged,true);assert.equal(r.ratioPreserved,true);assert.ok(r.panPixels>50);assert.equal(r.urlPreserved,true); }
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.networkRequests, []);
}
