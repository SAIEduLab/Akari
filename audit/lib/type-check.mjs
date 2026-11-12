// The type check of the product's TypeScript modules (tsconfig.json: strict, erasable syntax only) (AUDIT.md「型」).
// Two kinds of finding: the compiler's errors, and what the compiler accepts but leaves unchecked — the any type
// written out, a value whose type is any (a library function such as JSON.parse returns one) or holds any (a `new Map()`
// with no types is a Map<any, any>; a property read of a library's Promise<any>), a value with a library's field of
// type any given, with no cast, where that field is not any (a PropertyDescriptor's value), checking turned off by a comment (@ts-ignore, @ts-expect-error, @ts-nocheck), a
// cast through unknown (`x as unknown as T`) or written in other steps (`x as A as B`: each step may pass where the whole
// would not), a `!` said of a value that is always null or undefined (`undefined!` is a never that fits anywhere), a type
// guard to a type parameter (`asserts x is T`: T is whatever the caller names), a cast to a type that
// is or holds never (`x as never`, `xs as never[]`, `o as { a: never }`: the same never in one step), a type guard to never
// (`x is never`), and an object or array written in place and cast to a type it does not have (`{} as T` claims what the
// value does not yet have: declare the variable with its type instead; a cast to a wider type, such as a table read by
// any key, claims nothing). A cast is judged from the value it starts from, through parentheses, `!` and `satisfies`.
// The one exception is a bag of FILLED_BAGS, made empty by its creator, given to its parts and filled at the creator's
// top level (below).
// Every module and every declaration file of the program must have no error and no finding at all. Among the errors
// are those the joined product script would run silently (all modules share one scope there), so that only the
// compiler, which keeps each module's scope, finds them: a name used without being declared or imported, an import of a
// name the module does not export, an assignment to an imported name, a name used before its declaration, a name
// imported as a type and used as a value. A top-level name that a library declares as a global value is a finding: in
// the joined script it would take that global's place in the other modules.
import path from 'node:path';
import {createRequire} from 'node:module';
import {portableExtensions} from '../../src/build.mjs';

const require = createRequire(import.meta.url);
let typescript = null;
const loadTypeScript = () => typescript ??= require('typescript');

// The bags a creator makes empty, gives to its parts and fills at its top level (S3-J38): in the creator named,
// `const <name> = {} as <type>;` claims what the bag holds once it is filled, and is no finding while all of this holds
// (bagFindings). Each part the creator gives the bag to is a declared function whose parameters only name; its body only
// declares functions and gives, with `Object.assign(<calls or a bag it fills>, {…} satisfies <type>)`, an object of names
// and functions; what it gives the calls is what its asserts adds, written as properties, and it takes the calls the
// parts before it gave (the first takes object). The bag is filled, by the creator (every property of its type written
// at its top level where the write surely runs: not in a branch, a loop, a function, the right side of a short circuit or
// the arguments of an optional call, nor after a return the creator may take) or by the part named. At its top level
// the creator uses the bag only as `bag.name`, written or read once written, and handed to a part. What a function
// it makes there reads is followed when it runs now (called at once, given to map or forEach, or declared there and
// called by its name); what a function that runs later (a listener) or a part's function it calls while it fills the
// bag (such as E) reads is not followed: for the block view and the application, a browser run with the bags as Proxies found no read before a
// write (S3-J38).
export const FILLED_BAGS = Object.freeze([
  Object.freeze({file: 'src/ts/10-block-view.ts', creator: 'createBlockEditorView', name: 'viewVars', type: 'ViewVars', fill: 'creator'}),
  Object.freeze({file: 'src/ts/10-block-view.ts', creator: 'createBlockEditorView', name: 'viewRedraw', type: 'ViewRedraw', fill: 'createViewDrawing'}),
  Object.freeze({file: 'src/ts/11-application.ts', creator: 'initApp', name: 'appVars', type: 'AppVars', fill: 'creator'}),
  Object.freeze({file: 'src/ts/11-application.ts', creator: 'initApp', name: 'appRedraw', type: 'AppRedraw', fill: 'createAppDrawing'}),
]);

// The compiler options the check runs with, exactly as tsconfig.json must give them (strict and every check it turns
// on, erasable syntax only, no library or declaration file left unchecked): a tsconfig.json with another option, another
// value, a setting outside compilerOptions and include/exclude/files (extends brings options of its own; compileOnSave
// checks nothing), is a finding.
export const PINNED_OPTIONS = Object.freeze({target: 'es2023', lib: ['es2023', 'dom', 'dom.iterable'], module: 'esnext', moduleResolution: 'bundler',
  moduleDetection: 'force', allowImportingTsExtensions: true, verbatimModuleSyntax: true, erasableSyntaxOnly: true, noEmit: true, strict: true,
  noImplicitOverride: true, noFallthroughCasesInSwitch: true, types: []});
const CONFIG_KEYS = new Set(['compilerOptions', 'include', 'exclude', 'files', 'compileOnSave']);
export function tsconfigFindings(raw) {
  const findings = [], given = raw?.compilerOptions ?? {}, add = text => findings.push({file: 'tsconfig.json', line: 1, kind: 'compiler options other than the pinned ones', text});
  for (const key of Object.keys(raw ?? {})) if (!CONFIG_KEYS.has(key)) add(key);
  for (const key of new Set([...Object.keys(PINNED_OPTIONS), ...Object.keys(given)]))
    if (JSON.stringify(given[key]) !== JSON.stringify(PINNED_OPTIONS[key])) add(key + ': ' + JSON.stringify(given[key] ?? null));
  return findings;
}

// Casts to a type parameter (`x as T`: T is whatever the caller names) are counted exactly, file by file: the one there
// is gives surfaceCapture's parts the tuple its call names, which no type can derive from the pattern and CAPTURE-PARTS
// checks call by call (audit/lib/capture-parts.mjs). A cast to a type parameter outside surfaceCapture is a finding, and
// so is a count other than the table's (a new one, or one taken away without lowering the table).
export const PARAMETER_CASTS = Object.freeze({'src/ts/04-syntax-sentences.ts': 1});

// The program of tsconfig.json under root; files maps a path under root to the text to read instead of the file's.
export function typeProgram(root, files = {}) {
  const ts = loadTypeScript(), rel = file => path.relative(root, file).split(path.sep).join('/');
  const read = file => Object.hasOwn(files, rel(file)) ? files[rel(file)] : ts.sys.readFile(file);
  const exists = file => Object.hasOwn(files, rel(file)) || ts.sys.fileExists(file);
  const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), read);
  if (config.error) throw Error('tsconfig.json: ' + ts.flattenDiagnosticMessageText(config.error.messageText, ' '));
  // The compiler names files with forward slashes on every system, so the extra files are named the same way.
  const slash = file => file.replace(/\\/g, '/');
  const readDirectory = (dir, ...rest) => {
    const under = slash(dir).replace(/\/$/, '') + '/';
    const extra = Object.keys(files).filter(f => f.endsWith('.ts')).map(f => slash(path.join(root, f))).filter(f => f.startsWith(under));
    return [...new Set([...ts.sys.readDirectory(dir, ...rest).map(slash), ...extra])];
  };
  const parsed = ts.parseJsonConfigFileContent(config.config, {...ts.sys, readFile: read, fileExists: exists, readDirectory}, root);
  if (parsed.errors.length) throw Error('tsconfig.json: ' + parsed.errors.map(e => ts.flattenDiagnosticMessageText(e.messageText, ' ')).join('; '));
  const host = ts.createCompilerHost(parsed.options);
  host.readFile = read;
  host.fileExists = exists;
  return {program: ts.createProgram({rootNames: parsed.fileNames, options: parsed.options, host}), rel, config: config.config};
}

// {files, errors: [{file, line, code, message}], anys: [{file, line, kind, text}]} for the modules of tsconfig.json under root.
export function typeCheck(root, files = {}, bags = FILLED_BAGS, parameterCasts = PARAMETER_CASTS) {
  const ts = loadTypeScript(), {program, rel, config} = typeProgram(root, files), checker = program.getTypeChecker();
  const at = (sf, pos) => ({file: rel(sf.fileName), line: sf.getLineAndCharacterOfPosition(pos).line + 1});
  const errors = ts.getPreEmitDiagnostics(program).map(d => ({...(d.file ? at(d.file, d.start ?? 0) : {file: 'tsconfig.json', line: 0}), code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, ' ')}));
  const anys = tsconfigFindings(config), bagCasts = new Map(), castCounts = {};
  const own = program.getSourceFiles().filter(sf => !rel(sf.fileName).startsWith('..') && !sf.fileName.includes('/node_modules/'));
  for (const sf of own) {
    const add = (node, kind) => anys.push({...at(sf, node.getStart(sf)), kind, text: node.getText(sf).replace(/\s+/g, ' ').slice(0, 80)});
    const isAny = node => !!(checker.getTypeAtLocation(node).flags & ts.TypeFlags.Any);
    // any inside the type: a type argument, an element, a member of a union.
    const holdsAny = (type, depth = 0) => {
      if (depth > 3) return false;
      if (type.flags & ts.TypeFlags.Any) return depth > 0;
      if (type.isUnionOrIntersection()) return type.types.some(t => holdsAny(t, depth + 1));
      // (an iterator's types after the first, the value it ends with and takes, are any by the library's default)
      if (type.flags & ts.TypeFlags.Object && type.objectFlags & ts.ObjectFlags.Reference)
        return checker.getTypeArguments(type).slice(0, ITERATOR_TYPES.has(type.target?.symbol?.name) ? 1 : undefined).some(t => holdsAny(t, depth + 1));
      return false;
    };
    // An any is reported where it starts, not at each later step of the same chain (a property of it, a call of it).
    const through = node => ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isAwaitExpression(node) ? node.expression : null;
    // A value declared global in a declaration file of the product is a promise the page keeps: only the library's own
    // (clearTimeout, clearInterval, parseFloat, written again with unknown) may be; another would be a ReferenceError there.
    if (sf.isDeclarationFile && rel(sf.fileName).startsWith('src/types/') && !ts.isExternalModule(sf))
      for (const statement of sf.statements)
        for (const name of ts.isFunctionDeclaration(statement) && statement.name ? [statement.name] : ts.isVariableStatement(statement) ? statement.declarationList.declarations.map(d => d.name).filter(ts.isIdentifier) : [])
          if (!['clearTimeout', 'clearInterval', 'parseFloat'].includes(name.text)) anys.push({...at(sf, name.getStart(sf)), kind: 'a global value declared that the page may not have', text: name.text});
    for (const m of sf.getFullText().matchAll(/@ts-(?:ignore|expect-error|nocheck)\b/g)) anys.push({...at(sf, m.index), kind: 'checking turned off', text: m[0]});
    // The product joins its modules in one scope: a top-level name that a library declares as a global value
    // (performance, status, history …) would take that global's place in every other module, which the compiler, with
    // one scope for each module, does not see.
    // (the extensions the product embeds join that scope too: src/build.mjs portableExtensions)
    if (!sf.isDeclarationFile && (rel(sf.fileName).startsWith('src/ts/') || portableExtensions.includes(rel(sf.fileName))))
      for (const statement of sf.statements)
        for (const name of topLevelNames(ts, statement))
          if (checker.resolveName(name.text, undefined, ts.SymbolFlags.Value, false)) add(name, 'a top-level name that hides a global');
    // A cast is judged at its last step, from the value it starts from to the type it ends with: parentheses, `!` and
    // `satisfies` between them hide nothing (`({}) as T` is `{} as T`), and a cast written in steps (`x as A as B`,
    // `(x as A) as B`) is a finding of its own, since each step may pass where the whole would not.
    const nothing = type => !!(type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) || type.isUnion() && type.types.every(nothing);
    const castStep = n => ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isNonNullExpression(n) || ts.isParenthesizedExpression(n);
    const castStart = n => { let e = n.expression; while (castStep(e)) e = e.expression; return e; };
    const innerCasts = n => { const types = []; for (let e = n.expression; castStep(e); e = e.expression) if (ts.isAsExpression(e)) types.push(e.type); return types; };
    // A type that is never, or holds it where a value is read: a type argument (an element), a property the type asks
    // for, an index, what a call returns.
    const holdsNever = (type, depth = 0) => {
      if (type.flags & ts.TypeFlags.Never) return true;
      if (depth > 3) return false;
      if (type.isUnionOrIntersection()) return type.types.some(t => holdsNever(t, depth + 1));
      if (!(type.flags & ts.TypeFlags.Object)) return false;
      if (type.objectFlags & ts.ObjectFlags.Reference) return checker.getTypeArguments(type).some(t => holdsNever(t, depth + 1));
      if (!(type.objectFlags & (ts.ObjectFlags.Anonymous | ts.ObjectFlags.Mapped))) return false;
      return checker.getPropertiesOfType(type).some(p => !(p.flags & ts.SymbolFlags.Optional) && holdsNever(checker.getTypeOfSymbol(p), depth + 1)) ||
        checker.getIndexInfosOfType(type).some(info => holdsNever(info.type, depth + 1)) ||
        type.getCallSignatures().some(s => holdsNever(s.getReturnType(), depth + 1));
    };
    const lastStep = n => { let p = n.parent; while (ts.isParenthesizedExpression(p)) p = p.parent; return !(ts.isAsExpression(p) || ts.isSatisfiesExpression(p) || ts.isNonNullExpression(p)); };
    // `const <name> = {} as <type>;` in the creator of a listed bag (checked by bagFindings below).
    const listedBag = n => {
      const decl = n.parent, list = decl?.parent, fn = list?.parent?.parent?.parent;
      if (!ts.isObjectLiteralExpression(n.expression) || n.expression.properties.length || !ts.isVariableDeclaration(decl) || decl.initializer !== n ||
        !ts.isIdentifier(decl.name) || !(list.flags & ts.NodeFlags.Const) || !fn || !ts.isFunctionDeclaration(fn) || !fn.name) return null;
      return bags.find(b => b.file === rel(sf.fileName) && b.creator === fn.name.text && b.name === decl.name.text && b.type === n.type.getText(sf)) ?? null;
    };
    const visit = node => {
      const bag = ts.isAsExpression(node) ? listedBag(node) : null;
      if (bag) bagCasts.set(bag, [...(bagCasts.get(bag) ?? []), node]);
      else if (node.kind === ts.SyntaxKind.AnyKeyword) add(node, 'any written');
      else if (ts.isAsExpression(node) && !lastStep(node)) { /* judged at the last step */ }
      // `!` says a value is not null or undefined: said of one that is always null or undefined, it makes a never.
      else if (ts.isNonNullExpression(node) && nothing(checker.getTypeAtLocation(node.expression))) add(node, 'a non-null claim of nothing');
      else if (ts.isAsExpression(node) && node.type.kind !== ts.SyntaxKind.UnknownKeyword && innerCasts(node).some(t => t.kind === ts.SyntaxKind.UnknownKeyword)) add(node, 'a cast through unknown');
      else if (ts.isAsExpression(node) && !ts.isConstTypeReference(node.type) && innerCasts(node).some(t => !ts.isConstTypeReference(t))) add(node, 'a cast in steps');
      // A literal cast to a type it already has (a wider one: `{a: 1} as Record<string, number>`) claims nothing, and
      // neither does an object written with every property the type asks for (only how its values go together).
      else if (ts.isAsExpression(node) && node.type.kind !== ts.SyntaxKind.UnknownKeyword && !ts.isConstTypeReference(node.type) && (ts.isObjectLiteralExpression(castStart(node)) || ts.isArrayLiteralExpression(castStart(node))) &&
        !checker.isTypeAssignableTo(checker.getTypeAtLocation(castStart(node)), checker.getTypeFromTypeNode(node.type)) && lacksProperties(ts, checker, castStart(node), node.type)) add(node, 'a literal cast to a type');
      else if (!sf.isDeclarationFile && isValueExpression(ts, node) && isAny(node) && !(through(node) && isAny(through(node)))) add(node, 'a value of type any');
      else if (!sf.isDeclarationFile && (ts.isNewExpression(node) || ts.isCallExpression(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && !isAny(node) && holdsAny(checker.getTypeAtLocation(node)) && !(through(node) && isAny(through(node)))) add(node, 'a value whose type holds any');
      // These run on every node, beside the chain above.
      // never fits anywhere: a cast to it says the value is what nothing checks, as `x as unknown as T` does in two steps.
      if (ts.isAsExpression(node) && !ts.isConstTypeReference(node.type) && holdsNever(checker.getTypeFromTypeNode(node.type))) add(node, 'a cast to never');
      if (ts.isTypePredicateNode(node) && node.type && holdsNever(checker.getTypeFromTypeNode(node.type))) add(node, 'a type guard to never');
      // A type parameter is whatever the caller names: a guard to it (`asserts x is T`, `x is T`) lets any value be any
      // type, as `x as unknown as T` does.
      if (ts.isTypePredicateNode(node) && node.type && checker.getTypeFromTypeNode(node.type).flags & ts.TypeFlags.TypeParameter) add(node, 'a type guard to a type parameter');
      if (ts.isAsExpression(node) && checker.getTypeFromTypeNode(node.type).flags & ts.TypeFlags.TypeParameter) {
        castCounts[rel(sf.fileName)] = (castCounts[rel(sf.fileName)] ?? 0) + 1;
        let fn = node.parent; while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
        if (!(fn && ts.isFunctionDeclaration(fn) && fn.name?.text === 'surfaceCapture' && rel(sf.fileName) === 'src/ts/04-syntax-sentences.ts')) add(node, 'a cast to a type parameter outside surfaceCapture');
      }
      // A value with a field of type any (a library's: PropertyDescriptor's value) given, with no cast, where the type it
      // goes into has a field of that name that is not any: the compiler takes the any as any type there.
      if (!sf.isDeclarationFile && ts.isExpression(node) && !ts.isParenthesizedExpression(node.parent) && !castContext(ts, node)) {
        const target = checker.getContextualType(node), source = target && !(target.flags & ts.TypeFlags.Any) ? checker.getTypeAtLocation(node) : null;
        if (source && !(source.flags & ts.TypeFlags.Any) && anyFieldsGiven(ts, checker, source, target).length) add(node, 'an any field given to a type');
      }
      // (a replacer written there, in brackets, or given by its name: the function declared or bound to that name)
      const isReplace = call => ts.isCallExpression(call) && ts.isPropertyAccessExpression(call.expression) && ['replace', 'replaceAll'].includes(call.expression.name.text) && call.arguments.length === 2;
      if (isReplace(node) && functionOf(ts, checker, node.arguments[1]))
        for (const param of replacerIssues(ts, checker, node.arguments[0], functionOf(ts, checker, node.arguments[1]))) add(param, 'a replacer parameter typed as what replace does not give');
      // A function given where the library gives any (JSON.stringify's replacer, a message's data): a parameter written
      // narrower claims what nothing checks, so it is written unknown in the place of each any (replace's replacer above).
      // A function given by its name is checked where it is given, against what is given there.
      const givenAny = (fn, signature) => fn.parameters.forEach((param, i) => {
        const given = param.type && !param.dotDotDotToken && signature?.parameters[i] && checker.getTypeOfSymbolAtLocation(signature.parameters[i], fn);
        if (!given || !(given.flags & ts.TypeFlags.Any || holdsAny(given))) return;
        if (checker.typeToString(checker.getTypeFromTypeNode(param.type)) !== checker.typeToString(given).replace(/\bany\b/g, 'unknown')) add(param, 'a parameter typed narrower than the any it is given');
      });
      if (!sf.isDeclarationFile && (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && !(isReplace(node.parent) && node.parent.arguments[1] === node))
        givenAny(node, checker.getContextualType(node)?.getNonNullableType().getCallSignatures()[0]);
      if (!sf.isDeclarationFile && ts.isCallExpression(node) && !isReplace(node))
        for (const arg of node.arguments) if (ts.isIdentifier(arg) && functionOf(ts, checker, arg)) givenAny(functionOf(ts, checker, arg), checker.getContextualType(arg)?.getNonNullableType().getCallSignatures()[0]);
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  anys.push(...bagFindings(ts, program, checker, rel, bags, bagCasts));
  for (const file of new Set([...Object.keys(castCounts), ...Object.keys(parameterCasts)]))
    if ((castCounts[file] ?? 0) !== (parameterCasts[file] ?? 0)) anys.push({file, line: 1, kind: 'casts to a type parameter other than PARAMETER_CASTS', text: (castCounts[file] ?? 0) + ' where the table has ' + (parameterCasts[file] ?? 0)});
  return {files: own.map(sf => rel(sf.fileName)), errors, anys};
}

// What does not hold of the bags listed (FILLED_BAGS): a bag not made as listed (or made twice, or in two functions of
// the creator's name); a part that is not a declared function, whose parameters do more than name, whose body does more
// than declare functions and give what it offers, whose calls are not given with `satisfies` what its `asserts` adds, or
// that takes other calls than the part before it gives; calls written as methods; a bag not filled (a property no sure
// top-level write of the creator gives, or no `Object.assign(<bag>, {…} satisfies <type>)` in the part named); a property
// read at the creator's top level before it is written; and a use of the bag there other than `bag.name` and handing it
// to a part.
// The calls that keep the function they are given for later (bagFindings): listeners, timers, a frame, a promise.
const LATER_CALLS = new Set(['listen', 'button', 'addEventListener', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'queueMicrotask', 'then', 'catch', 'finally']);
function bagFindings(ts, program, checker, rel, bags, casts) {
  const findings = [], checkedParts = new Set(), checkedCreators = new Set();
  const add = (node, kind, text) => { const sf = node.getSourceFile(); findings.push({file: rel(sf.fileName), line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, kind, text}); };
  const unwrap = e => { while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e))) e = e.expression; return e; };
  const isFunction = e => !!e && (ts.isArrowFunction(unwrap(e)) || ts.isFunctionExpression(unwrap(e)));
  const calleeName = call => { const e = unwrap(call.expression); return ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : null; };
  const assignCall = st => ts.isExpressionStatement(st) && ts.isCallExpression(st.expression) && st.expression.expression.getText() === 'Object.assign' ? st.expression : null;
  const members = t => ts.isIntersectionTypeNode(t) ? t.types.map(m => m.getText()) : [t.getText()];
  const resolved = callee => { let symbol = checker.getSymbolAtLocation(callee); if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol); return symbol; };
  const declarationOf = callee => resolved(callee)?.declarations?.find(d => ts.isFunctionDeclaration(d) && d.body) ?? null;
  const assertsOf = part => part.type && ts.isTypePredicateNode(part.type) && part.type.assertsModifier && ts.isIdentifier(part.type.parameterName) && part.type.type ? part.type : null;
  // What a part gives (the object of an Object.assign): names and functions only, so that giving runs nothing.
  const givesOnlyNames = object => ts.isObjectLiteralExpression(object) && object.properties.every(p => ts.isShorthandPropertyAssignment(p) && !p.objectAssignmentInitializer ||
    ts.isPropertyAssignment(p) && (ts.isIdentifier(p.initializer) || isFunction(p.initializer)));
  // Calls written as methods take their parameters loosely (bivariantly): the interface of a part's calls has properties.
  const checkProperties = (typeNode, at) => {
    const symbol = ts.isTypeReferenceNode(typeNode) ? resolved(typeNode.typeName) : null;
    for (const d of symbol?.declarations ?? []) for (const m of ts.isInterfaceDeclaration(d) ? d.members : ts.isTypeAliasDeclaration(d) && ts.isTypeLiteralNode(d.type) ? d.type.members : [])
      if (!ts.isPropertySignature(m)) add(at, 'calls written as methods', typeNode.getText() + ': ' + m.getText().replace(/\s+/g, ' ').slice(0, 60));
  };
  // A part's body, and what it offers against what its asserts adds; the bags it fills are given with satisfies too.
  const checkPart = (part, fills) => {
    if (checkedParts.has(part)) return;
    checkedParts.add(part);
    const name = part.name?.text ?? '(a part)', asserted = assertsOf(part), params = new Set(part.parameters.map(p => ts.isIdentifier(p.name) ? p.name.text : null));
    if (part.parameters.some(p => !ts.isIdentifier(p.name) || p.initializer || p.dotDotDotToken)) add(part, 'a part whose parameters do more than name', name);
    for (const st of part.body.statements) {
      const call = assignCall(st), target = call && ts.isIdentifier(call.arguments[0]) ? call.arguments[0].text : null, given = call?.arguments[1];
      if (ts.isFunctionDeclaration(st) || ts.isVariableStatement(st) && st.declarationList.flags & ts.NodeFlags.Const && st.declarationList.declarations.every(d => isFunction(d.initializer))) continue;
      if (call && call.arguments.length === 2 && params.has(target) && (target === asserted?.parameterName.text || fills.has(target)) && ts.isSatisfiesExpression(given) && givesOnlyNames(given.expression)) continue;
      add(st, 'a part that does more than declare functions', name + ': ' + st.getText().replace(/\s+/g, ' ').slice(0, 60));
    }
    if (!asserted) { add(part, 'a part that asserts nothing', name); return; }
    const callsName = asserted.parameterName.text, param = part.parameters.find(p => ts.isIdentifier(p.name) && p.name.text === callsName);
    const given = part.body.statements.map(assignCall).filter(c => c && ts.isIdentifier(c.arguments[0]) && c.arguments[0].text === callsName);
    const adds = members(asserted.type), takes = param?.type ? members(param.type) : [];
    const offered = given.length === 1 && given[0].arguments.length === 2 && ts.isSatisfiesExpression(given[0].arguments[1]) ? given[0].arguments[1].type : null;
    if (offered?.getText() !== adds.at(-1) || JSON.stringify(adds.length === 1 ? ['object'] : adds.slice(0, -1)) !== JSON.stringify(takes))
      add(part, 'a part not checked against what it asserts', name + ' asserts ' + asserted.type.getText() + ', takes ' + (param?.type?.getText() ?? '?') + ', gives ' + (offered?.getText() ?? '(no one Object.assign with satisfies)'));
    if (offered) checkProperties(offered, part);
  };
  // The parts a creator calls (a top-level statement that calls a name with the bag), in order.
  const partCallsOf = (creator, bagName) => creator.body.statements.map(st => ts.isExpressionStatement(st) && ts.isCallExpression(st.expression) && ts.isIdentifier(st.expression.expression) &&
    st.expression.arguments.some(a => ts.isIdentifier(a) && a.text === bagName) ? st.expression : null).filter(Boolean);
  // A creator's parts in order: each takes the calls the part before it gives (the first takes object).
  const checkCreator = (creator, partCalls) => {
    if (checkedCreators.has(creator)) return;
    checkedCreators.add(creator);
    const before = new Map();
    for (const call of partCalls) {
      const part = declarationOf(call.expression), asserted = part && assertsOf(part);
      if (!asserted) continue;
      const index = part.parameters.findIndex(p => ts.isIdentifier(p.name) && p.name.text === asserted.parameterName.text), passed = call.arguments[index];
      if (!passed || !ts.isIdentifier(passed)) continue;
      const takes = part.parameters[index].type ? members(part.parameters[index].type) : [], expected = before.get(passed.text) ?? ['object'];
      if (JSON.stringify(takes) !== JSON.stringify(expected))
        add(call, 'a part that takes other calls than the part before it gives', part.name.text + ' takes ' + takes.join(' & ') + ', the parts before it give ' + expected.join(' & '));
      before.set(passed.text, members(asserted.type));
    }
  };
  for (const bag of bags) {
    const made = casts.get(bag) ?? [];
    if (!made.length) { findings.push({file: bag.file, line: 0, kind: 'a filled bag not made as listed', text: 'const ' + bag.name + ' = {} as ' + bag.type + ' in ' + bag.creator}); continue; }
    const cast = made[0];
    if (made.length > 1) add(made[1], 'a filled bag made twice', bag.name + ' in ' + bag.creator);
    let creator = cast.parent; while (!ts.isFunctionDeclaration(creator)) creator = creator.parent;
    const sf = creator.getSourceFile(), named = [];
    const findNamed = n => { if (ts.isFunctionDeclaration(n) && n.name?.text === bag.creator) named.push(n); ts.forEachChild(n, findNamed); };
    findNamed(sf);
    if (named.length > 1) add(named[1], 'two functions named as the creator', bag.creator);
    const statements = creator.body.statements, partCalls = partCallsOf(creator, bag.name), partStatements = new Set(partCalls.map(c => c.parent));
    const fillsOf = callee => { const fills = new Set(); for (const other of bags) if (other.fill === callee.text && other.file === bag.file && other.creator === bag.creator) {
      const call = partCalls.find(c => c.expression.text === callee.text), part = call && declarationOf(call.expression), i = call ? call.arguments.findIndex(a => ts.isIdentifier(a) && a.text === other.name) : -1;
      if (part && i >= 0 && ts.isIdentifier(part.parameters[i]?.name)) fills.add(part.parameters[i].name.text); } return fills; };
    for (const call of partCalls) { const part = declarationOf(call.expression); if (part) checkPart(part, fillsOf(call.expression)); else add(call, 'a part that is not a declared function', call.expression.getText()); }
    checkCreator(creator, partCalls);
    // Filled by a part: its Object.assign gives the bag with satisfies its type.
    let fillAt = -1;
    if (bag.fill !== 'creator') {
      const call = partCalls.find(c => c.expression.text === bag.fill), part = call && declarationOf(call.expression);
      const index = call ? call.arguments.findIndex(a => ts.isIdentifier(a) && a.text === bag.name) : -1, param = part?.parameters[index];
      const gives = part && param && ts.isIdentifier(param.name) && part.body.statements.map(assignCall).some(c => c && ts.isIdentifier(c.arguments[0]) && c.arguments[0].text === param.name.text &&
        c.arguments.length === 2 && ts.isSatisfiesExpression(c.arguments[1]) && c.arguments[1].type.getText() === bag.type);
      if (!gives) add(cast, 'a filled bag not filled', bag.name + ': no Object.assign(…, {…} satisfies ' + bag.type + ') in ' + bag.fill);
      fillAt = call ? statements.indexOf(call.parent) : -1;
    }
    // The creator's top level, in the order it runs. A write counts when it surely runs: not in a branch, a loop, the
    // right side of a short circuit, the arguments of an optional call, or after a return the creator may take before.
    const bagSymbol = checker.getSymbolAtLocation(cast.parent.name), isBag = n => ts.isIdentifier(n) && n.text === bag.name && checker.getSymbolAtLocation(n) === bagSymbol;
    const written = new Set();
    let filled = false, exited = false;
    const read = (node, name) => { if (!filled && !written.has(name)) add(node, 'a filled bag read before it is filled', bag.name + '.' + name); };
    const plainAssign = new Set([ts.SyntaxKind.EqualsToken]), logicalAssign = new Set([ts.SyntaxKind.BarBarEqualsToken, ts.SyntaxKind.AmpersandAmpersandEqualsToken, ts.SyntaxKind.QuestionQuestionEqualsToken]);
    const isAssign = k => k >= ts.SyntaxKind.FirstAssignment && k <= ts.SyntaxKind.LastAssignment;
    const shortCircuit = new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken]);
    const prop = n => ts.isPropertyAccessExpression(n) && !n.questionDotToken && isBag(n.expression) ? n.name.text : null;
    // The functions the creator declares at its top level (function declarations, and const names of a function).
    const localFunctions = new Map(), followed = new Set();
    for (const st of statements) {
      if (ts.isFunctionDeclaration(st) && st.name && st.body) localFunctions.set(checker.getSymbolAtLocation(st.name), st);
      if (ts.isVariableStatement(st) && st.declarationList.flags & ts.NodeFlags.Const)
        for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer && isFunction(d.initializer)) localFunctions.set(checker.getSymbolAtLocation(d.name), unwrap(d.initializer));
    }
    const walk = (node, sure) => {
      if (!node) return;
      // A function made here runs later (a listener, a timer, an observer made with new, a promise's then), unless it is
      // called at once or given to a call that runs it now (map, forEach, find …): what it reads is followed then, and
      // what it writes may not be written.
      if (ts.isFunctionLike(node) || ts.isClassLike(node)) return;
      // (new Promise runs the function given to it at once: what it reads is followed too)
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Promise' && node.arguments?.[0] && isFunction(node.arguments[0])) { walk(unwrap(node.arguments[0]).body, false); return; }
      if (ts.isCallExpression(node) && isFunction(node.expression)) { const fn = unwrap(node.expression); for (const a of node.arguments) walk(a, sure); walk(fn.body, false); return; }
      // A function declared at the creator's top level and called there by its name runs now too: what it reads is
      // followed (each function once).
      const local = ts.isCallExpression(node) && ts.isIdentifier(node.expression) ? localFunctions.get(checker.getSymbolAtLocation(node.expression)) : null;
      if (local) { for (const a of node.arguments) walk(a, sure); if (!followed.has(local)) { followed.add(local); walk(local.body, false); } return; }
      // (a function of the creator given there by its name runs now as one written there does)
      const named = a => ts.isIdentifier(a) ? localFunctions.get(checker.getSymbolAtLocation(a)) : null;
      if (ts.isCallExpression(node) && !node.questionDotToken && !(node.flags & ts.NodeFlags.OptionalChain) && !LATER_CALLS.has(calleeName(node)) && node.arguments.some(a => isFunction(a) || named(a))) {
        walk(node.expression, sure);
        for (const a of node.arguments) if (isFunction(a)) walk(unwrap(a).body, false); else if (named(a)) { if (!followed.has(named(a))) { followed.add(named(a)); walk(named(a).body, false); } } else walk(a, sure);
        return;
      }
      if (ts.isBinaryExpression(node) && isAssign(node.operatorToken.kind)) {
        const kind = node.operatorToken.kind;
        if (!plainAssign.has(kind)) walk(node.left, sure);
        const surely = sure && !logicalAssign.has(kind);
        walk(node.right, surely); target(node.left, surely); return;
      }
      if (ts.isBinaryExpression(node) && shortCircuit.has(node.operatorToken.kind)) { walk(node.left, sure); walk(node.right, false); return; }
      if (ts.isConditionalExpression(node)) { walk(node.condition, sure); walk(node.whenTrue, false); walk(node.whenFalse, false); return; }
      if (ts.isCallExpression(node) && (node.questionDotToken || node.flags & ts.NodeFlags.OptionalChain)) { walk(node.expression, sure); for (const a of node.arguments) walk(a, false); return; }
      const name = prop(node);
      if (name !== null) { read(node, name); return; }
      if (isBag(node)) { add(node, 'a use of a filled bag the rule does not follow', node.parent.getText().replace(/\s+/g, ' ').slice(0, 60)); return; }
      ts.forEachChild(node, child => walk(child, sure));
    };
    const target = (node, sure) => {
      node = unwrap(node);
      const name = prop(node);
      if (name !== null) { if (sure && !exited) written.add(name); return; }
      if (ts.isObjectLiteralExpression(node)) {
        for (const p of node.properties)
          if (ts.isPropertyAssignment(p)) element(p.initializer, sure);
          else if (ts.isShorthandPropertyAssignment(p)) { walk(p.objectAssignmentInitializer, false); walk(p.name, sure); }
          else if (ts.isSpreadAssignment(p)) target(p.expression, sure);
        return;
      }
      if (ts.isArrayLiteralExpression(node)) { for (const e of node.elements) element(ts.isSpreadElement(e) ? e.expression : e, sure); return; }
      walk(node, sure);
    };
    // A default in a pattern runs only when the value is undefined; the element is written either way.
    const element = (node, sure) => { if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) { walk(node.right, false); target(node.left, sure); } else target(node, sure); };
    // The defaults of a declared pattern, after the value it takes apart.
    const pattern = name => { if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) for (const e of name.elements) if (ts.isBindingElement(e)) { walk(e.propertyName && ts.isComputedPropertyName(e.propertyName) ? e.propertyName : undefined, true); walk(e.initializer, false); pattern(e.name); } };
    const exits = node => { let found = false; const look = n => { if (found || ts.isFunctionLike(n) || ts.isClassLike(n)) return; if (ts.isReturnStatement(n) || ts.isThrowStatement(n)) found = true; else ts.forEachChild(n, look); }; look(node); return found; };
    statements.forEach((st, i) => {
      if (ts.isFunctionDeclaration(st)) return;
      if (partStatements.has(st)) { for (const a of st.expression.arguments) if (!isBag(a)) walk(a, true); }
      else if (ts.isExpressionStatement(st)) walk(st.expression, true);
      else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) { walk(d.initializer, true); pattern(d.name); }
      else ts.forEachChild(st, child => walk(child, false));
      if (i === fillAt) filled = true;
      if (i < statements.length - 1 && exits(st)) exited = true;
    });
    if (bag.fill === 'creator')
      for (const p of checker.getPropertiesOfType(checker.getTypeFromTypeNode(cast.type)))
        if (!(p.flags & ts.SymbolFlags.Optional) && !written.has(p.name)) add(cast, 'a filled bag not filled', bag.name + '.' + p.name);
  }
  return findings;
}

// Whether a literal cast to a type lacks a property the type asks for (of every member of a union): an array
// literal, or an object with a spread, is taken to lack one when it is not of the type.
// Whether an expression is what a cast (`x as T`, through parentheses) starts from: the cast rules judge it.
function castContext(ts, node) {
  let p = node.parent;
  while (ts.isParenthesizedExpression(p)) p = p.parent;
  return ts.isAsExpression(p);
}
// The fields of type any (not methods) of a value's type that go into a field of the same name that is not any, in
// every member of the receiving type the value's member fits (an SVGElement given to HTMLElement | SVGElement keeps its
// className of any where SVGElement has it too).
function anyFieldsGiven(ts, checker, source, target) {
  const members = t => t.isUnion() ? t.types : [t], any = t => !!(t.flags & ts.TypeFlags.Any), found = new Set();
  for (const s of members(source)) {
    if (!(s.flags & ts.TypeFlags.Object)) continue;
    const into = members(target).filter(t => t.flags & ts.TypeFlags.Object && checker.isTypeAssignableTo(s, t));
    for (const p of checker.getPropertiesOfType(s)) {
      if (p.flags & ts.SymbolFlags.Method || !any(checker.getTypeOfSymbol(p))) continue;
      const fields = into.map(t => checker.getPropertyOfType(t, p.name));
      if (fields.length && fields.every(q => q && !any(checker.getTypeOfSymbol(q)))) found.add(p.name);
    }
  }
  return [...found];
}
// The parameters of a replacer (the function given to replace) whose written type cannot hold what replace gives at
// that place: the match (text), each group of the pattern (text, or undefined too when the group may match nothing),
// the place of the match (a number) and the whole text. A pattern that is no literal gives no count of groups: its
// parameters after the match take text or a number. (lib.d.ts gives the parameters the types they are written with.)
// The function an argument is: written there (also in brackets), or the function or the arrow its name was declared with.
function functionOf(ts, checker, node) {
  while (node && ts.isParenthesizedExpression(node)) node = node.expression;
  if (node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node))) return node;
  const declaration = node && ts.isIdentifier(node) ? checker.getSymbolAtLocation(node)?.valueDeclaration : null;
  if (declaration && ts.isFunctionDeclaration(declaration) && declaration.body) return declaration;
  let value = declaration && ts.isVariableDeclaration(declaration) ? declaration.initializer : null;
  while (value && ts.isParenthesizedExpression(value)) value = value.expression;
  return value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) ? value : null;
}
function replacerIssues(ts, checker, pattern, replacer) {
  const groups = ts.isRegularExpressionLiteral(pattern) ? regexGroups(pattern.text.slice(1, pattern.text.lastIndexOf('/'))) : ts.isStringLiteralLike(pattern) ? [] : null;
  const holds = (param, flag) => { const t = checker.getTypeFromTypeNode(param.type); return (t.isUnion() ? t.types : [t]).some(m => m.flags & flag); };
  const text = ts.TypeFlags.StringLike, number = ts.TypeFlags.NumberLike, none = ts.TypeFlags.Undefined;
  return replacer.parameters.filter((param, i) => {
    if (!param.type || param.dotDotDotToken) return false;
    if (i === 0) return !holds(param, text);
    if (!groups) return !holds(param, text) && !holds(param, number);
    if (i <= groups.length) return !holds(param, text) || (groups[i - 1].optional && !holds(param, none));
    if (i === groups.length + 1) return !holds(param, number);
    if (i === groups.length + 2) return !holds(param, text);
    // (after the whole text replace gives the named groups, when the pattern has some, and nothing else)
    return !(i === groups.length + 3 && /\(\?<(?![=!])/.test(pattern.text));
  });
}
// The groups of a regular expression's source, in order: whether each may match nothing (it, or a group around it, is
// in a branch of an alternation or under ?, * or {0,…}). A group is ( not followed by ?, or a named one (?<name>…).
function regexGroups(source) {
  const groups = [], open = [{alt: false, own: null}];
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '\\') { i++; continue; }
    if (c === '[') { for (i++; i < source.length && source[i] !== ']'; i++) if (source[i] === '\\') i++; continue; }
    if (c === '(') {
      const capturing = source[i + 1] !== '?' || (source[i + 2] === '<' && !'=!'.includes(source[i + 3]));
      const group = capturing ? {optional: false} : null;
      if (group) groups.push(group);
      open.push({alt: false, own: group, inner: groups.length});
    } else if (c === '|') open.at(-1).alt = true;
    else if (c === ')' && open.length > 1) {
      const level = open.pop(), next = source.slice(i + 1);
      const quantified = /^(?:[?*]|\{0[,}])/.test(next);
      // what was opened inside this group may match nothing when its own branches or its quantifier allow it
      for (const g of groups.slice(level.inner - (level.own ? 1 : 0))) if (quantified || (level.alt && g !== level.own)) g.optional = true;
    }
  }
  if (open[0].alt) for (const g of groups) g.optional = true;
  return groups;
}
const ITERATOR_TYPES = new Set(['Iterable', 'Iterator', 'IterableIterator', 'IteratorObject', 'AsyncIterable', 'AsyncIterator', 'AsyncIterableIterator', 'AsyncIteratorObject', 'Generator', 'AsyncGenerator']);
// The names a module statement declares at the top level: a function, a class, and each name of a variable statement.
function topLevelNames(ts, statement) {
  if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) return [statement.name];
  if (!ts.isVariableStatement(statement)) return [];
  const names = [], bind = n => { if (ts.isIdentifier(n)) names.push(n); else for (const e of n.elements) if (!ts.isOmittedExpression(e)) bind(e.name); };
  for (const d of statement.declarationList.declarations) bind(d.name);
  return names;
}
function lacksProperties(ts, checker, literal, typeNode) {
  if (!ts.isObjectLiteralExpression(literal) || literal.properties.some(p => ts.isSpreadAssignment(p))) return true;
  const written = new Set(literal.properties.map(p => p.name && ts.isIdentifier(p.name) || p.name && ts.isStringLiteral(p.name) ? p.name.text : null));
  const target = checker.getTypeFromTypeNode(typeNode), members = target.isUnion() ? target.types : [target];
  return !members.some(member => checker.getPropertiesOfType(member).every(p => p.flags & ts.SymbolFlags.Optional || written.has(p.name)));
}

// An expression the program reads as a value: a name read (not one being declared, a property name or a label), a
// property read, a call, a new, an await.
function isValueExpression(ts, node) {
  if (ts.isCallExpression(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isNewExpression(node) || ts.isAwaitExpression(node)) return true;
  if (!ts.isIdentifier(node)) return false;
  const parent = node.parent;
  if (ts.isTypeNode(parent)) return false; // a name in a type, such as the x of `x is T`
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (ts.isTypeReferenceNode(parent) || ts.isQualifiedName(parent) || ts.isTypeQueryNode(parent) || ts.isImportSpecifier(parent) || ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent)) return false;
  if ('name' in parent && parent.name === node && !ts.isShorthandPropertyAssignment(parent)) return false;
  if (ts.isBindingElement(parent) && parent.propertyName === node) return false;
  return true;
}

// The findings the gate refuses: every error and every finding, in every module and declaration file of the program.
export function typeIssues({errors, anys}) {
  return [...errors.map(e => e.file + ':' + e.line + ' TS' + e.code + ' ' + e.message), ...anys.map(a => a.file + ':' + a.line + ' ' + a.kind + ': ' + a.text)];
}
