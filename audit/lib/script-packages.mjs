// The npm packages a node script may load: the bare specifiers of its static imports and exports, of its require()
// calls and of its import() of a literal, in functions too (those load when called), in the script and in each
// repository file it reaches that way by a relative path, and the same for every node script it may start as a child
// process (and their children). The workflow contract checks that a job installs these packages before it runs the
// script (AUDIT.md「workflowの契約」).
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
    'audit/run-local-gate.mjs': gate,
    'audit/run-acceptance.mjs': acceptance,
    // The merge runs only the steps planned after it (audit/lib/shard-plan.cjs).
    'audit/lib/shard-evidence.mjs': () => [...gateSteps('', '.').filter(step => selftestAfterMerge.includes(step[0])).map(step => step[1]), ...Object.values(acceptanceAfterMerge).flat()],
    'audit/browser/run-full-browser-audit.mjs': browser,
    'audit/run-ux-normal-gui.mjs': () => literals('audit/run-ux-normal-gui.mjs'),
    'audit/run-ux-phrase-gui.mjs': () => literals('audit/run-ux-phrase-gui.mjs'),
    'audit/tests/release-renumber.mjs': () => named('audit/tests/release-renumber.mjs', /const command=path\.join\(repositoryRoot,'([^']+)'\);/),
    'audit/tests/runtime-boundary.mjs': () => runtimeRuns.map(([script]) => 'audit/tests/runtime-boundary/' + script),
    // runLimited: the change guard's children (the worlds, the coverage run, the world record of the mutants).
    'audit/lib/behaviour-snapshot.mjs': () => ['audit/lib/behaviour-snapshot.mjs', 'audit/lib/node-coverage.mjs', 'audit/lib/mutation.mjs'],
  };
}

// Set of package names for the script at file (a path from root). declared: declaredLaunches(root), or a stand-in.
export function scriptPackages(root, file, declared = declaredLaunches(root)) {
  const packages = new Set(), seen = new Set(), queue = [path.resolve(root, file)];
  while (queue.length) {
    const at = queue.pop();
    if (seen.has(at) || at.endsWith('.json')) continue; // a JSON file loads nothing
    seen.add(at);
    let ast;
    const text = fs.readFileSync(at, 'utf8'), relative = path.relative(root, at).replaceAll('\\', '/');
    try { ast = parse(text, {sourceType: 'unambiguous', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true}); }
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
    const visit = (n, inFunction) => {
      if (!n || typeof n.type !== 'string') return;
      if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(n.type)) found(n.source?.value);
      // A require() or import() in a function loads when it is called, and the job must have the package then too.
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'require' && n.arguments[0]?.type === 'StringLiteral') found(n.arguments[0].value);
      if ((n.type === 'ImportExpression' && n.source?.type === 'StringLiteral') || (n.type === 'CallExpression' && n.callee.type === 'Import' && n.arguments[0]?.type === 'StringLiteral')) found((n.source ?? n.arguments[0]).value);
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
  return packages;
}
