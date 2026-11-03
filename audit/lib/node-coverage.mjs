// Which src lines the node product suites and the specification worlds run (AUDIT.md「変えた行の実行」). The product
// is built from the given src, run in node contexts under V8 block coverage, and each executed character is traced back
// through the pieces productScript joined to its src file and line. A line ran when a character on it, other than
// spacing, lies in a range that ran.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import inspector from 'node:inspector/promises';
import {fileURLToPath} from 'node:url';
import {productScript} from './source-boundaries.mjs';
import {suiteExpression} from './product-test-host.mjs';
import {nodeProductSuites} from './gate-case-contract.mjs';
import {snapshotCases, caseBehaviour, runLimited} from './behaviour-snapshot.mjs';
import {runLanguageInNode} from './language-suite.mjs';
// The language forms suite's name among the suites (audit/run-language-tests.mjs runs it with its checks).
export const languageSuiteName = 'language-forms';

const scriptName = 'akari-product.js';
const contextGlobals = () => ({console, TextEncoder, TextDecoder, Uint8Array, Uint32Array, ArrayBuffer, Blob, URL, structuredClone, crypto: crypto.webcrypto, setTimeout, clearTimeout});

// [file, line] for each offset of the joined script, by the files' own line numbers (a portable line counts in its host).
export function lineMap(text, pieces) {
  const next = {}, starts = [];
  for (const p of pieces) {
    if (p.host) { starts.push([p, 1]); next[p.host] = (next[p.host] ?? 1) + 1; continue; }
    const first = next[p.label] ?? 1;
    starts.push([p, first]);
    next[p.label] = first + text.slice(p.start, p.end).split('\n').length - 1;
  }
  return offset => {
    const entry = starts.find(([p]) => p.start <= offset && offset < p.end);
    if (!entry) return null;
    const [p, first] = entry;
    let line = first; for (let i = p.start; i < offset; i++) if (text[i] === '\n') line++;
    return [p.label, line];
  };
}

// file -> Set of lines that ran, for the product built from read (the html and its src must agree).
// "file:line" -> [start, end) offsets of that line in the joined script.
export function lineOffsets(text, pieces) {
  const index = new Map(), next = {};
  for (const p of pieces) {
    let line;
    if (p.host) { line = 1; next[p.host] = (next[p.host] ?? 1) + 1; } else line = next[p.label] ?? 1;
    let from = p.start;
    for (let i = p.start; i <= p.end; i++) {
      if (i === p.end || text.charCodeAt(i) === 10) { if (i > from || i < p.end) index.set(p.label + ':' + line, [from, i]); line++; from = i + 1; }
    }
    if (!p.host) next[p.label] = line - 1;
  }
  return (fileName, line) => index.get(fileName + ':' + line) ?? null;
}

// Lines that ran, per src file, for one coverage result.
function linesRan(result, text, pieces, shift) {
  const ran = new Uint8Array(text.length);
  for (const entry of result.filter(s => s.url === scriptName)) {
    const counts = new Int32Array(text.length).fill(-1);
    const ranges = entry.functions.flatMap(f => f.ranges).sort((a, b) => (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset));
    for (const r of ranges) counts.fill(r.count, Math.max(0, r.startOffset - shift), Math.max(0, Math.min(r.endOffset - shift, text.length)));
    for (let i = 0; i < text.length; i++) if (counts[i] > 0) ran[i] = 1;
  }
  const out = new Map(), next = {};
  for (const p of pieces) {
    let line;
    if (p.host) { line = 1; next[p.host] = (next[p.host] ?? 1) + 1; } else line = next[p.label] ?? 1;
    const lines = out.get(p.label) ?? new Set();
    for (let i = p.start; i < p.end; i++) {
      const ch = text.charCodeAt(i);
      if (ch === 10) { line++; continue; }
      if (ran[i] && ch !== 32 && ch !== 9 && ch !== 13) lines.add(line);
    }
    out.set(p.label, lines);
    if (!p.host) next[p.label] = line;
  }
  return out;
}

// {all, bySuite}: file -> Set of lines that ran, for every run together and per node product suite (the language forms
// suite too, and 'worlds' for the specification worlds), for the product built from read (the html and its src must agree).
export async function nodeCoverage(html, read) {
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const {text, pieces} = productScript(read), shift = script.length - text.length;
  if (shift < 0 || script.slice(shift) !== text) throw new Error('the product script is not the build of this src');
  const session = new inspector.Session();
  session.connect();
  const bySuite = new Map(), all = new Map();
  const take = async (name, body) => {
    await session.post('Profiler.startPreciseCoverage', {callCount: true, detailed: true});
    await body();
    const {result} = await session.post('Profiler.takePreciseCoverage');
    await session.post('Profiler.stopPreciseCoverage');
    const lines = linesRan(result, text, pieces, shift);
    bySuite.set(name, lines);
    for (const [f, set] of lines) { if (!all.has(f)) all.set(f, new Set()); for (const l of set) all.get(f).add(l); }
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
  return {all, bySuite, script, shift, lineOffsets: lineOffsets(text, pieces)};
}

// nodeCoverage in a child process (node audit/lib/node-coverage.mjs --run <page> <sources> <record>), stopped after
// limitMs. files names the source files read may give (the src and extensions files of the commit).
export function boundedCoverage(html, read, files, limitMs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akari-coverage-'));
  try {
    const page = path.join(dir, 'page.html'), sources = path.join(dir, 'sources.json'), record = path.join(dir, 'record.json');
    fs.writeFileSync(page, html);
    fs.writeFileSync(sources, JSON.stringify(Object.fromEntries(files.map(file => [file, read(file)]))));
    runLimited([fileURLToPath(import.meta.url), '--run', page, sources, record], limitMs, 'the coverage run');
    const raw = JSON.parse(fs.readFileSync(record, 'utf8')), sets = byFile => new Map(Object.entries(byFile).map(([file, lines]) => [file, new Set(lines)]));
    const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>')), {text, pieces} = productScript(read);
    return {all: sets(raw.all), bySuite: new Map(Object.entries(raw.bySuite).map(([name, byFile]) => [name, sets(byFile)])), script, shift: script.length - text.length, lineOffsets: lineOffsets(text, pieces)};
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === '--run') {
  const [page, sources, record] = process.argv.slice(3), texts = JSON.parse(fs.readFileSync(sources, 'utf8'));
  const {all, bySuite} = await nodeCoverage(fs.readFileSync(page, 'utf8'), file => { if (!Object.hasOwn(texts, file)) throw new Error('no source ' + file); return texts[file]; });
  const plain = byFile => Object.fromEntries([...byFile].map(([file, lines]) => [file, [...lines]]));
  fs.writeFileSync(record, JSON.stringify({all: plain(all), bySuite: Object.fromEntries([...bySuite].map(([name, byFile]) => [name, plain(byFile)]))}));
}
