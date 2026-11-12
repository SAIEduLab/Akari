// ESLint over the product script (AUDIT.md「ソースの一致」). The build joins src/ into one closure, so the script is
// read whole, as the browser runs it, and each finding is traced back to its src file and line. Every rule here has no
// finding in the product; each catches a way an edit breaks code without breaking a test: a renamed or misspelt name,
// a name declared twice, a duplicated key or case, code that cannot run, a value or function nothing uses, a
// replacement that expands $& in a name, and a function or branch written twice.
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);

// The browser names the product uses. The list is closed: a name outside it is refused even when the browser has a
// global by that name (a local named like one, renamed on one side only, would otherwise pass as the global).
export const LINT_GLOBALS = Object.freeze(['AbortController', 'Blob', 'CSS', 'Element', 'Event', 'File', 'HTMLSelectElement', 'Image',
  'InputEvent', 'IntersectionObserver', 'MessageChannel', 'MutationObserver', 'Node', 'NodeFilter', 'OffscreenCanvas', 'ResizeObserver',
  'TextEncoder', 'URL', 'atob', 'btoa', 'cancelAnimationFrame', 'clearInterval', 'clearTimeout', 'confirm', 'createImageBitmap', 'crypto',
  'document', 'getComputedStyle', 'indexedDB', 'localStorage', 'matchMedia', 'performance', 'prompt', 'queueMicrotask',
  'requestAnimationFrame', 'setInterval', 'setTimeout', 'structuredClone', 'window']);

export const LINT_RULES = Object.freeze({
  'no-undef': 'error', 'no-redeclare': 'error', 'no-dupe-keys': 'error', 'no-duplicate-case': 'error', 'no-unreachable': 'error',
  'no-self-assign': 'error', 'no-self-compare': 'error', 'no-dupe-else-if': 'error', 'no-fallthrough': 'error', 'no-loss-of-precision': 'error',
  'no-constant-condition': 'error', 'no-unsafe-finally': 'error', 'no-sparse-arrays': 'error', 'array-callback-return': 'error',
  'no-unmodified-loop-condition': 'error', 'no-constant-binary-expression': 'error', 'no-unreachable-loop': 'error', 'no-useless-catch': 'error',
  'no-empty': ['error', {allowEmptyCatch: true}], 'eqeqeq': ['error', 'always', {null: 'ignore'}],
  'no-use-before-define': ['error', {functions: false, classes: false, variables: false}],
  'no-unused-vars': ['error', {args: 'none', caughtErrors: 'none', ignoreRestSiblings: true}],
  'unicorn/no-unsafe-string-replacement': 'error',
  'sonarjs/no-identical-functions': 'error', 'sonarjs/no-all-duplicated-branches': 'error', 'sonarjs/no-identical-conditions': 'error',
  'sonarjs/no-identical-expressions': 'error', 'sonarjs/no-element-overwrite': 'error', 'sonarjs/no-unused-collection': 'error',
  'sonarjs/no-use-of-empty-return-value': 'error', 'sonarjs/no-redundant-jump': 'error',
});

// One short text per rule that the rule must refuse: the rule is shown to work, not only to be quiet.
export const LINT_PROBES = Object.freeze({
  'no-undef': 'renamedAway();',
  'no-redeclare': 'var twice = 1; var twice = 2;',
  'no-dupe-keys': 'void ({key: 1, key: 2});',
  'no-duplicate-case': 'switch (globalThis.x) { case 1: break; case 1: break; }',
  'no-unreachable': 'function early() { return 1; early(); }',
  'no-self-assign': 'let same = 1; same = same;',
  'no-self-compare': 'if (globalThis.x === globalThis.x) void 0;',
  'no-dupe-else-if': 'if (globalThis.a) void 0; else if (globalThis.a) void 1;',
  'no-fallthrough': 'switch (globalThis.x) { case 1: globalThis.f(); case 2: break; }',
  'no-loss-of-precision': 'void 9007199254740993;',
  'no-constant-condition': 'if (true) void 0;',
  'no-unsafe-finally': 'function late() { try { return 1; } finally { return 2; } } late();',
  'no-sparse-arrays': 'void [1, , 2];',
  'array-callback-return': 'globalThis.list.map(item => { void item; });',
  'no-unmodified-loop-condition': 'let going = true; while (going) globalThis.f();',
  'no-constant-binary-expression': 'if (!globalThis.x == null) void 0;',
  'no-unreachable-loop': 'for (const item of globalThis.list) { void item; break; }',
  'no-useless-catch': 'try { globalThis.f(); } catch (error) { throw error; }',
  'no-empty': 'if (globalThis.x) {}',
  'eqeqeq': 'if (globalThis.x == 1) void 0;',
  'no-use-before-define': '{ void later; const later = 1; }',
  'no-unused-vars': 'function keep() { const unused = 1; } keep();',
  'unicorn/no-unsafe-string-replacement': 'globalThis.text.replace(\'a\', globalThis.name);',
  // The rule compares functions of three lines or more.
  'sonarjs/no-identical-functions': 'function one(v) {\n  const a = v + 1;\n  const b = a * 2;\n  return b - 3;\n}\nfunction two(v) {\n  const a = v + 1;\n  const b = a * 2;\n  return b - 3;\n}\none(1); two(1);',
  'sonarjs/no-all-duplicated-branches': 'void (globalThis.x ? 1 : 1);',
  'sonarjs/no-identical-conditions': 'if (globalThis.a) globalThis.f(); else if (globalThis.b) globalThis.g(); else if (globalThis.a) globalThis.h();',
  'sonarjs/no-identical-expressions': 'void (globalThis.a && globalThis.a);',
  'sonarjs/no-element-overwrite': 'const cells = []; cells[0] = 1; cells[0] = 2; globalThis.f(cells);',
  'sonarjs/no-unused-collection': 'function collect() { const seen = new Set(); seen.add(1); } collect();',
  'sonarjs/no-use-of-empty-return-value': 'function nothing() { globalThis.f(); }\nconst got = nothing();\nglobalThis.f(got);',
  'sonarjs/no-redundant-jump': 'function tidy() { globalThis.f(); return; } tidy();',
});

let engine;
async function eslint(root) {
  if (engine) return engine;
  const {ESLint} = require('eslint');
  const unicorn = require('eslint-plugin-unicorn'), sonarjs = require('eslint-plugin-sonarjs');
  engine = new ESLint({cwd: root, overrideConfigFile: true, overrideConfig: [{
    files: ['**/*.js'],
    languageOptions: {ecmaVersion: 2024, sourceType: 'script', globals: Object.fromEntries([...LINT_GLOBALS, 'globalThis'].map(name => [name, 'readonly']))},
    plugins: {unicorn: unicorn.default ?? unicorn, sonarjs: sonarjs.default ?? sonarjs},
    linterOptions: {noInlineConfig: true, reportUnusedDisableDirectives: 'off'},
    rules: LINT_RULES,
  }]});
  return engine;
}
export async function lintText(root, text) {
  const [result] = await (await eslint(root)).lintText(text, {filePath: path.join(root, 'akari-product.js')});
  return result.messages;
}
// Each finding as "<src file>:<line> <rule> <message>", traced through the lines the build mapped (productScript).
export function lintFindings(messages, {lines}) {
  return messages.map(m => {
    const where = lines[m.line - 1], at = where ? where.file + ':' + where.line : 'product:' + m.line;
    return at + ' ' + (m.ruleId ?? 'parse') + ' ' + m.message;
  });
}
