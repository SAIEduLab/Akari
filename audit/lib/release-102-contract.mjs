import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

// User-authorized version expectations; assertions and IDs otherwise stay exact.
// Rewrite the immutable expectation, never the candidate or its observations.
export function release102Assertions(file, source) {
  const edits = {
    'audit/suites/runAkariSelfTests.js': [["['1.0.1', '1.0.0', 3]", "['1.0.2', '1.0.0', 3]", 1]],
    'audit/suites/runProductVersion09Tests.js': [
      ["appVersion: '1.0.1'", "appVersion: '1.0.2'", 1],
      ['# あかり 1.0.1 の作品', '# あかり 1.0.2 の作品', 1],
    ],
    'audit/tests/editor-assets-101.mjs': [["'1.0.1'", "'1.0.2'", 3],
      ['# あかり 1.0.1 の作品', '# あかり 1.0.2 の作品', 1]],
  }[file] || [];
  for (const [from, to, count] of edits) {
    assert.equal(source.split(from).length - 1, count, 'exact 1.0.2 version transition: ' + file);
    source = source.replaceAll(from, to);
  }
  return source;
}

export function release102Runtime(source) {
  for (const [from, to] of [
    ["appVersion: '1.0.1'", "appVersion: '1.0.2'"],
    ["['audio/mpeg', 'audio/wav']", "['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/flac', 'audio/ogg']"],
  ]) {
    assert.equal(source.split(from).length, 2, 'exact authorized runtime delta: ' + from);
    source = source.replace(from, to);
  }
  return source;
}

export const audioFixtures102 = [
  ['mp3', 'tone.mp3', 'audio/mpeg', 2, 48000],
  ['wav', 'tone.wav', 'audio/wav', 2, 48000],
  ['m4a', 'tone.m4a', 'audio/mp4', 2, 48000],
  ['m4a-mono', 'mono.m4a', 'audio/mp4', 1, 44100],
  ['flac', 'tone.flac', 'audio/flac', 2, 48000],
  ['flac-mono', 'mono.flac', 'audio/flac', 1, 8000],
  ['opus', 'tone.ogg', 'audio/ogg', 2, 48000],
  ['opus-mono', 'mono.opus', 'audio/ogg', 1, 48000],
];
export const audioIds102 = [
  ...audioFixtures102.map(([name]) => 'audio-import-' + name),
  'audio-file-picker', 'audio-unsupported-codecs', 'audio-aac-profile',
  'audio-malformed-containers', 'audio-ogg-crc', 'audio-container-limits',
  'audio-saved-mime-and-metadata', 'audio-ui-failure-atomic',
  'audio-old-project-compatibility', 'audio-runtime-mime-rejection',
];
export const codecBrowser102 = '140.0.7339.207';
export function verifyAudio102(report, inputs, platform) {
  assert.equal(report.schema, 'akari-audio-102-v1');
  assert.equal(report.status, 'PASS'); assert.deepEqual(report.snapshot, inputs);
  assert.equal(report.browser, codecBrowser102); assert.equal(report.playwright, '1.55.0');
  assert.equal(report.platform, platform); assert.ok(['win32','linux'].includes(platform));
  assert.match(report.executableSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(report.results.map(r => r.id).sort(), [...audioIds102].sort());
  for (const result of report.results) { assert.equal(result.pass, true, result.id); assert.equal(result.detail, 'PASS'); if(result.status!==undefined)assert.equal(result.status,'PASS'); }
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.networkRequests, []);
  assert.equal(report.fixtureManifestSha256, inputs.files['audit/fixtures/audio-1.0.2/manifest.json']);
}

export function featureFreeze102(){
  const files=['Akari.html','LANGUAGE.md','AUDIT.md','README.md','MANUAL.html','index.html',
    ...fs.readdirSync('Manual').filter(p=>p.endsWith('.html')).map(p=>'Manual/'+p),
    '.github/workflows/akari-audit.yml','audit/manifests/quality-1.0.2.json',
    'audit/tests/audio-codecs-102.mjs','audit/tests/release-102-negative.mjs',
    'audit/lib/release-102-contract.mjs','audit/fixtures/audio-1.0.2/manifest.json'];
  return {schema:'akari-feature-freeze-v1',productVersion:'1.0.2',languageVersion:'1.0.0',runtimeVersion:'1.0.0',projectFormat:3,programFormat:3,
    status:'FROZEN_BEFORE_PUSH',acceptance:'Fresh complete execution and semantic review remain required; this freeze is not a PASS claim.',
    formats:['MP3','WAV (PCM)','M4A (AAC-LC)','FLAC','Ogg Opus'],compatibility:['1.0.0','1.0.1'],
    limits:{sourceBytes:12582912,canonicalAudioBytes:6291456,durationSeconds:60,channels:2,minSampleRate:8000,maxSampleRate:48000},
    preserved:{coreIds:884,capabilities:257,languageIds:605,editorIds:38,guiIds:9,browserTasks:27,browserCases:416,editorAssets101:15},
    audioIds:[...audioIds102],platforms:['linux','win32'],browser:codecBrowser102,playwright:'1.55.0',
    inputSha256:Object.fromEntries(files.sort().map(p=>[p,createHash('sha256').update(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')).digest('hex')]))};
}
export function verifyFreeze102(record=JSON.parse(fs.readFileSync('audit/manifests/release-1.0.2.json'))){
  assert.deepEqual(record,featureFreeze102(),'1.0.2 feature freeze drift: impact review and renewed freeze before Push required');
  const policy=JSON.parse(fs.readFileSync('audit/manifests/quality-1.0.2.json')),
    previous=JSON.parse(fs.readFileSync('audit/manifests/quality-1.0.1.json'));
  const normalized={...policy,targetProductVersion:previous.targetProductVersion,featureFreeze:previous.featureFreeze};
  if(previous.featureFreeze===undefined)delete normalized.featureFreeze;
  assert.deepEqual(normalized,previous,'1.0.1 audit guarantees must remain exact');
  assert.equal(policy.featureFreeze,'audit/manifests/release-1.0.2.json');
  return true;
}
