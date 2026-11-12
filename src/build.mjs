/* SPDX-License-Identifier: MIT */
// Builds the single-file product from src/. The committed Akari_<major>_<minor>_<patch>.html is this build's output;
// edit src/ and rebuild instead of editing the product directly.
//   node src/build.mjs          write the product next to the repository root
//   node src/build.mjs --check  fail unless the committed product equals the build
//
// The sources are TypeScript modules: src/ts/*.ts and the portable extensions extensions/*.ts. The product is one
// script. The build erases the types of every module, drops its imports and the export keywords, and puts the modules
// one after another, in the order src/akari.html lists them, inside the one strict function the template opens. The
// modules therefore share one scope, and two modules that declare the same top-level name are refused. Only type
// syntax that erases to nothing is accepted: no enum, namespace, parameter property, decorator, angle-bracket
// assertion, `declare` of a value, and no class field without a value other than one named with # or a `declare` one
// (such a field would become a property the class did not have). Every statement ends with a semicolon, so a line that
// follows removed type text never continues the statement before it. The parentheses written only to give the one
// parameter of an arrow function its type go with the type (`(x: T) => …` is `x => …`), and so do those written only
// to cast a name or a member chain (`(x as T).y` is `x.y`); comments stay as written.
// The modules the template marks @portable (the portable extensions among them) are what the exported player runs: it
// embeds their functions through toString() (PORTABLE_FUNCTIONS) without the rest of the product. So a portable module
// holds only functions, each strict by itself, and takes values only from portable modules, and PORTABLE_FUNCTIONS
// names every one of their functions, in the order the template includes them.
// The TypeScript compiler (typescript, an audit dependency of a pinned version) is used for its parser only.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
let typescript = null;
export const loadTypeScript = () => typescript ??= require('typescript');

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const templatePath = 'src/akari.html';
// Directories whose every file the template must include exactly once.
export const sourceDirectories = ['src/css', 'src/ts'];
// The portable extensions: modules the product embeds and fork developers build with (extensions/build.mjs).
export const portableExtensions = ['extensions/profiles.ts', 'extensions/foundation.ts'];
// The list of the functions the exported player embeds: a top-level const of one module.
export const portableListName = 'PORTABLE_FUNCTIONS';

const includeLine = /^<!-- @(include|portable) ([a-z0-9.][a-z0-9/._-]*) -->$/;
const directiveWord = /@(?:include|portable)\b/;
const releaseLine = /^ {2}const PRODUCT_RELEASE = '(\d+\.\d+\.\d+)';$/m;
const indentUnit = '  ';

const readText = root => file => fs.readFileSync(path.join(root, file), 'utf8');
const listFiles = root => dir => fs.readdirSync(path.join(root, dir)).sort().map(name => dir + '/' + name);

function requireLines(text, file) {
  if (!text.endsWith('\n') || text.includes('\r')) throw Error(file + ': expected LF-terminated text');
}
const lineIndex = starts => at => {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= at) lo = mid; else hi = mid - 1; }
  return lo;
};
function bindingNames(ts, name) {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap(e => ts.isOmittedExpression(e) ? [] : bindingNames(ts, e.name));
}
const hasModifier = (node, kind) => !!node.modifiers?.some(m => m.kind === kind);
const parseModule = (ts, text, file) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

// One module as product script: its types erased, its imports and export keywords removed, each line indented by one
// unit unless it starts inside a template literal. Also its imports ({from, line, names:[{name, typeOnly}]}), its
// exports ({name, type}), the value names its top level declares, and for each output line its source line.
export function compileModule(text, file) {
  requireLines(text, file);
  if (/[\u2028\u2029]/.test(text)) throw Error(file + ': U+2028 and U+2029 end lines for the parser but not for the line map: write them as \\u2028 and \\u2029');
  const ts = loadTypeScript(), K = ts.SyntaxKind;
  const source = parseModule(ts, text, file);
  const parseErrors = source.parseDiagnostics || [];
  if (parseErrors.length) {
    const d = parseErrors[0], {line, character} = source.getLineAndCharacterOfPosition(d.start);
    throw Error(file + ':' + (line + 1) + ':' + (character + 1) + ': ' + ts.flattenDiagnosticMessageText(d.messageText, ' '));
  }
  const lineOfNode = node => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const refuse = (node, what) => { throw Error(file + ':' + lineOfNode(node) + ': ' + what); };
  const edits = [], imports = [], exported = [], declared = [];
  const remove = (start, end) => { if (end > start) edits.push({start, end, text: ''}); };
  // A whole statement, with its line when nothing else is on it. Comments stay where they are written.
  const removeStatement = node => {
    const start = node.getStart(source), end = node.getEnd();
    let lineStart = start; while (lineStart > 0 && (text[lineStart - 1] === ' ' || text[lineStart - 1] === '\t')) lineStart--;
    let lineEnd = end; while (lineEnd < text.length && (text[lineEnd] === ' ' || text[lineEnd] === '\t')) lineEnd++;
    if ((lineStart === 0 || text[lineStart - 1] === '\n') && text[lineEnd] === '\n') remove(lineStart, lineEnd + 1);
    else remove(start, end);
  };
  // The colon of a type annotation and the annotation.
  const removeAnnotation = typeNode => {
    let colon = typeNode.getFullStart() - 1;
    while (colon >= 0 && /\s/.test(text[colon])) colon--;
    if (text[colon] !== ':') refuse(typeNode, 'expected ":" before a type annotation');
    remove(colon, typeNode.getEnd());
  };
  const removeToken = token => { if (token) remove(token.getStart(source), token.getEnd()); };
  // <T, U> of a declaration or a call.
  const removeAngles = list => {
    if (!list?.length) return;
    let open = list.pos - 1; while (open >= 0 && text[open] !== '<') open--;
    let close = list.end; while (close < text.length && text[close] !== '>') close++;
    remove(open, close + 1);
  };
  const removeKeyword = modifier => { let end = modifier.getEnd(); while (text[end] === ' ') end++; remove(modifier.getStart(source), end); };
  const classMemberModifiers = [K.PrivateKeyword, K.ProtectedKeyword, K.PublicKeyword, K.ReadonlyKeyword, K.OverrideKeyword];
  const eraseModifiers = (node, topLevel) => {
    for (const modifier of node.modifiers || []) {
      if (modifier.kind === K.ExportKeyword && topLevel) removeKeyword(modifier);
      else if (classMemberModifiers.includes(modifier.kind) && (ts.isClassElement(node) || ts.isParameter(node))) {
        if (ts.isParameter(node)) refuse(node, 'parameter properties do not erase to JavaScript');
        removeKeyword(modifier);
      } else if (modifier.kind === K.AsyncKeyword || modifier.kind === K.StaticKeyword) { /* JavaScript */ }
      else if (modifier.kind === K.ConstKeyword && ts.isTypeParameterDeclaration(node)) { /* inside a removed list */ }
      else if (modifier.kind === K.DefaultKeyword) refuse(node, 'default exports are not used (export the declaration by its name)');
      else if (modifier.kind === K.Decorator) refuse(node, 'decorators are not used');
      else refuse(node, 'the modifier ' + ts.tokenToString(modifier.kind) + ' does not erase to JavaScript');
    }
  };
  const visit = (node, topLevel) => {
    switch (node.kind) {
      case K.ImportDeclaration: {
        if (!topLevel) refuse(node, 'an import inside a block');
        const clause = node.importClause;
        if (!clause) refuse(node, 'an import without names');
        if (clause.name) refuse(node, 'default imports are not used');
        const bindings = clause.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings)) refuse(node, 'only named imports ({a, b}) are used');
        const names = bindings.elements.map(element => {
          if (element.propertyName) refuse(element, 'an import renames ' + element.propertyName.text + '; import it by its own name');
          return {name: element.name.text, typeOnly: clause.isTypeOnly || element.isTypeOnly};
        });
        imports.push({from: node.moduleSpecifier.text, line: lineOfNode(node), names});
        removeStatement(node);
        return;
      }
      case K.ExportDeclaration: refuse(node, 'export lists and re-exports are not used (export the declaration itself)');
      case K.ExportAssignment: refuse(node, 'export default and export = are not used');
      case K.ImportEqualsDeclaration: refuse(node, 'import = is not used');
      case K.EnumDeclaration: refuse(node, 'enum does not erase to JavaScript (use a union of literals)');
      case K.ModuleDeclaration: refuse(node, 'namespace and module declarations do not erase to JavaScript');
      case K.Decorator: refuse(node, 'decorators are not used');
      case K.TypeAssertionExpression: refuse(node, 'use `value as Type`, not `<Type>value`');
      case K.InterfaceDeclaration:
      case K.TypeAliasDeclaration:
        // (as the only sentence of an if or a loop it would take the next sentence in its place when it goes)
        if (!ts.isSourceFile(node.parent) && !ts.isBlock(node.parent) && !ts.isModuleBlock(node.parent)) refuse(node, 'a type declared where a block is not written does not erase');
        if (topLevel && hasModifier(node, K.ExportKeyword)) exported.push({name: node.name.text, type: true});
        removeStatement(node);
        return;
      case K.FunctionDeclaration:
      case K.MethodDeclaration:
      case K.Constructor:
      case K.GetAccessor:
      case K.SetAccessor:
        if (hasModifier(node, K.AbstractKeyword)) refuse(node, 'abstract members are not used');
        if (hasModifier(node, K.DeclareKeyword)) refuse(node, '"declare" makes no value: import the value from the module that makes it');
        if (!node.body) { removeStatement(node); return; } // an overload signature
        if (ts.isMethodDeclaration(node) && node.questionToken && ts.isObjectLiteralExpression(node.parent)) refuse(node, 'an optional method in an object is not JavaScript');
        break;
      case K.PropertyDeclaration:
        if (hasModifier(node, K.DeclareKeyword)) { removeStatement(node); return; }
        if (hasModifier(node, K.AbstractKeyword)) refuse(node, 'abstract members are not used');
        if (hasModifier(node, K.AccessorKeyword)) refuse(node, 'accessor fields are not used');
        // A field without a value would become a property the class did not have; a field named with # (#name) is
        // JavaScript's own declaration and stays as it is written.
        if (!node.initializer && !ts.isPrivateIdentifier(node.name)) refuse(node, 'a class field without a value becomes a property the class did not have: give it a value or write `declare`');
        break;
      case K.IndexSignature: removeStatement(node); return;
      case K.VariableStatement:
        if (hasModifier(node, K.DeclareKeyword)) refuse(node, '"declare" makes no value: import the value from the module that makes it');
        break;
      case K.ClassDeclaration:
        if (hasModifier(node, K.DeclareKeyword)) refuse(node, '"declare" makes no value: import the value from the module that makes it');
        if (hasModifier(node, K.AbstractKeyword)) refuse(node, 'abstract classes are not used');
        break;
      case K.HeritageClause:
        if (node.token === K.ImplementsKeyword) {
          let start = node.getStart(source); while (start > 0 && text[start - 1] === ' ') start--;
          remove(start, node.getEnd());
          return;
        }
        break;
      case K.AsExpression:
      case K.SatisfiesExpression:
        visit(node.expression, false);
        remove(node.expression.getEnd(), node.getEnd());
        return;
      case K.NonNullExpression:
        visit(node.expression, false);
        remove(node.getEnd() - 1, node.getEnd());
        return;
      case K.ExpressionWithTypeArguments:
        removeAngles(node.typeArguments);
        visit(node.expression, false);
        return;
      case K.ParenthesizedExpression: {
        // `(x as T).y` was written with parentheses for the type alone: when what is cast is a name, this, or a member,
        // index or call chain, the parentheses go with the type, so the JavaScript is `x.y` (the same program). A chain
        // with ?. keeps them unless ?. also follows them (`(a?.b as T)?.c` is `a?.b?.c`; `(a?.b).c` is not `a?.b.c`).
        let inner = node.expression;
        if (!ts.isAsExpression(inner) && !ts.isSatisfiesExpression(inner)) break;
        while (ts.isAsExpression(inner) || ts.isSatisfiesExpression(inner) || ts.isNonNullExpression(inner)) inner = inner.expression;
        const parent = node.parent, optionalNext = (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent) || ts.isCallExpression(parent)) &&
          parent.expression === node && !!parent.questionDotToken;
        const chain = ts.isIdentifier(inner) || inner.kind === K.ThisKeyword ||
          (ts.isPropertyAccessExpression(inner) || ts.isElementAccessExpression(inner) || ts.isCallExpression(inner)) && (!ts.isOptionalChain(inner) || optionalNext);
        // The callee of a new keeps them when its chain has a call: new (o.f().C as T)() is not new o.f().C().
        let link = inner; while (ts.isPropertyAccessExpression(link) || ts.isElementAccessExpression(link) || ts.isNonNullExpression(link)) link = link.expression;
        const newCallee = ts.isNewExpression(node.parent) && node.parent.expression === node && (ts.isCallExpression(inner) || ts.isCallExpression(link));
        const open = node.getStart(source), close = node.getEnd() - 1;
        // (over lines they stay: return (⏎ o.x as T⏎).y without them would return nothing)
        if (chain && !newCallee && !/[\w$]/.test(text[open - 1] || '') && !/[\w$]/.test(text[close + 1] || '') && !text.slice(open, close).includes('\n')) { remove(open, open + 1); remove(close, close + 1); }
        break;
      }
      case K.ArrowFunction: {
        // `(x: T) => …` was written with parentheses for the type alone: they go with it, so the JavaScript is `x => …`.
        // Right after a word they stay (async(x: T) => is not asyncx =>, return(x: T) => is not returnx =>).
        const [only] = node.parameters;
        // (with type parameters, async<T>(x: T) => keeps them: the word before <T> would join the parameter)
        if (node.parameters.length === 1 && !node.typeParameters && ts.isIdentifier(only.name) && only.type && !only.initializer && !only.dotDotDotToken && !only.questionToken) {
          let open = only.getStart(source) - 1; while (open >= 0 && /\s/.test(text[open])) open--;
          let close = only.getEnd(); while (close < text.length && /\s/.test(text[close])) close++;
          if (text[open] === '(' && text[close] === ')' && !/[\w$]/.test(text[open - 1] || '')) { remove(open, open + 1); remove(close, close + 1); }
        }
        break;
      }
      case K.Parameter:
        if (ts.isIdentifier(node.name) && node.name.text === 'this') {
          // A this parameter goes with what follows it up to the next parameter, or up to the closing parenthesis.
          const params = node.parent.parameters, next = params[params.indexOf(node) + 1];
          let end = next ? next.getStart(source) : node.getEnd();
          if (!next) while (end < text.length && text[end] !== ')') end++;
          remove(node.getStart(source), end);
          return;
        }
        break;
    }
    if (ts.canHaveModifiers(node) && node.modifiers) eraseModifiers(node, topLevel);
    if (node.typeParameters) removeAngles(node.typeParameters);
    if ((ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isTaggedTemplateExpression(node)) && node.typeArguments) removeAngles(node.typeArguments);
    if (node.type && !ts.isTypeNode(node) && (ts.isParameter(node) || ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isFunctionLike(node)))
      removeAnnotation(node.type);
    if ((ts.isParameter(node) || ts.isPropertyDeclaration(node) || ts.isMethodDeclaration(node) && ts.isClassLike(node.parent)) && node.questionToken) removeToken(node.questionToken);
    if (ts.isVariableDeclaration(node) && node.exclamationToken) removeToken(node.exclamationToken);
    if (ts.isPropertyDeclaration(node) && node.exclamationToken) refuse(node, 'a field declared with ! has no value: write `declare`');
    ts.forEachChild(node, child => {
      // removed with their owner above; `f<T>` and `extends Base<T>` are expressions whose type arguments go
      if (ts.isTypeNode(child) && !ts.isExpressionWithTypeArguments(child) || ts.isTypeParameterDeclaration(child)) return;
      visit(child, false);
    });
  };
  for (const statement of source.statements) {
    if (hasModifier(statement, K.ExportKeyword) && !ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement)) {
      if (ts.isFunctionDeclaration(statement) && statement.body || ts.isClassDeclaration(statement)) exported.push({name: statement.name.text});
      else if (ts.isVariableStatement(statement)) for (const d of statement.declarationList.declarations) for (const name of bindingNames(ts, d.name)) exported.push({name});
    }
    if (!hasModifier(statement, K.DeclareKeyword)) {
      if (ts.isFunctionDeclaration(statement) && statement.body || ts.isClassDeclaration(statement)) declared.push(statement.name.text);
      else if (ts.isVariableStatement(statement)) {
        if (!(statement.declarationList.flags & (ts.NodeFlags.Const | ts.NodeFlags.Let))) refuse(statement, 'var is not used at the top level (use const or let)');
        for (const d of statement.declarationList.declarations) declared.push(...bindingNames(ts, d.name));
      }
    }
    visit(statement, true);
  }
  // Every statement ends with a semicolon: a removed type at the end of a line could otherwise let the next line, if
  // it starts with ( [ ` + - /, continue the statement.
  const ending = [K.ExpressionStatement, K.VariableStatement, K.ReturnStatement, K.ThrowStatement, K.BreakStatement, K.ContinueStatement, K.DoStatement, K.ImportDeclaration, K.PropertyDeclaration];
  const semicolons = node => {
    if (ending.includes(node.kind) && node.getLastToken(source)?.kind !== K.SemicolonToken) refuse(node, 'end the statement with ";"');
    ts.forEachChild(node, semicolons);
  };
  semicolons(source);
  // Lines that start inside a template literal, or inside a string continued over lines, keep their spacing; every
  // other line is indented.
  const starts = source.getLineStarts(), inLiteral = new Set();
  const markLiterals = node => {
    const parts = ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node) ? [node] : ts.isTemplateExpression(node) ? [node.head, ...node.templateSpans.map(s => s.literal)] : [];
    for (const part of parts) for (let i = part.getStart(source); i < part.getEnd() - 1; i++) if (text[i] === '\n') inLiteral.add(i + 1);
    ts.forEachChild(node, markLiterals);
  };
  markLiterals(source);
  // A line removed whole, with its line break (an import, a type), gets no indentation either.
  const removed = edits.filter(e => e.end > e.start);
  for (const start of starts)
    if (start < text.length && text[start] !== '\n' && !inLiteral.has(start) && !removed.some(e => e.start <= start && e.end > text.indexOf('\n', start)))
      edits.push({start, end: start, text: indentUnit});
  edits.sort((a, b) => a.start - b.start || (a.end - a.start) - (b.end - b.start));
  // Each output line keeps the source line of the first thing written on it.
  const sourceLine = lineIndex(starts);
  let out = '', at = 0, fresh = true, origin = 1;
  const lines = [];
  const write = (piece, from) => {
    if (!piece) return;
    for (let i = 0; i < piece.length; i++) {
      if (fresh) { origin = sourceLine(from + i) + 1; fresh = false; }
      out += piece[i];
      if (piece[i] === '\n') { lines.push(origin); fresh = true; }
    }
  };
  for (const edit of edits) {
    if (edit.start < at) {
      if (edit.end <= at) continue; // inside a range already removed
      throw Error(file + ': overlapping edits at offset ' + edit.start);
    }
    write(text.slice(at, edit.start), at);
    write(edit.text, edit.start);
    at = edit.end;
  }
  write(text.slice(at), at);
  return {text: out, lines, imports, exported, declared};
}

// A file of shared types: no product code, so only its types are imported.
const typeFile = file => /^src\/types\/[a-z0-9][a-z0-9.-]*\.d\.ts$/.test(file) || file === 'extensions/types.d.ts';
const resolveImport = (from, specifier) => path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));

// The template's include lines in order: {kind: include|portable, written, target, place: script|style|null}. A line that names a
// directive but is not one is refused.
function templateIncludes(template) {
  const out = [];
  let place = null;
  for (const line of template.split('\n')) {
    const open = line.match(/^<(script|style)(?:\s[^>]*)?>$/);
    if (open) place = open[1];
    else if (line === '</script>' || line === '</style>') place = null;
    const m = line.match(includeLine);
    if (!m) { if (directiveWord.test(line)) throw Error(templatePath + ': malformed directive: ' + line); continue; }
    out.push({kind: m[1], written: m[2], target: path.posix.normalize('src/' + m[2]), place});
  }
  return out;
}

export function buildProduct({root = repositoryRoot, read = readText(root), list = listFiles(root)} = {}) {
  const template = read(templatePath);
  requireLines(template, templatePath);
  const includes = templateIncludes(template), used = new Set();
  // An include names a file directly inside a source directory, or a portable extension. The normalized path is the
  // file's identity; any other spelling of it is an alias. A module goes in the script, a style sheet in the style.
  for (const {kind, target, written, place} of includes) {
    if (!(sourceDirectories.includes(path.posix.dirname(target)) && !written.endsWith('/')) && !portableExtensions.includes(target))
      throw Error(templatePath + ': include outside ' + sourceDirectories.join(' or ') + ' and the portable extensions: ' + written);
    if (used.has(target)) throw Error(templatePath + ': included twice: ' + target);
    if (path.posix.relative('src', target) !== written) throw Error(templatePath + ': include alias: ' + written + ' names ' + target);
    if (place === 'script' ? !target.endsWith('.ts') : place !== 'style' || !target.endsWith('.css') || kind !== 'include')
      throw Error(templatePath + ': ' + written + ': the script includes the .ts modules, the style the .css files');
    used.add(target);
  }
  const unused = sourceDirectories.flatMap(list).filter(file => !used.has(file));
  if (unused.length) throw Error('source files not included: ' + unused.join(', '));
  const unembedded = portableExtensions.filter(file => !used.has(file));
  if (unembedded.length) throw Error('portable extensions not embedded: ' + unembedded.join(', '));
  const portable = includes.filter(i => i.kind === 'portable').map(i => i.target);
  for (const file of portableExtensions) if (!portable.includes(file)) throw Error(templatePath + ': ' + file + ' is not @portable');
  const ts = loadTypeScript(), modules = new Map(), syntax = new Map();
  for (const {kind, target} of includes) if (target.endsWith('.ts')) {
    const text = read(target);
    modules.set(target, {kind, ...compileModule(text, target)});
    syntax.set(target, parseModule(ts, text, target));
  }
  // A module imports only modules the product includes, by names they export; a portable module takes values only
  // from portable modules (the exported player has nothing else).
  for (const [file, m] of modules) for (const imp of m.imports) {
    if (!imp.from.startsWith('.')) throw Error(file + ':' + imp.line + ': import from ' + imp.from + ': only the product\'s own modules');
    const target = resolveImport(file, imp.from);
    // The shared types (src/types/*.d.ts, extensions/types.d.ts) hold types only: they are imported with `import type`.
    if (typeFile(target)) {
      if (imp.names.some(n => !n.typeOnly)) throw Error(file + ':' + imp.line + ': ' + target + ' holds types only: import from it with `import type`');
      try { read(target); } catch { throw Error(file + ':' + imp.line + ': import from ' + imp.from + ', which does not exist'); }
      continue;
    }
    if (!modules.has(target)) throw Error(file + ':' + imp.line + ': import from ' + imp.from + ', which the product does not include');
    const into = modules.get(target);
    for (const {name, typeOnly} of imp.names) {
      const value = into.exported.some(x => x.name === name && !x.type), type = into.exported.some(x => x.name === name && x.type);
      if (!value && !type) throw Error(file + ':' + imp.line + ': ' + target + ' exports no ' + name);
      if (!typeOnly && value && m.kind === 'portable' && into.kind !== 'portable')
        throw Error(file + ':' + imp.line + ': the portable module imports ' + name + ' from ' + target + ', which is not portable');
    }
  }
  // No top-level name twice: the modules share the one scope of the product's function.
  const owner = new Map();
  for (const [file, m] of modules) for (const name of m.declared) {
    if (owner.has(name)) throw Error('top-level name ' + name + ' is declared by both ' + owner.get(name) + ' and ' + file);
    owner.set(name, file);
  }
  // A portable module holds only functions (and types), each opened with 'use strict' so its text is strict wherever it
  // is embedded; their names in template order are what PORTABLE_FUNCTIONS must list.
  const portableFunctions = [];
  for (const file of portable) {
    const sf = syntax.get(file), lineOf = node => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    for (const statement of sf.statements) {
      if (ts.isImportDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue;
      if (!ts.isFunctionDeclaration(statement) || !statement.name)
        throw Error(file + ':' + lineOf(statement) + ': a portable module holds only functions: the exported player embeds its functions alone');
      const first = statement.body.statements[0];
      if (!first || !ts.isExpressionStatement(first) || !ts.isStringLiteral(first.expression) || first.getText(sf) !== "'use strict';")
        throw Error(file + ':' + lineOf(statement) + ': the portable function ' + statement.name.text + " opens with 'use strict';");
      portableFunctions.push({name: statement.name.text, file});
    }
  }
  // PORTABLE_FUNCTIONS: one top-level const of a module outside the portable ones, a list of the names it imports from
  // the modules that declare them.
  const lists = [];
  for (const [file, sf] of syntax) for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const d of statement.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === portableListName) lists.push({file, statement, d});
  }
  if (lists.length !== 1) throw Error(portableListName + ' is declared ' + lists.length + ' times at the top level of the modules; expected once');
  const [{file: listFile, statement: listStatement, d: listDeclaration}] = lists;
  // Object.freeze([a, b, …]): the exporter and the public API share the list, so nothing may change it.
  const init = listDeclaration.initializer, frozen = init && ts.isCallExpression(init) && init.expression.getText(syntax.get(listFile)) === 'Object.freeze' && init.arguments.length === 1 ? init.arguments[0] : null;
  const listValue = frozen && ts.isArrayLiteralExpression(frozen) ? frozen : null;
  if (portable.includes(listFile)) throw Error(listFile + ': ' + portableListName + ' is not declared in a portable module');
  if (!(listStatement.declarationList.flags & ts.NodeFlags.Const) || !listValue || !listValue.elements.every(ts.isIdentifier))
    throw Error(listFile + ': ' + portableListName + ' is a const Object.freeze([…]) of function names');
  const listed = listValue.elements.map(e => e.text), expected = portableFunctions.map(f => f.name);
  if (listed.join() !== expected.join())
    throw Error(listFile + ': ' + portableListName + ' lists ' + listed.join(', ') + '; the functions of the portable modules, in the order the template includes them, are ' + expected.join(', '));
  const listImports = modules.get(listFile).imports;
  for (const {name, file} of portableFunctions)
    if (!listImports.some(imp => resolveImport(listFile, imp.from) === file && imp.names.some(n => n.name === name && !n.typeOnly)))
      throw Error(listFile + ': ' + portableListName + ' names ' + name + ' without importing it from ' + file);
  // The page: each include replaced; for every line of the script, the file and line it comes from.
  let html = '', inScript = false;
  const scriptLines = [], sources = [templatePath];
  const emit = (file, text, lines) => { html += text; if (inScript) for (const line of lines) scriptLines.push({file, line}); };
  template.slice(0, -1).split('\n').forEach((row, i) => {
    const m = row.match(includeLine);
    if (row === '</script>') inScript = false;
    if (!m) { emit(templatePath, row + '\n', [i + 1]); if (row === '<script>') inScript = true; return; }
    const target = path.posix.normalize('src/' + m[2]);
    sources.push(target);
    if (target.endsWith('.css')) { const css = read(target); requireLines(css, target); emit(target, css, css.slice(0, -1).split('\n').map((_, k) => k + 1)); return; }
    const mod = modules.get(target);
    emit(target, mod.text, mod.lines);
  });
  const release = html.match(releaseLine);
  if (!release) throw Error('PRODUCT_RELEASE not found');
  const open = html.indexOf('<script>\n') + '<script>\n'.length, script = html.slice(open, html.lastIndexOf('</script>'));
  if (/<\/script/i.test(script)) throw Error('the script holds "</script", which would end it in the page');
  try { new vm.Script(script, {filename: 'product-script.js'}); }
  catch (error) { throw Error('the built script does not parse: ' + error.message); }
  return {file: 'Akari_' + release[1].replaceAll('.', '_') + '.html', html, sources, script, scriptLines, portable, portableFunctions, portableList: listFile};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {file, html} = buildProduct();
  const target = path.join(repositoryRoot, file);
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(target) ? fs.readFileSync(target) : null;
    if (!current || !current.equals(Buffer.from(html, 'utf8'))) {
      console.error(file + ' does not match the build from src/');
      process.exitCode = 1;
    } else console.log(file + ' matches the build from src/');
  } else {
    fs.writeFileSync(target, html);
    console.log('Built ' + file);
  }
}
