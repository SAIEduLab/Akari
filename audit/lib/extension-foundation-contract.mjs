import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { browserEnvironment } from './browser-environment.mjs';
import { sha } from './product-test-host.mjs';

export const extensionFoundationIds = Object.freeze([
  'EXTENSION-STANDARD-POLICIES',
  'EXTENSION-PROFILE-INHERIT-FINITE-UNLIMITED',
  'EXTENSION-PROFILE-STRICT-REGISTRATION',
  'EXTENSION-PROFILE-HOST-REQUIREMENT',
  'EXTENSION-PROFILE-RUNTIME-ISOLATION',
  'EXTENSION-REGISTRATION-COLLISION-TYPES',
  'EXTENSION-INDEPENDENT-CALCULATIONS',
  'EXTENSION-COMMAND-EVENT-STATE',
  'EXTENSION-SESSION-CANCELLATION',
  'EXTENSION-STANDARD-NO-NETWORK',
  'EXTENSION-DERIVED-NO-NETWORK',
  'EXTENSION-LANGUAGE-BLOCK-ROUNDTRIP',
  'EXTENSION-DERIVED-SAVE-RESTORE',
  'EXTENSION-PROFILE-COUNT-CAPACITY-ROUNDTRIP',
  'EXTENSION-OFFLINE-STANDALONE',
  'EXTENSION-REAL-POPUP-MESSAGECHANNEL',
  'EXTENSION-TYPES-UNITS-DEPENDENCIES',
  'EXTENSION-GUI-HISTORY-AUTOSAVE',
  'EXTENSION-ASYNC-PARALLEL-PAUSE-STOP',
  'EXTENSION-COOPERATIVE-FUNCTION-BUDGET',
  'EXTENSION-PROFILE-IMPORT-FILE-RUNTIME',
  'EXTENSION-FAILED-IMPORT-PRESERVES-EDITOR',
  'EXTENSION-RPC-NEGATIVE-LIFECYCLE',
  'EXTENSION-EVENT-LANGUAGE',
]);
export const extensionExpectedObservations = Object.freeze({
  'EXTENSION-STANDARD-POLICIES': { standardUnchanged: true, standardFrozen: true, keys: 42 },
  'EXTENSION-PROFILE-INHERIT-FINITE-UNLIMITED': { adjustable: 36, inherited: true, finite: true, unlimited: true, stable: true },
  'EXTENSION-PROFILE-STRICT-REGISTRATION': { invalidRejected: 16, engineGuards: 6, duplicateRejected: true, canonicalHash: true },
  'EXTENSION-PROFILE-HOST-REQUIREMENT': { standardAccepted: true, mismatchRejected: true, unknownRejected: true, wrongSelectionRejected: true, unchangedSelection: true },
  'EXTENSION-PROFILE-RUNTIME-ISOLATION': { standardComponents: 500, derivedComponents: 501, isolated: true },
  'EXTENSION-REGISTRATION-COLLISION-TYPES': { duplicateRejected: true, invalidNumberRejected: true, promiseCalculationRejected: true },
  'EXTENSION-INDEPENDENT-CALCULATIONS': { doubled: 14, shouted: 'HELLO!', independent: true },
  'EXTENSION-COMMAND-EVENT-STATE': { remembered: 9, value: 9, event: 9, restored: 9 },
  'EXTENSION-SESSION-CANCELLATION': { staleRejected: true, signalAborted: true, ended: true },
  'EXTENSION-STANDARD-NO-NETWORK': { httpRequests: 0, socketRequests: 0, errors: 0, unblocked: true },
  'EXTENSION-DERIVED-NO-NETWORK': { httpRequests: 0, socketRequests: 0, errors: 0, unblocked: true },
  'EXTENSION-LANGUAGE-BLOCK-ROUNDTRIP': { equivalent: true, value: 14, commandValue: 9 },
  'EXTENSION-DERIVED-SAVE-RESTORE': { profilePreserved: true, extensionsPreserved: true, sourcePreserved: true, unavailableRejected: true },
  'EXTENSION-PROFILE-COUNT-CAPACITY-ROUNDTRIP': { components: 501, chars: 100001, finiteRejected: true, restored: true, integrityRejected: true },
  'EXTENSION-OFFLINE-STANDALONE': { independentContext: true, value: '14', profilePreserved: true, externalLoaded: true, unconnectedDiagnostic: true, offlineCalculation: true, httpRequests: 0, errors: 0 },
  'EXTENSION-REAL-POPUP-MESSAGECHANNEL': { popup: true, handshake: true, result: 14, notification: 9, disconnected: true, staleRejected: true },
  'EXTENSION-TYPES-UNITS-DEPENDENCIES': { unitPreserved: true, unitRejected: true, dependencyRejected: true, versionRejected: true, stateMismatchRejected: true },
  'EXTENSION-GUI-HISTORY-AUTOSAVE': { typed: true, blocks: true, undo: true, redo: true, reloaded: true },
  'EXTENSION-ASYNC-PARALLEL-PAUSE-STOP': { parallel: true, paused: true, resumed: true, stopped: true, lateIgnored: true },
  'EXTENSION-COOPERATIVE-FUNCTION-BUDGET': { overStandard: true, responsive: true, stopped: true, standardRejected: true },
  'EXTENSION-PROFILE-IMPORT-FILE-RUNTIME': { sourceChars: 100001, parsed: true, runtimeList: 100001, listRejected: true, capacityRejected: true },
  'EXTENSION-FAILED-IMPORT-PRESERVES-EDITOR': { source: true, history: true, dirty: true },
  'EXTENSION-RPC-NEGATIVE-LIFECYCLE': { malformed: true, unknown: true, duplicate: true, cancel: true, timeout: true, error: true, impostor: true, oldSession: true, reconnect: true },
  'EXTENSION-EVENT-LANGUAGE': { value: '9', compiled: true, saved: true, restored: true },
});
export function verifyExtensionFoundation(report, inputs, evidenceDirectory) {
  assert.equal(report.schema, 'akari-extension-foundation-v1');
  assert.equal(report.status, 'PASS'); assert.deepEqual(report.snapshot, inputs);
  assert.deepEqual(report.provenance, { run: process.env.GITHUB_RUN_ID || 'local', attempt: process.env.GITHUB_RUN_ATTEMPT || '1' });
  assert.deepEqual(report.environment, { platform: report.environment.platform, browser: browserEnvironment.version, playwright: browserEnvironment.playwright });
  assert.ok(['linux', 'win32'].includes(report.environment.platform));
  assert.deepEqual(report.results.map(r => r.id), [...extensionFoundationIds]);
  assert.equal(new Set(report.results.map(r => r.id)).size, extensionFoundationIds.length);
  for (const result of report.results) {
    assert.equal(result.status, 'PASS', result.id); assert.equal(result.error, undefined, result.id);
    assert.deepEqual(result.observed, extensionExpectedObservations[result.id], result.id);
  }
  assert.deepEqual(report.networkErrors, []); assert.deepEqual(report.pageErrors, []);
  assert.ok(Array.isArray(report.artifacts) && report.artifacts.length >= 3);
  const names = new Set();
  for (const artifact of report.artifacts) {
    assert.ok(typeof artifact.path === 'string' && artifact.path.length > 0);
    assert.ok(!path.isAbsolute(artifact.path) && !artifact.path.split(/[\\/]/).includes('..'));
    assert.ok(!names.has(artifact.path)); names.add(artifact.path);
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
    if (evidenceDirectory) assert.equal(sha(fs.readFileSync(path.join(evidenceDirectory, artifact.path))), artifact.sha256, artifact.path);
  }
  assert.ok(names.has('candidate.html') && names.has('derived.html') && names.has('player.html'));
  assert.ok(names.has('external-player.html'));
  assert.equal(report.artifacts.find(a => a.path === 'candidate.html').sha256, inputs.productSha256);
  return { status: 'PASS', cases: extensionFoundationIds.length };
}

export function verifyExtensionFoundationNegative(report, inputs) {
  assert.equal(report.schema, 'akari-extension-foundation-negative-v1');
  assert.equal(report.status, 'PASS'); assert.deepEqual(report.snapshot, inputs);
  assert.equal(report.controlKind, 'validator-rejection-only');
  assert.deepEqual(report.results.map(x => x.id), extensionNegativeIds);
  for (const result of report.results) assert.equal(result.rejected, true, result.id);
  return { status: 'PASS', controls: report.results.length };
}
export const extensionNegativeIds = Object.freeze([
  'missing-result', 'duplicate-result', 'reordered-result', 'failed-result', 'fake-pass-observation',
  'exception', 'old-snapshot', 'wrong-browser', 'wrong-playwright', 'network-attempt', 'page-error',
  'missing-artifact', 'duplicate-artifact', 'artifact-escape', 'candidate-mismatch', 'altered-player', 'other-run', 'other-attempt',
]);
