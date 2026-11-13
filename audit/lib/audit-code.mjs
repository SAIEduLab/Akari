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

// Waits by time (x.waitForTimeout(ms), written in any way, and a sleep of timers/promises): a page that is slower than
// the wait fails, a faster one hides a missing state.
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
  const program = syntax(text).program, keyOf = scopeNames(), sleeps = new Set();
  const name = n => n.type === 'Identifier' ? n.name : n.type === 'StringLiteral' ? n.value : n.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis[0].value.cooked : null;
  const member = n => n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression' ? (n.computed ? name(n.property) : n.property.name) : null;
  const callee = n => n.type === 'CallExpression' || n.type === 'OptionalCallExpression' ? n.callee : null;
  // The sleeps of timers/promises (setTimeout, setInterval, scheduler), imported or required, by the names they are given.
  const timers = source => /^(?:node:)?timers\/promises$/.test(source ?? '');
  walkWith(program, (n, parents) => {
    if (n.type === 'ImportDeclaration' && timers(n.source.value))
      for (const s of n.specifiers) if (s.type !== 'ImportSpecifier' || ['setTimeout', 'setInterval', 'scheduler'].includes(name(s.imported))) sleeps.add(keyOf(s.local.name, parents));
    if (n.type === 'VariableDeclarator' && n.init && callee(n.init)?.type === 'Identifier' && n.init.callee.name === 'require' && timers(n.init.arguments[0]?.value))
      for (const id of patternIds(n.id)) sleeps.add(keyOf(id.name, parents));
  });
  // waitForTimeout by any spelling: called (x.…, x?.…, x['…']), taken out (bind) or taken apart
  walk(program, n => {
    if (member(n) === 'waitForTimeout') count++;
    if (n.type === 'ObjectPattern') count += n.properties.filter(p => p.type === 'ObjectProperty' && name(p.key) === 'waitForTimeout').length;
  });
  // a sleep of timers/promises, called by its name or as a member of the module
  walkWith(program, (n, parents) => {
    if (callee(n)?.type === 'Identifier' && sleeps.has(keyOf(n.callee.name, parents))) count++;
    else if (callee(n) && member(callee(n)) && callee(n).object?.type === 'Identifier' && sleeps.has(keyOf(callee(n).object.name, parents))) count++;
  });
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

// Promises that end only on a timer (new Promise(r => setTimeout(r, ms)), or with () => r(); in the page too): a wait
// by time written without waitForTimeout. A helper whose body (one expression or one return) is such a promise, or
// makes one in the page (page.evaluate(() => new Promise(…))), waits at each call of it by its name, and the promise
// in it is not counted again. Not counted: a promise a timer rejects (a deadline), one it resolves with a value (an
// answer given later), and a while loop whose whole body awaits one (it waits for the state its test reads).
// TIMER_PROMISE_COUNTS holds each file's count exactly: a file may not add one, and one that removes one lowers it.
export const TIMER_PROMISE_COUNTS = Object.freeze({
  'audit/tests/child-diagnostics-browser.mjs': 3,
  'audit/tests/entry-workshop-browser.mjs': 1,
  'audit/tests/extension-foundation.mjs': 18,
  'audit/tests/ux-edit-browser.mjs': 1,
});
export function timerPromises(text) {
  let count = 0;
  const program = syntax(text).program, keyOf = scopeNames(), helpers = new Set(), inHelpers = new Set();
  const callee = n => n.type === 'CallExpression' || n.type === 'OptionalCallExpression' ? n.callee : null;
  const calleeName = c => c.type === 'Identifier' ? c.name : (c.type === 'MemberExpression' || c.type === 'OptionalMemberExpression') && !c.computed ? c.property.name : null;
  const only = body => body.type === 'BlockStatement' ? (body.body.length === 1 && body.body[0].type === 'ExpressionStatement' ? body.body[0].expression : null) :
    body.type === 'ExpressionStatement' ? body.expression : body;
  const timerPromise = n => {
    if (n.type !== 'NewExpression' || n.callee.type !== 'Identifier' || n.callee.name !== 'Promise') return false;
    const executor = n.arguments[0];
    if (!executor || !/Function/.test(executor.type) || !executor.params.length || executor.params[0].type !== 'Identifier') return false;
    const resolve = executor.params[0].name, call = only(executor.body), timer = call && callee(call);
    if (!timer || !['setTimeout', 'setInterval'].includes(calleeName(timer))) return false;
    const done = call.arguments[0];
    if (done?.type === 'Identifier') return done.name === resolve;
    const inner = done && /Function/.test(done.type) ? only(done.body) : null;
    return !!inner && callee(inner)?.type === 'Identifier' && inner.callee.name === resolve && !inner.arguments.length;
  };
  const polled = parents => { const loop = parents.findLast(p => p.type === 'WhileStatement'); return !!loop && only(loop.body)?.type === 'AwaitExpression' && parents.includes(only(loop.body)); };
  walkWith(program, (n, parents) => {
    const fn = n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && /Function/.test(n.init.type) ? n.init : n.type === 'FunctionDeclaration' && n.id ? n : null;
    if (!fn) return;
    const body = fn.body.type !== 'BlockStatement' ? fn.body : fn.body.body.length === 1 && fn.body.body[0].type === 'ReturnStatement' ? fn.body.body[0].argument : null;
    const made = body && (timerPromise(body) ? body : callee(body) && body.arguments.length === 1 && /Function/.test(body.arguments[0].type) && timerPromise(body.arguments[0].body) ? body.arguments[0].body : null);
    if (made) { helpers.add(keyOf(n.id.name, parents)); inHelpers.add(made); }
  });
  walkWith(program, (n, parents) => {
    if (timerPromise(n) && !inHelpers.has(n) && !polled(parents)) count++;
    else if (callee(n)?.type === 'Identifier' && helpers.has(keyOf(n.callee.name, parents)) && !polled(parents)) count++;
  });
  return count;
}
export function timerPromiseIssues(texts, counts = TIMER_PROMISE_COUNTS) {
  const issues = [];
  for (const [file, text] of Object.entries(texts).sort(([a], [b]) => a.localeCompare(b))) {
    const count = timerPromises(text), table = counts[file] ?? 0;
    if (count > table) issues.push(file + ' has ' + count + ' promises that end only on a timer (TIMER_PROMISE_COUNTS has ' + table + '); wait for a state instead');
    else if (count < table) issues.push(file + ' has ' + count + ' promises that end only on a timer now; lower its TIMER_PROMISE_COUNTS entry to ' + count);
  }
  for (const file of Object.keys(counts)) if (!Object.hasOwn(texts, file)) issues.push(file + ' is in TIMER_PROMISE_COUNTS but no longer exists; remove it');
  return issues;
}

// Reads of the product source as text (a read call — readFileSync, readFile, read, text, readText — given a path under
// src/, a product file name or currentProductFile()): an audit that cuts the product source by characters reads
// another part, or nothing, after the product is rewritten. The shared readers (productScript, the product test host)
// read the product; a check takes the parsed result or the loaded product from them. SOURCE_READ_BASELINE holds the
// reads each file had when this check came in, and those through a name bound to such a path when they came to be counted.
export const SOURCE_READ_BASELINE = Object.freeze({
  'audit/browser/cases/browser-media-boundaries.cjs': 1,
  'audit/browser/cases/parent-qa.cjs': 1,
  'audit/browser/cases/run-editor-regression.cjs': 1,
  'audit/browser/cases/ui-compact-menu.cjs': 1,
  'audit/browser/cases/ui-interactions.cjs': 3,
  'audit/browser/cases/ui-shell.cjs': 2,
  'audit/browser/cases/ui-stage-gesture.cjs': 2,
  'audit/lib/child-ux-contract.mjs': 2,
  'audit/lib/code-assist-contract.mjs': 1,
  'audit/lib/code-assist-vocabulary.mjs': 1,
  'audit/lib/license-contract.cjs': 1,
  'audit/lib/page-types.mjs': 3,
  'audit/lib/release-renumber.mjs': 1,
  'audit/lib/syntax-types.mjs': 1,
  'audit/run-editor-surface-tests.mjs': 1,
  'audit/run-language-tests.mjs': 1,
  'audit/test-map.mjs': 1,
  'audit/tests/actions-transfer-values.mjs': 1,
  'audit/tests/audio-codecs.mjs': 1,
  'audit/tests/basic-intents.mjs': 1,
  'audit/tests/block-field-width.mjs': 1,
  'audit/tests/change-guard-negative.mjs': 13,
  'audit/tests/child-ux.mjs': 2,
  'audit/tests/ci-regression.mjs': 1,
  'audit/tests/command-meaning.mjs': 1,
  'audit/tests/data-form-values.mjs': 1,
  'audit/tests/designer-zoom.mjs': 2,
  'audit/tests/document-units.mjs': 1,
  'audit/tests/dom-render-regression.cjs': 1,
  'audit/tests/draft-persistence.mjs': 1,
  'audit/tests/editor-assets.mjs': 1,
  'audit/tests/editor-browser.mjs': 2,
  'audit/tests/editor-syntax-reuse.mjs': 1,
  'audit/tests/entry-workshop-core.mjs': 1,
  'audit/tests/export-open-browser.cjs': 4,
  'audit/tests/extension-foundation-negative.mjs': 1,
  'audit/tests/extension-foundation.mjs': 3,
  'audit/tests/finite-semantic-variants.mjs': 1,
  'audit/tests/format-compatibility.mjs': 1,
  'audit/tests/japanese-intent-browser.mjs': 1,
  'audit/tests/language-boundaries.mjs': 2,
  'audit/tests/language-release.mjs': 29,
  'audit/tests/license-browser.mjs': 1,
  'audit/tests/license-static.mjs': 1,
  'audit/tests/manual-docs.mjs': 1,
  'audit/tests/natural-roles.mjs': 1,
  'audit/tests/node-product.mjs': 1,
  'audit/tests/numeric-display.mjs': 1,
  'audit/tests/product-source.mjs': 23,
  'audit/tests/release-policy-negative.mjs': 1,
  'audit/tests/release-renumber.mjs': 17,
  'audit/tests/resource-references.mjs': 1,
  'audit/tests/review-harness-negative.mjs': 1,
  'audit/tests/samples-negative.mjs': 1,
  'audit/tests/samples.mjs': 2,
  'audit/tests/search-bindings.mjs': 1,
  'audit/tests/semantic-negative-pairs.mjs': 1,
  'audit/tests/sentence-form-coverage.mjs': 1,
  'audit/tests/source-ownership.mjs': 1,
  'audit/tests/spec-examples.mjs': 1,
  'audit/tests/spec-expectations-run.mjs': 1,
  'audit/tests/spec-expectations-ui.mjs': 4,
  'audit/tests/static-contract.mjs': 1,
  'audit/tests/ux-edit-language.mjs': 2,
  'audit/tests/ux-normal-language.mjs': 1,
});
const readers = new Set(['readFileSync', 'readFile', 'read', 'text', 'readText']);
const productPath = value => /^src\//.test(value) || /^Akari_\d+_\d+_\d+\.html$/.test(value);
const readerCall = n => n.type === 'CallExpression' && readers.has(n.callee.type === 'Identifier' ? n.callee.name : n.callee.property?.name);
// The scopes of a program, for the names a check follows: a name is the one its nearest scope declares (a function
// with its parameters, a block, a for statement, a catch clause, the program).
const scopeKinds = /^(?:Program|BlockStatement|For(?:Of|In)?Statement|CatchClause|SwitchStatement|(?:Arrow)?Function(?:Declaration|Expression)|ObjectMethod|ClassMethod)$/;
const patternIds = (target, out = []) => {
  if (!target) return out;
  if (target.type === 'Identifier') out.push(target);
  else if (target.type === 'ArrayPattern') target.elements.forEach(e => patternIds(e, out));
  else if (target.type === 'ObjectPattern') target.properties.forEach(p => patternIds(p.type === 'RestElement' ? p.argument : p.value, out));
  else if (target.type === 'AssignmentPattern') patternIds(target.left, out);
  else if (target.type === 'RestElement') patternIds(target.argument, out);
  else if (target.type === 'VariableDeclaration') target.declarations.forEach(d => patternIds(d.id, out));
  return out;
};
function scopeNames() {
  const declared = new WeakMap(), ids = new WeakMap();
  const own = scope => {
    if (declared.has(scope)) return declared.get(scope);
    const names = new Set(), add = target => patternIds(target).forEach(id => names.add(id.name)), lexical = d => d.type === 'VariableDeclaration' && d.kind !== 'var';
    // (a var belongs to the function or the program it is in, from any block or for statement inside them)
    if (scope.type === 'Program' || /Function|Method/.test(scope.type)) {
      const hoist = n => { if (!n || typeof n.type !== 'string' || (n !== scope && /Function|Method/.test(n.type))) return;
        if (n.type === 'VariableDeclaration' && n.kind === 'var') add(n);
        for (const key of Object.keys(n)) { if (skip.has(key)) continue; const v = n[key]; if (Array.isArray(v)) v.forEach(hoist); else if (v && typeof v.type === 'string') hoist(v); } };
      hoist(scope.type === 'Program' ? scope : scope.body);
    }
    const statements = scope.type === 'Program' || scope.type === 'BlockStatement' ? scope.body : scope.type === 'SwitchStatement' ? scope.cases.flatMap(c => c.consequent) : [];
    for (const s of statements) {
      if (lexical(s)) add(s);
      if ((s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') && s.id) names.add(s.id.name);
      if (s.type === 'ExportNamedDeclaration' && s.declaration) { if (s.declaration.type === 'VariableDeclaration') { if (lexical(s.declaration)) add(s.declaration); } else if (s.declaration.id) names.add(s.declaration.id.name); }
    }
    if (scope.type === 'ForStatement' && scope.init && lexical(scope.init)) add(scope.init);
    if ((scope.type === 'ForOfStatement' || scope.type === 'ForInStatement') && lexical(scope.left)) add(scope.left);
    if (scope.type === 'CatchClause') add(scope.param);
    if (scope.params) scope.params.forEach(add);
    if (scope.type === 'FunctionExpression' && scope.id) names.add(scope.id.name);
    declared.set(scope, names);
    return names;
  };
  let next = 0;
  // The name's key: its declaring scope (the nearest of parents, innermost last) and the name.
  return (name, parents) => {
    for (let i = parents.length - 1; i >= 0; i--) if (scopeKinds.test(parents[i].type) && own(parents[i]).has(name)) {
      if (!ids.has(parents[i])) ids.set(parents[i], next++);
      return ids.get(parents[i]) + ':' + name;
    }
    return 'global:' + name;
  };
}
const walkWith = (node, visit, parents = []) => {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parents);
  const inner = [...parents, node];
  for (const key of Object.keys(node)) { if (skip.has(key)) continue; const v = node[key]; if (Array.isArray(v)) v.forEach(x => walkWith(x, visit, inner)); else if (v && typeof v.type === 'string') walkWith(v, visit, inner); }
};
const pathCalls = new Set(['join', 'resolve', 'normalize', 'readdirSync', 'readdir', 'find', 'filter', 'sort', 'slice', 'concat', 'at', 'flat', 'toSorted', 'reverse', 'currentProductFile']);
const pathCall = call => pathCalls.has(call.callee.type === 'Identifier' ? call.callee.name : call.callee.property?.name);
// (copies: a copy of the product, copyFileSync(product, copy), and a derived product, buildDerivedProduct({product,
// output}), are product paths too: productCopyReads counts the reads only they add)
function scopedReadSites(text, {copies = false} = {}) {
  const sites = [];
  const program = syntax(text).program, named = new Set(), keyOf = scopeNames();
  // A path of the product: written there ('src/…', `${root}/src/…`, path.join(root, 'src', 'ts', f), currentProductFile(),
  // or a name bound to one (const product = currentProductFile(); … readFileSync(product);
  // also a name given one later, taken apart from one, or bound by for…of over one), which is read the same.
  const literal = x => x.type === 'StringLiteral' ? x.value : x.type === 'TemplateLiteral' && !x.expressions.length ? x.quasis[0].value.cooked : null;
  const joined = x => {
    if (x.type !== 'CallExpression' || !['join', 'resolve'].includes(x.callee.type === 'Identifier' ? x.callee.name : x.callee.property?.name)) return false;
    const parts = x.arguments.map(literal);
    return parts.some((part, i) => part === 'src' && i < parts.length - 1) || productPath(parts.filter(part => part !== null).join('/'));
  };
  const isFunction = x => /Function|ObjectMethod|ClassMethod/.test(x.type);
  const naming = (node, parents, loose = true) => { let found = false; walkWith(node, (x, within) => {
    if (!loose && within.slice(parents.length).some(isFunction)) return;
    if (x.type === 'StringLiteral' && productPath(x.value)) found = true;
    if (x.type === 'TemplateLiteral' && (productPath(x.quasis[0].value.cooked) || x.quasis.some((q, i) => i > 0 && /^\/src\//.test(q.value.cooked)))) found = true;
    if (joined(x)) found = true;
    if (x.type === 'CallExpression' && ['currentProductFile', 'productFiles'].includes(x.callee.name ?? x.callee.property?.name)) found = true;
    // (the files a build of the product is made from: built.sources of const built = buildProduct(…))
    if ((x.type === 'MemberExpression' || x.type === 'OptionalMemberExpression') && !x.computed && x.property.name === 'sources' && x.object.type === 'Identifier' && builds.has(keyOf(x.object.name, within))) found = true;
    if (x.type === 'Identifier' && named.has(keyOf(x.name, within)) && (loose || within.slice(parents.length).every((p, i, inner) => !(p.type === 'CallExpression' || p.type === 'NewExpression') || pathCall(p) || !p.arguments.includes(inner[i + 1] ?? x)))) found = true;
  }, parents); return found; };
  // (until no name is added, for a name bound from a name bound after it; a name bound to what a read gives is text, not a path)
  // A build of the product: built.sources of const built = buildProduct(…) are the files it is made from.
  const builds = new Set();
  walkWith(program, (n, parents) => { if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init?.type === 'CallExpression' && (n.init.callee.name ?? n.init.callee.property?.name) === 'buildProduct') builds.add(keyOf(n.id.name, parents)); });
  const written = (n, parents) => {
    if (!copies || n.type !== 'CallExpression') return [];
    const callee = n.callee.name ?? n.callee.property?.name, inner = [...parents, n];
    if (['copyFileSync', 'copyFile', 'cpSync', 'cp'].includes(callee) && n.arguments[0] && n.arguments[1]?.type === 'Identifier' && naming(n.arguments[0], inner)) return [n.arguments[1]];
    return n.arguments.flatMap(a => a.type !== 'ObjectExpression' ? [] : a.properties.some(p => p.type === 'ObjectProperty' && (p.key.name ?? p.key.value) === 'product' && naming(p.value, inner)) ?
      a.properties.filter(p => p.type === 'ObjectProperty' && (p.key.name ?? p.key.value) === 'output' && p.value.type === 'Identifier').map(p => p.value) : []);
  };
  for (let size = -1; size !== named.size;) {
    size = named.size;
    walkWith(program, (n, parents) => {
      for (const id of written(n, parents)) named.add(keyOf(id.name, parents));
      const [target, value, at] = n.type === 'VariableDeclarator' ? [n.id, n.init, parents] : n.type === 'AssignmentExpression' && n.operator === '=' ? [n.left, n.right, parents] :
        n.type === 'ForOfStatement' ? [n.left, n.right, [...parents, n]] : [null, null, null];
      // (a name declared with a value is bound when the value names a path anywhere; a name given one later, taken apart or
      // bound by for…of only when the value names it outside a function written there and outside the arguments of a call
      // that does not join, list or pick paths)
      const plain = n.type === 'VariableDeclarator' && n.id.type === 'Identifier';
      if (target && value && !readerCall(value) && (plain || !isFunction(value)) && naming(value, [...parents, n], plain)) for (const name of patternIds(target)) named.add(keyOf(name.name, at));
    });
  }
  walkWith(program, (n, parents) => { if (readerCall(n) && n.arguments.some(a => naming(a, [...parents, n]))) sites.push(n.start); });
  return sites;
}
export const productSourceReads = text => oldReadSites(text).length;
// (the reads, by where they are: a path written there or a name bound to one)
function oldReadSites(text) {
  const sites = [];
  const program = syntax(text).program, names = new Set();
  // A path of the product: written there ('src/…', currentProductFile()) or a name bound to one (const product =
  // currentProductFile(); … readFileSync(product)), which is read the same.
  const naming = node => { let named = false; walk(node, x => {
    if (x.type === 'StringLiteral' && productPath(x.value)) named = true;
    if (x.type === 'TemplateLiteral' && productPath(x.quasis[0].value.cooked)) named = true;
    if (x.type === 'CallExpression' && (x.callee.name ?? x.callee.property?.name) === 'currentProductFile') named = true;
    if (x.type === 'Identifier' && names.has(x.name)) named = true;
  }); return named; };
  // (twice, for a name bound from a name bound after it; a name bound to what a read gives is text, not a path)
  for (let pass = 0; pass < 2; pass++) walk(program, n => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && !readerCall(n.init) && naming(n.init)) names.add(n.id.name);
  });
  walk(program, n => { if (readerCall(n) && n.arguments.some(naming)) sites.push(n.start); });
  return sites;
}
// The reads the rule above does not count that a sharper look finds (SCOPED_SOURCE_READS, exact per file): a name seen in
// the scope that declares it, given later, taken apart or bound by for…of, a path joined from src and ts apart,
// `${root}/src/…`, the files productFiles or a build lists. Both rules hold: nothing either counts goes uncounted.
export const SCOPED_SOURCE_READS = Object.freeze({

});
export const scopedSourceReads = text => { const counted = new Set(oldReadSites(text)); return scopedReadSites(text).filter(at => !counted.has(at)).length; };
export function scopedReadIssues(texts, counts = SCOPED_SOURCE_READS) {
  const issues = [];
  for (const [file, text] of Object.entries(texts).sort(([a], [b]) => a.localeCompare(b))) {
    const count = scopedSourceReads(text), table = counts[file] ?? 0;
    if (count > table) issues.push(file + ' reads the product source as text, seen by scope, ' + count + ' times (SCOPED_SOURCE_READS has ' + table + '); take it from a shared reader instead');
    else if (count < table) issues.push(file + ' reads the product source as text, seen by scope, ' + count + ' times now; lower its SCOPED_SOURCE_READS entry to ' + count);
  }
  for (const file of Object.keys(counts)) if (!Object.hasOwn(texts, file)) issues.push(file + ' is in SCOPED_SOURCE_READS but no longer exists; remove it');
  return issues;
}
// Reads of a copy of the product or of a derived product as text (the test reads the file it wrote itself), those
// neither rule above counts:
// PRODUCT_COPY_READS holds each file's count exactly, as TIMER_PROMISE_COUNTS does.
export const PRODUCT_COPY_READS = Object.freeze({
  'audit/tests/composition-acceptance.mjs': 1,
  'audit/tests/extension-foundation.mjs': 3,
  'audit/tests/japanese-intent-browser.mjs': 2,
  'audit/tests/spec-examples.mjs': 2,
});
export const productCopyReads = text => { const counted = new Set([...oldReadSites(text), ...scopedReadSites(text)]); return scopedReadSites(text, {copies: true}).filter(at => !counted.has(at)).length; };
export function copyReadIssues(texts, counts = PRODUCT_COPY_READS) {
  const issues = [];
  for (const [file, text] of Object.entries(texts).sort(([a], [b]) => a.localeCompare(b))) {
    const count = productCopyReads(text), table = counts[file] ?? 0;
    if (count > table) issues.push(file + ' reads a copy of the product as text ' + count + ' times (PRODUCT_COPY_READS has ' + table + '); take it from a shared reader instead');
    else if (count < table) issues.push(file + ' reads a copy of the product as text ' + count + ' times now; lower its PRODUCT_COPY_READS entry to ' + count);
  }
  for (const file of Object.keys(counts)) if (!Object.hasOwn(texts, file)) issues.push(file + ' is in PRODUCT_COPY_READS but no longer exists; remove it');
  return issues;
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

// Refusals without a reason: a negative assertion of node:assert (throws / rejects, however the module or the function is
// reached: a default, namespace or named import, require, .strict, node:test's t.assert, a name bound to one of these,
// destructuring, an array or object holding it, optional or computed access, .bind, .call, .apply, Reflect.apply)
// whose second argument is missing, only the message shown when nothing is thrown, or a reason that no error can fail (a
// pattern any error or product message fits, a test that does not read the error or always holds, an object with no
// field that can differ); a try/catch or a promise handler that takes any error as the refusal without reading it; and
// Promise.allSettled that only looks at the status. A crash of the checked code (a TypeError, a ReferenceError) then
// counts as the refusal, and a mutant that the check no longer refuses for its reason still passes. Each refusal names
// what it expects: a regular expression with a fixed part of the message or the product's code, a function that reads
// the error, an object of the error's expected fields, the shared refusedWith / refusedAs of audit/lib/refusal.cjs, or a
// name bound in reach to one of these. None is allowed; there is no baseline.
const assertModule = value => typeof value === 'string' && /^(?:node:)?assert(?:\/strict)?$/.test(value);
const refusalModule = value => typeof value === 'string' && /(?:^|\/)refusal\.cjs$/.test(value);
const scopeTypes = new Set(['Program', 'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod',
  'BlockStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'CatchClause', 'StaticBlock']);
const functionTypes = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod']);
// Texts any error could give: a reason that matches one of them says nothing.
const anyErrorTexts = ['', 'q', 'Error', 'TypeError: q', 'AssertionError [ERR_ASSERTION]: q', 'undefined', 'null'];
// The longest run of fixed characters a pattern needs (escaped characters count, classes and quantified ones do not).
function fixedRun(source) {
  let best = 0, run = 0;
  for (let i = 0; i < source.length; i++) {
    let c = source[i], fixed = false;
    if (c === '\\') { const n = source[i + 1] ?? ''; i++; fixed = !/[dDwWsSbBpPu0-9xckn]/.test(n) || n === 'n'; if (n === 'p' || n === 'P' || n === 'u' || n === 'x' || n === 'c') { if (source[i + 1] === '{') i = source.indexOf('}', i); } }
    else if (c === '[') { const end = source.indexOf(']', i + 1); i = end < 0 ? source.length : end; }
    else if ('^$.|()?*+{}'.includes(c)) { if (c === '{') { const end = source.indexOf('}', i); i = end < 0 ? source.length : end; } if ('?*{'.includes(c) && run) run--; best = Math.max(best, run); run = 0; continue; }
    else fixed = true;
    const q = source[i + 1];
    if (fixed && !(q === '?' || q === '*' || q === '{')) { run++; best = Math.max(best, run); } else { best = Math.max(best, run); run = 0; }
  }
  return best;
}
// (a pattern that cannot be built says nothing either)
const sayingNothing = (source, flags) => { let re; try { re = new RegExp(source, flags); } catch (error) { return error instanceof SyntaxError; }
  return anyErrorTexts.some(t => { re.lastIndex = 0; return re.test(t); }) || fixedRun(source) < 4; };
const walkUp = (node, visit, up = []) => {
  if (!node || typeof node.type !== 'string') return;
  visit(node, up);
  const next = [node, ...up];
  for (const key of Object.keys(node)) { if (skip.has(key)) continue; const v = node[key]; if (Array.isArray(v)) v.forEach(x => walkUp(x, visit, next)); else if (v && typeof v.type === 'string') walkUp(v, visit, next); }
};
// The names a pattern binds, each with the property path it takes from the bound value.
const patternNames = (pattern, keys = [], out = []) => {
  if (!pattern) return out;
  if (pattern.type === 'Identifier') out.push([pattern.name, keys]);
  else if (pattern.type === 'AssignmentPattern') patternNames(pattern.left, keys, out);
  else if (pattern.type === 'RestElement') patternNames(pattern.argument, [...keys, null], out);
  else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((e, i) => patternNames(e, [...keys, i], out));
  else if (pattern.type === 'ObjectPattern') for (const p of pattern.properties) {
    if (p.type === 'RestElement') patternNames(p.argument, [...keys, null], out);
    else patternNames(p.value, [...keys, p.computed ? (p.key.type === 'StringLiteral' ? p.key.value : null) : (p.key.name ?? p.key.value)], out);
  }
  return out;
};
const nearestScope = up => up.find(n => scopeTypes.has(n.type));
const nearestFunctionScope = up => up.find(n => functionTypes.has(n.type) || n.type === 'Program');
function bindings(program) {
  const scopes = new Map(), bind = (scope, name, binding) => { if (!scopes.has(scope)) scopes.set(scope, new Map()); scopes.get(scope).set(name, binding); };
  walkUp(program, (n, up) => {
    if (n.type === 'ImportDeclaration') for (const s of n.specifiers)
      bind(program, s.local.name, {kind: 'import', source: n.source.value, imported: s.type === 'ImportSpecifier' ? (s.imported.name ?? s.imported.value) : '*'});
    if (n.type === 'VariableDeclaration') {
      const scope = n.kind === 'var' ? nearestFunctionScope(up) : nearestScope(up);
      for (const d of n.declarations) for (const [name, keys] of patternNames(d.id)) bind(scope, name, {kind: 'value', init: d.init, keys, up});
    }
    if (n.type === 'FunctionDeclaration' && n.id) bind(nearestScope(up) ?? program, n.id.name, {kind: 'function', node: n, up});
    if (functionTypes.has(n.type)) for (const p of n.params) for (const [name] of patternNames(p)) bind(n, name, {kind: 'param'});
    if (n.type === 'CatchClause' && n.param) for (const [name] of patternNames(n.param)) bind(n, name, {kind: 'param'});
    if ((n.type === 'ClassDeclaration') && n.id) bind(nearestScope(up) ?? program, n.id.name, {kind: 'class'});
  });
  return (name, up) => { for (const scope of up) { const b = scopes.get(scope)?.get(name); if (b) return b; } return undefined; };
}
const propertyName = member => member.computed ? (member.property.type === 'StringLiteral' ? member.property.value : member.property.type === 'NumericLiteral' ? member.property.value : member.property.type === 'TemplateLiteral' && !member.property.expressions.length ? member.property.quasis[0].value.cooked : null) : member.property.name;
const isMember = n => n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression';
const isCall = n => n.type === 'CallExpression' || n.type === 'OptionalCallExpression';
const strip = n => { while (n && (n.type === 'ParenthesizedExpression' || n.type === 'TSAsExpression' || n.type === 'SequenceExpression')) n = n.type === 'SequenceExpression' ? n.expressions.at(-1) : n.expression; return n; };
// What an expression is: 'assert' (the module), 'throws', 'rejects', 'fail', a refusal helper ('refusedWith',
// 'refusedAs'), or null. Arrays and objects are followed to the element or property taken from them.
function assertValue(node, up, resolve, depth = 0, keys = []) {
  node = strip(node);
  if (!node || depth > 16) return null;
  const step = (value, key) => key === null || key === undefined ? null
    : value === 'assert' ? (key === 'strict' || key === 'default' ? 'assert' : ['throws', 'rejects', 'fail'].includes(key) ? key : null)
    : value === 'refusal' ? (key === 'refusedWith' || key === 'refusedAs' ? key : null) : null;
  const take = value => keys.reduce((v, k) => step(v, k), value);
  if (node.type === 'ArrayExpression' || node.type === 'ObjectExpression') {
    if (!keys.length) return null;
    const [key, ...rest] = keys;
    const item = node.type === 'ArrayExpression' ? (typeof key === 'number' ? node.elements[key] : null)
      : node.properties.find(p => p.type === 'ObjectProperty' && !p.computed && (p.key.name ?? p.key.value) === key)?.value;
    return item ? assertValue(item, up, resolve, depth + 1, rest) : null;
  }
  if (node.type === 'Identifier') {
    const b = resolve(node.name, up);
    if (!b) return null;
    if (b.kind === 'import') return take(assertModule(b.source) ? (b.imported === '*' || b.imported === 'default' ? 'assert' : step('assert', b.imported))
      : refusalModule(b.source) ? (b.imported === '*' || b.imported === 'default' ? 'refusal' : step('refusal', b.imported)) : null);
    if (b.kind !== 'value' || !b.init) return null;
    return assertValue(b.init, b.up, resolve, depth + 1, [...b.keys, ...keys]);
  }
  if (isCall(node) && node.callee.type === 'Identifier' && node.callee.name === 'require') return take(assertModule(node.arguments[0]?.value) ? 'assert' : refusalModule(node.arguments[0]?.value) ? 'refusal' : null);
  // f.bind(...) is f
  if (isCall(node) && isMember(node.callee) && propertyName(node.callee) === 'bind' && !keys.length) return assertValue(node.callee.object, up, resolve, depth + 1);
  if (isMember(node)) {
    // node:test: t.assert is the assert module
    if (!node.computed && node.property.name === 'assert') return take('assert');
    return assertValue(node.object, up, resolve, depth + 1, [propertyName(node) ?? null, ...keys]);
  }
  if (node.type === 'AwaitExpression' && isCall(node.argument) && node.argument.callee.type === 'Import') return take(assertModule(node.argument.arguments[0]?.value) ? 'assert' : null);
  return null;
}
// A value that does not depend on anything.
const constant = n => { n = strip(n);
  if (!n) return true;
  if (['BooleanLiteral', 'NumericLiteral', 'StringLiteral', 'NullLiteral', 'RegExpLiteral', 'BigIntLiteral'].includes(n.type)) return true;
  if (n.type === 'Identifier' && n.name === 'undefined') return true;
  if (n.type === 'TemplateLiteral') return n.expressions.every(constant);
  if (n.type === 'UnaryExpression') return constant(n.argument);
  if (n.type === 'ObjectExpression') return n.properties.every(p => p.type === 'ObjectProperty' && !p.computed && constant(p.value));
  if (n.type === 'ArrayExpression') return n.elements.every(e => !e || constant(e));
  return false; };
const truthyConstant = n => { n = strip(n);
  if (!n) return false;
  if (n.type === 'BooleanLiteral') return n.value;
  if (n.type === 'NumericLiteral') return n.value !== 0;
  if (n.type === 'StringLiteral') return n.value !== '';
  if (n.type === 'UnaryExpression' && n.operator === '!') return falsyConstant(n.argument);
  if (n.type === 'LogicalExpression' && n.operator === '||') return truthyConstant(n.left) || truthyConstant(n.right);
  if (n.type === 'ConditionalExpression') return truthyConstant(n.consequent) && truthyConstant(n.alternate);
  return false; };
const falsyConstant = n => { n = strip(n);
  if (!n) return false;
  if (n.type === 'BooleanLiteral') return !n.value;
  if (n.type === 'NumericLiteral') return n.value === 0;
  if (n.type === 'StringLiteral') return n.value === '';
  if (n.type === 'NullLiteral' || (n.type === 'Identifier' && n.name === 'undefined')) return true;
  if (n.type === 'UnaryExpression' && n.operator === '!') return truthyConstant(n.argument);
  if (n.type === 'UnaryExpression' && n.operator === 'void') return true;
  return false; };
// The error is read: a field of it is taken, it is given to a call, or it is compared with a value of its own kind.
// Its truth, `instanceof Error`, or keeping it as it is, read nothing.
function readsError(body, names) {
  let read = false;
  walkUp(body, (x, up) => {
    if (read || x.type !== 'Identifier' || !names.has(x.name)) return;
    const parent = up[0];
    if (!parent) return;
    if (isMember(parent) && parent.object === x) read = true;
    else if (parent.type === 'AwaitExpression' && up[1] && isMember(up[1]) && up[1].object === parent) read = true;
    // carried on as it is, to be thrown or reported later
    else if (parent.type === 'ThrowStatement' || (parent.type === 'ObjectProperty' && parent.value === x) || parent.type === 'ArrayExpression') read = true;
    else if (isCall(parent) && parent.arguments.includes(x) && !(isMember(parent.callee) && ['push', 'unshift', 'add', 'set'].includes(propertyName(parent.callee))) && !(parent.callee.type === 'Identifier' && ['Boolean', 'String', 'ok', 'assert'].includes(parent.callee.name)) && !(isMember(parent.callee) && propertyName(parent.callee) === 'ok')) read = true;
    else if (parent.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(parent.operator) && !constant(parent.left === x ? parent.right : parent.left)) read = true;
    else if (parent.type === 'BinaryExpression' && parent.operator === 'instanceof' && parent.left === x && !(parent.right.type === 'Identifier' && parent.right.name === 'Error')) read = true;
  });
  return read;
}
const paramNames = fn => new Set(fn.params.flatMap(p => patternNames(p).map(([name]) => name)));
// A function that tests the error: it reads the error and does not always hold.
function testsTheError(fn) {
  const names = paramNames(fn);
  if (!names.size || !readsError(fn.body, names)) return false;
  if (fn.body.type !== 'BlockStatement') return !truthyConstant(fn.body);
  const returns = [];
  walk(fn.body, x => { if (x.type === 'ReturnStatement') returns.push(x); });
  return returns.length > 0 && !returns.every(r => truthyConstant(r.argument));
}
const sayingNothingField = p => p.type !== 'ObjectProperty' || (p.value.type === 'RegExpLiteral' && sayingNothing(p.value.pattern, p.value.flags))
  || (p.value.type === 'Identifier' && p.value.name === 'undefined') || ((p.key.name ?? p.key.value) === 'name' && p.value.type === 'StringLiteral' && p.value.value === 'Error');
function namesAReason(node, up, resolve, depth = 0) {
  node = strip(node);
  if (!node || depth > 12) return false;
  if (node.type === 'RegExpLiteral') return !sayingNothing(node.pattern, node.flags);
  if ((node.type === 'NewExpression' || node.type === 'CallExpression') && node.callee.type === 'Identifier' && node.callee.name === 'RegExp') {
    const [source, flags] = node.arguments;
    if (source?.type === 'StringLiteral') return !sayingNothing(source.value, flags?.type === 'StringLiteral' ? flags.value : '');
    // a pattern built from parts: the written parts must say something without the parts filled in at run time
    const written = []; walk(source, x => { if (x.type === 'StringLiteral') written.push(x.value); if (x.type === 'TemplateElement') written.push(x.value.cooked); });
    return written.some(w => fixedRun(w) >= 4);
  }
  // the shared helpers: refusedAs('<site>') and refusedWith({...}) with a code or a message
  if (isCall(node)) {
    const helper = assertValue(node.callee, up, resolve);
    if (helper === 'refusedAs') { const site = node.arguments[0]; const written = []; walk(site, x => { if (x.type === 'StringLiteral') written.push(x.value); if (x.type === 'TemplateElement') written.push(x.value.cooked); }); return !!site && written.join('').length > 0; }
    if (helper === 'refusedWith') return node.arguments[0]?.type === 'ObjectExpression' && node.arguments[0].properties.some(p => p.type === 'ObjectProperty' && ['code', 'message'].includes(p.key.name ?? p.key.value) && !sayingNothingField(p));
    return false;
  }
  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') return testsTheError(node);
  if (node.type === 'ObjectExpression') return node.properties.some(p => !sayingNothingField(p));
  if (node.type === 'ConditionalExpression') return namesAReason(node.consequent, up, resolve, depth + 1) && namesAReason(node.alternate, up, resolve, depth + 1);
  if (node.type === 'Identifier') {
    const b = resolve(node.name, up);
    if (b?.kind === 'function') return testsTheError(b.node);
    return b?.kind === 'value' && b.keys.length === 0 && namesAReason(b.init, b.up, resolve, depth + 1);
  }
  return false;
}
// A handler that takes any error as the refusal: it does not read the error and does something with it all the same
// (answers or keeps a value, counts, collects), or it is empty after a try that fails on purpose when nothing is thrown.
function acceptsAnyError(handler, tryBlock, up, resolve) {
  const names = new Set(handler.param ? patternNames(handler.param).map(([name]) => name) : []);
  const fn = up.find(x => functionTypes.has(x.type) || x.type === 'Program');
  // kept as it is (x = e) and then looked at only for its truth: as good as not read
  const kept = new Set();
  walk(handler.body, x => { if (x.type === 'AssignmentExpression' && x.right.type === 'Identifier' && names.has(x.right.name) && x.left.type === 'Identifier') kept.add(x.left.name); });
  const keptRead = kept.size > 0 && readsError(fn, kept);
  let rethrows = false; walk(handler.body, x => { if (x.type === 'ThrowStatement') rethrows = true; });
  if (rethrows) return false;
  if (names.size && readsError(handler.body, names) && !(kept.size && !keptRead)) return false;
  if (kept.size && !keptRead) return true;
  const body = handler.body.body;
  if (body.length === 0) {
    let failing = false;
    if (tryBlock) walkUp(tryBlock, (x, xup) => { if (isCall(x) && assertValue(x.callee, [...xup, ...up], resolve) === 'fail') failing = true; if (x.type === 'ThrowStatement') failing = true; });
    return failing;
  }
  // a yes or a word kept or answered, a count, or a constant collected: the error, whatever it is, is the refusal
  let takes = false;
  walk(handler.body, x => {
    if (x.type === 'ReturnStatement' && x.argument && constant(x.argument) && !falsyConstant(x.argument)) takes = true;
    if (x.type === 'AssignmentExpression' && x.operator === '=' && constant(x.right) && !falsyConstant(x.right)) takes = true;
    if (x.type === 'UpdateExpression' || (x.type === 'AssignmentExpression' && ['+=', '-='].includes(x.operator))) takes = true;
    if (isCall(x) && isMember(x.callee) && ['push', 'add', 'unshift'].includes(propertyName(x.callee)) && x.arguments.every(constant)) takes = true;
  });
  return takes;
}
// A promise handler of rejection (.catch(f), .then(_, f)) that does not read the error and answers anything but a plain
// no (null, false, '', 0): nothing (undefined), a yes, a word, or the error back as it is. A no is a measurement that
// did not come (a wait that ran out, a field that is not there), not a refusal.
const loosePromiseHandler = (fn, up = []) => { fn = strip(fn);
  if (!fn || !(fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression')) return false;
  const names = paramNames(fn);
  if (names.size && readsError(fn.body, names)) return false;
  // the error given back as it is, into a name whose fields are read later, is read
  const holder = up.find(x => x.type === 'VariableDeclarator' && x.id.type === 'Identifier');
  if (holder && fn.body.type === 'Identifier' && names.has(fn.body.name) && readsError(up.find(x => functionTypes.has(x.type) || x.type === 'Program'), new Set([holder.id.name]))) return false;
  const answers = []; if (fn.body.type !== 'BlockStatement') answers.push(fn.body); else walk(fn.body, x => { if (x.type === 'ReturnStatement') answers.push(x.argument); });
  if (fn.body.type === 'BlockStatement' && fn.body.body.some(s => s.type === 'ThrowStatement')) return false;
  return !answers.length || answers.some(a => !(a && falsyConstant(a) && !(a.type === 'Identifier' && a.name === 'undefined')));
};
// A handler whose answer is not looked at (a bare statement, or awaited as one) only keeps a failure of cleaning up or
// of taking a picture from stopping the run; one whose answer is kept or compared is the judgement.
const answerUsed = up => { const [p, q] = up; if (!p) return false; if (p.type === 'ArrowFunctionExpression' && q && isCall(q) && q.arguments.includes(p)) return false; if (p.type === 'ExpressionStatement' || p.type === 'UnaryExpression' && p.operator === 'void') return false;
  if (p.type === 'AwaitExpression' && q?.type === 'ExpressionStatement') return false; return true; };
// The first handler of .then(f, g) that fails on purpose: then g is what counts as the refusal.
const failsOnPurpose = fn => { fn = strip(fn); if (!fn || !(fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression')) return fn?.type === 'Identifier' && /^fail/i.test(fn.name);
  let fails = false; walk(fn.body, x => { if (x.type === 'ThrowStatement') fails = true; if (isCall(x) && isMember(x.callee) && propertyName(x.callee) === 'fail') fails = true; }); return fails; };
export function reasonlessRefusals(text) {
  const program = syntax(text).program, resolve = bindings(program), found = [];
  const reasonAt = (n, index, up) => { const a = n.arguments[index]; return a && a.type !== 'SpreadElement' && namesAReason(a, up, resolve); };
  walkUp(program, (n, up) => {
    if (isCall(n)) {
      const what = assertValue(n.callee, up, resolve);
      if ((what === 'throws' || what === 'rejects') && !reasonAt(n, 1, up)) found.push(n.loc.start.line);
      // throws.call(this, fn, reason), throws.apply(this, [fn, reason]), Reflect.apply(throws, this, [fn, reason])
      if (isMember(n.callee) && ['call', 'apply'].includes(propertyName(n.callee)) && ['throws', 'rejects'].includes(assertValue(n.callee.object, up, resolve))) {
        const ok = propertyName(n.callee) === 'call' ? reasonAt(n, 2, up) : n.arguments[1]?.type === 'ArrayExpression' && n.arguments[1].elements[1] && namesAReason(n.arguments[1].elements[1], up, resolve);
        if (!ok) found.push(n.loc.start.line);
      }
      if (isMember(n.callee) && !n.callee.computed && n.callee.object.type === 'Identifier' && n.callee.object.name === 'Reflect' && n.callee.property.name === 'apply' && ['throws', 'rejects'].includes(assertValue(n.arguments[0], up, resolve))) {
        const list = n.arguments[2];
        if (!(list?.type === 'ArrayExpression' && list.elements[1] && namesAReason(list.elements[1], up, resolve))) found.push(n.loc.start.line);
      }
      // promise.then(ok, () => true) and promise.catch(() => …): any rejection is taken as the refusal
      if (isMember(n.callee) && ((propertyName(n.callee) === 'then' && n.arguments.length > 1 && loosePromiseHandler(n.arguments[1], up) && (answerUsed(up) || failsOnPurpose(n.arguments[0]))) || (propertyName(n.callee) === 'catch' && loosePromiseHandler(n.arguments[0], up) && answerUsed(up)))) found.push(n.loc.start.line);
    }
    if (n.type === 'TryStatement' && n.handler && acceptsAnyError(n.handler, n.block, [n.handler, n, ...up], resolve)) found.push(n.handler.loc.start.line);
    // Promise.allSettled(...) looked at only for its status: a rejection for any reason counts
    if (n.type === 'BinaryExpression' && ['===', '!=='].includes(n.operator) && [n.left, n.right].some(s => s.type === 'StringLiteral' && s.value === 'rejected')
      && [n.left, n.right].some(s => isMember(s) && propertyName(s) === 'status')) {
      const fn = up.find(x => functionTypes.has(x.type) || x.type === 'Program');
      let reasonRead = false; walk(fn, x => { if (isMember(x) && propertyName(x) === 'reason') reasonRead = true; });
      if (!reasonRead) found.push(n.loc.start.line);
    }
  });
  return found.sort((a, b) => a - b);
}
export function refusalReasonIssues(texts) {
  const issues = [];
  for (const [file, text] of Object.entries(texts).sort(([a], [b]) => a.localeCompare(b))) for (const line of reasonlessRefusals(text))
    issues.push(file + ':' + line + ' refuses without a reason; give assert.throws / assert.rejects the pattern, test or fields of the error it expects');
  return issues;
}
// One shared refusal helper: a check that defines its own (a refusedNotCrashed, refusedAs or refusedWith of its own, or a
// test that only rules out the crash classes) instead of taking audit/lib/refusal.cjs.
const crashOnly = /^\^?\(\?:(?:Type\|Reference\|Range|Type\|Reference)[^)]*\)Error\$?$/;
export function refusalHelperCopies(texts) {
  const issues = [];
  for (const [file, text] of Object.entries(texts).sort(([a], [b]) => a.localeCompare(b))) {
    if (file === 'audit/lib/refusal.cjs') continue;
    walk(syntax(text).program, n => {
      const name = n.type === 'VariableDeclarator' && n.id.type === 'Identifier' ? n.id.name : n.type === 'FunctionDeclaration' ? n.id?.name : null;
      if (name && /^refused(?:NotCrashed|As|With)$/.test(name)) issues.push(file + ':' + n.loc.start.line + ' defines its own ' + name + '; take it from audit/lib/refusal.cjs');
      if (n.type === 'RegExpLiteral' && crashOnly.test(n.pattern)) issues.push(file + ':' + n.loc.start.line + ' rules out only the crash classes; take refusedWith / refusedAs from audit/lib/refusal.cjs');
    });
  }
  return issues;
}
