// The parts surfaceCapture gives (src/ts/04-syntax-sentences.ts): one for each capture group of the pattern, null
// for a group the match left out. A call reads them as SourcePart[] (its default) when every group of its pattern
// takes a part whenever the pattern matches, and with a tuple of the parts (SourcePart | null where a group may be
// left out) otherwise. product-source checks every call against its pattern (CAPTURE-PARTS).
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
export const captureModules = Object.freeze(['src/ts/04-meijin-syntax.ts', 'src/ts/04-syntax-expressions.ts', 'src/ts/04-syntax-scripts.ts', 'src/ts/04-syntax-sentences.ts', 'src/ts/04-syntax-sequences.ts']);
// Patterns with a group that may be left out that are not read by a surfaceCapture call of their own: by exec, or by
// a helper that turns a left-out part into the empty text. Each is named by the start of its source.
export const otherReaders = Object.freeze({
  '^【(.+?)】という(?:手順|てじゅん)を、': 'read with exec: the arguments are tested before they are read',
  '^(\\u0001+|[^、。\\u0001]+?)は(?:、(.*))?$': 'read with exec: the rest is tested before it is read',
  '^((?:[^、。]+?は、?)?)コピーを': 'read through whole, which gives the empty text for a part left out',
});

// The capture groups of a pattern and whether each may be left out when the pattern matches: a group under a
// quantifier that allows none, in an alternation, or in a negative lookaround.
export function captureGroups(source) {
  let i = 0;
  const groups = [];
  const atom = optional => {
    const c = source[i];
    if (c === '\\') { i += 2; return; }
    if (c === '[') { i++; while (i < source.length && source[i] !== ']') i += source[i] === '\\' ? 2 : 1; i++; return; }
    if (c === '(') {
      i++;
      let capturing = true, negative = false;
      if (source[i] === '?') {
        capturing = false;
        if (source[i + 1] === '<' && source[i + 2] !== '=' && source[i + 2] !== '!') { capturing = true; i = source.indexOf('>', i) + 1; }
        else { negative = source[i + 1] === '!' || (source[i + 1] === '<' && source[i + 2] === '!'); i += source[i + 1] === '<' ? 3 : 2; }
      }
      // The group's own optionality is known after its quantifier: keep its place and set it then.
      const index = capturing ? groups.push(optional) - 1 : -1;
      const before = groups.length;
      alternation(optional || negative);
      if (source[i] !== ')') throw new Error('unclosed group in ' + source);
      i++;
      return {index, from: before, to: groups.length};
    }
    i++;
  };
  const quantified = optional => {
    const group = atom(optional);
    const q = source[i];
    let none = false;
    if (q === '?' || q === '*') { none = true; i++; }
    else if (q === '+') i++;
    else if (q === '{') { const end = source.indexOf('}', i); none = /^\{0(?:,|\})/.test(source.slice(i, end + 1)); i = end + 1; }
    if (source[i] === '?') i++;
    if (none && group) { if (group.index >= 0) groups[group.index] = true; for (let g = group.from; g < group.to; g++) groups[g] = true; }
  };
  const alternation = optional => {
    const start = groups.length;
    let alternatives = 1;
    while (i < source.length && source[i] !== ')') {
      if (source[i] === '|') { alternatives++; i++; continue; }
      quantified(optional);
    }
    if (alternatives > 1) for (let g = start; g < groups.length; g++) groups[g] = true;
  };
  alternation(false);
  if (i !== source.length) throw new Error('unbalanced pattern ' + source);
  return groups;
}

// The type argument a call with this pattern takes: none when no group may be left out, else the tuple.
export function partsType(source) {
  const groups = captureGroups(source);
  return groups.some(Boolean) ? '[' + groups.map(optional => optional ? 'SourcePart | null' : 'SourcePart').join(', ') + ']' : null;
}

// Every regular expression with the d flag in the modules: the call that reads it (if it is a surfaceCapture
// argument), the type argument of that call, and the pattern's source. A pattern built with new RegExp is evaluated
// with the module's string constants; a call whose pattern is not built so has the sources resolvePattern finds (null when
// it finds none it can build). sourceOf gives a module's text by its path (the caller's reader of the sources).
export function captureCalls(sourceOf) {
  const ts = require('typescript'), out = [], modules = [];
  for (const file of captureModules) {
    const text = sourceOf(file);
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    // The module's constants of texts (named in capitals, in a function too), in the order they are written; a name given
    // two different texts cannot be told apart, and a pattern that uses it is not evaluated.
    const constants = {}, twice = new Set();
    const collect = node => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && /^[A-Z_]+$/.test(node.name.text)) {
        try {
          const value = vm.runInNewContext(node.initializer.getText(sf), {...constants});
          // (a text, or a table of texts such as MOVE_VERBS)
          const kept = typeof value === 'string' ? value : value && typeof value === 'object' ? JSON.stringify(value) : undefined;
          if (kept !== undefined) { if (Object.hasOwn(constants, node.name.text) && JSON.stringify(constants[node.name.text]) !== JSON.stringify(value)) twice.add(node.name.text); constants[node.name.text] = value; }
        } catch {}
      }
      ts.forEachChild(node, collect);
    };
    collect(sf);
    for (const name of twice) delete constants[name];
    modules.push({file, sf, constants});
  }
  for (const mod of modules) {
    const {file, sf, constants} = mod;
    const line = node => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const visit = node => {
      const call = ts.isCallExpression(node) && node.expression.getText(sf) === 'surfaceCapture' ? node : null;
      if (call) {
        const pattern = call.arguments[0], typeArgument = call.typeArguments?.[0]?.getText(sf).replace(/\s+/g, ' ') ?? null;
        let source = null;
        if (ts.isRegularExpressionLiteral(pattern)) source = pattern.text.slice(1, pattern.text.lastIndexOf('/'));
        // (a pattern built from another pattern, not from the module's constants, is read as a variable's)
        else if (ts.isNewExpression(pattern) && pattern.expression.getText(sf) === 'RegExp')
          try { source = new RegExp(vm.runInNewContext(pattern.arguments[0].getText(sf), {...constants})).source; } catch { source = null; }
        out.push(source === null ? {file, line: line(call), kind: 'variable', sources: resolvePattern(ts, modules, mod, pattern), typeArgument} :
          {file, line: line(call), kind: 'pattern', source, typeArgument});
      } else if (node.kind === ts.SyntaxKind.RegularExpressionLiteral && !(ts.isCallExpression(node.parent) && node.parent.expression.getText(sf) === 'surfaceCapture' && node.parent.arguments[0] === node)) {
        const literal = node.getText(sf), flags = literal.slice(literal.lastIndexOf('/') + 1);
        if (flags.includes('d')) out.push({file, line: line(node), kind: 'other', source: literal.slice(1, literal.lastIndexOf('/')), typeArgument: null});
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

// The sources a pattern that is not written in the call may have, or null where the check cannot build one: a name or a
// table read (every pattern in the table the name is taken from), a parameter of a helper (the pattern of each call of
// it), a property of what a call gives (each pattern given to a property of that name in the modules), a choice (both),
// and a new RegExp built with the module's constants, where a value known only when the product runs (a name of the
// work) stands as a text with no group; a pattern that is such a value as a whole is not built.
const BUILT_INS = new Set(['RegExp', 'String', 'Array', 'Object', 'JSON', 'Math', 'Number', 'Boolean', 'Set', 'Map', 'undefined', 'NaN', 'Infinity']);
const unknown = new Proxy(function () {}, {get: (_, key) => key === Symbol.toPrimitive ? () => 'X' : key === Symbol.iterator ? function* () { yield unknown; } : unknown,
  apply: () => unknown, construct: () => unknown});
// (local gives the text of a name declared near the pattern, such as a part of it kept in a lower-case const)
function evaluated(text, constants, local) {
  const scope = new Proxy({}, {has: (_, key) => typeof key === 'string' && !BUILT_INS.has(key),
    get: (_, key) => key === Symbol.unscopables ? undefined : Object.hasOwn(constants, key) ? constants[key] : local(key) ?? unknown});
  try { return vm.runInNewContext('with (scope) (' + text + ')', {scope}); } catch { return undefined; }
}
function built(text, constants, local) {
  const value = evaluated(text, constants, local);
  try { return Object.prototype.toString.call(value) === '[object RegExp]' ? value.source : typeof value === 'string' ? new RegExp(value).source : null; } catch { return null; }
}
function resolvePattern(ts, modules, mod, pattern) {
  const strip = e => { while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression; return e; };
  const names = (binding, name) => ts.isIdentifier(binding) ? binding.text === name : (ts.isObjectBindingPattern(binding) || ts.isArrayBindingPattern(binding)) && binding.elements.some(e => !ts.isOmittedExpression(e) && names(e.name, name));
  const declared = (list, name) => list?.declarations.find(d => names(d.name, name));
  // The declaration of a name seen from a node: the nearest block, function or loop that declares it, else a module's own.
  const declaration = (name, from, at) => {
    for (let n = from; n; n = n.parent) {
      if (n.statements) for (const s of n.statements) { const d = ts.isVariableStatement(s) && declared(s.declarationList, name); if (d) return {d, at}; }
      if ((ts.isForOfStatement(n) || ts.isForStatement(n)) && n.initializer && ts.isVariableDeclarationList(n.initializer) && declared(n.initializer, name))
        return ts.isForOfStatement(n) ? {iterated: n.expression, at} : {d: declared(n.initializer, name), at};
      if (ts.isFunctionLike(n) && n.parameters?.some(p => names(p.name, name))) return {fn: n, index: n.parameters.findIndex(p => names(p.name, name)), at};
    }
    for (const other of modules) for (const s of other.sf.statements) { const d = ts.isVariableStatement(s) && declared(s.declarationList, name); if (d) return {d, at: other}; }
    return null;
  };
  // The text a name declared as a const near a node has, when the check can build it.
  const local = (from, at, depth = 0) => name => {
    const found = depth < 4 ? declaration(name, from, at) : null;
    if (!found?.d?.initializer || !ts.isIdentifier(found.d.name) || !(found.d.parent.flags & ts.NodeFlags.Const)) return undefined;
    const value = evaluated(found.d.initializer.getText(found.at.sf), found.at.constants, local(found.d, found.at, depth + 1));
    return typeof value === 'string' ? value : undefined;
  };
  // (a helper's parameter given to new RegExp: the text given to it at each call)
  const helperSources = found => {
    const helper = found.fn.name ?? (ts.isVariableDeclaration(found.fn.parent) ? found.fn.parent.name : null);
    if (!helper || !ts.isIdentifier(helper)) return [null];
    const given = [];
    const visit = n => { if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === helper.text && n.arguments[found.index]) given.push(built(n.arguments[found.index].getText(found.at.sf), found.at.constants, local(n, found.at))); ts.forEachChild(n, visit); };
    visit(found.at.sf);
    return given.length ? given : [null];
  };
  const sourcesIn = (node, at) => {
    const found = [];
    const visit = n => {
      if (ts.isRegularExpressionLiteral(n) && n.text.slice(n.text.lastIndexOf('/') + 1).includes('d')) found.push(n.text.slice(1, n.text.lastIndexOf('/')));
      else if (ts.isNewExpression(n) && n.expression.getText(at.sf) === 'RegExp' && n.arguments?.length) {
        const given = n.arguments[0], parameter = ts.isIdentifier(given) ? declaration(given.text, given, at) : null;
        found.push(...(parameter?.fn ? helperSources(parameter) : [built(given.getText(at.sf), at.constants, local(n, at))]));
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
    return found.length && !found.includes(null) ? found : null;
  };
  // The table a pattern is read from: the value of the name it is taken from.
  const table = (e, at) => {
    e = strip(e);
    if (ts.isElementAccessExpression(e) || ts.isPropertyAccessExpression(e)) return table(e.expression, at);
    if (ts.isArrayLiteralExpression(e) || ts.isObjectLiteralExpression(e) || ts.isCallExpression(e)) return sourcesIn(e, at);
    if (!ts.isIdentifier(e)) return null;
    const found = declaration(e.text, e, at);
    return found?.iterated ? table(found.iterated, found.at) : found?.d?.initializer ? (ts.isIdentifier(found.d.name) ? table(found.d.initializer, found.at) : sourcesIn(found.d.initializer, found.at)) : null;
  };
  const resolve = (e, at, depth = 0) => {
    e = strip(e);
    if (depth > 8) return null;
    if (ts.isRegularExpressionLiteral(e) || ts.isNewExpression(e)) return sourcesIn(e, at);
    if (ts.isConditionalExpression(e)) { const a = resolve(e.whenTrue, at, depth + 1), b = resolve(e.whenFalse, at, depth + 1); return a && b ? [...a, ...b] : null; }
    if (ts.isElementAccessExpression(e)) return table(e.expression, at);
    if (ts.isPropertyAccessExpression(e) && ts.isCallExpression(strip(e.expression))) {
      const given = modules.flatMap(other => { const out = []; const visit = n => { if (ts.isPropertyAssignment(n) && n.name.getText(other.sf) === e.name.text) out.push(resolve(n.initializer, other, depth + 1)); ts.forEachChild(n, visit); }; visit(other.sf); return out; });
      return given.length && !given.includes(null) ? given.flat() : null;
    }
    if (ts.isPropertyAccessExpression(e)) return table(e.expression, at);
    if (!ts.isIdentifier(e)) return null;
    const found = declaration(e.text, e, at);
    if (!found) return null;
    if (found.iterated) return table(found.iterated, found.at);
    if (found.d) return found.d.initializer ? (ts.isIdentifier(found.d.name) ? resolve(found.d.initializer, found.at, depth + 1) : sourcesIn(found.d.initializer, found.at)) : null;
    return null;
  };
  return resolve(pattern, mod);
}

// The calls whose type argument does not match their pattern, and the patterns read elsewhere with a group that may be
// left out that otherReaders does not name. A call whose pattern is not written in it is compared with each pattern it
// may have; one whose pattern the check cannot build reads every part as SourcePart | null, or is refused.
export function captureMismatches(sourceOf) {
  const wrong = [];
  for (const c of captureCalls(sourceOf)) {
    if (c.kind === 'variable') {
      if (c.typeArgument === '(SourcePart | null)[]') continue;
      if (!c.sources) { wrong.push(`${c.file}:${c.line} reads ${c.typeArgument || 'SourcePart[]'} from a pattern the check cannot build`); continue; }
      for (const source of c.sources) if (c.typeArgument !== partsType(source)) wrong.push(`${c.file}:${c.line} reads ${c.typeArgument || 'SourcePart[]'} where a pattern it may have gives ${partsType(source) || 'SourcePart[]'}`);
      continue;
    }
    const expected = partsType(c.source);
    if (c.kind === 'pattern' && c.typeArgument !== expected) wrong.push(`${c.file}:${c.line} reads ${c.typeArgument || 'SourcePart[]'} where its pattern gives ${expected || 'SourcePart[]'}`);
    if (c.kind === 'other' && expected && !Object.keys(otherReaders).some(start => c.source.startsWith(start))) wrong.push(`${c.file}:${c.line} has a group that may be left out and no reader named for it`);
  }
  return wrong;
}
