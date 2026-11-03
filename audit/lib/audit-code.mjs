// Checks over the audit code itself (AUDIT.md「監査のコード」): waits by time, reads of the product source as text, and
// ESLint. Each rule holds a baseline of what there was when it came in, which can only shrink.
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {parse} = require('@babel/parser');

const skip = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments']);
const walk = (node, visit) => {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) { if (skip.has(key)) continue; const v = node[key]; if (Array.isArray(v)) v.forEach(x => walk(x, visit)); else if (v && typeof v.type === 'string') walk(v, visit); }
};
const syntax = text => parse(text, {sourceType: 'unambiguous', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, errorRecovery: true});

// Waits by time (x.waitForTimeout(ms)): a page that is slower than the wait fails, a faster one hides a missing state.
// A wait is for a state (a selector, a function, an event). WAIT_BASELINE holds the waits by time each file had when this
// check came in; a file may not add one, and a file that has fewer must lower its entry.
export const WAIT_BASELINE = Object.freeze({
  'audit/browser/cases/browser-boundaries.cjs': 1,
  'audit/browser/cases/browser-condition.cjs': 2,
  'audit/browser/cases/browser-design-limits.cjs': 3,
  'audit/browser/cases/browser-event-traces.cjs': 3,
  'audit/browser/cases/browser-events.cjs': 2,
  'audit/browser/cases/browser-owner-delete.cjs': 1,
  'audit/browser/cases/browser-product.cjs': 3,
  'audit/browser/cases/browser-runtime-limits.cjs': 3,
  'audit/browser/cases/browser-runtime.cjs': 9,
  'audit/browser/cases/browser-schemas.cjs': 7,
  'audit/browser/cases/browser-session.cjs': 5,
  'audit/browser/cases/browser-storage-media.cjs': 3,
  'audit/browser/cases/modern-browser.cjs': 4,
  'audit/browser/cases/parent-qa.cjs': 8,
  'audit/browser/cases/run-editor-regression.cjs': 3,
  'audit/browser/cases/ui-interactions.cjs': 15,
  'audit/browser/cases/ui-shell.cjs': 2,
  'audit/browser/cases/ui-stage-gesture.cjs': 2,
  'audit/browser/cases/workbench-matrix.cjs': 4,
  'audit/lib/artwork-touch-observations.cjs': 6,
  'audit/lib/run-preview-contract.mjs': 3,
  'audit/lib/run-stage-minimum-observations.cjs': 6,
  'audit/lib/stop-press.cjs': 1,
  'audit/tests/audio-output-browser.mjs': 1,
  'audit/tests/basic-intents-browser.mjs': 4,
  'audit/tests/block-field-width.mjs': 1,
  'audit/tests/child-diagnostics-browser.mjs': 1,
  'audit/tests/code-assist-browser.mjs': 9,
  'audit/tests/composition-acceptance.mjs': 3,
  'audit/tests/designer-zoom.mjs': 4,
  'audit/tests/editor-browser.mjs': 2,
  'audit/tests/entry-workshop-browser.mjs': 2,
  'audit/tests/export-open-browser.cjs': 10,
  'audit/tests/extension-foundation.mjs': 10,
  'audit/tests/japanese-intent-browser.mjs': 5,
  'audit/tests/review-readable.mjs': 2,
  'audit/tests/runtime-boundary/browser.cjs': 8,
  'audit/tests/runtime-boundary/entry-browser.cjs': 2,
  'audit/tests/runtime-boundary/formal-player-browser.cjs': 3,
  'audit/tests/samples.mjs': 5,
  'audit/tests/spec-expectations-ui.mjs': 188,
  'audit/tests/speech-display-browser.mjs': 1,
  'audit/tests/structured-editing-browser.mjs': 2,
  'audit/tests/toolbar-stage-browser.cjs': 2,
  'audit/tests/ui-buttons.mjs': 8,
  'audit/tests/ux-edit-browser.mjs': 3,
  'audit/tests/ux-phrase-trigger.mjs': 1,
  'audit/tests/workspace-history-browser.mjs': 2,
});
export function timeWaits(text) {
  let count = 0;
  walk(syntax(text).program, n => { if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property?.name === 'waitForTimeout') count++; });
  return count;
}
// texts: {file: text} for the audit code files. Returns the issues; none accepts the code.
export function timeWaitIssues(texts, baseline = WAIT_BASELINE) {
  const issues = [];
  for (const [file, text] of Object.entries(texts).sort(([a], [b]) => a.localeCompare(b))) {
    const count = timeWaits(text), allowed = baseline[file] ?? 0;
    if (count > allowed) issues.push(file + ' waits by time ' + count + ' times (at most ' + allowed + '); wait for a state instead');
    else if (count < allowed) issues.push(file + ' waits by time ' + count + ' times now; lower its WAIT_BASELINE entry to ' + count);
  }
  for (const file of Object.keys(baseline)) if (!Object.hasOwn(texts, file)) issues.push(file + ' is in WAIT_BASELINE but no longer exists; remove it');
  return issues;
}

// Reads of the product source as text (a read call — readFileSync, readFile, read, text, readText — given a path under
// src/, a product file name or currentProductFile()): an audit that cuts the product source by characters reads
// another part, or nothing, after the product is rewritten. The shared readers (productScript, the product test host)
// read the product; a check takes the parsed result or the loaded product from them. SOURCE_READ_BASELINE holds the
// reads each file had when this check came in.
export const SOURCE_READ_BASELINE = Object.freeze({
  'audit/lib/child-ux-contract.mjs': 2,
  'audit/lib/code-assist-contract.mjs': 1,
  'audit/lib/code-assist-vocabulary.mjs': 1,
  'audit/lib/license-contract.cjs': 1,
  'audit/lib/source-boundaries.mjs': 1,
  'audit/test-map.mjs': 1,
  'audit/tests/actions-transfer-values.mjs': 1,
  'audit/tests/audio-codecs.mjs': 1,
  'audit/tests/basic-intents.mjs': 1,
  'audit/tests/change-guard-negative.mjs': 1,
  'audit/tests/child-ux.mjs': 2,
  'audit/tests/ci-regression.mjs': 1,
  'audit/tests/command-meaning.mjs': 1,
  'audit/tests/data-form-values.mjs': 1,
  'audit/tests/designer-zoom.mjs': 2,
  'audit/tests/document-units.mjs': 1,
  'audit/tests/dom-render-regression.cjs': 1,
  'audit/tests/draft-persistence.mjs': 1,
  'audit/tests/editor-assets.mjs': 1,
  'audit/tests/editor-syntax-reuse.mjs': 1,
  'audit/tests/extension-foundation-negative.mjs': 1,
  'audit/tests/finite-semantic-variants.mjs': 1,
  'audit/tests/language-boundaries.mjs': 2,
  'audit/tests/language-release.mjs': 2,
  'audit/tests/license-browser.mjs': 1,
  'audit/tests/license-static.mjs': 1,
  'audit/tests/manual-docs.mjs': 1,
  'audit/tests/natural-roles.mjs': 1,
  'audit/tests/node-product.mjs': 1,
  'audit/tests/numeric-display.mjs': 1,
  'audit/tests/product-source.mjs': 5,
  'audit/tests/release-policy-negative.mjs': 1,
  'audit/tests/release-renumber.mjs': 5,
  'audit/tests/resource-references.mjs': 1,
  'audit/tests/review-harness-negative.mjs': 1,
  'audit/tests/samples-negative.mjs': 1,
  'audit/tests/search-bindings.mjs': 1,
  'audit/tests/semantic-negative-pairs.mjs': 1,
  'audit/tests/source-ownership.mjs': 1,
  'audit/tests/static-contract.mjs': 1,
  'audit/tests/ux-edit-language.mjs': 2,
  'audit/tests/ux-normal-language.mjs': 1,
});
const readers = new Set(['readFileSync', 'readFile', 'read', 'text', 'readText']);
const productPath = value => /^src\//.test(value) || /^Akari_\d+_\d+_\d+\.html$/.test(value);
export function productSourceReads(text) {
  let count = 0;
  walk(syntax(text).program, n => {
    if (n.type !== 'CallExpression' || !readers.has(n.callee.type === 'Identifier' ? n.callee.name : n.callee.property?.name)) return;
    let named = false;
    for (const argument of n.arguments) walk(argument, x => {
      if (x.type === 'StringLiteral' && productPath(x.value)) named = true;
      if (x.type === 'TemplateLiteral' && productPath(x.quasis[0].value.cooked)) named = true;
      if (x.type === 'CallExpression' && (x.callee.name ?? x.callee.property?.name) === 'currentProductFile') named = true;
    });
    if (named) count++;
  });
  return count;
}
export function sourceReadIssues(texts, baseline = SOURCE_READ_BASELINE) {
  const issues = [];
  for (const [file, text] of Object.entries(texts).sort(([a], [b]) => a.localeCompare(b))) {
    const count = productSourceReads(text), allowed = baseline[file] ?? 0;
    if (count > allowed) issues.push(file + ' reads the product source as text ' + count + ' times (at most ' + allowed + '); take it from a shared reader instead');
    else if (count < allowed) issues.push(file + ' reads the product source as text ' + count + ' times now; lower its SOURCE_READ_BASELINE entry to ' + count);
  }
  for (const file of Object.keys(baseline)) if (!Object.hasOwn(texts, file)) issues.push(file + ' is in SOURCE_READ_BASELINE but no longer exists; remove it');
  return issues;
}

// ESLint over the audit code: names that are not defined, names that are never used, and a function copied whole —
// the rules that, on the product, stop a name left on its old spelling, dead code and copied helpers. The audit code
// runs in node and, inside page.evaluate, in the page, so both sets of globals hold, and the product's Akari; a name a
// test puts into the page starts with __ by convention and is not reported. A name left only to skip it in a rest
// pattern, or an unused catch parameter, is no finding. The suites (audit/suites) are joined into one script with the
// product and are not linted file by file. LINT_BASELINE holds each file's findings by rule when this check came in.
export const auditLintRules = Object.freeze({'no-undef': 'error', 'no-unused-vars': ['error', {ignoreRestSiblings: true, caughtErrors: 'none'}], 'sonarjs/no-identical-functions': 'error'});
export const auditLintFile = file => /^audit\/.+\.(?:mjs|cjs|js)$/.test(file) && !file.startsWith('audit/suites/');
let lintEngine;
function auditEslint(root) {
  if (lintEngine) return lintEngine;
  const {ESLint} = require('eslint'), sonarjs = require('eslint-plugin-sonarjs'), globals = require('globals');
  const known = {...globals.node, ...globals.browser, Akari: 'readonly'}, options = sourceType => ({ecmaVersion: 'latest', sourceType, globals: known});
  lintEngine = new ESLint({cwd: root, overrideConfigFile: true, overrideConfig: [
    {files: ['**/*.mjs'], languageOptions: options('module')},
    {files: ['**/*.cjs'], languageOptions: options('commonjs')},
    {files: ['**/*.js'], languageOptions: options('script')},
    {plugins: {sonarjs: sonarjs.default ?? sonarjs}, linterOptions: {noInlineConfig: true, reportUnusedDisableDirectives: 'off'}, rules: auditLintRules},
  ]});
  return lintEngine;
}
// {file: {rule: count}} for the given audit code texts ({file: text}), files from the repository root.
export async function auditLintCounts(root, texts) {
  const counts = {}, engine = auditEslint(root);
  for (const [file, text] of Object.entries(texts)) {
    if (!auditLintFile(file)) continue;
    const [result] = await engine.lintText(text, {filePath: path.join(root, file)});
    for (const m of result.messages) {
      if (m.ruleId === 'no-undef' && /^'__\w+' is not defined/.test(m.message)) continue;
      const rule = m.ruleId ?? 'parse';
      (counts[file] ??= {})[rule] = (counts[file][rule] ?? 0) + 1;
    }
  }
  return counts;
}
export function auditLintIssues(counts, texts, baseline = LINT_BASELINE) {
  const issues = [];
  for (const file of Object.keys(texts).filter(auditLintFile).sort()) {
    const got = counts[file] ?? {}, allowed = baseline[file] ?? {};
    for (const rule of [...new Set([...Object.keys(got), ...Object.keys(allowed)])].sort()) {
      const count = got[rule] ?? 0, limit = allowed[rule] ?? 0;
      if (count > limit) issues.push(file + ' has ' + count + ' ' + rule + ' findings (at most ' + limit + ')');
      else if (count < limit) issues.push(file + ' has ' + count + ' ' + rule + ' findings now; lower its LINT_BASELINE entry to ' + count);
    }
  }
  for (const file of Object.keys(baseline)) if (!Object.hasOwn(texts, file)) issues.push(file + ' is in LINT_BASELINE but no longer exists; remove it');
  return issues;
}
export const LINT_BASELINE = Object.freeze({
  'audit/browser/cases/browser-asset-limits.cjs': {'no-unused-vars': 2},
  'audit/browser/cases/browser-boundaries.cjs': {'no-unused-vars': 3},
  'audit/browser/cases/browser-condition.cjs': {'no-unused-vars': 2},
  'audit/browser/cases/browser-design-limits.cjs': {'no-unused-vars': 2},
  'audit/browser/cases/browser-event-traces.cjs': {'no-unused-vars': 2},
  'audit/browser/cases/browser-events.cjs': {'no-unused-vars': 3},
  'audit/browser/cases/browser-media-boundaries.cjs': {'no-undef': 1, 'no-unused-vars': 3},
  'audit/browser/cases/browser-owner-delete.cjs': {'no-unused-vars': 3},
  'audit/browser/cases/browser-product.cjs': {'no-unused-vars': 3},
  'audit/browser/cases/browser-runtime-limits.cjs': {'no-unused-vars': 2},
  'audit/browser/cases/browser-runtime.cjs': {'no-unused-vars': 3},
  'audit/browser/cases/browser-schemas.cjs': {'no-undef': 3, 'no-unused-vars': 1},
  'audit/browser/cases/browser-session.cjs': {'no-undef': 1, 'no-unused-vars': 3},
  'audit/browser/cases/browser-storage-media.cjs': {'no-unused-vars': 3},
  'audit/browser/cases/long-regression.cjs': {'no-unused-vars': 3},
  'audit/browser/cases/modern-browser.cjs': {'no-unused-vars': 3},
  'audit/browser/cases/parent-qa.cjs': {'no-unused-vars': 3},
  'audit/browser/cases/perf-input.cjs': {'no-unused-vars': 4},
  'audit/browser/cases/regression-setup.cjs': {'no-undef': 1},
  'audit/browser/cases/run-editor-regression.cjs': {'no-unused-vars': 3},
  'audit/browser/cases/ui-compact-menu.cjs': {'no-unused-vars': 3},
  'audit/browser/cases/ui-shell.cjs': {'no-unused-vars': 3},
  'audit/browser/cases/ui-stage-gesture.cjs': {'no-unused-vars': 3},
  'audit/browser/cases/workbench-direct.cjs': {'no-unused-vars': 3},
  'audit/browser/cases/workbench-matrix.cjs': {'no-unused-vars': 3},
  'audit/lib/artwork-touch-observations.cjs': {'no-undef': 4},
  'audit/lib/basic-intents-runtime.mjs': {'no-unused-vars': 1},
  'audit/lib/child-ux-blocks.mjs': {'no-unused-vars': 1},
  'audit/lib/child-ux-contract.mjs': {'no-unused-vars': 1},
  'audit/lib/extension-runtime-observations.mjs': {'no-undef': 12},
  'audit/lib/gate-ui-fixture.mjs': {'no-undef': 1},
  'audit/lib/native-zoom.mjs': {'no-undef': 3},
  'audit/lib/product-test-host.mjs': {'no-unused-vars': 1},
  'audit/lib/source-split.mjs': {'no-unused-vars': 1},
  'audit/lib/spec-expectations.mjs': {'no-unused-vars': 1},
  'audit/lib/ux-phrase-trigger-contract.mjs': {'no-unused-vars': 1},
  'audit/run-editor-surface-tests.mjs': {'no-undef': 1},
  'audit/run-language-tests.mjs': {'no-undef': 1},
  'audit/tests/actions-transfer-verify.mjs': {'no-unused-vars': 1},
  'audit/tests/audio-output-browser.mjs': {'no-undef': 7},
  'audit/tests/block-field-width.mjs': {'no-unused-vars': 1},
  'audit/tests/child-language-ui-browser.mjs': {'no-unused-vars': 1},
  'audit/tests/child-ux.mjs': {'no-unused-vars': 1},
  'audit/tests/ci-regression.mjs': {'no-unused-vars': 1},
  'audit/tests/code-assist-browser.mjs': {'no-undef': 2},
  'audit/tests/component-controls-browser.mjs': {'no-undef': 6},
  'audit/tests/designer-zoom.mjs': {'no-unused-vars': 1},
  'audit/tests/editor-assets.mjs': {'no-unused-vars': 1},
  'audit/tests/extension-foundation.mjs': {'no-undef': 67},
  'audit/tests/japanese-intent-browser.mjs': {'no-unused-vars': 1},
  'audit/tests/license-static.mjs': {'no-unused-vars': 2},
  'audit/tests/normal-product.mjs': {'no-unused-vars': 2},
  'audit/tests/resource-references.mjs': {'no-unused-vars': 1},
  'audit/tests/review-readable.mjs': {'no-unused-vars': 1},
  'audit/tests/runtime-boundary/browser.cjs': {'no-unused-vars': 2},
  'audit/tests/runtime-boundary/formal-player-browser.cjs': {'no-unused-vars': 1},
  'audit/tests/runtime-boundary/node.cjs': {'no-unused-vars': 3},
  'audit/tests/runtime-boundary/parser-tests.cjs': {'no-unused-vars': 1},
  'audit/tests/sentence-form-coverage.mjs': {'no-unused-vars': 1},
  'audit/tests/source-ownership.mjs': {'no-unused-vars': 2},
  'audit/tests/speech-display-browser.mjs': {'no-undef': 5},
  'audit/tests/speech-name-layout-browser.mjs': {'no-undef': 2},
  'audit/tests/speech-preview-browser.mjs': {'no-undef': 2},
  'audit/tests/static-contract.mjs': {'no-unused-vars': 1},
  'audit/tests/toolbar-stage-browser.cjs': {'no-undef': 6, 'no-unused-vars': 1},
  'audit/tests/ui-buttons.mjs': {'no-undef': 11, 'no-unused-vars': 2},
  'audit/tests/ux-edit-browser.mjs': {'no-undef': 21},
  'audit/tests/ux-insertion-context-browser.mjs': {'no-undef': 12, 'no-unused-vars': 1},
  'audit/tests/ux-normal-browser.mjs': {'no-undef': 1, 'no-unused-vars': 2},
  'audit/tests/ux-normal-matrix.mjs': {'no-undef': 7},
  'audit/tests/ux-normal-speech.mjs': {'no-undef': 9},
  'audit/tests/ux-phrase-list.mjs': {'no-undef': 4, 'no-unused-vars': 1},
  'audit/tests/ux-phrase-speech.mjs': {'no-undef': 2},
});
