import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkReportEnvironment } from './browser-environment.mjs';
import { sha } from './product-test-host.mjs';

export const extensionFoundationIds = Object.freeze([
  'EXTENSION-STANDARD-POLICIES',
  'EXTENSION-PROFILE-INHERIT-FINITE-UNLIMITED',
  'EXTENSION-PROFILE-STRICT-REGISTRATION',
  'EXTENSION-PROFILE-HOST-REQUIREMENT',
  'EXTENSION-PROFILE-RUNTIME-ISOLATION',
  'EXTENSION-PROFILE-EXAMPLES',
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
  'EXTENSION-STATE-LIFETIME',
  'EXTENSION-JAPANESE-NAMES',
  'EXTENSION-VERSION-UPGRADE',
  'EXTENSION-UPGRADE-OPEN-CONFIRM',
  'EXTENSION-MEIJIN-SCOPE',
  'EXTENSION-BUILD-AS-WRITTEN',
  'EXTENSION-STATE-OF-UNRECORDED',
  'EXTENSION-BUILD-CHECKS-AS-PRODUCT',
  'EXTENSION-BUILD-JSON-AS-WRITTEN',
  'EXTENSION-FACTORY-MARKUP-REFUSED',
  'EXTENSION-NAMES-AND-LINES-REFUSED',
  'EXTENSION-FACTORY-CHARACTERS-REFUSED',
  'EXTENSION-FACTORY-TEXT-IN-PAGE',
  'EXTENSION-PROFILE-COUNTED-CONDITION-IN-STEPS',
  'EXTENSION-PAUSED-ARRIVALS-IN-ORDER',
  'EXTENSION-NAME-CHARACTERS-REFUSED',
  'EXTENSION-DROPPED-DEPENDENCY-OPEN',
  'EXTENSION-STATE-TEXT-KEPT',
  'EXTENSION-STANDALONE-USED-ONLY',
  'EXTENSION-EVENT-NAME-NOTICE',
  'EXTENSION-EVENT-HEADING-CHOICE',
]);
export const extensionExpectedObservations = Object.freeze({
  'EXTENSION-STATE-LIFETIME': { runRestart: 0, projectRestart: 7, runSnapshot: 0, projectSnapshot: 7, runRestored: 0, projectRestored: 5,
    projectReset: 0, resetDuringRunRejected: true, defaultLifetime: 'run', invalidLifetimeRejected: true },
  'EXTENSION-JAPANESE-NAMES': { sameAst: true, mixedAst: true, printedCommand: '拡張「数の記憶」「数を記憶する」（9）', printedCalculation: '拡張計算「数の記憶」「数を2倍にする」（7）',
    idsStillRead: true, unknownRejected: true, duplicateNameRejected: true, nameClashesWithIdRejected: true, invalidNameRejected: true,
    operationNamedAsOtherIdRejected: true },
  'EXTENSION-VERSION-UPGRADE': { upgraded: '1.0.0→1.2.0', validates: true, stateKept: { value: 4 }, sameVersionChangedRejected: true,
    newerRecordedRejected: true, otherMajorRejected: true, prereleaseRejected: true, stateFormatRejected: true,
    nullEntryRejected: true, listVersionRejected: true, nullBesideDependentRejected: true,
    buildRecorded: '1.0.0+build.3→1.2.0', buildCurrent: '1.0.0→1.2.0+build.7', sameReleaseBuildRejected: true },
  'EXTENSION-UPGRADE-OPEN-CONFIRM': { asked: true, namesVersions: true, dismissedKeepsWork: true, acceptedOpens: true, recordedVersion: '1.2.1' },
  // extensions/build.mjs embeds a factory as it is written: "$" in its text is not a replacement pattern.
  'EXTENSION-BUILD-AS-WRITTEN': { productKept: true, sourceKept: true, compiled: true, said: ["$3$'$&$$"], sameHash: true },
  // extensions/build.mjs checks a definition as the product's host does when it starts: the names of the built-in
  // calculations are reserved (E702) and the Standard is the contract of the product built from (E701).
  'EXTENSION-BUILD-CHECKS-AS-PRODUCT': { reserved: 'E702', standard: 'E701', capabilities: { twice: 'E707', text: 'E707', number: 'E707' }, written: false },
  // extensions/build.mjs checks the definitions as written: NaN and Infinity are no ceiling of null, a NaN state no null.
  'EXTENSION-BUILD-JSON-AS-WRITTEN': { nan: 'E_PROFILE', infinite: 'E_PROFILE', none: 'built', standard: 'built', state: 'E701' },
  // A factory that opens an HTML comment or a script (<!-- <script) is refused as one that closes the script (E701).
  'EXTENSION-PAUSED-ARRIVALS-IN-ORDER': { running: ['できごとが来た', '答えが来た'], paused: ['できごとが来た', '答えが来た'] },
  'EXTENSION-PROFILE-COUNTED-CONDITION-IN-STEPS': { inSteps: true, waiting: ['condition'] },
  'EXTENSION-NAMES-AND-LINES-REFUSED': { extensionName: 'E702', operationName: 'E702', crlfFactory: 'E701', plain: 'registered', wideName: 'registered', longName: 'E702' },
  // A factory holding NUL or a lone surrogate is refused (E701); a pair, U+000C, U+FEFF, U+2028 and U+2029 are not.
  'EXTENSION-FACTORY-CHARACTERS-REFUSED': { host: { nul: 'E701', high: 'E701', low: 'E701', reversed: 'E701', pairThenLow: 'E701', pair: 'registered',
    formFeed: 'registered', byteOrderMark: 'registered', lineSeparator: 'registered', paragraphSeparator: 'registered' },
    build: { nul: 'E701', high: 'E701', low: 'E701' }, written: false },
  // A lone surrogate in a name written in a work's code is refused (E701); a pair, and one in a description or in the
  // initial state, are not.
  'EXTENSION-NAME-CHARACTERS-REFUSED': { host: { extension: 'E701', command: 'E701', argument: 'E701', event: 'E701', stateKey: 'registered', stateText: 'registered',
    pair: 'registered', description: 'registered' }, build: 'E701', written: false },
  // A newer release no longer depends on an extension that is not registered: a work that uses none of it is asked about
  // and opens without its record; one that uses its block or event is refused without asking.
  'EXTENSION-DROPPED-DEPENDENCY-OPEN': { unused: { first: { code: 'E703', message: '必要な拡張「t.dep」が登録されていません', asked: ['t.main 1.0.0→1.1.0'] },
    agreed: { record: ['t.main@1.1.0'], state: ['t.main'] } },
    block: { first: { asked: [], code: 'E703', message: '必要な 拡張「t.dep」が 登録されて いません' }, agreed: { asked: [], code: 'E703', message: '必要な 拡張「t.dep」が 登録されて いません' } },
    event: { first: { asked: [], code: 'E703', message: '必要な 拡張「t.dep」が 登録されて いません' }, agreed: { asked: [], code: 'E703', message: '必要な 拡張「t.dep」が 登録されて いません' } },
    stillRegistered: { record: ['t.dep@1.0.0', 't.main@1.1.0'], state: ['t.dep', 't.main'] } },
  // A text set in a kept state is saved and opened as it is, a lone surrogate too.
  'EXTENSION-STATE-TEXT-KEPT': { set: ['61', 'dc00', '62', '1f600'], reopened: ['61', 'dc00', '62', '1f600'] },
  // A derived product whose factory and manifest hold such characters starts, with the text and identities of the build.
  'EXTENSION-FACTORY-TEXT-IN-PAGE': { started: true, sameFactories: true, sameIdentities: true, sameDescription: true, errors: 0 },
  'EXTENSION-FACTORY-MARKUP-REFUSED': { host: { commentOpen: 'E701', scriptOpen: 'E701', scriptClose: 'E701' },
    build: { commentOpen: 'E701', scriptOpen: 'E701', scriptClose: 'E701' },
    written: false },
  // A work saved where only demo.offline was registered, opened where audit.extra is too: it saves before it runs, and
  // audit.extra starts from its initial value, not from the 100 another work left in the page.
  'EXTENSION-STATE-OF-UNRECORDED': { recorded: ['demo.offline'], savedBeforeRun: true, said: ['5', '0'], afterRun: [['demo.offline', 5], ['audit.extra', 0]] },
  // extensions/examples/meijin.ts: operations with scope "meijin" are read only in 名人 text.
  'EXTENSION-MEIJIN-SCOPE': { meijinChecked: true, meijinSaid: ['7'], ordinaryCommandStopped: 'S317', ordinaryCalculationStopped: 'S317',
    ordinaryEventStopped: 'S317',
    ordinaryEventNameNotice: [['「記録した」の 合図を 送る 文が、この 作品に ありません。送る 部品の 本文に「「記録した」の合図を送る。」と 書きます', 0]], otherExtensionOrdinary: true, blocks: ['ExtensionCommand:demo.offline/remember'], meijinHints: true, ordinaryHints: false,
    invalidScopeRejected: 'E701', scopes: ['meijin', 'meijin', 'meijin'] },
  'EXTENSION-STANDARD-POLICIES': { standardUnchanged: true, standardFrozen: true, keys: 42 },
  'EXTENSION-PROFILE-INHERIT-FINITE-UNLIMITED': { adjustable: 36, inherited: true, finite: true, unlimited: true, stable: true },
  'EXTENSION-PROFILE-STRICT-REGISTRATION': { invalidRejected: 16, engineGuards: 6, duplicateRejected: true, canonicalHash: true },
  'EXTENSION-PROFILE-HOST-REQUIREMENT': { standardAccepted: true, mismatchRejected: true, unknownRejected: true, wrongSelectionRejected: true, unchangedSelection: true },
  'EXTENSION-PROFILE-RUNTIME-ISOLATION': { standardComponents: 500, derivedComponents: 501, isolated: true },
  // extensions/examples/profile.ts: a finite profile with four larger ceilings and an
  // unlimited profile (null = no software ceiling); every other limit inherits Standard.
  'EXTENSION-PROFILE-EXAMPLES': { ids: ['demo.roomy@1.0.0', 'demo.unlimited@1.0.0'],
    roomy: { components: 600, sourceEach: 150000, listItems: 20000, functionOps: 2000000 }, roomyInherits: true,
    unlimited: ['components', 'sourceEach', 'listItems', 'functionOps'], unlimitedInherits: true,
    roomyRuntimeComponents: 600, standardComponents: 500, plainData: true, alteredDetected: true },
  'EXTENSION-REGISTRATION-COLLISION-TYPES': { duplicateRejected: true, invalidNumberRejected: true, promiseCalculationRejected: true, olderStandardRejected: 'E701', currentStandardAccepted: true },
  'EXTENSION-INDEPENDENT-CALCULATIONS': { doubled: 14, shouted: 'HELLO!', independent: true },
  'EXTENSION-COMMAND-EVENT-STATE': { remembered: 9, value: 9, event: 9, restored: 9, handlerContext: { commandsAndCalculations: true, contextKeys: ['runtime','runtimeId','sessionId','signal'], contextFrozen: true, runtimeFrozen: true, viewKeys: ['baseId','direction','isClone','runtimeId','x','y'], freshFrozenView: true, original: [320,200,30], later: [330,200,300], snapshotUnchanged: true, writeRejected: true, writeHasNoEffect: true, cloneOwnView: true, stageNull: true, unknownNull: true, signalsInitiallyActive: true, stopAbortsSessionSignal: true, stopAbortsActiveCallSignal: true, asyncSurfaces: { editor: true, player: true, before: [320,200,30], after: [330,200,300], snapshotUnchanged: true, frozenReadOnly: true, stageNull: true, unknownNull: true } } },
  'EXTENSION-SESSION-CANCELLATION': { staleRejected: true, signalAborted: true, ended: true },
  'EXTENSION-STANDARD-NO-NETWORK': { httpRequests: 0, socketRequests: 0, errors: 0, unblocked: true },
  'EXTENSION-DERIVED-NO-NETWORK': { httpRequests: 0, socketRequests: 0, errors: 0, unblocked: true },
  'EXTENSION-LANGUAGE-BLOCK-ROUNDTRIP': { equivalent: true, value: 14, commandValue: 9 },
  'EXTENSION-DERIVED-SAVE-RESTORE': { profilePreserved: true, extensionsPreserved: true, sourcePreserved: true, unavailableRejected: true },
  'EXTENSION-PROFILE-COUNT-CAPACITY-ROUNDTRIP': { components: 501, chars: 100001, finiteRejected: true, restored: true, integrityRejected: true },
  // A file carries the extensions its work's record names (LANGUAGE「拡張基盤」): those the work uses, what they depend
  // on and those whose kept state is not the initial one; one that cannot be carried refuses only a work that names it.
  // kept is the state the file carries for each extension, as JSON.
  'EXTENSION-STANDALONE-USED-ONLY': { none: { carried: [], kept: [], said: ['ふつう'] },
    used: { carried: ['demo.offline'], kept: [['demo.offline', '{"value":0}']], said: ['6'] },
    dependency: { carried: ['audit.base', 'audit.user'], kept: [['audit.base', 'null'], ['audit.user', 'null']], said: ['2'] },
    kept: { carried: ['demo.offline'], kept: [['demo.offline', '{"value":5}']], said: ['ふつう'] },
    profileOnly: { carried: [], kept: [], said: ['ふつう'] }, unfit: 'E709', unfitDependency: 'E709' },
  // A heading that receives a registered extension event by its Japanese name is told the event's signal name (I137).
  'EXTENSION-EVENT-NAME-NOTICE': {
    event: [{ message: '「記憶した数が変わった」の 合図を 送る 文が、この 作品に ありません。かくちょうの きっかけの 合図は「拡張:demo.offline/changed」という 名前で 受けます',
      button: '「拡張:demo.offline/changed」の 合図に かえる', source: '「拡張:demo.offline/changed」' }],
    fixedSaid: ['来た'],
    ordinary: [{ message: '「開始」の 合図を 送る 文が、この 作品に ありません。送る 部品の 本文に「「開始」の合図を送る。」と 書きます', button: null, source: null }] },
  // The heading's 「いつ動く？」 offers the registered events by their Japanese names; the standard product offers none.
  'EXTENSION-EVENT-HEADING-CHOICE': { standardChoices: 0, choices: [['', 'えらばない'], ['拡張:demo.offline/changed', '拡張「数の記憶」「記憶した数が変わった」']],
    shownLabel: 'かくちょうの きっかけ', written: '拡張:demo.offline/changed', cleared: '', heading: { event: 'message', filter: { message: '拡張:demo.offline/changed' } } },
  'EXTENSION-OFFLINE-STANDALONE': { independentContext: true, value: '14', profilePreserved: true, externalLoaded: true, unconnectedDiagnostic: true, offlineCalculation: true, httpRequests: 0, errors: 0 },
  'EXTENSION-REAL-POPUP-MESSAGECHANNEL': { popup: true, handshake: true, result: 14, notification: 9, disconnected: true, staleRejected: true },
  'EXTENSION-TYPES-UNITS-DEPENDENCIES': { unitPreserved: true, unitRejected: true, dependencyRejected: true, versionRejected: true, stateMismatchRejected: true },
  'EXTENSION-GUI-HISTORY-AUTOSAVE': { typed: true, blocks: true, undo: true, redo: true, reloaded: true },
  'EXTENSION-ASYNC-PARALLEL-PAUSE-STOP': { parallel: true, paused: true, resumed: true, stopped: true, lateIgnored: true, rejectedWithoutReason: { said: ['まえ'], codes: ['R411'] } },
  'EXTENSION-COOPERATIVE-FUNCTION-BUDGET': { overStandard: true, responsive: true, stopped: true, standardRejected: true },
  'EXTENSION-PROFILE-IMPORT-FILE-RUNTIME': { sourceChars: 100001, parsed: true, runtimeList: 100001, listRejected: true, capacityRejected: true },
  'EXTENSION-FAILED-IMPORT-PRESERVES-EDITOR': { source: true, history: true, dirty: true },
  'EXTENSION-RPC-NEGATIVE-LIFECYCLE': { malformed: true, unknown: true, duplicate: true, cancel: true, timeout: true, error: true, impostor: true, oldSession: true, reconnect: true, refusedValueMovesOn: true },
  'EXTENSION-EVENT-LANGUAGE': { value: '9', compiled: true, saved: true, restored: true, eventLifetime: { registeredKeepsRunning: true, registeredValues: [['sprite-1',17],['stage',19]], eventContextsFrozen: true, sameSession: true, stageFirstStatus: true, noBodyFinishes: true, unknownEventFinishes: true, unknownExtensionFinishes: true, unknownCommandRejected: true, unknownCalculationRejected: true, unregisteredEventValueRejected: true, unknownEmissionRejected: true } },
});
export function verifyExtensionFoundation(report, inputs, evidenceDirectory,
  expectedProvenance = { run: process.env.GITHUB_RUN_ID || 'local', attempt: process.env.GITHUB_RUN_ATTEMPT || '1' }) {
  assert.equal(report.schema, 'akari-extension-foundation-v1');
  assert.equal(report.status, 'PASS'); assert.deepEqual(report.snapshot, inputs);
  assert.deepEqual(report.provenance, expectedProvenance, 'sealed source provenance');
  assert.ok(checkReportEnvironment(report.environment,['platform']));
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
