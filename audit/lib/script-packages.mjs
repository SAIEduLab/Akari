// The npm packages a node script may load: the bare specifiers of its static imports and exports, of its require()
// calls (the require that createRequire() makes too) and of its import() of a literal, in functions too (those load when
// called), in the script and in each repository file it reaches that way by a relative path, and the same for every
// node script it may start as a child process (and their children). The workflow contract checks that a job installs
// these packages before it runs the script (AUDIT.md「workflowの契約」).
import fs from 'node:fs';
import path from 'node:path';
import {builtinModules, createRequire} from 'node:module';
import {gateSteps, acceptanceCommands} from './gate-contract.mjs';
import {runtimeRuns} from './japanese-gate-contract.mjs';
const require = createRequire(import.meta.url);
const {parse} = require('@babel/parser');
const {selftestAfterMerge, acceptanceAfterMerge} = require('./shard-plan.cjs');

const builtin = new Set(builtinModules);
const packageName = spec => spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
const skip = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments']);
const functions = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod']);
const launchers = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork']);
const scriptFile = /\.(?:mjs|cjs|js)$/;

// The scripts a launch may start when its source names them only through a variable, by launching file (paths from
// the repository root). A launch of that kind in a file missing here stops the check: it cannot tell what runs.
export function declaredLaunches(root) {
  const literals = file => [...fs.readFileSync(path.join(root, file), 'utf8').matchAll(/['"]((?:audit|src)\/[A-Za-z0-9_\/.-]+\.(?:mjs|cjs|js))['"]/g)].map(m => m[1]);
  const named = (file, pattern) => { const m = fs.readFileSync(path.join(root, file), 'utf8').match(pattern); if (!m) throw new Error(file + ' no longer names what it starts as ' + pattern); return [m[1]]; };
  const gate = () => gateSteps('', '.').map(step => step[1]);
  const acceptance = () => Object.values(acceptanceCommands).flat().map(command => command.match(/"[^"]*"|\S+/g)[1]);
  const browser = () => Object.values(JSON.parse(fs.readFileSync(path.join(root, 'audit/browser/browser-audit-manifest.json'), 'utf8')).groups).flat().map(task => 'audit/browser/cases/' + task.split(':')[0] + '.cjs');
  return {
    'audit/run-ci-lane.mjs': () => literals('audit/run-ci-lane.mjs'),
    'audit/run-local-gate.mjs': gate,
    'audit/run-acceptance.mjs': acceptance,
    // The merge runs only the steps planned after it (audit/lib/shard-plan.cjs).
    'audit/lib/shard-evidence.mjs': () => [...gateSteps('', '.').filter(step => selftestAfterMerge.includes(step[0])).map(step => step[1]), ...Object.values(acceptanceAfterMerge).flat()],
    'audit/browser/run-full-browser-audit.mjs': browser,
    'audit/run-ux-normal-gui.mjs': () => literals('audit/run-ux-normal-gui.mjs'),
    'audit/run-ux-phrase-gui.mjs': () => literals('audit/run-ux-phrase-gui.mjs'),
    'audit/tests/release-renumber.mjs': () => named('audit/tests/release-renumber.mjs', /const command=path\.join\(repositoryRoot,'([^']+)'\);/),
    'audit/tests/runtime-boundary.mjs': () => runtimeRuns.map(([script]) => 'audit/tests/runtime-boundary/' + script),
    // runLimited: the change guard's children (the worlds, the coverage run, the contracts of a tree).
    'audit/lib/behaviour-snapshot.mjs': () => ['audit/lib/behaviour-snapshot.mjs', 'audit/lib/node-coverage.mjs', 'audit/lib/change-guard.mjs'],
    // The guard's entry, loaded by a child that records each module it loads (confined/guard-loads-only-guard-code).
    'audit/tests/change-guard-negative.mjs': () => ['audit/tests/change-guard.mjs'],
    // The change guard loads the contracts of the tree under review (treeIdentity: load('audit/…')).
    'audit/lib/change-guard.mjs': () => { const loads = [...fs.readFileSync(path.join(root, 'audit/lib/change-guard.mjs'), 'utf8').matchAll(/load\('(audit\/[A-Za-z0-9_\/.-]+\.mjs)'\)/g)].map(m => m[1]);
      if (!loads.length) throw new Error('audit/lib/change-guard.mjs no longer names the modules it loads as load(\'audit/…\')'); return loads; },
    // The extension examples, each of which the version check registers (EXAMPLE-VERSIONS).
    'audit/tests/product-source.mjs': () => fs.readdirSync(path.join(root, 'extensions/examples')).filter(name => name.endsWith('.ts')).map(name => 'extensions/examples/' + name),
    // A derived author's own configuration, which the command line names (node extensions/build.mjs …): no audit script.
    'extensions/build.mjs': () => [],
  };
}

// Set of package names for the script at file (a path from root). declared: declaredLaunches(root), or a stand-in.
export function scriptPackages(root, file, declared = declaredLaunches(root)) { return scriptReach(root, file, declared).packages; }
// The packages, and the repository files (paths from root, sorted) the script at file loads or starts.
export function scriptReach(root, file, declared = declaredLaunches(root)) {
  const packages = new Set(), seen = new Set(), queue = [path.resolve(root, file)];
  while (queue.length) {
    const at = queue.pop();
    if (seen.has(at)) continue;
    // a JSON file loaded (require, import) loads nothing more, but the script reads it: it is in reach
    if (at.endsWith('.json')) { seen.add(at); continue; }
    seen.add(at);
    let ast;
    const text = fs.readFileSync(at, 'utf8'), relative = path.relative(root, at).replaceAll('\\', '/');
    // A TypeScript module (the extensions and their examples) is read with its type syntax.
    const typescript = /\.[cm]?ts$/.test(at) ? [['typescript', {dts: /\.d\.[cm]?ts$/.test(at)}]] : [];
    try { ast = parse(text, {sourceType: 'unambiguous', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, plugins: typescript}); }
    catch (error) { throw new Error(relative + ': ' + error.message); }
    const found = spec => {
      if (typeof spec !== 'string' || spec.startsWith('node:') || builtin.has(spec)) return;
      if (spec.startsWith('.')) { queue.push(path.resolve(path.dirname(at), spec)); return; }
      packages.add(packageName(spec));
    };
    const source = n => text.slice(n.start, n.end);
    // A child node script: a literal path (from the root), a path joined from __dirname or the root and a literal file,
    // the script itself (nothing new), or a variable, whose scripts the launching file must have declared.
    const child = (n, script) => {
      if (script?.type === 'StringLiteral') { queue.push(path.resolve(root, script.value)); return; }
      if (script && /^(?:import\.meta\.filename|fileURLToPath\(import\.meta\.url\)|__filename)$/.test(source(script))) return;
      const last = script?.type === 'CallExpression' && /(?:^|\.)path\.(?:join|resolve)$/.test(source(script.callee)) ? script.arguments.at(-1) : null;
      if (last?.type === 'StringLiteral' && scriptFile.test(last.value)) { queue.push(path.resolve(source(script.arguments[0]) === '__dirname' ? path.dirname(at) : root, last.value)); return; }
      if (!Object.hasOwn(declared, relative)) throw new Error(relative + ':' + n.loc.start.line + ' starts a node script it names only through a variable; declare what it starts in declaredLaunches (audit/lib/script-packages.mjs)');
      for (const script of declared[relative]()) queue.push(path.resolve(root, script));
    };
    const makesRequire = n => n?.type === 'CallExpression' && /(?:^|\.)createRequire$/.test(source(n.callee));
    const requires = new Set(['require']);
    const named = n => {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && makesRequire(n.init)) requires.add(n.id.name);
      for (const key of Object.keys(n)) { if (skip.has(key)) continue; const v = n[key]; if (Array.isArray(v)) v.forEach(named); else if (v && typeof v.type === 'string') named(v); }
    };
    named(ast.program);
    const visit = (n, inFunction) => {
      if (!n || typeof n.type !== 'string') return;
      // An import or export of types only loads nothing when the module runs.
      if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(n.type) && n.importKind !== 'type' && n.exportKind !== 'type') found(n.source?.value);
      // A require() or import() in a function loads when it is called, and the job must have the package then too.
      // require is the function of that name, one a createRequire() call made and named, or that call itself
      // (createRequire(import.meta.url)('x')).
      if (n.type === 'CallExpression' && n.arguments[0]?.type === 'StringLiteral' &&
        ((n.callee.type === 'Identifier' && requires.has(n.callee.name)) || makesRequire(n.callee))) found(n.arguments[0].value);
      if ((n.type === 'ImportExpression' && n.source?.type === 'StringLiteral') || (n.type === 'CallExpression' && n.callee.type === 'Import' && n.arguments[0]?.type === 'StringLiteral')) found((n.source ?? n.arguments[0]).value);
      // An import() of a module named only through a variable loads what the file declares, as a launch by a variable.
      else if (n.type === 'ImportExpression' || (n.type === 'CallExpression' && n.callee.type === 'Import')) child(n, null);
      // A launch anywhere in the file, in a function too: what the script may start.
      const name = n.type === 'CallExpression' ? (n.callee.type === 'MemberExpression' ? n.callee.property.name : n.callee.type === 'Identifier' ? n.callee.name : null) : null;
      if (launchers.has(name)) {
        const [first, list] = n.arguments;
        if (name === 'fork') child(n, first);
        else if (first && source(first) === 'process.execPath') child(n, list?.type === 'ArrayExpression' ? list.elements[0] : list);
        else if (first?.type === 'Identifier') child(n, null); // the program itself is a variable: node or not, declared
      }
      const inner = inFunction || functions.has(n.type);
      for (const key of Object.keys(n)) { if (skip.has(key)) continue; const v = n[key]; if (Array.isArray(v)) v.forEach(x => visit(x, inner)); else if (v && typeof v.type === 'string') visit(v, inner); }
    };
    visit(ast.program, false);
  }
  return {packages, files: [...seen].map(at => path.relative(root, at).replaceAll('\\', '/')).sort()};
}
