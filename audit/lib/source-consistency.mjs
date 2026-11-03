// Consistency of the product's own vocabulary (AUDIT.md「ソースの一致」). The product script is read as one syntax tree,
// as the build joins it, so a name compared in one file and made in another is one name.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {parse} = require('@babel/parser');

// Dispatch values: a value a property is compared with (x.kind === 'V', case 'V' in switch (x.kind), [...'V'].includes(x.kind))
// must also occur in the product somewhere else as a string, where something makes it. A value compared and never written
// is a branch nothing can reach, as when a node kind is renamed and a check keeps the old name.
export const DISPATCH_PROPERTIES = Object.freeze(['kind', 'type', 'op', 'schemaId', 'event', 'mode', 'code', 'unit', 'sensor', 'category', 'role', 'action', 'state']);
// Values that come from outside the product's own strings. Each names why nothing in the product writes it.
export const DISPATCH_ALLOWED = Object.freeze([
  {property: 'type', value: 'moof', reason: 'an MP4 box type read from the bytes of an imported sound'},
  {property: 'type', value: 'mvex', reason: 'an MP4 box type read from the bytes of an imported sound'},
  {property: 'type', value: 'url ', reason: 'an MP4 box type read from the bytes of an imported sound'},
  {property: 'type', value: 'noop', reason: 'an editor operation a caller of the public editor session API sends'},
  {property: 'schemaId', value: 'Hole:expression', reason: 'made as kind:role by the block schema registration add(\'Hole\', role, ...)'},
  {property: 'schemaId', value: 'SensorRead:INPUT_VALUE', reason: 'made as kind:role by the block schema registration of the input sensor'},
  {property: 'state', value: 'closed', reason: 'an AudioContext state the browser sets'},
  {property: 'state', value: 'running', reason: 'an AudioContext state the browser sets'},
  {property: 'state', value: 'suspended', reason: 'an AudioContext state the browser sets'},
]);

const skip = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments']);
function visit(node, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const key of Object.keys(node)) {
    if (skip.has(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) for (const child of value) visit(child, fn);
    else if (value && typeof value.type === 'string') visit(value, fn);
  }
}

export function dispatchValues(text, properties = DISPATCH_PROPERTIES) {
  const ast = parse(text, {sourceType: 'script', allowReturnOutsideFunction: true});
  const names = new Set(properties), compared = new Map(), comparing = new Set(), written = new Set();
  const property = n => (n?.type === 'MemberExpression' || n?.type === 'OptionalMemberExpression') && !n.computed && names.has(n.property.name) ? n.property.name : null;
  const compare = (name, literal) => {
    const key = name + '\u0000' + literal.value;
    if (!compared.has(key)) compared.set(key, {property: name, value: literal.value, at: literal.start});
    comparing.add(literal);
  };
  visit(ast.program, n => {
    if (n.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(n.operator)) {
      if (property(n.left) && n.right.type === 'StringLiteral') compare(property(n.left), n.right);
      if (property(n.right) && n.left.type === 'StringLiteral') compare(property(n.right), n.left);
    }
    if (n.type === 'SwitchStatement' && property(n.discriminant)) for (const c of n.cases) if (c.test?.type === 'StringLiteral') compare(property(n.discriminant), c.test);
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.property.name === 'includes' &&
      n.callee.object.type === 'ArrayExpression' && property(n.arguments[0]))
      for (const e of n.callee.object.elements) if (e?.type === 'StringLiteral') compare(property(n.arguments[0]), e);
  });
  visit(ast.program, n => {
    if (n.type === 'StringLiteral' && !comparing.has(n)) written.add(n.value);
    if (n.type === 'TemplateLiteral' && !n.expressions.length) written.add(n.quasis[0].value.cooked);
  });
  return {compared: [...compared.values()], written};
}

export function dispatchValueIssues(text, allowed = DISPATCH_ALLOWED) {
  const {compared, written} = dispatchValues(text);
  const allowedKey = new Set(allowed.map(a => a.property + '\u0000' + a.value));
  const line = at => text.slice(0, at).split('\n').length;
  const unwritten = compared.filter(c => !written.has(c.value));
  const issues = unwritten.filter(c => !allowedKey.has(c.property + '\u0000' + c.value))
    .map(c => `${c.property} === '${c.value}' (product line ${line(c.at)}) is compared but nothing in the product writes '${c.value}'`);
  const used = new Set(unwritten.map(c => c.property + '\u0000' + c.value));
  for (const a of allowed) if (!used.has(a.property + '\u0000' + a.value)) issues.push(`allowance ${a.property} '${a.value}' matches nothing now; remove it`);
  return issues;
}

// DOM references: an element id the product looks up (getElementById, a #id in a selector) is given by the page
// (src/akari.html) or by the product (an id property, an id attribute in markup it writes), and a data-* attribute the
// product reads (dataset.x, getAttribute, a [data-x] selector) is one the page or the product writes.
const kebab = name => 'data-' + name.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
const selectorMethods = new Set(['querySelector', 'querySelectorAll', 'closest', 'matches']);
export function domReferences(text, html) {
  const ast = parse(text, {sourceType: 'script', allowReturnOutsideFunction: true});
  const ids = {given: new Set(), used: new Map()}, data = {given: new Set(), used: new Map()};
  const use = (map, name, at) => { if (!map.has(name)) map.set(name, at); };
  const markup = (value, at) => {
    for (const m of value.matchAll(/(?:^|[\s"'<])id\s*=\s*["']?([A-Za-z][\w-]*)/g)) ids.given.add(m[1]);
    for (const m of value.matchAll(/(?:^|[\s"'<])(data-[a-z][\w-]*)\s*=/g)) data.given.add(m[1]);
    void at;
  };
  const selector = (value, at) => {
    for (const m of value.matchAll(/#([A-Za-z][\w-]*)/g)) use(ids.used, m[1], at);
    for (const m of value.matchAll(/\[(data-[a-z][\w-]*)/g)) use(data.used, m[1], at);
  };
  const literal = n => n?.type === 'StringLiteral' ? n.value : n?.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis[0].value.cooked : null;
  const member = (n, name) => (n?.type === 'MemberExpression' || n?.type === 'OptionalMemberExpression') && !n.computed && n.property.name === name;
  const assigned = new Set();
  visit(ast.program, n => {
    if (n.type === 'AssignmentExpression') {
      assigned.add(n.left);
      if (member(n.left, 'id') && literal(n.right)) ids.given.add(literal(n.right));
      if ((n.left.type === 'MemberExpression' || n.left.type === 'OptionalMemberExpression') && member(n.left.object, 'dataset') && !n.left.computed) data.given.add(kebab(n.left.property.name));
    }
    if (n.type === 'ObjectProperty' && !n.computed && (n.key.name === 'id' || n.key.value === 'id') && literal(n.value)) ids.given.add(literal(n.value));
    // An attribute object handed to an element helper: {'data-name': value}.
    if (n.type === 'ObjectProperty' && !n.computed && n.key.type === 'StringLiteral' && n.key.value.startsWith('data-')) data.given.add(n.key.value);
    // A computed attribute name chosen between literals: {[cond ? 'data-a' : 'data-b']: value}.
    if (n.type === 'ObjectProperty' && n.computed) visit(n.key, k => { if (k.type === 'StringLiteral' && k.value.startsWith('data-')) data.given.add(k.value); });
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed) {
      const method = n.callee.property.name, first = literal(n.arguments[0]);
      if (method === 'setAttribute' && first === 'id' && literal(n.arguments[1])) ids.given.add(literal(n.arguments[1]));
      if (method === 'setAttribute' && first?.startsWith('data-')) data.given.add(first);
      if (['getAttribute', 'hasAttribute'].includes(method) && first?.startsWith('data-')) use(data.used, first, n.start);
      if (method === 'getElementById' && first) use(ids.used, first, n.start);
      if (selectorMethods.has(method) && first) selector(first, n.start);
      // Object.assign(el.dataset, {name: ...}) writes data-name.
      if (method === 'assign' && n.callee.object.name === 'Object' && member(n.arguments[0], 'dataset') && n.arguments[1]?.type === 'ObjectExpression')
        for (const p of n.arguments[1].properties) if (p.type === 'ObjectProperty' && !p.computed) data.given.add(kebab(p.key.name ?? String(p.key.value)));
    }
    if (n.type === 'StringLiteral') markup(n.value, n.start);
    if (n.type === 'TemplateLiteral') for (const q of n.quasis) markup(q.value.cooked ?? '', n.start);
  });
  visit(ast.program, n => {
    if ((n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression') && member(n.object, 'dataset') && !n.computed && !assigned.has(n))
      use(data.used, kebab(n.property.name), n.start);
  });
  for (const m of html.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)) ids.given.add(m[1]);
  for (const m of html.matchAll(/\s(data-[a-z][\w-]*)\s*=/g)) data.given.add(m[1]);
  return {ids, data};
}

export function domReferenceIssues(text, html) {
  const {ids, data} = domReferences(text, html), line = at => text.slice(0, at).split('\n').length, issues = [];
  for (const [id, at] of ids.used) if (!ids.given.has(id)) issues.push(`element id ${id} is looked up (product line ${line(at)}) but neither the page nor the product gives it`);
  for (const [name, at] of data.used) if (!data.given.has(name)) issues.push(`${name} is read (product line ${line(at)}) but neither the page nor the product writes it`);
  return issues;
}

// Diagnostic codes: every code the product can raise (a string such as 'S310' in the product) is named by some audit
// file, so a new error path comes with the test that reaches it. UNNAMED_CODES holds the codes no audit file named when
// this check began; it can only shrink: a listed code that a test now names, or that the product no longer has, is refused.
export const UNNAMED_CODES = Object.freeze(['E702', 'E704', 'F506', 'F507', 'F510', 'I101', 'I102', 'I103', 'I121', 'I122',
  'I125', 'I126', 'I127', 'I128', 'I129', 'I132', 'N101', 'N102', 'N103', 'N104', 'P203', 'P206', 'X600', 'X603', 'X604', 'X605']);
const codeShape = /^[A-Z][0-9]{3}$/;
export function productCodes(text) {
  const ast = parse(text, {sourceType: 'script', allowReturnOutsideFunction: true}), codes = new Set();
  visit(ast.program, n => { if (n.type === 'StringLiteral' && codeShape.test(n.value)) codes.add(n.value); });
  return codes;
}
export function namedCodes(texts) {
  const named = new Set();
  for (const text of texts) for (const m of text.matchAll(/(?<![A-Za-z0-9])([A-Z][0-9]{3})(?![0-9])/g)) named.add(m[1]);
  return named;
}
export function diagnosticCodeIssues(codes, named, unnamed = UNNAMED_CODES) {
  const issues = [], listed = new Set(unnamed);
  for (const code of [...codes].sort()) if (!named.has(code) && !listed.has(code)) issues.push(`the product raises ${code} but no audit file names it`);
  for (const code of unnamed) {
    if (!codes.has(code)) issues.push(`${code} is listed as unnamed but the product no longer has it; remove it`);
    else if (named.has(code)) issues.push(`${code} is listed as unnamed but an audit file names it now; remove it`);
  }
  return issues;
}

// Shown text as state: logic that reads what an element shows (textContent, innerText) and compares it decides by a
// wording, so changing the wording changes the logic. SHOWN_TEXT_BASELINE holds the reads there were when this check
// began (file and the comparison as written); it can only shrink. A new read, or a listed one that is gone, is refused.
// The shown text is the property itself, the property trimmed or normalized, a choice between values one of which is
// shown text, or a local name of the same function (or one around it) that was given one of these.
const member = n => (n?.type === 'MemberExpression' || n?.type === 'OptionalMemberExpression') && !n.computed;
const shownProperty = n => member(n) && ['textContent', 'innerText'].includes(n.property.name);
const textKeeping = new Set(['trim', 'trimStart', 'trimEnd', 'normalize']);
const scopes = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod']);
export function shownTextReads(text, fileOf) {
  const ast = parse(text, {sourceType: 'script', allowReturnOutsideFunction: true}), out = [];
  const note = n => out.push({file: fileOf(n.start), source: text.slice(n.start, n.end).replace(/\s+/g, ' ')});
  const walk = (n, outer) => {
    if (!n || typeof n.type !== 'string') return;
    const scope = scopes.has(n.type) ? {names: new Set(), outer} : outer;
    const shown = e => {
      if (shownProperty(e)) return true;
      if ((e?.type === 'CallExpression' || e?.type === 'OptionalCallExpression') && member(e.callee) && textKeeping.has(e.callee.property.name)) return shown(e.callee.object);
      if (e?.type === 'Identifier') for (let s = scope; s; s = s.outer) if (s.names.has(e.name)) return true;
      if (e?.type === 'ConditionalExpression') return shown(e.consequent) || shown(e.alternate);
      if (e?.type === 'LogicalExpression') return shown(e.left) || shown(e.right);
      return false;
    };
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && shown(n.init)) scope.names.add(n.id.name);
    if (n.type === 'AssignmentExpression' && n.operator === '=' && n.left.type === 'Identifier' && shown(n.right)) scope.names.add(n.left.name);
    if (n.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(n.operator) && (shown(n.left) || shown(n.right))) note(n);
    if ((n.type === 'CallExpression' || n.type === 'OptionalCallExpression') && member(n.callee) &&
      ['includes', 'startsWith', 'endsWith', 'indexOf', 'match', 'test'].includes(n.callee.property.name) && (shown(n.callee.object) || n.arguments.some(shown))) note(n);
    if (n.type === 'SwitchStatement' && shown(n.discriminant)) note(n.discriminant);
    for (const key of Object.keys(n)) {
      if (skip.has(key)) continue;
      const value = n[key];
      if (Array.isArray(value)) for (const child of value) walk(child, scope); else if (value && typeof value.type === 'string') walk(value, scope);
    }
  };
  walk(ast.program, {names: new Set(), outer: null});
  return out;
}
export function shownTextIssues(reads, baseline) {
  const key = r => r.file + '\u0000' + r.source, listed = new Set(baseline.map(key)), found = new Set(reads.map(key)), issues = [];
  for (const r of reads) if (!listed.has(key(r))) issues.push(r.file + ' decides by shown text: ' + r.source);
  for (const b of baseline) if (!found.has(key(b))) issues.push('baseline shown-text read in ' + b.file + ' is gone; remove it: ' + b.source);
  return issues;
}
// Writes that compare first to skip an unchanged text, and one layout that looks for a line break in what a work says
// (the child's words, not the product's).
export const SHOWN_TEXT_BASELINE = Object.freeze([
  {file: "src/js/08-stage-and-export.js", source: "/[\\r\\n]/.test(b.querySelector('.sprite-bubble-text')?.textContent||'')"},
  {file: "src/js/08-stage-and-export.js", source: "node.textContent !== text(c, a)"},
  {file: "src/js/11-app-tools.js", source: "previousHelp?.textContent === helpText"},
  {file: "src/js/11-app-tools.js", source: "previousDetail?.textContent === detailText"},
  {file: "src/js/11-app-services.js", source: "nameText.textContent !== appVars.project.name"},
  {file: "src/js/11-app-drawing.js", source: "appCalls.$('#entryClickEvent').textContent!==clickLabel"},
  {file: "src/js/11-app-drawing.js", source: "b.textContent !== label"},
  {file: "src/js/11-app-drawing.js", source: "note.textContent !== appVars.MODE_REFUSALS[refusal]"},
  {file: "src/js/11-app-drawing.js", source: "appCalls.$('#execLocation').textContent !== location"},
  {file: "src/js/11-app-drawing.js", source: "appCalls.$('#execSentence').textContent !== sentence"},
]);

// Properties read and never written: a name the product reads off an object (x.name, x?.name) that nothing in the
// product gives — no assignment, object or class member, defineProperty, data-* attribute (read back as dataset.name)
// or string (a computed access) — and that the platform does not provide is a misspelling or a field nobody sets. The
// platform names are the members and globals of the TypeScript DOM and ECMAScript libraries (the pinned typescript
// package). UNWRITTEN_ALLOWED lists the names given from outside the product, each with its reason; one the product no
// longer reads, or now gives itself, must go.
export const UNWRITTEN_ALLOWED = Object.freeze([
  {name: 'continuousStep', reason: 'an EventScheduler ui hook its caller gives; the audit harnesses observe continuous rules with it'},
  {name: 'timeoutMs', reason: 'a connector setting an extension author passes (EXTENSIONS.md)'},
  {name: 'webkitAudioContext', reason: 'the AudioContext of older Safari, which the TypeScript DOM library no longer lists'},
]);
export function platformNames() {
  require('typescript/package.json');
  const lib = path.join(path.dirname(require.resolve('typescript/package.json')), 'lib'), names = new Set();
  for (const file of fs.readdirSync(lib).filter(n => /^lib\.(?:dom|es5|es20\d\d|esnext|webworker|scripthost|decorators)[\w.]*\.d\.ts$/.test(n))) {
    const text = fs.readFileSync(path.join(lib, file), 'utf8');
    for (const m of text.matchAll(/^\s+(?:readonly\s+)?(?:get\s+|set\s+)?["']?([A-Za-z_$][\w$]*)["']?\??\s*[:(<]/gm)) names.add(m[1]);
    for (const m of text.matchAll(/^declare\s+(?:var|function|const|let)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  }
  return names;
}
const memberSkip = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments']);
// {name: offset of its first read} for the names the product reads and does not give.
export function unwrittenReads(text) {
  const ast = parse(text, {sourceType: 'script', allowReturnOutsideFunction: true}), targets = new Set(), given = new Set(), reads = new Map();
  const target = p => {
    if (!p) return;
    if ((p.type === 'MemberExpression' || p.type === 'OptionalMemberExpression') && !p.computed) targets.add(p);
    if (p.type === 'ObjectPattern') for (const q of p.properties) target(q.value ?? q.argument);
    if (p.type === 'ArrayPattern') for (const q of p.elements) target(q);
    if (p.type === 'AssignmentPattern') target(p.left);
  };
  const visit = (n, fn) => { if (!n || typeof n.type !== 'string') return; fn(n); for (const key of Object.keys(n)) { if (memberSkip.has(key)) continue; const v = n[key]; if (Array.isArray(v)) v.forEach(x => visit(x, fn)); else if (v && typeof v.type === 'string') visit(v, fn); } };
  visit(ast.program, n => {
    if (n.type === 'AssignmentExpression') target(n.left);
    if (n.type === 'UpdateExpression') target(n.argument);
    if (['ObjectProperty', 'ObjectMethod', 'ClassMethod', 'ClassProperty', 'ClassPrivateProperty'].includes(n.type) && !n.computed) given.add(n.key.name ?? String(n.key.value));
    if (n.type === 'StringLiteral') given.add(n.value);
    for (const piece of n.type === 'StringLiteral' ? [n.value] : n.type === 'TemplateLiteral' ? n.quasis.map(q => q.value.cooked ?? '') : [])
      for (const m of piece.matchAll(/data-([a-z0-9]+(?:-[a-z0-9]+)*)/g)) given.add(m[1].replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()));
  });
  visit(ast.program, n => {
    if ((n.type !== 'MemberExpression' && n.type !== 'OptionalMemberExpression') || n.computed || n.property.type !== 'Identifier') return;
    if (targets.has(n)) given.add(n.property.name);
    else if (!reads.has(n.property.name)) reads.set(n.property.name, n.property.start);
  });
  return Object.fromEntries([...reads].filter(([name]) => !given.has(name)));
}
export function unwrittenIssues(reads, platform, allowed = UNWRITTEN_ALLOWED) {
  const issues = [], allowedNames = new Set(allowed.map(a => a.name));
  for (const name of Object.keys(reads).sort()) if (!platform.has(name) && !allowedNames.has(name)) issues.push(`the product reads .${name} but nothing in it writes ${name}, and the platform does not provide it`);
  for (const {name} of allowed) if (!Object.hasOwn(reads, name) || platform.has(name)) issues.push(`allowance ${name} is stale: the product no longer reads it without writing it; remove it`);
  return issues;
}
