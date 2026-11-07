// Which lines of the product the node product suites and the specification worlds run (AUDIT.md「変えた行の実行」).
// The product's script is run in node contexts under V8 block coverage. A line ran when a character on it, other than
// spacing, lies in a range that ran. Lines are the lines of the product file itself (its HTML), so a line is named where
// the product holds it, whatever source files the product was built from.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import inspector from 'node:inspector/promises';
import {fileURLToPath} from 'node:url';
import {suiteExpression} from './product-test-host.mjs';
import {nodeProductSuites} from './gate-case-contract.mjs';
import {snapshotCases, caseBehaviour, runLimited} from './behaviour-snapshot.mjs';
import {runLanguageInNode} from './language-suite.mjs';
// The language forms suite's name among the suites (audit/run-language-tests.mjs runs it with its checks).
export const languageSuiteName = 'language-forms';

const scriptName = 'akari-product.js';
const contextGlobals = () => ({console, TextEncoder, TextDecoder, Uint8Array, Uint32Array, ArrayBuffer, Blob, URL, structuredClone, crypto: crypto.webcrypto, setTimeout, clearTimeout});

// The product's script and the line of the product file its first character lies on.
export function productLines(html) {
  const open = html.indexOf('<script>'), close = html.lastIndexOf('</script>');
  if (open < 0 || close < open) throw new Error('the product has no script');
  const start = open + '<script>'.length;
  return {script: html.slice(start, close), firstLine: html.slice(0, start).split('\n').length};
}

// (file, line) -> [start, end) offsets in the script of that line of the product file (null for a line outside it).
export function lineOffsets(html, file) {
  const {script, firstLine} = productLines(html), index = new Map();
  let line = firstLine, from = 0;
  for (let i = 0; i <= script.length; i++) {
    if (i === script.length || script.charCodeAt(i) === 10) { if (i > from) index.set(line, [from, i]); line++; from = i + 1; }
  }
  return (fileName, at) => fileName === file ? index.get(at) ?? null : null;
}

// The lines of the product file that ran, for one coverage result.
function linesRan(result, script, firstLine) {
  const ran = new Uint8Array(script.length);
  for (const entry of result.filter(s => s.url === scriptName)) {
    const counts = new Int32Array(script.length).fill(-1);
    const ranges = entry.functions.flatMap(f => f.ranges).sort((a, b) => (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset));
    for (const r of ranges) counts.fill(r.count, Math.max(0, r.startOffset), Math.max(0, Math.min(r.endOffset, script.length)));
    for (let i = 0; i < script.length; i++) if (counts[i] > 0) ran[i] = 1;
  }
  const lines = new Set();
  let line = firstLine;
  for (let i = 0; i < script.length; i++) {
    const ch = script.charCodeAt(i);
    if (ch === 10) { line++; continue; }
    if (ran[i] && ch !== 32 && ch !== 9 && ch !== 13) lines.add(line);
  }
  return lines;
}

// {all, bySuite}: file -> Set of the product file's lines that ran, for every run together and per node product suite
// (the language forms suite too, and 'worlds' for the specification worlds). file names the product file.
export async function nodeCoverage(html, file) {
  const {script, firstLine} = productLines(html);
  const session = new inspector.Session();
  session.connect();
  const bySuite = new Map(), all = new Set();
  const take = async (name, body) => {
    await session.post('Profiler.startPreciseCoverage', {callCount: true, detailed: true});
    await body();
    const {result} = await session.post('Profiler.takePreciseCoverage');
    await session.post('Profiler.stopPreciseCoverage');
    const lines = linesRan(result, script, firstLine);
    bySuite.set(name, new Map([[file, lines]]));
    for (const l of lines) all.add(l);
  };
  try {
    await session.post('Profiler.enable');
    for (const name of nodeProductSuites) await take(name, async () => {
      const context = vm.createContext(contextGlobals());
      vm.runInContext(script, context, {filename: scriptName, timeout: 30000});
      await vm.runInContext(suiteExpression(name), context, {timeout: 60000});
    });
    await take(languageSuiteName, async () => {
      const context = vm.createContext(contextGlobals());
      vm.runInContext(script, context, {filename: scriptName, timeout: 30000});
      runLanguageInNode(context.Akari);
    });
    await take('worlds', async () => {
      const context = vm.createContext(contextGlobals());
      vm.runInContext(script, context, {filename: scriptName, timeout: 30000});
      for (const c of snapshotCases()) caseBehaviour(context.Akari, c);
    });
  } finally { session.disconnect(); }
  return {all: new Map([[file, all]]), bySuite, script, shift: 0, lineOffsets: lineOffsets(html, file)};
}

// nodeCoverage in a child process (node audit/lib/node-coverage.mjs --run <page> <file> <record>), stopped after limitMs.
export function boundedCoverage(html, file, limitMs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akari-coverage-'));
  try {
    const page = path.join(dir, 'page.html'), record = path.join(dir, 'record.json');
    fs.writeFileSync(page, html);
    runLimited([fileURLToPath(import.meta.url), '--run', page, file, record], limitMs, 'the coverage run');
    const raw = JSON.parse(fs.readFileSync(record, 'utf8')), sets = byFile => new Map(Object.entries(byFile).map(([name, lines]) => [name, new Set(lines)]));
    return {all: sets(raw.all), bySuite: new Map(Object.entries(raw.bySuite).map(([name, byFile]) => [name, sets(byFile)])), script: productLines(html).script, shift: 0, lineOffsets: lineOffsets(html, file)};
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === '--run') {
  const [page, file, record] = process.argv.slice(3);
  const {all, bySuite} = await nodeCoverage(fs.readFileSync(page, 'utf8'), file);
  const plain = byFile => Object.fromEntries([...byFile].map(([name, lines]) => [name, [...lines]]));
  fs.writeFileSync(record, JSON.stringify({all: plain(all), bySuite: Object.fromEntries([...bySuite].map(([name, byFile]) => [name, plain(byFile)]))}));
}
