// Which node product suites (the language forms suite too) and specification worlds run the lines of the given src files
// (AUDIT.md「変えた行の実行」).
// For an editor or an agent choosing what to run before CI: CI still runs everything.
//   node audit/test-map.mjs src/js/07-semantic-analysis.js [more files]
//   node audit/test-map.mjs --changed <base commit>      the src/js files changed since the commit
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import inspector from 'node:inspector/promises';
import {fileURLToPath} from 'node:url';
import {productScript} from './lib/product-script.mjs';
import {suiteExpression} from './lib/product-test-host.mjs';
import {nodeProductSuites} from './lib/gate-case-contract.mjs';
import {snapshotCases, caseBehaviour} from './lib/behaviour-snapshot.mjs';
import {currentProductFile} from './lib/product-path.cjs';
import {languageSuiteName} from './lib/node-coverage.mjs';
import {runLanguageInNode} from './lib/language-suite.mjs';

const globals = () => ({console, TextEncoder, TextDecoder, Uint8Array, Uint32Array, ArrayBuffer, Blob, URL, structuredClone, crypto: crypto.webcrypto, setTimeout, clearTimeout});

// {suites, worlds}: the names of the suites and worlds whose run reaches a line of the files.
export async function testMap(files, {suites = [...nodeProductSuites, languageSuiteName], worlds = snapshotCases()} = {}) {
  const read = file => fs.readFileSync(file, 'utf8');
  const html = read(currentProductFile()), script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const {text, pieces} = productScript(read), shift = script.length - text.length;
  assert.ok(shift >= 0 && script.slice(shift) === text, 'build the product from src first (node src/build.mjs)');
  const spans = pieces.filter(p => files.includes(p.label)).map(p => [p.start + shift, p.end + shift]);
  const session = new inspector.Session(); session.connect();
  const runs = async body => {
    await session.post('Profiler.startPreciseCoverage', {callCount: true, detailed: true});
    await body();
    const {result} = await session.post('Profiler.takePreciseCoverage');
    await session.post('Profiler.stopPreciseCoverage');
    return result.filter(s => s.url === 'akari-product.js').some(entry => entry.functions.some(f => f.ranges.some(r => r.count > 0 &&
      spans.some(([s, e]) => r.startOffset >= s && r.startOffset < e))));
  };
  const out = {suites: [], worlds: []};
  try {
    await session.post('Profiler.enable');
    for (const name of suites)
      if (await runs(async () => {
        const c = vm.createContext(globals()); vm.runInContext(script, c, {filename: 'akari-product.js'});
        if (name === languageSuiteName) runLanguageInNode(c.Akari); else await vm.runInContext(suiteExpression(name), c);
      })) out.suites.push(name);
    const context = vm.createContext(globals());
    vm.runInContext(script, context, {filename: 'akari-product.js'});
    for (const c of worlds) if (await runs(async () => { caseBehaviour(context.Akari, c); })) out.worlds.push(c.id);
  } finally { session.disconnect(); }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length && (args[0] !== '--changed' || args.length === 2), 'usage: node audit/test-map.mjs <src file>... | --changed <base commit>');
  const files = args[0] === '--changed'
    ? cp.execFileSync('git', ['diff', '--name-only', args[1], '--', 'src/js'], {encoding: 'utf8'}).split('\n').filter(Boolean)
    : args;
  const worlds = snapshotCases(), map = await testMap(files, {worlds});
  console.log('Files: ' + files.join(', '));
  for (const name of map.suites) console.log('suite ' + name);
  console.log('specification worlds: ' + map.worlds.length + ' of ' + worlds.length + (map.worlds.length ? ' (' + map.worlds.slice(0, 20).join(', ') + (map.worlds.length > 20 ? ', …' : '') + ')' : ''));
}
